"""The LLM agent (DEC-059): requests, approvals, answers, memories and the views web and Android read.

A request becomes a run that works in the background (AgentRuntime): the model reads, plans, asks and proposes, and every
change waits for the person's exact approval here. The run carries the person's own session only in memory while it
works, so every tool acts with exactly their current permissions; a run is never continued with stored credentials."""

import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, case, func, or_, select

from app.errors import DomainError
from app.modules.agents.models import (
    AgentApproval,
    AgentMemory,
    AgentMemoryCommand,
    AgentRun,
    AgentRunEvent,
    AgentToolCall,
)
from app.modules.agents.prompts import PROMPT_VERSION
from app.modules.agents.registry import MAIN_ROUTE, route, route_for
from app.modules.agents.runtime import ACTIVE, TERMINAL, AgentRuntime, scopes, tool_message
from app.modules.agents.schemas import (
    AgentApprovalField,
    AgentApprovalView,
    AgentEventView,
    AgentEvidence,
    AgentHandoffView,
    AgentMemoryView,
    AgentPlanStep,
    AgentQuestionView,
    AgentRunCursor,
    AgentRunView,
    AgentRunWebTextView,
    AgentTodoView,
    AgentToolCallView,
    AgentToolView,
    AgentWebSource,
    DeletedMemory,
)
from app.modules.agents.toolkit import HHMM, SENSITIVE, TOOLS, ToolContext, ToolProblem
from app.modules.agents.web import stored_sources, stored_web_text
from app.modules.realtime.hub import signal
from app.modules.spaces.models import Space, SpaceMembership
from app.modules.spaces.schemas import Pagination
from app.telemetry import emit

LIFETIME = timedelta(minutes=15)
STALE_QUEUE = timedelta(minutes=10)
LEASE_GRACE = timedelta(minutes=1)
DAILY_RUNS = 100
ACTIVE_RUNS = 3
WORKERS = 4
PERSON_LOCK = 20261001
WAITING = ("waiting_for_approval", "waiting_for_user")
WORKING = ("queued", "running")
RUN_FILTERS = {
    "working": ("queued", "running", "verifying"),
    "waiting_for_approval": ("waiting_for_approval",), "waiting_for_user": ("waiting_for_user",),
    "completed": ("completed",), "failed": ("failed", "timed_out", "expired"), "cancelled": ("cancelled",),
    # Home's "needs you" list: every request waiting on the person.
    "needs_you": WAITING,
}
SHOWN_CALLS = 40
SHOWN_EVENTS = 40
SHOWN_EVIDENCE = 60
FINISHED = {"completed": "Finished.", "failed": "Could not finish.", "cancelled": "Stopped.", "expired": "Expired before you answered.",
            "timed_out": "Took too long and stopped."}


