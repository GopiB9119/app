"""Page rules and pinned posts."""

from alembic import op
import sqlalchemy as sa

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("public_pages", sa.Column("rules", sa.Text(), nullable=False, server_default=""))
    op.create_check_constraint("ck_public_page_rules", "public_pages", "char_length(rules) <= 2000")
    op.add_column("public_posts", sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_public_post_pinned", "public_posts", ["page_id", "pinned_at"], postgresql_where=sa.text("pinned_at IS NOT NULL"),
    )


def downgrade():
    connection = op.get_bind()
    kept = connection.scalar(sa.text(
        "SELECT (SELECT count(*) FROM public_pages WHERE rules <> '')"
        " + (SELECT count(*) FROM public_posts WHERE pinned_at IS NOT NULL AND status = 'published')"
    ))
    if kept:
        raise RuntimeError("Downgrading below 0029 would lose page rules or pinned posts; remove them first.")
    op.drop_index("ix_public_post_pinned", table_name="public_posts")
    op.drop_column("public_posts", "pinned_at")
    op.drop_constraint("ck_public_page_rules", "public_pages", type_="check")
    op.drop_column("public_pages", "rules")
