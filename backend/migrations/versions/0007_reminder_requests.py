"""Recipient-approved proposals create personal reminders atomically."""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("reminder_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("space_id", sa.String(36), nullable=False),
        sa.Column("requested_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("requester_admission_id", sa.String(36), nullable=False),
        sa.Column("recipient_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipient_admission_id", sa.String(36), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("schedule_key", sa.String(36), nullable=False),
        sa.Column("local_time", sa.DateTime(timezone=False), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dispatch_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("reminder_id", sa.String(36), nullable=True),
        sa.UniqueConstraint("requested_by_id", "request_key", name="uq_reminder_proposal_request"),
        sa.UniqueConstraint("reminder_id", name="uq_reminder_proposal_schedule"),
        sa.ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_proposal_task"),
        sa.ForeignKeyConstraint(["reminder_id", "recipient_account_id"], ["reminders.id", "reminders.account_id"], name="fk_reminder_proposal_recipient"),
        sa.CheckConstraint("requested_by_id <> recipient_account_id", name="ck_reminder_proposal_other_recipient"),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'outdated')", name="ck_reminder_proposal_status"),
        sa.CheckConstraint("source_version > 0 AND version > 0", name="ck_reminder_proposal_versions"),
        sa.CheckConstraint("expires_at <= scheduled_at AND dispatch_expires_at > scheduled_at", name="ck_reminder_proposal_expiry"),
        sa.CheckConstraint("(status = 'accepted') = (reminder_id IS NOT NULL)", name="ck_reminder_proposal_schedule"),
        sa.CheckConstraint("(status = 'pending') = (resolved_at IS NULL)", name="ck_reminder_proposal_resolution"),
    )
    op.create_index("ix_reminder_proposal_recipient", "reminder_requests", ["recipient_account_id", "id"])
    op.create_index("ix_reminder_proposal_requester", "reminder_requests", ["requested_by_id", "id"])
    op.create_index("uq_reminder_proposal_pending", "reminder_requests", ["task_id", "recipient_account_id"], unique=True, postgresql_where=sa.text("status = 'pending'"))
    op.create_table("reminder_request_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("request_id", sa.String(36), sa.ForeignKey("reminder_requests.id"), nullable=False),
        sa.Column("actor_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_reminder_request_events_request_id", "reminder_request_events", ["request_id"])


def downgrade():
    op.drop_index("ix_reminder_request_events_request_id", table_name="reminder_request_events")
    op.drop_table("reminder_request_events")
    op.drop_index("uq_reminder_proposal_pending", table_name="reminder_requests")
    op.drop_index("ix_reminder_proposal_requester", table_name="reminder_requests")
    op.drop_index("ix_reminder_proposal_recipient", table_name="reminder_requests")
    op.drop_table("reminder_requests")