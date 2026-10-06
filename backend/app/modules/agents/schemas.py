import unicodedata
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, Field, StringConstraints, field_validator

from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination
from app.modules.agents.web import public_link

RunStatus = Literal[
    "queued", "running", "waiting_for_approval", "waiting_for_user", "verifying",
    "completed", "failed", "cancelled", "timed_out", "expired",
]
ApprovalStatus = Literal["pending", "approved", "rejected", "expired", "cancelled", "superseded"]


def plain_message(value: str) -> str:
    value = value.replace("\r\n", "\n")
    if any(unicodedata.category(character).startswith("C") and character not in "\n\t" for character in value):
        raise ValueError("Use a message without control characters.")
    return value


AgentMessage = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000), AfterValidator(plain_message)]
AgentAnswer = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000), AfterValidator(plain_message)]


class CreateAgentRun(Input):
    # No Space asks the person's Main Agent (DEC-060); a Space asks that Space's own agent.
    space_id: UUID | None = None
    message: AgentMessage
    # The person's choice to let this request's changes run without asking (public posts, pages and comments still ask).
    auto_approve: bool = False


class ResumeAgentRun(Input):
    question_id: UUID
    answer: AgentAnswer


class AgentAction(Input):
    pass


class WebFetchOptions(Input):
    format: Literal["markdown", "html", "json"] = "markdown"
    ttl: Literal[0, 60, 3600, 86400] | None = 0
    links: bool = Field(False, strict=True)
    image_links: bool = Field(False, strict=True)
    include_selectors: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]] = Field(default_factory=list, max_length=20)
    exclude_selectors: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]] = Field(default_factory=list, max_length=20)

    @field_validator("ttl", mode="before")
    @classmethod
    def integer_freshness(cls, value):
        if value is not None and type(value) is not int:
            raise ValueError("Freshness must be a whole number or null.")
        return value

    @field_validator("include_selectors", "exclude_selectors")
    @classmethod
    def plain_selectors(cls, values):
        if any(any(unicodedata.category(character).startswith("C") for character in value) for value in values):
            raise ValueError("Use selectors without control characters.")
        return values


class CreateWebFetch(WebFetchOptions):
    urls: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=300)]] = Field(min_length=1, max_length=10)

    @field_validator("urls")
    @classmethod
    def public_unique_urls(cls, values):
        if any(public_link(value) is None for value in values):
            raise ValueError("Use public http(s) URLs without credentials or private addresses.")
        if len(set(values)) != len(values):
            raise ValueError("Enter each URL only once.")
        return values


class WebFetchPage(BaseModel):
    url: str
    final_url: str | None = None
    title: str | None = None
    description: str | None = None
    language: str | None = None
    author: str | None = None
    published_date: str | None = None
    format: Literal["markdown", "html", "json"]
    text: str | None = None
    partial: bool = False
    links: list[str] = []
    image_links: list[str] = []
    links_partial: bool = False
    image_links_partial: bool = False
    unmatched_selectors: list[str] = []
    error: str | None = None


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
    space_id: str | None
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
    kind: Literal["task", "reminder", "memory", "roster", "policy", "event", "document", "page", "post", "comment", "report", "message", "space", "interests"]
    ref: str | None
    label: str


class AgentTodoView(BaseModel):
    content: str
    status: Literal["pending", "in_progress", "completed"]


class AgentHandoffView(BaseModel):
    """A button to one of the person's own Space chats, where that Space's agent helps (DEC-060)."""
    space_id: str
    name: str
    space_type: Literal["family", "couple", "group", "solo"]


class AgentWebSource(BaseModel):
    title: str
    url: str
    read: bool = False
    video_id: str | None = None


class AgentWebTextView(BaseModel):
    source: AgentWebSource
    text: Annotated[str, StringConstraints(min_length=1, max_length=2600)]
    offset: Annotated[int, Field(ge=0, le=24000)] | None
    partial: bool


class AgentRunWebTextView(BaseModel):
    run_id: str
    sources: list[AgentWebTextView] = Field(max_length=8)


class AgentRunView(BaseModel):
    id: str
    agent_kind: Literal["main", "space"] = "space"
    space_id: str | None
    message: str
    status: RunStatus
    outcome: Literal["answered", "refused", "action_completed"] | None
    stop_reason: str | None
    intent: str | None
    answer: str | None
    sources: list[AgentWebSource] = []
    question: AgentQuestionView | None
    approval: AgentApprovalView | None
    plan: list[AgentPlanStep]
    todos: list[AgentTodoView] = []
    handoffs: list[AgentHandoffView] = []
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
    # The Space whose agent keeps this note; None for the person's own memory.
    space_id: str | None = None
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
    space_id: UUID | None
    admission_id: UUID | None
    before_created_at: AwareDatetime
    before_id: UUID
    expires_at: AwareDatetime
