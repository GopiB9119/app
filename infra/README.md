# Local Infrastructure

Local synthetic work only. Production deployment and external providers are not enabled by this launcher.

## Capped Live Model Connection (2026-10-09)

Following the owner's direct continuation of the specific one-call, 10,000-token proposal, one synthetic
connectivity check used the existing application's `ChatModel` and retained Azure container configuration.
This supersedes the earlier pending-connectivity statements for this limited check, not for Agent workflow
or browser qualification. No credentials were displayed, copied to the host or reconstructed from deleted files.

- An offline mock failure first proved that disabling `RETRY_WAITS` only inside the probe process results in
	exactly one HTTP attempt and retains conservative failed-call accounting. The running API's retry policy
	and configuration were not changed.
- Preflight confirmed the unchanged 10,000-token per-call and 2,000,000-token aggregate limits, a configured
	shared ledger, 1,532,116 recorded tokens and zero reservations. The real request contained only synthetic
	instructions and a fresh marker, no tools or private application context, with at most 1,200 completion tokens.
- The [retained result](../backend/.local/agent-connection-once-20261009-d53da4bc.json) records **one attempt,
	HTTP 200, the exact expected reply, zero tool calls and 54 reported tokens**. The provider reported
	`gpt-5-nano-2025-08-07`; the HTTP call took 3.724 seconds in this single trial, not a latency benchmark.
- The existing ledger advanced from 1,532,116 to **1,532,170**, exactly the reported 54 tokens, with no owned
	reservation remaining. TLS verification stayed enabled. No provider/model switch, budget increase/reset,
	business mutation, web search, package installation, API restart or Android change occurred.
- The attempt marker was created exclusively before sending. Do not remove it or repeat the request to recover
	already-recorded success. This approval covered one call; it does not authorize an unlimited evaluation loop.

The LLM connection is now verified. The missing locked web dependencies still block Agent/Messages compilation,
full web build/types and browser-to-Agent evaluation. Multi-step behavior, live permission/approval controls and
model quality need a separate finite evaluation after their prerequisites are available. No new-website work
followed, and no complete-application or production-readiness claim is made. Provider pricing was not verified.

## Recovered Manual Web Qualification (2026-10-09)

The coordinated remaining account/Space batch has finished **25/25 passing**, with zero failures or skips.
Its existing process was observed to completion rather than duplicated; no Node browser-test runner remained
afterwards. Tests used the real local web proxy, API, mail and reminder workers with synthetic accounts.

| Report | Cases | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| [Earlier core journeys](../.local/old-web-core-resume-20261009.xml) | 10 | 9 | 1 | 0 |
| [Desktop diagnostic retry](../.local/old-web-desktop-diagnostic-20261009.xml) | 1 | 1 | 0 | 0 |
| [Recovered browser smoke](../.local/old-web-smoke-recovery-20261009.xml) | 2 | 2 | 0 | 0 |
| [Extended manual journeys](../.local/old-web-extended-manual-recovery-20261009.xml) | 10 | 10 | 0 | 0 |
| [Remaining account/Space journeys](../.local/old-web-manual-account-space-20261009.xml) | 25 | 25 | 0 | 0 |

Structured XML reconciliation by unique case name finds **47 distinct passing browser journeys** across these
reports. The earlier desktop `Connection closed.` failure is retained; its focused retry passed without weakening
the no-browser-errors assertion, but its cause remains unproven. These results are not one clean combined run,
and the separate API-only and offline test results are not added to this browser count.

A bounded follow-up attempted the same desktop journey three times with stack/path diagnostics and unchanged
assertions. All three passed: [attempt one](../.local/old-web-desktop-reproduce-20261009-154631-1.xml),
[attempt two](../.local/old-web-desktop-reproduce-20261009-154631-2.xml), and
[attempt three](../.local/old-web-desktop-reproduce-20261009-154631-3.xml). The original error was not reproduced
or fixed; no application patch followed. These repeated attempts do not increase the 47-journey count.

The newly completed batch covers exact checklist retries, solo/couple/group Spaces, settings, calendar views,
invitations and lost replies, ownership transfer, removal/leave/rejoin history, roles and invite policy, task filters,
real reminder delivery and fallback, notification preferences, recipient consent, post search, event edits/capacity,
record-only event budgets, and confirmed personal care records. It made no Agent requests or real provider calls.

This continuation changed no application source, packages, credentials, runtime configuration, Android or `website/`.
The Agent/rich-message dependency chain, full web build/types, model-dependent privacy and Agent journeys, and live
LLM connectivity remain unqualified. The existing registry transport/offline archive and bounded-provider approval
gates below still apply. Do not navigate to the dependency-blocked Agent route during other manual qualification;
its development compile failure can affect otherwise working pages. New-website work remains gated.

## Registry Transport Recheck (2026-10-09)

This recheck supersedes the earlier statements that `registry.npmjs.org` is absent from the local allowlist.
The coordinator added only that hostname after the owner's direct continuation of the sole registry-access proposal.
A [policy-only baseline](../.local/npm-domain-baseline-1791538222499.json) and structured comparison verified the
35 previous domains plus the new entry, filtering still enabled, unchanged deny settings and unchanged unrelated
settings. A parallel recheck preserved the resulting configuration without another permission change. Declared
configuration is not proof of successful network access; do not ask for the same hostname approval again.

- The existing `Community Platform: check package transport` task made one unauthenticated, 15-second-bounded
	HTTPS metadata request from the cached Docker image to `https://registry.npmjs.org/web-namespaces`. It failed
	during certificate-validated TLS setup with `SSLV3_ALERT_HANDSHAKE_FAILURE`, before any package was obtained.
- Windows' native TLS client also failed on the same approved URL: `curl.exe --head --fail --connect-timeout 10
	--max-time 15 --proto '=https' https://registry.npmjs.org/web-namespaces` returned exit 35 and
	`SEC_E_ILLEGAL_MESSAGE`. This agrees with the previously recorded Node handshake failure; the evidence does
	not identify which network component rejected the connection.
- A read-only routing check resolves the registry to public IPv4 addresses. Windows user Internet Settings report
	`ProxyEnable=0`, no explicit proxy server and no automatic proxy-script URL. No DNS, proxy or certificate setting
	was changed. A fresh cookie-free Chromium context, restricted to the exact approved package-metadata URL and
	with certificate validation enabled, also failed with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`; its browser was
	closed in `finally`. These observations do not identify the rejecting network component or prove a registry outage.
- After the owner reported connecting a mobile hotspot, one new certificate-validated Node request to the approved
  registry ping endpoint still failed with `EPROTO` and TLS alert 40. The connected IPv4 default route uses Wi-Fi;
  process proxy/custom-CA variables and explicit Windows user proxy settings were absent. No SSID, key file or
  credential value was read out, and no networking setting was changed. A normal external Chrome/Edge check of
  `https://registry.npmjs.org/-/ping` is the next discriminator; this session cannot establish that result.
