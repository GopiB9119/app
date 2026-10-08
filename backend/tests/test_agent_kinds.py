"""Two agents (DEC-060): the Main Agent on the Agent page works outside every Space, and each Space's agent works in that
Space only. The split is enforced by the run's agent definition, not by the model's instructions."""

import json
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.modules.agents.models import AgentApproval, AgentMemory, AgentMemoryCommand, AgentRun
from tests.agent_support import MAIN_AGENT, approve, ask, call, install, say, script, solo
from tests.test_community import create_page, draft, publish
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance
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


def test_inbox_status_filter_is_applied_before_paging_and_bound_to_its_cursor(client, app):
    person, space_id = solo(client, app)
    waiting = []
    for title in ("Older approval", "Newer approval"):
        install(app, script(call("create_task", title=title)))
        waiting.append(ask(client, person, space_id, title))
        advance(app, seconds=1)
    install(app, script(say("Completed answer.")))
    completed = ask(client, person, space_id, "A newer completed request")
    params = {"space_id": space_id, "status": "waiting_for_approval", "limit": 1}
    first = client.get("/v1/agent-runs", headers=auth(person), params=params)
    assert first.status_code == 200, first.text
    assert [item["id"] for item in first.json()["data"]] == [waiting[1]["id"]]
    cursor = first.json()["pagination"]["next_cursor"]
    assert cursor and first.json()["pagination"]["has_more"] is True
    last = client.get("/v1/agent-runs", headers=auth(person), params={**params, "cursor": cursor})
    assert last.status_code == 200, last.text
    assert [item["id"] for item in last.json()["data"]] == [waiting[0]["id"]]
    assert last.json()["pagination"] == {"has_more": False, "next_cursor": None}
    for status in ("all", "completed", "failed"):
        refused = client.get("/v1/agent-runs", headers=auth(person), params={**params, "cursor": cursor, "status": status})
        assert refused.status_code == 400 and refused.json()["error"]["code"] == "CURSOR_INVALID"
    done = client.get("/v1/agent-runs", headers=auth(person), params={"space_id": space_id, "status": "completed"})
    assert [item["id"] for item in done.json()["data"]] == [completed["id"]]


def test_inbox_status_filter_refreshes_expired_approvals_before_selection(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("create_task", title="Expired review")))
    waiting = ask(client, person, space_id, "Create a task")
    app.state.clock.now = datetime.fromisoformat(waiting["approval"]["expires_at"]) + timedelta(seconds=1)
    failed = client.get("/v1/agent-runs", headers=auth(person), params={"space_id": space_id, "status": "failed"})
    assert failed.status_code == 200, failed.text
    assert [(item["id"], item["status"]) for item in failed.json()["data"]] == [(waiting["id"], "expired")]
    pending = client.get("/v1/agent-runs", headers=auth(person), params={"space_id": space_id, "status": "waiting_for_approval"})
    assert pending.json()["data"] == []
    assert count(app, AgentApproval, AgentApproval.status == "pending") == 0


def test_needs_you_filter_lists_only_this_agents_requests_waiting_on_the_person(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("create_task", title="Needs approval")))
    approval = ask(client, person, space_id, "Create a task")
    install(app, script(call("ask_user", question="Which day?")))
    question = ask(client, person, space_id, "Plan something")
    install(app, script(say("Done.")))
    ask(client, person, space_id, "A finished request")
    install(app, script(call("create_page", handle="wellness-needs-you", name="Everyday wellness", topic="health"), say("Page created.")))
    main = ask(client, person, MAIN_AGENT, "Create a wellness page")
    assert main["status"] == "waiting_for_approval"
    listed = client.get("/v1/agent-runs", headers=auth(person), params={"space_id": space_id, "status": "needs_you"})
    assert listed.status_code == 200, listed.text
    assert {item["id"] for item in listed.json()["data"]} == {approval["id"], question["id"]}
    assert [item["id"] for item in client.get("/v1/agent-runs", headers=auth(person), params={"status": "needs_you"}).json()["data"]] == [main["id"]]
    other = account(client, app, "sam@example.test")
    assert client.get("/v1/agent-runs", headers=auth(other), params={"status": "needs_you"}).json()["data"] == []
    app.state.clock.now = datetime.fromisoformat(approval["approval"]["expires_at"]) + timedelta(seconds=1)
    still = client.get("/v1/agent-runs", headers=auth(person), params={"space_id": space_id, "status": "needs_you"}).json()["data"]
    assert approval["id"] not in {item["id"] for item in still}


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


