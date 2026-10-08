from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.modules.identity.models import OutboxEvent
from app.modules.messaging.models import ConversationAgentMention, ConversationMessage
from app.modules.spaces.models import SpaceAuditEvent
from tests.test_identity import account, auth
from tests.test_live_updates import Hints, leave_or_remove
from tests.test_messaging import admit, expire_while_waiting, family, open_chat, send
from tests.test_spaces import create_space


def typing(client, actor, chat_id, **overrides):
    body = {
        "client_id": str(uuid4()), "sequence": 1, "is_typing": True,
        "mentioned_account_ids": [], "mentions_agent": False, **overrides,
    }
    return client.post(f"/v1/conversations/{chat_id}/typing", headers=auth(actor), json=body)


@pytest.mark.parametrize("space_type", ["family", "couple", "group"])
def test_typing_is_ephemeral_scoped_and_does_not_send_messages_or_ask_the_agent(client, app, space_type):
    owner = account(client, app)
    member = account(client, app, "typing-member@example.test")
    outsider = account(client, app, "typing-outsider@example.test")
    space_id = create_space(client, owner, space_type=space_type).json()["data"]["id"]
    admit(client, owner, space_id, member)
    chat = open_chat(client, owner, space_id).json()["data"]
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner))
    assert roster.status_code == 200, roster.text
    assert {person["account_id"] for person in roster.json()["data"]} == {owner["user"]["id"], member["user"]["id"]}
    hints = [Hints(app, person) for person in (owner, member, outsider)]
    tables = (ConversationMessage, ConversationAgentMention, SpaceAuditEvent, OutboxEvent)

    def counts():
        with app.state.sessions() as database:
            return [database.scalar(select(func.count()).select_from(table)) for table in tables]

    before = counts()
    source = str(uuid4())
    for sequence, context in enumerate([
        {}, {"mentioned_account_ids": [member["user"]["id"]]}, {"mentions_agent": True},
        {"mentions_agent": True, "mentioned_account_ids": [member["user"]["id"]]},
        {"is_typing": False},
    ], start=1):
        response = typing(client, owner, chat["id"], client_id=source, sequence=sequence, **context)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        event = response.json()["data"]
        assert event == {
            "kind": "typing", "conversation_id": chat["id"], "space_id": space_id,
            "account_id": owner["user"]["id"], "client_id": source, "sequence": sequence,
            "is_typing": context.get("is_typing", True),
            "mentioned_account_ids": context.get("mentioned_account_ids", []),
            "mentions_agent": context.get("mentions_agent", False),
            "expires_at": event["expires_at"],
        }
        expiry = datetime.fromisoformat(event["expires_at"].replace("Z", "+00:00"))
        assert expiry == app.state.clock() + timedelta(seconds=8 if event["is_typing"] else 0)
        assert hints[0].since_last() == []
        assert hints[1].since_last() == [event]
        assert hints[2].since_last() == []
    assert counts() == before
    assert client.get(f"/v1/conversations/{chat['id']}", headers=auth(owner)).json()["data"] == chat
    late_subscriber = Hints(app, member)
    assert late_subscriber.since_last() == [], "Typing is not stored or replayed to new streams."


def test_typing_enforces_membership_direct_participants_and_mention_targets(client, app):
    owner, member, space_id = family(client, app)
    third = account(client, app, "typing-third@example.test")
    outsider = account(client, app, "typing-outsider@example.test")
    admit(client, owner, space_id, third)
    direct = open_chat(client, owner, space_id, member["user"]["id"]).json()["data"]
    chat = open_chat(client, owner, space_id).json()["data"]
    hints = [Hints(app, person) for person in (owner, member, third, outsider)]
    anonymous = client.post(f"/v1/conversations/{chat['id']}/typing", json={
        "client_id": str(uuid4()), "sequence": 1, "is_typing": True,
    })
    assert anonymous.status_code == 401
    assert typing(client, third, direct["id"]).status_code == 404
    assert typing(client, outsider, chat["id"]).status_code == 404
    assert typing(client, owner, str(uuid4())).status_code == 404
    for conversation, target in [(direct, third), (chat, outsider)]:
        refused = typing(client, owner, conversation["id"], mentioned_account_ids=[target["user"]["id"]])
        assert refused.status_code == 409
        assert refused.json()["error"]["code"] == "TYPING_TARGET_UNAVAILABLE"
    assert all(collected.since_last() == [] for collected in hints)
    accepted = typing(client, owner, direct["id"], mentioned_account_ids=[member["user"]["id"]])
    assert accepted.status_code == 200, accepted.text
    assert hints[1].since_last() == [accepted.json()["data"]]
    assert all(collected.since_last() == [] for collected in (hints[0], hints[2], hints[3]))
    assert leave_or_remove(client, owner, space_id, member, "remove").status_code == 200
    for collected in hints:
        collected.since_last()
    assert typing(client, member, chat["id"]).status_code == 404
    assert typing(client, owner, direct["id"]).json()["error"]["code"] == "CONVERSATION_READ_ONLY"
    assert typing(client, owner, chat["id"], mentioned_account_ids=[member["user"]["id"]]).status_code == 409
    assert typing(client, owner, chat["id"]).status_code == 200
    assert hints[1].since_last() == [], "A removed member receives no later typing metadata."


@pytest.mark.parametrize("invalid", [
    {"body": "Never transmit this draft"},
    {"account_id": str(uuid4())},
    {"is_typing": "true"},
    {"is_typing": False, "mentions_agent": True},
    {"is_typing": False, "mentioned_account_ids": [str(uuid4())]},
    {"mentioned_account_ids": [str(uuid4()) for _ in range(6)]},
    {"mentioned_account_ids": ["00000000-0000-4000-8000-000000000001"] * 2},
    {"client_id": "not-a-uuid"},
    {"sequence": 0},
    {"sequence": True},
])
def test_typing_rejects_drafts_spoofed_senders_and_invalid_state(client, app, invalid):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    assert typing(client, owner, chat["id"], **invalid).status_code == 422


def test_typing_rate_limit_is_shared_between_conversations_and_does_not_block_messages(client, app, monkeypatch):
    from app.modules.messaging import service

    assert service.MAX_TYPING_UPDATES_PER_MINUTE == 120
    monkeypatch.setattr(service, "MAX_TYPING_UPDATES_PER_MINUTE", 2)
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    direct = open_chat(client, owner, space_id, member["user"]["id"]).json()["data"]
    hints = Hints(app, member)
    assert typing(client, owner, chat["id"]).status_code == 200
    assert typing(client, owner, direct["id"]).status_code == 200
    assert len(hints.since_last()) == 2
    refused = typing(client, owner, chat["id"])
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "TYPING_RATE_LIMITED"
    assert 1 <= int(refused.headers["retry-after"]) <= 60
    assert hints.since_last() == []
    assert send(client, owner, chat["id"], "Typing limits do not prevent sending.").status_code == 201
    app.state.clock.now += timedelta(minutes=1)
    assert typing(client, owner, chat["id"]).status_code == 200


def test_typing_rechecks_session_after_waiting_for_a_space_lock(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    hints = Hints(app, member)
    response = expire_while_waiting(
        app, "spaces", space_id, lambda: typing(client, owner, chat["id"]),
    )
    assert response.status_code == 401
    assert hints.since_last() == []
