"""Chat replies, reactions and edits (DEC-033, T162)."""

from uuid import uuid4

from sqlalchemy import func, select

from app.modules.messaging.models import ConversationMessage, ConversationMessageReaction
from app.modules.spaces.models import SpaceAuditEvent
from tests.test_identity import account, auth
from tests.test_live_updates import Hints, change
from tests.test_messaging import admit, advance, family, messages, open_chat, roster_entry, send


def reply(client, actor, conversation_id, body, original_id, key=None):
    return client.post(
        f"/v1/conversations/{conversation_id}/messages",
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={"body": body, "reply_to_message_id": original_id},
    )


def react(client, actor, conversation_id, message_id, reaction, on=True):
    return client.post(
        f"/v1/conversations/{conversation_id}/messages/{message_id}/reactions",
        headers=auth(actor), json={"reaction": reaction, "on": on},
    )


def edit(client, actor, conversation_id, message_id, body):
    return client.post(f"/v1/conversations/{conversation_id}/messages/{message_id}/edit", headers=auth(actor), json={"body": body})


def code(response):
    return response.json()["error"]["code"]


def test_a_reply_shows_the_original_and_then_that_it_was_deleted(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    original = send(client, owner, chat["id"], "Dinner at 8\non Friday").json()["data"]
    assert original["reply_to"] is None and original["reactions"] == [] and original["edited_at"] is None
    assert original["revision"] == 1

    key = str(uuid4())
    answered = reply(client, member, chat["id"], "Works for me", original["id"], key)
    assert answered.status_code == 201, answered.text
    expected = {"message_id": original["id"], "status": "sent", "position": "1", "sender_name": "Alex Morgan", "excerpt": "Dinner at 8 on Friday"}
    assert answered.json()["data"]["reply_to"] == expected
    listed = messages(client, owner, chat["id"]).json()["data"]
    assert listed[1]["reply_to"] == expected and listed[0]["reply_to"] is None

    # A retry must name the same original: the answered message is part of what was sent.
    assert reply(client, member, chat["id"], "Works for me", original["id"], key).json()["data"]["id"] == answered.json()["data"]["id"]
    changed = send(client, member, chat["id"], "Works for me", key)
    assert changed.status_code == 409 and code(changed) == "IDEMPOTENCY_CONFLICT"

    assert client.post(f"/v1/conversations/{chat['id']}/messages/{original['id']}/delete", headers=auth(owner), json={}).status_code == 200
    gone = messages(client, member, chat["id"]).json()["data"][1]["reply_to"]
    assert gone == {"message_id": original["id"], "status": "deleted", "position": "1", "sender_name": "Alex Morgan", "excerpt": None}
    # The retry of a reply that was made still returns it, though the original is gone now.
    assert reply(client, member, chat["id"], "Works for me", original["id"], key).status_code == 201
    late = reply(client, member, chat["id"], "Too late", original["id"])
    assert late.status_code == 409 and code(late) == "REPLY_UNAVAILABLE"


def test_a_reply_can_only_answer_a_message_of_the_same_conversation(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    direct = open_chat(client, owner, space_id, member["user"]["id"]).json()["data"]
    private = send(client, member, direct["id"], "Just between us").json()["data"]
    for target in (private["id"], str(uuid4())):
        refused = reply(client, owner, chat["id"], "Quoting", target)
        assert refused.status_code == 409 and code(refused) == "REPLY_UNAVAILABLE"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ConversationMessage).where(ConversationMessage.conversation_id == chat["id"])) == 0
    malformed = reply(client, owner, chat["id"], "Quoting", "not-an-id")
    assert malformed.status_code == 422


def test_a_reply_to_history_from_before_someone_joined_says_nothing_about_it(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    earlier = send(client, owner, chat["id"], "Planning the surprise before Jordan joins").json()["data"]
    advance(app, minutes=1)
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)
    advance(app, minutes=1)
    refused = reply(client, newcomer, chat["id"], "What surprise?", earlier["id"])
    assert refused.status_code == 409 and code(refused) == "REPLY_UNAVAILABLE"
    answered = reply(client, member, chat["id"], "Cake is ready", earlier["id"])
    assert answered.status_code == 201, answered.text

    seen = messages(client, newcomer, chat["id"]).json()["data"]
    assert [item["body"] for item in seen] == ["Cake is ready"]
    assert seen[0]["reply_to"] == {"message_id": earlier["id"], "status": "unavailable", "position": None, "sender_name": None, "excerpt": None}
    assert "surprise" not in str(seen)
    assert messages(client, owner, chat["id"]).json()["data"][1]["reply_to"]["status"] == "sent"


