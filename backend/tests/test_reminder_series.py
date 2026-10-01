from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from alembic import command as alembic
from alembic.config import Config
from sqlalchemy import func, select

from app.modules.identity.models import OutboxEvent
from app.modules.notifications.models import InAppNotification
from app.modules.scheduling import recurrence
from app.modules.scheduling import series as series_module
from app.modules.scheduling.models import Reminder, ReminderEvent, ReminderSeries, ReminderSeriesEvent
from tests.test_identity import account, auth
from tests.test_migrations import test_migrated_schema_matches_models
from tests.test_reminder_delivery_guards import reminder_request_source, reminder_source, schedule_reminder
from tests.test_spaces import create_space
from tests.test_tasks import change_task, create_task


def at(day, hour, minute=0, second=0):
    return datetime(2026, 9, day, hour, minute, second, tzinfo=timezone.utc)


def rule(**changes):
    values = dict(
        frequency="daily", repeat_every=1, weekday_mask=0, local_time="09:00", timezone="Asia/Kolkata",
        start_date=date(2026, 10, 1), end_date=date(2026, 10, 10), clock_change_policy="shift_forward",
    )
    values.update(changes)
    return recurrence.Rule(**values)


def series_body(task_id, **changes):
    # 16:00 in Kolkata is 10:30 UTC; the test clock starts at 10:00 UTC on 19 September 2026.
    body = {
        "task_id": task_id, "local_time": "16:00", "timezone": "Asia/Kolkata", "start_date": "2026-09-19",
        "end_date": "2026-09-30", "frequency": "daily", "repeat_every": 1, "weekdays": [],
        "clock_change_policy": "shift_forward",
    }
    body.update(changes)
    return body


def create_series(client, actor, task_id, key=None, **changes):
    preview = client.post("/v1/reminder-series/preview", headers=auth(actor), json=series_body(task_id, **changes))
    assert preview.status_code == 200, preview.text
    created = client.post(
        "/v1/reminder-series", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={"preview_token": preview.json()["data"]["preview_token"]},
    )
    return preview.json()["data"], created


def series_command(client, actor, series, operation, key=None, etag=None):
    headers = {**auth(actor), "Idempotency-Key": key or str(uuid4())}
    if etag is not False:
        headers["If-Match"] = etag or series["etag"]
    return client.post(f"/v1/reminder-series/{series['id']}/{operation}", headers=headers, json={})


def occurrences(app, series_id):
    with app.state.sessions() as database:
        rows = database.scalars(select(Reminder).where(Reminder.series_id == series_id, Reminder.follow_up_of.is_(None))
                                .order_by(Reminder.occurrence_date)).all()
        return [(row.occurrence_date.isoformat(), row.status, row.reason) for row in rows]


def source_for(client, app, email):
    actor = account(client, app, email)
    space_id = create_space(client, actor).json()["data"]["id"]
    task = create_task(client, actor, space_id, actor["user"]["id"])
    assert task.status_code == 201, task.text
    return actor, task.json()["data"]["id"]


def test_rules_follow_calendar_dates_for_days_and_weekdays():
    every_other_day = rule(repeat_every=2, end_date=date(2026, 10, 9))
    assert list(recurrence.dates(every_other_day, date(2026, 10, 1), date(2026, 10, 9))) == [
        date(2026, 10, 1), date(2026, 10, 3), date(2026, 10, 5), date(2026, 10, 7), date(2026, 10, 9),
    ]
    # Weeks start on Monday. The Monday before a Wednesday start is not included.
    fortnightly = rule(frequency="weekly", repeat_every=2, weekday_mask=recurrence.weekday_mask(["mon", "wed"]),
                       start_date=date(2026, 9, 30), end_date=date(2026, 10, 28))
    assert list(recurrence.dates(fortnightly, date(2026, 9, 1), date(2026, 12, 1))) == [
        date(2026, 9, 30), date(2026, 10, 12), date(2026, 10, 14), date(2026, 10, 26), date(2026, 10, 28),
    ]


