import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text

from app.main import create_app
from app.modules.identity.models import IdentityMail, OutboxEvent, User
from app.modules.planning import service as planning_service
from app.modules.planning.models import Task, TaskAccess, TaskAudit, TaskCommand
from app.modules.spaces.models import Space, SpaceMembership

from .test_identity import account, auth
from .test_spaces import create_space, invite_account


def family(client, app):
    owner = account(client, app)
    member = account(client, app, "member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    invitation = invite_account(client, owner, space_id, member["user"]["id"])
    assert invitation.status_code == 201, invitation.text
    accepted = client.post(
        f"/v1/invitations/{invitation.json()['data']['id']}/accept",
        headers=auth(member), json={},
    )
    assert accepted.status_code == 200, accepted.text
    return owner, member, space_id


def create_task(client, actor, space_id, assignee_id=None, key=None, **fields):
    return client.post(
        "/v1/tasks",
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={
            "space_id": space_id, "title": "Buy groceries", "description": "Fruit and bread",
            "due_date": "2026-09-21", "assignee_account_id": assignee_id, **fields,
        },
    )


def change_task(client, actor, task_id, body, etag=None, key=None, operation="edit"):
    headers = {**auth(actor), "Idempotency-Key": key or str(uuid4())}
    if etag is not None:
        headers["If-Match"] = etag
    suffix = "/status" if operation == "status" else ""
    return client.request(
        "POST" if operation == "status" else "PATCH",
        f"/v1/tasks/{task_id}{suffix}", headers=headers, json=body,
    )


def test_checklist_preserves_retry_identity_and_separate_task_completion(client, app):
    owner, assignee, space_id = family(client, app)
    task_id = create_task(client, owner, space_id, assignee["user"]["id"]).json()["data"]["id"]
    path = f"/v1/tasks/{task_id}/checklist"
    review = client.get(path, headers=auth(owner))
    assert review.status_code == 200, review.text
    assert review.json()["data"]["items"] == []
    headers = {**auth(owner), "If-Match": review.json()["data"]["etag"], "Idempotency-Key": str(uuid4())}
    added = client.post(path, headers=headers, json={"action": "add", "title": "Buy fruit"})
    assert added.status_code == 200, added.text
    assert client.post(path, headers=headers, json={"action": "add", "title": "Buy fruit"}).json()["data"] == added.json()["data"]
    item_id = added.json()["data"]["items"][0]["id"]
    assigned = client.get(path, headers=auth(assignee)).json()["data"]
    assert assigned["can_check"] and not assigned["can_manage"]
    checked = client.post(path, headers={**auth(assignee), "If-Match": assigned["etag"], "Idempotency-Key": str(uuid4())}, json={"action": "check", "item_id": item_id, "checked": True})
    assert checked.status_code == 200, checked.text
    assert checked.json()["data"]["items"][0]["checked_by_account_id"] == assignee["user"]["id"]
    assert checked.json()["data"]["task_status"] == "open"
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(owner)).json()["data"]["status"] == "open"
    denied = client.post(path, headers={**auth(assignee), "If-Match": checked.json()["data"]["etag"], "Idempotency-Key": str(uuid4())}, json={"action": "remove", "item_id": item_id})
    assert denied.status_code == 403


def test_checklist_conflicts_removed_item_replay_and_revoked_grant(client, app):
    owner, _member, space_id = family(client, app)
    task_id = create_task(client, owner, space_id).json()["data"]["id"]
    path = f"/v1/tasks/{task_id}/checklist"
    review = client.get(path, headers=auth(owner)).json()["data"]
    headers = {**auth(owner), "Idempotency-Key": str(uuid4())}
    body = {"action": "add", "title": "Original item"}
    assert client.post(path, headers=headers, json=body).status_code == 428
    headers["If-Match"] = review["etag"]
    added = client.post(path, headers=headers, json=body).json()["data"]
    assert client.post(path, headers=headers, json={**body, "title": "Different"}).status_code == 409
    assert client.post(path, headers={**headers, "Idempotency-Key": str(uuid4())}, json=body).status_code == 412
    removed = client.post(path, headers={**auth(owner), "If-Match": added["etag"], "Idempotency-Key": str(uuid4())}, json={"action": "remove", "item_id": added["items"][0]["id"]})
    assert removed.status_code == 200
    assert removed.json()["data"]["items"] == []
    assert client.post(path, headers=headers, json=body).json()["data"]["items"] == []
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id, TaskAccess.account_id == owner["user"]["id"]))
    assert client.get(path, headers=auth(owner)).status_code == 404
    assert client.post(path, headers=headers, json=body).status_code == 404


