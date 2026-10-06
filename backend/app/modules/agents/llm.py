"""The Agent's language model (DEC-059): one chat-completions client with tool calling.

The owner's Azure OpenAI deployment decides the next step; the app validates and runs it. The key is only ever sent to
an https Azure OpenAI host. Every call is counted in the owner's token ledger (Q44) and no call may use more than the
per-call limit, so a long conversation is trimmed before it is sent instead of costing more."""

import json
import os
import socket
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import httpx

AZURE_HOSTS = (".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com")
# Q44: the most one call may use; the owner's total is kept by TokenLedger.
CALL_TOKENS = 10_000
LONGEST_OUTPUT = 2_500
SMALLEST_OUTPUT = 600
OPTIONS = {"temperature", "top_p", "seed", "max_tokens", "max_completion_tokens", "reasoning_effort"}
LENGTHS = ("max_tokens", "max_completion_tokens")
TRANSIENT_STATUS = frozenset({408, 409, 425, 429, 500, 502, 503, 504})
RETRY_WAITS = (1.0, 3.0)
LONGEST_RETRY_WAIT = 10.0


class ModelError(Exception):
    """A call that gave no usable step. Transient failures were already retried."""

    def __init__(self, kind, detail=None):
        super().__init__(f"{kind}: {detail}" if detail else kind)
        self.kind = kind
        self.detail = detail


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass(frozen=True)
class ModelTurn:
    content: str | None
    tool_calls: tuple = ()
    finish_reason: str | None = None
    tokens: int | None = None
    seconds: float = 0.0
    model: str | None = None

    def message(self):
        """The assistant message as the transcript keeps it and the next call sends it back."""
        message = {"role": "assistant", "content": self.content or None}
        if self.tool_calls:
            message["tool_calls"] = [
                {"id": call.id, "type": "function", "function": {"name": call.name, "arguments": call.arguments}}
                for call in self.tool_calls
            ]
        elif message["content"] is None:
            message["content"] = ""
        return message


def estimate_tokens(value):
    """A cautious token count for text or JSON: about four Latin characters a token, one token for any other character
    (Telugu and Hindi use far more tokens than English), plus a little for each message."""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    other = sum(1 for character in text if ord(character) > 127)
    return (len(text) - other) // 4 + other + 8


class TokenLedger:
    """The owner's total for all live model use (Q44). Each process appends to its own file in one shared folder; a call
    holds room for the most it may use until its real use is written. Times and token counts only."""

    def __init__(self, folder, limit, call_tokens=CALL_TOKENS):
        if limit < call_tokens:
            raise ValueError(f"The agent's model needs a token limit of at least {call_tokens}.")
        self.folder, self.limit, self.call_tokens = Path(folder), limit, call_tokens
        self.folder.mkdir(parents=True, exist_ok=True)
        self.path = self.folder / f"{socket.gethostname()}-{os.getpid()}-{uuid4().hex[:8]}.jsonl"
        self.lock, self.held = threading.Lock(), 0

    def spent(self):
        total = 0
        for path in self.folder.glob("*.jsonl"):
            for line in filter(str.strip, path.read_text(encoding="utf-8").splitlines()):
                try:
                    total += int(json.loads(line)["tokens"])
                except (ValueError, KeyError, TypeError):
                    # A line another process is still writing, or a damaged one, counts as a whole call.
                    total += self.call_tokens
        return total

    def hold(self):
        with self.lock:
            if self.spent() + self.held + self.call_tokens > self.limit:
                return False
            self.held += self.call_tokens
            return True

    def add(self, tokens):
        with self.lock:
            self.held -= self.call_tokens
            with self.path.open("a", encoding="utf-8") as file:
                file.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "tokens": tokens}) + "\n")


def chat_address(url):
    """A full chat address as given, or the resource or /openai/v1 address Azure shows, completed to the v1 chat path."""
    address = urlsplit(url)
    if address.scheme != "https" or not (address.hostname or "").endswith(AZURE_HOSTS) or address.username or address.password:
        raise ValueError("The agent's model must be an https Azure OpenAI endpoint.")
    if address.path.rstrip("/") in ("", "/openai/v1"):
        return urlunsplit((address.scheme, address.netloc, "/openai/v1/chat/completions", address.query, ""))
    return url


def error_code(response):
    try:
        error = response.json().get("error")
    except (ValueError, AttributeError):
        return None
    code = error.get("code") if isinstance(error, dict) else None
    return str(code)[:40] if code else None


def retry_wait(response, attempt):
    try:
        asked = float(response.headers.get("retry-after", ""))
    except (TypeError, ValueError):
        asked = 0.0
    return min(LONGEST_RETRY_WAIT, max(RETRY_WAITS[attempt], asked))


