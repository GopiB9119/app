from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.modules.events.models import EventExpense
from tests import test_migrations
from tests.test_events import create, outbox
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, roster_entry
from tests.test_spaces import create_space


def budget(client, person, event_id):
    return client.get(f"/v1/events/{event_id}/budget", headers=auth(person))


def save(client, person, event_id, etag, currency="INR", categories=()):
    headers = auth(person) if etag is None else {**auth(person), "If-Match": etag}
    return client.put(f"/v1/events/{event_id}/budget", headers=headers, json={"currency": currency, "categories": list(categories)})


def spend(client, person, event_id, amount, note="Snacks", category_id=None, key=None):
    body = {"amount_minor": amount, "note": note}
    if category_id is not None:
        body["category_id"] = category_id
    return client.post(f"/v1/events/{event_id}/expenses", headers={**auth(person), "Idempotency-Key": key or str(uuid4())}, json=body)


def remove(client, person, event_id, expense_id):
    return client.delete(f"/v1/events/{event_id}/expenses/{expense_id}", headers=auth(person))


def gathering(client, app, **changes):
    """Alex owns the Space, Sam organizes the event and Riya is a member; all of them were in before the event."""
    alex = account(client, app)
    sam = account(client, app, "sam@example.test")
    riya = account(client, app, "riya@example.test")
    space_id = create_space(client, alex).json()["data"]["id"]
    admit(client, alex, space_id, sam)
    admit(client, alex, space_id, riya)
    advance(app, minutes=1)
    created = create(client, sam, space_id, **changes)
    assert created.status_code == 201, created.text
    return alex, sam, riya, space_id, created.json()["data"]


def planned(client, sam, event_id, currency="INR", categories=None):
    """Sam sets a budget with Venue (15,000.00) and Food (9,999.99) unless told otherwise."""
    current = budget(client, sam, event_id).json()["data"]
    saved = save(client, sam, event_id, current["etag"], currency, categories if categories is not None else [
        {"name": "Venue", "estimate_minor": 1_500_000}, {"name": "Food", "estimate_minor": 999_999},
    ])
    assert saved.status_code == 200, saved.text
    return saved.json()["data"]


def named(view, name):
    return next(item for item in view["categories"] if item["name"] == name)


def test_totals_are_exact_sums_of_the_entered_amounts(client, app):
    alex, sam, riya, _space_id, event = gathering(client, app)
    empty = budget(client, riya, event["id"])
    assert empty.status_code == 200, empty.text
    assert empty.json()["data"] == {
        "event_id": event["id"], "currency": None, "categories": [], "expenses": [], "estimate_minor": 0,
        "recorded_minor": 0, "uncategorized_minor": 0, "remaining_minor": 0, "contributions": [], "all_contributions": False,
        "given_minor": 0, "promised_minor": 0, "contribution_count": 0, "split": None, "split_candidates": [],
        "can_manage": False, "can_record": False,
        "etag": None,
    }
    view = planned(client, sam, event["id"])
    venue, food = named(view, "Venue")["id"], named(view, "Food")["id"]
    assert [item["name"] for item in view["categories"]] == ["Venue", "Food"]
    # 0.10 + 0.20 is 0.30 exactly, and so on: nothing is a floating-point number.
    for person, amount, category in ((riya, 10, food), (alex, 20, food), (sam, 333_333, venue), (riya, 5, None)):
        recorded = spend(client, person, event["id"], amount, category_id=category)
        assert recorded.status_code == 201, recorded.text
        advance(app, seconds=1)
    view = budget(client, riya, event["id"]).json()["data"]
    assert (named(view, "Food")["recorded_minor"], named(view, "Food")["remaining_minor"]) == (30, 999_969)
    assert (named(view, "Venue")["recorded_minor"], named(view, "Venue")["remaining_minor"]) == (333_333, 1_166_667)
    assert (view["estimate_minor"], view["recorded_minor"], view["uncategorized_minor"], view["remaining_minor"]) == (
        2_499_999, 333_368, 5, 2_166_631,
    )
    # Newest first, with who recorded each one; only Riya's own are marked as hers.
    assert [(item["amount_minor"], item["recorded_by_name"], item["mine"]) for item in view["expenses"]] == [
        (5, "Alex Morgan", True), (333_333, "Alex Morgan", False), (20, "Alex Morgan", False), (10, "Alex Morgan", True),
    ]
    assert view["can_record"] is True and view["can_manage"] is False and view["etag"] is None
    # Over budget shows as a negative remainder, and the largest amounts still add up exactly.
    assert spend(client, sam, event["id"], 100_000_000_000, category_id=venue).status_code == 201
    over = budget(client, sam, event["id"]).json()["data"]
    assert named(over, "Venue")["remaining_minor"] == 1_500_000 - 333_333 - 100_000_000_000
    assert over["remaining_minor"] == 2_499_999 - 333_368 - 100_000_000_000
    assert over["recorded_minor"] == 100_000_333_368
    assert outbox(app, "event.expense.recorded") == 5 and outbox(app, "event.budget.updated") == 1


