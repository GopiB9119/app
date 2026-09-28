# Family Member Controls

This synthetic local slice adds a private family roster, owner removal of an ordinary member, and ordinary-member self-leave on web and Android. The separate ownership-transfer and rejoin continuations are recorded below. Arbitrary role changes, member suspension, bans, account deletion and production policy approval remain outside these slices. The original Chapter 3 and Chapter 18 decisions remain unchanged.

## Use The Controls

On `/app/spaces`, open a family's **Members** action. On Android, open **Family Spaces**, select the family and choose **View members**. The roster contains account IDs, display names, owner/member roles and joined times. It does not expose email addresses, admission IDs, private tasks or reminder state.

Only the current owner can remove another ordinary member. An ordinary member can leave only their own membership. The owner cannot leave or be removed in this slice. Confirmation identifies the Space, member and account ID, and warns that access ends but earlier copies are not deleted. No request is submitted merely by viewing the roster or opening a review.

After an unknown result, retry the original change. The client keeps the same target, membership ETag and request key and locks competing actions. A stale review requires a fresh roster and another explicit confirmation; it never silently removes a replacement admission. Client retry state is memory-only, not a crash-safe offline queue.

## Authority And Effects

| Boundary | Implemented rule |
| --- | --- |
| Roster | Current viewer membership and active Space are checked in the query that projects member names; at most 50 entries, with no public lookup |
| Remove | Current owner only; target must be an active ordinary member in that Space |
| Leave | Target is derived from the authenticated account, not a submitted account ID; owner continuity is enforced |
| Review | Both mutations require `If-Match` for the reviewed membership and a UUID `Idempotency-Key`; bodies must be empty JSON objects |
| Transaction | Sorted account locks, Space and membership locks; current session check; membership status, Space revision, actual-actor audit, outbox and command receipt commit together |
| Stored status | Both actions end membership with `removed`; audit actions `space.member_left` and `space.member_removed` distinguish self-leave from owner removal |
| Replay | Exact committed leave/removal returns only Space ID, account ID and `removed`; actor/target admission epochs must still match, and a new key does not recreate an old receipt |
| Revocation | Subsequent protected Space, roster, task, request and inbox reads use current access. A former assignee is unavailable, not silently reassigned |
| Pending delivery | If removal acquires the recipient lock first, the dispatcher cannot proceed and later suppresses that reminder because access is lost |
| Already committed delivery | If the inbox transaction commits first, removal does not pretend to recall it. Its row remains stored but the former member cannot list, read or acknowledge it afterward |
| Retained content | Shared tasks and earlier downloaded copies are not deleted. Old invitations cannot reactivate membership. A fresh invitation starts a new admission only after the former member accepts it; see the [rejoin checkpoint](#rejoin-checkpoint) |

`GET /v1/spaces/{space_id}/members` reads the roster. `POST /v1/spaces/{space_id}/members/{account_id}/remove` and `POST /v1/spaces/{space_id}/leave` perform reviewed mutations. Missing preconditions return 428, stale reviews return 412, and unauthorized or unavailable memberships return 404. Removal is never a GET operation.

Migration `0008` adds `space_membership_commands` without replacing existing admissions, tasks, reminders or invitation history. The local database and generated [OpenAPI schema](../../packages/openapi/openapi.json) were verified at this checkpoint. Preserve the development database volume and identity key; do not reset either to apply the migration. Setup remains in the [local runbook](README.md).

## Verification

Run focused backend checks from the repository root:

```powershell
docker compose -f infra/compose.yaml --profile test run --rm tests pytest -q tests/test_spaces.py tests/test_migrations.py -k membership
docker compose -f infra/compose.yaml --profile test run --rm tests pytest -q tests/test_reminder_delivery_guards.py::test_membership_removal_serializes_with_due_dispatch_and_hides_committed_inbox
node --test tests/web-client.test.mjs
```

Observed on 2026-09-23:

- The final combined backend suite passed **208 tests** in 320.56 seconds, with zero failures/errors/skips. The retained JUnit report is `backend/.local/membership-backend-20260923.xml`. The earlier 196-test run and subsequent focused 17-test membership/migration check are superseded by this complete execution.
- Both coordinated PostgreSQL removal-versus-dispatch orderings passed, including denied access to a previously committed inbox row. Event barriers exercise held transactions, not arbitrary sleep delays.
- All 30 web client/BFF tests passed. The separately executed live two-account web membership journey passed in 20.994 seconds, covering removal and self-leave, lost-response retry identity, old task/invitation denial and narrow layouts. Its report is retained locally in `.local/membership-live-web.xml`; desktop/mobile captures were inspected.
- The focused Android Space suite passed **31 JVM tests**: 16 repository and 15 state tests. The separately executed full native run passed **92 tests**, confirmed against its XML reports. App/test builds, lint and release shrinker checks passed; both membership DTO names remain in the shrinker mapping.
- The separately executed **11 offline Space device tests passed** in 138.467 seconds, including exact member removal, self-leave, unknown-response retries and a measured 200% dialog at 320 dp. The result is retained in `.local/membership-native-offline-5582.txt`.
- The **live native membership journey passed**, one test with no failures/skips in 73.426 seconds. It uses the real app for owner removal and member self-leave, verifies denied task/roster/old-invitation access and unavailable assignment, and checks persistence after activity recreation. The UTF-16 result is retained in `.local/membership-native-live-5582.txt`. Native large-text and live review captures were inspected; this continuation did not operate the other session's emulator.

The live preview for this slice uses the separate `membership-20260923` build on port 3004. Do not overwrite another session's active build directory or use its emulator. Local integration access for `localhost`, `127.0.0.1` and `10.0.2.2` was explicitly approved previously; that approval does not extend to external providers or real-user data.

## Native Fixture

The successful offline and live runs used the new `community_membership_20260923` AVD from the installed API 36 Google APIs image and Pixel 4 profile, read-only on port 5582 with 4 GB RAM, four cores and no snapshot load/save. It was shut down after evidence retrieval. The original AVD was not reset or deleted. Two earlier sessions of that older AVD failed before app installation: one lost system processes, and the other repeatedly ANRed during phone-process startup. The guards were retained. Success on the fresh fixture does not establish the earlier failures' root cause.

The existing offline Space task now guards that exact fresh AVD and requires eleven passes plus restored font settings. Launch instructions are in the [local runbook](README.md#native-space-checks). The live case is `AccountJourneyTest#nativeMembershipRemovalAndSelfLeaveRevokeRealAccess`, requires `community_local_integration=true`, and uses the approved local services. The offline task disables guest connectivity and cannot run this live case. Never infer ownership from the serial or use a personal device.

The complete JVM summary is retained in `.local/membership-native-jvm-summary.json`. Native captures matched their stable source hashes before and after transfer and were viewed: `.local/screenshots/membership-native-large-text.png`, 62,069 bytes, SHA-256 `8A4549D9FD8A081132A8C41136CD8597B24C13BBAD70B3729E9C72ADA9B29FE0`; `.local/screenshots/membership-native-live.png`, 64,794 bytes, SHA-256 `9BCC37100550DA7349A0EFBB69BD20D61A146C278DFC769D27FEA243E5D221B1`. The system font setting returned to `1.0`. These finite layout checks are not full accessibility certification; lost-response retries are covered separately by web, JVM and offline native cases, not claimed as dropped responses in the live native run.

## Ownership Transfer Checkpoint

Ownership now uses an explicit two-party offer between the current owner and an existing active ordinary member. On web, open **Members**, choose the next owner and review the offer. Android exposes the same commands in its member panel. Opening the review or sending an offer does not change either role. The intended recipient must explicitly accept; the sender can withdraw and the recipient can decline.

- New offers require a sign-in no older than 15 minutes, the reviewed recipient membership ETag and a UUID request key. Acceptance also requires recent sign-in and the original reviewed offer ETag. Sign in again if `REAUTHENTICATION_REQUIRED` is returned, then reload and review. Signing out of the offering session invalidates its pending offer.
- Offers last at most 15 minutes, bind both admission identities and the source Space revision, and permit one pending offer per Space with at most 100 retained records. Expiry, owner/session invalidation, replacement admissions or current access loss prevent acceptance.
- Acceptance demotes the former owner, promotes the recipient, advances the Space revision and revokes the former owner's pending invitations in one audited transaction. Exactly one active owner remains. Membership admissions, creation identity and historical task grants do not change; ownership alone never grants old task access. The former owner may then review and leave as an ordinary member.
- Lists disclose only offers in which the current active member participated. Cursors bind the account, Space and admission, expire after 15 minutes and return at most 20 records per page. Session IDs, admissions, request keys and internal decision receipts are not returned.
- Unknown outcomes retain the original reviewed command for explicit retry, with no automatic POST retry. Exact committed retries return the canonical result without another role swap. A successful old response is not used as evidence of the current role: clients reload current membership. Retry state remains memory-only.

The five authenticated operations are `POST`/`GET /v1/spaces/{space_id}/ownership-transfers` and `POST /v1/spaces/{space_id}/ownership-transfers/{transfer_id}/accept`, `/decline` and `/cancel`. Response actions use strict empty JSON bodies and `If-Match`; only offer creation accepts `recipient_account_id` and `Idempotency-Key`. Migration `0009` is additive and the local database is at that head. The single `OwnershipTransferService` lives in the existing [Space service module](../../backend/app/modules/spaces/service.py); there is no separate ownership module to restore.

Verified on 2026-09-23 for this continuation:

| Gate | Evidence |
| --- | --- |
| Complete backend suite | Terminal-confirmed 227 passed in 248.52 seconds; isolated PostgreSQL schema, migration parity/preservation, required-audit rollback, competing decisions, current authority and cursor isolation. A later concurrent focused run replaced `backend/.local/ownership-backend-20260923.xml`; that file currently records 30 passing tests, not the full 227-test run |
| Web client/BFF | 34 passed; exact five-operation allowlist, origin/account checks, reviewed retries, wrong-party and lifecycle rejection |
| Web build | `ownership-20260923` isolated build and TypeScript passed; preview `http://127.0.0.1:3005/app/spaces`, leaving the membership-3004 build intact |
| Live browser | One ownership journey passed in 28.305 seconds: real synthetic accounts, dropped committed offer and acceptance responses, same-intent retry, one owner, denied old-task access and former-owner leave. Report: `.local/ownership-live-web.xml`; desktop/mobile screenshots inspected; 320/390/768-pixel bounds checked |
| Native JVM and builds | 20 Space repository and 21 Space ViewModel tests passed; current complete reports contain 102 passing JVM tests across seven suites, with no errors, failures or skips. Debug app/test APK builds passed. Current lint reports zero errors and 11 warnings; release R8 mapping retains both ownership DTO names. These are not device or release-runtime results |
| Native device gate | Pending in this continuation. The 15-test task stopped before installation because the owned 5582 emulator had no phone service, despite its boot marker. That overlay was stopped; the concurrent 5580 emulator was not operated. This startup failure does not identify an application defect |

The updated **Community Platform: verify offline Space screens** task requires all 15 tests, restored system font scale and the existing exact fixture/network guards. Its JSON, PowerShell syntax and count guards passed validation; the task itself has not passed this ownership checkpoint. Four ownership screen cases and `AccountJourneyTest#nativeOwnershipAcceptanceAndFormerOwnerLeavePreserveHistory` are compiled; live native execution requires the explicit local-integration flag and a healthy owned disposable fixture. Do not weaken the mobile-data guard or label the previous membership device results as ownership coverage.

### Device Verification Follow-Up: 2026-09-26

The selected continuation task is Android ownership-transfer verification only. Both current APKs build successfully with cached dependencies. The existing local containers were restarted without a data/key reset; schema `0009` and the ownership preview on port 3005 were verified again. Earlier backend, web and JVM counts above remain their historical test results, not newly executed suites.

Native execution is still blocked before installation. After the old fixture disappeared during boot, a separately named `community_ownership_verify_20260926` AVD was created from the installed API 36 image without replacing existing AVDs. Its first launch was normally stopped to correct port 5590, which the emulator warned was outside its recommended ADB range. The port-5584 launch used a single read-only, no-snapshot runtime and persistent stdout/stderr logs. Those logs record shutdown before readiness; the cause is **unknown**. The boot wait was cancelled after the runtime exited. No Community Platform APK was installed in these new overlays and **zero native tests executed**.

The [retained startup report](../../.local/ownership-native-20260926-verification.json) records launch-log hashes, unchanged APK/test-input hashes, zero executed tests and confirmed cleanup of the owned runtime and wait process. Original AVDs, application data and the existing port-5582 task guards were preserved. Resume only once one explicitly owned fixture stays booted with its phone service available. The new AVD/5584 cannot be passed to the old membership-AVD/5582 task unchanged; its exact identity guards must remain consistent with the selected fixture.

Implementation notes: [backend](../../backend/app/modules/spaces/README.md), [web](../../web/src/features/spaces/README.md), [Android](../../android/app/src/main/java/com/community/platform/feature/spaces/README.md). Current qualification and broader remaining work belong in [BUILD_STATUS.md](../BUILD_STATUS.md).

## Rejoin Checkpoint

On 2026-09-26 an owner gained a way to bring back a former member. After removal or self-leave, the current owner sends a new in-app invitation to that account ID with the existing invitation form. Nothing changes until the former member reviews and accepts it. The removal and leave confirmations on web now say that a return needs a new invitation and that earlier tasks and reminders stay unavailable.

- Acceptance reuses the retained Space/account membership row but issues a new admission ID, member role and join time. The invitation outcome, Space revision and audit/outbox commit in the same transaction. A former owner who transferred ownership and then left also returns as a member.
- History stays closed. Task grants, personal reminders, reminder requests, inbox entries, ownership offers and departure receipts bound to the earlier admission remain unavailable. An old scheduled reminder is suppressed as `access_lost`, and the old accepted invitation still returns 404. Tasks created after the return use the new admission normally.
- The owner cannot add someone back without acceptance. Declined, revoked or expired invitations leave the membership removed, and only one invitation per recipient can be pending. There is no ban list, self-service rejoin or history-sharing option.
- The membership row records only the current join time. Earlier periods remain identifiable through their accepted invitation, departure receipt and audit events, not a separate admission-history table. No migration or API shape change was needed; the local head remains `0009`.

This follows the recommendation of Chapter 3 decision C3-D06 (a new admission epoch and no reactivation through old invitations). That decision remains OPEN; this is a local implementation choice, not an approved production policy.

| Gate | Evidence |
| --- | --- |
| Complete backend suite | 231 passed in 298.24 seconds; `backend/.local/rejoin-backend-20260926.xml` records 0 failures/errors/skips. New cases cover return after removal and after self-leave, required acceptance, and reminder/inbox isolation after rejoining. The existing old-invitation case now allows a fresh invitation after removal and still rejects replay of the old one |
| Web | TypeScript and all 34 client/BFF tests passed; isolated `rejoin-20260926` production build passed |
| Live browser | One rejoin journey passed in 30.392 seconds: UI removal showing the new text, old-invitation denial, new UI invitation, recipient review and join with 320/390/768-pixel bounds, earlier task hidden and a later task visible. Report `.local/rejoin-live-web.xml`; `.local/screenshots/rejoin-review-live-mobile.png` and `rejoin-owner-live-desktop.png` were inspected |
| Android | Source updated, not yet verified by this continuation. Commands need no change. The shared removal/leave string now says a return needs a new invitation and that earlier tasks and reminders stay unavailable, and `AccountJourneyTest#nativeFormerMemberRejoinsThroughNewInvitationWithoutEarlierTasks` adds a live native rejoin journey. The concurrent ownership session's later builds compiled both (app APK SHA-256 `0FED89B3...`, test APK `12BB56D1...` with an earlier revision of the new test); their device runs then failed during fixture startup and connectivity checks, before any test. No Gradle, lint or device result from this continuation exists yet |

The live browser run used a temporary API container from the same source on `127.0.0.1:8001`, against the same local database, because another session was using the shared API for native ownership checks. At 17:34 local, during that session's emulator boot phase, the shared API on port 8000 was restarted and now serves rejoin; the temporary container was stopped. The `rejoin-20260926` preview at `http://127.0.0.1:3006/app/spaces` now uses the shared API.