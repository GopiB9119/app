from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.spaces.models import Space

MAX_OPTIONS = 6


class SpacePoll(Base):
    """A question for a Space's members. Votes are counted, never attributed to names on screen."""

    __tablename__ = "space_polls"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'closed')", name="ck_space_poll_status"),
        CheckConstraint("(status = 'closed') = (closed_at IS NOT NULL)", name="ck_space_poll_closed"),
        CheckConstraint("length(btrim(question)) BETWEEN 1 AND 200", name="ck_space_poll_question"),
        CheckConstraint("version > 0 AND admissions_before >= 0", name="ck_space_poll_counts"),
        UniqueConstraint("space_id", "creator_id", "creation_key", name="uq_space_poll_creation"),
        ForeignKeyConstraint(
            ["space_id", "creator_id"], ["space_memberships.space_id", "space_memberships.account_id"], name="fk_space_poll_creator",
        ),
        Index("ix_space_poll_list", "space_id", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey(Space.id))
    creator_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    creator_admission_id: Mapped[str] = mapped_column(String(36))
    question: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(8))
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    # History starts at a member's admission: polls created before they joined stay hidden, as events do.
    admissions_before: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SpacePollOption(Base):
    __tablename__ = "space_poll_options"
    __table_args__ = (
        CheckConstraint(f"position BETWEEN 1 AND {MAX_OPTIONS}", name="ck_space_poll_option_position"),
        CheckConstraint("length(btrim(label)) BETWEEN 1 AND 80", name="ck_space_poll_option_label"),
        UniqueConstraint("poll_id", "position", name="uq_space_poll_option_position"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    poll_id: Mapped[str] = mapped_column(ForeignKey(SpacePoll.id))
    position: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(80))


class SpacePollVote(Base):
    """One current choice per person; changing it replaces the row, withdrawing deletes it."""

    __tablename__ = "space_poll_votes"
    __table_args__ = (Index("ix_space_poll_vote_option", "option_id"),)

    poll_id: Mapped[str] = mapped_column(ForeignKey(SpacePoll.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(36))
    option_id: Mapped[str] = mapped_column(ForeignKey(SpacePollOption.id))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
