from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer
from starlette.concurrency import run_in_threadpool

from app.modules.identity.api import token
from app.modules.identity.schemas import ErrorEnvelope

router = APIRouter(
    prefix="/v1", tags=["Live updates"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (401, 429, 503)},
)

STREAM = {
    200: {
        "description": (
            "Server-sent events. `ready` once listening; `change` with a kind (`conversation` or `notifications`), a "
            "reason and identifiers only; `resync` when hints were lost; `end` with a reason before the stream closes. "
            "A comment line arrives every 15 seconds. Read the changed data through the other operations."
        ),
        "content": {"text/event-stream": {"schema": {"type": "string"}}},
    },
}


@router.get("/live", response_class=StreamingResponse, responses=STREAM)
async def live(request: Request):
    value = token(request)
    service = request.app.state.live
    account_id = await run_in_threadpool(service.open, value)
    return StreamingResponse(service.stream(value, account_id), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})
