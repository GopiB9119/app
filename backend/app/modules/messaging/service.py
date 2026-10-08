from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy import delete as delete_rows
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.identity.models import OutboxEvent, RateBucket, User
from app.modules.messaging.mentions import AGENT_NAME, agent_identity, mentions_agent
from app.modules.messaging.models import (
    REACTIONS,
    Conversation,
    ConversationAgentMention,
    ConversationMessage,
    ConversationMessageReaction,
    ConversationReadState,
)
from app.modules.messaging.schemas import (
    REPLY_EXCERPT_CHARACTERS,
    AgentRequestView,
    ConversationCursor,
    ConversationView,
    MessageView,
    ParticipantView,
    ReactionView,
    ReplyView,
    TypingInput,
    TypingView,
)
from app.modules.realtime.hub import signal
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_DIRECT_CONVERSATIONS_PER_SPACE = 200
MAX_MESSAGES_PER_CONVERSATION = 10000
MAX_MESSAGES_PER_MINUTE = 30
# An author may correct a message for a short time only, and only a few times (DEC-033).
EDIT_WINDOW = timedelta(minutes=15)
MAX_EDITS_PER_MESSAGE = 10
TYPING_TTL_SECONDS = 8
MAX_TYPING_UPDATES_PER_MINUTE = 120


def not_found(subject="Conversation"):
    return DomainError(404, "NOT_FOUND", f"{subject} not found.")


def read_only():
    return DomainError(409, "CONVERSATION_READ_ONLY", "This conversation is read-only because a participant is no longer a current member.")


def agent_message():
    return DomainError(403, "AGENT_MESSAGE", "The agent's replies cannot be changed or deleted.")


def excerpt(text):
    """The start of a message on one line, as a reply shows it."""
    line = " ".join(text.split())
    return line if len(line) <= REPLY_EXCERPT_CHARACTERS else line[:REPLY_EXCERPT_CHARACTERS].rstrip() + "…"


