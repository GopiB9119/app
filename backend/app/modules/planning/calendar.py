from datetime import date, datetime, timedelta, timezone as utc_timezone
from typing import Annotated, Literal
from uuid import UUID

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, Query, Request
from fastapi.security import HTTPBearer
from pydantic import AwareDatetime, BaseModel, BeforeValidator
from sqlalchemy import Date, DateTime, String, cast, func, literal, null, select, tuple_, union_all

from app.errors import DomainError
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope, Input
from app.modules.planning.models import Task
from app.modules.planning.schemas import date_only
from app.modules.scheduling.models import Reminder
from app.modules.scheduling.schemas import PreviewReminder
from app.modules.spaces.schemas import Pagination


class CalendarEntry(BaseModel):
    id: str
    kind: Literal["task", "reminder"]
    task_id: str
    space_id: str
    title: str
    date: date
    scheduled_at: AwareDatetime | None
    timezone: str | None
    status: str
    source_changed: bool


class CalendarPage(Envelope[list[CalendarEntry]]):
    pagination: Pagination


class CalendarCursor(Input):
    kind: Literal["calendar"] = "calendar"
    account_id: UUID
    admission_id: UUID
    space_id: UUID
    start_date: date
    end_date: date
    timezone: str
    after_date: date
    after_kind: Literal["task", "reminder"]
    after_time: AwareDatetime
    after_id: UUID
    expires_at: AwareDatetime


class CalendarService:
    def __init__(self, reminders):
        self.reminders = reminders
        self.tasks = reminders.tasks

    def list_entries(self, token_value, space_id, start_date, end_date, timezone, limit, cursor=None):
        if start_date.year < 1900 or end_date.year > 2100 or not 0 <= (end_date - start_date).days < 31:
            raise DomainError(422, "CALENDAR_RANGE_INVALID", "Choose up to 31 days between 1900 and 2100.")
        try:
            PreviewReminder.named_zone(timezone)
        except ValueError:
            raise DomainError(422, "TIMEZONE_INVALID", "Select a named IANA timezone.") from None
        with self.tasks.sessions() as database:
            caller, member = self.tasks.context(database, token_value, space_id)
            position = None
            if cursor:
                try:
                    position = CalendarCursor.model_validate_json(self.tasks.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload the calendar.") from None
                expected = (caller.id, member.admission_id, space_id, start_date, end_date, timezone)
                actual = (str(position.account_id), str(position.admission_id), str(position.space_id),
                          position.start_date, position.end_date, position.timezone)
                if actual != expected:
                    raise DomainError(400, "CURSOR_INVALID", "Reload the calendar.")
                if position.expires_at <= self.tasks.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload the calendar.")
            epoch = datetime(1970, 1, 1, tzinfo=utc_timezone.utc)
            task_entries = self.tasks.visible_tasks(caller.id, space_id).with_only_columns(
                Task.id.label("id"), literal("task").label("kind"), Task.id.label("task_id"),
                Task.space_id.label("space_id"), Task.title.label("title"), Task.due_date.label("date"),
                literal(epoch, DateTime(timezone=True)).label("sort_at"),
                cast(null(), DateTime(timezone=True)).label("scheduled_at"),
                cast(null(), String).label("timezone"), Task.status.label("status"),
                literal(False).label("source_changed"),
            ).where(Task.due_date >= start_date, Task.due_date <= end_date)
            reminder_date = cast(func.timezone(timezone, Reminder.scheduled_at), Date)
            reminder_entries = self.reminders.visible(caller.id).with_only_columns(
                Reminder.id.label("id"), literal("reminder").label("kind"), Task.id.label("task_id"),
                Task.space_id.label("space_id"), Task.title.label("title"), reminder_date.label("date"),
                Reminder.scheduled_at.label("sort_at"), Reminder.scheduled_at.label("scheduled_at"),
                Reminder.timezone.label("timezone"), Reminder.status.label("status"),
                (Reminder.source_version != Task.version).label("source_changed"),
            ).where(Reminder.space_id == space_id, reminder_date >= start_date, reminder_date <= end_date)
            entries = union_all(task_entries, reminder_entries).subquery()
            order_kind = entries.c.kind == "reminder"
            statement = select(entries)
            if position:
                statement = statement.where(tuple_(entries.c.date, order_kind, entries.c.sort_at, entries.c.id) > tuple_(
                    position.after_date, position.after_kind == "reminder", position.after_time, str(position.after_id),
                ))
            rows = database.execute(statement.order_by(
                entries.c.date, order_kind, entries.c.sort_at, entries.c.id,
            ).limit(limit + 1)).mappings().all()
            page = rows[:limit]
            next_cursor = None
            if len(rows) > limit:
                last = page[-1]
                next_cursor = self.tasks.security.seal(CalendarCursor(
                    account_id=caller.id, admission_id=member.admission_id, space_id=space_id,
                    start_date=start_date, end_date=end_date, timezone=timezone,
                    after_date=last["date"], after_kind=last["kind"], after_time=last["sort_at"], after_id=last["id"],
                    expires_at=self.tasks.clock() + timedelta(minutes=15),
                ).model_dump_json())
            self.tasks.identity.authenticate(database, token_value)
            return [CalendarEntry(**row) for row in page], Pagination(next_cursor=next_cursor, has_more=next_cursor is not None)


router = APIRouter(
    prefix="/v1/calendar", tags=["Calendar"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 410, 422, 503)},
)


@router.get("", response_model=CalendarPage)
def calendar_entries(
    request: Request, space_id: UUID,
    start_date: Annotated[date, BeforeValidator(date_only)],
    end_date: Annotated[date, BeforeValidator(date_only)],
    timezone: str = Query(min_length=1, max_length=64),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=4096),
):
    data, pagination = request.app.state.calendar.list_entries(
        token(request), str(space_id), start_date, end_date, timezone, limit, cursor,
    )
    return {**envelope(request, data), "pagination": pagination}