"""Couple Spaces: a private Space for at most two people (DEC-017)."""

from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_space_type", "spaces", type_="check")
    op.create_check_constraint("ck_space_type", "spaces", "space_type IN ('family', 'solo', 'group', 'couple')")
    # The service checks the limit with a clear message; this deferred rule keeps a third person out even if a
    # future code path forgets that check.
    op.execute("""
        CREATE FUNCTION check_couple_membership() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE target_type text; target_status text;
        BEGIN
            SELECT space_type, status INTO target_type, target_status
                FROM spaces WHERE id = NEW.space_id FOR UPDATE;
            IF target_type = 'couple' AND target_status = 'active' AND (
                SELECT count(*) FROM space_memberships WHERE space_id = NEW.space_id AND status = 'active'
            ) > 2 THEN
                RAISE EXCEPTION 'A couple Space has at most two people' USING ERRCODE = '23514';
            END IF;
            RETURN NULL;
        END $$;
        CREATE CONSTRAINT TRIGGER couple_membership_limit AFTER INSERT OR UPDATE ON space_memberships
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_couple_membership();
    """)


def downgrade():
    connection = op.get_bind()
    kept = connection.scalar(sa.text("SELECT count(*) FROM spaces WHERE space_type = 'couple'"))
    if kept:
        raise RuntimeError("Refusing to downgrade while couple Spaces exist; their type would have no meaning.")
    op.execute("DROP TRIGGER couple_membership_limit ON space_memberships; DROP FUNCTION check_couple_membership();")
    op.drop_constraint("ck_space_type", "spaces", type_="check")
    op.create_check_constraint("ck_space_type", "spaces", "space_type IN ('family', 'solo', 'group')")
