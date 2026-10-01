import json
import threading

import psycopg
from psycopg import sql
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.telemetry import emit

CHANNEL = "community_live"
# PostgreSQL refuses a notice payload of 8,000 bytes or more; 100 account IDs and the fields stay well below it.
ACCOUNTS_PER_NOTICE = 100


def signal(database, kind, account_ids, **fields):
    """Tells the open live streams of these accounts that something they can see changed.

    The notice is sent inside the caller's transaction, so PostgreSQL delivers it only when that transaction commits:
    a change that rolls back never reaches anyone. It names the kind of change and identifiers only, never content;
    the apps read the change itself through the normal API, which checks access again.
    """
    accounts = sorted({str(account) for account in account_ids if account})
    for start in range(0, len(accounts), ACCOUNTS_PER_NOTICE):
        payload = json.dumps({"kind": kind, "accounts": accounts[start:start + ACCOUNTS_PER_NOTICE], **fields}, separators=(",", ":"), default=str)
        database.execute(text("SELECT pg_notify(:channel, :payload)"), {"channel": CHANNEL, "payload": payload})


def listener_url(database_url):
    return make_url(database_url).set(drivername="postgresql").render_as_string(hide_password=False)


class Subscription:
    __slots__ = ("account_id", "deliver")

    def __init__(self, account_id, deliver):
        self.account_id = account_id
        self.deliver = deliver


class LiveHub:
    """One listening database connection per API process, shared by every open live stream of that process."""

    def __init__(self, database_url, channel=CHANNEL, connect=psycopg.connect):
        self.url = listener_url(database_url)
        self.channel = channel
        self.connect = connect
        self.lock = threading.Lock()
        self.subscriptions: dict[str, set[Subscription]] = {}
        self.listening = threading.Event()
        self.stopping = threading.Event()
        self.thread = None

    def subscribe(self, account_id, deliver):
        subscription = Subscription(account_id, deliver)
        with self.lock:
            self.subscriptions.setdefault(account_id, set()).add(subscription)
            self._start()
        return subscription

    def unsubscribe(self, subscription):
        with self.lock:
            group = self.subscriptions.get(subscription.account_id)
            if group is not None:
                group.discard(subscription)
                if not group:
                    del self.subscriptions[subscription.account_id]

    def count(self, account_id):
        with self.lock:
            return len(self.subscriptions.get(account_id, ()))

    def ready(self, timeout):
        """Starts the listener if needed and waits until it listens."""
        with self.lock:
            self._start()
        return self.listening.wait(timeout)

    def close(self):
        self.stopping.set()
        thread = self.thread
        if thread is not None:
            thread.join(timeout=5)

    def _start(self):
        if self.stopping.is_set():
            return
        if self.thread is None or not self.thread.is_alive():
            self.thread = threading.Thread(target=self._run, name="live-hub", daemon=True)
            self.thread.start()

    def _run(self):
        delay = 0.5
        reconnecting = False
        while not self.stopping.is_set():
            try:
                with self.connect(self.url, autocommit=True) as connection:
                    connection.execute(sql.SQL("LISTEN {}").format(sql.Identifier(self.channel)))
                    self.listening.set()
                    delay = 0.5
                    if reconnecting:
                        # Notices sent while the connection was down are lost, so every stream reads its views again.
                        self._broadcast({"kind": "resync"})
                    while not self.stopping.is_set():
                        for notice in connection.notifies(timeout=1.0):
                            self._dispatch(notice.payload)
            except Exception as error:  # noqa: BLE001 - any failure of the listening connection is retried
                self.listening.clear()
                reconnecting = True
                emit("live_listener_failed", failure=type(error).__name__)
                self.stopping.wait(delay)
                delay = min(delay * 2, 10)
        self.listening.clear()

    def _dispatch(self, payload):
        try:
            notice = json.loads(payload)
            accounts = notice.pop("accounts")
            if not isinstance(accounts, list):
                return
        except (ValueError, KeyError, TypeError, AttributeError):
            return
        with self.lock:
            targets = [subscription for account in accounts for subscription in self.subscriptions.get(account, ())]
        self._deliver(targets, notice)

    def _broadcast(self, event):
        with self.lock:
            targets = [subscription for group in self.subscriptions.values() for subscription in group]
        self._deliver(targets, event)

    @staticmethod
    def _deliver(targets, event):
        for target in targets:
            try:
                target.deliver(dict(event))
            except Exception:  # noqa: BLE001 - one closed stream must not stop delivery to the others
                continue
