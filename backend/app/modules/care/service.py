import json
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from cryptography.fernet import InvalidToken
from sqlalchemy import func, or_, select

from app.errors import DomainError
from app.modules.care.models import CareAudit, CareCommand, CareDoseReport, CareInstruction
from app.modules.care.schemas import (
    CareDayInstruction,
    CareDayView,
    CareInstructionView,
    CareOccurrenceView,
    CareReportView,
    OmittedCareTime,
)
from app.modules.identity.models import OutboxEvent

MAX_ACTIVE = 30
MAX_TOTAL = 500
DAILY_CREATIONS = 20
STOPPED_LIST = 20
DAY_INSTRUCTIONS = 60
EARLY_REPORT = timedelta(hours=1)
REPORT_WINDOW = timedelta(days=7)
DAY_RANGE = 31
BACKDATED_START = 30
FUTURE_START = 366
LONGEST_COURSE = 3660
CONTENT = ("medicine_name", "strength", "form", "dose", "instructions")
# The earliest instant of any local date is 14 hours before its UTC midnight. One more hour covers early reports.
DAY_LEAD = timedelta(hours=15)


def resolve(day, wall_time, zone):
    """Map a daily wall time to one instant. Gap times move forward by the gap; repeated times use the first."""
    hour, minute = (int(part) for part in wall_time.split(":"))
    wall = datetime.combine(day, time(hour, minute))
    instant = wall.replace(tzinfo=zone, fold=0).astimezone(timezone.utc)
    shown = instant.astimezone(zone)
    if shown.replace(tzinfo=None) != wall:
        return instant, shown, "shifted_forward"
    later = wall.replace(tzinfo=zone, fold=1).astimezone(timezone.utc)
    return instant, shown, "none" if later == instant else "repeated_time_first"


def not_found():
    return DomainError(404, "NOT_FOUND", "Care instruction not found.")


