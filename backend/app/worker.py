import json
import signal
from threading import Event

from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings
from app.db import database
from app.modules.identity.delivery import LocalSmtp, deliver_one
from app.modules.identity.security import Security
from app.modules.identity.service import IdentityService


def main():
    settings = Settings()
    engine, sessions = database(settings.database_url)
    service = IdentityService(sessions, Security(settings.load_keyring()), settings)
    sender = LocalSmtp(settings)
    stopped = Event()
    signal.signal(signal.SIGTERM, lambda _signal, _frame: stopped.set())
    signal.signal(signal.SIGINT, lambda _signal, _frame: stopped.set())
    try:
        while not stopped.is_set():
            try:
                result = deliver_one(service, sender)
            except SQLAlchemyError:
                result = "database_unavailable"
            if result != "idle":
                print(json.dumps({"event": "identity_mail", "result": result}), flush=True)
            if result in ("idle", "database_unavailable"):
                stopped.wait(1)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()