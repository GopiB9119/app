"""Owner-reviewed memory edits and disabled retrieval, with durable retry receipts."""

import sqlalchemy as sa
from alembic import op

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_memories", sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("agent_memories", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.create_check_constraint("ck_agent_memory_version", "agent_memories", "version > 0")
    op.create_table(
        "agent_memory_commands",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("memory_id", sa.String(36), sa.ForeignKey("agent_memories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("memory_id", "request_key", name="uq_agent_memory_command_request"),
    )


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM agent_memories WHERE enabled = false")):
        raise RuntimeError("Downgrading below 0059 would re-enable disabled memories; review or delete them first.")
    if connection.scalar(sa.text("SELECT count(*) FROM agent_memory_commands")):
        raise RuntimeError("Downgrading below 0059 would lose memory change receipts; delete those memories first.")
    op.drop_table("agent_memory_commands")
    op.drop_constraint("ck_agent_memory_version", "agent_memories", type_="check")
    op.drop_column("agent_memories", "version")
    op.drop_column("agent_memories", "enabled")