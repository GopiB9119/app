from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.config import Settings
from app.db import database
from app.errors import DomainError
from app.modules.identity.api import router
from app.modules.identity.exports import ExportService
from app.modules.identity.security import Security
from app.modules.identity.service import IdentityService, utcnow
from app.modules.notifications.api import router as notification_router
from app.modules.notifications.service import NotificationService
from app.modules.planning.api import router as planning_router
from app.modules.planning.calendar import CalendarService, router as calendar_router
from app.modules.planning.service import TaskService
from app.modules.scheduling.api import request_router as reminder_request_router
from app.modules.scheduling.api import router as reminder_router
from app.modules.scheduling.requests import ReminderRequestService
from app.modules.scheduling.service import ReminderService
from app.modules.spaces.api import invitation_router
from app.modules.spaces.api import router as spaces_router
from app.modules.spaces.service import OwnershipTransferService, SpaceService


class BoundedBody:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        messages = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            total += len(message.get("body", b""))
            if total > 16384:
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


def create_app(settings=None, clock=utcnow):
    settings = settings or Settings()
    engine, sessions = database(settings.database_url)
    security = Security(settings.load_key())

    @asynccontextmanager
    async def lifespan(_app):
        yield
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
    application.state.spaces = SpaceService(application.state.identity)
    application.state.ownership = OwnershipTransferService(application.state.spaces)
    application.state.tasks = TaskService(application.state.spaces)
    application.state.exports = ExportService(application.state.tasks)
    application.state.reminders = ReminderService(application.state.tasks)
    application.state.calendar = CalendarService(application.state.reminders)
    application.state.reminder_requests = ReminderRequestService(application.state.reminders)
    application.state.notifications = NotificationService(application.state.reminders)
    application.state.settings = settings
    application.add_middleware(BoundedBody)

    @application.middleware("http")
    async def response_policy(request, call_next):
        request.state.request_id = str(uuid4())
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    def error_response(request, status, code, message, details=None):
        return JSONResponse(
            {"error": {"code": code, "message": message, "details": details or {}}, "request_id": request.state.request_id},
            status_code=status,
            headers={"Retry-After": "900"} if status == 429 else None,
        )

    @application.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError):
        return error_response(request, error.status, error.code, error.message)

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
    def ready():
        with engine.connect() as connection:
            connection.execute(text("SELECT 1 FROM users LIMIT 1"))
        return {"status": "ready"}

    application.include_router(router)
    application.include_router(spaces_router)
    application.include_router(invitation_router)
    application.include_router(planning_router)
    application.include_router(calendar_router)
    application.include_router(reminder_router)
    application.include_router(reminder_request_router)
    application.include_router(notification_router)
    return application