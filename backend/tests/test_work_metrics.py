import re
from datetime import timedelta
from uuid import uuid4

from sqlalchemy.exc import OperationalError

from app.modules.community.models import PublicPage
from app.modules.identity.delivery import deliver_one
from app.modules.identity.models import AccountExport, IdentityMail, User
from app.modules.scheduling.models import Reminder
from app.modules.spaces.models import Space, SpaceMembership
from tests.test_account_deletion import request_deletion
from tests.test_community import create_page
from tests.test_exports import request_export
from tests.test_identity import PASSWORD, account, auth, begin
from tests.test_messaging import admit
from tests.test_page_lifecycle import archive, delete, restore
from tests.test_reminder_delivery_guards import preview_reminder
from tests.test_spaces import create_space
from tests.test_tasks import create_task

KEY = "synthetic-metrics-key"
LINE = re.compile(r'(community_work_\w+)(?:\{queue="(\w+)"\})? (\S+)')


def scrape(client, app):
    app.state.settings.metrics_key = KEY
    response = client.get("/metrics", headers={"Authorization": f"Bearer {KEY}"})
    assert response.status_code == 200, response.text
    values = {(match[1], match[2]): float(match[3]) for match in map(LINE.fullmatch, response.text.splitlines()) if match}
    return values, response.text


def gauges(client, app, queue):
    values, _text = scrape(client, app)
    assert values[("community_work_query_success", None)] == 1
    return tuple(values[(name, queue)] for name in ("community_work_ready", "community_work_ready_oldest_seconds", "community_work_failed"))


def test_sign_in_mail_gauges_match_what_the_worker_sends(client, app):
    clock = app.state.clock
    proofs = [begin(client, app, f"{name}@example.test") for name in ("first", "second", "later")]
    with app.state.sessions.begin() as database:
        database.get(IdentityMail, proofs[2]["challenge_id"]).available_at = clock.now + timedelta(seconds=30)
    clock.now += timedelta(seconds=20)
    values, text = scrape(client, app)
    assert (values[("community_work_ready", "identity_mail")], values[("community_work_ready_oldest_seconds", "identity_mail")]) == (2, 20.0)
    assert "@" not in text and not any(proof["challenge_id"] in text for proof in proofs)
    sent = []
    while deliver_one(app.state.identity, sent.append) != "idle":
        pass
    assert len(sent) == 2
    assert gauges(client, app, "identity_mail") == (0, 0.0, 0)

    clock.now += timedelta(seconds=40)
    assert gauges(client, app, "identity_mail") == (1, 30.0, 0)

    def unavailable(_payload):
        raise OSError("Synthetic SMTP outage")

    for _attempt in range(3):
        deliver_one(app.state.identity, unavailable)
        clock.now += timedelta(seconds=31)
    assert gauges(client, app, "identity_mail") == (0, 0.0, 1)


def test_reminder_gauges_follow_due_times_retries_and_failures(client, app):
    clock = app.state.clock
    actor = account(client, app)
    space_id = create_space(client, actor).json()["data"]["id"]
    identifiers = []
    for title in ("Water the plants", "Call the plumber", "Pay the bill"):
        task = create_task(client, actor, space_id, actor["user"]["id"], title=title)
        assert task.status_code == 201, task.text
        preview = preview_reminder(client, actor, task.json()["data"]["id"])
        assert preview.status_code == 200, preview.text
        created = client.post(
            "/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())},
            json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]},
        )
        assert created.status_code == 201, created.text
        identifiers.append(created.json()["data"]["id"])
    first, backed_off, failing = identifiers
    with app.state.sessions() as database:
        due = database.get(Reminder, first).scheduled_at
    assert gauges(client, app, "reminders") == (0, 0.0, 0)
    clock.now = due + timedelta(minutes=4)
    assert gauges(client, app, "reminders") == (3, 240.0, 0)

    for _attempt in range(5):
        clock.now += timedelta(seconds=301)
        app.state.reminders.record_dispatch_failure(failing)
    retry_at = clock.now + timedelta(seconds=60)
    with app.state.sessions.begin() as database:
        database.get(Reminder, backed_off).next_attempt_at = retry_at
    waited = (clock.now - due).total_seconds()
    assert gauges(client, app, "reminders") == (1, waited, 1)
    assert sum(app.state.reminders.dispatch_due(limit=100).values()) == 1
    assert gauges(client, app, "reminders") == (0, 0.0, 1)

    clock.now = retry_at + timedelta(seconds=30)
    assert gauges(client, app, "reminders") == (1, 30.0, 1)
    assert sum(app.state.reminders.dispatch_due(limit=100).values()) == 1
    assert gauges(client, app, "reminders") == (0, 0.0, 1)


