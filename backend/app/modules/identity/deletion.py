"""Account deletion (DEC-022): a signed-in request starts a seven-day grace period, after which a worker erases the account."""
import secrets
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import aliased

from app.errors import DomainError
from app.modules.identity.models import AccountExport, AccountSession, OutboxEvent, User
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from app.telemetry import emit

GRACE = timedelta(days=7)
ERASED_NAME = "Deleted account"

# Run in this order inside one transaction per account, so a failure leaves nothing half done. Every statement is
# scoped to the account (:a) or to the Spaces where it was the only current member (:alone).
ERASE = (
    # Sign-in records. Session rows stay, revoked and nameless, because ownership offers and agent runs refer to them.
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
    ("agent_runs", "DELETE FROM agent_runs WHERE account_id = :a"),
    # Care records are the person's own.
    ("care_alerts", "DELETE FROM care_dose_alerts WHERE account_id = :a OR instruction_id IN (SELECT id FROM care_instructions WHERE account_id = :a)"),
    ("care_commands", "DELETE FROM care_commands WHERE account_id = :a OR target_id IN (SELECT id FROM care_instructions WHERE account_id = :a)"),
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
    # Public community: the person's likes, saves, follows and blocks go; what they wrote is deleted in place.
    ("like_counts", "UPDATE public_posts SET like_count = like_count - 1 WHERE id IN (SELECT post_id FROM public_post_reactions WHERE account_id = :a) AND like_count > 0"),
    ("likes", "DELETE FROM public_post_reactions WHERE account_id = :a"),
    ("saves", "DELETE FROM public_saved_posts WHERE account_id = :a"),
    ("follower_counts", "UPDATE public_pages SET follower_count = follower_count - 1 WHERE id IN (SELECT page_id FROM public_page_follows WHERE account_id = :a) AND follower_count > 0"),
    ("follows", "DELETE FROM public_page_follows WHERE account_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)"),
    ("blocks", "DELETE FROM account_blocks WHERE blocker_id = :a OR (target_type = 'account' AND target_id = :a)"),
    ("comment_counts", "UPDATE public_posts p SET comment_count = GREATEST(p.comment_count - c.n, 0) FROM (SELECT post_id, count(*) AS n FROM public_post_comments WHERE author_id = :a AND status = 'visible' GROUP BY post_id) c WHERE p.id = c.post_id"),
    ("comments", "UPDATE public_post_comments SET status = 'deleted', body = NULL, ended_at = COALESCE(ended_at, :now) WHERE author_id = :a AND status = 'visible'"),
    ("posts", "UPDATE public_posts SET status = 'deleted', title = NULL, body = NULL, deleted_at = COALESCE(deleted_at, :now), updated_at = :now WHERE (author_id = :a OR page_id IN (SELECT id FROM public_pages WHERE owner_id = :a)) AND status <> 'deleted'"),
    ("pages", "UPDATE public_pages SET status = 'archived', name = 'Deleted page', description = '', rules = '', handle = 'deleted-' || substr(md5(id), 1, 20), follower_count = 0, version = version + 1, updated_at = :now WHERE owner_id = :a"),
    ("reports", "UPDATE content_reports SET details = '' WHERE reporter_id = :a"),
    ("moderator", "DELETE FROM platform_moderators WHERE account_id = :a"),
    ("appeal_notes", "UPDATE moderation_appeals SET note = '' WHERE account_id = :a"),
    ("resolution_notes", "UPDATE moderation_appeals SET resolution_note = '' WHERE resolved_by = :a AND resolution_note IS NOT NULL"),
    ("decision_notes", "UPDATE moderation_decisions SET moderator_note = '' WHERE decided_by = :a"),
    # Private Spaces: their own messages and answers go; shared tasks stop being assigned to them.
    ("messages", "UPDATE conversation_messages SET deleted_at = :now, body_cipher = NULL WHERE sender_id = :a AND deleted_at IS NULL"),
    ("read_states", "DELETE FROM conversation_read_states WHERE account_id = :a"),
    ("event_answers", "DELETE FROM space_event_responses WHERE account_id = :a"),
    ("assignments", "UPDATE tasks SET assignee_account_id = NULL, assignee_admission_id = NULL, version = version + 1, updated_at = :now WHERE assignee_account_id = :a"),
    ("task_access", "DELETE FROM task_access WHERE account_id = :a"),
    ("task_commands", "DELETE FROM task_commands WHERE actor_id = :a"),
    ("invitations", "UPDATE space_invitations SET status = 'revoked', resolved_at = :now WHERE status = 'pending' AND (inviter_id = :a OR recipient_id = :a OR space_id = ANY(:alone))"),
    ("join_requests", "UPDATE space_join_requests SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END, resolved_at = COALESCE(resolved_at, :now), note = '' WHERE account_id = :a"),
    ("join_requests_alone", "UPDATE space_join_requests SET status = 'closed', resolved_at = :now WHERE status = 'pending' AND space_id = ANY(:alone)"),
    ("ownership_offers", "UPDATE space_ownership_transfers SET status = 'cancelled', resolved_at = :now WHERE status = 'pending' AND (from_account_id = :a OR to_account_id = :a)"),
    # A Space where the person was the only current member is closed and its contents erased.
    ("alone_messages", "UPDATE conversation_messages SET deleted_at = :now, body_cipher = NULL WHERE deleted_at IS NULL AND conversation_id IN (SELECT id FROM conversations WHERE space_id = ANY(:alone))"),
    ("alone_checklists", "UPDATE task_checklist_items SET title = 'Deleted item' WHERE task_id IN (SELECT id FROM tasks WHERE space_id = ANY(:alone))"),
    ("alone_tasks", "UPDATE tasks SET title = 'Deleted task', description = '', updated_at = :now WHERE space_id = ANY(:alone)"),
    ("alone_events", "UPDATE space_events SET title = 'Deleted event', description = '', location = '', updated_at = :now WHERE space_id = ANY(:alone)"),
    ("alone_chunks", "DELETE FROM space_document_chunks WHERE space_id = ANY(:alone)"),
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
            user.status = "active"
            user.deletion_requested_at = None
            user.purge_after = None
            user.version += 1
            self.identity.record(database, user.id, "account.deletion_cancelled", user.id)
            return self.identity._new_session(database, user, body)

    @staticmethod
    def owned_shared_spaces(database, account_id):
        """Active Spaces this account owns that still have another current member: they need a new owner first."""
        others = aliased(SpaceMembership)
        someone_else = select(others.account_id).where(
            others.space_id == Space.id, others.account_id != account_id, others.status == "active",
        ).exists()
        return database.execute(
            select(Space.id, Space.name).join(SpaceMembership, SpaceMembership.space_id == Space.id).where(
                SpaceMembership.account_id == account_id, SpaceMembership.status == "active", SpaceMembership.role == "owner",
                Space.status == "active", someone_else,
            ).order_by(Space.name, Space.id)
        ).all()

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

    def purge_next(self, skipped):
        with self.sessions.begin() as database:
            database.execute(text("SET LOCAL lock_timeout = '5s'"))
            now = self.clock()
            statement = select(User).where(User.status == "deletion_requested", User.purge_after <= now)
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
            parameters = {"a": user.id, "lookup": user.email_lookup, "now": now, "alone": alone, "shared": shared}
            for _label, statement_text in ERASE:
                database.execute(text(statement_text), parameters)
            for space_id in shared:
                identifier = str(uuid4())
                database.add_all([
                    SpaceAuditEvent(id=identifier, space_id=space_id, actor_id=user.id, target_id=user.id, action="space.member_left", created_at=now),
                    OutboxEvent(id=identifier, event_type="space.member_left", actor_id=user.id, aggregate_id=space_id, schema_version=1, created_at=now),
                ])
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
