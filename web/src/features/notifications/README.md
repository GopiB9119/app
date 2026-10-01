# In-App Notification Inbox

Implemented `/app/notifications`: scoped task reminders, validated unread count, separate mark-read and confirmed acknowledgment, and ETag-bound in-app preferences. No mutation is automatically retried on reconnect. Access failures remove protected rows; neither read nor acknowledgment changes task completion.

Snooze ([DEC-010](../../../../docs/DECISIONS.md#accepted-decisions), provisional): a dialog offers 10 minutes, 1 hour, 3 hours or 1 day, disables choices that would reach the series' next time, and keeps the original request for Retry. A refused snooze closes the dialog, shows the reason in the inbox and reloads it. Rows show "Snoozed until" and the position in the snooze chain.

No background browser notification or external delivery is claimed. See [scope and evidence](../../../../docs/runbooks/SELF_REMINDERS.md) and the [retained feature catalog](../../../../packages/feature-catalog/features.json).
