from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.db import Base
from app.main import create_app
from app.modules.identity.models import AccountSession, Challenge, User
from app.modules.spaces.models import SpaceAuditEvent, SpaceMembership
from tests.test_identity import account, auth, begin, verify
from tests.test_spaces import create_space, invite_account
from tests.test_tasks import create_task


def test_database_run_is_isolated_from_public_tables(app, migrated_database):
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT current_schema()")) == migrated_database
        assert migrated_database.startswith("test_")
        assert connection.scalar(text("SELECT current_database()")) == "community_test"


def test_migrated_schema_matches_models(app):
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        assert compare_metadata(context, Base.metadata) == []


def test_new_application_instance_accepts_persisted_session(client, app):
    result = account(client, app)
    restarted = create_app(app.state.settings, app.state.clock)
    with TestClient(restarted) as other:
        response = other.get("/v1/me", headers=auth(result))
        assert response.status_code == 200
        assert response.json()["data"]["id"] == result["user"]["id"]


def test_required_audit_failure_rolls_back_activation(client, app):
    proof = begin(client, app)
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION test_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$"))
        connection.execute(text("CREATE TRIGGER test_audit_failure BEFORE INSERT ON domain_outbox FOR EACH ROW EXECUTE FUNCTION test_reject_outbox()"))
    try:
        assert verify(client, proof).status_code == 503
        with app.state.sessions() as database:
            assert database.scalar(select(func.count()).select_from(User)) == 0
            assert database.scalar(select(func.count()).select_from(AccountSession)) == 0
            assert database.get(Challenge, proof["challenge_id"]).consumed_at is None
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER test_audit_failure ON domain_outbox"))
            connection.execute(text("DROP FUNCTION test_reject_outbox()"))
    assert verify(client, proof).status_code == 201


def test_invitation_migration_backfills_existing_memberships_without_data_loss(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, "0002")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM space_memberships")) == 1
            assert connection.scalar(text("SELECT count(*) FROM spaces")) == 1
    finally:
        command.upgrade(settings, "head")
    with app.state.sessions() as database:
        membership = database.get(SpaceMembership, (space_id, owner["user"]["id"]))
        assert len(membership.admission_id) == 36
        assert membership.role == "owner"
        audit = database.scalars(select(SpaceAuditEvent)).one()
        assert audit.target_id == space_id
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(owner)).status_code == 200
    test_migrated_schema_matches_models(app)


def test_task_migration_preserves_existing_invitation_and_owner(client, app):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    invitation = invite_account(client, owner, space_id, recipient["user"]["id"]).json()["data"]
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, "0003")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM space_invitations")) == 1
            assert connection.scalar(text("SELECT count(*) FROM space_memberships")) == 1
    finally:
        command.upgrade(settings, "head")
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(owner)).status_code == 200
    assert client.post(
        f"/v1/invitations/{invitation['id']}/accept", headers=auth(recipient), json={}
    ).status_code == 200
    test_migrated_schema_matches_models(app)


def test_reminder_migration_preserves_existing_task_and_membership(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    task = create_task(client, owner, space_id, owner["user"]["id"]).json()["data"]
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, "0004")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM tasks")) == 1
            assert connection.scalar(text("SELECT count(*) FROM task_access")) == 1
            assert connection.scalar(text("SELECT count(*) FROM space_memberships")) == 1
    finally:
        command.upgrade(settings, "head")
    assert client.get(f"/v1/tasks/{task['id']}", headers=auth(owner)).json()["data"] == task
    test_migrated_schema_matches_models(app)


def test_reminder_retry_migration_backfills_without_replacing_schedule(client, app):
    from tests.test_reminder_delivery_guards import schedule_reminder
    from app.modules.scheduling.models import Reminder

    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, "0005")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM reminders")) == 1
    finally:
        command.upgrade(settings, "head")
    with app.state.sessions() as database:
        saved = database.get(Reminder, reminder["id"])
        assert saved.status == "scheduled"
        assert saved.dispatch_attempts == 0
        assert saved.next_attempt_at is None
        assert saved.last_failure_at is None
    listed = client.get("/v1/reminders", headers=auth(actor)).json()["data"]
    assert listed[0]["id"] == reminder["id"]
    test_migrated_schema_matches_models(app)


def test_reminder_request_migration_preserves_existing_personal_schedule(client, app):
    from tests.test_reminder_delivery_guards import schedule_reminder

    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, "0006")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM reminders")) == 1
    finally:
        command.upgrade(settings, "head")
    listed = client.get("/v1/reminders", headers=auth(actor)).json()["data"]
    assert listed == [reminder]
    assert client.get("/v1/reminder-requests", headers=auth(actor)).json()["data"] == []
    test_migrated_schema_matches_models(app)


def test_membership_receipt_migration_preserves_existing_admissions_and_reminder(client, app):
    from tests.test_spaces import membership_fixture
    from tests.test_reminder_delivery_guards import preview_reminder

    owner, member, space_id, invitation_id, reviewed = membership_fixture(client, app)
    task = create_task(client, owner, space_id, member["user"]["id"]).json()["data"]
    preview = preview_reminder(client, member, task["id"])
    assert preview.status_code == 200, preview.text
    reminder = client.post("/v1/reminders", headers={**auth(member), "Idempotency-Key": invitation_id},
                           json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]})
    assert reminder.status_code == 201, reminder.text
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, "0007")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM space_memberships")) == 2
            assert connection.scalar(text("SELECT count(*) FROM reminders")) == 1
    finally:
        command.upgrade(settings, "head")
    current = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    assert reviewed in current
    assert client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(member), json={}).status_code == 200
    assert client.get("/v1/reminders", headers=auth(member)).json()["data"] == [reminder.json()["data"]]
    test_migrated_schema_matches_models(app)


def test_ownership_migration_preserves_existing_members_and_departure_receipts(client, app):
    from tests.test_spaces import membership_fixture

    owner, member, space_id, invitation_id, reviewed = membership_fixture(client, app)
    response = client.post(f"/v1/spaces/{space_id}/leave", headers={**auth(member), "Idempotency-Key": invitation_id, "If-Match": reviewed["etag"]}, json={})
    assert response.status_code == 200, response.text
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0008")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM space_membership_commands")) == 1
            assert connection.scalar(text("SELECT count(*) FROM space_memberships")) == 2
    finally:
        command.upgrade(config, "head")
    assert client.post(f"/v1/spaces/{space_id}/leave", headers={**auth(member), "Idempotency-Key": invitation_id, "If-Match": reviewed["etag"]}, json={}).status_code == 200
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(owner)).json()["data"]["role"] == "owner"
    test_migrated_schema_matches_models(app)