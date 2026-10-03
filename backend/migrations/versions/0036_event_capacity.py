"""Event capacity and waitlist order (DEC-032)."""

from alembic import op
import sqlalchemy as sa

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("space_events", sa.Column("capacity", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_space_event_capacity", "space_events", "capacity IS NULL OR capacity BETWEEN 1 AND 500")
    op.add_column("space_event_responses", sa.Column("going_since", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE space_event_responses SET going_since = updated_at WHERE response = 'going'")
    op.create_check_constraint(
        "ck_space_event_going_since", "space_event_responses", "(response = 'going') = (going_since IS NOT NULL)",
    )


def downgrade():
    connection = op.get_bind()
    limited = connection.scalar(sa.text("SELECT count(*) FROM space_events WHERE capacity IS NOT NULL"))
    if limited:
        raise RuntimeError("Downgrading below 0036 would remove the capacity organizers set for their events.")
    op.drop_constraint("ck_space_event_going_since", "space_event_responses", type_="check")
    op.drop_column("space_event_responses", "going_since")
    op.drop_constraint("ck_space_event_capacity", "space_events", type_="check")
    op.drop_column("space_events", "capacity")
