from datetime import timedelta
from uuid import uuid4

from sqlalchemy import text

from app.modules.scheduling.models import Reminder
from tests.test_identity import account, auth
from tests.test_reminder_delivery_guards import preview_reminder
from tests.test_spaces import create_space
from tests.test_tasks import create_task


def due_reminders(client, app, email, local_times):
    person = account(client, app, email)
    space_id = create_space(client, person).json()["data"]["id"]
    identifiers = []
    for local_time in local_times:
        task = create_task(client, person, space_id, person["user"]["id"])
        assert task.status_code == 201, task.text
        preview = preview_reminder(client, person, task.json()["data"]["id"], local_time)
        assert preview.status_code == 200, preview.text
        created = client.post(
            "/v1/reminders", headers={**auth(person), "Idempotency-Key": str(uuid4())},
            json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]},
        )
        assert created.status_code == 201, created.text
        identifiers.append(created.json()["data"]["id"])
    return person, identifiers


def statuses(app, identifiers):
    with app.state.sessions() as database:
        return [database.get(Reminder, identifier).status for identifier in identifiers]


def test_a_locked_account_does_not_hold_back_other_accounts_reminders(client, app):
    busy, waiting = due_reminders(
        client, app, "busy@example.test", ["2026-09-19T15:31:00", "2026-09-19T15:32:00", "2026-09-19T15:33:00"],
    )
    _free, ready = due_reminders(client, app, "free@example.test", ["2026-09-19T15:34:00"])
    app.state.clock.now += timedelta(minutes=5)
    with app.state.engine.connect() as holder:
        held = holder.begin()
        holder.execute(text("SELECT 1 FROM users WHERE id = :id FOR UPDATE"), {"id": busy["user"]["id"]})
        try:
            # The three oldest reminders belong to the locked account; with a batch of two they used to fill every pass.
            assert app.state.reminders.dispatch_due(limit=2) == {"busy": 1, "available": 1}
        finally:
            held.rollback()
    assert statuses(app, ready) == ["available"]
    assert statuses(app, waiting) == ["scheduled"] * 3
    assert app.state.reminders.dispatch_due(limit=2) == {"available": 2}
    assert statuses(app, waiting) == ["available", "available", "scheduled"]
    assert app.state.reminders.dispatch_due(limit=2) == {"available": 1}
    assert app.state.reminders.dispatch_due(limit=2) == {}
