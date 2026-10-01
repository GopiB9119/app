import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.main import create_app
from app.modules.identity.models import AccountSession, OutboxEvent, User
from app.modules.spaces import service as spaces_service
from app.modules.spaces.models import OwnershipTransfer
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceInvitation, SpaceMembership, SpaceMembershipCommand

from .test_identity import account, auth


def create_space(client, actor, name="Morgan family", key=None, space_type="family"):
    return client.post(
        "/v1/spaces",
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={"name": name, "space_type": space_type},
    )


def invite_account(client, owner, space_id, recipient_id, key=None):
    return client.post(
        f"/v1/spaces/{space_id}/invitations",
        headers={**auth(owner), "Idempotency-Key": key or str(uuid4())},
        json={"recipient_account_id": recipient_id},
    )


def membership_fixture(client, app):
    owner = account(client, app)
    member = account(client, app, "membership-recipient@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    invitation = invite_account(client, owner, space_id, member["user"]["id"])
    assert invitation.status_code == 201, invitation.text
    invitation_id = invitation.json()["data"]["id"]
    accepted = client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(member), json={})
    assert accepted.status_code == 200, accepted.text
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner))
    assert roster.status_code == 200, roster.text
    reviewed = next(item for item in roster.json()["data"] if item["account_id"] == member["user"]["id"])
    return owner, member, space_id, invitation_id, reviewed


def test_solo_space_is_owner_only_and_supports_private_tasks(client, app):
    from tests.test_tasks import create_task

    owner = account(client, app)
    other = account(client, app, "solo-other@example.test")
    key = str(uuid4())
    created = create_space(client, owner, "My planning", key, "solo")
    assert created.status_code == 201, created.text
    space = created.json()["data"]
    assert space["space_type"] == "solo" and space["role"] == "owner"
    assert create_space(client, owner, "My planning", key, "solo").json()["data"] == space
    assert create_space(client, owner, "My planning", key, "family").status_code == 409
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(other)).status_code == 404
    rejected = invite_account(client, owner, space["id"], other["user"]["id"])
    assert rejected.status_code == 409 and rejected.json()["error"]["code"] == "SOLO_OWNER_ONLY"
    assert client.post(f"/v1/spaces/{space['id']}/ownership-transfers", headers={**auth(owner), "If-Match": '"review"', "Idempotency-Key": str(uuid4())}, json={"recipient_account_id": other["user"]["id"]}).status_code == 409
    task = create_task(client, owner, space["id"], owner["user"]["id"])
    assert task.status_code == 201, task.text
    assert client.get(f"/v1/tasks/{task.json()['data']['id']}", headers=auth(other)).status_code == 404
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceMembership).where(SpaceMembership.space_id == space["id"])) == 1
        assert database.scalar(select(func.count()).select_from(SpaceInvitation).where(SpaceInvitation.space_id == space["id"])) == 0


@pytest.mark.parametrize("operation", ["extra_member", "remove_owner", "convert"])
def test_solo_database_constraint_prevents_capacity_and_conversion_bypasses(client, app, operation):
    owner = account(client, app)
    other = account(client, app, "solo-constraint@example.test")
    space_id = create_space(client, owner, "Only me", space_type="solo").json()["data"]["id"]
    with pytest.raises(IntegrityError):
        with app.state.sessions.begin() as database:
            if operation == "extra_member":
                database.add(SpaceMembership(space_id=space_id, account_id=other["user"]["id"], role="member", status="active", joined_at=app.state.clock(), admission_sequence=2))
            elif operation == "remove_owner":
                database.get(SpaceMembership, (space_id, owner["user"]["id"])).status = "removed"
            else:
                database.get(Space, space_id).space_type = "family"
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(owner)).json()["data"]["space_type"] == "solo"
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(other)).status_code == 404


def test_solo_rejects_persisted_invitation_and_keeps_reminders_personal(client, app):
    from tests.test_tasks import create_task

    owner = account(client, app)
    other = account(client, app, "solo-invitation@example.test")
    space_id = create_space(client, owner, "My calendar", space_type="solo").json()["data"]["id"]
    invitation_id = str(uuid4())
    with app.state.sessions.begin() as database:
        database.add(SpaceInvitation(id=invitation_id, space_id=space_id, inviter_id=owner["user"]["id"], recipient_id=other["user"]["id"], request_key=str(uuid4()), status="pending", created_at=app.state.clock(), expires_at=app.state.clock() + timedelta(hours=1)))
    assert client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(other), json={}).status_code == 409
    task = create_task(client, owner, space_id).json()["data"]
    preview = client.post("/v1/reminders/preview", headers=auth(owner), json={"task_id": task["id"], "local_time": "2026-09-21T10:00", "timezone": "UTC"})
    assert preview.status_code == 200, preview.text
    saved = client.post("/v1/reminders", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]})
    assert saved.status_code == 201, saved.text
    query = {"space_id": space_id, "start_date": "2026-09-21", "end_date": "2026-09-21", "timezone": "UTC"}
    rows = client.get("/v1/calendar", headers=auth(owner), params=query)
    assert rows.status_code == 200, rows.text
    assert [row["kind"] for row in rows.json()["data"]] == ["task", "reminder"]
    assert client.get("/v1/calendar", headers=auth(other), params=query).status_code == 404
    assert client.get("/v1/reminders", headers=auth(other)).json()["data"] == []


def test_space_settings_owner_rename_and_exact_retry_preserve_membership(client, app):
    owner, member, space_id, _invitation, _reviewed = membership_fixture(client, app)
    path = f"/v1/spaces/{space_id}/settings"
    review = client.get(path, headers=auth(owner))
    assert review.status_code == 200, review.text
    headers = {**auth(owner), "If-Match": review.json()["data"]["etag"], "Idempotency-Key": str(uuid4())}
    with app.state.sessions() as database:
        admissions = {item.account_id: item.admission_id for item in database.scalars(select(SpaceMembership))}
    renamed = client.patch(path, headers=headers, json={"name": "  New family name  "})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["data"]["name"] == "New family name"
    assert int(renamed.json()["data"]["version"]) == int(review.json()["data"]["version"]) + 1
    repeated = client.patch(path, headers=headers, json={"name": "New family name"})
    assert repeated.json()["data"] == renamed.json()["data"]
    assert client.get(path, headers=auth(member)).status_code == 404
    assert client.patch(path, headers={**headers, **auth(member)}, json={"name": "Forbidden"}).status_code == 404
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).json()["data"]["name"] == "New family name"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(SpaceAuditEvent.action == "space.renamed")) == 1
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "space.renamed")) == 1
        assert admissions == {item.account_id: item.admission_id for item in database.scalars(select(SpaceMembership))}


def test_space_settings_preconditions_receipts_and_current_state(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    path = f"/v1/spaces/{space_id}/settings"
    original = client.get(path, headers=auth(owner)).json()["data"]
    key = str(uuid4())
    headers = {**auth(owner), "Idempotency-Key": key}
    assert client.patch(path, headers=headers, json={"name": "First"}).status_code == 428
    headers["If-Match"] = original["etag"]
    first = client.patch(path, headers=headers, json={"name": "First"})
    assert first.status_code == 200
    assert client.patch(path, headers=headers, json={"name": "Different"}).status_code == 409
    assert client.patch(path, headers={**headers, "Idempotency-Key": str(uuid4())}, json={"name": "Stale"}).status_code == 412
    newer = client.patch(path, headers={**headers, "Idempotency-Key": str(uuid4()), "If-Match": first.json()["data"]["etag"]}, json={"name": "Latest"})
    assert newer.status_code == 200
    assert client.patch(path, headers=headers, json={"name": "First"}).json()["data"] == newer.json()["data"]
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (space_id, owner["user"]["id"])).admission_id = str(uuid4())
    assert client.patch(path, headers=headers, json={"name": "First"}).status_code == 404


@pytest.mark.parametrize("body", [{"name": " "}, {"name": "Bad\nname"}, {"name": "x" * 81}, {"name": None}, {"name": "New", "visibility": "public"}, {"name": "New", "space_type": "solo"}])
def test_space_settings_rejects_invalid_names_and_authority_fields(client, app, body):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    path = f"/v1/spaces/{space_id}/settings"
    reviewed = client.get(path, headers=auth(owner)).json()["data"]
    response = client.patch(path, headers={**auth(owner), "If-Match": reviewed["etag"], "Idempotency-Key": str(uuid4())}, json=body)
    assert response.status_code == 422, response.text
    assert client.get(path, headers=auth(owner)).json()["data"] == reviewed


