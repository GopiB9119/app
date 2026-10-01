# Changelog

Notable changes to requirements, documentation structure and the product, newest first. Each entry says what changed and links to the decision or evidence.

## 2026-10-01

### Engineering audit

- Added the [engineering audit](docs/ENGINEERING_AUDIT_2026-10-01.md), a read-only review of the whole repository by six independent reviews. It covers what is done, what is missing and why, and where the project is making mistakes. No code changed.
- Recorded two conflicts in the [Product Understanding](docs/PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository):
  - **C10:** the alerts work was built without a task or decision, while T23–T26 and T28 are Blocked. It is flagged as X2 in [TASKS](docs/TASKS.md#work-outside-the-approved-scope) for you to keep or revert.
  - **C11:** product decisions DEC-010 to DEC-014 were made by AI sessions under your delegation and built straight away. They are waiting for you to confirm or reverse them.
- Added the confirmed defects as T39–T52 in [TASKS](docs/TASKS.md#defects-that-break-approved-requirements). Two are High:
  - Web editors can overwrite newer changes despite `If-Match` (T39).
  - The Android release build is expected to fail every API call (T40).

  Also added the documentation corrections as T53.
- Ran only the web client and feature catalog tests: 88 passed, 0 failed. Other sessions were using the machine, so the backend suite, Gradle, emulators and the live journeys did not run.

### Design (design session)

- Recorded the text you shared on how experienced designers and engineers make a product feel polished and consistent, in the [Product Understanding](docs/PRODUCT_UNDERSTANDING.md): a new source label "Shared", principles in section 2, notes in sections 20, 30 and 31, proposals P21–P25 and question D7.
- Its 21 separate documents were not created: [DEC-008](docs/DECISIONS.md#accepted-decisions) already keeps one authoritative document per subject, and every subject in the text has one (conflict C9, resolved).
- Decided provisionally under your delegation, after you were asked and could not answer, and waiting for your review (see conflict C11): one design system and screen rules for every new or changed screen ([DEC-013](docs/DECISIONS.md#accepted-decisions)), and Home as a personal overview with the same five main sections on web and Android ([DEC-014](docs/DECISIONS.md#accepted-decisions)). The rules are in [FEATURES_AND_SCREENS section 4](docs/FEATURES_AND_SCREENS.md#4-rules-every-feature-follows) and rule 10 of [AGENTS.md](AGENTS.md); the documentation map has a Design system row.
- Built T36, with nothing visible changed: the web stylesheet and the Android theme now take their colours, font, corner sizes and target sizes from files generated from [the design tokens](packages/design-tokens/README.md) (`npm run tokens`), and `npm run check:tokens` stops hand-typed copies and text colours below 4.5:1 contrast ([checkpoint](docs/BUILD_STATUS.md#design-tokens-single-source-checkpoint)). 7 token tests and 29 offline web component tests passed; 1,922,926 computed style values were identical before and after; the Android theme compiled on an isolated copy, because the shared Android tree is missing two calendar strings from other work.
- Found while checking: the input border (1.98:1 on white) and the placeholder text (3.68:1) are below accessibility contrast targets. Fixing them is part of T37, which, with T38 (Home and navigation), waits for your review of DEC-013 and DEC-014.

### Requirements

- Approved requirements R1–R13 ([DEC-001](docs/DECISIONS.md#accepted-decisions)).
- Approved requirements now change only through a recorded decision ([DEC-002](docs/DECISIONS.md#accepted-decisions)).
- Implementation paused while the product owner explains the product ([DEC-003](docs/DECISIONS.md#accepted-decisions)).
- Implementation resumed, replacing the pause ([DEC-006](docs/DECISIONS.md#accepted-decisions)).
- Care kept and in scope for now; who approves its medical, legal and privacy rules is still open ([DEC-007](docs/DECISIONS.md#accepted-decisions); Q12).
- Adopted the documentation authority hierarchy and its conflict, evidence and behaviour-protection rules ([DEC-008](docs/DECISIONS.md#accepted-decisions)), in the new [Product Constitution](docs/PRODUCT_CONSTITUTION.md).
- Adopted the working agreement: messages are read for their intent, routine engineering decisions are made without asking, and ready work continues without stopping ([DEC-009](docs/DECISIONS.md#accepted-decisions)).
- Repeating reminders, snooze and planned times in the calendar were decided provisionally by the build session under your delegation, and await your review ([DEC-010](docs/DECISIONS.md#accepted-decisions)). This answers U-08 provisionally.

### Documentation

- Added the [Product Understanding](docs/PRODUCT_UNDERSTANDING.md): 40 sections, each point labelled.
- Added the [documentation map](docs/README.md), which names one authoritative document for each area.
- Added [DOMAIN](docs/DOMAIN.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [AI_POLICY](docs/AI_POLICY.md), [DECISIONS](docs/DECISIONS.md), [TASKS](docs/TASKS.md), [EVALUATIONS](docs/EVALUATIONS.md), [INCIDENTS](docs/INCIDENTS.md), this changelog and repository-wide agent rules in [AGENTS.md](AGENTS.md).
- Expanded [DOMAIN](docs/DOMAIN.md) into the Domain Contract: 34 entities with the 23 requested fields each, shared rules S1–S12, and entity-level open decisions U-01 to U-18. Recorded gap G8 (audit coverage) in the Product Understanding.
- Corrected stale documents ([TASKS T18](docs/TASKS.md#documentation)): module READMEs for identity, messaging, community and events on all three platforms, the runbook's migration head, the OpenAPI README, the BUILD_STATUS date and the root README's test count.
- Recorded the 2026-10-01 full runs in [EVALUATIONS](docs/EVALUATIONS.md#test-suites): backend 319 passed, web client 64 passed, Android JVM 171 passed. The web and Android totals include the care work waiting for your decision (X1).
- Wrote DEC-010 into the Domain Contract (Schedule, Reminder, Notification, U-08 and the tables list), and updated TASKS, BUILD_STATUS, EVALUATIONS, PRODUCT_FEATURES, FEATURES_AND_SCREENS, the Chapter 13 contract note, conflict C6 in the Product Understanding, ARCHITECTURE, the runbooks, the OpenAPI README (119 operations) and the scheduling, notification and planning READMEs on all three platforms.
- Added the [Product Constitution](docs/PRODUCT_CONSTITUTION.md) as level 1: R1–R13 copied word for word from the Product Understanding and checked identical, the decisions in force, the nine-level hierarchy, the conflict procedure, the evidence rules, protection of existing behaviour and amendments. The documentation map now lists the documents at each level, and AGENTS.md, DECISIONS, TASKS, EVALUATIONS, the Domain Contract, ARCHITECTURE, AI_POLICY and the Chapter 1, 6, 7, 11 and 12 notes point to the Constitution. The conflict register (Product Understanding section 40) now shows each conflict's sources, levels, newer confirmed decision and status.

### Product (scheduling session)

- A task reminder can now repeat: every 1–30 days, or on chosen weekdays every 1–4 weeks, at one time in a named timezone, for up to a year. You review the first times and any clock changes before saving, and you can skip the next one, pause, resume or cancel, each after a confirmation. Changing or closing the task pauses it until you resume it. On backend, web and Android ([T19](docs/TASKS.md#scheduling); [checkpoint](docs/BUILD_STATUS.md#repeating-reminders-snooze-and-planned-times-checkpoint)). Migration `0019` adds three tables.
- A delivered reminder can be snoozed for 10 minutes, 1 hour, 3 hours or 1 day, at most three times and never past its next repeat ([T20](docs/TASKS.md#scheduling)).
- The calendar shows the planned times of repeating reminders ([T21](docs/TASKS.md#scheduling)). The Android calendar used to refuse any new kind of entry; it now accepts these.
- Checks: 34 new backend tests pass, and every scheduling-related backend file passes in the complete run (373 passed; the 12 failures are the Spaces session's T22 tests, written before their code). Web client 75, offline browser 29, and the live web journey passed with a real delivery by the worker. Android JVM 186 passed, lint 0 errors, and all three builds passed. Android screens were not run on a device.
- Found and fixed while verifying: the web reminder screen was not showing the new repeat controls, although the type check passed.
- Not built, each waiting for a decision: events in the calendar, quiet hours and other channels, escalation, care dose reminders, external calendar sync, and editing a saved repeating reminder (T23–T28).

### Product (build session)

- The API now writes one log line per request without private data, the web proxy and the API share a W3C trace ID for every web request, and a key-protected `/metrics` endpoint counts requests and durations by route ([T09](docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](docs/BUILD_STATUS.md#observability-basics-checkpoint)). Alerts wait for agreed targets (Q19). Backend 366 passed; web client 68 passed.
- New members no longer see a chat message or event made at the same moment they joined; a direct message can no longer be saved after the other person has left; and messaging, community and event changes are no longer saved when the session expired while they waited ([T02, T03 and T04](docs/TASKS.md#defects-that-break-approved-requirements); [checkpoint](docs/BUILD_STATUS.md#history-boundary-and-late-save-fixes-checkpoint)). Migration `0018` adds admission order numbers. Backend 326 passed; the 1 failure was a new test's wait detection, corrected and rerun. A later complete run passed 366.

### Product (primary engineering session)

- `/metrics` now shows, for sign-in mail, reminders and exports, how many items the worker could process now, how long the oldest has waited and how many ended in failure, so a stopped or slow worker becomes visible ([T32](docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](docs/BUILD_STATUS.md#background-work-metrics-checkpoint)). The values are read from the database at each scrape and contain no personal data. 4 new backend tests pass, 6 injected defects each made them fail, and the complete backend run passed 408 of 408. Alerts on them still wait for targets (Q19).
- The encryption key can now be replaced in stages without signing anyone out or losing stored data: add a key, make it primary, re-encrypt, verify, then retire the old key after 24 hours ([T11](docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](docs/BUILD_STATUS.md#encryption-key-rotation-checkpoint); [procedure](backend/app/modules/platform/README.md#encryption-key-rotation)). The existing key file keeps working unchanged, and the lookup key is never rotated. 6 new backend tests pass, and 8 injected defects each made them fail. The complete backend run passed 402 of 403; the 1 failure was a worker-process time limit under full CPU load, and that test passed when run alone. Production key custody is still open (C11-D08).
- Web chat keeps an unconfirmed message and its Retry when you switch conversations, marks that chat "Not confirmed" in the list, and retries a read receipt that failed ([T05 and T07](docs/TASKS.md#defects-that-break-approved-requirements); [checkpoint](docs/BUILD_STATUS.md#web-chat-reliability-checkpoint)). The Back button no longer asks before leaving, because leaving no longer loses the retry.

### Product (built by another session)

- Android can now edit a page's drafts and published posts, as the web can. A post that changed elsewhere is refused instead of overwritten, and the text stays open until the save is confirmed ([T31](docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](docs/BUILD_STATUS.md#android-post-editing-checkpoint)). Android JVM 190 and 4 community device tests passed.
- The web sign-in, registration and recovery forms no longer lose input or put it in the address when used before the page is interactive. An early click had reloaded the page with the email in the URL, and on sign-in the password too ([T30](docs/TASKS.md#defects-that-break-approved-requirements); [checkpoint](docs/BUILD_STATUS.md#live-cross-check-and-account-form-fix-checkpoint)). Found by a full sweep of the live web journeys, in which 20 of 21 passed; the new test failed before the fix and passes after.
- Public posts can be searched by their words on web and Android, from a Pages / Posts choice on Discover ([T29](docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](docs/BUILD_STATUS.md#public-post-search-checkpoint)). Matching is literal over title and text, newest first; drafts and blocked pages never match. The web proxy now forwards `q` on the public post list, and its test was changed to match (Article 7). Backend community 17, web client 75 and Android JVM 188 passed, and the live journey passed.
- Personal data export (backend only, not yet usable) now has behaviour tests: recent sign-in, own data only, download only in the requesting session, withdrawal when access changes, and cleanup ([checkpoint](docs/BUILD_STATUS.md#personal-data-export-verification-checkpoint)). No product code changed.
- Web sign-in limits can count each browser's network instead of one shared limit, when the web app runs behind a trusted reverse proxy ([T10](docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](docs/BUILD_STATUS.md#web-sign-in-limits-per-network-checkpoint)). Local behaviour is unchanged.
- The generated API description now marks the 12 account and export operations as requiring sign-in ([T08](docs/TASKS.md#defects-that-break-approved-requirements); [checkpoint](docs/BUILD_STATUS.md#api-description-sign-in-checkpoint)). Behaviour is unchanged.
- Android now accepts valid community lists larger than 64 KiB, with limits sized from what the backend can store ([T06](docs/TASKS.md#defects-that-break-approved-requirements); [checkpoint](docs/BUILD_STATUS.md#android-community-response-limits-checkpoint)). Android JVM 173 passed; backend 319 passed.
- Space events and RSVP on backend, web and Android, limited ([checkpoint](docs/BUILD_STATUS.md#space-events-and-rsvp-checkpoint)).
- Care screens were being built at the same time and continued until 00:35:39, after the pause (conflict C8 in the [Product Understanding](docs/PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository)). You kept them ([DEC-007](docs/DECISIONS.md#accepted-decisions); [care checkpoint](docs/BUILD_STATUS.md#care-checkpoint)).

## Before 2026-10-01

Earlier work is recorded as checkpoints in [BUILD_STATUS.md](docs/BUILD_STATUS.md). The database migrations show the order in which features were added:

| Migration | Feature |
| --- | --- |
| 0001 | Accounts and sign-in |
| 0002 | Family Spaces |
| 0003 | Family invitations |
| 0004 | Family tasks |
| 0005 | One-time reminders for yourself |
| 0006 | Reminder retry limits |
| 0007 | Reminder requests to other members |
| 0008 | Member removal and leaving |
| 0009 | Ownership transfer |
| 0010 | Account export (backend only) |
| 0011 | Space name settings |
| 0012 | Solo Spaces |
| 0013 | Task checklists |
| 0014 | Space chat and direct messages |
| 0015 | Public community |
| 0016 | Care instructions (backend only) |
| 0017 | Space events |
