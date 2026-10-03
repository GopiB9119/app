from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Query, Request
from fastapi.security import HTTPBearer

from app.modules.community.schemas import (
    BlockOutcome,
    BlockView,
    CommentList,
    CommentView,
    CreateBlock,
    CreateComment,
    CreatePage,
    CreatePost,
    CreateReport,
    DeletePage,
    EmptyAction,
    FeedControlInput,
    FeedControlOutcome,
    FeedControlView,
    HandoverView,
    InterestPostList,
    InterestsInput,
    InterestsView,
    InviteModerator,
    ModeratorRoleView,
    ModeratorView,
    OfferHandover,
    PageInsights,
    PageList,
    PageView,
    PostList,
    PostOutcome,
    PostView,
    ReportView,
    Suggestions,
    TermView,
    UpdatePage,
    UpdatePost,
)
from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope

errors = {status: {"model": ErrorEnvelope} for status in (400, 401, 403, 404, 409, 410, 412, 422, 428, 429, 503)}
router = APIRouter(
    prefix="/v1", tags=["Public community"], responses=errors,
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
)
# Public reads work signed out; a valid session adds the viewer's follow, like, save and block state.
public_router = APIRouter(prefix="/v1", tags=["Public community"], responses=errors)
optional_session = {"security": [{}, {"AccountSession": []}]}
PageReference = Annotated[str, Path(min_length=3, max_length=36, pattern=r"^[A-Za-z0-9-]+$")]


def service(request):
    return request.app.state.community


def listed(request, data, pagination):
    return {**envelope(request, data), "pagination": pagination}


@router.post("/pages", response_model=Envelope[PageView], status_code=201)
def create_page(request: Request, body: CreatePage, idempotency_key: UUID = Header()):
    return envelope(request, service(request).create_page(token(request), body, str(idempotency_key)))


@router.get("/me/pages", response_model=Envelope[list[PageView]])
def my_pages(request: Request):
    return envelope(request, service(request).my_pages(token(request)))


@router.patch("/pages/{page_ref}", response_model=Envelope[PageView])
def update_page(request: Request, page_ref: UUID, body: UpdatePage, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).update_page(token(request), str(page_ref), body, if_match))


@router.post("/pages/{page_id}/follow", response_model=Envelope[PageView])
def follow(request: Request, page_id: UUID, body: EmptyAction):
    return envelope(request, service(request).follow(token(request), str(page_id), True))


@router.post("/pages/{page_id}/unfollow", response_model=Envelope[PageView])
def unfollow(request: Request, page_id: UUID, body: EmptyAction):
    return envelope(request, service(request).follow(token(request), str(page_id), False))


@router.get("/me/following", response_model=PageList)
def following(request: Request, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    return listed(request, *service(request).following(token(request), limit, cursor))


@router.get("/me/interests", response_model=Envelope[InterestsView])
def interests(request: Request):
    return envelope(request, service(request).interests(token(request)))


@router.put("/me/interests", response_model=Envelope[InterestsView])
def set_interests(request: Request, body: InterestsInput, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).set_interests(token(request), body, if_match))


@router.get("/me/suggested-pages", response_model=Envelope[Suggestions])
def suggested_pages(request: Request, limit: int = Query(default=20, ge=1, le=20)):
    """Active public pages matching the signed-in person's chosen interests, ranked by the fixed rules named in `ranking`."""
    return envelope(request, service(request).suggested_pages(token(request), limit))


