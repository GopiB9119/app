"""Space agent identities and deterministic routing (DEC-049, T215): Chapter 12 section 16.9."""

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.errors import DomainError
from app.modules.agents import registry
from app.modules.agents.models import AgentInstance, AgentRun
from app.modules.agents.registry import DEFINITIONS, MAIN, MAIN_TOOLS, SPACE_TOOLS, VERSION, agent_identity
from app.modules.agents.runtime import scopes
from app.modules.agents.toolkit import TOOLS
from app.modules.spaces.models import Space
from tests import test_migrations
from tests.test_agent_mentions import agent_messages, family, mention
from tests.agent_support import ask
from tests.test_identity import account, auth
from tests.test_messaging import open_chat
from tests.test_space_agent_switch import start, turn_agent
from tests.test_space_directory import group
from tests.test_spaces import create_space

SPACE_TYPES = ["family", "couple", "solo", "group"]
HELP = "Hi! I can help with tasks, events, reminders and more."


def new_space(client, owner, space_type):
    created = group(client, owner, visibility="private") if space_type == "group" else create_space(client, owner, space_type=space_type)
    assert created.status_code == 201, created.text
    return created.json()["data"]["id"]


def bindings(app, space_id):
    with app.state.sessions() as database:
        return [
            (row.id, row.definition_key, row.definition_version, row.created_at)
            for row in database.scalars(select(AgentInstance).where(AgentInstance.space_id == space_id))
        ]


def stored_run(app, run_id):
    with app.state.sessions() as database:
        run = database.get(AgentRun, run_id)
        return run.agent_instance_id, dict(run.state)


def execute(app, statement, **values):
    with app.state.engine.begin() as connection:
        return connection.execute(text(statement), values)


def count(app, model):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(model))


@pytest.mark.parametrize("space_type", SPACE_TYPES)
def test_every_new_space_gets_one_binding_under_its_own_type(client, app, space_type):
    owner = account(client, app)
    space_id = new_space(client, owner, space_type)
    with app.state.sessions() as database:
        created_at = database.get(Space, space_id).created_at
    # The identifier is the one chat readers already see on the agent's replies (DEC-046), so no reply changes sender.
    assert bindings(app, space_id) == [(agent_identity(space_id), space_type, VERSION, created_at)]
    assert count(app, AgentInstance) == 1


def test_retrying_the_creation_keeps_the_one_binding(client, app):
    owner = account(client, app)
    key = str(uuid4())
    first = create_space(client, owner, key=key)
    again = create_space(client, owner, key=key)
    assert first.status_code == again.status_code == 201 and first.json()["data"] == again.json()["data"]
    assert len(bindings(app, first.json()["data"]["id"])) == 1 and count(app, AgentInstance) == 1


def test_the_space_and_its_binding_are_saved_together_or_not_at_all(client, app, monkeypatch):
    owner = account(client, app)
    from app.modules.spaces import service as spaces_service

    def fails_after_saving(database, *arguments):
        registry.provision(database, *arguments)
        raise DomainError(409, "BOOM", "The binding was saved, then the creation failed.")

    monkeypatch.setattr(spaces_service, "provision_space_agent", fails_after_saving)
    assert create_space(client, owner).status_code == 409
    assert count(app, Space) == 0 and count(app, AgentInstance) == 0


def test_the_database_refuses_a_binding_of_the_wrong_type_a_second_one_and_an_unknown_definition(client, app):
    owner = account(client, app)
    space_id = new_space(client, owner, "family")
    [(identity, *_rest)] = bindings(app, space_id)
    insert = ("INSERT INTO agent_instances (id, space_id, definition_key, definition_version, created_at) "
              "VALUES (:id, :space_id, :key, :version, now())")
    # A second binding for the same Space.
    with pytest.raises(IntegrityError, match="uq_agent_instance_space"):
        execute(app, insert, id=str(uuid4()), space_id=space_id, key="family", version=1)
    execute(app, "DELETE FROM agent_instances WHERE id = :id", id=identity)
    # Filed under another Space type, an unknown definition and a version that is not positive.
    with pytest.raises(IntegrityError, match="fk_agent_instance_space_type"):
        execute(app, insert, id=identity, space_id=space_id, key="group", version=1)
    with pytest.raises(IntegrityError, match="ck_agent_instance_definition"):
        execute(app, insert, id=identity, space_id=space_id, key="personal", version=1)
    with pytest.raises(IntegrityError, match="ck_agent_instance_version"):
        execute(app, insert, id=identity, space_id=space_id, key="family", version=0)
    assert bindings(app, space_id) == []


