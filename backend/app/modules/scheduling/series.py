from datetime import timedelta
from uuid import NAMESPACE_URL, uuid4, uuid5
from zoneinfo import ZoneInfo

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, select

from app.errors import DomainError
from app.modules.identity.models import OutboxEvent
from app.modules.planning.models import Task, TaskAccess
from app.modules.scheduling import recurrence
from app.modules.scheduling.models import Reminder, ReminderSeries, ReminderSeriesCommand, ReminderSeriesEvent
from app.modules.scheduling.schemas import (
    ClockChangeView,
    ReminderRecipient,
    ReminderSeriesCursor,
    ReminderSeriesPreview,
    ReminderSeriesView,
    SeriesOccurrenceView,
    SeriesPreviewClaims,
)
from app.modules.scheduling.service import PREVIEW_LIFETIME, local_candidates
from app.modules.spaces.models import Space, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_OPEN_SERIES_PER_ACCOUNT = 20
MAX_SERIES_PER_ACCOUNT = 100
MAX_COMMANDS_PER_SERIES = 1000
FIRST_DAY_AHEAD = timedelta(days=366)
PREVIEW_OCCURRENCES = 10
PREVIEW_CLOCK_CHANGES = 20
OCCURRENCE_NAMESPACE = uuid5(NAMESPACE_URL, "community-platform:reminder-series-occurrence")
PAST_TENSE = {"pause": "paused", "resume": "resumed", "skip": "skipped", "cancel": "cancelled", "move": "moved"}


def occurrence_key(series_id, day):
    """Stable identity of one occurrence: the same series and local date always give the same key."""
    return str(uuid5(OCCURRENCE_NAMESPACE, f"{series_id}:{day.isoformat()}"))


def rule_of(source, weekdays=None):
    mask = source.weekday_mask if weekdays is None else recurrence.weekday_mask(weekdays)
    return recurrence.Rule(
        frequency=source.frequency, repeat_every=source.repeat_every, weekday_mask=mask, local_time=source.local_time,
        timezone=source.timezone, start_date=source.start_date, end_date=source.end_date,
        clock_change_policy=source.clock_change_policy,
    )


def occurrence_view(occurrence, reminder_id=None):
    return SeriesOccurrenceView(
        reminder_id=reminder_id, local_date=occurrence.local_date, display_time=occurrence.display_time,
        scheduled_at=occurrence.scheduled_at, utc_offset_minutes=occurrence.utc_offset_minutes,
        adjustment=occurrence.adjustment,
    )


