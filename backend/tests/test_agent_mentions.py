"""@agent in a chat message (DEC-046): the author's own agent request. Its answer is private (DEC-061) until the author
asks for everyone to see it, and even then only when everyone there may already see what it names."""

from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.modules.agents.models import AgentRun
from app.modules.identity.models import User
from app.modules.messaging.mentions import agent_identity, agent_request, wants_everyone
from app.modules.messaging.models import ConversationAgentMention, ConversationMessage
from app.modules.planning.models import Task
from tests.test_account_deletion import request_deletion, stored_text
from tests.agent_support import approve, rename
from tests.test_identity import account, auth
from tests.test_messaging import admit, messages, open_chat, send
from tests.test_space_agent_switch import turn_agent
from tests.test_space_directory import signed_in_again
from tests.test_spaces import create_space
from tests.test_tasks import create_task

PRIVATELY = "privately"


def mention(client, actor, conversation_id, body, key=None):
    response = send(client, actor, conversation_id, body, key)
    assert response.status_code == 201, response.text
    return response.json()["data"]


def agent_messages(client, actor, conversation_id):
    listed = messages(client, actor, conversation_id)
    assert listed.status_code == 200, listed.text
    return [item for item in listed.json()["data"] if item["from_agent"]]


def ask_again(client, actor, conversation_id, message_id):
    return client.post(f"/v1/conversations/{conversation_id}/messages/{message_id}/agent", headers=auth(actor), json={})


def share(client, actor, conversation_id, message_id):
    return client.post(f"/v1/conversations/{conversation_id}/messages/{message_id}/agent/share", headers=auth(actor), json={})


def run_of(client, actor, run_id):
    response = client.get(f"/v1/agent-runs/{run_id}", headers=auth(actor))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def counted(app, model, *conditions):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(model).where(*conditions))


def visible_tasks(app, space_id, account_id):
    with app.state.sessions() as database:
        return list(database.scalars(app.state.agents.tasks.visible_tasks(
            account_id, space_id,
        ).execution_options(populate_existing=True)))


