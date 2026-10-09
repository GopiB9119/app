"""Test helpers for the LLM agent: a scripted stand-in for the model (tests never call a real model) and request helpers."""

import copy
import json
import re
from datetime import date
from uuid import uuid4

from app.modules.agents.llm import CALL_TOKENS, ModelTurn, ToolCall
from tests.test_identity import account, auth
from tests.test_spaces import create_space

# Passed instead of a Space: the request goes to the person's Main Agent (DEC-060).
MAIN_AGENT = None


def say(text):
    return ModelTurn(content=text, tokens=50, seconds=0.01, model="scripted")


def call(tool_name, **arguments):
    return ModelTurn(content=None, tool_calls=(ToolCall(id=f"call_{uuid4().hex[:10]}", name=tool_name, arguments=json.dumps(arguments)),),
                     tokens=60, seconds=0.01, model="scripted")


def last_user(messages):
    return next((message["content"] for message in reversed(messages) if message["role"] == "user"), "")


def rules(messages, tools):
    """A tiny fixed brain for tests that need the agent but don't test its reasoning."""
    tail = messages[-1]
    if tail["role"] == "tool":
        content = json.loads(tail["content"])
        if "rejected" in content:
            return say("Okay, I didn't change anything.")
        if "error" in content:
            return say(f"I couldn't do that: {content['error']}")
        if "answer" in content:
            return call("create_task", title=content["answer"])
        result = content.get("result")
        if isinstance(result, dict) and "done" in result:
            return say(result["done"])
        if isinstance(result, dict) and "tasks" in result:
            lines = [f"{index}. {task['title']}" + (f" (due {date.fromisoformat(task['due_date']):%a %d %b %Y})" if task["due_date"] else "")
                     for index, task in enumerate(result["tasks"], start=1)]
            return say("\n".join(lines) if lines else "No tasks.")
        if isinstance(result, dict) and "memories" in result:
            return say("You asked me to remember: " + "; ".join(item["content"] for item in result["memories"]))
        return say("Done.")
    text = last_user(messages)
    if re.search(r"\bremember\b\??$|what do you remember", text, re.I):
        return call("read_memories")
    if match := re.match(r"(?:please )?remember (?:that )?(.+)", text, re.I):
        return call("save_memory", content=match[1])
    if re.fullmatch(r"add a task(?: tomorrow)?", text, re.I):
        return call("ask_user", question="What should the task be called?")
    if match := re.match(r"add a task (?:to |called )?(.+)", text, re.I):
        return call("create_task", title=match[1])
    if re.search(r"\blist\b.*\btasks?\b|\bwhat tasks\b|\bdue today\b", text, re.I):
        return call("list_tasks")
    if text.lower().startswith("ask me"):
        return call("ask_user", question="What should the task be called?")
    return say("Hi! I can help with tasks, events, reminders and more.")


class ScriptedModel:
    call_tokens = CALL_TOKENS

    def __init__(self, brain=rules):
        self.brain = brain
        self.calls = []

    def complete(self, messages, tools=(), max_output=2500):
        self.calls.append((copy.deepcopy(messages), [tool["function"]["name"] for tool in tools]))
        turn = self.brain(messages, tools)
        if isinstance(turn, Exception):
            raise turn
        return turn


def install(app, brain=rules):
    model = ScriptedModel(brain)
    app.state.agents.model = model
    app.state.agents.background = False
    return model


def script(*turns):
    """A brain answering with these turns in order."""
    queue = list(turns)
    return lambda messages, tools: queue.pop(0)


def ask(client, actor, space_id, message, key=None):
    """A request to a Space's agent, or to the person's Main Agent when space_id is None."""
    body = {"message": message} if space_id is None else {"space_id": space_id, "message": message}
    response = client.post("/v1/agent-runs", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())}, json=body)
    assert response.status_code == 201, response.text
    return response.json()["data"]


def approve(client, actor, run, key=None, etag=None):
    approval = run["approval"]
    return client.post(f"/v1/agent-approvals/{approval['id']}/approve", json={},
                       headers={**auth(actor), "Idempotency-Key": key or str(uuid4()), "If-Match": etag or approval["etag"]})


def reject(client, actor, run):
    return client.post(f"/v1/agent-approvals/{run['approval']['id']}/reject", json={},
                       headers={**auth(actor), "If-Match": run["approval"]["etag"]})


def answer(client, actor, run, text):
    response = client.post(f"/v1/agent-runs/{run['id']}/resume", headers=auth(actor),
                           json={"question_id": run["question"]["id"], "answer": text})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def fields(run):
    return {field["label"]: field["value"] for field in run["approval"]["fields"]}


def rename(client, actor, name):
    profile = client.get("/v1/me", headers=auth(actor))
    changed = client.patch("/v1/me/profile", headers={**auth(actor), "If-Match": profile.headers["etag"]},
                           json={"display_name": name, "timezone": "Asia/Kolkata"})
    assert changed.status_code == 200, changed.text


def solo(client, app):
    person = account(client, app)
    return person, create_space(client, person).json()["data"]["id"]
