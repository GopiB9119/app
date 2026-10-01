from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.modules.spaces.models import Space, SpaceInvitation, SpaceMembership
from tests.test_documents import add, found, listed, read, search
from tests.test_identity import account, auth
from tests.test_messaging import advance, roster_entry
from tests.test_space_directory import ask, set_visibility
from tests.test_spaces import create_space, invite_account


def accept(client, person, invitation_id):
    return client.post(f"/v1/invitations/{invitation_id}/accept", headers=auth(person), json={})


def couple(client, app):
    owner = account(client, app)
    partner = account(client, app, "partner@example.test")
    created = create_space(client, owner, "Sam and Alex", space_type="couple")
    assert created.status_code == 201, created.text
    space = created.json()["data"]
    invitation = invite_account(client, owner, space["id"], partner["user"]["id"])
    assert invitation.status_code == 201, invitation.text
    joined = accept(client, partner, invitation.json()["data"]["id"])
    assert joined.status_code == 200, joined.text
    return owner, partner, space


def active_members(app, space_id):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(SpaceMembership).where(
            SpaceMembership.space_id == space_id, SpaceMembership.status == "active",
        ))


def leave(client, person, space_id):
    mine = roster_entry(client, person, space_id, person["user"]["id"])
    return client.post(
        f"/v1/spaces/{space_id}/leave",
        headers={**auth(person), "If-Match": mine["etag"], "Idempotency-Key": str(uuid4())}, json={},
    )


def test_couple_space_is_private_and_admits_exactly_one_partner(client, app):
    owner = account(client, app)
    partner = account(client, app, "partner@example.test")
    third = account(client, app, "third@example.test")
    created = create_space(client, owner, "Sam and Alex", space_type="couple")
    assert created.status_code == 201, created.text
    space = created.json()["data"]
    assert (space["space_type"], space["visibility"], space["role"]) == ("couple", "private", "owner")
    # The creator can use the Space before the partner joins.
    assert add(client, owner, space["id"], name="ideas.txt", content="Trip ideas for us.").status_code == 201

    first = invite_account(client, owner, space["id"], partner["user"]["id"])
    assert first.status_code == 201, first.text
    assert invite_account(client, owner, space["id"], partner["user"]["id"]).json()["error"]["code"] == "INVITATION_PENDING"
    waiting = invite_account(client, owner, space["id"], third["user"]["id"])
    assert waiting.status_code == 409 and waiting.json()["error"]["code"] == "COUPLE_INVITATION_PENDING"
    assert accept(client, partner, first.json()["data"]["id"]).status_code == 200
    full = invite_account(client, owner, space["id"], third["user"]["id"])
    assert full.status_code == 409 and full.json()["error"]["code"] == "COUPLE_FULL"

    # An invitation that reached the database some other way still cannot admit a third person.
    planted = str(uuid4())
    with app.state.sessions.begin() as database:
        database.add(SpaceInvitation(
            id=planted, space_id=space["id"], inviter_id=owner["user"]["id"], recipient_id=third["user"]["id"],
            request_key=str(uuid4()), status="pending", created_at=app.state.clock(),
            expires_at=app.state.clock() + timedelta(hours=1),
        ))
    refused = accept(client, third, planted)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "COUPLE_FULL"
    assert active_members(app, space["id"]) == 2
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(third)).status_code == 404

    public = set_visibility(client, owner, space["id"], "public")
    assert public.status_code == 409 and public.json()["error"]["code"] == "PRIVATE_SPACE_TYPE"
    assert ask(client, third, space["id"]).status_code == 404
    body = {"name": "Us", "space_type": "couple", "visibility": "public"}
    assert client.post("/v1/spaces", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json=body).status_code == 422


def test_parallel_invitations_to_two_people_leave_one_waiting(client, app):
    owner = account(client, app)
    people = [account(client, app, f"candidate-{number}@example.test") for number in range(2)]
    space_id = create_space(client, owner, "Us", space_type="couple").json()["data"]["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda person: invite_account(client, owner, space_id, person["user"]["id"]), people))
    assert sorted(result.status_code for result in results) == [201, 409], [result.text for result in results]
    assert {result.json()["error"]["code"] for result in results if result.status_code == 409} == {"COUPLE_INVITATION_PENDING"}


@pytest.mark.parametrize("operation", ["third_member", "convert"])
def test_couple_database_rules_refuse_a_third_member_and_a_type_change(client, app, operation):
    _owner, _partner, space = couple(client, app)
    third = account(client, app, "third@example.test")
    with pytest.raises(IntegrityError):
        with app.state.sessions.begin() as database:
            if operation == "third_member":
                database.add(SpaceMembership(
                    space_id=space["id"], account_id=third["user"]["id"], role="member", status="active",
                    joined_at=app.state.clock(), admission_sequence=3,
                ))
            else:
                database.get(Space, space["id"]).space_type = "family"
    assert active_members(app, space["id"]) == 2
    with app.state.sessions() as database:
        assert database.get(Space, space["id"]).space_type == "couple"


def test_after_a_separation_a_new_partner_sees_nothing_from_before(client, app):
    owner, partner, space = couple(client, app)
    shared = add(client, partner, space["id"], name="budget.txt", content="Our shared budget plan.").json()["data"]
    advance(app, minutes=1)
    reviewed = roster_entry(client, owner, space["id"], partner["user"]["id"])
    removed = client.post(
        f"/v1/spaces/{space['id']}/members/{partner['user']['id']}/remove",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removed.status_code == 200, removed.text
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(partner)).status_code == 404
    assert read(client, partner, shared["id"]).status_code == 404
    assert found(search(client, partner, "budget"), "documents") == []

    newcomer = account(client, app, "new-partner@example.test")
    invitation = invite_account(client, owner, space["id"], newcomer["user"]["id"])
    assert invitation.status_code == 201, invitation.text
    assert accept(client, newcomer, invitation.json()["data"]["id"]).status_code == 200
    assert listed(client, newcomer, space["id"]).json()["data"] == []
    assert read(client, newcomer, shared["id"]).status_code == 404
    assert found(search(client, newcomer, "budget"), "documents") == []
    assert read(client, owner, shared["id"]).status_code == 200
    # The former partner cannot come back while the new partner is there.
    again = invite_account(client, owner, space["id"], partner["user"]["id"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "COUPLE_FULL"


def test_the_partner_can_leave_and_the_owner_must_hand_over_first(client, app):
    owner, partner, space = couple(client, app)
    assert leave(client, owner, space["id"]).status_code == 409
    left = leave(client, partner, space["id"])
    assert left.status_code == 200, left.text
    assert active_members(app, space["id"]) == 1
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(owner)).json()["data"]["space_type"] == "couple"
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(partner)).status_code == 404
