from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.modules.community.schemas import clean_text
from app.modules.files.models import MEDIA_TYPES
from app.modules.files.text import MAX_DOCUMENT_BYTES
from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

MediaType = Literal[MEDIA_TYPES]


class AddDocument(Input):
    name: str = Field(min_length=1, max_length=400)
    # Characters, not bytes: the byte limit is checked after line breaks are normalized.
    content: str = Field(min_length=1, max_length=MAX_DOCUMENT_BYTES)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = clean_text(value, 120, multiline=False)
        if "/" in value or "\\" in value:
            raise ValueError("Use a file name without folders.")
        return value


class DocumentAction(Input):
    pass


class DocumentView(BaseModel):
    id: UUID
    space_id: UUID
    space_name: str
    status: Literal["active", "deleted"]
    name: str | None
    media_type: MediaType | None
    size_bytes: int | None
    line_count: int | None
    sha256: str | None
    added_by_name: str
    added_at: AwareDatetime
    deleted_at: AwareDatetime | None
    can_delete: bool


class DocumentDetail(DocumentView):
    content: str | None


class DocumentOutcome(BaseModel):
    id: UUID
    space_id: UUID
    status: Literal["deleted"]
    deleted_at: AwareDatetime


class DocumentList(Envelope[list[DocumentView]]):
    pagination: Pagination


class DocumentCursor(Input):
    kind: Literal["space_documents"]
    account_id: UUID
    space_id: UUID
    after_created: AwareDatetime
    after_id: UUID
    expires_at: AwareDatetime
