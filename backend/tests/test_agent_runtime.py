"""The LLM agent loop (DEC-059): the model decides, Python validates, the person approves every change."""

import json
from datetime import datetime, timedelta, timezone
from time import monotonic, sleep
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import func, select

from app.errors import DomainError
from app.modules.agents.llm import ModelError, ModelTurn, estimate_tokens
from app.modules.agents.models import AgentApproval, AgentMemory, AgentRun, AgentToolCall
from app.modules.agents.prompts import MAIN, RESEARCH
from app.modules.agents.runtime import TOOL_TEXT, AgentRuntime, tool_message
from app.modules.agents.schemas import AgentInteractionView, AgentRunView, CreateWebFetch, WebFetchPage
from app.modules.agents.toolkit import (
    DOCUMENT_TEXT,
    EventBudgetArgs,
    ListEventsArgs,
    ListRemindersArgs,
    ListTasksArgs,
    ReadDocumentArgs,
    ToolContext,
    ToolProblem,
    execute_schedule_reminder,
    get_event_budget,
    list_documents,
    list_events,
    list_reminders,
    list_tasks,
    read_document,
)
from app.modules.agents.web import (
    FETCH_URL,
    LONGEST_PAGE,
    PAGE_CHUNK,
    PREVIEW_TEXT,
    SEARCH_URL,
    WebLookup,
    article_changes,
    completed_reading_answer,
    page_text,
    stored_sources,
    stored_web_text,
    web_source,
    youtube_id,
)
from app.modules.community.models import PostComment, PublicPage, PublicPost
from app.modules.events.models import SpaceEvent
from app.modules.identity.models import AccountSession, OutboxEvent
from app.modules.planning.models import Task, TaskAudit
from app.modules.polls.models import SpacePoll, SpacePollVote
from app.modules.scheduling.models import Reminder
from app.modules.scheduling.schemas import CreateReminder, PreviewReminder
from app.modules.spaces.models import Space, SpaceAuditEvent
from tests.agent_support import (
    MAIN_AGENT,
    answer,
    approve,
    ask,
    call,
    fields,
    install,
    reject,
    say,
    script,
    solo,
)
from tests.test_community import create_page, draft, publish
from tests.test_documents import add as add_document
from tests.test_event_budget_splits import ids, split
from tests.test_event_budgets import budget, gathering, planned, spend
from tests.test_event_contributions import give
from tests.test_events import create as create_event
from tests.test_events import outbox
from tests.test_identity import account, auth
from tests.test_messaging import admit, roster_entry
from tests.test_polls import create_poll as create_space_poll
from tests.test_space_agent_switch import turn_agent
from tests.test_spaces import create_space
from tests.test_tasks import change_task, create_task


def count(app, model, *conditions):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(model).where(*conditions))


def tool_results(messages):
    return [json.loads(message["content"]) for message in messages if message["role"] == "tool"]


@pytest.mark.parametrize("tool_name", ["create_task", "create_event", "save_memory", "ask_user", "unknown_tool"])
@pytest.mark.parametrize("receipt", [
    {"result": {"task_id": "synthetic-task", "done": "Created the reviewed task."}},
    {"error": "The person rejected this change. Do not repeat it."},
])
def test_context_compaction_preserves_action_and_control_receipts(tool_name, receipt):
    runtime = AgentRuntime(SimpleNamespace(model=SimpleNamespace(call_tokens=10_000)))
    base = [{"role": "system", "content": "Keep permission checks and reviewed actions."}]
    transcript = [{"role": "user", "content": "Make the reviewed change only once, then summarize."}]
    protected = call(tool_name, title="Reviewed change").message()
    protected_result = tool_message(protected["tool_calls"][0]["id"], receipt)
    transcript.extend([protected, protected_result])
    for content in ["source text " * 4_000, "Recent source one", "Recent source two"]:
        reading = call("read_document", document_id=str(uuid4())).message()
        transcript.extend([reading, {"role": "tool", "tool_call_id": reading["tool_calls"][0]["id"],
                                    "content": json.dumps({"result": {"text": content}})}])
    assert estimate_tokens({"messages": base + transcript, "tools": []}) > runtime.budget()

    fitted = runtime.fit(base, [], list(transcript), [])

    assert next(message for message in fitted if message.get("tool_call_id") == protected_result["tool_call_id"]) == protected_result
    assert "trimmed" in json.loads(fitted[len(base) + 4]["content"])
    assert fitted[-4:] == transcript[-4:]
    assert [message for message in fitted if message["role"] != "tool"] == base + [message for message in transcript if message["role"] != "tool"]
    assert estimate_tokens({"messages": fitted, "tools": []}) <= runtime.budget()


@pytest.mark.parametrize("agent_kind,space_id", [("main", None), ("space", str(uuid4()))])
def test_interaction_projection_shares_public_fields_without_private_state(agent_kind, space_id):
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    run = AgentRunView(
        id=str(uuid4()), agent_kind=agent_kind, space_id=space_id, message="Summarize this",
        status="completed", outcome="answered", stop_reason=None, intent=None,
        answer="## Result\nA supported answer.", question=None, approval=None, plan=[], tool_calls=[],
        evidence=[], events=[], created_at=now, updated_at=now, finished_at=now, version="1",
        state={"transcript": "PRIVATE_STATE_SENTINEL", "provider_key": "PRIVATE_KEY_SENTINEL"},
    )
    output = run.model_dump(mode="json")
    interaction = AgentInteractionView.model_validate(output["interaction"])
    assert interaction.schema_version == 1 and interaction.run_id == run.id
    assert (interaction.agent_kind, interaction.space_id) == (agent_kind, space_id)
    assert [(item.id, item.role) for item in interaction.messages] == [
        (f"{run.id}:request", "user"), (f"{run.id}:response", "agent"),
    ]
    assert output["interaction"]["messages"][0]["parts"] == [{"type": "text", "content": run.message}]
    assert output["interaction"]["messages"][1]["parts"] == [{"type": "markdown", "content": run.answer}]
    assert "PRIVATE_" not in run.model_dump_json()
    assert run.model_copy(update={"version": "2"}).interaction.messages[1].id == interaction.messages[1].id
    output["interaction"]["messages"][1]["parts"].append({"type": "reasoning", "content": "Not public"})
    with pytest.raises(ValueError, match="union_tag_invalid"):
        AgentInteractionView.model_validate(output["interaction"])


def test_source_retrieval_time_survives_storage_without_fabricating_unknown_dates():
    link = "https://cooking.example.org/research"
    timestamp = "2026-10-08T12:00:00+00:00"
    source = web_source("Guide", link, read=True, retrieved_at=timestamp)
    assert source["retrieved_at"] == timestamp
    assert stored_sources({"web_sources": [source]}) == [source]
    for missing in (None, "", "2026-10-08", "2026-10-08T12:00:00", "not a timestamp", {"secret": "hidden"}):
        assert web_source("Guide", link, retrieved_at=missing)["retrieved_at"] is None
    legacy = {"messages": [
        {"role": "assistant", "tool_calls": [{"id": "read", "function": {"name": "read_web_page"}}]},
        {"role": "tool", "tool_call_id": "read", "content": json.dumps({"result": {
            "url": link, "title": "Guide", "text": "Read content", "retrieved_at": timestamp,
        }})},
    ]}
    assert stored_sources(legacy) == [source]


def test_interaction_projection_keeps_exact_approval_tool_source_task_and_activity_records():
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    run_id, space_id, approval_id = (str(uuid4()) for _index in range(3))
    run = AgentRunView(
        id=run_id, agent_kind="space", space_id=space_id, message="Create the reviewed task",
        status="waiting_for_approval", outcome=None, stop_reason=None, intent="create_task", answer=None,
        question=None, approval={
            "id": approval_id, "run_id": run_id, "space_id": space_id, "tool_name": "tasks.create",
            "risk": "medium", "summary": "Create this task", "fields": [{"label": "Title", "value": "Exact title"}],
            "status": "pending", "reason": None, "result_ref": None, "created_at": now,
            "expires_at": now + timedelta(minutes=30), "decided_at": None, "version": "1", "etag": '"reviewed"',
        },
        sources=[{"title": "Documentation", "url": "https://example.org/docs", "read": True}],
        plan=[{"id": "review", "label": "Review task", "kind": "approval", "tool": "tasks.create", "status": "pending"}],
        todos=[{"content": "Create the task", "status": "in_progress"}],
        tool_calls=[{
            "id": str(uuid4()), "sequence": 1, "tool_name": "tasks.list", "tool_version": "1", "effect": "read",
            "risk": "low", "status": "succeeded", "summary": "Read visible tasks", "result_ref": None,
            "error_code": None, "approval_id": None, "created_at": now,
        }],
        evidence=[{"kind": "policy", "ref": space_id, "label": "Space permissions"}],
        events=[{"sequence": 1, "event_type": "approval.requested", "summary": "Waiting for review", "created_at": now}],
        handoffs=[{"space_id": space_id, "name": "This Space", "space_type": "solo"}],
        created_at=now, updated_at=now, finished_at=None, version="2",
    )
    output = run.model_dump(mode="json")
    parts = {part["type"]: part for part in output["interaction"]["messages"][1]["parts"]}
    assert set(parts) == {"activity", "task", "tool", "sources", "evidence", "approval", "handoffs"}
    assert parts["approval"]["approval"] == output["approval"]
    assert parts["tool"]["call"] == output["tool_calls"][0]
    assert parts["activity"]["events"] == output["events"]
    assert parts["sources"]["sources"] == output["sources"]
    assert parts["task"] == {"type": "task", "plan": output["plan"], "todos": output["todos"]}
    assert parts["evidence"]["items"] == output["evidence"]
    assert parts["handoffs"]["handoffs"] == output["handoffs"]
    schema = AgentRunView.model_json_schema(mode="serialization")
    assert schema["properties"]["interaction"]["readOnly"] is True
    assert schema["$defs"]["AgentChatMessage"]["properties"]["parts"]["items"]["discriminator"]["propertyName"] == "type"


@pytest.mark.parametrize("scope", ["main", "space"])
def test_interaction_api_uses_authorized_run_projection_and_keeps_other_accounts_out(client, app, scope):
    person, space_id = solo(client, app)
    stranger = account(client, app, "interaction-stranger@example.test")
    install(app, script(say("## Answer\nA structured result.")))
    run = ask(client, person, MAIN_AGENT if scope == "main" else space_id, "Explain this result")
    interaction = run["interaction"]
    assert interaction["run_id"] == run["id"] and interaction["agent_kind"] == scope
    assert interaction["messages"][1]["parts"][0] == {"type": "markdown", "content": run["answer"]}
    own = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(person))
    assert own.status_code == 200 and own.json()["data"]["interaction"] == interaction
    denied = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(stranger))
    assert denied.status_code == 404 and "interaction" not in denied.json()


@pytest.mark.parametrize("automatic", [False, True])
def test_agent_poll_creation_needs_review_and_retries_create_once(client, app, automatic):
    person, space_id = solo(client, app)
    model = install(app, script(call("create_poll", question="  Where shall we meet?  ", options=[" Cafe ", "Park"]),
                                say("Created the reviewed poll; nobody has voted.")))
    response = client.post("/v1/agent-runs", headers={**auth(person), "Idempotency-Key": str(uuid4())},
                           json={"space_id": space_id, "message": "Create a poll: Cafe or Park", "auto_approve": automatic})
    assert response.status_code == 201, response.text
    run = response.json()["data"]
    assert run["status"] == "waiting_for_approval" and run["approval"]["tool_name"] == "space.poll.create"
    assert fields(run)["Question"] == "Where shall we meet?"
    assert fields(run)["Choices"] == "1. Cafe\n2. Park"
    assert count(app, SpacePoll) == count(app, SpacePollVote) == 0
    key = str(uuid4())
    approved = approve(client, person, run, key=key)
    assert approved.status_code == 200, approved.text
    done = approved.json()["data"]
    assert done["status"] == "completed" and done["approval"]["status"] == "approved", done
    assert done["approval"]["reason"] is None
    result = tool_results(model.calls[-1][0])[-1]["result"]
    assert result["votes_cast"] == 0 and result["space_id"] == space_id
    polls = client.get(f"/v1/spaces/{space_id}/polls", headers=auth(person)).json()["data"]
    assert len(polls) == 1 and polls[0]["id"] == result["poll_id"]
    assert polls[0]["question"] == fields(run)["Question"] and polls[0]["total_votes"] == 0
    assert done["evidence"][-1]["kind"] == "poll" and done["evidence"][-1]["ref"] == polls[0]["id"]
    replay = approve(client, person, run, key=key)
    assert replay.status_code == 200 and replay.json()["data"] == done
    assert count(app, SpacePoll) == 1 and count(app, SpacePollVote) == 0 and len(model.calls) == 2


@pytest.mark.parametrize("tool_name,arguments", [
    ("list_polls", {}), ("get_poll", {"poll_id": str(uuid4())}),
    ("create_poll", {"question": "Where?", "options": ["Cafe", "Park"]}),
])
def test_agent_poll_tools_are_unavailable_to_main(client, app, tool_name, arguments):
    person, _space_id = solo(client, app)
    model = install(app, script(call(tool_name, **arguments), say("Ask in the current Space.")))
    run = ask(client, person, MAIN_AGENT, "Help with our poll")
    assert run["status"] == "completed" and run["approval"] is None
    assert all(tool_name not in tools for _messages, tools in model.calls)
    assert "error" in tool_results(model.calls[-1][0])[-1]
    assert count(app, SpacePoll) == count(app, AgentApproval) == 0


def test_agent_poll_read_cannot_cross_spaces_even_for_a_common_member(client, app):
    person, here = solo(client, app)
    elsewhere = create_space(client, person).json()["data"]["id"]
    poll = create_space_poll(client, person, elsewhere, question="Private other-Space question?").json()["data"]
    model = install(app, script(call("get_poll", poll_id=poll["id"]), say("Not available in this Space.")))
    denied = ask(client, person, here, "Read the referenced poll")
    assert denied["approval"] is None and denied["evidence"] == []
    assert "error" in tool_results(model.calls[-1][0])[-1]
    assert poll["question"] not in json.dumps(model.calls)
    model = install(app, script(call("get_poll", poll_id=poll["id"]), say("Read the current poll.")))
    allowed = ask(client, person, elsewhere, "Read this poll")
    result = tool_results(model.calls[-1][0])[-1]["result"]
    assert result["id"] == poll["id"] and result["question"] == poll["question"]
    assert "etag" not in result and "created_by_name" not in result
    assert allowed["evidence"] == [{"kind": "poll", "ref": poll["id"], "label": poll["question"]}]


def test_agent_poll_rejection_and_transaction_failure_do_not_create_a_poll(client, app, monkeypatch):
    person, space_id = solo(client, app)
    install(app, script(call("create_poll", question="Where?", options=["Cafe", "Park"]), say("Nothing created.")))
    waiting = ask(client, person, space_id, "Prepare a poll")
    refused = reject(client, person, waiting)
    assert refused.status_code == 200 and refused.json()["data"]["approval"]["status"] == "rejected"
    assert count(app, SpacePoll) == 0
    install(app, script(call("create_poll", question="Where?", options=["Cafe", "Park"]), say("Created once.")))
    waiting = ask(client, person, space_id, "Prepare another poll")
    apply = app.state.agents.apply

    def interrupted(*arguments, **options):
        assert apply(*arguments, **options) is True
        raise DomainError(503, "SYNTHETIC_FAILURE", "Synthetic failure after saving the poll.")

    monkeypatch.setattr(app.state.agents, "apply", interrupted)
    assert approve(client, person, waiting).status_code == 503
    assert count(app, SpacePoll) == 0
    with app.state.sessions() as database:
        assert database.get(AgentApproval, waiting["approval"]["id"]).status == "pending"
    monkeypatch.setattr(app.state.agents, "apply", apply)
    approved = approve(client, person, waiting)
    assert approved.status_code == 200 and approved.json()["data"]["approval"]["status"] == "approved"
    assert count(app, SpacePoll) == 1 and count(app, SpacePollVote) == 0


@pytest.mark.parametrize("changes", [
    {"options": ["Same", " same "]}, {"options": ["Only one"]},
    {"options": [str(index) for index in range(7)]}, {"space_id": str(uuid4())},
    {"closes_at": "2026-09-18T10:00:00Z"}, {"account_id": str(uuid4())},
])
def test_agent_poll_invalid_choices_deadline_or_authority_never_reach_approval(client, app, changes):
    person, space_id = solo(client, app)
    model = install(app, script(call("create_poll", **{"question": "Where?", "options": ["Cafe", "Park"], **changes}),
                                say("The poll needs valid details.")))
    run = ask(client, person, space_id, "Create a poll")
    assert run["status"] == "completed" and run["approval"] is None
    assert "error" in tool_results(model.calls[-1][0])[-1]
    assert count(app, SpacePoll) == count(app, AgentApproval) == 0


def test_agent_poll_list_follows_complete_pages_without_creating_or_voting(client, app):
    person, space_id = solo(client, app)
    expected = []
    for index in range(7):
        poll = create_space_poll(client, person, space_id, question=f"Question {index}: " + "x" * 170,
                                 options=[f"{option}: " + '\\"' * 37 for option in range(6)])
        assert poll.status_code == 201, poll.text
        expected.append(poll.json()["data"]["id"])
        app.state.clock.now += timedelta(seconds=1)

    pages = []

    def brain(messages, tools):
        results = tool_results(messages)
        if not results:
            return call("list_polls")
        assert "result" in results[-1], results[-1]
        result = results[-1]["result"]
        pages.append(result)
        if result["more"]:
            return call("list_polls", cursor=result["next_cursor"])
        return say("Read all available polls. No votes were cast.")

    install(app, brain)
    run = ask(client, person, space_id, "Read our open polls")
    assert run["status"] == "completed" and run["approval"] is None, run
    assert len(pages) > 1 and all(len(json.dumps({"result": page}, ensure_ascii=False, separators=(",", ":"))) <= 3000 for page in pages)
    assert [poll["id"] for page in pages for poll in page["polls"]] == list(reversed(expected))
    assert {item["ref"] for item in run["evidence"]} == set(expected)
    assert count(app, SpacePoll) == 7 and count(app, SpacePollVote) == count(app, AgentApproval) == 0


