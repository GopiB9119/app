from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.scheduling.schemas import CreateReminder, PreviewReminder, ReminderAction, ReminderPage, ReminderPreview, ReminderView
from app.modules.scheduling.schemas import PreviewReminderRequest, ReminderRequestPage, ReminderRequestPreview, ReminderRequestReview, ReminderRequestView

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