def test_memory_controls_edit_disable_and_retry_without_reenabling_the_memory(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("save_memory", content="Prefers morning trips"), say("Saved.")))
    approve(client, person, ask(client, person, space_id, "Remember my travel preference"))
    [memory] = client.get("/v1/agent-memories", headers=auth(person)).json()["data"]
    assert memory["enabled"] is True and memory["version"] == "1" and memory["etag"]
    key = str(uuid4())
    headers = {**auth(person), "If-Match": memory["etag"], "Idempotency-Key": key}
    body = {"content": "Prefers afternoon trips", "enabled": False}
    changed = client.patch(f"/v1/agent-memories/{memory['id']}", headers=headers, json=body)
    assert changed.status_code == 200, changed.text
    updated = changed.json()["data"]
    assert (updated["content"], updated["enabled"], updated["version"]) == ("Prefers afternoon trips", False, "2")
    assert updated["etag"] != memory["etag"] and updated["space_id"] == space_id
    again = client.patch(f"/v1/agent-memories/{memory['id']}", headers=headers, json=body)
    assert again.status_code == 200 and again.json()["data"] == updated
    different = client.patch(f"/v1/agent-memories/{memory['id']}", headers=headers, json={"enabled": True})
    assert different.status_code == 409 and different.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    stale = client.patch(f"/v1/agent-memories/{memory['id']}", headers={**headers, "Idempotency-Key": str(uuid4())}, json={"enabled": True})
    assert stale.status_code == 412
    assert client.get("/v1/agent-memories", headers=auth(person)).json()["data"] == [updated]
    model = install(app, script(call("read_memories"), say("No active memories.")))
    ask(client, person, space_id, "What memories can you retrieve now?")
    assert tool_results(model.calls[-1][0])[0]["result"]["memories"] == []
    enabled = client.patch(f"/v1/agent-memories/{memory['id']}",
                           headers={**auth(person), "If-Match": updated["etag"], "Idempotency-Key": str(uuid4())}, json={"enabled": True})
    assert enabled.status_code == 200 and enabled.json()["data"]["version"] == "3"
    model = install(app, script(call("read_memories"), say("Read your preference.")))
    ask(client, person, space_id, "Read my active memories")
    assert [item["content"] for item in tool_results(model.calls[-1][0])[0]["result"]["memories"]] == [body["content"]]


@pytest.fixture
def controlled_memory(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("save_memory", content="Prefers morning trips"), say("Saved.")))
    approve(client, person, ask(client, person, space_id, "Remember my travel preference"))
    [memory] = client.get("/v1/agent-memories", headers=auth(person)).json()["data"]
    return person, space_id, memory


@pytest.mark.parametrize("enabled", [True, False])
def test_memory_controls_old_retry_returns_current_state_without_reapplying(client, app, controlled_memory, enabled):
    person, _space_id, memory = controlled_memory
    headers = {**auth(person), "If-Match": memory["etag"], "Idempotency-Key": str(uuid4())}
    body = {"content": "An earlier reviewed note", "enabled": enabled}
    path = f"/v1/agent-memories/{memory['id']}"
    first = client.patch(path, headers=headers, json=body)
    assert first.status_code == 200, first.text
    latest = client.patch(path, headers={**auth(person), "If-Match": first.json()["data"]["etag"],
                                        "Idempotency-Key": str(uuid4())},
                          json={"content": "The latest reviewed note", "enabled": not enabled})
    assert latest.status_code == 200, latest.text
    replay = client.patch(path, headers=headers, json=body)
    assert replay.status_code == 200 and replay.json()["data"] == latest.json()["data"]
    assert replay.json()["data"]["enabled"] is not enabled
    assert replay.json()["data"]["version"] == "3" and count(app, AgentMemoryCommand) == 2


def test_memory_controls_require_the_owner_even_for_a_member_of_the_same_space(client, app, controlled_memory):
    person, space_id, memory = controlled_memory
    other = account(client, app, "other-memory-owner@example.test")
    admit(client, person, space_id, other)
    headers = {"If-Match": memory["etag"], "Idempotency-Key": str(uuid4())}
    path = f"/v1/agent-memories/{memory['id']}"
    assert client.patch(path, headers=headers, json={"enabled": False}).status_code == 401
    refused = client.patch(path, headers={**headers, **auth(other)}, json={"enabled": False})
    assert refused.status_code == 404 and refused.json()["error"]["code"] == "NOT_FOUND"
    assert client.get("/v1/agent-memories", headers=auth(other)).json()["data"] == []
    assert client.get("/v1/agent-memories", headers=auth(person)).json()["data"] == [memory]
    assert count(app, AgentMemoryCommand) == 0


