from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import AccountSession, User
from app.modules.spaces.models import Space

RUN_STATUSES = (
    "queued", "running", "waiting_for_approval", "waiting_for_user", "verifying",
    "completed", "failed", "cancelled", "timed_out", "expired",
)
TERMINAL_STATUSES = ("completed", "failed", "cancelled", "timed_out", "expired")
APPROVAL_STATUSES = ("pending", "approved", "rejected", "expired", "cancelled", "superseded")


DEFINITION_KEYS = ("family", "couple", "solo", "group")


def quoted(values):
    return ", ".join(f"'{value}'" for value in values)


class AgentInstance(Base):
    """A Space's agent identity and routing (DEC-049): identity and a fixed definition, never a member or a permission."""

    __tablename__ = "agent_instances"
    __table_args__ = (
        UniqueConstraint("space_id", name="uq_agent_instance_space"),
        UniqueConstraint("space_id", "id", name="uq_agent_instance_space_id"),
        # The definition must be the one for the Space's own type, so a binding cannot be filed under another type.
        ForeignKeyConstraint(["space_id", "definition_key"], ["spaces.id", "spaces.space_type"], name="fk_agent_instance_space_type"),
        CheckConstraint(f"definition_key IN ({quoted(DEFINITION_KEYS)})", name="ck_agent_instance_definition"),
        CheckConstraint("definition_version > 0", name="ck_agent_instance_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(String(36))
    definition_key: Mapped[str] = mapped_column(String(16))
    definition_version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (
        UniqueConstraint("account_id", "request_key", name="uq_agent_run_request"),
        # A run can only name the agent of its own Space. Older runs keep no link until they are backfilled.
        ForeignKeyConstraint(["space_id", "agent_instance_id"], ["agent_instances.space_id", "agent_instances.id"], name="fk_agent_run_instance"),
        CheckConstraint(f"status IN ({quoted(RUN_STATUSES)})", name="ck_agent_run_status"),
        CheckConstraint("length(message) BETWEEN 1 AND 2000", name="ck_agent_run_message"),
        CheckConstraint(
            "version > 0 AND attempts >= 0 AND steps_used >= 0 AND tool_calls_used >= 0 AND event_sequence >= 0",
            name="ck_agent_run_counters",
        ),
        CheckConstraint(f"(status IN ({quoted(TERMINAL_STATUSES)})) = (finished_at IS NOT NULL)", name="ck_agent_run_finished"),
        CheckConstraint("(status = 'waiting_for_user') = (question_id IS NOT NULL)", name="ck_agent_run_question"),
        # DEC-060: the Main Agent has no Space at all; a Space agent's run always names its Space and admission.
        CheckConstraint(
            "(agent_kind = 'main' AND space_id IS NULL AND admission_id IS NULL AND agent_instance_id IS NULL)"
            " OR (agent_kind = 'space' AND space_id IS NOT NULL AND admission_id IS NOT NULL)",
            name="ck_agent_run_kind",
        ),
        Index("ix_agent_runs_claim", "status", "available_at"),
        Index("ix_agent_runs_history", "account_id", "space_id", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_kind: Mapped[str] = mapped_column(String(8), server_default="space")
    space_id: Mapped[str | None] = mapped_column(ForeignKey(Space.id))
    agent_instance_id: Mapped[str | None] = mapped_column(String(36))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    admission_id: Mapped[str | None] = mapped_column(String(36))
    session_id: Mapped[str] = mapped_column(ForeignKey(AccountSession.id))
    request_key: Mapped[str] = mapped_column(String(36))
    request_digest: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(24))
    stop_reason: Mapped[str | None] = mapped_column(String(40))
    intent: Mapped[str | None] = mapped_column(String(32))
    outcome: Mapped[str | None] = mapped_column(String(24))
    plan: Mapped[list] = mapped_column(JSON)
    state: Mapped[dict] = mapped_column(JSON)
    answer: Mapped[str | None] = mapped_column(Text)
    question_id: Mapped[str | None] = mapped_column(String(36))
    question: Mapped[str | None] = mapped_column(Text)
    question_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_owner: Mapped[str | None] = mapped_column(String(36))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    steps_used: Mapped[int] = mapped_column(Integer, default=0)
    tool_calls_used: Mapped[int] = mapped_column(Integer, default=0)
    event_sequence: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentRunEvent(Base):
    __tablename__ = "agent_run_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence", name="uq_agent_run_event_sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey(AgentRun.id))
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(48))
    summary: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AgentApproval(Base):
    __tablename__ = "agent_approvals"
    __table_args__ = (
        # DEC-059: one run may propose several changes, one after another, each with its own approval.
        Index("ix_agent_approvals_run", "run_id", "created_at"),
        UniqueConstraint("effect_key", name="uq_agent_approval_effect"),
        CheckConstraint(f"status IN ({quoted(APPROVAL_STATUSES)})", name="ck_agent_approval_status"),
        CheckConstraint("(status = 'pending') = (decided_at IS NULL)", name="ck_agent_approval_decision"),
        CheckConstraint("(status = 'approved') = (result_ref IS NOT NULL)", name="ck_agent_approval_result"),
        CheckConstraint("expires_at > created_at AND version > 0", name="ck_agent_approval_bounds"),
        CheckConstraint("(space_id IS NULL) = (admission_id IS NULL)", name="ck_agent_approval_scope"),
        Index("ix_agent_approvals_pending", "account_id", "status", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey(AgentRun.id))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    admission_id: Mapped[str | None] = mapped_column(String(36))
    space_id: Mapped[str | None] = mapped_column(ForeignKey(Space.id))
    tool_name: Mapped[str] = mapped_column(String(64))
    tool_version: Mapped[str] = mapped_column(String(8))
    risk: Mapped[str] = mapped_column(String(8))
    summary: Mapped[str] = mapped_column(String(300))
    payload: Mapped[dict] = mapped_column(JSON)
    payload_digest: Mapped[str] = mapped_column(String(64))
    effect_key: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    reason: Mapped[str | None] = mapped_column(String(48))
    decision_key: Mapped[str | None] = mapped_column(String(36))
    result_ref: Mapped[str | None] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentToolCall(Base):
    __tablename__ = "agent_tool_calls"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_agent_tool_call_sequence"),
        CheckConstraint("effect IN ('read', 'write')", name="ck_agent_tool_call_effect"),
        CheckConstraint("risk IN ('low', 'medium')", name="ck_agent_tool_call_risk"),
        CheckConstraint("status IN ('succeeded', 'failed')", name="ck_agent_tool_call_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey(AgentRun.id))
    sequence: Mapped[int] = mapped_column(Integer)
    tool_name: Mapped[str] = mapped_column(String(64))
    tool_version: Mapped[str] = mapped_column(String(8))
    effect: Mapped[str] = mapped_column(String(8))
    risk: Mapped[str] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(16))
    input_digest: Mapped[str] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(String(300))
    result_ref: Mapped[str | None] = mapped_column(String(36))
    error_code: Mapped[str | None] = mapped_column(String(48))
    approval_id: Mapped[str | None] = mapped_column(ForeignKey(AgentApproval.id))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AgentMemory(Base):
    __tablename__ = "agent_memories"
    __table_args__ = (
        CheckConstraint("kind IN ('preference', 'note')", name="ck_agent_memory_kind"),
        CheckConstraint("(kind = 'preference') = (key IS NOT NULL)", name="ck_agent_memory_key"),
        CheckConstraint("length(content) BETWEEN 1 AND 200", name="ck_agent_memory_content"),
        Index("uq_agent_memory_preference", "account_id", "key", unique=True, postgresql_where=text("key IS NOT NULL")),
        Index("ix_agent_memory_account", "account_id", "created_at"),
        Index("ix_agent_memory_space", "account_id", "space_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    # A note saved by a Space's agent stays with that Space (DEC-060); NULL is the person's own memory.
    space_id: Mapped[str | None] = mapped_column(ForeignKey(Space.id))
    kind: Mapped[str] = mapped_column(String(16))
    key: Mapped[str | None] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(String(200))
    source_run_id: Mapped[str | None] = mapped_column(ForeignKey(AgentRun.id))
    source: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
