from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import AccountSession, User

TOPICS = ("community", "education", "health", "local", "family", "events", "hobbies", "support", "news", "other")
REPORT_REASONS = ("spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other")


def listed(values):
    return ", ".join(f"'{value}'" for value in values)


class PublicPage(Base):
    __tablename__ = "public_pages"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived', 'read_only', 'deleted')", name="ck_public_page_status"),
        CheckConstraint("pre_delete_status IS NULL OR pre_delete_status IN ('active', 'read_only')", name="ck_public_page_restore"),
        CheckConstraint(f"topic IN ({listed(TOPICS)})", name="ck_public_page_topic"),
        CheckConstraint("handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'", name="ck_public_page_handle"),
        CheckConstraint("follower_count >= 0 AND version >= 1", name="ck_public_page_counts"),
        CheckConstraint("char_length(rules) <= 2000", name="ck_public_page_rules"),
        UniqueConstraint("handle", name="uq_public_page_handle"),
        UniqueConstraint("owner_id", "creation_key", name="uq_public_page_creation"),
        Index("ix_public_page_owner", "owner_id"),
        Index("ix_public_page_popularity", "follower_count", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    handle: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    rules: Mapped[str] = mapped_column(Text, default="", server_default="")
    topic: Mapped[str] = mapped_column(String(20))
    owner_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    status: Mapped[str] = mapped_column(String(16))
    follower_count: Mapped[int] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purge_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pre_delete_status: Mapped[str | None] = mapped_column(String(16))
    moderation_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_public_pages_moderation_decision"),
    )


class PageFollow(Base):
    __tablename__ = "public_page_follows"
    __table_args__ = (Index("ix_public_follow_account", "account_id", "created_at"),)

    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


MODERATOR_STATES = (
    "pending", "active", "declined", "cancelled", "withdrawn", "removed", "stepped_down", "expired", "invalidated",
)