@pytest.mark.parametrize("change", ["member_removed", "agent_off"])
def test_agent_poll_approval_rechecks_current_space_access(client, app, change):
    owner, space_id = solo(client, app)
    member = account(client, app, "agent-poll-requester@example.test")
    admit(client, owner, space_id, member)
    install(app, script(call("create_poll", question="Where?", options=["Cafe", "Park"]), say("No poll created.")))
    waiting = ask(client, member, space_id, "Prepare a poll")
    assert waiting["status"] == "waiting_for_approval"
    if change == "member_removed":
        reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
        removed = client.post(f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove", json={},
                              headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]})
        assert removed.status_code == 200, removed.text
        assert approve(client, member, waiting).status_code == 404
    else:
        turn_agent(client, owner, space_id, False)
        result = approve(client, member, waiting)
        assert result.status_code == 200, result.text
        assert result.json()["data"]["approval"]["status"] == "cancelled"
    assert count(app, SpacePoll) == count(app, SpacePollVote) == 0


def test_agent_poll_changed_deadline_and_foreign_approved_payload_fail_closed(client, app):
    person, space_id = solo(client, app)
    closing = (app.state.clock.now + timedelta(minutes=6)).isoformat()
    install(app, script(call("create_poll", question="Where?", options=["Cafe", "Park"], closes_at=closing),
                        say("The closing time needs a fresh review.")))
    waiting = ask(client, person, space_id, "Create a poll closing in six minutes")
    assert waiting["status"] == "waiting_for_approval"
    assert fields(waiting)["Time zone"] == "Asia/Kolkata" and "+05:30" in fields(waiting)["Closes"]
    app.state.clock.now += timedelta(minutes=2)
    refused = approve(client, person, waiting)
    assert refused.status_code == 200 and refused.json()["data"]["approval"]["status"] == "cancelled"
    assert count(app, SpacePoll) == 0
    elsewhere = create_space(client, person).json()["data"]["id"]
    install(app, script(call("create_poll", question="Where?", options=["Cafe", "Park"]), say("Wrong Space.")))
    waiting = ask(client, person, space_id, "Prepare another poll")
    with app.state.sessions.begin() as database:
        stored = database.get(AgentApproval, waiting["approval"]["id"])
        stored.payload = {**stored.payload, "input": {**stored.payload["input"], "space_id": elsewhere}}
    refused = approve(client, person, waiting)
    assert refused.status_code == 200 and refused.json()["data"]["approval"]["status"] == "cancelled"
    assert count(app, SpacePoll) == 0


def test_event_budget_tool_is_read_only_and_needs_no_provider():
    from app.modules.agents.registry import MAIN_TOOLS, SPACE_TOOLS
    from app.modules.agents.toolkit import TOOLS

    tool = TOOLS["get_event_budget"]
    assert tool.effect == "read"
    assert tool.needs_web is False
    assert tool.prepare is None and tool.execute is None
    assert tool.registry == "events.budget.read"
    assert tool.registry in SPACE_TOOLS and tool.registry not in MAIN_TOOLS


def test_event_budget_tool_split_always_requires_explicit_approval():
    from app.modules.agents.registry import MAIN_TOOLS, SPACE_TOOLS
    from app.modules.agents.toolkit import TOOLS

    tool = TOOLS["set_event_split"]
    assert tool.effect == "write" and tool.always_ask is True
    assert tool.prepare is not None and tool.execute is not None
    assert tool.needs_web is False
    assert tool.registry == "events.budget.split"
    assert tool.registry in SPACE_TOOLS and tool.registry not in MAIN_TOOLS


@pytest.fixture
def event_budget_tool_view(monkeypatch):
    from app.modules.agents import toolkit
    from app.modules.events.schemas import BudgetView

    event_id, space_id = str(uuid4()), str(uuid4())
    now = datetime(2026, 10, 7, tzinfo=timezone.utc)
    view = BudgetView(
        event_id=event_id, currency="INR", estimate_minor=2300, recorded_minor=2300,
        uncategorized_minor=2300, remaining_minor=0, given_minor=2300, promised_minor=0,
        contribution_count=23, all_contributions=True, can_manage=True, can_record=True,
        etag='"budget-version"', split_candidates=[],
        categories=[{"id": str(uuid4()), "name": f"Category {index}", "estimate_minor": 100,
                     "recorded_minor": 100, "remaining_minor": 0} for index in range(23)],
        expenses=[{"id": str(uuid4()), "amount_minor": 100, "category_id": None, "note": '\\"' * 60,
                   "recorded_by_name": "Recorded name", "recorded_at": now, "mine": False,
                   "can_delete": True} for _index in range(23)],
        contributions=[{"id": str(uuid4()), "amount_minor": 100, "state": "given", "note": '\\"' * 60,
                        "contributor_name": "Contributor name", "recorded_at": now, "mine": False,
                        "can_change": False} for _index in range(23)],
        split={"method": "equal", "base": "recorded", "base_minor": 2300, "people_count": 23,
               "allocated_minor": 2300, "difference_minor": 0, "rounding_count": 0, "all_shares": True,
               "shares": [{"account_id": str(uuid4()), "name": "Member name", "mine": False,
                           "value": None, "share_minor": 100, "rounded_up": False} for _index in range(23)]},
    )
    event = SimpleNamespace(id=event_id, space_id=space_id, title="Shared event")
    events = SimpleNamespace(read=lambda token, identifier: event)
    monkeypatch.setattr(toolkit, "BudgetService", lambda service: SimpleNamespace(read=lambda token, identifier: view))
    context = SimpleNamespace(agent=SimpleNamespace(events=events), space_id=space_id, token="synthetic",
                              account_id=str(uuid4()), admission_id=str(uuid4()))
    return context, view


@pytest.mark.parametrize("section", ["summary", "categories", "expenses", "contributions", "shares"])
def test_event_budget_tool_pages_are_complete_bounded_and_exact(event_budget_tool_view, section):
    context, view = event_budget_tool_view
    dumped = view.model_dump(mode="json")
    expected = [] if section == "summary" else dumped["split"]["shares"] if section == "shares" else dumped[section]
    expected = [{key: value for key, value in row.items() if key not in {"can_change", "can_delete"}} for row in expected]
    received, arguments = [], {"event_id": view.event_id, "section": section}
    for _page in range(30):
        outcome = get_event_budget(context, EventBudgetArgs(**arguments))
        result = json.loads(tool_message("budget-page", {"result": outcome.data})["content"])["result"]
        assert result == outcome.data
        assert len(json.dumps({"result": result}, ensure_ascii=False, separators=(",", ":"))) <= 3000
        assert (result["currency"], result["amount_unit"], result["recorded_minor"]) == ("INR", "minor", 2300)
        assert result["visible_count"] == len(expected)
        assert "not verified payments" in result["notice"] and "not a debt" in result["notice"]
        assert "etag" not in result and "split_candidates" not in result
        assert outcome.evidence == [{"kind": "event", "ref": str(view.event_id), "label": "Shared event"}]
        received.extend(result["items"])
        if not result["more"]:
            assert result["next_offset"] is None
            break
        assert result["next_offset"] > arguments.get("offset", 0)
        arguments.update(offset=result["next_offset"], content_version=result["content_version"])
    else:
        pytest.fail("Budget pagination did not terminate.")
    assert received == expected


@pytest.mark.parametrize("change", ["amount", "visibility", "requester"])
def test_event_budget_tool_rejects_changed_continuations(event_budget_tool_view, change):
    context, view = event_budget_tool_view
    first = get_event_budget(context, EventBudgetArgs(event_id=view.event_id, section="expenses")).data
    assert first["more"] is True
    if change == "amount":
        view.recorded_minor += 1
    elif change == "visibility":
        view.all_contributions = False
        view.contributions = []
    else:
        context.admission_id = str(uuid4())
    with pytest.raises(ToolProblem) as refused:
        get_event_budget(context, EventBudgetArgs(event_id=view.event_id, section="expenses",
                         offset=first["next_offset"], content_version=first["content_version"]))
    assert refused.value.code == "budget_changed"
    restarted = get_event_budget(context, EventBudgetArgs(event_id=view.event_id, section="expenses")).data
    assert restarted["content_version"] != first["content_version"]


@pytest.mark.parametrize("changes", [
    {"event_id": "not-an-event"}, {"section": "payments"}, {"offset": True}, {"offset": 0.5},
    {"offset": -1}, {"offset": 201}, {"offset": 1, "section": "expenses"},
    {"offset": 1, "content_version": "a" * 64}, {"content_version": "unknown"}, {"transfer": True},
])
def test_event_budget_tool_rejects_invalid_arguments(changes):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        EventBudgetArgs.model_validate({"event_id": str(uuid4()), **changes})


def test_event_budget_tool_requires_current_space_even_outside_runtime(event_budget_tool_view):
    context, view = event_budget_tool_view
    for space_id in (None, str(uuid4())):
        context.space_id = space_id
        with pytest.raises(ToolProblem) as refused:
            get_event_budget(context, EventBudgetArgs(event_id=view.event_id))
        assert refused.value.code == "NOT_FOUND"


def test_event_budget_tool_split_review_preserves_every_person_within_client_limit(event_budget_tool_view):
    from app.modules.agents.toolkit import EventSplitArgs, prepare_set_event_split
    from app.modules.events.schemas import SplitCandidateView

    context, view = event_budget_tool_view
    view.split_candidates = [SplitCandidateView(account_id=share.account_id, name=f"Participant {index}")
                             for index, share in enumerate(view.split.shares, start=1)]
    args = EventSplitArgs(event_id=view.event_id, split={"method": "equal", "base": "recorded",
                         "people": [{"account_id": person.account_id} for person in view.split_candidates]})
    proposal = prepare_set_event_split(context, args)
    assert len(proposal.fields) <= 10
    for person in view.split_candidates:
        assert f"{person.name}: INR 1.00" in dict(proposal.fields)["Shares"]
    assert len(proposal.payload["split"]["people"]) == 23


@pytest.mark.parametrize("actor_index", [0, 1, 2])
@pytest.mark.parametrize("section", ["shares", "contributions"])
def test_space_budget_reads_preserve_private_details_and_never_write(client, app, actor_index, section):
    owner, organizer, member, space_id, event = gathering(client, app)
    people = (owner, organizer, member)
    planned(client, organizer, event["id"], categories=[{"name": "Trip", "estimate_minor": 800_000}])
    for person, amount in zip(people, (400_000, 250_000, 150_000)):
        assert spend(client, person, event["id"], amount).status_code == 201
        assert give(client, person, event["id"], amount, note=f"Private contribution {amount}").status_code == 201
    current = budget(client, organizer, event["id"]).json()["data"]
    saved = split(client, organizer, event["id"], current["etag"], base="recorded", people=ids(*people))
    assert saved.status_code == 200, saved.text
    before = budget(client, organizer, event["id"]).json()["data"]
    actor = people[actor_index]
    allowed = budget(client, actor, event["id"]).json()["data"]
    model = install(app, script(call("get_event_budget", event_id=event["id"], section=section),
                                say("These are recorded amounts and planned shares, not verified payments or debts.")))
    key = str(uuid4())
    run = ask(client, actor, space_id, "Show the trip budget " + section, key=key)
    assert run["status"] == "completed" and run["approval"] is None, run
    result = tool_results(model.calls[-1][0])[0]["result"]
    expected = allowed["split"]["shares"] if section == "shares" else allowed["contributions"]
    expected = [{name: value for name, value in row.items() if name != "can_change"} for row in expected]
    assert result["items"] == expected
    assert result["recorded_minor"] == 800_000 and result["split"]["allocated_minor"] == 800_000
    assert result["split"]["rounding_count"] == 2 and result["split"]["difference_minor"] == 0
    assert result["split"]["all_shares"] is (actor_index != 2)
    assert result["all_contributions"] is (actor_index != 2)
    if actor_index == 2:
        assert len(result["items"]) == 1 and result["items"][0]["mine"] is True
        assert "Private contribution 400000" not in json.dumps(model.calls)
        assert "Private contribution 250000" not in json.dumps(model.calls)
    assert [(item["tool_name"], item["effect"]) for item in run["tool_calls"]] == [("events.budget.read", "read")]
    assert count(app, AgentApproval) == 0
    assert budget(client, organizer, event["id"]).json()["data"] == before
    again = ask(client, actor, space_id, "Show the trip budget " + section, key=key)
    assert again["id"] == run["id"] and len(model.calls) == 2


@pytest.mark.parametrize("scope", ["main", "other_space", "later_member"])
@pytest.mark.parametrize("tool_name", ["get_event_budget", "set_event_split"])
def test_space_budget_reads_cannot_escape_agent_or_admission_scope(client, app, scope, tool_name, monkeypatch):
    from app.modules.events.budgets import BudgetService

    owner, organizer, member, space_id, event = gathering(client, app)
    planned(client, organizer, event["id"])
    actor, target_space = owner, space_id
    if scope == "main":
        target_space = None
    elif scope == "other_space":
        target_space = create_space(client, owner).json()["data"]["id"]
    else:
        actor = account(client, app, "later-budget-member@example.test")
        admit(client, owner, space_id, actor)

    def forbidden_read(*arguments):
        pytest.fail("An out-of-scope request reached the budget service.")

    monkeypatch.setattr(BudgetService, "read", forbidden_read)
    arguments = {"section": "contributions"} if tool_name == "get_event_budget" else {
        "split": {"method": "equal", "base": "recorded", "people": ids(owner, organizer, member)},
    }
    model = install(app, script(call(tool_name, event_id=event["id"], **arguments),
                                say("That budget is not available here.")))
    run = ask(client, actor, target_space, "Read that event budget")
    assert run["status"] == "completed" and run["approval"] is None, run
    assert "error" in tool_results(model.calls[-1][0])[0]
    assert run["evidence"] == [] and count(app, AgentApproval) == 0
    if scope == "main":
        assert all(tool_name not in tools for _messages, tools in model.calls)


def test_space_budget_reads_unconfigured_budget_without_inventing_currency(client, app):
    owner, _organizer, _member, space_id, event = gathering(client, app)
    model = install(app, script(call("get_event_budget", event_id=event["id"]), say("No budget has been set.")))
    run = ask(client, owner, space_id, "What is our event budget?")
    assert run["status"] == "completed" and run["approval"] is None, run
    result = tool_results(model.calls[-1][0])[0]["result"]
    assert result["currency"] is None and result["split"] is None
    assert result["recorded_minor"] == 0 and result["items"] == [] and result["more"] is False


@pytest.fixture
def space_budget_split(client, app):
    owner, organizer, member, space_id, event = gathering(client, app)
    planned(client, organizer, event["id"], categories=[{"name": "Trip", "estimate_minor": 900_000}])
    for person, amount in zip((owner, organizer, member), (400_000, 250_000, 150_000)):
        assert spend(client, person, event["id"], amount).status_code == 201
    body = {"method": "equal", "base": "recorded", "people": ids(owner, organizer, member)}
    return owner, organizer, member, space_id, event, body


@pytest.mark.parametrize("automatic", [False, True])
@pytest.mark.parametrize("method,base,values,expected", [
    ("equal", "recorded", None, [266_667, 266_667, 266_666]),
    ("equal", "planned", None, [300_000, 300_000, 300_000]),
    ("percentages", "recorded", [5000, 3125, 1875], [400_000, 250_000, 150_000]),
    ("amounts", "recorded", [400_000, 250_000, 100_000], [400_000, 250_000, 100_000]),
])
def test_space_budget_split_exact_review_approval_and_retry_never_move_money(
    client, app, space_budget_split, automatic, method, base, values, expected,
):
    owner, organizer, member, space_id, event, body = space_budget_split
    body.update(method=method, base=base)
    if values is not None:
        for person, value in zip(body["people"], values):
            person["value"] = value
    before = budget(client, organizer, event["id"]).json()["data"]
    model = install(app, script(call("set_event_split", event_id=event["id"], split=body),
                                say("Saved the reviewed split plan. No money was moved.")))
    response = client.post("/v1/agent-runs", headers={**auth(organizer), "Idempotency-Key": str(uuid4())},
                           json={"space_id": space_id, "message": "Save this cost-sharing plan", "auto_approve": automatic})
    assert response.status_code == 201, response.text
    run = response.json()["data"]
    assert run["status"] == "waiting_for_approval" and run["approval"]["status"] == "pending"
    assert run["approval"]["tool_name"] == "events.budget.split"
    assert fields(run)["Total"] == ("INR 9000.00" if base == "planned" else "INR 8000.00")
    for amount in expected:
        assert f"INR {amount // 100}.{amount % 100:02d}" in fields(run)["Shares"]
    assert len(fields(run)["Shares"].splitlines()) == len(expected)
    assert fields(run)["Unallocated"] == ("INR 500.00" if method == "amounts" else "INR 0.00")
    assert budget(client, organizer, event["id"]).json()["data"] == before
    assert outbox(app, "event.budget.split.updated") == 0
    key = str(uuid4())
    approved = approve(client, organizer, run, key=key)
    assert approved.status_code == 200, approved.text
    done = approved.json()["data"]
    assert done["status"] == "completed" and done["approval"]["status"] == "approved", done
    assert done["approval"]["reason"] is None
    assert tool_results(model.calls[-1][0])[-1]["result"]["money_moved"] is False
    after = budget(client, organizer, event["id"]).json()["data"]
    assert [share["share_minor"] for share in after["split"]["shares"]] == expected
    assert after["expenses"] == before["expenses"] and after["contributions"] == before["contributions"]
    assert after["given_minor"] == before["given_minor"] and after["promised_minor"] == before["promised_minor"]
    assert outbox(app, "event.budget.split.updated") == 1
    replay = approve(client, organizer, run, key=key)
    assert replay.status_code == 200 and replay.json()["data"] == done
    assert outbox(app, "event.budget.split.updated") == 1 and len(model.calls) == 2


