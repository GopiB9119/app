"""Earlier dose answers kept when the person corrects one (DEC-030)."""

from alembic import op
import sqlalchemy as sa

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "care_dose_report_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id", sa.String(36), sa.ForeignKey("care_dose_reports.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("outcome", sa.String(8), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("replaced_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("report_id", "revision", name="uq_care_report_history_revision"),
        sa.CheckConstraint("outcome IN ('taken', 'skipped')", name="ck_care_report_history_outcome"),
        sa.CheckConstraint("revision > 0", name="ck_care_report_history_revision"),
        sa.CheckConstraint("replaced_at >= recorded_at", name="ck_care_report_history_order"),
    )


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM care_dose_report_history")):
        raise RuntimeError("Downgrading below 0035 would lose earlier dose answers that people corrected.")
    op.drop_table("care_dose_report_history")
