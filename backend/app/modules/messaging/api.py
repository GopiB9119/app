from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.messaging.schemas import (
    ConversationPage,
    ConversationView,
    EditMessage,
    MarkRead,
    MessageAction,
    MessagePage,
    MessageView,
    OpenConversation,
    ReactToMessage,
    SendMessage,
)

router = APIRouter(
    prefix="/v1", tags=["Messaging"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 422, 429, 503)},
)


@router.post("/spaces/{space_id}/conversations", response_model=Envelope[ConversationView])
def open_conversation(request: Request, space_id: UUID, body: OpenConversation):
    return envelope(request, request.app.state.messaging.open(token(request), str(space_id), body))


@router.get("/conversations", response_model=ConversationPage)
def list_conversations(
    request: Request, space_id: UUID | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination, unread = request.app.state.messaging.list_conversations(
        token(request), limit, cursor, str(space_id) if space_id else None,
    )
    return {**envelope(request, data), "pagination": pagination, "unread_count": unread}


@router.get("/conversations/{conversation_id}", response_model=Envelope[ConversationView])
def read_conversation(request: Request, conversation_id: UUID):
    return envelope(request, request.app.state.messaging.read(token(request), str(conversation_id)))


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
def list_messages(
    request: Request, conversation_id: UUID, limit: int = Query(default=30, ge=1, le=50),
    before: int | None = Query(default=None, ge=1, le=1_000_000_000),
    after: int | None = Query(default=None, ge=0, le=1_000_000_000),
):
    data, pagination = request.app.state.messaging.messages(token(request), str(conversation_id), limit, before, after)
    return {**envelope(request, data), "pagination": pagination}


@router.post("/conversations/{conversation_id}/messages", response_model=Envelope[MessageView], status_code=201)
def send_message(request: Request, conversation_id: UUID, body: SendMessage, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.messaging.send(token(request), str(conversation_id), body, str(idempotency_key)))


@router.post("/conversations/{conversation_id}/messages/{message_id}/delete", response_model=Envelope[MessageView])
def delete_message(request: Request, conversation_id: UUID, message_id: UUID, body: MessageAction):
    return envelope(request, request.app.state.messaging.delete(token(request), str(conversation_id), str(message_id)))


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/edit", response_model=Envelope[MessageView],
    description="The author changes the text of their message, for 15 minutes after sending and at most 10 times. "
                "The same text again changes nothing. The earlier text is not kept.",
)
def edit_message(request: Request, conversation_id: UUID, message_id: UUID, body: EditMessage):
    return envelope(request, request.app.state.messaging.edit(token(request), str(conversation_id), str(message_id), body))


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/reactions", response_model=Envelope[MessageView],
    description="Adds (`on: true`) or takes back (`on: false`) one of the caller's own reactions. Doing what is already "
                "done changes nothing, so a retry is safe.",
)
def react_to_message(request: Request, conversation_id: UUID, message_id: UUID, body: ReactToMessage):
    return envelope(request, request.app.state.messaging.react(token(request), str(conversation_id), str(message_id), body))


@router.post("/conversations/{conversation_id}/read", response_model=Envelope[ConversationView])
def mark_read(request: Request, conversation_id: UUID, body: MarkRead):
    return envelope(request, request.app.state.messaging.mark_read(token(request), str(conversation_id), body))
