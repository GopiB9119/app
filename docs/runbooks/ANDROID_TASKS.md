# Native Family Task Workflow

This is a local synthetic-data task client, not an approved production release. Account setup, verification and secure-session limits are in the [account runbook](ACCOUNT_ACCESS.md); backend and web startup are in the [shared runbook](README.md).

## Available Workflow

After signing in, the list icon in the account header opens **Family tasks**. The client reads existing family Spaces for the current account; native family creation and invitation/admission screens are separate remaining work.

Select a Space, filter or page through its tasks, open a task, and create or edit title, notes, calendar due date and an eligible assignee. The backend supplies current action permissions. Status changes require a confirmation identifying the selected task and target status. A failed or stale request never appears as a confirmed save.

The current server contract has `open`, `in_progress`, `completed` and `cancelled` states. The backend owns transition rights and historical access. This client does not add reminder schedules, notifications, recurring tasks, dependencies, checklists, care instructions or Agent actions. A calendar due date is not converted into a midnight reminder or an instant in a timezone.

## API And Local State

- Retrofit/OkHttp use the existing authenticated `/v1/spaces`, `/v1/tasks`, `/v1/tasks/assignees`, task read/edit and status routes. No new task backend or parallel identity system was introduced by the native work.
- Task requests reuse the account repository's session lock and expected-account checks. Cancellation is rechecked after secure credential loading and before a request can start.
- List responses are bounded to ten tasks per page and validated for scope, identifiers, statuses, completion metadata, pagination and server ETags. Task list response bytes have a separate 256 KiB cap; other responses retain the 64 KiB cap.
- Assignment candidates are fetched for the selected Space and, while editing, the exact task. An unavailable assignee stays unchanged during unrelated edits unless the user deliberately selects a replacement or clears it.
- The task Retrofit converter serializes explicit nulls. Clearing the due date or assignment is different from omitting an unchanged field.
- Each mutation keeps the reviewed ETag, exact payload, account, Space, task and one request key. An uncertain outcome locks the draft; **Retry original request** resends that command unchanged. Reconnect and screen resume do not submit mutations.
- A 412 conflict retains the draft and disables saving until an explicit discard-and-reload review. There is no silent fetch-and-overwrite retry.
- Current-account loss clears task data. Switching the account cancels local work and prevents late results from updating the next account's UI.
- Drafts, selections and pending commands are memory-only in the ViewModel. They survive ordinary rotation, not process death or leaving the workspace. Leaving an uncertain command requires confirmation that its retry identity will be lost. No crash-safe offline guarantee is claimed.

## Build And Unit Checks

Use JDK 21 and the configured Android SDK, not the workstation's default Java 25:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\sdk"
.\android\gradlew.bat -p android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest --offline --console=plain
```

The native task change passed 27 JVM tests: 12 task-repository, 7 task-state and 8 account-repository tests. These include real Retrofit request serialization through a simulated OkHttp response, same-key explicit retries, deliberate null clearing, wrong-account rejection, cancellation after credential loading, response bounds, stale conflicts, state isolation and no automatic retry. No network endpoint is contacted by those tests.

The debug package is `com.community.platform.debug`. Its default emulator API host remains `10.0.2.2:8000`; the release host is deliberately unusable. The actual `:app:minifyReleaseWithR8` check passed with task DTO keep rules, and the mapping retains the task DTO class names. This is not a release-runtime, network or real-user qualification result; no release artifact was deployed.

## Offline Device Evidence

Six [TaskScreenTest](../../android/app/src/androidTest/java/com/community/platform/feature/planning/TaskScreenTest.kt) tests passed on API 36 using the real Compose screens and simulated callbacks:

1. List the scoped task and open the exact selected record.
2. Edit title/notes, select September 22, 2026 as a calendar date, select the intended assignee and explicitly clear the date.
3. Lock an uncertain draft, require explicit retry and confirm before leaving it.
4. Show only server-permitted status actions and bind confirmation to the selected task/ETag.
5. Preserve a conflicting draft until discard-and-reload is confirmed.
6. Scroll the editor and reach its save control at 320 dp width and 200% text scaling.

The dedicated emulator's AVD name, serial, boot state and absent debug package were checked before install. It ran read-only with no snapshot load/save; Wi-Fi and mobile data were disabled before testing. Only the task-screen class was selected, not the networked account journey. The final instrumentation result was `OK (6 tests)` with six successful test-status records and no skips.

The first calendar selector failed because Material 3 exposes each day's full date as a semantics **Text** value, not the visual day number or `ContentDescription`. A bounded synthetic tree diagnostic identified `Tuesday, September 22, 2026`; that selector passed, and temporary diagnostic logging was removed. The app's date logic was not changed to satisfy the test.

Task-list and large-text editor screenshots were retrieved with matching device/host SHA-256, then viewed. The owned emulator was shut down normally. No personal phone, actual family data or live provider was used.

## Shared Backend Evidence And Remaining Gate

The current combined PostgreSQL suite passed 127 tests. Two added regressions in [test_task_authorization.py](../../backend/tests/test_task_authorization.py) prove that removing a task's access grant also blocks a creator's original creation retry, for both owner and member creators. The concurrent backend already supplied the current access check when these regressions ran; the native work does not claim authorship of that implementation.

The live browser and Android-to-server journeys remain unverified because loopback application access is explicitly blocked by the active network policy. No policy exception or alternate-host/tool bypass was attempted. These offline UI, transport and backend checks are separate evidence, not an end-to-end pass. Once access is permitted, qualify the complete two-account create/assign/edit/complete/revoke/reload flow on both clients before expanding the release claim.