@pytest.mark.parametrize("kind", ["invitation", "ownership"])
def test_space_settings_pending_reviews_block_rename_until_expiry(client, app, kind):
    owner, member, space_id, _invitation, reviewed = membership_fixture(client, app)
    if kind == "ownership":
        pending = client.post(f"/v1/spaces/{space_id}/ownership-transfers", headers={**auth(owner), "If-Match": reviewed["etag"], "Idempotency-Key": str(uuid4())}, json={"recipient_account_id": member["user"]["id"]})
    else:
        invitee = account(client, app, "rename-pending@example.test")
        pending = invite_account(client, owner, space_id, invitee["user"]["id"])
    assert pending.status_code == 201, pending.text
    path = f"/v1/spaces/{space_id}/settings"
    reviewed_name = client.get(path, headers=auth(owner)).json()["data"]
    headers = {**auth(owner), "If-Match": reviewed_name["etag"], "Idempotency-Key": str(uuid4())}
    blocked = client.patch(path, headers=headers, json={"name": "New"})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "SPACE_REVIEW_PENDING"
    with app.state.sessions.begin() as database:
        pending_row = database.get(OwnershipTransfer if kind == "ownership" else SpaceInvitation, pending.json()["data"]["id"])
        pending_row.created_at = app.state.clock() - timedelta(days=5)
        pending_row.expires_at = app.state.clock() - timedelta(seconds=1)
    assert client.patch(path, headers=headers, json={"name": "New"}).status_code == 200


def test_space_settings_concurrent_retry_and_audit_failure(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    path = f"/v1/spaces/{space_id}/settings"
    original = client.get(path, headers=auth(owner)).json()["data"]
    headers = {**auth(owner), "If-Match": original["etag"], "Idempotency-Key": str(uuid4())}
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION reject_rename() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'space.renamed' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$"))
        connection.execute(text("CREATE TRIGGER reject_rename BEFORE INSERT ON domain_outbox FOR EACH ROW EXECUTE FUNCTION reject_rename()"))
    try:
        assert client.patch(path, headers=headers, json={"name": "New"}).status_code == 503
        assert client.get(path, headers=auth(owner)).json()["data"] == original
        with app.state.sessions() as database:
            assert database.scalar(text("SELECT count(*) FROM space_settings_commands")) == 0
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER reject_rename ON domain_outbox"))
            connection.execute(text("DROP FUNCTION reject_rename()"))
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = list(pool.map(lambda _attempt: client.patch(path, headers=headers, json={"name": "New"}), range(3)))
    assert [response.status_code for response in responses] == [200, 200, 200]
    assert {response.json()["data"]["version"] for response in responses} == {str(int(original["version"]) + 1)}
    with app.state.sessions() as database:
        assert database.scalar(text("SELECT count(*) FROM space_settings_commands")) == 1


def test_space_settings_replay_denied_after_ownership_change(client, app):
    owner, member, space_id, _invitation, reviewed = membership_fixture(client, app)
    path = f"/v1/spaces/{space_id}/settings"
    headers = {**auth(owner), "If-Match": client.get(path, headers=auth(owner)).json()["data"]["etag"], "Idempotency-Key": str(uuid4())}
    assert client.patch(path, headers=headers, json={"name": "Before transfer"}).status_code == 200
    offer = client.post(f"/v1/spaces/{space_id}/ownership-transfers", headers={**auth(owner), "If-Match": reviewed["etag"], "Idempotency-Key": str(uuid4())}, json={"recipient_account_id": member["user"]["id"]}).json()["data"]
    assert client.post(f"/v1/spaces/{space_id}/ownership-transfers/{offer['id']}/accept", headers={**auth(member), "If-Match": offer["etag"]}, json={}).status_code == 200
    assert client.patch(path, headers=headers, json={"name": "Before transfer"}).status_code == 404
    assert client.get(path, headers=auth(member)).status_code == 200


def test_ownership_transfer_needs_recipient_acceptance_and_preserves_one_owner(client, app):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    base = f"/v1/spaces/{space_id}/ownership-transfers"
    offered = client.post(base, headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]},
                          json={"recipient_account_id": member["user"]["id"]})
    assert offered.status_code == 201, offered.text
    transfer = offered.json()["data"]
    assert transfer["status"] == "pending"
    assert transfer["from_account_id"] == owner["user"]["id"]
    assert transfer["to_account_id"] == member["user"]["id"]
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).role == "owner"
        assert database.get(SpaceMembership, (space_id, member["user"]["id"])).role == "member"
        admissions = {row.account_id: row.admission_id for row in database.scalars(select(SpaceMembership).where(SpaceMembership.space_id == space_id))}
    path = f"{base}/{transfer['id']}/accept"
    assert client.get(path, headers=auth(member)).status_code == 405
    assert client.post(path, headers={**auth(owner), "If-Match": transfer["etag"]}, json={}).status_code == 404
    accepted = client.post(path, headers={**auth(member), "If-Match": transfer["etag"]}, json={})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"]["status"] == "accepted"
    repeated = client.post(path, headers={**auth(member), "If-Match": transfer["etag"]}, json={})
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["data"]["id"] == transfer["id"]
    with app.state.sessions() as database:
        members = database.scalars(select(SpaceMembership).where(SpaceMembership.space_id == space_id)).all()
        assert sum(row.role == "owner" and row.status == "active" for row in members) == 1
        assert database.get(SpaceMembership, (space_id, member["user"]["id"])).role == "owner"
        assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).role == "member"
        assert {row.account_id: row.admission_id for row in members} == admissions
    assert client.post(f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
                       headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={}).status_code == 404
    own_review = next(row for row in client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"] if row["account_id"] == owner["user"]["id"])
    left = client.post(f"/v1/spaces/{space_id}/leave", headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": own_review["etag"]}, json={})
    assert left.status_code == 200, left.text
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).json()["data"]["role"] == "owner"


def ownership_fixture(client, app):
    owner, member, space_id, invitation_id, reviewed = membership_fixture(client, app)
    base = f"/v1/spaces/{space_id}/ownership-transfers"
    headers = {**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    body = {"recipient_account_id": member["user"]["id"]}
    offered = client.post(base, headers=headers, json=body)
    assert offered.status_code == 201, offered.text
    return owner, member, space_id, invitation_id, offered.json()["data"], headers, body


def test_ownership_offer_requires_recent_owner_and_exact_recipient_review(client, app):
    owner, member, space_id, _invitation, reviewed = membership_fixture(client, app)
    base = f"/v1/spaces/{space_id}/ownership-transfers"
    headers = {**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    body = {"recipient_account_id": member["user"]["id"]}
    assert client.post(base, headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json=body).status_code == 428
    assert client.post(base, headers={**headers, "If-Match": '"stale"'}, json=body).status_code == 412
    assert client.post(base, headers=headers, json={**body, "role": "owner"}).status_code == 422
    assert client.post(base, headers={**auth(member), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={"recipient_account_id": owner["user"]["id"]}).status_code == 404
    app.state.clock.now += timedelta(minutes=16)
    response = client.post(base, headers=headers, json=body)
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "REAUTHENTICATION_REQUIRED"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(OwnershipTransfer)) == 0


def test_ownership_offer_retries_after_role_change_without_repeating_it(client, app):
    owner, member, space_id, _invitation, transfer, headers, body = ownership_fixture(client, app)
    base = f"/v1/spaces/{space_id}/ownership-transfers"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _index: client.post(base, headers=headers, json=body), range(2)))
    assert [result.status_code for result in results] == [201, 201]
    assert {result.json()["data"]["id"] for result in results} == {transfer["id"]}
    assert client.post(base, headers={**headers, "Idempotency-Key": str(uuid4())}, json=body).status_code == 409
    accepted = client.post(f"{base}/{transfer['id']}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={})
    assert accepted.status_code == 200
    retried = client.post(base, headers=headers, json=body)
    assert retried.status_code == 201, retried.text
    assert retried.json()["data"]["status"] == "accepted"
    app.state.clock.now += timedelta(minutes=16)
    repeated = client.post(f"{base}/{transfer['id']}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={})
    assert repeated.status_code == 200, repeated.text
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(OwnershipTransfer)) == 1
        assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(SpaceAuditEvent.action == "space.ownership_accepted")) == 1
        assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).role == "member"


@pytest.mark.parametrize("action", ["decline", "cancel"])
def test_ownership_decline_and_cancellation_never_change_roles(client, app, action):
    owner, member, space_id, _invitation, transfer, _headers, _body = ownership_fixture(client, app)
    base = f"/v1/spaces/{space_id}/ownership-transfers/{transfer['id']}"
    actor = member if action == "decline" else owner
    headers = {**auth(actor), "If-Match": transfer["etag"]}
    for _attempt in range(2):
        result = client.post(f"{base}/{action}", headers=headers, json={})
        assert result.status_code == 200, result.text
        assert result.json()["data"]["status"] == ("declined" if action == "decline" else "cancelled")
    assert client.post(f"{base}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={}).status_code == 409
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).role == "owner"
        assert database.get(SpaceMembership, (space_id, member["user"]["id"])).role == "member"


