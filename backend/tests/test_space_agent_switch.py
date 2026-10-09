"""Per-Space setting: the agent on or off in a Space (DEC-028, T152)."""

from uuid import uuid4

from sqlalchemy import func, select

from app.modules.agents.models import AgentApproval, AgentRun
from app.modules.identity.models import OutboxEvent
from app.modules.planning.models import Task
from app.modules.spaces.models import SpaceAuditEvent
from tests.agent_support import answer, approve, ask
from tests.test_identity import account, auth
from tests.test_messaging import admit
from tests.test_space_directory import settings
from tests.test_spaces import create_space

OFF = "The owner turned the agent off in this Space. Nothing was changed."


def set_agent(client, actor, space_id, enabled, etag=None, key=None):
    headers = {**auth(actor), "Idempotency-Key": key or str(uuid4())}
    if etag is not None:
        headers["If-Match"] = etag
    return client.post(f"/v1/spaces/{space_id}/agent-policy", headers=headers, json={"agent_enabled": enabled})


def turn_agent(client, owner, space_id, enabled):
    changed = set_agent(client, owner, space_id, enabled, settings(client, owner, space_id)["etag"])
    assert changed.status_code == 200, changed.text
    return changed.json()["data"]


def start(client, actor, space_id, message):
    return client.post("/v1/agent-runs", headers={**auth(actor), "Idempotency-Key": str(uuid4())},
                       json={"space_id": space_id, "message": message})


def test_only_the_owner_turns_the_agent_off_after_reviewing_the_settings(client, app):
    owner = account(client, app)
    member = account(client, app, "agent-switch-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    reviewed = settings(client, owner, space_id)
    assert reviewed["agent_enabled"] is True
    assert set_agent(client, owner, space_id, False).status_code == 428
    assert set_agent(client, owner, space_id, False, '"stale"').status_code == 412
    refused = set_agent(client, member, space_id, False, reviewed["etag"])
    assert refused.status_code == 404 and refused.json()["error"]["message"] == "Space not found."
    assert set_agent(client, owner, space_id, True, reviewed["etag"]).json()["error"]["code"] == "NO_CHANGES"
    key = str(uuid4())
    changed = set_agent(client, owner, space_id, False, reviewed["etag"], key)
    assert changed.status_code == 200, changed.text
    assert set_agent(client, owner, space_id, False, reviewed["etag"], key).json()["data"]["agent_enabled"] is False
    assert set_agent(client, owner, space_id, True, reviewed["etag"], key).json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).json()["data"]["agent_enabled"] is False
    with app.state.sessions() as database:
        actions = database.scalars(select(SpaceAuditEvent.action).where(SpaceAuditEvent.space_id == space_id)).all()
        assert actions.count("space.agent_off") == 1
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "space.agent_off")) == 1


def test_no_request_starts_while_the_agent_is_off_and_other_spaces_keep_it(client, app):
    owner = account(client, app)
    member = account(client, app, "agent-switch-member@example.test")
    family = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, family, member)
    solo = create_space(client, member, "My plans", space_type="solo").json()["data"]["id"]
    turn_agent(client, owner, family, False)
    for person in (owner, member):
        refused = start(client, person, family, "help")
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "AGENT_OFF"
    assert start(client, member, solo, "help").status_code == 201
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AgentRun).where(AgentRun.space_id == family)) == 0
    turn_agent(client, owner, family, True)
    assert start(client, member, family, "help").status_code == 201


def test_waiting_requests_stop_when_touched_and_do_not_come_back(client, app):
    owner = account(client, app)
    member = account(client, app, "agent-switch-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    waiting_approval = ask(client, member, space_id, "add a task to book the hall")
    waiting_answer = ask(client, member, space_id, "ask me something")
    assert (waiting_approval["status"], waiting_answer["status"]) == ("waiting_for_approval", "waiting_for_user")
    turn_agent(client, owner, space_id, False)
    run = approve(client, member, waiting_approval).json()["data"]
    assert (run["status"], run["stop_reason"], run["answer"]) == ("cancelled", "agent_off", OFF)
    assert run["approval"]["status"] == "cancelled" and run["approval"]["reason"] == "agent_off"
    resumed = answer(client, member, waiting_answer, "6 pm")
    assert (resumed["status"], resumed["stop_reason"]) == ("cancelled", "agent_off")
    turn_agent(client, owner, space_id, True)
    assert client.get(f"/v1/agent-runs/{waiting_approval['id']}", headers=auth(member)).json()["data"]["status"] == "cancelled"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(Task).where(func.lower(Task.title) == "book the hall")) == 0
        assert database.scalar(select(AgentApproval.status).where(AgentApproval.run_id == waiting_approval["id"])) == "cancelled"


def test_reading_a_waiting_request_after_the_switch_stops_it(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    waiting = ask(client, owner, space_id, "add a task to paint the fence")
    turn_agent(client, owner, space_id, False)
    listed = client.get(f"/v1/agent-runs?space_id={space_id}", headers=auth(owner)).json()["data"]
    assert [(item["id"], item["status"], item["stop_reason"]) for item in listed] == [(waiting["id"], "cancelled", "agent_off")]
