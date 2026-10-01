import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import create_engine, select, update
from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings
from app.keys import Keyring, read_retired, retired_record, save_keyring, write_private
from app.modules.care.models import CareInstruction
from app.modules.identity.models import AccountExport, Challenge, IdentityMail, User
from app.modules.messaging.cipher import message_key
from app.modules.messaging.models import ConversationMessage

# Every encrypted column, with rows read per batch; a test fails if a new *_cipher column is missing here.
# Export archives reach about 7 MB each once encrypted, so they are read a few at a time.
PROTECTED = (
    (User, "email_cipher", "fields", 500),
    (Challenge, "email_cipher", "fields", 500),
    (IdentityMail, "payload_cipher", "fields", 500),
    (AccountExport, "archive_cipher", "fields", 4),
    (CareInstruction, "payload_cipher", "fields", 500),
    (ConversationMessage, "body_cipher", "messages", 500),
)
# Sealed tokens held by clients (list cursors, previews) expire within 15 minutes; this leaves a wide margin.
RETIRE_AFTER = timedelta(hours=24)
RESTART = "Restart every process that loads the key file before the next step: docker compose -f infra/compose.yaml restart api identity-mail-worker reminder-worker (and any export worker)."


class Refused(Exception):
    pass


def stamp(now: datetime) -> str:
    return now.astimezone(timezone.utc).isoformat()


def label(model, column: str) -> str:
    return f"{model.__tablename__}.{column}"


def ciphers(keyring: Keyring) -> dict[str, dict[str, Fernet]]:
    return {
        entry.id: {"fields": Fernet(entry.material), "messages": Fernet(message_key(entry.material))}
        for entry in keyring.entries
    }


def rotators(keyring: Keyring) -> dict[str, MultiFernet]:
    return {
        "fields": keyring.fernet(),
        "messages": MultiFernet([Fernet(message_key(entry.material)) for entry in keyring.entries]),
    }


def holder(value: str, kind: str, keyring: Keyring, cache) -> str | None:
    token = value.encode("ascii")
    for entry in keyring.entries:
        try:
            cache[entry.id][kind].decrypt(token)
            return entry.id
        except InvalidToken:
            continue
    return None


def batch(connection, model, column: str, size: int, after: str | None):
    field = getattr(model, column)
    statement = select(model.id, field).where(field.is_not(None)).order_by(model.id).limit(size)
    if after is not None:
        statement = statement.where(model.id > after)
    return connection.execute(statement).all()


def rewrite(connection, model, column: str, identifier: str, old: str, new: str) -> bool:
    field = getattr(model, column)
    changed = connection.execute(update(model).where(model.id == identifier, field == old).values({column: new}))
    return changed.rowcount == 1


def inventory(engine, keyring: Keyring) -> dict[str, dict[str, int]]:
    cache = ciphers(keyring)
    result = {}
    with engine.connect() as connection:
        for model, column, kind, size in PROTECTED:
            counts = {entry.id: 0 for entry in keyring.entries} | {"unreadable": 0}
            after = None
            while rows := batch(connection, model, column, size, after):
                for _identifier, value in rows:
                    counts[holder(value, kind, keyring, cache) or "unreadable"] += 1
                after = rows[-1][0]
            result[label(model, column)] = counts
    return result


def verification(engine, keyring: Keyring) -> dict:
    counts = inventory(engine, keyring)
    waiting = sum(total for columns in counts.values() for name, total in columns.items() if name != keyring.primary.id)
    return {"columns": counts, "rowsNotOnPrimary": waiting, "passed": waiting == 0}


def reencrypt(engine, keyring: Keyring) -> dict:
    cache, rotate = ciphers(keyring), rotators(keyring)
    report = {}
    for model, column, kind, size in PROTECTED:
        counts = {"current": 0, "rewritten": 0, "changedMeanwhile": 0, "unreadable": 0}
        after = None
        while True:
            with engine.begin() as connection:
                rows = batch(connection, model, column, size, after)
                if not rows:
                    break
                for identifier, value in rows:
                    owner = holder(value, kind, keyring, cache)
                    if owner == keyring.primary.id:
                        counts["current"] += 1
                    elif owner is None:
                        counts["unreadable"] += 1
                    else:
                        # MultiFernet.rotate keeps the original timestamp and payload, so message bindings still hold.
                        new = rotate[kind].rotate(value.encode("ascii")).decode("ascii")
                        counts["rewritten" if rewrite(connection, model, column, identifier, value, new) else "changedMeanwhile"] += 1
                after = rows[-1][0]
        report[label(model, column)] = counts
    return report


def describe(keyring: Keyring) -> dict:
    return {
        "format": "single key" if keyring.legacy else "keyring",
        "primary": keyring.primary.id,
        "keys": [entry.describe() for entry in keyring.entries],
        "lookupKey": hashlib.sha256(keyring.lookup).hexdigest()[:12],
    }


