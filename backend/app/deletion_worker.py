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
    service = application.state.account_deletion
    stopped = Event()
    signal.signal(signal.SIGTERM, lambda _signal, _frame: stopped.set())
    signal.signal(signal.SIGINT, lambda _signal, _frame: stopped.set())
    failures = 0
    try:
        while not stopped.is_set():
            try:
                outcome = service.purge_due(limit=5)
            except SQLAlchemyError:
                if arguments.once:
                    print(json.dumps({"event": "account_deletion", "result": "database_unavailable"}), flush=True)
                    raise SystemExit(1) from None
                outcome = None
            # Counts only: an erased account's details must not reach the logs either.
            if outcome is None or any(outcome.values()) or arguments.once:
                print(json.dumps({"event": "account_deletion", **(outcome or {"result": "database_unavailable"})}), flush=True)
            if arguments.once:
                break
            failures = min(failures + 1, 6) if outcome is None else 0
            # Keep going only while accounts are being erased; blocked ones wait for the next pass.
            if outcome is None or not outcome["purged"]:
                stopped.wait(min(300, 30 * 2 ** failures) if failures else 60)
    finally:
        application.state.engine.dispose()


if __name__ == "__main__":
    main()
