"""The model client (DEC-059): tool calling, retries, refusals and the owner's token limits, against a fake Azure endpoint."""

import json

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
