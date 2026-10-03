from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.modules.events.models import EventContribution
from tests import test_migrations
from tests.test_event_budgets import budget, gathering, planned, save, spend
from tests.test_events import create, outbox
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, roster_entry


def give(client, person, event_id, amount, state="given", note=None, key=None):
    body = {"amount_minor": amount, "state": state}
    if note is not None:
        body["note"] = note
    return client.post(
        f"/v1/events/{event_id}/contributions", headers={**auth(person), "Idempotency-Key": key or str(uuid4())}, json=body,
    )


def mark(client, person, event_id, contribution_id, state):
    return client.put(f"/v1/events/{event_id}/contributions/{contribution_id}", headers=auth(person), json={"state": state})


def withdraw(client, person, event_id, contribution_id):
    return client.delete(f"/v1/events/{event_id}/contributions/{contribution_id}", headers=auth(person))


def own(view):
    return [item for item in view["contributions"] if item["mine"]]


def shown(view):
    return [(item["amount_minor"], item["state"], item["note"], item["mine"], item["can_change"]) for item in view["contributions"]]


def test_people_record_their_own_contributions_and_only_managers_see_who_gave_what(client, app):
    alex, sam, riya, _space_id, event = gathering(client, app)
    early = give(client, riya, event["id"], 100)
    assert early.status_code == 409 and early.json()["error"]["code"] == "BUDGET_NOT_SET"
    plan = planned(client, sam, event["id"])
    for person, amount, state, note in (
        (riya, 50_000, "given", "Cash to Sam"), (alex, 10_000, "promised", "From Alex"), (riya, 25_050, "promised", "   "),
    ):
        recorded = give(client, person, event["id"], amount, state, note)
        assert recorded.status_code == 201, recorded.text
        advance(app, seconds=1)

    # Riya sees her own two and the totals; who else gave, and how much, is not hers to see.
    view = budget(client, riya, event["id"]).json()["data"]
    assert shown(view) == [(25_050, "promised", None, True, True), (50_000, "given", "Cash to Sam", True, True)]
    assert (view["all_contributions"], view["given_minor"], view["promised_minor"], view["contribution_count"]) == (
        False, 50_000, 35_050, 3,
    )
    # Contributions are kept apart: the plan and the expenses add up exactly as before.
    assert (view["estimate_minor"], view["recorded_minor"], view["remaining_minor"]) == (plan["estimate_minor"], 0, plan["estimate_minor"])
    # The organizer sees each one with the name of the person who recorded it, and changes none of them.
    organizer = budget(client, sam, event["id"]).json()["data"]
    assert organizer["all_contributions"] is True and organizer["contribution_count"] == 3
    assert [(item["amount_minor"], item["contributor_name"], item["mine"], item["can_change"]) for item in organizer["contributions"]] == [
        (25_050, "Alex Morgan", False, False), (10_000, "Alex Morgan", False, False), (50_000, "Alex Morgan", False, False),
    ]
    # So does the Space owner, whose own promise is the only one they can change.
    owner = budget(client, alex, event["id"]).json()["data"]
    assert owner["all_contributions"] is True
    assert [(item["amount_minor"], item["mine"], item["can_change"]) for item in owner["contributions"]] == [
        (25_050, False, False), (10_000, True, True), (50_000, False, False),
    ]
    assert outbox(app, "event.contribution.recorded") == 3

    for body in (
        {"amount_minor": 0, "state": "given"}, {"amount_minor": 100_000_000_001, "state": "given"},
        {"amount_minor": 12.5, "state": "given"}, {"amount_minor": "100", "state": "given"}, {"amount_minor": True, "state": "given"},
        {"amount_minor": 100}, {"amount_minor": 100, "state": "paid"}, {"amount_minor": 100, "state": "GIVEN"},
        {"amount_minor": 100, "state": "given", "note": "x" * 121}, {"amount_minor": 100, "state": "given", "note": "Gift\u202e"},
        {"amount_minor": 100, "state": "given", "contributor_id": alex["user"]["id"]},
    ):
        refused = client.post(
            f"/v1/events/{event['id']}/contributions", headers={**auth(riya), "Idempotency-Key": str(uuid4())}, json=body,
        )
        assert refused.status_code == 422, (body, refused.text)
    no_key = client.post(f"/v1/events/{event['id']}/contributions", headers=auth(riya), json={"amount_minor": 1, "state": "given"})
    assert no_key.status_code == 422
    assert budget(client, sam, event["id"]).json()["data"]["contribution_count"] == 3


