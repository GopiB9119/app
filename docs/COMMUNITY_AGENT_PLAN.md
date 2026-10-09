# Community Agent: End-to-End Plan (Backend and Website)

Status: PROPOSED for the owner's review, 2026-10-06. Scope: backend and website. Android is paused on the owner's instruction
("don't touch Android first"). Inputs: the owner's two directives of 2026-10-06 (Master Product + UX + Agent + Engineering, and
Visual Design System), the owner's chat requests of 2026-10-05 and 2026-10-06, and an inspection of this repository on 2026-10-06.

**Owner scope/order update, 2026-10-07:** work on the backend and website only; do not work on Android. Finish outstanding
existing tasks before starting more capabilities from [new_features.md](new_features.md). The reminder-permission and manual
cancellation recovery milestone is now [verified and recorded](../README.md#privacy-permission-and-reminder-recovery-2026-10-07).
This does not mark all old tasks complete. Concurrent Agent memory/inbox/realtime work retains its separate ownership and
verification gates; a pinned backend/web release candidate and the privacy/operational decisions still precede launch.
No Android parity gate is part of this owner's current delivery scope, and no external integration or transaction is enabled by this update.

### Current Finish Plan (2026-10-08)

The owner's latest instruction is to finish ready work end to end without repeated continuation prompts. This is the execution
order for the existing backend/web capabilities, not approval of every historical proposal or a claim that all 47 roadmap items
are shipped. Keep the [feature-by-feature status](PRODUCT_RESEARCH_2026-10-07.md), [privacy gates](PRIVACY_READINESS.md) and
the [retained runtime activation record](../infra/README.md#agent-poll-runtime-activation-2026-10-08) alongside this matrix.
Owners below are responsibility assignments, not claims that staff have been hired.

| Gate | Responsible Role | Completion Check | Current State |
| --- | --- | --- | --- |
| F1: compatible local runtime | Backend/operations | Verified owned services, matching source/database contract, preserved data/key, readiness and retained recovery evidence | Migration 0062 and definition 7 activated; 884 existing rows and 12 Agent identities preserved at handoff. Recheck service availability after interruptions. |
| F2: offline regression closure | Engineering/QA | Reproduce each failure, preserve assertions, verify the affected slice, and bind final reports to captured inputs | Earlier component run: 814/821 passed; all seven failures were missing current-Space roster fixtures. Existing repair now passes all 19 realtime checks with unchanged watched inputs. Full combined qualification remains a separate gate. |
| F3: local user workflows | QA/backend/web | Actual browser/proxy/API/mail flows; permissions, exact retry, no duplicate effects, private history and 320 px doubled-text checks | Earlier activation journeys passed 3/3. Reconcile the newer broad-workflow reports before declaring the current finish pass complete. |
| F4: conversational AI and web lookup | Owner + backend/security | Approved provider/endpoint/model, private credentials, preserved usage ledger and bounded limits; explicit opt-in followed by a small synthetic live evaluation | Blocked: no model connection or AI/web-provider credentials are configured. Keep providers off; do not invent credentials, reset usage or relax approval/resource checks. |
| F5: external transactions and account integrations | Owner + integration/security | An implemented authorized connector, resource-specific consent, exact review, idempotency, receipt, reconciliation and revocation tests for each action | Not enabled. Model access alone cannot authorize purchases, bookings, transfers, external sends or another person's resources. |
| F6: public release | Owner + privacy/operations | Approved operator/privacy details, retention and provider terms, production security/recovery/monitoring, real-device/accessibility and explicit deployment approval | Blocked pending those decisions and evidence. Current synthetic local results are not production or real-user qualification; Android remains paused. |

Run F1-F3 autonomously, repair only reproducible in-scope defects, and keep concurrent work and failed/interrupted evidence intact.
Advance F4-F6 only when their dependencies are supplied; repeated requests to continue do not supply missing credentials or raise
limits. Do not repeatedly ask the same unavailable setup questions. Finish reports must name passed checks, failed or unrun gates,
captured-source differences, the reachable preview and the next concrete dependency. No unbounded background coding or evaluation
loop is part of this plan.

Current focused evidence: [19-case realtime JUnit](../.local/verify/end-to-end-20261008-XFbpro/realtime.xml) and
[watched input hashes](../.local/verify/end-to-end-20261008-XFbpro/realtime-inputs.json). The roster fixture handles only the
current Space's authenticated GET and verifies the account header; unexpected traffic assertions were not removed or filtered away.

## 0. How to read this plan

Every important statement carries one label.

| Label | Meaning |
| --- | --- |
| FACT | Checked in this repository or computed on 2026-10-06; the source is named. |
| OBSERVATION | Seen in real usage data in the local database. |
| KNOWLEDGE | General product, design or standards knowledge; not re-checked online in this session. |
| ASSUMPTION | Believed, not checked. Must be validated before it drives a big decision. |
| HYPOTHESIS | A testable claim with a metric. |
| DECISION | A proposed choice. "Owner" means the owner must confirm it. |

Research limits (FACT): this computer's network policy blocked docs.tinyfish.ai, bigbasket.com and youtube-nocookie.com in this
session, and w3.org and Apple's design site in earlier sessions. GitHub was reachable: the Lightpanda and WebMCP READMEs were read.
Competitor notes below are KNOWLEDGE, not fresh research. There are no user interviews yet, so personas are ASSUMPTIONS.
Evidence files: `.local/plan/inventory.txt` (repository inventory) and `.local/plan/contrast.txt` (contrast ratios).

## 1. Decisions the owner needs to make

Items marked ★ block the next phase.

| # | Decision | Recommendation | Why it matters |
| --- | --- | --- | --- |
| D1 ★ | Visual direction: keep the current iOS-style blue tokens, or adopt the "Peacock" palette (section 9) | Adopt Peacock: teal action color, warm stone neutrals, clay community accent | The website redesign another session is doing right now uses iOS blue (#0068d6); the directive asks for a distinct, non-default-blue brand. |
| D2 ★ | Agent model and budget | Use gpt-5-mini for answers and keep gpt-5-nano for quick routing; raise the total budget from 2M to 10M tokens and the per-call limit from 10,000 to 24,000 | The smallest model at low reasoning effort is the main cause of misunderstanding (section 3.3). 1.12M of the 2M budget is used (FACT, usage ledger). |
| D3 | Help requests and offers | Add "Request" and "Offer" as kinds of public posts, with a need-by date, area and status; inside Spaces keep using tasks | The directive's core community loop (need help, get matched, outcome) does not exist yet. |
| D4 | Public events | Let public pages publish events (today every event belongs to a private Space) | The directive needs a full event lifecycle for communities. |
| D5 | Quick-commerce (BigBasket first) | Start read-only: find products and prices, compare, build a cart list with links; the person buys in the store's own app. One script per store. No automatic buying. | Store terms, account security and money risk. |
| D6 | Trust signals | Show facts only: email verified, member since, role (owner, admin, moderator, organizer), new member, requests helped. No reputation score. | The directive forbids fake authority and unfair newcomer penalties. |
| D7 | Development browser policy | Allow the YouTube embed domains and docs.tinyfish.ai in the VS Code network policy, or test in Chrome or Edge | Videos cannot play in the VS Code browser (FACT: blocked by policy); TinyFish API details can't be read. |

Already decided by the owner (FACT, chat 2026-10-06): no automatic reminders for tasks and events; Android work waits.

### Poll contract and privacy checkpoint (2026-10-07)

FACT: the owner's [feature brief](new_features.md) requests Space/group coordination and `space.poll.create`. Current code has
two separately evolving contracts: standalone [Space polls](../backend/app/modules/polls/schemas.py), with 2-6 labelled options,
and [event poll schemas](../backend/app/modules/events/schemas.py), with an event ID, option text, 2-8 choices and different vote
review/withdrawal fields. They are not interchangeable merely because both are called polls. The design document remains a
proposal, and this checkpoint does not silently approve or merge either contract. Existing work and tests are preserved.

The implementation-independent privacy requirement is that membership must not reveal pre-admission private history. This batch
reproduced standalone poll IDs/activity reaching members who could not read the poll and fixed only the hint audience predicate.
It also verified the concurrently implemented admission-bound cursor and corrected a frozen-clock ordering fixture while adding
explicit tie-pagination coverage. [Commands, captured results and limitations](../README.md#poll-admission-privacy-2026-10-07)
record 10/10 backend poll tests, 24/24 existing live-client checks, web types and scoped Ruff; these are not poll-screen or launch qualification.

Before combining the user-facing flows, record the chosen placement (Space-level, event-linked, or both with clearly distinct
resources), who may close a poll early, and whether result visibility is counts-only or includes voter identities and when results
are shown. Current standalone behavior allows one changeable vote, separate withdrawal and close by the same-admission creator
or a current owner/admin; it exposes counts and the requester's choice rather than voter lists. These are implementation facts,
not newly approved product policies. Reconcile choice/length limits and response shapes before wiring one UI to the other API.
Do not bypass existing authorization or restore missing governance documents to resolve this conflict.

Event-poll implementation follow-up: another workstream added the event-linked backend and web controls. This continuation
repaired two concrete recovery defects in that existing view, without deciding how it should be combined with standalone Space
polls: stale unsubmitted closure reviews are invalidated on confirmed snapshot changes, and unknown-action details remain hidden
when the current list no longer contains their target. Original uncertain requests remain available for exact reconciliation;
drafts and unchanged reviews survive refresh. [Fixed-source evidence](../README.md#event-poll-review-recovery-2026-10-07) records
65 Events browser tests, 26 client tests, types and three backend contract tests, including zero-write refresh and mobile checks.
This is not a new poll-placement or privacy-policy decision, nor a live release claim. The retained runtime's exact database/mail
containers were found absent; no data recreation, key replacement or shared migration was attempted to bypass that gate.

## 2. Coordination with work already in progress

FACT (file times on 2026-10-06 between 10:19 and 10:33):

- One chat session is redesigning the whole website in an "iOS style": `web/src/components/ui/*` (11 files), the app chrome,
  `globals.css`, about 20 screens, and the design tokens (now primary #0068d6, background #f2f2f7, system font stack).
- Another chat session is changing the Agent's web reading and progress display: `backend/app/modules/agents/{web,toolkit,prompts,runtime}.py`,
  their tests, `agent-screen.tsx` and `agents.module.css` (prompt version 10 became 11 at 10:28).

Working rules (DECISION):

1. One design authority: the semantic tokens in section 9.O, kept in `packages/design-tokens/tokens.json` (the existing single
   source, DEC-013) and generated into CSS. Screens use tokens only; no colors typed by hand.
2. One owner per file at a time. Check file times before editing; never overwrite another session's work.
3. Ship small slices that pass their tests. No big-bang rewrite.

## 3. What exists today

### 3.1 Inventory (FACT, `.local/plan/inventory.txt`)

| Area | Today |
| --- | --- |
| Backend | FastAPI, SQLAlchemy 2, Alembic, PostgreSQL. 16 modules: agents, care, community, discovery, events, files, identity, integrations (empty), messaging, notifications, planning, platform, realtime, safety, scheduling, spaces. 82 tables. 52 migrations, head 0053. |
| API | 215 operations, 181 paths, 334 schemas in `packages/openapi/openapi.json`. Largest groups: Public community 58, Spaces 24, Notifications 20, Events 15, Messaging 11, Agent 10. |
| Workers | identity mail, reminders, exports, account deletion (Docker Compose). |
| Website | Next.js 16.2.3, React 19.2.4, TanStack Query 5, Zod 3, react-hook-form, Radix primitives, lucide icons. 29 pages, 17 feature folders, about 22,600 lines of TypeScript and CSS. Same-origin BFF proxy with CSP. English, Telugu and Hindi. |
| Design system | `tokens.json`: 17 colors, 4px spacing unit, radii 12/16/96, touch targets 44 (web) and 48 (Android). New UI kit: alert, badge, button, card, dropdown-menu, item, section, skeleton, textarea, tooltip. |
| Agent | LLM ReAct runtime on Azure gpt-5-nano (reasoning effort low, 10,000 tokens per call, 2M-token ledger). Main Agent (public community, web, own memories, buttons to Space chats) and one agent per Space (tasks, events, reminders, documents, members). Every change needs approval unless the person turns on auto-approve; public content always asks. Space chat answers are private by default (DEC-061). Web search and page reading through TinyFish (20 lookups per person per day). Limits: 12 steps, 30 tool calls, 2 research helpers per run. |
| Tests | Backend: 60 files, 629 test functions. Web: 62 files, 672 cases, 8 of them live end-to-end files. |
| CI/CD | None (no `.github/workflows`). Local `scripts/verify.ps1`. |
| Deployment | Local Docker Compose only. |
| Observability | JSON request logs with request, trace and span IDs; `/metrics` with work-queue gauges; the token ledger. No trace viewer. |
| Analytics | None. |

#### Model budget reliability follow-up (2026-10-06)

FACT: on `7d94559` plus this follow-up, the existing token ledger allowed separate clients and processes to reserve beyond the shared budget because unfinished calls were counted only in each Python instance. A new regression reproduced this before the fix. `backend/app/modules/agents/llm.py` now serializes durable reservations with Python's built-in SQLite while preserving existing JSONL usage records; usage is flushed before a reservation is released. Invalid settlements and storage failures cannot free reserved tokens. This changes accounting, not the model or approved budget amounts.

Evidence: from `backend`, `PYTHONPATH=. ../.local/agent-venv/bin/pytest --noconftest -q tests/test_agent_llm.py` passed **21/21**, including four independent worker processes, settlement, older usage logs, process exits and timed-out provider retries. Scoped Ruff and editor checks passed. These are local tests with synthetic provider responses, not live model-quality or whole-application qualification; no provider request, key change or budget increase was made.

Unfinished reservations deliberately remain charged after a process exits. Reconciliation needs known provider usage, not an automatic budget reset on restart. All model workers must use the updated code and the same local ledger directory for shared accounting.

#### Runtime access revalidation follow-up (2026-10-07)

FACT: on `7d94559` plus the current working changes, queued and completed model turns checked worker ownership without consistently rechecking the requester's current access. Three of the original four regression cases failed: revoked sessions still reached the model or accepted its answer, and an agent-off change during the call still allowed the answer to be saved. The runtime and research helper now reuse the existing session, admission and switch checks before sending context and before accepting model results, including errors. This does not grant new tools, change approval policy or recall requests already sent to a provider.

Evidence: a disposable `postgres:17-alpine` instance from the local cache at `127.0.0.1:55433`, synthetic `community_test` database, a separate migrated schema per pytest session, and scripted provider responses. From `backend`, with `COMMUNITY_ENVIRONMENT=test`, `COMMUNITY_DATABASE_URL` pointing only to that disposable database, the model URL/name/key empty, and `PYTHONPATH=.`:

- `../.local/agent-venv/bin/pytest -q tests/test_agent_runtime.py -k model_turns_recheck_access`: **48/48 passed**, including Main/Space sessions, member removal, switch-off, queued requests, research boundaries and late text/tool/error responses. No late text, approvals or tasks are retained by these cases.
- `../.local/agent-venv/bin/pytest -q tests/test_agent_*.py tests/test_space_agent_switch.py`: **251 passed, 1 failed**. The unchanged Main Agent downgrade test expects schema `0053` after rollback; current migrations leave `0057`. The test and migrations match HEAD and were not modified or skipped. This run is not an all-green qualification claim.
- Scoped Ruff and editor checks passed after import formatting in the two touched Python files. Existing Starlette and Alembic deprecation warnings remain.
- `node scripts/records-check.mjs` fails on four record files already deleted by HEAD compared with its parent: TASKS, DECISIONS, BUILD_STATUS and EVALUATIONS. A separate check using the same exported `compare`/`KINDS` API confirms current edits preserve the records present in HEAD. No missing document was restored.

No live model or web-provider call, budget increase, saved environment-file change, shared database migration/reset or client change was made by this follow-up. Other worktree edits remain outside its verification claim.

#### Late-result and approval-boundary follow-up (2026-10-07)

FACT: the next local regression pass found late tool text/source references still being saved after access ended (6/8 cases failed), results accepted at the active deadline (7/8 failed), and stale prepared actions reaching manual or automatic approval (4/6 failed). Tool-result persistence and approval preparation now use the same current-access guard as model turns, and that guard also enforces the active deadline. Attempted web requests remain charged; no already-sent provider request is claimed to be recalled. The rejected-downgrade test preserves its original revision/data checks without assuming that `0053` is forever the schema head.

Verification used the disposable `event-agent-work-20261007` PostgreSQL instance at `127.0.0.1:55433`, synthetic `community_test`, and isolated migration schemas; provider settings were empty and all provider responses scripted. From `backend`, the three focused selections `-k late_tool_results`, `-k at_the_run_deadline` and `-k prepared_actions_recheck` pass **8/8**, **8/8** and **6/6** respectively, and `tests/test_agent_kinds.py -k lossy_downgrade` passes **1/1**.

The initial complete command `pytest -q --tb=short --show-capture=no tests/test_agent_*.py tests/test_space_agent_switch.py` passed **287/287**, but backend source changed while it ran. It was followed by a fixed capture at `/tmp/event-agent-qualification-AtUz6c`: 242 backend source/config/test files, excluding environment files, local data and virtualenvs, with a SHA-256 manifest. Running the same selection using the existing local agent virtualenv and `--junitxml=/tmp/event-agent-qualification-AtUz6c/agent-tests.xml` passed **287/287** in 456.44 seconds. The XML has zero failures/errors/skips; all captured hashes remained unchanged and all captured backend files matched the shared workspace at the final comparison. This qualifies that backend agent slice, not all application or live model behavior. It includes the concurrent batch/nested-call limit and empty-answer repairs; their implementation is not attributed to this follow-up.

`node --test scripts/agent-golden.test.mjs` passes **47/47**, and `npm run golden` validates **41 cases in 39 threads** without sending requests. Scoped Ruff, editor and whitespace checks pass. Existing dependency deprecation warnings and historical record deletions remain separately documented. No deployment, provider request, spending-limit increase, saved environment-file edit or shared-service reset was performed.

#### Task-and-reminder tool follow-up (2026-10-07)

FACT: task listing previously filtered only the first 150 tasks, could say there were no more results while pages remained, and returned up to 30 rows that the runtime could cut mid-JSON before the model saw them. The new regression checks reproduced both failures. Task results now carry `more`, `next_cursor` and the applied filters; smaller domain pages keep complete results within a 3,000-character budget, below the runtime's tool-text limit, without advancing past omitted rows. Each call still performs a bounded scan; an incomplete empty result is not proof that no matching task exists. The model is instructed to continue with the same filters.

The tool also accepts validated inclusive `due_from`/`due_to` dates and delegates date, completed-status and explicit-assignee filtering to the existing authorized task service before paging. Unassigned shared tasks remain included by default; in-progress tasks remain open. Real API checks cover inclusive boundaries, undated/out-of-range exclusion, exact cursor continuation, evidence coverage, and rejection of cursors from another Space or date filter. No HTTP API or database schema changed.

A separate regression reproduced a reminder proposal for a task in another Space the person could access. Both proposal preparation and execution now use the existing Space-scoped task lookup. The positive same-Space approval flow and rejection of a valid older foreign-Space payload are covered; no approval policy changed.

Verification used the disposable `event-agent-tools-20261007` PostgreSQL instance at `127.0.0.1:55433`, synthetic `community_test` schemas, empty provider settings and scripted responses. From `backend`, `pytest -q tests/test_agent_runtime.py -k 'reminder_execution_rechecks or reminder_tool_only or task_listing'` passes **17/17**. A fixed 242-file capture at `/tmp/event-agent-tools-qualification-6rhHPd`, excluding environment files and local data, passes **304/304** with `tests/test_agent_*.py tests/test_space_agent_switch.py` in 667.00 seconds. Archived `agent-tests.xml` reports zero failures/errors/skips; the SHA-256 manifest is unchanged and the captured backend files match the shared workspace at final comparison.

Scoped Ruff, editor and whitespace checks pass. `node --test scripts/agent-golden.test.mjs` passes **47/47**; `npm run golden` validates **41 requests in 39 threads** without sending them. These checks verify backend/tool behavior, not live model reasoning or full product qualification. Existing dependency deprecation warnings remain. No provider request, budget increase, saved environment-file change, shared-service reset or client edit was made by this follow-up.

#### Scoped reminder-list follow-up (2026-10-07)

FACT: the agent previously read only the first 50 account-wide reminders, filtered them for its Space and returned no continuation metadata. It could therefore report an empty list even when later pages contained matching reminders. The failing offline regression reproduced the missing `more` field. The tool now uses the same bounded whole-result approach as task listing: at most three candidate pages per call, smaller pages when necessary to fit the 3,000-character result budget, explicit `more`/`next_cursor`, and evidence only for the returned complete rows.

The owning reminder service now has an optional keyword-only Space filter used by the agent. It checks current membership and applies the Space predicate before fetching rows; existing per-account, admission and task visibility checks remain. New scoped cursors include the Space alongside their account/task/kind/expiry binding. Other accounts, other Spaces and unscoped callers cannot reuse a scoped cursor. Old unscoped tokens without a Space field still work; HTTP route parameters and the database schema are unchanged. The agent excludes cancelled, suppressed, expired and failed reminders as before, retaining scheduled and available ones.

Focused regressions use synthetic data for exact pagination, long quoted titles, the model's actual tool-message encoder, local time/timezone, account/Space denial, legacy cursors and expiry. A real test-API request with a scripted model follows successive reminder cursors, returns only its selected Space's reminders, records matching evidence and creates no approval or reminder.

Qualification used a disposable `event-agent-reminders-20261007` PostgreSQL container at `127.0.0.1:55433`, the synthetic `community_test` database and isolated migration schemas. A fixed source/contract capture at `/tmp/event-agent-reminder-qualification-VPrbVs` contains 244 files, excluding keys, environment files and live data. With model/web-provider settings empty and the existing agent virtualenv, `pytest -q --junitxml=/tmp/event-agent-reminder-qualification-VPrbVs/tests.xml tests/test_agent_*.py tests/test_space_agent_switch.py tests/test_reminder_delivery_guards.py tests/test_reminder_dispatch_fairness.py tests/test_reminder_series.py tests/test_openapi.py` passes **424/424** in 476.49 seconds. Parsed JUnit has zero failures/errors/skips; all captured hashes stayed unchanged and match the shared inputs at final comparison.

Scoped Ruff and editor checks pass after mechanical import formatting. `npm run test:golden` passes **69/69**; `npm run golden` validates **47 requests in 45 threads** without sending them. Existing dependency deprecation warnings remain. This verifies the affected backend/tool behavior, not live model quality or a full release. The separately running synthetic API uses its prior captured backend and was not restarted, reconfigured or silently updated; shared data, providers and the preserved environment file were untouched.

#### Task outcome integrity follow-up (2026-10-07)

FACT: the existing task client validated response shapes and ETags but did not correlate every returned task with the
requested task and Space. A well-formed wrong-target response could close a review or replace an edit's basis. Task pages
also accepted another Space's rows, duplicate IDs, oversized responses and non-progressing continuation. A failed list read
hid rows but retained its cached Load more control. This is a defect in an existing workflow, not approval of a new feature.

User job and acceptance: a member creates, edits or completes the intended private task, knows whether the result was
confirmed, and can retry an uncertain response without a duplicate effect or a changed target. The falsifiable hypothesis
was that schema-valid mismatches would be accepted as success. Nine initial client cases and two browser cases reproduced
it; three additional same-task/wrong-Space client checks reproduced a review finding. Existing tests covered malformed
records and connection failures but did not cover these well-formed identity mismatches.

The [task client](../web/src/features/planning/client.ts) now validates the task ID and any known Space, with UUID case
equivalence, and validates page scope, uniqueness, the requested 20-row limit and cursor progress. The
[task screen](../web/src/features/planning/task-screen.tsx) passes its Space into reads/writes and hides stale pagination on
read errors. Unconfirmed writes preserve the original body, key and If-Match value. The optional Space argument keeps
reminder lookups compatible. A delayed idempotent replay may legitimately return a newer title or status; the guards do
not mistake that current state for a failed write. Rejecting a response does not imply that its server-side write rolled back.

The existing backend already rechecks current task grants, membership/admission and operation authority before returning a
command receipt. Five new [authorization regressions](../backend/tests/test_task_authorization.py) verify revoked grants
for owner/member edit and status retries, and a former assignee's status retry after reopening and reassignment. They assert
no extra task version, audit or command effect. No backend permission, HTTP contract, database schema or migration changed.

Fresh verification, all with synthetic data and no provider request:

| Check | Result | Evidence |
| --- | --- | --- |
| Task service, authorization and priority/filter API tests | 73/73, no failures/errors/skips | [Fixed 242-input backend capture](../.local/verify/task-integrity-backend-frozen-20261007-cGvNVR/summary.json), [JUnit](../.local/verify/task-integrity-backend-frozen-20261007-cGvNVR/tasks.xml) |
| Task/shared/reminder client and BFF tests | 94/94, no failures/errors/skips | [Client log](../.local/verify/task-integrity-web-20261007-8o2JU3/client.log), [JUnit](../.local/verify/task-integrity-web-20261007-8o2JU3/client.xml) |
| Complete current task browser file | 51/51, no failures/errors/skips | [Final 193-input web capture](../.local/verify/task-integrity-final-20261007-5A38DS/summary.json), [JUnit](../.local/verify/task-integrity-final-20261007-5A38DS/planning-browser.xml) |
| Localized task/checklist/calendar browser tests | 20/20, no failures/errors/skips | [Final follow-up](../.local/verify/task-integrity-final-20261007-5A38DS/follow-up-summary.json), [JUnit](../.local/verify/task-integrity-final-20261007-5A38DS/localized-browser.xml) |

Backend execution used `pytest -q --tb=short --show-capture=no tests/test_tasks.py tests/test_task_authorization.py
tests/test_task_priority_filters.py` from the captured backend, using the existing local agent virtualenv, test environment,
empty model/web provider settings and a separate migrated schema in the owned disposable PostgreSQL `community_test`.
Client execution used `node --test --test-concurrency=1 tests/tasks-priority-filters-client.test.mjs
tests/web-client.test.mjs tests/scheduling-client.test.mjs`. Browser execution used the installed Chromium headless shell,
`node --test --test-concurrency=1` and the two browser files listed above. Reports retain the exact commands and JUnit files.
Final `tsc --noEmit`, scoped Ruff, Pylance syntax/editor diagnostics and changed-file whitespace checks pass.

The final web capture and its matching shared inputs stayed unchanged during both the task-browser run and localized/type
follow-up. The fixed backend capture also stayed unchanged and matched the workspace at comparison. An earlier 73-pass
backend run had three concurrent source changes; an earlier 94-client/71-browser/type run had a changed task fixture.
Those reports remain retained under `.local/verify/task-integrity-backend-20261007-FTmtmu` and
`.local/verify/task-integrity-web-20261007-8o2JU3`. Intermediate captures and repeated tests are not added into a larger
coverage total. Concurrent status/date-filter, search-opened-task and Space-list recovery implementations are included
in the final qualification but are not attributed to this work item's identity/pagination fixes.

The sixteen new response-recovery cases cover 1280 px and 320 px. The final mobile checks double measured rendered font
sizes, assert the retry control's actual size, keyboard focus, pointer hit testing, 44 px targets and no horizontal overflow.
Initial root-font-only checks were insufficient to prove controls styled in pixels were doubled and were strengthened.
[Mobile retry](../.local/verify/task-integrity-final-20261007-5A38DS/capture/.local/screenshots/task-integrity-status-space-320.png)
and the other retained captures were inspected. This is not a manual screen-reader audit or real-user usability evidence.

The owned `event-task-integrity-20261007-2900` test container was checked for its synthetic ownership labels and original
loopback binding, removed, and confirmed absent ([cleanup](../.local/verify/task-integrity-final-20261007-5A38DS/cleanup.json)).
Shared API/preview/mail services, saved environment files, keys and data were not changed. No new analytics collection,
agent permission, provider budget, live model evaluation, Android implementation, deployment, commit or push was performed.
The next release gate remains a single pinned whole-product candidate with live signed-in/API, operational and security
qualification; missing authoritative backlog records still require an owner-approved recovery decision, not silent restoration.

#### Shared-cost Space Agent delivery (2026-10-07)

Authority: the owner's explicit current implementation request in [new_features.md](new_features.md), sections 7, 14-16 and 31.
This implements one bounded part of that request, not all 47 capabilities. The [operating plan and complete request map](PRODUCT_RESEARCH_2026-10-07.md#18-company-operating-plan-and-space-agent-delivery)
separate current implementation, future work, staffing proposals and external/privacy dependencies. No missing historical governance file was restored.

User job: inspect an event's authorized budget inside its Space and prepare the requested cost-sharing plan for an exact review.
The initial offline regressions reproduced the missing read and split tools. The [toolkit](../backend/app/modules/agents/toolkit.py) now provides:

- `get_event_budget`: summary and version-checked pages of categories, expenses, permitted contributions and permitted shares.
  Complete JSON results stay within the existing tool-text budget. Continuation rechecks current event access and the requester's view;
  Main, another Space (even when the requester belongs to both), and later event admissions are denied.
- `set_event_split`: the existing equal, percentage and fixed-amount domain rules with an explicit planned/recorded basis and exact
  integer minor-unit allocation. Only the event organizer or Space owner can prepare/save it. `always_ask` prevents automatic approval.
  Every participant and rounded amount remains visible, along with any unallocated difference and the audience.
- Execution locks the event, compares the reviewed budget snapshot as well as the edit ETag, and uses the approval transaction's
  connection/savepoint. Expense changes do not update that ETag, so the snapshot check is necessary. Stale spending, unavailable
  participants and cancelled events cannot silently change the plan the person reviewed. Failed approval persistence rolls back the split.

These are self-reported planning records, not verified payments, debts or settlement instructions. An expense recorder is not necessarily
its payer. Ordinary members receive only their permitted contribution records and own share; organizer/owner authority does not grant
access to another Space or private external account. No payment, contribution mutation or vendor call is made by either tool.

[Space definition version 6](../backend/app/modules/agents/registry.py) explicitly lists both tools; the Main Agent definition is unchanged.
[Migration 0058](../backend/migrations/versions/0058_agent_event_budgets.py) advances existing version-5 bindings without replacing identities
or rewriting recorded run history, and supports downgrade. Prompt version is `agent-react-2026-10-07-15`.
Upgrade a separately approved runtime/database together before using these tools; **this work did not migrate the shared backend**.
The HTTP schema is unchanged. The privacy data map now describes the permitted budget data that can reach a configured model/run history.

A 23-participant regression found that one approval field per person exceeded the web client's ten-field limit. The tool now returns
eight fields including the complete numbered Shares value, without widening the client contract. A browser regression then reproduced
collapsed line breaks. The [approval renderer](../web/src/features/agents/agent-screen.tsx) preserves and wraps multiline values.
Existing public-action reviews still pass. Six new [browser cases](../tests/unit/agents-ui.test.mjs) verify a 12-person private review,
Approve/Reject, lost-response retry, original key/If-Match, one effect, Main isolation, 1280 px and 320 px with measured doubled text,
keyboard focus, pointer hit testing, 44 px targets and no horizontal overflow.

Fresh verification used empty model/web-provider settings, scripted model responses and an owned loopback-only PostgreSQL 17 container
with a synthetic `community_test` database and a separate migrated schema per test session:

| Check | Result | Evidence / limits |
| --- | --- | --- |
| Budget-focused API/tool/registry checks | 50/50 | Main/Space/admission/privacy, paging, exact amounts, automatic-mode review, rejection, stale basis, rollback and retries; includes existing registry invariant |
| Complete affected backend selection | 414/414 | [JUnit](../.local/verify/space-costs-web-20261007-LOrwYy/backend-tests.xml), [244-input manifest](../.local/verify/space-costs-web-20261007-LOrwYy/inputs.sha256) |
| Final current registry/migration file | 23/23 | [JUnit](../.local/verify/space-costs-web-20261007-LOrwYy/registry-final.xml); after mechanical import formatting only |
| Complete affected agent client/browser suites | 79/79 | [JUnit](../.local/verify/space-costs-web-20261007-LOrwYy/tests.xml), [web source/asset hashes](../.local/verify/space-costs-web-20261007-LOrwYy/web-inputs.sha256); unchanged during tests/types |
| Golden/supervisor self-tests | 105/105 | `node --test scripts/agent-golden.test.mjs scripts/work-cycle.test.mjs`; no new supervisor or evaluator implementation claimed |
| Golden inventory | 47 requests / 45 threads valid | `npm run golden`; **nothing sent**, no live model-quality score |
| Static and editor checks | Passed | Scoped Ruff, web `tsc --noEmit`, Pylance syntax, editor and whitespace checks |

From `backend`, with test environment/DB and provider settings explicitly empty:

```sh
PYTHONPATH=. ../.local/agent-venv/bin/pytest -q --tb=short --show-capture=no \
  tests/test_agent_*.py tests/test_space_agent_switch.py tests/test_event_budgets.py \
  tests/test_event_contributions.py tests/test_event_budget_splits.py tests/test_migrations.py tests/test_openapi.py
```

The full run used fixed capture `/tmp/event-space-costs-4Gzqci` and the same installed interpreter by absolute path; no dependency,
environment file, key or local database was copied. Its hashes remained unchanged. At final comparison all 244 captured inputs matched
the workspace except import ordering in the registry test file, separately requalified above. Parsed backend/web JUnit reports contain
zero failures/errors/skips. Counts overlap and must not be added into a larger unique coverage claim. Existing dependency deprecation
warnings remain; this is not a whole-product, live-model, legal, production or Android qualification.

From the application root:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 \
  tests/agents-client.test.mjs tests/unit/agents-ui.test.mjs
npm --prefix web run typecheck
node --test scripts/agent-golden.test.mjs scripts/work-cycle.test.mjs
npm run golden
npm run work:cycle -- --status
```

The [desktop review](../.local/screenshots/agent-split-review-1280-approve.png) and
[320 px doubled-text review](../.local/screenshots/agent-split-review-320-retry.png) were inspected after the line-break fix.
Browser APIs were synthetic/intercepted and unexpected outbound calls were rejected. Local evidence under `.local` is not committed;
another checkout must rerun these commands. Native-language/screen-reader review and real-user testing remain separate gates.

Cleanup confirmed the owned `event-space-budget-20261007-6f348466` test container and anonymous volume removed, without resetting shared
data. The web preview was initially absent, then another session acquired port 3000; this session's duplicate launch failed with
`EADDRINUSE` and its terminal was closed. The existing `http://127.0.0.1:3000/app/agent` subsequently returned HTTP 200 and was left intact.
That page response does not prove its separate backend has migration 0058 or a configured/qualified model. No live agent request was sent.
Supervisor status showed no active lock or stop request; its earlier `changed` report was retained, not relabelled as passed.
No coding daemon, live provider connection, spending increase, Android change, deployment, commit or push was performed.

#### Agent task inbox and memory controls (2026-10-07)

Authority: the owner's implementation request and continuation for the Agent Task Inbox and memory controls in
[new_features.md](new_features.md), sections 24-25 and roadmap items 27-28, 40 and 43. These are local backend/web features,
not approval of external accounts, purchases, recurring execution or a production rollout.

The [Agent task inbox](../web/src/app/app/agent/tasks/page.tsx) at `/app/agent/tasks` selects a current Space and lists only the
signed-in requester's runs, never other members' private Agent conversations. Filters cover all, working, needs approval,
needs an answer, completed, failed and cancelled requests. There is no Scheduled tab: persistent request history is not a scheduler.
Existing exact review, answer, rejection and cancellation controls are reused; failed reads hide cached actions and pagination.
Links are available from Main Agent and Space chat. The Main Agent still cannot access private Space data through its tools.

The [list service](../backend/app/modules/agents/service.py) applies the effective status before pagination, including expired
approvals, interrupted work and the Space's agent-off state. Cursors bind account, Space, admission and filter. The
[client](../web/src/features/agents/client.ts) checks scope/kind/status, duplicate IDs, row bounds and cursor progress before
using a response. Unknown approval outcomes retain the original reviewed request and retry key.

In Agent > Memories, the owner can edit a note, disable future retrieval, re-enable it or delete it. Disabled memories remain
manageable but are excluded from fresh model context counts and memory-tool results. Existing Main/Space note scope and owner-only
visibility remain unchanged; this does not create a shared household memory store. The editor includes draft English/Telugu/Hindi
labels and explicitly says that disabling/deleting does not erase earlier conversations or data already sent to providers.

`PATCH /v1/agent-memories/{memory_id}` requires the signed-in owner, `If-Match` and `Idempotency-Key`. Edits are versioned, and durable
receipts prevent an old retry from replacing a later edit or re-enabling a disabled memory. Exact retries return current state without
reapplying the change. Stale versions, cross-account access, malformed values and prohibited secret-like content are rejected.
Deletion cascades the memory's edit receipts. The web validates returned identity, Space, kind/key and version; an uncertain reply keeps
the original retry available even after closing the dialog, while a conflict requires a fresh review. Older-server lists stay readable,
but edits need the new version/ETag metadata.

[Migration 0059](../backend/migrations/versions/0059_agent_memory_controls.py) adds enabled/version fields and command receipts.
It refuses downgrade when doing so would re-enable disabled memories or discard receipts. Upgrade an approved runtime and database
together before using the new API; the shared runtime/database was not migrated here. The generated [OpenAPI contract](../packages/openapi/openapi.json)
includes the memory operation and inbox filter; its compatibility with the concurrent Space-list change was tested separately.

The paused web report was **243/247 passed, four failures**, not an all-green gate. Three narrow-screen reading-area failures came from
the newly added full-text inbox toolbar link. A labeled icon link recovered the reading area without changing the assertions.
The fourth test expected an obsolete immediate-erasure message; it now requires the accurate retrieval/history/provider distinction
and additionally verifies focus returns after both Keep and Escape. The original [failed report](../.local/verify/agent-controls-20261007-IAqzoo/web-tests.xml)
and its [input hashes](../.local/verify/agent-controls-20261007-IAqzoo/web-inputs.sha256) remain retained.

| Fresh check | Result | Evidence and limits |
| --- | --- | --- |
| Affected backend: agents, switch, deletion, export, migrations, OpenAPI | 433/433 | [JUnit](../.local/verify/agent-controls-20261007-IAqzoo/backend-tests.xml), [245-input manifest](../.local/verify/agent-controls-20261007-IAqzoo/backend-inputs.sha256); fixed `/tmp/event-agent-controls-UTGmLz` |
| Agent/messaging/privacy/localization web selection | 207/207 | [JUnit](../.local/verify/agent-controls-final-20261007-59fchv/web-tests.xml), [watched inputs](../.local/verify/agent-controls-final-20261007-59fchv/web-inputs.sha256); types passed and hashes matched at completion |
| Original shared client/proxy file | 60/60 | [JUnit](../.local/verify/agent-controls-final-20261007-59fchv/web-client-tests.xml); accounts for the original report's tests absent from the newer selection |
| Concurrent Space-list/API integration | 37/37 | [JUnit](../.local/verify/agent-controls-final-20261007-59fchv/backend-integration.xml), [unchanged inputs](../.local/verify/agent-controls-final-20261007-59fchv/backend-integration-inputs.sha256); fixed `/tmp/event-agent-controls-followup-lq0ETK` |
| Final inbox and memory browser workflows | 20/20 | [JUnit](../.local/verify/agent-controls-final-20261007-59fchv/current-boundary-web.xml); current Space client and web types passed |
| Static checks | Passed | Scoped Ruff, TypeScript, editor diagnostics and whitespace checks |

The full backend capture stayed unchanged during its run. A later source comparison found another workstream's Space member-count
addition in its schema/service/test and OpenAPI output. The 37-case follow-up qualifies that adjacent API integration without attributing
its implementation to this milestone. Later reminder/Space UI edits likewise remain other workstreams; the 20-case browser follow-up
checks the memory/inbox boundary on the integrated client. These are scoped results, not a frozen whole-product candidate; overlapping
counts must not be added into a larger coverage total. Existing Starlette, Alembic and SQLAlchemy deprecation warnings remain.

Reproduce the full backend selection from `backend`, using an owned synthetic PostgreSQL `community_test` database, the test environment,
empty model/web-provider settings and the installed test interpreter:

```sh
PYTHONPATH=. ../.local/agent-venv/bin/pytest -x -q --tb=short --show-capture=no \
  tests/test_agent_*.py tests/test_space_agent_switch.py tests/test_account_deletion.py \
  tests/test_exports.py tests/test_migrations.py tests/test_openapi.py
```

Reproduce the web qualification from the application root with an installed compatible Chromium:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 \
  tests/agents-client.test.mjs tests/i18n-client.test.mjs tests/messaging-agent-client.test.mjs \
  tests/text-limits-client.test.mjs tests/unit/agents-ui.test.mjs tests/unit/messaging-ui.test.mjs \
  tests/unit/privacy-ui.test.mjs tests/unit/i18n-account-ui.test.mjs
node --test tests/web-client.test.mjs
npm --prefix web run typecheck
```

Inspected captures include the [memory editor](../.local/screenshots/agent-memory-320-edit.png),
[Telugu](../.local/screenshots/agent-memory-te-320.png), [Hindi](../.local/screenshots/agent-memory-hi-320.png),
[inbox](../.local/screenshots/agent-inbox-320.png) and [repaired reading/composer area](../.local/screenshots/agent-workspace-320-large-text.png).
Checks include 320 px measured doubled text, keyboard/focus, reachable controls, unchanged retry intent, no duplicate effect and no
unexpected outbound browser calls. Synthetic screenshots and script checks do not replace native-language or screen-reader review.
All backend model responses were scripted; no provider request, real customer data or live-model quality score is claimed.

After the final checks, the `event-agent-inbox-6f348466` container's owner and synthetic-test labels were checked, then that container
and its anonymous volume were removed and confirmed absent. Other databases, mailboxes and test workstreams were left untouched.

The existing preview subsequently returned HTTP 200 at `http://127.0.0.1:3000/app/agent/tasks`. Another session acquired that port after
the availability probe; the duplicate launch failed with `EADDRINUSE` and only its own terminal was closed. The shared preview was
not replaced. A served page does not prove its separate API is migrated or its model configured. No saved environment file, provider
budget, Android implementation, deployment, commit or push was changed. Historical governance documents remain missing and were not restored.

Activation follow-up: the retained synthetic runtime was subsequently upgraded from `0057` to `0059` after backup/restore rehearsal
and continuity checks. The [runtime activation record](../infra/README.md#agent-controls-activation-2026-10-07) supersedes only the
earlier "not migrated" runtime status, not its recorded qualification limits. Two live browser/API/mail/database journeys now pass
with clearly seeded synthetic memories/history and no provider calls; a separate upgrade regression preserves sessions and approvals.
Existing data, key and retained containers were kept. No automatic purchases, external integration or live-model evaluation was enabled.

#### Agent response confirmation and Stop recovery (2026-10-07)

Continuation started from the retained [seven-case response-binding failure](../.local/verify/agent-binding-saved-cases-ACW1H8/browser.log).
That report had four passes and three failures. Current source already preserved the original answer command after an unconfirmed
response, and its earlier failing cases passed unchanged when rerun. A newer case reproduced the remaining defect: after a mismatched
Stop response, a background read advanced the run to approval and removed both the failure message and the only Stop retry.

The [request view](../web/src/features/agents/agent-screen.tsx) now retains the Stop failure independently of current run status and
offers the same cancellation retry when no progress/question control remains. The existing client continues to bind returned runs
to the intended identity/scope and rejects inconsistent approval ownership. Those surrounding client/answer fixes were preserved
and qualified, not replaced or attributed to this narrow UI repair.

The [browser regression](../tests/unit/agents-ui.test.mjs) now checks approval and completed-state transitions at 1280 px and 320 px,
including measured doubled text, 44 px targets, keyboard focus and pointer reachability. Each retry uses the same endpoint, account
headers and body; it sends no approval and creates no action. A completed request remains completed when cancellation is replayed:
the fixture follows the backend's terminal-state no-op behavior rather than falsely calling completed work cancelled. Existing
Main/Space response mismatch, answer, approval/rejection and read-only recovery assertions remain intact.

Qualification from a fixed capture at `/tmp/event-agent-response-binding-6UOT7Y` passed **199/199** affected Agent client/browser,
messaging and English/Telugu/Hindi checks, with zero failures/errors/skips. Web typechecking, editor diagnostics and whitespace checks
pass. All **200 captured inputs** stayed unchanged and matched the shared workspace at final comparison. The capture excludes
environment files and user data, reuses installed dependencies and includes transitive Android translation fixtures without editing Android.

- [JUnit](../.local/verify/agent-stop-recovery-20261007-vmL4ef/tests-final.xml), [test log](../.local/verify/agent-stop-recovery-20261007-vmL4ef/qualification.log),
  and [input hashes](../.local/verify/agent-stop-recovery-20261007-vmL4ef/inputs.sha256) are retained.
- The focused response-binding selection passed **12/12** before the complete run; these overlapping counts are not added together.
- A duplicate recovery fragment introduced during concurrent edits was removed after editor diagnostics found it outside its component.
  Immediate types and the same focused tests then passed. An earlier broad run was interrupted before completion; its partial
  `tests.xml` remains in the capture and is not relabelled as qualification. The separate final report is complete.
- Inspected mobile captures: [approval transition](../.local/verify/agent-stop-recovery-20261007-vmL4ef/agent-stop-transition-waiting_for_approval-320.png)
  and [completed transition](../.local/verify/agent-stop-recovery-20261007-vmL4ef/agent-stop-transition-completed-320.png).

Reproduce from the application root with an installed compatible Chromium:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 \
  tests/agents-client.test.mjs tests/messaging-agent-client.test.mjs tests/i18n-client.test.mjs \
  tests/unit/agents-ui.test.mjs tests/unit/messaging-ui.test.mjs tests/unit/i18n-account-ui.test.mjs
npm --prefix web run typecheck
```

Browser requests are synthetic/intercepted, and unexpected outbound requests fail the tests. The existing local Agent preview returned
HTTP 200 without a restart. No backend, migration, permission, provider, budget, saved environment file, deployment or native change
was made by this repair. This does not qualify live model behavior, reverse a completed action, or establish whole-product accessibility.

Additional response-contract qualification, recorded separately from the 199-case follow-up above:

- The client rejects wrong-run replies for reads, answers, decisions and Stop; creation checks the requested Main/Space scope.
  Known scope is retained on Stop, and every run snapshot checks Agent-kind/Space consistency and embedded approval ownership.
  Case-equivalent UUIDs and later states/new approvals on the same run are allowed. An unconfirmed answer retains its original
  run/question/text while other newly returned approval controls wait for reconciliation.
- A [192-file fixed web capture](../.local/verify/agent-response-final-20261007T155959Z-b157dcaa/summary.json) passed **91/91**
  full Agent browser cases, **58/58** Agent client, **4/4** messaging-Agent client, **13/13** translation client and types.
  It correctly reports shared-tree drift because the Stop-transition test expanded during execution. The [12-case delta](../.local/verify/agent-response-delta-20261007T160644Z-d1a7c3/summary.json)
  qualifies that exact test-only change, with all application/config/dependency fingerprints unchanged and final capture/workspace parity.
  These are overlapping results, not a full 94-case claim. Shared installed dependencies remain a non-hermetic caveat.
- [Nine existing backend contracts](../.local/verify/agent-response-backend-20261007-4d9a73e1/summary.json) passed in one session:
  approval replay, rejection, sequential approvals, question continuation, requester access/expiry, cancellation, auto-approval
  replay, Main scope and switch-off. All 247 captured inputs and observed dependencies remained unchanged at head `0059`.
  Scripted model responses and an owned loopback PostgreSQL instance were used; schema teardown and owner-checked container
  removal/absence were verified. Shared services, data, keys and environment files were untouched.
- Initial identity regressions, missing/partial saved-test insertions, syntax failures and preflight failures remain in their
  original reports. They were not counted as passing behavior checks. The final saved tests ran with exact counts; no existing
  assertion was skipped to obtain a pass. Concurrent Stop, runtime activation and Space-header work was preserved rather than
  silently overwritten or attributed to the client-binding change.

#### Event poll workflow delivery (2026-10-07)

Activation update, 2026-10-08: the [fresh synthetic runtime and live browser checkpoint](../infra/README.md#fresh-poll-runtime-2026-10-08)
now qualify the two-person poll workflow through the real browser/proxy/API/database/mail path. This supersedes only the earlier
activation-blocked status below, not the old-runtime recovery limits. A reproduced mobile navigation overlap was repaired at its
shared scroll boundary, with 94 event/client, 34 shared-layout and one live check passing. Older backups/data were not reset or restored.

Scope: finish the event-linked poll workflow started in the owner's continuation. This is the existing event contract, not a silent
replacement for the standalone Space-poll draft described in the [contract checkpoint](#poll-contract-and-privacy-checkpoint-2026-10-07).
Event polls use a question up to 120 characters and 2-8 distinct choices of up to 80 characters. Only the event organizer under the
current admission or the Space owner creates/closes a poll; event-visible members can choose, change or withdraw their own vote.
The implementation does not grant every Space admin that event authority, expose individual ballots, publish a public poll, decide
a winner's consequences, or add Agent voting/creation tools. Broader poll placement and unified policy remain separate decisions.

The [event poll service](../backend/app/modules/events/polls.py), [models](../backend/app/modules/events/models.py) and
[migration 0061](../backend/migrations/versions/0061_event_polls.py) implement event-bound reads, a complete maximum-20-poll list,
reviewed creation, voting/withdrawal and closure. The API and [web proxy](../web/src/app/api/[...path]/route.ts) expose only the exact
event/poll routes. The generated [OpenAPI contract](../packages/openapi/openapi.json) matches the current implementation.

Each voter has a separate admission-bound ETag and durable command receipts. An exact older retry returns current state rather than
overwriting a newer choice; a new stale intent is refused. Withdrawal retains a revision row so an old vote cannot resurrect it.
Database constraints bind options to their poll, and the event lock serializes competing choices. Authorization is checked before
receipt lookup, including leave/rejoin and expired sessions waiting for a lock. Counts include only current-admission ballots.
Responses expose totals and the requester's own choice, not ballot identities; small-group totals are not an anonymity guarantee.
Cancelled or ended events are read-only. Exact already-committed requests remain reconcilable without allowing new votes.

The [event panel](../web/src/features/events/events-screen.tsx) opens [Polls](../web/src/features/events/polls.tsx) lazily. Its manual
workflow includes create review, option validation/add/remove, radio-choice draft and explicit save, withdrawal, aggregate counts,
close review and empty/loading/error states. Unknown replies retain original body/key/If-Match across reads, dialog closure and
navigation; mismatched confirmations never become success. Conflicts require fresh review. Lost-access or missing targets hide
cached details/actions, and a changed unsent close review is invalidated. The latter review/missing-target repairs were concurrent
work and were preserved, not attributed to this implementation.

Two additional browser regressions reproduced an unavailable retry after the event ended/cancelled following a committed vote with
a lost reply. The recovery path now permits only the original unknown command while the current target remains readable; new
actions remain disabled. Backend authority still decides whether reconciliation is permitted. English/Telugu/Hindi text is present;
Telugu/Hindi remains draft pending native review. The 320 px cases double measured font sizes and check focus, hit testing and targets.

Account deletion removes event ballots and cascades their retry receipts; sole-member Space poll questions/options are redacted via
the existing erasure pipeline. The original exhaustive purge test reproduced retained event poll text before the fix, and all 14
deletion checks then passed. Shared records remain subject to the existing retention policy. Migration 0061 refuses downgrade while
event polls exist; no destructive downgrade or shared database migration was performed.

Evidence, using synthetic data and no providers:

| Check | Result | Retained evidence |
| --- | --- | --- |
| Poll/event/budget/deletion/migration/OpenAPI backend selection | 118/118 | [JUnit](../.local/verify/event-polls-20261007-efF3rJ/backend-tests.xml) |
| Events, capacity, shared proxy/client, localization and browser selection | 177/177 | [JUnit](../.local/verify/event-polls-20261007-efF3rJ/web-tests.xml), [log](../.local/verify/event-polls-20261007-efF3rJ/web-tests.log) |
| Fixed source | 457 inputs unchanged during tests and types | [SHA-256 manifest](../.local/verify/event-polls-20261007-efF3rJ/inputs.sha256), capture `/tmp/event-polls-qualified-qVCrlE` |
| Static checks | New/touched poll code lint and web types passed; editor/whitespace clean | Four unrelated deletion-test lint findings match HEAD after ignoring shifted line numbers |

Parsed JUnit has zero failures/errors/skips. The focused 42 backend poll checks, 32 poll browser checks, 14 deletion checks and
delegated frontend passes overlap with the final selection and are not added into a larger coverage count. Earlier route-not-found,
purge, closed-event retry and expired-fixture failures were repaired locally without weakening assertions. The clock-only ended-event
fixture was shortened to keep its authentication valid; independent expiry-under-lock cases still pass. Existing dependency
deprecation warnings and the pre-existing deletion-test lint findings remain reported, not silently fixed.

The fixed capture excludes environment/key/data files, reuses installed dependencies and includes transitive fixture resources
without changing Android. At comparison, only two unrelated messaging files differed from the capture. These results qualify the
captured poll workflow, not every concurrent worktree change. Captures inspected include [desktop](../.local/verify/event-polls-20261007-efF3rJ/event-polls-desktop.png),
[320 px doubled text](../.local/verify/event-polls-20261007-efF3rJ/event-polls-320-200-en.png),
[Telugu creation](../.local/verify/event-polls-20261007-efF3rJ/event-polls-create-320-200-te.png) and
[Hindi creation](../.local/verify/event-polls-20261007-efF3rJ/event-polls-create-320-200-hi.png).

From `backend`, with test environment, an owned synthetic `community_test` database and model/web-provider settings empty:

```sh
PYTHONPATH=. ../.local/agent-venv/bin/pytest -x -q --tb=short --show-capture=no \
  tests/test_event_polls.py tests/test_polls.py tests/test_events.py tests/test_event_budgets.py \
  tests/test_event_budget_splits.py tests/test_event_contributions.py tests/test_account_deletion.py \
  tests/test_migrations.py tests/test_openapi.py
```

From the application root with an installed compatible Chromium:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 \
  tests/events-client.test.mjs tests/events-capacity-client.test.mjs tests/web-client.test.mjs \
  tests/i18n-client.test.mjs tests/text-limits-client.test.mjs tests/unit/events-ui.test.mjs
npm --prefix web run typecheck -- --incremental false
```

The existing frontend served `/app/events` with HTTP 200, but port 8000 had no API listener. The previously retained synthetic
runtime's missing database/mail containers were not recreated or repointed under an old key. Runtime activation still requires a
separately approved compatible database/API at migration 0061 and a recovery/fresh-data decision. This is backend integration plus
intercepted-browser qualification, not a live full-stack, real-user, production, native or live-model result. No providers, agent
permissions, reminders, purchases, deployment, commit or push were enabled by this milestone.

Cleanup: the exact `event-poll-integrity-6f348466` container was rechecked for its owner and `synthetic-tests` labels, then removed
with its anonymous volume and confirmed absent. Shared database/mail services, old runtime metadata and keys were not changed.

#### Reviewed Space Agent poll capability (2026-10-08)

The owner's [feature request](new_features.md) names `space.poll.create` and asks the Space Agent to prepare group decisions without
requiring a specialist selection. This milestone adds that capability to the existing standalone Space-poll service; event-linked
polls remain a distinct contract. No redesign, external provider, automatic ballot, public publishing or event attachment was added.

The [toolkit](../backend/app/modules/agents/toolkit.py) now exposes `list_polls`, `get_poll` and `create_poll` only to Space Agents.
Reads use current account/Space/admission permissions, return aggregate results and only the requester's own choice, and preserve
bounded complete pages with continuation. A known poll in another Space cannot be read even when the person belongs to both.
No voter-list tool or voting/closing action is available. The Main Agent's tool list is unchanged.

Creation reuses the existing standalone contract: 2-6 distinct choices, a question up to 200 characters, choice text up to 80, and an
optional timezone-aware closing time within the domain's allowed window. The exact Space, question, choices, closing time, timezone
and visibility are reviewed before creation. `always_ask` prevents auto-approval even when automatic mode is enabled. The created
poll uses the requester's own identity and permissions, not a new Agent account or elevated role. Closing time and current access
are rechecked at execution; delayed, invalid or foreign-Space proposals fail rather than being silently adjusted.

The poll service is bound to the approval transaction using the existing savepoint pattern, so a failed approval commit leaves no
poll behind. Approval replay creates at most one poll and no votes. The normal action ledger and the new `poll` evidence kind retain
the result; the web parser and English/Telugu/Hindi labels accept it. The seven-field review stays within the established ten-field
client limit. Other members' ballot identities are not returned, but small-group totals are not an anonymity guarantee.

[Definition version 7](../backend/app/modules/agents/registry.py) and [migration 0062](../backend/migrations/versions/0062_agent_space_polls.py)
advance existing version-6 bindings without replacing identities or rewriting recorded run history. Prompt version is
`agent-react-2026-10-08-16`. The generated [OpenAPI contract](../packages/openapi/openapi.json) matches the additive poll-evidence type.
The existing upgrade-preservation regression now checks the current definition version instead of permanently assuming version 6.

Fresh qualification, synthetic data and scripted models only:

| Check | Result | Evidence |
| --- | --- | --- |
| New poll workflow plus registry/kinds/automatic-mode/switch/Space polls/migration/OpenAPI selection | 123/123 | [Backend JUnit](../.local/verify/agent-polls-20261008-Y02Y7E/backend.xml) |
| Agent client, messaging client, localization and complete Agent/messaging browser files | 216/216 | [Web JUnit](../.local/verify/agent-polls-20261008-Y02Y7E/web.xml), [log](../.local/verify/agent-polls-20261008-Y02Y7E/web.log) |
| Source qualification | 462 unchanged inputs, matching the shared workspace at comparison | [Manifest](../.local/verify/agent-polls-20261008-Y02Y7E/inputs.sha256), fixed `/tmp/agent-poll-capability-wI9Eau` |
| Static checks | Passed | Scoped Ruff, TypeScript, editor diagnostics and whitespace |

Focused checks include Main exclusion, cross-Space denial, no effect before approval/rejection, exact retry, rollback after saving,
member removal, agent-off, a deadline that becomes invalid during review, foreign approved payload refusal, and complete long-page
reads. The pagination test initially inspected only the final trimmed model context; it was corrected to observe each delivered
page without changing the runtime's context budget or weakening completeness assertions. Three initial policy regressions established
the missing tools. [Mobile review](../.local/verify/agent-polls-20261008-Y02Y7E/agent-poll-review-320-retry.png) and the desktop review
were inspected; the six review cases preserve every field, explicit rejection and retry identity at 1280 px and measured doubled-text
320 px, with focus, hit testing, 44 px targets and no overflow. Localized labels remain drafts, not native-speaker approval.

Reproduce from `backend`, with a test-only `community_test` database and provider settings empty:

```sh
PYTHONPATH=. ../.local/agent-venv/bin/pytest -x -q --tb=short --show-capture=no \
  tests/test_agent_runtime.py tests/test_agent_registry.py tests/test_agent_kinds.py tests/test_agent_auto_approve.py \
  tests/test_space_agent_switch.py tests/test_polls.py tests/test_migrations.py tests/test_openapi.py \
  -k 'agent_poll or test_agent_registry or test_agent_kinds or test_agent_auto_approve or test_space_agent_switch or test_polls or test_migrations or test_openapi'
```

From the application root with an installed compatible Chromium:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 \
  tests/agents-client.test.mjs tests/messaging-agent-client.test.mjs tests/i18n-client.test.mjs \
  tests/unit/agents-ui.test.mjs tests/unit/messaging-ui.test.mjs
npm --prefix web run typecheck -- --incremental false
```

These results are scoped, not a whole-backend or live-model reasoning score. Focused runs overlap the final totals. Existing dependency
deprecation warnings remain. At initial qualification, the running local snapshot was not migrated or switched: activation required a compatible runtime at
0062 and separately authorized model configuration. No paid model call, provider budget change, shared-data reset, Android change,
deployment, commit or push was made. Existing manual polls remain available under their own domain rules.

The disposable `event-agent-polls-6f348466` database container and its anonymous volume were removed after rechecking the exact
container ID, owner and synthetic-test labels, and absence was confirmed. Active runtime containers, keys and data were untouched.

Activation follow-up: the retained fresh synthetic runtime is now on `0062` with the qualified 191-file backend and definition 7.
Rehearsal and actual migration preserved all 884 existing rows across 95 tables and all 12 Agent identities; the key stayed unchanged.
The migration regression passed 1/1 and existing live Agent-controls/manual-poll journeys passed 3/3 on 192 unchanged inputs.
The [activation record](../infra/README.md#agent-poll-runtime-activation-2026-10-08) supersedes the database/source gate above, not the
model gate: no model endpoint/name/key is configured, providers remain off, and no conversational or live-model evaluation is claimed.

### 3.2 Gaps against the directives (FACT: no tables or routes exist for these)

- Help requests, offers, services, opportunities.
- Public community events (events live only inside private Spaces).
- Trust signals beyond roles and verified email; no "this helped" feedback.
- Community recommendations beyond interests and suggested pages (`/v1/me/suggested-pages` exists).
- Watching pages or topics for changes; shopping help.
- Admin views of agent activity and system health (the moderation queue exists).
- Product metrics.

### 3.3 Known problems

1. Misunderstanding (OBSERVATION, `agent_runs`, 2026-10-06 01:13): "i want to day news about openai and mafang" was searched
   literally as "OpenAI news Mafang". The agent read OpenAI's news list page (headings only) and a MAFANG fund page, then ended
   with a menu of options instead of the news.
2. Incomplete news (FACT, `web.py` before the other session's current change): 5 results with 300-character snippets, about 3,000
   characters per page, inside a 10,000-token call.
3. Videos (FACT): in the VS Code browser YouTube embeds are blocked by policy. The agent also offered guessed videos.
4. Wrong context (OBSERVATION, 01:16): a BigBasket product request got video results first.
5. Slow or stuck website (owner's report to the redesign session; ASSUMPTION about the cause until measured on a production build).
6. Out-of-date tests (FACT, earlier run): `tests/unit/agents-ui.test.mjs` expected removed controls. Follow-up on 2026-10-07: the fixtures now cover the current Main Agent and private Space-chat interfaces without discarding approval or privacy checks. They exposed missing request records/status labels and polling/retry regressions, which were fixed in the shared view. The three affected client/browser suites pass 82/82; [commands and scope](../README.md#agent-interface-recovery-2026-10-07). This does not approve the proposed product changes below.

## 4. Product discovery

### 4.1 Personas and jobs (ASSUMPTION: validate with 5 to 8 interviews and usage data)

| Persona | Functional job | Emotional job | Social job | Trigger | Workaround today | Anxiety | Success |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Family organizer | Coordinate tasks, events and reminders | Feel in control, less nagging | Be the reliable one | School, doctor and bill dates | WhatsApp groups and memory | Forgetting; family information leaking | Everyone knows what to do, on time |
| Family member, including older people | See what's needed, answer fast | Not feel lost | Contribute | A message or notification | Phone calls | Complicated apps, small text | Done in one or two taps |
| Couple | Shared plans, private notes | Closeness, privacy | None | Daily planning | Chat plus notes apps | Others seeing | Private by default |
| Interest or local community member | Find people, events and answers | Belonging | Recognition | New city or hobby | Facebook groups, WhatsApp | Scams, spam | The right community quickly, and trusted |
| Page owner or organizer | Inform, grow, run events | Pride | Standing | Launch or event | Instagram, WhatsApp broadcasts | Moderation work | Active members, little spam |
| Moderator | Keep the space safe | Fairness | Respect | Reports | Manual review | Mistakes, burnout | Quick, fair decisions with evidence |
| Helper or service provider | Offer skills | Usefulness | Reputation | Requests nearby | Word of mouth | Fake requests | Matched with real needs |

Trust requirement shared by all (ASSUMPTION): nothing private leaves its Space, nothing happens without approval, and the agent says
where its information came from.

### 4.2 Community model (DECISION)

Keep the two containers that already exist (FACT): public Pages (open communities with followers and posts) and private Spaces
(family, couple, group, solo). New community types are policies on these containers (topic, location, posting rules), not new
tables. Local and support communities are Pages with a location or topic and stricter posting rules.

### 4.3 Core objects

| Directive object | Status (FACT) | Plan |
| --- | --- | --- |
| User, Profile, Community (Page, Space), Membership, Role, Permission, Post, Comment, Reaction, Conversation, Message, Group (group Space), Event (Space), Task, Notification, Report, ModerationAction, Agent run/approval/tool call, AuditEvent | Exist | Keep. |
| Request, Offer | Missing | D3: a `kind` on public posts (post, request, offer) with need-by date, area and status (open, helped, closed). Inside Spaces, requests are tasks. |
| Service, Opportunity | Missing | Not now: no evidence of need. Revisit after requests and offers are used. |
| TrustSignal | Partial (roles, verified email) | Computed when read from existing facts; nothing stored as a score. |
| Reputation | Missing | Do not build a score (directive section 15). |
| Recommendation | Partial (suggested pages) | Add explainable reasons ("Because you follow Gardening"). |
| KnowledgeItem, SearchIndex | Partial (documents and chunks; search endpoints) | Unify search later (section 7.2). |
| AgentSession, AgentTask | Exist as runs, events, tool calls, approvals | Keep; add a trace view for admins. |

## 5. Community graph and privacy

```
USER
 ├── FOLLOWS ─────────→ PAGE (public)
 ├── MEMBER_OF ───────→ SPACE (private)
 ├── HAS_ROLE ────────→ PAGE / SPACE (owner, admin, moderator, organizer)
 ├── CREATED ─────────→ POST / REQUEST / OFFER / COMMENT / EVENT
 ├── RESPONDED_TO ────→ REQUEST            (proposed, D3)
 ├── MARKED_HELPED ───→ REQUEST            (proposed, D3)
 ├── INTERESTED_IN ───→ TOPIC / PLACE / LANGUAGE
 └── BLOCKED / MUTED ─→ USER / PAGE / TERM (private to the person)
```

Rules (DECISION):

- Ranking may use follows, interests, page roles, nearby area (only if given) and past help.
- Never exposed: private Space membership, who reported whom, who viewed what, block and mute lists.
- Agents follow DEC-060 (FACT): the Main Agent sees public data and the person's own memories; a Space's agent sees only its Space.

## 6. Information architecture (website)

Current main navigation (FACT, `navigation.tsx`): Home, Spaces, Messages, Discover, Profile. The Agent page `/app/agent` is not one
of the five sections.

Proposal (DECISION):

| Area | Purpose | Notes |
| --- | --- | --- |
| Home | "What needs me now" | Approvals waiting, requests for me, today's tasks and events, unread messages, updates from followed pages. Ranked by relevance and time, never by time spent. |
| Spaces | Private communities | Tasks, events, documents, members, Space chat with @agent. |
| Messages | All chats | Space chats, direct chats, private agent answers with Share. |
| Discover | Public communities | Pages, posts, requests and offers (D3), public events (D4). |
| Profile | Account and safety | Account, privacy, data, interests, feed controls, blocked, moderation (by role). |
| Ask (header button) | The Main Agent | Opens `/app/agent` from every screen. Keeps five sections, avoids crowding. |
| Search (header) | One search | Tabs: All, Communities, Posts, Requests, Events, People (people only within shared communities). |

## 7. Experience plan by area

7.1 Home: approvals and questions from the agent first; then items with dates today; then updates. Empty state: "Nothing needs you
right now. [Ask the Agent] [Discover communities]".

7.2 Search and Discover: natural language becomes filters the person can see and remove as chips. Example: "I need a plumber near
me tomorrow" becomes kind = request or offer, topic = home services, area = the person's chosen area, date = tomorrow. Without an
area given, ask once; never guess location.

7.3 Community page: header (name, purpose, rules link, members, trust facts), tabs Posts, Requests, Events, About. One primary action
per state: Follow; after following, Create post.

7.4 Creation: one composer with a kind selector (Post, Request, Offer, Event), smart defaults (current community), and a preview line
"Visible to: everyone / followers / this Space". Publishing always shows exactly what will be published.

7.5 Help loop (D3):

```
Need help → describe it (or ask the Agent) → Agent suggests public communities and posts (public data only)
→ person chooses → post a Request or message the page → helpers respond → requester marks "Helped" → optional thanks
```

Measures: time to first response, share of requests helped within 48 hours, reports per request.

7.6 Events: public events on pages (D4): create, RSVP, capacity, updates, cancellation, and reminders only when the person asks
(no automatic reminders, owner decision).

7.7 Messaging (exists): add a clearer delivery and read state, report and block in the chat header, private agent answers (done,
DEC-061).

7.8 Notifications: two groups, "Needs you" and "Updates".

7.9 Trust: D6 facts only, each with a plain explanation on tap.

7.10 Safety: checks before publishing (spam and scam signals, links, repeated text), the existing rate limits, report and block, the
existing moderator queue, and human review for high-impact actions. AI may flag and suggest; it never removes or punishes on its own.

## 8. Agent system

### 8.1 Principles

The agent helps; the person decides. Every change is approved, except when the person turns on auto-approve, and public content
always asks. Space answers are private by default. Facts come with sources and dates. The screen never shows "thinking" unless the
server is really working.

### 8.2 Orchestrator

FACT (today): request, then context (scope, memories, recent turns), then a ReAct loop of model and tools, then an answer or an
approval card. Proposed changes (DECISION):

```
request
  → understand: fix spelling and short forms ("to day" → today), detect language and kind of request
  → clarify: one question only if two meanings would change the answer ("MAFANG fund or the MAANG companies?")
  → plan: a short to-do list for 3 or more steps
  → gather: tools (read first), keeping each result short and on topic
  → verify: dates present, numbers copied correctly, at least 2 sources for news or say "only one source"
  → answer: the answer first, then details, then sources. No menu of options at the end.
  → or approval card: what I understood, what I found, what will happen, Approve / Change / Cancel
```

### 8.3 Agents by capability

| Agent | Responsibility | Tools | Permissions | Memory | On failure | Evaluated by |
| --- | --- | --- | --- | --- | --- | --- |
| Main Agent (exists) | Public community, the web, personal memories | Pages and posts (read; writes after approval), web search and read, memories, Space-chat buttons | Public data and the person's own data | The person's memories, not Space notes | Says what failed; never guesses | Golden set of real requests (8.12) |
| Space Agent (exists) | One Space's tasks, events, reminders, documents | Space tools only | That Space, with the person's own role | That Space's notes | Same | Golden set per Space type |
| Research helper (exists) | Reading several sources | Read-only web and documents | Read-only | None | Returns what it has and the gaps | Source coverage |
| Safety check (new, not a chat agent) | Spam and scam signals before publishing | Rules plus a classifier | Flag and hold for review only | None | High-risk content waits for a human | Precision and recall on a labelled set |
| Moderation assistant (new) | Summarize reports, suggest an action | Read reports | Suggest only | None | Falls back to the plain queue | Agreement with moderators |
| Watcher (new, a scheduled job) | Check pages or topics for meaningful changes | Fetch | Read-only | Last content per watch | Backs off, then pauses the watch | False-alert rate |

Not built (directive section 17): analytics, UX research, developer and QA "agents" inside the product. These are engineering
practices, not user features.

### 8.4 Agent graph

```
START → UNDERSTAND → (CLARIFY? → wait for the person) → PLAN
      → GATHER ──┬── web ────┐
                 ├── community┤ (each step: timeout, 1 retry for timeouts, never retry a write)
                 └── memory ──┘
      → VERIFY ─(fails)→ REPLAN (at most once) ─→ GATHER
      → CHANGE NEEDED? ─yes→ APPROVAL CARD → (approved → ACT → RESULT) / (rejected → ANSWER)
                        ─no──→ ANSWER
      → DONE        (cancel from any state; limits: steps, tool calls, time, tokens)
```

### 8.5 Context and token budget (DECISION, needs D2)

- Per call: 24,000 tokens. Per run: 120,000. Per person per day: set by the owner.
- Tool results are cut to the facts needed; long pages are read in parts (the other session is building this now).
- History: the last few turns in full, older turns as a short summary.
- Model tiers: a small model for understanding and routing, a mid model for answers. Record the model used in each run.

### 8.6 News pipeline (DECISION)

1. Rewrite the query: fix spelling, expand short forms, add the date range ("today" means the person's local date).
2. Search; prefer result URLs that are articles with dates over home pages and lists.
3. Read the top 2 or 3 articles (one batch call when the API allows; up to 10 URLs per call per the owner's TinyFish notes).
4. Extract headline, date, place, key facts and figures, who said it.
5. Write "As of <date>: …", group by topic, attribute claims, list sources with dates; say clearly what could not be confirmed.

HYPOTHESIS: with steps 1 to 5 and a mid model, at least 80% of the golden news questions get dated, multi-source answers.

### 8.7 Web tools

FACT: TinyFish Search and Fetch are used with the owner's key. Next (DECISION, needs D7 to read the API): batch reading, a 10-minute
cache for identical reads, and per-person daily limits kept.

### 8.8 Videos

Show only results with a real video ID, play on click, keep "Open on YouTube" as a fallback, and never claim the video started.
Automatic ad skipping is not built: YouTube's terms forbid interfering with ads, and the browser stops our page from pressing
buttons inside YouTube's player.

### 8.9 Watch a page or topic (phase 5)

```
create watch (link or topic, how often: daily by default) → scheduled check → fetch → clean (remove menus, ads, dates)
→ compare with the last version → meaningful? (new paragraphs or changed numbers above a threshold)
→ in-app notice: what changed, with a link → keep the new version
```

Limits: 5 watches per person, at most every 6 hours. Failures back off and pause the watch with a notice.

### 8.10 Quick-commerce (phase 5, D5)

- Store adapters, one script per store (BigBasket first), behind one interface: `search(query, area) → products` with name, size,
  price, MRP, link and whether availability is known.
- The agent compares and builds a cart list; the person buys in the store's own app or site.
- Later, with a new decision: a browser extension that fills the cart in the person's own logged-in browser after approval.
- Never: store passwords, card numbers or one-time codes; buy automatically.
- Browser technology: Playwright with headless Chromium as the reliable baseline. Lightpanda as a spike (FACT from its README:
  AGPL-3.0; in its own benchmark about 9 times faster and 16 times less memory than Chrome; no Windows binary, so Docker or WSL;
  sends usage telemetry unless `LIGHTPANDA_DISABLE_TELEMETRY=true`; partial web API coverage).

### 8.11 WebMCP (later)

FACT (W3C community repository): WebMCP is a draft proposal that lets a website register tools (`document.modelContext.registerTool`)
for agents in the browser. It helps only where the website itself adopts it, so it does not help with BigBasket today. Our own site
could register tools (search, create post, RSVP) so browser assistants can use it safely.

### 8.12 Evaluation

A golden set of about 50 real requests, made anonymous, covering news, community actions, Space actions, videos, shopping and mixed
languages. Each is scored on: understood intent, right tools, complete answer, dates present, no invented sources, approval used
correctly. Run it before every prompt or model change; track the pass rate.

### 8.13 Observability

A trace per run (steps, tools, tokens, time, errors) visible to admins, and daily totals of runs, failures, tokens and average time.
No message text in logs.

## 9. Visual design system

### 9.A Design philosophy

"Quiet help." A calm neutral canvas, one warm action color, text-first hierarchy, and an agent that appears as a helpful participant
in the conversation rather than the centre of the product. Every color, size and movement must help someone understand or act.

### 9.B Brand personality

Human, trusted, modern, intelligent, calm, useful. Avoid: generic SaaS, gaming, crypto, AI neon, heavy glass effects, heavy
gradients, everything very rounded, clutter.

### 9.C Directions and palettes

Three directions were compared, with the current tokens as a baseline. Contrast values are FACT from `.local/plan/contrast.mjs`
(WCAG 2 formula).

| | A. Calm Community, "Peacock" | B. Modern Intelligent, "Ink and Mint" | C. Civic Utility, "Evergreen and Marigold" | Baseline: current iOS style |
| --- | --- | --- | --- | --- |
| Brand | Peacock teal #0D6B66 | Ink navy #1E3A5F | Evergreen #1B5E3A | Blue #0068D6 |
| Secondary | Clay #A3471F (community) | Mint #0B7A66 (agent) | Marigold #E8A317 (fills only) | Orange #B84900 |
| Neutrals | Warm stone (#F7F6F3 to #1B1F1E) | Cool grey (#F5F6F8 to #111827) | Pure white and green-grey | iOS greys (#F2F2F7, #1C1C1E) |
| White text on brand | 6.34:1 | 11.50:1 | 7.75:1 | 5.31:1 |
| Key risk | Teal close to success green: separate with icons and labels | Looks like fintech or generic SaaS | White text on marigold fails (2.17:1); brand vs success green indistinct (1.32:1); saffron-like colors carry political and religious meaning in India | Looks like every iOS app; weak brand distinctiveness; the directive asks against default blue |
| Personality | Warm, human, trustworthy, culturally positive in India (peacock) | Precise, technical, cool | Clear, official, practical | Familiar, neutral |

Selection (DECISION, Owner D1): A, with C's density rules for information-heavy screens and B's precision for agent states.

### 9.C.1 Color tokens (selected)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| color.action.primary | #0D6B66 | #3FA79D | Primary buttons, selected state |
| color.action.primaryHover | #0A5853 | #4DB6AC | Hover |
| color.action.primaryActive | #084743 | #5CC2B7 | Pressed (dark mode presses lighter so the dark label keeps 8.00:1) |
| color.action.primarySubtle | #E2F1EF | #12302D | Selected rows, chips |
| color.action.onPrimary | #FFFFFF | #06201D | Label on primary |
| color.text.primary | #1B1F1E | #ECEFEE | Main text |
| color.text.secondary | #4E5452 | #B8C0BD | Supporting text |
| color.text.tertiary | #646A67 | #959D9A | Metadata |
| color.text.disabled | #A3A8A5 | #5E6663 | Disabled (exempt from contrast rules; never the only cue) |
| color.text.link | #0D6B66 | #4DB6AC | Links (always underlined in body text) |
| color.surface.background | #F7F6F3 | #111413 | Page |
| color.surface.default | #FFFFFF | #181C1B | Cards, sheets |
| color.surface.elevated | #FFFFFF + shadow | #202524 | Menus, popovers |
| color.surface.subtle | #F0EEEA | #1C2120 | Inputs, quiet sections |
| color.surface.inverse | #1B1F1E | #ECEFEE | Toasts |
| color.border.default | #E3DFD8 | #2E3533 | Dividers |
| color.border.subtle | #EDEAE4 | #262C2A | Inner dividers |
| color.border.strong | #857E74 | #6E7774 | Input borders (3:1 or more) |
| color.status.success / subtle / strong | #1E7339 / #E6F4EA / #155C2D | #6CCB8A / #173222 / #8FD9A6 | Success, with a check icon |
| color.status.warning / subtle / strong | #8A5300 / #FFF3D6 / #6B4000; icon #C27400 | #F2B54A / #33270F / #F7C978 | Warning, with a triangle icon |
| color.status.error / subtle / strong | #B3261E / #FDECEA / #8C1D17 | #F28B82 / #3A1A18 / #F6AEA9 | Error, with an alert icon |
| color.status.info / subtle / strong | #1F5FA6 / #E7F0FB / #174A82 | #8AB4F8 / #172A44 / #ADC8FA | Information, with an info icon |
| color.focus | #1F5FA6 | #8AB4F8 | Focus ring (2px, 2px offset) |
| color.selection | #CDE7E4 | #1E4A46 | Text selection |
| color.overlay | rgba(27, 31, 30, 0.48) | rgba(0, 0, 0, 0.6) | Behind dialogs |
| color.agent.default / subtle | #3B5A86 / #EAF0F8 | #A9C1E8 / #1A2433 | Agent label, agent activity |
| color.community.default / subtle | #A3471F / #F8E9E2 | #E8A07F / #34221A | Community accents (sparingly) |
| color.verified | #0D6B66 + check icon | #4DB6AC + check icon | "Email verified" fact only |

Color ratio (DECISION): about 75% neutral surfaces, 15% supporting tones, at most 10% brand and status. Meaning is never carried by
color alone: status uses icon, text and color together.

### 9.D Typography

Family (DECISION): Source Sans 3 (FACT: already bundled under the SIL Open Font License; humanist and readable; tabular figures
through `font-feature-settings: "tnum"`), with Noto Sans Telugu and Noto Sans Devanagari as script fallbacks, and the system stack
while fonts load. One family, no second display font. Letter spacing 0 (DEC-013) because Telugu and Hindi break with tracking.

| Style | Weight | Size / line height (px) | Use |
| --- | --- | --- | --- |
| Display | 700 | 40 / 48 | Landing only |
| H1 | 700 | 32 / 40 | Page title |
| H2 | 650 | 24 / 32 | Section title |
| H3 | 650 | 20 / 28 | Card title |
| H4 | 650 | 17 / 24 | Small heading |
| Body large | 400 | 18 / 28 | Reading view, agent answers |
| Body | 400 | 16 / 24 | Default |
| Body small | 400 | 14 / 20 | Supporting text |
| Caption | 400 | 13 / 18 | Timestamps, metadata |
| Label | 600 | 14 / 20 | Form labels, chips |
| Button | 600 | 16 / 20 | Buttons |
| Navigation | 600 | 13 / 16 (mobile tab bar), 15 / 20 (desktop) | Navigation |
| Numeric | 500, tabular | 16 / 24 | Prices, counts, times |

Telugu and Hindi use line height × 1.15. Text sizes use rem so 200% text works.

### 9.E Spacing

Scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 as `space.1` to `space.24` (the number times 4).

| Use | Value |
| --- | --- |
| Button padding | 12 × 16 (compact 8 × 12) |
| Input padding | 12 × 14 |
| Card padding | 16 (mobile), 20 (desktop) |
| Gap between items in a list | 12 |
| Section spacing | 32 (mobile), 48 (desktop) |
| Page margin | 16 (mobile), 24 (tablet), 32 (desktop) |
| Label to field | 6 → rounded to 8 |
| Form field to field | 16 |

### 9.F Layout

| | Mobile < 768 | Tablet 768–1023 | Desktop ≥ 1024 |
| --- | --- | --- | --- |
| Columns | 4 | 8 | 12 |
| Gutter | 16 | 20 | 24 |
| Margin | 16 | 24 | 32 |
| Navigation | Bottom tab bar | Bottom tab bar or rail | Left rail |
| Content width | Full | Full | Reading 720, wide 1200 |

Breakpoints: 480, 768, 1024, 1280. Mobile reorders content (primary action first) instead of shrinking desktop.

### 9.G Radius and elevation

Radius: XS 4 (badges), SM 8 (chips, inputs), MD 12 (cards, buttons), LG 16 (dialogs, sheets), XL 24 (bottom sheet top), Pill 999
(avatars, toggles). Elevation: Flat (border only), Raised (0 1px 2px rgba(16,24,20,0.06)), Floating (0 8px 24px rgba(16,24,20,0.12)),
Modal (0 24px 48px rgba(16,24,20,0.18) plus the overlay). Prefer borders and surface contrast to shadows.

### 9.G.1 Components and states

Components: Button, Icon Button, Input, Textarea, Select, Search, Checkbox, Radio, Switch, Tabs, Segmented Control, Card, List item,
Avatar, Badge, Chip, Tooltip, Popover, Dropdown, Dialog, Drawer/Sheet, Toast, Banner, Navigation, Breadcrumb (desktop only),
Pagination ("Load more"), Progress, Skeleton, Empty state, Error state.

| State | Rule |
| --- | --- |
| Default | Token colors only |
| Hover | One step darker surface or primary hover; never the only cue |
| Focus | 2px focus ring with 2px offset on every focusable element |
| Active | Primary active; scale 0.98 at most |
| Disabled | Disabled text, no pointer; keep the label readable; explain why nearby when not obvious |
| Loading | Spinner inside the control plus the action word ("Saving…"); keep the size |
| Error | Error border, icon and message under the field |
| Success | Check icon and text, then return to default |
| Selected | Primary subtle background, check or bar indicator |

### 9.H Agent UI system

States come only from the server (run status, tool calls, events). Never shown when nothing is running.

| State | Shown when | Text |
| --- | --- | --- |
| Starting | Run queued | "Starting…" |
| Understanding | First model step | "Understanding your request" |
| Searching | A web or community search runs | "Searching the web for …" |
| Reading | A page or document read runs | "Reading <source title>" |
| Comparing | Research helper or several reads | "Comparing 3 sources" |
| Waiting for approval | Approval pending | "Check this before I do it" |
| Needs clarification | Question pending | "One question" |
| Completed | Completed | Answer, then sources |
| Failed | Failed or timed out | What failed, nothing changed, what you can do |

Action card for important changes:

```
┌ Agent ─────────────────────────────────────┐
│ What I understood   Add "Buy milk" for Sam │
│ What I found        Sam has 2 open tasks   │
│ What will happen    New task, due tomorrow │
│ Visible to          This Space             │
│ [ Approve ]  [ Change ]  [ Cancel ]        │
└────────────────────────────────────────────┘
```

Low-risk reads need no card. Public content always shows the card, even with auto-approve. Provenance: every web answer lists its
sources with title, site and date, marking "read" versus "only searched".

### 9.I Community UI system

Community card, Member card, Community header, Membership state (Follow, Following, Member, Pending), Trust facts (D6), Post card,
Request card, Offer card, Event card, Conversation preview, Agent suggestion, Agent action (9.H), Agent result. All share one card
anatomy: kind label, title, one line of context, facts row, one primary action.

```
┌ REQUEST · Gardening Hyderabad ─────────────┐
│ Need help pruning a mango tree             │
│ Kondapur · by Saturday · 2 responses       │
│ ✓ Email verified · Member since 2026       │
│ [ Offer help ]                    Save ☆   │
└────────────────────────────────────────────┘
```

### 9.J Motion

| Token | Duration | Use |
| --- | --- | --- |
| motion.fast | 120 ms | Hover, press, small state changes |
| motion.medium | 200 ms | Expand, collapse, switch tabs |
| motion.slow | 320 ms | Sheets and dialogs entering |

Easing: standard cubic-bezier(0.2, 0, 0, 1); exit cubic-bezier(0.3, 0, 1, 1). With `prefers-reduced-motion`: opacity only, 120 ms
at most, no movement. No looping animation except progress indicators tied to real work.

### 9.K Accessibility

Targets (DECISION): WCAG 2.2 AA, aiming higher where practical (KNOWLEDGE: text 4.5:1, large text 3:1, non-text 3:1, target size
24 px minimum at AA). Measured critical pairs (FACT, `.local/plan/contrast.txt`):

| Pair (light) | Ratio | Pair (dark) | Ratio |
| --- | --- | --- | --- |
| Primary text on background | 15.41 | Primary text on background | 16.01 |
| Secondary text on background | 7.16 | Secondary text on surface | 9.27 |
| Tertiary text on background | 5.11 | Tertiary text on elevated | 5.60 |
| Link on surface | 6.34 | Brand text on surface | 7.05 |
| White on primary / hover / active | 6.34 / 8.29 / 10.54 | Label on primary button | 5.86 |
| Error text on error subtle | 5.72 | Error text on surface | 7.20 |
| Warning text on warning subtle | 5.74 | Warning text on surface | 9.41 |
| Success text on success subtle | 5.19 | Success text on surface | 8.64 |
| Agent text on agent subtle | 6.12 | Agent text on surface | 9.40 |
| Input border on surface | 4.01 | Input border on surface | 3.73 |
| Focus ring on background | 5.99 | Focus ring on background | 8.79 |

Interaction: touch targets 44 px (48 px for primary mobile actions), full keyboard use, visible focus, landmarks and headings,
labels outside hint text, live regions for agent progress, layouts that work at 320 px wide and 200% text.

Every other token pair in 9.O was also checked (FACT, `.local/plan/contrast-extra.txt`): all status, agent and community text on
their subtle backgrounds pass 4.5:1 in both modes. One failure was found and corrected: the dark pressed button was #2E8C83
(4.22:1 with its label) and is now #5CC2B7 (8.00:1).

### 9.L Responsive rules

Mobile: one column, bottom navigation, primary action reachable by the thumb, metadata trimmed to one line, secondary actions in a
menu. Tablet: two columns where useful (list and detail). Desktop: left rail, list and detail side by side, optional side panel for
the agent, wider reading width capped at 720 px for text.

### 9.M Screen-by-screen structure

| Screen | Purpose | Primary action | Key components | States |
| --- | --- | --- | --- | --- |
| Home | What needs me now | Act on the top item | Approval cards, today list, updates | Empty, loading skeleton, error with retry |
| Discover | Find communities and help | Follow or Offer help | Search, filter chips, community and request cards | No results with suggestions |
| Search results | Find anything | Open a result | Tabs, result cards | No results, partial results |
| Community page | Understand and join | Follow, then Create post | Header, tabs, post, request and event cards | Read-only, moderated, archived |
| Post or request detail | Read and respond | Comment or Offer help | Post, comments, report | Deleted, hidden, closed |
| Spaces list | Open a private community | Open Space | Space cards | No Spaces: Create or Join |
| Space | Coordinate | Add task or event | Tasks, events, documents, members, chat entry | Agent off, read-only |
| Messages | Talk | Send | Conversation list, chat, composer, agent replies with Share | Offline, unsent, private answer |
| Agent | Get help | Send request | Conversation, activity, action cards, sources | Working, waiting, failed |
| Events | Plan and attend | RSVP | Event cards, calendar | Full, cancelled, past |
| Notifications | Catch up | Open item | Grouped list | Nothing new |
| Settings | Control privacy and data | Save changes | Sections, toggles | Saved, error |
| Moderation | Review reports | Decide | Queue, evidence, decision form | Empty queue |

### 9.N Structural wireframes

Home (mobile):

```
┌──────────────────────────────┐
│ Community        [Ask] [🔔]  │
│ Needs you (2)                │
│ ┌ Agent: approve task? ────┐ │
│ │ [Approve] [Change]       │ │
│ └──────────────────────────┘ │
│ Today                        │
│ • 5 pm  School meeting       │
│ • Water the plants (Sam)     │
│ Updates from pages you follow│
│ ┌ Gardening Hyderabad ─────┐ │
│ └──────────────────────────┘ │
│ [Home][Spaces][Msgs][Disc][Me]│
└──────────────────────────────┘
```

Agent (desktop):

```
┌ Rail ┬─────────────── Conversation ───────────────┬─ Sources ──────┐
│ Home │ You: today's news about OpenAI and MAANG    │ 1 Reuters 6 Oct│
│ Spcs │ Agent: One question: MAFANG fund or MAANG?  │ 2 CNBC 6 Oct   │
│ Msgs │ You: MAANG companies                        │ 3 The Verge    │
│ Disc │ ● Searching the web for "OpenAI news today" │                │
│ Me   │ ● Reading Reuters, CNBC                      │                │
│      │ Agent: As of 6 Oct 2026: …                   │                │
│      ├──────────────────────────────────────────────┤                │
│      │ [ Message the Agent…                ] [Send] │                │
└──────┴──────────────────────────────────────────────┴────────────────┘
```

Community page (mobile):

```
┌──────────────────────────────┐
│ ← Gardening Hyderabad        │
│ Share tips and help nearby   │
│ 1.2k followers · Rules       │
│ [ Follow ]                   │
│ Posts | Requests | Events    │
│ ┌ REQUEST card ────────────┐ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 9.O Design tokens (implementation-ready)

To live in `packages/design-tokens/tokens.json` version 2 and generate CSS variables (and later Kotlin):

```json
{
  "version": 2,
  "color": {
    "light": {
      "action": { "primary": "#0D6B66", "primaryHover": "#0A5853", "primaryActive": "#084743", "primarySubtle": "#E2F1EF", "onPrimary": "#FFFFFF" },
      "text": { "primary": "#1B1F1E", "secondary": "#4E5452", "tertiary": "#646A67", "disabled": "#A3A8A5", "link": "#0D6B66" },
      "surface": { "background": "#F7F6F3", "default": "#FFFFFF", "elevated": "#FFFFFF", "subtle": "#F0EEEA", "inverse": "#1B1F1E" },
      "border": { "default": "#E3DFD8", "subtle": "#EDEAE4", "strong": "#857E74" },
      "status": {
        "success": "#1E7339", "successSubtle": "#E6F4EA", "successStrong": "#155C2D",
        "warning": "#8A5300", "warningSubtle": "#FFF3D6", "warningStrong": "#6B4000", "warningIcon": "#C27400",
        "error": "#B3261E", "errorSubtle": "#FDECEA", "errorStrong": "#8C1D17",
        "info": "#1F5FA6", "infoSubtle": "#E7F0FB", "infoStrong": "#174A82"
      },
      "focus": "#1F5FA6", "selection": "#CDE7E4", "overlay": "rgba(27, 31, 30, 0.48)",
      "agent": { "default": "#3B5A86", "subtle": "#EAF0F8" },
      "community": { "default": "#A3471F", "subtle": "#F8E9E2" },
      "verified": "#0D6B66"
    },
    "dark": {
      "action": { "primary": "#3FA79D", "primaryHover": "#4DB6AC", "primaryActive": "#5CC2B7", "primarySubtle": "#12302D", "onPrimary": "#06201D" },
      "text": { "primary": "#ECEFEE", "secondary": "#B8C0BD", "tertiary": "#959D9A", "disabled": "#5E6663", "link": "#4DB6AC" },
      "surface": { "background": "#111413", "default": "#181C1B", "elevated": "#202524", "subtle": "#1C2120", "inverse": "#ECEFEE" },
      "border": { "default": "#2E3533", "subtle": "#262C2A", "strong": "#6E7774" },
      "status": {
        "success": "#6CCB8A", "successSubtle": "#173222", "successStrong": "#8FD9A6",
        "warning": "#F2B54A", "warningSubtle": "#33270F", "warningStrong": "#F7C978",
        "error": "#F28B82", "errorSubtle": "#3A1A18", "errorStrong": "#F6AEA9",
        "info": "#8AB4F8", "infoSubtle": "#172A44", "infoStrong": "#ADC8FA"
      },
      "focus": "#8AB4F8", "selection": "#1E4A46", "overlay": "rgba(0, 0, 0, 0.6)",
      "agent": { "default": "#A9C1E8", "subtle": "#1A2433" },
      "community": { "default": "#E8A07F", "subtle": "#34221A" },
      "verified": "#4DB6AC"
    }
  },
  "font": { "family": "Source Sans 3", "fallback": ["Noto Sans Telugu", "Noto Sans Devanagari", "system-ui", "sans-serif"], "letterSpacing": 0 },
  "type": {
    "display": [40, 48, 700], "h1": [32, 40, 700], "h2": [24, 32, 650], "h3": [20, 28, 650], "h4": [17, 24, 650],
    "bodyLarge": [18, 28, 400], "body": [16, 24, 400], "bodySmall": [14, 20, 400], "caption": [13, 18, 400],
    "label": [14, 20, 600], "button": [16, 20, 600], "navigation": [13, 16, 600], "numeric": [16, 24, 500]
  },
  "space": { "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40, "12": 48, "16": 64, "20": 80, "24": 96 },
  "radius": { "xs": 4, "sm": 8, "md": 12, "lg": 16, "xl": 24, "pill": 999 },
  "border": { "width": 1, "focusWidth": 2, "focusOffset": 2 },
  "shadow": {
    "raised": "0 1px 2px rgba(16, 24, 20, 0.06)",
    "floating": "0 8px 24px rgba(16, 24, 20, 0.12)",
    "modal": "0 24px 48px rgba(16, 24, 20, 0.18)"
  },
  "motion": { "fast": 120, "medium": 200, "slow": 320, "easing": "cubic-bezier(0.2, 0, 0, 1)", "exit": "cubic-bezier(0.3, 0, 1, 1)" },
  "breakpoint": { "sm": 480, "md": 768, "lg": 1024, "xl": 1280 },
  "z": { "sticky": 100, "navigation": 200, "dropdown": 300, "overlay": 400, "modal": 500, "toast": 600, "tooltip": 700 },
  "icon": { "sm": 16, "md": 20, "lg": 24, "stroke": 1.75 },
  "target": { "web": 44, "webPrimaryMobile": 48, "android": 48 },
  "container": { "reading": 720, "wide": 1200 }
}
```

### 9.P Red-team findings on the visual system

| Finding | Correction |
| --- | --- |
| The focus ring (#1F5FA6) and the primary button (#0D6B66) have almost the same brightness (1.02:1) | Always draw the ring with a 2px offset so it sits on the background (5.99:1), never directly on the button |
| Teal brand and success green can be confused | Success always has a check icon and the word; the brand never appears in status messages |
| Disabled text is low contrast by design | Never use disabled styling alone; explain why an action is unavailable |
| Clay accent could make every card colorful | Clay only for community kind labels and the community header line |
| Agent color could dominate | Agent color only for the agent label and activity line; answers use normal text |
| Many cards stacked look busy | Lists use dividers, not cards, unless items are actionable |
| Heavy glass effects in the ongoing redesign (ASSUMPTION: a `glass` experiment exists in `.local/ios-redesign`) | Solid surfaces; at most a light blur behind the bottom bar on supported browsers |
| Telugu and Hindi text clipping | Line height × 1.15 and no fixed heights on text containers |

### 9.Q Recommendation

Peacock gives the product its own recognizable, calm identity that feels human and Indian-friendly without religious or political
color associations, keeps AA contrast everywhere it matters (measured above), and stays quiet so that people, communities and the
agent's evidence are the focus.

## 10. Engineering

### 10.1 Architecture (FACT, keep)

A modular monolith with separate workers. Agents call the same domain services as the website, so permissions and business rules
are never bypassed. New capabilities are new modules or new tools, not a rewrite.

### 10.2 Data model changes (DECISION, each with an Alembic migration and a downgrade)

| Migration | Change | Needs |
| --- | --- | --- |
| 0054 | BUILT 2026-10-06: `public_pages.help_open`, `help_posts` (request or offer, need-by date, area, status), `help_replies` (private) | D3 |
| 0055 | BUILT 2026-10-06: `help_reports` (to the page's owner and moderators; kept separate from platform reports) | D3 |
| 0056 | BUILT 2026-10-06: `page_events` (separate from Space events), `page_event_responses` (going only; exact place hidden unless the page shows it) | D4 |
| 0057 | `watches` (owner, link or topic, frequency, last content hash, last checked, state), `watch_changes` | Phase 5 |
| 0058 | `agent_feedback` (run, helpful yes or no, reason) | Phase 1 |
| none | Trust facts are computed when read | D6 |

### 10.3 Security

Already in place (FACT): server sessions, CSRF and Origin checks, CSP, rate buckets, audit and outbox tables, encrypted messages,
per-request permission checks, agent approvals with exact payloads. Add: rate limits on new request and offer posts; link and phone
number checks in requests (scam signals); hold first posts of new accounts in busy communities for review; model output and web text
always treated as untrusted (already a rule in the prompts).

BUILT 2026-10-06 for requests and offers: 5 open and 5 new per day; no links, phone numbers or email addresses in public text;
reports to the page's owner and moderators (Keep or Remove); new accounts (under 30 days) wait for approval on pages with 50 or
more followers; a "Needs your review" list on My pages for the people who run each page.

BUILT 2026-10-06 for requests and offers: 5 open and 5 new per day, link/phone/email refusal, reports to page managers, holds for
new accounts (under 30 days) on pages with 50 or more followers, and a "Needs your review" list on My pages.

### 10.4 Privacy

Requests show an area, never an exact address. People search only inside shared communities. Watches and shopping lists are private
to the person. Export and deletion cover every new table (existing export and deletion modules are extended).

### 10.5 Observability

Keep JSON logs and metrics; add the agent run trace (8.13); add counts for requests created, responded and helped.

### 10.6 Performance

Measure first (DECISION): a production build of the website, page load and API time at the 95th percentile on the main screens, and
the agent's time to first visible step. The redesign session is already measuring navigation and API timing. Then fix the slowest
screens with server rendering for first data, smaller client bundles and fewer sequential requests.

### 10.7 Failure engineering

| Service | Timeout | Retry | Fallback | Visible to the person |
| --- | --- | --- | --- | --- |
| Model call | 45 s | Transient errors only, with backoff | Stop the run, keep the request | "I couldn't finish. Nothing was changed." |
| Web search and read | 8–12 s | None (one call per tool step) | Answer with what was read and name the gap | "One page couldn't be read." |
| Store adapter | 15 s | One | Show the store search link | "Prices couldn't be loaded; open BigBasket." |
| Watch check | 15 s | Backoff 1 h, 6 h, 24 h | Pause the watch after 3 failures | "Paused: the page couldn't be read." |
| Live updates | 30 s | Reconnect with backoff | Polling | Nothing; data still refreshes |

Agent limits stay: steps, tool calls, research helpers, time and token budget per run.

### 10.8 Testing

| Kind | Scope |
| --- | --- |
| Unit | Domain rules, query rewrite, news extraction, adapters' parsers |
| Integration | Database, API, agent tools against the real services in test schemas |
| Contract | OpenAPI check (exists: `scripts/check-openapi.mjs`) |
| Agent | Golden set (8.12): intent, tools, permissions, refusals, failures |
| End-to-end | Main journeys in a browser (exists for many areas; update agent ones) |
| Security | Authorization sweeps (exist for Spaces), injection, rate limits, private-data boundaries |
| UX regression | 320 px, 200% text, keyboard, contrast checks for tokens (exist in part) |

### 10.9 CI

None today (FACT). Add a pipeline when the repository has a remote: types, unit tests, backend tests, OpenAPI check, token check.
Until then, `scripts/verify.ps1` is the gate before each delivery.

### 10.10 Definition of done

Coherent UX; happy path and error states work; permissions enforced and tested; accessibility checked (320 px, 200% text,
keyboard, contrast); security and privacy reviewed; tests pass and were run; observability added; performance measured; migration
with downgrade; the feature's measures defined; existing features still work.

## 11. Metrics

| Group | Measures |
| --- | --- |
| Person's value | Agent answers rated helpful; requests helped within 48 hours; time to first response; tasks completed on time |
| Community health | Response rate; unanswered requests; repeat helpers; reports per 100 posts; moderation time |
| Quality | Agent failure rate; golden-set pass rate; errors; page load at the 95th percentile |
| Cost | Tokens per answered request; web lookups per day |

Experiments follow: hypothesis, expected behavior, measure, test, result, decision. No experiment without a decision it will inform.

## 12. Roadmap (dependency order)

| Phase | Goal | Contents | Depends on | Done when |
| --- | --- | --- | --- | --- |
| 0. Stabilize | Safe base | Coordinate the two active sessions; fix out-of-date tests; measure performance; budget decision | D2 | All suites green; baseline numbers recorded |
| 1. Agent understanding and news | Answers people can use | Model tiers, query rewrite, one clarifying question, news pipeline, answer format, feedback button, golden set, run trace | D2, Phase 0 | Golden set at 80% or more; news answers dated with 2 or more sources or an explicit gap |
| 2. Design system v2 | One calm, consistent look | Tokens v2 (light and dark), UI kit states, shell, Home, Agent, Messages first, then the other screens | D1 | No hand-typed colors (token check); contrast and 320 px / 200% checks pass |
| 3. Agent UI | Clear, trustworthy agent | Real activity line, action cards, sources panel, video cards, Space-chat buttons | Phases 1 and 2 | Every state traced to a server fact; keyboard and screen-reader checks |
| 4. Community help | Real outcomes between people | Requests and offers, responses, "Helped", trust facts, public events | D3, D4, D6 | End-to-end journey passes; metrics recorded |
| 5. Watch and shopping | Useful automation | Watches with notices; BigBasket read-only adapter and cart list | D5, D7 | False-alert rate measured; no stored credentials; no automatic purchase |
| 6. Safety and admin | Healthy communities | Pre-publish checks, moderation assistant, agent activity and system health views | Phase 4 | Moderator agreement measured; audit complete |
| 7. Measure and learn | Decisions from data | Metrics, experiments, CI | Phases 1–6 | Dashboard and one experiment run |
| Later | | Android parity, WebMCP tools for our site, browser extension for carts | Owner decisions | |

### 12.1 Feature specifications (summary)

| Feature | Problem | User | Flow | Permissions | Data | Agent | Security and privacy | Measure | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| News pipeline | Incomplete, undated news | Main Agent users | Section 8.6 | Public web only | Run sources with dates | Main Agent, research helper | Web text untrusted; no private data in queries | Golden-set pass rate | Dated, sourced answers; gaps stated |
| Clarifying question | Wrong guesses | All | Ask once when meanings differ | None | Question on the run | Both agents | None new | Clarifications that changed the answer | No question when the meaning is clear |
| Requests and offers | No help loop | Members, helpers | Section 7.5 | Post by followers or members per page rules; respond by any signed-in person | 0054 | Suggests communities | Area not address; scam checks; rate limits | Helped within 48 h | Create, respond, mark helped, report, all tested |
| Public events | Events only private | Page owners, members | Create, RSVP, update, cancel | Page roles | 0055 | Can draft events with approval | Exact address only to attendees if the owner chooses | RSVPs, attendance | Full lifecycle tested |
| Watch | Missing changes that matter | Anyone | Section 8.9 | Own watches only | 0056 | Can create a watch with approval | Public links only; no logged-in pages | False alerts | Alerts only on meaningful changes in tests |
| Shopping, read-only | Comparing 10-minute stores is slow | Families | Ask, compare, cart list, buy in store | Own lists | Cart list on the run | Main Agent | No credentials, no purchase, store terms reviewed | Lists created, links opened | Prices with source and time; no automatic action |
| Agent action card | Unclear consequences | All | Section 9.H | Existing approvals | Existing | Both | Exact payload shown | Approval rate and reversals | Matches the approved payload exactly |
| Design tokens v2 | Inconsistent, generic look | All | Section 9 | None | tokens.json v2 | None | None | Contrast checks | Generated CSS used everywhere |

## 13. Red team of this plan

| Risk | Mitigation |
| --- | --- |
| Personas are guesses | Interview 5 to 8 people (family organizer, older member, page owner, helper) before phase 4 |
| A mid model raises cost | Tiered models, per-run and daily budgets, measured tokens per answered request |
| Requests and offers attract spam and scams | Rate limits, link and phone checks, new-account holds, reports, moderator queue |
| The ongoing redesign diverges from these tokens | D1 first; the redesign consumes tokens v2; token check fails on hand-typed colors |
| Two sessions editing the same files | Section 2 rules; file-time checks; one owner per file |
| Store adapters break when sites change | Adapter tests with saved pages; clear failure message with the store link |
| Watch alerts become noise | Meaningful-change filter, daily default, easy pause, false-alert measure |
| Agent shows activity that didn't happen | States only from server events (9.H), tested |
| Older users struggle | 44–48 px targets, 200% text, plain words, one primary action per screen |
| Network policy blocks research and testing in VS Code | D7, or test in Chrome or Edge |

## 14. Final recommendation

Fix the agent's understanding and news first (phase 1, needs D2), because that is what the owner and users feel every day. In
parallel, settle the visual direction (D1) so the redesign already in progress builds on one calm, accessible token set. Then make
the agent's work visible and trustworthy (phase 3), and only then add the community help loop, public events, watches and
read-only shopping. Each step is the smallest system that reliably helps a real person finish something meaningful with less effort
and more confidence, while keeping communities safe.
