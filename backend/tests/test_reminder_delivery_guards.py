import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.modules.identity.models import AccountSession, OutboxEvent, User
from app.modules.identity.service import utcnow
from app.modules.notifications.models import InAppNotification
from app.modules.planning.models import Task, TaskAccess
from app.modules.scheduling.models import Reminder, ReminderEvent, ReminderRequest, ReminderRequestEvent
from app.modules.spaces.models import Space, SpaceMembership
from tests.test_identity import PASSWORD, account, auth
from tests.test_spaces import create_space
from tests.test_tasks import create_task


def reminder_source(client, app):
    actor = account(client, app)
    space_id = create_space(client, actor).json()["data"]["id"]
    created = create_task(client, actor, space_id, actor["user"]["id"])
    assert created.status_code == 201, created.text
    return actor, created.json()["data"]["id"]


def preview_reminder(client, actor, task_id, local_time="2026-09-19T15:31:00", zone="Asia/Kolkata"):
    return client.post(
        "/v1/reminders/preview", headers=auth(actor),
        json={"task_id": task_id, "local_time": local_time, "timezone": zone},
    )


def schedule_reminder(client, app, local_time="2026-09-19T15:31:00", zone="Asia/Kolkata"):
    actor, task_id = reminder_source(client, app)
    response = preview_reminder(client, actor, task_id, local_time, zone)
    assert response.status_code == 200, response.text
    body = {"preview_token": response.json()["data"]["options"][0]["preview_token"]}
    headers = {**auth(actor), "Idempotency-Key": str(uuid4())}
    created = client.post("/v1/reminders", headers=headers, json=body)
    assert created.status_code == 201, created.text
    return actor, task_id, created.json()["data"], body, headers


def reminder_request_source(client, app):
    organizer = account(client, app)
    recipient = account(client, app, "recipient@example.test")
    space_id = create_space(client, organizer).json()["data"]["id"]
    invitation = client.post(
        f"/v1/spaces/{space_id}/invitations",
        headers={**auth(organizer), "Idempotency-Key": str(uuid4())},
        json={"recipient_account_id": recipient["user"]["id"]},
    )
    assert invitation.status_code == 201, invitation.text
    joined = client.post(
        f"/v1/invitations/{invitation.json()['data']['id']}/accept", headers=auth(recipient), json={},
    )
    assert joined.status_code == 200, joined.text
    task = create_task(client, organizer, space_id, recipient["user"]["id"])
    assert task.status_code == 201, task.text
    return organizer, recipient, task.json()["data"]["id"]


@pytest.mark.parametrize("first", ["removal", "dispatch"])
def test_membership_removal_serializes_with_due_dispatch_and_hides_committed_inbox(client, app, monkeypatch, first):
    organizer, recipient, task_id = reminder_request_source(client, app)
    preview = preview_reminder(client, recipient, task_id)
    assert preview.status_code == 200, preview.text
    created = client.post(
        "/v1/reminders", headers={**auth(recipient), "Idempotency-Key": str(uuid4())},
        json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]},
    )
    assert created.status_code == 201, created.text
    reminder = created.json()["data"]
    roster = client.get(f"/v1/spaces/{reminder['space_id']}/members", headers=auth(organizer))
    assert roster.status_code == 200, roster.text
    reviewed = next(member for member in roster.json()["data"] if member["account_id"] == recipient["user"]["id"])
    headers = {**auth(organizer), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}
    path = f"/v1/spaces/{reminder['space_id']}/members/{recipient['user']['id']}/remove"
    locked = Event()
    release = Event()
    removal_entered = Event()
    original_lock = app.state.spaces.lock_accounts
    original_record = app.state.reminders.record

    def hold_removal(database, token, account_ids):
        removal_entered.set()
        result = original_lock(database, token, account_ids)
        if first == "removal":
            locked.set()
            assert release.wait(10), "Timed out releasing the synthetic removal transaction"
        return result

    def hold_dispatch(database, saved, action, user_id=None):
        original_record(database, saved, action, user_id)
        if first == "dispatch" and action == "reminder.available":
            locked.set()
            assert release.wait(10), "Timed out releasing the synthetic dispatch transaction"

    monkeypatch.setattr(app.state.spaces, "lock_accounts", hold_removal)
    monkeypatch.setattr(app.state.reminders, "record", hold_dispatch)
    app.state.clock.now += timedelta(minutes=2)
    with ThreadPoolExecutor(max_workers=2) as pool:
        if first == "removal":
            removal = pool.submit(client.post, path, headers=headers, json={})
            try:
                assert locked.wait(5), "Removal did not reach its account lock"
                assert app.state.reminders.dispatch(reminder["id"]) == "busy"
            finally:
                release.set()
            removed = removal.result(timeout=10)
        else:
            dispatch = pool.submit(app.state.reminders.dispatch, reminder["id"])
            try:
                assert locked.wait(5), "Dispatch did not reach its transaction boundary"
                removal = pool.submit(client.post, path, headers=headers, json={})
                assert removal_entered.wait(5), "Removal did not attempt its account lock"
            finally:
                release.set()
            assert dispatch.result(timeout=10) == "available"
            removed = removal.result(timeout=10)
    assert removed.status_code == 200, removed.text
    assert client.post(path, headers=headers, json={}).status_code == 200
    expected = "suppressed" if first == "removal" else "unchanged"
    assert app.state.reminders.dispatch(reminder["id"]) == expected
    assert client.get("/v1/reminders", headers=auth(recipient)).json()["data"] == []
    inbox = client.get("/v1/notifications", headers=auth(recipient))
    assert inbox.status_code == 200, inbox.text
    assert inbox.json()["data"] == []
    assert inbox.json()["unread_count"] == 0
    with app.state.sessions() as database:
        notifications = database.scalars(select(InAppNotification).where(InAppNotification.reminder_id == reminder["id"])).all()
        assert len(notifications) == (0 if first == "removal" else 1)
        assert database.get(Reminder, reminder["id"]).status == ("suppressed" if first == "removal" else "available")
        notification_id = notifications[0].id if notifications else None
    if notification_id is not None:
        for action in ("read", "acknowledge"):
            response = client.post(f"/v1/notifications/{notification_id}/{action}", headers=auth(recipient), json={})
            assert response.status_code == 404, response.text
        with app.state.sessions() as database:
            assert database.get(InAppNotification, notification_id).read_at is None
            assert database.get(Reminder, reminder["id"]).acknowledged_at is None


