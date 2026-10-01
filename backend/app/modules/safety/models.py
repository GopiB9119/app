from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.community.models import REPORT_REASONS, listed


class PlatformModerator(Base):
    __tablename__ = "platform_moderators"

    account_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    added_by: Mapped[str] = mapped_column(Text)


class ModerationDecision(Base):
    __tablename__ = "moderation_decisions"
    __table_args__ = (
        CheckConstraint("target_type IN ('page', 'post', 'comment')", name="ck_moderation_decision_target"),
        CheckConstraint("action IN ('no_action', 'hide', 'restore')", name="ck_moderation_decision_action"),
        CheckConstraint(f"reason IN ({listed(REPORT_REASONS)})", name="ck_moderation_decision_reason"),
        CheckConstraint("char_length(moderator_note) <= 1000", name="ck_moderation_decision_note"),
        UniqueConstraint("decided_by", "creation_key", name="uq_moderation_decision_creation"),
        Index("ix_moderation_decision_target", "target_type", "target_id", "decided_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(String(24))
    moderator_note: Mapped[str] = mapped_column(Text)
    decided_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    appeal_of: Mapped[str | None] = mapped_column(ForeignKey("moderation_decisions.id"))
    creation_key: Mapped[str | None] = mapped_column(String(36))
    creation_digest: Mapped[str | None] = mapped_column(String(64))


class ModerationAppeal(Base):
    __tablename__ = "moderation_appeals"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'upheld', 'overturned')", name="ck_moderation_appeal_status"),
        CheckConstraint("char_length(note) <= 1000", name="ck_moderation_appeal_note"),
        CheckConstraint("char_length(resolution_note) <= 1000", name="ck_moderation_appeal_resolution_note"),
        CheckConstraint(
            "(status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL) OR "
            "(status <> 'open' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)",
            name="ck_moderation_appeal_resolution",
        ),
        UniqueConstraint("decision_id", name="uq_moderation_appeal_decision"),
        UniqueConstraint("account_id", "creation_key", name="uq_moderation_appeal_creation"),
        Index("ix_moderation_appeal_status", "status", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    decision_id: Mapped[str] = mapped_column(ForeignKey("moderation_decisions.id"))
    account_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))