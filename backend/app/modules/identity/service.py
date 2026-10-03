import hmac
import json
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from app.errors import DomainError, authentication_required, invalid_challenge
from app.modules.identity.models import (
    AccountSession,
    Challenge,
    IdentityMail,
    OutboxEvent,
    RateBucket,
    SecurityEvent,
    User,
)
from app.modules.identity.schemas import AuthView, ChallengeView, EventView, SessionView, UserView


def utcnow():
    return datetime.now(timezone.utc)


class IdentityService:
    def __init__(self, sessions, security, settings, clock=utcnow):
        self.sessions = sessions
        self.security = security
        self.settings = settings
        self.clock = clock

    def rate_limit(self, operation: str, email: str, network: str):
        now = self.clock()
        window = str(int(now.timestamp()) // 900)
        identity_limit = (
            self.settings.login_limit if operation == "login" else self.settings.registration_limit
        )
        limits = [("identity", email, identity_limit), ("network", network, self.settings.network_limit)]
        exceeded = False
        with self.sessions.begin() as database:
            for scope, value, limit in limits:
                key = self.security.digest("rate", operation, scope, value, window)
                count = database.execute(
                    insert(RateBucket)
                    .values(key=key, count=1, expires_at=now + timedelta(minutes=30))
                    .on_conflict_do_update(
                        index_elements=[RateBucket.key], set_={"count": RateBucket.count + 1}
                    )
                    .returning(RateBucket.count)
                ).scalar_one()
                exceeded = exceeded or count > limit
        if exceeded:
            raise DomainError(429, "RATE_LIMITED", "Too many attempts. Try again later.")

    def begin_challenge(self, body, key: str, purpose: str):
        request_key = self.security.digest("request", purpose, body.context_secret, key)
        lookup = self.security.digest("email", body.email)
        now = self.clock()
        identifier = str(uuid4())
        code = f"{secrets.randbelow(1_000_000):06d}"
        with self.sessions.begin() as database:
            account = database.scalar(select(User).where(User.email_lookup == lookup))
            inserted = database.execute(
                insert(Challenge)
                .values(
                    id=identifier,
                    request_key=request_key,
                    context_digest=self.security.digest("context", body.context_secret),
                    email_lookup=lookup,
                    email_cipher=self.security.seal(body.email),
                    account_id=account.id if account else None,
                    purpose=purpose,
                    proof_digest=self.security.digest("proof", identifier, purpose, code),
                    attempts=0,
                    created_at=now,
                    expires_at=now + timedelta(minutes=self.settings.challenge_minutes),
                )
                .on_conflict_do_nothing(index_elements=[Challenge.request_key])
                .returning(Challenge.id)
            ).scalar_one_or_none()
            challenge = database.scalar(select(Challenge).where(Challenge.request_key == request_key))
            if challenge.email_lookup != lookup:
                raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Use a new request for changed details.")
            if inserted:
                payload = json.dumps(
                    {"email": body.email, "code": code, "purpose": purpose, "challenge_id": identifier,
                     "expires_at": challenge.expires_at.isoformat()}
                )
                database.add(
                    IdentityMail(
                        id=identifier,
                        payload_cipher=self.security.seal(payload),
                        status="queued",
                        attempts=0,
                        available_at=now,
                        expires_at=challenge.expires_at,
                    )
                )
                delivery_status = "queued"
            else:
                delivery_status = database.get(IdentityMail, challenge.id).status
            return ChallengeView(
                challenge_id=challenge.id,
                expires_at=challenge.expires_at,
                delivery_status=delivery_status,
            )

    def _proof(self, database, body, purpose):
        challenge = database.scalar(
            select(Challenge).where(Challenge.id == str(body.challenge_id)).with_for_update()
        )
        now = self.clock()
        if (
            challenge is None
            or challenge.purpose != purpose
            or challenge.consumed_at is not None
            or challenge.expires_at <= now
            or challenge.attempts >= self.settings.challenge_attempts
            or not hmac.compare_digest(
                challenge.context_digest, self.security.digest("context", body.context_secret)
            )
        ):
            return None
        challenge.attempts += 1
        if not hmac.compare_digest(
            challenge.proof_digest,
            self.security.digest("proof", challenge.id, purpose, body.code),
        ):
            return None
        challenge.consumed_at = now
        return challenge

    def register(self, body):
        password_hash = self.security.passwords.hash(body.password)
        result = None
        try:
            with self.sessions.begin() as database:
                challenge = self._proof(database, body, "registration")
                if challenge:
                    existing = database.scalar(
                        select(User.id).where(User.email_lookup == challenge.email_lookup)
                    )
                    if existing is None:
                        now = self.clock()
                        user = User(
                            id=str(uuid4()),
                            email_lookup=challenge.email_lookup,
                            email_cipher=challenge.email_cipher,
                            password_hash=password_hash,
                            display_name=body.display_name,
                            timezone=body.timezone,
                            status="active",
                            version=1,
                            created_at=now,
                            verified_at=now,
                        )
                        database.add(user)
                        database.flush()
                        self.record(database, user.id, "account.created", user.id)
                        result = self._new_session(database, user, body)
        except IntegrityError:
            raise invalid_challenge() from None
        if result is None:
            raise invalid_challenge()
        return result

    def recover(self, body):
        password_hash = self.security.passwords.hash(body.password)
        recovered = False
        with self.sessions.begin() as database:
            candidate = database.get(Challenge, str(body.challenge_id))
            user = None
            if candidate and candidate.account_id:
                user = database.scalar(
                    select(User).where(User.id == candidate.account_id).with_for_update()
                )
            challenge = self._proof(database, body, "recovery")
            if (
                challenge
                and user
                and user.status == "active"
                and user.email_lookup == challenge.email_lookup
            ):
                now = self.clock()
                user.password_hash = password_hash
                database.execute(
                    update(AccountSession)
                    .where(AccountSession.account_id == user.id, AccountSession.revoked_at.is_(None))
                    .values(revoked_at=now)
                )
                database.execute(
                    update(Challenge)
                    .where(Challenge.account_id == user.id, Challenge.consumed_at.is_(None))
                    .values(consumed_at=now)
                )
                self.record(database, user.id, "account.password_reset", user.id)
                recovered = True
        if not recovered:
            raise invalid_challenge()

    def login(self, body):
        lookup = self.security.digest("email", body.email)
        result = None
        with self.sessions.begin() as database:
            user = database.scalar(select(User).where(User.email_lookup == lookup).with_for_update())
            encoded = user.password_hash if user and user.password_hash else self.security.dummy_hash
            correct = self.security.verify_password(encoded, body.password)
            # After the 7-day grace period the account answers as if it were already erased (T110).
            if user and correct and user.status == "deletion_requested" and user.purge_after > self.clock():
                # Only someone who knows the password learns this; the answer offers to cancel the deletion.
                raise DomainError(
                    409, "ACCOUNT_DELETION_PENDING", "This account is waiting to be deleted. You can still cancel the deletion.",
                    details={"purge_after": user.purge_after.isoformat()},
                )
            if user and correct and user.status == "active":
                if self.security.passwords.check_needs_rehash(user.password_hash):
                    user.password_hash = self.security.passwords.hash(body.password)
                result = self._new_session(database, user, body)
        if result is None:
            raise DomainError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
        return result

    def _new_session(self, database, user, device):
        now = self.clock()
        current = database.scalars(
            select(AccountSession)
            .where(
                AccountSession.account_id == user.id,
                AccountSession.revoked_at.is_(None),
                AccountSession.expires_at > now,
            )
            .order_by(AccountSession.created_at, AccountSession.id)
        ).all()
        for older in current[: max(0, len(current) - 19)]:
            older.revoked_at = now
            self.record(database, user.id, "session.capacity_revoked", older.id)
        token = secrets.token_urlsafe(32)
        session = AccountSession(
            id=str(uuid4()),
            account_id=user.id,
            token_digest=self.security.digest("session", token),
            device_name=device.device_name,
            platform=device.platform,
            created_at=now,
            expires_at=now + timedelta(hours=self.settings.session_hours),
        )
        database.add(session)
        self.record(database, user.id, "session.created", session.id)
        return AuthView(
            session_token=token,
            session_id=session.id,
            expires_at=session.expires_at,
            user=self.user_view(user),
        )

    def authenticate(self, database, token, lock=False):
        if not token or len(token) > 128:
            raise authentication_required()
        statement = (
            select(User, AccountSession)
            .join(AccountSession, AccountSession.account_id == User.id)
            .where(AccountSession.token_digest == self.security.digest("session", token))
        )
        if lock:
            statement = statement.with_for_update(of=User)
        # Always the current rows: requests check the session again after waiting, in the same database session, and a
        # copy loaded before the wait would hide a revocation or deactivation committed meanwhile.
        row = database.execute(statement.execution_options(populate_existing=True)).first()
        if row is None:
            raise authentication_required()
        user, session = row
        if lock:
            database.refresh(session)
        if (
            user.status != "active"
            or session.revoked_at is not None
            or session.expires_at <= self.clock()
        ):
            raise authentication_required()
        return user, session

    @contextmanager
    def signed_in_write(self, token):
        with self.sessions.begin() as database:
            user, _session = self.authenticate(database, token, lock=True)
            yield database, user
            # Waiting for row locks can outlast the session, so it is checked again before anything commits.
            self.authenticate(database, token, lock=True)

    def user_view(self, user):
        return UserView(
            id=user.id,
            email=self.security.open(user.email_cipher),
            display_name=user.display_name,
            timezone=user.timezone,
            email_verified=True,
            version=user.version,
        )

    def me(self, token):
        with self.sessions() as database:
            user, _session = self.authenticate(database, token)
            return self.user_view(user)

    def update_profile(self, token, body, expected):
        with self.sessions.begin() as database:
            user, _session = self.authenticate(database, token, lock=True)
            if expected is None:
                raise DomainError(428, "PRECONDITION_REQUIRED", "Reload the profile before saving.")
            if expected != self.etag(user):
                raise DomainError(412, "PRECONDITION_FAILED", "This profile changed. Reload and review.")
            user.display_name = body.display_name
            user.timezone = body.timezone
            user.version += 1
            self.record(database, user.id, "profile.updated", user.id)
            return self.user_view(user)

    @staticmethod
    def etag(user):
        return f'"profile-{user.id}-{user.version}"'

    def list_sessions(self, token):
        with self.sessions() as database:
            user, current = self.authenticate(database, token)
            sessions = database.scalars(
                select(AccountSession)
                .where(
                    AccountSession.account_id == user.id,
                    AccountSession.revoked_at.is_(None),
                    AccountSession.expires_at > self.clock(),
                )
                .order_by(AccountSession.created_at.desc(), AccountSession.id)
                .limit(20)
            ).all()
            return [
                SessionView(
                    id=session.id,
                    device_name=session.device_name,
                    platform=session.platform,
                    created_at=session.created_at,
                    expires_at=session.expires_at,
                    current=session.id == current.id,
                )
                for session in sessions
            ]

    def revoke(self, token, identifier=None, others=False):
        with self.sessions.begin() as database:
            user, current = self.authenticate(database, token, lock=True)
            if others and self.clock() - current.created_at > timedelta(minutes=15):
                raise DomainError(403, "REAUTHENTICATION_REQUIRED", "Sign in again to revoke other sessions.")
            statement = select(AccountSession).where(AccountSession.account_id == user.id)
            if others:
                statement = statement.where(AccountSession.id != current.id)
            else:
                statement = statement.where(AccountSession.id == (identifier or current.id))
            targets = database.scalars(statement).all()
            if not targets and not others:
                raise DomainError(404, "NOT_FOUND", "Session not found.")
            for session in targets:
                if session.revoked_at is None:
                    session.revoked_at = self.clock()
                    self.record(database, user.id, "session.revoked", session.id)

    def events(self, token):
        with self.sessions() as database:
            user, _session = self.authenticate(database, token)
            events = database.scalars(
                select(SecurityEvent)
                .where(SecurityEvent.account_id == user.id)
                .order_by(SecurityEvent.created_at.desc(), SecurityEvent.id)
                .limit(20)
            ).all()
            return [EventView(id=event.id, action=event.action, created_at=event.created_at) for event in events]

    def record(self, database, account_id, action, target_id):
        identifier = str(uuid4())
        now = self.clock()
        database.add(
            SecurityEvent(
                id=identifier, account_id=account_id, action=action, target_id=target_id, created_at=now
            )
        )
        database.add(
            OutboxEvent(
                id=identifier,
                event_type=action,
                actor_id=account_id,
                aggregate_id=target_id,
                schema_version=1,
                created_at=now,
            )
        )