def test_rejoined_member_does_not_regain_earlier_reminders_or_inbox(client, app):
    organizer, recipient, delivered_task = reminder_request_source(client, app)

    def remind(task_id, local_time):
        preview = preview_reminder(client, recipient, task_id, local_time)
        assert preview.status_code == 200, preview.text
        created = client.post(
            "/v1/reminders", headers={**auth(recipient), "Idempotency-Key": str(uuid4())},
            json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]},
        )
        assert created.status_code == 201, created.text
        return created.json()["data"]

    delivered = remind(delivered_task, "2026-09-19T15:31:00")
    space_id = delivered["space_id"]
    pending_task = create_task(client, organizer, space_id, recipient["user"]["id"]).json()["data"]["id"]
    pending = remind(pending_task, "2026-09-19T16:31:00")
    app.state.clock.now += timedelta(minutes=2)
    assert app.state.reminders.dispatch(delivered["id"]) == "available"
    inbox = client.get("/v1/notifications", headers=auth(recipient)).json()
    assert inbox["unread_count"] == 1
    notification_id = inbox["data"][0]["id"]

    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(organizer)).json()["data"]
    reviewed = next(member for member in roster if member["account_id"] == recipient["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space_id}/members/{recipient['user']['id']}/remove",
        headers={**auth(organizer), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    invitation = client.post(
        f"/v1/spaces/{space_id}/invitations",
        headers={**auth(organizer), "Idempotency-Key": str(uuid4())},
        json={"recipient_account_id": recipient["user"]["id"]},
    )
    assert invitation.status_code == 201, invitation.text
    rejoined = client.post(f"/v1/invitations/{invitation.json()['data']['id']}/accept", headers=auth(recipient), json={})
    assert rejoined.status_code == 200, rejoined.text

    assert client.get("/v1/reminders", headers=auth(recipient)).json()["data"] == []
    hidden = client.get("/v1/notifications", headers=auth(recipient)).json()
    assert hidden["data"] == [] and hidden["unread_count"] == 0
    for action in ("read", "acknowledge"):
        assert client.post(f"/v1/notifications/{notification_id}/{action}", headers=auth(recipient), json={}).status_code == 404
    assert preview_reminder(client, recipient, delivered_task).status_code == 404
    app.state.clock.now += timedelta(hours=1)
    assert app.state.reminders.dispatch(pending["id"]) == "suppressed"
    with app.state.sessions() as database:
        assert database.get(Reminder, pending["id"]).reason == "access_lost"
        assert database.scalar(select(func.count()).select_from(InAppNotification).where(InAppNotification.reminder_id == pending["id"])) == 0
        saved = database.get(InAppNotification, notification_id)
        assert saved.read_at is None
        assert database.get(Reminder, delivered["id"]).acknowledged_at is None
    fresh_task = create_task(client, organizer, space_id, recipient["user"]["id"]).json()["data"]["id"]
    assert preview_reminder(client, recipient, fresh_task, "2026-09-19T18:31:00").status_code == 200


def request_preview(client, organizer, recipient, task_id, local_time="2026-09-19T16:00:00", zone="Asia/Kolkata"):
    return client.post(
        "/v1/reminder-requests/preview", headers=auth(organizer),
        json={"task_id": task_id, "recipient_account_id": recipient["user"]["id"],
              "local_time": local_time, "timezone": zone},
    )


def propose_reminder(client, app):
    organizer, recipient, task_id = reminder_request_source(client, app)
    preview = request_preview(client, organizer, recipient, task_id)
    assert preview.status_code == 200, preview.text
    body = {"preview_token": preview.json()["data"]["options"][0]["preview_token"]}
    headers = {**auth(organizer), "Idempotency-Key": str(uuid4())}
    created = client.post("/v1/reminder-requests", headers=headers, json=body)
    assert created.status_code == 201, created.text
    return organizer, recipient, task_id, created.json()["data"], body, headers


def request_review(client, recipient, identifier):
    response = client.get(f"/v1/reminder-requests/{identifier}/review", headers=auth(recipient))
    assert response.status_code == 200, response.text
    return {"preview_token": response.json()["data"]["preview_token"]}


def test_reminder_request_needs_recipient_confirmation_before_scheduling(client, app):
    organizer, recipient, task_id = reminder_request_source(client, app)
    preview = client.post(
        "/v1/reminder-requests/preview", headers=auth(organizer),
        json={"task_id": task_id, "recipient_account_id": recipient["user"]["id"],
              "local_time": "2026-09-19T16:00:00", "timezone": "Asia/Kolkata"},
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["data"]["recipient"]["account_id"] == recipient["user"]["id"]
    selected = {"preview_token": preview.json()["data"]["options"][0]["preview_token"]}
    created = client.post(
        "/v1/reminder-requests", headers={**auth(organizer), "Idempotency-Key": str(uuid4())}, json=selected,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["data"]["id"]
    assert created.json()["data"]["status"] == "pending"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0
    denied = client.post(f"/v1/reminder-requests/{request_id}/accept", headers=auth(organizer), json=selected)
    assert denied.status_code == 404, denied.text
    review = client.get(f"/v1/reminder-requests/{request_id}/review", headers=auth(recipient))
    assert review.status_code == 200, review.text
    accepted = client.post(
        f"/v1/reminder-requests/{request_id}/accept", headers=auth(recipient),
        json={"preview_token": review.json()["data"]["preview_token"]},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"]["status"] == "accepted"
    assert accepted.json()["data"]["reminder_id"] is not None
    with app.state.sessions() as database:
        reminder = database.scalar(select(Reminder))
        assert reminder.account_id == recipient["user"]["id"]
        assert reminder.scheduled_at.isoformat() == "2026-09-19T10:30:00+00:00"
        assert database.scalar(select(ReminderEvent).where(ReminderEvent.action == "reminder.scheduled")).actor_account_id == recipient["user"]["id"]


def test_request_views_and_actions_are_bound_to_the_two_participants(client, app):
    organizer, recipient, task_id, proposal, _body, _headers = propose_reminder(client, app)
    outsider = account(client, app, "outsider@example.test")
    identifier = proposal["id"]
    received = client.get("/v1/reminder-requests", headers=auth(recipient)).json()["data"]
    assert [item["id"] for item in received] == [identifier]
    assert received[0]["requested_by"]["account_id"] == organizer["user"]["id"]
    assert client.get("/v1/reminder-requests", headers=auth(organizer)).json()["data"] == []
    sent = client.get("/v1/reminder-requests?direction=sent", headers=auth(organizer)).json()["data"]
    assert [item["id"] for item in sent] == [identifier]
    assert client.get("/v1/reminder-requests", headers=auth(outsider)).json()["data"] == []
    assert client.get(f"/v1/reminder-requests/{identifier}/review", headers=auth(organizer)).status_code == 404
    reviewed = request_review(client, recipient, identifier)
    assert client.post(f"/v1/reminder-requests/{identifier}/accept", headers=auth(outsider), json=reviewed).status_code == 404
    assert client.post(f"/v1/reminder-requests/{identifier}/cancel", headers=auth(recipient), json={}).status_code == 404
    assert client.post(f"/v1/reminder-requests/{identifier}/decline", headers=auth(organizer), json={}).status_code == 404
    assert client.get("/v1/reminder-requests").status_code == 401
    assert client.get("/v1/reminder-requests?direction=all", headers=auth(organizer)).status_code == 422
    accepted = client.post(f"/v1/reminder-requests/{identifier}/accept", headers=auth(recipient), json=reviewed)
    assert accepted.status_code == 200
    assert accepted.json()["data"]["reminder_id"] is not None
    sent = client.get("/v1/reminder-requests?direction=sent", headers=auth(organizer)).json()["data"][0]
    assert sent["status"] == "accepted"
    assert sent["reminder_id"] is None
    assert not {"schedule_key", "request_key", "request_digest", "recipient_admission_id", "requester_admission_id", "acknowledged_at"}.intersection(sent)
    assert client.get(f"/v1/reminders?task_id={task_id}", headers=auth(organizer)).json()["data"] == []


def test_only_task_managers_can_propose_to_the_current_assignee(client, app):
    organizer, recipient, task_id = reminder_request_source(client, app)
    assert request_preview(client, organizer, organizer, task_id).status_code == 422
    assert request_preview(client, recipient, organizer, task_id).status_code == 404
    outsider = account(client, app, "outsider@example.test")
    assert request_preview(client, organizer, outsider, task_id).status_code == 404
    task = client.get(f"/v1/tasks/{task_id}", headers=auth(organizer))
    changed = client.patch(
        f"/v1/tasks/{task_id}", headers={**auth(organizer), "If-Match": task.headers["etag"], "Idempotency-Key": str(uuid4())},
        json={"assignee_account_id": None},
    )
    assert changed.status_code == 200, changed.text
    assert request_preview(client, organizer, recipient, task_id).status_code == 409


def test_request_creation_retries_preserve_identity_after_preview_expiry(client, app):
    organizer, recipient, task_id, proposal, body, headers = propose_reminder(client, app)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _index: client.post("/v1/reminder-requests", headers=headers, json=body), range(2)))
    assert [response.status_code for response in responses] == [201, 201]
    assert {response.json()["data"]["id"] for response in responses} == {proposal["id"]}
    app.state.clock.now += timedelta(minutes=6)
    repeated = client.post("/v1/reminder-requests", headers=headers, json=body)
    assert repeated.status_code == 201
    assert repeated.json()["data"]["id"] == proposal["id"]
    changed_preview = request_preview(client, organizer, recipient, task_id, "2026-09-19T16:10:00")
    assert changed_preview.status_code == 200
    changed = {"preview_token": changed_preview.json()["data"]["options"][0]["preview_token"]}
    assert client.post("/v1/reminder-requests", headers=headers, json=changed).status_code == 409
    assert client.post("/v1/reminder-requests", headers={**auth(organizer), "Idempotency-Key": str(uuid4())}, json=changed).status_code == 409
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ReminderRequest)) == 1
        assert database.scalar(select(func.count()).select_from(ReminderRequestEvent)) == 1
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0


def test_parallel_acceptance_creates_one_schedule_and_one_recipient_inbox_entry(client, app):
    organizer, recipient, task_id, proposal, _body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _index: client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed), range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    assert len({response.json()["data"]["reminder_id"] for response in responses}) == 1
    app.state.engine.dispose()
    app.state.clock.now += timedelta(minutes=31)
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed).status_code == 200
    app.state.reminders.dispatch_due()
    app.state.reminders.dispatch_due()
    assert len(client.get("/v1/notifications", headers=auth(recipient)).json()["data"]) == 1
    assert client.get("/v1/notifications", headers=auth(organizer)).json()["data"] == []
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Reminder)) == 1
        assert database.scalar(select(func.count()).select_from(ReminderRequestEvent).where(ReminderRequestEvent.action == "reminder_request.accepted")) == 1
        assert database.scalar(select(Reminder)).task_id == task_id


