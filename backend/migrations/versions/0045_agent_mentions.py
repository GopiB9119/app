"""Asking the agent from a chat message with @agent (DEC-046)."""

from alembic import op
import sqlalchemy as sa

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None

STATUSES = "'answered', 'private', 'waiting', 'pending', 'off', 'limited', 'too_long', 'failed'"
REPLIED = "'answered', 'private', 'waiting'"


def upgrade():
    op.create_table(
        "conversation_agent_mentions",
        sa.Column("message_id", sa.String(36), sa.ForeignKey("conversation_messages.id"), primary_key=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column("reply_message_id", sa.String(36), sa.ForeignKey("conversation_messages.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"status IN ({STATUSES})", name="ck_conversation_agent_mention_status"),
        sa.CheckConstraint(f"(status IN ({REPLIED})) = (reply_message_id IS NOT NULL)", name="ck_conversation_agent_mention_reply"),
        sa.CheckConstraint("reply_message_id IS NULL OR run_id IS NOT NULL", name="ck_conversation_agent_mention_run"),
        sa.UniqueConstraint("reply_message_id", name="uq_conversation_agent_mention_reply"),
        sa.UniqueConstraint("run_id", name="uq_conversation_agent_mention_agent_run"),
    )
    op.create_index("ix_conversation_agent_mention_account", "conversation_agent_mentions", ["account_id"])
    op.create_index("ix_conversation_agent_mention_conversation", "conversation_agent_mentions", ["conversation_id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM conversation_agent_mentions")):
        raise RuntimeError("Downgrading below 0045 would forget which chat messages are the agent's replies.")
    op.drop_index("ix_conversation_agent_mention_conversation", table_name="conversation_agent_mentions")
    op.drop_index("ix_conversation_agent_mention_account", table_name="conversation_agent_mentions")
    op.drop_table("conversation_agent_mentions")
