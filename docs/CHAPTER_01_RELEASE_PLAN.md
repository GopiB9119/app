# Chapter 1: Release Scope, Journeys and Acceptance

Status: DRAFT FOR PRODUCT REVIEW. This is a planning deliverable, not an approved release commitment or an implementation report.

The original chapters remain unchanged. The user authorized starting Chapter 1 planning, not deployment, paid provider use or automatic resolution of conflicting requirements.

## 1. Purpose and Source Authority

Turn the product idea into a release contract that product, design, client, backend, Agent, safety and QA owners can use together.

- Proposed release baseline: [Chapter 1 must-haves](../Chapter1.md#L3977), [MVP modules and Agent boundaries](../Chapter1.md#L4181), [acceptance criteria](../Chapter1.md#L4329) and [final MVP definition](../Chapter1.md#L5000).
- This proposal preserves the broad Android-and-web, public-and-private MVP. The first family-reminder journey is a smaller delivery milestone, not the complete MVP.
- The [master blueprint](../idea.md) and other chapters remain requirements and design references. Differences in phase, terminology or behavior require an explicit decision; this plan does not silently rewrite them.
- Requirement IDs below are new planning identifiers. They are not claims of implemented features, passing tests or assigned engineers.
- All implementation and acceptance evidence is currently pending for this plan. A documented test scenario is not an executed test.

## 2. Must-Have Scope Ledger

Every source requirement in Chapter 1 section 32.1 is retained verbatim. All 48 rows belong to the proposed full MVP, even when they are outside the first milestone.

| ID | Source must-have | Product area |
| --- | --- | --- |
| C1-F01 | Registration | Identity |
| C1-F02 | Login | Identity |
| C1-F03 | Verification | Identity |
| C1-F04 | Session management | Identity |
| C1-F05 | Profile | Identity |
| C1-F06 | Public pages | Public community |
| C1-F07 | Page roles | Public community |
| C1-F08 | Text and image posts | Public community |
| C1-F09 | Comments | Public community |
| C1-F10 | Reactions | Public community |
| C1-F11 | Follows | Public community |
| C1-F12 | Search | Public community |
| C1-F13 | Basic discovery | Public community |
| C1-F14 | Reports | Public community |
| C1-F15 | Family groups | Private spaces |
| C1-F16 | Couple spaces | Private spaces |
| C1-F17 | Solo spaces | Private spaces |
| C1-F18 | Custom groups | Private spaces |
| C1-F19 | Invitations | Private spaces |
| C1-F20 | Membership roles | Private spaces |
| C1-F21 | Group privacy | Private spaces |
| C1-F22 | Direct messages | Messaging |
| C1-F23 | Group chat | Messaging |
| C1-F24 | WebSocket realtime | Messaging |
| C1-F25 | Message persistence | Messaging |
| C1-F26 | Delivery and read status | Messaging |
| C1-F27 | Unread counts | Messaging |
| C1-F28 | Reconnect support | Messaging |
| C1-F29 | Tasks | Planning |
| C1-F30 | Assignment | Planning |
| C1-F31 | Due dates | Planning |
| C1-F32 | Basic reminders | Planning |
| C1-F33 | Shared events | Planning |
| C1-F34 | Notification preferences | Planning |
| C1-F35 | Agent chat | Agent |
| C1-F36 | Scope-aware context | Agent |
| C1-F37 | Task drafting | Agent |
| C1-F38 | Reminder drafting | Agent |
| C1-F39 | Public search assistance | Agent |
| C1-F40 | Approval flow | Agent |
| C1-F41 | Tool audit log | Agent |
| C1-F42 | Basic memory controls | Agent |
| C1-F43 | Reporting | Safety |
| C1-F44 | Blocking | Safety |
| C1-F45 | Basic moderation | Safety |
| C1-F46 | Privacy settings | Safety |
| C1-F47 | Account deletion request | Safety |
| C1-F48 | Data access controls | Safety |

Reports and Reporting remain separate source entries, but one coherent reporting capability should satisfy both. Do not implement two unrelated report systems to match two rows.

## 3. Final MVP Outcome Ledger

Every outcome in Chapter 1 section 41 is retained verbatim. Outcome coverage supplements the feature list: account export, for example, is explicitly required here despite its earlier should-have label.

| ID | Source final-MVP outcome |
| --- | --- |
| C1-O01 | Create and secure an account. |
| C1-O02 | Discover public pages and posts. |
| C1-O03 | Create and manage a public page. |
| C1-O04 | Publish public content. |
| C1-O05 | Create a private family, couple, solo, or custom space. |
| C1-O06 | Invite and manage members. |
| C1-O07 | Send reliable private messages. |
| C1-O08 | Create tasks, events, and reminders. |
| C1-O09 | Receive notifications. |
| C1-O10 | Use an agent within a restricted scope. |
| C1-O11 | Approve or reject agent actions. |
| C1-O12 | View and delete agent memories. |
| C1-O13 | Report harmful content. |
| C1-O14 | Block other users. |
| C1-O15 | Control privacy and notification settings. |
| C1-O16 | Export or delete account data. |
| C1-O17 | Continue using core features when the agent or external provider is unavailable. |

## 4. First Delivery Milestone: Family Reminder

M1 is proposed as the first end-to-end demonstration, not as a reduction of the full MVP. It uses synthetic accounts and an ordinary meeting or household reminder, not health records or medication instructions.

1. An organizer creates and verifies an account, signs in and sets a timezone.
2. The organizer creates a private family Space and invites a second person.
3. The invitee verifies the intended identity and accepts. Entering a phone number alone does not create an active membership or grant consent.
4. An authorized member creates a shared task with a due date and a one-time reminder for an authorized, consenting recipient.
5. The recipient, local time, timezone, channel and resulting execution time are shown before saving.
6. The backend commits the schedule durably. A separate scheduler creates the due occurrence without keeping an Agent session alive.
7. The recipient receives a durable in-app notification and can acknowledge it. This first in-app demonstration does not promise a background push alert or wake a closed app.
8. The organizer and recipient see the saved state after reload or reconnect. Notification delivery and user acknowledgment remain different facts.
9. Cancellation, member removal, retry and worker restart are demonstrated without unauthorized sends or duplicate logical occurrences.

Android and the core web workflow remain in scope. A third unrelated account is used to demonstrate denied access. Manual forms establish the workflow first; a later controlled-Agent milestone must invoke the same authorized services.

Public pages, other Space types, messaging, events, Agent assistance, reporting, export and deletion remain mandatory full-MVP work. M1 completion alone cannot be called an MVP release or production readiness.

## 5. Decisions Requiring Explicit Confirmation

| ID | Conflict or open choice | Recommendation | Status |
| --- | --- | --- | --- |
| C1-D01 | The blueprint phases couple, solo and custom Spaces later; Chapter 1 sections 32, 34 and 41 include them in MVP. | Preserve all four private types in the full MVP and deliver them incrementally. | PROPOSED |
| C1-D02 | Data export is should-have in section 32.2 but required by the final MVP definition. | Treat a secure user export as required before declaring the full MVP complete. | PROPOSED |
| C1-D03 | Push and email are should-have; notification receipt is a final-MVP outcome. | Use durable in-app notifications for the bounded first demo; decide required background channels before freezing public-release acceptance. | OPEN |
| C1-D04 | Section 39 puts public community before planning; the proposed first demonstration pulls a narrow family-reminder workflow forward. | Approve M1 as a learning milestone while retaining every public and private MVP obligation. | PROPOSED |
| C1-D05 | Auth methods, invitation delivery and recipient verification are not frozen. | Decide these in Chapter 18 before implementation; a local invite link is not evidence of delivered SMS, email or WhatsApp. | OPEN |
| C1-D06 | Encryption and Agent access, health permissions, API envelopes and state names differ between chapters. | Resolve each owning contract before dependent code. Keep prohibited clinical decisions and unauthorized private-data access disallowed. | OPEN |

The authority for the MVP Agent boundary is [section 33.3](../Chapter1.md#L4287): authorized answers and summaries, drafts, confirmed personal reminders and group tasks, explained actions and user-approved preferences. No MVP external messages, calls, health-record access, permission changes, member removal or financial actions. Approval does not make a prohibited action permitted.

The source's [MVP exclusions](../Chapter1.md#L4157) and [launch readiness requirements](../Chapter1.md#L4908) remain binding planning inputs; readiness is not inferred from a successful happy-path demo.

## 6. Other Priorities and Exclusions

These labels preserve [sections 32.2-32.4](../Chapter1.md#L4091), not a new promise that every should-have is postponed. A lower-priority label cannot silently remove a required final-MVP outcome or a safety prerequisite. Source conflicts stay open until the product owner confirms the release matrix.

| ID | Source should-have | Treatment in this draft |
| --- | --- | --- |
| C1-S01 | Polls | Candidate expansion; not required for M1. |
| C1-S02 | Saved posts | Candidate public-community addition. |
| C1-S03 | Hashtags | Candidate discovery addition. |
| C1-S04 | Event RSVP | Confirm the basic shared-event contract before scheduling this addition. |
| C1-S05 | Calendar view | Proposed planning milestone; not a prerequisite for a one-time reminder demo. |
| C1-S06 | Recurring tasks | Separate from basic tasks and one-time reminders. |
| C1-S07 | Reminder escalation | Requires explicit recipients, consent, stop conditions and delivery policy. |
| C1-S08 | Page analytics | Candidate addition with privacy-safe measurement. |
| C1-S09 | Agent memory editor | Basic viewing/deletion remains MVP even if richer editing is later. |
| C1-S10 | File attachments | Generic attachments are separate from mandatory image posts and their upload security. |
| C1-S11 | Email notifications | Channel decision C1-D03; no delivery claim from a placeholder. |
| C1-S12 | Push notifications | Channel decision C1-D03; in-app history alone cannot wake a closed app. |
| C1-S13 | Advanced search filters | Basic search remains MVP. |
| C1-S14 | Group rules | Basic privacy and membership policy remain MVP. |
| C1-S15 | Member approval workflows | Invitation acceptance remains MVP; richer approval policies need definition. |
| C1-S16 | Content scheduling | Separate from manual authorized publication and ordinary reminders. |
| C1-S17 | Data export | Required by C1-O16 in the proposed final-MVP baseline; confirm C1-D02. |

| ID | Source could-have |
| --- | --- |
| C1-C01 | Video |
| C1-C02 | Audio rooms |
| C1-C03 | Voice calls |
| C1-C04 | External calendar integration |
| C1-C05 | Approved WhatsApp integration |
| C1-C06 | SMS integration |
| C1-C07 | Shared expenses |
| C1-C08 | OCR |
| C1-C09 | PDF summarization |
| C1-C10 | Agent-generated event budgets |
| C1-C11 | Recommendation engine |
| C1-C12 | Advanced personalization |
| C1-C13 | Translation |
| C1-C14 | Multi-language agent responses |

These remain in the product vision without becoming prerequisites for the first release. Provider availability, licensing, legal/privacy review and operation costs must be checked before a feature is committed. Phone invitations do not imply permission to automate WhatsApp groups or calls.

| ID | Source won't-have in MVP |
| --- | --- |
| C1-X01 | Autonomous financial transactions |
| C1-X02 | Medical diagnosis |
| C1-X03 | Medication dosage decisions |
| C1-X04 | Unrestricted external communication |
| C1-X05 | Unofficial WhatsApp automation |
| C1-X06 | Full video-conferencing platform |
| C1-X07 | Public access to private agent memory |
| C1-X08 | Complex marketplace payments |
| C1-X09 | Fully decentralized identity |
| C1-X10 | Autonomous member removal |
| C1-X11 | Autonomous publishing of sensitive content |

Exclusion from MVP is not automatic approval for a later release. In particular, unauthorized disclosure and unrestricted Agent powers are not future goals. Authorized human membership management is still required; the exclusion concerns autonomous Agent removal.

## 7. Complete MVP User Journeys

Journey owners are responsibility roles, not claims that people or subagents have been staffed. Both Android and core web workflows use the same backend rules. Detailed API paths, schema enums and security protocols are deferred to their owning chapters.

| Journey | User-visible success and important failure path | Features | Outcomes | Accountable role |
| --- | --- | --- | --- | --- |
| C1-J01 Account and onboarding | Register, verify, sign in, edit a profile, inspect/revoke sessions and recover access. Declining optional contacts or location does not block onboarding; an expired session cannot retain protected access. | C1-F01, C1-F02, C1-F03, C1-F04, C1-F05 | C1-O01 | Identity lead |
| C1-J02 Public participation | Discover and follow a public page; an authorized creator manages roles and publishes text/image posts; another user comments, reacts and reports. A private draft or private Space resource cannot appear through discovery, media links or caches. | C1-F06, C1-F07, C1-F08, C1-F09, C1-F10, C1-F11, C1-F12, C1-F13, C1-F14 | C1-O02, C1-O03, C1-O04 | Community lead |
| C1-J03 Private membership | Create each supported Space type; issue, accept or reject an invitation; manage permitted roles and membership. Expired/revoked/reused invitations fail; concurrent joins cannot admit a third active human to a couple Space. | C1-F15, C1-F16, C1-F17, C1-F18, C1-F19, C1-F20, C1-F21 | C1-O05, C1-O06 | Spaces lead |
| C1-J04 Reliable conversations | Send a direct or group message, see honest send/delivery/read states and unread counts, then reconnect and recover missed content. Retries preserve one logical message; membership revocation prevents new protected reads and events. | C1-F22, C1-F23, C1-F24, C1-F25, C1-F26, C1-F27, C1-F28 | C1-O07 | Messaging lead |
| C1-J05 Shared planning | Create, assign and complete a task; create a shared event and a reminder; review timezone, recipients and preferences; receive and acknowledge a notification. Cancelled work and disallowed recipients are excluded when execution occurs. | C1-F29, C1-F30, C1-F31, C1-F32, C1-F33, C1-F34 | C1-O08, C1-O09, C1-O15 | Planning lead |
| C1-J06 Controlled Agent | Ask within the chosen scope, obtain public search assistance or a task/reminder draft, inspect the exact proposed action, approve/reject permitted actions and see verified results. Prompt injection, stale approval, another Space ID or provider failure cannot bypass policy or produce a false success. | C1-F35, C1-F36, C1-F37, C1-F38, C1-F39, C1-F40, C1-F41 | C1-O10, C1-O11, C1-O17 | Agent lead |
| C1-J07 Memory control | Explicitly approve a saved preference, view its scope/source, delete it and disable future memory use. A later Agent response must not retrieve deleted or unauthorized memory; required audit retention is separately disclosed. | C1-F42 | C1-O12 | Agent memory lead |
| C1-J08 Safety and data rights | Report, block, change privacy settings, request/export authorized account data and delete an account. A scoped moderator reviews a report without unrestricted private access; deletion revokes sessions and follows a disclosed, tracked purge process. | C1-F43, C1-F44, C1-F45, C1-F46, C1-F47, C1-F48 | C1-O13, C1-O14, C1-O15, C1-O16 | Trust/privacy lead |
| C1-J09 Degraded operation | Continue manual messaging, planning and already-saved reminders when the Agent provider fails. Display pending/retryable delivery truthfully; preserve durable work through worker restart and do not claim success during a database outage. | C1-F25, C1-F28, C1-F29, C1-F32, C1-F41, C1-F48 | C1-O17 | Platform lead |

The exact block effects, history-on-join policy, owner transfer rules, invitation identity proof and calendar conflict policy remain owning-chapter decisions. The journeys require explicit behavior and tests, not invented defaults hidden inside a client.

## 8. M1 Experience and Screen Contract

Example actors: a synthetic organizer, a synthetic invited member and an unrelated denied-access account. Use a household meeting task, not real medication or other sensitive family data.

| Surface | Required interaction | Important states and recovery |
| --- | --- | --- |
| Account entry and verification | Register/sign in, verify the selected identity method, set timezone and continue to the intended destination. | Validation, expired verification, resend throttling, session expiry, denied optional OS permission and safe retry. |
| Space list and creation | Create a private family Space and see its canonical saved identity. | Empty list, loading, rejected save, repeated submit, offline unavailability and preserved form draft. |
| Space detail and members | View authorized members/roles, select the shared task area, invite a member. | Role-aware controls, removed membership, stale screen and forbidden direct link. |
| Invitation and acceptance | Review the intended Space and identity, then accept or reject. | Pending, expired, revoked, already used, wrong verified identity and generic invalid-link errors without enumeration. |
| Task form and detail | Enter title, optional notes, due date/time and eligible assignee; create or complete the task. | Required-field errors, unsaved changes, stale assignee, concurrent edit, save retry and canonical reload. |
| Reminder editor and review | Show recipient, date, local time, IANA timezone, channel and one-time execution preview; save or cancel. | Missing consent, ambiguous/invalid time, preference denial, duplicate tap, pending save and cancellation race. |
| Notification inbox and detail | Show a durable due reminder and its permitted task context; allow an explicit acknowledgment. | Empty, unread, acknowledged, stale/deleted target, offline reconnect and unavailable delivery channel. |
| Profile and preferences | Change timezone and notification preferences; inspect the consequences for existing schedules. | Confirmation for affected settings, failed update, rollback to confirmed state and revoked session. |

Every primary surface needs loading, success, applicable empty state, recoverable error with safe retry, offline behavior, authorization-denied behavior and session-expiry handling. Preserve non-sensitive form drafts where policy permits; never silently queue a sensitive approval or destructive action offline.

Design owner deliverables: mobile and desktop flow maps, reusable component/state inventory, responsive layouts, readable text scaling, screen-reader labels/focus order, keyboard navigation, back/deep-link behavior and unsaved-change handling. A clickable prototype/Figma file must be produced and reviewed separately; none is claimed to exist yet. Device/browser notification permission denial must have an honest fallback if push is later selected.

## 9. Source Acceptance and Required Evidence

All 39 acceptance criteria from [Chapter 1 section 34](../Chapter1.md#L4329) are retained verbatim. The evidence column describes planned checks, not test functions that already exist. Every row is NOT RUN.

| ID | Source acceptance criterion | Required demonstration or test evidence |
| --- | --- | --- |
| C1-A01 | User registration and login work on Android and web. | Real client-to-backend flow on both clients, then reload into the same authenticated account. |
| C1-A02 | Verification state is enforced. | An unverified actor cannot perform verification-gated actions; valid verification changes only the intended identity. |
| C1-A03 | Session revocation works. | Revoke an active session; subsequent protected HTTP and realtime access is denied. |
| C1-A04 | Unauthorized requests return appropriate errors. | Foreign resource IDs and missing/expired credentials fail without private data or internal error details. |
| C1-A05 | Authenticated users can create public pages. | Eligible actor creates a page; persistence, ownership and retrieval are verified. |
| C1-A06 | Page owners can assign roles. | Allowed owner change succeeds; unauthorized/self-escalating changes fail and changes are audited. |
| C1-A07 | Authorized users can publish posts. | Allowed text/image publication succeeds; a draft, wrong page or revoked role cannot bypass publication policy. |
| C1-A08 | Users can comment and react. | Allowed comment and reaction persist; repeat requests and blocked/removed targets follow defined rules. |
| C1-A09 | Public content appears in public discovery. | Eligible published content becomes discoverable within an agreed indexing target. |
| C1-A10 | Private content never appears publicly. | Public search, feed, suggestions, media access and warmed caches reject seeded private content and later privacy changes. |
| C1-A11 | Users can create family, couple, solo, and custom spaces. | Create and reload all four types with their distinct permitted membership rules. |
| C1-A12 | Invitations can be sent and accepted. | Configured invitation transport reaches the intended test recipient; verified acceptance succeeds; expired/revoked/replayed links fail. |
| C1-A13 | Couple spaces cannot exceed two active human members. | Race two valid acceptances for the last human slot; at most one succeeds and the durable count remains two. |
| C1-A14 | Group membership changes are audited. | Each accepted membership/role change has actor, target, scope, action and timestamp without unnecessary private content. |
| C1-A15 | Removed members cannot access new private content. | After removal, test REST reads, realtime subscription/replay, file access and Agent retrieval where available. |
| C1-A16 | Messages persist before realtime delivery. | A subscriber never receives a committed-message event for a rolled-back write; durable messages survive gateway restart. |
| C1-A17 | Client retries do not duplicate messages. | Resend one logical client message after an uncertain acknowledgment; one durable message and canonical identity remain. |
| C1-A18 | Users can reconnect and retrieve missed messages. | Disconnect between sends, reconnect with a cursor and reconcile ordered history without gaps or duplicates. |
| C1-A19 | Read and delivery states are recorded. | Separate send, device delivery and user read evidence survives reload; presence is not counted as a receipt. |
| C1-A20 | Conversation access is membership-controlled. | Space membership alone cannot grant access to an unrelated restricted conversation. |
| C1-A21 | Users can create and complete tasks. | Create and complete through each client; canonical saved state survives API/client restart. |
| C1-A22 | Tasks can be assigned to authorized members. | Eligible assignment succeeds; cross-Space, removed or otherwise ineligible assignees fail, including a concurrent removal. |
| C1-A23 | Reminders are durable. | Save, stop the app and restart workers before due time; exactly one logical occurrence and pending work survive. |
| C1-A24 | Canceled reminders do not execute. | Cancellation committed before the execution authorization check prevents dispatch; document and reconcile already in-flight external actions separately. |
| C1-A25 | Notification failures are recorded. | Controlled transient/permanent failures yield honest states, classified retries and an inspectable history. |
| C1-A26 | Time zones are handled correctly. | Check stored timezone/local intent and UTC execution, different recipient zones and DST ambiguity/gaps with the approved policy. |
| C1-A27 | Agent context is limited to the current scope. | Seed inaccessible data in another Space and private conversation; retrieval and generated output cannot expose it. |
| C1-A28 | Agent tool permissions are checked server-side. | Tampered scope, untrusted tool arguments and permissions revoked after draft creation fail at execution. |
| C1-A29 | High-risk actions require approval. | Allowed high-risk actions without valid exact-payload approval fail; prohibited actions still fail even with approval. |
| C1-A30 | Failed actions are not reported as successful. | Tool error, timeout and unknown external outcome appear as failure/uncertainty, not a completion claim. |
| C1-A31 | Agent runs and tool calls are auditable. | Inspect scoped run/tool/approval/result records; no secret tokens or hidden reasoning are stored in ordinary logs. |
| C1-A32 | Users can delete saved memories. | Delete a saved preference and verify subsequent retrieval/context and relevant caches exclude it. |
| C1-A33 | Agent access can be disabled. | Disable it during a pending workflow; subsequent protected retrieval/tool execution is prevented by policy. |
| C1-A34 | Users can report content. | Submit a report once despite retries and inspect its user-visible status without reporter exposure to the subject. |
| C1-A35 | Users can block other users. | Enforce the approved block matrix on the server and clients, including cached and realtime paths. |
| C1-A36 | Moderators can review reports. | Assigned reviewer can handle a case; unrelated private evidence and unrestricted exports are denied and access is audited. |
| C1-A37 | Sensitive data is excluded from public discovery. | Seed health, private files and Agent memory; public indexing, recommendations and suggestions do not use or expose them. |
| C1-A38 | Health boundaries are enforced in prompts, tools, and backend policy. | Evaluation and deterministic service tests reject diagnosis/dosage decisions and MVP health-record access, including injected instructions. |
| C1-A39 | Account deletion revokes active sessions. | Deletion request revokes sessions, invalidates further protected access and exposes truthful deletion progress. |

This source acceptance list is a minimum, not full test coverage. Journey-specific checks must also cover features such as profiles, follows, unread counts, event creation, preferences and export that the short source acceptance list does not individually spell out.

## 10. M1 Exit Checks and Demo Script

All checks below are proposed acceptance scenarios, currently NOT RUN. Use controlled clocks and synthetic test data; never change the laptop's clock or send test messages to personal contacts.

| Check | Demonstration and pass condition |
| --- | --- |
| C1-M01 | Register/verify two test users, create a family Space, invite and accept through the selected identity/transport contract. Repeat invite acceptance without a second membership. |
| C1-M02 | A third unrelated account cannot view the Space, task, reminder, notification or recipient identities through API calls or deep links. |
| C1-M03 | Create a shared task with an eligible assignee; reload on the other client, complete it and observe the confirmed state. A task due date does not silently create unapproved external reminders. |
| C1-M04 | Review one-time reminder recipient, timezone/local time, channel and purpose; save twice with the same logical request and obtain one schedule. Invalid or ambiguous time needs explicit resolution. |
| C1-M05 | Stop the Agent runtime and restart the scheduler/worker after saving. Advance the test clock, generate one durable occurrence and retain work despite a repeated queue event. |
| C1-M06 | Deliver a durable in-app notification to the open authorized client. Reconnect/reload and find the same notification; do not claim background push delivery. |
| C1-M07 | Acknowledge explicitly, retry and reload. The actor/time is recorded once; delivery and acknowledgment remain separately visible. |
| C1-M08 | Commit cancellation or revoke membership/recipient permission before execution; the due job is skipped/cancelled rather than delivered. A race test proves the chosen execution boundary, not only a UI button check. |
| C1-M09 | Inject worker/database/notification failures; show bounded retry, durable pending/failure history and successful recovery without duplicate logical effects or private log payloads. |
| C1-M10 | Exercise Android and core web loading/empty/error/offline/access-denied states, unsaved changes, session expiry, text scaling and accessible controls. Retain screenshots and executable test results for the actual artifacts. |

Live demonstration order: account -> family -> invitation -> accepted member -> task -> reminder review -> saved schedule -> runtime restart -> due in-app notification -> acknowledgment -> cancellation/denial/failure recovery. Show the stored evidence and client state together. A provider simulator must be labeled as simulated; a copied invitation link must be labeled as manual delivery.

## 11. Ownership and Developer Handoff

Team A owns product/design; Team B owns Android/web clients; Team C owns backend/data/platform; Team D owns the product Agent; Team E owns QA/security/privacy/operations. One person may fill multiple roles. These roles do not require a large hiring plan or one AI process per role.

The following are M1 handoff packages. Before coding, the owner splits a package into bounded, reviewable implementation tickets when it spans multiple changes. Dependency completion means accepted evidence, not merely another ticket marked started.

| Ticket | Accountable owner | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C1-T01 | Product lead, Team A | Product decisions | Confirm C1-D01 through C1-D04, release matrix and milestone labels; record accepted/rejected recommendations without altering source history. Current document is a draft input, not approval. |
| C1-T02 | Product designer, Team A | C1-T01 | Prototype the eight M1 surfaces and their section 8 states on mobile/web; review C1-M10 and correct confusing privacy/delivery labels. |
| C1-T03 | Identity lead, Team C | C1-T01; C1-D05 | Chapter 18 contract for identity proof, sessions, recovery, invitation recipient binding and delivery; threats and acceptance examples for C1-A01 through C1-A04 and C1-M01. |
| C1-T04 | Spaces lead, Team C | C1-T03 | Chapter 3 family create/invite/accept/role/removal contract and authorization tests; match C1-M01, C1-M02 and C1-M08. No implicit phone-based membership. |
| C1-T05 | Data/API architect, Team C | C1-T03, C1-T04 | Chapter 6/7 data ownership, constraints, transaction boundaries, migration design and versioned request/error/event contracts for M1; privacy/security review by Team E. Resolve relevant C1-D06 before implementation. |
| C1-T06 | Planning engineer, Team C | C1-T05 | Implement reviewed task/assignment and one-time schedule services with recipient permission checks, cancellation and duplicate-request handling; executable evidence for C1-M03, C1-M04 and C1-M08. |
| C1-T07 | Notification/platform engineer, Team C | C1-T06 | Implement occurrence generation, durable work, recovery, in-app delivery history and acknowledgment; evidence for C1-M05 through C1-M09 without an LLM timer. |
| C1-T08 | Android lead, Team B | C1-T02, C1-T05; C1-T06 and C1-T07 for integrated acceptance | Implement the M1 Compose/Room/API workflow using the approved contracts; state/navigation/accessibility tests and genuine Android evidence for C1-M01 through C1-M10. |
| C1-T09 | Web lead, Team B | C1-T02, C1-T05; C1-T06 and C1-T07 for integrated acceptance | Implement core Next.js workflow against the same services; session/CSRF boundaries, responsive states and genuine browser evidence for C1-M01 through C1-M10. |
| C1-T10 | QA lead, Team E | C1-T06, C1-T07, C1-T08, C1-T09 | Run cross-client M1 demo, permission/retry/race/restart tests and contract checks; publish failures, environment and exact test/artifact evidence. No manual-only substitution for critical invariants. |
| C1-T11 | Security/privacy lead, Team E | C1-T05; C1-T10 for final verification | Review identity, authorization, private-data handling, consent, logs and prototype limitations; approve only the permitted synthetic-data demo scope. Public release requires section 13 separately. |

No Agent code is required for M1. Team D participates in the service/tool boundary review, then owns C1-J06 and C1-J07 in the controlled-Agent milestone. Tools must call the same domain services, not a second implementation of permissions or scheduling.

Every implementation ticket must state source requirement IDs, one accountable owner, prerequisites, user outcome, explicit non-goals, API/data/UI changes, privacy risks, failure cases, test commands and expected results. Deliver code, focused unit/integration/UI tests where relevant, contract updates, migration notes, applicable ADR, operational instructions, security considerations, demo steps and known limitations. Documentation-only tickets identify which code/test deliverables are not applicable rather than inventing them.

## 12. Proposed Delivery Sequence

This sequencing recommendation requires C1-D04 approval because it differs from [section 39's broad order](../Chapter1.md#L4804). Cross-cutting security, privacy, accessibility and observability begin in every milestone; they are not postponed until hardening.

| Milestone | User-visible result | Exit boundary |
| --- | --- | --- |
| M0 Scope and contracts | Approved scope, identity/Space policies, M1 prototype and data/API design; reproducible local client/backend foundations. | Do not count a health endpoint or empty screen as product acceptance. |
| M1 Family reminder | The complete synthetic two-account journey in sections 4 and 10, on Android and core web. | All ten M1 checks with evidence; no full-MVP or production claim. |
| M2 Private communication | Family/couple/solo/custom creation, membership and reliable direct/group messaging. | C1-J03 and C1-J04, including concurrent couple admission and reconnect/revocation. Encryption/access contract decided first. |
| M3 Public community | Public pages, roles, text/image posts, comments, reactions, follows, search/discovery and reporting/moderation. | C1-J02 plus relevant C1-J08 safety gates before public exposure. |
| M4 Planning completion | Shared events and remaining task/reminder/preference cases; required notification channels and calendar experience after scope decisions. | Complete C1-J05 and agreed channel/timezone/failure acceptance, not only the M1 one-time case. |
| M5 Controlled Agent and memory | Scoped assistance, drafts, exact-action confirmation, verification, audit and user-controlled preferences. | C1-J06 and C1-J07 plus adversarial evaluations; no MVP health/external-call/financial powers. |
| M6 Release qualification | Complete safety/data rights, export/deletion, degraded operation and all full-MVP outcomes with integrated evidence. | C1-J01 through C1-J09, C1-O01 through C1-O17 and launch gates; resolve all release-blocking decisions. |

Do not interpret the order as a mandate to delay session security, block enforcement, reporting, deletion design or safety reviews until M6. Those must exist before their dependent workflows are exposed to real users. Calendar integrations, calls, health workflows and advanced document/AI features remain separately gated future work, not discarded ideas.

## 13. Quality and Launch Gates

Source: [non-functional requirements](../Chapter1.md#L4423), [API/data rules](../Chapter1.md#L4547), [analytics privacy](../Chapter1.md#L4786) and [launch checklist](../Chapter1.md#L4908).

| Gate | Required evidence before public release |
| --- | --- |
| Functional coverage | All 48 must-haves, all 17 final outcomes and agreed priority conflicts mapped to real passing acceptance evidence on applicable clients. |
| Contracts and durability | Versioned schemas, reproducible migrations, relational ownership/uniqueness, message plus outbox atomicity, bounded retries and crash/reconnect/cancel tests. PostgreSQL is durable truth; Redis is not the only record of accepted work. |
| Security | Server authorization on endpoints, subscriptions, tools, retrieval and queued execution; session revocation, safe upload handling, TLS, secure secrets, rate limits and applicable CSRF protections. Dependency/container scan findings are reviewed, not hidden. |
| Privacy and data rights | Explicit private/public boundaries, consent/recipient controls, scope-safe memory, tested export/deletion/retention, redacted analytics/logs and a selected E2E/Agent access model. Legal jurisdiction and age/guardian policy reviewed before dependent launch. |
| Agent safety | Versioned prompts/tools/policies, bounded runs/costs, exact approval revalidation, injection/isolation/recovery evaluations and no false completion claims. Manual core features remain usable without the Agent. |
| UX and accessibility | Reviewed primary screens and all applicable states, mobile/desktop responsiveness, keyboard/screen-reader access, readable scaling, localization/date handling and honest delivery/permission labels. |
| Reliability | Restore drills for database/objects/keys, durable scheduler/notification recovery, outage/replay tests, rollout/rollback runbooks, alert ownership and defined recovery objectives. |
| Performance | An agreed workload and measured API/feed/search/message/Agent/reminder performance. The source targets are initial targets, not guaranteed results. |
| Operations | Support and moderation processes, incident escalation, provider failure handling, monitoring, cost/usage budgets and accountable release approval. No unattended paid sends or production deployment are implied by this plan. |

Initial source targets: common read API p95 below 300 ms; common write API p95 below 500 ms excluding external providers; message acknowledgment below 500 ms under normal load; feed first meaningful response below 2 s; search below 1 s; Agent first token target below 3 s where the provider permits; core API availability target at least 99.5%. Load shape, availability window/measurement, reminder execution tolerance, provider-versus-platform latency, recovery point/time objectives and budgets still need explicit agreement before validation. No target has been benchmarked here.

## 14. Design Rules and Failure Consequences

| Mistake | Consequence | Required design rule |
| --- | --- | --- |
| Treat a phone number or family-admin label as authority. | Wrong-recipient access or disclosure of another person's private information. | Verify recipient identity, require membership acceptance and enforce separate resource/consent rules. |
| Trust a client or Agent supplied Space ID. | Cross-Space reads/writes and leaked private content. | Derive the actor from authentication and authorize the actual resource chain server-side. |
| Keep the LLM alive as the reminder timer. | Reminders stop during model failure, budget exhaustion or process restart. | Persist schedules and run an independent deterministic scheduler. |
| Acknowledge a message before durable commit. | A user sees a sent message that never actually exists. | Commit business record and outbox together before acknowledgment/fanout. |
| Retry external actions after an unknown outcome without reconciliation. | Duplicate messages/calls or other repeated side effects. | Use stable logical IDs, provider idempotency where supported and explicit uncertainty/reconciliation. |
| Treat notification delivery as acknowledgment or medication adherence. | False reassurance and incorrect escalation decisions. | Record accepted, sent, delivered, read and user acknowledgment separately; do not infer clinical facts. |
| Treat membership as access to everything in a Space. | Private conversations, files or care data become visible to unauthorized members. | Evaluate conversation/resource visibility and consent as well as current membership. |
| Store private message bodies in ordinary analytics or let them train public recommendations. | Sensitive information crosses its intended purpose and audience. | Use minimal metadata and enforce the public/private boundary before retrieval, ranking and logging. |

## 15. Next Chapter and Decision Handoff

The next design step is [Chapter 18: identity and invitation authority](../Chapter18.md), followed by [Chapter 3: Space permissions](../Chapter3.md), [Chapter 6: data invariants](../Chapter6.md) and [Chapter 7: API contracts](../Chapter7.md). Apply [security](../Chapter11.md), [Android](../Chapter8.md) and [web](../Chapter9.md) requirements alongside those decisions. Use [scheduling](../Chapter13.md) and [delivery](../Chapter20.md) to resolve M1 runtime behavior before implementation.

First product decision: confirm the proposed full MVP includes all four private Space types, public community, Android/core web and account export, while M1 is only an early family-reminder demonstration. Next identity decisions are auth method(s), initial verified contact channel(s), invitation delivery/binding and account recovery. Launch jurisdictions/ages, reminder authority/history rules and encryption must be settled before implementing dependent behavior.

This draft preserves the complete Chapter 1 scope while making the first journey testable. It does not fill missing chapter endings, select live providers, resolve all architecture conflicts, create a Figma design, or certify runnable code. Those deliverables need their own source-linked decisions and verification.