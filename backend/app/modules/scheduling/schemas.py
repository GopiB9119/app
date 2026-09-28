import re
from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.modules.identity.schemas import Envelope, Input
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


class ReminderPage(Envelope[list[ReminderView]]):
    pagination: Pagination


class ReminderCursor(Input):
    kind: Literal["reminders", "notifications"]
    account_id: UUID
    task_id: UUID | None = None
    after_id: UUID
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