from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint
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