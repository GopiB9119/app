"""Asking the agent from a chat message with @agent (DEC-046, DEC-061).

A message that mentions @agent, in any chat of a Space, becomes its author's own request to that Space's Agent: the
same rules, refusals and exact approval, with only the author's permissions. The agent replies in the chat as the
Space's agent, which is no account, never a member and holds no permission of its own.

Answers are private by default (DEC-061): the reply in the chat only says the author was answered, and only the author
reads the answer, in their private request under their message. The answer is shown to everyone only when the author
asks for that, in the request itself ("share it with everyone") or afterwards with Share, and only when everyone who
can read the chat may already see everything the answer names. Answers about the author alone are never shown. Changes
still wait for the author's approval."""

import re
import unicodedata
from threading import Lock
from uuid import uuid4, uuid5

from sqlalchemy import select

from app.errors import DomainError
from app.modules.agents.registry import NAMESPACE, agent_identity  # noqa: F401 - agent_identity is re-exported for chat code
from app.modules.agents.schemas import CreateAgentRun
from app.modules.files.models import SpaceDocument
from app.modules.identity.models import OutboxEvent, User
from app.modules.messaging.models import Conversation, ConversationAgentMention, ConversationMessage
from app.modules.messaging.schemas import BIDI_CONTROLS, MAX_MESSAGE_CHARACTERS
from app.modules.planning.models import Task
from app.telemetry import emit

AGENT_NAME = "Agent"
MAX_REQUEST_CHARACTERS = 500
# "@agent" as a word of its own: not part of an address such as name@agent.example or of a longer word.
MENTION = re.compile(r"(?<![\w@.])@agent\b", re.IGNORECASE)
RETRY = ("pending", "failed")
# A run still working has no reply yet; it comes when the run stops working.
WORKING = ("queued", "running")
STOPPED = {"AGENT_OFF": "off", "RATE_LIMITED": "limited", "AGENT_BUSY": "limited"}
# Answers about the person themselves never go into a chat, even one they are alone in: memories are never shared
# with a Space (DEC-012), and a chat copy would outlive the memory, interest or reminder it describes.
PERSONAL = ("list_memories", "remember", "list_interests", "schedule_reminder")
# Every member may see the policy that refused something and the Space's own details.
OPEN_EVIDENCE = ("policy", "space")
# A request that itself asks for the answer to be shown to everyone in the chat, such as "share it with everyone" or
# "show this message for all family members". Words like "the family" alone are not enough: "show the family
# calendar" asks for the calendar, not for sharing.
EVERYONE = re.compile(
    r"\b(?:share|show|post|send|tell)\b[^.?!\n]{0,40}?\b(?:(?:with|to|for)\s+(?:everyone|everybody|all of us"
    r"|all(?: the)?(?: family)? members)|(?:with|to)\s+(?:the (?:whole )?(?:family|group|chat)|this chat))\b"
    r"|\btell (?:everyone|everybody)\b",
    re.IGNORECASE,
)
SHAREABLE = ("private", "waiting")


def mentions_agent(text):
    return MENTION.search(text) is not None


def wants_everyone(request):
    return EVERYONE.search(request or "") is not None


def personal(run):
    """An answer about the person alone: by its intent, or by naming their memories or interests."""
    return run.intent in PERSONAL or any(item.kind in ("memory", "interests") for item in run.evidence)


def not_ready():
    return DomainError(409, "AGENT_ANSWER_NOT_READY", "There is no finished answer to share yet.")


def agent_request(text):
    """What a message asks the agent: its words without the mention, on one line, without control characters."""
    words = " ".join(MENTION.sub(" ", text).split())
    words = "".join(character for character in words if not unicodedata.category(character).startswith("C"))
    return words.strip(" ,:;-\u2013\u2014") or "help"


def request_key(message_id):
    return str(uuid5(NAMESPACE, f"agent-request:{message_id}"))


def reply_key(message_id):
    return str(uuid5(NAMESPACE, f"agent-reply:{message_id}"))


