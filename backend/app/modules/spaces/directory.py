from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, exists, func, or_, select, update
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.community.models import AccountBlock
from app.modules.identity.models import OutboxEvent, User
from app.modules.spaces import service as spaces_service
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceJoinRequest, SpaceMembership, SpaceSettingsCommand
from app.modules.spaces.schemas import (
    JoinRequestReview,
    JoinRequestView,
    Pagination,
    SpaceDirectoryCursor,
    SpaceDirectoryEntry,
)

REQUEST_LIFETIME = timedelta(days=14)
DECLINE_COOLDOWN = timedelta(days=7)
MAX_PENDING_PER_ACCOUNT = 20
MAX_PENDING_PER_SPACE = 100
MAX_OWN_REQUESTS_LISTED = 50


def not_found():
    # One answer for missing, private and blocked groups, so private Spaces cannot be detected.
    return DomainError(404, "NOT_FOUND", "Group not found.")


class SpaceDirectoryService:
    """Public group discovery, owner-controlled visibility and requests to join."""

    def __init__(self, spaces):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock

    # Shared helpers

    @staticmethod
    def blocked_between(account_id, owner_id):
        return exists().where(AccountBlock.target_type == "account", or_(
            and_(AccountBlock.blocker_id == account_id, AccountBlock.target_id == owner_id),
            and_(AccountBlock.blocker_id == owner_id, AccountBlock.target_id == account_id),
        ))

    @staticmethod
    def owner_of(database, space_id):
        return database.scalar(select(SpaceMembership.account_id).where(
            SpaceMembership.space_id == space_id, SpaceMembership.role == "owner", SpaceMembership.status == "active",
        ))

    def public_groups(self, viewer_id):
        owner = aliased(SpaceMembership)
        return (
            select(Space)
            .join(owner, and_(owner.space_id == Space.id, owner.role == "owner", owner.status == "active"))
            .where(
                Space.visibility == "public", Space.status == "active", Space.space_type == "group",
                ~self.blocked_between(viewer_id, owner.account_id),
            )
        )

    def record(self, database, space_id, actor_id, target_id, action):
        identifier = str(uuid4())
        now = self.clock()
        database.add_all([
            SpaceAuditEvent(id=identifier, space_id=space_id, actor_id=actor_id, target_id=target_id, action=action, created_at=now),
            OutboxEvent(id=identifier, event_type=action, actor_id=actor_id, aggregate_id=space_id, schema_version=1, created_at=now),
        ])
        return identifier

    def request_view(self, request):
        status = request.status
        if status == "pending" and request.expires_at <= self.clock():
            status = "expired"
        return JoinRequestView(
            id=request.id, space_id=request.space_id, space_name=request.space_name, note=request.note, status=status,
            created_at=request.created_at, expires_at=request.expires_at, resolved_at=request.resolved_at,
        )

    def entries(self, database, viewer_id, spaces):
        identifiers = [space.id for space in spaces]
        if not identifiers:
            return []
        now = self.clock()
        counts = dict(database.execute(
            select(SpaceMembership.space_id, func.count()).where(
                SpaceMembership.space_id.in_(identifiers), SpaceMembership.status == "active",
            ).group_by(SpaceMembership.space_id)
        ).all())
        roles = dict(database.execute(select(SpaceMembership.space_id, SpaceMembership.role).where(
            SpaceMembership.space_id.in_(identifiers), SpaceMembership.account_id == viewer_id, SpaceMembership.status == "active",
        )).all())
        pending = dict(database.execute(select(SpaceJoinRequest.space_id, SpaceJoinRequest.id).where(
            SpaceJoinRequest.space_id.in_(identifiers), SpaceJoinRequest.account_id == viewer_id,
            SpaceJoinRequest.status == "pending", SpaceJoinRequest.expires_at > now,
        )).all())
        cooling = set(database.scalars(select(SpaceJoinRequest.space_id).where(
            SpaceJoinRequest.space_id.in_(identifiers), SpaceJoinRequest.account_id == viewer_id,
            SpaceJoinRequest.status == "declined", SpaceJoinRequest.resolved_at > now - DECLINE_COOLDOWN,
        )))
        return [SpaceDirectoryEntry(
            id=space.id, name=space.name, description=space.description, member_count=counts.get(space.id, 0),
            viewer_role=roles.get(space.id), pending_request_id=pending.get(space.id),
            can_request=(
                space.id not in roles and space.id not in pending and space.id not in cooling
                and counts.get(space.id, 0) < spaces_service.MAX_FAMILY_MEMBERS
            ),
        ) for space in spaces]

    # Discovery

    def directory(self, token, query, limit, cursor=None):
        query = query.strip()
        with self.sessions() as database:
            viewer, _session = self.identity.authenticate(database, token)
            statement = self.public_groups(viewer.id)
            if query:
                statement = statement.where(or_(
                    Space.name.icontains(query, autoescape=True), Space.description.icontains(query, autoescape=True),
                ))
            if cursor:
                try:
                    position = SpaceDirectoryCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Search again.") from None
                if str(position.account_id) != viewer.id or position.query != query:
                    raise DomainError(400, "CURSOR_INVALID", "Search again.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Search again.")
                statement = statement.where(or_(
                    Space.created_at < position.after_created_at,
                    and_(Space.created_at == position.after_created_at, Space.id < str(position.after_id)),
                ))
            spaces = database.scalars(statement.order_by(Space.created_at.desc(), Space.id.desc()).limit(limit + 1)).all()
            page = spaces[:limit]
            has_more = len(spaces) > limit
            next_cursor = None
            if has_more:
                next_cursor = self.security.seal(SpaceDirectoryCursor(
                    kind="space_directory", account_id=viewer.id, query=query, after_created_at=page[-1].created_at,
                    after_id=page[-1].id, expires_at=self.clock() + timedelta(minutes=15),
                ).model_dump_json())
            return self.entries(database, viewer.id, page), Pagination(next_cursor=next_cursor, has_more=has_more)

    def preview(self, token, space_id):
        with self.sessions() as database:
            viewer, _session = self.identity.authenticate(database, token)
            space = database.scalar(self.public_groups(viewer.id).where(Space.id == space_id))
            if space is None:
                raise not_found()
            return self.entries(database, viewer.id, [space])[0]

    # Visibility

    def change_visibility(self, token, space_id, body, key, expected):
        with self.sessions.begin() as database:
            caller, _accounts = self.spaces.lock_accounts(database, token, [])
            space = self.spaces.lock_space(database, space_id)
            self.spaces.require_owner(database, space.id, caller.id, lock=True)
            member = database.get(SpaceMembership, (space.id, caller.id))
            self.identity.authenticate(database, token, lock=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current Space settings first.")
            digest = self.security.digest("space.visibility.command", body.visibility, expected)
            receipt = database.scalar(select(SpaceSettingsCommand).where(
                SpaceSettingsCommand.space_id == space.id, SpaceSettingsCommand.actor_id == caller.id,
                SpaceSettingsCommand.request_key == key,
            ))
            if receipt is not None:
                if receipt.actor_admission_id != member.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Space settings not found.")
                if receipt.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed visibility request.")
                return self.spaces.settings_view(space, member)
            if expected != self.spaces.settings_view(space, member).etag:
                raise DomainError(412, "SPACE_CHANGED", "This Space changed. Reload and review it again.")
            if space.space_type != "group":
                raise DomainError(409, "PRIVATE_SPACE_TYPE", "Family, couple and solo Spaces are always private.")
            if body.visibility == space.visibility:
                raise DomainError(409, "NO_CHANGES", f"This group is already {body.visibility}.")
            count = database.scalar(select(func.count()).select_from(SpaceSettingsCommand).where(SpaceSettingsCommand.space_id == space.id))
            if count >= 500:
                raise DomainError(409, "SETTINGS_LIMIT_REACHED", "The local Space settings limit was reached.")
            now = self.clock()
            space.visibility = body.visibility
            space.version += 1
            if body.visibility == "private":
                database.execute(update(SpaceJoinRequest).where(
                    SpaceJoinRequest.space_id == space.id, SpaceJoinRequest.status == "pending",
                ).values(status="closed", resolved_at=now, resolved_by_id=caller.id))
            event_id = self.record(database, space.id, caller.id, space.id, f"space.made_{body.visibility}")
            database.flush()
            database.add(SpaceSettingsCommand(
                id=event_id, space_id=space.id, actor_id=caller.id, actor_admission_id=member.admission_id,
                request_key=key, request_digest=digest,
            ))
            return self.spaces.settings_view(space, member)

    # Join requests

    def request_to_join(self, token, space_id, body, key):
        with self.sessions.begin() as database:
            caller, _accounts = self.spaces.lock_accounts(database, token, [])
            digest = self.security.digest("space.join.request", space_id, body.note)
            existing = database.scalar(select(SpaceJoinRequest).where(
                SpaceJoinRequest.account_id == caller.id, SpaceJoinRequest.request_key == key,
            ))
            if existing is not None:
                if existing.space_id != space_id or existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for a changed join request.")
                return self.request_view(existing)
            # A shared lock: making the group private takes it exclusively, so a request cannot slip in afterwards.
            space = database.scalar(
                self.public_groups(caller.id).where(Space.id == space_id).with_for_update(read=True, of=Space)
                .execution_options(populate_existing=True)
            )
            if space is None:
                raise not_found()
            membership = database.get(SpaceMembership, (space.id, caller.id))
            if membership is not None and membership.status == "active":
                raise DomainError(409, "ALREADY_MEMBER", "You are already a member of this group.")
            now = self.clock()
            database.execute(update(SpaceJoinRequest).where(
                SpaceJoinRequest.space_id == space.id, SpaceJoinRequest.account_id == caller.id,
                SpaceJoinRequest.status == "pending", SpaceJoinRequest.expires_at <= now,
            ).values(status="expired", resolved_at=SpaceJoinRequest.expires_at))
            if database.scalar(select(SpaceJoinRequest.id).where(
                SpaceJoinRequest.space_id == space.id, SpaceJoinRequest.account_id == caller.id, SpaceJoinRequest.status == "pending",
            )):
                raise DomainError(409, "JOIN_REQUEST_PENDING", "You already asked to join this group.")
            if database.scalar(select(SpaceJoinRequest.id).where(
                SpaceJoinRequest.space_id == space.id, SpaceJoinRequest.account_id == caller.id,
                SpaceJoinRequest.status == "declined", SpaceJoinRequest.resolved_at > now - DECLINE_COOLDOWN,
            ).limit(1)):
                raise DomainError(409, "JOIN_REQUEST_COOLDOWN", "Your last request was declined. You can ask again 7 days after that.")
            members = database.scalar(select(func.count()).select_from(SpaceMembership).where(
                SpaceMembership.space_id == space.id, SpaceMembership.status == "active",
            ))
            if members >= spaces_service.MAX_FAMILY_MEMBERS:
                raise DomainError(409, "SPACE_FULL", "This group is full.")
            mine = database.scalar(select(func.count()).select_from(SpaceJoinRequest).where(
                SpaceJoinRequest.account_id == caller.id, SpaceJoinRequest.status == "pending", SpaceJoinRequest.expires_at > now,
            ))
            queued = database.scalar(select(func.count()).select_from(SpaceJoinRequest).where(
                SpaceJoinRequest.space_id == space.id, SpaceJoinRequest.status == "pending", SpaceJoinRequest.expires_at > now,
            ))
            if mine >= MAX_PENDING_PER_ACCOUNT or queued >= MAX_PENDING_PER_SPACE:
                raise DomainError(409, "JOIN_REQUEST_LIMIT_REACHED", "Too many requests are waiting. Try again later.")
            request = SpaceJoinRequest(
                id=str(uuid4()), space_id=space.id, account_id=caller.id, space_name=space.name, note=body.note,
                status="pending", request_key=key, request_digest=digest, created_at=now, expires_at=now + REQUEST_LIFETIME,
            )
            database.add(request)
            database.flush()
            self.record(database, space.id, caller.id, request.id, "space.join_requested")
            return self.request_view(request)

    def cancel(self, token, request_id):
        with self.sessions.begin() as database:
            caller, _accounts = self.spaces.lock_accounts(database, token, [])
            request = database.scalar(select(SpaceJoinRequest).where(
                SpaceJoinRequest.id == request_id, SpaceJoinRequest.account_id == caller.id,
            ).with_for_update().execution_options(populate_existing=True))
            if request is None:
                raise DomainError(404, "NOT_FOUND", "Join request not found.")
            if request.status == "cancelled":
                return self.request_view(request)
            if request.status != "pending" or request.expires_at <= self.clock():
                raise DomainError(409, "JOIN_REQUEST_CLOSED", "This request was already answered or has expired.")
            request.status = "cancelled"
            request.resolved_at = self.clock()
            request.resolved_by_id = caller.id
            self.record(database, request.space_id, caller.id, request.id, "space.join_request_cancelled")
            return self.request_view(request)

    def my_requests(self, token):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            requests = database.scalars(select(SpaceJoinRequest).where(SpaceJoinRequest.account_id == caller.id).order_by(
                SpaceJoinRequest.created_at.desc(), SpaceJoinRequest.id.desc(),
            ).limit(MAX_OWN_REQUESTS_LISTED))
            return [self.request_view(request) for request in requests]

    def pending(self, token, space_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            self.spaces.require_manager(database, space_id, caller.id)
            owner_id = self.owner_of(database, space_id)
            rows = database.execute(
                select(SpaceJoinRequest, User).join(User, User.id == SpaceJoinRequest.account_id).where(
                    SpaceJoinRequest.space_id == space_id, SpaceJoinRequest.status == "pending",
                    SpaceJoinRequest.expires_at > self.clock(), User.status == "active",
                    # A block with the owner keeps a person out whoever reviews, as in the directory; so does one with the reviewer.
                    ~self.blocked_between(SpaceJoinRequest.account_id, caller.id),
                    ~self.blocked_between(SpaceJoinRequest.account_id, owner_id),
                ).order_by(SpaceJoinRequest.created_at, SpaceJoinRequest.id).limit(MAX_PENDING_PER_SPACE)
            ).all()
            return [JoinRequestReview(
                id=request.id, account_id=request.account_id, display_name=user.display_name, note=request.note,
                created_at=request.created_at, expires_at=request.expires_at,
            ) for request, user in rows]

    def decide(self, token, space_id, request_id, action):
        with self.sessions.begin() as database:
            # Sign-in is checked before anything about the request is looked up.
            self.identity.authenticate(database, token)
            snapshot = database.scalar(select(SpaceJoinRequest).where(
                SpaceJoinRequest.id == request_id, SpaceJoinRequest.space_id == space_id,
            ))
            if snapshot is None:
                raise DomainError(404, "NOT_FOUND", "Join request not found.")
            caller, accounts = self.spaces.lock_accounts(database, token, [snapshot.account_id])
            space = self.spaces.lock_space(database, space_id)
            try:
                self.spaces.require_manager(database, space.id, caller.id, lock=True)
            except DomainError:
                # The person who asked knows the request; anyone but the owner or an admin learns nothing new (T42).
                raise DomainError(404, "NOT_FOUND", "Join request not found.") from None
            if space.space_type != "group":
                # Only groups take join requests; a family or couple admits people only by invitation (DEC-017).
                raise DomainError(404, "NOT_FOUND", "Join request not found.")
            request = database.scalar(select(SpaceJoinRequest).where(SpaceJoinRequest.id == request_id).with_for_update()
                                      .execution_options(populate_existing=True))
            self.identity.authenticate(database, token, lock=True)
            terminal = "approved" if action == "approve" else "declined"
            if request.status == terminal:
                return self.request_view(request)
            if request.status != "pending":
                raise DomainError(409, "JOIN_REQUEST_CLOSED", "This request was already answered or closed.")
            now = self.clock()
            if request.expires_at <= now:
                raise DomainError(410, "JOIN_REQUEST_EXPIRED", "This request has expired.")
            requester = accounts.get(request.account_id)
            if action == "approve":
                owner_id = self.owner_of(database, space.id)
                blocked = database.scalar(select(or_(
                    self.blocked_between(request.account_id, caller.id), self.blocked_between(request.account_id, owner_id),
                )))
                if requester is None or requester.status != "active" or blocked:
                    raise DomainError(409, "JOIN_REQUEST_UNAVAILABLE", "This person cannot join right now.")
                membership = database.get(SpaceMembership, (space.id, request.account_id))
                if membership is not None and membership.status == "active":
                    raise DomainError(409, "ALREADY_MEMBER", "This person is already a member.")
                members = database.scalar(select(func.count()).select_from(SpaceMembership).where(
                    SpaceMembership.space_id == space.id, SpaceMembership.status == "active",
                ))
                if members >= spaces_service.MAX_FAMILY_MEMBERS:
                    raise DomainError(409, "SPACE_FULL", "This group is full.")
                self.spaces.check_account_capacity(database, request.account_id)
                if membership is None:
                    membership = SpaceMembership(space_id=space.id, account_id=request.account_id)
                    database.add(membership)
                # Like an accepted invitation: a new admission, so history from earlier admissions stays hidden.
                membership.admission_id = str(uuid4())
                membership.role = "member"
                membership.status = "active"
                membership.joined_at = now
                space.admission_sequence += 1
                membership.admission_sequence = space.admission_sequence
                space.version += 1
                request.admission_id = membership.admission_id
            request.status = terminal
            request.resolved_at = now
            request.resolved_by_id = caller.id
            self.record(database, space.id, caller.id, request.id, f"space.join_request_{terminal}")
            return self.request_view(request)
