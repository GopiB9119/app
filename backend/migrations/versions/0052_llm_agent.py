"""The LLM agent (DEC-059): a run may propose several changes one after another, chat messages may be longer, and every
Space agent moves to definition version 4 with the new tool list. Existing runs and approvals are kept unchanged."""

from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("uq_agent_approval_run", "agent_approvals", type_="unique")
    op.create_index("ix_agent_approvals_run", "agent_approvals", ["run_id", "created_at"])
    op.drop_constraint("ck_agent_run_message", "agent_runs", type_="check")
    op.create_check_constraint("ck_agent_run_message", "agent_runs", "length(message) BETWEEN 1 AND 2000")
    op.execute("UPDATE agent_instances SET definition_version = 4 WHERE definition_version = 3")


def downgrade():
    op.execute("UPDATE agent_instances SET definition_version = 3 WHERE definition_version = 4")
    op.drop_constraint("ck_agent_run_message", "agent_runs", type_="check")
    op.create_check_constraint("ck_agent_run_message", "agent_runs", "length(message) BETWEEN 1 AND 500")
    op.drop_index("ix_agent_approvals_run", table_name="agent_approvals")
    op.create_unique_constraint("uq_agent_approval_run", "agent_approvals", ["run_id"])
