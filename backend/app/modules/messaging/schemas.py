import unicodedata
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

MAX_MESSAGE_CHARACTERS = 2000
# Bidirectional overrides and isolates can disguise text direction; zero-width joiners stay allowed for emoji.
BIDI_CONTROLS = {chr(value) for value in (*range(0x202A, 0x202F), *range(0x2066, 0x206A))}


class OpenConversation(Input):
    kind: Literal["space", "direct"]
    participant_account_id: UUID | None = None

    @model_validator(mode="after")
    def participant_matches_kind(self):
        if (self.kind == "direct") != (self.participant_account_id is not None):
            raise ValueError("Choose one other member only for a direct conversation.")
        return self


class SendMessage(Input):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARACTERS * 2)

    @field_validator("body")
    @classmethod
    def valid_body(cls, value: str) -> str:
        value = value.replace("\r\n", "\n").strip()
        if not value or len(value) > MAX_MESSAGE_CHARACTERS:
            raise ValueError(f"Enter a message of 1 to {MAX_MESSAGE_CHARACTERS} characters.")
        for character in value:
            category = unicodedata.category(character)
            if character in BIDI_CONTROLS or category in {"Cs", "Co", "Cn"} or (category == "Cc" and character not in "\n\t"):
                raise ValueError("Remove control characters from the message.")
        return value


class MarkRead(Input):
    through_position: str = Field(pattern=r"^(0|[1-9][0-9]{0,8})$")


class MessageAction(Input):
    pass


class ParticipantView(BaseModel):
    account_id: str
    display_name: str


class ConversationView(BaseModel):
    id: str
    space_id: str
    space_name: str
    kind: Literal["space", "direct"]
    title: str
    participants: list[ParticipantView]
    can_send: bool
    protection: Literal["server_encrypted"] = "server_encrypted"
    last_position: str
    read_position: str
    unread_count: int = Field(ge=0)
    last_message_at: AwareDatetime | None
    created_at: AwareDatetime


class ConversationPage(Envelope[list[ConversationView]]):
    pagination: Pagination
    unread_count: int = Field(ge=0)


class ConversationCursor(Input):
    kind: Literal["conversation_list"]
    account_id: UUID
    space_id: UUID | None = None
    after_activity: AwareDatetime
    after_id: UUID
    expires_at: AwareDatetime


class MessageView(BaseModel):
    id: str
    conversation_id: str
    position: str
    sender_account_id: str
    sender_name: str
    mine: bool
    client_message_id: str | None
    status: Literal["sent", "deleted", "unavailable"]
    body: str | None
    created_at: AwareDatetime
    deleted_at: AwareDatetime | None


class MessagePage(Envelope[list[MessageView]]):
    pagination: Pagination
