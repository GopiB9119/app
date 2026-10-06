import hmac
import re
import secrets
import time
import traceback
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.config import Settings
from app.db import database
from app.errors import DomainError, authentication_required
from app.modules.agents.api import router as agent_router
from app.modules.agents.metrics import render as render_agents
from app.modules.agents.llm import ChatModel
from app.modules.agents.service import AgentService
from app.modules.agents.web import WebLookup
from app.modules.care.api import router as care_router
from app.modules.care.service import CareService
from app.modules.community.api import public_router as community_public_router
from app.modules.community.api import router as community_router
from app.modules.community.help import HelpService
from app.modules.community.help_api import public_router as help_public_router
from app.modules.community.help_api import router as help_router
from app.modules.community.help_metrics import render as render_help
from app.modules.community.lifecycle import PageLifecycleService
from app.modules.community.page_events import PageEventService
from app.modules.community.page_events_api import public_router as page_events_public_router
from app.modules.community.page_events_api import router as page_events_router
from app.modules.community.service import CommunityService
from app.modules.discovery.api import router as search_router
from app.modules.discovery.service import PrivateSearchService
from app.modules.events.api import router as events_router
from app.modules.events.budgets import BudgetService
from app.modules.events.service import EventService
from app.modules.files.api import router as document_router
from app.modules.files.service import DocumentService
from app.modules.identity.api import router
from app.modules.identity.deletion import AccountDeletionService
from app.modules.identity.exports import ExportService
from app.modules.identity.security import Security
from app.modules.identity.service import IdentityService, utcnow
from app.modules.messaging.api import router as messaging_router
from app.modules.messaging.cipher import MessageCipher
from app.modules.messaging.mentions import AgentMentionService
from app.modules.messaging.service import MessagingService
from app.modules.notifications.alerts import AlertService
from app.modules.notifications.api import router as notification_router
from app.modules.notifications.service import NotificationService
from app.modules.planning.api import router as planning_router
from app.modules.planning.calendar import CalendarService, router as calendar_router
from app.modules.planning.checklists import ChecklistService
from app.modules.planning.service import TaskService
from app.modules.realtime.api import router as live_router
from app.modules.realtime.hub import LiveHub
from app.modules.realtime.service import LiveService
from app.modules.safety.api import router as safety_router
from app.modules.scheduling.api import request_router as reminder_request_router
from app.modules.scheduling.api import router as reminder_router
from app.modules.scheduling.api import series_router as reminder_series_router
from app.modules.scheduling.requests import ReminderRequestService
from app.modules.scheduling.series import ReminderSeriesService
from app.modules.scheduling.service import ReminderService
from app.modules.spaces.api import directory_router as space_directory_router
from app.modules.spaces.api import invitation_router
from app.modules.spaces.api import join_request_router as space_join_request_router
from app.modules.spaces.api import my_join_request_router as my_space_join_request_router
from app.modules.spaces.api import router as spaces_router
from app.modules.spaces.directory import SpaceDirectoryService
from app.modules.spaces.service import OwnershipTransferService, SpaceService
from app.modules.platform.work import render as render_work
from app.schema import migration_check
from app.telemetry import Metrics, emit, method_name, trace_context

BODY_LIMIT = 16384
# Only adding a document carries a whole file: up to 512 KB of text, which JSON escaping can enlarge. A post's 5,000
# characters and 120-character title fit in 64 KiB even when a client escapes every character (up to 12 bytes each),
# and so do a page's 2,000 characters of rules with its name and description.
LARGE_BODIES = (
    ("POST", re.compile(r"/v1/spaces/[0-9a-fA-F-]{36}/documents"), 2_200_000),
    ("POST", re.compile(r"/v1/pages/[^/]+/posts"), 65_536),
    ("PATCH", re.compile(r"/v1/posts/[0-9a-fA-F-]{36}"), 65_536),
    ("PATCH", re.compile(r"/v1/pages/[0-9a-fA-F-]{36}"), 65_536),
)


def body_limit(scope):
    for method, path, limit in LARGE_BODIES:
        if scope.get("method") == method and path.fullmatch(scope.get("path", "")):
            return limit
    return BODY_LIMIT


