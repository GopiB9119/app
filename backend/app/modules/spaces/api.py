from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.security import HTTPBearer

from app.modules.identity.api import envelope, token
from app.modules.identity.schemas import Envelope, ErrorEnvelope
from app.modules.spaces.schemas import (
    ChangeAgentPolicy,
    ChangeInvitePolicy,
    ChangeMemberRole,
    ChangeSpaceVisibility,
    CreateJoinRequest,
    CreateOwnershipTransfer,
    JoinRequestAction,
    JoinRequestReview,
    JoinRequestView,
    OwnershipTransferAction,
    OwnershipTransferPage,
    OwnershipTransferView,
    CreateInvitation,
    CreateSpace,
    InvitationAction,
    InvitationOutcome,
    InvitationPage,
    InvitationView,
    MembershipAction,
    MembershipOutcome,
    SpaceDirectoryEntry,
    SpaceDirectoryPage,
    SpaceMemberView,
    EditSpaceSettings,
    SpaceSettingsView,
    SpacePage,
    SpaceView,
)

router = APIRouter(
    prefix="/v1/spaces",
    tags=["Spaces"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={
        status: {"model": ErrorEnvelope}
        for status in (400, 401, 404, 409, 410, 422, 503)
    },
)


@router.post("", response_model=Envelope[SpaceView], status_code=201)
def create_space(
    request: Request, response: Response, body: CreateSpace, idempotency_key: UUID = Header()
):
    space = request.app.state.spaces.create(token(request), body, str(idempotency_key))
    response.headers["Location"] = f"/v1/spaces/{space.id}"
    return envelope(request, space)


@router.get("", response_model=SpacePage)
def list_spaces(
    request: Request,
    limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=2048),
):
    spaces, pagination = request.app.state.spaces.list_spaces(token(request), limit, cursor)
    return {**envelope(request, spaces), "pagination": pagination}


@router.get("/{space_id}", response_model=Envelope[SpaceView])
def read_space(request: Request, space_id: UUID):
    return envelope(request, request.app.state.spaces.read(token(request), str(space_id)))


@router.get("/{space_id}/settings", response_model=Envelope[SpaceSettingsView])
def read_space_settings(request: Request, space_id: UUID):
    return envelope(request, request.app.state.spaces.read_settings(token(request), str(space_id)))