class CareService:
    """Subject-only medicine instructions and self-reports. No caregiver, owner or administrator path exists."""

    def __init__(self, identity):
        self.identity = identity
        self.sessions = identity.sessions
        self.security = identity.security
        self.clock = identity.clock

    def payload(self, instruction):
        try:
            return json.loads(self.security.open(instruction.payload_cipher))
        except InvalidToken as error:
            raise DomainError(503, "CARE_UNAVAILABLE", "Care records are unavailable.") from error

    def view(self, instruction):
        view = CareInstructionView(
            id=instruction.id, **self.payload(instruction), source=instruction.source, timezone=instruction.timezone,
            times=list(instruction.times), start_date=instruction.start_date, end_date=instruction.end_date,
            status=instruction.status, version=instruction.version, confirmed_by_account_id=instruction.confirmed_by_id,
            confirmed_at=instruction.confirmed_at, created_at=instruction.created_at, stopped_at=instruction.stopped_at, etag="",
        )
        view.etag = '"' + self.security.digest("care.instruction.view", instruction.account_id, view.model_dump_json()) + '"'
        return view

    @staticmethod
    def owned(database, account_id, instruction_id, lock=False):
        statement = select(CareInstruction).where(CareInstruction.id == instruction_id, CareInstruction.account_id == account_id)
        if lock:
            statement = statement.with_for_update()
        instruction = database.scalar(statement)
        if instruction is None:
            raise not_found()
        return instruction

    @staticmethod
    def occurrences(instruction, day, reported):
        if day < instruction.start_date or (instruction.end_date is not None and day > instruction.end_date):
            return [], []
        zone = ZoneInfo(instruction.timezone)
        # Real wall times claim their instants first, so a shifted gap time never duplicates another prompt.
        candidates = sorted(
            ((wall, *resolve(day, wall, zone)) for wall in instruction.times),
            key=lambda item: (item[3] == "shifted_forward", item[0]),
        )
        kept, omitted, moments = [], [], {}
        for wall, instant, shown, change in candidates:
            if instruction.stopped_at is not None and instant >= instruction.stopped_at and wall not in reported:
                continue
            if instant in moments:
                omitted.append(OmittedCareTime(instruction_id=instruction.id, local_time=wall, same_moment_as=moments[instant]))
                continue
            moments[instant] = wall
            kept.append((wall, instant, shown, change))
        return sorted(kept, key=lambda item: item[1]), omitted

    def occurrence(self, instruction, day, wall, instant, shown, change, report, now):
        view = CareOccurrenceView(
            instruction_id=instruction.id, local_date=day, local_time=wall, display_time=shown.strftime("%H:%M"),
            timezone=instruction.timezone, scheduled_at=instant, clock_change=change,
            report=None if report is None else CareReportView(
                outcome=report.outcome, revision=report.revision, reported_at=report.reported_at, updated_at=report.updated_at,
            ),
            can_report=instant - EARLY_REPORT <= now <= instant + REPORT_WINDOW, etag="",
        )
        view.etag = '"' + self.security.digest(
            "care.occurrence", instruction.account_id, instruction.id, str(instruction.version), day.isoformat(), wall,
            report.outcome if report else "", str(report.revision) if report else "0",
        ) + '"'
        return view

    def find_occurrence(self, database, instruction, day, wall, now):
        report = database.scalar(select(CareDoseReport).where(
            CareDoseReport.instruction_id == instruction.id, CareDoseReport.local_date == day, CareDoseReport.local_time == wall,
        ))
        kept, _omitted = self.occurrences(instruction, day, {wall} if report else set())
        for item in kept:
            if item[0] == wall:
                return self.occurrence(instruction, day, *item, report, now), report, item[1]
        raise DomainError(404, "NOT_FOUND", "This dose time is not scheduled.")

    def record(self, database, account_id, instruction_id, action):
        identifier = str(uuid4())
        now = self.clock()
        database.add(CareAudit(id=identifier, account_id=account_id, instruction_id=instruction_id, action=action, created_at=now))
        database.add(OutboxEvent(
            id=identifier, event_type=action, actor_id=account_id, aggregate_id=instruction_id, schema_version=1, created_at=now,
        ))
        return identifier

    def list_instructions(self, token, status):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            statement = select(CareInstruction).where(CareInstruction.account_id == user.id, CareInstruction.status == status)
            if status == "active":
                statement = statement.order_by(CareInstruction.created_at, CareInstruction.id).limit(MAX_ACTIVE)
            else:
                statement = statement.order_by(CareInstruction.stopped_at.desc(), CareInstruction.id).limit(STOPPED_LIST)
            return [self.view(instruction) for instruction in database.scalars(statement)]

    def read(self, token, instruction_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            return self.view(self.owned(database, user.id, instruction_id))

    def create(self, token, body, key):
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token, lock=True)
            digest = self.security.digest("care.create", body.model_dump_json())
            receipt = database.get(CareCommand, (user.id, key))
            if receipt is not None:
                if receipt.operation != "create" or receipt.input_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for changed instructions.")
                return self.view(database.get(CareInstruction, receipt.target_id))
            now = self.clock()
            today = now.astimezone(ZoneInfo(body.timezone)).date()
            if not today - timedelta(days=BACKDATED_START) <= body.start_date <= today + timedelta(days=FUTURE_START):
                raise DomainError(422, "START_DATE_OUT_OF_RANGE", "Choose a first day from 30 days ago to one year ahead.")
            if body.end_date is not None and (body.end_date - body.start_date).days >= LONGEST_COURSE:
                raise DomainError(422, "END_DATE_OUT_OF_RANGE", "Choose a last day within ten years of the first day.")
            active, total, recent = database.execute(select(
                func.count().filter(CareInstruction.status == "active"),
                func.count(),
                func.count().filter(CareInstruction.created_at > now - timedelta(days=1)),
            ).where(CareInstruction.account_id == user.id)).one()
            if recent >= DAILY_CREATIONS:
                raise DomainError(429, "RATE_LIMITED", "Too many care instructions were added today. Try again later.")
            if active >= MAX_ACTIVE or total >= MAX_TOTAL:
                raise DomainError(409, "CARE_LIMIT_REACHED", "The local care instruction limit was reached.")
            content = {name: getattr(body, name) for name in CONTENT}
            instruction = CareInstruction(
                id=str(uuid4()), account_id=user.id, confirmed_by_id=user.id,
                payload_cipher=self.security.seal(json.dumps(content, ensure_ascii=False, separators=(",", ":"))),
                source=body.source, timezone=body.timezone, times=list(body.times), start_date=body.start_date,
                end_date=body.end_date, status="active", version=1, confirmed_at=now, created_at=now, stopped_at=None,
            )
            database.add(instruction)
            database.flush()
            audit_id = self.record(database, user.id, instruction.id, "care.instruction_created")
            database.add(CareCommand(
                account_id=user.id, request_key=key, operation="create", target_id=instruction.id,
                input_digest=digest, audit_id=audit_id, created_at=now,
            ))
            return self.view(instruction)

    def stop(self, token, instruction_id, key, expected):
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token, lock=True)
            instruction = self.owned(database, user.id, instruction_id, lock=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review this instruction first.")
            digest = self.security.digest("care.stop", instruction_id, expected)
            receipt = database.get(CareCommand, (user.id, key))
            if receipt is not None:
                if receipt.operation != "stop" or receipt.target_id != instruction_id or receipt.input_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed command.")
                return self.view(instruction)
            if expected != self.view(instruction).etag:
                raise DomainError(412, "PRECONDITION_FAILED", "This instruction changed. Reload and review.")
            if instruction.status == "stopped":
                raise DomainError(409, "ALREADY_STOPPED", "This instruction is already stopped.")
            now = self.clock()
            instruction.status = "stopped"
            instruction.stopped_at = now
            instruction.version += 1
            audit_id = self.record(database, user.id, instruction.id, "care.instruction_stopped")
            database.add(CareCommand(
                account_id=user.id, request_key=key, operation="stop", target_id=instruction.id,
                input_digest=digest, audit_id=audit_id, created_at=now,
            ))
            return self.view(instruction)

    def day(self, token, day):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            now = self.clock()
            if abs((day - now.date()).days) > DAY_RANGE:
                raise DomainError(422, "DATE_OUT_OF_RANGE", "Choose a date within 31 days of today.")
            earliest = datetime.combine(day, time(), timezone.utc) - DAY_LEAD
            instructions = database.scalars(select(CareInstruction).where(
                CareInstruction.account_id == user.id, CareInstruction.start_date <= day,
                or_(CareInstruction.end_date.is_(None), CareInstruction.end_date >= day),
                or_(CareInstruction.stopped_at.is_(None), CareInstruction.stopped_at > earliest),
            ).order_by(CareInstruction.created_at, CareInstruction.id).limit(DAY_INSTRUCTIONS + 1)).all()
            if len(instructions) > DAY_INSTRUCTIONS:
                raise DomainError(503, "CARE_DAY_UNAVAILABLE", "Too many instructions overlap this date to show them safely.")
            reports = {}
            if instructions:
                for report in database.scalars(select(CareDoseReport).where(
                    CareDoseReport.account_id == user.id, CareDoseReport.local_date == day,
                    CareDoseReport.instruction_id.in_([instruction.id for instruction in instructions]),
                )):
                    reports[(report.instruction_id, report.local_time)] = report
            summaries, occurrences, omitted = [], [], []
            for instruction in instructions:
                reported = {wall for identifier, wall in reports if identifier == instruction.id}
                kept, skipped = self.occurrences(instruction, day, reported)
                if not kept:
                    continue
                content = self.payload(instruction)
                summaries.append(CareDayInstruction(
                    id=instruction.id, medicine_name=content["medicine_name"], strength=content["strength"],
                    form=content["form"], dose=content["dose"], status=instruction.status,
                ))
                occurrences.extend(
                    self.occurrence(instruction, day, *item, reports.get((instruction.id, item[0])), now) for item in kept
                )
                omitted.extend(skipped)
            occurrences.sort(key=lambda view: (view.scheduled_at, str(view.instruction_id), view.local_time))
            return CareDayView(local_date=day, instructions=summaries, occurrences=occurrences, omitted=omitted)

    def report(self, token, instruction_id, body, key, expected):
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token, lock=True)
            instruction = self.owned(database, user.id, instruction_id, lock=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review this dose first.")
            now = self.clock()
            digest = self.security.digest("care.report", instruction_id, body.model_dump_json(), expected)
            receipt = database.get(CareCommand, (user.id, key))
            if receipt is not None:
                if receipt.operation != "report" or receipt.target_id != instruction_id or receipt.input_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed report.")
                return self.find_occurrence(database, instruction, body.local_date, body.local_time, now)[0]
            current, report, instant = self.find_occurrence(database, instruction, body.local_date, body.local_time, now)
            if expected != current.etag:
                raise DomainError(412, "PRECONDITION_FAILED", "This dose changed. Reload and review.")
            if now < instant - EARLY_REPORT:
                raise DomainError(409, "REPORT_TOO_EARLY", "A dose can be recorded from one hour before its time.")
            if now > instant + REPORT_WINDOW:
                raise DomainError(409, "REPORT_WINDOW_CLOSED", "Doses can be recorded for up to seven days.")
            if report is not None and report.outcome == body.outcome:
                raise DomainError(409, "NO_CHANGES", "This dose already has that report.")
            if report is None:
                database.add(CareDoseReport(
                    id=str(uuid4()), instruction_id=instruction.id, account_id=user.id, reported_by_id=user.id,
                    local_date=body.local_date, local_time=body.local_time, scheduled_at=instant, outcome=body.outcome,
                    revision=1, reported_at=now, updated_at=now,
                ))
                action = "care.dose_reported"
            else:
                report.outcome = body.outcome
                report.revision += 1
                report.updated_at = now
                action = "care.dose_report_corrected"
            audit_id = self.record(database, user.id, instruction.id, action)
            database.flush()
            database.add(CareCommand(
                account_id=user.id, request_key=key, operation="report", target_id=instruction.id,
                input_digest=digest, audit_id=audit_id, created_at=now,
            ))
            return self.find_occurrence(database, instruction, body.local_date, body.local_time, now)[0]
