from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.spaces.models import Space

RESPONSES = ("going", "maybe", "not_going")


class SpaceEvent(Base):
    __tablename__ = "space_events"
    __table_args__ = (
        CheckConstraint("status IN ('scheduled', 'cancelled')", name="ck_space_event_status"),
        CheckConstraint("(status = 'cancelled') = (cancelled_at IS NOT NULL)", name="ck_space_event_cancellation"),
        CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="ck_space_event_range"),
        CheckConstraint("(ends_at IS NULL) = (local_end IS NULL)", name="ck_space_event_end"),
        CheckConstraint("length(btrim(title)) BETWEEN 1 AND 120", name="ck_space_event_title"),
        CheckConstraint("version > 0", name="ck_space_event_version"),
        CheckConstraint("admissions_before >= 0", name="ck_space_event_admissions"),
        UniqueConstraint("space_id", "creator_id", "creation_key", name="uq_space_event_creation"),
        ForeignKeyConstraint(
            ["space_id", "creator_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_space_event_creator",
        ),
        Index("ix_space_event_schedule", "space_id", "starts_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey(Space.id))
    creator_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    creator_admission_id: Mapped[str] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    location: Mapped[str] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64))
    local_start: Mapped[str] = mapped_column(String(16))
    local_end: Mapped[str | None] = mapped_column(String(16))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="scheduled")
    version: Mapped[int] = mapped_column(Integer, default=1)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    admissions_before: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    schedule_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SpaceEventResponse(Base):
    __tablename__ = "space_event_responses"
    __table_args__ = (
        CheckConstraint("response IN ('going', 'maybe', 'not_going')", name="ck_space_event_response"),
    )

    event_id: Mapped[str] = mapped_column(ForeignKey(SpaceEvent.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(36))
    response: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
