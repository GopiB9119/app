from datetime import datetime
from functools import lru_cache
from typing import Literal
from uuid import UUID
from zoneinfo import available_timezones

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from app.modules.community.schemas import clean_text
from app.modules.events.models import RESPONSES
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
    my_response: Response | None
    my_response_outdated: bool
    can_manage: bool
    can_respond: bool
    etag: str | None


class AttendeeView(BaseModel):
    name: str
    response: Response
    responded_at: AwareDatetime
    outdated: bool
    mine: bool


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