def allowed(character):
    category = unicodedata.category(character)
    return character not in BIDI_CONTROLS and category not in {"Cs", "Co", "Cn"} and (category != "Cc" or character in "\n\t")


def chat_text(text, more):
    """Text a chat message may hold, cut with [more] when it is longer than a message."""
    kept = "".join(character if allowed(character) else " " for character in text).strip()
    if len(kept) > MAX_MESSAGE_CHARACTERS:
        kept = kept[:MAX_MESSAGE_CHARACTERS - len(more)].rstrip() + more
    return kept


class AgentMentionService:
    def __init__(self, messaging, agents):
        self.messaging = messaging
        self.agents = agents
        self.identity = messaging.identity
        self.spaces = messaging.spaces
        self.sessions = messaging.sessions
        self.security = messaging.security
        self.clock = messaging.clock
        self.cipher = messaging.cipher

    def after_send(self, token, conversation_id, view):
        """Answers a message just sent. The message stays sent whatever happens here, and its author can ask again."""
        try:
            return self.answer(token, conversation_id, view.id)
        except DomainError as error:
            if error.status == 401:
                raise
            failure = error.code
        except Exception as error:  # noqa: BLE001 - the saved message must not be reported as unsent
            failure = type(error).__name__
        emit("agent_mention_failed", failure=failure)
        try:
            self.settle(conversation_id, view.id, "failed")
            return self.messaging.message(token, conversation_id, view.id)
        except Exception as error:  # noqa: BLE001
            emit("agent_mention_failed", failure=type(error).__name__)
            return view

    def answer(self, token, conversation_id, message_id):
        """Asks the agent about the caller's own message that mentions it. Once the agent has replied, or the request
        stopped for good, asking again changes nothing."""
        asked = self.open_request(token, conversation_id, message_id)
        if asked is not None:
            try:
                self.ask(token, conversation_id, message_id, *asked)
            except DomainError as error:
                if error.status == 401:
                    raise
                emit("agent_mention_failed", failure=error.code)
                self.settle(conversation_id, message_id, "failed")
        return self.messaging.message(token, conversation_id, message_id)

    def own(self, database, caller, conversation_id, message_id, lock=False):
        """The caller's own message that asked the agent, from their current admission, in a chat they can still read."""
        row = self.messaging.authorized(database, conversation_id, caller.id)
        conversation, membership, base = row[0], row[2], int(row.base or 0)
        statement = select(ConversationAgentMention).where(
            ConversationAgentMention.message_id == message_id, ConversationAgentMention.conversation_id == conversation.id,
        )
        if lock:
            statement = statement.with_for_update()
        mention = database.scalar(statement.execution_options(populate_existing=True))
        message = database.get(ConversationMessage, message_id, populate_existing=True) if mention else None
        if (
            mention is None or message is None or message.sequence <= base
            or mention.account_id != caller.id or mention.admission_id != membership.admission_id
        ):
            raise DomainError(404, "NOT_FOUND", "Message not found.")
        return mention, message, row

    def open_request(self, token, conversation_id, message_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            mention, message, row = self.own(database, caller, conversation_id, message_id)
            if mention.status not in RETRY or message.deleted_at is not None:
                return None
            return row[0].space_id, self.cipher.open(message.conversation_id, message.id, message.body_cipher)

    def ask(self, token, conversation_id, message_id, space_id, text):
        if text is None:
            return self.settle(conversation_id, message_id, "failed")
        request = agent_request(text)
        if len(request) > MAX_REQUEST_CHARACTERS:
            return self.settle(conversation_id, message_id, "too_long")

        reply_lock = Lock()
        reply_started = False

        def answered(run):
            nonlocal reply_started
            with reply_lock:
                if reply_started:
                    return None
                reply_started = True
            try:
                return self.reply(token, conversation_id, message_id, run)
            except Exception as error:  # noqa: BLE001 - the asker can still ask again from the message
                emit("agent_mention_failed", failure=getattr(error, "code", type(error).__name__))
                self.settle(conversation_id, message_id, "failed")

        try:
            run = self.agents.create_run(token, CreateAgentRun(space_id=space_id, message=request), request_key(message_id),
                                         origin="chat", on_settled=answered)
        except DomainError as error:
            if error.code not in STOPPED:
                raise
            return self.settle(conversation_id, message_id, STOPPED[error.code])
        if run.status in WORKING:
            return None
        return answered(run)

    def settle(self, conversation_id, message_id, status):
        """Records why no reply came. Only a request still without an answer changes."""
        with self.sessions.begin() as database:
            mention = database.scalar(select(ConversationAgentMention).where(
                ConversationAgentMention.message_id == message_id, ConversationAgentMention.conversation_id == conversation_id,
            ).with_for_update().execution_options(populate_existing=True))
            if mention is not None and mention.status in RETRY:
                mention.status, mention.updated_at = status, self.clock()

    def reply(self, token, conversation_id, message_id, run):
        with self.identity.signed_in_write(token) as (database, caller):
            space_id = database.scalar(select(Conversation.space_id).where(Conversation.id == conversation_id))
            if space_id is None:
                raise DomainError(404, "NOT_FOUND", "Conversation not found.")
            # The locks and their order of sending a message: nobody joins or leaves the chat until the reply commits.
            space = self.spaces.lock_space(database, space_id, active=False, shared=True)
            conversation = self.messaging.lock_conversation(database, conversation_id)
            mention, message, row = self.own(database, caller, conversation_id, message_id, lock=True)
            if mention.status not in RETRY:
                return None
            now = self.clock()
            if (
                message.deleted_at is not None or not self.messaging.build(database, row, caller.id).can_send
                or conversation.last_sequence >= self.messaging.max_messages
            ):
                mention.status, mention.run_id, mention.updated_at = "failed", run.id, now
                return None
            status, text = self.compose(database, conversation, caller, run)
            conversation.last_sequence += 1
            conversation.last_message_at = now
            reply = ConversationMessage(
                id=str(uuid4()), conversation_id=conversation.id, sequence=conversation.last_sequence, sender_id=caller.id,
                sender_admission_id=mention.admission_id, client_message_id=reply_key(message.id),
                request_digest=self.security.digest("conversation.agent_reply", conversation.id, message.id, run.id),
                admissions_before=space.admission_sequence, created_at=now, reply_to_id=message.id,
            )
            reply.body_cipher = self.cipher.seal(conversation.id, reply.id, text)
            database.add(reply)
            database.flush()
            mention.status, mention.run_id, mention.reply_message_id, mention.updated_at = status, run.id, reply.id, now
            database.add(OutboxEvent(
                id=str(uuid4()), event_type="conversation.agent_replied", actor_id=caller.id, aggregate_id=conversation.id,
                schema_version=1, created_at=now,
            ))
            database.flush()
            self.messaging.announce(database, conversation, "message")
            return reply.id

    def compose(self, database, conversation, caller, run):
        """What the reply says to everyone in the chat, and what that means for the request. The answer itself is in
        it only when the asker asked for everyone to see it and everyone here may already see what it names."""
        name = caller.display_name
        if run.status == "waiting_for_approval" and run.approval is not None:
            return "waiting", (f"{name}, I prepared this for you to approve: {run.approval.summary} Review your private request "
                               "here. Nothing changes until you approve it.")
        if run.status == "waiting_for_user":
            return "waiting", f"{name}, I need one more detail from you. Answer in your private request here."
        if run.status != "completed":
            return "private", f"I couldn't finish {name}'s request. Nothing was changed. {name} can see why in their private request."
        private = f"I answered {name} privately. Only {name} can see the answer, and they can share it with everyone here."
        if personal(run) or not wants_everyone(run.message):
            return "private", private
        if not self.shared(database, conversation, run.evidence):
            return "private", (f"I answered {name} privately, because the answer names things that not everyone in this chat "
                               "can see.")
        text = self.answer_text(run, name)
        return ("answered", text) if text else ("private", private)

    @staticmethod
    def answer_text(run, name):
        return chat_text(run.answer or "", f"\n\u2026 {name} has the full answer.")

    def share(self, token, conversation_id, message_id):
        """The author shows the agent's private answer to their message to everyone in the chat: the agent's reply
        becomes the answer. Refused when someone who reads the chat may not see everything the answer names, or when the
        answer is about the author alone. Sharing again changes nothing."""
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            mention, _message, _row = self.own(database, caller, conversation_id, message_id)
            status, run_id = mention.status, mention.run_id
        if status != "answered":
            if status not in SHAREABLE or run_id is None:
                raise not_ready()
            run = self.agents.read_run(token, run_id)
            if run.status != "completed" or not run.answer:
                raise not_ready()
            if personal(run):
                raise DomainError(409, "AGENT_ANSWER_PERSONAL", "Answers about you alone stay private.")
            self.publish(token, conversation_id, message_id, run)
            emit("agent_answer_shared")
        return self.messaging.message(token, conversation_id, message_id)

    def publish(self, token, conversation_id, message_id, run):
        with self.identity.signed_in_write(token) as (database, caller):
            space_id = database.scalar(select(Conversation.space_id).where(Conversation.id == conversation_id))
            if space_id is None:
                raise DomainError(404, "NOT_FOUND", "Conversation not found.")
            # The locks and their order of sending a message: nobody joins or leaves the chat until the answer commits.
            self.spaces.lock_space(database, space_id, active=False, shared=True)
            conversation = self.messaging.lock_conversation(database, conversation_id)
            mention, message, row = self.own(database, caller, conversation_id, message_id, lock=True)
            if mention.status == "answered":
                return
            if mention.status not in SHAREABLE or mention.run_id != run.id or message.deleted_at is not None:
                raise not_ready()
            if not self.messaging.build(database, row, caller.id).can_send:
                raise DomainError(409, "CONVERSATION_READ_ONLY",
                                  "This conversation is read-only because a participant is no longer a current member.")
            if not self.shared(database, conversation, run.evidence):
                raise DomainError(409, "AGENT_ANSWER_NOT_SHARED",
                                  "Not everyone in this chat can see everything this answer names, so it stays private.")
            text = self.answer_text(run, caller.display_name)
            reply = database.scalar(select(ConversationMessage).where(
                ConversationMessage.id == mention.reply_message_id, ConversationMessage.conversation_id == conversation.id,
            ).with_for_update().execution_options(populate_existing=True))
            if not text or reply is None or reply.deleted_at is not None:
                raise not_ready()
            now = self.clock()
            reply.body_cipher = self.cipher.seal(conversation.id, reply.id, text)
            reply.edited_at = now
            reply.edit_count += 1
            reply.revision += 1
            mention.status, mention.updated_at = "answered", now
            self.messaging.record(database, conversation.space_id, caller.id, reply.id, "conversation.agent_answer_shared")
            self.messaging.announce(database, conversation, "changed")

    def shared(self, database, conversation, evidence):
        """Whether everyone who can read the chat now may already see everything the answer names."""
        readers = self.messaging.audience(database, conversation)
        for item in evidence:
            if item.kind in OPEN_EVIDENCE:
                continue
            if item.ref is None or not all(self.visible(database, conversation.space_id, item, reader) for reader in readers):
                return False
        return True

    def visible(self, database, space_id, item, reader):
        """Whether [reader] may see the item through its own module's check; anything unknown counts as not."""
        agents = self.agents
        if item.kind == "task":
            statement = agents.tasks.visible_tasks(reader, space_id).where(Task.id == item.ref)
            return database.execute(statement).first() is not None
        if item.kind == "event":
            try:
                event, _membership = agents.events.visible(database, item.ref, reader)
            except DomainError:
                return False
            return event.space_id == space_id
        if item.kind == "document":
            document = database.get(SpaceDocument, item.ref, populate_existing=True)
            membership = agents.documents.membership(database, space_id, reader)
            return document is not None and document.space_id == space_id and agents.documents.readable(document, membership)
        if item.kind == "page":
            try:
                agents.community.find_page(database, item.ref, viewer=database.get(User, reader))
            except DomainError:
                return False
            return True
        return False
