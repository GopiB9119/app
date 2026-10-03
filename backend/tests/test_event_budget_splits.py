from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from tests import test_migrations
from tests.test_event_budgets import budget, gathering, planned, save, spend
from tests.test_events import outbox
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, roster_entry


def split(client, person, event_id, etag, method="equal", base="planned", people=()):
    headers = auth(person) if etag is None else {**auth(person), "If-Match": etag}
    return client.put(f"/v1/events/{event_id}/budget/split", headers=headers, json={"method": method, "base": base, "people": list(people)})


def unsplit(client, person, event_id, etag):
    headers = auth(person) if etag is None else {**auth(person), "If-Match": etag}
    return client.delete(f"/v1/events/{event_id}/budget/split", headers=headers)


def ids(*people):
    return [{"account_id": person["user"]["id"]} for person in people]


def valued(*pairs):
    return [{"account_id": person["user"]["id"], "value": value} for person, value in pairs]


def shares(view):
    return [(item["share_minor"], item["rounded_up"], item["mine"]) for item in view["split"]["shares"]]


def test_equal_and_percentage_shares_add_up_exactly_and_say_how_they_were_rounded(client, app):
    alex, sam, riya, _space_id, event = gathering(client, app)
    plan = planned(client, sam, event["id"], categories=[{"name": "Venue", "estimate_minor": 10_000}])
    assert [item["name"] for item in plan["split_candidates"]] == ["Alex Morgan"] * 3
    equal = split(client, sam, event["id"], plan["etag"], people=ids(riya, alex, sam))
    assert equal.status_code == 200, equal.text
    view = equal.json()["data"]["split"]
    # 100.00 does not divide by 3: the first person listed carries the extra paisa, and nothing is lost.
    assert (view["method"], view["base"], view["base_minor"], view["people_count"], view["allocated_minor"]) == ("equal", "planned", 10_000, 3, 10_000)
    assert (view["difference_minor"], view["rounding_count"], view["all_shares"]) == (0, 1, True)
    assert shares(equal.json()["data"]) == [(3_334, True, False), (3_333, False, False), (3_333, False, True)]
    # Riya sees how it is divided and her own share; the Space owner sees every share.
    mine = budget(client, riya, event["id"]).json()["data"]
    assert (mine["split"]["people_count"], mine["split"]["all_shares"], shares(mine)) == (3, False, [(3_334, True, True)])
    assert mine["split_candidates"] == []
    assert len(budget(client, alex, event["id"]).json()["data"]["split"]["shares"]) == 3

    # Percentages of what was actually spent: 1.01 by 33.33%, 33.33% and 33.34% loses two paise to rounding, which
    # go to the shares that lost the most, the person listed first winning the tie.
    assert spend(client, riya, event["id"], 101).status_code == 201
    current = budget(client, sam, event["id"]).json()["data"]
    divided = split(client, sam, event["id"], current["etag"], "percentages", "recorded", valued((riya, 3_333), (alex, 3_333), (sam, 3_334)))
    assert divided.status_code == 200, divided.text
    view = divided.json()["data"]["split"]
    assert (view["base_minor"], view["allocated_minor"], view["rounding_count"]) == (101, 101, 2)
    assert [(item["value"], item["share_minor"], item["rounded_up"]) for item in view["shares"]] == [(3_333, 34, True), (3_333, 33, False), (3_334, 34, True)]
    # The shares follow the spending as it changes.
    assert spend(client, alex, event["id"], 99).status_code == 201
    later = budget(client, sam, event["id"]).json()["data"]["split"]
    assert (later["base_minor"], [item["share_minor"] for item in later["shares"]], later["rounding_count"]) == (200, [67, 66, 67], 2)
    assert outbox(app, "event.budget.split.updated") == 2


