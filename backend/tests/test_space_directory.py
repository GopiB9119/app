from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.modules.community.models import AccountBlock
from app.modules.identity.models import OutboxEvent
from app.modules.spaces import service as spaces_service
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from tests.test_identity import PASSWORD, account, auth
from tests.test_messaging import admit, advance, messages, open_chat, send
from tests.test_spaces import create_space

ENTRY_FIELDS = {"id", "name", "description", "member_count", "viewer_role", "pending_request_id", "can_request"}


def signed_in_again(client, person):
    response = client.post("/v1/auth/login", json={"email": person["user"]["email"], "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def group(client, owner, name="Weekend hikers", visibility="public", description="Saturday walks around the lake.", key=None):
    body = {"name": name, "space_type": "group", "description": description}
    if visibility is not None:
        body["visibility"] = visibility
    return client.post("/v1/spaces", headers={**auth(owner), "Idempotency-Key": key or str(uuid4())}, json=body)


def directory(client, viewer, query=""):
    return client.get(f"/v1/discover/spaces{query}", headers=auth(viewer))


def ask(client, person, space_id, note=None, key=None):
    return client.post(
        f"/v1/spaces/{space_id}/join-requests", headers={**auth(person), "Idempotency-Key": key or str(uuid4())},
        json={} if note is None else {"note": note},
    )


def pending_for(client, owner, space_id):
    return client.get(f"/v1/spaces/{space_id}/join-requests", headers=auth(owner))


def review(client, owner, space_id, request_id, action):
    return client.post(f"/v1/spaces/{space_id}/join-requests/{request_id}/{action}", headers=auth(owner), json={})


def mine(client, person):
    return client.get("/v1/me/space-join-requests", headers=auth(person))


def settings(client, owner, space_id):
    response = client.get(f"/v1/spaces/{space_id}/settings", headers=auth(owner))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def set_visibility(client, owner, space_id, visibility, etag=None, key=None):
    etag = etag or settings(client, owner, space_id)["etag"]
    return client.post(
        f"/v1/spaces/{space_id}/visibility",
        headers={**auth(owner), "If-Match": etag, "Idempotency-Key": key or str(uuid4())}, json={"visibility": visibility},
    )


def test_group_spaces_start_private_and_only_groups_can_be_public(client, app):
    owner = account(client, app)
    created = group(client, owner, visibility=None, description="")
    assert created.status_code == 201, created.text
    space = created.json()["data"]
    assert (space["space_type"], space["visibility"], space["description"], space["role"]) == ("group", "private", "", "owner")
    for body in (
        {"name": "Family", "space_type": "family", "visibility": "public"},
        {"name": "Me", "space_type": "solo", "visibility": "public"},
        {"name": "Us", "space_type": "couple"},
        {"name": "Hikers", "space_type": "group", "visibility": "secret"},
        {"name": "Hikers", "space_type": "group", "description": "x" * 281},
        {"name": "Hikers", "space_type": "group", "description": "Hidden\u202edirection"},
    ):
        assert client.post("/v1/spaces", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json=body).status_code == 422, body
    family = create_space(client, owner).json()["data"]
    refused = set_visibility(client, owner, family["id"], "public")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "PRIVATE_SPACE_TYPE"
    with pytest.raises(IntegrityError):
        with app.state.sessions.begin() as database:
            database.get(Space, family["id"]).visibility = "public"
    assert client.get(f"/v1/spaces/{family['id']}", headers=auth(owner)).json()["data"]["visibility"] == "private"


def test_private_spaces_never_appear_in_or_leak_through_discovery(client, app):
    owner = account(client, app)
    other = account(client, app, "finder@example.test")
    family = create_space(client, owner, "Morgan family").json()["data"]
    solo = create_space(client, owner, "Private diary", space_type="solo").json()["data"]
    hidden = group(client, owner, "Secret club", visibility="private", description="Morgan members only").json()["data"]
    public = group(client, owner).json()["data"]
    listed = directory(client, other)
    assert listed.status_code == 200, listed.text
    assert [entry["id"] for entry in listed.json()["data"]] == [public["id"]]
    entry = listed.json()["data"][0]
    assert set(entry) == ENTRY_FIELDS
    assert (entry["name"], entry["description"], entry["member_count"]) == ("Weekend hikers", "Saturday walks around the lake.", 1)
    assert (entry["viewer_role"], entry["pending_request_id"], entry["can_request"]) == (None, None, True)
    for query in ("?q=Morgan", "?q=Secret", "?q=diary", "?q=%25", "?q=_"):
        assert directory(client, other, query).json()["data"] == [], query
    assert [item["id"] for item in directory(client, other, "?q=lake").json()["data"]] == [public["id"]]
    unknown = str(uuid4())
    for space_id in (family["id"], solo["id"], hidden["id"], unknown):
        preview = client.get(f"/v1/discover/spaces/{space_id}", headers=auth(other))
        joined = ask(client, other, space_id)
        assert (preview.status_code, preview.json()["error"]["code"]) == (404, "NOT_FOUND")
        assert (joined.status_code, joined.json()["error"]["code"]) == (404, "NOT_FOUND")
        assert preview.json()["error"]["message"] == client.get(f"/v1/discover/spaces/{unknown}", headers=auth(other)).json()["error"]["message"]
    assert client.get(f"/v1/discover/spaces/{public['id']}", headers=auth(other)).json()["data"] == entry
    assert client.get("/v1/discover/spaces").status_code == 401
    assert client.get(f"/v1/spaces/{public['id']}", headers=auth(other)).status_code == 404
    assert client.get(f"/v1/spaces/{public['id']}/members", headers=auth(other)).status_code == 404
    assert owner["user"]["display_name"] not in listed.text and owner["user"]["id"] not in listed.text
    assert [item["viewer_role"] for item in directory(client, owner).json()["data"]] == ["owner"]


def test_an_approved_request_is_a_new_admission_that_sees_only_later_history(client, app):
    owner = account(client, app)
    person = account(client, app, "hiker@example.test")
    space = group(client, owner).json()["data"]
    chat = open_chat(client, owner, space["id"]).json()["data"]
    assert send(client, owner, chat["id"], "Said before anyone asked").status_code == 201
    advance(app, minutes=1)
    requested = ask(client, person, space["id"], note="  I walk there every Saturday.  ")
    assert requested.status_code == 201, requested.text
    request = requested.json()["data"]
    assert (request["status"], request["note"], request["space_name"]) == ("pending", "I walk there every Saturday.", "Weekend hikers")
    entry = directory(client, person).json()["data"][0]
    assert (entry["pending_request_id"], entry["can_request"]) == (request["id"], False)
    queue = pending_for(client, owner, space["id"])
    assert queue.status_code == 200, queue.text
    [waiting] = queue.json()["data"]
    assert (waiting["id"], waiting["display_name"], waiting["note"]) == (request["id"], "Alex Morgan", "I walk there every Saturday.")
    assert "email" not in waiting
    approved = review(client, owner, space["id"], request["id"], "approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["status"] == "approved"
    assert review(client, owner, space["id"], request["id"], "approve").json()["data"] == approved.json()["data"]
    closed = review(client, owner, space["id"], request["id"], "decline")
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "JOIN_REQUEST_CLOSED"
    joined = client.get(f"/v1/spaces/{space['id']}", headers=auth(person))
    assert joined.status_code == 200 and joined.json()["data"]["role"] == "member"
    assert pending_for(client, owner, space["id"]).json()["data"] == []
    entry = directory(client, person).json()["data"][0]
    assert (entry["viewer_role"], entry["member_count"], entry["can_request"]) == ("member", 2, False)
    assert messages(client, person, chat["id"]).json()["data"] == []
    advance(app, minutes=1)
    assert send(client, owner, chat["id"], "Welcome").status_code == 201
    assert [item["body"] for item in messages(client, person, chat["id"]).json()["data"]] == ["Welcome"]
    assert [item["status"] for item in mine(client, person).json()["data"]] == ["approved"]
    with app.state.sessions() as database:
        actions = database.scalars(select(SpaceAuditEvent.action).where(SpaceAuditEvent.space_id == space["id"])).all()
        assert {"space.join_requested", "space.join_request_approved"} <= set(actions)
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "space.join_request_approved")) == 1


def test_join_requests_retry_exactly_and_can_be_cancelled_declined_and_retried_later(client, app):
    owner = account(client, app)
    person = account(client, app, "asker@example.test")
    space = group(client, owner).json()["data"]
    key = str(uuid4())
    first = ask(client, person, space["id"], note="Hello", key=key)
    assert first.status_code == 201, first.text
    assert ask(client, person, space["id"], note="Hello", key=key).json()["data"] == first.json()["data"]
    changed = ask(client, person, space["id"], note="Changed", key=key)
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    twice = ask(client, person, space["id"])
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "JOIN_REQUEST_PENDING"
    request_id = first.json()["data"]["id"]
    cancelled = client.post(f"/v1/space-join-requests/{request_id}/cancel", headers=auth(person), json={})
    assert cancelled.status_code == 200 and cancelled.json()["data"]["status"] == "cancelled"
    assert client.post(f"/v1/space-join-requests/{request_id}/cancel", headers=auth(person), json={}).json()["data"] == cancelled.json()["data"]
    assert client.post(f"/v1/space-join-requests/{request_id}/cancel", headers=auth(owner), json={}).status_code == 404
    advance(app, minutes=1)
    again = ask(client, person, space["id"])
    assert again.status_code == 201
    declined = review(client, owner, space["id"], again.json()["data"]["id"], "decline")
    assert declined.status_code == 200 and declined.json()["data"]["status"] == "declined"
    cooling = ask(client, person, space["id"])
    assert cooling.status_code == 409 and cooling.json()["error"]["code"] == "JOIN_REQUEST_COOLDOWN"
    assert directory(client, person).json()["data"][0]["can_request"] is False
    advance(app, days=7, minutes=1)
    person, owner = signed_in_again(client, person), signed_in_again(client, owner)
    assert ask(client, person, space["id"]).status_code == 201
    assert [item["status"] for item in mine(client, person).json()["data"]] == ["pending", "declined", "cancelled"]
    own = ask(client, owner, space["id"])
    assert own.status_code == 409 and own.json()["error"]["code"] == "ALREADY_MEMBER"
    for note in ("x" * 281, "Bad\u0007bell", "Hidden\u202edirection"):
        assert ask(client, person, space["id"], note=note).status_code == 422, note


def test_only_the_owner_reviews_requests_and_changes_visibility(client, app):
    owner = account(client, app)
    member = account(client, app, "trusted@example.test")
    person = account(client, app, "stranger@example.test")
    space = group(client, owner).json()["data"]
    admit(client, owner, space["id"], member)
    request = ask(client, person, space["id"]).json()["data"]
    for actor in (member, person):
        assert pending_for(client, actor, space["id"]).status_code == 404
        for action in ("approve", "decline"):
            assert review(client, actor, space["id"], request["id"], action).status_code == 404
    reviewed = settings(client, owner, space["id"])
    headers = {**auth(member), "If-Match": reviewed["etag"], "Idempotency-Key": str(uuid4())}
    assert client.post(f"/v1/spaces/{space['id']}/visibility", headers=headers, json={"visibility": "private"}).status_code == 404
    path = f"/v1/spaces/{space['id']}/visibility"
    missing = client.post(path, headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={"visibility": "private"})
    assert missing.status_code == 428
    same = set_visibility(client, owner, space["id"], "public")
    assert same.status_code == 409 and same.json()["error"]["code"] == "NO_CHANGES"
    key = str(uuid4())
    hidden = set_visibility(client, owner, space["id"], "private", etag=reviewed["etag"], key=key)
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["data"]["visibility"] == "private"
    assert set_visibility(client, owner, space["id"], "private", etag=reviewed["etag"], key=key).json()["data"] == hidden.json()["data"]
    stale = set_visibility(client, owner, space["id"], "public", etag=reviewed["etag"])
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "SPACE_CHANGED"
    assert client.post(path, headers={**auth(owner), "If-Match": hidden.json()["data"]["etag"], "Idempotency-Key": str(uuid4())}, json={"visibility": "unlisted"}).status_code == 422


def test_making_a_group_private_hides_it_and_closes_pending_requests(client, app):
    owner = account(client, app)
    person = account(client, app, "waiting@example.test")
    space = group(client, owner).json()["data"]
    request = ask(client, person, space["id"]).json()["data"]
    assert set_visibility(client, owner, space["id"], "private").status_code == 200
    assert directory(client, person).json()["data"] == []
    assert client.get(f"/v1/discover/spaces/{space['id']}", headers=auth(person)).status_code == 404
    assert ask(client, person, space["id"]).status_code == 404
    [closed] = mine(client, person).json()["data"]
    assert (closed["id"], closed["status"], closed["space_name"]) == (request["id"], "closed", "Weekend hikers")
    assert review(client, owner, space["id"], request["id"], "approve").status_code == 409
    renamed_while_private = client.patch(
        f"/v1/spaces/{space['id']}/settings",
        headers={**auth(owner), "If-Match": settings(client, owner, space["id"])["etag"], "Idempotency-Key": str(uuid4())},
        json={"name": "Renamed in private"},
    )
    assert renamed_while_private.status_code == 200, renamed_while_private.text
    assert mine(client, person).json()["data"][0]["space_name"] == "Weekend hikers"
    assert set_visibility(client, owner, space["id"], "public").status_code == 200
    assert [entry["name"] for entry in directory(client, person).json()["data"]] == ["Renamed in private"]
    assert ask(client, person, space["id"]).status_code == 201
    with app.state.sessions() as database:
        actions = database.scalars(select(SpaceAuditEvent.action).where(SpaceAuditEvent.space_id == space["id"])).all()
        assert actions.count("space.made_private") == 1 and actions.count("space.made_public") == 1


def test_pending_requests_block_renames_until_they_are_reviewed(client, app):
    owner = account(client, app)
    person = account(client, app, "reviewer@example.test")
    space = group(client, owner).json()["data"]
    request = ask(client, person, space["id"]).json()["data"]
    path = f"/v1/spaces/{space['id']}/settings"
    for body in ({"name": "Something else"}, {"name": "Weekend hikers", "description": "Now about something else."}):
        blocked = client.patch(path, headers={**auth(owner), "If-Match": settings(client, owner, space["id"])["etag"], "Idempotency-Key": str(uuid4())}, json=body)
        assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "SPACE_REVIEW_PENDING", body
    assert review(client, owner, space["id"], request["id"], "decline").status_code == 200
    described = client.patch(path, headers={**auth(owner), "If-Match": settings(client, owner, space["id"])["etag"], "Idempotency-Key": str(uuid4())}, json={"name": "Weekend hikers", "description": "  Lake walks.\nBring water.  "})
    assert described.status_code == 200, described.text
    assert described.json()["data"]["description"] == "Lake walks.\nBring water."
    assert client.patch(path, headers={**auth(owner), "If-Match": described.json()["data"]["etag"], "Idempotency-Key": str(uuid4())}, json={"name": "Weekend hikers", "description": "Lake walks.\nBring water."}).json()["error"]["code"] == "NO_CHANGES"


def test_blocks_hide_public_groups_and_refuse_requests_in_both_directions(client, app):
    owner = account(client, app)
    blocked_person = account(client, app, "blocked@example.test")
    blocking_person = account(client, app, "blocking@example.test")
    space = group(client, owner).json()["data"]
    with app.state.sessions.begin() as database:
        database.add_all([
            AccountBlock(id=str(uuid4()), blocker_id=owner["user"]["id"], target_type="account", target_id=blocked_person["user"]["id"], created_at=app.state.clock()),
            AccountBlock(id=str(uuid4()), blocker_id=blocking_person["user"]["id"], target_type="account", target_id=owner["user"]["id"], created_at=app.state.clock()),
        ])
    for person in (blocked_person, blocking_person):
        assert directory(client, person).json()["data"] == []
        assert client.get(f"/v1/discover/spaces/{space['id']}", headers=auth(person)).status_code == 404
        assert ask(client, person, space["id"]).status_code == 404


def test_full_groups_expired_requests_and_concurrent_requests_stay_bounded(client, app, monkeypatch):
    owner = account(client, app)
    first = account(client, app, "first@example.test")
    second = account(client, app, "second@example.test")
    space = group(client, owner).json()["data"]
    keys = [str(uuid4()) for _attempt in range(4)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        attempts = list(pool.map(lambda key: ask(client, first, space["id"], key=key), keys))
    assert sorted(response.status_code for response in attempts) == [201, 409, 409, 409]
    request = next(response for response in attempts if response.status_code == 201).json()["data"]
    advance(app, days=15)
    owner, first, second = (signed_in_again(client, someone) for someone in (owner, first, second))
    expired = review(client, owner, space["id"], request["id"], "approve")
    assert expired.status_code == 410 and expired.json()["error"]["code"] == "JOIN_REQUEST_EXPIRED"
    assert mine(client, first).json()["data"][0]["status"] == "expired"
    fresh = ask(client, first, space["id"])
    assert fresh.status_code == 201, fresh.text
    later = ask(client, second, space["id"])
    assert later.status_code == 201
    monkeypatch.setattr(spaces_service, "MAX_FAMILY_MEMBERS", 2)
    assert review(client, owner, space["id"], fresh.json()["data"]["id"], "approve").status_code == 200
    full = review(client, owner, space["id"], later.json()["data"]["id"], "approve")
    assert full.status_code == 409 and full.json()["error"]["code"] == "SPACE_FULL"
    third = account(client, app, "third@example.test")
    refused = ask(client, third, space["id"])
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "SPACE_FULL"
    assert directory(client, third).json()["data"][0]["can_request"] is False
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceMembership).where(SpaceMembership.space_id == space["id"], SpaceMembership.status == "active")) == 2


