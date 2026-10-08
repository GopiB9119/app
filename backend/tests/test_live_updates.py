import asyncio
import itertools
import os
import queue
import socket
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import anyio
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from starlette.requests import Request
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import OperationalError

from app.errors import DomainError
from app.modules.identity.models import AccountSession, User
from app.modules.realtime.api import LiveResponse
from app.modules.realtime.api import live as live_route
from app.modules.realtime import database as live_database
from app.modules.realtime.hub import signal
from app.modules.realtime import leases as lease_module
from app.modules.realtime.models import LiveConnectionLease
from tests.agent_support import MAIN_AGENT, ask
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
    between = open_chat(client, member, space_id, third["user"]["id"]).json()["data"]
    hints = {name: Hints(app, person) for name, person in (("owner", owner), ("member", member), ("third", third))}
    for collected in hints.values():
        collected.since_last()

    removed = leave_or_remove(client, owner, space_id, member, "remove")
    assert removed.status_code == 200, removed.text
    by_id = lambda items: sorted(items, key=lambda item: item["conversation_id"])
    lost = {"kind": "search", "space_id": space_id, "reason": "access"}

    def chats_and_searches(items):
        """The chat hints in a fixed order, and the search hints: whoever loses the place also hears that what they could search there ended (DEC-051)."""
        return by_id([item for item in items if item["kind"] == "conversation"]), [item for item in items if item["kind"] == "search"]

    assert chats_and_searches(hints["member"].since_last()) == (by_id([change(chat, "access"), change(direct, "access"), change(between, "access")]), [lost])
    assert hints["owner"].since_last() == [change(direct, "access")]
    assert hints["third"].since_last() == [change(between, "access")]

    left = leave_or_remove(client, third, space_id, third, "leave")
    assert left.status_code == 200, left.text
    assert chats_and_searches(hints["third"].since_last()) == (by_id([change(chat, "access"), change(others, "access"), change(between, "access")]), [lost])
    assert hints["owner"].since_last() == [change(others, "access")]
    # The former member is no longer told anything about this Space, even about a chat they were in.
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


def test_main_agent_progress_hints_reach_only_the_requester_and_name_no_space_or_content(client, app):
    asker = account(client, app, "asker@example.test")
    other = account(client, app, "other@example.test")
    mine, theirs = Hints(app, asker), Hints(app, other)
    run = ask(client, asker, MAIN_AGENT, "Private dinner idea")
    assert run["status"] == "completed"
    hints = mine.since_last()
    # Each recorded step (received, working, understanding, finished) commits its own hint, so the screen follows live.
    assert len(hints) == len(client.get(f"/v1/agent-runs/{run['id']}", headers=auth(asker)).json()["data"]["events"]) >= 3
    assert all(hint == {"kind": "agent", "space_id": None, "run_id": run["id"], "reason": "changed"} for hint in hints)
    assert "dinner" not in repr(hints).lower()
    assert theirs.since_last() == []


@pytest.mark.parametrize("driver_timeout", [None, live_database.CONNECT_SECONDS])
def test_live_database_connect_matches_the_driver_generator_signature(monkeypatch, driver_timeout):
    requested, ready, connected = object(), object(), object()
    calls = []

    def handshake(connection_class, conninfo, options):
        calls.append((connection_class, conninfo, options))
        assert (yield requested) is ready
        return connected

    if driver_timeout is None:
        def connect(connection_class, conninfo=""):
            return handshake(connection_class, conninfo, {})
    else:
        def connect(connection_class, conninfo="", *, timeout=0):
            return handshake(connection_class, conninfo, {"timeout": timeout})

    monkeypatch.setattr(live_database.psycopg.Connection, "_connect_gen", classmethod(connect))
    options = {} if driver_timeout is None else {"timeout": driver_timeout}
    generator = live_database.BoundedConnection._connect_gen("dbname=community_test", **options)
    try:
        assert next(generator) is requested
        with pytest.raises(StopIteration) as completed:
            generator.send(ready)
        assert completed.value.value is connected
        assert calls == [(live_database.BoundedConnection, "dbname=community_test", options)]
    finally:
        generator.close()


