import json
from datetime import date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select

from app.errors import DomainError
from app.modules.agents.models import AgentApproval, AgentMemory, AgentRun, AgentRunEvent, AgentToolCall
from app.modules.agents.parser import Intent, match_tasks, parse, parse_time_answer
from app.modules.agents.schemas import (
    AgentApprovalField,
    AgentApprovalView,
    AgentEventView,
    AgentEvidence,
    AgentMemoryView,
    AgentPlanStep,
    AgentQuestionView,
    AgentRunCursor,
    AgentRunView,
    AgentToolCallView,
    AgentToolView,
    DeletedMemory,
)
from app.modules.agents.tools import POLICY_VERSION, REFUSALS, TOOLS
from app.modules.identity.models import User
from app.modules.planning.models import Task
from app.modules.planning.schemas import ChangeTaskStatus, CreateTask
from app.modules.scheduling.models import Reminder, ReminderSeries
from app.modules.scheduling.schemas import CreateReminder, PreviewReminder
from app.modules.spaces.models import Space
from app.modules.spaces.schemas import Pagination

LIFETIME = timedelta(minutes=15)
AGENT_OFF_ANSWER = "The owner turned the agent off in this Space. Nothing was changed."
DAILY_RUNS = 100
MAX_NOTES = 50
LISTED = 10
CHOICES = 5
QUESTIONS = 4
PERSON_LOCK = 20261001
OPEN = ("open", "in_progress")
WAITING = ("waiting_for_approval", "waiting_for_user")
TERMINAL = ("completed", "failed", "cancelled", "timed_out", "expired")
HELP = (
    "I can list tasks, add a task, mark a task done, remind you about a task, and remember a short note or your usual "
    "reminder time. I show you every change first, and nothing changes until you approve it. I can't help with medicines "
    "or health, contact anyone, remind other people, handle money, change members, or delete anything."
)
PROBLEMS = {
    "missing_title": "What should the task be called? For example: add a task to buy milk tomorrow.",
    "title_too_long": "Keep the task title under 200 characters.",
    "invalid_date": "I couldn't read that date. Use a date like 21 September or 2026-09-21.",
    "invalid_time": "I couldn't read that time. Use a time like 6 pm or 18:30.",
    "missing_task": "Which task? Name it, for example: mark buy milk as done, or remind me to buy milk at 6 pm.",
    "missing_note": "Tell me what to remember, for example: remember that the plumber comes on Fridays.",
    "note_too_long": "Keep a note under 200 characters.",
}
ACTIONS = {
    "tasks.create": "Create the task",
    "tasks.complete": "Mark the task completed",
    "reminders.schedule": "Schedule your reminder",
    "agent.memory.save": "Save the memory",
}
RESULTS = {"tasks.create": "task", "tasks.complete": "task", "reminders.schedule": "reminder", "agent.memory.save": "memory"}


def step(identifier, label, kind, tool=None, status="done"):
    return {"id": identifier, "label": label, "kind": kind, "tool": tool, "status": status}


def plain_date(value):
    return f"{value.strftime('%a')} {value.day} {value.strftime('%b %Y')}"


def offset_label(minutes):
    sign = "+" if minutes >= 0 else "-"
    hours, rest = divmod(abs(minutes), 60)
    return f"UTC{sign}{hours:02d}:{rest:02d}"


