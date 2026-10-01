from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (CheckConstraint("generation > 0", name="ck_notification_preference_generation"),)

    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    in_app_reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    generation: Mapped[int] = mapped_column(Integer, default=1)


class InAppNotification(Base):
    __tablename__ = "in_app_notifications"
    __table_args__ = (
        UniqueConstraint("reminder_id", name="uq_notification_reminder"),
        ForeignKeyConstraint(
            ["reminder_id", "account_id"], ["reminders.id", "reminders.account_id"],
            name="fk_notification_recipient",
        ),
        Index("ix_in_app_notification_account", "account_id", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reminder_id: Mapped[str] = mapped_column(String(36))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


CLOCK_TIME = "'^([01][0-9]|2[0-3]):[0-5][0-9]$'"


class AlertSetting(Base):
    """Quiet hours for alerts outside the inbox list, in the account's own timezone. The inbox itself is never held back."""

    __tablename__ = "alert_settings"
    __table_args__ = (
        CheckConstraint("(quiet_start IS NULL) = (quiet_end IS NULL)", name="ck_alert_setting_quiet_pair"),
        CheckConstraint(
            f"quiet_start IS NULL OR (quiet_start <> quiet_end AND quiet_start ~ {CLOCK_TIME} AND quiet_end ~ {CLOCK_TIME})",
            name="ck_alert_setting_quiet_time",
        ),
        CheckConstraint("version > 0", name="ck_alert_setting_version"),
    )

    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    quiet_start: Mapped[str | None] = mapped_column(String(5))
    quiet_end: Mapped[str | None] = mapped_column(String(5))
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReminderBackup(Base):
    """Someone asks another member to be told when their reminder for one task goes unacknowledged. Both agree first."""

    __tablename__ = "reminder_backups"
    __table_args__ = (
        UniqueConstraint("owner_account_id", "request_key", name="uq_reminder_backup_request"),
        ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_backup_task"),
        CheckConstraint("owner_account_id <> contact_account_id", name="ck_reminder_backup_people"),
        CheckConstraint("status IN ('pending', 'active', 'declined', 'cancelled', 'ended')", name="ck_reminder_backup_status"),
        CheckConstraint("wait_minutes IN (15, 30, 60, 120)", name="ck_reminder_backup_wait"),
        CheckConstraint("(status = 'pending') = (responded_at IS NULL)", name="ck_reminder_backup_response"),
        CheckConstraint("(status IN ('cancelled', 'ended')) = (ended_by IS NOT NULL)", name="ck_reminder_backup_end"),
        CheckConstraint("version > 0", name="ck_reminder_backup_version"),
        Index("ix_reminder_backup_owner", "owner_account_id", "id"),
        Index("ix_reminder_backup_contact", "contact_account_id", "id"),
        Index("uq_reminder_backup_open", "task_id", "owner_account_id", unique=True, postgresql_where=text("status IN ('pending', 'active')")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(36))
    space_id: Mapped[str] = mapped_column(String(36))
    owner_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    owner_admission_id: Mapped[str] = mapped_column(String(36))
    contact_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    contact_admission_id: Mapped[str] = mapped_column(String(36))
    wait_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    ended_by: Mapped[str | None] = mapped_column(String(16))
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)


class EventAlert(Base):
    """A person's own alert before a Space event they can see. It follows the event if its time changes."""

    __tablename__ = "event_alerts"
    __table_args__ = (
        CheckConstraint("minutes_before IN (10, 30, 60, 1440)", name="ck_event_alert_lead"),
        Index("ix_event_alert_account", "account_id"),
    )

    event_id: Mapped[str] = mapped_column(ForeignKey("space_events.id"), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(36))
    minutes_before: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CareDoseAlert(Base):
    """The person turned on in-app alerts at the dose times of one of their own medicine instructions."""

    __tablename__ = "care_dose_alerts"
    __table_args__ = (Index("ix_care_dose_alert_account", "account_id"),)

    instruction_id: Mapped[str] = mapped_column(ForeignKey("care_instructions.id"), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AlertDismissal(Base):
    """A due alert the person set aside. Kept briefly, so the same alert is not shown again."""

    __tablename__ = "alert_dismissals"
    __table_args__ = (
        CheckConstraint("kind IN ('backup', 'dose', 'event')", name="ck_alert_dismissal_kind"),
        Index("ix_alert_dismissal_time", "account_id", "dismissed_at"),
    )

    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    kind: Mapped[str] = mapped_column(String(8), primary_key=True)
    reference: Mapped[str] = mapped_column(String(120), primary_key=True)
    dismissed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))