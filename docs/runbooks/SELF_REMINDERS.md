# One-Time In-App Task Reminders

This local synthetic-data slice adds **Remind me** and recipient-approved requests to an accessible ordinary family task. Only the recipient activates their personal schedule. A task manager can propose an exact time to the current assignee, but cannot opt them in or create scheduled work before acceptance. This is not live email, push, a medical schedule, or a full M1/production qualification.

## Use The Feature

Web: open a task's bell action from `/app/tasks`, choose a local date/time and IANA timezone, review the task, recipient, UTC instant and dispatch deadline, then save. `/app/reminders` lists the current account's reminders. `/app/notifications` contains due inbox items and notification preferences.

Android: open **Family tasks** from the account header, select a task and choose **Remind me**. The account-header notification icon opens the inbox. Material date/time pickers preserve local calendar fields; the backend resolves the instant. If a clock time occurs twice, choose one displayed UTC offset explicitly. A nonexistent DST clock time is rejected.

The inbox has separate **Mark read** and **Acknowledge** actions. Neither completes a task. `available` means the durable inbox row exists, not that an app was open, a device was alerted, or a human saw it. No push alert or external message is sent. The browser and Android refresh lists explicitly/on normal lifecycle reads; no realtime delivery guarantee is claimed.

## Recipient-Approved Requests

On the web, a task manager can choose **Request for [assignee]** in the reminder editor. On Android the same recipient choice appears when the open task has another eligible assignee. Review the proposed local time, IANA zone, UTC choice, recipient, in-app channel, request expiry and dispatch deadline, then send the request. This persists a proposal only: no reminder, inbox notification, push or external message is produced.

The recipient opens **Reminder requests / Received** on the web or the Android **Requests** tab. **Review request** is a read, not acceptance. **Accept reminder** submits the recipient-bound review and atomically creates that account's personal schedule. **Decline** creates no schedule. The requester can inspect **Sent** and withdraw a pending request. Acceptance cannot be withdrawn by the requester; the recipient cancels their resulting reminder through **My reminders**. The requester sees the proposal outcome, not the recipient's private reminder ID, later cancellation, inbox reading or acknowledgment.

| Concern | Local request rule |
| --- | --- |
| Who can propose | Current task creator in the original admission or current Space owner, still holding the task grant; open/in-progress task only |
| Who can receive | The current active, verified assignee in the same original task audience; not the requester, an arbitrary member, unregistered contact or external destination |
| Consent | A five-minute protected recipient review binds request identity/version, source revision, recipient/admission and current preference generation. Only an explicit acceptance activates work |
| Lifetime | Proposal expires within 72 hours and no later than the earliest displayed candidate instant; no late acceptance or implicit catch-up of an unaccepted proposal |
| Limits | One pending request per task/recipient; 500 retained sent requests per requester and 500 received per recipient. These are development limits, not a production abuse policy |
| Changes | Source revision/assignment/manager eligibility changes make a pending request outdated. Lost account, Space, admission or task grants hide protected request views and block acceptance |
| Retries | Creation reuses the same actor/key/protected preview; acceptance reuses the same request/review. Already accepted retries never recreate or reactivate a cancelled personal reminder |
| Atomicity | Acceptance state, personal schedule, recipient-attributed scheduling audit, request audit and outbox commit together. Failure of required request audit rolls everything back |
| Races | Acceptance versus decline/withdrawal has one durable winner; neither race silently replaces an existing personal schedule |
| After acceptance | The recipient owns an ordinary personal reminder. Requester departure does not revoke this independently accepted schedule; recipient/source access, task revision, cancellation and preference gates still apply |

Seven authenticated operations live under `/v1/reminder-requests`: preview, create, received/sent list, recipient review, accept, decline and sender cancel. `GET` never accepts. Creation/acceptance bodies carry protected preview tokens, not client-selected actors, channels, approval flags or schedule IDs. Statuses are `pending`, `accepted`, `declined`, `cancelled`, `expired` and `outdated`; expiry/outdated states are evaluated on reads even without cleanup. Declines and withdrawals are terminal, not reusable consent.

This narrowly scopes recipient consent to one ordinary task/time and in-app history. It does not grant ongoing organizer scheduling, arbitrary-recipient reminders, care/guardian authority, external messaging or production policy approval.

## Start Locally