@pytest.mark.parametrize("side,revocation,expected", [
    ("requester", "account", 404), ("requester", "membership", 404), ("requester", "admission", 404), ("requester", "grant", 404),
    ("recipient", "account", 401), ("recipient", "membership", 404), ("recipient", "admission", 404), ("recipient", "grant", 404),
    ("recipient", "space", 404),
])
def test_request_acceptance_rechecks_both_admissions_and_grants(client, app, side, revocation, expected):
    organizer, recipient, task_id, proposal, body, headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    target = organizer if side == "requester" else recipient
    with app.state.sessions.begin() as database:
        membership = database.get(SpaceMembership, (proposal["space_id"], target["user"]["id"]))
        if revocation == "account":
            database.get(User, target["user"]["id"]).status = "suspended"
        elif revocation == "membership":
            membership.status = "removed"
        elif revocation == "admission":
            membership.admission_id = str(uuid4())
        elif revocation == "grant":
            database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id, TaskAccess.account_id == target["user"]["id"]))
        else:
            database.get(Space, proposal["space_id"]).status = "archived"
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed).status_code == expected
    assert client.post("/v1/reminder-requests", headers=headers, json=body).status_code in (400, 401, 404)
    with app.state.sessions() as database:
        assert database.get(ReminderRequest, proposal["id"]).status == "pending"
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0


