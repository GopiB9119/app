# Local Synthetic Build

The current slice includes account access, private family Spaces, intended-account invitations, reviewed member removal/self-leave, ordinary shared tasks and recipient-approved reminders with an in-app inbox. Use synthetic `.test` addresses only. Mailpit captures account verification mail locally; task reminders use no external provider, real family/care data or Agent. The [membership runbook](FAMILY_MEMBERSHIP.md) and [reminder runbook](SELF_REMINDERS.md) contain the domain rules, commands and evidence.

## Run Locally

From the repository root, with Docker and existing project dependencies available:

```powershell
docker compose -f infra/compose.yaml build api reminder-worker
docker compose -f infra/compose.yaml run --rm api python3 -m app.cli migrate
docker compose -f infra/compose.yaml up -d --build api identity-mail-worker reminder-worker
$env:COMMUNITY_WEB_ORIGINS='http://127.0.0.1:3001,http://localhost:3001'
$env:COMMUNITY_ISOLATED_BUILD='1'
npm --prefix web run dev -- --hostname 127.0.0.1 --port 3001
```

Use an unused web port and update its permitted origins together; do not terminate another server to reuse its port. The current membership preview runs on port 3004 with `COMMUNITY_BUILD_LABEL=membership-20260923` and matching origins for port 3004. Its output is `web/.local/build-membership-20260923`; do not overwrite that directory while the preview is running. The older reminder-only preview task on port 3003 is a separate build. A compiled preview needs rebuild/restart after source changes; the development command above uses port 3001 and watches source instead. Clear `COMMUNITY_BUILD_LABEL` before using that development command in a shell that inherited it.

- Web: `http://127.0.0.1:3004/app/spaces`, alongside Tasks, Reminders and Inbox; unauthenticated users sign in first.
- API: `http://127.0.0.1:8000`; current migration head `0008` adds admission-bound membership-command receipts without resetting existing data.
- Synthetic inbox: `http://127.0.0.1:8025`; verification codes are not printed in application logs.

Register and verify two synthetic accounts. Each account's Spaces screen exposes its own account ID with a copy control. The owner creates a family Space, opens its invitation management and enters the intended recipient's account ID. That account refreshes its invitation inbox and explicitly reviews/accepts or declines; the owner can revoke a pending invitation. Acceptance creates a member, not another owner, and grants no old chat/file history. Invitations expire after 72 hours in this local build. No mail, phone lookup or unbound-contact onboarding is performed by family invitations.

Android exposes the same existing-account flow from **Family Spaces** on the account screen. A selected family's **Open family tasks** action passes that exact Space identity. Native drafts and uncertain commands remain in memory only; a changed account or denied Space clears protected views. The real local family/task/self-reminder journey now passes; see the [native Space boundary](../../android/app/src/main/java/com/community/platform/feature/spaces/README.md) and [live verification checkpoint](../BUILD_STATUS.md#live-manual-workflow-checkpoint).

Open **Members** on the web or **View members** in the native Space to review its roster. Owners can remove ordinary members; ordinary members can leave. Both require exact confirmation and retain their original ETag/key for unknown-outcome retries. Owners cannot depart and shared content is not deleted. A former member can return only through a new invitation that they accept, without their earlier tasks or reminders. See the [membership rules and verification](FAMILY_MEMBERSHIP.md).

After the recipient joins, open that family's Tasks link. Create title/notes/date-only deadline and optionally choose an eligible assignee. The other current member can read the new shared task; its assignee can complete/reopen. Creators/owners can edit or cancel within the task's actual audience. New members do not automatically see earlier tasks, and reassignment cannot broaden an old task's audience. Due dates do not create reminders.

Use a task's **Remind me** action to select and review a one-time reminder for the signed-in account. The separate reminder worker creates a private inbox entry; neither reading nor acknowledging it completes the task. No task due date creates a reminder automatically. The [reminder guide](SELF_REMINDERS.md) explains DST choices, catch-up limits, explicit retries, withdrawal and exact requests that require the current assignee's acceptance. Arbitrary third-party grants, background alerts and external delivery remain separate work.

The existing-account path does not resolve legal identity, caregiver representation, unregistered-recipient proof or production anti-abuse policy. No production decision or provider permission follows from local execution.

## Verification Commands

```powershell
docker compose -f infra/compose.yaml --profile test run --rm tests pytest -q
node --test tests/web-client.test.mjs
npm --prefix web run typecheck
npm run test:structure
npm run check:structure
```

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

The VS Code **Run Task** entry **Community Platform: verify offline Space screens** rebuilds and installs both APKs, enables guest airplane mode, disables/verifies Wi-Fi and mobile data, sets 640x1280 pixels at 320 dpi, and runs only that class. It requires the expected `community_membership_20260923` AVD on `emulator-5582`, a read-only/no-snapshot-save runtime and completed boot. It passes the explicit disposable-fixture flag, checks eleven passing results with no skips, and independently verifies that the original font setting was restored. The task does not launch a device or establish ownership: use it only for a disposable session you started, never a personal device or another session's emulator.

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
