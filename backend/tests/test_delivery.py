from datetime import timedelta

from app.modules.identity.delivery import deliver_one
from app.modules.identity.models import IdentityMail
from tests.test_identity import begin, verify


def test_delivery_is_durable_and_secret_payload_is_purged(client, app):
    proof = begin(client, app)
    app.state.engine.dispose()
    sent = []
    assert deliver_one(app.state.identity, sent.append) == "sent"
    assert sent[0]["code"] == proof["code"]
    assert deliver_one(app.state.identity, sent.append) == "idle"
    with app.state.sessions() as database:
        job = database.get(IdentityMail, proof["challenge_id"])
        assert job.payload_cipher is None
        assert job.status == "sent"
        assert job.attempts == 1


def test_delivery_failure_retries_same_proof_with_bound(client, app):
    proof = begin(client, app)
    attempts = []

    def unavailable(payload):
        attempts.append(payload)
        raise OSError("Synthetic SMTP outage")

    for expected in ["retry", "retry", "failed"]:
        assert deliver_one(app.state.identity, unavailable) == expected
        app.state.clock.now += timedelta(seconds=31)
    assert len(attempts) == 3
    assert all(attempt["code"] == proof["code"] for attempt in attempts)
    assert deliver_one(app.state.identity, unavailable) == "idle"


def test_expired_or_consumed_challenges_do_not_send(client, app):
    proof = begin(client, app)
    assert verify(client, proof).status_code == 201
    sent = []
    assert deliver_one(app.state.identity, sent.append) == "cancelled"
    begin(client, app, "second@example.test")
    app.state.clock.now += timedelta(minutes=16)
    assert deliver_one(app.state.identity, sent.append) == "idle"
    assert sent == []


def test_abandoned_claim_is_recovered_with_same_logical_message(client, app):
    proof = begin(client, app)
    with app.state.sessions.begin() as database:
        job = database.get(IdentityMail, proof["challenge_id"])
        job.status = "processing"
        job.attempts = 1
        job.lease_token = "expired-worker"
        job.available_at = app.state.clock.now - timedelta(seconds=1)
    sent = []
    assert deliver_one(app.state.identity, sent.append) == "sent"
    assert sent[0]["challenge_id"] == proof["challenge_id"]


def test_final_abandoned_attempt_is_unknown_not_successful(client, app):
    proof = begin(client, app)
    with app.state.sessions.begin() as database:
        job = database.get(IdentityMail, proof["challenge_id"])
        job.status = "processing"
        job.attempts = 3
        job.available_at = app.state.clock.now - timedelta(seconds=1)
    sent = []
    assert deliver_one(app.state.identity, sent.append) == "idle"
    with app.state.sessions() as database:
        job = database.get(IdentityMail, proof["challenge_id"])
        assert job.status == "unknown"
        assert job.payload_cipher is None
    assert sent == []