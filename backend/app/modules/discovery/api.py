from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.security import HTTPBearer

from app.modules.discovery.schemas import DEFAULT_LIMIT, MAX_LIMIT, SearchResults
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope

router = APIRouter(
    prefix="/v1", tags=["Search"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 422, 429, 503)},
)


@router.get("/search", response_model=Envelope[SearchResults])
def search_my_spaces(
    request: Request, q: str = Query(min_length=1, max_length=200), space_id: UUID | None = Query(default=None),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
):
    """Documents, tasks and events the signed-in person can open now, in all of their Spaces or one of them."""
    results = request.app.state.search.search(token(request), q, str(space_id) if space_id else None, limit)
    return envelope(request, results)
