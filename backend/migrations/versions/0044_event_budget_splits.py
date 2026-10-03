"""Splitting an event's cost equally, by percentages or by set amounts (DEC-042, T174)."""

from alembic import op
import sqlalchemy as sa

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "event_budget_splits",
        sa.Column("event_id", sa.String(36), sa.ForeignKey("event_budgets.event_id"), primary_key=True),
        sa.Column("method", sa.String(12), nullable=False),
        sa.Column("base", sa.String(8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("method IN ('equal', 'percentages', 'amounts')", name="ck_event_budget_split_method"),
        sa.CheckConstraint("base IN ('planned', 'recorded')", name="ck_event_budget_split_base"),
    )
    op.create_table(
        "event_budget_split_people",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_id", sa.String(36), sa.ForeignKey("event_budget_splits.event_id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("admission_id", sa.String(36), nullable=True),
        sa.Column("value", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("position BETWEEN 0 AND 99", name="ck_event_budget_split_person_position"),
        sa.CheckConstraint("value IS NULL OR value >= 0", name="ck_event_budget_split_person_value"),
        sa.CheckConstraint("(account_id IS NULL) = (admission_id IS NULL)", name="ck_event_budget_split_person_account"),
        sa.UniqueConstraint("event_id", "position", name="uq_event_budget_split_person_position"),
        sa.UniqueConstraint("event_id", "account_id", name="uq_event_budget_split_person_account"),
    )
    op.create_index("ix_event_budget_split_person_account", "event_budget_split_people", ["account_id"])


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM event_budget_splits")):
        raise RuntimeError("Downgrading below 0044 would remove how event budgets are split.")
    op.drop_index("ix_event_budget_split_person_account", table_name="event_budget_split_people")
    op.drop_table("event_budget_split_people")
    op.drop_table("event_budget_splits")
