from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import func, select, text

from app.modules.events.models import EventPoll, EventPollVote, EventPollVoteCommand
from app.modules.spaces.models import SpaceMembership
from tests.test_event_budgets import gathering
from tests.test_events import create as create_event
from tests.test_events import outbox
from tests.test_identity import account, auth
from tests.test_messaging import admit, expire_while_waiting
from tests.test_spaces import create_space


def create_poll(client, person, event_id, key=None, **changes):
    return client.post(f"/v1/events/{event_id}/polls", headers={**auth(person), "Idempotency-Key": key or str(uuid4())},
                       json={"question": "Where shall we meet?", "options": ["Cafe", "Park"], **changes})


def read_poll(client, person, event_id, poll_id):
    response = client.get(f"/v1/events/{event_id}/polls/{poll_id}", headers=auth(person))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def vote_poll(client, person, event_id, poll, option_id, key=None, etag=None):
    return client.put(f"/v1/events/{event_id}/polls/{poll['id']}/vote", json={"option_id": option_id},
                      headers={**auth(person), "If-Match": etag or poll["vote_etag"], "Idempotency-Key": key or str(uuid4())})


def test_event_poll_is_visible_only_through_its_event_and_does_not_list_ballots(client, app):
    owner, organizer, member, _space_id, event = gathering(client, app)
    response = create_poll(client, organizer, event["id"])
    assert response.status_code == 201, response.text
    poll = response.json()["data"]
    mine = read_poll(client, member, event["id"], poll["id"])
    assert mine["event_id"] == event["id"] and mine["total_votes"] == 0
    assert mine["can_vote"] is True and mine["can_close"] is False and mine["etag"] is None
    assert read_poll(client, owner, event["id"], poll["id"])["can_close"] is True
    voted = vote_poll(client, member, event["id"], mine, mine["options"][0]["id"])
    assert voted.status_code == 200, voted.text
    assert voted.json()["data"]["total_votes"] == 1
    other_view = read_poll(client, organizer, event["id"], poll["id"])
    assert other_view["my_option_id"] is None
    assert all(set(option) == {"id", "text", "votes"} for option in other_view["options"])
    assert member["user"]["id"] not in str(other_view)


def test_event_poll_old_vote_retry_returns_current_choice_without_reapplying(client, app):
    _owner, organizer, member, _space_id, event = gathering(client, app)
    created = create_poll(client, organizer, event["id"])
    assert created.status_code == 201, created.text
    poll = read_poll(client, member, event["id"], created.json()["data"]["id"])
    first_option, second_option = [option["id"] for option in poll["options"]]
    key = str(uuid4())
    first = vote_poll(client, member, event["id"], poll, first_option, key=key)
    assert first.status_code == 200, first.text
    latest = vote_poll(client, member, event["id"], first.json()["data"], second_option)
    assert latest.status_code == 200, latest.text
    again = vote_poll(client, member, event["id"], poll, first_option, key=key)
    assert again.status_code == 200 and again.json()["data"] == latest.json()["data"]
    assert again.json()["data"]["my_option_id"] == second_option
    stale = vote_poll(client, member, event["id"], poll, first_option)
    assert stale.status_code == 412


def test_event_poll_creation_and_close_require_current_event_management(client, app):
    owner, organizer, member, _space_id, event = gathering(client, app)
    assert create_poll(client, member, event["id"]).status_code == 403
    created = create_poll(client, organizer, event["id"])
    assert created.status_code == 201, created.text
    poll = created.json()["data"]
    path = f"/v1/events/{event['id']}/polls/{poll['id']}/close"
    assert client.post(path, headers={**auth(member), "If-Match": poll["etag"]}, json={}).status_code == 403
    assert client.post(path, headers=auth(owner), json={}).status_code == 428
    closed = client.post(path, headers={**auth(owner), "If-Match": poll["etag"]}, json={})
    assert closed.status_code == 200 and closed.json()["data"]["status"] == "closed"
    current = read_poll(client, member, event["id"], poll["id"])
    assert vote_poll(client, member, event["id"], current, poll["options"][0]["id"]).status_code == 409


