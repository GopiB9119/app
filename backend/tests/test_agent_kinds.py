"""Two agents (DEC-060): the Main Agent on the Agent page works outside every Space, and each Space's agent works in that
Space only. The split is enforced by the run's agent definition, not by the model's instructions."""

import json
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from app.modules.agents.models import AgentApproval, AgentMemory, AgentRun
from tests.agent_support import MAIN_AGENT, approve, ask, call, install, say, script, solo
from tests.test_community import create_page, draft, publish
from tests.test_identity import account, auth
from tests.test_spaces import create_space
from tests.test_tasks import create_task


def tool_results(messages):
    return [json.loads(message["content"]) for message in messages if message["role"] == "tool"]


def count(app, model, *conditions):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(model).where(*conditions))


def test_the_main_agent_has_no_space_and_only_its_own_tools(client, app):
    person, _space_id = solo(client, app)
    model = install(app, script(say("Hello!")))
    run = ask(client, person, MAIN_AGENT, "hi")
    assert (run["agent_kind"], run["space_id"], run["status"]) == ("main", None, "completed")
    messages, tools = model.calls[0]
    assert {"search_pages", "create_page", "like_post", "show_space_chats", "read_memories"} <= set(tools)
    assert not {"list_tasks", "create_task", "create_event", "schedule_reminder", "read_document", "list_members"} & set(tools)
    assert "Main Agent" in messages[1]["content"] and "Space:" not in messages[1]["content"]
    with app.state.sessions() as database:
        stored = database.get(AgentRun, run["id"])
        assert (stored.agent_kind, stored.space_id, stored.admission_id, stored.agent_instance_id) == ("main", None, None, None)
        assert stored.state["agent"] == {"instance": None, "definition": "main", "version": 1}


def test_the_main_agent_cannot_reach_inside_a_space_even_when_the_model_asks(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Private family errand")
    model = install(app, script(call("list_tasks"), call("create_task", title="Sneaky"), say("I can't see your tasks.")))
    run = ask(client, person, MAIN_AGENT, "what are my tasks?")
    assert run["status"] == "completed" and run["approval"] is None
    results = tool_results(model.calls[-1][0])
    assert all("There is no tool called" in item["error"] for item in results) and len(results) == 2
    assert "Private family errand" not in json.dumps(model.calls)
    assert count(app, AgentApproval) == 0 and not run["tool_calls"]


def test_a_space_agent_cannot_act_in_public(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("create_page", handle="family-news", name="Family news", topic="family"), say("Okay.")))
    run = ask(client, person, space_id, "make a public page for our family news")
    assert (run["agent_kind"], run["space_id"], run["status"]) == ("space", space_id, "completed")
    assert "There is no tool called" in tool_results(model.calls[-1][0])[0]["error"]
    assert "create_page" not in model.calls[0][1] and "show_space_chats" not in model.calls[0][1]
    assert "this Space's own Agent" in model.calls[0][0][1]["content"]
    assert count(app, AgentApproval) == 0


def test_the_main_agent_shows_buttons_to_space_chats_without_seeing_inside(client, app):
    person = account(client, app)
    family = create_space(client, person, name="Riverside home", space_type="family").json()["data"]
    create_space(client, person, name="Just me", space_type="solo")
    other = account(client, app, "sam@example.test")
    create_space(client, other, name="Someone else's family", space_type="family")
    model = install(app, script(call("show_space_chats", space_type="family"), say("Ask your family's Agent there.")))
    run = ask(client, person, MAIN_AGENT, "add milk to our family list")
    assert run["handoffs"] == [{"space_id": family["id"], "name": "Riverside home", "space_type": "family"}]
    [result] = tool_results(model.calls[-1][0])
    # The model learns only how many buttons it showed, never a Space's name or content.
    assert "1 of their family Space chats" in result["result"] and "Riverside" not in json.dumps(model.calls)
    assert [item["tool_name"] for item in run["tool_calls"]] == ["agent.spaces.handoff"]


