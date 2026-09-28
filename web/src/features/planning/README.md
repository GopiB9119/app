# planning

`/app/tasks` is the family task workspace. Account/Spaces/Tasks navigation and a scoped link on each Space open it; a selector chooses an accessible family. It has paginated/status-filtered tasks, creation, eligible assignees, date-only deadlines, notes and capability-driven edit/progress/complete/reopen/cancel actions.

Account and Space form the in-memory query scope. The BFF rechecks session/account identity and Origin; only six implemented task method/path combinations and declared query fields are forwarded. Zod validates task completion/assignment consistency, calendar dates, version strings, ETags and pagination. Backend authority remains mandatory.

Edit/status requests use the displayed ETag and a stable UUID key. A 412 retains the editor's draft and disables saving until explicit discard/reload. Unknown outcomes retain the original payload/key/precondition for retry; controls never silently change effect identity. A completed request replay can return newer actual state, which is shown truthfully. Unrelated edits do not silently clear an unavailable assignee.

Drafts and pending identities are in-page only, with unsaved-change protection and locked family/filter controls. They are not durable offline/crash storage. There is no localStorage/IndexedDB cache or automatic background mutation replay. Revoked task access hides the protected list/actions; assignee names/options use current permitted projections.

Five offline task component checks passed using real React code/CSS/local font with mocked APIs/Next Link and all outbound requests blocked. They cover uncertain create/status retries, completion/reopen, explicit conflict reload, read-only/revoked views and 320/390/768-pixel reflow. Desktop/mobile fixture screenshots were captured and inspected. These are not live BFF/database, Next routing or cross-client evidence. The live browser journey is written and syntax-checked but remains blocked by loopback policy.

TypeScript, isolated production build and in-process client/BFF checks also passed. See [BUILD_STATUS.md](../../../../docs/BUILD_STATUS.md) and the [local runbook](../../../../docs/runbooks/README.md) for exact totals and remaining qualification. Native task work is recorded separately. A due date creates no reminder, and no reminder UI is implemented here.

Source chapters: 1, 3, 13, 17.

The [complete feature catalog](../../../../packages/feature-catalog/features.json) retains checklists, dependencies, recurring tasks, calendar views and broader planning workspaces.