class PageModerator(Base):
    """One invitation or active appointment (DEC-025 part 3). A resolved row keeps its history; only 'pending' rows expire."""

    __tablename__ = "page_moderators"
    __table_args__ = (
        CheckConstraint(f"status IN ({listed(MODERATOR_STATES)})", name="ck_page_moderator_status"),
        CheckConstraint("version > 0 AND (expires_at IS NULL OR expires_at > created_at)", name="ck_page_moderator_bounds"),
        CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL) AND (status = 'pending') = (expires_at IS NOT NULL)",
            name="ck_page_moderator_resolution",
        ),
        CheckConstraint("account_id <> invited_by_id", name="ck_page_moderator_participants"),
        UniqueConstraint("page_id", "invited_by_id", "request_key", name="uq_page_moderator_request"),
        Index("uq_page_moderator_pending", "page_id", unique=True, postgresql_where=text("status = 'pending'")),
        Index("uq_page_moderator_active", "page_id", "account_id", unique=True, postgresql_where=text("status = 'active'")),
        Index("ix_page_moderator_account", "account_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    invited_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    status: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    decision_etag: Mapped[str | None] = mapped_column(String(70))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PageHandover(Base):
    """One offer to hand a page to a current moderator (DEC-025 part 4)."""

    __tablename__ = "page_handovers"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated')", name="ck_page_handover_status"),
        CheckConstraint("version > 0 AND source_version > 0 AND (expires_at IS NULL OR expires_at > created_at)", name="ck_page_handover_bounds"),
        CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL) AND (status = 'pending') = (expires_at IS NOT NULL)",
            name="ck_page_handover_resolution",
        ),
        CheckConstraint("from_account_id <> to_account_id", name="ck_page_handover_participants"),
        UniqueConstraint("page_id", "from_account_id", "request_key", name="uq_page_handover_request"),
        Index("uq_page_handover_pending", "page_id", unique=True, postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    from_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    to_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    from_session_id: Mapped[str] = mapped_column(ForeignKey(AccountSession.id))
    source_version: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    decision_etag: Mapped[str | None] = mapped_column(String(70))
    status: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PublicPost(Base):
    __tablename__ = "public_posts"
    __table_args__ = (
        CheckConstraint(
            "(status = 'draft' AND published_at IS NULL AND deleted_at IS NULL AND body IS NOT NULL) OR "
            "(status = 'published' AND published_at IS NOT NULL AND deleted_at IS NULL AND body IS NOT NULL) OR "
            "(status = 'deleted' AND deleted_at IS NOT NULL AND body IS NULL AND title IS NULL)",
            name="ck_public_post_state",
        ),
        CheckConstraint("version >= 1 AND like_count >= 0 AND comment_count >= 0", name="ck_public_post_counts"),
        UniqueConstraint("page_id", "author_id", "creation_key", name="uq_public_post_creation"),
        Index("ix_public_post_published", "status", "published_at", "id"),
        Index("ix_public_post_page", "page_id", "status", "published_at", "id"),
        Index("ix_public_post_pinned", "page_id", "pinned_at", postgresql_where=text("pinned_at IS NOT NULL")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    author_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    title: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer)
    like_count: Mapped[int] = mapped_column(Integer)
    comment_count: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Only published posts count as pinned; a stale time on another state is ignored, never shown.
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_public_posts_moderation_decision"),
    )


class PostComment(Base):
    __tablename__ = "public_post_comments"
    __table_args__ = (
        CheckConstraint("status IN ('visible', 'deleted', 'removed')", name="ck_public_comment_status"),
        CheckConstraint("(status = 'visible') = (body IS NOT NULL AND ended_at IS NULL)", name="ck_public_comment_body"),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="ck_public_comment_parent"),
        UniqueConstraint("post_id", "id", name="uq_public_comment_post"),
        UniqueConstraint("author_id", "creation_key", name="uq_public_comment_creation"),
        ForeignKeyConstraint(
            ["post_id", "parent_id"], ["public_post_comments.post_id", "public_post_comments.id"],
            name="fk_public_comment_same_post",
        ),
        Index("ix_public_comment_post_time", "post_id", "created_at", "id"),
        Index("ix_public_comment_author_time", "author_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey(PublicPost.id))
    parent_id: Mapped[str | None] = mapped_column(String(36))
    author_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_public_post_comments_moderation_decision"),
    )


class PostReaction(Base):
    __tablename__ = "public_post_reactions"
    __table_args__ = (CheckConstraint("kind = 'like'", name="ck_public_reaction_kind"),)

    post_id: Mapped[str] = mapped_column(ForeignKey(PublicPost.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SavedPost(Base):
    __tablename__ = "public_saved_posts"
    __table_args__ = (Index("ix_public_saved_account", "account_id", "created_at"),)

    post_id: Mapped[str] = mapped_column(ForeignKey(PublicPost.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ContentReport(Base):
    __tablename__ = "content_reports"
    __table_args__ = (
        CheckConstraint("target_type IN ('page', 'post', 'comment')", name="ck_content_report_target"),
        CheckConstraint(f"reason IN ({listed(REPORT_REASONS)})", name="ck_content_report_reason"),
        CheckConstraint("status IN ('received', 'reviewing', 'closed')", name="ck_content_report_status"),
        Index(
            "uq_content_report_open", "reporter_id", "target_type", "target_id",
            unique=True, postgresql_where=text("status = 'received'"),
        ),
        Index("ix_content_report_queue", "status", "created_at"),
        Index("ix_content_report_reporter", "reporter_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reporter_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(24))
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_content_report_decision"),
    )


class AccountBlock(Base):
    __tablename__ = "account_blocks"
    __table_args__ = (
        CheckConstraint("target_type IN ('page', 'account')", name="ck_account_block_target"),
        CheckConstraint("target_type <> 'account' OR target_id <> blocker_id", name="ck_account_block_self"),
        UniqueConstraint("blocker_id", "target_type", "target_id", name="uq_account_block"),
        Index("ix_account_block_target", "target_type", "target_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    blocker_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CommunityAuditEvent(Base):
    __tablename__ = "community_audit_events"
    __table_args__ = (Index("ix_community_audit_page", "page_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    page_id: Mapped[str | None] = mapped_column(ForeignKey(PublicPage.id))
    target_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
