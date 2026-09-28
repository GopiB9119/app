# spaces

Local synthetic implementation: `POST /v1/spaces`, `GET /v1/spaces` and `GET /v1/spaces/{space_id}`. Only private family Spaces can be created. Authentication reuses the identity service's current active session; creation holds its account lock through the mutation transaction.

Creation persists the Space, one owner membership, matching audit/outbox records and immutable actor/request/payload binding together. A same-key retry returns the current-authorized result; changed payload conflicts and lost access blocks receipt disclosure. The database also rejects duplicate active owners. Ordinary member removal, self-leave and a separate two-party ownership transfer are implemented below.

Lists use bounded ID keyset pagination, an encrypted account-bound 15-minute cursor and current active membership checks. Pagination is not a frozen snapshot of concurrent additions. The synthetic build permits at most 50 created Spaces and 50 active Space memberships per account. Invitation admission checks that same membership bound, so the current web Space list cannot silently exceed its 50-item limit. These are local safety bounds, not approved production quotas.

## Account-Bound Invitations

| Operation | Current behavior |
| --- | --- |
| `POST /v1/spaces/{space_id}/invitations` | Current owner supplies only `recipient_account_id` with a UUID idempotency key. Target must be an existing active verified account; role is always member. |
| `GET /v1/spaces/{space_id}/invitations` | Current owner sees bounded sent history, including projected expiry. |
| `POST /v1/spaces/{space_id}/invitations/{invitation_id}/revoke` | Current owner revokes a pending invitation; accepted membership is not removed by this action. |
| `GET /v1/invitations` | Intended account sees only currently actionable invitations, with minimal Space/inviter/role information. |
| `POST /v1/invitations/{invitation_id}/accept` | Intended account explicitly accepts; current inviter authority, Space/account/session state, expiry and capacity are rechecked. |
| `POST /v1/invitations/{invitation_id}/decline` | Intended account declines without joining. GET requests never consume an invitation. |

Invitation IDs are opaque references, not bearer tokens. This authenticated in-app path does not produce transferable links, perform email/phone lookup or send mail. It does not support new-account or unbound-contact admission. Verified account access does not certify a legal identity, relationship or caregiver authority.

