"""Text documents in private Spaces, split into passages indexed for full-text search (DEC-015)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "space_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("added_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("added_by_admission_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("media_type", sa.String(32), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("line_count", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("admissions_before", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint("status IN ('active', 'deleted')", name="ck_space_document_status"),
        sa.CheckConstraint(
            "status <> 'active' OR (name IS NOT NULL AND media_type IS NOT NULL AND size_bytes IS NOT NULL "
            "AND line_count IS NOT NULL AND sha256 IS NOT NULL AND content IS NOT NULL)",
            name="ck_space_document_content",
        ),
        sa.CheckConstraint(
            "status <> 'deleted' OR (name IS NULL AND media_type IS NULL AND size_bytes IS NULL AND line_count IS NULL "
            "AND sha256 IS NULL AND content IS NULL)",
            name="ck_space_document_cleared",
        ),
        sa.CheckConstraint(
            "(status = 'deleted') = (deleted_at IS NOT NULL AND deleted_by_id IS NOT NULL)",
            name="ck_space_document_deletion",
        ),
        sa.CheckConstraint("media_type IN ('text/plain', 'text/markdown', 'text/csv')", name="ck_space_document_type"),
        sa.CheckConstraint("size_bytes BETWEEN 1 AND 524288", name="ck_space_document_size"),
        sa.CheckConstraint("line_count > 0", name="ck_space_document_lines"),
        sa.CheckConstraint("length(btrim(name)) BETWEEN 1 AND 120", name="ck_space_document_name"),
        sa.CheckConstraint("admissions_before >= 0", name="ck_space_document_admissions"),
        sa.UniqueConstraint("space_id", "added_by_id", "creation_key", name="uq_space_document_creation"),
        sa.ForeignKeyConstraint(
            ["space_id", "added_by_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_space_document_adder",
        ),
    )
    op.create_index("ix_space_document_list", "space_documents", ["space_id", "status", "created_at", "id"])
    op.create_table(
        "space_document_chunks",
        sa.Column("document_id", sa.String(36), sa.ForeignKey("space_documents.id"), primary_key=True),
        sa.Column("position", sa.Integer(), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("start_line", sa.Integer(), nullable=False),
        sa.Column("end_line", sa.Integer(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "search_vector", postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('simple'::regconfig, content)", persisted=True), nullable=False,
        ),
        sa.CheckConstraint("position >= 0", name="ck_space_document_chunk_position"),
        sa.CheckConstraint("start_line >= 1 AND end_line >= start_line", name="ck_space_document_chunk_lines"),
        sa.CheckConstraint("start_offset >= 0 AND end_offset > start_offset", name="ck_space_document_chunk_offsets"),
    )
    op.create_index("ix_space_document_chunk_space", "space_document_chunks", ["space_id", "document_id"])
    op.create_index("ix_space_document_chunk_search", "space_document_chunks", ["search_vector"], postgresql_using="gin")


def downgrade():
    op.drop_index("ix_space_document_chunk_search", table_name="space_document_chunks")
    op.drop_index("ix_space_document_chunk_space", table_name="space_document_chunks")
    op.drop_table("space_document_chunks")
    op.drop_index("ix_space_document_list", table_name="space_documents")
    op.drop_table("space_documents")