@pytest.mark.parametrize("change,status", [("expiry", 410), ("session", 409), ("revision", 409), ("recipient_admission", 404), ("removed", 404), ("archived", 404), ("old_recipient_login", 403)])
def test_ownership_acceptance_rechecks_current_authority_and_exact_offer(client, app, change, status):
    owner, member, space_id, _invitation, transfer, _headers, _body = ownership_fixture(client, app)
    with app.state.sessions.begin() as database:
        if change == "expiry":
            app.state.clock.now += timedelta(minutes=15)
        elif change == "session":
            database.get(AccountSession, owner["session_id"]).revoked_at = app.state.clock.now
        elif change == "revision":
            database.get(Space, space_id).version += 1
        elif change == "recipient_admission":
            database.get(SpaceMembership, (space_id, member["user"]["id"])).admission_id = str(uuid4())
        elif change == "removed":
            database.get(SpaceMembership, (space_id, member["user"]["id"])).status = "removed"
        elif change == "archived":
            database.get(Space, space_id).status = "archived"
        else:
            database.get(AccountSession, member["session_id"]).created_at -= timedelta(minutes=16)
    result = client.post(f"/v1/spaces/{space_id}/ownership-transfers/{transfer['id']}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={})
    assert result.status_code == status, result.text
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).role == "owner"
        assert database.get(OwnershipTransfer, transfer["id"]).status == "pending"


def test_ownership_lists_are_participant_only_and_preconditions_are_required(client, app):
    owner, member, space_id, _invitation, transfer, _headers, _body = ownership_fixture(client, app)
    outsider = account(client, app, "other-owner@example.test")
    base = f"/v1/spaces/{space_id}/ownership-transfers"
    for actor in (owner, member):
        page = client.get(base, headers=auth(actor))
        assert page.status_code == 200, page.text
        assert [item["id"] for item in page.json()["data"]] == [transfer["id"]]
        assert page.json()["pagination"] == {"has_more": False, "next_cursor": None}
        assert not {"from_session_id", "from_admission_id", "to_admission_id", "request_key", "decision_etag"}.intersection(page.json()["data"][0])
    assert client.get(base, headers=auth(outsider)).status_code == 404
    assert client.get(base).status_code == 401
    assert client.get(f"{base}?limit=21", headers=auth(owner)).status_code == 422
    path = f"{base}/{transfer['id']}/accept"
    assert client.post(path, headers=auth(member), json={}).status_code == 428
    assert client.post(path, headers={**auth(member), "If-Match": '"different-offer"'}, json={}).status_code == 412
    assert client.post(path, headers={**auth(member), "If-Match": transfer["etag"]}, json={"role": "owner"}).status_code == 422
    assert client.post(f"{base}/{transfer['id']}/cancel", headers={**auth(member), "If-Match": transfer["etag"]}, json={}).status_code == 404


def test_ownership_list_cursor_is_bound_to_account_space_admission_and_expiry(client, app):
    owner, member, space_id, _invitation, transfer, headers, body = ownership_fixture(client, app)
    base = f"/v1/spaces/{space_id}/ownership-transfers"
    cancelled = client.post(f"{base}/{transfer['id']}/cancel", headers={**auth(owner), "If-Match": transfer["etag"]}, json={})
    assert cancelled.status_code == 200
    offered = client.post(base, headers={**headers, "Idempotency-Key": str(uuid4())}, json=body)
    assert offered.status_code == 201
    first = client.get(f"{base}?limit=1", headers=auth(owner)).json()
    cursor = first["pagination"]["next_cursor"]
    assert first["pagination"]["has_more"] is True
    next_page = client.get(base, params={"limit": 1, "cursor": cursor}, headers=auth(owner))
    assert next_page.status_code == 200
    assert next_page.json()["pagination"] == {"has_more": False, "next_cursor": None}
    assert {first["data"][0]["id"], next_page.json()["data"][0]["id"]} == {transfer["id"], offered.json()["data"]["id"]}
    assert client.get(base, params={"cursor": cursor}, headers=auth(member)).status_code == 400
    other_space = create_space(client, owner).json()["data"]["id"]
    assert client.get(f"/v1/spaces/{other_space}/ownership-transfers", params={"cursor": cursor}, headers=auth(owner)).status_code == 400
    assert client.get(base, params={"cursor": "invalid"}, headers=auth(owner)).status_code == 400
    with app.state.sessions.begin() as database:
        membership = database.get(SpaceMembership, (space_id, owner["user"]["id"]))
        old_admission = membership.admission_id
        membership.admission_id = str(uuid4())
    assert client.get(base, params={"cursor": cursor}, headers=auth(owner)).status_code == 400
    assert client.get(base, headers=auth(owner)).json()["data"] == []
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (space_id, owner["user"]["id"])).admission_id = old_admission
    app.state.clock.now += timedelta(minutes=15)
    assert client.get(base, params={"cursor": cursor}, headers=auth(owner)).status_code == 410


@pytest.mark.parametrize("competing", ["cancel", "decline"])
def test_ownership_acceptance_and_terminal_action_have_one_winner(client, app, competing):
    owner, member, space_id, _invitation, transfer, _headers, _body = ownership_fixture(client, app)
    base = f"/v1/spaces/{space_id}/ownership-transfers/{transfer['id']}"
    actor = owner if competing == "cancel" else member
    with ThreadPoolExecutor(max_workers=2) as pool:
        acceptance = pool.submit(client.post, f"{base}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={})
        other = pool.submit(client.post, f"{base}/{competing}", headers={**auth(actor), "If-Match": transfer["etag"]}, json={})
        assert sorted([acceptance.result().status_code, other.result().status_code]) == [200, 409]
    with app.state.sessions() as database:
        owners = database.scalars(select(SpaceMembership).where(SpaceMembership.space_id == space_id, SpaceMembership.status == "active", SpaceMembership.role == "owner")).all()
        assert len(owners) == 1
        status = database.get(OwnershipTransfer, transfer["id"]).status
        assert owners[0].account_id == (member["user"]["id"] if status == "accepted" else owner["user"]["id"])


def test_ownership_failed_audit_rolls_back_both_roles_and_offer(client, app):
    owner, member, space_id, _invitation, transfer, _headers, _body = ownership_fixture(client, app)
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION reject_owner_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'space.ownership_accepted' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$"))
        connection.execute(text("CREATE TRIGGER reject_owner_change BEFORE INSERT ON domain_outbox FOR EACH ROW EXECUTE FUNCTION reject_owner_change()"))
    try:
        result = client.post(f"/v1/spaces/{space_id}/ownership-transfers/{transfer['id']}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={})
        assert result.status_code == 503, result.text
        with app.state.sessions() as database:
            assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).role == "owner"
            assert database.get(SpaceMembership, (space_id, member["user"]["id"])).role == "member"
            assert database.get(OwnershipTransfer, transfer["id"]).status == "pending"
            assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(SpaceAuditEvent.action == "space.ownership_accepted")) == 0
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER reject_owner_change ON domain_outbox"))
            connection.execute(text("DROP FUNCTION reject_owner_change()"))
    assert client.post(f"/v1/spaces/{space_id}/ownership-transfers/{transfer['id']}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={}).status_code == 200


def test_new_owner_does_not_gain_historical_task_grants_or_old_invitation_authority(client, app):
    from tests.test_tasks import create_task

    owner = account(client, app)
    member = account(client, app, "future-owner@example.test")
    invitee = account(client, app, "pending-invitee@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    old_task = create_task(client, owner, space_id, owner["user"]["id"]).json()["data"]
    invitation = invite_account(client, owner, space_id, member["user"]["id"]).json()["data"]
    assert client.post(f"/v1/invitations/{invitation['id']}/accept", headers=auth(member), json={}).status_code == 200
    pending = invite_account(client, owner, space_id, invitee["user"]["id"]).json()["data"]
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    reviewed = next(row for row in roster if row["account_id"] == member["user"]["id"])
    transfer = client.post(f"/v1/spaces/{space_id}/ownership-transfers", headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]},
                           json={"recipient_account_id": member["user"]["id"]}).json()["data"]
    accepted = client.post(f"/v1/spaces/{space_id}/ownership-transfers/{transfer['id']}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={})
    assert accepted.status_code == 200, accepted.text
    assert client.get(f"/v1/tasks/{old_task['id']}", headers=auth(member)).status_code == 404
    assert client.get(f"/v1/tasks/{old_task['id']}", headers=auth(owner)).status_code == 200
    assert client.post(f"/v1/invitations/{pending['id']}/accept", headers=auth(invitee), json={}).status_code == 409
    assert client.get("/v1/invitations", headers=auth(invitee)).json()["data"] == []
    with app.state.sessions() as database:
        assert database.get(Space, space_id).created_by_id == owner["user"]["id"]
        assert database.get(SpaceInvitation, pending["id"]).status == "revoked"


def test_membership_roster_has_only_current_private_member_fields(client, app):
    owner, member, space_id, _invitation_id, _reviewed = membership_fixture(client, app)
    outsider = account(client, app, "membership-outsider@example.test")
    for actor in (owner, member):
        response = client.get(f"/v1/spaces/{space_id}/members", headers=auth(actor))
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        rows = response.json()["data"]
        assert {item["account_id"] for item in rows} == {owner["user"]["id"], member["user"]["id"]}
        assert sum(item["role"] == "owner" for item in rows) == 1
        for item in rows:
            assert set(item) == {"account_id", "display_name", "role", "joined_at", "etag"}
            assert item["etag"].startswith('"') and item["etag"].endswith('"')
    assert client.get(f"/v1/spaces/{space_id}/members", headers=auth(outsider)).status_code == 404
    assert client.get(f"/v1/spaces/{space_id}/members").status_code == 401
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (space_id, member["user"]["id"])).status = "removed"
    assert client.get(f"/v1/spaces/{space_id}/members", headers=auth(member)).status_code == 404
    rows = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    assert [item["account_id"] for item in rows] == [owner["user"]["id"]]


