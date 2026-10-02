# planning

`/app/tasks` is the family task workspace. Account/Spaces/Tasks navigation and a scoped link on each Space open it; a selector chooses an accessible family. It has paginated/status-filtered tasks, creation, eligible assignees, date-only deadlines, notes and capability-driven edit/progress/complete/reopen/cancel actions.

Account and Space form the in-memory query scope. The BFF rechecks session/account identity and Origin; only six implemented task method/path combinations and declared query fields are forwarded. Zod validates task completion/assignment consistency, calendar dates, version strings, ETags and pagination. Backend authority remains mandatory.

Edit/status requests use the displayed ETag and a stable UUID key. A 412 retains the editor's draft and disables saving until explicit discard/reload. Unknown outcomes retain the original payload/key/precondition for retry; controls never silently change effect identity. A completed request replay can return newer actual state, which is shown truthfully. Unrelated edits do not silently clear an unavailable assignee.

Drafts and pending identities are in-page only, with unsaved-change protection and locked family/filter controls. They are not durable offline/crash storage. There is no localStorage/IndexedDB cache or automatic background mutation replay. Revoked task access hides the protected list/actions; assignee names/options use current permitted projections.

Five offline task component checks passed using real React code/CSS/local font with mocked APIs/Next Link and all outbound requests blocked. They cover uncertain create/status retries, completion/reopen, explicit conflict reload, read-only/revoked views and 320/390/768-pixel reflow. Desktop/mobile fixture screenshots were captured and inspected. These are not live BFF/database, Next routing or cross-client evidence. The live browser journey is written and syntax-checked but remains blocked by loopback policy.

TypeScript, isolated production build and in-process client/BFF checks also passed. See [BUILD_STATUS.md](../../../../docs/BUILD_STATUS.md) and the [local runbook](../../../../docs/runbooks/README.md) for exact totals and remaining qualification. Native task work is recorded separately. A due date creates no reminder, and no reminder UI is implemented here.

Source chapters: 1, 3, 13, 17.

Calendar (`calendar-client.ts`, `calendar-screen.tsx`, `/app/calendar`): a month agenda of task due dates and the person's reminders. Since 2026-10-01 it also shows `planned` entries, the future times of active repeating reminders, marked "Planned, repeating" ([DEC-010](../../../../docs/DECISIONS.md#accepted-decisions)).

Calendar refreshes preserve the selected Space, month and display timezone; only an explicit selector or month action changes them. The heading reflows at 320 px with 200% text.

Task checklists are reviewed inside the task screen. Unconfirmed changes retain their original body, UUID key and checklist ETag; controls stay locked until confirmation or a definitive refusal. Removal names the item before confirmation. Item titles use the backend's 200-character (Unicode code point) limit, with an explicit error instead of silently truncating an over-limit draft.

[Offline calendar and checklist browser tests](../../../../tests/unit/calendar-checklist-ui.test.mjs) render the actual screens through the query and language providers, simulate API answers and the live connection in-page, and block every real request. They cover loading/retry/empty/loaded views, display-day/source links, explicit scope changes, pagination, revoked access, checklist confirmation/retry/version behavior, Unicode boundaries and actual 200% text at 320 px. Space events and calendar-file downloading are deliberately excluded while conflict C10 remains open. These tests are not live BFF/database or Next routing evidence.

The [complete feature catalog](../../../../packages/feature-catalog/features.json) retains checklists, dependencies, recurring tasks, calendar views and broader planning workspaces.
