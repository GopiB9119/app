# One-Time Task Reminders

Implemented ordinary task-linked self-reminders: protected local-time/IANA preview, explicit DST choice, atomic durable creation, current admission/task/consent checks, cancellation and bounded independent dispatch. The worker creates one uniquely bound in-app notification and scheduler-attributed event in the same transaction. Pending work is recovered from PostgreSQL, not a client timer or model session.

Recipient-approved requests now let a current task manager propose an exact time to the current eligible assignee. A proposal creates no scheduled work or notification. Only the recipient's protected review/acceptance atomically creates their personal reminder and required audit/outbox records. Read-time expiry, immutable retries, exact admission checks, preference generations, decline/withdrawal and acceptance races are covered by PostgreSQL tests. Requesters see the proposal outcome but not the recipient's private schedule ID/read/acknowledgment.

Self endpoints remain self-only. Acceptance creates independently recipient-owned work, not standing permission for the requester. Recurrence, snooze, escalation, arbitrary/standing third-party consent, quiet-hour alerts, care records and external providers remain retained but unimplemented. A due date never implies a reminder.

See [setup, exact bounds and evidence](../../../../docs/runbooks/SELF_REMINDERS.md) and the [full feature inventory](../../../../packages/feature-catalog/features.json). Source chapters 4, 13 and 20 and their open decisions remain unchanged.
