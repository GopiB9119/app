from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.community.api import PageReference, errors, optional_session
from app.modules.community.page_event_schemas import PageEventAttendee, PageEventInput, PageEventView
from app.modules.community.schemas import EmptyAction
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope

router = APIRouter(
    prefix="/v1", tags=["Page events"], responses=errors,
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
)
public_router = APIRouter(prefix="/v1", tags=["Page events"], responses=errors)


def service(request):
    return request.app.state.page_events


@router.post("/pages/{page_ref}/events", response_model=Envelope[PageEventView], status_code=201)
def create_page_event(request: Request, page_ref: UUID, body: PageEventInput, idempotency_key: UUID = Header()):
    """The page's owner or a moderator publishes an event. Times are wall-clock times in the named IANA zone."""
    return envelope(request, service(request).create(token(request), str(page_ref), body, str(idempotency_key)))


@public_router.get("/pages/{page_ref}/events", response_model=Envelope[list[PageEventView]], openapi_extra=optional_session)
def page_events(request: Request, page_ref: PageReference, when: Literal["upcoming", "past"] = "upcoming"):
    """Up to 50 events: upcoming soonest first, past newest first."""
    return envelope(request, service(request).page_events(token(request), page_ref, when))


@public_router.get("/discover/events", response_model=Envelope[list[PageEventView]], openapi_extra=optional_session)
def discover_page_events(request: Request, limit: int = Query(default=6, ge=1, le=20)):
    """Upcoming events on active pages, soonest first, without pages the person blocked or muted."""
    return envelope(request, service(request).discover(token(request), limit))


@public_router.get("/page-events/{event_id}", response_model=Envelope[PageEventView], openapi_extra=optional_session)
def read_page_event(request: Request, event_id: UUID):
    return envelope(request, service(request).read(token(request), str(event_id)))


@router.get("/me/page-events", response_model=Envelope[list[PageEventView]])
def my_page_events(request: Request):
    """Upcoming page events the person said they are going to."""
    return envelope(request, service(request).mine(token(request)))


@router.put("/page-events/{event_id}", response_model=Envelope[PageEventView])
def update_page_event(request: Request, event_id: UUID, body: PageEventInput, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).update(token(request), str(event_id), body, if_match))


@router.post("/page-events/{event_id}/cancel", response_model=Envelope[PageEventView])
def cancel_page_event(request: Request, event_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).cancel(token(request), str(event_id), if_match))


@router.post("/page-events/{event_id}/going", response_model=Envelope[PageEventView])
def going_to_page_event(request: Request, event_id: UUID, body: EmptyAction):
    """Saying it again changes nothing. Going is intent, not proof of attendance."""
    return envelope(request, service(request).attend(token(request), str(event_id), going=True))


@router.post("/page-events/{event_id}/not-going", response_model=Envelope[PageEventView])
def not_going_to_page_event(request: Request, event_id: UUID, body: EmptyAction):
    return envelope(request, service(request).attend(token(request), str(event_id), going=False))


@router.get("/page-events/{event_id}/attendees", response_model=Envelope[list[PageEventAttendee]])
def page_event_attendees(request: Request, event_id: UUID):
    """Who is going, for the page's owner and moderators only."""
    return envelope(request, service(request).attendees(token(request), str(event_id)))
