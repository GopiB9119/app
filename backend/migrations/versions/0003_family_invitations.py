"""Bind family invitations to verified accounts and one admission epoch."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("space_memberships", sa.Column("admission_id", sa.String(36), nullable=True))
    op.execute("UPDATE space_memberships SET admission_id = gen_random_uuid()::text")
    op.alter_column("space_memberships", "admission_id", nullable=False)
    op.create_unique_constraint("uq_space_membership_admission", "space_memberships", ["admission_id"])
    op.add_column("space_audit_events", sa.Column("target_id", sa.String(36), nullable=True))
    op.execute("UPDATE space_audit_events SET target_id = space_id")
    op.alter_column("space_audit_events", "target_id", nullable=False)
    op.create_table(
        "space_invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("inviter_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipient_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_admission_id", sa.String(36)),
        sa.UniqueConstraint("space_id", "inviter_id", "request_key", name="uq_space_invitation_request"),
        sa.CheckConstraint("recipient_id <> inviter_id", name="ck_space_invitation_recipient"),
        sa.CheckConstraint("expires_at > created_at", name="ck_space_invitation_expiry"),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')",
            name="ck_space_invitation_status",
        ),
        sa.CheckConstraint(
            "(status = 'accepted' AND accepted_admission_id IS NOT NULL) OR "
            "(status <> 'accepted' AND accepted_admission_id IS NULL)",
            name="ck_space_invitation_admission",
        ),
    )
    op.create_index("ix_space_invitation_inbox", "space_invitations", ["recipient_id", "status", "id"])
    op.create_index(
        "uq_space_pending_recipient", "space_invitations", ["space_id", "recipient_id"],
        unique=True, postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade():
    op.drop_table("space_invitations")
    op.drop_column("space_audit_events", "target_id")
    op.drop_constraint("uq_space_membership_admission", "space_memberships", type_="unique")
    op.drop_column("space_memberships", "admission_id")