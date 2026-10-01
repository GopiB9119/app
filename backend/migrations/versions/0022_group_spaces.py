"""Group Spaces that may be public, Space descriptions, and requests to join public groups."""

from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("description", sa.String(280), nullable=False, server_default=""))
    op.drop_constraint("ck_space_type", "spaces", type_="check")
    op.create_check_constraint("ck_space_type", "spaces", "space_type IN ('family', 'solo', 'group')")
    op.drop_constraint("ck_space_visibility", "spaces", type_="check")
    op.create_check_constraint(
        "ck_space_visibility", "spaces", "visibility = 'private' OR (visibility = 'public' AND space_type = 'group')",
    )
    op.create_check_constraint("ck_space_description", "spaces", "length(description) <= 280")
    op.create_index(
        "ix_space_public_directory", "spaces", ["created_at", "id"],
        postgresql_where=sa.text("visibility = 'public' AND status = 'active'"),
    )
    op.create_table(
        "space_join_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("space_name", sa.String(80), nullable=False),
        sa.Column("note", sa.String(280), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("admission_id", sa.String(36), nullable=True),
        sa.UniqueConstraint("account_id", "request_key", name="uq_space_join_request_key"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'declined', 'cancelled', 'closed', 'expired')", name="ck_space_join_request_status",
        ),
        sa.CheckConstraint("expires_at > created_at", name="ck_space_join_request_expiry"),
        sa.CheckConstraint("(status = 'pending') = (resolved_at IS NULL)", name="ck_space_join_request_resolution"),
        sa.CheckConstraint("(status = 'approved') = (admission_id IS NOT NULL)", name="ck_space_join_request_admission"),
    )
    op.create_index("ix_space_join_request_queue", "space_join_requests", ["space_id", "status", "created_at"])
    op.create_index("ix_space_join_request_account", "space_join_requests", ["account_id", "created_at"])
    op.create_index(
        "uq_space_join_request_pending", "space_join_requests", ["space_id", "account_id"], unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade():
    connection = op.get_bind()
    kept = connection.scalar(sa.text(
        "SELECT (SELECT count(*) FROM spaces WHERE space_type = 'group' OR description <> '')"
        " + (SELECT count(*) FROM space_join_requests)"
    ))
    if kept:
        raise RuntimeError("Downgrading below 0022 would lose group Spaces, Space descriptions or join requests; remove them first.")
    op.drop_index("uq_space_join_request_pending", table_name="space_join_requests")
    op.drop_index("ix_space_join_request_account", table_name="space_join_requests")
    op.drop_index("ix_space_join_request_queue", table_name="space_join_requests")
    op.drop_table("space_join_requests")
    op.drop_index("ix_space_public_directory", table_name="spaces")
    op.drop_constraint("ck_space_description", "spaces", type_="check")
    op.drop_constraint("ck_space_visibility", "spaces", type_="check")
    op.create_check_constraint("ck_space_visibility", "spaces", "visibility = 'private'")
    op.drop_constraint("ck_space_type", "spaces", type_="check")
    op.create_check_constraint("ck_space_type", "spaces", "space_type IN ('family', 'solo')")
    op.drop_column("spaces", "description")
