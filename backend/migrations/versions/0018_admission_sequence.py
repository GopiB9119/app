"""Admission order numbers, so history boundaries no longer depend on timestamps."""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("admission_sequence", sa.Integer()))
    op.add_column("space_memberships", sa.Column("admission_sequence", sa.Integer()))
    op.add_column("conversation_messages", sa.Column("admissions_before", sa.Integer()))
    op.add_column("space_events", sa.Column("admissions_before", sa.Integer()))
    # Existing admissions are numbered by join time, the Space creator first on a tie. A message or event made at the same
    # instant as someone's join counts as earlier and stays hidden from them, but its own sender or creator still sees it.
    op.execute("""
        UPDATE space_memberships AS membership SET admission_sequence = ordered.position
        FROM (
            SELECT member.space_id, member.account_id,
                   row_number() OVER (
                       PARTITION BY member.space_id
                       ORDER BY member.joined_at, (member.account_id <> space.created_by_id), member.account_id
                   ) AS position
            FROM space_memberships AS member JOIN spaces AS space ON space.id = member.space_id
        ) AS ordered
        WHERE membership.space_id = ordered.space_id AND membership.account_id = ordered.account_id
    """)
    op.execute("""
        UPDATE spaces AS space SET admission_sequence = coalesce(
            (SELECT max(membership.admission_sequence) FROM space_memberships AS membership WHERE membership.space_id = space.id), 1)
    """)
    op.execute("""
        UPDATE conversation_messages AS message SET admissions_before = greatest(
            (SELECT count(*) FROM conversations AS conversation
             JOIN space_memberships AS membership ON membership.space_id = conversation.space_id
             WHERE conversation.id = message.conversation_id AND membership.joined_at < message.created_at),
            coalesce((SELECT sender.admission_sequence FROM conversations AS conversation
                      JOIN space_memberships AS sender ON sender.space_id = conversation.space_id
                      WHERE conversation.id = message.conversation_id AND sender.account_id = message.sender_id
                        AND sender.admission_id = message.sender_admission_id), 0)
        )
    """)
    op.execute("""
        UPDATE space_events AS event SET admissions_before = greatest(
            (SELECT count(*) FROM space_memberships AS membership
             WHERE membership.space_id = event.space_id AND membership.joined_at < event.created_at),
            coalesce((SELECT creator.admission_sequence FROM space_memberships AS creator
                      WHERE creator.space_id = event.space_id AND creator.account_id = event.creator_id
                        AND creator.admission_id = event.creator_admission_id), 0)
        )
    """)
    # The backfill queues the deferred Solo owner checks from 0012; run them now so the tables can be altered.
    op.execute("SET CONSTRAINTS solo_space_owner, solo_membership_owner IMMEDIATE")
    op.alter_column("spaces", "admission_sequence", nullable=False)
    op.alter_column("space_memberships", "admission_sequence", nullable=False)
    op.alter_column("conversation_messages", "admissions_before", nullable=False)
    op.alter_column("space_events", "admissions_before", nullable=False)
    op.create_check_constraint("ck_space_admission_sequence", "spaces", "admission_sequence > 0")
    op.create_check_constraint("ck_space_membership_admission_sequence", "space_memberships", "admission_sequence > 0")
    op.create_unique_constraint(
        "uq_space_membership_admission_sequence", "space_memberships", ["space_id", "admission_sequence"],
    )
    op.execute("SET CONSTRAINTS solo_space_owner, solo_membership_owner DEFERRED")
    op.create_check_constraint("ck_conversation_message_admissions", "conversation_messages", "admissions_before >= 0")
    op.create_check_constraint("ck_space_event_admissions", "space_events", "admissions_before >= 0")


def downgrade():
    op.drop_constraint("ck_space_event_admissions", "space_events", type_="check")
    op.drop_constraint("ck_conversation_message_admissions", "conversation_messages", type_="check")
    op.drop_constraint("uq_space_membership_admission_sequence", "space_memberships", type_="unique")
    op.drop_constraint("ck_space_membership_admission_sequence", "space_memberships", type_="check")
    op.drop_constraint("ck_space_admission_sequence", "spaces", type_="check")
    op.drop_column("space_events", "admissions_before")
    op.drop_column("conversation_messages", "admissions_before")
    op.drop_column("space_memberships", "admission_sequence")
    op.drop_column("spaces", "admission_sequence")
