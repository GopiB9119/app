"""DEC-029: task priority, and list filters by current assignee and due date."""

from uuid import uuid4

from sqlalchemy import select

from app.modules.planning.models import TaskAudit

from .test_identity import account, auth
from .test_spaces import invite_account
from .test_tasks import change_task, create_task, family


def listed(client, actor, space_id, **filters):
    response = client.get("/v1/tasks", headers=auth(actor), params={"space_id": space_id, **filters})
    assert response.status_code == 200, response.text
    return sorted(item["title"] for item in response.json()["data"])


def join(client, app, owner, space_id, email):
    person = account(client, app, email)
    invitation = invite_account(client, owner, space_id, person["user"]["id"])
    assert invitation.status_code == 201, invitation.text
    accepted = client.post(f"/v1/invitations/{invitation.json()['data']['id']}/accept", headers=auth(person), json={})
    assert accepted.status_code == 200, accepted.text
    return person


def test_priority_defaults_to_normal_and_only_managers_change_it_with_an_audit(client, app):
    owner, member, space_id = family(client, app)
    plain = create_task(client, owner, space_id, title="Plain")
    assert plain.status_code == 201, plain.text
    assert plain.json()["data"]["priority"] == "normal"
    urgent = create_task(client, owner, space_id, member["user"]["id"], title="Urgent", priority="high")
    assert urgent.status_code == 201, urgent.text
    assert urgent.json()["data"]["priority"] == "high"
    for wrong in ("urgent", "HIGH", None, 1):
        assert create_task(client, owner, space_id, title="Wrong", priority=wrong).status_code == 422
    task_id, etag = urgent.json()["data"]["id"], urgent.headers["ETag"]
    assert client.get(f"/v1/tasks/{task_id}", headers=auth(member)).json()["data"]["priority"] == "high"

    assert change_task(client, member, task_id, {"priority": "low"}, etag).status_code == 403
    assert change_task(client, owner, task_id, {"priority": None}, etag).status_code == 422
    lowered = change_task(client, owner, task_id, {"priority": "low"}, etag)
    assert lowered.status_code == 200, lowered.text
    assert (lowered.json()["data"]["priority"], lowered.json()["data"]["title"]) == ("low", "Urgent")
    assert lowered.json()["data"]["version"] == "2"
    with app.state.sessions() as database:
        audits = database.scalars(select(TaskAudit).where(TaskAudit.task_id == task_id).order_by(TaskAudit.task_version)).all()
    assert [audit.action for audit in audits] == ["task.created", "task.updated"]
    assert "priority" in audits[0].changed_fields and audits[1].changed_fields == ["priority"]


def test_filters_narrow_by_current_assignee_nobody_and_due_dates(client, app):
    owner, member, space_id = family(client, app)
    me, other = owner["user"]["id"], member["user"]["id"]
    for title, assignee, due in (
        ("Mine early", me, "2026-10-01"), ("Mine late", me, "2026-10-09"), ("Theirs", other, "2026-10-02"),
        ("Nobody dated", None, "2026-10-05"), ("Nobody undated", None, None),
    ):
        assert create_task(client, owner, space_id, assignee, title=title, due_date=due).status_code == 201

    assert listed(client, owner, space_id, assignee=me) == ["Mine early", "Mine late"]
    assert listed(client, member, space_id, assignee=other) == ["Theirs"]
    assert listed(client, member, space_id, assignee="none") == ["Nobody dated", "Nobody undated"]
    assert listed(client, owner, space_id, due_from="2026-10-02", due_to="2026-10-05") == ["Nobody dated", "Theirs"]
    assert listed(client, owner, space_id, due_to="2026-10-01") == ["Mine early"]
    assert listed(client, owner, space_id, due_from="2026-10-09", due_to="2026-10-09") == ["Mine late"]
    assert listed(client, owner, space_id, assignee=me, due_from="2026-10-05") == ["Mine late"]
    assert listed(client, owner, space_id, assignee=str(uuid4())) == []

    early = next(item for item in client.get("/v1/tasks", headers=auth(owner), params={"space_id": space_id, "assignee": me}).json()["data"]
                 if item["title"] == "Mine early")
    done = change_task(client, owner, early["id"], {"status": "completed"}, early["etag"], operation="status")
    assert done.status_code == 200, done.text
    assert listed(client, owner, space_id, assignee=me, status="completed") == ["Mine early"]
    assert listed(client, owner, space_id, assignee=me, status="open") == ["Mine late"]

    for bad in (
        {"due_from": "2026-02-30"}, {"due_from": "2026-10-05", "due_to": "2026-10-01"}, {"due_to": "2026-10-1"},
        {"due_from": "20261001"}, {"assignee": "me"}, {"assignee": other.upper()},
    ):
        refused = client.get("/v1/tasks", headers=auth(owner), params={"space_id": space_id, **bad})
        assert refused.status_code == 422, (bad, refused.text)


def test_a_filtered_page_continues_only_with_the_same_filters(client, app):
    owner, _member, space_id = family(client, app)
    me = owner["user"]["id"]
    for index in range(3):
        assert create_task(client, owner, space_id, me, title=f"Mine {index}", due_date=f"2026-10-0{index + 1}").status_code == 201
    assert create_task(client, owner, space_id, None, title="Nobody").status_code == 201
    query = {"space_id": space_id, "assignee": me, "limit": 2}
    first = client.get("/v1/tasks", headers=auth(owner), params=query).json()
    assert len(first["data"]) == 2 and first["pagination"]["has_more"]
    cursor = first["pagination"]["next_cursor"]
    rest = client.get("/v1/tasks", headers=auth(owner), params={**query, "cursor": cursor})
    assert rest.status_code == 200, rest.text
    titles = sorted(item["title"] for item in first["data"] + rest.json()["data"])
    assert titles == ["Mine 0", "Mine 1", "Mine 2"] and not rest.json()["pagination"]["has_more"]
    for changed in ({"assignee": "none"}, {"assignee": None}, {"due_from": "2026-10-01"}, {"due_to": "2026-10-31"}, {"status": "open"}):
        params = {key: value for key, value in {**query, **changed, "cursor": cursor}.items() if value is not None}
        refused = client.get("/v1/tasks", headers=auth(owner), params=params)
        assert refused.status_code == 400, (changed, refused.text)
        assert refused.json()["error"]["code"] == "CURSOR_INVALID"


def test_filters_follow_the_current_admission_and_never_widen_access(client, app):
    owner, member, space_id = family(client, app)
    other = member["user"]["id"]
    assert create_task(client, owner, space_id, other, title="Before newcomer").status_code == 201
    newcomer = join(client, app, owner, space_id, "newcomer@example.test")
    assert listed(client, newcomer, space_id, assignee=other) == []
    assert listed(client, newcomer, space_id) == []

    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    row = next(item for item in roster if item["account_id"] == other)
    removed = client.post(f"/v1/spaces/{space_id}/members/{other}/remove",
                          headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": row["etag"]}, json={})
    assert removed.status_code == 200, removed.text
    # The task still names the former member, so it is neither theirs now nor unassigned.
    assert listed(client, owner, space_id, assignee=other) == []
    assert listed(client, owner, space_id, assignee="none") == []
    view = client.get("/v1/tasks", headers=auth(owner), params={"space_id": space_id}).json()["data"][0]
    assert (view["title"], view["assignee"], view["assignee_unavailable"]) == ("Before newcomer", None, True)
