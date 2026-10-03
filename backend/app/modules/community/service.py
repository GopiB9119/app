from datetime import timedelta
from uuid import UUID, uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, delete, exists, func, or_, select, tuple_
from sqlalchemy.exc import IntegrityError

from app.errors import DomainError
from app.modules.community.models import (
    AccountBlock,
    CommunityAuditEvent,
    ContentReport,
    FeedControl,
    PageFollow,
    PageHandover,
    PageModerator,
    PageTerm,
    PostComment,
    PostReaction,
    PostTerm,
    PublicPage,
    PublicPost,
    SavedPost,
    TaxonomyTerm,
)
from app.modules.community.schemas import (
    BlockOutcome,
    BlockView,
    ClassificationView,
    CommentView,
    CommunityCursor,
    FeedControlOutcome,
    FeedControlView,
    HandoverView,
    InsightPeriod,
    InterestPost,
    InterestsView,
    LimitMark,
    ModerationMark,
    ModeratorRoleView,
    ModeratorView,
    PageInsights,
    PageView,
    PostOutcome,
    PostView,
    ReportView,
    SuggestedPage,
    Suggestions,
)
from app.modules.community.taxonomy import (
    PERSON_FIELDS,
    POST_FIELDS,
    RANKING,
    Matcher,
    Vocabulary,
    canonical,
    classifications,
    classify,
    filtered,
    interests_of,
    post_terms_of,
    save_interests,
    searched_terms,
    tag_post,
    term_views,
    unavailable,
)
from app.modules.identity.models import AccountSession, OutboxEvent, User
from app.modules.spaces.schemas import Pagination

MAX_PAGES_PER_OWNER = 5
MAX_DRAFTS_PER_PAGE = 50
MAX_POSTS_PER_PAGE = 2000
MAX_COMMENTS_PER_POST = 5000
MAX_COMMENTS_PER_MINUTE = 20
MAX_REPORTS_PER_DAY = 30
MAX_BLOCKS = 500
MAX_FOLLOWS = 1000
MAX_SAVED = 1000
MAX_PINNED_POSTS = 3
MAX_MODERATORS = 10
MAX_FEED_CONTROLS = {"mute_page": 200, "mute_term": 100, "hide_post": 1000, "hide_suggestion": 500}
# Archived pages stay readable by everyone, so what is on them can still be reported and hidden (T109).
PUBLIC_PAGE_STATES = ("active", "read_only")
CURSOR_MINUTES = 15
MODERATOR_INVITE_LIFETIME = timedelta(hours=72)
HANDOVER_OFFER_LIFETIME = timedelta(minutes=15)
HANDOVER_AUTH_MAX_AGE = timedelta(minutes=15)
PAGE_PURGE_GRACE = timedelta(days=7)
INSIGHT_PERIOD = timedelta(days=7)
INSIGHT_PERIODS = 8


def not_found(subject):
    return DomainError(404, "NOT_FOUND", f"{subject} not found.")


def is_uuid(value):
    try:
        return str(UUID(value)) == value.lower()
    except (ValueError, AttributeError, TypeError):
        return False


def contains(text):
    # Search words are literal: % and _ match only themselves.
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


