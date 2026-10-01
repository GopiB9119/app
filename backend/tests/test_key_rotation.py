import base64
import hmac
import json
import stat
from contextlib import contextmanager
from datetime import timedelta

import pytest
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.config import Settings
from app.db import Base
from app.keys import Keyring, save_keyring
from app.main import create_app
from app.modules.identity.models import User
from app.modules.identity.security import Security
from app.modules.messaging.cipher import MessageCipher
from app.modules.platform import keys as rotation
from app.modules.platform.keys import PROTECTED, Refused, main, rewrite, run

from .test_care import create_instruction
from .test_exports import download, ready_export
from .test_identity import PASSWORD, account, auth, begin, verify
from .test_messaging import messages, open_chat, send
from .test_spaces import create_space

STAMP = "2026-09-19T10:00:00+00:00"


def file_settings(app, tmp_path):
    """The running app's key, kept in a file because rotation only edits key files."""
    path = tmp_path / "identity.key"
    path.write_bytes(app.state.settings.secret_key.encode("ascii"))
    return app.state.settings.model_copy(update={"secret_key": None, "secret_file": path})


@contextmanager
def restarted(settings, clock):
    fresh = create_app(settings, clock)
    fresh.state.clock = clock
    with TestClient(fresh) as http:
        yield fresh, http


def secrets_in(path):
    keyring = Keyring.parse(path.read_bytes())
    return {entry.material.decode("ascii") for entry in keyring.entries} | {base64.urlsafe_b64encode(keyring.lookup).decode("ascii")}


def test_single_key_files_keep_working_and_convert_without_changing_lookups():
    legacy = Fernet.generate_key()
    before = Security(legacy)
    # The derivations the code used before key files could hold several keys; stored digests and messages depend on them.
    assert before.lookup_key == hmac.digest(legacy, b"community:identity:lookup:v1", "sha256")
    derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"community:messaging:body:v1").derive(base64.urlsafe_b64decode(legacy))
    message = Fernet(base64.urlsafe_b64encode(derived)).encrypt(b'{"c":"chat","m":"message","b":"Bring water"}').decode("ascii")
    assert MessageCipher(legacy).open("chat", "message", message) == "Bring water"
    sealed, lookup = before.seal("alex@example.test"), before.digest("email", "alex@example.test")
    single = Keyring.parse(legacy + b"\n")
    assert single.legacy and single.primary.material == legacy
    grown, added = single.with_added(STAMP)
    rotated = Keyring.parse(grown.with_promoted(added.id, STAMP).dumps())
    assert not rotated.legacy and rotated.primary.id == added.id and rotated.lookup == single.lookup
    after = Security(rotated)
    assert after.digest("email", "alex@example.test") == lookup
    assert after.open(sealed) == "alex@example.test"
    assert MessageCipher(rotated).open("chat", "message", message) == "Bring water"
    fresh = after.seal("new@example.test").encode("ascii")
    assert Fernet(added.material).decrypt(fresh) == b"new@example.test"
    with pytest.raises(InvalidToken):
        Fernet(legacy).decrypt(fresh)


def test_every_encrypted_column_is_rotated():
    stored = {
        f"{table.name}.{column.name}"
        for table in Base.metadata.tables.values()
        for column in table.columns
        if column.name.endswith("_cipher")
    }
    assert stored == {f"{model.__tablename__}.{column}" for model, column, _kind, _size in PROTECTED}


def test_staged_rotation_keeps_people_signed_in_and_every_stored_value_readable(client, app, tmp_path):
    settings, clock, engine = file_settings(app, tmp_path), app.state.clock, app.state.engine
    person = account(client, app)
    pending = begin(client, app, "pending@example.test")
    instruction = create_instruction(client, person).json()["data"]
    space_id = create_space(client, person).json()["data"]["id"]
    chat = open_chat(client, person, space_id).json()["data"]
    assert send(client, person, chat["id"], "Bring water").status_code == 201
    export_id = ready_export(client, app, person)
    archive = download(client, person, export_id).json()["data"]
    old_token = app.state.security.seal("list cursor")
    original = Keyring.parse(settings.secret_file.read_bytes()).primary
    reports, keys = [], secrets_in(settings.secret_file)

    reports.append(run(["add"], settings, clock.now, engine))
    new_id = reports[-1]["added"]
    keys |= secrets_in(settings.secret_file)
    with restarted(settings, clock) as (_fresh, http):
        assert http.get("/v1/me", headers=auth(person)).status_code == 200
    reports.append(run(["promote", new_id], settings, clock.now, engine))
    assert reports[-1]["keyFile"]["primary"] == new_id
    with restarted(settings, clock) as (fresh, http):
        assert http.get("/v1/me", headers=auth(person)).status_code == 200
        assert http.post("/v1/auth/login", json={"email": "alex@example.test", "password": PASSWORD}).status_code == 200
        assert fresh.state.security.open(old_token) == "list cursor"
        assert http.get(f"/v1/care/instructions/{instruction['id']}", headers=auth(person)).json()["data"] == instruction
        assert [item["body"] for item in messages(http, person, chat["id"]).json()["data"]] == ["Bring water"]
        assert download(http, person, export_id).json()["data"] == archive
    reports.append(run(["status"], settings, clock.now, engine))
    assert all(counts[original.id] >= 1 and counts["unreadable"] == 0 for counts in reports[-1]["stored"].values())

    with pytest.raises(Refused, match="retire it after"):
        run(["retire", original.id], settings, clock.now + timedelta(hours=23), engine)
    later = clock.now + timedelta(hours=25)
    with pytest.raises(Refused, match="run reencrypt and verify first"):
        run(["retire", original.id], settings, later, engine)
    reports.append(run(["reencrypt"], settings, later, engine))
    assert reports[-1]["passed"] is True
    for name, counts in reports[-1]["columns"].items():
        assert counts["rewritten"] >= 1 and counts["unreadable"] == counts["changedMeanwhile"] == 0, name
    reports.append(run(["reencrypt"], settings, later, engine))
    assert all(counts["rewritten"] == 0 and counts["current"] >= 1 for counts in reports[-1]["columns"].values())
    reports.append(run(["verify"], settings, later, engine))
    assert reports[-1]["passed"] is True and reports[-1]["rowsNotOnPrimary"] == 0

    reports.append(run(["retire", original.id], settings, later, engine))
    archived = settings.secret_file.parent / "retired-keys" / f"{original.id}.json"
    assert [entry.id for entry in Keyring.parse(settings.secret_file.read_bytes()).entries] == [new_id]
    assert stat.S_IMODE(archived.stat().st_mode) == stat.S_IMODE(settings.secret_file.stat().st_mode) == 0o600
    with restarted(settings, clock) as (fresh, http):
        assert http.get("/v1/me", headers=auth(person)).status_code == 200
        assert http.get(f"/v1/care/instructions/{instruction['id']}", headers=auth(person)).json()["data"] == instruction
        assert [item["body"] for item in messages(http, person, chat["id"]).json()["data"]] == ["Bring water"]
        assert download(http, person, export_id).json()["data"] == archive
        assert verify(http, pending).status_code == 201
        with pytest.raises(InvalidToken):
            fresh.state.security.open(old_token)

    reports.append(run(["restore", original.id], settings, later, engine))
    assert [entry.id for entry in Keyring.parse(settings.secret_file.read_bytes()).entries] == [new_id, original.id]
    with restarted(settings, clock) as (fresh, _http):
        assert fresh.state.security.open(old_token) == "list cursor"
    printed = json.dumps(reports)
    assert not any(secret in printed for secret in keys)


