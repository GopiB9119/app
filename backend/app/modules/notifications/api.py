from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.notifications.schemas import (
    AlertDismissalView,
    AlertFeed,
    BackupPerson,
    CareAlertInput,
    CareAlertView,
    CreateReminderBackup,
    DismissAlert,
    EventAlertInput,
    EventAlertView,
    NotificationPage,
    NotificationView,
    PreferencesInput,
    PreferencesView,
    QuietHoursInput,
    QuietHoursView,
    ReminderBackupPage,
    ReminderBackupView,
)
from app.modules.scheduling.schemas import ReminderAction, SnoozeReminder

router = APIRouter(
    prefix="/v1", tags=["Notifications"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 412, 422, 428, 503)},
)


@router.get("/notifications", response_model=NotificationPage)
def notifications(request: Request, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    data, pagination, unread = request.app.state.notifications.list_notifications(token(request), limit, cursor)
    return {**envelope(request, data), "pagination": pagination, "unread_count": unread}


@router.post("/notifications/{notification_id}/read", response_model=Envelope[NotificationView])
def read(request: Request, notification_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.notifications.action(token(request), str(notification_id), "read"))


@router.post("/notifications/{notification_id}/acknowledge", response_model=Envelope[NotificationView])
def acknowledge(request: Request, notification_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.notifications.action(token(request), str(notification_id), "acknowledge"))


@router.post("/notifications/{notification_id}/snooze", response_model=Envelope[NotificationView])
def snooze(request: Request, notification_id: UUID, body: SnoozeReminder, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.notifications.snooze(token(request), str(notification_id), body.minutes, str(idempotency_key)))


@router.get("/me/notification-preferences", response_model=Envelope[PreferencesView])
def preferences(request: Request, response: Response):
    data, etag = request.app.state.notifications.preferences(token(request))
    response.headers["ETag"] = etag
    return envelope(request, data)


@router.patch("/me/notification-preferences", response_model=Envelope[PreferencesView])
def update_preferences(request: Request, response: Response, body: PreferencesInput, if_match: str | None = Header(default=None, max_length=160)):
    data, etag = request.app.state.notifications.preferences(token(request), body, if_match)
    response.headers["ETag"] = etag
    return envelope(request, data)


@router.get("/me/alerts", response_model=Envelope[AlertFeed])
def alerts(request: Request):
    return envelope(request, request.app.state.alerts.feed(token(request)))


@router.post("/me/alerts/dismiss", response_model=Envelope[AlertDismissalView])
def dismiss_alert(request: Request, body: DismissAlert):
    return envelope(request, request.app.state.alerts.dismiss(token(request), body))


@router.get("/me/quiet-hours", response_model=Envelope[QuietHoursView])
def quiet_hours(request: Request, response: Response):
    data, etag = request.app.state.alerts.quiet_hours(token(request))
    response.headers["ETag"] = etag
    return envelope(request, data)


@router.patch("/me/quiet-hours", response_model=Envelope[QuietHoursView])
def update_quiet_hours(request: Request, response: Response, body: QuietHoursInput, if_match: str | None = Header(default=None, max_length=160)):
    data, etag = request.app.state.alerts.quiet_hours(token(request), body, if_match)
    response.headers["ETag"] = etag
    return envelope(request, data)


@router.get("/reminder-backups", response_model=ReminderBackupPage)
def backups(
    request: Request, role: Literal["owner", "contact"] = "owner", task_id: UUID | None = None,
    limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination = request.app.state.alerts.list_backups(token(request), role, limit, cursor, str(task_id) if task_id else None)
    return {**envelope(request, data), "pagination": pagination}


@router.get("/reminder-backups/contacts", response_model=Envelope[list[BackupPerson]])
def backup_contacts(request: Request, task_id: UUID):
    return envelope(request, request.app.state.alerts.contacts(token(request), str(task_id)))


@router.post("/reminder-backups", response_model=Envelope[ReminderBackupView], status_code=201)
def create_backup(request: Request, body: CreateReminderBackup, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.alerts.create_backup(token(request), body, str(idempotency_key)))


@router.post("/reminder-backups/{backup_id}/accept", response_model=Envelope[ReminderBackupView])
def accept_backup(request: Request, backup_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.alerts.respond(token(request), str(backup_id), "accept"))


@router.post("/reminder-backups/{backup_id}/decline", response_model=Envelope[ReminderBackupView])
def decline_backup(request: Request, backup_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.alerts.respond(token(request), str(backup_id), "decline"))


@router.post("/reminder-backups/{backup_id}/cancel", response_model=Envelope[ReminderBackupView])
def cancel_backup(request: Request, backup_id: UUID, body: ReminderAction):
    return envelope(request, request.app.state.alerts.respond(token(request), str(backup_id), "cancel"))


@router.get("/events/{event_id}/alert", response_model=Envelope[EventAlertView])
def event_alert(request: Request, event_id: UUID):
    return envelope(request, request.app.state.alerts.event_alert(token(request), str(event_id)))


@router.post("/events/{event_id}/alert", response_model=Envelope[EventAlertView])
def set_event_alert(request: Request, event_id: UUID, body: EventAlertInput):
    return envelope(request, request.app.state.alerts.event_alert(token(request), str(event_id), body))


@router.get("/me/care-alerts", response_model=Envelope[list[CareAlertView]])
def care_alerts(request: Request):
    return envelope(request, request.app.state.alerts.care_alerts(token(request)))


@router.post("/care/instructions/{instruction_id}/alerts", response_model=Envelope[CareAlertView])
def set_care_alert(request: Request, instruction_id: UUID, body: CareAlertInput):
    return envelope(request, request.app.state.alerts.set_care_alert(token(request), str(instruction_id), body))