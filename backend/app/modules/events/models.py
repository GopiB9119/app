from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.spaces.models import Space

RESPONSES = ("going", "maybe", "not_going")
MAX_CAPACITY = 500


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
        CheckConstraint("capacity IS NULL OR capacity BETWEEN 1 AND 500", name="ck_space_event_capacity"),
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
    capacity: Mapped[int | None] = mapped_column(Integer)


class SpaceEventResponse(Base):
    __tablename__ = "space_event_responses"
    __table_args__ = (
        CheckConstraint("response IN ('going', 'maybe', 'not_going')", name="ck_space_event_response"),
        CheckConstraint("(response = 'going') = (going_since IS NOT NULL)", name="ck_space_event_going_since"),
    )

    event_id: Mapped[str] = mapped_column(ForeignKey(SpaceEvent.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(36))
    response: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # When this person answered Going: their place in line when the event has a capacity (DEC-032).
    going_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# Budgets in exact money, never payments (DEC-039): amounts are whole numbers of paise or cents.
CURRENCIES = ("INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD")
MAX_MINOR = 100_000_000_000


class EventBudget(Base):
    __tablename__ = "event_budgets"
    __table_args__ = (
        CheckConstraint("currency IN ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD')", name="ck_event_budget_currency"),
        CheckConstraint("version > 0", name="ck_event_budget_version"),
    )

    event_id: Mapped[str] = mapped_column(ForeignKey(SpaceEvent.id), primary_key=True)
    currency: Mapped[str] = mapped_column(String(3))
    version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EventBudgetCategory(Base):
    __tablename__ = "event_budget_categories"
    __table_args__ = (
        CheckConstraint("length(btrim(name)) BETWEEN 1 AND 60", name="ck_event_budget_category_name"),
        CheckConstraint(f"estimate_minor BETWEEN 0 AND {MAX_MINOR}", name="ck_event_budget_category_estimate"),
        CheckConstraint("position >= 0", name="ck_event_budget_category_position"),
        UniqueConstraint("event_id", "id", name="uq_event_budget_category_event"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey(EventBudget.event_id))
    name: Mapped[str] = mapped_column(String(60))
    estimate_minor: Mapped[int] = mapped_column(BigInteger)
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EventExpense(Base):
    __tablename__ = "event_expenses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["event_id", "category_id"], ["event_budget_categories.event_id", "event_budget_categories.id"],
            name="fk_event_expense_category",
        ),
        CheckConstraint(f"amount_minor BETWEEN 1 AND {MAX_MINOR}", name="ck_event_expense_amount"),
        CheckConstraint("length(note) <= 120", name="ck_event_expense_note"),
        CheckConstraint("(recorder_id IS NULL) = (recorder_admission_id IS NULL)", name="ck_event_expense_recorder"),
        UniqueConstraint("event_id", "recorder_id", "creation_key", name="uq_event_expense_creation"),
        Index("ix_event_expense_event", "event_id", "created_at", "id"),
        Index("ix_event_expense_recorder", "recorder_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey(EventBudget.event_id))
    category_id: Mapped[str | None] = mapped_column(String(36))
    # Both are cleared when the account that recorded the expense is deleted; the amount stays for the others.
    recorder_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))
    recorder_admission_id: Mapped[str | None] = mapped_column(String(36))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str] = mapped_column(String(120))
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


CONTRIBUTION_STATES = ("promised", "given")


class EventContribution(Base):
    """What a person says they promised or gave (DEC-041); never a payment, and only that person changes it."""

    __tablename__ = "event_contributions"
    __table_args__ = (
        CheckConstraint(f"amount_minor BETWEEN 1 AND {MAX_MINOR}", name="ck_event_contribution_amount"),
        CheckConstraint("state IN ('promised', 'given')", name="ck_event_contribution_state"),
        CheckConstraint("note IS NULL OR length(btrim(note)) BETWEEN 1 AND 120", name="ck_event_contribution_note"),
        CheckConstraint("(contributor_id IS NULL) = (contributor_admission_id IS NULL)", name="ck_event_contribution_contributor"),
        CheckConstraint("contributor_id IS NOT NULL OR state = 'given'", name="ck_event_contribution_kept"),
        UniqueConstraint("event_id", "contributor_id", "creation_key", name="uq_event_contribution_creation"),
        Index("ix_event_contribution_event", "event_id", "created_at", "id"),
        Index("ix_event_contribution_contributor", "contributor_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey(EventBudget.event_id))
    # Both are cleared when the account is deleted; what it gave stays in the totals, and its promises are removed.
    contributor_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))
    contributor_admission_id: Mapped[str | None] = mapped_column(String(36))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    state: Mapped[str] = mapped_column(String(8))
    note: Mapped[str | None] = mapped_column(String(120))
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


SPLIT_METHODS = ("equal", "percentages", "amounts")
SPLIT_BASES = ("planned", "recorded")
MAX_SPLIT_PEOPLE = 100
WHOLE_PERCENT = 10_000


class EventBudgetSplit(Base):
    """How the planned total or the recorded spending is divided (DEC-042); a plan, never a bill."""

    __tablename__ = "event_budget_splits"
    __table_args__ = (
        CheckConstraint("method IN ('equal', 'percentages', 'amounts')", name="ck_event_budget_split_method"),
        CheckConstraint("base IN ('planned', 'recorded')", name="ck_event_budget_split_base"),
    )

    event_id: Mapped[str] = mapped_column(ForeignKey(EventBudget.event_id), primary_key=True)
    method: Mapped[str] = mapped_column(String(12))
    base: Mapped[str] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EventBudgetSplitPerson(Base):
    __tablename__ = "event_budget_split_people"
    __table_args__ = (
        CheckConstraint("position BETWEEN 0 AND 99", name="ck_event_budget_split_person_position"),
        CheckConstraint("value IS NULL OR value >= 0", name="ck_event_budget_split_person_value"),
        CheckConstraint("(account_id IS NULL) = (admission_id IS NULL)", name="ck_event_budget_split_person_account"),
        UniqueConstraint("event_id", "position", name="uq_event_budget_split_person_position"),
        UniqueConstraint("event_id", "account_id", name="uq_event_budget_split_person_account"),
        Index("ix_event_budget_split_person_account", "account_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey(EventBudgetSplit.event_id))
    position: Mapped[int] = mapped_column(Integer)
    # Cleared when the account is deleted; the share stays so the others' shares do not move.
    account_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))
    admission_id: Mapped[str | None] = mapped_column(String(36))
    # Hundredths of a percent for percentages, paise or cents for set amounts, nothing for equal shares.
    value: Mapped[int | None] = mapped_column(BigInteger)
