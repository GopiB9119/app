import json
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import create_app
from app.modules.identity.models import AccountSession, Challenge, IdentityMail, OutboxEvent, SecurityEvent, User

PASSWORD = "Meadow-signal-47!"


def begin(client, app, email="alex@example.test", context=None, key=None, purpose="register"):
    context = context or secrets.token_urlsafe(32)
    key = key or str(uuid4())
    response = client.post(
        f"/v1/auth/{purpose}",
        json={"email": email, "context_secret": context},
        headers={"Idempotency-Key": key},
    )
    assert response.status_code == 202, response.text
    identifier = response.json()["data"]["challenge_id"]
    with app.state.sessions() as database:
        mail = database.get(IdentityMail, identifier)
        payload = json.loads(app.state.security.open(mail.payload_cipher))
    return {"challenge_id": identifier, "context_secret": context, "code": payload["code"]}


def verify(client, proof, password=PASSWORD):
    return client.post(
        "/v1/auth/verify-email",
        json={**proof, "password": password, "display_name": "Alex Morgan", "timezone": "Asia/Kolkata"},
    )


def account(client, app, email="alex@example.test"):
    response = verify(client, begin(client, app, email))
    assert response.status_code == 201, response.text
    return response.json()["data"]


def auth(result):
    return {"Authorization": f"Bearer {result['session_token']}"}


def test_registration_login_profile_and_persistence(client, app):
    result = account(client, app)
    headers = auth(result)
    profile = client.get("/v1/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["data"]["email_verified"] is True
    assert profile.headers["cache-control"] == "no-store"
    assert profile.headers["etag"].endswith('-1"')
    changed = client.patch(
        "/v1/me/profile",
        json={"display_name": "Alex M", "timezone": "Europe/London"},
        headers={**headers, "If-Match": profile.headers["etag"]},
    )
    assert changed.status_code == 200
    assert changed.json()["data"]["version"] == 2
    app.state.engine.dispose()
    assert client.get("/v1/me", headers=headers).json()["data"]["display_name"] == "Alex M"
    logged_in = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD})
    assert logged_in.status_code == 200
    assert logged_in.json()["data"]["user"]["id"] == result["user"]["id"]


def test_pending_registration_is_not_an_account(client, app):
    begin(client, app)
    response = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD})
    assert response.status_code == 401
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(User)) == 0


def test_signup_idempotency_and_changed_payload_conflict(client, app):
    context = secrets.token_urlsafe(32)
    key = str(uuid4())
    first = begin(client, app, context=context, key=key)
    repeated = begin(client, app, context=context, key=key)
    assert first == repeated
    conflict = client.post(
        "/v1/auth/register",
        json={"email": "other@example.test", "context_secret": context},
        headers={"Idempotency-Key": key},
    )
    assert conflict.status_code == 409
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(IdentityMail)) == 1


def test_proof_is_bound_to_context_and_consumed_once(client, app):
    proof = begin(client, app)
    assert verify(client, {**proof, "context_secret": secrets.token_urlsafe(32)}).status_code == 400
    assert verify(client, proof).status_code == 201
    assert verify(client, proof).status_code == 400
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AccountSession)) == 1


def test_attacker_preregistration_cannot_enroll_a_password(client, app):
    attacker = begin(client, app)
    legitimate = begin(client, app)
    assert verify(client, legitimate).status_code == 201
    assert verify(client, attacker, "Attacker-password-77!").status_code == 400
    failed = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": "Attacker-password-77!"})
    assert failed.status_code == 401


def test_wrong_codes_have_durable_attempt_limits(client, app):
    proof = begin(client, app)
    bad = "000000" if proof["code"] != "000000" else "000001"
    for _attempt in range(5):
        assert verify(client, {**proof, "code": bad}).status_code == 400
    assert verify(client, proof).status_code in (400, 429)
    with app.state.sessions() as database:
        assert database.get(Challenge, proof["challenge_id"]).attempts == 5


def test_expired_proof_fails_without_creating_account(client, app):
    proof = begin(client, app)
    app.state.clock.now += timedelta(minutes=16)
    assert verify(client, proof).status_code == 400