@pytest.mark.parametrize("body", [
    {}, {"enabled": None}, {"enabled": "false"}, {"enabled": 0}, {"content": None}, {"content": "  "},
    {"content": "x" * 201}, {"content": "hidden\u0000control"}, {"content": "my password is a synthetic example"},
    {"space_id": str(uuid4())}, {"account_id": str(uuid4())}, {"source": "system"},
])
def test_memory_controls_reject_invalid_or_sensitive_changes(client, app, controlled_memory, body):
    person, _space_id, memory = controlled_memory
    response = client.patch(f"/v1/agent-memories/{memory['id']}",
                            headers={**auth(person), "If-Match": memory["etag"], "Idempotency-Key": str(uuid4())}, json=body)
    assert response.status_code == 422, response.text
    assert client.get("/v1/agent-memories", headers=auth(person)).json()["data"] == [memory]
    assert count(app, AgentMemoryCommand) == 0


def test_memory_controls_noop_preconditions_and_delete_receipt_cleanup(client, app, controlled_memory):
    person, _space_id, memory = controlled_memory
    path = f"/v1/agent-memories/{memory['id']}"
    headers = {**auth(person), "Idempotency-Key": str(uuid4())}
    assert client.patch(path, headers=headers, json={"enabled": True}).status_code == 428
    assert client.patch(path, headers={**auth(person), "If-Match": memory["etag"]}, json={"enabled": True}).status_code == 422
    headers["If-Match"] = memory["etag"]
    response = client.patch(path, headers=headers, json={"enabled": True})
    assert response.status_code == 200 and response.json()["data"] == memory
    assert count(app, AgentMemoryCommand) == 1
    assert client.delete(path, headers=auth(person)).status_code == 200
    assert count(app, AgentMemoryCommand) == count(app, AgentMemory) == 0
    assert client.patch(path, headers=headers, json={"enabled": True}).status_code == 404


def test_memory_controls_disable_global_preference_for_both_agents(client, app):
    person, space_id = solo(client, app)
    with app.state.sessions.begin() as database:
        database.add(AgentMemory(id=str(uuid4()), account_id=person["user"]["id"], space_id=None,
                                 kind="preference", key="reminder_time", content="09:30", source="preference",
                                 source_run_id=None, created_at=app.state.clock()))
    [memory] = client.get("/v1/agent-memories", headers=auth(person)).json()["data"]
    path = f"/v1/agent-memories/{memory['id']}"
    headers = {**auth(person), "If-Match": memory["etag"], "Idempotency-Key": str(uuid4())}
    invalid = client.patch(path, headers=headers, json={"content": "Not a reminder time"})
    assert invalid.status_code == 422 and count(app, AgentMemoryCommand) == 0
    changed = client.patch(path, headers=headers, json={"content": "14:45", "enabled": False})
    assert changed.status_code == 200, changed.text
    for scope in (MAIN_AGENT, space_id):
        model = install(app, script(call("read_memories"), say("No active memories.")))
        ask(client, person, scope, "What memories can you use?")
        assert "Saved memories: 0" in model.calls[0][0][1]["content"]
        assert tool_results(model.calls[-1][0])[0]["result"]["memories"] == []
        assert "14:45" not in json.dumps(model.calls)
    assert client.get("/v1/agent-memories", headers=auth(person)).json()["data"] == [changed.json()["data"]]


