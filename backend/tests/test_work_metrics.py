import re
from datetime import timedelta
from uuid import uuid4

from sqlalchemy.exc import OperationalError

from app.modules.identity.delivery import deliver_one
from app.modules.identity.models import AccountExport, IdentityMail
from app.modules.scheduling.models import Reminder
from tests.test_exports import request_export
from tests.test_identity import account, auth, begin
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


def test_metrics_still_answer_when_the_database_is_unreachable(client, app, monkeypatch):
    assert client.get("/health/live").status_code == 200

    def unreachable(*_arguments, **_options):
        raise OperationalError("SELECT 1", {}, OSError("database unreachable"))

    monkeypatch.setattr(app.state.engine, "connect", unreachable)
    values, text = scrape(client, app)
    assert values[("community_work_query_success", None)] == 0
    assert "community_work_ready" not in text
    assert 'community_http_requests_total{method="GET",route="/health/live",status="200"} 1' in text
