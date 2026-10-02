# messaging

Built: the **Messages** screen, opened with **Messages** in the bottom bar or with **Open chat** on a Space. It lists conversations with unread counts, shows a conversation, sends messages, marks them read and lets authors delete their own messages. An unconfirmed send is retried with the same key and text. The screen says messages are not end-to-end encrypted and polls while open. Retry state is kept in memory only and does not survive the app closing.

Evidence: [messaging checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint) (`MessagingTest`, 18 JVM tests). Not yet tested on a device.

Source chapters: 1, 4, 19.

Feature inventory: direct-conversations, group-conversations, messages, offline-outbox, history-sync, delivery-read-receipts, unread-counts, typing-presence, edits-deletion, threads-replies, attachments, encryption-modes, devices-keys, key-recovery, calls.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.

After a long absence the chat fetches the missing messages forward, at most 10 pages at a time, and until it reaches the newest page shows and marks read only messages that follow on without a hole (T101). A Keystore error while keeping an unsent message is tried once more with the same key, so it cannot cost the other kept messages; only a key that fails again is replaced (T104).

Answers that arrive late (T82): a deletion is final, so a page read before it never brings the message back, whichever answer arrives last. After a send, a deletion, marking read, opening a conversation or finding a chat gone, a conversation-list read already under way stops and the list is read again, so an older list cannot show a read chat as unread.
