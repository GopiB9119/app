from uuid import uuid4

from sqlalchemy import func, select

from app.modules.identity.models import OutboxEvent
from app.modules.spaces.models import SpaceAuditEvent, SpaceMembership
from tests.test_identity import account, auth
from tests.test_messaging import admit, roster_entry
from tests.test_space_directory import ask, group, pending_for, review
from tests.test_spaces import create_space, invite_account, membership_fixture


def change_role(client, actor, space_id, target_id, role, etag, key=None):
    headers = {**auth(actor), "Idempotency-Key": key or str(uuid4())}
    if etag is not None:
        headers["If-Match"] = etag
    return client.post(f"/v1/spaces/{space_id}/members/{target_id}/role", headers=headers, json={"role": role})


def promote(client, owner, space_id, person):
    reviewed = roster_entry(client, owner, space_id, person["user"]["id"])
    promoted = change_role(client, owner, space_id, person["user"]["id"], "admin", reviewed["etag"])
    assert promoted.status_code == 200, promoted.text
    return promoted.json()["data"]


def remove(client, actor, space_id, target, etag):
    return client.post(
        f"/v1/spaces/{space_id}/members/{target['user']['id']}/remove",
        headers={**auth(actor), "Idempotency-Key": str(uuid4()), "If-Match": etag}, json={},
    )


def test_the_owner_makes_a_reviewed_member_an_admin_and_back(client, app):
    owner, member, space_id, _invitation, reviewed = membership_fixture(client, app)
    target = member["user"]["id"]
    assert change_role(client, owner, space_id, target, "admin", None).status_code == 428
    assert change_role(client, owner, space_id, target, "admin", '"stale"').status_code == 412
    assert change_role(client, owner, space_id, target, "owner", reviewed["etag"]).status_code == 422
    assert change_role(client, member, space_id, target, "admin", reviewed["etag"]).status_code == 404
    key = str(uuid4())
    promoted = change_role(client, owner, space_id, target, "admin", reviewed["etag"], key)
    assert promoted.status_code == 200, promoted.text
    view = promoted.json()["data"]
    assert view["role"] == "admin" and view["account_id"] == target and view["etag"] != reviewed["etag"]
    # The same request again reports the result once; the same key for something else is refused.
    assert change_role(client, owner, space_id, target, "admin", reviewed["etag"], key).json()["data"] == view
    assert change_role(client, owner, space_id, target, "member", reviewed["etag"], key).status_code == 409
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).json()["data"]["role"] == "admin"
    assert roster_entry(client, owner, space_id, target)["role"] == "admin"
    again = change_role(client, owner, space_id, target, "admin", view["etag"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "NO_CHANGES"
    owner_entry = roster_entry(client, owner, space_id, owner["user"]["id"])
    assert change_role(client, owner, space_id, owner["user"]["id"], "member", owner_entry["etag"]).status_code == 404
    demoted = change_role(client, owner, space_id, target, "member", view["etag"])
    assert demoted.status_code == 200 and demoted.json()["data"]["role"] == "member"
    with app.state.sessions() as database:
        actions = database.scalars(select(SpaceAuditEvent.action).where(SpaceAuditEvent.target_id == target)).all()
        assert sorted(action for action in actions if "admin" in action) == ["space.admin_made_member", "space.member_made_admin"]
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "space.member_made_admin")) == 1


