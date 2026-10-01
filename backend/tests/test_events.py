from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from sqlalchemy import func, select

from app.modules.events.models import SpaceEvent
from app.modules.identity.models import OutboxEvent
from app.modules.spaces.models import SpaceAuditEvent
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, family, roster_entry
from tests.test_spaces import create_space


def event_body(**changes):
    return {
        "title": "Grandma's birthday dinner", "description": "Bring a dessert.", "location": "Home",
        "timezone": "Asia/Kolkata", "local_start": "2026-09-25T18:30", "local_end": "2026-09-25T21:00", **changes,
    }


def create(client, actor, space_id, key=None, **changes):
    return client.post(
        f"/v1/spaces/{space_id}/events", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json=event_body(**changes),
    )


def read(client, actor, event_id):
    return client.get(f"/v1/events/{event_id}", headers=auth(actor))


def respond(client, actor, event_id, response):
    return client.post(f"/v1/events/{event_id}/attendance", headers=auth(actor), json={"response": response})


def listed(client, actor, space_id, query=""):
    return client.get(f"/v1/spaces/{space_id}/events{query}", headers=auth(actor))


def outbox(app, action):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == action))


def test_event_created_at_the_same_instant_as_an_admission_stays_hidden(client, app):
    owner = account(client, app)
    member = account(client, app, "chat-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    # The clock does not move: creation and admission share one instant.
    before = create(client, owner, space_id).json()["data"]
    admit(client, owner, space_id, member)
    assert read(client, member, before["id"]).status_code == 404
    assert respond(client, member, before["id"], "going").status_code == 404
    assert listed(client, member, space_id).json()["data"] == []
    after = create(client, owner, space_id, title="Picnic", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    assert [item["id"] for item in listed(client, member, space_id).json()["data"]] == [after["id"]]
    assert read(client, member, after["id"]).status_code == 200


def test_event_edit_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    from tests.test_messaging import expire_while_waiting

    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    event = create(client, owner, space_id).json()["data"]
    late = expire_while_waiting(app, "space_events", event["id"], lambda: client.patch(
        f"/v1/events/{event['id']}", headers={**auth(owner), "If-Match": event["etag"]}, json=event_body(title="Renamed late"),
    ))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.scalar(select(SpaceEvent.title).where(SpaceEvent.id == event["id"])) == "Grandma's birthday dinner"


def test_event_creation_uses_the_zone_retries_exactly_and_respects_admission_history(client, app):
    owner = account(client, app)
    member = account(client, app, "chat-member@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    key = str(uuid4())
    created = create(client, owner, space_id, key)
    assert created.status_code == 201, created.text
    event = created.json()["data"]
    assert event["starts_at"] == "2026-09-25T13:00:00Z" and event["ends_at"] == "2026-09-25T15:30:00Z"
    assert event["local_start"] == "2026-09-25T18:30" and event["timezone"] == "Asia/Kolkata"
    assert event["status"] == "scheduled" and event["can_manage"] is True and event["can_respond"] is True
    assert event["created_by_name"] == "Alex Morgan" and event["attendees"] == [] and event["going"] == 0
    retry = create(client, owner, space_id, key)
    assert retry.status_code == 201 and retry.json()["data"]["id"] == event["id"]
    conflict = create(client, owner, space_id, key, title="Different")
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert outbox(app, "event.created") == 1

    advance(app, minutes=1)
    admit(client, owner, space_id, member)
    advance(app, minutes=1)
    assert read(client, member, event["id"]).status_code == 404
    assert respond(client, member, event["id"], "going").status_code == 404
    assert listed(client, member, space_id).json()["data"] == []
    later = create(client, owner, space_id, title="Picnic", local_start="2026-09-26T10:00", local_end=None).json()["data"]
    assert later["ends_at"] is None
    assert [item["id"] for item in listed(client, member, space_id).json()["data"]] == [later["id"]]
    member_view = read(client, member, later["id"]).json()["data"]
    assert member_view["can_manage"] is False and member_view["etag"] is None and member_view["can_respond"] is True
    assert [item["id"] for item in listed(client, owner, space_id).json()["data"]] == [event["id"], later["id"]]


def test_event_times_and_text_are_validated(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    cases = [
        ({"local_start": "2026-09-18T10:00", "local_end": None}, 422, "EVENT_IN_PAST"),
        ({"timezone": "America/New_York", "local_start": "2027-03-14T02:30", "local_end": None}, 422, "LOCAL_TIME_SKIPPED"),
        ({"timezone": "America/New_York", "local_start": "2026-11-01T01:30", "local_end": None}, 422, "LOCAL_TIME_REPEATED"),
        ({"local_start": "2026-09-25T18:30", "local_end": "2026-10-10T18:31"}, 422, "EVENT_TOO_LONG"),
        ({"local_start": "2028-10-01T10:00", "local_end": None}, 422, "EVENT_TOO_FAR"),
        ({"local_end": "2026-09-25T18:00"}, 422, "VALIDATION_ERROR"),
        ({"timezone": "Mars/Base"}, 422, "VALIDATION_ERROR"),
        ({"local_start": "2026-02-30T10:00"}, 422, "VALIDATION_ERROR"),
        ({"local_start": "2026-09-25 18:30"}, 422, "VALIDATION_ERROR"),
        ({"title": "   "}, 422, "VALIDATION_ERROR"),
        ({"title": "Party\u202e"}, 422, "VALIDATION_ERROR"),
        ({"description": "x" * 2001}, 422, "VALIDATION_ERROR"),
    ]
    for changes, status, code in cases:
        response = create(client, owner, space_id, **changes)
        assert response.status_code == status, (changes, response.text)
        assert response.json()["error"]["code"] == code, changes
    extra = client.post(
        f"/v1/spaces/{space_id}/events", headers={**auth(owner), "Idempotency-Key": str(uuid4())},
        json={**event_body(), "creator_id": owner["user"]["id"]},
    )
    assert extra.status_code == 422
    missing_key = client.post(f"/v1/spaces/{space_id}/events", headers=auth(owner), json=event_body())
    assert missing_key.status_code == 422
    new_york = create(client, owner, space_id, timezone="America/New_York", local_start="2026-11-01T09:00", local_end=None)
    assert new_york.status_code == 201 and new_york.json()["data"]["starts_at"] == "2026-11-01T14:00:00Z"


def test_attendance_is_one_response_per_member_and_reschedule_marks_it_outdated(client, app):
    owner, member, space_id = family(client, app)
    event = create(client, owner, space_id).json()["data"]
    going = respond(client, member, event["id"], "going")
    assert going.status_code == 200, going.text
    view = going.json()["data"]
    assert view["going"] == 1 and view["my_response"] == "going" and view["my_response_outdated"] is False
    assert len(view["attendees"]) == 1
    assert view["attendees"][0]["response"] == "going" and view["attendees"][0]["mine"] is True
    assert view["attendees"][0]["outdated"] is False
    assert respond(client, member, event["id"], "going").json()["data"]["going"] == 1
    assert outbox(app, "event.attendee.updated") == 1
    assert respond(client, member, event["id"], "maybe").json()["data"]["maybe"] == 1
    assert respond(client, owner, event["id"], "not_going").status_code == 200
    detail = read(client, owner, event["id"]).json()["data"]
    assert (detail["going"], detail["maybe"], detail["not_going"]) == (0, 1, 1)
    assert respond(client, member, event["id"], "attending").status_code == 422

    patch_url = f"/v1/events/{event['id']}"
    changed = event_body(local_start="2026-09-25T19:00")
    assert client.patch(patch_url, headers=auth(owner), json=changed).status_code == 428
    stale = client.patch(patch_url, headers={**auth(owner), "If-Match": '"stale"'}, json=changed)
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "EVENT_CHANGED"
    denied = client.patch(patch_url, headers={**auth(member), "If-Match": detail["etag"]}, json=changed)
    assert denied.status_code == 403
    advance(app, minutes=5)
    moved = client.patch(patch_url, headers={**auth(owner), "If-Match": detail["etag"]}, json=changed)
    assert moved.status_code == 200, moved.text
    moved = moved.json()["data"]
    assert moved["starts_at"] == "2026-09-25T13:30:00Z" and moved["schedule_changed_at"] is not None
    assert moved["etag"] != detail["etag"] and all(item["outdated"] for item in moved["attendees"])
    member_view = read(client, member, event["id"]).json()["data"]
    assert member_view["my_response"] == "maybe" and member_view["my_response_outdated"] is True
    confirmed = respond(client, member, event["id"], "maybe").json()["data"]
    assert confirmed["my_response_outdated"] is False
    renamed = client.patch(patch_url, headers={**auth(owner), "If-Match": moved["etag"]}, json={**changed, "title": "Dinner"})
    assert renamed.status_code == 200 and renamed.json()["data"]["schedule_changed_at"] == moved["schedule_changed_at"]
    unchanged = client.patch(patch_url, headers={**auth(owner), "If-Match": renamed.json()["data"]["etag"]}, json={**changed, "title": "Dinner"})
    assert unchanged.status_code == 200 and unchanged.json()["data"]["etag"] == renamed.json()["data"]["etag"]

    own = create(client, member, space_id, title="Movie night").json()["data"]
    assert own["can_manage"] is True
    owner_view = read(client, owner, own["id"]).json()["data"]
    assert owner_view["can_manage"] is True and owner_view["etag"] is not None
    with app.state.sessions() as database:
        actions = database.scalars(select(SpaceAuditEvent.action).where(SpaceAuditEvent.target_id == event["id"])).all()
    assert sorted(actions) == ["event.created", "event.updated", "event.updated"]


def test_cancellation_and_end_stop_responses(client, app):
    owner, member, space_id = family(client, app)
    event = create(client, owner, space_id).json()["data"]
    cancel_url = f"/v1/events/{event['id']}/cancel"
    assert client.post(cancel_url, headers=auth(owner), json={}).status_code == 428
    assert client.post(cancel_url, headers={**auth(member), "If-Match": event["etag"]}, json={}).status_code == 403
    cancelled = client.post(cancel_url, headers={**auth(owner), "If-Match": event["etag"]}, json={})
    assert cancelled.status_code == 200, cancelled.text
    data = cancelled.json()["data"]
    assert data["status"] == "cancelled" and data["cancelled_at"] is not None
    assert data["can_respond"] is False and data["can_manage"] is False
    replay = client.post(cancel_url, headers={**auth(owner), "If-Match": event["etag"]}, json={})
    assert replay.status_code == 200 and replay.json()["data"]["cancelled_at"] == data["cancelled_at"]
    assert outbox(app, "event.cancelled") == 1
    refused = respond(client, member, event["id"], "going")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "EVENT_CANCELLED"
    edit = client.patch(f"/v1/events/{event['id']}", headers={**auth(owner), "If-Match": data["etag"]}, json=event_body())
    assert edit.status_code == 409

    soon = create(client, owner, space_id, title="Call", local_start="2026-09-19T16:00", local_end="2026-09-19T16:30").json()["data"]
    assert respond(client, member, soon["id"], "going").status_code == 200
    advance(app, hours=2)
    ended = respond(client, member, soon["id"], "maybe")
    assert ended.status_code == 409 and ended.json()["error"]["code"] == "EVENT_ENDED"
    past = listed(client, owner, space_id, "?when=past").json()["data"]
    assert [item["id"] for item in past] == [soon["id"]] and past[0]["ended"] is True and past[0]["going"] == 1
    assert soon["id"] not in [item["id"] for item in listed(client, owner, space_id).json()["data"]]


def test_removed_members_and_outsiders_lose_access_and_stop_counting(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    event = create(client, owner, space_id).json()["data"]
    assert respond(client, member, event["id"], "going").status_code == 200
    for response in (
        read(client, outsider, event["id"]), respond(client, outsider, event["id"], "going"),
        listed(client, outsider, space_id), create(client, outsider, space_id),
        client.post(f"/v1/events/{event['id']}/cancel", headers={**auth(outsider), "If-Match": event["etag"]}, json={}),
    ):
        assert response.status_code == 404
    reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    assert read(client, member, event["id"]).status_code == 404
    detail = read(client, owner, event["id"]).json()["data"]
    assert detail["going"] == 0 and detail["attendees"] == []
    advance(app, minutes=1)
    admit(client, owner, space_id, member)
    assert read(client, member, event["id"]).status_code == 404
    assert read(client, owner, event["id"]).json()["data"]["going"] == 0
    assert client.get(f"/v1/events/{event['id']}").status_code == 401


def test_event_lists_page_with_bound_cursors(client, app):
    owner, member, space_id = family(client, app)
    for day in (27, 25, 26):
        assert create(client, owner, space_id, title=f"Day {day}", local_start=f"2026-09-{day}T10:00", local_end=None).status_code == 201
    first = listed(client, owner, space_id, "?limit=2").json()
    assert [item["title"] for item in first["data"]] == ["Day 25", "Day 26"] and first["pagination"]["has_more"] is True
    cursor = first["pagination"]["next_cursor"]
    second = listed(client, owner, space_id, f"?limit=2&cursor={cursor}").json()
    assert [item["title"] for item in second["data"]] == ["Day 27"] and second["pagination"]["has_more"] is False
    assert listed(client, member, space_id, f"?limit=2&cursor={cursor}").status_code == 400
    assert listed(client, owner, space_id, f"?when=past&cursor={cursor}").status_code == 400
    assert listed(client, owner, space_id, "?cursor=forged").status_code == 400
    assert listed(client, owner, space_id, "?when=someday").status_code == 422
    advance(app, minutes=16)
    assert listed(client, owner, space_id, f"?limit=2&cursor={cursor}").status_code == 410


def test_parallel_responses_are_counted_once(client, app):
    owner, member, space_id = family(client, app)
    event = create(client, owner, space_id).json()["data"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda actor: respond(client, actor, event["id"], "going"), [owner, member] * 3))
    assert all(result.status_code == 200 for result in results), [result.text for result in results]
    assert read(client, owner, event["id"]).json()["data"]["going"] == 2
    assert outbox(app, "event.attendee.updated") == 2


def test_events_openapi_requires_sessions(client):
    schema = client.get("/openapi.json").json()
    paths = {
        "/v1/spaces/{space_id}/events": {"get", "post"}, "/v1/events/{event_id}": {"get", "patch"},
        "/v1/events/{event_id}/cancel": {"post"}, "/v1/events/{event_id}/attendance": {"post"},
    }
    for path, methods in paths.items():
        assert set(schema["paths"][path]) == methods
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
