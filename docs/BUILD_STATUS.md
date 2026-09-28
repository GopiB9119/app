# Implementation Status

Updated 2026-09-23. Executed checks are separate from existing proposed/open product contracts. This record does not change any original chapter, release decision or ADR status.

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

This is not production backup qualification. The key file is fingerprinted but not copied, so losing it still makes protected fields unreadable. There is no key rotation, off-host or encrypted backup storage, PITR/WAL archive, retention policy, object-file recovery, audited production seal, or reconciliation of work changed after the snapshot.

## Family Rejoin Checkpoint

On 2026-09-26 an owner can bring back a family member who was removed or left. The owner sends a new in-app invitation, and nothing changes until the former member explicitly accepts it. Acceptance issues a new admission ID, member role and join time on the retained membership row, committed with the invitation outcome, Space revision and audit/outbox. Grants tied to the earlier admission stay closed: earlier tasks, personal reminders, reminder requests, inbox entries, ownership offers and departure receipts remain unavailable, old scheduled reminders are suppressed as `access_lost`, and the old accepted invitation still returns 404. No migration or API shape change was needed.

- The **complete backend suite passed 231 tests in 298.24 seconds**, retained in `backend/.local/rejoin-backend-20260926.xml`. Four new cases cover return after removal and after self-leave, required acceptance and reminder/inbox isolation after rejoining.
- Web TypeScript, **34 client/BFF tests** and the isolated `rejoin-20260926` build passed. The web removal and leave confirmations now explain the return path.
- The **live rejoin browser journey passed** in 30.392 seconds against real local services, with 320/390/768-pixel review bounds; report `.local/rejoin-live-web.xml`, screenshots inspected. It used a temporary API container from the same source on port 8001 because another session was using the shared port-8000 API. The shared API was restarted afterwards and now serves rejoin; the temporary container was stopped.
- **Android source is updated but not verified by this continuation.** The shared removal/leave text now explains the return path, and a new live native rejoin journey is written. Gradle, lint and device runs are pending because a concurrent session holds the only emulator slot.

This follows the recommendation of the still-open Chapter 3 decision C3-D06 as a local implementation choice. There is no ban list, self-service rejoin or history-sharing option. Details: [rejoin checkpoint](runbooks/FAMILY_MEMBERSHIP.md#rejoin-checkpoint).

## Remaining Gates

1. Complete broader accessibility, process-death/offline recovery, load/latency, production backup/PITR/key-custody and release-runtime qualification; the local restore drill above sets no RPO/RTO objective. Real OS clipboard integration also remains unverified by the payload-double test.
2. Resolve dependency/advisory, recovery/abuse, legal/privacy and deployment gates before real-user use. Local integration passes are not full M1/MVP or production approval.
3. Retain the unimplemented product scope: arbitrary/standing third-party grants, public community, messaging, other Space types, broader membership management, events, files, Agent and safety/data rights.