"""Account deletion: a request with a 7-day grace period, then an erased account kept as an identifier (DEC-022)."""

from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("deletion_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("purge_after", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("users", "email_cipher", existing_type=sa.Text(), nullable=True)
    op.alter_column("users", "password_hash", existing_type=sa.String(512), nullable=True)
    op.drop_constraint("ck_user_status", "users", type_="check")
    op.create_check_constraint(
        "ck_user_status", "users", "status IN ('active', 'suspended', 'deactivated', 'deletion_requested', 'deleted')",
    )
    op.create_check_constraint("ck_user_erased_email", "users", "(status = 'deleted') = (email_cipher IS NULL)")
    op.create_check_constraint("ck_user_erased_password", "users", "(status = 'deleted') = (password_hash IS NULL)")
    op.create_check_constraint(
        "ck_user_deletion_request", "users",
        "status <> 'deletion_requested' OR (deletion_requested_at IS NOT NULL AND purge_after IS NOT NULL)",
    )
    op.create_check_constraint("ck_user_purged", "users", "(status = 'deleted') = (purged_at IS NOT NULL)")
    op.create_index(
        "ix_user_purge_due", "users", ["purge_after"], postgresql_where=sa.text("status = 'deletion_requested'"),
    )


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM users WHERE status IN ('deletion_requested', 'deleted')")):
        raise RuntimeError("Refusing to downgrade while accounts wait for deletion or are erased; they would become usable.")
    op.drop_index("ix_user_purge_due", table_name="users")
    op.drop_constraint("ck_user_purged", "users", type_="check")
    op.drop_constraint("ck_user_deletion_request", "users", type_="check")
    op.drop_constraint("ck_user_erased_password", "users", type_="check")
    op.drop_constraint("ck_user_erased_email", "users", type_="check")
    op.drop_constraint("ck_user_status", "users", type_="check")
    op.create_check_constraint("ck_user_status", "users", "status IN ('active', 'suspended', 'deactivated', 'deletion_requested')")
    op.alter_column("users", "password_hash", existing_type=sa.String(512), nullable=False)
    op.alter_column("users", "email_cipher", existing_type=sa.Text(), nullable=False)
    op.drop_column("users", "purged_at")
    op.drop_column("users", "purge_after")
    op.drop_column("users", "deletion_requested_at")