Mutations lock affected accounts in deterministic order, then the Space and invitation, and revalidate the caller after potential lock waits. Acceptance atomically records member admission, one-use invitation state, Space revision and audit/outbox. Decline/revoke are idempotent terminal actions; a losing concurrent action cannot partially admit someone. Previously accepted invitations cannot reactivate a removed membership or authorize a different admission epoch. An active membership is never overwritten or promoted; a former member can return only through the [rejoin path](#rejoin).

Local bounds are 72-hour invitations, 50 active family members including the owner and 200 retained invitation records per Space. Pending invitations do not reserve places; capacity is serialized at acceptance. Only one pending invitation per Space/recipient is permitted. Expiry is enforced at reads/actions even without cleanup; a new request can replace an expired invitation but never revive its old acceptance path. Creation replays retain their original record and do not extend expiry.

Migration `0003` adds invitation records and backfills unique admission IDs and audit targets without removing existing accounts, Spaces or memberships. The backend suite covers concurrent retries, acceptance/revoke/decline races, the final available place, clock expiry after locks, full required-audit rollback, current authority, strict inputs, scoped cursors and migration backfill. See the [local runbook](../../../../docs/runbooks/README.md) for commands and browser evidence limits.

## Member Removal And Leave

`GET /v1/spaces/{space_id}/members` returns at most 50 current members: account ID, display name, owner/member role, joined time and an opaque membership ETag. Current viewer membership and active Space are checked in the same SQL query that projects names. A former member cannot retrieve the roster through an old ID; no email, admission ID or request receipt is disclosed.

`POST /v1/spaces/{space_id}/members/{account_id}/remove` is current-owner-only and cannot remove the owner. `POST /v1/spaces/{space_id}/leave` derives its target from the authenticated account and refuses owner departure. Both accept only an empty body, require a UUID idempotency key and the reviewed `If-Match`, and lock sorted accounts, the Space and membership before rechecking session authority. Missing review returns 428; a changed admission/role/status review returns 412.

Migration `0008` adds durable membership-command receipts. Membership status, Space revision, actual-actor audit/outbox and receipt commit atomically. The storage status is `removed` for either action; `space.member_removed` and `space.member_left` preserve who initiated it. Exact retries of a committed leave return only the minimal outcome, even though private Space access is gone. Keys and receipts are bound to both actor and target admission epochs and cannot end a replacement admission. A receipt-storage failure rolls back the revocation and events together.

Current grants gate subsequent task, reminder/request and inbox access and future dispatch. Removal does not delete authored content or recall already-delivered copies. An existing task's former assignee becomes unavailable without silently reassigning it. Earlier accepted invitations cannot reactivate membership. Bans and arbitrary role changes are not implemented. The service permits a reviewed member's departure from an archived Space, but this does not add archive management UI.

The final combined backend suite passed 208 tests, including task/reminder withdrawal, both removal-versus-dispatch transaction orderings, exact/stale retries, owner protection, leave/removal concurrency, required-receipt rollback and migration parity/preservation. The [membership runbook](../../../../docs/runbooks/FAMILY_MEMBERSHIP.md) records the retained results and scope. These are finite local results, not production-policy approval.

## Two-Party Ownership

`OwnershipTransferService` shares the existing [service module](service.py) and account/Space locking helpers. Migration `0009` adds exact session- and admission-bound offers. A recently signed-in owner offers to a reviewed active ordinary member; only that recipient can accept after recent sign-in. Offers expire within 15 minutes. Acceptance rechecks both memberships, roles, source revision and the original offering session, then swaps roles, advances the Space revision and revokes the former owner's pending invitations in one audited transaction. Admissions and historical task grants stay unchanged.

One pending offer and 100 retained records per Space are local bounds. Creation requires `Idempotency-Key` and the recipient's membership `If-Match`; accept/decline/cancel require the original reviewed offer `If-Match` and an empty body. Lists and 15-minute cursors bind the current participant's account, Space and admission. Terminal same-action retries reconcile one committed outcome without replaying its effect. The five authenticated routes, error handling, recent-sign-in recovery and verified checkpoints are in the [ownership runbook section](../../../../docs/runbooks/FAMILY_MEMBERSHIP.md#ownership-transfer-checkpoint).

## Rejoin

A current owner may send a new invitation to an account whose membership ended through removal or self-leave. Nothing changes until that account explicitly accepts; declined, revoked or expired invitations leave the membership removed. Acceptance reuses the retained membership row but issues a new admission ID, member role and join time in the same audited transaction as the invitation outcome and Space revision. Task grants, reminders, reminder requests, inbox entries, ownership offers and departure receipts bound to the earlier admission stay unavailable, and the old accepted invitation still cannot restore access.

There is no ban list, self-service rejoin or history-sharing option. The row keeps only the current join time; earlier periods remain identifiable through their invitation, departure receipt and audit records, not a separate admission-history table. No migration or API shape change was needed. This follows the recommendation of the still-open Chapter 3 decision C3-D06 and is a local implementation choice. Evidence is in the [rejoin checkpoint](../../../../docs/runbooks/FAMILY_MEMBERSHIP.md#rejoin-checkpoint).

Source chapters: 1, 3, 18.

Still pending: unregistered-recipient/external invitations, bans and broader member management, other Space types, join requests, full resource history enforcement, conversion and archive/expiry workflows. Tasks and reminders are owned by their implemented planning/scheduling domains. Admission grants no existing chat/file history; those domains are not implemented here. Internal status columns do not by themselves implement broader lifecycle endpoints.

The [complete feature catalog](../../../../packages/feature-catalog/features.json) retains the full domain scope.