@pytest.mark.parametrize("operation", ["remove", "leave"])
def test_membership_command_requires_key_current_review_and_empty_authority_body(client, app, operation):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    actor = owner if operation == "remove" else member
    path = f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove" if operation == "remove" else f"/v1/spaces/{space_id}/leave"
    headers = {**auth(actor), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    assert client.get(path, headers=auth(actor)).status_code == 405
    assert client.post(path, headers={**auth(actor), "If-Match": reviewed["etag"]}, json={}).status_code == 422
    assert client.post(path, headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={}).status_code == 428
    assert client.post(path, headers={**headers, "If-Match": '"different-admission"'}, json={}).status_code == 412
    for body in ({"account_id": owner["user"]["id"]}, {"role": "owner"}, {"status": "removed"}):
        assert client.post(path, headers=headers, json=body).status_code == 422
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, member["user"]["id"])).status == "active"
        assert database.scalar(select(func.count()).select_from(SpaceMembershipCommand)) == 0


def test_membership_owner_continuity_and_wrong_actor_are_enforced(client, app):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    outsider = account(client, app, "membership-outsider@example.test")
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    own = next(item for item in roster if item["account_id"] == owner["user"]["id"])
    own_headers = {**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": own["etag"]}
    assert client.post(f"/v1/spaces/{space_id}/leave", headers=own_headers, json={}).status_code == 409
    assert client.post(f"/v1/spaces/{space_id}/members/{owner['user']['id']}/remove", headers=own_headers, json={}).status_code == 409
    for actor in (member, outsider):
        response = client.post(f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
                               headers={**auth(actor), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={})
        assert response.status_code == 404, response.text
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).status == "active"
        assert database.get(SpaceMembership, (space_id, member["user"]["id"])).status == "active"
        assert database.scalar(select(func.count()).select_from(SpaceMembershipCommand)) == 0


@pytest.mark.parametrize("operation,archived", [("remove", False), ("leave", False), ("leave", True)])
def test_membership_departure_retries_return_only_an_attributed_minimal_receipt(client, app, operation, archived):
    owner, member, space_id, invitation_id, reviewed = membership_fixture(client, app)
    actor = owner if operation == "remove" else member
    path = f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove" if operation == "remove" else f"/v1/spaces/{space_id}/leave"
    headers = {**auth(actor), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    with app.state.sessions.begin() as database:
        before = database.get(Space, space_id).version
        if archived:
            database.get(Space, space_id).status = "archived"
    response = client.post(path, headers=headers, json={})
    assert response.status_code == 200, response.text
    assert response.json()["data"] == {"space_id": space_id, "account_id": member["user"]["id"], "status": "removed"}
    repeated = client.post(path, headers=headers, json={})
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["data"] == response.json()["data"]
    assert client.post(path, headers={**headers, "Idempotency-Key": str(uuid4())}, json={}).status_code == 404
    assert client.post(path, headers={**headers, "If-Match": '"changed-review"'}, json={}).status_code == 409
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).status_code == 404
    assert client.get(f"/v1/spaces/{space_id}/members", headers=auth(member)).status_code == 404
    assert client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(member), json={}).status_code == 404
    with app.state.sessions() as database:
        command = database.scalars(select(SpaceMembershipCommand)).one()
        audit = database.get(SpaceAuditEvent, command.id)
        outbox = database.get(OutboxEvent, command.id)
        assert command.actor_id == audit.actor_id == outbox.actor_id == actor["user"]["id"]
        assert command.target_id == audit.target_id == member["user"]["id"]
        assert audit.action == outbox.event_type == ("space.member_left" if operation == "leave" else "space.member_removed")
        assert database.get(Space, space_id).version == before + 1
        assert database.get(SpaceMembership, (space_id, owner["user"]["id"])).status == "active"


@pytest.mark.parametrize("operation", ["remove", "leave"])
def test_membership_receipt_never_changes_a_replacement_admission(client, app, operation):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    actor = owner if operation == "remove" else member
    path = f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove" if operation == "remove" else f"/v1/spaces/{space_id}/leave"
    headers = {**auth(actor), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    assert client.post(path, headers=headers, json={}).status_code == 200
    replacement = str(uuid4())
    with app.state.sessions.begin() as database:
        saved = database.get(SpaceMembership, (space_id, member["user"]["id"]))
        saved.admission_id = replacement
        saved.status = "active"
    assert client.post(path, headers=headers, json={}).status_code == 404
    stale = client.post(path, headers={**headers, "Idempotency-Key": str(uuid4())}, json={})
    assert stale.status_code == 412, stale.text
    with app.state.sessions() as database:
        saved = database.get(SpaceMembership, (space_id, member["user"]["id"]))
        assert saved.status == "active" and saved.admission_id == replacement
        assert database.scalar(select(func.count()).select_from(SpaceMembershipCommand)) == 1


def test_membership_leave_and_removal_have_one_durable_winner(client, app):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    with ThreadPoolExecutor(max_workers=2) as pool:
        removal = pool.submit(client.post, f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
                              headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={})
        leaving = pool.submit(client.post, f"/v1/spaces/{space_id}/leave",
                              headers={**auth(member), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={})
        assert sorted([removal.result().status_code, leaving.result().status_code]) == [200, 404]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceMembershipCommand)) == 1
        assert database.get(SpaceMembership, (space_id, member["user"]["id"])).status == "removed"


def test_membership_receipt_failure_rolls_back_revocation_and_required_events(client, app):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    headers = {**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    path = f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove"
    with app.state.sessions() as database:
        version = database.get(Space, space_id).version
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION reject_membership_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$"))
        connection.execute(text("CREATE TRIGGER reject_membership_receipt BEFORE INSERT ON space_membership_commands FOR EACH ROW EXECUTE FUNCTION reject_membership_receipt()"))
    try:
        assert client.post(path, headers=headers, json={}).status_code == 503
        with app.state.sessions() as database:
            assert database.get(SpaceMembership, (space_id, member["user"]["id"])).status == "active"
            assert database.get(Space, space_id).version == version
            assert database.scalar(select(func.count()).select_from(SpaceMembershipCommand)) == 0
            assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(SpaceAuditEvent.action == "space.member_removed")) == 0
            assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "space.member_removed")) == 0
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER reject_membership_receipt ON space_membership_commands"))
            connection.execute(text("DROP FUNCTION reject_membership_receipt()"))
    assert client.post(path, headers=headers, json={}).status_code == 200


def test_invitation_requires_intended_account_and_explicit_acceptance(client, app):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    outsider = account(client, app, "outsider@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]

    invited = invite_account(client, owner, space_id, recipient["user"]["id"])
    assert invited.status_code == 201, invited.text
    invitation = invited.json()["data"]
    assert invitation["status"] == "pending"
    assert invitation["role"] == "member"
    inbox = client.get("/v1/invitations", headers=auth(recipient))
    assert inbox.status_code == 200, inbox.text
    assert [item["id"] for item in inbox.json()["data"]] == [invitation["id"]]
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(recipient)).status_code == 404
    assert client.get("/v1/invitations", headers=auth(outsider)).json()["data"] == []

    accept_path = f"/v1/invitations/{invitation['id']}/accept"
    assert client.get(accept_path, headers=auth(recipient)).status_code == 405
    assert client.post(accept_path, headers=auth(outsider), json={}).status_code == 404
    accepted = client.post(accept_path, headers=auth(recipient), json={})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"]["id"] == space_id
    assert accepted.json()["data"]["role"] == "member"
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(recipient)).status_code == 200
    assert client.post(accept_path, headers=auth(recipient), json={}).status_code == 200
    assert client.get("/v1/invitations", headers=auth(recipient)).json()["data"] == []


