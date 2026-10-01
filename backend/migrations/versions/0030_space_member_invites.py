"""Per-Space setting: let every member of a family or group Space invite people (DEC-026)."""

from alembic import op
import sqlalchemy as sa

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("member_invites", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_check_constraint(
        "ck_space_member_invites", "spaces", "NOT member_invites OR space_type IN ('family', 'group')",
    )


def downgrade():
    connection = op.get_bind()
    kept = connection.scalar(sa.text("SELECT count(*) FROM spaces WHERE member_invites"))
    if kept:
        raise RuntimeError("Downgrading below 0030 would stop members' invitations; turn the setting off first.")
    op.drop_constraint("ck_space_member_invites", "spaces", type_="check")
    op.drop_column("spaces", "member_invites")
