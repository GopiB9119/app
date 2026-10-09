"""Events on public pages (D4). A page's owner and moderators publish them; signed-in people say they are going.

The exact venue is shown only to people going and the page's managers unless the page makes it public, and the list
of who is going stays with the managers. A downgrade refuses while any page event exists."""

import sqlalchemy as sa
from alembic import op

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "page_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(120), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("venue", sa.String(200), nullable=True),
        sa.Column("venue_public", sa.Boolean(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("local_start", sa.String(16), nullable=False),
        sa.Column("local_end", sa.String(16), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("going_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("schedule_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('scheduled', 'cancelled', 'deleted')", name="ck_page_event_status"),
        sa.CheckConstraint("(status = 'deleted') = (title IS NULL)", name="ck_page_event_erased"),
        sa.CheckConstraint("status <> 'cancelled' OR cancelled_at IS NOT NULL", name="ck_page_event_cancelled"),
        sa.CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="ck_page_event_order"),
        sa.CheckConstraint("capacity IS NULL OR capacity BETWEEN 1 AND 10000", name="ck_page_event_capacity"),
        sa.CheckConstraint("going_count >= 0 AND version >= 1", name="ck_page_event_counts"),
        sa.UniqueConstraint("created_by", "creation_key", name="uq_page_event_creation"),
    )
    op.create_index("ix_page_event_page", "page_events", ["page_id", "status", "starts_at", "id"])
    op.create_table(
        "page_event_responses",
        sa.Column("event_id", sa.String(36), sa.ForeignKey("page_events.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_page_event_response_account", "page_event_responses", ["account_id", "created_at"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM page_events")).scalar():
        raise RuntimeError("Downgrading below 0056 would lose events that pages published; remove them first.")
    op.drop_table("page_event_responses")
    op.drop_table("page_events")