def test_upgrade_from_0057_preserves_existing_agent_data_and_enables_memory_controls(client, app):
    from app.modules.agents.registry import VERSION

    person, space_id = solo(client, app)
    other = account(client, app, "upgrade-other@example.test")
    admit(client, person, space_id, other)
    for scope, content in ((MAIN_AGENT, "Prefers public event summaries"), (space_id, "Prefers afternoon trips")):
        install(app, script(call("save_memory", content=content), say("Saved.")))
        approved = approve(client, person, ask(client, person, scope, "Remember this preference"))
        assert approved.status_code == 200, approved.text
    install(app, script(call("create_task", title="Review the weekend plan")))
    waiting = ask(client, person, space_id, "Create our planning task")
    assert waiting["status"] == "waiting_for_approval"
    memories_before = client.get("/v1/agent-memories", headers=auth(person)).json()["data"]
    assert len(memories_before) == 2
    with app.state.engine.connect() as connection:
        runs_before = connection.execute(select(AgentRun.__table__)).mappings().all()
        approvals_before = connection.execute(select(AgentApproval.__table__)).mappings().all()
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0057")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0057"
            columns = {column["name"] for column in inspect(connection).get_columns("agent_memories")}
            assert "enabled" not in columns and "version" not in columns
            assert connection.scalar(text("SELECT count(*) FROM agent_memories")) == 2
            assert set(connection.scalars(text("SELECT definition_version FROM agent_instances"))) == {5}
    finally:
        command.upgrade(config, "head")
    with app.state.engine.connect() as connection:
        assert connection.execute(select(AgentRun.__table__)).mappings().all() == runs_before
        assert connection.execute(select(AgentApproval.__table__)).mappings().all() == approvals_before
        assert set(connection.scalars(text("SELECT definition_version FROM agent_instances"))) == {VERSION}
    signed_in = client.get("/v1/me", headers=auth(person))
    assert signed_in.status_code == 200 and signed_in.json()["data"]["id"] == person["user"]["id"]
    memories_after = client.get("/v1/agent-memories", headers=auth(person)).json()["data"]
    assert memories_after == memories_before
    assert all(memory["enabled"] is True and memory["version"] == "1" and memory["etag"] for memory in memories_after)
    assert client.get("/v1/agent-memories", headers=auth(other)).json()["data"] == []
    parameters = {"space_id": space_id, "status": "waiting_for_approval"}
    inbox = client.get("/v1/agent-runs", headers=auth(person), params=parameters)
    assert inbox.status_code == 200 and [run["id"] for run in inbox.json()["data"]] == [waiting["id"]]
    assert client.get("/v1/agent-runs", headers=auth(other), params=parameters).json()["data"] == []
    memory = next(item for item in memories_after if item["space_id"] == space_id)
    changed = client.patch(f"/v1/agent-memories/{memory['id']}", json={"enabled": False},
                           headers={**auth(person), "If-Match": memory["etag"], "Idempotency-Key": str(uuid4())})
    assert changed.status_code == 200 and changed.json()["data"]["enabled"] is False
    model = install(app, script(call("read_memories"), say("No active Space memory.")))
    ask(client, person, space_id, "Read my active memories")
    assert tool_results(model.calls[-1][0])[0]["result"]["memories"] == []
    install(app, script(say("Created the reviewed planning task.")))
    finished = approve(client, person, waiting)
    assert finished.status_code == 200 and finished.json()["data"]["approval"]["status"] == "approved"
    assert count(app, AgentMemory) == 2 and count(app, AgentMemoryCommand) == 1


def test_memory_controls_migration_refuses_losing_disabled_state_and_edit_receipts(client, app, controlled_memory):
    person, _space_id, memory = controlled_memory
    path = f"/v1/agent-memories/{memory['id']}"
    disabled = client.patch(path, headers={**auth(person), "If-Match": memory["etag"], "Idempotency-Key": str(uuid4())},
                            json={"enabled": False})
    assert disabled.status_code == 200, disabled.text
    config = Config("alembic.ini")
    with pytest.raises(RuntimeError, match="re-enable disabled memories"):
        command.downgrade(config, "0058")
    assert client.get("/v1/agent-memories", headers=auth(person)).json()["data"] == [disabled.json()["data"]]
    enabled = client.patch(path, headers={**auth(person), "If-Match": disabled.json()["data"]["etag"],
                                         "Idempotency-Key": str(uuid4())}, json={"enabled": True})
    assert enabled.status_code == 200, enabled.text
    with pytest.raises(RuntimeError, match="memory change receipts"):
        command.downgrade(config, "0058")
    assert count(app, AgentMemoryCommand) == 2
    assert client.delete(path, headers=auth(person)).status_code == 200
    try:
        command.downgrade(config, "0058")
    finally:
        command.upgrade(config, "head")
    from tests.test_migrations import test_migrated_schema_matches_models

    test_migrated_schema_matches_models(app)


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
    person, space_id = solo(client, app)
    install(app, script(say("Hello!")))
    run = ask(client, person, MAIN_AGENT, "hi")
    assert (run["agent_kind"], run["space_id"], run["status"]) == ("main", None, "completed")
    config = Config("alembic.ini")
    stored_run = select(AgentRun.__table__).where(AgentRun.id == run["id"])
    with app.state.engine.connect() as connection:
        original_revision = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one()
        original_run = connection.execute(stored_run).mappings().one()
    with pytest.raises(RuntimeError, match="Main Agent requests"):
        command.downgrade(config, "0052")
    with app.state.engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == original_revision
        assert connection.execute(stored_run).mappings().one() == original_run
    assert count(app, AgentRun, AgentRun.agent_kind == "main") == 1
    assert count(app, AgentMemory) == 0
    with pytest.raises(IntegrityError, match="ck_agent_run_kind"):
        with app.state.engine.begin() as connection:
            connection.execute(AgentRun.__table__.update().where(AgentRun.id == run["id"]).values(space_id=space_id))
    from tests.test_migrations import test_migrated_schema_matches_models

    test_migrated_schema_matches_models(app)