@pytest.mark.parametrize("change", ["expense", "participant", "cancelled"])
def test_space_budget_split_refuses_changed_review_basis(client, app, space_budget_split, change):
    owner, organizer, member, space_id, event, body = space_budget_split
    model = install(app, script(call("set_event_split", event_id=event["id"], split=body),
                                say("The reviewed plan is no longer current. No split was saved.")))
    run = ask(client, organizer, space_id, "Split this trip equally")
    assert run["status"] == "waiting_for_approval", run
    before = budget(client, organizer, event["id"]).json()["data"]
    if change == "expense":
        assert spend(client, member, event["id"], 1).status_code == 201
        assert budget(client, organizer, event["id"]).json()["data"]["etag"] == before["etag"]
    elif change == "participant":
        reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
        removed = client.post(f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove", json={},
                              headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]})
        assert removed.status_code == 200, removed.text
    else:
        cancelled = client.post(f"/v1/events/{event['id']}/cancel", headers={**auth(organizer), "If-Match": event["etag"]}, json={})
        assert cancelled.status_code == 200, cancelled.text
    current = budget(client, organizer, event["id"]).json()["data"]
    response = approve(client, organizer, run)
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["approval"]["status"] == "cancelled"
    assert "error" in tool_results(model.calls[-1][0])[-1]
    assert budget(client, organizer, event["id"]).json()["data"] == current
    assert outbox(app, "event.budget.split.updated") == 0


def test_space_budget_split_rollback_keeps_plan_and_approval_atomic(client, app, space_budget_split, monkeypatch):
    _owner, organizer, _member, space_id, event, body = space_budget_split
    install(app, script(call("set_event_split", event_id=event["id"], split=body), say("Saved the reviewed split.")))
    run = ask(client, organizer, space_id, "Save the split plan")
    assert run["status"] == "waiting_for_approval", run
    before = budget(client, organizer, event["id"]).json()["data"]
    apply = app.state.agents.apply

    def interrupted(*arguments, **options):
        assert apply(*arguments, **options) is True
        raise DomainError(503, "SYNTHETIC_FAILURE", "Synthetic approval transaction failure.")

    monkeypatch.setattr(app.state.agents, "apply", interrupted)
    failed = approve(client, organizer, run)
    assert failed.status_code == 503, failed.text
    assert budget(client, organizer, event["id"]).json()["data"] == before
    assert outbox(app, "event.budget.split.updated") == 0
    with app.state.sessions() as database:
        assert database.get(AgentApproval, run["approval"]["id"]).status == "pending"
    monkeypatch.setattr(app.state.agents, "apply", apply)
    succeeded = approve(client, organizer, run)
    assert succeeded.status_code == 200 and succeeded.json()["data"]["approval"]["status"] == "approved"
    assert outbox(app, "event.budget.split.updated") == 1


def test_space_budget_split_rejection_and_member_denial_leave_budget_unchanged(client, app, space_budget_split):
    _owner, organizer, member, space_id, event, body = space_budget_split
    before = budget(client, organizer, event["id"]).json()["data"]
    model = install(app, script(call("set_event_split", event_id=event["id"], split=body), say("You cannot manage this budget.")))
    refused = ask(client, member, space_id, "Change this split")
    assert refused["status"] == "completed" and refused["approval"] is None
    assert "error" in tool_results(model.calls[-1][0])[0] and count(app, AgentApproval) == 0
    install(app, script(call("set_event_split", event_id=event["id"], split=body), say("The split was not saved.")))
    waiting = ask(client, organizer, space_id, "Change this split")
    rejected = reject(client, organizer, waiting)
    assert rejected.status_code == 200 and rejected.json()["data"]["approval"]["status"] == "rejected"
    assert budget(client, organizer, event["id"]).json()["data"] == before
    assert outbox(app, "event.budget.split.updated") == 0


@pytest.mark.parametrize("output_format", ["markdown", "html", "json"])
def test_fetch_preview_maps_results_by_url_and_forwards_only_documented_options(output_format):
    first, second = "https://news.example.org/first", "https://news.example.org/second"
    request_body = CreateWebFetch(urls=[first, second], format=output_format, ttl=None, links=True, image_links=True,
                                 include_selectors=["article"], exclude_selectors=["nav"])
    text = {"type": "document", "children": [{"type": "paragraph", "text": "Saved content"}]} if output_format == "json" else "<b>Saved content</b>"

    def endpoint(request):
        assert json.loads(request.content) == {"urls": [first, second], "format": output_format, "links": True,
                                              "image_links": True, "include_selectors": ["article"], "exclude_selectors": ["nav"], "per_url_timeout_ms": 8000}
        return httpx.Response(200, json={"results": [{"url": second, "title": "Second", "format": output_format, "text": text,
                                                       "links": [first, "javascript:alert(1)"], "image_links": ["https://images.example.org/image.png"],
                                                       "published_date": "2026-10-06", "unmatched_selectors": ["invented"]}],
                                       "errors": [{"url": first, "error": "selector_not_matched"}]})

    result = WebLookup("synthetic-key", transport=httpx.MockTransport(endpoint)).fetch_pages(request_body)
    pages = [WebFetchPage(**item) for item in result.details]
    assert [page.url for page in pages] == [first, second]
    assert pages[0].error == "selector_not_matched" and pages[0].text is None
    assert pages[1].error is None and pages[1].published_date == "2026-10-06"
    assert pages[1].links == [first] and pages[1].links_partial is True
    assert pages[1].image_links == ["https://images.example.org/image.png"] and pages[1].unmatched_selectors == []
    assert json.loads(pages[1].text) == text if output_format == "json" else pages[1].text == text


@pytest.mark.parametrize("changes", [
    {"urls": []}, {"urls": ["https://news.example.org/a"] * 2},
    {"urls": [f"https://news.example.org/{index}" for index in range(11)]},
    {"urls": ["http://127.0.0.1/private"]}, {"urls": ["https://user:secret@news.example.org/a"]},
    {"urls": ["https://news.example.org/a b"]}, {"urls": ["https://news.example.org/a\nb"]},
    {"format": "text"}, {"ttl": -1}, {"ttl": False}, {"include_selectors": ["article"] * 21},
    {"include_selectors": [" "]}, {"exclude_selectors": ["nav\u0000"]}, {"links": "true"},
])
def test_fetch_preview_rejects_unsafe_or_unsupported_options(changes):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        CreateWebFetch.model_validate({"urls": ["https://news.example.org/a"], **changes})


@pytest.mark.parametrize("output_format", ["markdown", "html", "json"])
def test_web_extraction_runs_as_an_agent_chat_tool_and_keeps_sources(client, app, output_format):
    person = account(client, app)
    links = ["https://news.example.org/first", "https://news.example.org/second"]
    requested = []
    options = {"format": output_format, "ttl": 3600, "links": True, "include_selectors": ["main"], "exclude_selectors": ["nav"]}

    def endpoint(request):
        body = json.loads(request.content)
        requested.append(body)
        assert body == {**options, "image_links": False, "urls": [links[len(requested) - 1]], "per_url_timeout_ms": 8000}
        text = {"type": "document", "children": [{"type": "paragraph", "text": "Service starts October 9."}]} if output_format == "json" else "Service starts October 9."
        return httpx.Response(200, json={"results": [{"url": body["urls"][0], "format": output_format, "text": text,
                                                       "title": "Transit report", "author": "Transit desk", "published_date": "2026-10-06",
                                                       "links": ["https://news.example.org/background"]}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=2, transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=links[0], options=options),
                                call("read_web_page", url=links[1], options=options),
                                say("Both reports give October 9 as the expected service start; independent confirmation is still missing.")))
    key = str(uuid4())
    message = "Read these links and compare their main content: " + " ".join(links)
    run = ask(client, person, None, message, key=key)
    assert run["status"] == "completed" and run["intent"] == "chat", run
    assert run["approval"] is None and count(app, AgentRun) == 1 and count(app, AgentMemory) == 0
    assert [item["tool_name"] for item in run["tool_calls"]] == ["web.read", "web.read"]
    assert {source["url"] for source in run["sources"] if source["read"]} == set(links)
    results = tool_results(model.calls[-1][0])
    assert all("Service starts October 9" in item["result"]["text"] for item in results)
    assert all(item["result"]["published_date"] == "2026-10-06" for item in results)
    assert all(item["result"]["cache_preference_seconds"] == 3600 for item in results)
    assert all(item["result"]["links"] == ["https://news.example.org/background"] for item in results)
    preview = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(person))
    assert preview.status_code == 200 and len(preview.json()["data"]["sources"]) == 2
    again = ask(client, person, None, message, key=key)
    assert again["id"] == run["id"] and len(requested) == 2 and len(model.calls) == 3


def test_web_extraction_selector_failure_is_reported_in_chat_without_silent_full_page_retry(client, app):
    person = account(client, app)
    requested = []
    link = "https://news.example.org/report"

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [], "errors": [{"url": link, "error": "selector_not_matched"}]})

    app.state.agents.web = WebLookup("synthetic-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=link, options={"include_selectors": ["article"]}),
                                say("That page has no matching article section, so I could not read the requested content.")))
    run = ask(client, person, None, "Read only the article on this page: " + link)
    assert run["status"] == "completed" and len(requested) == 1 and run["sources"] == []
    assert "selector_not_matched" in tool_results(model.calls[-1][0])[0]["error"]
    assert run["tool_calls"][0]["status"] == "failed"


def test_web_extraction_respects_the_chat_quota_without_a_separate_fetch_endpoint(client, app):
    person = account(client, app)
    requested = []
    link = "https://news.example.org/report"

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"url": link, "title": "Fetched page", "text": "Saved public page text."}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1, transport=httpx.MockTransport(endpoint))
    install(app, script(call("read_web_page", url=link, options={}), say("Here is the report's information.")))
    first = ask(client, person, None, "Read this page: " + link)
    assert first["status"] == "completed"
    model = install(app, script(call("read_web_page", url=link, options={}), say("The daily web limit has been reached.")))
    exhausted = ask(client, person, None, "Read that report again")
    assert exhausted["status"] == "completed" and len(requested) == 1
    assert "limit" in tool_results(model.calls[-1][0])[0]["error"]
    assert exhausted["tool_calls"][0]["error_code"] == "web_limit"
    assert client.post("/v1/agent-web-fetches", headers={**auth(person), "Idempotency-Key": str(uuid4())}, json={"urls": [link]}).status_code == 404
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, first["id"])
        assert recorded.state["web_reserved"] == 0


def test_web_extraction_queued_chat_cancel_never_fetches(client, app, monkeypatch):
    person = account(client, app)
    model = install(app, script(call("read_web_page", url="https://news.example.org/report", options={})))
    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1)
    submit = app.state.agents.submit
    monkeypatch.setattr(app.state.agents, "submit", lambda run_id, token: None)
    first = ask(client, person, None, "Read this report: https://news.example.org/report")
    assert first["status"] == "queued"
    run_id = first["id"]
    cancelled = client.post(f"/v1/agent-runs/{run_id}/cancel", headers=auth(person), json={})
    assert cancelled.status_code == 200 and cancelled.json()["data"]["status"] == "cancelled"
    submit(run_id, auth(person)["Authorization"].removeprefix("Bearer "))
    assert model.calls == []
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, run_id)
        assert app.state.agents.web_usage(database, recorded.account_id) == 0


