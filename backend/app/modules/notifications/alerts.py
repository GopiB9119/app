"""Alerts for the person's own devices, computed when read. Nothing here sends anything outside this system.

The feed brings together unread reminders, a backup person's alert when a reminder goes unanswered, dose times
the person chose to be alerted about, and alerts before Space events. Quiet hours hold back phone alerts only; the
in-app lists are never filtered by them.
"""

import re
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, delete, func, select
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.care.models import CareDoseReport, CareInstruction
from app.modules.events.models import SpaceEvent
from app.modules.identity.models import OutboxEvent, User
from app.modules.notifications.models import AlertDismissal, AlertSetting, CareDoseAlert, EventAlert, InAppNotification, ReminderBackup
from app.modules.notifications.schemas import (
    AlertDismissalView,
    AlertFeed,
    AlertItem,
    BackupCursor,
    BackupPerson,
    CareAlertView,
    EventAlertView,
    QuietHoursView,
    QuietState,
    ReminderBackupView,
)
from app.modules.planning.models import Task, TaskAccess
from app.modules.scheduling.models import Reminder
from app.modules.spaces.models import Space, SpaceMembership
from app.modules.spaces.schemas import Pagination

ALERT_WINDOW = timedelta(hours=24)
DOSE_WINDOW = timedelta(hours=4)
EVENT_GRACE = timedelta(minutes=30)
DISMISSAL_RETENTION = timedelta(days=14)
LONGEST_CHECK = timedelta(hours=24)
SHORTEST_CHECK = timedelta(minutes=1)
DISPATCH_ALLOWANCE = timedelta(minutes=1)
MAX_ALERTS = 50
MAX_DISMISSALS = 500
MAX_OPEN_BACKUPS = 50
MAX_BACKUPS = 200
MAX_ACTIVE_AS_CONTACT = 50
MAX_EVENT_ALERTS = 200
MAX_CARE_ALERTS = 30
UUID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
REFERENCES = {
    "backup": re.compile(rf"{UUID_PATTERN}:{UUID_PATTERN}"),
    "dose": re.compile(rf"{UUID_PATTERN}:\d{{4}}-\d{{2}}-\d{{2}}:([01]\d|2[0-3]):[0-5]\d"),
    "event": re.compile(rf"{UUID_PATTERN}:\d{{1,12}}"),
}


def wall_instant(day, wall, zone):
    """A local clock time as an instant. A skipped time moves forward by the gap; a repeated time uses the first."""
    hour, minute = (int(part) for part in wall.split(":"))
    return datetime.combine(day, time(hour, minute)).replace(tzinfo=zone, fold=0).astimezone(timezone.utc)


def quiet_state(setting, zone_name, now):
    if setting is None or setting.quiet_start is None:
        return QuietState(active=False, until=None)
    zone = ZoneInfo(zone_name)
    local = now.astimezone(zone)
    current, start, end = local.strftime("%H:%M"), setting.quiet_start, setting.quiet_end
    if start < end:
        active, end_day = start <= current < end, local.date()
    else:
        # Overnight, such as 22:00 to 07:00.
        active = current >= start or current < end
        end_day = local.date() + timedelta(days=1) if current >= start else local.date()
    return QuietState(active=active, until=wall_instant(end_day, end, zone) if active else None)


