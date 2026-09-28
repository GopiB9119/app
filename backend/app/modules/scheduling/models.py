from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationPreference
from app.modules.planning.models import Task


class Reminder(Base):
    __tablename__ = "reminders"
    __table_args__ = (
        UniqueConstraint("id", "account_id", name="uq_reminder_recipient"),
        UniqueConstraint("account_id", "request_key", name="uq_reminder_request"),
        ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_task_scope"),
        CheckConstraint("status IN ('scheduled', 'available', 'cancelled', 'suppressed', 'expired', 'failed')", name="ck_reminder_status"),
        CheckConstraint("dispatch_attempts >= 0", name="ck_reminder_dispatch_attempts"),
        CheckConstraint("source_version > 0 AND preference_generation > 0 AND version > 0", name="ck_reminder_versions"),
        CheckConstraint("expires_at > scheduled_at", name="ck_reminder_expiry"),
        CheckConstraint("acknowledged_at IS NULL OR status = 'available'", name="ck_reminder_acknowledgment"),
        Index("ix_reminder_due", "status", "scheduled_at", "id"),
        Index("ix_reminder_account", "account_id", "id"),
        Index("uq_reminder_pending_task", "task_id", "account_id", unique=True, postgresql_where=text("status = 'scheduled'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey(Task.id))
    space_id: Mapped[str] = mapped_column(String(36))
    account_id: Mapped[str] = mapped_column(ForeignKey(NotificationPreference.account_id))
    admission_id: Mapped[str] = mapped_column(String(36))
    source_version: Mapped[int] = mapped_column(Integer)
    preference_generation: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    local_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    timezone: Mapped[str] = mapped_column(String(64))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="scheduled")
    reason: Mapped[str | None] = mapped_column(String(40))
    version: Mapped[int] = mapped_column(Integer, default=1)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dispatch_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReminderEvent(Base):
    __tablename__ = "reminder_events"
    __table_args__ = (
        CheckConstraint(
            "(actor_kind = 'user' AND actor_account_id IS NOT NULL) OR "
            "(actor_kind = 'scheduler' AND actor_account_id IS NULL)",
            name="ck_reminder_event_actor",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reminder_id: Mapped[str] = mapped_column(ForeignKey(Reminder.id), index=True)
    actor_kind: Mapped[str] = mapped_column(String(16))
    actor_account_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))
    action: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReminderRequest(Base):
    __tablename__ = "reminder_requests"
    __table_args__ = (
        UniqueConstraint("requested_by_id", "request_key", name="uq_reminder_proposal_request"),
        UniqueConstraint("reminder_id", name="uq_reminder_proposal_schedule"),
        ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_proposal_task"),
        ForeignKeyConstraint(["reminder_id", "recipient_account_id"], ["reminders.id", "reminders.account_id"], name="fk_reminder_proposal_recipient"),
        CheckConstraint("requested_by_id <> recipient_account_id", name="ck_reminder_proposal_other_recipient"),
        CheckConstraint("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'outdated')", name="ck_reminder_proposal_status"),
        CheckConstraint("source_version > 0 AND version > 0", name="ck_reminder_proposal_versions"),
        CheckConstraint("expires_at <= scheduled_at AND dispatch_expires_at > scheduled_at", name="ck_reminder_proposal_expiry"),
        CheckConstraint("(status = 'accepted') = (reminder_id IS NOT NULL)", name="ck_reminder_proposal_schedule"),
        CheckConstraint("(status = 'pending') = (resolved_at IS NULL)", name="ck_reminder_proposal_resolution"),
        Index("ix_reminder_proposal_recipient", "recipient_account_id", "id"),
        Index("ix_reminder_proposal_requester", "requested_by_id", "id"),
        Index("uq_reminder_proposal_pending", "task_id", "recipient_account_id", unique=True, postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey(Task.id))
    space_id: Mapped[str] = mapped_column(String(36))
    requested_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    requester_admission_id: Mapped[str] = mapped_column(String(36))
    recipient_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    recipient_admission_id: Mapped[str] = mapped_column(String(36))
    source_version: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    schedule_key: Mapped[str] = mapped_column(String(36))
    local_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    timezone: Mapped[str] = mapped_column(String(64))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    dispatch_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    version: Mapped[int] = mapped_column(Integer, default=1)
    reminder_id: Mapped[str | None] = mapped_column(String(36))


class ReminderRequestEvent(Base):
    __tablename__ = "reminder_request_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_id: Mapped[str] = mapped_column(ForeignKey(ReminderRequest.id), index=True)
    actor_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    action: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))