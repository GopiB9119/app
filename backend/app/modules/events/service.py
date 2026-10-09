from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select

from app.errors import DomainError
from app.modules.discovery.live import announce_history
from app.modules.events.models import SpaceEvent, SpaceEventResponse
from app.modules.events.schemas import AttendeeView, EventCursor, EventDetail, SpaceEventView
from app.modules.identity.models import OutboxEvent, User
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_EVENTS_PER_SPACE = 500
MAX_UPCOMING_PER_SPACE = 100
MAX_EVENT_DURATION = timedelta(days=14)
MAX_EVENT_AHEAD = timedelta(days=731)
CURSOR_MINUTES = 15
# The only changes to an event that a search can show; answers and budgets are not among them.
SEARCHED_ACTIONS = frozenset({"event.created", "event.updated", "event.cancelled"})


def not_found(subject="Event"):
    return DomainError(404, "NOT_FOUND", f"{subject} not found.")


def instant(local, zone_name, label):
    """Convert a wall-clock time in an IANA zone; nonexistent and repeated times need a person's choice."""
    naive = datetime.strptime(local, "%Y-%m-%dT%H:%M")
    zone = ZoneInfo(zone_name)
    earlier = naive.replace(tzinfo=zone, fold=0)
    later = naive.replace(tzinfo=zone, fold=1)
    moment = earlier.astimezone(timezone.utc)
    if moment.astimezone(zone).replace(tzinfo=None) != naive:
        raise DomainError(422, "LOCAL_TIME_SKIPPED", f"The {label} time does not exist in {zone_name} because clocks move forward. Choose another time.")
    if earlier.utcoffset() != later.utcoffset():
        raise DomainError(422, "LOCAL_TIME_REPEATED", f"The {label} time happens twice in {zone_name} because clocks move back. Choose another time.")
    return moment


