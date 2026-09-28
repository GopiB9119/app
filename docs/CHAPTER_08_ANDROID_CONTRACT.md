# Chapter 8: Android Navigation, State and Experience Contract

Status: DRAFT FOR PRODUCT, ANDROID, DESIGN AND SECURITY REVIEW. This is a design handoff, not an Android project, compiled Kotlin, Figma prototype, screenshot audit or executed application test.

## 1. Scope and Source Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity contract](CHAPTER_18_IDENTITY_CONTRACT.md), [Space contract](CHAPTER_03_SPACE_CONTRACT.md), [data contract](CHAPTER_06_DATA_CONTRACT.md) and [API/realtime contract](CHAPTER_07_API_REALTIME_CONTRACT.md). It develops C1-T08 and C7-T09/C7-T12 into native Android workflows and ownership rules.

- [Chapter 8](../Chapter8.md) is the owning Android source. Preserve its architecture, navigation and acceptance requirements, while treating Kotlin snippets and suggested module names as illustrative rather than compiling code.
- M1 remains an ordinary synthetic family/task/one-time in-app-reminder workflow. Messaging, public community and controlled Agent capabilities retain their full-MVP milestones; health, external calls, advanced documents and other future capabilities are not silently added to M1.
- Keep the broader Android and core web product aligned through shared domain/API contracts, not shared native UI code. Chapter 9 owns the web implementation architecture.
- Product/provider/identity/encryption/policy choices from earlier drafts remain unresolved where marked. No original chapter or prior draft is changed; no application scaffold, SDK install, build, emulator, personal device, live push/provider or deployment is authorized here.
- All runtime, device, accessibility and performance acceptance scenarios are NOT RUN. Document checks establish source coverage and consistency only.

## 2. Exact Source Topic Coverage

