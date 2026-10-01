import os
import re
import socket
import subprocess
import sys
import time
from datetime import timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.db import Base
from app.errors import DomainError
from app.modules.events.models import SpaceEvent, SpaceEventResponse
from app.modules.identity.models import AccountSession
from app.modules.messaging.models import ConversationMessage, ConversationReadState
from tests.test_events import create as create_event
from tests.test_identity import PASSWORD, account, auth, begin, verify
from tests.test_messaging import expire_while_waiting, family, open_chat, send
from tests.test_spaces import create_space


def counts(app):
    with app.state.sessions() as database:
        return {table.name: database.scalar(select(func.count()).select_from(table)) for table in Base.metadata.sorted_tables}


def protected_operations(app):
    operations = []
    for path, item in app.openapi()["paths"].items():
        for method, operation in item.items():
            if method not in {"get", "post", "put", "patch", "delete"} or not operation.get("security"):
                continue
            parameters = operation.get("parameters", [])
            headers = {parameter["name"].lower() for parameter in parameters if parameter["in"] == "header" and parameter.get("required")}
            operations.append({
                "method": method.upper(), "path": path, "body": "requestBody" in operation,
                # Public reads declare an empty requirement: signing in is optional there, so anonymous calls are allowed.
                "optional": {} in operation["security"],
                "query": any(parameter["in"] == "query" and parameter.get("required") for parameter in parameters),
                "other_headers": bool(headers - {"idempotency-key", "if-match"}),
            })
    return operations


def call(client, operation, headers=None, values=None):
    path = operation["path"]
    for name in re.findall(r"{(\w+)}", path):
        path = path.replace(f"{{{name}}}", str((values or {}).get(name, uuid4())))
    sent = {**(headers or {}), "Idempotency-Key": str(uuid4()), "If-Match": '"stale"'}
    return client.request(operation["method"], path, headers=sent, json={} if operation["body"] else None)


def test_every_protected_operation_refuses_anonymous_and_expired_sessions_without_side_effects(client, app):
    operations = protected_operations(app)
    assert len(operations) > 100
    person = account(client, app)
    app.state.clock.now += timedelta(days=30)
    before = counts(app)
    violations = []
    for label, headers in (("anonymous", None), ("expired", auth(person))):
        for operation in operations:
            if label == "anonymous" and operation["optional"]:
                continue
            response = call(client, operation, headers)
            where = (label, operation["method"], operation["path"], response.status_code, response.text[:120])
            # 422 means the request was invalid before identity was checked; anything else must be the sign-in refusal.
            simple = not (operation["body"] or operation["query"] or operation["other_headers"])
            if response.status_code not in {401, 422} or (simple and response.status_code != 401):
                violations.append(where)
    assert violations == []
    assert counts(app) == before


def test_space_operations_refuse_an_account_that_is_not_a_member_without_side_effects(client, app):
    owner = account(client, app)
    created = client.post("/v1/spaces", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={"name": "Morgan family", "space_type": "family"})
    assert created.status_code == 201, created.text
    space_id = created.json()["data"]["id"]
    outsider = account(client, app, "outsider@example.test")
    before = counts(app)
    checked = 0
    for operation in protected_operations(app):
        if "{space_id}" not in operation["path"]:
            continue
        response = call(client, operation, auth(outsider), {"space_id": space_id})
        assert response.status_code in {403, 404, 422}, (operation["method"], operation["path"], response.status_code, response.text[:160])
        checked += 1
    assert checked >= 20
    assert counts(app) == before


def test_an_unexpected_failure_stays_in_the_application_and_its_message_is_never_written(app, capsys, monkeypatch):
    def broken(_token):
        raise RuntimeError("Sentinel private detail 7731")

    monkeypatch.setattr(app.state.identity, "me", broken)
    # The test client raises any exception that leaves the application, as a server would log it with its message.
    with TestClient(app) as client:
        response = client.get("/v1/me", headers={"Authorization": "Bearer synthetic-token"})
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    captured = capsys.readouterr()
    assert "Sentinel private detail" not in captured.out + captured.err
    assert '"event": "unexpected_error"' in captured.out and "RuntimeError" in captured.out


