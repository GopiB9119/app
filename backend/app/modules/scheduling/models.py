from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationPreference
from app.modules.planning.models import Task


class ReminderSeries(Base):
    """A person's repeating reminder rule for one task. Each occurrence becomes a reminder row when it is next."""

    __tablename__ = "reminder_series"
    __table_args__ = (
        UniqueConstraint("id", "account_id", name="uq_reminder_series_owner"),
        UniqueConstraint("account_id", "request_key", name="uq_reminder_series_request"),
        ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_series_task"),
        CheckConstraint("status IN ('active', 'paused', 'cancelled', 'ended', 'suppressed')", name="ck_reminder_series_status"),
        CheckConstraint("(status IN ('paused', 'suppressed')) = (reason IS NOT NULL)", name="ck_reminder_series_reason"),
        CheckConstraint(
            "(frequency = 'daily' AND repeat_every BETWEEN 1 AND 30 AND weekday_mask = 0) OR "
            "(frequency = 'weekly' AND repeat_every BETWEEN 1 AND 4 AND weekday_mask BETWEEN 1 AND 127)",
            name="ck_reminder_series_rule",
        ),
        CheckConstraint("clock_change_policy IN ('shift_forward', 'skip')", name="ck_reminder_series_clock_policy"),
        CheckConstraint("local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'", name="ck_reminder_series_time"),
        CheckConstraint("end_date >= start_date AND end_date - start_date <= 365", name="ck_reminder_series_span"),
        CheckConstraint("source_version > 0 AND preference_generation > 0 AND version > 0", name="ck_reminder_series_versions"),
        CheckConstraint("replaced_by_id IS NULL OR status = 'cancelled'", name="ck_reminder_series_replacement"),
        Index("ix_reminder_series_account", "account_id", "id"),
        Index("uq_reminder_series_open_task", "task_id", "account_id", unique=True, postgresql_where=text("status IN ('active', 'paused')")),
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
    frequency: Mapped[str] = mapped_column(String(8))
    repeat_every: Mapped[int] = mapped_column(Integer)
    weekday_mask: Mapped[int] = mapped_column(Integer)
    local_time: Mapped[str] = mapped_column(String(5))
    timezone: Mapped[str] = mapped_column(String(64))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    clock_change_policy: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="active")
    reason: Mapped[str | None] = mapped_column(String(40))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[str | None] = mapped_column(ForeignKey("reminder_series.id"))


class ReminderSeriesEvent(Base):
    __tablename__ = "reminder_series_events"
    __table_args__ = (
        CheckConstraint(
            "(actor_kind = 'user' AND actor_account_id IS NOT NULL) OR "
            "(actor_kind = 'scheduler' AND actor_account_id IS NULL)",
            name="ck_reminder_series_event_actor",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    series_id: Mapped[str] = mapped_column(ForeignKey(ReminderSeries.id), index=True)
    actor_kind: Mapped[str] = mapped_column(String(16))
    actor_account_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))
    action: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReminderSeriesCommand(Base):
    """Receipt for a series change, so a retried request never applies twice."""

    __tablename__ = "reminder_series_commands"
    __table_args__ = (
        CheckConstraint("operation IN ('pause', 'resume', 'skip', 'cancel', 'replace', 'move')", name="ck_reminder_series_command_operation"),
        Index("ix_reminder_series_command_series", "series_id"),
    )

    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    request_key: Mapped[str] = mapped_column(String(36), primary_key=True)
    series_id: Mapped[str] = mapped_column(ForeignKey(ReminderSeries.id))
    operation: Mapped[str] = mapped_column(String(8))
    input_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Reminder(Base):
    __tablename__ = "reminders"
    __table_args__ = (
        UniqueConstraint("id", "account_id", name="uq_reminder_recipient"),
        UniqueConstraint("account_id", "request_key", name="uq_reminder_request"),
        UniqueConstraint("series_id", "occurrence_date", name="uq_reminder_series_occurrence"),
        UniqueConstraint("follow_up_of", name="uq_reminder_follow_up"),
        ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_task_scope"),
        ForeignKeyConstraint(["series_id", "account_id"], ["reminder_series.id", "reminder_series.account_id"], name="fk_reminder_series_owner"),
        ForeignKeyConstraint(["follow_up_of", "account_id"], ["reminders.id", "reminders.account_id"], name="fk_reminder_follow_up"),
        CheckConstraint("status IN ('scheduled', 'available', 'cancelled', 'suppressed', 'expired', 'failed')", name="ck_reminder_status"),
        CheckConstraint("dispatch_attempts >= 0", name="ck_reminder_dispatch_attempts"),
        CheckConstraint("source_version > 0 AND preference_generation > 0 AND version > 0", name="ck_reminder_versions"),
        CheckConstraint("expires_at > scheduled_at", name="ck_reminder_expiry"),
        CheckConstraint("acknowledged_at IS NULL OR status = 'available'", name="ck_reminder_acknowledgment"),
        # A plain reminder, one occurrence of a series, or a snoozed follow-up of an earlier reminder.
        CheckConstraint(
            "snooze_count BETWEEN 0 AND 3 AND (follow_up_of IS NULL) = (snooze_count = 0) "
            "AND (occurrence_date IS NULL OR (series_id IS NOT NULL AND follow_up_of IS NULL)) "
            "AND (series_id IS NULL OR occurrence_date IS NOT NULL OR follow_up_of IS NOT NULL)",
            name="ck_reminder_kind",
        ),
        Index("ix_reminder_due", "status", "scheduled_at", "id"),
        Index("ix_reminder_account", "account_id", "id"),
        Index("uq_reminder_pending_task", "task_id", "account_id", unique=True,
              postgresql_where=text("status = 'scheduled' AND series_id IS NULL AND follow_up_of IS NULL")),
        Index("uq_reminder_series_pending", "series_id", unique=True,
              postgresql_where=text("status = 'scheduled' AND follow_up_of IS NULL")),
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
    series_id: Mapped[str | None] = mapped_column(String(36))
    occurrence_date: Mapped[date | None] = mapped_column(Date)
    follow_up_of: Mapped[str | None] = mapped_column(String(36))
    snooze_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))


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