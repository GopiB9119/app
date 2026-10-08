import json
import socket
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar

import psycopg
from psycopg import waiting
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


POOL_SIZE = 3
POOL_TIMEOUT = 0.25
DNS_SECONDS = 1
CONNECT_SECONDS = 2
TRANSPORT_SECONDS = 2.5
OPERATION_SECONDS = 5
POLL_SECONDS = 0.05
SHUTDOWN_SECONDS = OPERATION_SECONDS + 1
deadline = ContextVar("live_database_deadline", default=None)


def remaining(limit):
    end = deadline.get()
    seconds = min(limit, end - time.monotonic()) if end is not None else limit
    if seconds <= 0:
        raise psycopg.OperationalError("Live database time budget exhausted.")
    return seconds


def bounded(generator, end):
    try:
        requested = next(generator)
        while True:
            if time.monotonic() >= end:
                raise psycopg.OperationalError("Live database time budget exhausted.")
            ready = yield requested
            if time.monotonic() >= end:
                raise psycopg.OperationalError("Live database time budget exhausted.")
            requested = generator.send(ready)
    except StopIteration as completed:
        return completed.value
    finally:
        generator.close()


def resolve(host, port):
    try:
        socket.inet_pton(socket.AF_INET, host)
        return host
    except OSError:
        pass
    try:
        socket.inet_pton(socket.AF_INET6, host)
        return host
    except OSError:
        pass
    try:
        result = subprocess.run(
            [sys.executable, "-c", "import json,socket,sys; print(json.dumps(socket.getaddrinfo(sys.argv[1],sys.argv[2],type=socket.SOCK_STREAM)[0][4][0]))", host, str(port)],
            capture_output=True, text=True, timeout=remaining(DNS_SECONDS), check=True,
        )
        return json.loads(result.stdout)
    except (subprocess.SubprocessError, ValueError):
        raise psycopg.OperationalError("Live database name resolution unavailable.") from None


class BoundedConnection(psycopg.Connection):
    @classmethod
    def connect(cls, conninfo="", **kwargs):
        params = cls._get_connection_params(conninfo, **kwargs)
        host = params.get("host", "localhost")
        if "," in host or "," in str(params.get("hostaddr", "")):
            raise psycopg.OperationalError("Live database requires one endpoint.")
        if not host.startswith("/") and not params.get("hostaddr"):
            params["hostaddr"] = resolve(host, params.get("port", 5432))
        params["connect_timeout"] = str(CONNECT_SECONDS)
        return super().connect(**params)

    @classmethod
    def _connect_gen(cls, conninfo="", **kwargs):
        # psycopg 3.2 passes a timeout here and 3.3 does not, so forward exactly what was given.
        return (yield from bounded(
            super()._connect_gen(conninfo, **kwargs),
            time.monotonic() + remaining(CONNECT_SECONDS),
        ))

    def wait(self, generator, interval=POLL_SECONDS, timeout=None):
        try:
            return waiting.wait(
                bounded(generator, time.monotonic() + remaining(TRANSPORT_SECONDS)),
                self.pgconn.socket, interval=POLL_SECONDS,
            )
        except BaseException:
            self.close()
            raise


class LiveDatabase:
    def __init__(self, url):
        parsed = make_url(url)
        self.engine = create_engine(parsed, pool_size=POOL_SIZE, max_overflow=0, pool_timeout=POOL_TIMEOUT, pool_pre_ping=False)
        args, kwargs = self.engine.dialect.create_connect_args(parsed)
        kwargs["options"] = kwargs.get("options", "") + " -cstatement_timeout=2000 -clock_timeout=1000"
        self.engine.pool._creator = lambda: BoundedConnection.connect(*args, **kwargs)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        self.condition = threading.Condition()
        self.active = 0
        self.closed = False

    @contextmanager
    def begin(self):
        with self.condition:
            if self.closed:
                raise psycopg.OperationalError("Live database is closed.")
            self.active += 1
        token = deadline.set(time.monotonic() + OPERATION_SECONDS)
        try:
            with self.sessions.begin() as database:
                yield database
        finally:
            deadline.reset(token)
            with self.condition:
                self.active -= 1
                self.condition.notify_all()

    def close(self):
        with self.condition:
            self.closed = True
            if not self.condition.wait_for(lambda: self.active == 0, timeout=SHUTDOWN_SECONDS):
                raise RuntimeError("Live database operations did not stop.")
        self.engine.dispose()