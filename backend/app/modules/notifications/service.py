from datetime import timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.notifications.models import InAppNotification
from app.modules.notifications.schemas import NotificationView, PreferencesView
from app.modules.scheduling.models import Reminder, ReminderSeries

SNOOZE_LIMIT = 3
FOLLOW_UP_WINDOW = timedelta(hours=24)


def next_occurrence_at(series_id):
    """When the next occurrence of the same series is due; a snooze must end before it."""
    upcoming = aliased(Reminder)
    return select(upcoming.scheduled_at).where(
        upcoming.series_id == series_id, upcoming.status == "scheduled", upcoming.follow_up_of.is_(None),
    )


class NotificationService:
    def __init__(self, reminders):
        self.reminders = reminders
        self.identity = reminders.identity
        self.sessions = reminders.sessions
        self.security = reminders.security

    @staticmethod
    def view(notification, reminder, task, follow_up=None, next_at=None, enabled=True):
        can_snooze = (
            enabled and reminder.status == "available" and reminder.acknowledged_at is None and follow_up is None
            and reminder.snooze_count < SNOOZE_LIMIT and task.status in ("open", "in_progress")
        )
        return NotificationView(
            id=notification.id, reminder_id=reminder.id, task_id=task.id, space_id=task.space_id, task_title=task.title,
            scheduled_at=reminder.scheduled_at, created_at=notification.created_at,
            read_at=notification.read_at, acknowledged_at=reminder.acknowledged_at, series_id=reminder.series_id,
            snooze_count=reminder.snooze_count,
            snoozed_until=follow_up.scheduled_at if follow_up is not None and follow_up.status == "scheduled" else None,
            can_snooze=can_snooze, snooze_before=next_at,
        )

    def current_view(self, database, account_id, notification, reminder, task):
        follow_up = database.scalar(
            select(Reminder).where(Reminder.follow_up_of == reminder.id).execution_options(populate_existing=True)
        )
        next_at = database.scalar(next_occurrence_at(reminder.series_id)) if reminder.series_id else None
        enabled = self.reminders.preference(database, account_id).in_app_reminders_enabled
        return self.view(notification, reminder, task, follow_up, next_at, enabled)

    def list_notifications(self, token, limit, cursor=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            statement = self.reminders.visible(caller.id).add_columns(InAppNotification).join(InAppNotification, InAppNotification.reminder_id == Reminder.id)
            unread = database.scalar(select(func.count()).select_from(statement.where(InAppNotification.read_at.is_(None)).subquery()))
            after = self.reminders.cursor(cursor, "notifications", caller.id)
            if after:
                statement = statement.where(InAppNotification.id > after)
            follow_up = aliased(Reminder)
            next_at = next_occurrence_at(Reminder.series_id).correlate(Reminder).scalar_subquery()
            statement = statement.add_columns(follow_up, next_at).outerjoin(
                follow_up, and_(follow_up.follow_up_of == Reminder.id, follow_up.account_id == Reminder.account_id),
            )
            rows = database.execute(statement.order_by(InAppNotification.id).limit(limit + 1)).all()
            page = rows[:limit]
            enabled = self.reminders.preference(database, caller.id).in_app_reminders_enabled
            return (
                [self.view(row[3], row[0], row[1], row[4], row[5], enabled) for row in page],
                self.reminders.pagination(len(rows) > limit, page[-1][3].id if page else None, "notifications", caller.id),
                unread,
            )

    def action(self, token, identifier, action):
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token)
            candidate = database.get(InAppNotification, identifier)
            if candidate is None or candidate.account_id != caller.id:
                raise DomainError(404, "NOT_FOUND", "Notification not found.")
            caller, reminder, task = self.reminders.lock_visible(database, token, candidate.reminder_id)
            notification = database.scalar(select(InAppNotification).where(InAppNotification.id == identifier).with_for_update().execution_options(populate_existing=True))
            self.identity.authenticate(database, token, lock=True)
            changed = False
            if action == "read" and notification.read_at is None:
                notification.read_at = self.reminders.clock()
                changed = True
            elif action == "acknowledge" and reminder.acknowledged_at is None:
                reminder.acknowledged_at = self.reminders.clock()
                reminder.version += 1
                changed = True
                self.settle_follow_ups(database, caller, reminder)
            if changed:
                self.reminders.record(database, reminder, f"notification.{action}", caller.id)
            return self.current_view(database, caller.id, notification, reminder, task)

    def settle_follow_ups(self, database, caller, reminder):
        """A snooze chain is one reminder: acknowledging any part acknowledges the delivered parts and stops a waiting one."""

        def lock(statement):
            return database.scalar(statement.with_for_update().execution_options(populate_existing=True))

        root = reminder
        while root.follow_up_of:
            parent = lock(select(Reminder).where(Reminder.id == root.follow_up_of, Reminder.account_id == caller.id))
            if parent is None:
                break
            root = parent
        node = root
        while node is not None:
            if node.id != reminder.id:
                if node.status == "available" and node.acknowledged_at is None:
                    node.acknowledged_at = reminder.acknowledged_at
                    node.version += 1
                    self.reminders.record(database, node, "notification.acknowledge", caller.id)
                elif node.status == "scheduled":
                    node.status, node.reason, node.next_attempt_at = "cancelled", "acknowledged", None
                    node.version += 1
                    self.reminders.record(database, node, "reminder.cancelled", caller.id)
            node = lock(select(Reminder).where(Reminder.follow_up_of == node.id, Reminder.account_id == caller.id))

    def snooze(self, token, identifier, minutes, key):
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token)
            candidate = database.get(InAppNotification, identifier)
            if candidate is None or candidate.account_id != caller.id:
                raise DomainError(404, "NOT_FOUND", "Notification not found.")
            source = database.get(Reminder, candidate.reminder_id)
            caller, task, _member = self.reminders.task_context(database, token, source.task_id, lock=True)
            # Lock order matches the dispatcher: account, Space, task, series, reminder.
            if source.series_id:
                database.scalar(select(ReminderSeries).where(ReminderSeries.id == source.series_id).with_for_update())
            row = database.execute(self.reminders.visible(caller.id).where(Reminder.id == source.id).with_for_update(of=Reminder)).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Notification not found.")
            reminder = row[0]
            notification = database.scalar(select(InAppNotification).where(InAppNotification.id == identifier).with_for_update().execution_options(populate_existing=True))
            self.identity.authenticate(database, token, lock=True)
            digest = self.security.digest("reminder.snooze", identifier, str(minutes))
            existing = database.scalar(select(Reminder).where(Reminder.account_id == caller.id, Reminder.request_key == key))
            if existing is not None:
                if existing.follow_up_of != reminder.id or existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed snooze.")
                return self.current_view(database, caller.id, notification, reminder, task)
            if reminder.status != "available" or reminder.acknowledged_at is not None:
                raise DomainError(409, "SNOOZE_UNAVAILABLE", "Only an unacknowledged reminder in your inbox can be snoozed.")
            if database.scalar(select(Reminder.id).where(Reminder.follow_up_of == reminder.id)):
                raise DomainError(409, "ALREADY_SNOOZED", "This reminder was already snoozed.")
            if reminder.snooze_count >= SNOOZE_LIMIT:
                raise DomainError(409, "SNOOZE_LIMIT_REACHED", "A reminder can be snoozed at most three times.")
            self.reminders.require_open(task)
            preference = self.reminders.preference(database, caller.id, create=True)
            if not preference.in_app_reminders_enabled:
                raise DomainError(409, "REMINDERS_DISABLED", "In-app task reminders are disabled.")
            now = self.reminders.clock()
            due = now + timedelta(minutes=minutes)
            if due.second or due.microsecond:
                due = due.replace(second=0, microsecond=0) + timedelta(minutes=1)
            expires = due + FOLLOW_UP_WINDOW
            next_at = database.scalar(next_occurrence_at(reminder.series_id)) if reminder.series_id else None
            if next_at is not None:
                if due >= next_at:
                    raise DomainError(409, "SNOOZE_TOO_LATE", "That is after this reminder repeats. Choose a shorter snooze.")
                expires = min(expires, next_at)
            follow_up = Reminder(
                id=str(uuid4()), task_id=task.id, space_id=task.space_id, account_id=caller.id,
                admission_id=reminder.admission_id, source_version=task.version, preference_generation=preference.generation,
                request_key=key, request_digest=digest,
                local_time=due.astimezone(ZoneInfo(reminder.timezone)).replace(tzinfo=None), timezone=reminder.timezone,
                scheduled_at=due, expires_at=expires, created_at=now, status="scheduled", version=1,
                series_id=reminder.series_id, occurrence_date=None, follow_up_of=reminder.id, snooze_count=reminder.snooze_count + 1,
            )
            database.add(follow_up)
            database.flush()
            if notification.read_at is None:
                notification.read_at = now
            reminder.version += 1
            self.reminders.record(database, reminder, "reminder.snoozed", caller.id)
            self.reminders.record(database, follow_up, "reminder.scheduled", caller.id)
            return self.view(notification, reminder, task, follow_up, next_at, True)

    @staticmethod
    def preference_etag(account_id, generation):
        return f'"notification-preferences-{account_id}-{generation}"'

    def preferences(self, token, body=None, expected=None):
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token, lock=body is not None)
            preference = self.reminders.preference(database, caller.id, create=body is not None)
            if body is not None:
                if expected is None:
                    raise DomainError(428, "PRECONDITION_REQUIRED", "Reload notification preferences.")
                if expected != self.preference_etag(caller.id, preference.generation):
                    raise DomainError(412, "PRECONDITION_FAILED", "Notification preferences changed. Reload and review.")
                if preference.in_app_reminders_enabled != body.in_app_reminders_enabled:
                    preference.in_app_reminders_enabled = body.in_app_reminders_enabled
                    preference.generation += 1
                    self.identity.record(database, caller.id, "notification_preferences.changed", caller.id)
            return PreferencesView(in_app_reminders_enabled=preference.in_app_reminders_enabled, version=str(preference.generation)), self.preference_etag(caller.id, preference.generation)