def test_clock_changes_move_forward_or_skip_and_repeated_times_remind_once():
    spring = dict(timezone="America/New_York", local_time="02:30", start_date=date(2026, 3, 7), end_date=date(2026, 3, 9))
    shifted = {day: occurrence for day, occurrence, _change in recurrence.occurrences(rule(**spring), date(2026, 3, 7), date(2026, 3, 9))}
    assert shifted[date(2026, 3, 8)].scheduled_at == datetime(2026, 3, 8, 7, 30, tzinfo=timezone.utc)
    assert (shifted[date(2026, 3, 8)].display_time, shifted[date(2026, 3, 8)].adjustment) == ("03:30", "shifted_forward")
    assert shifted[date(2026, 3, 9)].scheduled_at == datetime(2026, 3, 9, 6, 30, tzinfo=timezone.utc)
    skipped = list(recurrence.occurrences(rule(**spring, clock_change_policy="skip"), date(2026, 3, 7), date(2026, 3, 9)))
    assert [(day, occurrence is None, change) for day, occurrence, change in skipped][1] == (date(2026, 3, 8), True, "skipped")
    autumn = rule(timezone="America/New_York", local_time="01:30", start_date=date(2026, 11, 1), end_date=date(2026, 11, 1))
    occurrence, change = recurrence.resolve(autumn, date(2026, 11, 1))
    assert (occurrence.scheduled_at, change) == (datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc), "repeated_time_first")
    # A daily 09:00 reminder is 23 hours apart across the spring change; its delivery window never overlaps the next.
    morning = rule(timezone="America/New_York", start_date=date(2026, 3, 7), end_date=date(2026, 3, 9))
    first, _change = recurrence.resolve(morning, date(2026, 3, 7))
    assert recurrence.window_end(morning, first) == datetime(2026, 3, 8, 13, 0, tzinfo=timezone.utc)


def test_next_occurrence_allows_at_most_one_late_delivery_inside_its_window():
    daily = rule()
    late = datetime(2026, 10, 3, 5, 0, tzinfo=timezone.utc)
    assert recurrence.next_occurrence(daily, date(2026, 9, 30), late).local_date == date(2026, 10, 4)
    assert recurrence.next_occurrence(daily, date(2026, 9, 30), late, allow_late=True).local_date == date(2026, 10, 3)
    later = datetime(2026, 10, 4, 4, 0, tzinfo=timezone.utc)
    assert recurrence.next_occurrence(daily, date(2026, 9, 30), later, allow_late=True).local_date == date(2026, 10, 4)
    assert recurrence.next_occurrence(daily, date(2026, 10, 10), later, allow_late=True) is None


def test_preview_shows_exact_times_and_stores_nothing(client, app):
    actor, task_id = reminder_source(client, app)
    response = client.post("/v1/reminder-series/preview", headers=auth(actor), json=series_body(task_id))
    assert response.status_code == 200, response.text
    preview = response.json()["data"]
    assert preview["occurrence_count"] == 12
    assert len(preview["occurrences"]) == 10
    assert preview["occurrences"][0] == {
        "reminder_id": None, "local_date": "2026-09-19", "display_time": "16:00", "scheduled_at": "2026-09-19T10:30:00Z",
        "utc_offset_minutes": 330, "adjustment": "none",
    }
    assert preview["recipient"]["account_id"] == actor["user"]["id"]
    assert (preview["clock_changes"], preview["channel"]) == ([], "in_app")
    spring = client.post("/v1/reminder-series/preview", headers=auth(actor), json=series_body(
        task_id, timezone="America/New_York", local_time="02:30", start_date="2027-03-13", end_date="2027-03-15",
        clock_change_policy="skip",
    ))
    assert spring.status_code == 200, spring.text
    assert spring.json()["data"]["clock_changes"] == [{"local_date": "2027-03-14", "change": "skipped"}]
    assert spring.json()["data"]["occurrence_count"] == 2
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ReminderSeries)) == 0
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0


@pytest.mark.parametrize(("changes", "code"), [
    ({"frequency": "weekly"}, "VALIDATION_ERROR"),
    ({"weekdays": ["mon"]}, "VALIDATION_ERROR"),
    ({"frequency": "weekly", "weekdays": ["mon"], "repeat_every": 5}, "VALIDATION_ERROR"),
    ({"frequency": "weekly", "weekdays": ["mon", "mon"]}, "VALIDATION_ERROR"),
    ({"repeat_every": 31}, "VALIDATION_ERROR"),
    ({"end_date": "2026-09-18"}, "VALIDATION_ERROR"),
    ({"end_date": "2027-09-20"}, "VALIDATION_ERROR"),
    ({"local_time": "24:00"}, "VALIDATION_ERROR"),
    ({"local_time": "9:00"}, "VALIDATION_ERROR"),
    ({"timezone": "IST"}, "VALIDATION_ERROR"),
    ({"start_date": "2026-9-19"}, "VALIDATION_ERROR"),
    ({"clock_change_policy": "latest"}, "VALIDATION_ERROR"),
    ({"start_date": "2026-09-18"}, "SERIES_DATES_INVALID"),
    ({"end_date": "2026-09-19", "local_time": "15:00"}, "SERIES_EMPTY"),
])
def test_unsupported_or_empty_rules_are_refused(client, app, changes, code):
    actor, task_id = reminder_source(client, app)
    response = client.post("/v1/reminder-series/preview", headers=auth(actor), json=series_body(task_id, **changes))
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == code


