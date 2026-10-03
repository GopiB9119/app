from datetime import datetime
from functools import lru_cache
from typing import Literal
from uuid import UUID
from zoneinfo import available_timezones

from pydantic import AwareDatetime, BaseModel, Field, StrictInt, field_validator, model_validator

from app.modules.community.schemas import clean_text
from app.modules.events.models import (
    CONTRIBUTION_STATES, CURRENCIES, MAX_CAPACITY, MAX_MINOR, MAX_SPLIT_PEOPLE, RESPONSES, SPLIT_BASES, SPLIT_METHODS, WHOLE_PERCENT,
)
from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

Response = Literal[RESPONSES]
LOCAL_TIME = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$"


@lru_cache(maxsize=1)
def zones():
    return frozenset(available_timezones())


def valid_local(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M")
    except ValueError:
        raise ValueError("Enter a real date and time.") from None
    return value


class EventInput(Input):
    title: str = Field(min_length=1, max_length=400)
    description: str = Field(default="", max_length=8000)
    location: str = Field(default="", max_length=800)
    timezone: str = Field(min_length=1, max_length=64)
    local_start: str = Field(pattern=LOCAL_TIME)
    local_end: str | None = Field(default=None, pattern=LOCAL_TIME)
    # The most people who can be going; none means no limit. Leaving it out of an edit keeps the current one (DEC-032).
    capacity: StrictInt | None = Field(default=None, ge=1, le=MAX_CAPACITY)

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str) -> str:
        return clean_text(value, 120, multiline=False)

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str) -> str:
        return clean_text(value, 2000, multiline=True, empty=True)

    @field_validator("location")
    @classmethod
    def valid_location(cls, value: str) -> str:
        return clean_text(value, 200, multiline=False, empty=True)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        if value not in zones():
            raise ValueError("Choose a supported time zone.")
        return value

    @field_validator("local_start", "local_end")
    @classmethod
    def valid_times(cls, value: str | None) -> str | None:
        return valid_local(value)

    @model_validator(mode="after")
    def ordered(self):
        if self.local_end is not None and self.local_end <= self.local_start:
            raise ValueError("The end must be after the start.")
        return self


class CreateEvent(EventInput):
    pass


class UpdateEvent(EventInput):
    pass


class EventAction(Input):
    pass


class Attendance(Input):
    response: Response


class SpaceEventView(BaseModel):
    id: UUID
    space_id: UUID
    space_name: str
    title: str
    description: str
    location: str
    timezone: str
    local_start: str
    local_end: str | None
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None
    status: Literal["scheduled", "cancelled"]
    ended: bool
    created_by_name: str
    created_at: AwareDatetime
    updated_at: AwareDatetime
    schedule_changed_at: AwareDatetime | None
    cancelled_at: AwareDatetime | None
    going: int
    maybe: int
    not_going: int
    capacity: int | None
    waitlisted: int
    my_response: Response | None
    my_response_outdated: bool
    my_waitlist_position: int | None
    can_manage: bool
    can_respond: bool
    etag: str | None


class AttendeeView(BaseModel):
    name: str
    response: Response
    responded_at: AwareDatetime
    outdated: bool
    mine: bool
    waitlist_position: int | None


class EventDetail(SpaceEventView):
    attendees: list[AttendeeView]


class EventList(Envelope[list[SpaceEventView]]):
    pagination: Pagination


class EventCursor(Input):
    kind: Literal["space_events"]
    account_id: UUID
    space_id: UUID
    when: Literal["upcoming", "past"]
    after_start: AwareDatetime
    after_id: UUID
    expires_at: AwareDatetime


# Budgets (DEC-039): money is whole paise or cents, and recording an expense is never a payment.
Currency = Literal[CURRENCIES]
MAX_CATEGORIES = 30


class BudgetCategoryInput(Input):
    # A category the budget already has keeps its id, so the expenses recorded in it stay there.
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=240)
    estimate_minor: StrictInt = Field(ge=0, le=MAX_MINOR)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return clean_text(value, 60, multiline=False)


class SaveBudget(Input):
    currency: Currency
    categories: list[BudgetCategoryInput] = Field(max_length=MAX_CATEGORIES)

    @model_validator(mode="after")
    def distinct(self):
        identifiers = [item.id for item in self.categories if item.id is not None]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Each category can appear once.")
        names = [item.name.casefold() for item in self.categories]
        if len(names) != len(set(names)):
            raise ValueError("Give each category a different name.")
        return self


