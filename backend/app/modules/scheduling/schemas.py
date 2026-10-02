import re
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, BeforeValidator, Field, field_validator, model_validator

from app.modules.identity.schemas import Envelope, Input
from app.modules.planning.schemas import date_only
from app.modules.spaces.schemas import Pagination


class PreviewReminder(Input):
    task_id: UUID
    local_time: datetime
    timezone: str = Field(min_length=1, max_length=64)

    @field_validator("local_time", mode="before")
    @classmethod
    def local_minute(cls, value):
        if not isinstance(value, str) or re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?", value) is None:
            raise ValueError("Select a local calendar date and time, to the minute.")
        return value

    @field_validator("timezone")
    @classmethod
    def named_zone(cls, value):
        if value != "UTC" and "/" not in value:
            raise ValueError("Use a named IANA timezone, not an abbreviation.")
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Select a valid IANA timezone.") from error
        return value


class CreateReminder(Input):
    preview_token: str = Field(min_length=32, max_length=4096)


class ReminderAction(Input):
    pass


class PreviewClaims(Input):
    kind: Literal["self_task_reminder"]
    account_id: UUID
    admission_id: UUID
    task_id: UUID
    space_id: UUID
    source_version: int = Field(gt=0)
    preference_generation: int = Field(gt=0)
    local_time: datetime
    timezone: str
    scheduled_at: AwareDatetime
    dispatch_expires_at: AwareDatetime
    expires_at: AwareDatetime


class ReminderRecipient(BaseModel):
    account_id: str
    display_name: str


class PreviewOption(BaseModel):
    scheduled_at: AwareDatetime
    dispatch_expires_at: AwareDatetime
    utc_offset_minutes: int
    preview_token: str


class ReminderPreview(BaseModel):
    task_id: str
    task_title: str
    task_version: str
    local_time: datetime
    timezone: str
    recipient: ReminderRecipient
    channel: Literal["in_app"] = "in_app"
    options: list[PreviewOption]
    expires_at: AwareDatetime


class ReminderView(BaseModel):
    id: str
    task_id: str
    space_id: str
    task_title: str
    local_time: datetime
    timezone: str
    scheduled_at: AwareDatetime
    expires_at: AwareDatetime
    status: Literal["scheduled", "available", "cancelled", "suppressed", "expired", "failed"]
    reason: str | None
    source_changed: bool
    acknowledged_at: AwareDatetime | None
    version: str
    channel: Literal["in_app"] = "in_app"
    series_id: str | None = None
    occurrence_date: date | None = None
    follow_up_of: str | None = None
    snooze_count: int = 0


class ReminderPage(Envelope[list[ReminderView]]):
    pagination: Pagination


class ReminderCursor(Input):
    kind: Literal["reminders", "notifications"]
    account_id: UUID
    task_id: UUID | None = None
    after_id: UUID
    # The inbox is listed newest first, so its cursor also holds the creation time of the last item shown (T102).
    after_created_at: AwareDatetime | None = None
    expires_at: AwareDatetime


class PreviewReminderRequest(PreviewReminder):
    recipient_account_id: UUID


class RequestPreviewClaims(Input):
    kind: Literal["task_reminder_request"]
    account_id: UUID
    admission_id: UUID
    recipient_account_id: UUID
    recipient_admission_id: UUID
    task_id: UUID
    space_id: UUID
    source_version: int = Field(gt=0)
    local_time: datetime
    timezone: str
    scheduled_at: AwareDatetime
    dispatch_expires_at: AwareDatetime
    request_expires_at: AwareDatetime
    expires_at: AwareDatetime


class ReminderRequestPreview(ReminderPreview):
    requested_by: ReminderRecipient
    request_expires_at: AwareDatetime


class ReminderRequestView(BaseModel):
    id: str
    task_id: str
    space_id: str
    task_title: str
    task_version: str
    requested_by: ReminderRecipient
    recipient: ReminderRecipient
    local_time: datetime
    timezone: str
    scheduled_at: AwareDatetime
    dispatch_expires_at: AwareDatetime
    expires_at: AwareDatetime
    created_at: AwareDatetime
    resolved_at: AwareDatetime | None
    status: Literal["pending", "accepted", "declined", "cancelled", "expired", "outdated"]
    source_changed: bool
    reminder_id: str | None
    version: str
    channel: Literal["in_app"] = "in_app"


class RequestAcceptanceClaims(Input):
    kind: Literal["task_reminder_request_acceptance"]
    request_id: UUID
    account_id: UUID
    admission_id: UUID
    source_version: int = Field(gt=0)
    request_version: int = Field(gt=0)
    preference_generation: int = Field(gt=0)
    expires_at: AwareDatetime