def test_creation_is_idempotent_and_only_the_next_occurrence_exists(client, app):
    actor, task_id = reminder_source(client, app)
    key = str(uuid4())
    preview, created = create_series(client, actor, task_id, key=key)
    assert created.status_code == 201, created.text
    series = created.json()["data"]
    assert (series["status"], series["reason"], series["weekdays"]) == ("active", None, [])
    assert series["next_occurrence"]["scheduled_at"] == "2026-09-19T10:30:00Z"
    assert created.headers["etag"] == series["etag"]
    repeated = client.post("/v1/reminder-series", headers={**auth(actor), "Idempotency-Key": key}, json={"preview_token": preview["preview_token"]})
    assert repeated.status_code == 201
    assert repeated.json()["data"]["id"] == series["id"]
    changed = client.post("/v1/reminder-series/preview", headers=auth(actor), json=series_body(task_id, local_time="17:00"))
    conflict = client.post("/v1/reminder-series", headers={**auth(actor), "Idempotency-Key": key},
                           json={"preview_token": changed.json()["data"]["preview_token"]})
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    with app.state.sessions() as database:
        rows = database.scalars(select(Reminder)).all()
        assert len(rows) == 1
        assert rows[0].series_id == series["id"]
        assert rows[0].occurrence_date == date(2026, 9, 19)
        assert rows[0].request_key == series_module.occurrence_key(series["id"], date(2026, 9, 19))
        assert database.scalar(select(func.count()).select_from(ReminderSeries)) == 1
    listed = client.get("/v1/reminder-series", headers=auth(actor)).json()
    assert [item["id"] for item in listed["data"]] == [series["id"]]
    assert client.get(f"/v1/reminder-series?task_id={task_id}", headers=auth(actor)).json()["data"][0]["id"] == series["id"]
    outsider = account(client, app, "series-outsider@example.test")
    assert client.get(f"/v1/reminder-series/{series['id']}", headers=auth(outsider)).status_code == 404
    assert client.get("/v1/reminder-series", headers=auth(outsider)).json()["data"] == []


def test_plain_and_repeating_reminders_do_not_overlap_on_one_task(client, app):
    actor, task_id, reminder, _body, _headers = schedule_reminder(client, app)
    _preview, blocked = create_series(client, actor, task_id)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "REMINDER_ALREADY_SCHEDULED"
    assert client.post(f"/v1/reminders/{reminder['id']}/cancel", headers=auth(actor), json={}).status_code == 200
    _preview, created = create_series(client, actor, task_id)
    assert created.status_code == 201, created.text
    preview = client.post("/v1/reminders/preview", headers=auth(actor), json={
        "task_id": task_id, "local_time": "2026-09-20T09:00", "timezone": "Asia/Kolkata",
    })
    assert preview.status_code == 200
    plain = client.post("/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())},
                        json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]})
    assert plain.status_code == 409
    assert plain.json()["error"]["code"] == "REMINDER_ALREADY_SCHEDULED"
    occurrence = created.json()["data"]["next_occurrence"]["reminder_id"]
    refused = client.post(f"/v1/reminders/{occurrence}/cancel", headers=auth(actor), json={})
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "USE_SERIES_ACTIONS"