def test_only_the_organizer_or_owner_changes_the_plan_and_only_from_the_current_version(client, app):
    alex, sam, riya, _space_id, event = gathering(client, app)
    first = budget(client, sam, event["id"]).json()["data"]
    assert first["can_manage"] is True and first["etag"]
    denied = save(client, riya, event["id"], first["etag"], categories=[{"name": "Cake", "estimate_minor": 1}])
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "EVENT_MANAGEMENT_DENIED"
    missing = save(client, sam, event["id"], None)
    assert missing.status_code == 428 and missing.json()["error"]["code"] == "PRECONDITION_REQUIRED"
    wrong = save(client, sam, event["id"], '"stale"')
    assert wrong.status_code == 412 and wrong.json()["error"]["code"] == "BUDGET_CHANGED"
    view = planned(client, sam, event["id"])
    stale = save(client, sam, event["id"], first["etag"])
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "BUDGET_CHANGED"
    # Sending the same plan again changes nothing, not even the version.
    same = save(client, sam, event["id"], view["etag"], categories=[
        {"id": item["id"], "name": item["name"], "estimate_minor": item["estimate_minor"]} for item in view["categories"]
    ])
    assert same.status_code == 200 and same.json()["data"]["etag"] == view["etag"]
    assert outbox(app, "event.budget.updated") == 1

    # The Space owner manages it too. Renaming keeps a category's id, so what was recorded in it stays there.
    food = named(view, "Food")
    assert spend(client, riya, event["id"], 4_500, category_id=food["id"]).status_code == 201
    owner_view = budget(client, alex, event["id"]).json()["data"]
    assert owner_view["can_manage"] is True and owner_view["etag"] == view["etag"]
    renamed = save(client, alex, event["id"], owner_view["etag"], categories=[
        {"id": food["id"], "name": "Meals", "estimate_minor": 5_000}, {"name": "Decorations", "estimate_minor": 0},
    ])
    assert renamed.status_code == 200, renamed.text
    renamed_view = renamed.json()["data"]
    assert [(item["id"] == food["id"], item["name"], item["recorded_minor"], item["remaining_minor"]) for item in renamed_view["categories"]] == [
        (True, "Meals", 4_500, 500), (False, "Decorations", 0, 0),
    ]
    assert renamed_view["etag"] != view["etag"]

    etag = renamed_view["etag"]
    kept = [{"id": item["id"], "name": item["name"], "estimate_minor": item["estimate_minor"]} for item in renamed_view["categories"]]
    invalid = [
        {"currency": "JPY", "categories": kept},
        {"currency": "inr", "categories": kept},
        {"currency": "INR", "categories": kept + [{"name": "meals", "estimate_minor": 1}]},
        {"currency": "INR", "categories": kept + [{"id": kept[0]["id"], "name": "Again", "estimate_minor": 1}]},
        {"currency": "INR", "categories": [{"name": f"Part {number}", "estimate_minor": 1} for number in range(31)]},
        {"currency": "INR", "categories": [{"name": "Cake", "estimate_minor": -1}]},
        {"currency": "INR", "categories": [{"name": "Cake", "estimate_minor": 10.5}]},
        {"currency": "INR", "categories": [{"name": "Cake", "estimate_minor": "10"}]},
        {"currency": "INR", "categories": [{"name": "Cake", "estimate_minor": 100_000_000_001}]},
        {"currency": "INR", "categories": [{"name": "   ", "estimate_minor": 1}]},
        {"currency": "INR", "categories": [{"name": "x" * 61, "estimate_minor": 1}]},
        {"currency": "INR", "categories": [{"name": "Cake\u202e", "estimate_minor": 1}]},
        {"currency": "INR", "categories": [], "extra": True},
    ]
    for body in invalid:
        refused = client.put(f"/v1/events/{event['id']}/budget", headers={**auth(sam), "If-Match": etag}, json=body)
        assert refused.status_code == 422, (body, refused.text)
    unknown = save(client, sam, event["id"], etag, categories=kept + [{"id": str(uuid4()), "name": "Ghost", "estimate_minor": 1}])
    assert unknown.status_code == 409 and unknown.json()["error"]["code"] == "CATEGORY_UNAVAILABLE"
    thirty = save(client, sam, event["id"], etag, categories=kept[:1] + [{"name": f"Part {number}", "estimate_minor": 1} for number in range(29)])
    assert thirty.status_code == 200 and len(thirty.json()["data"]["categories"]) == 30


