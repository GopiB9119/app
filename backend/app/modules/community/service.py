from datetime import timedelta
from uuid import UUID, uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.errors import DomainError
from app.modules.community.models import (
    AccountBlock,
    CommunityAuditEvent,
    ContentReport,
    PageFollow,
    PostComment,
    PostReaction,
    PublicPage,
    PublicPost,
    SavedPost,
)
from app.modules.community.schemas import (
    BlockOutcome,
    BlockView,
    CommentView,
    CommunityCursor,
    PageView,
    PostOutcome,
    PostView,
    ReportView,
)
from app.modules.identity.models import OutboxEvent, User
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
CURSOR_MINUTES = 15


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

    def page_view(self, database, page, viewer, following=None, blocked=None):
        manager = viewer is not None and page.owner_id == viewer.id
        if viewer is not None and following is None:
            following = database.get(PageFollow, (page.id, viewer.id)) is not None
        if viewer is not None and blocked is None:
            blocked = page.id in self.blocked(database, viewer, "page")
        return PageView(
            id=page.id, handle=page.handle, name=page.name, description=page.description, topic=page.topic,
            follower_count=page.follower_count, created_at=page.created_at, updated_at=page.updated_at,
            following=bool(following), blocked=bool(blocked), can_manage=manager,
            etag=self.page_etag(page) if manager else None,
        )

    def page_views(self, database, pages, viewer):
        ids = [page.id for page in pages]
        followed = set()
        if viewer is not None and ids:
            followed = set(database.scalars(select(PageFollow.page_id).where(PageFollow.account_id == viewer.id, PageFollow.page_id.in_(ids))))
        blocked = self.blocked(database, viewer, "page")
        return [self.page_view(database, page, viewer, page.id in followed, page.id in blocked) for page in pages]

    def post_views(self, database, rows, viewer):
        ids = [post.id for post, _page in rows]
        liked, saved = set(), set()
        if viewer is not None and ids:
            liked = set(database.scalars(select(PostReaction.post_id).where(PostReaction.account_id == viewer.id, PostReaction.post_id.in_(ids))))
            saved = set(database.scalars(select(SavedPost.post_id).where(SavedPost.account_id == viewer.id, SavedPost.post_id.in_(ids))))
        views = []
        for post, page in rows:
            manager = viewer is not None and page.owner_id == viewer.id
            views.append(PostView(
                id=post.id, page_id=page.id, page_handle=page.handle, page_name=page.name, title=post.title,
                body=post.body, status=post.status, like_count=post.like_count, comment_count=post.comment_count,
                created_at=post.created_at, published_at=post.published_at, edited_at=post.edited_at,
                liked=post.id in liked, saved=post.id in saved, can_manage=manager,
                etag=self.post_etag(post) if manager else None,
            ))
        return views

    def find_page(self, database, reference, lock=False):
        column = PublicPage.id if is_uuid(reference) else PublicPage.handle
        statement = select(PublicPage).where(column == reference.lower()).execution_options(populate_existing=True)
        page = database.scalar(statement.with_for_update() if lock else statement)
        if page is None or page.status != "active":
            raise not_found("Page")
        return page

    def managed_page(self, database, user, page_id):
        page = self.find_page(database, page_id, lock=True)
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
        manager = viewer is not None and page.owner_id == viewer.id
        hidden = page.status != "active" or post.status == "deleted" or (post.status == "draft" and not (drafts and manager))
        if hidden or (not manager and page.id in self.blocked(database, viewer, "page")):
            raise not_found("Post")
        return post, page

    # Pages

    def create_page(self, token, body, key):
        digest = self.security.digest("public.page.create", body.handle, body.name, body.description, body.topic)
        with self.identity.signed_in_write(token) as (database, user):
            existing = database.scalar(select(PublicPage).where(PublicPage.owner_id == user.id, PublicPage.creation_key == key))
            if existing is not None:
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original page.")
                if existing.status != "active":
                    raise not_found("Page")
                return self.page_view(database, existing, user)
            owned = database.scalar(select(func.count()).select_from(PublicPage).where(PublicPage.owner_id == user.id, PublicPage.status == "active"))
            if owned >= MAX_PAGES_PER_OWNER:
                raise DomainError(409, "PAGE_LIMIT_REACHED", f"You can own up to {MAX_PAGES_PER_OWNER} public pages in this local build.")
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
            self.record(database, user.id, page.id, page.id, "public.page_created")
            return self.page_view(database, page, user, following=False, blocked=False)

    def read_page(self, token, reference):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            return self.page_view(database, self.find_page(database, reference), viewer)

    def my_pages(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            pages = database.scalars(select(PublicPage).where(
                PublicPage.owner_id == user.id, PublicPage.status == "active",
            ).order_by(PublicPage.created_at, PublicPage.id)).all()
            return self.page_views(database, pages, user)

    def update_page(self, token, page_id, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
            self.require_etag(etag, self.page_etag(page), "page")
            changed = False
            for field in body.model_fields_set:
                value = getattr(body, field)
                if getattr(page, field) != value:
                    setattr(page, field, value)
                    changed = True
            if changed:
                page.version += 1
                page.updated_at = self.clock()
                self.record(database, user.id, page.id, page.id, "public.page_updated")
            database.flush()
            return self.page_view(database, page, user)

    def follow(self, token, page_id, following):
        with self.identity.signed_in_write(token) as (database, user):
            page = self.find_page(database, page_id, lock=True)
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
                PageFollow.account_id == user.id, PublicPage.status == "active",
            )
            rows, more = self.newest_first(database, statement, PageFollow.created_at, PublicPage.id, limit, cursor, "following", user, "")
            next_cursor = self.seal_cursor("following", user, "", rows[-1][0].id, after_time=rows[-1][1]) if more else None
            return self.page_views(database, [page for page, _time in rows], user), Pagination(next_cursor=next_cursor, has_more=more)

    # Posts

    def create_post(self, token, page_id, body, key):
        digest = self.security.digest("public.post.create", page_id, body.title or "", body.body)
        with self.identity.signed_in_write(token) as (database, user):
            page = self.managed_page(database, user, page_id)
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
            now = self.clock()
            post = PublicPost(
                id=str(uuid4()), page_id=page.id, author_id=user.id, title=body.title, body=body.body, status="draft",
                version=1, like_count=0, comment_count=0, creation_key=key, creation_digest=digest,
                created_at=now, updated_at=now,
            )
            database.add(post)
            database.flush()
            self.record(database, user.id, page.id, post.id, "public.post_drafted")
            return self.post_views(database, [(post, page)], user)[0]

    def managed_post(self, database, user, post_id):
        post, page = self.visible_post(database, user, post_id, lock=True, drafts=True)
        if page.owner_id != user.id:
            raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner can change this post.")
        return post, page

    def update_post(self, token, post_id, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.managed_post(database, user, post_id)
            self.require_etag(etag, self.post_etag(post), "post")
            changed = False
            for field in body.model_fields_set:
                value = getattr(body, field)
                if getattr(post, field) != value:
                    setattr(post, field, value)
                    changed = True
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
                post.deleted_at = now
                post.updated_at = now
                post.version += 1
                database.flush()
                self.record(database, user.id, page.id, post.id, "public.post_deleted")
            return PostOutcome(id=post.id, status="deleted")

    def read_post(self, token, post_id):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            return self.post_views(database, [self.visible_post(database, viewer, post_id, drafts=True)], viewer)[0]

    def page_posts(self, token, reference, limit, cursor):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            page = self.find_page(database, reference)
            if page.owner_id != (viewer.id if viewer else None) and page.id in self.blocked(database, viewer, "page"):
                return [], Pagination(next_cursor=None, has_more=False)
            statement = select(PublicPost, PublicPage).join(PublicPage, PublicPage.id == PublicPost.page_id).where(
                PublicPost.page_id == page.id, PublicPost.status == "published",
            )
            rows, more = self.newest_first(database, statement, PublicPost.published_at, PublicPost.id, limit, cursor, "page_posts", viewer, page.id)
            next_cursor = self.seal_cursor("page_posts", viewer, page.id, rows[-1][0].id, after_time=rows[-1][0].published_at) if more else None
            return self.post_views(database, rows, viewer), Pagination(next_cursor=next_cursor, has_more=more)

    def drafts(self, token, page_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            page = self.find_page(database, page_id)
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
                PublicPost.status == "published", PublicPage.status == "active",
            )
            if followed_only:
                statement = statement.join(PageFollow, and_(PageFollow.page_id == PublicPage.id, PageFollow.account_id == viewer.id))
            blocked = self.blocked(database, viewer, "page")
            if blocked:
                statement = statement.where(PublicPage.id.notin_(blocked))
            kind, scope = ("feed" if followed_only else "latest"), ""
            if query:
                pattern = contains(query)
                statement = statement.where(or_(PublicPost.title.ilike(pattern, escape="\\"), PublicPost.body.ilike(pattern, escape="\\")))
                kind, scope = "post_search", self.security.digest("public.post-search", query.lower())
            rows, more = self.newest_first(database, statement, PublicPost.published_at, PublicPost.id, limit, cursor, kind, viewer, scope)
            next_cursor = self.seal_cursor(kind, viewer, scope, rows[-1][0].id, after_time=rows[-1][0].published_at) if more else None
            return self.post_views(database, rows, viewer), Pagination(next_cursor=next_cursor, has_more=more)

    def discover_pages(self, token, query, topic, limit, cursor):
        query = " ".join((query or "").split())
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            statement = select(PublicPage).where(PublicPage.status == "active")
            if query:
                pattern = contains(query)
                statement = statement.where(or_(
                    PublicPage.name.ilike(pattern, escape="\\"), PublicPage.handle.ilike(pattern, escape="\\"),
                    PublicPage.description.ilike(pattern, escape="\\"),
                ))
            if topic:
                statement = statement.where(PublicPage.topic == topic)
            blocked = self.blocked(database, viewer, "page")
            if blocked:
                statement = statement.where(PublicPage.id.notin_(blocked))
            scope = self.security.digest("public.discover", query.lower(), topic or "")
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

    # Likes and saves

    def like(self, token, post_id, liked):
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.visible_post(database, user, post_id, lock=True)
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
            ).where(PublicPost.status == "published", PublicPage.status == "active")
            blocked = self.blocked(database, user, "page")
            if blocked:
                statement = statement.where(PublicPage.id.notin_(blocked))
            rows, more = self.newest_first(database, statement, SavedPost.created_at, PublicPost.id, limit, cursor, "saved", user, "")
            next_cursor = self.seal_cursor("saved", user, "", rows[-1][0].id, after_time=rows[-1][2]) if more else None
            return self.post_views(database, [(post, page) for post, page, _time in rows], user), Pagination(next_cursor=next_cursor, has_more=more)

    # Comments

    def comment_view(self, comment, author, viewer, page):
        mine = viewer is not None and comment.author_id == viewer.id
        manager = viewer is not None and page.owner_id == viewer.id
        return CommentView(
            id=comment.id, post_id=comment.post_id, parent_id=comment.parent_id, author_name=author.display_name,
            body=comment.body, status=comment.status, created_at=comment.created_at, mine=mine,
            can_remove=comment.status == "visible" and (mine or manager),
        )

    def comments(self, token, post_id, limit, cursor):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            post, page = self.visible_post(database, viewer, post_id)
            if post.status != "published":
                return [], Pagination(next_cursor=None, has_more=False)
            statement = select(PostComment, User).join(User, User.id == PostComment.author_id).where(PostComment.post_id == post.id)
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
            return [self.comment_view(comment, author, viewer, page) for comment, author in rows], Pagination(next_cursor=next_cursor, has_more=more)

    def create_comment(self, token, post_id, body, key):
        parent_id = str(body.parent_id) if body.parent_id else None
        digest = self.security.digest("public.comment.create", post_id, parent_id or "", body.body)
        with self.identity.signed_in_write(token) as (database, user):
            post, page = self.visible_post(database, user, post_id, lock=True)
            if post.status != "published":
                raise not_found("Post")
            existing = database.scalar(select(PostComment).where(PostComment.author_id == user.id, PostComment.creation_key == key))
            if existing is not None:
                if existing.creation_digest != digest or existing.post_id != post.id:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original comment.")
                return self.comment_view(existing, user, user, page)
            if page.owner_id != user.id and database.scalar(select(AccountBlock.id).where(
                AccountBlock.blocker_id == page.owner_id, AccountBlock.target_type == "account", AccountBlock.target_id == user.id,
            )) is not None:
                raise DomainError(403, "COMMENTING_UNAVAILABLE", "You cannot comment on this page.")
            if parent_id:
                parent = database.scalar(select(PostComment).where(PostComment.id == parent_id, PostComment.post_id == post.id))
                if parent is None:
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
                raise DomainError(429, "COMMENT_RATE_LIMITED", "You are commenting quickly. Wait a minute, then retry.")
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
            return self.comment_view(comment, user, user, page)

    def end_comment(self, token, comment_id):
        with self.identity.signed_in_write(token) as (database, user):
            located = database.scalar(select(PostComment.post_id).where(PostComment.id == comment_id))
            if located is None:
                raise not_found("Comment")
            post, page = self.visible_post(database, user, located, lock=True)
            comment = database.scalar(select(PostComment).where(PostComment.id == comment_id).with_for_update().execution_options(populate_existing=True))
            mine = comment.author_id == user.id
            manager = page.owner_id == user.id
            if not mine and not manager:
                raise DomainError(403, "COMMENT_NOT_YOURS", "Only the author or the page owner can remove this comment.")
            if comment.status == "visible":
                comment.status = "deleted" if mine else "removed"
                comment.body = None
                comment.ended_at = self.clock()
                post.comment_count -= 1
                database.flush()
                self.record(database, user.id, page.id, comment.id, f"public.comment_{comment.status}", audited=not mine)
            author = database.get(User, comment.author_id)
            return self.comment_view(comment, author, user, page)

    # Reports and blocks

    def report(self, token, body):
        target_id = str(body.target_id)
        with self.identity.signed_in_write(token) as (database, user):
            if body.target_type == "page":
                owner = self.find_page(database, target_id).owner_id
            elif body.target_type == "post":
                post = database.get(PublicPost, target_id)
                page = database.get(PublicPage, post.page_id) if post else None
                if post is None or post.status != "published" or page.status != "active":
                    raise not_found("Post")
                owner = page.owner_id
            else:
                comment = database.get(PostComment, target_id)
                post = database.get(PublicPost, comment.post_id) if comment else None
                page = database.get(PublicPage, post.page_id) if post else None
                if comment is None or comment.status != "visible" or post.status != "published" or page.status != "active":
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
                page = self.find_page(database, reference, lock=True)
                if page.owner_id == user.id:
                    raise DomainError(409, "OWN_CONTENT", "You cannot block your own page.")
                target_type, target_id = "page", page.id
            else:
                comment = database.get(PostComment, reference)
                if comment is None:
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
