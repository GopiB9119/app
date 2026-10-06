"""Help requests and offers on public pages (D3, docs/COMMUNITY_AGENT_PLAN.md 7.5).

A page owner chooses whether followers may post a request for help or an offer of help. Replies are private to the
replier, the post's author and the page's owner and moderators. A downgrade refuses while any help post exists."""

import sqlalchemy as sa
from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None

STATE_RULE = (
    "(status = 'open' AND ended_at IS NULL AND title IS NOT NULL AND details IS NOT NULL) OR "
    "(status IN ('helped', 'closed') AND ended_at IS NOT NULL AND title IS NOT NULL AND details IS NOT NULL) OR "
    "(status = 'removed' AND ended_at IS NOT NULL AND title IS NOT NULL AND details IS NULL) OR "
    "(status = 'deleted' AND ended_at IS NOT NULL AND title IS NULL AND details IS NULL AND place IS NULL AND need_by IS NULL)"
)


def upgrade():
    op.add_column("public_pages", sa.Column("help_open", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_table(
        "help_posts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("title", sa.String(120), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("place_dimension", sa.String(20), nullable=False, server_default="place"),
        sa.Column("place", sa.String(64), nullable=True),
        sa.Column("need_by", sa.Date(), nullable=True),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("reply_count", sa.Integer(), nullable=False),
        sa.Column("helped_reply_id", sa.String(36), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["place_dimension", "place"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_help_post_place"),
        sa.CheckConstraint("kind IN ('request', 'offer')", name="ck_help_post_kind"),
        sa.CheckConstraint("place_dimension = 'place'", name="ck_help_post_place_dimension"),
        sa.CheckConstraint(STATE_RULE, name="ck_help_post_state"),
        sa.CheckConstraint("helped_reply_id IS NULL OR status = 'helped'", name="ck_help_post_helped"),
        sa.CheckConstraint("reply_count >= 0 AND version >= 1", name="ck_help_post_counts"),
        sa.UniqueConstraint("author_id", "creation_key", name="uq_help_post_creation"),
    )
    op.create_index("ix_help_post_page", "help_posts", ["page_id", "status", "created_at", "id"])
    op.create_index("ix_help_post_author", "help_posts", ["author_id", "created_at"])
    op.create_table(
        "help_replies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("post_id", sa.String(36), sa.ForeignKey("help_posts.id"), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('active', 'withdrawn', 'removed')", name="ck_help_reply_status"),
        sa.CheckConstraint("(status = 'active') = (body IS NOT NULL AND ended_at IS NULL)", name="ck_help_reply_body"),
        sa.UniqueConstraint("author_id", "creation_key", name="uq_help_reply_creation"),
    )
    op.create_index(
        "uq_help_reply_active", "help_replies", ["post_id", "author_id"], unique=True, postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index("ix_help_reply_post", "help_replies", ["post_id", "created_at", "id"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM help_posts")).scalar():
        raise RuntimeError("Downgrading below 0054 would lose people's help requests and offers; remove them first.")
    op.drop_table("help_replies")
    op.drop_table("help_posts")
    op.drop_column("public_pages", "help_open")
