import argparse
import hashlib
import json
import socket
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import create_engine, func, select, text, update
from sqlalchemy.engine import make_url

from app.config import Settings
from app.modules.identity.models import AccountSession, Challenge, IdentityMail, User
from app.modules.identity.security import Security
from app.modules.scheduling.models import Reminder
from app.modules.spaces.models import Space, SpaceMembership

DRILL_HOST = "restore-db"
DRILL_DATABASE = "community_restore"
CIPHERTEXT = ((User, "email_cipher"), (Challenge, "email_cipher"), (IdentityMail, "payload_cipher"))
SENDABLE_MAIL = ("queued", "retry", "processing")
OUTSIDE_TARGETS = (("db", 5432), ("mail", 1025), ("api", 8000), ("host.docker.internal", 8000))
CHECKS = ("migration", "counts", "key", "ciphertext", "invariants")


def require_drill_target(url: str) -> None:
    target = make_url(url)
    if target.host != DRILL_HOST or target.database != DRILL_DATABASE:
        raise SystemExit("Refusing a database outside the isolated restore drill.")


def quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def table_counts(connection) -> dict[str, int]:
    names = connection.scalars(text(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name"
    )).all()
    return {name: connection.scalar(text(f"SELECT count(*) FROM {quoted(name)}")) for name in names}


def compare_counts(expected: dict[str, int], actual: dict[str, int]) -> dict:
    changed = {
        name: {"expected": expected[name], "actual": actual[name]}
        for name in sorted(expected.keys() & actual.keys())
        if expected[name] != actual[name]
    }
    missing = sorted(expected.keys() - actual.keys())
    extra = sorted(actual.keys() - expected.keys())
    return {
        "tables": len(actual),
        "rows": sum(actual.values()),
        "missing": missing,
        "extra": extra,
        "changed": changed,
        "passed": bool(expected) and not (missing or extra or changed),
    }


def readable(security: Security, value: str) -> str | None:
    try:
        return security.open(value)
    except (InvalidToken, ValueError):
        return None


def ciphertext_check(connection, key: bytes) -> dict[str, dict[str, int]]:
    security = Security(key)
    result = {}
    for model, column in CIPHERTEXT:
        field = getattr(model, column)
        values = connection.scalars(select(field).where(field.is_not(None))).all()
        valid = sum(readable(security, value) is not None for value in values)
        result[f"{model.__tablename__}.{column}"] = {"rows": len(values), "valid": valid}
    rows = connection.execute(select(User.email_lookup, User.email_cipher)).all()
    matched = 0
    for lookup, cipher in rows:
        email = readable(security, cipher)
        if email is not None and security.digest("email", email) == lookup:
            matched += 1
    result["users.email_lookup"] = {"rows": len(rows), "valid": matched}
    return result


def owner_violations(connection) -> int:
    owners = (
        select(func.count())
        .select_from(SpaceMembership)
        .where(SpaceMembership.space_id == Space.id, SpaceMembership.role == "owner", SpaceMembership.status == "active")
        .correlate(Space)
        .scalar_subquery()
    )
    return connection.scalar(select(func.count()).select_from(Space).where(Space.status == "active", owners != 1))


def exposure(connection, now: datetime) -> dict[str, int]:
    def count(model, *criteria):
        return connection.scalar(select(func.count()).select_from(model).where(*criteria))

    return {
        "activeSessions": count(AccountSession, AccountSession.revoked_at.is_(None), AccountSession.expires_at > now),
        "openChallenges": count(Challenge, Challenge.consumed_at.is_(None), Challenge.expires_at > now),
        "sendableMail": count(
            IdentityMail,
            IdentityMail.payload_cipher.is_not(None),
            IdentityMail.status.in_(SENDABLE_MAIL),
            IdentityMail.expires_at > now,
        ),
        "overdueReminders": count(Reminder, Reminder.status == "scheduled", Reminder.scheduled_at <= now),
        "futureReminders": count(Reminder, Reminder.status == "scheduled", Reminder.scheduled_at > now),
    }


