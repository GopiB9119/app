# Private In-App Inbox

Implemented task-reminder inbox rows, authorized paginated reads/unread count, idempotent read state, explicit reminder acknowledgment and versioned in-app preferences. Current task access/admission remains mandatory even for old inbox rows. Acknowledgment belongs to the reminder domain and never completes a task.

No push/email/SMS/voice/WhatsApp dispatch, provider webhook or shared recipient consent is enabled by this module. Local identity-verification mail remains a separate synthetic-only worker.

Snooze ([DEC-010](../../../../docs/DECISIONS.md#accepted-decisions), provisional): `POST /v1/notifications/{notification_id}/snooze` with 10, 60, 180 or 1440 minutes and an `Idempotency-Key` creates one follow-up reminder (`follow_up_of`, `snooze_count` up to 3) that must end before the series' next time, and marks the row read. Acknowledging any reminder in a chain acknowledges the delivered ones and cancels a scheduled follow-up. Views add `series_id`, `snooze_count`, `snoozed_until`, `can_snooze` and `snooze_before`.

See [setup and evidence](../../../../docs/runbooks/SELF_REMINDERS.md) and the [retained feature inventory](../../../../packages/feature-catalog/features.json).

The inbox is listed newest first; its cursor holds the creation time and identifier of the last item shown, so a new reminder is always on the first page (T102). Before, it followed the random identifiers.
