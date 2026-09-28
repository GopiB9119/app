# Native Family Spaces

The account screen opens family Spaces and the current account's invitation inbox. The client can create a private family Space, copy its own account ID, review/accept/decline an intended-account invitation, and manage owner-created invitations with explicit revocation confirmation. Opening family tasks carries the selected Space ID; an unavailable selection cannot silently fall back to another family.

The existing account repository owns authentication and session isolation. Runtime validation checks private/family scope, roles, recipient/Space identity, expiry ordering and bounded pagination. A page cannot return its requested cursor as its next cursor. Backend services still authorize every operation; a displayed role or invitation is not an authority grant.

Unknown outcomes retain the exact command, payload and creation key for explicit retry. Forms and scope changes are locked during that uncertainty. Accept, decline and revoke retain the selected invitation identity; notices report the canonical outcome rather than claiming every replay is pending. Drafts and retry state survive activity recreation in the ViewModel, not process death or deliberate workspace exit.

Refresh revalidates the open Space before loading unrelated inbox data. A denied Space therefore clears its protected details even when that inbox is unavailable. Account changes and session loss clear protected state. DTO fields use the same release shrinker protection as the other native clients.

The selected Space now provides a bounded private member roster, exact owner-removal review and ordinary-member self-leave. Commands retain their actor, target, membership ETag and request key across unknown outcomes. A stale precondition clears the roster and requires fresh review; a confirmed leave clears the private family view. An owner cannot depart before a separately accepted ownership transfer, and no arbitrary role-change path is added. A former member returns only through the existing invitation review; the removal/leave confirmation says so and that earlier tasks and reminders stay unavailable. The client has no separate rejoin command.

The focused repository/state suite passes 31 JVM tests. App/test builds, lint and release R8 passed. Eleven offline screen tests passed, including membership confirmations and measured 320 dp / 200% dialogs. The fixture applies the real system font setting before activity launch and measures the dialog's actual text scale; a composition-only override was insufficient. The clipboard case still checks its payload with a test double, not OS integration. A separately executed live native membership journey also passed against the approved local services, covering removal, self-leave, denied access and recreation. Evidence and scope are recorded in the [membership runbook](../../../../../../../../../../docs/runbooks/FAMILY_MEMBERSHIP.md) and [BUILD_STATUS.md](../../../../../../../../../../docs/BUILD_STATUS.md#family-membership-checkpoint).

## Ownership Transfer

The existing Space commands now include `OfferOwnership` and `RespondOwnership`, with strict participant, Space, lifecycle and exact-response validation. Offers bind the reviewed member and original key/ETag; responses retain the exact reviewed offer. The member panel exposes owner offers, recipient acceptance/decline and sender withdrawal with an explicit exact-person confirmation and separate expiry/effect facts. Uncertain outcomes lock competing actions until an explicit original retry. Stale reviews require reload; recent-sign-in errors do not silently submit again.

After a confirmed outcome, the ViewModel clears old role-sensitive state and reloads current membership before enabling controls. Historical accepted receipts never directly promote a cached role or grant old task history. The former owner can leave only after the current server roster confirms their ordinary-member role.

The current focused suite passes 41 JVM tests (20 repository and 21 ViewModel), and shared reports confirm 102 across seven suites. Debug app/test APKs compile, lint reports zero errors and 11 existing warnings, and the R8 mapping retains ownership DTO fields/names. Four ownership screen tests and one local-integration journey compile, but this continuation's device gate stopped before install because its disposable emulator lacked the phone service. No device pass is inferred from JVM/build results. The [ownership checkpoint](../../../../../../../../../../docs/runbooks/FAMILY_MEMBERSHIP.md#ownership-transfer-checkpoint) records the exact outstanding gate and approved local-only limits.

Source chapters: 1, 3, 18.

Feature inventory: family, couple, solo, custom, temporary-event, invitations, admission, memberships-roles, join-requests, ownership-transfer, history-policy, privacy, conversion, archive-expiry.

The [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json) retains the broader Space capabilities. No unregistered contact lookup, external invitation, self-service rejoin, other Space type or automatic historical access is added by this client.
