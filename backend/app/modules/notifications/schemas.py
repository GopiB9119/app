from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination


class NotificationView(BaseModel):
    id: str
    reminder_id: str
    task_id: str
    space_id: str
    task_title: str
    scheduled_at: AwareDatetime
    created_at: AwareDatetime
    read_at: AwareDatetime | None
    acknowledged_at: AwareDatetime | None
    series_id: str | None = None
    snooze_count: int = 0
    snoozed_until: AwareDatetime | None = None
    can_snooze: bool = False
    snooze_before: AwareDatetime | None = None


class NotificationPage(Envelope[list[NotificationView]]):
    pagination: Pagination
    unread_count: int = Field(ge=0)


class PreferencesInput(Input):
    in_app_reminders_enabled: bool = Field(strict=True)


class PreferencesView(BaseModel):
    in_app_reminders_enabled: bool
    version: str


ClockTime = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
AlertKind = Literal["reminder", "backup", "dose", "event"]
BackupStatus = Literal["pending", "active", "declined", "cancelled", "ended"]
BackupRole = Literal["owner", "contact"]


class QuietHoursInput(Input):
    start: ClockTime | None
    end: ClockTime | None

    @model_validator(mode="after")
    def pair(self):
        if (self.start is None) != (self.end is None):
            raise ValueError("Choose both a start and an end time, or neither.")
        if self.start is not None and self.start == self.end:
            raise ValueError("Choose different start and end times.")
        return self


class QuietState(BaseModel):
    active: bool
    until: AwareDatetime | None


class QuietHoursView(BaseModel):
    start: str | None
    end: str | None
    timezone: str
    quiet: QuietState
    version: str


class AlertItem(BaseModel):
    id: str
    kind: AlertKind
    reference: str
    title: str
    due_at: AwareDatetime
    ends_at: AwareDatetime
    space_id: str | None = None
    task_id: str | None = None
    event_id: str | None = None
    instruction_id: str | None = None
    person_name: str | None = None
    display_time: str | None = None
    timezone: str | None = None


class AlertFeed(BaseModel):
    items: list[AlertItem]
    quiet: QuietState
    next_check_at: AwareDatetime
    generated_at: AwareDatetime


class DismissAlert(Input):
    kind: Literal["backup", "dose", "event"]
    reference: str = Field(min_length=1, max_length=120)


class AlertDismissalView(BaseModel):
    kind: str
    reference: str
    dismissed_at: AwareDatetime


class CreateReminderBackup(Input):
    task_id: UUID
    contact_account_id: UUID
    wait_minutes: Literal[15, 30, 60, 120]


class BackupPerson(BaseModel):
    account_id: str
    display_name: str


class ReminderBackupView(BaseModel):
    id: str
    task_id: str
    space_id: str
    task_title: str
    role: BackupRole
    owner: BackupPerson
    contact: BackupPerson
    wait_minutes: int
    status: BackupStatus
    created_at: AwareDatetime
    responded_at: AwareDatetime | None
    ended_at: AwareDatetime | None
    version: str


class ReminderBackupPage(Envelope[list[ReminderBackupView]]):
    pagination: Pagination


class BackupCursor(Input):
    kind: Literal["reminder_backups"]
    account_id: UUID
    role: BackupRole
    task_id: UUID | None = None
    after_id: UUID
    expires_at: AwareDatetime


class EventAlertInput(Input):
    minutes_before: Literal[10, 30, 60, 1440] | None


class EventAlertView(BaseModel):
    event_id: str
    minutes_before: int | None


class CareAlertInput(Input):
    enabled: bool = Field(strict=True)


class CareAlertView(BaseModel):
    instruction_id: str
    enabled: bool