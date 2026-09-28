import argparse
import json
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.config import Settings
from app.main import create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["migrate", "export-openapi"])
    parser.add_argument("--output", default="/contracts/openapi/openapi.json")
    arguments = parser.parse_args()
    if arguments.operation == "migrate":
        Settings().load_key()
        command.upgrade(Config("alembic.ini"), "head")
    else:
        application = create_app()
        output = Path(arguments.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(application.openapi(), indent=2) + "\n", encoding="utf-8")
        application.state.engine.dispose()
        print("Exported the implemented API contract.")


if __name__ == "__main__":
    main()