def test_a_long_original_is_shown_as_the_start_of_one_line(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    long = send(client, owner, chat["id"], "word " * 40 + "\n\nlast line").json()["data"]
    shown = reply(client, member, chat["id"], "Agreed", long["id"]).json()["data"]["reply_to"]["excerpt"]
    assert shown.endswith("\u2026") and "\n" not in shown and len(shown) <= 121 and shown.startswith("word word")


def test_reactions_count_people_and_doing_the_same_again_changes_nothing(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    chat = open_chat(client, owner, space_id).json()["data"]
    message = send(client, owner, chat["id"], "Bring water").json()["data"]
    hints = {"owner": Hints(app, owner), "member": Hints(app, member)}

    liked = react(client, member, chat["id"], message["id"], "like")
    assert liked.status_code == 200, liked.text
    assert liked.json()["data"]["reactions"] == [{"reaction": "like", "count": 1, "mine": True}]
    assert liked.json()["data"]["revision"] == 2 and liked.json()["data"]["body"] == "Bring water"
    again = react(client, member, chat["id"], message["id"], "like")
    assert again.json()["data"]["revision"] == 2 and again.json()["data"]["reactions"] == liked.json()["data"]["reactions"]
    assert hints["owner"].since_last() == hints["member"].since_last() == [change(chat, "changed")]

    assert react(client, owner, chat["id"], message["id"], "thanks").status_code == 200
    assert react(client, owner, chat["id"], message["id"], "like").status_code == 200
    by_owner = messages(client, owner, chat["id"]).json()["data"][0]["reactions"]
    by_member = messages(client, member, chat["id"]).json()["data"][0]["reactions"]
    assert by_owner == [{"reaction": "like", "count": 2, "mine": True}, {"reaction": "thanks", "count": 1, "mine": True}]
    assert by_member == [{"reaction": "like", "count": 2, "mine": True}, {"reaction": "thanks", "count": 1, "mine": False}]

    taken = react(client, member, chat["id"], message["id"], "like", on=False)
    assert taken.json()["data"]["reactions"] == [{"reaction": "like", "count": 1, "mine": False}, {"reaction": "thanks", "count": 1, "mine": False}]
    revision = taken.json()["data"]["revision"]
    assert react(client, member, chat["id"], message["id"], "like", on=False).json()["data"]["revision"] == revision

    for refused in (
        react(client, member, chat["id"], message["id"], "fire"),
        client.post(f"/v1/conversations/{chat['id']}/messages/{message['id']}/reactions", headers=auth(member), json={"reaction": "like"}),
    ):
        assert refused.status_code == 422
    assert react(client, outsider, chat["id"], message["id"], "like").status_code == 404
    assert react(client, member, chat["id"], str(uuid4()), "like").status_code == 404


def test_deleting_a_message_removes_its_reactions_and_stops_new_ones(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    message = send(client, owner, chat["id"], "Bring water").json()["data"]
    assert react(client, member, chat["id"], message["id"], "love").status_code == 200
    deleted = client.post(f"/v1/conversations/{chat['id']}/messages/{message['id']}/delete", headers=auth(owner), json={})
    assert deleted.json()["data"]["reactions"] == [] and deleted.json()["data"]["revision"] == 3
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ConversationMessageReaction)) == 0
    for refused in (react(client, member, chat["id"], message["id"], "love"), edit(client, owner, chat["id"], message["id"], "Bring juice")):
        assert refused.status_code == 409 and code(refused) == "MESSAGE_DELETED"


def test_the_author_edits_for_fifteen_minutes_and_the_earlier_text_is_not_kept(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    message = send(client, owner, chat["id"], "Dinner at 8").json()["data"]
    hints = Hints(app, member)

    edited = edit(client, owner, chat["id"], message["id"], "  Dinner at 9\r\n")
    assert edited.status_code == 200, edited.text
    view = edited.json()["data"]
    assert view["body"] == "Dinner at 9" and view["edited_at"] is not None and view["revision"] == 2
    assert view["position"] == message["position"] and view["created_at"] == message["created_at"]
    assert hints.since_last() == [change(chat, "changed")]
    seen = messages(client, member, chat["id"]).json()["data"][0]
    assert seen["body"] == "Dinner at 9" and seen["edited_at"] == view["edited_at"] and seen["mine"] is False
    with app.state.sessions() as database:
        stored = database.get(ConversationMessage, message["id"])
        assert app.state.messaging.cipher.open(chat["id"], stored.id, stored.body_cipher) == "Dinner at 9"
        assert stored.edit_count == 1
        assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(
            SpaceAuditEvent.action == "conversation.message_edited", SpaceAuditEvent.target_id == message["id"],
        )) == 1

    # The same text again is a retry that changes nothing.
    same = edit(client, owner, chat["id"], message["id"], "Dinner at 9").json()["data"]
    assert same["revision"] == 2 and same["edited_at"] == view["edited_at"]
    assert hints.since_last() == []

    not_yours = edit(client, member, chat["id"], message["id"], "Dinner at 10")
    assert not_yours.status_code == 403 and code(not_yours) == "MESSAGE_NOT_YOURS"
    for body in ("", "   ", "x" * 2001, "Bad \u202e text"):
        assert edit(client, owner, chat["id"], message["id"], body).status_code == 422

    advance(app, minutes=16)
    closed = edit(client, owner, chat["id"], message["id"], "Dinner at 10")
    assert closed.status_code == 409 and code(closed) == "EDIT_WINDOW_CLOSED"
    assert messages(client, member, chat["id"]).json()["data"][0]["body"] == "Dinner at 9"


def test_a_message_can_be_edited_ten_times(client, app):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    message = send(client, owner, chat["id"], "Version 0").json()["data"]
    for number in range(1, 11):
        assert edit(client, owner, chat["id"], message["id"], f"Version {number}").status_code == 200
    limited = edit(client, owner, chat["id"], message["id"], "Version 11")
    assert limited.status_code == 409 and code(limited) == "EDIT_LIMIT_REACHED"
    assert messages(client, owner, chat["id"]).json()["data"][0]["body"] == "Version 10"


def test_a_read_only_direct_conversation_takes_no_reactions_or_edits(client, app):
    owner, member, space_id = family(client, app)
    direct = open_chat(client, owner, space_id, member["user"]["id"]).json()["data"]
    question = send(client, member, direct["id"], "Private question").json()["data"]
    answer = send(client, owner, direct["id"], "Private answer").json()["data"]
    reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
    left = client.post(
        f"/v1/spaces/{space_id}/leave",
        headers={**auth(member), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert left.status_code == 200, left.text
    for refused in (
        react(client, owner, direct["id"], question["id"], "like"),
        edit(client, owner, direct["id"], answer["id"], "Changed answer"),
        reply(client, owner, direct["id"], "Answering", question["id"]),
    ):
        assert refused.status_code == 409 and code(refused) == "CONVERSATION_READ_ONLY"
    # Deleting one's own message still works, as before.
    assert client.post(f"/v1/conversations/{direct['id']}/messages/{answer['id']}/delete", headers=auth(owner), json={}).status_code == 200


def test_openapi_declares_the_reply_reaction_and_edit_operations(client):
    schema = client.get("/openapi.json").json()
    for path in ("/v1/conversations/{conversation_id}/messages/{message_id}/edit", "/v1/conversations/{conversation_id}/messages/{message_id}/reactions"):
        assert schema["paths"][path]["post"]["security"] == [{"AccountSession": []}]
    view = schema["components"]["schemas"]["MessageView"]["properties"]
    assert {"reply_to", "reactions", "edited_at", "revision"} <= set(view)
    assert "edit_count" not in view and "reply_to_id" not in view
    assert schema["components"]["schemas"]["ReactToMessage"]["properties"]["reaction"]["enum"] == ["like", "love", "laugh", "wow", "sad", "thanks"]
