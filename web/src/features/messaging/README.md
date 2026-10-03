# messaging

Built: `/app/messages`, **Messages** in the main navigation, also opened from **Chat for** a Space on the Spaces page. It lists conversations with unread counts, shows a conversation, sends messages, marks them read and lets authors delete their own messages. An unconfirmed send is retried with the same key and text. Every chat screen says messages are not end-to-end encrypted. The page polls while open.

An unconfirmed send stays with its conversation, marked "Not confirmed" in the list, until it is confirmed, retried or stopped, or the page is reloaded; the browser warns before closing the tab. A failed read receipt is sent again on the next poll. Evidence: [messaging checkpoint](../../../../docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint) and [web chat reliability checkpoint](../../../../docs/BUILD_STATUS.md#web-chat-reliability-checkpoint).

Source chapters: 1, 4, 19.

Replies, reactions and edits (T162, [DEC-033](../../../../docs/DECISIONS.md#accepted-decisions), provisional): Reply, React and Edit controls on each message, a reply bar above the composer, quotes in bubbles, and "Edited" marks. `mergeMessages` keeps the higher `revision`, so an older poll cannot undo an edit or reaction. Tests: `tests/messaging-replies-client.test.mjs`, the T162 case in `tests/unit/messaging-ui.test.mjs` (320 px / 200% text).

Feature inventory: direct-conversations, group-conversations, messages, offline-outbox, history-sync, delivery-read-receipts, unread-counts, typing-presence, edits-deletion, threads-replies, attachments, encryption-modes, devices-keys, key-recovery, calls.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