class AgentService:
    """Rule-based agent (DEC-012): it reads what the person can see and changes nothing without their exact approval."""

    def __init__(self, tasks, reminders):
        self.tasks = tasks
        self.reminders = reminders
        self.identity = tasks.identity
        self.sessions = tasks.sessions
        self.security = tasks.security
        self.clock = tasks.clock

    # Context and records

    def context(self, database, token, space_id):
        user, session = self.identity.authenticate(database, token)
        _user, member = self.tasks.context(database, token, space_id)
        return user, session, member

    def hold(self, database, account_id):
        # One person's agent changes run one at a time, so the daily limit, request keys, the note limit and the
        # default reminder time are checked and written together. Taken before any agent row lock; nothing else
        # takes it. The account row is not locked here: approving calls the task and reminder services, which lock it.
        database.execute(select(func.pg_advisory_xact_lock(PERSON_LOCK, func.hashtext(account_id))))

    def owned_run(self, database, token, run_id, lock=False):
        user, _session = self.identity.authenticate(database, token)
        statement = select(AgentRun).where(AgentRun.id == run_id, AgentRun.account_id == user.id)
        if lock:
            self.hold(database, user.id)
            statement = statement.with_for_update()
        run = database.scalar(statement.execution_options(populate_existing=True))
        if run is None:
            raise DomainError(404, "NOT_FOUND", "Request not found.")
        _user, member = self.tasks.context(database, token, run.space_id)
        if member.admission_id != run.admission_id:
            raise DomainError(404, "NOT_FOUND", "Request not found.")
        return user, run

    def local_now(self, run):
        return self.clock().astimezone(ZoneInfo(run.timezone))

    def event(self, database, run, event_type, summary):
        run.event_sequence += 1
        database.add(AgentRunEvent(
            id=str(uuid4()), run_id=run.id, sequence=run.event_sequence, event_type=event_type,
            summary=summary[:300], created_at=self.clock(),
        ))

    def call(self, database, run, name, value, summary, status="succeeded", result_ref=None, error_code=None, approval_id=None):
        tool = TOOLS[name]
        run.tool_calls_used += 1
        database.add(AgentToolCall(
            id=str(uuid4()), run_id=run.id, sequence=run.tool_calls_used, tool_name=tool.name, tool_version=tool.version,
            effect=tool.effect, risk=tool.risk, status=status,
            input_digest=self.security.digest("agent.tool", tool.name, json.dumps(value, sort_keys=True, default=str)),
            summary=summary[:300], result_ref=result_ref, error_code=error_code, approval_id=approval_id, created_at=self.clock(),
        ))

    def remember_state(self, run, **values):
        run.state = {**run.state, **values}

    def evidence(self, run, kind, ref, label):
        self.remember_state(run, evidence=[*run.state.get("evidence", []), {"kind": kind, "ref": ref, "label": label[:200]}])

    def finish(self, database, run, status, answer, outcome=None, stop_reason=None):
        now = self.clock()
        run.status, run.answer, run.outcome, run.stop_reason = status, answer, outcome, stop_reason
        run.question_id = run.question = run.question_expires_at = None
        run.finished_at = now if status in TERMINAL else None
        run.updated_at = now
        run.version += 1
        self.event(database, run, f"run.{status}", {
            "completed": "Finished.", "failed": "Could not finish.", "cancelled": "Stopped.", "expired": "Expired before you answered.",
        }.get(status, status))

    def ask(self, database, run, text, pending):
        now = self.clock()
        run.status, run.question_id, run.question = "waiting_for_user", str(uuid4()), text
        run.question_expires_at = now + LIFETIME
        run.deadline_at = now + LIFETIME
        run.updated_at = now
        run.version += 1
        self.remember_state(run, pending=pending, asked=run.state.get("asked", 0) + 1)
        self.event(database, run, "run.question", "Asked you a question.")

    def ask_again(self, database, run, text, pending):
        # Each question renews the deadline, so unreadable answers stop after a few rounds instead of keeping the request open.
        if run.state.get("asked", 0) >= QUESTIONS:
            run.plan = [*run.plan, step("respond", "Answer", "response")]
            return self.finish(database, run, "completed", "I still couldn't understand, so I stopped. Nothing was changed. "
                               "Ask me again with the details, for example: remind me to buy milk at 6 pm.", "answered", "too_many_questions")
        return self.ask(database, run, text, pending)

    def propose(self, database, run, user, member, tool_name, payload, fields, summary):
        tool = TOOLS[tool_name]
        now = self.clock()
        document = {"input": payload, "fields": [{"label": label, "value": value} for label, value in fields]}
        approval = AgentApproval(
            id=str(uuid4()), run_id=run.id, account_id=user.id, admission_id=member.admission_id, space_id=run.space_id,
            tool_name=tool.name, tool_version=tool.version, risk=tool.risk, summary=summary[:300], payload=document,
            payload_digest=self.security.digest("agent.approval", json.dumps(document, sort_keys=True, default=str)),
            effect_key=str(uuid4()), status="pending", version=1, created_at=now, expires_at=now + LIFETIME,
        )
        database.add(approval)
        run.status, run.question_id, run.question, run.question_expires_at = "waiting_for_approval", None, None, None
        run.deadline_at = approval.expires_at
        run.updated_at = now
        run.version += 1
        run.plan = [*run.plan, step("approve", "Wait for your approval", "approval", tool.name, "pending"),
                    step("act", ACTIONS[tool.name], "tool", tool.name, "pending")]
        self.remember_state(run, pending=None)
        self.event(database, run, "approval.requested", "Waiting for your approval.")
        return approval

    def mark_plan(self, run, **statuses):
        run.plan = [{**item, "status": statuses.get(item["id"], item["status"])} for item in run.plan]

    def expire(self, database, run):
        if run.status not in WAITING or run.deadline_at > self.clock():
            return
        approval = database.scalar(select(AgentApproval).where(AgentApproval.run_id == run.id).with_for_update())
        if approval is not None and approval.status == "pending":
            approval.status, approval.reason, approval.decided_at = "expired", "expired", self.clock()
            approval.version += 1
            self.mark_plan(run, approve="skipped", act="skipped")
        self.finish(database, run, "expired", "This request expired before you answered. Ask me again.", stop_reason="expired")

    @staticmethod
    def agent_off(database, space_id):
        return database.scalar(select(Space.agent_enabled).where(Space.id == space_id)) is False

    def stop_if_off(self, database, run):
        # DEC-028: a request still waiting when the owner turned the agent off stops the next time it is touched.
        if run.status not in WAITING or not self.agent_off(database, run.space_id):
            return
        approval = database.scalar(select(AgentApproval).where(AgentApproval.run_id == run.id).with_for_update())
        if approval is not None and approval.status == "pending":
            approval.status, approval.reason, approval.decided_at = "cancelled", "agent_off", self.clock()
            approval.version += 1
            self.mark_plan(run, approve="skipped", act="skipped")
        self.finish(database, run, "cancelled", AGENT_OFF_ANSWER, stop_reason="agent_off")

    # Reading what the person can already see

    def members(self, database, space_id):
        rows = database.execute(self.tasks.eligible_members(space_id).order_by(User.display_name, User.id)).all()
        return [(membership.account_id, user.display_name) for membership, user in rows]

    def visible_tasks(self, database, run, user):
        rows = database.execute(self.tasks.visible_tasks(user.id, run.space_id).order_by(Task.due_date, Task.title, Task.id)).all()
        return [(task, member) for task, member in rows]

    def memories(self, database, account_id):
        return database.scalars(
            select(AgentMemory).where(AgentMemory.account_id == account_id).order_by(AgentMemory.created_at.desc(), AgentMemory.id)
        ).all()

    @staticmethod
    def memory_label(memory):
        return "Default reminder time" if memory.key == "reminder_time" else "Note"

    # Requests

    def create_run(self, token, body, key):
        space_id = str(body.space_id)
        digest = self.security.digest("agent.run", space_id, body.message)
        with self.sessions.begin() as database:
            user, session, member = self.context(database, token, space_id)
            self.hold(database, user.id)
            # Waiting for the person's lock can outlast their session or their membership, so both are checked again.
            user, session, member = self.context(database, token, space_id)
            existing = database.scalar(select(AgentRun).where(
                AgentRun.account_id == user.id, AgentRun.request_key == key,
            ).with_for_update())
            if existing:
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed request.")
                if existing.admission_id != member.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Request not found.")
                self.expire(database, existing)
                self.stop_if_off(database, existing)
                return self.view(database, existing)
            if self.agent_off(database, space_id):
                raise DomainError(409, "AGENT_OFF", "The owner turned the agent off in this Space.")
            now = self.clock()
            recent = database.scalar(select(func.count()).select_from(AgentRun).where(
                AgentRun.account_id == user.id, AgentRun.created_at > now - timedelta(hours=24),
            ))
            if recent >= DAILY_RUNS:
                raise DomainError(429, "RATE_LIMITED", "Too many requests today. Try again later.")
            run = AgentRun(
                id=str(uuid4()), space_id=space_id, account_id=user.id, admission_id=member.admission_id,
                session_id=session.id, request_key=key, request_digest=digest, message=body.message, timezone=user.timezone,
                status="running", plan=[step("understand", "Understand the request", "check")], state={"evidence": []},
                attempts=1, available_at=now, steps_used=1, tool_calls_used=0, event_sequence=0, version=1,
                created_at=now, updated_at=now, deadline_at=now + LIFETIME,
            )
            database.add(run)
            database.flush()
            self.event(database, run, "run.created", "Request received.")
            members = self.members(database, space_id)
            intent = parse(body.message, self.local_now(run).date(), members, user.id)
            run.intent = intent.kind
            self.remember_state(run, intent=intent.to_state())
            self.handle(database, token, run, user, member, intent, members)
            return self.view(database, run)

    def handle(self, database, token, run, user, member, intent, members):
        respond = step("respond", "Answer", "response")
        if intent.kind == "refuse":
            self.evidence(run, "policy", None, POLICY_VERSION)
            run.plan = [*run.plan, respond]
            return self.finish(database, run, "completed", REFUSALS[intent.category], "refused", f"refused_{intent.category}")
        if intent.kind in ("help", "unknown", "forget"):
            answer = {
                "help": HELP,
                "unknown": "I can't do that yet. " + HELP,
                "forget": "To forget something, open Memories and delete it. Deleting is immediate.",
            }[intent.kind]
            run.plan = [*run.plan, respond]
            return self.finish(database, run, "completed", answer, "answered")
        if intent.problem:
            run.plan = [*run.plan, respond]
            return self.finish(database, run, "completed", PROBLEMS[intent.problem], "answered", intent.problem)
        if intent.kind == "list_memories":
            return self.list_memories_answer(database, run, user)
        if intent.kind == "list_tasks":
            return self.list_tasks_answer(database, run, user, intent)
        if intent.kind == "remember":
            return self.propose_memory(database, run, user, member, intent)
        if intent.kind == "create_task":
            return self.continue_create(database, run, user, member, intent, members)
        if intent.kind in ("complete_task", "schedule_reminder"):
            return self.choose_task(database, token, run, user, member, intent)
        run.plan = [*run.plan, respond]
        return self.finish(database, run, "completed", "I can't do that yet. " + HELP, "answered")

    def list_memories_answer(self, database, run, user):
        memories = self.memories(database, user.id)
        self.call(database, run, "agent.memory.read", {"account": user.id}, f"Read {len(memories)} memories.")
        run.plan = [*run.plan, step("read", "Read your memories", "tool", "agent.memory.read"), step("respond", "Answer", "response")]
        for memory in memories[:LISTED]:
            self.evidence(run, "memory", memory.id, self.memory_label(memory))
        if not memories:
            return self.finish(database, run, "completed", "I don't remember anything for you yet.", "answered")
        lines = [f"{self.memory_label(memory)}: {memory.content}" for memory in memories[:LISTED]]
        more = f"\n…and {len(memories) - LISTED} more in Memories." if len(memories) > LISTED else ""
        return self.finish(database, run, "completed", "Here is what I remember for you:\n" + "\n".join(lines) + more, "answered")

    def list_tasks_answer(self, database, run, user, intent):
        today = self.local_now(run).date()
        filters = intent.filters
        status = filters.get("status")
        rows = []
        for task, member in self.visible_tasks(database, run, user):
            if (status == "completed") != (task.status == "completed") or task.status == "cancelled":
                continue
            if filters.get("mine") and task.assignee_account_id != user.id:
                continue
            due = filters.get("due")
            if due and (task.due_date is None or not {
                "overdue": task.due_date < today,
                "today": task.due_date == today,
                "tomorrow": task.due_date == today + timedelta(days=1),
                "week": today <= task.due_date <= today + timedelta(days=6),
            }[due]):
                continue
            rows.append(task)
        self.call(database, run, "family.tasks.list", filters, f"Read {len(rows)} matching tasks.")
        run.plan = [*run.plan, step("read", "Read the tasks you can see", "tool", "family.tasks.list"), step("respond", "Answer", "response")]
        for task in rows[:LISTED]:
            self.evidence(run, "task", task.id, task.title)
        if not rows:
            return self.finish(database, run, "completed", "No tasks match that.", "answered")
        lines = [f"{index}. {task.title}" + (f" (due {plain_date(task.due_date)})" if task.due_date else "")
                 for index, task in enumerate(rows[:LISTED], start=1)]
        more = f"\n…and {len(rows) - LISTED} more on the Tasks screen." if len(rows) > LISTED else ""
        return self.finish(database, run, "completed", "\n".join(lines) + more, "answered")

    def propose_memory(self, database, run, user, member, intent):
        if intent.memory_kind == "note":
            notes = database.scalar(select(func.count()).select_from(AgentMemory).where(
                AgentMemory.account_id == user.id, AgentMemory.kind == "note",
            ))
            if notes >= MAX_NOTES:
                run.plan = [*run.plan, step("respond", "Answer", "response")]
                return self.finish(database, run, "completed", f"You already have {MAX_NOTES} notes. Delete one in Memories first.",
                                   "answered", "memory_limit")
            fields = [("Remember", intent.memory_value)]
        else:
            fields = [("Default reminder time", intent.memory_value)]
        payload = {"kind": intent.memory_kind, "key": intent.memory_key, "content": intent.memory_value}
        return self.propose(database, run, user, member, "agent.memory.save", payload, fields, "Save this memory for you only.")

    def continue_create(self, database, run, user, member, intent, members):
        names = dict(members)
        if intent.assignee_ambiguous:
            matches = [(account, name) for account, name in members if name.casefold().split()[:1] == [intent.assignee_query.casefold()]]
        if intent.assignee_ambiguous and matches:
            options = "\n".join(f"{index}. {name}" for index, (_account, name) in enumerate(matches[:CHOICES], start=1))
            return self.ask(database, run, f"Who should do it?\n{options}\nReply with the number or the full name.",
                            {"kind": "choose_assignee", "options": [account for account, _name in matches[:CHOICES]]})
        if intent.assignee_query and not intent.assignee_id:
            run.plan = [*run.plan, step("respond", "Answer", "response")]
            return self.finish(database, run, "completed",
                               f"I couldn't find a current member called {intent.assignee_query} in this Space.", "answered", "assignee_unknown")
        if intent.assignee_id:
            self.call(database, run, "family.members.list", {"space": run.space_id}, f"Read {len(members)} member names.")
            run.plan = [*run.plan, step("members", "Check the members", "tool", "family.members.list")]
        space = database.get(Space, run.space_id)
        payload = {"space_id": run.space_id, "title": intent.title, "due_date": intent.due_date,
                   "assignee_account_id": intent.assignee_id}
        fields = [
            ("Space", space.name), ("Title", intent.title),
            ("Due date", plain_date(date.fromisoformat(intent.due_date)) if intent.due_date else "None"),
            ("Assigned to", ("You" if intent.assignee_id == user.id else names.get(intent.assignee_id, "")) if intent.assignee_id else "Nobody"),
        ]
        return self.propose(database, run, user, member, "tasks.create", payload, fields, "Create this task.")

    def choose_task(self, database, token, run, user, member, intent):
        candidates = [
            (task, current) for task, current in self.visible_tasks(database, run, user)
            if task.status in OPEN and (intent.kind == "schedule_reminder" or self.tasks.can_operate(task, current))
        ]
        self.call(database, run, "family.tasks.list", {"reference": intent.task_ref}, f"Read {len(candidates)} open tasks.")
        run.plan = [*run.plan, step("read", "Find the task", "tool", "family.tasks.list")]
        found = match_tasks(intent.task_ref, [task for task, _member in candidates])
        if not found:
            run.plan = [*run.plan, step("respond", "Answer", "response")]
            what = "complete" if intent.kind == "complete_task" else "be reminded about"
            return self.finish(database, run, "completed", f"I couldn't find an open task you can {what} that matches \u201c{intent.task_ref}\u201d.",
                               "answered", "task_not_found")
        if len(found) > 1:
            options = "\n".join(f"{index}. {task.title}" for index, task in enumerate(found[:CHOICES], start=1))
            return self.ask(database, run, f"Which task?\n{options}\nReply with the number.",
                            {"kind": "choose_task", "options": [task.id for task in found[:CHOICES]]})
        return self.task_chosen(database, token, run, user, member, intent, found[0])

    def task_chosen(self, database, token, run, user, member, intent, task):
        if intent.kind == "complete_task":
            try:
                view, etag = self.tasks.read(token, task.id)
            except DomainError as error:
                run.plan = [*run.plan, step("respond", "Answer", "response")]
                return self.finish(database, run, "failed", error.message, stop_reason=error.code)
            if "completed" not in view.permissions.allowed_statuses:
                run.plan = [*run.plan, step("respond", "Answer", "response")]
                return self.finish(database, run, "completed", "You can't complete that task.", "answered", "not_permitted")
            fields = [("Task", view.title), ("Change", "Mark as completed")]
            payload = {"task_id": view.id, "task_etag": etag}
            return self.propose(database, run, user, member, "tasks.complete", payload, fields, "Mark this task completed.")
        local_time = intent.local_time
        if local_time is None:
            preference = database.scalar(select(AgentMemory).where(AgentMemory.account_id == user.id, AgentMemory.key == "reminder_time"))
            if preference is not None:
                self.call(database, run, "agent.memory.read", {"key": "reminder_time"}, "Read your default reminder time.")
                self.evidence(run, "memory", preference.id, "Default reminder time")
                local_time = preference.content
        if local_time is None:
            return self.ask(database, run, "What time should I remind you?",
                            {"kind": "ask_time", "task_id": task.id, "local_date": intent.local_date})
        return self.propose_reminder(database, token, run, user, member, task.id, intent.local_date, local_time)

    def propose_reminder(self, database, token, run, user, member, task_id, local_date, local_time):
        pending = database.scalar(select(Reminder.id).where(
            Reminder.account_id == user.id, Reminder.task_id == task_id, Reminder.status == "scheduled",
            Reminder.series_id.is_(None), Reminder.follow_up_of.is_(None),
        )) or database.scalar(select(ReminderSeries.id).where(
            ReminderSeries.account_id == user.id, ReminderSeries.task_id == task_id, ReminderSeries.status.in_(("active", "paused")),
        ))
        if pending:
            run.plan = [*run.plan, step("respond", "Answer", "response")]
            return self.finish(database, run, "completed", "You already have a reminder for this task. Change it on the Reminders screen.",
                               "answered", "reminder_exists")
        now = self.local_now(run)
        hour, minute = (int(part) for part in local_time.split(":"))
        if local_date:
            day = date.fromisoformat(local_date)
        else:
            day = now.date()
            if (hour, minute) <= (now.hour, now.minute):
                day += timedelta(days=1)
        moment = f"{day.isoformat()}T{hour:02d}:{minute:02d}"
        try:
            preview = self.reminders.preview(token, PreviewReminder.model_validate(
                {"task_id": task_id, "local_time": moment, "timezone": run.timezone},
            ))
        except DomainError as error:
            run.plan = [*run.plan, step("respond", "Answer", "response")]
            return self.finish(database, run, "failed", error.message, stop_reason=error.code)
        option = preview.options[0]
        payload = {"task_id": task_id, "task_version": preview.task_version, "local_time": moment, "timezone": run.timezone,
                   "scheduled_at": option.scheduled_at.isoformat()}
        fields = [
            ("Task", preview.task_title), ("When", f"{plain_date(day)}, {hour:02d}:{minute:02d}"),
            ("Time zone", f"{run.timezone} ({offset_label(option.utc_offset_minutes)})"), ("Who", "You, in this app"),
        ]
        return self.propose(database, run, user, member, "reminders.schedule", payload, fields, "Schedule this reminder for you.")

    # Answers to questions

    def resume(self, token, run_id, body):
        with self.sessions.begin() as database:
            user, run = self.owned_run(database, token, str(run_id), lock=True)
            question_id, answer = str(body.question_id), body.answer
            if run.state.get("answers", {}).get(question_id) == answer:
                return self.view(database, run)
            self.expire(database, run)
            self.stop_if_off(database, run)
            if run.status != "waiting_for_user" or run.question_id != question_id:
                if run.status == "expired" or run.stop_reason == "agent_off":
                    return self.view(database, run)
                raise DomainError(409, "QUESTION_CLOSED", "This question was already answered. Reload the request.")
            self.remember_state(run, answers={**run.state.get("answers", {}), question_id: answer})
            run.steps_used += 1
            self.event(database, run, "run.answered", "You answered.")
            _user, member = self.tasks.context(database, token, run.space_id)
            pending = run.state["pending"]
            intent = Intent.from_state(run.state["intent"])
            if pending["kind"] == "ask_time":
                local_time, local_date, matched, _date_matched = parse_time_answer(answer, self.local_now(run).date())
                if not matched or local_time is None:
                    self.ask_again(database, run, "I couldn't read that time. What time should I remind you? For example: 6 pm.", pending)
                    return self.view(database, run)
                day = local_date.isoformat() if local_date else pending.get("local_date")
                self.propose_reminder(database, token, run, user, member, pending["task_id"], day, local_time.strftime("%H:%M"))
                return self.view(database, run)
            chosen = self.pick(database, answer, pending["options"], pending["kind"])
            if chosen is None:
                self.ask_again(database, run, "I didn't catch that. " + run.question.removeprefix("I didn't catch that. "), pending)
                return self.view(database, run)
            if pending["kind"] == "choose_assignee":
                intent.assignee_id, intent.assignee_ambiguous, intent.assignee_query = chosen, False, None
                self.remember_state(run, intent=intent.to_state())
                self.continue_create(database, run, user, member, intent, self.members(database, run.space_id))
                return self.view(database, run)
            task = next((task for task, _member in self.visible_tasks(database, run, user) if task.id == chosen), None)
            if task is None or task.status not in OPEN:
                run.plan = [*run.plan, step("respond", "Answer", "response")]
                self.finish(database, run, "completed", "That task is no longer open. Ask me again.", "answered", "task_closed")
                return self.view(database, run)
            self.task_chosen(database, token, run, user, member, intent, task)
            return self.view(database, run)

    def pick(self, database, answer, options, kind):
        text = answer.strip().rstrip(".").casefold()
        if text.isdigit() and 1 <= int(text) <= len(options):
            return options[int(text) - 1]
        if kind == "choose_assignee":
            rows = database.execute(select(User.id, User.display_name).where(User.id.in_(options))).all()
        else:
            rows = database.execute(select(Task.id, Task.title).where(Task.id.in_(options))).all()
        exact = [identifier for identifier, label in rows if label.casefold() == text]
        return exact[0] if len(exact) == 1 else None

    # Decisions on approvals

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

    def approve(self, token, approval_id, key, expected):
        with self.sessions.begin() as database:
            user, run, approval = self.owned_approval(database, token, str(approval_id))
            if approval.status != "pending":
                if approval.decision_key == key:
                    return self.view(database, run)
                raise DomainError(409, "APPROVAL_DECIDED", "This action was already decided.")
            self.expire(database, run)
            self.stop_if_off(database, run)
            if approval.status != "pending":
                return self.view(database, run)
            self.check_version(approval, expected)
            now = self.clock()
            approval.decision_key, approval.version = key, approval.version + 1
            self.mark_plan(run, approve="done")
            self.event(database, run, "approval.approved", "You approved the action.")
            try:
                result_ref, label = self.execute(database, token, run, user, approval)
            except DomainError as error:
                approval.status, approval.reason, approval.decided_at = "cancelled", error.code[:48], now
                self.call(database, run, approval.tool_name, approval.payload["input"], "The action could not be completed.",
                          status="failed", error_code=error.code[:48], approval_id=approval.id)
                self.mark_plan(run, act="failed")
                self.finish(database, run, "failed", error.message, stop_reason=error.code[:40])
                return self.view(database, run)
            approval.status, approval.result_ref, approval.decided_at = "approved", result_ref, now
            self.call(database, run, approval.tool_name, approval.payload["input"], f"{ACTIONS[approval.tool_name]}: done.",
                      result_ref=result_ref, approval_id=approval.id)
            self.evidence(run, RESULTS[approval.tool_name], result_ref, label)
            self.mark_plan(run, act="done")
            self.finish(database, run, "completed", f"Done. {label}", "action_completed")
            return self.view(database, run)

    def execute(self, database, token, run, user, approval):
        values = approval.payload["input"]
        if approval.tool_name == "tasks.create":
            view, _etag = self.tasks.create(token, CreateTask.model_validate(values), approval.effect_key)
            return view.id, f"Created \u201c{view.title}\u201d."
        if approval.tool_name == "tasks.complete":
            view, _etag = self.tasks.mutate(
                token, values["task_id"], ChangeTaskStatus(status="completed"), approval.effect_key, values["task_etag"], "status",
            )
            return view.id, f"Marked \u201c{view.title}\u201d completed."
        if approval.tool_name == "reminders.schedule":
            done = database.scalar(select(Reminder).where(Reminder.account_id == user.id, Reminder.request_key == approval.effect_key))
            if done is not None:
                return done.id, "Your reminder is scheduled."
            preview = self.reminders.preview(token, PreviewReminder.model_validate(
                {"task_id": values["task_id"], "local_time": values["local_time"], "timezone": values["timezone"]},
            ))
            if preview.task_version != values["task_version"]:
                raise DomainError(409, "TASK_CHANGED", "The task changed after I proposed this. Ask me again.")
            option = next((item for item in preview.options if item.scheduled_at == datetime.fromisoformat(values["scheduled_at"])), None)
            if option is None:
                raise DomainError(409, "TIME_CHANGED", "That time is no longer available. Ask me again.")
            reminder = self.reminders.create(token, CreateReminder(preview_token=option.preview_token), approval.effect_key)
            return reminder.id, f"I'll remind you about \u201c{reminder.task_title}\u201d."
        return self.save_memory(database, run, user, values), "I'll remember that."

    def save_memory(self, database, run, user, values):
        now = self.clock()
        if values["kind"] == "preference":
            memory = database.scalar(select(AgentMemory).where(
                AgentMemory.account_id == user.id, AgentMemory.key == values["key"],
            ).with_for_update())
            if memory is not None:
                memory.content, memory.source_run_id, memory.created_at = values["content"], run.id, now
                return memory.id
        else:
            notes = database.scalar(select(func.count()).select_from(AgentMemory).where(
                AgentMemory.account_id == user.id, AgentMemory.kind == "note",
            ))
            if notes >= MAX_NOTES:
                raise DomainError(409, "MEMORY_LIMIT_REACHED", f"You already have {MAX_NOTES} notes. Delete one in Memories first.")
        memory = AgentMemory(
            id=str(uuid4()), account_id=user.id, kind=values["kind"], key=values["key"], content=values["content"],
            source_run_id=run.id, source="approved_request", created_at=now,
        )
        database.add(memory)
        database.flush()
        return memory.id

    def reject(self, token, approval_id, expected):
        with self.sessions.begin() as database:
            _user, run, approval = self.owned_approval(database, token, str(approval_id))
            if approval.status == "rejected":
                return self.view(database, run)
            if approval.status != "pending":
                raise DomainError(409, "APPROVAL_DECIDED", "This action was already decided.")
            self.expire(database, run)
            self.stop_if_off(database, run)
            if approval.status != "pending":
                return self.view(database, run)
            self.check_version(approval, expected)
            approval.status, approval.reason, approval.decided_at = "rejected", "rejected", self.clock()
            approval.version += 1
            self.mark_plan(run, approve="skipped", act="skipped")
            self.event(database, run, "approval.rejected", "You rejected the action.")
            self.finish(database, run, "cancelled", "Okay. Nothing was changed.", stop_reason="rejected")
            return self.view(database, run)

    def cancel(self, token, run_id):
        with self.sessions.begin() as database:
            _user, run = self.owned_run(database, token, str(run_id), lock=True)
            self.expire(database, run)
            self.stop_if_off(database, run)
            if run.status in TERMINAL:
                return self.view(database, run)
            approval = database.scalar(select(AgentApproval).where(AgentApproval.run_id == run.id).with_for_update())
            if approval is not None and approval.status == "pending":
                approval.status, approval.reason, approval.decided_at = "cancelled", "run_cancelled", self.clock()
                approval.version += 1
                self.mark_plan(run, approve="skipped", act="skipped")
            self.finish(database, run, "cancelled", "Stopped. Nothing was changed.", stop_reason="cancelled")
            return self.view(database, run)

    # Queries

    def read_run(self, token, run_id):
        with self.sessions.begin() as database:
            _user, run = self.owned_run(database, token, str(run_id), lock=True)
            self.expire(database, run)
            self.stop_if_off(database, run)
            return self.view(database, run)

    def list_runs(self, token, space_id, limit, cursor=None):
        space_id = str(space_id)
        with self.sessions.begin() as database:
            user, _session, member = self.context(database, token, space_id)
            self.hold(database, user.id)
            # Waiting for the person's lock can outlast their session or their membership, so both are checked again.
            user, _session, member = self.context(database, token, space_id)
            statement = select(AgentRun).where(
                AgentRun.account_id == user.id, AgentRun.space_id == space_id, AgentRun.admission_id == member.admission_id,
            )
            if cursor:
                try:
                    position = AgentRunCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, TypeError, ValueError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload your requests.") from None
                if (str(position.account_id), str(position.space_id), str(position.admission_id)) != (user.id, space_id, member.admission_id):
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
                self.expire(database, run)
                self.stop_if_off(database, run)
            next_cursor = None
            if len(rows) > limit:
                next_cursor = self.security.seal(AgentRunCursor(
                    kind="agent_runs", account_id=user.id, space_id=space_id, admission_id=member.admission_id,
                    before_created_at=page[-1].created_at, before_id=page[-1].id, expires_at=self.clock() + LIFETIME,
                ).model_dump_json())
            return [self.view(database, run) for run in page], Pagination(next_cursor=next_cursor, has_more=len(rows) > limit)

    def list_memories(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            return [self.memory_view(memory) for memory in self.memories(database, user.id)]

    def delete_memory(self, token, memory_id):
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token)
            self.hold(database, user.id)
            # Waiting for the person's lock can outlast their session, so it is checked again.
            user, _session = self.identity.authenticate(database, token)
            memory = database.scalar(select(AgentMemory).where(
                AgentMemory.id == str(memory_id), AgentMemory.account_id == user.id,
            ).with_for_update())
            if memory is None:
                raise DomainError(404, "NOT_FOUND", "Memory not found.")
            database.delete(memory)
            return DeletedMemory(id=str(memory_id))

    @staticmethod
    def tools():
        return [AgentToolView(**tool.__dict__) for tool in TOOLS.values()]

    # Views

    def approval_etag(self, approval):
        digest = self.security.digest("agent.approval.view", approval.id, str(approval.version), approval.status, approval.payload_digest)
        return f'"{digest}"'

    def approval_view(self, approval):
        return AgentApprovalView(
            id=approval.id, run_id=approval.run_id, space_id=approval.space_id, tool_name=approval.tool_name, risk=approval.risk,
            summary=approval.summary, fields=[AgentApprovalField(**field) for field in approval.payload["fields"]],
            status=approval.status, reason=approval.reason, result_ref=approval.result_ref, created_at=approval.created_at,
            expires_at=approval.expires_at, decided_at=approval.decided_at, version=str(approval.version),
            etag=self.approval_etag(approval),
        )

    def memory_view(self, memory):
        return AgentMemoryView(
            id=memory.id, kind=memory.kind, key=memory.key, label=self.memory_label(memory), content=memory.content,
            source=memory.source, source_run_id=memory.source_run_id, created_at=memory.created_at,
        )

    def view(self, database, run):
        approval = database.scalar(select(AgentApproval).where(AgentApproval.run_id == run.id))
        calls = database.scalars(select(AgentToolCall).where(AgentToolCall.run_id == run.id).order_by(AgentToolCall.sequence)).all()
        events = database.scalars(select(AgentRunEvent).where(AgentRunEvent.run_id == run.id).order_by(AgentRunEvent.sequence)).all()
        question = None
        if run.status == "waiting_for_user":
            question = AgentQuestionView(id=run.question_id, text=run.question, expires_at=run.question_expires_at)
        return AgentRunView(
            id=run.id, space_id=run.space_id, message=run.message, status=run.status, outcome=run.outcome,
            stop_reason=run.stop_reason, intent=run.intent, answer=run.answer, question=question,
            approval=self.approval_view(approval) if approval else None,
            plan=[AgentPlanStep(**item) for item in run.plan],
            tool_calls=[AgentToolCallView(
                id=call.id, sequence=call.sequence, tool_name=call.tool_name, tool_version=call.tool_version, effect=call.effect,
                risk=call.risk, status=call.status, summary=call.summary, result_ref=call.result_ref, error_code=call.error_code,
                approval_id=call.approval_id, created_at=call.created_at,
            ) for call in calls],
            evidence=[AgentEvidence(**item) for item in run.state.get("evidence", [])],
            events=[AgentEventView(sequence=item.sequence, event_type=item.event_type, summary=item.summary, created_at=item.created_at)
                    for item in events],
            created_at=run.created_at, updated_at=run.updated_at, finished_at=run.finished_at, version=str(run.version),
        )
