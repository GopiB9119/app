"""Per-Space setting: who can invite people (DEC-026)."""

from uuid import uuid4

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.modules.identity.models import OutboxEvent
from app.modules.spaces.models import Space, SpaceAuditEvent
from tests.test_identity import account, auth
from tests.test_messaging import admit
from tests.test_space_directory import group, settings
from tests.test_space_roles import promote
from tests.test_spaces import create_space, invite_account


def set_policy(client, actor, space_id, member_invites, etag=None, key=None):
    headers = {**auth(actor), "Idempotency-Key": key or str(uuid4())}
    if etag is not None:
        headers["If-Match"] = etag
    return client.post(f"/v1/spaces/{space_id}/invite-policy", headers=headers, json={"member_invites": member_invites})


def let_members_invite(client, owner, space_id, member_invites=True):
    changed = set_policy(client, owner, space_id, member_invites, settings(client, owner, space_id)["etag"])
    assert changed.status_code == 200, changed.text
    return changed.json()["data"]


def sent(client, actor, space_id):
    return client.get(f"/v1/spaces/{space_id}/invitations", headers=auth(actor))


def sent_ids(client, actor, space_id):
    response = sent(client, actor, space_id)
    assert response.status_code == 200, response.text
    return {item["id"] for item in response.json()["data"]}


def accept(client, person, invitation_id):
    return client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(person), json={})


def revoke(client, actor, space_id, invitation_id):
    return client.post(f"/v1/spaces/{space_id}/invitations/{invitation_id}/revoke", headers=auth(actor), json={})


def inbox(client, person):
    response = client.get("/v1/invitations", headers=auth(person))
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["data"]]


def invited(client, actor, space_id, person):
    response = invite_account(client, actor, space_id, person["user"]["id"])
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def test_only_the_owner_changes_who_can_invite_after_reviewing_the_settings(client, app):
    owner = account(client, app)
    member = account(client, app, "member@example.test")
    helper = account(client, app, "helper@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    admit(client, owner, space_id, helper)
    promote(client, owner, space_id, helper)
    reviewed = settings(client, owner, space_id)
    assert reviewed["member_invites"] is False
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).json()["data"]["member_invites"] is False
    assert set_policy(client, owner, space_id, True).status_code == 428
    assert set_policy(client, owner, space_id, True, '"stale"').status_code == 412
    for other in (member, helper):
        refused = set_policy(client, other, space_id, True, reviewed["etag"])
        assert refused.status_code == 404 and refused.json()["error"]["message"] == "Space not found."
    key = str(uuid4())
    changed = set_policy(client, owner, space_id, True, reviewed["etag"], key)
    assert changed.status_code == 200, changed.text
    view = changed.json()["data"]
    assert view["member_invites"] is True and view["etag"] != reviewed["etag"] and view["version"] != reviewed["version"]
    # The same request again reports the result once; the same key for the other choice is refused.
    assert set_policy(client, owner, space_id, True, reviewed["etag"], key).json()["data"] == view
    assert set_policy(client, owner, space_id, False, reviewed["etag"], key).status_code == 409
    again = set_policy(client, owner, space_id, True, view["etag"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "NO_CHANGES"
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).json()["data"]["member_invites"] is True
    off = set_policy(client, owner, space_id, False, view["etag"])
    assert off.status_code == 200 and off.json()["data"]["member_invites"] is False
    with app.state.sessions() as database:
        actions = database.scalars(select(SpaceAuditEvent.action).where(
            SpaceAuditEvent.space_id == space_id, SpaceAuditEvent.action.like("space.member_invites_%"),
        )).all()
        assert sorted(actions) == ["space.member_invites_off", "space.member_invites_on"]
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(
            OutboxEvent.event_type == "space.member_invites_on",
        )) == 1


@pytest.mark.parametrize("space_type", ["couple", "solo"])
def test_couple_and_solo_spaces_have_no_such_setting(client, app, space_type):
    owner = account(client, app)
    space_id = create_space(client, owner, space_type=space_type).json()["data"]["id"]
    refused = set_policy(client, owner, space_id, True, settings(client, owner, space_id)["etag"])
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "INVITE_POLICY_UNAVAILABLE"
    assert settings(client, owner, space_id)["member_invites"] is False
    # The database refuses it too, whatever the code does.
    with app.state.sessions() as database:
        with pytest.raises(IntegrityError):
            database.execute(update(Space).where(Space.id == space_id).values(member_invites=True))
        database.rollback()


