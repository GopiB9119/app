from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.files.schemas import AddDocument, DocumentAction, DocumentDetail, DocumentList, DocumentOutcome, DocumentView
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope

router = APIRouter(
    prefix="/v1", tags=["Documents"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 413, 422, 429, 503)},
)


def service(request):
    return request.app.state.documents


@router.post("/spaces/{space_id}/documents", response_model=Envelope[DocumentView], status_code=201)
def add_document(request: Request, space_id: UUID, body: AddDocument, idempotency_key: UUID = Header()):
    return envelope(request, service(request).add(token(request), str(space_id), body, str(idempotency_key)))


@router.get("/spaces/{space_id}/documents", response_model=DocumentList)
def list_documents(
    request: Request, space_id: UUID, limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination = service(request).list_documents(token(request), str(space_id), limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@router.get("/documents/{document_id}", response_model=Envelope[DocumentDetail])
def read_document(request: Request, document_id: UUID):
    return envelope(request, service(request).read(token(request), str(document_id)))


@router.post("/documents/{document_id}/delete", response_model=Envelope[DocumentOutcome])
def delete_document(request: Request, document_id: UUID, body: DocumentAction):
    return envelope(request, service(request).delete(token(request), str(document_id)))
