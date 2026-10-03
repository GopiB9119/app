import re
import unicodedata
from datetime import date
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, AwareDatetime, BaseModel, BeforeValidator, Field, StringConstraints, field_validator, model_validator

from app.modules.identity.schemas import Input

CareSource = Literal["prescriber", "pharmacist", "package_label", "self"]
CareStatus = Literal["active", "stopped"]
DoseOutcome = Literal["taken", "skipped"]
ClockChange = Literal["none", "shifted_forward", "repeated_time_first"]
CLOCK_TIME = re.compile(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]")


def plain_line(value: str) -> str:
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise ValueError("Use plain text without control characters.")
    return value


def plain_text(value: str) -> str:
    value = value.replace("\r\n", "\n")
    if any(unicodedata.category(character).startswith("C") and character != "\n" for character in value):
        raise ValueError("Use plain text without control characters.")
    return value


def calendar_date(value):
    if not isinstance(value, str):
        raise ValueError("Use an ISO calendar date.")
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Use YYYY-MM-DD.")
    return parsed


def optional_date(value):
    return None if value is None else calendar_date(value)


def clock_time(value: str) -> str:
    if CLOCK_TIME.fullmatch(value) is None:
        raise ValueError("Use a 24-hour HH:MM time.")
    return value


MedicineName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120), AfterValidator(plain_line)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60), AfterValidator(plain_line)]
DoseText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120), AfterValidator(plain_line)]
InstructionText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500), AfterValidator(plain_text)]
CalendarDate = Annotated[date, BeforeValidator(calendar_date)]
OptionalDate = Annotated[date | None, BeforeValidator(optional_date)]
ClockTime = Annotated[str, StringConstraints(min_length=5, max_length=5), AfterValidator(clock_time)]


class CreateCareInstruction(Input):
    medicine_name: MedicineName
    strength: ShortText = ""
    form: ShortText = ""
    dose: DoseText
    instructions: InstructionText = ""
    source: CareSource
    timezone: str = Field(min_length=1, max_length=64)
    times: list[ClockTime] = Field(min_length=1, max_length=6)
    start_date: CalendarDate
    end_date: OptionalDate = None
    confirmed: Literal[True]

    @field_validator("timezone")
    @classmethod
    def named_zone(cls, value):
        if value != "UTC" and "/" not in value:
            raise ValueError("Use a named IANA timezone, not an abbreviation.")
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Select a valid IANA timezone.") from error
        return value

    @field_validator("times")
    @classmethod
    def distinct_times(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("List each daily time once.")
        return sorted(value)

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("The last day cannot be before the first day.")
        return self


class StopCareInstruction(Input):
    pass


class ReportDose(Input):
    local_date: CalendarDate
    local_time: ClockTime
    outcome: DoseOutcome


class CareInstructionView(BaseModel):
    id: UUID
    medicine_name: str
    strength: str
    form: str
    dose: str
    instructions: str
    source: CareSource
    timezone: str
    times: list[str]
    start_date: date
    end_date: date | None
    status: CareStatus
    version: int
    confirmed_by_account_id: UUID
    confirmed_at: AwareDatetime
    created_at: AwareDatetime
    stopped_at: AwareDatetime | None
    etag: str


class CareDayInstruction(BaseModel):
    id: UUID
    medicine_name: str
    strength: str
    form: str
    dose: str
    status: CareStatus


class CareEarlierAnswer(BaseModel):
    outcome: DoseOutcome
    revision: int
    recorded_at: AwareDatetime
    replaced_at: AwareDatetime


class CareReportView(BaseModel):
    outcome: DoseOutcome
    revision: int
    reported_at: AwareDatetime
    updated_at: AwareDatetime
    # DEC-030: answers this one replaced, newest first; at most EARLIER_SHOWN of them.
    earlier: list[CareEarlierAnswer] = []


class CareOccurrenceView(BaseModel):
    instruction_id: UUID
    local_date: date
    local_time: str
    display_time: str
    timezone: str
    scheduled_at: AwareDatetime
    clock_change: ClockChange
    report: CareReportView | None
    can_report: bool
    etag: str


class OmittedCareTime(BaseModel):
    instruction_id: UUID
    local_time: str
    same_moment_as: str


class CareDayView(BaseModel):
    local_date: date
    instructions: list[CareDayInstruction]
    occurrences: list[CareOccurrenceView]
    omitted: list[OmittedCareTime]
