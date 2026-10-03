"""Contributions people record for themselves in an event budget (DEC-041, T173)."""

from alembic import op
import sqlalchemy as sa

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None

LIMIT = 100_000_000_000


def upgrade():
    op.create_table(
        "event_contributions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_id", sa.String(36), sa.ForeignKey("event_budgets.event_id"), nullable=False),
        sa.Column("contributor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("contributor_admission_id", sa.String(36), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("state", sa.String(8), nullable=False),
        sa.Column("note", sa.String(120), nullable=True),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"amount_minor BETWEEN 1 AND {LIMIT}", name="ck_event_contribution_amount"),
        sa.CheckConstraint("state IN ('promised', 'given')", name="ck_event_contribution_state"),
        sa.CheckConstraint("note IS NULL OR length(btrim(note)) BETWEEN 1 AND 120", name="ck_event_contribution_note"),
        sa.CheckConstraint(
            "(contributor_id IS NULL) = (contributor_admission_id IS NULL)", name="ck_event_contribution_contributor",
        ),
        # A promise is removed with its account, so only what was given can outlive the person who recorded it.
        sa.CheckConstraint("contributor_id IS NOT NULL OR state = 'given'", name="ck_event_contribution_kept"),
        sa.UniqueConstraint("event_id", "contributor_id", "creation_key", name="uq_event_contribution_creation"),
    )
    op.create_index("ix_event_contribution_event", "event_contributions", ["event_id", "created_at", "id"])
    op.create_index("ix_event_contribution_contributor", "event_contributions", ["contributor_id"])


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM event_contributions")):
        raise RuntimeError("Downgrading below 0043 would remove the contributions people recorded in event budgets.")
    op.drop_index("ix_event_contribution_contributor", table_name="event_contributions")
    op.drop_index("ix_event_contribution_event", table_name="event_contributions")
    op.drop_table("event_contributions")
