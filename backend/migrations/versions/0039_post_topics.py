"""Topics and interests on single posts (DEC-036, T129)."""

from alembic import op
import sqlalchemy as sa

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "post_terms",
        sa.Column("post_id", sa.String(36), sa.ForeignKey("public_posts.id"), primary_key=True),
        sa.Column("dimension", sa.String(20), primary_key=True),
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_post_term_term"),
        sa.CheckConstraint("dimension IN ('topic', 'interest')", name="ck_post_term_dimension"),
        sa.CheckConstraint("position >= 0", name="ck_post_term_position"),
    )
    op.create_index("ix_post_term_lookup", "post_terms", ["dimension", "code", "post_id"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM post_terms")).scalar():
        raise RuntimeError("Downgrading below 0039 would lose the topics given to posts; remove them first.")
    op.drop_index("ix_post_term_lookup", table_name="post_terms")
    op.drop_table("post_terms")