- After permission was verified, one bounded `npm --prefix web install --ignore-scripts --no-audit --no-fund
	--prefer-offline --fetch-retries=0 --fetch-timeout=15000` attempt still exited 1 with `Exit handler never called!`.
	Certificate-validated Node requests, including one TLS 1.2 compatibility probe, returned `EPROTO` handshake
	failures; Chromium returned `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` for the approved registry ping endpoint.
	Only the verified idle old-web preview was stopped for this attempt and then restarted; backend services were preserved.
- No proxy or alternate registry was introduced, no certificate/TLS check was disabled, and no package-version
	change or placeholder renderer was used. The package manifest and lockfile are unchanged. A
	[fresh offline audit](../.local/old-web-offline-archives-1791538771485.json) still finds 35 missing manifests and
	zero verified cached archives. The [offline recovery manifest](../.local/web-offline-archive-manifest-20261009.json)
	lists only the 34 required and one optional official package archives and their existing integrity values;
	a supplied bundle must exclude credentials, environment files, keys and user data.
- The read-only Agent snapshot is complete: its existing result records 437 passes and 255 unchanged inputs,
	with no pending test run to restart. This is retained backend evidence, not a new web or live-model pass.
- After the preview restart, [mobile signup/offline recovery and pre-hydration safety pass 2/2](../.local/old-web-smoke-recovery-20261009.xml).
	The [extended provider-free browser run passes 10/10](../.local/old-web-extended-manual-recovery-20261009.xml), with
	no failures or skips: alerts/quiet hours/backup people, classification and interests, feed controls, insights,
	moderation and appeals, help requests/reports, public events, repeating reminders/snooze, and live search/access loss.
	These use real local services and synthetic accounts. They do not load the dependency-blocked Agent/rich-message
	screens, establish a successful model call, or replace the failed full component/type/build gates.
- The [remaining manual account/Space batch passes 25/25](../.local/old-web-manual-account-space-20261009.xml), no
	failures or skips. It covers checklists, solo/couple/group Spaces, settings, invitations, ownership, member removal/rejoin,
	task filters, reminders and consent requests, notification retry/fallback, calendar views, care, event capacity and budgets.
	The [deduplicated coverage index](../.local/old-web-browser-coverage-20261009.json) now records **47 distinct passing
	manual browser journeys across five reports**. The earlier desktop `Connection closed.` failure remains in that index;
	this is not one clean combined run, a complete UI qualification, or a live-model result.
- Next prerequisite: working validated HTTPS to the already-listed registry, or an owner-supplied offline cache
	containing archives that match the existing lockfile integrity values. Restore dependencies, verify Agent and
	Messages compilation, then rerun the affected browser suites. The capped live Azure check still needs explicit
	approval; no provider request or credential-file access occurred. Android and the separate website stay untouched.

## Existing Backend And Web Recovery (2026-10-09)

This continuation targets the existing `web/` and backend, not `website/` or Android. Docker Desktop is now running;
the earlier missing-Docker observation below is historical. The retained API, database, Mailpit, mail worker, reminder
worker and export worker were started without replacing containers, volumes or keys. The account-deletion worker remains stopped.
The old Next.js preview is at `http://127.0.0.1:3000`, but it is **not a working end-to-end website yet**.

Verified in this continuation:

- The retained database moved from `0057` to `0062` only after a successful backup restoration and upgrade rehearsal.
	Both the [rehearsal](../.local/old-web-upgrade-rehearsal-20261009.json) and
	[retained upgrade](../.local/old-web-upgrade-retained-20261009.json) preserve **30,048 pre-existing rows across 87 tables**,
	allowing only the intended Agent definition changes from 5/6 to 7. Eight new tables and memory defaults were checked.
	The owned rehearsal database was removed afterwards. The private pre-upgrade backup remains under `.local/`; its contents
	and encryption keys were not exposed in chat or copied into reports.
- [Migration/OpenAPI tests: 29/29](../backend/.local/old-web-migrations-20261009.xml), no failures or skips.
	A subsequent whole-contract check found Python-runtime differences in HTTP 413/422 reason phrases. Explicit response
	descriptions now preserve the existing stored contract and any custom route descriptions, without changing payload schemas
	or validation behavior. The [final focused regression suite passes 13/13](../backend/.local/old-web-openapi-final-20261009.xml).
	After an idle API reload, the actual HTTP OpenAPI document matches all **212 stored paths**, and readiness returns 200.
- [Client/BFF checks: 359/359](../.local/old-web-client-20261009.xml), no skips.
	The [Windows verification runner passes 39/39](../.local/verify/20261009-125405/summary.md).
- One new [real API/mail/database journey passes](../.local/old-web-api-transport-final-20261009.xml): two synthetic accounts,
	actual mail verification, exact task creation/completion retries, stale-write refusal, foreign-account and unauthenticated
	denial, logout revocation, and the same saved task after a fresh login. Test sessions are closed. This is API evidence,
	**not browser interaction or model-quality evidence**; no Agent endpoint is called.
- The [reviewed transport checks pass 3/3](../.local/old-web-api-transport-reviewed-20261009.xml): two fixture regressions
	plus the same real journey with exact persisted title/Space/assignee/completer checks and unauthorized-write denials.
	Mail reads reject redirects and share a bounded abort signal; cleanup attempts every synthetic logout and reports failures.
- The [complete backend run passed 1,210/1,210](../backend/.local/old-web-backend-full-20261009.xml), with no failures or skips,
	in 5,772 seconds. Its 29 warnings concern Alembic's comparison of a computed search-vector default. The
	[final evidence capture](../.local/old-web-evidence-20261009-141800719.json) found three Agent files changed from the
	during-run source capture, so this is not a full qualification of the latest working tree. Their edits were preserved.
- The [offline web-component run](../.local/old-web-components-20261009.xml) completed **828 cases: 633 passed, 195 failed,
	zero skipped**. The [failure classification](../.local/old-web-components-causes-20261009.json) identifies all 195 as missing
	dependency/bundling failures. Those screens remain unverified; they are not passing cases or established UI assertion defects.
