"""Events on public pages (D4, docs/COMMUNITY_AGENT_PLAN.md). A page's owner and moderators publish, change and cancel
them; signed-in people say they are going. The exact place and the list of who is going stay with the people involved."""

from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, or_, select

from app.errors import DomainError
from app.modules.community.models import AccountBlock, FeedControl, PageEvent, PageEventResponse, PublicPage
from app.modules.community.page_event_schemas import PageEventAttendee, PageEventView
from app.modules.community.service import CommunityService, not_found
from app.modules.events.service import MAX_EVENT_AHEAD, MAX_EVENT_DURATION, instant
from app.modules.identity.models import User

MAX_UPCOMING_PER_PAGE = 50
LISTED = 50


class PageEventService(CommunityService):
    def event_etag(self, event):
        return f'"{self.security.digest("page.event", event.id, str(event.version))}"'

    def manages(self, database, user, page, lock=False):
        return user is not None and (page.owner_id == user.id or self.active_moderator(database, user, page.id, lock=lock) is not None)

    def ended(self, event):
        return (event.ends_at or event.starts_at) <= self.clock()

    def views(self, database, rows, viewer):
        ids = [event.id for event, _page in rows]
        going = set()
        if viewer is not None and ids:
            going = set(database.scalars(select(PageEventResponse.event_id).where(
                PageEventResponse.event_id.in_(ids), PageEventResponse.account_id == viewer.id,
            )))
        managed = {}
        views = []
        for event, page in rows:
            if page.id not in managed:
                managed[page.id] = self.manages(database, viewer, page)
            shown = event.venue_public or managed[page.id] or event.id in going
            views.append(PageEventView(
                id=event.id, page_id=page.id, page_handle=page.handle, page_name=page.name, title=event.title,
                description=event.details, location=(event.venue or None) if shown else None,
                location_hidden=bool(event.venue) and not shown, location_public=event.venue_public, timezone=event.timezone,
                local_start=event.local_start, local_end=event.local_end, starts_at=event.starts_at, ends_at=event.ends_at,
                status=event.status, ended=self.ended(event), going_count=event.going_count, capacity=event.capacity,
                going=event.id in going, can_manage=managed[page.id], created_at=event.created_at, updated_at=event.updated_at,
                schedule_changed_at=event.schedule_changed_at, cancelled_at=event.cancelled_at,
                etag=self.event_etag(event) if managed[page.id] else None,
            ))
        return views

    def view(self, database, event, page, viewer):
        return self.views(database, [(event, page)], viewer)[0]

    def visible(self, database, viewer, event_id, lock=False):
        page_id = database.scalar(select(PageEvent.page_id).where(PageEvent.id == event_id))
        if page_id is None:
            raise not_found("Event")
        page = self.find_page(database, page_id, lock=lock, viewer=viewer)
        statement = select(PageEvent).where(PageEvent.id == event_id)
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        event = database.scalar(statement)
        if event.status == "deleted" or (not self.manages(database, viewer, page) and page.id in self.blocked(database, viewer, "page")):
            raise not_found("Event")
        return event, page

    def times(self, body):
        starts_at = instant(body.local_start, body.timezone, "start")
        ends_at = instant(body.local_end, body.timezone, "end") if body.local_end else None
        if ends_at is not None and ends_at - starts_at > MAX_EVENT_DURATION:
            raise DomainError(422, "EVENT_TOO_LONG", "An event can last up to 14 days.")
        now = self.clock()
        if starts_at <= now:
            raise DomainError(422, "EVENT_IN_PAST", "Choose a start time in the future.")
        if starts_at > now + MAX_EVENT_AHEAD:
            raise DomainError(422, "EVENT_TOO_FAR", "Choose a start within two years.")
        return starts_at, ends_at

    def require_manager(self, database, user, page):
        if not self.manages(database, user, page, lock=True):
            raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner or a moderator can publish and change events.")

    def create(self, token, page_ref, body, key):
        digest = self.security.digest(
            "page.event.create", page_ref, body.title, body.description, body.location, str(body.location_public), body.timezone,
            body.local_start, body.local_end or "", str(body.capacity),
        )
        with self.identity.signed_in_write(token) as (database, user):
            page = self.find_page(database, page_ref, lock=True, viewer=user)
            existing = database.scalar(select(PageEvent).where(PageEvent.created_by == user.id, PageEvent.creation_key == key))
            if existing is not None:
                if existing.creation_digest != digest or existing.page_id != page.id:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original event.")
                if existing.status == "deleted":
                    raise not_found("Event")
                return self.view(database, existing, page, user)
            self.require_manager(database, user, page)
            self.writable(page)
            self.open_for_new_content(page)
            starts_at, ends_at = self.times(body)
            now = self.clock()
            upcoming = database.scalar(select(func.count()).select_from(PageEvent).where(
                PageEvent.page_id == page.id, PageEvent.status == "scheduled", PageEvent.starts_at > now,
            ))
            if upcoming >= MAX_UPCOMING_PER_PAGE:
                raise DomainError(409, "EVENT_LIMIT_REACHED", f"A page can have {MAX_UPCOMING_PER_PAGE} upcoming events.")
            event = PageEvent(
                id=str(uuid4()), page_id=page.id, created_by=user.id, title=body.title, details=body.description,
                venue=body.location, venue_public=body.location_public, timezone=body.timezone, local_start=body.local_start,
                local_end=body.local_end, starts_at=starts_at, ends_at=ends_at, capacity=body.capacity, going_count=0,
                status="scheduled", version=1, creation_key=key, creation_digest=digest, created_at=now, updated_at=now,
            )
            database.add(event)
            database.flush()
            self.record(database, user.id, page.id, event.id, "public.event_created", audited=True)
            return self.view(database, event, page, user)

    def update(self, token, event_id, body, etag):
        with self.identity.signed_in_write(token) as (database, user):
            event, page = self.visible(database, user, event_id, lock=True)
            self.require_manager(database, user, page)
            self.writable(page)
            self.require_etag(etag, self.event_etag(event), "event")
            if event.status != "scheduled" or self.ended(event):
                raise DomainError(409, "EVENT_CLOSED", "This event was cancelled or has ended.")
            starts_at, ends_at = self.times(body)
            capacity = event.capacity if "capacity" not in body.model_fields_set else body.capacity
            if capacity is not None and capacity < event.going_count:
                raise DomainError(409, "CAPACITY_BELOW_GOING", f"{event.going_count} people are going; choose at least that many places.")
            now = self.clock()
            if (starts_at, ends_at, body.location) != (event.starts_at, event.ends_at, event.venue):
                event.schedule_changed_at = now
            event.title, event.details, event.venue, event.venue_public = body.title, body.description, body.location, body.location_public
            event.timezone, event.local_start, event.local_end = body.timezone, body.local_start, body.local_end
            event.starts_at, event.ends_at, event.capacity = starts_at, ends_at, capacity
            event.version += 1
            event.updated_at = now
            database.flush()
            self.record(database, user.id, page.id, event.id, "public.event_updated", audited=True)
            return self.view(database, event, page, user)

    def cancel(self, token, event_id, etag):
        with self.identity.signed_in_write(token) as (database, user):
            event, page = self.visible(database, user, event_id, lock=True)
            self.require_manager(database, user, page)
            self.require_etag(etag, self.event_etag(event), "event")
            if event.status == "scheduled":
                if self.ended(event):
                    raise DomainError(409, "EVENT_CLOSED", "This event has ended.")
                now = self.clock()
                event.status = "cancelled"
                event.cancelled_at = now
                event.updated_at = now
                event.version += 1
                database.flush()
                self.record(database, user.id, page.id, event.id, "public.event_cancelled", audited=True)
            return self.view(database, event, page, user)

    def attend(self, token, event_id, going):
        with self.identity.signed_in_write(token) as (database, user):
            event, page = self.visible(database, user, event_id, lock=True)
            response = database.get(PageEventResponse, (event.id, user.id))
            if going and response is None:
                if event.status != "scheduled" or self.ended(event):
                    raise DomainError(409, "EVENT_CLOSED", "This event was cancelled or has ended.")
                self.writable(page)
                if user.id != page.owner_id and database.scalar(select(AccountBlock.id).where(
                    AccountBlock.blocker_id == page.owner_id, AccountBlock.target_type == "account", AccountBlock.target_id == user.id,
                )) is not None:
                    raise DomainError(403, "EVENT_UNAVAILABLE", "You cannot join this event.")
                if event.capacity is not None and event.going_count >= event.capacity:
                    raise DomainError(409, "EVENT_FULL", "This event is full.")
                database.add(PageEventResponse(event_id=event.id, account_id=user.id, created_at=self.clock()))
                event.going_count += 1
                database.flush()
            elif not going and response is not None:
                database.delete(response)
                event.going_count -= 1
                database.flush()
            return self.view(database, event, page, user)

    def read(self, token, event_id):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            event, page = self.visible(database, viewer, event_id)
            return self.view(database, event, page, viewer)

    def page_events(self, token, page_ref, when):
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            page = self.find_page(database, page_ref, viewer=viewer)
            if not self.manages(database, viewer, page) and page.id in self.blocked(database, viewer, "page"):
                return []
            now = self.clock()
            finish = func.coalesce(PageEvent.ends_at, PageEvent.starts_at)
            statement = select(PageEvent, PublicPage).join(PublicPage, PublicPage.id == PageEvent.page_id).where(
                PageEvent.page_id == page.id, PageEvent.status != "deleted",
            )
            if when == "upcoming":
                statement = statement.where(finish > now).order_by(PageEvent.starts_at, PageEvent.id)
            else:
                statement = statement.where(finish <= now).order_by(PageEvent.starts_at.desc(), PageEvent.id.desc())
            rows = database.execute(statement.limit(LISTED)).all()
            return self.views(database, [tuple(row) for row in rows], viewer)

    def mine(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            finish = func.coalesce(PageEvent.ends_at, PageEvent.starts_at)
            rows = database.execute(select(PageEvent, PublicPage).join(PublicPage, PublicPage.id == PageEvent.page_id).join(
                PageEventResponse, PageEventResponse.event_id == PageEvent.id,
            ).where(
                PageEventResponse.account_id == user.id, PageEvent.status != "deleted", finish > self.clock(),
                or_(PublicPage.status != "deleted", PublicPage.owner_id == user.id),
            ).order_by(PageEvent.starts_at, PageEvent.id).limit(LISTED)).all()
            return self.views(database, [tuple(row) for row in rows], user)

    def discover(self, token, limit):
        """Events that have not started yet on active pages, soonest first, leaving out pages the person blocked or muted."""
        with self.sessions() as database:
            viewer = self.viewer(database, token)
            statement = select(PageEvent, PublicPage).join(PublicPage, PublicPage.id == PageEvent.page_id).where(
                PageEvent.status == "scheduled", PageEvent.starts_at > self.clock(), PublicPage.status == "active",
            )
            hidden = self.blocked(database, viewer, "page")
            if viewer is not None:
                hidden |= set(database.scalars(select(FeedControl.page_id).where(
                    FeedControl.account_id == viewer.id, FeedControl.kind == "mute_page",
                )))
            if hidden:
                statement = statement.where(PageEvent.page_id.notin_(hidden))
            rows = database.execute(statement.order_by(PageEvent.starts_at, PageEvent.id).limit(limit)).all()
            return self.views(database, [tuple(row) for row in rows], viewer)

    def attendees(self, token, event_id):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            event, page = self.visible(database, user, event_id)
            if not self.manages(database, user, page):
                raise DomainError(403, "PAGE_MANAGER_REQUIRED", "Only the page owner or a moderator can see who is going.")
            rows = database.execute(select(User.display_name, PageEventResponse.created_at).join(
                User, User.id == PageEventResponse.account_id,
            ).where(PageEventResponse.event_id == event.id).order_by(PageEventResponse.created_at, User.id)).all()
            return [PageEventAttendee(name=name, since=since) for name, since in rows]
