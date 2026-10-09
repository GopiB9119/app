from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.modules.polls.schemas import PollCursor
from app.modules.spaces.models import SpaceMembership
from tests.test_identity import account, auth
from tests.test_live_updates import Hints, leave_or_remove
from tests.test_messaging import admit, family
from tests.test_spaces import create_space


def create_poll(client, actor, space_id, question="Where should we eat?", options=("Pizza House", "Indian Kitchen", "Burger Place"), key=None, **fields):
    return client.post(f"/v1/spaces/{space_id}/polls", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
                       json={"question": question, "options": list(options), **fields})


def vote(client, actor, poll_id, option_id):
    return client.put(f"/v1/polls/{poll_id}/vote", headers=auth(actor), json={"option_id": option_id})


def counts(poll):
    return {option["label"]: option["votes"] for option in poll["options"]}


def test_poll_cursor_requires_the_current_admission():
    values = {
        "kind": "space_polls", "account_id": str(uuid4()), "space_id": str(uuid4()),
        "admission_id": str(uuid4()), "status": "open", "before_id": str(uuid4()),
        "before_created_at": "2026-10-07T10:00:00Z", "expires_at": "2026-10-07T10:15:00Z",
    }
    assert str(PollCursor.model_validate(values).admission_id) == values["admission_id"]
    with pytest.raises(ValidationError):
        PollCursor.model_validate({name: value for name, value in values.items() if name != "admission_id"})


def test_members_vote_once_change_their_vote_and_see_counts_and_ties(client, app):
    owner, member, space_id = family(client, app)
    created = create_poll(client, owner, space_id)
    assert created.status_code == 201, created.text
    poll = created.json()["data"]
    pizza, indian, _burger = (option["id"] for option in poll["options"])
    assert (poll["status"], poll["total_votes"], poll["leading_option_ids"], poll["can_close"]) == ("open", 0, [], True)
    assert vote(client, owner, poll["id"], pizza).json()["data"]["my_option_id"] == pizza
    tied = vote(client, member, poll["id"], indian).json()["data"]
    assert (tied["total_votes"], sorted(tied["leading_option_ids"])) == (2, sorted([pizza, indian]))
    # The member did not ask, so they get no review tag to close it with.
    assert (tied["can_close"], tied["etag"]) == (False, None)
    assert vote(client, member, poll["id"], indian).json()["data"]["total_votes"] == 2
    changed = vote(client, member, poll["id"], pizza).json()["data"]
    assert counts(changed) == {"Pizza House": 2, "Indian Kitchen": 0, "Burger Place": 0}
    assert changed["leading_option_ids"] == [pizza]
    withdrawn = client.delete(f"/v1/polls/{poll['id']}/vote", headers=auth(member))
    assert withdrawn.status_code == 200, withdrawn.text
    assert (withdrawn.json()["data"]["my_option_id"], withdrawn.json()["data"]["total_votes"]) == (None, 1)
    app.state.clock.now += timedelta(seconds=1)
    other = create_poll(client, owner, space_id, question="Which day?", options=("Saturday", "Sunday")).json()["data"]
    assert datetime.fromisoformat(other["created_at"]) > datetime.fromisoformat(poll["created_at"])
    refused = vote(client, member, poll["id"], other["options"][0]["id"])
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "POLL_OPTION_UNKNOWN"
    listed = client.get(f"/v1/spaces/{space_id}/polls", headers=auth(member)).json()["data"]
    assert [item["id"] for item in listed] == [other["id"], poll["id"]]


