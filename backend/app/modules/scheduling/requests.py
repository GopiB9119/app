from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.identity.models import OutboxEvent, User
from app.modules.planning.models import Task, TaskAccess
from app.modules.scheduling.models import ReminderRequest, ReminderRequestEvent
from app.modules.scheduling.schemas import (
    PreviewClaims, PreviewOption, ReminderRecipient, ReminderRequestCursor,
    ReminderRequestPreview, ReminderRequestReview, ReminderRequestView,
    RequestAcceptanceClaims, RequestPreviewClaims,
)
from app.modules.scheduling.service import CATCHUP_WINDOW, PREVIEW_LIFETIME, SCHEDULING_HORIZON, local_candidates
from app.modules.spaces.models import Space, SpaceMembership
from app.modules.spaces.schemas import Pagination

REQUEST_LIFETIME = timedelta(hours=72)
MAX_REQUESTS_PER_ACCOUNT = 500


class ReminderRequestService:
    def __init__(self, reminders):
        self.reminders = reminders
        self.tasks = reminders.tasks
        self.identity = reminders.identity
        self.sessions = reminders.sessions
        self.security = reminders.security
        self.clock = reminders.clock

    def pair(self, database, token, task_id, recipient_id, lock=False):
        candidate = database.get(Task, task_id)
        if candidate is None:
            self.identity.authenticate(database, token)
            raise DomainError(404, "NOT_FOUND", "Task not found.")
        caller, member = self.tasks.context(database, token, candidate.space_id, lock=lock, account_ids=[recipient_id])
        if caller.id == recipient_id:
            raise DomainError(422, "RECIPIENT_INVALID", "Use Remind me for your own reminder.")
        statement = self.tasks.visible_tasks(caller.id, candidate.space_id).where(Task.id == task_id)
        recipient_statement = self.tasks.visible_tasks(recipient_id, candidate.space_id).where(Task.id == task_id)
        if lock:
            statement = statement.with_for_update(of=(Task, TaskAccess, SpaceMembership))
            recipient_statement = recipient_statement.with_for_update(of=(TaskAccess, SpaceMembership))
        row = database.execute(statement).first()
        recipient_row = database.execute(recipient_statement).first()
        if row is None or recipient_row is None:
            raise DomainError(404, "NOT_FOUND", "Task or recipient not available.")
        recipient = database.get(User, recipient_id)
        if recipient.verified_at is None:
            raise DomainError(404, "NOT_FOUND", "Task or recipient not available.")
        return caller, row[0], row[1], recipient, recipient_row[1]

    def require_requester(self, task, member, recipient, recipient_member):
        self.reminders.require_open(task)
        if not self.tasks.can_manage(task, member):
            raise DomainError(404, "NOT_FOUND", "Task not available.")
        if (task.assignee_account_id, task.assignee_admission_id) != (recipient.id, recipient_member.admission_id):
            raise DomainError(409, "RECIPIENT_UNAVAILABLE", "Choose the current task assignee.")

    def preview(self, token, body):
        with self.sessions() as database:
            caller, task, member, recipient, recipient_member = self.pair(database, token, str(body.task_id), str(body.recipient_account_id))
            self.require_requester(task, member, recipient, recipient_member)
            now = self.clock()
            candidates = local_candidates(body.local_time, body.timezone)
            request_expiry = min(now + REQUEST_LIFETIME, candidates[0][0])
            options = []
            for instant, offset in candidates:
                if instant <= now or instant > now + SCHEDULING_HORIZON:
                    raise DomainError(422, "REMINDER_TIME_INVALID", "Choose a future time within 366 days.")
                claims = RequestPreviewClaims(
                    kind="task_reminder_request", account_id=caller.id, admission_id=member.admission_id,
                    recipient_account_id=recipient.id, recipient_admission_id=recipient_member.admission_id,
                    task_id=task.id, space_id=task.space_id, source_version=task.version,
                    local_time=body.local_time, timezone=body.timezone, scheduled_at=instant,
                    dispatch_expires_at=instant + CATCHUP_WINDOW, request_expires_at=request_expiry,
                    expires_at=now + PREVIEW_LIFETIME,
                )
                options.append(PreviewOption(scheduled_at=instant, dispatch_expires_at=claims.dispatch_expires_at,
                                             utc_offset_minutes=offset, preview_token=self.security.seal(claims.model_dump_json())))
            return ReminderRequestPreview(
                task_id=task.id, task_title=task.title, task_version=str(task.version),
                local_time=body.local_time, timezone=body.timezone,
                requested_by=ReminderRecipient(account_id=caller.id, display_name=caller.display_name),
                recipient=ReminderRecipient(account_id=recipient.id, display_name=recipient.display_name),
                options=options, expires_at=now + PREVIEW_LIFETIME, request_expires_at=request_expiry,
            )

    def visible(self, account_id, lock=False):
        requester = aliased(User)
        recipient = aliased(User)
        requester_member = aliased(SpaceMembership)
        recipient_member = aliased(SpaceMembership)
        requester_access = aliased(TaskAccess)
        recipient_access = aliased(TaskAccess)
        statement = (
            select(ReminderRequest, Task, requester, recipient, requester_member, recipient_member)
            .join(Task, and_(Task.id == ReminderRequest.task_id, Task.space_id == ReminderRequest.space_id))
            .join(Space, Space.id == Task.space_id)
            .join(requester, requester.id == ReminderRequest.requested_by_id)
            .join(recipient, recipient.id == ReminderRequest.recipient_account_id)
            .join(requester_member, and_(requester_member.space_id == Task.space_id, requester_member.account_id == requester.id,
                                        requester_member.admission_id == ReminderRequest.requester_admission_id))
            .join(recipient_member, and_(recipient_member.space_id == Task.space_id, recipient_member.account_id == recipient.id,
                                        recipient_member.admission_id == ReminderRequest.recipient_admission_id))
            .join(requester_access, and_(requester_access.task_id == Task.id, requester_access.space_id == Task.space_id,
                                        requester_access.account_id == requester.id, requester_access.admission_id == requester_member.admission_id))
            .join(recipient_access, and_(recipient_access.task_id == Task.id, recipient_access.space_id == Task.space_id,
                                        recipient_access.account_id == recipient.id, recipient_access.admission_id == recipient_member.admission_id))
            .where(or_(requester.id == account_id, recipient.id == account_id), requester.status == "active", recipient.status == "active",
                   requester_member.status == "active", recipient_member.status == "active", Space.status == "active")
            .execution_options(populate_existing=True)
        )
        if lock:
            statement = statement.with_for_update(of=(ReminderRequest, Task, requester_member, recipient_member, requester_access, recipient_access))
        return statement

    def read(self, database, statement):
        # Nine joins made PostgreSQL spend about 200 ms planning each read, so the order written in visible() is kept for this statement only.
        database.execute(text("SET LOCAL join_collapse_limit = 1"))
        rows = database.execute(statement).all()
        database.execute(text("SET LOCAL join_collapse_limit = DEFAULT"))
        return rows

    def status(self, row):
        proposal, task, _requester, _recipient, requester_member, _recipient_member = row
        if proposal.status != "pending":
            return proposal.status
        if proposal.expires_at <= self.clock():
            return "expired"
        if (task.version != proposal.source_version or task.status not in ("open", "in_progress")
                or not self.tasks.can_manage(task, requester_member)
                or (task.assignee_account_id, task.assignee_admission_id) != (proposal.recipient_account_id, proposal.recipient_admission_id)):
            return "outdated"
        return "pending"

    def view(self, row, account_id):
        proposal, task, requester, recipient, _requester_member, _recipient_member = row
        return ReminderRequestView(
            id=proposal.id, task_id=task.id, space_id=task.space_id, task_title=task.title, task_version=str(proposal.source_version),
            requested_by=ReminderRecipient(account_id=requester.id, display_name=requester.display_name),
            recipient=ReminderRecipient(account_id=recipient.id, display_name=recipient.display_name),
            local_time=proposal.local_time, timezone=proposal.timezone, scheduled_at=proposal.scheduled_at,
            dispatch_expires_at=proposal.dispatch_expires_at, expires_at=proposal.expires_at, created_at=proposal.created_at,
            resolved_at=proposal.resolved_at, status=self.status(row), source_changed=task.version != proposal.source_version,
            reminder_id=proposal.reminder_id if account_id == recipient.id else None, version=str(proposal.version),
        )

    def record(self, database, proposal, actor_id, action):
        identifier = str(uuid4())
        database.add_all([
            ReminderRequestEvent(id=identifier, request_id=proposal.id, actor_account_id=actor_id, action=action, created_at=self.clock()),
            OutboxEvent(id=identifier, event_type=action, actor_id=actor_id, aggregate_id=proposal.id, schema_version=1, created_at=self.clock()),
        ])

    def create(self, token, body, key):
        try:
            claims = RequestPreviewClaims.model_validate_json(self.security.open(body.preview_token))
        except (InvalidToken, ValueError, TypeError):
            raise DomainError(400, "PREVIEW_INVALID", "Review a new reminder request.") from None
        with self.sessions.begin() as database:
            caller, task, member, recipient, recipient_member = self.pair(database, token, str(claims.task_id), str(claims.recipient_account_id), lock=True)
            if (str(claims.account_id), str(claims.admission_id), str(claims.space_id), str(claims.recipient_admission_id)) != (caller.id, member.admission_id, task.space_id, recipient_member.admission_id):
                raise DomainError(400, "PREVIEW_INVALID", "Review a new reminder request.")
            digest = self.security.digest("reminder_request.create", body.preview_token)
            existing = database.scalar(select(ReminderRequest).where(ReminderRequest.requested_by_id == caller.id, ReminderRequest.request_key == key))
            if existing:
                rows = self.read(database, self.visible(caller.id).where(ReminderRequest.id == existing.id))
                row = rows[0] if rows else None
                if row is None:
                    raise DomainError(404, "NOT_FOUND", "Reminder request not found.")
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed reminder request.")
                return self.view(row, caller.id)
            self.require_requester(task, member, recipient, recipient_member)
            if claims.source_version != task.version:
                raise DomainError(409, "TASK_CHANGED", "The task changed. Review a new request.")
            if claims.scheduled_at not in dict(local_candidates(claims.local_time, claims.timezone)) or claims.dispatch_expires_at != claims.scheduled_at + CATCHUP_WINDOW:
                raise DomainError(409, "DELIVERY_POLICY_CHANGED", "Review a new reminder request.")
            pending = database.scalar(select(ReminderRequest).where(ReminderRequest.task_id == task.id, ReminderRequest.recipient_account_id == recipient.id, ReminderRequest.status == "pending").with_for_update())
            if pending:
                if pending.expires_at <= self.clock() or pending.source_version != task.version:
                    pending.status = "expired" if pending.expires_at <= self.clock() else "outdated"
                    pending.resolved_at = self.clock()
                    pending.version += 1
                    self.record(database, pending, caller.id, f"reminder_request.{pending.status}")
                    database.flush()
                else:
                    raise DomainError(409, "REMINDER_REQUEST_PENDING", "A request is already waiting for this assignee.")
            for criterion in (ReminderRequest.requested_by_id == caller.id, ReminderRequest.recipient_account_id == recipient.id):
                if database.scalar(select(func.count()).select_from(ReminderRequest).where(criterion)) >= MAX_REQUESTS_PER_ACCOUNT:
                    raise DomainError(409, "REMINDER_REQUEST_LIMIT", "The local reminder request limit was reached.")
            self.identity.authenticate(database, token, lock=True)
            if claims.expires_at <= self.clock() or claims.request_expires_at <= self.clock() or claims.scheduled_at <= self.clock():
                raise DomainError(410, "PREVIEW_EXPIRED", "Review a new future reminder request.")
            proposal = ReminderRequest(
                id=str(uuid4()), task_id=task.id, space_id=task.space_id, requested_by_id=caller.id,
                requester_admission_id=member.admission_id, recipient_account_id=recipient.id,
                recipient_admission_id=recipient_member.admission_id, source_version=task.version,
                request_key=key, request_digest=digest, schedule_key=str(uuid4()), local_time=claims.local_time,
                timezone=claims.timezone, scheduled_at=claims.scheduled_at, dispatch_expires_at=claims.dispatch_expires_at,
                expires_at=claims.request_expires_at, created_at=self.clock(), status="pending", version=1,
            )
            database.add(proposal)
            database.flush()
            self.record(database, proposal, caller.id, "reminder_request.created")
            return self.view((proposal, task, caller, recipient, member, recipient_member), caller.id)

    def context(self, database, token, identifier, role=None, lock=False):
        caller, _session = self.identity.authenticate(database, token)
        candidate = database.get(ReminderRequest, identifier)
        if candidate is None or caller.id not in (candidate.requested_by_id, candidate.recipient_account_id):
            raise DomainError(404, "NOT_FOUND", "Reminder request not found.")
        if (role == "recipient" and caller.id != candidate.recipient_account_id) or (role == "requester" and caller.id != candidate.requested_by_id):
            raise DomainError(404, "NOT_FOUND", "Reminder request not found.")
        if lock:
            caller, _accounts = self.tasks.spaces.lock_accounts(database, token, [candidate.requested_by_id, candidate.recipient_account_id])
            self.tasks.spaces.lock_space(database, candidate.space_id)
        rows = self.read(database, self.visible(caller.id, lock=lock).where(ReminderRequest.id == identifier))
        row = rows[0] if rows else None
        if row is None:
            raise DomainError(404, "NOT_FOUND", "Reminder request not found.")
        if lock:
            self.identity.authenticate(database, token, lock=True)
        return caller, row

    def require_pending(self, row):
        status = self.status(row)
        if status == "expired":
            raise DomainError(410, "REMINDER_REQUEST_EXPIRED", "This reminder request expired.")
        if status != "pending":
            raise DomainError(409, "REMINDER_REQUEST_CHANGED", "Refresh this reminder request.")

    def review(self, token, identifier):
        with self.sessions() as database:
            caller, row = self.context(database, token, identifier, role="recipient")
            self.require_pending(row)
            preference = self.reminders.preference(database, caller.id)
            if not preference.in_app_reminders_enabled:
                raise DomainError(409, "REMINDERS_DISABLED", "In-app task reminders are disabled.")
            proposal = row[0]
            expiry = min(self.clock() + PREVIEW_LIFETIME, proposal.expires_at)
            claims = RequestAcceptanceClaims(
                kind="task_reminder_request_acceptance", request_id=proposal.id, account_id=caller.id,
                admission_id=proposal.recipient_admission_id, source_version=proposal.source_version,
                request_version=proposal.version, preference_generation=preference.generation, expires_at=expiry,
            )
            return ReminderRequestReview(request=self.view(row, caller.id), preview_token=self.security.seal(claims.model_dump_json()), expires_at=expiry)

    def accept(self, token, identifier, body):
        with self.sessions.begin() as database:
            caller, row = self.context(database, token, identifier, role="recipient", lock=True)
            proposal = row[0]
            try:
                claims = RequestAcceptanceClaims.model_validate_json(self.security.open(body.preview_token))
            except (InvalidToken, ValueError, TypeError):
                raise DomainError(400, "PREVIEW_INVALID", "Review this request again.") from None
            if (str(claims.request_id), str(claims.account_id), str(claims.admission_id), claims.source_version) != (proposal.id, caller.id, proposal.recipient_admission_id, proposal.source_version):
                raise DomainError(400, "PREVIEW_INVALID", "Review this request again.")
            if proposal.status == "accepted":
                return self.view(row, caller.id)
            self.require_pending(row)
            if claims.request_version != proposal.version:
                raise DomainError(409, "REMINDER_REQUEST_CHANGED", "Review this request again.")
            reviewed = PreviewClaims(
                kind="self_task_reminder", account_id=caller.id, admission_id=proposal.recipient_admission_id,
                task_id=proposal.task_id, space_id=proposal.space_id, source_version=proposal.source_version,
                preference_generation=claims.preference_generation, local_time=proposal.local_time, timezone=proposal.timezone,
                scheduled_at=proposal.scheduled_at, dispatch_expires_at=proposal.dispatch_expires_at,
                expires_at=min(claims.expires_at, proposal.expires_at),
            )
            reminder = self.reminders.create_reviewed(database, token, reviewed, proposal.schedule_key, self.security.digest("reminder_request.accept", proposal.id))
            proposal.status = "accepted"
            proposal.reminder_id = reminder.id
            proposal.resolved_at = self.clock()
            proposal.version += 1
            self.record(database, proposal, caller.id, "reminder_request.accepted")
            return self.view(row, caller.id)

    def resolve(self, token, identifier, action):
        role, outcome = ("recipient", "declined") if action == "decline" else ("requester", "cancelled")
        with self.sessions.begin() as database:
            caller, row = self.context(database, token, identifier, role=role, lock=True)
            proposal = row[0]
            if proposal.status == outcome:
                return self.view(row, caller.id)
            self.require_pending(row)
            proposal.status = outcome
            proposal.resolved_at = self.clock()
            proposal.version += 1
            self.record(database, proposal, caller.id, f"reminder_request.{outcome}")
            return self.view(row, caller.id)

    def list_requests(self, token, direction, limit, cursor=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            criterion = ReminderRequest.recipient_account_id if direction == "received" else ReminderRequest.requested_by_id
            statement = self.visible(caller.id).where(criterion == caller.id)
            if cursor:
                try:
                    position = ReminderRequestCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload reminder requests.") from None
                if (str(position.account_id), position.direction) != (caller.id, direction):
                    raise DomainError(400, "CURSOR_INVALID", "Reload reminder requests.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload reminder requests.")
                statement = statement.where(ReminderRequest.id > str(position.after_id))
            rows = self.read(database, statement.order_by(ReminderRequest.id).limit(limit + 1))
            page = rows[:limit]
            has_more = len(rows) > limit
            next_cursor = None
            if has_more:
                next_cursor = self.security.seal(ReminderRequestCursor(kind="task_reminder_requests", account_id=caller.id,
                    direction=direction, after_id=page[-1][0].id, expires_at=self.clock() + timedelta(minutes=15)).model_dump_json())
            return [self.view(row, caller.id) for row in page], Pagination(next_cursor=next_cursor, has_more=has_more)