def test_checklist_rename_clears_completion_and_cannot_target_another_task(client, app):
    owner, _member, space_id = family(client, app)
    task_id = create_task(client, owner, space_id).json()["data"]["id"]
    other_task = create_task(client, owner, space_id).json()["data"]["id"]
    path = f"/v1/tasks/{task_id}/checklist"
    def command(body):
        review = client.get(path, headers=auth(owner)).json()["data"]
        return client.post(path, headers={**auth(owner), "If-Match": review["etag"], "Idempotency-Key": str(uuid4())}, json=body)
    item_id = command({"action": "add", "title": "Item"}).json()["data"]["items"][0]["id"]
    checked = command({"action": "check", "item_id": item_id, "checked": True})
    assert checked.status_code == 200
    assert command({"action": "check", "item_id": item_id, "checked": True}).status_code == 409
    renamed = command({"action": "rename", "item_id": item_id, "title": "Changed meaning"}).json()["data"]["items"][0]
    assert not renamed["checked"] and renamed["checked_at"] is None and renamed["checked_by_account_id"] is None
    path = f"/v1/tasks/{other_task}/checklist"
    assert command({"action": "remove", "item_id": item_id}).status_code == 404


@pytest.mark.parametrize("body", [
    {"action": "add", "title": "Item", "checked": True}, {"action": "add", "title": " "},
    {"action": "add", "title": "Item", "account_id": str(uuid4())},
    {"action": "check", "item_id": str(uuid4()), "checked": "true"},
    {"action": "remove"}, {"action": "rename", "item_id": str(uuid4()), "title": None},
])
def test_checklist_strict_action_fields(client, app, body):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    task_id = create_task(client, owner, space_id).json()["data"]["id"]
    assert client.post(f"/v1/tasks/{task_id}/checklist", headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": '"review"'}, json=body).status_code == 422


def test_checklist_audit_failure_and_concurrent_retry_are_atomic(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    task_id = create_task(client, owner, space_id).json()["data"]["id"]
    path = f"/v1/tasks/{task_id}/checklist"
    review = client.get(path, headers=auth(owner)).json()["data"]
    headers = {**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": review["etag"]}
    body = {"action": "add", "title": "Atomic item"}
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION reject_checklist() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'task.checklist_add' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$"))
        connection.execute(text("CREATE TRIGGER reject_checklist BEFORE INSERT ON domain_outbox FOR EACH ROW EXECUTE FUNCTION reject_checklist()"))
    try:
        assert client.post(path, headers=headers, json=body).status_code == 503
        assert client.get(path, headers=auth(owner)).json()["data"] == review
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER reject_checklist ON domain_outbox; DROP FUNCTION reject_checklist()"))
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _attempt: client.post(path, headers=headers, json=body), range(3)))
    assert [result.status_code for result in results] == [200, 200, 200]
    assert len({result.json()["data"]["items"][0]["id"] for result in results}) == 1
    with app.state.sessions() as database:
        assert database.scalar(text("SELECT count(*) FROM task_checklist_items")) == 1


def test_calendar_preserves_due_dates_and_personal_reminder_day(client, app):
    owner, member, space_id = family(client, app)
    created = create_task(client, owner, space_id)
    assert created.status_code == 201
    task_id = created.json()["data"]["id"]
    preview = client.post("/v1/reminders/preview", headers=auth(owner), json={
        "task_id": task_id, "local_time": "2026-09-21T00:15", "timezone": "Asia/Kolkata",
    })
    assert preview.status_code == 200, preview.text
    saved = client.post("/v1/reminders", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={
        "preview_token": preview.json()["data"]["options"][0]["preview_token"],
    })
    assert saved.status_code == 201, saved.text
    query = {"space_id": space_id, "start_date": "2026-09-20", "end_date": "2026-09-21", "timezone": "UTC"}
    response = client.get("/v1/calendar", params=query, headers=auth(owner))
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert [(row["kind"], row["date"]) for row in response.json()["data"]] == [
        ("reminder", "2026-09-20"), ("task", "2026-09-21"),
    ]
    assert response.json()["data"][1]["scheduled_at"] is None
    assert response.json()["data"][0]["timezone"] == "Asia/Kolkata"
    member_rows = client.get("/v1/calendar", params=query, headers=auth(member)).json()["data"]
    assert [(row["kind"], row["id"]) for row in member_rows] == [("task", task_id)]
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id, TaskAccess.account_id == owner["user"]["id"]))
    assert client.get("/v1/calendar", params=query, headers=auth(owner)).json()["data"] == []


