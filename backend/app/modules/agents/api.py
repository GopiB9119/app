from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.agents.schemas import (
    AgentAction,
    AgentMemoryView,
    AgentRunPage,
    AgentRunView,
    AgentRunWebTextView,
    AgentToolView,
    CreateAgentRun,
    DeletedMemory,
    ResumeAgentRun,
)
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope

router = APIRouter(
    prefix="/v1", tags=["Agent"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 410, 412, 422, 428, 429, 503)},
)


@router.post("/agent-runs", response_model=Envelope[AgentRunView], status_code=201)
def create_run(request: Request, body: CreateAgentRun, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.agents.create_run(token(request), body, str(idempotency_key)))


@router.get("/agent-runs", response_model=AgentRunPage)
def list_runs(request: Request, space_id: UUID | None = None, limit: int = Query(default=20, ge=1, le=50),
              cursor: str | None = Query(default=None, max_length=2048)):
    # Without a Space: the person's Main Agent requests (DEC-060).
    data, pagination = request.app.state.agents.list_runs(token(request), space_id, limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@router.get("/agent-runs/{run_id}", response_model=Envelope[AgentRunView])
def read_run(request: Request, run_id: UUID):
    return envelope(request, request.app.state.agents.read_run(token(request), run_id))


@router.get("/agent-runs/{run_id}/web-text", response_model=Envelope[AgentRunWebTextView])
def read_web_text(request: Request, run_id: UUID):
    return envelope(request, request.app.state.agents.read_web_text(token(request), run_id))


@router.post("/agent-runs/{run_id}/resume", response_model=Envelope[AgentRunView])
def resume_run(request: Request, run_id: UUID, body: ResumeAgentRun):
    return envelope(request, request.app.state.agents.resume(token(request), run_id, body))


@router.post("/agent-runs/{run_id}/cancel", response_model=Envelope[AgentRunView])
def cancel_run(request: Request, run_id: UUID, body: AgentAction):
    return envelope(request, request.app.state.agents.cancel(token(request), run_id))


@router.post("/agent-approvals/{approval_id}/approve", response_model=Envelope[AgentRunView])
def approve(request: Request, approval_id: UUID, body: AgentAction, idempotency_key: UUID = Header(),
            if_match: str | None = Header(default=None, max_length=160)):
    return envelope(request, request.app.state.agents.approve(token(request), approval_id, str(idempotency_key), if_match))


@router.post("/agent-approvals/{approval_id}/reject", response_model=Envelope[AgentRunView])
def reject(request: Request, approval_id: UUID, body: AgentAction, if_match: str | None = Header(default=None, max_length=160)):
    return envelope(request, request.app.state.agents.reject(token(request), approval_id, if_match))


@router.get("/agent-memories", response_model=Envelope[list[AgentMemoryView]])
def list_memories(request: Request):
    return envelope(request, request.app.state.agents.list_memories(token(request)))


@router.delete("/agent-memories/{memory_id}", response_model=Envelope[DeletedMemory])
def delete_memory(request: Request, memory_id: UUID):
    return envelope(request, request.app.state.agents.delete_memory(token(request), memory_id))


@router.get("/agent-tools", response_model=Envelope[list[AgentToolView]])
def list_tools(request: Request):
    request.app.state.identity.me(token(request))
    return envelope(request, request.app.state.agents.tools())
