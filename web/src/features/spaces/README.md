# spaces

The `/app/spaces` screen provides private family Space creation/listing plus in-app invitations using the existing account shell, TanStack Query, Zod and protected same-origin BFF. It is **Spaces** in the main navigation, and Home links to it. There are no placeholder task or reminder controls.

The signed-in account can copy its own account ID. A Space owner selects invitation management and submits the intended existing account ID. Sent history is paginated and pending invitations can be revoked with confirmation. The recipient has a separate paginated inbox with Space/inviter/role/expiry, explicit join review and decline. Members do not receive owner invitation controls. No email/phone lookup, external message or transferable invite token is used.

Requests carry the expected account ID; BFF session/account checks and Origin protection remain in force. Space responses are validated and cached only in account-keyed memory. No Space data is written to localStorage or IndexedDB.

An uncertain Space/invitation creation response retains its immutable payload and request key for an explicit in-page retry. Invitation management cannot switch recipients or close while that create intent is unresolved. This is not a durable offline queue: leaving/reloading the screen can lose the pending local intent, so the current server list must be checked before a new creation. Accept/decline/revoke address one immutable invitation and reconcile its current state; no automatic background replay is implemented.

## Group Spaces and Find Groups

Built for [T22](../../../../docs/TASKS.md#spaces) under [DEC-011](../../../../docs/DECISIONS.md#accepted-decisions). The create form offers Family, Couple, Group and Solo; a group gets an optional description and an explicit Private or Public choice that says who can find it. Each row shows the type and a Private or Public mark. Owners edit the description in Space settings and switch a group between private and public after a confirmation that states the consequences; making it private closes waiting requests. Owners of groups have a Join requests dialog to approve or decline (with a confirmation) each person, whose note is shown.

`/app/spaces/discover` (Find groups) searches public groups by name or description and shows name, description, member count and the viewer's relation. Asking to join takes an optional 280-character note and keeps its request key for an exact retry after an unconfirmed send. People can withdraw a waiting request and see all their requests with their outcome. The proxy forwards only the nine group routes, and only `q`, `limit` and `cursor` on the search. The client checks that each answer matches what was asked.

Text limits count characters as the server does, so an emoji counts once ([T79](../../../../docs/TASKS.md#defects-that-break-approved-requirements)): Space names and people's names up to 80, descriptions and join notes up to 280. The answer schemas, the counters and the "Use up to N characters." messages use `characters` and `lengthProblem` from `client.ts`; the inputs stop typing at twice the limit in UTF-16 units, so the full limit of emoji fits. Offline screen tests: `tests/unit/spaces-ui.test.mjs` ([T78](../../../../docs/TASKS.md#defects-that-break-approved-requirements)); client tests: `tests/spaces-text-client.test.mjs`.

## Couple Spaces

Built for [T12](../../../../docs/TASKS.md#approved-requirements-not-built-yet) under [DEC-017](../../../../docs/DECISIONS.md#accepted-decisions) (provisional). The create form also offers Couple, with the note "Private couple Space: only you and one partner you invite". A couple row reads the two-person roster and shows "Waiting for your partner" or "With" and the partner's name; the read is keyed by the Space version, so refreshing the list after someone joins or leaves reads it again. The invitation dialog explains that a couple is for two people with one waiting invitation at a time, and the server's `COUPLE_FULL` and `COUPLE_INVITATION_PENDING` messages are shown as they are. Evidence: the `couples:` journey in `tests/e2e/identity.test.mjs` and the Space schema test in `tests/web-client.test.mjs`.

## Members

Each Space has a members action. Its roster shows minimal current account/name/role information; only the current owner sees ordinary-member removal, and only an ordinary member sees self-leave. Confirmation shows the exact Space, member name and account ID. The owner cannot leave or remove themselves in this slice.

Commands keep the reviewed membership ETag, request key, actor and target across explicit retries after unknown results. The review stays locked during uncertainty. Definite conflicts require fresh review; no automatic mutation replay or replacement key is invented. Acknowledged leave clears the account's private query cache and reloads the Space list. Removed viewers lose roster/task access after current authorization checks. Old copies are not deleted. The removal and leave confirmations explain that a former member can return only through a new invitation and that earlier tasks and reminders stay unavailable; the return itself uses the existing invitation form and join review.

Typecheck, the isolated `membership-20260923` production build and all 30 in-process client/proxy checks pass. The actual live two-account member-removal/self-leave journey passes with both successful responses deliberately dropped and reconciled using their original keys/preconditions. It verifies denied old task/invitation access, owner continuity and 320/390/768-pixel review layouts; desktop/mobile captures were inspected. Local-only access was explicitly approved on 2026-09-20 with filtering retained. These results do not authorize external providers or production use.

## Ownership Offers

The member panel now supports current-owner offers to an exact existing member and participant-only offer history. Recipient acceptance/decline and sender withdrawal each require an explicit review. The dialog identifies the Space and both account IDs, explains the role change, unchanged task history and pending-invitation revocation, and shows the expiry. A new offer or acceptance requires recent sign-in; signing out of the offering session invalidates its pending offer.

The client retains the immutable offer key/recipient/membership ETag or the reviewed response ETag across unknown results. Competing actions stay locked, and there is no automatic POST retry. Successful outcomes invalidate account-scoped queries so current membership, not a historical accepted receipt, controls visible actions. The BFF permits only the five authenticated operations with existing origin/account guards. Response validation rejects another audience, wrong offer identity and inconsistent lifecycle facts.

All 34 client/BFF tests, the isolated `ownership-20260923` build/TypeScript gate, and the live two-account browser journey passed. The latter covers deliberately lost successful offer/acceptance responses, exact retries, old-task denial, former-owner leave and 320/390/768-pixel review bounds. The preview is `http://127.0.0.1:3005/app/spaces`. Evidence and native-device limits are in the [ownership checkpoint](../../../../docs/runbooks/FAMILY_MEMBERSHIP.md#ownership-transfer-checkpoint).

Source chapters: 1, 3, 18. See the [local runbook](../../../../docs/runbooks/README.md) and [complete feature catalog](../../../../packages/feature-catalog/features.json). Arbitrary role changes, other Space types and broader collaboration remain later work. Rejoin evidence is in the [rejoin checkpoint](../../../../docs/runbooks/FAMILY_MEMBERSHIP.md#rejoin-checkpoint).
