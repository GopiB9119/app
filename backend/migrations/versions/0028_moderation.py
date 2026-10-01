"""Public content moderation and author appeals."""

from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

REASONS = "'spam', 'harassment', 'hate', 'violence', 'sexual', 'misinformation', 'self_harm', 'privacy', 'other'"


def upgrade():
    op.create_table(
        "platform_moderators",
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("added_by", sa.Text(), nullable=False),
    )
    op.create_table(
        "moderation_decisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(24), nullable=False),
        sa.Column("moderator_note", sa.Text(), nullable=False),
        sa.Column("decided_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("appeal_of", sa.String(36), sa.ForeignKey("moderation_decisions.id"), nullable=True),
        sa.Column("creation_key", sa.String(36), nullable=True),
        sa.Column("creation_digest", sa.String(64), nullable=True),
        sa.CheckConstraint("target_type IN ('page', 'post', 'comment')", name="ck_moderation_decision_target"),
        sa.CheckConstraint("action IN ('no_action', 'hide', 'restore')", name="ck_moderation_decision_action"),
        sa.CheckConstraint(f"reason IN ({REASONS})", name="ck_moderation_decision_reason"),
        sa.CheckConstraint("char_length(moderator_note) <= 1000", name="ck_moderation_decision_note"),
        sa.UniqueConstraint("decided_by", "creation_key", name="uq_moderation_decision_creation"),
    )
    op.create_index("ix_moderation_decision_target", "moderation_decisions", ["target_type", "target_id", "decided_at"])
    op.create_table(
        "moderation_appeals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("decision_id", sa.String(36), sa.ForeignKey("moderation_decisions.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.CheckConstraint("status IN ('open', 'upheld', 'overturned')", name="ck_moderation_appeal_status"),
        sa.CheckConstraint("char_length(note) <= 1000", name="ck_moderation_appeal_note"),
        sa.CheckConstraint("char_length(resolution_note) <= 1000", name="ck_moderation_appeal_resolution_note"),
        sa.CheckConstraint(
            "(status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL) OR "
            "(status <> 'open' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)",
            name="ck_moderation_appeal_resolution",
        ),
        sa.UniqueConstraint("decision_id", name="uq_moderation_appeal_decision"),
        sa.UniqueConstraint("account_id", "creation_key", name="uq_moderation_appeal_creation"),
    )
    op.create_index("ix_moderation_appeal_status", "moderation_appeals", ["status", "created_at", "id"])
    for table in ("public_pages", "public_posts", "public_post_comments"):
        op.add_column(table, sa.Column("moderation_hidden_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("moderation_decision_id", sa.String(36), nullable=True))
        op.create_foreign_key(f"fk_{table}_moderation_decision", table, "moderation_decisions", ["moderation_decision_id"], ["id"])
    op.add_column("content_reports", sa.Column("decision_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_content_report_decision", "content_reports", "moderation_decisions", ["decision_id"], ["id"])


def downgrade():
    op.drop_constraint("fk_content_report_decision", "content_reports", type_="foreignkey")
    op.drop_column("content_reports", "decision_id")
    for table in ("public_post_comments", "public_posts", "public_pages"):
        op.drop_constraint(f"fk_{table}_moderation_decision", table, type_="foreignkey")
        op.drop_column(table, "moderation_decision_id")
        op.drop_column(table, "moderation_hidden_at")
    op.drop_table("moderation_appeals")
    op.drop_table("moderation_decisions")
    op.drop_table("platform_moderators")