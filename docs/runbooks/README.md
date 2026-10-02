# Local Synthetic Build

The current slice includes account access, private family Spaces, intended-account invitations, reviewed member removal/self-leave, ordinary shared tasks and recipient-approved reminders with an in-app inbox. Use synthetic `.test` addresses only. Mailpit captures account verification mail locally; task reminders use no external provider, real family/care data or Agent. The [membership runbook](FAMILY_MEMBERSHIP.md) and [reminder runbook](SELF_REMINDERS.md) contain the domain rules, commands and evidence.

## Run Locally

From the repository root, with Docker and existing project dependencies available:

```powershell
docker compose -f infra/compose.yaml build api reminder-worker
docker compose -f infra/compose.yaml run --rm api python3 -m app.cli migrate
docker compose -f infra/compose.yaml up -d --build api identity-mail-worker reminder-worker
$env:COMMUNITY_WEB_ORIGINS='http://127.0.0.1:3000'
$env:COMMUNITY_BUILD_LABEL='local-web'
npm --prefix web run dev
```

Use **only `http://127.0.0.1:3000` for the web app**, per the user's explicit requirement. If that port is occupied, identify/reuse the project preview or coordinate stopping only its owned process; do not choose another port. The VS Code **Community Platform: preview web** task runs this development command and watches source in `web/.local/build-local-web`. Old reminder/ownership preview labels alias the same task. Ports and build labels in older evidence sections below are historical, not current startup instructions. Do not overwrite the output directory of a compiled preview while it is running.