def test_calendar_pagination_binds_account_admission_range_and_zone(client, app):
    owner, member, space_id = family(client, app)
    identifiers = [create_task(client, owner, space_id, title=f"Task {index}").json()["data"]["id"] for index in range(3)]
    query = {"space_id": space_id, "start_date": "2026-09-21", "end_date": "2026-09-21", "timezone": "Asia/Kolkata", "limit": 1}
    first = client.get("/v1/calendar", params=query, headers=auth(owner))
    assert first.status_code == 200, first.text
    cursor = first.json()["pagination"]["next_cursor"]
    assert cursor
    assert client.get("/v1/calendar", params={**query, "cursor": cursor}, headers=auth(member)).status_code == 400
    for change in ({"timezone": "UTC"}, {"end_date": "2026-09-22"}, {"start_date": "2026-09-20"}, {"cursor": "invalid"}):
        assert client.get("/v1/calendar", params={**query, "cursor": cursor, **change}, headers=auth(owner)).status_code == 400
    observed = [first.json()["data"][0]["id"]]
    for _page in range(2):
        response = client.get("/v1/calendar", params={**query, "cursor": cursor}, headers=auth(owner))
        assert response.status_code == 200, response.text
        observed.extend(row["id"] for row in response.json()["data"])
        cursor = response.json()["pagination"]["next_cursor"]
    assert observed == sorted(identifiers)
    assert cursor is None
    app.state.clock.now += timedelta(minutes=16)
    assert client.get("/v1/calendar", params={**query, "cursor": first.json()["pagination"]["next_cursor"]}, headers=auth(owner)).status_code == 410


def test_calendar_fold_order_and_terminal_status_are_not_delivery_promises(client, app):
    owner, _member, space_id = family(client, app)
    for index in range(2):
        task_id = create_task(client, owner, space_id, due_date="2026-11-01").json()["data"]["id"]
        preview = client.post("/v1/reminders/preview", headers=auth(owner), json={
            "task_id": task_id, "local_time": "2026-11-01T01:30", "timezone": "America/New_York",
        })
        assert preview.status_code == 200, preview.text
        saved = client.post("/v1/reminders", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={
            "preview_token": preview.json()["data"]["options"][index]["preview_token"],
        })
        assert saved.status_code == 201, saved.text
        if index == 0:
            assert client.post(f"/v1/reminders/{saved.json()['data']['id']}/cancel", headers=auth(owner), json={}).status_code == 200
    query = {"space_id": space_id, "start_date": "2026-11-01", "end_date": "2026-11-01", "timezone": "America/New_York", "limit": 1}
    entries = []
    for _page in range(4):
        response = client.get("/v1/calendar", params=query, headers=auth(owner))
        assert response.status_code == 200, response.text
        entries.extend(response.json()["data"])
        query["cursor"] = response.json()["pagination"]["next_cursor"]
    assert query["cursor"] is None
    assert [row["kind"] for row in entries] == ["task", "task", "reminder", "reminder"]
    assert [row["scheduled_at"] for row in entries[2:]] == ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]
    assert [row["status"] for row in entries[2:]] == ["cancelled", "scheduled"]


@pytest.mark.parametrize("changes", [
    {"start_date": "2026-09-21T00:00:00Z"}, {"start_date": "2026-02-30"},
    {"start_date": "2026-10-01"}, {"end_date": "2026-10-22"},
    {"timezone": "IST"}, {"timezone": "Invalid/Zone"}, {"limit": 101}, {"start_date": "1899-12-31"},
])
def test_calendar_rejects_ambiguous_or_unbounded_queries(client, app, changes):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    query = {"space_id": space_id, "start_date": "2026-09-21", "end_date": "2026-09-21", "timezone": "UTC", **changes}
    assert client.get("/v1/calendar", params=query, headers=auth(owner)).status_code == 422


