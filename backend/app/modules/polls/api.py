from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.polls.schemas import CreatePoll, PollAction, PollList, PollView, PollVote

router = APIRouter(
    prefix="/v1", tags=["Polls"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 412, 422, 428, 429, 503)},
)


def service(request):
    return request.app.state.polls


@router.post("/spaces/{space_id}/polls", response_model=Envelope[PollView], status_code=201)
def create_poll(request: Request, space_id: UUID, body: CreatePoll, idempotency_key: UUID = Header()):
    return envelope(request, service(request).create(token(request), str(space_id), body, str(idempotency_key)))


@router.get("/spaces/{space_id}/polls", response_model=PollList)
def list_polls(
    request: Request, space_id: UUID, status: Literal["open", "closed"] = Query(default="open"),
    limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination = service(request).list_polls(token(request), str(space_id), status, limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@router.get("/polls/{poll_id}", response_model=Envelope[PollView])
def read_poll(request: Request, poll_id: UUID):
    return envelope(request, service(request).read(token(request), str(poll_id)))


# Voting again replaces the person's choice, so a retry of the same choice changes nothing.
@router.put("/polls/{poll_id}/vote", response_model=Envelope[PollView])
def vote(request: Request, poll_id: UUID, body: PollVote):
    return envelope(request, service(request).vote(token(request), str(poll_id), body))


@router.delete("/polls/{poll_id}/vote", response_model=Envelope[PollView])
def withdraw_vote(request: Request, poll_id: UUID):
    return envelope(request, service(request).withdraw(token(request), str(poll_id)))


@router.post("/polls/{poll_id}/close", response_model=Envelope[PollView])
def close_poll(request: Request, poll_id: UUID, body: PollAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).close(token(request), str(poll_id), if_match))