def test_task_changes_invalidate_both_creation_and_recipient_reviews(client, app):
    organizer, recipient, task_id, proposal, _body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    new_preview = request_preview(client, organizer, recipient, task_id).json()["data"]
    with app.state.sessions.begin() as database:
        database.get(Task, task_id).version += 1
    created = client.post("/v1/reminder-requests", headers={**auth(organizer), "Idempotency-Key": str(uuid4())}, json={"preview_token": new_preview["options"][0]["preview_token"]})
    assert created.status_code == 409
    assert created.json()["error"]["code"] == "TASK_CHANGED"
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed).status_code == 409
    listed = client.get("/v1/reminder-requests", headers=auth(recipient)).json()["data"][0]
    assert listed["status"] == "outdated"
    assert listed["source_changed"] is True
    replacement = request_preview(client, organizer, recipient, task_id).json()["data"]
    replaced = client.post("/v1/reminder-requests", headers={**auth(organizer), "Idempotency-Key": str(uuid4())}, json={"preview_token": replacement["options"][0]["preview_token"]})
    assert replaced.status_code == 201, replaced.text
    with app.state.sessions() as database:
        assert database.get(ReminderRequest, proposal["id"]).status == "outdated"
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0


def test_recipient_preferences_are_never_enabled_by_a_proposal_or_old_review(client, app):
    _organizer, recipient, _task_id, proposal, _body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    preference = client.get("/v1/me/notification-preferences", headers=auth(recipient))
    disabled = client.patch("/v1/me/notification-preferences", headers={**auth(recipient), "If-Match": preference.headers["etag"]}, json={"in_app_reminders_enabled": False})
    assert disabled.status_code == 200
    assert client.get(f"/v1/reminder-requests/{proposal['id']}/review", headers=auth(recipient)).status_code == 409
    enabled = client.patch("/v1/me/notification-preferences", headers={**auth(recipient), "If-Match": disabled.headers["etag"]}, json={"in_app_reminders_enabled": True})
    assert enabled.status_code == 200
    rejected = client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed)
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "PREFERENCES_CHANGED"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0
    fresh = request_review(client, recipient, proposal["id"])
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=fresh).status_code == 200


@pytest.mark.parametrize("minutes", [6, 31])
def test_expired_acceptance_review_or_request_cannot_schedule(client, app, minutes):
    _organizer, recipient, _task_id, proposal, _body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    app.state.clock.now += timedelta(minutes=minutes)
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed).status_code == 410
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0


@pytest.mark.parametrize("action,expected", [("decline", "declined"), ("cancel", "cancelled")])
def test_resolved_proposals_cannot_be_accepted_or_reopened(client, app, action, expected):
    organizer, recipient, _task_id, proposal, _body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    actor = recipient if action == "decline" else organizer
    for _attempt in range(2):
        resolved = client.post(f"/v1/reminder-requests/{proposal['id']}/{action}", headers=auth(actor), json={})
        assert resolved.status_code == 200, resolved.text
        assert resolved.json()["data"]["status"] == expected
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed).status_code == 409
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Reminder)) == 0
        assert database.scalar(select(func.count()).select_from(ReminderRequestEvent)) == 2


@pytest.mark.parametrize("action", ["decline", "cancel"])
def test_acceptance_races_have_one_durable_winner(client, app, action):
    organizer, recipient, _task_id, proposal, _body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    actor = recipient if action == "decline" else organizer
    with ThreadPoolExecutor(max_workers=2) as pool:
        accept = pool.submit(client.post, f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed)
        resolve = pool.submit(client.post, f"/v1/reminder-requests/{proposal['id']}/{action}", headers=auth(actor), json={})
        assert sorted([accept.result().status_code, resolve.result().status_code]) == [200, 409]
    with app.state.sessions() as database:
        saved = database.get(ReminderRequest, proposal["id"])
        assert database.scalar(select(func.count()).select_from(Reminder)) == (1 if saved.status == "accepted" else 0)
        assert database.scalar(select(func.count()).select_from(ReminderRequestEvent)) == 2


def test_acceptance_does_not_replace_an_existing_personal_reminder(client, app):
    organizer, recipient, task_id, proposal, _body, _headers = propose_reminder(client, app)
    own_preview = preview_reminder(client, recipient, task_id).json()["data"]
    own = client.post("/v1/reminders", headers={**auth(recipient), "Idempotency-Key": str(uuid4())}, json={"preview_token": own_preview["options"][0]["preview_token"]})
    assert own.status_code == 201
    reviewed = request_review(client, recipient, proposal["id"])
    rejected = client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed)
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "REMINDER_ALREADY_SCHEDULED"
    assert client.post(f"/v1/reminders/{own.json()['data']['id']}/cancel", headers=auth(recipient), json={}).status_code == 200
    accepted = client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed)
    assert accepted.status_code == 200
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/cancel", headers=auth(organizer), json={}).status_code == 409
    reminder_id = accepted.json()["data"]["reminder_id"]
    assert client.post(f"/v1/reminders/{reminder_id}/cancel", headers=auth(recipient), json={}).status_code == 200
    repeated = client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed)
    assert repeated.status_code == 200
    assert repeated.json()["data"]["reminder_id"] == reminder_id
    with app.state.sessions() as database:
        assert database.get(Reminder, reminder_id).status == "cancelled"


def test_request_acceptance_audit_failure_rolls_back_schedule_and_consent(client, app):
    _organizer, recipient, _task_id, proposal, _body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION reject_request_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'reminder_request.accepted' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$"))
        connection.execute(text("CREATE TRIGGER reject_request_acceptance BEFORE INSERT ON reminder_request_events FOR EACH ROW EXECUTE FUNCTION reject_request_acceptance()"))
    try:
        response = client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed)
        assert response.status_code == 503
        with app.state.sessions() as database:
            assert database.get(ReminderRequest, proposal["id"]).status == "pending"
            assert database.scalar(select(func.count()).select_from(Reminder)) == 0
            assert database.scalar(select(func.count()).select_from(ReminderEvent)) == 0
            assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "reminder.scheduled")) == 0
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER reject_request_acceptance ON reminder_request_events"))
            connection.execute(text("DROP FUNCTION reject_request_acceptance()"))
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=reviewed).status_code == 200


def test_request_tokens_cannot_be_used_as_self_schedule_authority(client, app):
    organizer, recipient, _task_id, proposal, body, _headers = propose_reminder(client, app)
    reviewed = request_review(client, recipient, proposal["id"])
    for actor, payload in ((organizer, body), (recipient, reviewed)):
        assert client.post("/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json=payload).status_code == 400
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=body).status_code == 400
    tampered = {"preview_token": reviewed["preview_token"][:-3] + "bad"}
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json=tampered).status_code == 400
    assert client.post(f"/v1/reminder-requests/{proposal['id']}/accept", headers=auth(recipient), json={**reviewed, "recipient_account_id": organizer["user"]["id"]}).status_code == 422


