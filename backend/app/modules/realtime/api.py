import anyio
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


class LiveResponse(StreamingResponse):
    """A stream that ends as soon as its client leaves (T124).

    With an ASGI 2.4 server, Starlette stops listening for the client leaving and waits for a write to fail instead,
    but uvicorn's h11 server drops writes to a closed connection without an error. A closed stream would then keep its
    subscription, and its place in the per-account limit, until its time limit.
    """

    async def __call__(self, scope, receive, send):
        try:
            async with anyio.create_task_group() as group:
                async def stream():
                    await self.stream_response(send)
                    group.cancel_scope.cancel()

                group.start_soon(stream)
                await self.listen_for_disconnect(receive)
                group.cancel_scope.cancel()
        except BaseExceptionGroup as failures:
            if len(failures.exceptions) == 1:
                raise failures.exceptions[0] from None
            raise
        finally:
            # A stream cancelled while its frame was being sent is still paused at a yield: close it now.
            await self.body_iterator.aclose()


@router.get("/live", response_class=StreamingResponse, responses=STREAM)
async def live(request: Request):
    value = token(request)
    service = request.app.state.live
    account_id = await run_in_threadpool(service.open, value)
    return LiveResponse(service.stream(value, account_id), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})