def test_calendar_rejects_outsider_and_removed_member(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "calendar-outsider@example.test")
    query = {"space_id": space_id, "start_date": "2026-09-21", "end_date": "2026-09-21", "timezone": "UTC"}
    assert client.get("/v1/calendar", params=query).status_code == 401
    assert client.get("/v1/calendar", params=query, headers=auth(outsider)).status_code == 404
    assert create_task(client, owner, space_id).status_code == 201
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (space_id, member["user"]["id"])).status = "removed"
    assert client.get("/v1/calendar", params=query, headers=auth(member)).status_code == 404
    invitation = invite_account(client, owner, space_id, member["user"]["id"])
    assert invitation.status_code == 201
    assert client.post(f"/v1/invitations/{invitation.json()['data']['id']}/accept", headers=auth(member), json={}).status_code == 200
    assert client.get("/v1/calendar", params=query, headers=auth(member)).json()["data"] == []


def test_family_task_can_be_read_and_completed_only_with_current_access(client, app):
    owner, assignee, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    created = create_task(client, owner, space_id, assignee["user"]["id"])
    assert created.status_code == 201, created.text
    task = created.json()["data"]
    assert task["title"] == "Buy groceries"
    assert task["due_date"] == "2026-09-21"
    assert task["assignee"]["account_id"] == assignee["user"]["id"]
    assert task["status"] == "open"
    assert created.headers["cache-control"] == "no-store"
    path = f"/v1/tasks/{task['id']}"
    current = client.get(path, headers=auth(assignee))
    assert current.status_code == 200, current.text
    assert client.get(path, headers=auth(outsider)).status_code == 404
    assert client.get("/v1/tasks", params={"space_id": space_id}, headers=auth(outsider)).status_code == 404
    completed = client.post(
        f"{path}/status", json={"status": "completed"},
        headers={**auth(assignee), "If-Match": current.headers["etag"], "Idempotency-Key": str(uuid4())},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["data"]["completed_by_account_id"] == assignee["user"]["id"]
    assert completed.json()["data"]["completed_at"] is not None
    assert client.get(path, headers=auth(owner)).json()["data"]["status"] == "completed"


def test_task_history_does_not_automatically_expand_to_new_members(client, app):
    owner = account(client, app)
    newcomer = account(client, app, "newcomer@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    created = create_task(client, owner, space_id)
    assert created.status_code == 201, created.text
    task_id = created.json()["data"]["id"]
    invitation = invite_account(client, owner, space_id, newcomer["user"]["id"])
    accepted = client.post(
        f"/v1/invitations/{invitation.json()['data']['id']}/accept",
        headers=auth(newcomer), json={},
    )
    assert accepted.status_code == 200
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(newcomer)).status_code == 404
    listing = client.get("/v1/tasks", params={"space_id": space_id}, headers=auth(newcomer))
    assert listing.status_code == 200
    assert listing.json()["data"] == []


def test_task_creation_receipt_respects_revoked_object_access(client, app):
    owner, _member, space_id = family(client, app)
    key = str(uuid4())
    created = create_task(client, owner, space_id, key=key)
    assert created.status_code == 201
    task_id = created.json()["data"]["id"]
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(
            TaskAccess.task_id == task_id, TaskAccess.account_id == owner["user"]["id"]
        ))
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(owner)).status_code == 404
    replayed = create_task(client, owner, space_id, key=key)
    assert replayed.status_code == 404, replayed.text


def test_concurrent_task_creation_reuses_one_audience_and_event(client, app):
    owner, member, space_id = family(client, app)
    key = str(uuid4())
    with app.state.sessions() as database:
        mail_before = database.scalar(select(func.count()).select_from(IdentityMail))
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = list(pool.map(lambda _attempt: create_task(
            client, owner, space_id, member["user"]["id"], key
        ), range(3)))
    assert [response.status_code for response in responses] == [201, 201, 201]
    assert len({response.json()["data"]["id"] for response in responses}) == 1
    conflict = create_task(client, owner, space_id, member["user"]["id"], key, title="Different request")
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Task)) == 1
        assert database.scalar(select(func.count()).select_from(TaskAccess)) == 2
        audit = database.scalars(select(TaskAudit)).one()
        event = database.scalars(select(OutboxEvent).where(OutboxEvent.event_type == "task.created")).one()
        assert audit.id == event.id
        assert audit.task_id == event.aggregate_id
        assert database.scalar(select(func.count()).select_from(IdentityMail)) == mail_before