class AlertService:
    def __init__(self, reminders, events, care):
        self.reminders = reminders
        self.tasks = reminders.tasks
        self.events = events
        self.care = care
        self.identity = reminders.identity
        self.sessions = reminders.sessions
        self.security = reminders.security
        self.clock = reminders.clock

    def audit(self, database, actor_id, aggregate_id, action):
        database.add(OutboxEvent(
            id=str(uuid4()), event_type=action, actor_id=actor_id, aggregate_id=aggregate_id, schema_version=1, created_at=self.clock(),
        ))

    # Quiet hours

    @staticmethod
    def quiet_etag(account_id, setting):
        return f'"alert-settings-{account_id}-{setting.version if setting else 0}"'

    @staticmethod
    def quiet_view(caller, setting, now):
        return QuietHoursView(
            start=setting.quiet_start if setting else None, end=setting.quiet_end if setting else None,
            timezone=caller.timezone, quiet=quiet_state(setting, caller.timezone, now),
            version=str(setting.version if setting else 0),
        )

    def quiet_hours(self, token, body=None, expected=None):
        if body is None:
            with self.sessions() as database:
                caller, _session = self.identity.authenticate(database, token)
                setting = database.get(AlertSetting, caller.id)
                return self.quiet_view(caller, setting, self.clock()), self.quiet_etag(caller.id, setting)
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token, lock=True)
            setting = database.get(AlertSetting, caller.id, with_for_update=True, populate_existing=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Reload quiet hours and try again.")
            if expected != self.quiet_etag(caller.id, setting):
                raise DomainError(412, "PRECONDITION_FAILED", "Quiet hours changed on another device. Reload and review.")
            now = self.clock()
            if setting is None:
                setting = AlertSetting(account_id=caller.id, quiet_start=body.start, quiet_end=body.end, version=1, updated_at=now)
                database.add(setting)
            elif (setting.quiet_start, setting.quiet_end) != (body.start, body.end):
                setting.quiet_start, setting.quiet_end = body.start, body.end
                setting.version += 1
                setting.updated_at = now
            database.flush()
            return self.quiet_view(caller, setting, now), self.quiet_etag(caller.id, setting)

    # The feed

    def feed(self, token):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            now = self.clock()
            dismissed = set(database.execute(select(AlertDismissal.kind, AlertDismissal.reference).where(
                AlertDismissal.account_id == caller.id, AlertDismissal.dismissed_at > now - DISMISSAL_RETENTION,
            )).tuples().all())
            items, upcoming = [], []
            self.reminder_items(database, caller, now, items, upcoming)
            self.backup_items(database, caller, now, dismissed, items, upcoming)
            self.dose_items(database, caller, now, dismissed, items, upcoming)
            self.event_items(database, caller, now, dismissed, items, upcoming)
            quiet = quiet_state(database.get(AlertSetting, caller.id), caller.timezone, now)
            if quiet.until is not None:
                upcoming.append(quiet.until)
            items.sort(key=lambda item: (item.due_at, item.id), reverse=True)
            next_check = min([moment for moment in upcoming if moment > now] + [now + LONGEST_CHECK])
            return AlertFeed(
                items=items[:MAX_ALERTS], quiet=quiet, next_check_at=max(next_check, now + SHORTEST_CHECK), generated_at=now,
            )

    def reminder_items(self, database, caller, now, items, upcoming):
        rows = database.execute(
            self.reminders.visible(caller.id).add_columns(InAppNotification)
            .join(InAppNotification, and_(InAppNotification.reminder_id == Reminder.id, InAppNotification.account_id == Reminder.account_id))
            .where(
                Reminder.status == "available", Reminder.acknowledged_at.is_(None), InAppNotification.read_at.is_(None),
                InAppNotification.created_at > now - ALERT_WINDOW,
            )
            .order_by(InAppNotification.created_at.desc(), InAppNotification.id).limit(MAX_ALERTS)
        ).all()
        for _reminder, task, _member, notification in rows:
            items.append(AlertItem(
                id=f"reminder:{notification.id}", kind="reminder", reference=notification.id, title=task.title,
                due_at=notification.created_at, ends_at=notification.created_at + ALERT_WINDOW, space_id=task.space_id, task_id=task.id,
            ))
        later = database.scalar(select(func.min(Reminder.scheduled_at)).where(
            Reminder.account_id == caller.id, Reminder.status == "scheduled", Reminder.scheduled_at > now,
        ))
        if later is not None:
            upcoming.append(later + DISPATCH_ALLOWANCE)

    def shared_task(self, database, account_id, admission_id, space_id, task_id):
        row = database.execute(self.tasks.visible_tasks(account_id, space_id).where(Task.id == task_id)).first()
        return row[0] if row is not None and row[1].admission_id == admission_id else None

    def backup_items(self, database, caller, now, dismissed, items, upcoming):
        arrangements = database.execute(
            select(ReminderBackup, User.display_name).join(User, User.id == ReminderBackup.owner_account_id)
            .where(ReminderBackup.contact_account_id == caller.id, ReminderBackup.status == "active")
            .order_by(ReminderBackup.id).limit(MAX_ACTIVE_AS_CONTACT)
        ).all()
        snoozed = aliased(Reminder)
        for arrangement, owner_name in arrangements:
            # Both people must still see the task, under the admissions they agreed with.
            task = self.shared_task(database, caller.id, arrangement.contact_admission_id, arrangement.space_id, arrangement.task_id)
            if task is None or self.shared_task(
                database, arrangement.owner_account_id, arrangement.owner_admission_id, arrangement.space_id, arrangement.task_id,
            ) is None:
                continue
            wait = timedelta(minutes=arrangement.wait_minutes)
            mine = (
                Reminder.account_id == arrangement.owner_account_id, Reminder.task_id == arrangement.task_id,
                Reminder.admission_id == arrangement.owner_admission_id,
            )
            # Unanswered means delivered, not acknowledged and not snoozed. Only reminders delivered after the agreement count.
            rows = database.execute(
                select(Reminder.id, InAppNotification.created_at)
                .join(InAppNotification, and_(InAppNotification.reminder_id == Reminder.id, InAppNotification.account_id == Reminder.account_id))
                .where(
                    *mine, Reminder.status == "available", Reminder.acknowledged_at.is_(None),
                    InAppNotification.created_at >= arrangement.responded_at, InAppNotification.created_at > now - ALERT_WINDOW,
                    ~select(snoozed.id).where(snoozed.follow_up_of == Reminder.id).exists(),
                )
                .order_by(InAppNotification.created_at, Reminder.id).limit(10)
            ).all()
            for reminder_id, delivered in rows:
                due, reference = delivered + wait, f"{arrangement.id}:{reminder_id}"
                if due > now:
                    upcoming.append(due)
                elif ("backup", reference) not in dismissed:
                    items.append(AlertItem(
                        id=f"backup:{reference}", kind="backup", reference=reference, title=task.title, due_at=due,
                        ends_at=delivered + ALERT_WINDOW, space_id=task.space_id, task_id=task.id, person_name=owner_name,
                    ))
            later = database.scalar(select(func.min(Reminder.scheduled_at)).where(
                *mine, Reminder.status == "scheduled", Reminder.scheduled_at > now,
            ))
            if later is not None:
                upcoming.append(later + wait + DISPATCH_ALLOWANCE)

    def dose_items(self, database, caller, now, dismissed, items, upcoming):
        instructions = database.scalars(
            select(CareInstruction).join(CareDoseAlert, CareDoseAlert.instruction_id == CareInstruction.id)
            .where(CareDoseAlert.account_id == caller.id, CareInstruction.account_id == caller.id)
            .order_by(CareInstruction.id).limit(MAX_CARE_ALERTS)
        ).all()
        for instruction in instructions:
            today = now.astimezone(ZoneInfo(instruction.timezone)).date()
            days = [today - timedelta(days=1), today, today + timedelta(days=1)]
            reported = set(database.execute(select(CareDoseReport.local_date, CareDoseReport.local_time).where(
                CareDoseReport.instruction_id == instruction.id, CareDoseReport.local_date.in_(days),
            )).tuples().all())
            # The same times the care page shows, so an alert never names a time the person cannot report.
            moments = []
            for day in days:
                kept, _omitted = self.care.occurrences(instruction, day, {wall for when, wall in reported if when == day})
                moments.extend((day, wall, instant, shown) for wall, instant, shown, _change in kept)
            moments.sort(key=lambda moment: moment[2])
            title = None
            for index, (day, wall, instant, shown) in enumerate(moments):
                if instant > now:
                    upcoming.append(instant)
                    continue
                following = moments[index + 1][2] if index + 1 < len(moments) else None
                ends = instant + DOSE_WINDOW if following is None else min(instant + DOSE_WINDOW, following)
                reference = f"{instruction.id}:{day.isoformat()}:{wall}"
                if ends <= now or (day, wall) in reported or ("dose", reference) in dismissed:
                    continue
                if title is None:
                    try:
                        title = self.care.payload(instruction)["medicine_name"]
                    except DomainError:
                        title = "Medicine dose"
                items.append(AlertItem(
                    id=f"dose:{reference}", kind="dose", reference=reference, title=title, due_at=instant, ends_at=ends,
                    instruction_id=instruction.id, display_time=shown.strftime("%H:%M"), timezone=instruction.timezone,
                ))

    def event_items(self, database, caller, now, dismissed, items, upcoming):
        rows = database.execute(
            select(EventAlert, SpaceEvent)
            .join(SpaceEvent, SpaceEvent.id == EventAlert.event_id)
            .join(SpaceMembership, and_(
                SpaceMembership.space_id == SpaceEvent.space_id, SpaceMembership.account_id == EventAlert.account_id,
                SpaceMembership.admission_id == EventAlert.admission_id,
            ))
            .join(Space, Space.id == SpaceEvent.space_id)
            .where(
                EventAlert.account_id == caller.id, SpaceMembership.status == "active", Space.status == "active",
                SpaceEvent.status == "scheduled", SpaceEvent.admissions_before >= SpaceMembership.admission_sequence,
                SpaceEvent.starts_at > now - EVENT_GRACE,
            )
            .order_by(SpaceEvent.starts_at, SpaceEvent.id).limit(MAX_EVENT_ALERTS)
        ).all()
        for alert, event in rows:
            opens = event.starts_at - timedelta(minutes=alert.minutes_before)
            if opens > now:
                upcoming.append(opens)
                continue
            # A changed start time is a new alert, even if the old one was set aside.
            reference = f"{event.id}:{int(event.starts_at.timestamp())}"
            if ("event", reference) in dismissed:
                continue
            items.append(AlertItem(
                id=f"event:{reference}", kind="event", reference=reference, title=event.title, due_at=opens,
                ends_at=event.starts_at + EVENT_GRACE, space_id=event.space_id, event_id=event.id,
                display_time=event.starts_at.astimezone(ZoneInfo(event.timezone)).strftime("%H:%M"), timezone=event.timezone,
            ))

    def dismiss(self, token, body):
        if REFERENCES[body.kind].fullmatch(body.reference) is None:
            raise DomainError(422, "ALERT_INVALID", "This alert cannot be set aside.")
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token, lock=True)
            now = self.clock()
            database.execute(delete(AlertDismissal).where(
                AlertDismissal.account_id == caller.id, AlertDismissal.dismissed_at <= now - DISMISSAL_RETENTION,
            ))
            existing = database.get(AlertDismissal, (caller.id, body.kind, body.reference))
            if existing is None:
                count = database.scalar(select(func.count()).select_from(AlertDismissal).where(AlertDismissal.account_id == caller.id))
                if count >= MAX_DISMISSALS:
                    raise DomainError(409, "ALERT_DISMISSAL_LIMIT", "Too many alerts were set aside recently. Try again later.")
                existing = AlertDismissal(account_id=caller.id, kind=body.kind, reference=body.reference, dismissed_at=now)
                database.add(existing)
                database.flush()
            return AlertDismissalView(kind=existing.kind, reference=existing.reference, dismissed_at=existing.dismissed_at)

    # Backup people

    @staticmethod
    def backup_statement(account_id, role):
        person, admission = (
            (ReminderBackup.owner_account_id, ReminderBackup.owner_admission_id) if role == "owner"
            else (ReminderBackup.contact_account_id, ReminderBackup.contact_admission_id)
        )
        return (
            select(ReminderBackup, Task)
            .join(Task, and_(Task.id == ReminderBackup.task_id, Task.space_id == ReminderBackup.space_id))
            .join(TaskAccess, and_(
                TaskAccess.task_id == Task.id, TaskAccess.space_id == Task.space_id,
                TaskAccess.account_id == person, TaskAccess.admission_id == admission,
            ))
            .join(SpaceMembership, and_(
                SpaceMembership.space_id == Task.space_id, SpaceMembership.account_id == person, SpaceMembership.admission_id == admission,
            ))
            .join(Space, Space.id == Task.space_id)
            .where(person == account_id, SpaceMembership.status == "active", Space.status == "active")
            .execution_options(populate_existing=True)
        )

    @staticmethod
    def names(database, backups):
        people = {backup.owner_account_id for backup in backups} | {backup.contact_account_id for backup in backups}
        return dict(database.execute(select(User.id, User.display_name).where(User.id.in_(people))).tuples().all()) if people else {}

    @staticmethod
    def backup_view(backup, task, account_id, names):
        return ReminderBackupView(
            id=backup.id, task_id=task.id, space_id=task.space_id, task_title=task.title,
            role="owner" if backup.owner_account_id == account_id else "contact",
            owner=BackupPerson(account_id=backup.owner_account_id, display_name=names.get(backup.owner_account_id, "")),
            contact=BackupPerson(account_id=backup.contact_account_id, display_name=names.get(backup.contact_account_id, "")),
            wait_minutes=backup.wait_minutes, status=backup.status, created_at=backup.created_at,
            responded_at=backup.responded_at, ended_at=backup.ended_at, version=str(backup.version),
        )

    def contacts(self, token, task_id):
        """People who can see this task and could be asked to be the backup person."""
        with self.sessions() as database:
            caller, task, _member = self.reminders.task_context(database, token, task_id)
            rows = database.execute(
                self.tasks.eligible_members(task.space_id)
                .join(TaskAccess, and_(
                    TaskAccess.task_id == task.id, TaskAccess.space_id == task.space_id,
                    TaskAccess.account_id == SpaceMembership.account_id, TaskAccess.admission_id == SpaceMembership.admission_id,
                ))
                .where(SpaceMembership.account_id != caller.id)
                .order_by(User.display_name, User.id).limit(50)
            ).all()
            return [BackupPerson(account_id=user.id, display_name=user.display_name) for _membership, user in rows]

    def create_backup(self, token, body, key):
        digest = self.security.digest("reminder_backup.create", str(body.task_id), str(body.contact_account_id), str(body.wait_minutes))
        with self.sessions.begin() as database:
            caller, task, member = self.reminders.task_context(database, token, str(body.task_id), lock=True)
            existing = database.scalar(select(ReminderBackup).where(ReminderBackup.owner_account_id == caller.id, ReminderBackup.request_key == key))
            if existing is not None:
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed backup person.")
                row = database.execute(self.backup_statement(caller.id, "owner").where(ReminderBackup.id == existing.id)).first()
                if row is None:
                    raise DomainError(404, "NOT_FOUND", "Backup request not found.")
                return self.backup_view(row[0], row[1], caller.id, self.names(database, [row[0]]))
            contact_id = str(body.contact_account_id)
            if contact_id == caller.id:
                raise DomainError(422, "BACKUP_SELF", "Choose someone else as your backup person.")
            self.reminders.require_open(task)
            contact = database.execute(
                self.tasks.eligible_members(task.space_id)
                .join(TaskAccess, and_(
                    TaskAccess.task_id == task.id, TaskAccess.space_id == task.space_id,
                    TaskAccess.account_id == SpaceMembership.account_id, TaskAccess.admission_id == SpaceMembership.admission_id,
                ))
                .where(SpaceMembership.account_id == contact_id)
            ).first()
            if contact is None:
                raise DomainError(422, "BACKUP_CONTACT_INVALID", "Choose someone who can see this task.")
            current = database.scalar(select(ReminderBackup.id).where(
                ReminderBackup.task_id == task.id, ReminderBackup.owner_account_id == caller.id,
                ReminderBackup.status.in_(("pending", "active")),
            ))
            if current:
                raise DomainError(409, "BACKUP_EXISTS", "Stop the current backup person for this task first.")
            open_count, total = database.execute(select(
                func.count().filter(ReminderBackup.status.in_(("pending", "active"))), func.count(),
            ).where(ReminderBackup.owner_account_id == caller.id)).one()
            if open_count >= MAX_OPEN_BACKUPS or total >= MAX_BACKUPS:
                raise DomainError(409, "BACKUP_LIMIT_REACHED", "The local backup person limit was reached.")
            now = self.clock()
            backup = ReminderBackup(
                id=str(uuid4()), task_id=task.id, space_id=task.space_id, owner_account_id=caller.id,
                owner_admission_id=member.admission_id, contact_account_id=contact_id,
                contact_admission_id=contact[0].admission_id, wait_minutes=body.wait_minutes, status="pending",
                ended_by=None, request_key=key, request_digest=digest, created_at=now, responded_at=None, ended_at=None, version=1,
            )
            database.add(backup)
            database.flush()
            self.audit(database, caller.id, backup.id, "reminder_backup.requested")
            return self.backup_view(backup, task, caller.id, self.names(database, [backup]))

    def list_backups(self, token, role, limit, cursor=None, task_id=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            statement = self.backup_statement(caller.id, role)
            if task_id:
                statement = statement.where(ReminderBackup.task_id == task_id)
            if cursor is not None:
                try:
                    position = BackupCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload this list.") from None
                if (str(position.account_id), position.role, str(position.task_id) if position.task_id else None) != (caller.id, role, task_id):
                    raise DomainError(400, "CURSOR_INVALID", "Reload this list.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload this list.")
                statement = statement.where(ReminderBackup.id > str(position.after_id))
            rows = database.execute(statement.order_by(ReminderBackup.id).limit(limit + 1)).all()
            page = rows[:limit]
            next_cursor = None
            if len(rows) > limit:
                next_cursor = self.security.seal(BackupCursor(
                    kind="reminder_backups", account_id=caller.id, role=role, task_id=task_id, after_id=page[-1][0].id,
                    expires_at=self.clock() + timedelta(minutes=15),
                ).model_dump_json())
            names = self.names(database, [row[0] for row in page])
            return [self.backup_view(row[0], row[1], caller.id, names) for row in page], Pagination(next_cursor=next_cursor, has_more=next_cursor is not None)

    def respond(self, token, backup_id, action):
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token)
            backup = database.scalar(
                select(ReminderBackup).where(ReminderBackup.id == backup_id).with_for_update().execution_options(populate_existing=True)
            )
            if backup is None or caller.id not in (backup.owner_account_id, backup.contact_account_id):
                raise DomainError(404, "NOT_FOUND", "Backup request not found.")
            role = "owner" if backup.owner_account_id == caller.id else "contact"
            row = database.execute(self.backup_statement(caller.id, role).where(ReminderBackup.id == backup_id)).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Backup request not found.")
            task = row[1]
            self.identity.authenticate(database, token, lock=True)
            now = self.clock()
            if action in ("accept", "decline"):
                target = "active" if action == "accept" else "declined"
                if role != "contact":
                    raise DomainError(403, "ACCESS_DENIED", "Only the person who was asked can answer.")
                if backup.status == target:
                    return self.backup_view(backup, task, caller.id, self.names(database, [backup]))
                if backup.status != "pending":
                    raise DomainError(409, "BACKUP_NOT_PENDING", "This request was already answered or withdrawn.")
                if action == "accept":
                    active = database.scalar(select(func.count()).select_from(ReminderBackup).where(
                        ReminderBackup.contact_account_id == caller.id, ReminderBackup.status == "active",
                    ))
                    if active >= MAX_ACTIVE_AS_CONTACT:
                        raise DomainError(409, "BACKUP_LIMIT_REACHED", "The local backup person limit was reached.")
                    if self.shared_task(database, backup.owner_account_id, backup.owner_admission_id, backup.space_id, backup.task_id) is None:
                        raise DomainError(409, "BACKUP_UNAVAILABLE", "This request is no longer available.")
                backup.status, backup.responded_at = target, now
                event = "accepted" if action == "accept" else "declined"
            else:
                if backup.status in ("declined", "cancelled", "ended"):
                    return self.backup_view(backup, task, caller.id, self.names(database, [backup]))
                if role == "contact" and backup.status == "pending":
                    raise DomainError(409, "BACKUP_NOT_ACTIVE", "Decline this request instead.")
                backup.status = "cancelled" if role == "owner" else "ended"
                backup.ended_by, backup.ended_at = role, now
                backup.responded_at = backup.responded_at or now
                event = backup.status
            backup.version += 1
            self.audit(database, caller.id, backup.id, f"reminder_backup.{event}")
            database.flush()
            return self.backup_view(backup, task, caller.id, self.names(database, [backup]))

    # Event and dose alerts

    def event_alert(self, token, event_id, body=None):
        if body is None:
            with self.sessions() as database:
                caller, _session = self.identity.authenticate(database, token)
                self.events.visible(database, event_id, caller.id)
                alert = database.get(EventAlert, (event_id, caller.id))
                return EventAlertView(event_id=event_id, minutes_before=alert.minutes_before if alert else None)
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token, lock=True)
            event, membership = self.events.visible(database, event_id, caller.id)
            alert = database.get(EventAlert, (event_id, caller.id), with_for_update=True, populate_existing=True)
            if body.minutes_before is None:
                if alert is not None:
                    database.delete(alert)
                    database.flush()
                return EventAlertView(event_id=event_id, minutes_before=None)
            if event.status != "scheduled":
                raise DomainError(409, "EVENT_CANCELLED", "This event was cancelled.")
            now = self.clock()
            if alert is None:
                count = database.scalar(select(func.count()).select_from(EventAlert).where(EventAlert.account_id == caller.id))
                if count >= MAX_EVENT_ALERTS:
                    raise DomainError(409, "EVENT_ALERT_LIMIT", "The local event alert limit was reached.")
                alert = EventAlert(event_id=event_id, account_id=caller.id, admission_id=membership.admission_id,
                                   minutes_before=body.minutes_before, updated_at=now)
                database.add(alert)
            else:
                alert.minutes_before, alert.admission_id, alert.updated_at = body.minutes_before, membership.admission_id, now
            database.flush()
            return EventAlertView(event_id=event_id, minutes_before=alert.minutes_before)

    def care_alerts(self, token):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            identifiers = database.scalars(
                select(CareDoseAlert.instruction_id).where(CareDoseAlert.account_id == caller.id).order_by(CareDoseAlert.instruction_id)
            ).all()
            return [CareAlertView(instruction_id=identifier, enabled=True) for identifier in identifiers]

    def set_care_alert(self, token, instruction_id, body):
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token, lock=True)
            instruction = self.care.owned(database, caller.id, instruction_id, lock=True)
            alert = database.get(CareDoseAlert, instruction_id, with_for_update=True, populate_existing=True)
            if not body.enabled:
                if alert is not None:
                    database.delete(alert)
                    database.flush()
                return CareAlertView(instruction_id=instruction_id, enabled=False)
            if instruction.status != "active":
                raise DomainError(409, "CARE_STOPPED", "This instruction was stopped.")
            if alert is None:
                count = database.scalar(select(func.count()).select_from(CareDoseAlert).where(CareDoseAlert.account_id == caller.id))
                if count >= MAX_CARE_ALERTS:
                    raise DomainError(409, "CARE_ALERT_LIMIT", "The local dose alert limit was reached.")
                database.add(CareDoseAlert(instruction_id=instruction_id, account_id=caller.id, created_at=self.clock()))
                database.flush()
            return CareAlertView(instruction_id=instruction_id, enabled=True)