def test_each_delivered_occurrence_schedules_the_next_one(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id)
    series = created.json()["data"]
    first = series["next_occurrence"]["reminder_id"]
    app.state.clock.now = at(19, 10, 31)
    assert app.state.reminders.dispatch_due() == {"available": 1}
    assert app.state.reminders.dispatch_due() == {}
    inbox = client.get("/v1/notifications", headers=auth(actor)).json()
    assert [item["reminder_id"] for item in inbox["data"]] == [first]
    assert inbox["data"][0]["series_id"] == series["id"]
    current = client.get(f"/v1/reminder-series/{series['id']}", headers=auth(actor))
    assert current.status_code == 200
    assert current.json()["data"]["next_occurrence"]["local_date"] == "2026-09-20"
    assert current.json()["data"]["next_occurrence"]["scheduled_at"] == "2026-09-20T10:30:00Z"
    assert int(current.json()["data"]["version"]) > int(series["version"])
    assert current.headers["etag"] != series["etag"]
    assert occurrences(app, series["id"]) == [("2026-09-19", "available", None), ("2026-09-20", "scheduled", None)]
    with app.state.sessions() as database:
        scheduled = database.scalars(select(ReminderEvent).where(ReminderEvent.action == "reminder.scheduled")).all()
        assert sorted(event.actor_kind for event in scheduled) == ["scheduler", "user"]


def test_worker_downtime_expires_one_occurrence_and_catches_up_without_a_burst(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id)
    app.state.clock.now = at(22, 12)
    assert app.state.reminders.dispatch_due() == {"expired": 1}
    assert app.state.reminders.dispatch_due() == {"available": 1}
    assert app.state.reminders.dispatch_due() == {}
    assert occurrences(app, created.json()["data"]["id"]) == [
        ("2026-09-19", "expired", "dispatch_expired"), ("2026-09-22", "available", None), ("2026-09-23", "scheduled", None),
    ]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 1


def test_pause_resume_skip_and_cancel_apply_once_to_the_reviewed_version(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id)
    series = created.json()["data"]
    first = series["next_occurrence"]["reminder_id"]
    assert series_command(client, actor, series, "pause", etag=False).status_code == 428
    assert series_command(client, actor, series, "pause", etag='"stale"').status_code == 412
    key = str(uuid4())
    paused = series_command(client, actor, series, "pause", key=key)
    assert paused.status_code == 200, paused.text
    paused = paused.json()["data"]
    assert (paused["status"], paused["reason"], paused["next_occurrence"]) == ("paused", "by_person", None)
    retried = series_command(client, actor, series, "pause", key=key)
    assert retried.status_code == 200
    assert retried.json()["data"]["version"] == paused["version"]
    assert series_command(client, actor, series, "resume", key=key).status_code == 409
    assert occurrences(app, series["id"]) == [("2026-09-19", "cancelled", "series_paused")]
    assert series_command(client, actor, paused, "pause").json()["error"]["code"] == "SERIES_NOT_ACTIVE"
    resumed = series_command(client, actor, paused, "resume")
    assert resumed.status_code == 200, resumed.text
    resumed = resumed.json()["data"]
    assert resumed["status"] == "active"
    assert resumed["next_occurrence"]["reminder_id"] == first
    skipped = series_command(client, actor, resumed, "skip")
    assert skipped.status_code == 200, skipped.text
    skipped = skipped.json()["data"]
    assert skipped["next_occurrence"]["local_date"] == "2026-09-20"
    cancelled = series_command(client, actor, skipped, "cancel")
    assert cancelled.status_code == 200, cancelled.text
    cancelled = cancelled.json()["data"]
    assert (cancelled["status"], cancelled["next_occurrence"]) == ("cancelled", None)
    assert series_command(client, actor, cancelled, "resume").json()["error"]["code"] == "SERIES_NOT_PAUSED"
    assert series_command(client, actor, cancelled, "cancel").json()["error"]["code"] == "SERIES_ENDED"
    assert occurrences(app, series["id"]) == [
        ("2026-09-19", "cancelled", "skipped"), ("2026-09-20", "cancelled", "series_cancelled"),
    ]
    app.state.clock.now = at(21, 12)
    assert app.state.reminders.dispatch_due() == {}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0
        actions = [event.action for event in database.scalars(
            select(ReminderSeriesEvent).where(ReminderSeriesEvent.series_id == series["id"]).order_by(ReminderSeriesEvent.created_at)
        )]
        assert set(actions) == {"reminder_series.created", "reminder_series.paused", "reminder_series.resumed",
                                "reminder_series.skipped", "reminder_series.cancelled"}
        outbox = {row.event_type for row in database.scalars(select(OutboxEvent).where(OutboxEvent.aggregate_id == series["id"]))}
        assert outbox == set(actions)