def test_web_extraction_running_chat_cancel_drops_late_content_without_refunding_attempts(client, app):
    person = account(client, app)
    link = "https://news.example.org/report"
    model = install(app, script(call("read_web_page", url=link, options={})))

    def endpoint(request):
        with app.state.sessions() as database:
            run_id = database.scalar(select(AgentRun.id).where(AgentRun.status == "running"))
        response = client.post(f"/v1/agent-runs/{run_id}/cancel", headers=auth(person), json={})
        assert response.status_code == 200
        return httpx.Response(200, json={"results": [{"url": link, "text": "Late text must be discarded."}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1, transport=httpx.MockTransport(endpoint))
    result = ask(client, person, None, "Read this report: " + link)
    assert result["status"] == "cancelled" and result["sources"] == [] and len(model.calls) == 1
    with app.state.sessions() as database:
        run = database.get(AgentRun, result["id"])
        assert app.state.agents.web_usage(database, run.account_id) == 1
        assert "Late text" not in json.dumps(run.state)


@pytest.mark.parametrize("helper", [False, True])
@pytest.mark.parametrize("change, status, reason", [
    ("session", "failed", "session_ended"),
    ("switch", "cancelled", "agent_off"),
    ("membership", "failed", "not_found"),
    ("cancel", "cancelled", "cancelled"),
])
def test_late_tool_results_are_discarded_when_access_ends(client, app, monkeypatch, helper, change, status, reason):
    owner, space_id = solo(client, app)
    person = owner
    if change == "membership":
        person = account(client, app, "late-tool-member@example.test")
        admit(client, owner, space_id, person)
    link = "https://news.example.org/late-report"
    late_text = "Late tool content must not be retained."
    turns = [call("read_web_page", url=link), say("The report is ready.")]
    if helper:
        turns.insert(0, call("research", task="Read the report"))
    model = install(app, script(*turns))
    monkeypatch.setattr(app.state.agents, "submit", lambda run_id, token: None)
    queued = ask(client, person, space_id, "Read this report: " + link)
    requests = []

    def endpoint(request):
        requests.append(request)
        if change == "cancel":
            response = client.post(f"/v1/agent-runs/{queued['id']}/cancel", headers=auth(person), json={})
            assert response.status_code == 200, response.text
        elif change == "membership":
            roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
            entry = next(member for member in roster if member["account_id"] == person["user"]["id"])
            response = client.post(
                f"/v1/spaces/{space_id}/members/{person['user']['id']}/remove", json={},
                headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": entry["etag"]},
            )
            assert response.status_code == 200, response.text
        else:
            with app.state.sessions.begin() as database:
                run = database.get(AgentRun, queued["id"])
                if change == "session":
                    database.get(AccountSession, run.session_id).revoked_at = app.state.clock()
                else:
                    database.get(Space, space_id).agent_enabled = False
        return httpx.Response(200, json={"results": [{"url": link, "title": "Late report", "text": late_text}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1, transport=httpx.MockTransport(endpoint))
    app.state.agents.runtime.advance(queued["id"], auth(person)["Authorization"].removeprefix("Bearer "))
    with app.state.sessions() as database:
        run = database.get(AgentRun, queued["id"])
        assert (run.status, run.stop_reason) == (status, reason)
        assert late_text not in json.dumps(run.state) and late_text not in (run.answer or "")
        assert not run.state.get("web_sources")
        assert app.state.agents.web_usage(database, run.account_id) == 1
    assert len(requests) == 1 and len(model.calls) == (2 if helper else 1)
    assert count(app, AgentApproval) == 0 and count(app, Task) == 0


@pytest.mark.parametrize("output_format", ["markdown", "html", "json"])
def test_fetch_preview_bounds_content_and_never_truncates_json_into_invalid_text(output_format):
    link = "https://news.example.org/report"
    text = {"text": "x" * (PREVIEW_TEXT + 1)} if output_format == "json" else "x" * (PREVIEW_TEXT + 1)
    lookup = WebLookup("synthetic-key", transport=httpx.MockTransport(lambda request: httpx.Response(200, json={
        "results": [{"url": link, "format": output_format, "text": text,
                     "links": [f"https://news.example.org/{index}" for index in range(40)]}],
    })))
    page = WebFetchPage(**lookup.fetch_pages(CreateWebFetch(urls=[link], format=output_format, links=True)).details[0])
    if output_format == "json":
        assert page.error == "content_too_large" and page.text is None
    else:
        assert len(page.text) == PREVIEW_TEXT and page.partial is True
        assert len(page.links) == 25 and page.links_partial is True


def test_web_search_reads_sources_before_answering_and_counts_every_fetch(client, app):
    person = account(client, app)
    requested = []
    sources = [
        {"title": "Everyday cooking", "snippet": "Short search snippet.", "url": "https://cooking.example.org/everyday"},
        {"title": "Balanced meals", "snippet": "Another snippet.", "url": "https://cooking.example.org/balanced"},
    ]

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            assert str(request.url).startswith(SEARCH_URL)
            return httpx.Response(200, json={"results": sources})
        assert str(request.url) == FETCH_URL
        link = json.loads(request.content)["urls"][0]
        return httpx.Response(200, json={"results": [{"title": "Read cooking article", "text": f"Full article for {link}: combine vegetables, beans and whole grains."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", daily_limit=3, transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("web_search", query="healthy cooking"), say("Combine vegetables, beans and whole grains.")))
    run = ask(client, person, None, "Find useful healthy cooking information")
    assert run["status"] == "completed", run
    assert len(requested) == 3, "A search must read up to two sources before the model answers"
    assert [item["tool_name"] for item in run["tool_calls"]] == ["web.search", "web.read", "web.read"]
    observed = json.dumps(tool_results(model.calls[-1][0]))
    assert "Full article" in observed and "combine vegetables" in observed
    assert all(source["read"] for source in run["sources"])
    assert {source["url"] for source in run["sources"]} == {item["url"] for item in sources}
    assert run["approval"] is None and count(app, Task) == 0 and count(app, AgentMemory) == 0
    install(app, script(call("web_search", query="another cooking search"), say("The lookup limit was reached.")))
    refused = ask(client, person, None, "Find more cooking information")
    assert refused["status"] == "completed" and len(requested) == 3
    assert any(item["error_code"] == "web_limit" for item in refused["tool_calls"])


@pytest.mark.parametrize("in_space", [False, True])
def test_web_source_preview_is_private_and_does_not_fetch_or_call_the_model(client, app, in_space):
    person = account(client, app)
    space_id = create_space(client, person).json()["data"]["id"] if in_space else None
    link = "https://news.example.org/correction"
    marker = "The correction changes the opening date from October 6 to October 9."
    original = "Transit report\n\n" + marker
    requested = []

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"title": "Transit correction", "text": original}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=link), say("The opening date was corrected.")))
    run = ask(client, person, space_id, "Read the transit correction")
    assert run["status"] == "completed"
    assert marker not in json.dumps(run)
    calls_before = len(model.calls)
    app.state.agents.web = None
    app.state.agents.model = None
    preview = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(person))
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["run_id"] == run["id"]
    assert body["sources"] == [{"source": run["sources"][0], "text": original, "offset": 0, "partial": False}]
    assert len(requested) == 1 and len(model.calls) == calls_before
    other = account(client, app, "other-source-viewer@example.test")
    refused = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(other))
    assert refused.status_code == 404 and marker not in refused.text
    assert client.get(f"/v1/agent-runs/{run['id']}/web-text").status_code == 401
    assert len(requested) == 1 and len(model.calls) == calls_before
    if in_space:
        with app.state.sessions.begin() as database:
            database.get(AgentRun, run["id"]).admission_id = str(uuid4())
        outdated = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(person))
        assert outdated.status_code == 404 and marker not in outdated.text


@pytest.mark.parametrize("kind", ["assistant", "unpaired", "search", "mismatched", "trimmed", "oversized", "legacy"])
def test_web_source_preview_uses_only_matching_bounded_read_results(kind):
    link = "https://news.example.org/report"
    source = {"title": "Report", "url": link, "read": True, "video_id": None}
    reading = call("web_search", query="news") if kind == "search" else call("read_web_page", url=link)
    text = "Retained source text. " * (200 if kind == "oversized" else 1)
    messages = [reading.message()]
    result = {"result": {"url": "https://news.example.org/other" if kind == "mismatched" else link, "text": text}}
    if kind == "trimmed":
        result = {"partial": json.dumps(result)}
    if kind == "assistant":
        messages = [{"role": "assistant", "content": json.dumps(result)}]
    else:
        messages.append({"role": "tool", "tool_call_id": "unpaired" if kind == "unpaired" else reading.tool_calls[0].id,
                         "content": json.dumps(result)})
    state = {"web_sources": [source], "messages": messages}
    before = json.dumps(state)
    preview = stored_web_text(state)
    assert json.dumps(state) == before
    if kind in ("oversized", "legacy"):
        assert preview == [{"source": {**source, "retrieved_at": None}, "text": text[:PAGE_CHUNK], "offset": None, "partial": True}]
    else:
        assert preview == []


@pytest.mark.parametrize("period", [{"recency_minutes": 1440}, {"after_date": "2026-09-01", "before_date": "2026-09-19"}])
def test_news_search_sends_real_filters_and_retains_publisher_and_date(client, app, period):
    person = account(client, app)
    link = "https://news.example.org/transit"
    requested = []

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            assert dict(request.url.params) == {"query": "transit updates", "domain_type": "news", "location": "IN", "language": "en",
                                                **{name: str(value) for name, value in period.items()}}
            return httpx.Response(200, json={"results": [
                {"title": "Transit update", "snippet": "An update.", "url": link, "date": "2026-09-18", "publisher": "Transit News"},
                {"title": "Undated report", "snippet": "No date was supplied.", "url": "https://news.example.org/undated"},
            ]})
        return httpx.Response(200, json={"results": [{"title": "Read report", "text": "The report discusses transit service changes."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("web_search", query="transit updates", domain_type="news", location="IN", language="en", **period),
                                say("One report is dated September 18; the other has no reported date.")))
    run = ask(client, person, None, "Find recent transit news for India")
    assert run["status"] == "completed", run
    search = tool_results(model.calls[-1][0])[0]["result"]
    assert search["results"][0]["publisher"] == "Transit News"
    assert search["results"][0]["published_date"] == "2026-09-18"
    assert search["results"][1]["published_date"] is None
    assert search["results"][1]["publisher"] is None
    assert search["filters"] == {"domain_type": "news", "location": "IN", "language": "en", **period}
    assert len(requested) == 3 and run["approval"] is None


@pytest.mark.parametrize("filters", [
    {"recency_minutes": 0}, {"recency_minutes": True}, {"recency_minutes": 5256001},
    {"recency_minutes": 60, "after_date": "2026-09-01"},
    {"after_date": "2026-09-19", "before_date": "2026-09-01"},
    {"after_date": "2026-02-30"}, {"domain_type": "unsupported"}, {"location": "India"},
])
def test_news_search_invalid_filters_make_no_provider_request(client, app, filters):
    person = account(client, app)

    def unexpected(request):
        raise AssertionError("Invalid search filters must not reach the provider")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(unexpected))
    model = install(app, script(call("web_search", query="news", **filters), say("The search options need correction.")))
    run = ask(client, person, None, "Search current news")
    assert run["status"] == "completed" and run["tool_calls"] == []
    assert "Invalid arguments" in tool_results(model.calls[-1][0])[0]["error"]


def test_parallel_web_searches_keep_every_tool_batch_together_for_the_model(client, app):
    person = account(client, app)
    requested = []

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            query = request.url.params["query"]
            return httpx.Response(200, json={"results": [{"title": query, "snippet": "Report.", "url": f"https://news.example.org/{query}"}]})
        return httpx.Response(200, json={"results": [{"title": "Transit report", "text": "Service starts on October 9; independent confirmation is unavailable."}]})

    def brain(messages, tools):
        if not tool_results(messages):
            return ModelTurn(content=None, tool_calls=(call("web_search", query="primary").tool_calls[0],
                                                      call("web_search", query="independent").tool_calls[0]))
        pending = set()
        for message in messages:
            if message["role"] == "tool":
                assert message["tool_call_id"] in pending
                pending.remove(message["tool_call_id"])
            else:
                assert not pending, "All results in a model tool batch must precede the next non-tool message"
                if message["role"] == "assistant":
                    pending.update(item["id"] for item in message.get("tool_calls") or [])
        assert not pending and len(tool_results(messages)) == 4
        return say("The two reports identify October 9 as the expected service start.")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, brain)
    run = ask(client, person, None, "Read primary and independent news sources")
    assert run["status"] == "completed", run
    assert len(requested) == 4 and len(run["tool_calls"]) == 4
    assert len(run["sources"]) == 2 and all(source["read"] for source in run["sources"])
    assert run["approval"] is None


@pytest.mark.parametrize("changed", [False, True])
def test_news_article_sections_are_complete_or_report_a_changed_version(client, app, changed):
    person = account(client, app)
    link = "https://news.example.org/transit-update"
    article = "# Transit update\n\n" + ('The report says "testing continues", not "service started".\n' * 95) + "\nCorrection: service starts on October 9, not October 6."
    requested, sections = [], []

    def endpoint(request):
        payload = json.loads(request.content)
        assert payload == {"urls": [link], "format": "markdown", "ttl": 0}
        requested.append(request)
        text = article + "\nA new update." if changed and len(requested) > 1 else article
        return httpx.Response(200, json={"results": [{"title": "Transit update", "text": text}]})

    def brain(messages, tools):
        results = tool_results(messages)
        if not results:
            return call("read_web_page", url=link)
        result = results[-1]
        if "error" in result:
            assert changed and "changed" in result["error"]
            return say("The article changed during reading; its sections cannot be combined.")
        result = result["result"]
        assert "retrieved_at" in result and "publication time" in result["note"]
        assert result["content_limited"] is False
        assert result["offset"] == sum(len(section) for section in sections)
        assert len(messages[-1]["content"]) <= 4000
        sections.append(result["text"])
        if result["next_offset"] is not None:
            return call("read_web_page", url=link, offset=result["next_offset"], content_version=result["content_version"])
        assert "".join(sections) == page_text(article)
        return say("The correction says service starts on October 9, not October 6.")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, brain)
    run = ask(client, person, None, "Read the complete transit news report and include the correction")
    assert run["status"] == "completed", run
    assert len(requested) > 1
    assert "\n\n" in sections[0]
    assert ("changed" in run["answer"]) is changed
    assert run["approval"] is None and count(app, Task) == 0 and count(app, AgentMemory) == 0


@pytest.mark.parametrize("single_line", [False, True])
def test_news_article_limit_and_invalid_continuation_are_explicit(client, app, single_line):
    person = account(client, app)
    link = "https://news.example.org/long-report"
    requested = []

    def endpoint(request):
        requested.append(request)
        text = "Opening. " + "word " * LONGEST_PAGE if single_line else "Paragraph.\n\n" * LONGEST_PAGE
        return httpx.Response(200, json={"results": [{"title": "Long report", "text": text}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=link, offset=100), call("read_web_page", url=link), say("Only part of this report was available within the reading limit.")))
    run = ask(client, person, None, "Read this long news report")
    results = tool_results(model.calls[-1][0])
    assert "content_version" in results[0]["error"]
    assert results[1]["result"]["content_limited"] is True
    assert results[1]["result"]["available_characters"] == LONGEST_PAGE
    assert results[1]["result"]["next_offset"] is not None
    assert len(requested) == 1 and run["status"] == "completed"


def test_article_changes_ignore_layout_noise_but_keep_corrections():
    first = "Transit update\n\nService starts October 6.\nStatus: testing."
    reordered = "Status:  testing.\nTransit update\nService starts October 6.\nTransit update"
    assert article_changes(first, reordered)["status"] == "unchanged"
    changed = article_changes(first, first.replace("October 6", "October 9"))
    assert changed["status"] == "changed"
    assert changed["added"] == ["Service starts October 9."]
    assert changed["removed"] == ["Service starts October 6."]


@pytest.mark.parametrize("other_account", [False, True])
def test_news_comparison_uses_only_the_same_persons_complete_read(client, app, other_account):
    person = account(client, app)
    link = "https://news.example.org/transit-update"
    current = ["Transit update\n\nService starts October 6."]
    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"results": [{"title": "Transit update", "text": current[0]}]})))
    install(app, script(call("read_web_page", url=link), say("Service starts October 6.")))
    first = ask(client, person, None, "Read the transit report")
    assert first["status"] == "completed"
    current[0] = "Transit update\n\nService starts October 9."
    reader = account(client, app, "different-news-reader@example.test") if other_account else person
    model = install(app, script(call("read_web_page", url=link, compare_previous=True), say("The comparison is available above.")))
    run = ask(client, reader, None, "What changed in the transit report since I last read it?")
    assert run["status"] == "completed", run
    changes = tool_results(model.calls[-1][0])[-1]["result"]["changes"]
    assert changes["status"] == ("unavailable" if other_account else "changed")
    if other_account:
        assert "October 6" not in json.dumps(changes)
    else:
        assert changes["added"] == ["Service starts October 9."]
        assert changes["removed"] == ["Service starts October 6."]
        assert changes["compared_with"] == first["finished_at"].replace("Z", "+00:00")
    assert run["approval"] is None and count(app, AgentMemory) == 0


def test_web_followup_keeps_source_references_outside_the_short_answer(client, app):
    person = account(client, app)
    link = "https://cooking.example.org/the-selected-article"

    def endpoint(request):
        if request.method == "GET":
            return httpx.Response(200, json={"results": [{"title": "Selected cooking guide", "snippet": "Cooking guide.", "url": link}]})
        return httpx.Response(200, json={"results": [{"title": "Selected cooking guide", "text": "A source about ordinary cooking habits."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    offered = "Would you like me to explain the first source in more detail?"
    install(app, script(call("web_search", query="cooking guide"), say("A useful cooking summary. " * 35 + offered)))
    previous = ask(client, person, None, "Find a useful cooking guide")
    assert previous["status"] == "completed"
    with app.state.sessions.begin() as database:
        saved = database.get(AgentRun, previous["id"])
        saved.state = {name: value for name, value in saved.state.items() if name != "web_sources"}
    recovered = client.get(f"/v1/agent-runs/{previous['id']}", headers=auth(person)).json()["data"]
    assert recovered["sources"][0]["url"] == link
    model = install(app, script(say("I can continue from the selected guide.")))
    followup = ask(client, person, None, "yes do it")
    assert followup["status"] == "completed"
    history = model.calls[0][0]
    assert link in json.dumps(history), "Follow-up context must retain actual sources even when the earlier answer is shortened"
    assert offered in json.dumps(history), "A short confirmation needs the previous question, not just the beginning of its answer"
    assert all(link not in str(message["content"]) for message in history if message["role"] == "system")


@pytest.mark.parametrize("closing, repeated", [
    ("Would you like me to explain the first source (the guide) in more detail, with a concrete action plan?", True),
    ("Would you like me to explain the second source in more detail?", False),
    ("Would you like me to summarize the first source in more detail?", False),
    ("Would you like me to explain the first source in more detail in Telugu?", False),
])
def test_reading_offer_paraphrases_keep_the_same_action_and_source_boundary(closing, repeated):
    previous = "Would you like me to explain the first source\u2014the detailed guide\u2014more deeply, with practical examples and a quick action plan?"
    summary = "The guide recommends preparing vegetables ahead and choosing whole grains for everyday meals."
    answer = summary + "\n\n" + closing
    assert completed_reading_answer("yes do it", answer, previous) == (summary if repeated else answer)
    assert completed_reading_answer("Tell me something else", answer, previous) == answer


@pytest.mark.parametrize("repeated", [True, False])
@pytest.mark.parametrize("titled", [True, False])
def test_completed_web_followup_does_not_repeat_an_accepted_reading_offer(client, app, repeated, titled):
    person = account(client, app)
    link = "https://cooking.example.org/guide"
    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"results": [{"title": "Cooking guide", "text": "Combine vegetables and whole grains for everyday meals."}]}),
    ))
    title = " (Cooking guide from Example)" if titled else ""
    offered = f"Would you like me to explain the first source{title} in more detail?"
    install(app, script(call("read_web_page", url=link), say("The guide discusses everyday meals.\n\n" + offered)))
    first = ask(client, person, None, "Read this cooking guide and offer to explain it")
    assert first["answer"].endswith(offered)
    summary = "The guide recommends combining vegetables and whole grains, and preparing ingredients ahead for simple meals."
    title = " (Cooking guide)" if titled else ""
    closing = (f"Would you like me to explain the first source{title} in more detail? If yes, I can explain its practical steps."
               if repeated else "Which ingredients do you have available?")
    install(app, script(call("read_web_page", url=link), say(summary + "\n\n" + closing)))
    followup = ask(client, person, None, "yes do it")
    assert followup["status"] == "completed" and followup["approval"] is None
    assert followup["answer"] == (summary if repeated else summary + "\n\n" + closing)
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, followup["id"])
        assert recorded.state["messages"][-1]["content"] == followup["answer"]


@pytest.mark.parametrize("followup, offer, constrained", [
    ("yes do it", "Would you like me to explain the first source in more detail?", True),
    ("Search for another guide", "Would you like me to explain the first source in more detail?", False),
    ("yes do it", "Would you like me to find other sources?", False),
])
def test_accepted_reading_offer_reuses_existing_sources_without_a_new_search(client, app, followup, offer, constrained):
    person = account(client, app)
    link = "https://cooking.example.org/guide"
    requested = []

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            assert not constrained, "An accepted reading offer must not trigger a fresh search"
            return httpx.Response(200, json={"results": []})
        if constrained:
            assert json.loads(request.content)["urls"] == [link]
        return httpx.Response(200, json={"results": [{"title": "Cooking guide", "text": "Prepare vegetables and whole grains."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, script(call("read_web_page", url=link), say("Here is the guide.\n\n" + offer)))
    ask(client, person, None, "Find a cooking guide")
    requested.clear()
    model = install(app, script(
        call("web_search", query="a different guide"),
        call("read_web_page", url="https://cooking.example.org/different"),
        call("read_web_page", url=link),
        say("The guide recommends preparing vegetables and whole grains for meals."),
    ))
    run = ask(client, person, None, followup)
    assert run["status"] == "completed", run
    assert ("web_search" in model.calls[0][1]) is not constrained
    results = tool_results(model.calls[-1][0])
    assert ("error" in results[0]) is constrained
    assert ("error" in results[1]) is constrained
    assert len(requested) == (1 if constrained else 3)
    assert run["approval"] is None


def test_an_explicit_video_request_cannot_search_for_or_replace_it_with_another_video(client, app):
    person = account(client, app)
    target = "https://www.youtube.com/watch?v=pKtweGSC2FU"

    def unexpected(request):
        raise AssertionError("An exact video link needs no search or network fetch")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(unexpected))
    model = install(app, script(
        call("web_search", query="a completely different music video"),
        call("read_web_page", url="https://youtu.be/abcdefghijk"),
        call("read_web_page", url=target),
        say("Use Play to watch the selected video."),
    ))
    run = ask(client, person, None, f"Play this video: {target}")
    assert run["status"] == "completed", run
    assert "web_search" not in model.calls[0][1]
    assert [source["video_id"] for source in run["sources"]] == ["pKtweGSC2FU"]
    results = tool_results(model.calls[-1][0])
    assert "selected video" in results[0]["error"].lower()
    assert "selected video" in results[1]["error"].lower()
    assert results[2]["result"]["video_id"] == "pKtweGSC2FU"


@pytest.mark.parametrize("status", [200, 403])
def test_unreadable_web_pages_stay_unread_and_return_an_honest_tool_result(client, app, status):
    person = account(client, app)
    link = "https://cooking.example.org/unavailable"

    def endpoint(request):
        if request.method == "GET":
            return httpx.Response(200, json={"results": [{"title": "Unavailable guide", "snippet": "Only a snippet.", "url": link}]})
        return httpx.Response(status, json={"results": []})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("web_search", query="cooking guide"), say("The article could not be read.")))
    run = ask(client, person, None, "Summarize a cooking guide")
    assert run["status"] == "completed", run
    assert len(run["sources"]) == 1 and run["sources"][0]["read"] is False
    last_result = tool_results(model.calls[-1][0])[-1]
    assert last_result.get("error") if status == 403 else last_result["result"]["text"] is None
    other = account(client, app, "other-web-reader@example.test")
    other_model = install(app, script(say("No earlier source is available here.")))
    ask(client, other, None, "yes read it")
    assert link not in json.dumps(other_model.calls[0][0])


