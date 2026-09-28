# spaces

The `/app/spaces` screen provides private family Space creation/listing plus in-app invitations using the existing account shell, TanStack Query, Zod and protected same-origin BFF. It is linked from account settings. There are no placeholder task or reminder controls.

The signed-in account can copy its own account ID. A Space owner selects invitation management and submits the intended existing account ID. Sent history is paginated and pending invitations can be revoked with confirmation. The recipient has a separate paginated inbox with Space/inviter/role/expiry, explicit join review and decline. Members do not receive owner invitation controls. No email/phone lookup, external message or transferable invite token is used.

Requests carry the expected account ID; BFF session/account checks and Origin protection remain in force. Space responses are validated and cached only in account-keyed memory. No Space data is written to localStorage or IndexedDB.

An uncertain Space/invitation creation response retains its immutable payload and request key for an explicit in-page retry. Invitation management cannot switch recipients or close while that create intent is unresolved. This is not a durable offline queue: leaving/reloading the screen can lose the pending local intent, so the current server list must be checked before a new creation. Accept/decline/revoke address one immutable invitation and reconcile its current state; no automatic background replay is implemented.

## Members

Each Space has a members action. Its roster shows minimal current account/name/role information; only the current owner sees ordinary-member removal, and only an ordinary member sees self-leave. Confirmation shows the exact Space, member name and account ID. The owner cannot leave or remove themselves in this slice.

Commands keep the reviewed membership ETag, request key, actor and target across explicit retries after unknown results. The review stays locked during uncertainty. Definite conflicts require fresh review; no automatic mutation replay or replacement key is invented. Acknowledged leave clears the account's private query cache and reloads the Space list. Removed viewers lose roster/task access after current authorization checks. Old copies are not deleted. The removal and leave confirmations explain that a former member can return only through a new invitation and that earlier tasks and reminders stay unavailable; the return itself uses the existing invitation form and join review.

Typecheck, the isolated `membership-20260923` production build and all 30 in-process client/proxy checks pass. The actual live two-account member-removal/self-leave journey passes with both successful responses deliberately dropped and reconciled using their original keys/preconditions. It verifies denied old task/invitation access, owner continuity and 320/390/768-pixel review layouts; desktop/mobile captures were inspected. Local-only access was explicitly approved on 2026-09-20 with filtering retained. These results do not authorize external providers or production use.

## Ownership Offers

The member panel now supports current-owner offers to an exact existing member and participant-only offer history. Recipient acceptance/decline and sender withdrawal each require an explicit review. The dialog identifies the Space and both account IDs, explains the role change, unchanged task history and pending-invitation revocation, and shows the expiry. A new offer or acceptance requires recent sign-in; signing out of the offering session invalidates its pending offer.

The client retains the immutable offer key/recipient/membership ETag or the reviewed response ETag across unknown results. Competing actions stay locked, and there is no automatic POST retry. Successful outcomes invalidate account-scoped queries so current membership, not a historical accepted receipt, controls visible actions. The BFF permits only the five authenticated operations with existing origin/account guards. Response validation rejects another audience, wrong offer identity and inconsistent lifecycle facts.

All 34 client/BFF tests, the isolated `ownership-20260923` build/TypeScript gate, and the live two-account browser journey passed. The latter covers deliberately lost successful offer/acceptance responses, exact retries, old-task denial, former-owner leave and 320/390/768-pixel review bounds. The preview is `http://127.0.0.1:3005/app/spaces`. Evidence and native-device limits are in the [ownership checkpoint](../../../../docs/runbooks/FAMILY_MEMBERSHIP.md#ownership-transfer-checkpoint).

Source chapters: 1, 3, 18. See the [local runbook](../../../../docs/runbooks/README.md) and [complete feature catalog](../../../../packages/feature-catalog/features.json). Arbitrary role changes, other Space types and broader collaboration remain later work. Rejoin evidence is in the [rejoin checkpoint](../../../../docs/runbooks/FAMILY_MEMBERSHIP.md#rejoin-checkpoint).