def test_poll_pagination_orders_timestamp_ties_without_duplicates_or_omissions(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    polls = []
    for number in range(3):
        response = create_poll(client, owner, space_id, question=f"Same instant {number}?")
        assert response.status_code == 201, response.text
        polls.append(response.json()["data"])
    assert len({poll["created_at"] for poll in polls}) == 1
    expected_ids = sorted((poll["id"] for poll in polls), reverse=True)
    path = f"/v1/spaces/{space_id}/polls"
    cursor, first_cursor = None, None
    observed_ids = []
    for index in range(3):
        parameters = {"limit": 1}
        if cursor:
            parameters["cursor"] = cursor
        response = client.get(path, headers=auth(owner), params=parameters)
        assert response.status_code == 200, response.text
        page = response.json()
        assert [poll["id"] for poll in page["data"]] == [expected_ids[index]]
        observed_ids.extend(poll["id"] for poll in page["data"])
        cursor = page["pagination"]["next_cursor"]
        assert page["pagination"]["has_more"] is (index < 2)
        assert (cursor is not None) is (index < 2)
        if index == 0:
            first_cursor = cursor
    assert observed_ids == expected_ids
    remaining = client.get(path, headers=auth(owner), params={"limit": 2, "cursor": first_cursor})
    assert remaining.status_code == 200, remaining.text
    assert [poll["id"] for poll in remaining.json()["data"]] == expected_ids[1:]
    assert remaining.json()["pagination"] == {"next_cursor": None, "has_more": False}


def test_creation_retries_reuse_one_intent_and_choices_are_checked(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    key = str(uuid4())
    first = create_poll(client, owner, space_id, key=key)
    assert first.status_code == 201, first.text
    assert create_poll(client, owner, space_id, key=key).json()["data"]["id"] == first.json()["data"]["id"]
    conflict = create_poll(client, owner, space_id, question="Something else?", key=key)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    for options in (["Only one"], ["Same", " same "], [f"Choice {number}" for number in range(7)], ["Fine", ""]):
        assert create_poll(client, owner, space_id, options=options).status_code == 422, options
    soon = create_poll(client, owner, space_id, closes_at=(app.state.clock.now + timedelta(minutes=1)).isoformat())
    assert soon.status_code == 422 and soon.json()["error"]["code"] == "POLL_CLOSING_TIME"
    assert len(client.get(f"/v1/spaces/{space_id}/polls", headers=auth(owner)).json()["data"]) == 1


def test_only_the_asker_or_a_manager_closes_and_closed_polls_refuse_votes(client, app):
    owner, member, space_id = family(client, app)
    poll = create_poll(client, member, space_id).json()["data"]
    path = f"/v1/polls/{poll['id']}/close"
    assert client.post(path, headers=auth(member), json={}).status_code == 428
    assert client.post(path, headers={**auth(member), "If-Match": '"stale"'}, json={}).status_code == 412
    closed = client.post(path, headers={**auth(member), "If-Match": poll["etag"]}, json={})
    assert closed.status_code == 200, closed.text
    assert (closed.json()["data"]["status"], closed.json()["data"]["can_vote"]) == ("closed", False)
    late = vote(client, owner, poll["id"], poll["options"][0]["id"])
    assert late.status_code == 409 and late.json()["error"]["code"] == "POLL_CLOSED"
    assert client.get(f"/v1/spaces/{space_id}/polls", headers=auth(owner)).json()["data"] == []
    assert [item["id"] for item in client.get(f"/v1/spaces/{space_id}/polls?status=closed", headers=auth(owner)).json()["data"]] == [poll["id"]]
    third = account(client, app, "third@example.test")
    admit(client, owner, space_id, third)
    second = create_poll(client, owner, space_id, question="Next time?").json()["data"]
    denied = client.post(f"/v1/polls/{second['id']}/close", headers={**auth(third), "If-Match": '"any"'}, json={})
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "POLL_CLOSE_DENIED"
    timed = create_poll(client, owner, space_id, question="Timed?", closes_at=(app.state.clock.now + timedelta(minutes=10)).isoformat()).json()["data"]
    app.state.clock.now += timedelta(minutes=11)
    read = client.get(f"/v1/polls/{timed['id']}", headers=auth(third)).json()["data"]
    assert read["status"] == "closed" and datetime.fromisoformat(read["closed_at"]) == datetime.fromisoformat(timed["closes_at"])


def test_newcomers_do_not_see_earlier_polls_and_former_members_votes_stop_counting(client, app):
    owner, member, space_id = family(client, app)
    poll = create_poll(client, owner, space_id).json()["data"]
    assert vote(client, member, poll["id"], poll["options"][0]["id"]).status_code == 200
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)
    assert client.get(f"/v1/polls/{poll['id']}", headers=auth(newcomer)).status_code == 404
    assert client.get(f"/v1/spaces/{space_id}/polls", headers=auth(newcomer)).json()["data"] == []
    assert vote(client, newcomer, poll["id"], poll["options"][0]["id"]).status_code == 404
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (space_id, member["user"]["id"])).status = "removed"
    assert client.get(f"/v1/polls/{poll['id']}", headers=auth(owner)).json()["data"]["total_votes"] == 0
    outsider = account(client, app, "outsider@example.test")
    assert client.get(f"/v1/polls/{poll['id']}", headers=auth(outsider)).status_code == 404


