from pydantic import AwareDatetime, BaseModel, Field

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


class NotificationPage(Envelope[list[NotificationView]]):
    pagination: Pagination
    unread_count: int = Field(ge=0)


class PreferencesInput(Input):
    in_app_reminders_enabled: bool = Field(strict=True)


class PreferencesView(BaseModel):
    in_app_reminders_enabled: bool
    version: str