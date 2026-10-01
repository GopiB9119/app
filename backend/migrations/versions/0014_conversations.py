"""Space chat and direct conversations with server-side encrypted message bodies."""

from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("first_account_id", sa.String(36), nullable=True),
        sa.Column("second_account_id", sa.String(36), nullable=True),
        sa.Column("first_admission_id", sa.String(36), nullable=True),
        sa.Column("second_admission_id", sa.String(36), nullable=True),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("last_sequence", sa.Integer(), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('space', 'direct')", name="ck_conversation_kind"),
        sa.CheckConstraint("last_sequence >= 0", name="ck_conversation_sequence"),
        sa.CheckConstraint(
            "(kind = 'space' AND first_account_id IS NULL AND second_account_id IS NULL "
            "AND first_admission_id IS NULL AND second_admission_id IS NULL) OR "
            "(kind = 'direct' AND first_account_id IS NOT NULL AND second_account_id IS NOT NULL "
            "AND first_account_id < second_account_id "
            "AND first_admission_id IS NOT NULL AND second_admission_id IS NOT NULL)",
            name="ck_conversation_participants",
        ),
        sa.UniqueConstraint(
            "space_id", "first_account_id", "second_account_id", "first_admission_id", "second_admission_id",
            name="uq_direct_conversation",
        ),
        sa.ForeignKeyConstraint(
            ["space_id", "first_account_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_conversation_first_member",
        ),
        sa.ForeignKeyConstraint(
            ["space_id", "second_account_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_conversation_second_member",
        ),
    )
    op.create_index("uq_space_conversation", "conversations", ["space_id"], unique=True, postgresql_where=sa.text("kind = 'space'"))
    op.create_index("ix_conversation_first_account", "conversations", ["first_account_id"])
    op.create_index("ix_conversation_second_account", "conversations", ["second_account_id"])
    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sender_admission_id", sa.String(36), nullable=False),
        sa.Column("client_message_id", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("body_cipher", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("conversation_id", "sequence", name="uq_conversation_message_sequence"),
        sa.UniqueConstraint("conversation_id", "sender_id", "client_message_id", name="uq_conversation_message_client"),
        sa.CheckConstraint("sequence > 0", name="ck_conversation_message_sequence"),
        sa.CheckConstraint("(deleted_at IS NULL) = (body_cipher IS NOT NULL)", name="ck_conversation_message_tombstone"),
    )
    op.create_index("ix_conversation_message_time", "conversation_messages", ["conversation_id", "created_at"])
    op.create_index("ix_conversation_message_sender_time", "conversation_messages", ["sender_id", "created_at"])
    op.create_table(
        "conversation_read_states",
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("read_sequence", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("read_sequence >= 0", name="ck_conversation_read_sequence"),
    )


def downgrade():
    op.drop_table("conversation_read_states")
    op.drop_index("ix_conversation_message_sender_time", table_name="conversation_messages")
    op.drop_index("ix_conversation_message_time", table_name="conversation_messages")
    op.drop_table("conversation_messages")
    op.drop_index("ix_conversation_second_account", table_name="conversations")
    op.drop_index("ix_conversation_first_account", table_name="conversations")
    op.drop_index("uq_space_conversation", table_name="conversations")
    op.drop_table("conversations")