- Web: `http://127.0.0.1:3000/app/spaces`, alongside Tasks, Calendar, Reminders and Inbox; unauthenticated users sign in first.
- API: `http://127.0.0.1:8000`; current migration head `0028` (`0021` alerts, `0022` group Spaces and join requests, `0023` agent requests, `0024` Space documents, `0025` couple Spaces, `0026` Space admins, `0027` account deletion and `0028` moderation, both from the gaps session's work in progress). Migrations are additive and do not reset existing data; `0022` refuses to downgrade while group Spaces, descriptions or join requests exist, `0025` while couple Spaces exist, and `0026` while admins or role changes exist.
- Readiness: `/health/ready` answers 503 `SERVICE_UNAVAILABLE` while the database lacks a migration that the running API's code needs; the API log's request line then shows `"failure": "MigrationsPending"`. Run the migrate command above; no restart is needed. A database that newer code has migrated still counts as ready. `alembic check` and `alembic revision --autogenerate` compare every table.
- Restarting the shared API loads every migration any session has added since the last restart. Run the migrate command right after the restart: on 2026-10-01 at 22:22 a restart loaded `0027` and `0028` before the database had them, and signed-in requests failed with 503 until the database was migrated at 22:29.
- Documents and search: `http://127.0.0.1:3000/app/documents?space_id=<id>` (also the Documents button on each Space) and `http://127.0.0.1:3000/app/search` (Search in the header). Only `.txt`, `.md` and `.csv` files up to 512 KB are accepted.
- Synthetic inbox: `http://127.0.0.1:8025`; verification codes are not printed in application logs.
- Telemetry: `docker compose -f infra/compose.yaml logs api` shows one JSON line per request (request and trace IDs, route template, status, duration, error code; no paths, queries, headers, bodies or account data). An unexpected failure answers with the standard `INTERNAL_ERROR` response and adds an `unexpected_error` line with the exception type and the code locations, never its message, so no traceback with private values reaches the server log. The web preview's output shows a matching `bff_request` line with the same trace ID. `/metrics` answers 404 unless the API runs with `COMMUNITY_METRICS_KEY`; then send `Authorization: Bearer <key>`. For each background queue (`identity_mail`, `reminders`, `exports`) it shows `community_work_ready` (items the worker could take now), `community_work_ready_oldest_seconds` (how long the oldest has waited) and `community_work_failed` (items that ended in failure). An oldest wait that keeps growing means that worker is stopped or behind; Compose has no export worker, so exports wait until one runs. `community_work_query_success 0` means the database could not be read. Every API process reports the same database values.

Register and verify two synthetic accounts. Each account's Spaces screen exposes its own account ID with a copy control. The owner creates a family Space, opens its invitation management and enters the intended recipient's account ID. That account refreshes its invitation inbox and explicitly reviews/accepts or declines; the owner can revoke a pending invitation. Acceptance creates a member, not another owner, and grants no old chat/file history. Invitations expire after 72 hours in this local build. No mail, phone lookup or unbound-contact onboarding is performed by family invitations.

Android exposes the same existing-account flow from **Spaces** in the bottom bar (before [T38](../TASKS.md#design-and-experience), **Family Spaces** on the account screen). A selected family's **Open family tasks** action passes that exact Space identity. Native drafts and uncertain commands remain in memory only; a changed account or denied Space clears protected views. The real local family/task/self-reminder journey now passes; see the [native Space boundary](../../android/app/src/main/java/com/community/platform/feature/spaces/README.md) and [live verification checkpoint](../BUILD_STATUS.md#live-manual-workflow-checkpoint).

Open **Members** on the web or **View members** in the native Space to review its roster. Owners can remove ordinary members; ordinary members can leave. Both require exact confirmation and retain their original ETag/key for unknown-outcome retries. Owners cannot depart and shared content is not deleted. A former member can return only through a new invitation that they accept, without their earlier tasks or reminders. See the [membership rules and verification](FAMILY_MEMBERSHIP.md).

After the recipient joins, open that family's Tasks link. Create title/notes/date-only deadline and optionally choose an eligible assignee. The other current member can read the new shared task; its assignee can complete/reopen. Creators/owners can edit or cancel within the task's actual audience. New members do not automatically see earlier tasks, and reassignment cannot broaden an old task's audience. Due dates do not create reminders.

Use a task's **Remind me** action to select and review a one-time reminder for the signed-in account. The separate reminder worker creates a private inbox entry; neither reading nor acknowledging it completes the task. No task due date creates a reminder automatically. The [reminder guide](SELF_REMINDERS.md) explains DST choices, catch-up limits, explicit retries, withdrawal and exact requests that require the current assignee's acceptance. Arbitrary third-party grants, background alerts and external delivery remain separate work.

The existing-account path does not resolve legal identity, caregiver representation, unregistered-recipient proof or production anti-abuse policy. No production decision or provider permission follows from local execution.

## Verification Commands

One command runs every check one after another and writes one summary ([T64](../TASKS.md#defects-that-break-approved-requirements)):

```powershell
npm run verify
npm run verify -- -Suite client,unit
npm run verify -- -Suite live
npm run verify -- -Suite device
```

The suites, in order: `records`, `structure`, `tokens`, `typecheck`, `client`, `unit`, `backend`, `android`, `device` and `live`. The default is every suite except two: `live`, which needs the web preview at `http://127.0.0.1:3000` and the local services, and `device`, which starts its own Android emulator. The complete default run takes about an hour, most of it the backend. Each suite runs the command below, and its output goes to its own log in `.local\verify\<date-time>\`, beside `summary.md` and `summary.json`. The summary gives each suite's result, its test counts and time, and the commit with the number of uncommitted changes. Because other sessions share the working tree, it also lists any files that changed while the checks ran, since those results may mix two states. The command exits with 1 when a suite fails or cannot start: for example when Docker or the preview is not running, or when two migrations share a revision number or the migrations have more than one newest revision, which happens when two sessions add one at the same time. It changes nothing in the repository. It sets `FORCE_COLOR=0`, finds the Playwright Chromium when `COMMUNITY_CHROMIUM_PATH` is not set, uses Android Studio's runtime for Gradle, and runs the Android tests with `--rerun` so that none are skipped as up to date.

The commands it runs, which also work on their own:

```powershell
npm run test:records; npm run check:records                                                          # records
npm run test:structure; npm run check:structure                                                    # structure
npm run test:tokens; npm run check:tokens                                                          # tokens
npm --prefix web run typecheck                                                                     # typecheck
npm --prefix web run test:client                                                                   # client
npm --prefix web run test:unit                                                                     # unit
docker compose -f infra/compose.yaml --profile test run --rm tests pytest -q -p no:cacheprovider   # backend
.\android\gradlew.bat -p android :app:testDebugUnitTest --offline --console=plain --rerun          # android
.\scripts\verify-android-device.ps1                                                               # device
npm --prefix web run test:e2e                                                                      # live
```

The `records` suite ([T113](../TASKS.md#documentation)) runs [records-check.mjs](../../scripts/records-check.mjs). Sessions sharing one working tree have written the task list, the build status and the changelog from older copies and lost other sessions' records ([audit M6](../ENGINEERING_AUDIT_2026-10-01.md#m6-sessions-disturb-each-other)). The check reports a task, decision, checkpoint, changelog section, titled changelog entry or evaluation row that disappears, and a task whose status goes back from "Done" without starting with "Reopened". It compares the working copy with HEAD, and the last commit with its parent; `node scripts/records-check.mjs --range a..b` checks any two commits. Rewording a record is fine. Run `npm run check:records` before committing a change to these files.

The `device` suite ([T96](../TASKS.md#defects-that-break-approved-requirements)) runs [verify-android-device.ps1](../../scripts/verify-android-device.ps1). It starts the API 36 virtual device `community_platform_m0_768f91e4` read-only, so nothing the tests do is saved, on the first free console port from 5584, and builds the debug app and its tests while the emulator starts; a build that runs into another session's build is tried once more. It switches the network off (airplane mode, Wi-Fi and mobile data) and sets a 640 x 1280 screen at density 320, which is 320 dp wide. It waits a minute after the emulator reports that it has started, because until then Android stops processes that start slowly, including a test run's own. It installs copies of the two APKs, so that another build cannot replace them halfway, and runs each device test class on its own, except the live journeys that need the local services (`community_local_integration`). A class whose process was stopped before any test started is run once more, and the summary says so; a failed test is never run again. A class fails when a test fails, is skipped, or never finishes, or when the font scale differs afterwards; the font scale is then put back. The emulator is shut down at the end, also after a failure, and the script never uses or stops an emulator it did not start. It takes about half an hour; logs and the APK copies are in `.local\verify-device`. Run on its own, the script also takes `-Class` to choose classes, `-Avd` to choose the virtual device, and `-AppApk` with `-TestApk` to install a build it kept instead of building, for example to repeat one class on the same build: `.\scripts\verify-android-device.ps1 -Class com.community.platform.feature.agents.AgentScreenTest -AppApk <app copy> -TestApk <test copy>`. The guarded VS Code tasks below remain for single classes on a named emulator.

Backend tests require the guarded `community_test` database. The current shared fixture creates a unique `test_<random>` schema per test process, migrates/truncates only inside that schema and removes it on teardown. Preserve this concurrent-work improvement; never point fixtures at development or real-user data. Do not use `docker compose down -v` to apply migrations.

This invitation checkpoint additionally used a dedicated Compose project. With the existing local test image available, the same isolated run is:

```powershell
docker image tag community-platform-tests community-platform-invitations-check-tests
docker compose -p community-platform-invitations-check -f infra/compose.yaml --profile test run --rm tests pytest -q
```

Its `test-db` and network are separate from the normal project. Remove only that dedicated test project's containers/network after use; do not stop unrelated sessions. The earlier shared-schema run showed disappearing records and failed assertions, so it was not counted as a passing result. The focused rerun passed unchanged in isolation; the current per-process schema fixture also prevents the shared-reset mechanism.

To compile without overwriting an existing production server's `.next` artifacts:

```powershell
$previous=$env:COMMUNITY_ISOLATED_BUILD
try {
	$env:COMMUNITY_ISOLATED_BUILD='1'
	npm --prefix web run build
} finally {
	$env:COMMUNITY_ISOLATED_BUILD=$previous
}
```

The opt-in build output is inside `web/.local/next-build` when `COMMUNITY_BUILD_LABEL` is unset. A nonempty build label takes precedence; use a new unused label for a separate build as shown in the [reminder runbook](SELF_REMINDERS.md). Normal builds/development without either option use `.next`. Next.js may update generated type includes for the selected directory. Do not rebuild into a directory used by a compiled preview without arranging its restart.

Offline component checks need no app server or loopback access. They render local bundles/fonts on blank isolated pages, simulate APIs/Next Link and block every outbound request:

```powershell
$env:COMMUNITY_CHROMIUM_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm --prefix web run test:unit
```

Choose an installed Chromium executable and set its path in the same terminal that runs the tests. The latest request checkpoint records 27 offline component checks, including the earlier account/task/self-reminder cases. Fixtures assert zero outbound requests and save labeled offline desktop/mobile screenshots. They do not prove cookies, Next routing, BFF/database integration or a live cross-client journey.

Local-only access for `127.0.0.1`, `localhost` and `10.0.2.2` was explicitly approved on 2026-09-20. The three entries were added to the existing user allowlist; filtering remains enabled. This is not permission for external providers or unrelated domains. Against the ready compiled preview, run the existing Playwright suite:

```powershell
$env:COMMUNITY_WEB_URL='http://127.0.0.1:3004'
$env:COMMUNITY_CHROMIUM_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm --prefix web run test:e2e
```

Use an installed supported Chromium executable or the project's installed Playwright browser. Tests launch isolated profiles and create synthetic accounts only. Seven manual account/Space/invitation/task/self-reminder journeys now pass against real local services; the assignee-request web result is recorded separately. The real worker is awaited at its due minute, not simulated by changing stored timestamps. Offline fixture results and earlier failed runs remain separate evidence. Do not widen the allowlist or use another client to evade a still-denied host.

## Restore Drill

With the local stack running, check backup and isolated restore without modifying live data:

```powershell
& .\scripts\restore-drill.ps1
```

The script dumps and counts one consistent snapshot of the development database, restores it into the disposable `community-restore-drill` project on an internal network, verifies migration, row counts, protected fields, ownership and isolation, seals the copy and removes only that project. It refuses to start while earlier drill containers exist. Keep `backend/.local/identity.key` with its database: the drill checks its fingerprint but does not copy it. Procedure, evidence location and limits: [platform notes](../../backend/app/modules/platform/README.md).

## Encryption Key Rotation

To replace the encryption key without signing anyone out, follow the staged procedure in the [platform notes](../../backend/app/modules/platform/README.md#encryption-key-rotation): `add`, restart, `promote`, restart, `reencrypt`, `verify`, and `retire` the old key after 24 hours, then restart. Start by checking the current state, which changes nothing:

```powershell
docker compose -f infra/compose.yaml run --rm --no-deps api python3 -m app.modules.platform.keys status
```

Do not rotate the development key while other sessions are using the stack: each step needs a restart of the API and workers. Retired keys go to ignored `backend/.local/retired-keys/`; keep them as long as any backup made before the rotation.

## Native Space Checks

With the installed Android Studio JDK/SDK and cached dependencies, run from the repository root:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\android\gradlew.bat -p android :app:testDebugUnitTest --tests 'com.community.platform.feature.spaces.*' --offline --console=plain
```

The membership checkpoint has 92 passing JVM checks, including two real local-socket transport regressions, 31 Space repository/state checks and nine task-state checks. Lint has zero errors and 11 warnings; debug/test APK builds and release R8 passed. Fake/intercepted responses test native logic and encoding, not service integration. Select offline classes for the offline fixture and live classes only for an owned disposable emulator with the explicitly approved local services; never reuse a concurrent session.

Eleven `SpaceScreenTest` cases also passed with guest networking disabled. They cover the eight earlier Space/invitation cases plus member removal, self-leave and enlarged membership review. Large-text cases verify an actual 320 dp window and measure the separate dialog's font scale at 2.0, including scrollable details and both actions. The rule changes the system setting before activity launch and restores it in `finally`; a composition-only override had left the dialog at 1.0. The clipboard test verifies the current-account payload through a Compose test double, not real OS clipboard integration. A separate real native membership journey passed; see the [membership checkpoint](../BUILD_STATUS.md#family-membership-checkpoint).

The VS Code **Run Task** entry **Community Platform: verify offline Space screens** rebuilds and installs both APKs, enables guest airplane mode, disables Wi-Fi and mobile data (on the API 36 image `svc data disable` leaves the `mobile_data` setting at 1, so the task also sets it to 0) and verifies both, sets 640x1280 pixels at 320 dpi, and runs only that class. It requires the expected `community_membership_20260923` AVD on `emulator-5582`, a read-only/no-snapshot-save runtime and completed boot. It passes the explicit disposable-fixture flag, checks nineteen passing results with no skips, and independently verifies that the original font setting was restored. The task does not launch a device or establish ownership: use it only for a disposable session you started, never a personal device or another session's emulator.

After checking that ports 5582/5583 are unused, launch the fixture in its own terminal and wait for its boot-ready event before running the task:

```powershell
& "$env:LOCALAPPDATA\Android\sdk\emulator\emulator.exe" -avd community_membership_20260923 -port 5582 -read-only -no-snapshot-load -no-snapshot-save -no-audio -no-boot-anim -no-window -gpu software -feature -Vulkan -memory 4096 -cores 4
```

Shut down only that owned session after collecting evidence. The measured offline session is already stopped. `AccountJourneyTest` is a different, networked fixture: do not run it through this radio-disabled task or on a personal device. Its real account and family/self-reminder results and transport limits are recorded in the [live checkpoint](../BUILD_STATUS.md#live-manual-workflow-checkpoint).

## Previous Task Evidence

- 127 combined backend tests passed with per-run PostgreSQL schema isolation. Task coverage includes admission-bound history/assignment, current-grant receipt privacy, concurrent retries/version races, completion/reopen/cancel rights, audit rollback, session expiry after waits, scoped cursors and migration preservation. Existing identity/delivery/Space/invitation tests remain included.
- 16 in-process client/proxy tests passed with mocked responses and no networking, covering task schemas/date/null semantics, ETags, retry headers and route/account/origin/query boundaries.
- Ten offline component checks passed. The five task checks use actual component/CSS/font with mocked APIs and zero outbound requests; desktop/mobile fixture images were viewed. A wrapped-selector accessible-name defect was reproduced and fixed with explicit labels.
- Final TypeScript and isolated production build passed, including `/app/tasks`.
- The generated schema and local database are at migration `0004`; all 15 Space/invitation/task operations declare authentication. Internal task request keys/digests/admission IDs are excluded from views.
- Live Space/invitation/task browser verification remains outstanding under the explicit `127.0.0.1` denial. No loopback request, network-policy exception or bypass was made. Offline component tests do not close that gate. Related native/account evidence is recorded separately in [BUILD_STATUS.md](../BUILD_STATUS.md).

This table records the task checkpoint before the reminder slice. Current combined reminder evidence is in [BUILD_STATUS.md](../BUILD_STATUS.md) and [SELF_REMINDERS.md](SELF_REMINDERS.md); do not present these older counts or migration `0004` as the current whole repository state.

Space/invitation/task/reminder forms retain retry identity only in memory; they are not crash-safe offline storage. Local bounds are 50 created/active Spaces per account, 50 active family members, 200 retained invitations, 500 retained tasks per Space and 500 retained self-reminders per account. Old receipts cannot restore removed or different admissions. Reviewed removal and self-leave now have web/native integration evidence, and a former member can rejoin only through a newly accepted invitation with a new admission. History sharing, ownership transfer, unregistered/external invitations, archive/delete, arbitrary or standing third-party reminder grants, advanced planning and production qualification remain unfinished. Review the [planning handoff](../CONTRACT_RECONCILIATION.md) for remaining approval gates.
