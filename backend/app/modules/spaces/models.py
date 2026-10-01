from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User


class Space(Base):
    __tablename__ = "spaces"
    __table_args__ = (
        UniqueConstraint("created_by_id", "creation_key", name="uq_space_creation_intent"),
        CheckConstraint("length(btrim(name)) BETWEEN 1 AND 80", name="ck_space_name"),
        CheckConstraint("space_type IN ('family', 'solo', 'group')", name="ck_space_type"),
        # Only group Spaces may ever be public.
        CheckConstraint("visibility = 'private' OR (visibility = 'public' AND space_type = 'group')", name="ck_space_visibility"),
        CheckConstraint("length(description) <= 280", name="ck_space_description"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_space_status"),
        CheckConstraint("version > 0", name="ck_space_version"),
        CheckConstraint("admission_sequence > 0", name="ck_space_admission_sequence"),
        Index("ix_space_public_directory", "created_at", "id", postgresql_where=text("visibility = 'public' AND status = 'active'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(280), default="", server_default="")
    space_type: Mapped[str] = mapped_column(String(16), default="family")
    visibility: Mapped[str] = mapped_column(String(16), default="private")
    status: Mapped[str] = mapped_column(String(16), default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    # Counts admissions; each membership keeps its own number, and history boundaries compare numbers, not times.
    admission_sequence: Mapped[int] = mapped_column(Integer)
    created_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SpaceMembership(Base):
    __tablename__ = "space_memberships"
    __table_args__ = (
        UniqueConstraint("admission_id", name="uq_space_membership_admission"),
        UniqueConstraint("space_id", "admission_sequence", name="uq_space_membership_admission_sequence"),
        CheckConstraint("admission_sequence > 0", name="ck_space_membership_admission_sequence"),
        CheckConstraint("role IN ('owner', 'member')", name="ck_space_membership_role"),
        CheckConstraint("status IN ('active', 'removed')", name="ck_space_membership_status"),
        Index("ix_space_membership_account", "account_id", "status", "space_id"),
        Index(
            "uq_space_active_owner",
            "space_id",
            unique=True,
            postgresql_where=text("role = 'owner' AND status = 'active'"),
        ),
    )

    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id"), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(36), default=lambda: str(uuid4()))
    admission_sequence: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="active")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SpaceAuditEvent(Base):
    __tablename__ = "space_audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    target_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SpaceJoinRequest(Base):
    __tablename__ = "space_join_requests"
    __table_args__ = (
        UniqueConstraint("account_id", "request_key", name="uq_space_join_request_key"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'declined', 'cancelled', 'closed', 'expired')", name="ck_space_join_request_status",
        ),
        CheckConstraint("expires_at > created_at", name="ck_space_join_request_expiry"),
        CheckConstraint("(status = 'pending') = (resolved_at IS NULL)", name="ck_space_join_request_resolution"),
        CheckConstraint("(status = 'approved') = (admission_id IS NOT NULL)", name="ck_space_join_request_admission"),
        Index("ix_space_join_request_queue", "space_id", "status", "created_at"),
        Index("ix_space_join_request_account", "account_id", "created_at"),
        Index("uq_space_join_request_pending", "space_id", "account_id", unique=True, postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id"))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    # The name the person asked to join, kept so a later rename of a group gone private never reaches them.
    space_name: Mapped[str] = mapped_column(String(80))
    note: Mapped[str] = mapped_column(String(280))
    status: Mapped[str] = mapped_column(String(16))
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))
    admission_id: Mapped[str | None] = mapped_column(String(36))


class SpaceMembershipCommand(Base):
    __tablename__ = "space_membership_commands"
    __table_args__ = (
        UniqueConstraint("space_id", "actor_id", "request_key", name="uq_space_membership_command"),
        CheckConstraint("action IN ('remove', 'leave')", name="ck_space_membership_command_action"),
    )

    id: Mapped[str] = mapped_column(ForeignKey("space_audit_events.id"), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    actor_admission_id: Mapped[str] = mapped_column(String(36))
    target_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    target_admission_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(16))
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))


class SpaceSettingsCommand(Base):
    __tablename__ = "space_settings_commands"
    __table_args__ = (
        UniqueConstraint("space_id", "actor_id", "request_key", name="uq_space_settings_command"),
    )

    id: Mapped[str] = mapped_column(ForeignKey("space_audit_events.id"), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    actor_admission_id: Mapped[str] = mapped_column(String(36))
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))


class SpaceInvitation(Base):
    __tablename__ = "space_invitations"
    __table_args__ = (
        UniqueConstraint("space_id", "inviter_id", "request_key", name="uq_space_invitation_request"),
        CheckConstraint("recipient_id <> inviter_id", name="ck_space_invitation_recipient"),
        CheckConstraint("expires_at > created_at", name="ck_space_invitation_expiry"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')",
            name="ck_space_invitation_status",
        ),
        CheckConstraint(
            "(status = 'accepted' AND accepted_admission_id IS NOT NULL) OR "
            "(status <> 'accepted' AND accepted_admission_id IS NULL)",
            name="ck_space_invitation_admission",
        ),
        Index("ix_space_invitation_inbox", "recipient_id", "status", "id"),
        Index(
            "uq_space_pending_recipient", "space_id", "recipient_id", unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id"))
    inviter_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    recipient_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    request_key: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_admission_id: Mapped[str | None] = mapped_column(String(36))


class OwnershipTransfer(Base):
    __tablename__ = "space_ownership_transfers"
    __table_args__ = (
        UniqueConstraint("space_id", "from_account_id", "request_key", name="uq_ownership_transfer_request"),
        CheckConstraint("from_account_id <> to_account_id", name="ck_ownership_transfer_participants"),
        CheckConstraint("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated')", name="ck_ownership_transfer_status"),
        CheckConstraint("expires_at > created_at AND source_version > 0 AND version > 0", name="ck_ownership_transfer_bounds"),
        CheckConstraint("(status = 'pending') = (resolved_at IS NULL)", name="ck_ownership_transfer_resolution"),
        Index("uq_ownership_transfer_pending", "space_id", unique=True, postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey(Space.id))
    from_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    to_account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    from_admission_id: Mapped[str] = mapped_column(String(36))
    to_admission_id: Mapped[str] = mapped_column(String(36))
    from_session_id: Mapped[str] = mapped_column(ForeignKey("account_sessions.id"))
    source_version: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    decision_etag: Mapped[str | None] = mapped_column(String(70))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))