def test_a_real_server_process_writes_no_private_request_values(app):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    environment = {**os.environ, "COMMUNITY_SECRET_KEY": app.state.settings.secret_key}
    command = [sys.executable, "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port),
               "--no-access-log", "--no-proxy-headers"]
    server = subprocess.Popen(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as client:
            # Starting takes about 12 seconds on a quiet machine and has taken over 60 while other suites ran.
            deadline = time.monotonic() + 120
            while True:
                try:
                    if client.get("/health/live").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                if server.poll() is not None or time.monotonic() >= deadline:
                    server.terminate()
                    errors = server.communicate(timeout=30)[1]
                    raise AssertionError(f"The server did not start (exit code {server.returncode}):\n{errors[-3000:]}")
                time.sleep(0.25)
            assert client.post("/v1/auth/login", json={"email": "sentinel-4471@example.test", "password": "Sentinel-pass-4471!"}).status_code == 401
            assert client.get("/v1/me", headers={"Authorization": "Bearer sentinel-token-4471"}).status_code == 401
            assert client.get("/v1/unknown/sentinel-path-4471", params={"secret": "sentinel-query-4471"}).status_code == 404
            refused = client.post("/v1/pages", headers={"Authorization": "Bearer sentinel-token-4471", "Idempotency-Key": str(uuid4())},
                                  json={"handle": "x", "name": "sentinel-body-4471"})
            assert refused.status_code in {401, 422}
    finally:
        server.terminate()
        output, errors = server.communicate(timeout=30)
    written = output + errors
    assert '"event": "http_request"' in output
    for sentinel in ("sentinel-4471", "Sentinel-pass-4471", "sentinel-token-4471", "sentinel-path-4471", "sentinel-query-4471", "sentinel-body-4471"):
        assert sentinel not in written, sentinel


def test_secrets_never_appear_in_any_stored_row(client, app):
    proof = begin(client, app)
    created = verify(client, proof)
    assert created.status_code == 201, created.text
    login = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD})
    assert login.status_code == 200, login.text
    recovery = begin(client, app, purpose="recover")
    changed = "Another-strong-passphrase-53!"
    assert client.post("/v1/auth/reset-password", json={**recovery, "password": changed}).status_code == 200
    stored = []
    with app.state.sessions() as database:
        for table in Base.metadata.sorted_tables:
            for row in database.execute(select(table)).all():
                stored += [bytes(value).decode("latin-1") if isinstance(value, (bytes, bytearray, memoryview)) else str(value)
                           for value in row if value is not None]
    text = "\n".join(stored)
    assert len(stored) > 50
    for secret in (PASSWORD, changed, created.json()["data"]["session_token"], login.json()["data"]["session_token"],
                   proof["context_secret"], recovery["context_secret"], "alex@example.test"):
        assert secret not in text, secret[:6]
    # Codes are short digits, so they are compared with whole stored words rather than searched inside digests.
    words = set(re.split(r"[^0-9A-Za-z]+", text))
    for code in (proof["code"], recovery["code"]):
        assert code not in words


# Each write below waits for a row lock while the session expires; it must then save nothing (the T04 rule, on the sibling writes).
def test_message_delete_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    message = send(client, member, chat["id"], "Keep this").json()["data"]
    late = expire_while_waiting(app, "conversations", chat["id"], lambda: client.post(
        f"/v1/conversations/{chat['id']}/messages/{message['id']}/delete", headers=auth(member), json={}))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.get(ConversationMessage, message["id"]).deleted_at is None


def test_mark_read_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    send(client, member, chat["id"], "Unread")
    reader = ConversationReadState.account_id == owner["user"]["id"]
    with app.state.sessions() as database:
        before = database.scalar(select(ConversationReadState.read_sequence).where(reader))
    late = expire_while_waiting(app, "users", owner["user"]["id"], lambda: client.post(
        f"/v1/conversations/{chat['id']}/read", headers=auth(owner), json={"through_position": "1"}))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.scalar(select(ConversationReadState.read_sequence).where(reader)) == before


def test_event_creation_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    late = expire_while_waiting(app, "spaces", space_id, lambda: create_event(client, owner, space_id))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceEvent)) == 0


def test_event_cancellation_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    event = create_event(client, owner, space_id).json()["data"]
    late = expire_while_waiting(app, "space_events", event["id"], lambda: client.post(
        f"/v1/events/{event['id']}/cancel", headers={**auth(owner), "If-Match": event["etag"]}, json={}))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.scalar(select(SpaceEvent.status).where(SpaceEvent.id == event["id"])) == "scheduled"


def test_event_answer_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    event = create_event(client, owner, space_id).json()["data"]
    late = expire_while_waiting(app, "space_events", event["id"], lambda: client.post(
        f"/v1/events/{event['id']}/attendance", headers=auth(owner), json={"response": "going"}))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceEventResponse)) == 0

def test_checking_a_session_again_sees_a_revocation_made_meanwhile(client, app):
    # Requests check the session again after waiting, in the same database session; a revocation committed
    # meanwhile must be seen, not hidden by the copy of the session loaded before the wait.
    person = account(client, app)
    with app.state.sessions() as database:
        # Kept, as callers keep it: an unreferenced copy would simply be read again.
        first = app.state.identity.authenticate(database, person["session_token"])
        with app.state.sessions.begin() as other:
            other.execute(update(AccountSession).where(AccountSession.account_id == person["user"]["id"]).values(revoked_at=app.state.clock()))
        with pytest.raises(DomainError) as refused:
            app.state.identity.authenticate(database, person["session_token"])
        assert first[1].account_id == person["user"]["id"]
    assert refused.value.status == 401