def test_a_changed_task_pauses_the_series_until_the_person_resumes_it(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id)
    series = created.json()["data"]
    task = client.get(f"/v1/tasks/{task_id}", headers=auth(actor))
    assert change_task(client, actor, task_id, {"title": "Buy fruit"}, task.headers["etag"]).status_code == 200
    assert series_command(client, actor, series, "pause").status_code == 412
    app.state.clock.now = at(19, 10, 31)
    assert app.state.reminders.dispatch_due() == {"suppressed": 1}
    current = client.get(f"/v1/reminder-series/{series['id']}", headers=auth(actor)).json()["data"]
    assert (current["status"], current["reason"], current["source_changed"]) == ("paused", "task_changed", True)
    resumed = series_command(client, actor, current, "resume")
    assert resumed.status_code == 200, resumed.text
    assert (resumed.json()["data"]["source_changed"], resumed.json()["data"]["task_title"]) == (False, "Buy fruit")
    assert resumed.json()["data"]["next_occurrence"]["local_date"] == "2026-09-20"
    app.state.clock.now = at(20, 10, 31)
    assert app.state.reminders.dispatch_due() == {"available": 1}


def test_withdrawn_permission_ends_the_series_and_blocks_resume(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id)
    series = created.json()["data"]
    paused = series_command(client, actor, series, "pause").json()["data"]
    before = client.get("/v1/me/notification-preferences", headers=auth(actor))
    off = client.patch("/v1/me/notification-preferences", headers={**auth(actor), "If-Match": before.headers["etag"]},
                       json={"in_app_reminders_enabled": False})
    assert off.status_code == 200
    assert series_command(client, actor, paused, "resume").json()["error"]["code"] == "REMINDERS_DISABLED"
    on = client.patch("/v1/me/notification-preferences", headers={**auth(actor), "If-Match": off.headers["etag"]},
                      json={"in_app_reminders_enabled": True})
    assert on.status_code == 200
    assert series_command(client, actor, paused, "resume").json()["error"]["code"] == "PREFERENCES_CHANGED"
    other, other_task = source_for(client, app, "series-other@example.test")
    _preview, running = create_series(client, other, other_task)
    before = client.get("/v1/me/notification-preferences", headers=auth(other))
    assert client.patch("/v1/me/notification-preferences", headers={**auth(other), "If-Match": before.headers["etag"]},
                        json={"in_app_reminders_enabled": False}).status_code == 200
    app.state.clock.now = at(19, 10, 31)
    assert app.state.reminders.dispatch_due() == {"suppressed": 1}
    stopped = client.get(f"/v1/reminder-series/{running.json()['data']['id']}", headers=auth(other)).json()["data"]
    assert (stopped["status"], stopped["reason"], stopped["next_occurrence"]) == ("suppressed", "preference_revoked", None)
    assert series_command(client, other, stopped, "resume").json()["error"]["code"] == "SERIES_NOT_PAUSED"


def test_losing_task_access_hides_and_stops_the_series(client, app):
    organizer, recipient, task_id = reminder_request_source(client, app)
    _preview, created = create_series(client, recipient, task_id)
    assert created.status_code == 201, created.text
    series = created.json()["data"]
    space_id = series["space_id"]
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(organizer)).json()["data"]
    reviewed = next(member for member in roster if member["account_id"] == recipient["user"]["id"])
    removed = client.post(f"/v1/spaces/{space_id}/members/{recipient['user']['id']}/remove", headers={
        **auth(organizer), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"],
    }, json={})
    assert removed.status_code == 200, removed.text
    assert client.get(f"/v1/reminder-series/{series['id']}", headers=auth(recipient)).status_code == 404
    assert client.get("/v1/reminder-series", headers=auth(recipient)).json()["data"] == []
    assert series_command(client, recipient, series, "cancel").status_code == 404
    app.state.clock.now = at(19, 10, 31)
    assert app.state.reminders.dispatch_due() == {"suppressed": 1}
    with app.state.sessions() as database:
        saved = database.get(ReminderSeries, series["id"])
        assert (saved.status, saved.reason) == ("suppressed", "access_lost")
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0


def test_a_single_day_series_ends_after_its_only_occurrence(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id, end_date="2026-09-19")
    series = created.json()["data"]
    app.state.clock.now = at(19, 10, 31)
    assert app.state.reminders.dispatch_due() == {"available": 1}
    ended = client.get(f"/v1/reminder-series/{series['id']}", headers=auth(actor)).json()["data"]
    assert (ended["status"], ended["next_occurrence"]) == ("ended", None)


