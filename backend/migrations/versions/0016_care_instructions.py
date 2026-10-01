from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("care_instructions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("confirmed_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("payload_cipher", sa.Text(), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("times", sa.JSON(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stopped_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('active', 'stopped')", name="ck_care_instruction_status"),
        sa.CheckConstraint("source IN ('prescriber', 'pharmacist', 'package_label', 'self')", name="ck_care_instruction_source"),
        sa.CheckConstraint("version > 0", name="ck_care_instruction_version"),
        sa.CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_care_instruction_dates"),
        sa.CheckConstraint(
            "(status = 'stopped' AND stopped_at IS NOT NULL) OR (status = 'active' AND stopped_at IS NULL)",
            name="ck_care_instruction_stop",
        ),
        sa.CheckConstraint("confirmed_by_id = account_id", name="ck_care_instruction_subject_confirmed"),
    )
    op.create_index("ix_care_instruction_account", "care_instructions", ["account_id", "status", "created_at", "id"])
    op.create_table("care_dose_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("instruction_id", sa.String(36), sa.ForeignKey("care_instructions.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reported_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("local_time", sa.String(5), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("outcome", sa.String(8), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("instruction_id", "local_date", "local_time", name="uq_care_report_occurrence"),
        sa.CheckConstraint("outcome IN ('taken', 'skipped')", name="ck_care_report_outcome"),
        sa.CheckConstraint("revision > 0", name="ck_care_report_revision"),
        sa.CheckConstraint("local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'", name="ck_care_report_time"),
        sa.CheckConstraint("reported_by_id = account_id", name="ck_care_report_self"),
    )
    op.create_table("care_audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("instruction_id", sa.String(36), sa.ForeignKey("care_instructions.id"), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_care_audit_events_account_id", "care_audit_events", ["account_id"])
    op.create_table("care_commands",
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("request_key", sa.String(36), primary_key=True),
        sa.Column("operation", sa.String(16), nullable=False),
        sa.Column("target_id", sa.String(36), sa.ForeignKey("care_instructions.id"), nullable=False),
        sa.Column("input_digest", sa.String(64), nullable=False),
        sa.Column("audit_id", sa.String(36), sa.ForeignKey("care_audit_events.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("operation IN ('create', 'stop', 'report')", name="ck_care_command_operation"),
    )


def downgrade():
    op.drop_table("care_commands")
    op.drop_table("care_audit_events")
    op.drop_table("care_dose_reports")
    op.drop_table("care_instructions")