def test_request_cursor_is_bound_to_account_direction_and_current_access(client, app):
    organizer, recipient, _task_id, proposal, _body, _headers = propose_reminder(client, app)
    another = create_task(client, organizer, proposal["space_id"], recipient["user"]["id"]).json()["data"]
    preview = request_preview(client, organizer, recipient, another["id"]).json()["data"]
    created = client.post("/v1/reminder-requests", headers={**auth(organizer), "Idempotency-Key": str(uuid4())}, json={"preview_token": preview["options"][0]["preview_token"]})
    assert created.status_code == 201
    first = client.get("/v1/reminder-requests?limit=1", headers=auth(recipient)).json()
    cursor = first["pagination"]["next_cursor"]
    assert first["pagination"]["has_more"] is True
    assert cursor
    second = client.get("/v1/reminder-requests", headers=auth(recipient), params={"limit": 1, "cursor": cursor})
    assert second.status_code == 200
    assert {first["data"][0]["id"], second.json()["data"][0]["id"]} == {proposal["id"], created.json()["data"]["id"]}
    assert client.get("/v1/reminder-requests", headers=auth(organizer), params={"cursor": cursor}).status_code == 400
    assert client.get("/v1/reminder-requests", headers=auth(recipient), params={"direction": "sent", "cursor": cursor}).status_code == 400
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(TaskAccess.account_id == organizer["user"]["id"]))
    assert client.get("/v1/reminder-requests", headers=auth(recipient), params={"cursor": cursor}).json()["data"] == []


def test_one_time_reminder_persists_and_materializes_one_inbox_item(client, app):
    actor, task_id = reminder_source(client, app)
    preview = preview_reminder(client, actor, task_id)
    assert preview.status_code == 200, preview.text
    reviewed = preview.json()["data"]
    assert reviewed["recipient"]["account_id"] == actor["user"]["id"]
    assert len(reviewed["options"]) == 1
    choice = reviewed["options"][0]
    assert choice["scheduled_at"] == "2026-09-19T10:01:00Z"
    assert choice["dispatch_expires_at"] == "2026-09-20T10:01:00Z"
    created = client.post(
        "/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())},
        json={"preview_token": choice["preview_token"]},
    )
    assert created.status_code == 201, created.text
    reminder = created.json()["data"]
    assert reminder["status"] == "scheduled"
    assert reminder["expires_at"] == choice["dispatch_expires_at"]
    app.state.engine.dispose()
    assert client.get("/v1/notifications", headers=auth(actor)).json()["data"] == []
    app.state.clock.now += timedelta(minutes=2)
    app.state.reminders.dispatch_due(limit=20)
    app.state.reminders.dispatch_due(limit=20)
    inbox = client.get("/v1/notifications", headers=auth(actor))
    assert inbox.status_code == 200, inbox.text
    assert len(inbox.json()["data"]) == 1
    notification = inbox.json()["data"][0]
    assert notification["reminder_id"] == reminder["id"]
    assert notification["read_at"] is None
    assert notification["acknowledged_at"] is None
    read = client.post(f"/v1/notifications/{notification['id']}/read", headers=auth(actor), json={})
    assert read.status_code == 200, read.text
    assert read.json()["data"]["read_at"] is not None
    assert read.json()["data"]["acknowledged_at"] is None
    acknowledged = client.post(f"/v1/notifications/{notification['id']}/acknowledge", headers=auth(actor), json={})
    assert acknowledged.status_code == 200, acknowledged.text
    assert acknowledged.json()["data"]["acknowledged_at"] is not None
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(actor)).json()["data"]["status"] == "open"


def test_confirmed_reminder_retries_once_and_cancel_stops_due_delivery(client, app):
    actor, task_id = reminder_source(client, app)
    preview = preview_reminder(client, actor, task_id)
    assert preview.status_code == 200, preview.text
    body = {"preview_token": preview.json()["data"]["options"][0]["preview_token"]}
    headers = {**auth(actor), "Idempotency-Key": str(uuid4())}
    first = client.post("/v1/reminders", headers=headers, json=body)
    assert first.status_code == 201, first.text
    repeated = client.post("/v1/reminders", headers=headers, json=body)
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["data"]["id"] == first.json()["data"]["id"]
    identifier = first.json()["data"]["id"]
    cancelled = client.post(f"/v1/reminders/{identifier}/cancel", headers=auth(actor), json={})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["data"]["status"] == "cancelled"
    app.state.clock.now += timedelta(minutes=2)
    app.state.reminders.dispatch_due(limit=20)
    assert client.get("/v1/notifications", headers=auth(actor)).json()["data"] == []


def test_reminder_preview_requires_current_task_access(client, app):
    actor, task_id = reminder_source(client, app)
    outsider = account(client, app, "outsider@example.test")
    response = preview_reminder(client, outsider, task_id)
    assert response.status_code == 404, response.text
    assert client.get("/v1/notifications", headers=auth(outsider)).json()["data"] == []
    assert client.get("/v1/notifications").status_code == 401


