"""Search reads the characters that join words as spaces, so numbers, dates, e-mail addresses and file names are found by their parts (DEC-051)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None

# A snapshot of app.modules.files.models.SEARCH_SEPARATORS when this migration was written.
SEPARATORS = "._/\\@:-+&<>,"
BLANKS = " " * len(SEPARATORS)


def replace_vector(expression):
    """The generated column cannot change its expression in place, so it is dropped and made again with its index."""
    op.drop_index("ix_space_document_chunk_search", table_name="space_document_chunks")
    op.drop_column("space_document_chunks", "search_vector")
    op.add_column(
        "space_document_chunks",
        sa.Column("search_vector", postgresql.TSVECTOR(), sa.Computed(expression, persisted=True), nullable=False),
    )
    op.create_index("ix_space_document_chunk_search", "space_document_chunks", ["search_vector"], postgresql_using="gin")


def upgrade():
    replace_vector(f"to_tsvector('simple'::regconfig, translate(content, '{SEPARATORS}', '{BLANKS}'))")


def downgrade():
    replace_vector("to_tsvector('simple'::regconfig, content)")
