import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from uuid import uuid4

from sqlalchemy import func, select, text

from app.modules.messaging.models import Conversation, ConversationMessage
from app.modules.spaces.models import SpaceAuditEvent
from tests.test_identity import account, auth
from tests.test_spaces import create_space, invite_account


def advance(app, **delta):
    app.state.clock.now += timedelta(**delta)


def expire_while_waiting(app, table, row_id, request):
    """Hold one row lock, let the request queue behind it, move the clock past every session's expiry, then release."""
    with ThreadPoolExecutor(max_workers=1) as pool, app.state.engine.connect() as holder:
        held = holder.begin()
        holder.execute(text(f"SELECT 1 FROM {table} WHERE id = :id FOR UPDATE"), {"id": row_id})
        holder_pid = holder.scalar(text("SELECT pg_backend_pid()"))
        pending = pool.submit(request)
        deadline = time.monotonic() + 10
        with app.state.engine.connect() as watcher:
            # pg_locks is read live; pg_stat_activity would keep one snapshot for the whole watcher transaction.
            while not watcher.scalar(
                text("SELECT count(*) FROM pg_locks WHERE NOT granted AND :holder = ANY(pg_blocking_pids(pid))"), {"holder": holder_pid},
            ):
                assert not pending.done(), f"The request finished without waiting for the lock: {pending.result().text}"
                assert time.monotonic() < deadline, "The request never waited for the lock."
                time.sleep(0.05)
        advance(app, hours=9)
        held.commit()
        return pending.result(timeout=10)


def wait_until_blocked(app, pending):
    """Wait until PostgreSQL shows a request waiting for a lock that another request of this test run holds.

    Not finishing within some time proves nothing: on a busy machine a request can be slow without waiting for anything.
    The holder is found by the locks it holds on this run's own schema, so other test runs' locks never count."""
    deadline = time.monotonic() + 30
    with app.state.engine.connect() as watcher:
        # pg_locks is read live; pg_stat_activity would keep one snapshot for the whole watcher transaction.
        while not watcher.scalar(text(
            "SELECT count(*) FROM pg_locks waiting WHERE NOT waiting.granted AND EXISTS ("
            " SELECT 1 FROM pg_locks held JOIN pg_class relation ON relation.oid = held.relation"
            " WHERE held.pid = ANY(pg_blocking_pids(waiting.pid))"
            " AND relation.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema()))"
        )):
            assert not pending.done(), f"The request finished without waiting for a lock: {pending.result().text}"
            assert time.monotonic() < deadline, "The request never waited for a lock."
            time.sleep(0.05)


def admit(client, owner, space_id, person):
    invitation = invite_account(client, owner, space_id, person["user"]["id"])
    assert invitation.status_code == 201, invitation.text
    accepted = client.post(f"/v1/invitations/{invitation.json()['data']['id']}/accept", headers=auth(person), json={})
    assert accepted.status_code == 200, accepted.text


def roster_entry(client, owner, space_id, account_id):
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner))
    assert roster.status_code == 200, roster.text
    return next(item for item in roster.json()["data"] if item["account_id"] == account_id)


def open_chat(client, actor, space_id, participant=None):
    body = {"kind": "direct", "participant_account_id": participant} if participant else {"kind": "space"}
    return client.post(f"/v1/spaces/{space_id}/conversations", headers=auth(actor), json=body)


def send(client, actor, conversation_id, body, key=None):
    return client.post(
        f"/v1/conversations/{conversation_id}/messages",
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4())}, json={"body": body},
    )


def messages(client, actor, conversation_id, query=""):
    return client.get(f"/v1/conversations/{conversation_id}/messages{query}", headers=auth(actor))