def test_poll_cursor_cannot_continue_after_leaving_and_rejoining(client, app):
    owner, member, space_id = family(client, app)
    create_poll(client, owner, space_id, question="First poll?")
    create_poll(client, owner, space_id, question="Second poll?")
    path = f"/v1/spaces/{space_id}/polls"
    first = client.get(path, headers=auth(member), params={"limit": 1})
    assert first.status_code == 200, first.text
    cursor = first.json()["pagination"]["next_cursor"]
    assert cursor is not None
    with app.state.sessions.begin() as database:
        previous = database.get(SpaceMembership, (space_id, member["user"]["id"]))
        previous_admission = previous.admission_id
        previous.status = "removed"
    admit(client, owner, space_id, member)
    with app.state.sessions() as database:
        current = database.get(SpaceMembership, (space_id, member["user"]["id"]))
        assert current.admission_id != previous_admission
    available = create_poll(client, owner, space_id, question="After rejoining?").json()["data"]
    fresh = client.get(path, headers=auth(member), params={"limit": 1})
    assert fresh.status_code == 200, fresh.text
    assert [poll["id"] for poll in fresh.json()["data"]] == [available["id"]]
    stale = client.get(path, headers=auth(member), params={"limit": 1, "cursor": cursor})
    assert stale.status_code == 400, stale.text
    assert stale.json()["error"]["code"] == "CURSOR_INVALID"


def test_poll_hints_reach_current_members_only_and_name_no_content(client, app):
    owner, member, space_id = family(client, app)
    outsider = account(client, app, "outsider@example.test")
    theirs, others = Hints(app, member), Hints(app, outsider)
    poll = create_poll(client, owner, space_id, question="Secret picnic spot?").json()["data"]
    assert vote(client, owner, poll["id"], poll["options"][0]["id"]).status_code == 200
    hints = theirs.since_last()
    assert hints == [{"kind": "poll", "space_id": space_id, "poll_id": poll["id"], "reason": "changed"}] * 2
    assert "picnic" not in repr(hints).lower()
    assert others.since_last() == []


@pytest.mark.parametrize("membership_history", ["newcomer", "rejoined"])
def test_poll_hints_exclude_members_who_cannot_read_the_poll(client, app, membership_history):
    owner, member, space_id = family(client, app)
    restricted = account(client, app, f"{membership_history}@example.test")
    if membership_history == "rejoined":
        admit(client, owner, space_id, restricted)
    poll = create_poll(client, owner, space_id).json()["data"]
    if membership_history == "rejoined":
        removed = leave_or_remove(client, owner, space_id, restricted, "remove")
        assert removed.status_code == 200, removed.text
    admit(client, owner, space_id, restricted)
    assert client.get(f"/v1/polls/{poll['id']}", headers=auth(restricted)).status_code == 404
    allowed_hints, restricted_hints = Hints(app, member), Hints(app, restricted)
    expected = [{"kind": "poll", "space_id": space_id, "poll_id": poll["id"], "reason": "changed"}]
    voted = vote(client, owner, poll["id"], poll["options"][0]["id"])
    assert voted.status_code == 200, voted.text
    assert allowed_hints.since_last() == expected
    assert restricted_hints.since_last() == []
    withdrawn = client.delete(f"/v1/polls/{poll['id']}/vote", headers=auth(owner))
    assert withdrawn.status_code == 200, withdrawn.text
    assert allowed_hints.since_last() == expected
    assert restricted_hints.since_last() == []
    closed = client.post(f"/v1/polls/{poll['id']}/close", headers={**auth(owner), "If-Match": poll["etag"]}, json={})
    assert closed.status_code == 200, closed.text
    assert allowed_hints.since_last() == expected
    assert restricted_hints.since_last() == []
