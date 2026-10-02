# Native Family Tasks

Implemented local task client: select an existing admitted family Space, list/filter/page tasks, inspect details, create/edit title and notes, select a calendar due date and eligible assignee, and confirm permitted status changes. The account header opens this workspace.

The backend remains the authority for current membership, admission-bound task history, eligible assignment and creator/assignee/owner actions. A server permission flag controls affordances but never replaces backend authorization. Statuses are `open`, `in_progress`, `completed` and `cancelled`; completion is an attributed user report, not reminder delivery.

- [TaskApi.kt](TaskApi.kt) maps the existing Space/task endpoints.
- [TaskRepository.kt](TaskRepository.kt) shares Keystore-backed account sessions, validates scoped responses, preserves opaque ETags and sends explicit nulls only for deliberate date/assignment clearing.
- [TaskViewModel.kt](TaskViewModel.kt) isolates account generations, preserves immutable pending commands for explicit retry, and requires review after a version conflict.
- [TaskScreen.kt](TaskScreen.kt) renders the Compose workflow, state-aware controls, confirmation, Material date picker and eligible-assignee picker.

Drafts and uncertain commands stay only in the ViewModel. Rotation retains them; process death or explicitly leaving the workspace can lose them. No background/offline mutation queue, automatic conflict overwrite, new retry key after a timeout, or plaintext task database is introduced. Editing notes does not silently unassign an unavailable member.

Verified evidence and reproducible commands are in the [native task runbook](../../../../../../../../../../docs/runbooks/ANDROID_TASKS.md). The live native family journey (owner and member, shared task, reminder delivery) passed against the local API after local network access was approved ([checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#live-manual-workflow-checkpoint)). Checklists (`ChecklistRepository.kt`, `ChecklistViewModel.kt`, `ChecklistScreen.kt`, opened from a task) and the calendar (below) are built in this folder; task dependencies are not.

Source chapters 1, 3, 13 and 17 remain unchanged. See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json) for retained scope.

Calendar (`CalendarRepository.kt`, `CalendarScreen.kt`): a month agenda of task due dates and the person's reminders. Since 2026-10-01 it accepts and shows `planned` entries, the future times of active repeating reminders, and checks the server's order (tasks first, then timed entries by time). Before this, the repository refused any entry kind except `task` and `reminder` ([DEC-010](../../../../../../../../../../docs/DECISIONS.md#accepted-decisions)). Device tests: `CalendarScreenTest` (network off: loading, empty, failed and loaded months, month, timezone and Space choices, and 320 dp at 200% text, with task, reminder and planned entries; events in the calendar belong to the unrecorded alerts work, conflict C10), and for checklists `ChecklistScreenTest` (T95, network off, 11 tests: loading, failed, empty and denied states; a tick or other change shows only once confirmed and a lost one is retried unchanged; removing asks first and Keep sends nothing; drafts stay while a change is unconfirmed or refused; leaving asks first; every control waits while a change is in flight; 320 dp at 200% text, including the remove and leave questions).
