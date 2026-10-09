import time
from contextlib import asynccontextmanager

import anyio
from anyio.lowlevel import checkpoint_if_cancelled
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer
from starlette.concurrency import run_in_threadpool

from app.modules.identity.api import token
from app.modules.identity.schemas import ErrorEnvelope
from app.modules.realtime.leases import unavailable


@asynccontextmanager
async def lifespan(application):
    leases = application.state.live.leases
    leases.start()
    try:
        yield
    finally:
        with anyio.CancelScope(shield=True):
            await run_in_threadpool(leases.close)


router = APIRouter(
    prefix="/v1", tags=["Live updates"],
    lifespan=lifespan,
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (401, 429, 503)},
)

STREAM = {
    200: {
        "description": (
            "Server-sent events. `ready` once listening; `change` with a kind (`conversation`, `notifications`, "
            "`agent` or `search`), a reason and identifiers only. A `change` of kind `typing` instead carries "
            "conversation, participant and client IDs, a sequence, typing/mention flags and an expiry, never draft "
            "text; it is transient and is not replayed or read from message history. `resync` means hints were lost; "
            "`end` gives a reason before the stream closes. A comment line arrives every 15 seconds. "
            "Read changed persistent data through the other operations; typing does not require a refresh."
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

    def __init__(self, service, value, reservation):
        self.service = service
        self.reservation = reservation
        self.started = False
        super().__init__(service.stream(value, reservation.account_id, reservation), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})

    async def stream_response(self, send):
        first = await anext(self.body_iterator)
        if time.monotonic() >= self.reservation.deadline:
            raise unavailable()
        self.started = True
        await send({"type": "http.response.start", "status": self.status_code, "headers": self.raw_headers})
        if time.monotonic() >= self.reservation.deadline:
            return
        await send({"type": "http.response.body", "body": first.encode(self.charset), "more_body": True})
        async for chunk in self.body_iterator:
            if time.monotonic() >= self.reservation.deadline:
                return
            await send({"type": "http.response.body", "body": chunk.encode(self.charset), "more_body": True})
        if time.monotonic() >= self.reservation.deadline:
            return
        await send({"type": "http.response.body", "body": b"", "more_body": False})

    async def __call__(self, scope, receive, send):
        try:
            if time.monotonic() >= self.reservation.deadline:
                raise unavailable()
            async with anyio.create_task_group() as group:
                async def stream():
                    await self.stream_response(send)
                    group.cancel_scope.cancel()

                group.start_soon(stream)
                async def expiry():
                    while True:
                        remaining = self.reservation.deadline - time.monotonic()
                        if remaining <= 0:
                            group.cancel_scope.cancel()
                            return
                        await anyio.sleep(remaining)

                group.start_soon(expiry)
                await self.listen_for_disconnect(receive)
                group.cancel_scope.cancel()
            if not self.started and time.monotonic() >= self.reservation.deadline:
                raise unavailable()
        except BaseExceptionGroup as failures:
            if len(failures.exceptions) == 1:
                raise failures.exceptions[0] from None
            raise
        finally:
            # A stream cancelled while its frame was being sent is still paused at a yield: close it now.
            with anyio.CancelScope(shield=True):
                try:
                    await self.body_iterator.aclose()
                finally:
                    await run_in_threadpool(self.service.leases.release, self.reservation)


@router.get("/live", response_class=StreamingResponse, responses=STREAM)
async def live(request: Request):
    value = token(request)
    service = request.app.state.live
    with anyio.CancelScope(shield=True):
        reservation = await run_in_threadpool(service.acquire, value)
    # A request cancelled while acquiring must free its place instead of handing off a response nobody owns.
    try:
        await checkpoint_if_cancelled()
    except BaseException:
        with anyio.CancelScope(shield=True):
            await run_in_threadpool(service.leases.release, reservation)
        raise
    return LiveResponse(service, value, reservation)
