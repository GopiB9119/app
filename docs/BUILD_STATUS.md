# Implementation Status

Updated 2026-10-01. Executed checks are separate from existing proposed/open product contracts. This record does not change any original chapter, release decision or ADR status.

## Structure

- 21 original documents preserved by SHA-256: the idea and Chapters 1-20.
- 15 domain directories across FastAPI, Next.js and Android; 190 feature entries retained.
- [Detailed inventory](../packages/feature-catalog/requirements.json): 2,208 source headings, 90 priority rows, 17 final outcomes and 39 acceptance rows.
- [Feature catalog](../packages/feature-catalog/features.json): exactly one owner for each of the 48 must-haves and 17 outcomes. Ownership is not completion.
- Agent, infrastructure, OpenAPI, events, states, design tokens, scripts, runbooks and end-to-end test areas exist. Reserved READMEs are not stub APIs or working features.

## First Feature: Account Access

Implemented code connects registration, context-bound local email verification, login, profile/timezone editing, session inspection/revocation, logout, recovery and security-event display. Backend uses PostgreSQL/Alembic and a separate durable local-mail worker. Web uses a same-origin BFF. Android uses Retrofit, Hilt, ViewModel/StateFlow, Compose and Keystore session storage.

This partially implements C1-F01 through C1-F05 and C18-W01/W02/W03/W04/W06. Synthetic email-only verification does not complete all verification requirements; session labels do not complete trusted-device management; display name/timezone do not complete handles, avatars, profile audiences or contact policies. Broader Chapter 18 requirements remain retained.

Commands and limits are in the [shared local runbook](runbooks/README.md) and [account-specific runbook](runbooks/ACCOUNT_ACCESS.md).

## Account Checkpoint Evidence

| Check | Observed result |
| --- | --- |
| Source/catalog tests | 4 passed; exact source/category mapping and unchanged fingerprints |
| PostgreSQL account/delivery/migration tests | 28 passed at the account checkpoint, including migration, parallel verification, idempotency, restart, required-audit rollback, revocation, recovery and worker retry/expiry |
| Current combined backend | 127 passed at the family task checkpoint using per-run PostgreSQL schema isolation. Earlier invitation/account checkpoints passed 84/81 combined tests; shared-schema failures are not counted as success. |
| Web TypeScript and production build | Passed again in an isolated output directory after the account retry-identity fix |
| Offline web component checks | 5 passed: recovery request/reset, validation, failed-reset state and registration/recovery retry identity. The actual component is bundled locally; API and Next Link are simulated; outbound network is blocked |
| Android repository tests | 8 passed, zero skips/failures: persistence, revocation, outage, account binding, cancellation, version conflict and retry identity |
| Android wrapper/lint/package | Gradle wrapper verified with JDK 21; lint has zero errors; debug application and instrumentation APKs rebuilt successfully with version-qualified theme and backup/transfer exclusions |
| Mobile Chromium journey | Passed before the loopback policy denial: real signup, account display, 320/390/768-pixel layouts, visible offline failure and no delayed save |
| Desktop Chromium journey | Passed steps through signup, cookie/privacy checks, CSRF rejection, account binding, profile reload, cross-session revocation and logout; timed out entering recovery |
| Desktop follow-up | Explicit page-navigation waits remain; the recovery component now passes offline, but the live desktop journey has not been rerun |
| Native emulator tests | 5 passed on a booted API 36 read-only emulator: 1 real Keystore round-trip/tamper test and 4 offline Compose tests. The networked account journey was explicitly excluded |
| Native UI coverage | Recovery proof callbacks and secret clearing, 200% text with preserved drafts/ETags, selected-session confirmation, and busy/error states. Screen callbacks were simulated; Wi-Fi and mobile data were disabled in the temporary emulator session |
| Screenshots | Two native captures retrieved with matching device/host SHA-256 and viewed. Earlier web captures remain; the desktop web capture has loading session/activity sections |

The first feature is **not fully end-to-end qualified yet**. Do not report all tests passing or promote it to production readiness.

## Verification Blockers

The integrated browser explicitly denied `127.0.0.1` under the active network policy. Permission to change only loopback entries was requested; the user was unavailable, so no policy change was made. No further local-web or native-to-local-service journey requests were made after the denial. Remaining journeys require permitted access, not a tool or address that bypasses the restriction.

The desktop failure may be a test navigation race; this is a hypothesis, not a proven fix. The five offline web checks do not exercise Next.js routing, the BFF, cookies or real delivery. The real Keystore and offline Compose checks now have device evidence, but native client-to-server behavior still needs the full permitted journey.

The offline tests found a separate real defect: after a failed registration or recovery request, editing the email retained the old idempotency key. The client now binds the key to the submitted email, preserves it for an unchanged retry and creates a new key for an explicitly changed email. Regression tests first failed on the old implementation and then passed on both forms. This is not claimed as the cause of the older desktop timeout.

The dedicated emulator reached the boot gate on this continuation. Only a previously absent debug package was installed, only the selected offline classes were run, and the owned read-only session was shut down after artifact retrieval. No personal device, live email provider, network-policy exception or app-to-server test was used.

## Concurrent Space Work

Separate private-Space sources and `/app/spaces`, including backend/BFF wiring, appeared during this implementation and were preserved. The account checkpoint does not claim authorship or end-to-end verification of that feature. Its own evidence is recorded in the shared runbook. Future combined suites must use the current migrations and API, not assume the repository still contains only account code.

The first combined test run reported disappearing records, missing tables and reset deadlocks. Its fixture shared one resettable schema with other invocations. Test runs now create a unique `test_<random>` schema in the guarded test database, migrate and truncate only within it, and drop only that schema on teardown. The same combined command then passed all 81 tests. This removes the shared-reset mechanism; it does not prove which external invocation caused each earlier failure.

## Family Invitation Checkpoint

The private family Space slice now includes six authenticated in-app invitation operations: owner create/history/revoke and intended-recipient inbox/accept/decline. Invitations bind to an existing active verified account ID, have a 72-hour local expiry and always offer member rather than owner. There is no transferable token, email/phone discovery or external send.

Admission is serialized with Space/recipient eligibility and capacity, rechecks caller/session validity after lock waits, and commits membership, one-use invitation state, audit and outbox together. Replays cannot revive removed membership or a different admission epoch. Migration `0003` backfills existing membership/audit data; a real upgrade/backfill test and schema comparison passed.

- 84 backend tests passed in the isolated invocation. Concurrent create/accept, accept-versus-revoke/decline, final-slot capacity and injected audit failure exercise actual PostgreSQL transactions.
- Seven mocked, in-process TypeScript client/Next proxy tests passed for pagination, authentication, origin/account guards and method/path restrictions.
- Web typecheck and isolated production build passed. Owner management, recipient review/inbox, accept/decline/revoke, pagination and account-ID copy are implemented in `/app/spaces`.
- The new desktop/mobile invitation browser journey is syntax-checked but NOT RUN under the current network denial; its screenshot assertions are not captured evidence.
- The generated API schema contains nine authenticated Space/invitation operations and excludes internal invitation request/admission fields. All source chapters and production decision statuses remain unchanged.

These results do not complete tasks/reminders, unregistered contact admission, other Space types, member removal/rejoin/history controls, Android invitation UI or production qualification. The [shared runbook](runbooks/README.md) contains the local bounds, commands and remaining browser gate.

## Backend and Web Task Checkpoint

The planning module now implements six authenticated task operations: create, scoped list, eligible-assignee list, detail, versioned edit and explicit status change. `/app/tasks` is linked from each Space. It supports ordinary title/notes, date-only deadlines, assignment, open/in-progress/completed/cancelled states and actual completion actor/time. Due dates create no reminder or external effect.

Task audiences bind to exact active admissions at creation. All reads/lists/mutations/idempotency receipts check current account, Space, membership and task grant. New members and replacement admissions do not inherit old tasks; even an owner cannot bypass history. Creators/owners manage visible tasks; assignees can operate their tasks but cannot cancel solely as assignee. Reassignment is limited to eligible original audience members.

- 127 combined backend tests passed, including task concurrency, current-grant receipt privacy, revoked assignment, stale versions, completion/reopen/cancel behavior, strict dates/inputs, required-audit rollback, cursors, lock-wait expiry and migration preservation/parity.
- 16 in-process TypeScript client/BFF checks passed with simulated responses and zero network requests.
- Five task component checks passed; the combined offline account/task suite passed ten. It renders actual task code/styles/local font on blank pages, mocks APIs/Next Link and blocks all outbound requests. Cases cover exact retries, explicit conflict reload, read-only/revoked views and 320/390/768-pixel layout.
- Offline task desktop/mobile screenshots were captured and inspected. These are labeled fixtures, not authenticated app-to-server captures. The tests caught and verified a fix for select labels including their options in the accessible name.
- Final TypeScript and isolated production build passed. Migration `0004` is applied locally; generated OpenAPI contains six task operations beside nine Space/invitation operations and excludes internal task identity/grant metadata.
- The live shared-task browser journey is written and syntax-checked, but NOT RUN while loopback policy denies access. This does not complete the cross-client C1-M03/M1 gate.

The [backend planning notes](../backend/app/modules/planning/README.md), [web planning notes](../web/src/features/planning/README.md) and [local runbook](runbooks/README.md) document bounds and commands. Native work and its evidence are preserved separately below; reminders and production qualification remain outstanding.

## Native Family Task Checkpoint

Android now has a family task workspace linked from the account header: existing-Space selection, bounded list/filter/detail, create/edit, calendar due dates, eligible assignment, and confirmation for backend-permitted status changes. It uses the concurrent task API and shared secure account sessions rather than a separate backend or identity store.

- 27 native JVM tests passed: 12 task repository/transport tests, 7 task-state tests and the 8 account repository tests. Actual Retrofit encoding was checked with fully simulated responses; no network connection was made.
- Android lint and debug app/test APK builds passed. The actual release R8 minifier also passed with task DTO keep rules; this is build evidence, not a tested release runtime or production rollout.
- Six task-screen instrumentation tests passed on a guarded API 36 read-only emulator with networking disabled, including calendar selection, explicit nullable fields, retry lockout, permissions, confirmation and 320 dp / 200% text handling.
- Two synthetic task screenshots were transferred with matching hashes and viewed; the owned emulator was shut down afterward.
- The current combined backend suite passed 127 tests. Added owner/member creation-retry regressions verify current per-task access after grant revocation, not just Space membership.

Task commands retain an immutable key/payload/ETag for explicit retry; conflicts require review and do not overwrite newer values automatically. Drafts remain in the retained ViewModel across activity configuration changes, but not process death or deliberate workspace exit. Unavailable assignees are not silently cleared by unrelated edits. See the [native task runbook](runbooks/ANDROID_TASKS.md) for exact scope, commands, evidence and limitations.

The original failing task routes were supplied by concurrent backend work during this continuation and preserved. This checkpoint adds the native client and focused access checks; it does not claim authorship of concurrent task backend/web changes, native invitation UI, a reminder scheduler or live cross-client verification. Source chapters and policy statuses are unchanged.

## One-Time Self-Reminder Checkpoint

The next implemented slice is **Remind me** on an accessible ordinary family task: a protected exact-time review, durable one-time schedule, independent scheduler, private in-app inbox, cancellation, versioned preferences and separate read/acknowledgment. The requesting account is the sole recipient; there is no inferred consent for another family member, push/email/voice delivery or medical workflow.

The review binds account/admission/task revision, preference generation, local time/IANA zone, selected UTC instant and shown dispatch deadline. DST gaps are rejected and overlaps require a selected option. Current source/recipient authority is checked at creation, dispatch and inbox disclosure. Task changes or withdrawn grants suppress old work; re-enabling preferences cannot release its old backlog. Human and scheduler audit actors remain distinct.

- Final combined PostgreSQL suite: **167 passed**, including migration preservation and the real standalone worker entry point. Separate worker processes materialize one logical inbox entry from persisted work without duplicate delivery.
- Combined web client/BFF suite: **22 passed**; offline browser-component suite: **22 passed**. Real component/style/font code is exercised with simulated requests and blocked outbound networking, not live application endpoints.
- Combined native JVM suite: **43 passed**. Six new reminder screen instrumentation tests passed on the guarded read-only API 36 emulator with networking disabled, including date/time controls, DST choice, explicit retry, acknowledgment and large text.
- Reminder/inbox web screenshots and two native screenshots were captured and viewed. Native files matched device/host hashes; the owned emulator was shut down afterward.
- Web production build, Android compile/APK/test APK/lint and nine authenticated reminder/inbox API operations were verified. The additive local database head is **0006**, and the API plus separate reminder worker are running.

Migration `0005` and the first self-reminder implementation were extended by concurrent `0006` bounded-retry work and additional client/backend checks. Those additions were preserved. The resulting terminal `failed` state is displayed rather than being treated as a malformed reminder. Scheduler retry exhaustion, suppression and cancellation remain different outcomes.

The [self-reminder runbook](runbooks/SELF_REMINDERS.md) records local bounds, operations, setup and evidence. That checkpoint did not include native onboarding, which is recorded below. It does not close the existing blocked live browser/native-to-server gate or complete the full recipient-consent, external delivery, recurrence or production scope.

## Native Space Client Verification

Android now includes private family Space creation/list/detail, current-account ID copy, intended-account invitation review/accept/decline, owner invite/revoke and selected-family navigation into tasks. It uses the existing backend routes and account/session boundary, with immutable commands for explicit unknown-outcome retries. No new backend permission, external message, recipient lookup or historical task grant is introduced.

This reliability continuation preserved concurrently supplied client, screen and navigation implementation. It added and verified two focused repairs: repeated response cursors are rejected in all three Space/invitation lists, and the selected Space is reauthorized before an unrelated inbox fetch can fail. Both regressions failed before their local fixes and passed afterward. Two task-entry tests also verify exact-family selection and no fallback to another family after denial.

- Combined native JVM suite: **67 passed**, zero failures/errors/skips. This includes 12 Space repository tests, 10 Space-state tests, nine task-state tests, and the existing account/task-transport/reminder tests. Responses are fake or interceptor-provided, not live service traffic.
- Android lint: **zero errors, 11 warnings**. Warnings concern existing target/dependency, plural-resource and app-icon release work; this is not a clean production-release audit.
- Debug app and instrumentation APK builds passed. Release `minifyReleaseWithR8` passed; the five Space DTO classes retain their names and serialization fields in the mapping.
- At that reliability checkpoint, eight offline Space screen tests were compiled but not executed by that continuation. Its JVM results do not imply device coverage; the separate device execution is recorded below.

The [native Space owner](../android/app/src/main/java/com/community/platform/feature/spaces/README.md) records retry and privacy boundaries. Live account-to-Space-to-task-to-reminder qualification still needs permitted local-service access. Memory-only drafts are not crash-safe queues, and the existing broader release gates remain open.

## Native Space Device Checkpoint

The onboarding continuation executed **eight offline Space screen tests**, all passing without skips on the owned API 36 read-only emulator. Coverage includes creation, exact uncertain-invitation retry, recipient review/join and selected-family task navigation, decline, owner revocation, account-ID copy payload and dirty/uncertain exit confirmation. Its original simulated large-text setting affected the activity but not the separate review dialog; those earlier results do not prove 200% dialog text. The measured follow-up below closes that specific gap. Screen callbacks remain simulated, not client-to-server integration.

- The dedicated VS Code task rebuilt/checked both APKs, installed them only in the disposable overlay, and required eight successful test-status records plus `OK (8 tests)`, not merely ADB exit code zero. Wi-Fi and mobile data were disabled before installation/testing.
- Three generated synthetic screenshots were retrieved with matching device/host SHA-256 and viewed: `family-space-owner-native.png`, `family-invitation-review-native.png`, and `family-invitation-large-text-native.png` under ignored `.local/screenshots/`.
- Final combined native JVM suite: **67 passed**, zero failures/errors/skips. Debug app/test builds, lint and release R8 also passed after the screen changes. These are local build checks, not release-runtime qualification.
- The owned emulator on port 5580 was shut down normally after artifact retrieval. The separate concurrent emulator on port 5582 was not used or stopped.

The clipboard case injects a Compose clipboard test double and proves that only the current account ID is supplied. Real OS clipboard reads were denied because the test window lacked focus, so OS clipboard integration is **not verified**. The large-text fixture scrolls the nested review button itself; scrolling its tall list item alone did not make that button visible. The review dialog has scrollable content and a separate action area.

