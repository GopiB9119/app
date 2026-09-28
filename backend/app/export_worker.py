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
    service = application.state.exports
    stopped = Event()
    signal.signal(signal.SIGTERM, lambda _signal, _frame: stopped.set())
    signal.signal(signal.SIGINT, lambda _signal, _frame: stopped.set())
    failures = 0
    try:
        while not stopped.is_set():
            try:
                swept = service.sweep()
                outcome = service.process_one()
            except SQLAlchemyError:
                if arguments.once:
                    print(json.dumps({"event": "account_export", "result": "database_unavailable"}), flush=True)
                    raise SystemExit(1) from None
                swept, outcome = {}, {"result": "database_unavailable"}
            if outcome["result"] != "idle" or any(swept.values()) or arguments.once:
                print(json.dumps({"event": "account_export", **outcome, "swept": swept}), flush=True)
            if arguments.once:
                break
            failures = min(failures + 1, 6) if outcome["result"] == "database_unavailable" else 0
            if outcome["result"] in ("idle", "database_unavailable"):
                stopped.wait(min(60, 2 ** failures) if failures else 1)
    finally:
        application.state.engine.dispose()


if __name__ == "__main__":
    main()