def test_event_poll_vote_withdrawal_and_old_replays_keep_latest_state(client, app):
    _owner, organizer, member, _space_id, event = gathering(client, app)
    poll = create_poll(client, organizer, event["id"]).json()["data"]
    reviewed = read_poll(client, member, event["id"], poll["id"])
    selected = vote_poll(client, member, event["id"], reviewed, poll["options"][0]["id"]).json()["data"]
    key = str(uuid4())
    cleared = vote_poll(client, member, event["id"], selected, None, key=key)
    assert cleared.status_code == 200, cleared.text
    assert (cleared.json()["data"]["my_option_id"], cleared.json()["data"]["total_votes"]) == (None, 0)
    current = vote_poll(client, member, event["id"], cleared.json()["data"], poll["options"][1]["id"]).json()["data"]
    replay = vote_poll(client, member, event["id"], selected, None, key=key)
    assert replay.status_code == 200 and replay.json()["data"] == current
    conflict = vote_poll(client, member, event["id"], selected, poll["options"][0]["id"], key=key)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert outbox(app, "event.poll.voted") == 3
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(EventPollVote)) == 1
        assert database.scalar(select(func.count()).select_from(EventPollVoteCommand)) == 3


def test_event_poll_choice_preconditions_and_other_poll_option_are_enforced(client, app):
    _owner, organizer, member, _space_id, event = gathering(client, app)
    poll = create_poll(client, organizer, event["id"]).json()["data"]
    another = create_poll(client, organizer, event["id"], question="Which day?").json()["data"]
    reviewed = read_poll(client, member, event["id"], poll["id"])
    path = f"/v1/events/{event['id']}/polls/{poll['id']}/vote"
    choice = {"option_id": poll["options"][0]["id"]}
    assert client.put(path, headers={**auth(member), "Idempotency-Key": str(uuid4())}, json=choice).status_code == 428
    assert client.put(path, headers={**auth(member), "If-Match": reviewed["vote_etag"]}, json=choice).status_code == 422
    assert client.put(path, headers={"Idempotency-Key": str(uuid4()), "If-Match": reviewed["vote_etag"]}, json=choice).status_code == 401
    denied = vote_poll(client, member, event["id"], reviewed, another["options"][0]["id"])
    assert denied.status_code == 422 and denied.json()["error"]["code"] == "POLL_OPTION_UNKNOWN"
    assert vote_poll(client, member, event["id"], reviewed, choice["option_id"], etag=poll["vote_etag"]).status_code == 412
    assert read_poll(client, member, event["id"], poll["id"]) == reviewed


def test_event_poll_event_space_and_admission_boundaries_apply_before_receipts(client, app):
    owner, organizer, member, space_id, event = gathering(client, app)
    poll = create_poll(client, organizer, event["id"]).json()["data"]
    reviewed = read_poll(client, member, event["id"], poll["id"])
    key = str(uuid4())
    assert vote_poll(client, member, event["id"], reviewed, poll["options"][0]["id"], key=key).status_code == 200
    other_space = create_space(client, owner).json()["data"]["id"]
    other_event = create_event(client, owner, other_space).json()["data"]
    assert client.get(f"/v1/events/{other_event['id']}/polls/{poll['id']}", headers=auth(owner)).status_code == 404
    assert vote_poll(client, owner, other_event["id"], poll, poll["options"][0]["id"]).status_code == 404
    newcomer = account(client, app, "poll-new-member@example.test")
    admit(client, owner, space_id, newcomer)
    assert client.get(f"/v1/events/{event['id']}/polls", headers=auth(newcomer)).status_code == 404
    with app.state.sessions.begin() as database:
        database.get(SpaceMembership, (space_id, member["user"]["id"])).status = "removed"
    assert read_poll(client, organizer, event["id"], poll["id"])["total_votes"] == 0
    assert vote_poll(client, member, event["id"], reviewed, poll["options"][0]["id"], key=key).status_code == 404
    admit(client, owner, space_id, member)
    assert client.get(f"/v1/events/{event['id']}/polls/{poll['id']}", headers=auth(member)).status_code == 404
    assert vote_poll(client, member, event["id"], reviewed, poll["options"][0]["id"], key=key).status_code == 404


@pytest.mark.parametrize("ended", [False, True])
def test_event_poll_cancelled_or_ended_event_is_read_only(client, app, ended):
    _owner, organizer, member, _space_id, event = gathering(
        client, app, local_start="2026-09-19T15:40", local_end="2026-09-19T15:50",
    )
    poll = create_poll(client, organizer, event["id"]).json()["data"]
    if ended:
        app.state.clock.now = datetime.fromisoformat(event["ends_at"]) + timedelta(seconds=1)
    else:
        cancelled = client.post(f"/v1/events/{event['id']}/cancel", headers={**auth(organizer), "If-Match": event["etag"]}, json={})
        assert cancelled.status_code == 200, cancelled.text
    current = read_poll(client, member, event["id"], poll["id"])
    assert current["status"] == "closed" and current["closed_at"] is not None
    assert current["can_vote"] is current["can_close"] is False
    assert vote_poll(client, member, event["id"], current, poll["options"][0]["id"]).status_code == 409
    assert create_poll(client, organizer, event["id"], question="Too late?").status_code == 409


