"""Durable, session-bound account data exports."""

from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
	op.create_table("account_exports",
		sa.Column("id", sa.String(36), primary_key=True),
		sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
		sa.Column("session_id", sa.String(36), sa.ForeignKey("account_sessions.id"), nullable=False),
		sa.Column("request_key", sa.String(36), nullable=False),
		sa.Column("request_digest", sa.String(64), nullable=False),
		sa.Column("categories", sa.JSON(), nullable=False),
		sa.Column("status", sa.String(16), nullable=False),
		sa.Column("reason", sa.String(24), nullable=True),
		sa.Column("attempts", sa.Integer(), nullable=False),
		sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
		sa.Column("lease_token", sa.String(36), nullable=True),
		sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
		sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
		sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
		sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
		sa.Column("archive_cipher", sa.Text(), nullable=True),
		sa.Column("archive_bytes", sa.Integer(), nullable=True),
		sa.Column("included_access", sa.JSON(), nullable=True),
		sa.Column("download_count", sa.Integer(), nullable=False),
		sa.Column("last_downloaded_at", sa.DateTime(timezone=True), nullable=True),
		sa.UniqueConstraint("account_id", "request_key", name="uq_account_export_request"),
		sa.CheckConstraint("status IN ('queued', 'building', 'ready', 'outdated', 'cancelled', 'failed', 'expired')", name="ck_account_export_status"),
		sa.CheckConstraint("attempts >= 0 AND download_count >= 0", name="ck_account_export_counts"),
		sa.CheckConstraint("(status = 'ready') = (archive_cipher IS NOT NULL)", name="ck_account_export_archive"),
	)
	op.create_index("ix_account_export_account", "account_exports", ["account_id", "created_at"])
	op.create_index("ix_account_export_due", "account_exports", ["status", "available_at"])
	op.create_index("uq_account_export_active", "account_exports", ["account_id"], unique=True, postgresql_where=sa.text("status IN ('queued', 'building')"))


def downgrade():
	op.drop_index("uq_account_export_active", table_name="account_exports")
	op.drop_index("ix_account_export_due", table_name="account_exports")
	op.drop_index("ix_account_export_account", table_name="account_exports")
	op.drop_table("account_exports")