class AgentService:
    """LLM agent (DEC-059): it reads what the person can see and changes nothing without their exact approval."""

    OFF_ANSWER = "The owner turned the agent off in this Space. Nothing was changed."

    def __init__(self, tasks, reminders, model=None, events=None, *, documents=None, search=None, community=None, web=None,
                 messages=None):
        self.tasks = tasks
        self.reminders = reminders
        self.model = model
        self.events = events
        self.spaces = tasks.spaces
        self.documents = documents
        self.search = search
        self.community = community
        self.messages = messages
        self.web = web
        self.identity = tasks.identity
        self.sessions = tasks.sessions
        self.security = tasks.security
        self.clock = tasks.clock
        self.runtime = AgentRuntime(self)
        # Runs work in background threads; tests and scripts may run them in the calling thread instead.
        self.background = True
        self.pool = None
        self.pool_lock = threading.Lock()
        self.listeners = {}

    def close(self):
        if self.pool is not None:
            self.pool.shutdown(wait=False, cancel_futures=True)

    # Shared records

    def context(self, database, token, space_id):
        user, session = self.identity.authenticate(database, token)
        _user, member = self.tasks.context(database, token, space_id)
        return user, session, member

    def requester(self, database, token, space_id):
        """The signed-in person, and their admission when they ask a Space's agent; the Main Agent needs no Space."""
        if space_id is None:
            user, session = self.identity.authenticate(database, token)
            return user, session, None
        return self.context(database, token, space_id)

    def hold(self, database, account_id):
        # One person's agent decisions run one at a time; taken before any agent row lock. The account row itself is not
        # locked: approving calls the task and reminder services, which lock it in their own transactions.
        database.execute(select(func.pg_advisory_xact_lock(PERSON_LOCK, func.hashtext(account_id))))

    def local_now(self, run):
        return self.clock().astimezone(ZoneInfo(run.timezone))

    def touch(self, run):
        run.updated_at = self.clock()
        run.version += 1

    def remember(self, run, **values):
        run.state = {**(run.state or {}), **values}

    def append(self, run, message):
        self.remember(run, messages=[*(run.state or {}).get("messages", []), message])

    def add_evidence(self, run, item):
        known = (run.state or {}).get("evidence", [])
        if any(entry["kind"] == item["kind"] and entry["ref"] == item["ref"] for entry in known):
            return
        self.remember(run, evidence=[*known, item])

    def event(self, database, run, event_type, summary):
        run.event_sequence += 1
        database.add(AgentRunEvent(
            id=str(uuid4()), run_id=run.id, sequence=run.event_sequence, event_type=event_type,
            summary=summary[:300], created_at=self.clock(),
        ))
        # Only the requester hears it, and a Main Agent hint names no Space; clients then read the run through the API.
        signal(database, "agent", [run.account_id], space_id=run.space_id, run_id=run.id, reason="changed")

    def record_call(self, database, run, registry, effect, status, summary, arguments, result_ref=None, error_code=None,
                    approval_id=None):
        reserved = (run.state or {}).get("web_reserved", 0)
        if registry in ("web.search", "web.read") and reserved:
            self.remember(run, web_reserved=max(0, reserved - 1))
        run.tool_calls_used += 1
        database.add(AgentToolCall(
            id=str(uuid4()), run_id=run.id, sequence=run.tool_calls_used, tool_name=registry[:64], tool_version="1",
            effect=effect, risk="medium" if effect == "write" else "low", status=status,
            input_digest=self.security.digest("agent.tool", registry, arguments if isinstance(arguments, str) else json.dumps(arguments, sort_keys=True, default=str)),
            summary=summary[:300], result_ref=result_ref, error_code=error_code, approval_id=approval_id, created_at=self.clock(),
        ))

    def finish(self, database, run, status, answer, outcome=None, stop_reason=None):
        now = self.clock()
        run.status, run.answer, run.outcome, run.stop_reason = status, answer, outcome, stop_reason
        run.question_id = run.question = run.question_expires_at = None
        run.lease_owner = run.lease_expires_at = None
        run.finished_at = now if status in TERMINAL else None
        self.remember(run, pending=None)
        self.touch(run)
        self.event(database, run, f"run.{status}", FINISHED.get(status, status))

    @staticmethod
    def agent_off(database, space_id):
        return database.scalar(select(Space.agent_enabled).where(Space.id == space_id)) is False

    def close_approvals(self, database, run, status, reason):
        for approval in database.scalars(select(AgentApproval).where(
            AgentApproval.run_id == run.id, AgentApproval.status == "pending",
        ).with_for_update()).all():
            approval.status, approval.reason, approval.decided_at = status, reason, self.clock()
            approval.version += 1

    def refresh(self, database, run):
        """A run as it is now: expired while waiting, stopped by the agent switch, or interrupted while working."""
        now = self.clock()
        if run.status in WAITING and run.deadline_at <= now:
            self.close_approvals(database, run, "expired", "expired")
            self.finish(database, run, "expired", "This request expired before you answered. Ask me again.", stop_reason="expired")
        elif run.status in WAITING + WORKING and run.space_id is not None and self.agent_off(database, run.space_id):
            self.close_approvals(database, run, "cancelled", "agent_off")
            self.finish(database, run, "cancelled", self.OFF_ANSWER, stop_reason="agent_off")
        elif (run.status == "running" and run.lease_expires_at is not None and run.lease_expires_at + LEASE_GRACE <= now) or (
                run.status == "queued" and run.updated_at + STALE_QUEUE <= now):
            self.finish(database, run, "failed", "I was interrupted before finishing, so I stopped. Nothing else was changed. "
                        "Ask me again.", stop_reason="interrupted")

    def owned_run(self, database, token, run_id, lock=False):
        user, _session = self.identity.authenticate(database, token)
        statement = select(AgentRun).where(AgentRun.id == run_id, AgentRun.account_id == user.id)
        if lock:
            self.hold(database, user.id)
            statement = statement.with_for_update()
        run = database.scalar(statement.execution_options(populate_existing=True))
        if run is None:
            raise DomainError(404, "NOT_FOUND", "Request not found.")
        if run.space_id is not None:
            _user, member = self.tasks.context(database, token, run.space_id)
            if member.admission_id != run.admission_id:
                raise DomainError(404, "NOT_FOUND", "Request not found.")
        return user, run

    def check_context(self, database, token, run):
        if run.space_id is None:
            user, _session = self.identity.authenticate(database, token)
            if user.id != run.account_id:
                raise DomainError(404, "NOT_FOUND", "Request not found.")
            return user, None
        user, _session, member = self.context(database, token, run.space_id)
        if user.id != run.account_id or member.admission_id != run.admission_id:
            raise DomainError(404, "NOT_FOUND", "Request not found.")
        if self.agent_off(database, run.space_id):
            raise DomainError(409, "AGENT_OFF", "The owner turned the agent off in this Space.")
        return user, member

    def tool_context(self, run, token, database=None):
        return ToolContext(agent=self, token=token, run_id=run.id, account_id=run.account_id, admission_id=run.admission_id,
                           space_id=run.space_id, timezone=run.timezone, now=self.clock(), database=database)

    # Running

    def submit(self, run_id, token):
        if not self.background:
            return self.work(run_id, token)
        with self.pool_lock:
            if self.pool is None:
                self.pool = ThreadPoolExecutor(max_workers=WORKERS, thread_name_prefix="agent")
        self.pool.submit(self.work, run_id, token)

    def work(self, run_id, token):
        try:
            self.runtime.advance(run_id, token)
        finally:
            self.notify(run_id)

    def web_usage(self, database, account_id):
        since = self.clock() - timedelta(days=1)
        calls = select(func.count()).select_from(AgentToolCall).join(AgentRun, AgentRun.id == AgentToolCall.run_id).where(
            AgentRun.account_id == account_id, AgentToolCall.tool_name.in_(("web.search", "web.read")), AgentToolCall.created_at > since,
        ).scalar_subquery()
        reserved = select(func.coalesce(func.sum(AgentRun.state["web_reserved"].as_integer()), 0)).where(
            AgentRun.account_id == account_id, AgentRun.created_at > since,
        ).scalar_subquery()
        return database.scalar(select(calls + reserved))

    def reserve_web(self, ctx):
        with self.sessions.begin() as database:
            self.hold(database, ctx.account_id)
            run = self.runtime.locked(database, ctx.run_id)
            if run is None or run.status != "running":
                raise ToolProblem("run_stopped", "The request is no longer running.")
            self.check_context(database, ctx.token, run)
            if self.web_usage(database, ctx.account_id) >= self.web.daily_limit:
                raise ToolProblem("web_limit", f"Today's limit of {self.web.daily_limit} web lookups is used up.")
            self.remember(run, web_reserved=(run.state or {}).get("web_reserved", 0) + 1)

    def notify(self, run_id):
        """Tells whoever waits on a run (the chat reply of an @agent message) once it stops working."""
        callback = self.listeners.pop(run_id, None)
        if callback is None:
            return
        with self.sessions() as database:
            run = database.get(AgentRun, run_id)
            view = self.view(database, run) if run is not None else None
        if view is None or view.status in WORKING:
            if view is not None:
                self.listeners[run_id] = callback
            return
        try:
            callback(view)
        except Exception as error:  # noqa: BLE001 - a failed listener must not hide the run's own result
            emit("agent_listener_failed", failure=type(error).__name__)

    # Requests

    def create_run(self, token, body, key, origin="screen", on_settled=None):
        # No Space asks the person's Main Agent (DEC-060); a chat mention always names its Space.
        space_id = None if body.space_id is None else str(body.space_id)
        # Only a request from the Agent screen may run its changes without asking (a chat mention never does).
        automatic = bool(getattr(body, "auto_approve", False)) and origin == "screen"
        digest = self.security.digest("agent.run", space_id or "main", body.message, *(["auto_approve"] if automatic else []))
        with self.sessions.begin() as database:
            user, session, member = self.requester(database, token, space_id)
            self.hold(database, user.id)
            # Waiting for the person's lock can outlast their session or their membership, so both are checked again.
            user, session, member = self.requester(database, token, space_id)
            admission_id = member.admission_id if member else None
            existing = database.scalar(select(AgentRun).where(
                AgentRun.account_id == user.id, AgentRun.request_key == key,
            ).with_for_update())
            if existing:
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed request.")
                if existing.admission_id != admission_id:
                    raise DomainError(404, "NOT_FOUND", "Request not found.")
                self.refresh(database, existing)
                return self.view(database, existing)
            if space_id is not None and self.agent_off(database, space_id):
                raise DomainError(409, "AGENT_OFF", "The owner turned the agent off in this Space.")
            if self.model is None:
                raise DomainError(503, "AGENT_MODEL_UNAVAILABLE", "The Agent's AI model is not set up yet.")
            now = self.clock()
            recent = database.scalar(select(func.count()).select_from(AgentRun).where(
                AgentRun.account_id == user.id, AgentRun.created_at > now - timedelta(hours=24),
            ))
            if recent >= DAILY_RUNS:
                raise DomainError(429, "RATE_LIMITED", "Too many requests today. Try again later.")
            working = database.scalar(select(func.count()).select_from(AgentRun).where(
                AgentRun.account_id == user.id, AgentRun.status.in_(WORKING),
                AgentRun.updated_at > now - STALE_QUEUE,
            ))
            if working >= ACTIVE_RUNS:
                raise DomainError(429, "AGENT_BUSY", "Wait for your current requests to finish first.")
            agent = MAIN_ROUTE if space_id is None else route(database, space_id)
            run = AgentRun(
                id=str(uuid4()), agent_kind="main" if space_id is None else "space", space_id=space_id,
                agent_instance_id=agent.instance_id, account_id=user.id,
                admission_id=admission_id, session_id=session.id, request_key=key, request_digest=digest,
                message=body.message, timezone=user.timezone, status="queued", intent="chat", plan=[],
                state={"origin": origin, "agent": agent.record(), "prompt_version": PROMPT_VERSION, "auto_approve": automatic,
                       "messages": [{"role": "user", "content": body.message}], "todos": [], "evidence": [], "pending": None},
                attempts=0, available_at=now, steps_used=0, tool_calls_used=0, event_sequence=0, version=1,
                created_at=now, updated_at=now, deadline_at=now + ACTIVE,
            )
            database.add(run)
            database.flush()
            self.event(database, run, "run.created", "Request received.")
            run_id = run.id
        if on_settled is not None:
            self.listeners[run_id] = on_settled
        self.submit(run_id, token)
        with self.sessions() as database:
            return self.view(database, database.get(AgentRun, run_id))

    def owned_approval(self, database, token, approval_id):
        user, _session = self.identity.authenticate(database, token)
        self.hold(database, user.id)
        run_id = database.scalar(select(AgentApproval.run_id).where(
            AgentApproval.id == approval_id, AgentApproval.account_id == user.id,
        ))
        if run_id is None:
            raise DomainError(404, "NOT_FOUND", "Approval not found.")
        # The run is always locked before its approval, as in cancel and expiry, so they cannot deadlock.
        _user, run = self.owned_run(database, token, run_id, lock=True)
        approval = database.scalar(
            select(AgentApproval).where(AgentApproval.id == approval_id).with_for_update().execution_options(populate_existing=True)
        )
        if approval.admission_id != run.admission_id:
            raise DomainError(404, "NOT_FOUND", "Approval not found.")
        return user, run, approval

    def check_version(self, approval, expected):
        if expected is None:
            raise DomainError(428, "PRECONDITION_REQUIRED", "Review the action before deciding.")
        if expected != self.approval_etag(approval):
            raise DomainError(412, "PRECONDITION_FAILED", "This action changed. Review it again.")

    def waiting_on(self, run, approval):
        pending = (run.state or {}).get("pending") or {}
        tool = TOOLS.get((approval.payload or {}).get("tool"))
        current = run.status == "waiting_for_approval" and pending.get("approval_id") == approval.id
        return tool if current and tool is not None and tool.effect == "write" else None

    def outdated(self, database, run, approval):
        approval.status, approval.reason, approval.decided_at = "cancelled", "outdated", self.clock()
        approval.version += 1
        if run.status not in TERMINAL:
            self.finish(database, run, "expired", "This request came from an earlier version of the Agent. Ask me again.",
                        stop_reason="outdated")

    def approve(self, token, approval_id, key, expected):
        with self.sessions.begin() as database:
            _user, run, approval = self.owned_approval(database, token, str(approval_id))
            if approval.status != "pending":
                if approval.decision_key == key:
                    return self.view(database, run)
                raise DomainError(409, "APPROVAL_DECIDED", "This action was already decided.")
            self.refresh(database, run)
            if approval.status != "pending":
                return self.view(database, run)
            self.check_context(database, token, run)
            self.check_version(approval, expected)
            tool = self.waiting_on(run, approval)
            if tool is None:
                self.outdated(database, run, approval)
                return self.view(database, run)
            if not route_for(database, run.space_id).allows(approval.tool_name):
                raise DomainError(403, "ACCESS_DENIED", "This agent can't use that tool.")
            approval.decision_key, approval.version = key, approval.version + 1
            self.event(database, run, "approval.approved", "You approved the change.")
            self.apply(database, run, approval, tool, token)
            self.resume_work(run)
            run_id = run.id
        self.submit(run_id, token)
        with self.sessions() as database:
            return self.view(database, database.get(AgentRun, run_id))

    def apply(self, database, run, approval, tool, token, automatic=False):
        """Runs an approved change exactly as reviewed and tells the model what happened."""
        call_id = approval.payload["call_id"]
        try:
            done = tool.execute(self.tool_context(run, token, database), approval.payload["input"], approval.effect_key)
            failure = None
        except ToolProblem as problem:
            done, failure = None, (problem.code, problem.message)
        except DomainError as error:
            if error.status == 401:
                raise
            done, failure = None, (error.code, error.message)
        now = self.clock()
        if failure is not None:
            approval.status, approval.reason, approval.decided_at = "cancelled", failure[0][:48], now
            self.record_call(database, run, approval.tool_name, "write", "failed", f"{tool.action}: failed. {failure[1]}",
                             approval.payload["input"], error_code=failure[0][:48], approval_id=approval.id)
            self.append(run, tool_message(call_id, {"error": f"The approved change failed: {failure[1]}"}))
            self.event(database, run, "approval.failed", f"The change could not be made: {failure[1]}")
            return False
        approval.status, approval.result_ref, approval.decided_at = "approved", done.ref, now
        approval.reason = "auto_approved" if automatic else None
        self.record_call(database, run, approval.tool_name, "write", "succeeded",
                         f"{tool.action}: done{' (approved automatically)' if automatic else ''}.",
                         approval.payload["input"], result_ref=done.ref, approval_id=approval.id)
        self.add_evidence(run, {"kind": tool.result_kind, "ref": done.ref, "label": done.label[:200]})
        self.append(run, tool_message(call_id, {"result": {**done.data, "done": done.label}}))
        self.remember(run, changed=(run.state or {}).get("changed", 0) + 1)
        if done.next_review is not None:
            name, arguments = done.next_review
            self.remember(run, next_review={"tool": name, "arguments": arguments})
        self.event(database, run, "approval.done", done.label)
        return True

    def resume_work(self, run):
        now = self.clock()
        self.remember(run, pending=None)
        run.status, run.deadline_at = "queued", now + ACTIVE
        run.question_id = run.question = run.question_expires_at = None
        run.lease_owner = run.lease_expires_at = None
        self.touch(run)

    def reject(self, token, approval_id, expected):
        with self.sessions.begin() as database:
            _user, run, approval = self.owned_approval(database, token, str(approval_id))
            if approval.status == "rejected":
                return self.view(database, run)
            if approval.status != "pending":
                raise DomainError(409, "APPROVAL_DECIDED", "This action was already decided.")
            self.refresh(database, run)
            if approval.status != "pending":
                return self.view(database, run)
            self.check_version(approval, expected)
            tool = self.waiting_on(run, approval)
            approval.status, approval.reason, approval.decided_at = "rejected", "rejected", self.clock()
            approval.version += 1
            self.event(database, run, "approval.rejected", "You rejected the change.")
            if tool is None:
                if run.status not in TERMINAL:
                    self.finish(database, run, "cancelled", "Okay. Nothing was changed.", stop_reason="rejected")
                return self.view(database, run)
            self.append(run, tool_message(approval.payload["call_id"], {
                "rejected": "The person rejected this change, so nothing was changed. Don't propose it again unless they ask.",
            }))
            self.resume_work(run)
            run_id = run.id
        self.submit(run_id, token)
        with self.sessions() as database:
            return self.view(database, database.get(AgentRun, run_id))

    def resume(self, token, run_id, body):
        question_id, answer = str(body.question_id), body.answer
        with self.sessions.begin() as database:
            _user, run = self.owned_run(database, token, str(run_id), lock=True)
            if (run.state or {}).get("answers", {}).get(question_id) == answer:
                return self.view(database, run)
            self.refresh(database, run)
            if run.status != "waiting_for_user" or run.question_id != question_id:
                if run.status in TERMINAL:
                    return self.view(database, run)
                raise DomainError(409, "QUESTION_CLOSED", "This question was already answered. Reload the request.")
            self.check_context(database, token, run)
            pending = (run.state or {}).get("pending") or {}
            if pending.get("kind") != "question" or pending.get("question_id") != question_id:
                run.question_id = run.question = run.question_expires_at = None
                self.finish(database, run, "expired", "This request came from an earlier version of the Agent. Ask me again.",
                            stop_reason="outdated")
                return self.view(database, run)
            self.remember(run, answers={**(run.state or {}).get("answers", {}), question_id: answer})
            self.append(run, tool_message(pending["call_id"], {"answer": answer}))
            self.event(database, run, "run.answered", "You answered.")
            self.resume_work(run)
            run_id = run.id
        self.submit(run_id, token)
        with self.sessions() as database:
            return self.view(database, database.get(AgentRun, run_id))

    def cancel(self, token, run_id):
        with self.sessions.begin() as database:
            _user, run = self.owned_run(database, token, str(run_id), lock=True)
            self.refresh(database, run)
            if run.status in TERMINAL:
                return self.view(database, run)
            self.close_approvals(database, run, "cancelled", "run_cancelled")
            outcome = "action_completed" if (run.state or {}).get("changed", 0) else None
            self.finish(database, run, "cancelled", "Stopped. Nothing else was changed.", outcome, "cancelled")
            return self.view(database, run)

    # Queries

    def read_run(self, token, run_id):
        with self.sessions.begin() as database:
            _user, run = self.owned_run(database, token, str(run_id), lock=True)
            self.refresh(database, run)
            return self.view(database, run)

    def read_web_text(self, token, run_id):
        with self.sessions.begin() as database:
            self.owned_run(database, token, str(run_id), lock=True)
            _user, run = self.owned_run(database, token, str(run_id))
            return AgentRunWebTextView(run_id=run.id, sources=stored_web_text(run.state))

    def list_runs(self, token, space_id, limit, cursor=None, *, status="all"):
        """The person's requests to one agent: the Main Agent without a Space, otherwise that Space's agent."""
        space_id = None if space_id is None else str(space_id)
        with self.sessions.begin() as database:
            user, _session, member = self.requester(database, token, space_id)
            self.hold(database, user.id)
            user, _session, member = self.requester(database, token, space_id)
            admission_id = member.admission_id if member else None
            scope = ((AgentRun.space_id.is_(None),) if space_id is None
                     else (AgentRun.space_id == space_id, AgentRun.admission_id == admission_id))
            statement = select(AgentRun).where(AgentRun.account_id == user.id, *scope)
            if status != "all":
                if status not in RUN_FILTERS:
                    raise DomainError(400, "INVALID_FILTER", "Choose a request status.")
                now = self.clock()
                effective_status = case(
                    (and_(AgentRun.status.in_(WAITING), AgentRun.deadline_at <= now), "expired"),
                    (and_(AgentRun.status.in_(WAITING + WORKING),
                          space_id is not None and self.agent_off(database, space_id)), "cancelled"),
                    (or_(and_(AgentRun.status == "running", AgentRun.lease_expires_at <= now - LEASE_GRACE),
                         and_(AgentRun.status == "queued", AgentRun.updated_at <= now - STALE_QUEUE)), "failed"),
                    else_=AgentRun.status,
                )
                statement = statement.where(effective_status.in_(RUN_FILTERS[status]))
            if cursor:
                try:
                    position = AgentRunCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, TypeError, ValueError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload your requests.") from None
                shown = tuple(None if value is None else str(value)
                              for value in (position.account_id, position.space_id, position.admission_id))
                if shown != (user.id, space_id, admission_id) or position.status != status:
                    raise DomainError(400, "CURSOR_INVALID", "Reload your requests.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload your requests.")
                statement = statement.where(or_(
                    AgentRun.created_at < position.before_created_at,
                    and_(AgentRun.created_at == position.before_created_at, AgentRun.id < str(position.before_id)),
                ))
            rows = database.scalars(
                statement.order_by(AgentRun.created_at.desc(), AgentRun.id.desc()).limit(limit + 1).with_for_update()
            ).all()
            page = rows[:limit]
            for run in page:
                self.refresh(database, run)
                if status != "all" and run.status not in RUN_FILTERS[status]:
                    raise DomainError(409, "RUN_LIST_CHANGED", "Requests changed while loading. Refresh this list.")
            next_cursor = None
            if len(rows) > limit:
                next_cursor = self.security.seal(AgentRunCursor(
                    kind="agent_runs", status=status, account_id=user.id, space_id=space_id, admission_id=admission_id,
                    before_created_at=page[-1].created_at, before_id=page[-1].id, expires_at=self.clock() + LIFETIME,
                ).model_dump_json())
            return [self.view(database, run) for run in page], Pagination(next_cursor=next_cursor, has_more=len(rows) > limit)

    def memories(self, database, account_id):
        return database.scalars(
            select(AgentMemory).where(AgentMemory.account_id == account_id).order_by(AgentMemory.created_at.desc(), AgentMemory.id)
        ).all()

    def list_memories(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            return [self.memory_view(memory) for memory in self.memories(database, user.id)]

    def delete_memory(self, token, memory_id):
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token)
            self.hold(database, user.id)
            user, _session = self.identity.authenticate(database, token)
            memory = database.scalar(select(AgentMemory).where(
                AgentMemory.id == str(memory_id), AgentMemory.account_id == user.id,
            ).with_for_update())
            if memory is None:
                raise DomainError(404, "NOT_FOUND", "Memory not found.")
            database.delete(memory)
            return DeletedMemory(id=str(memory_id))

    def edit_memory(self, token, memory_id, body, key, expected):
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token)
            self.hold(database, user.id)
            user, _session = self.identity.authenticate(database, token)
            memory = database.scalar(select(AgentMemory).where(
                AgentMemory.id == str(memory_id), AgentMemory.account_id == user.id,
            ).with_for_update())
            if memory is None:
                raise DomainError(404, "NOT_FOUND", "Memory not found.")
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current memory first.")
            digest = self.security.digest("agent.memory.edit", memory.id, expected,
                                          body.model_dump_json(exclude_unset=True))
            previous = database.scalar(select(AgentMemoryCommand).where(
                AgentMemoryCommand.memory_id == memory.id, AgentMemoryCommand.request_key == key,
            ))
            if previous is not None:
                if previous.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for changed memory details.")
                return self.memory_view(memory)
            if expected != self.memory_etag(memory):
                raise DomainError(412, "PRECONDITION_FAILED", "This memory changed. Review it again.")
            if body.content is not None:
                if SENSITIVE.search(body.content):
                    raise DomainError(422, "MEMORY_SENSITIVE", "Memories cannot hold passwords, PINs, card, bank or ID numbers.")
                if memory.kind == "preference" and not re.fullmatch(HHMM, body.content):
                    raise DomainError(422, "MEMORY_INVALID", "Use a valid 24-hour reminder time, HH:MM.")
            changed = False
            if body.content is not None and memory.content != body.content:
                memory.content = body.content
                memory.source = "user_edit"
                changed = True
            if body.enabled is not None and memory.enabled != body.enabled:
                memory.enabled = body.enabled
                changed = True
            if changed:
                memory.version += 1
            database.add(AgentMemoryCommand(id=str(uuid4()), memory_id=memory.id, request_key=key,
                                            request_digest=digest, created_at=self.clock()))
            database.flush()
            return self.memory_view(memory)

    def tools(self):
        views = []
        for tool in TOOLS.values():
            if tool.needs_web and self.web is None:
                continue
            views += [AgentToolView(name=name, version="1", description=tool.description,
                                    effect="write" if tool.effect == "write" else "read",
                                    risk="medium" if tool.effect == "write" else "low",
                                    requires_approval=tool.effect == "write") for name in sorted(scopes(tool))]
        return views

    # Views

    def approval_etag(self, approval):
        digest = self.security.digest("agent.approval.view", approval.id, str(approval.version), approval.status, approval.payload_digest)
        return f'"{digest}"'

    def approval_view(self, approval):
        fields = [AgentApprovalField(label=str(field["label"])[:80], value=str(field["value"]))
                  for field in (approval.payload or {}).get("fields", [])][:10]
        return AgentApprovalView(
            id=approval.id, run_id=approval.run_id, space_id=approval.space_id, tool_name=approval.tool_name, risk=approval.risk,
            summary=approval.summary, fields=fields, status=approval.status, reason=approval.reason, result_ref=approval.result_ref,
            created_at=approval.created_at, expires_at=approval.expires_at, decided_at=approval.decided_at,
            version=str(approval.version), etag=self.approval_etag(approval),
        )

    @staticmethod
    def memory_label(memory):
        return "Default reminder time" if memory.key == "reminder_time" else "Note"

    def memory_view(self, memory):
        return AgentMemoryView(
            id=memory.id, kind=memory.kind, key=memory.key, label=self.memory_label(memory), content=memory.content,
            enabled=memory.enabled, version=str(memory.version), etag=self.memory_etag(memory),
            source=memory.source, source_run_id=memory.source_run_id, space_id=memory.space_id, created_at=memory.created_at,
        )

    def memory_etag(self, memory):
        return f'"{self.security.digest("agent.memory.view", memory.id, str(memory.version))}"'

    @staticmethod
    def handoffs(database, run):
        """The Space chat buttons the Main Agent showed, only for Spaces the person is still in."""
        shown = (run.state or {}).get("handoffs") or []
        if not shown:
            return []
        current = set(database.scalars(select(SpaceMembership.space_id).where(
            SpaceMembership.account_id == run.account_id, SpaceMembership.status == "active",
            SpaceMembership.space_id.in_([item["space_id"] for item in shown]),
        )))
        return [AgentHandoffView(**item) for item in shown if item["space_id"] in current]

    def view(self, database, run):
        state = run.state or {}
        approvals = database.scalars(select(AgentApproval).where(AgentApproval.run_id == run.id)
                                     .order_by(AgentApproval.created_at.desc(), AgentApproval.id.desc())).all()
        pending = next((item for item in approvals if item.status == "pending"), None)
        approval = pending or (approvals[0] if approvals else None)
        calls = database.scalars(select(AgentToolCall).where(AgentToolCall.run_id == run.id)
                                 .order_by(AgentToolCall.sequence.desc()).limit(SHOWN_CALLS)).all()
        events = database.scalars(select(AgentRunEvent).where(AgentRunEvent.run_id == run.id)
                                  .order_by(AgentRunEvent.sequence.desc()).limit(SHOWN_EVENTS)).all()
        question = None
        if run.status == "waiting_for_user":
            question = AgentQuestionView(id=run.question_id, text=run.question, expires_at=run.question_expires_at)
        todos = [AgentTodoView(content=item["content"], status=item["status"]) for item in state.get("todos", [])][:10]
        plan = [AgentPlanStep(**item) for item in run.plan] if run.plan else [
            AgentPlanStep(id=f"todo-{index}", label=item.content, kind="check", tool=None,
                          status="done" if item.status == "completed" else "pending")
            for index, item in enumerate(todos, start=1)
        ]
        return AgentRunView(
            id=run.id, agent_kind=run.agent_kind, space_id=run.space_id, message=run.message, status=run.status, outcome=run.outcome,
            stop_reason=run.stop_reason, intent=run.intent, answer=run.answer, question=question,
            sources=[AgentWebSource(**source) for source in stored_sources(state)],
            approval=self.approval_view(approval) if approval else None, plan=plan, todos=todos,
            handoffs=self.handoffs(database, run),
            tool_calls=[AgentToolCallView(
                id=call.id, sequence=call.sequence, tool_name=call.tool_name, tool_version=call.tool_version, effect=call.effect,
                risk=call.risk, status=call.status, summary=call.summary, result_ref=call.result_ref, error_code=call.error_code,
                approval_id=call.approval_id, created_at=call.created_at,
            ) for call in reversed(calls)],
            evidence=[AgentEvidence(**item) for item in state.get("evidence", [])][:SHOWN_EVIDENCE],
            events=[AgentEventView(sequence=item.sequence, event_type=item.event_type, summary=item.summary, created_at=item.created_at)
                    for item in reversed(events)],
            created_at=run.created_at, updated_at=run.updated_at, finished_at=run.finished_at, version=str(run.version),
        )
