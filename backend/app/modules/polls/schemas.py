from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.modules.community.schemas import clean_text
from app.modules.identity.schemas import Envelope, Input
from app.modules.polls.models import MAX_OPTIONS
from app.modules.spaces.schemas import Pagination


class CreatePoll(Input):
    question: str = Field(max_length=400)
    options: list[str] = Field(min_length=2, max_length=MAX_OPTIONS)
    closes_at: AwareDatetime | None = None

    @field_validator("question")
    @classmethod
    def valid_question(cls, value: str) -> str:
        return clean_text(value, 200, multiline=False)

    @field_validator("options")
    @classmethod
    def valid_options(cls, values: list[str]) -> list[str]:
        cleaned = [clean_text(value, 80, multiline=False) for value in values]
        if len({value.casefold() for value in cleaned}) != len(cleaned):
            raise ValueError("Give each choice a different name.")
        return cleaned


class PollVote(Input):
    option_id: UUID


class PollAction(Input):
    pass


class PollOptionView(BaseModel):
    id: UUID
    label: str
    votes: int


class PollView(BaseModel):
    id: UUID
    space_id: UUID
    question: str
    options: list[PollOptionView]
    status: Literal["open", "closed"]
    closes_at: datetime | None
    closed_at: datetime | None
    created_by_name: str
    created_at: datetime
    total_votes: int
    my_option_id: UUID | None
    # Every option with the most votes: more than one means a tie; empty until someone votes.
    leading_option_ids: list[UUID]
    can_vote: bool
    can_close: bool
    # Given only to people who may close the poll, for If-Match.
    etag: str | None


class PollList(Envelope[list[PollView]]):
    pagination: Pagination


class PollCursor(Input):
    kind: Literal["space_polls"]
    account_id: UUID
    space_id: UUID
    admission_id: UUID
    status: Literal["open", "closed"]
    before_created_at: AwareDatetime
    before_id: UUID
    expires_at: AwareDatetime
