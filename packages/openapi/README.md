# openapi

[openapi.json](openapi.json) is generated from the current local FastAPI application. As regenerated at about 23:00 on 2026-10-01 it lists 174 operations on 147 paths (counted by tag below; the groups sum to 174). Since the 19:25 regeneration it adds page rules and pinned posts (3 operations, T83, [DEC-025](../../docs/DECISIONS.md#accepted-decisions), provisional), and two pieces of other sessions' work: asking for and cancelling account deletion (2, T68) and moderation (8, T69, in progress). Since the 13:48 regeneration it also added the owner's role change for Space admins ([DEC-018](../../docs/DECISIONS.md#accepted-decisions), awaiting review), the `couple` Space type and `admin` role values, and `GET /v1/live` from another session's work in progress. It contains only built operations, not the full planned API. Several groups are built under decisions that still wait for the owner's review (conflict C11) or decision (X2), as marked.

| Group (tag) | Operations |
| --- | --- |
| Account: registration, sign-in, recovery, profile, sessions, security activity, time zones, personal data export, and asking for and cancelling account deletion (untagged) | 20 |
| Spaces: create, list, read, settings, visibility, members, a member's role (owner only), leave, ownership transfer, sent invitations, and asking to join a group with the approve and decline of the owner or an admin | 22 |
| Space directory and your own join requests (group Spaces, T22, [DEC-011](../../docs/DECISIONS.md#accepted-decisions), awaiting review) | 4 |
| Invitations: inbox, accept and decline | 3 |
| Tasks, assignees and checklists | 8 |
| Calendar | 1 |
| Reminders | 4 |
| Repeating reminders ([DEC-010](../../docs/DECISIONS.md#accepted-decisions), awaiting review), including the alerts work's move and replace ([X2](../../docs/TASKS.md#work-outside-the-approved-scope)) | 10 |
| Reminder requests | 7 |
| Notifications, preferences and snooze, plus the alerts work's quiet hours, alerts and backup contacts ([X2](../../docs/TASKS.md#work-outside-the-approved-scope), awaiting the owner's decision) | 20 |
| Messaging | 7 |
| Public community, including page rules and pinned posts (T83) | 32 |
| Moderation (T69, in progress) | 8 |
| Events | 6 |
| Care ([DEC-007](../../docs/DECISIONS.md#accepted-decisions); see [TASKS X1](../../docs/TASKS.md#work-outside-the-approved-scope)) | 6 |
| Documents and search inside your Spaces ([DEC-015](../../docs/DECISIONS.md#accepted-decisions), awaiting review) | 5 |
| Agent ([DEC-012](../../docs/DECISIONS.md#accepted-decisions), awaiting review) | 10 |
| Live updates (`GET /v1/live`, another session's work in progress, not described here) | 1 |

Protected operations declare account-session bearer authentication, including the 12 account and export operations ([TASKS T08](../../docs/TASKS.md#defects-that-break-approved-requirements)). Only registration, email verification, sign-in, recovery, password reset and the time-zone list declare none. The browser reaches the API through its protected same-origin proxy instead of holding tokens. Public page and post reads also work signed out. Views omit internal request keys, digests and admission IDs.

Regenerate from `create_app().openapi()` after route/schema changes. Do not edit generated schema fields independently of the application. Local implementation metadata is not approval of the proposed production ADRs or future operation inventory.

The membership slice adds three authenticated operations: current roster, reviewed ordinary-member removal and authenticated self-leave. Removal/leave require `Idempotency-Key`, `If-Match` and strict empty JSON bodies; the roster exposes an opaque ETag, not an admission ID or receipt. Their generated schema and local additive migration `0008` were verified. Rejoining reuses the existing invitation operations without a schema change; there is no separate rejoin or removal-by-GET operation. Since 2026-10-01 one reviewed role operation exists, `POST /v1/spaces/{space_id}/members/{account_id}/role` (owner only, `admin` or `member`, with `Idempotency-Key` and `If-Match`).
