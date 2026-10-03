import argparse
import json
from itertools import islice
from pathlib import Path

from alembic import command
from alembic.config import Config
from cryptography.fernet import Fernet
from sqlalchemy import select

from app.config import Settings
from app.db import database
from app.main import create_app
from app.modules.community.models import TAXONOMY_DIMENSIONS
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


def vocabulary(arguments, settings=None):
    """Operator changes to the shared vocabulary (T128). Prints counts and codes only."""
    from app.modules.community.models import TaxonomyTerm
    from app.modules.community.taxonomy import add_term, name_term, set_term_status

    settings = settings or Settings()
    engine, sessions = database(settings.database_url)
    operation = arguments.vocabulary_operation
    try:
        if operation == "list":
            with sessions() as session:
                statement = select(TaxonomyTerm).order_by(TaxonomyTerm.dimension, TaxonomyTerm.sort_order, TaxonomyTerm.code)
                if arguments.dimension:
                    statement = statement.where(TaxonomyTerm.dimension == arguments.dimension)
                terms = session.scalars(statement).all()
            for term in terms:
                print(f"{term.dimension} {term.code} status={term.status} parent={term.parent_code or '-'} "
                      f"sensitive={int(term.sensitive)} en={term.label_en}")
            print(f"count={len(terms)}")
            return
        with sessions.begin() as session:
            now = utcnow()
            if operation == "add":
                changed = add_term(session, arguments.dimension, arguments.code, now, arguments.en, arguments.te, arguments.hi,
                                   arguments.parent, arguments.sensitive)
            elif operation == "name":
                changed = name_term(session, arguments.dimension, arguments.code, now, arguments.en, arguments.te, arguments.hi)
            else:
                changed = set_term_status(session, arguments.dimension, arguments.code, now,
                                          "retired" if operation == "retire" else "active")
        print(f"dimension={arguments.dimension} code={arguments.code} changed={int(changed)}")
    finally:
        engine.dispose()


def openapi_differences(current, stored, pointer="#"):
    if type(current) is not type(stored):
        yield pointer
    elif isinstance(current, dict):
        for key in sorted(current.keys() | stored.keys()):
            child = pointer + "/" + key.replace("~", "~0").replace("/", "~1")
            if key not in current or key not in stored:
                yield child
            else:
                yield from openapi_differences(current[key], stored[key], child)
    elif isinstance(current, list):
        if len(current) != len(stored):
            yield pointer
        else:
            for index, (current_item, stored_item) in enumerate(zip(current, stored)):
                yield from openapi_differences(current_item, stored_item, f"{pointer}/{index}")
    elif current != stored:
        yield pointer


def main(argv=None, settings=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/contracts/openapi/openapi.json")
    operations = parser.add_subparsers(dest="operation", required=True)
    operations.add_parser("migrate")
    for operation in ("export-openapi", "check-openapi"):
        contract_parser = operations.add_parser(operation)
        contract_parser.add_argument("--output", default=argparse.SUPPRESS)
    moderator_parser = operations.add_parser("moderators")
    actions = moderator_parser.add_subparsers(dest="moderator_operation", required=True)
    for operation in ("add", "remove"):
        actions.add_parser(operation).add_argument("email")
    actions.add_parser("list")
    vocabulary_parser = operations.add_parser("vocabulary")
    terms = vocabulary_parser.add_subparsers(dest="vocabulary_operation", required=True)
    terms.add_parser("list").add_argument("--dimension", choices=TAXONOMY_DIMENSIONS)
    for operation in ("add", "name", "retire", "restore"):
        term = terms.add_parser(operation)
        term.add_argument("dimension", choices=TAXONOMY_DIMENSIONS)
        term.add_argument("code")
        if operation in ("add", "name"):
            term.add_argument("--en", required=operation == "add")
            term.add_argument("--te")
            term.add_argument("--hi")
        if operation == "add":
            term.add_argument("--parent")
            term.add_argument("--sensitive", action="store_true")
    arguments = parser.parse_args(argv)
    settings = settings or Settings()
    if arguments.operation == "migrate":
        settings.load_key()
        command.upgrade(Config("alembic.ini"), "head")
    elif arguments.operation == "moderators":
        moderators(arguments.moderator_operation, getattr(arguments, "email", None), settings)
    elif arguments.operation == "vocabulary":
        vocabulary(arguments, settings)
    else:
        output = Path(arguments.output)
        checking = arguments.operation == "check-openapi"
        if checking:
            try:
                stored = json.loads(output.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                print("OpenAPI check failed: the stored contract is missing, unreadable or invalid JSON.")
                raise SystemExit(1) from None
        application = create_app(settings.model_copy(update={"secret_key": Fernet.generate_key().decode("ascii")}))
        try:
            current = application.openapi()
            if checking:
                differences = list(islice(openapi_differences(current, stored), 21))
                if differences:
                    print("OpenAPI drift: the stored contract differs from the implemented API.")
                    for pointer in differences[:20]:
                        print(pointer)
                    if len(differences) > 20:
                        print("More differences omitted.")
                    print("Review the source changes, then run export-openapi explicitly.")
                    raise SystemExit(1)
                print("Stored OpenAPI matches the implemented API.")
            else:
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
                print("Exported the implemented API contract.")
        finally:
            application.state.engine.dispose()


if __name__ == "__main__":
    main()