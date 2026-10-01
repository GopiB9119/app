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

Live since about 14:40: another session upgraded the development database to `0024`, which includes `0023`, and restarted the shared API. Signed-out requests to the agent routes are refused (`401 AUTHENTICATION_REQUIRED`). The generated [OpenAPI](../packages/openapi/openapi.json), regenerated by another session at 13:48, includes the 10 agent operations. The web screen for the agent is written and checked but not linked ([T34](TASKS.md#approved-requirements-not-built-yet)); Android is not started ([T35](TASKS.md#approved-requirements-not-built-yet)); both wait for the owner's review of DEC-012.

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
- **Sign-up timezone.** Sign-up started every account in Asia/Kolkata. It now starts in the device's timezone when that is a named zone, and in UTC otherwise, for example for a custom offset such as GMT+05:30. The person can still choose another zone.
- **Rotation.** Email, display name, the chosen timezone and Show password now survive rotation, and the system ending the app in the background. The password and the verification code survive rotation in memory only: they never go into the saved state Android keeps for the screen, so after the system ends the app they are typed again. They are forgotten once the person is signed in, so they do not reappear after signing out.
- **Changed behaviour** ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)): the start screen after a failed check, the sign-up default timezone and the wording of a failed check. One device test expected Asia/Kolkata in a recovery proof; it now expects the device's zone, citing T50, and its other assertions are unchanged.
- **Engineering choices** ([DEC-009](DECISIONS.md#accepted-decisions)): the password and code live in a small screen `ViewModel` (`SignInSecrets`) rather than in saved state, and the new button takes its height and corners from the design tokens ([DEC-013](DECISIONS.md#accepted-decisions)). The session store is not changed here; T49 changed it in parallel.

| Check (2026-10-01) | Result |
| --- | --- |
| Android JVM | New `IdentityViewModelTest`, 5 tests: an offline start keeps the saved sign-in and offers Try again, and a later check loads the account with no new sign-in; a server error at start also keeps it; a rejected sign-in clears it and shows the form, also after an offline start; a start with no saved sign-in and no connection shows the form with the check message; and the sign-up timezone rule. `AccountRepositoryTest`'s test double gained a lost-connection switch and a sign-in counter. The whole suite: **234 passed**, 0 failed, 0 skipped across 18 classes (`.local/t50/jvm-full.txt`). The new tests use the new state field, so they cannot run against the old code, whose screen showed the form whenever no account was loaded. |
| Device | `IdentityScreenTest` on the read-only API 36 emulator `community_membership_20260923`, network off, at 320 dp: **6 passed**, 0 failed, 0 skipped in 92 s. The 2 new tests cover the Try again screen at 200% text (no email, password or sign-in button; a button at least 48 dp tall that starts one check), and the sign-up fields across a simulated recreation: the name and code come back and verify receives the same password, while a new process brings back only the name. Three screenshots were copied with matching hashes and viewed (`.local/t50/identity-device-20261001-091023-0c042c`). Three earlier attempts did not reach the tests: twice the guest's phone service did not start in time on the loaded machine, and the guard stopped before installing anything (the wait is now up to four minutes); once the API 36.1 image failed all 6 tests inside Espresso 3.6.1 (`NoSuchMethodException: InputManager.getInstance`) before any app code ran. |

**Boundary.**
- **No live sign-in journey:** `AccountJourneyTest` against the shared API did not run. It registers through this form, so an account it creates now gets the emulator's timezone.
- **The web sign-up form still starts in Asia/Kolkata;** recorded as [T54](TASKS.md#defects-that-break-approved-requirements). The live `care:` journey relies on that default.

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

## Remaining Gates

1. Complete broader accessibility, process-death/offline recovery, load/latency, production backup/PITR/key-custody and release-runtime qualification; the local restore drill above sets no RPO/RTO objective. Real OS clipboard integration also remains unverified by the payload-double test.
2. Resolve dependency/advisory, recovery/abuse, legal/privacy and deployment gates before real-user use. Local integration passes are not full M1/MVP or production approval.
3. Retain the unimplemented product scope: arbitrary/standing third-party grants, moderator tools and appeals, end-to-end encrypted and realtime messaging, other Space types, broader membership management, event capacity/invitations/public events, files, Agent and safety/data rights.