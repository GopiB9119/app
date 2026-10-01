# ADR-0006 — Live Updates over Server-Sent Events with Database Notices

Status: PROPOSED. Built as a local engineering choice under [DEC-009](../DECISIONS.md#accepted-decisions), like ADR-0001, ADR-0002 and ADR-0004, for the product choice in [DEC-019](../DECISIONS.md#accepted-decisions), which stays provisional until the product owner reviews it.

Date: 2026-10-01

## Context

Every client learned about new messages and reminders by polling: the web chat every 5 seconds, its conversation list every 15, and the Android chat every 5. The reminder inbox and the bell were refreshed only when a screen opened. Chapters 4, 7, 8, 9 and 19 ask for a realtime channel. The [API contract](../CHAPTER_07_API_REALTIME_CONTRACT.md) proposes REST-first durable commands (C7-D03) and leaves the event protocol open (C7-D07, C7-D08).

Constraints that shaped the choice:

- Writes already go through REST with idempotency keys, admission checks and audit. A second write path would have to repeat all of that.
- The web app reaches the API only through its same-origin proxy (`web/src/app/api/[...path]/route.ts`), which holds the session in an HttpOnly cookie. Next.js route handlers can stream a response but cannot accept a WebSocket upgrade.
- Changes come from more than one process: the API and the reminder worker.
- The API container has no `websockets` package, and new Python packages cannot be downloaded (DEC-005).

## Decision

1. **Transport: server-sent events.** `GET /v1/live` returns `text/event-stream`. Events: `ready` once the stream listens, `change` with a `kind` (`conversation` or `notifications`), a `reason` and identifiers only, `resync` when hints may have been lost, `end` with a reason before the server closes the stream, and a comment line every 15 seconds. The stream carries no content and accepts no commands, so it adds no write path. The web proxy streams it through unchanged (`GET /api/live`); Android reads it with OkHttp.
2. **Source of hints: PostgreSQL notices sent inside the changing transaction.** `app.modules.realtime.hub.signal()` runs `pg_notify('community_live', …)` in the same transaction as the change, so a change that rolls back notifies nobody and the worker's changes reach the API processes too. Each notice names the accounts that can see the change at commit time.
3. **One listener per API process.** `LiveHub` holds one listening connection in a background thread and hands each notice to the open streams of the named accounts. After a lost connection it sends `resync` to every stream.
4. **The REST API stays the truth.** On `ready`, `resync` or a `change`, the apps read through the existing operations, which check access again. There is no replay and no event cursor, so a reconnect cannot reveal older history.
5. **Bounds.** At most 5 streams per account and 100 queued hints per stream (then one `resync`); each stream ends after 30 minutes, and within 60 seconds after its session ends. Heartbeat, recheck and maximum are settings (`COMMUNITY_LIVE_*`).

## Consequences

- Clients keep their timers, more slowly while a stream is up, so a missed hint costs at most one timer interval.
- A WebSocket can carry the same events later if the product needs commands over the connection (typing, presence); nothing here depends on the transport.
- An open stream keeps the API process waiting at shutdown until Docker stops it (10 seconds), because uvicorn waits for open responses.
- PostgreSQL drops a notice above 8,000 bytes; `signal()` sends at most 100 accounts per notice.
- Not built: typing, presence, delivery or read receipts shown to others, and hints for tasks, events and invitations.

## References

[DEC-019](../DECISIONS.md#accepted-decisions); [TASKS T65](../TASKS.md#owners-critical-gaps); C7-D03, C7-D07 and C7-D08 in the [API contract](../CHAPTER_07_API_REALTIME_CONTRACT.md); code in `backend/app/modules/realtime/`; tests in `backend/tests/test_live_updates.py`.
