import os
from pathlib import Path
from typing import Literal

from cryptography.fernet import Fernet
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.keys import Keyring


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="COMMUNITY_", extra="ignore")

    environment: Literal["development", "test"] = "development"
    database_url: str = "postgresql+psycopg://community:local-development-only@localhost/community"
    secret_file: Path = Path(".local/identity.key")
    secret_key: str | None = None
    smtp_host: Literal["mail", "localhost", "127.0.0.1"] = "mail"
    smtp_port: int = 1025
    challenge_minutes: int = 15
    challenge_attempts: int = 5
    session_hours: int = 8
    registration_limit: int = 5
    login_limit: int = 10
    network_limit: int = 60
    # Shared with the web proxy; only a request carrying it may name the browser's address for rate limits.
    proxy_key: str | None = None
    # Bearer key for /metrics; while unset, the endpoint answers 404.
    metrics_key: str | None = None
    reminder_dispatch_enabled: bool = True
    # Live updates: a comment line every heartbeat, the session checked again this often, a stream closed after the maximum.
    live_heartbeat_seconds: int = 15
    live_recheck_seconds: int = 60
    live_max_seconds: int = 1800
    # The owner's Azure model behind the LLM agent (DEC-059): off while the URL, name or key is empty.
    agent_model_url: str = ""
    agent_model_name: str = ""
    agent_model_key: SecretStr = SecretStr("")
    # Extra JSON request fields the chosen model needs, for example {"temperature": 0}.
    agent_model_options: str = "{}"
    # Runs work in the background, so one model call may take longer than a page waits.
    agent_model_timeout_seconds: float = 45.0
    # Q44: the most one model call may use.
    agent_model_call_tokens: int = 10_000
    # Q44: the owner's total for all live use of the model, counted in this folder; no count while it is empty.
    agent_model_usage_dir: str = ""
    agent_model_token_limit: int = 2_000_000
    # The owner's TinyFish key for the agent's web lookups (DEC-058): off while it is empty. Testing only.
    agent_web_key: SecretStr = SecretStr("")
    agent_web_daily_limit: int = 20

    def load_key(self) -> bytes:
        if self.secret_key:
            return self.secret_key.encode("ascii")
        self.secret_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(self.secret_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            return self.secret_file.read_bytes().strip()
        with os.fdopen(descriptor, "wb") as target:
            key = Fernet.generate_key()
            target.write(key)
        return key

    def load_keyring(self) -> Keyring:
        if self.secret_key:
            return Keyring.parse(self.secret_key.encode("ascii"))
        return Keyring.parse(self.load_key())