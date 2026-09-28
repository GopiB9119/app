from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.modules.planning.models import TaskAccess
from tests.test_identity import auth
from tests.test_tasks import create_task, family


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