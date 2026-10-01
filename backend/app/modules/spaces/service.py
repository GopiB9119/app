from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.identity.models import AccountSession, OutboxEvent, User
from app.modules.spaces.models import OwnershipTransfer, Space, SpaceAuditEvent, SpaceInvitation, SpaceJoinRequest, SpaceMembership, SpaceMembershipCommand, SpaceSettingsCommand
from app.modules.spaces.schemas import (
    InvitationCursor,
    InvitationOutcome,
    InvitationView,
    MembershipOutcome,
    OwnershipTransferCursor,
    OwnershipTransferView,
    Pagination,
    SpaceCursor,
    SpaceMemberView,
    SpaceSettingsView,
    SpaceView,
)

MAX_ACCOUNT_SPACES = 50
MAX_FAMILY_MEMBERS = 50
MAX_COUPLE_MEMBERS = 2
MAX_SPACE_INVITATIONS = 200
OWNERSHIP_OFFER_LIFETIME = timedelta(minutes=15)
OWNERSHIP_AUTH_MAX_AGE = timedelta(minutes=15)
MAX_OWNERSHIP_OFFERS = 100
# DEC-018: admins help the owner with membership; roles are changed only by the owner.
MANAGERS = ("owner", "admin")
ROLE_SPACE_TYPES = ("family", "group")
# DEC-026: a member who may invite keeps at most this many invitations waiting in one Space.
MAX_MEMBER_WAITING_INVITATIONS = 10