class ReminderRequestReview(BaseModel):
    request: ReminderRequestView
    preview_token: str
    expires_at: AwareDatetime


class ReminderRequestPage(Envelope[list[ReminderRequestView]]):
    pagination: Pagination


class ReminderRequestCursor(Input):
    kind: Literal["task_reminder_requests"]
    account_id: UUID
    direction: Literal["received", "sent"]
    after_id: UUID
    expires_at: AwareDatetime


Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
Frequency = Literal["daily", "weekly"]
ClockChangePolicy = Literal["shift_forward", "skip"]
SeriesStatus = Literal["active", "paused", "cancelled", "ended", "suppressed"]
LocalDate = Annotated[date, BeforeValidator(date_only)]


class PreviewReminderSeries(Input):
    task_id: UUID
    local_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    timezone: str = Field(min_length=1, max_length=64)
    start_date: LocalDate
    end_date: LocalDate
    frequency: Frequency
    repeat_every: int = Field(ge=1, le=30, strict=True)
    weekdays: list[Weekday] = Field(default_factory=list, max_length=7)
    clock_change_policy: ClockChangePolicy
    replaces_series_id: UUID | None = None

    @field_validator("timezone")
    @classmethod
    def named_zone(cls, value):
        return PreviewReminder.named_zone(value)

    @model_validator(mode="after")
    def rule(self):
        if self.frequency == "daily" and self.weekdays:
            raise ValueError("A daily reminder does not take weekdays.")
        if self.frequency == "weekly" and (not self.weekdays or self.repeat_every > 4):
            raise ValueError("Choose at least one weekday, every 1 to 4 weeks.")
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("Choose each weekday once.")
        if self.end_date < self.start_date or (self.end_date - self.start_date).days > 365:
            raise ValueError("Choose a last day on or after the first day, within one year.")
        return self


class SeriesPreviewClaims(Input):
    kind: Literal["task_reminder_series"]
    account_id: UUID
    admission_id: UUID
    task_id: UUID
    space_id: UUID
    source_version: int = Field(gt=0)
    preference_generation: int = Field(gt=0)
    frequency: Frequency
    repeat_every: int
    weekdays: list[Weekday]
    local_time: str
    timezone: str
    start_date: date
    end_date: date
    clock_change_policy: ClockChangePolicy
    first_scheduled_at: AwareDatetime
    occurrence_count: int = Field(gt=0)
    expires_at: AwareDatetime
    replaces_series_id: UUID | None = None
    replaces_version: int | None = None


class MoveSeriesOccurrence(Input):
    local_time: datetime

    @field_validator("local_time", mode="before")
    @classmethod
    def local_minute(cls, value):
        return PreviewReminder.local_minute(value)


class SeriesOccurrenceView(BaseModel):
    reminder_id: str | None = None
    local_date: date
    display_time: str
    scheduled_at: AwareDatetime
    utc_offset_minutes: int
    adjustment: Literal["none", "shifted_forward", "repeated_time_first", "moved"]


class ClockChangeView(BaseModel):
    local_date: date
    change: Literal["shifted_forward", "repeated_time_first", "skipped"]


class ReminderSeriesPreview(BaseModel):
    task_id: str
    task_title: str
    task_version: str
    recipient: ReminderRecipient
    frequency: Frequency
    repeat_every: int
    weekdays: list[Weekday]
    local_time: str
    timezone: str
    start_date: date
    end_date: date
    clock_change_policy: ClockChangePolicy
    occurrences: list[SeriesOccurrenceView]
    occurrence_count: int
    clock_changes: list[ClockChangeView]
    channel: Literal["in_app"] = "in_app"
    preview_token: str
    expires_at: AwareDatetime


class ReminderSeriesView(BaseModel):
    id: str
    task_id: str
    space_id: str
    task_title: str
    task_version: str
    source_changed: bool
    frequency: Frequency
    repeat_every: int
    weekdays: list[Weekday]
    local_time: str
    timezone: str
    start_date: date
    end_date: date
    clock_change_policy: ClockChangePolicy
    status: SeriesStatus
    reason: str | None
    next_occurrence: SeriesOccurrenceView | None
    created_at: AwareDatetime
    updated_at: AwareDatetime
    version: str
    etag: str
    channel: Literal["in_app"] = "in_app"
    replaced_by: str | None = None


class ReminderSeriesPage(Envelope[list[ReminderSeriesView]]):
    pagination: Pagination


class ReminderSeriesCursor(Input):
    kind: Literal["reminder_series"]
    account_id: UUID
    task_id: UUID | None = None
    after_id: UUID
    expires_at: AwareDatetime


class SnoozeReminder(Input):
    minutes: Literal[10, 60, 180, 1440]