def test_task_creator_and_owner_manage_but_reader_cannot_mutate(client, app):
    owner, member, space_id = family(client, app)
    created = create_task(client, owner, space_id, owner["user"]["id"])
    task_id = created.json()["data"]["id"]
    reader = client.get(f"/v1/tasks/{task_id}", headers=auth(member))
    assert reader.status_code == 200
    assert reader.json()["data"]["permissions"] == {"can_edit": False, "allowed_statuses": []}
    assert change_task(client, member, task_id, {"title": "Not allowed"}, reader.headers["etag"]).status_code == 403
    assert change_task(client, member, task_id, {"status": "completed"}, reader.headers["etag"], operation="status").status_code == 403
    assert client.get("/v1/tasks/assignees", params={"space_id": space_id, "task_id": task_id}, headers=auth(member)).status_code == 403
    own_task = create_task(client, member, space_id)
    assert own_task.status_code == 201
    own_id = own_task.json()["data"]["id"]
    manager = client.get(f"/v1/tasks/{own_id}", headers=auth(owner))
    assert manager.json()["data"]["permissions"]["can_edit"] is True
    assert change_task(client, owner, own_id, {"title": "Owner revision"}, manager.headers["etag"]).status_code == 200


def test_edits_require_preconditions_and_stable_mutation_identity(client, app):
    owner, _member, space_id = family(client, app)
    created = create_task(client, owner, space_id)
    task_id = created.json()["data"]["id"]
    original_tag = created.headers["etag"]
    body = {"description": "Revised notes", "due_date": None}
    assert change_task(client, owner, task_id, body).status_code == 428
    assert change_task(client, owner, task_id, body, '"stale"').status_code == 412
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        changed = list(pool.map(lambda _attempt: change_task(
            client, owner, task_id, body, original_tag, key
        ), range(2)))
    assert [response.status_code for response in changed] == [200, 200]
    assert {response.json()["data"]["version"] for response in changed} == {"2"}
    assert changed[0].json()["data"]["due_date"] is None
    assert change_task(client, owner, task_id, {"description": "Changed again"}, original_tag, key).status_code == 409
    assert change_task(client, owner, task_id, {"title": "Stale write"}, original_tag).status_code == 412
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(TaskCommand)) == 1
        assert database.get(Task, task_id).title == "Buy groceries"


def test_completion_reopen_and_delayed_retry_preserve_actual_outcome(client, app):
    owner, assignee, space_id = family(client, app)
    task_id = create_task(client, owner, space_id, assignee["user"]["id"]).json()["data"]["id"]
    original = client.get(f"/v1/tasks/{task_id}", headers=auth(assignee))
    original_tag = original.headers["etag"]
    key = str(uuid4())
    completed = change_task(client, assignee, task_id, {"status": "completed"}, original_tag, key, "status")
    assert completed.status_code == 200
    completed_at = completed.json()["data"]["completed_at"]
    app.state.clock.now += timedelta(minutes=2)
    repeated = change_task(client, assignee, task_id, {"status": "completed"}, original_tag, key, "status")
    assert repeated.status_code == 200
    assert repeated.json()["data"]["completed_at"] == completed_at
    owner_read = client.get(f"/v1/tasks/{task_id}", headers=auth(owner))
    assert change_task(client, owner, task_id, {"title": "Changed while closed"}, owner_read.headers["etag"]).status_code == 409
    reopened = change_task(client, assignee, task_id, {"status": "open"}, repeated.headers["etag"], operation="status")
    assert reopened.status_code == 200
    assert reopened.json()["data"]["completed_at"] is None
    assert reopened.json()["data"]["completed_by_account_id"] is None
    late_retry = change_task(client, assignee, task_id, {"status": "completed"}, original_tag, key, "status")
    assert late_retry.status_code == 200
    assert late_retry.json()["data"]["status"] == "open"
    assert late_retry.json()["data"]["version"] == "3"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(TaskAudit).where(TaskAudit.action == "task.completed")) == 1


def test_status_permissions_and_cancellation_are_not_generic_patches(client, app):
    owner, assignee, space_id = family(client, app)
    task_id = create_task(client, owner, space_id, assignee["user"]["id"]).json()["data"]["id"]
    assigned = client.get(f"/v1/tasks/{task_id}", headers=auth(assignee))
    assert change_task(client, assignee, task_id, {"status": "cancelled"}, assigned.headers["etag"], operation="status").status_code == 409
    progress = change_task(client, assignee, task_id, {"status": "in_progress"}, assigned.headers["etag"], operation="status")
    assert progress.status_code == 200
    current = client.get(f"/v1/tasks/{task_id}", headers=auth(owner))
    assert change_task(client, owner, task_id, {"status": "completed"}, current.headers["etag"]).status_code == 422
    cancelled = change_task(client, owner, task_id, {"status": "cancelled"}, current.headers["etag"], operation="status")
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["permissions"] == {"can_edit": False, "allowed_statuses": []}
    assert change_task(client, owner, task_id, {"status": "open"}, cancelled.headers["etag"], operation="status").status_code == 409


