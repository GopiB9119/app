"""Quiet hours, backup people for reminders, event and dose alerts, and series replacement and moves.

Numbered 0021 because 0020 is reserved for the group Spaces work (T22), which follows this revision.
"""

from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0019"
branch_labels = None
depends_on = None

CLOCK_TIME = "'^([01][0-9]|2[0-3]):[0-5][0-9]$'"


def upgrade():
    op.create_table("alert_settings",
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("quiet_start", sa.String(5), nullable=True),
        sa.Column("quiet_end", sa.String(5), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("(quiet_start IS NULL) = (quiet_end IS NULL)", name="ck_alert_setting_quiet_pair"),
        sa.CheckConstraint(
            f"quiet_start IS NULL OR (quiet_start <> quiet_end AND quiet_start ~ {CLOCK_TIME} AND quiet_end ~ {CLOCK_TIME})",
            name="ck_alert_setting_quiet_time",
        ),
        sa.CheckConstraint("version > 0", name="ck_alert_setting_version"),
    )
    op.create_table("reminder_backups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column("space_id", sa.String(36), nullable=False),
        sa.Column("owner_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("owner_admission_id", sa.String(36), nullable=False),
        sa.Column("contact_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("contact_admission_id", sa.String(36), nullable=False),
        sa.Column("wait_minutes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("ended_by", sa.String(16), nullable=True),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.UniqueConstraint("owner_account_id", "request_key", name="uq_reminder_backup_request"),
        sa.ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_reminder_backup_task"),
        sa.CheckConstraint("owner_account_id <> contact_account_id", name="ck_reminder_backup_people"),
        sa.CheckConstraint("status IN ('pending', 'active', 'declined', 'cancelled', 'ended')", name="ck_reminder_backup_status"),
        sa.CheckConstraint("wait_minutes IN (15, 30, 60, 120)", name="ck_reminder_backup_wait"),
        sa.CheckConstraint("(status = 'pending') = (responded_at IS NULL)", name="ck_reminder_backup_response"),
        sa.CheckConstraint("(status IN ('cancelled', 'ended')) = (ended_by IS NOT NULL)", name="ck_reminder_backup_end"),
        sa.CheckConstraint("version > 0", name="ck_reminder_backup_version"),
    )
    op.create_index("ix_reminder_backup_owner", "reminder_backups", ["owner_account_id", "id"])
    op.create_index("ix_reminder_backup_contact", "reminder_backups", ["contact_account_id", "id"])
    op.create_index("uq_reminder_backup_open", "reminder_backups", ["task_id", "owner_account_id"], unique=True,
                    postgresql_where=sa.text("status IN ('pending', 'active')"))
    op.create_table("event_alerts",
        sa.Column("event_id", sa.String(36), sa.ForeignKey("space_events.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("minutes_before", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("minutes_before IN (10, 30, 60, 1440)", name="ck_event_alert_lead"),
    )
    op.create_index("ix_event_alert_account", "event_alerts", ["account_id"])
    op.create_table("care_dose_alerts",
        sa.Column("instruction_id", sa.String(36), sa.ForeignKey("care_instructions.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_care_dose_alert_account", "care_dose_alerts", ["account_id"])
    op.create_table("alert_dismissals",
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("kind", sa.String(8), primary_key=True),
        sa.Column("reference", sa.String(120), primary_key=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('backup', 'dose', 'event')", name="ck_alert_dismissal_kind"),
    )
    op.create_index("ix_alert_dismissal_time", "alert_dismissals", ["account_id", "dismissed_at"])
    # Existing series were never replaced, so the new link starts empty.
    op.add_column("reminder_series", sa.Column("replaced_by_id", sa.String(36), sa.ForeignKey("reminder_series.id"), nullable=True))
    op.create_check_constraint("ck_reminder_series_replacement", "reminder_series", "replaced_by_id IS NULL OR status = 'cancelled'")
    op.drop_constraint("ck_reminder_series_command_operation", "reminder_series_commands", type_="check")
    op.create_check_constraint(
        "ck_reminder_series_command_operation", "reminder_series_commands",
        "operation IN ('pause', 'resume', 'skip', 'cancel', 'replace', 'move')",
    )


def downgrade():
    retained = op.get_bind().scalar(sa.text(
        "SELECT (SELECT count(*) FROM alert_settings) + (SELECT count(*) FROM reminder_backups) "
        "+ (SELECT count(*) FROM event_alerts) + (SELECT count(*) FROM care_dose_alerts) "
        "+ (SELECT count(*) FROM reminder_series WHERE replaced_by_id IS NOT NULL) "
        "+ (SELECT count(*) FROM reminder_series_commands WHERE operation IN ('replace', 'move'))"
    ))
    if retained:
        raise RuntimeError("Alert settings, backup people, alerts or edited repeating reminders exist. Downgrading below 0021 would discard them.")
    op.drop_constraint("ck_reminder_series_command_operation", "reminder_series_commands", type_="check")
    op.create_check_constraint(
        "ck_reminder_series_command_operation", "reminder_series_commands",
        "operation IN ('pause', 'resume', 'skip', 'cancel')",
    )
    op.drop_constraint("ck_reminder_series_replacement", "reminder_series", type_="check")
    op.drop_column("reminder_series", "replaced_by_id")
    op.drop_index("ix_alert_dismissal_time", table_name="alert_dismissals")
    op.drop_table("alert_dismissals")
    op.drop_index("ix_care_dose_alert_account", table_name="care_dose_alerts")
    op.drop_table("care_dose_alerts")
    op.drop_index("ix_event_alert_account", table_name="event_alerts")
    op.drop_table("event_alerts")
    op.drop_index("uq_reminder_backup_open", table_name="reminder_backups")
    op.drop_index("ix_reminder_backup_contact", table_name="reminder_backups")
    op.drop_index("ix_reminder_backup_owner", table_name="reminder_backups")
    op.drop_table("reminder_backups")
    op.drop_table("alert_settings")
