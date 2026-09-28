"""Persist bounded reminder delivery retries without losing due work."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reminders", sa.Column("dispatch_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.add_column("reminders", sa.Column("next_attempt_at", sa.DateTime(timezone=True)))
    op.add_column("reminders", sa.Column("last_failure_at", sa.DateTime(timezone=True)))
    op.create_check_constraint("ck_reminder_dispatch_attempts", "reminders", "dispatch_attempts >= 0")
    op.drop_constraint("ck_reminder_status", "reminders", type_="check")
    op.create_check_constraint(
        "ck_reminder_status", "reminders",
        "status IN ('scheduled', 'available', 'cancelled', 'suppressed', 'expired', 'failed')",
    )


def downgrade():
    op.execute("UPDATE reminders SET status = 'suppressed' WHERE status = 'failed'")
    op.drop_constraint("ck_reminder_status", "reminders", type_="check")
    op.create_check_constraint("ck_reminder_status", "reminders", "status IN ('scheduled', 'available', 'cancelled', 'suppressed', 'expired')")
    op.drop_constraint("ck_reminder_dispatch_attempts", "reminders", type_="check")
    op.drop_column("reminders", "last_failure_at")
    op.drop_column("reminders", "next_attempt_at")
    op.drop_column("reminders", "dispatch_attempts")