class EventService:
    """Space events and attendance responses. A response is intent, not proof of attendance."""

    def __init__(self, spaces):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock

    def etag(self, event):
        return f'"{self.security.digest("space.event", event.id, str(event.version))}"'

    @staticmethod
    def require_etag(supplied, expected):
        if not supplied:
            raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current event first.")
        if supplied != expected:
            raise DomainError(412, "EVENT_CHANGED", "This event changed since you reviewed it. Reload to continue.")

    @staticmethod
    def membership(database, space_id, account_id):
        return database.scalar(
            select(SpaceMembership).join(Space, Space.id == SpaceMembership.space_id).where(
                SpaceMembership.space_id == space_id, SpaceMembership.account_id == account_id,
                SpaceMembership.status == "active", Space.status == "active",
            ).execution_options(populate_existing=True)
        )

    def visible(self, database, event_id, account_id, lock=False):
        statement = select(SpaceEvent).where(SpaceEvent.id == event_id)
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        event = database.scalar(statement)
        membership = self.membership(database, event.space_id, account_id) if event else None
        # History starts at the current admission: events created before it stay hidden.
        if event is None or membership is None or event.admissions_before < membership.admission_sequence:
            raise not_found()
        return event, membership

    @staticmethod
    def finish(event):
        return event.ends_at or event.starts_at

    def schedule(self, body, now):
        starts_at = instant(body.local_start, body.timezone, "start")
        ends_at = instant(body.local_end, body.timezone, "end") if body.local_end else None
        if starts_at <= now:
            raise DomainError(422, "EVENT_IN_PAST", "Choose a start time in the future.")
        if starts_at > now + MAX_EVENT_AHEAD:
            raise DomainError(422, "EVENT_TOO_FAR", "Choose a start within the next two years.")
        if ends_at is not None and ends_at <= starts_at:
            raise DomainError(422, "EVENT_END_BEFORE_START", "The end must be after the start.")
        if ends_at is not None and ends_at - starts_at > MAX_EVENT_DURATION:
            raise DomainError(422, "EVENT_TOO_LONG", "An event can last at most 14 days.")
        return starts_at, ends_at

    def record(self, database, event, actor_id, action, audit=True):
        identifier = str(uuid4())
        now = self.clock()
        if audit:
            database.add(SpaceAuditEvent(
                id=identifier, space_id=event.space_id, actor_id=actor_id, target_id=event.id, action=action, created_at=now,
            ))
        database.add(OutboxEvent(
            id=identifier, event_type=action, actor_id=actor_id, aggregate_id=event.id, schema_version=1, created_at=now,
        ))
        if action in SEARCHED_ACTIONS:
            announce_history(database, event.space_id, event.admissions_before, "event")

    def present(self, database, events, membership, detail=False, now=None):
        if not events:
            return []
        identifiers = [event.id for event in events]
        # Only responses from people who are still current members under the same admission count.
        current = and_(
            SpaceMembership.space_id == SpaceEvent.space_id,
            SpaceMembership.account_id == SpaceEventResponse.account_id,
            SpaceMembership.admission_id == SpaceEventResponse.admission_id,
            SpaceMembership.status == "active",
        )
        counts = {}
        for event_id, response, total in database.execute(
            select(SpaceEventResponse.event_id, SpaceEventResponse.response, func.count())
            .join(SpaceEvent, SpaceEvent.id == SpaceEventResponse.event_id).join(SpaceMembership, current)
            .where(SpaceEventResponse.event_id.in_(identifiers))
            .group_by(SpaceEventResponse.event_id, SpaceEventResponse.response)
        ).all():
            counts.setdefault(event_id, {})[response] = total
        mine = {
            item.event_id: item for item in database.scalars(select(SpaceEventResponse).where(
                SpaceEventResponse.event_id.in_(identifiers),
                SpaceEventResponse.account_id == membership.account_id,
                SpaceEventResponse.admission_id == membership.admission_id,
            ))
        }
        # Places in line are worked out from the answers each time, so the number going can never pass the capacity.
        line = select(
            SpaceEventResponse.event_id, SpaceEventResponse.account_id,
            func.row_number().over(
                partition_by=SpaceEventResponse.event_id, order_by=(SpaceEventResponse.going_since, SpaceEventResponse.account_id),
            ).label("place"),
        ).join(SpaceEvent, SpaceEvent.id == SpaceEventResponse.event_id).join(SpaceMembership, current).where(
            SpaceEventResponse.event_id.in_(identifiers), SpaceEventResponse.response == "going",
        ).subquery()
        places = dict(database.execute(
            select(line.c.event_id, line.c.place).where(line.c.account_id == membership.account_id)
        ).all())
        names = dict(database.execute(
            select(User.id, User.display_name).where(User.id.in_({event.creator_id for event in events}))
        ).all())
        space = database.get(Space, membership.space_id)
        now = now or self.clock()
        views = []
        for event in events:
            own = mine.get(event.id)
            ended = self.finish(event) <= now
            manager = membership.role == "owner" or (
                event.creator_id == membership.account_id and event.creator_admission_id == membership.admission_id
            )
            requested = counts.get(event.id, {}).get("going", 0)
            going = requested if event.capacity is None else min(requested, event.capacity)
            place = places.get(event.id)
            fields = dict(
                id=event.id, space_id=event.space_id, space_name=space.name, title=event.title,
                description=event.description, location=event.location, timezone=event.timezone,
                local_start=event.local_start, local_end=event.local_end, starts_at=event.starts_at,
                ends_at=event.ends_at, status=event.status, ended=ended, created_by_name=names.get(event.creator_id, ""),
                created_at=event.created_at, updated_at=event.updated_at,
                schedule_changed_at=event.schedule_changed_at, cancelled_at=event.cancelled_at,
                going=going, maybe=counts.get(event.id, {}).get("maybe", 0),
                not_going=counts.get(event.id, {}).get("not_going", 0),
                capacity=event.capacity, waitlisted=requested - going,
                my_response=own.response if own else None,
                my_response_outdated=bool(own and event.schedule_changed_at and own.updated_at < event.schedule_changed_at),
                my_waitlist_position=place - event.capacity if place and event.capacity is not None and place > event.capacity else None,
                can_manage=manager and event.status == "scheduled" and not ended,
                can_respond=event.status == "scheduled" and not ended,
                etag=self.etag(event) if manager else None,
            )
            if not detail:
                views.append(SpaceEventView(**fields))
                continue
            waiting = {}
            if event.capacity is not None:
                waiting = {
                    account_id: position - event.capacity
                    for account_id, position in database.execute(
                        select(line.c.account_id, line.c.place).where(line.c.event_id == event.id, line.c.place > event.capacity)
                    ).all()
                }
            attendees = [
                AttendeeView(
                    name=name, response=item.response, responded_at=item.updated_at,
                    outdated=bool(event.schedule_changed_at and item.updated_at < event.schedule_changed_at),
                    mine=item.account_id == membership.account_id,
                    waitlist_position=waiting.get(item.account_id),
                )
                for item, name in database.execute(
                    select(SpaceEventResponse, User.display_name)
                    .join(SpaceEvent, SpaceEvent.id == SpaceEventResponse.event_id).join(SpaceMembership, current)
                    .join(User, User.id == SpaceEventResponse.account_id)
                    .where(SpaceEventResponse.event_id == event.id)
                    .order_by(SpaceEventResponse.updated_at, SpaceEventResponse.account_id).limit(500)
                ).all()
            ]
            views.append(EventDetail(**fields, attendees=attendees))
        return views

    def create(self, token, space_id, body, key):
        with self.identity.signed_in_write(token) as (database, caller):
            space = self.spaces.lock_space(database, space_id)
            membership = self.membership(database, space_id, caller.id)
            if membership is None:
                raise not_found("Space")
            digest = self.security.digest(
                "space.event.create", space_id,
                # Without a capacity the body is digested as before capacities existed, so earlier retries still match.
                body.model_dump_json(exclude={"capacity"} if body.capacity is None else None),
            )
            existing = database.scalar(select(SpaceEvent).where(
                SpaceEvent.space_id == space_id, SpaceEvent.creator_id == caller.id, SpaceEvent.creation_key == key,
            ))
            if existing is not None:
                if existing.creator_admission_id != membership.admission_id:
                    raise not_found()
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original event.")
                return self.present(database, [existing], membership, detail=True)[0]
            now = self.clock()
            starts_at, ends_at = self.schedule(body, now)
            total = database.scalar(select(func.count()).select_from(SpaceEvent).where(SpaceEvent.space_id == space_id))
            if total >= MAX_EVENTS_PER_SPACE:
                raise DomainError(409, "EVENT_LIMIT_REACHED", "This Space reached the local limit of 500 events.")
            upcoming = database.scalar(select(func.count()).select_from(SpaceEvent).where(
                SpaceEvent.space_id == space_id, SpaceEvent.status == "scheduled",
                func.coalesce(SpaceEvent.ends_at, SpaceEvent.starts_at) > now,
            ))
            if upcoming >= MAX_UPCOMING_PER_SPACE:
                raise DomainError(409, "EVENT_LIMIT_REACHED", "This Space already has 100 upcoming events.")
            event = SpaceEvent(
                id=str(uuid4()), space_id=space_id, creator_id=caller.id, creator_admission_id=membership.admission_id,
                title=body.title, description=body.description, location=body.location, timezone=body.timezone,
                local_start=body.local_start, local_end=body.local_end, starts_at=starts_at, ends_at=ends_at,
                status="scheduled", version=1, creation_key=key, creation_digest=digest, capacity=body.capacity,
                admissions_before=space.admission_sequence, created_at=now, updated_at=now,
            )
            database.add(event)
            database.flush()
            self.record(database, event, caller.id, "event.created")
            return self.present(database, [event], membership, detail=True)[0]

    def read(self, token, event_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            event, membership = self.visible(database, event_id, caller.id)
            return self.present(database, [event], membership, detail=True)[0]

    def list_events(self, token, space_id, when, limit, cursor=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            membership = self.membership(database, space_id, caller.id)
            if membership is None:
                raise not_found("Space")
            now = self.clock()
            finish = func.coalesce(SpaceEvent.ends_at, SpaceEvent.starts_at)
            statement = select(SpaceEvent).where(
                SpaceEvent.space_id == space_id, SpaceEvent.admissions_before >= membership.admission_sequence,
                finish > now if when == "upcoming" else finish <= now,
            )
            if cursor:
                try:
                    position = EventCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload the events.") from None
                if str(position.account_id) != caller.id or str(position.space_id) != space_id or position.when != when:
                    raise DomainError(400, "CURSOR_INVALID", "Reload the events.")
                if position.expires_at <= now:
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload the events.")
                after_id = str(position.after_id)
                if when == "upcoming":
                    statement = statement.where(or_(
                        SpaceEvent.starts_at > position.after_start,
                        and_(SpaceEvent.starts_at == position.after_start, SpaceEvent.id > after_id),
                    ))
                else:
                    statement = statement.where(or_(
                        SpaceEvent.starts_at < position.after_start,
                        and_(SpaceEvent.starts_at == position.after_start, SpaceEvent.id < after_id),
                    ))
            order = (SpaceEvent.starts_at, SpaceEvent.id) if when == "upcoming" else (SpaceEvent.starts_at.desc(), SpaceEvent.id.desc())
            rows = database.scalars(statement.order_by(*order).limit(limit + 1)).all()
            page = rows[:limit]
            next_cursor = None
            if len(rows) > limit:
                next_cursor = self.security.seal(EventCursor(
                    kind="space_events", account_id=caller.id, space_id=space_id, when=when,
                    after_start=page[-1].starts_at, after_id=page[-1].id, expires_at=now + timedelta(minutes=CURSOR_MINUTES),
                ).model_dump_json())
            return self.present(database, page, membership, now=now), Pagination(next_cursor=next_cursor, has_more=next_cursor is not None)

    def managed(self, database, caller, event_id):
        event, membership = self.visible(database, event_id, caller.id, lock=True)
        owner = membership.role == "owner"
        creator = event.creator_id == caller.id and event.creator_admission_id == membership.admission_id
        if not (owner or creator):
            raise DomainError(403, "EVENT_MANAGEMENT_DENIED", "Only the organizer or the Space owner can change this event.")
        return event, membership

    @staticmethod
    def going(database, event):
        """People going now: current members who answered Going, up to the capacity."""
        requested = database.scalar(
            select(func.count()).select_from(SpaceEventResponse).join(SpaceMembership, and_(
                SpaceMembership.space_id == event.space_id, SpaceMembership.account_id == SpaceEventResponse.account_id,
                SpaceMembership.admission_id == SpaceEventResponse.admission_id, SpaceMembership.status == "active",
            )).where(SpaceEventResponse.event_id == event.id, SpaceEventResponse.response == "going")
        )
        return requested if event.capacity is None else min(requested, event.capacity)

    def update(self, token, event_id, body, etag):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.managed(database, caller, event_id)
            self.require_etag(etag, self.etag(event))
            now = self.clock()
            if event.status != "scheduled":
                raise DomainError(409, "EVENT_CANCELLED", "A cancelled event cannot be edited.")
            if self.finish(event) <= now:
                raise DomainError(409, "EVENT_ENDED", "This event has ended.")
            rescheduled = (body.timezone, body.local_start, body.local_end) != (event.timezone, event.local_start, event.local_end)
            capacity = body.capacity if "capacity" in body.model_fields_set else event.capacity
            details = (body.title, body.description, body.location, capacity) != (event.title, event.description, event.location, event.capacity)
            if not rescheduled and not details:
                return self.present(database, [event], membership, detail=True)[0]
            if capacity is not None and capacity != event.capacity:
                going = self.going(database, event)
                if capacity < going:
                    raise DomainError(409, "CAPACITY_BELOW_GOING", f"People going: {going}. Choose a capacity of at least {going}.")
            if rescheduled:
                event.starts_at, event.ends_at = self.schedule(body, now)
                event.timezone, event.local_start, event.local_end = body.timezone, body.local_start, body.local_end
                event.schedule_changed_at = now
            event.title, event.description, event.location = body.title, body.description, body.location
            event.capacity = capacity
            event.version += 1
            event.updated_at = now
            self.record(database, event, caller.id, "event.updated")
            database.flush()
            return self.present(database, [event], membership, detail=True)[0]

    def cancel(self, token, event_id, etag):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.managed(database, caller, event_id)
            if event.status == "cancelled":
                return self.present(database, [event], membership, detail=True)[0]
            self.require_etag(etag, self.etag(event))
            now = self.clock()
            if self.finish(event) <= now:
                raise DomainError(409, "EVENT_ENDED", "This event has ended.")
            event.status = "cancelled"
            event.cancelled_at = now
            event.updated_at = now
            event.version += 1
            self.record(database, event, caller.id, "event.cancelled")
            database.flush()
            return self.present(database, [event], membership, detail=True)[0]

    def respond(self, token, event_id, body):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.visible(database, event_id, caller.id, lock=True)
            now = self.clock()
            if event.status != "scheduled":
                raise DomainError(409, "EVENT_CANCELLED", "This event was cancelled.")
            if self.finish(event) <= now:
                raise DomainError(409, "EVENT_ENDED", "This event has ended.")
            current = database.get(SpaceEventResponse, (event.id, caller.id), populate_existing=True)
            outdated = bool(current and event.schedule_changed_at and current.updated_at < event.schedule_changed_at)
            if current is not None and current.admission_id == membership.admission_id and current.response == body.response and not outdated:
                return self.present(database, [event], membership, detail=True)[0]
            # Answering Going again, for example after the time changed, keeps the person's place in line.
            keeps_place = current is not None and current.admission_id == membership.admission_id and current.response == "going"
            joined = None
            if body.response == "going" and not keeps_place:
                # Answers are taken one at a time under the event lock, so a later one never shares an earlier one's time.
                latest = database.scalar(select(func.max(SpaceEventResponse.going_since)).where(SpaceEventResponse.event_id == event.id))
                joined = now if latest is None or latest < now else latest + timedelta(microseconds=1)
            if current is None:
                current = SpaceEventResponse(event_id=event.id, account_id=caller.id)
                database.add(current)
            current.admission_id = membership.admission_id
            current.response = body.response
            current.updated_at = now
            current.going_since = (current.going_since if keeps_place else joined) if body.response == "going" else None
            self.record(database, event, caller.id, "event.attendee.updated", audit=False)
            database.flush()
            return self.present(database, [event], membership, detail=True)[0]
