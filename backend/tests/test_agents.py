import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.modules.agents.models import AgentApproval, AgentMemory, AgentRun
from app.modules.planning.models import Task
from app.modules.scheduling.models import Reminder
from tests.test_identity import account, auth
from tests.test_messaging import admit, wait_until_blocked
from tests.test_spaces import create_space
from tests.test_tasks import create_task


def ask(client, actor, space_id, message, key=None):
    response = client.post(
        "/v1/agent-runs", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={"space_id": space_id, "message": message},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def approve(client, actor, run, key=None, etag=None):
    approval = run["approval"]
    return client.post(
        f"/v1/agent-approvals/{approval['id']}/approve", json={},
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4()), "If-Match": etag or approval["etag"]},
    )


def answer(client, actor, run, text):
    response = client.post(
        f"/v1/agent-runs/{run['id']}/resume", headers=auth(actor),
        json={"question_id": run["question"]["id"], "answer": text},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def fields(run):
    return {field["label"]: field["value"] for field in run["approval"]["fields"]}


def rename(client, actor, name):
    profile = client.get("/v1/me", headers=auth(actor))
    changed = client.patch("/v1/me/profile", headers={**auth(actor), "If-Match": profile.headers["etag"]},
                           json={"display_name": name, "timezone": "Asia/Kolkata"})
    assert changed.status_code == 200, changed.text


def solo(client, app):
    person = account(client, app)
    return person, create_space(client, person).json()["data"]["id"]


def counts(app):
    with app.state.sessions() as database:
        return tuple(database.scalar(select(func.count()).select_from(model)) for model in (Task, Reminder, AgentMemory))


@pytest.mark.parametrize("message, category", [
    ("How much insulin should I take?", "health"),
    ("call the plumber", "external_contact"),
    ("remind Sam to buy milk", "other_people"),
    ("pay the electricity bill", "financial"),
    ("remove Sam from the family", "membership"),
    ("delete all tasks", "deletion"),
    ("remember my bank PIN is 4321", "sensitive_memory"),
])
def test_forbidden_requests_are_refused_and_change_nothing(client, app, message, category):
    person, space_id = solo(client, app)
    before = counts(app)
    run = ask(client, person, space_id, message)
    assert (run["status"], run["outcome"], run["stop_reason"]) == ("completed", "refused", f"refused_{category}")
    assert run["approval"] is None and run["tool_calls"] == [] and run["answer"]
    assert run["evidence"] == [{"kind": "policy", "ref": None, "label": "agent-policy-2026-10-01"}]
    assert counts(app) == before


def test_create_task_needs_the_exact_approval_and_runs_through_the_task_service(client, app):
    person, space_id = solo(client, app)
    run = ask(client, person, space_id, "add a task to water the plants tomorrow")
    assert run["status"] == "waiting_for_approval" and run["approval"]["tool_name"] == "tasks.create"
    assert fields(run) == {"Space": "Morgan family", "Title": "Water the plants", "Due date": "Sun 20 Sep 2026", "Assigned to": "Nobody"}
    assert counts(app)[0] == 0

    missing = client.post(f"/v1/agent-approvals/{run['approval']['id']}/approve", json={},
                          headers={**auth(person), "Idempotency-Key": str(uuid4())})
    assert missing.status_code == 428
    assert approve(client, person, run, etag='"stale"').status_code == 412
    key = str(uuid4())
    done = approve(client, person, run, key=key)
    assert done.status_code == 200, done.text
    result = done.json()["data"]
    assert (result["status"], result["outcome"], result["approval"]["status"]) == ("completed", "action_completed", "approved")
    assert [step["status"] for step in result["plan"]] == ["done", "done", "done"]
    task_id = result["approval"]["result_ref"]
    task = client.get(f"/v1/tasks/{task_id}", headers=auth(person)).json()["data"]
    assert (task["title"], task["due_date"], task["assignee"]) == ("Water the plants", "2026-09-20", None)
    assert approve(client, person, run, key=key).json()["data"] == result
    assert approve(client, person, run).json()["error"]["code"] == "APPROVAL_DECIDED"
    assert counts(app)[0] == 1


def test_unclear_assignee_gets_one_question_and_the_answer_is_used(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    for email, name in (("sam.one@example.test", "Sam Rao"), ("sam.two@example.test", "Sam Iyer")):
        member = account(client, app, email)
        rename(client, member, name)
        admit(client, owner, space_id, member)
    run = ask(client, owner, space_id, "add a task to fix the gate and assign it to Sam")
    assert run["status"] == "waiting_for_user" and "Sam Iyer" in run["question"]["text"]
    chosen = answer(client, owner, run, "Sam Rao")
    assert chosen["status"] == "waiting_for_approval" and fields(chosen)["Assigned to"] == "Sam Rao"
    assert answer(client, owner, run, "Sam Rao") == chosen
    assert approve(client, owner, chosen).json()["data"]["status"] == "completed"
    with app.state.sessions() as database:
        task = database.scalars(select(Task)).one()
    assert task.title == "Fix the gate" and task.assignee_account_id is not None


def test_completing_a_task_that_changed_after_the_proposal_is_refused(client, app):
    person, space_id = solo(client, app)
    task = create_task(client, person, space_id, title="Pay the school fees").json()["data"]
    run = ask(client, person, space_id, "mark the school fees as done")
    assert fields(run) == {"Task": "Pay the school fees", "Change": "Mark as completed"}
    edited = client.patch(f"/v1/tasks/{task['id']}", json={"title": "Pay the school fees online"},
                          headers={**auth(person), "Idempotency-Key": str(uuid4()), "If-Match": task_etag(client, person, task["id"])})
    assert edited.status_code == 200, edited.text
    result = approve(client, person, run).json()["data"]
    assert (result["status"], result["stop_reason"], result["approval"]["status"]) == ("failed", "PRECONDITION_FAILED", "cancelled")
    assert client.get(f"/v1/tasks/{task['id']}", headers=auth(person)).json()["data"]["status"] == "open"

    again = ask(client, person, space_id, "mark pay the school fees online as done")
    finished = approve(client, person, again).json()["data"]
    assert finished["status"] == "completed"
    assert client.get(f"/v1/tasks/{task['id']}", headers=auth(person)).json()["data"]["status"] == "completed"


def task_etag(client, actor, task_id):
    return client.get(f"/v1/tasks/{task_id}", headers=auth(actor)).headers["etag"]


def test_reminders_ask_for_a_missing_time_and_schedule_only_the_reviewed_one(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Buy groceries")
    run = ask(client, person, space_id, "remind me to buy groceries")
    assert run["question"]["text"] == "What time should I remind you?"
    assert answer(client, person, run, "soon")["question"]["text"].startswith("I couldn't read that time.")
    run = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(person)).json()["data"]
    proposed = answer(client, person, run, "6 pm")
    assert fields(proposed) == {"Task": "Buy groceries", "When": "Sat 19 Sep 2026, 18:00",
                                "Time zone": "Asia/Kolkata (UTC+05:30)", "Who": "You, in this app"}
    assert approve(client, person, proposed).json()["data"]["outcome"] == "action_completed"
    reminders = client.get("/v1/reminders", headers=auth(person)).json()["data"]
    assert [(item["task_title"], item["scheduled_at"], item["status"]) for item in reminders] == [
        ("Buy groceries", "2026-09-19T12:30:00Z", "scheduled"),
    ]
    again = ask(client, person, space_id, "remind me to buy groceries at 7 pm")
    assert again["stop_reason"] == "reminder_exists" and again["approval"] is None


def test_memories_are_saved_only_after_approval_used_and_deleted(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Call the bank")
    preference = ask(client, person, space_id, "remember my reminder time is 9:15")
    assert fields(preference) == {"Default reminder time": "09:15"} and counts(app)[2] == 0
    assert approve(client, person, preference).json()["data"]["status"] == "completed"
    note = ask(client, person, space_id, "remember that the plumber comes on Fridays")
    approve(client, person, note)
    listed = ask(client, person, space_id, "what do you remember")
    assert "Default reminder time: 09:15" in listed["answer"] and "Note: The plumber comes on Fridays" in listed["answer"]

    reminded = ask(client, person, space_id, "remind me about call the bank tomorrow")
    assert fields(reminded)["When"] == "Sun 20 Sep 2026, 09:15"
    assert any(item["kind"] == "memory" for item in reminded["evidence"])
    memories = client.get("/v1/agent-memories", headers=auth(person)).json()["data"]
    assert {memory["label"] for memory in memories} == {"Default reminder time", "Note"}
    for memory in memories:
        deleted = client.delete(f"/v1/agent-memories/{memory['id']}", headers=auth(person))
        assert deleted.json()["data"] == {"id": memory["id"], "status": "deleted"}
    assert client.get("/v1/agent-memories", headers=auth(person)).json()["data"] == []


def test_reject_cancel_and_expiry_leave_everything_unchanged(client, app):
    person, space_id = solo(client, app)
    before = counts(app)
    rejected = ask(client, person, space_id, "add a task to paint the fence")
    result = client.post(f"/v1/agent-approvals/{rejected['approval']['id']}/reject", json={},
                         headers={**auth(person), "If-Match": rejected["approval"]["etag"]}).json()["data"]
    assert (result["status"], result["approval"]["status"], result["answer"]) == ("cancelled", "rejected", "Okay. Nothing was changed.")
    cancelled = ask(client, person, space_id, "add a task to sweep the porch")
    result = client.post(f"/v1/agent-runs/{cancelled['id']}/cancel", headers=auth(person), json={}).json()["data"]
    assert (result["status"], result["approval"]["status"]) == ("cancelled", "cancelled")
    late = ask(client, person, space_id, "add a task to wash the car")
    app.state.clock.now += timedelta(minutes=16)
    result = approve(client, person, late).json()["data"]
    assert (result["status"], result["approval"]["status"]) == ("expired", "expired")
    assert counts(app) == before


def test_requests_are_private_retry_safe_and_bound_to_the_current_membership(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    member = account(client, app, "agent-member@example.test")
    admit(client, owner, space_id, member)
    key = str(uuid4())
    run = ask(client, member, space_id, "add a task to fold laundry", key=key)
    assert ask(client, member, space_id, "add a task to fold laundry", key=key)["id"] == run["id"]
    conflict = client.post("/v1/agent-runs", headers={**auth(member), "Idempotency-Key": key},
                           json={"space_id": space_id, "message": "add a task to iron shirts"})
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert client.get(f"/v1/agent-runs/{run['id']}", headers=auth(owner)).status_code == 404
    assert approve(client, owner, run).status_code == 404
    assert client.get(f"/v1/agent-runs?space_id={space_id}", headers=auth(owner)).json()["data"] == []

    for message in ("help", "list my tasks", "what can you do"):
        app.state.clock.now += timedelta(seconds=1)
        ask(client, member, space_id, message)
    first = client.get(f"/v1/agent-runs?space_id={space_id}&limit=2", headers=auth(member)).json()
    rest = client.get(f"/v1/agent-runs?space_id={space_id}&limit=2&cursor={first['pagination']['next_cursor']}", headers=auth(member)).json()
    assert [item["message"] for item in first["data"] + rest["data"]] == ["what can you do", "list my tasks", "help", "add a task to fold laundry"]

    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    entry = next(item for item in roster if item["account_id"] == member["user"]["id"])
    removed = client.post(f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove", json={},
                          headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": entry["etag"]})
    assert removed.status_code == 200, removed.text
    assert client.get(f"/v1/agent-runs/{run['id']}", headers=auth(member)).status_code == 404
    assert approve(client, member, run).status_code == 404
    admit(client, owner, space_id, member)
    assert client.get(f"/v1/agent-runs/{run['id']}", headers=auth(member)).status_code == 404
    assert approve(client, member, run).status_code == 404
    assert client.get(f"/v1/agent-runs?space_id={space_id}", headers=auth(member)).json()["data"] == []
    with app.state.sessions() as database:
        assert database.scalar(select(AgentApproval.status).where(AgentApproval.run_id == run["id"])) == "pending"
        assert database.scalar(select(func.count()).select_from(Task)) == 0


def test_listing_tasks_reads_only_visible_tasks_and_the_api_requires_a_session(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Renew the passport", due_date="2026-09-19")
    create_task(client, person, space_id, title="Plan the trip", due_date="2026-10-30")
    run = ask(client, person, space_id, "what's due today")
    assert run["answer"] == "1. Renew the passport (due Sat 19 Sep 2026)"
    assert [call["tool_name"] for call in run["tool_calls"]] == ["family.tasks.list"]
    assert client.post("/v1/agent-runs", headers={"Idempotency-Key": str(uuid4())},
                       json={"space_id": space_id, "message": "help"}).status_code == 401
    tools = client.get("/v1/agent-tools", headers=auth(person)).json()["data"]
    assert {tool["name"]: tool["requires_approval"] for tool in tools} == {
        "family.members.list": False, "family.tasks.list": False, "agent.memory.read": False,
        "tasks.create": True, "tasks.complete": True, "reminders.schedule": True, "agent.memory.save": True,
    }
    schema = app.openapi()["paths"]
    assert all(operation.get("security") for path, item in schema.items() if path.startswith("/v1/agent") for operation in item.values())
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AgentRun)) == 1


def notes(app, person, count):
    with app.state.sessions.begin() as database:
        for index in range(count):
            database.add(AgentMemory(
                id=str(uuid4()), account_id=person["user"]["id"], kind="note", key=None, content=f"Note {index + 1}",
                source="approved_request", source_run_id=None, created_at=app.state.clock() - timedelta(minutes=index + 1),
            ))


def test_unreadable_answers_stop_after_a_few_questions(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Buy groceries")
    run = ask(client, person, space_id, "remind me to buy groceries")
    for _round in range(3):
        run = answer(client, person, run, "soon")
        assert run["status"] == "waiting_for_user"
    stopped = answer(client, person, run, "soon")
    assert (stopped["status"], stopped["stop_reason"], stopped["question"], stopped["approval"]) == (
        "completed", "too_many_questions", None, None,
    )
    assert stopped["answer"].startswith("I still couldn't understand")
    assert len(stopped["events"]) == 10 and counts(app)[1] == 0


def test_the_last_note_slot_goes_to_one_approval_only(client, app, monkeypatch):
    person, space_id = solo(client, app)
    notes(app, person, 49)
    first = ask(client, person, space_id, "remember that the bins go out on Monday")
    second = ask(client, person, space_id, "remember that the milk comes on Tuesday")
    agents = app.state.agents
    original, reached, release = agents.save_memory, threading.Event(), threading.Event()

    def paused(*arguments):
        result = original(*arguments)
        if not reached.is_set():
            reached.set()
            assert release.wait(10)
        return result

    monkeypatch.setattr(agents, "save_memory", paused)
    with ThreadPoolExecutor(max_workers=2) as pool:
        saved = pool.submit(approve, client, person, first)
        assert reached.wait(10)
        refused = pool.submit(approve, client, person, second)
        wait_until_blocked(app, refused)
        blocked = not refused.done()
        release.set()
        results = [saved.result(timeout=10).json()["data"], refused.result(timeout=10).json()["data"]]
    assert blocked, "The second approval must wait for the first one."
    assert [(item["status"], item["stop_reason"]) for item in results] == [("completed", None), ("failed", "MEMORY_LIMIT_REACHED")]
    assert results[1]["approval"]["status"] == "cancelled"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AgentMemory)) == 50


def test_parallel_retries_of_one_request_create_one_run(client, app):
    person, space_id = solo(client, app)
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = list(pool.map(lambda _attempt: client.post(
            "/v1/agent-runs", headers={**auth(person), "Idempotency-Key": key},
            json={"space_id": space_id, "message": "add a task to clean the windows"},
        ), range(3)))
    assert [response.status_code for response in responses] == [201, 201, 201]
    assert len({response.json()["data"]["id"] for response in responses}) == 1
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AgentRun)) == 1


def test_the_memory_answer_lists_ten_and_counts_the_rest(client, app):
    person, space_id = solo(client, app)
    notes(app, person, 12)
    listed = ask(client, person, space_id, "what do you remember")
    assert listed["answer"].endswith("\n…and 2 more in Memories.")
    assert listed["answer"].count("\nNote: ") == 10
    assert [item["kind"] for item in listed["evidence"]] == ["memory"] * 10
