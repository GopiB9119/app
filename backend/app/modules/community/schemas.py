import re
import unicodedata
from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_serializer, model_validator

from app.modules.community.models import FEED_CONTROL_KINDS, INTEREST_DIMENSIONS, MODERATOR_STATES, REPORT_REASONS, TAXONOMY_DIMENSIONS
from app.modules.identity.schemas import Envelope, Input
from app.modules.spaces.schemas import Pagination

# A code from the shared vocabulary (GET /v1/taxonomy). Whether it is a current term is checked against the database.
Code = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
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


def distinct(values):
    if values is not None and len(set(values)) != len(values):
        raise ValueError("Choose each term once.")
    return values


class ClassificationInput(Input):
    """Each list sent replaces that part of the page's classification and [] empties it; a list not sent stays as it is.
    The main topic is not repeated among the other topics."""

    other_topics: list[Code] | None = Field(default=None, max_length=2)
    interests: list[Code] | None = Field(default=None, max_length=10)
    languages: list[Code] | None = Field(default=None, max_length=5)
    places: list[Code] | None = Field(default=None, max_length=3)
    community_types: list[Code] | None = Field(default=None, max_length=2)
    audiences: list[Code] | None = Field(default=None, max_length=3)
    activities: list[Code] | None = Field(default=None, max_length=4)
    content_kinds: list[Code] | None = Field(default=None, max_length=4)

    @field_validator("*")
    @classmethod
    def distinct_codes(cls, value):
        return distinct(value)

    @model_validator(mode="after")
    def no_null(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Send [] to remove every term; null is not accepted.")
        return self

    def requested(self):
        return {field: list(getattr(self, field)) for field in type(self).model_fields if field in self.model_fields_set}


class CreatePage(Input):
    handle: str = Field(min_length=3, max_length=30)
    name: str = Field(min_length=1, max_length=160, description="1 to 80 characters on one line, after spaces are collapsed.")
    description: str = Field(default="", max_length=1000, description="Up to 500 characters, after surrounding spaces are removed.")
    topic: Code = Field(max_length=20, description="The main topic: a current topic code from GET /v1/taxonomy.")
    classification: ClassificationInput | None = None

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
    topic: Code | None = Field(default=None, max_length=20, description="The main topic: a current topic code from GET /v1/taxonomy.")
    rules: str | None = Field(default=None, max_length=4000, description="Up to 2,000 characters, after line endings are normalized and surrounding spaces removed; empty removes the rules.")
    classification: ClassificationInput | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value, 80, multiline=False)

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value, 500, multiline=True, empty=True)

    @field_validator("rules")
    @classmethod
    def valid_rules(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value, 2000, multiline=True, empty=True)

    @model_validator(mode="after")
    def one_change(self):
        if not self.model_fields_set:
            raise ValueError("Change at least one field.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Page fields cannot be cleared with null.")
        return self


POST_TOPICS = Field(default=None, max_length=3, description="Up to 3 topic codes from GET /v1/taxonomy. Without its own topics or interests, a post is about its page's subjects.")
POST_INTERESTS = Field(default=None, max_length=5, description="Up to 5 interest codes from GET /v1/taxonomy.")


class CreatePost(Input):
    title: str | None = Field(default=None, max_length=240, description="Up to 120 characters on one line; empty means no title.")
    body: str = Field(min_length=1, max_length=10000, description="1 to 5,000 characters, after line endings are normalized and surrounding spaces removed.")
    topics: list[Code] | None = POST_TOPICS
    interests: list[Code] | None = POST_INTERESTS

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return (clean_text(value, 120, multiline=False, empty=True) or None) if value is not None else None

    @field_validator("body")
    @classmethod
    def valid_body(cls, value: str) -> str:
        return clean_text(value, 5000, multiline=True)

    @field_validator("topics", "interests")
    @classmethod
    def distinct_codes(cls, value):
        return distinct(value)

    def requested_terms(self):
        return {field: list(getattr(self, field)) for field in ("topics", "interests") if getattr(self, field)}


