"""Add private family Space creation and owner memberships."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "spaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("space_type", sa.String(16), nullable=False),
        sa.Column("visibility", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("created_by_id", "creation_key", name="uq_space_creation_intent"),
        sa.CheckConstraint("length(btrim(name)) BETWEEN 1 AND 80", name="ck_space_name"),
        sa.CheckConstraint("space_type = 'family'", name="ck_space_type"),
        sa.CheckConstraint("visibility = 'private'", name="ck_space_visibility"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_space_status"),
        sa.CheckConstraint("version > 0", name="ck_space_version"),
    )
    op.create_table(
        "space_memberships",
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('owner', 'member')", name="ck_space_membership_role"),
        sa.CheckConstraint("status IN ('active', 'removed')", name="ck_space_membership_status"),
    )
    op.create_index(
        "ix_space_membership_account", "space_memberships", ["account_id", "status", "space_id"]
    )
    op.create_index(
        "uq_space_active_owner",
        "space_memberships",
        ["space_id"],
        unique=True,
        postgresql_where=sa.text("role = 'owner' AND status = 'active'"),
    )
    op.create_table(
        "space_audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_space_audit_events_space_id", "space_audit_events", ["space_id"])


def downgrade():
    op.drop_table("space_audit_events")
    op.drop_table("space_memberships")
    op.drop_table("spaces")