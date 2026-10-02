import json
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.modules.community.models import CommunityAuditEvent, PageHandover, PageModerator
from tests.test_community import advance, comment, create_page, published
from tests.test_identity import PASSWORD, account, auth


def invite(client, owner, page_id, account_id, key=None):
    return client.post(
        f"/v1/pages/{page_id}/moderators",
        headers={**auth(owner), "Idempotency-Key": key or str(uuid4())},
        json={"account_id": account_id},
    )


def roles(client, person):
    response = client.get("/v1/me/moderator-roles", headers=auth(person))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def respond(client, person, page_id, moderator_id, action, etag=None, json_body=None):
    return client.post(
        f"/v1/pages/{page_id}/moderators/{moderator_id}/{action}",
        headers=({**auth(person), "If-Match": etag} if etag is not None else auth(person)),
        json=json_body or {},
    )


def moderating(client, owner, page, person):
    """The owner invites a person and the person accepts, returning the active moderator row."""
    created = invite(client, owner, page["id"], person["user"]["id"])
    assert created.status_code == 201, created.text
    row = created.json()["data"]
    accepted = respond(client, person, page["id"], row["id"], "accept", row["etag"])
    assert accepted.status_code == 200, accepted.text
    return accepted.json()["data"]


def test_a_moderator_accepts_and_helps_run_the_page_without_being_shown_publicly(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    assert comment(client, reader, post["id"]).status_code == 201

    created = invite(client, owner, page["id"], helper["user"]["id"])
    assert created.status_code == 201, created.text
    invitation = created.json()["data"]
    assert invitation["status"] == "pending" and invitation["account_id"] == helper["user"]["id"]
    assert invitation["display_name"] == "Alex Morgan"
    made = datetime.fromisoformat(invitation["created_at"])
    assert datetime.fromisoformat(invitation["expires_at"]) == made + timedelta(hours=72)

    inbox = roles(client, helper)
    assert [(row["status"], row["page_id"], row["page_name"], row["page_handle"]) for row in inbox] == [
        ("pending", page["id"], page["name"], page["handle"]),
    ]
    assert roles(client, owner) == [] and roles(client, reader) == []

    accepted = respond(client, helper, page["id"], invitation["id"], "accept", invitation["etag"])
    assert accepted.status_code == 200, accepted.text
    active = accepted.json()["data"]
    assert active["status"] == "active" and active["expires_at"] is None and active["page_id"] == page["id"]
    replay = respond(client, helper, page["id"], invitation["id"], "accept", invitation["etag"])
    assert replay.status_code == 200 and replay.json()["data"]["id"] == active["id"]

    listed = client.get(f"/v1/pages/{page['id']}/moderators", headers=auth(owner))
    assert listed.status_code == 200, listed.text
    assert [(row["account_id"], row["status"]) for row in listed.json()["data"]] == [(helper["user"]["id"], "active")]

    # A moderator pins and unpins posts and removes comments, and can tell the page is theirs to help.
    pinned = client.post(f"/v1/posts/{post['id']}/pin", headers=auth(helper), json={})
    assert pinned.status_code == 200, pinned.text
    assert pinned.json()["data"]["pinned"] is True
    comments = client.get(f"/v1/posts/{post['id']}/comments", headers=auth(helper)).json()["data"]
    assert [item["can_remove"] for item in comments] == [True]
    removed = client.post(f"/v1/comments/{comments[0]['id']}/delete", headers=auth(helper), json={})
    assert removed.status_code == 200 and removed.json()["data"]["status"] == "removed"
    assert client.post(f"/v1/posts/{post['id']}/unpin", headers=auth(helper), json={}).status_code == 200

    # A moderator does not post, edit the page or its rules, or manage moderators.
    assert client.post(
        f"/v1/pages/{page['id']}/posts", headers={**auth(helper), "Idempotency-Key": str(uuid4())},
        json={"title": "Mine", "body": "Moderator post"},
    ).status_code == 403
    assert client.patch(
        f"/v1/pages/{page['id']}", headers={**auth(helper), "If-Match": page["etag"]}, json={"name": "Renamed"},
    ).status_code == 403
    assert invite(client, helper, page["id"], reader["user"]["id"]).status_code == 403
    assert client.get(f"/v1/pages/{page['id']}/moderators", headers=auth(reader)).status_code == 403
    assert client.get(f"/v1/pages/{page['id']}/drafts", headers=auth(helper)).status_code == 403

    # Public views never show who moderates.
    public = client.get(f"/v1/pages/{page['handle']}")
    assert public.status_code == 200, public.text
    assert "moderators" not in public.text and helper["user"]["id"] not in public.text
    for signed_out_or_other in (None, auth(reader)):
        response = client.get(f"/v1/pages/{page['id']}", headers=signed_out_or_other or {})
        assert "moderator" not in json.dumps(response.json()).lower()
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CommunityAuditEvent).where(
            CommunityAuditEvent.action.in_(("public.moderator_invited", "public.moderator_accepted")))) == 2