def test_preview_requires_explicit_dst_choice_and_rejects_gap(client, app):
    actor, task_id = reminder_source(client, app)
    overlap = preview_reminder(client, actor, task_id, "2026-11-01T01:30:00", "America/New_York")
    assert overlap.status_code == 200, overlap.text
    choices = overlap.json()["data"]["options"]
    assert [choice["scheduled_at"] for choice in choices] == ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]
    assert [choice["utc_offset_minutes"] for choice in choices] == [-240, -300]
    gap = preview_reminder(client, actor, task_id, "2027-03-14T02:30:00", "America/New_York")
    assert gap.status_code == 422
    assert gap.json()["error"]["code"] == "LOCAL_TIME_NONEXISTENT"
    selected = client.post("/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"preview_token": choices[1]["preview_token"]})
    assert selected.status_code == 201
    assert selected.json()["data"]["scheduled_at"] == "2026-11-01T06:30:00Z"


@pytest.mark.parametrize("changes", [
    {"local_time": "2026-09-19"}, {"local_time": "2026-09-19T15:31:00+05:30"},
    {"local_time": "2026-09-19T15:31:01"}, {"local_time": 1789812060},
    {"timezone": "IST"}, {"timezone": "Unknown/Zone"},
    {"recipient_account_id": "62f3da14-12e9-4575-9541-caf8b98e2dfd"}, {"channel": "email"},
])
def test_preview_rejects_ambiguous_wire_types_or_extra_authority(client, app, changes):
    actor, task_id = reminder_source(client, app)
    body = {"task_id": task_id, "local_time": "2026-09-19T15:31:00", "timezone": "Asia/Kolkata", **changes}
    assert client.post("/v1/reminders/preview", headers=auth(actor), json=body).status_code == 422


def test_creation_is_idempotent_after_preview_expiry_but_rechecks_grants(client, app):
    actor, task_id, reminder, body, headers = schedule_reminder(client, app, "2026-09-19T16:00:00")
    app.state.clock.now += timedelta(minutes=6)
    retried = client.post("/v1/reminders", headers=headers, json=body)
    assert retried.status_code == 201
    assert retried.json()["data"]["id"] == reminder["id"]
    fresh_key = client.post("/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json=body)
    assert fresh_key.status_code == 410
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id, TaskAccess.account_id == actor["user"]["id"]))
    assert client.post("/v1/reminders", headers=headers, json=body).status_code == 404
    assert client.get("/v1/reminders", headers=auth(actor)).json()["data"] == []


def test_preview_is_bound_to_its_actor_and_task_revision(client, app):
    actor, task_id = reminder_source(client, app)
    outsider = account(client, app, "outsider@example.test")
    preview = preview_reminder(client, actor, task_id).json()["data"]["options"][0]
    body = {"preview_token": preview["preview_token"]}
    assert client.post("/v1/reminders", headers={**auth(outsider), "Idempotency-Key": str(uuid4())}, json=body).status_code == 404
    assert client.post("/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json={"preview_token": preview["preview_token"][:-3] + "bad"}).status_code == 400
    with app.state.sessions.begin() as database:
        database.get(Task, task_id).version += 1
    changed = client.post("/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())}, json=body)
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "TASK_CHANGED"


def test_cancel_before_dispatch_is_durable_and_idempotent(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    for _attempt in range(2):
        response = client.post(f"/v1/reminders/{reminder['id']}/cancel", headers=auth(actor), json={})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "cancelled"
    app.state.clock.now += timedelta(minutes=2)
    assert app.state.reminders.dispatch(reminder["id"]) == "unchanged"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0
        assert database.scalar(select(func.count()).select_from(ReminderEvent).where(ReminderEvent.action == "reminder.cancelled")) == 1


@pytest.mark.parametrize("revocation,reason", [
    ("account", "account_inactive"), ("membership", "access_lost"),
    ("admission", "access_lost"), ("task_grant", "access_lost"),
    ("space", "access_lost"), ("task_cancelled", "task_closed"), ("task_changed", "task_changed"),
])
def test_dispatch_rechecks_current_source_and_recipient(client, app, revocation, reason):
    actor, task_id, reminder, _body, _headers = schedule_reminder(client, app)
    with app.state.sessions.begin() as database:
        task = database.get(Task, task_id)
        if revocation == "account":
            database.get(User, actor["user"]["id"]).status = "suspended"
        elif revocation == "membership":
            database.get(SpaceMembership, (task.space_id, actor["user"]["id"])).status = "removed"
        elif revocation == "admission":
            database.get(SpaceMembership, (task.space_id, actor["user"]["id"])).admission_id = str(uuid4())
        elif revocation == "task_grant":
            database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id))
        elif revocation == "space":
            database.get(Space, task.space_id).status = "archived"
        elif revocation == "task_cancelled":
            task.status = "cancelled"
        else:
            task.title = "Changed task title"
            task.version += 1
    app.state.clock.now += timedelta(minutes=2)
    assert app.state.reminders.dispatch(reminder["id"]) == "suppressed"
    with app.state.sessions() as database:
        assert database.get(Reminder, reminder["id"]).reason == reason
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0


def test_disabling_and_reenabling_preferences_does_not_release_old_backlog(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    before = client.get("/v1/me/notification-preferences", headers=auth(actor))
    assert before.status_code == 200
    disabled = client.patch("/v1/me/notification-preferences", headers={**auth(actor), "If-Match": before.headers["etag"]}, json={"in_app_reminders_enabled": False})
    assert disabled.status_code == 200, disabled.text
    enabled = client.patch("/v1/me/notification-preferences", headers={**auth(actor), "If-Match": disabled.headers["etag"]}, json={"in_app_reminders_enabled": True})
    assert enabled.status_code == 200
    app.state.clock.now += timedelta(minutes=2)
    assert app.state.reminders.dispatch(reminder["id"]) == "suppressed"
    with app.state.sessions() as database:
        assert database.get(Reminder, reminder["id"]).reason == "preference_revoked"


def test_scheduler_survives_login_expiry_without_using_an_old_bearer(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app, "2026-09-20T00:31:00")
    app.state.clock.now += timedelta(hours=10)
    assert client.get("/v1/notifications", headers=auth(actor)).status_code == 401
    assert app.state.reminders.dispatch(reminder["id"]) == "available"
    with app.state.sessions() as database:
        session = database.get(AccountSession, actor["session_id"])
        assert session.expires_at <= app.state.clock.now
        event = database.scalar(select(ReminderEvent).where(ReminderEvent.action == "reminder.available"))
        assert event.actor_kind == "scheduler"
        assert event.actor_account_id is None
    login = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD})
    assert login.status_code == 200
    assert len(client.get("/v1/notifications", headers=auth(login.json()["data"])).json()["data"]) == 1


def test_parallel_dispatch_and_creations_have_single_logical_effect(client, app):
    actor, _task_id, reminder, body, headers = schedule_reminder(client, app)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _index: client.post("/v1/reminders", headers=headers, json=body), range(2)))
    assert [response.status_code for response in responses] == [201, 201]
    app.state.clock.now += timedelta(minutes=2)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _index: app.state.reminders.dispatch(reminder["id"]), range(2)))
    assert results.count("available") == 1
    app.state.reminders.dispatch_due()
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Reminder)) == 1
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 1
        assert database.scalar(select(func.count()).select_from(ReminderEvent).where(ReminderEvent.action == "reminder.available")) == 1
    assert client.post(f"/v1/reminders/{reminder['id']}/cancel", headers=auth(actor), json={}).status_code == 409


