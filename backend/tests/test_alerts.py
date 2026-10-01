from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import delete, select

from app.modules.identity.models import OutboxEvent
from app.modules.planning.models import TaskAccess
from app.modules.scheduling.models import ReminderEvent
from tests.test_care import care_day, create_instruction, report, sign_in, stop
from tests.test_events import create as create_event
from tests.test_events import event_body
from tests.test_exports import download, ready_export
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, family
from tests.test_migrations import test_migrated_schema_matches_models
from tests.test_reminder_delivery_guards import preview_reminder, reminder_source
from tests.test_reminder_series import at, create_series, occurrences, series_body
from tests.test_spaces import create_space
from tests.test_tasks import create_task


def feed(client, actor):
    response = client.get("/v1/me/alerts", headers=auth(actor))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def kinds(client, actor):
    return [(item["kind"], item["title"]) for item in feed(client, actor)["items"]]


def dismiss(client, actor, item):
    return client.post("/v1/me/alerts/dismiss", headers=auth(actor), json={"kind": item["kind"], "reference": item["reference"]})


def move(client, actor, series, local_time, key=None, etag=None):
    headers = {**auth(actor), "Idempotency-Key": key or str(uuid4())}
    if etag is not False:
        headers["If-Match"] = etag or series["etag"]
    return client.post(f"/v1/reminder-series/{series['id']}/move", headers=headers, json={"local_time": local_time})


def replace(client, actor, series, preview_token, key=None, etag=None):
    headers = {**auth(actor), "Idempotency-Key": key or str(uuid4())}
    if etag is not False:
        headers["If-Match"] = etag or series["etag"]
    return client.post(f"/v1/reminder-series/{series['id']}/replace", headers=headers, json={"preview_token": preview_token})


def preview_token(client, actor, body):
    response = client.post("/v1/reminder-series/preview", headers=auth(actor), json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]["preview_token"]


def schedule(client, actor, task_id, local_time):
    preview = preview_reminder(client, actor, task_id, local_time)
    assert preview.status_code == 200, preview.text
    saved = client.post("/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())},
                        json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]})
    assert saved.status_code == 201, saved.text
    return saved.json()["data"]


def ask_backup(client, owner, task_id, contact, wait=15, key=None):
    return client.post(
        "/v1/reminder-backups", headers={**auth(owner), "Idempotency-Key": key or str(uuid4())},
        json={"task_id": task_id, "contact_account_id": contact["user"]["id"], "wait_minutes": wait},
    )


def backup_action(client, actor, backup, action):
    return client.post(f"/v1/reminder-backups/{backup['id']}/{action}", headers=auth(actor), json={})


def inbox_id(client, actor, reminder_id):
    rows = client.get("/v1/notifications", headers=auth(actor)).json()["data"]
    return next(row["id"] for row in rows if row["reminder_id"] == reminder_id)