def test_invitation_rules_keep_one_pending_row_and_replays_exactly(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    other = account(client, app, "other@example.test")
    page = create_page(client, owner).json()["data"]

    assert invite(client, owner, page["id"], owner["user"]["id"]).status_code == 409
    assert invite(client, owner, page["id"], owner["user"]["id"]).json()["error"]["code"] == "MODERATOR_SELF"
    missing = invite(client, owner, page["id"], str(uuid4()))
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "NOT_FOUND"

    key = str(uuid4())
    first = invite(client, owner, page["id"], helper["user"]["id"], key=key)
    assert first.status_code == 201, first.text
    replay = invite(client, owner, page["id"], helper["user"]["id"], key=key)
    assert replay.status_code == 201 and replay.json()["data"]["id"] == first.json()["data"]["id"]
    changed = invite(client, owner, page["id"], other["user"]["id"], key=key)
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    blocked = invite(client, owner, page["id"], other["user"]["id"])
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "MODERATOR_INVITATION_PENDING"

    # Declining ends the invitation and grants nothing.
    invitation = first.json()["data"]
    declined = respond(client, helper, page["id"], invitation["id"], "decline", invitation["etag"])
    assert declined.status_code == 200 and declined.json()["data"]["status"] == "declined"
    assert roles(client, helper) == []
    post = published(client, owner, page["id"])
    assert client.post(f"/v1/posts/{post['id']}/pin", headers=auth(helper), json={}).status_code == 403
    closed = respond(client, helper, page["id"], invitation["id"], "decline", invitation["etag"])
    assert closed.status_code == 200 and closed.json()["data"]["status"] == "declined"

    # The owner withdraws a new invitation, and the row leaves both management views.
    second = invite(client, owner, page["id"], helper["user"]["id"]).json()["data"]
    withdrawn = respond(client, owner, page["id"], second["id"], "withdraw", second["etag"])
    assert withdrawn.status_code == 200 and withdrawn.json()["data"]["status"] == "withdrawn"
    assert roles(client, helper) == []
    assert client.get(f"/v1/pages/{page['id']}/moderators", headers=auth(owner)).json()["data"] == []
    late = respond(client, helper, page["id"], second["id"], "accept", second["etag"])
    assert late.status_code == 409 and late.json()["error"]["code"] == "MODERATOR_INVITATION_CLOSED"

    # Accepting, stepping down and being removed all need the reviewed row version.
    active = moderating(client, owner, page, helper)
    without_etag = respond(client, helper, page["id"], active["id"], "step-down")
    assert without_etag.status_code == 428
    stale = respond(client, helper, page["id"], active["id"], "step-down", '"stale"')
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "CONTENT_CHANGED"
    stepped = respond(client, helper, page["id"], active["id"], "step-down", active["etag"])
    assert stepped.status_code == 200 and stepped.json()["data"]["status"] == "stepped_down"
    assert roles(client, helper) == []
    assert client.post(f"/v1/posts/{post['id']}/pin", headers=auth(helper), json={}).status_code == 403

    again = moderating(client, owner, page, helper)
    assert client.get(f"/v1/pages/{page['id']}/moderators", headers=auth(owner)).json()["data"][0]["id"] == again["id"]
    victim = published(client, owner, page["id"])
    removed = respond(client, owner, page["id"], again["id"], "remove", again["etag"])
    assert removed.status_code == 200 and removed.json()["data"]["status"] == "removed"
    assert respond(client, owner, page["id"], again["id"], "remove", again["etag"]).status_code == 200
    assert client.post(f"/v1/posts/{victim['id']}/pin", headers=auth(helper), json={}).status_code == 403
    assert roles(client, helper) == []


def test_an_invitation_expires_after_seventy_two_hours_and_the_owner_invites_again(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    page = create_page(client, owner).json()["data"]
    invitation = invite(client, owner, page["id"], helper["user"]["id"]).json()["data"]

    advance(app, hours=72, minutes=1)
    helper = sign_in(client, "helper@example.test")
    assert roles(client, helper) == []
    expired = respond(client, helper, page["id"], invitation["id"], "accept", invitation["etag"])
    assert expired.status_code == 410 and expired.json()["error"]["code"] == "MODERATOR_INVITATION_EXPIRED"

    # The stale pending row is cleared in place, so the owner can invite that person again.
    owner = sign_in(client, "alex@example.test")
    fresh = invite(client, owner, page["id"], helper["user"]["id"])
    assert fresh.status_code == 201 and fresh.json()["data"]["id"] != invitation["id"]
    accepted = respond(client, helper, page["id"], fresh.json()["data"]["id"], "accept", fresh.json()["data"]["etag"])
    assert accepted.status_code == 200 and accepted.json()["data"]["status"] == "active"



def test_a_page_keeps_at_most_ten_moderators(client, app):
    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    people = [account(client, app, f"helper-{index}@example.test") for index in range(11)]
    for person in people[:10]:
        moderating(client, owner, page, person)
    refused = invite(client, owner, page["id"], people[10]["user"]["id"])
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "MODERATOR_LIMIT_REACHED"

    listed = client.get(f"/v1/pages/{page['id']}/moderators", headers=auth(owner)).json()["data"]
    assert len(listed) == 10 and all(row["status"] == "active" for row in listed)
    first = next(row for row in listed if row["account_id"] == people[0]["user"]["id"])
    assert respond(client, owner, page["id"], first["id"], "remove", first["etag"]).status_code == 200
    replacement = moderating(client, owner, page, people[10])
    assert replacement["status"] == "active"


def offer_handover(client, owner, page, to_account_id, key=None, etag=None):
    headers = {**auth(owner), "Idempotency-Key": key or str(uuid4())}
    if etag is not None:
        headers["If-Match"] = etag
    return client.post(f"/v1/pages/{page['id']}/handover", headers=headers, json={"to_account_id": to_account_id})


def offers(client, person):
    response = client.get("/v1/me/handover-offers", headers=auth(person))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_handing_over_moves_the_page_and_the_old_owner_becomes_a_moderator(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    third = account(client, app, "third@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    moderating(client, owner, page, helper)

    stranger = offer_handover(client, owner, page, third["user"]["id"], etag=page["etag"])
    assert stranger.status_code == 409 and stranger.json()["error"]["code"] == "MODERATOR_REQUIRED"
    assert offer_handover(client, owner, page, helper["user"]["id"]).status_code == 428
    dangling = invite(client, owner, page["id"], third["user"]["id"])
    assert dangling.status_code == 201

    key = str(uuid4())
    offered = offer_handover(client, owner, page, helper["user"]["id"], key=key, etag=page["etag"])
    assert offered.status_code == 201, offered.text
    offer = offered.json()["data"]
    assert offer["status"] == "pending" and offer["from_account_id"] == owner["user"]["id"]
    assert datetime.fromisoformat(offer["expires_at"]) == datetime.fromisoformat(offer["created_at"]) + timedelta(minutes=15)
    replay = offer_handover(client, owner, page, helper["user"]["id"], key=key, etag=page["etag"])
    assert replay.status_code == 201 and replay.json()["data"]["id"] == offer["id"]
    assert offer_handover(client, owner, page, third["user"]["id"], key=key, etag=page["etag"]).status_code == 409
    pending = offer_handover(client, owner, page, helper["user"]["id"], etag=page["etag"])
    assert pending.status_code == 409 and pending.json()["error"]["code"] == "HANDOVER_PENDING"

    assert [(row["id"], row["page_name"], row["page_handle"]) for row in offers(client, helper)] == [
        (offer["id"], page["name"], page["handle"]),
    ]
    assert offers(client, third) == [] and offers(client, owner) == []
    assert client.get(f"/v1/pages/{page['id']}/handover", headers=auth(owner)).json()["data"]["id"] == offer["id"]
    assert client.get(f"/v1/pages/{page['id']}/handover", headers=auth(third)).status_code == 404

    accepted = client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/accept",
        headers={**auth(helper), "If-Match": offer["etag"]}, json={},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"]["status"] == "accepted"
    replay = client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/accept",
        headers={**auth(helper), "If-Match": offer["etag"]}, json={},
    )
    assert replay.status_code == 200 and replay.json()["data"]["id"] == offer["id"]

    # The moderator owns the page, and the old owner helps as a moderator.
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(helper)).json()["data"]["can_manage"] is True
    assert [item["id"] for item in client.get("/v1/me/pages", headers=auth(helper)).json()["data"]] == [page["id"]]
    assert client.get("/v1/me/pages", headers=auth(owner)).json()["data"] == []
    listed = client.get(f"/v1/pages/{page['id']}/moderators", headers=auth(helper)).json()["data"]
    assert [(row["account_id"], row["status"]) for row in listed] == [(owner["user"]["id"], "active")]
    assert roles(client, helper) == []
    assert [(row["status"], row["page_id"]) for row in roles(client, owner)] == [("active", page["id"])]
    assert client.post(f"/v1/posts/{post['id']}/pin", headers=auth(owner), json={}).status_code == 200
    assert client.patch(
        f"/v1/pages/{page['id']}", headers={**auth(owner), "If-Match": page["etag"]}, json={"name": "No"},
    ).status_code == 403

    # The new owner removes the old owner, and the invitation that was waiting is no longer accepted.
    row = listed[0]
    assert respond(client, helper, page["id"], row["id"], "remove", row["etag"]).status_code == 200
    assert client.post(f"/v1/posts/{post['id']}/unpin", headers=auth(owner), json={}).status_code == 403
    closed = respond(client, third, page["id"], dangling.json()["data"]["id"], "accept", dangling.json()["data"]["etag"])
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "MODERATOR_INVITATION_CLOSED"
    assert roles(client, third) == []


def sign_in(client, email):
    response = client.post("/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_handover_offers_need_a_recent_sign_in_and_stop_at_the_page_limit(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    page = create_page(client, owner).json()["data"]
    moderating(client, owner, page, helper)

    # An offer, like accepting one, needs a sign-in from the last fifteen minutes.
    advance(app, minutes=16)
    late = offer_handover(client, owner, page, helper["user"]["id"], etag=page["etag"])
    assert late.status_code == 403 and late.json()["error"]["code"] == "REAUTHENTICATION_REQUIRED"
    owner = sign_in(client, "alex@example.test")
    offered = offer_handover(client, owner, page, helper["user"]["id"], etag=page["etag"])
    assert offered.status_code == 201, offered.text
    offer = offered.json()["data"]
    stale = client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/accept",
        headers={**auth(helper), "If-Match": offer["etag"]}, json={},
    )
    assert stale.status_code == 403 and stale.json()["error"]["code"] == "REAUTHENTICATION_REQUIRED"
    helper = sign_in(client, "helper@example.test")
    accepted = client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/accept",
        headers={**auth(helper), "If-Match": offer["etag"]}, json={},
    )
    assert accepted.status_code == 200 and accepted.json()["data"]["status"] == "accepted"

    # A person who already keeps five pages cannot take on another one.
    owner = account(client, app, "crowded@example.test")
    full = account(client, app, "full@example.test")
    for index in range(5):
        assert create_page(client, full, handle=f"full-page-{index}", name=f"Full Page {index}").status_code == 201
    page = create_page(client, owner, handle="parcel", name="Parcel").json()["data"]
    moderating(client, owner, page, full)
    offer = offer_handover(client, owner, page, full["user"]["id"], etag=page["etag"]).json()["data"]
    refused = client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/accept",
        headers={**auth(full), "If-Match": offer["etag"]}, json={},
    )
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "PAGE_LIMIT_REACHED"