- The separate [read-only Agent snapshot run](../.local/old-web-agent-20261009-142134594-dbe07d/reports/agent.xml)
	finished **437/437 passing**, with zero failures/errors/skips, in 1,214 seconds. Its
	[completion record](../.local/old-web-agent-20261009-142134594-dbe07d/result.json) confirms all **255 captured inputs**
	unchanged and matching the workspace. A [subsequent verification](../.local/old-web-frozen-agent-verified-20261009.json)
	confirms that match again. This overlaps the working-tree Agent run below; their counts must not be added.

Remaining gates are not waived:

- The initial npm attempt was denied by the editor's network policy; the hostname approval is now resolved as recorded
	above, but validated TLS transport still fails. Cache-only installation lacks required packages, and the failed attempts
	have not repaired the partial installation. No registry mirror, TLS bypass or removal of Markdown/math features was used.
	Typechecking fails on missing types;
	browser compilation also reports missing `@ungap/structured-clone`. The [two browser smoke cases failed](../.local/old-web-smoke-20261009.xml)
	before the account form appeared. A started preview is not a passing website.
- The [offline archive audit](../.local/old-web-offline-archives-1791533979125.json) checks platform-compatible missing
	package manifests against the lockfile's archive integrity values using npm's own cache API. It found **35 missing
	manifests and zero verified cached archives**, with no network requests or package writes. No supplied ZIP was available
	in the project locations checked. The dedicated `Community Platform: inspect offline web archives` task can repeat this
	Windows cache check after an owner supplies packages. A source-only ZIP does not resolve missing dependency archives.
- The retained API container still has the project's Azure configuration despite deletion of its host environment file.
	A [presence/count-only check](../.local/old-web-model-presence-20261009.json) confirms the existing 10,000-token call cap,
	2,000,000-token total cap, configured ledger and 1,532,116 recorded tokens. No credential value was printed or copied and
	no provider request was made by this check. Earlier combined permission questions received no affirmative selection;
  the later registry-only continuation resolved package-host access, not LLM spending. Live-model verification still needs
  its bounded approval. Configuration is not proof of a successful model call.
- The broader [offline tooling run](../.local/old-web-tooling-20261009.xml) has **114 passes and 35 failures**, no skips.
	The supervisor explicitly requires Linux/macOS; launcher tests use POSIX executable/signal and symlink behavior. Guards and
	assertions were not disabled. No Linux Node runtime is cached. The raw JUnit report contains ANSI control text; counts were
	recovered with standard ANSI stripping in memory, leaving the failed report unchanged.
- [255 backend input hashes](../.local/old-web-backend-inputs-20261009.json) were captured during the full run. The final
	differences are `backend/app/modules/agents/runtime.py`, `backend/app/modules/agents/toolkit.py` and
	`backend/tests/test_agent_runtime.py`. The subsequent read-only snapshot run above qualifies the current Agent slice,
	not a new full-backend run or live model evaluation. Historical governance files remain absent and were not recreated.
	New-website implementation is gated on resolving the old-web and model blockers.
- After the later browser checks below, account routes again returned the same missing-Agent-dependency HTTP 500.
	An ownership-checked restart of only the idle Next preview did not restore the manual test pages. The additional
	[manual browser run](../.local/old-web-extended-manual-20261009.xml) was interrupted after repeated startup failures;
	it has no qualifying suite verdict. Only its verified test process tree was stopped; backend/data services were untouched.
	Do not substitute preview restarts or placeholder renderers for restoring the locked packages.

## Resumed Agent And Browser Verification (2026-10-09)

The resumed work kept Android, `website/`, credentials and network policy unchanged. Existing concurrent task,
test and documentation edits were preserved. This is local synthetic verification, not production qualification.

- The interrupted comment-review test demonstrated a stale-parent approval. The repair stores the authorized
	internal post revision, then checks it while holding the post lock in the approval transaction. Public read DTOs
	still do not give non-owners a management ETag. Both roles reject changed parents and accept unchanged comments
	with exactly one effect on approval replay: [four focused cases pass](../backend/.local/agent-comment-review-roles-after-20261009.xml).
- The dedicated `Community Platform: qualify current Agent backend 20261009 d53da4bc` task completed
	[437/437 tests](../backend/.local/agent-resume-regression-task-20261009.xml), zero failures/errors/skips, in
	1,736.49 seconds. Its five warnings concern Alembic computed-default comparison. It covers runtime, model
	transport/accounting, auto-approval, Main/Space boundaries, registry, mentions and metrics, including the token,
	transaction, document-paging, compaction and comment repairs. This run used the working tree, not the separate
	read-only source-snapshot run recorded above. The earlier delegated summary had no corresponding JUnit report
	and is not accepted as test evidence.
- The full-backend manifest comparison found only `runtime.py`, `toolkit.py` and `test_agent_runtime.py` changed
	since that run's capture. Do not add the overlapping 1,210 and 437 counts or call the changing tree a frozen release.
- Before activation, source and database both reported `0062`, there were zero queued/running/verifying Agent runs
	and zero Node test runners, and the retained API mount was confirmed as this repository's backend. Only
	`community-platform-api-1` was restarted; readiness returned `ready`. Existing configuration, volumes, keys,
	workers, token limits and ledger were preserved; the account-deletion worker was not started.
- After reload, the [real API/mail/database journey passes 1/1](../.local/old-web-api-transport-resume-20261009.xml).
	It checks synthetic account verification, exact task retries, persisted fields, unauthorized writes, logout and
	fresh-session reads. This is not a model or browser interaction test.
- The original Next.js preview was restarted at `http://127.0.0.1:3000` after confirming the port was free.
	[Mobile signup/offline recovery and pre-hydration form safety pass 2/2](../.local/old-web-smoke-resume-20261009.xml).
	The [ten core browser journeys passed 9/10 initially](../.local/old-web-core-resume-20261009.xml): Space/event polls,
	Spaces, tasks, public content/lifecycle, event time zones and document search/deletion passed. Desktop account
	signup/profile/revocation/recovery captured an uncaught `Connection closed.` error. The same journey
	[passes its focused retry](../.local/old-web-desktop-diagnostic-20261009.xml) with added stack/path diagnostics and
	the unchanged no-browser-errors assertion. Its cause remains unproven. Twelve distinct browser journeys have
	passing results across these runs, not one clean combined run.
- Opening `/app/agent` directly confirms HTTP 500: `mdast-util-to-hast/lib/footer.js` cannot resolve the locked
	`@ungap/structured-clone` dependency. QA found 34 required missing packages plus the optional `@emnapi/runtime`
	entry, reconciling the 35-manifest archive audit. No matching cached archives were found. The Agent UI, rich
	content, affected Messages views, full web build/types and wider browser suite remain unqualified.
