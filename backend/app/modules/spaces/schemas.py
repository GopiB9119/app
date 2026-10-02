import unicodedata
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from app.modules.identity.schemas import Envelope, Input


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.replace("\r\n", "\n").strip()
    if any(character != "\n" and unicodedata.category(character).startswith("C") for character in value):
        raise ValueError("Remove control and text-direction characters.")
    return value


class CreateSpace(Input):
    name: str = Field(min_length=1, max_length=80)
    space_type: Literal["family", "solo", "group", "couple"]
    visibility: Literal["private", "public"] = "private"
    description: str = Field(default="", max_length=280)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(unicodedata.category(character).startswith("C") for character in value):
            raise ValueError("Enter a Space name without control characters.")
        return value

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str) -> str:
        return clean_text(value)

    @model_validator(mode="after")
    def only_groups_are_public(self):
        if self.visibility == "public" and self.space_type != "group":
            raise ValueError("Only group Spaces can be public.")
        return self


class EditSpaceSettings(Input):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=280)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return CreateSpace.valid_name(value)

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str | None) -> str | None:
        return clean_text(value)


class ChangeSpaceVisibility(Input):
    visibility: Literal["private", "public"]


class ChangeInvitePolicy(Input):
    member_invites: bool = Field(strict=True)


class SpaceView(BaseModel):
    id: str
    name: str
    description: str
    space_type: Literal["family", "solo", "group", "couple"]
    visibility: Literal["private", "public"]
    # DEC-026: whether every member, not only the owner and admins, may invite people.
    member_invites: bool
    status: Literal["active"]
    role: Literal["owner", "admin", "member"]
    version: str
    created_at: datetime


class SpaceSettingsView(SpaceView):
    etag: str


class SpaceMemberView(BaseModel):
    account_id: str
    display_name: str
    role: Literal["owner", "admin", "member"]
    joined_at: datetime
    etag: str


class ChangeMemberRole(Input):
    role: Literal["admin", "member"]


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


class SpaceDirectoryEntry(BaseModel):
    id: str
    name: str
    description: str
    member_count: int
    viewer_role: Literal["owner", "admin", "member"] | None
    pending_request_id: str | None
    can_request: bool


class SpaceDirectoryPage(Envelope[list[SpaceDirectoryEntry]]):
    pagination: Pagination


class SpaceDirectoryCursor(Input):
    kind: Literal["space_directory"]
    account_id: UUID
    query: str
    after_created_at: AwareDatetime
    after_id: UUID
    expires_at: AwareDatetime


class CreateJoinRequest(Input):
    note: str = Field(default="", max_length=280)

    @field_validator("note")
    @classmethod
    def valid_note(cls, value: str) -> str:
        return clean_text(value)


class JoinRequestAction(Input):
    pass


class JoinRequestView(BaseModel):
    id: str
    space_id: str
    space_name: str
    note: str
    status: Literal["pending", "approved", "declined", "cancelled", "closed", "expired"]
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None


class JoinRequestReview(BaseModel):
    id: str
    account_id: str
    display_name: str
    note: str
    created_at: datetime
    expires_at: datetime


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