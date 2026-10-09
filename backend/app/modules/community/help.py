"""Requests for help and offers of help on public pages (D3, docs/COMMUNITY_AGENT_PLAN.md 7.5).

A page owner chooses whether the page takes them. Followers post them in public, without contact details; replies are
private to the replier, the post's author and the page's owner and moderators, so contact details travel only there."""

from datetime import timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select, update

from app.errors import DomainError
from app.modules.community.models import (
    HELP_REPORT_REASONS, AccountBlock, HelpPost, HelpReply, HelpReport, PageFollow, PageModerator, PublicPage, TaxonomyTerm,
)
from app.modules.community.schemas import HelpPostOutcome, HelpPostView, HelpReplyView, HelpReportCount, HelpReportNote, HelpReportView
from app.modules.community.service import MAX_REPORTS_PER_DAY, CommunityService, not_found
from app.modules.community.taxonomy import unavailable
from app.modules.identity.models import User
from app.modules.spaces.schemas import Pagination

MAX_OPEN_POSTS = 5
MAX_POSTS_PER_DAY = 5
MAX_REPLIES_PER_DAY = 30
MAX_REPLIES_PER_POST = 200
NEED_BY_DAYS = 180
# Trust facts (D6) are facts only: an account younger than this is shown as new; nothing is scored.
NEW_ACCOUNT = timedelta(days=30)
# On a page with at least this many followers, a new account's post waits for the page's review (plan 10.3).
HOLD_FOLLOWERS = 50
LISTED = {"open": ("open",), "all": ("open", "helped", "closed")}


