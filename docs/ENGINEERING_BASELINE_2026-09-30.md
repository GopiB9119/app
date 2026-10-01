# Engineering Baseline and Execution Plan

**Dated snapshot; not maintained.** The maintained versions are [ARCHITECTURE.md](ARCHITECTURE.md), [TASKS.md](TASKS.md) and [EVALUATIONS.md](EVALUATIONS.md); see the [documentation map](README.md).

Review cutoff: **2026-09-30 16:56 UTC**, refreshed **18:00 UTC**. This is an analysis record for the active worktree, not a release approval, test certificate or replacement for the original chapters, ADRs, [build status](BUILD_STATUS.md) or [feature ledger](PRODUCT_FEATURES.md). No production code was changed during this discovery pass.

The worktree was changing during review. At refresh, source, the running API and the development database are all at migration `0017`, with 44 registered tables and 110 OpenAPI operations. The complete backend suite passed 319/319 on current source (`backend/.local/assessment-backend-20260930.xml`). Events now also has web and in-progress Android clients. The committed Git baseline is only `fff2eaf` plus many modified and untracked files, so preserve concurrent work and inspect exact files before editing.

## Architecture To Preserve

| Area | Current implementation and constraint |
| --- | --- |
| Repository | Root product/source documents, `backend/`, `web/`, `android/`, generated/shared `packages/`, `infra/`, `scripts/` and cross-client `tests/`. |
| Backend | FastAPI modular monolith with SQLAlchemy/PostgreSQL/Alembic. Domain modules own models, schemas, services and routes. Separate identity-mail and reminder worker processes exist. |
| Web | Next.js 16 / React 19 app routes, TypeScript feature clients, Zod response validation, TanStack Query and a same-origin BFF at `web/src/app/api/[...path]/route.ts`. Read `web/AGENTS.md` and installed Next docs before web changes. |
| Android | Single-app Kotlin/Compose, Hilt, Retrofit/OkHttp, ViewModel/StateFlow and Keystore-protected session storage. Navigation is saveable screen state in `MainActivity`; there is no Room cache or WorkManager outbox. |
| Data | PostgreSQL is the authority. Most mutating features commit domain state, audit and `domain_outbox` rows together. Redis, object storage, search and WebSocket infrastructure are not configured. |
| Authentication | Synthetic `.test` email verification, Argon2 passwords, opaque revocable eight-hour sessions, token digests and encrypted email. Web stores the token in an HttpOnly SameSite=Strict cookie and binds requests to an expected account. Android sends Bearer tokens from Keystore-backed storage. |
| Authorization | The backend derives the actor from the session and checks current account, Space membership, admission ID and object grants. Tasks and reminders are bound to exact admissions, so rejoining does not restore old access. |
| Retry model | Mutations generally use UUID idempotency keys, request digests, ETags or `If-Match`, and explicit client retry of the original intent. Retry state is in memory only. |
| Testing | Backend tests use a guarded `community_test` database and a random per-process schema. Web tests use in-process client/BFF checks, offline component bundles and opt-in live journeys. Android has JVM tests plus guarded emulator instrumentation. |

These choices are consistent with the owning contracts and should be extended rather than replaced. All five ADRs remain proposals; local implementation choices are not production approvals.

## Current Feature State

| Area | Backend | Web | Android | Assessment |
| --- | --- | --- | --- | --- |
| Account access and sessions | Yes | Yes | Yes | Limited local implementation with live web/native evidence; not production identity. |
| Account export | Yes | No | No | Backend routes and an export service exist. No worker process is configured in Compose and no web/native client exists. |
| Deletion, phone, contacts, relationships | No | No | No | Not implemented. |
| Family and Solo Spaces | Yes | Yes | Yes | Implemented; couple, custom, temporary, archive and conversion remain missing. |
| Invitations, roster, removal, leave, rejoin | Yes | Yes | Yes | Implemented for existing verified account IDs; external/contact invitations missing. |
| Ownership transfer and name settings | Yes | Yes | Yes | Implemented; native ownership device qualification remains pending. |
| Tasks and checklists | Yes | Yes | Yes | Implemented with admission-bound access; dependencies, recurrence and workspaces missing. |
| One-time reminders and recipient-approved requests | Yes | Yes | Yes | Implemented with separate worker and in-app inbox; recurrence, snooze, quiet hours and escalation missing. |
| Calendar agenda | Yes | Yes | Yes | Task dates and personal reminders only; native device qualification open. |
| Space chat and direct messages | Yes | Yes | Yes | Server-side encrypted at rest, polling only. Not end-to-end encrypted, realtime or crash-safe. Confirmed edge defects below. |
| Public community | Yes | Yes | Yes | Pages, drafts, publish, follow, feed, comments, likes, saves, reports and blocks. Moderator workflow, roles, media, shares and SSR missing. Confirmed defects below. |
| Care instructions | Yes | No | No | Backend/model/migration/tests are present and registered, but this concurrent work is unverified here and not a complete client feature. |
| Space events and RSVP | Yes | No | No | Backend/model/migration/tests are present and registered, but this concurrent work is unverified here. |
| Agent runtime | Partial | No | No | Parser/models/tool definitions exist, but no service, route, worker or client integration. |
| Files, realtime, integrations, advanced discovery, moderation/data rights | No/limited | No/limited | No/limited | Largely roadmap work. |