@pytest.mark.parametrize("space_type", SPACE_TYPES)
def test_a_run_is_routed_to_its_spaces_agent_and_the_answer_is_unchanged(client, app, space_type):
    owner = account(client, app)
    space_id = new_space(client, owner, space_type)
    run = ask(client, owner, space_id, "help")
    assert run["answer"] == HELP and run["outcome"] == "answered"
    # The route is internal: it appears in no response.
    assert "agent" not in run and "agent_instance_id" not in run
    linked, state = stored_run(app, run["id"])
    assert linked == agent_identity(space_id)
    assert state["agent"] == {"instance": agent_identity(space_id), "definition": space_type, "version": VERSION}


def test_a_run_can_only_name_the_agent_of_its_own_space(client, app, monkeypatch):
    owner = account(client, app)
    here = new_space(client, owner, "family")
    elsewhere = new_space(client, owner, "family")
    run = ask(client, owner, here, "help")
    with pytest.raises(IntegrityError, match="fk_agent_run_instance"):
        execute(app, "UPDATE agent_runs SET agent_instance_id = :other WHERE id = :run", other=agent_identity(elsewhere), run=run["id"])
    # The same refusal stops a routing defect in the real request path, not only a hand-written statement.
    wrong = registry.AgentRoute(instance_id=agent_identity(elsewhere), space_id=elsewhere, definition=DEFINITIONS["family"])
    from app.modules.agents import service as agent_service

    monkeypatch.setattr(agent_service, "route", lambda database, space_id: wrong)
    refused = start(client, owner, here, "list my tasks")
    assert refused.status_code == 503
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AgentRun).where(AgentRun.space_id == here)) == 1


def test_a_space_from_before_bindings_gets_the_same_identity_when_first_asked(client, app):
    owner = account(client, app)
    space_id = new_space(client, owner, "couple")
    execute(app, "DELETE FROM agent_instances WHERE space_id = :space_id", space_id=space_id)
    assert bindings(app, space_id) == []
    run = ask(client, owner, space_id, "help")
    [(identity, key, version, _created)] = bindings(app, space_id)
    assert (identity, key, version) == (agent_identity(space_id), "couple", VERSION)
    assert stored_run(app, run["id"])[0] == identity


def test_nothing_is_bound_for_someone_who_cannot_ask(client, app):
    owner = account(client, app)
    stranger = account(client, app, "agent-registry-stranger@example.test")
    space_id = new_space(client, owner, "family")
    execute(app, "DELETE FROM agent_instances WHERE space_id = :space_id", space_id=space_id)
    denied = start(client, stranger, space_id, "help")
    assert denied.status_code == 404
    assert bindings(app, space_id) == [] and count(app, AgentRun) == 0


def test_two_first_requests_at_once_share_one_binding(client, app):
    owner, member, space_id = family(client, app)
    execute(app, "DELETE FROM agent_instances WHERE space_id = :space_id", space_id=space_id)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda actor: start(client, actor, space_id, "help"), (owner, member)))
    assert [response.status_code for response in responses] == [201, 201]
    assert len(bindings(app, space_id)) == 1
    assert {stored_run(app, response.json()["data"]["id"])[0] for response in responses} == {agent_identity(space_id)}


def test_an_unknown_or_newer_definition_is_not_served(client, app):
    owner = account(client, app)
    space_id = new_space(client, owner, "family")
    execute(app, "UPDATE agent_instances SET definition_version = :version WHERE space_id = :space_id", version=VERSION + 1, space_id=space_id)
    refused = start(client, owner, space_id, "help")
    assert (refused.status_code, refused.json()["error"]["code"]) == (503, "SERVICE_UNAVAILABLE")
    assert count(app, AgentRun) == 0


def test_the_binding_keeps_its_identity_when_the_space_is_renamed_or_the_agent_is_switched(client, app):
    owner = account(client, app)
    space_id = new_space(client, owner, "family")
    before = bindings(app, space_id)
    review = client.get(f"/v1/spaces/{space_id}/settings", headers=auth(owner)).json()["data"]
    renamed = client.patch(f"/v1/spaces/{space_id}/settings", json={"name": "Renamed family"},
                           headers={**auth(owner), "If-Match": review["etag"], "Idempotency-Key": str(uuid4())})
    assert renamed.status_code == 200, renamed.text
    turn_agent(client, owner, space_id, False)
    off = start(client, owner, space_id, "help")
    assert (off.status_code, off.json()["error"]["code"]) == (409, "AGENT_OFF")
    turn_agent(client, owner, space_id, True)
    assert ask(client, owner, space_id, "help")["answer"] == HELP
    # Availability follows the Space's own switch; the binding is neither replaced nor switched.
    assert bindings(app, space_id) == before


