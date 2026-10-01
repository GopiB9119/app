import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass, replace
from pathlib import Path

from cryptography.fernet import Fernet, MultiFernet

FORMAT = "community-keyring"
RETIRED_FORMAT = "community-retired-key"
LEGACY_LOOKUP_LABEL = b"community:identity:lookup:v1"


def key_id(material: bytes) -> str:
    return hashlib.sha256(material).hexdigest()[:12]


@dataclass(frozen=True)
class KeyEntry:
    material: bytes
    added_at: str | None = None
    promoted_at: str | None = None
    demoted_at: str | None = None

    @property
    def id(self) -> str:
        return key_id(self.material)

    def describe(self) -> dict:
        return {"id": self.id, "added_at": self.added_at, "promoted_at": self.promoted_at, "demoted_at": self.demoted_at}


@dataclass(frozen=True)
class Keyring:
    """Encryption keys, primary first, plus the HMAC lookup key, which rotation never changes."""

    lookup: bytes
    entries: tuple[KeyEntry, ...]
    legacy: bool = False

    @classmethod
    def parse(cls, raw: bytes) -> "Keyring":
        text = raw.strip()
        if not text.startswith(b"{"):
            Fernet(text)
            # A single-key file keeps the lookup key it always derived, so lookups stay valid after conversion.
            return cls(hmac.digest(text, LEGACY_LOOKUP_LABEL, "sha256"), (KeyEntry(text),), legacy=True)
        try:
            return cls.parse_document(json.loads(text))
        except (KeyError, TypeError, AttributeError):
            raise ValueError("The key file is damaged.") from None

    @classmethod
    def parse_document(cls, document: dict) -> "Keyring":
        if document.get("format") != FORMAT or document.get("version") != 1:
            raise ValueError("Unknown key file format.")
        lookup = base64.urlsafe_b64decode(document["lookup"])
        if len(lookup) != 32:
            raise ValueError("The lookup key must be 32 bytes.")
        entries = [
            KeyEntry(item["key"].encode("ascii"), item.get("added_at"), item.get("promoted_at"), item.get("demoted_at"))
            for item in document["keys"]
        ]
        if not entries or len({entry.id for entry in entries}) != len(entries):
            raise ValueError("The key file needs distinct keys.")
        for entry, item in zip(entries, document["keys"]):
            Fernet(entry.material)
            if item.get("id") != entry.id:
                raise ValueError("A key does not match its recorded ID.")
        primary = [entry for entry in entries if entry.id == document["primary"]]
        if len(primary) != 1:
            raise ValueError("The primary key is missing.")
        return cls(lookup, (primary[0], *[entry for entry in entries if entry.id != primary[0].id]))

    def dumps(self) -> bytes:
        document = {
            "format": FORMAT,
            "version": 1,
            "lookup": base64.urlsafe_b64encode(self.lookup).decode("ascii"),
            "primary": self.primary.id,
            "keys": [{**entry.describe(), "key": entry.material.decode("ascii")} for entry in self.entries],
        }
        return (json.dumps(document, indent=2) + "\n").encode("ascii")

    @property
    def primary(self) -> KeyEntry:
        return self.entries[0]

    def find(self, identifier: str) -> KeyEntry | None:
        return next((entry for entry in self.entries if entry.id == identifier), None)

    def fernet(self) -> MultiFernet:
        return MultiFernet([Fernet(entry.material) for entry in self.entries])

    def with_added(self, now: str) -> tuple["Keyring", KeyEntry]:
        entry = KeyEntry(Fernet.generate_key(), added_at=now)
        return Keyring(self.lookup, (*self.entries, entry)), entry

    def with_returned(self, entry: KeyEntry) -> "Keyring":
        if self.find(entry.id):
            raise ValueError("That key is already in the key file.")
        return Keyring(self.lookup, (*self.entries, entry))

    def with_promoted(self, identifier: str, now: str) -> "Keyring":
        chosen = self.find(identifier)
        if chosen is None:
            raise ValueError("No key with that ID is in the key file.")
        if chosen is self.primary:
            raise ValueError("That key is already the primary key.")
        rest = [replace(self.primary, demoted_at=now)] + [entry for entry in self.entries[1:] if entry is not chosen]
        return Keyring(self.lookup, (replace(chosen, promoted_at=now, demoted_at=None), *rest))

    def without(self, identifier: str) -> tuple["Keyring", KeyEntry]:
        chosen = self.find(identifier)
        if chosen is None:
            raise ValueError("No key with that ID is in the key file.")
        if chosen is self.primary:
            raise ValueError("The primary key cannot be retired.")
        return Keyring(self.lookup, tuple(entry for entry in self.entries if entry is not chosen)), chosen


def write_private(path: Path, content: bytes, replace_existing: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    target = path.with_name(path.name + ".tmp") if replace_existing else path
    if replace_existing:
        target.unlink(missing_ok=True)
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
    if replace_existing:
        os.replace(target, path)


def save_keyring(path: Path, before: Keyring, after: Keyring, archived: KeyEntry | None = None) -> None:
    kept = {entry.id for entry in after.entries} | ({archived.id} if archived else set())
    if after.lookup != before.lookup or not {entry.id for entry in before.entries} <= kept:
        raise ValueError("Refusing to write a key file that would lose a key or change the lookup key.")
    write_private(path, after.dumps(), replace_existing=True)


def retired_record(entry: KeyEntry, retired_at: str) -> bytes:
    document = {"format": RETIRED_FORMAT, "version": 1, **entry.describe(), "retired_at": retired_at, "key": entry.material.decode("ascii")}
    return (json.dumps(document, indent=2) + "\n").encode("ascii")


def read_retired(path: Path) -> KeyEntry:
    try:
        document = json.loads(path.read_bytes())
        if document.get("format") != RETIRED_FORMAT or document.get("version") != 1:
            raise ValueError("Unknown retired key format.")
        entry = KeyEntry(document["key"].encode("ascii"), document.get("added_at"), document.get("promoted_at"), document.get("demoted_at"))
    except (KeyError, TypeError, AttributeError):
        raise ValueError("The retired key file is damaged.") from None
    Fernet(entry.material)
    if document.get("id") != entry.id:
        raise ValueError("The retired key does not match its recorded ID.")
    return entry