def test_inbox_revocation_hides_history_counts_and_acknowledgment(client, app):
    actor, task_id, _reminder, _body, _headers = schedule_reminder(client, app)
    outsider = account(client, app, "other@example.test")
    app.state.clock.now += timedelta(minutes=2)
    app.state.reminders.dispatch_due()
    response = client.get("/v1/notifications", headers=auth(actor)).json()
    assert response["unread_count"] == 1
    identifier = response["data"][0]["id"]
    assert client.get("/v1/notifications", headers=auth(outsider)).json()["data"] == []
    assert client.post(f"/v1/notifications/{identifier}/read", headers=auth(outsider), json={}).status_code == 404
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id))
    hidden = client.get("/v1/notifications", headers=auth(actor)).json()
    assert hidden["data"] == []
    assert hidden["unread_count"] == 0
    assert client.post(f"/v1/notifications/{identifier}/acknowledge", headers=auth(actor), json={}).status_code == 404


def test_late_catchup_expires_instead_of_bursting_old_reminders(client, app):
    _actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(hours=25)
    assert app.state.reminders.dispatch(reminder["id"]) == "expired"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0


def test_required_scheduler_audit_failure_rolls_back_inbox_and_reminder(client, app):
    _actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(minutes=2)
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION reject_reminder_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_kind = 'scheduler' THEN RAISE EXCEPTION 'synthetic audit outage'; END IF; RETURN NEW; END $$"))
        connection.execute(text("CREATE TRIGGER reminder_audit_failure BEFORE INSERT ON reminder_events FOR EACH ROW EXECUTE FUNCTION reject_reminder_audit()"))
    try:
        with pytest.raises(SQLAlchemyError):
            app.state.reminders.dispatch(reminder["id"])
        with app.state.sessions() as database:
            assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0
            assert database.get(Reminder, reminder["id"]).status == "scheduled"
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER reminder_audit_failure ON reminder_events"))
            connection.execute(text("DROP FUNCTION reject_reminder_audit()"))
    assert app.state.reminders.dispatch(reminder["id"]) == "available"


def test_creation_audit_and_outbox_are_committed_once_without_tokens(client, app):
    actor, _task_id, reminder, body, headers = schedule_reminder(client, app)
    assert client.post("/v1/reminders", headers=headers, json=body).status_code == 201
    with app.state.sessions() as database:
        events = database.scalars(select(ReminderEvent).where(ReminderEvent.reminder_id == reminder["id"])).all()
        assert len(events) == 1
        assert events[0].actor_kind == "user"
        assert events[0].actor_account_id == actor["user"]["id"]
        assert database.get(OutboxEvent, events[0].id).event_type == "reminder.scheduled"
        stored = database.get(Reminder, reminder["id"])
        assert stored.request_digest != body["preview_token"]


def test_cancel_and_dispatch_race_preserves_one_committed_outcome(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(minutes=2)
    with ThreadPoolExecutor(max_workers=2) as pool:
        cancelled = pool.submit(
            client.post, f"/v1/reminders/{reminder['id']}/cancel", headers=auth(actor), json={}
        )
        dispatched = pool.submit(app.state.reminders.dispatch, reminder["id"])
        response = cancelled.result()
        dispatched.result()
    app.state.reminders.dispatch_due()
    with app.state.sessions() as database:
        current = database.get(Reminder, reminder["id"])
        count = database.scalar(select(func.count()).select_from(InAppNotification))
        if current.status == "cancelled":
            assert response.status_code == 200
            assert count == 0
        else:
            assert current.status == "available"
            assert response.status_code == 409
            assert count == 1


def test_acknowledgment_does_not_mark_read_or_complete_task_and_retries_once(client, app):
    actor, task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(minutes=2)
    app.state.reminders.dispatch_due()
    notification = client.get("/v1/notifications", headers=auth(actor)).json()["data"][0]
    path = f"/v1/notifications/{notification['id']}/acknowledge"
    first = client.post(path, headers=auth(actor), json={})
    assert first.status_code == 200
    assert first.json()["data"]["read_at"] is None
    acknowledged_at = first.json()["data"]["acknowledged_at"]
    app.state.clock.now += timedelta(minutes=1)
    repeated = client.post(path, headers=auth(actor), json={})
    assert repeated.status_code == 200
    assert repeated.json()["data"]["acknowledged_at"] == acknowledged_at
    assert repeated.json()["data"]["read_at"] is None
    assert client.get("/v1/notifications", headers=auth(actor)).json()["unread_count"] == 1
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(actor)).json()["data"]["status"] == "open"
    with app.state.sessions() as database:
        events = database.scalars(select(ReminderEvent).where(
            ReminderEvent.reminder_id == reminder["id"], ReminderEvent.action == "notification.acknowledge"
        )).all()
        assert len(events) == 1
        assert events[0].actor_account_id == actor["user"]["id"]


def test_one_failed_delivery_does_not_block_later_work_and_has_bounded_retry(client, app):
    from app.modules.scheduling import service as scheduling_service

    actor, _task_id, failing, _body, _headers = schedule_reminder(client, app)
    space_id = create_space(client, actor, "Second family").json()["data"]["id"]
    task = create_task(client, actor, space_id, actor["user"]["id"])
    preview = preview_reminder(client, actor, task.json()["data"]["id"], "2026-09-19T15:32:00")
    assert preview.status_code == 200, preview.text
    healthy = client.post(
        "/v1/reminders", headers={**auth(actor), "Idempotency-Key": str(uuid4())},
        json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]},
    )
    assert healthy.status_code == 201, healthy.text
    with app.state.engine.begin() as connection:
        connection.execute(text(
            "CREATE FUNCTION reject_one_inbox_item() RETURNS trigger LANGUAGE plpgsql "
            "AS $$ BEGIN RAISE EXCEPTION 'synthetic single delivery failure'; END $$"
        ))
        connection.execute(text(
            "CREATE TRIGGER single_delivery_failure BEFORE INSERT ON in_app_notifications "
            f"FOR EACH ROW WHEN (NEW.reminder_id = '{failing['id']}') "
            "EXECUTE FUNCTION reject_one_inbox_item()"
        ))
    try:
        app.state.clock.now += timedelta(minutes=3)
        result = app.state.reminders.dispatch_due(limit=20)
        assert result.get("available") == 1
        with app.state.sessions() as database:
            delayed = database.get(Reminder, failing["id"])
            assert delayed.status == "scheduled"
            assert delayed.dispatch_attempts == 1
            assert delayed.next_attempt_at > app.state.clock.now
            assert database.get(Reminder, healthy.json()["data"]["id"]).status == "available"
        assert app.state.reminders.dispatch_due(limit=20) == {}
        for expected_attempt in range(2, scheduling_service.MAX_DISPATCH_ATTEMPTS + 1):
            with app.state.sessions() as database:
                app.state.clock.now = database.get(Reminder, failing["id"]).next_attempt_at
            app.state.reminders.dispatch_due(limit=20)
            with app.state.sessions() as database:
                assert database.get(Reminder, failing["id"]).dispatch_attempts == expected_attempt
        with app.state.sessions() as database:
            stopped = database.get(Reminder, failing["id"])
            assert stopped.status == "failed"
            assert stopped.reason == "dispatch_failed"
            assert database.scalar(select(func.count()).select_from(InAppNotification)) == 1
        assert app.state.reminders.dispatch_due(limit=20) == {}
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER single_delivery_failure ON in_app_notifications"))
            connection.execute(text("DROP FUNCTION reject_one_inbox_item()"))