def test_the_agents_chat_replies_come_from_the_binding(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    asked = mention(client, member, chat["id"], "@agent help")
    assert asked["agent_request"]["status"] == "private"
    [reply] = agent_messages(client, owner, chat["id"])
    [(identity, *_rest)] = bindings(app, space_id)
    assert reply["sender_account_id"] == identity == agent_identity(space_id)
    # The mention's own run is routed through the same binding.
    assert stored_run(app, asked["agent_request"]["run_id"])[0] == identity


def test_the_identity_formula_is_the_one_replies_already_use():
    # A fixed vector from DEC-046's formula: changing the namespace or the prefix would change every stored sender.
    assert agent_identity("00000000-0000-0000-0000-000000000001") == "109cc1fe-b560-56e4-95da-7eb69d0f0bda"


def test_provisioning_twice_is_harmless(client, app):
    owner = account(client, app)
    space_id = new_space(client, owner, "solo")
    with app.state.sessions.begin() as database:
        created_at = database.get(Space, space_id).created_at
        registry.provision(database, space_id, "solo", created_at)
        registry.provision(database, space_id, "solo", created_at)
    assert [item[:3] for item in bindings(app, space_id)] == [(agent_identity(space_id), "solo", VERSION)]
    with pytest.raises(DomainError) as refused:
        with app.state.sessions.begin() as database:
            registry.provision(database, space_id, "personal", created_at)
    assert refused.value.status == 503


def test_definitions_are_fixed_and_name_every_tool_on_purpose():
    assert set(DEFINITIONS) == set(SPACE_TYPES)
    assert len(SPACE_TOOLS) == len(set(SPACE_TOOLS)) and len(MAIN_TOOLS) == len(set(MAIN_TOOLS))
    # A tool added to the registry reaches no scope until it is also added to a definition on purpose.
    named = {name for tool in TOOLS.values() if tool.effect != "control" for name in scopes(tool)}
    assert (set(SPACE_TOOLS) | set(MAIN_TOOLS)) - {"agent.spaces.handoff"} == named
    # DEC-060: a Space's agent never acts in public, and the Main Agent never reads or changes inside a Space.
    assert not any(name.startswith("community.") for name in SPACE_TOOLS)
    inside = ("family.", "tasks.", "events.", "reminders.", "documents.", "space.", "spaces.")
    assert not any(name.startswith(inside) for name in MAIN_TOOLS)
    assert (MAIN.key, MAIN.version, MAIN.tools) == ("main", 1, frozenset(MAIN_TOOLS))
    for key, definition in DEFINITIONS.items():
        # Version 5 (DEC-060) is the Space agent's list; a changed list needs a new version and a migration.
        assert (definition.key, definition.version, definition.tools) == (key, 5, frozenset(SPACE_TOOLS))
        assert definition.label.endswith(" Agent") and definition.space_type == key


def test_existing_spaces_and_runs_receive_the_binding_when_the_database_is_upgraded(client, app):
    owner = account(client, app)
    spaces = {space_type: new_space(client, owner, space_type) for space_type in SPACE_TYPES}
    run = ask(client, owner, spaces["family"], "help")
    history = client.get("/v1/agent-runs", params={"space_id": spaces["family"]}, headers=auth(owner)).json()
    columns = ("id", "space_id", "account_id", "admission_id", "request_key", "request_digest", "status", "answer", "version")
    with app.state.sessions() as database:
        before = {name: getattr(database.get(AgentRun, run["id"]), name) for name in columns}
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0048")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT to_regclass('agent_instances')")) is None
            assert connection.scalar(text("SELECT count(*) FROM agent_runs")) == 1
    finally:
        command.upgrade(config, "head")
    for space_type, space_id in spaces.items():
        assert [item[:3] for item in bindings(app, space_id)] == [(agent_identity(space_id), space_type, VERSION)]
    assert stored_run(app, run["id"])[0] == agent_identity(spaces["family"])
    with app.state.sessions() as database:
        assert {name: getattr(database.get(AgentRun, run["id"]), name) for name in columns} == before
    assert client.get("/v1/agent-runs", params={"space_id": spaces["family"]}, headers=auth(owner)).json()["data"] == history["data"]
    test_migrations.test_migrated_schema_matches_models(app)