def test_only_the_contributor_marks_it_given_or_withdraws_it_and_retries_change_nothing(client, app):
    alex, sam, riya, space_id, event = gathering(client, app)
    planned(client, sam, event["id"])
    key = str(uuid4())
    first = give(client, riya, event["id"], 7_500, "promised", "Sweets", key=key)
    assert first.status_code == 201, first.text
    again = give(client, riya, event["id"], 7_500, "promised", "Sweets", key=key)
    assert again.status_code == 201 and again.json()["data"]["contribution_count"] == 1
    conflict = give(client, riya, event["id"], 7_500, "given", "Sweets", key=key)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    [promise] = own(again.json()["data"])

    # Nobody else changes or withdraws it, not even the organizer or the Space owner.
    for person in (sam, alex):
        for response in (mark(client, person, event["id"], promise["id"], "given"), withdraw(client, person, event["id"], promise["id"])):
            assert response.status_code == 403 and response.json()["error"]["code"] == "CONTRIBUTION_CHANGE_DENIED", response.text
    given = mark(client, riya, event["id"], promise["id"], "given")
    assert given.status_code == 200, given.text
    assert (given.json()["data"]["given_minor"], given.json()["data"]["promised_minor"]) == (7_500, 0)
    assert mark(client, riya, event["id"], promise["id"], "given").status_code == 200
    assert outbox(app, "event.contribution.changed") == 1
    back = mark(client, riya, event["id"], promise["id"], "promised").json()["data"]
    assert (back["given_minor"], back["promised_minor"]) == (0, 7_500)
    assert outbox(app, "event.contribution.changed") == 2
    for state in ("paid", "", None):
        refused = client.put(f"/v1/events/{event['id']}/contributions/{promise['id']}", headers=auth(riya), json={"state": state})
        assert refused.status_code == 422, refused.text

    # It belongs to its event: another event of the Space does not find it.
    other = create(client, sam, space_id, title="Picnic", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    planned(client, sam, other["id"])
    elsewhere = mark(client, riya, other["id"], promise["id"], "given")
    assert elsewhere.status_code == 404 and elsewhere.json()["error"]["code"] == "CONTRIBUTION_NOT_FOUND"
    assert withdraw(client, riya, other["id"], promise["id"]).json()["data"]["contribution_count"] == 0

    gone = withdraw(client, riya, event["id"], promise["id"])
    assert gone.status_code == 200 and gone.json()["data"]["contributions"] == []
    assert gone.json()["data"]["contribution_count"] == 0
    # Withdrawing again finds nothing left; marking it now says it was withdrawn.
    assert withdraw(client, riya, event["id"], promise["id"]).status_code == 200
    late = mark(client, riya, event["id"], promise["id"], "given")
    assert late.status_code == 404 and late.json()["error"]["code"] == "CONTRIBUTION_NOT_FOUND"
    assert outbox(app, "event.contribution.withdrawn") == 1 and outbox(app, "event.contribution.changed") == 2


def test_contributions_lock_the_currency_and_follow_the_event(client, app):
    _alex, sam, riya, space_id, event = gathering(client, app, local_start="2026-09-19T16:00", local_end="2026-09-19T16:30")
    view = planned(client, sam, event["id"])
    kept = [{"id": item["id"], "name": item["name"], "estimate_minor": item["estimate_minor"]} for item in view["categories"]]
    recorded = give(client, riya, event["id"], 900).json()["data"]
    locked = save(client, sam, event["id"], view["etag"], "USD", kept)
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "BUDGET_CURRENCY_LOCKED"
    assert "contribution" in locked.json()["error"]["message"]
    assert withdraw(client, riya, event["id"], own(recorded)[0]["id"]).status_code == 200
    moved = save(client, sam, event["id"], view["etag"], "USD", kept)
    assert moved.status_code == 200 and moved.json()["data"]["currency"] == "USD"
    # After the event ends, people still record and mark what they gave.
    advance(app, hours=1, minutes=5)
    late = give(client, riya, event["id"], 1_200, "promised")
    assert late.status_code == 201 and late.json()["data"]["can_record"] is True
    assert mark(client, riya, event["id"], own(late.json()["data"])[0]["id"], "given").status_code == 200

    other = create(client, sam, space_id, title="Picnic", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    planned(client, sam, other["id"])
    key = str(uuid4())
    kept_promise = own(give(client, riya, other["id"], 1_500, "promised", "Fruit", key=key).json()["data"])[0]
    cancelled = client.post(f"/v1/events/{other['id']}/cancel", headers={**auth(sam), "If-Match": other["etag"]}, json={})
    assert cancelled.status_code == 200, cancelled.text
    frozen = budget(client, riya, other["id"]).json()["data"]
    assert (frozen["can_record"], frozen["promised_minor"], shown(frozen)) == (False, 1_500, [(1_500, "promised", "Fruit", True, False)])
    for response in (
        give(client, riya, other["id"], 300),
        mark(client, riya, other["id"], kept_promise["id"], "given"),
        withdraw(client, riya, other["id"], kept_promise["id"]),
    ):
        assert response.status_code == 409 and response.json()["error"]["code"] == "EVENT_CANCELLED", response.text
    # A retry of what was recorded before the cancellation, or of the state it has, still answers.
    retry = give(client, riya, other["id"], 1_500, "promised", "Fruit", key=key)
    assert retry.status_code == 201 and retry.json()["data"]["contribution_count"] == 1
    assert mark(client, riya, other["id"], kept_promise["id"], "promised").status_code == 200


def test_an_event_holds_at_most_200_contributions_even_when_recorded_at_once(client, app):
    _alex, sam, riya, _space_id, event = gathering(client, app)
    planned(client, sam, event["id"])
    with app.state.sessions.begin() as database:
        for _number in range(198):
            database.add(EventContribution(
                id=str(uuid4()), event_id=event["id"], contributor_id=None, contributor_admission_id=None, amount_minor=1,
                state="given", note=None, creation_key=str(uuid4()), creation_digest="0" * 64,
                created_at=app.state.clock.now, updated_at=app.state.clock.now,
            ))
    people = [riya, sam, riya, sam, riya, sam]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda person: give(client, person, event["id"], 7), people))
    assert sorted(result.status_code for result in results) == [201, 201, 409, 409, 409, 409], [result.text for result in results]
    assert {result.json()["error"]["code"] for result in results if result.status_code == 409} == {"CONTRIBUTION_LIMIT_REACHED"}
    with app.state.sessions() as database:
        assert database.scalar(
            select(func.count()).select_from(EventContribution).where(EventContribution.event_id == event["id"])
        ) == 200
    # Expenses have their own limit, so a full list of contributions does not stop them.
    assert spend(client, riya, event["id"], 5).status_code == 201


