from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.events.polls import EventPollService
from app.modules.events.schemas import (
    Attendance,
    BudgetView,
    ChangeContribution,
    CreateEvent,
    CreatePoll,
    EventAction,
    EventDetail,
    EventList,
    PollView,
    RecordContribution,
    RecordExpense,
    SaveBudget,
    SaveSplit,
    UpdateEvent,
    VotePoll,
)
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


@router.get("/events/{event_id}/polls", response_model=Envelope[list[PollView]])
def list_polls(request: Request, event_id: UUID):
    return envelope(request, EventPollService(service(request)).list_polls(token(request), str(event_id)))


@router.post("/events/{event_id}/polls", response_model=Envelope[PollView], status_code=201)
def create_poll(request: Request, event_id: UUID, body: CreatePoll, idempotency_key: UUID = Header()):
    return envelope(request, EventPollService(service(request)).create(token(request), str(event_id), body, str(idempotency_key)))


@router.get("/events/{event_id}/polls/{poll_id}", response_model=Envelope[PollView])
def read_poll(request: Request, event_id: UUID, poll_id: UUID):
    return envelope(request, EventPollService(service(request)).read(token(request), str(event_id), str(poll_id)))


@router.put("/events/{event_id}/polls/{poll_id}/vote", response_model=Envelope[PollView])
def vote_poll(request: Request, event_id: UUID, poll_id: UUID, body: VotePoll, idempotency_key: UUID = Header(),
              if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, EventPollService(service(request)).vote(token(request), str(event_id), str(poll_id), body,
                                                                   str(idempotency_key), if_match))


@router.post("/events/{event_id}/polls/{poll_id}/close", response_model=Envelope[PollView])
def close_poll(request: Request, event_id: UUID, poll_id: UUID, body: EventAction,
               if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, EventPollService(service(request)).close(token(request), str(event_id), str(poll_id), if_match))


# Budgets (DEC-039): planned and recorded amounts; recording an expense is never a payment.
@router.get("/events/{event_id}/budget", response_model=Envelope[BudgetView])
def read_budget(request: Request, event_id: UUID):
    return envelope(request, request.app.state.budgets.read(token(request), str(event_id)))


@router.put("/events/{event_id}/budget", response_model=Envelope[BudgetView])
def save_budget(request: Request, event_id: UUID, body: SaveBudget, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, request.app.state.budgets.save(token(request), str(event_id), body, if_match))


# Splits (DEC-042): a plan for dividing the cost, never a bill; it changes the budget's version like the plan does.
@router.put("/events/{event_id}/budget/split", response_model=Envelope[BudgetView])
def save_split(request: Request, event_id: UUID, body: SaveSplit, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, request.app.state.budgets.save_split(token(request), str(event_id), body, if_match))


@router.delete("/events/{event_id}/budget/split", response_model=Envelope[BudgetView])
def remove_split(request: Request, event_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, request.app.state.budgets.remove_split(token(request), str(event_id), if_match))


@router.post("/events/{event_id}/expenses", response_model=Envelope[BudgetView], status_code=201)
def record_expense(request: Request, event_id: UUID, body: RecordExpense, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.budgets.record_expense(token(request), str(event_id), body, str(idempotency_key)))


@router.delete("/events/{event_id}/expenses/{expense_id}", response_model=Envelope[BudgetView])
def delete_expense(request: Request, event_id: UUID, expense_id: UUID):
    return envelope(request, request.app.state.budgets.delete_expense(token(request), str(event_id), str(expense_id)))


# Contributions (DEC-041): what a person says they promised or gave; only they change it, and it is never a payment.
@router.post("/events/{event_id}/contributions", response_model=Envelope[BudgetView], status_code=201)
def record_contribution(request: Request, event_id: UUID, body: RecordContribution, idempotency_key: UUID = Header()):
    return envelope(
        request, request.app.state.budgets.record_contribution(token(request), str(event_id), body, str(idempotency_key)),
    )


@router.put("/events/{event_id}/contributions/{contribution_id}", response_model=Envelope[BudgetView])
def change_contribution(request: Request, event_id: UUID, contribution_id: UUID, body: ChangeContribution):
    return envelope(
        request, request.app.state.budgets.change_contribution(token(request), str(event_id), str(contribution_id), body),
    )


@router.delete("/events/{event_id}/contributions/{contribution_id}", response_model=Envelope[BudgetView])
def withdraw_contribution(request: Request, event_id: UUID, contribution_id: UUID):
    return envelope(
        request, request.app.state.budgets.withdraw_contribution(token(request), str(event_id), str(contribution_id)),
    )