## Verification Performed

| Check | Result and limit |
| --- | --- |
| Community, messaging and schema parity | 27 passed in an isolated schema before care/events appeared. |
| Catalog, web-client and messaging-client tests | 54 passed; mocked/in-process transport. |
| New community client/BFF tests | 5 passed; mocked/in-process transport. |
| Web TypeScript | Passed at the time of the check. |
| Source/catalog preservation | Passed: 21 originals, 15 domains, 48 must-haves, 17 outcomes, 190 features, 2,208 headings. |
| Signed-out web preview | `http://127.0.0.1:3000/app/discover` loaded and rendered a synthetic public page. |
| Retained reports | Backend `community-backend-20260930.xml`: 302 passed; Android JVM: 150 passed; Android lint: 0 errors, 11 warnings; live community/messaging/checklist browser journeys passed. These predate or exclude care/events and were not all rerun here. |

The latest retained backend report does not prove care/events, because source added migrations `0016` and `0017` after it. Do not use earlier counts as current full-repository evidence.

## Confirmed Defects

All reproductions used disposable synthetic data or mocked transport and modified no source.

| Priority | Defect | Location | Reproduction and impact |
| --- | --- | --- | --- |
| P1 | Pre-admission Space chat message can be exposed (events share the same equal-timestamp boundary) | `backend/app/modules/messaging/service.py` `base_expression()` | A message and later admission with the same timestamp exposed 1 earlier message. History uses a timestamp predicate (`created_at < joined_at`) instead of an explicit admission sequence boundary. |
| P2 | Direct message can commit after the other participant left | `MessagingService.send()` | A send paused at insert, the counterpart left successfully, then the send returned 201 and the conversation became read-only. Send checks participant state without serializing against membership departure. |
| P2 | Message can commit after the caller's session expired during a lock wait (also page and event edits) | `MessagingService.send()` | Returned 201 while the next `/v1/me` returned 401. Existing domains re-authenticate after lock waits; messaging does not. |
| P2 | Public page edit can commit after session expiry during a lock wait | `CommunityService.update_page()` and similar writes | Returned 200 and persisted while the next `/v1/me` returned 401. |
| P2 | Web chat switching discards an unconfirmed send's retry identity | `web/src/features/messaging/messages-screen.tsx` conversation list and `ConversationPane` keying | Switching away and back showed no confirmation and zero Retry controls. The back-button warning is bypassed by direct list selection. |
| P3 | Failed web read receipt is not retried | Same file, `markedThrough.current` update before `markRead()` | After a 503 read receipt, the next successful poll made 0 additional read attempts. Android restores its read marker on failure. |
| P2 | Native community page can exceed the response cap | `android/app/src/main/java/com/community/platform/IdentityModule.kt` and community repository limits | A valid 20-post page with 5,000-character bodies was 109,403 bytes; community routes fall under the 65,536-byte cap. |
| P3 | Generated contract omits identity security declarations | `backend/app/modules/identity/api.py` | Runtime enforces sessions, but OpenAPI lacks security metadata for protected `/v1/me` and export operations. Generated clients/docs can misrepresent authentication. |

## Risks and Technical Debt

