"""Reports of help requests and offers (D3). They go to the page's owner and moderators, not to the platform queue,
whose report targets the Android app reads strictly. A downgrade refuses while any report exists."""

import sqlalchemy as sa
from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None

REASONS = ("scam", "spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other")
OUTCOMES = ("removed", "kept", "deleted")


def listed(values):
    return ", ".join(f"'{value}'" for value in values)


def upgrade():
    op.create_table(
        "help_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("post_id", sa.String(36), sa.ForeignKey("help_posts.id"), nullable=False),
        sa.Column("reporter_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.String(24), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("outcome", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(f"reason IN ({listed(REASONS)})", name="ck_help_report_reason"),
        sa.CheckConstraint(
            "(status = 'received' AND outcome IS NULL AND closed_at IS NULL) OR "
            f"(status = 'closed' AND outcome IN ({listed(OUTCOMES)}) AND closed_at IS NOT NULL)",
            name="ck_help_report_state",
        ),
    )
    op.create_index(
        "uq_help_report_open", "help_reports", ["post_id", "reporter_id"], unique=True, postgresql_where=sa.text("status = 'received'"),
    )
    op.create_index("ix_help_report_post", "help_reports", ["post_id", "status"])
    op.create_index("ix_help_report_reporter", "help_reports", ["reporter_id", "created_at"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM help_reports")).scalar():
        raise RuntimeError("Downgrading below 0055 would lose reports of help posts; remove them first.")
    op.drop_table("help_reports")
