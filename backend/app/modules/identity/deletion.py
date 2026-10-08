"""Account deletion (DEC-022): a signed-in request starts a seven-day grace period, after which a worker erases the account."""
import secrets
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.identity.models import AccountExport, AccountSession, OutboxEvent, User
from app.modules.messaging.models import Conversation, ConversationMessage
from app.modules.realtime.hub import signal
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from app.telemetry import emit

GRACE = timedelta(days=7)
ERASED_NAME = "Deleted account"

# Run in this order inside one transaction per account, so a failure leaves nothing half done. Every statement is
# scoped to the account (:a) or to the Spaces where it was the only current member (:alone).
ERASE = (
    # Sign-in records. Sessions are revoked and nameless at once, and deleted once the agent runs are gone (T110).
    ("mail", "DELETE FROM identity_mail_jobs WHERE id IN (SELECT id FROM identity_challenges WHERE account_id = :a OR email_lookup = :lookup)"),
    ("challenges", "DELETE FROM identity_challenges WHERE account_id = :a OR email_lookup = :lookup"),
    ("exports", "DELETE FROM account_exports WHERE account_id = :a"),
    ("sessions", "UPDATE account_sessions SET device_name = 'Removed device', revoked_at = COALESCE(revoked_at, :now) WHERE account_id = :a"),
    ("security_events", "DELETE FROM identity_security_events WHERE account_id = :a"),
    # The agent: requests, answers, approvals and memories.
    ("agent_memories", "DELETE FROM agent_memories WHERE account_id = :a OR source_run_id IN (SELECT id FROM agent_runs WHERE account_id = :a)"),
    ("agent_tool_calls", "DELETE FROM agent_tool_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE account_id = :a)"),
    ("agent_approvals", "DELETE FROM agent_approvals WHERE account_id = :a OR run_id IN (SELECT id FROM agent_runs WHERE account_id = :a)"),
    ("agent_events", "DELETE FROM agent_run_events WHERE run_id IN (SELECT id FROM agent_runs WHERE account_id = :a)"),
    # Their @agent requests in chats (DEC-046); the agent's replies are erased with their own messages below.
    ("agent_mentions", "DELETE FROM conversation_agent_mentions WHERE account_id = :a"),
    ("agent_runs", "DELETE FROM agent_runs WHERE account_id = :a"),
    # An ownership or page handover offer, kept for the other person, still names the session it was made from; that
    # row keeps its identifier and nothing else, and every other session row goes.
    ("unused_sessions", "DELETE FROM account_sessions s WHERE s.account_id = :a "
                        "AND NOT EXISTS (SELECT 1 FROM space_ownership_transfers t WHERE t.from_session_id = s.id) "
                        "AND NOT EXISTS (SELECT 1 FROM page_handovers h WHERE h.from_session_id = s.id)"),
    ("kept_sessions", "UPDATE account_sessions SET device_name = 'Removed device', platform = 'removed', "
                      "token_digest = md5(CAST(random() AS text) || id) || md5(id || CAST(clock_timestamp() AS text)), "
                      "created_at = :now, expires_at = :now, revoked_at = :now WHERE account_id = :a"),
    # Care records are the person's own.
    ("care_alerts", "DELETE FROM care_dose_alerts WHERE account_id = :a OR instruction_id IN (SELECT id FROM care_instructions WHERE account_id = :a)"),
    ("care_commands", "DELETE FROM care_commands WHERE account_id = :a OR target_id IN (SELECT id FROM care_instructions WHERE account_id = :a)"),
    ("care_report_history", "DELETE FROM care_dose_report_history WHERE account_id = :a OR report_id IN (SELECT id FROM care_dose_reports "
                            "WHERE account_id = :a OR instruction_id IN (SELECT id FROM care_instructions WHERE account_id = :a))"),
    ("care_reports", "DELETE FROM care_dose_reports WHERE account_id = :a OR instruction_id IN (SELECT id FROM care_instructions WHERE account_id = :a)"),
    ("care_audit", "DELETE FROM care_audit_events WHERE account_id = :a OR instruction_id IN (SELECT id FROM care_instructions WHERE account_id = :a)"),
    ("care_instructions", "DELETE FROM care_instructions WHERE account_id = :a"),
    # Reminders, the inbox, alert settings and reminder requests in either direction.
    ("alert_dismissals", "DELETE FROM alert_dismissals WHERE account_id = :a"),
    ("event_alerts", "DELETE FROM event_alerts WHERE account_id = :a"),
    ("alert_settings", "DELETE FROM alert_settings WHERE account_id = :a"),
    ("reminder_backups", "DELETE FROM reminder_backups WHERE owner_account_id = :a OR contact_account_id = :a"),
    ("inbox", "DELETE FROM in_app_notifications WHERE account_id = :a"),
    ("request_events", "DELETE FROM reminder_request_events WHERE request_id IN (SELECT id FROM reminder_requests WHERE requested_by_id = :a OR recipient_account_id = :a)"),
    ("requests", "DELETE FROM reminder_requests WHERE requested_by_id = :a OR recipient_account_id = :a"),
    ("reminder_events", "DELETE FROM reminder_events WHERE reminder_id IN (SELECT id FROM reminders WHERE account_id = :a)"),
    ("reminders", "DELETE FROM reminders WHERE account_id = :a"),
    ("series_events", "DELETE FROM reminder_series_events WHERE series_id IN (SELECT id FROM reminder_series WHERE account_id = :a)"),
    ("series_commands", "DELETE FROM reminder_series_commands WHERE account_id = :a OR series_id IN (SELECT id FROM reminder_series WHERE account_id = :a)"),
    ("series", "DELETE FROM reminder_series WHERE account_id = :a"),
    ("preferences", "DELETE FROM notification_preferences WHERE account_id = :a"),
    # The topics, interests, languages and places the person chose (DEC-027).
    ("interests", "DELETE FROM account_interests WHERE account_id = :a"),
    # What they muted or marked Not interested (DEC-037).
    ("feed_controls", "DELETE FROM feed_controls WHERE account_id = :a"),
    # Public community: the person's likes, saves, follows and blocks go; what they wrote is deleted in place.
    # Pages are locked before their posts, in one order, as pinning does, so the two cannot wait for each other.
    ("lock_pages", "SELECT id FROM public_pages WHERE id IN (SELECT page_id FROM public_page_follows WHERE account_id = :a "
                   "UNION SELECT page_id FROM public_posts WHERE id IN (SELECT post_id FROM public_post_reactions WHERE account_id = :a "
                   "UNION SELECT post_id FROM public_post_comments WHERE author_id = :a) "
                   "UNION SELECT page_id FROM help_posts WHERE author_id = :a OR id IN (SELECT post_id FROM help_replies WHERE author_id = :a) "
                   "UNION SELECT page_id FROM page_events WHERE created_by = :a OR id IN (SELECT event_id FROM page_event_responses WHERE account_id = :a) "
                   "UNION SELECT id FROM public_pages WHERE owner_id = :a) ORDER BY id FOR UPDATE"),
    ("like_counts", "UPDATE public_posts SET like_count = like_count - 1 WHERE id IN (SELECT post_id FROM public_post_reactions WHERE account_id = :a) AND like_count > 0"),
    ("likes", "DELETE FROM public_post_reactions WHERE account_id = :a"),
    ("saves", "DELETE FROM public_saved_posts WHERE account_id = :a"),
    ("follower_counts", "UPDATE public_pages SET follower_count = follower_count - 1 WHERE id IN (SELECT page_id FROM public_page_follows WHERE account_id = :a) AND follower_count > 0"),
    ("follows", "DELETE FROM public_page_follows WHERE account_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)"),
    ("blocks", "DELETE FROM account_blocks WHERE blocker_id = :a OR (target_type = 'account' AND target_id = :a)"),
    ("comment_counts", "UPDATE public_posts p SET comment_count = GREATEST(p.comment_count - c.n, 0) FROM (SELECT post_id, count(*) AS n FROM public_post_comments WHERE author_id = :a AND status = 'visible' GROUP BY post_id) c WHERE p.id = c.post_id"),
    ("comments", "UPDATE public_post_comments SET status = 'deleted', body = NULL, ended_at = COALESCE(ended_at, :now) WHERE author_id = :a AND status = 'visible'"),
    ("posts", "UPDATE public_posts SET status = 'deleted', title = NULL, body = NULL, deleted_at = COALESCE(deleted_at, :now), updated_at = :now WHERE (author_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)) AND status <> 'deleted'"),
    ("post_terms", "DELETE FROM post_terms WHERE post_id IN (SELECT id FROM public_posts WHERE author_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a))"),
    # Help requests and offers (D3): their replies elsewhere are withdrawn, and their posts, with the replies to them, are erased.
    ("help_reply_counts", "UPDATE help_posts p SET reply_count = GREATEST(p.reply_count - r.n, 0) FROM (SELECT post_id, count(*) AS n FROM help_replies "
                          "WHERE author_id = :a AND status = 'active' GROUP BY post_id) r WHERE p.id = r.post_id"),
    ("help_replies", "UPDATE help_replies SET status = 'withdrawn', body = NULL, ended_at = COALESCE(ended_at, :now) WHERE author_id = :a AND status = 'active'"),
    ("help_post_replies", "UPDATE help_replies SET status = 'removed', body = NULL, ended_at = COALESCE(ended_at, :now) WHERE status = 'active' AND post_id IN "
                          "(SELECT id FROM help_posts WHERE author_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a))"),
    ("help_post_reports", "UPDATE help_reports SET status = 'closed', outcome = 'deleted', closed_at = :now WHERE status = 'received' AND post_id IN "
                          "(SELECT id FROM help_posts WHERE author_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a))"),
    ("help_posts", "UPDATE help_posts SET status = 'deleted', title = NULL, details = NULL, place = NULL, need_by = NULL, helped_reply_id = NULL, "
                   "reply_count = 0, ended_at = COALESCE(ended_at, :now), updated_at = :now, version = version + 1 "
                   "WHERE (author_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)) AND status <> 'deleted'"),
    ("page_terms", "DELETE FROM page_terms WHERE page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)"),
    # Page events (D4): their going answers go, and events they published, or on their own pages, are erased.
    ("page_event_counts", "UPDATE page_events SET going_count = GREATEST(going_count - 1, 0) WHERE id IN (SELECT event_id FROM page_event_responses WHERE account_id = :a)"),
    ("page_event_going", "DELETE FROM page_event_responses WHERE account_id = :a OR event_id IN "
                         "(SELECT id FROM page_events WHERE created_by = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a))"),
    ("page_events", "UPDATE page_events SET status = 'deleted', title = NULL, details = NULL, venue = NULL, going_count = 0, version = version + 1, "
                    "updated_at = :now WHERE (created_by = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)) AND status <> 'deleted'"),
    ("pages", "UPDATE public_pages SET status = 'archived', name = 'Deleted page', topic = 'other', description = '', rules = '', help_open = false, handle = 'deleted-' || substr(md5(id), 1, 20), follower_count = 0, version = version + 1, updated_at = :now WHERE owner_id = :a"),
    ("reports", "UPDATE content_reports SET details = '' WHERE reporter_id = :a"),
    ("help_report_notes", "UPDATE help_reports SET details = '' WHERE reporter_id = :a"),
    ("moderator", "DELETE FROM platform_moderators WHERE account_id = :a"),
    # Page roles (DEC-025, T112): the person steps down on other pages and their open invitations end; on their own
    # pages, which the purge archives, every role goes; handover offers that are still open end too.
    ("page_roles", "UPDATE page_moderators SET status = CASE WHEN status = 'pending' THEN 'declined' ELSE 'stepped_down' END, "
                   "expires_at = NULL, resolved_at = COALESCE(resolved_at, :now), version = version + 1 "
                   "WHERE account_id = :a AND status IN ('pending', 'active') AND page_id NOT IN (SELECT id FROM public_pages WHERE owner_id = :a)"),
    ("own_page_roles", "DELETE FROM page_moderators WHERE page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)"),
    ("page_handovers", "UPDATE page_handovers SET status = 'invalidated', expires_at = NULL, resolved_at = :now, version = version + 1 "
                       "WHERE status = 'pending' AND (from_account_id = :a OR to_account_id = :a)"),
    # An open appeal is about content the purge erases, so it ends; a resolved one stays in the moderation record,
    # with a note that says why it is gone, because an appeal is always shown with a note (T103).
    ("open_appeals", "DELETE FROM moderation_appeals WHERE account_id = :a AND status = 'open'"),
    ("appeal_notes", "UPDATE moderation_appeals SET note = 'Removed when the account was deleted.' WHERE account_id = :a"),
    ("resolution_notes", "UPDATE moderation_appeals SET resolution_note = '' WHERE resolved_by = :a AND resolution_note IS NOT NULL"),
    ("decision_notes", "UPDATE moderation_decisions SET moderator_note = '' WHERE decided_by = :a"),
    # Private Spaces: their own messages and answers go; shared tasks stop being assigned to them.
    # Their reactions go, and so do others' reactions to the messages being erased (DEC-033).
    ("reactions", "DELETE FROM conversation_message_reactions WHERE account_id = :a OR message_id IN (SELECT id FROM conversation_messages WHERE sender_id = :a AND deleted_at IS NULL)"),
    ("messages", "UPDATE conversation_messages SET deleted_at = :now, body_cipher = NULL, revision = revision + 1 WHERE sender_id = :a AND deleted_at IS NULL"),
    ("read_states", "DELETE FROM conversation_read_states WHERE account_id = :a"),
    ("event_answers", "DELETE FROM space_event_responses WHERE account_id = :a"),
    # Their poll votes go; polls they asked in shared Spaces stay for the others, like events.
    ("poll_votes", "DELETE FROM space_poll_votes WHERE account_id = :a"),
    ("event_poll_votes", "DELETE FROM event_poll_votes WHERE account_id = :a"),
    # Expenses they recorded keep the amount and category for the others, without the note or who recorded it (DEC-039).
    ("expense_notes", "UPDATE event_expenses SET note = '', recorder_id = NULL, recorder_admission_id = NULL WHERE recorder_id = :a"),
    # Their promises go, because nobody can keep them now; what they gave stays in the totals without the note or name (DEC-041).
    ("promises", "DELETE FROM event_contributions WHERE contributor_id = :a AND state = 'promised'"),
    ("contribution_notes", "UPDATE event_contributions SET note = NULL, contributor_id = NULL, contributor_admission_id = NULL WHERE contributor_id = :a"),
    # Their share of a split stays, so nobody else's share moves, without their name (DEC-042).
    ("split_people", "UPDATE event_budget_split_people SET account_id = NULL, admission_id = NULL WHERE account_id = :a"),
    ("assignments", "UPDATE tasks SET assignee_account_id = NULL, assignee_admission_id = NULL, version = version + 1, updated_at = :now WHERE assignee_account_id = :a"),
    ("task_access", "DELETE FROM task_access WHERE account_id = :a"),
    ("task_commands", "DELETE FROM task_commands WHERE actor_id = :a"),
    ("invitations", "UPDATE space_invitations SET status = 'revoked', resolved_at = :now WHERE status = 'pending' AND (inviter_id = :a OR recipient_id = :a OR space_id = ANY(:alone))"),
    ("join_requests", "UPDATE space_join_requests SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END, resolved_at = COALESCE(resolved_at, :now), note = '' WHERE account_id = :a"),
    ("join_requests_alone", "UPDATE space_join_requests SET status = 'closed', resolved_at = :now WHERE status = 'pending' AND space_id = ANY(:alone)"),
    # Requests keep a copy of the name they asked to join; for a Space being erased that copy goes too.
    ("alone_request_names", "UPDATE space_join_requests SET space_name = 'Deleted Space' WHERE space_id = ANY(:alone)"),
    ("ownership_offers", "UPDATE space_ownership_transfers SET status = 'cancelled', resolved_at = :now WHERE status = 'pending' AND (from_account_id = :a OR to_account_id = :a)"),
    # A Space where the person was the only current member is closed and its contents erased.
    ("alone_reactions", "DELETE FROM conversation_message_reactions WHERE message_id IN (SELECT id FROM conversation_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE space_id = ANY(:alone)))"),
    ("alone_messages", "UPDATE conversation_messages SET deleted_at = :now, body_cipher = NULL, revision = revision + 1 WHERE deleted_at IS NULL AND conversation_id IN (SELECT id FROM conversations WHERE space_id = ANY(:alone))"),
    ("alone_checklists", "UPDATE task_checklist_items SET title = 'Deleted item' WHERE task_id IN (SELECT id FROM tasks WHERE space_id = ANY(:alone))"),
    ("alone_tasks", "UPDATE tasks SET title = 'Deleted task', description = '', due_date = NULL, updated_at = :now WHERE space_id = ANY(:alone)"),
    ("alone_budget_categories", "UPDATE event_budget_categories SET name = 'Deleted category' WHERE event_id IN (SELECT id FROM space_events WHERE space_id = ANY(:alone))"),
    ("alone_expense_notes", "UPDATE event_expenses SET note = '' WHERE event_id IN (SELECT id FROM space_events WHERE space_id = ANY(:alone))"),
    ("alone_contribution_notes", "UPDATE event_contributions SET note = NULL WHERE event_id IN (SELECT id FROM space_events WHERE space_id = ANY(:alone))"),
    # An event keeps only its creation time as its start, so its schedule says nothing about the person (T110).
    ("alone_events", "UPDATE space_events SET title = 'Deleted event', description = '', location = '', timezone = 'UTC', "
                     "starts_at = created_at, local_start = to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI'), "
                     "ends_at = NULL, local_end = NULL, updated_at = :now WHERE space_id = ANY(:alone)"),
    ("alone_chunks", "DELETE FROM space_document_chunks WHERE space_id = ANY(:alone)"),
    ("alone_poll_options", "UPDATE space_poll_options SET label = 'Deleted choice' WHERE poll_id IN (SELECT id FROM space_polls WHERE space_id = ANY(:alone))"),
    ("alone_polls", "UPDATE space_polls SET question = 'Deleted poll', updated_at = :now WHERE space_id = ANY(:alone)"),
    ("alone_event_poll_options", "UPDATE event_poll_options SET text = 'Deleted choice ' || position WHERE poll_id IN "
                                  "(SELECT id FROM event_polls WHERE event_id IN (SELECT id FROM space_events WHERE space_id = ANY(:alone)))"),
    ("alone_event_polls", "UPDATE event_polls SET question = 'Deleted poll' WHERE event_id IN "
                          "(SELECT id FROM space_events WHERE space_id = ANY(:alone))"),
    ("alone_documents", "UPDATE space_documents SET status = 'deleted', name = NULL, media_type = NULL, size_bytes = NULL, line_count = NULL, sha256 = NULL, content = NULL, deleted_at = :now, deleted_by_id = :a WHERE space_id = ANY(:alone) AND status = 'active'"),
    ("alone_spaces", "UPDATE spaces SET status = 'archived', name = 'Deleted Space', description = '', visibility = 'private', version = version + 1 WHERE id = ANY(:alone)"),
    ("memberships", "UPDATE space_memberships SET status = 'removed' WHERE account_id = :a AND status = 'active'"),
    ("shared_spaces", "UPDATE spaces SET version = version + 1 WHERE id = ANY(:shared)"),
)