def test_retire_never_overwrites_a_key_added_while_it_ran(client, app, tmp_path, monkeypatch):
    settings, clock, engine = file_settings(app, tmp_path), app.state.clock, app.state.engine
    account(client, app)
    original = Keyring.parse(settings.secret_file.read_bytes()).primary.id
    new_id = run(["add"], settings, clock.now, engine)["added"]
    run(["promote", new_id], settings, clock.now, engine)
    later = clock.now + timedelta(hours=25)
    assert run(["reencrypt"], settings, later, engine)["passed"] is True
    checked = rotation.verification

    def another_add_during_the_scan(scanned_engine, keyring):
        result = checked(scanned_engine, keyring)
        run(["add"], settings, later, engine)
        return result

    monkeypatch.setattr(rotation, "verification", another_add_during_the_scan)
    with pytest.raises(Refused, match="changed while this command ran"):
        run(["retire", original], settings, later, engine)
    keyring = Keyring.parse(settings.secret_file.read_bytes())
    assert len(keyring.entries) == 3 and keyring.primary.id == new_id and keyring.find(original) is not None


def test_reencryption_never_overwrites_a_value_changed_meanwhile(client, app):
    account(client, app)
    security = app.state.security
    with app.state.engine.begin() as connection:
        identifier, read = connection.execute(select(User.id, User.email_cipher)).one()
        changed = security.seal("alex@example.test")
        connection.execute(update(User).where(User.id == identifier).values(email_cipher=changed))
        assert rewrite(connection, User, "email_cipher", identifier, read, security.seal("stale@example.test")) is False
        assert connection.scalar(select(User.email_cipher).where(User.id == identifier)) == changed


def test_command_prints_no_key_material_and_fails_closed(tmp_path, capsys):
    path = tmp_path / "identity.key"
    path.write_bytes(Fernet.generate_key())
    settings = Settings(secret_file=path, secret_key=None)

    def call(*argv, using=settings):
        with pytest.raises(SystemExit) as finished:
            main(list(argv), using)
        output = capsys.readouterr().out
        return finished.value.code, json.loads(output), output

    code, report, _output = call("status")
    assert code == 0 and report["keyFile"]["format"] == "single key"
    code, report, output = call("add")
    keyring = Keyring.parse(path.read_bytes())
    assert code == 0 and len(keyring.entries) == 2 and report["keyFile"]["format"] == "keyring"
    assert not any(secret in output for secret in secrets_in(path))
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert call("promote", "000000000000")[:2] == (1, {"refused": "No key with that ID is in the key file.", "passed": False})
    assert "primary key cannot be retired" in call("retire", keyring.primary.id)[1]["refused"]
    assert call("restore", keyring.primary.id)[1]["refused"].startswith("No retired key")
    assert "COMMUNITY_SECRET_KEY" in call("add", using=Settings(secret_key=Fernet.generate_key().decode()))[1]["refused"]

    saved = path.read_bytes()
    damaged = tmp_path / "damaged.key"
    for content, reason in (
        (b'{"format": "community-keyring", "version": 1}', "The key file is damaged."),
        (saved.replace(keyring.primary.id.encode("ascii"), b"000000000000"), "A key does not match its recorded ID."),
        (b"not a key", None),
    ):
        damaged.write_bytes(content)
        code, report, _output = call("add", using=Settings(secret_file=damaged, secret_key=None))
        assert code == 1 and damaged.read_bytes() == content
        assert reason is None or report["refused"] == reason
    with pytest.raises(ValueError):
        save_keyring(path, keyring, keyring.without(keyring.entries[1].id)[0])
    assert path.read_bytes() == saved
