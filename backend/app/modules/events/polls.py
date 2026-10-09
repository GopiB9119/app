from uuid import uuid4

from sqlalchemy import and_, func, select

from app.errors import DomainError
from app.modules.events.models import (
    EventPoll,
    EventPollOption,
    EventPollVote,
    EventPollVoteCommand,
)
from app.modules.events.schemas import PollOptionView, PollView
from app.modules.spaces.models import SpaceMembership

MAX_EVENT_POLLS = 20


class EventPollService:
    def __init__(self, events):
        self.events = events
        self.identity = events.identity
        self.sessions = events.sessions
        self.security = events.security
        self.clock = events.clock

    @staticmethod
    def manages(event, member):
        return member.role == "owner" or (
            event.creator_id == member.account_id and event.creator_admission_id == member.admission_id
        )

    def active(self, event):
        return event.status == "scheduled" and self.events.finish(event) > self.clock()

    def require_manager(self, event, member):
        if not self.manages(event, member):
            raise DomainError(403, "EVENT_MANAGEMENT_DENIED", "Only the event organizer or Space owner can manage its polls.")

    def etag(self, poll):
        return f'"{self.security.digest("event.poll", poll.id, str(poll.version))}"'

    def vote_etag(self, poll, member, vote):
        return f'"{self.security.digest("event.poll.vote", poll.id, member.account_id, member.admission_id, str(vote.version if vote else 0))}"'

    @staticmethod
    def poll(database, event_id, poll_id):
        poll = database.scalar(select(EventPoll).where(EventPoll.event_id == event_id, EventPoll.id == poll_id))
        if poll is None:
            raise DomainError(404, "NOT_FOUND", "Poll not found.")
        return poll

    def present(self, database, event, member, polls):
        if not polls:
            return []
        identifiers = [poll.id for poll in polls]
        options = {}
        for option in database.scalars(select(EventPollOption).where(EventPollOption.poll_id.in_(identifiers))
                                        .order_by(EventPollOption.poll_id, EventPollOption.position)):
            options.setdefault(option.poll_id, []).append(option)
        counts = dict(database.execute(select(EventPollVote.option_id, func.count()).join(SpaceMembership, and_(
            SpaceMembership.space_id == event.space_id, SpaceMembership.account_id == EventPollVote.account_id,
            SpaceMembership.admission_id == EventPollVote.admission_id, SpaceMembership.status == "active",
        )).where(EventPollVote.poll_id.in_(identifiers), EventPollVote.option_id.is_not(None))
          .group_by(EventPollVote.option_id)).all())
        mine = {vote.poll_id: vote for vote in database.scalars(select(EventPollVote).where(
            EventPollVote.poll_id.in_(identifiers), EventPollVote.account_id == member.account_id,
            EventPollVote.admission_id == member.admission_id,
        ))}
        manager, active = self.manages(event, member), self.active(event)
        views = []
        for poll in polls:
            open_now = poll.status == "open" and active
            closed_at = poll.closed_at or (event.cancelled_at or self.events.finish(event) if not active else None)
            choices = [PollOptionView(id=option.id, text=option.text, votes=counts.get(option.id, 0))
                       for option in options.get(poll.id, [])]
            vote = mine.get(poll.id)
            views.append(PollView(
                id=poll.id, event_id=event.id, question=poll.question, options=choices,
                status="open" if open_now else "closed", total_votes=sum(option.votes for option in choices),
                my_option_id=vote.option_id if vote else None, vote_etag=self.vote_etag(poll, member, vote),
                can_vote=open_now, can_close=open_now and manager, etag=self.etag(poll) if manager else None,
                created_at=poll.created_at, closed_at=closed_at,
            ))
        return views

    def read(self, token, event_id, poll_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            event, member = self.events.visible(database, event_id, caller.id)
            return self.present(database, event, member, [self.poll(database, event_id, poll_id)])[0]

    def list_polls(self, token, event_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            event, member = self.events.visible(database, event_id, caller.id)
            polls = database.scalars(select(EventPoll).where(EventPoll.event_id == event_id)
                                     .order_by(EventPoll.created_at, EventPoll.id)).all()
            return self.present(database, event, member, polls)

    def create(self, token, event_id, body, key):
        with self.identity.signed_in_write(token) as (database, caller):
            event, member = self.events.visible(database, event_id, caller.id, lock=True)
            self.require_manager(event, member)
            digest = self.security.digest("event.poll.create", event_id, body.model_dump_json())
            existing = database.scalar(select(EventPoll).where(
                EventPoll.event_id == event_id, EventPoll.creator_id == caller.id, EventPoll.creation_key == key,
            ))
            if existing is not None:
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed poll.")
                return self.present(database, event, member, [existing])[0]
            if not self.active(event):
                raise DomainError(409, "EVENT_CLOSED", "This event can no longer receive polls.")
            if database.scalar(select(func.count()).select_from(EventPoll).where(EventPoll.event_id == event_id)) >= MAX_EVENT_POLLS:
                raise DomainError(409, "POLL_LIMIT_REACHED", "This event already has 20 polls.")
            poll = EventPoll(id=str(uuid4()), event_id=event_id, creator_id=caller.id, question=body.question,
                             status="open", version=1, creation_key=key, creation_digest=digest, created_at=self.clock())
            database.add(poll)
            database.flush()
            for position, option in enumerate(body.options, start=1):
                database.add(EventPollOption(id=str(uuid4()), poll_id=poll.id, position=position, text=option))
            database.flush()
            self.events.record(database, event, caller.id, "event.poll.created")
            return self.present(database, event, member, [poll])[0]

    def vote(self, token, event_id, poll_id, body, key, expected):
        with self.identity.signed_in_write(token) as (database, caller):
            event, member = self.events.visible(database, event_id, caller.id, lock=True)
            poll = self.poll(database, event_id, poll_id)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review your current vote first.")
            digest = self.security.digest("event.poll.vote", poll.id, expected, body.model_dump_json())
            previous = database.scalar(select(EventPollVoteCommand).where(
                EventPollVoteCommand.poll_id == poll.id, EventPollVoteCommand.account_id == caller.id,
                EventPollVoteCommand.admission_id == member.admission_id, EventPollVoteCommand.request_key == key,
            ))
            if previous is not None:
                if previous.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed choice.")
                return self.present(database, event, member, [poll])[0]
            if poll.status != "open" or not self.active(event):
                raise DomainError(409, "POLL_CLOSED", "This poll is closed.")
            current = database.get(EventPollVote, (poll.id, caller.id, member.admission_id))
            if expected != self.vote_etag(poll, member, current):
                raise DomainError(412, "POLL_VOTE_CHANGED", "Your choice changed. Review the current poll.")
            option_id = str(body.option_id) if body.option_id is not None else None
            if option_id is not None and database.scalar(select(EventPollOption.id).where(
                EventPollOption.id == option_id, EventPollOption.poll_id == poll.id,
            )) is None:
                raise DomainError(422, "POLL_OPTION_UNKNOWN", "Choose an option from this poll.")
            changed = (current.option_id if current else None) != option_id
            if current is None:
                current = EventPollVote(poll_id=poll.id, account_id=caller.id, admission_id=member.admission_id,
                                        option_id=option_id, version=1)
                database.add(current)
            elif changed:
                current.option_id = option_id
                current.version += 1
            database.flush()
            database.add(EventPollVoteCommand(id=str(uuid4()), poll_id=poll.id, account_id=caller.id,
                                              admission_id=member.admission_id, request_key=key,
                                              request_digest=digest, created_at=self.clock()))
            if changed:
                self.events.record(database, event, caller.id, "event.poll.voted", audit=False)
            database.flush()
            return self.present(database, event, member, [poll])[0]

    def close(self, token, event_id, poll_id, expected):
        with self.identity.signed_in_write(token) as (database, caller):
            event, member = self.events.visible(database, event_id, caller.id, lock=True)
            self.require_manager(event, member)
            poll = self.poll(database, event_id, poll_id)
            if poll.status == "closed" or not self.active(event):
                return self.present(database, event, member, [poll])[0]
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current poll first.")
            if expected != self.etag(poll):
                raise DomainError(412, "POLL_CHANGED", "This poll changed. Review it again.")
            poll.status, poll.closed_at, poll.version = "closed", self.clock(), poll.version + 1
            self.events.record(database, event, caller.id, "event.poll.closed")
            database.flush()
            return self.present(database, event, member, [poll])[0]