def test_retry_schedule_survives_restart_and_recovers_one_notification(client, app, monkeypatch):
    from app.main import create_app

    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(minutes=2)

    def unavailable(_identifier):
        raise SQLAlchemyError("synthetic rolled-back delivery")

    monkeypatch.setattr(app.state.reminders, "dispatch", unavailable)
    assert app.state.reminders.dispatch_due() == {"retry_scheduled": 1}
    restarted = create_app(app.state.settings, app.state.clock)
    try:
        assert restarted.state.reminders.dispatch_due() == {}
        with app.state.sessions() as database:
            waiting = database.get(Reminder, reminder["id"])
            assert waiting.dispatch_attempts == 1
            assert waiting.last_failure_at == app.state.clock.now
            app.state.clock.now = waiting.next_attempt_at
        assert restarted.state.reminders.dispatch_due() == {"available": 1}
        assert restarted.state.reminders.dispatch_due() == {}
        inbox = client.get("/v1/notifications", headers=auth(actor)).json()["data"]
        assert len(inbox) == 1
        with app.state.sessions() as database:
            recovered = database.get(Reminder, reminder["id"])
            assert recovered.reason is None
            assert recovered.next_attempt_at is None
            assert recovered.dispatch_attempts == 1
    finally:
        restarted.state.engine.dispose()


def test_failure_record_cannot_reopen_cancelled_or_committed_reminder(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    assert client.post(f"/v1/reminders/{reminder['id']}/cancel", headers=auth(actor), json={}).status_code == 200
    assert app.state.reminders.record_dispatch_failure(reminder["id"]) == "unchanged"
    with app.state.sessions() as database:
        assert database.get(Reminder, reminder["id"]).dispatch_attempts == 0


def test_cancel_pending_retry_clears_future_work_but_keeps_failure_history(client, app):
    actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(minutes=2)
    assert app.state.reminders.record_dispatch_failure(reminder["id"]) == "retry_scheduled"
    cancelled = client.post(f"/v1/reminders/{reminder['id']}/cancel", headers=auth(actor), json={})
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "cancelled"
    assert cancelled.json()["data"]["reason"] is None
    with app.state.sessions() as database:
        stored = database.get(Reminder, reminder["id"])
        assert stored.next_attempt_at is None
        assert stored.dispatch_attempts == 1
        assert stored.last_failure_at is not None
    app.state.clock.now += timedelta(minutes=10)
    assert app.state.reminders.dispatch_due() == {}


def test_retry_does_not_send_after_membership_revocation(client, app, monkeypatch):
    actor, task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(minutes=2)
    original = app.state.reminders.dispatch

    def unavailable(_identifier):
        raise SQLAlchemyError("synthetic rolled-back delivery")

    monkeypatch.setattr(app.state.reminders, "dispatch", unavailable)
    assert app.state.reminders.dispatch_due() == {"retry_scheduled": 1}
    with app.state.sessions.begin() as database:
        task = database.get(Task, task_id)
        database.get(SpaceMembership, (task.space_id, actor["user"]["id"])).status = "removed"
        app.state.clock.now = database.get(Reminder, reminder["id"]).next_attempt_at
    monkeypatch.setattr(app.state.reminders, "dispatch", original)
    assert app.state.reminders.dispatch_due() == {"suppressed": 1}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0
        assert database.get(Reminder, reminder["id"]).reason == "access_lost"


def test_dispatch_disable_leaves_durable_work_unexecuted(client, app):
    _actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    app.state.clock.now += timedelta(minutes=2)
    app.state.settings.reminder_dispatch_enabled = False
    assert app.state.reminders.dispatch_due() == {"paused": 1}
    assert app.state.reminders.dispatch(reminder["id"]) == "paused"
    with app.state.sessions() as database:
        assert database.get(Reminder, reminder["id"]).status == "scheduled"
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 0
    app.state.settings.reminder_dispatch_enabled = True
    assert app.state.reminders.dispatch(reminder["id"]) == "available"


def test_separate_worker_process_recovers_persisted_due_work_without_duplicate(client, app):
    _actor, _task_id, reminder, _body, _headers = schedule_reminder(client, app)
    with app.state.sessions.begin() as database:
        stored = database.get(Reminder, reminder["id"])
        stored.scheduled_at = utcnow() - timedelta(minutes=1)
        stored.expires_at = utcnow() + timedelta(hours=1)
    environment = {
        **os.environ,
        "COMMUNITY_SECRET_KEY": app.state.settings.secret_key,
        "COMMUNITY_REMINDER_DISPATCH_ENABLED": "true",
    }
    for expected in ({"available": 1}, {}):
        # The limit only guards against a hung worker: starting one can take over 20 s when the machine is busy.
        execution = subprocess.run(
            [sys.executable, "-m", "app.reminder_worker", "--once"],
            env=environment, capture_output=True, text=True, timeout=60,
        )
        assert execution.returncode == 0, execution.stderr
        assert json.loads(execution.stdout)["counts"] == expected
    with app.state.sessions() as database:
        assert database.get(Reminder, reminder["id"]).status == "available"
        assert database.scalar(select(func.count()).select_from(InAppNotification)) == 1