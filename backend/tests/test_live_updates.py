import asyncio
import os
import queue
import socket
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest

from app.errors import DomainError
from app.modules.realtime.hub import signal
from tests.test_identity import account, auth
from tests.test_messaging import admit, family, open_chat, send
from tests.test_reminder_delivery_guards import schedule_reminder


class Hints:
    """Collects what one account's live subscription receives, in the order the hub delivers it."""

    def __init__(self, app, person):
        self.app = app
        self.account_id = person["user"]["id"]
        self.items = queue.Queue()
        self.subscription = app.state.live_hub.subscribe(self.account_id, self.items.put)
        assert app.state.live_hub.ready(timeout=10)

    def since_last(self):
        """Everything received up to now: a marker notice is committed last, and notices arrive in commit order."""
        marker = str(uuid4())
        with self.app.state.sessions.begin() as database:
            signal(database, "marker", [self.account_id], marker=marker)
        received = []
        deadline = time.monotonic() + 10
        while True:
            item = self.items.get(timeout=max(0.1, deadline - time.monotonic()))
            if item == {"kind": "marker", "marker": marker}:
                return received
            received.append(item)


def change(chat, reason):
    return {"kind": "conversation", "conversation_id": chat["id"], "space_id": chat["space_id"], "reason": reason}