def parse_turn(payload, seconds, name):
    try:
        choice = payload["choices"][0]
        message = choice["message"]
        finish = choice.get("finish_reason")
        if finish == "content_filter" or message.get("refusal"):
            raise ModelError("declined", "content_filter")
        if finish == "length":
            raise ModelError("length", "completion_limit")
        calls = []
        for item in message.get("tool_calls") or []:
            if item.get("type", "function") != "function":
                continue
            function = item["function"]
            arguments = function.get("arguments") or "{}"
            calls.append(ToolCall(id=str(item["id"])[:64], name=str(function["name"])[:64], arguments=str(arguments)))
        content = message.get("content")
        if content is not None and not isinstance(content, str):
            raise ModelError("unreadable", "content")
    except ModelError:
        raise
    except (KeyError, IndexError, TypeError, AttributeError):
        raise ModelError("unreadable", "shape") from None
    if not calls and not (content or "").strip():
        raise ModelError("length" if finish == "length" else "empty", finish)
    usage = payload.get("usage") if isinstance(payload, dict) else None
    tokens = usage.get("total_tokens") if isinstance(usage, dict) else None
    model = payload.get("model") if isinstance(payload, dict) else None
    return ModelTurn(
        content=content, tool_calls=tuple(calls), finish_reason=finish,
        tokens=tokens if type(tokens) is int and tokens >= 0 else None, seconds=seconds,
        model=str(model)[:64] if model else name,
    )


class ChatModel:
    """The owner's Azure deployment. complete() returns the model's next step: text, tool calls or both."""

    def __init__(self, url, name, key, options=None, timeout=45.0, transport=None, usage=None,
                 call_tokens=CALL_TOKENS, wait=time.sleep):
        if not name or not key:
            raise ValueError("The agent's model needs a deployment name and a key.")
        if not 5 <= timeout <= 120:
            raise ValueError("The agent's model must answer within 5 to 120 seconds.")
        options = {} if options is None else options
        if not isinstance(options, dict):
            raise ValueError("The agent's model settings must be a JSON object.")
        unknown = set(options) - OPTIONS
        if unknown:
            raise ValueError(f"The agent's model does not accept these settings: {', '.join(sorted(unknown))}.")
        for setting in set(LENGTHS) & set(options):
            if type(options[setting]) is not int or options[setting] < 1:
                raise ValueError(f"The agent's model setting {setting} must be a whole number above zero.")
        if not 4_000 <= call_tokens <= 128_000:
            raise ValueError("The agent's per-call token limit must be between 4,000 and 128,000.")
        self.url, self.name, self.key = chat_address(url), name, key
        self.options = dict(options)
        self.limits = httpx.Timeout(connect=5.0, write=5.0, pool=5.0, read=timeout)
        self.transport = transport
        self.usage = usage
        self.call_tokens = call_tokens
        self.wait = wait

    @classmethod
    def from_settings(cls, settings):
        key = settings.agent_model_key.get_secret_value()
        if not (settings.agent_model_url and settings.agent_model_name and key):
            return None
        call_tokens = settings.agent_model_call_tokens
        usage = (TokenLedger(settings.agent_model_usage_dir, settings.agent_model_token_limit, call_tokens)
                 if settings.agent_model_usage_dir else None)
        return cls(settings.agent_model_url, settings.agent_model_name, key, json.loads(settings.agent_model_options or "{}"),
                   settings.agent_model_timeout_seconds, usage=usage, call_tokens=call_tokens)

    def room(self, messages, tools=()):
        """Tokens left for the answer after this prompt, within the per-call limit."""
        return self.call_tokens - estimate_tokens({"messages": messages, "tools": list(tools)})

    def lengths(self, output):
        return {name: min(self.options[name], output) for name in LENGTHS if name in self.options} or {"max_completion_tokens": output}

    def complete(self, messages, tools=(), max_output=LONGEST_OUTPUT):
        room = self.room(messages, tools)
        if room < SMALLEST_OUTPUT:
            raise ModelError("too_large", str(room))
        output = min(max_output, room)
        prompt = self.call_tokens - room
        body = {"reasoning_effort": "low", **{name: value for name, value in self.options.items() if name not in LENGTHS},
                **self.lengths(output), "model": self.name, "messages": messages}
        if tools:
            body["tools"] = list(tools)
            body["tool_choice"] = "auto"
        last = None
        for attempt in range(len(RETRY_WAITS) + 1):
            if self.usage is not None and not self.usage.hold():
                raise ModelError("token_limit")
            used = None
            try:
                outcome = self.send(body)
                if isinstance(outcome, ModelTurn):
                    used = outcome.tokens
                    return outcome
                status, response = outcome
                # A refused request is answered before anything is written, so at most the prompt was used.
                used = prompt if 400 <= status < 500 else None
            except httpx.HTTPError as error:
                status, response = None, None
                last = "timeout" if isinstance(error, httpx.TimeoutException) else "connection"
                used = None
            finally:
                if self.usage is not None:
                    self.usage.add(self.call_tokens if used is None else used)
            if status is not None:
                if status not in TRANSIENT_STATUS:
                    raise ModelError("permanent", f"http_{status}:{error_code(response) or 'error'}")
                last = f"http_{status}"
            if attempt < len(RETRY_WAITS):
                self.wait(retry_wait(response, attempt) if response is not None else RETRY_WAITS[attempt])
        raise ModelError("unavailable", last)

    def send(self, body):
        """One HTTP call: a ModelTurn, or (status, response) for a provider error."""
        started = monotonic()
        with httpx.Client(timeout=self.limits, transport=self.transport, follow_redirects=False) as client:
            response = client.post(self.url, json=body, headers={"api-key": self.key})
        if response.status_code != 200:
            return response.status_code, response
        try:
            payload = response.json()
        except ValueError:
            raise ModelError("unreadable", "json") from None
        return parse_turn(payload, round(monotonic() - started, 3), self.name)
