"""The model client (DEC-059): tool calling, retries, refusals and the owner's token limits, against a fake Azure endpoint."""

import json
import multiprocessing
from concurrent.futures import ProcessPoolExecutor

import httpx
import pytest

from app.modules.agents.llm import ChatModel, ModelError, TokenLedger, chat_address

URL = "https://example.openai.azure.com/openai/deployments/small/chat/completions?api-version=2025-01-01"
TOOLS = [{"type": "function", "function": {"name": "list_tasks", "description": "List tasks.", "parameters": {"type": "object"}}}]


def model(handler, **options):
    return ChatModel(URL, "small", "secret", transport=httpx.MockTransport(handler), wait=lambda seconds: None, **options)


def turn(message, finish="stop", usage=None):
    return httpx.Response(200, json={"choices": [{"message": message, "finish_reason": finish}],
                                     "usage": usage or {"total_tokens": 120, "completion_tokens": 20}, "model": "small"})


def test_it_sends_the_tools_and_reads_a_tool_call():
    seen = []

    def handler(request):
        seen.append((request.headers["api-key"], json.loads(request.content)))
        return turn({"content": None, "tool_calls": [{"id": "call_1", "type": "function",
                                                       "function": {"name": "list_tasks", "arguments": "{\"status\":\"open\"}"}}]})

    result = model(handler).complete([{"role": "user", "content": "tasks?"}], TOOLS)
    [(key, body)] = seen
    assert key == "secret" and body["tools"] == TOOLS and body["tool_choice"] == "auto" and body["reasoning_effort"] == "low"
    assert 600 <= body["max_completion_tokens"] <= 2500
    assert [(item.id, item.name, item.arguments) for item in result.tool_calls] == [("call_1", "list_tasks", "{\"status\":\"open\"}")]
    assert result.tokens == 120 and result.message()["tool_calls"][0]["function"]["name"] == "list_tasks"


def test_busy_answers_are_retried_and_permanent_ones_are_not():
    replies = [httpx.Response(429), httpx.Response(503), turn({"content": "Hi"})]
    assert model(lambda request: replies.pop(0)).complete([{"role": "user", "content": "hi"}]).content == "Hi"
    calls = []

    def refused(request):
        calls.append(1)
        return httpx.Response(401, json={"error": {"code": "invalid_key"}})

    with pytest.raises(ModelError) as failure:
        model(refused).complete([{"role": "user", "content": "hi"}])
    assert (failure.value.kind, len(calls)) == ("permanent", 1)
    with pytest.raises(ModelError) as failure:
        model(lambda request: httpx.Response(500)).complete([{"role": "user", "content": "hi"}])
    assert failure.value.kind == "unavailable"


def test_filtered_empty_and_oversized_turns_are_errors():
    with pytest.raises(ModelError, match="declined"):
        model(lambda request: turn({"content": ""}, "content_filter")).complete([{"role": "user", "content": "x"}])
    with pytest.raises(ModelError, match="length"):
        model(lambda request: turn({"content": ""}, "length")).complete([{"role": "user", "content": "x"}])
    with pytest.raises(ModelError, match="too_large"):
        model(lambda request: turn({"content": "x"})).complete([{"role": "user", "content": "word " * 40_000}])


@pytest.mark.parametrize("message", [
    {"content": "An unfinished answer"},
    {"content": None, "tool_calls": [{"id": "truncated", "type": "function", "function": {"name": "save_memory", "arguments": '{"content":"do not execute"}'}}]},
])
def test_truncated_model_answers_and_tools_are_never_accepted(message):
    with pytest.raises(ModelError, match="length"):
        model(lambda request: turn(message, "length")).complete([{"role": "user", "content": "Explain this"}])


@pytest.mark.parametrize("options", [{}, {"max_completion_tokens": 900}])
def test_answer_recovery_respects_the_same_call_and_configured_output_caps(options):
    requests = []

    def endpoint(request):
        requests.append(json.loads(request.content))
        return turn({"content": "A complete concise answer."})

    client = model(endpoint, options=options)
    messages = [{"role": "user", "content": "Explain the known facts. " * 900}]
    client.complete(messages, max_output=4500)
    expected = min(4500, client.room(messages), options.get("max_completion_tokens", 4500))
    assert requests[0]["max_completion_tokens"] == expected
    assert "tools" not in requests[0]