def test_group_members_invite_leave_and_rejoin_through_a_new_request(client, app):
    owner = account(client, app)
    member = account(client, app, "rejoiner@example.test")
    space = group(client, owner, visibility="private").json()["data"]
    admit(client, owner, space["id"], member)
    roster = client.get(f"/v1/spaces/{space['id']}/members", headers=auth(member))
    assert roster.status_code == 200 and len(roster.json()["data"]) == 2
    mine_entry = next(item for item in roster.json()["data"] if item["account_id"] == member["user"]["id"])
    left = client.post(f"/v1/spaces/{space['id']}/leave", headers={**auth(member), "If-Match": mine_entry["etag"], "Idempotency-Key": str(uuid4())}, json={})
    assert left.status_code == 200, left.text
    assert ask(client, member, space["id"]).status_code == 404
    assert set_visibility(client, owner, space["id"], "public").status_code == 200
    request = ask(client, member, space["id"])
    assert request.status_code == 201, request.text
    assert review(client, owner, space["id"], request.json()["data"]["id"], "approve").status_code == 200
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space["id"], member["user"]["id"])).admission_sequence == 3


def test_directory_pages_are_bound_to_the_viewer_and_query(client, app):
    owner = account(client, app)
    viewer = account(client, app, "browser@example.test")
    ids = []
    for number in range(3):
        ids.append(group(client, owner, name=f"Walkers {number}").json()["data"]["id"])
        advance(app, minutes=1)
    first = directory(client, viewer, "?limit=2")
    assert first.status_code == 200 and first.json()["pagination"]["has_more"] is True
    cursor = first.json()["pagination"]["next_cursor"]
    second = directory(client, viewer, f"?limit=2&cursor={cursor}")
    assert [entry["id"] for entry in first.json()["data"] + second.json()["data"]] == list(reversed(ids))
    assert directory(client, owner, f"?limit=2&cursor={cursor}").status_code == 400
    assert directory(client, viewer, f"?limit=2&q=walkers&cursor={cursor}").status_code == 400
    advance(app, minutes=16)
    assert directory(client, viewer, f"?limit=2&cursor={cursor}").status_code == 410


def test_space_directory_and_join_request_openapi_is_signed_in_and_minimal(app):
    schema = app.openapi()
    for path, method in (
        ("/v1/discover/spaces", "get"), ("/v1/discover/spaces/{space_id}", "get"),
        ("/v1/spaces/{space_id}/join-requests", "post"), ("/v1/spaces/{space_id}/join-requests", "get"),
        ("/v1/spaces/{space_id}/join-requests/{request_id}/approve", "post"),
        ("/v1/spaces/{space_id}/join-requests/{request_id}/decline", "post"),
        ("/v1/space-join-requests/{request_id}/cancel", "post"), ("/v1/me/space-join-requests", "get"),
        ("/v1/spaces/{space_id}/visibility", "post"),
    ):
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}], (path, method)
    entry = schema["components"]["schemas"]["SpaceDirectoryEntry"]["properties"]
    assert set(entry) == ENTRY_FIELDS
    assert schema["components"]["schemas"]["CreateSpace"]["properties"]["visibility"]["enum"] == ["private", "public"]
    assert schema["components"]["schemas"]["CreateJoinRequest"]["additionalProperties"] is False