def test_invitation_creation_retries_are_bound_to_recipient(client, app):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    other = account(client, app, "other@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    key = str(uuid4())
    first = invite_account(client, owner, space_id, recipient["user"]["id"], key)
    assert first.status_code == 201, first.text
    repeated = invite_account(client, owner, space_id, recipient["user"]["id"], key)
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["data"]["id"] == first.json()["data"]["id"]
    conflict = invite_account(client, owner, space_id, other["user"]["id"], key)
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_create_family_space_is_private_and_owner_scoped(client, app):
    owner = account(client, app)
    outsider = account(client, app, "outsider@example.test")

    created = create_space(client, owner)
    assert created.status_code == 201, created.text
    space = created.json()["data"]
    assert space["name"] == "Morgan family"
    assert space["space_type"] == "family"
    assert space["visibility"] == "private"
    assert space["role"] == "owner"
    assert created.headers["cache-control"] == "no-store"

    mine = client.get("/v1/spaces", headers=auth(owner))
    assert mine.status_code == 200, mine.text
    assert [item["id"] for item in mine.json()["data"]] == [space["id"]]
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(owner)).status_code == 200
    assert client.get("/v1/spaces", headers=auth(outsider)).json()["data"] == []
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(outsider)).status_code == 404
    assert client.get("/v1/spaces").status_code == 401


def test_family_space_creation_retries_reuse_one_intent(client, app):
    owner = account(client, app)
    key = str(uuid4())
    first = create_space(client, owner, key=key)
    assert first.status_code == 201, first.text
    repeated = create_space(client, owner, key=key)
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["data"]["id"] == first.json()["data"]["id"]
    conflict = create_space(client, owner, name="Different intent", key=key)
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert len(client.get("/v1/spaces", headers=auth(owner)).json()["data"]) == 1


def test_concurrent_creation_commits_one_owner_and_event(client, app):
    owner = account(client, app)
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = list(pool.map(lambda _attempt: create_space(client, owner, key=key), range(3)))
    assert [response.status_code for response in responses] == [201, 201, 201]
    assert len({response.json()["data"]["id"] for response in responses}) == 1
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Space)) == 1
        membership = database.scalars(select(SpaceMembership)).one()
        assert membership.account_id == owner["user"]["id"]
        assert membership.role == "owner"
        assert membership.status == "active"
        audit = database.scalars(select(SpaceAuditEvent)).one()
        outbox = database.scalars(
            select(OutboxEvent).where(OutboxEvent.event_type == "space.created")
        ).one()
        assert audit.id == outbox.id
        assert audit.space_id == outbox.aggregate_id == membership.space_id
        assert audit.actor_id == outbox.actor_id == owner["user"]["id"]


def test_same_creation_key_is_scoped_to_actual_actor(client, app):
    first_owner = account(client, app)
    second_owner = account(client, app, "other@example.test")
    key = str(uuid4())
    first = create_space(client, first_owner, key=key)
    second = create_space(client, second_owner, name="Another family", key=key)
    assert first.status_code == second.status_code == 201
    assert first.json()["data"]["id"] != second.json()["data"]["id"]
    normalized = create_space(client, first_owner, name="  Morgan family  ", key=key)
    assert normalized.status_code == 201
    assert normalized.json()["data"]["id"] == first.json()["data"]["id"]


@pytest.mark.parametrize(
    "body",
    [
        {"name": "", "space_type": "family"},
        {"name": "   ", "space_type": "family"},
        {"name": "Family\nname", "space_type": "family"},
        {"name": "Family\u200b", "space_type": "family"},
        {"name": "x" * 81, "space_type": "family"},
        {"name": "Family", "space_type": "couple"},
        {"name": "Family", "space_type": "family", "visibility": "public"},
        {"name": "Family", "space_type": "family", "owner_id": str(uuid4())},
        {"name": "Family", "space_type": "family", "role": "owner"},
        {"name": "Family", "space_type": "family", "status": "active"},
    ],
)
def test_creation_rejects_invalid_and_authority_fields(client, app, body):
    owner = account(client, app)
    response = client.post(
        "/v1/spaces",
        headers={**auth(owner), "Idempotency-Key": str(uuid4())},
        json=body,
    )
    assert response.status_code == 422, response.text
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Space)) == 0


def test_creation_requires_live_session_and_request_key(client, app):
    owner = account(client, app)
    body = {"name": "Family", "space_type": "family"}
    assert client.post("/v1/spaces", headers=auth(owner), json=body).status_code == 422
    assert client.post("/v1/auth/logout", headers=auth(owner)).status_code == 200
    assert create_space(client, owner).status_code == 401
    assert client.get("/v1/spaces", headers=auth(owner)).status_code == 401
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Space)) == 0


def test_removed_membership_denies_reads_and_old_creation_receipt(client, app):
    owner = account(client, app)
    key = str(uuid4())
    identifier = create_space(client, owner, key=key).json()["data"]["id"]
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (identifier, owner["user"]["id"])).status = "removed"
    assert client.get(f"/v1/spaces/{identifier}", headers=auth(owner)).status_code == 404
    assert client.get("/v1/spaces", headers=auth(owner)).json()["data"] == []
    assert create_space(client, owner, key=key).status_code == 404
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Space)) == 1


def test_restricted_account_and_archived_space_are_not_exposed(client, app):
    owner = account(client, app)
    identifier = create_space(client, owner).json()["data"]["id"]
    with app.state.sessions.begin() as database:
        database.get(Space, identifier).status = "archived"
    assert client.get(f"/v1/spaces/{identifier}", headers=auth(owner)).status_code == 404
    assert client.get("/v1/spaces", headers=auth(owner)).json()["data"] == []
    with app.state.sessions.begin() as database:
        database.get(User, owner["user"]["id"]).status = "suspended"
    assert create_space(client, owner).status_code == 401
    assert client.get("/v1/spaces", headers=auth(owner)).status_code == 401


def test_space_pagination_is_bounded_account_bound_and_expiring(client, app):
    owner = account(client, app)
    outsider = account(client, app, "other@example.test")
    expected = {
        create_space(client, owner, name=f"Family {number}").json()["data"]["id"]
        for number in range(3)
    }
    first = client.get("/v1/spaces?limit=2", headers=auth(owner)).json()
    assert len(first["data"]) == 2
    assert first["pagination"]["has_more"] is True
    cursor = first["pagination"]["next_cursor"]
    second = client.get(
        "/v1/spaces", params={"limit": 2, "cursor": cursor}, headers=auth(owner)
    ).json()
    assert len(second["data"]) == 1
    assert second["pagination"] == {"next_cursor": None, "has_more": False}
    assert {item["id"] for item in first["data"] + second["data"]} == expected
    assert client.get(
        "/v1/spaces", params={"cursor": cursor}, headers=auth(outsider)
    ).status_code == 400
    assert client.get("/v1/spaces?cursor=tampered", headers=auth(owner)).status_code == 400
    assert client.get("/v1/spaces?limit=51", headers=auth(owner)).status_code == 422
    assert client.get("/v1/spaces?limit=0", headers=auth(owner)).status_code == 422
    app.state.clock.now += timedelta(minutes=16)
    expired = client.get("/v1/spaces", params={"cursor": cursor}, headers=auth(owner))
    assert expired.status_code == 410
    assert expired.json()["error"]["code"] == "CURSOR_EXPIRED"


def test_creation_outbox_failure_rolls_back_every_record(client, app):
    owner = account(client, app)
    key = str(uuid4())
    with app.state.engine.begin() as connection:
        connection.execute(text(
            "CREATE FUNCTION test_reject_space_outbox() RETURNS trigger LANGUAGE plpgsql "
            "AS $$ BEGIN RAISE EXCEPTION 'synthetic space audit failure'; END $$"
        ))
        connection.execute(text(
            "CREATE TRIGGER test_space_audit_failure BEFORE INSERT ON domain_outbox "
            "FOR EACH ROW WHEN (NEW.event_type = 'space.created') "
            "EXECUTE FUNCTION test_reject_space_outbox()"
        ))
    try:
        assert create_space(client, owner, key=key).status_code == 503
        with app.state.sessions() as database:
            for model in (Space, SpaceMembership, SpaceAuditEvent):
                assert database.scalar(select(func.count()).select_from(model)) == 0
            assert database.scalar(
                select(func.count()).select_from(OutboxEvent)
                .where(OutboxEvent.event_type == "space.created")
            ) == 0
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER test_space_audit_failure ON domain_outbox"))
            connection.execute(text("DROP FUNCTION test_reject_space_outbox()"))
    assert create_space(client, owner, key=key).status_code == 201


