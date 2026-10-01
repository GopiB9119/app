"""Space admins: a role between the owner and members, and receipts for role changes (DEC-018)."""

from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_space_membership_role", "space_memberships", type_="check")
    op.create_check_constraint("ck_space_membership_role", "space_memberships", "role IN ('owner', 'admin', 'member')")
    op.drop_constraint("ck_space_membership_command_action", "space_membership_commands", type_="check")
    op.create_check_constraint(
        "ck_space_membership_command_action", "space_membership_commands",
        "action IN ('remove', 'leave', 'make_admin', 'make_member')",
    )


def downgrade():
    connection = op.get_bind()
    kept = connection.scalar(sa.text(
        "SELECT (SELECT count(*) FROM space_memberships WHERE role = 'admin')"
        " + (SELECT count(*) FROM space_membership_commands WHERE action IN ('make_admin', 'make_member'))"
    ))
    if kept:
        raise RuntimeError("Refusing to downgrade while admins or role changes exist; they would lose their meaning.")
    op.drop_constraint("ck_space_membership_command_action", "space_membership_commands", type_="check")
    op.create_check_constraint("ck_space_membership_command_action", "space_membership_commands", "action IN ('remove', 'leave')")
    op.drop_constraint("ck_space_membership_role", "space_memberships", type_="check")
    op.create_check_constraint("ck_space_membership_role", "space_memberships", "role IN ('owner', 'member')")