def test_an_admin_manages_ordinary_members_but_nothing_more(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    ordinary = account(client, app, "ordinary@example.test")
    newcomer = account(client, app, "newcomer@example.test")
    seeker = account(client, app, "seeker@example.test")
    space_id = group(client, owner).json()["data"]["id"]
    for person in (helper, ordinary):
        admit(client, owner, space_id, person)
    promote(client, owner, space_id, helper)
    second = account(client, app, "second-admin@example.test")
    admit(client, owner, space_id, second)
    promote(client, owner, space_id, second)

    sent = invite_account(client, helper, space_id, newcomer["user"]["id"])
    assert sent.status_code == 201, sent.text
    inbox = client.get("/v1/invitations", headers=auth(newcomer)).json()["data"]
    assert [item["id"] for item in inbox] == [sent.json()["data"]["id"]]
    assert client.get(f"/v1/spaces/{space_id}/invitations", headers=auth(helper)).status_code == 200
    accepted = client.post(f"/v1/invitations/{sent.json()['data']['id']}/accept", headers=auth(newcomer), json={})
    assert accepted.status_code == 200 and accepted.json()["data"]["role"] == "member"

    asked = ask(client, seeker, space_id)
    assert asked.status_code == 201, asked.text
    assert [item["account_id"] for item in pending_for(client, helper, space_id).json()["data"]] == [seeker["user"]["id"]]
    assert review(client, helper, space_id, asked.json()["data"]["id"], "approve").status_code == 200

    removed = remove(client, helper, space_id, ordinary, roster_entry(client, helper, space_id, ordinary["user"]["id"])["etag"])
    assert removed.status_code == 200, removed.text
    refused = remove(client, helper, space_id, second, roster_entry(client, helper, space_id, second["user"]["id"])["etag"])
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "OWNER_ONLY"
    assert remove(client, helper, space_id, owner, roster_entry(client, helper, space_id, owner["user"]["id"])["etag"]).status_code == 409
    newcomer_entry = roster_entry(client, helper, space_id, newcomer["user"]["id"])
    assert change_role(client, helper, space_id, newcomer["user"]["id"], "admin", newcomer_entry["etag"]).status_code == 404
    assert client.get(f"/v1/spaces/{space_id}/settings", headers=auth(helper)).status_code == 404
    offer = client.post(
        f"/v1/spaces/{space_id}/ownership-transfers",
        headers={**auth(helper), "Idempotency-Key": str(uuid4()), "If-Match": newcomer_entry["etag"]},
        json={"recipient_account_id": newcomer["user"]["id"]},
    )
    assert offer.status_code == 404
    # The owner can remove an admin, and an admin can leave.
    assert remove(client, owner, space_id, second, roster_entry(client, owner, space_id, second["user"]["id"])["etag"]).status_code == 200
    mine = roster_entry(client, helper, space_id, helper["user"]["id"])
    left = client.post(f"/v1/spaces/{space_id}/leave", headers={**auth(helper), "Idempotency-Key": str(uuid4()), "If-Match": mine["etag"]}, json={})
    assert left.status_code == 200, left.text


def test_an_invitation_lapses_when_its_sender_stops_being_an_admin(client, app):
    owner, member, space_id, _invitation, _reviewed = membership_fixture(client, app)
    guest = account(client, app, "later-guest@example.test")
    view = promote(client, owner, space_id, member)
    sent = invite_account(client, member, space_id, guest["user"]["id"])
    assert sent.status_code == 201, sent.text
    assert change_role(client, owner, space_id, member["user"]["id"], "member", view["etag"]).status_code == 200
    assert client.get("/v1/invitations", headers=auth(guest)).json()["data"] == []
    late = client.post(f"/v1/invitations/{sent.json()['data']['id']}/accept", headers=auth(guest), json={})
    assert late.status_code == 404
    with app.state.sessions() as database:
        assert database.get(SpaceMembership, (space_id, guest["user"]["id"])) is None
    assert invite_account(client, member, space_id, guest["user"]["id"]).status_code == 404


def test_roles_exist_only_in_family_and_group_spaces(client, app):
    owner = account(client, app)
    partner = account(client, app, "role-partner@example.test")
    couple = create_space(client, owner, "Us", space_type="couple").json()["data"]["id"]
    admit(client, owner, couple, partner)
    entry = roster_entry(client, owner, couple, partner["user"]["id"])
    refused = change_role(client, owner, couple, partner["user"]["id"], "admin", entry["etag"])
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "ROLE_NOT_AVAILABLE"


def test_ownership_can_be_handed_to_an_admin(client, app):
    owner, member, space_id, _invitation, _reviewed = membership_fixture(client, app)
    view = promote(client, owner, space_id, member)
    base = f"/v1/spaces/{space_id}/ownership-transfers"
    offered = client.post(base, headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": view["etag"]},
                          json={"recipient_account_id": member["user"]["id"]})
    assert offered.status_code == 201, offered.text
    transfer = offered.json()["data"]
    accepted = client.post(f"{base}/{transfer['id']}/accept", headers={**auth(member), "If-Match": transfer["etag"]}, json={})
    assert accepted.status_code == 200, accepted.text
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(member)).json()["data"]["role"] == "owner"
    assert client.get(f"/v1/spaces/{space_id}", headers=auth(owner)).json()["data"]["role"] == "member"