def test_registration_and_recovery_proofs_are_not_interchangeable(client, app):
    proof = begin(client, app, purpose="recover")
    assert verify(client, proof).status_code == 400


def test_unknown_and_wrong_password_errors_match(client, app):
    account(client, app)
    unknown = client.post("/v1/auth/login", json={"email": "nobody@example.test", "password": PASSWORD})
    wrong = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": "wrong-password"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["error"] == wrong.json()["error"]


def test_session_revocation_is_owner_scoped_and_immediate(client, app):
    first = account(client, app)
    second = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD}).json()["data"]
    foreign = account(client, app, "other@example.test")
    denied = client.delete(f"/v1/me/sessions/{second['session_id']}", headers=auth(foreign))
    assert denied.status_code == 404
    assert client.delete(f"/v1/me/sessions/{second['session_id']}", headers=auth(first)).status_code == 200
    assert client.get("/v1/me", headers=auth(second)).status_code == 401
    assert client.get("/v1/me", headers=auth(first)).status_code == 200
    assert client.delete(f"/v1/me/sessions/{second['session_id']}", headers=auth(first)).status_code == 200


def test_revoke_others_preserves_current_session(client, app):
    first = account(client, app)
    second = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD}).json()["data"]
    assert client.post("/v1/me/sessions/revoke-others", headers=auth(first)).status_code == 200
    assert client.get("/v1/me", headers=auth(first)).status_code == 200
    assert client.get("/v1/me", headers=auth(second)).status_code == 401


def test_logout_expiry_and_account_restriction(client, app):
    first = account(client, app)
    assert client.post("/v1/auth/logout", headers=auth(first)).status_code == 200
    assert client.get("/v1/me", headers=auth(first)).status_code == 401
    logged_in = client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD}).json()["data"]
    app.state.clock.now += timedelta(hours=9)
    assert client.get("/v1/me", headers=auth(logged_in)).status_code == 401
    with app.state.sessions.begin() as database:
        database.get(User, first["user"]["id"]).status = "suspended"
    assert client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD}).status_code == 401


def test_profile_preconditions_and_mass_assignment(client, app):
    result = account(client, app)
    headers = auth(result)
    body = {"display_name": "Changed", "timezone": "UTC"}
    assert client.patch("/v1/me/profile", headers=headers, json=body).status_code == 428
    assert client.patch("/v1/me/profile", headers={**headers, "If-Match": '"stale"'}, json=body).status_code == 412
    assert client.patch("/v1/me/profile", headers=headers, json={**body, "status": "active"}).status_code == 422


def test_password_reset_revokes_old_sessions_and_proofs(client, app):
    result = account(client, app)
    proof = begin(client, app, purpose="recover")
    reset = {**proof, "password": "Another-strong-passphrase-53!"}
    assert client.post("/v1/auth/reset-password", json=reset).status_code == 200
    assert client.get("/v1/me", headers=auth(result)).status_code == 401
    assert client.post("/v1/auth/reset-password", json=reset).status_code == 400
    assert client.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD}).status_code == 401
    assert client.post("/v1/auth/login", json={"email": "alex@example.test", "password": reset["password"]}).status_code == 200


def test_secrets_are_not_stored_in_audit_or_plaintext_columns(client, app):
    result = account(client, app)
    with app.state.sessions() as database:
        user = database.get(User, result["user"]["id"])
        assert user.password_hash.startswith("$argon2id$")
        assert "alex@example.test" not in user.email_cipher
        session = database.get(AccountSession, result["session_id"])
        assert session.token_digest != result["session_token"]
        audit = database.scalars(select(SecurityEvent)).all()
        outbox = database.scalars(select(OutboxEvent)).all()
        assert len(audit) == len(outbox) == 2
        assert {event.id for event in audit} == {event.id for event in outbox}


def test_login_rate_limit_survives_new_http_clients(client, app):
    for _attempt in range(10):
        response = client.post("/v1/auth/login", json={"email": "none@example.test", "password": PASSWORD})
        assert response.status_code == 401
    with TestClient(app) as second:
        response = second.post("/v1/auth/login", json={"email": "none@example.test", "password": PASSWORD})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "900"


