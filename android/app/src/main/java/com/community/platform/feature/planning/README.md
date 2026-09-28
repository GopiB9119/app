# Native Family Tasks

Implemented local task client: select an existing admitted family Space, list/filter/page tasks, inspect details, create/edit title and notes, select a calendar due date and eligible assignee, and confirm permitted status changes. The account header opens this workspace.

The backend remains the authority for current membership, admission-bound task history, eligible assignment and creator/assignee/owner actions. A server permission flag controls affordances but never replaces backend authorization. Statuses are `open`, `in_progress`, `completed` and `cancelled`; completion is an attributed user report, not reminder delivery.

- [TaskApi.kt](TaskApi.kt) maps the existing Space/task endpoints.
- [TaskRepository.kt](TaskRepository.kt) shares Keystore-backed account sessions, validates scoped responses, preserves opaque ETags and sends explicit nulls only for deliberate date/assignment clearing.
- [TaskViewModel.kt](TaskViewModel.kt) isolates account generations, preserves immutable pending commands for explicit retry, and requires review after a version conflict.
- [TaskScreen.kt](TaskScreen.kt) renders the Compose workflow, state-aware controls, confirmation, Material date picker and eligible-assignee picker.

Drafts and uncertain commands stay only in the ViewModel. Rotation retains them; process death or explicitly leaving the workspace can lose them. No background/offline mutation queue, automatic conflict overwrite, new retry key after a timeout, or plaintext task database is introduced. Editing notes does not silently unassign an unavailable member.

Verified evidence and reproducible commands are in the [native task runbook](../../../../../../../../../../docs/runbooks/ANDROID_TASKS.md). Live client-to-server qualification remains blocked by the active loopback network policy. Existing native Space creation/invitation screens, reminders, recurrence, checklists, dependencies, calendar views and other planning capabilities are not implemented by this client.

Source chapters 1, 3, 13 and 17 remain unchanged. See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json) for retained scope.
