import unicodedata
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, StringConstraints

from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

RunStatus = Literal[
    "queued", "running", "waiting_for_approval", "waiting_for_user", "verifying",
    "completed", "failed", "cancelled", "timed_out", "expired",
]
ApprovalStatus = Literal["pending", "approved", "rejected", "expired", "cancelled", "superseded"]


def plain_message(value: str) -> str:
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise ValueError("Use a message without control characters or line breaks.")
    return value


AgentMessage = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500), AfterValidator(plain_message)]


class CreateAgentRun(Input):
    space_id: UUID
    message: AgentMessage


class ResumeAgentRun(Input):
    question_id: UUID
    answer: AgentMessage


class AgentAction(Input):
    pass


class AgentEventView(BaseModel):
    sequence: int
    event_type: str
    summary: str
    created_at: datetime


class AgentPlanStep(BaseModel):
    id: str
    label: str
    kind: Literal["check", "tool", "approval", "response"]
    tool: str | None
    status: Literal["pending", "done", "skipped", "failed"]


class AgentToolCallView(BaseModel):
    id: str
    sequence: int
    tool_name: str
    tool_version: str
    effect: Literal["read", "write"]
    risk: Literal["low", "medium"]
    status: Literal["succeeded", "failed"]
    summary: str
    result_ref: str | None
    error_code: str | None
    approval_id: str | None
    created_at: datetime


class AgentApprovalField(BaseModel):
    label: str
    value: str


class AgentApprovalView(BaseModel):
    id: str
    run_id: str
    space_id: str
    tool_name: str
    risk: Literal["low", "medium"]
    summary: str
    fields: list[AgentApprovalField]
    status: ApprovalStatus
    reason: str | None
    result_ref: str | None
    created_at: datetime
    expires_at: datetime
    decided_at: datetime | None
    version: str
    etag: str


class AgentQuestionView(BaseModel):
    id: str
    text: str
    expires_at: datetime


class AgentEvidence(BaseModel):
    kind: Literal["task", "reminder", "memory", "roster", "policy"]
    ref: str | None
    label: str


class AgentRunView(BaseModel):
    id: str
    space_id: str
    message: str
    status: RunStatus
    outcome: Literal["answered", "refused", "action_completed"] | None
    stop_reason: str | None
    intent: str | None
    answer: str | None
    question: AgentQuestionView | None
    approval: AgentApprovalView | None
    plan: list[AgentPlanStep]
    tool_calls: list[AgentToolCallView]
    evidence: list[AgentEvidence]
    events: list[AgentEventView]
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None
    version: str


class AgentRunPage(Envelope[list[AgentRunView]]):
    pagination: Pagination


class AgentEventPage(Envelope[list[AgentEventView]]):
    pagination: Pagination


class AgentMemoryView(BaseModel):
    id: str
    kind: Literal["preference", "note"]
    key: str | None
    label: str
    content: str
    source: str
    source_run_id: str | None
    created_at: datetime


class AgentToolView(BaseModel):
    name: str
    version: str
    description: str
    effect: Literal["read", "write"]
    risk: Literal["low", "medium"]
    requires_approval: bool


class DeletedMemory(BaseModel):
    id: str
    status: Literal["deleted"] = "deleted"


class AgentRunCursor(Input):
    kind: Literal["agent_runs"]
    account_id: UUID
    space_id: UUID
    admission_id: UUID
    before_created_at: AwareDatetime
    before_id: UUID
    expires_at: AwareDatetime
