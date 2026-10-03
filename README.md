# Community Platform

Public participation, private Spaces, reliable messaging, shared planning and a user-controlled Agent. The folder name is not a product-brand decision.

This repository is moving from the original twenty chapters into implementation. Sources and review contracts remain intact. A folder or feature catalog entry is not a working feature or an approved production policy.

## Repository

| Path | Responsibility |
| --- | --- |
| `backend/app/modules/` | FastAPI modular monolith with explicit domain ownership |
| `web/src/features/` | Next.js, TypeScript and the web experience |
| `android/app/` | Kotlin and Jetpack Compose Android application |
| `agent/` | Shared bounded Agent runtime, introduced after the manual workflows |
| `packages/` | Feature inventory, API/event/state contracts and design tokens |
| `infra/` | Local services and later reviewed deployment configuration |
| `scripts/` | Repeatable generation and verification commands |
| `tests/e2e/` | Synthetic cross-client journeys |
| `docs/` | Documentation. Start with the [documentation map](docs/README.md), which names the authoritative document for each area |

The [feature catalog](packages/feature-catalog/features.json) assigns all 48 must-haves and 17 final outcomes to domains and preserves 190 feature entries. The [detailed inventory](packages/feature-catalog/requirements.json) retains 2,208 source headings and all release-priority/acceptance rows. The source lock detects changes to all 21 original documents. Existing duplicate Chapter 19/20 drafts remain preserved under the [reconciliation record](docs/CONTRACT_RECONCILIATION.md).

The [product feature delivery ledger](docs/PRODUCT_FEATURES.md) lists all 190 groups with backend/web/Android status, screen coverage, stack, safety boundaries and the non-Agent build order; the shorter [feature and screen build list](docs/FEATURES_AND_SCREENS.md) shows each product area, page and screen. Current batches add a private calendar agenda, reviewed name settings, owner-only Solo Spaces, task checklists and Space chat/direct messages. Real web integration and native build/JVM checks pass; native device qualification remains open. **Use only http://127.0.0.1:3000 for the web app**, including `/app/spaces`, `/app/calendar` and `/app/messages`. The VS Code task **Community Platform: preview web** watches current source at that address; do not switch to another web port.

## Build Order

First working slice: account access, including registration, simulated email verification, login, profile/timezone and revocable sessions. This is a local synthetic-data implementation, not live email delivery or a production identity rollout. Open provider, legal, recovery and security-policy decisions are not silently approved.

