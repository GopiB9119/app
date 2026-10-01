"""Public pages, posts, comments, likes, saves, follows, reports and blocks."""

from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

TOPICS = "'community', 'education', 'health', 'local', 'family', 'events', 'hobbies', 'support', 'news', 'other'"
REASONS = "'spam', 'harassment', 'hate', 'violence', 'sexual', 'misinformation', 'self_harm', 'privacy', 'other'"


def timestamp(name, nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def upgrade():
    op.create_table(
        "public_pages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("handle", sa.String(30), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(20), nullable=False),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("follower_count", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        timestamp("created_at"),
        timestamp("updated_at"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_public_page_status"),
        sa.CheckConstraint(f"topic IN ({TOPICS})", name="ck_public_page_topic"),
        sa.CheckConstraint("handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'", name="ck_public_page_handle"),
        sa.CheckConstraint("follower_count >= 0 AND version >= 1", name="ck_public_page_counts"),
        sa.UniqueConstraint("handle", name="uq_public_page_handle"),
        sa.UniqueConstraint("owner_id", "creation_key", name="uq_public_page_creation"),
    )
    op.create_index("ix_public_page_owner", "public_pages", ["owner_id"])
    op.create_index("ix_public_page_popularity", "public_pages", ["follower_count", "id"])

    op.create_table(
        "public_page_follows",
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        timestamp("created_at"),
    )
    op.create_index("ix_public_follow_account", "public_page_follows", ["account_id", "created_at"])

    op.create_table(
        "public_posts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(120), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("like_count", sa.Integer(), nullable=False),
        sa.Column("comment_count", sa.Integer(), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        timestamp("created_at"),
        timestamp("updated_at"),
        timestamp("published_at", nullable=True),
        timestamp("edited_at", nullable=True),
        timestamp("deleted_at", nullable=True),
        sa.CheckConstraint(
            "(status = 'draft' AND published_at IS NULL AND deleted_at IS NULL AND body IS NOT NULL) OR "
            "(status = 'published' AND published_at IS NOT NULL AND deleted_at IS NULL AND body IS NOT NULL) OR "
            "(status = 'deleted' AND deleted_at IS NOT NULL AND body IS NULL AND title IS NULL)",
            name="ck_public_post_state",
        ),
        sa.CheckConstraint("version >= 1 AND like_count >= 0 AND comment_count >= 0", name="ck_public_post_counts"),
        sa.UniqueConstraint("page_id", "author_id", "creation_key", name="uq_public_post_creation"),
    )
    op.create_index("ix_public_post_published", "public_posts", ["status", "published_at", "id"])
    op.create_index("ix_public_post_page", "public_posts", ["page_id", "status", "published_at", "id"])

    op.create_table(
        "public_post_comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("post_id", sa.String(36), sa.ForeignKey("public_posts.id"), nullable=False),
        sa.Column("parent_id", sa.String(36), nullable=True),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        timestamp("created_at"),
        timestamp("ended_at", nullable=True),
        sa.CheckConstraint("status IN ('visible', 'deleted', 'removed')", name="ck_public_comment_status"),
        sa.CheckConstraint("(status = 'visible') = (body IS NOT NULL AND ended_at IS NULL)", name="ck_public_comment_body"),
        sa.CheckConstraint("parent_id IS NULL OR parent_id <> id", name="ck_public_comment_parent"),
        sa.UniqueConstraint("post_id", "id", name="uq_public_comment_post"),
        sa.UniqueConstraint("author_id", "creation_key", name="uq_public_comment_creation"),
        sa.ForeignKeyConstraint(
            ["post_id", "parent_id"], ["public_post_comments.post_id", "public_post_comments.id"],
            name="fk_public_comment_same_post",
        ),
    )
    op.create_index("ix_public_comment_post_time", "public_post_comments", ["post_id", "created_at", "id"])
    op.create_index("ix_public_comment_author_time", "public_post_comments", ["author_id", "created_at"])

    op.create_table(
        "public_post_reactions",
        sa.Column("post_id", sa.String(36), sa.ForeignKey("public_posts.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        timestamp("created_at"),
        sa.CheckConstraint("kind = 'like'", name="ck_public_reaction_kind"),
    )
    op.create_table(
        "public_saved_posts",
        sa.Column("post_id", sa.String(36), sa.ForeignKey("public_posts.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        timestamp("created_at"),
    )
    op.create_index("ix_public_saved_account", "public_saved_posts", ["account_id", "created_at"])

    op.create_table(
        "content_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reporter_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=False),
        sa.Column("reason", sa.String(24), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        timestamp("created_at"),
        sa.CheckConstraint("target_type IN ('page', 'post', 'comment')", name="ck_content_report_target"),
        sa.CheckConstraint(f"reason IN ({REASONS})", name="ck_content_report_reason"),
        sa.CheckConstraint("status IN ('received', 'reviewing', 'closed')", name="ck_content_report_status"),
    )
    op.create_index(
        "uq_content_report_open", "content_reports", ["reporter_id", "target_type", "target_id"],
        unique=True, postgresql_where=sa.text("status = 'received'"),
    )
    op.create_index("ix_content_report_queue", "content_reports", ["status", "created_at"])
    op.create_index("ix_content_report_reporter", "content_reports", ["reporter_id", "created_at"])

    op.create_table(
        "account_blocks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("blocker_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=False),
        timestamp("created_at"),
        sa.CheckConstraint("target_type IN ('page', 'account')", name="ck_account_block_target"),
        sa.CheckConstraint("target_type <> 'account' OR target_id <> blocker_id", name="ck_account_block_self"),
        sa.UniqueConstraint("blocker_id", "target_type", "target_id", name="uq_account_block"),
    )
    op.create_index("ix_account_block_target", "account_blocks", ["target_type", "target_id"])

    op.create_table(
        "community_audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), nullable=True),
        sa.Column("target_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        timestamp("created_at"),
    )
    op.create_index("ix_community_audit_page", "community_audit_events", ["page_id", "created_at"])


def downgrade():
    op.drop_index("ix_community_audit_page", table_name="community_audit_events")
    op.drop_table("community_audit_events")
    op.drop_index("ix_account_block_target", table_name="account_blocks")
    op.drop_table("account_blocks")
    for index in ("ix_content_report_reporter", "ix_content_report_queue", "uq_content_report_open"):
        op.drop_index(index, table_name="content_reports")
    op.drop_table("content_reports")
    op.drop_index("ix_public_saved_account", table_name="public_saved_posts")
    op.drop_table("public_saved_posts")
    op.drop_table("public_post_reactions")
    op.drop_index("ix_public_comment_author_time", table_name="public_post_comments")
    op.drop_index("ix_public_comment_post_time", table_name="public_post_comments")
    op.drop_table("public_post_comments")
    op.drop_index("ix_public_post_page", table_name="public_posts")
    op.drop_index("ix_public_post_published", table_name="public_posts")
    op.drop_table("public_posts")
    op.drop_index("ix_public_follow_account", table_name="public_page_follows")
    op.drop_table("public_page_follows")
    op.drop_index("ix_public_page_popularity", table_name="public_pages")
    op.drop_index("ix_public_page_owner", table_name="public_pages")
    op.drop_table("public_pages")
