from uuid import uuid4

from sqlalchemy import func, select

from app.errors import DomainError
from app.modules.planning.models import Task, TaskChecklistItem, TaskCommand
from app.modules.planning.schemas import ChecklistItemView, ChecklistView


class ChecklistService:
    def __init__(self, tasks):
        self.tasks = tasks

    def context(self, database, token, task_id, lock=False):
        caller, _session = self.tasks.identity.authenticate(database, token)
        candidate = database.get(Task, task_id)
        if candidate is None:
            raise DomainError(404, "NOT_FOUND", "Task not found.")
        if lock:
            caller, _member = self.tasks.context(database, token, candidate.space_id, lock=True)
        statement = self.tasks.visible_tasks(caller.id, candidate.space_id).where(Task.id == task_id)
        if lock:
            statement = statement.with_for_update(of=Task)
        row = database.execute(statement).first()
        if row is None:
            raise DomainError(404, "NOT_FOUND", "Task not found.")
        self.tasks.identity.authenticate(database, token, lock=lock)
        return caller, row[0], row[1]

    def view(self, database, task, member):
        items = database.scalars(select(TaskChecklistItem).where(
            TaskChecklistItem.task_id == task.id, TaskChecklistItem.removed_at.is_(None),
        ).order_by(TaskChecklistItem.created_at, TaskChecklistItem.id).limit(51)).all()
        if len(items) > 50:
            raise DomainError(503, "CHECKLIST_UNAVAILABLE", "The checklist is unavailable.")
        opened = task.status in ("open", "in_progress")
        view = ChecklistView(
            task_id=task.id, space_id=task.space_id, task_title=task.title, task_status=task.status,
            task_version=str(task.version), can_manage=opened and self.tasks.can_manage(task, member),
            can_check=opened and self.tasks.can_operate(task, member), etag="",
            items=[ChecklistItemView(id=item.id, title=item.title, checked=item.checked,
                checked_at=item.checked_at, checked_by_account_id=item.checked_by_id) for item in items],
        )
        view.etag = '"' + self.tasks.security.digest("task.checklist.view", member.admission_id, view.model_dump_json()) + '"'
        return view

    def read(self, token, task_id):
        with self.tasks.sessions() as database:
            _caller, task, member = self.context(database, token, task_id)
            return self.view(database, task, member)

    def mutate(self, token, task_id, body, key, expected):
        with self.tasks.sessions.begin() as database:
            caller, task, member = self.context(database, token, task_id, lock=True)
            allowed = self.tasks.can_operate(task, member) if body.action == "check" else self.tasks.can_manage(task, member)
            if not allowed:
                raise DomainError(403, "ACCESS_DENIED", "This checklist action is not permitted.")
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current checklist first.")
            digest = self.tasks.security.digest("task.checklist.command", body.model_dump_json(exclude_unset=True), expected)
            receipt = database.get(TaskCommand, (task_id, caller.id, "checklist", key))
            current = self.view(database, task, member)
            if receipt:
                if receipt.actor_admission_id != member.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Task not found.")
                if receipt.input_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed checklist command.")
                return current
            if expected != current.etag:
                raise DomainError(412, "PRECONDITION_FAILED", "The task or checklist changed. Reload and review.")
            if task.status not in ("open", "in_progress"):
                raise DomainError(409, "TASK_CLOSED", "Reopen a completed task before changing its checklist.")
            now = self.tasks.clock()
            if body.action == "add":
                count = database.scalar(select(func.count()).select_from(TaskChecklistItem).where(TaskChecklistItem.task_id == task_id))
                if len(current.items) >= 50 or count >= 500:
                    raise DomainError(409, "CHECKLIST_LIMIT_REACHED", "The local checklist limit was reached.")
                item = TaskChecklistItem(id=str(uuid4()), task_id=task_id, title=body.title, checked=False, created_at=now)
                database.add(item)
            else:
                item = database.scalar(select(TaskChecklistItem).where(
                    TaskChecklistItem.id == str(body.item_id), TaskChecklistItem.task_id == task_id,
                    TaskChecklistItem.removed_at.is_(None),
                ))
                if item is None:
                    raise DomainError(404, "NOT_FOUND", "Checklist item not found.")
                if body.action == "rename":
                    if item.title == body.title:
                        raise DomainError(409, "NO_CHANGES", "This item already has that title.")
                    item.title = body.title
                    item.checked = False
                    item.checked_by_id = None
                    item.checked_at = None
                elif body.action == "check":
                    if item.checked == body.checked:
                        raise DomainError(409, "NO_CHANGES", "This item already has that checked state.")
                    item.checked = body.checked
                    item.checked_by_id = caller.id if body.checked else None
                    item.checked_at = now if body.checked else None
                else:
                    item.removed_at = now
            self.tasks.identity.authenticate(database, token, lock=True)
            task.version += 1
            task.updated_at = now
            audit_id = self.tasks.record(database, task, member, f"task.checklist_{body.action}", task.status, ["checklist", item.id])
            database.flush()
            database.add(TaskCommand(task_id=task_id, actor_id=caller.id, operation="checklist", request_key=key,
                actor_admission_id=member.admission_id, input_digest=digest, audit_id=audit_id))
            return self.view(database, task, member)