@router.get("/me/interest-posts", response_model=InterestPostList)
def interest_posts(request: Request, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    """Published posts about the signed-in person's chosen topics and interests, newest first, each with what it matched.
    A post without its own topics or interests is about its page's. Empty when the person chose no topic or interest."""
    return listed(request, *service(request).interest_posts(token(request), limit, cursor))


@router.get("/me/feed-controls", response_model=Envelope[list[FeedControlView]])
def feed_controls(request: Request):
    """The pages and topics the signed-in person muted and what they marked Not interested, newest first. Private."""
    return envelope(request, service(request).feed_controls(token(request)))


@router.post("/me/feed-controls", response_model=Envelope[FeedControlView], status_code=201)
def add_feed_control(request: Request, body: FeedControlInput):
    """Muted pages leave Following, Latest, From your interests and suggestions; muted topics and interests take the
    posts and pages about them out of those lists too. Search is not affected. Repeating a control returns it."""
    return envelope(request, service(request).add_feed_control(token(request), body))


@router.post("/me/feed-controls/{control_id}/remove", response_model=Envelope[FeedControlOutcome])
def remove_feed_control(request: Request, control_id: UUID, body: EmptyAction):
    return envelope(request, service(request).remove_feed_control(token(request), str(control_id)))


@router.post("/pages/{page_ref}/posts", response_model=Envelope[PostView], status_code=201)
def create_post(request: Request, page_ref: UUID, body: CreatePost, idempotency_key: UUID = Header()):
    return envelope(request, service(request).create_post(token(request), str(page_ref), body, str(idempotency_key)))


@router.get("/pages/{page_id}/drafts", response_model=Envelope[list[PostView]])
def drafts(request: Request, page_id: UUID):
    return envelope(request, service(request).drafts(token(request), str(page_id)))


@router.patch("/posts/{post_id}", response_model=Envelope[PostView])
def update_post(request: Request, post_id: UUID, body: UpdatePost, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).update_post(token(request), str(post_id), body, if_match))


@router.post("/posts/{post_id}/publish", response_model=Envelope[PostView])
def publish_post(request: Request, post_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).publish_post(token(request), str(post_id), if_match))


@router.post("/posts/{post_id}/delete", response_model=Envelope[PostOutcome])
def delete_post(request: Request, post_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).delete_post(token(request), str(post_id), if_match))


@router.post("/posts/{post_id}/pin", response_model=Envelope[PostView])
def pin_post(request: Request, post_id: UUID, body: EmptyAction):
    return envelope(request, service(request).pin_post(token(request), str(post_id), True))


@router.post("/posts/{post_id}/unpin", response_model=Envelope[PostView])
def unpin_post(request: Request, post_id: UUID, body: EmptyAction):
    return envelope(request, service(request).pin_post(token(request), str(post_id), False))


@router.post("/posts/{post_id}/like", response_model=Envelope[PostView])
def like(request: Request, post_id: UUID, body: EmptyAction):
    return envelope(request, service(request).like(token(request), str(post_id), True))


@router.post("/posts/{post_id}/unlike", response_model=Envelope[PostView])
def unlike(request: Request, post_id: UUID, body: EmptyAction):
    return envelope(request, service(request).like(token(request), str(post_id), False))


@router.post("/posts/{post_id}/save", response_model=Envelope[PostView])
def save(request: Request, post_id: UUID, body: EmptyAction):
    return envelope(request, service(request).save(token(request), str(post_id), True))


@router.post("/posts/{post_id}/unsave", response_model=Envelope[PostView])
def unsave(request: Request, post_id: UUID, body: EmptyAction):
    return envelope(request, service(request).save(token(request), str(post_id), False))