def test_handover_offers_can_be_declined_cancelled_expired_or_invalidated(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    page = create_page(client, owner).json()["data"]
    moderating(client, owner, page, helper)

    first = offer_handover(client, owner, page, helper["user"]["id"], etag=page["etag"]).json()["data"]
    assert client.post(
        f"/v1/pages/{page['id']}/handover/{first['id']}/decline", headers=auth(helper), json={},
    ).status_code == 428
    assert client.post(
        f"/v1/pages/{page['id']}/handover/{first['id']}/decline",
        headers={**auth(owner), "If-Match": first["etag"]}, json={},
    ).status_code == 404
    declined = client.post(
        f"/v1/pages/{page['id']}/handover/{first['id']}/decline",
        headers={**auth(helper), "If-Match": first["etag"]}, json={},
    )
    assert declined.status_code == 200 and declined.json()["data"]["status"] == "declined"
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]["can_manage"] is True
    assert [(row["status"], row["page_id"]) for row in roles(client, helper)] == [("active", page["id"])]

    second = offer_handover(client, owner, page, helper["user"]["id"], etag=page["etag"]).json()["data"]
    cancelled = client.post(
        f"/v1/pages/{page['id']}/handover/{second['id']}/cancel",
        headers={**auth(owner), "If-Match": second["etag"]}, json={},
    )
    assert cancelled.status_code == 200 and cancelled.json()["data"]["status"] == "cancelled"
    assert offers(client, helper) == []

    # A page edit invalidates the pending offer, and the recipient is told why.
    third = offer_handover(client, owner, page, helper["user"]["id"], etag=page["etag"]).json()["data"]
    edited = client.patch(
        f"/v1/pages/{page['id']}", headers={**auth(owner), "If-Match": page["etag"]}, json={"name": "River Walkers Club"},
    )
    assert edited.status_code == 200, edited.text
    invalidated = client.post(
        f"/v1/pages/{page['id']}/handover/{third['id']}/accept",
        headers={**auth(helper), "If-Match": third["etag"]}, json={},
    )
    assert invalidated.status_code == 409 and invalidated.json()["error"]["code"] == "HANDOVER_INVALIDATED"

    # Fifteen minutes end an offer; a fresh sign-in does not revive it.
    fourth = offer_handover(client, owner, page, helper["user"]["id"], etag=edited.json()["data"]["etag"]).json()["data"]
    advance(app, minutes=15, seconds=1)
    helper = sign_in(client, "helper@example.test")
    expired = client.post(
        f"/v1/pages/{page['id']}/handover/{fourth['id']}/accept",
        headers={**auth(helper), "If-Match": fourth["etag"]}, json={},
    )
    assert expired.status_code == 410 and expired.json()["error"]["code"] == "HANDOVER_EXPIRED"
    assert offers(client, helper) == []


