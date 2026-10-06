from datetime import date, timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, false, func, select

from app.errors import DomainError
from app.modules.discovery.live import announce_task
from app.modules.identity.models import OutboxEvent, User
from app.modules.planning.models import Task, TaskAccess, TaskAudit, TaskCommand
from app.modules.planning.schemas import AssigneeView, TaskCursor, TaskListItem, TaskPermissions, TaskView
from app.modules.spaces.models import Space, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_TASKS_PER_SPACE = 500


class TaskService:
    def __init__(self, spaces):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock

    def context(self, database, token, space_id, lock=False, account_ids=()):
        if lock:
            user, _accounts = self.spaces.lock_accounts(database, token, account_ids)
            self.spaces.lock_space(database, space_id)
        else:
            user, _session = self.identity.authenticate(database, token)
        statement = select(SpaceMembership).join(Space).where(
            SpaceMembership.space_id == space_id, SpaceMembership.account_id == user.id,
            SpaceMembership.status == "active", Space.status == "active",
        )
        if lock:
            statement = statement.with_for_update(of=SpaceMembership)
        membership = database.scalar(statement.execution_options(populate_existing=True))
        if membership is None:
            raise DomainError(404, "NOT_FOUND", "Space not found.")
        if lock:
            self.identity.authenticate(database, token, lock=True)
        return user, membership

    @staticmethod
    def visible_tasks(account_id, space_id):
        return (
            select(Task, SpaceMembership)
            .join(TaskAccess, and_(TaskAccess.task_id == Task.id, TaskAccess.space_id == Task.space_id))
            .join(SpaceMembership, and_(
                SpaceMembership.space_id == Task.space_id,
                SpaceMembership.account_id == TaskAccess.account_id,
                SpaceMembership.admission_id == TaskAccess.admission_id,
            ))
            .join(Space, Space.id == Task.space_id)
            .join(User, User.id == SpaceMembership.account_id)
            .where(
                Task.space_id == space_id, SpaceMembership.account_id == account_id,
                SpaceMembership.status == "active", Space.status == "active", User.status == "active",
            ).execution_options(populate_existing=True)
        )

    @staticmethod
    def can_manage(task, member):
        return member.role == "owner" or (
            task.created_by_id == member.account_id and task.creator_admission_id == member.admission_id
        )

    @classmethod
    def can_operate(cls, task, member):
        return cls.can_manage(task, member) or (
            task.assignee_account_id == member.account_id and task.assignee_admission_id == member.admission_id
        )

    def permissions(self, task, member):
        manager = self.can_manage(task, member)
        transitions = []
        if self.can_operate(task, member):
            if task.status == "open":
                transitions = ["in_progress", "completed"]
            elif task.status == "in_progress":
                transitions = ["open", "completed"]
            elif task.status == "completed":
                transitions = ["open"]
        if manager and task.status in ("open", "in_progress"):
            transitions.append("cancelled")
        return TaskPermissions(can_edit=manager and task.status in ("open", "in_progress"), allowed_statuses=transitions)

    @staticmethod
    def eligible_members(space_id):
        return select(SpaceMembership, User).join(User, User.id == SpaceMembership.account_id).where(
            SpaceMembership.space_id == space_id, SpaceMembership.status == "active",
            User.status == "active", User.verified_at.is_not(None),
        )

    def assignee(self, database, space_id, identifier, task_id=None):
        if identifier is None:
            return None
        statement = self.eligible_members(space_id).where(SpaceMembership.account_id == identifier)
        if task_id:
            statement = statement.join(TaskAccess, and_(
                TaskAccess.task_id == task_id, TaskAccess.space_id == space_id,
                TaskAccess.account_id == SpaceMembership.account_id,
                TaskAccess.admission_id == SpaceMembership.admission_id,
            ))
        row = database.execute(statement).first()
        if row is None:
            raise DomainError(409, "ASSIGNEE_UNAVAILABLE", "Select a current member with access to this task.")
        return row[0]

    def view(self, database, task, member):
        assignee = None
        if task.assignee_account_id:
            row = database.execute(self.eligible_members(task.space_id).join(TaskAccess, and_(
                TaskAccess.task_id == task.id, TaskAccess.space_id == task.space_id,
                TaskAccess.account_id == SpaceMembership.account_id,
                TaskAccess.admission_id == SpaceMembership.admission_id,
            )).where(
                SpaceMembership.account_id == task.assignee_account_id,
                SpaceMembership.admission_id == task.assignee_admission_id,
            )).first()
            if row:
                assignee = AssigneeView(account_id=row[1].id, display_name=row[1].display_name)
        return TaskView(
            id=task.id, space_id=task.space_id, title=task.title, description=task.description,
            due_date=task.due_date, status=task.status, priority=task.priority, assignee=assignee,
            assignee_unavailable=task.assignee_account_id is not None and assignee is None,
            created_by_account_id=task.created_by_id, completed_by_account_id=task.completed_by_account_id,
            completed_at=task.completed_at, created_at=task.created_at, updated_at=task.updated_at,
            version=str(task.version), permissions=self.permissions(task, member),
        )

    def etag(self, view, member):
        digest = self.security.digest("task.view", member.admission_id, view.model_dump_json())
        return f'"{digest}"'

    def record(self, database, task, member, action, previous, changed):
        identifier = str(uuid4())
        now = self.clock()
        database.add_all([
            TaskAudit(
                id=identifier, task_id=task.id, actor_id=member.account_id,
                actor_admission_id=member.admission_id, action=action, task_version=task.version,
                status_before=previous, status_after=task.status, changed_fields=changed, created_at=now,
            ),
            OutboxEvent(id=identifier, event_type=action, actor_id=member.account_id,
                        aggregate_id=task.id, schema_version=1, created_at=now),
        ])
        # Ticking a checklist item changes nothing a search can find.
        if action != "task.checklist_check":
            announce_task(database, task.id, task.space_id)
        return identifier

    def create(self, token, body, key):
        space_id = str(body.space_id)
        assignee_id = str(body.assignee_account_id) if body.assignee_account_id else None
        with self.sessions.begin() as database:
            user, member = self.context(database, token, space_id, lock=True, account_ids=[assignee_id] if assignee_id else [])
            digest = self.security.digest("task.create", body.model_dump_json())
            existing = database.scalar(select(Task).where(
                Task.space_id == space_id, Task.created_by_id == user.id, Task.creation_key == key,
            ))
            if existing:
                visible = database.execute(
                    self.visible_tasks(user.id, space_id).where(Task.id == existing.id)
                ).first()
                if visible is None:
                    raise DomainError(404, "NOT_FOUND", "Task not found.")
                existing, member = visible
                if existing.creator_admission_id != member.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Task not found.")
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed task details.")
                result = self.view(database, existing, member)
                return result, self.etag(result, member)
            count = database.scalar(select(func.count()).select_from(Task).where(Task.space_id == space_id))
            if count >= MAX_TASKS_PER_SPACE:
                raise DomainError(409, "TASK_LIMIT_REACHED", "The local family task limit was reached.")
            assigned = self.assignee(database, space_id, assignee_id)
            audience = database.execute(self.eligible_members(space_id)).all()
            self.identity.authenticate(database, token, lock=True)
            now = self.clock()
            task = Task(
                id=str(uuid4()), space_id=space_id, created_by_id=user.id,
                creator_admission_id=member.admission_id, creation_key=key, creation_digest=digest,
                title=body.title, description=body.description, due_date=body.due_date, priority=body.priority,
                status="open", version=1, created_at=now, updated_at=now,
                assignee_account_id=assignee_id, assignee_admission_id=assigned.admission_id if assigned else None,
            )
            database.add(task)
            database.flush()
            database.add_all([
                TaskAccess(task_id=task.id, space_id=space_id, account_id=membership.account_id,
                           admission_id=membership.admission_id)
                for membership, _user in audience
            ])
            self.record(database, task, member, "task.created", None, ["title", "description", "due_date", "assignee_account_id", "priority"])
            result = self.view(database, task, member)
            return result, self.etag(result, member)

    def read(self, token, identifier):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            candidate = database.get(Task, identifier)
            if candidate is None:
                raise DomainError(404, "NOT_FOUND", "Task not found.")
            row = database.execute(self.visible_tasks(user.id, candidate.space_id).where(Task.id == identifier)).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Task not found.")
            task, member = row
            result = self.view(database, task, member)
            return result, self.etag(result, member)

    @staticmethod
    def due_range(due_from, due_to):
        try:
            first = date.fromisoformat(due_from) if due_from else None
            last = date.fromisoformat(due_to) if due_to else None
        except ValueError:
            raise DomainError(422, "INVALID_FILTER", "Use real calendar dates.") from None
        if first and last and first > last:
            raise DomainError(422, "INVALID_FILTER", "The first date must be on or before the last.")
        return first, last

    def list_tasks(self, token, space_id, limit, cursor=None, status=None, assignee=None, due_from=None, due_to=None):
        first, last = self.due_range(due_from, due_to)
        with self.sessions() as database:
            user, member = self.context(database, token, space_id)
            statement = self.visible_tasks(user.id, space_id)
            if status:
                statement = statement.where(Task.status == status)
            if assignee == "none":
                statement = statement.where(Task.assignee_account_id.is_(None))
            elif assignee:
                # Only the person's current admission counts, as in the task view; a former admission shows as unavailable.
                admission = database.scalar(select(SpaceMembership.admission_id).where(
                    SpaceMembership.space_id == space_id, SpaceMembership.account_id == assignee,
                    SpaceMembership.status == "active",
                ))
                statement = statement.where(
                    Task.assignee_account_id == assignee, Task.assignee_admission_id == admission,
                ) if admission else statement.where(false())
            if first:
                statement = statement.where(Task.due_date >= first)
            if last:
                statement = statement.where(Task.due_date <= last)
            if cursor:
                try:
                    position = TaskCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, TypeError, ValueError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload tasks.") from None
                if (str(position.account_id), str(position.space_id), str(position.admission_id), position.status,
                        position.assignee, position.due_from, position.due_to) != (
                        user.id, space_id, member.admission_id, status, assignee, first, last):
                    raise DomainError(400, "CURSOR_INVALID", "Reload tasks.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload tasks.")
                statement = statement.where(Task.id > str(position.after_id))
            rows = database.execute(statement.order_by(Task.id).limit(limit + 1)).all()
            page = rows[:limit]
            has_more = len(rows) > limit
            next_cursor = None
            if has_more:
                next_cursor = self.security.seal(TaskCursor(
                    kind="family_tasks", account_id=user.id, space_id=space_id,
                    admission_id=member.admission_id, status=status, assignee=assignee, due_from=first, due_to=last,
                    after_id=page[-1][0].id, expires_at=self.clock() + timedelta(minutes=15),
                ).model_dump_json())
            results = []
            for task, current_member in page:
                view = self.view(database, task, current_member)
                results.append(TaskListItem(**view.model_dump(), etag=self.etag(view, current_member)))
            return results, Pagination(next_cursor=next_cursor, has_more=has_more)

    def list_assignees(self, token, space_id, task_id=None):
        with self.sessions() as database:
            user, member = self.context(database, token, space_id)
            statement = self.eligible_members(space_id)
            if task_id:
                row = database.execute(self.visible_tasks(user.id, space_id).where(Task.id == task_id)).first()
                if row is None:
                    raise DomainError(404, "NOT_FOUND", "Task not found.")
                task, member = row
                if not self.can_manage(task, member):
                    raise DomainError(403, "ACCESS_DENIED", "Task assignment is not permitted.")
                statement = statement.join(TaskAccess, and_(
                    TaskAccess.task_id == task_id, TaskAccess.space_id == space_id,
                    TaskAccess.account_id == SpaceMembership.account_id,
                    TaskAccess.admission_id == SpaceMembership.admission_id,
                ))
            return [AssigneeView(account_id=user.id, display_name=user.display_name)
                    for _membership, user in database.execute(statement.order_by(User.display_name, User.id).limit(50))]

    def mutate(self, token, identifier, body, key, expected, operation):
        with self.sessions.begin() as database:
            self.identity.authenticate(database, token)
            candidate = database.get(Task, identifier)
            if candidate is None:
                raise DomainError(404, "NOT_FOUND", "Task not found.")
            accounts = [candidate.assignee_account_id] if candidate.assignee_account_id else []
            if operation == "edit" and body.assignee_account_id:
                accounts.append(str(body.assignee_account_id))
            user, member = self.context(database, token, candidate.space_id, lock=True, account_ids=accounts)
            row = database.execute(
                self.visible_tasks(user.id, candidate.space_id).where(Task.id == identifier).with_for_update(of=Task)
            ).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Task not found.")
            task, member = row
            self.identity.authenticate(database, token, lock=True)
            permitted = self.can_manage(task, member) if operation == "edit" else self.can_operate(task, member)
            if not permitted:
                raise DomainError(403, "ACCESS_DENIED", "This task action is not permitted.")
            digest = self.security.digest(f"task.{operation}", body.model_dump_json(exclude_unset=True), expected or "")
            receipt = database.get(TaskCommand, (task.id, user.id, operation, key))
            view = self.view(database, task, member)
            if receipt:
                if receipt.actor_admission_id != member.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Task not found.")
                if receipt.input_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed task request.")
                return view, self.etag(view, member)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Reload the task before changing it.")
            if expected != self.etag(view, member):
                raise DomainError(412, "PRECONDITION_FAILED", "This task changed. Reload and review.")
            previous = task.status
            if operation == "edit":
                if not view.permissions.can_edit:
                    raise DomainError(409, "TASK_CLOSED", "Reopen a completed task before editing it.")
                if "assignee_account_id" in body.model_fields_set:
                    assignee_id = str(body.assignee_account_id) if body.assignee_account_id else None
                    assigned = self.assignee(database, task.space_id, assignee_id, task.id)
                    task.assignee_account_id = assignee_id
                    task.assignee_admission_id = assigned.admission_id if assigned else None
                for field in ("title", "description", "due_date", "priority"):
                    if field in body.model_fields_set:
                        setattr(task, field, getattr(body, field))
                changed = sorted(body.model_fields_set)
                action = "task.updated"
            else:
                if body.status not in view.permissions.allowed_statuses:
                    raise DomainError(409, "INVALID_TASK_TRANSITION", "This task transition is not permitted.")
                task.status = body.status
                task.completed_by_account_id = user.id if body.status == "completed" else None
                task.completed_at = self.clock() if body.status == "completed" else None
                changed = ["status"]
                action = f"task.{body.status}"
            self.identity.authenticate(database, token, lock=True)
            task.version += 1
            task.updated_at = self.clock()
            audit_id = self.record(database, task, member, action, previous, changed)
            database.flush()
            database.add(TaskCommand(
                task_id=task.id, actor_id=user.id, operation=operation, request_key=key,
                actor_admission_id=member.admission_id, input_digest=digest, audit_id=audit_id,
            ))
            result = self.view(database, task, member)
            return result, self.etag(result, member)