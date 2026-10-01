"""Repeating reminder series, their occurrences, and snoozed follow-ups."""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("reminder_series",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("space_id", sa.String(36), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("notification_preferences.account_id"), nullable=False),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=False),
        sa.Column("preference_generation", sa.Integer(), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("frequency", sa.String(8), nullable=False),
        sa.Column("repeat_every", sa.Integer(), nullable=False),
        sa.Column("weekday_mask", sa.Integer(), nullable=False),
        sa.Column("local_time", sa.String(5), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("clock_change_policy", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(40), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("id", "account_id", name="uq_reminder_series_owner"),
        sa.UniqueConstraint("account_id", "request_key", name="uq_reminder_series_request"),
        sa.ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_series_task"),
        sa.CheckConstraint("status IN ('active', 'paused', 'cancelled', 'ended', 'suppressed')", name="ck_reminder_series_status"),
        sa.CheckConstraint("(status IN ('paused', 'suppressed')) = (reason IS NOT NULL)", name="ck_reminder_series_reason"),
        sa.CheckConstraint(
            "(frequency = 'daily' AND repeat_every BETWEEN 1 AND 30 AND weekday_mask = 0) OR "
            "(frequency = 'weekly' AND repeat_every BETWEEN 1 AND 4 AND weekday_mask BETWEEN 1 AND 127)",
            name="ck_reminder_series_rule",
        ),
        sa.CheckConstraint("clock_change_policy IN ('shift_forward', 'skip')", name="ck_reminder_series_clock_policy"),
        sa.CheckConstraint("local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'", name="ck_reminder_series_time"),
        sa.CheckConstraint("end_date >= start_date AND end_date - start_date <= 365", name="ck_reminder_series_span"),
        sa.CheckConstraint("source_version > 0 AND preference_generation > 0 AND version > 0", name="ck_reminder_series_versions"),
    )
    op.create_index("ix_reminder_series_account", "reminder_series", ["account_id", "id"])
    op.create_index("uq_reminder_series_open_task", "reminder_series", ["task_id", "account_id"], unique=True,
                    postgresql_where=sa.text("status IN ('active', 'paused')"))
    op.create_table("reminder_series_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("series_id", sa.String(36), sa.ForeignKey("reminder_series.id"), nullable=False),
        sa.Column("actor_kind", sa.String(16), nullable=False),
        sa.Column("actor_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(actor_kind = 'user' AND actor_account_id IS NOT NULL) OR "
            "(actor_kind = 'scheduler' AND actor_account_id IS NULL)",
            name="ck_reminder_series_event_actor",
        ),
    )
    op.create_index("ix_reminder_series_events_series_id", "reminder_series_events", ["series_id"])
    op.create_table("reminder_series_commands",
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("request_key", sa.String(36), primary_key=True),
        sa.Column("series_id", sa.String(36), sa.ForeignKey("reminder_series.id"), nullable=False),
        sa.Column("operation", sa.String(8), nullable=False),
        sa.Column("input_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("operation IN ('pause', 'resume', 'skip', 'cancel')", name="ck_reminder_series_command_operation"),
    )
    op.create_index("ix_reminder_series_command_series", "reminder_series_commands", ["series_id"])
    # Existing reminders are all plain one-time reminders, so every new column starts empty or zero.
    op.add_column("reminders", sa.Column("series_id", sa.String(36), nullable=True))
    op.add_column("reminders", sa.Column("occurrence_date", sa.Date(), nullable=True))
    op.add_column("reminders", sa.Column("follow_up_of", sa.String(36), nullable=True))
    op.add_column("reminders", sa.Column("snooze_count", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.create_foreign_key("fk_reminder_series_owner", "reminders", "reminder_series",
                          ["series_id", "account_id"], ["id", "account_id"])
    op.create_foreign_key("fk_reminder_follow_up", "reminders", "reminders", ["follow_up_of", "account_id"], ["id", "account_id"])
    op.create_unique_constraint("uq_reminder_series_occurrence", "reminders", ["series_id", "occurrence_date"])
    op.create_unique_constraint("uq_reminder_follow_up", "reminders", ["follow_up_of"])
    op.create_check_constraint(
        "ck_reminder_kind", "reminders",
        "snooze_count BETWEEN 0 AND 3 AND (follow_up_of IS NULL) = (snooze_count = 0) "
        "AND (occurrence_date IS NULL OR (series_id IS NOT NULL AND follow_up_of IS NULL)) "
        "AND (series_id IS NULL OR occurrence_date IS NOT NULL OR follow_up_of IS NOT NULL)",
    )
    # The one-pending-reminder rule now covers plain reminders only; series and follow-ups have their own limits.
    op.drop_index("uq_reminder_pending_task", table_name="reminders")
    op.create_index("uq_reminder_pending_task", "reminders", ["task_id", "account_id"], unique=True,
                    postgresql_where=sa.text("status = 'scheduled' AND series_id IS NULL AND follow_up_of IS NULL"))
    op.create_index("uq_reminder_series_pending", "reminders", ["series_id"], unique=True,
                    postgresql_where=sa.text("status = 'scheduled' AND follow_up_of IS NULL"))


def downgrade():
    retained = op.get_bind().scalar(sa.text(
        "SELECT (SELECT count(*) FROM reminder_series) "
        "+ (SELECT count(*) FROM reminders WHERE series_id IS NOT NULL OR follow_up_of IS NOT NULL)"
    ))
    if retained:
        raise RuntimeError("Repeating or snoozed reminders exist. Downgrading below 0019 would discard them.")
    op.drop_index("uq_reminder_series_pending", table_name="reminders")
    op.drop_index("uq_reminder_pending_task", table_name="reminders")
    op.create_index("uq_reminder_pending_task", "reminders", ["task_id", "account_id"], unique=True,
                    postgresql_where=sa.text("status = 'scheduled'"))
    op.drop_constraint("ck_reminder_kind", "reminders", type_="check")
    op.drop_constraint("uq_reminder_follow_up", "reminders", type_="unique")
    op.drop_constraint("uq_reminder_series_occurrence", "reminders", type_="unique")
    op.drop_constraint("fk_reminder_follow_up", "reminders", type_="foreignkey")
    op.drop_constraint("fk_reminder_series_owner", "reminders", type_="foreignkey")
    op.drop_column("reminders", "snooze_count")
    op.drop_column("reminders", "follow_up_of")
    op.drop_column("reminders", "occurrence_date")
    op.drop_column("reminders", "series_id")
    op.drop_index("ix_reminder_series_command_series", table_name="reminder_series_commands")
    op.drop_table("reminder_series_commands")
    op.drop_index("ix_reminder_series_events_series_id", table_name="reminder_series_events")
    op.drop_table("reminder_series_events")
    op.drop_index("uq_reminder_series_open_task", table_name="reminder_series")
    op.drop_index("ix_reminder_series_account", table_name="reminder_series")
    op.drop_table("reminder_series")