def parser() -> argparse.ArgumentParser:
    commands = argparse.ArgumentParser(description="Rotate the encryption keys in the local key file. Never prints key material.")
    choice = commands.add_subparsers(dest="command", required=True)
    for name in ("status", "add", "reencrypt", "verify"):
        choice.add_parser(name)
    for name in ("promote", "retire", "restore"):
        choice.add_parser(name).add_argument("key_id")
    return commands


def run(argv: list[str], settings: Settings, now: datetime, engine=None) -> dict:
    arguments = parser().parse_args(argv)
    if settings.secret_key:
        raise Refused("The key comes from COMMUNITY_SECRET_KEY, not a file; rotate it where it is set.")
    path = settings.secret_file
    if not path.exists():
        raise Refused(f"No key file at {path}.")
    raw = path.read_bytes()
    keyring = Keyring.parse(raw)
    archive = path.parent / "retired-keys"
    report = {"command": arguments.command, "at": stamp(now)}

    def save(changed: Keyring, archived=None) -> None:
        # retire scans every stored value first; a key added meanwhile must not be overwritten.
        if path.read_bytes() != raw:
            raise Refused("The key file changed while this command ran; nothing was written. Run it again.")
        save_keyring(path, keyring, changed, archived)

    if arguments.command == "add":
        changed, added = keyring.with_added(stamp(now))
        save(changed)
        return {**report, "added": added.id, "keyFile": describe(changed), "next": f"{RESTART} Then promote {added.id}.", "passed": True}
    if arguments.command == "promote":
        try:
            changed = keyring.with_promoted(arguments.key_id, stamp(now))
        except ValueError as error:
            raise Refused(str(error)) from None
        save(changed)
        return {**report, "keyFile": describe(changed), "next": f"{RESTART} Then reencrypt and verify.", "passed": True}
    if arguments.command == "restore":
        source = archive / f"{arguments.key_id}.json"
        if not source.exists():
            raise Refused(f"No retired key {arguments.key_id} in {archive}.")
        try:
            changed = keyring.with_returned(read_retired(source))
        except ValueError as error:
            raise Refused(str(error)) from None
        save(changed)
        return {**report, "restored": arguments.key_id, "keyFile": describe(changed), "next": RESTART, "passed": True}
    if arguments.command == "retire":
        chosen = keyring.find(arguments.key_id)
        if chosen is None:
            raise Refused("No key with that ID is in the key file.")
        if chosen is keyring.primary:
            raise Refused("The primary key cannot be retired; promote another key first.")
        if chosen.demoted_at and now < datetime.fromisoformat(chosen.demoted_at) + RETIRE_AFTER:
            ready = stamp(datetime.fromisoformat(chosen.demoted_at) + RETIRE_AFTER)
            raise Refused(f"Tokens sealed with this key may still be in use; retire it after {ready}.")
    owned = engine is None
    engine = engine or create_engine(settings.database_url, pool_pre_ping=True)
    try:
        if arguments.command == "status":
            try:
                stored = inventory(engine, keyring)
            except SQLAlchemyError:
                stored = "database unavailable"
            return {**report, "keyFile": describe(keyring), "stored": stored, "passed": True}
        if arguments.command == "reencrypt":
            columns = reencrypt(engine, keyring)
            unreadable = sum(counts["unreadable"] for counts in columns.values())
            return {**report, "primary": keyring.primary.id, "columns": columns, "next": "Run verify.", "passed": unreadable == 0}
        if arguments.command == "verify":
            return {**report, "primary": keyring.primary.id, **verification(engine, keyring)}
        checked = verification(engine, keyring)
        if not checked["passed"]:
            raise Refused(f"{checked['rowsNotOnPrimary']} stored values do not open with the primary key; run reencrypt and verify first.")
        target = archive / f"{chosen.id}.json"
        if not target.exists():
            write_private(target, retired_record(chosen, stamp(now)), replace_existing=False)
        if read_retired(target).material != chosen.material:
            raise Refused(f"{target} does not hold this key; nothing was retired.")
        changed, _removed = keyring.without(chosen.id)
        save(changed, archived=chosen)
        return {**report, "retired": chosen.id, "archivedAt": str(target), "keyFile": describe(changed), "next": RESTART, "passed": True}
    finally:
        if owned:
            engine.dispose()


def main(argv: list[str] | None = None, settings: Settings | None = None) -> None:
    try:
        report = run(sys.argv[1:] if argv is None else argv, settings or Settings(), datetime.now(timezone.utc))
    except (Refused, ValueError, OSError) as error:
        report = {"refused": str(error), "passed": False}
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