def test_export_gauges_count_queued_and_abandoned_builds_and_failures(client, app):
    clock = app.state.clock
    people = [account(client, app, f"export-{number}@example.test") for number in range(3)]
    queued = [request_export(client, person) for person in people]
    assert all(response.status_code == 202 for response in queued)
    abandoned, exhausted = (response.json()["data"]["id"] for response in queued[1:])
    with app.state.sessions.begin() as database:
        building = database.get(AccountExport, abandoned)
        building.status, building.attempts, building.lease_token = "building", 1, str(uuid4())
        # A later queue position makes the worker take the queued export first.
        building.available_at = clock.now + timedelta(seconds=1)
        building.lease_expires_at = clock.now + timedelta(seconds=15)
        database.get(AccountExport, exhausted).available_at = clock.now + timedelta(hours=1)
    clock.now += timedelta(seconds=30)
    assert gauges(client, app, "exports") == (2, 30.0, 0)
    assert app.state.exports.process_one() == {"result": "ready"}
    assert gauges(client, app, "exports") == (1, 15.0, 0)
    assert app.state.exports.process_one() == {"result": "ready"}
    assert gauges(client, app, "exports") == (0, 0.0, 0)

    with app.state.sessions.begin() as database:
        database.get(AccountExport, exhausted).attempts = 3
    clock.now += timedelta(hours=1)
    assert gauges(client, app, "exports") == (1, 30.0, 0)
    assert app.state.exports.process_one() == {"result": "failed"}
    assert gauges(client, app, "exports") == (0, 0.0, 1)


def test_purge_queues_report_empty_backlogs_without_inventing_failure_counts(client, app):
    values, _text = scrape(client, app)
    assert values[("community_work_query_success", None)] == 1
    for queue in ("account_deletion", "page_deletion"):
        assert values[("community_work_ready", queue)] == 0
        assert values[("community_work_ready_oldest_seconds", queue)] == 0
        assert ("community_work_failed", queue) not in values
    assert values[("community_work_blocked", "account_deletion")] == 0
    assert values[("community_work_blocked_oldest_seconds", "account_deletion")] == 0
    assert ("community_work_blocked", "page_deletion") not in values


def test_account_purge_gauges_follow_grace_cancellation_and_completed_work(client, app):
    clock = app.state.clock
    people = [account(client, app, f"purge-{number}@example.test") for number in range(3)]
    due, later, cancelled = people
    assert request_deletion(client, due).status_code == 202
    assert request_deletion(client, cancelled).status_code == 202
    cancelled_response = client.post("/v1/auth/cancel-deletion", json={"email": "purge-2@example.test", "password": PASSWORD})
    assert cancelled_response.status_code == 200, cancelled_response.text
    with app.state.sessions() as database:
        due_at = database.get(User, due["user"]["id"]).purge_after
    clock.now += timedelta(seconds=60)
    assert request_deletion(client, later).status_code == 202
    clock.now = due_at - timedelta(seconds=1)
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 0
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 0

    clock.now = due_at
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 0
    clock.now += timedelta(seconds=30)
    values, text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 30
    assert values[("community_work_blocked", "account_deletion")] == 0
    assert "@" not in text and all(person["user"]["id"] not in text for person in people)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 0
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 0

    clock.now = due_at + timedelta(seconds=70)
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 10
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 0
    assert ("community_work_failed", "account_deletion") not in values
    with app.state.sessions() as database:
        assert database.get(User, cancelled["user"]["id"]).status == "active"