def test_calendar_shows_space_events_from_the_current_admission_with_their_status(client, app):
    owner = account(client, app)
    member = account(client, app, "chat-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    create_event(client, owner, space_id, title="Before joining")
    admit(client, owner, space_id, member)
    advance(app, minutes=1)
    picnic = create_event(client, owner, space_id, title="Picnic", local_start="2026-09-25T10:00", local_end=None).json()["data"]
    movie = create_event(client, owner, space_id, title="Movie night", local_start="2026-09-26T19:00", local_end=None).json()["data"]
    cancelled = client.post(f"/v1/events/{movie['id']}/cancel", headers={**auth(owner), "If-Match": movie["etag"]}, json={})
    assert cancelled.status_code == 200, cancelled.text
    query = {"space_id": space_id, "start_date": "2026-09-20", "end_date": "2026-09-30", "timezone": "Asia/Kolkata"}
    rows = client.get("/v1/calendar", params=query, headers=auth(member)).json()["data"]
    assert [(row["kind"], row["id"], row["status"], row["task_id"]) for row in rows] == [
        ("event", picnic["id"], "scheduled", None), ("event", movie["id"], "cancelled", None),
    ]
    assert (rows[0]["date"], rows[0]["scheduled_at"], rows[0]["timezone"], rows[0]["title"]) == (
        "2026-09-25", "2026-09-25T04:30:00Z", "Asia/Kolkata", "Picnic",
    )
    # The owner joined first, so it also sees the earlier event. Events and reminders share one order and one cursor.
    task_id = create_task(client, owner, space_id, due_date="2026-09-25").json()["data"]["id"]
    schedule(client, owner, task_id, "2026-09-25T12:00")
    seen, cursor = [], None
    for _page in range(6):
        page = client.get("/v1/calendar", params={**query, "limit": 1, **({"cursor": cursor} if cursor else {})}, headers=auth(owner))
        assert page.status_code == 200, page.text
        seen.extend((row["kind"], row["title"]) for row in page.json()["data"])
        cursor = page.json()["pagination"]["next_cursor"]
        if cursor is None:
            break
    assert seen == [
        ("task", "Buy groceries"), ("event", "Picnic"), ("reminder", "Buy groceries"),
        ("event", "Before joining"), ("event", "Movie night"),
    ]


def test_moving_the_next_time_keeps_the_rule_and_delivers_once_at_the_new_time(client, app):
    actor, task_id = reminder_source(client, app)
    series = create_series(client, actor, task_id)[1].json()["data"]
    assert series["next_occurrence"]["scheduled_at"] == "2026-09-19T10:30:00Z"
    assert move(client, actor, series, "2026-09-19T18:15", etag=False).json()["error"]["code"] == "PRECONDITION_REQUIRED"
    assert move(client, actor, series, "2026-09-19T18:15", etag='"stale"').json()["error"]["code"] == "PRECONDITION_FAILED"
    for local_time, code in (
        ("2026-09-20T18:15", "MOVE_DAY_INVALID"), ("2026-09-19T15:00", "REMINDER_TIME_INVALID"),
        ("2026-09-19T16:00", "MOVE_UNCHANGED"), ("2026-09-19 18:15", "VALIDATION_ERROR"),
    ):
        refused = move(client, actor, series, local_time)
        assert refused.json()["error"]["code"] == code, refused.text
    key = str(uuid4())
    moved = move(client, actor, series, "2026-09-19T18:15", key)
    assert moved.status_code == 200, moved.text
    view = moved.json()["data"]
    assert (view["local_time"], view["next_occurrence"]["display_time"], view["next_occurrence"]["adjustment"]) == ("16:00", "18:15", "moved")
    assert view["next_occurrence"]["scheduled_at"] == "2026-09-19T12:45:00Z"
    assert moved.headers["ETag"] == view["etag"] != series["etag"]
    assert move(client, actor, series, "2026-09-19T18:15", key).json()["data"]["id"] == view["id"]
    assert move(client, actor, series, "2026-09-19T19:00", key).json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    app.state.clock.now = at(19, 10, 31)
    assert app.state.reminders.dispatch_due() == {}
    app.state.clock.now = at(19, 12, 46)
    assert app.state.reminders.dispatch_due() == {"available": 1}
    # Delivery clears the reason as it does for every reminder; the move stays in the reminder's history.
    assert occurrences(app, view["id"]) == [("2026-09-19", "available", None), ("2026-09-20", "scheduled", None)]
    with app.state.sessions() as database:
        assert database.scalar(select(ReminderEvent.action).where(ReminderEvent.action == "reminder.moved")) == "reminder.moved"
    current = client.get(f"/v1/reminder-series/{view['id']}", headers=auth(actor)).json()["data"]
    assert (current["next_occurrence"]["scheduled_at"], current["next_occurrence"]["adjustment"]) == ("2026-09-20T10:30:00Z", "none")


def test_changing_a_repeating_reminder_replaces_it_in_one_step(client, app):
    actor, task_id = reminder_source(client, app)
    old = create_series(client, actor, task_id)[1].json()["data"]
    token = preview_token(client, actor, series_body(task_id, local_time="18:00", replaces_series_id=old["id"]))
    second = client.post("/v1/reminder-series", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"preview_token": token})
    assert second.json()["error"]["code"] == "PREVIEW_INVALID"
    unrelated = preview_token(client, actor, series_body(task_id, local_time="18:00"))
    assert replace(client, actor, old, unrelated).json()["error"]["code"] == "PREVIEW_INVALID"
    assert replace(client, actor, old, token, etag=False).json()["error"]["code"] == "PRECONDITION_REQUIRED"
    key = str(uuid4())
    replaced = replace(client, actor, old, token, key)
    assert replaced.status_code == 200, replaced.text
    new = replaced.json()["data"]
    assert new["id"] != old["id"] and new["status"] == "active" and new["replaced_by"] is None
    assert (new["local_time"], new["next_occurrence"]["scheduled_at"]) == ("18:00", "2026-09-19T12:30:00Z")
    assert replace(client, actor, old, token, key).json()["data"]["id"] == new["id"]
    earlier = client.get(f"/v1/reminder-series/{old['id']}", headers=auth(actor)).json()["data"]
    assert (earlier["status"], earlier["replaced_by"], earlier["next_occurrence"]) == ("cancelled", new["id"], None)
    assert occurrences(app, old["id"]) == [("2026-09-19", "cancelled", "series_replaced")]
    assert occurrences(app, new["id"]) == [("2026-09-19", "scheduled", None)]
    again = client.post("/v1/reminder-series/preview", headers=auth(actor), json=series_body(task_id, replaces_series_id=old["id"]))
    assert again.json()["error"]["code"] == "SERIES_ENDED"
    # A preview made before another change cannot overwrite it.
    stale = preview_token(client, actor, series_body(task_id, local_time="19:00", replaces_series_id=new["id"]))
    moved = move(client, actor, new, "2026-09-19T18:30")
    assert moved.status_code == 200, moved.text
    assert replace(client, actor, moved.json()["data"], stale).json()["error"]["code"] == "SERIES_CHANGED"
    with app.state.sessions() as database:
        assert database.scalar(select(OutboxEvent.event_type).where(OutboxEvent.event_type == "reminder_series.replaced")) is not None