def test_the_currency_and_used_categories_stay_while_expenses_point_at_them(client, app):
    _alex, sam, riya, _space_id, event = gathering(client, app)
    view = planned(client, sam, event["id"])
    moved = save(client, sam, event["id"], view["etag"], "USD", [
        {"id": item["id"], "name": item["name"], "estimate_minor": item["estimate_minor"]} for item in view["categories"]
    ])
    assert moved.status_code == 200 and moved.json()["data"]["currency"] == "USD"
    view = moved.json()["data"]
    food = named(view, "Food")
    recorded = spend(client, riya, event["id"], 1_250, note="Bread", category_id=food["id"]).json()["data"]
    kept = [{"id": item["id"], "name": item["name"], "estimate_minor": item["estimate_minor"]} for item in view["categories"]]
    locked = save(client, sam, event["id"], view["etag"], "EUR", kept)
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "BUDGET_CURRENCY_LOCKED"
    in_use = save(client, sam, event["id"], view["etag"], "USD", [item for item in kept if item["id"] != food["id"]])
    assert in_use.status_code == 409 and in_use.json()["error"]["code"] == "CATEGORY_IN_USE"
    assert "Food" in in_use.json()["error"]["message"]
    assert budget(client, sam, event["id"]).json()["data"]["etag"] == view["etag"]
    # Recording into a category that is gone is refused rather than filed somewhere else.
    food_only = save(client, sam, event["id"], view["etag"], "USD", [item for item in kept if item["id"] == food["id"]])
    assert food_only.status_code == 200, food_only.text
    gone = spend(client, riya, event["id"], 99, category_id=named(view, "Venue")["id"])
    assert gone.status_code == 409 and gone.json()["error"]["code"] == "CATEGORY_UNAVAILABLE"
    # Once the expense is deleted, both changes go through.
    [expense] = recorded["expenses"]
    assert remove(client, riya, event["id"], expense["id"]).status_code == 200
    emptied = save(client, sam, event["id"], food_only.json()["data"]["etag"], "EUR", [])
    assert emptied.status_code == 200, emptied.text
    assert (emptied.json()["data"]["currency"], emptied.json()["data"]["categories"]) == ("EUR", [])


