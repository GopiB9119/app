import asyncio
import json
import time

import anyio
from sqlalchemy.exc import SQLAlchemyError
from psycopg import Error as DriverError

from starlette.concurrency import run_in_threadpool

from app.errors import DomainError
from app.modules.realtime.leases import LiveLeases, unavailable


def frame(event, data):
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


class LiveService:
    """Live updates as a server-sent event stream: hints that something changed, never the content itself."""

    per_account = 5
    queue_limit = 100

    def __init__(self, identity, hub):
        self.identity = identity
        self.hub = hub
        settings = identity.settings
        self.heartbeat_seconds = settings.live_heartbeat_seconds
        self.recheck_seconds = settings.live_recheck_seconds
        self.max_seconds = settings.live_max_seconds
        self.leases = LiveLeases(identity, hub)

    def account(self, token):
        try:
            with self.leases.database.begin() as database:
                self.leases.configure(database)
                user, _session = self.identity.authenticate(database, token)
                return user.id
        except (SQLAlchemyError, DriverError):
            raise unavailable() from None

    def signed_in(self, token, account_id):
        try:
            return self.account(token) == account_id
        except DomainError as error:
            if error.status != 401:
                raise
            return False

    def open(self, token):
        account_id = self.account(token)
        try:
            with self.leases.database.begin() as database:
                self.leases.configure(database)
                count = self.leases.count(database, account_id)
        except (SQLAlchemyError, DriverError):
            raise unavailable() from None
        if max(count, self.hub.count(account_id)) >= self.per_account:
            # A place frees as soon as another stream closes, so the apps need not wait long (T124).
            raise DomainError(
                429, "LIVE_LIMIT_REACHED", "Too many live connections for this account. Close another tab or device.", retry_after=30,
            )
        if not self.hub.ready(timeout=5):
            raise DomainError(503, "SERVICE_UNAVAILABLE", "Live updates are temporarily unavailable.")
        return account_id

    def acquire(self, token):
        self.open(token)
        return self.leases.acquire(token, self.per_account)

    async def stream(self, token, account_id, reservation=None):
        reservation = reservation or await run_in_threadpool(self.leases.acquire, token, self.per_account)
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def put(event):
            if queue.qsize() >= self.queue_limit:
                # A stream that falls this far behind gets one resync instead of every hint.
                while not queue.empty():
                    queue.get_nowait()
                event = {"kind": "resync"}
            queue.put_nowait(event)

        def deliver(event):
            try:
                loop.call_soon_threadsafe(put, event)
            except RuntimeError:
                pass  # The stream's event loop has already closed.

        subscription = None
        try:
            await run_in_threadpool(self.leases.renew, reservation)
            try:
                subscription = self.hub.subscribe(account_id, deliver)
            except Exception:
                raise unavailable() from None
            yield "retry: 5000\n\n"
            # Changes made before this point are not sent: on "ready" the apps read their views again.
            yield frame("ready", {"heartbeat_seconds": self.heartbeat_seconds, "max_seconds": self.max_seconds})
            started = checked = renewed = heartbeat = loop.time()
            while True:
                remaining = started + self.max_seconds - loop.time()
                if remaining <= 0:
                    yield frame("end", {"reason": "time_limit"})
                    return
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=min(
                        max(0.001, heartbeat + self.heartbeat_seconds - loop.time()), remaining, self.leases.renew_seconds,
                    ))
                except asyncio.TimeoutError:
                    event = None
                if time.monotonic() >= reservation.deadline:
                    return
                if loop.time() - renewed >= self.leases.renew_seconds:
                    try:
                        await run_in_threadpool(self.leases.renew, reservation)
                    except DomainError:
                        return
                    renewed = loop.time()
                if loop.time() - checked >= self.recheck_seconds:
                    checked = loop.time()
                    try:
                        signed_in = await run_in_threadpool(self.signed_in, token, account_id)
                    except DomainError:
                        return
                    if not signed_in:
                        yield frame("end", {"reason": "signed_out"})
                        return
                if event is None:
                    if loop.time() - heartbeat < self.heartbeat_seconds:
                        continue
                    heartbeat = loop.time()
                    yield ": keep-alive\n\n"
                elif event.get("kind") == "resync":
                    heartbeat = loop.time()
                    yield frame("resync", {})
                else:
                    heartbeat = loop.time()
                    yield frame("change", event)
        finally:
            if subscription is not None:
                self.hub.unsubscribe(subscription)
            with anyio.CancelScope(shield=True):
                await run_in_threadpool(self.leases.release, reservation)