1. **Concurrent authoring:** active files and migrations were added during this review. Stop and reread before editing if a replacement no longer matches.
2. **Pattern drift:** newer messaging, community and events code do not uniformly follow the established lock/reauthenticate/current-admission pattern. Add focused regression probes when extending these domains.
3. **Evidence drift:** test report filenames are reused and later concurrent work can invalidate them. Record command, cutoff, scope, source head and artifact path together.
4. **Deployment drift:** resolved at refresh (source, API and database at `0017`), but the long-running workers were not restarted with the API. Apply future migrations only with an explicit backup/non-destructive plan.
5. **Client durability:** web and Android keep uncertain command identity in memory. Process death or navigation can lose reconciliation state.
6. **Operations:** local Compose and restore drill only. No production host, TLS termination, secrets manager, PITR, object storage, observability, rate-limit infrastructure or release rollout exists.
7. **Dependencies:** backend runtime uses Debian packages rather than a locked Python environment. Web depends on pinned local package-lock artifacts; lint dependencies are not installed. Dependency/advisory review remains open.
8. **Product safety:** care code adds medicine data. The documented health boundary, subject-only authority, legal/privacy review and clinical-content limits must be reviewed before client exposure.
9. **Moderation:** reports are stored but no reviewer queue, decisions, notices, appeals or public-content withdrawal workflow exists. Public exposure beyond local synthetic use is not ready.
10. **Encryption:** messaging is server-readable encryption at rest. Do not market or label it as end-to-end encryption.

## Feature Dependencies

| Dependency | Why it matters |
| --- | --- |
| Identity and sessions | Every authenticated operation, account binding, recent-auth action and data-rights workflow. |
| Space admission IDs | History boundaries for tasks, messages, events and reminders; rejoin must not restore old grants. |
| Task access and version | Checklists, reminder requests, calendar and reminder suppression. A checklist mutation increments task version and can suppress an earlier reviewed reminder as `task_changed`. |
| Notification preferences and inbox | Reminder dispatch and future care/event notifications. |
| Transactional outbox | Future realtime fanout, push/email and moderation work. Current outbox has no general consumer. |
| Account export | Data rights UI and final MVP export outcome. Needs a configured worker and client flows. |
| Community reports/blocks | Moderator workflow, appeals and broader discovery. |
| Canonical states/API contracts | Required before generated clients, WebSocket envelopes or broad state reuse. |

## Dependency-Ordered Execution Plan

Each stage requires reading the owning contract and current files, a focused failing test, the smallest fix, platform checks, documentation updates and preserved concurrent work.

1. **Freeze evidence baseline:** record current Git status and source/database heads; run the complete isolated backend suite including care/events; run web type/client checks; do not overwrite shared reports.
2. **Repair messaging authorization/history:** replace timestamp history boundaries with a race-safe admission boundary; serialize direct sends with participant departure; re-authenticate after locks. Add regressions for all three reproduced cases.
3. **Repair community write-session boundaries:** audit every community mutation and add post-lock authentication checks with expiry-during-lock regressions.
4. **Repair client reliability:** preserve pending web chat intents or confirm before switching conversations; retry failed read receipts; align Android community response limits with bounded valid payloads.
5. **Correct generated API security metadata:** declare authentication for protected identity/export routes, regenerate OpenAPI, and compare for unexpected contract changes.
6. **Qualify in-progress backend domains:** independently review and verify care and events for authorization, history, DST, retry, migration and privacy behavior. Do not add clients until health/data-rights boundaries are accepted for care.
7. **Complete account export:** configure the export worker and add web/Android request, status, download and cancellation flows with recent-auth and protected-download tests.
8. **Build moderation minimums:** reviewer authority, queue, decision/restriction, withdrawal and user notice; appeals and privileged access follow the Chapter 16 contract.
9. **Add durable client recovery:** process-death-safe pending command storage and reconciliation for high-risk mutations before enabling offline or realtime claims.
10. **Proceed through roadmap gates:** remaining Space types and membership policy; realtime delivery; notification channels; files; events completion; approved care clients; controlled Agent integration through existing domain services; production qualification.

## Clarifications Needed

- Should checklist edits intentionally invalidate reviewed reminders, or should reminders bind to a narrower task revision?
- Is care work approved for web/Android exposure, and who owns the medical safety, legal and privacy review?
- Which roadmap stage should follow defect repair: moderation/data rights, remaining Space types, events clients, or realtime messaging?
- What production auth, notification provider, hosting, retention and encryption decisions are the accountable owners prepared to approve?
