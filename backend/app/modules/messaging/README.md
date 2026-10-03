# messaging

Built for local synthetic use: one shared chat per Space, and direct conversations between two current members of the same Space. Seven operations: open a direct conversation, list conversations, read one, list its messages, send, mark as read, and delete your own message for everyone (it leaves a tombstone).

- History starts at the member's current admission, compared by admission order number, not time. Unread counts and read positions are kept per admission.
- A send keeps one copy per `Idempotency-Key`. Local limits: 30 messages a minute per sender, 200 direct conversations per Space, 10,000 messages per conversation.
- Message bodies are encrypted at rest on the server (`cipher.py`). This is **not** end-to-end encryption.
- Clients poll while a chat is open; there is no WebSocket or push delivery.
- Replies, reactions and edits ([DEC-033](../../../../docs/DECISIONS.md#accepted-decisions), provisional, T162, migration `0037`): `reply_to_message_id` on send (same conversation, not deleted, within the sender's history; otherwise `REPLY_UNAVAILABLE`), `POST .../messages/{id}/reactions` `{reaction, on}` with six fixed reactions, and `POST .../messages/{id}/edit` by the author for 15 minutes, at most 10 times (`EDIT_WINDOW_CLOSED`, `EDIT_LIMIT_REACHED`); the earlier text is not kept. Every change raises `revision` and sends the live reason `changed`. A reply shows nothing about an original from before the viewer's admission. Deleting a message removes its reactions.

Fixed on 2026-10-01: [T02, T03 and T04](../../../../docs/TASKS.md#defects-that-break-approved-requirements) ([checkpoint](../../../../docs/BUILD_STATUS.md#history-boundary-and-late-save-fixes-checkpoint)). Evidence: [messaging checkpoint](../../../../docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint).

Source chapters: 1, 4, 19.

Feature inventory: direct-conversations, group-conversations, messages, offline-outbox, history-sync, delivery-read-receipts, unread-counts, typing-presence, edits-deletion, threads-replies, attachments, encryption-modes, devices-keys, key-recovery, calls.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