- Explicit requests to permit `registry.npmjs.org` and one synthetic Azure call of at most 10,000 tokens within
	the existing 2,000,000-token cap received no affirmative selection. No package retry, allowlist/TLS change,
	provider request, credential reconstruction or budget reset followed. Live LLM connectivity and quality remain
	unverified. Restore the locked dependencies through approved access, then run these gates before new-website work.

## Windows Setup Check (2026-10-09)

Scope is the existing `web/`, backend and supporting tooling only. Android was neither changed nor tested, and the concurrent
`website/` work was preserved. Historical runtime checkpoints below do not establish service availability on this Windows host.

- Node `v24.20.0` and Python 3.12 are available, including the root `.venv` interpreter. Both package installs failed:
	`npm.cmd --prefix web ci --no-audit --no-fund --prefer-offline --fetch-retries=0 --fetch-timeout=15000` encountered an
	HTTPS handshake failure at `registry.npmjs.org`; the backend install task failed fetching its setuptools build dependency
	from `files.pythonhosted.org`. Windows curl reproduced the npm-host TLS failure. Certificate validation was not disabled.
- Docker is absent from PATH and its standard Desktop installation path; WSL lists no installed distribution. No API or
	PostgreSQL listener was found on the standard ports. Port 3000 belongs to a Python static server for `website/`, not Next.js;
	that process was left running. No backend, worker, container or existing-web preview was started in this continuation.
- The [backend install task](../.vscode/tasks.json) now passes zero retries, a 15-second timeout and disabled pip version checks
	through environment variables so build-isolation subprocesses inherit them. A direct virtualenv pip configuration check passed.
- Fresh checks: [Windows runner 39/39](../.local/verify/20261009-103012/summary.md), and
	[design tokens 11/11 plus golden evaluator 69/69](../.local/verify/web-backend-20261009-offline/summary.md). These 119 offline
	passes validate tooling, not application startup, browser-to-database journeys or model quality. The earlier runner fixes
	retain chained-command output, tolerate child-held log files and report unavailable Git evidence explicitly.
- Remaining prerequisites: working HTTPS package downloads, owner-installed/running Docker Desktop, and a coordinated switch
	from the `website/` preview before starting `web/` at the required `http://127.0.0.1:3000`. Backend tests, web types/build and
	browser end-to-end tests remain unverified. No data reset, key replacement, provider call or deployment occurred.

Checks ran on commit `153db79` with an uncommitted, concurrently changing worktree, not a frozen release candidate.
Historical governance documents are still absent and were not recreated.

## Account Downloads And Focused Follow-Up (2026-10-08)

The continuation closed a real operational gap: the retained runtime had API, mail and reminder workers but **no export worker**,
so account downloads could not finish. The existing dedicated export worker is now running through the guarded launcher.
`--component exports` requires the worker's source to be present in the verified manifest, keeps providers disabled, and does
not launch account deletion. Existing three-component captures still validate for their original components.

Before starting exports, verify exact retained container ownership/ports, an existing matching key, and that no export worker
already uses this runtime. Then check and start only that component:

```sh
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-polls-20261007-0bk7P8/runtime.json --component exports --check
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-polls-20261007-0bk7P8/runtime.json --component exports
```

The [new account-data live journey](../.local/verify/all-features-followup-20261008-zFSI9y/account-data-live-final.xml) passes
through the real browser, proxy, API, export worker and PostgreSQL. It checks reviewed memory/inbox/interest withdrawal,
exact export retry, a real JSON download containing only the requesting account's selected data, cross-account and cross-session
download rejection, export cancellation and closing account-deletion confirmation without sending a deletion request.
The mobile dialog is checked after its entrance animation settles, at 320 px with normal and measured doubled text, including
focus, pointer reachability and opaque surface. The original mid-animation screenshot was not a persistent styling defect;
no application styling was changed.

A [bounded chat-availability journey](../.local/verify/all-features-followup-20261008-zFSI9y/chat-availability.xml) also passes:
two users, active typing/live streams, ten exact persisted messages and thirty concurrent API/proxy health reads.
The slowest read was **284 ms**. This did not reproduce the earlier timeouts; it does not prove their historical cause or replace
a sustained soak test. These two new journeys bring recorded local coverage to **53 distinct passing journeys** across this pass
and the preceding audit, not 53 tests rerun together.

Other focused checks:

- [20/20 launcher safety tests](../.local/verify/all-features-followup-20261008-zFSI9y/launcher-exports.xml), including uncaptured/tampered export-worker refusal and fixed provider-disabled launch arguments.
- [3/3 Agent projection checks](../.local/verify/all-features-followup-20261008-zFSI9y/agent-protocol-current.xml),
	[18/18 selected scripted Agent state-transition/OpenAPI checks](../.local/verify/all-features-followup-20261008-zFSI9y/agent-state-transitions.xml),
	[3/3 interaction/shared-renderer checks](../.local/verify/all-features-followup-20261008-zFSI9y/agent-rendering.xml),
	[62/62 current Agent client checks](../.local/verify/all-features-followup-20261008-zFSI9y/agent-client-current.xml), and web types.
	These are overlapping focused subsets, not a new full backend/browser sweep.
- The first contract check caught new Agent interaction fields missing from the stored OpenAPI. The repository generator repaired
	it; [final current-source parity](../.local/verify/all-features-followup-20261008-zFSI9y/openapi-final-check.log) and
	[unchanged inputs during that check](../.local/verify/all-features-followup-20261008-zFSI9y/current-backend-inputs.json) pass.
	Concurrent Agent work is preserved. These results do not activate all newer backend bytes in the retained captured runtime.

The new private pre-live backup was restored only into a separately owned disposable database. The
[final read-only comparison](../.local/verify/all-features-followup-20261008-zFSI9y/data-continuity-final.json) confirms **all 3,222
pre-test rows across 96 tables and the original identity key are unchanged**. Synthetic test fixtures remain. Only the owned
verification database and temporary credentials were [removed](../.local/verify/all-features-followup-20261008-zFSI9y/cleanup.json).
The [runtime checkpoint](../.local/verify/all-features-followup-20261008-zFSI9y/runtime-source-checkpoint.json) verifies one API,
mail, reminder and export worker using the retained database/key, with providers disabled and local readiness returning 200.

