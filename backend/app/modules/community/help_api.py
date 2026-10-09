from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import HTTPBearer

from app.modules.community.api import PageReference, errors, listed, optional_session
from app.modules.community.schemas import (
    CreateHelpPost,
    CreateHelpReply,
    EmptyAction,
    HelpPostList,
    HelpPostOutcome,
    HelpPostView,
    HelpReplyView,
    HelpReportNote,
    HelpReportView,
    KeepHelpPost,
    ReportHelpPost,
    ResolveHelpPost,
)
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope

router = APIRouter(
    prefix="/v1", tags=["Help requests and offers"], responses=errors,
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
)
public_router = APIRouter(prefix="/v1", tags=["Help requests and offers"], responses=errors)


def service(request):
    return request.app.state.help


@router.post("/pages/{page_ref}/help-posts", response_model=Envelope[HelpPostView], status_code=201)
def create_help_post(request: Request, page_ref: UUID, body: CreateHelpPost, idempotency_key: UUID = Header()):
    return envelope(request, service(request).create(token(request), str(page_ref), body, str(idempotency_key)))


@public_router.get("/pages/{page_ref}/help-posts", response_model=HelpPostList, openapi_extra=optional_session)
def page_help_posts(
    request: Request, page_ref: PageReference, state: Literal["open", "all"] = "open", kind: Literal["request", "offer"] | None = None,
    limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048),
):
    return listed(request, *service(request).page_posts(token(request), page_ref, state, kind, limit, cursor))


@public_router.get("/help-posts/{help_post_id}", response_model=Envelope[HelpPostView], openapi_extra=optional_session)
def read_help_post(request: Request, help_post_id: UUID):
    return envelope(request, service(request).read(token(request), str(help_post_id)))


@router.get("/me/help-posts", response_model=HelpPostList)
def my_help_posts(request: Request, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    return listed(request, *service(request).mine(token(request), limit, cursor))


@router.get("/me/help-review", response_model=Envelope[list[HelpPostView]])
def help_review_queue(request: Request):
    """Up to 50 posts on pages the person owns or moderates that wait for approval or have open reports."""
    return envelope(request, service(request).review_queue(token(request)))


@router.post("/help-posts/{help_post_id}/resolve", response_model=Envelope[HelpPostView])
def resolve_help_post(request: Request, help_post_id: UUID, body: ResolveHelpPost, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).resolve(token(request), str(help_post_id), body, if_match))


@router.post("/help-posts/{help_post_id}/delete", response_model=Envelope[HelpPostOutcome])
def delete_help_post(request: Request, help_post_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).end_post(token(request), str(help_post_id), if_match, removing=False))


@router.post("/help-posts/{help_post_id}/remove", response_model=Envelope[HelpPostView])
def remove_help_post(request: Request, help_post_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).end_post(token(request), str(help_post_id), if_match, removing=True))


@router.post("/help-posts/{help_post_id}/replies", response_model=Envelope[HelpReplyView], status_code=201)
def reply_to_help_post(request: Request, help_post_id: UUID, body: CreateHelpReply, idempotency_key: UUID = Header()):
    return envelope(request, service(request).reply(token(request), str(help_post_id), body, str(idempotency_key)))


@router.get("/help-posts/{help_post_id}/replies", response_model=Envelope[list[HelpReplyView]])
def help_post_replies(request: Request, help_post_id: UUID):
    return envelope(request, service(request).replies(token(request), str(help_post_id)))


@router.post("/help-replies/{reply_id}/end", response_model=Envelope[HelpReplyView])
def end_help_reply(request: Request, reply_id: UUID, body: EmptyAction):
    return envelope(request, service(request).end_reply(token(request), str(reply_id)))


@router.post("/help-posts/{help_post_id}/report", response_model=Envelope[HelpReportView], status_code=201)
def report_help_post(request: Request, help_post_id: UUID, body: ReportHelpPost):
    """Goes to the page's owner and moderators. Reporting again while the first report waits returns that report."""
    return envelope(request, service(request).report(token(request), str(help_post_id), body))


@router.get("/help-posts/{help_post_id}/reports", response_model=Envelope[list[HelpReportNote]])
def help_post_reports(request: Request, help_post_id: UUID):
    """The open reports for the page's owner and moderators, without who sent them."""
    return envelope(request, service(request).report_notes(token(request), str(help_post_id)))


@router.post("/help-posts/{help_post_id}/approve", response_model=Envelope[HelpPostView])
def approve_help_post(request: Request, help_post_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    """A page manager lets a post that waited for review appear to everyone."""
    return envelope(request, service(request).approve(token(request), str(help_post_id), if_match))


@router.post("/help-posts/{help_post_id}/keep", response_model=Envelope[HelpPostView])
def keep_help_post(request: Request, help_post_id: UUID, body: KeepHelpPost, if_match: str | None = Header(default=None, max_length=200)):
    """A page manager closes the open reports and keeps the post."""
    return envelope(request, service(request).keep(token(request), str(help_post_id), body, if_match))
