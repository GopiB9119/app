from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.spaces.models import Space


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("kind IN ('space', 'direct')", name="ck_conversation_kind"),
        CheckConstraint("last_sequence >= 0", name="ck_conversation_sequence"),
        CheckConstraint(
            "(kind = 'space' AND first_account_id IS NULL AND second_account_id IS NULL "
            "AND first_admission_id IS NULL AND second_admission_id IS NULL) OR "
            "(kind = 'direct' AND first_account_id IS NOT NULL AND second_account_id IS NOT NULL "
            "AND first_account_id < second_account_id "
            "AND first_admission_id IS NOT NULL AND second_admission_id IS NOT NULL)",
            name="ck_conversation_participants",
        ),
        UniqueConstraint(
            "space_id", "first_account_id", "second_account_id", "first_admission_id", "second_admission_id",
            name="uq_direct_conversation",
        ),
        ForeignKeyConstraint(
            ["space_id", "first_account_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_conversation_first_member",
        ),
        ForeignKeyConstraint(
            ["space_id", "second_account_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_conversation_second_member",
        ),
        Index("uq_space_conversation", "space_id", unique=True, postgresql_where=text("kind = 'space'")),
        Index("ix_conversation_first_account", "first_account_id"),
        Index("ix_conversation_second_account", "second_account_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey(Space.id))
    kind: Mapped[str] = mapped_column(String(16))
    first_account_id: Mapped[str | None] = mapped_column(String(36))
    second_account_id: Mapped[str | None] = mapped_column(String(36))
    first_admission_id: Mapped[str | None] = mapped_column(String(36))
    second_admission_id: Mapped[str | None] = mapped_column(String(36))
    created_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    last_sequence: Mapped[int] = mapped_column(Integer, default=0)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "sequence", name="uq_conversation_message_sequence"),
        UniqueConstraint("conversation_id", "sender_id", "client_message_id", name="uq_conversation_message_client"),
        CheckConstraint("sequence > 0", name="ck_conversation_message_sequence"),
        CheckConstraint("(deleted_at IS NULL) = (body_cipher IS NOT NULL)", name="ck_conversation_message_tombstone"),
        CheckConstraint("admissions_before >= 0", name="ck_conversation_message_admissions"),
        Index("ix_conversation_message_time", "conversation_id", "created_at"),
        Index("ix_conversation_message_sender_time", "sender_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey(Conversation.id))
    sequence: Mapped[int] = mapped_column(Integer)
    sender_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    sender_admission_id: Mapped[str] = mapped_column(String(36))
    client_message_id: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    admissions_before: Mapped[int] = mapped_column(Integer)
    body_cipher: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ConversationReadState(Base):
    __tablename__ = "conversation_read_states"
    __table_args__ = (CheckConstraint("read_sequence >= 0", name="ck_conversation_read_sequence"),)

    conversation_id: Mapped[str] = mapped_column(ForeignKey(Conversation.id), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(36))
    read_sequence: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