class HelpService(CommunityService):
    def help_etag(self, post):
        return f'"{self.security.digest("help.post", post.id, str(post.version))}"'

    def manages(self, database, user, page, lock=False):
        return user is not None and (page.owner_id == user.id or self.active_moderator(database, user, page.id, lock=lock) is not None)

    @staticmethod
    def blocked_by(database, blocker_id, account_id):
        return blocker_id != account_id and database.scalar(select(AccountBlock.id).where(
            AccountBlock.blocker_id == blocker_id, AccountBlock.target_type == "account", AccountBlock.target_id == account_id,
        )) is not None

    def is_new(self, author):
        return author.created_at > self.clock() - NEW_ACCOUNT

    def views(self, database, rows, viewer):
        ids = [post.id for post, _page, _author in rows]
        managed = {}
        for _post, page, _author in rows:
            if page.id not in managed:
                managed[page.id] = self.manages(database, viewer, page)
        replied, reported, reports = set(), set(), {}
        if viewer is not None and ids:
            replied = set(database.scalars(select(HelpReply.post_id).where(
                HelpReply.post_id.in_(ids), HelpReply.author_id == viewer.id, HelpReply.status == "active",
            )))
            reported = set(database.scalars(select(HelpReport.post_id).where(
                HelpReport.post_id.in_(ids), HelpReport.reporter_id == viewer.id, HelpReport.status == "received",
            )))
            reviewed = [post.id for post, page, _author in rows if managed[page.id]]
            if reviewed:
                counted = database.execute(select(HelpReport.post_id, HelpReport.reason, func.count()).where(
                    HelpReport.post_id.in_(reviewed), HelpReport.status == "received",
                ).group_by(HelpReport.post_id, HelpReport.reason)).all()
                for post_id, reason, count in sorted(counted, key=lambda row: HELP_REPORT_REASONS.index(row[1])):
                    reports.setdefault(post_id, []).append(HelpReportCount(reason=reason, count=count))
        views = []
        for post, page, author in rows:
            mine = viewer is not None and post.author_id == viewer.id
            insider = mine or managed[page.id]
            views.append(HelpPostView(
                id=post.id, page_id=page.id, page_handle=page.handle, page_name=page.name, kind=post.kind, title=post.title,
                details=post.details, place=post.place, need_by=post.need_by, status=post.status, author_name=author.display_name,
                author_new=self.is_new(author),
                reply_count=post.reply_count, created_at=post.created_at, updated_at=post.updated_at, ended_at=post.ended_at,
                mine=mine, can_manage=managed[page.id], replied=post.id in replied, reported=post.id in reported,
                reports=reports.get(post.id, []) if managed[page.id] else None,
                helped_reply_id=post.helped_reply_id if insider else None, etag=self.help_etag(post) if insider else None,
            ))
        return views

    def view(self, database, post, page, viewer):
        return self.views(database, [(post, page, database.get(User, post.author_id))], viewer)[0]

    def reply_view(self, reply, author, viewer, post):
        return HelpReplyView(
            id=reply.id, post_id=reply.post_id, author_name=author.display_name, author_new=self.is_new(author), body=reply.body,
            status=reply.status, created_at=reply.created_at, ended_at=reply.ended_at, mine=reply.author_id == viewer.id,
            helped=post.helped_reply_id == reply.id,
        )

    def visible(self, database, viewer, post_id):
        post = database.get(HelpPost, post_id)
        if post is None or post.status == "deleted":
            raise not_found("Help post")
        page = self.find_page(database, post.page_id, viewer=viewer)
        if viewer is None or post.author_id != viewer.id:
            manager = self.manages(database, viewer, page)
            hidden = (post.status in ("removed", "pending") and not manager) or post.author_id in self.blocked(database, viewer, "account")
            if hidden or (not manager and page.id in self.blocked(database, viewer, "page")):
                raise not_found("Help post")
        return post, page

    def locked(self, database, user, post_id):
        """Locks the page, then the post: the order every community change uses."""
        page_id = database.scalar(select(HelpPost.page_id).where(HelpPost.id == post_id))
        if page_id is None:
            raise not_found("Help post")
        page = self.find_page(database, page_id, lock=True, viewer=user)
        post = database.scalar(select(HelpPost).where(HelpPost.id == post_id).with_for_update().execution_options(populate_existing=True))
        mine = post.author_id == user.id
        if post.status == "deleted" or (post.status in ("removed", "pending") and not mine and not self.manages(database, user, page)):
            raise not_found("Help post")
        return post, page

    def create(self, token, page_ref, body, key):
        digest = self.security.digest(
            "help.post.create", page_ref, body.kind, body.title, body.details, body.place or "", body.need_by.isoformat() if body.need_by else "",
        )
        with self.identity.signed_in_write(token) as (database, user):
            page = self.find_page(database, page_ref, lock=True, viewer=user)
            existing = database.scalar(select(HelpPost).where(HelpPost.author_id == user.id, HelpPost.creation_key == key))
            if existing is not None:
                if existing.creation_digest != digest or existing.page_id != page.id:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original request or offer.")
                if existing.status == "deleted":
                    raise not_found("Help post")
                return self.view(database, existing, page, user)
            self.writable(page)
            self.open_for_new_content(page)
            if not page.help_open:
                raise DomainError(409, "HELP_CLOSED", "This page does not take requests or offers.")
            if not self.manages(database, user, page) and database.get(PageFollow, (page.id, user.id)) is None:
                raise DomainError(403, "FOLLOW_REQUIRED", "Follow this page to post a request or an offer.")
            if self.blocked_by(database, page.owner_id, user.id):
                raise DomainError(403, "POSTING_UNAVAILABLE", "You cannot post on this page.")
            if body.place is not None:
                term = database.get(TaxonomyTerm, ("place", body.place))
                if term is None or term.status != "active":
                    raise unavailable("place", [body.place])
            now = self.clock()
            if body.need_by is not None:
                today = now.astimezone(ZoneInfo(user.timezone)).date()
                if not today <= body.need_by <= today + timedelta(days=NEED_BY_DAYS):
                    raise DomainError(422, "NEED_BY_OUT_OF_RANGE", f"Choose a day from today to {NEED_BY_DAYS} days ahead.")
            authored = select(func.count()).select_from(HelpPost).where(HelpPost.author_id == user.id)
            if database.scalar(authored.where(HelpPost.status.in_(("open", "pending")))) >= MAX_OPEN_POSTS:
                raise DomainError(409, "HELP_OPEN_LIMIT", f"You can have {MAX_OPEN_POSTS} open requests and offers. Close one first.")
            if database.scalar(authored.where(HelpPost.created_at > now - timedelta(days=1))) >= MAX_POSTS_PER_DAY:
                raise DomainError(429, "HELP_RATE_LIMITED", "You posted several requests and offers today. Try again tomorrow.",
                                  retry_after=3600)
            held = page.follower_count >= HOLD_FOLLOWERS and self.is_new(user) and not self.manages(database, user, page)
            post = HelpPost(
                id=str(uuid4()), page_id=page.id, author_id=user.id, kind=body.kind, title=body.title, details=body.details,
                place=body.place, need_by=body.need_by, status="pending" if held else "open", reply_count=0, version=1, creation_key=key,
                creation_digest=digest, created_at=now, updated_at=now,
            )
            database.add(post)
            database.flush()
            self.record(database, user.id, page.id, post.id, "public.help_posted", audited=False)
            return self.view(database, post, page, user)

    def read(self, token, post_id):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            post, page = self.visible(database, viewer, post_id)
            return self.view(database, post, page, viewer)

    def page_posts(self, token, page_ref, state, kind, limit, cursor):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            page = self.find_page(database, page_ref, viewer=viewer)
            if not self.manages(database, viewer, page) and page.id in self.blocked(database, viewer, "page"):
                return [], Pagination(next_cursor=None, has_more=False)
            statement = select(HelpPost, PublicPage, User).join(PublicPage, PublicPage.id == HelpPost.page_id).join(
                User, User.id == HelpPost.author_id,
            ).where(HelpPost.page_id == page.id)
            if self.manages(database, viewer, page):
                statement = statement.where(HelpPost.status.in_((*LISTED[state], "pending")))
            elif viewer is not None:
                statement = statement.where(or_(
                    HelpPost.status.in_(LISTED[state]), and_(HelpPost.status == "pending", HelpPost.author_id == viewer.id),
                ))
            else:
                statement = statement.where(HelpPost.status.in_(LISTED[state]))
            if kind is not None:
                statement = statement.where(HelpPost.kind == kind)
            hidden = self.blocked(database, viewer, "account")
            if hidden:
                statement = statement.where(HelpPost.author_id.notin_(hidden))
            scope = f"{page.id}:{state}:{kind or 'any'}"
            rows, more = self.newest_first(database, statement, HelpPost.created_at, HelpPost.id, limit, cursor, "help_posts", viewer, scope)
            next_cursor = self.seal_cursor("help_posts", viewer, scope, rows[-1][0].id, after_time=rows[-1][0].created_at) if more else None
            return self.views(database, [tuple(row) for row in rows], viewer), Pagination(next_cursor=next_cursor, has_more=more)

    def mine(self, token, limit, cursor):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            statement = select(HelpPost, PublicPage, User).join(PublicPage, PublicPage.id == HelpPost.page_id).join(
                User, User.id == HelpPost.author_id,
            ).where(HelpPost.author_id == user.id, HelpPost.status != "deleted")
            rows, more = self.newest_first(database, statement, HelpPost.created_at, HelpPost.id, limit, cursor, "my_help_posts", user, user.id)
            next_cursor = self.seal_cursor("my_help_posts", user, user.id, rows[-1][0].id, after_time=rows[-1][0].created_at) if more else None
            return self.views(database, [tuple(row) for row in rows], user), Pagination(next_cursor=next_cursor, has_more=more)

    def review_queue(self, token):
        """Posts on pages the person runs that wait for approval or have open reports, oldest first."""
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            managed = select(PublicPage.id).where(PublicPage.owner_id == user.id).union(
                select(PageModerator.page_id).where(PageModerator.account_id == user.id, PageModerator.status == "active"),
            )
            reported = select(HelpReport.post_id).where(HelpReport.status == "received")
            rows = database.execute(select(HelpPost, PublicPage, User).join(PublicPage, PublicPage.id == HelpPost.page_id).join(
                User, User.id == HelpPost.author_id,
            ).where(
                HelpPost.page_id.in_(managed), PublicPage.status.in_(("active", "read_only")),
                or_(HelpPost.status == "pending", and_(HelpPost.status.in_(("open", "helped", "closed")), HelpPost.id.in_(reported))),
            ).order_by(HelpPost.created_at, HelpPost.id).limit(50)).all()
            return self.views(database, [tuple(row) for row in rows], user)

    def resolve(self, token, post_id, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.locked(database, user, post_id)
            if post.author_id != user.id:
                raise DomainError(403, "HELP_POST_NOT_YOURS", "Only the person who posted it can close it.")
            self.writable(page)
            self.require_etag(etag, self.help_etag(post), "request or offer")
            if post.status == "pending":
                raise DomainError(409, "HELP_POST_PENDING", "This post is waiting for the page's review.")
            if post.status != "open":
                raise DomainError(409, "HELP_POST_ENDED", "This request or offer is already closed.")
            reply_id = str(body.reply_id) if body.reply_id else None
            if reply_id is not None:
                reply = database.get(HelpReply, reply_id)
                if reply is None or reply.post_id != post.id or reply.status != "active":
                    raise DomainError(409, "HELP_REPLY_UNAVAILABLE", "Choose a current reply to this post.")
            now = self.clock()
            post.status = body.outcome
            post.helped_reply_id = reply_id
            post.ended_at = now
            post.updated_at = now
            post.version += 1
            database.flush()
            self.record(database, user.id, page.id, post.id, f"public.help_{body.outcome}", audited=False)
            return self.view(database, post, page, user)

    def end_post(self, token, post_id, etag, removing):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.locked(database, user, post_id)
            if removing:
                if not self.manages(database, user, page, lock=True):
                    raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner or a moderator can remove it.")
            elif post.author_id != user.id:
                raise DomainError(403, "HELP_POST_NOT_YOURS", "Only the person who posted it can delete it.")
            self.require_etag(etag, self.help_etag(post), "request or offer")
            if not (removing and post.status == "removed"):
                now = self.clock()
                # The private replies were about this post, so they end with it.
                database.execute(update(HelpReply).where(HelpReply.post_id == post.id, HelpReply.status == "active").values(
                    status="removed", body=None, ended_at=now,
                ))
                self.close_reports(database, post, "removed" if removing else "deleted", now)
                post.status = "removed" if removing else "deleted"
                post.details = None
                post.helped_reply_id = None
                post.reply_count = 0
                if not removing:
                    post.title, post.place, post.need_by = None, None, None
                post.ended_at = post.ended_at or now
                post.updated_at = now
                post.version += 1
                database.flush()
                self.record(database, user.id, page.id, post.id, f"public.help_{post.status}", audited=removing)
            if removing:
                return self.view(database, post, page, user)
            return HelpPostOutcome(id=post.id, status="deleted")

    def reply(self, token, post_id, body, key):
        digest = self.security.digest("help.reply.create", post_id, body.body)
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.locked(database, user, post_id)
            if post.author_id != user.id and (post.author_id in self.blocked(database, user, "account") or (
                not self.manages(database, user, page) and page.id in self.blocked(database, user, "page")
            )):
                raise not_found("Help post")
            existing = database.scalar(select(HelpReply).where(HelpReply.author_id == user.id, HelpReply.creation_key == key))
            if existing is not None:
                if existing.creation_digest != digest or existing.post_id != post.id:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original reply.")
                return self.reply_view(existing, user, user, post)
            if post.author_id == user.id:
                raise DomainError(409, "OWN_HELP_POST", "You cannot reply to your own request or offer.")
            if post.status == "pending":
                raise DomainError(409, "HELP_POST_PENDING", "This post is waiting for the page's review.")
            if post.status != "open":
                raise DomainError(409, "HELP_POST_ENDED", "This request or offer is closed.")
            self.writable(page)
            self.open_for_new_content(page)
            if self.blocked_by(database, post.author_id, user.id) or self.blocked_by(database, page.owner_id, user.id):
                raise DomainError(403, "REPLYING_UNAVAILABLE", "You cannot reply to this post.")
            if database.scalar(select(HelpReply.id).where(
                HelpReply.post_id == post.id, HelpReply.author_id == user.id, HelpReply.status == "active",
            )) is not None:
                raise DomainError(409, "HELP_REPLY_EXISTS", "You already replied. Withdraw that reply to send another.")
            now = self.clock()
            recent = database.scalar(select(func.count()).select_from(HelpReply).where(
                HelpReply.author_id == user.id, HelpReply.created_at > now - timedelta(days=1),
            ))
            if recent >= MAX_REPLIES_PER_DAY:
                raise DomainError(429, "HELP_REPLY_RATE_LIMITED", "You replied many times today. Try again tomorrow.", retry_after=3600)
            if database.scalar(select(func.count()).select_from(HelpReply).where(HelpReply.post_id == post.id)) >= MAX_REPLIES_PER_POST:
                raise DomainError(409, "HELP_REPLY_LIMIT_REACHED", "This post reached the local reply limit.")
            reply = HelpReply(
                id=str(uuid4()), post_id=post.id, author_id=user.id, body=body.body, status="active",
                creation_key=key, creation_digest=digest, created_at=now,
            )
            post.reply_count += 1
            database.add(reply)
            database.flush()
            self.record(database, user.id, page.id, reply.id, "public.help_replied", audited=False)
            return self.reply_view(reply, user, user, post)

    def replies(self, token, post_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            post, page = self.visible(database, user, post_id)
            statement = select(HelpReply, User).join(User, User.id == HelpReply.author_id).where(HelpReply.post_id == post.id)
            if post.author_id == user.id or self.manages(database, user, page):
                statement = statement.where(or_(HelpReply.status == "active", HelpReply.id == post.helped_reply_id))
                hidden = self.blocked(database, user, "account")
                if hidden:
                    statement = statement.where(HelpReply.author_id.notin_(hidden))
            else:
                statement = statement.where(HelpReply.author_id == user.id)
            rows = database.execute(statement.order_by(HelpReply.created_at, HelpReply.id).limit(MAX_REPLIES_PER_POST)).all()
            return [self.reply_view(reply, author, user, post) for reply, author in rows]

    def end_reply(self, token, reply_id):
        with self.identity.signed_in_write(token) as (database, user):
            post_id = database.scalar(select(HelpReply.post_id).where(HelpReply.id == reply_id))
            if post_id is None:
                raise not_found("Reply")
            post, page = self.locked(database, user, post_id)
            reply = database.scalar(select(HelpReply).where(HelpReply.id == reply_id).with_for_update().execution_options(populate_existing=True))
            mine = reply.author_id == user.id
            # The post's author may clear a reply from their own post; others' replies stay private, so a stranger sees nothing.
            if not mine and post.author_id != user.id and not self.manages(database, user, page, lock=True):
                raise not_found("Reply")
            self.writable(page)
            if reply.status == "active":
                reply.status = "withdrawn" if mine else "removed"
                reply.body = None
                reply.ended_at = self.clock()
                post.reply_count -= 1
                database.flush()
                self.record(database, user.id, page.id, reply.id, f"public.help_reply_{reply.status}", audited=not mine)
            return self.reply_view(reply, database.get(User, reply.author_id), user, post)

    @staticmethod
    def close_reports(database, post, outcome, now):
        database.execute(update(HelpReport).where(HelpReport.post_id == post.id, HelpReport.status == "received").values(
            status="closed", outcome=outcome, closed_at=now,
        ))

    def report(self, token, post_id, body):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.locked(database, user, post_id)
            self.visible(database, user, post.id)
            if post.author_id == user.id:
                raise DomainError(409, "OWN_CONTENT", "You cannot report your own request or offer.")
            if post.status == "removed":
                raise DomainError(409, "HELP_POST_ENDED", "This request or offer was already removed.")
            existing = database.scalar(select(HelpReport).where(
                HelpReport.post_id == post.id, HelpReport.reporter_id == user.id, HelpReport.status == "received",
            ))
            if existing is None:
                now = self.clock()
                recent = database.scalar(select(func.count()).select_from(HelpReport).where(
                    HelpReport.reporter_id == user.id, HelpReport.created_at > now - timedelta(days=1),
                ))
                if recent >= MAX_REPORTS_PER_DAY:
                    raise DomainError(429, "REPORT_RATE_LIMITED", "You reached the daily report limit. Try again tomorrow.", retry_after=3600)
                existing = HelpReport(
                    id=str(uuid4()), post_id=post.id, reporter_id=user.id, reason=body.reason, details=body.details,
                    status="received", created_at=now,
                )
                database.add(existing)
                database.flush()
                self.record(database, user.id, page.id, existing.id, "safety.help_report_received", audited=False)
            return HelpReportView(
                id=existing.id, post_id=post.id, reason=existing.reason, status=existing.status, created_at=existing.created_at,
            )

    def report_notes(self, token, post_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            post, page = self.visible(database, user, post_id)
            if not self.manages(database, user, page):
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner or a moderator can read reports.")
            rows = database.scalars(select(HelpReport).where(HelpReport.post_id == post.id, HelpReport.status == "received")
                                    .order_by(HelpReport.created_at, HelpReport.id).limit(200)).all()
            return [HelpReportNote(id=row.id, reason=row.reason, details=row.details or None, created_at=row.created_at) for row in rows]

    def approve(self, token, post_id, etag):
        """A page manager lets a post that waited for review appear to everyone."""
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.locked(database, user, post_id)
            if not self.manages(database, user, page, lock=True):
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner or a moderator can approve it.")
            self.require_etag(etag, self.help_etag(post), "request or offer")
            if post.status != "pending":
                raise DomainError(409, "HELP_POST_NOT_PENDING", "This post is not waiting for review.")
            post.status = "open"
            post.updated_at = self.clock()
            post.version += 1
            database.flush()
            self.record(database, user.id, page.id, post.id, "public.help_approved", audited=True)
            return self.view(database, post, page, user)

    def keep(self, token, post_id, body, etag):
        """A page manager reviewed the open reports and keeps the post; reports that arrived since stop the change."""
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.locked(database, user, post_id)
            if not self.manages(database, user, page, lock=True):
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner or a moderator can review reports.")
            self.require_etag(etag, self.help_etag(post), "request or offer")
            waiting = database.scalar(select(func.count()).select_from(HelpReport).where(
                HelpReport.post_id == post.id, HelpReport.status == "received",
            ))
            if waiting != body.reports:
                raise DomainError(409, "REPORTS_CHANGED", "The reports changed while you were reviewing them. Look at them again.")
            self.close_reports(database, post, "kept", self.clock())
            database.flush()
            self.record(database, user.id, page.id, post.id, "public.help_reports_kept", audited=True)
            return self.view(database, post, page, user)