def password_incorrect():
    return DomainError(403, "PASSWORD_INCORRECT", "The password is incorrect.")


class AccountDeletionService:
    def __init__(self, identity):
        self.identity = identity
        self.sessions = identity.sessions
        self.security = identity.security
        self.clock = identity.clock
        # Set by the app: brings back what stopped while the account waited, inside the cancel's transaction.
        self.on_cancel = None

    def request(self, token, password, network):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            email = self.security.open(user.email_cipher)
        # Guessing the password here counts against the same budget as signing in.
        self.identity.rate_limit("login", email, network)
        with self.sessions.begin() as database:
            user, _session = self.identity.authenticate(database, token, lock=True)
            if not self.security.verify_password(user.password_hash, password):
                raise password_incorrect()
            owned = self.owned_shared_spaces(database, user.id)
            if owned:
                raise DomainError(
                    409, "OWNED_SPACES_WITH_MEMBERS",
                    "Hand over ownership of these Spaces, or remove their members, before deleting your account.",
                    # Error details are text: names one per line (they cannot contain line breaks), identifiers by commas.
                    details={"spaces": "\n".join(row.name for row in owned), "space_ids": ",".join(row.id for row in owned)},
                )
            now = self.clock()
            user.status = "deletion_requested"
            user.deletion_requested_at = now
            user.purge_after = now + GRACE
            user.version += 1
            database.execute(
                update(AccountSession)
                .where(AccountSession.account_id == user.id, AccountSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
            # Every session has ended, so exports end the way the export sweep ends them when their session does.
            database.execute(
                update(AccountExport)
                .where(AccountExport.account_id == user.id, AccountExport.status.in_(("queued", "building", "ready")))
                .values(status="cancelled", reason="session_ended", completed_at=func.coalesce(AccountExport.completed_at, now),
                        archive_cipher=None, included_access=None, lease_token=None, lease_expires_at=None)
            )
            self.identity.record(database, user.id, "account.deletion_requested", user.id)
            return {"status": user.status, "purge_after": user.purge_after}

    def cancel(self, body):
        lookup = self.security.digest("email", body.email)
        with self.sessions.begin() as database:
            user = database.scalar(select(User).where(User.email_lookup == lookup).with_for_update())
            encoded = user.password_hash if user is not None and user.password_hash else self.security.dummy_hash
            correct = self.security.verify_password(encoded, body.password)
            now = self.clock()
            if not (user is not None and correct and user.status == "deletion_requested" and user.purge_after > now):
                raise DomainError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
            since = user.deletion_requested_at
            user.status = "active"
            user.deletion_requested_at = None
            user.purge_after = None
            user.version += 1
            if self.on_cancel is not None:
                self.on_cancel(database, user.id, since, now)
            self.identity.record(database, user.id, "account.deletion_cancelled", user.id)
            return self.identity._new_session(database, user, body)

    @staticmethod
    def owned_shared_spaces_query(account_id):
        """Active Spaces this account owns that still have another current member: they need a new owner first."""
        others = aliased(SpaceMembership)
        someone_else = select(others.account_id).where(
            others.space_id == Space.id, others.account_id != account_id, others.status == "active",
        ).correlate(Space, User).exists()
        return select(Space.id, Space.name).join(SpaceMembership, SpaceMembership.space_id == Space.id).where(
            SpaceMembership.account_id == account_id, SpaceMembership.status == "active", SpaceMembership.role == "owner",
            Space.status == "active", someone_else,
        ).order_by(Space.name, Space.id)

    @classmethod
    def owned_shared_spaces(cls, database, account_id):
        return database.execute(cls.owned_shared_spaces_query(account_id)).all()

    @staticmethod
    def told(row, account_id, current):
        """Who a hint about a chat reaches: a Space chat's current members, or the other person in a direct chat while
        they are still there with the admission the chat belongs to."""
        if row.kind == "space":
            return list(current)
        other, admission = ((row.second_account_id, row.second_admission_id) if row.first_account_id == account_id
                            else (row.first_account_id, row.first_admission_id))
        return [other] if current.get(other) == admission else []

    @staticmethod
    def chats(database, condition):
        return database.execute(
            select(Conversation.id, Conversation.space_id, Conversation.kind, Conversation.first_account_id,
                   Conversation.second_account_id, Conversation.first_admission_id, Conversation.second_admission_id)
            .where(condition).order_by(Conversation.id)
        ).all()

    @staticmethod
    def members(database, space_id):
        return dict(database.execute(select(SpaceMembership.account_id, SpaceMembership.admission_id).where(
            SpaceMembership.space_id == space_id, SpaceMembership.status == "active")).all())

    @classmethod
    def announce_departure(cls, database, space_id, account_id):
        """Live hints for the people still in a shared Space: its chat shows the erased messages, and each direct chat
        with the erased account can no longer take messages. Sent inside the purge, so only a committed purge sends them."""
        current = cls.members(database, space_id)
        for row in cls.chats(database, (Conversation.space_id == space_id) & or_(
            Conversation.kind == "space", Conversation.first_account_id == account_id, Conversation.second_account_id == account_id,
        )):
            accounts = cls.told(row, account_id, current)
            if accounts:
                signal(database, "conversation", accounts, conversation_id=row.id, space_id=space_id, reason="member_left")

    @classmethod
    def announce_erased(cls, database, account_id, conversation_ids):
        """Chats in Spaces the person had already left lose their messages too, so their current members are told (T106)."""
        current = {}
        for row in cls.chats(database, Conversation.id.in_(conversation_ids)):
            if row.space_id not in current:
                current[row.space_id] = cls.members(database, row.space_id)
            accounts = cls.told(row, account_id, current[row.space_id])
            if accounts:
                signal(database, "conversation", accounts, conversation_id=row.id, space_id=row.space_id, reason="deleted")

    def purge_due(self, limit=5):
        """Erases accounts whose grace period has ended, one transaction each, and returns counts only."""
        outcome = {"purged": 0, "blocked": 0}
        skipped = []
        for _ in range(limit):
            result = self.purge_next(skipped)
            if result is None:
                break
            outcome[result] += 1
        return outcome

    @staticmethod
    def purge_candidates(now):
        return select(User).where(User.status == "deletion_requested", User.purge_after <= now)

    def purge_next(self, skipped):
        with self.sessions.begin() as database:
            database.execute(text("SET LOCAL lock_timeout = '5s'"))
            now = self.clock()
            statement = self.purge_candidates(now)
            if skipped:
                statement = statement.where(User.id.not_in(skipped))
            user = database.scalar(
                statement.order_by(User.purge_after, User.id).limit(1).with_for_update(skip_locked=True)
                .execution_options(populate_existing=True)
            )
            if user is None:
                return None
            spaces = sorted(database.scalars(
                select(SpaceMembership.space_id).where(SpaceMembership.account_id == user.id, SpaceMembership.status == "active")
            ).all())
            # Membership changes lock the Space first, so these do too, in a fixed order, before reading who else is there.
            for space_id in spaces:
                database.scalar(select(Space.id).where(Space.id == space_id).with_for_update())
            if self.owned_shared_spaces(database, user.id):
                skipped.append(user.id)
                emit("account_purge_blocked", reason="owns_shared_space")
                return "blocked"
            shared = sorted(set(database.scalars(
                select(SpaceMembership.space_id).where(
                    SpaceMembership.space_id.in_(spaces), SpaceMembership.account_id != user.id, SpaceMembership.status == "active",
                )
            ).all()))
            alone = sorted(set(spaces) - set(shared))
            # Chats in Spaces the person already left, where their messages are about to be erased.
            left_behind = sorted(set(database.scalars(
                select(ConversationMessage.conversation_id).join(Conversation, Conversation.id == ConversationMessage.conversation_id)
                .where(ConversationMessage.sender_id == user.id, ConversationMessage.deleted_at.is_(None), Conversation.space_id.not_in(spaces))
            ).all()))
            parameters = {"a": user.id, "lookup": user.email_lookup, "now": now, "alone": alone, "shared": shared}
            for _label, statement_text in ERASE:
                database.execute(text(statement_text), parameters)
            for space_id in shared:
                identifier = str(uuid4())
                database.add_all([
                    SpaceAuditEvent(id=identifier, space_id=space_id, actor_id=user.id, target_id=user.id, action="space.member_left", created_at=now),
                    OutboxEvent(id=identifier, event_type="space.member_left", actor_id=user.id, aggregate_id=space_id, schema_version=1, created_at=now),
                ])
                self.announce_departure(database, space_id, user.id)
            if left_behind:
                self.announce_erased(database, user.id, left_behind)
            user.display_name = ERASED_NAME
            user.email_cipher = None
            user.password_hash = None
            # A random value that no email address produces, so the address can register again.
            user.email_lookup = secrets.token_hex(32)
            user.status = "deleted"
            user.purged_at = now
            user.version += 1
            database.add(OutboxEvent(id=str(uuid4()), event_type="account.purged", actor_id=user.id, aggregate_id=user.id, schema_version=1, created_at=now))
            emit("account_purged", spaces_left=len(shared), spaces_closed=len(alone))
            return "purged"
