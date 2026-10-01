from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_user_version"),
        CheckConstraint(
            "status IN ('active', 'suspended', 'deactivated', 'deletion_requested', 'deleted')",
            name="ck_user_status",
        ),
        # An erased account keeps only its identifier, so the rows that name it stay valid (DEC-022).
        CheckConstraint("(status = 'deleted') = (email_cipher IS NULL)", name="ck_user_erased_email"),
        CheckConstraint("(status = 'deleted') = (password_hash IS NULL)", name="ck_user_erased_password"),
        CheckConstraint(
            "status <> 'deletion_requested' OR (deletion_requested_at IS NOT NULL AND purge_after IS NOT NULL)",
            name="ck_user_deletion_request",
        ),
        CheckConstraint("(status = 'deleted') = (purged_at IS NOT NULL)", name="ck_user_purged"),
        Index("ix_user_purge_due", "purge_after", postgresql_where=text("status = 'deletion_requested'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email_lookup: Mapped[str] = mapped_column(String(64), unique=True)
    email_cipher: Mapped[str | None] = mapped_column(Text)
    password_hash: Mapped[str | None] = mapped_column(String(512))
    display_name: Mapped[str] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(24), default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purge_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Challenge(Base):
    __tablename__ = "identity_challenges"
    __table_args__ = (
        CheckConstraint("attempts >= 0", name="ck_challenge_attempts"),
        CheckConstraint("purpose IN ('registration', 'recovery')", name="ck_challenge_purpose"),
        Index("ix_challenge_email_purpose", "email_lookup", "purpose"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_key: Mapped[str] = mapped_column(String(64), unique=True)
    context_digest: Mapped[str] = mapped_column(String(64))
    email_lookup: Mapped[str] = mapped_column(String(64))
    email_cipher: Mapped[str] = mapped_column(Text)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    purpose: Mapped[str] = mapped_column(String(16))
    proof_digest: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AccountSession(Base):
    __tablename__ = "account_sessions"
    __table_args__ = (Index("ix_session_account", "account_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_digest: Mapped[str] = mapped_column(String(64), unique=True)
    device_name: Mapped[str] = mapped_column(String(80))
    platform: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SecurityEvent(Base):
    __tablename__ = "identity_security_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(64))
    target_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OutboxEvent(Base):
    __tablename__ = "domain_outbox"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    aggregate_id: Mapped[str] = mapped_column(String(36))
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class IdentityMail(Base):
    __tablename__ = "identity_mail_jobs"
    __table_args__ = (Index("ix_identity_mail_due", "status", "available_at"),)

    id: Mapped[str] = mapped_column(ForeignKey("identity_challenges.id"), primary_key=True)
    payload_cipher: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[str | None] = mapped_column(String(36))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RateBucket(Base):
    __tablename__ = "identity_rate_buckets"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AccountExport(Base):
    __tablename__ = "account_exports"
    __table_args__ = (
        UniqueConstraint("account_id", "request_key", name="uq_account_export_request"),
        CheckConstraint(
            "status IN ('queued', 'building', 'ready', 'outdated', 'cancelled', 'failed', 'expired')",
            name="ck_account_export_status",
        ),
        CheckConstraint("attempts >= 0 AND download_count >= 0", name="ck_account_export_counts"),
        CheckConstraint("(status = 'ready') = (archive_cipher IS NOT NULL)", name="ck_account_export_archive"),
        Index("ix_account_export_account", "account_id", "created_at"),
        Index("ix_account_export_due", "status", "available_at"),
        Index(
            "uq_account_export_active", "account_id", unique=True,
            postgresql_where=text("status IN ('queued', 'building')"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    session_id: Mapped[str] = mapped_column(ForeignKey("account_sessions.id"))
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    categories: Mapped[list[str]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    reason: Mapped[str | None] = mapped_column(String(24))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[str | None] = mapped_column(String(36))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archive_cipher: Mapped[str | None] = mapped_column(Text)
    archive_bytes: Mapped[int | None] = mapped_column(Integer)
    included_access: Mapped[dict | None] = mapped_column(JSON)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    last_downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))