All 39 numbered source topics are retained with their exact titles and line anchors.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C8-S01 | Purpose | [8.1](../Chapter8.md#L3) |
| C8-S02 | Android Architecture Decision | [8.2](../Chapter8.md#L65) |
| C8-S03 | Recommended Android Project Structure | [8.3](../Chapter8.md#L101) |
| C8-S04 | Dependency Direction | [8.4](../Chapter8.md#L184) |
| C8-S05 | Application Startup | [8.5](../Chapter8.md#L216) |
| C8-S06 | Navigation Architecture | [8.6](../Chapter8.md#L252) |
| C8-S07 | Navigation Security | [8.7](../Chapter8.md#L320) |
| C8-S08 | UI State Model | [8.8](../Chapter8.md#L346) |
| C8-S09 | ViewModel Responsibilities | [8.9](../Chapter8.md#L397) |
| C8-S10 | Compose Screen Pattern | [8.10](../Chapter8.md#L453) |
| C8-S11 | Design System | [8.11](../Chapter8.md#L514) |
| C8-S12 | Main Home Screen | [8.12](../Chapter8.md#L557) |
| C8-S13 | Discovery Screen | [8.13](../Chapter8.md#L586) |
| C8-S14 | Space Overview Screen | [8.14](../Chapter8.md#L647) |
| C8-S15 | Family and Custom Space Screens | [8.15](../Chapter8.md#L677) |
| C8-S16 | Chat Screen Architecture | [8.16](../Chapter8.md#L720) |
| C8-S17 | Local Message Database | [8.17](../Chapter8.md#L769) |
| C8-S18 | Sending a Message Offline | [8.18](../Chapter8.md#L833) |
| C8-S19 | WebSocket Manager | [8.19](../Chapter8.md#L870) |
| C8-S20 | Realtime Event Handling | [8.20](../Chapter8.md#L904) |
| C8-S21 | Offline-First Repository | [8.21](../Chapter8.md#L940) |
| C8-S22 | Android WorkManager | [8.22](../Chapter8.md#L989) |
| C8-S23 | Agent Screen Architecture | [8.23](../Chapter8.md#L1042) |
| C8-S24 | Agent UI State | [8.24](../Chapter8.md#L1085) |
| C8-S25 | Agent Approval Screen | [8.25](../Chapter8.md#L1128) |
| C8-S26 | Memory Management Screen | [8.26](../Chapter8.md#L1176) |
| C8-S27 | File Upload UI | [8.27](../Chapter8.md#L1219) |
| C8-S28 | Permissions and Consent UI | [8.28](../Chapter8.md#L1252) |
| C8-S29 | Notification Architecture | [8.29](../Chapter8.md#L1286) |
| C8-S30 | Android Security | [8.30](../Chapter8.md#L1324) |
| C8-S31 | Local Database Security | [8.31](../Chapter8.md#L1360) |
| C8-S32 | Compose Performance | [8.32](../Chapter8.md#L1390) |
| C8-S33 | Error Handling | [8.33](../Chapter8.md#L1428) |
| C8-S34 | Accessibility | [8.34](../Chapter8.md#L1472) |
| C8-S35 | Localization | [8.35](../Chapter8.md#L1506) |
| C8-S36 | Analytics and Privacy | [8.36](../Chapter8.md#L1532) |
| C8-S37 | Testing Android Screens | [8.37](../Chapter8.md#L1563) |
| C8-S38 | Android Data Flow Summary | [8.38](../Chapter8.md#L1643) |
| C8-S39 | Final Android Architecture Decision | [8.39](../Chapter8.md#L1677) |

## 3. Exact Source Acceptance Ledger

All 18 criteria from [Chapter 8 Acceptance Criteria](../Chapter8.md#L1727) are retained verbatim. Every criterion currently has status NOT RUN; planned tests are not executed evidence.

| ID | Source acceptance criterion |
| --- | --- |
| C8-A01 | Screens do not directly call network or database code. |
| C8-A02 | ViewModels expose explicit UI states. |
| C8-A03 | Navigation passes stable IDs rather than large objects. |
| C8-A04 | Backend permissions are always re-checked. |
| C8-A05 | Chat works with temporary network loss. |
| C8-A06 | Pending messages survive app closure. |
| C8-A07 | WebSocket reconnection restores subscriptions. |
| C8-A08 | Missed events can be synchronized. |
| C8-A09 | Room is the local source for rendered cached data. |
| C8-A10 | WorkManager handles durable retries. |
| C8-A11 | Agent approvals display exact action details. |
| C8-A12 | Sensitive notifications do not expose private content by default. |
| C8-A13 | Files display processing status. |
| C8-A14 | Users can inspect and delete memory. |
| C8-A15 | Accessibility and localization are built into the design system. |
| C8-A16 | Security-sensitive data is not written to ordinary logs. |
| C8-A17 | Compose lists use stable keys and pagination. |
| C8-A18 | UI tests cover loading, success, empty, error, and offline states. |

## 4. Source Architecture Decisions

The ten category titles and anchors from section 8.39 are retained. The interpretation column explains their effect; it is not a verbatim replacement for the source.

| ID | Source decision category | Source reference | Contract interpretation |
| --- | --- | --- | --- |
| C8-R01 | UI | [decision](../Chapter8.md#L1679) | Compose and reusable design components; no service calls from visual content. |
| C8-R02 | State | [decision](../Chapter8.md#L1683) | ViewModel/StateFlow with lifecycle-aware observation and explicit operation outcomes. |
| C8-R03 | Local persistence | [decision](../Chapter8.md#L1687) | Room owns rendered cached records, permitted pending operations and sync positions. |
| C8-R04 | Networking | [decision](../Chapter8.md#L1691) | One chosen typed REST client and managed realtime connection implementation, not competing networking stacks per feature. |
| C8-R05 | Background work | [decision](../Chapter8.md#L1695) | WorkManager handles eligible durable retries/sync; it is not an exact reminder clock or unrestricted background Agent. |
| C8-R06 | Architecture | [decision](../Chapter8.md#L1699) | Route/UI -> ViewModel -> use case/repository interface -> local/remote adapters at runtime, with dependency inversion. |
| C8-R07 | Realtime | [decision](../Chapter8.md#L1711) | One application-managed connection per active account context; events pass through repositories and Room. |
| C8-R08 | Offline-first | [decision](../Chapter8.md#L1715) | Render allowed cache, persist only eligible queued writes and reconcile canonical server state; sensitive actions are not blindly queued. |
| C8-R09 | Security | [decision](../Chapter8.md#L1719) | Keystore-backed protection, reviewed local encryption/token handling and explicit sensitive-action consent. |
| C8-R10 | Agent integration | [decision](../Chapter8.md#L1723) | Backend Agent APIs/events only; no unrestricted provider credentials or autonomous scheduling engine inside the app. |

The source's dependency arrow is conceptual. Domain repository interfaces must not import concrete Room/Retrofit implementations to make that drawing literal. Its SpaceRoute example refers to state/retry members not declared by the preceding ViewModel snippet; it demonstrates separation, not a compiling implementation to copy unchanged.

## 5. Exact Navigation Inventory

All 30 leaf destinations in [section 8.6](../Chapter8.md#L252) are retained, including repeated labels in different graphs. This is a navigation inventory, not a complete screen implementation or an authorization map. Detail/editor/confirmation screens needed by a workflow are specified later as additions.

| ID | Source graph | Source destination |
| --- | --- | --- |
| C8-N01 | Auth | Welcome |
| C8-N02 | Auth | Login |
| C8-N03 | Auth | Register |
| C8-N04 | Auth | Verification |
| C8-N05 | Main | Home |
| C8-N06 | Main | Discover |
| C8-N07 | Main | Spaces |
| C8-N08 | Main | Messages |
| C8-N09 | Main | Profile |
| C8-N10 | Space | Overview |
| C8-N11 | Space | Members |
| C8-N12 | Space | Posts |
| C8-N13 | Space | Chat |
| C8-N14 | Space | Tasks |
| C8-N15 | Space | Events |
| C8-N16 | Space | Reminders |
| C8-N17 | Space | Files |
| C8-N18 | Space | Agent |
| C8-N19 | Space | Settings |
| C8-N20 | Agent | Agent Home |
| C8-N21 | Agent | Conversation |
| C8-N22 | Agent | Run Details |
| C8-N23 | Agent | Approvals |
| C8-N24 | Agent | Memory |
| C8-N25 | Settings | Account |
| C8-N26 | Settings | Privacy |
| C8-N27 | Settings | Security |
| C8-N28 | Settings | Notifications |
| C8-N29 | Settings | Connected Services |
| C8-N30 | Settings | Data Export/Delete |

## 6. Decisions and Scope Gates

All choices below are proposals or open gates, not approvals of the earlier release/identity/data/API decisions.

| ID | Choice | Proposed direction or unresolved policy | Status |
| --- | --- | --- | --- |
| C8-D01 | Supported Android/device matrix | Select minimum/target/compile SDK, supported form factors, API/dependency versions and managed-device test matrix before scaffolding. No cached historical toolchain is presumed current or approved. | OPEN |
| C8-D02 | Code organization and injection | Start one application with feature packages, explicit domain interfaces and Hilt-managed adapters; extract Gradle modules only for real ownership/build benefits. Avoid a use-case class per trivial getter without added coordination. | PROPOSED |
| C8-D03 | REST/realtime libraries | Use the requested Retrofit/OkHttp baseline with chosen compatible Kotlin serialization and lifecycle/Room/WorkManager libraries. Source Ktor is an alternative, not a second client to install. | PROPOSED |
| C8-D04 | Navigation and return destinations | One host with nested graphs, stable typed IDs, account/scope-aware route ownership and allowlisted deferred deep links. Select the supported Navigation library/version during implementation. | PROPOSED |
| C8-D05 | Local authority and encryption | Define per-data-class caching, encryption/key loss, offline viewing window, device backup/transfer, screenshots and purge policies. Room does not encrypt automatically; Keystore alone does not encrypt every database value. | OPEN |
| C8-D06 | Offline command allowlist | Queue only reviewed ordinary operations with stable IDs, expected versions and bounded reconciliation. Joining, role/ownership changes, consent, Agent approvals and destructive/external/sensitive actions require online confirmation. | PROPOSED |
| C8-D07 | UI and operation state | Use explicit resource/access state plus bounded per-operation progress; distinguish local draft, saved, pending server work, delivered and acknowledged. Avoid contradictory screen-wide booleans or provider-completion guesses. | PROPOSED |
| C8-D08 | Realtime/local sync consistency | Reuse the proposed Chapter 7 scoped streams and snapshot barrier; Room applies records/tombstones and cursor atomically. Event schemas and physical journal policy remain unapproved dependencies. | PROPOSED |
| C8-D09 | Reminder and push delivery | M1 durable in-app history is not background push or an exact alarm. Choose approved push channels, permissions and time-sensitive behavior separately; the backend scheduler works without an LLM/app process. | OPEN |
| C8-D10 | Shared visual system | Use a restrained, accessible operational layout, common components/tokens and explicit private/shared context. Typography, palette and layouts below are proposals, not a completed Figma file or approved brand. | PROPOSED |
| C8-D11 | Accessibility and locale support | Design and test English/Telugu/Hindi, RTL behavior where relevant, large text, TalkBack, touch/keyboard navigation and temporal/currency formatting. Exact locale launch matrix and reviewed translations remain open. | OPEN |
| C8-D12 | File and media handling | Use system pickers and least required permissions, immutable upload identity and backend processing states; define URI lifetime, local encrypted staging, size/scan rules and cancellation before upload implementation. | OPEN |
| C8-D13 | Session/account switch and recovery | Isolate databases/cache/outbox/subscriptions by account context and revoke/cancel stale work. Preserve only permitted drafts; expired login does not silently redirect old account commands to a new principal. | PROPOSED |
| C8-D14 | Prototype, screenshots and release evidence | Produce actual mobile/tablet prototypes and native tests during authorized implementation. Device use, signing, store release, health workflows and provider access need their explicit gates. | OPEN |

This chapter specifies how approved backend behavior is presented and recovered on Android. Hiding a control or locally caching an access flag never replaces backend permission checks.

## 7. Runtime Ownership and Dependency Rules

Start with the source's feature packages and clear interfaces. No application files/modules are created here. The proposed Hilt composition root wires implementations; UI/domain code should not locate arbitrary global services or construct providers directly.

| Owner | Responsibility | Must not own |
| --- | --- | --- |
| Application/session coordinator | Trusted API environment, signed-in account/session generation, session restore/logout, account-scoped resource lifetime and safe startup. | All feature state or an unrestricted background socket/Agent loop. |
| Navigation layer | Typed destinations, graph/back stacks, deferred approved links and scope/account-bound route lifecycle. | Membership authority, full serialized records or raw long-lived invitation/session secrets in arguments. |
| Route composable | Obtain the correctly scoped ViewModel, collect state with lifecycle awareness, pass actions to stateless content and coordinate safe navigation. | Retrofit/Room/provider calls, repeated creation of repository flows or socket ownership. |
| Screen/content components | Render immutable UI models and emit user intent; own small presentation-only state where appropriate. | Business permissions, network retry policy, durable approvals or direct persistence. |
| ViewModel | Stable screen StateFlow, input/action reduction, repository observation, workflow use cases and bounded operation/navigation effects. | Activity/context leaks, shared global account data, database queries or raw network clients. |
| Domain use cases/interfaces | Reusable multi-step intent, validation/coordination and repository contracts. Add use cases when they provide real workflow value. | Concrete Android UI, Retrofit DTOs, Room entities, hidden policy overrides or a wrapper class per trivial value. |
| Data repositories | Map DTO/entities to domain, apply canonical results/events, coordinate Room/outbox/sync and propagate typed safe failures. | Treating cached roles as live backend permission, changing account identity on retry or exposing raw exceptions as screen copy. |
| Room/account storage | Permitted cached canonical records, drafts/commands, pending operations, histories and atomic sync cursor state. | Plaintext token/provider-secret vault or automatic authority over server data. |
| Networking/realtime adapters | Typed bounded HTTP, session-bound auth, one managed connection, schema validation and authorized subscription protocol. | Directly mutating each screen's message list or accepting an event's caller-supplied scope as authorization. |
| WorkManager/sync coordinator | Eligible durable retries and reconciliation with constraints, cancellation and current account/permission checks. | Exact-to-the-second scheduling, always-running LLM or silently confirming sensitive actions while offline. |
| Design/security/telemetry components | Common accessible visuals, classified storage/notification behavior and privacy-safe diagnostics. | Broad event-content logging, security decisions based only on hidden controls or unreviewed remote config. |

All operations carry an immutable client context: trusted environment/origin, account ID and relevant session/scope generation. A late response from a previous account or environment is rejected before it can enter the active database/UI. A generic interceptor must not attach the new account's credentials to an old account's queued command. Scoped cancellation, data-store isolation and response tagging work together; cancelling a coroutine alone does not recall a response already in flight.

### Client Invariants

| ID | Rule | Required behavior |
| --- | --- | --- |
| C8-K01 | Render through owned state and interfaces. | UI -> ViewModel -> domain/repository -> adapters, with stable observed flows. No direct service access from Composables. |
| C8-K02 | UI state cannot falsely imply success or access. | Explicit loading/content/access/freshness and operation states; queued, saved, unknown, delivered and acknowledged are distinct. |
| C8-K03 | Navigation carries identity references, not authority. | Validate routes/deep links, load permitted data and handle denial/expiry/deletion. IDs, local role flags and back stacks never grant access. |
| C8-K04 | Account/environment/session generations isolate work. | Credentials, Room namespaces, pending commands, subscriptions, notifications and stale callbacks cannot cross account or environment boundaries. |
| C8-K05 | Canonical cached state has one merge path. | REST, WS and background results pass through repositories into Room with stable identities, versions and scope checks, then flows render it. |
| C8-K06 | Offline work keeps stable logical identity. | Persist allowed pending command and local optimistic state together; retry/reconcile the same intent and do not assign a new key to escape an unknown result. |
| C8-K07 | Updates respect versions and user-reviewed intent. | Late older responses cannot overwrite newer canonical state; a conflict or changed approval needs explicit review, not invisible refetch-and-overwrite. |
| C8-K08 | Sync position and applied data commit together. | Validate/deduplicate events and atomically apply rows/tombstones/cursor. Unsupported critical events or lost snapshot barriers trigger safe recovery, not cursor advancement. |
| C8-K09 | Realtime is managed and bounded. | One account-context connection manager, authorized subscriptions, bounded backoff/buffers, lifecycle cleanup and REST recovery where needed. |
| C8-K10 | Background work respects Android and domain limits. | WorkManager retries/syncs eligible work with current authority. Backend scheduling is independent; process death, force-stop and notification restrictions are not hidden. |
| C8-K11 | Sensitive approvals are explicit online actions. | Show exact immutable action, audience/recipient, risk and expiry; verify current revision and authority, and disable stale/unsupported approvals. |
| C8-K12 | OS permission, preference and consent are distinct. | Declined optional permission preserves core workflows; no contacts/notification grant implicitly authorizes family, Agent or external-channel access. |
| C8-K13 | Media transfer and processing are distinct. | URI access, staging, upload, scan, extraction/indexing and ready states are honest, resumable and scoped; bytes uploaded are not a searchable document. |
| C8-K14 | Local sensitive data is deliberately protected. | Chosen encryption/key/backup/cache/notification/screenshot policies, no embedded provider secrets or ordinary sensitive logs, and truthful logout/offline limitations. |
| C8-K15 | Usable layout, accessibility and performance are built in. | Stable paginated keys, bounded main-thread work, scalable readable layouts, TalkBack/focus/touch/RTL support and meaningful status without color alone. |
| C8-K16 | Contracts and telemetry are versioned and privacy-safe. | Shared typed API/event semantics, safe errors and compatibility states; no raw private payloads in diagnostics or fake runtime/test evidence. |

## 8. Navigation and State Contract

### Graph Ownership and Entry

Use the source Auth/Main/Space/Agent/Settings structure through one navigation host with reviewed nested graphs. Keep each tab's back/scroll state only within its current account context. A private Space's Chat/Agent route and a personal Agent conversation may reuse components but must retain different typed context and audiences.

Proposed route identities carry small validated IDs such as account context, Space, conversation, task, event, run or approval ID. Do not pass a full member list, message body, permission object, serialized file or access token through a route. The backend and repository decide what that ID exposes now. Type-safe navigation depends on the selected supported library/version; this draft does not supply a compiling route implementation.

Deep links and notification intents are untrusted entry requests. Allowlist scheme/host/path and destination type; reject malformed, ambiguous or cross-environment targets. After login, re-resolve the intended target and actual identity before navigation. A pending invitation entry needs a protected short-lived handle or a reviewed handoff mechanism, not a raw token copied into navigation logs, SavedStateHandle or analytics. A GET/link preview never accepts an invitation.

Authentication, logout, account switch, role loss, expired membership, Space lock/archive and deleted targets have explicit transitions. On logout/account switch clear or replace protected back stacks and prevent Back from exposing the previous account. On target denial, remove private displayed content and return to a safe still-authorized parent with a concise reason. Restoration cannot reestablish stale access merely because Android restored a route or saved UI state.

### Resource and Operation State

Use an explicit resource gate and bounded orthogonal operation state rather than many independent booleans. A screen may show permitted cached content and a failed refresh, but cannot simultaneously show an access-denied private object and its readable body.

| State dimension | Proposed values or meaning | Rendering and transition rule |
| --- | --- | --- |
| Account/route gate | Restoring, needs authentication, allowed under current policy, access denied, unavailable/deleted. | Gate private content before binding its models; loss of authority clears the protected presentation and invalidates dependent work. |
| Content | Initial loading, empty, ready, recoverable load failure. | Empty means an authorized successful empty result, not network failure or filtered unauthorized data. |
| Freshness | Current server-confirmed, allowed stale cache, refreshing, offline with timestamp/policy limitation. | Offline cache is usable only within the approved privacy/window policy; it is not proof of current backend membership. |
| Local form | Pristine, edited, validating, save pending, saved, rejected or conflict. | Preserve eligible drafts/unsaved changes; associate save result with the exact submitted revision, not whatever the form now contains. |
| Command | Locally pending, sending, durably accepted, awaiting result, needs review/auth, terminal failure, cancelled or reconciled. | A timeout may be unknown; do not label it definitely unexecuted or enqueue new intent silently. |
| Domain outcome | For example task completed, reminder saved, message persisted, provider delivered or user acknowledged. | Derive from the authoritative specific record/event. Generic HTTP success or a socket frame does not prove all outcomes. |
| Navigation effect | A scope/account-bound effect after a verified transition. | Prevent duplicate navigation on recomposition/rotation; use durable state or handled-effect identity where restoration needs it. |

Each route obtains and exposes one stable ViewModel state stream per route/account identity. Collect with lifecycle-aware APIs, not a fresh `stateIn` flow on every recomposition. Structured concurrency cancels obsolete work; propagate CancellationException instead of converting it into a toast or a permanent failure. Room handles suspending query execution through its APIs; move blocking I/O and CPU-heavy parsing/crypto/image work to appropriate workers/dispatchers, never the main thread.

Store small non-sensitive selection/query/scroll references through appropriate saved-state mechanisms. Persist classified user drafts in reviewed account-scoped storage, not arbitrary SavedStateHandle bundles. Process recreation is not guaranteed for passwords, OTPs, decrypted private files or raw approval secrets; a secure restart/review path is preferable to silently retaining sensitive state.

## 9. User-Facing Workflow Contracts

The ten groups below cover each source navigation leaf once. Additional editor/detail/invitation/inbox screens are necessary workflow proposals, not extra source leaves or existing UI artifacts. Feature visibility comes from the approved release and current capability policy; unsupported features must not masquerade as working buttons or demo successes.

### C8-W01 Welcome, Authentication and Verification

Source destinations: C8-N01 through C8-N04.

Entry is a lightweight session restore or the specific trusted intent the user opened. Welcome leads directly to the approved sign-in/register choices, not a compulsory marketing/tutorial sequence. Choose only approved identity methods from Chapter 18; email-first and phone-linking recommendations remain proposals, not fixed product decisions.

Forms use localized field validation, password-manager/paste support, safe submission state, generic authentication errors, bounded resend status and clear purpose. Do not expose whether arbitrary phone/email accounts exist, echo secret values in errors, auto-accept a family invitation after phone entry or imply that provider message acceptance equals verification. Optional contacts/location permission denial must not block sign-in or normal usage.

While submitting, prevent duplicate local intent without making a retry unsafe. Preserve only permitted non-secret fields on rotation/restart. Expired proof, wrong purpose/account, provider outage and throttling are distinct actionable outcomes. After verification/sign-in, bind the new account context, restore only permitted data/subscriptions and review the deferred destination before opening it. Account recovery and changed-contact/security flows are additional screens under the identity/settings contract, not profile-field edits.

### C8-W02 Home, Discovery and Public Entry

Source destinations: C8-N05, C8-N06.

Home is a compact work-focused overview: independently loaded tasks, reminders, events, recent conversations, pending approvals and relevant community sections. One failed Agent or recommendation service cannot blank otherwise usable tasks. Cached section freshness and retry belong to that section; do not represent every failure as an empty list.

Discover searches/browses intentionally public pages/posts/events/topics with bounded pagination, query cancellation and current filters. Preserve scroll and show a non-disruptive new-content indicator rather than moving the feed under the user's finger. Report/block actions and current moderation state apply to delivered content. Private Space names, personal reminders, files, Agent memory and member relationships cannot appear as search suggestions or public cached results.

Public Page detail, post detail/comments, follows and composer are explicit additional destinations accessible from public entry. Page membership and following remain different. Readable media uses permitted actual page/post assets when available, with fixed dimensions and neutral loading/error placeholders; do not load an unauthorized original merely to make a preview look complete.

### C8-W03 Space List, Creation, Members and Settings

Source destinations: C8-N07, C8-N10, C8-N11, C8-N19.

Use one Space framework for family/couple/solo/custom/temporary configuration and current capabilities, not five copied navigation/data architectures. List only entitled Spaces, render explicit type/private context and safe member metadata, and expose allowed overview actions. A type or a feature flag alone cannot enable medical/budget/external powers or grant permission to a private sub-conversation.

Creation is an additional form with name, permitted type and optional description/media. Show saving, validation/conflict and canonical success; a duplicate tap retains one intent. Pending couple activation is not active two-person membership. A third human cannot be added by selecting Guest/Observer/Agent in the client.

Invite and invitation review are additional forms: intended account/contact, allowed role, generic delivery result, identity-bound preview and explicit accept/decline. If proposed organizer confirmation is adopted, show pending confirmation rather than pretending the member has joined. No private chat/files/roster before admission. Expired/revoked/used/wrong-account links, lost inviter authority and capacity races use safe backend errors.

Member role/removal/owner transfer and policy editors display only permitted controls, but all commands remain backend-authorized, versioned and online. Show affected Space, target and consequence before a sensitive change; never use a broad generic 'Save' to alter hidden role/security fields. Handle leaving, removed membership, archive, temporary expiry and rejoin without restoring old history/grants. Back/deep-link recovery returns to a permitted parent, not a stale member directory.

### C8-W04 Messages and Space Chat

Source destinations: C8-N08, C8-N13.

The conversation list shows only permitted previews/unread counts and explicit current connection/freshness state. Conversation detail is scoped to its real participants and encryption mode; an admin is not automatically a private conversation participant. An E2E badge is shown only when the selected verified mode supports it, not merely because a field stores ciphertext.

Chat comprises a restrained top bar/context, paged stable message list, bounded typing indication, composer, attachment draft and connection/pending states. Distinguish user, Agent and system messages. Keep a stable local render identity when a pending item receives its canonical server ID; avoid row disappearance/duplication or jumping scroll. Load older history through authorized cursors and do not expose removed/hidden messages through replies, counts, search or quoting.

For an eligible ordinary send, persist the local pending message and its logical command in one account-scoped transaction, render it, then submit through the shared repository. Event-before-HTTP-response and response-before-event both reconcile to one canonical record. A response timeout preserves a pending/unknown result for reconciliation, not a new message ID. Retry uses the same immutable intent; editing a message already in flight is a separately reviewed operation, not mutating the queued body under the same key.

Reply/edit/delete/read/attachment actions are specific and permission/version-aware. Read receipts indicate the declared user action/visibility rule; being online or receiving a stream frame does not mark every message read. Failed, restricted, expired-key-window and sign-in-required pending items have honest states and appropriate retry/review controls. Closure/process death retains committed pending data unless the user clears/uninstalls or policy deletes it; no promise of background execution while force-stopped.

### C8-W05 Tasks, Events, Reminders and Notification Inbox

Source destinations: C8-N14 through C8-N16.

Task list/detail/editor show title, permitted notes, due date or timed due instant, status and eligible assignee. Keep date-only and timed tasks distinct; derive display from stored values plus user locale, never parse localized strings as the durable API contract. Assignment/completion preserves expected version and current role/target eligibility. A removed assignee or stale edit needs review, not silent overwrite.

Event list/calendar/detail/editor separates title, location, participants/RSVPs and private notes according to backend projections. Public events and private organizer planning are different contexts; RSVP is not Space membership. Review timezone and effects on pending reminders for significant changes. Calendar view, recurrence and escalation are release choices, not automatically part of M1.

Reminder editor/review displays the exact one-time date/time, IANA timezone, intended recipient, channel and permitted source task/event. Show saving versus saved schedule versus due delivery versus acknowledgment separately. Cancelling a reminder stops future work at the server-defined boundary; a notification already in flight is not falsely recalled.

Notification inbox/detail and explicit acknowledgment are additional surfaces, distinct from notification preferences. M1 demonstrates durable in-app history on an open/reconnected app; it does not wake a closed app or prove push delivery. Recipient/current membership and object privacy are checked on opening and acknowledgment. Task/reminder retry, application restart, cancellation and permission loss are part of the workflow, not optional polish. No medicine identification, dosage advice or Agent health-record UI is added to this slice.

### C8-W06 Posts and Publication

Source destination: C8-N12.

Space posts and public Page posts may reuse presentation/composer components but keep separate typed context, audience and permission rules. Default visible destination must match the user's entry; switching destination/audience requires explicit review, not reusing a hidden last-selected public Page. Draft media retains its classified ownership and upload status.

Create/edit/publish use specific action labels, current role/version and the shared API command semantics. A saved draft is not a published post, and a completed file upload is not scanned approved media. Comments/reactions/follows and report/block actions use canonical state after reconciliation. Never submit an old private body or attachment to public publication because a deep link, restored form or stale Page role changed the surrounding screen.

### C8-W07 Agent Entry, Conversation and Run Details

Source destinations: C8-N18, C8-N20, C8-N21, C8-N22.

Show a clear personal versus selected Space/private-conversation context and permitted capabilities. The same account can have several contexts without combining them. Agent Home summarizes allowed runs/approvals/memory; Agent Conversation shows user/Agent messages, citations, actual tool progress, errors and cancellation. Advanced run details are optional inspection, not an internal graph the user must understand to finish a task.

Render queued, running, waiting for approval/tool/provider, completed, partially completed where supported, failed, cancelled and timed-out outcomes from the canonical contract. Do not generate progress percentages or 'Done' from a local animation, first token, HTTP 202 or disconnected socket. Preserve partial/unknown side effects and allow only a contract-safe retry. A removed Space or disabled delegation clears protected output and stops new local submissions without claiming to undo prior server effects.

The app calls the controlled backend Agent runtime. No model/provider credential is bundled in the APK, no independent local LLM timer keeps reminders alive, and no hidden Agent authority exists outside manual-domain permissions. Retrieved Markdown/links/citations are untrusted presentation data; use maintained bounded renderers, approved URL handling and permission-checked source opening, not executable HTML/commands or an unrestricted WebView.

### C8-W08 Approval and Memory Control

Source destinations: C8-N23, C8-N24.

An approval review shows who requested it, the exact action and affected context, all intended recipients, readable content/changes, sensitivity/risk, expiry and current revision. Long content can be inspected without truncating the meaning. Use action-specific Approve/Reject labels and the required explicit confirmation/re-authentication, not generic Continue. Do not recompute a different payload after the user reviewed it.

Approve online against the immutable approval/action ID and revision. While submitting, disable duplicate intent but handle unknown responses through the same logical operation. If the payload, recipients, authority, tool/policy or expiry changed, require a new review. Offline or stale approvals cannot auto-submit on reconnect. Prohibited MVP Agent actions remain absent/denied even when the source shows future WhatsApp examples.

Memory list/detail identifies personal/shared scope, actual source, allowed content, consent and expiry. View and delete are MVP obligations; richer editing/expiry controls follow the agreed scope. Deletion/revocation has pending and verified states, removes local/retrieval eligibility appropriately and does not leave copied sensitive text in an unrestricted screen cache. Shared-space membership is not permission to inspect every personal memory. Avoid representing medical/child/pregnancy information as non-sensitive simply because it concerns a family.

### C8-W09 File Selection, Upload and Processing

Source destination: C8-N17.

File list/detail/viewer/upload/progress/version/share screens are additions around the source Files entry. Use the appropriate system photo/document picker or narrowly scoped permission, never full address-book or all-storage access as a general prerequisite. A content URI is not a permanent filesystem path: retain a supported URI grant where appropriate or securely stage an authorized bounded copy under the selected retention policy. Handle provider grant loss, missing bytes, quotas, cancellation and cleanup.

Persist upload identity/version and safe resumable metadata without unneeded private contents in navigation or WorkManager input. Re-check session/Space authority before upload completion or retry. Background upload cannot use a new account's credentials for an old account's file; a late presigned upload must not overwrite an approved immutable version.

Display Selecting, Preparing, Uploading, Scanning, Processing, Extracting, Indexing, Ready, Rejected and Failed when applicable, plus an honest partial state when only some pages are ready. Progress bytes do not imply scan/index completion. Preview/citation/share/download access follows current source permission and version; loading a thumbnail cannot bypass malware quarantine or a private file's audience. No full-file decode, OCR or encryption work on the main thread.

### C8-W10 Profile, Preferences, Security and Data Rights

Source destinations: C8-N09, C8-N25 through C8-N30.

Profile and its editors show permitted name/handle/avatar/language/timezone and privacy preview; do not expose email/phone, exact location, private relationships or memberships by default. Handle changes and shared-resource visibility edits are confirmed server results, not optimistic authority changes.

Settings separate account recovery/contact proof, field privacy, devices/sessions, app lock/security, notification preferences, optional connected services and export/deletion. OS notification permission, endpoint verification, category preference and purpose-specific consent are separate states. Denying optional permission keeps core functions available and leaves a clear preference/status path; do not keep relaunching prompts or silently enable another channel.

Session revocation, account switch, deactivation, deletion and export require the owning assurance rules and online confirmation. Show affected resources, pending/partial/failed/completed stages and safe retries. Chapter 18's proposed immediate revocation at deletion request cannot be delayed by retaining a convenient logged-in screen. Grace cancellation uses the reviewed narrow recovery path, not restoring all prior sessions. Export downloads are scoped, expiring and protected; normal device storage sharing cannot silently make an archive public.

Connected services show only actually supported and approved integrations. Revoking a service or consent prevents later disallowed actions under server policy; already delivered external data cannot be erased by hiding a toggle. Data export/deletion and privacy controls remain full-MVP requirements, not future extras because they are under Settings.

## 10. Local Persistence, Sync and Background Contract

### C8-W11 Reconcile Local State and Recover Work

This cross-cutting workflow supports all destinations. Room is a local rendered-state store, not the backend's durable truth or an offline membership authority. Its entity and migration model must be designed separately from PostgreSQL while preserving canonical IDs, scope, versions and history rules.

| Local record | Required scope/identity | Persistence and reconciliation rule |
| --- | --- | --- |
| Cached resource/message | Trusted environment, account, resource scope, stable local row identity and optional canonical server ID/version. | Only approved cached fields; newer authorized server versions win. Do not overwrite newer WS state with a late older REST response. |
| Membership/capability projection | Account/Space/admission/policy generation and freshness. | Drives presentation hints only. Current backend checks still govern action, replay and sensitive display; denial invalidates the local protected projection. |
| Draft | Account, route/resource, local draft ID and classified content. | Persist only approved content with encryption/retention where needed. No token, raw approval secret or uncontrolled system-state bundle. |
| Pending command/outbox | Stable command ID, immutable intent/digest, intended account/environment/scope, expected version and reconciliation state. | Atomic with optimistic row; duplicate scheduling cannot create another logical command. Expired dedup window or policy conflict requires review. |
| Message identity mapping | Conversation, validated sender/logical client ID, stable local key and canonical message ID/order. | REST and WS can arrive in either order. Merge and rebind references transactionally; a source/global `clientMessageId` unique index is not sufficient account/conversation scoping. |
| Stream receipt/cursor | Account, authorized stream/generation, applied event IDs and resume token. | Commit cursor plus data/tombstones together; never advance on an unsupported/failed event or persist a cursor for data that was not applied. |
| Upload/processing reference | Account/Space/file version/upload session, permitted staged URI or file reference, retention and current state. | Reconcile authoritative scan/index status. No provider secret or large private binary in WorkManager Data or generic Room metadata. |

The source `OnConflictStrategy.REPLACE` example is illustrative. SQLite replacement can delete/reinsert a row and affect references; a Room Upsert annotation alone also does not define version-aware merge. Preserve local render identity, reply/attachment references, user draft state and newer canonical fields in a reviewed transaction. For own messages, require a safe server echo/mapping of the logical client ID or operation receipt to reconcile WS-before-response; do not guess matches from text/time.

### REST, Events and Snapshot Recovery

REST responses, realtime events and worker results enter the same repository reconciliation path with immutable account/environment generation. Validate DTO/event schema, scoped references, exact sequence precision and current applicable permissions before writing. Request cancellation or logout prevents stale results from being rebound to another account; transaction and lifecycle management must avoid reopening the old database after cleanup.

Implement the Chapter 7 consistent snapshot/replay barrier, not an unrelated REST fetch followed by socket subscription. Persist snapshot pages/events with their correct generation, deduplicate event IDs, compare object versions and apply tombstones. A policy/retention reset invalidates affected canonical cache and cursors without silently losing eligible unsent drafts or replaying forbidden commands. Unsupported critical schema requires the defined update/reset path; do not drop an unknown frame and acknowledge it as applied.

Database migrations are versioned and tested. Do not enable destructive Room migration fallback for user drafts or pending commands. Bounded server-rebuildable caches and irreplaceable local pending data need different recovery policies; corruption may require quarantining evidence, a safe resync and explicit user-visible limits rather than claiming everything was preserved.

### WorkManager and Connection Lifecycle

Use account/environment-scoped unique work and constraints for permitted command retry, upload/reconciliation, export polling and cleanup. The worker reads a protected command reference, acquires a bounded local claim and checks the current intended identity/policy, rather than accepting a raw user ID/body as authority. Parallel foreground sends and workers must share the same command reconciliation/claim path. A stale worker cannot finalize a newer claim or attach credentials from another account.

Classify retryable I/O/availability separately from invalid input, revoked access, changed intent, expired approval and permanent provider failure. Preserve unknown outcomes until the API receipt/status resolves them. Propagate cancellation, roll back/release claims appropriately and do not turn CancellationException into a user-visible failure. The source broad worker catch is not a complete cancellation policy.

WorkManager can persist scheduled work across supported process/device lifecycle interruptions, but execution timing is subject to Android constraints, force-stop and user/system settings. App data deletion/uninstall removes local state; force-stopped execution does not resume on a promised exact schedule. Retry upon permitted resumption/relaunch and reconcile with backend durable truth. Never use a permanent foreground service or a reconnect loop solely to keep chat/reminder timing alive without an approved platform need.

The backend scheduler owns reminder timing and continues without this app or an LLM process. Android background sync reconciles its state; push/local notification behavior is separately permission/platform constrained. An original login token expiring need not cancel a separately authorized server schedule, while account/Space/consent revocation must prevent disallowed new actions. No exact medical timing, emergency monitoring or background-call guarantee is made.

## 11. Design System and Accessibility Contract

This is a proposed native visual direction under C8-D10, not an approved brand or finished Figma file. Keep the experience quiet, legible and task-focused: unframed page sections and lists, restrained dividers, clear context, useful icons and limited emphasis for current actions. Do not make each section a floating card or nest cards inside cards. Family/couple/solo/custom reuse the same visual language; privacy and capability differences are functional, not four unrelated themes.

### Tokens and Layout

Use a reviewed Compose/Material component foundation with application tokens rather than per-screen hardcoded styles. Proposed Latin typography is Source Sans 3 with compatible Noto Sans Telugu/Devanagari coverage; font licensing, package size, fallback behavior and rendering must be verified before adoption. This replaces no existing shipped design system. Use sp typography that respects system font scaling and zero letter-spacing, not viewport-proportional fonts or shrinking text to force labels into boxes.

Proposed spacing follows a 4 dp base, with aligned compact/expanded content padding and clear separation of sections. Interactive controls target at least 48 dp touch areas. Cards for repeated items or genuinely framed content use at most 8 dp corner radius unless a subsequently approved design system requires otherwise. Lists, form sections and the primary task workflow remain unframed. Constrain avatars, thumbnails, icon buttons, status slots and toolbar tracks so loading/hover/label changes do not shift surrounding layout.

Use available window size and insets, not a hardcoded phone model: compact navigation bar, appropriate rail or list/detail adaptation for expanded screens, bounded readable content width and preserved selection/back behavior. Keyboard, cutouts, system bars and large text must not cover the composer or bottom actions. Expanded layouts can share one navigation/state model without opening two independent copies of the same private scope.

The following light-theme token pairs are proposed examples for normal text; minimum contrast is 4.5:1. Arithmetic contrast checks do not prove a rendered screen accessible. The base canvas may use restrained neutral `#F7F8FA`; semantic accent colors support meaning rather than dominate every surface. Dark/high-contrast variants need their own reviewed token pairs and native verification, not automatic color inversion.

| Role | Foreground | Background | Minimum ratio | Intended use |
| --- | --- | --- | --- | --- |
| Primary text | #202124 | #FFFFFF | 4.5 | Main task, conversation and form content. |
| Secondary text | #5F6368 | #FFFFFF | 4.5 | Supporting metadata that must remain readable. |
| Primary command | #FFFFFF | #0F766E | 4.5 | Selected primary command with clear action label. |
| Informational text | #1D4ED8 | #EFF6FF | 4.5 | Non-critical informational state. |
| Error text | #B42318 | #FEF3F2 | 4.5 | Failed validation or operation, with text/icon meaning. |
| Warning text | #854D0E | #FEF3C7 | 4.5 | Review-required or limited-state notice. |
| Success text | #166534 | #F0FDF4 | 4.5 | Confirmed outcome, not locally guessed success. |
| Canvas text | #202124 | #F7F8FA | 4.5 | Text on the neutral application canvas. |

### Source Component Inventory

All 16 common component names in [section 8.11](../Chapter8.md#L514) are retained. Behavior below is a proposed component contract, not existing composables.

| ID | Source component | Reuse and state contract |
| --- | --- | --- |
| C8-C01 | PrimaryButton | Clear command such as Save task or Approve message; fixed progress/label layout, enabled/loading/disabled semantics and duplicate-intent prevention. |
| C8-C02 | SecondaryButton | Secondary command, retry or cancel when appropriate; cancellation meaning matches the operation, not an assumed server undo. |
| C8-C03 | AppTopBar | Compact screen/context title, safe Back and permitted icon actions; handles large text, insets and private context without metadata overflow. |
| C8-C04 | BottomNavigationBar | Main graph destinations with familiar icons, concise labels, selected state and account-scoped back-stack behavior. |
| C8-C05 | SpaceCard | Repeated Space item with type/private context and only permitted metadata; no oversized hero or raw contact directory. |
| C8-C06 | PageCard | Repeated public-page preview with permitted real avatar/media and follow state distinct from membership. |
| C8-C07 | PostCard | Repeated post with stable identity/media aspect, publication/moderation state and safe permitted actions. |
| C8-C08 | MessageBubble | Sender/content/delivery state with accessible meaning and stable key through local-to-server reconciliation; no color-only status. |
| C8-C09 | AgentMessageCard | Scoped Agent response, safe citations and real action/progress references; no invented completion or exposed hidden reasoning. |
| C8-C10 | TaskRow | Scannable title/assignee/due/status with permitted completion control and pending/conflict state; no nested decorative cards. |
| C8-C11 | EventCard | Repeated event summary with timezone and only allowed location/participant details. |
| C8-C12 | ReminderCard | Saved/due/delivery/acknowledgment distinctions, recipient/timezone and permitted cancel or acknowledgment action. |
| C8-C13 | ApprovalCard | Exact reviewed action/recipient/scope/expiry, expansion for complete readable details and action-specific online confirmation. |
| C8-C14 | FileCard | Safe filename/type/version and upload/scan/process/partial/ready state; thumbnail access follows file policy. |
| C8-C15 | MemberAvatar | Fixed-dimension authorized avatar or accessible fallback; role/privacy information is not encoded solely by color. |
| C8-C16 | PermissionBadge | Concise readable permission/privacy state with icon/text semantics; it reports state and does not itself grant authority. |

Use familiar icon controls from the chosen maintained Android icon set for navigation, add, edit, search, attach, delete and retry, with accessible descriptions and tooltips/long-press help where appropriate. Use checkboxes/toggles for genuine binary preferences, radio/segmented/menu selection for mutually exclusive modes, and suitable date/time/numeric controls. An OS permission status cannot be turned on merely by animating a toggle; actual system/user result determines the displayed state.

Motion communicates verified state change and respects reduced-motion settings; never simulate Agent progress. Keep toolbar and button dimensions stable during progress, wrap meaningful labels and move controls into a vertical arrangement when text grows. Long approval/message content remains inspectable; an ellipsis cannot hide the material part of an approval. Public/Space media must be real permitted assets or clearly neutral placeholders, not fabricated member photos or misleading document previews. Asset provenance and authorization are part of the implementation review.

### Accessibility and Localization

Build semantic roles, labels, selected/expanded/progress/error states, focus traversal and bounded live announcements into reusable components. TalkBack users must reach every required command, understand whose message/action they are seeing and complete an approval or retry without color, gesture-only discovery or a tiny touch target. Preserve focus after paging/updates; incoming messages must not continuously steal focus or auto-scroll the user away from history. Group semantics deliberately rather than reading every decorative icon twice.

Support system font scale, long names/translations, display size, keyboard/switch input, reduced motion and relevant RTL/bidi behavior. Use plural/string resources and locale-aware number/date/time formatting, with canonical API dates/instants separate from displayed strings. English, Telugu and Hindi are source requirements; reviewed translations and font fallback must be tested, not replaced by hardcoded English in ViewModels. Do not reverse logical sequence/order or expose differently interpreted times because the layout is RTL.

Validate contrast for text and non-text controls, focus and disabled states on actual light/dark surfaces. Test at compact and expanded widths, large text including a proposed 200% stress case, landscape/keyboard and long mixed-script content. This test value is a proposed design gate, not a claim that all devices use the same text-scaling curve or that screenshots have been reviewed.

## 12. Local Security, Permissions and Notifications

### Storage and Account Boundary

Use the reviewed secure token/credential facility with Android Keystore-backed key custody where appropriate. Room and ordinary DataStore/preferences do not automatically encrypt every value; non-secret settings, encrypted tokens, classified cached content and E2E private keys need different storage policies. Do not put plaintext passwords, recovery codes, long-lived tokens, provider secrets or unrestricted Agent traces in the APK, Room metadata, preferences, backups, crash reports or logs.

Decide SQLCipher-compatible database encryption or equivalent protected local storage based on the actual data classes and supported versions. Plan key generation, wrapping, rotation, invalidation, backup exclusion and data recovery explicitly. If a key becomes unavailable, lock/quarantine affected data and offer the reviewed recovery/resync path; do not silently delete irreplaceable pending drafts or recreate an empty database while claiming recovery succeeded. Key loss may make E2E content unrecoverable even if account login is restored.

On logout/account switch, stop or isolate account-specific workers/subscriptions, prevent new writes by stale generations, close/drain appropriate storage operations and apply the approved cache/draft/key policy. Delete or lock classified data as promised and clear protected back stacks and related notifications. A best-effort client cleanup does not erase copies already made or prove forensic deletion from flash/OS backups. An offline app cannot know about an unseen remote revocation; define the maximum permitted offline exposure and require revalidation when policy demands it.

Use normal TLS certificate/hostname validation and a reviewed API-origin configuration. No trust-all certificates, disabled verification or arbitrary user/Agent-supplied backend origin. Certificate pinning, if considered, needs a deliberate rotation/recovery threat-model decision rather than a brittle default. Apply export/component/deep-link permissions narrowly; do not expose background receivers or intents simply to make a demo route work.

Screen/recent-task protection and app lock/biometrics may be required for selected sensitive views, under C8-D05. They do not replace server authorization, guarantee that a screenshot can never exist, or justify disabling accessibility. Local biometric unlock is not automatically a server-recognized fresh-auth proof for export, ownership transfer or approval; use the selected identity protocol and assurance requirement.

### OS Permissions and Intent Safety

Ask for permission at the relevant user action with the required purpose/scope explanation, not all permissions on first launch. Prefer scoped system pickers for files/media. Contacts, location, microphone/camera and notification permissions have separate feature needs and release gates; no microphone/call permission is necessary for the ordinary M1 reminder demo.

Treat denied, limited, revoked and permanently denied states honestly with a user-controlled settings path where relevant. App use continues for unrelated features. Platform permissions, remote access grants, recipient verification, notification preferences and consent histories must not be combined into one 'allow everything' toggle. Authority changes remain online reviewed backend operations.

Use explicit, appropriately protected intents and account/resource-bound PendingIntent identities so one user's notification cannot open another user's cached screen or overwrite an unrelated action. Use immutable PendingIntent behavior unless a supported feature genuinely needs a reviewed mutable path; do not infer intent authenticity from extras alone. Deep-link handlers validate the route and reload authorized context. Notification actions such as reply/acknowledge still require current identity, target and logical-command checks; unsupported offline-sensitive actions open a review screen instead of executing silently.

### Notification Truth and Timing

Backend in-app notification history is authoritative; push is a best-effort hint to synchronize/show permitted context, not an acknowledgment that a user saw or completed something. If the selected push SDK can display notifications automatically while the app is backgrounded, the server-built payload must already be appropriately redacted. Do not rely on app code always running before private content appears on the lock screen.

Define notification channels/categories, permission request behavior for supported Android versions, quiet-hour policy, user-disabled channels and duplicates. Keep initial previews minimal and fetch sensitive detail only after current authorization. Opening an old family notification after removal, account switch or deletion must not restore access. Logout/removal can clear relevant local notifications, but cannot retract information already seen.

M1 proves only durable in-app delivery/history and explicit acknowledgment. Push permission denial, Doze/background restrictions, force-stop, network loss and unavailable providers require honest limitations and recovery. WorkManager is not an exact alarm clock. Any future exact-alarm, foreground-service, voice or health timing feature needs separate platform/store-policy, permission, safety and reliability review; never request broad exceptions to make a claimed guarantee appear true.

### Privacy-Safe Errors and Telemetry

Map Chapter 7 machine codes into localized UI error models: field validation, expired session, access denied, conflict, throttled, network/dependency failure, unsupported schema and unknown outcome. Do not show raw exceptions, internal policy details, stack traces or private values echoed by a server/provider. Retry guidance depends on the logical operation; a message timeout and a failed search are not interchangeable.

Analytics records released behavior and safe outcome metadata, not message bodies, health data, contact books, exact locations, private file names/content, full prompts, keys or tokens. Pseudonymous identifiers are still protected data, not automatically anonymous. Audit logging, network interception, screenshots, database inspection, crash replay and performance traces must obey the same classification and retention boundaries. Debug builds must not silently enable unrestricted payload logging against real accounts.

## 13. Proposed Acceptance Evidence

All C8-V scenarios are proposed evidence families, currently NOT RUN. Source acceptance criteria remain exactly as listed in section 3. Full-source coverage is broader than M1; every deferred capability remains unverified rather than becoming a pretend completed screen.

| Check | Source topics | Source acceptance | Client rules | Workflows | Required evidence |
| --- | --- | --- | --- | --- | --- |
| C8-V01 | C8-S01, C8-S02, C8-S03, C8-S04, C8-S38, C8-S39 | C8-A01 | C8-K01, C8-K16 | C8-W01, C8-W11 | Actual dependency/architecture tests or reviewed build evidence show routes/screens cannot call network/Room/providers, domain interfaces avoid Android UI/adapters, and source example inconsistencies were not copied as compiling code. |
| C8-V02 | C8-S05 | C8-A02, C8-A18 | C8-K02, C8-K04, C8-K15 | C8-W01, C8-W02 | Cold/warm/process-recreated startup under migration/session/network failure renders a correct gate without blocking main-thread heavy work or exposing a previous account. Record actual startup/ANR evidence, not assumed emulator blame. |
| C8-V03 | C8-S08, C8-S09, C8-S10 | C8-A02, C8-A18 | C8-K01, C8-K02, C8-K05 | C8-W02, C8-W03 | ViewModel/state tests cover valid content/access/operation combinations and independent section failures; recomposition does not create new flows, duplicate requests or repeated navigation. |
| C8-V04 | C8-S06, C8-S07 | C8-A03, C8-A04 | C8-K03, C8-K04 | C8-W01, C8-W03, C8-W10 | Typed stable-ID navigation, malformed/untrusted links, wrong-account invites, locked/deleted/denied targets, Back and restored stacks enforce safe entry. No raw secrets or large records in args/saved bundles. |
| C8-V05 | C8-S05, C8-S07, C8-S30, C8-S31 | C8-A04, C8-A09, C8-A16 | C8-K04, C8-K05, C8-K14 | C8-W01, C8-W10, C8-W11 | Switch account/environment while HTTP, refresh, socket, upload and workers are in flight; old responses/credentials/notifications/outbox never enter the new context or reopen revoked data. |
| C8-V06 | C8-S12, C8-S13 | C8-A17, C8-A18 | C8-K02, C8-K05, C8-K15 | C8-W02 | Home sections load/fail independently; discovery cancellation, filters, stable paging/scroll, empty/error/offline results and private-data exclusion work against the real contract. |
| C8-V07 | C8-S14, C8-S15 | C8-A04, C8-A18 | C8-K03, C8-K07, C8-K12 | C8-W03 | Shared Space UI respects all released types/policies without duplicate architectures; stale role, couple limit, pending invitation, guest expiry and removal are enforced by actual backend integration, not just hidden controls. |
| C8-V08 | C8-S06, C8-S28, C8-S35 | C8-A04, C8-A15, C8-A16 | C8-K02, C8-K03, C8-K12 | C8-W01, C8-W10 | Selected auth/profile/security/consent flows handle invalid proof, throttling, expired sessions and optional-permission denial with localized safe copy and no contact enumeration/secret logging. |
| C8-V09 | C8-S16, C8-S32 | C8-A15, C8-A17 | C8-K02, C8-K05, C8-K15 | C8-W04 | Chat stable keys, composer/keyboard insets, history position, multiline/mixed-script messages and delivery indicators remain usable across pending-to-server ID reconciliation and pagination. |
| C8-V10 | C8-S17, C8-S18, C8-S21 | C8-A05, C8-A06, C8-A09 | C8-K05, C8-K06 | C8-W04, C8-W11 | Atomic local pending row+outbox survives ordinary closure/process restart/network loss. Inject failed local commit and duplicate send; no orphan row, lost eligible draft or duplicate logical message. |
| C8-V11 | C8-S17, C8-S20, C8-S21 | C8-A05, C8-A09, C8-A17 | C8-K05, C8-K06, C8-K07 | C8-W04, C8-W11 | Real Room tests cover WS-before-REST, REST-before-WS, late older response, duplicate canonical message and reply/attachment references without REPLACE-related loss or unstable render keys. |
| C8-V12 | C8-S18, C8-S22 | C8-A06, C8-A10 | C8-K04, C8-K06, C8-K10 | C8-W04, C8-W11 | WorkManager unique/scoped work, foreground-worker race, backoff/constraints, reboot/resumption and sign-in-required recovery preserve one intent. Force-stop/data-clear limits are explicitly tested or disclosed, not assumed away. |
| C8-V13 | C8-S19 | C8-A04, C8-A07 | C8-K03, C8-K04, C8-K09 | C8-W03, C8-W04, C8-W11 | One managed account-context socket, bounded reconnect/auth refresh and authorized restored subscriptions; membership loss and account change prevent subsequent protected dispatch/replay. |
| C8-V14 | C8-S20, C8-S38 | C8-A08, C8-A09 | C8-K05, C8-K08 | C8-W11 | Snapshot/live barrier, duplicated/out-of-order events and crash between row/cursor writes recover without lost changes or acknowledged-unapplied data. Validate actual Room transactions and served event semantics. |
| C8-V15 | C8-S19, C8-S20, C8-S33 | C8-A08, C8-A09, C8-A16 | C8-K08, C8-K09, C8-K16 | C8-W04, C8-W11 | Expired cursor, changed authorization generation, unsupported critical schema, large sequence and oversized/non-JSON failure trigger safe bounded reset/update paths, not global replay or leaked raw payloads. |
| C8-V16 | C8-S06, C8-S14, C8-S15, C8-S28 | C8-A02, C8-A04, C8-A18 | C8-K02, C8-K07, C8-K12 | C8-W05 | Task/assignment/event/reminder forms, review, timezone/date-only distinction, unsaved changes, conflicts/cancel and denied recipients align with backend state; due date does not imply external delivery. |
| C8-V17 | C8-S29 | C8-A04, C8-A12 | C8-K03, C8-K10, C8-K14 | C8-W05, C8-W10 | In-app inbox, notification permission/channel denial, redacted background payload, account-bound intent and removed-member deep links are verified. Delivery is not acknowledgment; M1 does not claim push or exact alarms. |
| C8-V18 | C8-S23, C8-S24 | C8-A02, C8-A18 | C8-K02, C8-K03, C8-K16 | C8-W07 | Agent context, actual queued/waiting/running/partial/failure/cancel outcomes and permission-checked citations remain truthful; no fake percentage, provider credential or hidden reasoning exposure. |
| C8-V19 | C8-S25 | C8-A04, C8-A11 | C8-K07, C8-K11, C8-K15 | C8-W08 | Full exact approval payload/recipients/scope/expiry is readable and accessible; changed revision, double tap, network uncertainty, offline, revoked authority or prohibited action cannot auto-approve. |
| C8-V20 | C8-S26 | C8-A04, C8-A14 | C8-K03, C8-K05, C8-K14 | C8-W08 | Memory source/scope and view/delete/consent flows match current authority, including source restriction and cached detail after deletion; editing/expiry enhancements are not falsely claimed as shipped. |
| C8-V21 | C8-S27 | C8-A13, C8-A18 | C8-K04, C8-K13, C8-K14 | C8-W09 | URI grant loss, bounded staging/upload recovery, account switch, scan rejection, partial extraction and indexing readiness are tested. Byte progress never implies searchable/safe, and private previews remain restricted. |
| C8-V22 | C8-S28 | C8-A04, C8-A15, C8-A18 | C8-K11, C8-K12 | C8-W01, C8-W09, C8-W10 | Denied/limited/revoked/permanently-denied OS permissions preserve unrelated workflows; toggles show true grant/consent state and do not secretly enable another external channel. |
| C8-V23 | C8-S30, C8-S31 | C8-A09, C8-A16 | C8-K04, C8-K14 | C8-W01, C8-W10, C8-W11 | Selected encryption, key loss/rotation, backup/transfer exclusion, app-lock/logout cleanup, TLS validation and classified cache policy have device-level evidence; Room/Keystore names alone are not encryption proof. |
| C8-V24 | C8-S09, C8-S22 | C8-A02, C8-A10 | C8-K01, C8-K04, C8-K10 | C8-W04, C8-W11 | Structured cancellation during preparation/write/refresh/worker claim does not become a false UI failure, leak resources or commit work under a switched account. Reconcile any already committed server effect honestly. |
| C8-V25 | C8-S33 | C8-A02, C8-A18 | C8-K02, C8-K07, C8-K16 | C8-W01, C8-W03, C8-W04, C8-W07 | Error classes, pending/unknown result, safe retry and authorized stale cache preserve user intent; no raw exception, automatic dangerous overwrite or empty-state substitution for failure. |
| C8-V26 | C8-S11, C8-S34 | C8-A15, C8-A18 | C8-K15 | C8-W02, C8-W03, C8-W04, C8-W08, C8-W10 | Actual light/dark/large-text/TalkBack/focus/touch/keyboard/reduced-motion tests verify contrast, reachable controls, stable geometry and no overlapping or meaningfully truncated approval content. Token arithmetic alone is insufficient. |
| C8-V27 | C8-S35 | C8-A15 | C8-K15, C8-K16 | C8-W01, C8-W04, C8-W05, C8-W08, C8-W10 | Reviewed English/Telugu/Hindi strings, font fallback, plurals, long/mixed-script and RTL cases preserve meaning; locale display does not mutate canonical timezone/date/currency data. |
| C8-V28 | C8-S13, C8-S16, C8-S32 | C8-A17 | C8-K05, C8-K15 | C8-W02, C8-W04, C8-W09, C8-W11 | Measured startup, compose/recomposition, list pagination, image sizing/loading and frame/input behavior under the agreed device/load matrix; no all-history rendering or heavy main-thread decode. |
| C8-V29 | C8-S30, C8-S33, C8-S36 | C8-A16 | C8-K14, C8-K16 | C8-W01, C8-W04, C8-W07, C8-W09, C8-W10 | Sentinel credentials, private messages/files, contacts, health data and prompts stay out of analytics, network/error/crash logs, saved bundles, notifications and prohibited screenshots. Test actual configured SDK hooks. |
| C8-V30 | C8-S17, C8-S21, C8-S31, C8-S37 | C8-A06, C8-A09 | C8-K05, C8-K06, C8-K08, C8-K14 | C8-W11 | Upgrade/interrupted migration, corruption/recovery, logout and resync preserve permitted drafts/outbox or disclose unavoidable loss; no destructive migration fallback disguised as a successful recovery. |
| C8-V31 | C8-S37, C8-S39 | C8-A02, C8-A15, C8-A18 | C8-K02, C8-K15, C8-K16 | C8-W01, C8-W02, C8-W03, C8-W04, C8-W05, C8-W06, C8-W07, C8-W08, C8-W09, C8-W10 | Unit/Compose/integration/device suites cover delivered screens' primary states/actions/nav/accessibility, including compact/expanded/landscape/keyboard/rotation. Record real counts/artifact versions and screenshots, not files alone. |
| C8-V32 | C8-S01, C8-S22, C8-S29, C8-S38 | C8-A04, C8-A05, C8-A06, C8-A07, C8-A08, C8-A09, C8-A10, C8-A12 | C8-K03, C8-K04, C8-K05, C8-K08, C8-K10, C8-K16 | C8-W01, C8-W03, C8-W04, C8-W05, C8-W10, C8-W11 | Released Android/backend workflow demonstrates actual persistence, denial, process/network interruption, retry and current authorization with web contract parity. M1 is scoped honestly; broader chat/Agent/push evidence remains unverified until delivered. |

Use JVM tests for state/use-case/error/retry logic, real Room instrumentation for SQLite transactions/migrations, Compose tests for semantics/navigation/actions and backend/transport integration for actual API/realtime behavior. Fakes may isolate cases but cannot prove server admission, PostgreSQL races, push delivery, encryption or Android scheduling restrictions.

Device testing requires an explicitly permitted disposable emulator or test device with synthetic data. Do not uninstall/reset a personal release app, wipe its data or capture its unrelated screen. Verify target app context before any authorized capture/input, preserve failed runs and test output, and require fresh actual test counts/artifacts rather than interpreting a zero exit code or screenshot filename as success. No device, app build or test run occurred for this document.

## 14. Developer Handoff and Release Work

| Ticket | Accountable role | Depends on | Deliverable and evidence |
| --- | --- | --- | --- |
| C8-T01 | Android/product/security leads, Teams A/B/E | Relevant Chapter 1/18/3/6/7 decisions | Resolve SDK/device/library, navigation, offline/security, design/localization and notification gates for the chosen slice; preserve unapproved choices and optional-feature scope. |
| C8-T02 | Android architect, Team B | C8-T01 | Reviewed feature/dependency/Hilt/session/navigation structure, typed repository interfaces and local schema/merge contract; C8-V01, C8-V02, C8-V04, C8-V05 design-to-build evidence. No application files are created by this package description. |
| C8-T03 | Product designer/Compose systems engineer, Teams A/B | C8-T01, C8-T02 | Actual mobile/expanded prototypes, tokens, reviewed fonts/assets, source component states and accessibility/localization inventory; C8-V26, C8-V27 and screenshot/layout gates when implemented. |
| C8-T04 | Android identity/Space engineer, Team B | C8-T02, C8-T03; real identity/Space APIs | Implement selected account/proof/profile/family/invite/member/settings flows with scoped navigation and operation state; C8-V03 through C8-V08. |
| C8-T05 | Android data/sync engineer, Team B | C8-T02; canonical data/API contracts | Implement account-isolated Room/outbox/version merge, snapshot/cursor transaction, connection manager and WorkManager coordination; C8-V10 through C8-V15, C8-V24, C8-V30. |
| C8-T06 | Android planning/notification engineer, Team B | C8-T04, C8-T05; released planning/delivery APIs | Implement ordinary M1 task/reminder review/in-app inbox/ack and preference/intent safety; C8-V16, C8-V17, C8-V22. Live push/exact timing are separately gated. |
| C8-T07 | Android community/messaging engineer, Team B | C8-T03, C8-T04, C8-T05; released public/chat APIs | Split public Page/post/discovery and reliable chat into bounded feature tickets, preserving private contexts and stable lists; C8-V06, C8-V09 through C8-V15 and C8-V28. Not a hidden prerequisite for the first reminder slice. |
| C8-T08 | Android Agent/file engineer, Teams B/D | C8-T03, C8-T04, C8-T05; released controlled-Agent/file APIs | Scoped Agent runs/approval/memory and staged file workflows with real states and no embedded credentials; C8-V18 through C8-V21. No health or unrestricted external capability introduced by UI examples. |
| C8-T09 | Android security/privacy engineer, Teams B/E | C8-T02; C8-T04 through C8-T08 for released integrations | Implement and verify chosen storage/key/backup/app-lock/token/permission/account-switch/telemetry controls, data-rights routes and SDK redaction; C8-V05, C8-V22 through C8-V25, C8-V29, C8-V30. |
| C8-T10 | Android performance/accessibility QA, Teams B/E | C8-T03; C8-T04 through C8-T09 for delivered flows | Real supported device/window/locale/large-text/keyboard/network/process-death evidence, semantic UI tests and measured performance; C8-V26 through C8-V31. Do not certify from desktop mocks alone. |
| C8-T11 | Integration/release QA, Team E | C8-T04 through C8-T10 for released scope | Run applicable C8-V01 through C8-V32 with exact build/API/data versions, device permission, commands, results and known limitations; no complete-MVP claim from only M1. |
| C8-T12 | Product/web/client architecture leads, Teams A/B/C | C8-T02, C8-T03; C8-T11 for runtime acceptance | Chapter 9 parity handoff for the same user journeys, API/identity/scope and UX state meanings with a web-native layout/session/cache design. Planning can proceed before implementation evidence exists. |

Packages describe ownership and acceptance, not assigned staff, executed subagents or permission to build every future feature. Split each implementation into reviewable changes with source IDs, bounded scope, dependencies, actual test commands, API/migration implications, applicable ADR, security/runbook notes, demo instructions and limitations. Design-only tasks state which code/runtime deliverables remain pending. Privacy, recovery and accessibility start with the first slice rather than being left to the last QA ticket.

## 15. Demo Plan, Risks and Next Chapter

Once implementation is authorized, demonstrate the M1 sequence on a permitted synthetic-data test environment:

1. Open the app, show a correct session/loading gate, register/sign in and complete the selected verification method.
2. Create a private family Space, issue an intended-recipient invitation, and accept/confirm it through the reviewed identity policy on the second account. Show a wrong/unrelated account being denied without leaking private data.
3. Create and assign an ordinary task; review a one-time reminder's recipient, local date/time, timezone and in-app channel. Show saved state after reload, not only an optimistic row.
4. Interrupt/restart the allowed client or worker and reconnect. Reconcile canonical state without duplicating the task, schedule or notification; do not label a simulator as actual provider delivery.
5. Receive the durable in-app notification on the authorized open/reconnected client and explicitly acknowledge it. Distinguish saved, due, delivered and acknowledged evidence.
6. Demonstrate cancellation or member removal before later execution, a safe retry/conflict and stale deep-link denial. Show compact/large-text accessibility and failure/offline states for the delivered screens.

The demo is not a medical workflow, exact-alarm proof, push/provider certification, completed Agent system or entire MVP. Broader milestones add public participation, reliable chat, other Space types, Agent approvals/memory and selected files using their actual backend capabilities and evidence.

| Mistake | User impact | Required design response |
| --- | --- | --- |
| Let each screen own a socket/network cache. | Duplicate messages, battery churn and screens disagreeing after reconnect. | One managed context, repository merge and Room-backed rendered state. |
| Use a new message/command ID for each retry. | Duplicate tasks/messages/reminders and lost correspondence with server results. | Persist immutable logical intent and reconcile the original command. |
| Trust a saved route, role or event from the previous account. | Cross-account/private-Space exposure or a command executed as the wrong person. | Immutable account/environment generation, current backend checks and scoped cleanup. |
| Treat all booleans and async callbacks as independent UI truth. | Empty/error/success at once, stale content reappearing or false completion. | Explicit valid states, version-aware reduction and one canonical merge path. |
| Queue a sensitive approval offline or render only a truncated summary. | User authorizes changed or unseen recipients/content. | Online current exact-action review and an inspectable full payload. |
| Call Room secure merely because Keystore is used elsewhere. | Private cached content or backups remain exposed. | Explicit encryption/key/backup/retention design and actual device verification. |
| Promise timing from WorkManager or push acceptance. | False reassurance about reminders, particularly in care situations. | Backend durable scheduling, distinct delivery/ack states and disclosed platform limits. |
| Finish UI only at normal font size on one phone. | Controls become unreadable/unreachable or overlap on real devices. | Responsive constraints, translated/mixed-script text, large-scale/RTL/TalkBack and keyboard tests from the component level. |

Next: [Chapter 9](../Chapter9.md), translating the same product/API/state rules into Next.js/TypeScript web routes, layouts, secure sessions, server/client rendering, cache isolation, realtime recovery and accessible responsive workflows. Keep [Chapter 11 security](../Chapter11.md), [Chapter 19 encryption](../Chapter19.md), [Chapter 13 scheduling](../Chapter13.md) and [Chapter 20 delivery](../Chapter20.md) attached to their dependent client features.

This completes the proposed Android design handoff. It preserves the source and earlier contracts, labels new decisions and missing screens, and does not claim compiled code, visual approval, device tests or a runnable application.