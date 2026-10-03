from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from tests import test_migrations
from tests.test_events import create, event_body, read, respond
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, roster_entry
from tests.test_spaces import create_space


def gathering(client, app, people=4):
    """An owner and `people` admitted members, all in before the event is created, so all of them see it."""
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    members = []
    for number in range(people):
        member = account(client, app, f"guest{number}@example.test")
        admit(client, owner, space_id, member)
        members.append(member)
    return owner, members, space_id


def edit(client, actor, event, **changes):
    return client.patch(f"/v1/events/{event['id']}", headers={**auth(actor), "If-Match": event["etag"]}, json=event_body(**changes))


def place(client, actor, event_id):
    view = read(client, actor, event_id).json()["data"]
    return view["my_response"], view["my_waitlist_position"]


def test_capacity_fills_in_answer_order_and_the_waitlist_moves_up(client, app):
    owner, (first, second, third, fourth), space_id = gathering(client, app)
    created = create(client, owner, space_id, capacity=2)
    assert created.status_code == 201, created.text
    event = created.json()["data"]
    assert (event["capacity"], event["going"], event["waitlisted"]) == (2, 0, 0)
    for person in (first, second, third, fourth):
        assert respond(client, person, event["id"], "going").status_code == 200
        advance(app, seconds=1)
    view = read(client, owner, event["id"]).json()["data"]
    assert (view["going"], view["waitlisted"], view["my_waitlist_position"]) == (2, 2, None)
    assert [place(client, person, event["id"]) for person in (first, second, third, fourth)] == [
        ("going", None), ("going", None), ("going", 1), ("going", 2),
    ]
    assert sorted(item["waitlist_position"] or 0 for item in view["attendees"]) == [0, 0, 1, 2]

    # A place opens: the first person waiting is going at once, and the next one moves up.
    moved = respond(client, first, event["id"], "maybe").json()["data"]
    assert (moved["going"], moved["waitlisted"], moved["maybe"], moved["my_waitlist_position"]) == (2, 1, 1, None)
    assert place(client, third, event["id"]) == ("going", None)
    assert place(client, fourth, event["id"]) == ("going", 1)
    # Answering Going again joins the end of the line.
    back = respond(client, first, event["id"], "going").json()["data"]
    assert (back["going"], back["waitlisted"], back["my_waitlist_position"]) == (2, 2, 2)
    advance(app, seconds=1)
    assert respond(client, owner, event["id"], "going").json()["data"]["my_waitlist_position"] == 3

    # Without a capacity nobody waits, as before.
    open_event = create(client, owner, space_id, title="Picnic", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    assert open_event["capacity"] is None
    for person in (first, second, third):
        respond(client, person, open_event["id"], "going")
    unlimited = read(client, owner, open_event["id"]).json()["data"]
    assert (unlimited["going"], unlimited["waitlisted"]) == (3, 0)
    assert all(item["waitlist_position"] is None for item in unlimited["attendees"])


def test_capacity_changes_never_move_people_going_to_the_waitlist(client, app):
    owner, (first, second, third, _fourth), space_id = gathering(client, app)
    event = create(client, owner, space_id, capacity=3).json()["data"]
    for person in (first, second, third):
        respond(client, person, event["id"], "going")
        advance(app, seconds=1)
    event = read(client, owner, event["id"]).json()["data"]
    lower = edit(client, owner, event, capacity=2)
    assert lower.status_code == 409 and lower.json()["error"]["code"] == "CAPACITY_BELOW_GOING", lower.text
    assert read(client, owner, event["id"]).json()["data"]["etag"] == event["etag"]
    # An edit that leaves capacity out, as an older app's would, keeps it.
    renamed = edit(client, owner, event, title="Dinner")
    renamed_data = renamed.json()["data"]
    assert renamed.status_code == 200 and renamed_data["capacity"] == 3 and renamed_data["title"] == "Dinner"
    same = client.patch(
        f"/v1/events/{event['id']}", headers={**auth(owner), "If-Match": renamed_data["etag"]},
        json={**event_body(title="Dinner"), "capacity": 3},
    )
    assert same.status_code == 200 and same.json()["data"]["etag"] == renamed_data["etag"]
    for value in (0, 501, "3", 2.5, True):
        refused = client.patch(
            f"/v1/events/{event['id']}", headers={**auth(owner), "If-Match": renamed_data["etag"]},
            json={**event_body(title="Dinner"), "capacity": value},
        )
        assert refused.status_code == 422, (value, refused.text)

    # With three going and a capacity of three, the fourth waits until the capacity rises or is removed.
    respond(client, owner, event["id"], "going")
    assert place(client, owner, event["id"]) == ("going", 1)
    member_edit = edit(client, first, renamed_data, title="Dinner", capacity=4)
    assert member_edit.status_code == 403
    raised = edit(client, owner, renamed_data, title="Dinner", capacity=4).json()["data"]
    assert (raised["capacity"], raised["going"], raised["waitlisted"], raised["my_waitlist_position"]) == (4, 4, 0, None)
    respond(client, _fourth, event["id"], "going")
    assert place(client, _fourth, event["id"]) == ("going", 1)
    removed = client.patch(
        f"/v1/events/{event['id']}", headers={**auth(owner), "If-Match": raised["etag"]},
        json={**event_body(title="Dinner"), "capacity": None},
    ).json()["data"]
    assert (removed["capacity"], removed["going"], removed["waitlisted"]) == (None, 5, 0)
    assert place(client, _fourth, event["id"]) == ("going", None)
    # A capacity can be set again, but not below the five already going.
    assert edit(client, owner, removed, title="Dinner", capacity=4).json()["error"]["code"] == "CAPACITY_BELOW_GOING"
    assert edit(client, owner, removed, title="Dinner", capacity=5).json()["data"]["capacity"] == 5


def test_a_place_opens_when_someone_going_leaves_the_space_and_reconfirming_keeps_a_place(client, app):
    owner, (first, second, third, _fourth), space_id = gathering(client, app)
    event = create(client, owner, space_id, capacity=1).json()["data"]
    for person in (first, second, third):
        respond(client, person, event["id"], "going")
        advance(app, seconds=1)
    event = read(client, owner, event["id"]).json()["data"]
    advance(app, minutes=1)
    moved = edit(client, owner, event, local_start="2026-09-25T19:00").json()["data"]
    assert moved["capacity"] == 1 and moved["schedule_changed_at"] is not None
    # Confirming Going after the time changed keeps the place: the second still waits first.
    confirmed = respond(client, second, event["id"], "going").json()["data"]
    assert (confirmed["my_response_outdated"], confirmed["my_waitlist_position"]) == (False, 1)
    assert respond(client, first, event["id"], "going").json()["data"]["my_waitlist_position"] is None
    assert place(client, third, event["id"]) == ("going", 2)

    reviewed = roster_entry(client, owner, space_id, first["user"]["id"])
    left = client.post(
        f"/v1/spaces/{space_id}/members/{first['user']['id']}/remove",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert left.status_code == 200, left.text
    after = read(client, owner, event["id"]).json()["data"]
    assert (after["going"], after["waitlisted"]) == (1, 1)
    assert place(client, second, event["id"]) == ("going", None)
    assert place(client, third, event["id"]) == ("going", 1)


def test_parallel_going_answers_never_pass_the_capacity(client, app):
    owner, members, space_id = gathering(client, app, people=6)
    event = create(client, owner, space_id, capacity=2).json()["data"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda person: respond(client, person, event["id"], "going"), members))
    assert all(result.status_code == 200 for result in results), [result.text for result in results]
    view = read(client, owner, event["id"]).json()["data"]
    assert (view["going"], view["waitlisted"]) == (2, 4)
    assert sorted(item["waitlist_position"] or 0 for item in view["attendees"]) == [0, 0, 1, 2, 3, 4]
    positions = [place(client, person, event["id"])[1] for person in members]
    assert sorted(position or 0 for position in positions) == [0, 0, 1, 2, 3, 4]


def test_creation_retries_match_with_and_without_a_capacity(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    key = str(uuid4())
    first = create(client, owner, space_id, key)
    assert first.status_code == 201 and first.json()["data"]["capacity"] is None
    assert create(client, owner, space_id, key).json()["data"]["id"] == first.json()["data"]["id"]
    conflict = create(client, owner, space_id, key, capacity=10)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    limited_key = str(uuid4())
    limited = create(client, owner, space_id, limited_key, title="Picnic", capacity=10).json()["data"]
    assert limited["capacity"] == 10
    assert create(client, owner, space_id, limited_key, title="Picnic", capacity=10).json()["data"]["id"] == limited["id"]
    for value in (0, 501, "10", None):
        response = create(client, owner, space_id, title="Walk", capacity=value)
        assert response.status_code == (201 if value is None else 422), (value, response.text)


def test_capacity_migration_keeps_answers_and_refuses_a_lossy_downgrade(client, app):
    owner, (first, _second, _third, _fourth), space_id = gathering(client, app, people=4)
    open_event = create(client, owner, space_id).json()["data"]
    respond(client, first, open_event["id"], "going")
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0035")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM space_event_responses WHERE response = 'going'")) == 1
    finally:
        command.upgrade(config, "head")
    assert place(client, first, open_event["id"]) == ("going", None)
    limited = create(client, owner, space_id, title="Picnic", capacity=3).json()["data"]
    with pytest.raises(RuntimeError, match="capacity"):
        command.downgrade(config, "0035")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()
    assert read(client, owner, limited["id"]).json()["data"]["capacity"] == 3
    test_migrations.test_migrated_schema_matches_models(app)