@router.get("/me/saved-posts", response_model=PostList)
def saved_posts(request: Request, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    return listed(request, *service(request).saved_posts(token(request), limit, cursor))


@router.post("/posts/{post_id}/comments", response_model=Envelope[CommentView], status_code=201)
def create_comment(request: Request, post_id: UUID, body: CreateComment, idempotency_key: UUID = Header()):
    return envelope(request, service(request).create_comment(token(request), str(post_id), body, str(idempotency_key)))


@router.post("/comments/{comment_id}/delete", response_model=Envelope[CommentView])
def end_comment(request: Request, comment_id: UUID, body: EmptyAction):
    return envelope(request, service(request).end_comment(token(request), str(comment_id)))


@router.get("/feed", response_model=PostList)
def feed(request: Request, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    return listed(request, *service(request).stream(token(request), limit, cursor, followed_only=True))


@router.post("/reports", response_model=Envelope[ReportView], status_code=201)
def report(request: Request, body: CreateReport):
    return envelope(request, service(request).report(token(request), body))


@router.get("/me/blocks", response_model=Envelope[list[BlockView]])
def blocks(request: Request):
    return envelope(request, service(request).blocks(token(request)))


@router.post("/blocks", response_model=Envelope[BlockView], status_code=201)
def block(request: Request, body: CreateBlock):
    return envelope(request, service(request).block(token(request), body))


@router.post("/blocks/{block_id}/remove", response_model=Envelope[BlockOutcome])
def unblock(request: Request, block_id: UUID, body: EmptyAction):
    return envelope(request, service(request).unblock(token(request), str(block_id)))


@router.post("/pages/{page_id}/moderators", response_model=Envelope[ModeratorView], status_code=201)
def invite_moderator(request: Request, page_id: UUID, body: InviteModerator, idempotency_key: UUID = Header()):
    return envelope(request, service(request).invite_moderator(token(request), str(page_id), body, str(idempotency_key)))


@router.get("/pages/{page_id}/moderators", response_model=Envelope[list[ModeratorView]])
def page_moderators(request: Request, page_id: UUID):
    return envelope(request, service(request).page_moderators(token(request), str(page_id)))


@router.get("/me/moderator-roles", response_model=Envelope[list[ModeratorRoleView]])
def my_moderator_roles(request: Request):
    return envelope(request, service(request).my_moderator_roles(token(request)))


def respond_moderator(request: Request, page_id: UUID, moderator_id: UUID, action: str, if_match: str | None):
    return envelope(request, service(request).resolve_moderator(token(request), str(page_id), str(moderator_id), action, if_match))


@router.post("/pages/{page_id}/moderators/{moderator_id}/accept", response_model=Envelope[ModeratorView])
def accept_moderator(request: Request, page_id: UUID, moderator_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return respond_moderator(request, page_id, moderator_id, "accept", if_match)


@router.post("/pages/{page_id}/moderators/{moderator_id}/decline", response_model=Envelope[ModeratorView])
def decline_moderator(request: Request, page_id: UUID, moderator_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return respond_moderator(request, page_id, moderator_id, "decline", if_match)


@router.post("/pages/{page_id}/moderators/{moderator_id}/withdraw", response_model=Envelope[ModeratorView])
def withdraw_moderator(request: Request, page_id: UUID, moderator_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return respond_moderator(request, page_id, moderator_id, "withdraw", if_match)


@router.post("/pages/{page_id}/moderators/{moderator_id}/remove", response_model=Envelope[ModeratorView])
def remove_moderator(request: Request, page_id: UUID, moderator_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return respond_moderator(request, page_id, moderator_id, "remove", if_match)


@router.post("/pages/{page_id}/moderators/{moderator_id}/step-down", response_model=Envelope[ModeratorView])
def step_down(request: Request, page_id: UUID, moderator_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return respond_moderator(request, page_id, moderator_id, "step-down", if_match)


@router.post("/pages/{page_id}/handover", response_model=Envelope[HandoverView], status_code=201)
def offer_handover(request: Request, page_id: UUID, body: OfferHandover, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).offer_handover(token(request), str(page_id), body, str(idempotency_key), if_match))


@router.get("/pages/{page_id}/handover", response_model=Envelope[HandoverView])
def page_handover(request: Request, page_id: UUID):
    return envelope(request, service(request).page_handover(token(request), str(page_id)))


@router.get("/me/handover-offers", response_model=Envelope[list[HandoverView]])
def my_handover_offers(request: Request):
    return envelope(request, service(request).my_handover_offers(token(request)))


@router.post("/pages/{page_id}/handover/{offer_id}/accept", response_model=Envelope[HandoverView])
def accept_handover(request: Request, page_id: UUID, offer_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).respond_handover(token(request), str(page_id), str(offer_id), "accept", if_match))


@router.post("/pages/{page_id}/handover/{offer_id}/decline", response_model=Envelope[HandoverView])
def decline_handover(request: Request, page_id: UUID, offer_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).respond_handover(token(request), str(page_id), str(offer_id), "decline", if_match))


@router.post("/pages/{page_id}/handover/{offer_id}/cancel", response_model=Envelope[HandoverView])
def cancel_handover(request: Request, page_id: UUID, offer_id: UUID, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).respond_handover(token(request), str(page_id), str(offer_id), "cancel", if_match))


@router.get("/pages/{page_id}/insights", response_model=Envelope[PageInsights])
def page_insights(request: Request, page_id: UUID):
    """Weekly totals for the page's owner: new followers, posts, and others' comments and likes. Never who."""
    return envelope(request, service(request).page_insights(token(request), str(page_id)))


@router.post("/pages/{page_id}/archive", response_model=Envelope[PageView])
def archive_page(request: Request, page_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).archive_page(token(request), str(page_id), if_match))


@router.post("/pages/{page_id}/restore", response_model=Envelope[PageView])
def restore_page(request: Request, page_id: UUID, body: EmptyAction, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).restore_page(token(request), str(page_id), if_match))


@router.post("/pages/{page_id}/delete", response_model=Envelope[PageView])
def delete_page(request: Request, page_id: UUID, body: DeletePage, if_match: str | None = Header(default=None, max_length=200)):
    return envelope(request, service(request).delete_page(token(request), str(page_id), body, if_match))


@public_router.get("/pages/{page_ref}", response_model=Envelope[PageView], openapi_extra=optional_session)
def read_page(request: Request, page_ref: PageReference):
    return envelope(request, service(request).read_page(token(request), page_ref))


@public_router.get("/pages/{page_ref}/posts", response_model=PostList, openapi_extra=optional_session)
def page_posts(request: Request, page_ref: PageReference, limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048)):
    return listed(request, *service(request).page_posts(token(request), page_ref, limit, cursor))


