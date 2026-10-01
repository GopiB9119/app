import unicodedata
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    Field,
    StringConstraints,
    StrictBool,
    model_validator,
)

from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

TaskStatus = Literal["open", "in_progress", "completed", "cancelled"]


def plain_title(value: str) -> str:
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise ValueError("Use a task title without control characters.")
    return value


def plain_description(value: str) -> str:
    value = value.replace("\r\n", "\n")
    if any(unicodedata.category(character).startswith("C") and character not in "\n\t" for character in value):
        raise ValueError("Use plain task notes without control characters.")
    return value


def date_only(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Use an ISO calendar date, not a timestamp.")
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Use YYYY-MM-DD for the due date.")
    return parsed


TaskTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200), AfterValidator(plain_title)]
TaskDescription = Annotated[str, Field(max_length=5000), AfterValidator(plain_description)]
DueDate = Annotated[date | None, BeforeValidator(date_only)]


class CreateTask(Input):
    space_id: UUID
    title: TaskTitle
    description: TaskDescription = ""
    due_date: DueDate = None
    assignee_account_id: UUID | None = None


class EditTask(Input):
    title: TaskTitle | None = None
    description: TaskDescription | None = None
    due_date: DueDate = None
    assignee_account_id: UUID | None = None

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("Submit at least one editable field.")
        if any(field in self.model_fields_set and getattr(self, field) is None for field in ("title", "description")):
            raise ValueError("Title and notes cannot be null.")
        return self


class ChangeTaskStatus(Input):
    status: TaskStatus


class AssigneeView(BaseModel):
    account_id: str
    display_name: str


class TaskPermissions(BaseModel):
    can_edit: bool
    allowed_statuses: list[TaskStatus]


class TaskView(BaseModel):
    id: str
    space_id: str
    title: str
    description: str
    due_date: date | None
    status: TaskStatus
    assignee: AssigneeView | None
    assignee_unavailable: bool
    created_by_account_id: str
    completed_by_account_id: str | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    version: str
    permissions: TaskPermissions


class TaskListItem(TaskView):
    etag: str


class TaskPage(Envelope[list[TaskListItem]]):
    pagination: Pagination


class TaskCursor(Input):
    kind: Literal["family_tasks"]
    account_id: UUID
    space_id: UUID
    admission_id: UUID
    status: TaskStatus | None
    after_id: UUID
    expires_at: AwareDatetime


class ChecklistCommand(Input):
    action: Literal["add", "rename", "check", "remove"]
    item_id: UUID | None = None
    title: TaskTitle | None = None
    checked: StrictBool | None = None

    @model_validator(mode="after")
    def exact_fields(self):
        required = {
            "add": {"action", "title"}, "rename": {"action", "item_id", "title"},
            "check": {"action", "item_id", "checked"}, "remove": {"action", "item_id"},
        }[self.action]
        if self.model_fields_set != required or any(getattr(self, field) is None for field in required):
            raise ValueError("Submit only the fields required by this checklist action.")
        return self


class ChecklistItemView(BaseModel):
    id: str
    title: str
    checked: bool
    checked_at: datetime | None
    checked_by_account_id: str | None


class ChecklistView(BaseModel):
    task_id: str
    space_id: str
    task_title: str
    task_status: TaskStatus
    task_version: str
    can_manage: bool
    can_check: bool
    items: list[ChecklistItemView]
    etag: str