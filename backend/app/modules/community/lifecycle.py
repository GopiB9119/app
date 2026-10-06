"""Erasing a deleted public page after its seven days (DEC-025 part 5). The handle stays taken, so nobody can reuse it."""

from uuid import uuid4

from sqlalchemy import delete, func, select, text, update

from app.modules.community.models import (
    CommunityAuditEvent,
    HelpPost,
    HelpReply,
    HelpReport,
    PageEvent,
    PageEventResponse,
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
)
from app.modules.identity.models import OutboxEvent


class PageLifecycleService:
    def __init__(self, identity):
        self.identity = identity
        self.sessions = identity.sessions
        self.clock = identity.clock

    def purge_due(self, limit=5):
        """Erases pages whose seven days have ended, one transaction each, and returns counts only."""
        outcome = {"purged": 0}
        for _ in range(limit):
            if not self.purge_next():
                break
            outcome["purged"] += 1
        return outcome

    @staticmethod
    def purge_candidates(now):
        return select(PublicPage).where(
            PublicPage.status == "deleted", PublicPage.purge_after.is_not(None), PublicPage.purge_after <= now,
        )

    def purge_next(self):
        with self.sessions.begin() as database:
            database.execute(text("SET LOCAL lock_timeout = '5s'"))
            now = self.clock()
            page = database.scalar(self.purge_candidates(now).order_by(PublicPage.purge_after, PublicPage.id).limit(1)
            .with_for_update(skip_locked=True).execution_options(populate_existing=True))
            if page is None:
                return False
            posts = select(PublicPost.id).where(PublicPost.page_id == page.id)
            database.execute(update(PublicPost).where(PublicPost.page_id == page.id, PublicPost.status != "deleted").values(
                status="deleted", title=None, body=None, pinned_at=None,
                deleted_at=func.coalesce(PublicPost.deleted_at, now), updated_at=now, version=PublicPost.version + 1,
            ))
            database.execute(update(PostComment).where(
                PostComment.post_id.in_(posts), PostComment.status != "deleted",
            ).values(status="deleted", body=None, ended_at=func.coalesce(PostComment.ended_at, now)))
            database.execute(delete(PostReaction).where(PostReaction.post_id.in_(posts)))
            database.execute(delete(SavedPost).where(SavedPost.post_id.in_(posts)))
            database.execute(delete(PostTerm).where(PostTerm.post_id.in_(posts)))
            database.execute(update(HelpReply).where(
                HelpReply.post_id.in_(select(HelpPost.id).where(HelpPost.page_id == page.id)), HelpReply.status == "active",
            ).values(status="removed", body=None, ended_at=now))
            database.execute(update(HelpReport).where(
                HelpReport.post_id.in_(select(HelpPost.id).where(HelpPost.page_id == page.id)), HelpReport.status == "received",
            ).values(status="closed", outcome="deleted", closed_at=now))
            database.execute(update(HelpPost).where(HelpPost.page_id == page.id, HelpPost.status != "deleted").values(
                status="deleted", title=None, details=None, place=None, need_by=None, helped_reply_id=None, reply_count=0,
                ended_at=func.coalesce(HelpPost.ended_at, now), updated_at=now, version=HelpPost.version + 1,
            ))
            database.execute(delete(PageFollow).where(PageFollow.page_id == page.id))
            database.execute(delete(PageEventResponse).where(
                PageEventResponse.event_id.in_(select(PageEvent.id).where(PageEvent.page_id == page.id)),
            ))
            database.execute(update(PageEvent).where(PageEvent.page_id == page.id, PageEvent.status != "deleted").values(
                status="deleted", title=None, details=None, venue=None, going_count=0, updated_at=now, version=PageEvent.version + 1,
            ))
            database.execute(delete(PageModerator).where(PageModerator.page_id == page.id))
            database.execute(delete(PageHandover).where(PageHandover.page_id == page.id))
            database.execute(delete(PageTerm).where(PageTerm.page_id == page.id))
            page.name = "Deleted page"
            # The erased page keeps no subject either: a health or support topic says something about its owner.
            page.topic = "other"
            page.description = ""
            page.rules = ""
            page.help_open = False
            page.follower_count = 0
            page.purge_after = None
            page.pre_delete_status = None
            page.version += 1
            page.updated_at = now
            identifier = str(uuid4())
            database.add_all([
                CommunityAuditEvent(
                    id=identifier, actor_id=page.owner_id, page_id=page.id, target_id=page.id,
                    action="public.page_purged", created_at=now,
                ),
                OutboxEvent(
                    id=identifier, event_type="public.page_purged", actor_id=page.owner_id,
                    aggregate_id=page.id, schema_version=1, created_at=now,
                ),
            ])
            return True