def family(client, app):
    owner = account(client, app)
    member = account(client, app, "chat-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    return owner, member, space_id


def test_space_chat_is_shared_by_current_members_from_their_admission(client, app):
    owner = account(client, app)
    member = account(client, app, "chat-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    opened = open_chat(client, owner, space_id)
    assert opened.status_code == 200, opened.text
    chat = opened.json()["data"]
    assert chat["kind"] == "space" and chat["protection"] == "server_encrypted" and chat["can_send"] is True
    assert open_chat(client, owner, space_id).json()["data"]["id"] == chat["id"]
    assert send(client, owner, chat["id"], "Planning before you joined").status_code == 201
    advance(app, minutes=1)
    admit(client, owner, space_id, member)
    advance(app, minutes=1)

    joined = open_chat(client, member, space_id).json()["data"]
    assert joined["id"] == chat["id"]
    assert joined["last_position"] == "0" and joined["unread_count"] == 0 and joined["last_message_at"] is None
    assert messages(client, member, chat["id"]).json()["data"] == []
    sent = send(client, member, chat["id"], "Hello family")
    assert sent.status_code == 201, sent.text
    assert sent.json()["data"]["position"] == "1" and sent.json()["data"]["mine"] is True

    history = messages(client, owner, chat["id"]).json()["data"]
    assert [item["body"] for item in history] == ["Planning before you joined", "Hello family"]
    assert [item["position"] for item in history] == ["1", "2"]
    assert history[1]["client_message_id"] is None and history[1]["sender_name"] == "Alex Morgan"
    owner_view = client.get(f"/v1/conversations/{chat['id']}", headers=auth(owner)).json()["data"]
    assert owner_view["unread_count"] == 1 and owner_view["last_position"] == "2"
    listed = client.get("/v1/conversations", headers=auth(owner)).json()
    assert listed["unread_count"] == 1 and [item["id"] for item in listed["data"]] == [chat["id"]]
    read = client.post(f"/v1/conversations/{chat['id']}/read", headers=auth(owner), json={"through_position": "2"})
    assert read.status_code == 200, read.text
    assert read.json()["data"]["unread_count"] == 0 and read.json()["data"]["read_position"] == "2"
    older = client.post(f"/v1/conversations/{chat['id']}/read", headers=auth(owner), json={"through_position": "1"})
    assert older.json()["data"]["read_position"] == "2"
    assert client.post(f"/v1/conversations/{chat['id']}/read", headers=auth(owner), json={"through_position": "3"}).status_code == 409
    assert client.get(f"/v1/conversations/{chat['id']}", headers=auth(member)).json()["data"]["unread_count"] == 0


def test_send_retry_returns_the_original_message_and_changed_body_conflicts(client, app):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    key = str(uuid4())
    first = send(client, owner, chat["id"], "Bring water", key)
    second = send(client, owner, chat["id"], "Bring water", key)
    assert first.status_code == second.status_code == 201
    assert first.json()["data"] == second.json()["data"]
    assert first.json()["data"]["client_message_id"] == key
    changed = send(client, owner, chat["id"], "Bring juice", key)
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    with app.state.sessions() as database:
        stored = database.scalars(select(ConversationMessage)).all()
        assert len(stored) == 1
        assert "Bring water" not in stored[0].body_cipher
        assert app.state.messaging.cipher.open(chat["id"], stored[0].id, stored[0].body_cipher) == "Bring water"


def test_outsiders_and_removed_members_cannot_read_send_or_recover_old_history(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    chat = open_chat(client, owner, space_id).json()["data"]
    key = str(uuid4())
    assert send(client, member, chat["id"], "Member note", key).status_code == 201
    for response in (
        client.get(f"/v1/conversations/{chat['id']}", headers=auth(outsider)),
        messages(client, outsider, chat["id"]),
        send(client, outsider, chat["id"], "Let me in"),
        open_chat(client, outsider, space_id),
        client.post(f"/v1/conversations/{chat['id']}/read", headers=auth(outsider), json={"through_position": "0"}),
    ):
        assert response.status_code == 404
    assert client.get("/v1/conversations", headers=auth(outsider)).json()["data"] == []

    reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    assert client.get(f"/v1/conversations/{chat['id']}", headers=auth(member)).status_code == 404
    assert send(client, member, chat["id"], "Member note", key).status_code == 404
    assert send(client, owner, chat["id"], "After removal").status_code == 201

    advance(app, minutes=1)
    admit(client, owner, space_id, member)
    advance(app, minutes=1)
    assert messages(client, member, chat["id"]).json()["data"] == []
    assert send(client, member, chat["id"], "Member note", key).status_code == 404
    assert client.get(f"/v1/conversations/{chat['id']}", headers=auth(member)).json()["data"]["last_position"] == "0"


def test_direct_conversation_needs_current_co_members_and_turns_read_only_after_leaving(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    direct = open_chat(client, owner, space_id, member["user"]["id"])
    assert direct.status_code == 200, direct.text
    conversation = direct.json()["data"]
    assert conversation["kind"] == "direct" and conversation["title"] == "Alex Morgan" and len(conversation["participants"]) == 2
    assert open_chat(client, member, space_id, owner["user"]["id"]).json()["data"]["id"] == conversation["id"]
    assert open_chat(client, owner, space_id, owner["user"]["id"]).status_code == 409
    assert open_chat(client, owner, space_id, outsider["user"]["id"]).status_code == 409
    assert open_chat(client, outsider, space_id, owner["user"]["id"]).status_code == 404
    assert client.get(f"/v1/conversations/{conversation['id']}", headers=auth(outsider)).status_code == 404
    assert send(client, member, conversation["id"], "Private question").status_code == 201

    reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
    left = client.post(
        f"/v1/spaces/{space_id}/leave",
        headers={**auth(member), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert left.status_code == 200, left.text
    assert client.get(f"/v1/conversations/{conversation['id']}", headers=auth(member)).status_code == 404
    remaining = client.get(f"/v1/conversations/{conversation['id']}", headers=auth(owner)).json()["data"]
    assert remaining["can_send"] is False
    blocked = send(client, owner, conversation["id"], "Are you there?")
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "CONVERSATION_READ_ONLY"
    assert [item["body"] for item in messages(client, owner, conversation["id"]).json()["data"]] == ["Private question"]


def test_admission_boundary_does_not_depend_on_timestamps(client, app):
    owner = account(client, app)
    member = account(client, app, "chat-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    chat = open_chat(client, owner, space_id).json()["data"]
    # The clock does not move: the message, the admission and the reply share one instant.
    assert send(client, owner, chat["id"], "Said before you joined").status_code == 201
    admit(client, owner, space_id, member)
    assert messages(client, member, chat["id"]).json()["data"] == []
    joined = client.get(f"/v1/conversations/{chat['id']}", headers=auth(member)).json()["data"]
    assert joined["last_position"] == "0" and joined["unread_count"] == 0
    assert send(client, owner, chat["id"], "Said after you joined").status_code == 201
    assert [item["body"] for item in messages(client, member, chat["id"]).json()["data"]] == ["Said after you joined"]
    assert client.get(f"/v1/conversations/{chat['id']}", headers=auth(member)).json()["data"]["unread_count"] == 1


def test_direct_send_cannot_commit_after_the_other_person_leaves(client, app, monkeypatch):
    owner, member, space_id = family(client, app)
    direct = open_chat(client, owner, space_id, member["user"]["id"]).json()["data"]
    reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
    cipher = app.state.messaging.cipher
    original = cipher.seal
    inside, release = Event(), Event()

    def paused(*args):
        inside.set()
        assert release.wait(10)
        return original(*args)

    monkeypatch.setattr(cipher, "seal", paused)
    with ThreadPoolExecutor(max_workers=2) as pool:
        sending = pool.submit(send, client, owner, direct["id"], "Are you still here?")
        assert inside.wait(10)
        leaving = pool.submit(
            client.post, f"/v1/spaces/{space_id}/leave",
            headers={**auth(member), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
        )
        wait_until_blocked(app, leaving)
        left_during_send = leaving.done()
        release.set()
        sent = sending.result(timeout=10)
        left = leaving.result(timeout=10)
    assert left_during_send is False
    assert sent.status_code == 201, sent.text
    assert left.status_code == 200, left.text
    monkeypatch.setattr(cipher, "seal", original)
    after = send(client, owner, direct["id"], "Hello?")
    assert after.status_code == 409 and after.json()["error"]["code"] == "CONVERSATION_READ_ONLY"


def test_send_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    late = expire_while_waiting(app, "conversations", chat["id"], lambda: send(client, owner, chat["id"], "Late message"))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ConversationMessage)) == 0


def test_only_the_author_deletes_and_deletion_is_a_tombstone(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    message = send(client, member, chat["id"], "Wrong group").json()["data"]
    path = f"/v1/conversations/{chat['id']}/messages/{message['id']}/delete"
    denied = client.post(path, headers=auth(owner), json={})
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "MESSAGE_NOT_YOURS"
    assert client.get(f"/v1/conversations/{chat['id']}", headers=auth(owner)).json()["data"]["unread_count"] == 1
    deleted = client.post(path, headers=auth(member), json={})
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["data"]["status"] == "deleted" and deleted.json()["data"]["body"] is None
    assert client.post(path, headers=auth(member), json={}).json()["data"] == deleted.json()["data"]
    assert messages(client, owner, chat["id"]).json()["data"][0]["status"] == "deleted"
    assert client.get(f"/v1/conversations/{chat['id']}", headers=auth(owner)).json()["data"]["unread_count"] == 0
    assert client.post(f"/v1/conversations/{chat['id']}/messages/{uuid4()}/delete", headers=auth(member), json={}).status_code == 404
    with app.state.sessions() as database:
        assert database.get(ConversationMessage, message["id"]).body_cipher is None
        assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(
            SpaceAuditEvent.action == "conversation.message_deleted", SpaceAuditEvent.target_id == message["id"],
        )) == 1


def test_message_pages_move_backward_and_poll_forward_by_position(client, app):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    for index in range(1, 6):
        assert send(client, owner, chat["id"], f"Message {index}").status_code == 201
    latest = messages(client, owner, chat["id"], "?limit=2").json()
    assert [item["position"] for item in latest["data"]] == ["4", "5"]
    assert latest["pagination"] == {"next_cursor": "4", "has_more": True}
    earlier = messages(client, owner, chat["id"], "?limit=2&before=4").json()
    assert [item["position"] for item in earlier["data"]] == ["2", "3"]
    first = messages(client, owner, chat["id"], "?limit=2&before=2").json()
    assert [item["body"] for item in first["data"]] == ["Message 1"] and first["pagination"]["has_more"] is False
    newer = messages(client, owner, chat["id"], "?limit=1&after=3").json()
    assert [item["position"] for item in newer["data"]] == ["4"] and newer["pagination"] == {"next_cursor": "4", "has_more": True}
    assert messages(client, owner, chat["id"], "?after=5").json()["data"] == []
    assert messages(client, owner, chat["id"], "?after=1&before=4").status_code == 400
    assert messages(client, owner, chat["id"], "?limit=51").status_code == 422


def test_message_input_rules_keep_text_safe_and_bounded(client, app):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    for body in ["", "   ", "x" * 2001, "bell\u0007", "spoof\u202eevil", "private\ue000use"]:
        assert send(client, owner, chat["id"], body).status_code == 422, repr(body)
    extra = client.post(
        f"/v1/conversations/{chat['id']}/messages",
        headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={"body": "hi", "sender_id": str(uuid4())},
    )
    assert extra.status_code == 422
    assert client.post(f"/v1/conversations/{chat['id']}/messages", headers=auth(owner), json={"body": "hi"}).status_code == 422
    accepted = send(client, owner, chat["id"], "  Line one\r\n\tLine two \U0001F468\u200D\U0001F469\u200D\U0001F467  ")
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["data"]["body"] == "Line one\n\tLine two \U0001F468\u200D\U0001F469\u200D\U0001F467"
    assert open_chat(client, owner, space_id, None).status_code == 200
    assert client.post(f"/v1/spaces/{space_id}/conversations", headers=auth(owner), json={"kind": "direct"}).status_code == 422
    assert client.post(f"/v1/spaces/{space_id}/conversations", headers=auth(owner),
                       json={"kind": "space", "participant_account_id": str(uuid4())}).status_code == 422
    assert client.post(f"/v1/conversations/{chat['id']}/read", headers=auth(owner), json={"through_position": "-1"}).status_code == 422


def test_conversation_list_is_paginated_filtered_and_cursor_bound(client, app):
    owner, member, space_id = family(client, app)
    second_space = create_space(client, owner, "Second family").json()["data"]["id"]
    first = open_chat(client, owner, space_id).json()["data"]
    advance(app, seconds=1)
    second = open_chat(client, owner, second_space).json()["data"]
    advance(app, seconds=1)
    direct = open_chat(client, owner, space_id, member["user"]["id"]).json()["data"]
    page = client.get("/v1/conversations?limit=2", headers=auth(owner)).json()
    assert [item["id"] for item in page["data"]] == [direct["id"], second["id"]]
    cursor = page["pagination"]["next_cursor"]
    rest = client.get("/v1/conversations", params={"limit": 2, "cursor": cursor}, headers=auth(owner)).json()
    assert [item["id"] for item in rest["data"]] == [first["id"]] and rest["pagination"]["has_more"] is False
    assert client.get("/v1/conversations", params={"cursor": cursor}, headers=auth(member)).status_code == 400
    assert client.get("/v1/conversations", params={"cursor": cursor, "space_id": space_id}, headers=auth(owner)).status_code == 400
    assert client.get("/v1/conversations", params={"cursor": cursor[:-4] + "AAAA"}, headers=auth(owner)).status_code == 400
    filtered = client.get("/v1/conversations", params={"space_id": space_id}, headers=auth(owner)).json()["data"]
    assert {item["id"] for item in filtered} == {first["id"], direct["id"]}
    advance(app, minutes=16)
    assert client.get("/v1/conversations", params={"cursor": cursor}, headers=auth(owner)).status_code == 410


def test_parallel_sends_receive_unique_positions_and_one_row_per_retry(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(
            lambda index: send(client, owner if index % 2 else member, chat["id"], f"Parallel {index}", key if index == 0 else None),
            range(6),
        ))
    assert [result.status_code for result in results] == [201] * 6
    repeated = send(client, member, chat["id"], "Parallel 0", key)
    assert repeated.json()["data"]["id"] == results[0].json()["data"]["id"]
    positions = sorted(int(item["position"]) for item in messages(client, owner, chat["id"]).json()["data"])
    assert positions == [1, 2, 3, 4, 5, 6]
    with app.state.sessions() as database:
        assert database.get(Conversation, chat["id"]).last_sequence == 6


def test_swapped_ciphertext_and_send_rate_are_rejected(client, app):
    owner, _member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    one = send(client, owner, chat["id"], "First").json()["data"]
    two = send(client, owner, chat["id"], "Second").json()["data"]
    with app.state.sessions.begin() as database:
        first = database.get(ConversationMessage, one["id"])
        second = database.get(ConversationMessage, two["id"])
        first.body_cipher, second.body_cipher = second.body_cipher, first.body_cipher
    shown = messages(client, owner, chat["id"]).json()["data"]
    assert [item["status"] for item in shown] == ["unavailable", "unavailable"]
    assert all(item["body"] is None for item in shown)
    for index in range(28):
        assert send(client, owner, chat["id"], f"Burst {index}").status_code == 201
    limited = send(client, owner, chat["id"], "Too fast")
    assert limited.status_code == 429 and limited.json()["error"]["code"] == "MESSAGE_RATE_LIMITED"
    advance(app, minutes=2)
    assert send(client, owner, chat["id"], "After waiting").status_code == 201


def test_openapi_declares_authenticated_messaging_operations(client):
    schema = client.get("/openapi.json").json()
    operations = {
        ("post", "/v1/spaces/{space_id}/conversations"), ("get", "/v1/conversations"),
        ("get", "/v1/conversations/{conversation_id}"), ("get", "/v1/conversations/{conversation_id}/messages"),
        ("post", "/v1/conversations/{conversation_id}/messages"), ("post", "/v1/conversations/{conversation_id}/read"),
        ("post", "/v1/conversations/{conversation_id}/messages/{message_id}/delete"),
    }
    for method, path in operations:
        operation = schema["paths"][path][method]
        assert operation["security"] == [{"AccountSession": []}]
    view = schema["components"]["schemas"]["MessageView"]["properties"]
    assert "body_cipher" not in view and "request_digest" not in view and "sender_admission_id" not in view
