"""Page moderators, handover and page archive and delete (DEC-025 parts 3 to 5)."""

from alembic import op
import sqlalchemy as sa

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "page_moderators",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("invited_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("decision_etag", sa.String(70), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("page_id", "invited_by_id", "request_key", name="uq_page_moderator_request"),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'declined', 'cancelled', 'withdrawn', 'removed', 'stepped_down', 'expired', 'invalidated')",
            name="ck_page_moderator_status",
        ),
        sa.CheckConstraint("version > 0 AND (expires_at IS NULL OR expires_at > created_at)", name="ck_page_moderator_bounds"),
        sa.CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL) AND (status = 'pending') = (expires_at IS NOT NULL)",
            name="ck_page_moderator_resolution",
        ),
        sa.CheckConstraint("account_id <> invited_by_id", name="ck_page_moderator_participants"),
    )
    op.create_index("uq_page_moderator_pending", "page_moderators", ["page_id"], unique=True, postgresql_where=sa.text("status = 'pending'"))
    op.create_index("uq_page_moderator_active", "page_moderators", ["page_id", "account_id"], unique=True, postgresql_where=sa.text("status = 'active'"))
    op.create_index("ix_page_moderator_account", "page_moderators", ["account_id", "created_at"])

    op.create_table(
        "page_handovers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), nullable=False),
        sa.Column("from_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("to_account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("from_session_id", sa.String(36), sa.ForeignKey("account_sessions.id"), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("decision_etag", sa.String(70), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("page_id", "from_account_id", "request_key", name="uq_page_handover_request"),
        sa.CheckConstraint("from_account_id <> to_account_id", name="ck_page_handover_participants"),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated')", name="ck_page_handover_status"),
        sa.CheckConstraint("version > 0 AND source_version > 0 AND (expires_at IS NULL OR expires_at > created_at)", name="ck_page_handover_bounds"),
        sa.CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL) AND (status = 'pending') = (expires_at IS NOT NULL)",
            name="ck_page_handover_resolution",
        ),
    )
    op.create_index("uq_page_handover_pending", "page_handovers", ["page_id"], unique=True, postgresql_where=sa.text("status = 'pending'"))

    op.add_column("public_pages", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("public_pages", sa.Column("purge_after", sa.DateTime(timezone=True), nullable=True))
    op.add_column("public_pages", sa.Column("pre_delete_status", sa.String(16), nullable=True))
    op.drop_constraint("ck_public_page_status", "public_pages", type_="check")
    # 'archived' stays the account-deletion state (T68): erased and hidden. The read-only state and the deleted state
    # from DEC-025 part 5 are 'read_only' and 'deleted', so no page's behaviour changes silently.
    op.create_check_constraint("ck_public_page_status", "public_pages", "status IN ('active', 'archived', 'read_only', 'deleted')")
    op.create_check_constraint("ck_public_page_restore", "public_pages", "pre_delete_status IS NULL OR pre_delete_status IN ('active', 'read_only')")
    op.create_index("ix_public_page_purge", "public_pages", ["purge_after"], postgresql_where=sa.text("purge_after IS NOT NULL"))


def downgrade():
    connection = op.get_bind()
    kept = connection.scalar(sa.text(
        "SELECT (SELECT count(*) FROM public_pages WHERE status IN ('read_only', 'deleted'))"
        " + (SELECT count(*) FROM page_moderators)"
        " + (SELECT count(*) FROM page_handovers)"
    ))
    if kept:
        raise RuntimeError("Downgrading below 0030 would lose page moderators, handovers, read-only or deleted pages; remove them first.")
    op.drop_index("ix_public_page_purge", table_name="public_pages")
    op.drop_constraint("ck_public_page_restore", "public_pages", type_="check")
    op.drop_constraint("ck_public_page_status", "public_pages", type_="check")
    op.create_check_constraint("ck_public_page_status", "public_pages", "status IN ('active', 'archived')")
    op.drop_column("public_pages", "pre_delete_status")
    op.drop_column("public_pages", "purge_after")
    op.drop_column("public_pages", "deleted_at")
    op.drop_index("uq_page_handover_pending", table_name="page_handovers")
    op.drop_table("page_handovers")
    op.drop_index("ix_page_moderator_account", table_name="page_moderators")
    op.drop_index("uq_page_moderator_active", table_name="page_moderators")
    op.drop_index("uq_page_moderator_pending", table_name="page_moderators")
    op.drop_table("page_moderators")