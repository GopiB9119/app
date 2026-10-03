"""Event budgets in exact money, with no payments (DEC-039)."""

from alembic import op
import sqlalchemy as sa

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None

CURRENCIES = "'INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'"
LIMIT = 100_000_000_000


def upgrade():
    op.create_table(
        "event_budgets",
        sa.Column("event_id", sa.String(36), sa.ForeignKey("space_events.id"), primary_key=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"currency IN ({CURRENCIES})", name="ck_event_budget_currency"),
        sa.CheckConstraint("version > 0", name="ck_event_budget_version"),
    )
    op.create_table(
        "event_budget_categories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_id", sa.String(36), sa.ForeignKey("event_budgets.event_id"), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("estimate_minor", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(btrim(name)) BETWEEN 1 AND 60", name="ck_event_budget_category_name"),
        sa.CheckConstraint(f"estimate_minor BETWEEN 0 AND {LIMIT}", name="ck_event_budget_category_estimate"),
        sa.CheckConstraint("position >= 0", name="ck_event_budget_category_position"),
        sa.UniqueConstraint("event_id", "id", name="uq_event_budget_category_event"),
    )
    op.create_table(
        "event_expenses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_id", sa.String(36), sa.ForeignKey("event_budgets.event_id"), nullable=False),
        sa.Column("category_id", sa.String(36), nullable=True),
        sa.Column("recorder_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("recorder_admission_id", sa.String(36), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.String(120), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id", "category_id"], ["event_budget_categories.event_id", "event_budget_categories.id"],
            name="fk_event_expense_category",
        ),
        sa.CheckConstraint(f"amount_minor BETWEEN 1 AND {LIMIT}", name="ck_event_expense_amount"),
        sa.CheckConstraint("length(note) <= 120", name="ck_event_expense_note"),
        sa.CheckConstraint("(recorder_id IS NULL) = (recorder_admission_id IS NULL)", name="ck_event_expense_recorder"),
        sa.UniqueConstraint("event_id", "recorder_id", "creation_key", name="uq_event_expense_creation"),
    )
    op.create_index("ix_event_expense_event", "event_expenses", ["event_id", "created_at", "id"])
    op.create_index("ix_event_expense_recorder", "event_expenses", ["recorder_id"])


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM event_budgets")):
        raise RuntimeError("Downgrading below 0041 would remove event budgets and the expenses people recorded.")
    op.drop_index("ix_event_expense_recorder", table_name="event_expenses")
    op.drop_index("ix_event_expense_event", table_name="event_expenses")
    op.drop_table("event_expenses")
    op.drop_table("event_budget_categories")
    op.drop_table("event_budgets")
