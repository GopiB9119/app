"""Per-Space setting: the owner can turn the agent off in a Space (DEC-028)."""

from alembic import op
import sqlalchemy as sa

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("agent_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade():
    connection = op.get_bind()
    off = connection.scalar(sa.text("SELECT count(*) FROM spaces WHERE NOT agent_enabled"))
    if off:
        raise RuntimeError("Downgrading below 0033 would turn the agent back on in Spaces whose owner turned it off.")
    op.drop_column("spaces", "agent_enabled")
