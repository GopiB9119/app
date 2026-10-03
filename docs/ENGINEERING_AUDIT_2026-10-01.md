# Engineering Audit, 2026-10-01

A dated, read-only audit of the whole repository, asked for by the product owner on 2026-10-01: what is done, what is not, what is missing and why, and where the project is making mistakes. It is level 9 evidence ([Constitution, Article 4](PRODUCT_CONSTITUTION.md#article-4-authority-hierarchy)). It describes what exists and recommends; it decides nothing. Recommendations are **PROPOSED** until the owner confirms them. Like the [engineering baseline](ENGINEERING_BASELINE_2026-09-30.md), it is a snapshot that is not kept up to date: its actions are T39–T53 and X2 in [TASKS.md](TASKS.md), and its conflicts are C10 and C11 in [section 40 of the Product Understanding](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository).

## Method and Source State

- **Reviews.** Six independent read-only reviews ran in parallel, one subject each:
  - governance and traceability (Claude Opus 5.5)
  - backend (GPT-6 Astra)
  - tests and evidence (GPT-6.1 Sol)
  - web (GPT-6.1 Sol)
  - Android (Claude Opus 5.5)
  - missing capabilities and production readiness (GPT-6 Astra)

  The coordinating session checked the repository and version control itself. It also re-read the code behind every Critical and High finding and most Medium ones before accepting them; those are marked ✓ below. A finding nobody could confirm is marked *Suspected*.
- **What ran.** Only the 8 web client test files and the feature catalog test: 88 passed, 0 failed, between 11:45 and 11:48 (`node --test tests/<name>-client.test.mjs` and `node --test scripts/feature-catalog.test.mjs`). Other sessions were using the machine and the shared servers, so these did not run: the backend suite, Gradle, emulators and the live journeys. The defects below were found by reading code, not reproduced at runtime, so each task starts with a test that fails.
- **Source state.** Branch `main` at `fff2eaf` (2026-09-28), plus the uncommitted working tree, between 11:36 and 12:40 on 2026-10-01. Other sessions worked at the same time (T22 group Spaces, T33 agent backend, T36 design tokens), and several documents changed during the audit. Statements about work in progress describe a moving snapshot.

## 1. Summary

- **The product is real, and mostly careful.** There are 144 API operations on 119 paths, 53 tables from 21 migrations, and web and Android clients for most operations. 408 backend tests pass against real PostgreSQL. Both sides work end to end:
  - the private side: Spaces, chat, tasks, reminders, calendar, events and care
  - the core public side: pages, posts, comments, likes, follows, search, reports and blocks
- **The biggest risks are in how the work is run, not in the code.**
  - About 51,000 lines of work have never been committed, including the Constitution and the decision register.
  - AI sessions made five product decisions in one day, and each was built at once.
  - A whole feature, alerts, was built with no task, decision or changelog entry.
  - The documents repeat the same facts in up to 19 places, and now contradict each other and the code.
  - There is no CI.
- **Two High defects in built code:** web editors can silently overwrite newer changes despite `If-Match` (T39), and the Android release build very likely fails every API call (T40). Eleven Medium defects follow (T41–T50 and T52).
- **What is missing mostly waits for the owner:**
  - documents and retrieval (R5, R10, R11)
  - agent identities and tools (R7, R8), started today under a provisional decision
  - roles (R2) and couple Spaces (R6)
  - moderation, notification channels and production operations

  [Section 7](#7-decisions-only-the-owner-can-make) ranks the decisions that would unblock them.

## 2. Requirement Status

This corrects the "Code today" column in [section 37 of the Product Understanding](PRODUCT_UNDERSTANDING.md#37-confirmed-requirements) where it is out of date.

| ID | Status | Evidence and what is missing |
| --- | --- | --- |
| R1 | Done | Up to 50 Spaces per account ([spaces/service.py](../backend/app/modules/spaces/service.py#L25)). |
| R2 | Partial | Owner and member roles only ([spaces/models.py](../backend/app/modules/spaces/models.py#L56)). No per-Space permission settings (T13, P5). |
| R3 | Done; the public model is provisional | Public pages and private Spaces exist. Public groups rest on DEC-011 (provisional), and T22 is in progress. |
| R4 | Partial | Posts, comments, likes, follows, feeds and literal search are built. Reactions are "like" only (U-07). No ranking, trends or recommendations (Chapter 15). |
| R5 | Partial | Conversations, tasks and events are built. Documents are not started; the files module is only a README. |
| R6 | Partial | Family and solo are done, group is in progress (T22), and couple is not started (T12, P2). |
| R7 | Started | No agent identity existed before today. T33 (in progress) connects the existing rule-based pieces under DEC-012 (provisional). |
| R8 | Started | As R7. No AI model is used (Q17 is open). |
| R9 | Done | No workflow depends on AI. The code uses four different daylight-saving rules (C6, open). |
| R10 | Not started | No storage, parsing or index. |
| R11 | Boundaries done; retrieval not started | Membership and admission boundaries are enforced and tested for chat and events ([test_messaging.py](../backend/tests/test_messaging.py#L196), [test_events.py](../backend/tests/test_events.py#L45)). |
| R12 | Partial | Sessions, encryption, request telemetry and key rotation are strong. Missing: alerting (Q19), audit coverage (G8), account deletion, a finished export, restore checks for all encrypted data (T44) and production key custody (C11-D08). |
| R13 | Done, with gaps | Web and Android cover most operations; Android calls 118 of the 144. Exports have no client, and the Android release build has never been run (T40). |

## 3. Where the Project Is Making Mistakes

### M1. The work is not under version control

**Evidence.** `git log` shows two commits; the last is from 2026-09-28 14:44. Since then:

- 112 tracked files have changed (+28,144 and −2,740 lines).
- 149 new files (about 23,400 lines) have never been committed. They include the Constitution, DECISIONS, TASKS, CHANGELOG and AGENTS.md, and 31 of the 73 Android Kotlin files (care, chat, events, community and groups).

**Why it matters.** Several sessions edit this one working tree at once. One `git clean`, one `git stash -u` or one bad overwrite would lose work with no way back. No change can be reviewed, bisected or reverted.

**Exposure.** The GitHub repository `GopiB9119/app` is **public**, so every push publishes everything. Two tracked scratch files, `.temp_docs_list.txt` and `md_list.txt`, already publish local paths.

**PROPOSED.** Commit now, then commit at every checkpoint, and decide the repository's visibility before the next push.

### M2. AI sessions make product decisions and build them at once

**What happened.** AI sessions made five decisions:

| Decision | Subject |
| --- | --- |
| DEC-010 | Repeating reminders |
| DEC-011 | Public groups |
| DEC-012 | The agent's first release |
| DEC-013 | The design system |
| DEC-014 | Home and navigation |

Each was made "after the owner was asked … and could not answer", under a general delegation given in conversation. Each sits under "Accepted Decisions" while marked unconfirmed, and T19–T22 and T33–T38 build on them.

**What the rules say.**

- [DECISIONS.md](DECISIONS.md#how-decisions-are-recorded): an AI assistant "can prepare one but never approve it".
- Constitution, Article 4 rule 4: only accepted decisions go into tasks.
- Constitution, Article 5 step 5: an AI may apply only a resolution that a confirmed decision settles.

**Consequences.**

- Conflict C1 was marked resolved on the strength of DEC-011.
- The [End-to-End Plan](TASKS.md#end-to-end-plan) intends to decide Q8, P2 and P5 the same way.
- Every reversal now costs built work.

To their credit, the records say plainly who decided. This is recorded as conflict C11.

**PROPOSED.** The owner confirms or reverses each decision, and records whether sessions may decide when the work is delegated, and how such decisions are reviewed.

### M3. A whole feature was built with no record

**What was built.** Between 08:22 and about 10:08 on 2026-10-01, a session that left no record wrote:

- migration `0021` ("Quiet hours, backup people for reminders, event and dose alerts, and series replacement and moves")
- `notifications/alerts.py` and `backend/tests/test_alerts.py`
- the web alerts screens
- calendar events, a calendar-file download, and Android support for calendar events
- the live `alerts` journey

**The records say otherwise.** No task, decision, checkpoint or changelog entry covers this work. [TASKS.md](TASKS.md#scheduling) still lists T23–T26 and T28 as Blocked, and DEC-010 and the changelog still call this work "not built".

**Why it matters.**

- The backup-person alert notifies a second person, and no consent rules are agreed yet (C13-D06, C13-D09).
- Dose alerts extend care while Q12 is open.

This is recorded as conflict C10 and as X2 in TASKS. Its defects (section 4) are listed for the owner's decision, not as tasks.

### M4. The documentation contradicts itself

**Scale.** 128 Markdown files (3.2 MB) repeat the same facts: DEC-010 appears in 19 files, Q12 in 16 and T22 in 10. DEC-010 alone needed edits to about 20 files.

**Drift.** The copies no longer agree with each other or with the code:

- The operation count is given as 110, 119 or 144. It is 144 operations on 119 paths.
- [DOMAIN.md](DOMAIN.md) says there are 47 tables at `0019`, then lists 48. The migrations create 53, and the five alert tables are missing from this level-2 contract.
- [ARCHITECTURE.md](ARCHITECTURE.md) describes the worker metrics as both built and not built.
- Five documents give group Spaces different statuses.
- FEATURES_AND_SCREENS and PRODUCT_FEATURES call alerts "not built".
- EVALUATIONS:
  - It counts 7 web client test files; there are 8, with 83 tests.
  - It cites migration `0020` for T22. T22 is `0022`, and there is no `0020`.
- The Android planning README says checklists and the calendar are not implemented.
- Care has no README on any platform.
- The two Chapter 19 drafts, and the two Chapter 20 drafts, use the same decision IDs for different things.
- The TASKS "End-to-End Plan" is a seventh build order, beside the six listed under D6.

The links themselves are sound: 2,043 relative links, none broken.

**PROPOSED.** Generate the counts that change often from one source and link to it (T53).

### M5. There is no automated check

No CI configuration exists. Results are produced by hand and copied into four documents. The runs happen on a machine shared with other sessions' emulators and builds:

- One full backend run took 3,335 s.
- That run's only failure was a test's 20-second time limit, hit because of load.

Other evidence gaps:

- The default `npm` test scripts skip the identity, care and alerts client suites (15 tests) and the alerts journey (T51).
- One saved test report, `.local/live-sweep-20261001.xml`, is not valid XML because it contains terminal colour codes.

**Since then:** T51 completed the test commands and documented how to save a valid report, and [T64](TASKS.md#defects-that-break-approved-requirements) added `npm run verify`, one local command that runs every check and writes one summary, including the files that changed during the run. [T96](TASKS.md#defects-that-break-approved-requirements) added the Android device tests to it. A CI service is still blocked, as the Operations row in section 6 says.

### M6. Sessions disturb each other

All sessions share one working tree and one live stack, and the API and workers bind-mount the source ([infra/compose.yaml](../infra/compose.yaml)). Three effects so far:

- Tests written ahead of their code (T22) made other sessions' full runs fail.
- The `solo:` and `space settings:` live journeys have failed since 09:03, because of the T22 changes in progress.
- CPU load produced a false failure.

**PROPOSED.** Give each session its own branch or worktree, merged at checkpoints.

**Since then (2026-10-01 to 2026-10-02):** more effects of the shared tree, all seen by the audit session.

- Two sessions each wrote a migration numbered `0030` at the same time, and every backend test failed with "Multiple heads". `npm run verify` now reports such a clash before running the backend suite.
- A complete backend run counted 25 failures that came from another session's migration and models changing during the run. The summary of `npm run verify` now lists the files that changed while it ran.
- From 05:26 the shared Android tree did not compile while another session added Room and WorkManager, so device runs had to use a clean copy of the last commit.
- Commits made with `git add -A` take in other sessions' unfinished work under an unrelated message. The audit session's own checkpoint commits did this, as their messages say. At 07:44 another session's commit, "Refactor spaces management to support internationalization" (`67ac8b6`), contained the audit session's T99 and T100 fixes, tests and records. A commit message then no longer describes what the commit contains, and one session's half-done change can be committed by another. Since `5b7d712`, the audit session stages only the paths it changed.

**PROPOSED.** Until each session has its own branch or worktree, each session stages only the paths it changed (`git add <paths>`) and never `git add -A`.

**Records lost (2026-10-02):** the shared tree also loses records when a session writes a whole document from an older copy it holds.

- Commit `642e47b` ("feat: add page management and roles features", 10:54) changed the task list, the build status and the changelog only by taking text away. It removed tasks T105 to T111, sent T84, T85 and T101 to T104 back from Done, and deleted two checkpoints and three changelog records, among them the building session's own T84 and T85 records.
- Later, a rewrite of the task list in the working copy brought most of these back but dropped T112, which had never been committed.
- The code was not affected. The records were restored word for word ([T113](TASKS.md#documentation)).
- `npm run check:records` now reports a record that disappears, and a task that goes back from Done, in the working copy and in the last commit, and `npm run verify` runs it first.
- Commits that share a working tree also carry each other's unfinished work: commit `642e47b` included the audit session's five deletion tests (T110, T112, T106 part 4) before any of their fixes existed.

**PROPOSED.** A session changes a shared document only by editing the lines it means to change, in a fresh read of the file, never by writing back a copy it held earlier, and runs `npm run check:records` before it commits. The owner's decision on branches or worktrees (above) would remove the cause.

### M7. Features are left half-finished across layers

- **Personal data export.** The backend and a worker exist ([export_worker.py](../backend/app/export_worker.py)), but there is no Compose service and no web or Android screen, so nobody can use it. It also has a silent 1,000-row limit (T45).
- **Android release.** The release variant was built but never run (T40).
- **Alerts** exist on the web only.
- **Android** lacks three things the web has: editing a Space's description, editing pages, and the followed-pages list.

### M8. Builds are not reproducible

The backend image installs Debian packages on `debian:trixie-slim` without pinning them or the image (no digest). So the version ranges in [pyproject.toml](../backend/pyproject.toml) do not describe what runs, and there is no lock file. The web lock file does have integrity hashes.

## 4. Confirmed Defects in the Built Code

✓ means the coordinating session re-read the code. The Task column links the TASKS row.

| ID | Severity | Where | What goes wrong | Breaks | Task |
| --- | --- | --- | --- | --- | --- |
| W01 ✓ | High | [page-screen.tsx](../web/src/features/community/page-screen.tsx#L139), [providers.tsx](../web/src/app/providers.tsx#L9), [events-screen.tsx](../web/src/features/events/events-screen.tsx#L201) | Every query refetches when the window regains focus. Editors keep the values from when they opened, but compare against and send the version tag of the latest refetch. So saving after a refetch reverts newer changes, even to fields the person never touched, and the server accepts it. Example: you edit a page on the web and change its description on Android. Back in the web tab, you change only the topic and save; the Android change is silently undone. | R9 | T39 |
| A1 ✓ (configuration) | High | [proguard-rules.pro](../android/app/proguard-rules.pro), [app/build.gradle.kts](../android/app/build.gradle.kts#L28) | Release builds shrink with R8 full mode (AGP 8.7.3). Retrofit 2.9.0 `suspend` calls need generic signatures (`kotlin.coroutines.Continuation`, `retrofit2.Response`) that no rule keeps. Every API call is expected to fail, so nobody can sign in. Only the build was checked. *Suspected until run.* | R13 | T40 |
| W02 ✓ | Medium | [messages-screen.tsx](../web/src/features/messaging/messages-screen.tsx#L244) | Polling pauses while the tab is hidden. If more than 330 messages arrived meanwhile, the catch-up stops after 10 pages, shows the newest page and marks everything read. The messages in between are never shown. Overlapping polls can also bring back the text of a deleted message (*Suspected*). | R5 | T41 |
| B03 ✓ | Medium | [spaces/service.py](../backend/app/modules/spaces/service.py#L189) | Leave or remove in an existing private Space you are not in, and the answer is "Membership not found". For a missing Space it is "Space not found". The difference reveals that the Space exists. | R12 | T42 |
| B04 ✓ | Medium | [scheduling/service.py](../backend/app/modules/scheduling/service.py#L362) | Every second, the worker takes the 20 oldest due reminders, always in the same order. A reminder whose account is locked returns "busy" and stays where it is. If 20 such reminders are at the front, every other account's reminders wait while the lock lasts. | R9 | T43 |
| B07 | Medium | [platform/restore.py](../backend/app/modules/platform/restore.py#L20) | Restore verification decrypts three identity columns, but six columns are encrypted. A restore with unreadable messages, care or exports is reported as good. Found by two reviewers independently. | R12 | T44 |
| B09 ✓ | Medium | [identity/exports.py](../backend/app/modules/identity/exports.py#L43) | Every history in the export stops at 1,000 rows, without saying so. | R12 | T45 |
| B11, W04 | Medium | [community/schemas.py](../backend/app/modules/community/schemas.py#L90), [route.ts](<../web/src/app/api/[...path]/route.ts#L107>) | Text limits disagree. The API description says 10,000 characters for a post, but the server allows 5,000, and a valid 5,000-emoji post exceeds the 16 KiB request cap. A 61-emoji title passes the web form but fails the 120-unit response check, so a saved change shows as not confirmed. | R4 | T46 |
| W05 | Medium | [route.ts](<../web/src/app/api/[...path]/route.ts#L127>) | A request without `Content-Length` is read completely before its size is checked. There is no cap while the body streams in, and no read deadline. | R12 | T47 |
| W06 | Medium | [events-screen.tsx](../web/src/features/events/events-screen.tsx#L66) | Changing Space while a new event is still unconfirmed discards its retry key. Creating it again can make a duplicate. | R9 | T48 |
| A4 | Medium | [SessionStore.kt](../android/app/src/main/java/com/community/platform/feature/identity/SessionStore.kt#L33) | A Keystore key that cannot be used is never deleted or recreated, so sign-in fails until app data is cleared. Keystore errors appear as "No connection". | R12 | T49 |
| A7, A12 | Medium | [IdentityViewModel.kt](../android/app/src/main/java/com/community/platform/feature/identity/IdentityViewModel.kt#L50), [IdentityScreen.kt](../android/app/src/main/java/com/community/platform/feature/identity/IdentityScreen.kt#L145) | Starting offline shows the sign-in form with no way to retry, and signing in again piles up server sessions (the oldest is revoked at 20). Sign-up defaults to Asia/Kolkata instead of the device's timezone. | R13 | T50 |

These defects are in the alerts work (conflict C10). Fix them only if the owner keeps that work (X2):

| ID | Severity | Where | What goes wrong |
| --- | --- | --- | --- |
| B02 | Medium | [alerts.py](../backend/app/modules/notifications/alerts.py#L456) | Agreeing to be someone's backup checks membership before taking the lock. If a removal commits in between, the removed person is still left with an active agreement. |
| B05 | Medium | [alerts.py](../backend/app/modules/notifications/alerts.py#L154) | An overdue reminder that the worker has not delivered yet is ignored, and the client is told to check again in 24 hours. |
| B06 | Medium | [series.py](../backend/app/modules/scheduling/series.py#L504) | Moving the next time of a series earlier does not re-check an existing snooze, which can then fire after it. DEC-010 says a snooze never goes past the next time. |
| B08 | Medium | [alerts.py](../backend/app/modules/notifications/alerts.py#L67) | When the clocks go back and a time of day repeats, quiet hours covering that hour give an end time that has already passed. |
| W08 | Medium | [notification-screen.tsx](../web/src/features/notifications/notification-screen.tsx#L32) | The task inbox does not poll, and the polling alert panel filters task reminders out. A new reminder stays invisible until a reload. |

### Lower-severity findings

**Backend**

- **B01 (Low; synthetic data only).** The `0018` backfill can still show a message or event to someone who joined at exactly the same instant as its author. This affects only data older than `0018`.
- **B10.** Alembic's metadata registers 35 of the 53 tables, so autogenerate is unreliable. Tracked as [T57](TASKS.md#defects-that-break-approved-requirements); in a new process `alembic check` stopped with an error before comparing anything.
- **B12.** Sessions expire only at an absolute time, readiness does not check the migration head, and the API docs are on by default. The readiness part is [T58](TASKS.md#defects-that-break-approved-requirements).

**Android**

- **A3.** There is no `FLAG_SECURE`; the policy is still open (C8-D05).
- **A10.** Every API call holds one app-wide lock. [T82](TASKS.md#defects-that-break-approved-requirements) confirmed it and tried a narrower lock, then reverted it. The lock also keeps a refresh's late answer from overwriting a newer change, such as bringing back a deleted chat message, so each screen must ignore late answers first.
- **A11.** Navigation is a string-keyed switchboard, and the Retrofit builders are copied between screens.
- **A12.** Sign-in fields are lost when the screen rotates. Fixed by T50; the account settings fields had the same problem, fixed by [T94](TASKS.md#defects-that-break-approved-requirements).

**Both clients**

- **A14.** Signing out offline leaves the device signed in, on web and Android alike.

**Web**

- **W09.** Placeholder contrast is 3.68:1, and a delete button is 36 px. T36 and T37 cover this.
- **W10.** The reminder tabs have no keyboard behaviour. Tracked as [T55](TASKS.md#defects-that-break-approved-requirements).
- **W11.** The followed-pages list shows "empty" when loading fails. Tracked as [T56](TASKS.md#defects-that-break-approved-requirements).
- **W12.** Failures to load the timezone list are silent. Tracked as [T59](TASKS.md#defects-that-break-approved-requirements).
- **W07.** The Space pickers read only the first 50 Spaces. That is safe only while accounts are capped at 50. Rechecked after group, couple and role Spaces were built: creating a Space, accepting an invitation and approving a join request all check the cap (`check_account_capacity`), so it still holds.

## 5. Tests and Evidence

- **What is strong.**
  - Backend tests use real PostgreSQL in isolated schemas, controlled clocks, race and rollback tests, and admission-boundary assertions.
  - No test is skipped or disabled.
  - The evidence for every Done task exists: 12 checkpoints, 12 saved logs, and the named tests.
- **Counts at 11:53.**
  - Backend: 287 test functions, giving 408 cases. The saved T32 run passed all 408.
  - Web: 135 test registrations (83 client, 28 offline, 24 live), plus 5 catalog tests.
  - Android JVM: 194 tests. The last recorded run had 190; the 4 new group tests have not been in a recorded run.
  - Android device: 48 tests (42 offline, 6 live).
- **Holes.**
  - Android has no device tests for chat, care, events, the calendar, checklists, groups, Space settings or repeating reminders.
  - Android has no tests of any kind for reports and blocks.
  - The web has no offline tests for Spaces, care or repeating reminders.
  - No test checks that every protected route refuses anonymous, expired and other-Space requests.
  - The log-privacy test reads standard output only.
  - The audit-secrecy test counts records instead of reading them.
  - A 20-second limit in a worker test fails under load.
  - A lock test treats one second of waiting as proof that requests were serialised.
- **Missing tests, most important first.** T51 and T52 cover the first three.
  1. Every protected route refuses anonymous, expired and other-Space requests.
  2. Message delete and read, and event create, cancel and attendance, refuse a session that expired while waiting for a lock.
  3. Secrets never appear in standard output or standard error.
  4. Leaving and rejoining cannot revive backup consent (if alerts stay).
  5. On Android, an unconfirmed chat message survives the app's process being killed.
  6. On Android, a failed care action never shows as confirmed.
  7. Android report and block.
  8. Android series and snooze controls.
  9. An event time that contradicts its timezone is refused.
  10. Quiet hours behave correctly across daylight-saving changes (if alerts stay).
- **Where these stand, later on 2026-10-01.**
  - **The ten missing tests:**
    - 1 to 3 are covered by T51 and T52.
    - 4 and 10 wait for C10.
    - 5 is T67, which the gaps session is building under DEC-021.
    - 6 is covered by [T62](TASKS.md#defects-that-break-approved-requirements).
    - 7 is covered by [T61](TASKS.md#defects-that-break-approved-requirements), which also found and fixed a defect.
    - 8 was partly covered already, and [T76](TASKS.md#defects-that-break-approved-requirements) adds the rest.
    - 9 needs no new test. The API takes a local time and a zone and works out the instant itself, and it refuses times that a clock change skips or repeats (`test_event_times_and_text_are_validated`). A check in the apps would refuse valid events whenever the server's and the device's timezone rules differ, so none was added.
  - **The holes listed above:**
    - The lock test is [T60](TASKS.md#defects-that-break-approved-requirements).
    - The care screen's offline tests are [T63](TASKS.md#defects-that-break-approved-requirements); T59 added one repeating reminder test; the Spaces screens are [T78](TASKS.md#defects-that-break-approved-requirements), after the live updates work (T65) settles on the web. [T92](TASKS.md#defects-that-break-approved-requirements) added 29 offline tests for repeating reminders and snooze.
    - On Android, [T93](TASKS.md#defects-that-break-approved-requirements) added device tests for care, events, the calendar and repeating reminders, and found and fixed dialogs that cut their text off at 200%. [T95](TASKS.md#defects-that-break-approved-requirements) added checklists and group Spaces and found two defects ([T97](TASKS.md#defects-that-break-approved-requirements)). Only chat still has no device tests; it waits for T65 and T67. [T96](TASKS.md#defects-that-break-approved-requirements) runs them all with `npm run verify -- -Suite device`.
  - **Text limits (B11, W04):** T46 made posts count characters as the server does, T79 Spaces, and [T100](TASKS.md#defects-that-break-approved-requirements) every other web answer and form, Android's task assignees and its name fields. One emoji-heavy name or title had been enough to stop a whole list from loading on the web.
  - **The finished critical gaps (T65–T69):** a read-only review against their decisions found 19 defects. The audit session fixed four ([T101–T104](TASKS.md#defects-that-break-approved-requirements)), among them the inbox listed in random order, which made Android's phone alerts miss most new reminders. The rest are recorded for their owners as T106–T111 ([checkpoint](BUILD_STATUS.md#review-of-the-finished-critical-gaps-checkpoint)).

## 6. What Is Missing, and Why

| Area | Requirement | Exists now | Missing | Blocked by | Size |
| --- | --- | --- | --- | --- | --- |
| Agents | R7, R8 | Rule-based parser, tool list and models; T33 is connecting them (DEC-012, provisional) | Conversation backed by an AI model, and evaluations | Q17; review of DEC-012 | XL |
| Documents | R5 | Nothing (README only) | Upload, storage, virus scanning, parsing and deletion | Q6; downloading scanner signatures needs DEC-005 changed | L |
| Retrieval | R10, R11 | Nothing | Chunking, an index (pgvector, P17), search filtered by permission, and citations | T14, Q8, Q17; conflict C4 with end-to-end encryption (Q11) | XL |
| Roles and permissions | R2 | Owner and member | A role set, per-Space settings, enforcement everywhere | P5 | L |
| Couple Spaces | R6 | Family, solo, group (in progress) | Two-person rules, separation | P2 | M |
| Public depth | R4 | Follows, feeds, literal search | Ranking, trends, recommendations, more reactions | C5, Chapter 15 decisions, U-07 | L |
| Moderation | R12, P10 | Reports and blocks | Cases, reviewers, enforcement, appeals | Q14, U-14 | XL |
| Live updates | R5, P13 | Polling every 5 s | Streams with replay and revocation | C7-D07, C7-D08 | L |
| Notification channels | R8, P12 | In-app only, plus the unrecorded alerts | Push, email, consent, quiet hours | Q10, DEC-005, C10 | L |
| Data rights | R12, P11 | Export backend only | An export worker in Compose, export screens, account deletion | P11, U-01, Q19 | L |
| Audit trail | R12 | Audit and outbox records for most writes | Records for follows, likes, saves and blocks; a way to read them; retention | U-06, Q19 | M |
| Observability | R12 | Request logs, trace IDs, `/metrics`, queue gauges | A collector, dashboards, alerts, traces into workers, database metrics | Q19 (alert targets only) | M |
| Operations | R12, R13 | Compose, restore drill, key rotation | CI, pinned builds, environments, key custody, off-machine backups, load tests (P18) | DEC-005, C11-D08, Q19 | L |
| Languages | P20 | English only (736 web text nodes; about 175 Android sentences written in code) | A translation framework; Telugu and Hindi | P20, Q9 | L |
| iOS | R13 | None | An iOS client | D5 | XL |

## 7. Decisions Only the Owner Can Make

Ranked by how much work each decision unblocks or protects. Each recommendation is PROPOSED.

1. **Confirm or reverse DEC-010 to DEC-014, and say whether sessions may decide when you delegate** (C11). Recommended: review each one now. If delegation stays, record it as a decision with a review deadline, so provisional decisions stop piling up.
2. **Keep or revert the alerts work** (C10, X2). Recommended: decide before more is built on it. If you keep it, record its decision and consent rules (C13-D06, C13-D09) and check it like any other feature.
3. **Commit the work and set the repository's visibility.** Recommended: commit today. Before the next push, make the repository private or confirm that it should stay public.
4. **The agent beyond fixed rules, and which AI model providers** (review of D4; Q17).
5. **Documents** (Q6, Q8), and whether a virus scanner may download its signatures (DEC-005).
6. **The role set** (P5) **and couple rules** (P2).
7. **Targets and audit scope** (Q19, U-06). These unlock alerting, retention and audit coverage.
8. **Approvals for care, and notification channels** (Q12, Q10).
9. **Data rights** (P11). If export and deletion are in scope, finish export and build deletion.
10. **One roadmap** (D6). Counting the End-to-End Plan, there are now seven build orders.

## 8. Recommended Order of Work (PROPOSED)

1. The owner commits the working tree, and each session gets its own branch or worktree.
2. The owner rules on C11 and C10.
3. Fix the two High defects (T39, T40) and make the test commands complete (T51).
4. Finish the work in progress (T22, T33) before starting new provisional work.
5. Fix the Medium defects (T41–T50, T52) and correct the documents (T53).
6. Engineering that needs no decision:
   - one local command that runs every check
   - pinned images and packages
   - restore checks for all encrypted data
   - a local metrics collector
   - a synthetic load test
7. Start the blocked work as the decisions in section 7 arrive.