@pytest.mark.parametrize("link, expected", [
    ("https://www.youtube.com/watch?v=pKtweGSC2FU", "pKtweGSC2FU"),
    ("https://youtu.be/pKtweGSC2FU", "pKtweGSC2FU"),
    ("https://www.youtube.com/shorts/pKtweGSC2FU", "pKtweGSC2FU"),
    ("https://youtube.com.attacker.example/watch?v=pKtweGSC2FU", None),
    ("https://user:secret@www.youtube.com/watch?v=pKtweGSC2FU", None),
    ("https://www.youtube.com/watch?v=bad", None),
    ("https://www.youtube.com/watch?v=pKtweGSC2FU&v=another0000", None),
    ("javascript:alert(1)", None),
])
def test_video_references_use_only_exact_supported_youtube_addresses(link, expected):
    assert youtube_id(link) == expected


def test_video_results_are_playable_references_not_claimed_video_transcripts(client, app):
    person = account(client, app)
    requested = []

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"title": "A cooking video", "snippet": "Video search description only.",
                                                       "url": "https://www.youtube.com/watch?v=pKtweGSC2FU"}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, script(call("web_search", query="cooking videos site:youtube.com"), say("Here is a cooking video.")))
    run = ask(client, person, None, "Play a cooking video")
    assert len(requested) == 1 and run["sources"][0]["video_id"] == "pKtweGSC2FU"
    assert run["sources"][0]["read"] is False and run["approval"] is None


def test_direct_video_link_does_not_require_scraping_or_claim_a_transcript(client, app):
    person = account(client, app)

    def blocked(request):
        raise AssertionError("A supported video reference needs no server-side page fetch")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(blocked))
    model = install(app, script(call("read_web_page", url="https://youtu.be/pKtweGSC2FU"), say("The video is ready to play.")))
    run = ask(client, person, None, "Play this YouTube video")
    assert run["status"] == "completed", run
    assert run["sources"][0]["video_id"] == "pKtweGSC2FU" and run["sources"][0]["read"] is False
    assert "no video transcript was read" in tool_results(model.calls[-1][0])[-1]["result"]["note"]


def test_research_helper_keeps_its_web_sources_for_the_final_answer(client, app):
    person = account(client, app)
    link = "https://cooking.example.org/research"
    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"results": [{"title": "Read cooking guide", "text": "Use varied ordinary ingredients."}]}),
    ))
    install(app, script(call("research", task="Read a cooking guide"), call("read_web_page", url=link),
                        say("The guide recommends varied ingredients."), say("Use varied ingredients for everyday meals.")))
    run = ask(client, person, None, "Research simple cooking habits")
    assert run["status"] == "completed", run
    assert run["sources"] == [{"title": "Read cooking guide", "url": link, "read": True, "video_id": None,
                               "retrieved_at": app.state.clock().isoformat().replace("+00:00", "Z")}]


def test_event_listing_exposes_and_uses_its_next_page_cursor():
    expected = [SimpleNamespace(
        id=str(uuid4()), title=f"Event {index}", starts_at=datetime(2026, 9, 20, 12, tzinfo=timezone.utc),
        ends_at=None, location="Hall", status="scheduled", ended=False, my_response=None, going=0,
    ) for index in range(2)]
    cursors = []

    def page(token, space_id, when, limit, cursor=None):
        cursors.append(cursor)
        if cursor is None:
            return expected[:1], SimpleNamespace(has_more=True, next_cursor="second-events-page")
        assert cursor == "second-events-page"
        return expected[1:], SimpleNamespace(has_more=False, next_cursor=None)

    context = SimpleNamespace(token="synthetic-session", space_id="selected-space", timezone="Asia/Kolkata",
                              agent=SimpleNamespace(events=SimpleNamespace(list_events=page)))
    first = list_events(context, ListEventsArgs())
    assert first.data["more"] is True
    assert first.data["next_cursor"] == "second-events-page"
    second = list_events(context, ListEventsArgs(cursor=first.data["next_cursor"]))
    assert second.data["more"] is False and second.data["next_cursor"] is None
    assert [item["id"] for item in first.data["events"] + second.data["events"]] == [item.id for item in expected]
    assert cursors == [None, "second-events-page"]


@pytest.mark.parametrize("when", ["upcoming", "past"])
def test_event_listing_keeps_complete_payloads_and_timezone_context(when):
    starts = datetime(2026, 9, 19, 23, 45, tzinfo=timezone.utc)
    events = [SimpleNamespace(
        id=str(uuid4()), title='"' * 110 + f" {index:02d}", starts_at=starts + timedelta(minutes=index),
        ends_at=starts + timedelta(hours=1, minutes=index), location="\\" * 195,
        status="cancelled" if index == 0 else "scheduled", ended=when == "past", my_response="going", going=index,
    ) for index in range(27)]

    def page(token, space_id, selected_when, limit, cursor=None):
        assert space_id == "selected-space" and selected_when == when
        start = int(cursor or "0")
        selected = events[start:start + limit]
        end = start + len(selected)
        more = end < len(events)
        return selected, SimpleNamespace(has_more=more, next_cursor=str(end) if more else None)

    context = SimpleNamespace(token="synthetic-session", space_id="selected-space", timezone="Asia/Kolkata",
                              agent=SimpleNamespace(events=SimpleNamespace(list_events=page)))
    seen, cursor = [], None
    for _page in range(len(events)):
        outcome = list_events(context, ListEventsArgs(when=when, cursor=cursor))
        message = json.loads(tool_message("event-page", {"result": outcome.data})["content"])
        assert "result" in message, "Event rows and continuation must not be cut into partial JSON."
        result = message["result"]
        assert result["timezone"] == "Asia/Kolkata" and result["when"] == when
        assert [item["ref"] for item in outcome.evidence] == [item["id"] for item in result["events"]]
        seen.extend(result["events"])
        if not result["more"]:
            assert result["next_cursor"] is None
            break
        assert result["next_cursor"] and result["next_cursor"] != cursor
        cursor = result["next_cursor"]
    assert [item["id"] for item in seen] == [item.id for item in events]
    assert [item["title"] for item in seen] == [item.title for item in events]
    assert seen[0]["starts"] == "Sun 2026-09-20 05:15"
    assert seen[0]["ends"] == "Sun 2026-09-20 06:15"
    assert seen[0]["status"] == "cancelled"
    assert seen[1]["status"] == ("ended" if when == "past" else "scheduled")


def test_document_listing_keeps_complete_rows_and_continuation():
    documents = [SimpleNamespace(
        id=str(uuid4()), name='"' * 180 + f"-{index:02d}.txt", line_count=index + 1,
        added_by_name="\\" * 75, status="deleted" if index % 5 == 0 else "active",
    ) for index in range(31)]

    def page(token, space_id, limit, cursor=None):
        assert space_id == "selected-space"
        start = int(cursor or "0")
        selected = documents[start:start + limit]
        end = start + len(selected)
        more = end < len(documents)
        return selected, SimpleNamespace(has_more=more, next_cursor=str(end) if more else None)

    context = SimpleNamespace(token="synthetic-session", space_id="selected-space",
                              agent=SimpleNamespace(documents=SimpleNamespace(list_documents=page)))
    seen, cursor = [], None
    for _page in range(len(documents)):
        outcome = list_documents(context, SimpleNamespace(cursor=cursor))
        message = json.loads(tool_message("document-page", {"result": outcome.data})["content"])
        assert "result" in message, "Document rows and continuation must not be cut into partial JSON."
        result = message["result"]
        assert [item["ref"] for item in outcome.evidence] == [item["document_id"] for item in result["documents"]]
        seen.extend(result["documents"])
        if not result["more"]:
            assert result["next_cursor"] is None
            break
        assert result["next_cursor"] and result["next_cursor"] != cursor
        cursor = result["next_cursor"]
    expected = [item for item in documents if item.status == "active"]
    assert [item["document_id"] for item in seen] == [item.id for item in expected]
    assert [item["name"] for item in seen] == [item.name for item in expected]
    assert [item["lines"] for item in seen] == [item.line_count for item in expected]


