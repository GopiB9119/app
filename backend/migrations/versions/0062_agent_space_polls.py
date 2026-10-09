"""Space agents can read polls and prepare explicitly reviewed poll creation, never cast votes."""

from alembic import op

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE agent_instances SET definition_version = 7 WHERE definition_version = 6")


def downgrade():
    op.execute("UPDATE agent_instances SET definition_version = 6 WHERE definition_version = 7")