Use the repository root, Docker Desktop and the existing dependencies. Preserve the database volume and identity key.

```powershell
docker compose -f infra/compose.yaml build api reminder-worker
docker compose -f infra/compose.yaml run --rm api python3 -m app.cli migrate
docker compose -f infra/compose.yaml up -d --build api identity-mail-worker reminder-worker
```

Migration `0005` adds preferences, reminders, inbox rows and typed reminder audit events. The concurrent `0006` adds persisted retry counters/deadlines and terminal failure state. Additive `0007` introduces immutable proposals and request audit events. The local database was verified at `0007 (head)`; existing account/Space/invitation/task/reminder data and the identity key were retained.

For a separate web preview without overwriting another running build:

```powershell
$env:COMMUNITY_BUILD_LABEL='reminder-requests-20260920'
$env:COMMUNITY_WEB_ORIGINS='http://127.0.0.1:3003,http://localhost:3003'
npm --prefix web run build
npm --prefix web run start -- --hostname 127.0.0.1 --port 3003
```

Use a free port and match the origins. `COMMUNITY_BUILD_LABEL` accepts only 1-40 lowercase letters, digits or hyphens; its output is `web/.local/build-<label>`. Existing `COMMUNITY_ISOLATED_BUILD=1` behavior remains available. Starting a local process does not grant this assistant permission to visit a blocked host.

## Durable Contract

| Concern | Implemented local rule |
| --- | --- |
| Recipient and channel | Personal schedule is activated by its signed-in recipient; `in_app` only. Self-reminder endpoints still reject extra recipient/channel fields; proposals use their separate recipient-confirmed path |
| Source | Current active account, private Space, active admission and task grant; task must be open or in progress |
| Preview | Protected five-minute token binds actor, admission, task/revision, preference generation, local time, zone, selected UTC instant and dispatch deadline |
| Time | Minute-resolution local input, IANA zone, explicit DST overlap choice, gap rejection. Fixed instant survives profile timezone changes |
| Horizon | Future time within 366 days; one pending reminder per account/task; 500 retained reminders per account |
| Catch-up | Dispatch no later than 24 hours after the selected instant; deadline is shown before save. Later work expires rather than creating a backlog burst |
| Change handling | Changed task revision, closed task, lost access/admission, inactive account or withdrawn preference suppresses dispatch. An old reminder is never silently rebased onto new task content |
| Preferences | Versioned per-account in-app setting. Disabling withdraws pending authority by generation; re-enabling does not restore the old backlog |
| Replay | Same actor/key/token returns the current permitted reminder. Receipt lookup still checks current source access; changed payload/key reuse conflicts |
| Cancellation | Shares account/Space/task/reminder serialization with dispatch. Before commitment it prevents an inbox row; after availability it returns a conflict, not a recall claim |
| Dispatch | Separate deterministic worker. Pending reminder rows are durable work; short transactions recheck source and recipient, insert one uniquely bound inbox row, change state and record scheduler attribution together |
| Audit | Human request/read/acknowledgment events retain the actual actor; worker events have `actor_kind=scheduler` and no fabricated human actor. Human mutations also use the existing outbox |
| Inbox | Current task visibility applies to lists, unread counts, reading and acknowledgment. Historical access cannot be recovered through a notification |
| Read versus acknowledgment | Independent timestamps. Acknowledgment is this recipient's report for this reminder only and does not mutate task status |

These bounds and assurance choices are explicit development decisions, not approved production SLAs, consent law, health policy or global canonical state-machine approval. Reminder preferences do not represent email/push/voice consent. Quiet-hour alert suppression is not applied because this slice materializes only private in-app history and sends no background alert.

## Worker And Failure Handling

The worker is [app/reminder_worker.py](../../backend/app/reminder_worker.py), separate from the local identity-mail worker. It scans up to twenty eligible reminders per pass with a one-second loop interval. Each transaction uses a two-second lock timeout and a five-second statement timeout. Due/expiry checks use current clock values after waits, not a stale transaction-start timestamp. No LLM, Android alarm or browser timer owns the schedule.

Multiple workers may scan the same rows; account/Space/task/reminder locks and the unique inbox relationship arbitrate the effect. A crash before commit rolls back; a new process discovers the persisted work. Since the sole effect is in the same PostgreSQL transaction, this does not claim exactly-once delivery to an external provider.