def test_quiet_hours_need_a_reviewed_version_and_report_when_they_end(client, app):
    person = account(client, app)
    initial = client.get("/v1/me/quiet-hours", headers=auth(person))
    assert initial.status_code == 200, initial.text
    assert initial.json()["data"] == {
        "start": None, "end": None, "timezone": "Asia/Kolkata", "quiet": {"active": False, "until": None}, "version": "0",
    }
    etag = initial.headers["ETag"]
    body = {"start": "22:00", "end": "16:00"}
    assert client.patch("/v1/me/quiet-hours", headers=auth(person), json=body).json()["error"]["code"] == "PRECONDITION_REQUIRED"
    assert client.patch("/v1/me/quiet-hours", headers={**auth(person), "If-Match": '"x"'}, json=body).json()["error"]["code"] == "PRECONDITION_FAILED"
    for invalid in ({"start": "22:00"}, {"start": "22:00", "end": None}, {"start": "07:00", "end": "07:00"}, {"start": "7:00", "end": "08:00"}):
        assert client.patch("/v1/me/quiet-hours", headers={**auth(person), "If-Match": etag}, json=invalid).status_code == 422
    saved = client.patch("/v1/me/quiet-hours", headers={**auth(person), "If-Match": etag}, json=body)
    assert saved.status_code == 200, saved.text
    # 10:00 UTC is 15:30 in Kolkata: inside the overnight span that ends at 16:00 local time.
    assert saved.json()["data"]["quiet"] == {"active": True, "until": "2026-09-19T10:30:00Z"}
    assert saved.headers["ETag"] != etag
    assert feed(client, person)["quiet"] == {"active": True, "until": "2026-09-19T10:30:00Z"}
    assert feed(client, person)["next_check_at"] == "2026-09-19T10:30:00Z"
    app.state.clock.now = at(19, 10, 31)
    assert feed(client, person)["quiet"] == {"active": False, "until": None}
    cleared = client.patch("/v1/me/quiet-hours", headers={**auth(person), "If-Match": saved.headers["ETag"]}, json={"start": None, "end": None})
    assert (cleared.json()["data"]["start"], cleared.json()["data"]["version"]) == (None, "2")


