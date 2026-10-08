# Community Platform

Public participation, private Spaces, reliable messaging, shared planning and a user-controlled Agent. The folder name is not a product-brand decision.

This repository is moving from the original twenty chapters into implementation. Sources and review contracts remain intact. A folder or feature catalog entry is not a working feature or an approved production policy.

## Repository

| Path | Responsibility |
| --- | --- |
| `backend/app/modules/` | FastAPI modular monolith with explicit domain ownership |
| `web/src/features/` | Next.js, TypeScript and the web experience |
| `android/app/` | Kotlin and Jetpack Compose Android application |
| `agent/` | Shared bounded Agent runtime, introduced after the manual workflows |
| `packages/` | Feature inventory, API/event/state contracts and design tokens |
| `infra/` | Local services and later reviewed deployment configuration |
| `scripts/` | Repeatable generation and verification commands |
| `tests/e2e/` | Synthetic cross-client journeys |
| `docs/` | Documentation. Start with the [documentation map](docs/README.md), which names the authoritative document for each area |

The [feature catalog](packages/feature-catalog/features.json) assigns all 48 must-haves and 17 final outcomes to domains and preserves 190 feature entries. The [detailed inventory](packages/feature-catalog/requirements.json) retains 2,208 source headings and all release-priority/acceptance rows. The source lock detects changes to all 21 original documents. Existing duplicate Chapter 19/20 drafts remain preserved under the [reconciliation record](docs/CONTRACT_RECONCILIATION.md).

The [product feature delivery ledger](docs/PRODUCT_FEATURES.md) lists all 190 groups with backend/web/Android status, screen coverage, stack, safety boundaries and the non-Agent build order; the shorter [feature and screen build list](docs/FEATURES_AND_SCREENS.md) shows each product area, page and screen. Current batches add a private calendar agenda, reviewed name settings, owner-only Solo Spaces, task checklists and Space chat/direct messages. Real web integration and native build/JVM checks pass; native device qualification remains open. **Use only http://127.0.0.1:3000 for the web app**, including `/app/spaces`, `/app/calendar` and `/app/messages`. The VS Code task **Community Platform: preview web** watches current source at that address; do not switch to another web port.

## Agent Inbox And Memory Controls

`/app/agent/tasks` now provides the signed-in person's private Space Agent request inbox, with status filters and the existing
approval, answer and cancellation controls. Agent > Memories supports editing notes and disabling/re-enabling future retrieval;
disabled notes remain manageable, and earlier conversations/provider copies are not erased by that switch.