def test_racing_edit_and_completion_have_one_version_winner(client, app):
    owner, member, space_id = family(client, app)
    task_id = create_task(client, member, space_id, member["user"]["id"]).json()["data"]["id"]
    owner_tag = client.get(f"/v1/tasks/{task_id}", headers=auth(owner)).headers["etag"]
    member_tag = client.get(f"/v1/tasks/{task_id}", headers=auth(member)).headers["etag"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        edited = pool.submit(change_task, client, owner, task_id, {"title": "Reviewed title"}, owner_tag)
        completed = pool.submit(change_task, client, member, task_id, {"status": "completed"}, member_tag, None, "status")
        statuses = [edited.result().status_code, completed.result().status_code]
    assert sorted(statuses) == [200, 412]
    with app.state.sessions() as database:
        assert database.get(Task, task_id).version == 2
        assert database.scalar(select(func.count()).select_from(TaskCommand)) == 1


@pytest.mark.parametrize("fields", [
    {"title": ""}, {"title": "   "}, {"title": "x" * 201}, {"title": "Task\nname"},
    {"description": None}, {"description": "x" * 5001}, {"description": "hidden\x00value"},
    {"due_date": "2026-02-30"}, {"due_date": "2026-09-21T00:00:00Z"}, {"due_date": 1790000000},
    {"due_date": "20260921"}, {"status": "completed"}, {"visibility": "public"},
    {"created_by_account_id": str(uuid4())}, {"recurrence_rule": "FREQ=DAILY"},
])
def test_task_input_rejects_invalid_and_authority_fields(client, app, fields):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    result = create_task(client, owner, space_id, **fields)
    assert result.status_code == 422, result.text
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Task)) == 0


def test_task_patch_distinguishes_omitted_and_nullable_fields(client, app):
    owner, _member, space_id = family(client, app)
    created = create_task(client, owner, space_id, description="First\r\nsecond")
    assert created.status_code == 201
    assert created.json()["data"]["description"] == "First\nsecond"
    task_id = created.json()["data"]["id"]
    for invalid in ({}, {"title": None}, {"description": None}, {"space_id": str(uuid4())}):
        assert change_task(client, owner, task_id, invalid, created.headers["etag"]).status_code == 422
    updated = change_task(client, owner, task_id, {"title": "Updated"}, created.headers["etag"])
    assert updated.status_code == 200
    assert updated.json()["data"]["description"] == "First\nsecond"
    assert updated.json()["data"]["due_date"] == "2026-09-21"


def test_assignees_must_be_current_members_with_task_history_access(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    assert create_task(client, owner, space_id, outsider["user"]["id"]).status_code == 409
    created = create_task(client, owner, space_id, member["user"]["id"])
    task_id = created.json()["data"]["id"]
    invitation = invite_account(client, owner, space_id, outsider["user"]["id"])
    assert client.post(f"/v1/invitations/{invitation.json()['data']['id']}/accept", headers=auth(outsider), json={}).status_code == 200
    options = client.get("/v1/tasks/assignees", params={"space_id": space_id, "task_id": task_id}, headers=auth(owner))
    assert options.status_code == 200
    assert {item["account_id"] for item in options.json()["data"]} == {owner["user"]["id"], member["user"]["id"]}
    denied = change_task(client, owner, task_id, {"assignee_account_id": outsider["user"]["id"]}, created.headers["etag"])
    assert denied.status_code == 409
    updated = change_task(client, owner, task_id, {"title": "Still historical"}, created.headers["etag"])
    assert updated.status_code == 200
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(outsider)).status_code == 404
    fresh = create_task(client, owner, space_id, outsider["user"]["id"], title="New shared task")
    assert fresh.status_code == 201
    assert client.get(f"/v1/tasks/{fresh.json()['data']['id']}", headers=auth(outsider)).status_code == 200