def test_a_backup_person_agrees_first_and_is_alerted_only_when_a_reminder_goes_unanswered(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    task_id = create_task(client, owner, space_id).json()["data"]["id"]
    contacts = client.get("/v1/reminder-backups/contacts", params={"task_id": task_id}, headers=auth(owner))
    assert [person["account_id"] for person in contacts.json()["data"]] == [member["user"]["id"]]
    assert ask_backup(client, owner, task_id, owner).json()["error"]["code"] == "BACKUP_SELF"
    assert ask_backup(client, owner, task_id, outsider).json()["error"]["code"] == "BACKUP_CONTACT_INVALID"
    assert ask_backup(client, owner, task_id, member, wait=20).status_code == 422
    key = str(uuid4())
    asked = ask_backup(client, owner, task_id, member, key=key)
    assert asked.status_code == 201, asked.text
    backup = asked.json()["data"]
    assert (backup["status"], backup["role"], backup["contact"]["account_id"]) == ("pending", "owner", member["user"]["id"])
    assert ask_backup(client, owner, task_id, member, key=key).json()["data"]["id"] == backup["id"]
    assert ask_backup(client, owner, task_id, member, wait=30, key=key).json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert ask_backup(client, owner, task_id, member).json()["error"]["code"] == "BACKUP_EXISTS"
    requests = client.get("/v1/reminder-backups", params={"role": "contact"}, headers=auth(member)).json()["data"]
    assert [(item["id"], item["role"], item["status"]) for item in requests] == [(backup["id"], "contact", "pending")]
    assert backup_action(client, owner, backup, "accept").json()["error"]["code"] == "ACCESS_DENIED"
    accepted = backup_action(client, member, backup, "accept")
    assert accepted.json()["data"]["status"] == "active", accepted.text
    assert backup_action(client, member, backup, "accept").json()["data"]["status"] == "active"
    schedule(client, owner, task_id, "2026-09-19T15:31")
    # Nothing is due yet; the contact's device should look again when the wait after the reminder ends.
    assert feed(client, member) == {**feed(client, member), "items": [], "next_check_at": "2026-09-19T10:17:00Z"}
    app.state.clock.now = at(19, 10, 1, 30)
    assert app.state.reminders.dispatch_due() == {"available": 1}
    app.state.clock.now = at(19, 10, 10)
    assert kinds(client, member) == []
    assert kinds(client, owner) == [("reminder", "Buy groceries")]
    app.state.clock.now = at(19, 10, 17)
    alert = feed(client, member)["items"][0]
    assert (alert["kind"], alert["title"], alert["person_name"], alert["due_at"]) == ("backup", "Buy groceries", "Alex Morgan", "2026-09-19T10:16:30Z")
    assert dismiss(client, member, alert).status_code == 200
    assert kinds(client, member) == []
    # A snoozed reminder was answered. Its follow-up starts a new wait when it arrives.
    second = schedule(client, owner, task_id, "2026-09-19T16:00")
    app.state.clock.now = at(19, 10, 31)
    assert app.state.reminders.dispatch_due() == {"available": 1}
    snoozed = client.post(f"/v1/notifications/{inbox_id(client, owner, second['id'])}/snooze",
                          headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={"minutes": 10})
    assert snoozed.status_code == 200, snoozed.text
    app.state.clock.now = at(19, 10, 50)
    assert kinds(client, member) == []
    assert app.state.reminders.dispatch_due() == {"available": 1}
    app.state.clock.now = at(19, 11, 6)
    assert kinds(client, member) == [("backup", "Buy groceries")]
    follow_up = next(row for row in client.get("/v1/notifications", headers=auth(owner)).json()["data"] if row["snooze_count"] == 1)
    assert client.post(f"/v1/notifications/{follow_up['id']}/acknowledge", headers=auth(owner), json={}).status_code == 200
    assert kinds(client, member) == []
    # Losing access to the task hides the arrangement and its alerts.
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id, TaskAccess.account_id == member["user"]["id"]))
    assert client.get("/v1/reminder-backups", params={"role": "contact"}, headers=auth(member)).json()["data"] == []
    assert backup_action(client, member, backup, "cancel").status_code == 404
    cancelled = backup_action(client, owner, backup, "cancel")
    assert (cancelled.json()["data"]["status"], cancelled.json()["data"]["ended_at"]) == ("cancelled", "2026-09-19T11:06:00Z")


