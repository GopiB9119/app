# planning

Local synthetic family tasks are implemented in this module. It reuses identity sessions and the existing private Space/membership authority; it does not start an Agent, timer, notification delivery or a second Space service.

## Implemented Operations

| Operation | Boundary |
| --- | --- |
| `POST /v1/tasks` | Current member creates a task in an active family Space, with a UUID idempotency key and strict typed input. |
| `GET /v1/tasks?space_id=...` | Current account/admission-filtered task list, optional status filter, bounded ID-keyset pagination. |
| `GET /v1/tasks/assignees?space_id=...` | Minimal eligible account IDs/display names; optional task_id restricts candidates to that task's audience and requires management permission. |
| `GET /v1/tasks/{task_id}` | Current authorized task projection, action capabilities and representation-bound ETag. |
| `PATCH /v1/tasks/{task_id}` | Creator/owner edits allowlisted title/notes/date/assignee fields using If-Match and a UUID idempotency key. |
| `POST /v1/tasks/{task_id}/status` | Explicit progress/completion/reopen/cancel intent with the same precondition/retry rules, not a toggle. |

Input fields are space_id, title (1-200 trimmed characters), description (up to 5,000 characters), optional ISO due_date and optional assignee_account_id. A calendar date is not an instant: timestamps, numeric dates and invalid calendar dates are rejected. No recurrence, arbitrary status, actor, permission or reminder field is accepted on creation. PATCH distinguishes omitted fields from explicit null: due date/assignment can be cleared, title/notes cannot be null.

## Authority and Durability

- A task's audience captures exact current Space admission IDs at creation. Every read, list, edit, status action and idempotency receipt rechecks active account/Space/membership and the task grant. New admission or a changed membership epoch does not inherit old tasks, including for an owner. No historical grant-widening operation is exposed.
- The creator in the same admission and a currently authorized owner can manage a visible task. The current assignee can operate it but cannot edit another creator's fields or cancel solely as assignee. Every role still requires the actual task grant.
- Local states are open, in_progress, completed and cancelled. Operators can move open/in_progress to completed, return in_progress to open, or reopen completed to open. Only a manager can cancel open/in_progress; cancellation is terminal in this subset. Editing requires open/in_progress. Blocked/archive, delete, priority and recurring-task workflows are not implemented.
- Assignments reference a same-Space account and admission ID. Reassignment is limited to active members already in the task audience. A departed/suspended/grant-revoked assignee is unavailable, not rebound to a new admission. Managers can clear or explicitly reassign it.
- Mutations use sorted account locks, the current Space lock and task/member guards, with session validation after waits. Domain data, required audit/outbox and stable command receipts commit together. Concurrent creation deduplicates; changed payload/precondition under the same mutation key conflicts. Replay returns current authorized state without repeating the effect.
- Completion stores actual actor/time; reopen clears current completion fields while retaining audit history. Audit stores changed field names and status transitions, not raw notes. Failed required outbox persistence rolls back the whole change. A stale ETag requires review, not automatic refetch-and-overwrite.

The local bound is 500 retained tasks per Space, with up to 50 original audience members. Pages are at most 50 rows (default 20); encrypted 15-minute cursors bind account, Space, admission and status filter. Pagination is not a frozen snapshot under concurrent writes. These are synthetic-build bounds, not production quota decisions.

Migration `0004` adds task, audience, audit and command-receipt tables with same-Space and completion-state constraints. Existing accounts, invitations and memberships remain intact. PostgreSQL tests cover current grants/history, concurrent retries, version races, stale assignment, date/input validation, audit rollback, expiry during waits, migration parity and restart persistence. See the [local runbook](../../../../docs/runbooks/README.md) for observed results and commands.

Source chapters: 1, 3, 13, 17.

Calendar (`calendar.py`, `GET /v1/calendar`): a month agenda of the caller's authorized task due dates and their own reminders in one Space, with a 15-minute cursor. Since 2026-10-01 it also lists `planned` entries: future times of the caller's active repeating reminders, computed for the requested range and never stored ([DEC-010](../../../../docs/DECISIONS.md#accepted-decisions)).

The [complete feature catalog](../../../../packages/feature-catalog/features.json) retains checklists, dependencies, recurrence, calendar views and broader planning. One-time in-app reminders are the next slice. No clinical, payment, provider, public-history or production policy approval follows from this local implementation.
