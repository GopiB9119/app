from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, StrictInt

from app.modules.events.schemas import EventInput

MAX_PAGE_EVENT_CAPACITY = 10000


class PageEventInput(EventInput):
    location_public: bool = Field(default=False, description="Show the exact place to everyone; otherwise only people going and the page's managers see it.")
    capacity: StrictInt | None = Field(default=None, ge=1, le=MAX_PAGE_EVENT_CAPACITY, description="The most people who can say they are going; none means no limit. Leaving it out of an edit keeps the current one.")


class PageEventView(BaseModel):
    id: str
    page_id: str
    page_handle: str
    page_name: str
    title: str
    description: str
    location: str | None = Field(description="The exact place when the viewer may see it; null when hidden or not set.")
    location_hidden: bool = Field(description="A place is set, and people see it once they say they are going.")
    location_public: bool
    timezone: str
    local_start: str
    local_end: str | None
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None
    status: Literal["scheduled", "cancelled"]
    ended: bool
    going_count: int = Field(ge=0)
    capacity: int | None
    going: bool = Field(description="The viewer said they are going.")
    can_manage: bool
    created_at: AwareDatetime
    updated_at: AwareDatetime
    schedule_changed_at: AwareDatetime | None = Field(description="The last time the date, time or place changed after publishing.")
    cancelled_at: AwareDatetime | None
    etag: str | None = Field(description="For the page's owner and moderators.")


class PageEventAttendee(BaseModel):
    """Only the page's owner and moderators see who is going."""

    name: str
    since: AwareDatetime
