from datetime import timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.errors import DomainError
from app.modules.identity.models import OutboxEvent, User
from app.modules.notifications.models import InAppNotification, NotificationPreference
from app.modules.planning.models import Task, TaskAccess
from app.modules.realtime.hub import signal
from app.modules.scheduling.models import Reminder, ReminderEvent, ReminderSeries
from app.modules.scheduling.schemas import PreviewClaims, PreviewOption, ReminderCursor, ReminderPreview, ReminderRecipient, ReminderView
from app.modules.spaces.models import Space, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_REMINDERS_PER_ACCOUNT = 500
PREVIEW_LIFETIME = timedelta(minutes=5)
SCHEDULING_HORIZON = timedelta(days=366)
CATCHUP_WINDOW = timedelta(hours=24)
MAX_DISPATCH_ATTEMPTS = 5
DISPATCH_SCAN_PAGES = 5


def local_candidates(local_time, zone_name):
    zone = ZoneInfo(zone_name)
    candidates = {}
    for fold in (0, 1):
        resolved = local_time.replace(tzinfo=zone, fold=fold)
        instant = resolved.astimezone(timezone.utc)
        if instant.astimezone(zone).replace(tzinfo=None) == local_time:
            candidates[instant] = int(resolved.utcoffset().total_seconds() // 60)
    if not candidates:
        raise DomainError(422, "LOCAL_TIME_NONEXISTENT", "This local time does not exist. Select another time.")
    return sorted(candidates.items())


class ReminderService:
    def __init__(self, tasks):
        self.tasks = tasks
        self.identity = tasks.identity
        self.sessions = tasks.sessions
        self.security = tasks.security
        self.clock = tasks.clock
        # Set by ReminderSeriesService so the dispatcher can continue a series in the same transaction.
        self.series = None

    @staticmethod
    def preference(database, account_id, create=False):
        preference = database.get(NotificationPreference, account_id)
        if preference is None:
            preference = NotificationPreference(account_id=account_id, in_app_reminders_enabled=True, generation=1)
            if create:
                database.add(preference)
                database.flush()
        return preference

    def task_context(self, database, token, task_id, lock=False):
        caller, _session = self.identity.authenticate(database, token)
        candidate = database.get(Task, task_id)
        if candidate is None:
            raise DomainError(404, "NOT_FOUND", "Task not found.")
        if lock:
            caller, _member = self.tasks.context(database, token, candidate.space_id, lock=True)
        statement = self.tasks.visible_tasks(caller.id, candidate.space_id).where(Task.id == task_id)
        if lock:
            statement = statement.with_for_update(of=(Task, TaskAccess, SpaceMembership))
        row = database.execute(statement).first()
        if row is None:
            raise DomainError(404, "NOT_FOUND", "Task not found.")
        if lock:
            self.identity.authenticate(database, token, lock=True)
        return caller, row[0], row[1]

    @staticmethod
    def require_open(task):
        if task.status not in ("open", "in_progress"):
            raise DomainError(409, "TASK_CLOSED", "Choose an open task before scheduling a reminder.")

    def preview(self, token, body):
        with self.sessions() as database:
            caller, task, member = self.task_context(database, token, str(body.task_id))
            self.require_open(task)
            preference = self.preference(database, caller.id)
            if not preference.in_app_reminders_enabled:
                raise DomainError(409, "REMINDERS_DISABLED", "In-app task reminders are disabled.")
            now = self.clock()
            options = []
            for instant, offset in local_candidates(body.local_time, body.timezone):
                if instant <= now or instant > now + SCHEDULING_HORIZON:
                    raise DomainError(422, "REMINDER_TIME_INVALID", "Choose a future time within 366 days.")
                claims = PreviewClaims(
                    kind="self_task_reminder", account_id=caller.id, admission_id=member.admission_id,
                    task_id=task.id, space_id=task.space_id, source_version=task.version,
                    preference_generation=preference.generation, local_time=body.local_time,
                    timezone=body.timezone, scheduled_at=instant, dispatch_expires_at=instant + CATCHUP_WINDOW,
                    expires_at=now + PREVIEW_LIFETIME,
                )
                options.append(PreviewOption(scheduled_at=instant, dispatch_expires_at=claims.dispatch_expires_at, utc_offset_minutes=offset, preview_token=self.security.seal(claims.model_dump_json())))
            return ReminderPreview(
                task_id=task.id, task_title=task.title, task_version=str(task.version),
                local_time=body.local_time, timezone=body.timezone,
                recipient=ReminderRecipient(account_id=caller.id, display_name=caller.display_name),
                options=options, expires_at=now + PREVIEW_LIFETIME,
            )

    def visible(self, account_id):
        return (
            select(Reminder, Task, SpaceMembership)
            .join(Task, and_(Task.id == Reminder.task_id, Task.space_id == Reminder.space_id))
            .join(TaskAccess, and_(TaskAccess.task_id == Task.id, TaskAccess.space_id == Task.space_id, TaskAccess.account_id == Reminder.account_id, TaskAccess.admission_id == Reminder.admission_id))
            .join(SpaceMembership, and_(SpaceMembership.space_id == Reminder.space_id, SpaceMembership.account_id == Reminder.account_id, SpaceMembership.admission_id == Reminder.admission_id))
            .join(Space, Space.id == Reminder.space_id)
            .where(Reminder.account_id == account_id, SpaceMembership.status == "active", Space.status == "active")
            .execution_options(populate_existing=True)
        )

    @staticmethod
    def view(reminder, task):
        return ReminderView(
            id=reminder.id, task_id=task.id, space_id=task.space_id, task_title=task.title,
            local_time=reminder.local_time, timezone=reminder.timezone,
            scheduled_at=reminder.scheduled_at, expires_at=reminder.expires_at,
            status=reminder.status, reason=reminder.reason, source_changed=reminder.source_version != task.version,
            acknowledged_at=reminder.acknowledged_at, version=str(reminder.version), series_id=reminder.series_id,
            occurrence_date=reminder.occurrence_date, follow_up_of=reminder.follow_up_of, snooze_count=reminder.snooze_count,
        )

    def record(self, database, reminder, action, user_id=None):
        identifier = str(uuid4())
        database.add(ReminderEvent(
            id=identifier, reminder_id=reminder.id, actor_kind="user" if user_id else "scheduler",
            actor_account_id=user_id, action=action, created_at=self.clock(),
        ))
        if user_id:
            database.add(OutboxEvent(id=identifier, event_type=action, actor_id=user_id, aggregate_id=reminder.id, schema_version=1, created_at=self.clock()))

    def create(self, token, body, key):
        try:
            claims = PreviewClaims.model_validate_json(self.security.open(body.preview_token))
        except (InvalidToken, ValueError, TypeError):
            raise DomainError(400, "PREVIEW_INVALID", "Review a new reminder preview.") from None
        with self.sessions.begin() as database:
            return self.create_reviewed(database, token, claims, key, self.security.digest("reminder.create", body.preview_token))

    def create_reviewed(self, database, token, claims, key, digest):
        caller, task, member = self.task_context(database, token, str(claims.task_id), lock=True)
        if str(claims.account_id) != caller.id or str(claims.space_id) != task.space_id or str(claims.admission_id) != member.admission_id:
            raise DomainError(400, "PREVIEW_INVALID", "Review a new reminder preview.")
        existing = database.scalar(select(Reminder).where(Reminder.account_id == caller.id, Reminder.request_key == key))
        if existing:
            row = database.execute(self.visible(caller.id).where(Reminder.id == existing.id)).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Reminder not found.")
            if existing.request_digest != digest:
                raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed reminder request.")
            return self.view(row[0], row[1])
        now = self.clock()
        if claims.expires_at <= now or claims.scheduled_at <= now:
            raise DomainError(410, "PREVIEW_EXPIRED", "Review a new future reminder time.")
        self.require_open(task)
        preference = self.preference(database, caller.id, create=True)
        if not preference.in_app_reminders_enabled or preference.generation != claims.preference_generation:
            raise DomainError(409, "PREFERENCES_CHANGED", "Review reminder preferences and request a new preview.")
        if task.version != claims.source_version:
            raise DomainError(409, "TASK_CHANGED", "The task changed. Review a new reminder preview.")
        if claims.dispatch_expires_at != claims.scheduled_at + CATCHUP_WINDOW:
            raise DomainError(409, "DELIVERY_POLICY_CHANGED", "The delivery window changed. Review a new preview.")
        if claims.scheduled_at not in dict(local_candidates(claims.local_time, claims.timezone)):
            raise DomainError(409, "TIMEZONE_CHANGED", "Timezone rules changed. Review a new preview.")
        plain = (Reminder.series_id.is_(None), Reminder.follow_up_of.is_(None))
        pending = database.scalar(select(Reminder.id).where(Reminder.account_id == caller.id, Reminder.task_id == task.id, Reminder.status == "scheduled", *plain))
        if pending:
            raise DomainError(409, "REMINDER_ALREADY_SCHEDULED", "Cancel the pending reminder before scheduling another.")
        repeating = database.scalar(select(ReminderSeries.id).where(
            ReminderSeries.account_id == caller.id, ReminderSeries.task_id == task.id, ReminderSeries.status.in_(("active", "paused")),
        ))
        if repeating:
            raise DomainError(409, "REMINDER_ALREADY_SCHEDULED", "Cancel this task's repeating reminder before scheduling another.")
        # Series occurrences and snoozes have their own bounds; this limit counts plain reminders as before.
        count = database.scalar(select(func.count()).select_from(Reminder).where(Reminder.account_id == caller.id, *plain))
        if count >= MAX_REMINDERS_PER_ACCOUNT:
            raise DomainError(409, "REMINDER_LIMIT_REACHED", "The local reminder limit was reached.")
        self.identity.authenticate(database, token, lock=True)
        if claims.expires_at <= self.clock() or claims.scheduled_at <= self.clock():
            raise DomainError(410, "PREVIEW_EXPIRED", "Review a new future reminder time.")
        reminder = Reminder(
            id=str(uuid4()), task_id=task.id, space_id=task.space_id, account_id=caller.id,
            admission_id=member.admission_id, source_version=task.version,
            preference_generation=preference.generation, request_key=key, request_digest=digest,
            local_time=claims.local_time, timezone=claims.timezone, scheduled_at=claims.scheduled_at,
            expires_at=claims.dispatch_expires_at, created_at=self.clock(), status="scheduled", version=1,
        )
        database.add(reminder)
        database.flush()
        self.record(database, reminder, "reminder.scheduled", caller.id)
        return self.view(reminder, task)

    def cursor(self, value, kind, account_id, task_id=None):
        if value is None:
            return None
        try:
            cursor = ReminderCursor.model_validate_json(self.security.open(value))
        except (InvalidToken, ValueError, TypeError):
            raise DomainError(400, "CURSOR_INVALID", "Reload this list.") from None
        if cursor.kind != kind or str(cursor.account_id) != account_id or (str(cursor.task_id) if cursor.task_id else None) != task_id:
            raise DomainError(400, "CURSOR_INVALID", "Reload this list.")
        if cursor.expires_at <= self.clock():
            raise DomainError(410, "CURSOR_EXPIRED", "Reload this list.")
        return str(cursor.after_id)

    def pagination(self, has_more, last_id, kind, account_id, task_id=None):
        cursor = None
        if has_more:
            cursor = self.security.seal(ReminderCursor(kind=kind, account_id=account_id, task_id=task_id, after_id=last_id, expires_at=self.clock() + timedelta(minutes=15)).model_dump_json())
        return Pagination(next_cursor=cursor, has_more=has_more)

    def list_reminders(self, token, limit, cursor=None, task_id=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            if task_id:
                self.task_context(database, token, task_id)
            statement = self.visible(caller.id)
            if task_id:
                statement = statement.where(Reminder.task_id == task_id)
            after = self.cursor(cursor, "reminders", caller.id, task_id)
            if after:
                statement = statement.where(Reminder.id > after)
            rows = database.execute(statement.order_by(Reminder.id).limit(limit + 1)).all()
            page = rows[:limit]
            return [self.view(row[0], row[1]) for row in page], self.pagination(len(rows) > limit, page[-1][0].id if page else None, "reminders", caller.id, task_id)

    def lock_visible(self, database, token, identifier):
        caller, _session = self.identity.authenticate(database, token)
        candidate = database.get(Reminder, identifier)
        if candidate is None or candidate.account_id != caller.id:
            raise DomainError(404, "NOT_FOUND", "Reminder not found.")
        caller, task, _member = self.task_context(database, token, candidate.task_id, lock=True)
        row = database.execute(self.visible(caller.id).where(Reminder.id == identifier).with_for_update(of=Reminder)).first()
        if row is None:
            raise DomainError(404, "NOT_FOUND", "Reminder not found.")
        self.identity.authenticate(database, token, lock=True)
        return caller, row[0], task

    def cancel(self, token, identifier):
        with self.sessions.begin() as database:
            caller, reminder, task = self.lock_visible(database, token, identifier)
            if reminder.series_id and reminder.follow_up_of is None:
                raise DomainError(409, "USE_SERIES_ACTIONS", "Skip or cancel this through its repeating reminder.")
            if reminder.status == "available":
                raise DomainError(409, "REMINDER_ALREADY_AVAILABLE", "This reminder is already in your inbox.")
            if reminder.status == "scheduled":
                reminder.status = "cancelled"
                reminder.reason = None
                reminder.next_attempt_at = None
                reminder.version += 1
                self.record(database, reminder, "reminder.cancelled", caller.id)
            return self.view(reminder, task)

    def dispatch(self, identifier):
        if not self.identity.settings.reminder_dispatch_enabled:
            return "paused"
        with self.sessions.begin() as database:
            database.execute(text("SET LOCAL lock_timeout = '2s'"))
            database.execute(text("SET LOCAL statement_timeout = '5s'"))
            candidate = database.get(Reminder, identifier)
            if candidate is None:
                return "missing"
            owner = database.scalar(select(User).where(User.id == candidate.account_id).with_for_update(skip_locked=True).execution_options(populate_existing=True))
            if owner is None:
                return "busy"
            database.scalar(select(Space).where(Space.id == candidate.space_id).with_for_update())
            task = database.scalar(select(Task).where(Task.id == candidate.task_id).with_for_update().execution_options(populate_existing=True))
            series = None
            if candidate.series_id and candidate.follow_up_of is None:
                series = database.scalar(select(ReminderSeries).where(ReminderSeries.id == candidate.series_id).with_for_update().execution_options(populate_existing=True))
            reminder = database.scalar(select(Reminder).where(Reminder.id == identifier).with_for_update().execution_options(populate_existing=True))
            now = self.clock()
            if reminder.status != "scheduled" or reminder.scheduled_at > now:
                return "unchanged"
            if reminder.next_attempt_at is not None and reminder.next_attempt_at > now:
                return "deferred"
            if series is not None and series.status != "active":
                # Pausing or cancelling a series settles its occurrence in the same transaction; this only guards a stale row.
                reminder.status, reminder.reason, reminder.next_attempt_at = "cancelled", f"series_{series.status}", None
                reminder.version += 1
                self.record(database, reminder, "reminder.cancelled")
                return "cancelled"
            row = database.execute(self.visible(owner.id).where(Reminder.id == identifier).with_for_update(of=(TaskAccess, SpaceMembership))).first()
            preference = self.preference(database, owner.id)
            reason = None
            if owner.status != "active":
                reason = "account_inactive"
            elif row is None:
                reason = "access_lost"
            elif not preference.in_app_reminders_enabled or preference.generation != reminder.preference_generation:
                reason = "preference_revoked"
            elif task.status not in ("open", "in_progress"):
                reason = "task_closed"
            elif task.version != reminder.source_version:
                reason = "task_changed"
            now = self.clock()
            if not self.identity.settings.reminder_dispatch_enabled:
                return "paused"
            if reminder.scheduled_at > now:
                return "unchanged"
            if reason:
                reminder.status = "suppressed"
                reminder.reason = reason
            elif reminder.expires_at <= now:
                reminder.status = "expired"
                reminder.reason = "dispatch_expired"
            else:
                database.add(InAppNotification(id=str(uuid4()), reminder_id=reminder.id, account_id=owner.id, created_at=now))
                signal(database, "notifications", [owner.id], reason="delivered")
                reminder.status = "available"
                reminder.reason = None
            reminder.next_attempt_at = None
            reminder.version += 1
            self.record(database, reminder, f"reminder.{reminder.status}")
            if series is not None:
                self.series.after_occurrence(database, series, reminder, now)
            return reminder.status

    def record_dispatch_failure(self, identifier):
        with self.sessions.begin() as database:
            database.execute(text("SET LOCAL lock_timeout = '2s'"))
            database.execute(text("SET LOCAL statement_timeout = '5s'"))
            candidate = database.get(Reminder, identifier)
            series = None
            if candidate is not None and candidate.series_id and candidate.follow_up_of is None:
                series = database.scalar(
                    select(ReminderSeries).where(ReminderSeries.id == candidate.series_id).with_for_update()
                    .execution_options(populate_existing=True)
                )
            reminder = database.scalar(
                select(Reminder).where(Reminder.id == identifier).with_for_update()
                .execution_options(populate_existing=True)
            )
            if reminder is None or reminder.status != "scheduled":
                return "unchanged"
            now = self.clock()
            if reminder.next_attempt_at is not None and reminder.next_attempt_at > now:
                return "deferred"
            reminder.dispatch_attempts += 1
            reminder.last_failure_at = now
            reminder.version += 1
            if reminder.expires_at <= now:
                reminder.status = "expired"
                reminder.reason = "dispatch_expired"
                reminder.next_attempt_at = None
            elif reminder.dispatch_attempts >= MAX_DISPATCH_ATTEMPTS:
                reminder.status = "failed"
                reminder.reason = "dispatch_failed"
                reminder.next_attempt_at = None
            else:
                reminder.reason = "dispatch_retry"
                reminder.next_attempt_at = now + timedelta(seconds=min(300, 5 * 2 ** (reminder.dispatch_attempts - 1)))
            if series is not None and series.status == "active" and reminder.status in ("expired", "failed"):
                self.series.after_occurrence(database, series, reminder, now)
            return "retry_scheduled" if reminder.status == "scheduled" else reminder.status

    def dispatch_due(self, limit=20):
        if not 1 <= limit <= 100:
            raise ValueError("Dispatch batch must be between 1 and 100.")
        if not self.identity.settings.reminder_dispatch_enabled:
            return {"paused": 1}
        # Oldest first. A reminder whose account is locked stays due and does not use a place in this pass, so locked
        # accounts cannot hold back everyone else; the rest of that account's reminders wait too, keeping their order.
        results, busy, handled, after = {}, set(), 0, None
        for _page in range(DISPATCH_SCAN_PAGES):
            with self.sessions() as database:
                now = self.clock()
                statement = select(Reminder.id, Reminder.account_id, Reminder.scheduled_at).where(
                    Reminder.status == "scheduled", Reminder.scheduled_at <= now,
                    or_(Reminder.next_attempt_at.is_(None), Reminder.next_attempt_at <= now),
                )
                if after is not None:
                    statement = statement.where(or_(
                        Reminder.scheduled_at > after[0], and_(Reminder.scheduled_at == after[0], Reminder.id > after[1]),
                    ))
                rows = database.execute(statement.order_by(Reminder.scheduled_at, Reminder.id).limit(limit)).all()
            for identifier, account_id, scheduled_at in rows:
                after = (scheduled_at, identifier)
                if account_id in busy:
                    continue
                try:
                    outcome = self.dispatch(identifier)
                except SQLAlchemyError:
                    try:
                        outcome = self.record_dispatch_failure(identifier)
                    except SQLAlchemyError:
                        outcome = "database_unavailable"
                results[outcome] = results.get(outcome, 0) + 1
                if outcome == "busy":
                    busy.add(account_id)
                    continue
                handled += 1
                if handled >= limit:
                    return results
            if len(rows) < limit:
                break
        return results