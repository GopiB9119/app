from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User

TOPICS = ("community", "education", "health", "local", "family", "events", "hobbies", "support", "news", "other")
REPORT_REASONS = ("spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other")


def listed(values):
    return ", ".join(f"'{value}'" for value in values)


class PublicPage(Base):
    __tablename__ = "public_pages"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="ck_public_page_status"),
        CheckConstraint(f"topic IN ({listed(TOPICS)})", name="ck_public_page_topic"),
        CheckConstraint("handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'", name="ck_public_page_handle"),
        CheckConstraint("follower_count >= 0 AND version >= 1", name="ck_public_page_counts"),
        UniqueConstraint("handle", name="uq_public_page_handle"),
        UniqueConstraint("owner_id", "creation_key", name="uq_public_page_creation"),
        Index("ix_public_page_owner", "owner_id"),
        Index("ix_public_page_popularity", "follower_count", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    handle: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(String(20))
    owner_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    status: Mapped[str] = mapped_column(String(16))
    follower_count: Mapped[int] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
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