class ReminderSeriesService:
    """Repeating personal reminders. The series holds the rule; only the next occurrence exists as a reminder."""

    def __init__(self, reminders):
        self.reminders = reminders
        self.tasks = reminders.tasks
        self.identity = reminders.identity
        self.sessions = reminders.sessions
        self.security = reminders.security
        self.clock = reminders.clock
        reminders.series = self

    def visible(self, account_id):
        return (
            select(ReminderSeries, Task, SpaceMembership)
            .join(Task, and_(Task.id == ReminderSeries.task_id, Task.space_id == ReminderSeries.space_id))
            .join(TaskAccess, and_(
                TaskAccess.task_id == Task.id, TaskAccess.space_id == Task.space_id,
                TaskAccess.account_id == ReminderSeries.account_id, TaskAccess.admission_id == ReminderSeries.admission_id,
            ))
            .join(SpaceMembership, and_(
                SpaceMembership.space_id == ReminderSeries.space_id, SpaceMembership.account_id == ReminderSeries.account_id,
                SpaceMembership.admission_id == ReminderSeries.admission_id,
            ))
            .join(Space, Space.id == ReminderSeries.space_id)
            .where(ReminderSeries.account_id == account_id, SpaceMembership.status == "active", Space.status == "active")
            .execution_options(populate_existing=True)
        )

    @staticmethod
    def pending_statement(series_ids):
        return select(Reminder).where(
            Reminder.series_id.in_(series_ids), Reminder.status == "scheduled", Reminder.follow_up_of.is_(None),
        ).execution_options(populate_existing=True)

    def etag(self, series, task):
        return '"' + self.security.digest(
            "reminder_series.view", series.account_id, series.id, str(series.version), str(task.version), task.title, task.status,
        ) + '"'

    def view(self, series, task, pending=None):
        upcoming = None
        if pending is not None:
            occurrence, _change = recurrence.resolve(rule_of(series), pending.occurrence_date)
            if occurrence is not None and occurrence.scheduled_at == pending.scheduled_at:
                upcoming = occurrence_view(occurrence, pending.id)
            else:
                # The person moved this time, or timezone rules changed after it was fixed; report what is actually scheduled.
                shown = pending.scheduled_at.astimezone(ZoneInfo(series.timezone))
                upcoming = SeriesOccurrenceView(
                    reminder_id=pending.id, local_date=pending.occurrence_date, display_time=shown.strftime("%H:%M"),
                    scheduled_at=pending.scheduled_at, utc_offset_minutes=int(shown.utcoffset().total_seconds() // 60),
                    adjustment="moved" if pending.reason == "moved" else "none",
                )
        return ReminderSeriesView(
            id=series.id, task_id=task.id, space_id=task.space_id, task_title=task.title, task_version=str(task.version),
            source_changed=series.source_version != task.version, frequency=series.frequency,
            repeat_every=series.repeat_every, weekdays=rule_of(series).weekdays, local_time=series.local_time,
            timezone=series.timezone, start_date=series.start_date, end_date=series.end_date,
            clock_change_policy=series.clock_change_policy, status=series.status, reason=series.reason,
            next_occurrence=upcoming, created_at=series.created_at, updated_at=series.updated_at,
            version=str(series.version), etag=self.etag(series, task), replaced_by=series.replaced_by_id,
        )

    def record(self, database, series, action, user_id=None):
        identifier = str(uuid4())
        database.add(ReminderSeriesEvent(
            id=identifier, series_id=series.id, actor_kind="user" if user_id else "scheduler",
            actor_account_id=user_id, action=action, created_at=self.clock(),
        ))
        if user_id:
            database.add(OutboxEvent(
                id=identifier, event_type=action, actor_id=user_id, aggregate_id=series.id, schema_version=1, created_at=self.clock(),
            ))

    @staticmethod
    def expand(rule, now):
        """Every future occurrence in the rule's range, plus the dates where a clock change applies."""
        occurrences, changes, count = [], [], 0
        today = recurrence.today(rule.timezone, now)
        for day, occurrence, change in recurrence.occurrences(rule, rule.start_date, rule.end_date):
            if occurrence is None:
                if day >= today and len(changes) < PREVIEW_CLOCK_CHANGES:
                    changes.append(ClockChangeView(local_date=day, change="skipped"))
                continue
            if occurrence.scheduled_at <= now:
                continue
            count += 1
            if len(occurrences) < PREVIEW_OCCURRENCES:
                occurrences.append(occurrence)
            if change != "none" and len(changes) < PREVIEW_CLOCK_CHANGES:
                changes.append(ClockChangeView(local_date=day, change=change))
        return occurrences, changes, count

    def preview(self, token, body):
        with self.sessions() as database:
            caller, task, member = self.reminders.task_context(database, token, str(body.task_id))
            self.reminders.require_open(task)
            preference = self.reminders.preference(database, caller.id)
            if not preference.in_app_reminders_enabled:
                raise DomainError(409, "REMINDERS_DISABLED", "In-app task reminders are disabled.")
            now = self.clock()
            rule = rule_of(body, body.weekdays)
            today = recurrence.today(rule.timezone, now)
            if not today <= rule.start_date <= today + FIRST_DAY_AHEAD:
                raise DomainError(422, "SERIES_DATES_INVALID", "Choose a first day from today to one year ahead.")
            occurrences, changes, count = self.expand(rule, now)
            if count == 0:
                raise DomainError(422, "SERIES_EMPTY", "No reminder times remain between these dates.")
            replaces = None
            if body.replaces_series_id is not None:
                # Changing a repeating reminder previews its replacement; the old one stays until the change is saved.
                found = database.execute(self.visible(caller.id).where(ReminderSeries.id == str(body.replaces_series_id))).first()
                if found is None or found[0].task_id != task.id:
                    raise DomainError(404, "NOT_FOUND", "Repeating reminder not found.")
                if found[0].status not in ("active", "paused"):
                    raise DomainError(409, "SERIES_ENDED", "This repeating reminder has already ended.")
                replaces = found[0]
            claims = SeriesPreviewClaims(
                kind="task_reminder_series", account_id=caller.id, admission_id=member.admission_id, task_id=task.id,
                space_id=task.space_id, source_version=task.version, preference_generation=preference.generation,
                frequency=rule.frequency, repeat_every=rule.repeat_every, weekdays=rule.weekdays, local_time=rule.local_time,
                timezone=rule.timezone, start_date=rule.start_date, end_date=rule.end_date,
                clock_change_policy=rule.clock_change_policy, first_scheduled_at=occurrences[0].scheduled_at,
                occurrence_count=count, expires_at=now + PREVIEW_LIFETIME,
                replaces_series_id=replaces.id if replaces else None, replaces_version=replaces.version if replaces else None,
            )
            return ReminderSeriesPreview(
                task_id=task.id, task_title=task.title, task_version=str(task.version),
                recipient=ReminderRecipient(account_id=caller.id, display_name=caller.display_name),
                frequency=rule.frequency, repeat_every=rule.repeat_every, weekdays=rule.weekdays, local_time=rule.local_time,
                timezone=rule.timezone, start_date=rule.start_date, end_date=rule.end_date,
                clock_change_policy=rule.clock_change_policy, occurrences=[occurrence_view(item) for item in occurrences],
                occurrence_count=count, clock_changes=changes, preview_token=self.security.seal(claims.model_dump_json()),
                expires_at=claims.expires_at,
            )

    def materialize(self, database, series, occurrence, now, user_id=None):
        reminder = Reminder(
            id=str(uuid4()), task_id=series.task_id, space_id=series.space_id, account_id=series.account_id,
            admission_id=series.admission_id, source_version=series.source_version,
            preference_generation=series.preference_generation, request_key=occurrence_key(series.id, occurrence.local_date),
            request_digest=self.security.digest("reminder_series.occurrence", series.id, occurrence.local_date.isoformat()),
            local_time=occurrence.scheduled_at.astimezone(ZoneInfo(series.timezone)).replace(tzinfo=None),
            timezone=series.timezone, scheduled_at=occurrence.scheduled_at,
            expires_at=recurrence.window_end(rule_of(series), occurrence), created_at=now, status="scheduled", version=1,
            series_id=series.id, occurrence_date=occurrence.local_date, snooze_count=0,
        )
        database.add(reminder)
        database.flush()
        self.reminders.record(database, reminder, "reminder.scheduled", user_id)
        return reminder

    def create(self, token, body, key):
        try:
            claims = SeriesPreviewClaims.model_validate_json(self.security.open(body.preview_token))
        except (InvalidToken, ValueError, TypeError):
            raise DomainError(400, "PREVIEW_INVALID", "Review a new repeating reminder preview.") from None
        if claims.replaces_series_id is not None:
            raise DomainError(400, "PREVIEW_INVALID", "Save this preview as a change to the repeating reminder.")
        digest = self.security.digest("reminder_series.create", body.preview_token)
        with self.sessions.begin() as database:
            caller, task, member = self.reminders.task_context(database, token, str(claims.task_id), lock=True)
            if (str(claims.account_id), str(claims.space_id), str(claims.admission_id)) != (caller.id, task.space_id, member.admission_id):
                raise DomainError(400, "PREVIEW_INVALID", "Review a new repeating reminder preview.")
            existing = database.scalar(select(ReminderSeries).where(ReminderSeries.account_id == caller.id, ReminderSeries.request_key == key))
            if existing:
                row = database.execute(self.visible(caller.id).where(ReminderSeries.id == existing.id)).first()
                if row is None:
                    raise DomainError(404, "NOT_FOUND", "Repeating reminder not found.")
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed repeating reminder.")
                return self.view(row[0], row[1], database.scalar(self.pending_statement([existing.id])))
            now = self.clock()
            if claims.expires_at <= now or claims.first_scheduled_at <= now:
                raise DomainError(410, "PREVIEW_EXPIRED", "Review a new repeating reminder.")
            self.reminders.require_open(task)
            preference = self.reminders.preference(database, caller.id, create=True)
            if not preference.in_app_reminders_enabled or preference.generation != claims.preference_generation:
                raise DomainError(409, "PREFERENCES_CHANGED", "Review reminder preferences and request a new preview.")
            if task.version != claims.source_version:
                raise DomainError(409, "TASK_CHANGED", "The task changed. Review a new repeating reminder.")
            rule = rule_of(claims, claims.weekdays)
            first = recurrence.next_occurrence(rule, rule.start_date - timedelta(days=1), now)
            _occurrences, _changes, count = self.expand(rule, now)
            if first is None or first.scheduled_at != claims.first_scheduled_at or count != claims.occurrence_count:
                raise DomainError(409, "TIMEZONE_CHANGED", "Timezone rules changed. Review a new preview.")
            one_time = database.scalar(select(Reminder.id).where(
                Reminder.account_id == caller.id, Reminder.task_id == task.id, Reminder.status == "scheduled",
                Reminder.series_id.is_(None), Reminder.follow_up_of.is_(None),
            ))
            repeating = database.scalar(select(ReminderSeries.id).where(
                ReminderSeries.account_id == caller.id, ReminderSeries.task_id == task.id,
                ReminderSeries.status.in_(("active", "paused")),
            ))
            if one_time or repeating:
                raise DomainError(409, "REMINDER_ALREADY_SCHEDULED", "Cancel this task's current reminder before adding another.")
            open_count, total = database.execute(select(
                func.count().filter(ReminderSeries.status.in_(("active", "paused"))), func.count(),
            ).where(ReminderSeries.account_id == caller.id)).one()
            if open_count >= MAX_OPEN_SERIES_PER_ACCOUNT or total >= MAX_SERIES_PER_ACCOUNT:
                raise DomainError(409, "SERIES_LIMIT_REACHED", "The local repeating reminder limit was reached.")
            self.identity.authenticate(database, token, lock=True)
            now = self.clock()
            if claims.expires_at <= now or first.scheduled_at <= now:
                raise DomainError(410, "PREVIEW_EXPIRED", "Review a new repeating reminder.")
            series = ReminderSeries(
                id=str(uuid4()), task_id=task.id, space_id=task.space_id, account_id=caller.id,
                admission_id=member.admission_id, source_version=task.version, preference_generation=preference.generation,
                request_key=key, request_digest=digest, frequency=rule.frequency, repeat_every=rule.repeat_every,
                weekday_mask=rule.weekday_mask, local_time=rule.local_time, timezone=rule.timezone,
                start_date=rule.start_date, end_date=rule.end_date, clock_change_policy=rule.clock_change_policy,
                status="active", reason=None, version=1, created_at=now, updated_at=now,
            )
            database.add(series)
            database.flush()
            self.record(database, series, "reminder_series.created", caller.id)
            pending = self.materialize(database, series, first, now, caller.id)
            return self.view(series, task, pending)

    def cursor(self, value, account_id, task_id):
        if value is None:
            return None
        try:
            position = ReminderSeriesCursor.model_validate_json(self.security.open(value))
        except (InvalidToken, ValueError, TypeError):
            raise DomainError(400, "CURSOR_INVALID", "Reload this list.") from None
        if str(position.account_id) != account_id or (str(position.task_id) if position.task_id else None) != task_id:
            raise DomainError(400, "CURSOR_INVALID", "Reload this list.")
        if position.expires_at <= self.clock():
            raise DomainError(410, "CURSOR_EXPIRED", "Reload this list.")
        return str(position.after_id)

    def list_series(self, token, limit, cursor=None, task_id=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            if task_id:
                self.reminders.task_context(database, token, task_id)
            statement = self.visible(caller.id)
            if task_id:
                statement = statement.where(ReminderSeries.task_id == task_id)
            after = self.cursor(cursor, caller.id, task_id)
            if after:
                statement = statement.where(ReminderSeries.id > after)
            rows = database.execute(statement.order_by(ReminderSeries.id).limit(limit + 1)).all()
            page = rows[:limit]
            pending = {item.series_id: item for item in database.scalars(self.pending_statement([row[0].id for row in page]))} if page else {}
            next_cursor = None
            if len(rows) > limit:
                next_cursor = self.security.seal(ReminderSeriesCursor(
                    kind="reminder_series", account_id=caller.id, task_id=task_id, after_id=page[-1][0].id,
                    expires_at=self.clock() + timedelta(minutes=15),
                ).model_dump_json())
            views = [self.view(row[0], row[1], pending.get(row[0].id)) for row in page]
            return views, Pagination(next_cursor=next_cursor, has_more=next_cursor is not None)

    def read(self, token, series_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            row = database.execute(self.visible(caller.id).where(ReminderSeries.id == series_id)).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Repeating reminder not found.")
            return self.view(row[0], row[1], database.scalar(self.pending_statement([series_id])))

    def command(self, token, series_id, operation, key, expected, body=None):
        with self.sessions.begin() as database:
            caller, task, series, pending = self.lock_series(database, token, series_id)
            extra = (body.local_time.isoformat(),) if body is not None else ()
            digest = self.security.digest("reminder_series.command", series_id, operation, expected or "", *extra)
            receipt = database.get(ReminderSeriesCommand, (caller.id, key))
            if receipt is not None:
                if (receipt.series_id, receipt.operation, receipt.input_digest) != (series_id, operation, digest):
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed command.")
                return self.view(series, task, pending)
            self.require_current(database, series, task, expected)
            now = self.clock()
            handler = getattr(self, operation)
            pending = handler(database, caller, series, task, pending, now) if body is None else handler(database, caller, series, task, pending, now, body)
            series.version += 1
            series.updated_at = now
            self.record(database, series, f"reminder_series.{PAST_TENSE[operation]}", caller.id)
            database.add(ReminderSeriesCommand(
                account_id=caller.id, request_key=key, series_id=series_id, operation=operation, input_digest=digest, created_at=now,
            ))
            database.flush()
            return self.view(series, task, pending)

    def lock_series(self, database, token, series_id):
        caller, _session = self.identity.authenticate(database, token)
        candidate = database.get(ReminderSeries, series_id)
        if candidate is None or candidate.account_id != caller.id:
            raise DomainError(404, "NOT_FOUND", "Repeating reminder not found.")
        caller, task, _member = self.reminders.task_context(database, token, candidate.task_id, lock=True)
        row = database.execute(self.visible(caller.id).where(ReminderSeries.id == series_id).with_for_update(of=ReminderSeries)).first()
        if row is None:
            raise DomainError(404, "NOT_FOUND", "Repeating reminder not found.")
        pending = database.scalar(self.pending_statement([series_id]).with_for_update())
        self.identity.authenticate(database, token, lock=True)
        return caller, task, row[0], pending

    def require_current(self, database, series, task, expected):
        if expected is None:
            raise DomainError(428, "PRECONDITION_REQUIRED", "Review this repeating reminder first.")
        if expected != self.etag(series, task):
            raise DomainError(412, "PRECONDITION_FAILED", "This repeating reminder or its task changed. Reload and review.")
        used = database.scalar(select(func.count()).select_from(ReminderSeriesCommand).where(ReminderSeriesCommand.series_id == series.id))
        if used >= MAX_COMMANDS_PER_SERIES:
            raise DomainError(409, "SERIES_COMMAND_LIMIT", "The local change limit for this repeating reminder was reached.")

    def replace_series(self, token, series_id, body, key, expected):
        """Save a changed rule: the old series is cancelled and a new one starts, in one step. History stays with each."""
        try:
            claims = SeriesPreviewClaims.model_validate_json(self.security.open(body.preview_token))
        except (InvalidToken, ValueError, TypeError):
            raise DomainError(400, "PREVIEW_INVALID", "Review a new repeating reminder preview.") from None
        if claims.replaces_series_id is None or str(claims.replaces_series_id) != series_id:
            raise DomainError(400, "PREVIEW_INVALID", "Review a new preview for this repeating reminder.")
        token_digest = self.security.digest("reminder_series.replace", body.preview_token)
        with self.sessions.begin() as database:
            caller, task, old, pending = self.lock_series(database, token, series_id)
            digest = self.security.digest("reminder_series.command", series_id, "replace", expected or "", token_digest)
            receipt = database.get(ReminderSeriesCommand, (caller.id, key))
            if receipt is not None:
                if (receipt.series_id, receipt.operation, receipt.input_digest) != (series_id, "replace", digest):
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed command.")
                row = database.execute(self.visible(caller.id).where(ReminderSeries.id == old.replaced_by_id)).first()
                if row is None:
                    raise DomainError(404, "NOT_FOUND", "Repeating reminder not found.")
                return self.view(row[0], row[1], database.scalar(self.pending_statement([row[0].id])))
            self.require_current(database, old, task, expected)
            member = database.scalar(select(SpaceMembership).where(
                SpaceMembership.space_id == task.space_id, SpaceMembership.account_id == caller.id, SpaceMembership.status == "active",
            ))
            if (str(claims.account_id), str(claims.space_id), str(claims.task_id), str(claims.admission_id)) != (caller.id, task.space_id, task.id, member.admission_id):
                raise DomainError(400, "PREVIEW_INVALID", "Review a new preview for this repeating reminder.")
            if old.status not in ("active", "paused"):
                raise DomainError(409, "SERIES_ENDED", "This repeating reminder has already ended.")
            if claims.replaces_version != old.version:
                raise DomainError(409, "SERIES_CHANGED", "This repeating reminder changed. Review the change again.")
            if database.scalar(select(ReminderSeries.id).where(ReminderSeries.account_id == caller.id, ReminderSeries.request_key == key)):
                raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed command.")
            now = self.clock()
            if claims.expires_at <= now or claims.first_scheduled_at <= now:
                raise DomainError(410, "PREVIEW_EXPIRED", "Review the change again.")
            self.reminders.require_open(task)
            preference = self.reminders.preference(database, caller.id, create=True)
            if not preference.in_app_reminders_enabled or preference.generation != claims.preference_generation:
                raise DomainError(409, "PREFERENCES_CHANGED", "Review reminder preferences and request a new preview.")
            if task.version != claims.source_version:
                raise DomainError(409, "TASK_CHANGED", "The task changed. Review the change again.")
            rule = rule_of(claims, claims.weekdays)
            first = recurrence.next_occurrence(rule, rule.start_date - timedelta(days=1), now)
            _occurrences, _changes, count = self.expand(rule, now)
            if first is None or first.scheduled_at != claims.first_scheduled_at or count != claims.occurrence_count:
                raise DomainError(409, "TIMEZONE_CHANGED", "Timezone rules changed. Review a new preview.")
            total = database.scalar(select(func.count()).select_from(ReminderSeries).where(ReminderSeries.account_id == caller.id))
            if total >= MAX_SERIES_PER_ACCOUNT:
                raise DomainError(409, "SERIES_LIMIT_REACHED", "The local repeating reminder limit was reached.")
            self.stop_waiting(database, caller, old, pending, "series_replaced")
            old.status, old.reason = "cancelled", None
            old.version += 1
            old.updated_at = now
            database.flush()
            series = ReminderSeries(
                id=str(uuid4()), task_id=task.id, space_id=task.space_id, account_id=caller.id,
                admission_id=member.admission_id, source_version=task.version, preference_generation=preference.generation,
                request_key=key, request_digest=token_digest, frequency=rule.frequency, repeat_every=rule.repeat_every,
                weekday_mask=rule.weekday_mask, local_time=rule.local_time, timezone=rule.timezone,
                start_date=rule.start_date, end_date=rule.end_date, clock_change_policy=rule.clock_change_policy,
                status="active", reason=None, version=1, created_at=now, updated_at=now,
            )
            database.add(series)
            database.flush()
            old.replaced_by_id = series.id
            self.record(database, old, "reminder_series.replaced", caller.id)
            self.record(database, series, "reminder_series.created", caller.id)
            database.add(ReminderSeriesCommand(
                account_id=caller.id, request_key=key, series_id=series_id, operation="replace", input_digest=digest, created_at=now,
            ))
            upcoming = self.materialize(database, series, first, now, caller.id)
            database.flush()
            return self.view(series, task, upcoming)

    def stop_occurrence(self, database, reminder, reason, user_id=None):
        reminder.status = "cancelled"
        reminder.reason = reason
        reminder.next_attempt_at = None
        reminder.version += 1
        self.reminders.record(database, reminder, "reminder.skipped" if reason == "skipped" else "reminder.cancelled", user_id)

    def pause(self, database, caller, series, _task, pending, _now):
        if series.status != "active":
            raise DomainError(409, "SERIES_NOT_ACTIVE", "Only an active repeating reminder can be paused.")
        series.status, series.reason = "paused", "by_person"
        if pending is not None:
            self.stop_occurrence(database, pending, "series_paused", caller.id)
        return None

    def resume(self, database, caller, series, task, _pending, now):
        if series.status != "paused":
            raise DomainError(409, "SERIES_NOT_PAUSED", "Only a paused repeating reminder can be resumed.")
        self.reminders.require_open(task)
        preference = self.reminders.preference(database, caller.id)
        if not preference.in_app_reminders_enabled:
            raise DomainError(409, "REMINDERS_DISABLED", "In-app task reminders are disabled.")
        if preference.generation != series.preference_generation:
            raise DomainError(409, "PREFERENCES_CHANGED", "Reminders were turned off after this was set up. Cancel it and add a new one.")
        # Resuming confirms the task as it is now, so later occurrences are checked against this version.
        series.source_version = task.version
        series.status, series.reason = "active", None
        held = database.scalar(select(Reminder).where(
            Reminder.series_id == series.id, Reminder.follow_up_of.is_(None), Reminder.status == "cancelled",
            Reminder.reason == "series_paused", Reminder.scheduled_at > now,
        ).with_for_update().execution_options(populate_existing=True))
        if held is not None:
            held.status, held.reason, held.source_version = "scheduled", None, task.version
            held.version += 1
            self.reminders.record(database, held, "reminder.resumed", caller.id)
            return held
        last = database.scalar(select(func.max(Reminder.occurrence_date)).where(Reminder.series_id == series.id))
        after = max(last, recurrence.today(series.timezone, now) - timedelta(days=1)) if last else series.start_date - timedelta(days=1)
        return self.continue_after(database, series, after, now, caller.id, allow_late=False)

    def skip(self, database, caller, series, _task, pending, now):
        if series.status != "active" or pending is None:
            raise DomainError(409, "NOTHING_TO_SKIP", "There is no upcoming reminder to skip.")
        self.stop_occurrence(database, pending, "skipped", caller.id)
        return self.continue_after(database, series, pending.occurrence_date, now, caller.id, allow_late=False)

    def cancel(self, database, caller, series, _task, pending, _now):
        if series.status not in ("active", "paused"):
            raise DomainError(409, "SERIES_ENDED", "This repeating reminder has already ended.")
        series.status, series.reason = "cancelled", None
        self.stop_waiting(database, caller, series, pending, "series_cancelled")
        return None

    def stop_waiting(self, database, caller, series, pending, reason):
        """Stop the upcoming occurrence and any snoozed follow-up still waiting."""
        if pending is not None:
            self.stop_occurrence(database, pending, reason, caller.id)
        follow_ups = database.scalars(select(Reminder).where(
            Reminder.series_id == series.id, Reminder.follow_up_of.is_not(None), Reminder.status == "scheduled",
        ).with_for_update().execution_options(populate_existing=True)).all()
        for follow_up in follow_ups:
            self.stop_occurrence(database, follow_up, reason, caller.id)

    def move(self, database, caller, series, _task, pending, now, body):
        """Move only the upcoming occurrence to another time on the same day. The rule does not change."""
        if series.status != "active" or pending is None:
            raise DomainError(409, "NOTHING_TO_MOVE", "There is no upcoming reminder to move.")
        wall = body.local_time.replace(second=0, microsecond=0)
        if wall.date() != pending.occurrence_date:
            raise DomainError(422, "MOVE_DAY_INVALID", "Choose a time on the same day as this reminder.")
        instant, _offset = local_candidates(wall, series.timezone)[0]
        if instant <= now:
            raise DomainError(422, "REMINDER_TIME_INVALID", "Choose a future time.")
        if instant == pending.scheduled_at:
            raise DomainError(422, "MOVE_UNCHANGED", "Choose a different time.")
        # A time on the same local day is always before the next occurrence, so the delivery windows never overlap.
        rule = rule_of(series)
        moved = recurrence.Occurrence(pending.occurrence_date, instant, wall.strftime("%H:%M"), 0, "none")
        pending.local_time, pending.scheduled_at = wall, instant
        pending.expires_at = recurrence.window_end(rule, moved)
        pending.reason = "moved"
        pending.version += 1
        self.reminders.record(database, pending, "reminder.moved", caller.id)
        return pending

    def continue_after(self, database, series, after_day, now, user_id=None, allow_late=True):
        upcoming = recurrence.next_occurrence(rule_of(series), after_day, now, allow_late=allow_late)
        if upcoming is None:
            series.status, series.reason = "ended", None
            self.record(database, series, "reminder_series.ended", user_id)
            return None
        return self.materialize(database, series, upcoming, now, user_id)

    def after_occurrence(self, database, series, reminder, now):
        """Called by the dispatcher in the same transaction that settled one occurrence."""
        if reminder.status == "suppressed":
            # A changed or closed task waits for the person's review; lost access, account or permission ends it.
            if reminder.reason in ("task_changed", "task_closed"):
                series.status, series.reason = "paused", reminder.reason
            else:
                series.status, series.reason = "suppressed", reminder.reason
            self.record(database, series, f"reminder_series.{series.status}")
        elif reminder.status in ("available", "expired", "failed"):
            self.continue_after(database, series, reminder.occurrence_date, now)
        series.version += 1
        series.updated_at = now

    def planned(self, database, account_id, space_id, first_day, last_day, display_zone, now):
        """Future occurrences of active series that are not reminders yet, for the calendar. Nothing is stored."""
        rows = database.execute(self.visible(account_id).where(
            ReminderSeries.space_id == space_id, ReminderSeries.status == "active",
        )).all()
        if not rows:
            return []
        pending = {item.series_id: item for item in database.scalars(self.pending_statement([row[0].id for row in rows]))}
        zone = ZoneInfo(display_zone)
        entries = []
        for series, task, _member in rows:
            rule = rule_of(series)
            current = pending.get(series.id)
            after = current.occurrence_date if current else recurrence.today(series.timezone, now) - timedelta(days=1)
            # A series date can fall on the day before or after in the display timezone.
            start = max(after + timedelta(days=1), first_day - timedelta(days=1))
            for day, occurrence, _change in recurrence.occurrences(rule, start, last_day + timedelta(days=1)):
                if occurrence is None or occurrence.scheduled_at <= now:
                    continue
                shown = occurrence.scheduled_at.astimezone(zone).date()
                if first_day <= shown <= last_day:
                    entries.append({
                        "id": occurrence_key(series.id, day), "kind": "planned", "task_id": task.id, "space_id": task.space_id,
                        "title": task.title, "date": shown, "sort_at": occurrence.scheduled_at,
                        "scheduled_at": occurrence.scheduled_at, "timezone": series.timezone, "status": "planned",
                        "source_changed": series.source_version != task.version, "series_id": series.id,
                    })
        return entries
