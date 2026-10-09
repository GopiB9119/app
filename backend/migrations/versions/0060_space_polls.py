"""Polls inside Spaces: a question with two to six choices, one current vote per member, changeable until it closes.

Counts include only current members under the admission they voted with, and polls created before someone joined
stay hidden from them, as events do. A downgrade refuses while any poll exists."""

import sqlalchemy as sa
from alembic import op

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "space_polls",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("creator_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("creator_admission_id", sa.String(36), nullable=False),
        sa.Column("question", sa.String(200), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("admissions_before", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('open', 'closed')", name="ck_space_poll_status"),
        sa.CheckConstraint("(status = 'closed') = (closed_at IS NOT NULL)", name="ck_space_poll_closed"),
        sa.CheckConstraint("length(btrim(question)) BETWEEN 1 AND 200", name="ck_space_poll_question"),
        sa.CheckConstraint("version > 0 AND admissions_before >= 0", name="ck_space_poll_counts"),
        sa.UniqueConstraint("space_id", "creator_id", "creation_key", name="uq_space_poll_creation"),
        sa.ForeignKeyConstraint(
            ["space_id", "creator_id"], ["space_memberships.space_id", "space_memberships.account_id"], name="fk_space_poll_creator",
        ),
    )
    op.create_index("ix_space_poll_list", "space_polls", ["space_id", "created_at", "id"])
    op.create_table(
        "space_poll_options",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("poll_id", sa.String(36), sa.ForeignKey("space_polls.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.CheckConstraint("position BETWEEN 1 AND 6", name="ck_space_poll_option_position"),
        sa.CheckConstraint("length(btrim(label)) BETWEEN 1 AND 80", name="ck_space_poll_option_label"),
        sa.UniqueConstraint("poll_id", "position", name="uq_space_poll_option_position"),
    )
    op.create_table(
        "space_poll_votes",
        sa.Column("poll_id", sa.String(36), sa.ForeignKey("space_polls.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("option_id", sa.String(36), sa.ForeignKey("space_poll_options.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_space_poll_vote_option", "space_poll_votes", ["option_id"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM space_polls")).scalar():
        raise RuntimeError("Downgrading below 0060 would lose Space polls; remove them first.")
    op.drop_table("space_poll_votes")
    op.drop_table("space_poll_options")
    op.drop_table("space_polls")
