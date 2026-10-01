import unicodedata
from datetime import date, datetime
from typing import Generic, Literal, TypeVar
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, field_validator

Payload = TypeVar("Payload")


class Envelope(BaseModel, Generic[Payload]):
    data: Payload
    request_id: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, str] = Field(default_factory=dict)


class ErrorEnvelope(BaseModel):
    error: ErrorDetail
    request_id: str


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class EmailInput(Input):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        try:
            normalized = validate_email(
                value.strip(), check_deliverability=False, test_environment=True
            )
        except EmailNotValidError as error:
            raise ValueError("Enter a valid email address.") from error
        if not normalized.domain.endswith(".test"):
            raise ValueError("Local development accepts synthetic .test addresses only.")
        return normalized.normalized


class BeginChallenge(EmailInput):
    context_secret: str = Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class PasswordInput(Input):
    password: str = Field(min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def valid_password(cls, value: str) -> str:
        if value.lower() in {"password12345", "password123!", "123456789012", "qwertyuiop12"}:
            raise ValueError("Choose a less common password.")
        if len(set(value)) < 5:
            raise ValueError("Choose a less repetitive password.")
        return value


class ProfileInput(Input):
    display_name: str = Field(min_length=1, max_length=80)
    timezone: str = Field(min_length=1, max_length=64)

    @field_validator("display_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(unicodedata.category(character).startswith("C") for character in value):
            raise ValueError("Enter a display name without control characters.")
        return value

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Select a valid IANA timezone.") from error
        return value


class DeviceInput(Input):
    device_name: str = Field(default="Browser", min_length=1, max_length=80)
    platform: Literal["web", "android"] = "web"


class ChallengeProof(Input):
    challenge_id: UUID
    context_secret: str = Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    code: str = Field(pattern=r"^\d{6}$", min_length=6, max_length=6)


class CompleteRegistration(ChallengeProof, PasswordInput, ProfileInput, DeviceInput):
    pass


class CompleteRecovery(ChallengeProof, PasswordInput):
    pass


class Login(EmailInput, DeviceInput):
    password: str = Field(min_length=1, max_length=128)


class ChallengeView(BaseModel):
    challenge_id: str
    expires_at: datetime
    delivery_status: str


class UserView(BaseModel):
    id: str
    email: str
    display_name: str
    timezone: str
    email_verified: bool
    version: int


class AuthView(BaseModel):
    session_token: str
    session_id: str
    expires_at: datetime
    user: UserView


class SessionView(BaseModel):
    id: str
    device_name: str
    platform: Literal["web", "android"]
    created_at: datetime
    expires_at: datetime
    current: bool


class EventView(BaseModel):
    id: str
    action: str
    created_at: datetime


class DoneView(BaseModel):
    status: Literal["ok"] = "ok"


ExportCategory = Literal["profile", "security", "spaces", "tasks", "reminders"]
EXPORT_CATEGORIES: tuple[str, ...] = ("profile", "security", "spaces", "tasks", "reminders")


class ExportRequest(Input):
    categories: list[ExportCategory] = Field(min_length=1, max_length=len(EXPORT_CATEGORIES))

    @field_validator("categories")
    @classmethod
    def distinct_categories(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Select each category once.")
        return sorted(value, key=EXPORT_CATEGORIES.index)


class ExportView(BaseModel):
    id: str
    status: Literal["queued", "building", "ready", "outdated", "cancelled", "failed", "expired"]
    reason: Literal["session_ended", "access_changed", "too_large", "unavailable", "cancelled"] | None
    categories: list[ExportCategory]
    created_at: datetime
    completed_at: datetime | None
    expires_at: datetime | None
    size_bytes: int | None
    requested_here: bool


class ArchiveProfile(BaseModel):
    id: str
    email: str
    display_name: str
    timezone: str
    status: str
    created_at: datetime
    verified_at: datetime


class ArchiveSession(BaseModel):
    id: str
    device_name: str
    platform: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class ArchiveEvent(BaseModel):
    id: str
    action: str
    target_id: str
    created_at: datetime


class ArchiveSecurity(BaseModel):
    sessions: list[ArchiveSession]
    events: list[ArchiveEvent]


class ArchiveMembership(BaseModel):
    space_id: str
    space_name: str | None
    role: str
    membership_status: str
    current: bool
    joined_at: datetime


class ArchiveInvitation(BaseModel):
    id: str
    space_id: str
    inviter_account_id: str
    recipient_account_id: str
    status: str
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None


class ArchiveOwnershipTransfer(BaseModel):
    id: str
    space_id: str
    from_account_id: str
    to_account_id: str
    status: str
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None


class ArchiveSpaces(BaseModel):
    memberships: list[ArchiveMembership]
    invitations_received: list[ArchiveInvitation]
    invitations_sent: list[ArchiveInvitation]
    ownership_transfers: list[ArchiveOwnershipTransfer]


class ArchiveTask(BaseModel):
    id: str
    space_id: str
    title: str
    description: str
    due_date: date | None
    status: str
    created_by_account_id: str
    created_by_me: bool
    assignee_account_id: str | None
    assigned_to_me: bool
    assignee_unavailable: bool
    completed_by_account_id: str | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ArchiveReminder(BaseModel):
    id: str
    task_id: str
    space_id: str
    local_time: datetime
    timezone: str
    scheduled_at: datetime
    expires_at: datetime
    status: str
    reason: str | None
    created_at: datetime
    acknowledged_at: datetime | None
    series_id: str | None = None
    follow_up_of: str | None = None
    snooze_count: int = 0


class ArchiveReminderSeries(BaseModel):
    id: str
    task_id: str
    space_id: str
    frequency: str
    repeat_every: int
    weekdays: list[str]
    local_time: str
    timezone: str
    start_date: date
    end_date: date
    clock_change_policy: str
    status: str
    reason: str | None
    created_at: datetime
    updated_at: datetime
    replaced_by_id: str | None = None


class ArchiveQuietHours(BaseModel):
    start: str
    end: str


class ArchiveReminderBackup(BaseModel):
    id: str
    task_id: str
    space_id: str
    owner_account_id: str
    contact_account_id: str
    wait_minutes: int
    status: str
    created_at: datetime
    responded_at: datetime | None
    ended_at: datetime | None


class ArchiveReminderRequest(BaseModel):
    id: str
    task_id: str
    space_id: str
    requested_by_account_id: str
    recipient_account_id: str
    local_time: datetime
    timezone: str
    scheduled_at: datetime
    status: str
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None


class ArchiveNotification(BaseModel):
    id: str
    reminder_id: str
    created_at: datetime
    read_at: datetime | None


class ArchiveReminders(BaseModel):
    in_app_reminders_enabled: bool
    reminders: list[ArchiveReminder]
    requests_sent: list[ArchiveReminderRequest]
    requests_received: list[ArchiveReminderRequest]
    notifications: list[ArchiveNotification]
    series: list[ArchiveReminderSeries] = Field(default_factory=list)
    quiet_hours: ArchiveQuietHours | None = None
    backups: list[ArchiveReminderBackup] = Field(default_factory=list)


class ExportArchive(BaseModel):
    format: Literal["community-platform-account-export"] = "community-platform-account-export"
    version: Literal[1] = 1
    export_id: str
    account_id: str
    generated_at: datetime
    categories: list[ExportCategory]
    notice: str
    profile: ArchiveProfile | None = None
    security: ArchiveSecurity | None = None
    spaces: ArchiveSpaces | None = None
    tasks: list[ArchiveTask] | None = None
    reminders: ArchiveReminders | None = None