class BoundedBody:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = body_limit(scope)
        messages = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            total += len(message.get("body", b""))
            if total > limit:
                response = JSONResponse(
                    {"error": {"code": "PAYLOAD_TOO_LARGE", "message": "Request is too large.", "details": {}}, "request_id": str(uuid4())},
                    status_code=413,
                    headers={"Cache-Control": "no-store"},
                )
                return await response(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break

        async def replay():
            if messages:
                return messages.pop(0)
            return await receive()

        return await self.app(scope, replay, send)


class ContainErrors:
    """Answers an unexpected exception with the standard error, so it never leaves the application with its message."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started = False

        async def watched(message):
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, receive, watched)
        except Exception as error:
            # The message can hold private data, so only the type and the code locations are written.
            state = scope.setdefault("state", {})
            state["failure"], state["error_code"] = type(error).__name__, "INTERNAL_ERROR"
            emit(
                "unexpected_error", request_id=state.get("request_id"), trace_id=state.get("trace_id"), failure=state["failure"],
                at=[f"{frame.filename.rsplit('/', 1)[-1]}:{frame.lineno}:{frame.name}" for frame in traceback.extract_tb(error.__traceback__)[-8:]],
            )
            if not started:
                response = JSONResponse(
                    {"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong. Try again.", "details": {}}, "request_id": state.get("request_id")},
                    status_code=500,
                )
                await response(scope, receive, send)


def create_app(settings=None, clock=utcnow):
    settings = settings or Settings()
    engine, sessions = database(settings.database_url)
    keyring = settings.load_keyring()
    security = Security(keyring)
    live_hub = LiveHub(settings.database_url)

    @asynccontextmanager
    async def lifespan(_app):
        yield
        _app.state.agents.close()
        live_hub.close()
        engine.dispose()

    application = FastAPI(
        title="Community Platform local API",
        version="0.1.0",
        description="Local synthetic-data build. Only .test email addresses are accepted. No production or live-delivery approval is implied.",
        lifespan=lifespan,
    )
    application.state.engine = engine
    application.state.sessions = sessions
    application.state.security = security
    application.state.identity = IdentityService(sessions, security, settings, clock)
    application.state.account_deletion = AccountDeletionService(application.state.identity)
    application.state.spaces = SpaceService(application.state.identity)
    application.state.ownership = OwnershipTransferService(application.state.spaces)
    application.state.space_directory = SpaceDirectoryService(application.state.spaces)
    application.state.tasks = TaskService(application.state.spaces)
    application.state.checklists = ChecklistService(application.state.tasks)
    application.state.exports = ExportService(application.state.tasks)
    application.state.reminders = ReminderService(application.state.tasks)
    application.state.reminder_series = ReminderSeriesService(application.state.reminders)
    # Cancelling an account deletion lets repeating reminders that stopped during the grace period go on (DEC-022).
    application.state.account_deletion.on_cancel = application.state.reminder_series.restore_after_hold
    application.state.calendar = CalendarService(application.state.reminders)
    application.state.reminder_requests = ReminderRequestService(application.state.reminders)
    application.state.notifications = NotificationService(application.state.reminders)
    application.state.messaging = MessagingService(application.state.spaces, MessageCipher(keyring))
    application.state.community = CommunityService(application.state.identity)
    application.state.help = HelpService(application.state.identity)
    application.state.page_events = PageEventService(application.state.identity)
    application.state.page_lifecycle = PageLifecycleService(application.state.identity)
    application.state.events = EventService(application.state.spaces)
    application.state.budgets = BudgetService(application.state.events)
    application.state.documents = DocumentService(application.state.spaces)
    application.state.search = PrivateSearchService(application.state.spaces)
    application.state.care = CareService(application.state.identity)
    application.state.alerts = AlertService(application.state.reminders, application.state.events, application.state.care)
    application.state.agents = AgentService(
        application.state.tasks, application.state.reminders, ChatModel.from_settings(settings),
        application.state.events, documents=application.state.documents, search=application.state.search,
        community=application.state.community, web=WebLookup.from_settings(settings), messages=application.state.messaging,
    )
    # @agent in a chat message (DEC-046): the author's own agent request, answered in the chat.
    application.state.mentions = AgentMentionService(application.state.messaging, application.state.agents)
    application.state.live_hub = live_hub
    application.state.live = LiveService(application.state.identity, live_hub)
    application.state.settings = settings
    application.state.metrics = Metrics()
    application.add_middleware(ContainErrors)
    application.add_middleware(BoundedBody)

    @application.middleware("http")
    async def response_policy(request, call_next):
        started = time.perf_counter()
        request.state.request_id = str(uuid4())
        trace_id, parent_span_id = trace_context(request.headers.get("traceparent"))
        request.state.trace_id = trace_id
        status, failure = 500, None
        try:
            response = await call_next(request)
            status = response.status_code
            failure = getattr(request.state, "failure", None)
        except Exception as error:
            failure = type(error).__name__
            raise
        finally:
            elapsed = time.perf_counter() - started
            # The route template, never the concrete path, so identifiers and query strings stay out of telemetry.
            route = getattr(request.scope.get("route"), "path", "unmatched")
            method = method_name(request.method)
            application.state.metrics.observe(method, route, status, elapsed)
            emit(
                "http_request", request_id=request.state.request_id, trace_id=trace_id, span_id=secrets.token_hex(8),
                parent_span_id=parent_span_id, method=method, route=route, status=status,
                duration_ms=round(elapsed * 1000, 1), error_code=getattr(request.state, "error_code", None), failure=failure,
            )
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    def error_response(request, status, code, message, details=None, retry_after=900):
        request.state.error_code = code
        return JSONResponse(
            {"error": {"code": code, "message": message, "details": details or {}}, "request_id": request.state.request_id},
            status_code=status,
            headers={"Retry-After": str(retry_after)} if status == 429 else None,
        )

    @application.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError):
        return error_response(
            request, error.status, error.code, error.message, getattr(error, "details", None), getattr(error, "retry_after", 900),
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        details = {".".join(str(part) for part in item["loc"]): "Invalid value" for item in error.errors()}
        return error_response(request, 422, "VALIDATION_ERROR", "Check the submitted fields.", details)

    @application.exception_handler(SQLAlchemyError)
    async def unavailable(request: Request, _error: SQLAlchemyError):
        return error_response(request, 503, "SERVICE_UNAVAILABLE", "Service is temporarily unavailable.")

    @application.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        code = "NOT_FOUND" if error.status_code == 404 else "REQUEST_REJECTED"
        return error_response(request, error.status_code, code, "Request could not be completed.")

    @application.get("/health/live", include_in_schema=False)
    def live():
        return {"status": "ok"}

    @application.get("/health/ready", include_in_schema=False)
    def ready(request: Request):
        with engine.connect() as connection:
            applied = connection.scalars(text("SELECT version_num FROM alembic_version")).all()
        if not migration_check().satisfied_by(applied):
            # The reason goes to the request log only; the response stays the same as for an unreachable database.
            request.state.failure = "MigrationsPending"
            raise DomainError(503, "SERVICE_UNAVAILABLE", "Service is temporarily unavailable.")
        return {"status": "ready"}

    @application.get("/metrics", include_in_schema=False)
    def metrics(request: Request):
        key = request.app.state.settings.metrics_key
        if not key:
            raise DomainError(404, "NOT_FOUND", "Request could not be completed.")
        if not hmac.compare_digest(request.headers.get("authorization", "").encode(), f"Bearer {key}".encode()):
            raise authentication_required()
        now = clock()
        return PlainTextResponse(
            request.app.state.metrics.render() + render_work(engine, now) + render_agents(engine, now) + render_help(engine),
            media_type="text/plain; version=0.0.4",
        )

    application.include_router(router)
    application.include_router(spaces_router)
    application.include_router(invitation_router)
    application.include_router(space_directory_router)
    application.include_router(space_join_request_router)
    application.include_router(my_space_join_request_router)
    application.include_router(planning_router)
    application.include_router(calendar_router)
    application.include_router(reminder_router)
    application.include_router(reminder_request_router)
    application.include_router(reminder_series_router)
    application.include_router(notification_router)
    application.include_router(messaging_router)
    application.include_router(community_router)
    application.include_router(community_public_router)
    application.include_router(help_router)
    application.include_router(help_public_router)
    application.include_router(page_events_router)
    application.include_router(page_events_public_router)
    application.include_router(safety_router)
    application.include_router(events_router)
    application.include_router(document_router)
    application.include_router(search_router)
    application.include_router(care_router)
    application.include_router(agent_router)
    application.include_router(live_router)
    return application