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
    data, pagination, unread, marker = request.app.state.messaging.list_conversations(
        token(request), limit, cursor, str(space_id) if space_id else None,
    )
    return {**envelope(request, data), "pagination": pagination, "unread_count": unread, "unread_marker": marker}


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


@router.post(
    "/conversations/{conversation_id}/messages", response_model=Envelope[MessageView], status_code=201,
    description="Sends a message. A message that mentions `@agent` is also the sender's own agent request in the "
                "conversation's Space (DEC-046): the agent answers before this returns, and `agent_request` says what "
                "became of it. The message stays sent whatever the agent does.",
)
def send_message(request: Request, conversation_id: UUID, body: SendMessage, idempotency_key: UUID = Header()):
    caller = token(request)
    view = request.app.state.messaging.send(caller, str(conversation_id), body, str(idempotency_key))
    if view.agent_request is not None and view.agent_request.status == "pending":
        view = request.app.state.mentions.after_send(caller, str(conversation_id), view)
    return envelope(request, view)


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/agent", response_model=Envelope[MessageView],
    description="The author of a message that mentions `@agent` asks the agent again when no answer came "
                "(`agent_request.status` `pending` or `failed`). Once the agent has replied, or the request stopped for "
                "good, asking again changes nothing.",
)
def ask_agent_again(request: Request, conversation_id: UUID, message_id: UUID, body: MessageAction):
    return envelope(request, request.app.state.mentions.answer(token(request), str(conversation_id), str(message_id)))


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/agent/share", response_model=Envelope[MessageView],
    description="The author of a message that mentions `@agent` shows the agent's private answer to everyone in the chat "
                "(DEC-061): the agent's reply becomes the answer and `agent_request.status` becomes `answered`. Refused "
                "with `AGENT_ANSWER_NOT_SHARED` when someone who reads the chat may not see everything the answer names, "
                "`AGENT_ANSWER_PERSONAL` for answers about the author alone, and `AGENT_ANSWER_NOT_READY` before the "
                "answer is finished. Sharing again changes nothing.",
)
def share_agent_answer(request: Request, conversation_id: UUID, message_id: UUID, body: MessageAction):
    return envelope(request, request.app.state.mentions.share(token(request), str(conversation_id), str(message_id)))


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
