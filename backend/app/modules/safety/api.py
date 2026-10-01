from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.safety.schemas import (
    AppealReview, AppealStatus, AppealView, CreateAppeal, CreateDecision, DecisionView,
    ModerationNotice, ModeratorView, MyReport, QueueList, ResolveAppeal,
)
from app.modules.safety.service import SafetyService


def require_account(request: Request):
    identity = request.app.state.identity
    with identity.sessions() as database:
        identity.authenticate(database, token(request))


router = APIRouter(
    prefix="/v1", tags=["Moderation"],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 422, 503)},
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession")), Depends(require_account)],
)


def service(request):
    return SafetyService(request.app.state.identity)


@router.get("/me/moderator", response_model=Envelope[ModeratorView])
def moderator(request: Request):
    return envelope(request, service(request).moderator(token(request)))


@router.get("/moderation/queue", response_model=QueueList)
def queue(request: Request, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    data, pagination = service(request).queue(token(request), limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@router.post("/moderation/decisions", response_model=Envelope[DecisionView], status_code=201)
def decide(request: Request, body: CreateDecision, idempotency_key: UUID = Header()):
    return envelope(request, service(request).decide(token(request), body, str(idempotency_key)))


@router.get("/moderation/appeals", response_model=Envelope[list[AppealReview]])
def appeals(request: Request, status: AppealStatus = Query(default="open")):
    return envelope(request, service(request).appeals(token(request), status))


@router.post("/moderation/decisions/{decision_id}/appeal", response_model=Envelope[AppealView], status_code=201)
def appeal(request: Request, decision_id: UUID, body: CreateAppeal, idempotency_key: UUID = Header()):
    return envelope(request, service(request).appeal(token(request), str(decision_id), body, str(idempotency_key)))


@router.post("/moderation/appeals/{appeal_id}/resolve", response_model=Envelope[AppealView])
def resolve(request: Request, appeal_id: UUID, body: ResolveAppeal):
    return envelope(request, service(request).resolve(token(request), str(appeal_id), body))


@router.get("/me/moderation-notices", response_model=Envelope[list[ModerationNotice]])
def notices(request: Request):
    return envelope(request, service(request).notices(token(request)))


@router.get("/me/reports", response_model=Envelope[list[MyReport]])
def reports(request: Request):
    return envelope(request, service(request).reports(token(request)))