class UpdatePost(Input):
    title: str | None = Field(default=None, max_length=240, description="Up to 120 characters on one line; empty means no title.")
    body: str | None = Field(default=None, max_length=10000, description="1 to 5,000 characters, after line endings are normalized and surrounding spaces removed.")
    topics: list[Code] | None = POST_TOPICS
    interests: list[Code] | None = POST_INTERESTS

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return (clean_text(value, 120, multiline=False, empty=True) or None) if value is not None else None

    @field_validator("body")
    @classmethod
    def valid_body(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value, 5000, multiline=True)

    @field_validator("topics", "interests")
    @classmethod
    def distinct_codes(cls, value):
        return distinct(value)

    @model_validator(mode="after")
    def one_change(self):
        if not self.model_fields_set:
            raise ValueError("Change the title, the text, the topics or the interests.")
        if "body" in self.model_fields_set and self.body is None:
            raise ValueError("A post needs text.")
        if any(field in self.model_fields_set and getattr(self, field) is None for field in ("topics", "interests")):
            raise ValueError("Send [] to remove every topic or interest; null is not accepted.")
        return self

    def requested_terms(self):
        return {field: list(getattr(self, field)) for field in ("topics", "interests") if field in self.model_fields_set}


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


class LimitMark(BaseModel):
    reason: ReportReason


class ModeratedView(BaseModel):
    author_only: ClassVar[tuple[str, ...]] = ("moderation",)
    moderation: ModerationMark | None = None

    @model_serializer(mode="wrap")
    def author_only_moderation(self, serializer):
        result = serializer(self)
        for field in self.author_only:
            if getattr(self, field) is None:
                result.pop(field, None)
        return result


class ClassificationView(BaseModel):
    """Codes in the owner's order. Names come from GET /v1/taxonomy."""

    other_topics: list[str]
    interests: list[str]
    languages: list[str]
    places: list[str]
    community_types: list[str]
    audiences: list[str]
    activities: list[str]
    content_kinds: list[str]


class PageView(ModeratedView):
    author_only: ClassVar[tuple[str, ...]] = ("moderation", "limit")
    id: str
    handle: str
    name: str
    description: str
    rules: str
    topic: str
    classification: ClassificationView
    status: Literal["active", "read_only", "deleted"]
    follower_count: int = Field(ge=0)
    created_at: AwareDatetime
    updated_at: AwareDatetime
    purge_after: AwareDatetime | None = None
    following: bool
    blocked: bool
    can_manage: bool
    etag: str | None
    limited: bool = Field(False, description="A platform moderator limited the page: new posts and comments are paused (DEC-040).")
    limit: LimitMark | None = Field(None, description="Why it is limited; only its owner sees this.")


class PostView(ModeratedView):
    id: str
    page_id: str
    page_handle: str
    page_name: str
    page_status: Literal["active", "read_only", "deleted"]
    page_limited: bool = Field(False, description="Its page is limited, so nobody can comment (DEC-040).")
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
    pinned: bool
    can_manage: bool
    etag: str | None
    topics: list[str] = Field(description="The post's own topic codes, in the owner's order; empty when it has none.")
    interests: list[str] = Field(description="The post's own interest codes, in the owner's order.")


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


class InviteModerator(Input):
    account_id: UUID


class ModeratorView(BaseModel):
    id: str
    page_id: str
    account_id: str
    display_name: str
    status: Literal[MODERATOR_STATES]
    created_at: AwareDatetime
    expires_at: AwareDatetime | None
    resolved_at: AwareDatetime | None
    etag: str


class ModeratorRoleView(BaseModel):
    """One of the caller's own invitations or appointments, with the page it concerns."""

    id: str
    page_id: str
    page_handle: str
    page_name: str
    status: Literal[MODERATOR_STATES]
    created_at: AwareDatetime
    expires_at: AwareDatetime | None
    resolved_at: AwareDatetime | None
    etag: str


class OfferHandover(Input):
    to_account_id: UUID


class HandoverView(BaseModel):
    id: str
    page_id: str
    page_handle: str
    page_name: str
    from_account_id: str
    from_name: str
    to_account_id: str
    to_name: str
    status: Literal["pending", "accepted", "declined", "cancelled", "expired", "invalidated"]
    created_at: AwareDatetime
    expires_at: AwareDatetime | None
    resolved_at: AwareDatetime | None
    etag: str


class DeletePage(Input):
    confirm: str = Field(min_length=1, max_length=160, description="The page's name, typed to confirm the deletion.")

    @field_validator("confirm")
    @classmethod
    def valid_confirm(cls, value: str) -> str:
        return clean_text(value, 80, multiline=False)


class PageList(Envelope[list[PageView]]):
    pagination: Pagination


class PostList(Envelope[list[PostView]]):
    pagination: Pagination


class CommentList(Envelope[list[CommentView]]):
    pagination: Pagination