def test_space_survives_new_application_instance(client, app):
    owner = account(client, app)
    identifier = create_space(client, owner).json()["data"]["id"]
    restarted = create_app(app.state.settings, app.state.clock)
    with TestClient(restarted) as other:
        response = other.get(f"/v1/spaces/{identifier}", headers=auth(owner))
        assert response.status_code == 200
        assert response.json()["data"]["role"] == "owner"


def test_local_space_quota_does_not_block_safe_replay(client, app):
    owner = account(client, app)
    key = str(uuid4())
    first = create_space(client, owner, key=key)
    assert first.status_code == 201
    for number in range(49):
        assert create_space(client, owner, name=f"Family {number}").status_code == 201
    assert create_space(client, owner).status_code == 409
    assert create_space(client, owner, key=key).json()["data"]["id"] == first.json()["data"]["id"]


def test_space_openapi_documents_authentication_and_private_projections(app):
    schema = app.openapi()
    for path, method in (("/v1/spaces", "post"), ("/v1/spaces", "get"),
                         ("/v1/spaces/{space_id}", "get")):
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
    request = schema["components"]["schemas"]["CreateSpace"]
    assert request["additionalProperties"] is False
    # DEC-011 added the group type; family and solo keep their existing rules.
    assert request["properties"]["space_type"]["enum"] == ["family", "solo", "group"]
    assert request["properties"]["name"]["maxLength"] == 80
    response = schema["components"]["schemas"]["SpaceView"]["properties"]
    assert "creation_key" not in response
    assert "creation_digest" not in response
    assert "created_by_id" not in response
    parameters = schema["paths"]["/v1/spaces"]["post"]["parameters"]
    assert any(
        parameter["in"] == "header" and parameter["name"] == "idempotency-key"
        and parameter["required"] for parameter in parameters
    )


def pending_invitation(client, app):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    invitation = invite_account(client, owner, space_id, recipient["user"]["id"])
    assert invitation.status_code == 201, invitation.text
    return owner, recipient, space_id, invitation.json()["data"]


def test_only_owner_can_invite_and_view_sent_history(client, app):
    owner, member, space_id, invitation = pending_invitation(client, app)
    outsider = account(client, app, "outsider@example.test")
    assert client.post(
        f"/v1/invitations/{invitation['id']}/accept", headers=auth(member), json={}
    ).status_code == 200
    for actor in (member, outsider):
        assert invite_account(client, actor, space_id, outsider["user"]["id"]).status_code == 404
        assert client.get(
            f"/v1/spaces/{space_id}/invitations", headers=auth(actor)
        ).status_code == 404
        assert client.post(
            f"/v1/spaces/{space_id}/invitations/{invitation['id']}/revoke",
            headers=auth(actor), json={},
        ).status_code == 404
    history = client.get(f"/v1/spaces/{space_id}/invitations", headers=auth(owner))
    assert history.status_code == 200
    assert history.json()["data"][0]["status"] == "accepted"
    assert client.post(
        f"/v1/invitations/{invitation['id']}/accept", headers=auth(owner), json={}
    ).status_code == 404


@pytest.mark.parametrize("action", ["decline", "revoke"])
def test_invitation_terminal_action_is_idempotent_and_stops_acceptance(client, app, action):
    owner, recipient, space_id, invitation = pending_invitation(client, app)
    actor = recipient if action == "decline" else owner
    path = (
        f"/v1/invitations/{invitation['id']}/decline" if action == "decline"
        else f"/v1/spaces/{space_id}/invitations/{invitation['id']}/revoke"
    )
    expected = "declined" if action == "decline" else "revoked"
    for _attempt in range(2):
        result = client.post(path, headers=auth(actor), json={})
        assert result.status_code == 200, result.text
        assert result.json()["data"] == {"id": invitation["id"], "status": expected}
    assert client.post(
        f"/v1/invitations/{invitation['id']}/accept", headers=auth(recipient), json={}
    ).status_code == 409
    assert client.get("/v1/invitations", headers=auth(recipient)).json()["data"] == []
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, recipient["user"]["id"])) is None
        events = database.scalars(select(SpaceAuditEvent).where(
            SpaceAuditEvent.action == f"space.invitation_{expected}"
        )).all()
        assert len(events) == 1
        assert events[0].target_id == invitation["id"]


def test_invitation_expiry_is_enforced_without_cleanup_and_new_invite_does_not_revive_old(client, app):
    owner, recipient, space_id, invitation = pending_invitation(client, app)
    with app.state.sessions.begin() as database:
        stored = database.get(SpaceInvitation, invitation["id"])
        assert stored.expires_at - stored.created_at == timedelta(hours=72)
        stored.expires_at = app.state.clock.now + timedelta(seconds=1)
    app.state.clock.now += timedelta(seconds=1)
    accept_path = f"/v1/invitations/{invitation['id']}/accept"
    assert client.post(accept_path, headers=auth(recipient), json={}).status_code == 410
    assert client.get("/v1/invitations", headers=auth(recipient)).json()["data"] == []
    history = client.get(f"/v1/spaces/{space_id}/invitations", headers=auth(owner)).json()["data"]
    assert history[0]["status"] == "expired"
    replacement = invite_account(client, owner, space_id, recipient["user"]["id"])
    assert replacement.status_code == 201, replacement.text
    assert replacement.json()["data"]["id"] != invitation["id"]
    assert client.post(accept_path, headers=auth(recipient), json={}).status_code in (409, 410)
    with app.state.sessions() as database:
        assert database.get(SpaceInvitation, invitation["id"]).status == "expired"
        assert database.get(SpaceMembership, (space_id, recipient["user"]["id"])) is None


@pytest.mark.parametrize(
    "restriction, expected", [
        ("inviter_suspended", 409), ("inviter_demoted", 404), ("inviter_removed", 404),
        ("space_archived", 404), ("recipient_suspended", 401), ("session_revoked", 401),
    ],
)
def test_invitation_acceptance_rechecks_current_authority(client, app, restriction, expected):
    owner, recipient, space_id, invitation = pending_invitation(client, app)
    with app.state.sessions.begin() as database:
        if restriction == "inviter_suspended":
            database.get(User, owner["user"]["id"]).status = "suspended"
        elif restriction in ("inviter_demoted", "inviter_removed"):
            membership = database.get(SpaceMembership, (space_id, owner["user"]["id"]))
            if restriction == "inviter_demoted":
                membership.role = "member"
            else:
                membership.status = "removed"
        elif restriction == "space_archived":
            database.get(Space, space_id).status = "archived"
        elif restriction == "recipient_suspended":
            database.get(User, recipient["user"]["id"]).status = "suspended"
        else:
            database.get(AccountSession, recipient["session_id"]).revoked_at = app.state.clock.now
    result = client.post(
        f"/v1/invitations/{invitation['id']}/accept", headers=auth(recipient), json={}
    )
    assert result.status_code == expected, result.text
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, recipient["user"]["id"])) is None
        assert database.get(SpaceInvitation, invitation["id"]).status == "pending"
    if expected != 401:
        assert client.get("/v1/invitations", headers=auth(recipient)).json()["data"] == []


def test_inviter_session_expiry_does_not_revoke_standing_invitation(client, app):
    owner, recipient, _space_id, invitation = pending_invitation(client, app)
    assert client.post("/v1/auth/logout", headers=auth(owner)).status_code == 200
    result = client.post(
        f"/v1/invitations/{invitation['id']}/accept", headers=auth(recipient), json={}
    )
    assert result.status_code == 200, result.text


@pytest.mark.parametrize("change", ["removed", "different_admission"])
def test_old_accepted_invitation_cannot_reactivate_or_claim_new_membership(client, app, change):
    owner, recipient, space_id, invitation = pending_invitation(client, app)
    path = f"/v1/invitations/{invitation['id']}/accept"
    assert client.post(path, headers=auth(recipient), json={}).status_code == 200
    with app.state.sessions.begin() as database:
        membership = database.get(SpaceMembership, (space_id, recipient["user"]["id"]))
        if change == "removed":
            membership.status = "removed"
        else:
            membership.admission_id = str(uuid4())
    assert client.post(path, headers=auth(recipient), json={}).status_code == 404
    fresh = invite_account(client, owner, space_id, recipient["user"]["id"])
    assert fresh.status_code == (201 if change == "removed" else 409), fresh.text
    assert client.post(path, headers=auth(recipient), json={}).status_code == 404
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceMembership)) == 2
        saved = database.get(SpaceMembership, (space_id, recipient["user"]["id"]))
        assert saved.status == ("removed" if change == "removed" else "active")


