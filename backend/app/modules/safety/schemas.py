from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.modules.community.schemas import ReportReason, clean_text
from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

TargetType = Literal["page", "post", "comment"]
DecisionAction = Literal["no_action", "hide", "restore"]
AppealStatus = Literal["open", "upheld", "overturned"]


class OptionalNote(Input):
    note: str = Field(default="", max_length=1000)

    @field_validator("note")
    @classmethod
    def valid_note(cls, value: str) -> str:
        return clean_text(value, 1000, multiline=True, empty=True)


class CreateDecision(OptionalNote):
    target_type: TargetType
    target_id: UUID
    action: Literal["no_action", "hide"]
    reason: ReportReason


class CreateAppeal(OptionalNote):
    note: str = Field(max_length=1000)

    @field_validator("note")
    @classmethod
    def valid_note(cls, value: str) -> str:
        # DEC-024: the author appeals "with a short note", and both apps show an appeal only with one (T103).
        return clean_text(value, 1000, multiline=True, empty=False)


class ResolveAppeal(OptionalNote):
    outcome: Literal["upheld", "overturned"]


class ModeratorView(BaseModel):
    moderator: bool


class DecisionView(BaseModel):
    id: str
    target_type: TargetType
    target_id: str
    action: DecisionAction
    reason: ReportReason
    note: str
    decided_by: str
    decided_at: AwareDatetime
    appeal_of: str | None


class ContentPreview(BaseModel):
    name: str | None = None
    handle: str | None = None
    description: str | None = None
    title: str | None = None
    body: str | None = None
    status: str


class ReasonCount(BaseModel):
    reason: ReportReason
    count: int = Field(ge=1)


class QueueTarget(BaseModel):
    target_type: TargetType
    target_id: str
    preview: ContentPreview
    page_name: str | None
    report_count: int = Field(ge=1)
    reasons: list[ReasonCount]
    first_reported_at: AwareDatetime


class QueueList(Envelope[list[QueueTarget]]):
    pagination: Pagination


class QueueCursor(Input):
    kind: Literal["moderation_queue"] = "moderation_queue"
    account_id: str
    after_time: AwareDatetime
    after_type: TargetType
    after_id: str
    expires_at: AwareDatetime


class AppealView(BaseModel):
    id: str
    decision_id: str
    note: str
    status: AppealStatus
    created_at: AwareDatetime
    resolved_at: AwareDatetime | None


class AppealReview(BaseModel):
    appeal: AppealView
    decision: DecisionView
    preview: ContentPreview
    page_name: str | None
    resolution_note: str | None


class ModerationNotice(BaseModel):
    id: str
    target_type: TargetType
    target_id: str
    action: DecisionAction
    reason: ReportReason
    decided_at: AwareDatetime
    appeal_status: AppealStatus | None
    appeal_of: str | None


class MyReport(BaseModel):
    id: str
    target_type: TargetType
    target_id: str
    reason: ReportReason
    status: Literal["open", "reviewed"]
    outcome: Literal["action_taken", "no_action"] | None
    action: DecisionAction | None
    created_at: AwareDatetime
    reviewed_at: AwareDatetime | None