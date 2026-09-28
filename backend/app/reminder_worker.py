import argparse
import json
import signal
from threading import Event

from sqlalchemy.exc import SQLAlchemyError

from app.main import create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    arguments = parser.parse_args()
    application = create_app()
    service = application.state.reminders
    stopped = Event()
    signal.signal(signal.SIGTERM, lambda _signal, _frame: stopped.set())
    signal.signal(signal.SIGINT, lambda _signal, _frame: stopped.set())
    database_failures = 0
    try:
        while not stopped.is_set():
            try:
                result = service.dispatch_due(limit=20)
            except SQLAlchemyError:
                if arguments.once:
                    print(json.dumps({"event": "reminder_dispatch", "result": "database_unavailable"}), flush=True)
                    raise SystemExit(1) from None
                result = {"database_unavailable": 1}
            if result or arguments.once:
                print(json.dumps({"event": "reminder_dispatch", "counts": result}), flush=True)
            if arguments.once:
                if result.get("database_unavailable"):
                    raise SystemExit(1)
                break
            database_failures = min(database_failures + 1, 6) if result.get("database_unavailable") else 0
            stopped.wait(min(60, 2 ** database_failures) if database_failures else 1)
    finally:
        application.state.engine.dispose()


if __name__ == "__main__":
    main()