def test_backup_requests_can_be_declined_or_stopped_by_the_person_asked(client, app):
    owner, member, space_id = family(client, app)
    task_id = create_task(client, owner, space_id).json()["data"]["id"]
    declined = ask_backup(client, owner, task_id, member).json()["data"]
    assert backup_action(client, member, declined, "cancel").json()["error"]["code"] == "BACKUP_NOT_ACTIVE"
    assert backup_action(client, member, declined, "decline").json()["data"]["status"] == "declined"
    assert backup_action(client, member, declined, "accept").json()["error"]["code"] == "BACKUP_NOT_PENDING"
    active = ask_backup(client, owner, task_id, member, wait=60).json()["data"]
    assert backup_action(client, member, active, "accept").json()["data"]["status"] == "active"
    ended = backup_action(client, member, active, "cancel").json()["data"]
    assert (ended["status"], ended["role"]) == ("ended", "contact")
    owned = client.get("/v1/reminder-backups", params={"role": "owner", "limit": 1}, headers=auth(owner)).json()
    assert owned["pagination"]["has_more"] is True
    rest = client.get("/v1/reminder-backups", params={"role": "owner", "cursor": owned["pagination"]["next_cursor"]}, headers=auth(owner))
    assert sorted(item["id"] for item in owned["data"] + rest.json()["data"]) == sorted([declined["id"], active["id"]])
    assert client.get("/v1/reminder-backups", params={"role": "contact", "cursor": owned["pagination"]["next_cursor"]},
                      headers=auth(owner)).json()["error"]["code"] == "CURSOR_INVALID"


