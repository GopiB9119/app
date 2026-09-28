# Private In-App Inbox

Implemented task-reminder inbox rows, authorized paginated reads/unread count, idempotent read state, explicit reminder acknowledgment and versioned in-app preferences. Current task access/admission remains mandatory even for old inbox rows. Acknowledgment belongs to the reminder domain and never completes a task.

No push/email/SMS/voice/WhatsApp dispatch, provider webhook or shared recipient consent is enabled by this module. Local identity-verification mail remains a separate synthetic-only worker.

See [setup and evidence](../../../../docs/runbooks/SELF_REMINDERS.md) and the [retained feature inventory](../../../../packages/feature-catalog/features.json).
