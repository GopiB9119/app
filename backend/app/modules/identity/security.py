import hashlib
import hmac
import json
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from cryptography.fernet import Fernet


class Security:
    def __init__(self, key: bytes):
        self.cipher = Fernet(key)
        self.lookup_key = hmac.digest(key, b"community:identity:lookup:v1", "sha256")
        self.passwords = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
        self.dummy_hash = self.passwords.hash(secrets.token_urlsafe(32))

    def digest(self, purpose: str, *values: str) -> str:
        value = json.dumps([purpose, *values], ensure_ascii=False, separators=(",", ":"))
        return hmac.new(self.lookup_key, value.encode("utf-8"), hashlib.sha256).hexdigest()

    def seal(self, value: str) -> str:
        return self.cipher.encrypt(value.encode("utf-8")).decode("ascii")

    def open(self, value: str) -> str:
        return self.cipher.decrypt(value.encode("ascii")).decode("utf-8")

    def verify_password(self, encoded: str, password: str) -> bool:
        try:
            return self.passwords.verify(encoded, password)
        except (VerificationError, ValueError):
            return False