class SpaceService:
    def __init__(self, identity):
        self.identity = identity
        self.sessions = identity.sessions
        self.security = identity.security
        self.clock = identity.clock

    @staticmethod
    def visible_spaces(account_id):
        return (
            select(Space, SpaceMembership)
            .join(SpaceMembership, SpaceMembership.space_id == Space.id)
            .where(
                SpaceMembership.account_id == account_id,
                SpaceMembership.status == "active",
                Space.status == "active",
            )
        )

    @staticmethod
    def view(space, membership):
        return SpaceView(
            id=space.id,
            name=space.name,
            description=space.description,
            space_type=space.space_type,
            visibility=space.visibility,
            member_invites=space.member_invites,
            status=space.status,
            role=membership.role,
            version=str(space.version),
            created_at=space.created_at,
        )

    def read(self, token, identifier):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            row = database.execute(
                self.visible_spaces(user.id).where(Space.id == identifier)
            ).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Space not found.")
            return self.view(*row)

    def settings_view(self, space, membership):
        view = self.view(space, membership)
        etag = '"' + self.security.digest("space.settings", membership.admission_id, view.model_dump_json()) + '"'
        return SpaceSettingsView(**view.model_dump(), etag=etag)

    def read_settings(self, token, identifier):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            row = database.execute(self.visible_spaces(caller.id).where(
                Space.id == identifier, SpaceMembership.role == "owner",
            )).first()
            if row is None:
                raise DomainError(404, "NOT_FOUND", "Space settings not found.")
            return self.settings_view(*row)

    def edit_settings(self, token, identifier, body, key, expected):
        with self.sessions.begin() as database:
            caller, _accounts = self.lock_accounts(database, token, [])
            space = self.lock_space(database, identifier)
            self.require_owner(database, identifier, caller.id, lock=True)
            member = database.get(SpaceMembership, (identifier, caller.id))
            self.identity.authenticate(database, token, lock=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current Space name first.")
            digest = self.security.digest("space.settings.command", body.model_dump_json(), expected)
            receipt = database.scalar(select(SpaceSettingsCommand).where(
                SpaceSettingsCommand.space_id == identifier, SpaceSettingsCommand.actor_id == caller.id,
                SpaceSettingsCommand.request_key == key,
            ))
            if receipt is not None:
                if receipt.actor_admission_id != member.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Space settings not found.")
                if receipt.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed settings request.")
                return self.settings_view(space, member)
            if expected != self.settings_view(space, member).etag:
                raise DomainError(412, "SPACE_CHANGED", "This Space changed. Reload and review the name.")
            now = self.clock()
            pending_invitation = database.scalar(select(SpaceInvitation.id).where(
                SpaceInvitation.space_id == identifier, SpaceInvitation.status == "pending",
                SpaceInvitation.expires_at > now,
            ).limit(1))
            pending_transfer = database.scalar(select(OwnershipTransfer.id).where(
                OwnershipTransfer.space_id == identifier, OwnershipTransfer.status == "pending",
                OwnershipTransfer.expires_at > now,
            ).limit(1))
            # People asked to join what they saw; the name and description wait until those requests are answered.
            pending_request = database.scalar(select(SpaceJoinRequest.id).where(
                SpaceJoinRequest.space_id == identifier, SpaceJoinRequest.status == "pending",
                SpaceJoinRequest.expires_at > now,
            ).limit(1))
            if pending_invitation or pending_transfer or pending_request:
                raise DomainError(409, "SPACE_REVIEW_PENDING", "Answer pending invitations, join requests and ownership offers before changing the name or description.")
            description = space.description if body.description is None else body.description
            if body.name == space.name and description == space.description:
                raise DomainError(409, "NO_CHANGES", "The Space already has this name and description.")
            count = database.scalar(select(func.count()).select_from(SpaceSettingsCommand).where(SpaceSettingsCommand.space_id == identifier))
            if count >= 500:
                raise DomainError(409, "SETTINGS_LIMIT_REACHED", "The local Space settings limit was reached.")
            self.identity.authenticate(database, token, lock=True)
            action = "space.renamed" if body.name != space.name else "space.description_changed"
            space.name = body.name
            space.description = description
            space.version += 1
            event_id = str(uuid4())
            database.add_all([
                SpaceAuditEvent(id=event_id, space_id=identifier, actor_id=caller.id, target_id=identifier,
                                action=action, created_at=self.clock()),
                OutboxEvent(id=event_id, event_type=action, actor_id=caller.id,
                            aggregate_id=identifier, schema_version=1, created_at=self.clock()),
            ])
            database.flush()
            database.add(SpaceSettingsCommand(id=event_id, space_id=identifier, actor_id=caller.id,
                actor_admission_id=member.admission_id, request_key=key, request_digest=digest))
            return self.settings_view(space, member)

    def change_invite_policy(self, token, identifier, body, key, expected):
        """The owner lets every member of a family or group invite people, or only the owner and admins (DEC-026)."""
        with self.sessions.begin() as database:
            caller, _accounts = self.lock_accounts(database, token, [])
            space = self.lock_space(database, identifier)
            self.require_owner(database, identifier, caller.id, lock=True)
            member = database.get(SpaceMembership, (identifier, caller.id))
            self.identity.authenticate(database, token, lock=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current Space settings first.")
            digest = self.security.digest("space.invite_policy.command", str(body.member_invites), expected)
            receipt = database.scalar(select(SpaceSettingsCommand).where(
                SpaceSettingsCommand.space_id == identifier, SpaceSettingsCommand.actor_id == caller.id,
                SpaceSettingsCommand.request_key == key,
            ))
            if receipt is not None:
                if receipt.actor_admission_id != member.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Space settings not found.")
                if receipt.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed invitation setting.")
                return self.settings_view(space, member)
            if expected != self.settings_view(space, member).etag:
                raise DomainError(412, "SPACE_CHANGED", "This Space changed. Reload and review it again.")
            if space.space_type not in ROLE_SPACE_TYPES:
                raise DomainError(409, "INVITE_POLICY_UNAVAILABLE", "Only family and group Spaces can let members invite.")
            if body.member_invites == space.member_invites:
                raise DomainError(409, "NO_CHANGES", "This Space already has this setting.")
            count = database.scalar(select(func.count()).select_from(SpaceSettingsCommand).where(SpaceSettingsCommand.space_id == identifier))
            if count >= 500:
                raise DomainError(409, "SETTINGS_LIMIT_REACHED", "The local Space settings limit was reached.")
            # Members' waiting invitations are not changed: they admit only while this setting is on (see may_invite).
            space.member_invites = body.member_invites
            space.version += 1
            action = "space.member_invites_on" if body.member_invites else "space.member_invites_off"
            event_id = str(uuid4())
            now = self.clock()
            database.add_all([
                SpaceAuditEvent(id=event_id, space_id=identifier, actor_id=caller.id, target_id=identifier,
                                action=action, created_at=now),
                OutboxEvent(id=event_id, event_type=action, actor_id=caller.id,
                            aggregate_id=identifier, schema_version=1, created_at=now),
            ])
            database.flush()
            database.add(SpaceSettingsCommand(id=event_id, space_id=identifier, actor_id=caller.id,
                actor_admission_id=member.admission_id, request_key=key, request_digest=digest))
            return self.settings_view(space, member)

    def membership_etag(self, membership):
        value = ":".join((membership.space_id, membership.account_id, membership.admission_id, membership.role, membership.status))
        return '"' + self.security.digest("space.membership", value) + '"'

    def list_members(self, token, identifier):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            visible = self.visible_spaces(caller.id).with_only_columns(Space.id).correlate(None)
            members = database.execute(
                select(SpaceMembership, User).join(User, User.id == SpaceMembership.account_id)
                .where(SpaceMembership.space_id == identifier, SpaceMembership.status == "active",
                       SpaceMembership.space_id.in_(visible))
                .order_by(SpaceMembership.account_id).limit(MAX_FAMILY_MEMBERS + 1)
            ).all()
            if not members:
                raise DomainError(404, "NOT_FOUND", "Space not found.")
            if len(members) > MAX_FAMILY_MEMBERS:
                raise DomainError(503, "ROSTER_UNAVAILABLE", "The family roster is unavailable.")
            return [SpaceMemberView(account_id=membership.account_id, display_name=user.display_name,
                                    role=membership.role, joined_at=membership.joined_at,
                                    etag=self.membership_etag(membership)) for membership, user in members]

    def end_membership(self, token, space_id, target_id, action, key, expected):
        with self.sessions.begin() as database:
            caller, _accounts = self.lock_accounts(database, token, [target_id] if target_id else [])
            if action == "leave":
                target_id = caller.id
            space = self.lock_space(database, space_id, active=False)
            memberships = database.scalars(
                select(SpaceMembership).where(SpaceMembership.space_id == space.id,
                                             SpaceMembership.account_id.in_({caller.id, target_id}))
                .order_by(SpaceMembership.account_id).with_for_update().execution_options(populate_existing=True)
            ).all()
            by_account = {membership.account_id: membership for membership in memberships}
            actor = by_account.get(caller.id)
            target = by_account.get(target_id)
            receipt = database.scalar(select(SpaceMembershipCommand).where(
                SpaceMembershipCommand.space_id == space.id, SpaceMembershipCommand.actor_id == caller.id,
                SpaceMembershipCommand.request_key == key,
            ))
            # Only a current member, or a former member using the key of their own earlier command, may learn that this
            # private Space exists; anyone else gets exactly the answer for a missing Space (T42). A former member with
            # their own key keeps the earlier answers (the outcome, or 409 and 428 for a changed or missing review).
            if actor is None or (actor.status != "active" and receipt is None):
                raise DomainError(404, "NOT_FOUND", "Space not found.")
            # The caller's own earlier command on these same admissions is answered from its receipt, even after they lost the role or left.
            replay = (receipt is not None and target is not None and receipt.action == action
                      and receipt.actor_admission_id == actor.admission_id and receipt.target_admission_id == target.admission_id)
            if target is None or (action == "remove" and not replay and (actor.role not in MANAGERS or actor.status != "active")):
                raise DomainError(404, "NOT_FOUND", "Membership not found.")
            self.identity.authenticate(database, token, lock=True)
            if target.role == "owner":
                raise DomainError(409, "OWNER_REQUIRED", "The owner must remain in this family Space.")
            if action == "remove" and not replay and actor.role == "admin" and target.role == "admin":
                raise DomainError(409, "OWNER_ONLY", "Only the owner can remove an admin.")
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current member before continuing.")
            digest = self.security.digest("space.membership.command", ":".join((action, target_id, expected)))
            if receipt is not None:
                if receipt.actor_admission_id != actor.admission_id or receipt.target_admission_id != target.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Membership not found.")
                if receipt.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed membership command.")
                if target.status != "removed":
                    raise DomainError(409, "MEMBERSHIP_CHANGED", "Membership changed. Review it again.")
                return MembershipOutcome(space_id=space.id, account_id=target.account_id)
            if actor.status != "active" or target.status != "active":
                raise DomainError(404, "NOT_FOUND", "Membership not found.")
            if expected != self.membership_etag(target):
                raise DomainError(412, "MEMBERSHIP_CHANGED", "Membership changed. Review it again.")
            target.status = "removed"
            self.end_invitations_from(database, space.id, target.account_id, caller.id)
            space.version += 1
            identifier = str(uuid4())
            event_type = "space.member_left" if action == "leave" else "space.member_removed"
            now = self.clock()
            database.add_all([
                SpaceAuditEvent(id=identifier, space_id=space.id, actor_id=caller.id, target_id=target.account_id,
                                action=event_type, created_at=now),
                OutboxEvent(id=identifier, event_type=event_type, actor_id=caller.id,
                            aggregate_id=space.id, schema_version=1, created_at=now),
            ])
            database.flush()
            database.add(SpaceMembershipCommand(id=identifier, space_id=space.id, actor_id=caller.id,
                actor_admission_id=actor.admission_id, target_id=target.account_id,
                target_admission_id=target.admission_id, action=action, request_key=key, request_digest=digest))
            return MembershipOutcome(space_id=space.id, account_id=target.account_id)

    def member_view(self, database, membership):
        user = database.get(User, membership.account_id)
        return SpaceMemberView(account_id=membership.account_id, display_name=user.display_name, role=membership.role,
                               joined_at=membership.joined_at, etag=self.membership_etag(membership))

    def change_role(self, token, space_id, target_id, role, key, expected):
        """The owner makes a reviewed member an admin, or an admin a member again (DEC-018)."""
        action = "make_admin" if role == "admin" else "make_member"
        with self.sessions.begin() as database:
            caller, _accounts = self.lock_accounts(database, token, [target_id])
            space = self.lock_space(database, space_id)
            memberships = database.scalars(
                select(SpaceMembership).where(SpaceMembership.space_id == space.id,
                                             SpaceMembership.account_id.in_({caller.id, target_id}))
                .order_by(SpaceMembership.account_id).with_for_update().execution_options(populate_existing=True)
            ).all()
            by_account = {membership.account_id: membership for membership in memberships}
            actor, target = by_account.get(caller.id), by_account.get(target_id)
            if actor is None or actor.status != "active":
                raise DomainError(404, "NOT_FOUND", "Space not found.")
            receipt = database.scalar(select(SpaceMembershipCommand).where(
                SpaceMembershipCommand.space_id == space.id, SpaceMembershipCommand.actor_id == caller.id,
                SpaceMembershipCommand.request_key == key,
            ))
            # The caller's own earlier role change is answered from its receipt, even after they handed over ownership.
            replay = (receipt is not None and target is not None and receipt.action == action
                      and receipt.actor_admission_id == actor.admission_id and receipt.target_admission_id == target.admission_id)
            if (actor.role != "owner" and not replay) or target is None or target.status != "active" or target.account_id == caller.id:
                raise DomainError(404, "NOT_FOUND", "Membership not found.")
            self.identity.authenticate(database, token, lock=True)
            if space.space_type not in ROLE_SPACE_TYPES:
                raise DomainError(409, "ROLE_NOT_AVAILABLE", "Admins exist only in family and group Spaces.")
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current member before continuing.")
            digest = self.security.digest("space.membership.command", ":".join((action, target_id, expected)))
            if receipt is not None:
                if receipt.actor_admission_id != actor.admission_id or receipt.target_admission_id != target.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Membership not found.")
                if receipt.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed role change.")
                return self.member_view(database, target)
            if target.role == "owner":
                raise DomainError(409, "OWNER_REQUIRED", "Hand over ownership instead.")
            if expected != self.membership_etag(target):
                raise DomainError(412, "MEMBERSHIP_CHANGED", "Membership changed. Review it again.")
            if target.role == role:
                raise DomainError(409, "NO_CHANGES", "This person already has that role.")
            target.role = role
            if role == "member":
                self.end_invitations_from(database, space.id, target.account_id, caller.id)
            space.version += 1
            identifier = str(uuid4())
            event_type = "space.member_made_admin" if role == "admin" else "space.admin_made_member"
            now = self.clock()
            database.add_all([
                SpaceAuditEvent(id=identifier, space_id=space.id, actor_id=caller.id, target_id=target.account_id,
                                action=event_type, created_at=now),
                OutboxEvent(id=identifier, event_type=event_type, actor_id=caller.id,
                            aggregate_id=space.id, schema_version=1, created_at=now),
            ])
            database.flush()
            database.add(SpaceMembershipCommand(id=identifier, space_id=space.id, actor_id=caller.id,
                actor_admission_id=actor.admission_id, target_id=target.account_id,
                target_admission_id=target.admission_id, action=action, request_key=key, request_digest=digest))
            return self.member_view(database, target)

    def list_spaces(self, token, limit, cursor=None):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            statement = self.visible_spaces(user.id)
            if cursor:
                try:
                    position = SpaceCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload your Spaces.") from None
                if str(position.account_id) != user.id:
                    raise DomainError(400, "CURSOR_INVALID", "Reload your Spaces.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload your Spaces.")
                statement = statement.where(Space.id > str(position.after_id))
            rows = database.execute(statement.order_by(Space.id).limit(limit + 1)).all()
            has_more = len(rows) > limit
            page = rows[:limit]
            next_cursor = None
            if has_more:
                next_cursor = self.security.seal(
                    SpaceCursor(
                        kind="space_list",
                        account_id=user.id,
                        after_id=page[-1][0].id,
                        expires_at=self.clock() + timedelta(minutes=15),
                    ).model_dump_json()
                )
            return (
                [self.view(*row) for row in page],
                Pagination(next_cursor=next_cursor, has_more=has_more),
            )

    def create(self, token, body, key):
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token, lock=True)
            existing = database.scalar(
                select(Space).where(Space.created_by_id == user.id, Space.creation_key == key)
            )
            digest = self.security.digest("space.create", body.model_dump_json())
            if existing:
                row = database.execute(
                    self.visible_spaces(user.id).where(Space.id == existing.id)
                ).first()
                if row is None:
                    raise DomainError(404, "NOT_FOUND", "Space not found.")
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed Space details.")
                return self.view(*row)

            count = database.scalar(
                select(func.count()).select_from(Space).where(Space.created_by_id == user.id)
            )
            if count >= 50:
                raise DomainError(409, "SPACE_LIMIT_REACHED", "This local build allows 50 Spaces per account.")
            self.check_account_capacity(database, user.id)
            now = self.clock()
            space = Space(
                id=str(uuid4()),
                name=body.name,
                description=body.description,
                space_type=body.space_type,
                visibility=body.visibility,
                status="active",
                version=1,
                admission_sequence=1,
                created_by_id=user.id,
                creation_key=key,
                creation_digest=digest,
                created_at=now,
            )
            database.add(space)
            database.flush()
            membership = SpaceMembership(
                space_id=space.id,
                account_id=user.id,
                role="owner",
                status="active",
                joined_at=now,
                admission_sequence=1,
            )
            event_id = str(uuid4())
            database.add_all(
                [
                    membership,
                    SpaceAuditEvent(
                        id=event_id,
                        space_id=space.id,
                        actor_id=user.id,
                        target_id=space.id,
                        action="space.created",
                        created_at=now,
                    ),
                    OutboxEvent(
                        id=event_id,
                        event_type="space.created",
                        actor_id=user.id,
                        aggregate_id=space.id,
                        schema_version=1,
                        created_at=now,
                    ),
                ]
            )
            return self.view(space, membership)

    @staticmethod
    def check_account_capacity(database, account_id):
        count = database.scalar(
            select(func.count()).select_from(SpaceMembership).where(
                SpaceMembership.account_id == account_id, SpaceMembership.status == "active"
            )
        )
        if count >= MAX_ACCOUNT_SPACES:
            raise DomainError(409, "SPACE_LIMIT_REACHED", "The local account Space limit was reached.")

    def lock_accounts(self, database, token, account_ids):
        caller, _session = self.identity.authenticate(database, token)
        locked = database.scalars(
            select(User).where(User.id.in_({caller.id, *account_ids})).order_by(User.id)
            .with_for_update().execution_options(populate_existing=True)
        ).all()
        caller, _session = self.identity.authenticate(database, token, lock=True)
        return caller, {user.id: user for user in locked}

    @staticmethod
    def lock_space(database, identifier, active=True, shared=False):
        space = database.scalar(
            select(Space).where(Space.id == identifier).with_for_update(read=shared)
            .execution_options(populate_existing=True)
        )
        if space is None or (active and space.status != "active"):
            raise DomainError(404, "NOT_FOUND", "Space not found.")
        return space

    @staticmethod
    def require_owner(database, space_id, account_id, lock=False):
        statement = select(SpaceMembership).where(
            SpaceMembership.space_id == space_id,
            SpaceMembership.account_id == account_id,
            SpaceMembership.role == "owner",
            SpaceMembership.status == "active",
        )
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        if database.scalar(statement) is None:
            raise DomainError(404, "NOT_FOUND", "Space not found.")

    @staticmethod
    def require_manager(database, space_id, account_id, lock=False):
        """The owner or an admin; anyone else gets the missing-Space answer."""
        statement = select(SpaceMembership).where(
            SpaceMembership.space_id == space_id,
            SpaceMembership.account_id == account_id,
            SpaceMembership.role.in_(MANAGERS),
            SpaceMembership.status == "active",
        )
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        if database.scalar(statement) is None:
            raise DomainError(404, "NOT_FOUND", "Space not found.")

    @staticmethod
    def may_invite(database, space, account_id, lock=False):
        """The owner or an admin, or any member while the Space lets members invite (DEC-026).

        Pass the Space row read under its lock, so the setting cannot change underneath.
        """
        roles = MANAGERS
        if space.member_invites and space.space_type in ROLE_SPACE_TYPES:
            roles = (*MANAGERS, "member")
        statement = select(SpaceMembership).where(
            SpaceMembership.space_id == space.id,
            SpaceMembership.account_id == account_id,
            SpaceMembership.role.in_(roles),
            SpaceMembership.status == "active",
        )
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        membership = database.scalar(statement)
        if membership is None:
            raise DomainError(404, "NOT_FOUND", "Space not found.")
        return membership

    def invitation_view(self, invitation, space, inviter):
        status = invitation.status
        if status == "pending" and invitation.expires_at <= self.clock():
            status = "expired"
        return InvitationView(
            id=invitation.id,
            space_id=space.id,
            space_name=space.name,
            inviter_name=inviter.display_name,
            recipient_account_id=invitation.recipient_id,
            status=status,
            created_at=invitation.created_at,
            expires_at=invitation.expires_at,
        )

    def end_invitations_from(self, database, space_id, inviter_id, actor_id):
        """An invitation is valid only while its sender is the owner or an admin (DEC-018). When they stop being one, their
        waiting invitations end, as on a handover of ownership, so a later return to the role cannot revive them."""
        invitations = database.scalars(select(SpaceInvitation).where(
            SpaceInvitation.space_id == space_id, SpaceInvitation.inviter_id == inviter_id,
            SpaceInvitation.status == "pending",
        ).with_for_update()).all()
        for invitation in invitations:
            invitation.status = "revoked"
            invitation.resolved_at = self.clock()
            self.record_invitation(database, invitation, actor_id, "space.invitation_revoked")

    def record_invitation(self, database, invitation, actor_id, action):
        identifier = str(uuid4())
        now = self.clock()
        database.add_all([
            SpaceAuditEvent(
                id=identifier, space_id=invitation.space_id, actor_id=actor_id,
                target_id=invitation.id, action=action, created_at=now,
            ),
            OutboxEvent(
                id=identifier, event_type=action, actor_id=actor_id,
                aggregate_id=invitation.space_id, schema_version=1, created_at=now,
            ),
        ])

    def check_couple_invitation(self, database, space_id, now):
        # Called under the Space lock, so two owners' requests cannot both take the partner's place.
        members = database.scalar(select(func.count()).select_from(SpaceMembership).where(
            SpaceMembership.space_id == space_id, SpaceMembership.status == "active",
        ))
        if members >= MAX_COUPLE_MEMBERS:
            raise DomainError(409, "COUPLE_FULL", "This couple Space already has two people.")
        waiting = database.scalar(select(func.count()).select_from(SpaceInvitation).where(
            SpaceInvitation.space_id == space_id, SpaceInvitation.status == "pending",
            SpaceInvitation.expires_at > now,
        ))
        if waiting:
            raise DomainError(
                409, "COUPLE_INVITATION_PENDING",
                "Your partner's invitation is still waiting. Cancel it before inviting someone else.",
            )

    def invite(self, token, space_id, body, key):
        recipient_id = str(body.recipient_account_id)
        with self.sessions.begin() as database:
            caller, accounts = self.lock_accounts(database, token, [recipient_id])
            space = self.lock_space(database, space_id)
            inviter = self.may_invite(database, space, caller.id, lock=True)
            self.identity.authenticate(database, token, lock=True)
            if space.space_type == "solo":
                raise DomainError(409, "SOLO_OWNER_ONLY", "Solo Spaces cannot invite another person.")
            existing = database.scalar(select(SpaceInvitation).where(
                SpaceInvitation.space_id == space.id,
                SpaceInvitation.inviter_id == caller.id,
                SpaceInvitation.request_key == key,
            ))
            if existing:
                if existing.recipient_id != recipient_id:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed recipient.")
                return self.invitation_view(existing, space, caller)
            recipient = accounts.get(recipient_id)
            if (
                recipient is None or recipient.id == caller.id or recipient.status != "active"
                or recipient.verified_at is None
            ):
                raise DomainError(409, "INVITATION_UNAVAILABLE", "This invitation cannot be created.")
            former = database.get(SpaceMembership, (space.id, recipient.id))
            if former is not None and former.status != "removed":
                raise DomainError(409, "INVITATION_UNAVAILABLE", "This invitation cannot be created.")
            now = self.clock()
            pending = database.scalar(select(SpaceInvitation).where(
                SpaceInvitation.space_id == space.id, SpaceInvitation.recipient_id == recipient.id,
                SpaceInvitation.status == "pending",
            ).with_for_update())
            if pending:
                if pending.expires_at > now:
                    raise DomainError(409, "INVITATION_PENDING", "An invitation is already pending.")
                pending.status = "expired"
                pending.resolved_at = now
                database.flush()
            if space.space_type == "couple":
                self.check_couple_invitation(database, space.id, now)
            if inviter.role not in MANAGERS:
                waiting = database.scalar(select(func.count()).select_from(SpaceInvitation).where(
                    SpaceInvitation.space_id == space.id, SpaceInvitation.inviter_id == caller.id,
                    SpaceInvitation.status == "pending", SpaceInvitation.expires_at > now,
                ))
                if waiting >= MAX_MEMBER_WAITING_INVITATIONS:
                    raise DomainError(
                        409, "INVITATION_LIMIT_REACHED",
                        f"You can have up to {MAX_MEMBER_WAITING_INVITATIONS} waiting invitations in this Space.",
                    )
            count = database.scalar(
                select(func.count()).select_from(SpaceInvitation)
                .where(SpaceInvitation.space_id == space.id)
            )
            if count >= MAX_SPACE_INVITATIONS:
                raise DomainError(409, "INVITATION_LIMIT_REACHED", "The local invitation limit was reached.")
            invitation = SpaceInvitation(
                id=str(uuid4()), space_id=space.id, inviter_id=caller.id,
                recipient_id=recipient.id, request_key=key, status="pending",
                created_at=now, expires_at=now + timedelta(hours=72),
            )
            database.add(invitation)
            self.record_invitation(database, invitation, caller.id, "space.invitation_created")
            return self.invitation_view(invitation, space, caller)

    def list_invitations(self, token, limit, cursor=None, space_id=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            statement = (
                select(SpaceInvitation, Space, User)
                .join(Space, Space.id == SpaceInvitation.space_id)
                .join(User, User.id == SpaceInvitation.inviter_id)
                .where(Space.status == "active")
            )
            kind = "space_invitations" if space_id else "invitation_inbox"
            if space_id:
                space = database.get(Space, space_id)
                if space is None:
                    raise DomainError(404, "NOT_FOUND", "Space not found.")
                membership = self.may_invite(database, space, caller.id)
                statement = statement.where(SpaceInvitation.space_id == space_id)
                if membership.role not in MANAGERS:
                    # A member who may invite sees only the invitations they sent (DEC-026).
                    statement = statement.where(SpaceInvitation.inviter_id == caller.id)
            else:
                statement = statement.join(SpaceMembership, and_(
                    SpaceMembership.space_id == Space.id,
                    SpaceMembership.account_id == SpaceInvitation.inviter_id,
                )).where(
                    SpaceInvitation.recipient_id == caller.id,
                    SpaceInvitation.status == "pending",
                    SpaceInvitation.expires_at > self.clock(),
                    User.status == "active",
                    or_(
                        SpaceMembership.role.in_(MANAGERS),
                        and_(
                            SpaceMembership.role == "member", Space.member_invites.is_(True),
                            Space.space_type.in_(ROLE_SPACE_TYPES),
                        ),
                    ),
                    SpaceMembership.status == "active",
                )
            if cursor:
                try:
                    position = InvitationCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload invitations.") from None
                expected_space = str(position.space_id) if position.space_id else None
                if str(position.account_id) != caller.id or position.kind != kind or expected_space != space_id:
                    raise DomainError(400, "CURSOR_INVALID", "Reload invitations.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload invitations.")
                statement = statement.where(SpaceInvitation.id > str(position.after_id))
            rows = database.execute(statement.order_by(SpaceInvitation.id).limit(limit + 1)).all()
            page = rows[:limit]
            has_more = len(rows) > limit
            next_cursor = None
            if has_more:
                next_cursor = self.security.seal(InvitationCursor(
                    kind=kind, account_id=caller.id, space_id=space_id,
                    after_id=page[-1][0].id, expires_at=self.clock() + timedelta(minutes=15),
                ).model_dump_json())
            return (
                [self.invitation_view(*row) for row in page],
                Pagination(next_cursor=next_cursor, has_more=has_more),
            )

    def respond_to_invitation(self, token, identifier, action, space_id=None):
        with self.sessions.begin() as database:
            caller, _session = self.identity.authenticate(database, token)
            statement = select(SpaceInvitation).where(SpaceInvitation.id == identifier)
            if action == "revoke":
                statement = statement.where(SpaceInvitation.space_id == space_id)
            else:
                statement = statement.where(SpaceInvitation.recipient_id == caller.id)
            snapshot = database.scalar(statement)
            if snapshot is None:
                raise DomainError(404, "NOT_FOUND", "Invitation not found.")
            caller, accounts = self.lock_accounts(
                database, token, [snapshot.inviter_id, snapshot.recipient_id]
            )
            space = self.lock_space(database, snapshot.space_id, active=action != "decline")
            if action == "accept" and space.space_type == "solo":
                raise DomainError(409, "SOLO_OWNER_ONLY", "Solo Spaces cannot admit another person.")
            invitation = database.scalar(
                statement.with_for_update().execution_options(populate_existing=True)
            )
            if action == "revoke":
                # The owner and admins withdraw any invitation; a member only the ones they sent (DEC-026).
                member = database.scalar(select(SpaceMembership).where(
                    SpaceMembership.space_id == space.id, SpaceMembership.account_id == caller.id,
                    SpaceMembership.status == "active",
                ).with_for_update().execution_options(populate_existing=True))
                if member is None or (member.role not in MANAGERS and invitation.inviter_id != caller.id):
                    # Someone who knows an invitation but no longer owns its Space learns nothing new (T42).
                    raise DomainError(404, "NOT_FOUND", "Invitation not found.")
            if action == "accept" and invitation.status == "pending":
                inviter = accounts[invitation.inviter_id]
                if inviter.status != "active" or inviter.verified_at is None:
                    raise DomainError(409, "INVITATION_UNAVAILABLE", "This invitation is unavailable.")
                # The invitation holds only while the person who sent it may still invite: the owner, an admin,
                # or a member while the Space lets members invite.
                self.may_invite(database, space, inviter.id, lock=True)
            self.identity.authenticate(database, token, lock=True)
            membership = database.get(SpaceMembership, (space.id, caller.id))
            if action == "accept" and invitation.status == "accepted":
                if (
                    membership is None or membership.status != "active"
                    or membership.admission_id != invitation.accepted_admission_id
                ):
                    raise DomainError(404, "NOT_FOUND", "Invitation not found.")
                return self.view(space, membership)
            terminal = {"decline": "declined", "revoke": "revoked"}.get(action)
            if terminal and invitation.status == terminal:
                return InvitationOutcome(id=invitation.id, status=terminal)
            if invitation.status != "pending":
                raise DomainError(409, "INVITATION_CLOSED", "This invitation is no longer pending.")
            now = self.clock()
            if invitation.expires_at <= now:
                raise DomainError(410, "INVITATION_EXPIRED", "This invitation has expired.")
            if action == "accept":
                if membership is not None and membership.status != "removed":
                    raise DomainError(409, "INVITATION_UNAVAILABLE", "This invitation cannot grant membership.")
                count = database.scalar(
                    select(func.count()).select_from(SpaceMembership).where(
                        SpaceMembership.space_id == space.id, SpaceMembership.status == "active"
                    )
                )
                if count >= MAX_FAMILY_MEMBERS:
                    raise DomainError(409, "FAMILY_FULL", "The local family member limit was reached.")
                if space.space_type == "couple" and count >= MAX_COUPLE_MEMBERS:
                    raise DomainError(409, "COUPLE_FULL", "This couple Space already has two people.")
                self.check_account_capacity(database, caller.id)
                if membership is None:
                    membership = SpaceMembership(space_id=space.id, account_id=caller.id)
                    database.add(membership)
                # A rejoin is a new admission, so grants bound to the earlier admission stay unavailable.
                membership.admission_id = str(uuid4())
                membership.role = "member"
                membership.status = "active"
                membership.joined_at = now
                space.admission_sequence += 1
                membership.admission_sequence = space.admission_sequence
                invitation.status = "accepted"
                invitation.accepted_admission_id = membership.admission_id
                space.version += 1
            else:
                invitation.status = terminal
            invitation.resolved_at = now
            self.record_invitation(
                database, invitation, caller.id, f"space.invitation_{invitation.status}"
            )
            if action == "accept":
                return self.view(space, membership)
            return InvitationOutcome(id=invitation.id, status=terminal)


class OwnershipTransferService:
    def __init__(self, spaces):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock

    def recent(self, database, token):
        caller, session = self.identity.authenticate(database, token, lock=True)
        if self.clock() - session.created_at > OWNERSHIP_AUTH_MAX_AGE:
            raise DomainError(403, "REAUTHENTICATION_REQUIRED", "Sign in again before changing family ownership.")
        return caller, session

    @staticmethod
    def active_member(database, space_id, account_id):
        return database.scalar(select(SpaceMembership.account_id).where(
            SpaceMembership.space_id == space_id, SpaceMembership.account_id == account_id,
            SpaceMembership.status == "active",
        )) is not None

    def participants(self, database, space_id, from_id, to_id, lock=False):
        statement = select(SpaceMembership, User).join(User, User.id == SpaceMembership.account_id).where(
            SpaceMembership.space_id == space_id, SpaceMembership.account_id.in_({from_id, to_id}),
            SpaceMembership.status == "active", User.status == "active", User.verified_at.is_not(None),
        ).order_by(SpaceMembership.account_id).execution_options(populate_existing=True)
        if lock:
            statement = statement.with_for_update(of=SpaceMembership)
        members = {row[0].account_id: row for row in database.execute(statement)}
        if len(members) != 2:
            raise DomainError(404, "NOT_FOUND", "Ownership transfer not available.")
        return members[from_id], members[to_id]

    def active_status(self, database, transfer, space, sender, recipient):
        if transfer.status != "pending":
            return transfer.status
        if transfer.expires_at <= self.clock():
            return "expired"
        session = database.get(AccountSession, transfer.from_session_id, populate_existing=True)
        if (space.status != "active" or space.version != transfer.source_version
                or sender[0].role != "owner" or recipient[0].role not in ("member", "admin")
                or sender[0].admission_id != transfer.from_admission_id or recipient[0].admission_id != transfer.to_admission_id
                or session is None or session.account_id != transfer.from_account_id or session.revoked_at is not None
                or session.expires_at <= self.clock()):
            return "invalidated"
        return "pending"

    def etag(self, transfer):
        return '"' + self.security.digest("ownership.transfer", transfer.id, str(transfer.version), transfer.status) + '"'

    def view(self, database, transfer, space, sender, recipient):
        return OwnershipTransferView(
            id=transfer.id, space_id=space.id, space_name=space.name,
            from_account_id=sender[1].id, from_name=sender[1].display_name,
            to_account_id=recipient[1].id, to_name=recipient[1].display_name,
            status=self.active_status(database, transfer, space, sender, recipient),
            created_at=transfer.created_at, expires_at=transfer.expires_at, resolved_at=transfer.resolved_at,
            version=str(transfer.version), etag=self.etag(transfer),
        )

    def record(self, database, transfer, actor_id, action):
        identifier = str(uuid4())
        database.add_all([
            SpaceAuditEvent(id=identifier, space_id=transfer.space_id, actor_id=actor_id, target_id=transfer.id, action=action, created_at=self.clock()),
            OutboxEvent(id=identifier, event_type=action, actor_id=actor_id, aggregate_id=transfer.space_id, schema_version=1, created_at=self.clock()),
        ])

    def create(self, token, space_id, body, key, expected):
        recipient_id = str(body.recipient_account_id)
        with self.sessions.begin() as database:
            caller, _accounts = self.spaces.lock_accounts(database, token, [recipient_id])
            space = self.spaces.lock_space(database, space_id)
            if space.space_type == "solo":
                self.spaces.require_owner(database, space_id, caller.id)
                raise DomainError(409, "SOLO_OWNER_ONLY", "Solo Space ownership cannot be transferred.")
            if not self.active_member(database, space_id, caller.id):
                raise DomainError(404, "NOT_FOUND", "Space not found.")
            sender, recipient = self.participants(database, space_id, caller.id, recipient_id, lock=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the intended next owner first.")
            digest = self.security.digest("ownership.offer", space_id, recipient_id, expected)
            existing = database.scalar(select(OwnershipTransfer).where(
                OwnershipTransfer.space_id == space_id, OwnershipTransfer.from_account_id == caller.id, OwnershipTransfer.request_key == key,
            ))
            if existing:
                if (existing.from_admission_id, existing.to_admission_id) != (sender[0].admission_id, recipient[0].admission_id):
                    raise DomainError(404, "NOT_FOUND", "Ownership transfer not available.")
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Review the changed ownership offer.")
                self.identity.authenticate(database, token, lock=True)
                return self.view(database, existing, space, sender, recipient)
            if sender[0].role != "owner" or recipient[0].role not in ("member", "admin"):
                raise DomainError(404, "NOT_FOUND", "Ownership transfer not available.")
            if expected != self.spaces.membership_etag(recipient[0]):
                raise DomainError(412, "MEMBERSHIP_CHANGED", "The intended owner changed. Reload and review again.")
            pending = database.scalar(select(OwnershipTransfer).where(OwnershipTransfer.space_id == space_id, OwnershipTransfer.status == "pending").with_for_update())
            if pending:
                stale = pending.expires_at <= self.clock() or pending.source_version != space.version
                old_session = database.get(AccountSession, pending.from_session_id, populate_existing=True)
                stale = stale or old_session is None or old_session.revoked_at is not None or old_session.expires_at <= self.clock()
                if not stale:
                    raise DomainError(409, "OWNERSHIP_OFFER_PENDING", "Cancel the current ownership offer before starting another.")
                pending.status = "expired" if pending.expires_at <= self.clock() else "invalidated"
                pending.resolved_at = self.clock()
                pending.version += 1
                self.record(database, pending, caller.id, f"space.ownership_{pending.status}")
                database.flush()
            count = database.scalar(select(func.count()).select_from(OwnershipTransfer).where(OwnershipTransfer.space_id == space_id))
            if count >= MAX_OWNERSHIP_OFFERS:
                raise DomainError(409, "OWNERSHIP_OFFER_LIMIT", "The local ownership offer limit was reached.")
            caller, session = self.recent(database, token)
            now = self.clock()
            transfer = OwnershipTransfer(
                id=str(uuid4()), space_id=space_id, from_account_id=caller.id, to_account_id=recipient_id,
                from_admission_id=sender[0].admission_id, to_admission_id=recipient[0].admission_id,
                from_session_id=session.id, source_version=space.version, request_key=key, request_digest=digest,
                status="pending", version=1, created_at=now, expires_at=min(now + OWNERSHIP_OFFER_LIFETIME, session.expires_at),
            )
            database.add(transfer)
            database.flush()
            self.record(database, transfer, caller.id, "space.ownership_offered")
            return self.view(database, transfer, space, sender, recipient)

    def context(self, database, token, space_id, identifier, action):
        caller, _session = self.identity.authenticate(database, token)
        transfer = database.get(OwnershipTransfer, identifier)
        if transfer is None or transfer.space_id != space_id:
            raise DomainError(404, "NOT_FOUND", "Ownership transfer not found.")
        expected_actor = transfer.from_account_id if action == "cancel" else transfer.to_account_id
        if caller.id != expected_actor:
            raise DomainError(404, "NOT_FOUND", "Ownership transfer not found.")
        caller, _accounts = self.spaces.lock_accounts(database, token, [transfer.from_account_id, transfer.to_account_id])
        space = self.spaces.lock_space(database, space_id, active=action == "accept")
        transfer = database.scalar(select(OwnershipTransfer).where(OwnershipTransfer.id == identifier).with_for_update().execution_options(populate_existing=True))
        if not self.active_member(database, space_id, caller.id):
            # A participant who has left gets the same answer as for a missing Space (T42).
            raise DomainError(404, "NOT_FOUND", "Ownership transfer not found.")
        sender, recipient = self.participants(database, space_id, transfer.from_account_id, transfer.to_account_id, lock=True)
        if (sender[0].admission_id, recipient[0].admission_id) != (transfer.from_admission_id, transfer.to_admission_id):
            raise DomainError(404, "NOT_FOUND", "Ownership transfer not found.")
        self.identity.authenticate(database, token, lock=True)
        return caller, transfer, space, sender, recipient

    def respond(self, token, space_id, identifier, action, expected):
        outcome = {"accept": "accepted", "decline": "declined", "cancel": "cancelled"}[action]
        with self.sessions.begin() as database:
            caller, transfer, space, sender, recipient = self.context(database, token, space_id, identifier, action)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Review the exact ownership offer first.")
            if transfer.status == outcome:
                if transfer.decision_etag != expected:
                    raise DomainError(409, "OWNERSHIP_OFFER_CHANGED", "Use the original reviewed action to reconcile this offer.")
                return self.view(database, transfer, space, sender, recipient)
            if transfer.status != "pending":
                raise DomainError(409, "OWNERSHIP_OFFER_CLOSED", "This ownership offer has already ended.")
            if expected != self.etag(transfer):
                raise DomainError(412, "OWNERSHIP_OFFER_CHANGED", "Reload and review this offer again.")
            if action == "accept":
                invitations = database.scalars(select(SpaceInvitation).where(
                    SpaceInvitation.space_id == space_id, SpaceInvitation.inviter_id == sender[1].id,
                    SpaceInvitation.status == "pending",
                ).with_for_update()).all()
                self.recent(database, token)
                state = self.active_status(database, transfer, space, sender, recipient)
                if state == "expired":
                    raise DomainError(410, "OWNERSHIP_OFFER_EXPIRED", "This ownership offer expired.")
                if state != "pending":
                    raise DomainError(409, "OWNERSHIP_OFFER_INVALIDATED", "The ownership offer is no longer valid.")
                sender[0].role = "member"
                database.flush()
                recipient[0].role = "owner"
                space.version += 1
                for invitation in invitations:
                    invitation.status = "revoked"
                    invitation.resolved_at = self.clock()
                    self.spaces.record_invitation(database, invitation, caller.id, "space.invitation_revoked")
            transfer.status = outcome
            transfer.resolved_at = self.clock()
            transfer.decision_etag = expected
            transfer.version += 1
            self.record(database, transfer, caller.id, f"space.ownership_{outcome}")
            return self.view(database, transfer, space, sender, recipient)

    def list_transfers(self, token, space_id, limit, cursor=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            viewer = database.scalar(select(SpaceMembership).join(Space).where(
                SpaceMembership.space_id == space_id, SpaceMembership.account_id == caller.id,
                SpaceMembership.status == "active", Space.status == "active",
            ))
            if viewer is None:
                raise DomainError(404, "NOT_FOUND", "Space not found.")
            admission_id = viewer.admission_id
            sender_member, recipient_member = aliased(SpaceMembership), aliased(SpaceMembership)
            sender_user, recipient_user = aliased(User), aliased(User)
            statement = (select(OwnershipTransfer, Space, sender_member, sender_user, recipient_member, recipient_user)
                .join(Space, Space.id == OwnershipTransfer.space_id)
                .join(sender_member, and_(sender_member.space_id == Space.id, sender_member.account_id == OwnershipTransfer.from_account_id, sender_member.admission_id == OwnershipTransfer.from_admission_id))
                .join(recipient_member, and_(recipient_member.space_id == Space.id, recipient_member.account_id == OwnershipTransfer.to_account_id, recipient_member.admission_id == OwnershipTransfer.to_admission_id))
                .join(sender_user, sender_user.id == sender_member.account_id)
                .join(recipient_user, recipient_user.id == recipient_member.account_id)
                .where(OwnershipTransfer.space_id == space_id, Space.status == "active", sender_member.status == "active", recipient_member.status == "active",
                       sender_user.status == "active", recipient_user.status == "active",
                      sender_user.verified_at.is_not(None), recipient_user.verified_at.is_not(None),
                      or_(and_(sender_member.account_id == caller.id, sender_member.admission_id == admission_id),
                          and_(recipient_member.account_id == caller.id, recipient_member.admission_id == admission_id)))
                .execution_options(populate_existing=True))
            if cursor:
                try:
                    position = OwnershipTransferCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload ownership offers.") from None
                if (str(position.account_id), str(position.admission_id), str(position.space_id)) != (caller.id, admission_id, space_id):
                    raise DomainError(400, "CURSOR_INVALID", "Reload ownership offers.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload ownership offers.")
                statement = statement.where(OwnershipTransfer.id > str(position.after_id))
            rows = database.execute(statement.order_by(OwnershipTransfer.id).limit(limit + 1)).all()
            page = rows[:limit]
            has_more = len(rows) > limit
            next_cursor = None
            if has_more:
                next_cursor = self.security.seal(OwnershipTransferCursor(kind="ownership_transfers", account_id=caller.id, admission_id=admission_id,
                    space_id=space_id, after_id=page[-1][0].id, expires_at=self.clock() + timedelta(minutes=15)).model_dump_json())
            return [self.view(database, row[0], row[1], (row[2], row[3]), (row[4], row[5])) for row in page], Pagination(next_cursor=next_cursor, has_more=has_more)