@router.patch("/{space_id}/settings", response_model=Envelope[SpaceSettingsView],
              responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def edit_space_settings(request: Request, space_id: UUID, body: EditSpaceSettings,
                        idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.spaces.edit_settings(
        token(request), str(space_id), body, str(idempotency_key), if_match,
    ))


@router.post("/{space_id}/ownership-transfers", response_model=Envelope[OwnershipTransferView], status_code=201,
             responses={403: {"model": ErrorEnvelope}, 412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def offer_ownership(request: Request, space_id: UUID, body: CreateOwnershipTransfer, idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.ownership.create(token(request), str(space_id), body, str(idempotency_key), if_match))


@router.get("/{space_id}/ownership-transfers", response_model=OwnershipTransferPage)
def list_ownership_transfers(request: Request, space_id: UUID, limit: int = Query(default=20, ge=1, le=20), cursor: str | None = Query(default=None, max_length=2048)):
    data, pagination = request.app.state.ownership.list_transfers(token(request), str(space_id), limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@router.post("/{space_id}/ownership-transfers/{transfer_id}/accept", response_model=Envelope[OwnershipTransferView],
             responses={403: {"model": ErrorEnvelope}, 412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def accept_ownership(request: Request, space_id: UUID, transfer_id: UUID, body: OwnershipTransferAction, if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.ownership.respond(token(request), str(space_id), str(transfer_id), "accept", if_match))


@router.post("/{space_id}/ownership-transfers/{transfer_id}/decline", response_model=Envelope[OwnershipTransferView],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def decline_ownership(request: Request, space_id: UUID, transfer_id: UUID, body: OwnershipTransferAction, if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.ownership.respond(token(request), str(space_id), str(transfer_id), "decline", if_match))


@router.post("/{space_id}/ownership-transfers/{transfer_id}/cancel", response_model=Envelope[OwnershipTransferView],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def cancel_ownership(request: Request, space_id: UUID, transfer_id: UUID, body: OwnershipTransferAction, if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.ownership.respond(token(request), str(space_id), str(transfer_id), "cancel", if_match))


@router.get("/{space_id}/members", response_model=Envelope[list[SpaceMemberView]])
def list_members(request: Request, space_id: UUID):
    return envelope(request, request.app.state.spaces.list_members(token(request), str(space_id)))


@router.post("/{space_id}/members/{account_id}/remove", response_model=Envelope[MembershipOutcome],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def remove_member(request: Request, space_id: UUID, account_id: UUID, body: MembershipAction,
                  idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.spaces.end_membership(
        token(request), str(space_id), str(account_id), "remove", str(idempotency_key), if_match,
    ))


@router.post("/{space_id}/members/{account_id}/role", response_model=Envelope[SpaceMemberView],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def change_member_role(request: Request, space_id: UUID, account_id: UUID, body: ChangeMemberRole,
                       idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.spaces.change_role(
        token(request), str(space_id), str(account_id), body.role, str(idempotency_key), if_match,
    ))


@router.post("/{space_id}/leave", response_model=Envelope[MembershipOutcome],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def leave_space(request: Request, space_id: UUID, body: MembershipAction,
                idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.spaces.end_membership(
        token(request), str(space_id), None, "leave", str(idempotency_key), if_match,
    ))


@router.post("/{space_id}/invitations", response_model=Envelope[InvitationView], status_code=201)
def invite_account(
    request: Request, space_id: UUID, body: CreateInvitation, idempotency_key: UUID = Header()
):
    return envelope(request, request.app.state.spaces.invite(
        token(request), str(space_id), body, str(idempotency_key)
    ))


@router.get("/{space_id}/invitations", response_model=InvitationPage)
def sent_invitations(
    request: Request, space_id: UUID, limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination = request.app.state.spaces.list_invitations(
        token(request), limit, cursor, str(space_id)
    )
    return {**envelope(request, data), "pagination": pagination}


@router.post("/{space_id}/invitations/{invitation_id}/revoke", response_model=Envelope[InvitationOutcome])
def revoke_invitation(request: Request, space_id: UUID, invitation_id: UUID, body: InvitationAction):
    return envelope(request, request.app.state.spaces.respond_to_invitation(
        token(request), str(invitation_id), "revoke", str(space_id)
    ))


@router.post("/{space_id}/visibility", response_model=Envelope[SpaceSettingsView],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def change_visibility(request: Request, space_id: UUID, body: ChangeSpaceVisibility,
                      idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.space_directory.change_visibility(
        token(request), str(space_id), body, str(idempotency_key), if_match,
    ))


@router.post("/{space_id}/invite-policy", response_model=Envelope[SpaceSettingsView],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def change_invite_policy(request: Request, space_id: UUID, body: ChangeInvitePolicy,
                         idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.spaces.change_invite_policy(
        token(request), str(space_id), body, str(idempotency_key), if_match,
    ))


@router.post("/{space_id}/agent-policy", response_model=Envelope[SpaceSettingsView],
             responses={412: {"model": ErrorEnvelope}, 428: {"model": ErrorEnvelope}})
def change_agent_policy(request: Request, space_id: UUID, body: ChangeAgentPolicy,
                        idempotency_key: UUID = Header(), if_match: str | None = Header(default=None, max_length=140)):
    return envelope(request, request.app.state.spaces.change_agent_policy(
        token(request), str(space_id), body, str(idempotency_key), if_match,
    ))


@router.get("/{space_id}/join-requests", response_model=Envelope[list[JoinRequestReview]])
def pending_join_requests(request: Request, space_id: UUID):
    return envelope(request, request.app.state.space_directory.pending(token(request), str(space_id)))


@router.post("/{space_id}/join-requests", response_model=Envelope[JoinRequestView], status_code=201)
def request_to_join(request: Request, space_id: UUID, body: CreateJoinRequest, idempotency_key: UUID = Header()):
    return envelope(request, request.app.state.space_directory.request_to_join(
        token(request), str(space_id), body, str(idempotency_key),
    ))


@router.post("/{space_id}/join-requests/{request_id}/approve", response_model=Envelope[JoinRequestView])
def approve_join_request(request: Request, space_id: UUID, request_id: UUID, body: JoinRequestAction):
    return envelope(request, request.app.state.space_directory.decide(token(request), str(space_id), str(request_id), "approve"))


@router.post("/{space_id}/join-requests/{request_id}/decline", response_model=Envelope[JoinRequestView])
def decline_join_request(request: Request, space_id: UUID, request_id: UUID, body: JoinRequestAction):
    return envelope(request, request.app.state.space_directory.decide(token(request), str(space_id), str(request_id), "decline"))


def signed_in_router(prefix, tag):
    return APIRouter(
        prefix=prefix, tags=[tag],
        dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
        responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 410, 422, 503)},
    )


directory_router = signed_in_router("/v1/discover/spaces", "Space directory")


@directory_router.get("", response_model=SpaceDirectoryPage)
def find_groups(
    request: Request, q: str = Query(default="", max_length=80), limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination = request.app.state.space_directory.directory(token(request), q, limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@directory_router.get("/{space_id}", response_model=Envelope[SpaceDirectoryEntry])
def preview_group(request: Request, space_id: UUID):
    return envelope(request, request.app.state.space_directory.preview(token(request), str(space_id)))


join_request_router = signed_in_router("/v1/space-join-requests", "Space join requests")


@join_request_router.post("/{request_id}/cancel", response_model=Envelope[JoinRequestView])
def cancel_join_request(request: Request, request_id: UUID, body: JoinRequestAction):
    return envelope(request, request.app.state.space_directory.cancel(token(request), str(request_id)))


my_join_request_router = signed_in_router("/v1/me/space-join-requests", "Space join requests")


@my_join_request_router.get("", response_model=Envelope[list[JoinRequestView]])
def my_join_requests(request: Request):
    return envelope(request, request.app.state.space_directory.my_requests(token(request)))


invitation_router = APIRouter(
    prefix="/v1/invitations", tags=["Invitations"],
    dependencies=[Depends(HTTPBearer(auto_error=False, scheme_name="AccountSession"))],
    responses={status: {"model": ErrorEnvelope} for status in (400, 401, 404, 409, 410, 422, 503)},
)


@invitation_router.get("", response_model=InvitationPage)
def received_invitations(
    request: Request, limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=2048),
):
    data, pagination = request.app.state.spaces.list_invitations(token(request), limit, cursor)
    return {**envelope(request, data), "pagination": pagination}


@invitation_router.post("/{invitation_id}/accept", response_model=Envelope[SpaceView])
def accept_invitation(request: Request, invitation_id: UUID, body: InvitationAction):
    return envelope(request, request.app.state.spaces.respond_to_invitation(
        token(request), str(invitation_id), "accept"
    ))


@invitation_router.post("/{invitation_id}/decline", response_model=Envelope[InvitationOutcome])
def decline_invitation(request: Request, invitation_id: UUID, body: InvitationAction):
    return envelope(request, request.app.state.spaces.respond_to_invitation(
        token(request), str(invitation_id), "decline"
    ))