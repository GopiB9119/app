from datetime import date, datetime

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.identity.models import User


class CareInstruction(Base):
    """A confirmed medicine instruction. Confirmed content is immutable; a change is a new instruction."""

    __tablename__ = "care_instructions"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'stopped')", name="ck_care_instruction_status"),
        CheckConstraint("source IN ('prescriber', 'pharmacist', 'package_label', 'self')", name="ck_care_instruction_source"),
        CheckConstraint("version > 0", name="ck_care_instruction_version"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_care_instruction_dates"),
        CheckConstraint(
            "(status = 'stopped' AND stopped_at IS NOT NULL) OR (status = 'active' AND stopped_at IS NULL)",
            name="ck_care_instruction_stop",
        ),
        CheckConstraint("confirmed_by_id = account_id", name="ck_care_instruction_subject_confirmed"),
        Index("ix_care_instruction_account", "account_id", "status", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    confirmed_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    payload_cipher: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16))
    timezone: Mapped[str] = mapped_column(String(64))
    times: Mapped[list[str]] = mapped_column(JSON)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CareDoseReport(Base):
    """The subject's own report for one scheduled occurrence. It is not proof of adherence."""

    __tablename__ = "care_dose_reports"
    __table_args__ = (
        UniqueConstraint("instruction_id", "local_date", "local_time", name="uq_care_report_occurrence"),
        CheckConstraint("outcome IN ('taken', 'skipped')", name="ck_care_report_outcome"),
        CheckConstraint("revision > 0", name="ck_care_report_revision"),
        CheckConstraint("local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'", name="ck_care_report_time"),
        CheckConstraint("reported_by_id = account_id", name="ck_care_report_self"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instruction_id: Mapped[str] = mapped_column(ForeignKey(CareInstruction.id))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    reported_by_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    local_date: Mapped[date] = mapped_column(Date)
    local_time: Mapped[str] = mapped_column(String(5))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    outcome: Mapped[str] = mapped_column(String(8))
    revision: Mapped[int] = mapped_column(Integer)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CareDoseAnswer(Base):
    """An earlier answer for one dose, kept when the person corrects it (DEC-030). Never changed afterwards."""

    __tablename__ = "care_dose_report_history"
    __table_args__ = (
        UniqueConstraint("report_id", "revision", name="uq_care_report_history_revision"),
        CheckConstraint("outcome IN ('taken', 'skipped')", name="ck_care_report_history_outcome"),
        CheckConstraint("revision > 0", name="ck_care_report_history_revision"),
        CheckConstraint("replaced_at >= recorded_at", name="ck_care_report_history_order"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    report_id: Mapped[str] = mapped_column(ForeignKey(CareDoseReport.id))
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id))
    outcome: Mapped[str] = mapped_column(String(8))
    revision: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    replaced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CareAudit(Base):
    """Content-free evidence of a care command. Medicine text never appears here."""

    __tablename__ = "care_audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), index=True)
    instruction_id: Mapped[str] = mapped_column(ForeignKey(CareInstruction.id))
    action: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CareCommand(Base):
    __tablename__ = "care_commands"
    __table_args__ = (CheckConstraint("operation IN ('create', 'stop', 'report')", name="ck_care_command_operation"),)

    account_id: Mapped[str] = mapped_column(ForeignKey(User.id), primary_key=True)
    request_key: Mapped[str] = mapped_column(String(36), primary_key=True)
    operation: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(ForeignKey(CareInstruction.id))
    input_digest: Mapped[str] = mapped_column(String(64))
    audit_id: Mapped[str] = mapped_column(ForeignKey(CareAudit.id))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
