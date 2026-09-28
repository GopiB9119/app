"""Bounded two-party family ownership transfers."""

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
	op.create_table("space_ownership_transfers",
		sa.Column("id", sa.String(36), primary_key=True),
		sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
		sa.Column("from_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
		sa.Column("to_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
		sa.Column("from_admission_id", sa.String(36), nullable=False),
		sa.Column("to_admission_id", sa.String(36), nullable=False),
		sa.Column("from_session_id", sa.String(36), sa.ForeignKey("account_sessions.id"), nullable=False),
		sa.Column("source_version", sa.Integer(), nullable=False),
		sa.Column("request_key", sa.String(36), nullable=False),
		sa.Column("request_digest", sa.String(64), nullable=False),
		sa.Column("decision_etag", sa.String(70), nullable=True),
		sa.Column("status", sa.String(16), nullable=False),
		sa.Column("version", sa.Integer(), nullable=False),
		sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
		sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
		sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
		sa.UniqueConstraint("space_id", "from_account_id", "request_key", name="uq_ownership_transfer_request"),
		sa.CheckConstraint("from_account_id <> to_account_id", name="ck_ownership_transfer_participants"),
		sa.CheckConstraint("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated')", name="ck_ownership_transfer_status"),
		sa.CheckConstraint("expires_at > created_at AND source_version > 0 AND version > 0", name="ck_ownership_transfer_bounds"),
		sa.CheckConstraint("(status = 'pending') = (resolved_at IS NULL)", name="ck_ownership_transfer_resolution"),
	)
	op.create_index("uq_ownership_transfer_pending", "space_ownership_transfers", ["space_id"], unique=True, postgresql_where=sa.text("status = 'pending'"))


def downgrade():
	op.drop_index("uq_ownership_transfer_pending", table_name="space_ownership_transfers")
	op.drop_table("space_ownership_transfers")