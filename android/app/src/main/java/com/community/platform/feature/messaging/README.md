# messaging

Built: the **Messages** screen, opened from the account screen or with **Open chat** on a Space. It lists conversations with unread counts, shows a conversation, sends messages, marks them read and lets authors delete their own messages. An unconfirmed send is retried with the same key and text. The screen says messages are not end-to-end encrypted and polls while open. Retry state is kept in memory only and does not survive the app closing.

Evidence: [messaging checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint) (`MessagingTest`, 18 JVM tests). Not yet tested on a device.

Source chapters: 1, 4, 19.

Feature inventory: direct-conversations, group-conversations, messages, offline-outbox, history-sync, delivery-read-receipts, unread-counts, typing-presence, edits-deletion, threads-replies, attachments, encryption-modes, devices-keys, key-recovery, calls.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
