import re
import unicodedata
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_serializer, model_validator

from app.modules.community.models import REPORT_REASONS, TOPICS
from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

Topic = Literal[TOPICS]
ReportReason = Literal[REPORT_REASONS]
HANDLE = re.compile(r"[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]")
RESERVED_HANDLES = {
    "admin", "administrator", "api", "app", "apps", "community", "discover", "explore", "feed", "help", "home",
    "login", "logout", "me", "messages", "moderator", "moderation", "official", "pages", "platform", "posts",
    "privacy", "register", "root", "safety", "security", "settings", "staff", "support", "system", "terms",
}
# Bidirectional overrides and isolates can disguise text direction; zero-width joiners stay allowed for emoji.
BIDI_CONTROLS = {chr(value) for value in (*range(0x202A, 0x202F), *range(0x2066, 0x206A))}


def clean_text(value: str, limit: int, multiline: bool, empty: bool = False) -> str:
    value = value.replace("\r\n", "\n").strip()
    if not multiline:
        value = " ".join(value.split())
    if (not value and not empty) or len(value) > limit:
        raise ValueError(f"Enter {'up to' if empty else '1 to'} {limit} characters.")
    for character in value:
        category = unicodedata.category(character)
        if character in BIDI_CONTROLS or category in {"Cs", "Co", "Cn"} or (category == "Cc" and character not in "\n\t"):
            raise ValueError("Remove control characters.")
    return value


class CreatePage(Input):
    handle: str = Field(min_length=3, max_length=30)
    name: str = Field(min_length=1, max_length=160, description="1 to 80 characters on one line, after spaces are collapsed.")
    description: str = Field(default="", max_length=1000, description="Up to 500 characters, after surrounding spaces are removed.")
    topic: Topic

    @field_validator("handle")
    @classmethod
    def valid_handle(cls, value: str) -> str:
        value = value.strip().lower()
        if not HANDLE.fullmatch(value):
            raise ValueError("Use 3 to 30 lowercase letters or digits, with single hyphens between them.")
        if value in RESERVED_HANDLES:
            raise ValueError("This handle is reserved. Choose another.")
        return value

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return clean_text(value, 80, multiline=False)

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str) -> str:
        return clean_text(value, 500, multiline=True, empty=True)


class UpdatePage(Input):
    name: str | None = Field(default=None, max_length=160, description="1 to 80 characters on one line, after spaces are collapsed.")
    description: str | None = Field(default=None, max_length=1000, description="Up to 500 characters, after surrounding spaces are removed.")
    topic: Topic | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value, 80, multiline=False)

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value, 500, multiline=True, empty=True)

    @model_validator(mode="after")
    def one_change(self):
        if not self.model_fields_set:
            raise ValueError("Change at least one field.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Page fields cannot be cleared with null.")
        return self


class CreatePost(Input):
    title: str | None = Field(default=None, max_length=240, description="Up to 120 characters on one line; empty means no title.")
    body: str = Field(min_length=1, max_length=10000, description="1 to 5,000 characters, after line endings are normalized and surrounding spaces removed.")

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return (clean_text(value, 120, multiline=False, empty=True) or None) if value is not None else None

    @field_validator("body")
    @classmethod
    def valid_body(cls, value: str) -> str:
        return clean_text(value, 5000, multiline=True)


class UpdatePost(Input):
    title: str | None = Field(default=None, max_length=240, description="Up to 120 characters on one line; empty means no title.")
    body: str | None = Field(default=None, max_length=10000, description="1 to 5,000 characters, after line endings are normalized and surrounding spaces removed.")

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return (clean_text(value, 120, multiline=False, empty=True) or None) if value is not None else None

    @field_validator("body")
    @classmethod
    def valid_body(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value, 5000, multiline=True)

    @model_validator(mode="after")
    def one_change(self):
        if not self.model_fields_set:
            raise ValueError("Change the title or the text.")
        if "body" in self.model_fields_set and self.body is None:
            raise ValueError("A post needs text.")
        return self


class EmptyAction(Input):
    pass


class CreateComment(Input):
    body: str = Field(min_length=1, max_length=4000, description="1 to 2,000 characters, after line endings are normalized and surrounding spaces removed.")
    parent_id: UUID | None = None

    @field_validator("body")
    @classmethod
    def valid_body(cls, value: str) -> str:
        return clean_text(value, 2000, multiline=True)


class CreateReport(Input):
    target_type: Literal["page", "post", "comment"]
    target_id: UUID
    reason: ReportReason
    details: str = Field(default="", max_length=2000, description="Up to 1,000 characters.")

    @field_validator("details")
    @classmethod
    def valid_details(cls, value: str) -> str:
        return clean_text(value, 1000, multiline=True, empty=True)


class CreateBlock(Input):
    target_type: Literal["page", "comment_author"]
    target_id: UUID


class ModerationMark(BaseModel):
    hidden: Literal[True] = True
    reason: ReportReason


class ModeratedView(BaseModel):
    moderation: ModerationMark | None = None

    @model_serializer(mode="wrap")
    def author_only_moderation(self, serializer):
        result = serializer(self)
        if self.moderation is None:
            result.pop("moderation", None)
        return result


class PageView(ModeratedView):
    id: str
    handle: str
    name: str
    description: str
    topic: Topic
    follower_count: int = Field(ge=0)
    created_at: AwareDatetime
    updated_at: AwareDatetime
    following: bool
    blocked: bool
    can_manage: bool
    etag: str | None


class PostView(ModeratedView):
    id: str
    page_id: str
    page_handle: str
    page_name: str
    title: str | None
    body: str
    status: Literal["draft", "published"]
    like_count: int = Field(ge=0)
    comment_count: int = Field(ge=0)
    created_at: AwareDatetime
    published_at: AwareDatetime | None
    edited_at: AwareDatetime | None
    liked: bool
    saved: bool
    can_manage: bool
    etag: str | None


class PostOutcome(BaseModel):
    id: str
    status: Literal["deleted"]


class CommentView(ModeratedView):
    id: str
    post_id: str
    parent_id: str | None
    author_name: str
    body: str | None
    status: Literal["visible", "deleted", "removed"]
    created_at: AwareDatetime
    mine: bool
    can_remove: bool


class ReportView(BaseModel):
    id: str
    target_type: Literal["page", "post", "comment"]
    target_id: str
    reason: ReportReason
    status: Literal["received", "reviewing", "closed"]
    created_at: AwareDatetime


class BlockView(BaseModel):
    id: str
    target_type: Literal["page", "account"]
    page_id: str | None
    label: str
    created_at: AwareDatetime


class BlockOutcome(BaseModel):
    id: str
    status: Literal["removed"]


class PageList(Envelope[list[PageView]]):
    pagination: Pagination


class PostList(Envelope[list[PostView]]):
    pagination: Pagination


class CommentList(Envelope[list[CommentView]]):
    pagination: Pagination


class CommunityCursor(Input):
    kind: str
    account_id: str | None
    scope: str
    after_time: AwareDatetime | None = None
    after_number: int | None = None
    after_id: str
    expires_at: AwareDatetime
