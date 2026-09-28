from datetime import date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User
from app.modules.spaces.models import Space


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("id", "space_id", name="uq_task_scope"),
        UniqueConstraint("space_id", "created_by_id", "creation_key", name="uq_task_creation"),
        ForeignKeyConstraint(
            ["space_id", "assignee_account_id"],
            ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_task_assignee_scope",
        ),
        CheckConstraint("length(btrim(title)) BETWEEN 1 AND 200", name="ck_task_title"),
        CheckConstraint("length(description) <= 5000", name="ck_task_description"),
        CheckConstraint("status IN ('open', 'in_progress', 'completed', 'cancelled')", name="ck_task_status"),
        CheckConstraint("version > 0", name="ck_task_version"),
        CheckConstraint(
            "(assignee_account_id IS NULL AND assignee_admission_id IS NULL) OR "
            "(assignee_account_id IS NOT NULL AND assignee_admission_id IS NOT NULL)",
            name="ck_task_assignee_binding",
        ),
        CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL AND completed_by_account_id IS NOT NULL) OR "
            "(status <> 'completed' AND completed_at IS NULL AND completed_by_account_id IS NULL)",
            name="ck_task_completion",
        ),
        Index("ix_tasks_space_status", "space_id", "status", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey(Space.id))
    created_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    creator_admission_id: Mapped[str] = mapped_column(String(36))
    creation_key: Mapped[str] = mapped_column(String(36))
    creation_digest: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="open")
    due_date: Mapped[date | None] = mapped_column(Date)
    assignee_account_id: Mapped[str | None] = mapped_column(String(36))
    assignee_admission_id: Mapped[str | None] = mapped_column(String(36))
    completed_by_account_id: Mapped[str | None] = mapped_column(ForeignKey(User.id))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TaskAccess(Base):
    __tablename__ = "task_access"
    __table_args__ = (
        ForeignKeyConstraint(
            ["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_task_access_scope"
        ),
        ForeignKeyConstraint(
            ["space_id", "account_id"],
            ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_task_access_membership",
        ),
        Index("ix_task_access_admission", "space_id", "account_id", "admission_id", "task_id"),
    )

    task_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    space_id: Mapped[str] = mapped_column(String(36))
    account_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(36), primary_key=True)


class TaskAudit(Base):
    __tablename__ = "task_audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey(Task.id), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    actor_admission_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(64))
    task_version: Mapped[int] = mapped_column(Integer)
    status_before: Mapped[str | None] = mapped_column(String(16))
    status_after: Mapped[str] = mapped_column(String(16))
    changed_fields: Mapped[list[str]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TaskCommand(Base):
    __tablename__ = "task_commands"
    __table_args__ = (CheckConstraint("operation IN ('edit', 'status')", name="ck_task_command_operation"),)

    task_id: Mapped[str] = mapped_column(ForeignKey(Task.id), primary_key=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    operation: Mapped[str] = mapped_column(String(16), primary_key=True)
    request_key: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor_admission_id: Mapped[str] = mapped_column(String(36))
    input_digest: Mapped[str] = mapped_column(String(64))
    audit_id: Mapped[str] = mapped_column(ForeignKey(TaskAudit.id))