@pytest.mark.parametrize("action", ["accept", "decline", "withdraw", "step-down", "remove"])
def test_an_answer_that_waits_for_the_role_past_the_session_changes_nothing(client, app, action):
    # T115 (3): the session was checked only before waiting for the invitation's row lock, as T89 found for agent requests.
    from tests.test_messaging import expire_while_waiting

    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    page = create_page(client, owner).json()["data"]
    if action in ("step-down", "remove"):
        row = moderating(client, owner, page, helper)
    else:
        row = invite(client, owner, page["id"], helper["user"]["id"]).json()["data"]
    actor = owner if action in ("withdraw", "remove") else helper
    late = expire_while_waiting(app, "page_moderators", row["id"], lambda: respond(client, actor, page["id"], row["id"], action, row["etag"]))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.get(PageModerator, row["id"]).status == row["status"]


@pytest.mark.parametrize("action", ["decline", "cancel"])
def test_an_answer_to_a_handover_that_waits_past_the_session_changes_nothing(client, app, action):
    # As T115 (3) for an offer: accepting signs in again after the wait, but declining and cancelling did not.
    from tests.test_messaging import expire_while_waiting

    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    page = create_page(client, owner).json()["data"]
    moderating(client, owner, page, helper)
    current = client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]
    offer = offer_handover(client, owner, page, helper["user"]["id"], etag=current["etag"]).json()["data"]
    actor = helper if action == "decline" else owner
    late = expire_while_waiting(app, "page_handovers", offer["id"], lambda: client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/{action}", headers={**auth(actor), "If-Match": offer["etag"]}, json={},
    ))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.get(PageHandover, offer["id"]).status == "pending"


