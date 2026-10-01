from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.identity.models import OutboxEvent, User
from app.modules.messaging.models import Conversation, ConversationMessage, ConversationReadState
from app.modules.messaging.schemas import ConversationCursor, ConversationView, MessageView, ParticipantView
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_DIRECT_CONVERSATIONS_PER_SPACE = 200
MAX_MESSAGES_PER_CONVERSATION = 10000
MAX_MESSAGES_PER_MINUTE = 30


def not_found(subject="Conversation"):
    return DomainError(404, "NOT_FOUND", f"{subject} not found.")


class MessagingService:
    def __init__(self, spaces, cipher):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock
        self.cipher = cipher

    @staticmethod
    def access_conditions(account_id):
        return (
            Space.status == "active",
            SpaceMembership.status == "active",
            or_(
                Conversation.kind == "space",
                and_(Conversation.first_account_id == account_id, Conversation.first_admission_id == SpaceMembership.admission_id),
                and_(Conversation.second_account_id == account_id, Conversation.second_admission_id == SpaceMembership.admission_id),
            ),
        )

    @staticmethod
    def base_expression():
        # Space chat history starts at the viewer's current admission; direct conversations start with both admissions.
        earlier = aliased(ConversationMessage)
        before_admission = (
            select(func.max(earlier.sequence))
            .where(earlier.conversation_id == Conversation.id, earlier.admissions_before < SpaceMembership.admission_sequence)
            .correlate(Conversation, SpaceMembership).scalar_subquery()
        )
        return case((Conversation.kind == "space", func.coalesce(before_admission, 0)), else_=0)

    @staticmethod
    def read_expression(account_id):
        return func.coalesce(
            select(ConversationReadState.read_sequence).where(
                ConversationReadState.conversation_id == Conversation.id,
                ConversationReadState.account_id == account_id,
                ConversationReadState.admission_id == SpaceMembership.admission_id,
            ).correlate(Conversation, SpaceMembership).scalar_subquery(),
            0,
        )

    @staticmethod
    def unread_expression(account_id, base, read):
        message = aliased(ConversationMessage)
        return (
            select(func.count()).select_from(message).where(
                message.conversation_id == Conversation.id,
                message.sender_id != account_id,
                message.deleted_at.is_(None),
                message.sequence > func.greatest(base, read),
            ).correlate(Conversation, SpaceMembership).scalar_subquery()
        )

    def joined(self, statement, account_id):
        return statement.join(Space, Space.id == Conversation.space_id).join(
            SpaceMembership,
            and_(SpaceMembership.space_id == Conversation.space_id, SpaceMembership.account_id == account_id),
        ).where(*self.access_conditions(account_id))

    def rows(self, account_id):
        base = self.base_expression()
        read = self.read_expression(account_id)
        unread = self.unread_expression(account_id, base, read)
        activity = func.coalesce(Conversation.last_message_at, Conversation.created_at)
        statement = select(
            Conversation, Space, SpaceMembership,
            base.label("base"), read.label("read"), unread.label("unread"), activity.label("activity"),
        )
        return self.joined(statement, account_id), activity

    def authorized(self, database, conversation_id, account_id):
        statement, _activity = self.rows(account_id)
        row = database.execute(
            statement.where(Conversation.id == conversation_id).execution_options(populate_existing=True)
        ).first()
        if row is None:
            raise not_found()
        return row

    def build(self, database, row, account_id):
        conversation, space, membership, base, read, unread, _activity = row
        base = int(base or 0)
        last_position = max(conversation.last_sequence - base, 0)
        read_position = min(max(int(read or 0) - base, 0), last_position)
        participants = []
        title = space.name
        can_send = True
        if conversation.kind == "direct":
            users = {
                user.id: user for user in database.scalars(
                    select(User).where(User.id.in_([conversation.first_account_id, conversation.second_account_id]))
                )
            }
            participants = [
                ParticipantView(account_id=user_id, display_name=users[user_id].display_name)
                for user_id in (conversation.first_account_id, conversation.second_account_id)
            ]
            other_id, other_admission = (
                (conversation.second_account_id, conversation.second_admission_id)
                if conversation.first_account_id == account_id
                else (conversation.first_account_id, conversation.first_admission_id)
            )
            title = users[other_id].display_name
            can_send = self.counterpart_current(database, conversation.space_id, other_id, other_admission, users[other_id])
        return ConversationView(
            id=conversation.id, space_id=space.id, space_name=space.name, kind=conversation.kind,
            title=title, participants=participants, can_send=can_send,
            last_position=str(last_position), read_position=str(read_position), unread_count=int(unread or 0),
            last_message_at=conversation.last_message_at if last_position > 0 else None,
            created_at=conversation.created_at,
        )

    @staticmethod
    def counterpart_current(database, space_id, account_id, admission_id, user):
        membership = database.get(SpaceMembership, (space_id, account_id), populate_existing=True)
        return (
            user.status == "active" and membership is not None and membership.status == "active"
            and membership.admission_id == admission_id
        )

    def record(self, database, space_id, actor_id, target_id, action):
        identifier = str(uuid4())
        now = self.clock()
        database.add_all([
            SpaceAuditEvent(id=identifier, space_id=space_id, actor_id=actor_id, target_id=target_id, action=action, created_at=now),
            OutboxEvent(id=identifier, event_type=action, actor_id=actor_id, aggregate_id=space_id, schema_version=1, created_at=now),
        ])

    def open(self, token, space_id, body):
        participant_id = str(body.participant_account_id) if body.participant_account_id else None
        with self.sessions.begin() as database:
            caller, accounts = self.spaces.lock_accounts(database, token, [participant_id] if participant_id else [])
            space = self.spaces.lock_space(database, space_id)
            member = database.get(SpaceMembership, (space.id, caller.id), populate_existing=True)
            if member is None or member.status != "active":
                raise not_found("Space")
            self.identity.authenticate(database, token, lock=True)
            if body.kind == "space":
                existing = database.scalar(select(Conversation).where(Conversation.space_id == space.id, Conversation.kind == "space"))
                if existing is not None:
                    return self.build(database, self.authorized(database, existing.id, caller.id), caller.id)
                conversation = Conversation(id=str(uuid4()), space_id=space.id, kind="space")
            else:
                other = accounts.get(participant_id)
                other_member = database.get(SpaceMembership, (space.id, participant_id), populate_existing=True) if other else None
                if (
                    participant_id == caller.id or other is None or other.status != "active"
                    or other_member is None or other_member.status != "active"
                ):
                    raise DomainError(409, "CONVERSATION_UNAVAILABLE", "This member is not available for a direct conversation.")
                (first_id, first_admission), (second_id, second_admission) = sorted(
                    [(caller.id, member.admission_id), (other.id, other_member.admission_id)]
                )
                existing = database.scalar(select(Conversation).where(
                    Conversation.space_id == space.id, Conversation.kind == "direct",
                    Conversation.first_account_id == first_id, Conversation.second_account_id == second_id,
                    Conversation.first_admission_id == first_admission, Conversation.second_admission_id == second_admission,
                ))
                if existing is not None:
                    return self.build(database, self.authorized(database, existing.id, caller.id), caller.id)
                count = database.scalar(select(func.count()).select_from(Conversation).where(
                    Conversation.space_id == space.id, Conversation.kind == "direct",
                ))
                if count >= MAX_DIRECT_CONVERSATIONS_PER_SPACE:
                    raise DomainError(409, "CONVERSATION_LIMIT_REACHED", "The local direct conversation limit for this Space was reached.")
                conversation = Conversation(
                    id=str(uuid4()), space_id=space.id, kind="direct",
                    first_account_id=first_id, second_account_id=second_id,
                    first_admission_id=first_admission, second_admission_id=second_admission,
                )
            conversation.created_by_id = caller.id
            conversation.last_sequence = 0
            conversation.created_at = self.clock()
            database.add(conversation)
            database.flush()
            self.record(database, space.id, caller.id, conversation.id, "conversation.created")
            return self.build(database, self.authorized(database, conversation.id, caller.id), caller.id)

    def read(self, token, conversation_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            return self.build(database, self.authorized(database, conversation_id, caller.id), caller.id)

    def list_conversations(self, token, limit, cursor=None, space_id=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            statement, activity = self.rows(caller.id)
            if space_id:
                statement = statement.where(Conversation.space_id == space_id)
            if cursor:
                try:
                    position = ConversationCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload your conversations.") from None
                expected_space = str(position.space_id) if position.space_id else None
                if str(position.account_id) != caller.id or expected_space != space_id:
                    raise DomainError(400, "CURSOR_INVALID", "Reload your conversations.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload your conversations.")
                statement = statement.where(or_(
                    activity < position.after_activity,
                    and_(activity == position.after_activity, Conversation.id < str(position.after_id)),
                ))
            rows = database.execute(statement.order_by(activity.desc(), Conversation.id.desc()).limit(limit + 1)).all()
            page = rows[:limit]
            has_more = len(rows) > limit
            next_cursor = None
            if has_more:
                last = page[-1]
                next_cursor = self.security.seal(ConversationCursor(
                    kind="conversation_list", account_id=caller.id, space_id=space_id,
                    after_activity=last.activity, after_id=last[0].id,
                    expires_at=self.clock() + timedelta(minutes=15),
                ).model_dump_json())
            base = self.base_expression()
            read = self.read_expression(caller.id)
            counts = self.joined(
                select(self.unread_expression(caller.id, base, read).label("unread")).select_from(Conversation), caller.id,
            ).subquery()
            total = database.scalar(select(func.coalesce(func.sum(counts.c.unread), 0)))
            return (
                [self.build(database, row, caller.id) for row in page],
                Pagination(next_cursor=next_cursor, has_more=has_more),
                int(total or 0),
            )

    def message_view(self, message, sender, account_id, base, body=None):
        status = "sent"
        text = None
        if message.deleted_at is not None:
            status = "deleted"
        else:
            text = body if body is not None else self.cipher.open(message.conversation_id, message.id, message.body_cipher)
            if text is None:
                status = "unavailable"
        mine = message.sender_id == account_id
        return MessageView(
            id=message.id, conversation_id=message.conversation_id, position=str(message.sequence - base),
            sender_account_id=message.sender_id, sender_name=sender.display_name, mine=mine,
            client_message_id=message.client_message_id if mine else None,
            status=status, body=text, created_at=message.created_at, deleted_at=message.deleted_at,
        )

    def messages(self, token, conversation_id, limit, before=None, after=None):
        if before is not None and after is not None:
            raise DomainError(400, "INVALID_REQUEST", "Choose earlier or newer messages, not both.")
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            row = self.authorized(database, conversation_id, caller.id)
            base = int(row.base or 0)
            statement = select(ConversationMessage, User).join(User, User.id == ConversationMessage.sender_id).where(
                ConversationMessage.conversation_id == conversation_id, ConversationMessage.sequence > base,
            )
            if after is not None:
                statement = statement.where(ConversationMessage.sequence > base + after).order_by(ConversationMessage.sequence)
            else:
                if before is not None:
                    statement = statement.where(ConversationMessage.sequence < base + before)
                statement = statement.order_by(ConversationMessage.sequence.desc())
            rows = database.execute(statement.limit(limit + 1)).all()
            page = rows[:limit]
            has_more = len(rows) > limit
            if after is None:
                page = list(reversed(page))
            views = [self.message_view(message, sender, caller.id, base) for message, sender in page]
            next_cursor = None
            if has_more:
                next_cursor = views[-1].position if after is not None else views[0].position
            return views, Pagination(next_cursor=next_cursor, has_more=has_more)

    def lock_conversation(self, database, conversation_id):
        conversation = database.scalar(
            select(Conversation).where(Conversation.id == conversation_id).with_for_update()
            .execution_options(populate_existing=True)
        )
        if conversation is None:
            raise not_found()
        return conversation

    def send(self, token, conversation_id, body, key):
        with self.identity.signed_in_write(token) as (database, caller):
            space_id = database.scalar(select(Conversation.space_id).where(Conversation.id == conversation_id))
            if space_id is None:
                raise not_found()
            # Admissions and departures lock the Space exclusively, so both stay unchanged until this message commits.
            space = self.spaces.lock_space(database, space_id, active=False, shared=True)
            conversation = self.lock_conversation(database, conversation_id)
            row = self.authorized(database, conversation_id, caller.id)
            membership = row[2]
            base = int(row.base or 0)
            digest = self.security.digest("conversation.message", conversation.id, body.body)
            existing = database.scalar(select(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation.id,
                ConversationMessage.sender_id == caller.id,
                ConversationMessage.client_message_id == key,
            ))
            if existing is not None:
                if existing.sender_admission_id != membership.admission_id or existing.sequence <= base:
                    raise not_found("Message")
                if existing.request_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original message.")
                return self.message_view(existing, caller, caller.id, base)
            if not self.build(database, row, caller.id).can_send:
                raise DomainError(409, "CONVERSATION_READ_ONLY", "This conversation is read-only because a participant is no longer a current member.")
            if conversation.last_sequence >= MAX_MESSAGES_PER_CONVERSATION:
                raise DomainError(409, "CONVERSATION_FULL", "The local message limit for this conversation was reached.")
            now = self.clock()
            recent = database.scalar(select(func.count()).select_from(ConversationMessage).where(
                ConversationMessage.sender_id == caller.id, ConversationMessage.created_at > now - timedelta(minutes=1),
            ))
            if recent >= MAX_MESSAGES_PER_MINUTE:
                raise DomainError(429, "MESSAGE_RATE_LIMITED", "You are sending messages quickly. Wait a minute, then retry.")
            conversation.last_sequence += 1
            conversation.last_message_at = now
            message = ConversationMessage(
                id=str(uuid4()), conversation_id=conversation.id, sequence=conversation.last_sequence,
                sender_id=caller.id, sender_admission_id=membership.admission_id, client_message_id=key,
                request_digest=digest, admissions_before=space.admission_sequence, created_at=now,
            )
            message.body_cipher = self.cipher.seal(conversation.id, message.id, body.body)
            database.add_all([
                message,
                OutboxEvent(id=str(uuid4()), event_type="conversation.message_sent", actor_id=caller.id,
                            aggregate_id=conversation.id, schema_version=1, created_at=now),
            ])
            database.flush()
            return self.message_view(message, caller, caller.id, base, body=body.body)

    def delete(self, token, conversation_id, message_id):
        with self.identity.signed_in_write(token) as (database, caller):
            conversation = self.lock_conversation(database, conversation_id)
            row = self.authorized(database, conversation_id, caller.id)
            membership = row[2]
            base = int(row.base or 0)
            message = database.scalar(
                select(ConversationMessage).where(
                    ConversationMessage.id == message_id, ConversationMessage.conversation_id == conversation.id,
                ).with_for_update().execution_options(populate_existing=True)
            )
            if message is None or message.sequence <= base:
                raise not_found("Message")
            if message.sender_id != caller.id or message.sender_admission_id != membership.admission_id:
                raise DomainError(403, "MESSAGE_NOT_YOURS", "Only the author can delete this message.")
            if message.deleted_at is None:
                message.deleted_at = self.clock()
                message.body_cipher = None
                self.record(database, conversation.space_id, caller.id, message.id, "conversation.message_deleted")
            return self.message_view(message, caller, caller.id, base)

    def mark_read(self, token, conversation_id, body):
        with self.identity.signed_in_write(token) as (database, caller):
            row = self.authorized(database, conversation_id, caller.id)
            conversation, _space, membership = row[0], row[1], row[2]
            base = int(row.base or 0)
            position = int(body.through_position)
            if position > max(conversation.last_sequence - base, 0):
                raise DomainError(409, "READ_POSITION_INVALID", "Reload the conversation before marking it read.")
            statement = insert(ConversationReadState).values(
                conversation_id=conversation.id, account_id=caller.id, admission_id=membership.admission_id,
                read_sequence=base + position, updated_at=self.clock(),
            )
            statement = statement.on_conflict_do_update(
                index_elements=[ConversationReadState.conversation_id, ConversationReadState.account_id],
                set_={
                    "read_sequence": case(
                        (ConversationReadState.admission_id == statement.excluded.admission_id,
                         func.greatest(ConversationReadState.read_sequence, statement.excluded.read_sequence)),
                        else_=statement.excluded.read_sequence,
                    ),
                    "admission_id": statement.excluded.admission_id,
                    "updated_at": statement.excluded.updated_at,
                },
            )
            database.execute(statement)
            return self.build(database, self.authorized(database, conversation_id, caller.id), caller.id)