def test_account_purge_gauges_count_blocked_accounts_once_and_match_the_worker(client, app):
    clock = app.state.clock
    blocked = account(client, app, "blocked@example.test")
    host = account(client, app, "host@example.test")
    ready = account(client, app, "ready@example.test")
    spaces = [create_space(client, host, name=f"Private shared Space {number}").json()["data"]["id"] for number in range(2)]
    for space_id in spaces:
        admit(client, host, space_id, blocked)
    assert request_deletion(client, blocked).status_code == 202
    assert request_deletion(client, ready).status_code == 202
    with app.state.sessions.begin() as database:
        due_at = database.get(User, blocked["user"]["id"]).purge_after
        for space_id in spaces:
            database.get(SpaceMembership, (space_id, host["user"]["id"])).role = "member"
            database.flush()
            database.get(SpaceMembership, (space_id, blocked["user"]["id"])).role = "owner"
            database.flush()
        assert len(app.state.account_deletion.owned_shared_spaces(database, blocked["user"]["id"])) == 2

    clock.now = due_at - timedelta(seconds=1)
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 0
    assert values[("community_work_blocked", "account_deletion")] == 0
    clock.now = due_at + timedelta(seconds=90)
    values, text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 90
    assert values[("community_work_blocked", "account_deletion")] == 1
    assert values[("community_work_blocked_oldest_seconds", "account_deletion")] == 90
    assert "Private shared Space" not in text and all(space_id not in text for space_id in spaces)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 1}
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 0
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 0
    assert values[("community_work_blocked", "account_deletion")] == 1

    with app.state.sessions.begin() as database:
        database.get(Space, spaces[0]).status = "archived"
    assert scrape(client, app)[0][("community_work_blocked", "account_deletion")] == 1
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (spaces[1], host["user"]["id"])).status = "removed"
        assert app.state.account_deletion.owned_shared_spaces(database, blocked["user"]["id"]) == []
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "account_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "account_deletion")] == 90
    assert values[("community_work_blocked", "account_deletion")] == 0
    assert values[("community_work_blocked_oldest_seconds", "account_deletion")] == 0
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    assert scrape(client, app)[0][("community_work_ready", "account_deletion")] == 0


def test_page_purge_gauges_follow_due_dates_restoration_and_purge_completion(client, app):
    clock = app.state.clock
    owner = account(client, app)
    pages = [create_page(client, owner, handle=f"purge-page-{number}", name=f"Synthetic private page {number}").json()["data"] for number in range(5)]
    due, later, restored, archived, active = pages
    assert delete(client, owner, due, etag=due["etag"]).status_code == 200
    deleted = delete(client, owner, restored, etag=restored["etag"])
    assert deleted.status_code == 200, deleted.text
    assert restore(client, owner, restored, etag=deleted.json()["data"]["etag"]).status_code == 200
    assert archive(client, owner, archived, etag=archived["etag"]).status_code == 200
    with app.state.sessions() as database:
        due_at = database.get(PublicPage, due["id"]).purge_after
    clock.now += timedelta(seconds=30)
    assert delete(client, owner, later, etag=later["etag"]).status_code == 200
    clock.now = due_at - timedelta(seconds=1)
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "page_deletion")] == 0
    assert values[("community_work_ready_oldest_seconds", "page_deletion")] == 0

    clock.now = due_at
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "page_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "page_deletion")] == 0
    clock.now += timedelta(seconds=5)
    values, text = scrape(client, app)
    assert values[("community_work_ready", "page_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "page_deletion")] == 5
    assert "Synthetic private page" not in text and all(page["id"] not in text and page["handle"] not in text for page in pages)
    assert app.state.page_lifecycle.purge_due() == {"purged": 1}
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "page_deletion")] == 0
    assert values[("community_work_ready_oldest_seconds", "page_deletion")] == 0
    clock.now = due_at + timedelta(seconds=50)
    values, _text = scrape(client, app)
    assert values[("community_work_ready", "page_deletion")] == 1
    assert values[("community_work_ready_oldest_seconds", "page_deletion")] == 20
    assert app.state.page_lifecycle.purge_due() == {"purged": 1}
    assert scrape(client, app)[0][("community_work_ready", "page_deletion")] == 0
    with app.state.sessions() as database:
        assert database.get(PublicPage, active["id"]).status == "active"
        assert database.get(PublicPage, restored["id"]).status == "active"
        assert database.get(PublicPage, archived["id"]).status == "read_only"


def test_metrics_still_answer_when_the_database_is_unreachable(client, app, monkeypatch):
    assert client.get("/health/live").status_code == 200

    def unreachable(*_arguments, **_options):
        raise OperationalError("SELECT 1", {}, OSError("database unreachable"))

    monkeypatch.setattr(app.state.engine, "connect", unreachable)
    values, text = scrape(client, app)
    assert values[("community_work_query_success", None)] == 0
    assert "community_work_ready" not in text
    assert "community_work_blocked" not in text
    assert "community_work_failed" not in text
    assert 'community_http_requests_total{method="GET",route="/health/live",status="200"} 1' in text
