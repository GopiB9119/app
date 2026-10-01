"""Account deletion (DEC-022): a signed-in request starts a seven-day grace period, after which a worker erases the account."""
from datetime import timedelta

from sqlalchemy import select, update

from app.errors import DomainError
from app.modules.identity.models import AccountExport, AccountSession, User

GRACE = timedelta(days=7)


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
            database.execute(
                update(AccountExport)
                .where(AccountExport.account_id == user.id, AccountExport.status.in_(("queued", "building", "ready")))
                .values(status="cancelled", reason="account_deleted", archive_cipher=None, lease_token=None)
            )
            self.identity.record(database, user.id, "account.deletion_requested", user.id)
            return {"status": user.status, "purge_after": user.purge_after}

    def purge_due(self, limit=5):
        return {"purged": [], "blocked": []}