@public_router.get("/pages/{page_ref}/pinned-posts", response_model=Envelope[list[PostView]], openapi_extra=optional_session)
def pinned_posts(request: Request, page_ref: PageReference):
    return envelope(request, service(request).pinned_posts(token(request), page_ref))


@public_router.get("/posts/{post_id}", response_model=Envelope[PostView], openapi_extra=optional_session)
def read_post(request: Request, post_id: UUID):
    return envelope(request, service(request).read_post(token(request), str(post_id)))


@public_router.get("/posts/{post_id}/comments", response_model=CommentList, openapi_extra=optional_session)
def comments(request: Request, post_id: UUID, limit: int = Query(default=50, ge=1, le=100), cursor: str | None = Query(default=None, max_length=2048)):
    return listed(request, *service(request).comments(token(request), str(post_id), limit, cursor))


def term_filter(description):
    return Query(default=None, min_length=1, max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", description=description)


@public_router.get("/discover/pages", response_model=PageList, openapi_extra=optional_session)
def discover_pages(
    request: Request, q: str | None = Query(default=None, max_length=80),
    topic: str | None = term_filter("Any of a page's topics."),
    interest: str | None = term_filter("An interest code."),
    language: str | None = term_filter("A language code."),
    place: str | None = term_filter("A place code; also finds pages of the places inside it."),
    community_type: str | None = term_filter("A community type code."),
    audience: str | None = term_filter("An audience code."),
    activity: str | None = term_filter("An activity code."),
    content_kind: str | None = term_filter("A content kind code."),
    limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048),
):
    filters = {
        "topic": topic, "interest": interest, "language": language, "place": place, "community_type": community_type,
        "audience": audience, "activity": activity, "content_kind": content_kind,
    }
    return listed(request, *service(request).discover_pages(token(request), q, filters, limit, cursor))


@public_router.get("/taxonomy", response_model=Envelope[list[TermView]])
def taxonomy(request: Request):
    """The shared vocabulary: every topic, interest, language, place, community type, audience, activity and content kind."""
    return envelope(request, service(request).taxonomy())


@public_router.get("/discover/posts", response_model=PostList, openapi_extra=optional_session)
def latest_posts(
    request: Request, q: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=20, ge=1, le=50), cursor: str | None = Query(default=None, max_length=2048),
):
    return listed(request, *service(request).stream(token(request), limit, cursor, followed_only=False, query=q))