def test_open_series_limit_is_bounded(client, app, monkeypatch):
    monkeypatch.setattr(series_module, "MAX_OPEN_SERIES_PER_ACCOUNT", 1)
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id)
    second_task = create_task(client, actor, created.json()["data"]["space_id"], actor["user"]["id"], title="Water plants")
    _preview, refused = create_series(client, actor, second_task.json()["data"]["id"])
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "SERIES_LIMIT_REACHED"


def test_calendar_shows_planned_times_without_storing_them(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id, frequency="weekly", weekdays=["mon", "fri"], end_date="2026-10-30")
    series = created.json()["data"]
    query = {"space_id": series["space_id"], "start_date": "2026-09-19", "end_date": "2026-10-18", "timezone": "Asia/Kolkata", "limit": 100}
    response = client.get("/v1/calendar", params=query, headers=auth(actor))
    assert response.status_code == 200, response.text
    entries = response.json()["data"]
    assert [(row["kind"], row["date"]) for row in entries] == [
        ("task", "2026-09-21"), ("reminder", "2026-09-21"), ("planned", "2026-09-25"), ("planned", "2026-09-28"),
        ("planned", "2026-10-02"), ("planned", "2026-10-05"), ("planned", "2026-10-09"), ("planned", "2026-10-12"),
        ("planned", "2026-10-16"),
    ]
    planned = [row for row in entries if row["kind"] == "planned"]
    assert planned[0]["id"] == series_module.occurrence_key(series["id"], date(2026, 9, 25))
    assert {row["series_id"] for row in entries[1:]} == {series["id"]}
    assert {(row["status"], row["scheduled_at"][11:]) for row in planned} == {("planned", "10:30:00Z")}
    paged, cursor = [], None
    for _page in range(5):
        page = client.get("/v1/calendar", params={**query, "limit": 2, **({"cursor": cursor} if cursor else {})}, headers=auth(actor))
        assert page.status_code == 200, page.text
        paged.extend(row["id"] for row in page.json()["data"])
        cursor = page.json()["pagination"]["next_cursor"]
    assert paged == [row["id"] for row in entries]
    assert cursor is None
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Reminder)) == 1
    assert series_command(client, actor, series, "pause").status_code == 200
    hidden = client.get("/v1/calendar", params=query, headers=auth(actor)).json()["data"]
    assert [(row["kind"], row["status"]) for row in hidden] == [("task", "open"), ("reminder", "cancelled")]