def test_set_amounts_are_never_adjusted_and_show_the_difference(client, app):
    _alex, sam, riya, _space_id, event = gathering(client, app)
    plan = planned(client, sam, event["id"], categories=[{"name": "Venue", "estimate_minor": 10_000}])
    under = split(client, sam, event["id"], plan["etag"], "amounts", people=valued((riya, 6_000), (sam, 3_000))).json()["data"]["split"]
    assert (under["allocated_minor"], under["difference_minor"], under["rounding_count"]) == (9_000, 1_000, 0)
    assert [(item["value"], item["share_minor"]) for item in under["shares"]] == [(6_000, 6_000), (3_000, 3_000)]
    # The organizer covers everything with one set amount of the whole total.
    current = budget(client, sam, event["id"]).json()["data"]["etag"]
    covered = split(client, sam, event["id"], current, "amounts", people=valued((sam, 10_000))).json()["data"]["split"]
    assert (covered["people_count"], covered["allocated_minor"], covered["difference_minor"]) == (1, 10_000, 0)
    assert budget(client, riya, event["id"]).json()["data"]["split"]["shares"] == []
    # Over the total shows as a negative difference, not a smaller share.
    current = budget(client, sam, event["id"]).json()["data"]["etag"]
    over = split(client, sam, event["id"], current, "amounts", people=valued((riya, 8_000), (sam, 8_000))).json()["data"]["split"]
    assert (over["allocated_minor"], over["difference_minor"]) == (16_000, -6_000)


def test_only_managers_split_from_the_current_version_and_only_among_people_who_see_the_event(client, app):
    alex, sam, riya, space_id, event = gathering(client, app)
    early = split(client, sam, event["id"], budget(client, sam, event["id"]).json()["data"]["etag"], people=ids(sam))
    assert early.status_code == 409 and early.json()["error"]["code"] == "BUDGET_NOT_SET"
    plan = planned(client, sam, event["id"])
    denied = split(client, riya, event["id"], plan["etag"], people=ids(riya))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "EVENT_MANAGEMENT_DENIED"
    assert split(client, sam, event["id"], None, people=ids(sam)).status_code == 428
    assert split(client, sam, event["id"], '"stale"', people=ids(sam)).json()["error"]["code"] == "BUDGET_CHANGED"
    stranger = account(client, app, "stranger@example.test")
    advance(app, minutes=1)
    late = account(client, app, "late@example.test")
    admit(client, alex, space_id, late)
    for outsider in (stranger, late):
        refused = split(client, sam, event["id"], plan["etag"], people=ids(sam, outsider))
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "PERSON_UNAVAILABLE", refused.text
    assert sorted(item["account_id"] for item in budget(client, sam, event["id"]).json()["data"]["split_candidates"]) == sorted(
        person["user"]["id"] for person in (alex, sam, riya)
    )
    for body in (
        {"method": "equal", "base": "planned", "people": []},
        {"method": "equal", "base": "planned", "people": ids(sam, sam)},
        {"method": "equal", "base": "planned", "people": valued((sam, 1))},
        {"method": "percentages", "base": "planned", "people": valued((sam, 9_999))},
        {"method": "percentages", "base": "planned", "people": valued((sam, 10_001), (riya, 0))},
        {"method": "percentages", "base": "planned", "people": ids(sam)},
        {"method": "amounts", "base": "planned", "people": ids(sam)},
        {"method": "amounts", "base": "planned", "people": valued((sam, -1))},
        {"method": "amounts", "base": "planned", "people": valued((sam, 1.5))},
        {"method": "amounts", "base": "planned", "people": valued((sam, 100_000_000_001))},
        {"method": "shares", "base": "planned", "people": ids(sam)},
        {"method": "equal", "base": "promised", "people": ids(sam)},
        {"method": "equal", "base": "planned", "people": ids(sam), "paid": True},
        {"method": "equal", "base": "planned", "people": [{"account_id": "not-an-id"}]},
        {"method": "equal", "base": "planned", "people": [{"account_id": str(uuid4())} for _ in range(101)]},
    ):
        refused = client.put(f"/v1/events/{event['id']}/budget/split", headers={**auth(sam), "If-Match": plan["etag"]}, json=body)
        assert refused.status_code == 422, (body, refused.text)

    saved = split(client, sam, event["id"], plan["etag"], people=ids(sam, riya)).json()["data"]
    # Saving the same split again changes nothing, not even the version; the plan saved from before the split is refused.
    again = split(client, sam, event["id"], saved["etag"], people=ids(sam, riya))
    assert again.status_code == 200 and again.json()["data"]["etag"] == saved["etag"] != plan["etag"]
    assert outbox(app, "event.budget.split.updated") == 1
    assert save(client, sam, event["id"], plan["etag"]).json()["error"]["code"] == "BUDGET_CHANGED"
    kept = [{"id": item["id"], "name": item["name"], "estimate_minor": item["estimate_minor"]} for item in saved["categories"]]
    locked = save(client, sam, event["id"], saved["etag"], "USD", kept)
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "BUDGET_CURRENCY_LOCKED"
    assert "split" in locked.json()["error"]["message"]
    # The Space owner removes it; removing it again finds nothing left.
    owner = budget(client, alex, event["id"]).json()["data"]
    assert unsplit(client, alex, event["id"], plan["etag"]).json()["error"]["code"] == "BUDGET_CHANGED"
    removed = unsplit(client, alex, event["id"], owner["etag"])
    assert removed.status_code == 200 and removed.json()["data"]["split"] is None
    repeat = unsplit(client, alex, event["id"], removed.json()["data"]["etag"])
    assert repeat.status_code == 200 and repeat.json()["data"]["etag"] == removed.json()["data"]["etag"]
    assert unsplit(client, riya, event["id"], removed.json()["data"]["etag"]).json()["error"]["code"] == "EVENT_MANAGEMENT_DENIED"
    assert outbox(app, "event.budget.split.removed") == 1
    moved = save(client, sam, event["id"], removed.json()["data"]["etag"], "USD", kept)
    assert moved.status_code == 200, moved.text


