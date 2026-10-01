# messaging

Built for local synthetic use: one shared chat per Space, and direct conversations between two current members of the same Space. Seven operations: open a direct conversation, list conversations, read one, list its messages, send, mark as read, and delete your own message for everyone (it leaves a tombstone).

- History starts at the member's current admission, compared by admission order number, not time. Unread counts and read positions are kept per admission.
- A send keeps one copy per `Idempotency-Key`. Local limits: 30 messages a minute per sender, 200 direct conversations per Space, 10,000 messages per conversation.
- Message bodies are encrypted at rest on the server (`cipher.py`). This is **not** end-to-end encryption.
- Clients poll while a chat is open; there is no WebSocket or push delivery.

Fixed on 2026-10-01: [T02, T03 and T04](../../../../docs/TASKS.md#defects-that-break-approved-requirements) ([checkpoint](../../../../docs/BUILD_STATUS.md#history-boundary-and-late-save-fixes-checkpoint)). Evidence: [messaging checkpoint](../../../../docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint).

Source chapters: 1, 4, 19.

Feature inventory: direct-conversations, group-conversations, messages, offline-outbox, history-sync, delivery-read-receipts, unread-counts, typing-presence, edits-deletion, threads-replies, attachments, encryption-modes, devices-keys, key-recovery, calls.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