def test_expenses_retry_exactly_and_only_the_recorder_or_a_manager_deletes_them(client, app):
    alex, sam, riya, space_id, _event = gathering(client, app)
    tom = account(client, app, "tom@example.test")
    admit(client, alex, space_id, tom)
    advance(app, minutes=1)
    # A new event, so Tom, admitted last, sees it too.
    event = create(client, sam, space_id, title="Market day", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    early = spend(client, riya, event["id"], 100)
    assert early.status_code == 409 and early.json()["error"]["code"] == "BUDGET_NOT_SET"
    planned(client, sam, event["id"])
    key = str(uuid4())
    first = spend(client, riya, event["id"], 2_500, note="Flowers", key=key)
    assert first.status_code == 201, first.text
    again = spend(client, riya, event["id"], 2_500, note="Flowers", key=key)
    assert again.status_code == 201 and len(again.json()["data"]["expenses"]) == 1
    conflict = spend(client, riya, event["id"], 2_600, note="Flowers", key=key)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    # The same key from someone else is a different expense.
    assert len(spend(client, alex, event["id"], 2_500, note="Flowers", key=key).json()["data"]["expenses"]) == 2
    for body in (
        {"amount_minor": 0, "note": "Zero"}, {"amount_minor": 100_000_000_001, "note": "Too much"},
        {"amount_minor": 12.5, "note": "Half"}, {"amount_minor": "100", "note": "Text"}, {"amount_minor": True, "note": "Yes"},
        {"amount_minor": 100, "note": ""}, {"amount_minor": 100, "note": "  "}, {"amount_minor": 100, "note": "x" * 121},
        {"amount_minor": 100, "note": "Gift\u202e"}, {"amount_minor": 100}, {"amount_minor": 100, "note": "Ok", "paid": True},
        {"amount_minor": 100, "note": "Ok", "category_id": "not-an-id"},
    ):
        refused = client.post(f"/v1/events/{event['id']}/expenses", headers={**auth(riya), "Idempotency-Key": str(uuid4())}, json=body)
        assert refused.status_code == 422, (body, refused.text)
    assert client.post(f"/v1/events/{event['id']}/expenses", headers=auth(riya), json={"amount_minor": 1, "note": "No key"}).status_code == 422

    view = budget(client, tom, event["id"]).json()["data"]
    flowers = next(item for item in view["expenses"] if item["recorded_by_name"] and item["mine"] is False and item["amount_minor"] == 2_500)
    assert all(item["can_delete"] is False for item in view["expenses"])
    denied = remove(client, tom, event["id"], flowers["id"])
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "EXPENSE_DELETE_DENIED"
    riyas = [item for item in budget(client, riya, event["id"]).json()["data"]["expenses"] if item["mine"]]
    assert [(item["note"], item["can_delete"]) for item in riyas] == [("Flowers", True)]
    assert all(item["can_delete"] for item in budget(client, sam, event["id"]).json()["data"]["expenses"])
    # The organizer deletes Riya's; deleting it again finds nothing left, and nothing else changes.
    deleted = remove(client, sam, event["id"], riyas[0]["id"])
    assert deleted.status_code == 200 and [item["id"] for item in deleted.json()["data"]["expenses"]] != []
    assert riyas[0]["id"] not in [item["id"] for item in deleted.json()["data"]["expenses"]]
    repeat = remove(client, riya, event["id"], riyas[0]["id"])
    assert repeat.status_code == 200 and repeat.json()["data"]["recorded_minor"] == 2_500
    alexs = [item for item in budget(client, alex, event["id"]).json()["data"]["expenses"] if item["mine"]]
    assert remove(client, alex, event["id"], alexs[0]["id"]).json()["data"]["expenses"] == []
    assert outbox(app, "event.expense.deleted") == 2


def test_an_event_holds_at_most_200_expenses_even_when_recorded_at_once(client, app):
    _alex, sam, riya, _space_id, event = gathering(client, app)
    planned(client, sam, event["id"])
    with app.state.sessions.begin() as database:
        for _number in range(198):
            database.add(EventExpense(
                id=str(uuid4()), event_id=event["id"], category_id=None, recorder_id=None, recorder_admission_id=None,
                amount_minor=1, note="", creation_key=str(uuid4()), creation_digest="0" * 64, created_at=app.state.clock.now,
            ))
    people = [riya, sam, riya, sam, riya, sam]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda person: spend(client, person, event["id"], 7), people))
    assert sorted(result.status_code for result in results) == [201, 201, 409, 409, 409, 409], [result.text for result in results]
    assert {result.json()["error"]["code"] for result in results if result.status_code == 409} == {"EXPENSE_LIMIT_REACHED"}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(EventExpense).where(EventExpense.event_id == event["id"])) == 200


