import json
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select

from app.modules.identity.exports import HISTORY_LIMIT
from app.modules.identity.models import AccountExport, SecurityEvent

from .test_identity import PASSWORD, account, auth
from .test_spaces import create_space, invite_account, membership_fixture
from .test_tasks import create_task

EVERYTHING = ["profile", "security", "spaces", "tasks", "reminders"]


def request_export(client, actor, categories=None, key=None):
    return client.post(
        "/v1/me/exports", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={"categories": categories or EVERYTHING},
    )


def sign_in(client, email="alex@example.test"):
    response = client.post("/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def ready_export(client, app, actor, categories=None):
    created = request_export(client, actor, categories)
    assert created.status_code == 202, created.text
    assert app.state.exports.process_one() == {"result": "ready"}
    return created.json()["data"]["id"]


def download(client, actor, export_id):
    return client.get(f"/v1/me/exports/{export_id}/archive", headers=auth(actor))


def test_export_needs_a_recent_sign_in_and_allows_one_live_request(client, app):
    person = account(client, app)
    app.state.clock.now += timedelta(minutes=16)
    stale = request_export(client, person)
    assert stale.status_code == 403 and stale.json()["error"]["code"] == "REAUTHENTICATION_REQUIRED"
    person = sign_in(client)
    key = str(uuid4())
    first = request_export(client, person, key=key)
    assert first.status_code == 202, first.text
    view = first.json()["data"]
    assert (view["status"], view["requested_here"], view["size_bytes"]) == ("queued", True, None)
    assert request_export(client, person, key=key).json()["data"] == view
    assert request_export(client, person, ["profile"], key=key).json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert request_export(client, person).json()["error"]["code"] == "EXPORT_IN_PROGRESS"
    assert client.get("/v1/me/exports", headers=auth(person)).json()["data"] == [view]


def test_archive_holds_only_the_requesters_own_and_visible_data(client, app):
    owner = account(client, app)
    member = account(client, app, "export-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    earlier = create_task(client, owner, space_id, title="Owner history before joining").json()["data"]
    invitation = invite_account(client, owner, space_id, member["user"]["id"]).json()["data"]
    assert client.post(f"/v1/invitations/{invitation['id']}/accept", headers=auth(member), json={}).status_code == 200
    shared = create_task(client, owner, space_id, title="Shared after joining").json()["data"]
    response = download(client, member, ready_export(client, app, member))
    assert response.status_code == 200, response.text
    archive = response.json()["data"]
    assert archive["account_id"] == member["user"]["id"]
    assert archive["omitted"] == []
    assert archive["profile"]["email"] == "export-member@example.test"
    assert [task["id"] for task in archive["tasks"]] == [shared["id"]]
    text = json.dumps(archive)
    assert earlier["id"] not in text and "Owner history before joining" not in text
    assert "alex@example.test" not in text


def test_archive_downloads_only_in_the_requesting_session_and_is_audited(client, app):
    person = account(client, app)
    other = account(client, app, "export-other@example.test")
    export_id = ready_export(client, app, person, ["profile"])
    second = sign_in(client)
    assert client.get(f"/v1/me/exports/{export_id}", headers=auth(second)).json()["data"]["requested_here"] is False
    elsewhere = download(client, second, export_id)
    assert elsewhere.status_code == 403 and elsewhere.json()["error"]["code"] == "EXPORT_OTHER_SESSION"
    for response in (
        download(client, other, export_id), client.get(f"/v1/me/exports/{export_id}", headers=auth(other)),
        client.delete(f"/v1/me/exports/{export_id}", headers=auth(other)),
    ):
        assert response.status_code == 404
    assert download(client, person, export_id).status_code == 200
    with app.state.sessions() as database:
        stored = database.get(AccountExport, export_id)
        assert (stored.status, stored.download_count) == ("ready", 1)
        assert "alex@example.test" not in stored.archive_cipher
        actions = set(database.scalars(select(SecurityEvent.action).where(SecurityEvent.target_id == export_id)))
        assert actions == {"account.export_requested", "account.export_downloaded"}


def test_archive_is_withdrawn_when_space_access_changes(client, app):
    owner, member, space_id, _invitation_id, reviewed = membership_fixture(client, app)
    assert create_task(client, owner, space_id).status_code == 201
    export_id = ready_export(client, app, member, ["spaces", "tasks"])
    left = client.post(
        f"/v1/spaces/{space_id}/leave",
        headers={**auth(member), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert left.status_code == 200, left.text
    outdated = download(client, member, export_id)
    assert outdated.status_code == 409 and outdated.json()["error"]["code"] == "EXPORT_OUTDATED"
    with app.state.sessions() as database:
        stored = database.get(AccountExport, export_id)
        assert (stored.status, stored.reason, stored.archive_cipher) == ("outdated", "access_changed", None)


def test_ended_sessions_cancel_exports_and_expired_archives_are_purged(client, app):
    person = account(client, app)
    ready_id = ready_export(client, app, person, ["profile"])
    queued_id = request_export(client, person, ["security"]).json()["data"]["id"]
    assert client.post("/v1/auth/logout", headers=auth(person)).status_code == 200
    assert app.state.exports.sweep() == {"expired": 0, "cancelled": 2}
    with app.state.sessions() as database:
        for identifier in (ready_id, queued_id):
            stored = database.get(AccountExport, identifier)
            assert (stored.status, stored.reason, stored.archive_cipher) == ("cancelled", "session_ended", None)
    person = sign_in(client)
    revoked_id = request_export(client, person, ["profile"]).json()["data"]["id"]
    assert client.post("/v1/auth/logout", headers=auth(person)).status_code == 200
    assert app.state.exports.process_one() == {"result": "cancelled"}
    person = sign_in(client)
    later_id = ready_export(client, app, person, ["profile"])
    app.state.clock.now += timedelta(hours=24, minutes=1)
    assert app.state.exports.sweep() == {"expired": 1, "cancelled": 0}
    with app.state.sessions() as database:
        assert database.get(AccountExport, revoked_id).status == "cancelled"
        stored = database.get(AccountExport, later_id)
        assert (stored.status, stored.archive_cipher) == ("expired", None)


def test_cancelled_export_is_never_built_or_downloaded(client, app):
    person = account(client, app)
    export_id = request_export(client, person, ["profile"]).json()["data"]["id"]
    cancelled = client.delete(f"/v1/me/exports/{export_id}", headers=auth(person))
    assert cancelled.status_code == 200 and cancelled.json()["data"]["status"] == "cancelled"
    assert app.state.exports.process_one() == {"result": "idle"}
    unavailable = download(client, person, export_id)
    assert unavailable.status_code == 409 and unavailable.json()["error"]["code"] == "EXPORT_UNAVAILABLE"


def test_a_history_longer_than_the_limit_says_what_was_left_out(client, app):
    person = account(client, app)
    account_id = person["user"]["id"]
    oldest = str(uuid4())
    with app.state.sessions.begin() as database:
        for index in range(HISTORY_LIMIT + 1):
            database.add(SecurityEvent(
                id=oldest if index == 0 else str(uuid4()), account_id=account_id, action="session.created",
                target_id=str(uuid4()), created_at=app.state.clock() - timedelta(days=30, seconds=HISTORY_LIMIT + 1 - index),
            ))
    export_id = ready_export(client, app, person, ["security"])
    # Requesting the export records one more event before the build; downloading records one after it.
    with app.state.sessions() as database:
        total = database.scalar(select(func.count()).select_from(SecurityEvent).where(SecurityEvent.account_id == account_id))
    archive = download(client, person, export_id).json()["data"]
    events = [event["id"] for event in archive["security"]["events"]]
    assert len(events) == HISTORY_LIMIT and oldest not in events
    assert archive["omitted"] == [{"section": "security.events", "included": HISTORY_LIMIT, "total": total, "kept": "newest"}]
    assert "at most 1,000 entries" in archive["notice"]
