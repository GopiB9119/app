"""Private feed controls: muted pages and topics, and posts and suggestions marked Not interested (DEC-037, T136)."""

from alembic import op
import sqlalchemy as sa

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None

TARGET_RULE = (
    "(kind IN ('mute_page', 'hide_suggestion') AND page_id IS NOT NULL AND post_id IS NULL AND term_code IS NULL "
    "AND term_dimension IS NULL) OR "
    "(kind = 'hide_post' AND post_id IS NOT NULL AND page_id IS NULL AND term_code IS NULL AND term_dimension IS NULL) OR "
    "(kind = 'mute_term' AND term_dimension IS NOT NULL AND term_dimension IN ('topic', 'interest') "
    "AND term_code IS NOT NULL AND page_id IS NULL AND post_id IS NULL)"
)


def upgrade():
    op.create_table(
        "feed_controls",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), nullable=True),
        sa.Column("post_id", sa.String(36), sa.ForeignKey("public_posts.id"), nullable=True),
        sa.Column("term_dimension", sa.String(20), nullable=True),
        sa.Column("term_code", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["term_dimension", "term_code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_feed_control_term",
        ),
        sa.CheckConstraint("kind IN ('mute_page', 'mute_term', 'hide_post', 'hide_suggestion')", name="ck_feed_control_kind"),
        sa.CheckConstraint(TARGET_RULE, name="ck_feed_control_target"),
    )
    op.create_index(
        "uq_feed_control_page", "feed_controls", ["account_id", "kind", "page_id"], unique=True,
        postgresql_where=sa.text("page_id IS NOT NULL"),
    )
    op.create_index(
        "uq_feed_control_post", "feed_controls", ["account_id", "post_id"], unique=True,
        postgresql_where=sa.text("post_id IS NOT NULL"),
    )
    op.create_index(
        "uq_feed_control_term", "feed_controls", ["account_id", "term_dimension", "term_code"], unique=True,
        postgresql_where=sa.text("term_code IS NOT NULL"),
    )
    op.create_index("ix_feed_control_account", "feed_controls", ["account_id", "created_at"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM feed_controls")).scalar():
        raise RuntimeError("Downgrading below 0040 would lose people's muted pages and topics; remove them first.")
    op.drop_table("feed_controls")
