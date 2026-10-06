import threading
import time
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from psycopg import Error as DriverError

from app.errors import DomainError
from app.modules.realtime.database import LiveDatabase, SHUTDOWN_SECONDS
from app.modules.realtime.models import LiveConnectionLease


def unavailable():
    return DomainError(503, "SERVICE_UNAVAILABLE", "Live updates are temporarily unavailable.")


class Reservation:
    def __init__(self, account_id):
        self.id = str(uuid4())
        self.account_id = account_id
        self.deadline = 0


class LiveLeases:
    cleanup_limit = 100

    def __init__(self, identity, hub):
        self.identity = identity
        self.hub = hub
        self.database = LiveDatabase(identity.settings.database_url)
        self.engine = self.database.engine
        self.renew_seconds = max(0.25, min(identity.settings.live_heartbeat_seconds, 5))
        self.lease_seconds = max(3, min(self.renew_seconds * 3, 30))
        self.thread = None
        self.stopping = threading.Event()
        self.lock = threading.Lock()

    def start(self):
        with self.lock:
            if self.thread is not None and self.thread.is_alive():
                return
            self.stopping.clear()
            self.thread = threading.Thread(target=self.reap, name="live-leases", daemon=True)
            self.thread.start()

    def close(self):
        self.stopping.set()
        if self.thread is not None:
            self.thread.join(timeout=SHUTDOWN_SECONDS)
            if self.thread.is_alive():
                raise RuntimeError("Live lease cleanup did not stop.")
        self.database.close()

    def configure(self, database):
        database.execute(text("SET LOCAL statement_timeout = '2000ms'"))
        database.execute(text("SET LOCAL lock_timeout = '1000ms'"))

    def count(self, database, account_id):
        return database.scalar(select(func.count()).select_from(LiveConnectionLease).where(
            LiveConnectionLease.account_id == account_id, LiveConnectionLease.expires_at > func.clock_timestamp(),
        ))

    def acquire(self, token, limit):
        started = time.monotonic()
        try:
            with self.database.begin() as database:
                self.configure(database)
                user, _session = self.identity.authenticate(database, token, lock=True)
                if self.count(database, user.id) >= limit:
                    raise DomainError(429, "LIVE_LIMIT_REACHED", "Too many live connections for this account. Close another tab or device.", retry_after=30)
                reservation = Reservation(user.id)
                database.add(LiveConnectionLease(
                    id=reservation.id, account_id=user.id,
                    expires_at=func.clock_timestamp() + timedelta(seconds=self.lease_seconds),
                ))
                self.identity.authenticate(database, token, lock=True)
            reservation.deadline = started + self.lease_seconds - 0.1
            if time.monotonic() >= reservation.deadline:
                self.release(reservation)
                raise unavailable()
            self.start()
            return reservation
        except (SQLAlchemyError, DriverError):
            raise unavailable() from None

    def renew(self, reservation):
        started = time.monotonic()
        if started >= reservation.deadline:
            raise unavailable()
        try:
            with self.database.begin() as database:
                self.configure(database)
                lease = database.scalar(select(LiveConnectionLease).where(
                    LiveConnectionLease.id == reservation.id,
                    LiveConnectionLease.account_id == reservation.account_id,
                ).with_for_update())
                now = database.scalar(select(func.clock_timestamp()))
                if lease is None or lease.expires_at <= now or time.monotonic() >= reservation.deadline:
                    raise unavailable()
                lease.expires_at = now + timedelta(seconds=self.lease_seconds)
                database.flush()
                if time.monotonic() >= reservation.deadline:
                    raise unavailable()
            if time.monotonic() >= reservation.deadline:
                raise unavailable()
            reservation.deadline = started + self.lease_seconds - 0.1
        except (SQLAlchemyError, DriverError):
            raise unavailable() from None

    def release(self, reservation):
        try:
            with self.database.begin() as database:
                self.configure(database)
                database.execute(delete(LiveConnectionLease).where(
                    LiveConnectionLease.id == reservation.id,
                    LiveConnectionLease.account_id == reservation.account_id,
                ))
        except (SQLAlchemyError, DriverError):
            pass

    def cleanup(self):
        with self.database.begin() as database:
            self.configure(database)
            expired = select(LiveConnectionLease.id).where(
                LiveConnectionLease.expires_at <= func.clock_timestamp(),
            ).order_by(LiveConnectionLease.expires_at, LiveConnectionLease.id).limit(self.cleanup_limit).with_for_update(skip_locked=True)
            database.execute(delete(LiveConnectionLease).where(LiveConnectionLease.id.in_(expired)))

    def reap(self):
        while not self.stopping.wait(self.renew_seconds) and not self.hub.stopping.is_set():
            try:
                self.cleanup()
            except (SQLAlchemyError, DriverError):
                continue