def test_each_agent_lists_only_its_own_requests(client, app):
    person, space_id = solo(client, app)
    install(app, script(say("Main answer."), say("Space answer.")))
    main = ask(client, person, MAIN_AGENT, "hello main")
    inside = ask(client, person, space_id, "hello space")
    listed_main = client.get("/v1/agent-runs", headers=auth(person)).json()["data"]
    listed_space = client.get("/v1/agent-runs", params={"space_id": space_id}, headers=auth(person)).json()["data"]
    assert [item["id"] for item in listed_main] == [main["id"]]
    assert [item["id"] for item in listed_space] == [inside["id"]]
    other = account(client, app, "sam@example.test")
    assert client.get(f"/v1/agent-runs/{main['id']}", headers=auth(other)).status_code == 404
    assert client.get("/v1/agent-runs", headers=auth(other)).json()["data"] == []


def test_memories_stay_with_the_agent_that_saved_them(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("save_memory", content="I follow cricket pages"), say("Saved.")))
    approve(client, person, ask(client, person, MAIN_AGENT, "remember I follow cricket pages"))
    install(app, script(call("save_memory", content="The plumber comes on Fridays"), say("Saved.")))
    approve(client, person, ask(client, person, space_id, "remember the plumber comes on Fridays"))
    model = install(app, script(call("read_memories"), say("Read.")))
    ask(client, person, MAIN_AGENT, "what do you remember")
    assert [item["content"] for item in tool_results(model.calls[-1][0])[0]["result"]["memories"]] == ["I follow cricket pages"]
    model = install(app, script(call("read_memories"), say("Read.")))
    ask(client, person, space_id, "what do you remember")
    assert [item["content"] for item in tool_results(model.calls[-1][0])[0]["result"]["memories"]] == ["The plumber comes on Fridays"]
    listed = client.get("/v1/agent-memories", headers=auth(person)).json()["data"]
    assert {(item["content"], item["space_id"]) for item in listed} == {("I follow cricket pages", None),
                                                                      ("The plumber comes on Fridays", space_id)}


def test_the_main_agent_likes_at_once_with_auto_approve_but_always_asks_before_commenting(client, app):
    author = account(client, app)
    page = create_page(client, author).json()["data"]
    post = publish(client, author, draft(client, author, page["id"]).json()["data"])
    reader = account(client, app, "sam@example.test")
    install(app, script(call("like_post", post_id=post["id"], like=True), call("comment_on_post", post_id=post["id"], text="Lovely walk!"),
                        say("Liked; your comment waits for you.")))
    response = client.post("/v1/agent-runs", headers={**auth(reader), "Idempotency-Key": str(uuid4())},
                           json={"message": "like this post and say lovely walk", "auto_approve": True})
    assert response.status_code == 201, response.text
    run = response.json()["data"]
    assert run["status"] == "waiting_for_approval" and run["approval"]["tool_name"] == "community.comments.create"
    with app.state.sessions() as database:
        decided = {(item.tool_name, item.status, item.reason) for item in database.scalars(select(AgentApproval))}
    assert decided == {("community.posts.like", "approved", "auto_approved"), ("community.comments.create", "pending", None)}
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(reader)).json()["data"]["like_count"] == 1


def test_the_database_keeps_main_agent_requests_out_of_spaces_and_refuses_a_lossy_downgrade(client, app):
    person, _space_id = solo(client, app)
    install(app, script(say("Hello!")))
    ask(client, person, MAIN_AGENT, "hi")
    config = Config("alembic.ini")
    with pytest.raises(RuntimeError, match="Main Agent requests"):
        command.downgrade(config, "0052")
    with app.state.engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar() == "0053"
    assert count(app, AgentRun, AgentRun.agent_kind == "main") == 1
    assert count(app, AgentMemory) == 0
