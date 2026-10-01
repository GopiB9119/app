# openapi

[openapi.json](openapi.json) is generated from the current local FastAPI application. On 2026-10-01 it lists 144 operations on 119 paths, at migration `0022`, including the 9 group directory, visibility and join request operations. It contains only built operations, not the full planned API.

| Group | Operations |
| --- | --- |
| Account: registration, sign-in, recovery, profile, sessions, security activity, time zones and personal data export (untagged) | 18 |
| Spaces: create, list, read, settings, members, leave, ownership transfer and sent invitations | 16 |
| Invitations: inbox, accept and decline | 3 |
| Tasks, assignees and checklists | 8 |
| Calendar | 1 |
| Reminders | 4 |
| Repeating reminders: preview, create, list, read, pause, resume, skip and cancel ([DEC-010](../../docs/DECISIONS.md#accepted-decisions)) | 8 |
| Reminder requests | 7 |
| Notifications and preferences, including snooze | 6 |
| Messaging | 7 |
| Public community | 29 |
| Events | 6 |
| Care (not an approved requirement; see [TASKS X1](../../docs/TASKS.md#work-outside-the-approved-scope)) | 6 |

Protected operations declare account-session bearer authentication, including the 12 account and export operations ([TASKS T08](../../docs/TASKS.md#defects-that-break-approved-requirements)). Only registration, email verification, sign-in, recovery, password reset and the time-zone list declare none. The browser reaches the API through its protected same-origin proxy instead of holding tokens. Public page and post reads also work signed out. Views omit internal request keys, digests and admission IDs.

Regenerate from `create_app().openapi()` after route/schema changes. Do not edit generated schema fields independently of the application. Local implementation metadata is not approval of the proposed production ADRs or future operation inventory.

The membership slice adds three authenticated operations: current roster, reviewed ordinary-member removal and authenticated self-leave. Removal/leave require `Idempotency-Key`, `If-Match` and strict empty JSON bodies; the roster exposes an opaque ETag, not an admission ID or receipt. Their generated schema and local additive migration `0008` were verified. Rejoining reuses the existing invitation operations without a schema change; there is no separate rejoin, arbitrary role-update or removal-by-GET operation.
