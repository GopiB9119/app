# Domain Contract

The permanent contract for the platform's core entities: what each one is, who owns it, how it changes, who may use it, and what is still undecided. It is level 2 of the [authority hierarchy](PRODUCT_CONSTITUTION.md#article-4-authority-hierarchy): only the Product Constitution overrides it, and no lower document, code or test overrides its confirmed statements. Its Built statements are evidence of the current code, not decisions ([Constitution Article 6](PRODUCT_CONSTITUTION.md#article-6-code-and-tests-are-evidence)). The area contracts listed in the [documentation map](README.md) hold further design detail.

Established 2026-10-01. Code facts were read from the repository at migration 0017 on that date; the T02–T04 fixes (migration 0018) are included.

## How to Read This Contract

- **CONFIRMED**: an approved requirement ([R1–R13](PRODUCT_CONSTITUTION.md#article-2-approved-requirements)) or an accepted decision.
- **Built**: what the code does today. As policy it counts as PROPOSED until the product owner confirms it.
- **Built, not connected**: code that exists but is not wired into the running product (the agent models and tools).
- **PROPOSED**: from the draft contracts, cited by decision ID with the status recorded in that contract. Not approved.
- **ASSUMED**: an inference that needs confirmation.
- **TBD**: unresolved. Every TBD names its open decision: D1–D6 and Q6–Q20 in [section 39 of the Product Understanding](PRODUCT_UNDERSTANDING.md#39-open-questions), a contract decision such as C3-D09, or an entity-level decision U-01 to U-18 in [Unresolved Decisions](#unresolved-decisions).
- **CONFLICTING**: sources or behaviours disagree; the named conflict is in [section 40 of the Product Understanding](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository).

Shared rules S1–S12 apply to every entity unless its entry says otherwise. "Events" rows list domain events (outbox event types), not calendar events.

## Shared Rules

| ID | Rule | Status |
| --- | --- | --- |
| S1 | The backend takes the acting account from the session on every request; clients never choose the actor. Only `active` accounts with an unexpired, unrevoked session are accepted. | Built; PROPOSED as policy (C11-D02 PROPOSED) |
| S2 | Every read and write checks the account, the current Space admission and access to the specific item. Hidden or unauthorized items return 404 NOT_FOUND; a forbidden action on a visible item returns 403. | Built |
| S3 | Creates and most edits carry an `Idempotency-Key`. The same key and body return the first result; the same key with a different body returns 409 IDEMPOTENCY_CONFLICT. Each APIs row names the headers a route requires; routes shown without headers take none. | Built |
| S4 | Edits of reviewed state carry `If-Match` with the reviewed version. A missing version returns 428 PRECONDITION_REQUIRED; a stale one returns 412 (PRECONDITION_FAILED, or a domain code such as CONTENT_CHANGED, EVENT_CHANGED or SPACE_CHANGED). | Built |
| S5 | A change, its audit row and its outbox row commit in one transaction and share an ID. Nothing reads the outbox yet. Each entity's Audit row names its exceptions. | Built |
| S6 | Routes are under `/v1`. Success returns `{data, request_id, pagination}`; errors return `{error: {code, message, details}, request_id}`. | Built; ADR-0001 and ADR-0002 PROPOSED |
| S7 | Lists are bounded pages with encrypted cursors that expire after 15 minutes (410 CURSOR_EXPIRED; 400 CURSOR_INVALID). | Built |
| S8 | Request bodies over 16 KB return 413 PAYLOAD_TOO_LARGE; invalid fields return 422 VALIDATION_ERROR; database failures return 503 SERVICE_UNAVAILABLE. | Built |
| S9 | No agent exists. **CONFIRMED** (R7, R9, R11): an agent works only within an explicit scope, is never automatically an administrator, is never the source of truth, and retrieval respects Space, membership, permission and privacy boundaries. **PROPOSED** (C11-D03, C12-D04, both PROPOSED): agents act through the same domain services with no more than the delegating person's current authority, and writes need a person's approval of the exact action. What agents may do is **TBD** (D4). **PROVISIONAL** ([DEC-012](DECISIONS.md#accepted-decisions), awaiting the owner's review): a first-release agent without an AI model acts only for the person using it in one Space, reads only what that person can see, and changes tasks, reminders and its own memories only after that person approves the exact action. | Mixed |
| S10 | No external side effects are approved except sign-in codes sent to the local test inbox ([DEC-005](DECISIONS.md#accepted-decisions)). | CONFIRMED constraint |
| S11 | No retention periods are decided (Q19; C6-D10 OPEN). Retention rows describe what the code keeps today; nothing is purged unless the row says so. | TBD |
| S12 | Privacy classes come from the Chapter 11 contract (C11-D05 PROPOSED) and are listed below. Every classification in this contract is PROPOSED. | PROPOSED |

### Privacy Classes

| Class | Examples in the contract | Required handling (proposed) |
| --- | --- | --- |
| C11-C01 Public | Public page, public post | Only intentionally published, currently eligible content; drafts, hidden fields and removed posts are excluded |
| C11-C02 Internal | Product configuration | Role- and service-specific access; minimal client exposure |
| C11-C03 Private | Private messages, member details | Current owner, membership, conversation, history and audience checks |
| C11-C04 Sensitive | Medical reminders, personal documents | Purpose-specific access and consent, minimum fields, reviewed encryption and provider use, strong audit and retention |
| C11-C05 Highly sensitive | Encryption keys, credentials | Dedicated key and secret custody; never exposed to models or ordinary logs; tested rotation and revocation |

## Entity Index

| # | Entity | Code | Built |
| --- | --- | --- | --- |
| 1 | [User](#1-user) | `users` | Yes |
| 2 | [Identity](#2-identity) | `identity_challenges`, `identity_mail_jobs` | Email only |
| 3 | [Profile](#3-profile) | columns on `users` | Yes |
| 4 | [Session](#4-session) | `account_sessions` | Yes |
| 5 | [Device](#5-device) | — | No |
| 6 | [Space](#6-space) | `spaces` | Family, couple, solo and group |
| 7 | [Membership](#7-membership) | `space_memberships`, `space_ownership_transfers` | Yes |
| 8 | [Role](#8-role) | `space_memberships.role` | Owner and member |
| 9 | [Permission](#9-permission) | rules in service code | Fixed rules |
| 10 | [Invitation](#10-invitation) | `space_invitations` | Yes |
| 11 | [Relationship](#11-relationship) | — | No |
| 12 | [Block](#12-block) | `account_blocks` | Public side only |
| 13 | [Follow](#13-follow) | `public_page_follows` | Yes |
| 14 | [Report](#14-report) | `content_reports` | Stored, not reviewed |
| 15 | [Page](#15-page) (added) | `public_pages` | Yes |
| 16 | [Post](#16-post) | `public_posts` | Yes |
| 17 | [Comment](#17-comment) | `public_post_comments` | Yes |
| 18 | [Reaction](#18-reaction) | `public_post_reactions` | Like only |
| 19 | [Conversation](#19-conversation) | `conversations`, `conversation_read_states` | Yes |
| 20 | [Message](#20-message) | `conversation_messages` | Yes |
| 21 | [Task](#21-task) | `tasks` and four related tables | Yes |
| 22 | [Schedule](#22-schedule) | inside each reminder; `reminder_series` for repeating ones | One-time and repeating (DEC-010) |
| 23 | [Reminder](#23-reminder) | `reminders`, `reminder_requests`, `reminder_series` and their event and command tables | Yes |
| 24 | [Event](#24-event) | `space_events`, `space_event_responses` | Yes (limited) |
| 25 | [Notification](#25-notification) | `in_app_notifications`, `notification_preferences` | In-app only |
| 26 | [Document](#26-document) | — | No |
| 27 | [Memory](#27-memory) | model only, no table | No |
| 28 | [Agent](#28-agent) | — | No |
| 29 | [AgentScope](#29-agentscope) | — | No |
| 30 | [AgentPermission](#30-agentpermission) | — | No |
| 31 | [AgentTool](#31-agenttool) | definitions only | No |
| 32 | [AgentRun](#32-agentrun) | models only, no tables | No |
| 33 | [AgentApproval](#33-agentapproval) | model only, no table | No |
| 34 | [AuditLog](#34-auditlog) | seven audit tables and `domain_outbox` | Partly |

Page was added to the requested list because posts, follows, reports and blocks depend on it.

## Entity Contracts

### 1. User

| Field | Contract |
| --- | --- |
| Entity | A person's account. Table `users`. |
| Purpose | **CONFIRMED** A person who uses the platform and can belong to many Spaces (R1). Built: one account per verified email address. |
| Owner | Module `identity`. The data belongs to the account holder. |
| Scope | Platform-wide; not inside any Space. |
| Lifecycle | Built: created when a registration code is verified, then `active`. No route changes the status afterwards. Suspension, deactivation and deletion are **TBD** (U-01; C18-D09 PROPOSED; C18-D07 OPEN). |
| States | Built: `status IN ('active','suspended','deactivated','deletion_requested')`; only `active` is reachable, and only `active` accounts can sign in (S1). **PROPOSED** a fuller account state set (C18-D06 PROPOSED). |
| Relationships | One Profile (same row), one email Identity, and many Sessions, Memberships, Invitations, Pages, Reminders, Notifications, audit rows and account exports. |
| Permissions | Built: only the holder reads or changes their own account. No platform administrator exists; staff access is **TBD** (Q14; C16-D02 PROPOSED). |
| Privacy classification | Account details Private (C11-C03); password hash Highly sensitive (C11-C05). Built: the email is encrypted and found through a keyed digest; the password is stored only as a hash. |
| Events | `account.created`, `account.password_reset`, `account.export_requested`, `account.export_cancelled`, `account.export_downloaded`. |
| Commands | Register and reset password (through Identity); request or cancel an account export. |
| Queries | Read own account; list own security events; list, read and download own exports. |
| APIs | `GET /v1/me`, `GET /v1/me/security-events`, `POST /v1/me/exports` (Idempotency-Key), `GET /v1/me/exports`, `GET /v1/me/exports/{export_id}`, `DELETE /v1/me/exports/{export_id}`, `GET /v1/me/exports/{export_id}/archive`. Registration and recovery routes are under Identity. |
| Persistence | `users` (email_lookup unique, email_cipher, password_hash, display_name, timezone, status, version, created_at, verified_at); `account_exports` (encrypted archive). |
| Retention | Built: accounts are kept indefinitely, with no deletion path; export archives expire 24 hours after they are ready. **TBD** (U-01, Q19). |
| Audit requirements | Built: `identity_security_events` plus outbox (S5); the holder can list them. |
| Agent access | **TBD** (D4). S9 applies. |
| Allowed agent actions | **TBD** (D4). |
| External side effects | Registration and recovery send a sign-in code email (see Identity). |
| Validation rules | Built: email at most 254 characters and must end in `.test` (local only); password 12–128 characters, at least 5 different characters, not a common password. Exports need a sign-in within the last 15 minutes, allow at most 5 requests a day and one in progress, cover the categories profile, security, spaces, tasks and reminders, are at most 5 MB, and download only in the session that requested them. |
| Invariants | Built: one account per email (`email_lookup` unique); `version > 0`; status from the fixed list; a ready export always has an archive. |
| Failure modes | Built: a wrong email or password returns 401 INVALID_CREDENTIALS, the same whether or not the account exists; too many attempts return 429 RATE_LIMITED; a non-active account fails every request with 401 AUTHENTICATION_REQUIRED. No export worker runs in Compose, so export requests are never processed; account export is PROPOSED (P11) and has no screens. |
| Dependencies | Identity, Session, the identity mail worker. |

### 2. Identity

| Field | Contract |
| --- | --- |
| Entity | A verified way to recognise and reach a person. Built: email only, proven with a one-time 6-digit code. Tables `identity_challenges`, `identity_mail_jobs`, `identity_rate_buckets`. |
| Purpose | Prove control of the email address before creating an account or resetting a password. |
| Owner | Module `identity`. |
| Scope | Platform-wide; one email per account. |
| Lifecycle | Built: a code is requested and emailed, then used once, expires after 15 minutes, or is exhausted after 5 wrong attempts. Changing the email or adding a phone number is **TBD** (U-02; C18-D01 PROPOSED; C18-D04 OPEN). |
| States | Built: a code is pending, used, expired or exhausted (derived from `consumed_at`, `expires_at` and `attempts`; there is no status column). Mail job: `queued, processing, retry, sent, cancelled, expired, unknown, failed`. |
| Relationships | Belongs to one User once registered; one mail job per code. |
| Permissions | Built: anyone may request a code for an address, within rate limits; only the holder of the code and the matching request secret can use it. |
| Privacy classification | Email Private (C11-C03); codes and proofs Highly sensitive (C11-C05). Built: the email and mail content are encrypted; codes are stored only as digests and are not printed in application logs. |
| Events | None of its own; a used code produces `account.created` or `account.password_reset`. |
| Commands | Request a registration code; request a recovery code; verify a code to register or to reset the password. |
| Queries | None. |
| APIs | `POST /v1/auth/register` (Idempotency-Key), `POST /v1/auth/recover` (Idempotency-Key), `POST /v1/auth/verify-email`, `POST /v1/auth/reset-password`. |
| Persistence | `identity_challenges` (purpose registration or recovery), `identity_mail_jobs` (encrypted payload), `identity_rate_buckets`. |
| Retention | Built: code rows are kept; mail content is cleared when a job expires or is cancelled. **TBD** (Q19; C18-D05 OPEN). |
| Audit requirements | Built: code requests are not audited; the account change a code produces is. |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | Built: one email per code, sent by SMTP to the local Mailpit inbox from `no-reply@community.test`, with up to 3 attempts. Real email delivery is **TBD** (C18-D02 OPEN; C20-D05 OPEN) and not approved (S10). |
| Validation rules | Built: the code is exactly 6 digits; the request secret is 32–128 letters, digits, `-` or `_`; email rules as for User. |
| Invariants | Built: a code works once; at most 5 attempts; one code per request key. |
| Failure modes | Built: a wrong, expired, used or exhausted code returns 400 CHALLENGE_INVALID. Limits per 15 minutes: 5 registrations or 10 sign-ins per email and 60 per network, otherwise 429 RATE_LIMITED. A network is an IPv4 address or an IPv6 /64; web requests count against the browser's network when a trusted reverse proxy and the shared proxy key are configured (T10), otherwise against the connecting address. Mail failures are retried, then marked `failed`. |
| Dependencies | User; the identity mail worker; Mailpit. |

### 3. Profile

| Field | Contract |
| --- | --- |
| Entity | How a person appears to others. Built: display name and timezone, stored on `users`. |
| Purpose | Show a person's name in Spaces and next to their public activity, and set their default timezone. |
| Owner | Module `identity`; the account holder. |
| Scope | Shown to members of shared Spaces and next to the person's public posts and comments. Whether one name should serve both is **TBD** (Q15). |
| Lifecycle | Built: set at registration and edited by the holder after reviewing the current version. Handles, photos, a public profile and per-field visibility are **TBD** (U-18; Q15; C18-D11 OPEN). |
| States | None; one current version (`version`). |
| Relationships | One per User. |
| Permissions | Built: only the holder edits it; others see the display name where they share a Space or see the person's public content. |
| Privacy classification | Private (C11-C03); Public (C11-C01) where it is shown with public content (**TBD**, Q15). |
| Events | `profile.updated`. |
| Commands | Edit profile. |
| Queries | Read own profile (in `GET /v1/me`); list supported timezones. |
| APIs | `PATCH /v1/me/profile` (If-Match), `GET /v1/me`, `GET /v1/timezones`. |
| Persistence | `users.display_name`, `users.timezone`, `users.version`. |
| Retention | As User. |
| Audit requirements | Built: `profile.updated` security event plus outbox. |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: display name 1–80 characters without control characters; timezone a named IANA zone. |
| Invariants | Built: `version > 0`; the version check value is `"profile-{account}-{version}"`. |
| Failure modes | Built: a stale version returns 412 PRECONDITION_FAILED; a missing one returns 428. |
| Dependencies | User. |

### 4. Session

| Field | Contract |
| --- | --- |
| Entity | One signed-in browser or app. Table `account_sessions`. |
| Purpose | Let a signed-in person use the platform, and see and end their sign-ins. |
| Owner | Module `identity`; the account holder. |
| Scope | One account. |
| Lifecycle | Built: created at sign-in or registration; lasts 8 hours; ends when it expires, when the holder signs out or revokes it, or when a new sign-in would exceed 20 active sessions (the oldest ends). These values are **TBD** as policy (U-13; C18-D05 OPEN). |
| States | Built: active, expired or revoked (from `expires_at` and `revoked_at`; there is no status column). |
| Relationships | Belongs to a User; carries a Device label; an account export downloads only in the session that requested it; an ownership offer ends when the offering session expires. |
| Permissions | Built: the holder lists and revokes their own sessions; revoking all other sessions needs a sign-in within the last 15 minutes. |
| Privacy classification | Session token Highly sensitive (C11-C05); session list Private (C11-C03). Built: only a keyed digest of the token is stored; the web keeps the token in an HttpOnly, SameSite=Strict cookie; Android keeps it in Keystore-protected storage. |
| Events | `session.created`, `session.revoked`, `session.capacity_revoked`. |
| Commands | Sign in; sign out; revoke one session; revoke all other sessions. |
| Queries | List own sessions. |
| APIs | `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/me/sessions`, `DELETE /v1/me/sessions/{session_id}`, `POST /v1/me/sessions/revoke-others`. |
| Persistence | `account_sessions` (token_digest unique, device_name, platform, created_at, expires_at, revoked_at). |
| Retention | Built: rows are kept after expiry or revocation. **TBD** (Q19). |
| Audit requirements | Built: session security events plus outbox. |
| Agent access | **TBD** (D4). Built, not connected: the agent run model records the requesting session. |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: device name 1–80 characters (default "Browser"); platform `web` or `android`; token at most 128 characters. |
| Invariants | Built: one digest per token; a request is accepted only if the account is `active` and the session is neither revoked nor expired. |
| Failure modes | Built: a missing, expired or revoked session returns 401 AUTHENTICATION_REQUIRED; a sensitive action on an older session returns 403 REAUTHENTICATION_REQUIRED. Since 2026-10-01 messaging, community and event changes check the session again just before saving, so one that expires during a lock wait saves nothing (T04). |
| Dependencies | User, Identity. |

### 5. Device

| Field | Contract |
| --- | --- |
| Entity | A phone or browser known to the platform. Not built as an entity; a session stores only a device name and platform. |
| Purpose | **PROPOSED** Manage trusted devices, push notification addresses and, if end-to-end encryption is chosen, per-device keys (C19-D07 PROPOSED; C20-D04 OPEN). Whether Device becomes an entity is **TBD** (U-03). |
| Owner | **TBD** (U-03). |
| Scope | One account. |
| Lifecycle | **TBD** (U-03). **PROPOSED** enrolled, then revocable one at a time (C19-D07 PROPOSED). |
| States | **TBD** (U-03). |
| Relationships | **PROPOSED** belongs to a User and links to its Sessions, push addresses and encryption keys. |
| Permissions | **TBD** (U-03). |
| Privacy classification | Device encryption keys Highly sensitive (C11-C05); other device data **TBD**. |
| Events | **TBD**. |
| Commands | **TBD**. |
| Queries | **TBD**. Built: the session list shows each session's device name and platform. |
| APIs | None. |
| Persistence | Built: only `account_sessions.device_name` and `platform`. |
| Retention | **TBD**. |
| Audit requirements | **TBD**. |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | **PROPOSED** push delivery through a provider (C20-D04 OPEN); not approved (S10). |
| Validation rules | Built: device name 1–80 characters; platform `web` or `android`. |
| Invariants | **TBD**. |
| Failure modes | **TBD**. |
| Dependencies | Q10 (notification channels), Q11 (end-to-end encryption), D5 (iOS), U-03. |

### 6. Space

| Field | Contract |
| --- | --- |
| Entity | A group with its own members, roles, permissions and resources. Table `spaces`. |
| Purpose | **CONFIRMED** The main organizing concept (R2); a person can belong to many (R1); the types are family, couple, solo and custom group (R6). |
| Owner | Module `spaces`. The Space owner runs it; who owns the content inside it is **PROPOSED** (C3-D10 PROPOSED). |
| Scope | Private to its members. **CONFLICTING** whether a public community is a Space (D1; conflict C1). Decided in [DEC-011](DECISIONS.md#accepted-decisions) (under the product owner's delegation, awaiting review): the owner of a `group` Space may make it public, so signed-in accounts can find its name, description and member count and ask to join. Family, couple and solo Spaces are always private. In every Space, content, members and history stay members-only. |
| Lifecycle | Built: created (the creator becomes the owner), then `active`; the owner can rename it and edit its description; the owner of a group can switch it between private and public; ownership can move (see Membership). Archive, deletion and type change are **TBD** (U-09; C3-D09 OPEN; C3-D08 PROPOSED). |
| States | Built: `status IN ('active','archived')` with only `active` reachable; `space_type IN ('family','solo','group','couple')`; `visibility IN ('private','public')`, and public only for `group`, enforced by the database. Couple Spaces are built under [DEC-017](DECISIONS.md#accepted-decisions) (provisional, awaiting the owner's review): usable by the creator at once, shown as waiting for the partner until one joins; there is no separate pending state. **PROPOSED** states DRAFT, PENDING_ACTIVATION, ACTIVE, LOCKED, READ_ONLY, ARCHIVED, DELETION_PENDING, DELETED (C3-D02 PROPOSED). |
| Relationships | Memberships, Invitations, join requests, ownership offers, Tasks, Events, Conversations (one Space chat and direct chats) and audit rows. |
| Permissions | Built: any signed-in account creates one (up to 50 per account); current members read it; only the owner renames it, edits its description or changes a group's visibility. Any signed-in account can find a public group's name, description and member count, unless either it or the group's owner has blocked the other. **CONFIRMED** each Space has its own permissions (R2); configurable permissions are not built (T13). |
| Privacy classification | Private (C11-C03) for every family, couple, solo and private group Space: never listed, searched or distinguishable from a missing one. A public group exposes only its name, description and member count; its content, members and history stay private. |
| Events | `space.created`, `space.renamed`, `space.description_changed`, `space.made_public`, `space.made_private`. |
| Commands | Create; rename and describe; make a group public or private. |
| Queries | List my Spaces; read a Space; read its settings; find public groups; preview one public group. |
| APIs | `POST /v1/spaces` (Idempotency-Key), `GET /v1/spaces`, `GET /v1/spaces/{space_id}`, `GET /v1/spaces/{space_id}/settings`, `PATCH /v1/spaces/{space_id}/settings` (Idempotency-Key, If-Match), `POST /v1/spaces/{space_id}/visibility` (Idempotency-Key, If-Match), `GET /v1/discover/spaces`, `GET /v1/discover/spaces/{space_id}`. |
| Persistence | `spaces`, `space_settings_commands`. |
| Retention | Built: kept indefinitely. **TBD** (U-09; C3-D09 OPEN). |
| Audit requirements | Built: `space_audit_events` plus outbox. |
| Agent access | **TBD** (D4). **PROPOSED** a Space agent uses only data approved for its scope (C3-D10 PROPOSED). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: name 1–80 characters after trimming, without control characters; description up to 280 characters without control or text-direction characters (new lines allowed); type `family`, `couple`, `solo` or `group`; only a group can be public. The name and description cannot change while invitations, join requests or ownership offers are pending. |
| Invariants | Built: exactly one active owner; a solo Space has only its owner, enforced by the database; a couple Space has at most two active members (the owner and one partner), checked when inviting and accepting under the Space lock and enforced by the database; only a group is ever public, enforced by the database; the type never changes, enforced by the database; `version > 0`; one creation per creator and request key. |
| Failure modes | Built: non-members get 404, and a private Space looks exactly like a missing one in discovery; stale settings return 412; making a family, couple or solo Space public returns 409 PRIVATE_SPACE_TYPE; inviting or admitting a third person to a couple returns 409 COUPLE_FULL, and inviting a second person while the partner's invitation still waits returns 409 COUPLE_INVITATION_PENDING; creating more than 50 Spaces is refused. |
| Dependencies | User, Membership. |

### 7. Membership

| Field | Contract |
| --- | --- |
| Entity | One admission of one person to one Space. Table `space_memberships`; each admission has its own `admission_id` and an order number within its Space (`admission_sequence`). Ownership offers are in `space_ownership_transfers`. |
| Purpose | **CONFIRMED** Each Space has its own membership (R2). |
| Owner | Module `spaces`. |
| Scope | One Space. |
| Lifecycle | Built: created with the Space (owner) or by accepting an invitation (member); ends when the owner removes the member or the member leaves; returning needs a new invitation and creates a new admission. Rules for leaving, removal, suspension and rejoining are **TBD** (C3-D06 OPEN). |
| States | Built: `status IN ('active','removed')`; ownership offers `pending, accepted, declined, cancelled, expired, invalidated`. **PROPOSED** a fuller membership state set (C3-D02 and C18-D06, both PROPOSED). |
| Relationships | Joins a User to a Space. Its admission ID limits access to tasks, messages, events and reminders. Ownership offers move the owner role between two memberships. |
| Permissions | Built: members see the roster; the owner removes ordinary members; members leave; the owner cannot leave or be removed and must transfer ownership first; an ownership offer needs a sign-in within the last 15 minutes. |
| Privacy classification | Private (C11-C03). Built: the roster shows display names and roles, not admission IDs. |
| Events | `space.member_removed`, `space.member_left`, `space.ownership_offered`, and `space.ownership_<status>` when an offer ends. |
| Commands | Remove a member; leave; offer ownership; accept, decline or cancel an offer. |
| Queries | List members; list ownership offers. |
| APIs | `GET /v1/spaces/{space_id}/members`; `POST /v1/spaces/{space_id}/members/{account_id}/remove` and `POST /v1/spaces/{space_id}/leave` (Idempotency-Key, If-Match); `POST /v1/spaces/{space_id}/ownership-transfers` (Idempotency-Key, If-Match); `GET /v1/spaces/{space_id}/ownership-transfers`; `POST /v1/spaces/{space_id}/ownership-transfers/{transfer_id}/accept`, `/decline` and `/cancel` (If-Match). |
| Persistence | `space_memberships`, `space_membership_commands`, `space_ownership_transfers`. |
| Retention | Built: ended memberships are kept as `removed`. **TBD** (C3-D09 OPEN). |
| Audit requirements | Built: `space_audit_events` plus outbox. |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). **PROPOSED** no member removal or permission changes in the first release (P8). Built, not connected: the agent parser refuses invite, remove and role requests. |
| External side effects | None. |
| Validation rules | Built: at most 50 members per Space; one pending ownership offer per Space, lasting 15 minutes or until the offering session ends; at most 100 offers per Space. |
| Invariants | Built: one active owner per Space; admission IDs are unique; an ended admission never regains access; leaving or removal stops pending reminder delivery without deleting shared content. New members not seeing earlier items is Built but **TBD** as policy (D3; C3-D05 PROPOSED). |
| Failure modes | Built: a stale roster returns 412; the owner cannot leave; ownership offer conflicts return 409 or 410. Since 2026-10-01 chat and event history compare admission order numbers, not timestamps (T02). |
| Dependencies | User, Space, Invitation. |

### 8. Role

| Field | Contract |
| --- | --- |
| Entity | What a member may do in a Space. Built: a column on the membership. |
| Purpose | **CONFIRMED** Each Space has its own roles (R2). |
| Owner | Module `spaces`. |
| Scope | One membership. |
| Lifecycle | Built: `owner` for the creator, `member` for everyone admitted by invitation; the owner role moves only through an accepted ownership offer. Assigning other roles is **TBD** (T13; P5). |
| States | Built: `role IN ('owner','member')`. **PROPOSED** owner, admin, moderator, member, guest and observer, where admins cannot manage other admins or the owner (C3-D03 PROPOSED; guests C3-D07 OPEN). |
| Relationships | Part of a Membership. |
| Permissions | See [Permission](#9-permission). |
| Privacy classification | Private (C11-C03). |
| Events | Ownership events (see Membership). |
| Commands | None besides ownership transfer. |
| Queries | Shown in the roster. |
| APIs | None of its own. |
| Persistence | `space_memberships.role`. |
| Retention | As Membership. |
| Audit requirements | As Membership. |
| Agent access | **CONFIRMED** an agent never becomes an administrator automatically (R7). Whether agents hold roles is **TBD** (D4). |
| Allowed agent actions | None. **PROPOSED** no permission changes in the first release (P8). |
| External side effects | None. |
| Validation rules | Built: role from the fixed list. |
| Invariants | Built: exactly one active owner per Space. |
| Failure modes | None beyond Membership's. |
| Dependencies | Membership, Permission; P5 and T13. |

### 9. Permission

| Field | Contract |
| --- | --- |
| Entity | The rule that decides whether an actor may perform an action on an item. Not stored: fixed rules in each module's service code, listed in the table below. |
| Purpose | **CONFIRMED** Each Space has its own permissions (R2); retrieval respects permissions (R11). |
| Owner | Each module enforces its own rules under S1 and S2. |
| Scope | One action on one item. |
| Lifecycle | Built: rules change only when the code changes. Per-Space permission settings are **TBD** (T13; P5). |
| States | None. |
| Relationships | Uses the account's status, the Session, the Membership (admission), the Role, task access grants and, for care, the person described. |
| Permissions | The rules as built are in the table below. |
| Privacy classification | Not applicable. |
| Events | None. |
| Commands | None. |
| Queries | Screens receive flags such as `can_manage` and `can_send`, computed from the rules. |
| APIs | None of its own. |
| Persistence | None; derived from memberships, roles and `task_access`. |
| Retention | Not applicable. |
| Audit requirements | Whether refused attempts are recorded is **TBD** (U-06; C11-D11 PROPOSED). |
| Agent access | **PROPOSED** an agent's authority is the overlap of its scope and the delegating person's current permissions, checked when it acts; it never grants itself more (C11-D03 and C12-D03, both PROPOSED). |
| Allowed agent actions | Not applicable. |
| External side effects | None. |
| Validation rules | Not applicable. |
| Invariants | Built: an action is denied unless a rule allows it; rules read current state, not cached roles. |
| Failure modes | Built: 404 for hidden items; 403 (ACCESS_DENIED or a domain code) for forbidden actions. |
| Dependencies | Session, Membership, Role. |

Permission rules as built:

| Action | Who may do it |
| --- | --- |
| Create a Space | Any signed-in account (up to 50) |
| See a Space, its roster, its Space chat and its events | Its current members |
| Rename a Space; invite; withdraw an invitation; remove a member | The owner |
| Offer ownership | The owner, signed in within the last 15 minutes |
| Accept or decline an invitation or an ownership offer | The intended person |
| Leave a Space | Any member except the owner |
| Create a task or an event; answer an event; send in the Space chat | Current members |
| Edit, assign or cancel a task; add, rename or remove checklist items; ask the assignee to accept a reminder | The Space owner, or the task's creator in the same admission |
| Change a task's progress, complete or reopen it; tick checklist items | The people above and the current assignee |
| See a task | The admissions granted access when it was created |
| Edit or cancel an event | The Space owner, or the event's creator in the same admission |
| Send in a direct chat | Its two participants, while both are current members |
| Delete a message | Its author |
| Create a public page | Any signed-in account (up to 5) |
| Edit a page; draft, edit, publish or delete its posts | The page owner |
| Comment | Signed-in accounts the page owner has not blocked |
| End a comment | Its author (deleted) or the page owner (removed) |
| Follow, like, save, report, block | Signed-in accounts; nobody reports their own content |
| Read published pages, posts and comments | Anyone, including signed-out visitors |
| Reminders, notifications, exports, sessions and profile | Only the account holder |
| Care instructions and dose reports | Only the person they describe |

### 10. Invitation

| Field | Contract |
| --- | --- |
| Entity | An offer for an existing account to join a Space (table `space_invitations`), or a person's request to join a public group (table `space_join_requests`). |
| Purpose | Admit a person only with their explicit acceptance, or with the owner's explicit approval of their request. |
| Owner | Module `spaces`. |
| Scope | One Space and one recipient. |
| Lifecycle | Built: an invitation is created by the owner as `pending`; then accepted (which creates a new admission), declined, revoked by the owner, or expired after 72 hours. A join request is created by the person as `pending` with an optional note; then approved by the owner (a new admission), declined, withdrawn by the person, closed when the group becomes private, or expired after 14 days. After a decline the person can ask again after 7 days. |
| States | Built: invitations `pending, accepted, declined, revoked, expired`; join requests `pending, approved, declined, cancelled, closed, expired`. **PROPOSED** a fuller invitation state set (C18-D06 PROPOSED). |
| Relationships | Space; inviter (the owner) or requester; recipient (a User); the admission it created. |
| Permissions | Built: the owner creates, lists and revokes invitations, and lists, approves and declines join requests; only the recipient sees, accepts or declines an invitation; only the requester sees or withdraws their request. The owner sees a requester's display name and note, never their email. |
| Privacy classification | Private (C11-C03). A join request keeps the group name the person saw, so a later rename of a group that went private never reaches them. |
| Events | `space.invitation_created`, `space.invitation_revoked`, `space.invitation_<status>` when accepted or declined; `space.join_requested`, `space.join_request_approved`, `space.join_request_declined`, `space.join_request_cancelled`. |
| Commands | Invite; revoke; accept; decline; ask to join; withdraw; approve; decline a request. |
| Queries | List a Space's invitations (owner); list my invitations (recipient); list a group's waiting requests (owner); list my join requests. |
| APIs | `POST /v1/spaces/{space_id}/invitations` (Idempotency-Key), `GET /v1/spaces/{space_id}/invitations`, `POST /v1/spaces/{space_id}/invitations/{invitation_id}/revoke`, `GET /v1/invitations`, `POST /v1/invitations/{invitation_id}/accept`, `POST /v1/invitations/{invitation_id}/decline`, `POST /v1/spaces/{space_id}/join-requests` (Idempotency-Key), `GET /v1/spaces/{space_id}/join-requests`, `POST /v1/spaces/{space_id}/join-requests/{request_id}/approve` and `/decline`, `POST /v1/space-join-requests/{request_id}/cancel`, `GET /v1/me/space-join-requests`. |
| Persistence | `space_invitations`, `space_join_requests`. |
| Retention | Built: kept. **TBD** (Q19). |
| Audit requirements | Built: `space_audit_events` plus outbox. |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). Built, not connected: the agent parser refuses invitation requests. |
| External side effects | None. Invitations by email, phone, link or contacts are **TBD** (Product Understanding section 7; C18-D03 PROPOSED; C18-D12 OPEN). |
| Validation rules | Built: the recipient is an existing verified account, entered by account ID, and not the inviter; at most one pending invitation per recipient per Space; at most 200 invitations per Space. A join request needs a public group the person is not in and has not blocked or been blocked by; its note is up to 280 characters; one pending request per person and group; at most 20 waiting requests per person and 100 per group. |
| Invariants | Built: `recipient_id <> inviter_id`; `expires_at > created_at`; one pending invitation per Space and recipient; one pending join request per group and person; a request is resolved exactly when it is no longer pending; accepting or approving creates exactly one admission. |
| Failure modes | Built: expired or revoked invitations cannot be accepted; a Space with 50 members admits nobody else (409 SPACE_FULL for requests); 409 JOIN_REQUEST_PENDING, 409 JOIN_REQUEST_COOLDOWN, 409 ALREADY_MEMBER, 409 JOIN_REQUEST_CLOSED, 410 JOIN_REQUEST_EXPIRED; a private or missing group returns the same 404. |
| Dependencies | Space, Membership, User. |

### 11. Relationship

| Field | Contract |
| --- | --- |
| Entity | An explicit connection between two people, such as a family tie or a contact. Not built. |
| Purpose | **PROPOSED** Record who is connected to whom, separately from Space membership and from any legal or care authority (Chapter 18 contract; C18-D10 OPEN). Whether it exists is **TBD** (U-04). |
| Owner | **TBD** (U-04). |
| Scope | Two accounts. |
| Lifecycle | **PROPOSED** created explicitly and accepted by the other person (Chapter 18 contract). **TBD** (U-04). |
| States | **TBD** (U-04). |
| Relationships | **PROPOSED** links two Users. |
| Permissions | **TBD** (U-04). |
| Privacy classification | Private (C11-C03). |
| Events | **TBD**. |
| Commands | **TBD**. |
| Queries | **TBD**. |
| APIs | None. |
| Persistence | None. |
| Retention | **TBD**. |
| Audit requirements | **TBD**. |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | **TBD**. |
| Invariants | **PROPOSED** a relationship grants no access, guardianship or consent by itself (Chapter 18 contract). |
| Failure modes | **TBD**. |
| Dependencies | User; U-04. |

### 12. Block

| Field | Contract |
| --- | --- |
| Entity | A person's choice to hide a page, or another account's comments, from themselves. Table `account_blocks`. |
| Purpose | Protect people from unwanted public content and interaction. |
| Owner | Module `community`; the person who blocks. |
| Scope | Built: the public community only. Blocking inside private Spaces and direct chats is **TBD** (U-05; C18-D10 OPEN; C2-D03 OPEN). |
| Lifecycle | Built: created, then removed when the person unblocks. No expiry. |
| States | Built: exists or not. |
| Relationships | Blocker (a User) to a Page or an account (a comment's author). |
| Permissions | Built: people create, list and remove only their own blocks. |
| Privacy classification | Private (C11-C03). |
| Events | None (no audit or outbox record). |
| Commands | Block a page; block a comment's author; unblock. |
| Queries | List my blocks. |
| APIs | `POST /v1/blocks`, `GET /v1/me/blocks`, `POST /v1/blocks/{block_id}/remove`. |
| Persistence | `account_blocks`. |
| Retention | Built: deleted on unblock. |
| Audit requirements | Built: none. **TBD** (U-06). |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: the target is a page or a comment's author (stored as `account`); at most 500 blocks per person. |
| Invariants | Built: one block per person and target; nobody blocks themselves. Blocking a page hides it from the blocker's feeds and discovery and ends their follow; blocking an account hides its comments from the blocker; a page owner's block stops that account commenting on the owner's pages. |
| Failure modes | Built: 409 BLOCK_LIMIT_REACHED; 409 OWN_CONTENT. |
| Dependencies | Page, Comment, Follow. |

### 13. Follow

| Field | Contract |
| --- | --- |
| Entity | Subscribing to a page's posts. Table `public_page_follows`. |
| Purpose | **CONFIRMED** Follows are part of the public side (R4). **PROPOSED** following is not membership (P3). |
| Owner | Module `community`; the follower. |
| Scope | Public pages. Following people is **TBD** (Product Understanding section 3). |
| Lifecycle | Built: follow, then unfollow; blocking the page ends the follow. |
| States | Built: exists or not. |
| Relationships | Follower (a User) to a Page; updates the page's `follower_count`; drives the Following feed. |
| Permissions | Built: signed-in accounts, except for pages they have blocked. |
| Privacy classification | Private (C11-C03). Built: pages show a follower count; no route lists a page's followers. |
| Events | None (no audit or outbox record). |
| Commands | Follow; unfollow. |
| Queries | List pages I follow; the Following feed. |
| APIs | `POST /v1/pages/{page_id}/follow`, `POST /v1/pages/{page_id}/unfollow`, `GET /v1/me/following`, `GET /v1/feed`. |
| Persistence | `public_page_follows`; `public_pages.follower_count`. |
| Retention | Built: deleted on unfollow. |
| Audit requirements | Built: none. **TBD** (U-06). |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: at most 1,000 follows per account. |
| Invariants | Built: one follow per page and account; `follower_count >= 0`. **PROPOSED** repeating a follow or unfollow never double-counts (C2-D08 PROPOSED). |
| Failure modes | Built: 409 FOLLOW_LIMIT_REACHED; 409 PAGE_BLOCKED. |
| Dependencies | Page, Block. |

### 14. Report

| Field | Contract |
| --- | --- |
| Entity | A person's flag on public content for review. Table `content_reports`. |
| Purpose | **PROPOSED** The entry point to moderation, which must work before any public launch (P10; Chapter 16 contract). |
| Owner | Module `community` stores reports; the reserved `safety` module has no code. |
| Scope | Public pages, posts and comments. Reporting messages or other private content is **TBD** (Product Understanding section 12). |
| Lifecycle | Built: created as `received`; nothing moves it further, because nobody reviews reports yet. **PROPOSED** a moderation case with triage, review, action, notice and appeal (C16-D02, C16-D07 and C16-D08 PROPOSED; C16-D05 and C16-D06 OPEN). |
| States | Built: `received, reviewing, closed`; only `received` is used. |
| Relationships | Reporter (a User) to a page, post or comment. |
| Permissions | Built: signed-in accounts, not on their own content. Who reviews reports is **TBD** (Q14; U-14). |
| Privacy classification | Private (C11-C03). |
| Events | `safety.report_received` (outbox only). |
| Commands | Report. |
| Queries | None; no route lists reports. |
| APIs | `POST /v1/reports`. |
| Persistence | `content_reports`. |
| Retention | Built: kept. **TBD** (C16-D10 OPEN). |
| Audit requirements | Built: an outbox record only. **TBD** (U-06). |
| Agent access | **TBD** (D4; C16-D09 PROPOSED covers agent delegation in moderation). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: reason `spam`, `harassment`, `hate`, `violence`, `sexual`, `misinformation`, `self_harm`, `privacy` or `other`; details at most 1,000 characters; at most 30 reports per day per person. |
| Invariants | Built: one `received` report per reporter and target. |
| Failure modes | Built: 409 OWN_CONTENT; 429 REPORT_RATE_LIMITED. |
| Dependencies | Page, Post, Comment; Q14 and U-14. |

### 15. Page

| Field | Contract |
| --- | --- |
| Entity | A public community page with a handle, owned by one account. Table `public_pages`. Added to the requested list because posts, follows, reports and blocks depend on it. |
| Purpose | **CONFIRMED** Public communities exist (R3). **CONFLICTING** whether a public community is a Page or a Space (D1; conflict C1). DEC-011 keeps Pages as the public content model; a public group Space is findable but its content stays members-only. |
| Owner | Module `community`; the page owner. |
| Scope | Public. |
| Lifecycle | Built: created as `active` and edited by its owner. No route archives, transfers or deletes a page; those rules are **TBD** (U-10; C2-D02 and C2-D06, both PROPOSED). |
| States | Built: `status IN ('active','archived')`; only `active` is reachable. |
| Relationships | Owner (a User); Posts; Follows; the Blocks and Reports that target it. |
| Permissions | Built: any signed-in account creates up to 5 pages; only the owner edits; anyone, signed out too, reads active pages, except people who blocked the page. Page roles are **PROPOSED** (C2-D01 PROPOSED). |
| Privacy classification | Public (C11-C01). Built: public responses do not include account IDs. |
| Events | `public.page_created`, `public.page_updated`. |
| Commands | Create; edit. |
| Queries | Read a page; list my pages; discover pages by name, handle, description and topic. |
| APIs | `POST /v1/pages` (Idempotency-Key), `GET /v1/me/pages`, `PATCH /v1/pages/{page_ref}` (If-Match), `GET /v1/pages/{page_ref}` (signed out allowed), `GET /v1/discover/pages` (signed out allowed). |
| Persistence | `public_pages`. |
| Retention | Built: kept. **TBD** (U-10). |
| Audit requirements | Built: `community_audit_events` plus outbox. |
| Agent access | **TBD** (D4). **PROPOSED** a page agent answers only from approved public page material (Chapter 2 contract). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: handle 3–30 lowercase letters, digits and inner hyphens, unique and not reserved; name 1–80 characters on one line; description up to 500 characters; topic one of `community`, `education`, `health`, `local`, `family`, `events`, `hobbies`, `support`, `news`, `other`. |
| Invariants | Built: handles are unique; `follower_count >= 0`; `version >= 1`; one creation per owner and request key. |
| Failure modes | Built: 409 HANDLE_TAKEN, 409 PAGE_LIMIT_REACHED, 403 PAGE_MANAGER_REQUIRED, 412 CONTENT_CHANGED. Since 2026-10-01 a change that waits for a lock checks the session again before saving (T04). |
| Dependencies | User; D1. |

### 16. Post

| Field | Contract |
| --- | --- |
| Entity | A public post on a page. Table `public_posts`. |
| Purpose | **CONFIRMED** Posts are part of the public side (R4). |
| Owner | Module `community`; written by the page owner. |
| Scope | Public once published; drafts are private to the page owner. |
| Lifecycle | Built: draft, then published, then deleted; drafts can also be deleted; published posts can be edited (`edited_at`). Review before publication and revision history are **TBD** (U-10; C2-D04 PROPOSED; C2-D05 OPEN). |
| States | Built: `draft, published, deleted`. |
| Relationships | Page; author; Comments; Reactions and Saves; Reports. |
| Permissions | Built: the page owner drafts, edits, publishes and deletes; anyone, signed out too, reads published posts, except from pages they blocked. |
| Privacy classification | Drafts Private (C11-C03); published posts Public (C11-C01). |
| Events | `public.post_drafted`, `public.post_published`, `public.post_edited`, `public.post_deleted`. |
| Commands | Draft; edit; publish; delete. |
| Queries | Read a post; a page's published posts; the page owner's drafts; Latest; search of published posts by their words (`q` on Latest); the Following feed; Saved. |
| APIs | `POST /v1/pages/{page_ref}/posts` (Idempotency-Key), `GET /v1/pages/{page_id}/drafts`, `PATCH /v1/posts/{post_id}` (If-Match), `POST /v1/posts/{post_id}/publish` (If-Match), `POST /v1/posts/{post_id}/delete` (If-Match), `GET /v1/posts/{post_id}`, `GET /v1/pages/{page_ref}/posts`, `GET /v1/discover/posts`, `GET /v1/feed`, `GET /v1/me/saved-posts`. |
| Persistence | `public_posts`. |
| Retention | Built: a deleted post keeps a tombstone with its title and body removed; nothing is hard-deleted. **TBD** (U-10). |
| Audit requirements | Built: `community_audit_events` plus outbox. |
| Agent access | **TBD** (D4). **PROPOSED** agents may draft but never publish on their own (Chapter 2 contract). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: optional title up to 120 characters on one line; body 1–5,000 characters; at most 50 drafts and 2,000 posts per page. Images and video are **PROPOSED** (C2-D10 PROPOSED) and not built. |
| Invariants | Built: drafts and published posts have a body and no deletion time; deleted posts have neither title nor body; counts are never negative. |
| Failure modes | Built: 409 DRAFT_LIMIT_REACHED, 409 POST_LIMIT_REACHED, 412 CONTENT_CHANGED, 428 PRECONDITION_REQUIRED. The Android limit that refused valid pages of posts larger than 64 KiB was fixed on 2026-10-01 (T06). |
| Dependencies | Page. |

### 17. Comment

| Field | Contract |
| --- | --- |
| Entity | A reply to a post, with one level of replies. Table `public_post_comments`. |
| Purpose | **CONFIRMED** Comments are part of the public side (R4). |
| Owner | Module `community`; its author. |
| Scope | Public, on published posts. |
| Lifecycle | Built: visible, then deleted by its author or removed by the page owner. Editing is not built; editing windows and moderation are **TBD** (C2-D05 OPEN; C2-D07 OPEN). |
| States | Built: `visible, deleted, removed`. |
| Relationships | Post; an optional parent comment on the same post; author. |
| Permissions | Built: signed-in accounts comment unless the page owner blocked them; authors delete their own; page owners remove; anyone reads visible comments; people do not see comments from accounts they blocked. |
| Privacy classification | Public (C11-C01); shows the author's display name (Q15). |
| Events | `public.comment_created`, `public.comment_deleted`, `public.comment_removed`. |
| Commands | Comment; reply; delete own comment; remove (page owner). |
| Queries | List a post's comments, oldest first. |
| APIs | `POST /v1/posts/{post_id}/comments` (Idempotency-Key), `POST /v1/comments/{comment_id}/delete`, `GET /v1/posts/{post_id}/comments` (signed out allowed). |
| Persistence | `public_post_comments`. |
| Retention | Built: ended comments keep a tombstone without the text; nothing is hard-deleted. |
| Audit requirements | Built: only removals by the page owner write an audit row; creating and deleting one's own comment write outbox records only. **TBD** (U-06). |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: 1–2,000 characters; a reply's parent must be a visible comment on the same post; replies cannot be replied to; at most 20 comments per minute per person and 5,000 per post. |
| Invariants | Built: a comment is never its own parent; a reply stays on its parent's post; visible comments have text and no end time. |
| Failure modes | Built: 403 COMMENTING_UNAVAILABLE, 409 REPLY_DEPTH, 409 COMMENT_UNAVAILABLE, 429 COMMENT_RATE_LIMITED, 409 COMMENT_LIMIT_REACHED. |
| Dependencies | Post, Block. |

### 18. Reaction

| Field | Contract |
| --- | --- |
| Entity | A response to a post. Built: "like" only. Table `public_post_reactions`. Saves (`public_saved_posts`), a private bookmark, are covered here too. |
| Purpose | **CONFIRMED** Reactions are part of the public side (R4). |
| Owner | Module `community`; the person reacting. |
| Scope | Published posts the person can see. |
| Lifecycle | Built: like, then unlike; save, then unsave. |
| States | Built: exists or not; `kind = 'like'`. Other reaction types are **TBD** (U-07). |
| Relationships | An account and a Post; updates the post's `like_count`. |
| Permissions | Built: signed-in accounts. |
| Privacy classification | Private (C11-C03); the like count is public. |
| Events | None (no audit or outbox record). |
| Commands | Like; unlike; save; unsave. |
| Queries | List my saved posts. |
| APIs | `POST /v1/posts/{post_id}/like`, `POST /v1/posts/{post_id}/unlike`, `POST /v1/posts/{post_id}/save`, `POST /v1/posts/{post_id}/unsave`, `GET /v1/me/saved-posts`. |
| Persistence | `public_post_reactions`, `public_saved_posts`, `public_posts.like_count`. |
| Retention | Built: deleted on unlike or unsave. |
| Audit requirements | Built: none. **TBD** (U-06). |
| Agent access | **TBD** (D4). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. |
| Validation rules | Built: at most 1,000 saved posts per account. |
| Invariants | Built: one like and one save per post and account; `like_count >= 0`. **PROPOSED** repeating a command never double-counts (C2-D08 PROPOSED). |
| Failure modes | Built: 404 when the post is not visible; 409 SAVED_LIMIT_REACHED. |
| Dependencies | Post. |

### 19. Conversation

| Field | Contract |
| --- | --- |
| Entity | Where Space members exchange messages: one Space chat per Space, or a direct chat between two members of the same Space. Table `conversations`; read positions in `conversation_read_states`. |
| Purpose | **CONFIRMED** Private Spaces contain private conversations (R5). |
| Owner | Module `messaging`. |
| Scope | One Space. A Space chat includes all current members; a direct chat includes exactly two admissions. |
| Lifecycle | Built: opened on first use (the Space chat once per Space, a direct chat once per pair of admissions); a direct chat becomes read-only when either participant stops being a current member. No archive or deletion. **PROPOSED** conversation authority and history rules (C19-D01 PROPOSED). |
| States | Built: `kind IN ('space','direct')`; read-only is computed (`can_send`), not stored. |
| Relationships | Space; the participants' admissions; Messages; one read position per reader and admission. |
| Permissions | Built: current members open and read the Space chat; only the two participants read a direct chat; each reader sees history from their own admission onward. The history rule is **TBD** as policy (D3). |
| Privacy classification | Private (C11-C03). Built: not end-to-end encrypted; whether it will be is **TBD** (Q11; C19-D05 and C19-D06, both OPEN). |
| Events | `conversation.created`. |
| Commands | Open the Space chat or a direct chat; mark read up to a position. |
| Queries | List conversations with unread counts; read one conversation. |
| APIs | `POST /v1/spaces/{space_id}/conversations`, `GET /v1/conversations`, `GET /v1/conversations/{conversation_id}`, `POST /v1/conversations/{conversation_id}/read`. |
| Persistence | `conversations`, `conversation_read_states`. |
| Retention | Built: kept indefinitely. **TBD** (C3-D09 OPEN). |
| Audit requirements | Built: creation writes `space_audit_events` plus outbox; read positions are not audited. |
| Agent access | **TBD** (D4; C19-D09 OPEN). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None; there are no push notifications (Q10). |
| Validation rules | Built: a direct chat needs a counterpart who is a current member of the same Space; at most 200 direct chats per Space; a read position cannot pass the last visible message. |
| Invariants | Built: one Space chat per Space; one direct chat per pair of admissions, stored in a fixed order; each read position belongs to one admission. |
| Failure modes | Built: 409 CONVERSATION_UNAVAILABLE, 409 CONVERSATION_LIMIT_REACHED, 409 READ_POSITION_INVALID. Since 2026-10-01 history compares admission order numbers (T02), a direct message cannot be saved after the other person has left (T03), and failed web read receipts are retried (T07). |
| Dependencies | Space, Membership. |

### 20. Message

| Field | Contract |
| --- | --- |
| Entity | Text sent in a conversation. Table `conversation_messages`. |
| Purpose | **CONFIRMED** Part of private conversations (R5). |
| Owner | Module `messaging`; its sender. |
| Scope | One conversation. |
| Lifecycle | Built: sent (stored once per retry key), visible, and possibly deleted by its author, which leaves a tombstone without the text. Copies already seen are not recalled. Editing, reactions, attachments and reporting are **TBD** (U-11; C19-D10 and C19-D11, both PROPOSED). |
| States | Built: visible or deleted (`deleted_at`). Per-message delivery and read receipts are **PROPOSED** (C19-D04 PROPOSED); only per-reader read positions exist. |
| Relationships | Conversation; the sender's admission. |
| Permissions | Built: current members send in the Space chat; the two participants send in a direct chat while both are current members; readers see messages from their admission onward; authors delete their own. |
| Privacy classification | Private (C11-C03). Built: the text is encrypted at rest with a key derived from the local key file and bound to its conversation and message. The server can read it; it is not end-to-end encrypted. |
| Events | `conversation.message_sent`, `conversation.message_deleted`. |
| Commands | Send; delete. |
| Queries | List messages before or after a position. |
| APIs | `POST /v1/conversations/{conversation_id}/messages` (Idempotency-Key), `GET /v1/conversations/{conversation_id}/messages`, `POST /v1/conversations/{conversation_id}/messages/{message_id}/delete`. |
| Persistence | `conversation_messages` (`body_cipher`). |
| Retention | Built: deleted messages keep a tombstone; nothing is hard-deleted. **TBD** (Q19). |
| Audit requirements | Built: sends write an outbox record only; deletions write `space_audit_events` plus outbox. **TBD** (U-06). |
| Agent access | **TBD** (D4; Q11; C19-D09 OPEN). |
| Allowed agent actions | **TBD** (D4). **PROPOSED** no external messages in the first release (P8). |
| External side effects | None. |
| Validation rules | Built: 1–2,000 characters; no control characters except new line and tab; no text-direction override characters; at most 30 messages per minute per sender and 10,000 per conversation. |
| Invariants | Built: positions are unique and increasing within a conversation; one message per conversation, sender and retry key; a visible message has text and a deleted one has none. |
| Failure modes | Built: 409 CONVERSATION_READ_ONLY, 409 CONVERSATION_FULL, 429 MESSAGE_RATE_LIMITED, 403 MESSAGE_NOT_YOURS. Since 2026-10-01 each message records how many admissions came before it (T02), a send cannot overlap the other person leaving (T03) or save after the session expired (T04), and the web keeps an unconfirmed send and its Retry when switching conversations (T05). |
| Dependencies | Conversation, Membership, the local key file. |

### 21. Task

| Field | Contract |
| --- | --- |
| Entity | Shared work in a Space. Tables `tasks`, `task_access`, `task_checklist_items`, `task_commands`, `task_audit_events`. |
| Purpose | **CONFIRMED** Private Spaces contain tasks (R5); agents can assist with tasks (R8). |
| Owner | Module `planning`. |
| Scope | One Space; visible to the admissions granted access when it was created. |
| Lifecycle | Built: `open` and `in_progress` in either direction; `completed`, and reopening returns it to `open`; managers can cancel open or in-progress tasks. Deleting or archiving tasks is **TBD** (U-12). |
| States | Built: `status IN ('open','in_progress','completed','cancelled')`. **PROPOSED** dependencies and further states (C17-D07 PROPOSED). |
| Relationships | Space; the creator's admission; the assignee's admission; checklist items; reminders and reminder requests; the calendar agenda. |
| Permissions | See [Permission](#9-permission). Managers (the Space owner, or the creator in the same admission) edit, assign and cancel; managers and the current assignee change progress, complete and reopen. |
| Privacy classification | Private (C11-C03). Built: titles and notes are not encrypted at rest. |
| Events | `task.created`, `task.updated`, `task.<status>` (open, in_progress, completed, cancelled), `task.checklist_<action>` (add, rename, check, remove). |
| Commands | Create; edit the title, notes, due date or assignee; change status; add, rename, tick or remove checklist items. |
| Queries | List tasks by Space and status; read a task; list eligible assignees; read the checklist; the calendar agenda of task dates and one's own reminders. |
| APIs | `POST /v1/tasks` (Idempotency-Key), `GET /v1/tasks`, `GET /v1/tasks/{task_id}`, `PATCH /v1/tasks/{task_id}` (Idempotency-Key, If-Match), `POST /v1/tasks/{task_id}/status` (Idempotency-Key, If-Match), `GET /v1/tasks/assignees`, `GET /v1/tasks/{task_id}/checklist`, `POST /v1/tasks/{task_id}/checklist` (Idempotency-Key, If-Match), `GET /v1/calendar`. |
| Persistence | The five tables above. |
| Retention | Built: kept; removed checklist items keep `removed_at`. **TBD** (U-12; Q19). |
| Audit requirements | Built: `task_audit_events` (status before and after, changed fields) plus outbox. |
| Agent access | **TBD** (D4). Built, not connected: tools `family.tasks.list` (read), and `tasks.create` and `tasks.complete` (writes that need approval). |
| Allowed agent actions | **TBD** (D4). **PROPOSED** confirmed group tasks in the first release (P8). |
| External side effects | None. |
| Validation rules | Built: title 1–200 characters without control characters; notes up to 5,000 characters; the due date is a calendar date without a time; the assignee must be a current member with access; checklist items 1–200 characters, at most 50 visible and 500 in total per task. |
| Invariants | Built: completed tasks record who completed them and when; the assignee's account and admission are set together and belong to the same Space; one creation per Space, creator and request key; reassignment never widens who can see a task; a due date never creates a reminder. |
| Failure modes | Built: 403 ACCESS_DENIED; 409 TASK_CLOSED when editing a completed task; 412 when stale; 409 CHECKLIST_LIMIT_REACHED. Every change, including a checklist edit, raises the task version, which suppresses reminders reviewed earlier (`task_changed`); whether that is intended is **TBD** (Q18). |
| Dependencies | Space, Membership. |

### 22. Schedule

| Field | Contract |
| --- | --- |
| Entity | The time rule for when something should happen. A one-time rule is stored in its reminder (local time, timezone and exact instant). **Provisional ([DEC-010](DECISIONS.md#accepted-decisions))** a repeating rule is its own record, a reminder series (`reminder_series`), which keeps only its next time as a reminder and computes the rest. |
| Purpose | **CONFIRMED** Scheduling follows deterministic rules; AI may help but never decides timing (R9); agents can assist with scheduling (R8). |
| Owner | Module `scheduling`. |
| Scope | Built: one reminder, or one repeating series, for one person and one task. |
| Lifecycle | Built: one-time, fixed when the person accepts a previewed option. **Provisional (DEC-010)** a series is `active` until its last day, then `ended`. The person can pause and resume it; changing or closing the task pauses it; the person can cancel it; losing access, an inactive account or turning in-app reminders off stops it (`suppressed`). Skipping the next time is the only exception built; other exceptions and editing a saved series are **TBD** (C13-D04 PROPOSED; C13-D05 OPEN). |
| States | Built: a one-time rule follows its reminder (see Reminder). Series: `active, paused, cancelled, ended, suppressed`, with a reason when paused (`by_person`, `task_changed`, `task_closed`) or suppressed (`access_lost`, `account_inactive`, `preference_revoked`). |
| Relationships | Reminder; Task. A series belongs to one person and one task and has at most one scheduled reminder at a time. Events and care keep their own times and do not use it. |
| Permissions | As Reminder. |
| Privacy classification | Private (C11-C03); Sensitive (C11-C04) when it concerns health. |
| Events | As Reminder, plus `reminder_series.created`, `.paused`, `.resumed`, `.skipped`, `.cancelled`, `.ended` and `.suppressed` in `reminder_series_events` and the outbox. |
| Commands | Preview the possible instants for a local time; choose one. Preview a repeating rule (its first 10 times, how many there are and any clock changes); save it; pause; resume; skip the next time; cancel. |
| Queries | As Reminder; list and read my repeating reminders. The calendar shows their planned times, computed and not stored. |
| APIs | `POST /v1/reminders/preview`, `POST /v1/reminder-requests/preview`, `POST /v1/reminder-series/preview`, `POST /v1/reminder-series` (Idempotency-Key), `GET /v1/reminder-series`, `GET /v1/reminder-series/{series_id}`, and `POST /v1/reminder-series/{series_id}/pause`, `/resume`, `/skip` and `/cancel` (Idempotency-Key and If-Match). |
| Persistence | `reminders.local_time`, `timezone`, `scheduled_at`, `expires_at`. Series: `reminder_series` (the rule, status, versions), `reminder_series_events` and `reminder_series_commands` (command receipts); each stored time is a reminder with `series_id` and `occurrence_date`. |
| Retention | As Reminder. |
| Audit requirements | As Reminder. |
| Agent access | **TBD** (D4). **PROPOSED** agents may draft schedules while the deterministic scheduler runs them (C13-D13 PROPOSED). |
| Allowed agent actions | **TBD** (D4). Built, not connected: tool `reminders.schedule`, which needs approval of the exact reviewed time. |
| External side effects | None. |
| Validation rules | Built: local time to the minute; a named IANA timezone; in the future and within 366 days; a local time that does not exist is refused (422 LOCAL_TIME_NONEXISTENT); a local time that happens twice returns both instants for the person to choose; a preview is valid for 5 minutes. Series: a clock time `HH:MM`; every 1–30 days, or 1–7 different weekdays every 1–4 weeks; the first day from today to 366 days ahead; the last day at most 365 days after the first; at least one time left; at most 20 open and 100 kept series per account and one open series per task and person, never beside a scheduled one-time reminder for that task; at most 1,000 changes per series. |
| Invariants | Built: the stored instant is the one the person reviewed, kept with its local time and timezone. A series stores each time at most once (`series_id`, `occurrence_date`) and has at most one scheduled reminder. After downtime it delivers at most one late reminder, within 24 hours of its time and before the next time. |
| Failure modes | **CONFLICTING** events refuse a repeated local time and care takes the first, while one-time reminders let the person choose (conflict C6; Q13). Repeating reminders add a fourth behaviour: when the clock skips the time they remind just after the jump or skip that day, as the person chose, and a repeated time reminds once, the first time. Series: 409 SERIES_LIMIT_REACHED, REMINDER_ALREADY_SCHEDULED, SERIES_NOT_ACTIVE, SERIES_NOT_PAUSED, NOTHING_TO_SKIP, SERIES_ENDED, SERIES_COMMAND_LIMIT, TASK_CHANGED, TASK_CLOSED; 412 PRECONDITION_FAILED; 428 PRECONDITION_REQUIRED; 422 SERIES_DATES_INVALID, SERIES_EMPTY. |
| Dependencies | The timezone database; U-08, answered provisionally by DEC-010. |

### 23. Reminder

| Field | Contract |
| --- | --- |
| Entity | An in-app alert at an exact time, for one person, about one task. Tables `reminders` and `reminder_events`; reminder requests in `reminder_requests` and `reminder_request_events`. **Provisional (DEC-010)** a reminder can also be one time of a repeating series (see Schedule) or a snoozed follow-up of an earlier reminder (`follow_up_of`, `snooze_count`). |
| Purpose | Remind a person about a task without relying on any AI. A reminder request lets a task manager propose a reminder that the assignee must accept. |
| Owner | Module `scheduling`; the reminder worker delivers it. |
| Scope | One recipient; tied to one task in one Space. |
| Lifecycle | Built: previewed, then `scheduled`, then `available` when the worker creates the inbox entry, then acknowledged by the person. Otherwise it is `cancelled` by the person, `suppressed` (account inactive, access lost, reminders turned off, task closed or task changed), `expired` (missed its 24-hour catch-up window) or `failed` (after 5 delivery attempts). A request stays `pending` for up to 72 hours and never past the reminder time, then becomes `accepted` (creating the recipient's reminder), `declined`, `cancelled` by the sender, `expired` or `outdated`. **Provisional (DEC-010)** a series time that is skipped, paused or cancelled becomes `cancelled` with that reason, and resuming makes a paused future time `scheduled` again. Snoozing creates a follow-up reminder 10 minutes, 1 hour, 3 hours or 1 day later, at most three in a chain; acknowledging any reminder in the chain acknowledges the delivered ones and cancels a waiting follow-up. |
| States | Built: reminder `scheduled, available, cancelled, suppressed, expired, failed`; request `pending, accepted, declined, cancelled, expired, outdated`. Snooze is built provisionally (DEC-010); escalation stays **PROPOSED** (C13-D09 PROPOSED). |
| Relationships | Task, Space, the recipient's admission, the recipient's notification preference, one in-app Notification. |
| Permissions | Built: people schedule reminders only for themselves; task managers send requests only to the task's current assignee; only the recipient accepts or declines; the sender cancels. |
| Privacy classification | Private (C11-C03). |
| Events | `reminder.scheduled`, `reminder.cancelled`, `reminder.available`, `reminder.suppressed`, `reminder.expired`, `reminder.failed`, `reminder.skipped`, `reminder.resumed`, `reminder.snoozed`; `reminder_request.created`, `reminder_request.accepted`, `reminder_request.declined`, `reminder_request.cancelled`, `reminder_request.expired`, `reminder_request.outdated`; `notification.read`, `notification.acknowledge`. |
| Commands | Preview; schedule; cancel; snooze (from the inbox); preview and send a request; accept; decline; cancel a request. Series times are skipped or cancelled through their series. |
| Queries | List my reminders; list requests sent or received; review a request. |
| APIs | `POST /v1/reminders/preview`, `POST /v1/reminders` (Idempotency-Key), `GET /v1/reminders`, `POST /v1/reminders/{reminder_id}/cancel`, `POST /v1/reminder-requests/preview`, `POST /v1/reminder-requests` (Idempotency-Key), `GET /v1/reminder-requests`, `GET /v1/reminder-requests/{request_id}/review`, `POST /v1/reminder-requests/{request_id}/accept`, `POST /v1/reminder-requests/{request_id}/decline`, `POST /v1/reminder-requests/{request_id}/cancel`, `POST /v1/notifications/{notification_id}/snooze` (Idempotency-Key). |
| Persistence | The four tables above. |
| Retention | Built: kept. **TBD** (Q19). |
| Audit requirements | Built: `reminder_events` (by a person or by the scheduler) and `reminder_request_events`, plus outbox. |
| Agent access | **TBD** (D4). Built, not connected: tool `reminders.schedule`; the agent parser refuses reminders for other people. |
| Allowed agent actions | **TBD** (D4). **PROPOSED** confirmed personal reminders in the first release (P8). |
| External side effects | None: in-app only. Push, email and other channels are **TBD** (Q10). |
| Validation rules | Built: only for open or in-progress tasks; in-app reminders must be turned on; at most 500 reminders per account and 500 requests per sender and per recipient; one scheduled reminder per task and person; one pending request per task and recipient; time rules as in Schedule. |
| Invariants | Built: the delivery window ends after the scheduled time; only an `available` reminder can be acknowledged; an accepted request links exactly one reminder; nobody sends a request to themselves; acknowledging never completes the task; a task's due date never creates a reminder. A reminder has at most one follow-up, and `snooze_count` is 0 for a first reminder and 1–3 for follow-ups. |
| Failure modes | Built: 409 REMINDER_ALREADY_SCHEDULED, 409 REMINDER_LIMIT_REACHED, 409 TASK_CLOSED, 409 TASK_CHANGED, 409 REMINDERS_DISABLED, 422 LOCAL_TIME_NONEXISTENT, 422 REMINDER_TIME_INVALID, 409 RECIPIENT_UNAVAILABLE, 409 REMINDER_REQUEST_PENDING, 409 USE_SERIES_ACTIONS; snooze 409 ALREADY_SNOOZED, SNOOZE_LIMIT_REACHED, SNOOZE_TOO_LATE, SNOOZE_UNAVAILABLE. The worker retries delivery with growing delays, up to 5 attempts. |
| Dependencies | Task, Membership, Notification, the reminder worker. |

### 24. Event

| Field | Contract |
| --- | --- |
| Entity | A Space event: something planned for a time and place. Tables `space_events`, `space_event_responses`. Not to be confused with domain events, which are listed in each Events row. |
| Purpose | **CONFIRMED** Private Spaces contain events (R5). |
| Owner | Module `events`. |
| Scope | One Space; members see events from their admission onward. |
| Lifecycle | Built: created as `scheduled`, possibly edited (a time change asks earlier answers to confirm again), and possibly `cancelled`. Public events, capacity, waitlists, attendance, polls and budgets are **TBD** (U-17; D1; C17-D02 PROPOSED; C17-D03 OPEN). |
| States | Built: `status IN ('scheduled','cancelled')`; answers `going, maybe, not_going`, which record intent, not attendance. |
| Relationships | Space; the creator's admission; one answer per admission. |
| Permissions | Built: current members create events and answer; the Space owner, or the creator in the same admission, edits and cancels. |
| Privacy classification | Private (C11-C03). Built: titles and locations are not encrypted at rest. |
| Events | `event.created`, `event.updated`, `event.cancelled`, `event.attendee.updated`. |
| Commands | Create; edit; cancel; answer. |
| Queries | List a Space's upcoming or past events; read an event with its answers. |
| APIs | `POST /v1/spaces/{space_id}/events` (Idempotency-Key), `GET /v1/spaces/{space_id}/events`, `GET /v1/events/{event_id}`, `PATCH /v1/events/{event_id}` (If-Match), `POST /v1/events/{event_id}/cancel` (If-Match), `POST /v1/events/{event_id}/attendance`. |
| Persistence | `space_events`, `space_event_responses`. |
| Retention | Built: kept. **TBD** (Q19). |
| Audit requirements | Built: creating, editing and cancelling write `space_audit_events` plus outbox; answers write an outbox record only. |
| Agent access | **TBD** (D4). **PROPOSED** agents suggest and people confirm (C17-D11 PROPOSED). |
| Allowed agent actions | **TBD** (D4). |
| External side effects | None. Events create no reminders or calendar entries (U-17). |
| Validation rules | Built: title 1–120 characters; description up to 2,000; location up to 200; a named IANA timezone; the start is in the future and within 731 days; the end is after the start and at most 14 days later; at most 500 events and 100 upcoming events per Space; local times that do not exist or happen twice are refused. |
| Invariants | Built: cancelled events have a cancellation time; the end is after the start; the end's local time and instant are set together. |
| Failure modes | Built: 422 EVENT_IN_PAST, 422 EVENT_TOO_FAR, 422 EVENT_TOO_LONG, 422 EVENT_END_BEFORE_START, 422 LOCAL_TIME_SKIPPED, 422 LOCAL_TIME_REPEATED, 409 EVENT_LIMIT_REACHED, 412 EVENT_CHANGED. Since 2026-10-01 history compares admission order numbers (T02) and a change that waits for a lock checks the session again before saving (T04). |
| Dependencies | Space, Membership. |

### 25. Notification

| Field | Contract |
| --- | --- |
| Entity | Something that asks a person to look at the app. Built: in-app entries only. Tables `in_app_notifications`, `notification_preferences`. |
| Purpose | Bring due reminders to the person's attention. **CONFIRMED** agents support notifications (R8); what that allows is **TBD** (Q16). |
| Owner | Module `notifications`. |
| Scope | One account. |
| Lifecycle | Built: created when a reminder becomes available; then read; separately acknowledged, which does not complete the task. **Provisional (DEC-010)** it can be snoozed, which marks it read and schedules a follow-up reminder that arrives as a new notification. |
| States | Built: unread or read (`read_at`); acknowledgement is stored on the reminder (`acknowledged_at`). **PROPOSED** delivery states per channel, with in-app as the durable record (C20-D03 PROPOSED). |
| Relationships | One notification per Reminder; one preference record per account. |
| Permissions | Built: only the recipient lists, reads and acknowledges; only the account holder changes preferences. |
| Privacy classification | Private (C11-C03). |
| Events | `notification.read`, `notification.acknowledge`, recorded as reminder events. |
| Commands | Mark read; acknowledge; snooze; turn in-app reminders on or off. |
| Queries | List my notifications with the unread count; read my preferences. |
| APIs | `GET /v1/notifications`, `POST /v1/notifications/{notification_id}/read`, `POST /v1/notifications/{notification_id}/acknowledge`, `POST /v1/notifications/{notification_id}/snooze` (Idempotency-Key), `GET /v1/me/notification-preferences`, `PATCH /v1/me/notification-preferences` (If-Match). |
| Persistence | `in_app_notifications` (`read_at`); `notification_preferences` (`in_app_reminders_enabled`, `generation`). |
| Retention | Built: kept. **TBD** (C20-D14 OPEN; Q19). |
| Audit requirements | Built: reading and acknowledging write reminder events plus outbox. Auditing preference changes is **TBD** (U-06). |
| Agent access | **TBD** (D4; Q16). |
| Allowed agent actions | **TBD** (Q16). |
| External side effects | None. Push, email, SMS, WhatsApp and voice are **TBD** (Q10; C20-D04, C20-D05 and C20-D12, all OPEN) and not approved (S10). |
| Validation rules | Built: preferences change only with the current version. Snooze: 10, 60, 180 or 1440 minutes; only for an available, unacknowledged reminder of an open task, with reminders turned on, not already snoozed, fewer than three times, and ending before the next time of its series. |
| Invariants | Built: one notification per reminder; turning reminders off raises the preference generation, which suppresses reminders scheduled under the old setting (`preference_revoked`). |
| Failure modes | Built: 404 for another person's notification; 412 for stale preferences. |
| Dependencies | Reminder. Unread chat counts come from read positions (Conversation), not from notifications. |

### 26. Document

| Field | Contract |
| --- | --- |
| Entity | A text document added to a private Space. Built in a first form by [DEC-015](DECISIONS.md#accepted-decisions) (provisional, made under the owner's delegation in DEC-016). |
| Purpose | **CONFIRMED** Private Spaces contain documents (R5); documents and other authorized data can be ingested, parsed, chunked, indexed and retrieved (R10), within Space, membership, permission and privacy boundaries (R11). |
| Owner | Module `files` (`backend/app/modules/files`); search in module `discovery`. |
| Scope | One Space. **PROVISIONAL** (DEC-015): seen by the Space's current members who were already members when it was added, the history rule of chat and events (D3 unchanged). Q6 (other shared resources) stays open. |
| Lifecycle | **PROVISIONAL** added (validated, split into passages and indexed in the same transaction), then deleted. Never changes after it is added; a corrected copy is a new document. **PROPOSED** for other formats: uploaded, virus-scanned and quarantined, processed, then ready (C14-D01, C14-D02 and C14-D04). |
| States | `active`, `deleted`. |
| Relationships | Space; the account that added it, with its admission; passages (`space_document_chunks`), each with its line numbers and character offsets; Space audit records. |
| Permissions | Any current member adds; the person who added it under the same admission, or the Space owner, deletes; every read, list and search checks current active membership of an active Space and the history rule (C14-D09 applied without a model). |
| Privacy classification | Private (C11-C03); Sensitive (C11-C04) for personal documents. |
| Events | Space audit and outbox: `document.added`, `document.deleted`. |
| Commands | Add (`POST /v1/spaces/{space_id}/documents`, `Idempotency-Key` required); delete (`POST /v1/documents/{document_id}/delete`). |
| Queries | List (`GET /v1/spaces/{space_id}/documents`, newest first, bound cursor); read with text (`GET /v1/documents/{document_id}`); search inside your Spaces (`GET /v1/search`), which also covers tasks and events. |
| APIs | The five above, all requiring sign-in. |
| Persistence | PostgreSQL `space_documents` and `space_document_chunks` (text plus a generated `simple` full-text vector with a GIN index), migration `0024`. No object storage or embeddings (P17 PROPOSED; Q17). |
| Retention | Kept until deleted. Deletion removes the name, type, size, line count, digest, text and passages at once and replaces the creation fingerprint; the row keeps who added and who deleted it and when. Backups follow the database (C14-D13 OPEN). |
| Audit requirements | A Space audit record for each add and delete, without content. |
| Agent access | **TBD** (D4). Search returns cited passages the agent could use; not connected. **PROPOSED** answers cite the exact authorized source they used (C14-D12). |
| Allowed agent actions | None yet. |
| External side effects | None. Embedding and model providers not approved (C14-D08 OPEN; Q17; S10). |
| Validation rules | `.txt`, `.md`, `.markdown`, `.csv`; valid UTF-8; no control characters except tab and line feed, no text-direction overrides or isolates; 1 byte to 512 KB after line breaks become LF; name 1–120 characters without folders; 200 documents and 20 MB per Space. Other formats wait for a scanning decision (C14-D03 answered provisionally for text only). |
| Invariants | A deleted document never appears again in a list, read or search. Search never returns an item the reader cannot open now. **PROPOSED** document text never becomes instructions and never grants tools ([AI policy](AI_POLICY.md)). |
| Failure modes | Unsupported type, invalid text, empty or too large: 422. Limit reached: 409. A retry with the same key returns the original, or only that it was deleted; a changed retry is 409 `IDEMPOTENCY_CONFLICT`. No access: 404, the same as missing. |
| Dependencies | Space, Membership, Task grants, Event; DEC-015; Q6, Q17. |

### 27. Memory

| Field | Contract |
| --- | --- |
| Entity | Information an agent keeps between conversations. Built under [DEC-012](DECISIONS.md#accepted-decisions) (**PROVISIONAL**, C11): the table `agent_memories` (migration `0023`). |
| Purpose | **CONFIRMED** Agents support memory (R8). |
| Owner | Module `agents`. The unconnected model ties each memory to one account. |
| Scope | Whether memory belongs to a person, a Space or an agent scope is **TBD** (U-16; D4). |
| Lifecycle | **PROPOSED** opt-in, and people can view, correct, delete or turn it off (P9). Creation, editing and purge rules are **TBD** (U-16; C12-D08 OPEN). |
| States | Built, not connected: kinds `preference` (with a key) and `note`. **TBD**. |
| Relationships | Built, not connected: an account and the agent run that created it. |
| Permissions | **TBD** (U-16). |
| Privacy classification | Private (C11-C03); Sensitive (C11-C04) when it concerns health. |
| Events | **TBD**. |
| Commands | **TBD**. |
| Queries | **TBD**. |
| APIs | **PROVISIONAL** (DEC-012): `GET /v1/agent-memories` and `DELETE /v1/agent-memories/{id}`, own memories only; saving happens only through an approved agent request. |
| Persistence | `agent_memories` (migration `0023`); at most 50 notes per account. |
| Retention | **TBD** (C12-D08 OPEN). |
| Audit requirements | **TBD**. |
| Agent access | **TBD** (D4). Built, not connected: tools `agent.memory.read` (read) and `agent.memory.save` (write, needs approval). |
| Allowed agent actions | **TBD** (D4). Built, not connected: the parser refuses to save passwords, PINs, account numbers and other financial or identity details. |
| External side effects | None. |
| Validation rules | Built, not connected: content 1–200 characters; a preference must have a key. |
| Invariants | Built, not connected: one preference per key per account. **PROPOSED** no automatic memory from private couple conversations, and care records stay separate from memory (Chapters 1 and 11). |
| Failure modes | **TBD**. |
| Dependencies | Agent, AgentRun; U-16. |

### 28. Agent

| Field | Contract |
| --- | --- |
| Entity | A software identity that works within an explicit scope. Not built: no agent identity exists in the database. |
| Purpose | **CONFIRMED** Agents have permissions, allowed tools, allowed resources and approval policies and are never automatically administrators (R7); they support conversations, task help, scheduling, notifications, memory and retrieval (R8); they assist without being the source of truth (R9). |
| Owner | Module `agents` and the reserved `agent/` runtime folder. **PROVISIONAL** built in this repository's `agents` module, not a separate workstream ([DEC-012](DECISIONS.md#accepted-decisions)). |
| Scope | See [AgentScope](#29-agentscope). |
| Lifecycle | **TBD** (U-15; C12-D02 OPEN). |
| States | **TBD** (U-15). |
| Relationships | **PROPOSED** configured per scope and delegated by a person; runs AgentRuns, calls AgentTools, requests AgentApprovals and reads Memory. |
| Permissions | See [AgentPermission](#30-agentpermission). |
| Privacy classification | Agent configuration Internal (C11-C02); the data it reads keeps its own class. |
| Events | **TBD**. |
| Commands | **TBD**. |
| Queries | **TBD**. |
| APIs | **PROVISIONAL** (DEC-012): the request, approval, memory and tool operations listed under AgentRun, AgentApproval and Memory. |
| Persistence | No agent identity table: the agent acts for the person using it, with their current permissions ([DEC-012](DECISIONS.md#accepted-decisions)). |
| Retention | **TBD**. |
| Audit requirements | **PROPOSED** every run, tool call and approval is recorded (Chapter 12 contract). |
| Agent access | Not applicable. |
| Allowed agent actions | **TBD** (D4). **PROPOSED** the first-release limits in P8. **PROVISIONAL** ([DEC-012](DECISIONS.md#accepted-decisions)): list tasks, create a task, complete a task, schedule the person's own one-time reminder, and save or list the person's memories; every change needs the person's approval of the exact action; the P8 limits are always refused. |
| External side effects | **PROPOSED** model provider calls (C12-D09 OPEN; Q17); not approved (S10). |
| Validation rules | **TBD**. |
| Invariants | **CONFIRMED** never automatically an administrator (R7) and never the source of truth (R9). **PROPOSED** one shared engine configured per scope, not a separately trained model or an always-running process per group (C12-D01 PROPOSED). |
| Failure modes | **TBD**. **PROPOSED** every manual feature keeps working without the agent (release plan, section 13). |
| Dependencies | D4, Q7, Q16, Q17; T16. |

### 29. AgentScope

| Field | Contract |
| --- | --- |
| Entity | The boundary an agent works within. Not built. |
| Purpose | **CONFIRMED** Every agent works within an explicit scope (R7). |
| Owner | Module `agents`. |
| Scope | **PROPOSED** personal, a Space (family, couple, solo or custom), or a page or event ([idea.md](../idea.md) section 24). Working across several Spaces is **TBD** (Product Understanding section 21). |
| Lifecycle | **TBD** (U-15). |
| States | **TBD** (U-15). |
| Relationships | **PROPOSED** decides which data, permissions and memory rules apply to an agent. Built, not connected: each agent run is bound to one Space, account, admission and session. |
| Permissions | **CONFIRMED** retrieval stays within Space, membership, permission and privacy boundaries (R11). |
| Privacy classification | Internal (C11-C02). |
| Events | **TBD**. |
| Commands | **TBD**. |
| Queries | **TBD**. |
| APIs | None. |
| Persistence | None. |
| Retention | **TBD**. |
| Audit requirements | **TBD**. |
| Agent access | Not applicable. |
| Allowed agent actions | Not applicable. |
| External side effects | None. |
| Validation rules | **TBD**. |
| Invariants | **PROPOSED** a model receives only the minimum authorized data, checked before it sees anything (C12-D07 PROPOSED); an agent in a couple Space is never a third partner (Chapters 1 and 3). |
| Failure modes | **TBD**. |
| Dependencies | Space, Membership; D4. |

### 30. AgentPermission

| Field | Contract |
| --- | --- |
| Entity | What a specific agent may do. Not built. |
| Purpose | **CONFIRMED** Agents have permissions and are never automatically administrators (R7). |
| Owner | Module `agents`. |
| Scope | One agent within one scope. |
| Lifecycle | **PROPOSED** granted by a person and revocable, with revocation stopping new work (Chapter 12 contract). **TBD** (U-15). |
| States | **TBD** (U-15). |
| Relationships | Agent, AgentScope, and the delegating person's Membership and Role. |
| Permissions | **PROPOSED** the overlap of the agent's grant and the delegating person's current permissions, checked when the agent acts; an agent never grants itself more (C11-D03 and C12-D03, both PROPOSED). |
| Privacy classification | Internal (C11-C02). |
| Events | **TBD**. |
| Commands | **TBD**. |
| Queries | **TBD**. |
| APIs | None. |
| Persistence | None. |
| Retention | **TBD**. |
| Audit requirements | **TBD**. |
| Agent access | Not applicable. |
| Allowed agent actions | Not applicable. |
| External side effects | None. |
| Validation rules | **TBD**. |
| Invariants | **PROPOSED** approval never makes a forbidden action allowed (C11-D03 PROPOSED). |
| Failure modes | **TBD**. |
| Dependencies | Permission, AgentScope; D4. |

### 31. AgentTool

| Field | Contract |
| --- | --- |
| Entity | An action an agent may call. Built under [DEC-012](DECISIONS.md#accepted-decisions) (**PROVISIONAL**, C11): seven tool definitions in `backend/app/modules/agents/tools.py`, under policy version `agent-policy-2026-10-01`. |
| Purpose | **CONFIRMED** Agents have allowed tools (R7). |
| Owner | Module `agents`. |
| Scope | Per agent scope. |
| Lifecycle | **PROPOSED** a typed, versioned registry, with no tools installed while running (C12-D04 PROPOSED). |
| States | Not applicable. |
| Relationships | AgentRun (tool calls); AgentApproval (write tools). |
| Permissions | **PROPOSED** tools call the same domain services people use, with the delegating person's current authority (C12-D04 PROPOSED). |
| Privacy classification | Internal (C11-C02). |
| Events | **TBD**. |
| Commands | Built, not connected: `tasks.create`, `tasks.complete`, `reminders.schedule` and `agent.memory.save` (write, medium risk, need approval). |
| Queries | Built, not connected: `family.members.list`, `family.tasks.list` and `agent.memory.read` (read, low risk, no approval). |
| APIs | **PROVISIONAL** (DEC-012): `GET /v1/agent-tools` lists the tools; tools run only inside agent requests. |
| Persistence | `agent_tool_calls` (migration `0023`): tool name and version, read or write, risk, succeeded or failed, input digest, result reference. |
| Retention | **TBD**. |
| Audit requirements | **PROPOSED** every tool call is logged (Chapter 12 contract). |
| Agent access | Not applicable. |
| Allowed agent actions | The first tool set is **TBD** (D4; Product Understanding section 23). |
| External side effects | None in the defined tools. |
| Validation rules | **PROPOSED** inputs are validated against each tool's schema (C12-D04 PROPOSED). |
| Invariants | Built, not connected: every write tool requires approval. |
| Failure modes | **TBD**. |
| Dependencies | The domain services it calls; AgentApproval. |

### 32. AgentRun

| Field | Contract |
| --- | --- |
| Entity | One piece of agent work started by a person's request. Built under [DEC-012](DECISIONS.md#accepted-decisions) (**PROVISIONAL**, C11): tables `agent_runs`, `agent_run_events` and `agent_tool_calls` (migration `0023`), with routes. |
| Purpose | Carry a request from start to a verified outcome. |
| Owner | Module `agents`. |
| Scope | Built, not connected: one Space, account, admission and session. |
| Lifecycle | Built, not connected: queued, running, possibly waiting for approval or for the person, verifying, then completed, failed, cancelled, timed out or expired. The canonical state model is **TBD** (C12-D02 OPEN). |
| States | Built, not connected: `queued, running, waiting_for_approval, waiting_for_user, verifying, completed, failed, cancelled, timed_out, expired`. |
| Relationships | Built, not connected: account, Space, session, run events, tool calls, one approval, memories. |
| Permissions | **TBD** (D4). |
| Privacy classification | Private (C11-C03); the request text may be Sensitive (C11-C04). |
| Events | Built, not connected: `agent_run_events` (sequence, type, summary). |
| Commands | **TBD**. |
| Queries | **TBD**. |
| APIs | **PROVISIONAL** (DEC-012): `POST /v1/agent-runs` (`Idempotency-Key`), `GET /v1/agent-runs?space_id=` (current admission only, newest first, at most 50 per page), `GET /v1/agent-runs/{id}`, `POST /v1/agent-runs/{id}/resume` and `/cancel`. |
| Persistence | `agent_runs`, `agent_run_events`, `agent_tool_calls` (migration `0023`); 100 requests per account per day; at most 4 questions per request. |
| Retention | **TBD**. |
| Audit requirements | **PROPOSED** run history is kept (Chapter 12 contract). |
| Agent access | Not applicable. |
| Allowed agent actions | Built, not connected: a rule-based parser with no model recognises remember, forget, help, greeting, list memory, create task, complete task and schedule reminder; it refuses health, external contact, reminders for other people, financial, membership, deletion and sensitive-memory requests. |
| External side effects | None; no model calls. |
| Validation rules | Built, not connected: request text 1–500 characters. |
| Invariants | Built, not connected: one run per account and request key; finished runs have a finish time; a run waiting for the person has exactly one open question. **PROPOSED** completion needs evidence (C12-D13 PROPOSED); run budgets are **TBD** (C12-D10 OPEN). |
| Failure modes | **TBD**. **PROPOSED** effect identity and retry rules (C12-D06 PROPOSED). |
| Dependencies | Agent, AgentTool, AgentApproval, Session; D4. |

### 33. AgentApproval

| Field | Contract |
| --- | --- |
| Entity | A person's decision on one exact agent action. Built under [DEC-012](DECISIONS.md#accepted-decisions) (**PROVISIONAL**, C11): the table `agent_approvals` (migration `0023`). |
| Purpose | **CONFIRMED** Agents have approval policies (R7). |
| Owner | Module `agents`. |
| Scope | One run and one action. |
| Lifecycle | Built, not connected: pending, then approved, rejected, expired, cancelled or superseded. |
| States | Built, not connected: `pending, approved, rejected, expired, cancelled, superseded`. |
| Relationships | Built, not connected: one approval per run; the tool name and version; the person, Space and admission. |
| Permissions | **PROPOSED** only an eligible person decides, and an agent never approves its own action (C12-D05 PROPOSED). |
| Privacy classification | Private (C11-C03). |
| Events | **TBD**. |
| Commands | **TBD**. |
| Queries | **TBD**. |
| APIs | **PROVISIONAL** (DEC-012): `POST /v1/agent-approvals/{id}/approve` (`If-Match` and `Idempotency-Key`) and `/reject` (`If-Match`); approvals expire after 15 minutes. |
| Persistence | `agent_approvals` (migration `0023`): one per request, unique effect key. |
| Retention | **TBD**. |
| Audit requirements | **PROPOSED** approval history is kept (Chapter 12 contract). |
| Agent access | Not applicable. |
| Allowed agent actions | **PROPOSED** request an approval, never decide one (C12-D05 PROPOSED). |
| External side effects | None. |
| Validation rules | Built, not connected: stores the exact payload and its digest, the tool version, and an expiry later than its creation. |
| Invariants | Built, not connected: an approved action has a result reference; one effect key per approval. **PROPOSED** re-checked when the action runs, and approval never makes a forbidden action allowed (C11-D03 and C12-D05, both PROPOSED). Whether approvals need a recent sign-in is **TBD** (U-15); **PROVISIONAL** no, any current session of the person may approve ([DEC-012](DECISIONS.md#accepted-decisions)). |
| Failure modes | **TBD**. |
| Dependencies | AgentRun, AgentTool. |

### 34. AuditLog

| Field | Contract |
| --- | --- |
| Entity | The permanent record of who changed what. Built as seven audit tables: `identity_security_events`, `space_audit_events`, `task_audit_events`, `reminder_events`, `reminder_request_events`, `community_audit_events` and `care_audit_events`; plus `domain_outbox` for follow-up work. |
| Purpose | **CONFIRMED** Strong auditability (R12). |
| Owner | Each module writes its own. |
| Scope | Per account, Space, task, reminder, page or care instruction. |
| Lifecycle | Built: written with each change (S5) and never changed or deleted. |
| States | None. |
| Relationships | The actor (a User) and the target entity; the outbox row with the same ID. |
| Permissions | Built: account holders list their own security events; no route exposes other audit rows. Who else may read audit records is **TBD** (U-06). |
| Privacy classification | Private (C11-C03); Sensitive (C11-C04) for care audit rows. |
| Events | Every outbox event type listed in this contract. |
| Commands | None; written only as part of other changes. |
| Queries | List own security events. |
| APIs | `GET /v1/me/security-events`. |
| Persistence | The seven tables above and `domain_outbox` (event type, actor, aggregate, schema version). |
| Retention | Built: kept indefinitely. **TBD** (C11-D14 OPEN; C6-D10 OPEN; Q19). |
| Audit requirements | Built coverage. Audited: accounts, sessions, profiles, Spaces, memberships, invitations, ownership, conversation creation, message deletion, tasks and checklists, reminders and reminder requests, notification read and acknowledge, pages, posts, comment removals, event creation, editing and cancellation, and care. Outbox record only: message sends, comment creation and self-deletion, event answers, reports. No record: follows, likes, saves, blocks. Which actions must be audited is **TBD** (U-06; C11-D11 PROPOSED). |
| Agent access | **TBD** (D4). |
| Allowed agent actions | None. |
| External side effects | None; nothing reads the outbox yet. |
| Validation rules | Not applicable. |
| Invariants | Built: an audit row and its outbox row share an ID and commit with the change. |
| Failure modes | Built: if the audit or outbox row cannot be written, the change fails with it. |
| Dependencies | Every module. |

## Supporting Records

Records that belong to an entity above rather than standing alone.

| Record | Covered under |
| --- | --- |
| Account export (`account_exports`) | [User](#1-user) |
| Sign-in code, mail job, rate-limit counter | [Identity](#2-identity) |
| Ownership offer (`space_ownership_transfers`) | [Membership](#7-membership) |
| Space settings and membership commands | [Space](#6-space), [Membership](#7-membership) |
| Task access, checklist item, task command, calendar agenda (computed, not stored) | [Task](#21-task) |
| Reminder request | [Reminder](#23-reminder) |
| Save (`public_saved_posts`) | [Reaction](#18-reaction) |
| Read position (`conversation_read_states`) | [Conversation](#19-conversation) |
| Event answer (`space_event_responses`) | [Event](#24-event) |
| Notification preference | [Notification](#25-notification) |
| Outbox record (`domain_outbox`) | [AuditLog](#34-auditlog) |
| Agent run event, agent tool call | [AgentRun](#32-agentrun), [AgentTool](#31-agenttool) |
| Care instruction and dose report (`care_*` tables) | Not given a contract: care is not an approved requirement (Q12), and its screens were built after implementation was paused (X1 in [TASKS.md](TASKS.md#work-outside-the-approved-scope)). As built, only the person described can create, stop and report; the source is `prescriber`, `pharmacist`, `package_label` or `self`; details are encrypted; a repeated local time takes the first occurrence and a skipped one moves forward (conflict C6). |

## Modules and Tables

Each backend module in `backend/app/modules/` owns its tables. Web features live in `web/src/features/<module>/` and Android features in `android/app/src/main/java/com/community/platform/feature/<module>/`.

| Module | Tables (as built) | Web | Android |
| --- | --- | --- | --- |
| identity | users, identity_challenges, account_sessions, identity_security_events, identity_mail_jobs, identity_rate_buckets, account_exports, domain_outbox | Yes | Yes |
| spaces | spaces, space_memberships, space_invitations, space_join_requests, space_ownership_transfers, space_membership_commands, space_settings_commands, space_audit_events | Yes | Yes |
| planning | tasks, task_access, task_checklist_items, task_commands, task_audit_events | Yes | Yes |
| scheduling | reminders, reminder_events, reminder_requests, reminder_request_events, reminder_series, reminder_series_events, reminder_series_commands | Yes | Yes |
| notifications | notification_preferences, in_app_notifications; and from the alerts work, waiting for the owner to keep or revert it ([X2](TASKS.md#work-outside-the-approved-scope), conflict C10): alert_settings, alert_dismissals, event_alerts, care_dose_alerts, reminder_backups | Yes | Yes |
| messaging | conversations, conversation_messages, conversation_read_states | Yes | Yes |
| community | public_pages, public_page_follows, public_posts, public_post_comments, public_post_reactions, public_saved_posts, content_reports, account_blocks, community_audit_events | Yes | Yes |
| events | space_events, space_event_responses | Yes | Yes |
| care | care_instructions, care_dose_reports, care_commands, care_audit_events | Yes; kept by [DEC-007](DECISIONS.md#accepted-decisions), not an approved requirement ([TASKS X1](TASKS.md#work-outside-the-approved-scope); Q12) | Yes; kept by DEC-007 (X1) |
| agents | agent_runs, agent_run_events, agent_approvals, agent_tool_calls, agent_memories (migration `0023`; **PROVISIONAL**, [DEC-012](DECISIONS.md#accepted-decisions), C11) | Written but not linked (T34) | No (T35) |
| files | space_documents, space_document_chunks (migration `0024`; **PROVISIONAL**, [DEC-015](DECISIONS.md#accepted-decisions), made under DEC-016) | Yes | Yes |
| platform | None (local restore drill helper) | — | — |
| discovery | None of its own: search inside your Spaces (`GET /v1/search`) reads tasks, events and documents (DEC-015) | Yes | Yes |
| integrations, realtime, safety | None; reserved folders | No | No |

On 2026-10-01 the code defines 60 tables: 53 through migration `0022`, the 5 agent tables in `0023` and the 2 document tables in `0024`; `0025` (couple Spaces) adds a database rule, not a table. `backend/tests/test_migrations.py` checks that the migrations create exactly the tables the code defines. The intended design for all data is in the [data contract](CHAPTER_06_DATA_CONTRACT.md).

## Domain Invariants

Rules that span several entities, in addition to S1–S12.

- **CONFIRMED** Workflows are deterministic; AI never decides state (R9).
- **CONFIRMED** Access and retrieval respect Space, membership, permission and privacy boundaries (R11).
- **PROPOSED** (built) Dates stay dates; timed items keep the local time, the timezone and the exact instant.
- **PROPOSED** (built for reminders) Sent, delivered, read, acknowledged and completed are separate facts.
- **PROPOSED** (built) Joining or rejoining a Space never unlocks items from before the current admission (D3).
- **CONFLICTING** Reminders, events and care each handle daylight-saving time differently (conflict C6; Q13).

## Unresolved Decisions

The open decisions this contract depends on. Only the product owner resolves them; each resolution is recorded in [DECISIONS.md](DECISIONS.md) and then reflected here.

### Product Decisions

Explained in [section 39 of the Product Understanding](PRODUCT_UNDERSTANDING.md#39-open-questions).

| ID | Entities affected |
| --- | --- |
| D1 | Space, Page, Membership, Event |
| D3 | Membership, Conversation, Message, Task, Event |
| D4 | Every agent entity, and every Agent access and Allowed agent actions row |
| D5 | Device |
| Q6 | Document |
| Q8 | Document, Memory, AgentScope |
| Q10 | Device, Notification, Reminder, Conversation |
| Q11 | Conversation, Message, Device |
| Q12 | Care records (Supporting Records) |
| Q13 | Schedule, Reminder, Event |
| Q14 | Report, User |
| Q15 | Profile, Comment |
| Q16 | Notification, Agent |
| Q17 | Agent, Document |
| Q18 | Task, Reminder |
| Q19 | Retention of every entity |

### Entity Decisions

| ID | Question | Entities | Related contract decisions |
| --- | --- | --- | --- |
| U-01 | How are accounts suspended, deactivated and deleted, and with what grace period? | User | C18-D09 PROPOSED; C18-D07 OPEN |
| U-02 | Can a person change their verified email or add a phone number, and how is that verified? | Identity | C18-D01 PROPOSED; C18-D04 OPEN |
| U-03 | Does Device become an entity (trusted devices, push addresses, encryption keys), and which module owns it? | Device | C19-D07 PROPOSED; C20-D04 OPEN |
| U-04 | Do explicit relationships between people exist, and what may they affect? | Relationship | C18-D10 OPEN |
| U-05 | Do blocks apply inside private Spaces and direct chats? | Block | C18-D10 OPEN; C2-D03 OPEN |
| U-06 | Which actions must write an audit record, including refused attempts and preference changes, and who may read audit records? | AuditLog, Permission, Block, Follow, Reaction, Report, Comment, Message, Notification | C11-D11 PROPOSED |
| U-07 | Which reaction types exist besides like? | Reaction | C2-D08 PROPOSED |
| U-08 | Does Schedule become a separate entity for recurring schedules and occurrences? Answered provisionally by [DEC-010](DECISIONS.md#accepted-decisions): a reminder series stores the rule and only its next time; awaiting the owner's review. | Schedule, Reminder | C13-D04 PROPOSED; C6-D07 OPEN |
| U-09 | Can Spaces be archived, deleted or change type? | Space | C3-D09 OPEN; C3-D08 PROPOSED |
| U-10 | How are pages archived, transferred and deleted, and do posts need review and revision history? | Page, Post | C2-D02, C2-D04 and C2-D06 PROPOSED; C2-D05 OPEN |
| U-11 | Can messages be edited, reacted to, carry attachments or be reported? | Message | C19-D10 and C19-D11 PROPOSED |
| U-12 | Can tasks be deleted or archived? | Task | None |
| U-13 | Are the built session values (8-hour lifetime, 20 active sessions, 15-minute recent sign-in) the policy? | Session | C18-D05 OPEN |
| U-14 | What is the moderation case model, and who reviews reports? | Report | Q14; C16-D02 PROPOSED; C16-D05 and C16-D06 OPEN |
| U-15 | What are the agent identity and lifecycle, how are permissions granted and revoked, and do approvals need a recent sign-in? Answered provisionally by [DEC-012](DECISIONS.md#accepted-decisions): the agent acts only for the person using it, with their current permissions, and any current session may approve; awaiting the owner's review. | Agent, AgentScope, AgentPermission, AgentApproval | D4; C12-D02 OPEN; C12-D03 and C12-D05 PROPOSED |
| U-16 | Who owns memory, and how is it created, edited and purged? | Memory | C12-D08 OPEN |
| U-17 | Can events be public, have capacity, recur, create reminders or appear in the calendar? | Event | D1; C17-D02 PROPOSED; C17-D03 OPEN |
| U-18 | Do profiles get handles, photos, a public profile and per-field visibility? | Profile | Q15; C18-D11 OPEN |