def test_snooze_follows_up_at_most_three_times_and_acknowledgment_settles_the_chain(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now = at(19, 10, 2, 30)
    assert app.state.reminders.dispatch_due() == {"available": 1}
    notification = client.get("/v1/notifications", headers=auth(actor)).json()["data"][0]
    assert (notification["can_snooze"], notification["snooze_count"], notification["snoozed_until"]) == (True, 0, None)
    path = f"/v1/notifications/{notification['id']}/snooze"
    assert client.post(path, headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": 5}).status_code == 422
    key = str(uuid4())
    snoozed = client.post(path, headers={**auth(actor), "Idempotency-Key": key}, json={"minutes": 10})
    assert snoozed.status_code == 200, snoozed.text
    snoozed = snoozed.json()["data"]
    assert (snoozed["snoozed_until"], snoozed["can_snooze"]) == ("2026-09-19T10:13:00Z", False)
    assert snoozed["read_at"] is not None
    assert client.post(path, headers={**auth(actor), "Idempotency-Key": key}, json={"minutes": 10}).json()["data"] == snoozed
    assert client.post(path, headers={**auth(actor), "Idempotency-Key": key}, json={"minutes": 60}).status_code == 409
    again = client.post(path, headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": 10})
    assert again.json()["error"]["code"] == "ALREADY_SNOOZED"
    follow_up = [item for item in client.get("/v1/reminders", headers=auth(actor)).json()["data"] if item["follow_up_of"]][0]
    assert (follow_up["follow_up_of"], follow_up["snooze_count"], follow_up["status"]) == (reminder["id"], 1, "scheduled")
    latest = notification
    for count, (minutes, due) in enumerate([(None, at(19, 10, 13, 30)), (60, at(19, 11, 14, 30)), (180, at(19, 14, 15, 30))], start=1):
        if minutes:
            response = client.post(f"/v1/notifications/{latest['id']}/snooze", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": minutes})
            assert response.status_code == 200, response.text
        app.state.clock.now = due
        assert app.state.reminders.dispatch_due() == {"available": 1}
        latest = next(item for item in client.get("/v1/notifications", headers=auth(actor)).json()["data"] if item["snooze_count"] == count)
    assert latest["can_snooze"] is False
    refused = client.post(f"/v1/notifications/{latest['id']}/snooze", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": 10})
    assert refused.json()["error"]["code"] == "SNOOZE_LIMIT_REACHED"
    acknowledged = client.post(f"/v1/notifications/{latest['id']}/acknowledge", headers=auth(actor), json={})
    assert acknowledged.status_code == 200
    with app.state.sessions() as database:
        rows = database.scalars(select(Reminder).order_by(Reminder.snooze_count)).all()
        assert [(row.snooze_count, row.status, row.acknowledged_at is not None) for row in rows] == [
            (0, "available", True), (1, "available", True), (2, "available", True), (3, "available", True),
        ]
    assert client.get(f"/v1/tasks/{reminder['task_id']}", headers=auth(actor)).json()["data"]["status"] == "open"


def test_acknowledging_stops_a_waiting_snooze(client, app):
    actor, _task_id, _reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now = at(19, 10, 2)
    app.state.reminders.dispatch_due()
    notification = client.get("/v1/notifications", headers=auth(actor)).json()["data"][0]
    snoozed = client.post(f"/v1/notifications/{notification['id']}/snooze", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": 60})
    assert snoozed.status_code == 200
    acknowledged = client.post(f"/v1/notifications/{notification['id']}/acknowledge", headers=auth(actor), json={})
    assert acknowledged.status_code == 200
    assert acknowledged.json()["data"]["snoozed_until"] is None
    app.state.clock.now = at(19, 11, 5)
    assert app.state.reminders.dispatch_due() == {}
    with app.state.sessions() as database:
        waiting = database.scalar(select(Reminder).where(Reminder.follow_up_of.is_not(None)))
        assert (waiting.status, waiting.reason) == ("cancelled", "acknowledged")
    later = client.post(f"/v1/notifications/{notification['id']}/snooze", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": 10})
    assert later.json()["error"]["code"] == "SNOOZE_UNAVAILABLE"


def test_series_snooze_ends_before_the_next_occurrence(client, app):
    actor, task_id = reminder_source(client, app)
    _preview, created = create_series(client, actor, task_id)
    series = created.json()["data"]
    app.state.clock.now = at(19, 10, 31)
    app.state.reminders.dispatch_due()
    notification = client.get("/v1/notifications", headers=auth(actor)).json()["data"][0]
    assert notification["snooze_before"] == "2026-09-20T10:30:00Z"
    path = f"/v1/notifications/{notification['id']}/snooze"
    too_late = client.post(path, headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": 1440})
    assert too_late.json()["error"]["code"] == "SNOOZE_TOO_LATE"
    assert client.post(path, headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"minutes": 180}).status_code == 200
    with app.state.sessions() as database:
        follow_up = database.scalar(select(Reminder).where(Reminder.follow_up_of.is_not(None)))
        assert follow_up.series_id == series["id"]
        assert follow_up.expires_at == at(20, 10, 30)
    current = client.get(f"/v1/reminder-series/{series['id']}", headers=auth(actor)).json()["data"]
    assert series_command(client, actor, current, "cancel").status_code == 200
    with app.state.sessions() as database:
        follow_up = database.scalar(select(Reminder).where(Reminder.follow_up_of.is_not(None)))
        assert (follow_up.status, follow_up.reason) == ("cancelled", "series_cancelled")


def test_migration_keeps_plain_reminders_and_refuses_to_drop_series(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    settings = Config("alembic.ini")
    try:
        alembic.downgrade(settings, "0018")
        with app.state.engine.connect() as connection:
            assert connection.exec_driver_sql("SELECT count(*) FROM reminders").scalar() == 1
    finally:
        alembic.upgrade(settings, "head")
    listed = client.get("/v1/reminders", headers=auth(actor)).json()["data"]
    assert listed == [reminder]
    other, task_id = source_for(client, app, "series-migration@example.test")
    _preview, created = create_series(client, other, task_id)
    assert created.status_code == 201
    with pytest.raises(RuntimeError, match="Repeating or snoozed reminders exist"):
        alembic.downgrade(settings, "0018")
    test_migrated_schema_matches_models(app)
    assert client.get(f"/v1/reminder-series/{created.json()['data']['id']}", headers=auth(other)).status_code == 200