@pytest.mark.parametrize("change", ["removed", "new_admission", "suspended", "grant_revoked"])
def test_departed_assignee_is_not_silently_rebound(client, app, change):
    owner, member, space_id = family(client, app)
    created = create_task(client, owner, space_id, member["user"]["id"])
    task_id = created.json()["data"]["id"]
    with app.state.sessions.begin() as database:
        if change == "suspended":
            database.get(User, member["user"]["id"]).status = "suspended"
        elif change == "grant_revoked":
            database.execute(delete(TaskAccess).where(
                TaskAccess.task_id == task_id, TaskAccess.account_id == member["user"]["id"]
            ))
        else:
            membership = database.get(SpaceMembership, (space_id, member["user"]["id"]))
            if change == "removed":
                membership.status = "removed"
            else:
                membership.admission_id = str(uuid4())
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(member)).status_code == (401 if change == "suspended" else 404)
    current = client.get(f"/v1/tasks/{task_id}", headers=auth(owner))
    assert current.json()["data"]["assignee"] is None
    assert current.json()["data"]["assignee_unavailable"] is True
    cleared = change_task(client, owner, task_id, {"assignee_account_id": None}, current.headers["etag"])
    assert cleared.status_code == 200
    assert cleared.json()["data"]["assignee_unavailable"] is False


def test_archived_space_and_revoked_grants_block_tasks_and_receipts(client, app):
    owner, member, space_id = family(client, app)
    created = create_task(client, owner, space_id)
    task_id = created.json()["data"]["id"]
    key = str(uuid4())
    changed = change_task(client, owner, task_id, {"description": "Private marker"}, created.headers["etag"], key)
    assert changed.status_code == 200
    with app.state.sessions.begin() as database:
        database.execute(delete(TaskAccess).where(TaskAccess.task_id == task_id, TaskAccess.account_id == owner["user"]["id"]))
    assert change_task(client, owner, task_id, {"description": "Private marker"}, created.headers["etag"], key).status_code == 404
    with app.state.sessions.begin() as database:
        database.get(Space, space_id).status = "archived"
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(member)).status_code == 404
    assert client.get("/v1/tasks", params={"space_id": space_id}, headers=auth(member)).status_code == 404
    assert create_task(client, member, space_id).status_code == 404
    assert client.get("/v1/tasks/assignees", params={"space_id": space_id}, headers=auth(member)).status_code == 404


def test_task_cursor_is_bound_to_account_space_admission_and_filter(client, app):
    owner, member, space_id = family(client, app)
    expected = {create_task(client, owner, space_id, title=f"Task {number}").json()["data"]["id"] for number in range(3)}
    first = client.get("/v1/tasks", params={"space_id": space_id, "limit": 2, "status": "open"}, headers=auth(owner)).json()
    assert len(first["data"]) == 2
    cursor = first["pagination"]["next_cursor"]
    params = {"space_id": space_id, "limit": 2, "status": "open", "cursor": cursor}
    second = client.get("/v1/tasks", params=params, headers=auth(owner)).json()
    assert {row["id"] for row in first["data"] + second["data"]} == expected
    assert second["pagination"] == {"has_more": False, "next_cursor": None}
    assert client.get("/v1/tasks", params=params, headers=auth(member)).status_code == 400
    assert client.get("/v1/tasks", params={**params, "status": "completed"}, headers=auth(owner)).status_code == 400
    other_space = create_space(client, owner, "Other family").json()["data"]["id"]
    assert client.get("/v1/tasks", params={**params, "space_id": other_space}, headers=auth(owner)).status_code == 400
    assert client.get("/v1/tasks", params={**params, "cursor": "broken"}, headers=auth(owner)).status_code == 400
    assert client.get("/v1/tasks", params={"space_id": space_id, "limit": 51}, headers=auth(owner)).status_code == 422
    app.state.clock.now += timedelta(minutes=16)
    assert client.get("/v1/tasks", params=params, headers=auth(owner)).status_code == 410
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (space_id, owner["user"]["id"])).admission_id = str(uuid4())
    assert client.get("/v1/tasks", params=params, headers=auth(owner)).status_code == 400


