"""Account-wide short-lived live connection reservations (T106)."""

import sqlalchemy as sa
from alembic import op

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "live_connection_leases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_live_connection_account_expiry", "live_connection_leases", ["account_id", "expires_at"])
    op.create_index("ix_live_connection_expiry", "live_connection_leases", ["expires_at"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM live_connection_leases WHERE expires_at > clock_timestamp()")):
        raise RuntimeError("Live connections must expire before removing their reservations.")
    op.drop_table("live_connection_leases")