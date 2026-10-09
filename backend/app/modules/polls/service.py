from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select

from app.errors import DomainError
from app.modules.identity.models import OutboxEvent, User
from app.modules.polls.models import SpacePoll, SpacePollOption, SpacePollVote
from app.modules.polls.schemas import PollCursor, PollOptionView, PollView
from app.modules.realtime.hub import signal
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_POLLS_PER_SPACE = 200
MAX_OPEN_POLLS_PER_SPACE = 20
MAX_POLL_DURATION = timedelta(days=60)
MIN_POLL_DURATION = timedelta(minutes=5)
CURSOR_MINUTES = 15


def not_found(subject="Poll"):
    return DomainError(404, "NOT_FOUND", f"{subject} not found.")


class PollService:
    """Polls inside a Space: one current vote per member, changeable until the poll closes."""

    def __init__(self, spaces):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock

    def etag(self, poll):
        return f'"{self.security.digest("space.poll", poll.id, str(poll.version))}"'

    @staticmethod
    def membership(database, space_id, account_id):
        return database.scalar(
            select(SpaceMembership).join(Space, Space.id == SpaceMembership.space_id).where(
                SpaceMembership.space_id == space_id, SpaceMembership.account_id == account_id,
                SpaceMembership.status == "active", Space.status == "active",
            ).execution_options(populate_existing=True)
        )

    def visible(self, database, poll_id, account_id, lock=False):
        statement = select(SpacePoll).where(SpacePoll.id == poll_id)
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        poll = database.scalar(statement)
        membership = self.membership(database, poll.space_id, account_id) if poll else None
        if poll is None or membership is None or poll.admissions_before < membership.admission_sequence:
            raise not_found()
        return poll, membership

    @staticmethod
    def is_open(poll, now):
        return poll.status == "open" and (poll.closes_at is None or poll.closes_at > now)

    @staticmethod
    def may_close(poll, membership):
        return membership.role in ("owner", "admin") or (
            poll.creator_id == membership.account_id and poll.creator_admission_id == membership.admission_id
        )

    def announce(self, database, poll, actor_id, action):
        identifier = str(uuid4())
        now = self.clock()
        database.add(SpaceAuditEvent(id=identifier, space_id=poll.space_id, actor_id=actor_id, target_id=poll.id, action=action, created_at=now))
        database.add(OutboxEvent(id=identifier, event_type=action, actor_id=actor_id, aggregate_id=poll.id, schema_version=1, created_at=now))
        members = database.scalars(select(SpaceMembership.account_id).where(
            SpaceMembership.space_id == poll.space_id, SpaceMembership.status == "active",
            SpaceMembership.admission_sequence <= poll.admissions_before,
        )).all()
        # The hint names identifiers only; members read the poll again through the API, which checks access.
        signal(database, "poll", members, space_id=poll.space_id, poll_id=poll.id, reason="changed")

    def present(self, database, polls, membership, now=None):
        if not polls:
            return []
        now = now or self.clock()
        identifiers = [poll.id for poll in polls]
        options = {}
        for option in database.scalars(
            select(SpacePollOption).where(SpacePollOption.poll_id.in_(identifiers)).order_by(SpacePollOption.poll_id, SpacePollOption.position)
        ):
            options.setdefault(option.poll_id, []).append(option)
        # Only votes from people who are still members under the same admission count.
        current = and_(
            SpaceMembership.space_id == SpacePoll.space_id,
            SpaceMembership.account_id == SpacePollVote.account_id,
            SpaceMembership.admission_id == SpacePollVote.admission_id,
            SpaceMembership.status == "active",
        )
        counts = dict(database.execute(
            select(SpacePollVote.option_id, func.count())
            .join(SpacePoll, SpacePoll.id == SpacePollVote.poll_id).join(SpaceMembership, current)
            .where(SpacePollVote.poll_id.in_(identifiers)).group_by(SpacePollVote.option_id)
        ).all())
        mine = dict(database.execute(select(SpacePollVote.poll_id, SpacePollVote.option_id).where(
            SpacePollVote.poll_id.in_(identifiers), SpacePollVote.account_id == membership.account_id,
            SpacePollVote.admission_id == membership.admission_id,
        )).all())
        names = dict(database.execute(select(User.id, User.display_name).where(User.id.in_({poll.creator_id for poll in polls}))).all())
        views = []
        for poll in polls:
            choices = [PollOptionView(id=option.id, label=option.label, votes=counts.get(option.id, 0)) for option in options.get(poll.id, [])]
            most = max((choice.votes for choice in choices), default=0)
            open_now = self.is_open(poll, now)
            closer = self.may_close(poll, membership)
            views.append(PollView(
                id=poll.id, space_id=poll.space_id, question=poll.question, options=choices,
                status="open" if open_now else "closed", closes_at=poll.closes_at,
                closed_at=poll.closed_at or (None if open_now else poll.closes_at),
                created_by_name=names.get(poll.creator_id, ""), created_at=poll.created_at,
                total_votes=sum(choice.votes for choice in choices), my_option_id=mine.get(poll.id),
                leading_option_ids=[choice.id for choice in choices if most and choice.votes == most],
                can_vote=open_now, can_close=open_now and closer, etag=self.etag(poll) if closer else None,
            ))
        return views

    def create(self, token, space_id, body, key):
        with self.identity.signed_in_write(token) as (database, caller):
            space = self.spaces.lock_space(database, space_id)
            membership = self.membership(database, space_id, caller.id)
            if membership is None:
                raise not_found("Space")
            digest = self.security.digest("space.poll.create", space_id, body.model_dump_json())
            existing = database.scalar(select(SpacePoll).where(
                SpacePoll.space_id == space_id, SpacePoll.creator_id == caller.id, SpacePoll.creation_key == key,
            ))
            if existing is not None:
                if existing.creator_admission_id != membership.admission_id:
                    raise not_found()
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original poll.")
                return self.present(database, [existing], membership)[0]
            now = self.clock()
            if body.closes_at is not None and not now + MIN_POLL_DURATION <= body.closes_at <= now + MAX_POLL_DURATION:
                raise DomainError(422, "POLL_CLOSING_TIME", "Choose a closing time between 5 minutes and 60 days from now.")
            total = database.scalar(select(func.count()).select_from(SpacePoll).where(SpacePoll.space_id == space_id))
            if total >= MAX_POLLS_PER_SPACE:
                raise DomainError(409, "POLL_LIMIT_REACHED", "This Space reached the local limit of 200 polls.")
            opened = database.scalar(select(func.count()).select_from(SpacePoll).where(
                SpacePoll.space_id == space_id, SpacePoll.status == "open",
                or_(SpacePoll.closes_at.is_(None), SpacePoll.closes_at > now),
            ))
            if opened >= MAX_OPEN_POLLS_PER_SPACE:
                raise DomainError(409, "POLL_LIMIT_REACHED", "This Space already has 20 open polls. Close one first.")
            poll = SpacePoll(
                id=str(uuid4()), space_id=space_id, creator_id=caller.id, creator_admission_id=membership.admission_id,
                question=body.question, status="open", closes_at=body.closes_at, closed_at=None, version=1,
                creation_key=key, creation_digest=digest, admissions_before=space.admission_sequence, created_at=now, updated_at=now,
            )
            database.add(poll)
            database.flush()
            for position, label in enumerate(body.options, start=1):
                database.add(SpacePollOption(id=str(uuid4()), poll_id=poll.id, position=position, label=label))
            database.flush()
            self.announce(database, poll, caller.id, "poll.created")
            return self.present(database, [poll], membership, now)[0]

    def read(self, token, poll_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            poll, membership = self.visible(database, poll_id, caller.id)
            return self.present(database, [poll], membership)[0]

    def list_polls(self, token, space_id, status, limit, cursor=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            membership = self.membership(database, space_id, caller.id)
            if membership is None:
                raise not_found("Space")
            now = self.clock()
            open_now = and_(SpacePoll.status == "open", or_(SpacePoll.closes_at.is_(None), SpacePoll.closes_at > now))
            statement = select(SpacePoll).where(
                SpacePoll.space_id == space_id, SpacePoll.admissions_before >= membership.admission_sequence,
                open_now if status == "open" else ~open_now,
            )
            if cursor:
                try:
                    position = PollCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload the polls.") from None
                if (str(position.account_id) != caller.id or str(position.space_id) != space_id
                    or str(position.admission_id) != membership.admission_id or position.status != status):
                    raise DomainError(400, "CURSOR_INVALID", "Reload the polls.")
                if position.expires_at <= now:
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload the polls.")
                statement = statement.where(or_(
                    SpacePoll.created_at < position.before_created_at,
                    and_(SpacePoll.created_at == position.before_created_at, SpacePoll.id < str(position.before_id)),
                ))
            rows = database.scalars(statement.order_by(SpacePoll.created_at.desc(), SpacePoll.id.desc()).limit(limit + 1)).all()
            page = rows[:limit]
            next_cursor = None
            if len(rows) > limit:
                next_cursor = self.security.seal(PollCursor(
                    kind="space_polls", account_id=caller.id, space_id=space_id, admission_id=membership.admission_id, status=status,
                    before_created_at=page[-1].created_at, before_id=page[-1].id, expires_at=now + timedelta(minutes=CURSOR_MINUTES),
                ).model_dump_json())
            return self.present(database, page, membership, now), Pagination(next_cursor=next_cursor, has_more=next_cursor is not None)

    def vote(self, token, poll_id, body):
        with self.identity.signed_in_write(token) as (database, caller):
            poll, membership = self.visible(database, poll_id, caller.id, lock=True)
            now = self.clock()
            if not self.is_open(poll, now):
                raise DomainError(409, "POLL_CLOSED", "This poll is closed.")
            option = database.get(SpacePollOption, str(body.option_id))
            if option is None or option.poll_id != poll.id:
                raise DomainError(422, "POLL_OPTION_UNKNOWN", "Choose one of this poll's options.")
            current = database.get(SpacePollVote, (poll.id, caller.id), populate_existing=True)
            if current is not None and current.admission_id == membership.admission_id and current.option_id == option.id:
                return self.present(database, [poll], membership, now)[0]
            if current is None:
                current = SpacePollVote(poll_id=poll.id, account_id=caller.id)
                database.add(current)
            current.admission_id, current.option_id, current.updated_at = membership.admission_id, option.id, now
            database.flush()
            self.announce(database, poll, caller.id, "poll.voted")
            return self.present(database, [poll], membership, now)[0]

    def withdraw(self, token, poll_id):
        with self.identity.signed_in_write(token) as (database, caller):
            poll, membership = self.visible(database, poll_id, caller.id, lock=True)
            now = self.clock()
            if not self.is_open(poll, now):
                raise DomainError(409, "POLL_CLOSED", "This poll is closed.")
            current = database.get(SpacePollVote, (poll.id, caller.id), populate_existing=True)
            if current is not None:
                database.delete(current)
                database.flush()
                self.announce(database, poll, caller.id, "poll.vote_withdrawn")
            return self.present(database, [poll], membership, now)[0]

    def close(self, token, poll_id, etag):
        with self.identity.signed_in_write(token) as (database, caller):
            poll, membership = self.visible(database, poll_id, caller.id, lock=True)
            if not self.may_close(poll, membership):
                raise DomainError(403, "POLL_CLOSE_DENIED", "Only the person who asked, an admin or the owner can close this poll.")
            now = self.clock()
            if not self.is_open(poll, now):
                return self.present(database, [poll], membership, now)[0]
            if not etag:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current poll first.")
            if etag != self.etag(poll):
                raise DomainError(412, "POLL_CHANGED", "This poll changed since you reviewed it. Reload to continue.")
            poll.status, poll.closed_at, poll.updated_at = "closed", now, now
            poll.version += 1
            database.flush()
            self.announce(database, poll, caller.id, "poll.closed")
            return self.present(database, [poll], membership, now)[0]