def test_contributions_are_seen_only_by_people_who_see_the_event(client, app):
    alex, sam, riya, space_id, event = gathering(client, app)
    planned(client, sam, event["id"])
    [gift] = own(give(client, riya, event["id"], 500, note="Riya 7731").json()["data"])
    stranger = account(client, app, "stranger@example.test")
    advance(app, minutes=1)
    late = account(client, app, "late@example.test")
    admit(client, alex, space_id, late)
    for person in (stranger, late):
        assert give(client, person, event["id"], 100).status_code == 404
        assert mark(client, person, event["id"], gift["id"], "promised").status_code == 404
        assert withdraw(client, person, event["id"], gift["id"]).status_code == 404
    assert client.post(f"/v1/events/{event['id']}/contributions", headers={"Idempotency-Key": str(uuid4())},
                       json={"amount_minor": 1, "state": "given"}).status_code == 401
    # Someone removed from the Space no longer sees or changes it; what they gave stays, under their name.
    reviewed = roster_entry(client, alex, space_id, riya["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space_id}/members/{riya['user']['id']}/remove",
        headers={**auth(alex), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    assert mark(client, riya, event["id"], gift["id"], "promised").status_code == 404
    remaining = budget(client, sam, event["id"]).json()["data"]
    assert [(item["amount_minor"], item["note"], item["contributor_name"], item["can_change"]) for item in remaining["contributions"]] == [
        (500, "Riya 7731", "Alex Morgan", False),
    ]
    assert budget(client, alex, event["id"]).json()["data"]["given_minor"] == 500


def test_contribution_routes_need_sessions_and_document_their_headers(client):
    schema = client.get("/openapi.json").json()
    paths = {
        "/v1/events/{event_id}/contributions": {"post"},
        "/v1/events/{event_id}/contributions/{contribution_id}": {"put", "delete"},
    }
    for path, methods in paths.items():
        assert set(schema["paths"][path]) == methods
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
    header = lambda path, method: {item["name"] for item in schema["paths"][path][method]["parameters"] if item["in"] == "header"}
    assert header("/v1/events/{event_id}/contributions", "post") == {"idempotency-key"}
    assert header("/v1/events/{event_id}/contributions/{contribution_id}", "put") == set()


def test_the_migration_refuses_a_downgrade_that_would_lose_contributions(client, app):
    _alex, sam, riya, _space_id, event = gathering(client, app)
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0042")
    finally:
        command.upgrade(config, "head")
    planned(client, sam, event["id"])
    assert give(client, riya, event["id"], 100).status_code == 201
    with pytest.raises(RuntimeError, match="contributions"):
        command.downgrade(config, "0042")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()
    assert budget(client, riya, event["id"]).json()["data"]["given_minor"] == 100
    test_migrations.test_migrated_schema_matches_models(app)
