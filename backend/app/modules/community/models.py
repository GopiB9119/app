from datetime import date, datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, SmallInteger, String, Text,
    UniqueConstraint, text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import AccountSession, User

REPORT_REASONS = ("spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other")
# The shared vocabulary's kinds of term (DEC-027). A page may use all of them; a person chooses only the first four.
TAXONOMY_DIMENSIONS = ("topic", "interest", "language", "place", "community_type", "audience", "activity", "content_kind")
INTEREST_DIMENSIONS = ("topic", "interest", "language", "place")
# What a single post may be tagged with (DEC-036).
POST_DIMENSIONS = ("topic", "interest")


def listed(values):
    return ", ".join(f"'{value}'" for value in values)


class TaxonomyTerm(Base):
    """One term of the shared vocabulary. Reference data: migration 0032 adds the terms, so tests never empty this table."""

    __tablename__ = "taxonomy_terms"
    __table_args__ = (
        ForeignKeyConstraint(
            ["parent_dimension", "parent_code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_taxonomy_term_parent",
        ),
        CheckConstraint(f"dimension IN ({listed(TAXONOMY_DIMENSIONS)})", name="ck_taxonomy_term_dimension"),
        CheckConstraint("code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="ck_taxonomy_term_code"),
        CheckConstraint("status IN ('active', 'retired')", name="ck_taxonomy_term_status"),
        CheckConstraint("char_length(label_en) > 0 AND char_length(path) > 0", name="ck_taxonomy_term_text"),
        CheckConstraint(
            "(dimension = 'interest' AND parent_dimension IS NOT NULL AND parent_dimension = 'topic' AND parent_code IS NOT NULL) OR "
            "(dimension = 'place' AND ((parent_dimension IS NULL AND parent_code IS NULL) OR "
            "(parent_dimension IS NOT NULL AND parent_dimension = 'place' AND parent_code IS NOT NULL))) OR "
            "(dimension NOT IN ('interest', 'place') AND parent_dimension IS NULL AND parent_code IS NULL)",
            name="ck_taxonomy_term_parent",
        ),
        CheckConstraint("dimension <> 'topic' OR char_length(code) <= 20", name="ck_taxonomy_term_topic_code"),
        Index("ix_taxonomy_term_order", "dimension", "sort_order"),
        {"info": {"reference_data": True}},
    )

    dimension: Mapped[str] = mapped_column(String(20), primary_key=True)
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    parent_dimension: Mapped[str | None] = mapped_column(String(20))
    parent_code: Mapped[str | None] = mapped_column(String(64))
    # Codes from the top term down, joined by '/', so a place finds the places inside it with one prefix test.
    path: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer)
    sensitive: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    status: Mapped[str] = mapped_column(String(10), default="active", server_default="active")
    label_en: Mapped[str] = mapped_column(String(80))
    label_te: Mapped[str | None] = mapped_column(String(120))
    label_hi: Mapped[str | None] = mapped_column(String(120))


class TaxonomyTermChange(Base):
    """What an operator changed in the vocabulary, and when (T128)."""

    __tablename__ = "taxonomy_term_changes"
    __table_args__ = (
        ForeignKeyConstraint(["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_taxonomy_change_term"),
        CheckConstraint("action IN ('added', 'named', 'retired', 'restored')", name="ck_taxonomy_change_action"),
        Index("ix_taxonomy_change_term", "dimension", "code", "changed_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dimension: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(10))
    details: Mapped[str] = mapped_column(Text)
    changed_by: Mapped[str] = mapped_column(String(20))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PublicPage(Base):
    __tablename__ = "public_pages"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived', 'read_only', 'deleted')", name="ck_public_page_status"),
        CheckConstraint("pre_delete_status IS NULL OR pre_delete_status IN ('active', 'read_only')", name="ck_public_page_restore"),
        CheckConstraint("topic_dimension = 'topic'", name="ck_public_page_topic_dimension"),
        ForeignKeyConstraint(
            ["topic_dimension", "topic"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_public_page_topic",
        ),
        CheckConstraint("handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'", name="ck_public_page_handle"),
        CheckConstraint("follower_count >= 0 AND version >= 1", name="ck_public_page_counts"),
        CheckConstraint("char_length(rules) <= 2000", name="ck_public_page_rules"),
        CheckConstraint(
            "(moderation_limited_at IS NULL) = (moderation_limit_decision_id IS NULL)", name="ck_public_page_moderation_limit",
        ),
        UniqueConstraint("handle", name="uq_public_page_handle"),
        UniqueConstraint("owner_id", "creation_key", name="uq_public_page_creation"),
        Index("ix_public_page_owner", "owner_id"),
        Index("ix_public_page_popularity", "follower_count", "id"),
        Index("ix_public_page_purge", "purge_after", postgresql_where=text("purge_after IS NOT NULL")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    handle: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    rules: Mapped[str] = mapped_column(Text, default="", server_default="")
    # The owner's choice to take help requests and offers from followers (D3).
    help_open: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    topic: Mapped[str] = mapped_column(String(20))
    topic_dimension: Mapped[str] = mapped_column(String(20), default="topic", server_default="topic")
    owner_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    status: Mapped[str] = mapped_column(String(16))
    follower_count: Mapped[int] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purge_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pre_delete_status: Mapped[str | None] = mapped_column(String(16))
    moderation_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_public_pages_moderation_decision"),
    )
    # A limit is separate from hiding: either can be lifted without the other (DEC-040).
    moderation_limited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_limit_decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_public_pages_moderation_limit"),
    )


class PageFollow(Base):
    __tablename__ = "public_page_follows"
    __table_args__ = (Index("ix_public_follow_account", "account_id", "created_at"),)

    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PageTerm(Base):
    """A page's classification beyond its main topic: other topics, interests, languages, places and the rest (DEC-027)."""

    __tablename__ = "page_terms"
    __table_args__ = (
        ForeignKeyConstraint(["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_page_term_term"),
        CheckConstraint(f"dimension IN ({listed(TAXONOMY_DIMENSIONS)})", name="ck_page_term_dimension"),
        CheckConstraint("position >= 0", name="ck_page_term_position"),
        Index("ix_page_term_lookup", "dimension", "code", "page_id"),
    )

    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id), primary_key=True)
    dimension: Mapped[str] = mapped_column(String(20), primary_key=True)
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    position: Mapped[int] = mapped_column(SmallInteger)


class AccountInterest(Base):
    """A topic, interest, language or place a person chose. Private to that person (DEC-027 part 4)."""

    __tablename__ = "account_interests"
    __table_args__ = (
        ForeignKeyConstraint(
            ["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_account_interest_term",
        ),
        CheckConstraint(f"dimension IN ({listed(INTEREST_DIMENSIONS)})", name="ck_account_interest_dimension"),
        CheckConstraint("position >= 0", name="ck_account_interest_position"),
    )

    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    dimension: Mapped[str] = mapped_column(String(20), primary_key=True)
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    position: Mapped[int] = mapped_column(SmallInteger)
    chosen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


MODERATOR_STATES = (
    "pending", "active", "declined", "cancelled", "withdrawn", "removed", "stepped_down", "expired", "invalidated",
)


class PageModerator(Base):
    """One invitation or active appointment (DEC-025 part 3). A resolved row keeps its history; only 'pending' rows expire."""

    __tablename__ = "page_moderators"
    __table_args__ = (
        CheckConstraint(f"status IN ({listed(MODERATOR_STATES)})", name="ck_page_moderator_status"),
        CheckConstraint("version > 0 AND (expires_at IS NULL OR expires_at > created_at)", name="ck_page_moderator_bounds"),
        CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL) AND (status = 'pending') = (expires_at IS NOT NULL)",
            name="ck_page_moderator_resolution",
        ),
        CheckConstraint("account_id <> invited_by_id", name="ck_page_moderator_participants"),
        UniqueConstraint("page_id", "invited_by_id", "request_key", name="uq_page_moderator_request"),
        Index("uq_page_moderator_pending", "page_id", unique=True, postgresql_where=text("status = 'pending'")),
        Index("uq_page_moderator_active", "page_id", "account_id", unique=True, postgresql_where=text("status = 'active'")),
        Index("ix_page_moderator_account", "account_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    invited_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    status: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    decision_etag: Mapped[str | None] = mapped_column(String(70))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PageHandover(Base):
    """One offer to hand a page to a current moderator (DEC-025 part 4)."""

    __tablename__ = "page_handovers"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated')", name="ck_page_handover_status"),
        CheckConstraint("version > 0 AND source_version > 0 AND (expires_at IS NULL OR expires_at > created_at)", name="ck_page_handover_bounds"),
        CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL) AND (status = 'pending') = (expires_at IS NOT NULL)",
            name="ck_page_handover_resolution",
        ),
        CheckConstraint("from_account_id <> to_account_id", name="ck_page_handover_participants"),
        UniqueConstraint("page_id", "from_account_id", "request_key", name="uq_page_handover_request"),
        Index("uq_page_handover_pending", "page_id", unique=True, postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    from_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    to_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    from_session_id: Mapped[str] = mapped_column(ForeignKey(AccountSession.id))
    source_version: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    decision_etag: Mapped[str | None] = mapped_column(String(70))
    status: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PublicPost(Base):
    __tablename__ = "public_posts"
    __table_args__ = (
        CheckConstraint(
            "(status = 'draft' AND published_at IS NULL AND deleted_at IS NULL AND body IS NOT NULL) OR "
            "(status = 'published' AND published_at IS NOT NULL AND deleted_at IS NULL AND body IS NOT NULL) OR "
            "(status = 'deleted' AND deleted_at IS NOT NULL AND body IS NULL AND title IS NULL)",
            name="ck_public_post_state",
        ),
        CheckConstraint("version >= 1 AND like_count >= 0 AND comment_count >= 0", name="ck_public_post_counts"),
        UniqueConstraint("page_id", "author_id", "creation_key", name="uq_public_post_creation"),
        Index("ix_public_post_published", "status", "published_at", "id"),
        Index("ix_public_post_page", "page_id", "status", "published_at", "id"),
        Index("ix_public_post_pinned", "page_id", "pinned_at", postgresql_where=text("pinned_at IS NOT NULL")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    author_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    title: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer)
    like_count: Mapped[int] = mapped_column(Integer)
    comment_count: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Only published posts count as pinned; a stale time on another state is ignored, never shown.
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_public_posts_moderation_decision"),
    )


class PostTerm(Base):
    """A topic or interest the page owner gave one post (DEC-036). A post without any is about its page's subjects."""

    __tablename__ = "post_terms"
    __table_args__ = (
        ForeignKeyConstraint(["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_post_term_term"),
        CheckConstraint(f"dimension IN ({listed(POST_DIMENSIONS)})", name="ck_post_term_dimension"),
        CheckConstraint("position >= 0", name="ck_post_term_position"),
        Index("ix_post_term_lookup", "dimension", "code", "post_id"),
    )

    post_id: Mapped[str] = mapped_column(ForeignKey(PublicPost.id), primary_key=True)
    dimension: Mapped[str] = mapped_column(String(20), primary_key=True)
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    position: Mapped[int] = mapped_column(SmallInteger)


class PostComment(Base):
    __tablename__ = "public_post_comments"
    __table_args__ = (
        CheckConstraint("status IN ('visible', 'deleted', 'removed')", name="ck_public_comment_status"),
        CheckConstraint("(status = 'visible') = (body IS NOT NULL AND ended_at IS NULL)", name="ck_public_comment_body"),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="ck_public_comment_parent"),
        UniqueConstraint("post_id", "id", name="uq_public_comment_post"),
        UniqueConstraint("author_id", "creation_key", name="uq_public_comment_creation"),
        ForeignKeyConstraint(
            ["post_id", "parent_id"], ["public_post_comments.post_id", "public_post_comments.id"],
            name="fk_public_comment_same_post",
        ),
        Index("ix_public_comment_post_time", "post_id", "created_at", "id"),
        Index("ix_public_comment_author_time", "author_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey(PublicPost.id))
    parent_id: Mapped[str | None] = mapped_column(String(36))
    author_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_public_post_comments_moderation_decision"),
    )


class PostReaction(Base):
    __tablename__ = "public_post_reactions"
    __table_args__ = (CheckConstraint("kind = 'like'", name="ck_public_reaction_kind"),)

    post_id: Mapped[str] = mapped_column(ForeignKey(PublicPost.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SavedPost(Base):
    __tablename__ = "public_saved_posts"
    __table_args__ = (Index("ix_public_saved_account", "account_id", "created_at"),)

    post_id: Mapped[str] = mapped_column(ForeignKey(PublicPost.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


HELP_KINDS = ("request", "offer")
HELP_REPLY_STATES = ("active", "withdrawn", "removed")


class HelpPost(Base):
    """A request for help or an offer of help on a page that takes them (D3). Its replies stay private."""

    __tablename__ = "help_posts"
    __table_args__ = (
        ForeignKeyConstraint(["place_dimension", "place"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_help_post_place"),
        CheckConstraint(f"kind IN ({listed(HELP_KINDS)})", name="ck_help_post_kind"),
        CheckConstraint("place_dimension = 'place'", name="ck_help_post_place_dimension"),
        CheckConstraint(
            "(status IN ('open', 'pending') AND ended_at IS NULL AND title IS NOT NULL AND details IS NOT NULL) OR "
            "(status IN ('helped', 'closed') AND ended_at IS NOT NULL AND title IS NOT NULL AND details IS NOT NULL) OR "
            "(status = 'removed' AND ended_at IS NOT NULL AND title IS NOT NULL AND details IS NULL) OR "
            "(status = 'deleted' AND ended_at IS NOT NULL AND title IS NULL AND details IS NULL AND place IS NULL AND need_by IS NULL)",
            name="ck_help_post_state",
        ),
        CheckConstraint("helped_reply_id IS NULL OR status = 'helped'", name="ck_help_post_helped"),
        CheckConstraint("reply_count >= 0 AND version >= 1", name="ck_help_post_counts"),
        UniqueConstraint("author_id", "creation_key", name="uq_help_post_creation"),
        Index("ix_help_post_page", "page_id", "status", "created_at", "id"),
        Index("ix_help_post_author", "author_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    author_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    kind: Mapped[str] = mapped_column(String(8))
    title: Mapped[str | None] = mapped_column(String(120))
    details: Mapped[str | None] = mapped_column(Text)
    # An area from the shared places, never an address.
    place_dimension: Mapped[str] = mapped_column(String(20), default="place", server_default="place")
    place: Mapped[str | None] = mapped_column(String(64))
    need_by: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10))
    reply_count: Mapped[int] = mapped_column(Integer)
    helped_reply_id: Mapped[str | None] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HelpReply(Base):
    """One person's answer to a help post, seen only by them, the post's author and the page's owner and moderators."""

    __tablename__ = "help_replies"
    __table_args__ = (
        CheckConstraint(f"status IN ({listed(HELP_REPLY_STATES)})", name="ck_help_reply_status"),
        CheckConstraint("(status = 'active') = (body IS NOT NULL AND ended_at IS NULL)", name="ck_help_reply_body"),
        UniqueConstraint("author_id", "creation_key", name="uq_help_reply_creation"),
        Index("uq_help_reply_active", "post_id", "author_id", unique=True, postgresql_where=text("status = 'active'")),
        Index("ix_help_reply_post", "post_id", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey(HelpPost.id))
    author_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10))
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# A help post can be a scam, so that reason comes first; the rest match the platform's reasons.
HELP_REPORT_REASONS = ("scam", *REPORT_REASONS)
HELP_REPORT_OUTCOMES = ("removed", "kept", "deleted")


class HelpReport(Base):
    """A report of a help post. It goes to the page's owner and moderators, who remove the post or keep it."""

    __tablename__ = "help_reports"
    __table_args__ = (
        CheckConstraint(f"reason IN ({listed(HELP_REPORT_REASONS)})", name="ck_help_report_reason"),
        CheckConstraint(
            "(status = 'received' AND outcome IS NULL AND closed_at IS NULL) OR "
            f"(status = 'closed' AND outcome IN ({listed(HELP_REPORT_OUTCOMES)}) AND closed_at IS NOT NULL)",
            name="ck_help_report_state",
        ),
        Index("uq_help_report_open", "post_id", "reporter_id", unique=True, postgresql_where=text("status = 'received'")),
        Index("ix_help_report_post", "post_id", "status"),
        Index("ix_help_report_reporter", "reporter_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey(HelpPost.id))
    reporter_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    reason: Mapped[str] = mapped_column(String(24))
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10))
    outcome: Mapped[str | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


PAGE_EVENT_STATES = ("scheduled", "cancelled", "deleted")


class PageEvent(Base):
    """An event a public page publishes (D4). Going is intent, not proof of attendance; who is going stays with the managers."""

    __tablename__ = "page_events"
    __table_args__ = (
        CheckConstraint(f"status IN ({listed(PAGE_EVENT_STATES)})", name="ck_page_event_status"),
        CheckConstraint("(status = 'deleted') = (title IS NULL)", name="ck_page_event_erased"),
        CheckConstraint("status <> 'cancelled' OR cancelled_at IS NOT NULL", name="ck_page_event_cancelled"),
        CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="ck_page_event_order"),
        CheckConstraint("capacity IS NULL OR capacity BETWEEN 1 AND 10000", name="ck_page_event_capacity"),
        CheckConstraint("going_count >= 0 AND version >= 1", name="ck_page_event_counts"),
        UniqueConstraint("created_by", "creation_key", name="uq_page_event_creation"),
        Index("ix_page_event_page", "page_id", "status", "starts_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str] = mapped_column(ForeignKey(PublicPage.id))
    created_by: Mapped[str] = mapped_column(ForeignKey(User.id))
    title: Mapped[str | None] = mapped_column(String(120))
    details: Mapped[str | None] = mapped_column(Text)
    # The exact place; shown only to people going and the page's managers unless the page makes it public.
    venue: Mapped[str | None] = mapped_column(String(200))
    venue_public: Mapped[bool] = mapped_column(Boolean)
    timezone: Mapped[str] = mapped_column(String(64))
    local_start: Mapped[str] = mapped_column(String(16))
    local_end: Mapped[str | None] = mapped_column(String(16))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    capacity: Mapped[int | None] = mapped_column(Integer)
    going_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))
    version: Mapped[int] = mapped_column(Integer)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    schedule_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PageEventResponse(Base):
    __tablename__ = "page_event_responses"
    __table_args__ = (Index("ix_page_event_response_account", "account_id", "created_at"),)

    event_id: Mapped[str] = mapped_column(ForeignKey(PageEvent.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ContentReport(Base):
    __tablename__ = "content_reports"
    __table_args__ = (
        CheckConstraint("target_type IN ('page', 'post', 'comment')", name="ck_content_report_target"),
        CheckConstraint(f"reason IN ({listed(REPORT_REASONS)})", name="ck_content_report_reason"),
        CheckConstraint("status IN ('received', 'reviewing', 'closed')", name="ck_content_report_status"),
        Index(
            "uq_content_report_open", "reporter_id", "target_type", "target_id",
            unique=True, postgresql_where=text("status = 'received'"),
        ),
        Index("ix_content_report_queue", "status", "created_at"),
        Index("ix_content_report_reporter", "reporter_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reporter_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(24))
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decision_id: Mapped[str | None] = mapped_column(
        ForeignKey("moderation_decisions.id", name="fk_content_report_decision"),
    )


class AccountBlock(Base):
    __tablename__ = "account_blocks"
    __table_args__ = (
        CheckConstraint("target_type IN ('page', 'account')", name="ck_account_block_target"),
        CheckConstraint("target_type <> 'account' OR target_id <> blocker_id", name="ck_account_block_self"),
        UniqueConstraint("blocker_id", "target_type", "target_id", name="uq_account_block"),
        Index("ix_account_block_target", "target_type", "target_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    blocker_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


FEED_CONTROL_KINDS = ("mute_page", "mute_term", "hide_post", "hide_suggestion")


class FeedControl(Base):
    """A private choice about what one person's lists show (DEC-037). Nobody else, the page owner included, is told."""

    __tablename__ = "feed_controls"
    __table_args__ = (
        ForeignKeyConstraint(
            ["term_dimension", "term_code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_feed_control_term",
        ),
        CheckConstraint(f"kind IN ({listed(FEED_CONTROL_KINDS)})", name="ck_feed_control_kind"),
        CheckConstraint(
            "(kind IN ('mute_page', 'hide_suggestion') AND page_id IS NOT NULL AND post_id IS NULL AND term_code IS NULL "
            "AND term_dimension IS NULL) OR "
            "(kind = 'hide_post' AND post_id IS NOT NULL AND page_id IS NULL AND term_code IS NULL AND term_dimension IS NULL) OR "
            "(kind = 'mute_term' AND term_dimension IS NOT NULL AND term_dimension IN ('topic', 'interest') "
            "AND term_code IS NOT NULL AND page_id IS NULL AND post_id IS NULL)",
            name="ck_feed_control_target",
        ),
        Index("uq_feed_control_page", "account_id", "kind", "page_id", unique=True, postgresql_where=text("page_id IS NOT NULL")),
        Index("uq_feed_control_post", "account_id", "post_id", unique=True, postgresql_where=text("post_id IS NOT NULL")),
        Index(
            "uq_feed_control_term", "account_id", "term_dimension", "term_code", unique=True,
            postgresql_where=text("term_code IS NOT NULL"),
        ),
        Index("ix_feed_control_account", "account_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    kind: Mapped[str] = mapped_column(String(20))
    page_id: Mapped[str | None] = mapped_column(ForeignKey(PublicPage.id))
    post_id: Mapped[str | None] = mapped_column(ForeignKey(PublicPost.id))
    term_dimension: Mapped[str | None] = mapped_column(String(20))
    term_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CommunityAuditEvent(Base):
    __tablename__ = "community_audit_events"
    __table_args__ = (Index("ix_community_audit_page", "page_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    page_id: Mapped[str | None] = mapped_column(ForeignKey(PublicPage.id))
    target_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