def test_a_cancelled_budget_reads_but_does_not_change_and_an_ended_one_still_takes_expenses(client, app):
    _alex, sam, riya, space_id, event = gathering(client, app, local_start="2026-09-19T16:00", local_end="2026-09-19T16:30")
    view = planned(client, sam, event["id"])
    advance(app, hours=1, minutes=5)
    late = spend(client, riya, event["id"], 800, note="Taxi home")
    assert late.status_code == 201, late.text
    assert late.json()["data"]["can_record"] is True
    later = save(client, sam, event["id"], view["etag"], categories=[
        {"id": item["id"], "name": item["name"], "estimate_minor": item["estimate_minor"]} for item in view["categories"]
    ] + [{"name": "Transport", "estimate_minor": 1_000}])
    assert later.status_code == 200, later.text

    other = create(client, sam, space_id, title="Picnic", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    planned(client, sam, other["id"])
    key = str(uuid4())
    kept = spend(client, riya, other["id"], 1_500, note="Fruit", key=key).json()["data"]
    cancelled = client.post(f"/v1/events/{other['id']}/cancel", headers={**auth(sam), "If-Match": other["etag"]}, json={})
    assert cancelled.status_code == 200, cancelled.text
    frozen = budget(client, riya, other["id"])
    assert frozen.status_code == 200
    data = frozen.json()["data"]
    assert (data["can_record"], data["can_manage"], data["recorded_minor"]) == (False, False, 1_500)
    assert all(item["can_delete"] is False for item in data["expenses"])
    manager_view = budget(client, sam, other["id"]).json()["data"]
    assert manager_view["can_manage"] is False and all(item["can_delete"] is False for item in manager_view["expenses"])
    for response in (
        save(client, sam, other["id"], manager_view["etag"], "USD"),
        spend(client, riya, other["id"], 300, note="Ice"),
        remove(client, riya, other["id"], kept["expenses"][0]["id"]),
    ):
        assert response.status_code == 409 and response.json()["error"]["code"] == "EVENT_CANCELLED", response.text
    # A retry of what was recorded before the cancellation still answers with that expense.
    retry = spend(client, riya, other["id"], 1_500, note="Fruit", key=key)
    assert retry.status_code == 201 and retry.json()["data"]["recorded_minor"] == 1_500


def test_the_budget_is_seen_only_by_people_who_see_the_event(client, app):
    alex, sam, riya, space_id, event = gathering(client, app)
    view = planned(client, sam, event["id"])
    recorded = spend(client, riya, event["id"], 500).json()["data"]
    stranger = account(client, app, "stranger@example.test")
    advance(app, minutes=1)
    late = account(client, app, "late@example.test")
    admit(client, alex, space_id, late)
    for person in (stranger, late):
        assert budget(client, person, event["id"]).status_code == 404
        assert save(client, person, event["id"], view["etag"]).status_code == 404
        assert spend(client, person, event["id"], 100).status_code == 404
        assert remove(client, person, event["id"], recorded["expenses"][0]["id"]).status_code == 404
    assert client.get(f"/v1/events/{event['id']}/budget").status_code == 401
    assert client.get(f"/v1/events/{uuid4()}/budget", headers=auth(riya)).status_code == 404
    # Someone who left no longer sees it; what they recorded stays, under their name.
    reviewed = roster_entry(client, alex, space_id, riya["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space_id}/members/{riya['user']['id']}/remove",
        headers={**auth(alex), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    assert budget(client, riya, event["id"]).status_code == 404
    remaining = budget(client, sam, event["id"]).json()["data"]
    assert [(item["amount_minor"], item["recorded_by_name"], item["can_delete"]) for item in remaining["expenses"]] == [(500, "Alex Morgan", True)]
    # An expense of one event cannot be deleted through another.
    other = create(client, sam, space_id, title="Picnic", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    planned(client, sam, other["id"])
    assert remove(client, sam, other["id"], remaining["expenses"][0]["id"]).status_code == 200
    assert budget(client, sam, event["id"]).json()["data"]["recorded_minor"] == 500


def test_budget_routes_need_sessions_and_document_their_headers(client):
    schema = client.get("/openapi.json").json()
    paths = {
        "/v1/events/{event_id}/budget": {"get", "put"}, "/v1/events/{event_id}/expenses": {"post"},
        "/v1/events/{event_id}/expenses/{expense_id}": {"delete"},
    }
    for path, methods in paths.items():
        assert set(schema["paths"][path]) == methods
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
    header = lambda path, method: {item["name"] for item in schema["paths"][path][method]["parameters"] if item["in"] == "header"}
    assert header("/v1/events/{event_id}/budget", "put") == {"if-match"}
    assert header("/v1/events/{event_id}/expenses", "post") == {"idempotency-key"}


def test_parallel_plan_changes_from_one_version_save_once(client, app):
    _alex, sam, _riya, _space_id, event = gathering(client, app)
    etag = budget(client, sam, event["id"]).json()["data"]["etag"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(
            lambda number: save(client, sam, event["id"], etag, categories=[{"name": f"Plan {number}", "estimate_minor": number}]),
            range(4),
        ))
    assert sorted(result.status_code for result in results) == [200, 412, 412, 412], [result.text for result in results]
    assert len(budget(client, sam, event["id"]).json()["data"]["categories"]) == 1


def test_the_migration_refuses_a_downgrade_that_would_lose_budgets(client, app):
    _alex, sam, riya, _space_id, event = gathering(client, app)
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0040")
    finally:
        command.upgrade(config, "head")
    planned(client, sam, event["id"])
    assert spend(client, riya, event["id"], 100).status_code == 201
    with pytest.raises(RuntimeError, match="budgets"):
        command.downgrade(config, "0040")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()
    assert budget(client, riya, event["id"]).json()["data"]["recorded_minor"] == 100
    test_migrations.test_migrated_schema_matches_models(app)