def test_live_database_wait_accepts_driver_timeout_and_still_closes_on_expiry(monkeypatch):
    clock = SimpleNamespace(now=100.0)
    requested = object()
    closed = []

    def operation():
        try:
            yield requested
            pytest.fail("An expired database operation resumed.")
        finally:
            closed.append("generator")

    def wait(generator, descriptor, interval):
        assert descriptor == 7 and interval == live_database.POLL_SECONDS
        assert next(generator) is requested
        clock.now += live_database.TRANSPORT_SECONDS
        generator.send(None)

    monkeypatch.setattr(live_database, "time", SimpleNamespace(monotonic=lambda: clock.now))
    monkeypatch.setattr(live_database.waiting, "wait", wait)
    connection = SimpleNamespace(pgconn=SimpleNamespace(socket=7), close=lambda: closed.append("connection"))
    with pytest.raises(live_database.psycopg.OperationalError, match="Live database time budget exhausted"):
        live_database.BoundedConnection.wait(connection, operation(), timeout=live_database.TRANSPORT_SECONDS)
    assert closed == ["generator", "connection"]


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


@contextmanager
def real_server(app, max_seconds):
    """Runs the API in its own uvicorn process, the way it is served, and yields an HTTP client for it."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    environment = {
        **os.environ, "COMMUNITY_SECRET_KEY": app.state.settings.secret_key,
        "COMMUNITY_LIVE_HEARTBEAT_SECONDS": "1", "COMMUNITY_LIVE_RECHECK_SECONDS": "1", "COMMUNITY_LIVE_MAX_SECONDS": str(max_seconds),
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
                    # Say whether the server exited (for example on a file another session was writing) or was slow to start.
                    server.terminate()
                    errors = server.communicate(timeout=30)[1]
                    raise AssertionError(f"The server did not start (exit code {server.returncode}):\n{errors[-3000:]}")
                time.sleep(0.25)
            yield http
    finally:
        server.terminate()
        try:
            server.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()
            server.communicate(timeout=15)


def test_a_real_server_streams_hints_as_server_sent_events(client, app):
    # The server process uses the real clock, so these sessions must be valid now.
    app.state.clock.now = datetime.now(timezone.utc)
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    with real_server(app, max_seconds=60) as http:
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


def test_a_closed_stream_frees_its_place_at_once_on_a_real_server(client, app):
    """T124: a tab that closes its stream gives its place back, so reloads and page changes never use up the limit.

    The streams here could otherwise stay open for ten minutes; closing one must free its place within seconds.
    """
    app.state.clock.now = datetime.now(timezone.utc)
    person = account(client, app)
    limit = app.state.live.per_account

    def opened(http):
        response = http.send(http.build_request("GET", "/v1/live", headers=auth(person)), stream=True)
        if response.status_code == 200:
            # Reading "ready" proves the server has counted this stream. The line reader stays with the response:
            # dropping a half-read reader would close the connection.
            response.lines = response.iter_lines()
            for line in response.lines:
                if line.startswith("event:"):
                    assert line == "event: ready"
                    break
        return response

    def opened_soon(http):
        deadline = time.monotonic() + 5
        while True:
            response = opened(http)
            if response.status_code == 200 or time.monotonic() >= deadline:
                return response
            response.close()
            time.sleep(0.1)

    with real_server(app, max_seconds=600) as http:
        streams = [opened(http) for _ in range(limit)]
        try:
            assert [stream.status_code for stream in streams] == [200] * limit
            refused = opened(http)
            refused.read()
            assert refused.status_code == 429 and refused.json()["error"]["code"] == "LIVE_LIMIT_REACHED"

            # A tab closes: its place is free again at once, not when the stream would have reached its time limit.
            streams.pop(0).close()
            replacement = opened_soon(http)
            streams.append(replacement)
            assert replacement.status_code == 200, "A closed stream kept its place in the limit."
            again = opened(http)
            again.read()
            assert again.status_code == 429, "The limit no longer counts the open streams."
            # A place frees as soon as another tab closes, so the wait is short (other 429 answers keep 15 minutes).
            assert again.headers["retry-after"] == "30"

            # Every tab closes, for example after several reloads: all places come back.
            while streams:
                streams.pop().close()
            fresh = [opened_soon(http) for _ in range(limit)]
            streams.extend(fresh)
            assert [stream.status_code for stream in fresh] == [200] * limit
        finally:
            for stream in streams:
                stream.close()


def test_live_connection_quota_is_shared_across_real_server_processes(client, app):
    """T106 part 5: five streams share one account limit across independent API processes."""
    app.state.clock.now = datetime.now(timezone.utc)
    person = account(client, app)
    other = account(client, app, "other-live@example.test")
    assert app.state.live.per_account == 5
    responses = []

    def opened(http, actor=person):
        response = http.send(http.build_request("GET", "/v1/live", headers=auth(actor)), stream=True)
        responses.append(response)
        if response.status_code == 200:
            response.lines = response.iter_lines()
            for line in response.lines:
                if line.startswith("event:"):
                    assert line == "event: ready"
                    break
            else:
                raise AssertionError("The admitted stream closed before ready.")
        return response

    def refused(response):
        assert response.status_code == 429, (
            "Five ready streams across two API processes must refuse a sixth before ready; "
            f"received HTTP {response.status_code}."
        )
        response.read()
        assert response.json()["error"]["code"] == "LIVE_LIMIT_REACHED"
        assert response.headers["retry-after"] == "30"
        assert "event: ready" not in response.text
        response.close()

    with real_server(app, max_seconds=600) as first, real_server(app, max_seconds=600) as second:
        try:
            streams = [opened(first) for _ in range(3)] + [opened(second) for _ in range(2)]
            assert [stream.status_code for stream in streams] == [200] * 5
            assert opened(second, other).status_code == 200, "Another account shared this account's quota."
            refused(opened(second))

            streams[0].close()
            deadline = time.monotonic() + 5
            while True:
                replacement = opened(second)
                if replacement.status_code == 200:
                    break
                refused(replacement)
                assert time.monotonic() < deadline, "Disconnect did not free a slot on the other API process."
                time.sleep(0.1)
            refused(opened(first))
        finally:
            for response in responses:
                response.close()
            assert all(response.is_closed for response in responses)


def lease_count(app):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(LiveConnectionLease))


def test_live_leases_serialize_the_concurrent_final_slot(client, app):
    person = account(client, app)
    service = app.state.live
    held = [service.acquire(person["session_token"]) for _ in range(4)]
    barrier = threading.Barrier(2)

    def acquire():
        barrier.wait(timeout=10)
        try:
            return service.acquire(person["session_token"])
        except DomainError as error:
            return error

    try:
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(lambda _index: acquire(), range(2)))
        admitted = [result for result in results if not isinstance(result, DomainError)]
        refused = [result for result in results if isinstance(result, DomainError)]
        held.extend(admitted)
        assert len(admitted) == len(refused) == 1
        assert refused[0].status == 429 and refused[0].retry_after == 30
        assert lease_count(app) == 5
    finally:
        for reservation in held:
            service.leases.release(reservation)
    assert lease_count(app) == 0


def wait_for_live_lock(app, query_fragment):
    deadline = time.monotonic() + 5
    while True:
        with app.state.sessions() as observer:
            waiting = observer.scalar(text(
                "SELECT EXISTS (SELECT 1 FROM pg_locks AS locks JOIN pg_stat_activity AS activity USING (pid) "
                "WHERE activity.datname = current_database() AND locks.granted = false "
                "AND activity.query LIKE :query)"
            ), {"query": f"%{query_fragment}%"})
        if waiting:
            return
        assert time.monotonic() < deadline, "The operation never appeared as waiting in pg_locks."


@pytest.mark.parametrize("ending", ["revoked", "expired"])
def test_live_admission_rechecks_revocation_after_a_proven_account_lock_wait(client, app, ending):
    person = account(client, app)
    service = app.state.live
    with app.state.sessions.begin() as locked:
        locked.execute(select(User).where(User.id == person["user"]["id"]).with_for_update())
        with ThreadPoolExecutor(max_workers=1) as worker:
            future = worker.submit(service.acquire, person["session_token"])
            try:
                wait_for_live_lock(app, "account_sessions%FOR UPDATE")
                values = {"revoked_at": app.state.clock()} if ending == "revoked" else {"expires_at": app.state.clock()}
                locked.execute(update(AccountSession).where(
                    AccountSession.account_id == person["user"]["id"],
                ).values(**values))
                locked.commit()
                with pytest.raises(DomainError) as refused:
                    future.result(timeout=10)
                assert refused.value.status == 401
            finally:
                locked.rollback()
    assert lease_count(app) == 0


@pytest.mark.parametrize("ending", ["before_start", "start_error", "send_error", "disconnect", "cancel_send", "timeout", "revoked", "stalled_send", "expired_before_start", "expired_after_start"])
def test_live_response_owns_and_releases_its_reservation(client, app, ending):
    person = account(client, app)
    service = app.state.live
    service.heartbeat_seconds = 0.01
    service.recheck_seconds = 0
    service.max_seconds = 0.03
    service.leases.renew_seconds = 0.25
    service.leases.lease_seconds = 3
    reservation = service.acquire(person["session_token"])
    pool = app.state.engine.pool
    assert pool.checkedout() == 0

    async def scenario():
        response = LiveResponse(service, person["session_token"], reservation)
        frames = []
        blocked = asyncio.Event()
        if ending == "expired_before_start":
            reservation.deadline = time.monotonic() - 1
        if ending == "before_start":
            async def never_started(_send):
                blocked.set()
                await asyncio.Event().wait()
            response.stream_response = never_started
        if ending == "revoked":
            assert client.post("/v1/auth/logout", headers=auth(person)).status_code == 200

        async def receive():
            if ending == "before_start":
                await blocked.wait()
                return {"type": "http.disconnect"}
            if ending == "disconnect":
                await blocked.wait()
                return {"type": "http.disconnect"}
            await asyncio.Event().wait()

        async def send_frame(message):
            frames.append(message)
            if ending == "expired_after_start" and message["type"] == "http.response.start":
                reservation.deadline = time.monotonic() - 1
            if ending == "start_error" and message["type"] == "http.response.start":
                raise OSError("synthetic start failure")
            if message["type"] == "http.response.body":
                blocked.set()
                if ending == "send_error":
                    raise OSError("synthetic write failure")
                if ending in ("cancel_send", "stalled_send"):
                    await asyncio.Event().wait()

        task = asyncio.create_task(response({}, receive, send_frame))
        if ending == "cancel_send":
            await blocked.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        elif ending in ("start_error", "send_error"):
            with pytest.raises(OSError):
                await task
        elif ending == "expired_before_start":
            with pytest.raises(DomainError) as refused:
                await task
            assert refused.value.status == 503
            assert frames == []
        else:
            await asyncio.wait_for(task, timeout=5)
        body = b"".join(message.get("body", b"") for message in frames)
        if ending == "timeout":
            assert b'"reason":"time_limit"' in body
        if ending == "revoked":
            assert b'"reason":"signed_out"' in body
        if ending == "stalled_send":
            assert b"event: end" not in body
        if ending == "expired_after_start":
            assert body == b"", "Expired ownership sent a pending frame."

    asyncio.run(scenario())
    assert app.state.live_hub.count(person["user"]["id"]) == 0
    assert lease_count(app) == 0
    assert pool.checkedout() == 0


def test_live_expired_ownership_cannot_renew_or_release_its_replacement(client, app):
    person = account(client, app)
    leases = app.state.live.leases
    stale = app.state.live.acquire(person["session_token"])
    with app.state.sessions.begin() as database:
        database.execute(update(LiveConnectionLease).where(LiveConnectionLease.id == stale.id).values(
            expires_at=func.clock_timestamp() - timedelta(seconds=1),
        ))
    with pytest.raises(DomainError) as refused:
        leases.renew(stale)
    assert refused.value.status == 503
    replacement = app.state.live.acquire(person["session_token"])
    leases.release(stale)
    leases.release(stale)
    leases.renew(replacement)
    with app.state.sessions() as database:
        assert database.get(LiveConnectionLease, replacement.id) is not None
        assert database.get(LiveConnectionLease, stale.id) is None
    with pytest.raises(DomainError):
        leases.renew(stale)
    leases.release(replacement)
    assert lease_count(app) == 0


def test_live_expired_dead_account_leases_are_reclaimed_in_bounded_batches(client, app):
    person = account(client, app)
    leases = app.state.live.leases
    with app.state.sessions.begin() as database:
        database.add_all([LiveConnectionLease(
            id=str(uuid4()), account_id=person["user"]["id"],
            expires_at=func.clock_timestamp() - timedelta(seconds=1),
        ) for _index in range(leases.cleanup_limit + 1)])
    leases.cleanup()
    assert lease_count(app) == 1
    leases.cleanup()
    assert lease_count(app) == 0
    abandoned = app.state.live.acquire(person["session_token"])
    with app.state.sessions.begin() as database:
        database.execute(update(LiveConnectionLease).where(LiveConnectionLease.id == abandoned.id).values(
            expires_at=func.clock_timestamp() - timedelta(seconds=1),
        ))
    deadline = time.monotonic() + leases.renew_seconds + 5
    while lease_count(app):
        assert time.monotonic() < deadline, "The reaper required this account to reconnect."
    with pytest.raises(DomainError):
        leases.renew(abandoned)


@pytest.mark.parametrize("failure", ["authentication", "admission", "renewal", "subscription"])
def test_live_coordination_failure_never_falls_back_to_local_quota(client, app, monkeypatch, failure):
    person = account(client, app)
    service = app.state.live

    def unavailable(*_args, **_kwargs):
        raise OperationalError("synthetic coordination outage", {}, Exception())

    if failure in ("authentication", "admission"):
        if failure == "authentication":
            monkeypatch.setattr(service.identity, "authenticate", unavailable)
        else:
            monkeypatch.setattr(service.leases, "count", unavailable)
        response = client.get("/v1/live", headers=auth(person))
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
        assert "event: ready" not in response.text
    else:
        reservation = service.acquire(person["session_token"])
        if failure == "renewal":
            configure = service.leases.configure

            def fail_once(database):
                monkeypatch.setattr(service.leases, "configure", configure)
                unavailable()

            monkeypatch.setattr(service.leases, "configure", fail_once)
        else:
            monkeypatch.setattr(service.hub, "subscribe", unavailable)

        async def scenario():
            stream = service.stream(person["session_token"], person["user"]["id"], reservation)
            with pytest.raises(DomainError) as refused:
                await anext(stream)
            assert refused.value.status == 503
            await stream.aclose()

        asyncio.run(scenario())
    assert lease_count(app) == 0
    assert service.hub.count(person["user"]["id"]) == 0


def test_live_renewal_does_not_change_the_heartbeat_cadence(client, app):
    person = account(client, app)
    service = app.state.live
    service.heartbeat_seconds = 0.3
    service.leases.renew_seconds = 0.03

    async def scenario():
        stream = service.stream(person["session_token"], person["user"]["id"])
        try:
            assert await anext(stream) == "retry: 5000\n\n"
            assert (await anext(stream)).startswith("event: ready")
            started = time.monotonic()
            assert await anext(stream) == ": keep-alive\n\n"
            assert time.monotonic() - started >= 0.28, "Lease maintenance emitted an early heartbeat."
        finally:
            await stream.aclose()

    asyncio.run(scenario())
    assert lease_count(app) == 0


@pytest.mark.parametrize("failure", ["renewal", "authentication"])
def test_live_coordination_loss_after_ready_closes_without_a_completion(client, app, monkeypatch, failure):
    person = account(client, app)
    service = app.state.live
    service.heartbeat_seconds = service.leases.renew_seconds = 0.01
    service.recheck_seconds = 0

    async def scenario():
        stream = service.stream(person["session_token"], person["user"]["id"])
        assert await anext(stream) == "retry: 5000\n\n"
        assert (await anext(stream)).startswith("event: ready")
        configure = service.leases.configure

        def fail_once(database):
            monkeypatch.setattr(service.leases, "configure", configure)
            raise OperationalError("synthetic lost coordination", {}, Exception())

        if failure == "renewal":
            monkeypatch.setattr(service.leases, "configure", fail_once)
        else:
            def fail_authentication(*_args, **_kwargs):
                raise OperationalError("synthetic unavailable session check", {}, Exception())

            monkeypatch.setattr(service.identity, "authenticate", fail_authentication)
        with pytest.raises(StopAsyncIteration):
            await anext(stream)
        await stream.aclose()

    asyncio.run(scenario())
    assert lease_count(app) == 0


def test_live_reaper_cleans_a_dead_process_without_new_admissions(client, app):
    person = account(client, app)
    with app.state.sessions.begin() as database:
        database.add(LiveConnectionLease(
            id=str(uuid4()), account_id=person["user"]["id"],
            expires_at=func.clock_timestamp() - timedelta(seconds=1),
        ))
    deadline = time.monotonic() + app.state.live.leases.renew_seconds + 5
    while lease_count(app):
        assert time.monotonic() < deadline, "Idle API processes did not reclaim dead-process leases."


def test_live_admission_lock_wait_is_finite_and_leaves_no_reservation(client, app):
    person = account(client, app)
    with app.state.sessions.begin() as locked:
        locked.execute(select(User).where(User.id == person["user"]["id"]).with_for_update())
        with ThreadPoolExecutor(max_workers=1) as worker:
            started = time.monotonic()
            future = worker.submit(app.state.live.acquire, person["session_token"])
            wait_for_live_lock(app, "account_sessions%FOR UPDATE")
            with pytest.raises(DomainError) as refused:
                future.result(timeout=5)
            assert refused.value.status == 503
            assert time.monotonic() - started < 5
    assert lease_count(app) == 0
    assert app.state.engine.pool.checkedout() == 0


def test_live_renewal_rechecks_database_expiry_after_a_proven_lock_wait(client, app):
    person = account(client, app)
    service = app.state.live
    reservation = service.acquire(person["session_token"])
    try:
        with app.state.sessions.begin() as locked:
            locked.execute(select(LiveConnectionLease).where(LiveConnectionLease.id == reservation.id).with_for_update())
            with ThreadPoolExecutor(max_workers=1) as worker:
                future = worker.submit(service.leases.renew, reservation)
                try:
                    wait_for_live_lock(app, "live_connection_leases%FOR UPDATE")
                    locked.execute(update(LiveConnectionLease).where(LiveConnectionLease.id == reservation.id).values(
                        expires_at=func.clock_timestamp() - timedelta(seconds=1),
                    ))
                    locked.commit()
                    with pytest.raises(DomainError) as refused:
                        future.result(timeout=5)
                    assert refused.value.status == 503
                finally:
                    locked.rollback()
        with app.state.sessions() as database:
            assert database.scalar(select(LiveConnectionLease.expires_at <= func.clock_timestamp()).where(
                LiveConnectionLease.id == reservation.id,
            ))
    finally:
        service.leases.release(reservation)


def test_live_renewal_rejects_unchanged_row_expiry_without_persisting_extension(client, app):
    person = account(client, app)
    service = app.state.live
    reservation = service.acquire(person["session_token"])
    try:
        with app.state.sessions.begin() as database:
            expiry = database.scalar(update(LiveConnectionLease).where(
                LiveConnectionLease.id == reservation.id,
            ).values(expires_at=func.clock_timestamp() + timedelta(seconds=0.5)).returning(LiveConnectionLease.expires_at))
        reservation.deadline = time.monotonic() + 0.5
        with app.state.sessions.begin() as locked, ThreadPoolExecutor(max_workers=1) as worker:
            locked.execute(select(LiveConnectionLease).where(LiveConnectionLease.id == reservation.id).with_for_update())
            future = worker.submit(service.leases.renew, reservation)
            try:
                wait_for_live_lock(app, "live_connection_leases%")
                while True:
                    with app.state.sessions() as observer:
                        expired = observer.scalar(select(func.clock_timestamp() >= expiry))
                    if expired and time.monotonic() >= reservation.deadline:
                        break
                locked.commit()
                with pytest.raises(DomainError) as refused:
                    future.result(timeout=5)
                assert refused.value.status == 503
            finally:
                locked.rollback()
        with app.state.sessions() as database:
            assert database.scalar(select(LiveConnectionLease.expires_at).where(
                LiveConnectionLease.id == reservation.id,
            )) == expiry, "A refused late renewal committed an extension."
    finally:
        service.leases.release(reservation)


def test_live_release_pool_exhaustion_is_bounded_and_returns_every_checkout(client, app, monkeypatch):
    person = account(client, app)
    leases = app.state.live.leases
    reservation = app.state.live.acquire(person["session_token"])
    engine = getattr(leases, "engine", app.state.engine)
    capacity = engine.pool.size() + engine.pool._max_overflow
    monkeypatch.setattr(engine.pool, "_timeout", 0.8 if engine is app.state.engine else engine.pool.timeout())
    held = [engine.connect() for _index in range(capacity)]
    try:
        with ThreadPoolExecutor(max_workers=1) as worker:
            started = time.monotonic()
            worker.submit(leases.release, reservation).result(timeout=2)
            assert time.monotonic() - started < 0.65, "Release waited on the general-purpose pool."
    finally:
        for connection in held:
            connection.close()
        leases.release(reservation)
    assert engine.pool.checkedout() == 0
    assert app.state.engine.pool.checkedout() == 0
    assert lease_count(app) == 0


def test_live_route_cancellation_during_acquire_releases_before_response_handoff(client, app, monkeypatch):
    person = account(client, app)
    service = app.state.live
    entered, proceed = threading.Event(), threading.Event()
    held, responses = [], []
    acquire = service.acquire

    def paused(token):
        reservation = acquire(token)
        held.append(reservation)
        entered.set()
        assert proceed.wait(timeout=5)
        return reservation

    monkeypatch.setattr(service, "acquire", paused)

    async def scenario():
        async with anyio.create_task_group() as group:
            scopes = []

            async def request():
                with anyio.CancelScope() as scope:
                    scopes.append(scope)
                    responses.append(await live_route(Request({
                        "type": "http", "app": app,
                        "headers": [(b"authorization", ("Bearer " + person["session_token"]).encode())],
                    })))

            group.start_soon(request)
            assert await anyio.to_thread.run_sync(lambda: entered.wait(timeout=5))
            scopes[0].cancel()
            proceed.set()

    try:
        anyio.run(scenario)
        assert responses == [], "A cancelled request handed off an unowned response."
        assert lease_count(app) == 0
        assert service.hub.count(person["user"]["id"]) == 0
        assert service.leases.engine.pool.checkedout() == 0
    finally:
        proceed.set()
        for reservation in held:
            service.leases.release(reservation)


def test_live_lease_deadlines_include_elapsed_database_call_time(client, app, monkeypatch):
    person = account(client, app)
    leases = app.state.live.leases
    # Acquire reads the clock twice and renewal starts at 102; renewal's later checks all read 103.
    ticks = itertools.chain([100.0, 101.0, 102.0], itertools.repeat(103.0))
    monkeypatch.setattr(lease_module, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    reservation = app.state.live.acquire(person["session_token"])
    try:
        assert reservation.deadline == pytest.approx(100 + leases.lease_seconds - 0.1)
        leases.renew(reservation)
        assert reservation.deadline == pytest.approx(102 + leases.lease_seconds - 0.1)
    finally:
        leases.release(reservation)


def test_live_lease_migration_preserves_identity_and_refuses_active_downgrade(client, app):
    person = account(client, app)
    service = app.state.live
    reservation = service.acquire(person["session_token"])
    config = Config("alembic.ini")
    try:
        with pytest.raises(RuntimeError, match="Live connections must expire"):
            command.downgrade(config, "0046")
        assert lease_count(app) == 1
        assert client.get("/v1/me", headers=auth(person)).status_code == 200
    finally:
        service.leases.release(reservation)
    try:
        command.downgrade(config, "0046")
        assert client.get("/v1/me", headers=auth(person)).json()["data"]["id"] == person["user"]["id"]
    finally:
        command.upgrade(config, "head")
    from tests.test_migrations import test_migrated_schema_matches_models
    test_migrated_schema_matches_models(app)


def test_live_reaper_is_owned_by_the_serving_application_lifespan(app):
    leases = app.state.live.leases
    assert leases.thread is None, "Constructing an application started database cleanup."
    with TestClient(app):
        worker = leases.thread
        assert worker is not None and worker.is_alive()
    assert not worker.is_alive()
    assert app.state.engine.pool.checkedout() == 0