class MessagingService:
    def __init__(self, spaces, cipher):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock
        self.cipher = cipher

    @property
    def max_messages(self):
        return MAX_MESSAGES_PER_CONVERSATION

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
    def unread_expression(account_id, base, read, latest=False):
        message = aliased(ConversationMessage)
        return (
            select(func.max(message.sequence) if latest else func.count()).select_from(message).where(
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

    @staticmethod
    def audience(database, conversation):
        """Who can see the conversation now: every current member for Space chat, the two current participants of a direct one."""
        statement = select(SpaceMembership.account_id).where(
            SpaceMembership.space_id == conversation.space_id, SpaceMembership.status == "active",
        )
        if conversation.kind == "direct":
            statement = statement.where(or_(
                and_(SpaceMembership.account_id == conversation.first_account_id, SpaceMembership.admission_id == conversation.first_admission_id),
                and_(SpaceMembership.account_id == conversation.second_account_id, SpaceMembership.admission_id == conversation.second_admission_id),
            ))
        return database.scalars(statement).all()

    def announce(self, database, conversation, reason, accounts=None):
        recipients = self.audience(database, conversation) if accounts is None else accounts
        signal(database, "conversation", recipients, conversation_id=conversation.id, space_id=conversation.space_id, reason=reason)

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
            self.announce(database, conversation, "opened")
            return self.build(database, self.authorized(database, conversation.id, caller.id), caller.id)

    def read(self, token, conversation_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            return self.build(database, self.authorized(database, conversation_id, caller.id), caller.id)

    def typing(self, token: str | None, conversation_id: str, body: TypingInput) -> TypingView:
        with self.identity.signed_in_write(token) as (database, caller):
            space_id = database.scalar(select(Conversation.space_id).where(Conversation.id == conversation_id))
            if space_id is None:
                raise not_found()
            # A departure cannot commit between checking the audience and delivering this transient notice.
            self.spaces.lock_space(database, space_id, shared=True)
            row = self.authorized(database, conversation_id, caller.id)
            if not self.build(database, row, caller.id).can_send:
                raise read_only()
            audience = set(self.audience(database, row[0]))
            if not {str(identifier) for identifier in body.mentioned_account_ids}.issubset(audience):
                raise DomainError(409, "TYPING_TARGET_UNAVAILABLE", "A mentioned person is no longer in this conversation.")
            now = self.clock()
            window = str(int(now.timestamp()) // 60)
            key = self.security.digest("conversation.typing.rate", caller.id, window)
            count = database.execute(
                insert(RateBucket).values(key=key, count=1, expires_at=now + timedelta(minutes=2))
                .on_conflict_do_update(index_elements=[RateBucket.key], set_={"count": RateBucket.count + 1})
                .returning(RateBucket.count)
            ).scalar_one()
            if count > MAX_TYPING_UPDATES_PER_MINUTE:
                raise DomainError(
                    429, "TYPING_RATE_LIMITED", "Typing updates are too frequent. Wait a moment.",
                    retry_after=60 - int(now.timestamp()) % 60,
                )
            view = TypingView(
                **body.model_dump(), conversation_id=conversation_id, space_id=space_id, account_id=caller.id,
                expires_at=now + timedelta(seconds=TYPING_TTL_SECONDS if body.is_typing else 0),
            )
            signal(database, "typing", audience - {caller.id}, **view.model_dump(mode="json", exclude={"kind"}))
            return view

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
            counts = database.execute(self.joined(select(
                Conversation.id,
                self.unread_expression(caller.id, base, read).label("unread"),
                self.unread_expression(caller.id, base, read, latest=True).label("latest"),
            ), caller.id).order_by(Conversation.id)).all()
            total = sum(row.unread for row in counts)
            marker = self.security.digest(
                "conversation.unread", caller.id,
                *(f"{row.id}:{row.unread}:{row.latest}" for row in counts if row.unread),
            )
            return (
                [self.build(database, row, caller.id) for row in page],
                Pagination(next_cursor=next_cursor, has_more=has_more),
                int(total or 0),
                marker,
            )

    def message_view(self, message, sender, account_id, base, body=None, reply=None, reactions=(), asked=None, agent_space=None):
        status = "sent"
        text = None
        if message.deleted_at is not None:
            status = "deleted"
        else:
            text = body if body is not None else self.cipher.open(message.conversation_id, message.id, message.body_cipher)
            if text is None:
                status = "unavailable"
        # The agent's reply (DEC-046) is kept with the member who asked, but every reader sees the Space's agent write it.
        agent = agent_space is not None
        mine = not agent and message.sender_id == account_id
        return MessageView(
            id=message.id, conversation_id=message.conversation_id, position=str(message.sequence - base),
            sender_account_id=agent_identity(agent_space) if agent else message.sender_id,
            sender_name=AGENT_NAME if agent else sender.display_name, mine=mine,
            client_message_id=message.client_message_id if mine else None,
            status=status, body=text, created_at=message.created_at, deleted_at=message.deleted_at,
            edited_at=message.edited_at, reply_to=reply, reactions=list(reactions), revision=message.revision,
            from_agent=agent,
            agent_request=AgentRequestView(status=asked.status, run_id=asked.run_id) if mine and asked is not None else None,
        )

    def reply_view(self, original, sender, base, agent=False):
        """The answered message as this viewer may see it; one from before their admission shows nothing about itself."""
        if original.sequence <= base:
            return ReplyView(message_id=original.id, status="unavailable", position=None, sender_name=None, excerpt=None)
        position = str(original.sequence - base)
        text = None if original.deleted_at is not None else self.cipher.open(original.conversation_id, original.id, original.body_cipher)
        status = "deleted" if original.deleted_at is not None else "sent" if text is not None else "unavailable"
        return ReplyView(
            message_id=original.id, status=status, position=position, sender_name=AGENT_NAME if agent else sender.display_name,
            excerpt=excerpt(text) if text is not None else None,
        )

    @staticmethod
    def agent_marks(database, ids):
        """Of these messages, which asked the agent, and which are its replies with the Space each belongs to (DEC-046)."""
        if not ids:
            return {}, {}
        rows = database.execute(
            select(ConversationAgentMention, Conversation.space_id)
            .join(Conversation, Conversation.id == ConversationAgentMention.conversation_id)
            .where(or_(ConversationAgentMention.message_id.in_(ids), ConversationAgentMention.reply_message_id.in_(ids)))
        ).all()
        asked = {mention.message_id: mention for mention, _space_id in rows}
        replies = {mention.reply_message_id: space_id for mention, space_id in rows if mention.reply_message_id}
        return asked, replies

    @staticmethod
    def from_agent(database, message_id):
        return database.scalar(
            select(ConversationAgentMention.message_id).where(ConversationAgentMention.reply_message_id == message_id)
        ) is not None

    def views(self, database, rows, account_id, base, bodies=None):
        """Views of (message, sender) rows with what they answer, their reactions and the agent's part, in three queries."""
        ids = [message.id for message, _sender in rows]
        reactions = {identifier: [] for identifier in ids}
        if ids:
            counted = database.execute(
                select(
                    ConversationMessageReaction.message_id, ConversationMessageReaction.reaction, func.count(),
                    func.bool_or(ConversationMessageReaction.account_id == account_id),
                ).where(ConversationMessageReaction.message_id.in_(ids))
                .group_by(ConversationMessageReaction.message_id, ConversationMessageReaction.reaction)
            ).all()
            for message_id, reaction, count, mine in sorted(counted, key=lambda item: REACTIONS.index(item[1])):
                reactions[message_id].append(ReactionView(reaction=reaction, count=count, mine=bool(mine)))
        answered = {message.reply_to_id for message, _sender in rows if message.reply_to_id}
        asked, agent_replies = self.agent_marks(database, [*ids, *answered])
        replies = {}
        if answered:
            originals = database.execute(
                select(ConversationMessage, User).join(User, User.id == ConversationMessage.sender_id)
                .where(ConversationMessage.id.in_(answered))
            ).all()
            replies = {
                original.id: self.reply_view(original, sender, base, agent=original.id in agent_replies)
                for original, sender in originals
            }
        return [
            self.message_view(
                message, sender, account_id, base, body=(bodies or {}).get(message.id),
                reply=replies.get(message.reply_to_id), reactions=reactions[message.id],
                asked=asked.get(message.id), agent_space=agent_replies.get(message.id),
            )
            for message, sender in rows
        ]

    def view(self, database, message, sender, account_id, base, body=None):
        return self.views(database, [(message, sender)], account_id, base, {message.id: body} if body is not None else None)[0]

    def message(self, token, conversation_id, message_id):
        """One message as the caller may see it now."""
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            row = self.authorized(database, conversation_id, caller.id)
            base = int(row.base or 0)
            found = database.execute(
                select(ConversationMessage, User).join(User, User.id == ConversationMessage.sender_id).where(
                    ConversationMessage.id == message_id, ConversationMessage.conversation_id == conversation_id,
                    ConversationMessage.sequence > base,
                ).execution_options(populate_existing=True)
            ).first()
            if found is None:
                raise not_found("Message")
            return self.view(database, found[0], found[1], caller.id, base)

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
            views = self.views(database, page, caller.id, base)
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
            reply_to = str(body.reply_to_message_id) if body.reply_to_message_id else None
            # A message that answers none keeps the digest it always had, so retries made before replies existed still match.
            digest = self.security.digest("conversation.message", conversation.id, body.body, *([reply_to] if reply_to else []))
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
                return self.view(database, existing, caller, caller.id, base)
            if not self.build(database, row, caller.id).can_send:
                raise read_only()
            if reply_to is not None:
                # The same answer whether the original never existed here, came before the sender joined, or was deleted.
                original = database.scalar(select(ConversationMessage).where(
                    ConversationMessage.id == reply_to, ConversationMessage.conversation_id == conversation.id,
                ))
                if original is None or original.sequence <= base or original.deleted_at is not None:
                    raise DomainError(409, "REPLY_UNAVAILABLE", "The message you are replying to is no longer available.")
            if conversation.last_sequence >= MAX_MESSAGES_PER_CONVERSATION:
                raise DomainError(409, "CONVERSATION_FULL", "The local message limit for this conversation was reached.")
            now = self.clock()
            recent = database.scalar(select(func.count()).select_from(ConversationMessage).where(
                ConversationMessage.sender_id == caller.id, ConversationMessage.created_at > now - timedelta(minutes=1),
            ))
            if recent >= MAX_MESSAGES_PER_MINUTE:
                raise DomainError(429, "MESSAGE_RATE_LIMITED", "You are sending messages quickly. Wait a minute, then retry.", retry_after=60)
            conversation.last_sequence += 1
            conversation.last_message_at = now
            message = ConversationMessage(
                id=str(uuid4()), conversation_id=conversation.id, sequence=conversation.last_sequence,
                sender_id=caller.id, sender_admission_id=membership.admission_id, client_message_id=key,
                request_digest=digest, admissions_before=space.admission_sequence, created_at=now, reply_to_id=reply_to,
            )
            message.body_cipher = self.cipher.seal(conversation.id, message.id, body.body)
            database.add_all([
                message,
                OutboxEvent(id=str(uuid4()), event_type="conversation.message_sent", actor_id=caller.id,
                            aggregate_id=conversation.id, schema_version=1, created_at=now),
            ])
            if mentions_agent(body.body):
                database.flush()
                # Saved with the message, so a message that asks the agent is never left without a record of it (DEC-046).
                database.add(ConversationAgentMention(
                    message_id=message.id, conversation_id=conversation.id, account_id=caller.id,
                    admission_id=membership.admission_id, status="pending", created_at=now, updated_at=now,
                ))
            database.flush()
            self.announce(database, conversation, "message")
            return self.view(database, message, caller, caller.id, base, body=body.body)

    def lock_message(self, database, conversation, message_id, base):
        """A message of a locked conversation that the caller can see, locked in the same order deletion uses."""
        message = database.scalar(
            select(ConversationMessage).where(
                ConversationMessage.id == message_id, ConversationMessage.conversation_id == conversation.id,
            ).with_for_update().execution_options(populate_existing=True)
        )
        if message is None or message.sequence <= base:
            raise not_found("Message")
        return message

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
            if self.from_agent(database, message.id):
                raise agent_message()
            if message.sender_id != caller.id or message.sender_admission_id != membership.admission_id:
                raise DomainError(403, "MESSAGE_NOT_YOURS", "Only the author can delete this message.")
            if message.deleted_at is None:
                message.deleted_at = self.clock()
                message.body_cipher = None
                message.revision += 1
                # Reactions were to what the message said; replies to it now say it was deleted (DEC-033).
                database.execute(delete_rows(ConversationMessageReaction).where(ConversationMessageReaction.message_id == message.id))
                self.record(database, conversation.space_id, caller.id, message.id, "conversation.message_deleted")
                self.announce(database, conversation, "deleted")
            return self.view(database, message, caller, caller.id, base)

    def edit(self, token, conversation_id, message_id, body):
        with self.identity.signed_in_write(token) as (database, caller):
            conversation = self.lock_conversation(database, conversation_id)
            row = self.authorized(database, conversation_id, caller.id)
            membership = row[2]
            base = int(row.base or 0)
            message = self.lock_message(database, conversation, message_id, base)
            if self.from_agent(database, message.id):
                raise agent_message()
            if message.sender_id != caller.id or message.sender_admission_id != membership.admission_id:
                raise DomainError(403, "MESSAGE_NOT_YOURS", "Only the author can edit this message.")
            if message.deleted_at is not None:
                raise DomainError(409, "MESSAGE_DELETED", "This message was deleted.")
            current = self.cipher.open(message.conversation_id, message.id, message.body_cipher)
            # The same text again changes nothing, so a retry of an edit that already happened succeeds.
            if current != body.body:
                if not self.build(database, row, caller.id).can_send:
                    raise read_only()
                now = self.clock()
                if now - message.created_at > EDIT_WINDOW:
                    raise DomainError(409, "EDIT_WINDOW_CLOSED", "A message can be edited for 15 minutes after it was sent.")
                if message.edit_count >= MAX_EDITS_PER_MESSAGE:
                    raise DomainError(409, "EDIT_LIMIT_REACHED", f"A message can be edited {MAX_EDITS_PER_MESSAGE} times.")
                # The earlier text is not kept (DEC-033).
                message.body_cipher = self.cipher.seal(conversation.id, message.id, body.body)
                message.edited_at = now
                message.edit_count += 1
                message.revision += 1
                self.record(database, conversation.space_id, caller.id, message.id, "conversation.message_edited")
                self.announce(database, conversation, "changed")
            return self.view(database, message, caller, caller.id, base, body=body.body)

    def react(self, token, conversation_id, message_id, body):
        with self.identity.signed_in_write(token) as (database, caller):
            conversation = self.lock_conversation(database, conversation_id)
            row = self.authorized(database, conversation_id, caller.id)
            base = int(row.base or 0)
            message = self.lock_message(database, conversation, message_id, base)
            if message.deleted_at is not None:
                raise DomainError(409, "MESSAGE_DELETED", "This message was deleted.")
            existing = database.get(ConversationMessageReaction, (message.id, caller.id, body.reaction))
            # Adding a reaction one already chose, or taking back one one never chose, changes nothing.
            if body.on != (existing is not None):
                if not self.build(database, row, caller.id).can_send:
                    raise read_only()
                if body.on:
                    database.add(ConversationMessageReaction(
                        message_id=message.id, account_id=caller.id, reaction=body.reaction, created_at=self.clock(),
                    ))
                else:
                    database.delete(existing)
                message.revision += 1
                database.flush()
                self.announce(database, conversation, "changed")
            sender = caller if message.sender_id == caller.id else database.get(User, message.sender_id)
            return self.view(database, message, sender, caller.id, base)

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
            # Only the reader's own other devices change: nobody else is shown how far someone has read.
            self.announce(database, conversation, "read", accounts=[caller.id])
            return self.build(database, self.authorized(database, conversation_id, caller.id), caller.id)