def seal(connection, now: datetime) -> dict[str, int]:
    # Revocations after the snapshot cannot be proven, so every restored credential and pending proof is retired.
    sessions = connection.execute(
        update(AccountSession)
        .where(AccountSession.revoked_at.is_(None), AccountSession.expires_at > now)
        .values(revoked_at=now)
    ).rowcount
    challenges = connection.execute(
        update(Challenge).where(Challenge.consumed_at.is_(None), Challenge.expires_at > now).values(expires_at=now)
    ).rowcount
    mail = connection.execute(
        update(IdentityMail)
        .where(IdentityMail.payload_cipher.is_not(None), IdentityMail.expires_at > now)
        .values(expires_at=now)
    ).rowcount
    return {"revokedSessions": sessions, "expiredChallenges": challenges, "expiredMail": mail}


def probe(host: str, port: int, timeout: float = 2.0) -> str:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return "reachable"
    except socket.gaierror:
        return "unresolved"
    except OSError:
        return "blocked"


def verify(engine, manifest: dict, key_file: Path, seal_copy: bool, now: datetime) -> dict:
    raw_key = key_file.read_bytes()
    snapshot = manifest["snapshot"]
    with engine.connect().execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True) as connection:
        version = connection.scalar(text("SELECT version_num FROM alembic_version"))
        counts = compare_counts(snapshot["tables"], table_counts(connection))
        recorded = ciphertext_check(connection, raw_key.strip())
        control = ciphertext_check(connection, Fernet.generate_key())
        violations = owner_violations(connection)
        before = exposure(connection, now)
    fingerprint = hashlib.sha256(raw_key).hexdigest().upper() == manifest["key"]["sha256"].upper()
    exercised = recorded["users.email_lookup"]["rows"] > 0
    readable_with_recorded = all(item["valid"] == item["rows"] for item in recorded.values())
    unreadable_with_control = all(item["valid"] == 0 for item in control.values())
    report = {
        "schemaVersion": 1,
        "checkedAt": now.isoformat(),
        "target": {"host": DRILL_HOST, "database": DRILL_DATABASE},
        "migration": {"expected": snapshot["alembicVersion"], "actual": version, "passed": version == snapshot["alembicVersion"]},
        "counts": counts,
        "key": {"fingerprintMatches": fingerprint, "copiedIntoBackup": manifest["key"]["copiedIntoBackup"], "passed": fingerprint},
        "ciphertext": {
            "recordedKey": recorded,
            "controlKey": control,
            "exercised": exercised,
            "passed": exercised and readable_with_recorded and unreadable_with_control,
        },
        "invariants": {"activeSpacesWithoutExactlyOneOwner": violations, "passed": violations == 0},
        "exposureBeforeSeal": before,
        "seal": {"requested": seal_copy, "applied": None, "after": None, "passed": not seal_copy},
    }
    if seal_copy and all(report[name]["passed"] for name in CHECKS):
        with engine.begin() as connection:
            applied = seal(connection, now)
        with engine.connect() as connection:
            after = exposure(connection, now)
        retired = after["activeSessions"] == after["openChallenges"] == after["sendableMail"] == 0
        report["seal"] = {"requested": True, "applied": applied, "after": after, "passed": retired}
    return report


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Verify the isolated restore-drill database.")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--seal", action="store_true", help="revoke restored sessions and expire pending identity proofs")
    arguments = parser.parse_args(argv)
    settings = Settings()
    require_drill_target(settings.database_url)
    manifest = json.loads(arguments.manifest.read_text(encoding="utf-8-sig"))
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    try:
        report = verify(engine, manifest, settings.secret_file, arguments.seal, datetime.now(timezone.utc))
    finally:
        engine.dispose()
    outside = {f"{host}:{port}": probe(host, port) for host, port in OUTSIDE_TARGETS}
    database = probe(DRILL_HOST, 5432)
    report["isolation"] = {
        "outside": outside,
        "drillDatabase": database,
        "passed": database == "reachable" and "reachable" not in outside.values(),
    }
    report["passed"] = all(report[name]["passed"] for name in (*CHECKS, "seal", "isolation"))
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