def test_space_chat_hints_reach_current_members_and_only_after_a_commit(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    hints = {name: Hints(app, person) for name, person in (("owner", owner), ("member", member), ("outsider", outsider))}
    chat = open_chat(client, owner, space_id).json()["data"]
    key = str(uuid4())
    assert send(client, member, chat["id"], "Dinner at 8", key).status_code == 201
    expected = [change(chat, "opened"), change(chat, "message")]
    assert hints["owner"].since_last() == expected
    assert hints["member"].since_last() == expected
    assert hints["outsider"].since_last() == []

    # A replay changes nothing, and a refused send or a rolled-back transaction tells nobody.
    assert send(client, member, chat["id"], "Dinner at 8", key).status_code == 201
    assert send(client, member, chat["id"], "Dinner at 9", key).status_code == 409
    assert send(client, outsider, chat["id"], "Let me in").status_code == 404
    with pytest.raises(RuntimeError):
        with app.state.sessions.begin() as database:
            signal(database, "conversation", [owner["user"]["id"]], conversation_id=chat["id"], reason="message")
            raise RuntimeError("roll back")
    assert hints["owner"].since_last() == []
    assert hints["member"].since_last() == []
    assert "Dinner" not in repr(expected)


def test_direct_conversation_hints_go_to_its_two_participants_and_read_state_to_the_reader(client, app):
    owner, member, space_id = family(client, app)
    third = account(client, app, "third@example.test")
    admit(client, owner, space_id, third)
    hints = {name: Hints(app, person) for name, person in (("owner", owner), ("member", member), ("third", third))}
    direct = open_chat(client, owner, space_id, member["user"]["id"]).json()["data"]
    sent = send(client, owner, direct["id"], "Just us")
    assert sent.status_code == 201, sent.text
    assert hints["owner"].since_last() == [change(direct, "opened"), change(direct, "message")]
    assert hints["member"].since_last() == [change(direct, "opened"), change(direct, "message")]
    assert hints["third"].since_last() == []

    read = client.post(f"/v1/conversations/{direct['id']}/read", headers=auth(member), json={"through_position": "1"})
    assert read.status_code == 200, read.text
    assert hints["member"].since_last() == [change(direct, "read")]
    assert hints["owner"].since_last() == []

    message_id = sent.json()["data"]["id"]
    deleted = client.post(f"/v1/conversations/{direct['id']}/messages/{message_id}/delete", headers=auth(owner), json={})
    assert deleted.status_code == 200, deleted.text
    assert client.post(f"/v1/conversations/{direct['id']}/messages/{message_id}/delete", headers=auth(owner), json={}).status_code == 200
    assert hints["owner"].since_last() == [change(direct, "deleted")]
    assert hints["member"].since_last() == [change(direct, "deleted")]
    assert hints["third"].since_last() == []


def test_a_removed_member_gets_no_more_hints_from_the_space_chat(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    hints = Hints(app, member)
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(owner)).json()["data"]
    reviewed = next(item for item in roster if item["account_id"] == member["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    hints.since_last()
    assert send(client, owner, chat["id"], "After removal").status_code == 201
    assert hints.since_last() == []


def leave_or_remove(client, actor, space_id, person, action):
    roster = client.get(f"/v1/spaces/{space_id}/members", headers=auth(actor)).json()["data"]
    reviewed = next(item for item in roster if item["account_id"] == person["user"]["id"])
    path = f"/v1/spaces/{space_id}/leave" if action == "leave" else f"/v1/spaces/{space_id}/members/{person['user']['id']}/remove"
    return client.post(path, headers={**auth(actor), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={})


def test_ending_a_membership_tells_each_chat_it_changes_at_once(client, app):
    """T86: an open chat learns about lost access from a hint, not from the next 30-second check."""
    owner, member, space_id = family(client, app)
    third = account(client, app, "third@example.test")
    admit(client, owner, space_id, third)
    chat = open_chat(client, owner, space_id).json()["data"]
    direct = open_chat(client, member, space_id, owner["user"]["id"]).json()["data"]
    others = open_chat(client, owner, space_id, third["user"]["id"]).json()["data"]
    hints = {name: Hints(app, person) for name, person in (("owner", owner), ("member", member), ("third", third))}
    for collected in hints.values():
        collected.since_last()

    removed = leave_or_remove(client, owner, space_id, member, "remove")
    assert removed.status_code == 200, removed.text
    by_id = lambda items: sorted(items, key=lambda item: item["conversation_id"])
    assert by_id(hints["member"].since_last()) == by_id([change(chat, "access"), change(direct, "access")])
    assert hints["owner"].since_last() == [change(direct, "access")]
    assert hints["third"].since_last() == []

    left = leave_or_remove(client, third, space_id, third, "leave")
    assert left.status_code == 200, left.text
    assert by_id(hints["third"].since_last()) == by_id([change(chat, "access"), change(others, "access")])
    assert hints["owner"].since_last() == [change(others, "access")]
    assert hints["member"].since_last() == []
    # A refused command tells nobody.
    assert leave_or_remove(client, owner, space_id, owner, "leave").status_code == 409
    assert hints["owner"].since_last() == []


def test_inbox_hints_reach_only_the_recipient(client, app):
    actor, _task_id, _reminder, _body, _headers = schedule_reminder(client, app)
    other = account(client, app, "other@example.test")
    mine, theirs = Hints(app, actor), Hints(app, other)
    app.state.clock.now += timedelta(minutes=2)
    app.state.reminders.dispatch_due(limit=20)
    assert mine.since_last() == [{"kind": "notifications", "reason": "delivered"}]
    notification = client.get("/v1/notifications", headers=auth(actor)).json()["data"][0]
    for action in ("read", "read", "acknowledge"):
        response = client.post(f"/v1/notifications/{notification['id']}/{action}", headers=auth(actor), json={})
        assert response.status_code == 200, response.text
    assert mine.since_last() == [{"kind": "notifications", "reason": "read"}, {"kind": "notifications", "reason": "acknowledge"}]
    assert theirs.since_last() == []


def test_live_connections_per_account_are_bounded_and_need_a_session(client, app):
    person = account(client, app)
    anonymous = client.get("/v1/live")
    assert anonymous.status_code == 401 and anonymous.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    assert client.get("/v1/live", headers={"Authorization": "Bearer not-a-session"}).status_code == 401
    held = [app.state.live_hub.subscribe(person["user"]["id"], lambda _event: None) for _ in range(app.state.live.per_account)]
    with pytest.raises(DomainError) as refused:
        app.state.live.open(person["session_token"])
    assert refused.value.status == 429 and refused.value.code == "LIVE_LIMIT_REACHED"
    app.state.live_hub.unsubscribe(held[0])
    assert app.state.live.open(person["session_token"]) == person["user"]["id"]


def test_the_stream_sends_ready_then_hints_then_ends_when_the_session_ends(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    service = app.state.live
    service.heartbeat_seconds, service.recheck_seconds = 0.2, 0

    async def next_frame(stream, prefix):
        while True:
            frame = await asyncio.wait_for(anext(stream), timeout=10)
            if frame.startswith(prefix):
                return frame

    async def scenario():
        assert service.open(owner["session_token"]) == owner["user"]["id"]
        stream = service.stream(owner["session_token"], owner["user"]["id"])
        assert await anext(stream) == "retry: 5000\n\n"
        assert (await anext(stream)).startswith("event: ready\n")
        await asyncio.to_thread(send, client, member, chat["id"], "Hello")
        hint = await next_frame(stream, "event: change")
        assert hint == f'event: change\ndata: {{"kind":"conversation","conversation_id":"{chat["id"]}","space_id":"{space_id}","reason":"message"}}\n\n'
        assert await next_frame(stream, ":") == ": keep-alive\n\n"
        assert app.state.live_hub.count(owner["user"]["id"]) == 1
        logout = await asyncio.to_thread(client.post, "/v1/auth/logout", headers=auth(owner))
        assert logout.status_code == 200, logout.text
        assert await next_frame(stream, "event: end") == 'event: end\ndata: {"reason":"signed_out"}\n\n'
        with pytest.raises(StopAsyncIteration):
            await anext(stream)
        assert app.state.live_hub.count(owner["user"]["id"]) == 0

    asyncio.run(scenario())


def test_a_real_server_streams_hints_as_server_sent_events(client, app):
    # The server process uses the real clock, so these sessions must be valid now.
    app.state.clock.now = datetime.now(timezone.utc)
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    environment = {
        **os.environ, "COMMUNITY_SECRET_KEY": app.state.settings.secret_key,
        "COMMUNITY_LIVE_HEARTBEAT_SECONDS": "1", "COMMUNITY_LIVE_RECHECK_SECONDS": "1", "COMMUNITY_LIVE_MAX_SECONDS": "60",
    }
    command = [sys.executable, "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port),
               "--no-access-log", "--no-proxy-headers"]
    server = subprocess.Popen(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as http:
            deadline = time.monotonic() + 120
            while True:
                try:
                    if http.get("/health/live").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                if server.poll() is not None or time.monotonic() >= deadline:
                    raise AssertionError("The server did not start.")
                time.sleep(0.25)
            assert http.get("/v1/live").status_code == 401
            with http.stream("GET", "/v1/live", headers=auth(owner)) as response:
                assert response.status_code == 200
                assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
                assert response.headers["cache-control"] == "no-store"
                lines = response.iter_lines()

                def until(wanted):
                    limit = time.monotonic() + 15
                    for line in lines:
                        if line.startswith(wanted):
                            return line
                        assert time.monotonic() < limit, f"No {wanted!r} line arrived."
                    raise AssertionError("The stream closed early.")

                assert until("event: ready") == "event: ready"
                assert send(client, member, chat["id"], "From another process").status_code == 201
                assert until("event: change") == "event: change"
                data = until("data: ")
                assert f'"conversation_id":"{chat["id"]}"' in data and '"reason":"message"' in data and "From another" not in data
                assert until(": keep-alive") == ": keep-alive"
                assert client.post("/v1/auth/logout", headers=auth(owner)).status_code == 200
                assert until("event: end") == "event: end"
                assert until("data: ") == 'data: {"reason":"signed_out"}'
    finally:
        server.terminate()
        try:
            server.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()
            server.communicate(timeout=15)
