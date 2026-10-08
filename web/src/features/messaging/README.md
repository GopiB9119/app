# messaging

Built: `/app/messages`, **Messages** in the main navigation, also opened from **Chat for** a Space on the Spaces page. It lists conversations with unread counts, shows a conversation, sends messages, marks them read and lets authors delete their own messages. An unconfirmed send is retried with the same key and text. Every chat screen says messages are not end-to-end encrypted. Live updates refresh the open chat, with polling as a recovery path.

An unconfirmed send stays with its conversation, marked "Not confirmed" in the list, until it is confirmed, retried or stopped, or the page is reloaded; the browser warns before closing the tab. A failed read receipt is sent again on the next poll. Evidence: [messaging checkpoint](../../../../docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint) and [web chat reliability checkpoint](../../../../docs/BUILD_STATUS.md#web-chat-reliability-checkpoint).

Source chapters: 1, 4, 19.

Replies, reactions and edits (T162, [DEC-033](../../../../docs/DECISIONS.md#accepted-decisions), provisional): Reply, React and Edit controls on each message, a reply bar above the composer, quotes in bubbles, and "Edited" marks. `mergeMessages` keeps the higher `revision`, so an older poll cannot undo an edit or reaction. Tests: `tests/messaging-replies-client.test.mjs`, the T162 case in `tests/unit/messaging-ui.test.mjs` (320 px / 200% text).

## Mention-aware typing (2026-10-07)

Implemented for the owner's web/backend request: Family, Couple and Group Space chats show animated dots and who is
typing. A completed `@Full Display Name` or `@agent` also appears in the indicator. Direct conversations use the same
behavior with only their two participants. Solo Spaces have nobody else to notify. Android source is untouched.

- Names are resolved from the authorized roster (or the direct conversation's participants). Matching supports Unicode,
  ignores email/word fragments, prefers a complete longer name to its prefix and does not guess between duplicate names.
  Up to five distinct person mentions are represented, alongside `@agent`.
- Only account/conversation/client identifiers, mention flags, a sequence and an expiry travel in a typing update.
  **Unsent draft text is neither uploaded nor stored.** Typing does not send a message, change unread/read state, produce
  an inbox/audit/outbox record or invoke the Agent. Mentioning the Agent in an unsent draft is not Agent processing.
- The publisher coalesces active updates to at most one every two seconds and stops after four seconds without input.
  Clearing, sending, blurring, hiding, leaving the chat or going offline also stops the source. If that final update is
  lost, active presence expires after eight seconds, with a 250 ms browser cleanup tick. Drafts and message retries remain
  independent of typing failures.
- Each mounted composer uses a new client ID and increasing sequence numbers. Old updates cannot replace newer ones;
  multiple tabs collapse to one person, and stopping one tab does not clear another active tab. Reconnect/resync and
  access-change hints clear stale activity. Updates are bound to the current signed-in account, chat and Space.
- Shared-chat presence waits for a successful roster read and pauses on a failed refresh rather than trusting cached
  names. A roster problem does not prevent ordinary messages, and an unchanged background refresh does not reset typing.
- Indicators use a persistent polite live region, hide decorative dots from assistive technology, honor reduced motion,
  wrap long names and allow keyboard scrolling when the list is tall. Mobile chat keeps its intended hidden sub-navigation
  despite shared navigation styles, leaving the indicator and composer reachable at 320 px and 200% text.
- English, Telugu and Hindi copy follow the existing dictionaries; Telugu/Hindi remain awaiting native-speaker review.
  A typing-service error is visible but does not disable sending; an older backend without the endpoint is also non-fatal.

### Transport and authorization

`POST /v1/conversations/{conversation_id}/typing` accepts `client_id` (UUID), `sequence` (positive integer),
`is_typing` (boolean), `mentioned_account_ids` (up to five unique UUIDs) and `mentions_agent` (boolean).
Stopped updates must have no mentions; extra fields, including draft text or a claimed sender, are rejected.
The response is an ordinary envelope containing the same scoped metadata as the live `change` event of kind `typing`.

The backend derives the sender from the authenticated session, checks current conversation/admission access and send
permission, validates mentioned people against the current audience, and publishes only to the other participants.
A shared Space lock keeps departure and publication ordered; the session is checked again before commit.
The existing PostgreSQL live channel delivers the transient notice across API workers, with no new migration or presence
table. Existing hashed rate buckets cap an account at 120 updates per minute across conversations (HTTP 429 with
`Retry-After`); no draft or typing/mention history is retained in those counters.

Regression coverage: [backend typing](../../../../backend/tests/test_typing.py),
[client/proxy and mention parsing](../../../../tests/messaging-client.test.mjs),
[live transport](../../../../tests/live-client.test.mjs) and
[browser messaging](../../../../tests/unit/messaging-ui.test.mjs).

### Verification and limits

The final local run passes 47/47 backend checks (typing, existing messaging and OpenAPI), including the roster needed
by each of Family, Couple and Group chat. The combined web client/browser run passes 98/100 checks with no skipped tests:
all typing cases pass; two unrelated concurrent poll integrations fail the existing translation-area namespace assertion
and the More-menu link expectation. Those failures are recorded rather than relabeled as a passing full web gate.
Web typechecking, scoped Ruff, design-token checks, Python syntax checks and the generated API contract check pass.

The focused follow-up on 2026-10-08 confirms the translation namespace check now passes after concurrent poll edits.
The existing More-menu test still expects the pre-poll link list and fails on the added Polls link. Typing implementation
inputs remain unchanged, and current web typechecking passes; the follow-up does not replace the recorded full-run result.

The 320 px/doubled-text browser checks measure the actual text size, indicator/composer geometry, pointer access,
keyboard scrolling and reduced-motion behavior. Final captured typing/integration inputs remained unchanged through
verification, but this is a shared dirty worktree, not a whole-project frozen release qualification.
The unavailable shared database was not restarted: tests used an independently owned, loopback-only synthetic database
and isolated schemas, and the test container was removed afterward. No Android, provider, shared-runtime migration or
deployment work was performed. Running the feature requires the updated backend as well as the web changes.

Feature inventory: direct-conversations, group-conversations, messages, offline-outbox, history-sync, delivery-read-receipts, unread-counts, typing-presence, edits-deletion, threads-replies, attachments, encryption-modes, devices-keys, key-recovery, calls.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