Migration `0006` preserves failed-attempt count, next-attempt time and last-failure time. SQL failures schedule bounded backoff, up to five recorded attempts before terminal `failed`; successful work on other selected rows continues. If even failure bookkeeping cannot be committed, work stays durable and unconfirmed. These are scheduler/database retries, not a reusable external-provider retry protocol.

The local per-item delays are 5, 10, 20 and 40 seconds before the fifth failure stops delivery. Database-wide outages back off the process loop up to 60 seconds. A successful retry clears the pending reason/time; cancellation does too, while preserving failure history. Failure bookkeeping checks current terminal state, so it cannot reopen a cancelled reminder or repeat a delivery that already committed.

Current reminder states are `scheduled`, `available`, `cancelled`, `suppressed`, `expired` and `failed`. Clients display the canonical state, including a reminder that became suppressed/failed while a cancellation was pending; they do not always report "cancelled". There is no user-facing replay of a terminal failed dispatch in this slice.

To inspect one bounded worker pass in an appropriate local/test environment:

```powershell
docker compose -f infra/compose.yaml run --rm reminder-worker python3 -m app.reminder_worker --once
```

This command can materialize eligible local inbox entries. Do not use it against real-user data without its operational authorization. The executed automated worker test used a unique isolated test schema, not development rows.

To pause local dispatch, set `COMMUNITY_REMINDER_DISPATCH_ENABLED=false` and recreate only the reminder worker. This is process configuration, not an instantaneous distributed kill switch; an already committed entry is retained. Restarting with dispatch enabled rechecks current authority and the dispatch deadline before catch-up. Preserve the volume/key and never use `down -v` for ordinary migration/recovery.

## Client Reliability

Both clients require an exact review before creation. An uncertain save keeps the original preview token and request key, locks timing choices, and offers an explicit retry. A newly expired preview blocks a new command, while an already committed permitted receipt can still be recovered through the old key. Current permission loss still denies it.

The web retry remains available to reconcile the original intent when a background refresh finds a closed task or disabled preference; it does not authorize a new schedule. Client preview checks reject impossible dates, unsupported named zones, duplicate/reversed choices and inconsistent local-time/offset/UTC combinations. Cancellation notices use the actual returned state instead of labelling an already suppressed or failed reminder cancelled.

Web uses the same authenticated/Origin-checked/expected-account BFF and no-store responses. Runtime schemas validate dates, named zones, offsets, preview recipient and pagination/counts. Android uses the existing Keystore-backed account repository, typed Retrofit DTOs and account-generation isolation. No provider secret or token is stored in browser JavaScript storage.

Drafts and retry intents are memory-only. They are not crash-safe queues and are lost on process death or deliberate workspace exit; pending navigation warnings do not create persistence. Preference changes require their reviewed ETag. Reading or acknowledging a stable notification ID retries that same operation rather than inventing a new business action.

## Earlier Self-Reminder Evidence

- Final combined backend: **167 PostgreSQL tests passed**, with isolated per-run schemas. Includes DST, exact intent, current access, cancellation/dispatch ordering, expiry after waits, preference generations, failure isolation/backoff, inbox uniqueness, audit rollback, cursor/privacy and migration preservation.
- A separate-process worker test runs `--once` twice against persisted due work: the first creates one inbox item; the second creates none. No HTTP request or system-clock change is used.
- **22 in-process web client/BFF tests** and **22 offline browser-component tests** passed across account/task/reminder work. Components run on blank isolated pages with local styles/fonts, simulated APIs/Next Link, and all outbound requests blocked. They are not live route/cookie/database evidence.
- **43 native JVM tests** passed: prior account/task 27, reminder repository 9 and reminder state 7. Real Retrofit encoding is tested against interceptor-provided responses without a network socket.
- **Six reminder Compose instrumentation tests** passed on API 36: exact date/time fields and DST choice, locked retry, separate read/acknowledgment, confirmed preferences and 320 dp / 200% text. Networking was disabled; only the offline class ran.
- Web and native fixture screenshots were captured and viewed. Native transfers matched device/host SHA-256; the owned read-only emulator was shut down. No personal device was used.
- Web TypeScript/production build, Android Kotlin/debug APK/test APK/lint and the generated nine-operation reminder/inbox contract passed their checks. Local service metadata confirms the API and reminder worker running; no blocked application endpoint was probed.

