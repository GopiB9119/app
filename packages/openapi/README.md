# openapi

[openapi.json](openapi.json) is generated from the current local FastAPI application. As regenerated on 2026-10-03 at 16:10 it lists 213 operations on 179 paths (counted by tag below; the groups sum to 213). Since the 15:30 regeneration it adds saving and removing an event budget's split (2, T174, [DEC-042](../../docs/DECISIONS.md#accepted-decisions), provisional). Before that, as regenerated on 2026-10-03 at 15:30 it listed 211 operations on 178 paths. Since the 12:53 regeneration it adds contributions to an event budget (3: recording one, marking it promised or given, and withdrawing it, T173, [DEC-041](../../docs/DECISIONS.md#accepted-decisions), provisional). Before that, as regenerated on 2026-10-03 at 12:53 it listed 208 operations on 176 paths. Since the 02:40 regeneration it adds event budgets (4: reading and saving a budget, recording an expense and deleting one, T159, [DEC-039](../../docs/DECISIONS.md#accepted-decisions), provisional), and from other sessions' work muting and Not interested controls (3), posts from your interests (1) and page insights (1). Before that, as regenerated on 2026-10-03 at 02:40 it listed 199 operations on 169 paths. Since the 2026-10-02 regeneration that one added a Space owner's agent switch (`POST /v1/spaces/{space_id}/agent-policy`, T152, [DEC-028](../../docs/DECISIONS.md#accepted-decisions), provisional), editing a chat message and reacting to one (2, T162, [DEC-033](../../docs/DECISIONS.md#accepted-decisions), provisional), and from another session's work interests, suggested pages and the topic list (4, DEC-027). Before that, as regenerated on 2026-10-02 it listed 192 operations on 163 paths. Since the 23:00 regeneration it adds page moderators, handing a page over, and archiving, deleting and restoring a page (17 operations, T84 and T85, [DEC-025](../../docs/DECISIONS.md#accepted-decisions)), and one Spaces operation from another session's work. Before that, since the 19:25 regeneration it adds page rules and pinned posts (3 operations, T83, [DEC-025](../../docs/DECISIONS.md#accepted-decisions), provisional), and two pieces of other sessions' work: asking for and cancelling account deletion (2, T68) and moderation (8, T69, in progress). Since the 13:48 regeneration it also added the owner's role change for Space admins ([DEC-018](../../docs/DECISIONS.md#accepted-decisions), awaiting review), the `couple` Space type and `admin` role values, and `GET /v1/live` from another session's work in progress. It contains only built operations, not the full planned API. Several groups are built under decisions that still wait for the owner's review (conflict C11) or decision (X2), as marked.

| Group (tag) | Operations |
| --- | --- |
| Account: registration, sign-in, recovery, profile, sessions, security activity, time zones, personal data export, and asking for and cancelling account deletion (untagged) | 20 |
| Spaces: create, list, read, settings, visibility, members, a member's role (owner only), leave, ownership transfer, sent invitations, and asking to join a group with the approve and decline of the owner or an admin, plus one operation from another session's work and the owner's agent switch (T152) | 24 |
| Space directory and your own join requests (group Spaces, T22, [DEC-011](../../docs/DECISIONS.md#accepted-decisions), awaiting review) | 4 |
| Invitations: inbox, accept and decline | 3 |
| Tasks, assignees and checklists | 8 |
| Calendar | 1 |
| Reminders | 4 |
| Repeating reminders ([DEC-010](../../docs/DECISIONS.md#accepted-decisions), awaiting review), including the alerts work's move and replace ([X2](../../docs/TASKS.md#work-outside-the-approved-scope)) | 10 |
| Reminder requests | 7 |
| Notifications, preferences and snooze, plus the alerts work's quiet hours, alerts and backup contacts ([X2](../../docs/TASKS.md#work-outside-the-approved-scope), awaiting the owner's decision) | 20 |
| Messaging, including editing a message and reacting to one (T162) | 9 |
| Public community, including page rules and pinned posts (T83), page moderators and handover (T84), and page archive, delete and restore (T85), and interests, suggested pages and the topic list (DEC-027, another session's work), plus muting and Not interested, posts from your interests and page insights (other sessions' work) | 58 |
| Moderation (T69, in progress) | 8 |
| Events, including an event's budget, its expenses (T159, [DEC-039](../../docs/DECISIONS.md#accepted-decisions), provisional) and contributions (T173, [DEC-041](../../docs/DECISIONS.md#accepted-decisions), provisional) and its split (T174, [DEC-042](../../docs/DECISIONS.md#accepted-decisions), provisional) | 15 |
| Care ([DEC-007](../../docs/DECISIONS.md#accepted-decisions); see [TASKS X1](../../docs/TASKS.md#work-outside-the-approved-scope)) | 6 |
| Documents and search inside your Spaces ([DEC-015](../../docs/DECISIONS.md#accepted-decisions), awaiting review) | 5 |
| Agent ([DEC-012](../../docs/DECISIONS.md#accepted-decisions), awaiting review) | 10 |
| Live updates (`GET /v1/live`, another session's work in progress, not described here) | 1 |

Protected operations declare account-session bearer authentication, including the 12 account and export operations ([TASKS T08](../../docs/TASKS.md#defects-that-break-approved-requirements)). Only registration, email verification, sign-in, recovery, password reset and the time-zone list declare none. The browser reaches the API through its protected same-origin proxy instead of holding tokens. Public page and post reads also work signed out. Views omit internal request keys, digests and admission IDs.

Regenerate from `create_app().openapi()` after route/schema changes. Do not edit generated schema fields independently of the application. Local implementation metadata is not approval of the proposed production ADRs or future operation inventory.

## Verification and Client Compatibility

T166 adds a read-only structural check and includes it in the default local verification run:

```powershell
npm run test:openapi
npm run check:openapi
npm run verify -- -Suite contracts
```

`test:openapi` runs the focused CLI tests against the isolated synthetic PostgreSQL fixture. `check:openapi` uses [check-openapi.mjs](../../scripts/check-openapi.mjs) and the existing cached `community-platform-tests` image with no network, no image pulling, and absolute read-only mounts for backend source and contracts. Docker and that image must already be available; the comparison does not start the shared API, run migrations, contact a database or access the application key file.

The underlying command is `python3 -m app.cli check-openapi`, defaulting to `/contracts/openapi/openapi.json`; `--output` may name another input file. Object-key order and whitespace do not matter. Arrays and JSON value types do matter. A missing/unreadable/invalid file or a structural difference exits with 1; differences print at most 20 JSON pointers, not values. The check never regenerates the artifact. A successful schema comparison exits normally and disposes the temporary application engine.

After reviewing and coordinating source changes, regenerate explicitly using the existing API image, then check again:

```powershell
docker compose -f infra/compose.yaml run --rm --no-deps --pull never api python3 -m app.cli export-openapi
npm run check:openapi
```

Both schema commands use a disposable in-memory key; normal migration and moderator commands still use their existing key behavior. Keep one writer for the generated artifact while feature work is active. The existing regeneration at 02:40 on 2026-10-03 was preserved and passed T166's check; the older audit copy was refused without changing its bytes or timestamp ([checkpoint](../../docs/BUILD_STATUS.md#openapi-contract-drift-gate-checkpoint)).

Clients remain handwritten, not generated:

- Web feature Zod schemas, request helpers and BFF allowlists are exercised by `npm --prefix web run test:client`; changed screens also need their component and live journeys. Update request/response validation and compatibility fixtures alongside a changed API.
- Android Retrofit/Gson DTOs and repositories are exercised by feature JVM tests, then lint/build/shrinker and device/live checks where affected. Preserve older-client handling and reviewed retry/version semantics.
- This gate compares source metadata with the stored OpenAPI document. It does not prove runtime responses obey it, automatically compare every Zod/Kotlin field, certify backward compatibility or replace authorization tests and cross-platform qualification (T169).

The membership slice adds three authenticated operations: current roster, reviewed ordinary-member removal and authenticated self-leave. Removal/leave require `Idempotency-Key`, `If-Match` and strict empty JSON bodies; the roster exposes an opaque ETag, not an admission ID or receipt. Their generated schema and local additive migration `0008` were verified. Rejoining reuses the existing invitation operations without a schema change; there is no separate rejoin or removal-by-GET operation. Since 2026-10-01 one reviewed role operation exists, `POST /v1/spaces/{space_id}/members/{account_id}/role` (owner only, `admin` or `member`, with `Idempotency-Key` and `If-Match`).
