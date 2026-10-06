from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select

from app.modules.community.models import PageEvent, PageEventResponse
from app.modules.identity.models import OutboxEvent
from tests.test_community import advance, create_page
from tests.test_identity import account, auth
from tests.test_page_lifecycle import delete

EVENT = {
    "title": "Lake clean-up", "description": "Bring gloves.", "location": "12 Lake Road", "timezone": "Asia/Kolkata",
    "local_start": "2026-09-25T18:30", "local_end": "2026-09-25T20:00", "capacity": 2,
}


def publish(client, person, page_id, key=None, **fields):
    return client.post(f"/v1/pages/{page_id}/events", headers={**auth(person), "Idempotency-Key": key or str(uuid4())}, json={**EVENT, **fields})


def going(client, person, event_id, answer="going"):
    return client.post(f"/v1/page-events/{event_id}/{answer}", headers=auth(person), json={})


def update(client, person, event, etag=None, **fields):
    body = {key: event[key] for key in ("title", "description", "location", "location_public", "timezone", "local_start", "local_end")}
    headers = {**auth(person), **({"If-Match": etag} if etag is not None else {})}
    return client.put(f"/v1/page-events/{event['id']}", headers=headers, json={**body, **fields})


def test_page_managers_publish_events_and_people_say_they_are_going(client, app):
    owner = account(client, app)
    asker = account(client, app, "asker@example.test")
    helper = account(client, app, "helper@example.test")
    third = account(client, app, "third@example.test")
    page = create_page(client, owner, handle="lake-friends", name="Lake Friends").json()["data"]
    refused = publish(client, asker, page["id"])
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "PAGE_MANAGER_REQUIRED"
    key = str(uuid4())
    created = publish(client, owner, page["id"], key=key)
    assert created.status_code == 201, created.text
    event = created.json()["data"]
    assert event["starts_at"].startswith("2026-09-25T13:00") and event["ends_at"].startswith("2026-09-25T14:30")
    assert (event["location"], event["location_hidden"], event["can_manage"], event["going_count"]) == ("12 Lake Road", False, True, 0)
    assert publish(client, owner, page["id"], key=key).json()["data"]["id"] == event["id"]
    assert publish(client, owner, page["id"], key=key, title="Other").status_code == 409

    public = client.get(f"/v1/pages/{page['id']}/events").json()["data"]
    assert [(item["id"], item["location"], item["location_hidden"], item["etag"]) for item in public] == [(event["id"], None, True, None)]
    joined = going(client, asker, event["id"])
    assert joined.status_code == 200, joined.text
    assert (joined.json()["data"]["going"], joined.json()["data"]["location"], joined.json()["data"]["going_count"]) == (True, "12 Lake Road", 1)
    assert going(client, asker, event["id"]).json()["data"]["going_count"] == 1
    assert going(client, helper, event["id"]).json()["data"]["going_count"] == 2
    full = going(client, third, event["id"])
    assert full.status_code == 409 and full.json()["error"]["code"] == "EVENT_FULL"
    attendees = client.get(f"/v1/page-events/{event['id']}/attendees", headers=auth(owner))
    assert attendees.status_code == 200 and len(attendees.json()["data"]) == 2
    assert client.get(f"/v1/page-events/{event['id']}/attendees", headers=auth(asker)).status_code == 403
    assert [item["id"] for item in client.get("/v1/me/page-events", headers=auth(asker)).json()["data"]] == [event["id"]]

    assert update(client, owner, event).status_code == 428
    small = update(client, owner, event, etag=event["etag"], capacity=1)
    assert small.status_code == 409 and small.json()["error"]["code"] == "CAPACITY_BELOW_GOING"
    moved = update(client, owner, event, etag=event["etag"], local_start="2026-09-26T09:00", local_end=None)
    assert moved.status_code == 200, moved.text
    changed = moved.json()["data"]
    assert changed["starts_at"].startswith("2026-09-26T03:30") and changed["schedule_changed_at"] is not None and changed["capacity"] == 2
    assert update(client, owner, event, etag=event["etag"]).status_code == 412
    assert going(client, helper, event["id"], "not-going").json()["data"]["going_count"] == 1

    cancelled = client.post(f"/v1/page-events/{event['id']}/cancel", headers={**auth(owner), "If-Match": changed["etag"]}, json={})
    assert cancelled.status_code == 200 and cancelled.json()["data"]["status"] == "cancelled"
    late = going(client, helper, event["id"])
    assert late.status_code == 409 and late.json()["error"]["code"] == "EVENT_CLOSED"
    assert client.get(f"/v1/page-events/{event['id']}").json()["data"]["status"] == "cancelled"

    advance(app, days=8)
    assert client.get(f"/v1/pages/{page['id']}/events").json()["data"] == []
    assert [item["id"] for item in client.get(f"/v1/pages/{page['id']}/events", params={"when": "past"}).json()["data"]] == [event["id"]]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "public.event_created")) == 1