These backend/web features require migration `0059` and a compatible API. The retained synthetic runtime has now been
[upgraded and verified through the live browser](infra/README.md#agent-controls-activation-2026-10-07), preserving its existing data and key.
The earlier [implementation evidence](docs/COMMUNITY_AGENT_PLAN.md#agent-task-inbox-and-memory-controls-2026-10-07) remains separately scoped.
Models/web providers remain disabled; the live controls test uses clearly labeled synthetic fixtures, not autonomous Agent output or production data.

### Agent Response Binding And Recovery: 2026-10-07

Single-run responses now bind to the requested identity and known Main/Space scope. Embedded approvals must belong to their
parent run and Space. Equivalent UUID capitalization, newer approvals and legitimate later-state replays remain accepted;
the HTTP requests, backend authorization and approval policy are unchanged.

Unconfirmed answers retain their original question/text through refresh and offer exact retry. Stop failures stay visible and
reconcilable if the run advances to approval or completion; a completed run is not falsely labelled cancelled. Wrong-run content
is not installed or treated as confirmed success. Desktop/mobile regressions check unchanged retry requests and no duplicate effect.

[Delivery evidence](docs/COMMUNITY_AGENT_PLAN.md#agent-response-confirmation-and-stop-recovery-2026-10-07) records the concurrent
Stop follow-up and the separate qualification in this batch: **91/91** full captured Agent browser checks, a later **12/12**
test-only delta, **58/58 Agent**, **4/4 messaging-Agent**, **13/13 translation** client checks, typechecking, and **9/9 backend**
replay/authority tests on a disposable synthetic database at `0059`. The overlapping full/delta results are not summed or
described as one full 94-case run. Captured application bytes match between those two runs; dependency installs were shared,
not hermetic. Failed setup/regression reports remain retained.

Mobile captures were inspected with measured 200% text, keyboard focus, 44 px targets and pointer hit testing. No provider call,
Android work, retained-runtime migration or deployment was performed for this milestone. `/app/agent`, `/app/agent/tasks` and
`/api/timezones` returned HTTP 200 at the final availability check; that is not a new signed-in journey or production qualification.

## Event Polls

An event's **Polls** control now supports reviewed creation, two to eight choices, one changeable/withdrawable vote per visible
member, aggregate results and organizer/Space-owner closure. Retries preserve the original command and cannot overwrite a newer vote.
Cancelled/ended events are read-only; account deletion removes ballots and associated retry receipts.

This is the event-linked contract, separate from the standalone Space-poll draft. The [qualified implementation](docs/COMMUNITY_AGENT_PLAN.md#event-poll-workflow-delivery-2026-10-07)
requires migration `0061` and a compatible API. A [separate fresh synthetic runtime](infra/README.md#fresh-poll-runtime-2026-10-08)
is now running on that revision, with the live two-person event-poll journey passing at `http://127.0.0.1:3000/app/events`.
The older runtime's missing data was not recreated or presented as recovered; its backups and key remain untouched.
The separately implemented [Space Agent poll tools](docs/COMMUNITY_AGENT_PLAN.md#reviewed-space-agent-poll-capability-2026-10-08)
can read authorized standalone polls and prepare creation for explicit approval, never vote or close polls. They require migration
`0062` and a compatible model-enabled runtime; this implementation pass did not activate providers or switch the running API.
No external integration or live-user rollout was enabled.

## Build Order

First working slice: account access, including registration, simulated email verification, login, profile/timezone and revocable sessions. This is a local synthetic-data implementation, not live email delivery or a production identity rollout. Open provider, legal, recovery and security-policy decisions are not silently approved.

The backend, web and Android clients contain account implementation code. The real local browser recovery and Android account journeys now pass; see [live workflow evidence](docs/BUILD_STATUS.md#live-manual-workflow-checkpoint) and the [account development boundary](docs/runbooks/ACCOUNT_ACCESS.md). Broader release qualification remains incomplete; this is not a finished MVP.

Verified accounts can create, list and read their own private family Spaces. Owners can now invite an existing verified account by its account ID, inspect sent invitations and revoke pending invitations. The intended recipient can review, accept or decline in their own inbox. Admission, invitation consumption and audit/outbox records commit together; expiry, current authority and one-use admission are enforced server-side. The web screen is at `/app/spaces` and is linked from account settings. This local slice sends no external invitations and performs no email/phone account lookup.

Android exposes the same create/invite/join flow from **Family Spaces** on the account screen, with account-ID copy, exact invitation review and a link into the selected family's tasks. Current native JVM totals are in [EVALUATIONS.md](docs/EVALUATIONS.md#test-suites); membership, live workflow and offline screen evidence is recorded in [BUILD_STATUS.md](docs/BUILD_STATUS.md#family-membership-checkpoint).

Ordinary family tasks are now implemented in the backend and `/app/tasks`, linked from each Space. Current members can create tasks with notes, a date-only deadline and an eligible assignee. Creators/owners can edit; the assignee can update progress, complete or reopen. Reads remain tied to the admissions present when a task was created, so joining later or editing an old title does not grant historical access. Writes use version preconditions and stable retry identities with atomic audit/outbox records. Native task implementation and evidence are recorded separately in the build status.

Family members can now view the private roster, an owner can remove an ordinary member, and ordinary members can leave. Each change requires an exact review and supports the same-request retry after a lost response. Current access and pending reminder delivery are revoked without deleting shared content. The owner cannot leave. A former member can rejoin only through a new invitation that they accept, and their earlier tasks and reminders stay unavailable. Backend, web and native verification is recorded in the [membership runbook](docs/runbooks/FAMILY_MEMBERSHIP.md).

One-time **Remind me** schedules and a private in-app inbox are now implemented across the backend, web and Android. A separate worker materializes due entries without an open app or model. Users review exact time/zone/recipient, cancel pending schedules, mark an inbox item read and explicitly acknowledge it; acknowledgment does not complete the task. This first slice targets only the requesting account and sends no background alert or external message. See the [reminder runbook](docs/runbooks/SELF_REMINDERS.md).

Task managers can now propose an exact in-app reminder to the current assignee on web and Android. The recipient reviews and explicitly accepts or declines; the sender can withdraw a pending request. Only acceptance creates the recipient's personal schedule. The live two-account web journey and native recipient acceptance/reload/cancellation journey pass, alongside backend consent/race tests and offline controls. Details and remaining qualification are in the [request checkpoint](docs/BUILD_STATUS.md#recipient-approved-reminder-requests).

Each Space now has one shared **Space chat**, and two current members of the same Space can open a **direct conversation** (`/app/messages` on web, **Messages** on Android). Sends keep one copy per retry, history starts at the member's current admission, unread counts and read positions are per admission, and authors can delete a message for everyone (a tombstone; copies already seen are not recalled). Message bodies are encrypted at rest on the server; this is **not end-to-end encryption**, and every chat screen says so. Clients poll while a chat is open; there is no push or WebSocket yet. Evidence: [messaging checkpoint](docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint).

The **public community** is live locally: anyone can create a public page with a handle, write private drafts and publish them explicitly; people follow pages, like, save, comment and reply; Home shows posts from followed pages plus Latest and Saved; Discover searches pages by name, handle, description and topic, and published posts by their words. Report and block work on pages, posts and comments. Public pages and posts (`/pages/<handle>`, `/posts/<id>`) can be read signed out. Private Spaces, chats, tasks and reminders never feed these lists. Evidence: [public community checkpoint](docs/BUILD_STATUS.md#public-community-checkpoint).

Every Space also has **events** (`/app/events?space_id=` on web, **Events** on the Space screen on Android): organizers enter a local date, time and zone, members answer Going, Maybe or Not going, and a changed time asks people to confirm again. A response is not attendance; capacity, invitations outside the Space and public events are not built. Evidence: [events checkpoint](docs/BUILD_STATUS.md#space-events-and-rsvp-checkpoint).

Each person can also keep their **medicines** (`/app/care` on web, **Medicines** on Android): they copy an instruction exactly as given, confirm it and name its source, see a day plan, and note each dose as taken or skipped. Only that person can see these records. The app gives no medical advice and sends nothing at dose times. Evidence: [care checkpoint](docs/BUILD_STATUS.md#care-checkpoint).

A task due date does not automatically schedule a reminder. Built since this list was first written: group and couple Spaces, the admin role, the controlled Agent without an AI model, and text documents with search inside your Spaces (T12–T15, T22, T33–T35). In progress in other sessions: live updates, phone and browser alerts, account deletion with the data download, moderation of public content, and Telugu and Hindi (T65–T70); see [TASKS](docs/TASKS.md). Unregistered-recipient invitations, archiving and deleting Spaces and pages (pages are planned as T85), end-to-end encryption, and event capacity and public events remain in the inventory. The live browser journeys, the native account and family journeys and the web and native reminder-request journeys run under explicit local-only access approval; current results are in [EVALUATIONS](docs/EVALUATIONS.md#test-suites). Broader release gates remain open; finite tests are not full M1/MVP qualification.

See the [local runbook](docs/runbooks/README.md) for setup, verification and current evidence limits. This is a synthetic local build, not an approved production rollout.

## Checks

`npm run verify` uses the [portable Node entry point](scripts/verify.mjs). Linux/macOS run commands directly; Windows retains the PowerShell runner and its `-Suite`/`-Output` options. Default suites include runner self-tests, records, structure, tokens, golden Agent checks, API contracts, web types/client/component checks, backend and Android JVM tests. Live journeys and Android device checks remain opt-in. Missing prerequisites, missing results, failed tests and all-skipped suites exit nonzero, and later suites still get their own result. Logs plus `summary.md` and `summary.json` are kept under `.local/verify/`.

```sh
npm run verify -- --suite runner,tokens,golden,typecheck,client
npm run verify -- -Suite unit -Output .local/verify/browser
npm run verify -- --suite live
```

Linux migration and JVM XML checks use Python 3 standard-library parsers. JVM parsing rejects stale reports, inconsistent counts and uncaught worker exceptions. Browser checks require an installed compatible Chromium; `COMMUNITY_CHROMIUM_PATH` can select it, and verification never downloads browsers. The retained Android device harness requires Windows and its configured emulator. The original runbook is absent from this snapshot and has not been reconstructed.

The [offline verification workflow](.github/workflows/offline-verification.yml) schedules read-only Linux/Windows tooling checks on pushes and pull requests once published, and supports manual dispatch. It runs verifier tests plus runner/token/golden gates without application dependency installation, model calls or deployment, and retains scoped reports even on failure. Its configuration is JSON-compatible YAML validated by the verifier tests. Local Linux execution passes; remote workflow execution and Windows qualification are still pending. No commit, push or remote workflow was performed by this work.

### Event Poll Review Recovery: 2026-10-07

The existing [event-poll view](web/src/features/events/polls.tsx) now discards an unsubmitted closure review when a completed
refresh shows that its poll is missing, no longer closeable, or has different reviewed fields or totals. Vote totals are checked
even when the close ETag is unchanged. An unchanged refresh keeps the review, a held read disables submission, and independent
creation drafts are preserved. A fresh explicit review sends the current close precondition; refreshing never sends a close.

Unknown close results keep their original recovery command. If a denied read is followed by a successful list that omits the
target, the saved poll question, choices and counts stay hidden in both the dialog and recovery panel. Retry remains disabled
until the target is readable again, then sends exactly the original request. Six negative browser cases reproduced the stale
review/detail problems before their fixes; complementary tests cover unchanged ETags, drafts, held reads and exact replay.

| Check | Result | Retained evidence |
| --- | --- | --- |
| Complete Events browser file | 65/65, zero failures/skips/cancellations | [Final web report](.local/verify/event-poll-review-final-20261007t174116z-9f076a8a9b5c/summary.json) |
| Events client contracts | 26/26, zero failures/skips/cancellations | Same report; captured and current web typechecking passed |
| Existing backend visibility, vote replay and close-authority cases | 3/3, zero failures/errors/skips | [Backend report](.local/verify/event-poll-review-backend-20261007t174037752z-403e00bb0f9d/summary.json), [JUnit](.local/verify/event-poll-review-backend-20261007t174037752z-403e00bb0f9d/junit.xml) |

The 192-input web and 255-input backend captures stayed unchanged and matched their shared inputs at completion. Dependencies
were reused from installed environments, not hermetically copied. Browser requests were intercepted synthetic fixtures; backend
checks used a separately owned loopback PostgreSQL instance with providers disabled and observed migration head `0061`. Its
schema and container were ownership-checked, removed and confirmed absent. The earlier interrupted capture and red regression
logs remain retained; its browser output alone was not counted as a qualified run.

Reproduce the affected web checks with installed Chromium and dependencies:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 tests/unit/events-ui.test.mjs
node --test tests/events-client.test.mjs
npm --prefix web run typecheck
```

The [changed-question](.local/verify/event-poll-review-final-20261007t174116z-9f076a8a9b5c/snapshot/.local/screenshots/event-poll-close-refreshed-changed-320.png)
and [changed-tally](.local/verify/event-poll-review-final-20261007t174116z-9f076a8a9b5c/snapshot/.local/screenshots/event-poll-close-refreshed-tally-320.png)
mobile captures were inspected. Tests measure actual doubled text, focus, 44 px targets, pointer reachability and no horizontal
overflow; they are not a manual screen-reader or native-language review. No shared styles, token, backend permission or schema
was changed by this repair. The concurrent event-poll implementation and standalone Space-poll contract remain separately owned.

The web preview was restarted only after confirming port 3000 was free, using isolated build output and disabled telemetry.
Its temporary TypeScript includes were removed. `/app/events` returns 200, but `/api/timezones` returns 503: the [runtime preflight](.local/verify/event-poll-review-final-20261007t174116z-9f076a8a9b5c/runtime-preflight.json)
confirmed that both exact recorded synthetic PostgreSQL/Mailpit containers are absent. No container was restarted/recreated,
metadata repointed, data restored, key replaced or runtime migrated. A separately approved fresh synthetic runtime or reviewed
data/key restore is required before live signed-in qualification. No Android work, provider call, production deployment or commit occurred.

### Poll Admission Privacy: 2026-10-07

The standalone [Space poll service](backend/app/modules/polls/service.py) now sends change hints only to active memberships
whose admission can read the poll. Previously, a newcomer or rejoined member could receive an older poll's ID and activity
despite getting 404 when reading it. Both real-hub regressions failed before the audience predicate was repaired, then passed
for voting, withdrawing and closing, while eligible members continued receiving the same identifier-only hints.

The concurrent admission-bound cursor fix was preserved and verified by a rejoin regression; it is not attributed to this
hint repair. A full-suite failure also exposed a test assuming creation order for equal frozen timestamps. That fixture now
advances time for its newer poll, and a separate test verifies descending-ID tie ordering and cursor continuation without
duplicates or omissions. The service's ordering and poll product rules were not changed.

- [Final fixed-source backend report](.local/verify/poll-privacy-final-20261007t171331z-570788f6/summary.json): **10/10** poll
	tests, zero failures/errors/skips, plus scoped Ruff. All 256 captured inputs stayed unchanged and matched the shared inputs.
	The capture's migration script head was `0061`; the shared runtime was not migrated. Tests used a separately owned synthetic
	PostgreSQL container, disabled providers and the existing virtualenv. Owner-checked container removal and absence were verified.
- [Web compatibility report](.local/verify/poll-web-current-20261007-cRlgKS/summary.json): **24/24** existing live-client tests
	and web typechecking passed with 13 unchanged scoped inputs. This confirms existing transport/type compatibility, not poll UI
	delivery: the inspected web live parser has no `poll` hint consumer and the tests contain no poll-specific browser journey.
- The [red hint report](.local/verify/poll-hint-red-1/summary.json), [focused green report](.local/verify/poll-hint-fixed-1/summary.json)
	and earlier [8-pass/1-failure ordering run](.local/verify/poll-privacy-qualified-20261007t170206z-32585602/summary.json) remain
	retained separately. The shared Python environment is not hermetically frozen; dependency versions were recorded, not package hashes.

Editor diagnostics for the touched service and tests are now clear; no dependency was installed or warning suppressed.
No Android work, live provider request, deployment, data reset, key replacement or existing-container restart occurred.
The [poll contract checkpoint](docs/COMMUNITY_AGENT_PLAN.md#poll-contract-and-privacy-checkpoint-2026-10-07) records the current
Space/Event mismatch and the decisions still needed before declaring a unified backend/web poll feature complete.

### Privacy Permission And Reminder Recovery: 2026-10-07

Completed the outstanding reminder-permission workflow before expanding Agent capabilities, following the owner's
backend-and-website-only direction. Android was neither changed nor tested. Historical governance documents remain missing;
this checkpoint is evidence of the existing workflow, not a replacement requirement set or whole-product completion claim.

The [privacy screen](web/src/features/identity/privacy-screen.tsx) now distinguishes a complete empty result from its bounded
ten-page scan. Partial results show a localized notice and a link to the unfiltered Reminders page. Known permissions remain
usable, and that manual page can reach and cancel the 201st reminder through normal 20-row pagination. Failed reads hide stale
permissions; a removed or renamed permission invalidates an unsubmitted take-back review. Unrelated privacy controls remain
independent. The take-back operation accepts success only for the selected reminder in a cancelled state.

The linked [Reminders page](web/src/features/scheduling/reminder-screen.tsx) also rejects a cancellation receipt for another
reminder. It clears unsubmitted reviews after failed reads or changed title, time, status or eligibility, rather than reopening
an obsolete dialog after recovery. Pending/unconfirmed cancellations preserve the original target and payload for explicit
retry, including when a later read shows the command already took effect. Valid suppression remains "Stopped", not a fabricated
cancellation. The visible retry label uses the existing short translation while retaining the specific accessible name and tooltip.

Nine new receipt/review regressions reproduced defects before repair; four complementary cases preserve unchanged reviews and
lost-response reconciliation. A screenshot exposed mid-word wrapping at 320 px/200% text; its new layout assertion failed before
the label correction. The first rescheduling fixture had an invalid expiry and was corrected before it reproduced the actual
stale-review assertion. No existing test was removed or weakened.

| Check | Result | Retained evidence |
| --- | --- | --- |
| Backend reminder delivery/recipient guards, one pytest session | 69/69, zero failures/errors/skips | [Summary and cleanup](.local/verify/privacy-backend-20261007T131825934Z-e2f8dd75/summary.json), [JUnit](.local/verify/privacy-backend-20261007T131825934Z-e2f8dd75/junit.xml) |
| Complete privacy/reminder browser files | 51/51, zero failures/skips/cancellations | [Final fixed-source report](.local/verify/privacy-reminder-qualified-20261007-Q1qRtK/summary.json) |
| Scheduling, identity and translation client checks | 22/22, zero failures/skips/cancellations | Same fixed-source report |
| Captured and current web typechecking | Passed | Captured type log; current `npm --prefix web run typecheck` |

Backend execution used `tests/test_reminder_delivery_guards.py`, the existing agent virtualenv, provider-disabled test settings,
248 captured inputs and one separately migrated schema at head `0059`. The launcher was restricted to the local Unix Docker
socket; its owner-labeled PostgreSQL instance used a random loopback port and no shared/persistent volume. Source/dependency
fingerprints stayed unchanged, and both schema teardown and owned-container removal/absence were verified.

Web execution used `node --test --test-concurrency=1 tests/unit/privacy-ui.test.mjs tests/unit/reminder-controls.test.mjs`, then
the three client files and `npm --prefix web run typecheck` in the capture. Captured inputs stayed unchanged and matched the
shared inputs at completion. Installed dependencies were shared, not hermetically copied; lock/package-version observations
were stable. Desktop and 320 px captures were inspected, with actual doubled text, focus, hit testing and 44 px controls.
This is not a manual screen-reader or native-language review.

The earlier [38-case web capture](.local/verify/privacy-fixed-20261007T130835Z-XTNHzf/summary.json) remains separate. A later
[51-case attempt](.local/verify/privacy-reminder-final-20261007-kAnQK0/summary.json) passed all suites but correctly refused current
workspace qualification because four Space files changed; the final capture above includes those inputs and the subsequent label fix.
Earlier browser stalls, renderer failures and deadline results were retained, not explained away by later passes.

No backend permission/schema change, shared-service reset, real-user data, provider request, dependency installation, Android
work, deployment, commit or push was performed for this milestone. The absent web preview was restarted with isolated build output
and telemetry disabled; its two generated TypeScript includes were removed and the shared configuration restored. Signed-in live
API/worker journeys, full release qualification and the [privacy release gates](docs/PRIVACY_READINESS.md#release-gates-and-decision-owners)
remain separate. Concurrent Agent memory/inbox/realtime work is not attributed to these fixes.

### Local Web Tooling

Use the installed Next.js CLI to opt out of development telemetry without invoking a package download:

```sh
cd web
node node_modules/next/dist/bin/next telemetry --disable
node node_modules/next/dist/bin/next telemetry status
```

The local setting was verified as **Disabled** on 2026-10-07. Its machine-specific preference file is excluded through Git's local exclude list, not committed. The existing preview was also started with `NEXT_TELEMETRY_DISABLED=1`; it was not restarted. Set that environment variable explicitly for future preview, build and verification processes, particularly in fresh environments.

ESLint is not currently runnable: [the web manifest](web/package.json) declares neither `eslint` nor `eslint-config-next`, and has no lint script, although [the configuration](web/eslint.config.mjs) imports them. The required Next.js config package is absent from the local npm cache. No implicit download or dependency change was made. Types, builds and browser tests do not count as lint results; lint remains unverified until compatible dependencies and an explicit command are provisioned.

### Frozen Web Qualification: 2026-10-07

The first complete run passed 566/572 browser cases but changed ten tested inputs while running. Its six invitation-inbox failures were checked against the newer implementation, not removed or weakened. The mixed-source report remains at [.local/verify/web-completion-2026-10-07T07-33-45-411Z/summary.json](.local/verify/web-completion-2026-10-07T07-33-45-411Z/summary.json).

A fixed 701-input capture then passed the complete offline web gate using the existing verifier commands and installed dependencies:

| Capture | Tokens | Types | Client/BFF | Browser |
| --- | --- | --- | --- | --- |
| Full website | 10/10 | Passed | 261/261 | 576/576 |
| Later invitation/Home delta | Not rerun | Passed | 275/275 | 59/59 affected cases |

All listed passing suites have zero failures, skips or cancellations. Captured SHA-256 hashes stayed unchanged. The later capture differs from the full pass only in the Space invitation component/client, their two test files and the Home test; its captured inputs also matched the shared worktree at completion. These overlapping runs are not added together or described as one full run of the latest tree.

Reports, dependency versions and before/after manifests are retained in:

- [.local/verify/web-fixed-20261007-feqPvt/summary.json](.local/verify/web-fixed-20261007-feqPvt/summary.json)
- [.local/verify/web-delta-final-20261007-ZL9Blu/summary.json](.local/verify/web-delta-final-20261007-ZL9Blu/summary.json)

The same commands can be run from either retained `source/` directory with `NEXT_TELEMETRY_DISABLED=1` and an installed browser selected through `COMMUNITY_CHROMIUM_PATH`:

```sh
npm run test:tokens
npm run check:tokens
npm --prefix web run typecheck
npm --prefix web run test:client
npm --prefix web run test:unit
node --test --test-concurrency=1 tests/unit/spaces-ui.test.mjs tests/unit/home-ui.test.mjs
```

Interim invitation failures remain under `.local/verify/web-invitation-delta-20261007-4Z7hxn/` and `.local/verify/web-invitations-fixed-20261007-jnt34I/`; the final capture contains the subsequent fixes, not a relabelled earlier result. Source capture excluded credentials and databases. No live provider calls, dependency downloads, application-code edits or service restarts were made by this qualification pass. Newly added synthetic-API tooling, backend/native execution, signed-in live journeys and ESLint remain outside this result; this is not production qualification.

### Offline Agent Checks

The golden-request inventory and its scoring/selection tests can be checked without a running API or model provider:

```sh
npm run test:golden
npm run golden
npm run golden -- --area space
npm run golden -- --only main-shop-location
```

An individual follow-up selects its whole conversation thread. Unknown areas or case IDs, missing option values and filters matching no cases exit with an error instead of reporting a successful empty check. `--live` is a separate, explicit mode that can make paid provider calls; the commands above do not enable it.

Numeric options are validated before execution. `--max-tokens` and `--limit` require positive safe integers; `--reserve` accepts a non-negative safe integer, including zero. `--min-pass` accepts a finite ratio from 0 to 1, inclusive (for example, `0.95` for 95%). Non-numeric values, infinity, fractional token counts and integers beyond JavaScript's safe range are rejected. Defaults remain 120,000 maximum tokens per run, a 300,000-token reserve and a 2,000,000-token shared limit. This validates inputs; it does not change the live runner's spending-accounting design.

`--repeat N` (1 to 10, default 1) runs every selected thread N times with fresh accounts and reports pass^N: the share of cases that passed every run, as in tau-bench, plus the cases that passed only sometimes. With repeats, `--min-pass` applies to pass^N. Saved runs keep each result's round, so `--score` re-scores them the same way. Repeats multiply live token use. The runner checks recorded usage before every turn, not only between threads; after observing the `--max-tokens` cap, it skips remaining turns and later rounds while keeping them in the planned denominator and logging out created accounts.

The per-turn budget follow-up passes **69/69 golden tests and 24/24 verifier tests**, with no recorded source changes in the [aggregate run](.local/verify/golden-turn-budget-20261007/summary.md). Its initial regression reproduced an extra follow-up after the first turn reached the cap. Five mocked execution checks cover exact-cap and over-cap results, subsequent rounds, a funded full thread, pre-existing usage and usage arriving during account setup. HTTP responses and the token ledger are simulated; this pass made no live model request and did not change actual usage records. One in-flight request can still exceed the cap, and concurrent ledger accounting is not an atomic reservation. This guard prevents starting the next request after a recorded cap, not an absolute spending guarantee.

Re-scoring rejects empty reports, duplicate trials and explicit case/area selections whose results are missing. Unfiltered older partial reports remain supported. New reports retain the planned case list and repeat count; unattempted cases and missing rounds stay incomplete rather than reducing the denominator or the required number of trials. The merged offline scoring/CLI suite passes **60/60**, with the earlier failing controls retained in the tests.

The outcome-evidence follow-up adds `no executed writes`: this no-approval harness cannot pass a run with a recorded successful write, even if its answer or approval proposal otherwise matches. Saved-report re-scoring and repeated-run gates enforce the same rule. The current golden suite passes **64/64**, and the integrated verifier self-tests pass **24/24** ([report](.local/verify/research-outcomes-20261007/summary.md)). This inspects recorded tool outcomes, not independent database state; it does not qualify live models or change application approval behavior. [Fresh primary sources, a proposed user experiment and the next state-checking boundary](docs/PRODUCT_RESEARCH_2026-10-07.md#16-outcome-evidence-not-convincing-answers) keep product research separate from engineering pass counts.

On 2026-10-06, this repair on top of the `development` snapshot `7d94559` passed all 20 scoring/CLI tests; the 41-case inventory validated as 39 threads, and the web typecheck passed. The local login preview returned HTTP 200 after a fresh start. These results do not qualify model answers, backend integration, Android or a production release. The snapshot omits the documentation map and task/decision records referenced by older sections; those records were not reconstructed by this change.

The numeric-validation follow-up on 2026-10-07 passes all 41 scoring/CLI tests. Seven invalid-value regressions failed before the fix; the expanded checks also cover valid boundaries and prove that invalid values fail before `fetch`, even with `--live` selected. Those tests replace `fetch` with a blocked test implementation; no real live run or provider call was made. The 41-case inventory still validates as 39 threads.

### Agent Interface Recovery: 2026-10-07

The shared Agent view again exposes its recorded plan, source references, action results and timestamped activity under **Request details**, in both the Main Agent and private Space-chat reviews. Refused and unclear outcomes are labelled explicitly. Queued, running and verifying requests refresh until they finish; denied reads hide cached content and stop polling, while read failures expose **Retry**.

The offline browser fixtures now follow the current interfaces: the Main Agent has no Space selector, and private Space requests are reviewed in their own chat. Tests retain exact approvals, same-key/version retries, context isolation, source-text handling and responsive checks. A fresh read after a lost approval response can confirm the saved outcome without another write; an unanswered read still allows retrying the original reviewed command.

```sh
node --test --test-concurrency=1 tests/agents-client.test.mjs tests/unit/agents-ui.test.mjs tests/unit/messaging-ui.test.mjs
npm --prefix web run typecheck
```

With an installed compatible Chromium selected through `COMMUNITY_CHROMIUM_PATH`, these suites passed **82/82 tests**, with no failures or skips, including 320px/200% text, English/Telugu/Hindi request records, and the 2,000-character message boundary. Web typechecking and changed-file whitespace checks also passed. Tests used synthetic in-browser responses; no live model/provider calls, database changes, Android changes or deployment were performed. Other sessions continued changing the shared worktree, so this is not a frozen whole-project qualification.

### Agent Runtime Boundary Checks: 2026-10-07

The runtime now applies the existing 30-tool-call limit inside model tool batches, automatic article reads and research helpers, not only between model turns. Reaching the cap records a finished `step_limit` result instead of leaving a request running. No 31st helper HTTP request is sent. Answers containing no visible text after sanitization fail explicitly rather than becoming a fabricated "Done."

Thirteen additional API regressions cover these cases and the exact six-minute active deadline, including late helper/model responses, late page content, retained attempt accounting and no unapproved actions. The deadline/access checks already being repaired in the shared worktree were preserved.

The complete Agent backend command, run from `backend/`, passed **287/287**:

```sh
python -m pytest -q tests/test_agent_*.py tests/test_space_agent_switch.py
```

This requires `COMMUNITY_ENVIRONMENT=test` and `COMMUNITY_DATABASE_URL` pointing to an isolated synthetic PostgreSQL `community_test` database. The test fixture migrates a fresh schema and removes it afterwards. This run used a separate disposable PostgreSQL 17 container, empty model/web provider settings and scripted/MockTransport responses; the container was removed after qualification. Agent source and test hashes stayed unchanged throughout the run. The 18 Agent client checks, web typechecking and focused Ruff checks also passed. Dependency deprecation warnings remain; no live model evaluation, shared-data reset, provider budget increase or deployment is claimed.

### Whole-Website Regression Qualification: 2026-10-07

The full offline browser pass initially found four stale Telugu/Hindi Agent cases: they still required the removed Space selector, 500-character input boundaries and an older approval heading. The fixtures now use Main-Agent public-post proposals, the 2,000-character request and 1,000-character answer limits, and the translated approval-state suffix. Mixed-script content, exact approval headers/body, dates, memory confirmation and 320px/200% text assertions were retained.

The affected localization file passed **12/12**, then a fresh complete offline run passed **532/532**, with no failures or skips and unchanged website-source, public-asset and browser-test hashes. All **261 client/BFF checks**, **10 design-token tests**, the generated-token/contrast check and web typechecking also passed.

```sh
node --test --test-concurrency=1 tests/unit/*.test.mjs
node --test --test-concurrency=1 tests/*-client.test.mjs
npm run test:tokens
npm run check:tokens
npm --prefix web run typecheck
```

Browser tests use the installed Chromium selected by `COMMUNITY_CHROMIUM_PATH` and synthetic intercepted responses, not real accounts or model providers. The initial failed browser run remains in `.local/verify/autonomous-offline-ui-20261007.log`; the successful rerun is `.local/verify/autonomous-offline-ui-final-20261007.log`, and client results are `.local/verify/autonomous-client-contracts-20261007.log`. This qualifies the tested offline website behavior, not live external integrations or production deployment.

### Complete Backend And Production Build Follow-up: 2026-10-07

The complete backend suite, `python -m pytest -q tests` from `backend/`, passed **1,001 tests** against a disposable synthetic PostgreSQL database. Its source check detected concurrent changes to Agent tools, help-post access handling and associated tests, so that broad result is not a frozen-current-tree claim.

Every changed area was then rechecked together:

```sh
python -m pytest -q tests/test_agent_*.py tests/test_space_agent_switch.py tests/test_community_classification.py tests/test_help_posts.py tests/test_live_updates.py
```

That follow-up passed **370/370**, with unchanged backend-source, migration and test hashes. The result is retained in `.local/verify/backend-followup-20261007.log` and its input manifest in `.local/verify/backend-followup-inputs-20261007.sha256`. The owned database container and its temporary storage were removed afterwards; the shared application database was not changed. Existing Starlette/httpx, Alembic and SQLAlchemy deprecation warnings remain.

An isolated production build also passed:

```sh
COMMUNITY_BUILD_LABEL=autonomous-20261007 NEXT_TELEMETRY_DISABLED=1 npm --prefix web run build
```

Next.js compiled all application routes and completed TypeScript checking. Output is retained under `web/.local/build-autonomous-20261007/`, with the build log at `.local/verify/autonomous-production-build-20261007.log`. Only the build-added `tsconfig.json` include entries were removed, followed by another successful typecheck. This was a build verification, not a deployment or a live provider qualification.

### Coordinated Reliability Checkpoint: 2026-10-07

Independent workstreams repaired registration Retry state and preserved an explicitly selected timezone, made Space-settings reload keep its conflict/draft until fresh reviewed values arrive, and corrected a Radix keyboard test to wait for the exact scheduled focus target. Existing assertions, permissions, reviewed versions and retry identities were preserved. Identity/events checks passed 45/45, Spaces 15/15, and the Home file 5/5 with 12/12 repeated focus checks. The focus issue was a test synchronization defect, not a production navigation change.

The [combined local gate](.local/verify/manager-final-20261007/summary.md) passed 23 runner checks, 10 token checks, 60 golden checks, web types and 261 client/BFF checks with no recorded source changes. The subsequent CI contract check brings runner self-tests to 24/24. Isolated backend verification passed 44/44 realtime checks and 20/20 migration/classification checks; owned test containers and schemas were removed. The realtime production compatibility fix came from the concurrent backend workstream; this pass added signature/deadline regression coverage and verified it.

A retained 201-input browser capture passed 438 checks and exposed seven missing cross-platform-fixture failures plus the focus-test race. A derivative preserved every application input, added the required backend schema and three Android translation files, and changed only the focus test; all 115 affected checks then passed with unchanged captured inputs. Evidence is under `.local/manager-web-snapshot-20261007-jL9IGQ/` and `.local/manager-web-complete-20261007-d6zVWU/`. The separate full 532-test website pass above remains separately scoped; these overlapping runs are not added together.

The [remaining-gates report](.local/verify/manager-blockers-20261007/summary.md) correctly exits nonzero: four authoritative records were deleted by the current commit, and device verification cannot run on this Linux host. No check was removed to obtain a green default run.

The bounded supervisor's 33 self-tests also pass. A real two-cycle integration with runner/token/golden/type gates passed its first cycle; all checks passed in the second, but the supervisor stopped with `changed` because working instructions and documentation changed concurrently. The [retained result](.local/work-cycle/2026-10-07T06-49-23-635Z-iI2mG3/summary.json) is not relabelled as a clean two-cycle pass. Its exclusive lock was released. No perpetual process, code-writing daemon or remote run was started.

The local preview later stopped answering because its shared Next.js client manifests were missing or empty. After confirming the exact unhealthy Next.js process, only that frontend was restarted with `COMMUNITY_BUILD_LABEL=manager-preview-20261007`; the original generated cache was retained. `/login` returned HTTP 200 again, and typechecking passed after removing the two preview-generated TypeScript include entries. The preview stays at `http://127.0.0.1:3000`. API-backed screens still reported 503 during this check; the API/mail services and shared database were not started, migrated or reset by this recovery. This is frontend availability, not live backend qualification.

An operations follow-up restarted only the existing local Mailpit container without recreation, image pulls or builds; its UI at `http://127.0.0.1:8025` returned HTTP 200 and SMTP returned 220. API recovery remains blocked: the documented `community` database has no `alembic_version` table, while the code requires `0057`; default encryption-key files are absent and alternative key provenance is unconfirmed; the inspected environment lacks required LangGraph/LangChain libraries. No API or workers were started, and no replacement keys, migrations or dependency downloads were performed. Proxy `/api/timezones` still returns 503. Decide between recovering the intended database/keys and provisioning a separate synthetic development environment before changing that state.

### Isolated Synthetic API Recovery: 2026-10-07

A separate synthetic runtime now unblocks manual local use without recovering or changing the shared database above. The declared backend dependencies were installed into a new virtual environment under `.local/synthetic-api-20261007-wfwl2m__/`; `pip check` passed. Existing virtual environments, shared database/Mailpit containers and the saved environment file were not changed. Package downloads were used for setup; no model or web-provider requests were made.

The runtime has its own PostgreSQL 17 container, private Mailpit, new identity key and captured backend. Only the fresh `community_test` database was migrated, to `0057`. All 180 captured inputs matched their before/after hashes, stayed unchanged through the journeys, and still matched shared backend source at the final comparison. The owned Docker labels were verified directly and key permissions were `0600`; key contents were not read. The web process remained the shared preview, so these are not frozen full-stack or production qualification results.

API readiness and both direct/proxied timezone reads return HTTP 200. The preview is `http://127.0.0.1:3000`, API `http://127.0.0.1:8000`, and this instance's private verification inbox `http://127.0.0.1:32787`. Use only new synthetic `.test` accounts here: old shared-database accounts are not part of this instance. Model/web-provider settings are blank and tracing is disabled. Synthetic PostgreSQL uses tmpfs; stopping/removing that container loses its data. No existing database was migrated, reset or given a replacement key.

Nine existing real browser journeys passed without assertion changes: desktop account registration/profile/session revocation/recovery; mobile registration/offline handling; private Space creation with exact retry and account isolation; invitation acceptance/decline/revocation; shared-task completion and stale-edit rejection; worker reminder delivery/retry/cancellation/acknowledgment; recipient reminder consent/decline/withdrawal; Space/direct chat retries, removal and deletion; and event creation/RSVP/rescheduling/cancellation. Logs are under `.local/synthetic-api-20261007-wfwl2m__/logs/`, with the source/resource recheck in `post-journey-input-check.json` beside them. Early readiness-event and manifest-reader setup failures happened before migration; the successful provision verified the actual manifest fields and PostgreSQL's final TCP startup.

The [synthetic launcher](scripts/synthetic-api.mjs) validates owned paths, source hashes and loopback synthetic settings, strips inherited provider/database redirection settings, forces providers off, and forwards signals only to its child. Its 19 network-free tests pass. `--check` also passed on the real runtime; the mail worker was handed over to this launcher and the final three live journeys passed afterwards. The API and reminder worker remain under their original owned supervisors. No extra API was started by `--check`.

```sh
node --test scripts/synthetic-api.test.mjs
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-20261007-wfwl2m__/runtime.json --check
COMMUNITY_WEB_URL=http://127.0.0.1:3000 COMMUNITY_MAIL_URL=http://127.0.0.1:32787 node --test --test-concurrency=1 --test-name-pattern='^desktop: real signup|^mobile: signup|^spaces: create|^invitations: intended|^tasks: admitted|^reminders: real worker|^reminder requests: real recipient|^messages: Space chat|^events: exact create' tests/e2e/identity.test.mjs
```

The only acceptance-file change makes `COMMUNITY_MAIL_URL` configurable while preserving its default; it avoids reading the shared inbox during isolated tests. See [local infrastructure](infra/README.md) for foreground launch, ownership checks and manual cleanup. These processes are local development services, not unattended coding agents. Shared-data/key recovery, full release/native qualification and live provider approval remain separate gates.

#### Browser Termination Investigation: 2026-10-07

The earlier successful local journeys above remain historical evidence, not a current all-clear. A later [supervised four-journey attempt](.local/verify/invitation-live-supervised-20261007/journeys.log) failed with browser pages reporting `killed`, code 15. Its [supervisor result](.local/verify/invitation-live-supervised-20261007/process-result.json) has exit code 1 but no deadline, cancellation or launch error. Selecting Playwright 1.60's matching cached Chromium 1223 did not by itself resolve the failures.

The resumed investigation verified the running API's actual database/SMTP settings, disabled model/web-provider settings, owned container labels and readiness without printing secrets. It started a missing preview on the required `127.0.0.1:3000`; that preview later exited with code 143 while another preview/test workstream appeared. Next.js also logged transient static-path `definition` errors during that run; their cause was not established and they are not treated as the source of the browser signal.

A single unchanged `^tasks:` journey was run under `strace` and the existing process-group supervisor with a 210-second deadline. It failed after about 66 seconds during navigation to `/app/spaces`, with no supervisor stop reason. The [signal trace](.local/verify/task-signal-diagnostic-XJloup/signals.trace) first records renderer process 521786 receiving `SIGTERM` with `si_pid=0`, `si_uid=61876` at 09:01:03.314573. The visible test commands run as UID 1000, and the subsequent browser cleanup signals have ordinary visible sender IDs. This is consistent with a sender outside the visible PID namespace, but the exact actor and reason remain unidentified. It is not evidence that a product assertion failed or that an application patch would prevent the termination.

Two separate network-blocked browser controls passed with Chromium `148.0.7778.96`: [eight fresh contexts](.local/verify/browser-signal-control-TSdLtW/stdout.log), and [one persistent page](.local/verify/browser-duration-control-66Lxse/stdout.log) completing 250 fill/click/screenshot cycles over 34.62 seconds. Their signal traces are retained beside the logs. The first diagnostic program had a quoting error before browser launch; its failed setup remains in `.local/verify/browser-signal-control-ZG1Iaf/` and was corrected through JSON serialization, not a browser flag or test change.

At that investigation's final process/listener check, neither port 3000 nor port 8000 had a listener, and a separate offline browser run was active. No other workstream's process was terminated or restarted by that investigation. **That attempt could not qualify the live workflow** without a stable API/mail/preview lifetime and an uninterrupted browser run. Revalidate the owned runtime and listeners, pin the browser/test source, run one selected journey with retained diagnostics, and stop on unexplained termination. Do not reset shared data, replace keys, bypass process supervision, raise deadlines blindly or relabel these failures using older passes. The application and existing assertions were not changed by the investigation; the later requalification below has separate evidence.

#### Live Invitation Requalification: 2026-10-07

The next pass found the preview active but the owned synthetic API and mail worker stopped. The retained 180-file backend manifest, exact container labels, existing `community_test` revision `0057`, and preview process/API target were checked before restoring only the missing API/mail processes through `scripts/synthetic-api.mjs`. No container, database, key or environment file was recreated. The launcher forces model/web providers and tracing off. API readiness, the proxied timezone endpoint and private Mailpit all returned HTTP 200.

Playwright 1.60.0 used its matching installed headless Chromium revision 1223. A metadata probe initially tried an unexported package subpath; reading the JSON beside the resolved package corrected that setup check. A separate fingerprint preflight named the old plural `tasks-screen.tsx`; it was corrected to `task-screen.tsx` before launching a browser. Neither setup failure is counted as a journey result.

- [Intended-recipient run](.local/verify/invitation-live-requalification-M4rKcL/summary.json): **1/1 passed**, about 16 seconds, no supervision stop or watched-input changes. It verifies an interrupted successful Join response, the same retry with one recipient admission and unchanged Space version, 404 for a task from before admission, visibility/assignment of a new task in the correct Space, decline and revocation. [JUnit](.local/verify/invitation-live-requalification-M4rKcL/journey.xml) and [mobile handoff](.local/verify/invitation-live-requalification-M4rKcL/invitation-task-handoff-mobile.png) are retained.
- [Related live run](.local/verify/invitation-related-live-M6qFUE/summary.json): **3/3 passed**, about 31 seconds, with 180 frontend/source/asset/test fingerprints unchanged. Cases cover lost invitation-decision replies without duplicate admission, re-admission without access to earlier tasks, and shared-task completion/reopening with stale-edit rejection. [JUnit](.local/verify/invitation-related-live-M6qFUE/journeys.xml), [desktop task view](.local/verify/invitation-related-live-M6qFUE/tasks-desktop.png) and [mobile task view](.local/verify/invitation-related-live-M6qFUE/tasks-mobile.png) are retained.

Both JUnit reports were parsed and contain zero failures/errors/skips. These are four distinct current scenarios; they overlap older coverage and are not added to the historical nine-journey total. Assertions, browser flags and per-test deadlines were unchanged. Screenshots were inspected and copied beside their reports with hashes. The captured backend manifest still validates, but this is the recorded backend snapshot plus the current preview, not a frozen whole-product release or live-model qualification.

The earlier `SIGTERM` sender remains unidentified; no root-cause fix is claimed from the subsequent passes. During final checks another workstream had started a second synthetic mail worker, so only the worker started by this pass was stopped, leaving the other worker intact. The restored owned API and existing preview are left available at `http://127.0.0.1:8000` and `http://127.0.0.1:3000`; verify their current process state before reuse. All accounts and content were synthetic `.test` data in the owned temporary database. No real email, model/web-provider call, shared-data reset, migration, deployment or saved-environment change occurred.

#### Recipient-consent Recheck

A fresh [retained recipient-consent run](.local/verify/20261007082659600-466461/summary.md) passed **1/1** in 19 seconds, with no skipped cases, evidence errors or recorded source changes. It independently repeats one of the nine scenarios above; the counts are not added together. Before running, the exact synthetic container labels, owned API/mail processes, matching database/key paths, private SMTP target, disabled providers and local endpoint availability were checked without restarting services or exposing secret values. The 180-file captured backend manifest was revalidated afterwards.

```sh
COMMUNITY_CHROMIUM_PATH=<installed-headless-chromium> COMMUNITY_WEB_URL=http://127.0.0.1:3000 COMMUNITY_MAIL_URL=http://127.0.0.1:32787 node --test --test-concurrency=1 --test-name-pattern='^reminder requests:' tests/e2e/identity.test.mjs
```

The real local API confirmed no recipient schedule before consent, rejected the sender accepting on the recipient's behalf, and produced exactly one schedule after lost-response creation/acceptance retries. Decline, sender withdrawal and recipient cancellation also passed. The [owner review](.local/verify/20261007082659600-466461/review-owner.png), [recipient review](.local/verify/20261007082659600-466461/review-recipient.png) and [scope record](.local/verify/20261007082659600-466461/scope.json) are archived beside the log. The two accounts and all content were synthetic; browser requests outside the local web origin were blocked.

An [earlier preflight](.local/verify/20261007082555108-464739/summary.md) correctly recorded **not run** when configured with a missing full-Chromium executable. Selecting the already installed headless shell resolved the prerequisite without a download or code change. This recheck used the captured backend at `0057` plus the existing current-source web preview; it is not a frozen full-stack release or a current-backend qualification. It did not exercise reminder-worker delivery, push/external notifications, model providers or real-user usability. No application/test assertions, runtime metadata, saved environment, keys, permissions or services were changed.

| Next work | Owner | Required decision or acceptance gate |
| --- | --- | --- |
| Recover intended shared data | Product owner / platform engineer | A separate synthetic API now passes readiness and nine manual journeys. Recover the intended database and matching keys separately; do not repoint this instance or replace existing keys. |
| Restore an authoritative requirements backlog | Product owner / delivery manager | Decide how to recover or replace the deleted task, decision, build-status and evaluation records; do not silently restore potentially obsolete policy. |
| Qualify Windows automation | Platform engineer | Publish the reviewed workflow and inspect an actual Windows run; configuration tests are not Windows execution. |
| Qualify native release behavior | Android engineer / QA | Provide the required SDK/emulator environment, then run JVM, release and device gates without reusing historical passes. |
| Qualify a release candidate | Technical lead / QA | Freeze one candidate and run all required backend, web, contract, recovery and signed-in journey gates against it. |
| Approve production integrations | Product owner / security reviewer | Resolve provider, privacy, budget and deployment decisions before live external evaluation or rollout. |

Routine implementation, scoped fixes, independent review and local verification continue without per-task approval. The queue above records real remaining boundaries, not permission prompts for ordinary engineering. Repository CI and the bounded work supervisor below automate checks; neither is an unattended coding service or an approval to change product policy.

## Research And Bounded Work

The [product research report](docs/PRODUCT_RESEARCH_2026-10-07.md) distinguishes repository facts, retrieved public sources, proposed product decisions and 14 explicitly synthetic user perspectives. It covers the first useful customer workflow, accessibility across generations, actual privacy controls versus a public privacy policy, real-user research, and product-specific Agent benchmarks. It is not an approved policy or evidence of product-market fit.

The [bounded working mode](docs/PRODUCT_RESEARCH_2026-10-07.md#14-bounded-working-mode) wraps the existing verifier:

```sh
npm run test:work-cycle
npm run work:cycle
npm run work:cycle -- --cycles 3 --minutes 20 --suite tokens,golden,typecheck,client
npm run work:cycle -- --watch --cycles 10 --minutes 120 --suite tokens,golden,typecheck,client
npm run work:cycle -- --status
npm run work:cycle -- --stop
```

Default: one offline pass with a 15-minute total deadline. Explicit limits are at most 10 cycles and 120 minutes. An exclusive lock, Ctrl+C, a persistent stop file, child-process termination and separate reports keep runs bounded and inspectable. Missing results, skipped tests, failures and source changes during verification stop the cycle without being relabeled as success.

For checks that wait for new work rather than rerunning an unchanged tree:

```sh
npm run work:cycle -- --watch --cycles 10 --minutes 120 --suite tokens,golden,typecheck,client
npm run work:cycle -- --status
npm run work:cycle -- --stop
```

`--watch` performs the first pass immediately, then checks for source edits or a new commit every five seconds.
`waiting_for_change` means idle, not ongoing implementation. A watch session still ends on its deadline/cycle cap or any failed/incomplete result.
The STOP file is persistent and is never automatically cleared. No coding worker or scheduler is enabled by this command.

The [primary-source follow-up and research kit](docs/PRODUCT_RESEARCH_2026-10-07.md#15-primary-source-challenge-and-operational-follow-through)
separate real public evidence, proposed experiments and synthetic customer perspectives. The [privacy data map](docs/PRIVACY_READINESS.md)
links actual controls to outstanding operator, processor, retention and legal decisions. Public privacy/terms pages are drafts, not launch approval.

This is a Linux/macOS check supervisor, not a coding daemon, security sandbox or in-app auto-approval switch. It never adds live/model evaluation, paid-provider calls, deployments or automatic repairs. No scheduler was installed. The [working brief and hook/skill guidance](docs/PRODUCT_RESEARCH_2026-10-07.md#141-one-brief-instead-of-repeated-permission-prompts) explain how to continue approved work without repeatedly asking about routine steps. Qualification results and retained failed attempts are in the [verification record](docs/PRODUCT_RESEARCH_2026-10-07.md#143-verification-record).

### Watch-input Requalification: 2026-10-07

After a watch stopped because inputs changed, the current community, events, Agent, public-notice and localization files
were checked together. The first pass found two stale localized signup assertions: the offline fixture already intercepts
the timezone list, so that expected read is not evidence of a real outbound request. A concurrent edit corrected those
assertions and was preserved rather than overwritten.

Three added Agent browser cases verify the provider notice and its privacy link in English, Telugu and Hindi before any
Agent request, including 320px/200% text and zero writes. The combined affected run passed **187/187**. Its source check
identified concurrent changes only in the Space-invitation component and Space tests; that focused follow-up passed
**17/17** with unchanged invitation/test inputs. Web typechecking and changed-file whitespace checks also passed.

```sh
node --test --test-concurrency=1 tests/unit/community-ui.test.mjs tests/unit/events-ui.test.mjs tests/unit/agents-ui.test.mjs tests/unit/about-ui.test.mjs tests/i18n-client.test.mjs
node --test tests/unit/spaces-ui.test.mjs
```

Browser checks require the installed Chromium selected through `COMMUNITY_CHROMIUM_PATH`. Evidence is retained in
`.local/verify/continued-watch-affected-20261007.log` (initial failures),
`.local/verify/continued-watch-final-20261007.log`, and `.local/verify/continued-watch-spaces-20261007.log`.
These are scoped synthetic checks, not a frozen full-project or live-provider qualification.

### Agent Data-use Controls: 2026-10-07

**AI data use** is now available from the Main Agent header even when requests already exist, beside a valid `@agent`
draft in Space chat, and inside an existing private Agent review/question. The shared dialog names configured processors
and the information they can receive; it does not enable a provider, change auto-approval or record legal consent.
English, Telugu and Hindi interface copy is available; native-language/legal qualification remains separate.

Opening the explanation never sends the draft or answers a question. Escape and Close return keyboard focus to the
control, and opening the privacy notice in a separate tab preserves the current draft. The existing memory confirmation
uses the same extracted native-dialog helper, with its pending-operation lock and reviewed deletion behavior preserved.

Five new UI regressions failed before implementation. The final combined Agent client, localization, Agent-browser and
messaging-browser run passed **103/103** with stable affected inputs; web typechecking, **10/10** design-token tests and
the token-generation/contrast check passed.

```sh
node --test --test-concurrency=1 tests/agents-client.test.mjs tests/i18n-client.test.mjs tests/unit/agents-ui.test.mjs tests/unit/messaging-ui.test.mjs
npm --prefix web run typecheck
```

The real Next.js page was also checked with explicitly intercepted synthetic APIs, including existing history, the new
dialog, Escape, preserved draft text and zero writes. A [320px reduced-motion capture](.local/screenshots/provider-data-use-live-20261007.png)
shows that UI; it is not a real customer session or live provider evaluation. Logs and the stable-input manifest are
`.local/verify/provider-disclosure-final-20261007.log` and `.local/verify/provider-disclosure-final-inputs-20261007.sha256`.

### Invitation List Response Validation: 2026-10-07

The shared invitation-list reader now verifies that an inbox response belongs to the current recipient and that sent
invitations belong to the requested Space. It rejects duplicate IDs, a repeated continuation cursor, an empty page that
claims more records, and a response larger than the requested 20 items. Invalid responses surface as an explicit
`INVALID_RESPONSE` error rather than becoming a misleading review or repeated Load more page.

Valid 20-item pages, all supported sent-history statuses, genuinely empty final pages, exact cursor/header forwarding
and cancellation remain supported. The browser's clock is not used to reinterpret server invitation state. Home's
invitations section shows Retry for a mismatched response while other Home sections remain usable, and recovery is a
read-only retry of that source.

Nine negative client cases reproduced the old acceptance behavior before repair; five positive/cancellation controls
and a Home browser recovery case cover preserved behavior. The complete affected run passed **130/130**, with unchanged
owned source/test inputs, and web typechecking passed:

```sh
node --test --test-concurrency=1 tests/web-client.test.mjs tests/spaces-invite-policy-client.test.mjs tests/text-limits-client.test.mjs tests/unit/home-ui.test.mjs tests/unit/spaces-ui.test.mjs
npm --prefix web run typecheck
```

The browser files use the installed Chromium selected through `COMMUNITY_CHROMIUM_PATH`. Logs are retained in
`.local/verify/invitation-list-contracts-20261007.log`; the owned-input manifest is
`.local/verify/invitation-list-inputs-20261007.sha256`. This is defensive client validation, **not** a substitute for
server authorization or a claim that receiving data in a browser is safe merely because the UI rejects it.
Invitation policy, account permissions, backend operations and real data were unchanged; concurrent recipient-action
repairs were preserved.

### Sent-invitation Recovery: 2026-10-07

A failed sent-invitation read now clears an open withdrawal confirmation and hides its cached pagination action.
Recovery restores the list, not the old confirmation: the person must deliberately review the current invitation again.
Creation drafts, same-request retry identities, server permissions and existing pending-operation controls are unchanged.

Two new desktop/320px regressions failed before the fix and pass after it, including root text at 200%, a replaced
invitation on recovery, no stale recipient in the new review and zero withdrawal requests during the failed read.
The complete Space browser and invitation-policy/role client selection passes **64/64** with no skips; types pass
and the watched web/test hashes remain unchanged. Evidence is in
[.local/verify/sent-invitation-recovery-20261007-d8uPyf/summary.json](.local/verify/sent-invitation-recovery-20261007-d8uPyf/summary.json).

The existing live intended-recipient journey also passes **1/1**, using the owner-managed isolated synthetic runtime,
the actual Next.js proxy/API and its private Mailpit. It covers creation, review, an interrupted acceptance response,
exact retry with one admission, decline and revocation at desktop/mobile sizes. The API listener's database/key/mail
configuration and exact container labels were checked against the runtime, without printing secrets; provider settings
were empty. Runtime capture validation covers 180 backend files, not a claim about every current backend change.

```sh
node --test --test-concurrency=1 tests/unit/spaces-ui.test.mjs tests/spaces-invite-policy-client.test.mjs tests/spaces-roles-client.test.mjs
npm --prefix web run typecheck
COMMUNITY_WEB_URL=http://127.0.0.1:3000 COMMUNITY_MAIL_URL=http://127.0.0.1:32787 node --test --test-name-pattern='^invitations: intended' tests/e2e/identity.test.mjs
```

Browser commands need the installed Chromium selected through `COMMUNITY_CHROMIUM_PATH`. The live record is
[.local/verify/sent-invitation-live-20261007-IeNQ26/summary.json](.local/verify/sent-invitation-live-20261007-IeNQ26/summary.json),
with unchanged web/test inputs and inspected desktop/mobile captures. The transient-error behavior is covered by
the offline regressions; the live journey did not inject that list failure. Only synthetic `.test` accounts and their
invitations were created. No service restart, migration, dependency download, real-user data or provider call was involved.

### Withdrawal Retry Reconciliation: 2026-10-07

The sent-invitation panel now retains an unconfirmed withdrawal for an explicit **Retry original decision** even after
the confirmation closes and refreshed history no longer offers a pending withdrawal. Within that management session,
the retry uses the original invitation, serialized body and account. It does not create a new invitation or clear an
unsent recipient draft. Unavailable history hides the control; known server refusals are not treated as unknown outcomes.
The existing result-identity checks and server permissions are unchanged.

Six desktop/mobile cases reproduced the missing control before repair. The 11 new cases also cover read failures,
denied access, known refusals, draft preservation and exactly one stored withdrawal after an identical retry. The complete
affected Space browser, recipient-recovery and invitation-policy/role client selection passed **88/88**, with zero
failures/errors/skips in the parsed [JUnit report](.local/verify/withdrawal-retry-final-20261007.xml). Web types and editor
diagnostics pass. All 186 [watched inputs](.local/verify/withdrawal-retry-inputs-20261007.sha256) stayed unchanged during
that full run.

A subsequent test-only follow-up doubles actual rendered text, including fixed-size controls, at 320 px instead of
relying only on root-font scaling. Its **11/11** focused [report](.local/verify/withdrawal-retry-viewport-focused-20261007.xml)
adds focus and pointer hit-testing; [desktop](.local/verify/withdrawal-retry-viewport-captures-20261007/withdrawal-retry-1280.png)
and [mobile](.local/verify/withdrawal-retry-viewport-captures-20261007/withdrawal-retry-320.png) viewport captures were inspected.
Only the Space browser fixture was changed by this follow-up after the full run; the other 185 captured inputs matched
at that checkpoint. A later inventory check detected a concurrent edit to [the planning client](web/src/features/planning/client.ts).
That edit was preserved and is not qualified by this invitation run. The narrower [invitation input record](.local/verify/withdrawal-retry-current-inputs-20261007.sha256)
identifies this follow-up's implementation and test dependencies. These overlapping runs are not a 99-test total or a
frozen current-tree or whole-product qualification.

```sh
export COMMUNITY_CHROMIUM_PATH=/home/codespace/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
node --test --test-concurrency=1 tests/unit/spaces-ui.test.mjs tests/unit/invitation-recovery-ui.test.mjs tests/spaces-invite-policy-client.test.mjs tests/spaces-roles-client.test.mjs
node --test --test-name-pattern='spaces: withdrawal retry' tests/unit/spaces-ui.test.mjs
npm --prefix web run typecheck
```

The six actual pre-fix failures are retained in `.local/verify/withdrawal-retry-before-20261007.log`; the full and final
focused logs use the matching `withdrawal-retry-final` and `withdrawal-retry-viewport-focused` names. Two earlier launch
attempts did not establish product behavior: a legacy executable name was absent, then revision 1243 stalled and only
its identified test/browser processes were stopped. Revision 1223 completed the checks without downloads. The stall's
cause was not established. Earlier panel-cropped captures and intermediate text checks remain retained; the viewport
captures above avoid misrepresenting the fixed navigation inside a tall panel crop.

The previous frontend was not listening on port 3000. This follow-up started only the local preview with
`COMMUNITY_BUILD_LABEL=withdrawal-recovery-20261007` and `NEXT_TELEMETRY_DISABLED=1`; `/app/spaces` then returned HTTP 200.
The preview remains running at `http://127.0.0.1:3000`. Its two generated TypeScript include entries were removed and
typechecking passed again. This is frontend availability, not a new signed-in/API qualification: the separate
[runtime/process-ownership gate](#browser-termination-investigation-2026-10-07) remains open. No API or worker was
started, and no backend, provider, policy, key, saved environment, real-user data or deployment was changed.

### Recipient Decision Recovery After Refresh: 2026-10-07

If an invitation decision reaches the server but its response is lost or cannot be validated, the invitation may
disappear from the pending inbox before the screen can confirm the result. The recipient now has **Retry original
decision** even after refreshing that list or closing the join review. It repeats the retained invitation ID and
accept/decline action; it does not guess a new decision or create a new invitation.

The control is hidden while the inbox is unavailable or account access is denied, and known refusals such as a closed
or expired invitation are not treated as unknown outcomes. It is an explicit user action, not an automatic retry.
Recovery state lasts while this page is mounted; it is not a new durable queue across full reloads or sign-out.

Four isolated browser cases reproduced the missing control before repair. The affected client, Space, account-language
and recovery suites pass **164/164** with stable recovery inputs, including 320px/200% text, denied-read recovery,
known refusals and Telugu/Hindi controls. Web typechecking and syntax/whitespace checks pass.

```sh
node --test --test-concurrency=1 tests/web-client.test.mjs tests/i18n-client.test.mjs tests/unit/invitation-recovery-ui.test.mjs tests/unit/spaces-ui.test.mjs tests/unit/i18n-account-ui.test.mjs
```

The real local journey also passed after restoring validated runtime prerequisites: the browser loses a **successful**
server response, refreshes to an empty pending inbox, then retries the original decision. API reads verify unchanged
Space version and roster after acceptance, and no membership after decline. The latest successful run and stable-input
manifest are `.local/verify/recipient-live-confirmation-20261007.log` and
`.local/verify/recipient-live-confirmation-inputs-20261007.sha256`. Screenshots show the
[unconfirmed acceptance](.local/screenshots/invitation-recovery-accept-20261007.png) and
[unconfirmed decline](.local/screenshots/invitation-recovery-decline-20261007.png).

This used newly created `.test` accounts and records in the existing isolated synthetic runtime, its private Mailpit
override, and disabled model/web providers. The runtime serves captured backend code; the invitation service, API and
schemas were checked against current source. No database reset, key replacement, migration or production action occurred.
The documented launcher was used to resume a missing mail worker; an API bind conflict was refused rather than taking
over another process.

Earlier live setup/render timeouts, a terminated browser, stopped preview/API processes and HTTP 503 attempts remain in
the `recipient-live-*` logs. They are not relabelled as passes. Registration now asserts HTTP 202 explicitly, and injected
decision responses report upstream failures in the test body instead of leaving an unhandled route assertion.
The original happy-path invitation journey passed separately; no claim is made that every live suite or deployment is qualified.

### Task Filter Response Integrity: 2026-10-07

The task-list client now rejects a response containing a status outside the selected status filter, a due date outside
the selected inclusive range, or an undated task when a date bound was requested. It rejects the whole inconsistent
page with the existing reload error instead of silently dropping rows or rewriting pagination. Matching date boundaries,
unfiltered undated tasks and valid empty results remain supported. This is response-integrity checking, not a replacement
for server authorization. Command replay still accepts the server's newer current task state; create/edit/status response
fields are not forced to equal an earlier request body.

Five negative client controls failed before the guard. Four network-blocked browser cases verify status/date recovery at
1280 px and 320 px with doubled text: inconsistent rows and cached pagination stay hidden, Retry is focusable and reachable,
the selected filter and retry query remain unchanged, and no mutation is sent. Desktop/mobile recovery captures are retained
under `.local/screenshots/task-filter-recovery-*`.

The final [184-input source capture](.local/verify/task-filter-final-20261007-DHctD6/summary.json) passes **79/79** affected
task client/browser checks with no failures, cancellations or skips, unchanged captured inputs, and matching shared inputs
at the end of that run. [Logs](.local/verify/task-filter-final-20261007-DHctD6/tests.log),
[JUnit](.local/verify/task-filter-final-20261007-DHctD6/tests.xml) and its input manifest are retained; installed dependencies
were reused. Current web typechecking and editor diagnostics pass. This integrated capture includes concurrent task-response,
search-read and draft-preservation work, which is not attributed to the filter guard.

Earlier evidence is retained separately. The mixed-source run at `.local/verify/task-filter-contract-20261007-2JtwD8/`
passed **298 client checks**, then exposed a concurrently introduced draft-preservation test while its source changed.
The next fixed capture at `.local/verify/task-filter-fixed-20261007-YPSXEk/` passed **72/73**: the remaining test counted
a legitimate background `GET /api/live` as an extra Retry request. That test now explicitly exercises this interleaving,
ignores only that read in its request comparison, and still requires exactly one Space-list read and zero writes.
Neither failed run is relabelled as a passing whole-project check.

A new [real task-filter journey](.local/verify/task-filter-live-20261007-cf2hUY/summary.json) passes **1/1** against the
existing provider-disabled synthetic API/private Mailpit. Four synthetic tasks distinguish today/open, today/in-progress,
tomorrow and undated records. The browser verifies actual filtered rows and restoration of all four when filters clear,
with local-only browser requests and desktop/mobile captures. Its three watched files stayed unchanged. Initial versions
of this new test incorrectly counted Next.js's empty route-announcer alert; the zero-error assertion now correctly targets
the task page's main region. No application assertion, API permission or deadline was weakened.

```sh
node --test tests/tasks-priority-filters-client.test.mjs
COMMUNITY_CHROMIUM_PATH=<installed-compatible-chromium> node --test --test-concurrency=1 tests/unit/planning-ui.test.mjs
COMMUNITY_CHROMIUM_PATH=<installed-compatible-chromium> COMMUNITY_WEB_URL=http://127.0.0.1:3000 COMMUNITY_MAIL_URL=http://127.0.0.1:32787 node --test --test-concurrency=1 --test-name-pattern='^task filters: real status' tests/e2e/identity.test.mjs
npm --prefix web run typecheck
```

The live test creates only synthetic records in the already-owned runtime. No API or worker restart, database migration,
shared-data reset, provider call, saved-environment change or deployment was performed. These overlapping scoped results
are not added together and do not qualify the complete latest application or native clients.

### Search-opened Task Read Recovery: 2026-10-07

The [task view](web/src/features/planning/task-screen.tsx) now stops rendering the cached task supplied by a failed
single-task read. Previously, a task opened from search could remain visible with its actions beside a notice saying
it was unavailable, even when that task was absent from the current list. A localized **Retry** now rereads the original
task under the same account. The rejected cached row remains hidden while the read is pending, duplicate retries are
disabled, and only a successful current response restores the highlighted task. Other listed tasks remain available.
The existing result-identity checks and server permissions are unchanged; this UI guard does not purge query-cache data
or replace backend authorization.

Six new regressions in the [existing browser fixture](tests/unit/planning-ui.test.mjs) failed before repair, covering
403, 404 and 503 at 1280 px and 320 px. They now pass with a held retry response, a renamed task on recovery, unchanged
account headers and no write caused by Retry. The mobile cases double actual rendered text, including fixed-size
controls, and check horizontal fit, focus, target size and pointer reachability. The
[desktop](.local/screenshots/task-opened-recovery-1280.png) and [mobile](.local/screenshots/task-opened-recovery-320.png)
viewport captures were inspected.

The initial affected planning browser, task-filter client and web-client selection passed **113/113**, with zero failures,
errors or skips in its [JUnit report](.local/verify/task-opened-recovery-final-20261007.xml). All 184
[watched inputs](.local/verify/task-opened-recovery-inputs-20261007.sha256) matched at that checkpoint. Subsequent task-scope
and filter-validation work changed the client, view and contract tests; those changes were preserved.

Final qualification uses a separate fixed 184-input source capture with the existing installed dependencies. It passes
**122/122** in the [parsed report](.local/task-opened-capture-20261007-qO6FH6/final.xml), with zero failures, errors or skips,
and unchanged [captured hashes](.local/task-opened-capture-20261007-qO6FH6/inputs.sha256). The
[full log](.local/task-opened-capture-20261007-qO6FH6/final.log) is retained. Current web typechecking, editor diagnostics
and whitespace checks pass. All captured inputs match the shared tree except a later indentation-only browser-fixture
edit; [compiler comparison](.local/verify/task-opened-recovery-fixture-equivalence-20261007.log) confirms both fixture versions
emit identical JavaScript. These overlapping runs are not added together. Concurrent task-response integrity and scope
work is included in the qualification, not attributed to this recovery fix; this remains an affected-scope check, not a
whole-product release qualification.

```sh
export COMMUNITY_CHROMIUM_PATH=/home/codespace/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
node --test --test-name-pattern='^offline opened task recovery' tests/unit/planning-ui.test.mjs
node --test --test-concurrency=1 tests/unit/planning-ui.test.mjs tests/tasks-priority-filters-client.test.mjs tests/web-client.test.mjs
npm --prefix web run typecheck
```

Logs and JUnit files under `.local/verify/task-opened-recovery-*-20261007.*` retain the six pre-fix failures and passing
checks. An intermediate held-response probe had four test timing failures: it observed the request before React rendered
the disabled button. Waiting for that rendered state fixed the synchronization without removing the disabled/hidden-state
assertions. The initial combined run emitted a non-failing Node `TestsStream` listener-count warning with three reporters; no
listener limit or assertion was changed to suppress it.

The existing preview at `http://127.0.0.1:3000/app/tasks` returned HTTP 200 and was not restarted. No API, worker,
database, provider, key, saved environment or deployment was changed. These network-blocked synthetic checks are not a
new signed-in API journey, live-provider evaluation, native qualification or frozen whole-product release gate.

### Task Draft Recovery During Space-list Outages: 2026-10-07

A temporary background failure reading the Spaces list no longer unmounts an already-loaded task workspace. The
error and read-only **Retry** remain visible, while unsaved title, notes, due date and assignee fields, the unload warning,
and unconfirmed create/edit/status commands stay in memory. Retrying a task mutation still uses its original request
key, payload, account and reviewed version; a newer server version requires explicit conflict review.

The existing unknown-error classification is reused. Explicit access denials, a successful response removing the
selected Space, and initial loads with no confirmed Space data do not expose the cached workspace. Domain services
remain authoritative for every read and mutation. This is not durable draft storage, automatic retry, offline editing
permission or a relaxation of server authorization.

The attached test snapshot was read-only and matched the original current fixture. Its 62-case baseline passed.
One new regression then reproduced draft loss before the fix. Eleven added cases cover field preservation, read-only
recovery, create/edit/status retry identity, conflict versions, 403/404 access loss and removal of the Space. They pass,
including 320px with genuinely doubled text and a usable Retry control.

```sh
node --test --test-concurrency=1 tests/tasks-priority-filters-client.test.mjs tests/unit/planning-ui.test.mjs tests/unit/i18n-tasks-ui.test.mjs
npm --prefix web run typecheck
```

With installed Chromium selected through `COMMUNITY_CHROMIUM_PATH`, the combined run passed **93/93** while concurrent
tests were being added. A subsequent expanded planning-browser run passed **51/51** with unchanged inputs during that
run; later test-only additions are not described as part of that snapshot. A final focused rerun passed all **11/11**
owned cases with stable product source. Typechecking, test syntax and changed-file whitespace checks passed after
one interrupted typecheck was rerun. These overlapping totals are not summed.

Logs and manifests are retained under `.local/verify/planning-space-recovery-*`, `planning-current-*` and
`planning-draft-final-*`. The [320px/doubled-text capture](.local/screenshots/task-draft-space-outage-320-20261007.png)
shows the retained draft with its refresh error. This was network-blocked synthetic browser verification; no live
provider, account data, API process, database, key, saved environment or deployment was changed.

### Task Refresh Includes Search Results: 2026-10-07

**Refresh tasks** now refreshes the task fetched separately from a search result as well as the current list. Previously,
the list could show current data while the highlighted search result retained its old title and actions. The control
stays busy and disabled until both reads finish; without a search result it reads only the list. Failed single-task
reads use the existing unavailable notice and read-only Retry, while other listed tasks stay usable. Server permissions,
drafts and exact write retries are unchanged.

Two desktop/mobile checks reproduced the missing read before repair. All six new cases pass, including a held response,
403/404/503 outcomes, fresh content after Retry, unchanged account headers and zero writes. At 320 px the checks double
actual rendered text and verify the refresh control's size, focus and pointer reachability. The
[desktop](.local/screenshots/task-refresh-opened-1280.png) and [mobile](.local/screenshots/task-refresh-opened-320.png)
viewport captures were inspected; this is a focused control check, not complete accessibility qualification.

The fixed [source capture](.local/task-refresh-capture-20261007-r5me0a/inputs.sha256) passes **139/139** planning browser,
task-filter client and web-client checks. Its [JUnit report](.local/task-refresh-capture-20261007-r5me0a/final.xml) has
zero failures, errors or skips, and all 184 captured hashes remained unchanged. The
[full log](.local/task-refresh-capture-20261007-r5me0a/final.log) is retained. Current web types and editor diagnostics pass.
The capture includes concurrent Space-read draft recovery and task-response validation, not attributed to this fix.
At comparison, all application inputs matched the workspace. The sole later test-file difference changes two existing
response-integrity screenshots from full-page to viewport captures at 320 px; that change was preserved and is outside
the fixed run. The new refresh cases are unchanged, and overlapping prior runs are not added to this total.

```sh
export COMMUNITY_CHROMIUM_PATH=/home/codespace/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
node --test --test-name-pattern='^offline task refresh' tests/unit/planning-ui.test.mjs
node --test --test-concurrency=1 tests/unit/planning-ui.test.mjs tests/tasks-priority-filters-client.test.mjs tests/web-client.test.mjs
npm --prefix web run typecheck
```

Pre-fix, repaired and six-case logs/JUnit reports are retained under `.local/verify/task-refresh-opened-*-20261007.*`.
The existing `http://127.0.0.1:3000/app/tasks` preview returned HTTP 200 without a restart. No API, worker, database,
provider, key, saved environment or deployment changed. These synthetic, network-blocked checks qualify this frontend
workflow, not a new live API journey, provider evaluation, native release or whole-product candidate.

## Structure Checks

```powershell
npm run test:structure
npm run structure
npm run check:structure
```

Structure generation is additive. It will not overwrite implementation files or modify the original chapters.