After that checkpoint the export-worker terminal exited without an application traceback. Inspection confirmed the worker was
absent while the other components and retained containers were still running. Only exports was restarted through the same guard;
the [real download recovery journey passed 1/1](../.local/verify/all-features-followup-20261008-zFSI9y/export-worker-recovery.xml),
and the [recovery checkpoint](../.local/verify/all-features-followup-20261008-zFSI9y/export-recovery-runtime.json) confirms exactly
one correctly bound provider-disabled worker. No database reset or key replacement occurred. The terminal-exit cause is not established.

Remaining boundaries: a real Agent model/provider connection still needs explicit approval and private configuration. The
account-deletion worker was intentionally not started; enabling scheduled permanent erasure is a separate destructive operation.
No database reset, migration, key replacement, external provider, deployment or Android change occurred. Historical missing
governance documents and the earlier unexplained interruptions remain documented in the preceding audit.

## Local Feature Verification (2026-10-08)

The local preview is [http://127.0.0.1:3000](http://127.0.0.1:3000). This pass checked the existing backend/web features,
repaired verification fixtures and restored only a missing web preview. It did not reset the retained database, replace its key,
activate providers, deploy, change product behavior or modify Android. The concurrent `0062` activation below belongs to its
own workstream, not this verification pass.

**51 distinct live journeys passed**, counting each journey once across the initial run and focused repairs/reruns:

| Area | Fresh Evidence |
| --- | --- |
| Accounts, sessions, recovery, Spaces, invitations, ownership, membership and tasks | [11 live journeys](../.local/verify/all-features-20261008-baseline/live-identity-spaces-tasks.xml), plus initial checklist/solo/settings cases |
| Reminders, notifications, consent, chat, replies and recurrence | [4 initial passes](../.local/verify/all-features-20261008-baseline/live-reminders-messaging.xml) and [3 focused passes](../.local/verify/all-features-20261008-baseline/live-messaging-recurrence-retry.xml); real mail/reminder workers |
| Community, events, care, documents, groups, roles, calendar, capacity, budgets and search | [12 initial passes](../.local/verify/all-features-20261008-baseline/live-community-events-care-search.xml), [archive/Couple rerun](../.local/verify/all-features-20261008-baseline/live-archive-couples-final.xml), [timezone rerun](../.local/verify/all-features-20261008-baseline/timezone-final.xml) |
| Moderation and public events | [Moderation/appeal and checked role cleanup](../.local/verify/all-features-20261008-baseline/live-moderation-final.xml), [public event journey](../.local/verify/all-features-20261008-baseline/live-page-events.xml) |
| Standalone and event polls | [New two-person standalone journey](../.local/verify/all-features-20261008-baseline/live-space-polls.xml), event-poll journey in the [initial live report](../.local/verify/all-features-20261008-baseline/live-provider-free.xml) |
| Agent memory/inbox, alerts, interests, feed controls and help requests | Passing cases in the [initial live report](../.local/verify/all-features-20261008-baseline/live-provider-free.xml); Agent history is explicitly synthetic and no model request is sent |

The [case index](../.local/verify/all-features-20261008-baseline/test-report-index.json) retains failures and repeated cases;
the passing total is not the sum of every report. Initial live attempts encountered terminated browser/preview processes and
temporary BFF timeouts. Their failed reports remain intact. Focused reruns passed, but the interruption causes were not fully
established, so this is not an uninterrupted soak test or a perpetual availability guarantee.

Other verification and repairs:

- A [766-file source capture](../.local/verify/all-features-20261008-baseline/source-capture.json) ran the full backend suite:
	**1,188/1,189 passed** initially. The one failing migration test assumed head `0061`; it now checks preservation of the actual
	starting revision after a refused destructive downgrade. The entire affected [event-poll slice passed 32/32](../.local/verify/all-features-20261008-baseline/event-polls-fixed.xml).
- The full offline browser suite initially passed **814/821**. All seven failures came from a missing typing-roster fixture.
	The exact account-bound GET is now modeled without relaxing unexpected-write or polling assertions; the [realtime slice passed 19/19](../.local/verify/all-features-20261008-baseline/realtime-fixed.xml).
	Neither full suite was rerun in its entirety after these test-only repairs; focused results overlap the original counts.
- [356 client/BFF tests, 60 runner tests, 11 token tests and 69 golden-evaluator tests](../.local/verify/all-features-20261008-baseline/summary.md) passed, as did 19 guarded-launcher tests.
	[Exact captured OpenAPI parity](../.local/verify/all-features-20261008-baseline/openapi.log), web types and the
	[isolated production build](../.local/verify/all-features-20261008-baseline/web-build.log) passed. Golden-evaluator tests do not establish live model quality.
- Live fixtures now honor the private Mailpit URL. Moderation can use an explicitly selected guarded runtime and removes only
	its own synthetic roles. The Couple selector targets the visible responsive label. The timezone journey accepts installed
	IANA catalog differences while retaining exact UTC/local persistence and unsupported-zone rejection; all five focused timezone checks pass.
- The new standalone-poll journey verifies exact creation retry, cross-browser updates, private ballot views, change/withdrawal,
	closure permissions and keyboard/pointer reachability at 320 px with measured doubled text.

Data preservation: the private pre-live backup was successfully restored into this session's independent disposable database.
A read-only comparison covered **96 tables and 997 pre-test rows**: **987 saved rows remained unchanged**;
only ten expired rate-limit buckets were removed by the existing mail-worker cleanup. The original identity key is unchanged.
See the [preservation summary](../.local/verify/all-features-20261008-baseline/data-preservation-summary.json) and
[restore result](../.local/verify/all-features-20261008-baseline/backup-restored.json). Fresh synthetic test accounts and their
fixtures remain. Only the separately owned test container and its temporary credentials were [removed](../.local/verify/all-features-20261008-baseline/cleanup.json);
the retained database/mail containers, named volume, key and backups were preserved.

Qualification limits: Agent interaction-schema/client work changed concurrently after the fixed capture. The
[source comparison](../.local/verify/all-features-20261008-baseline/source-qualification.json) records that boundary;
[78 affected client/localization checks](../.local/verify/all-features-20261008-baseline/agent-clients-followup.xml) and a final
web type check passed, but this does not qualify that new backend protocol or activate it in the captured runtime.
Three legacy Agent/privacy live journeys require model requests and remain unqualified; provider-dependent suites were not
approved. Privacy/export/deletion have backend/offline evidence, not a new complete live-erasure certification. Missing historical
governance documents still prevent complete records/structure gates; they were not recreated or bypassed.

The [final runtime checkpoint](../.local/verify/all-features-20261008-baseline/final-runtime.json) verifies the `0062` captured API,
one mail worker and one reminder worker against the retained database/key, with providers disabled. Preview/API readiness and
proxied reads returned 200. The restored preview uses `COMMUNITY_BUILD_LABEL=all-features-20261008` with telemetry disabled;
the production build uses separate output. Only this pass's generated TypeScript include entries were removed.

## Agent Poll Runtime Activation (2026-10-08)

The retained fresh synthetic runtime now uses migration `0062` and the qualified 191-file backend snapshot under
`.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/backend`. Only four Agent implementation files and migration
0062 differ from the preceding snapshot. Existing database/mail containers, loopback ports, named data volume and identity key
were preserved. The original snapshot and private preflight/quiesced database backups remain available; neither a reset nor
recovery of the older missing runtime was performed.

The backup was restored into a separately owned rehearsal database before the real handoff. Both rehearsal and quiesced live
migration preserved **884 existing rows across 95 tables** and all **12 Agent identities**, allowing only the expected Space
definition-version change from 6 to 7. See the [rehearsal](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/rehearsal-migration.json)
and [actual preservation report](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/migration.json).
These are migration-time counts; subsequent synthetic browser checks intentionally create their own accounts and fixtures.

The existing migration/history regression passed **1/1** using the staged interpreter and an isolated test schema:
[JUnit](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/migration-test.xml).
The API and both workers were restarted through the unchanged guarded launcher only after verifying ownership and process identity.
Fresh checks found one process per component, matching source/database/key bindings, database revision `0062`, and ready API/proxy
responses. The live OpenAPI exactly matched the qualified contract, including `poll` evidence:
[runtime checkpoint](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/runtime-summary.json).

The existing live Agent memory/inbox and two-user manual event-poll journeys passed **3/3**, including mobile doubled-text checks,
with **192 unchanged watched inputs** and no failures/skips:
[JUnit](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/live-tests.xml),
[input hashes](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/live-inputs.json),
[stability result](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/live-inputs-result.json).
These journeys do not submit model requests; synthetic seeded history is not model output.

The rehearsal container and its volume were removed after exact ID/label checks, its temporary credential file was removed,
and the upgrade lock was released only after readiness: [cleanup](../.local/synthetic-api-polls-20261007-0bk7P8/upgrade-0062-qcJSwn/cleanup.json).
The active services remain running at this checkpoint. The preview is [http://127.0.0.1:3000](http://127.0.0.1:3000).

**Model activation remains blocked.** No endpoint, model name or key is configured in the runtime/inherited settings, and the usual
private model configuration file is absent. The launcher still forces providers and tracing off. The owner must select a local model
endpoint or explicitly authorize an external provider/model, private credential setup and spending limit before conversational
activation. No paid call, live-model quality claim, approval-policy change, Android work or production deployment occurred.

## Fresh Poll Runtime (2026-10-08)

The local poll runtime was originally provisioned at `.local/synthetic-api-polls-20261007-0bk7P8/runtime.json`: a separate fresh synthetic
database, a new identity key and a fixed 190-file backend capture at migration `0061`. The [activation above](#agent-poll-runtime-activation-2026-10-08)
now advances that same retained runtime to `0062`. It is **not a restoration** of the older
runtime below. That runtime's backups, key and metadata were left untouched. The database uses the owned named volume
`event-polls-0bk7P8-data`, rather than tmpfs. Container/volume deletion would still lose this new data; no reset was performed.

On continuation, both new containers were stopped. Their exact IDs, owner labels and volume were checked before starting those
same containers. Docker reassigned their temporary loopback ports, so only the new runtime's structured port settings were refreshed:
PostgreSQL `32768`, SMTP `32769`, Mailpit HTTP `32770`. These are checkpoint values, not permanent port reservations. Always verify
actual bindings and ownership before starting components; the launcher validates metadata but does not reconcile Docker ports.

The API at `http://127.0.0.1:8000`, private mail worker and reminder worker run through the existing guarded launcher. Actual process
snapshot/database bindings, blank model/web-provider settings and database revision `0061` were verified. The frontend serves
`http://127.0.0.1:3000/app/events` using isolated generated output (`COMMUNITY_BUILD_LABEL=poll-mobile-finish-20261008`).
[Runtime checkpoint](../.local/verify/poll-mobile-finish-20261008-YoO6L5/runtime-summary.json) records the inspected processes and limits.

The two-person [live poll journey](../tests/e2e/identity.test.mjs) now passes: synthetic registration through private mail, invitation,
reviewed poll creation, requester-only ballot information, committed vote with lost reply, exact retry, changed choice, older replay
without rollback, withdrawal, member closure denial and owner closure. The mobile Save check still requires keyboard focus, a 44 px
target, pointer hit testing and no horizontal overflow at measured doubled text. No Agent/model request or external action is sent.

The original failure was reproduced with the Profile tab covering Save: the sticky navigation grew to 201 px at doubled text.
The [navigation](../web/src/features/platform/navigation.tsx) now measures its height with ResizeObserver, and the page reserves that
space through scroll padding. The desktop sidebar does not add a bottom inset. Assertions were strengthened with hit-target diagnostics,
not relaxed or replaced by forced clicks. Inspected [mobile capture](../.local/screenshots/event-polls-live-320.png) shows Save above the tabs.

Final checks: **94/94 event/client**, **34/34 shared-layout** and **1/1 live poll journey**, plus web types and editor diagnostics.
[Events JUnit](../.local/verify/poll-mobile-finish-20261008-YoO6L5/events.xml),
[shared-layout JUnit](../.local/verify/poll-mobile-finish-20261008-YoO6L5/shared-layout.xml),
[live JUnit](../.local/verify/poll-mobile-finish-20261008-YoO6L5/live-final.xml) and
[unchanged input hashes](../.local/verify/poll-mobile-finish-20261008-YoO6L5/inputs.sha256) are retained.
An intermediate live attempt failed at registration with 503 after the API process disappeared; its [failed report](../.local/verify/poll-mobile-finish-20261008-YoO6L5/live.xml)
remains separate. Only the absent API was restored, and the unchanged journey then passed. Its termination cause was not established.

From the application root, with those owned services available and current mailbox port verified:

```sh
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-polls-20261007-0bk7P8/runtime.json --check
COMMUNITY_WEB_URL=http://127.0.0.1:3000 COMMUNITY_MAIL_URL=http://127.0.0.1:32770 \
COMMUNITY_CHROMIUM_PATH=<installed-chromium> FORCE_COLOR=0 \
node --test --test-name-pattern='^polls: reviewed creation' tests/e2e/identity.test.mjs
```

Start a missing component only after confirming no duplicate, using the same runtime with `--component api`, `mail` or `reminders`.
Temporary TypeScript includes added by this preview were removed; earlier unrelated entries were preserved. This is local synthetic
workflow qualification, not production readiness, a native-device audit, translation approval, real-user evidence or live-model evaluation.
Old data recovery, external integrations and provider spending remain separate decisions. Recheck liveness after interruptions.

## Earlier Availability Checkpoint

At 2026-10-07 18:00 UTC, both exact container IDs recorded for `synthetic-api-20261007-wfwl2m__` were absent. The retained
metadata/source manifest still validates and records revision `0059`, but no running database revision could be verified.
The frontend was restored on `http://127.0.0.1:3000`; `/app/events` returns 200 while `/api/timezones` returns 503.
[Read-only preflight evidence](../.local/verify/event-poll-review-final-20261007t174116z-9f076a8a9b5c/runtime-preflight.json)
records the missing database and Mailpit. No runtime, container or saved data was recreated or repointed during this check.

The launcher commands below cannot recover missing tmpfs data or provision new containers. Before live qualification, choose
a separately provisioned fresh synthetic runtime or an owner-reviewed restore using a matching backup/key. Existing backup
contents were not inspected or certified here. Do not treat an old `runtime.json`, key file or historical passing checkpoint
as proof that the corresponding database still exists. Earlier activation/recovery records below are historical evidence.

## Isolated Synthetic Runtime

[scripts/synthetic-api.mjs](../scripts/synthetic-api.mjs) launches one foreground component from an already-provisioned runtime.
It does not provision containers, install dependencies, migrate or reset data, generate or copy keys, restart services, or clean up containers.

The runtime provisioned on 2026-10-07 is described by
`.local/synthetic-api-20261007-wfwl2m__/runtime.json`, with its own interpreter, captured backend, identity key path and container IDs.
It uses the synthetic `community_test` database on loopback port `32788`, private Mailpit HTTP `32787` and SMTP `32786`,
and API `http://127.0.0.1:8000`. Its original revision was `0057`; the retained runtime is now on `0059`
after the [guarded activation](#agent-controls-activation-2026-10-07) below. The API, mail and reminder components run through this launcher.
Subsequent provider-free memory/inbox browser journeys passed against the upgraded snapshot. Coordinate any further handoff with the owning workstream;
do not start duplicate components, stop another workstream's supervisors, or change runtime metadata to work around a busy port.

Recovery checkpoint, 2026-10-07 14:20 UTC: the web preview was available but API-backed reads returned 503 because the API
and workers were absent. Before restoring them through this launcher, the exact recorded container IDs/ownership labels,
running state and loopback ports were checked through the local Docker socket; the existing private key was present, the
database still reported revision `0057`, and no duplicate component or API listener was found. One API, mail worker and
reminder worker were then started. Direct timezones and proxied timezones, taxonomy and public-page reads all returned 200
with JSON responses ([recovery report](../.local/verify/runtime-recovery-20261007-cEs0HP/summary.json)).
No container restart, data reset, key replacement, migration or provider activation occurred. This restores the retained
180-file snapshot, not the current backend worktree; it does not qualify newer Agent changes or signed-in worker journeys.
Process availability at this checkpoint is not a guarantee of continued service; check current ownership/health before any later restart.

### Agent Controls Activation (2026-10-07)

The owner's continuation requested activating the completed local controls. A backup of the retained synthetic database was restored
into a separately owned rehearsal container before migration. A fixed 182-file backend snapshot was staged under
`.local/synthetic-api-20261007-wfwl2m__/upgrade-0059-Mu5ir2/backend`; no key, dependency environment or saved environment file was copied.
The rehearsal reached `0059`. Its initial OpenAPI check caught a concurrently added `needs_you` filter; the staged contract was
regenerated and matched before activation, without overwriting the other workstream's contract.

Before the actual handoff, the recorded PIDs had exited. The ownership guard stopped instead of signaling stale identifiers.
No component or port-8000 listener was present on the next check, allowing a final quiesced backup without killing any process.
Migration continuity matched **1,844 existing rows across 87 pre-existing tables**, with the expected Space-agent definition-version
change checked separately. See the [migration result](../.local/synthetic-api-20261007-wfwl2m__/upgrade-0059-Mu5ir2/migration.json).
The original identity key and the exact database/mail containers were preserved; neither container was restarted or reset.

The runtime metadata now selects the staged source/manifest and revision `0059`. Fresh checks verified the live API contract,
actual database revision, one process per component, matching snapshot/database/key paths and blank model/web-provider settings.
Process metadata was refreshed with verified child/launcher PIDs. The upgrade lock was released only after live verification.
These files identify a checkpoint, not permanent PID ownership; always revalidate before signaling anything.

The [opt-in live regression](../tests/e2e/agent-controls.test.mjs) passed **2/2**, with zero failures/skips and unchanged watched
web/test inputs: [JUnit](../.local/verify/agent-controls-live-20261007-lGBSp5/live-tests.xml),
[input hashes](../.local/verify/agent-controls-live-20261007-lGBSp5/web-inputs.sha256). It registers fresh synthetic accounts through
the browser, proxy, API and private mail worker, then seeds only those accounts with explicitly labeled synthetic memories/history.
It verifies committed memory edits after lost replies, exact retries, re-enable, current-state replay, deletion, inbox paging/filtering,
cross-Space isolation, status-bound cursors and persisted cancellation at desktop and 320 px doubled text.
No Agent request is submitted; seeded history is not a live model result or evidence of AI quality.

The separate [upgrade-preservation regression](../backend/tests/test_agent_kinds.py) passes **1/1** in a fresh isolated schema of the
restored rehearsal database: [JUnit](../.local/verify/agent-controls-live-20261007-lGBSp5/upgrade-test.xml). It checks existing sessions,
notes, request/approval history and pending approval execution after upgrading from `0057`. The exact rehearsal container was then
ownership-checked, removed with its anonymous volume and confirmed absent. The retained runtime containers remain running.

Private preflight/quiesced dumps and the old source/metadata remain under the owned directory; dumps and the unchanged key have mode
`0600`. They are local recovery artifacts, not public fixtures or files to commit. Never downgrade the active database merely to
switch snapshots: `0059` refuses loss of disabled settings/edit receipts, and returning to a pre-upgrade dump would discard later writes.
Any rollback requires a coordinated, separately reviewed data/key/source recovery. The database container still uses tmpfs.

The first browser attempt hit preview compilation/termination before feature assertions. A subsequent default-cache launch returned
`adapterFn is not a function`. A fresh isolated preview build (`COMMUNITY_BUILD_LABEL=agent-controls-live-6f348466`) served the same
source correctly; no application patch or cache deletion was needed. The original termination cause is not established.
An empty-file test pass was rejected before the named test was persisted, and a fixture indentation error was repaired before the
two-case pass. Temporary generated TypeScript includes were removed; types and editor checks pass. These setup failures are not
counted as successful journeys or relabelled as product regressions.

The preview remains at `http://127.0.0.1:3000`; do not replace another owner's listener. This activation does not qualify production,
native clients, all newer backend worktree changes, live models or external actions. Providers and tracing remain disabled, and no
spending limit, deployment or user privacy/approval policy changed.

From `/workspaces/event/app`, first check the metadata and captured source without starting a child:

```sh
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-20261007-wfwl2m__/runtime.json --check
```

After the owner has arranged the handoff, run only the needed components, each in its own foreground terminal:

```sh
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-20261007-wfwl2m__/runtime.json --component api
```

```sh
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-20261007-wfwl2m__/runtime.json --component mail
```

```sh
node scripts/synthetic-api.mjs --runtime .local/synthetic-api-20261007-wfwl2m__/runtime.json --component reminders
```

The API binds only to `127.0.0.1:8000`, with one worker and no reload process. Other component names and extra arguments are rejected.
Stop a foreground component with **Ctrl+C**. The launcher forwards SIGINT/SIGTERM only to its direct child and propagates child failures;
it does not search for other processes, restart children, or stop containers.

## Validation And Provider Boundary

Runtime metadata must be a non-redirected `runtime.json` immediately inside the project's `.local/synthetic-api-*` directory,
with the matching `community.synthetic.owner` label recorded in metadata. Snapshot, interpreter, manifest and key paths must resolve
inside that owned directory. A missing key file is accepted when its parent already exists inside the directory; the launcher neither
reads nor creates the key. Python user-site and environment-path injection are disabled for launched components.

The launcher reads `source-manifest.json` with `snapshot_root` and a `files` array of
`{ path, sha256_before, sha256_after, bytes }` entries. Each captured file must match **both** SHA-256 hashes and its recorded byte count
when provided. Source paths cannot escape the snapshot or name key/environment files. All three component entry points must be listed.
This verifies the listed captured bytes, not the current working tree: the snapshot must never be described as live-current-source.
Selecting `--component exports` additionally requires `app/export_worker.py` in that same verified manifest. The dedicated export
worker builds and expires download copies; it never starts the separate account-deletion worker. Deletion is not an accepted launcher component.

Only the synthetic `community_test` PostgreSQL database, explicit valid ports, loopback database/SMTP/Mailpit hosts, and the fixed API URL
are accepted. Database URL query parameters are rejected because they can override connection targets.
Inherited `COMMUNITY_`, `OPENAI_`, `AZURE_OPENAI_`, `LANGCHAIN_`, `LANGSMITH_`, `TINYFISH_`, `OTEL_`, proxy and Python-path injection settings
are removed, as are libpq `PG*` settings that could redirect a database connection. Normal `PATH` and `HOME` remain.
The child uses the validated runtime environment, database, SMTP and key-path settings;
other runtime environment entries cannot override the launcher policy.
`COMMUNITY_AGENT_MODEL_URL`, `COMMUNITY_AGENT_MODEL_NAME`, `COMMUNITY_AGENT_MODEL_KEY` and `COMMUNITY_AGENT_WEB_KEY` are forced blank,
LangChain/LangSmith tracing is false, and the OpenTelemetry SDK is disabled.

This is a local launch guard, **not a security sandbox** or network isolation. The interpreter, installed dependencies, captured code,
metadata and unchanged filesystem are trusted. No external provider evaluation or production action is authorized.
`--check` prints only selected safe paths, recorded migration, recorded container IDs/label, local URLs, source count and disabled-provider status.
It makes no network or Docker calls, does not confirm container labels against Docker, and does not prove live service health or migration state.
It never prints the database URL, key contents or the entire environment.

## Private Mailpit And Tests

The launcher sets `COMMUNITY_MAIL_URL` to `runtime.mailUrl` and `COMMUNITY_WEB_URL` to `http://127.0.0.1:3000` for its child.
It does not change another terminal or the existing web process. Always pass the private Mailpit override explicitly to separately run e2e tests;
otherwise their defaults can target shared mail. The private Mailpit UI for this runtime is `http://127.0.0.1:32787`.

Owner-coordinated live checks, only after the API and web preview are available:

```sh
COMMUNITY_WEB_URL=http://127.0.0.1:3000 COMMUNITY_MAIL_URL=http://127.0.0.1:32787 node --test --test-concurrency=1 --test-name-pattern='^spaces: create|^invitations: intended|^tasks: admitted' tests/e2e/identity.test.mjs
```

Launcher-only checks are network-free and use temporary synthetic files and bounded child stubs, never this real runtime or Docker:

```sh
node --test --test-name-pattern='valid runtime|inherited environment|manifest hashes' scripts/synthetic-api.test.mjs
node --test scripts/synthetic-api.test.mjs
```

## Fresh Data, Recovery And Cleanup

A fresh synthetic runtime is separate from shared database/key recovery. On the first application startup, existing backend behavior may
create the absent owned key for fresh synthetic data; `--check` leaves it absent. Never substitute a newly generated key for the key that
encrypted an existing database. Shared recovery requires the owner's matching database/key backup and a separately approved recovery process,
not this launcher, repointed metadata, copied keys, or a database reset.

The isolated synthetic PostgreSQL data uses **tmpfs**: container removal loses it, and stopping/restarting a tmpfs-backed container also loses
its in-memory data. Do not treat the runtime or Mailpit as durable storage. Keeping the key file alone cannot recover a lost database.

Cleanup is manual and belongs to the runtime owner, after foreground components and verification work have finished.
Take the **exact full container IDs** from the runtime metadata or `--check`, inspect each exact ID, and confirm its actual
`community.synthetic.owner` label equals `synthetic-api-20261007-wfwl2m__` before any destructive action.
Only then may the owner stop/remove those individually confirmed IDs. Never select containers by broad names, filters or wildcard matches;
this launcher performs no cleanup and cannot confirm ownership from recorded metadata alone.