The backend, web and Android clients contain account implementation code. The real local browser recovery and Android account journeys now pass; see [live workflow evidence](docs/BUILD_STATUS.md#live-manual-workflow-checkpoint) and the [account development boundary](docs/runbooks/ACCOUNT_ACCESS.md). Broader release qualification remains incomplete; this is not a finished MVP.

Verified accounts can create, list and read their own private family Spaces. Owners can now invite an existing verified account by its account ID, inspect sent invitations and revoke pending invitations. The intended recipient can review, accept or decline in their own inbox. Admission, invitation consumption and audit/outbox records commit together; expiry, current authority and one-use admission are enforced server-side. The web screen is at `/app/spaces` and is linked from account settings. This local slice sends no external invitations and performs no email/phone account lookup.

Android exposes the same create/invite/join flow from **Family Spaces** on the account screen, with account-ID copy, exact invitation review and a link into the selected family's tasks. Current native JVM totals are in [EVALUATIONS.md](docs/EVALUATIONS.md#test-suites); membership, live workflow and offline screen evidence is recorded in [BUILD_STATUS.md](docs/BUILD_STATUS.md#family-membership-checkpoint).

Ordinary family tasks are now implemented in the backend and `/app/tasks`, linked from each Space. Current members can create tasks with notes, a date-only deadline and an eligible assignee. Creators/owners can edit; the assignee can update progress, complete or reopen. Reads remain tied to the admissions present when a task was created, so joining later or editing an old title does not grant historical access. Writes use version preconditions and stable retry identities with atomic audit/outbox records. Native task implementation and evidence are recorded separately in the build status.

Family members can now view the private roster, an owner can remove an ordinary member, and ordinary members can leave. Each change requires an exact review and supports the same-request retry after a lost response. Current access and pending reminder delivery are revoked without deleting shared content. The owner cannot leave. A former member can rejoin only through a new invitation that they accept, and their earlier tasks and reminders stay unavailable. Backend, web and native verification is recorded in the [membership runbook](docs/runbooks/FAMILY_MEMBERSHIP.md).

One-time **Remind me** schedules and a private in-app inbox are now implemented across the backend, web and Android. A separate worker materializes due entries without an open app or model. Users review exact time/zone/recipient, cancel pending schedules, mark an inbox item read and explicitly acknowledge it; acknowledgment does not complete the task. This first slice targets only the requesting account and sends no background alert or external message. See the [reminder runbook](docs/runbooks/SELF_REMINDERS.md).

Task managers can now propose an exact in-app reminder to the current assignee on web and Android. The recipient reviews and explicitly accepts or declines; the sender can withdraw a pending request. Only acceptance creates the recipient's personal schedule. The live two-account web journey and native recipient acceptance/reload/cancellation journey pass, alongside backend consent/race tests and offline controls. Details and remaining qualification are in the [request checkpoint](docs/BUILD_STATUS.md#recipient-approved-reminder-requests).

Each Space now has one shared **Space chat**, and two current members of the same Space can open a **direct conversation** (`/app/messages` on web, **Messages** on Android). Sends keep one copy per retry, history starts at the member's current admission, unread counts and read positions are per admission, and authors can delete a message for everyone (a tombstone; copies already seen are not recalled). Message bodies are encrypted at rest on the server; this is **not end-to-end encryption**, and every chat screen says so. Clients poll while a chat is open; there is no push or WebSocket yet. Evidence: [messaging checkpoint](docs/BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint).

The **public community** is live locally: anyone can create a public page with a handle, write private drafts and publish them explicitly; people follow pages, like, save, comment and reply; Home shows posts from followed pages plus Latest and Saved; Discover searches pages by name, handle, description and topic, and published posts by their words. Report and block work on pages, posts and comments. Public pages and posts (`/pages/<handle>`, `/posts/<id>`) can be read signed out. Private Spaces, chats, tasks and reminders never feed these lists. Evidence: [public community checkpoint](docs/BUILD_STATUS.md#public-community-checkpoint).

Every Space also has **events** (`/app/events?space_id=` on web, **Events** on the Space screen on Android): organizers enter a local date, time and zone, members answer Going, Maybe or Not going, and a changed time asks people to confirm again. A response is not attendance; capacity, invitations outside the Space and public events are not built. Evidence: [events checkpoint](docs/BUILD_STATUS.md#space-events-and-rsvp-checkpoint).

Each person can also keep their **medicines** (`/app/care` on web, **Medicines** on Android): they copy an instruction exactly as given, confirm it and name its source, see a day plan, and note each dose as taken or skipped. Only that person can see these records. The app gives no medical advice and sends nothing at dose times. Evidence: [care checkpoint](docs/BUILD_STATUS.md#care-checkpoint).

A task due date does not automatically schedule a reminder. Built since this list was first written: group and couple Spaces, the admin role, the controlled Agent without an AI model, and text documents with search inside your Spaces (T12–T15, T22, T33–T35). In progress in other sessions: live updates, phone and browser alerts, account deletion with the data download, moderation of public content, and Telugu and Hindi (T65–T70); see [TASKS](docs/TASKS.md). Unregistered-recipient invitations, archiving and deleting Spaces and pages (pages are planned as T85), end-to-end encryption, and event capacity and public events remain in the inventory. The live browser journeys, the native account and family journeys and the web and native reminder-request journeys run under explicit local-only access approval; current results are in [EVALUATIONS](docs/EVALUATIONS.md#test-suites). Broader release gates remain open; finite tests are not full M1/MVP qualification.

See the [local runbook](docs/runbooks/README.md) for setup, verification and current evidence limits. This is a synthetic local build, not an approved production rollout.

## Checks

`npm run verify` runs every offline check one after another (the records check, structure, design tokens, the web type check and tests, the backend and Android JVM tests) and writes each log and one summary to `.local\verify\`; `npm run verify -- -Suite live` runs the live journeys against the local preview, and `npm run verify -- -Suite device` runs the Android device tests on an emulator it starts and stops, with the network off. See [Verification Commands](docs/runbooks/README.md#verification-commands).

## Structure Checks

```powershell
npm run test:structure
npm run structure
npm run check:structure
```

Structure generation is additive. It will not overwrite implementation files or modify the original chapters.