def test_a_cancelled_split_reads_and_someone_who_left_keeps_their_share(client, app):
    alex, sam, riya, space_id, event = gathering(client, app)
    plan = planned(client, sam, event["id"], categories=[{"name": "Venue", "estimate_minor": 9_000}])
    saved = split(client, sam, event["id"], plan["etag"], people=ids(sam, riya, alex)).json()["data"]
    reviewed = roster_entry(client, alex, space_id, riya["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space_id}/members/{riya['user']['id']}/remove",
        headers={**auth(alex), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    after = budget(client, sam, event["id"]).json()["data"]
    assert [(item["name"], item["share_minor"]) for item in after["split"]["shares"]] == [("Alex Morgan", 3_000)] * 3
    assert riya["user"]["id"] not in [item["account_id"] for item in after["split_candidates"]]
    again = split(client, sam, event["id"], after["etag"], people=ids(sam, riya, alex))
    assert again.status_code == 409 and again.json()["error"]["code"] == "PERSON_UNAVAILABLE"

    cancelled = client.post(f"/v1/events/{event['id']}/cancel", headers={**auth(sam), "If-Match": event["etag"]}, json={})
    assert cancelled.status_code == 200, cancelled.text
    frozen = budget(client, sam, event["id"]).json()["data"]
    assert frozen["split"]["people_count"] == 3 and frozen["split_candidates"] == []
    for response in (split(client, sam, event["id"], frozen["etag"], people=ids(sam)), unsplit(client, sam, event["id"], frozen["etag"])):
        assert response.status_code == 409 and response.json()["error"]["code"] == "EVENT_CANCELLED", response.text
    assert saved["split"]["base_minor"] == 9_000


def test_split_routes_need_sessions_and_document_their_headers(client):
    schema = client.get("/openapi.json").json()
    path = "/v1/events/{event_id}/budget/split"
    assert set(schema["paths"][path]) == {"put", "delete"}
    for method in ("put", "delete"):
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
        assert {item["name"] for item in schema["paths"][path][method]["parameters"] if item["in"] == "header"} == {"if-match"}


def test_the_migration_refuses_a_downgrade_that_would_lose_splits(client, app):
    _alex, sam, riya, _space_id, event = gathering(client, app)
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0043")
    finally:
        command.upgrade(config, "head")
    plan = planned(client, sam, event["id"])
    assert split(client, sam, event["id"], plan["etag"], people=ids(sam, riya)).status_code == 200
    with pytest.raises(RuntimeError, match="split"):
        command.downgrade(config, "0043")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()
    assert budget(client, riya, event["id"]).json()["data"]["split"]["people_count"] == 2
    test_migrations.test_migrated_schema_matches_models(app)
