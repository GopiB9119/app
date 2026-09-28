from sqlalchemy import func, select

from app.errors import DomainError
from app.modules.notifications.models import InAppNotification
from app.modules.notifications.schemas import NotificationView, PreferencesView
from app.modules.scheduling.models import Reminder


class NotificationService:
    def __init__(self, reminders):
        self.reminders = reminders
        self.identity = reminders.identity
        self.sessions = reminders.sessions

    @staticmethod
    def view(notification, reminder, task):
        return NotificationView(
            id=notification.id, reminder_id=reminder.id, task_id=task.id, space_id=task.space_id, task_title=task.title,
            scheduled_at=reminder.scheduled_at, created_at=notification.created_at,
            read_at=notification.read_at, acknowledged_at=reminder.acknowledged_at,
        )

    def list_notifications(self, token, limit, cursor=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            statement = self.reminders.visible(caller.id).add_columns(InAppNotification).join(InAppNotification, InAppNotification.reminder_id == Reminder.id)
            unread = database.scalar(select(func.count()).select_from(statement.where(InAppNotification.read_at.is_(None)).subquery()))
            after = self.reminders.cursor(cursor, "notifications", caller.id)
            if after:
                statement = statement.where(InAppNotification.id > after)
            rows = database.execute(statement.order_by(InAppNotification.id).limit(limit + 1)).all()
            page = rows[:limit]
            return (
                [self.view(row[3], row[0], row[1]) for row in page],
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
            if changed:
                self.reminders.record(database, reminder, f"notification.{action}", caller.id)
            return self.view(notification, reminder, task)

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