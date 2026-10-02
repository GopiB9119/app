# Feature and Screen Build List

Updated: 2026-10-01. Product: Community Platform. The Agent is built by a separate workstream; everything below must work without any model.

This is the readable build list for the human product: every product area from [idea.md](../idea.md) and Chapters 1-20, what already works on backend / web / Kotlin Android, which pages and screens exist or are missing, and the rules every feature must follow. The per-key ledger of all 190 catalog groups stays in [PRODUCT_FEATURES.md](PRODUCT_FEATURES.md); test evidence and limitations stay in [BUILD_STATUS.md](BUILD_STATUS.md). When a feature changes state, update both this list and the ledger in the same change.

Status words used here:

| Status | Meaning |
| --- | --- |
| **Working (limited)** | A real backend path plus web and Android clients exist and were checked in their stated scope. Wider chapter scope still remains. |
| **Backend only** | The API exists, but no web or Android screen uses it yet. |
| **In progress** | Code is being written now. Not qualified; do not treat as done. |
| **Not built** | No working implementation on any platform. |
| **Deferred** | Agent workstream only. |

No row is marked working because a folder, README, mock, compile or old test name exists. Device, accessibility, load, restore, release and production qualification belong to the independent testing workstream.

## 1. Languages, Packages and Runtime

| Layer | Language and packages | Where versions live |
| --- | --- | --- |
| Backend API and workers | Python 3.11+, FastAPI, Pydantic, SQLAlchemy 2, Alembic, psycopg 3, Argon2, cryptography (Fernet/HKDF), zoneinfo/tzdata | [pyproject.toml](../backend/pyproject.toml), [Dockerfile](../backend/Dockerfile) |
| Database and local services | PostgreSQL 17, Mailpit (local synthetic mail only), Docker Compose | [compose.yaml](../infra/compose.yaml) |
| Web | TypeScript, Next.js 16 App Router, React 19, Zod, TanStack Query, React Hook Form, Lucide icons, same-origin session BFF | [web/package.json](../web/package.json) |
| Android | Kotlin, Jetpack Compose + Material 3, Coroutines/StateFlow, ViewModel, Hilt, Retrofit/OkHttp, Android Keystore session storage; min SDK 26, target 35, JDK 21 toolchain | [app/build.gradle.kts](../android/app/build.gradle.kts) |
| Checks | pytest on isolated PostgreSQL schemas, Node test runner (typed client/BFF + offline component + live browser), JUnit, Compose instrumentation | [tests](../tests), [backend/tests](../backend/tests) |
| Design tokens | One JSON file generated into web CSS variables and Android Kotlin constants by `npm run tokens`; `npm run check:tokens` guards it ([DEC-013](DECISIONS.md#accepted-decisions)) | [tokens.json](../packages/design-tokens/tokens.json) |

Not yet added, and only added with the feature that needs them: WebSocket gateway, Room database, WorkManager jobs, push provider, object storage/scanner, recurrence library, reviewed end-to-end encryption library, external calendar/SMS/WhatsApp/voice providers.

## 2. Feature Areas

Columns B / W / A are backend / web / Android.

### 2.1 Login and Account

| Capability | B / W / A | Status and remaining work |
| --- | --- | --- |
| Register with email proof, sign in, sign out | Yes / Yes / Yes | Working (limited): synthetic `.test` email and local Mailpit only |
| Account recovery with email proof | Yes / Yes / Yes | Working (limited) |
| Profile name and timezone | Yes / Yes / Yes | Working (limited); handles, avatar, field audiences not built |
| Sessions list, revoke one/others, security activity | Yes / Yes / Yes | Working (limited) |
| Data export (request, status, download) | Yes / No / No | Backend only: `/v1/me/exports` |
| Phone verification, contact linking/discovery, relationships | No / No / No | Not built |
| Account deactivation and deletion | No / No / No | Not built |

### 2.2 Home and Discover

| Capability | B / W / A | Status |
| --- | --- | --- |
| Home feed of public posts from followed pages | Yes / Yes / Yes | Working (limited): Following, Latest and Saved tabs, newest first |
| Discover: page search, topics, trending, local | Yes / Yes / Yes | Working (limited): page search with topic filter, and post search over title and text, newest first ([T29](TASKS.md#approved-requirements-not-built-yet)); trending and local not built |
| Personalization controls, hide/mute/not interested | No / No / No | Not built |

Rule: discovery never uses private chats, family tasks, calendars, health data or Agent memory as content or signals.

### 2.3 Public Community

| Capability | B / W / A | Status |
| --- | --- | --- |
| Public pages: create, view, owner/admin roles | Yes / Yes / Yes | Working (limited): create, view signed out, owner edits (on Android since 2026-10-01, [T73](TASKS.md#approved-requirements-not-built-yet)); public page rules and up to 3 pinned posts above the date-ordered posts ([T83](TASKS.md#community-management), [DEC-025](DECISIONS.md#accepted-decisions), provisional); moderators invited by account ID who pin and remove comments, handing a page over, and archive, delete and restore ([T84, T85](TASKS.md#community-management)); editors/admins not built |
| Follow and unfollow pages | Yes / Yes / Yes | Working (limited); Android lists the pages you follow since 2026-10-01 ([T72](TASKS.md#approved-requirements-not-built-yet)) |
| Posts: drafts, explicit publish, edit, delete | Yes / Yes / Yes | Working (limited); Android post editing added on 2026-10-01 ([T31](TASKS.md#approved-requirements-not-built-yet)) |
| Comments and replies, reactions, saves, shares | Yes / Yes / Yes | Working (limited): comments with one reply level, like, save; shares not built |
| Report and block | Yes / Yes / Yes | Working (limited): reports are stored; moderator review tools not built |

Rule: a public feed is not production-ready until reporting, blocking and visibility withdrawal exist with it.

### 2.4 Private Spaces

| Capability | B / W / A | Status and remaining work |
| --- | --- | --- |
| Family Space create, list, detail | Yes / Yes / Yes | Working (limited) |
| Group Space (friends, a club, a team), private or public ([DEC-011](DECISIONS.md#accepted-decisions)) | Yes / Yes / Yes | Working (limited): private by default; the owner can make it public with a confirmation, and back; family and solo stay private ([T22](TASKS.md#spaces)) |
| Find groups: search public groups by name or description; see name, description and member count only | Yes / Yes / Yes | Working (limited): blocks hide groups both ways; private groups never appear |
| Solo Space (one human owner, no invitations) | Yes / Yes / Yes | Working (limited); native device qualification open |
| Couple Space (the creator and one partner) | Yes / Yes / Yes | Working (limited), [DEC-017](DECISIONS.md#accepted-decisions), provisional: usable at once and shown as waiting for the partner; one waiting invitation at a time; a third person is refused; always private ([T12](TASKS.md#approved-requirements-not-built-yet)) |
| Temporary event Space | No / No / No | Not built |
| Archive, restore, expiry, type conversion | No / No / No | Not built |

### 2.5 Members, Invitations and Settings

| Capability | B / W / A | Status |
| --- | --- | --- |
| Invite an existing verified account by account ID; inbox, review, accept, decline, revoke | Yes / Yes / Yes | Working (limited); no email/phone/contact invitations |
| Roster, owner removes member, member leaves | Yes / Yes / Yes | Working (limited) |
| Rejoin only through a new invitation (new admission, no old grants) | Yes / Yes / Yes | Working (limited) |
| Ownership transfer with recipient acceptance | Yes / Yes / Yes | Working (limited); native device journey pending qualification |
| Owner renames Space | Yes / Yes / Yes | Working (limited) |
| Space description, edited by the owner | Yes / Yes / Partly | Working (limited); Android sets it when creating a group but cannot edit it yet |
| Join requests to public groups: ask with a note, withdraw, owner approves or declines, 14-day expiry, 7 days before asking again | Yes / Yes / Yes | Working (limited) ([T22](TASKS.md#spaces)) |
| Space admins: the owner makes a member an admin, who invites, removes ordinary members and answers join requests ([DEC-018](DECISIONS.md#accepted-decisions), provisional) | Yes / Yes / Yes | Working (limited): family and group Spaces; only the owner changes roles ([T13](TASKS.md#approved-requirements-not-built-yet)) |
| Who can invite people: the owner of a family or group Space lets everyone in it invite, or keeps it to the owner and admins ([DEC-026](DECISIONS.md#accepted-decisions), provisional) | Yes / Yes / Yes | Working (limited): members invite as members and see only their own invitations ([checkpoint](BUILD_STATUS.md#who-can-invite-checkpoint)) |
| Moderator, guest and observer roles; other per-Space permission settings; configurable history sharing | No / No / No | Not built |

### 2.6 Space Chat and Direct Messages

| Capability | B / W / A | Status |
| --- | --- | --- |
| One shared chat per Space for current members | Yes / Yes / Yes | Working (limited) |
| Direct conversation between two current members of the same Space | Yes / Yes / Yes | Working (limited); read-only after either person leaves |
| Send with stable retry identity; unknown outcome retried with the same identity | Yes / Yes / Yes | Working (limited); retry identity is in memory, not a crash-safe outbox |
| History boundary: members see messages from their current admission onward | Yes / Yes / Yes | Working (limited) |
| Unread counts and read position | Yes / Yes / Yes | Working (limited) |
| Author deletes own message for everyone (tombstone, no recall of seen copies) | Yes / Yes / Yes | Working (limited) |
| Edits, threads, reactions, attachments, typing/presence, calls, message reports | No / No / No | Not built |
| Realtime push of new messages (WebSocket) | No / No / No | WebSocket transport is not built; live hints use server-sent events with polling fallback (T65). The web honors Retry-After after a 429 without stopping chat polling ([T120 checkpoint](BUILD_STATUS.md#web-live-retry-after-checkpoint)) |

### 2.7 Conversation Encryption

| Capability | Status |
| --- | --- |
| Message bodies encrypted at rest on the server with a purpose-derived key | Working (limited). The server can read these messages; this is not end-to-end encryption, and every chat screen says so. |
| End-to-end encryption, device keys, key recovery, safety numbers | Not built. Requires a maintained, independently reviewed protocol library on Android and web (Chapter 19 decision C19-D05). No homemade cipher, ratchet or key exchange; no plaintext fallback; account recovery is not key recovery. |

Every chat screen must state the real protection level. Never label server-readable messages as end-to-end encrypted.

### 2.8 Tasks

| Capability | B / W / A | Status |
| --- | --- | --- |
| Create, list, detail, edit, assign current member, progress, complete, reopen, cancel | Yes / Yes / Yes | Working (limited) |
| Due date (calendar date only, never an automatic reminder) | Yes / Yes / Yes | Working (limited) |
| Checklists on a task (managers add/rename/remove, assignee checks) | Yes / Yes / Yes | Working (limited) |
| Dependencies, recurring tasks, planning workspaces | No / No / No | Not built |

### 2.9 Events and RSVP

| Capability | B / W / A | Status |
| --- | --- | --- |
| Space events with time, timezone, location and audience | Yes / Yes / Yes | Working (limited): current Space members only, from their admission onward; edit and cancel by organizer or owner. Web timezone choices come from the API, with browser-alias mapping and retryable list failures ([T118 checkpoint](BUILD_STATUS.md#web-event-timezone-checkpoint)) |
| RSVP (Going, Maybe, Not going) separate from attendance | Yes / Yes / Yes | Working (limited): reschedule asks people to confirm again |
| Capacity, waitlist, check-in, polls, budgets, expenses, contributions | No / No / No | Not built |
| Public events, invitations outside the Space, recurring events | No / No / No | Not built |

Web workflow improvements ([T121/T123](BUILD_STATUS.md#web-event-workflow-improvements-checkpoint), 2026-10-02): protected in-page drafts and unconfirmed creates, stable Space selection across refresh, field-linked validation and focus, character counters, dates in the selected language, viewer-local times, visible outdated responses, explicit refresh and 44 px event targets. 28 focused checks and both live journeys passed, including 320 px with 200% text. Drafts are not durable offline storage; larger [recommended event features](../web/src/features/events/README.md#recommended-next-features) remain recommendations, not approvals.

### 2.10 Reminders

| Capability | B / W / A | Status |
| --- | --- | --- |
| One-time personal reminder for a task (explicit review, IANA timezone, DST gap/fold choice) | Yes / Yes / Yes | Working (limited) |
| Ask the assignee to accept a reminder; no schedule until the recipient accepts | Yes / Yes / Yes | Working (limited) |
| Cancel before delivery; in-app delivery by an independent worker | Yes / Yes / Yes | Working (limited) |
| Repeating reminder for a task: every 1–30 days or chosen weekdays every 1–4 weeks, one time and timezone, up to a year; review of the first times and of clock changes; pause, resume, skip the next time, cancel | Yes / Yes / Yes | Working (limited), provisional ([DEC-010](DECISIONS.md#accepted-decisions)); native not device-qualified |
| Snooze a delivered reminder for 10 minutes, 1 hour, 3 hours or 1 day, at most three times | Yes / Yes / Yes | Working (limited), provisional (DEC-010); native not device-qualified |
| Edit a saved repeating reminder or one of its times, repeating requests for another person, quiet hours, escalation | No / No / No | Not built ([T24, T25, T28](TASKS.md#scheduling)) |

### 2.11 Medication Reminders and Care Instructions

| Capability | B / W / A | Status |
| --- | --- | --- |
| Record confirmed medication instructions exactly as given by a person or professional | Yes / Yes / Yes | Working (limited): only the person themselves; they confirm the details and name the source |
| Daily reminder times for a confirmed instruction, for the subject only | Yes / Yes / Yes | Working (limited): a day plan shows each time, handling clock changes; nothing is sent at those times |
| Taken / skipped self-report, separate from read and from adherence | Yes / Yes / Yes | Working (limited): the person's own notes, from one hour before to seven days after each time; corrections kept as revisions |
| Caregiver visibility only with the subject's explicit grant | No / No / No | Not built: nobody else can see care records |

Rules: organize confirmed instructions only. No diagnosis, prescribing, inferred dose, dose change, missed-dose doubling, medicine identification from photos or emergency guarantee. A family owner or admin is not a guardian and gets no health data by role.

### 2.12 Notifications

| Capability | B / W / A | Status |
| --- | --- | --- |
| Private in-app inbox for task reminders; read, snooze and acknowledge are separate | Yes / Yes / Yes | Working (limited) |
| Reminder delivery preference (versioned opt-in) | Yes / Yes / Yes | Working (limited) |
| Message unread badges | Yes / Yes / Yes | Working (limited): in-app unread counts, not push |
| Push, email, SMS, WhatsApp, voice notifications | No / No / No | Not built; require provider, consent, verified destination and approval |
| Digests, quiet hours, escalation, delivery budgets | No / No / No | Not built |

### 2.13 Calendar

| Capability | B / W / A | Status |
| --- | --- | --- |
| Month agenda of authorized task due dates, your own timed reminders and the planned times of your repeating reminders | Yes / Yes / Yes | Working (limited); native not device-qualified |
| Events, external calendar sync | No / No / No | Not built: events are not yet shown in the agenda ([T23, T27](TASKS.md#scheduling)) |

### 2.14 Safety, Privacy and Data Rights

| Capability | B / W / A | Status |
| --- | --- | --- |
| Report content or people, block, mute | Yes / Yes / Yes | Working (limited): report and block on public content; mute and chat blocking not built |
| Moderation cases, reviewer queues, restrictions, appeals | Yes / Yes / Yes | Working (limited): platform moderators review reported public pages, posts and comments, hide them or take no action, and resolve appeals; authors see decisions and appeal once; reporters see whether their report was reviewed ([DEC-024](DECISIONS.md#accepted-decisions), [T69](TASKS.md#owners-critical-gaps)); restrictions on people not built |
| Export your data | Yes / Yes / Yes | Working (limited): choose categories, download for 24 hours in the browser or phone that asked, cancel ([T68](TASKS.md#owners-critical-gaps)) |
| Delete your account and derived data | Yes / Yes / Yes | Working (limited): password, refused while you own a Space with other members, 7-day grace with cancel at sign-in, then erased; shared items stay for others as from a deleted account ([DEC-022](DECISIONS.md#accepted-decisions), [T68](TASKS.md#owners-critical-gaps)) |
| Age and guardian policy | No / No / No | Not built; needs qualified policy |

### 2.15 Files and Documents

| Feature | Backend / Web / Android | Status |
| --- | --- | --- |
| Text documents in a Space: add, list, open with line numbers, delete ([DEC-015](DECISIONS.md#accepted-decisions)) | Yes / Yes / Yes | Working (limited): `.txt`, `.md` and `.csv` up to 512 KB; members admitted before a document was added see it; the person who added it or the owner deletes it, and everything derived goes with it ([T14](TASKS.md#approved-requirements-not-built-yet)) |
| Search inside your Spaces: documents, tasks and events | Yes / Yes / Yes | Working (limited): results cite document lines and name the Space; messages, care, reminders and memory are not searched ([T15](TASKS.md#approved-requirements-not-built-yet)) |
| Other file types, scanning, previews, OCR, versions, sharing | No / No / No | Not built: a scanner needs internet downloads (DEC-005) |

### 2.16 Agent

All Agent features (scoped chat, drafting, approvals, memory, tools, evaluation) stay **Deferred** to the separate Agent workstream until the owner confirms [DEC-012](DECISIONS.md#accepted-decisions) (conflict C11). Under that provisional decision, a first release without an AI model exists **on the backend only** ([T33](TASKS.md#approved-requirements-not-built-yet); [checkpoint](BUILD_STATUS.md#agent-backend-checkpoint)): in one Space a person can list the tasks they see, add or complete a task, set their own one-time reminder, and save or delete a note or their usual reminder time. Every change is shown as exact fields and runs only after approval, through the same task and reminder services as the screens; health, contacting anyone, other people's reminders, money, members and deleting are refused. The web screen `/app/agent` is linked from the header and verified live ([T34](TASKS.md#approved-requirements-not-built-yet); [checkpoint](BUILD_STATUS.md#agent-web-screen-checkpoint)), and Android opens it from the account screen, also verified live ([T35](TASKS.md#approved-requirements-not-built-yet); [checkpoint](BUILD_STATUS.md#android-agent-checkpoint)). Future Agent tools must call the same authorized domain services built here.

## 3. Pages and Screens

### Web pages

| Route | Purpose | Status |
| --- | --- | --- |
| `/login`, `/register`, `/recover` | Sign in, registration with email proof, recovery | Working (limited) |
| `/app` | Home: needs attention, today, your Spaces and posts from pages you follow, each section loading on its own; Calendar and Medicines open from here | Working (limited), web only ([T38](TASKS.md#design-and-experience)) |
| `/app/settings/account` | Profile: name, timezone, sessions, security activity, Blocked, sign out | Working (limited) |
| `/app/spaces` | Space list/create, invitations, members, ownership, settings | Working (limited) |
| `/app/tasks` | Task list/detail/editor/status per Space | Working (limited) |
| `/app/calendar` | Month agenda | Working (limited) |
| `/app/reminders` | Reminder review/create/list/cancel, repeating reminders and requests | Working (limited) |
| `/app/notifications` | In-app inbox with snooze, and preferences | Working (limited) |
| `/app/messages` | Space chats and direct messages | Working (limited) |
| `/app/home`, `/app/discover`, `/pages/[handle]`, `/posts/[id]` | Discover: the feed (Following, Latest, Saved), page and post search, public page and post (public page and post work signed out) | Working (limited) |
| `/app/pages` | Your pages, create a page, pages you follow | Working (limited) |
| `/app/events` | Space events and RSVP | Working (limited) |
| `/app/care` | Medication instructions and daily care reminders | Working (limited): day plan and medicines list; no notifications |
| `/app/safety` | Blocked pages and people, decisions about your content with appeals, your reports, and for moderators a link to the queue, under Profile | Working (limited) |
| `/app/moderation` | Moderators only: reported public content with decisions, and appeals ([T69](TASKS.md#owners-critical-gaps)) | Working (limited) |
| `/app/documents` | Documents of a Space: add, list, open at cited lines, delete | Working (limited) |
| `/app/search` | Search inside your Spaces | Working (limited) |
| `/app/agent` | Agent: ask in a Space, answer its question, approve or decline the exact change, history, memories | Working (limited): no AI model; under provisional DEC-012 |
| `/app/settings/data` | Your data: download your data, delete your account ([T68](TASKS.md#owners-critical-gaps)) | Working (limited) |

### Android screens

| Screen | Entry | Status |
| --- | --- | --- |
| Login, register, verify, recover | App start | Working (limited) |
| Home: needs attention, today, your Spaces, pages you follow | Home in the bottom bar | Working (limited); offline screen tests and a live journey on the emulator ([T38](TASKS.md#design-and-experience)) |
| Account: profile, timezone, sessions, security activity | Profile in the bottom bar; opens after sign in | Working (limited) |
| Spaces: list, create, detail, invitations, members, ownership | Spaces in the bottom bar / Home | Working (limited) |
| Space settings | Owner Space detail | Working (limited) |
| Tasks: list, detail, editor, status | Profile header / Space detail / Home | Working (limited) |
| Calendar agenda | Home | Working (limited); not device-qualified |
| Reminders, repeating reminders and notification inbox with snooze | Bell on Home and Profile / task detail | Working (limited); repeating reminders and snooze not device-qualified |
| Messages: conversation list and chat | Messages in the bottom bar / Space detail | Working (limited); not device-qualified |
| Community: Feed, Pages and posts, page, post, comments, your pages | Discover in the bottom bar / Home | Working (limited); not device-qualified |
| Events and RSVP | Space detail / Home | Working (limited); not device-qualified |
| Care instructions and medication reminders | Home (Medicines) | Working (limited); not device-qualified |
| Documents: add, list, open at cited lines, delete | Space detail | Working (limited); 7 offline screen tests and a live journey on the emulator |
| Search inside your Spaces | Home header | Working (limited); covered by the same device tests |
| Agent: ask in a Space, answer its question, approve or decline the exact change, history, memories | Profile | Working (limited): no AI model; under provisional DEC-012; 6 offline screen tests and a live journey on the emulator ([T35](TASKS.md#approved-requirements-not-built-yet)) |
| Safety, privacy, export, deletion | Profile | Working (limited): the blocked list, decisions about your content with appeals and your reports; for moderators the moderation screen with 7 device tests ([T69](TASKS.md#owners-critical-gaps)); "Your data" with the download and account deletion ([T68](TASKS.md#owners-critical-gaps)), its device tests not yet run |
| Phone alerts for new reminders and messages | Reminder inbox settings | Working (limited): checks about every 15 minutes after you turn them on; no push provider ([DEC-020](DECISIONS.md#accepted-decisions), [T66](TASKS.md#owners-critical-gaps)) |

Every screen handles loading, empty, failed, denied, offline, stale/conflict, uncertain outcome, unsaved edits and account change where they apply, and keeps the exact person, Space, source and time in confirmations. Layouts must work at 320 px / 320 dp and at 200% text.

Navigation ([DEC-014](DECISIONS.md#accepted-decisions); [T38](TASKS.md#design-and-experience)): the same five main sections in both apps, Home, Spaces, Messages, Discover and Profile, with Home as a personal overview (needs attention, today, your Spaces, pages you follow). On the web every signed-in page shows them with visible labels, as a bar under the header and from 1200 px as a column at the side; the header keeps search, the notification bell with its unread count and the agent. On Android a bottom bar with the same five labels shows on the five top-level screens. It hides while one Space or one chat is open, where the screen's own back button leads out, and it is disabled while leaving would lose an unconfirmed or unsaved change. Android Home has search, the bell with its unread count, Calendar and Medicines; Profile keeps the account, sessions, the agent and the blocked list. Sign-in still opens Profile in both apps; which section should open is open question [Q21](PRODUCT_UNDERSTANDING.md#39-open-questions).

## 4. Rules Every Feature Follows

- **Authority:** the backend derives the actor from the session and checks current account, Space admission, object grant and subject consent on every read and write. The UI hides controls but never decides permission. Owner/admin roles do not grant another person's health data or earlier history.
- **Privacy:** private Spaces, chats, tasks, calendars and care records never feed public discovery, search suggestions, analytics or logs. Pages show minimal projections; errors do not reveal whether hidden records exist.
- **History:** joining or rejoining gives a new admission. It does not unlock earlier tasks or messages unless a reviewed history policy says so.
- **Writes and retries:** each mutation carries a stable idempotency key and, where it edits reviewed state, the reviewed version (`If-Match`). An unknown outcome is not failure or success; the client retries with the same key or reloads, never silently creates a second effect.
- **Atomicity:** the domain change, required audit record and durable work (outbox) commit in one transaction.
- **Notification truth and timing:** sent, delivered, read, acknowledged, task completed and medication taken are different facts. Dates stay dates; timed reminders keep local time, IANA timezone and the exact UTC instant chosen. Push is only a hint. Cancelling stops future delivery but cannot recall what was already delivered.
- **Encryption honesty:** show the real protection level; no homemade cryptography, no silent downgrade, no plaintext fallback.
- **Health safety:** organize confirmed instructions only; no clinical decisions; no emergency guarantee.
- **Errors:** show a clear, specific message; keep drafts; offer retry or reload; clear private data on sign-out, account change or lost access.
- **Limits:** every list is paginated and bounded; every input has length and character rules; every receipt table has a local bound.
- **Local only:** synthetic accounts, local services, no external sends, no provider credentials, no spending, no deployment.
- **Screen design** ([DEC-013](DECISIONS.md#accepted-decisions)), for every new or changed screen on web and Android. Existing screens change only through tasks that name the change ([T37](TASKS.md#design-and-experience)).
  - Most important first: details, history and rare settings sit behind "View all", a details view or settings.
  - One main action per screen or section; other actions are secondary or under "More".
  - Lists and form sections stay unframed; cards only for repeated items; never a card inside a card.
  - Colours, spacing (multiples of 4), corner radii and target sizes come only from the [design tokens](../packages/design-tokens/README.md), never typed by hand.
  - Plain words: say what the person does or sees. No internal terms such as admission, ETag, idempotency key, payload or cursor.
  - Familiar icons, with a visible label wherever the meaning is not obvious; one icon means one thing in both apps.
  - Forms ask only what is needed now; advanced options live in settings.
  - Confirm anything hard to undo, naming the exact person, Space and item.
  - Quiet decoration: no gradient blobs, heavy shadows or decorative animation; motion only shows a change and respects reduced motion.
  - The same names, sections and confirmations in both apps; layouts may differ.
  - To change how something looks, change the shared token or component, after checking every place that uses it, rather than patching one screen; then check the changed screens at 320 px / 320 dp and 200% text.

## 5. Build Order and Current Batch

Order agreed from the chapters and the user's priorities:

1. **Space chat and direct messages** with server-side encryption at rest, stable send identity, history boundary, unread counts and author deletion, on backend, web and Android. **Done (limited)** on 2026-09-30; see [the checkpoint](BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint).
2. **Public community and Home:** pages, follows, posts, comments, reactions, Home feed, Discover search, report and block. **Done (limited)** on 2026-09-30; see [the checkpoint](BUILD_STATUS.md#public-community-checkpoint).
3. **Space events and RSVP.** **Done (limited)** on 2026-10-01; see [the checkpoint](BUILD_STATUS.md#space-events-and-rsvp-checkpoint).
4. **Medication instructions and daily care reminders** for the subject, with the health rules above. **Done (limited)** on 2026-10-01 and kept by [DEC-007](DECISIONS.md#accepted-decisions); see [the checkpoint](BUILD_STATUS.md#care-checkpoint). Who approves its medical, legal and privacy rules is open (Q12).
5. **Repeating reminders, snooze and their planned times in the calendar.** **Done (limited)** on 2026-10-01, provisionally under [DEC-010](DECISIONS.md#accepted-decisions); see [the checkpoint](BUILD_STATUS.md#repeating-reminders-snooze-and-planned-times-checkpoint).
6. Remaining Space types, notification channels, files, data rights, offline persistence, localization and accessibility.
7. Agent integration through these domain services, by the separate workstream.

Progress for each batch is recorded in [BUILD_STATUS.md](BUILD_STATUS.md) with exact checks run and their limits, and the matching rows above and in the ledger are updated at the same time.
