"""Version 3 adds DEC-057's exact-reviewed public actions; existing run history stays unchanged."""

from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE agent_instances SET definition_version = 3 WHERE definition_version = 2")


def downgrade():
    op.execute("UPDATE agent_instances SET definition_version = 2 WHERE definition_version = 3")