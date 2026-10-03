from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.planning.schemas import (
    AssigneeView,
    ChecklistCommand,
    ChecklistView,
    ChangeTaskStatus,
    CreateTask,
    EditTask,
    TaskPage,
    TaskStatus,
    TaskView,
)

router = APIRouter(
    prefix="/v1/tasks", tags=["Tasks"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 412, 422, 428, 503)},
)


def task_response(request, response, result):
    view, etag = result
    response.headers["ETag"] = etag
    return envelope(request, view)


@router.post("", response_model=Envelope[TaskView], status_code=201)
def create_task(request: Request, response: Response, body: CreateTask, idempotency_key: UUID = Header()):
    result = request.app.state.tasks.create(token(request), body, str(idempotency_key))
    response.headers["Location"] = f"/v1/tasks/{result[0].id}"
    return task_response(request, response, result)


@router.get("", response_model=TaskPage)
def list_tasks(
    request: Request, space_id: UUID, limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=2048), status: TaskStatus | None = None,
    assignee: str | None = Query(default=None, pattern=r"^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"),
    due_from: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    due_to: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    data, pagination = request.app.state.tasks.list_tasks(
        token(request), str(space_id), limit, cursor, status, assignee, due_from, due_to
    )
    return {**envelope(request, data), "pagination": pagination}


@router.get("/assignees", response_model=Envelope[list[AssigneeView]])
def task_assignees(request: Request, space_id: UUID, task_id: UUID | None = None):
    return envelope(request, request.app.state.tasks.list_assignees(
        token(request), str(space_id), str(task_id) if task_id else None
    ))


@router.get("/{task_id}", response_model=Envelope[TaskView])
def read_task(request: Request, response: Response, task_id: UUID):
    return task_response(request, response, request.app.state.tasks.read(token(request), str(task_id)))


@router.get("/{task_id}/checklist", response_model=Envelope[ChecklistView])
def read_checklist(request: Request, task_id: UUID):
    return envelope(request, request.app.state.checklists.read(token(request), str(task_id)))


@router.post("/{task_id}/checklist", response_model=Envelope[ChecklistView])
def change_checklist(request: Request, task_id: UUID, body: ChecklistCommand,
                     idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.checklists.mutate(token(request), str(task_id), body, str(idempotency_key), if_match))


@router.patch("/{task_id}", response_model=Envelope[TaskView])
def edit_task(
    request: Request, response: Response, task_id: UUID, body: EditTask,
    idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140),
):
    return task_response(request, response, request.app.state.tasks.mutate(
        token(request), str(task_id), body, str(idempotency_key), if_match, "edit"
    ))


@router.post("/{task_id}/status", response_model=Envelope[TaskView])
def change_task_status(
    request: Request, response: Response, task_id: UUID, body: ChangeTaskStatus,
    idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140),
):
    return task_response(request, response, request.app.state.tasks.mutate(
        token(request), str(task_id), body, str(idempotency_key), if_match, "status"
    ))