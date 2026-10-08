"""Space agents can read authorized event budgets and propose reviewed split plans, never payments."""

from alembic import op

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE agent_instances SET definition_version = 6 WHERE definition_version = 5")


def downgrade():
    op.execute("UPDATE agent_instances SET definition_version = 5 WHERE definition_version = 6")