class TermNames(BaseModel):
    """English, then Telugu and Hindi machine drafts (DEC-023); a missing name falls back to English."""

    en: str
    te: str | None
    hi: str | None


class TermView(BaseModel):
    dimension: Literal[TAXONOMY_DIMENSIONS]
    code: str
    parent: str | None = Field(description="An interest's topic, or the place this place is inside; null for the rest.")
    sensitive: bool = Field(description="Health, support and caregiving terms. Never used for anything but the choices shown.")
    status: Literal["active", "retired"] = Field(description="A retired term stays where it is used but cannot be chosen again.")
    names: TermNames


class InterestsInput(Input):
    """Replaces every choice at once; each list is required, and [] removes that kind of choice."""

    topics: list[Code] = Field(max_length=10)
    interests: list[Code] = Field(max_length=30)
    languages: list[Code] = Field(max_length=5)
    places: list[Code] = Field(max_length=5)

    @field_validator("*")
    @classmethod
    def distinct_codes(cls, value):
        return distinct(value)


class InterestsView(BaseModel):
    """What the signed-in person chose. Private: shown to nobody else and used only to suggest pages and posts to them."""

    topics: list[str]
    interests: list[str]
    languages: list[str]
    places: list[str]
    etag: str


class SuggestionReason(BaseModel):
    dimension: Literal[INTEREST_DIMENSIONS]
    code: str = Field(description="One of the person's own choices that this page matched.")


class SuggestedPage(BaseModel):
    page: PageView
    reasons: list[SuggestionReason]


class Suggestions(BaseModel):
    ranking: Literal["interests-1"]
    items: list[SuggestedPage]


class InterestPost(BaseModel):
    post: PostView
    reasons: list[SuggestionReason] = Field(min_length=1, description="The person's own topics and interests this post matched.")


class InterestPostList(Envelope[list[InterestPost]]):
    pagination: Pagination


CONTROL_TARGETS = {"mute_page": {"page_id"}, "hide_suggestion": {"page_id"}, "hide_post": {"post_id"}, "mute_term": {"dimension", "code"}}


class FeedControlInput(Input):
    """mute_page and hide_suggestion name a page; hide_post names a post; mute_term names a topic or an interest."""

    kind: Literal[FEED_CONTROL_KINDS]
    page_id: UUID | None = None
    post_id: UUID | None = None
    dimension: Literal["topic", "interest"] | None = None
    code: Code | None = None

    @model_validator(mode="after")
    def one_target(self):
        given = {field for field in ("page_id", "post_id", "dimension", "code") if getattr(self, field) is not None}
        if given != CONTROL_TARGETS[self.kind]:
            raise ValueError("Name exactly the target this kind of control needs.")
        return self


class FeedControlView(BaseModel):
    """Private to its owner. For a hidden post, the page is the post's page."""

    id: str
    kind: Literal[FEED_CONTROL_KINDS]
    page_id: str | None
    page_handle: str | None = Field(description="Null when the page is no longer shown.")
    page_name: str | None = Field(description="Null when the page is no longer shown.")
    post_id: str | None
    post_title: str | None = Field(description="Null for a post without a title, or one no longer shown.")
    post_available: bool | None = Field(description="Whether the hidden post can still be opened; null for other kinds.")
    dimension: Literal["topic", "interest"] | None
    code: str | None
    created_at: AwareDatetime


class FeedControlOutcome(BaseModel):
    id: str
    status: Literal["removed"]


class InsightPeriod(BaseModel):
    start: AwareDatetime
    end: AwareDatetime
    new_followers: int = Field(ge=0, description="People who started following in this period and still follow.")
    posts: int = Field(ge=0, description="Posts published in this period that are still published.")
    comments: int = Field(ge=0, description="Comments others wrote in this period that are still shown.")
    likes: int = Field(ge=0, description="Likes others gave in this period that still stand.")


class PageInsights(BaseModel):
    """Totals for the page's owner only, never who followed, commented or liked (DEC-038). Worked out on request from
    what is still there, so nothing is stored: a follow, comment or like taken back no longer counts."""

    page_id: str
    follower_count: int = Field(ge=0)
    as_of: AwareDatetime
    periods: list[InsightPeriod] = Field(description="Eight periods of 7 days ending at as_of, the most recent first.")


class CommunityCursor(Input):
    kind: str
    account_id: str | None
    scope: str
    after_time: AwareDatetime | None = None
    after_number: int | None = None
    after_id: str
    expires_at: AwareDatetime
