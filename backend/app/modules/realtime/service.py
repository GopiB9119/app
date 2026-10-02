import asyncio
import json

from starlette.concurrency import run_in_threadpool

from app.errors import DomainError


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

    def account(self, token):
        with self.identity.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            return user.id

    def signed_in(self, token, account_id):
        try:
            return self.account(token) == account_id
        except DomainError:
            return False

    def open(self, token):
        account_id = self.account(token)
        if self.hub.count(account_id) >= self.per_account:
            # A place frees as soon as another stream closes, so the apps need not wait long (T124).
            raise DomainError(
                429, "LIVE_LIMIT_REACHED", "Too many live connections for this account. Close another tab or device.", retry_after=30,
            )
        if not self.hub.ready(timeout=5):
            raise DomainError(503, "SERVICE_UNAVAILABLE", "Live updates are temporarily unavailable.")
        return account_id

    async def stream(self, token, account_id):
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

        subscription = self.hub.subscribe(account_id, deliver)
        try:
            if self.hub.count(account_id) > self.per_account:
                yield frame("end", {"reason": "too_many_connections"})
                return
            yield "retry: 5000\n\n"
            # Changes made before this point are not sent: on "ready" the apps read their views again.
            yield frame("ready", {"heartbeat_seconds": self.heartbeat_seconds, "max_seconds": self.max_seconds})
            started = checked = loop.time()
            while True:
                remaining = started + self.max_seconds - loop.time()
                if remaining <= 0:
                    yield frame("end", {"reason": "time_limit"})
                    return
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=min(self.heartbeat_seconds, remaining))
                except asyncio.TimeoutError:
                    event = None
                if loop.time() - checked >= self.recheck_seconds:
                    checked = loop.time()
                    if not await run_in_threadpool(self.signed_in, token, account_id):
                        yield frame("end", {"reason": "signed_out"})
                        return
                if event is None:
                    yield ": keep-alive\n\n"
                elif event.get("kind") == "resync":
                    yield frame("resync", {})
                else:
                    yield frame("change", event)
        finally:
            self.hub.unsubscribe(subscription)
