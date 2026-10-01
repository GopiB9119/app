from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_space_type", "spaces", type_="check")
    op.create_check_constraint("ck_space_type", "spaces", "space_type IN ('family', 'solo')")
    op.execute("""
        CREATE FUNCTION check_solo_membership() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE target_id text; target_ids text[]; target_type text; target_status text; owner_id text;
        BEGIN
            IF TG_TABLE_NAME = 'spaces' THEN
                target_ids := ARRAY[NEW.id];
            ELSIF TG_OP = 'DELETE' THEN
                target_ids := ARRAY[OLD.space_id];
            ELSIF TG_OP = 'UPDATE' THEN
                target_ids := ARRAY[OLD.space_id, NEW.space_id];
            ELSE
                target_ids := ARRAY[NEW.space_id];
            END IF;
            FOREACH target_id IN ARRAY target_ids LOOP
                SELECT space_type, status, created_by_id INTO target_type, target_status, owner_id
                    FROM spaces WHERE id = target_id FOR UPDATE;
                IF target_type = 'solo' AND target_status = 'active' THEN
                    IF (SELECT count(*) FROM space_memberships WHERE space_id = target_id AND status = 'active') <> 1
                       OR NOT EXISTS (SELECT 1 FROM space_memberships WHERE space_id = target_id
                           AND account_id = owner_id AND status = 'active' AND role = 'owner') THEN
                        RAISE EXCEPTION 'An active Solo Space requires its single human owner' USING ERRCODE = '23514';
                    END IF;
                END IF;
            END LOOP;
            RETURN NULL;
        END $$;
        CREATE CONSTRAINT TRIGGER solo_space_owner AFTER INSERT OR UPDATE ON spaces
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_solo_membership();
        CREATE CONSTRAINT TRIGGER solo_membership_owner AFTER INSERT OR UPDATE OR DELETE ON space_memberships
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_solo_membership();
        CREATE FUNCTION keep_space_type() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.space_type IS DISTINCT FROM OLD.space_type THEN
                RAISE EXCEPTION 'Space conversion requires a separate reviewed workflow' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER immutable_space_type BEFORE UPDATE OF space_type ON spaces
            FOR EACH ROW EXECUTE FUNCTION keep_space_type();
    """)


def downgrade():
    op.drop_constraint("ck_space_type", "spaces", type_="check")
    op.create_check_constraint("ck_space_type", "spaces", "space_type = 'family'")
    op.execute("DROP TRIGGER immutable_space_type ON spaces; DROP FUNCTION keep_space_type();")
    op.execute("DROP TRIGGER solo_membership_owner ON space_memberships; DROP TRIGGER solo_space_owner ON spaces; DROP FUNCTION check_solo_membership();")