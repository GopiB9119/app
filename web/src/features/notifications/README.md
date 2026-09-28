# In-App Notification Inbox

Implemented `/app/notifications`: scoped task reminders, validated unread count, separate mark-read and confirmed acknowledgment, and ETag-bound in-app preferences. No mutation is automatically retried on reconnect. Access failures remove protected rows; neither read nor acknowledgment changes task completion.

No background browser notification or external delivery is claimed. See [scope and evidence](../../../../docs/runbooks/SELF_REMINDERS.md) and the [retained feature catalog](../../../../packages/feature-catalog/features.json).
