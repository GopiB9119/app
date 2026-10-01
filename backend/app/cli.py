import argparse
import json
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import select

from app.config import Settings
from app.db import database
from app.main import create_app
from app.modules.identity.models import User
from app.modules.identity.schemas import EmailInput
from app.modules.identity.security import Security
from app.modules.identity.service import utcnow
from app.modules.safety.models import PlatformModerator


def moderators(operation, email=None, settings=None):
    settings = settings or Settings()
    engine, sessions = database(settings.database_url)
    try:
        if operation == "list":
            with sessions() as session:
                identifiers = session.scalars(select(PlatformModerator.account_id).order_by(PlatformModerator.account_id)).all()
            for identifier in identifiers:
                print(f"account_id={identifier}")
            print(f"count={len(identifiers)}")
            return
        if operation not in {"add", "remove"}:
            raise SystemExit("Unknown moderator operation.")
        try:
            normalized = EmailInput(email=email).email
        except ValueError:
            raise SystemExit("Enter a synthetic .test account address.") from None
        security = Security(settings.load_keyring())
        with sessions.begin() as session:
            user = session.scalar(select(User).where(
                User.email_lookup == security.digest("email", normalized),
            ).with_for_update())
            if user is None or (operation == "add" and user.status != "active"):
                raise SystemExit("Account not found.")
            existing = session.get(PlatformModerator, user.id)
            changed = False
            if operation == "add" and existing is None:
                session.add(PlatformModerator(account_id=user.id, added_at=utcnow(), added_by="operator"))
                changed = True
            elif operation == "remove" and existing is not None:
                session.delete(existing)
                changed = True
            identifier = user.id
        print(f"account_id={identifier} changed={int(changed)}")
    finally:
        engine.dispose()


def main(argv=None, settings=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/contracts/openapi/openapi.json")
    operations = parser.add_subparsers(dest="operation", required=True)
    operations.add_parser("migrate")
    export = operations.add_parser("export-openapi")
    export.add_argument("--output", default=argparse.SUPPRESS)
    moderator_parser = operations.add_parser("moderators")
    actions = moderator_parser.add_subparsers(dest="moderator_operation", required=True)
    for operation in ("add", "remove"):
        actions.add_parser(operation).add_argument("email")
    actions.add_parser("list")
    arguments = parser.parse_args(argv)
    settings = settings or Settings()
    if arguments.operation == "migrate":
        settings.load_key()
        command.upgrade(Config("alembic.ini"), "head")
    elif arguments.operation == "moderators":
        moderators(arguments.moderator_operation, getattr(arguments, "email", None), settings)
    else:
        application = create_app(settings)
        output = Path(arguments.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(application.openapi(), indent=2) + "\n", encoding="utf-8")
        application.state.engine.dispose()
        print("Exported the implemented API contract.")


if __name__ == "__main__":
    main()