@pytest.mark.parametrize("same_request", [True, False])
def test_event_poll_racing_votes_keep_one_choice_and_one_effect(client, app, same_request):
    _owner, organizer, member, _space_id, event = gathering(client, app)
    poll = create_poll(client, organizer, event["id"]).json()["data"]
    reviewed = read_poll(client, member, event["id"], poll["id"])
    key = str(uuid4())
    commands = [(poll["options"][0]["id"], key),
                (poll["options"][0 if same_request else 1]["id"], key if same_request else str(uuid4()))]
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda item: vote_poll(client, member, event["id"], reviewed, item[0], key=item[1]), commands))
    assert sorted(result.status_code for result in results) == ([200, 200] if same_request else [200, 412])
    assert read_poll(client, member, event["id"], poll["id"])["total_votes"] == 1
    assert outbox(app, "event.poll.voted") == 1
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(EventPollVoteCommand)) == 1


@pytest.mark.parametrize("operation", ["create", "vote", "close"])
def test_event_poll_expired_session_while_waiting_cannot_write(client, app, operation):
    _owner, organizer, _member, _space_id, event = gathering(client, app)
    poll = create_poll(client, organizer, event["id"]).json()["data"]

    def act():
        if operation == "create":
            return create_poll(client, organizer, event["id"], question="Another poll?")
        if operation == "vote":
            return vote_poll(client, organizer, event["id"], poll, poll["options"][0]["id"])
        return client.post(f"/v1/events/{event['id']}/polls/{poll['id']}/close",
                           headers={**auth(organizer), "If-Match": poll["etag"]}, json={})

    refused = expire_while_waiting(app, "space_events", event["id"], act)
    assert refused.status_code == 401, refused.text
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(EventPoll)) == 1
        assert database.get(EventPoll, poll["id"]).status == "open"
        assert database.scalar(select(func.count()).select_from(EventPollVoteCommand)) == 0


def test_event_poll_migration_refuses_to_discard_existing_polls(client, app):
    _owner, organizer, _member, _space_id, event = gathering(client, app)
    poll = create_poll(client, organizer, event["id"]).json()["data"]
    with app.state.engine.connect() as connection:
        previous_revision = connection.scalar(text("SELECT version_num FROM alembic_version"))
    with pytest.raises(RuntimeError, match="lose event polls"):
        command.downgrade(Config("alembic.ini"), "0060")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == previous_revision
    assert read_poll(client, organizer, event["id"], poll["id"]) == poll


def test_poll_contract_normalizes_text_and_accepts_a_vote_or_withdrawal():
    from app.modules.events.schemas import CreatePoll, VotePoll

    poll = CreatePoll(question="  Where shall we meet?  ", options=["  Cafe  ", "Park"])
    assert poll.question == "Where shall we meet?"
    assert poll.options == ["Cafe", "Park"]
    option_id = uuid4()
    assert VotePoll(option_id=str(option_id)).option_id == option_id
    assert VotePoll(option_id=None).option_id is None


@pytest.mark.parametrize("changes", [
    {"question": " "}, {"question": "x" * 121}, {"question": "hidden\u0000text"},
    {"options": []}, {"options": ["Only one"]}, {"options": [str(index) for index in range(9)]},
    {"options": ["Cafe", " cafe "]}, {"options": ["Cafe", " "]},
    {"options": ["Cafe", "x" * 81]}, {"options": ["Cafe", "hidden\u202etext"]},
    {"options": ["Cafe", 1]}, {"account_id": str(uuid4())}, {"anonymous": True},
])
def test_poll_contract_rejects_invalid_or_authority_bearing_input(changes):
    from app.modules.events.schemas import CreatePoll

    with pytest.raises(ValidationError):
        CreatePoll.model_validate({"question": "Where shall we meet?", "options": ["Cafe", "Park"], **changes})


@pytest.mark.parametrize("body", [
    {}, {"option_id": "invalid"}, {"option_id": None, "account_id": str(uuid4())},
    {"option_id": str(uuid4()), "votes": 2},
])
def test_poll_vote_contract_rejects_missing_choice_or_forged_authority(body):
    from app.modules.events.schemas import VotePoll

    with pytest.raises(ValidationError):
        VotePoll.model_validate(body)