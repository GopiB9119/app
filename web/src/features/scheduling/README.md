# Reminder Review

Implemented `/app/reminders` and task **Remind me** links. Server preview provides the exact recipient, local time, IANA zone, UTC choice and dispatch deadline. The client never computes a schedule from a due date or saves an ambiguous occurrence implicitly. Unknown saves retain the same protected preview and request key for explicit retry; current canonical cancellation/suppression/failure is shown truthfully.

The same editor offers a current task manager an assignee-request mode. Received/sent request lists, exact recipient review, acceptance, decline and withdrawal use the restricted BFF and account-bound immutable intents. Review alone never accepts; uncertain responses lock the exact original command. The requester cannot inspect the recipient's schedule ID or acknowledgment. Dialog actions wrap within narrow/large-text layouts.

See [feature scope, tests and runtime limits](../../../../docs/runbooks/SELF_REMINDERS.md). Both offline components and the real local two-account request journey passed; offline results remain distinct from live BFF/database evidence. Later scheduling capabilities remain in the [feature catalog](../../../../packages/feature-catalog/features.json).