def test_the_owner_token_total_stops_calls(tmp_path):
    ledger = TokenLedger(tmp_path, 25_000)
    client = model(lambda request: turn({"content": "Hi"}, usage={"total_tokens": 9_000, "completion_tokens": 10}), usage=ledger)
    client.complete([{"role": "user", "content": "hi"}])
    client.complete([{"role": "user", "content": "hi"}])
    assert ledger.spent() == 18_000
    with pytest.raises(ModelError, match="token_limit"):
        client.complete([{"role": "user", "content": "hi"}])


def test_the_token_budget_includes_other_clients_in_flight_calls(tmp_path):
    first = TokenLedger(tmp_path, 25_000)
    second = TokenLedger(tmp_path, 25_000)
    assert first.hold()
    assert second.hold()
    assert not first.hold()
    assert not TokenLedger(tmp_path, 25_000).hold()

    first.add(1_000)
    assert first.spent() == second.spent() == 1_000
    assert second.hold()
    assert not first.hold()
    second.add(2_000)
    second.add(3_000)
    assert first.spent() == second.spent() == 6_000


def hold_budget_in_process(folder):
    return TokenLedger(folder, 25_000).hold()


def test_concurrent_processes_cannot_overbook_or_forget_unfinished_calls(tmp_path):
    with ProcessPoolExecutor(max_workers=4, mp_context=multiprocessing.get_context("spawn")) as workers:
        results = list(workers.map(hold_budget_in_process, [str(tmp_path)] * 8))
    assert results.count(True) == 2
    assert results.count(False) == 6
    assert not TokenLedger(tmp_path, 25_000).hold()


def test_existing_usage_logs_still_count_toward_the_token_budget(tmp_path):
    (tmp_path / "previous-process.jsonl").write_text('{"tokens": 18000}\n', encoding="utf-8")
    ledger = TokenLedger(tmp_path, 25_000)
    assert ledger.spent() == 18_000
    assert not ledger.hold()


@pytest.mark.parametrize("tokens", [-1, True, "100", None, 1.5])
def test_invalid_usage_never_releases_a_token_reservation(tmp_path, tokens):
    ledger = TokenLedger(tmp_path, 10_000)
    assert ledger.hold()
    with pytest.raises(ValueError, match="nonnegative"):
        ledger.add(tokens)
    assert ledger.spent() == 0
    assert not TokenLedger(tmp_path, 10_000).hold()


def test_usage_cannot_be_recorded_without_a_token_reservation(tmp_path):
    ledger = TokenLedger(tmp_path, 10_000)
    with pytest.raises(ValueError, match="active token reservation"):
        ledger.add(0)
    assert ledger.spent() == 0
    assert ledger.hold()


def test_failed_usage_persistence_keeps_the_reservation(tmp_path, monkeypatch):
    ledger = TokenLedger(tmp_path, 10_000)
    assert ledger.hold()

    def failed_sync(descriptor):
        raise OSError("Usage storage unavailable")

    monkeypatch.setattr("app.modules.agents.llm.os.fsync", failed_sync)
    with pytest.raises(OSError, match="Usage storage unavailable"):
        ledger.add(1_000)
    assert not TokenLedger(tmp_path, 10_000).hold()


def test_unknown_provider_usage_is_charged_before_retrying(tmp_path):
    ledger = TokenLedger(tmp_path, 25_000)
    calls = []

    def timeout(request):
        calls.append(request)
        raise httpx.ReadTimeout("Provider timed out", request=request)

    with pytest.raises(ModelError, match="token_limit"):
        model(timeout, usage=ledger).complete([{"role": "user", "content": "hi"}])
    assert len(calls) == 2
    assert ledger.spent() == 20_000
    assert not TokenLedger(tmp_path, 25_000).hold()


def test_the_key_only_goes_to_azure_over_https():
    for address in ("http://example.openai.azure.com/", "https://example.com/v1/chat", "https://user:pw@x.openai.azure.com/"):
        with pytest.raises(ValueError):
            chat_address(address)
    assert chat_address("https://x.openai.azure.com/").endswith("/openai/v1/chat/completions")


def test_every_tool_schema_names_its_required_fields():
    # Live 2026-10-05: dropping JSON-schema titles also dropped a field called "title", and Azure refused every call (400).
    from app.modules.agents.toolkit import TOOLS

    for tool in TOOLS.values():
        parameters = tool.schema()["function"]["parameters"]
        assert parameters["type"] == "object", tool.name
        assert set(parameters.get("required", [])) <= set(parameters.get("properties", {})), tool.name
    assert "title" in TOOLS["create_task"].schema()["function"]["parameters"]["properties"]
