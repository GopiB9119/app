from uuid import UUID
from zoneinfo import available_timezones

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse

from app.modules.identity.schemas import (
    AuthView,
    BeginChallenge,
    ChallengeView,
    CompleteRecovery,
    CompleteRegistration,
    DoneView,
    Envelope,
    ErrorEnvelope,
    EventView,
    ExportArchive,
    ExportRequest,
    ExportView,
    Login,
    ProfileInput,
    SessionView,
    UserView,
)

router = APIRouter(
    prefix="/v1",
    responses={
        status: {"model": ErrorEnvelope}
        for status in (400, 401, 403, 404, 409, 412, 422, 428, 429, 503)
    },
)


def token(request):
    authorization = request.headers.get("authorization", "")
    scheme, _, value = authorization.partition(" ")
    return value if scheme.lower() == "bearer" else None


def envelope(request, data):
    return {"data": data, "request_id": request.state.request_id}


@router.post("/auth/register", response_model=Envelope[ChallengeView], status_code=202)
def register(request: Request, body: BeginChallenge, idempotency_key: UUID = Header()):
    service = request.app.state.identity
    service.rate_limit("registration", body.email, request.client.host)
    return envelope(request, service.begin_challenge(body, str(idempotency_key), "registration"))


@router.post("/auth/verify-email", response_model=Envelope[AuthView], status_code=201)
def verify_email(request: Request, body: CompleteRegistration):
    service = request.app.state.identity
    service.rate_limit("proof", str(body.challenge_id), request.client.host)
    return envelope(request, service.register(body))


@router.post("/auth/login", response_model=Envelope[AuthView])
def login(request: Request, body: Login):
    service = request.app.state.identity
    service.rate_limit("login", body.email, request.client.host)
    return envelope(request, service.login(body))


@router.post("/auth/recover", response_model=Envelope[ChallengeView], status_code=202)
def recover(request: Request, body: BeginChallenge, idempotency_key: UUID = Header()):
    service = request.app.state.identity
    service.rate_limit("recovery", body.email, request.client.host)
    return envelope(request, service.begin_challenge(body, str(idempotency_key), "recovery"))


@router.post("/auth/reset-password", response_model=Envelope[DoneView])
def reset_password(request: Request, body: CompleteRecovery):
    service = request.app.state.identity
    service.rate_limit("proof", str(body.challenge_id), request.client.host)
    service.recover(body)
    return envelope(request, DoneView())


@router.get("/me", response_model=Envelope[UserView])
def me(request: Request, response: Response):
    user = request.app.state.identity.me(token(request))
    response.headers["ETag"] = request.app.state.identity.etag(user)
    return envelope(request, user)


@router.patch("/me/profile", response_model=Envelope[UserView])
def profile(request: Request, response: Response, body: ProfileInput, if_match: str | None = Header(default=None)):
    service = request.app.state.identity
    user = service.update_profile(token(request), body, if_match)
    response.headers["ETag"] = service.etag(user)
    return envelope(request, user)


@router.get("/me/sessions", response_model=Envelope[list[SessionView]])
def sessions(request: Request):
    return envelope(request, request.app.state.identity.list_sessions(token(request)))


@router.delete("/me/sessions/{session_id}", response_model=Envelope[DoneView])
def revoke_session(request: Request, session_id: UUID):
    request.app.state.identity.revoke(token(request), str(session_id))
    return envelope(request, DoneView())


@router.post("/me/sessions/revoke-others", response_model=Envelope[DoneView])
def revoke_others(request: Request):
    request.app.state.identity.revoke(token(request), others=True)
    return envelope(request, DoneView())


@router.post("/auth/logout", response_model=Envelope[DoneView])
def logout(request: Request):
    request.app.state.identity.revoke(token(request))
    return envelope(request, DoneView())


@router.get("/me/security-events", response_model=Envelope[list[EventView]])
def security_events(request: Request):
    return envelope(request, request.app.state.identity.events(token(request)))


@router.post("/me/exports", response_model=Envelope[ExportView], status_code=202)
def request_export(request: Request, body: ExportRequest, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.exports.request(token(request), body, str(idempotency_key)))


@router.get("/me/exports", response_model=Envelope[list[ExportView]])
def list_exports(request: Request):
    return envelope(request, request.app.state.exports.list_exports(token(request)))


@router.get("/me/exports/{export_id}", response_model=Envelope[ExportView])
def read_export(request: Request, export_id: UUID):
    return envelope(request, request.app.state.exports.read(token(request), str(export_id)))


@router.delete("/me/exports/{export_id}", response_model=Envelope[ExportView])
def cancel_export(request: Request, export_id: UUID):
    return envelope(request, request.app.state.exports.cancel(token(request), str(export_id)))


@router.get(
    "/me/exports/{export_id}/archive",
    response_model=Envelope[ExportArchive],
    responses={410: {"model": ErrorEnvelope}},
)
def download_export(request: Request, export_id: UUID):
    archive = request.app.state.exports.archive(token(request), str(export_id))
    return JSONResponse({"data": archive, "request_id": request.state.request_id})


@router.get("/timezones", response_model=Envelope[list[str]])
def timezones(request: Request):
    return envelope(request, sorted(available_timezones()))