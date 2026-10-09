from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select

from app.modules.planning.models import Task, TaskAccess, TaskAudit, TaskCommand
from tests.test_identity import auth
from tests.test_tasks import change_task, create_task, family


@pytest.mark.parametrize("creator_role", ["owner", "member"])
def test_creation_retry_cannot_disclose_a_task_after_its_access_grant_is_revoked(client, app, creator_role):
    owner, member, space_id = family(client, app)
    creator, assignee = (owner, member) if creator_role == "owner" else (member, owner)
    key = str(uuid4())
    created = create_task(client, creator, space_id, assignee["user"]["id"], key=key)
    assert created.status_code == 201, created.text
    task_id = created.json()["data"]["id"]

    with app.state.sessions.begin() as database:
        result = database.execute(delete(TaskAccess).where(
            TaskAccess.task_id == task_id,
            TaskAccess.account_id == creator["user"]["id"],
        ))
        assert result.rowcount == 1

    assert client.get(f"/v1/tasks/{task_id}", headers=auth(creator)).status_code == 404
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(assignee)).status_code == 200
    replayed = create_task(client, creator, space_id, assignee["user"]["id"], key=key)
    assert replayed.status_code == 404, replayed.text
    assert "Buy groceries" not in replayed.text
    assert "Fruit and bread" not in replayed.text


@pytest.mark.parametrize("creator_role", ["owner", "member"])
@pytest.mark.parametrize("operation", ["edit", "status"])
def test_command_retry_cannot_disclose_a_task_after_its_access_grant_is_revoked(client, app, creator_role, operation):
    owner, member, space_id = family(client, app)
    creator, assignee = (owner, member) if creator_role == "owner" else (member, owner)
    created = create_task(client, creator, space_id, assignee["user"]["id"])
    assert created.status_code == 201, created.text
    task_id = created.json()["data"]["id"]
    body = {"title": "Reviewed groceries"} if operation == "edit" else {"status": "completed"}
    key = str(uuid4())
    original_etag = created.headers["etag"]
    changed = change_task(client, creator, task_id, body, original_etag, key, operation)
    assert changed.status_code == 200, changed.text
    assert changed.json()["data"]["version"] == "2"

    with app.state.sessions.begin() as database:
        revoked = database.execute(delete(TaskAccess).where(
            TaskAccess.task_id == task_id,
            TaskAccess.account_id == creator["user"]["id"],
        ))
        assert revoked.rowcount == 1

    assert client.get(f"/v1/tasks/{task_id}", headers=auth(creator)).status_code == 404
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(assignee)).status_code == 200
    replayed = change_task(client, creator, task_id, body, original_etag, key, operation)
    assert replayed.status_code == 404, replayed.text
    for private_text in ("Buy groceries", "Reviewed groceries", "Fruit and bread"):
        assert private_text not in replayed.text
    with app.state.sessions() as database:
        assert database.get(Task, task_id).version == 2
        assert database.scalar(select(func.count()).select_from(TaskCommand)) == 1
        assert database.scalar(select(func.count()).select_from(TaskAudit)) == 2


def test_status_retry_rechecks_assignment_before_returning_an_old_receipt(client, app):
    owner, assignee, space_id = family(client, app)
    created = create_task(client, owner, space_id, assignee["user"]["id"])
    assert created.status_code == 201, created.text
    task_id = created.json()["data"]["id"]
    original = client.get(f"/v1/tasks/{task_id}", headers=auth(assignee))
    original_etag = original.headers["etag"]
    key = str(uuid4())
    body = {"status": "completed"}
    completed = change_task(client, assignee, task_id, body, original_etag, key, "status")
    assert completed.status_code == 200, completed.text
    reviewed = client.get(f"/v1/tasks/{task_id}", headers=auth(owner))
    reopened = change_task(client, owner, task_id, {"status": "open"}, reviewed.headers["etag"], operation="status")
    assert reopened.status_code == 200, reopened.text
    unassigned = change_task(client, owner, task_id, {"assignee_account_id": None}, reopened.headers["etag"])
    assert unassigned.status_code == 200, unassigned.text

    current = client.get(f"/v1/tasks/{task_id}", headers=auth(assignee))
    assert current.status_code == 200, current.text
    assert current.json()["data"]["permissions"] == {"can_edit": False, "allowed_statuses": []}
    replayed = change_task(client, assignee, task_id, body, original_etag, key, "status")
    assert replayed.status_code == 403, replayed.text
    assert replayed.json()["error"]["code"] == "ACCESS_DENIED"
    with app.state.sessions() as database:
        task = database.get(Task, task_id)
        assert task.version == 4
        assert task.status == "open"
        assert task.assignee_account_id is None
        assert database.scalar(select(func.count()).select_from(TaskCommand)) == 3
        assert database.scalar(select(func.count()).select_from(TaskAudit).where(TaskAudit.action == "task.completed")) == 1