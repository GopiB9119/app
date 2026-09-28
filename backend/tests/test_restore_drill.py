from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select, update

from app.modules.identity.models import AccountSession
from app.modules.platform.restore import (
    ciphertext_check,
    compare_counts,
    exposure,
    owner_violations,
    require_drill_target,
    seal,
    table_counts,
)
from app.modules.spaces.models import Space, SpaceMembership
from tests.test_identity import account, auth, begin


def test_restore_checks_refuse_every_database_outside_the_drill():
    for url in (
        "postgresql+psycopg://community:local-development-only@db:5432/community",
        "postgresql+psycopg://community_test:synthetic-tests-only@test-db:5432/community_test",
        "postgresql+psycopg://restore_drill:secret@db:5432/community_restore",
        "postgresql+psycopg://restore_drill:secret@restore-db:5432/community",
    ):
        with pytest.raises(SystemExit):
            require_drill_target(url)
    require_drill_target("postgresql+psycopg://restore_drill:secret@restore-db:5432/community_restore")


def test_count_comparison_names_every_difference_and_never_passes_empty():
    assert compare_counts({}, {})["passed"] is False
    same = compare_counts({"spaces": 1, "users": 2}, {"spaces": 1, "users": 2})
    assert same["passed"] is True
    assert (same["tables"], same["rows"]) == (2, 3)
    different = compare_counts({"spaces": 1, "users": 2}, {"tasks": 0, "users": 3})
    assert different["passed"] is False
    assert different["missing"] == ["spaces"]
    assert different["extra"] == ["tasks"]
    assert different["changed"] == {"users": {"expected": 2, "actual": 3}}


def test_protected_fields_open_only_with_the_recorded_key(client, app):
    account(client, app)
    begin(client, app, "pending@example.test")
    with app.state.engine.connect() as connection:
        counts = table_counts(connection)
        recorded = ciphertext_check(connection, app.state.settings.load_key())
        control = ciphertext_check(connection, Fernet.generate_key())
    assert counts["users"] == 1
    assert counts["alembic_version"] == 1
    assert recorded["users.email_cipher"] == {"rows": 1, "valid": 1}
    assert recorded["users.email_lookup"] == {"rows": 1, "valid": 1}
    assert recorded["identity_challenges.email_cipher"] == {"rows": 2, "valid": 2}
    assert recorded["identity_mail_jobs.payload_cipher"]["rows"] >= 1
    assert all(item["valid"] == item["rows"] for item in recorded.values())
    assert {name: item["rows"] for name, item in control.items()} == {name: item["rows"] for name, item in recorded.items()}
    assert all(item["valid"] == 0 for item in control.values())


def test_seal_retires_restored_credentials_and_pending_proofs_only(client, app):
    active = account(client, app)
    revoked = account(client, app, "second@example.test")
    begin(client, app, "pending@example.test")
    now = app.state.clock.now
    earlier = now - timedelta(minutes=5)
    with app.state.engine.begin() as connection:
        connection.execute(update(AccountSession).where(AccountSession.account_id == revoked["user"]["id"]).values(revoked_at=earlier))
        before = exposure(connection, now)
    assert before["activeSessions"] == 1
    assert before["openChallenges"] == 1
    assert before["sendableMail"] >= 1

    with app.state.engine.begin() as connection:
        applied = seal(connection, now)
    assert applied["revokedSessions"] == 1
    assert applied["expiredChallenges"] == 1
    assert applied["expiredMail"] >= 1

    with app.state.engine.connect() as connection:
        after = exposure(connection, now)
        kept = connection.scalar(select(AccountSession.revoked_at).where(AccountSession.account_id == revoked["user"]["id"]))
    assert after == {**before, "activeSessions": 0, "openChallenges": 0, "sendableMail": 0}
    assert kept == earlier
    assert client.get("/v1/me", headers=auth(active)).status_code == 401


def test_owner_invariant_counts_active_spaces_without_exactly_one_owner(client, app):
    owner = account(client, app)
    created = [
        client.post("/v1/spaces", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={"name": name, "space_type": "family"})
        for name in ("Morgan family", "Second family")
    ]
    assert all(response.status_code == 201 for response in created), [response.text for response in created]
    space_id = created[1].json()["data"]["id"]
    with app.state.engine.connect() as connection:
        assert owner_violations(connection) == 0

    with app.state.engine.begin() as connection:
        connection.execute(update(SpaceMembership).where(SpaceMembership.space_id == space_id).values(role="member"))
    with app.state.engine.connect() as connection:
        assert owner_violations(connection) == 1

    with app.state.engine.begin() as connection:
        connection.execute(update(Space).where(Space.id == space_id).values(status="archived"))
    with app.state.engine.connect() as connection:
        assert owner_violations(connection) == 0