def login_from(http, number, address=None, key="synthetic-proxy-key"):
    headers = {} if address is None else {"X-Community-Client-Address": address, "X-Community-Proxy-Key": key}
    body = {"email": f"visitor-{number}@example.test", "password": PASSWORD}
    return http.post("/v1/auth/login", json=body, headers=headers).status_code


def test_sign_in_limits_count_each_browser_network_named_by_the_web_proxy(app):
    settings = app.state.settings.model_copy(update={"network_limit": 3, "proxy_key": "synthetic-proxy-key"})
    with TestClient(create_app(settings, app.state.clock)) as http:
        assert [login_from(http, number, "198.51.100.7") for number in range(4)] == [401, 401, 401, 429]
        assert login_from(http, 10, "198.51.100.8") == 401
        assert login_from(http, 11, "::ffff:198.51.100.7") == 429
        assert [login_from(http, 20 + number, f"2001:db8:1:2::{number + 1}") for number in range(4)] == [401, 401, 401, 429]
        assert login_from(http, 30, "2001:db8:1:3::1") == 401
        assert [login_from(http, 40 + number, "203.0.113.9", key="wrong-key") for number in range(3)] == [401, 401, 401]
        assert login_from(http, 50, "not-an-address") == 429
        assert login_from(http, 51) == 429
        assert login_from(http, 52, "203.0.113.9") == 401


def test_named_browser_address_is_ignored_without_a_configured_proxy_key(app):
    settings = app.state.settings.model_copy(update={"network_limit": 2})
    with TestClient(create_app(settings, app.state.clock)) as http:
        assert [login_from(http, number, f"192.0.2.{number + 1}") for number in range(3)] == [401, 401, 429]


def test_parallel_verification_has_one_account_and_session(client, app):
    proof = begin(client, app)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _index: verify(client, proof).status_code, range(2)))
    assert sorted(results) == [201, 400]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(User)) == 1
        assert database.scalar(select(func.count()).select_from(AccountSession)) == 1


def test_parallel_registration_retry_has_one_challenge(client, app):
    context = secrets.token_urlsafe(32)
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _index: begin(client, app, context=context, key=key), range(2)))
    assert results[0] == results[1]


def test_unauthenticated_and_validation_errors_are_safe(client):
    assert client.get("/v1/me").status_code == 401
    response = client.post("/v1/auth/login", json={"email": "real@example.com", "password": "private-value"})
    assert response.status_code == 422
    assert "private-value" not in response.text
    assert "real@example.com" not in response.text
    assert set(response.json()) == {"error", "request_id"}
    assert client.post("/v1/auth/login", content=b"x" * 17000).status_code == 413


def test_timezone_reference_and_openapi_are_available(client):
    assert "Asia/Kolkata" in client.get("/v1/timezones").json()["data"]
    schema = client.get("/openapi.json").json()
    assert "/v1/auth/verify-email" in schema["paths"]
    assert "session_token" in schema["components"]["schemas"]["AuthView"]["properties"]


def test_openapi_marks_only_protected_identity_and_export_operations_as_signed_in(client):
    schema = client.get("/openapi.json").json()
    protected = [
        ("get", "/v1/me"), ("patch", "/v1/me/profile"), ("get", "/v1/me/sessions"),
        ("delete", "/v1/me/sessions/{session_id}"), ("post", "/v1/me/sessions/revoke-others"),
        ("post", "/v1/auth/logout"), ("get", "/v1/me/security-events"), ("post", "/v1/me/exports"),
        ("get", "/v1/me/exports"), ("get", "/v1/me/exports/{export_id}"), ("delete", "/v1/me/exports/{export_id}"),
        ("get", "/v1/me/exports/{export_id}/archive"),
    ]
    for method, path in protected:
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}], (method, path)
    public = [
        ("post", "/v1/auth/register"), ("post", "/v1/auth/verify-email"), ("post", "/v1/auth/login"),
        ("post", "/v1/auth/recover"), ("post", "/v1/auth/reset-password"), ("get", "/v1/timezones"),
    ]
    for method, path in public:
        assert "security" not in schema["paths"][path][method], (method, path)
    assert client.get("/v1/me").status_code == 401
    assert client.get("/v1/me/exports").status_code == 401