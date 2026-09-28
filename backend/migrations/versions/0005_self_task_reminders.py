"""One-time self-reminders and durable in-app inbox."""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("notification_preferences",
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("in_app_reminders_enabled", sa.Boolean(), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.CheckConstraint("generation > 0", name="ck_notification_preference_generation"),
    )
    op.create_table("reminders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("space_id", sa.String(36), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("notification_preferences.account_id"), nullable=False),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=False),
        sa.Column("preference_generation", sa.Integer(), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("local_time", sa.DateTime(timezone=False), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(40), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("id", "account_id", name="uq_reminder_recipient"),
        sa.UniqueConstraint("account_id", "request_key", name="uq_reminder_request"),
        sa.ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_task_scope"),
        sa.CheckConstraint("status IN ('scheduled', 'available', 'cancelled', 'suppressed', 'expired')", name="ck_reminder_status"),
        sa.CheckConstraint("source_version > 0 AND preference_generation > 0 AND version > 0", name="ck_reminder_versions"),
        sa.CheckConstraint("expires_at > scheduled_at", name="ck_reminder_expiry"),
        sa.CheckConstraint("acknowledged_at IS NULL OR status = 'available'", name="ck_reminder_acknowledgment"),
    )
    op.create_index("ix_reminder_due", "reminders", ["status", "scheduled_at", "id"])
    op.create_index("ix_reminder_account", "reminders", ["account_id", "id"])
    op.create_index("uq_reminder_pending_task", "reminders", ["task_id", "account_id"], unique=True, postgresql_where=sa.text("status = 'scheduled'"))
    op.create_table("in_app_notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reminder_id", sa.String(36), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("reminder_id", name="uq_notification_reminder"),
        sa.ForeignKeyConstraint(["reminder_id", "account_id"], ["reminders.id", "reminders.account_id"], name="fk_notification_recipient"),
    )
    op.create_index("ix_in_app_notification_account", "in_app_notifications", ["account_id", "id"])
    op.create_table("reminder_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reminder_id", sa.String(36), sa.ForeignKey("reminders.id"), nullable=False),
        sa.Column("actor_kind", sa.String(16), nullable=False),
        sa.Column("actor_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("(actor_kind = 'user' AND actor_account_id IS NOT NULL) OR (actor_kind = 'scheduler' AND actor_account_id IS NULL)", name="ck_reminder_event_actor"),
    )
    op.create_index("ix_reminder_events_reminder_id", "reminder_events", ["reminder_id"])


def downgrade():
    op.drop_index("ix_reminder_events_reminder_id", table_name="reminder_events")
    op.drop_table("reminder_events")
    op.drop_index("ix_in_app_notification_account", table_name="in_app_notifications")
    op.drop_table("in_app_notifications")
    op.drop_index("uq_reminder_pending_task", table_name="reminders")
    op.drop_index("ix_reminder_account", table_name="reminders")
    op.drop_index("ix_reminder_due", table_name="reminders")
    op.drop_table("reminders")
    op.drop_table("notification_preferences")