@pytest.mark.parametrize("line", [
    "x" * (DOCUMENT_TEXT + 1),
    "\u6f22" * (DOCUMENT_TEXT + 1),
    "x" * TOOL_TEXT,
    '"' * (TOOL_TEXT // 2),
    "\\" * (TOOL_TEXT // 2),
], ids=["ascii-text-limit", "unicode-text-limit", "ascii-envelope", "quotes-envelope", "backslashes-envelope"])
def test_document_reading_refuses_unchunkable_lines(line):
    document = SimpleNamespace(id=uuid4(), space_id="selected-space", name="Notes.txt", line_count=3,
                               content=f"Before\n{line}\nAfter")
    context = SimpleNamespace(token="synthetic-session", space_id="selected-space", agent=SimpleNamespace(
        documents=SimpleNamespace(read=lambda token, document_id: document),
    ))
    first = read_document(context, ReadDocumentArgs(document_id=document.id))
    assert first.data["text"] == "1: Before" and first.data["next_start_line"] == 2
    with pytest.raises(ToolProblem) as error:
        read_document(context, ReadDocumentArgs(document_id=document.id, start_line=2))
    assert error.value.code == "result_too_large"
    assert "Line 2" in error.value.message and "Documents screen" in error.value.message


@pytest.mark.parametrize("lines", [
    ["x" * 1900] * 4,
    ["\u6f22" * 1900] * 4,
    ['"\\' * 800] * 4,
    [""] + [f"short {index}" for index in range(800)],
], ids=["ascii", "unicode", "escaped", "many-numbered-lines"])
def test_document_reading_preserves_complete_lines_and_advancing_pages(lines):
    document = SimpleNamespace(id=uuid4(), space_id="selected-space", name='"' * 180 + ".txt",
                               line_count=len(lines), content="\n".join(lines))
    context = SimpleNamespace(token="synthetic-session", space_id="selected-space", agent=SimpleNamespace(
        documents=SimpleNamespace(read=lambda token, document_id: document),
    ))
    seen, start = [], 1
    for _page in range(len(lines)):
        outcome = read_document(context, ReadDocumentArgs(document_id=document.id, start_line=start))
        message = tool_message("document-read", {"result": outcome.data})
        content = json.loads(message["content"])
        assert "result" in content, "Document text and continuation must survive the result envelope."
        assert len(message["content"]) <= TOOL_TEXT
        result = content["result"]
        assert result == outcome.data
        assert result["name"] == document.name and result["total_lines"] == len(lines)
        assert result["text"]
        page = result["text"].split("\n")
        assert page == [f"{number}: {lines[number - 1]}" for number in range(start, start + len(page))]
        assert outcome.evidence == [{"kind": "document", "ref": str(document.id), "label": document.name}]
        seen.extend(page)
        if result["next_start_line"] is None:
            break
        assert result["next_start_line"] == start + len(page) > start
        start = result["next_start_line"]
    else:
        pytest.fail("Document reading did not terminate within its line count.")
    assert seen == [f"{number}: {line}" for number, line in enumerate(lines, start=1)]


@pytest.mark.parametrize("character", ["x", "\u6f22"], ids=["ascii", "unicode"])
def test_document_reading_keeps_a_complete_line_at_the_result_envelope(character):
    name = '"' * 180 + ".txt"
    expected = {"name": name, "total_lines": 2, "text": "1: ", "next_start_line": 2}
    overhead = len(json.dumps({"result": expected}, ensure_ascii=False, default=str, separators=(",", ":")))
    line = character * (TOOL_TEXT - overhead)
    expected["text"] += line
    assert len(json.dumps({"result": expected}, ensure_ascii=False, default=str, separators=(",", ":"))) == TOOL_TEXT
    document = SimpleNamespace(id=uuid4(), space_id="selected-space", name=name, line_count=2,
                               content=f"{line}\nRemaining text")
    context = SimpleNamespace(token="synthetic-session", space_id="selected-space", agent=SimpleNamespace(
        documents=SimpleNamespace(read=lambda token, document_id: document),
    ))
    first = read_document(context, ReadDocumentArgs(document_id=document.id))
    assert json.loads(tool_message("document-read", {"result": first.data})["content"]) == {"result": expected}
    assert first.evidence == [{"kind": "document", "ref": str(document.id), "label": name}]
    second = read_document(context, ReadDocumentArgs(document_id=document.id, start_line=first.data["next_start_line"]))
    assert second.data["text"] == "2: Remaining text" and second.data["next_start_line"] is None
    assert second.evidence == first.evidence


@pytest.mark.parametrize("content,start_line", [("One line", 2), ("", 1)], ids=["past-end", "no-text"])
def test_document_reading_refuses_unavailable_lines_instead_of_claiming_a_read(content, start_line):
    document = SimpleNamespace(id=uuid4(), space_id="selected-space", name="Notes.txt",
                               line_count=len(content.splitlines()), content=content)
    context = SimpleNamespace(token="synthetic-session", space_id="selected-space", agent=SimpleNamespace(
        documents=SimpleNamespace(read=lambda token, document_id: document),
    ))
    with pytest.raises(ToolProblem) as error:
        read_document(context, ReadDocumentArgs(document_id=document.id, start_line=start_line))
    assert error.value.code == "invalid_start_line" and f"Line {start_line}" in error.value.message


def test_reminder_listing_does_not_claim_empty_when_unread_pages_remain():
    cursors = []
    other = SimpleNamespace(space_id="another-space", status="scheduled")

    def page(token, limit, cursor=None, **filters):
        cursors.append(cursor)
        return [other], SimpleNamespace(has_more=True, next_cursor=f"page-{len(cursors)}")

    context = SimpleNamespace(token="synthetic-session", space_id="selected-space",
                              agent=SimpleNamespace(reminders=SimpleNamespace(list_reminders=page)))
    result = list_reminders(context, ListRemindersArgs())
    assert result.data["reminders"] == []
    assert result.data["more"] is True
    assert result.data["next_cursor"] == "page-3"
    assert cursors == [None, "page-1", "page-2"]


def test_reminder_listing_keeps_complete_rows_scoped_and_resumable_for_the_model():
    items = [SimpleNamespace(
        id=str(uuid4()), task_id=str(uuid4()), task_title='"' * 185 + f" {index:03d}",
        space_id="selected-space" if index % 7 else "another-space",
        status=("scheduled", "available", "cancelled", "suppressed", "expired", "failed")[index % 6],
        local_time=datetime(2026, 9, 20, 18, 30), timezone="Asia/Kolkata",
    ) for index in range(67)]
    scoped = [item for item in items if item.space_id == "selected-space"]
    requested = []

    def page(token, limit, cursor=None, *, space_id=None):
        requested.append(space_id)
        assert space_id == "selected-space"
        start = int(cursor or "0")
        selected = scoped[start:start + limit]
        end = start + len(selected)
        more = end < len(scoped)
        return selected, SimpleNamespace(has_more=more, next_cursor=str(end) if more else None)

    context = SimpleNamespace(token="synthetic-session", space_id="selected-space",
                              agent=SimpleNamespace(reminders=SimpleNamespace(list_reminders=page)))
    seen, cursor = [], None
    for _page in range(len(items)):
        outcome = list_reminders(context, ListRemindersArgs(cursor=cursor))
        message = json.loads(tool_message("reminder-page", {"result": outcome.data})["content"])
        assert "result" in message, "Reminder rows must not be cut into partial JSON."
        result = message["result"]
        seen.extend(item["id"] for item in result["reminders"])
        assert [item["ref"] for item in outcome.evidence] == [item["id"] for item in result["reminders"]]
        assert all(item["local_time"] == "2026-09-20 18:30" and item["timezone"] == "Asia/Kolkata"
                   for item in result["reminders"])
        if not result["more"]:
            assert result["next_cursor"] is None
            break
        assert result["next_cursor"] and result["next_cursor"] != cursor
        cursor = result["next_cursor"]
    assert seen == [item.id for item in scoped if item.status in ("scheduled", "available")]
    assert requested and set(requested) == {"selected-space"}


def test_task_listing_does_not_report_an_exhausted_search_with_unseen_pages():
    scanned = []
    item = SimpleNamespace(title="Unrelated task", status="open", assignee=None)

    def page(token, space_id, limit, cursor=None, **filters):
        scanned.append(cursor)
        return [item], SimpleNamespace(has_more=True, next_cursor=f"page-{len(scanned)}")

    context = SimpleNamespace(
        token="synthetic-session", space_id="synthetic-space", account_id="synthetic-person",
        agent=SimpleNamespace(tasks=SimpleNamespace(list_tasks=page)),
    )
    result = list_tasks(context, ListTasksArgs(query="important"))
    assert result.data["tasks"] == []
    assert result.data["more"] is True
    assert result.data["next_cursor"] == "page-3"
    assert scanned == [None, "page-1", "page-2"]


def test_task_listing_preserves_whole_rows_and_cursors_within_model_results():
    items = [SimpleNamespace(
        id=str(uuid4()), title='"' * 190 + f" {index:03d}", status="open", due_date=None, priority="normal",
        assignee=SimpleNamespace(account_id="synthetic-person", display_name="\\" * 75),
        permissions=SimpleNamespace(can_edit=True, allowed_statuses=["completed"]),
    ) for index in range(37)]

    def page(token, space_id, limit, cursor=None, **filters):
        start = int(cursor or "0")
        selected = items[start:start + limit]
        end = start + len(selected)
        more = end < len(items)
        return selected, SimpleNamespace(has_more=more, next_cursor=str(end) if more else None)

    context = SimpleNamespace(
        token="synthetic-session", space_id="synthetic-space", account_id="synthetic-person",
        agent=SimpleNamespace(tasks=SimpleNamespace(list_tasks=page)),
    )
    seen, cursor = [], None
    for _page in range(len(items)):
        outcome = list_tasks(context, ListTasksArgs(cursor=cursor))
        message = json.loads(tool_message("task-page", {"result": outcome.data})["content"])
        assert "result" in message, "Task results must not be cut into partial JSON."
        result = message["result"]
        assert result["tasks"]
        seen.extend(item["id"] for item in result["tasks"])
        assert [entry["ref"] for entry in outcome.evidence] == [item["id"] for item in result["tasks"]]
        assert result["filters"] == {"status": "open", "mine": False, "query": None, "due_from": None, "due_to": None}
        if not result["more"]:
            assert result["next_cursor"] is None
            break
        assert result["next_cursor"] and result["next_cursor"] != cursor
        cursor = result["next_cursor"]
    assert seen == [item.id for item in items]


@pytest.mark.parametrize("status", ["open", "completed", "all"])
@pytest.mark.parametrize("mine", [False, True])
def test_task_listing_applies_supported_filters_before_paging(status, mine):
    requested = []

    def page(token, space_id, limit, cursor=None, **filters):
        requested.append(filters)
        return [], SimpleNamespace(has_more=False, next_cursor=None)

    context = SimpleNamespace(
        token="synthetic-session", space_id="synthetic-space", account_id="synthetic-person",
        agent=SimpleNamespace(tasks=SimpleNamespace(list_tasks=page)),
    )
    result = list_tasks(context, ListTasksArgs(status=status, mine=mine, due_from="2026-09-19", due_to="2026-09-20"))
    assert requested == [{
        "status": "completed" if status == "completed" else None,
        "assignee": "synthetic-person" if mine else None,
        "due_from": "2026-09-19", "due_to": "2026-09-20",
    }]
    assert result.data["tasks"] == [] and result.data["more"] is False and result.data["next_cursor"] is None
    assert result.data["filters"]["due_from"] == "2026-09-19"
    assert result.data["filters"]["due_to"] == "2026-09-20"


@pytest.mark.parametrize("dates", [
    {"due_from": "2026-02-30"}, {"due_to": "not a date"},
    {"due_from": "2026-09-21", "due_to": "2026-09-20"},
])
def test_task_listing_rejects_invalid_due_ranges(dates):
    with pytest.raises(ValueError):
        ListTasksArgs.model_validate(dates)


@pytest.mark.parametrize("mine", [False, True])
def test_task_listing_date_filters_preserve_assignment_and_space_boundaries(client, app, mine):
    person, space_id = solo(client, app)
    own_id = person["user"]["id"]
    create_task(client, person, space_id, title="Earlier task", due_date="2026-09-18", assignee_id=own_id)
    shared = create_task(client, person, space_id, title="Shared task", due_date="2026-09-19").json()["data"]
    assigned = create_task(client, person, space_id, title="Assigned task", due_date="2026-09-20", assignee_id=own_id)
    progressed = change_task(client, person, assigned.json()["data"]["id"], {"status": "in_progress"},
                             etag=assigned.headers["etag"], operation="status")
    assert progressed.status_code == 200, progressed.text
    create_task(client, person, space_id, title="Later task", due_date="2026-09-21", assignee_id=own_id)
    create_task(client, person, space_id, title="Undated task", due_date=None, assignee_id=own_id)
    other = create_space(client, person, "Other task plans").json()["data"]["id"]
    create_task(client, person, other, title="Other Space task", due_date="2026-09-20", assignee_id=own_id)
    model = install(app, script(call("list_tasks", mine=mine, due_from="2026-09-19", due_to="2026-09-20"),
                                say("Here are the matching tasks.")))
    run = ask(client, person, space_id, "What is due today or tomorrow?")
    assert run["status"] == "completed" and run["approval"] is None
    result = tool_results(model.calls[-1][0])[-1]["result"]
    expected = {assigned.json()["data"]["id"]} if mine else {shared["id"], assigned.json()["data"]["id"]}
    assert {item["id"] for item in result["tasks"]} == expected
    assert {item["ref"] for item in run["evidence"]} == expected
    assert result["more"] is False and result["next_cursor"] is None
    assert result["filters"] == {"status": "open", "mine": mine, "query": None,
                                  "due_from": "2026-09-19", "due_to": "2026-09-20"}


def test_task_listing_cursor_reaches_every_task_and_remains_scoped(client, app):
    person, space_id = solo(client, app)
    expected = set()
    for index in range(9):
        created = create_task(client, person, space_id, title="Page task " + '"' * 180 + f" {index:02d}")
        assert created.status_code == 201, created.text
        expected.add(created.json()["data"]["id"])
    seen, cursors = [], []

    def paginate(messages, tools):
        if messages[-1]["role"] != "tool":
            return call("list_tasks", query="Page task")
        result = json.loads(messages[-1]["content"])["result"]
        seen.extend(item["id"] for item in result["tasks"])
        if result["more"]:
            assert result["next_cursor"] not in cursors
            cursors.append(result["next_cursor"])
            return call("list_tasks", query="Page task", cursor=result["next_cursor"])
        return say("The complete matching task list is available.")

    model = install(app, paginate)
    run = ask(client, person, space_id, "Show all the page tasks")
    assert run["status"] == "completed", run
    assert len(seen) == len(expected) and set(seen) == expected
    assert {item["ref"] for item in run["evidence"]} == expected
    assert cursors and len(model.calls) == len(cursors) + 2

    other = create_space(client, person, "Other cursor scope").json()["data"]["id"]
    for target, extra in ((other, {}), (space_id, {"due_from": "2026-09-20"})):
        denied = install(app, script(call("list_tasks", query="Page task", cursor=cursors[0], **extra),
                                     say("Reload this task list.")))
        result = ask(client, person, target, "Continue the task list")
        assert result["tool_calls"][0]["error_code"] == "CURSOR_INVALID"
        assert result["evidence"] == [] and result["approval"] is None
        assert "error" in tool_results(denied.calls[-1][0])[-1]


def test_the_model_reads_with_a_tool_and_answers_from_the_result(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Water the plants", due_date="2026-09-20")
    model = install(app, script(call("list_tasks", status="open"), say("You have one open task: Water the plants.")))
    run = ask(client, person, space_id, "what do I need to do?")
    assert (run["status"], run["outcome"], run["answer"]) == ("completed", "answered", "You have one open task: Water the plants.")
    assert [(item["tool_name"], item["effect"], item["status"]) for item in run["tool_calls"]] == [("family.tasks.list", "read", "succeeded")]
    assert [item["kind"] for item in run["evidence"]] == ["task"]
    first, second = model.calls
    assert first[0][0] == {"role": "system", "content": MAIN} and "create_task" in first[1]
    assert "Today is 2026-09-19" in first[0][1]["content"]
    # The tool's result reached the model as tool data, not as instructions.
    [result] = tool_results(second[0])
    assert result["result"]["tasks"][0]["title"] == "Water the plants"


@pytest.mark.parametrize("same_space", [False, True])
def test_reminder_tool_only_proposes_tasks_in_its_current_space(client, app, same_space):
    person, space_id = solo(client, app)
    other = create_space(client, person, "Other reminder plans").json()["data"]["id"]
    target = space_id if same_space else other
    task = create_task(client, person, target, title="Review the plans").json()["data"]
    model = install(app, script(call("schedule_reminder", task_id=task["id"], date="2026-09-20", time="18:00"),
                                say("The reminder request was checked.")))
    run = ask(client, person, space_id, "Remind me about that task tomorrow at 6 pm")
    assert count(app, Reminder) == 0
    if not same_space:
        assert run["status"] == "completed" and run["approval"] is None
        assert tool_results(model.calls[-1][0])[-1]["error"] == "That task isn't in this Space."
        assert run["tool_calls"][0]["error_code"] == "NOT_FOUND"
        assert count(app, AgentApproval) == 0
        return
    assert run["status"] == "waiting_for_approval"
    assert fields(run)["Task"] == task["title"]
    approved = approve(client, person, run)
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["outcome"] == "action_completed"
    with app.state.sessions() as database:
        reminder = database.scalars(select(Reminder)).one()
        assert reminder.task_id == task["id"] and reminder.space_id == space_id


@pytest.mark.parametrize("tool_name, collection, identifier", [
    ("list_events", "events", "id"),
    ("list_documents", "documents", "document_id"),
])
def test_resource_listing_pages_preserve_history_scope_and_account_boundaries(client, app, monkeypatch, tool_name, collection, identifier):
    owner, space_id = solo(client, app)

    def create_resource(title):
        response = (create_event(client, owner, space_id, title=title) if tool_name == "list_events"
                    else add_document(client, owner, space_id, name=title + ".txt", content="Synthetic planning notes."))
        assert response.status_code == 201, response.text
        return response.json()["data"]["id"]

    hidden = create_resource("Before admission")
    member = account(client, app, f"{collection}-page-member@example.test")
    admit(client, owner, space_id, member)
    expected = {create_resource(f"Visible plan {index}") for index in range(2)}
    other = create_space(client, owner, "Other resource scope").json()["data"]["id"]
    admit(client, owner, other, member)
    monkeypatch.setattr("app.modules.agents.toolkit.LISTED", 1)
    seen, cursors = [], []

    def follow_pages(messages, tools):
        if messages[-1]["role"] != "tool":
            return call(tool_name)
        result = json.loads(messages[-1]["content"])["result"]
        seen.extend(item[identifier] for item in result[collection])
        if result["more"]:
            assert result["next_cursor"] not in cursors
            cursors.append(result["next_cursor"])
            return call(tool_name, cursor=result["next_cursor"])
        return say("These are the visible items in this Space.")

    model = install(app, follow_pages)
    run = ask(client, member, space_id, "List the planning resources here")
    assert run["status"] == "completed" and run["approval"] is None
    assert len(seen) == 2 and set(seen) == expected and hidden not in seen
    assert {item["ref"] for item in run["evidence"]} == expected
    assert len(model.calls) == 3 and len(cursors) == 1
    assert all(item["effect"] == "read" and item["status"] == "succeeded" for item in run["tool_calls"])

    attempts = [(owner, space_id, {}), (member, other, {})]
    if tool_name == "list_events":
        attempts.append((member, space_id, {"when": "past"}))
    for actor, target, extra in attempts:
        install(app, script(call(tool_name, cursor=cursors[0], **extra), say("Reload this list.")))
        rejected = ask(client, actor, target, "Continue that list")
        assert rejected["tool_calls"][0]["error_code"] == "CURSOR_INVALID"
        assert rejected["evidence"] == [] and rejected["approval"] is None

    expiry = json.loads(app.state.security.open(cursors[0]))["expires_at"]
    app.state.clock.now = datetime.fromisoformat(expiry) + timedelta(seconds=1)
    install(app, script(call(tool_name, cursor=cursors[0]), say("The page expired.")))
    expired = ask(client, member, space_id, "Continue that list")
    assert expired["tool_calls"][0]["error_code"] == "CURSOR_EXPIRED"
    assert expired["evidence"] == [] and count(app, AgentApproval) == 0


def test_reminder_service_scoped_pages_preserve_cursor_and_account_boundaries(client, app, monkeypatch):
    owner, space_id = solo(client, app)
    other = create_space(client, owner, "Other reminder scope").json()["data"]["id"]
    member = account(client, app, "reminder-page-member@example.test")
    admit(client, owner, space_id, member)
    private_space = create_space(client, member, "Private reminder scope").json()["data"]["id"]
    reminders = app.state.reminders
    token = auth(owner)["Authorization"].removeprefix("Bearer ")
    member_token = auth(member)["Authorization"].removeprefix("Bearer ")

    def schedule(actor, target, title):
        task = create_task(client, actor, target, title=title).json()["data"]
        actor_token = auth(actor)["Authorization"].removeprefix("Bearer ")
        preview = reminders.preview(actor_token, PreviewReminder.model_validate({
            "task_id": task["id"], "local_time": "2026-09-20T18:00", "timezone": "Asia/Kolkata",
        }))
        return reminders.create(actor_token, CreateReminder(preview_token=preview.options[0].preview_token), str(uuid4()))

    selected = {schedule(owner, space_id, title).id for title in ("First scoped reminder", "Second scoped reminder")}
    elsewhere = schedule(owner, other, "Other Space reminder").id
    member_reminder = schedule(member, space_id, "Another account's reminder").id
    first, pagination = reminders.list_reminders(token, 1, space_id=space_id)
    assert len(first) == 1 and first[0].space_id == space_id
    assert pagination.has_more and pagination.next_cursor
    rest, end = reminders.list_reminders(token, 2, pagination.next_cursor, space_id=space_id)
    assert {item.id for item in first + rest} == selected
    assert not end.has_more and end.next_cursor is None

    for actor_token, target in ((token, other), (member_token, space_id), (token, None)):
        with pytest.raises(DomainError) as failure:
            reminders.list_reminders(actor_token, 2, pagination.next_cursor, space_id=target)
        assert failure.value.code == "CURSOR_INVALID"
    with pytest.raises(DomainError) as failure:
        reminders.list_reminders(token, 2, space_id=private_space)
    assert failure.value.status == 404
    mine, _pagination = reminders.list_reminders(member_token, 10, space_id=space_id)
    assert [item.id for item in mine] == [member_reminder]

    global_first, global_page = reminders.list_reminders(token, 1)
    legacy_fields = json.loads(reminders.security.open(global_page.next_cursor))
    legacy_fields.pop("space_id", None)
    legacy_cursor = reminders.security.seal(json.dumps(legacy_fields))
    global_rest, _pagination = reminders.list_reminders(token, 10, legacy_cursor)
    assert {item.id for item in global_first + global_rest} == selected | {elsewhere}

    monkeypatch.setattr("app.modules.agents.toolkit.LISTED", 1)
    seen = []

    def follow_pages(messages, tools):
        if messages[-1]["role"] != "tool":
            return call("list_my_reminders")
        result = json.loads(messages[-1]["content"])["result"]
        seen.extend(item["id"] for item in result["reminders"])
        if result["more"]:
            return call("list_my_reminders", cursor=result["next_cursor"])
        return say("These are your reminders in this Space.")

    model = install(app, follow_pages)
    run = ask(client, owner, space_id, "List all my reminders here")
    assert run["status"] == "completed" and run["approval"] is None
    assert len(seen) == 2 and set(seen) == selected
    assert len(model.calls) == 3
    assert {item["ref"] for item in run["evidence"]} == selected
    assert all(item["tool_name"] == "reminders.list" for item in run["tool_calls"])
    assert count(app, Reminder) == 4 and count(app, AgentApproval) == 0

    app.state.clock.now += timedelta(minutes=16)
    with pytest.raises(DomainError) as failure:
        reminders.list_reminders(token, 2, pagination.next_cursor, space_id=space_id)
    assert failure.value.code == "CURSOR_EXPIRED"


def test_reminder_execution_rechecks_the_space_of_an_older_payload(client, app):
    person, space_id = solo(client, app)
    other = create_space(client, person, "Other saved reminder").json()["data"]["id"]
    task = create_task(client, person, other, title="Old foreign proposal").json()["data"]
    token = auth(person)["Authorization"].removeprefix("Bearer ")
    preview = app.state.reminders.preview(token, PreviewReminder.model_validate({
        "task_id": task["id"], "local_time": "2026-09-20T18:00", "timezone": "Asia/Kolkata",
    }))
    payload = {"task_id": task["id"], "task_version": preview.task_version,
               "local_time": "2026-09-20T18:00", "timezone": "Asia/Kolkata",
               "scheduled_at": preview.options[0].scheduled_at.isoformat()}
    context = ToolContext(agent=app.state.agents, token=token, run_id=str(uuid4()), account_id=person["user"]["id"],
                          admission_id=None, space_id=space_id, timezone="Asia/Kolkata", now=app.state.clock())
    with pytest.raises(ToolProblem, match="That task isn't in this Space"):
        execute_schedule_reminder(context, payload, str(uuid4()))
    assert count(app, Reminder) == 0


def test_a_change_waits_for_approval_then_runs_once_and_the_model_reports_it(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("create_task", title="Buy milk", due_date="2026-09-20", priority="high"), say("Added Buy milk for tomorrow.")))
    run = ask(client, person, space_id, "add buy milk for tomorrow, it's important")
    assert run["status"] == "waiting_for_approval" and count(app, Task) == 0
    reviewed = fields(run)
    assert reviewed.pop("Space")
    assert reviewed == {"Title": "Buy milk", "Notes": "None", "Due date": "Sun 20 Sep 2026", "Assigned to": "Nobody", "Priority": "High"}
    key = "7c1a6f9e-0f43-4d0e-9b1f-6f0a8a2a1111"
    done = approve(client, person, run, key=key)
    assert done.status_code == 200, done.text
    finished = done.json()["data"]
    assert (finished["status"], finished["outcome"], finished["answer"]) == ("completed", "action_completed", "Added Buy milk for tomorrow.")
    assert finished["approval"]["status"] == "approved" and count(app, Task) == 1
    # The same decision again returns the same result and changes nothing more.
    assert approve(client, person, run, key=key).status_code == 200 and count(app, Task) == 1
    assert approve(client, person, run).status_code == 409


def test_a_rejected_change_is_told_to_the_model_and_nothing_changes(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("create_task", title="Paint the fence"), say("Okay, I left it.")))
    run = ask(client, person, space_id, "add a task to paint the fence")
    rejected = reject(client, person, run).json()["data"]
    assert (rejected["status"], rejected["answer"], rejected["approval"]["status"]) == ("completed", "Okay, I left it.", "rejected")
    assert "rejected" in tool_results(model.calls[-1][0])[-1] and count(app, Task) == 0


def test_several_changes_in_one_request_each_need_their_own_approval(client, app):
    person, space_id = solo(client, app)
    install(app, script(
        call("write_todos", todos=[{"content": "Add milk", "status": "in_progress"}, {"content": "Add bread", "status": "pending"}]),
        call("create_task", title="Milk"), call("create_task", title="Bread"), say("Both added."),
    ))
    run = ask(client, person, space_id, "add milk and bread")
    assert [item["content"] for item in run["todos"]] == ["Add milk", "Add bread"] and len(run["plan"]) == 2
    second = approve(client, person, run).json()["data"]
    assert second["status"] == "waiting_for_approval" and fields(second)["Title"] == "Bread"
    done = approve(client, person, second).json()["data"]
    assert done["status"] == "completed" and count(app, Task) == 2 and count(app, AgentApproval) == 2


@pytest.mark.parametrize("length", [2001, 5000])
def test_full_post_text_is_reviewed_before_draft_and_publication(client, app, length):
    person, space_id = solo(client, app)
    created = create_page(client, person)
    assert created.status_code == 201, created.text
    page = created.json()["data"]
    ending = " These final words must also be reviewed."
    text = ("Make time for a gentle walk and regular rest. " * 130)[:length - len(ending)] + ending
    assert len(text) == length
    install(app, script(call("create_post", page=page["handle"], title="Everyday wellness", text=text), say("Draft saved.")))
    proposed = ask(client, person, MAIN_AGENT, "Draft a wellness post on my page")
    assert proposed["status"] == "waiting_for_approval", proposed
    assert fields(proposed)["Text"] == text
    assert count(app, PublicPost) == 0
    saved = approve(client, person, proposed)
    assert saved.status_code == 200, saved.text
    result = saved.json()["data"]
    post_id = result["approval"]["result_ref"]
    post = client.get(f"/v1/posts/{post_id}", headers=auth(person)).json()["data"]
    assert (post["body"], post["status"]) == (text, "draft")
    assert client.get(f"/v1/posts/{post_id}").status_code == 404

    install(app, script(call("publish_post", post_id=post_id), say("Post published.")))
    publication = ask(client, person, MAIN_AGENT, f"Publish post {post_id}")
    assert publication["status"] == "waiting_for_approval", publication
    assert fields(publication)["Text"] == text
    assert client.get(f"/v1/posts/{post_id}").status_code == 404
    key = str(uuid4())
    published = approve(client, person, publication, key=key)
    assert published.status_code == 200, published.text
    assert published.json()["data"]["outcome"] == "action_completed"
    assert approve(client, person, publication, key=key).status_code == 200
    assert count(app, PublicPost) == 1
    assert client.get(f"/v1/posts/{post_id}").json()["data"]["body"] == text


def test_public_change_and_approval_result_roll_back_together(client, app, monkeypatch):
    person, space_id = solo(client, app)
    install(app, script(call("create_page", handle="wellness-review", name="Everyday wellness", topic="health"), say("Page created.")))
    run = ask(client, person, MAIN_AGENT, "Create a wellness page")
    assert run["status"] == "waiting_for_approval", run
    original = app.state.agents.record_call

    def fail_record(*arguments, **named):
        if len(arguments) > 3 and arguments[3] == "write":
            raise RuntimeError("Synthetic failure recording the public action result")
        return original(*arguments, **named)

    key = str(uuid4())
    with monkeypatch.context() as patch:
        patch.setattr(app.state.agents, "record_call", fail_record)
        failed = approve(client, person, run, key=key)
    assert failed.status_code == 500, failed.text
    assert count(app, PublicPage) == 0
    pending = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(person)).json()["data"]
    assert pending["approval"]["status"] == "pending"
    assert pending["approval"]["etag"] == run["approval"]["etag"]
    recovered = approve(client, person, run, key=key)
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["data"]["outcome"] == "action_completed"
    assert approve(client, person, run, key=key).status_code == 200
    assert count(app, PublicPage) == 1