@pytest.mark.parametrize("operation", ["remove", "leave"])
def test_former_member_rejoins_only_through_new_invitation_without_old_history(client, app, operation):
    from tests.test_tasks import create_task

    owner, member, space_id, invitation_id, reviewed = membership_fixture(client, app)
    member_id = member["user"]["id"]
    old_task = create_task(client, owner, space_id, member_id).json()["data"]
    assert client.get(f"/v1/tasks/{old_task['id']}", headers=auth(member)).status_code == 200
    actor = owner if operation == "remove" else member
    path = f"/v1/spaces/{space_id}/members/{member_id}/remove" if operation == "remove" else f"/v1/spaces/{space_id}/leave"
    departure = {**auth(actor), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    assert client.post(path, headers=departure, json={}).status_code == 200
    with app.state.sessions() as database:
        earlier = database.get(SpaceMembership, (space_id, member_id)).admission_id
        version = database.get(Space, space_id).version

    returning = invite_account(client, owner, space_id, member_id)
    assert returning.status_code == 201, returning.text
    fresh = returning.json()["data"]
    assert fresh["role"] == "member" and fresh["status"] == "pending"
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).status_code == 404
    assert [item["id"] for item in client.get("/v1/invitations", headers=auth(member)).json()["data"]] == [fresh["id"]]
    assert client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(member), json={}).status_code == 404

    app.state.clock.now += timedelta(minutes=1)
    joined = client.post(f"/v1/invitations/{fresh['id']}/accept", headers=auth(member), json={})
    assert joined.status_code == 200, joined.text
    assert joined.json()["data"]["role"] == "member"
    with app.state.sessions() as database:
        membership = database.get(SpaceMembership, (space_id, member_id))
        assert membership.status == "active" and membership.role == "member"
        assert membership.admission_id != earlier
        assert membership.joined_at == app.state.clock.now
        assert database.get(SpaceInvitation, fresh["id"]).accepted_admission_id == membership.admission_id
        assert database.get(SpaceInvitation, invitation_id).accepted_admission_id == earlier
        assert database.get(Space, space_id).version == version + 1
        assert database.scalar(select(func.count()).select_from(SpaceMembership).where(SpaceMembership.space_id == space_id)) == 2

    assert client.get(f"/v1/tasks/{old_task['id']}", headers=auth(member)).status_code == 404
    assert client.get(f"/v1/tasks/{old_task['id']}", headers=auth(owner)).status_code == 200
    listed = client.get("/v1/tasks", params={"space_id": space_id}, headers=auth(member))
    assert listed.status_code == 200 and listed.json()["data"] == []
    assert client.post(path, headers=departure, json={}).status_code == 404
    assert client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(member), json={}).status_code == 404
    assert client.post(f"/v1/invitations/{fresh['id']}/accept", headers=auth(member), json={}).status_code == 200
    stale = client.post(f"/v1/spaces/{space_id}/members/{member_id}/remove",
                        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={})
    assert stale.status_code == 412, stale.text
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    current = next(row for row in roster if row["account_id"] == member_id)
    assert current["role"] == "member" and current["etag"] != reviewed["etag"]
    new_task = create_task(client, owner, space_id, member_id)
    assert new_task.status_code == 201, new_task.text
    assert client.get(f"/v1/tasks/{new_task.json()['data']['id']}", headers=auth(member)).status_code == 200
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, member_id)).status == "active"
        assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(
            SpaceAuditEvent.space_id == space_id, SpaceAuditEvent.action == "space.invitation_accepted")) == 2


def test_rejoin_still_requires_the_former_member_to_accept(client, app):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    member_id = member["user"]["id"]
    headers = {**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    assert client.post(f"/v1/spaces/{space_id}/members/{member_id}/remove", headers=headers, json={}).status_code == 200
    first = invite_account(client, owner, space_id, member_id).json()["data"]
    assert invite_account(client, owner, space_id, member_id).status_code == 409
    declined = client.post(f"/v1/invitations/{first['id']}/decline", headers=auth(member), json={})
    assert declined.status_code == 200, declined.text
    assert client.post(f"/v1/invitations/{first['id']}/accept", headers=auth(member), json={}).status_code == 409
    second = invite_account(client, owner, space_id, member_id).json()["data"]
    revoked = client.post(f"/v1/spaces/{space_id}/invitations/{second['id']}/revoke", headers=auth(owner), json={})
    assert revoked.status_code == 200, revoked.text
    assert client.post(f"/v1/invitations/{second['id']}/accept", headers=auth(member), json={}).status_code == 409
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).status_code == 404
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, member_id)).status == "removed"


def test_parallel_invitation_creation_and_acceptance_have_one_effect(client, app):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=3) as pool:
        created = list(pool.map(
            lambda _attempt: invite_account(client, owner, space_id, recipient["user"]["id"], key),
            range(3),
        ))
    assert [response.status_code for response in created] == [201, 201, 201]
    assert len({response.json()["data"]["id"] for response in created}) == 1
    identifier = created[0].json()["data"]["id"]
    with ThreadPoolExecutor(max_workers=3) as pool:
        accepted = list(pool.map(lambda _attempt: client.post(
            f"/v1/invitations/{identifier}/accept", headers=auth(recipient), json={}
        ), range(3)))
    assert [response.status_code for response in accepted] == [200, 200, 200]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceInvitation)) == 1
        assert database.scalar(select(func.count()).select_from(SpaceMembership)) == 2
        assert database.get(Space, space_id).version == 2
        for event_type in ("space.invitation_created", "space.invitation_accepted"):
            assert database.scalar(select(func.count()).select_from(OutboxEvent).where(
                OutboxEvent.event_type == event_type
            )) == 1


def test_different_request_keys_cannot_duplicate_a_pending_invitation(client, app):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(
            lambda _attempt: invite_account(client, owner, space_id, recipient["user"]["id"]),
            range(2),
        ))
    assert sorted(response.status_code for response in responses) == [201, 409]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceInvitation)) == 1


@pytest.mark.parametrize("other_action", ["revoke", "decline"])
def test_accept_races_with_terminal_action_without_partial_admission(client, app, other_action):
    owner, recipient, space_id, invitation = pending_invitation(client, app)
    accept_path = f"/v1/invitations/{invitation['id']}/accept"
    other_path = (
        f"/v1/spaces/{space_id}/invitations/{invitation['id']}/revoke"
        if other_action == "revoke" else f"/v1/invitations/{invitation['id']}/decline"
    )
    other_actor = owner if other_action == "revoke" else recipient
    with ThreadPoolExecutor(max_workers=2) as pool:
        accepted = pool.submit(client.post, accept_path, headers=auth(recipient), json={})
        stopped = pool.submit(client.post, other_path, headers=auth(other_actor), json={})
        statuses = (accepted.result().status_code, stopped.result().status_code)
    assert sorted(statuses) == [200, 409]
    with app.state.sessions() as database:
        invitation = database.get(SpaceInvitation, invitation["id"])
        membership = database.get(SpaceMembership, (space_id, recipient["user"]["id"]))
        assert (membership is not None) == (invitation.status == "accepted")
        if membership:
            assert membership.admission_id == invitation.accepted_admission_id
        else:
            assert invitation.status in ("declined", "revoked")


def test_distinct_invitations_compete_for_one_remaining_place(client, app, monkeypatch):
    owner, first, space_id, first_invitation = pending_invitation(client, app)
    second = account(client, app, "second@example.test")
    second_invitation = invite_account(client, owner, space_id, second["user"]["id"]).json()["data"]
    monkeypatch.setattr(spaces_service, "MAX_FAMILY_MEMBERS", 2)
    pairs = [(first, first_invitation), (second, second_invitation)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda pair: client.post(
            f"/v1/invitations/{pair[1]['id']}/accept", headers=auth(pair[0]), json={}
        ), pairs))
    assert sorted(response.status_code for response in outcomes) == [200, 409]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceMembership)) == 2
        assert database.scalar(select(func.count()).select_from(SpaceInvitation).where(
            SpaceInvitation.status == "accepted"
        )) == 1


def test_joined_spaces_count_toward_account_capacity(client, app, monkeypatch):
    _owner, recipient, _space_id, invitation = pending_invitation(client, app)
    assert create_space(client, recipient, "Recipient family").status_code == 201
    monkeypatch.setattr(spaces_service, "MAX_ACCOUNT_SPACES", 1)
    result = client.post(
        f"/v1/invitations/{invitation['id']}/accept", headers=auth(recipient), json={}
    )
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "SPACE_LIMIT_REACHED"
    assert create_space(client, recipient, "Another family").status_code == 409