def test_event_alerts_follow_the_event_and_end_when_it_is_cancelled(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    advance(app, minutes=1)
    event = create_event(client, owner, space_id, title="Doctor visit", local_start="2026-09-19T17:00", local_end=None).json()["data"]
    alert_url = f"/v1/events/{event['id']}/alert"
    assert client.get(alert_url, headers=auth(member)).json()["data"] == {"event_id": event["id"], "minutes_before": None}
    assert client.post(alert_url, headers=auth(member), json={"minutes_before": 15}).status_code == 422
    assert client.post(alert_url, headers=auth(outsider), json={"minutes_before": 30}).status_code == 404
    saved = client.post(alert_url, headers=auth(member), json={"minutes_before": 30})
    assert saved.json()["data"]["minutes_before"] == 30, saved.text
    assert feed(client, member)["next_check_at"] == "2026-09-19T11:00:00Z"
    app.state.clock.now = at(19, 11)
    item = feed(client, member)["items"][0]
    assert (item["kind"], item["title"], item["display_time"], item["ends_at"]) == ("event", "Doctor visit", "17:00", "2026-09-19T12:00:00Z")
    assert kinds(client, owner) == []
    assert dismiss(client, member, item).json()["data"]["reference"] == item["reference"]
    assert dismiss(client, member, item).status_code == 200
    assert kinds(client, member) == []
    changed = client.patch(f"/v1/events/{event['id']}", headers={**auth(owner), "If-Match": event["etag"]},
                           json=event_body(title="Doctor visit", local_start="2026-09-19T17:15", local_end=None))
    assert changed.status_code == 200, changed.text
    app.state.clock.now = at(19, 11, 16)
    assert kinds(client, member) == [("event", "Doctor visit")]
    gone = client.post(f"/v1/events/{event['id']}/cancel", headers={**auth(owner), "If-Match": changed.json()["data"]["etag"]}, json={})
    assert gone.status_code == 200, gone.text
    assert kinds(client, member) == []
    assert client.post(alert_url, headers=auth(member), json={"minutes_before": 10}).json()["error"]["code"] == "EVENT_CANCELLED"
    assert client.post(alert_url, headers=auth(member), json={"minutes_before": None}).json()["data"]["minutes_before"] is None


def test_dose_alerts_are_opt_in_and_end_with_a_report_or_the_next_dose(client, app):
    person = account(client, app)
    other = account(client, app, "other@example.test")
    instruction = create_instruction(client, person).json()["data"]
    url = f"/v1/care/instructions/{instruction['id']}/alerts"
    assert client.post(url, headers=auth(other), json={"enabled": True}).status_code == 404
    assert client.post(url, headers=auth(person), json={"enabled": "yes"}).status_code == 422
    assert client.post(url, headers=auth(person), json={"enabled": True}).json()["data"] == {"instruction_id": instruction["id"], "enabled": True}
    assert client.get("/v1/me/care-alerts", headers=auth(person)).json()["data"] == [{"instruction_id": instruction["id"], "enabled": True}]
    # 08:00 in Kolkata has passed and its window closed; 20:00 is next.
    assert feed(client, person) == {**feed(client, person), "items": [], "next_check_at": "2026-09-19T14:30:00Z"}
    app.state.clock.now = at(19, 14, 31)
    item = feed(client, person)["items"][0]
    assert (item["kind"], item["title"], item["display_time"], item["ends_at"]) == ("dose", "Synthetic Medicine A", "20:00", "2026-09-19T18:30:00Z")
    occurrence = next(row for row in care_day(client, person)["occurrences"] if row["local_time"] == "20:00")
    assert report(client, person, occurrence, "taken").status_code == 200
    assert kinds(client, person) == []
    app.state.clock.now = at(20, 2, 31)
    # Test sessions last eight hours.
    person = sign_in(client)
    item = feed(client, person)["items"][0]
    assert item["reference"] == f"{instruction['id']}:2026-09-20:08:00"
    app.state.clock.now = at(20, 6, 31)
    assert kinds(client, person) == []
    current = client.get(f"/v1/care/instructions/{instruction['id']}", headers=auth(person)).json()["data"]
    assert stop(client, person, current).status_code == 200
    assert client.post(url, headers=auth(person), json={"enabled": False}).json()["data"]["enabled"] is False
    assert client.post(url, headers=auth(person), json={"enabled": True}).json()["error"]["code"] == "CARE_STOPPED"


def test_alert_dismissals_check_their_reference(client, app):
    person = account(client, app)
    for body in (
        {"kind": "reminder", "reference": str(uuid4())}, {"kind": "event", "reference": "not-an-event"},
        {"kind": "dose", "reference": f"{uuid4()}:2026-09-19:25:00"},
    ):
        response = client.post("/v1/me/alerts/dismiss", headers=auth(person), json=body)
        assert response.status_code == 422, response.text


def test_export_includes_quiet_hours_backups_and_replacements(client, app):
    owner, member, space_id = family(client, app)
    task_id = create_task(client, owner, space_id).json()["data"]["id"]
    etag = client.get("/v1/me/quiet-hours", headers=auth(owner)).headers["ETag"]
    assert client.patch("/v1/me/quiet-hours", headers={**auth(owner), "If-Match": etag}, json={"start": "22:00", "end": "07:00"}).status_code == 200
    backup = ask_backup(client, owner, task_id, member).json()["data"]
    archive = download(client, owner, ready_export(client, app, owner, ["reminders"])).json()["data"]
    assert archive["reminders"]["quiet_hours"] == {"start": "22:00", "end": "07:00"}
    assert [(row["id"], row["status"], row["wait_minutes"]) for row in archive["reminders"]["backups"]] == [(backup["id"], "pending", 15)]


def test_downgrade_below_alerts_refuses_to_discard_settings(client, app):
    person = account(client, app)
    etag = client.get("/v1/me/quiet-hours", headers=auth(person)).headers["ETag"]
    assert client.patch("/v1/me/quiet-hours", headers={**auth(person), "If-Match": etag}, json={"start": "22:00", "end": "07:00"}).status_code == 200
    config = Config("alembic.ini")
    with pytest.raises(RuntimeError, match="Alert settings"):
        command.downgrade(config, "0019")
    test_migrated_schema_matches_models(app)
    assert client.get("/v1/me/quiet-hours", headers=auth(person)).json()["data"]["start"] == "22:00"