class CommunityService:
    """Public pages and posts. Private Space, chat, task and care data never enter these queries."""

    def __init__(self, identity):
        self.identity = identity
        self.sessions = identity.sessions
        self.security = identity.security
        self.clock = identity.clock

    # Shared helpers

    def viewer(self, database, token, lock=False):
        if token is None:
            return None
        user, _session = self.identity.authenticate(database, token, lock=lock)
        return user

    def page_etag(self, page):
        return f'"{self.security.digest("public.page", page.id, str(page.version))}"'

    def post_etag(self, post):
        return f'"{self.security.digest("public.post", post.id, str(post.version))}"'

    @staticmethod
    def require_etag(supplied, expected, subject):
        if not supplied:
            raise DomainError(428, "PRECONDITION_REQUIRED", f"Review the current {subject} first.")
        if supplied != expected:
            raise DomainError(412, "CONTENT_CHANGED", f"This {subject} changed since you reviewed it. Reload to continue.")

    @staticmethod
    def blocked(database, viewer, target_type):
        if viewer is None:
            return set()
        return set(database.scalars(select(AccountBlock.target_id).where(
            AccountBlock.blocker_id == viewer.id, AccountBlock.target_type == target_type,
        )))

    def record(self, database, actor_id, page_id, target_id, action, audited=True):
        identifier = str(uuid4())
        now = self.clock()
        if audited:
            database.add(CommunityAuditEvent(id=identifier, actor_id=actor_id, page_id=page_id, target_id=target_id, action=action, created_at=now))
        database.add(OutboxEvent(id=identifier, event_type=action, actor_id=actor_id, aggregate_id=target_id, schema_version=1, created_at=now))

    @staticmethod
    def can_view_page(page, viewer):
        if page.status in ("active", "read_only"):
            return True
        # A deleted page stays reachable to its owner until it is erased; 'archived' is the account-deletion state
        # (T68) whose erased pages stay invisible to everyone.
        if page.status == "deleted":
            return viewer is not None and page.owner_id == viewer.id and page.purge_after is not None
        return False

    @staticmethod
    def present_pages(account_id):
        """Pages that still exist for their owner: active, read only, or deleted and not yet erased."""
        return and_(
            PublicPage.owner_id == account_id,
            or_(
                PublicPage.status.in_(("active", "read_only")),
                and_(PublicPage.status == "deleted", PublicPage.purge_after.is_not(None)),
            ),
        )

    @staticmethod
    def writable(page):
        if page.status == "read_only":
            raise DomainError(409, "PAGE_READ_ONLY", "This page is read only. The owner can restore it.")
        if page.status == "deleted":
            raise DomainError(409, "PAGE_DELETED", "This page is deleted. The owner can restore it within seven days.")

    @staticmethod
    def open_for_new_content(page):
        """A page a platform moderator hid (suspended) or limited takes no new posts or comments (DEC-040)."""
        if page.moderation_hidden_at is not None:
            raise DomainError(409, "PAGE_SUSPENDED", "Nothing new can be posted or commented on this page while it is hidden.")
        if page.moderation_limited_at is not None:
            raise DomainError(409, "PAGE_LIMITED", "New posts and comments are paused on this page.")

    def active_moderator(self, database, user, page_id, lock=False):
        if user is None:
            return None
        statement = select(PageModerator).where(
            PageModerator.page_id == page_id, PageModerator.account_id == user.id, PageModerator.status == "active",
        )
        return database.scalar(statement.with_for_update() if lock else statement)

    def moderator_etag(self, row):
        return '"' + self.security.digest("public.moderator", row.id, str(row.version), row.status) + '"'

    def moderator_state(self, database, row, page):
        if row.status != "pending":
            return row.status
        if row.expires_at <= self.clock():
            return "expired"
        invitee = database.get(User, row.account_id, populate_existing=True)
        if (page.status != "active" or page.owner_id != row.invited_by_id
                or invitee is None or invitee.status != "active" or invitee.verified_at is None):
            return "invalidated"
        return "pending"

    def moderator_view(self, database, row):
        invitee = database.get(User, row.account_id)
        return ModeratorView(
            id=row.id, page_id=row.page_id, account_id=row.account_id, display_name=invitee.display_name,
            status=row.status, created_at=row.created_at, expires_at=row.expires_at, resolved_at=row.resolved_at,
            etag=self.moderator_etag(row),
        )

    def handover_etag(self, offer):
        return '"' + self.security.digest("public.handover", offer.id, str(offer.version), offer.status) + '"'

    def handover_state(self, database, offer, page):
        if offer.status != "pending":
            return offer.status
        if offer.expires_at <= self.clock():
            return "expired"
        session = database.get(AccountSession, offer.from_session_id, populate_existing=True)
        recipient = database.scalar(select(PageModerator).where(
            PageModerator.page_id == offer.page_id, PageModerator.account_id == offer.to_account_id,
            PageModerator.status == "active",
        ))
        if (page.status != "active" or page.version != offer.source_version or page.owner_id != offer.from_account_id
                or recipient is None or session is None or session.account_id != offer.from_account_id
                or session.revoked_at is not None or session.expires_at <= self.clock()):
            return "invalidated"
        return "pending"

    def handover_view(self, database, offer, page):
        sender = database.get(User, offer.from_account_id)
        recipient = database.get(User, offer.to_account_id)
        return HandoverView(
            id=offer.id, page_id=page.id, page_handle=page.handle, page_name=page.name,
            from_account_id=offer.from_account_id, from_name=sender.display_name,
            to_account_id=offer.to_account_id, to_name=recipient.display_name,
            status=self.handover_state(database, offer, page),
            created_at=offer.created_at, expires_at=offer.expires_at, resolved_at=offer.resolved_at,
            etag=self.handover_etag(offer),
        )

    def recent(self, database, token):
        caller, session = self.identity.authenticate(database, token, lock=True)
        if self.clock() - session.created_at > HANDOVER_AUTH_MAX_AGE:
            raise DomainError(403, "REAUTHENTICATION_REQUIRED", "Sign in again before changing who owns the page.")
        return caller, session

    def seal_cursor(self, kind, viewer, scope, after_id, after_time=None, after_number=None):
        return self.security.seal(CommunityCursor(
            kind=kind, account_id=viewer.id if viewer else None, scope=scope, after_time=after_time,
            after_number=after_number, after_id=after_id, expires_at=self.clock() + timedelta(minutes=CURSOR_MINUTES),
        ).model_dump_json())

    def open_cursor(self, cursor, kind, viewer, scope):
        try:
            position = CommunityCursor.model_validate_json(self.security.open(cursor))
        except (InvalidToken, ValueError, TypeError):
            raise DomainError(400, "CURSOR_INVALID", "Reload the list.") from None
        if position.kind != kind or position.account_id != (viewer.id if viewer else None) or position.scope != scope:
            raise DomainError(400, "CURSOR_INVALID", "Reload the list.")
        if position.expires_at <= self.clock():
            raise DomainError(410, "CURSOR_EXPIRED", "Reload the list.")
        return position

    def newest_first(self, database, statement, time_column, id_column, limit, cursor, kind, viewer, scope):
        if cursor:
            position = self.open_cursor(cursor, kind, viewer, scope)
            if position.after_time is None:
                raise DomainError(400, "CURSOR_INVALID", "Reload the list.")
            statement = statement.where(or_(
                time_column < position.after_time,
                and_(time_column == position.after_time, id_column < position.after_id),
            ))
        rows = database.execute(statement.order_by(time_column.desc(), id_column.desc()).limit(limit + 1)).all()
        return rows[:limit], len(rows) > limit

    @staticmethod
    def moderation_visible(model, viewer):
        public = model.moderation_hidden_at.is_(None)
        if viewer is None:
            return public
        # Hidden content stays visible only to its author, so a page's later owner does not see an earlier owner's hidden post (T109).
        author = model.owner_id if model is PublicPage else model.author_id
        return or_(public, author == viewer.id)

    @staticmethod
    def discoverable(viewer):
        """A limited page leaves Discover for everyone but its owner (DEC-040)."""
        open_page = PublicPage.moderation_limited_at.is_(None)
        return open_page if viewer is None else or_(open_page, PublicPage.owner_id == viewer.id)

    @staticmethod
    def can_view_moderated(target, viewer, page=None):
        if target.moderation_hidden_at is None:
            return True
        if viewer is None:
            return False
        author_id = target.owner_id if isinstance(target, PublicPage) else target.author_id
        return author_id == viewer.id

    @staticmethod
    def is_pinned(post):
        return post.status == "published" and post.pinned_at is not None

    @staticmethod
    def moderation_mark(database, target, viewer, page=None):
        from app.modules.safety.models import ModerationDecision

        if target.moderation_hidden_at is None or not CommunityService.can_view_moderated(target, viewer, page):
            return None
        decision = database.get(ModerationDecision, target.moderation_decision_id)
        return ModerationMark(reason=decision.reason)

    @staticmethod
    def limit_mark(database, page, viewer):
        from app.modules.safety.models import ModerationDecision

        if page.moderation_limited_at is None or viewer is None or page.owner_id != viewer.id:
            return None
        return LimitMark(reason=database.get(ModerationDecision, page.moderation_limit_decision_id).reason)

    def page_view(self, database, page, viewer, following=None, blocked=None, classification=None):
        manager = viewer is not None and page.owner_id == viewer.id
        if viewer is not None and following is None:
            following = database.get(PageFollow, (page.id, viewer.id)) is not None
        if viewer is not None and blocked is None:
            blocked = page.id in self.blocked(database, viewer, "page")
        if classification is None:
            classification = classifications(database, [page.id])[page.id]
        return PageView(
            id=page.id, handle=page.handle, name=page.name, description=page.description, rules=page.rules, topic=page.topic,
            classification=ClassificationView(**classification),
            status=page.status, purge_after=page.purge_after if manager else None,
            follower_count=page.follower_count, created_at=page.created_at, updated_at=page.updated_at,
            following=bool(following), blocked=bool(blocked), can_manage=manager,
            etag=self.page_etag(page) if manager else None,
            moderation=self.moderation_mark(database, page, viewer),
            limited=page.moderation_limited_at is not None, limit=self.limit_mark(database, page, viewer),
        )

    def page_views(self, database, pages, viewer):
        ids = [page.id for page in pages]
        followed = set()
        if viewer is not None and ids:
            followed = set(database.scalars(select(PageFollow.page_id).where(PageFollow.account_id == viewer.id, PageFollow.page_id.in_(ids))))
        blocked = self.blocked(database, viewer, "page")
        classified = classifications(database, ids)
        return [
            self.page_view(database, page, viewer, page.id in followed, page.id in blocked, classified[page.id]) for page in pages
        ]

    def post_views(self, database, rows, viewer):
        ids = [post.id for post, _page in rows]
        liked, saved = set(), set()
        if viewer is not None and ids:
            liked = set(database.scalars(select(PostReaction.post_id).where(PostReaction.account_id == viewer.id, PostReaction.post_id.in_(ids))))
            saved = set(database.scalars(select(SavedPost.post_id).where(SavedPost.account_id == viewer.id, SavedPost.post_id.in_(ids))))
        hidden_counts = dict(database.execute(select(PostComment.post_id, func.count()).where(
            PostComment.post_id.in_(ids), PostComment.status == "visible", PostComment.moderation_hidden_at.is_not(None),
            *([PostComment.author_id != viewer.id] if viewer is not None else []),
        ).group_by(PostComment.post_id)).all()) if ids else {}
        subjects = post_terms_of(database, ids)
        views = []
        for post, page in rows:
            manager = viewer is not None and page.owner_id == viewer.id
            views.append(PostView(
                id=post.id, page_id=page.id, page_handle=page.handle, page_name=page.name, page_status=page.status,
                page_limited=page.moderation_limited_at is not None,
                title=post.title,
                body=post.body, status=post.status, like_count=post.like_count,
                comment_count=post.comment_count - hidden_counts.get(post.id, 0),
                created_at=post.created_at, published_at=post.published_at, edited_at=post.edited_at,
                liked=post.id in liked, saved=post.id in saved, pinned=self.is_pinned(post), can_manage=manager,
                etag=self.post_etag(post) if manager else None,
                topics=subjects[post.id]["topics"], interests=subjects[post.id]["interests"],
                moderation=self.moderation_mark(database, post, viewer, page),
            ))
        return views

    def find_page(self, database, reference, lock=False, viewer=None):
        column = PublicPage.id if is_uuid(reference) else PublicPage.handle
        statement = select(PublicPage).where(column == reference.lower()).execution_options(populate_existing=True)
        page = database.scalar(statement.with_for_update() if lock else statement)
        if page is None or not self.can_view_page(page, viewer) or not self.can_view_moderated(page, viewer):
            raise not_found("Page")
        return page

    def managed_page(self, database, user, page_id):
        page = self.find_page(database, page_id, lock=True, viewer=user)
        if page.owner_id != user.id:
            raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner can do this.")
        return page

    def visible_post(self, database, viewer, post_id, lock=False, drafts=False):
        statement = select(PublicPost, PublicPage).join(PublicPage, PublicPage.id == PublicPost.page_id).where(PublicPost.id == post_id)
        if lock:
            statement = statement.with_for_update(of=PublicPost)
        row = database.execute(statement.execution_options(populate_existing=True)).first()
        if row is None:
            raise not_found("Post")
        post, page = row
        if lock:
            # The joined page comes from the snapshot taken before waiting for the post's lock; read the one committed since (T115).
            page = database.scalar(select(PublicPage).where(PublicPage.id == post.page_id).execution_options(populate_existing=True))
        manager = viewer is not None and page.owner_id == viewer.id
        hidden = not self.can_view_page(page, viewer) or post.status == "deleted" or (post.status == "draft" and not (drafts and manager))
        hidden = hidden or not self.can_view_moderated(page, viewer) or not self.can_view_moderated(post, viewer, page)
        if hidden or (not manager and page.id in self.blocked(database, viewer, "page")):
            raise not_found("Post")
        return post, page

    # Pages

    def create_page(self, token, body, key):
        requested = body.classification.requested() if body.classification is not None else {}
        # Only a page created with a classification adds it to the digest, so retries from before DEC-027 still match.
        parts = (canonical(requested),) if requested else ()
        digest = self.security.digest("public.page.create", body.handle, body.name, body.description, body.topic, *parts)
        with self.identity.signed_in_write(token) as (database, user):
            existing = database.scalar(select(PublicPage).where(PublicPage.owner_id == user.id, PublicPage.creation_key == key))
            if existing is not None:
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original page.")
                if existing.status != "active":
                    raise not_found("Page")
                return self.page_view(database, existing, user)
            owned = database.scalar(select(func.count()).select_from(PublicPage).where(self.present_pages(user.id)))
            if owned >= MAX_PAGES_PER_OWNER:
                raise DomainError(409, "PAGE_LIMIT_REACHED", f"You can own up to {MAX_PAGES_PER_OWNER} public pages in this local build.")
            vocabulary = Vocabulary.load(database)
            vocabulary.check("topic", "topic", [body.topic])
            if database.scalar(select(PublicPage.id).where(PublicPage.handle == body.handle)) is not None:
                raise DomainError(409, "HANDLE_TAKEN", "This handle is already used. Choose another.")
            now = self.clock()
            page = PublicPage(
                id=str(uuid4()), handle=body.handle, name=body.name, description=body.description, topic=body.topic,
                owner_id=user.id, status="active", follower_count=0, version=1, creation_key=key,
                creation_digest=digest, created_at=now, updated_at=now,
            )
            database.add(page)
            try:
                database.flush()
            except IntegrityError:
                raise DomainError(409, "HANDLE_TAKEN", "This handle is already used. Choose another.") from None
            nothing = {field: [] for field in ClassificationView.model_fields}
            classify(database, vocabulary, page, requested, nothing)
            database.flush()
            self.record(database, user.id, page.id, page.id, "public.page_created")
            return self.page_view(database, page, user, following=False, blocked=False)

    def read_page(self, token, reference):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            return self.page_view(database, self.find_page(database, reference, viewer=viewer), viewer)

    def my_pages(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            pages = database.scalars(select(PublicPage).where(
                self.present_pages(user.id),
            ).order_by(PublicPage.created_at, PublicPage.id)).all()
            return self.page_views(database, pages, user)

    def update_page(self, token, page_id, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
            self.writable(page)
            self.require_etag(etag, self.page_etag(page), "page")
            vocabulary = Vocabulary.load(database)
            current = classifications(database, [page.id])[page.id]
            requested = body.classification.requested() if body.classification is not None else {}
            if "topic" in body.model_fields_set and body.topic != page.topic:
                vocabulary.check("topic", "topic", [body.topic])
                # The new main topic leaves the other topics, where it would only repeat itself.
                requested.setdefault("other_topics", current["other_topics"])
            changed = False
            for field in body.model_fields_set - {"classification"}:
                value = getattr(body, field)
                if getattr(page, field) != value:
                    setattr(page, field, value)
                    changed = True
            changed = classify(database, vocabulary, page, requested, current) or changed
            if changed:
                page.version += 1
                page.updated_at = self.clock()
                self.record(database, user.id, page.id, page.id, "public.page_updated")
            database.flush()
            return self.page_view(database, page, user)

    def follow(self, token, page_id, following):
        with self.identity.signed_in_write(token) as (database, user):
            page = self.find_page(database, page_id, lock=True, viewer=user)
            if following:
                self.writable(page)
            existing = database.get(PageFollow, (page.id, user.id))
            if following and existing is None:
                if page.id in self.blocked(database, user, "page"):
                    raise DomainError(409, "PAGE_BLOCKED", "Unblock this page before following it.")
                count = database.scalar(select(func.count()).select_from(PageFollow).where(PageFollow.account_id == user.id))
                if count >= MAX_FOLLOWS:
                    raise DomainError(409, "FOLLOW_LIMIT_REACHED", f"You can follow up to {MAX_FOLLOWS} pages.")
                database.add(PageFollow(page_id=page.id, account_id=user.id, created_at=self.clock()))
                page.follower_count += 1
            elif not following and existing is not None:
                database.delete(existing)
                page.follower_count -= 1
            database.flush()
            return self.page_view(database, page, user, following=following)

    def following(self, token, limit, cursor):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            statement = select(PublicPage, PageFollow.created_at).join(PageFollow, PageFollow.page_id == PublicPage.id).where(
                PageFollow.account_id == user.id, PublicPage.status.in_(("active", "read_only")), self.moderation_visible(PublicPage, user),
            )
            rows, more = self.newest_first(database, statement, PageFollow.created_at, PublicPage.id, limit, cursor, "following", user, "")
            next_cursor = self.seal_cursor("following", user, "", rows[-1][0].id, after_time=rows[-1][1]) if more else None
            return self.page_views(database, [page for page, _time in rows], user), Pagination(next_cursor=next_cursor, has_more=more)

    def page_insights(self, token, page_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            page = self.find_page(database, page_id, viewer=user)
            if page.owner_id != user.id:
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner can see its insights.")
            now = self.clock()
            since = now - INSIGHT_PERIOD * INSIGHT_PERIODS
            posts = select(PublicPost.id).where(PublicPost.page_id == page.id)
            # What the owner did themselves is not counted; deleted, removed and hidden comments are not either.
            moments = {
                "new_followers": select(PageFollow.created_at).where(
                    PageFollow.page_id == page.id, PageFollow.account_id != user.id, PageFollow.created_at > since,
                ),
                "posts": select(PublicPost.published_at).where(
                    PublicPost.page_id == page.id, PublicPost.status == "published", PublicPost.published_at > since,
                ),
                "comments": select(PostComment.created_at).where(
                    PostComment.post_id.in_(posts), PostComment.status == "visible", PostComment.moderation_hidden_at.is_(None),
                    PostComment.author_id != user.id, PostComment.created_at > since,
                ),
                "likes": select(PostReaction.created_at).where(
                    PostReaction.post_id.in_(posts), PostReaction.account_id != user.id, PostReaction.created_at > since,
                ),
            }
            counts = {name: [0] * INSIGHT_PERIODS for name in moments}
            for name, statement in moments.items():
                for moment in database.scalars(statement):
                    index = int((now - moment) / INSIGHT_PERIOD)
                    if 0 <= index < INSIGHT_PERIODS:
                        counts[name][index] += 1
            periods = [
                InsightPeriod(
                    start=now - INSIGHT_PERIOD * (index + 1), end=now - INSIGHT_PERIOD * index,
                    **{name: values[index] for name, values in counts.items()},
                )
                for index in range(INSIGHT_PERIODS)
            ]
            return PageInsights(page_id=page.id, follower_count=page.follower_count, as_of=now, periods=periods)

    # Posts

    def create_post(self, token, page_id, body, key):
        requested = body.requested_terms()
        # Only a post created with topics or interests adds them to the digest, so retries from before DEC-036 still match.
        parts = (";".join(f"{field}={','.join(codes)}" for field, codes in requested.items()),) if requested else ()
        digest = self.security.digest("public.post.create", page_id, body.title or "", body.body, *parts)
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
            self.writable(page)
            existing = database.scalar(select(PublicPost).where(
                PublicPost.page_id == page.id, PublicPost.author_id == user.id, PublicPost.creation_key == key,
            ))
            if existing is not None:
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original post.")
                if existing.status == "deleted":
                    raise not_found("Post")
                return self.post_views(database, [(existing, page)], user)[0]
            counts = dict(database.execute(select(PublicPost.status, func.count()).where(PublicPost.page_id == page.id).group_by(PublicPost.status)).all())
            if counts.get("draft", 0) >= MAX_DRAFTS_PER_PAGE:
                raise DomainError(409, "DRAFT_LIMIT_REACHED", f"A page can keep up to {MAX_DRAFTS_PER_PAGE} drafts. Publish or delete one first.")
            if sum(counts.values()) >= MAX_POSTS_PER_PAGE:
                raise DomainError(409, "POST_LIMIT_REACHED", "The local post limit for this page was reached.")
            vocabulary = Vocabulary.load(database) if requested else None
            for field, codes in requested.items():
                vocabulary.check(field, POST_FIELDS[field], codes)
            now = self.clock()
            post = PublicPost(
                id=str(uuid4()), page_id=page.id, author_id=user.id, title=body.title, body=body.body, status="draft",
                version=1, like_count=0, comment_count=0, creation_key=key, creation_digest=digest,
                created_at=now, updated_at=now,
            )
            database.add(post)
            database.flush()
            if requested:
                tag_post(database, vocabulary, post.id, requested, {field: [] for field in POST_FIELDS})
                database.flush()
            self.record(database, user.id, page.id, post.id, "public.post_drafted")
            return self.post_views(database, [(post, page)], user)[0]

    def managed_post(self, database, user, post_id):
        post, page = self.visible_post(database, user, post_id, lock=True, drafts=True)
        if page.owner_id != user.id:
            raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner can change this post.")
        self.writable(page)
        return post, page

    def update_post(self, token, post_id, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.managed_post(database, user, post_id)
            self.require_etag(etag, self.post_etag(post), "post")
            changed = False
            for field in body.model_fields_set - set(POST_FIELDS):
                value = getattr(body, field)
                if getattr(post, field) != value:
                    setattr(post, field, value)
                    changed = True
            requested = body.requested_terms()
            if requested:
                current = post_terms_of(database, [post.id])[post.id]
                changed = tag_post(database, Vocabulary.load(database), post.id, requested, current) or changed
            if changed:
                now = self.clock()
                post.version += 1
                post.updated_at = now
                if post.status == "published":
                    post.edited_at = now
                    self.record(database, user.id, page.id, post.id, "public.post_edited")
            database.flush()
            return self.post_views(database, [(post, page)], user)[0]

    def publish_post(self, token, post_id, etag):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.managed_post(database, user, post_id)
            if post.status == "published":
                # A retry after a lost response finds the post already public and changes nothing.
                return self.post_views(database, [(post, page)], user)[0]
            self.open_for_new_content(page)
            self.require_etag(etag, self.post_etag(post), "draft")
            now = self.clock()
            post.status = "published"
            post.published_at = now
            post.updated_at = now
            post.version += 1
            database.flush()
            self.record(database, user.id, page.id, post.id, "public.post_published")
            return self.post_views(database, [(post, page)], user)[0]

    def delete_post(self, token, post_id, etag):
        with self.identity.signed_in_write(token) as (database, user):
            row = database.execute(
                select(PublicPost, PublicPage).join(PublicPage, PublicPage.id == PublicPost.page_id)
                .where(PublicPost.id == post_id).with_for_update(of=PublicPost).execution_options(populate_existing=True)
            ).first()
            if row is not None:
                # The joined page is from before the wait for the post's lock; read it again, as visible_post does (T115).
                database.refresh(row[1])
            if row is None or row[1].status != "active":
                raise not_found("Post")
            post, page = row
            if page.owner_id != user.id:
                if post.status != "published":
                    raise not_found("Post")
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner can delete this post.")
            if post.status != "deleted":
                self.require_etag(etag, self.post_etag(post), "post")
                now = self.clock()
                post.status = "deleted"
                post.title = None
                post.body = None
                post.pinned_at = None
                post.deleted_at = now
                post.updated_at = now
                post.version += 1
                # A deleted post keeps no subject either.
                database.execute(delete(PostTerm).where(PostTerm.post_id == post.id))
                database.flush()
                self.record(database, user.id, page.id, post.id, "public.post_deleted")
            return PostOutcome(id=post.id, status="deleted")

    def pin_post(self, token, post_id, pinned):
        with self.identity.signed_in_write(token) as (database, user):
            page_id = database.scalar(select(PublicPost.page_id).where(PublicPost.id == post_id))
            if page_id is None:
                raise not_found("Post")
            # The page is locked before the post, so parallel pins on one page count each other.
            self.find_page(database, page_id, lock=True, viewer=user)
            post, page = self.visible_post(database, user, post_id, lock=True, drafts=True)
            moderator = self.active_moderator(database, user, page.id) is not None
            if page.owner_id != user.id and not moderator:
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner or a moderator can pin posts.")
            self.writable(page)
            if pinned and not self.is_pinned(post):
                if post.status != "published":
                    raise DomainError(409, "NOT_PUBLISHED", "Publish the post before pinning it.")
                if post.moderation_hidden_at is not None:
                    raise DomainError(409, "POST_HIDDEN", "A moderator hid this post, so it cannot be pinned.")
                count = database.scalar(select(func.count()).select_from(PublicPost).where(
                    PublicPost.page_id == page.id, PublicPost.status == "published", PublicPost.pinned_at.is_not(None),
                ))
                if count >= MAX_PINNED_POSTS:
                    raise DomainError(409, "PIN_LIMIT_REACHED", f"A page can pin up to {MAX_PINNED_POSTS} posts. Unpin one first.")
                post.pinned_at = self.clock()
                database.flush()
                self.record(database, user.id, page.id, post.id, "public.post_pinned")
            elif not pinned and post.pinned_at is not None:
                post.pinned_at = None
                database.flush()
                self.record(database, user.id, page.id, post.id, "public.post_unpinned")
            return self.post_views(database, [(post, page)], user)[0]

    def pinned_posts(self, token, reference):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            page = self.find_page(database, reference, viewer=viewer)
            if page.owner_id != (viewer.id if viewer else None) and page.id in self.blocked(database, viewer, "page"):
                return []
            rows = database.execute(select(PublicPost, PublicPage).join(PublicPage, PublicPage.id == PublicPost.page_id).where(
                PublicPost.page_id == page.id, PublicPost.status == "published", PublicPost.pinned_at.is_not(None),
                self.moderation_visible(PublicPost, viewer),
            ).order_by(PublicPost.pinned_at.desc(), PublicPost.id.desc()).limit(MAX_PINNED_POSTS)).all()
            return self.post_views(database, rows, viewer)

    def read_post(self, token, post_id):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            return self.post_views(database, [self.visible_post(database, viewer, post_id, drafts=True)], viewer)[0]

    def page_posts(self, token, reference, limit, cursor):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            page = self.find_page(database, reference, viewer=viewer)
            if page.owner_id != (viewer.id if viewer else None) and page.id in self.blocked(database, viewer, "page"):
                return [], Pagination(next_cursor=None, has_more=False)
            statement = select(PublicPost, PublicPage).join(PublicPage, PublicPage.id == PublicPost.page_id).where(
                PublicPost.page_id == page.id, PublicPost.status == "published",
                self.moderation_visible(PublicPost, viewer),
            )
            rows, more = self.newest_first(database, statement, PublicPost.published_at, PublicPost.id, limit, cursor, "page_posts", viewer, page.id)
            next_cursor = self.seal_cursor("page_posts", viewer, page.id, rows[-1][0].id, after_time=rows[-1][0].published_at) if more else None
            return self.post_views(database, rows, viewer), Pagination(next_cursor=next_cursor, has_more=more)

    def drafts(self, token, page_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            page = self.find_page(database, page_id, viewer=user)
            if page.owner_id != user.id:
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner can see drafts.")
            posts = database.scalars(select(PublicPost).where(PublicPost.page_id == page.id, PublicPost.status == "draft")
                                     .order_by(PublicPost.updated_at.desc(), PublicPost.id.desc()).limit(MAX_DRAFTS_PER_PAGE)).all()
            return self.post_views(database, [(post, page) for post in posts], user)

    def stream(self, token, limit, cursor, followed_only, query=None):
        query = " ".join((query or "").split())
        with self.sessions() as database:
            viewer = self.identity.authenticate(database, token)[0] if followed_only else self.viewer(database, token)
            statement = select(PublicPost, PublicPage).join(PublicPage, PublicPage.id == PublicPost.page_id).where(
                PublicPost.status == "published", PublicPage.status.in_(("active", "read_only")),
                self.moderation_visible(PublicPage, viewer), self.moderation_visible(PublicPost, viewer),
            )
            if followed_only:
                statement = statement.join(PageFollow, and_(PageFollow.page_id == PublicPage.id, PageFollow.account_id == viewer.id))
            else:
                statement = statement.where(self.discoverable(viewer))
            blocked = self.blocked(database, viewer, "page")
            if blocked:
                statement = statement.where(PublicPage.id.notin_(blocked))
            kind, scope = ("feed" if followed_only else "latest"), ""
            if query:
                pattern = contains(query)
                statement = statement.where(or_(PublicPost.title.ilike(pattern, escape="\\"), PublicPost.body.ilike(pattern, escape="\\")))
                kind, scope = "post_search", self.security.digest("public.post-search", query.lower())
            else:
                # Mutes shape the lists a person browses; a search still finds what was asked for.
                statement = self.without_muted_posts(database, statement, viewer)
            rows, more = self.newest_first(database, statement, PublicPost.published_at, PublicPost.id, limit, cursor, kind, viewer, scope)
            next_cursor = self.seal_cursor(kind, viewer, scope, rows[-1][0].id, after_time=rows[-1][0].published_at) if more else None
            return self.post_views(database, rows, viewer), Pagination(next_cursor=next_cursor, has_more=more)

    def discover_pages(self, token, query, filters, limit, cursor):
        query = " ".join((query or "").split())
        filters = {dimension: code for dimension, code in filters.items() if code}
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            statement = select(PublicPage).where(
                PublicPage.status == "active", self.moderation_visible(PublicPage, viewer), self.discoverable(viewer),
            )
            if query:
                pattern = contains(query)
                matches = [
                    PublicPage.name.ilike(pattern, escape="\\"), PublicPage.handle.ilike(pattern, escape="\\"),
                    PublicPage.description.ilike(pattern, escape="\\"),
                ]
                terms = searched_terms(Vocabulary.load(database), query)
                if terms:
                    matches.append(PublicPage.topic.in_([code for dimension, code in terms if dimension == "topic"]))
                    matches.append(exists().where(PageTerm.page_id == PublicPage.id, tuple_(PageTerm.dimension, PageTerm.code).in_(sorted(terms))))
                statement = statement.where(or_(*matches))
            statement = filtered(database, statement, filters)
            blocked = self.blocked(database, viewer, "page")
            if blocked:
                statement = statement.where(PublicPage.id.notin_(blocked))
            # The filters are part of the list's identity: a cursor from one list cannot continue another.
            scope = self.security.digest("public.discover", query.lower(), *(f"{name}={code}" for name, code in sorted(filters.items())))
            if cursor:
                position = self.open_cursor(cursor, "discover", viewer, scope)
                if position.after_number is None:
                    raise DomainError(400, "CURSOR_INVALID", "Reload the list.")
                statement = statement.where(or_(
                    PublicPage.follower_count < position.after_number,
                    and_(PublicPage.follower_count == position.after_number, PublicPage.id < position.after_id),
                ))
            pages = database.scalars(statement.order_by(PublicPage.follower_count.desc(), PublicPage.id.desc()).limit(limit + 1)).all()
            more = len(pages) > limit
            pages = pages[:limit]
            next_cursor = self.seal_cursor("discover", viewer, scope, pages[-1].id, after_number=pages[-1].follower_count) if more else None
            return self.page_views(database, pages, viewer), Pagination(next_cursor=next_cursor, has_more=more)

    # The shared vocabulary and the interests a person chooses (DEC-027)

    def taxonomy(self):
        with self.sessions() as database:
            return term_views(database)

    def interests_etag(self, account_id, chosen):
        parts = (f"{field}={','.join(chosen[field])}" for field in PERSON_FIELDS)
        return '"' + self.security.digest("account.interests", account_id, *parts) + '"'

    def interests(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            chosen = interests_of(database, user.id)
            return InterestsView(**chosen, etag=self.interests_etag(user.id, chosen))

    def set_interests(self, token, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            current = interests_of(database, user.id)
            wanted = {field: list(getattr(body, field)) for field in PERSON_FIELDS}
            # Sending what is already saved changes nothing, so a retry after a lost answer needs no fresh version.
            if wanted != current:
                self.require_etag(etag, self.interests_etag(user.id, current), "list of interests")
                save_interests(database, Vocabulary.load(database), user.id, current, wanted, self.clock())
                database.flush()
            return InterestsView(**wanted, etag=self.interests_etag(user.id, wanted))

    def suggested_pages(self, token, limit):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            matcher = Matcher(Vocabulary.load(database), interests_of(database, user.id))
            choices = self.feed_choices(database, user.id)
            muted = self.muted_subjects(database, choices)
            hidden = self.blocked(database, user, "page") | choices["pages"] | choices["suggestions"]
            pages = matcher.candidates(database, user, hidden, avoid=muted.page_match() if muted else None)
            classified = classifications(database, [page.id for page in pages])
            scored = [(page, *matcher.score(page, classified[page.id])) for page in pages]
            # The candidates come most followed first, so a stable sort keeps that order between equal points.
            chosen = sorted((item for item in scored if item[1]), key=lambda item: -item[1])[:limit]
            items = [
                SuggestedPage(
                    page=self.page_view(database, page, user, following=False, blocked=False, classification=classified[page.id]),
                    reasons=reasons,
                )
                for page, _points, reasons in chosen
            ]
            return Suggestions(ranking=RANKING, items=items)

    def interest_posts(self, token, limit, cursor):
        """Published posts about the person's chosen topics and interests, newest first, each with what it matched
        (DEC-036). The person's own pages and the pages they blocked are left out; nothing about what they see is kept."""
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            chosen = interests_of(database, user.id)
            matcher = Matcher(Vocabulary.load(database), chosen)
            match = matcher.post_match()
            if match is None:
                return [], Pagination(next_cursor=None, has_more=False)
            statement = select(PublicPost, PublicPage).join(PublicPage, PublicPage.id == PublicPost.page_id).where(
                PublicPost.status == "published", PublicPage.status.in_(PUBLIC_PAGE_STATES), PublicPage.owner_id != user.id,
                PublicPage.moderation_limited_at.is_(None),
                self.moderation_visible(PublicPage, user), self.moderation_visible(PublicPost, user), match,
            )
            blocked = self.blocked(database, user, "page")
            if blocked:
                statement = statement.where(PublicPage.id.notin_(blocked))
            statement = self.without_muted_posts(database, statement, user)
            # A cursor continues only the list it came from: after the person changes their choices, the list starts again.
            scope = self.security.digest(
                "public.interest-posts", *(f"{field}={','.join(sorted(chosen[field]))}" for field in POST_FIELDS),
            )
            rows, more = self.newest_first(
                database, statement, PublicPost.published_at, PublicPost.id, limit, cursor, "interest_posts", user, scope,
            )
            next_cursor = self.seal_cursor("interest_posts", user, scope, rows[-1][0].id, after_time=rows[-1][0].published_at) if more else None
            views = self.post_views(database, rows, user)
            pages = classifications(database, list({page.id for _post, page in rows}))
            items = []
            for (_post, page), view in zip(rows, views):
                subjects = {"topics": view.topics, "interests": view.interests}
                if not view.topics and not view.interests:
                    subjects = {"topics": [page.topic, *pages[page.id]["other_topics"]], "interests": pages[page.id]["interests"]}
                items.append(InterestPost(post=view, reasons=matcher.post_reasons(subjects)))
            return items, Pagination(next_cursor=next_cursor, has_more=more)

    # Likes and saves

    def like(self, token, post_id, liked):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.visible_post(database, user, post_id, lock=True)
            if liked:
                self.writable(page)
            existing = database.get(PostReaction, (post.id, user.id))
            if liked and existing is None:
                database.add(PostReaction(post_id=post.id, account_id=user.id, kind="like", created_at=self.clock()))
                post.like_count += 1
            elif not liked and existing is not None:
                database.delete(existing)
                post.like_count -= 1
            database.flush()
            return self.post_views(database, [(post, page)], user)[0]

    def save(self, token, post_id, saved):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.visible_post(database, user, post_id)
            if saved:
                self.writable(page)
            existing = database.get(SavedPost, (post.id, user.id))
            if saved and existing is None:
                count = database.scalar(select(func.count()).select_from(SavedPost).where(SavedPost.account_id == user.id))
                if count >= MAX_SAVED:
                    raise DomainError(409, "SAVED_LIMIT_REACHED", f"You can keep up to {MAX_SAVED} saved posts.")
                database.add(SavedPost(post_id=post.id, account_id=user.id, created_at=self.clock()))
            elif not saved and existing is not None:
                database.delete(existing)
            database.flush()
            return self.post_views(database, [(post, page)], user)[0]

    def saved_posts(self, token, limit, cursor):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            statement = select(PublicPost, PublicPage, SavedPost.created_at).join(PublicPage, PublicPage.id == PublicPost.page_id).join(
                SavedPost, and_(SavedPost.post_id == PublicPost.id, SavedPost.account_id == user.id),
            ).where(PublicPost.status == "published", PublicPage.status.in_(("active", "read_only")),
                    self.moderation_visible(PublicPage, user), self.moderation_visible(PublicPost, user))
            blocked = self.blocked(database, user, "page")
            if blocked:
                statement = statement.where(PublicPage.id.notin_(blocked))
            rows, more = self.newest_first(database, statement, SavedPost.created_at, PublicPost.id, limit, cursor, "saved", user, "")
            next_cursor = self.seal_cursor("saved", user, "", rows[-1][0].id, after_time=rows[-1][2]) if more else None
            return self.post_views(database, [(post, page) for post, page, _time in rows], user), Pagination(next_cursor=next_cursor, has_more=more)

    # Comments

    def comment_view(self, database, comment, author, viewer, page, moderator=None):
        mine = viewer is not None and comment.author_id == viewer.id
        manager = viewer is not None and page.owner_id == viewer.id
        if moderator is None and viewer is not None:
            moderator = self.active_moderator(database, viewer, page.id) is not None
        parent_id = comment.parent_id
        if parent_id is not None:
            parent = database.get(PostComment, parent_id)
            if parent is not None and not self.can_view_moderated(parent, viewer):
                parent_id = None
        return CommentView(
            id=comment.id, post_id=comment.post_id, parent_id=parent_id, author_name=author.display_name,
            body=comment.body, status=comment.status, created_at=comment.created_at, mine=mine,
            # Removing is a change, so only an active page allows it (T114).
            can_remove=comment.status == "visible" and page.status == "active" and (mine or manager or moderator),
            moderation=self.moderation_mark(database, comment, viewer),
        )

    def comments(self, token, post_id, limit, cursor):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            post, page = self.visible_post(database, viewer, post_id)
            if post.status != "published":
                return [], Pagination(next_cursor=None, has_more=False)
            statement = select(PostComment, User).join(User, User.id == PostComment.author_id).where(
                PostComment.post_id == post.id, self.moderation_visible(PostComment, viewer),
            )
            hidden = self.blocked(database, viewer, "account")
            if hidden:
                statement = statement.where(PostComment.author_id.notin_(hidden))
            if cursor:
                position = self.open_cursor(cursor, "comments", viewer, post.id)
                statement = statement.where(or_(
                    PostComment.created_at > position.after_time,
                    and_(PostComment.created_at == position.after_time, PostComment.id > position.after_id),
                ))
            # Oldest first, so every reply arrives after the comment it answers.
            rows = database.execute(statement.order_by(PostComment.created_at, PostComment.id).limit(limit + 1)).all()
            more = len(rows) > limit
            rows = rows[:limit]
            next_cursor = self.seal_cursor("comments", viewer, post.id, rows[-1][0].id, after_time=rows[-1][0].created_at) if more else None
            moderator = viewer is not None and self.active_moderator(database, viewer, page.id) is not None
            return [self.comment_view(database, comment, author, viewer, page, moderator) for comment, author in rows], Pagination(next_cursor=next_cursor, has_more=more)

    def create_comment(self, token, post_id, body, key):
        parent_id = str(body.parent_id) if body.parent_id else None
        digest = self.security.digest("public.comment.create", post_id, parent_id or "", body.body)
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.visible_post(database, user, post_id, lock=True)
            self.writable(page)
            if post.status != "published":
                raise not_found("Post")
            existing = database.scalar(select(PostComment).where(PostComment.author_id == user.id, PostComment.creation_key == key))
            if existing is not None:
                if existing.creation_digest != digest or existing.post_id != post.id:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original comment.")
                return self.comment_view(database, existing, user, user, page, moderator=False)
            self.open_for_new_content(page)
            if page.owner_id != user.id and database.scalar(select(AccountBlock.id).where(
                AccountBlock.blocker_id == page.owner_id, AccountBlock.target_type == "account", AccountBlock.target_id == user.id,
            )) is not None:
                raise DomainError(403, "COMMENTING_UNAVAILABLE", "You cannot comment on this page.")
            if parent_id:
                parent = database.scalar(select(PostComment).where(PostComment.id == parent_id, PostComment.post_id == post.id))
                if parent is None or not self.can_view_moderated(parent, user):
                    raise not_found("Comment")
                if parent.parent_id is not None:
                    raise DomainError(409, "REPLY_DEPTH", "Reply to the original comment instead.")
                if parent.status != "visible":
                    raise DomainError(409, "COMMENT_UNAVAILABLE", "This comment is no longer available.")
            now = self.clock()
            recent = database.scalar(select(func.count()).select_from(PostComment).where(
                PostComment.author_id == user.id, PostComment.created_at > now - timedelta(minutes=1),
            ))
            if recent >= MAX_COMMENTS_PER_MINUTE:
                raise DomainError(429, "COMMENT_RATE_LIMITED", "You are commenting quickly. Wait a minute, then retry.", retry_after=60)
            total = database.scalar(select(func.count()).select_from(PostComment).where(PostComment.post_id == post.id))
            if total >= MAX_COMMENTS_PER_POST:
                raise DomainError(409, "COMMENT_LIMIT_REACHED", "This post reached the local comment limit.")
            comment = PostComment(
                id=str(uuid4()), post_id=post.id, parent_id=parent_id, author_id=user.id, body=body.body, status="visible",
                creation_key=key, creation_digest=digest, created_at=now,
            )
            post.comment_count += 1
            database.add(comment)
            database.flush()
            self.record(database, user.id, page.id, comment.id, "public.comment_created", audited=False)
            return self.comment_view(database, comment, user, user, page, moderator=False)

    def end_comment(self, token, comment_id):
        with self.identity.signed_in_write(token) as (database, user):
            located = database.scalar(select(PostComment.post_id).where(PostComment.id == comment_id))
            if located is None:
                raise not_found("Comment")
            post, page = self.visible_post(database, user, located, lock=True)
            self.writable(page)
            comment = database.scalar(select(PostComment).where(PostComment.id == comment_id).with_for_update().execution_options(populate_existing=True))
            if not self.can_view_moderated(comment, user):
                raise not_found("Comment")
            mine = comment.author_id == user.id
            manager = page.owner_id == user.id
            # Locked, so a removal of this moderator that commits first is seen, and one that starts later waits.
            moderator = self.active_moderator(database, user, page.id, lock=True) is not None
            if not mine and not manager and not moderator:
                raise DomainError(403, "COMMENT_NOT_YOURS", "Only the author, the page owner or a moderator can remove this comment.")
            if comment.status == "visible":
                comment.status = "deleted" if mine else "removed"
                comment.body = None
                comment.ended_at = self.clock()
                post.comment_count -= 1
                database.flush()
                self.record(database, user.id, page.id, comment.id, f"public.comment_{comment.status}", audited=not mine)
            author = database.get(User, comment.author_id)
            return self.comment_view(database, comment, author, user, page, moderator)

    # Reports and blocks

    def report(self, token, body):
        target_id = str(body.target_id)
        with self.identity.signed_in_write(token) as (database, user):
            if body.target_type == "page":
                owner = self.find_page(database, target_id, lock=True, viewer=user).owner_id
            elif body.target_type == "post":
                post = database.scalar(select(PublicPost).where(PublicPost.id == target_id).with_for_update())
                page = database.get(PublicPage, post.page_id) if post else None
                if post is None or page is None or post.status != "published" or page.status not in PUBLIC_PAGE_STATES or not (
                    self.can_view_moderated(page, user) and self.can_view_moderated(post, user, page)
                ):
                    raise not_found("Post")
                owner = page.owner_id
            else:
                comment = database.get(PostComment, target_id)
                post = database.scalar(select(PublicPost).where(PublicPost.id == comment.post_id).with_for_update()) if comment else None
                if comment is not None:
                    database.refresh(comment, with_for_update=True)
                page = database.get(PublicPage, post.page_id) if post else None
                if comment is None or post is None or page is None or comment.status != "visible" or post.status != "published" or page.status not in PUBLIC_PAGE_STATES or not (
                    self.can_view_moderated(page, user) and self.can_view_moderated(post, user, page) and self.can_view_moderated(comment, user)
                ):
                    raise not_found("Comment")
                owner = comment.author_id
            if owner == user.id:
                raise DomainError(409, "OWN_CONTENT", "You cannot report your own content.")
            existing = database.scalar(select(ContentReport).where(
                ContentReport.reporter_id == user.id, ContentReport.target_type == body.target_type,
                ContentReport.target_id == target_id, ContentReport.status == "received",
            ))
            if existing is None:
                now = self.clock()
                recent = database.scalar(select(func.count()).select_from(ContentReport).where(
                    ContentReport.reporter_id == user.id, ContentReport.created_at > now - timedelta(days=1),
                ))
                if recent >= MAX_REPORTS_PER_DAY:
                    raise DomainError(429, "REPORT_RATE_LIMITED", "You reached the daily report limit. Try again tomorrow.")
                existing = ContentReport(
                    id=str(uuid4()), reporter_id=user.id, target_type=body.target_type, target_id=target_id,
                    reason=body.reason, details=body.details, status="received", created_at=now,
                )
                database.add(existing)
                database.flush()
                self.record(database, user.id, None, existing.id, "safety.report_received", audited=False)
            return ReportView(
                id=existing.id, target_type=existing.target_type, target_id=existing.target_id,
                reason=existing.reason, status=existing.status, created_at=existing.created_at,
            )

    def block_view(self, database, block):
        page = database.get(PublicPage, block.target_id) if block.target_type == "page" else None
        label = page.name if page else database.get(User, block.target_id).display_name
        return BlockView(
            id=block.id, target_type=block.target_type, page_id=block.target_id if page else None,
            label=label, created_at=block.created_at,
        )

    def block(self, token, body):
        reference = str(body.target_id)
        with self.identity.signed_in_write(token) as (database, user):
            page = None
            if body.target_type == "page":
                page = self.find_page(database, reference, lock=True, viewer=user)
                if page.owner_id == user.id:
                    raise DomainError(409, "OWN_CONTENT", "You cannot block your own page.")
                target_type, target_id = "page", page.id
            else:
                comment = database.get(PostComment, reference)
                if comment is None or not self.can_view_moderated(comment, user):
                    raise not_found("Comment")
                self.visible_post(database, user, comment.post_id)
                if comment.author_id == user.id:
                    raise DomainError(409, "OWN_CONTENT", "You cannot block yourself.")
                target_type, target_id = "account", comment.author_id
            existing = database.scalar(select(AccountBlock).where(
                AccountBlock.blocker_id == user.id, AccountBlock.target_type == target_type, AccountBlock.target_id == target_id,
            ))
            if existing is None:
                count = database.scalar(select(func.count()).select_from(AccountBlock).where(AccountBlock.blocker_id == user.id))
                if count >= MAX_BLOCKS:
                    raise DomainError(409, "BLOCK_LIMIT_REACHED", f"You can keep up to {MAX_BLOCKS} blocks.")
                existing = AccountBlock(id=str(uuid4()), blocker_id=user.id, target_type=target_type, target_id=target_id, created_at=self.clock())
                database.add(existing)
                if page is not None:
                    follow = database.get(PageFollow, (page.id, user.id))
                    if follow is not None:
                        database.delete(follow)
                        page.follower_count -= 1
                database.flush()
            return self.block_view(database, existing)

    def unblock(self, token, block_id):
        with self.identity.signed_in_write(token) as (database, user):
            block = database.get(AccountBlock, block_id)
            if block is None or block.blocker_id != user.id:
                raise not_found("Block")
            database.delete(block)
            return BlockOutcome(id=block_id, status="removed")

    def blocks(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            rows = database.scalars(select(AccountBlock).where(AccountBlock.blocker_id == user.id)
                                    .order_by(AccountBlock.created_at.desc(), AccountBlock.id.desc())).all()
            return [self.block_view(database, block) for block in rows]

    # Private feed controls (DEC-037): mutes and Not interested shape one person's lists and are told to nobody.

    @staticmethod
    def feed_choices(database, account_id):
        choices = {"pages": set(), "posts": set(), "suggestions": set(), "topics": [], "interests": []}
        rows = database.execute(select(
            FeedControl.kind, FeedControl.page_id, FeedControl.post_id, FeedControl.term_dimension, FeedControl.term_code,
        ).where(FeedControl.account_id == account_id)).all()
        for kind, page_id, post_id, dimension, code in rows:
            if kind == "mute_page":
                choices["pages"].add(page_id)
            elif kind == "hide_suggestion":
                choices["suggestions"].add(page_id)
            elif kind == "hide_post":
                choices["posts"].add(post_id)
            else:
                choices["topics" if dimension == "topic" else "interests"].append(code)
        return choices

    @staticmethod
    def muted_subjects(database, choices):
        """The muted topics and interests as a Matcher, so a muted topic covers the interests under it; None if none."""
        if not choices["topics"] and not choices["interests"]:
            return None
        chosen = {"topics": choices["topics"], "interests": choices["interests"], "languages": [], "places": []}
        return Matcher(Vocabulary.load(database), chosen)

    def without_muted_posts(self, database, statement, viewer):
        if viewer is None:
            return statement
        choices = self.feed_choices(database, viewer.id)
        if choices["pages"]:
            statement = statement.where(PublicPage.id.notin_(choices["pages"]))
        if choices["posts"]:
            statement = statement.where(PublicPost.id.notin_(choices["posts"]))
        muted = self.muted_subjects(database, choices)
        if muted is not None:
            statement = statement.where(~muted.post_match())
        return statement

    def control_views(self, database, controls, viewer):
        post_ids = {control.post_id for control in controls if control.post_id}
        posts = {post.id: post for post in database.scalars(select(PublicPost).where(PublicPost.id.in_(post_ids)))} if post_ids else {}
        page_ids = {control.page_id for control in controls if control.page_id} | {post.page_id for post in posts.values()}
        pages = {page.id: page for page in database.scalars(select(PublicPage).where(PublicPage.id.in_(page_ids)))} if page_ids else {}
        views = []
        for control in controls:
            post = posts.get(control.post_id)
            page = pages.get(post.page_id if post else control.page_id)
            page_shown = page is not None and self.can_view_page(page, viewer) and self.can_view_moderated(page, viewer)
            post_shown = post is not None and page_shown and post.status == "published" and self.can_view_moderated(post, viewer)
            views.append(FeedControlView(
                id=control.id, kind=control.kind, page_id=page.id if page else None,
                page_handle=page.handle if page_shown else None, page_name=page.name if page_shown else None,
                post_id=control.post_id, post_title=post.title if post_shown else None,
                post_available=post_shown if control.post_id else None,
                dimension=control.term_dimension, code=control.term_code, created_at=control.created_at,
            ))
        return views

    def feed_controls(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            controls = database.scalars(select(FeedControl).where(FeedControl.account_id == user.id)
                                        .order_by(FeedControl.created_at.desc(), FeedControl.id.desc())).all()
            return self.control_views(database, controls, user)

    def add_feed_control(self, token, body):
        with self.identity.signed_in_write(token) as (database, user):
            page = None
            if body.kind == "hide_post":
                post, page = self.visible_post(database, user, str(body.post_id))
                target = {"post_id": post.id}
            elif body.kind == "mute_term":
                if database.get(TaxonomyTerm, (body.dimension, body.code)) is None:
                    raise unavailable("code", [body.code])
                target = {"term_dimension": body.dimension, "term_code": body.code}
            else:
                page = self.find_page(database, str(body.page_id), viewer=user)
                target = {"page_id": page.id}
            if page is not None and page.owner_id == user.id:
                raise DomainError(409, "OWN_CONTENT", "This is your own page.")
            control = database.scalar(select(FeedControl).where(
                FeedControl.account_id == user.id, FeedControl.kind == body.kind,
                *(getattr(FeedControl, column) == value for column, value in target.items()),
            ))
            if control is None:
                limit = MAX_FEED_CONTROLS[body.kind]
                count = database.scalar(select(func.count()).select_from(FeedControl).where(
                    FeedControl.account_id == user.id, FeedControl.kind == body.kind,
                ))
                if count >= limit:
                    raise DomainError(409, "FEED_CONTROL_LIMIT_REACHED", f"You can keep up to {limit} of these. Undo one first.")
                control = FeedControl(id=str(uuid4()), account_id=user.id, kind=body.kind, created_at=self.clock(), **target)
                database.add(control)
                database.flush()
            return self.control_views(database, [control], user)[0]

    def remove_feed_control(self, token, control_id):
        with self.identity.signed_in_write(token) as (database, user):
            control = database.get(FeedControl, control_id)
            if control is None or control.account_id != user.id:
                raise not_found("Control")
            database.delete(control)
            return FeedControlOutcome(id=control_id, status="removed")

    # Moderators (DEC-025 part 3)

    def invite_moderator(self, token, page_id, body, key):
        account_id = str(body.account_id)
        digest = self.security.digest("public.moderator.invite", page_id, account_id)
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
            self.writable(page)
            if account_id == user.id:
                raise DomainError(409, "MODERATOR_SELF", "You own this page, so you cannot moderate it.")
            invitee = database.scalar(select(User).where(
                User.id == account_id, User.status == "active", User.verified_at.is_not(None),
            ))
            if invitee is None:
                raise not_found("Account")
            existing = database.scalar(select(PageModerator).where(
                PageModerator.page_id == page.id, PageModerator.invited_by_id == user.id, PageModerator.request_key == key,
            ))
            if existing is not None:
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original invitation.")
                return self.moderator_view(database, existing)
            if database.scalar(select(PageModerator.id).where(
                PageModerator.page_id == page.id, PageModerator.account_id == account_id, PageModerator.status == "active",
            )) is not None:
                raise DomainError(409, "MODERATOR_ALREADY_ACTIVE", "This person already moderates the page.")
            count = database.scalar(select(func.count()).select_from(PageModerator).where(
                PageModerator.page_id == page.id, PageModerator.status == "active",
            ))
            if count >= MAX_MODERATORS:
                raise DomainError(409, "MODERATOR_LIMIT_REACHED", f"A page can have up to {MAX_MODERATORS} moderators.")
            pending = database.scalar(select(PageModerator).where(
                PageModerator.page_id == page.id, PageModerator.status == "pending",
            ).with_for_update().execution_options(populate_existing=True))
            now = self.clock()
            if pending is not None:
                if pending.expires_at > now:
                    raise DomainError(409, "MODERATOR_INVITATION_PENDING", "Withdraw the current invitation before starting another.")
                pending.status = "expired"
                pending.resolved_at = now
                pending.expires_at = None
                pending.version += 1
                self.record(database, user.id, page.id, pending.id, "public.moderator_expired")
                database.flush()
            row = PageModerator(
                id=str(uuid4()), page_id=page.id, account_id=account_id, invited_by_id=user.id, status="pending",
                version=1, request_key=key, request_digest=digest, created_at=now,
                expires_at=now + MODERATOR_INVITE_LIFETIME,
            )
            database.add(row)
            database.flush()
            self.record(database, user.id, page.id, row.id, "public.moderator_invited")
            return self.moderator_view(database, row)

    def page_moderators(self, token, page_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            page = self.managed_page(database, user, page_id)
            rows = database.scalars(select(PageModerator).where(
                PageModerator.page_id == page.id, PageModerator.status.in_(("pending", "active")),
            ).order_by(PageModerator.created_at, PageModerator.id)).all()
            return [self.moderator_view(database, row) for row in rows]

    def my_moderator_roles(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            now = self.clock()
            rows = database.execute(select(PageModerator, PublicPage).join(
                PublicPage, PublicPage.id == PageModerator.page_id,
            ).where(
                PageModerator.account_id == user.id, PageModerator.status.in_(("pending", "active")),
            ).order_by(PageModerator.created_at, PageModerator.id)).all()
            views = []
            for row, page in rows:
                if page.status not in ("active", "read_only") or (row.status == "pending" and row.expires_at <= now):
                    continue
                views.append(ModeratorRoleView(
                    id=row.id, page_id=page.id, page_handle=page.handle, page_name=page.name, status=row.status,
                    created_at=row.created_at, expires_at=row.expires_at, resolved_at=row.resolved_at,
                    etag=self.moderator_etag(row),
                ))
            return views

    def resolve_moderator(self, token, page_id, moderator_id, action, expected):
        outcome = {"accept": "active", "decline": "declined", "withdraw": "withdrawn", "remove": "removed", "step-down": "stepped_down"}[action]
        recorded = {"accept": "accepted", "decline": "declined", "withdraw": "withdrawn", "remove": "removed", "step-down": "stepped_down"}[action]
        with self.identity.signed_in_write(token) as (database, caller):
            row = database.scalar(select(PageModerator).where(PageModerator.id == moderator_id)
                                  .with_for_update().execution_options(populate_existing=True))
            if row is None or row.page_id != page_id:
                raise not_found("Invitation")
            page = database.get(PublicPage, page_id, populate_existing=True)
            if page is None or page.status == "archived":
                raise not_found("Invitation")
            if page.status == "deleted":
                raise DomainError(409, "PAGE_DELETED", "This page is deleted. The owner can restore it within seven days.")
            if action in ("accept", "decline", "step-down"):
                actor_ok = caller.id == row.account_id
            else:
                actor_ok = caller.id == page.owner_id
            if not actor_ok:
                raise not_found("Invitation")
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the exact invitation first.")
            if row.status == outcome:
                if row.decision_etag != expected:
                    raise DomainError(409, "MODERATOR_INVITATION_CLOSED", "Use the original reviewed action to reconcile this invitation.")
                return self.moderator_view(database, row)
            required = "active" if action in ("remove", "step-down") else "pending"
            if row.status != required:
                raise DomainError(409, "MODERATOR_INVITATION_CLOSED", "This invitation or role has already ended.")
            if expected != self.moderator_etag(row):
                raise DomainError(412, "CONTENT_CHANGED", "This invitation changed since you reviewed it. Reload to continue.")
            if action == "accept":
                if page.status == "read_only":
                    raise DomainError(409, "PAGE_READ_ONLY", "This page is read only. The owner can restore it.")
                state = self.moderator_state(database, row, page)
                if state == "expired":
                    raise DomainError(410, "MODERATOR_INVITATION_EXPIRED", "This invitation expired.")
                if state != "pending":
                    raise DomainError(409, "MODERATOR_INVITATION_INVALIDATED", "This invitation is no longer valid.")
                count = database.scalar(select(func.count()).select_from(PageModerator).where(
                    PageModerator.page_id == page.id, PageModerator.status == "active",
                ))
                if count >= MAX_MODERATORS:
                    raise DomainError(409, "MODERATOR_LIMIT_REACHED", f"A page can have up to {MAX_MODERATORS} moderators.")
            row.status = outcome
            row.resolved_at = self.clock()
            row.expires_at = None
            row.decision_etag = expected
            row.version += 1
            self.record(database, caller.id, page.id, row.id, f"public.moderator_{recorded}")
            database.flush()
            return self.moderator_view(database, row)

    # Handing a page over (DEC-025 part 4)

    def offer_handover(self, token, page_id, body, key, expected):
        to_id = str(body.to_account_id)
        with self.sessions.begin() as database:
            # The account before the page, as every other page change, so two of the owner's requests cannot deadlock.
            caller, _session = self.identity.authenticate(database, token, lock=True)
            page = self.managed_page(database, caller, page_id)
            self.writable(page)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the page first.")
            digest = self.security.digest("public.handover.offer", page_id, to_id, expected)
            existing = database.scalar(select(PageHandover).where(
                PageHandover.page_id == page.id, PageHandover.from_account_id == page.owner_id,
                PageHandover.request_key == key,
            ))
            if existing is not None:
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original offer.")
                return self.handover_view(database, existing, page)
            recipient = database.scalar(select(PageModerator.id).where(
                PageModerator.page_id == page.id, PageModerator.account_id == to_id, PageModerator.status == "active",
            ))
            if recipient is None:
                raise DomainError(409, "MODERATOR_REQUIRED", "Offer the page to a person who is a current moderator.")
            if expected != self.page_etag(page):
                raise DomainError(412, "CONTENT_CHANGED", "This page changed since you reviewed it. Reload to continue.")
            pending = database.scalar(select(PageHandover).where(
                PageHandover.page_id == page.id, PageHandover.status == "pending",
            ).with_for_update().execution_options(populate_existing=True))
            if pending is not None:
                stale = pending.expires_at <= self.clock() or pending.source_version != page.version
                old_session = database.get(AccountSession, pending.from_session_id, populate_existing=True)
                stale = stale or old_session is None or old_session.revoked_at is not None or old_session.expires_at <= self.clock()
                if not stale:
                    raise DomainError(409, "HANDOVER_PENDING", "Cancel the current handover offer before starting another.")
                pending.status = "expired" if pending.expires_at <= self.clock() else "invalidated"
                pending.resolved_at = self.clock()
                pending.expires_at = None
                pending.version += 1
                self.record(database, caller.id, page.id, pending.id, f"public.handover_{pending.status}")
                database.flush()
            caller, session = self.recent(database, token)
            now = self.clock()
            offer = PageHandover(
                id=str(uuid4()), page_id=page.id, from_account_id=caller.id, to_account_id=to_id,
                from_session_id=session.id, source_version=page.version, request_key=key, request_digest=digest,
                status="pending", version=1, created_at=now,
                expires_at=min(now + HANDOVER_OFFER_LIFETIME, session.expires_at),
            )
            database.add(offer)
            database.flush()
            self.record(database, caller.id, page.id, offer.id, "public.handover_offered")
            return self.handover_view(database, offer, page)

    def page_handover(self, token, page_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            offer = database.scalar(select(PageHandover).where(PageHandover.page_id == page_id)
                                    .order_by(PageHandover.created_at.desc(), PageHandover.id.desc()).limit(1))
            page = database.get(PublicPage, page_id)
            if offer is None or page is None or user.id not in (offer.from_account_id, offer.to_account_id):
                raise not_found("Handover offer")
            return self.handover_view(database, offer, page)

    def my_handover_offers(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            rows = database.execute(select(PageHandover, PublicPage).join(
                PublicPage, PublicPage.id == PageHandover.page_id,
            ).where(
                PageHandover.to_account_id == user.id, PageHandover.status == "pending",
                PageHandover.expires_at > self.clock(),
            ).order_by(PageHandover.created_at, PageHandover.id)).all()
            return [self.handover_view(database, offer, page) for offer, page in rows
                    if self.handover_state(database, offer, page) == "pending"]

    def respond_handover(self, token, page_id, identifier, action, expected):
        outcome = {"accept": "accepted", "decline": "declined", "cancel": "cancelled"}[action]
        with self.identity.signed_in_write(token) as (database, caller):
            # The page is locked before the offer, as offering and deleting do, so an answer cannot deadlock with them.
            page = database.scalar(select(PublicPage).where(PublicPage.id == page_id)
                                   .with_for_update().execution_options(populate_existing=True))
            offer = database.scalar(select(PageHandover).where(PageHandover.id == identifier)
                                    .with_for_update().execution_options(populate_existing=True))
            if offer is None or page is None or offer.page_id != page_id:
                raise not_found("Handover offer")
            expected_actor = offer.from_account_id if action == "cancel" else offer.to_account_id
            if caller.id != expected_actor:
                raise not_found("Handover offer")
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the exact handover offer first.")
            if offer.status == outcome:
                if offer.decision_etag != expected:
                    raise DomainError(409, "HANDOVER_CLOSED", "Use the original reviewed action to reconcile this offer.")
                return self.handover_view(database, offer, page)
            if offer.status != "pending":
                raise DomainError(409, "HANDOVER_CLOSED", "This handover offer has already ended.")
            if expected != self.handover_etag(offer):
                raise DomainError(412, "CONTENT_CHANGED", "This handover offer changed since you reviewed it. Reload to continue.")
            if action == "accept":
                self.recent(database, token)
                state = self.handover_state(database, offer, page)
                if state == "expired":
                    raise DomainError(410, "HANDOVER_EXPIRED", "This handover offer expired.")
                if state != "pending":
                    raise DomainError(409, "HANDOVER_INVALIDATED", "The handover offer is no longer valid.")
                if database.scalar(select(func.count()).select_from(PublicPage).where(
                    self.present_pages(offer.to_account_id),
                )) >= MAX_PAGES_PER_OWNER:
                    raise DomainError(409, "PAGE_LIMIT_REACHED", "The new owner already keeps the most pages.")
                now = self.clock()
                recipient_row = database.scalar(select(PageModerator).where(
                    PageModerator.page_id == page.id, PageModerator.account_id == offer.to_account_id,
                    PageModerator.status == "active",
                ).with_for_update())
                # The moderator steps up, and the old owner takes their place as a moderator.
                recipient_row.status = "stepped_down"
                recipient_row.resolved_at = now
                recipient_row.version += 1
                database.add(PageModerator(
                    id=str(uuid4()), page_id=page.id, account_id=offer.from_account_id, invited_by_id=offer.to_account_id,
                    status="active", version=1, request_key=str(uuid4()),
                    request_digest=self.security.digest("public.moderator.handover", offer.id),
                    created_at=now, resolved_at=now,
                ))
                page.owner_id = offer.to_account_id
                page.version += 1
                page.updated_at = now
                database.flush()
                # An invitation the old owner left waiting is not the new owner's to keep.
                for waiting in database.scalars(select(PageModerator).where(
                    PageModerator.page_id == page.id, PageModerator.status == "pending",
                ).with_for_update()).all():
                    waiting.status = "invalidated"
                    waiting.resolved_at = now
                    waiting.expires_at = None
                    waiting.version += 1
                    self.record(database, caller.id, page.id, waiting.id, "public.moderator_invalidated")
                # Hidden posts are visible only to their author, so the new owner could neither see nor free a pin on one they did not write (T109).
                for hidden in database.scalars(select(PublicPost).where(
                    PublicPost.page_id == page.id, PublicPost.pinned_at.is_not(None),
                    PublicPost.moderation_hidden_at.is_not(None), PublicPost.author_id != offer.to_account_id,
                ).with_for_update()).all():
                    hidden.pinned_at = None
                    self.record(database, caller.id, page.id, hidden.id, "public.post_unpinned")
                database.flush()
            offer.status = outcome
            offer.resolved_at = self.clock()
            offer.expires_at = None
            offer.decision_etag = expected
            offer.version += 1
            self.record(database, caller.id, page.id, offer.id, f"public.handover_{outcome}")
            database.flush()
            return self.handover_view(database, offer, page)

    # Archiving, deleting and restoring a page (DEC-025 part 5)

    def archive_page(self, token, page_id, etag):
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
            if page.status == "read_only":
                return self.page_view(database, page, user)
            self.writable(page)
            self.require_etag(etag, self.page_etag(page), "page")
            page.status = "read_only"
            page.version += 1
            page.updated_at = self.clock()
            self.record(database, user.id, page.id, page.id, "public.page_archived")
            database.flush()
            return self.page_view(database, page, user)

    def restore_page(self, token, page_id, etag):
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
            if page.status == "active":
                return self.page_view(database, page, user)
            if page.status == "deleted":
                if page.purge_after is None or page.purge_after <= self.clock():
                    raise DomainError(410, "PAGE_RESTORE_EXPIRED", "The seven days to restore this page have passed.")
                self.require_etag(etag, self.page_etag(page), "page")
                page.status = page.pre_delete_status or "active"
                page.pre_delete_status = None
                page.purge_after = None
                page.deleted_at = None
            elif page.status == "read_only":
                self.require_etag(etag, self.page_etag(page), "page")
                page.status = "active"
            else:
                raise not_found("Page")
            page.version += 1
            page.updated_at = self.clock()
            self.record(database, user.id, page.id, page.id, "public.page_restored")
            database.flush()
            return self.page_view(database, page, user)

    def delete_page(self, token, page_id, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
            if page.status == "deleted":
                return self.page_view(database, page, user)
            if page.status not in ("active", "read_only"):
                raise not_found("Page")
            if body.confirm != page.name:
                raise DomainError(409, "PAGE_NAME_MISMATCH", "Type the page's name exactly to delete it.")
            self.require_etag(etag, self.page_etag(page), "page")
            now = self.clock()
            page.pre_delete_status = page.status
            page.status = "deleted"
            page.deleted_at = now
            page.purge_after = now + PAGE_PURGE_GRACE
            page.version += 1
            page.updated_at = now
            # Pending invitations and offers end with the page; restoring it does not revive them.
            for waiting in database.scalars(select(PageModerator).where(
                PageModerator.page_id == page.id, PageModerator.status == "pending",
            ).with_for_update()).all():
                waiting.status = "invalidated"
                waiting.resolved_at = now
                waiting.expires_at = None
                waiting.version += 1
                self.record(database, user.id, page.id, waiting.id, "public.moderator_invalidated")
            for waiting in database.scalars(select(PageHandover).where(
                PageHandover.page_id == page.id, PageHandover.status == "pending",
            ).with_for_update()).all():
                waiting.status = "invalidated"
                waiting.resolved_at = now
                waiting.expires_at = None
                waiting.version += 1
                self.record(database, user.id, page.id, waiting.id, "public.handover_invalidated")
            self.record(database, user.id, page.id, page.id, "public.page_deleted")
            database.flush()
            return self.page_view(database, page, user)
