from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel

from app.modules.files.schemas import MediaType


class DocumentHit(BaseModel):
    document_id: UUID
    space_id: UUID
    space_name: str
    name: str
    media_type: MediaType
    start_line: int
    end_line: int
    excerpt: str
    added_at: AwareDatetime


class TaskHit(BaseModel):
    task_id: UUID
    space_id: UUID
    space_name: str
    title: str
    excerpt: str
    status: Literal["open", "in_progress", "completed", "cancelled"]
    due_date: date | None


class EventHit(BaseModel):
    event_id: UUID
    space_id: UUID
    space_name: str
    title: str
    excerpt: str
    status: Literal["scheduled", "cancelled"]
    starts_at: AwareDatetime
    timezone: str
    local_start: str


class SearchResults(BaseModel):
    query: str
    space_id: UUID | None
    documents: list[DocumentHit]
    tasks: list[TaskHit]
    events: list[EventHit]
    more_documents: bool
    more_tasks: bool
    more_events: bool
