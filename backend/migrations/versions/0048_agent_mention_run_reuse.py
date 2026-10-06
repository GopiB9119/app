"""Allow indexed references from several chat messages to one agent run.

Message and reply identities remain unique. This schema change grants no approval authority: DEC-052 decisions
still use the requester's private endpoint, exact reviewed version and stable key, never ordinary yes/no chat text.
"""

from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("uq_conversation_agent_mention_agent_run", "conversation_agent_mentions", type_="unique")
    op.create_index("ix_conversation_agent_mention_agent_run", "conversation_agent_mentions", ["run_id"])


def downgrade():
    op.drop_index("ix_conversation_agent_mention_agent_run", table_name="conversation_agent_mentions")
    op.create_unique_constraint("uq_conversation_agent_mention_agent_run", "conversation_agent_mentions", ["run_id"])