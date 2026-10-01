from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.events.schemas import Attendance, CreateEvent, EventAction, EventDetail, EventList, UpdateEvent
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope

router = APIRouter(
    prefix="/v1", tags=["Events"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 412, 422, 428, 429, 503)},
)


def service(request):
    return request.app.state.events


@router.post("/spaces/{space_id}/events", response_model=Envelope[EventDetail], status_code=201)
def create_event(request: Request, space_id: UUID, body: CreateEvent, idempotency_key: UUID = Header()):
    return envelope(request, service(request).create(token(request), str(space_id), body, str(idempotency_key)))


@router.get("/spaces/{space_id}/events", response_model=EventList)
def list_events(
    request: Request, space_id: UUID, when: Literal["upcoming", "past"] = Query(default="upcoming"),
    limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination = service(request).list_events(token(request), str(space_id), when, limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@router.get("/events/{event_id}", response_model=Envelope[EventDetail])
def read_event(request: Request, event_id: UUID):
    return envelope(request, service(request).read(token(request), str(event_id)))


@router.patch("/events/{event_id}", response_model=Envelope[EventDetail])
def update_event(request: Request, event_id: UUID, body: UpdateEvent, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).update(token(request), str(event_id), body, if_match))


@router.post("/events/{event_id}/cancel", response_model=Envelope[EventDetail])
def cancel_event(request: Request, event_id: UUID, body: EventAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).cancel(token(request), str(event_id), if_match))


@router.post("/events/{event_id}/attendance", response_model=Envelope[EventDetail])
def respond_to_event(request: Request, event_id: UUID, body: Attendance):
    return envelope(request, service(request).respond(token(request), str(event_id), body))
