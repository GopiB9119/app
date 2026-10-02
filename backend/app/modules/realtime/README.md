# realtime

Live updates ([DEC-019](../../../../docs/DECISIONS.md#accepted-decisions), [ADR-0006](../../../../docs/adr/0006-live-updates.md), T65). Source chapters: 4, 7, 8, 9, 19; [feature catalog](../../../../packages/feature-catalog/features.json).

- `GET /v1/live` (`api.py`, `service.py`) is a server-sent event stream for the signed-in account: `ready`, then `change` events naming only a kind (`conversation` or `notifications`), identifiers and a reason, `resync` when hints may have been lost, and `end` when the stream closes (time limit, sign-out). A `: keep-alive` comment goes out every 15 s (`COMMUNITY_LIVE_HEARTBEAT_SECONDS`); the session is checked again every 60 s (`COMMUNITY_LIVE_RECHECK_SECONDS`); a stream lasts at most 30 minutes (`COMMUNITY_LIVE_MAX_SECONDS`).
- `hub.signal(database, kind, account_ids, **fields)` sends a hint with `pg_notify('community_live', ...)` inside the caller's transaction, so only committed changes are announced, at most 100 accounts per notice. Hints never carry content: the apps read the change through the normal API, which checks access again.
- `LiveHub` keeps one listening connection per API process and hands hints to the open streams of the named accounts: at most 5 streams per account (429 `LIVE_LIMIT_REACHED` with `Retry-After: 30` beyond; a closed stream frees its place at once, T124), 100 queued hints per stream, and a `resync` to every stream when the listening connection had to reconnect.
- Hints are sent by messaging (opened, message, deleted, read for the reader only), scheduling (reminder delivered), notifications (read, acknowledge, snooze), Spaces when a membership ends (`access`, T86) and the account purge (`member_left`).

Tests: `backend/tests/test_live_updates.py`. Not built: the WebSocket gateway, replay and snapshot cursors, other resources, delivery receipts, typing and presence.
