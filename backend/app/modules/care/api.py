from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPBearer
from pydantic import BeforeValidator

from app.modules.care.schemas import (
    CareDayView,
    CareInstructionView,
    CareOccurrenceView,
    CreateCareInstruction,
    ReportDose,
    StopCareInstruction,
    calendar_date,
)
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope

router = APIRouter(
    prefix="/v1/care", tags=["Care"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 412, 422, 428, 429, 503)},
)


def instruction_response(request, response, view):
    response.headers["ETag"] = view.etag
    return envelope(request, view)


@router.get("/instructions", response_model=Envelope[list[CareInstructionView]])
def list_instructions(request: Request, status: Literal["active", "stopped"] = Query(default="active")):
    return envelope(request, request.app.state.care.list_instructions(token(request), status))


@router.post("/instructions", response_model=Envelope[CareInstructionView], status_code=201)
def create_instruction(request: Request, response: Response, body: CreateCareInstruction, idempotency_key: UUID = Header()):
    view = request.app.state.care.create(token(request), body, str(idempotency_key))
    response.headers["Location"] = f"/v1/care/instructions/{view.id}"
    return instruction_response(request, response, view)


@router.get("/instructions/{instruction_id}", response_model=Envelope[CareInstructionView])
def read_instruction(request: Request, response: Response, instruction_id: UUID):
    return instruction_response(request, response, request.app.state.care.read(token(request), str(instruction_id)))


@router.post("/instructions/{instruction_id}/stop", response_model=Envelope[CareInstructionView])
def stop_instruction(
    request: Request, response: Response, instruction_id: UUID, body: StopCareInstruction,
    idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140),
):
    return instruction_response(request, response, request.app.state.care.stop(
        token(request), str(instruction_id), str(idempotency_key), if_match,
    ))


@router.post("/instructions/{instruction_id}/reports", response_model=Envelope[CareOccurrenceView])
def report_dose(
    request: Request, instruction_id: UUID, body: ReportDose,
    idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140),
):
    return envelope(request, request.app.state.care.report(
        token(request), str(instruction_id), body, str(idempotency_key), if_match,
    ))


@router.get("/day", response_model=Envelope[CareDayView])
def care_day(request: Request, day: Annotated[date, BeforeValidator(calendar_date), Query(alias="date")]):
    return envelope(request, request.app.state.care.day(token(request), day))
