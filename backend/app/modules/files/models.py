from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.spaces.models import Space

MEDIA_TYPES = ("text/plain", "text/markdown", "text/csv")
# Fields that exist only while a document is active; deletion clears every one of them.
CONTENT_FIELDS = ("name", "media_type", "size_bytes", "line_count", "sha256", "content")


class SpaceDocument(Base):
    __tablename__ = "space_documents"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'deleted')", name="ck_space_document_status"),
        CheckConstraint(
            "status <> 'active' OR (name IS NOT NULL AND media_type IS NOT NULL AND size_bytes IS NOT NULL "
            "AND line_count IS NOT NULL AND sha256 IS NOT NULL AND content IS NOT NULL)",
            name="ck_space_document_content",
        ),
        CheckConstraint(
            "status <> 'deleted' OR (name IS NULL AND media_type IS NULL AND size_bytes IS NULL AND line_count IS NULL "
            "AND sha256 IS NULL AND content IS NULL)",
            name="ck_space_document_cleared",
        ),
        CheckConstraint(
            "(status = 'deleted') = (deleted_at IS NOT NULL AND deleted_by_id IS NOT NULL)",
            name="ck_space_document_deletion",
        ),
        CheckConstraint("media_type IN ('text/plain', 'text/markdown', 'text/csv')", name="ck_space_document_type"),
        CheckConstraint("size_bytes BETWEEN 1 AND 524288", name="ck_space_document_size"),
        CheckConstraint("line_count > 0", name="ck_space_document_lines"),
        CheckConstraint("length(btrim(name)) BETWEEN 1 AND 120", name="ck_space_document_name"),
        CheckConstraint("admissions_before >= 0", name="ck_space_document_admissions"),
        UniqueConstraint("space_id", "added_by_id", "creation_key", name="uq_space_document_creation"),
        ForeignKeyConstraint(
            ["space_id", "added_by_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_space_document_adder",
        ),
        Index("ix_space_document_list", "space_id", "status", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey(Space.id))
    added_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    added_by_admission_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(16), default="active")
    name: Mapped[str | None] = mapped_column(String(120))
    media_type: Mapped[str | None] = mapped_column(String(32))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    line_count: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))
    content: Mapped[str | None] = mapped_column(Text)
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    # Space admissions counted when the document was added; later admissions never see it (history boundary).
    admissions_before: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))


class SpaceDocumentChunk(Base):
    __tablename__ = "space_document_chunks"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_space_document_chunk_position"),
        CheckConstraint("start_line >= 1 AND end_line >= start_line", name="ck_space_document_chunk_lines"),
        CheckConstraint("start_offset >= 0 AND end_offset > start_offset", name="ck_space_document_chunk_offsets"),
        Index("ix_space_document_chunk_space", "space_id", "document_id"),
        Index("ix_space_document_chunk_search", "search_vector", postgresql_using="gin"),
    )

    document_id: Mapped[str] = mapped_column(ForeignKey(SpaceDocument.id), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey(Space.id))
    start_line: Mapped[int] = mapped_column(Integer)
    end_line: Mapped[int] = mapped_column(Integer)
    # Unicode code point offsets into the stored text; the end is exclusive.
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple'::regconfig, content)", persisted=True),
    )
