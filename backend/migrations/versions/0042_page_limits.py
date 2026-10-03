"""Pages limited by a platform moderator (DEC-040, T135)."""

from alembic import op
import sqlalchemy as sa

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None

ACTIONS = "action IN ('no_action', 'hide', 'restore')"
ACTIONS_WITH_LIMIT = "action IN ('no_action', 'hide', 'limit', 'restore') AND (action <> 'limit' OR target_type = 'page')"


def upgrade():
    op.drop_constraint("ck_moderation_decision_action", "moderation_decisions", type_="check")
    op.create_check_constraint("ck_moderation_decision_action", "moderation_decisions", ACTIONS_WITH_LIMIT)
    op.add_column("public_pages", sa.Column("moderation_limited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("public_pages", sa.Column("moderation_limit_decision_id", sa.String(36), nullable=True))
    op.create_foreign_key(
        "fk_public_pages_moderation_limit", "public_pages", "moderation_decisions", ["moderation_limit_decision_id"], ["id"],
    )
    op.create_check_constraint(
        "ck_public_page_moderation_limit", "public_pages", "(moderation_limited_at IS NULL) = (moderation_limit_decision_id IS NULL)",
    )


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM moderation_decisions WHERE action = 'limit'")).scalar():
        raise RuntimeError("Downgrading below 0042 would lose the record of pages moderators limited.")
    op.drop_constraint("ck_public_page_moderation_limit", "public_pages", type_="check")
    op.drop_constraint("fk_public_pages_moderation_limit", "public_pages", type_="foreignkey")
    op.drop_column("public_pages", "moderation_limit_decision_id")
    op.drop_column("public_pages", "moderation_limited_at")
    op.drop_constraint("ck_moderation_decision_action", "moderation_decisions", type_="check")
    op.create_check_constraint("ck_moderation_decision_action", "moderation_decisions", ACTIONS)