@pytest.mark.parametrize("action", ["create", "accept", "decline", "revoke"])
def test_invitation_audit_failure_rolls_back_then_same_action_retries(client, app, action):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    key = str(uuid4())
    identifier = None
    if action != "create":
        identifier = invite_account(client, owner, space_id, recipient["user"]["id"], key).json()["data"]["id"]
    event_type = f"space.invitation_{dict(create='created', accept='accepted', decline='declined', revoke='revoked')[action]}"
    with app.state.engine.begin() as connection:
        connection.execute(text(
            "CREATE FUNCTION test_reject_invitation_event() RETURNS trigger LANGUAGE plpgsql "
            "AS $$ BEGIN RAISE EXCEPTION 'synthetic invitation audit failure'; END $$"
        ))
        connection.execute(text(
            "CREATE TRIGGER test_invitation_failure BEFORE INSERT ON domain_outbox "
            f"FOR EACH ROW WHEN (NEW.event_type = '{event_type}') "
            "EXECUTE FUNCTION test_reject_invitation_event()"
        ))

    def submit():
        if action == "create":
            return invite_account(client, owner, space_id, recipient["user"]["id"], key)
        path = (
            f"/v1/spaces/{space_id}/invitations/{identifier}/revoke" if action == "revoke"
            else f"/v1/invitations/{identifier}/{action}"
        )
        return client.post(path, headers=auth(owner if action == "revoke" else recipient), json={})

    try:
        failed = submit()
        assert failed.status_code == 503, failed.text
        with app.state.sessions() as database:
            assert database.scalar(select(func.count()).select_from(SpaceMembership)) == 1
            assert database.get(Space, space_id).version == 1
            assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(
                SpaceAuditEvent.action == event_type
            )) == 0
            if identifier:
                assert database.get(SpaceInvitation, identifier).status == "pending"
            else:
                assert database.scalar(select(func.count()).select_from(SpaceInvitation)) == 0
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER test_invitation_failure ON domain_outbox"))
            connection.execute(text("DROP FUNCTION test_reject_invitation_event()"))
    assert submit().status_code == (201 if action == "create" else 200)


def test_invitation_input_and_actions_cannot_override_authority(client, app):
    owner, recipient, space_id, invitation = pending_invitation(client, app)
    for extra in ({"role": "owner"}, {"expires_at": "2099-01-01"}, {"inviter_id": recipient["user"]["id"]}):
        denied = client.post(
            f"/v1/spaces/{space_id}/invitations",
            headers={**auth(owner), "Idempotency-Key": str(uuid4())},
            json={"recipient_account_id": recipient["user"]["id"], **extra},
        )
        assert denied.status_code == 422
    for action in ("accept", "decline"):
        assert client.post(
            f"/v1/invitations/{invitation['id']}/{action}",
            headers=auth(recipient), json={"role": "owner"},
        ).status_code == 422
    assert client.get("/v1/invitations").status_code == 401
    assert client.post(f"/v1/invitations/{invitation['id']}/accept", json={}).status_code == 401
    other_space = create_space(client, owner, "Other family").json()["data"]["id"]
    assert client.post(
        f"/v1/spaces/{other_space}/invitations/{invitation['id']}/revoke",
        headers=auth(owner), json={},
    ).status_code == 404
    for target in (str(uuid4()), owner["user"]["id"]):
        assert invite_account(client, owner, space_id, target).status_code == 409
    with app.state.sessions() as database:
        assert database.get(SpaceInvitation, invitation["id"]).status == "pending"


def test_invitation_lists_are_scoped_paged_and_private(client, app):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    outsider = account(client, app, "outsider@example.test")
    invitations = []
    for number in range(3):
        space_id = create_space(client, owner, f"Family {number}").json()["data"]["id"]
        invitations.append(invite_account(client, owner, space_id, recipient["user"]["id"]).json()["data"])
    response = client.get("/v1/invitations?limit=2", headers=auth(recipient))
    first = response.json()
    assert response.headers["cache-control"] == "no-store"
    assert len(first["data"]) == 2
    cursor = first["pagination"]["next_cursor"]
    second = client.get("/v1/invitations", params={"cursor": cursor, "limit": 2}, headers=auth(recipient)).json()
    assert len(second["data"]) == 1
    assert second["pagination"] == {"has_more": False, "next_cursor": None}
    assert {item["id"] for item in first["data"] + second["data"]} == {item["id"] for item in invitations}
    assert all(set(item) == {
        "id", "space_id", "space_name", "inviter_name", "recipient_account_id",
        "role", "status", "created_at", "expires_at",
    } for item in first["data"])
    assert client.get("/v1/invitations", params={"cursor": cursor}, headers=auth(outsider)).status_code == 400
    assert client.get("/v1/invitations?cursor=tampered", headers=auth(recipient)).status_code == 400
    assert client.get("/v1/invitations?limit=51", headers=auth(recipient)).status_code == 422
    wrong_kind = app.state.security.seal(json.dumps({
        "kind": "space_invitations", "account_id": recipient["user"]["id"],
        "space_id": None, "after_id": invitations[0]["id"],
        "expires_at": (app.state.clock.now + timedelta(minutes=15)).isoformat(),
    }))
    assert client.get("/v1/invitations", params={"cursor": wrong_kind}, headers=auth(recipient)).status_code == 400
    app.state.clock.now += timedelta(minutes=16)
    assert client.get("/v1/invitations", params={"cursor": cursor}, headers=auth(recipient)).status_code == 410


def test_invitation_retained_limit_preserves_existing_request_replay(client, app, monkeypatch):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    second = account(client, app, "second@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    monkeypatch.setattr(spaces_service, "MAX_SPACE_INVITATIONS", 1)
    key = str(uuid4())
    initial = invite_account(client, owner, space_id, recipient["user"]["id"], key)
    assert initial.status_code == 201
    assert invite_account(client, owner, space_id, second["user"]["id"]).status_code == 409
    assert invite_account(client, owner, space_id, recipient["user"]["id"], key).json()["data"] == initial.json()["data"]


def test_invitation_survives_restart_and_openapi_requires_session(app, client):
    _owner, recipient, _space_id, invitation = pending_invitation(client, app)
    restarted = create_app(app.state.settings, app.state.clock)
    with TestClient(restarted) as other:
        inbox = other.get("/v1/invitations", headers=auth(recipient))
        assert inbox.status_code == 200
        assert inbox.json()["data"][0]["id"] == invitation["id"]
        assert other.post(
            f"/v1/invitations/{invitation['id']}/accept", headers=auth(recipient), json={}
        ).status_code == 200
    schema = app.openapi()
    paths = [
        ("/v1/invitations", "get"), ("/v1/invitations/{invitation_id}/accept", "post"),
        ("/v1/invitations/{invitation_id}/decline", "post"),
        ("/v1/spaces/{space_id}/invitations", "get"), ("/v1/spaces/{space_id}/invitations", "post"),
        ("/v1/spaces/{space_id}/invitations/{invitation_id}/revoke", "post"),
    ]
    for path, method in paths:
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
    assert schema["components"]["schemas"]["CreateInvitation"]["additionalProperties"] is False
    assert schema["components"]["schemas"]["InvitationAction"]["additionalProperties"] is False
    assert "request_key" not in schema["components"]["schemas"]["InvitationView"]["properties"]


@pytest.mark.parametrize("action, expired, expected", [
    ("accept", "invitation", 410), ("accept", "session", 401), ("create", "session", 401),
])
def test_invitation_authority_is_rechecked_after_waiting_for_space(
    client, app, monkeypatch, action, expired, expected,
):
    owner = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    invitation_id = None
    if action == "accept":
        invitation_id = invite_account(client, owner, space_id, recipient["user"]["id"]).json()["data"]["id"]
        if expired == "invitation":
            with app.state.sessions.begin() as database:
                database.get(SpaceInvitation, invitation_id).expires_at = app.state.clock.now + timedelta(seconds=1)
    reached = Event()
    resume = Event()
    original = app.state.spaces.lock_space

    def paused_lock(database, identifier, active=True):
        reached.set()
        assert resume.wait(10), "Test did not release the Space lock boundary."
        return original(database, identifier, active)

    monkeypatch.setattr(app.state.spaces, "lock_space", paused_lock)
    with ThreadPoolExecutor(max_workers=1) as pool:
        if action == "accept":
            pending = pool.submit(
                client.post, f"/v1/invitations/{invitation_id}/accept", headers=auth(recipient), json={}
            )
        else:
            pending = pool.submit(invite_account, client, owner, space_id, recipient["user"]["id"])
        try:
            assert reached.wait(10), "Request did not reach the Space lock boundary."
            app.state.clock.now += timedelta(seconds=1) if expired == "invitation" else timedelta(hours=9)
        finally:
            resume.set()
        result = pending.result(timeout=10)
    assert result.status_code == expected, result.text
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, recipient["user"]["id"])) is None
        if invitation_id:
            assert database.get(SpaceInvitation, invitation_id).status == "pending"
        else:
            assert database.scalar(select(func.count()).select_from(SpaceInvitation)) == 0