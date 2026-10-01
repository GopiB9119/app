"""Space events with timezone-aware schedules and attendance responses."""

from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "space_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("creator_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("creator_admission_id", sa.String(36), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("location", sa.String(200), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("local_start", sa.String(16), nullable=False),
        sa.Column("local_end", sa.String(16)),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("schedule_changed_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('scheduled', 'cancelled')", name="ck_space_event_status"),
        sa.CheckConstraint("(status = 'cancelled') = (cancelled_at IS NOT NULL)", name="ck_space_event_cancellation"),
        sa.CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="ck_space_event_range"),
        sa.CheckConstraint("(ends_at IS NULL) = (local_end IS NULL)", name="ck_space_event_end"),
        sa.CheckConstraint("length(btrim(title)) BETWEEN 1 AND 120", name="ck_space_event_title"),
        sa.CheckConstraint("version > 0", name="ck_space_event_version"),
        sa.UniqueConstraint("space_id", "creator_id", "creation_key", name="uq_space_event_creation"),
        sa.ForeignKeyConstraint(
            ["space_id", "creator_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_space_event_creator",
        ),
    )
    op.create_index("ix_space_event_schedule", "space_events", ["space_id", "starts_at", "id"])
    op.create_table(
        "space_event_responses",
        sa.Column("event_id", sa.String(36), sa.ForeignKey("space_events.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("response", sa.String(16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("response IN ('going', 'maybe', 'not_going')", name="ck_space_event_response"),
    )


def downgrade():
    op.drop_table("space_event_responses")
    op.drop_index("ix_space_event_schedule", table_name="space_events")
    op.drop_table("space_events")
