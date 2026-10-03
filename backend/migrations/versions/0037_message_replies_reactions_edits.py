"""Chat replies, reactions and edits (DEC-033)."""

from alembic import op
import sqlalchemy as sa

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None

REACTIONS = "'like', 'love', 'laugh', 'wow', 'sad', 'thanks'"


def upgrade():
    op.add_column("conversation_messages", sa.Column("reply_to_id", sa.String(36), nullable=True))
    op.create_foreign_key(
        "fk_conversation_message_reply", "conversation_messages", "conversation_messages", ["reply_to_id"], ["id"],
    )
    op.create_check_constraint("ck_conversation_message_reply", "conversation_messages", "reply_to_id IS NULL OR reply_to_id <> id")
    op.add_column("conversation_messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("conversation_messages", sa.Column("edit_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("conversation_messages", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.create_check_constraint(
        "ck_conversation_message_edits", "conversation_messages",
        "edit_count BETWEEN 0 AND 10 AND (edited_at IS NULL) = (edit_count = 0)",
    )
    op.create_check_constraint("ck_conversation_message_revision", "conversation_messages", "revision >= 1")
    op.create_table(
        "conversation_message_reactions",
        sa.Column("message_id", sa.String(36), sa.ForeignKey("conversation_messages.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("reaction", sa.String(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"reaction IN ({REACTIONS})", name="ck_conversation_message_reaction"),
    )
    op.create_index("ix_conversation_message_reaction_account", "conversation_message_reactions", ["account_id"])


def downgrade():
    connection = op.get_bind()
    kept = connection.scalar(sa.text(
        "SELECT (SELECT count(*) FROM conversation_message_reactions)"
        " + (SELECT count(*) FROM conversation_messages WHERE reply_to_id IS NOT NULL OR edited_at IS NOT NULL)"
    ))
    if kept:
        raise RuntimeError("Downgrading below 0037 would remove people's reactions and which messages are replies or were edited.")
    op.drop_index("ix_conversation_message_reaction_account", table_name="conversation_message_reactions")
    op.drop_table("conversation_message_reactions")
    op.drop_constraint("ck_conversation_message_revision", "conversation_messages", type_="check")
    op.drop_constraint("ck_conversation_message_edits", "conversation_messages", type_="check")
    op.drop_column("conversation_messages", "revision")
    op.drop_column("conversation_messages", "edit_count")
    op.drop_column("conversation_messages", "edited_at")
    op.drop_constraint("ck_conversation_message_reply", "conversation_messages", type_="check")
    op.drop_constraint("fk_conversation_message_reply", "conversation_messages", type_="foreignkey")
    op.drop_column("conversation_messages", "reply_to_id")
