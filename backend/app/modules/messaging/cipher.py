import base64
import json

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.keys import Keyring


def message_key(material: bytes) -> bytes:
    derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"community:messaging:body:v1").derive(
        base64.urlsafe_b64decode(material)
    )
    return base64.urlsafe_b64encode(derived)


class MessageCipher:
    """Server-side encryption at rest. The service can decrypt these bodies; this is not end-to-end encryption."""

    def __init__(self, master_key: bytes | Keyring):
        keyring = master_key if isinstance(master_key, Keyring) else Keyring.parse(master_key)
        self.fernet = MultiFernet([Fernet(message_key(entry.material)) for entry in keyring.entries])

    def seal(self, conversation_id: str, message_id: str, body: str) -> str:
        payload = json.dumps({"c": conversation_id, "m": message_id, "b": body}, ensure_ascii=False, separators=(",", ":"))
        return self.fernet.encrypt(payload.encode("utf-8")).decode("ascii")

    def open(self, conversation_id: str, message_id: str, token: str) -> str | None:
        try:
            payload = json.loads(self.fernet.decrypt(token.encode("ascii")))
        except (InvalidToken, ValueError, TypeError):
            return None
        # A ciphertext copied onto another message row fails this binding check instead of displaying.
        if not isinstance(payload, dict) or payload.get("c") != conversation_id or payload.get("m") != message_id:
            return None
        body = payload.get("b")
        return body if isinstance(body, str) else None
