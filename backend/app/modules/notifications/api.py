from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.notifications.schemas import NotificationPage, NotificationView, PreferencesInput, PreferencesView
from app.modules.scheduling.schemas import ReminderAction

router = APIRouter(
    prefix="/v1", tags=["Notifications"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 410, 412, 422, 428, 503)},
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