def family(client, app):
    owner = account(client, app)
    member = account(client, app, "mention-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    return owner, member, space_id


def test_an_answer_is_private_until_the_asker_shares_it_with_everyone(client, app):
    owner, member, space_id = family(client, app)
    created = create_task(client, owner, space_id, title="Water the plants", due_date="2026-09-19")
    assert created.status_code == 201, created.text
    chat = open_chat(client, member, space_id).json()["data"]

    asked = mention(client, member, chat["id"], "@agent what's due today")
    assert asked["mine"] is True and asked["from_agent"] is False
    assert asked["agent_request"]["status"] == "private" and asked["agent_request"]["run_id"]
    [note] = agent_messages(client, owner, chat["id"])
    assert PRIVATELY in note["body"] and "Water the plants" not in note["body"] and note["edited_at"] is None

    # Only the asker can share it, and sharing again changes nothing.
    assert share(client, owner, chat["id"], asked["id"]).status_code == 404
    shared = share(client, member, chat["id"], asked["id"])
    assert shared.status_code == 200, shared.text
    assert shared.json()["data"]["id"] == asked["id"] and shared.json()["data"]["agent_request"]["status"] == "answered"
    assert share(client, member, chat["id"], asked["id"]).json()["data"] == shared.json()["data"]

    for reader in (owner, member):
        [reply] = agent_messages(client, reader, chat["id"])
        assert reply["id"] == note["id"] and reply["edited_at"] is not None
        assert reply["body"] == "1. Water the plants (due Sat 19 Sep 2026)"
        assert (reply["sender_name"], reply["mine"], reply["client_message_id"]) == ("Agent", False, None)
        assert reply["sender_account_id"] == agent_identity(space_id)
        assert reply["sender_account_id"] not in (owner["user"]["id"], member["user"]["id"])
        assert reply["reply_to"]["message_id"] == asked["id"] and reply["agent_request"] is None
    # Only the person who asked sees what became of their request, and only they can open it.
    owner_copy = next(item for item in messages(client, owner, chat["id"]).json()["data"] if item["id"] == asked["id"])
    assert owner_copy["agent_request"] is None and owner_copy["mine"] is False
    run = run_of(client, member, asked["agent_request"]["run_id"])
    assert (run["message"], run["status"], run["space_id"]) == ("what's due today", "completed", space_id)
    assert client.get(f"/v1/agent-runs/{run['id']}", headers=auth(owner)).status_code == 404
    # Another Space's agent is another identity.
    other = create_space(client, owner, name="Second family").json()["data"]["id"]
    assert agent_identity(other) != agent_identity(space_id) and UUID(agent_identity(space_id)).version == 5


def test_an_answer_not_everyone_may_see_stays_private_even_when_asked_to_share(client, app):
    owner = account(client, app)
    rename(client, owner, "Ravi Kumar")
    member = account(client, app, "mention-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    # Made before the member joined, so the member never sees it (history starts at their admission).
    hidden = create_task(client, owner, space_id, title="Birthday surprise", due_date="2026-09-19")
    assert hidden.status_code == 201, hidden.text
    admit(client, owner, space_id, member)
    chat = open_chat(client, owner, space_id).json()["data"]

    # Asking for everyone to see it does not show what not everyone may see, and neither does Share.
    asked = mention(client, owner, chat["id"], "@agent what's due today, share it with everyone")
    assert asked["agent_request"]["status"] == "private"
    [reply] = agent_messages(client, member, chat["id"])
    assert PRIVATELY in reply["body"] and "Ravi Kumar" in reply["body"] and "Birthday surprise" not in reply["body"]
    refused = share(client, owner, chat["id"], asked["id"])
    assert (refused.status_code, refused.json()["error"]["code"]) == (409, "AGENT_ANSWER_NOT_SHARED")
    with app.state.sessions() as database:
        stored = database.get(ConversationMessage, reply["id"])
        assert "Birthday surprise" not in app.state.messaging.cipher.open(stored.conversation_id, stored.id, stored.body_cipher)
    assert run_of(client, owner, asked["agent_request"]["run_id"])["answer"] == "1. Birthday surprise (due Sat 19 Sep 2026)"
    unchanged = messages(client, owner, chat["id"]).json()["data"]
    assert next(item for item in unchanged if item["id"] == asked["id"])["agent_request"]["status"] == "private"

    # Alone in a solo Space, the asker is everyone who reads the chat, and the answer is still private until shared.
    solo = create_space(client, owner, name="Ravi solo", space_type="solo").json()["data"]["id"]
    create_task(client, owner, solo, title="Renew the passport", due_date="2026-09-19")
    alone = open_chat(client, owner, solo).json()["data"]
    asked_alone = mention(client, owner, alone["id"], "@agent what's due today")
    assert asked_alone["agent_request"]["status"] == "private"
    assert share(client, owner, alone["id"], asked_alone["id"]).json()["data"]["agent_request"]["status"] == "answered"
    assert agent_messages(client, owner, alone["id"])[0]["body"] == "1. Renew the passport (due Sat 19 Sep 2026)"


def test_personal_answers_stay_private_even_in_a_solo_space(client, app):
    person = account(client, app)
    solo = create_space(client, person, name="My corner", space_type="solo").json()["data"]["id"]
    chat = open_chat(client, person, solo).json()["data"]
    saved = mention(client, person, chat["id"], "@agent remember that the plumber comes on Fridays")
    assert saved["agent_request"]["status"] == "waiting"
    assert approve(client, person, run_of(client, person, saved["agent_request"]["run_id"])).status_code == 200
    listed = mention(client, person, chat["id"], "@agent what do you remember")
    assert listed["agent_request"]["status"] == "private"
    refused = share(client, person, chat["id"], listed["id"])
    assert (refused.status_code, refused.json()["error"]["code"]) == (409, "AGENT_ANSWER_PERSONAL")
    bodies = [item["body"] for item in agent_messages(client, person, chat["id"])]
    assert len(bodies) == 2 and not any("plumber" in body for body in bodies)


def test_changes_wait_for_the_askers_own_approval_in_the_agent_screen(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    asked = mention(client, member, chat["id"], "@agent add a task to buy milk tomorrow")
    assert asked["agent_request"]["status"] == "waiting"
    [reply] = agent_messages(client, owner, chat["id"])
    assert "I prepared this for you to approve: Create this task." in reply["body"] and "milk" not in reply["body"]
    assert counted(app, Task) == 0
    run = run_of(client, member, asked["agent_request"]["run_id"])
    assert run["status"] == "waiting_for_approval" and run["approval"]["tool_name"] == "tasks.create"
    # Nobody else can decide it, and deciding it is the existing approval.
    other = client.post(f"/v1/agent-approvals/{run['approval']['id']}/approve", json={},
                        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": run["approval"]["etag"]})
    assert other.status_code == 404
    done = approve(client, member, run)
    assert done.status_code == 200 and done.json()["data"]["status"] == "completed"
    assert counted(app, Task) == 1


def test_the_asker_approves_in_the_chat_without_opening_the_agent_screen(client, app):
    # Live on 2026-10-05: the reply said "Open your Agent screen", so a chat could start a change but not finish one.
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    asked = mention(client, member, chat["id"], "@agent add a task to buy milk tomorrow")
    assert asked["agent_request"]["status"] == "waiting" and counted(app, Task) == 0
    [first] = agent_messages(client, member, chat["id"])
    assert "private request" in first["body"].casefold() and "nothing changes until you approve" in first["body"].casefold()

    mention(client, member, chat["id"], "@agent yes")
    run = run_of(client, member, asked["agent_request"]["run_id"])
    assert run["status"] == "waiting_for_approval" and counted(app, Task) == 0
    confirmed = approve(client, member, run)
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["status"] == "completed"
    assert [task.title for task in visible_tasks(app, space_id, member["user"]["id"])] == ["buy milk tomorrow"]
    assert counted(app, Task) == 1


def test_the_asker_rejects_in_the_chat_and_nothing_changes(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    asked = mention(client, member, chat["id"], "@agent add a task to buy milk tomorrow")
    mention(client, member, chat["id"], "@agent no")
    run = run_of(client, member, asked["agent_request"]["run_id"])
    assert run["status"] == "waiting_for_approval"
    response = client.post(f"/v1/agent-approvals/{run['approval']['id']}/reject", json={},
                           headers={**auth(member), "If-Match": run["approval"]["etag"]})
    assert response.status_code == 200
    run = response.json()["data"]
    # The agent hears the rejection and answers; nothing was changed.
    assert run["status"] == "completed" and run["approval"]["status"] == "rejected"
    assert counted(app, Task) == 0


def test_another_members_yes_never_decides_someone_elses_request(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    asked = mention(client, member, chat["id"], "@agent add a task to buy milk tomorrow")
    mention(client, owner, chat["id"], "@agent yes")
    run = run_of(client, member, asked["agent_request"]["run_id"])
    assert run["status"] == "waiting_for_approval" and counted(app, Task) == 0


def test_a_question_is_answered_in_the_chat(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    asked = mention(client, member, chat["id"], "@agent add a task tomorrow")
    assert asked["agent_request"]["status"] == "waiting"
    waiting = run_of(client, member, asked["agent_request"]["run_id"])
    assert waiting["status"] == "waiting_for_user" and waiting["question"]

    response = client.post(f"/v1/agent-runs/{waiting['id']}/resume", headers=auth(member),
                           json={"question_id": waiting["question"]["id"], "answer": "buy milk and bread"})
    assert response.status_code == 200
    run = run_of(client, member, waiting["id"])
    assert run["status"] == "waiting_for_approval"
    fields = {item["label"]: item["value"] for item in run["approval"]["fields"]}
    assert fields["Title"] == "buy milk and bread"


def test_retries_and_asking_again_never_repeat_the_request_or_the_reply(client, app, monkeypatch):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    key = str(uuid4())
    first = mention(client, member, chat["id"], "@agent help", key)
    again = mention(client, member, chat["id"], "@agent help", key)
    assert again == first and first["agent_request"]["status"] == "private"
    assert ask_again(client, member, chat["id"], first["id"]).json()["data"] == first
    assert ask_again(client, owner, chat["id"], first["id"]).status_code == 404
    plain = mention(client, member, chat["id"], "Dinner at eight")
    assert plain["agent_request"] is None and ask_again(client, member, chat["id"], plain["id"]).status_code == 404
    assert len(agent_messages(client, owner, chat["id"])) == 1
    assert counted(app, AgentRun) == 1

    # A failure after the message is saved leaves it sent; asking again answers it once.
    original = app.state.mentions.reply
    calls = []

    def broken(*arguments):
        calls.append(arguments)
        if len(calls) == 1:
            raise RuntimeError("Synthetic failure after the message was saved")
        return original(*arguments)

    monkeypatch.setattr(app.state.mentions, "reply", broken)
    failed = mention(client, member, chat["id"], "@agent what's due today")
    assert failed["agent_request"]["status"] == "failed" and failed["status"] == "sent"
    answered = ask_again(client, member, chat["id"], failed["id"])
    assert answered.status_code == 200, answered.text
    assert answered.json()["data"]["agent_request"]["status"] == "private"
    assert ask_again(client, member, chat["id"], failed["id"]).json()["data"]["agent_request"]["status"] == "private"
    assert len(agent_messages(client, owner, chat["id"])) == 2
    assert counted(app, AgentRun) == 2


def test_an_agent_turned_off_or_a_long_request_gets_no_reply(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, member, space_id).json()["data"]
    turn_agent(client, owner, space_id, False)
    off = mention(client, member, chat["id"], "@agent what's due today")
    assert off["agent_request"] == {"status": "off", "run_id": None}
    # Turning it on again does not bring back a stopped request (DEC-028).
    turn_agent(client, owner, space_id, True)
    assert ask_again(client, member, chat["id"], off["id"]).json()["data"]["agent_request"]["status"] == "off"
    long = mention(client, member, chat["id"], "@agent remember " + "a" * 600)
    assert long["agent_request"] == {"status": "too_long", "run_id": None}
    assert agent_messages(client, owner, chat["id"]) == [] and counted(app, AgentRun) == 0


@pytest.mark.parametrize("text, asks", [
    ("@agent help", True), ("@Agent, help", True), ("Thanks @agent!", True), ("hey\n@agent\nhelp", True),
    ("write to sam@agent.example", False), ("@agents meet at six", False), ("the agent can help", False),
])
def test_only_the_word_at_agent_asks_the_agent(client, app, text, asks):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    sent = mention(client, owner, chat["id"], text)
    assert (sent["agent_request"] is not None) is asks
    assert counted(app, AgentRun) == int(asks)


@pytest.mark.parametrize("request_text, everyone", [
    ("what's due today, share it with everyone", True), ("show this message for all family members", True),
    ("post the plan to the family", True), ("tell everyone dinner is at eight", True), ("Share with the group", True),
    ("what's due today", False), ("show the family calendar", False), ("show all my tasks", False),
    ("what did everyone say", False), ("share", False),
])
def test_only_a_request_to_show_it_to_everyone_shares_the_answer(request_text, everyone):
    assert wants_everyone(request_text) is everyone


def test_the_request_is_the_message_without_the_mention():
    assert agent_request("@agent, what's due today?") == "what's due today?"
    assert agent_request("Hi @Agent\nlist my tasks") == "Hi list my tasks"
    assert agent_request("@agent") == "help"
    assert agent_request("@agent \u200dwhat's due today") == "what's due today"


@pytest.mark.parametrize("space_type", ["family", "couple", "group"])
def test_every_space_type_gets_replies_nobody_can_change(client, app, space_type):
    owner = account(client, app)
    member = account(client, app, "mention-member@example.test")
    body = {"name": "Mention test", "space_type": space_type}
    if space_type == "group":
        body.update(description="A group for the mention test.", visibility="private")
    created = client.post("/v1/spaces", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json=body)
    assert created.status_code == 201, created.text
    space_id = created.json()["data"]["id"]
    admit(client, owner, space_id, member)
    chat = open_chat(client, member, space_id).json()["data"]
    asked = mention(client, member, chat["id"], "@agent help")
    assert asked["agent_request"]["status"] == "private"
    [reply] = agent_messages(client, owner, chat["id"])
    for actor in (member, owner):
        edit = client.post(f"/v1/conversations/{chat['id']}/messages/{reply['id']}/edit", headers=auth(actor), json={"body": "Changed"})
        assert (edit.status_code, edit.json()["error"]["code"]) == (403, "AGENT_MESSAGE")
        removed = client.post(f"/v1/conversations/{chat['id']}/messages/{reply['id']}/delete", headers=auth(actor), json={})
        assert (removed.status_code, removed.json()["error"]["code"]) == (403, "AGENT_MESSAGE")
    reacted = client.post(f"/v1/conversations/{chat['id']}/messages/{reply['id']}/reactions", headers=auth(owner),
                          json={"reaction": "thanks", "on": True})
    assert reacted.status_code == 200 and reacted.json()["data"]["from_agent"] is True
    answer = client.post(f"/v1/conversations/{chat['id']}/messages", headers={**auth(owner), "Idempotency-Key": str(uuid4())},
                         json={"body": "Thanks", "reply_to_message_id": reply["id"]})
    assert answer.status_code == 201 and answer.json()["data"]["reply_to"]["sender_name"] == "Agent"


def test_a_direct_chat_shares_only_what_both_people_see(client, app):
    owner, member, space_id = family(client, app)
    create_task(client, owner, space_id, title="Fix the gate", due_date="2026-09-19")
    direct = open_chat(client, member, space_id, owner["user"]["id"]).json()["data"]
    # Asked in the request itself: no Share needed.
    asked = mention(client, member, direct["id"], "@agent what's due today, show it to everyone")
    assert asked["agent_request"]["status"] == "answered"
    assert [item["body"] for item in agent_messages(client, owner, direct["id"])] == ["1. Fix the gate (due Sat 19 Sep 2026)"]


def test_deleting_the_account_erases_its_requests_and_the_agents_replies(client, app):
    host = account(client, app, "mention-host@example.test")
    asker = account(client, app)
    rename(client, asker, "Alexandria Quill")
    space_id = create_space(client, host, name="Host family").json()["data"]["id"]
    admit(client, host, space_id, asker)
    chat = open_chat(client, asker, space_id).json()["data"]
    asked = mention(client, asker, chat["id"], "@agent add a task to call grandma")
    assert asked["agent_request"]["status"] == "waiting"
    assert "Alexandria Quill" in stored_text(app)
    assert request_deletion(client, asker).status_code == 202
    app.state.clock.now += timedelta(days=7, minutes=1)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    assert "Alexandria Quill" not in stored_text(app)
    assert counted(app, ConversationAgentMention) == 0 and counted(app, AgentRun) == 0
    history = messages(client, signed_in_again(client, host), chat["id"]).json()["data"]
    assert [(item["status"], item["from_agent"]) for item in history] == [("deleted", False), ("deleted", False)]