def test_an_answer_to_a_handover_locks_the_page_before_the_offer(client, app):
    # Offering and deleting lock the page, then the offer; an answer that locked them the other way round could deadlock with them.
    from concurrent.futures import ThreadPoolExecutor

    from sqlalchemy import text

    from tests.test_messaging import wait_until_blocked

    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    page = create_page(client, owner).json()["data"]
    moderating(client, owner, page, helper)
    current = client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]
    offer = offer_handover(client, owner, page, helper["user"]["id"], etag=current["etag"]).json()["data"]
    with ThreadPoolExecutor(max_workers=1) as pool, app.state.engine.connect() as holder, app.state.engine.connect() as probe:
        held = holder.begin()
        holder.execute(text("SELECT 1 FROM public_pages WHERE id = :id FOR UPDATE"), {"id": page["id"]})
        pending = pool.submit(lambda: client.post(
            f"/v1/pages/{page['id']}/handover/{offer['id']}/decline", headers={**auth(helper), "If-Match": offer["etag"]}, json={},
        ))
        wait_until_blocked(app, pending)
        probing = probe.begin()
        free = probe.execute(text("SELECT 1 FROM page_handovers WHERE id = :id FOR UPDATE SKIP LOCKED"), {"id": offer["id"]}).first()
        probing.rollback()
        held.commit()
        answered = pending.result(timeout=10)
    assert free is not None, "The answer held the offer while it waited for the page."
    assert answered.status_code == 200, answered.text
