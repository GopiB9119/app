"""Event-bound polls with private ballots and durable, versioned vote retries."""

import sqlalchemy as sa
from alembic import op

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "event_polls",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_id", sa.String(36), sa.ForeignKey("space_events.id"), nullable=False),
        sa.Column("creator_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("question", sa.String(120), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("length(btrim(question)) BETWEEN 1 AND 120", name="ck_event_poll_question"),
        sa.CheckConstraint("status IN ('open', 'closed')", name="ck_event_poll_status"),
        sa.CheckConstraint("(status = 'closed') = (closed_at IS NOT NULL)", name="ck_event_poll_closed"),
        sa.CheckConstraint("version > 0", name="ck_event_poll_version"),
        sa.UniqueConstraint("event_id", "creator_id", "creation_key", name="uq_event_poll_creation"),
    )
    op.create_index("ix_event_poll_event", "event_polls", ["event_id", "created_at", "id"])
    op.create_table(
        "event_poll_options",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("poll_id", sa.String(36), sa.ForeignKey("event_polls.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(80), nullable=False),
        sa.CheckConstraint("position BETWEEN 1 AND 8", name="ck_event_poll_option_position"),
        sa.CheckConstraint("length(btrim(text)) BETWEEN 1 AND 80", name="ck_event_poll_option_text"),
        sa.UniqueConstraint("poll_id", "position", name="uq_event_poll_option_position"),
        sa.UniqueConstraint("poll_id", "id", name="uq_event_poll_option_id"),
    )
    op.create_table(
        "event_poll_votes",
        sa.Column("poll_id", sa.String(36), sa.ForeignKey("event_polls.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("admission_id", sa.String(36), primary_key=True),
        sa.Column("option_id", sa.String(36)),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["poll_id", "option_id"], ["event_poll_options.poll_id", "event_poll_options.id"], name="fk_event_poll_vote_option"),
        sa.CheckConstraint("version > 0", name="ck_event_poll_vote_version"),
    )
    op.create_table(
        "event_poll_vote_commands",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("poll_id", sa.String(36), nullable=False),
        sa.Column("account_id", sa.String(36), nullable=False),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["poll_id", "account_id", "admission_id"],
                                ["event_poll_votes.poll_id", "event_poll_votes.account_id", "event_poll_votes.admission_id"],
                                name="fk_event_poll_vote_command", ondelete="CASCADE"),
        sa.UniqueConstraint("poll_id", "account_id", "admission_id", "request_key", name="uq_event_poll_vote_command"),
    )


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM event_polls")):
        raise RuntimeError("Downgrading below 0061 would lose event polls; remove them through an approved recovery first.")
    op.drop_table("event_poll_vote_commands")
    op.drop_table("event_poll_votes")
    op.drop_table("event_poll_options")
    op.drop_table("event_polls")