@pytest.mark.parametrize("operation", ["create", "edit", "status"])
def test_task_outbox_failure_rolls_back_and_same_intent_retries(client, app, operation):
    owner, member, space_id = family(client, app)
    key = str(uuid4())
    initial = create_task(client, owner, space_id, member["user"]["id"]) if operation != "create" else None
    event_type = {"create": "task.created", "edit": "task.updated", "status": "task.completed"}[operation]
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION test_reject_task_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic task failure'; END $$"))
        connection.execute(text(
            "CREATE TRIGGER test_task_failure BEFORE INSERT ON domain_outbox "
            f"FOR EACH ROW WHEN (NEW.event_type = '{event_type}') EXECUTE FUNCTION test_reject_task_event()"
        ))

    def submit():
        if operation == "create":
            return create_task(client, owner, space_id, member["user"]["id"], key)
        body = {"description": "Do not log these private notes"} if operation == "edit" else {"status": "completed"}
        return change_task(client, owner, initial.json()["data"]["id"], body, initial.headers["etag"], key, operation)

    try:
        result = submit()
        assert result.status_code == 503, result.text
        with app.state.sessions() as database:
            assert database.scalar(select(func.count()).select_from(Task)) == (0 if operation == "create" else 1)
            assert database.scalar(select(func.count()).select_from(TaskAccess)) == (0 if operation == "create" else 2)
            assert database.scalar(select(func.count()).select_from(TaskCommand)) == 0
            assert database.scalar(select(func.count()).select_from(TaskAudit).where(TaskAudit.action == event_type)) == 0
            if initial:
                stored = database.get(Task, initial.json()["data"]["id"])
                assert stored.version == 1
                assert stored.status == "open"
                assert stored.description == "Fruit and bread"
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER test_task_failure ON domain_outbox"))
            connection.execute(text("DROP FUNCTION test_reject_task_event()"))
    assert submit().status_code == (201 if operation == "create" else 200)
    with app.state.sessions() as database:
        audit = database.scalars(select(TaskAudit).where(TaskAudit.action == event_type)).one()
        assert "Do not log" not in json.dumps(audit.changed_fields)


@pytest.mark.parametrize("operation", ["create", "edit", "status"])
def test_task_rechecks_session_after_waiting_for_space(client, app, monkeypatch, operation):
    owner, _member, space_id = family(client, app)
    initial = create_task(client, owner, space_id) if operation != "create" else None
    reached, resume = Event(), Event()
    original = app.state.spaces.lock_space

    def paused(database, identifier, active=True):
        reached.set()
        assert resume.wait(10)
        return original(database, identifier, active)

    monkeypatch.setattr(app.state.spaces, "lock_space", paused)
    with ThreadPoolExecutor(max_workers=1) as pool:
        if operation == "create":
            pending = pool.submit(create_task, client, owner, space_id)
        else:
            body = {"title": "Late edit"} if operation == "edit" else {"status": "completed"}
            pending = pool.submit(change_task, client, owner, initial.json()["data"]["id"], body, initial.headers["etag"], None, operation)
        try:
            assert reached.wait(10)
            app.state.clock.now += timedelta(hours=9)
        finally:
            resume.set()
        assert pending.result(timeout=10).status_code == 401
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Task)) == (0 if operation == "create" else 1)
        assert database.scalar(select(func.count()).select_from(TaskCommand)) == 0


def test_task_limit_does_not_break_safe_creation_replay(client, app, monkeypatch):
    owner, _member, space_id = family(client, app)
    monkeypatch.setattr(planning_service, "MAX_TASKS_PER_SPACE", 1)
    key = str(uuid4())
    created = create_task(client, owner, space_id, key=key)
    assert created.status_code == 201
    assert create_task(client, owner, space_id).status_code == 409
    assert create_task(client, owner, space_id, key=key).json()["data"]["id"] == created.json()["data"]["id"]


def test_tasks_persist_after_restart_and_contract_excludes_internal_fields(client, app):
    owner, member, space_id = family(client, app)
    task_id = create_task(client, owner, space_id, member["user"]["id"]).json()["data"]["id"]
    restarted = create_app(app.state.settings, app.state.clock)
    with TestClient(restarted) as other:
        response = other.get(f"/v1/tasks/{task_id}", headers=auth(member))
        assert response.status_code == 200
        assert response.json()["data"]["due_date"] == "2026-09-21"
    schema = app.openapi()
    for path, method in [
        ("/v1/tasks", "get"), ("/v1/tasks", "post"), ("/v1/tasks/assignees", "get"),
        ("/v1/tasks/{task_id}", "get"), ("/v1/tasks/{task_id}", "patch"),
        ("/v1/tasks/{task_id}/status", "post"),
    ]:
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
    for name in ("CreateTask", "EditTask", "ChangeTaskStatus"):
        assert schema["components"]["schemas"][name]["additionalProperties"] is False
    fields = schema["components"]["schemas"]["TaskView"]["properties"]
    assert not {"creation_key", "creation_digest", "creator_admission_id", "assignee_admission_id"}.intersection(fields)