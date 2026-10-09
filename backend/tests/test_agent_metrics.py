"""Agent request outcomes on /metrics: counts read from the stored runs when scraped, never their content."""
import re
from datetime import timedelta

from sqlalchemy.exc import OperationalError

from tests.agent_support import approve, ask, reject, solo
from tests.test_identity import auth
from tests.test_space_agent_switch import turn_agent
from tests.test_spaces import create_space

KEY = "synthetic-metrics-key"
LINE = re.compile(r'community_agent_requests\{intent="(\w+)",status="(\w+)",stop_reason="(\w+)"\} (\d+)')


def scrape(client, app):
    app.state.settings.metrics_key = KEY
    response = client.get("/metrics", headers={"Authorization": f"Bearer {KEY}"})
    assert response.status_code == 200, response.text
    return response.text


def outcomes(text):
    return {match.groups()[:3]: int(match[4]) for match in map(LINE.fullmatch, text.splitlines()) if match}


def test_agent_requests_and_model_use_are_counted_without_their_words_people_or_spaces(client, app):
    person, space_id = solo(client, app)
    assert outcomes(scrape(client, app)) == {}
    ask(client, person, space_id, "what can you do")
    done = ask(client, person, space_id, "add a task to water the plants")
    assert approve(client, person, done).json()["data"]["status"] == "completed"
    declined = ask(client, person, space_id, "add a task to paint the fence")
    assert reject(client, person, declined).status_code == 200
    waiting = ask(client, person, space_id, "add a task to wash the car")
    text = scrape(client, app)
    assert outcomes(text) == {
        ("chat", "completed", "none"): 3,
        ("chat", "waiting_for_approval", "none"): 1,
    }
    assert "community_agent_model_calls 6" in text
    assert "community_agent_query_success 1" in text
    for private in ("fence", "plants", "@", person["user"]["id"], space_id, waiting["approval"]["id"]):
        assert private not in text, private


def test_waiting_requests_count_as_the_agent_will_show_them(client, app):
    person, space_id = solo(client, app)
    ask(client, person, space_id, "add a task to wash the car")
    app.state.clock.now += timedelta(minutes=31)
    other = create_space(client, person, "Second family").json()["data"]["id"]
    ask(client, person, other, "add a task to sweep the porch")
    turn_agent(client, person, other, False)
    expected = {("chat", "expired", "expired"): 1, ("chat", "cancelled", "agent_off"): 1}
    assert outcomes(scrape(client, app)) == expected
    for listed in (space_id, other):
        assert client.get(f"/v1/agent-runs?space_id={listed}", headers=auth(person)).status_code == 200
    assert outcomes(scrape(client, app)) == expected


def test_agent_counts_report_a_failed_read_instead_of_zeroes(client, app, monkeypatch):
    def unreachable(*_arguments, **_options):
        raise OperationalError("SELECT 1", {}, OSError("database unreachable"))

    monkeypatch.setattr(app.state.engine, "connect", unreachable)
    text = scrape(client, app)
    assert "community_agent_query_success 0" in text
    assert "community_agent_requests" not in text