def test_event_times_must_exist_and_lie_ahead(client, app):
    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    past = publish(client, owner, page["id"], local_start="2026-09-18T10:00", local_end=None)
    assert past.status_code == 422 and past.json()["error"]["code"] == "EVENT_IN_PAST"
    skipped = publish(client, owner, page["id"], timezone="America/New_York", local_start="2027-03-14T02:30", local_end=None)
    assert skipped.status_code == 422 and skipped.json()["error"]["code"] == "LOCAL_TIME_SKIPPED"
    long = publish(client, owner, page["id"], local_end="2026-10-25T20:00")
    assert long.status_code == 422 and long.json()["error"]["code"] == "EVENT_TOO_LONG"
    assert publish(client, owner, page["id"], timezone="Mars/Olympus").status_code == 422


def test_discover_lists_upcoming_events_without_blocked_or_muted_pages(client, app):
    owner = account(client, app)
    other = account(client, app, "other@example.test")
    reader = account(client, app, "reader@example.test")
    first = create_page(client, owner, handle="lake-friends", name="Lake Friends").json()["data"]
    second = create_page(client, other, handle="night-market", name="Night Market").json()["data"]
    later = publish(client, owner, first["id"], title="Later walk", local_start="2026-09-28T07:00", local_end=None).json()["data"]
    sooner = publish(client, other, second["id"], title="Market night", local_start="2026-09-21T19:00", local_end=None).json()["data"]
    cancelled = publish(client, owner, first["id"], title="Called off", local_start="2026-09-22T07:00", local_end=None).json()["data"]
    assert client.post(f"/v1/page-events/{cancelled['id']}/cancel", headers={**auth(owner), "If-Match": cancelled["etag"]}, json={}).status_code == 200
    assert [item["title"] for item in client.get("/v1/discover/events").json()["data"]] == ["Market night", "Later walk"]
    assert [item["title"] for item in client.get("/v1/discover/events", params={"limit": 1}).json()["data"]] == ["Market night"]
    muted = client.post("/v1/me/feed-controls", headers=auth(reader), json={"kind": "mute_page", "page_id": second["id"]})
    assert muted.status_code in (200, 201), muted.text
    assert [item["id"] for item in client.get("/v1/discover/events", headers=auth(reader)).json()["data"]] == [later["id"]]
    blocked = client.post("/v1/blocks", headers=auth(reader), json={"target_type": "page", "target_id": first["id"]})
    assert blocked.status_code in (200, 201), blocked.text
    assert client.get("/v1/discover/events", headers=auth(reader)).json()["data"] == []
    assert sooner["id"] in [item["id"] for item in client.get("/v1/discover/events").json()["data"]]


def test_a_purged_page_erases_its_events_and_who_was_going(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    event = publish(client, owner, page["id"], local_start="2026-09-20T18:30", local_end=None).json()["data"]
    assert going(client, reader, event["id"]).status_code == 200
    assert delete(client, owner, page, etag=page["etag"]).status_code == 200
    advance(app, days=7, minutes=1)
    assert app.state.page_lifecycle.purge_due() == {"purged": 1}
    with app.state.sessions() as database:
        erased = database.get(PageEvent, event["id"])
        assert (erased.status, erased.title, erased.details, erased.venue, erased.going_count) == ("deleted", None, None, None, 0)
        assert database.scalar(select(func.count()).select_from(PageEventResponse)) == 0
    assert client.get(f"/v1/page-events/{event['id']}").status_code == 404
