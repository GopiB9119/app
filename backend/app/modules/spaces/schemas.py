import unicodedata
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.modules.identity.schemas import Envelope, Input


class CreateSpace(Input):
    name: str = Field(min_length=1, max_length=80)
    space_type: Literal["family"]

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(unicodedata.category(character).startswith("C") for character in value):
            raise ValueError("Enter a Space name without control characters.")
        return value


class SpaceView(BaseModel):
    id: str
    name: str
    space_type: Literal["family"]
    visibility: Literal["private"]
    status: Literal["active"]
    role: Literal["owner", "member"]
    version: str
    created_at: datetime


class SpaceMemberView(BaseModel):
    account_id: str
    display_name: str
    role: Literal["owner", "member"]
    joined_at: datetime
    etag: str


class MembershipAction(Input):
    pass


class MembershipOutcome(BaseModel):
    space_id: str
    account_id: str
    status: Literal["removed"] = "removed"


class Pagination(BaseModel):
    next_cursor: str | None
    has_more: bool


class SpacePage(Envelope[list[SpaceView]]):
    pagination: Pagination


class SpaceCursor(Input):
    kind: Literal["space_list"]
    account_id: UUID
    after_id: UUID
    expires_at: AwareDatetime


class CreateInvitation(Input):
    recipient_account_id: UUID


class InvitationAction(Input):
    pass


class InvitationView(BaseModel):
    id: str
    space_id: str
    space_name: str
    inviter_name: str
    recipient_account_id: str
    role: Literal["member"] = "member"
    status: Literal["pending", "accepted", "declined", "revoked", "expired"]
    created_at: datetime
    expires_at: datetime


class InvitationPage(Envelope[list[InvitationView]]):
    pagination: Pagination


class InvitationOutcome(BaseModel):
    id: str
    status: Literal["declined", "revoked"]


class InvitationCursor(Input):
    kind: Literal["invitation_inbox", "space_invitations"]
    account_id: UUID
    space_id: UUID | None = None
    after_id: UUID
    expires_at: AwareDatetime


class CreateOwnershipTransfer(Input):
    recipient_account_id: UUID


class OwnershipTransferAction(Input):
    pass


class OwnershipTransferView(BaseModel):
    id: str
    space_id: str
    space_name: str
    from_account_id: str
    from_name: str
    to_account_id: str
    to_name: str
    status: Literal["pending", "accepted", "declined", "cancelled", "expired", "invalidated"]
    created_at: AwareDatetime
    expires_at: AwareDatetime
    resolved_at: AwareDatetime | None
    version: str
    etag: str


class OwnershipTransferPage(Envelope[list[OwnershipTransferView]]):
    pagination: Pagination


class OwnershipTransferCursor(Input):
    kind: Literal["ownership_transfers"]
    account_id: UUID
    admission_id: UUID
    space_id: UUID
    after_id: UUID
    expires_at: AwareDatetime