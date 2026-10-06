"""Two agents (DEC-060): the Main Agent on the Agent page has no Space, and each Space's agent answers in that Space only.

Runs and approvals of the Main Agent have no Space or admission, a memory may belong to the Space whose agent saved it
(earlier notes move to the Space they were saved in), and every Space agent moves to definition version 5 without public
community actions. A downgrade refuses while Main Agent requests exist, because the older schema cannot hold them."""

import sqlalchemy as sa
from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_runs", sa.Column("agent_kind", sa.String(8), nullable=False, server_default="space"))
    op.alter_column("agent_runs", "space_id", existing_type=sa.String(36), nullable=True)
    op.alter_column("agent_runs", "admission_id", existing_type=sa.String(36), nullable=True)
    op.create_check_constraint(
        "ck_agent_run_kind", "agent_runs",
        "(agent_kind = 'main' AND space_id IS NULL AND admission_id IS NULL AND agent_instance_id IS NULL)"
        " OR (agent_kind = 'space' AND space_id IS NOT NULL AND admission_id IS NOT NULL)",
    )
    op.alter_column("agent_approvals", "space_id", existing_type=sa.String(36), nullable=True)
    op.alter_column("agent_approvals", "admission_id", existing_type=sa.String(36), nullable=True)
    op.create_check_constraint("ck_agent_approval_scope", "agent_approvals", "(space_id IS NULL) = (admission_id IS NULL)")
    op.add_column("agent_memories", sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=True))
    op.create_index("ix_agent_memory_space", "agent_memories", ["account_id", "space_id"])
    op.execute(
        "UPDATE agent_memories SET space_id = agent_runs.space_id FROM agent_runs"
        " WHERE agent_memories.source_run_id = agent_runs.id AND agent_memories.kind = 'note'"
    )
    op.execute("UPDATE agent_instances SET definition_version = 5 WHERE definition_version = 4")


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM agent_runs WHERE agent_kind = 'main'")):
        raise RuntimeError("Downgrading below 0053 would lose Main Agent requests; remove them first.")
    op.execute("UPDATE agent_instances SET definition_version = 4 WHERE definition_version = 5")
    op.drop_index("ix_agent_memory_space", table_name="agent_memories")
    op.drop_column("agent_memories", "space_id")
    op.drop_constraint("ck_agent_approval_scope", "agent_approvals", type_="check")
    op.alter_column("agent_approvals", "admission_id", existing_type=sa.String(36), nullable=False)
    op.alter_column("agent_approvals", "space_id", existing_type=sa.String(36), nullable=False)
    op.drop_constraint("ck_agent_run_kind", "agent_runs", type_="check")
    op.alter_column("agent_runs", "admission_id", existing_type=sa.String(36), nullable=False)
    op.alter_column("agent_runs", "space_id", existing_type=sa.String(36), nullable=False)
    op.drop_column("agent_runs", "agent_kind")