@pytest.mark.parametrize("tool_name, arguments, effect_model, audit_model, audit_ref, action", [
    ("create_task", {"title": "Atomic task"}, Task, TaskAudit, TaskAudit.task_id, "task.created"),
    ("create_event", {"title": "Atomic event", "start_time": "18:00"},
     SpaceEvent, SpaceAuditEvent, SpaceAuditEvent.target_id, "event.created"),
], ids=["create_task", "create_event"])
def test_task_and_event_effects_and_approval_receipt_commit_or_roll_back_together(
    client, app, monkeypatch, tool_name, arguments, effect_model, audit_model, audit_ref, action,
):
    person, space_id = solo(client, app)
    if tool_name == "create_event":
        arguments = {**arguments, "date": (app.state.clock() + timedelta(days=1)).date().isoformat()}
    model = install(app, script(call(tool_name, **arguments), say("Created the reviewed item.")))
    run = ask(client, person, space_id, "Create the reviewed item")
    assert run["status"] == "waiting_for_approval", run
    assert run["approval"]["status"] == "pending" and run["approval"]["result_ref"] is None
    assert count(app, effect_model) == 0
    original = app.state.agents.record_call

    def fail_record(*arguments, **named):
        if len(arguments) > 3 and arguments[3] == "write":
            raise RuntimeError("Synthetic failure recording the task/event action result")
        return original(*arguments, **named)

    key = str(uuid4())
    with monkeypatch.context() as patch:
        patch.setattr(app.state.agents, "record_call", fail_record)
        failed = approve(client, person, run, key=key)
    assert failed.status_code == 500, failed.text
    pending_response = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(person))
    assert pending_response.status_code == 200, pending_response.text
    pending = pending_response.json()["data"]
    assert pending["approval"] == run["approval"]
    assert pending["status"] == run["status"] and pending["version"] == run["version"]
    assert pending["tool_calls"] == run["tool_calls"] and pending["events"] == run["events"]
    assert len(model.calls) == 1
    assert count(app, effect_model) == 0
    assert count(app, audit_model, audit_model.action == action) == 0
    assert count(app, OutboxEvent, OutboxEvent.event_type == action) == 0
    assert count(app, AgentToolCall, AgentToolCall.run_id == run["id"], AgentToolCall.effect == "write") == 0
    assert count(app, AgentApproval) == 1
    with app.state.sessions() as database:
        pending_approval = database.get(AgentApproval, run["approval"]["id"])
        assert pending_approval.decision_key is None and pending_approval.result_ref is None

    recovered = approve(client, person, run, key=key)
    assert recovered.status_code == 200, recovered.text
    finished = recovered.json()["data"]
    assert (finished["status"], finished["outcome"]) == ("completed", "action_completed")
    receipt = finished["approval"]
    assert receipt["id"] == run["approval"]["id"] and receipt["status"] == "approved"
    assert receipt["result_ref"] is not None
    writes = [item for item in finished["tool_calls"] if item["effect"] == "write"]
    assert len(writes) == 1
    assert (writes[0]["status"], writes[0]["approval_id"], writes[0]["result_ref"]) == (
        "succeeded", receipt["id"], receipt["result_ref"],
    )
    with app.state.sessions() as database:
        effect = database.get(effect_model, receipt["result_ref"])
        assert effect is not None and effect.space_id == space_id and effect.title == arguments["title"]
        approval = database.get(AgentApproval, receipt["id"])
        assert (approval.status, approval.decision_key, approval.result_ref) == ("approved", key, effect.id)
    assert count(app, audit_model, audit_model.action == action, audit_ref == receipt["result_ref"]) == 1
    assert count(app, OutboxEvent, OutboxEvent.event_type == action, OutboxEvent.aggregate_id == receipt["result_ref"]) == 1
    replay = approve(client, person, run, key=key)
    assert replay.status_code == 200, replay.text
    assert replay.json()["data"] == finished
    assert len(model.calls) == 2
    assert count(app, effect_model) == count(app, AgentApproval) == 1
    assert count(app, audit_model, audit_model.action == action) == 1
    assert count(app, OutboxEvent, OutboxEvent.event_type == action) == 1
    assert count(app, AgentToolCall, AgentToolCall.run_id == run["id"], AgentToolCall.effect == "write") == 1


@pytest.mark.parametrize("owns_post", [True, False], ids=["owner", "other_person"])
def test_comment_review_rejects_changed_parent_without_posting(client, app, owns_post):
    owner, _space_id = solo(client, app)
    person = owner if owns_post else account(client, app, "comment-review@example.test")
    page = create_page(client, owner).json()["data"]
    post = publish(client, owner, draft(client, owner, page["id"]).json()["data"])
    text = "This comment responds only to the reviewed post."
    install(app, script(call("comment_on_post", post_id=post["id"], text=text), say("Comment result received.")))
    run = ask(client, person, MAIN_AGENT, "Comment on the selected post")
    assert run["status"] == "waiting_for_approval", run
    assert fields(run)["Your comment"] == text
    assert count(app, PostComment) == 0
    changed = client.patch(f"/v1/posts/{post['id']}", headers={**auth(owner), "If-Match": post["etag"]},
                           json={"body": "Different parent text that was not in the comment review."})
    assert changed.status_code == 200, changed.text
    assert changed.json()["data"]["etag"] != post["etag"]

    result = approve(client, person, run)

    assert result.status_code == 200, result.text
    answered_run = result.json()["data"]
    assert answered_run["approval"]["status"] == "cancelled", answered_run
    assert answered_run["approval"]["reason"] == "CONTENT_CHANGED"
    assert answered_run["approval"]["result_ref"] is None
    assert not any(item["effect"] == "write" and item["status"] == "succeeded" for item in answered_run["tool_calls"])
    assert count(app, PostComment) == 0
    actual = client.get(f"/v1/posts/{post['id']}", headers=auth(person)).json()["data"]
    assert actual["body"] == "Different parent text that was not in the comment review."
    assert actual["status"] == "published" and actual["comment_count"] == 0


@pytest.mark.parametrize("owns_post", [True, False], ids=["owner", "other_person"])
def test_comment_review_on_an_unchanged_post_commits_once(client, app, owns_post):
    owner, _space_id = solo(client, app)
    person = owner if owns_post else account(client, app, "comment-review@example.test")
    page = create_page(client, owner).json()["data"]
    post = publish(client, owner, draft(client, owner, page["id"]).json()["data"])
    text = "This comment responds only to the reviewed post."
    model = install(app, script(call("comment_on_post", post_id=post["id"], text=text), say("Comment result received.")))
    run = ask(client, person, MAIN_AGENT, "Comment on the selected post")
    assert run["status"] == "waiting_for_approval", run
    assert fields(run)["Your comment"] == text
    assert count(app, PostComment) == 0
    key = str(uuid4())

    result = approve(client, person, run, key=key)

    assert result.status_code == 200, result.text
    finished = result.json()["data"]
    assert finished["approval"]["status"] == "approved", finished
    assert (finished["status"], finished["outcome"]) == ("completed", "action_completed")
    replay = approve(client, person, run, key=key)
    assert replay.status_code == 200 and replay.json()["data"] == finished
    assert len(model.calls) == 2 and count(app, PostComment) == 1
    with app.state.sessions() as database:
        saved = database.get(PostComment, finished["approval"]["result_ref"])
        assert (saved.post_id, saved.author_id, saved.body, saved.status) == (post["id"], person["user"]["id"], text, "visible")
    actual = client.get(f"/v1/posts/{post['id']}", headers=auth(person)).json()["data"]
    assert actual["comment_count"] == 1 and actual["body"] == post["body"]
    assert actual["etag"] == (post["etag"] if owns_post else None)


@pytest.mark.parametrize("published_first", [False, True])
def test_publication_never_accepts_changed_content_from_an_old_review(client, app, published_first):
    person, space_id = solo(client, app)
    page = create_page(client, person).json()["data"]
    created = draft(client, person, page["id"]).json()["data"]
    install(app, script(call("publish_post", post_id=created["id"]), say("Publication result received.")))
    run = ask(client, person, MAIN_AGENT, "Publish the selected post")
    assert run["status"] == "waiting_for_approval", run
    current = publish(client, person, created) if published_first else created
    changed = client.patch(f"/v1/posts/{created['id']}", headers={**auth(person), "If-Match": current["etag"]},
                           json={"body": "Different text that was not in the Agent review."})
    assert changed.status_code == 200, changed.text
    result = approve(client, person, run)
    assert result.status_code == 200, result.text
    answered_run = result.json()["data"]
    assert answered_run["approval"]["status"] == "cancelled", answered_run
    assert answered_run["approval"]["reason"] == "CONTENT_CHANGED"
    assert not any(item["effect"] == "write" and item["status"] == "succeeded" for item in answered_run["tool_calls"])
    actual = client.get(f"/v1/posts/{created['id']}", headers=auth(person)).json()["data"]
    assert actual["body"] == "Different text that was not in the Agent review."
    assert actual["status"] == ("published" if published_first else "draft")


def test_requested_publication_review_follows_the_approved_draft_without_model_guessing(client, app):
    person, space_id = solo(client, app)
    page = create_page(client, person).json()["data"]
    content = "Build ordinary habits with regular rest, balanced meals and comfortable daily movement."
    model = install(app, script(
        call("create_post", page=page["id"], title="Everyday wellness", text=content, review_publication=True),
        say("Your reviewed post is published."),
    ))
    proposed = ask(client, person, MAIN_AGENT, "Create the post and publish it after separate review")
    assert proposed["status"] == "waiting_for_approval", proposed
    assert fields(proposed)["Next step"] == "Request a separate approval to publish this exact draft"
    assert count(app, PublicPost) == 0
    draft_key = str(uuid4())
    next_review = approve(client, person, proposed, key=draft_key).json()["data"]
    assert next_review["status"] == "waiting_for_approval", next_review
    assert next_review["id"] == proposed["id"]
    assert next_review["approval"]["tool_name"] == "community.posts.publish"
    assert next_review["approval"]["id"] != proposed["approval"]["id"]
    assert fields(next_review)["Text"] == content
    assert len(model.calls) == 1, "Opening the requested review must not depend on another model decision"
    with app.state.sessions() as database:
        post = database.scalar(select(PublicPost))
        post_id = post.id
        assert (post.body, post.status) == (content, "draft")
    assert client.get(f"/v1/posts/{post_id}").status_code == 404
    assert approve(client, person, proposed, key=draft_key).json()["data"]["approval"]["id"] == next_review["approval"]["id"]
    publication_key = str(uuid4())
    published = approve(client, person, next_review, key=publication_key).json()["data"]
    assert published["status"] == "completed" and published["outcome"] == "action_completed"
    assert len(model.calls) == 2 and count(app, PublicPost) == 1
    assert approve(client, person, next_review, key=publication_key).status_code == 200
    assert client.get(f"/v1/posts/{post_id}").json()["data"]["body"] == content


def test_a_question_waits_for_the_answer_and_the_loop_continues(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("ask_user", question="What should I call it?"), call("create_task", title="Dentist"), say("Proposed.")))
    run = ask(client, person, space_id, "add a task")
    assert run["status"] == "waiting_for_user" and run["question"]["text"] == "What should I call it?"
    resumed = answer(client, person, run, "Dentist")
    assert resumed["status"] == "waiting_for_approval" and fields(resumed)["Title"] == "Dentist"
    # The same answer again is no new answer.
    assert answer(client, person, run, "Dentist")["id"] == run["id"]


def test_the_research_helper_has_its_own_context_and_read_only_tools(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Plan the picnic")
    model = install(app, script(
        call("research", task="Find tasks about the picnic"),
        call("list_tasks"), say("One task: Plan the picnic."),
        say("Your picnic task is ready to go."),
    ))
    run = ask(client, person, space_id, "how is the picnic going?")
    assert run["answer"] == "Your picnic task is ready to go."
    helper = model.calls[1]
    assert helper[0][0]["content"] == RESEARCH and helper[0][2] == {"role": "user", "content": "Find tasks about the picnic"}
    assert "create_task" not in helper[1] and "research" not in helper[1] and "list_tasks" in helper[1]
    assert [item["summary"] for item in run["tool_calls"]][:2] == ["Helper: Read 1 tasks.", "Research: Find tasks about the picnic"]


def test_unknown_tools_and_bad_arguments_go_back_to_the_model(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("delete_everything"), call("create_task", title=""), say("Sorry.")))
    run = ask(client, person, space_id, "do something")
    assert run["answer"] == "Sorry." and count(app, Task) == 0 and count(app, AgentApproval) == 0
    errors = [item["error"] for item in tool_results(model.calls[-1][0])]
    assert "no tool called" in errors[0] and errors[1].startswith("Invalid arguments")


def test_a_task_from_another_space_is_not_reachable(client, app):
    person, space_id = solo(client, app)
    other = create_space(client, person, "Other").json()["data"]["id"]
    elsewhere = create_task(client, person, other, title="Elsewhere").json()["data"]["id"]
    model = install(app, script(call("complete_task", task_id=elsewhere), say("Can't.")))
    run = ask(client, person, space_id, "finish it")
    assert run["status"] == "completed" and count(app, AgentApproval) == 0
    assert tool_results(model.calls[-1][0])[0]["error"] == "That task isn't in this Space."


@pytest.mark.parametrize("ending", ["answer", "length", "tool"])
def test_news_length_recovery_is_bounded_and_cannot_replay_tools(client, app, ending):
    person = account(client, app)
    requested = []

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"title": "Transit report", "text": "The published correction changes the start date to October 9."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    final = say("The report corrects the service start date to October 9. Independent confirmation is unavailable.") if ending == "answer" else ModelError("length") if ending == "length" else call("save_memory", content="This recovery must not save anything")
    model = install(app, script(call("read_web_page", url="https://news.example.org/transit"), ModelError("length"), final))
    run = ask(client, person, None, "Give the details from the transit report")
    assert len(model.calls) == 3 and model.calls[-1][1] == []
    assert "answer-only" in json.dumps(model.calls[-1][0])
    assert len(requested) == 1 and len(run["tool_calls"]) == 1
    assert run["approval"] is None and count(app, AgentMemory) == 0 and count(app, AgentApproval) == 0
    assert run["status"] == ("completed" if ending == "answer" else "failed")
    if ending != "answer":
        assert "within its limit" in run["answer"]
        assert run["stop_reason"] == ("model_length" if ending == "length" else "answer_recovery_tools")
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, run["id"])
        assert recorded.state["answer_recovery"] is True
        assert recorded.state["usage"]["calls"] == 3


