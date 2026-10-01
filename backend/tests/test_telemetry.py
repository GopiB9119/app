import json
import re
from uuid import uuid4

from fastapi.testclient import TestClient

from tests.test_identity import PASSWORD, account, auth
from tests.test_messaging import family, open_chat

FIELDS = {"time", "event", "request_id", "trace_id", "span_id", "parent_span_id", "method", "route", "status", "duration_ms", "error_code", "failure"}


def request_lines(output):
    lines = [json.loads(line) for line in output.splitlines() if line.startswith("{")]
    return [line for line in lines if line["event"] == "http_request"]


def test_request_logs_correlate_each_request_without_private_data(client, app, capsys):
    owner, member, space_id = family(client, app)
    chat = open_chat(client, owner, space_id).json()["data"]
    capsys.readouterr()
    parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    sent = client.post(
        f"/v1/conversations/{chat['id']}/messages",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "traceparent": parent}, json={"body": "Sentinel private words 7731"},
    )
    assert sent.status_code == 201, sent.text
    listed = client.get(f"/v1/conversations?space_id={space_id}", headers={**auth(member), "traceparent": f"00-{'0' * 32}-00f067aa0ba902b7-01"})
    assert listed.status_code == 200
    assert client.get(f"/v1/conversations/{uuid4()}", headers={**auth(owner), "traceparent": "not-a-trace"}).status_code == 404
    assert client.get(f"/v1/unknown/{owner['user']['id']}?email={owner['user']['email']}").status_code == 404
    output = capsys.readouterr().out
    lines = request_lines(output)

    assert [(line["method"], line["route"], line["status"]) for line in lines] == [
        ("POST", "/v1/conversations/{conversation_id}/messages", 201),
        ("GET", "/v1/conversations", 200),
        ("GET", "/v1/conversations/{conversation_id}", 404),
        ("GET", "unmatched", 404),
    ]
    assert all(set(line) <= FIELDS and re.fullmatch(r"[0-9a-f]{16}", line["span_id"]) for line in lines)
    continued = lines[0]
    assert continued["request_id"] == sent.headers["X-Request-ID"] == sent.json()["request_id"]
    assert (continued["trace_id"], continued["parent_span_id"]) == ("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7")
    for fresh in lines[1:]:
        assert re.fullmatch(r"[0-9a-f]{32}", fresh["trace_id"]) and fresh["trace_id"].strip("0") and "parent_span_id" not in fresh
    assert len({line["trace_id"] for line in lines}) == 4
    assert [line.get("error_code") for line in lines] == [None, None, "NOT_FOUND", "NOT_FOUND"]
    for private in (
        "Sentinel private words", chat["id"], space_id, owner["user"]["id"], member["user"]["id"], owner["user"]["email"],
        "Alex Morgan", owner["session_token"], member["session_token"], PASSWORD, "Bearer", "space_id=",
    ):
        assert private not in output, private


def test_metrics_need_the_configured_key_and_count_by_route_template(client, app):
    owner = account(client, app)
    assert client.get("/metrics").status_code == 404
    app.state.settings.metrics_key = "synthetic-metrics-key"
    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers={"Authorization": "Bearer wrong-key"}).status_code == 401
    for headers in (auth(owner), auth(owner), {}):
        client.get("/v1/me", headers=headers)
    client.get(f"/v1/unknown/{owner['user']['id']}")
    scraped = client.get("/metrics", headers={"Authorization": "Bearer synthetic-metrics-key"})
    assert scraped.status_code == 200
    assert scraped.headers["content-type"].startswith("text/plain; version=0.0.4")
    text = scraped.text
    for expected in (
        'community_http_requests_total{method="GET",route="/v1/me",status="200"} 2',
        'community_http_requests_total{method="GET",route="/v1/me",status="401"} 1',
        'community_http_requests_total{method="GET",route="unmatched",status="404"} 1',
        'community_http_requests_total{method="GET",route="/metrics",status="401"} 2',
        'community_http_request_duration_seconds_bucket{method="GET",route="/v1/me",le="+Inf"} 3',
        'community_http_request_duration_seconds_count{method="GET",route="/v1/me"} 3',
    ):
        assert expected in text, expected
    assert "# TYPE community_http_request_duration_seconds histogram" in text
    assert owner["user"]["id"] not in text and "@" not in text


def test_an_unexpected_failure_logs_its_type_but_not_its_message(app, capsys, monkeypatch):
    def broken(_token):
        raise RuntimeError("Sentinel private detail 4410")

    monkeypatch.setattr(app.state.identity, "me", broken)
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/v1/me", headers={"Authorization": "Bearer synthetic-token"}).status_code == 500
    [line] = request_lines(capsys.readouterr().out)
    assert (line["route"], line["status"], line["failure"]) == ("/v1/me", 500, "RuntimeError")
    assert "Sentinel private detail" not in json.dumps(line)