See the [native verification commands](runbooks/README.md#native-space-checks). Live account/Space/invitation/task/reminder journeys remain blocked by the unchanged local-service policy; no alternate client/address, external invitations or network-policy changes were used.

### Measured Text Scale

On 2026-09-20, the corrected fixture passed its focused case and then **all eight offline screen tests**, with zero failures/skips, on an owned API 36 read-only emulator at an actual **320 dp** window width. The test measures the review text's `TextLayoutResult` and asserts **fontScale 2.0**, scrolls to the exact recipient and access notice, and verifies that both dismiss and confirm actions remain displayed. The earlier composition-only fixture failed this measurement with `expected 2.0, actual 1.0`; no application behavior change was needed for this test correction.

An outer test rule applies the real system font setting before the activity starts and restores its original value in `finally`. It requires an emulator hardware identifier and explicit `community_disposable_ui_fixture=true`; the VS Code task additionally checks the expected AVD, read-only/no-snapshot runtime, boot state and disabled guest connectivity on `emulator-5582`. The complete task passed in 70.614 seconds of instrumentation time and confirmed restoration to the original `1.0` setting.

Three final synthetic captures under ignored `.local/screenshots/` were transferred with matching device/host SHA-256 and viewed: `space-systemscale-5582-owner.png`, `space-systemscale-5582-large-text.png` and `space-systemscale-5582-details.png`. They show normal owner controls, the enlarged long-name review and its scrolled details with the separate action area. The exact task output is retained locally as `.local/native-space-systemscale-5582-suite.txt`. The owned emulator was shut down normally after retrieval; no personal device or live service journey was used. This finite layout check is not full accessibility certification.

## Recipient-Approved Reminder Requests

The existing backend, web and Android reminder flow now supports a task manager proposing one exact time to the current eligible assignee. Only the recipient's explicit reviewed acceptance creates a personal schedule; a proposal, review read, decline or withdrawal never schedules or sends a notification. The sender cannot opt the recipient in, replace an existing personal schedule, or inspect its private ID/read/acknowledgment. Accepted schedules remain recipient-owned, with the existing source/access/preference/dispatch gates.

Additive migration `0007` stores immutable proposal facts and required audit events. Current task audience and exact admission epochs apply to both participants. Protected five-minute reviews bind the recipient, request/source revision and preference generation; old preference grants cannot be revived by disable/re-enable. Atomic acceptance commits the request outcome, personal reminder, audit and outbox, with one winner against decline/withdrawal and current-authorized retry receipts. Local bounds and the seven authenticated API operations are documented in the [reminder runbook](runbooks/SELF_REMINDERS.md#recipient-approved-requests).

- **194 combined PostgreSQL tests passed**, including the request privacy, consent, race, retry, migration and audit-rollback cases. Original self-reminder behavior remained covered after extracting the transaction-local creation helper.
- **27 web client/BFF tests** and **27 offline browser-component tests passed**. TypeScript and isolated production build `reminder-requests-20260920` passed. A captured narrow enlarged-text button overflow was fixed with wrapped dialog actions and direct bounds assertions.
- **81 native JVM tests passed**; debug app/test APKs and lint passed. **Twelve offline reminder device tests passed** on a guarded API 36 read-only emulator, including six request cases and actual rendered font scale 2.0 at 320 dp. Raw test results require twelve anchored passes and restored font settings, not ADB exit code alone.
- Two generated native request images matched device/host SHA-256 and were inspected; the owned emulator5580 was shut down normally. The concurrent emulator5582 and its separate Space/live-account work were preserved. New request DTOs reuse the existing scheduling shrinker rule.
- The real **two-account web/BFF/API request journey passed**, including synthetic registration/admission, exact proposal and acceptance retries after dropped successful responses, no schedule before consent, one recipient schedule after acceptance, reload/cancel, decline and withdrawal. Live owner/recipient screenshots were captured and inspected; the JUnit report is retained locally.
- The **live Android recipient request journey passed**, one test with zero failures/skips in 45.710 seconds. Local API fixtures create two synthetic accounts, admission, a task and a proposal; the real app signs in the recipient, opens and reviews the request without scheduling, accepts exactly one personal reminder, reloads it after activity recreation and cancels it. The sender still sees no personal reminder ID. This is not full native organizer-onboarding or due-delivery coverage.
- Local database head **0007** and the generated seven-operation request contract were verified without deleting data or keys. The separate compiled request preview is on port 3003; port 3001 remains owned by concurrent live verification.

The earlier loopback denial was superseded by explicit local-only approval recorded in the concurrent session on 2026-09-20. Existing filtering remains enabled with narrow local entries. This continuation changed no security settings. These request results are not attributed to the separate account/self-reminder journeys, nor do they authorize external providers or production use.

The live native task retains its exact result in `.local/native-reminder-request-live-5580.txt` and requires a fresh, owned read-only emulator plus explicit local-integration selection. Its synthetic review screenshot, `.local/screenshots/reminder-request-native-live.png` (83,105 bytes), matched device/host SHA-256 and was inspected. Font settings stayed unchanged, and the owned emulator exited normally after retrieval. An initial mobile-data guard stopped before installation; a subsequent read confirmed data disabled, and the unchanged guard then passed. No guard was removed. Final single-worker lint and release R8 gates passed against current inputs, with up-to-date build artifacts reused. This is not release-runtime qualification.

## Live Manual Workflow Checkpoint

On 2026-09-20 the user explicitly approved local integration access for `127.0.0.1`, `localhost` and the emulator host route `10.0.2.2`. Exactly those three entries were appended to the existing user allowlist, preserving its previous 22 entries and keeping network filtering enabled. No applicable managed override was found. The integrated browser loaded the actual local sign-in page; the earlier policy-blocked statements above describe historical checkpoints, not the current local-access status. External providers, real-user data and production deployment remain outside this authorization.

- **Seven live browser journeys passed**, zero failures/skips, against the real local web/BFF/API/PostgreSQL/Mailpit services: desktop enrollment/recovery/session revocation, mobile account/offline handling, Space persistence/exact retry/account isolation, narrow-screen Space creation, intended-account invitations, member task completion/stale-edit rejection, and self-reminder delivery. The saved JUnit report is `.local/manual-flow-live-web.xml`.
- The self-reminder journey reviews a real future minute, drops an already accepted save response, retries the same token/key, and observes exactly one inbox row from the running worker. It also verifies pending cancellation, cross-account denials, reload persistence, separate read/acknowledgment and an unchanged open task. No database timestamp, system clock or delivery response was fabricated. Final live reminder desktop/mobile captures were inspected.
- **Two real Android journeys passed** on the disposable API 36 emulator: account enrollment/profile/recreation/session revocation/recovery, and owner-to-member Space creation/invitation/acceptance followed by a shared task and real self-reminder inbox/read/acknowledgment. The family test checks the server's persisted facts and no owner inbox disclosure. Retained outputs are `.local/native-account-live-5582-diagnostic.txt` (`OK (1 test)`, 30.209 seconds) and `.local/native-family-live-5582-fresh-connections.txt` (`OK (1 test)`, 240.605 seconds). The family pass follows the transport repair below; these were separate focused runs, not a combined instrumentation run.
- Final shared native regression suite: **83 JVM tests passed**, zero failures/errors/skips. Android lint passed with zero errors and 11 existing warnings; debug app/test APKs and release R8 passed. This includes the two real local-socket transport regressions, not just mocked HTTP responses.

The native journey exposed an `EOFException` before a response on a reused idle connection. A deterministic peer-close test reproduced that boundary, while a separate test protects against automatically replaying an unacknowledged POST. The shared OkHttp client now retains no idle connections and still has `retryOnConnectionFailure(false)` and redirects disabled. Both regressions and the real family journey pass. The cost is additional connection setup between separate calls; production connection reuse and latency remain to be measured, not assumed free. Native test interactions also wait for enabled controls after asynchronous account loads; the temporary transport probe was removed.

The local services were restored without resetting data or keys, and migration **0007** was reverified. The existing compiled `reminder-requests-20260920` preview is running at `http://127.0.0.1:3003`; its dedicated VS Code task was reused. No emulator was running at final verification, so the already-passing native journeys were not repeated merely to recover a screenshot. This checkpoint does not claim a retrieved live native screenshot or execution of the separate live assignee-request test. Concurrent request implementation and its evidence above are preserved.

## Family Membership Checkpoint

The combined implementation now exposes a private bounded roster, owner removal of an ordinary member, and ordinary-member self-leave on backend, web and Android. Both mutations require an exact membership review and stable retry key. The owner cannot depart, old accepted invitations cannot reactivate access, and retries cannot end a replacement admission. This continuation preserved the concurrently supplied implementation and added focused backend revocation and receipt tests.

The final combined backend suite passed **208 tests** in 320.56 seconds; its JUnit result is retained in `backend/.local/membership-backend-20260923.xml`. Two coordinated transaction-order tests prove removal-before-dispatch suppression and denial of list/read/ack access after a previously committed inbox entry. Receipt rollback, exact review, minimal departure replay, owner protection and admission-preserving migration tests also passed.

The web client/BFF suite passed **30 tests**. The separately executed live web membership journey passed one test in 20.994 seconds, including lost-response retries for removal and self-leave. Its desktop/mobile review captures were inspected. The focused Android Space suite passed **31 JVM tests**; the separately retained complete native XML reports confirm **92 passing tests**. App/test builds, lint and R8 passed, with the membership DTOs retained in the mapping.

Saved native results now confirm **11 offline screen tests passed** in 138.467 seconds, including a measured 320 dp / 200% membership dialog, and **one live membership journey passed** in 73.426 seconds. The live test performs owner removal and member self-leave through the real app, verifies denied task/roster/old-invitation access and unavailable assignment, and checks persistence after activity recreation. Evidence is retained in `.local/membership-native-offline-5582.txt` and `.local/membership-native-live-5582.txt`; native review images were inspected. These client runs were executed by the concurrent continuation and verified here from saved results, without using its emulator.

The local migration head is `0008`; the three membership operations are present in generated OpenAPI. See the [family membership runbook](runbooks/FAMILY_MEMBERSHIP.md) for exact scope, retry behavior, retained-data limits and commands. This is not rejoin, ownership-transfer, full membership lifecycle or production qualification.

## Ownership Transfer Checkpoint

Current ownership is a separately reviewed two-party workflow on backend, web and Android: a recently signed-in owner offers to an exact existing member, and that recipient explicitly accepts after recent sign-in. The 15-minute offer binds current admissions, Space revision and the offering session. Acceptance atomically leaves one owner, demotes the previous owner, revokes their pending invitations and records the actual actor. Historical task grants and admission identities do not change. Decline/withdrawal never change roles; original-command retries reconcile one result without repeating the swap.

- The complete backend run passed **227 tests in 248.52 seconds**, confirmed by terminal output. A concurrent focused run subsequently replaced its shared JUnit filename with **30 passing tests**; that retained file is not evidence of all 227 cases. Migration preservation/parity and the additive local `0009` head passed; generated OpenAPI contains five authenticated ownership operations.
- **34 web client/BFF tests**, TypeScript and the isolated `ownership-20260923` build passed. The **live ownership browser journey passed** in 28.305 seconds, including dropped committed offer/acceptance responses, exact retry identity, one-owner continuity, historical task denial, former-owner leave and 320/390/768-pixel bounds. Review screenshots were inspected. Preview: `http://127.0.0.1:3005/app/spaces`; membership port 3004 was preserved.
- Native Space repository/ViewModel tests passed **41 cases**; current shared XML reports contain **102 passing JVM tests** across seven suites. App/test APK builds passed; lint has zero errors and 11 warnings; ownership DTO names remain in release R8 output. These do not prove release-runtime or device behavior.
- **Native device verification remains pending in this continuation.** The updated task requires 15 offline Space tests, including four ownership cases, and actual 320 dp / 200% dialog measurements. It stopped before installation when the owned 5582 fixture lacked Android's phone service. That read-only overlay exited; the concurrent 5580 emulator was not touched. The compiled live ownership test also needs a healthy, exclusively owned fixture. No radio guard was weakened and no personal device was used.

The [ownership runbook section](runbooks/FAMILY_MEMBERSHIP.md#ownership-transfer-checkpoint) records exact methods, recovery, limits and evidence. The earlier missing-module blocker is resolved by the single ownership service in the existing Space service module. Concurrent implementation and tests were preserved; original sources, catalog locks and proposed decisions were not regenerated or approved.

## Local Restore Drill Checkpoint

On 2026-09-26 a guarded drill qualified the local recovery path for the development PostgreSQL database and its identity key, following the isolated-restore procedure in the [operations contract](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md). `scripts/restore-drill.ps1` exports one read-only snapshot, dumps and counts from that same snapshot, restores into the separate `community-restore-drill` Compose project on an internal network with no workers, mail service or published ports, verifies and seals the copy, and removes that project. The running stack is only read; the temporary dump inside its database container is deleted after copying.

- **Drill passed.** 24 tables and 987 rows matched the snapshot exactly at migration `0009`. With the recorded key, 53 account emails and 63 challenge addresses decrypted and all 53 email lookups matched; a freshly generated control key opened none. All 29 Spaces satisfied the one-active-owner check. `db`, `mail`, `api` and `host.docker.internal` were unresolvable from the copy while the drill database was reachable. The disposable project was removed.
- **Measured locally:** backup 12.5 s; isolated database start 14.8 s, restore 12.9 s and checks 11.7 s, so 39.4 s from start to a verified copy of a 166,309-byte dump. These are fixture timings, not RPO/RTO objectives.
- **Negative control:** the same dump checked against a manifest claiming one extra account exited 1, reported `users` expected 54/actual 53, skipped the seal and still tore down cleanly.
- **Five focused backend tests passed:** the checker refuses every database except the drill target, reports each count difference, accepts only the recorded key, seals only unexpired credentials and proofs (a sealed session then receives 401 from the API) and detects an ownerless active Space.

The copy is sealed because revocations after the snapshot cannot be proven: unexpired restored sessions are revoked and pending identity challenges and mail payloads expire. This snapshot contained none of those, so the seal changed no rows; the tests cover its effect. Scheduled reminders are counted, not changed, and the drill runs no reminder worker. Evidence is under ignored `.local/restore-drill/20260926T101538Z/` (dump, manifest, verification report and summary); treat such dumps as sensitive local data. Procedure and limits are in the [platform notes](../backend/app/modules/platform/README.md).

This is not production backup qualification. The key file is fingerprinted but not copied, so losing it still makes protected fields unreadable. There is no key rotation, off-host or encrypted backup storage, PITR/WAL archive, retention policy, object-file recovery, audited production seal, or reconciliation of work changed after the snapshot. Key rotation was added on 2026-10-01 ([checkpoint](#encryption-key-rotation-checkpoint)); the drill itself did not change.

## Family Rejoin Checkpoint

On 2026-09-26 an owner can bring back a family member who was removed or left. The owner sends a new in-app invitation, and nothing changes until the former member explicitly accepts it. Acceptance issues a new admission ID, member role and join time on the retained membership row, committed with the invitation outcome, Space revision and audit/outbox. Grants tied to the earlier admission stay closed: earlier tasks, personal reminders, reminder requests, inbox entries, ownership offers and departure receipts remain unavailable, old scheduled reminders are suppressed as `access_lost`, and the old accepted invitation still returns 404. No migration or API shape change was needed.

- The **complete backend suite passed 231 tests in 298.24 seconds**, retained in `backend/.local/rejoin-backend-20260926.xml`. Four new cases cover return after removal and after self-leave, required acceptance and reminder/inbox isolation after rejoining.
- Web TypeScript, **34 client/BFF tests** and the isolated `rejoin-20260926` build passed. The web removal and leave confirmations now explain the return path.
- The **live rejoin browser journey passed** in 30.392 seconds against real local services, with 320/390/768-pixel review bounds; report `.local/rejoin-live-web.xml`, screenshots inspected. It used a temporary API container from the same source on port 8001 because another session was using the shared port-8000 API. The shared API was restarted afterwards and now serves rejoin; the temporary container was stopped.
- **Android source is updated but not verified by this continuation.** The shared removal/leave text now explains the return path, and a new live native rejoin journey is written. Gradle, lint and device runs are pending because a concurrent session holds the only emulator slot.

This follows the recommendation of the still-open Chapter 3 decision C3-D06 as a local implementation choice. There is no ban list, self-service rejoin or history-sharing option. Details: [rejoin checkpoint](runbooks/FAMILY_MEMBERSHIP.md#rejoin-checkpoint).

## Calendar And Space Settings Checkpoint

On 2026-09-28 the [feature delivery ledger](PRODUCT_FEATURES.md) records all 190 catalog groups and the implementation/evidence boundary for backend, web and Android. Agent runtime is a separate workstream; retained source headings and feature ownership are not completion evidence.

The calendar batch adds a current-authorized per-Space month agenda over date-only tasks and the caller's timed reminders, with named display timezone, scoped pagination and source navigation on both clients. Earlier checks in the ledger record 65 backend task/calendar/migration tests, 36 web client tests, 26 native task/calendar JVM tests and one live calendar browser journey. Native calendar device qualification remains open; these are historical results from that batch, not a full rerun here.

The next batch implements reviewed **owner-only Space name settings**. Migration `0011` adds audited admission-bound retry receipts after the separate export migration `0010`. Only `name` can change; current owner/session/Space authority and reviewed version are required. Unexpired pending invitations or ownership offers block renaming until resolved or withdrawn. Exact successful retries report the current settings without repeating a rename; stale edits preserve client drafts until explicit reload. No membership/history/privacy/schedule changes are implied.

- **110 PostgreSQL Space/migration tests passed** in 127.29 seconds, including 13 settings-specific cases. Saved report: `backend/.local/space-settings-backend-20260928.xml`.
- **38 web client/BFF checks passed**. TypeScript and isolated `space-settings-20260928` production build passed.
- **One real settings browser journey passed** in 9.678 seconds: two synthetic accounts, lost committed response and exact retry, one version advance, conflict/discard/reload, member view, persistence and 320/390/768 dialog bounds. Report: `.local/space-settings-live-web.xml`; desktop/mobile captures retrieved. A test-only screenshot-path shadowing failure was fixed before this passing run.
- **47 native Space/settings JVM checks passed** across three suites, with zero failures/errors/skips. Debug app/test APKs and lint passed, with zero errors and 11 existing warnings. This does not establish device/Compose/release-runtime or process-death behavior; no emulator or personal device was operated.
- Forward migration `0011` and API export completed locally without resetting data or keys. Generated OpenAPI adds settings, earlier calendar and separate export operations; parsed comparison found no removed or semantically changed existing paths/schemas.

Preview: `http://127.0.0.1:3008/app/spaces` (also serves `/app/calendar`). Exact implementation links, bounds and independent-testing handoff are in the [settings ledger](PRODUCT_FEATURES.md#space-name-settings-batch). Full-product and production qualification remain open.

## Solo And Canonical Preview Checkpoint

Solo creation, owner-only name settings, private task/reminder/calendar reuse and Family/Solo selection are implemented on backend, web and Android. Migration `0012` enforces one active Solo owner at commit and prevents unreviewed type conversion. Solo cannot invite, accept another person, transfer ownership or leave; those pathways do not merely rely on hidden buttons. Five focused Solo backend cases passed, followed by **167 Space/task/migration tests** in 232.50 seconds. The saved result is `backend/.local/solo-backend-20260928.xml`.

Native affected suites passed **75 JVM tests** with zero failures/errors/skips; debug application/test APKs and lint passed (0 errors, 11 existing warnings). This is not native-device, release-runtime or process-death qualification. The [feature ledger](PRODUCT_FEATURES.md#solo-spaces-batch) records scope and browser evidence.

The user explicitly requires **http://127.0.0.1:3000 only** for the web preview. Npm development/start commands and the canonical VS Code **Community Platform: preview web** task are pinned to that host/port; old preview labels alias the same task. No listener remained on 3008/3009 when the canonical task was started. The real Solo and settings browser journeys both passed at port 3000, saved in `.local/solo-settings-port3000.xml`. Keep this task running for continued development; previous checkpoint URLs are historical, not instructions to start more ports.

## Space Chat And Direct Messages Checkpoint

Implemented on backend, web and Kotlin Android (2026-09-28 to 2026-09-30). Migration `0014` adds `conversations`, `conversation_messages` and `conversation_read_states`; the local development database was upgraded from `0013` to `0014` without a reset.

- One **Space chat** per Space, visible to current active members only; its history starts at each member's current admission, so a new or returning member sees nothing sent earlier. A **direct conversation** binds both people's current admissions; if either leaves or is removed it becomes read-only for the other and closed to the departed person. Outsiders receive 404 for every operation.
- Send requires a UUID `Idempotency-Key`. The exact retry returns the original message; a changed body with the same key is `IDEMPOTENCY_CONFLICT`. Positions are allocated under a row lock; parallel sends get unique positions. Local bounds: 2,000 characters, 30 sends per minute per account, 10,000 messages per conversation, 200 direct conversations per Space.
- Unread counts exclude your own and deleted messages; read positions only move forward and are per admission. Authors can delete their own message for everyone: the body is erased, a tombstone and audit record remain, and already-seen copies are not recalled. No edits, reactions, threads, attachments, typing/presence or calls.
- Bodies are sealed with a key derived (HKDF) from the server key and bound to the conversation and message IDs; a swapped ciphertext shows as unavailable instead of another message's text. **The server can read these messages. This is encryption at rest, not end-to-end encryption**, and both clients state it on every chat screen.
- Clients poll every 5 seconds while a chat is visible (web and Android), fill gaps page by page, and mark the newest confirmed message read only while visible. An unconfirmed send stays visible with its original key; Retry reuses it and a later poll can also confirm it. Leaving with an unconfirmed send asks first. Access loss clears messages, drafts and pending sends.

| Check (2026-09-30) | Result and boundary |
| --- | --- |
| Messaging backend + schema parity | 12 passed (11 messaging cases + model/migration parity). |
| Complete backend suite | **287 passed**, 305.09 s, zero failures/errors/skips; `backend/.local/messaging-backend-20260930.xml`. |
| Web typed client/BFF | **49 passed** (41 existing incl. checklist + 8 messaging); simulated transport. Web TypeScript check passed. |
| Live browser/BFF/API/PostgreSQL | **1 passed**, 18 s; `.local/messages-live-web.xml`. Two synthetic accounts: lost committed send response then exact retry (one stored copy, same key/body), unread then read, reply seen by poll, direct conversation, delete with Keep/Delete confirmation and tombstone, member removal closes the chat and clears it on screen, read-only direct conversation for the owner, 320/390/768 without horizontal overflow. Captures `.local/screenshots/messages-live-desktop.png` and `messages-live-mobile.png` reviewed. The first run passed its assertions but left a route handler racing `unroute`; the test now waits for real confirmation and the rerun is the counted pass. |
| Native JVM | **140 passed** across 10 suites, including 18 new `MessagingTest` cases (validation, lost-send retry identity, poll confirmation, definite rejection, gap fill, read only while visible, earlier pages, access loss, delete confirmation, read-only, entry Space, direct choice, session loss, late account response, wire headers/bodies, 512 KiB message-page cap). |
| Native build | Debug app and instrumentation APKs built; lint 0 errors. The one new lint warning (plural candidate) was then fixed in resources; that fix is compiled by the next build. No emulator or device was used; native chat UI is not device-qualified. |

The earlier parallel **task checklist** work (migration `0013`, backend, web, Android) was cross-checked in the same run: its backend cases are inside the 287, its two client/BFF checks inside the 49, `ChecklistTest` (7) inside the 140, and its real browser journey passed again (`.local/checklist-live-web.xml`, 17.8 s).

Not built: end-to-end encryption, device keys, WebSocket/push delivery, offline outbox, edits, reactions, attachments, group chats beyond the one Space chat, and message reporting. Details: [feature ledger](PRODUCT_FEATURES.md#space-chat-and-direct-messages-batch).

## Public Community Checkpoint

Implemented on 2026-09-30 on backend, web and Kotlin Android. Migration `0015` adds public pages, follows, posts, comments, likes, saves, content reports, blocks and a community audit table; the local development database was upgraded from `0014` to `0015` without a reset, and the API was restarted to load the routes.

- **Pages:** create with a unique lowercase handle (reserved words refused), name, topic and description; one owner; at most 5 pages per account locally. Owner edits need the reviewed version (`If-Match`). Signed-out visitors can read active pages.
- **Posts:** drafts are private to the owner; publishing is explicit and version-checked; a publish retry after a lost response changes nothing; edits after publishing set an edited mark; deletion leaves a tombstone and removes the post everywhere. Bounds: 50 drafts, 2,000 posts per page, 5,000 characters.
- **Interactions:** follow, like and save are idempotent set operations with exact counts under row locks (parallel test: 4 people x 2 requests = exactly 4). Comments allow one reply level, keep one copy per retry key, can be deleted by the author or removed by the page owner (shown as such), and are limited to 20 per minute per account.
- **Feeds and discovery:** Home Following (current follows), Latest and Saved, newest first with cursors bound to account, list and 15-minute expiry. Page search matches name, handle or description with `%` and `_` treated literally, ranks by followers, filters by topic.
- **Safety:** reports on pages, posts and comments with fixed reasons, one open report per person and target, 30 per day, durable outbox event; own content cannot be reported. Blocking a page hides it from every feed/search for the blocker and ends following; blocking a comment author hides their comments and stops them commenting on the blocker's pages. Nobody is told. Account IDs are never exposed in public responses; blocks work through the comment.

| Check (2026-09-30) | Result and boundary |
| --- | --- |
| Community backend | 15 passed (validation, idempotent creation, owner-only editing with preconditions, private drafts, publish/delete replay, follow/like/save counts, feed cursors, comments/replies/removal/rate limit, blocks, reports, search escaping and cursor binding, parallel counts, OpenAPI security and no equivalent path templates) plus model/migration parity. |
| Complete backend suite | **302 passed**, 641.5 s, zero failures/errors/skips; `backend/.local/community-backend-20260930.xml`. |
| Web typed client/BFF | **54 passed** (41 existing + 8 messaging + 5 community): reviewed routes only, signed-out public reads forwarded without a session, session bound only with the account header, strict query parameters, schema consistency, retry keys. TypeScript check passed. |
| Live browser/BFF/API/PostgreSQL | **1 passed**, 76.3 s; `.local/community-live-web.xml`. Lost create-page response then exact retry (same key/body), private draft invisible to a signed-out visitor, confirmed publication, visitor sees the post but cannot like, discover search and follow, Home feed, like/save/Saved tab, comment and owner reply, report dialog, block and unblock, 320/390/768 without horizontal overflow. Captures `.local/screenshots/community-live-desktop.png` and `community-live-mobile.png` reviewed. The first run failed on the test's own label lookup for the topic select (option text leaked into the accessible name); the selects now carry explicit names and the rerun is the counted pass. |
| Native JVM | **150 passed** across 11 suites, including 10 new `CommunityTest` cases. Lint 0 errors (11 existing warnings); debug app and instrumentation APKs built. No device or emulator was used. |
| OpenAPI | 29 operations added; no existing path or schema changed; no equivalent templated paths. |

Not built: page editors/roles, media, shares, hashtags, scheduled posts, ranking beyond followers, mutes, moderator review tools, decisions, notices and appeals, and server-side rendering of public pages. Details: [feature ledger](PRODUCT_FEATURES.md#public-community-batch).

## Space Events And RSVP Checkpoint

Implemented 2026-09-30 to 2026-10-01 on backend, web and Kotlin Android. Migration `0017` (after the parallel care migration `0016`) adds events and responses; the development database was upgraded without a reset and the API restarted.

| Check | Result and boundary |
| --- | --- |
| Events backend | 8 passed (validation incl. nonexistent/ambiguous local times, idempotent create, organizer/owner-only edit and cancel with `If-Match`, admission-bound visibility, per-admission responses, reschedule marks earlier responses, parallel responses, OpenAPI). With migrations and identity: 40 passed. |
| Web typed client/BFF | 4 events cases; client suite **58 passed** in total. TypeScript check passed. |
| Live browser/BFF/API/PostgreSQL | `events:` journey: lost create response then exact retry, responses, reschedule asks for re-confirmation, cancellation, 320/390/768 without overflow; `.local/events-live-web.xml`. |
| Native JVM | `EventsTest` 11 passed; all JVM suites **161 passed**, 0 failures. Lint 0 errors (11 existing warnings); debug and instrumentation APKs built. No device or emulator was used. |
| OpenAPI | 12 operations added in this export (6 events, 6 care); none changed or removed. The events schema is named `SpaceEventView` to avoid colliding with the identity `EventView`. |

Not built: capacity/waitlists/guests, check-in, invitations outside the Space, public events, polls, budgets, expenses, recurring events, reminders or agenda entries for events, Android editing of multi-day events, native device qualification. Details: [feature ledger](PRODUCT_FEATURES.md#space-events-and-rsvp-batch).

## Care Checkpoint

The care backend (migration `0016`) comes from a separate care workstream. The web and Android screens were built on 2026-10-01; the owner kept them ([DEC-007](DECISIONS.md#accepted-decisions)). Only the person can see or change their own records.

| Check (2026-10-01) | Result and boundary |
| --- | --- |
| Care backend | `backend/tests/test_care.py` 9 passed with the events tests; the complete backend suite passed **319** (`backend/.local/care-backend-20261001.xml`). |
| Web typed client/BFF | 6 care cases in `tests/care-client.test.mjs` (reviewed routes only, strict parameters, contradictory facts rejected, exact create/report/stop retries); client suite **64 passed**. TypeScript check passed. |
| Live browser/BFF/API/PostgreSQL | `care:` journey passed (`.local/care-live-web.xml`): confirmation required, lost create response then exact retry, day plan, lost dose-note response then exact retry, correction to Skipped (revision 2), another account denied (404) and seeing nothing, stop with confirmation, stale stop refused (412), 320/390/768 without overflow. Captures `.local/screenshots/care-live-desktop.png` and `care-live-mobile.png` reviewed. |
| Native JVM | `CareTest` 10 passed; all JVM suites **171 passed**. Lint 0 errors (11 existing warnings); debug and instrumentation APKs built. No device or emulator was used. |

Not built: caregiver access by grant, notifications at dose times, editing an instruction, stock or refill tracking, photos, native device qualification and approval of the medical, legal and privacy rules (Q12). Details: [feature ledger](PRODUCT_FEATURES.md#care-batch).

The care backend, web client and BFF, live `care:` journey and `CareTest` were rerun independently on 2026-10-01 after the screens were kept: 9 backend care tests, 6 client/BFF cases, the live journey at http://127.0.0.1:3000 and 10 JVM tests all passed, matching the rows above.

## Android Community Response Limits Checkpoint

Fixes [T06](TASKS.md#defects-that-break-approved-requirements): Android refused valid community lists larger than 64 KiB. The shared HTTP client in `IdentityModule` now allows larger responses only for GET lists whose size the backend bounds. Limits count code points, and each can take up to 4 UTF-8 bytes: page names 80, post titles 120, post text 5,000 and comments 2,000.

| Response (GET) | Worst case | Limit |
| --- | --- | --- |
| Feed, latest posts, saved posts, a page's posts (20 posts) | about 430 KB | 512 KiB |
| Comments on a post (50 comments) | about 430 KB | 512 KiB |
| A page's drafts (up to 50) | about 1.07 MB | 1.5 MiB |
| Blocked pages and people (up to 500) | about 250 KB | 256 KiB |
| Single page or post, page search (20 pages of 500-character descriptions), your pages (up to 5), and every write | under 64 KiB | 64 KiB, unchanged |

| Check (2026-10-01) | Result |
| --- | --- |
| Regression first | With the new limits removed, the 2 new `CommunityTest` cases failed (a valid 20-post page of about 400 KB and the per-route boundaries); restored, they passed. |
| Native JVM | All suites **173 passed**, 0 failed, 0 skipped (`CommunityTest` 12). Lint 0 errors (11 existing warnings); debug and instrumentation APKs built. |
| Backend | Complete suite **319 passed** in 1001.5 s on the same source (no backend change). |

Boundary: simulated transport only; no device or live-server run. Web is unaffected because the BFF has no response-size cap.

## API Description Sign-In Checkpoint

Fixes [T08](TASKS.md#defects-that-break-approved-requirements). The generated description did not say that the account and export operations need a signed-in session. The 12 protected routes in `backend/app/modules/identity/api.py` now declare the `AccountSession` bearer scheme without enforcing it themselves. The services still enforce sign-in exactly as before. Only the 6 public operations (registration, email verification, sign-in, recovery, password reset, time zones) declare none.

| Check (2026-10-01) | Result |
| --- | --- |
| Regression first | The new `test_openapi_marks_only_protected_identity_and_export_operations_as_signed_in` failed before the change and passed after. |
| Backend | Identity, migration and delivery suites **39 passed**. A first combined run failed while another session was writing migration `0018` into the same worktree; separate reruns and the rerun on the settled tree passed. |
| Contract | Regenerated `packages/openapi/openapi.json`: 110 operations on 90 paths, and exactly the 6 public operations declare no security. |
| Live | `care:` and `space settings:` journeys passed at http://127.0.0.1:3000 after the API restart. |

The API restart loaded the other session's migration `0018` models while the local database was still at `0017`. The additive migration was applied without a reset, so the local database is at `0018`.

## Web Chat Reliability Checkpoint

Fixes [T05 and T07](TASKS.md#defects-that-break-approved-requirements) in `web/src/features/messaging/messages-screen.tsx`.

- **T05:** an unconfirmed send and its Retry now stay with their conversation for the whole signed-in page session. Switching conversations or leaving the Messages page no longer drops them, and the conversation list marks the chat "Not confirmed" (or "Not sent" after a refused send). Before, the conversation pane was rebuilt on every switch and its unconfirmed sends were lost without warning.
- **T07:** a read receipt that fails is retried on the next poll. Before, the pane recorded the new read position before sending it, so a failed receipt was never sent again.
- **Behaviour change** ([Constitution Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): the Back button no longer asks "Leaving loses the retry for it. Leave anyway?", because leaving no longer loses anything. The browser warning when closing or reloading the tab now covers unconfirmed sends in every conversation, not only the open one. No test depended on the removed prompt.
- **Engineering choice** ([DEC-009](DECISIONS.md#accepted-decisions)): the unconfirmed sends live in memory, keyed by account and conversation. They are not written to browser storage, because that would keep private message text (C11-C03) on the device, which needs a privacy decision. A reload therefore still loses them, as before, and the browser warns first. Every sign-out and account change reloads the page, which clears them.

| Check (2026-10-01) | Result |
| --- | --- |
| Regression first | The 2 new cases in `tests/unit/messaging-ui.test.mjs` failed on the old code at the defect itself (the Retry had gone after switching back; the read receipt was sent only once), then passed after the fix. |
| Web offline components | **29 passed** (5 files; blocked network, zero outbound requests). The new file is part of `npm --prefix web run test:unit`. |
| Web client and BFF | **64 passed**. TypeScript check passed. |
| Live browser/BFF/API/PostgreSQL | `messages:` journey passed at http://127.0.0.1:3000 (`.local/messages-live-web.xml`). |
| Layout | Capture `.local/screenshots/messaging-offline-unconfirmed.png` reviewed: the marker sits beside the conversation name without overflow. |

Boundary: web only. Android keeps its own retry state and already restores its read marker after a failure. No process-death, multi-tab or device run.

## Web Sign-In Limits Per Network Checkpoint

Fixes [T10](TASKS.md#approved-requirements-not-built-yet). Every web sign-in reached the API from the web proxy's own address, so all web users shared one 60-per-15-minutes network bucket. Now:

- The web proxy (`web/src/app/api/[...path]/route.ts`) names the browser's address only on the five sign-in routes, and only when `COMMUNITY_PROXY_KEY` and `COMMUNITY_TRUSTED_PROXY_HOPS` are both set. It takes the entry the outermost trusted proxy added to `X-Forwarded-For`, because Next.js keeps any value the browser sends. It never passes on the browser's own `X-Community-*` headers.
- The API (`backend/app/modules/identity/api.py`) accepts the named address only with the same key, compared in constant time. It counts an IPv4 address, or an IPv6 /64, as one network; an IPv4-mapped IPv6 address counts as its IPv4 address. Otherwise it counts the connecting address. The per-email limits are unchanged.
- Nothing changes locally: both settings are unset, and every browser is `127.0.0.1` anyway.

| Check (2026-10-01) | Result |
| --- | --- |
| Regression first | With the old connection-only rule, the new per-network backend test failed; with the address step disabled, the 2 new proxy tests that expect a named address failed. Both pass with the change. |
| Backend | Identity and delivery suites **28 passed** (2 new tests: separate buckets per named network, IPv6 /64 and IPv4-mapped grouping, wrong key and invalid address fall back to the connection; addresses ignored without a configured key). |
| Web | TypeScript check passed; all web client and proxy tests **67 passed** (3 new in `tests/identity-client.test.mjs`). The proxy at http://127.0.0.1:3000 compiled and served public and sign-in requests. |

Boundary: no live run with a reverse proxy. The shared API was not restarted, because another session's recurring-reminder code and migration `0019` were mid-edit; the next API restart loads this change.

## History Boundary And Late-Save Fixes Checkpoint

Fixes [T02, T03 and T04](TASKS.md#defects-that-break-approved-requirements) in the backend. No API shape changed: the regenerated `packages/openapi/openapi.json` is byte-identical.

- **T02:** history no longer depends on timestamps. Each Space counts its admissions (`spaces.admission_sequence`), each membership keeps its number, and each message and event records how many admissions came before it (`admissions_before`). A member sees an item only if it was made after their own admission. Before, a message or event created in the same instant as a join was visible to the new member.
- **T03:** a direct message and the other person leaving can no longer overlap. A send holds a shared lock on the Space row; admissions, leaving and removal take it exclusively. Before, a send could commit after the other person's leave had committed.
- **T04:** messaging (send, delete, mark read), all 14 community changes, and event create, edit, cancel and respond check the session again just before commit (`IdentityService.signed_in_write`). Before, a session that expired while a change waited for a row lock still saved it. Care writes were reviewed and need no change: after their session check they lock only the caller's own rows, so they cannot wait again.
- **Migration `0018`** numbers existing admissions by join time, the Space creator first on a tie. Each existing message and event counts the admissions that joined strictly before it, but never fewer than its own author's number, so authors keep seeing what they wrote. The development database was upgraded to `0018` without a reset (see the checkpoint above).

| Check (2026-10-01) | Result |
| --- | --- |
| Regression first | The 3 T02/T03 tests failed on the old code: the new member saw a same-instant message, an event read returned 200 instead of 404, and the leave committed during the send. The 3 T04 tests failed with the second session check removed (201, 200 and 200 instead of 401) and pass with it. |
| Migration | `test_admission_sequence_migration_numbers_admissions_and_keeps_same_instant_history_hidden` downgrades to `0017`, adds same-instant rows and upgrades: owner 1, member 2, the member sees neither item, the owner sees both. Migration suite 13 passed. |
| Backend | Complete suite **326 passed, 1 failed** in 922.9 s (`backend/.local/defects-backend-20261001.xml`). The failure was the new page-edit test's wait detection, not the code under test: it polled `pg_stat_activity`, which PostgreSQL snapshots once per transaction, so a request that began waiting after the first poll was never seen. It now reads `pg_locks` for requests blocked by its own lock holder. Then: the care and community files with the other T04 tests **27 passed**; the messaging and events files **24 passed** (`backend/.local/t04-messaging-events-20261001.xml`); with the check removed again, all 3 T04 tests fail. A later complete run passed **366** with no failures ([observability checkpoint](#observability-basics-checkpoint)). |
| Live | `invitations:`, `rejoin:`, `messages:` and `events:` passed at http://127.0.0.1:3000 (`.local/t02-live-web.xml`) against the API running the T02 and T03 code at `0018`. |

Boundary: the shared API started at 02:02, before the T04 change, and was not restarted then because another session's migration `0019` was mid-edit; the scheduling session's restart at 02:43, with `0019` applied, loaded T04. No web or Android code changed.

## Observability Basics Checkpoint

Builds the basics of [T09](TASKS.md#approved-requirements-not-built-yet) (R12). Alerts need agreed targets first (Q19).

- **Request logs:** the API writes one JSON line per request with the time, the request ID, W3C trace and span IDs, method, route template, status, duration and error code. The request ID is the same as the `X-Request-ID` header and the `request_id` in the response. The route template looks like `/v1/conversations/{conversation_id}/messages`, or `unmatched`. An unexpected failure adds only the exception type. Paths, queries, headers, bodies, account data and exception messages are never written.
- **Tracing:** the web proxy starts a W3C trace for every request and sends `traceparent` on both of its API calls. It writes one `bff_request` line with only its trace and span IDs, method, status and duration, including for requests it refuses itself. The API continues a valid incoming trace, or starts a new one when the header is missing or malformed. A trace header sent by the browser is never passed on.
- **Metrics:** `/metrics` gives request counts and a duration histogram by method, route template and status, in the Prometheus text format. It answers 404 unless `COMMUNITY_METRICS_KEY` is set, and then requires that key as a bearer token, compared in constant time. It is not in the API description, and the web proxy does not expose it.
- **Engineering choice** ([DEC-009](DECISIONS.md#accepted-decisions)): only the Python standard library and Node built-ins are used. The backend installs its packages from Debian, so adding OpenTelemetry or a Prometheus client would mean rebuilding the image every session shares. W3C Trace Context and the Prometheus text format let a collector be added later without changing the endpoints.

| Check (2026-10-01) | Result |
| --- | --- |
| Regression first | The 3 new tests in `backend/tests/test_telemetry.py` failed before the change: no request lines, no `metrics_key` setting, no line for an unexpected failure. The new proxy test in `tests/web-client.test.mjs` failed against an in-memory copy of the proxy with the change removed (no `traceparent` sent). All pass after the change. |
| Backend | Telemetry and identity files **26 passed**. Complete suite **366 passed**, 0 failed, 0 skipped in 1440.7 s (`backend/.local/t09-backend-20261001.xml`, started 02:50). It includes the 3 telemetry tests, the 7 T02–T04 regressions and the scheduling session's work at `0019`. |
| Web | TypeScript check passed; all web client and proxy tests **68 passed** (1 new). |
| Real process | A temporary API container on 127.0.0.1:8001 with a synthetic metrics key: a request with a trace header kept its trace ID and recorded the caller's span as parent. `/metrics` answered 401 without the key and 200 with it. A query-string email, a bearer token and the metrics key appeared nowhere in its output. The container was then stopped and removed. |
| Live | After the shared API restart at 02:54 (nothing but this change had been edited since the 02:43 restart), a request through the web proxy at http://127.0.0.1:3000 produced an API log line whose parent span came from the proxy. The proxy still answered a public route (200) and a signed-out request (401) correctly. |
| Contract | A fresh export equals the committed `packages/openapi/openapi.json` (119 operations); `/metrics` and the health routes are not in it. |

Boundary: there is no collector, dashboard, alert or log retention policy. Metrics live in each process and reset on restart. Workers keep their count-only lines and do not continue traces. Android sends no trace header, so the API starts one for it. Uvicorn's own traceback for an unexpected failure is unchanged, and it can include the exception message on the error stream.

## Personal Data Export Verification Checkpoint

The backend export code (`backend/app/modules/identity/exports.py`, five operations under `/v1/me/exports`) handles personal data but had no behaviour tests. This checkpoint verifies it under R12; export itself is still only proposed (P11), so no feature was added and the ledger row stays `U`. No product code changed.

`backend/tests/test_exports.py` adds 6 tests against the real API and PostgreSQL:

- **Recent sign-in and one request at a time:** a session older than 15 minutes gets 403. The same key returns the same export, a changed request with that key gets 409, and a second export while one is queued gets 409.
- **Only the person's own data:** a member's archive has their own profile and only the tasks they can see. It excludes a task created before they joined and every other person's email.
- **Download:** only in the session that asked for it. Another session of the same account gets 403, and another account gets 404. Each download is counted and recorded as a security event, and the stored archive is encrypted.
- **Access changes:** leaving the Space withdraws a ready archive (409) and deletes it.
- **Cleanup:** sign-out cancels queued and ready exports and deletes their archives. The worker cancels an export whose session ended before it was built, and archives are deleted after 24 hours.
- **Cancellation:** a cancelled export is never built or downloadable.

| Check (2026-10-01) | Result |
| --- | --- |
| New tests | **6 passed** on the unchanged code. |
| Defects injected | Removing the session binding, the access recheck or the visibility filter in `exports.py`, one at a time, each failed exactly the test written for it; the file was restored unchanged after each run. |
| Complete backend | **372 passed**, 0 failed, in the run started 03:01 at migration `0019`, including these 6 tests. |

Boundary: no export worker is configured in Compose and there is no web or Android client, so nobody can use exports yet. Deletion is not built.

## Repeating Reminders, Snooze And Planned Times Checkpoint

Builds [T19, T20 and T21](TASKS.md#scheduling) under [DEC-010](DECISIONS.md#accepted-decisions) on backend, web and Android. Everything stays in-app; nothing leaves the local stack.

- **Repeating reminders:** `reminder_series` stores the rule: every 1–30 days, or chosen weekdays every 1–4 weeks, one clock time, a named timezone, a first and a last day. Only the next time is a real reminder. When the worker delivers it, the same transaction schedules the following one, under a key derived from the series and the date, so a retried step cannot create a second copy. The preview returns the first 10 times, the total and any clock changes, sealed in a 5-minute preview token; saving needs `Idempotency-Key`. Pause, resume, skip and cancel need `Idempotency-Key` and `If-Match` (the series ETag also covers the task's version and title) and keep receipts, so a retry after a lost response returns the first result.
- **Clock changes:** when the clock skips the time, the reminder comes just after the jump, or that day is skipped if the person chose that; a time that happens twice reminds once, the first time. The preview names the affected days.
- **Downtime:** after an outage at most one late reminder is delivered, within 24 hours of its time or before the next time, whichever is sooner. Older missed times are marked expired and the next future time is scheduled, so there is no burst.
- **Task changes:** the existing rule (Q18) is kept. Changing or closing the task pauses the series at its next time (`task_changed`, `task_closed`), and resuming confirms the task as it is now. Losing access, an inactive account or turning reminders off stops the series.
- **Snooze:** `POST /v1/notifications/{notification_id}/snooze` with 10, 60, 180 or 1440 minutes creates one follow-up reminder and marks the notification read; a chain holds at most three snoozes and never reaches past the series' next time. Acknowledging any reminder in a chain acknowledges the delivered ones and cancels a waiting follow-up. Cancelling a series time as a plain reminder is refused (409 `USE_SERIES_ACTIONS`).
- **Calendar:** active series add `planned` entries, computed for the requested range and never stored, merged into the calendar's existing order and paging.
- **Export:** the personal archive includes series and the new reminder fields.
- **Migration `0019`:** three tables and four reminder columns with constraints. Downgrading refuses while any series or follow-up exists, so nothing is dropped silently.
- **Engineering choice** ([DEC-009](DECISIONS.md#accepted-decisions)): the rule engine uses Python's `datetime` and `zoneinfo` with tzdata and supports only the rule shapes above, not RRULE text. No package was added, because the shared backend image installs from Debian; choosing a maintained recurrence library stays open (C13-D02).
- **Web:** a Repeat choice on the reminder form; a review of the first times with the clock-change choice; a repeating reminders list with skip, pause, resume and cancel dialogs; a snooze dialog in the inbox; planned rows in the calendar. Every save and change keeps its original request for Retry.
- **Android:** the same flows in the reminder screen and inbox, and planned rows in the calendar. Found while building: the Android calendar refused any entry kind except `task` and `reminder`, so a single active series would have broken it ("The calendar could not be confirmed"). It now accepts `planned` and checks the server's order.
- **Found during verification:** the web reminder screen never showed the new form and list; only their imports had landed, and the type check does not flag unused imports. The first live run failed because the Repeat control was missing; the screen was wired up and the run passed.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | New `backend/tests/test_reminder_series.py` **34 passed**: rules, clock gaps and repeats, catch-up after downtime, previews, 14 invalid inputs, idempotent save, overlap with one-time reminders, delivery continuation, commands and receipts, task change and resume, permissions, access loss, limits, calendar paging, snooze chains and limits, and the migration's refusal. Related scheduling, task, migration and delivery files **147 passed**. Complete suite in the run started 04:03 (1286.2 s, `backend/.local/scheduling-backend-20261001.xml`): **373 passed, 12 failed** of 385. All 12 failures are in `backend/tests/test_space_directory.py`, the Spaces session's new, untracked tests for [T22](TASKS.md#spaces); their routes (`/v1/discover/spaces`) and migration `0020` did not exist yet. Every scheduling-related file passed: series 34, delivery guards 67, tasks 62, migrations 13. |
| Contract | Regenerated `packages/openapi/openapi.json`: 119 operations (9 new), all changes additive. |
| Web | TypeScript check passed. Web client and proxy tests **75 passed** in 7 files (`tests/scheduling-client.test.mjs` is new, with 6). Offline browser tests **29 passed**; their fixtures now answer the new list request, and no assertion changed. |
| Live | `tests/e2e/scheduling.test.mjs` **passed** in 145 s at http://127.0.0.1:3000 against the API, database and reminder worker at `0019` (`.local/scheduling-live-web.xml`). A daily series was saved through a lost response and exactly one exists. The calendar API and screen show its reminder and 6 planned times; another account gets 404. The worker delivered it within 120 s of its time. A 10-minute snooze through a lost response created one follow-up, and "1 day" was disabled because the next time comes first. Skip, pause, resume and cancel worked through their dialogs, and a stale ETag got 412. No page errors, nothing in local storage, and no horizontal overflow at 320, 390 and 768 px. The screenshots `series-review-live-desktop.png`, `series-calendar-live-desktop.png`, `series-snooze-live-mobile.png` and `series-list-live-mobile.png` in `.local/screenshots/` were reviewed. |
| Android | Complete JVM suite **186 passed** in 13 classes, including 13 new tests: series preview, save, list and command checks, snooze, follow-up kinds, the real Retrofit route and headers, the retry identity and confirmations in the ViewModel, and planned calendar entries. Lint 0 errors; debug, test and release builds passed (`.local/android-scheduling-gates.txt`). |

Boundary: Android was not run on an emulator or against the live API in this checkpoint, so its screens are verified by compilation, lint and JVM tests only. There is no push or other channel. Editing a saved series, other exceptions and repeating requests for another person are not built (T28).

## Public Post Search Checkpoint

Builds [T29](TASKS.md#approved-requirements-not-built-yet) under R4 ("The public side has posts, comments, reactions, follows, discovery and search") on backend, web and Android. Before this, only public pages could be searched.

- **Backend:** `GET /v1/discover/posts` takes an optional `q` of up to 80 characters. Spaces are collapsed, and matching is case-insensitive over the post's title and text. `%`, `_` and `\` match only themselves, through the helper page search now shares. Only published posts on active pages match, and blocked pages stay hidden. The order stays newest first with the post ID as tiebreaker. A search cursor has its own kind and is bound to the lower-cased words, so a cursor cannot be reused for other words or for Latest, and a Latest cursor cannot be used for a search (400). Without `q`, the list is unchanged.
- **Engineering choice** ([DEC-009](DECISIONS.md#accepted-decisions)): page names are not matched, so a page's name does not pull in all its posts; page search already covers names. There is no index for these queries; a full-text index waits for the search engine choice (PROPOSED in Chapter 15).
- **Web:** Discover has a Pages / Posts choice. Posts results use the standard post card with like, save, comments and report. The topic filter shows only for pages. The web proxy now forwards `q` on `discover/posts` only. The client sends the trimmed, collapsed words, cut to 80 characters.
- **Android:** Discover has the same Pages / Posts choice, kept when you go back to Discover. The repository sends the same normalized `q`, and the standard post items with like, save and report show the results.
- **Changed test** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): `tests/community-client.test.mjs` expected the proxy to refuse `discover/posts?q=x`. R4 (search) changes that behaviour. The check now expects `q` forwarded there. It still refuses `topic` on that route and `q` on the feed, page posts and, newly checked, saved posts.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | New test `test_post_search_matches_published_public_text_literally_with_bound_cursors` failed first (the words were ignored), then passed. `backend/tests/test_community.py` **17 passed**. With the wildcard escaping removed, the test failed at the `%` search; with the cursor unbound from the words, it failed at the cursor check. Both were restored. Community, identity, care, events and messaging, which include the API description checks, **73 passed**. Complete backend run started 04:42 at `0019` (716 s, `backend/.local/post-search-backend-20261001.xml`): 386 tests, **372 passed**, 14 failed. All 14 are group Spaces tests written before their code (T22 in progress): 12 in `test_space_directory.py`, 1 in `test_migrations.py` and 1 in `test_spaces.py`. They expect a Space description, the `group` type and directory routes, which are not in the code yet. Every other file passed, including the 17 community tests. |
| Contract | Regenerated `packages/openapi/openapi.json`: `/v1/discover/posts` lists `q` (max 80), `limit` and `cursor`; still 119 operations on 98 paths. |
| Web | The two new checks failed first (proxy 400; `searchPosts` missing). TypeScript check passed. Web client and proxy tests **75 passed**, 0 failed. |
| Live | After the API restart at `0019`, `post search:` and `community:` **both passed twice** at http://127.0.0.1:3000 (`.local/post-search-live.txt`). A signed-out visitor searching the word in capitals with spaces found only the published post, not the draft; `word%` found nothing. The owner's own search did not return the draft. A signed-in reader liked and saved from the results. There was no horizontal overflow at 320, 390 and 768 px, Pages brought back the topic filter, and there were no page errors. The first `community:` attempt timed out on its first page load while the changed files compiled, and it passed on both reruns. Screenshot `.local/screenshots/community-post-search-mobile.png` was reviewed. |
| Android | JVM **188 passed**, 0 failed, 0 skipped. That includes 2 new `CommunityTest` cases: the Discover mode in the ViewModel, and the normalized `q` on the real Retrofit route. With the query dropped in the repository, both failed (14 run, 2 failed); after restoring, 188 passed. Lint 0 errors, 11 warnings; debug and test builds passed (`.local/android-post-search.txt`). |
| Android device | New `CommunityScreenTest` **3 passed** on the read-only emulator `community_membership_20260923` (port 5582, Android 16, airplane mode on, Wi-Fi off), with fixed synthetic state and no network. Post search shows its results without the topic filter; switching back to Pages brings back the filter and page results; empty results say whether the words matched nothing; at 320 dp with 200% text, the choice, field, button and result stay inside the screen (`.local/screenshots/community-post-search-android-large-text.png`, reviewed). With the topic filter wrongly shown during post search, 1 of 3 failed; after restoring, 3 passed (`.local/community-screen-device.txt`). The emulator was stopped afterwards. |

Boundary: the Android screens were run on an emulator with fixed state, but not against the live API. Relevance ranking, typo tolerance, highlights and comment search are not built.

## Live Cross-Check And Account Form Fix Checkpoint

All live web journeys ran in one sequential sweep at http://127.0.0.1:3000 against the shared API, database and workers at `0019`. The API had run unchanged since 03:38, and no backend or web code changed between 03:39 and the sweep.

- **Sweep 07:59–08:15** (977 s, `.local/live-sweep-20261001.txt` and `.xml`): 21 journeys, **20 passed**, 1 failed. The passing ones cover checklists, solo Spaces, Space settings, the calendar, mobile sign-up, Spaces, invitations, ownership transfer, member removal and leaving, rejoining, tasks, reminders with a real worker delivery, reminder requests, chat and direct messages, the public community, post search, events, care and repeating reminders. The failure was `desktop:` at account recovery: after "Send verification code", "Choose a new password" never appeared. It failed again when run alone.
- **Cause**, found by replaying the journey in a browser and recording every `/api` request: the account forms are rendered on the server, and the journey reached the form before React was running.
  1. A click on Send at that point submitted the form natively. The form had no method, so the browser sent a GET and reloaded the page with the fields in the address, for example `/recover?email=...`. With JavaScript off, Enter on the sign-in form produced `/login?email=...&password=...`, so a password could reach the address bar, browser history and server logs.
  2. Text typed at that point was replaced by the form library's empty starting value when React started, so the later Send failed validation silently ("Enter a valid email address." under an empty field). The API log shows no recovery request at all.
- **Fix** ([T30](TASKS.md#defects-that-break-approved-requirements), R12): in `web/src/features/identity/auth-screen.tsx` the form posts, and the email and password fields, the show-password button and the submit button stay disabled until the page is interactive. A native POST to `/login` with synthetic credentials returned the page without echoing them.
- **Not caused by this work:** a second sweep stopped early because the group Spaces session (T22, in progress) changed `web/src/features/spaces/settings.tsx` at 09:03, during the run. The Space settings button is now "Save changes" instead of "Save name", so `solo:` and `space settings:` fail until that session updates them. T22 says it keeps every current test. The `checklist:` failure in that sweep came while those files recompiled and three backend test runs held the CPU near 90%; it passed when run alone.

| Check (2026-10-01) | Result |
| --- | --- |
| New live test | `auth forms:` loads `/login`, `/register` and `/recover` with JavaScript off. It checks the POST method, that the fields and button are disabled, and that Enter leaves nothing in the address. It **failed before the fix** (method missing). With only the method restored, it failed again (button enabled) and `desktop:` failed at recovery again. With the full fix, `auth forms:`, `desktop:` and `mobile:` **passed**. |
| Web | TypeScript check passed. Offline component tests **29 passed**; the account form fixture renders in the browser, so its controls are enabled at once. Web client tests **75 passed**. |

## Android Post Editing Checkpoint

Builds [T31](TASKS.md#approved-requirements-not-built-yet) under R4. Android could publish and delete a page's posts but not edit them, although the web could.

- **Edit in place:** owned drafts and published posts on a page get an Edit action that opens the title and text where the post is. A published post says that saving changes the public post and marks it as edited.
- **Safe saves:** Save sends the reviewed version (`If-Match`), so a post that changed elsewhere is refused (412) rather than overwritten. The editor keeps the person's text until the server confirms the change, an unchanged post sends nothing, and a cleared title is sent as `null` so it is really removed. The result must be the same post, with the same status, still owned by the person.

| Check (2026-10-01) | Result |
| --- | --- |
| Android JVM | **190 passed**, 0 failed, 0 skipped, including 2 new `CommunityTest` cases: the ViewModel keeps the text through a refused save and sends the same request again, and the real Retrofit route carries `If-Match` and `{"title":null,...}` and rejects a mismatched result. With the editor closed before confirmation and the result check removed, both failed (16 run, 2 failed); after restoring, 190 passed. Lint 0 errors, 11 warnings; debug and test builds passed (`.local/android-post-edit.txt`). |
| Android device | `CommunityScreenTest` **4 passed** on the read-only emulator, offline, including the new edit test: Edit opens the prefilled editor, Save hands over the reviewed text, Cancel closes it (`.local/android-device-community-20261001.txt`). In the same session the other five offline screen classes passed **38 of 38** in 307 s: identity screens, keystore session, tasks, reminders and Spaces, with the font scale restored to 1.0 (`.local/android-device-others-20261001.txt`). That makes **42 of 42** offline Android screen tests on a device on 2026-10-01. A first attempt at all 42 together stopped after 2 passed when the emulator crashed while other sessions' test runs held the CPU near 90%; the classes were then run in two batches. |

Boundary: not run against the live API on a device. Post revision history is not built.

## Encryption Key Rotation Checkpoint

Builds [T11](TASKS.md#approved-requirements-not-built-yet) (R12) on the backend. Before this, every encrypted value depended on the one key in `backend/.local/identity.key`, and there was no way to replace it.

- **Key file:** it can now hold several encryption keys, the primary one first, and a separate lookup key. New values are written with the primary key, and older values still open with the others. The existing single-key file keeps working unchanged. Converting it keeps the lookup key that file always produced, so email lookups, sessions and repeated-request checks are not affected. The API and both workers load the file when they start.
- **Procedure:** `python3 -m app.modules.platform.keys` with `status`, `add`, `promote`, `reencrypt`, `verify`, `retire` and `restore` ([procedure](../backend/app/modules/platform/README.md#encryption-key-rotation)). `reencrypt` covers all six encrypted columns in batches. It changes a row only if the row still holds the value it read, and keeps the content and original timestamp. `retire` is refused for the primary key, for 24 hours after a key stops being primary, and while any stored value still needs the key. The key is written to an archive and read back before it leaves the file. Every write is refused if the key file changed while the command ran.
- **Safety:** reports show key IDs and counts, never key material. Files are owner-only and replaced in one step. A write that would drop a key without archiving it, or change the lookup key, is refused. A damaged key file stops the command and the services; it is never replaced with a new key.
- **Engineering choices** ([DEC-009](DECISIONS.md#accepted-decisions)): `MultiFernet` from the `cryptography` package the backend already uses; no new dependency. The lookup key is not rotated, because sessions are stored only as digests, so changing it would sign everyone out. The 24-hour wait is a wide margin over the longest-lived token held by clients, a 15-minute list cursor. Production key custody stays open ([C11-D08](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md)).

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | New `backend/tests/test_key_rotation.py`, **6 passed** on the final code. A single-key file converts without changing lookups or the original key derivations, and every `*_cipher` column in the schema is covered. A full add, restart, promote, restart, re-encrypt, verify, retire and restore cycle keeps a session signed in and sign-in working, and keeps a care instruction, a message, an export archive and a pending registration readable; a token sealed with the retired key stops opening, and opens again after restore. A value changed during re-encryption is not overwritten, and a key added while `retire` runs is not lost. The command prints no key material, and refuses damaged or wrong input without changing files. An earlier version of the rotation tests with the identity, messaging and restore drill files: **47 passed**. |
| Defects injected | Eight defects, loaded one per run by a local test-only plugin, with no source file changed (`backend/.local/t11-defects-20261001.txt`): an unconditional rewrite, no 24-hour wait, no check before retiring, a conversion that changes the lookup key, a changed lookup derivation, a message cipher that knows only the primary key, a skipped archive, and a write that ignores a changed key file. Each made 1 or 2 of the 6 tests fail, including the test written for it. A changed lookup derivation passed the full cycle, because it was consistent within one run; only the compatibility test caught it. |
| Complete backend | Run started 09:07 at migration `0022`: 403 tests, **402 passed, 1 failed** in 3,335 s, with other sessions' emulator and builds holding the machine at 100% CPU (`backend/.local/t11-backend-20261001.txt`). The failure was `test_separate_worker_process_recovers_persisted_due_work_without_duplicate`: its separate worker process did not finish within the test's 20 s limit. Run alone at 37% CPU, it passed in 12.9 s. That run collected an earlier version of the rotation command and its tests. They changed afterwards, and are covered by the 6 passes above. |
| Development data | Read-only `status` and `verify` against the shared development key file and database, with no key material printed. The single-key file opened all 443 stored values: 202 account emails, 218 challenge emails, 9 care instructions and 14 messages. None were unreadable. Nothing was rotated. After another session restarted the shared API and reminder worker at 09:47, the API started on this code with the same key file and answered `/health/ready` with 200. |

Boundary: no rotation was performed on the development key, because each step needs a restart of the API and workers that other sessions share. There is no live reload. The restore drill checked only identity data until T44 ([checkpoint](#reminder-fairness-and-restore-coverage-checkpoint)); restoring a backup made before a rotation needs its retired key brought back with `restore`. There is no KMS, and the lookup key is never rotated.

## Background Work Metrics Checkpoint

Builds [T32](TASKS.md#approved-requirements-not-built-yet) (R12, gap G3). Before this, `/metrics` counted only HTTP requests, so a stopped or slow worker was invisible: due reminders, sign-in codes and exports simply waited.

- **Gauges:** for each queue (`identity_mail`, `reminders`, `exports`), `community_work_ready` counts the items its worker would take now, `community_work_ready_oldest_seconds` gives how long the oldest has waited, and `community_work_failed` counts items that ended in failure: undeliverable or unconfirmed sign-in mail, reminders whose dispatch failed 5 times, exports that failed to build. `community_work_query_success` is 0 when the database cannot be read; the request metrics are still returned.
- **Same rules as the workers:** "ready" uses each worker's own selection, so a reminder waiting out a retry is not counted until its retry time, and its wait counts from that time; an export whose build lease ran out counts from the end of the lease. For reminders this is the wait before the worker takes the item, not delivery time ([C10](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md) keeps those separate).
- **Read at scrape time:** the values come from the database, so they survive worker restarts and need no change to the workers. The query has a 2-second limit. Labels are fixed queue names; no identifiers, addresses or content appear.
- **Engineering choice** ([DEC-009](DECISIONS.md#accepted-decisions)): reading the database instead of collecting counters inside each worker, because a stopped worker cannot report that it stopped. Every API process reports the same values.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | New `backend/tests/test_work_metrics.py` with the existing telemetry tests: **7 passed**. The tests drive the real workers: sign-in mail sent, retried and failed; reminders made due, failed five times through the real dispatch-failure path, held for a retry and dispatched; exports queued, rebuilt after an expired lease and failed after three attempts. Each time, the gauges equal what the worker then processed, with the exact wait in seconds. A scrape with the database unreachable still answers 200 with the request metrics and `community_work_query_success 0`. |
| Defects injected | Six defects, loaded one per run by a local test-only plugin with no source file changed (`backend/.local/t32-defects-20261001.txt`). Without the gauges (the old behaviour) all 4 new tests fail. Counting reminders still waiting for a retry, measuring their wait from the scheduled time, missing abandoned export builds, counting mail not yet due, and letting a database error escape each failed exactly the test written for it. |
| Real process | A temporary API container on 127.0.0.1:8001 with a synthetic metrics key, reading the development database: all ten work lines present, nothing waiting or failed, `community_work_query_success 1`, and no `@` anywhere in the output. The container was then stopped and removed; the shared API was not restarted. |
| Complete backend | Run started 11:07 at migration `0022`: **408 passed**, 0 failed, 0 skipped in 779 s (`backend/.local/t32-backend-20261001.txt`), including the 4 new tests and the final 6 key rotation tests. |

Boundary: no alert uses these gauges yet (targets, Q19), and there is no collector or dashboard. The event and dose alerts from migration `0021` are settings worked out when read, not queued work, so they have no backlog to report. A new worker queue needs one more definition in `work.py`. Traces still stop at the API.

## Agent Backend Checkpoint

Builds [T33](TASKS.md#approved-requirements-not-built-yet) under [DEC-012](DECISIONS.md#accepted-decisions), which a session decided provisionally under the owner's delegation and which still waits for the owner's review (conflict [C11](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository)). The rule-based parser, tool list and agent models were already in the repository but nothing used them. They now run end to end on the backend, with no AI model.

- **What a person can do:** in one Space, ask in plain words. The agent can list the tasks they can see, add a task, mark a task done, set their own one-time reminder for a task, and remember a short note or their usual reminder time. Health and medicines, contacting anyone, reminding other people, money, changing members, deleting things and sensitive notes are refused, and the refusal changes nothing.
- **Nothing changes without approval:** every change is shown first as exact fields (for example Title, Due date, Assigned to; or Task, When, Time zone, Who). It runs only after the person approves that exact version (`If-Match` on the approval), through the same task and reminder services as the screens, with one effect key per approval. Approving twice, approving after a change to the task, or approving after 15 minutes does not run it again or run it late. Reject and Stop change nothing.
- **Questions:** an unclear assignee or task gets a numbered choice; a missing time is asked for. After four questions in one request, unreadable answers end the request ("Nothing was changed") instead of keeping it open.
- **Privacy:** requests, answers and approvals belong to the person and to their current membership; after leaving and rejoining, the earlier requests are gone for them. Memories are per person, saved only after approval, and deleted at once.
- **Limits:** 100 requests a day, 50 notes, 10 tasks or memories listed in an answer (the rest are counted), history pages of at most 50.
- **API:** 10 operations under `/v1/agent-runs`, `/v1/agent-approvals`, `/v1/agent-memories` and `/v1/agent-tools`, all requiring sign-in. Migration `0023` adds 5 tables.
- **Engineering choices** ([DEC-009](DECISIONS.md#accepted-decisions)): one person's agent changes run one at a time under a per-person database lock, taken before any agent row is locked, so the daily limit, request keys, the note limit and the default reminder time cannot be passed by parallel requests. The account row is not used for this, because approving calls the task and reminder services, which lock it in their own transactions.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | `tests/test_agents.py`: **19 passed** in 48.2 s. They cover the 7 refusals, exact approval (missing and stale `If-Match`, retry with the same key, a second decision refused), the assignee question, a task changed after the proposal, a reminder that asks for the time, existing reminders, memories used as the default time and deleted, reject, stop, expiry, privacy, membership change, the task list, sign-in on every operation, unreadable answers stopping after four questions, two approvals racing for the last note slot, three parallel retries of one request, and an answer listing 10 of 12 memories. |
| Defects injected | Nine defects, loaded one per run by a local test-only plugin with no source file changed (`backend/.local/t33-defects-20261001.txt`, `backend/.local/t33-defects-followup-20261001.txt`). Ignoring the approval version, approving twice, ignoring expiry, completing a changed task, keeping history after leaving, not refusing a health question, endless questions and listing every memory as evidence each made exactly the test written for it fail. Without the per-person lock, two tests failed: the second approval took a 51st note slot, and three parallel retries of one request no longer produced exactly one request. |
| Found and fixed while checking | Unreadable answers could keep a request open forever, each adding to its history; parallel approvals could pass the 50-note limit; parallel retries of one request could fail on the database's uniqueness check instead of returning the saved request; and a memory answer recorded every memory as evidence while showing only 10. |

Live since about 14:40: another session upgraded the development database to `0024`, which includes `0023`, and restarted the shared API. Signed-out requests to the agent routes are refused (`401 AUTHENTICATION_REQUIRED`). The generated [OpenAPI](../packages/openapi/openapi.json), regenerated by another session at 13:48, includes the 10 agent operations. The web screen is now linked and verified against this API ([T34, checkpoint](#agent-web-screen-checkpoint)), and so is Android ([T35, checkpoint](#android-agent-checkpoint)). Both stay subject to the owner's review of DEC-012.

## Reminder Fairness And Restore Coverage Checkpoint

Fixes two audit defects ([T43 and T44](TASKS.md#defects-that-break-approved-requirements)); neither needs a decision.

- **T43, reminders (R9):** each pass of the reminder worker took the 20 oldest due reminders in the same order. A reminder whose account was locked answered "busy" and stayed first, so 20 of them could stop every other account's reminders for as long as the locks lasted. Now a locked account's reminder does not use a place in the pass: the account is skipped for the rest of that pass, so its own reminders keep their order, and the pass reads further due reminders oldest first, at most 5 pages of the batch size. Nothing about a reminder changes, and the lock order is the same.
- **T44, restore (R12):** restore verification decrypted only the three identity columns, so a restore with unreadable chat messages, care instructions or export archives was reported as good. It now checks every encrypted column with the key rotation's own list and ciphers (messages use their derived key), so a column encrypted later is checked automatically, and a keyring file with several keys is accepted.

| Check (2026-10-01) | Result |
| --- | --- |
| T43 tests | New `tests/test_reminder_dispatch_fairness.py`: an account with the three oldest due reminders is held locked while a pass with a batch of 2 runs. With the fix: `{"busy": 1, "available": 1}`, the other account's reminder is delivered, and after the lock ends the locked account's three arrive oldest first over two passes. The same test with the old pass restored by a local test-only plugin fails with `{'busy': 2}` (`backend/.local/t43-defects-20261001.txt`). With every reminder delivery, repeating reminder, alert and work metric test: **118 passed** in 830 s. |
| T44 tests | New test in `tests/test_restore_drill.py` with a care instruction, a chat message and a finished export: all six encrypted columns are checked and readable, and a message re-encrypted with another key is reported as 0 of 1 readable. With the key rotation tests: **12 passed**. With the old three-column check restored by a local plugin, only the new test fails (`backend/.local/t44-tests-20261001.txt`). |
| Restore drill | `scripts/restore-drill.ps1` at migration `0022`: **PASS**, 54 tables and 6,015 rows matched; with the recorded key 320 account emails and lookups, 337 challenge addresses, 20 chat messages and 15 care instructions opened, and a fresh control key opened none; recovery 21.2 s; the disposable project was removed (`.local/restore-drill/20261001T075945Z`). The local data had no export archives or pending mail payloads at the time, so those two columns had 0 rows there; the test above covers an archive. |

Live since 14:17 IST: the shared reminder worker was restarted to load this change, after a read-only comparison showed that every table it reads matches the current code (the development database lacks only the new agent and document tables) and no live journey was running. It started cleanly and kept running.

## Export Omissions Checkpoint

Fixes [T45](TASKS.md#defects-that-break-approved-requirements) (R12, audit B09). Each of the nine histories in a personal data export (sessions, security events, invitations, ownership transfers, reminders, reminder requests, notifications, repeating reminders and backup contacts) stopped at 1,000 rows without saying so. The bound stays, so a long history cannot push an archive past its 5 MB limit and make the whole export fail; each list keeps its order. When a history holds more, the archive's new `omitted` list names it with the number included, its total and which end was kept (the newest for sessions and security events, the oldest for the others), and the notice says each history holds at most 1,000 entries. The total is counted in the same snapshot the archive is built from.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | New test in `tests/test_exports.py`: an account with 1,004 security events gets the newest 1,000, without the oldest, and `omitted` reads `security.events`, 1,000 of 1,004, newest kept. An ordinary archive has an empty `omitted`. With the identity tests: **30 passed**. With silent cutting restored by a local test-only plugin, only the new test fails (`backend/.local/t45-tests-20261001.txt`). |

Not changed: whether to finish exports with a worker and screens is the owner's decision on P11; exports still have no client and no configured worker. The generated [OpenAPI](../packages/openapi/openapi.json), regenerated by another session at 13:48, includes the archive's `omitted` field.

## Design Tokens Single Source Checkpoint

Builds [T36](TASKS.md#design-and-experience) under [DEC-013](DECISIONS.md#accepted-decisions), provisional when this was built and confirmed by the owner later on 2026-10-01. Before this, `packages/design-tokens/tokens.json` existed but nothing read it: the web stylesheet and the Android theme each copied its colours by hand, under different names, and both used three colours the file did not have.

- **One source:** `tokens.json` now also holds the white surface, the input border colour and the placeholder colour that both apps already used. `npm run tokens` writes `web/src/app/design-tokens.css` (CSS variables such as `--color-primary`, `--space-unit`, `--radius-control` and `--target-minimum`) and `android/app/src/main/java/com/community/platform/DesignTokens.kt` (Kotlin constants such as `DesignTokens.Primary`). Both files say they are generated.
- **Web:** `globals.css` imports the generated file first. Its older names (`--ink`, `--green`, `--line` and the rest) now point at the generated variables, so the feature styles keep working unchanged. The body font, focus outline, input border, placeholder, brand mark text, dialog corners and the 44 px icon, text-button and link targets use the generated values.
- **Android:** `CommunityTheme.kt` builds the Material colour scheme and letter spacing from `DesignTokens`; the hand-typed colours are gone.
- **Check:** `npm run check:tokens` and `npm run test:tokens` fail when a generated file is out of date, when `globals.css` or `CommunityTheme.kt` types a token colour by hand (including `#fff`, `white` and `Color.White` for the white surface), when the font name appears outside the `@font-face` rule, or when a text colour pair falls below 4.5:1 or the focus colour below 3:1. They also refuse token files the generators cannot use safely, such as a font name containing quotes.
- **Engineering choices** ([DEC-009](DECISIONS.md#accepted-decisions)): a Node script with no new dependency, in the style of the feature catalog script; the generated files stay in the source tree next to the code that uses them, so neither app's build needs Node; the older web variable names stay as aliases instead of renaming every feature style in one change.

| Check (2026-10-01) | Result |
| --- | --- |
| Token tests | `node --test scripts/design-tokens.test.mjs`: **7 passed**. Negative controls in the tests: a colour typed by hand in either file, the font name copied into the body rule, a changed token value (both generated files reported out of date), a colour that breaks contrast, and an unusable token file are each reported. `npm run check:tokens` passes. |
| No visible change | Every computed style from the old and the new stylesheet, compared in headless Chromium with all network requests blocked: one element per class (60 classes) with typical children, plus focus outlines and placeholders, at 1280 px and 375 px and with reduced motion. **1,922,926 values on 3,705 elements, 0 differences** (`.local/t36/style-compare.json`). Only the running spinner's angle was left out, because it depends on the moment it is read. A one-step change to the input border colour in a test copy produced 4,416 differences, so the comparison catches a real change. On the live preview at http://127.0.0.1:3000/login the generated variables load, and the brand, input border, placeholder, button and font values equal the originals. |
| Web component tests | The five offline browser test files, which bundle `globals.css` with its new import: **29 passed**, 0 failed (`.local/t36/web-unit.txt`). |
| Android | The shared Android tree did not compile at 12:20 for a reason outside this task: `feature/planning/CalendarScreen.kt`, changed at 10:08 by other calendar work, uses `calendar_event_zone` and `calendar_open_events`, which are not in `strings.xml`. The compiler reported only those two errors. A source-only copy of the Android project, identical in the theme and token files, with those two strings added in the copy only, compiled: `:app:compileDebugKotlin` **BUILD SUCCESSFUL** (`.local/t36/android-copy-compile.txt`). Not run on a device; the colours keep their values. |

Contrast of the shipped colours: text pairs from 5.10:1 (muted text on the page background) to 13.06:1 (ink on white), and the focus colour 4.57:1 on the page background. Two shipped colours are below their targets and are left for T37, because changing them changes the screens: the input border on white is 1.98:1, where the outline that marks an input needs 3:1, and the placeholder on white is 3.68:1, where text needs 4.5:1. The test lists both and fails once they pass, so the list stays current. Both were fixed by T37 (next checkpoint), which replaced that list with the normal contrast checks.

Boundary: the feature stylesheets still hold their own colours, corner sizes and spacing (for example `#c9d3cc`, `#52615a`, an 8 px input corner in events, and 7 px and 9 px gaps), and the Android screens still type their own `6.dp` corners and spacing; T37 moves them to tokens one named change at a time. There is no shared text-size scale yet: web headings use 36 px and 19 px, while Android uses Material's default sizes.

## Input Contrast And Feature Styles Checkpoint

First part of [T37](TASKS.md#design-and-experience) under [DEC-013](DECISIONS.md#accepted-decisions), which the owner confirmed on 2026-10-01. Changed behaviour, named as [Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour) requires: how these screens look, not what they do. No text, size, spacing or layout changed.

- **Input contrast:** the input border colour goes from `#acbcb3` (1.98:1 on white) to `#7d8e85` (3.45:1 on white, 3.24:1 on the page background), and placeholder text from `#798980` (3.68:1) to `#66786f` (4.69:1). Every web input, and the Android outline colour used by outlined text fields and buttons, follow because they read the token. The care and events forms drew their inputs with the light divider colour (1.31:1); those inputs now use the input border too.
- **Two new colours** for states each screen had invented separately: `dangerSurface` (`#fff0ed`) for error and cancelled backgrounds, and `warningSurface` (`#fff7e0`) for notices that need attention. The web error message, the cancelled-event badge (was `#8a1c14` on `#fdecea`) and the event notices use them; error text uses the danger colour, 6.17:1 on its surface.
- **Feature styles on tokens:** the care, events, community, messages, tasks and checklist styles now use only generated variables: no typed colours, colour functions, named colours, older names or fallbacks. Corners use the control radius (6 px) everywhere except dialogs (8 px), so pill-shaped tabs, response buttons and badges, and 8 to 13 px cards, panels and inputs, now have 6 px corners. The community draft badge, accent text on `#f7ece8` at 4.21:1, now sits on the warning surface at 4.56:1. The care stop and event cancel confirmations get the danger colour as their border (was the light `#e0b4ae`). The bubble border for your own messages uses the divider colour (was `#c9ded3`), and the community dialog backdrop is the ink colour at 45% through `color-mix`, the same value as before.
- **Check:** `npm run check:tokens` now also fails when one of those six stylesheets types a colour, uses an older name or a fallback, or sets a corner other than `0` or a radius token, and when the input border falls below 3:1 against white or the page background. The contrast pairs grew from 14 to 22, and the accent colour is held to 4.5:1 because task statuses use it for text.

| Check (2026-10-01) | Result |
| --- | --- |
| Token tests | `node --test scripts/design-tokens.test.mjs`: **7 passed**. New negative controls: one injected stylesheet with a typed colour, a colour function, a named colour, two older names, a fallback and a 999 px corner gives 8 findings and ignores a colour inside a comment; the old input border and placeholder colours fail exactly their three pairs. `npm run check:tokens` passes. |
| Web component tests | **29 passed**, 0 failed (`.local/t37/web-unit.txt`), including the 320, 390 and 768 px task layouts and the 200% text reminder review. |
| Live journeys | `tasks:`, `messages:`, `community:`, `events:` and `care:` against http://127.0.0.1:3000 and the shared API, before and after the change: **5 passed** both times (`.local/t37/before/journeys.txt`, `.local/t37/after/journeys.txt`), 10 screenshots each. Compared side by side: events and care at mobile width and community at desktop width, plus tasks and messages after the change. Same layout and text; darker input borders; 6 px corners on tabs, cards and badges. Between the two runs another session changed the web header (a search link appeared and the Agent link went); that is not part of this change. |
| Android | `:app:compileDebugKotlin` on the shared tree: **BUILD SUCCESSFUL** (the two missing calendar strings were added by another session at 13:06). Not run on a device; only the outline colour changes there. |

Boundary: no size changed, so the 320 px and 200% text layouts are as before; the changed care, events and community screens were not measured again at 200% text. Still to do in T37: the calendar, reminders and Spaces styles, which the alerts work (waiting for your keep or revert decision, C10) and T22 are changing; spacing on the 4-unit scale (many 6, 9, 10 and 14 px values); the Android screens' own `6.dp` corners and spacing; and plain words in Android ("admission"), which waits for T22 because it changes the same strings file.

### One Toggle Style

Second part of T37. The web had two toggle styles: community's view switches (Home's Following, Latest and Saved; Discover's Pages and Posts) were outlined green buttons that turned solid green when chosen, while the care and events toggles (views, dose outcomes, event responses) were quiet outlined buttons that turned tinted. Community now uses the quiet style as well: white with the divider border, and the chosen one tinted with a green border and bold text. All three get the same tint on hover. Changed behaviour: only how community's switches look. The solid green is left for each screen's main action, for example Search on Discover.

| Check (2026-10-01) | Result |
| --- | --- |
| Token check | `npm run check:tokens` passes; the three stylesheets still use only token variables. |
| Live journeys | `community:`, `post search:`, `events:` and `care:` before and after (`.local/t37/toggles/`). Before: 4 passed. After: 3 passed, and `community:` failed once on `GET /api/feed` with a network reset (`ECONNRESET`) from the shared preview, not a style or behaviour assertion; run again alone, it passed. The Discover screenshots at mobile width show the Pages and Posts switch change from a solid green button to the tinted one, with the rest of the screen unchanged. |

### Android Corners And Targets

Third part of T37. Six Android screens (sign-in and account, tasks, messages, community, care and events) typed their own corner sizes and minimum heights: 34 corners and 41 minimum heights. They now take them from `DesignTokens`: `ControlRadius` (6 dp) for controls, cards and messages, `DialogRadius` (8 dp) for the 6 dialogs, and `MinimumTarget` (48 dp) for every minimum height. Changed behaviour, named as [Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour) requires, all visual:

- The status message on the sign-in, account and tasks screens has 6 dp corners instead of 4 dp.
- Chat bubbles and messages not yet confirmed have 6 dp corners instead of 8 dp, the same as the web bubbles.
- The reasons in the community report dialog are 48 dp tall instead of 44 dp, the Android minimum target.

Everything else keeps its value: 24 corners were already 6 dp, the dialogs stay 8 dp, 40 heights were already 48 dp, and the 56 dp conversation rows stay, because they are taller than the minimum.

**Check:** `npm run check:tokens` now also fails when one of these six screens (the `tokenScreens` list) types a corner size, or a minimum height of 48 dp or less, instead of using `DesignTokens`; comments are ignored. Run against the committed versions of the six files, it finds 16 distinct problems; against the changed files, none.

| Check (2026-10-01) | Result |
| --- | --- |
| Token tests | `npm run test:tokens`: **8 passed**, including a new test that the six screens pass, and that an injected screen with a typed 6 dp corner, typed 48 dp and 44 dp heights, a corner inside a comment, token values and a 56 dp row gives exactly the three typed values. `npm run check:tokens` passes. |
| Android JVM and builds | `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest`: BUILD SUCCESSFUL; **237 passed**, 0 failed, 0 skipped across 18 classes (`.local/t37/android/build-after.txt`). |
| Device, before and after | One boot of the read-only API 36 emulator with the network off, at 320 dp and 200% text where the tests set it. The app built before the change and the app built after it each ran `IdentityScreenTest`, `TaskScreenTest` and `CommunityScreenTest`: **16 passed** both times, and the emulator shut down normally (`.local/t37/android/tokens-device-20261001-101345-e37d81/`). |
| Screenshots | The 6 screenshots the tests take, compared pixel by pixel. Four are identical: the account at 200% text, the task list, the task editor at 200% text and the post search at 200% text. On the sign-in screen and the unchecked sign-in at 200% text, the four corners of the status message changed (112 pixels each) and nothing else in the message. On the sign-in screen the Sign in button also changed colour by at most 2 of 255 in every pixel and kept its corners; the test clicks that button just before taking the picture, so this is most likely its press highlight fading at a slightly different moment, not this change. |

Boundary: the chat bubbles and the report dialog were not seen on a device; there are no device tests for the messages, care and events screens, and the community tests do not open the report dialog. The care and events changes keep every value. The Spaces, reminders and calendar screens were not touched (T22, T12 and C10), and spacing did not change.

### Spacing On The 4-Unit Scale

Fourth part of T37. The care, events, community, messages, tasks and checklist stylesheets typed their spacing in px: 184 margins, paddings, gaps and offsets, 86 of them with values off the 4 px scale (2, 3, 6, 7, 9, 10, 11, 14, 18, 22 and 30 px). All 184 now use the spacing token, `var(--space-unit)` or `calc(var(--space-unit) * n)`. Of the 309 numbers in them, 219 keep their size. The others move to the nearest multiple of 4 px, and a value exactly halfway rounds up, which matches the newer screens (document and search cards are padded 12 by 16 px; document, search and agent inputs 8 by 12 px). Changed behaviour, named as [Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour) requires, all visual and at most 2 px each:

- 77 values grow by 2 px. For example, card padding of 12 by 14 px becomes 12 by 16 px, gaps of 10 px become 12 px, the gap between a label and its field grows from 6 to 8 px, and the gap between the parts of the events page from 18 to 20 px.
- 6 values grow by 1 px (3, 7 and 11 px become 4, 8 and 12 px), and 4 shrink by 1 px (input padding of 9 px becomes 8 px).
- Two kinds of value round down instead. The care checkbox's 2 px offset becomes 0: with 16 px text on 24 px lines, the 22 px box's middle is then 1 px above the middle of the first line, where 4 px would put it 3 px below. The 2 px top and bottom padding of the events and community badges becomes 0, like the Spaces badge, which has none; 4 px would have made them 4 px taller.

Pages get slightly taller, by a few px per part: in the journeys' mobile screenshots, events by 54 px, tasks by 50, community by 24, and care and messages by 16. Nothing else in these stylesheets changed.

**Check:** `npm run check:tokens` now also fails when one of the six stylesheets types a spacing value in px or em, or uses a fraction of the space unit; comments are ignored. On the saved copies of the six files from before the change it reports 81 typed values; on the changed files, none. With every spacing value blanked out, the saved copies and the changed files are identical, so nothing but spacing values changed (`.local/t37/spacing/verify-change.mjs`).

| Check (2026-10-01) | Result |
| --- | --- |
| Token tests | `npm run test:tokens`: **9 passed**, including a new test that typed px and em spacing and fractions of the space unit are reported, while 0, `auto`, whole multiples (negative ones too), borders and comments are not. Before the change 8 of 9 passed: the test of the real stylesheets failed on their typed spacing. `npm run check:tokens` and `npm --prefix web run typecheck` pass. |
| Web component tests | Every file in `tests/unit`: **53 passed** before the change and 53 after (`.local/t37/spacing/before/unit.txt`, `.local/t37/spacing/after/unit.txt`), including the task layouts at 320, 390 and 768 px. |
| Live journeys | `tasks:`, `messages:`, `community:`, `events:` and `care:` against http://127.0.0.1:3000, before and after the change: **5 passed** both times. Each checks that its screens fit at 320, 390 and 768 px. Run again with every page at 200% text (root and body text 32 px instead of 16 px, added by `.local/t37/spacing/large-text.mjs` without changing the test file): **5 passed** before and 5 after. The 40 screenshots are in `.local/t37/spacing/`; compared side by side, the events and community screens at mobile width keep their layout with slightly more space, and the care screen at 200% text still fits. |

Boundary: at 200% text, labels, headings and other text sized in px keep their size, because there is no shared text-size scale yet. The six stylesheets still type sizes such as widths, heights and font sizes, and the message delete button is 36 px, below the 44 px web target. The calendar, reminders and Spaces stylesheets and the Android screens keep their own spacing.

### Android Spacing On The 4-Unit Scale

Fifth part of T37, the Android side of part 4. The sign-in and account, tasks, care and events screens typed their spacing in dp: 84 paddings, gaps and spacers. All 84 now use `DesignTokens.SpaceUnit` (4 dp) as a whole number of units, through `private val unit = DesignTokens.SpaceUnit` in each file, as Home already did. 69 keep their size; 15 move to the nearest multiple of 4 dp by the same rule as the web, all of them by 2 dp. Changed behaviour, named as [Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour) requires, all visual:

- **Sign-in and account:** the header row has 16 dp above and below instead of 14, so it is 4 dp taller; the gap after its icon is 12 dp instead of 10, the gap between the parts of the screen 20 dp instead of 18, and the timezone picker's label and field are 8 dp apart instead of 6.
- **Tasks:** the Space chooser and the filter row above the list are 16 dp apart instead of 14; the parts of a task's detail 20 dp instead of 18, and its buttons 12 dp instead of 10; the lines of a task row, and the label and field of the date and assignee pickers, 8 dp apart instead of 6; the gap after the date icon 12 dp instead of 10.
- **Care:** the lines of a dose 8 dp apart instead of 6, the parts of the medicine form 12 instead of 10.
- **Events:** an event row has 8 dp above and below instead of 6, and the parts of the event form are 12 dp apart instead of 10.

Not changed: the 3 dp space that holds the place of the loading bar (a size, not spacing), icon and control sizes, and the messages and community screens, which follow once T67, T72 and T73 finish with them.

**Check:** `npm run check:tokens` now also fails when one of these screens or Home (the `spacingScreens` list) types a padding, gap or spacer in dp instead of using the space unit; comments are ignored. On the saved copies of the four files from before the change it reports 29 distinct typed values; on the changed files, none. Each changed file is exactly the mechanical conversion of its saved copy, so nothing but spacing changed (`.local/t37/android-spacing/verify-change.mjs`).

| Check | Result |
| --- | --- |
| Token tests | `npm run test:tokens`: **10 passed** (2026-10-01), including a new test that the six screens pass, and that an injected screen with typed spacing in paddings, a `spacedBy` and a spacer reports exactly those values, while space units (also in `PaddingValues` and `spacedBy`), `0.dp`, a size such as `Modifier.size(18.dp)`, the loading bar's 3 dp spacer and a comment are not reported. Run again on 2026-10-02 at 08:00, after other sessions had changed the account, care and events screens overnight (account data, deletion and scrollable dialogs): **10 passed**, and `npm run check:tokens` passes. |
| Builds | On a copy of the shared tree (2026-10-01, `.local/t38/gates-7.txt`): lint **0 errors**, 20 warnings, 8 of them new, all missing Hindi and Telugu texts for another session's new community strings; the debug app and test app build. |
| JVM and device tests | The change went into the shared tree's commit `c0f15e5`. The device suite that another session ran on 2026-10-02 on commit `338fb90` (read-only API 36 emulator, network off, 320 dp; `.local/verify/device-1/`, `.local/verify/device-2/`) passed the four screens' tests twice: `IdentityScreenTest` **7 of 7**, `TaskScreenTest` **6 of 6**, `CareScreenTest` **10 of 10** and `EventsScreenTest` **7 of 7**, the last two new since part 3. All Android JVM tests on 2026-10-02: 446 of 446 ([checkpoint](#owners-critical-gaps-checkpoint)). |
| Device, before and after | One boot of the read-only API 36 emulator on 2026-10-02, network off, 320 dp (`.local/t37/android-spacing/spacing-device-20261002-031304-94d24d/`). The app built before the change and the app built after it each passed `IdentityScreenTest` **6 of 6** and `TaskScreenTest` **6 of 6**, and the emulator shut down normally. Of the 5 screenshots the tests take, compared pixel by pixel, the task editor at 200% text is identical. On the sign-in screen the header is 8 px taller and the gap after its icon 4 px wider, which is 4 dp and 2 dp at 2 px per dp, and everything below it moves down; the account and the unchecked sign-in at 200% text change from the header down in the same way. In the task list nothing changes above the filter row, which starts 4 px lower, and the lines of the task row are further apart. |

## Audit Fixes Checkpoint

Builds [T39, T40 and T51](TASKS.md#defects-that-break-approved-requirements), found by the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#4-confirmed-defects-in-the-built-code).

- **T39, web editors (R9).**
  - **The defect:** the page, post and event editors kept the values from when they opened, but saved with the version tag of the latest refetch, and every query refetches when the window regains focus. So a save made after another device's change reverted that change, even in fields the person never touched, and the server accepted it.
  - **The fix:** each editor now keeps the version it opened with and uses it both to work out what changed and as `If-Match`. The post editor takes that version when Edit is chosen, not when the list first rendered.
  - **Result:** a save against an outdated version is refused (412) with the existing "changed since you opened it" message and its Reload action. Changed behaviour ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): a save that used to overwrite newer content is now refused; nothing else changes.
- **T40, Android release build (R13).**
  - **The defect:** in the release APK built at 04:03, all 13 `IdentityApi` methods had the generic signature `(…, LU1/d;)Ljava/lang/Object;`. `U1.d` is the renamed `kotlin.coroutines.Continuation` with no type arguments, so Retrofit could not find `Response<EnvelopeDto<…>>`, and every call would have failed before it was sent. Retrofit 2.9.0 ships no R8 full mode rules for this.
  - **The fix:** `proguard-rules.pro` now has the rules Retrofit 2.10 and later ship: keep `Continuation`, `retrofit2.Call` and `retrofit2.Response`, and the classes that service methods return.
  - **Two more rule fixes:** the same file now keeps every `*Dto` in every feature with one rule. The old list of eight packages missed the three `files` DTOs. It also keeps the field names of the stored `Credentials`, so a later build can still read a saved session.
- **T51, test commands (R12).**
  - **Scripts:** `test:client`, `test:unit` and `test:e2e` in `web/package.json` now run every matching file in their folder, instead of a fixed list that had left out the identity, care and alerts client files and the alerts journey. New files are picked up without editing the scripts.
  - **Worker test:** the worker recovery test now waits up to 60 s for the worker, instead of 20 s, which failed under load. The limit only guards against a hung process, and every assertion is unchanged, so what the test checks is unchanged ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour) rule 4).
  - **Live journeys:** [tests/e2e/README.md](../tests/e2e/README.md) now explains how to run them and how to save a JUnit report that is valid XML.

| Check (2026-10-01) | Result |
| --- | --- |
| New web component tests | `tests/unit/community-ui.test.mjs` (3 tests) and `tests/unit/events-ui.test.mjs` (1 test) reproduce "another device saved a newer version, then this tab regained focus". Before the fix, all 4 failed for the reason under test: the page save sent `"page-2"` instead of `"page-1"`, the post editor opened with the old text, the post save sent `"post-2"`, and the event save sent `"event-2"`. After the fix: **4 passed**. |
| Web component tests | `npm --prefix web run test:unit`: **33 passed**, 0 failed (the 29 earlier tests plus the 4 new). |
| Web client tests | `npm --prefix web run test:client`: **100 passed**, 0 failed, across all 9 client files. This includes the 3 files the old list left out, and the agent client tests another session added. |
| Typecheck | `npm --prefix web run typecheck`: passed. |
| Live journeys | `community:` and `events:` against http://127.0.0.1:3000 and the shared API, after the fix: **2 passed**. |
| Backend | `test_separate_worker_process_recovers_persisted_due_work_without_duplicate` in the test container: **1 passed** in 47.6 s. |
| Android release | `:app:assembleRelease --offline` with the Android Studio JDK, including lint vital: **BUILD SUCCESSFUL** in 6 min 50 s. In the new APK, all 13 `IdentityApi` signatures carry the full type (`LV1/d<-LJ2/S<…EnvelopeDto<…DoneDto>>>`); in the 04:03 APK, 0 of 13 did. `seeds.txt` now keeps `kotlin.coroutines.Continuation`, `retrofit2.Response`, `retrofit2.Call` and the three `files` DTOs, and `Credentials` keeps its `token` and `accountId` field names. Checked with `dexdump` from build-tools 36.1.0. |
| Saved reports | A deliberately failing Playwright test, saved as JUnit. With `NO_COLOR=1`, the file still held 8 colour codes from Playwright's call log and was not valid XML. With `FORCE_COLOR=0`, it held none and parsed. |

**Boundary.**
- **Release app not run on a device.** The only emulator belongs to another session and holds an app with the same application ID. A release build also cannot reach the local API: its host is `api.community.invalid`, and plain HTTP is allowed only in debug builds (audit A9).
- **Full live suite not run,** because `solo:` and `space settings:` fail while T22 is in progress.

## Web Reliability And Text Limits Checkpoint

Builds [T41, T46, T47 and T48](TASKS.md#defects-that-break-approved-requirements), found by the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#4-confirmed-defects-in-the-built-code).

- **T41, web chat catch-up (R5).**
  - **The defect:** polling stops while the tab is hidden. If more than 330 messages arrived meanwhile, the catch-up stopped after 10 pages, showed the newest page and marked everything read, so the messages in between were never shown.
  - **The fix:** the catch-up now shows only messages that follow on without a hole. It fetches the rest on the next polls, and marks read only what it fetched.
  - **Also fixed:**
    - polls no longer overlap;
    - once a message is deleted, a late copy from an earlier poll cannot bring its text back.
- **T46, text limits (R4).**
  - **The defects:**
    - **Proxy and API:** both refused bodies over 16 KiB, but a valid post of 5,000 characters can take 20 KB as browsers send it, up to 30 KB as Android's Gson escapes it, and up to 61 KB when every character is escaped.
    - **Web schemas:** the web checked returned text in UTF-16 units, while the server counts characters. So a 61-emoji title was saved but shown as not confirmed, and an 80-emoji page name could not load.
  - **The fix:**
    - post create and update accept up to 64 KiB at the proxy and the API; every other body keeps 16 KiB;
    - the community response schemas count characters as the server does;
    - the API description states the effective limit of each community text field next to its looser pre-normalisation guard.
  - **OpenAPI regenerated:** `packages/openapi/openapi.json` was regenerated with `python3 -m app.cli export-openapi`. It now lists 159 operations on 132 paths. The 15 new operations are the agent (T33) and the documents and search (DEC-015) routes that other sessions are building; they come from regenerating, not from this change.
- **T47, proxy request bodies (R12).**
  - **The defect:** a body without `Content-Length` was read completely before its size was checked, with no time limit.
  - **The fix:** the proxy now reads at most the route's limit, plus one chunk, then answers 413. A body that does not arrive within 15 s (60 s for a document) gets 408, and nothing is forwarded in either case.
- **T48, unconfirmed new events (R9).**
  - **The defect:** changing Space, or opening another event, while a new event was being saved or its save was unconfirmed, dropped the form and its retry key. Creating the event again could then make a duplicate.
  - **The fix:** both now ask first, naming the duplicate risk. If you stay, Retry still sends the original key.
  - **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): those two actions show a confirmation in that state only.

| Check (2026-10-01) | Result |
| --- | --- |
| New tests, failing before each fix | Web chat: `offline chat shows every message after a long absence…` showed missing messages before the fix. Client: `A deleted message stays deleted…` showed `sent` before the fix. Events: `an unconfirmed new event keeps its retry…` showed no confirmation before the fix. Proxy: `stops reading a body without Content-Length…` read 100 chunks of 4 KiB before the fix, and `refuses a body that does not arrive in time` hung until the 5 s test limit. Community: the schema test rejected a valid 80-emoji page name, the proxy test answered 413 to a valid post, and the backend test `test_posts_up_to_the_character_limit…` answered 413. **All pass after the fixes.** |
| Web client tests | `npm --prefix web run test:client`: **105 passed**, 0 failed. |
| Web component tests | The offline chat, community and events files: **8 passed** (`messaging-ui` 3, `community-ui` 3, `events-ui` 2). The whole `test:unit` run: 39 of 42. The 3 failures are in `tests/unit/documents-ui.test.mjs`, the documents work another session is still building (DEC-015). The same 3 tests also fail in a separate worktree at commit `8bfa746`, which has none of these changes. |
| Typecheck | Passed. |
| Backend | `tests/test_community.py` in the test container: **18 passed**. |
| Live journeys | `messages:`, `community:`, `post search:` and `events:` against http://127.0.0.1:3000 and the shared API: **4 passed**. |

**Boundary.**
- **Live API not restarted.** The shared API in Compose runs the code from its last start, so the larger post limit takes effect there at its next restart. Until then, a post over 16 KiB sent through the live stack is still refused by the API.
- **Android post editor not changed:** it already counts characters.

## Android Start And Sign-Up Checkpoint

Builds [T50](TASKS.md#defects-that-break-approved-requirements) (R13): findings A7 and A12 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#4-confirmed-defects-in-the-built-code).

- **Starting without a connection.**
  - **The defect:** at start the app checks the saved sign-in with the service. When that check failed, because there was no connection or the service answered with an error, the screen showed the sign-in form with "No connection. Your changes are not confirmed." and no way to retry. The saved sign-in was still on the device, so signing in again started a second server session; an account's oldest session is revoked at 20.
  - **The fix:** a saved sign-in that cannot be checked is kept. In place of the form, the screen says "Couldn't check your sign-in" and "You stay signed in on this device." and offers Try again. The message above it reads "Can't reach the service. Check your connection, then try again.", because nothing was changed. A sign-in the service rejects still leads to the form, and so does a start with no saved sign-in.
- **Sign-up timezone.** Sign-up started every account in Asia/Kolkata. It now starts in the device's timezone when that is a named zone, and in UTC otherwise, for example for a custom offset such as GMT+05:30. The person can still choose another zone. Corrected by T54 ([next section](#sign-up-timezone-checkpoint)): the service refuses some named zones, such as Asia/Calcutta, so the default now comes only from the service's list.
- **Rotation.** Email, display name, the chosen timezone and Show password now survive rotation, and the system ending the app in the background. The password and the verification code survive rotation in memory only: they never go into the saved state Android keeps for the screen, so after the system ends the app they are typed again. They are forgotten once the person is signed in, so they do not reappear after signing out.
- **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): the start screen after a failed check, the sign-up default timezone and the wording of a failed check. One device test expected Asia/Kolkata in a recovery proof; it now expects the device's zone, citing T50, and its other assertions are unchanged.
- **Engineering choices** ([DEC-009](DECISIONS.md#accepted-decisions)): the password and code live in a small screen `ViewModel` (`SignInSecrets`) rather than in saved state, and the new button takes its height and corners from the design tokens ([DEC-013](DECISIONS.md#accepted-decisions)). The session store is not changed here; T49 changed it in parallel.

| Check (2026-10-01) | Result |
| --- | --- |
| Android JVM | New `IdentityViewModelTest`, 5 tests: an offline start keeps the saved sign-in and offers Try again, and a later check loads the account with no new sign-in; a server error at start also keeps it; a rejected sign-in clears it and shows the form, also after an offline start; a start with no saved sign-in and no connection shows the form with the check message; and the sign-up timezone rule. `AccountRepositoryTest`'s test double gained a lost-connection switch and a sign-in counter. The whole suite: **234 passed**, 0 failed, 0 skipped across 18 classes (`.local/t50/jvm-full.txt`). The new tests use the new state field, so they cannot run against the old code, whose screen showed the form whenever no account was loaded. |
| Device | `IdentityScreenTest` on the read-only API 36 emulator `community_membership_20260923`, network off, at 320 dp: **6 passed**, 0 failed, 0 skipped in 92 s. The 2 new tests cover the Try again screen at 200% text (no email, password or sign-in button; a button at least 48 dp tall that starts one check), and the sign-up fields across a simulated recreation: the name and code come back and verify receives the same password, while a new process brings back only the name. Three screenshots were copied with matching hashes and viewed (`.local/t50/identity-device-20261001-091023-0c042c`). Three earlier attempts did not reach the tests: twice the guest's phone service did not start in time on the loaded machine, and the guard stopped before installing anything (the wait is now up to four minutes); once the API 36.1 image failed all 6 tests inside Espresso 3.6.1 (`NoSuchMethodException: InputManager.getInstance`) before any app code ran. |

**Boundary.**
- **No live sign-in journey:** `AccountJourneyTest` against the shared API did not run. It registers through this form, so an account it creates now gets the emulator's timezone.
- **The web sign-up form started in Asia/Kolkata as well;** fixed by T54 ([next section](#sign-up-timezone-checkpoint)).

## Sign-Up Timezone Checkpoint

Builds [T54](TASKS.md#defects-that-break-approved-requirements) (R13), found while building T50, and corrects T50's timezone rule.

- **Web:** the sign-up form started every account in Asia/Kolkata. It now starts in the browser's timezone, under the name the service lists, and in UTC when the service lists no such zone. The default follows the service's list once it arrives, unless the person already chose a zone.
- **Older zone names:** browsers and Android emulators report some zones by an older name that the service refuses; its list has only current names (486), not older ones such as Asia/Calcutta. Chromium reports Asia/Kolkata as Asia/Calcutta and Europe/Kyiv as Europe/Kiev, and the emulator reported Asia/Calcutta. The first version of this fix sent Asia/Calcutta, and the live `repeating reminders:` journey caught it because its sign-up was refused. Both apps now pick the listed name of the same zone: the web asks the browser for each listed zone's own name, and Android compares the zones' rules. T50's Android rule accepted any named zone and had the same gap; it is corrected the same way.
- **Live journeys:** the shared `signUp` helper in [identity.test.mjs](../tests/e2e/identity.test.mjs#L39) now chooses Asia/Kolkata itself, because those journeys compute times in that zone. Nothing else in them changed.
- **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): the web sign-up default timezone. For someone in India it stays Asia/Kolkata.

| Check (2026-10-01) | Result |
| --- | --- |
| Web component tests | New cases in `tests/unit/identity-ui.test.mjs`: a browser in Europe/Berlin starts in and sends Europe/Berlin; a browser in India, reported as Asia/Calcutta, starts in and sends Asia/Kolkata; a browser in America/Chicago, with a list that lacks it, starts in UTC. The first new test failed before the fix with `Asia/Kolkata` instead of `Europe/Berlin` (`.local/t54/before.txt`). All offline component tests: **51 passed**, 0 failed; client tests **105 passed**; type check passed. |
| Live journeys | `auth forms:`, `care:`, `desktop:` and `mobile:`: **4 passed**. `repeating reminders:`, whose sign-up uses the default: **passed** with a real worker delivery in 168 s, after failing with the first version of the fix. |
| Android | `IdentityViewModelTest` now also checks that Asia/Calcutta becomes Asia/Kolkata and that an unlisted zone becomes UTC. The whole JVM suite: **234 passed**, 0 failed. The identity screen tests ran on the emulator before this rule change and were not run again; they take their expected zone from the same function. |
| Matching cost | In Chromium, matching against the service's 486 zones took about 120 ms on the loaded machine. It runs only when the browser's name is not in the list (`.local/t54/probe-scan.mjs`). |

**Boundary.** The `alerts:` journey (work waiting for your decision C10) also signs up with the default and was not run. The service still refuses older zone names for every client; the apps now avoid sending them, and the API was not changed.

## Space Documents And Search Checkpoint

Builds [T14 and T15](TASKS.md#approved-requirements-not-built-yet) in their first form (R5, R10, R11, R13) and step 2 of the [end-to-end plan](TASKS.md#end-to-end-plan), under [DEC-015](DECISIONS.md#accepted-decisions), decided provisionally under the owner's delegation recorded in [DEC-016](DECISIONS.md#accepted-decisions).

- **Documents:** in a family, solo or group Space, a member adds a `.txt`, `.md` or `.csv` file of up to 512 KB (200 documents and 20 MB per Space). The text is checked (UTF-8, no control or text-direction characters), split into passages that keep their line numbers, and indexed with PostgreSQL full-text search in the same transaction. Members see the documents added while they were members, the history rule of chat and events. The person who added a document, or the owner, deletes it after a confirmation naming the document, who added it and the Space; the name, text and passages go at once, and the row keeps only who added and deleted it and when. Other file types are refused, because no virus scanner can be installed under DEC-005.
- **Search inside your Spaces:** one search over the documents, tasks and events the person can open now, in all their Spaces or one: every word required, word beginnings matching, at most 20 of each kind, each result naming its Space. A document result opens the document with the cited lines marked. Messages, care records, reminders and agent memory are not searched.
- **Screens:** web `/app/documents` (Documents button on each Space) and `/app/search` (Search in the header); Android Documents from a Space's details and Search from the account screen. Both apps use the same names, confirmation and messages.
- **API:** 5 operations, all requiring sign-in: `POST`/`GET /v1/spaces/{space_id}/documents`, `GET /v1/documents/{document_id}`, `POST /v1/documents/{document_id}/delete`, `GET /v1/search`. Migration `0024` adds `space_documents` and `space_document_chunks`. Only adding a document accepts a body over 16 KB (2.2 MB), on the API and on the web proxy.
- **Engineering choices** ([DEC-009](DECISIONS.md#accepted-decisions)): text in PostgreSQL rather than object storage, since text-only documents need no file store; a generated `tsvector` column with a GIN index and the `simple` configuration, so words in any language match whole and nothing is stemmed; the query is built only from the lexemes `plainto_tsquery` returns, with a prefix added, so typed operators are plain text; access rules are joined inside each search query, so ranking and excerpts only see what the person may open; adding locks the Space, so the limits hold under parallel requests. Details in the [files](../backend/app/modules/files/README.md) and [discovery](../backend/app/modules/discovery/README.md) module READMEs.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | `tests/test_documents.py`: **9 passed**: text normalising and passage coverage; add, retry and changed retry, read, list, delete and what remains; the history rule for later and removed members, and who may delete; types, sizes, the body limit on this route only, Space limits, very long words; a session that expires while waiting for the Space lock saves nothing; four parallel retries add one document; search scope (later members, removed and re-admitted members, other Spaces, chat messages), word beginnings, word order, typed operators, Telugu, characters PostgreSQL does not index; ranking and at most 3 passages per document; sign-in on every operation. With the schema parity test: 10 passed. |
| Defects injected | Ten, loaded one per run by a test-only plugin with no source file changed (`backend/.local/doc_defects.py`, `.local/doc-defects-result.txt`): reading or listing past the history rule, deleting without removing passages, anyone deleting, retries ignoring a changed body, and search ignoring the history rule for documents or events, ignoring the task grant's admission, including removed members, or matching whole words only. Each made at least one test fail; the clean run passed 9. |
| Independent review | A blind security review by a second model (Grok 4.7) against the stated rules. Fixed: a deleted document kept a keyed fingerprint of its name and text for retries; deletion now replaces it, and a retry after deletion reports only that it was deleted. Already fixed by [T47](TASKS.md#defects-that-break-approved-requirements): the web proxy read a body without `Content-Length` completely before checking it. Checked and not defects: lexemes of 2 KB or more (PostgreSQL skips them with a notice; tested) and queries that yield no lexemes (no results; tested). Not measured: whether search time depends on matches in other Spaces' passages, since the index is shared. |
| Web | Type check passed. `tests/documents-client.test.mjs` **13 passed** (schemas, requests, proxy routes, parameters and body limits); all client tests **105 passed**. `tests/unit/documents-ui.test.mjs` **7 passed** offline with zero outbound requests: retry after a lost response sends the same key and text, refused files, cited lines, markup shown as text, the delete confirmation, search groups and links, and no horizontal overflow at 320 px with normal and doubled text. Three of these first failed because each Space selector's accessible name included its chosen option; the selectors are now labelled "Space" alone. |
| Live web | The `documents:` journey in `tests/e2e/identity.test.mjs` **passed** against the local API at `0024`: the owner adds a Markdown file; a member who joined earlier searches a word, opens the result and sees the cited lines marked; the owner deletes it after the confirmation; search no longer finds it; no horizontal overflow at 320 px or with 200% text. Screenshots in `.local/screenshots/`: `documents-live-desktop.png`, `documents-delete-live-desktop.png`, `search-live-mobile.png`, `documents-viewer-live-320.png`, `search-live-320-200pct.png`. |
| Visual review | A third model (Gemini 3.8 Flash) reviewed the five screenshots against the screen rules. Fixed: the add and search forms were framed like cards; the open document came after the page's introduction at 320 px; the delete confirmation did not name who added the document; the empty search repeated the scope sentence (Android now shows it under the search field, as the web does). Two of its findings quoted text that is not on the screens and were discarded. |
| Android | `DocumentTest` **20** and `SearchTest` **10 passed**; every JVM class by name: **234 passed**, 0 failed, 0 skipped in 18 classes after the final changes. Lint 0 errors; debug app and test app built. On the read-only API 36 emulator `community_membership_20260923` with the network off at 320 dp: `DocumentScreenTest` **7 of 7 passed**, font scale restored to 1.0 (`.local/documents-native-offline-5582.txt`); the first run failed one test, because it compared the size label with "KB" as the whole text instead of part of it. Live, with local network only: `AccountJourneyTest#nativeSearchOpensACitedDocumentAndDeletesItWithTheRealBackend` **passed** in 39.5 s: the member signs in, opens Search from the account screen, finds the document, opens it with line 3 marked and its markup shown as text, and deletes it; the API then answers 404 and search finds nothing (`.local/documents-native-live-5582.txt`). |

Live since about 14:35 IST: the development database was upgraded from `0022` to `0024`, which also applied the agent tables (`0023`), and the shared API was restarted. The generated [OpenAPI](../packages/openapi/openapi.json), regenerated by another session at 13:48, already contains the 5 operations; their shapes have not changed since.

**Boundary.**
- A task or event result opens that Space's task or event list, not the single item; the task screen has no link to one task.
- Adding a document on Android goes through the system file picker, which the device tests do not drive; the add request is covered by JVM tests with a simulated server, and the live journey adds through the API.
- Not built: PDF, images, office files and scanning; versions of one document; OCR; embeddings; sharing outside the Space; answers that cite documents (agent, Q17). Pending choices and retries live in memory only, as elsewhere in both apps.

## Session Keys And Security Sweep Checkpoint

Builds [T49 and T52](TASKS.md#defects-that-break-approved-requirements), found by the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#4-confirmed-defects-in-the-built-code).

- **T49, Android session key (R12).**
  - **The defect:** a Keystore key that could no longer be used was never deleted, so every sign-in failed until app data was cleared. Keystore read errors surfaced as "No connection".
  - **The fix:** the sealing logic moved into a plain Kotlin `SessionSealer` behind a `SessionKey`.
    - Saving with an unusable key deletes it and tries once with a new one.
    - Opening with an unusable key deletes it and signs out.
    - A tampered session signs out and keeps the key.
    - A key that stays unusable reports "This device could not store your sign-in securely", not "No connection".
    - An unreadable Keystore counts as a key problem.
  - **Compatibility:** `KeystoreSessionStore` keeps its constructor, so the device test compiles unchanged.
- **T52, security tests (R12).** A new file, `backend/tests/test_security_sweep.py`, checks:
  - **Anonymous and expired sessions:** every operation that the API description marks as signed-in refuses anonymous calls and expired sessions. The answer is 401, or 422 when the request is invalid before identity is checked, and the call changes nothing in any table. Public reads, where signing in is optional, are checked only with the expired session.
  - **Non-members:** every operation on a Space refuses an account that is not a member, and changes nothing.
  - **Unexpected exceptions:** an unexpected exception stays in the application, and its message is never written.
  - **A real server process:** started as the image starts it, it writes none of the private values sent in requests (email, password, token, path, query and body).
  - **Stored data:** no password, session token, context secret, email address or verification code appears in plaintext in any row of any table.
- **Two defects the new tests found, both fixed.**
  - **Join request decisions (T22's code):** approving or declining a join request looked the request up before checking sign-in, so an anonymous caller got "Join request not found" instead of 401. Sign-in is now checked first (`spaces/directory.py`), as the file's other methods already did.
  - **Unexpected exceptions:** the request log middleware re-raised them, and Starlette 0.46.1's `BaseHTTPMiddleware` re-raises an app exception even after a response is sent. So the server logged the full traceback, including the exception's message, which can hold private values. A small ASGI layer, `ContainErrors`, now answers with the standard `INTERNAL_ERROR` response. It writes an `unexpected_error` line with the exception type and the code locations only, and passes the type to the request line.
  - **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): an unexpected failure now returns the JSON error envelope instead of plain text.

| Check (2026-10-01) | Result |
| --- | --- |
| Android | `SessionSealerTest`: **5 passed**. With the old behaviour put back (no key replacement), 3 of the 5 failed, and the fixed file was restored byte for byte. All Android JVM tests: **229 passed**, 0 failed; the device tests compile. |
| Security sweep before the fixes | 3 of 5 passed. The sweep reported the join request decisions (anonymous 404), and the exception test saw the sentinel exception leave the application. |
| After the fixes | `test_security_sweep.py`, `test_telemetry.py`, `test_space_directory.py` and `test_identity.py`: **43 passed**. |
| Complete backend suite | **444 passed, 1 failed** of 445 in 2,356 s, at migration `0024`. The failure is `test_group_space_migration_keeps_existing_spaces_private_and_refuses_a_lossy_downgrade`: T22's migration test expects `0022` to be the newest migration, but other sessions added `0023` (agent) and `0024` (documents). It is not caused by these changes; it is for the T22 session to update. |

**Boundary.**
- **Space operations:** the sweep proves that no operation on a Space succeeds for a non-member. It does not yet prove that a private Space looks the same as a missing one on every route; T42 does that after T22.
- **Lock-expiry checks:** five later tests cover deleting and reading messages, and creating, cancelling and answering events: each waits for a row lock while its session expires and must save nothing. **5 passed** on the existing re-check in `signed_in_write`. No injected-defect run was made, because that would mean briefly breaking the shared identity service that other sessions' tests load. T04 showed the same pattern failing without the re-check.

## Agent Web Screen Checkpoint

Builds [T34](TASKS.md#approved-requirements-not-built-yet) on the [agent backend](#agent-backend-checkpoint), under [DEC-012](DECISIONS.md#accepted-decisions), which stays provisional and may be reversed by the owner ([DEC-016](DECISIONS.md#accepted-decisions), conflict [C11](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository)).

- **Where it is:** `/app/agent`, linked from the signed-in header as "Agent", with an icon and a visible label because a robot icon alone is not obvious ([DEC-013](DECISIONS.md#accepted-decisions)). [DEC-014](DECISIONS.md#accepted-decisions) left the agent's place to this task; T38 moves the link with the rest of the navigation.
- **What a person can do:** choose a Space, ask in plain words, answer the agent's question in place, check the exact fields of a change ("Check this before I do it"), then Approve or "Don't do it". Requests are listed newest first with "Show earlier requests"; the Memories view lists saved notes, and deleting one needs a confirmation that names it.
- **Retries:** a request whose answer was lost keeps its text and key and offers "Send again"; an approval whose answer was lost offers "Approve again" with the same key and the same reviewed version, so neither can act twice.
- **Found and fixed while checking:**
  - The request hint sat inside the field's label, so screen readers read it twice: once as the name and again as the description. The label now holds only "What do you want to do?".
  - Every screen that shows an unconfirmed change said it twice when offline: "No connection. Your changes are not confirmed. The change is not confirmed." `problemText` (`web/src/features/community/shared.tsx`) now adds its sentence only when the message does not already say so. It changes no other message, and no test asserted the old text.

| Check (2026-10-01) | Result |
| --- | --- |
| Offline screen | `tests/unit/agents-ui.test.mjs`: **6 passed**. The tests cover: asking shows the exact fields and creates nothing until Approve, which sends the reviewed `If-Match` once; a lost request and a lost approval each retry with the same key, and the action happens once; an answer to the agent's question and "Don't do it" change nothing; requests are kept per Space and earlier ones load only when asked; a memory is deleted only after confirming, while "Keep it" and Escape delete nothing; and the screen and its dialog fit 320 px at normal and doubled text, with buttons at least 44 px. The network is blocked, and nothing tried to use it. |
| All offline screens | `tests/unit`: **51 passed**, 0 failed, 0 skipped before the header link (`.local/unit-ui-run.txt`), and **52 passed**, 0 failed, 0 skipped after it (`.local/unit-ui-run-2.txt`). The extra test, "offline request lists work as tabs from the keyboard", was added by another session between the two runs. |
| Web client and BFF | `tests/agents-client.test.mjs`, `tests/web-client.test.mjs` and `tests/messaging-client.test.mjs`: **59 passed**. The web type check passes. |
| Live journey | `agent:` in `tests/e2e/identity.test.mjs`, against the real BFF, API and PostgreSQL: **1 of 1 passed** twice (25.2 s, then 18.2 s, `.local/agent-live-run.txt`). A new account opens the agent from the header and asks for a task. Nothing exists before approval. The first approval's answer is dropped after the server saved it, "Approve again" sends the same key and version, and exactly one task exists. The agent asks what time to remind, "6 pm" proposes 18:00 in Asia/Kolkata, and "Don't do it" leaves no reminder. A note is saved on approval. After a reload all three requests are listed, and deleting the note in Memories leaves none. |
| Screens | `.local/screenshots/agent-approval-live-desktop.png`, `agent-memory-delete-live-desktop.png` and `agent-live-320-200pct.png`, checked by eye: nothing overflows at 320 px and 200% text, and every request shows its fields and result. |

**Boundary.**
- **Text size:** at 200% text the request hint and dates grow more than the surrounding text, because they are sized relative to the root while most text on every screen is sized in pixels. This is the open shared text-size scale (DEC-013, not decided), not a fault of this screen.
- **Not checked here:** a screen reader on a real device and the owner's review of DEC-012. Android followed in the [Android agent checkpoint](#android-agent-checkpoint).

## Tabs, Followed Pages And Migration Checks Checkpoint

Builds [T55–T58](TASKS.md#defects-that-break-approved-requirements), four lower-severity findings of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#lower-severity-findings): W10, W11, B10 and the readiness part of B12.

- **T55, reminder request tabs (R13).** Received and Sent now follow the tab pattern.
  - Only the selected tab is a Tab stop. The Left and Right arrows switch to the other list and move focus with it; Home and End go to Received and Sent.
  - Each tab names the panel it controls, and the list is a `tabpanel` labelled by the selected tab.
  - While a request is being reviewed or saved, the keys do nothing, just as the tab buttons are disabled then. The tab names and roles are unchanged, so the tests that choose the "Sent" tab still work.
- **T56, "Pages you follow" (R4).** While the list loads it says "Loading pages you follow...". The empty message appears only after a successful load. A failed load shows only the error with Retry, where before it also said "You do not follow any pages".
- **T57, Alembic is shown every table (R13).** `migrations/env.py` takes its metadata from `schema_metadata()` in the new `app/schema.py`, which imports the `models.py` of every module.
  - **Before:** a new process was shown 35 of the 60 tables, and `alembic check` stopped with `NoReferencedTableError`: `care_dose_alerts.instruction_id` refers to `care_instructions`, which it was not shown. Autogenerate could not run at all.
  - **After:** "No new upgrade operations detected"; the models and the migrated database agree on everything autogenerate compares.
  - **Why no test caught it:** the existing comparison, `test_migrated_schema_matches_models`, runs inside the test process, which has already imported every model. The new test runs `alembic check` in a new process, as a developer would.
- **T58, readiness waits for migrations (R12).** `/health/ready` reads `alembic_version`. It answers 503 `SERVICE_UNAVAILABLE` while the database lacks a migration the code needs or has no revision at all.
  - **The reason is logged, not shown:** the request log line records `"failure": "MigrationsPending"`, and the response is the same as for an unreachable database.
  - **A newer database stays ready:** a revision this code does not know counts as newer, because [Chapter 10](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md) requires migrations the previous release can still use (C10-A11), so a rolling update does not take every older server out of service.
  - **Start-up is unchanged:** the migration files are read at the first readiness check and kept, not at start-up, so a broken or half-written migration file fails readiness instead of stopping the API from starting. A failed read is tried again at the next check.
  - **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): before, readiness answered 200 whenever `users` could be read. No test asserted that, and nothing in the repository calls `/health/ready`; the Compose health checks use `pg_isready`.
- **The real server test (T52) now explains a failure.** `test_a_real_server_process_writes_no_private_request_values` failed twice in longer runs ("The server did not start" within 60 s), while two other runs, one with this test alone, passed. It now waits up to 120 s, stops at once if the server process exits, and reports the server's exit code and error output. Its privacy assertions are unchanged. The two failures happened while the first version of T58 read the migration files at start-up and other sessions were editing files the new server process loads; with the read moved to the first readiness check, the same 33 tests that had failed passed.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fixes | The new tabs test failed (no `tabindex`), and so did the followed-pages test (no loading state). For the backend, the code at `HEAD` (`env.py` and `main.py`) was copied inside the one-off test container, so the shared files were not changed: both new tests failed there. `alembic check` stopped with `NoReferencedTableError`, and readiness answered 200 with the database one migration behind. Both passed on the fixed code. |
| Offline screens | `reminder-ui.test.mjs` **12 passed**, `community-ui.test.mjs` **4 passed**; all of `tests/unit` **53 passed**, 0 failed. The web type check passes. |
| Web client and BFF | `npm --prefix web run test:client`: **105 passed**. |
| Live journeys | `reminder requests:` and `community:` against the real preview, BFF, API and PostgreSQL: **2 of 2 passed** (61 s and 67 s). |
| Backend | Complete suite with the first version of T58: **455 passed, 3 failed** of 458 in 3,093 s, while another session's complete run shared the machine. Two failures are in `test_spaces.py`, which expects the Space types without `couple`: couple Spaces (T12, migration `0025`) are in progress in the completion session. The third is the real server test above. After the final change: `test_migrations.py`, `test_telemetry.py`, `test_work_metrics.py` and `test_security_sweep.py` **33 passed**. |

**Boundary.** No screen reader on a real device was used for T55. T58 does not add an idle limit to sessions or turn off the API docs, the other two parts of audit finding B12; those are not tasks.

## Android Agent Checkpoint

Builds [T35](TASKS.md#approved-requirements-not-built-yet): the [agent web screen](#agent-web-screen-checkpoint) on Android, against the same [agent backend](#agent-backend-checkpoint), under [DEC-012](DECISIONS.md#accepted-decisions), which stays provisional and may be reversed by the owner ([DEC-016](DECISIONS.md#accepted-decisions), conflict [C11](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository)). Code in `android/app/src/main/java/com/community/platform/feature/agents/` ([README](../android/app/src/main/java/com/community/platform/feature/agents/README.md)).

- **Where it is:** "Agent" on the account screen, where Android opens every feature until T38 adds the bottom bar.
- **What a person can do:** the same as on the web. They choose a Space, ask, answer the agent's question in place, check the exact fields, then Approve or "Don't do it", or stop a request that waits for an answer. Requests are listed ten at a time with "Show earlier requests", and a memory is deleted only from a confirmation that names it.
- **Retries:** one command runs at a time. After a lost answer it is kept exactly, with the same request key, approval version and key, or answer, and the screen offers "Send again", "Approve again" or "Try again", or "Reload to check". A definite refusal, such as an approval that changed, shows the server's message and reloads. Leaving with an unconfirmed command asks first; a 401 or an account change clears the screen.
- **Checked before use:** every response must match the request (Space, run, approval), with consistent statuses and a valid version tag, and pages must move forward without repeats. Request pages are capped at 512 KiB and memories at 256 KiB.
- **Found and fixed on the web while building this:** deleting a memory a second time, after the first answer was lost, showed "Memory not found." although the memory was gone. A 404 on that delete now counts as deleted on both web and Android, and a reply naming another memory is refused.
- **Engineering choices** ([DEC-009](DECISIONS.md#accepted-decisions)): the account entry uses the core "Face" icon with the visible label "Agent", because the core icon set has no robot. The tabs reuse the care screen's chips, and the confirmation reuses the documents dialog style.

| Check (2026-10-01) | Result |
| --- | --- |
| JVM | `AgentTest`: **13 passed** (`.local/agent-jvm-AgentTest.xml`). The tests cover: consistent and inconsistent responses; message rules (emoji allowed, controls and format characters refused); pages; asking and approving; a lost request and a lost approval retried with the same key, version and effect once; a changed approval refused and reloaded; an answered question then declined; stop; memory deletion with confirmation and after a lost answer; sign-out; the exact paths, headers and bodies on the wire; and the response caps. All JVM tests: **257 passed**, 0 failed, 0 skipped across 19 classes (`.local/agent-android-junit-20261001-163052`). Lint 0 errors, 11 warnings; debug and test builds passed. |
| Device, offline | `AgentScreenTest` on the read-only API 36 emulator, network off, screen 320 dp: **6 of 6 passed** (`.local/agent-native-offline-5582-3.txt`). They cover the exact fields and approval; an unconfirmed approval offering only "Approve again"; the answer flow; memory deletion only from the dialog; an unconfirmed request keeping its text; and the card staying inside the screen at 320 dp and double text. The first run had 5 of 6: the narrow-width test asserted a button before scrolling to it inside a card taller than the screen, a test fault, not an app fault. |
| Device, live | `AccountJourneyTest#nativeAgentActsOnlyAfterApprovalAndDeletesAMemoryWithTheRealBackend`, against the real API: **1 of 1 passed** (46.4 s, `.local/agent-native-live-5582-2.txt`). A synthetic account opens the agent from the account screen and asks for a task. None exists until Approve, and then exactly one. The agent asks what time to remind; the answer proposes a reminder, and "Don't do it" leaves none. A note is saved on approval and deleted from Memories, and the server confirms each step. The first run stopped near the end because the test waited for the Memories chip while it was scrolled off the screen; the earlier steps had passed. |
| Web | All client tests: **106 passed**, including the new memory deletion case (`.local/agent-web-client-all.txt`). |
| Screens | `.local/screenshots/agent-native-approval.png`, `agent-native-large-text.png` and `agent-native-live.png`, checked by eye: the exact fields and both buttons are visible; at 320 dp and double text the long title wraps and nothing leaves the screen. |

**Boundary.** The double-text device check scales text inside the screen, not the system font, so it does not show the delete dialog at double size. No screen reader was used. The web and Android agent screens stay subject to the owner's review of DEC-012.

## Couple Spaces And Space Privacy Checkpoint

Builds [T12](TASKS.md#approved-requirements-not-built-yet) (couple Spaces, R6) under [DEC-017](DECISIONS.md#accepted-decisions), closes [T22](TASKS.md#spaces) (group Spaces) and fixes [T42](TASKS.md#defects-that-break-approved-requirements) (audit B03, R12) together with four more ways to tell a private Space from a missing one, found by an independent review. DEC-011 and DEC-017 stay provisional until the owner reviews them ([DEC-016](DECISIONS.md#accepted-decisions)).

- **Couple Spaces (T12):**
  - **Who:** a `couple` Space is always private and holds at most two people: the person who creates it (the owner) and one partner, who joins through the ordinary invitation.
  - **Waiting:** the creator can use it at once. Web and Android say "Waiting for your partner" until the partner joins, then "With" and the partner's name.
  - **Limits:** only one invitation can wait at a time (`409 COUPLE_INVITATION_PENDING`); a third person is refused when inviting and when accepting (`409 COUPLE_FULL`). Both checks run under the Space lock, and migration `0025` adds a deferred database rule that refuses a third active member whatever path tries.
  - **Separation:** either person can leave (the owner after handing ownership over), and the owner can remove the partner. A new partner joins with a new admission and sees nothing from before; the former partner keeps no access. No join requests, no public visibility, no change of type.
- **Group Spaces closed (T22):** the build session built them and stopped after about 11:00. This session added the missing piece, editing a Space's description on Android as on the web (labels, counter, original-intent retry), and re-ran the evidence below.
- **A private Space looks exactly like a missing one (T42 and the review):** for anyone who is not a current member, every operation that names a Space now gives the same status and body for a real private Space as for an unused ID. What changed (status codes are unchanged, all 404):

  | Operation | Before | Now |
  | --- | --- | --- |
  | Leave, remove (T42) | "Membership not found." | "Space not found." |
  | Offering ownership | "Ownership transfer not available." | "Space not found." |
  | Answering an ownership offer after leaving | "Ownership transfer not available." | "Ownership transfer not found." |
  | Revoking an invitation one knows, without owning the Space | "Space not found." | "Invitation not found." |
  | Approving or declining a join request one knows, without owning the Space | "Space not found." | "Join request not found." |

  Approving a join request is also refused unless the Space is a group, so a request planted in the database cannot admit a couple partner. A former member who uses the key of their own confirmed leave or removal keeps the earlier answers (the outcome, `409` for a changed review, `428` without one): they already know the Space, and `test_membership_departure_retries_return_only_an_attributed_minimal_receipt` protects that contract. The review asked for the missing-Space answer there too; that change made the existing test fail in the complete suite, so it was taken back ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)).
- **Changed tests** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): four existing tests asserted that a couple Space could not be created: `test_creation_rejects_invalid_and_authority_fields` and `test_space_openapi_documents_authentication_and_private_projections` in `test_spaces.py`, one case in `test_space_directory.py`, and one in `tests/web-client.test.mjs`. DEC-017 changed that requirement, so each now checks that a couple is accepted while an unknown type and a public couple are refused.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | `tests/test_couple_spaces.py` **8 passed**: privacy and the one-partner limit; a planted invitation; parallel invitations; parallel accepts of a real and a planted invitation (one joins, one gets `COUPLE_FULL`); the database rule against a third member and a type change; after a separation the new partner sees no earlier document, event or chat message and the former partner none; handing over and then leaving. `tests/test_space_privacy.py` **5 passed**: every signed-in operation that names a Space in its path, query or body (33), called with schema-valid values, as an outsider of a family, couple, solo and private group Space holding an invitation or a join request it really received, and as a former member holding an ownership offer made to them. With the two updated Space tests and the worker recovery test: **26 passed** (`.local/t42-after.txt`). |
| The fixes are needed | Each committed method was put back on its own by a test-only plugin, with no source file changed (`backend/.local/t42_before_all.py`, `.local/t42-before-all-result.txt`). Old leave and remove: 5 privacy tests failed. Old invitation revoke: 3. Old ownership offer: 4. Old answer to an offer: 1. Old join request decision: 1. Nothing put back: 5 passed. |
| Complete backend suite | Before the review fixes: **455 passed, 3 failed** in 2,933 s (`.local/full-backend-couples-20261001.xml`). Two were tests that still expected a couple to be refused, updated as described above. The third, `test_separate_worker_process_recovers_persisted_due_work_without_duplicate`, ran while an Android build and two other test runs loaded the machine; it passed on its own. After the review fixes: **464 passed, 2 failed** in 2,293 s (`.local/full-backend-t42-20261001.xml`): both were `test_membership_departure_retries_return_only_an_attributed_minimal_receipt` for leave, caught by the stricter former-member rule described above, which was then taken back. With that and the admin role (next checkpoint), every Space, privacy, couple, directory, migration and security test file: **160 passed** (`.local/roles-backend.txt`). |
| Independent review | A blind review by a second model (Grok 4.7) against the stated rules found the four further differences in the table, the join request path, and the test gaps closed above: generic calls stopping at validation, random IDs where a person knows real ones, a family Space only, a Space ID in the query or body, and no handover, parallel-accept or event and chat checks for couples. |
| Web | Type check passed. All client tests: **106 passed**. Live, against the local API at `0025`: all 8 Space journeys (`spaces:` two, `invitations:`, `members:`, `solo:`, `space settings:`, `groups:` and the new `couples:`) **passed** before the privacy fixes (`.local/spaces-live-20261001.txt`) and again after the API was restarted with them (`.local/spaces-live-t42-20261001.txt`). Screenshots: `.local/screenshots/couple-invite-live-desktop.png`, `couple-partner-live-320-200pct.png`. |
| Offline web screens | **38 passed, 15 failed**, none of them about Spaces. The 15 fail on a header change another session made at 17:14 for T38: the shared header now reads `/api/notifications`, which the document screen tests do not expect, and imports a new CSS module that the account screen tests' builder cannot load. That work is in progress, and this session left it alone. |
| Android | Every JVM test class by name: **257 passed**, 0 failed, 0 skipped in 19 classes (`.local/android-jvm-all.txt`), including 3 couple tests and 7 description-editing tests. Lint 0 errors (11 warnings, as before); debug app and test app built. |
| Contract | [OpenAPI](../packages/openapi/openapi.json) regenerated: the Space type now lists `couple`; still 159 operations on 132 paths. |

Live since about 16:20: the development database is at `0025`; the shared API was restarted at 17:21 with the privacy fixes.

**Boundary.**
- **Device:** covered later at 320 dp and 200% text by `coupleChoiceAndPartnerStatusStayReadableAtLargeText` and `spaceSettingsDescriptionCountsCharactersAndKeepsSaveReachableAtLargeText`, which passed with all 19 Space screen tests ([Space Admins Checkpoint](#space-admins-checkpoint)).
- **Text size:** the 200% check sets the root font size, and most Spaces text is sized in pixels, so it shows nothing overflows rather than that the text grows; the shared text-size scale is still open (DEC-013).
- **Not built:** roles beyond owner and member (P5, T13); partner-only privacy beyond the family rules; a database rule for "one waiting invitation", which the service enforces and which cannot admit a third person anyway.

## Timezone List Failures Checkpoint

Builds [T59](TASKS.md#defects-that-break-approved-requirements), audit finding W12 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#lower-severity-findings).

- **The defect:** when the list of timezones could not be loaded, nothing said so. Sign-up offered its four starting zones, and the account, reminder and repeating reminder forms offered only the person's current zone. Someone in another zone could not choose it and did not know why.
- **The fix:** one shared message, `TimezoneListProblem` in `web/src/features/identity/timezone-list-problem.tsx`, says "The list of timezones did not load, so yours may be missing." and offers Retry. It appears under the timezone field on sign-up and in account settings, above the reminder form, and in the "Change repeating reminder" dialog. Retry loads the list again and never submits a form.
- **Found while testing:** after a Retry on the sign-up form, the zone was set before the new options were on screen, so the browser could not select it, and the form stayed on UTC. The zone is now chosen after the options render. The rule is unchanged: a zone the person picked is never replaced, which the three sign-up timezone tests from T54 still check.
- **Test harness repair:** `tests/unit/identity-ui.test.mjs` could no longer be built, because the signed-in header (`shell.tsx`) now imports a CSS module from the navigation work in progress (T38). The build now names an output file, as the other offline harnesses do, and the tests use only its script. No assertion changed; the 8 existing tests pass again.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fix | The new sign-up, reminder form and account settings tests failed: no message appeared. The repeating reminder dialog test failed when its bundle was built without the dialog's message, in a temporary copy under `.local` that was then deleted; the shared source was not changed. |
| After the fix | `identity-ui` **9 passed**, `reminder-ui` **14 passed**, the new `account-ui` **1 passed**; all of `tests/unit` **59 passed**, 0 failed. The web type check passes. |
| Live journeys | `desktop:` (sign-up and the account's timezone), `reminders:` and `repeating reminders:` passed. `reminder requests:` failed once in that run, at 36.8 s, and passed when run again alone; the first failure's detail was not captured. |

**Boundary.** The audit found this on the web (W12). On Android the timezone list loads with the rest of the screen, so a failure fails that whole refresh with its error message; it is not silent there, and this task leaves it as it is.
## Home And Main Navigation Checkpoint

[T38](TASKS.md#design-and-experience) on the web and on Android, under [DEC-014](DECISIONS.md#accepted-decisions), which the owner confirmed. Changed behaviour, named as [Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour) requires.

### Web

- **Five main sections on every signed-in page:** Home, Spaces, Messages, Discover and Profile, each with an icon and a visible label: a bar under the header, and from 1200 px wide a column at the side. The section you are in is marked. The header keeps search, the notification bell, which now shows the unread count, and Agent. The icon-only Home feed, Discover, Messages, Calendar and Medicines links left the header. The brand and the address `/` open Home.
- **Home** (`/app`, new): Needs attention (Space invitations, join requests to the groups whose requests the Spaces screen lets you answer, that is groups you own or administer, reminder requests sent to you, reminders you have not acknowledged), Today (tasks due, reminders and events today in your timezone, from each Space's calendar, without cancelled ones), Your Spaces (with Owner, Admin or Member), and From pages you follow. Each section loads and fails on its own, with its own Retry and a View all link; Calendar and Medicines open from here. Home shows nothing that the screen behind View all does not.
- **Discover:** the public feed, now headed Feed (it was Home), page and post search (Pages and posts, it was Discover) and Your pages share one navigation.
- **Profile:** the account page's own navigation now leads to Blocked (it was in the community navigation) and Sign out. Its Spaces link went, because Spaces is a main section. The Blocked page shows the Profile navigation.
- Not changed: every screen and address stays; `/app/home` is still the feed.

### Android

- **Bottom bar:** Home, Spaces, Messages, Discover and Profile, each with an icon and its name, under Home, the Spaces list, the conversation list, the community screens and the account screen. The section you are in is marked; choosing it again does nothing, except Discover, which goes back to the feed. The bar hides while one Space, a new Space or one chat is open, and cannot be used while the screen holds a change the service has not confirmed. Names shrink to stay on one line, so all five fit at 320 dp with 200% text.
- **Home** (new): the web's four sections, each loading and failing on its own with its own Retry and View all. Needs attention shows up to 6 items and how many more there are; Today comes from each Space's calendar for today in your timezone, without cancelled or finished entries; Your Spaces shows 4 with your role; From pages you follow shows 3 posts. The header has search, the bell with the unread count, and refresh; Calendar and Medicines open from Home. The calendar, medicines, search, and a task, event or reminder opened from Home return to Home. Home loads again when you come back to it after at least 5 seconds.
- **Profile** (the account screen): its buttons for Spaces, the calendar, messages, community, medicines and search went, because the bar and Home open them. It keeps the agent, and the reminder inbox and tasks in its header, and gains Blocked.
- **Discover:** the community chips are Feed (it was Home), Pages and posts (it was Discover) and Your pages. Blocked moved to Profile and shows no chips.
- **Words:** the calendar and search say "Back to Home"; tasks say "Back", because they return to wherever they were opened. The Hindi and Telugu texts changed with them, and the two counts on Home are plurals in all three languages.
- Not changed: back from Home, Spaces, Messages and Discover still returns to Profile.

On both, every screen stays reachable, and sign-in still opens Profile. DEC-014 does not say which section opens after sign-in; opening Home would change the sign-in step of every live journey, so it is asked as [Q21](PRODUCT_UNDERSTANDING.md#39-open-questions).

Tests changed, with the reason ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)), all following DEC-014: the web agent and documents offline fixtures now answer the inbox count that every signed-in header asks for (they reject unknown requests); the live web calendar journey opens the calendar from Home instead of the header; the live Android account journeys (`AccountJourneyTest`) open Spaces from the bar instead of the account screen's Spaces button, in 9 places, and search from Home; the token guard lists the two new Android files, so its test counts 8 screens.

#### Web results

| Check (2026-10-01) | Result |
| --- | --- |
| New offline tests | `tests/unit/home-ui.test.mjs`: **2 passed**. Each section shows its own source; a failing source shows its own message and Retry while the others stay, and Retry asks only that source again; cancelled entries stay out of Today; the five sections show with Home marked; the bell names the unread count; Home fits at 320 px, also with 200% text, and each main section link is at least 44 px tall. Four deliberate breakages (cancelled entries kept, the bell's count lost, a failed section silent, Home not marked) each made them fail (`.local/t38/mutations.mjs`). |
| All offline screen tests | Every file in `tests/unit`: **59 passed** (`.local/t38-unit-all-2.txt`). |
| Live journeys | All 28 journeys in `identity.test.mjs`, `scheduling.test.mjs` and `alerts.test.mjs` against http://127.0.0.1:3000 (17:38 to 17:56, `.local/t38/live-all.txt`): **27 passed**, including `calendar:`, which now opens the calendar from Home, `agent:` through the header's Agent link, and the Spaces, invitations, members, community, messages, events, care, documents and groups journeys with the new navigation on every page; most of them check that their screens fit at 320, 390 and 768 px. The 1 failure is `roles:`, a journey for Space admins that the completion session was building at the time (T13): it waited for "Alex Morgan is now an admin.", a message that was not yet in the web code. |
| Live Home | `.local/t38/probe-home.mjs` with a new synthetic account: Home showed the task due today, a reminder and an event later that day, "Nothing needs your attention.", the Space and the empty pages section. No sideways scrolling at 1440, 390 and 320 px or at 320 px with 200% text, no page errors, and the right section marked on Home, Spaces, Discover, Feed, Profile, Blocked and Calendar. Screenshots in `.local/t38/probe/`. |
| Token and type checks | `npm run test:tokens` **9 passed** and `npm run check:tokens` passes with `platform/home.module.css` on the token list; `npm --prefix web run typecheck` passes. |

Boundary: Home asks each Space's calendar for today, one request per Space (at most 50), and shows up to 6 items needing attention with a count of the rest. Its sections do not refresh by themselves. The 200% text checks double the root and body text; text sized in px keeps its size.

After those results, Home's join requests changed from "public groups you own" to every group you own or administer, as on the Spaces screen, and the role shows Owner, Admin or Member; the type check passes. The two `home-ui.test.mjs` tests then pass every Home check but fail their last one, which refuses any request the fixture does not expect: since 19:52 the header also opens the live updates connection (`GET /api/live`) that the gaps session is adding for T65, and the fixture does not answer it yet.

#### Android results

Built and tested on a copy of the shared Android tree (`.local/t38/android-copy`), because other sessions build that tree all the time.

| Check (2026-10-01) | Result |
| --- | --- |
| New JVM tests | `HomeTest`: **9 passed**. Each section loads, fails and retries on its own; only pending invitations not yet expired, pending reminder requests and unacknowledged reminders need attention; join requests only for groups the person owns or administers; Today in the account's timezone, in calendar order, retried per Space; a lost sign-in stops every section; an answer arriving after an account switch is dropped; Home reloads on return only after 5 seconds; and the bar's section for each screen. |
| All JVM tests | Every class on the final code (`.local/t38/gates-6-summary.txt`): **338 tests, 337 passed**, 24 classes. The 1 failure is `MessagingLiveTest` (1 of 6), part of the live updates the gaps session is building for T65 at the same time; T38 changed no messaging code. The first full run, before other sessions added 4 classes and 39 tests, passed 299 of 299 in 20 classes. |
| Lint and builds | Lint **0 errors**, 12 warnings, all of kinds that were there before (outdated dependencies and target, the app icon, one older plural); the debug app and test app build (`.local/t38/gates-5.txt`). |
| Token checks | `npm run test:tokens` **9 passed** with the two new screens on the list; `npm run check:tokens` passes. |
| Device, first full run | One boot of the read-only API 36 emulator (`.local/t38/android/home-device-20261001-152034-29276a/`), with the APKs from the lint and build row. Offline (airplane mode, Wi-Fi off, mobile data 0) at 320 dp: `IdentityScreenTest` **6 of 6**, `CommunityScreenTest` **4 of 4** and `HomeScreenTest` **4 of 5**. The fifth, the 200% text test, failed on its own check, not on the screen: it read `didOverflowWidth` from the text layout that the semantics action builds again at the full width offered, which is true whenever a label is narrower than its slot. Its screenshot shows all five labels whole. Live, against the local API: the new Home journey **passed** (Home shows the invitation, the task due today, the Space and the empty pages section from the real service; the task opens and Back returns to Home; the invitation opens Spaces), with the account, search and agent journeys: `AccountJourneyTest` **4 of 8**. The four others stopped after the steps T38 changed: three waited for a Space's notice ("Member removed.", "Invitation created.") that at 640 dp tall had scrolled out of the lazy list they read, while the database showed that the removal and the new invitation had happened; the ownership journey looked for the offer before it had loaded. `ReminderRequestJourneyTest` **0 of 1**: it starts at the sign-in form, and the journey before it had left a session. The two boots before this one did not reach the tests (Android took over 600 seconds to boot, then lost its phone service after airplane mode was turned on, with the computer's processor fully used by other sessions' builds). |
| Found and fixed | The cut-off check now compares each label's laid-out width with the width its text needs, and a new control test shows that a label squeezed into 20 dp counts as cut off. The same screenshot showed the bell's unread count cut off by the round clip of the icon button at 200% text; the bell is now a 48 dp button with the same ripple and no clip. In the tests: the ownership journey now waits for the members and offers to load, as the membership journey does, and the device run gives the reminder journey fresh app data and runs the live journeys at the emulator's own screen size. |
| Device, after the fixes | Both fixes went into the shared tree's commit `c0f15e5`. The device suite that another session ran on 2026-10-02 (`npm run verify -- -Suite device`, on commit `338fb90` with its uncommitted changes, read-only API 36 emulator, network off, 320 dp) ran `HomeScreenTest` **6 of 6** twice, from 04:47 to 05:07 and from 05:08 to 05:25 (`.local/verify/device-1/`, `.local/verify/device-2/`): the 200% text test with the corrected check, and the new control test. |

## Lock Wait Proofs Checkpoint

Builds [T60](TASKS.md#defects-that-break-approved-requirements), from section 5 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#5-tests-and-evidence): "A lock test treats one second of waiting as proof that requests were serialised."

- **The weakness:** two backend tests took "the second request had not finished after one second" as proof that it waited for a lock: `test_direct_send_cannot_commit_after_the_other_person_leaves` (leaving a Space must wait for a direct message being sent, T03) and `test_the_last_note_slot_goes_to_one_approval_only` (a second agent approval must wait for the first). On a busy machine a request can take longer than a second without waiting for anything, so both tests could pass even if the lock were gone.
- **The fix:** a helper beside `expire_while_waiting` in `backend/tests/test_messaging.py`, `wait_until_blocked(app, pending)`.
  - It reads PostgreSQL's lock table until a request is waiting for a lock that another request of the same test run holds. A request belongs to the run if it holds locks on that run's own schema, so other sessions' test runs never count.
  - It fails at once with the response if the request finishes without waiting, and after 30 seconds if no wait appears.
  - Both tests now use it, and the rest of each test is unchanged.

| Check (2026-10-01) | Result |
| --- | --- |
| The old test could pass falsely | The backend code was copied inside the one-off test container, so the shared files were not changed. In the copy, the send's shared lock on the Space was removed and leaving was made to take 1.5 seconds, as on a busy machine. The old test **passed**. The new test **failed**: "The request finished without waiting for a lock", showing the leave's answer. |
| The new tests on the real code | Both **passed**. All of `test_messaging.py` and `test_agents.py`: **33 passed**. |
## Care Screen Offline Tests Checkpoint

Builds [T63](TASKS.md#defects-that-break-approved-requirements), from section 5 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#5-tests-and-evidence): "The web has no offline tests for Spaces, care or repeating reminders." Written by a background agent on GPT-6.1 Sol, then checked by the audit session. The Spaces screens wait for T13, which is changing them.

- **New file:** `tests/unit/care-ui.test.mjs`, 13 tests in the same form as the other offline screen tests: the screen runs in Chromium with simulated answers, every network request is refused, and none is attempted. The simulated service checks request keys and versions as the API does.
  - **Covered:**
    - the day plan and date navigation;
    - creating a medicine only after confirmation, with a lost answer retried with the same key and body;
    - a refused creation that adds nothing;
    - stopping after confirmation with the version shown, and a stale stop refused until the current instruction is reviewed;
    - a lost stop retried with the same key and version;
    - dose notes sent with the version shown, a lost note retried once, and a refused note leaving the last confirmed one;
    - dose alerts changing only after confirmation;
    - denied reads removing what was shown, and a denied account reading no care data;
    - every view fitting 320 px at 200% text.
- **Defect found and fixed:** a valid long medicine name made the "Stop tracking" confirmation 1,970 px wide on a 320 px screen at 200% text, so the buttons were off screen. Its paragraph now uses the stylesheet's existing wrapping class (`styles.description` in `web/src/features/care/care-screen.tsx`). Nothing else changed.

| Check (2026-10-01) | Result |
| --- | --- |
| Offline care tests | **13 passed**. All of `tests/unit`: **72 passed**, 0 failed, 0 skipped. The web type check passes. |
| The tests can fail | Each check rebuilt the screen inside a throwaway copy of the test file, so the shared source was not changed. With the wrapping class removed, the layout test failed: the page measured 1,970 px wide at 320 px. A new key on the create retry failed the key assertion, and a wrong version on a dose note failed the `If-Match` assertion. |
| Live journey | `care:` against the real preview, API and PostgreSQL. The first run stopped at its 180 s limit while the complete backend suite and an Android build ran on the same machine. The second run **passed** in 138 s, with Playwright's action log on. |
## Android Report, Block And Care Failure Tests Checkpoint

Builds [T61 and T62](TASKS.md#defects-that-break-approved-requirements), items 7 and 6 of the missing tests in section 5 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#5-tests-and-evidence). Written by a background agent on Claude Opus 5.5, then reviewed by the audit session.

- **T61, report, block and unblock (R12): 7 new tests** in `CommunityTest.kt`. A stateful simulated server records each call and its session, can answer with an error, can apply a command and lose its answer, or can answer about the wrong item, and it alone decides what a block hides. The tests cover:
  - real Retrofit requests, with the exact path, body and session and no other headers;
  - no success notice while a request is in flight, and one only after the server confirms;
  - after a block or unblock, the screen reloads what the server now shows;
  - answers about another item are refused;
  - a failed report or block about another item keeps the page or post shown.
- **Defect found and fixed:** any "not found" (404) answer to a community command made the shown page or post look deleted ("This page does not exist or is no longer public."), even when the answer was about something else. For example, unblocking a block already removed on another device hid a page that exists.
  - **The fix** is in `CommunityViewModel.kt`. Report, block and unblock name the item they act on, and a 404 marks the shown page or post as gone only when the command was about it. Loading and the other commands behave as before.
  - **Before and after:** before, all six cases in the new test marked the page or post gone, including the four where it still exists; after, only the two real ones do.
  - **One trade-off:** when blocking a comment's author answers 404 because the post itself was deleted, the post stays shown with "Post not found." instead of the deleted view.
- **T62, care failures (R9): 4 new tests** in `CareTest.kt`. Care has three commands: create, stop and noting a dose. Each already had a test for a server error. The new tests add, for each, a lost answer after the server applied the command, plus a refusal for stop. They check that nothing shows as saved, stopped or noted, and that a retry sends the same key and body. No defect was found.
- **Where the runs happened:** the shared tree twice failed to compile because of the navigation work in progress (T38: `MainNavigation.kt`, then `MainActivity.kt`). So the runs after the fix and the checks below used an isolated copy of `android/`. The first runs, the defect evidence and the full suite used the shared tree.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fix | `CommunityTest` 23 tests, **1 failed**: the new test for 404 answers about another item. `CareTest` 14 passed. |
| After the fix | `CommunityTest` **23 passed** (16 before this task), `CareTest` **14 passed** (10 before). All Android JVM tests: **299 passed** in 20 classes, 0 failed, 0 skipped. |
| The tests can fail | Each check broke one behaviour in the isolated copy: a success notice shown before the call (5 new tests failed), the stop notice shown before the answer (2 failed), no reload after block or unblock (3 failed), and a lost create answer releasing its key (the create test failed). Every existing test stayed green. |

**Found, not fixed here, and now tasks:**
- [T74](TASKS.md#defects-that-break-approved-requirements): the same 404 flaw in liking or saving a listed post, ending a comment, and publishing, deleting or editing a listed draft.
- [T75](TASKS.md#defects-that-break-approved-requirements): report details are cut at 1,000 UTF-16 units while the server counts 1,000 characters, so text full of emoji is cut at about 500 characters, and the cut can split an emoji.
- [T76](TASKS.md#defects-that-break-approved-requirements): Android tests never send resume or cancel for a repeating reminder. Repeating reminder commands and snooze have no tests for a lost answer or a refusal.
- **Not a task:** answers to report and block are not checked for their own id, label or time. Nothing misbehaves because of it today.
## Space Admins Checkpoint

Builds the admin role of [T13](TASKS.md#approved-requirements-not-built-yet) (R2) and step 4 of the [end-to-end plan](TASKS.md#end-to-end-plan) under [DEC-018](DECISIONS.md#accepted-decisions), decided provisionally under the owner's delegation ([DEC-016](DECISIONS.md#accepted-decisions)), following the Space contract's proposal C3-D03.

- **Roles:** one owner, any number of admins, and members. In family and group Spaces the owner makes a member an admin, or an admin a member again, after a confirmation naming the Space, the person and what changes; it carries the reviewed membership version and a request key, so a lost answer can be retried exactly once. Solo and couple Spaces have no admins (`409 ROLE_NOT_AVAILABLE`).
- **What admins do:** invite people (always as members) and withdraw invitations; remove ordinary members; see and answer requests to join a group. **What they cannot do:** change roles, remove the owner or another admin (`409 OWNER_ONLY`), open the Space's settings or visibility, or offer ownership. An invitation admits someone only while its sender is still the owner or an admin, and it leaves the inbox when they are not. Ownership can be handed to an admin; the old owner becomes a member. Rights over tasks, events and documents are unchanged: an admin has a member's.
- **API and data:** `POST /v1/spaces/{space_id}/members/{account_id}/role` with `{"role": "admin" or "member"}`, `Idempotency-Key` and `If-Match`; audit and outbox `space.member_made_admin` and `space.admin_made_member`. Migration `0026` widens the role rule and the membership-command rule; its downgrade refuses while admins or role changes exist.
- **Screens:** web members dialog with role labels, "Make admin" and "Make member", and a removal button for admins only on ordinary members; invitations and join requests open for admins; the group finder says "You are an admin". Android: the same, and an admin's Group access lists only the waiting requests, without the owner-only visibility switch.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | `tests/test_space_roles.py` **5 passed**: the owner's reviewed, retried and refused role changes, with their audit; what an admin can and cannot do, including invitations, join requests, removing members and admins, settings and ownership offers; an invitation that lapses when its sender stops being an admin; no roles in couples; ownership handed to an admin. Every Space, privacy, couple, directory, migration and security test file: **160 passed** (`.local/roles-backend.txt`); the privacy sweep now covers 34 operations, including the new one. |
| Web | Type check passed. All client tests: **127 passed**, including 5 new in `tests/spaces-roles-client.test.mjs` (schemas, the exact request and response checks, and the proxy allowing only `POST` with the review headers). Live, against the API at `0026`: the new `roles:` journey **passed**: the owner makes an admin, the admin invites a newcomer who joins, removes an ordinary member, sees no removal for the owner and no role buttons, and the owner makes them a member again; nothing overflows at 320 px or with 200% text (the check doubles the root text size; the Spaces styles size most text in px, which keeps its size, the open shared text-size scale of DEC-013). Screenshots: `.local/screenshots/roles-make-admin-live-desktop.png`, `roles-members-live-320-200pct.png`. In the same run 6 more Space journeys passed (`.local/spaces-live-roles-20261001.txt`); `solo:` timed out loading the sign-up page and passed on a rerun; `space settings:` ran past its 120-second limit twice while another session's two Gradle builds kept the processor at 100%, then **passed** at 19:59 in 110 seconds with the processor still near 97% (`.local/space-settings-rerun-20261001.txt`). In that last run the test file itself was reported cancelled after the journey passed ("Promise resolution is still pending but the event loop has already resolved"), in the hook that closes the browser; the cause is unknown and the journey's own result is a pass. |
| Android | `SpaceRepositoryTest` **30**, `SpaceViewModelTest` **32**, `GroupRepositoryTest` **10** and `SpaceSettingsTest` **13 passed** (22 new role tests). Debug app and test app built; lint 0 errors. Lint warnings rose from 11 to 129 because another session added Hindi and Telugu string files at 18:24 that do not yet translate every string (115 warnings). On the API 36 emulator (`emulator-5582`, read-only, networking off, 320 dp): all **17** Space screen tests **passed** (`.local/ownership-native-offline-5582.txt`), the 15 earlier ones plus 2 new: `roleActionsFollowTheViewersRoleAndConfirmOnlyTheReviewedMember` (the owner sees Make admin and Make member only on other people, and confirming sends only the reviewed member and version; an admin sees no role actions, no removal for the owner or another admin, removal for members, and Leave) and `roleReviewKeepsExactDetailsAndActionsAtLargeText` (measured font scale 2.0; the account ID and what changes can be scrolled to; both actions stay visible; `.local/screenshots/role-review-native-large-text.png` checked). The VS Code task now expects 17 and, as the newer device scripts already do, sets the `mobile_data` setting to 0, because on this image `svc data disable` left it at 1 and stopped the first attempt before installation. Every Android JVM test class at 20:28: **338 tests, 337 passed**; the failure is `MessagingLiveTest.pollsEveryThirtySecondsWhileConnectedAndEveryFiveSecondsOtherwise`, a new test of another session's live updates work in progress (T65); all 85 Space tests passed. |
| Contract | [OpenAPI](../packages/openapi/openapi.json) regenerated: 161 operations on 134 paths, adding the role change and, from another session's work in progress, `GET /v1/live`. |
| Independent review (22:00) | A blind security review by a second model (Grok 4.7) found no privilege escalation, and one inconsistency: a person who removed a member as an admin, then lost the role or left, got "Membership not found." when retrying that removal with its own key, instead of the original answer; the same happened to a former owner retrying their own role change. Fixed in `service.py`: a retry carrying the caller's own receipt for the same command and the same memberships is answered from it before the current role is checked; it can never change anything. Two new tests in `test_space_roles.py` failed before the fix (404 "Membership not found.") and pass after; they also check that any other key from a former member still gets exactly the missing-Space answer, and that a former owner who has left gets "Space not found." even with their own key, so nothing current is shown. The role tests and every Space, privacy, couple, directory and security test file: **146 passed**. The shared API was restarted with the fix at 22:22. That restart also loaded another session's migrations `0027` (account deletion) and `0028` (moderation), which the development database did not have yet, so readiness answered 503 and signed-in requests failed until the database was migrated to `0028` at 22:29 (both migrations are additive). The live `members:` and `roles:` journeys then passed against it (`.local/roles-members-live-2220.txt`). |
| Device follow-up (22:20) | Two more Space screen tests at 320 dp and a measured 200% text: `coupleChoiceAndPartnerStatusStayReadableAtLargeText` (choosing Couple, "Only you and one partner you invite", Create reachable, "Waiting for your partner", the invitation hint, then "With" the partner and no role buttons) and `spaceSettingsDescriptionCountsCharactersAndKeepsSaveReachableAtLargeText` (280 emoji count as 280/280 and Save changes stays reachable). All **19** Space screen tests passed; the VS Code task now expects 19. Screenshots checked: `.local/screenshots/couple-space-waiting-native-large-text.png`, `space-settings-description-native-large-text.png`. |

Live since about 19:20: the development database is at `0026` and the shared API was restarted.

**Boundary.**
- **Not decided or built:** per-Space permission settings, such as letting every member invite; moderator, guest and observer roles; admins with rights over content.
- **Device:** the role controls and the role confirmation were run on the emulator offline, with simulated answers; no live Android journey changes a role against the API.
- **Accepted from the review (low):** an admin made a member again who retries their own invitation key gets "Space not found." rather than the invitation, which no longer admits anyone; the database allows an admin row in any Space type, and only the service refuses roles in couple and solo Spaces (no path writes one).
- **Seen on the device, not changed here:** the Android Spaces screen header still says "Family Spaces" while a couple or group Space is open; this belongs to the Android wording part of [T37](TASKS.md#design-and-experience).

## Android Not-Found Answers And Report Length Checkpoint

Builds [T74 and T75](TASKS.md#defects-that-break-approved-requirements), which [T61](#android-report-block-and-care-failure-tests-checkpoint) found. Written by the same background agent on Claude Opus 5.5, then reviewed by the audit session.

- **T74, other commands (R4).** Liking or saving a post listed on a page, ending a comment, and publishing, editing or deleting a listed draft now say which item they act on, as report and block do since T61. A 404 marks the shown page or post as gone only when the command was about it.
  - **The new test:** `aFailedCommandAboutAListedPostDraftOrCommentKeepsThePageOrPostShown` has nine 404 cases. In six, the command is about something inside the shown page or post. In three, it is about the shown post itself (like, edit, delete), which must still show as gone.
  - **Before the fix:** all nine marked the page or post as gone.
  - **Not changed:** creating a comment or reply (the server answers a reply to a removed comment with 409, not 404), and following a page, which is always about the shown page.
  - **Still possible:** a 404 for ending a comment or acting on a listed post can also mean the whole page or post is gone. The screen then shows the error and keeps the content until the next reload.
- **T75, report details (R12).** A new helper, `takeCodePoints`, keeps at most 1,000 characters counted as the server counts them (code points) and never splits a character made of two UTF-16 units. The view model trims the details and then applies it, and the report dialog's input limit uses it too (one line in `CommunityScreen.kt`, away from the navigation change T38 made there).
  - **Before:** 1,000 emoji were sent as 500 characters, and a letter followed by 1,000 emoji was cut to 501 characters, ending in half an emoji. Plain text was already right.
  - **Still possible:** emoji made of several code points, such as flags and family emoji, can still be cut into parts at the limit, because the server counts code points too.
  - **The same flaw elsewhere:** a page description is checked in UTF-16 units (`description.trim().length > 500`), so emoji-heavy descriptions are refused early. [T73](TASKS.md#approved-requirements-not-built-yet), which adds page editing with the same checks, fixes it.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fix (shared tree) | `CommunityTest` 25 tests, **2 failed**: the two new tests. |
| After the fix | `CommunityTest` **26 passed**. A third test, of the dialog's limit helper, was added with the fix, because the helper did not exist before. This run used an isolated copy: the shared tree briefly did not compile, because the generated `MessagingViewModel_Factory` did not match another session's messaging changes. All Android JVM tests, in the shared tree: **323 passed** in 21 classes, 0 failed, 0 skipped. |
| The tests can fail | Each check broke one behaviour in the isolated copy, and exactly the expected tests failed. Without the subject on `save`, the listed-post save case failed. Ignoring which item a 404 is about on a post failed the three shown-post cases and T61's report case. A helper cutting UTF-16 units again failed both T75 tests. |
## Android Repeating Reminder And Snooze Tests Checkpoint

Builds [T76](TASKS.md#defects-that-break-approved-requirements), item 8 of the missing tests in section 5 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#5-tests-and-evidence), whose remaining gaps T61 listed. Written by a background agent on GPT-6 Astra, then reviewed by the audit session.

- **13 new tests (R9).**
  - **Controls** (`ReminderViewModelTest`): resuming a paused repeating reminder, cancelling an active or paused one, and skipping the next time, each only after confirmation; resume and skip report when the reminder has already ended. Before this, no test sent resume or cancel, and skip was tested only in the repository.
  - **Lost answers and refusals** (`ReminderViewModelTest`): for every repeating reminder command and for snooze, the simulated server applies the command and then loses the answer, or refuses it (409, or 412 for a stale version). The shown reminder does not change, no success notice appears, and a retry sends the same key, body and version. A refusal is not retried blindly. Three existing tests for a server error now also check that no notice appears.
  - **Exact requests** (`ReminderRepositoryTest`): real Retrofit requests for creating a repeating reminder (only the reviewed token and the key), snoozing (only the offered minutes and the key), and resume, skip and cancel (the reviewed version and the key).
- **No defect found.** Only the two scheduling test files changed. Lines were removed only where the simulated server was rewritten (a cancelled reminder now has no pause reason, as the schema requires), and in the clean-up, which now waits for held answers and cancelled work, because a deliberately failed test had left them running.

| Check (2026-10-01) | Result |
| --- | --- |
| Test classes | `ReminderRepositoryTest` **26 passed** (23 before), `ReminderViewModelTest` **29 passed** (19 before). |
| The tests can fail | In an isolated copy, a new key on retry failed the original-command check, and a snooze notice shown before the answer failed the no-notice check. |
| All Android JVM tests | **312 passed**, 0 failed, 0 skipped, in an isolated copy of `android/` taken at 19:39 with these tests added (it predates T74 and T75, whose run had 323). |
## Android Followed Pages And Page Editing Checkpoint

Builds [T72 and T73](TASKS.md#approved-requirements-not-built-yet) (R4, R13, audit M7), Android parity with the web. Built by the completion session (implementation by a GPT-6.1 Sol background agent, then reconciled and checked). While it worked, nine tests for the same tasks appeared in `CommunityTest.kt`, written first by another session; their 21:10 checkpoint commit contains them. The implementation follows them: where the brief differed in three places, the earlier tests won (one error and one Retry when your own pages fail to load; the app's usual "No connection. Nothing new is confirmed." for a lost answer; the wording "Use a name of 1 to 80 characters and a description of up to 500."), and four of this session's new tests were changed to match before anything was recorded.

- **T72, pages you follow.** Your pages lists the pages you follow (`GET /v1/me/following`, 20 at a time), below the pages you own. While it loads it says "Loading pages you follow…"; "You do not follow any pages." with Discover pages appears only after a successful empty load; a failure shows only the error and Retry; Load more adds the next page without duplicates, and a failed Load more keeps what is shown. Unfollow sends the existing command and the page leaves the list only after the server confirms it; the list then reloads from the server. A response with a page that is not followed is refused. If your own pages fail to load, the followed list is not asked for and both sections offer Retry.
- **T73, editing your page.** Edit page appears for the owner. The editor keeps the page as it opened; Save sends only the changed fields (`PATCH /v1/pages/{id}`, `If-Match` of that version), so a change made elsewhere meanwhile is refused (412: "This page changed since you opened the editor. Close it and reload before editing again.") instead of overwritten, and refreshing the page never changes what the editor saves against. Unchanged text sends nothing. A refusal or lost answer keeps the text open, and closing a failed editor reloads the page. **Changed behaviour:** creating a page checked the description in UTF-16 units; it now counts characters as the server does (a 500-emoji description failed before and passes now), and text fields cap input without splitting an emoji.
- **Response size:** twenty followed pages with the longest emoji names and descriptions decode within the existing 64 KiB limit (a wire test checks it); `IdentityModule.kt` is unchanged.

| Check (2026-10-01) | Result |
| --- | --- |
| JVM | `CommunityTest` **53 passed** (26 before: 9 tests by the other session and 18 by this one). Every Android JVM test class: **365 tests, 364 passed**; the failure is `MessagingLiveTest.pollsEveryThirtySecondsWhileConnectedAndEveryFiveSecondsOtherwise`, part of the gaps session's live updates in progress (T65), which failed the same way before these changes. |
| Device | On the API 36 emulator (read-only, networking off, 320 dp): `CommunityScreenTest` **6 of 6 passed** (`.local/community-native-offline-5582.txt`), including `followedPagesLoadingEmptyFailureAndUnfollowUseSeparateStates` and `largeTextNarrowPageEditorKeepsFieldsAndCommandsReachable` (320 dp, 200% text). |
| Lint and builds | Debug app and test app built; lint **0 errors**, 27 warnings, 15 of them the new English strings awaiting Hindi and Telugu (T70). |

**Boundary.** No live Android journey against the API follows, unfollows or edits a page; the screens are checked with simulated answers. The new strings show in English in Hindi and Telugu until T70 translates them.

## One Verify Command Checkpoint

Builds [T64](TASKS.md#defects-that-break-approved-requirements), from audit finding [M5](ENGINEERING_AUDIT_2026-10-01.md#m5-there-is-no-automated-check) ("No CI configuration exists. Results are produced by hand and copied into four documents") and section 8's "one local command that runs every check".

- **The command:** `npm run verify` runs `scripts/verify.ps1`. It runs the structure, design token, web type check, web client, offline screen, backend and Android JVM suites one after another, each with the command the [runbook](runbooks/README.md#verification-commands) names; `-Suite live` runs the live journeys.
- **What it writes:** each suite's log, plus `summary.md` and `summary.json`, under `.local\verify\<date-time>\`. The summary gives each suite's result, test counts and time, the commit and the number of uncommitted changes, and every file that changed while the suites ran.
- **How it judges a suite:** it fails when its command fails, or when it reports a failed test even with exit code 0. A suite that cannot start, such as the live journeys without the preview, is reported as not run, and the command then exits with 1.
- **Changing nothing:** it changes nothing in the repository and restores the environment variables it sets. It finds the Playwright Chromium, uses Android Studio's runtime for Gradle, and runs the Android tests with `--rerun`, so none are skipped as up to date.
- **One finding from the first run, now in the summary:** other sessions edit the working tree while checks run, so a long run can mix two states. The summary therefore lists the files that changed during the run; a test run showed a file created mid-run and another session's change to `.vscode/tasks.json`.
- **Worker test limit:** `test_separate_worker_process_recovers_persisted_due_work_without_duplicate` starts the reminder worker twice. Each start took about 40 to 52 s on this busy machine and over 60 s while three backend suites ran, so its guard against a hung worker went from 60 to 180 s. Its assertions are unchanged, and it passed (104 s).

| Check (2026-10-01) | Result |
| --- | --- |
| The command itself | Run through `npm run verify`, it passed structure 5 of 5, tokens 9 of 9, the type check and client 111 of 111. Pointed at a missing browser, the offline screens reported 0 of 72 passed and exit code 1. An unknown suite stopped with a list of valid ones. The counts were read correctly from pytest, node and JUnit reports, including a collection error and cancelled tests. A file created during a run was listed in the summary. |
| First complete run, part 1 (18:37–20:31, `.local\verify\complete-part1`) | Structure **5 of 5**, tokens **9 of 9**, type check **passed**, web client **127 of 127**, backend **463 of 478** in 6,742 s while two other backend suites and Android builds ran. Of the 15 backend failures, 13 came from migrations other sessions wrote during the run: `0026_space_admins`, `0027_account_deletion` and `0028_moderation`. The database stayed at an older version than the files, and models were loaded before their migration existed. T57's and T58's tests failed for that very reason: `alembic check` said "Target database is not up to date", and readiness answered 503 for the database one migration behind. The other 2 were start-up limits under load: the live updates server test and the worker test above. The four affected files run again afterwards: **123 of 124**; the worker test then passed with the 180 s limit. |
| Part 2 (21:01–21:09, `complete-part2`) | Offline screens **51 of 80**. All 29 failures come from the web work in progress for live updates and browser alerts (T65, T66). 27 tests saw a `GET /api/live` request that the offline fixtures do not simulate yet; the gaps session's own browser alerts test failed; and an existing inbox settings test now finds two unchecked switches, because T66 added one. |
| Part 3 (22:07, `complete-part3`) | Android JVM **364 of 365**. The failure, `MessagingLiveTest.pollsEveryThirtySecondsWhileConnectedAndEveryFiveSecondsOtherwise`, belongs to T65's work in progress. |
| Live journeys (22:53–23:07, `.local\verify\live-2240`) | **26 of 28 passed**, in the first run of `npm run verify -- -Suite live`, while other sessions changed 33 files. `alerts:` failed because another session restarted the shared API 31 s into the run, during that journey; alone it **passed** (192 s). `messages:` failed waiting 20 s for a removed member's chat to say "You no longer have access to this conversation."; alone it **passed** (83 s). With live updates on the web (T65), an open chat asks the server only every 30 s and nothing tells it that a membership ended, so that step passes only when a poll falls inside the 20 s; recorded as [T86](TASKS.md#defects-that-break-approved-requirements). |

**Live journeys on the shared stack.** Two unexplained live failures were traced:
- **`reminder requests:` in the T59 run:** it failed at about 17:21, the moment another session restarted the shared API (started 11:51:01 UTC, 17:21:01 local time).
- **`reminders:` in a repeat run (about 18:24):** a `read ECONNRESET` on `GET /api/notifications` between the browser and the web preview. The preview's process had run since 10:59, and the API answered every notifications request in that period with 200. The journey passed alone (125 s). Another session recorded the same kind of reset on `GET /api/feed` at 13:20.

The journeys are unchanged, because retrying around a dropped connection could hide a real server failure.
## Android Post Editor Opened Version Checkpoint

Builds [T77](TASKS.md#defects-that-break-approved-requirements) (High). The audit session's agent found it while building T72 and T73, and fixed it in a follow-up; it ran on Claude Opus 5.5 and the audit session checked its work.

- **The defect (R9):** Android's post editor (T31) kept the text from when it opened, but saved with the version of the latest refresh. After a refresh, or a reload another command causes, Save therefore overwrote newer changes to the title and the body, including fields the person never touched. The web had the same flaw before T39.
- **The fix:**
  - **Saving:** `startEdit` keeps the post as it was when Edit was chosen. Save compares the person's text with that post and sends only the fields that differ, with `If-Match` set to its version. An unchanged post sends nothing.
  - **A refused save:** a 412 shows the web's message, "This post changed since you opened it. Reload to review the current version.", and keeps the text open. The post shows as saved only after the server confirms it.
  - **The request:** `PATCH /v1/posts/{id}` now carries only the changed fields, which the server's `UpdatePost` accepts (`"title": null` removes a title; the text cannot be null). Before, both fields were always sent.
- **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)):
  - **A conflicting save:** it showed the server's message and now shows the web's. The existing test `postEditSendsTheReviewedVersionAndKeepsTheTextUntilConfirmed` expects the new wording, as T77 requires.
  - **The simulated servers:** they now take the request as a map instead of `CreatePostDto`, and their assertions check the same values.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fix | `CommunityTest` 58 tests, **6 failed**: the 5 new ones and the 412 wording. The key failure shows the overwrite: after another device saved "Meet at 9", the app sent version `v2` with the editor's old text, "Meet at 7". |
| After the fix | `CommunityTest` **58 passed**. Four checks, each breaking one behaviour in an isolated copy, were all caught: saving against the refreshed post, always sending the title, showing the server's 412 text, and showing "Changes saved." before the answer. `:app:assembleDebug` and `:app:compileDebugAndroidTestKotlin` succeeded. |
| All Android JVM tests | In the audit session's own run (`npm run verify -- -Suite android`, 22:30, `.local\verify\after-t77`): **369 of 370 passed**. The failure, `MessagingLiveTest`, belongs to the live updates work in progress (T65). |

**Boundary.** The editor was not run on a device. The new message is English only, like the post editor's other messages, until T70 reaches them.
## Android Request Lock Analysis Checkpoint

Records [T82](TASKS.md#defects-that-break-approved-requirements), audit finding A10 ("Every API call holds one app-wide lock"). It was tried and reverted; nothing changed in the app.

- **Confirmed:** `AccountRepository.authorized`, which every signed-in Android request goes through (about 100 calls in 11 features), holds one lock for the whole app across the network call. Two new tests showed it on the current code. A second request waited until a slow first one finished, and signing in again waited for an old request too. Both stopped at a 5 s limit.
- **Tried:** the lock held only to read the session and to clear it, with a session cleared after a 401 only if it was still the one that request used. Both tests then passed, as did every other Android JVM test (372 of 373; the failure is T65's `MessagingLiveTest`), and both builds succeeded. A check in an isolated copy, clearing the session after any 401, failed the new sign-in test as intended.
- **Why it was reverted:** the lock also keeps a late answer from overwriting a newer one, and no test covered that. Today a command cannot start while a refresh is out, so the refresh's answer always lands first. Without the lock, a chat poll that started before a delete can answer after it. Android's `mergeMessages` keeps whatever arrives last, so the deleted message would come back until the next poll. This is the problem T41 fixed on the web. The same can happen wherever a screen refreshes while a command runs: reminders, the community feed, Spaces, events, tasks and documents.
- **What it needs first:** each of those screens must ignore answers older than its latest change, with a test of a late answer for each. Then the lock can be narrowed. Other sessions are changing most of those screens now (T65, T67 to T70 and T83 to T85, first numbered T79 to T81), so this waits.
- **Kept:** one new test, `aRefusedRequestStillSignsOutTheSessionItUsed`, which covers the 401 clearing in `authorized` that only `current()` tested before. `AccountRepositoryTest`: **11 passed** on the unchanged code.

## Web Spaces Offline Tests And Character Counts Checkpoint

Builds [T78 and T79](TASKS.md#defects-that-break-approved-requirements) (R2, R13). The offline tests were written by a Claude Sonnet 5.5 background agent and checked by the completion session; while reviewing them the session found T79.

- **T78, offline tests.** `tests/unit/spaces-ui.test.mjs`, 7 tests with a simulated server and the network blocked: creating a couple Space with one key, "Waiting for your partner" and then "With" the partner; the owner making someone an admin through a lost answer, whose Retry sends the same key, body and version, and no role buttons in a couple Space; what an admin sees and does (no role changes or settings, removal only of ordinary members, invitations and join requests); settings saved against the reviewed version, and a changed version asking for a reload; Find groups showing a request as sent only after the server answers; 320 px with 200% root text; and T79. Its simulated server holds the live connection open itself, so these tests do not wait for the T65 fixtures.
- **T79, the defect.** The web's answer schemas checked names and descriptions with UTF-16 lengths, which count an emoji twice, while the server counts characters. A Space, member, invitation, join request or Find groups entry that is valid on the server could make the web refuse the whole answer, so the Spaces list (or members, invitations, Find groups) failed to load for everyone in that Space. The forms also stopped typing at half the emoji the server allows. **Fixed:** the schemas count characters (the same approach as [T46](TASKS.md#defects-that-break-approved-requirements) for posts); the counters count characters; the inputs stop at twice the limit in UTF-16 units, so the full limit of emoji fits, and text past the limit shows "Use up to N characters." and cannot be saved. Android already counted characters when saving; its cut while typing a new group's description and a join note now keeps whole characters.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fix | `tests/spaces-text-client.test.mjs`: **3 of 3 failed** (an 80-emoji name and a 280-emoji description refused; an 80-emoji person's name refused; the helpers missing). With only the old schema limits put back for one run, the T79 screen test failed waiting for the Spaces list, which never loaded (`.local/t79-ui-before.txt`; the file was restored and its hash checked). Android: with the old cut put back for one run, `joinNoteKeepsWholeCharactersUpToTheServerLimit` failed, 1 of 11 (`.local/t79-android-before.txt`). |
| After the fix | Web type check passed. All web client tests: **133 passed**. `tests/unit/spaces-ui.test.mjs`: **7 of 7 passed** twice. Android `GroupRepositoryTest` 11, `SpaceRepositoryTest` 30, `SpaceSettingsTest` 13 and `SpaceViewModelTest` 32: **86 passed**; device tests compiled. Live against the local API: `space settings:`, `spaces:` (both), `groups:` and `couples:` **5 of 5 passed** (`.local/t79-live-2.txt`). A first attempt, the first command in a fresh terminal, ended after 63 s with the test file cancelled ("Promise resolution is still pending but the event loop has already resolved") before any journey ran; the cause is unknown. |

**Boundary.** The whole offline suite (`test:unit`) still has the failures from the T65 and T66 work in progress; only the new file was run here. The Android cut while typing a new group's description has no test of its own; saving was already checked in characters.

## Page Rules And Pinned Posts Checkpoint

Builds [T83](TASKS.md#community-management) (R3, R4; [DEC-025](DECISIONS.md#accepted-decisions) parts 1 and 2, provisional until the owner reviews it), in the building session, on backend, web and Android.

- **Rules:** the page owner writes rules in Edit page, up to 2,000 characters on several lines, saved like the other fields against the version the editor opened with (412 if the page changed meanwhile); an empty text removes them. Everyone sees them, signed out too, in a Rules section under the page header.
- **Pinned posts:** the owner pins up to 3 published posts with Pin to top and removes them with Unpin. The page shows them, latest pin first, in a Pinned section above its posts, each marked Pinned, and leaves them out of the date list below, which says "No other posts." if nothing else is left. Visitors see the same.
- **What the server enforces:** a draft cannot be pinned (409 `NOT_PUBLISHED`), nor a post a moderator hid (409 `POST_HIDDEN`), and a fourth pin is refused (409 `PIN_LIMIT_REACHED`). A hidden post leaves the public pinned list, its owner still sees it marked, and it counts toward the 3 until it is unpinned, so restoring it can never make 4. A deleted post is unpinned. Pins on one page are counted under a lock on the page, so parallel pins never pass 3. Each pin and unpin is audited (`public.post_pinned`, `public.post_unpinned`).
- **Storage and API:** migration `0029` adds `public_pages.rules` (empty by default, at most 2,000 characters) and `public_posts.pinned_at` with a partial index; going back below `0029` refuses while any page has rules or any published post is pinned. Three new operations: `POST /v1/posts/{post_id}/pin`, `POST /v1/posts/{post_id}/unpin` and `GET /v1/pages/{page_ref}/pinned-posts` (signed out allowed). The OpenAPI file was regenerated: 174 operations on 147 paths. The development database was migrated to `0029` (the only pending migration) and the shared API restarted after a fresh process had loaded the whole application; the new route then answered "Page not found." for an unknown page.
- **Kept** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): a page's post list still holds every published post in date order, pinned ones too, so a client that does not know about pins still shows them; pinning changes neither the post nor its version tag; `rules` and `pinned` are new fields that older clients ignore.
- **Changed behaviour:**
  - **Page edits up to 64 KiB** at the API and the web proxy, as for posts: 2,000 characters of rules exceed 16 KiB when JSON escapes every character.
  - **Android page lists up to 512 KiB:** found pages (`/v1/discover/pages`) and followed pages (`/v1/me/following`) had a 64 KiB response limit, and twenty pages with 2,000 characters of rules can exceed it, in Hindi or Telugu as well as emoji. The existing limit test now expects 512 KiB for those two lists; your own pages (at most 5) keep 64 KiB, and a new test shows five of the largest still fit.
  - **Web community action rows, 40 to 44 px:** the new screen test checks every button and link in the page's action rows, and found that the community stylesheet typed 40 px over the 44 px token target ([DEC-013](DECISIONS.md#accepted-decisions)). They now take the token, so those rows are 4 px taller on every community screen. Measured on a live page at 320 px and 200% text, Like and Comments went from 40 to 44 px and the page still fits (`.local/screenshots/community-actions-before-320-200.png` and `community-actions-after-320-200.png`; "before" puts the old rule back with an injected style). Recorded under [T37](TASKS.md#design-and-experience); the report dialog's 36 px reason rows are left there as Ready.
- **Numbering:** these tasks were first numbered T79–T81; the completion session then gave T79 to the Spaces defect above, so they became T83–T85.

| Check (2026-10-01) | Result |
| --- | --- |
| Backend | `test_page_rules_and_pins.py`, 6 new tests: rules against the reviewed version (428, 403, 412, 422, clearing, and 2,000 escaped emoji, over 16 KiB, accepted); pin order, limit, refusals, idempotent unpin, a deleted post freeing a place, a block hiding the list, audit counts; a hidden post; parallel pins; the OpenAPI description; the migration keeping pages and posts and refusing to lose rules or pins. With the community, moderation and migration files: **72 passed** (449 s). |
| Web | Type check passed. Client **11 of 11** in `tests/community-client.test.mjs` (3 new: the proxy forwards pin commands with the session and the pinned list signed out, and nothing else; schemas and checks for rules, pins and the pinned list; page edits up to 64 KiB however the JSON is encoded). Offline screens **6 of 6** in `tests/unit/community-ui.test.mjs` (2 new: rules saved against the reviewed version and then shown; a pinned post shown once, marked, above the date list, unpinned back into it, and a refused pin, at 320 px with normal and 200% text). The live `community:` journey **passed** with new steps: the owner writes rules and pins the post, a signed-out visitor sees both and the pinned list, and unpinning returns the post to the date list (`.local/screenshots/community-rules-pinned-live-mobile.png`). |
| Android | `CommunityTest` **64 passed** (6 new: the pinned list from the server and a pin shown only once confirmed; a refused or lost pin never shown as pinned; pinned-list checks and the pin routes on the wire; rules edited against the opened version and counted as the server counts; rules and pins checked like other public facts, with older answers still readable; page lists with the longest rules decoding through their limits). All Android JVM tests, run in a private copy just before the page-list limit change: **375 of 377 passed**; the 2 failures are other sessions' work in progress in code this task did not touch, `MessagingLiveTest` (T65, failing before these changes) and `MessagingTest.sessionLossClearsConversationsAndRequiresSignIn`. Lint **0 errors** (35 warnings, 8 of them the new English strings awaiting Hindi and Telugu, T70). Debug app and test app built. |
| Device | On this session's own read-only API 36 emulator, networking off, 320 dp: `CommunityScreenTest` **7 of 7 passed** (`.local/t83/community-native-offline-5582.txt`), including the new `largeTextNarrowRulesAndPinnedPostShowOnceAboveTheDateList` at 200% text (`.local/screenshots/community-rules-pinned-native-large-text.png`). The first attempt ended before any test with "Process crashed."; the system recorded an ANR, "failed to complete startup", on the freshly booted emulator (boot took 414 s), and the unchanged retry passed. The emulator was shut down afterwards. |

**Boundary.** No live Android journey against the API pins a post or edits rules; the Android screens are checked with simulated answers. Moderators cannot pin yet (T84). The new labels show in English in Hindi and Telugu until T70 translates them.

## Late Answers On The Web Checkpoint

Builds [T87](TASKS.md#defects-that-break-approved-requirements), found while checking T82's question on the web: can an answer that started before a change land after it and undo it?

- **The defect (R9):** the web refetches every query when the window regains focus. Three screens put a save's result straight into the query cache: account settings (the profile, also shown in the header), an event's details, and the inbox's reminder setting. If a refetch was already under way, its older answer arrived after the save and replaced it.
  - **What the person saw:** the old name, the old event or the setting switched back, until the next refetch.
  - **What it could cause:** a later edit of the event or the setting then started from the old version, so the server refused it as changed.
- **The fix:** before storing a save's result, each of the three screens cancels any refetch of that query, as TanStack Query advises (`cancelQueries`). A cancelled answer is dropped. The places that refetch after a change instead of storing its result already handle this. The alert settings' own cache writes are untouched; they wait for conflict C10.
- **The tests:** one new test for each screen. The simulated server holds the refetch that the window's focus starts, the person saves, and the server then releases the older answer. The test waits until that answer has arrived or been cancelled, then checks for 1.5 s that the screen still shows the saved value. The event and setting tests also save again, and check that the second save names the new version.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fix | All three new tests **failed**: the older answer replaced the saved profile, the saved event and the saved setting. |
| After the fix | `account-ui` **2 passed**, `events-ui` **3 passed**, and the new inbox test passed. The web type check passes. All offline screens: **65 of 92**; every one of the 27 failures is the `GET /api/live` request from the live updates work in progress (T65), and nothing else failed. |

## Android Spaces Screens Send One Request At A Time Checkpoint

For the prerequisite of [T82](TASKS.md#defects-that-break-approved-requirements): before the app-wide request lock can be narrowed, each screen must not let a refresh answer after a newer change. The Android Spaces screen, Space settings and group access (join requests) already meet it, without the app-wide lock: each screen runs one request at a time and ignores Refresh while a change is unanswered, so nothing it started earlier can arrive later.

| Check (2026-10-01) | Result |
| --- | --- |
| New tests | `aRefreshDuringAnUnansweredRoleChangeIsNotSentSoItCannotBringBackTheOldRole` (`SpaceViewModelTest`), `aRefreshDuringAnUnansweredSaveIsNotSentSoItCannotBringBackTheOldName` (`SpaceSettingsTest`) and `aRefreshDuringAnUnansweredDecisionIsNotSentSoItCannotBringBackTheRequest` (`GroupRepositoryTest`): the server holds the change, Refresh is pressed, no read is sent, and the change's result shows once answered. `SpaceViewModelTest` 33, `SpaceSettingsTest` 14, `GroupRepositoryTest` 12 and `SpaceRepositoryTest` 30: **89 passed**. |
| The tests can fail | With both the screen's request gate and its lock removed for one run, the role change test failed, with 5 older tests (`.local/t82-mutation.txt`); with only the gate removed, the screen's lock still held and every test passed. The file was restored and its hash checked. |

## Security Review Of Today's New Code Checkpoint

Builds [T88–T91](TASKS.md#defects-that-break-approved-requirements). On 2026-10-01 two read-only security reviews checked the code built after the engineering audit:
- **Live updates, account deletion, moderation, and Space roles and couples:** reviewed on Claude Opus 5.5.
- **Documents, search, the agent, page rules, and the web proxy's changes:** reviewed on GPT-6.1 Sol.

They found four problems, none critical or high, and confirmed the rest as sound. All four were fixed with a test that failed first.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| T88 | Medium | **An owner's block was ignored when an admin reviewed join requests.** The pending list and Approve compared the person only with whoever reviewed, which before DEC-018 was always the owner. Someone the owner blocked stayed visible to an admin and could be let in, then read the group and message the owner. | `pending()` and `decide()` in `spaces/directory.py` also check a block with the owner, as the group directory already does. |
| T89 | Medium | **Agent requests that waited for the person's lock acted on the authorization from before the wait.** A member removed, or a session revoked, while `create_run`, `list_runs` or `delete_memory` waited still got the history or acted. | Session and membership are checked again after the wait (`agents/service.py`), as T04 does elsewhere. |
| T90 | Medium | **A session check repeated in the same database session reused the copy loaded before the wait.** A revocation committed meanwhile was missed. This is the cause behind part of T89, and it applies to every check without the lock. | `IdentityService.authenticate` always reads the current rows (`populate_existing`). |
| T91 | Low | **Demoting or removing an admin only paused their waiting invitations.** Making them an admin again brought the invitations back, against DEC-018. | Their waiting invitations end when they are made a member, leave or are removed, as on a handover of ownership. |

- **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): accepting an invitation whose sender was made a member again now answers 409 `INVITATION_CLOSED`, as after a handover of ownership. Before, it answered 404 while the invitation stayed paused. `test_an_invitation_lapses_when_its_sender_stops_being_an_admin` now expects 409; the refusal it checks is unchanged.
- **Not changed:** whether blocks should also stop invitations into private Spaces. An admin, like the owner, can still invite someone the owner blocked; that is a product question nobody has decided.
- **Found sound** (summarised from the reviewers):
  - Live updates send hints only to the people who can see the change now, and never content. A stream stops within about 75 s of sign-out or deletion.
  - Deleting an account needs the password, survives races, and erases the listed data.
  - Moderators cannot decide on their own content, and reporters stay anonymous.
  - Only the owner changes roles, and the two-person limit on couple Spaces holds even when two people join at once.
  - The web app renders no raw HTML anywhere (no `dangerouslySetInnerHTML` or `innerHTML`), so everything people write is shown as text. Every link it builds is a fixed path or uses IDs that its schemas check are UUIDs. The audit session checked this itself.
- **Fixed before the review ended:** the reviewer of deletion found two defects that the gaps session fixed meanwhile, not yet committed then. Deleting an account failed with a 500 because of a query that lost its tables, and page rules survived erasure.

| Check (2026-10-01) | Result |
| --- | --- |
| Before the fixes | All six new tests **failed**. They are in `test_space_roles.py` (a blocked person listed and approved; an invitation revived after promotion, and after removal and return), `test_agents.py` (history returned to a removed member; a run created with a revoked session) and `test_security_sweep.py` (the cached session passed). The first version of the last test kept no reference to the first copy, so the copy was read again and it passed; it now keeps one, as real callers do. |
| After the fixes | `test_space_roles.py`, `test_space_directory.py`, `test_agents.py`, `test_security_sweep.py`, `test_identity.py`, `test_spaces.py` and `test_couple_spaces.py`: **189 passed**. |
| Complete backend suite | The first run, at about 00:05, ended with all 538 tests in error after 3 minutes. Two sessions had each written a migration numbered `0030` at the same moment, so Alembic found two newest revisions; one of them was renumbered `0031` shortly after. `npm run verify` now checks for this before starting the backend suite and says which files clash. Run again from 00:25 to 00:53 (`.local\verify\after-security-2`): **519 of 544 passed**. The 25 failures are migration round trips and model comparisons (12 in `test_migrations.py`, 2 in `test_reminder_series.py`, 2 in `test_alerts.py`, 1 in `test_care.py`), 7 page moderator tests and 1 page rules test. The page moderator and page lifecycle work in progress (T84, T85) changed the community models while its migration `0031` was being written, and 15 files changed during the run. No test of the agent, identity, Spaces or security sweep failed. |
## Repeating Reminder And Snooze Offline Tests Checkpoint

Builds [T92](TASKS.md#defects-that-break-approved-requirements), from section 5 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#5-tests-and-evidence): the web had one offline test for repeating reminders, about a timezone list that fails to load. Written by a background agent on GPT-6.1 Sol, then checked by the audit session.

- **New file:** `tests/unit/series-ui.test.mjs`, 29 tests in the same form as the other offline screen tests: the reminder screen and the inbox run in Chromium with simulated answers, and every network request is refused.
  - **Covered:**
    - a daily and a weekly series through their review, which lists the task, the recipient, the rule, the first and last day, the timezone, the number of reminders, the first times and "In-app only";
    - the form's limits: at least one weekday, at most 30 days or 4 weeks apart, and a last day at most 365 days after the first;
    - when the clock skips the chosen time, "Skip that day" previews again, and the save uses the newer preview;
    - a save whose answer is lost (no connection, or 503) retried with the same key and preview, with nothing shown as saved;
    - a refused save (409 or 422) closing the review, with a new key for the next save;
    - pause, resume, skip and cancel only after confirmation, each sending the version shown, and the notice when no reminder times remain;
    - a lost command that cannot be dismissed and is retried with the same key, and a refused one (409 or 412) that closes and reloads without claiming success;
    - snooze: each of the four choices, no Snooze button once a reminder cannot be snoozed again, times at or past the next reminder disabled, a lost answer retried with the same key and minutes, and a refused one;
    - the form, the review, the list and a confirmation fitting 320 px at 200% text.
  - **Left out:** changing a series and moving its next time, which belong to the unrecorded alerts work (conflict C10).
- **Defect found and fixed:** a refused snooze (409 or 422) left the snooze dialog open on the old copy of the reminder, still offering the times worked out from it. It now closes, the reason shows in the inbox, and the inbox reloads, as a refused series change already did (`web/src/features/notifications/notification-screen.tsx`, 2 lines).

| Check (2026-10-02) | Result |
| --- | --- |
| Before the fix | 27 of 29: the two refused-snooze tests failed with "A refused snooze must close the stale review" (`.local/t92/series-before.txt`). |
| The tests can fail | Eight deliberate breakages, each made inside a throwaway copy of the test file so the shared source was not changed, each made the intended test fail: a new key when retrying a save, a command or a snooze; a refused save kept; Pause sent without confirmation; no `If-Match`; a form row too wide for 320 px; and the snooze fix undone (`.local/t92/mutation-results.json`). |
| After the fix | `series-ui`, `reminder-ui` and `reminder-controls` together: **50 of 50 passed** when rerun by the audit session (`.local/t92/coordinator-rerun.txt`). The web type check passed at 01:16 with the fix. A later run fails only in `web/src/features/community/client.ts`, which the page moderator work in progress (T84) changed at 01:33. |
## Android Device Tests For Care, Events, Calendar And Repeating Reminders Checkpoint

Builds [T93](TASKS.md#defects-that-break-approved-requirements), from section 5 of the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#5-tests-and-evidence): Android had no device tests for chat, care, events, the calendar, checklists, groups, Space settings or repeating reminders. Written by a background agent on Claude Opus 5.5, then checked by the audit session. Chat is left out while the gaps session changes it (T65, T67).

- **New device tests:** 33 in four classes, in the same form as the existing ones. Each screen is built from constructed state with stand-in actions, on a read-only API 36 emulator with the network off, at 640×1280 pixels and density 320 (320 dp wide). No app code was changed to make them testable; one shared helper file, `ScreenChecks.kt`, was added.
  - `CareScreenTest` (10): the day plan and medicine list states; a dose shown as noted only once confirmed, and a lost note retried; every control disabled while a command is unconfirmed; Stop tracking asks first, and Keep sends nothing; a lost stop leaves the medicine current; an unconfirmed save locks the form; 320 dp at 200% text.
  - `EventsScreenTest` (7): list, detail and error states; Cancel asks first, and Keep sends nothing; controls disabled while a command is unconfirmed; an unconfirmed create locks the form, and only Retry sends it again; a response shown as chosen only once the server confirms it; only same-day events can be edited here; 320 dp at 200% text.
  - `CalendarScreenTest` (6): loading, empty, failed and loaded months; entries open their own source; month, timezone and Space change only by an explicit choice; 320 dp at 200% text. It uses task, reminder and planned entries only, because calendar events on Android belong to the unrecorded alerts work (conflict C10).
  - `ReminderSeriesScreenTest` (10): the series list and the actions each status allows; a series time is not offered the plain cancel; a series is saved only from its review; the clock-change choice; a lost save or command stays locked until the exact retry; skip, pause, resume and cancel ask first and name their effect; snooze needs a choice, and a lost snooze retries only the same choice; 320 dp at 200% text.
- **Defect found and fixed:** the confirmation dialogs could not scroll, so at 200% text on a 320 dp screen their explanation was cut off before the person confirmed. Stop tracking showed 552 of 675 px of its warning, the series Pause question 65 of 375 px (it ended at "No reminders until you"), and Cancel event 648 of 900 px with a 109-character title. Each dialog's text now scrolls (`CareScreen.kt`, `EventsScreen.kt`, and `ReminderScreen.kt`, whose dialog also asks before cancelling or acknowledging a reminder).

| Check (2026-10-02) | Result |
| --- | --- |
| Before the fix | Care 9 of 10 and series 9 of 10, with the dialog text clipped at 200%; events 7 of 7 with a 66-character title and 6 of 7 with a 109-character one; calendar 6 of 6 (`.local/t93/before-*.txt`, screenshots in `.local/t93/screens-before/`). |
| The tests can fail | 20 deliberate breakages, made in a source copy and never in the shared tree, each made the intended test fail: a question skipped or Keep sending the command, a lost answer shown as done, controls enabled while unconfirmed, titles cut to one line, the snooze choices not scrollable, and a retry sending a new snooze (`.local/t93/mut-*.txt`). |
| After the fix | The agent's final build: care 10, events 7, calendar 6, series 10 and the existing `ReminderScreenTest` 12, all passed; the JVM tests of care, events and scheduling passed, 82 of 82. The audit session reran all five classes on its own emulator, 45 of 45, and then, with T94, **52 of 52** on one build of the shared tree (`.local/t94/t93-recheck-*.txt`, `.local/t94/shared-*.txt`). The font scale was back at 1.0 after every class. |

## Android Account Settings Survive Rotation Checkpoint

Builds [T94](TASKS.md#defects-that-break-approved-requirements), audit A12. T50 kept typed sign-in fields across rotation, but the account settings editor still lost an unsaved display name or timezone: it held them only in memory and reset them each time it appeared. Found and fixed by the audit session.

- **Fix** (`AccountBody` in `android/app/src/main/java/com/community/platform/feature/identity/IdentityScreen.kt`): the name, the timezone and the version the editor started from are kept in saved state, and they are replaced only when a save has happened since the editor last looked. A recreated screen keeps the draft and its version, so a save still sends the version the change started from, and the server refuses it if the profile changed meanwhile. A new process counts saves again from 0, so the draft still comes back.
- **New device test:** `IdentityScreenTest.profileDraftAndItsVersionSurviveRecreationUntilSaved`. It changes the name and timezone, refreshes the profile, recreates the screen twice (the second time as a new process would), saves and checks what was sent; after a save, the next change starts from the saved version.

| Check (2026-10-02) | Result |
| --- | --- |
| Before the fix | A source copy with the original screen and the new test: 6 of 7 passed. The new test failed because, after recreation, the name field showed the refreshed "Server update" instead of the draft (`.local/t94/before-IdentityScreenTest.txt`). |
| After the fix | The same copy with only the fix: **7 of 7**; on one build of the shared tree with T93, 52 of 52 (`.local/t94/after-IdentityScreenTest.txt`, `.local/t94/shared-IdentityScreenTest.txt`). On a read-only API 36 emulator started by the audit session, with the network off at 320 dp and the font scale restored; it was shut down afterwards. The JVM identity tests passed, 23 of 23. |
## Owner's Critical Gaps Checkpoint

Builds [T65–T70 and T86](TASKS.md#owners-critical-gaps) from the owner's list of ten gaps, under the provisional decisions [DEC-019 to DEC-024](DECISIONS.md#accepted-decisions). Evidence files are under `.local/gaps/`.

- **Live updates (T65, T86, [ADR-0006](adr/0006-live-updates.md)).** `GET /v1/live` is a server-sent event stream: `ready`, `change` (kind `conversation` or `notifications`, identifiers only), `resync` and `end`, with a comment every 15 s. Services send hints with `pg_notify` inside the changing transaction, so a rolled-back change tells nobody; one listening connection per API process fans them out. Limits: 5 streams per account, 100 queued hints per stream, 30 minutes per stream. Ending a membership now tells the person about each chat they lose, and the other person in each direct chat (T86).
- **Alerts without a push provider (T66).** Web: "Browser alerts for new reminders" in the inbox. Android: "Phone alerts for new reminders and messages" next to the in-app reminder setting; a WorkManager check about every 15 minutes with a network; reminders name the task, the lock screen says only "You have a reminder", messages show only a count. Turning off, signing out or another account stops the checks.
- **Unsent messages on Android (T67).** Room table `unsent_messages` in `community-unsent.db`, bodies sealed with AES-GCM under the Keystore alias `community.messaging.outbox.v1`, excluded from backups like everything else; resent by a WorkManager job with the original key, at most 5 times.
- **Deleting an account and the data download (T68).** Migration `0027`; `POST /v1/me/deletion`, `POST /v1/auth/cancel-deletion`; the purge (`app.deletion_worker`) erases the person's own data in one transaction per account and keeps what others share, shown as "Deleted account". Screens: web `/app/settings/data`, Android "Your data". The `export-worker` and `account-deletion-worker` services were started on 2026-10-02 next to the running stack.
- **Moderation (T69).** Migration `0028`; web `/app/moderation`, Safety notices and appeals on web and Android, author-only marks.
- **Languages (T70).** Android complete in Telugu and Hindi; web language choice with the shell, navigation and account-entry screens translated; the rest is T98.

| Check (2026-10-02) | Result |
| --- | --- |
| Backend | `test_live_updates`, `test_account_deletion`, `test_spaces`, `test_messaging`, `test_moderation`, `test_exports`: **172 passed**. Injected defects: live updates 6 of 6 and account deletion 12 of 12 made a test fail (`.local/gaps/live-defects.txt`, `.local/gaps/deletion-defects.txt`). |
| Web | Type check passes; client tests **150 passed**; the offline screen tests for data, moderation, i18n, account, identity, community, home, agents, care and documents pass (the full run before the fixture fixes below: 136 of 161, every failure the missing live endpoint). |
| Android JVM | All 29 classes, **446 tests**, 0 failures (`.local/android-jvm-all.txt`). Mutations caught: account data retry key, moderation retry key, outbox network-error removal, phone alert repeat. |
| Android device | `ModerationScreenTest` **7 of 7** on a read-only API 36 emulator at 320 dp, 200% font scale, network off, font scale restored, emulator stopped afterwards. `AccountDataScreenTest` compiles but was not run on a device. Lint and both APKs build. |

**Tests changed** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): DEC-019 makes every signed-in page open the live connection, so the offline fixtures of `home-ui`, `agents-ui`, `care-ui` and `documents-ui` now answer `/api/live` with an open stream that is not counted as a call; no assertion changed. `reminder-ui` (T87's inbox test) and `care-ui` (dose alerts) used Playwright `check()`/`uncheck()` on checkboxes that change only when the save answers, which failed under load; they now click and wait for the saved state, with the same assertions. `reminder-ui` finds the in-app reminder checkbox by its unchecked state because the inbox now has a second switch. `MessagingLiveTest` (new in T65) waits 5.5 s instead of 5 s for the next poll, because the wait starts when the previous poll finishes.

**Not done:** end-to-end encryption (T71, blocked), push through a provider, external integrations and an AI model (blocked as before), the remaining web translations (T98), and running `AccountDataScreenTest` on a device.

**Blind security review** by a model from another vendor, given the areas but not our conclusions. Fixed, each with a test that fails without the fix: the web dropped the new `access` and `member_left` hints, so T86 did not reach web chats; a join request kept a copy of an erased Space's name; a former member of a Space was told about later departures from direct chats they had been in; cancelling a deletion left repeating reminders stopped for good if one fell due during the grace period (they now go on from their next occurrence); a phone alert check could post after sign-out (posting and turning off are now exclusive); a message being sealed during sign-out could stay kept. The purge now locks pages before posts, as pinning does. Left as known limits: when the stored session cannot be decrypted, kept Android messages stay sealed until the next sign-in, which deletes them for another account; whether the lock screen hides the task title also depends on the phone's own setting for sensitive notifications.
## Android Checklist And Group Device Tests Checkpoint

Builds [T95](TASKS.md#defects-that-break-approved-requirements) and [T97](TASKS.md#defects-that-break-approved-requirements). Written by a background agent on Claude Opus 5.5, then checked by the audit session, which fixed the two defects the group tests found.

- **New device tests:** 25 in two classes, on a read-only API 36 emulator with the network off at 320 dp.
  - `ChecklistScreenTest` (11): loading, failed, empty and denied states; ticked items and only the actions the person may use; a tick sent once and shown only once confirmed; a lost tick never shown as done, with Retry sending the same change; removing asks first and names the item, and Keep sends nothing; renaming starts from the item's title, and Cancel sends nothing; an unconfirmed add keeps the draft locked; a refused change keeps the draft, and reloading asks before discarding it; leaving asks first when a change is unconfirmed or a draft would be lost; every control waits while a change is in flight; 320 dp at 200% text.
  - `GroupScreenTest` (14): the loading, empty and failed searches of Find groups; what each group lets the person do; the join note; lost, refused and in-flight join requests; withdrawing; approving; declining; the visibility question and a lost visibility change; the note counter; 320 dp at 200% text. `GroupScreen` takes its real view model, so these tests answer through a stand-in `GroupApi` on the device that records each request and can hold, refuse or lose it. No app code was changed for testing.
- **Defects found (T97), fixed by the audit session** in `android/app/src/main/java/com/community/platform/feature/spaces/GroupScreen.kt`, whose files had not changed since 2026-10-01:
  - Decline was sent the moment it was tapped, although a declined person must wait 7 days to ask again. It now asks first, with "Keep" or "Confirm decline" and Approve hidden meanwhile, as the web does.
  - The note counter counted an emoji twice (200 emoji showed "400/280"). It now counts characters, as the view model, the server and the web do.
  - The two new strings have draft Hindi and Telugu translations, as [DEC-023](DECISIONS.md#accepted-decisions) allows.
- **Noticed, not changed:** on the group screen, Back looks enabled but does nothing while a request or visibility change is unconfirmed, and Back or a new search clears a typed note without asking. The checklist's leave question fits 320 dp at 200% text with little room to spare.

| Check (2026-10-02) | Result |
| --- | --- |
| Before the fix | Checklist 11 of 11; group 12 of 14: "A decline was sent without asking first", and the counter showed "400/280" for 200 emoji. The existing `SpaceScreenTest` 19 of 19 (`.local/t95/final-*.txt`). |
| The tests can fail | 23 deliberate breakages in a source copy, never in the shared tree, each made the intended test fail: a question skipped or Keep and Cancel sending, a lost answer shown as done, controls enabled while unconfirmed, a retry with a new command or key, a draft blanked while unconfirmed, and text cut off at large text (`.local/t95/T95-EVIDENCE.txt`). |
| After the fix | `GroupScreenTest` **14 of 14** in both runs of the new device suite and on the clean build that passed all 135 device tests ([device suite checkpoint](#android-device-tests-in-one-command-checkpoint)). |

## Android Device Tests In One Command Checkpoint

Builds [T96](TASKS.md#defects-that-break-approved-requirements): `npm run verify` ran every suite except the Android device tests, which each session ran by hand with its own script and emulator.

- **New:** `npm run verify -- -Suite device` runs [verify-android-device.ps1](../scripts/verify-android-device.ps1).
  - It starts its own read-only emulator on the first free port from 5584 and builds while the emulator starts.
  - It waits a minute for Android to settle, switches the network off, sets a screen 320 dp wide, and installs copies of the two APKs.
  - It runs each class that needs no local services, checks the font scale after each class, and shuts the emulator down, also after a failure. It never uses or stops an emulator it did not start.
  - `verify.ps1` counts the tests from the instrumentation status codes. A test that starts and never finishes counts as failed, and the summary names any class with a problem.
  - The suite runs only when asked for, like `live`. The [runbook](runbooks/README.md#verification-commands) describes it.
- **What its first runs found:**
  - Just after start, Android stopped the first class's process as not responding (`bg anr`), as it did with three of its own apps in the same minute, so no test of `AgentScreenTest` ran. The script now waits 60 seconds after start. It runs a class once more only when no test of it started; a failed test is never run again.
  - With that fixed, `AgentScreenTest.anUnconfirmedApprovalOffersOnlyApproveAgainWithTheSameCommand` failed 3 of 3 on the Pixel 5–shaped virtual device, and passed with the same APKs on the Pixel 4–shaped one. Its scroll step reached the run's list item but left the "Approve again" button below the screen's edge, where a tap reaches nothing; the Pixel 5's camera cutout takes more height. The test now scrolls to each button before tapping it, and its assertions are unchanged. A person can scroll to the button, so the app was not at fault.
  - The Pixel 4–shaped virtual device has no telephony, so `svc data disable` fails there. The script now accepts that one answer, and still checks that airplane mode is on, Wi-Fi is off and mobile data is 0.
  - From 05:26 the shared tree did not build, because another session's work in progress adds Room and WorkManager and does not compile yet. The last run therefore used a clean build: the last commit plus the audit session's own changes.

| Check (2026-10-02) | Result |
| --- | --- |
| First run, `npm run verify -- -Suite device`, 04:47 to 05:07 | 136 of 136 tests that started passed in 17 classes; no test of `AgentScreenTest` started (`.local/verify/device-1`). |
| Second run, with the wait after start, 05:08 to 05:25 | 141 of 142: the `AgentScreenTest` failure above (`.local/verify/device-2`). It failed 3 of 3 again on the same APKs, and passed 6 of 6 on the Pixel 4 shape (`.local/t96-agent-repeat.txt`, `.local/t96-agent-membership-avd.txt`). |
| Clean build with the test fix, 05:51 to 06:08 | **135 of 135 in 16 classes** on the Pixel 5 shape, including `AgentScreenTest` 6 of 6, `ChecklistScreenTest` 11 of 11 and `GroupScreenTest` 14 of 14 (`.local/t96-device-head.txt`). The other session's new `ModerationScreenTest`, not committed yet, passed 7 of 7 in both earlier runs. |
## Text Limits Counted In Characters Everywhere Checkpoint

Builds [T100](TASKS.md#defects-that-break-approved-requirements). T46 and T79 made posts and Spaces count text in characters, as the server does, where an emoji counts once. The audit session checked every other free-text limit on the web and Android and found the same defect in the rest.

- **What went wrong:** the web checked names, titles and agent texts in its answers at the server's limit counted in UTF-16 units, where an emoji counts twice. One person whose name has more than 40 emoji, or one task whose title has more than 100, both valid on the server (for example saved from Android), made the web refuse the whole answer. Tasks, reminders, the inbox, the calendar, checklists, conversations, messages, events or agent requests then failed to load for everyone who can see them. Android checked task assignees the same way, and its two name fields cut at 80 UTF-16 units, keeping 40 emoji or half of one. Several web fields stopped at half the emoji the server allows.
- **Fix:**
  - The web has one helper, `chars` in `web/src/features/identity/client.ts`, which every client already loads. The answers of tasks, checklists, the calendar, reminders and requests, repeating reminders, the inbox, conversations and messages, events and the agent use it.
  - Account settings, the task form, checklist items and the agent's request and answer take twice the UTF-16 units and say "Use up to N characters." past the limit, without sending anything. The task form now shows its schema's own message instead of "Check the task title, date and assignee.".
  - Android: `TaskRepository.kt` counts assignee names in characters, and the sign-up and profile name fields keep 80 whole characters (`takeCodePoints`, from T75).
  - Not changed: the web sign-up name still stops at 40 emoji, because its messages are being translated (T70, T98) and a person can set up to 80 emoji in account settings; the alerts panel follows conflict C10.

| Check (2026-10-02) | Result |
| --- | --- |
| Before the fix | `tests/text-limits-client.test.mjs`: 0 of 7; each refused a server-valid emoji name or title at the limit. Against the last commit's screens, in throwaway copies of the test files: account settings held 40 emoji ("The field must take 80 emoji."), and the task form and the agent never said that a longer text was too long, because the field had already cut it (`.local/t100/*.before.txt`). Android: the new `TaskRepositoryTest` case failed with "The service returned an unexpected task response.", and the 2 new `IdentityScreenTest` cases found 40 emoji in each name field (`.local/t100/identity-device-before.txt`). |
| After the fix | The 7 client tests pass; the whole client suite **157 of 157**; offline screens: account 3 of 3, tasks 6 of 6, agent 7 of 7; the web type check passes. Android JVM, planning, identity and community: **168 of 168**; `IdentityScreenTest` **9 of 9** on the API 36 emulator started by `scripts/verify-android-device.ps1` (`.local/t100/`). |
## Calendar And Checklist Offline Tests Checkpoint

Builds [T99](TASKS.md#defects-that-break-approved-requirements): the web calendar and the task checklists had no offline tests. Written by a background agent on GPT-6.1 Sol, then checked by the audit session. Calendar events and the calendar file download belong to the unrecorded alerts work (conflict C10), so they are left out. The tests came before T98, which will translate these screens.

- **New file:** `tests/unit/calendar-checklist-ui.test.mjs`, 24 tests with simulated answers and the live connection simulated in the page; every network request is refused.
  - **Calendar (11):** loading, failure with Retry, empty and loaded months; due dates, reminders and planned repeating times on the right day with their own links; month, timezone and Space changing only by an explicit choice; Load more; access refused with 403 or 404 removing what was shown; 320 px at 200% text.
  - **Checklists (13):** loading and Retry; an empty and a read-only checklist; a lost add or tick retried with the same key, body and version, and never shown as done before it is confirmed; a refused tick (409 or 412) left unticked until a reload is reviewed; renaming; removing only after a confirmation that names the item; a 200-character emoji title shown, and 201 characters explained without sending; access refused; 320 px at 200% text.
- **Defects found and fixed** (`web/src/features/planning/calendar-screen.tsx`, `calendar.module.css`):
  - When a refresh listed the Spaces in a new order, the calendar silently switched to the new first Space. The first choice is now kept until the person changes it.
  - When the account's timezone changed, the chosen display timezone dropped out of the list, so the agenda shown no longer matched the label. The list now keeps the timezone in use.
  - At 320 px with 200% text, the heading was 336 px wide, and the buttons cut off two-digit dates. The heading now wraps, and the date buttons no longer add padding.
  - The checklist input cut a long title short without a word. It now keeps what was typed and says "Use up to 200 characters." (with [T100](#text-limits-counted-in-characters-everywhere-checkpoint)).

| Check (2026-10-02) | Result |
| --- | --- |
| Before the fixes | 20 of 24 (`.local/t99/before-fixes.log`). |
| The tests can fail | 13 deliberate breakages, each served by a throwaway copy of the test file so the shared source was not changed, each made the intended test fail: a new key or body on a retry, no `If-Match`, a refused tick shown as done, removal without confirmation, the month, timezone or Space changing on a refresh, the heading or the dates cut off, an oversized dialog, and a server-valid emoji title refused (`.local/t99/mutation-results.json`). |
| After the fixes | 24 of 24, and the existing `planning-ui` 6 of 6, by the agent; the audit session's complete web run is in the [evaluations](EVALUATIONS.md#test-suites). |
## Remaining Gates

1. Complete broader accessibility, process-death/offline recovery, load/latency, production backup/PITR/key-custody and release-runtime qualification; the local restore drill above sets no RPO/RTO objective. Real OS clipboard integration also remains unverified by the payload-double test.
2. Resolve dependency/advisory, recovery/abuse, legal/privacy and deployment gates before real-user use. Local integration passes are not full M1/MVP or production approval.
3. Retain the unimplemented product scope: arbitrary/standing third-party grants, moderator tools and appeals, end-to-end encrypted and realtime messaging, other Space types, broader membership management, event capacity/invitations/public events, files, Agent and safety/data rights.