def test_initial_length_failure_does_not_claim_to_have_read_sources(client, app):
    person = account(client, app)
    model = install(app, script(ModelError("length")))
    run = ask(client, person, None, "Read the latest news")
    assert run["status"] == "failed" and run["stop_reason"] == "model_length"
    assert len(model.calls) == 1 and run["sources"] == []
    assert run["answer"].startswith("I couldn't finish the answer within its limit.")


def test_detailed_answer_is_not_silently_cut_at_four_thousand_characters(client, app):
    person = account(client, app)
    text = "A detailed explanation of the available source evidence.\n" * 85 + "Important limitation: the event date remains unconfirmed."
    assert 4000 < len(text) < 8000
    install(app, script(say(text)))
    run = ask(client, person, None, "Explain the available evidence in detail")
    assert run["answer"] == text
    with app.state.sessions() as database:
        assert database.get(AgentRun, run["id"]).state["messages"][-1]["content"] == text


def test_answer_display_limit_never_silently_discards_the_ending(client, app):
    person = account(client, app)
    install(app, script(say("Detailed source context. " * 500)))
    run = ask(client, person, None, "Give the full context")
    assert len(run["answer"]) <= 8000
    assert run["answer"].endswith("This answer was shortened to the display limit; some details are not shown.")
    with app.state.sessions() as database:
        assert database.get(AgentRun, run["id"]).state["messages"][-1]["content"] == run["answer"]


def test_model_failures_end_the_run_honestly(client, app):
    person, space_id = solo(client, app)
    install(app, script(ModelError("token_limit")))
    run = ask(client, person, space_id, "hello")
    assert (run["status"], run["stop_reason"]) == ("failed", "model_token_limit") and "token budget" in run["answer"]
    app.state.agents.model = None
    refused = client.post("/v1/agent-runs", headers={**auth(person), "Idempotency-Key": "5f0f0d3e-1d8b-4a55-9a11-2b9c1f0e2222"},
                          json={"space_id": space_id, "message": "hello"})
    assert (refused.status_code, refused.json()["error"]["code"]) == (503, "AGENT_MODEL_UNAVAILABLE")


@pytest.mark.parametrize("helper", [False, True])
def test_a_model_answer_without_visible_text_is_not_reported_as_success(client, app, helper):
    person = account(client, app)
    empty_answer = say("\u200b\u0000")
    turns = [empty_answer]
    if helper:
        turns = [call("research", task="Review the current information"), empty_answer,
                 say("The research helper could not finish. Please try again.")]
    model = install(app, script(*turns))

    run = ask(client, person, MAIN_AGENT, "Review the current information")

    if helper:
        result = tool_results(model.calls[-1][0])[-1]
        assert result == {"error": "The research helper could not finish."}
        assert run["tool_calls"][-1]["status"] == "failed"
        assert run["tool_calls"][-1]["error_code"] == "helper_failed"
    else:
        assert (run["status"], run["stop_reason"]) == ("failed", "model_empty")
    assert run["answer"] != "Done." and run["approval"] is None
    assert len(model.calls) == len(turns)


def test_the_loop_stops_after_its_step_limit(client, app):
    person, space_id = solo(client, app)
    install(app, lambda messages, tools: call("list_tasks"))
    run = ask(client, person, space_id, "loop forever")
    assert (run["status"], run["stop_reason"]) == ("completed", "step_limit")


def test_a_model_tool_batch_stops_at_the_run_call_limit(client, app):
    person = account(client, app)
    batch = ModelTurn(content=None, tool_calls=tuple(call("read_memories").tool_calls[0] for _ in range(31)))
    model = install(app, script(batch, say("This extra turn must not run.")))

    run = ask(client, person, MAIN_AGENT, "Review my saved notes")

    assert len(run["tool_calls"]) == 30
    assert run["tool_calls"][-1]["sequence"] == 30
    assert (run["status"], run["stop_reason"]) == ("completed", "step_limit")
    assert run["finished_at"] is not None and run["approval"] is None
    assert len(model.calls) == 1


@pytest.mark.parametrize("path", ["automatic_reads", "research"])
def test_nested_reads_stop_cleanly_at_the_run_call_limit(client, app, path):
    person = account(client, app)
    requested = []

    def endpoint(request):
        requested.append(request.method)
        if request.method == "GET":
            return httpx.Response(200, json={"results": [{
                "title": "Transit report", "url": "https://news.example.org/transit", "snippet": "Service update.",
            }]})
        return httpx.Response(200, json={"results": [{"title": "Transit report", "text": "Service starts tomorrow."}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=100, transport=httpx.MockTransport(endpoint))
    if path == "automatic_reads":
        batch = ModelTurn(content=None, tool_calls=(
            *(call("read_memories").tool_calls[0] for _ in range(29)),
            call("web_search", query="transit report").tool_calls[0],
        ))
        turns = [batch]
    else:
        turns = [
            call("research", task="Review the transit reports"),
            ModelTurn(content=None, tool_calls=tuple(
                call("read_web_page", url=f"https://news.example.org/transit-{index}").tool_calls[0]
                for index in range(31)
            )),
        ]
    model = install(app, script(*turns, say("This extra turn must not run.")))

    run = ask(client, person, MAIN_AGENT, "Review the available information")

    assert (run["status"], run["stop_reason"]) == ("completed", "step_limit")
    assert len(run["tool_calls"]) == 30 and run["tool_calls"][-1]["sequence"] == 30
    assert run["finished_at"] is not None
    assert len(model.calls) == len(turns)
    assert requested == (["GET"] if path == "automatic_reads" else ["POST"] * 30)
    persisted = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(person)).json()["data"]
    assert persisted["status"] == "completed" and persisted["stop_reason"] == "step_limit"


@pytest.mark.parametrize("helper", [False, True])
@pytest.mark.parametrize("outcome", ["answer", "tool", "error"])
def test_model_results_at_the_run_deadline_are_discarded(client, app, helper, outcome):
    person, space_id = solo(client, app)
    late_text = "This model reply arrived after the deadline."

    def respond(messages, tools):
        if helper and len(model.calls) == 1:
            return call("research", task="Review the plans")
        with app.state.sessions() as database:
            run = database.scalars(select(AgentRun).where(AgentRun.status == "running")).one()
            app.state.clock.now = run.deadline_at
        if outcome == "error":
            return ModelError("unavailable")
        if outcome == "tool":
            return call("create_task", title=late_text)
        return say(late_text)

    model = install(app, respond)
    result = ask(client, person, space_id, "Review the current plans")
    assert (result["status"], result["stop_reason"]) == ("timed_out", "timed_out")
    assert result["approval"] is None and count(app, Task) == 0
    assert len(model.calls) == (2 if helper else 1)
    with app.state.sessions() as database:
        run = database.get(AgentRun, result["id"])
        assert late_text not in json.dumps(run.state) and late_text not in (run.answer or "")
        assert run.lease_owner is None and run.finished_at == app.state.clock()


@pytest.mark.parametrize("helper", [False, True])
def test_web_results_at_the_run_deadline_are_discarded(client, app, helper):
    person, space_id = solo(client, app)
    link = "https://news.example.org/slow-report"
    late_text = "This web result arrived after the deadline."
    turns = [call("read_web_page", url=link), say("This answer must not be reached.")]
    if helper:
        turns.insert(0, call("research", task="Read the report"))
    model = install(app, script(*turns))
    requested = []

    def endpoint(request):
        requested.append(request)
        with app.state.sessions() as database:
            run = database.scalars(select(AgentRun).where(AgentRun.status == "running")).one()
            app.state.clock.now = run.deadline_at
        return httpx.Response(200, json={"results": [{"url": link, "title": "Slow report", "text": late_text}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1, transport=httpx.MockTransport(endpoint))
    result = ask(client, person, space_id, "Read this report: " + link)
    assert (result["status"], result["stop_reason"]) == ("timed_out", "timed_out")
    assert result["sources"] == [] and result["approval"] is None
    assert len(requested) == 1 and len(model.calls) == (2 if helper else 1)
    with app.state.sessions() as database:
        run = database.get(AgentRun, result["id"])
        assert late_text not in json.dumps(run.state) and late_text not in (run.answer or "")
        assert app.state.agents.web_usage(database, run.account_id) == 1


@pytest.mark.parametrize("helper", [False, True])
@pytest.mark.parametrize("outcome", ["answer", "tool", "error"])
def test_model_turns_at_the_active_deadline_cannot_complete_or_propose_actions(client, app, helper, outcome):
    person = account(client, app)
    late_text = "This result arrived after the active deadline."
    model = install(app)

    def respond(messages, tools):
        if helper and len(model.calls) == 1:
            return call("research", task="Review the current information")
        app.state.clock.now += timedelta(minutes=6)
        if outcome == "error":
            return ModelError("length")
        if outcome == "tool":
            return call("create_page", name=late_text, handle="late-report", topic="hobbies")
        return say(late_text)

    model.brain = respond
    run = ask(client, person, MAIN_AGENT, "Review the current information")

    assert (run["status"], run["stop_reason"]) == ("timed_out", "timed_out")
    assert run["finished_at"] is not None and run["approval"] is None
    assert len(model.calls) == (2 if helper else 1)
    assert count(app, AgentApproval) == 0 and count(app, PublicPage) == 0
    with app.state.sessions() as database:
        stored = database.get(AgentRun, run["id"])
        assert late_text not in json.dumps(stored.state) and late_text not in stored.answer
        assert stored.lease_owner is None


@pytest.mark.parametrize("helper", [False, True])
def test_page_reads_at_the_active_deadline_are_discarded_without_refunding_the_attempt(client, app, helper):
    person = account(client, app)
    late_text = "Article content received after the deadline."
    requested = []

    def endpoint(request):
        requested.append(request)
        app.state.clock.now += timedelta(minutes=6)
        return httpx.Response(200, json={"results": [{"title": "Late report", "text": late_text}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1, transport=httpx.MockTransport(endpoint))
    turns = [call("read_web_page", url="https://news.example.org/late-report")]
    if helper:
        turns.insert(0, call("research", task="Read the report"))
    model = install(app, script(*turns, say("This extra turn must not run.")))

    run = ask(client, person, MAIN_AGENT, "Read the current report")

    assert (run["status"], run["stop_reason"]) == ("timed_out", "timed_out")
    assert run["sources"] == [] and run["tool_calls"] == []
    assert len(requested) == 1 and len(model.calls) == len(turns)
    with app.state.sessions() as database:
        stored = database.get(AgentRun, run["id"])
        assert late_text not in json.dumps(stored.state) and late_text not in stored.answer
        assert app.state.agents.web_usage(database, stored.account_id) == 1


def test_earlier_requests_are_history_but_not_for_chat_requests(client, app):
    person, space_id = solo(client, app)
    model = install(app)
    ask(client, person, space_id, "hello there")
    ask(client, person, space_id, "and again")
    roles = [(message["role"], message["content"]) for message in model.calls[-1][0][2:]]
    assert roles[0] == ("user", "hello there") and roles[-1] == ("user", "and again")


def test_only_the_asker_sees_and_decides_their_run_and_waiting_runs_expire(client, app):
    owner, space_id = solo(client, app)
    member = account(client, app, "runtime-member@example.test")
    admit(client, owner, space_id, member)
    run = ask(client, owner, space_id, "add a task to sweep")
    assert client.get(f"/v1/agent-runs/{run['id']}", headers=auth(member)).status_code == 404
    assert approve(client, member, run).status_code == 404
    app.state.clock.now += timedelta(minutes=31)
    expired = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(owner)).json()["data"]
    assert (expired["status"], expired["approval"]["status"]) == ("expired", "expired") and count(app, Task) == 0


def test_a_memory_is_saved_only_after_approval_and_secrets_are_refused(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("save_memory", content="my card number is 4111 1111 1111 1111"), say("I won't keep that.")))
    ask(client, person, space_id, "remember my card")
    assert "not allowed" in tool_results(model.calls[-1][0])[0]["error"].lower() and count(app, AgentMemory) == 0
    install(app)
    run = ask(client, person, space_id, "remember that the plumber comes on Fridays")
    assert count(app, AgentMemory) == 0
    assert approve(client, person, run).json()["data"]["answer"] == "I'll remember that." and count(app, AgentMemory) == 1


def test_cancel_stops_a_waiting_run(client, app):
    person, space_id = solo(client, app)
    run = ask(client, person, space_id, "add a task to sweep")
    stopped = client.post(f"/v1/agent-runs/{run['id']}/cancel", headers=auth(person), json={}).json()["data"]
    assert (stopped["status"], stopped["approval"]["status"]) == ("cancelled", "cancelled")


@pytest.mark.parametrize("automatic", [False, True])
@pytest.mark.parametrize("change, status, reason", [
    ("session", "failed", "session_ended"),
    ("switch", "cancelled", "agent_off"),
    ("deadline", "timed_out", "timed_out"),
])
def test_prepared_actions_recheck_access_and_deadline_before_approval(client, app, monkeypatch, automatic, change, status, reason):
    person, space_id = solo(client, app)
    model = install(app, script(call("create_task", title="This task must not be created")))
    agent = app.state.agents
    monkeypatch.setattr(agent, "submit", lambda run_id, token: None)
    queued = ask(client, person, space_id, "Add a task")
    with app.state.sessions.begin() as database:
        run = database.get(AgentRun, queued["id"])
        agent.remember(run, auto_approve=automatic)
    method_name = "apply_now" if automatic else "pause_for_approval"
    original = getattr(agent.runtime, method_name)

    def delayed_proposal(*args, **kwargs):
        with app.state.sessions.begin() as database:
            run = database.get(AgentRun, queued["id"])
            if change == "session":
                database.get(AccountSession, run.session_id).revoked_at = app.state.clock()
            elif change == "switch":
                database.get(Space, space_id).agent_enabled = False
            else:
                app.state.clock.now = run.deadline_at
        return original(*args, **kwargs)

    monkeypatch.setattr(agent.runtime, method_name, delayed_proposal)
    agent.runtime.advance(queued["id"], auth(person)["Authorization"].removeprefix("Bearer "))
    with app.state.sessions() as database:
        run = database.get(AgentRun, queued["id"])
        assert (run.status, run.stop_reason) == (status, reason)
        assert run.finished_at is not None and run.lease_owner is None
    assert len(model.calls) == 1
    assert count(app, AgentApproval) == 0 and count(app, Task) == 0


@pytest.mark.parametrize("phase", ["queued", "answer", "research_before", "research_answer"])
@pytest.mark.parametrize("outcome", ["answer", "tool", "error"])
@pytest.mark.parametrize("change, scoped, status, reason", [
    ("session", True, "failed", "session_ended"),
    ("session", False, "failed", "session_ended"),
    ("switch", True, "cancelled", "agent_off"),
    ("membership", True, "failed", "not_found"),
])
def test_model_turns_recheck_access_before_sending_and_after_answering(client, app, monkeypatch, phase, outcome, change, scoped, status, reason):
    owner, space_id = solo(client, app)
    person = owner
    if change == "membership":
        person = account(client, app, "revoked-runtime-member@example.test")
        admit(client, owner, space_id, person)
    model = install(app)
    monkeypatch.setattr(app.state.agents, "submit", lambda run_id, token: None)
    queued = ask(client, person, space_id if scoped else None, "Summarize the current plans")
    assert queued["status"] == "queued"
    late_text = "Private late answer that must not be saved."

    def invalidate():
        if change == "membership":
            roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
            entry = next(member for member in roster if member["account_id"] == person["user"]["id"])
            removed = client.post(
                f"/v1/spaces/{space_id}/members/{person['user']['id']}/remove", json={},
                headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": entry["etag"]},
            )
            assert removed.status_code == 200, removed.text
            return
        with app.state.sessions.begin() as database:
            run = database.get(AgentRun, queued["id"])
            if change == "session":
                database.get(AccountSession, run.session_id).revoked_at = app.state.clock()
            else:
                database.get(Space, space_id).agent_enabled = False

    def respond(messages, tools):
        if phase.startswith("research") and len(model.calls) == 1:
            return call("research", task="Review the current plans")
        if phase in ("answer", "research_answer"):
            invalidate()
        if outcome == "error":
            return ModelError("unavailable")
        if outcome == "tool":
            return call("create_task", title=late_text)
        return say(late_text)

    model.brain = respond
    if phase == "research_before":
        research = app.state.agents.runtime.research

        def interrupted_research(run_id, worker, context, task):
            invalidate()
            return research(run_id, worker, context, task)

        monkeypatch.setattr(app.state.agents.runtime, "research", interrupted_research)
    if phase == "queued":
        invalidate()
    app.state.agents.runtime.advance(queued["id"], auth(person)["Authorization"].removeprefix("Bearer "))

    with app.state.sessions() as database:
        run = database.get(AgentRun, queued["id"])
        assert (run.status, run.stop_reason) == (status, reason)
        assert late_text not in (run.answer or "") and late_text not in json.dumps(run.state)
        assert run.lease_owner is None and run.finished_at is not None
    assert len(model.calls) == {"queued": 0, "answer": 1, "research_before": 1, "research_answer": 2}[phase]
    assert count(app, AgentApproval) == 0 and count(app, Task) == 0


def test_runs_work_in_the_background(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("list_tasks"), say("Nothing to do.")))
    app.state.agents.background = True
    started = ask(client, person, space_id, "anything?")
    deadline = monotonic() + 20
    while True:
        run = client.get(f"/v1/agent-runs/{started['id']}", headers=auth(person)).json()["data"]
        if run["status"] == "completed" or monotonic() > deadline:
            break
        sleep(0.1)
    assert run["answer"] == "Nothing to do."
    with app.state.sessions() as database:
        assert database.get(AgentRun, started["id"]).lease_owner is None