class RecordExpense(Input):
    amount_minor: StrictInt = Field(ge=1, le=MAX_MINOR)
    category_id: UUID | None = None
    note: str = Field(min_length=1, max_length=480)

    @field_validator("note")
    @classmethod
    def valid_note(cls, value: str) -> str:
        return clean_text(value, 120, multiline=False)


# Contributions (DEC-041): what a person says they promised or gave; never a payment.
ContributionState = Literal[CONTRIBUTION_STATES]


class RecordContribution(Input):
    amount_minor: StrictInt = Field(ge=1, le=MAX_MINOR)
    state: ContributionState
    note: str | None = Field(default=None, max_length=480)

    @field_validator("note")
    @classmethod
    def valid_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        # An empty note is the same as no note, so a retry with either matches.
        return clean_text(value, 120, multiline=False, empty=True) or None


class ChangeContribution(Input):
    state: ContributionState


# Splits (DEC-042): a plan for dividing the cost, never a bill.
SplitMethod = Literal[SPLIT_METHODS]
SplitBase = Literal[SPLIT_BASES]


class SplitPersonInput(Input):
    account_id: UUID
    # Hundredths of a percent for percentages, paise or cents for set amounts, left out for equal shares.
    value: StrictInt | None = Field(default=None, ge=0, le=MAX_MINOR)


class SaveSplit(Input):
    method: SplitMethod
    base: SplitBase
    people: list[SplitPersonInput] = Field(min_length=1, max_length=MAX_SPLIT_PEOPLE)

    @model_validator(mode="after")
    def consistent(self):
        if len({item.account_id for item in self.people}) != len(self.people):
            raise ValueError("Choose each person once.")
        values = [item.value for item in self.people]
        if self.method == "equal" and any(value is not None for value in values):
            raise ValueError("Equal shares take no values.")
        if self.method != "equal" and any(value is None for value in values):
            raise ValueError("Give each person a value.")
        if self.method == "percentages" and (any(value > WHOLE_PERCENT for value in values) or sum(values) != WHOLE_PERCENT):
            raise ValueError("The percentages must add up to exactly 100.")
        return self


class BudgetCategoryView(BaseModel):
    id: UUID
    name: str
    estimate_minor: int
    recorded_minor: int
    remaining_minor: int


class ExpenseView(BaseModel):
    id: UUID
    amount_minor: int
    category_id: UUID | None
    note: str
    # None once the account that recorded it was deleted.
    recorded_by_name: str | None
    recorded_at: AwareDatetime
    mine: bool
    can_delete: bool


class ContributionView(BaseModel):
    id: UUID
    amount_minor: int
    state: ContributionState
    note: str | None
    # None once the contributor's account was deleted.
    contributor_name: str | None
    recorded_at: AwareDatetime
    mine: bool
    can_change: bool


class SplitShareView(BaseModel):
    # Both None once the account was deleted.
    account_id: UUID | None
    name: str | None
    mine: bool
    value: int | None
    share_minor: int
    # This share carries one extra paisa or cent, so the shares add up to the total exactly.
    rounded_up: bool


class SplitView(BaseModel):
    method: SplitMethod
    base: SplitBase
    base_minor: int
    people_count: int
    # The organizer and the Space owner see every share; everyone else only their own.
    shares: list[SplitShareView]
    all_shares: bool
    allocated_minor: int
    difference_minor: int
    rounding_count: int


class SplitCandidateView(BaseModel):
    account_id: UUID
    name: str


class BudgetView(BaseModel):
    event_id: UUID
    currency: Currency | None
    categories: list[BudgetCategoryView]
    expenses: list[ExpenseView]
    estimate_minor: int
    recorded_minor: int
    uncategorized_minor: int
    remaining_minor: int
    # The organizer and the Space owner see every contribution; everyone else sees only their own and the totals.
    contributions: list[ContributionView]
    all_contributions: bool
    given_minor: int
    promised_minor: int
    contribution_count: int
    split: SplitView | None
    # Who a split can include, for those who manage the budget; empty for everyone else.
    split_candidates: list[SplitCandidateView]
    can_manage: bool
    can_record: bool
    etag: str | None
