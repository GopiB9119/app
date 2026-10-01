from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.scheduling.schemas import CreateReminder, PreviewReminder, ReminderAction, ReminderPage, ReminderPreview, ReminderView
from app.modules.scheduling.schemas import PreviewReminderRequest, ReminderRequestPage, ReminderRequestPreview, ReminderRequestReview, ReminderRequestView
from app.modules.scheduling.schemas import MoveSeriesOccurrence, PreviewReminderSeries, ReminderSeriesPage, ReminderSeriesPreview, ReminderSeriesView

router = APIRouter(
    prefix="/v1/reminders", tags=["Reminders"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 410, 422, 503)},
)


@router.post("/preview", response_model=Envelope[ReminderPreview])
def preview(request: Request, body: PreviewReminder):
    return envelope(request, request.app.state.reminders.preview(token(request), body))


@router.post("", response_model=Envelope[ReminderView], status_code=201)
def create(request: Request, body: CreateReminder, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.reminders.create(token(request), body, str(idempotency_key)))


@router.get("", response_model=ReminderPage)
def list_reminders(request: Request, task_id: UUID | None = None, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    data, pagination = request.app.state.reminders.list_reminders(token(request), limit, cursor, str(task_id) if task_id else None)
    return {**envelope(request, data), "pagination": pagination}


@router.post("/{reminder_id}/cancel", response_model=Envelope[ReminderView])
def cancel(request: Request, reminder_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.reminders.cancel(token(request), str(reminder_id)))


request_router = APIRouter(
    prefix="/v1/reminder-requests", tags=["Reminder requests"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 410, 422, 503)},
)


@request_router.post("/preview", response_model=Envelope[ReminderRequestPreview])
def preview_request(request: Request, body: PreviewReminderRequest):
    return envelope(request, request.app.state.reminder_requests.preview(token(request), body))


@request_router.post("", response_model=Envelope[ReminderRequestView], status_code=201)
def create_request(request: Request, body: CreateReminder, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.reminder_requests.create(token(request), body, str(idempotency_key)))


@request_router.get("", response_model=ReminderRequestPage)
def list_requests(request: Request, direction: Literal["received", "sent"] = "received", limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    data, pagination = request.app.state.reminder_requests.list_requests(token(request), direction, limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@request_router.get("/{request_id}/review", response_model=Envelope[ReminderRequestReview])
def review_request(request: Request, request_id: UUID):
    return envelope(request, request.app.state.reminder_requests.review(token(request), str(request_id)))


@request_router.post("/{request_id}/accept", response_model=Envelope[ReminderRequestView])
def accept_request(request: Request, request_id: UUID, body: CreateReminder):
    return envelope(request, request.app.state.reminder_requests.accept(token(request), str(request_id), body))


@request_router.post("/{request_id}/decline", response_model=Envelope[ReminderRequestView])
def decline_request(request: Request, request_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.reminder_requests.resolve(token(request), str(request_id), "decline"))


@request_router.post("/{request_id}/cancel", response_model=Envelope[ReminderRequestView])
def cancel_request(request: Request, request_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.reminder_requests.resolve(token(request), str(request_id), "cancel"))


series_router = APIRouter(
    prefix="/v1/reminder-series", tags=["Repeating reminders"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 410, 412, 422, 428, 503)},
)


def with_etag(request, response, data):
    response.headers["ETag"] = data.etag
    return envelope(request, data)


@series_router.post("/preview", response_model=Envelope[ReminderSeriesPreview])
def preview_series(request: Request, body: PreviewReminderSeries):
    return envelope(request, request.app.state.reminder_series.preview(token(request), body))


@series_router.post("", response_model=Envelope[ReminderSeriesView], status_code=201)
def create_series(request: Request, response: Response, body: CreateReminder, idempotency_key: UUID = Header()):
    return with_etag(request, response, request.app.state.reminder_series.create(token(request), body, str(idempotency_key)))


@series_router.get("", response_model=ReminderSeriesPage)
def list_series(request: Request, task_id: UUID | None = None, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    data, pagination = request.app.state.reminder_series.list_series(token(request), limit, cursor, str(task_id) if task_id else None)
    return {**envelope(request, data), "pagination": pagination}


@series_router.get("/{series_id}", response_model=Envelope[ReminderSeriesView])
def read_series(request: Request, response: Response, series_id: UUID):
    return with_etag(request, response, request.app.state.reminder_series.read(token(request), str(series_id)))


def series_command(request, response, series_id, operation, key, expected):
    return with_etag(request, response, request.app.state.reminder_series.command(token(request), str(series_id), operation, str(key), expected))


@series_router.post("/{series_id}/pause", response_model=Envelope[ReminderSeriesView])
def pause_series(request: Request, response: Response, series_id: UUID, body: ReminderAction, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=160)):
    return series_command(request, response, series_id, "pause", idempotency_key, if_match)


@series_router.post("/{series_id}/resume", response_model=Envelope[ReminderSeriesView])
def resume_series(request: Request, response: Response, series_id: UUID, body: ReminderAction, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=160)):
    return series_command(request, response, series_id, "resume", idempotency_key, if_match)


@series_router.post("/{series_id}/skip", response_model=Envelope[ReminderSeriesView])
def skip_series(request: Request, response: Response, series_id: UUID, body: ReminderAction, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=160)):
    return series_command(request, response, series_id, "skip", idempotency_key, if_match)


@series_router.post("/{series_id}/cancel", response_model=Envelope[ReminderSeriesView])
def cancel_series(request: Request, response: Response, series_id: UUID, body: ReminderAction, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=160)):
    return series_command(request, response, series_id, "cancel", idempotency_key, if_match)


@series_router.post("/{series_id}/move", response_model=Envelope[ReminderSeriesView])
def move_series(request: Request, response: Response, series_id: UUID, body: MoveSeriesOccurrence, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=160)):
    return with_etag(request, response, request.app.state.reminder_series.command(token(request), str(series_id), "move", str(idempotency_key), if_match, body))


@series_router.post("/{series_id}/replace", response_model=Envelope[ReminderSeriesView])
def replace_series(request: Request, response: Response, series_id: UUID, body: CreateReminder, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=160)):
    return with_etag(request, response, request.app.state.reminder_series.replace_series(token(request), str(series_id), body, str(idempotency_key), if_match))