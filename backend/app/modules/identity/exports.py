import json
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import and_, func, or_, select, update

from app.errors import DomainError
from app.modules.identity.models import AccountExport, AccountSession, SecurityEvent, User
from app.modules.identity.schemas import (
    ArchiveEvent,
    ArchiveInvitation,
    ArchiveMembership,
    ArchiveNotification,
    ArchiveOmission,
    ArchiveOwnershipTransfer,
    ArchiveProfile,
    ArchiveQuietHours,
    ArchiveReminder,
    ArchiveReminderBackup,
    ArchiveReminderRequest,
    ArchiveReminders,
    ArchiveReminderSeries,
    ArchiveSecurity,
    ArchiveSession,
    ArchiveSpaces,
    ArchiveTask,
    ExportArchive,
    ExportView,
)
from app.modules.notifications.models import AlertSetting, InAppNotification, NotificationPreference, ReminderBackup
from app.modules.planning.models import Task
from app.modules.planning.service import TaskService
from app.modules.scheduling.models import Reminder, ReminderRequest, ReminderSeries
from app.modules.scheduling.recurrence import WEEKDAYS
from app.modules.spaces.models import OwnershipTransfer, Space, SpaceInvitation, SpaceMembership

RECENT_SIGN_IN = timedelta(minutes=15)
ARCHIVE_LIFETIME = timedelta(hours=24)
LEASE = timedelta(minutes=5)
MAX_ATTEMPTS = 3
MAX_ARCHIVE_BYTES = 5 * 1024 * 1024
DAILY_REQUESTS = 5
LIST_LIMIT = 10
HISTORY_LIMIT = 1000
LIVE = ("queued", "building", "ready")
SECTIONS = ("profile", "security", "spaces", "tasks", "reminders")
NOTICE = (
    "Selected account data this account could access when the export was built. Family names, tasks and "
    "reminders come only from families you belonged to at that time. Each history holds at most 1,000 entries; "
    "\"omitted\" names any history that held more, with its total. The downloaded file is not encrypted."
)
UNAVAILABLE = {
    "queued": (409, "EXPORT_NOT_READY", "This export is still being prepared."),
    "building": (409, "EXPORT_NOT_READY", "This export is still being prepared."),
    "expired": (410, "EXPORT_EXPIRED", "This export has expired. Request a new one."),
    "outdated": (409, "EXPORT_OUTDATED", "Your access changed after this export was prepared. Request a new one."),
    "cancelled": (409, "EXPORT_UNAVAILABLE", "This export is no longer available. Request a new one."),
    "failed": (409, "EXPORT_UNAVAILABLE", "This export is no longer available. Request a new one."),
}


def current_status(status, expires_at, now):
    return "expired" if status == "pending" and expires_at <= now else status