Concurrent additions supplied migration `0006`, retry hardening and extra web/native checks. They are preserved and included in combined results, not presented as separately authored work or independent production approval.

## Request Checkpoint Evidence

On 2026-09-20, the combined backend suite passed **194 PostgreSQL tests**. The request slice covers participant privacy, current admissions/grants, assignee/manager authority, exact reviews, expired tokens, preference disable/re-enable, concurrent creation/acceptance and competing terminal actions, existing-schedule protection, audit rollback, scoped pagination and migration preservation. The first request regression failed at the missing route, then passed after implementation.

The combined web client/BFF suite passed **27 tests**, and the offline browser-component suite passed **27 tests** with all outbound traffic blocked. TypeScript and an isolated production build passed. The actual live two-account browser/BFF/API request journey also passed: synthetic registration/admission, proposal and acceptance with lost-response retries, no schedule before consent, exactly one recipient schedule, reload/cancel, decline and withdrawal. Captured live and offline desktop/mobile review images were inspected. That live test uses only approved loopback services; the concurrent account/self-reminder live work has separate evidence.

The combined Android JVM suite passed **81 tests**, including 16 reminder transport and 14 reminder state tests. **Twelve offline reminder Compose tests passed**, six covering request controls. The request dialog's rendered `TextLayoutResult` measured font scale 2.0 on an actual 320 dp emulator window; both actions remained visible while details scrolled. The shared guarded font-scale rule restored the original system setting, independently checked by the host. Two synthetic request captures matched device/host SHA-256 and were viewed. The owned read-only emulator was shut down normally.

The **Community Platform: verify offline reminder screens** VS Code task calls [the guarded verification script](../../scripts/verify-android-reminders.ps1). It requires an owned, booted, read-only/no-snapshot-save `community_platform_m0_768f91e4` session on `emulator-5580`, verifies the port-owning runtime, disables guest networking and checks twelve passing test statuses plus `OK (12 tests)` and font restoration. It does not launch a device or establish ownership. The raw result is retained locally in `.local/native-reminder-5580-suite.txt`. Never run it on someone else's session or a personal device.

For the authorized live web check, start the dedicated **Community Platform: preview reminder requests** task on port 3003, then **Community Platform: test live reminder requests**. Its JUnit report is `.local/reminder-request-live-web.xml`. Do not rebuild that active preview directory, run two previews on its port, or infer external-network approval.

The **live Android recipient request journey passed**, one test with no failures/skips in 45.710 seconds. Synthetic organizer/recipient accounts, admission, task and proposal are prepared through the local APIs. The real app then signs in the recipient, reviews without creating work, accepts one schedule, retains the result after activity recreation, and cancels the personal reminder. The sender sees neither a personal schedule nor its private ID. This verifies that recipient flow, not the entire native onboarding or due-delivery journey.

After explicit local-only network approval, the **Community Platform: verify live native reminder requests** task calls the same script with `-LocalRequestJourney`. It requires a fresh disposable overlay with no installed debug app, verifies the exact AVD/read-only runtime/port/boot, enables guest Wi-Fi only for the selected live mode, leaves mobile data disabled, and runs only `ReminderRequestJourneyTest` with `community_local_integration=true`. The default task still disables networking and runs only the twelve offline screen tests. Neither mode launches a device or establishes ownership; never use another session's emulator.

The live result is retained in `.local/native-reminder-request-live-5580.txt`, with an exact one-test success count and unchanged font setting. Its generated screenshot `.local/screenshots/reminder-request-native-live.png` matched device/host SHA-256 and was inspected; the owned emulator was shut down normally. Final lint and R8 gates also passed against current inputs. See [BUILD_STATUS.md](../BUILD_STATUS.md#recipient-approved-reminder-requests) for the combined evidence and remaining scope.

## Still Not Qualified

Earlier loopback denial was superseded by explicit local-only approval on 2026-09-20. The request web and native recipient journeys above now have real integration evidence; finite checks still do not qualify every browser/native workflow or full M1. Native Space/invitation evidence and concurrent live checks are recorded separately in [BUILD_STATUS.md](../BUILD_STATUS.md). Arbitrary or standing third-party consent, push/email/SMS/voice, recurrence, snooze/escalation, clinical data, retention/restore drills, measured latency/load, release dependency review and production deployment remain outside this slice. The full product inventory remains retained.