def test_with_the_setting_on_a_member_invites_and_handles_only_their_own_invitations(client, app):
    owner = account(client, app)
    member = account(client, app, "member@example.test")
    guest = account(client, app, "guest@example.test")
    friend = account(client, app, "friend@example.test")
    later = account(client, app, "later@example.test")
    space_id = group(client, owner, visibility="private").json()["data"]["id"]
    admit(client, owner, space_id, member)
    # By default members cannot invite, and learn nothing about the Space's invitations.
    before = invite_account(client, member, space_id, guest["user"]["id"])
    assert before.status_code == 404 and before.json()["error"]["message"] == "Space not found."
    assert sent(client, member, space_id).status_code == 404

    let_members_invite(client, owner, space_id)
    mine = invited(client, member, space_id, guest)
    theirs = invited(client, owner, space_id, friend)
    assert sent_ids(client, member, space_id) == {mine}
    assert {mine, theirs} <= sent_ids(client, owner, space_id)
    refused = revoke(client, member, space_id, theirs)
    assert refused.status_code == 404 and refused.json()["error"]["message"] == "Invitation not found."
    assert inbox(client, friend) == [theirs]

    assert inbox(client, guest) == [mine]
    joined = accept(client, guest, mine)
    assert joined.status_code == 200 and joined.json()["data"]["role"] == "member"
    # The person who joined is a member too, so they can invite as well.
    withdrawn = invited(client, guest, space_id, later)
    assert sent_ids(client, guest, space_id) == {withdrawn}
    outcome = revoke(client, guest, space_id, withdrawn)
    assert outcome.status_code == 200 and outcome.json()["data"]["status"] == "revoked"
    assert inbox(client, later) == []


def test_turning_the_setting_off_ends_members_waiting_invitations(client, app):
    owner = account(client, app)
    member = account(client, app, "member@example.test")
    helper = account(client, app, "helper@example.test")
    guest = account(client, app, "guest@example.test")
    friend = account(client, app, "friend@example.test")
    visitor = account(client, app, "visitor@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    admit(client, owner, space_id, helper)
    promote(client, owner, space_id, helper)
    let_members_invite(client, owner, space_id)
    waiting = invited(client, member, space_id, guest)
    from_admin = invited(client, helper, space_id, friend)

    let_members_invite(client, owner, space_id, False)
    assert inbox(client, guest) == []
    late = accept(client, guest, waiting)
    assert late.status_code == 409 and late.json()["error"]["code"] == "INVITATION_CLOSED"
    assert invite_account(client, member, space_id, visitor["user"]["id"]).status_code == 404
    assert sent(client, member, space_id).status_code == 404
    # The owner and admins see it ended, and their own invitations are not affected.
    statuses = {item["id"]: item["status"] for item in sent(client, helper, space_id).json()["data"]}
    assert statuses[waiting] == "revoked" and statuses[from_admin] == "pending"
    assert accept(client, friend, from_admin).status_code == 200

    # Turning it on again does not bring the ended invitation back.
    let_members_invite(client, owner, space_id)
    assert inbox(client, guest) == []
    assert accept(client, guest, waiting).status_code == 409
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(SpaceAuditEvent).where(
            SpaceAuditEvent.target_id == waiting, SpaceAuditEvent.action == "space.invitation_revoked",
        )) == 1


def test_a_members_invitation_admits_only_while_the_setting_is_on(client, app):
    owner = account(client, app)
    member = account(client, app, "member@example.test")
    guest = account(client, app, "guest@example.test")
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    let_members_invite(client, owner, space_id)
    waiting = invited(client, member, space_id, guest)
    # A change made outside the command, as a database restore could make, still leaves the invitation unusable.
    with app.state.sessions.begin() as database:
        database.execute(update(Space).where(Space.id == space_id).values(member_invites=False))
    assert inbox(client, guest) == []
    assert accept(client, guest, waiting).status_code == 404


def test_a_member_who_invites_keeps_a_limited_number_waiting(client, app, monkeypatch):
    monkeypatch.setattr("app.modules.spaces.service.MAX_MEMBER_WAITING_INVITATIONS", 2)
    owner = account(client, app)
    member = account(client, app, "member@example.test")
    guests = [account(client, app, f"guest-{index}@example.test") for index in range(3)]
    space_id = create_space(client, owner).json()["data"]["id"]
    admit(client, owner, space_id, member)
    let_members_invite(client, owner, space_id)
    first = invited(client, member, space_id, guests[0])
    invited(client, member, space_id, guests[1])
    over = invite_account(client, member, space_id, guests[2]["user"]["id"])
    assert over.status_code == 409 and over.json()["error"]["code"] == "INVITATION_LIMIT_REACHED"
    # Withdrawing one makes room; the owner was never limited by it.
    assert revoke(client, member, space_id, first).status_code == 200
    assert invite_account(client, member, space_id, guests[2]["user"]["id"]).status_code == 201
    assert invite_account(client, owner, space_id, guests[0]["user"]["id"]).status_code == 201