class ExportService:
    def __init__(self, tasks):
        self.tasks = tasks
        self.identity = tasks.identity
        self.sessions = tasks.sessions
        self.security = tasks.security
        self.clock = tasks.clock

    def request(self, token, body, key):
        with self.sessions.begin() as database:
            user, session = self.identity.authenticate(database, token, lock=True)
            digest = self.security.digest("export.request", user.id, *body.categories)
            existing = database.scalar(
                select(AccountExport).where(AccountExport.account_id == user.id, AccountExport.request_key == key)
            )
            if existing is not None:
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed selection.")
                return self.view(existing, session.id)
            now = self.clock()
            if now - session.created_at > RECENT_SIGN_IN:
                raise DomainError(403, "REAUTHENTICATION_REQUIRED", "Sign in again to export your data.")
            recent = database.scalar(
                select(func.count()).select_from(AccountExport).where(
                    AccountExport.account_id == user.id, AccountExport.created_at > now - timedelta(hours=24)
                )
            )
            if recent >= DAILY_REQUESTS:
                raise DomainError(429, "RATE_LIMITED", "Too many export requests today. Try again later.")
            active = database.scalar(
                select(AccountExport.id).where(
                    AccountExport.account_id == user.id, AccountExport.status.in_(("queued", "building"))
                )
            )
            if active is not None:
                raise DomainError(409, "EXPORT_IN_PROGRESS", "An export is already being prepared.")
            export = AccountExport(
                id=str(uuid4()), account_id=user.id, session_id=session.id, request_key=key, request_digest=digest,
                categories=list(body.categories), status="queued", attempts=0, available_at=now, created_at=now,
                download_count=0,
            )
            database.add(export)
            database.flush()
            self.identity.record(database, user.id, "account.export_requested", export.id)
            return self.view(export, session.id)

    def list_exports(self, token):
        with self.sessions() as database:
            user, session = self.identity.authenticate(database, token)
            exports = database.scalars(
                select(AccountExport)
                .where(AccountExport.account_id == user.id)
                .order_by(AccountExport.created_at.desc(), AccountExport.id)
                .limit(LIST_LIMIT)
            ).all()
            return [self.view(export, session.id) for export in exports]

    def read(self, token, identifier):
        with self.sessions() as database:
            user, session = self.identity.authenticate(database, token)
            return self.view(self.owned(database, user.id, identifier), session.id)

    def cancel(self, token, identifier):
        with self.sessions.begin() as database:
            user, session = self.identity.authenticate(database, token, lock=True)
            export = self.owned(database, user.id, identifier, lock=True)
            if export.status in LIVE:
                self.retire(export, "cancelled", "cancelled")
                export.completed_at = export.completed_at or self.clock()
                self.identity.record(database, user.id, "account.export_cancelled", export.id)
            return self.view(export, session.id)

    def archive(self, token, identifier):
        problem = None
        with self.sessions.begin() as database:
            user, session = self.identity.authenticate(database, token, lock=True)
            export = self.owned(database, user.id, identifier, lock=True)
            if export.session_id != session.id:
                raise DomainError(403, "EXPORT_OTHER_SESSION", "Download this export in the session that requested it.")
            now = self.clock()
            if export.status == "ready" and export.expires_at <= now:
                self.retire(export, "expired", None)
            elif export.status == "ready" and not self.access_holds(database, user.id, export.included_access):
                self.retire(export, "outdated", "access_changed")
            if export.status == "ready":
                text = self.security.open(export.archive_cipher)
                export.download_count += 1
                export.last_downloaded_at = now
                self.identity.record(database, user.id, "account.export_downloaded", export.id)
            else:
                problem = UNAVAILABLE[export.status]
        if problem:
            raise DomainError(*problem)
        return json.loads(text)

    def sweep(self):
        now = self.clock()
        purge = {"archive_cipher": None, "included_access": None, "lease_token": None, "lease_expires_at": None}
        ended = (
            select(AccountSession.id)
            .join(User, User.id == AccountSession.account_id)
            .where(
                AccountSession.id == AccountExport.session_id,
                or_(AccountSession.revoked_at.is_not(None), AccountSession.expires_at <= now, User.status != "active"),
            )
            .correlate(AccountExport)
            .exists()
        )
        with self.sessions.begin() as database:
            expired = database.execute(
                update(AccountExport)
                .where(AccountExport.status == "ready", AccountExport.expires_at <= now)
                .values(status="expired", **purge)
                .execution_options(synchronize_session=False)
            ).rowcount
            cancelled = database.execute(
                update(AccountExport)
                .where(AccountExport.status.in_(LIVE), ended)
                .values(
                    status="cancelled", reason="session_ended",
                    completed_at=func.coalesce(AccountExport.completed_at, now), **purge,
                )
                .execution_options(synchronize_session=False)
            ).rowcount
        return {"expired": expired, "cancelled": cancelled}

    def process_one(self):
        now = self.clock()
        lease = str(uuid4())
        with self.sessions.begin() as database:
            export = database.scalar(
                select(AccountExport)
                .where(or_(
                    and_(AccountExport.status == "queued", AccountExport.available_at <= now),
                    and_(AccountExport.status == "building", AccountExport.lease_expires_at <= now),
                ))
                .order_by(AccountExport.available_at, AccountExport.id)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            if export is None:
                return {"result": "idle"}
            if export.attempts >= MAX_ATTEMPTS:
                self.retire(export, "failed", "unavailable")
                export.completed_at = now
                return {"result": "failed"}
            export.status = "building"
            export.attempts += 1
            export.lease_token = lease
            export.lease_expires_at = now + LEASE
            identifier = export.id
        try:
            outcome = self.build(identifier)
        except Exception as error:  # bounded retries decide the job's fate; the type is kept for the worker log
            return self.finish(identifier, lease, None) | {"error": type(error).__name__}
        return self.finish(identifier, lease, outcome)

    def build(self, identifier):
        with self.sessions() as database:
            database.connection(execution_options={"isolation_level": "REPEATABLE READ", "postgresql_readonly": True})
            export = database.get(AccountExport, identifier)
            user = database.get(User, export.account_id)
            session = database.get(AccountSession, export.session_id)
            now = self.clock()
            if user.status != "active" or session.revoked_at is not None or session.expires_at <= now:
                return {"status": "cancelled", "reason": "session_ended"}
            archive, included = self.collect(database, user, export, now)
        payload = archive.model_dump(mode="json")
        for name in SECTIONS:
            if payload[name] is None:
                del payload[name]
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        size = len(text.encode("utf-8"))
        if size > MAX_ARCHIVE_BYTES:
            return {"status": "failed", "reason": "too_large"}
        return {"status": "ready", "cipher": self.security.seal(text), "size": size, "included": included}

    def finish(self, identifier, lease, outcome):
        now = self.clock()
        with self.sessions.begin() as database:
            export = database.scalar(select(AccountExport).where(AccountExport.id == identifier).with_for_update())
            if export.status != "building" or export.lease_token != lease:
                return {"result": "superseded"}
            if outcome is None:
                if export.attempts >= MAX_ATTEMPTS:
                    self.retire(export, "failed", "unavailable")
                    export.completed_at = now
                    return {"result": "failed"}
                export.status = "queued"
                export.lease_token = None
                export.lease_expires_at = None
                export.available_at = now + timedelta(seconds=10 * 2 ** (export.attempts - 1))
                return {"result": "retry"}
            if outcome["status"] == "ready":
                export.status = "ready"
                export.archive_cipher = outcome["cipher"]
                export.archive_bytes = outcome["size"]
                export.included_access = outcome["included"]
                export.completed_at = now
                export.expires_at = now + ARCHIVE_LIFETIME
                export.lease_token = None
                export.lease_expires_at = None
                return {"result": "ready"}
            self.retire(export, outcome["status"], outcome["reason"])
            export.completed_at = now
            return {"result": outcome["status"]}

    def collect(self, database, user, export, now):
        selected = set(export.categories)
        memberships = database.execute(
            select(SpaceMembership, Space)
            .join(Space, Space.id == SpaceMembership.space_id)
            .where(SpaceMembership.account_id == user.id)
            .order_by(SpaceMembership.joined_at, SpaceMembership.space_id)
        ).tuples().all()
        current = [membership for membership, space in memberships if membership.status == "active" and space.status == "active"]
        visible = []
        if selected & {"tasks", "reminders"}:
            for membership in current:
                visible.extend(database.execute(
                    TaskService.visible_tasks(user.id, membership.space_id).order_by(Task.created_at, Task.id)
                ).tuples().all())
        task_ids = sorted({task.id for task, _member in visible})
        scoped = bool(selected & {"spaces", "tasks", "reminders"})
        included = {
            "admissions": [[membership.space_id, membership.admission_id] for membership in current] if scoped else [],
            "tasks": task_ids,
        }
        sections = {}
        omitted = []
        if "profile" in selected:
            sections["profile"] = ArchiveProfile(
                id=user.id, email=self.security.open(user.email_cipher), display_name=user.display_name,
                timezone=user.timezone, status=user.status, created_at=user.created_at, verified_at=user.verified_at,
            )
        if "security" in selected:
            sections["security"] = self.security_history(database, user.id, omitted)
        if "spaces" in selected:
            sections["spaces"] = self.spaces_history(database, user.id, memberships, now, omitted)
        if "tasks" in selected:
            sections["tasks"] = [self.task(database, task, member, user.id) for task, member in visible]
        if "reminders" in selected:
            sections["reminders"] = self.reminder_history(database, user.id, task_ids, now, omitted)
        archive = ExportArchive(
            export_id=export.id, account_id=user.id, generated_at=now, categories=export.categories, notice=NOTICE,
            omitted=omitted, **sections,
        )
        return archive, included

    @staticmethod
    def history(database, statement, section, kept, omitted):
        rows = database.scalars(statement.limit(HISTORY_LIMIT + 1)).all()
        if len(rows) <= HISTORY_LIMIT:
            return rows
        # The build reads one snapshot, so the total matches the rows that were cut.
        total = database.scalar(select(func.count()).select_from(statement.order_by(None).subquery()))
        omitted.append(ArchiveOmission(section=section, included=HISTORY_LIMIT, total=total, kept=kept))
        return rows[:HISTORY_LIMIT]

    def security_history(self, database, account_id, omitted):
        sessions = self.history(database, (
            select(AccountSession)
            .where(AccountSession.account_id == account_id)
            .order_by(AccountSession.created_at.desc(), AccountSession.id)
        ), "security.sessions", "newest", omitted)
        events = self.history(database, (
            select(SecurityEvent)
            .where(SecurityEvent.account_id == account_id)
            .order_by(SecurityEvent.created_at.desc(), SecurityEvent.id)
        ), "security.events", "newest", omitted)
        return ArchiveSecurity(
            sessions=[
                ArchiveSession(
                    id=session.id, device_name=session.device_name, platform=session.platform,
                    created_at=session.created_at, expires_at=session.expires_at, revoked_at=session.revoked_at,
                )
                for session in sessions
            ],
            events=[
                ArchiveEvent(id=event.id, action=event.action, target_id=event.target_id, created_at=event.created_at)
                for event in events
            ],
        )

    def spaces_history(self, database, account_id, memberships, now, omitted):
        invitations = self.history(database, (
            select(SpaceInvitation)
            .where(or_(SpaceInvitation.recipient_id == account_id, SpaceInvitation.inviter_id == account_id))
            .order_by(SpaceInvitation.created_at, SpaceInvitation.id)
        ), "spaces.invitations", "oldest", omitted)
        transfers = self.history(database, (
            select(OwnershipTransfer)
            .where(or_(OwnershipTransfer.from_account_id == account_id, OwnershipTransfer.to_account_id == account_id))
            .order_by(OwnershipTransfer.created_at, OwnershipTransfer.id)
        ), "spaces.ownership_transfers", "oldest", omitted)
        rows = []
        for membership, space in memberships:
            current = membership.status == "active" and space.status == "active"
            rows.append(ArchiveMembership(
                space_id=membership.space_id, space_name=space.name if current else None, role=membership.role,
                membership_status=membership.status, current=current, joined_at=membership.joined_at,
            ))
        return ArchiveSpaces(
            memberships=rows,
            invitations_received=[self.invitation(row, now) for row in invitations if row.recipient_id == account_id],
            invitations_sent=[self.invitation(row, now) for row in invitations if row.inviter_id == account_id],
            ownership_transfers=[
                ArchiveOwnershipTransfer(
                    id=transfer.id, space_id=transfer.space_id, from_account_id=transfer.from_account_id,
                    to_account_id=transfer.to_account_id, status=current_status(transfer.status, transfer.expires_at, now),
                    created_at=transfer.created_at, expires_at=transfer.expires_at, resolved_at=transfer.resolved_at,
                )
                for transfer in transfers
            ],
        )

    @staticmethod
    def invitation(row, now):
        return ArchiveInvitation(
            id=row.id, space_id=row.space_id, inviter_account_id=row.inviter_id, recipient_account_id=row.recipient_id,
            status=current_status(row.status, row.expires_at, now), created_at=row.created_at,
            expires_at=row.expires_at, resolved_at=row.resolved_at,
        )

    def task(self, database, task, member, account_id):
        view = self.tasks.view(database, task, member)
        return ArchiveTask(
            id=view.id, space_id=view.space_id, title=view.title, description=view.description, due_date=view.due_date,
            status=view.status, created_by_account_id=view.created_by_account_id,
            created_by_me=view.created_by_account_id == account_id,
            assignee_account_id=view.assignee.account_id if view.assignee else None,
            assigned_to_me=view.assignee is not None and view.assignee.account_id == account_id,
            assignee_unavailable=view.assignee_unavailable, completed_by_account_id=view.completed_by_account_id,
            completed_at=view.completed_at, created_at=view.created_at, updated_at=view.updated_at,
        )

    def reminder_history(self, database, account_id, task_ids, now, omitted):
        preference = database.get(NotificationPreference, account_id)
        setting = database.get(AlertSetting, account_id)
        reminders, requests, notifications, series, backups = [], [], [], [], []
        if task_ids:
            backups = self.history(database, (
                select(ReminderBackup)
                .where(
                    ReminderBackup.task_id.in_(task_ids),
                    or_(ReminderBackup.owner_account_id == account_id, ReminderBackup.contact_account_id == account_id),
                )
                .order_by(ReminderBackup.created_at, ReminderBackup.id)
            ), "reminders.backups", "oldest", omitted)
            series = self.history(database, (
                select(ReminderSeries)
                .where(ReminderSeries.account_id == account_id, ReminderSeries.task_id.in_(task_ids))
                .order_by(ReminderSeries.created_at, ReminderSeries.id)
            ), "reminders.series", "oldest", omitted)
            reminders = self.history(database, (
                select(Reminder)
                .where(Reminder.account_id == account_id, Reminder.task_id.in_(task_ids))
                .order_by(Reminder.created_at, Reminder.id)
            ), "reminders.reminders", "oldest", omitted)
            requests = self.history(database, (
                select(ReminderRequest)
                .where(
                    ReminderRequest.task_id.in_(task_ids),
                    or_(ReminderRequest.requested_by_id == account_id, ReminderRequest.recipient_account_id == account_id),
                )
                .order_by(ReminderRequest.created_at, ReminderRequest.id)
            ), "reminders.requests", "oldest", omitted)
            notifications = self.history(database, (
                select(InAppNotification)
                .join(Reminder, and_(Reminder.id == InAppNotification.reminder_id, Reminder.account_id == InAppNotification.account_id))
                .where(InAppNotification.account_id == account_id, Reminder.task_id.in_(task_ids))
                .order_by(InAppNotification.created_at, InAppNotification.id)
            ), "reminders.notifications", "oldest", omitted)
        return ArchiveReminders(
            in_app_reminders_enabled=preference.in_app_reminders_enabled if preference else True,
            reminders=[
                ArchiveReminder(
                    id=row.id, task_id=row.task_id, space_id=row.space_id, local_time=row.local_time,
                    timezone=row.timezone, scheduled_at=row.scheduled_at, expires_at=row.expires_at, status=row.status,
                    reason=row.reason, created_at=row.created_at, acknowledged_at=row.acknowledged_at,
                    series_id=row.series_id, follow_up_of=row.follow_up_of, snooze_count=row.snooze_count,
                )
                for row in reminders
            ],
            requests_sent=[self.reminder_request(row, now) for row in requests if row.requested_by_id == account_id],
            requests_received=[self.reminder_request(row, now) for row in requests if row.recipient_account_id == account_id],
            notifications=[
                ArchiveNotification(id=row.id, reminder_id=row.reminder_id, created_at=row.created_at, read_at=row.read_at)
                for row in notifications
            ],
            series=[
                ArchiveReminderSeries(
                    id=row.id, task_id=row.task_id, space_id=row.space_id, frequency=row.frequency,
                    repeat_every=row.repeat_every,
                    weekdays=[name for index, name in enumerate(WEEKDAYS) if row.weekday_mask & (1 << index)],
                    local_time=row.local_time, timezone=row.timezone, start_date=row.start_date, end_date=row.end_date,
                    clock_change_policy=row.clock_change_policy, status=row.status, reason=row.reason,
                    created_at=row.created_at, updated_at=row.updated_at, replaced_by_id=row.replaced_by_id,
                )
                for row in series
            ],
            quiet_hours=ArchiveQuietHours(start=setting.quiet_start, end=setting.quiet_end) if setting and setting.quiet_start else None,
            backups=[
                ArchiveReminderBackup(
                    id=row.id, task_id=row.task_id, space_id=row.space_id, owner_account_id=row.owner_account_id,
                    contact_account_id=row.contact_account_id, wait_minutes=row.wait_minutes, status=row.status,
                    created_at=row.created_at, responded_at=row.responded_at, ended_at=row.ended_at,
                )
                for row in backups
            ],
        )

    @staticmethod
    def reminder_request(row, now):
        return ArchiveReminderRequest(
            id=row.id, task_id=row.task_id, space_id=row.space_id, requested_by_account_id=row.requested_by_id,
            recipient_account_id=row.recipient_account_id, local_time=row.local_time, timezone=row.timezone,
            scheduled_at=row.scheduled_at, status=current_status(row.status, row.expires_at, now),
            created_at=row.created_at, expires_at=row.expires_at, resolved_at=row.resolved_at,
        )

    def access_holds(self, database, account_id, included):
        admissions = {(space_id, admission_id) for space_id, admission_id in included["admissions"]}
        if admissions:
            current = {
                (row.space_id, row.admission_id)
                for row in database.execute(
                    select(SpaceMembership.space_id, SpaceMembership.admission_id)
                    .join(Space, Space.id == SpaceMembership.space_id)
                    .where(SpaceMembership.account_id == account_id, SpaceMembership.status == "active", Space.status == "active")
                )
            }
            if not admissions <= current:
                return False
        tasks = set(included["tasks"])
        if not tasks:
            return True
        visible = set()
        for space_id, _admission_id in admissions:
            visible.update(
                task.id for task, _member in database.execute(
                    TaskService.visible_tasks(account_id, space_id).where(Task.id.in_(sorted(tasks)))
                ).tuples()
            )
        return tasks <= visible

    def view(self, export, session_id):
        status = export.status
        if status == "ready" and export.expires_at <= self.clock():
            status = "expired"
        return ExportView(
            id=export.id, status=status, reason=export.reason, categories=export.categories,
            created_at=export.created_at, completed_at=export.completed_at, expires_at=export.expires_at,
            size_bytes=export.archive_bytes if status == "ready" else None, requested_here=export.session_id == session_id,
        )

    @staticmethod
    def owned(database, account_id, identifier, lock=False):
        statement = select(AccountExport).where(AccountExport.id == identifier, AccountExport.account_id == account_id)
        if lock:
            statement = statement.with_for_update()
        export = database.scalar(statement)
        if export is None:
            raise DomainError(404, "NOT_FOUND", "Export not found.")
        return export

    @staticmethod
    def retire(export, status, reason):
        export.status = status
        export.reason = reason
        export.archive_cipher = None
        export.included_access = None
        export.lease_token = None
        export.lease_expires_at = None
