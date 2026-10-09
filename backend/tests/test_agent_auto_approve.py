"""Auto-approve (the Agent screen's switch): changes run at once and are still recorded; public ones still wait."""

from uuid import uuid4

from sqlalchemy import func, select

from app.modules.agents.models import AgentApproval
from app.modules.agents.schemas import CreateAgentRun
from app.modules.community.models import PublicPage
from app.modules.planning.models import Task
from tests.agent_support import MAIN_AGENT, approve, call, install, say, script, solo
from tests.test_identity import auth


def ask(client, actor, space_id, message, auto, key=None):
    body = {"message": message, "auto_approve": auto} if space_id is None else {"space_id": space_id, "message": message, "auto_approve": auto}
    return client.post("/v1/agent-runs", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())}, json=body)


def count(app, model, *conditions):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(model).where(*conditions))


def test_auto_approve_makes_each_change_at_once_and_still_records_it(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(
        call("create_task", title="Buy milk", due_date="2026-09-20"), call("create_task", title="Buy bread"), say("Added both."),
    ))
    key = str(uuid4())
    response = ask(client, person, space_id, "add buy milk for tomorrow and buy bread", auto=True, key=key)
    assert response.status_code == 201, response.text
    run = response.json()["data"]
    assert (run["status"], run["outcome"], run["answer"]) == ("completed", "action_completed", "Added both.")
    assert count(app, Task) == 2
    with app.state.sessions() as database:
        decisions = [(item.status, item.reason, item.result_ref is not None) for item in database.scalars(select(AgentApproval))]
    assert decisions == [("approved", "auto_approved", True)] * 2
    assert run["approval"]["reason"] == "auto_approved"
    assert [(item["effect"], item["status"]) for item in run["tool_calls"]] == [("write", "succeeded")] * 2
    assert all("approved automatically" in item["summary"] for item in run["tool_calls"])
    # The model knew auto-approve was on and saw each change's result before answering.
    assert "auto-approve is ON" in model.calls[0][0][1]["content"]
    assert sum(message["role"] == "tool" for message in model.calls[-1][0]) == 2
    # The same request key cannot be replayed with a different choice.
    assert ask(client, person, space_id, "add buy milk for tomorrow and buy bread", auto=False, key=key).status_code == 409
    assert ask(client, person, space_id, "add buy milk for tomorrow and buy bread", auto=True, key=key).status_code == 201
    assert count(app, Task) == 2


def test_auto_approve_creates_an_event_whose_service_locks_the_account(client, app):
    # Regression: the uncommitted approval row once key-locked the account the event service locks, freezing the API.
    person, space_id = solo(client, app)
    install(app, script(call("create_event", title="Testing event", date="2026-09-29", start_time="15:00"), say("Added.")))
    run = ask(client, person, space_id, "add a testing event in 10 days", auto=True).json()["data"]
    assert (run["status"], run["approval"]["reason"]) == ("completed", "auto_approved")


def test_without_auto_approve_a_change_still_waits(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("create_task", title="Buy milk"), say("Added.")))
    run = ask(client, person, space_id, "add buy milk", auto=False).json()["data"]
    assert run["status"] == "waiting_for_approval" and count(app, Task) == 0
    assert "every change waits for the person's approval" in model.calls[0][0][1]["content"]
    done = approve(client, person, run).json()["data"]
    assert done["status"] == "completed" and done["approval"]["reason"] is None and count(app, Task) == 1


def test_public_changes_still_wait_for_the_person_with_auto_approve_on(client, app):
    person, _space_id = solo(client, app)
    install(app, script(call("create_page", handle="wellness-auto", name="Everyday wellness", topic="health"), say("Page created.")))
    run = ask(client, person, MAIN_AGENT, "Create a wellness page", auto=True).json()["data"]
    assert run["status"] == "waiting_for_approval" and run["approval"]["status"] == "pending"
    assert count(app, PublicPage) == 0
    done = approve(client, person, run).json()["data"]
    assert done["status"] == "completed" and done["approval"]["reason"] is None and count(app, PublicPage) == 1


def test_a_chat_mention_never_auto_approves(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("create_task", title="Buy milk"), say("Added.")))
    body = CreateAgentRun(space_id=space_id, message="add buy milk", auto_approve=True)
    run = app.state.agents.create_run(person["session_token"], body, str(uuid4()), origin="chat")
    assert run.status == "waiting_for_approval" and count(app, Task) == 0
