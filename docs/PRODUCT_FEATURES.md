# Product Features and Delivery Ledger

Updated: 2026-10-01. Product: Community Platform. Build the human-operated product first; Agent runtime work belongs to a separate workstream.

**Current web URL: http://127.0.0.1:3000 only.** Use the VS Code **Community Platform: preview web** task. Previous port references in evidence are historical; do not start alternate web previews.

## Scope and Evidence

This is the implementation-facing checklist, not a replacement specification or a production-readiness certificate. The [catalog](../packages/feature-catalog/features.json) contains **190 feature groups in 15 domains**, including **16 deferred Agent groups**. The remaining **174 groups are not 174 equally sized tickets**: several span many screens and safety requirements. The [source inventory](../packages/feature-catalog/requirements.json) retains all 21 originals, 2,208 headings, 90 priority entries, 17 final outcomes and 39 acceptance entries. Preserve the [source fingerprints](../packages/feature-catalog/sources.lock.json); do not regenerate them to hide source changes.

Status columns are backend / web / Kotlin Android. `P` means a limited implementation exists, not the entire feature. `U` means undelivered: no working end-to-end implementation is established, including absent or unqualified in-progress code. `N` means no implementation found in the owning module. `D` means explicitly deferred to the separate Agent workstream. No row is marked complete based on a directory, README, mocked response, successful compile or historical test name. Historical results remain in [build status](BUILD_STATUS.md); fresh checks must name their scope and limitations.

Messaging now has a limited Space chat and direct-message implementation on all three platforms (see the [messaging batch](#space-chat-and-direct-messages-batch)); its end-to-end encryption, device-key, realtime and attachment rows stay undelivered. The public community, Home/Discover and report/block rows now have a limited implementation (see the [public community batch](#public-community-batch)), as do Space events and RSVP (see the [events batch](#space-events-and-rsvp-batch)). No runtime implementation was found in the owning files, integrations or realtime modules on any of the three platforms; their rows stay `U` until a batch below records evidence. Reserved READMEs are not implementations. Identity export code and Agent parser/tool files have appeared in separate work and are preserved, but their existence alone is not client integration or verification. The 21 original source fingerprints match the previously completed full chapter review; this batch reused that review and rechecked the current catalog, implementation paths and owning scheduling/client contracts, not a new line-by-line reread of every Markdown file.

## Source Map

| Original | Product responsibility and controlling contract |
| --- | --- |
| [idea.md](../idea.md) | Overall product, public/private separation, workflows and delivery principles |
| [Chapter1.md](../Chapter1.md) | Release scope and acceptance: [release plan](CHAPTER_01_RELEASE_PLAN.md) |
| [Chapter2.md](../Chapter2.md) | Public pages, posts, comments, following: [public content](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md) |
| [Chapter3.md](../Chapter3.md) | Family/couple/solo/custom/temporary Spaces: [Spaces](CHAPTER_03_SPACE_CONTRACT.md) |
| [Chapter4.md](../Chapter4.md) | Messaging, events and delivery: [reconciliation](CONTRACT_RECONCILIATION.md) |
| [Chapter5.md](../Chapter5.md) | Agent baseline; retained but deferred: [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) |
| [Chapter6.md](../Chapter6.md) | Database, ownership, transactions: [data](CHAPTER_06_DATA_CONTRACT.md) |
| [Chapter7.md](../Chapter7.md) | HTTP, realtime, jobs and sync: [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md) |
| [Chapter8.md](../Chapter8.md) | Kotlin app, navigation, state and offline behavior: [Android](CHAPTER_08_ANDROID_CONTRACT.md) |
| [Chapter9.md](../Chapter9.md) | Web routes, session BFF and responsive UI: [web](CHAPTER_09_WEB_CONTRACT.md) |
| [Chapter10.md](../Chapter10.md) | Workers, operations and recovery: [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md) |
| [Chapter11.md](../Chapter11.md) | Privacy, security and care boundaries: [security](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md) |
| [Chapter12.md](../Chapter12.md) | Agent engine, tools, memory and approvals; deferred |
| [Chapter13.md](../Chapter13.md) | Reminders, dates, recurrence and calendar: [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md) |
| [Chapter14.md](../Chapter14.md) | Files, scan, extraction and retrieval: [files](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) |
| [Chapter15.md](../Chapter15.md) | Home, search, ranking and personalization: [discovery](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md) |
| [Chapter16.md](../Chapter16.md) | Reporting, blocking, moderation and appeals: [safety](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) |
| [Chapter17.md](../Chapter17.md) | Events, RSVP, polls, expenses and workspaces: [events](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) |
| [Chapter18.md](../Chapter18.md) | Authentication, profiles, sessions and data rights: [identity](CHAPTER_18_IDENTITY_CONTRACT.md) |
| [Chapter19.md](../Chapter19.md) | Messaging and encryption: [messaging](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) |
| [Chapter20.md](../Chapter20.md) | Inbox, providers, consent and delivery truth: [delivery](CHAPTER_20_DELIVERY_CONTRACT.md) |

The two Chapter 19 drafts and two Chapter 20 drafts are retained alternatives, routed through the reconciliation document. Their similarly named decision IDs are not interchangeable. Original Chapters 3, 4, 7, 12, 13 and 15 have incomplete endings; absent requirements must not be invented or silently declared delivered. Proposed/open policy choices remain proposed/open.

## Feature Checklist

Every catalog key appears exactly once below. Scope notes identify the next missing work; they do not erase fuller chapter requirements.

### Identity

| Feature | B/W/A | Implemented boundary or remaining work |
| --- | --- | --- |
| identity.account-access | P/P/P | Synthetic email/password registration and sign-in; real-user rollout remains gated |
| identity.email-verification | P/P/P | Context-bound local mail proof; production delivery not enabled |
| identity.phone-verification | U/U/U | Verified phone linking, recycled-number and recovery policy |
| identity.sessions-devices | P/P/P | Sessions/revocation; trusted cryptographic device management remains |
| identity.profiles-handles | P/P/P | Name/timezone; handles, avatar and field audiences remain |
| identity.account-recovery | P/P/P | Local email recovery; production abuse/recovery review remains |
| identity.contact-linking | U/U/U | Explicit verified endpoint association; no identity merge by matching text |
| identity.contact-discovery | U/U/U | Optional consented lookup without address-book leakage |
| identity.relationships | U/U/U | Explicit relationships distinct from legal/care authority |
| identity.privacy-consent | P/P/P | Narrow reminder preferences; wider purpose/version/withdrawal controls remain |
| identity.account-lifecycle | U/U/U | Deactivation/deletion, revocation and resumable purge |
| identity.data-export | U/U/U | Fresh-auth scoped export, protected download and expiry |
| identity.delegations | D/D/D | Shared authority contracts retained; Agent delegation deferred |

### Public Community

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| community.pages | P/P/P | Public page detail by handle, signed-out reads, owner edits with reviewed version; archive/delete/lifecycle remain |
| community.page-onboarding | P/P/P | Explicit page creation (handle/name/topic/description) with exact retry; publication review remains |
| community.page-roles | U/U/U | Owner only today; editors/admins, acting-page attribution and target-aware role changes remain |
| community.page-membership | U/U/U | Admission separate from following |
| community.following | P/P/P | Idempotent follow/unfollow with exact counts; blocking a page ends following |
| community.posts-drafts | P/P/P | Private drafts, explicit publish, owner edits (edited mark) on web and Android ([T31](TASKS.md#approved-requirements-not-built-yet)), tombstone delete; revision history remains |
| community.publication-review | U/U/U | Exact revision/media clearance, withdraw and remoderation |
| community.media-posts | U/U/U | Safe ready media with compatible audience |
| community.comments-replies | P/P/P | Comments with one reply level, exact retry, author delete, page-owner removal; edits/locks remain |
| community.reactions | P/P/P | One idempotent like per person with exact counts; other reaction types remain |
| community.shares | U/U/U | References respect current source audience; no private-to-public leak |
| community.saved-posts | P/P/P | Private saves list, never a public signal |
| community.topics-hashtags | P/P/P | Ten fixed page topics with topic filter; hashtags and topic pages remain |
| community.page-analytics | U/U/U | Authorized aggregate analytics and small-cohort privacy |
| community.scheduled-publication | U/U/U | Reviewed source version and current authority at execution |

### Private Spaces

| Feature | B/W/A | Implemented boundary or remaining work |
| --- | --- | --- |
| spaces.family | P/P/P | Create/list/detail and reviewed owner-only name settings; broader settings/lifecycle remain |
| spaces.couple | U/U/U | Exactly two active human partners, explicit acceptance and separation rules |
| spaces.solo | P/P/P | Explicit creation, private tasks/reminders/calendar/name settings, database-enforced single owner, no invitations/transfers/conversion; native device qualification open |
| spaces.custom | P/P/P | Group Spaces, private by default and optionally public ([DEC-011](DECISIONS.md#accepted-decisions)); owner and member roles only; reviewed per-group features and policy remain |
| spaces.temporary-event | U/U/U | Explicit expiry, read-only/archive and retained-data policy |
| spaces.invitations | P/P/P | Existing verified account, inbox/review/accept/decline/revoke; no external contact send |
| spaces.admission | P/P/P | Exact admission epochs, new invitation for return, no old task grants |
| spaces.memberships-roles | P/P/P | Roster/member removal/self-leave; delegated roles and restrictions remain |
| spaces.join-requests | P/P/P | Requests to public groups with an optional note, owner approval as a new admission, withdrawal, 14-day expiry and a 7-day wait after a decline ([T22](TASKS.md#spaces)) |
| spaces.ownership-transfer | P/P/P | Two-party exact review and one-owner continuity; native device evidence pending |
| spaces.history-policy | P/P/P | Creation-time task grants; configurable history sharing not implemented |
| spaces.privacy | P/P/P | Family and solo always private; a public group shows only name, description and member count, never content or members; per-object/field consent controls remain |
| spaces.conversion | U/U/U | Reviewed type/capacity/audience migration, never automatic history sharing |
| spaces.archive-expiry | U/U/U | Current gates for archive/restore/expiry, no revived jobs or invites |

### Messaging and Encryption

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| messaging.direct-conversations | P/P/P | Two current members of one Space, bound to both admissions; read-only after either leaves. Blocks, cross-Space contacts remain |
| messaging.group-conversations | P/P/P | One Space chat per Space for current members; custom groups and conversation-specific membership remain |
| messaging.messages | P/P/P | Durable message + outbox commit, immutable send key, attributed sender, server-side encryption at rest (not E2E) |
| messaging.offline-outbox | U/U/U | Crash-safe pending command, explicit reconciliation after unknown acceptance (current retry identity is in memory only) |
| messaging.history-sync | P/P/P | Admission-bounded history, position paging and bounded polling; event cursor/WebSocket sync remains |
| messaging.delivery-read-receipts | U/U/U | Accepted, received, decrypted, read and business acknowledgment distinct (only own read position exists) |
| messaging.unread-counts | P/P/P | Per-admission forward-only read position; excludes own and deleted messages |
| messaging.typing-presence | U/U/U | Ephemeral privacy-aware leases; no availability guarantees |
| messaging.edits-deletion | P/P/P | Author delete-for-everyone tombstone with audit, no recall; edits, moderator removal and local hide remain |
| messaging.threads-replies | U/U/U | Same-conversation references and current history authorization |
| messaging.attachments | U/U/U | Immutable file version, mode-aware safety and key handling |
| messaging.encryption-modes | U/U/U | Maintained reviewed protocol; no homemade crypto or plaintext fallback |
| messaging.devices-keys | U/U/U | Verified device continuity, authenticated roster epochs and revocation |
| messaging.key-recovery | U/U/U | Account recovery is not key recovery; explicit history limits |
| messaging.calls | U/U/U | Optional calling remains separate from reliable messaging |

### Tasks and Calendar

| Feature | B/W/A | Implemented boundary or remaining work |
| --- | --- | --- |
| planning.tasks | P/P/P | Create/list/detail/edit/progress/complete/reopen/cancel; wider lifecycle remains |
| planning.assignments | P/P/P | Eligible original audience only; owner cannot bypass task history |
| planning.due-dates | P/P/P | Calendar date, not a timed reminder or timezone-shifted instant |
| planning.checklists | P/P/P | Task checklist items (add/rename/remove by task managers, check by assignee) with exact review and retry; verified 2026-09-30 |
| planning.dependencies | U/U/U | Same-scope acyclic graph and explicit blocked/override behavior |
| planning.recurring-tasks | U/U/U | Stable occurrences, exceptions and bounded generation |
| planning.calendar-views | P/P/P | Month agenda over current authorized tasks, personal reminders and the planned times of repeating reminders (computed, not stored; [DEC-010](DECISIONS.md#accepted-decisions)); web live verified, native built/JVM checked; events and external calendars remain |
| planning.planning-workspaces | U/U/U | Shared operational overview without broadening source permissions |

### Scheduling and Care

| Feature | B/W/A | Implemented boundary or remaining work |
| --- | --- | --- |
| scheduling.one-time-reminders | P/P/P | Explicit task-linked personal schedule and independent worker |
| scheduling.recurrence | P/P/P | Provisional ([DEC-010](DECISIONS.md#accepted-decisions)): every 1–30 days or chosen weekdays every 1–4 weeks, one clock time, named timezone, up to a year; reviewed first times; only the next time stored; pause/resume/skip/cancel; web live verified, native built/JVM checked. Wider rules, editing a saved series and a maintained library (C13-D02) remain |
| scheduling.timezone-dst | P/P/P | One-time gaps rejected, folds explicitly selected. Repeating: a skipped time reminds after the jump or that day is skipped (the person's choice); a repeated time reminds once, the first time. Travel remains |
| scheduling.occurrences | P/P/P | One logical delivery per one-time reminder and per series date (derived key); at most one late catch-up after downtime; revision model beyond skip-next remains |
| scheduling.recipient-policy | P/P/P | Self opt-in or explicit assignee acceptance; no owner opt-in for another person |
| scheduling.exceptions | P/P/P | Skip the next time, and pause and resume a series (DEC-010). Moving or editing one time or the rest of a series remains |
| scheduling.snooze | P/P/P | Separate follow-up reminder for 10 minutes, 1 hour, 3 hours or 1 day, at most three, never past the series' next time (DEC-010); web live verified, native built/JVM checked. Not used for care doses |
| scheduling.acknowledgment | P/P/P | Explicit recipient response, distinct from read/task completion/adherence; acknowledging one reminder settles its snooze chain |
| scheduling.cancellation | P/P/P | Prevent pending delivery; already committed history cannot be recalled. Cancelling a series stops its future times and a waiting snooze |
| scheduling.quiet-hours | U/U/U | Recipient-local windows, DST and expiry; no clinical rescheduling |
| scheduling.escalation | U/U/U | Bounded consented steps, stop races and no emergency guarantee |
| scheduling.care-instruction-records | P/P/P | Instructions only the person can see, confirmed by them with a named source; day plan; self-reported taken/skipped notes. Caregiver grants, notifications at dose times and approval of medical, legal and privacy rules (Q12) remain |

### Events

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| events.shared-events | P/P/P | Space events with title, details, location, IANA zone and exact UTC start/end; reviewed edit and cancel. Public events and organizer workspaces remain |
| events.public-events | U/U/U | Public projection excludes private workspace/roster/finance |
| events.organizer-workspaces | U/U/U | Role-scoped event modules |
| events.rsvp | P/P/P | Going/Maybe/Not going per admission; a response is intent, not attendance. Invitations to people outside the Space remain |
| events.registration-capacity | U/U/U | Serialized capacity including guests and idempotent reservations |
| events.waitlists | U/U/U | Explicit promotion/expiry/release |
| events.attendance | U/U/U | Attributed check-in, not inferred from Going |
| events.polls-ballots | U/U/U | Exact electorate, deadlines, ballot privacy and close/finalize separation |
| events.budgets | U/U/U | Estimated/proposed/approved/actual amounts distinct |
| events.expenses | U/U/U | Exact money/currency, correction history and protected evidence |
| events.contributions | U/U/U | Pledges/reported/verified receipt/refund distinct; no implied payment |
| events.cancellation-postponement | P/P/P | Cancel stops responses; a changed time marks earlier responses as needing confirmation. Dependent reminders/tasks/calendar entries are not coordinated yet |
| events.event-permissions | U/U/U | Location, participants, polls, files and finance audiences independent |

### Notifications

| Feature | B/W/A | Implemented boundary or remaining work |
| --- | --- | --- |
| notifications.in-app-inbox | P/P/P | Private task reminder list/read/ack; other categories/dismiss/read-all remain |
| notifications.preferences | P/P/P | Versioned task reminder preference; categories/channels/previews remain |
| notifications.verified-endpoints | P/P/P | Local identity email only; delivery/device bindings remain |
| notifications.delivery-consent | P/P/P | Task-linked personal consent; channel/purpose/expiry grants remain |
| notifications.templates-locales | P/P/P | Local identity email and reminder content; localization/template lifecycle remain |
| notifications.push | U/U/U | Approved provider, device binding, OS permission, redacted background payload |
| notifications.email | P/P/P | Local synthetic identity mail only, not production notification email |
| notifications.sms | U/U/U | Provider/consent/region/cost gates; no live sends |
| notifications.whatsapp | U/U/U | Official supported capabilities only; separate authorization |
| notifications.voice | U/U/U | Explicit opt-in/window/disclosure/limits; no autonomous emergency calls |
| notifications.provider-attempts | P/U/U | Local SMTP attempts; external acceptance/delivery/uncertainty model remains |
| notifications.webhooks | U/U/U | Exact signature/account/environment, durable dedup and ordered fact reduction |
| notifications.reconciliation | P/P/P | Local stable effect/retry; unknown external effect needs provider evidence |
| notifications.digests | U/U/U | Stable membership/window and fresh source authorization |
| notifications.delivery-budgets | U/U/U | Shared quotas/reservations/cost limits across retry and fallback |

### Agent Workstream: Deferred

The rows stay `D` until the owner confirms [DEC-012](DECISIONS.md#accepted-decisions) (conflict C11); `scripts/feature-catalog.test.mjs` checks this, and only a confirmed decision may change that check. Meanwhile a first release without an AI model exists on the backend only, built under that provisional decision: requests in one Space, exact approvals, task creation and completion, the person's own one-time reminder, and notes ([T33](TASKS.md#approved-requirements-not-built-yet); [checkpoint](BUILD_STATUS.md#agent-backend-checkpoint)). Its web screen is written but not linked, and Android is not started (T34, T35).

| Feature | B/W/A | Boundary |
| --- | --- | --- |
| agents.scoped-chat | D/D/D | Separate Agent owner |
| agents.configuration | D/D/D | Separate Agent owner |
| agents.context-policy | D/D/D | Separate Agent owner |
| agents.task-drafting | D/D/D | Manual task service remains independent |
| agents.reminder-drafting | D/D/D | Manual scheduler remains independent |
| agents.public-search-assistance | D/D/D | Public discovery must work without a model |
| agents.exact-action-approvals | D/D/D | No Agent execution authority added here |
| agents.tool-registry | D/D/D | Future tools call the same authorized domain services |
| agents.tool-audit | D/D/D | Separate Agent owner |
| agents.run-control | D/D/D | Separate Agent owner |
| agents.memory-controls | D/D/D | Separate Agent owner |
| agents.memory-consent | D/D/D | Separate Agent owner |
| agents.memory-provenance | D/D/D | Separate Agent owner |
| agents.child-delegation | D/D/D | Separate Agent owner |
| agents.evaluation | D/D/D | Separate Agent owner |
| agents.provider-budgets | D/D/D | No model/provider credentials or spending enabled |

### Files and Documents

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| files.uploads | U/U/U | Bounded reservation, immutable commitment and current scope |
| files.immutable-versions | U/U/U | Exact bytes/version/digest; later upload cannot replace scanned object |
| files.quarantine-scanning | U/U/U | Fail closed, distinguish threat/unavailable/unsupported |
| files.media-processing | U/U/U | Isolated bounded transforms; safe previews and metadata |
| files.documents-pages | U/U/U | Real page/slide/sheet identity, partial coverage |
| files.ocr | U/U/U | Unconfirmed extraction, preserve units/negation/provenance |
| files.extraction | U/U/U | Supported formats and explicit failures/gaps |
| files.chunks-embeddings | U/U/U | Versioned lineage; model integration deferred until separately approved |
| files.authorized-retrieval | U/U/U | Current access before candidates/context, not only final display |
| files.citations | U/U/U | Immutable source/anchor, no invented pages |
| files.sharing | U/U/U | Reviewed recipient/audience/expiry; downloaded bytes not recalled |
| files.deletion-lineage | U/U/U | Revoke eligibility first, resumable derivative purge |

### Home and Discovery

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| discovery.public-search | P/P/P | Page search over name/handle/description with literal wildcards, topic filter and bound cursors; post search over title and text, literal, newest first, drafts and blocked pages excluded ([T29](TASKS.md#approved-requirements-not-built-yet)); relevance ranking and highlights remain |
| discovery.private-scoped-search | U/U/U | Separate current-authorized private query |
| discovery.home-feed | P/P/P | Following / Latest / Saved public feeds; no private modules or private signals |
| discovery.following-feed | P/P/P | Current follows only, blocked pages excluded, newest first; mutes remain |
| discovery.topics | U/U/U | Public taxonomy and topic results |
| discovery.local-discovery | U/U/U | Coarse explicit region, no precise/private location inference |
| discovery.trending | U/U/U | Eligible public aggregates with cohort/abuse limits |
| discovery.suggestions | U/U/U | Private query history never leaked as public suggestion |
| discovery.ranking | U/U/U | Eligibility before scoring; stable ordering and honest explanations |
| discovery.personalization-controls | U/U/U | Opt-out disables collection/use, not just a label |
| discovery.feedback | U/U/U | Hide/mute/not interested/report distinct and reversible where appropriate |
| discovery.eligibility-projections | U/U/U | Current source authority; stale index cannot restore revoked visibility |
| discovery.translations | U/U/U | Original source and translation provenance |

### Safety and Data Rights

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| safety.reports | P/P/P | Page/post/comment reports with fixed reasons, one open report per target, daily bound and outbox event; no reviewer tools, decisions or notices yet |
| safety.blocking | P/P/P | Block pages (hidden everywhere, follow ended) and comment authors (comments hidden, cannot comment on your pages); messaging blocks remain |
| safety.muting | U/U/U | Personal notification/feed preference, not send restriction |
| safety.moderation-cases | U/U/U | Scoped evidence, actual human decisions and notices |
| safety.policies | U/U/U | Versioned applicable rules and governed publication |
| safety.evidence | U/U/U | Minimal immutable lawful evidence and access audit |
| safety.reviewer-queues | U/U/U | Assignment, conflict of interest, expiry and current authority |
| safety.restrictions | U/U/U | Exact scoped reversible/expiring enforcement where applicable |
| safety.appeals | U/U/U | Independent review; overturn does not erase other restrictions |
| safety.privileged-access | U/U/U | Workforce identity, step-up, purpose and time bounds |
| safety.incidents | U/U/U | Runbooks, containment, evidence and recovery ownership |
| safety.retention-legal-holds | U/U/U | Reviewed retention and protected exceptions, not indefinite storage |
| safety.data-rights | U/U/U | Export/delete across original and derived data |
| safety.age-guardian-policy | U/U/U | Qualified policy; family owner is not automatically a guardian |

### Integrations

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| integrations.calendar-connections | U/U/U | Official provider, minimal scopes and explicit account binding |
| integrations.calendar-sync | U/U/U | Atomic pages/cursors, conflict review and echo suppression |
| integrations.provider-capabilities | U/U/U | Verify real status/cancel/idempotency/region capabilities |
| integrations.oauth-credentials | U/U/U | Protected token references, rotation/revocation, no client secrets |
| integrations.webhook-inbox | U/U/U | Durable authenticated scoped intake before acknowledgment |
| integrations.external-effect-reconciliation | U/U/U | Unknown outcome is not safe to resend with a new key |
| integrations.payment-gates | U/U/U | Record-only finance first; no live money movement |

### Realtime

| Feature | B/W/A | Required scope |
| --- | --- | --- |
| realtime.websocket-gateway | U/U/U | Authenticated bounded session transport |
| realtime.subscriptions | U/U/U | Current resource authorization on subscribe and delivery |
| realtime.authorized-replay | U/U/U | No old history grant through replay |
| realtime.snapshot-cursors | U/U/U | Coherent snapshot/log boundary and account/scope-bound cursors |
| realtime.client-reconciliation | U/U/U | Stable logical IDs across REST/event orderings |
| realtime.backpressure | U/U/U | Bounded memory, reconnect and explicit full-resync behavior |

### Platform and Client Quality

| Feature | B/W/A | Implemented boundary or remaining work |
| --- | --- | --- |
| platform.database-migrations | P/P/P | Additive Alembic/current schema checks; Room migrations not yet delivered |
| platform.api-contracts | P/P/P | Implemented OpenAPI/typed clients; future APIs are not advertised |
| platform.state-machines | P/P/P | Current domain states; broader canonical registry remains |
| platform.authorization | P/P/P | Session/account/admission/object checks for implemented domains |
| platform.audit | P/P/P | Atomic domain audit, no private payload logging; operations hardening remains |
| platform.transactional-outbox | P/U/U | Database effects/audit/outbox; general fanout remains |
| platform.durable-jobs | P/U/U | Identity mail and task reminders; other workers remain |
| platform.worker-recovery | P/U/U | Bounded retries, suppression and local restart checks |
| platform.observability | P/P/U | Request logs without private data, W3C trace IDs from the web proxy to the API and a key-protected `/metrics` (T09), with waiting and failed background work per queue (T32); collector, dashboards, alerts, SLOs, on-call, traces into workers and native trace context remain |
| platform.rate-limits | P/P/P | Local bounded inputs/quotas; sign-in limits per email and per network, with each web browser's network named by the web proxy behind a trusted reverse proxy (T10); full abuse controls remain |
| platform.feature-gates | P/P/P | Development-only configuration; governed release gates remain |
| platform.backup-restore | P/U/U | Recorded isolated local restore and staged local key rotation (T11); production/PITR/key custody not qualified |
| platform.deployment | P/P/P | Local builds/Compose; no production deployment |
| platform.design-system | P/P/P | Existing operational styles and Compose theme; wider components remain |
| platform.accessibility | U/P/P | Some measured narrow/large-text checks; full assistive technology review remains |
| platform.localization | U/P/P | English and timezone handling; Telugu/Hindi/RTL coverage remains |
| platform.client-offline-state | U/P/P | Visible failure and in-memory intents; no durable process-death outbox |

## Screens and Navigation

Current manual surfaces: sign-in, registration, proof verification/recovery, account/profile/timezone, sessions/security activity, family/Solo Space list/create/detail/name settings, invitation inbox/review/sent history, member roster/remove/leave/ownership review, tasks/list/detail/editor/status/checklist, calendar agenda, reminder preview/request/acceptance/list/cancel, private notification inbox/read/ack and preferences, conversation list, Space chat and direct messages. Web routes include `/login`, `/register`, `/recover`, `/app/settings/account`, `/app/spaces`, `/app/tasks`, `/app/calendar`, `/app/reminders`, `/app/notifications`, `/app/messages`.

Still required: usable Home and Discover; public page/post/comment/topic/search/detail/editor flows; complete Space type/settings/history/lifecycle screens; conversation info/key/device/recovery views; calendar/occurrence/event/RSVP/poll/budget views; file picker/progress/quarantine/viewer/shares; safety/report/block/appeal; privacy/export/delete; native deep links and durable offline recovery. Do not add navigation to empty mock pages or label unavailable encryption as secure.

Every implemented screen must handle loading, empty, failed, denied, offline, stale/conflicting, uncertain command outcome, unsaved edits and account change where applicable. Keep exact selected person/Space/source/time in confirmation. Use visible canonical outcomes, accessible controls, large text, keyboard/IME handling and stable responsive layouts.

## Stack and Boundaries

Use the existing stack, not a rewrite: Python/FastAPI/Pydantic/SQLAlchemy/Alembic/PostgreSQL for domain truth; TypeScript/Next.js/React with the existing Zod/TanStack Query/React Hook Form and same-origin session BFF; Kotlin/Jetpack Compose/Coroutines/StateFlow/ViewModel/Hilt/Retrofit/OkHttp/Keystore for Android. Node test runner, pytest, JUnit and existing browser/Compose harnesses supply focused developer checks. Actual pinned versions live in the package/build manifests and lockfiles, not this document.

| Layer | Current manifest and package choices |
| --- | --- |
| Android | [Application build](../android/app/build.gradle.kts): min SDK 26, compile/target 35, Compose BOM 2024.09.00, Coroutines 1.9.0, Hilt 2.52, Retrofit 2.9.0, OkHttp 4.12.0; [build plugins](../android/build.gradle.kts) own Kotlin/AGP versions. JDK 21 runs the checked wrapper; bytecode targets Java 17. |
| Web | [Package manifest](../web/package.json): Next 16.2.3, React 19.2.4, TypeScript 5.9.3, Zod 3.25.76, TanStack Query 5.90.19, React Hook Form 7.68.0, Lucide icons. |
| Backend | [Python manifest](../backend/pyproject.toml): Python >=3.11, FastAPI, Pydantic settings, SQLAlchemy 2, Alembic, psycopg 3, Argon2, cryptography, tzdata. Version ranges are not a locked production bill of materials; the existing container supplies the tested environment. |
| Local services | [Compose](../infra/compose.yaml): PostgreSQL 17 and local Mailpit; separate API/mail/reminder workers. No cloud/provider migration or paid service was added. |

No new dependency was needed for the calendar. Browser Intl, Java time, Python zoneinfo and PostgreSQL timezone handling are used for their existing supported date/time roles; this is not a handwritten recurrence or encryption engine.

Repeating reminders ([DEC-010](DECISIONS.md#accepted-decisions)) compute their times with a small standard-library rule over Python zoneinfo, for daily and weekly rules only; no rule text is parsed. Choosing a maintained recurrence library is still open (C13-D02).

Room, WorkManager, a maintained recurrence library, reviewed E2E protocol implementation, object storage/scanning, realtime infrastructure and external providers are added only for their real feature requirements. Do not introduce placeholder dependencies or claim a protocol works from an interface. Agent/LangGraph/model integration is deferred. Manual tasks, calendar and reminders must keep working without any model.

Non-negotiable rules:

- Backend derives the actor; check current account/session, parent scope, admission, object grant and subject consent. Owner/admin status never grants another person's health data or historical tasks.
- Commit domain change, required audit and durable work atomically. Keep stable intent/key and expected version; unknown response is not failure, success or permission for a new automatic mutation.
- Date-only deadlines remain dates. Timed occurrences retain local intent, IANA zone and exact UTC choice. Read, acknowledgment, task completion and medication adherence are different facts.
- Do not claim E2E for server-readable text. Do not invent a cipher/ratchet, weaken TLS, silently downgrade or treat account recovery as key recovery.
- Public discovery never receives private chat, family tasks, calendars, health records or Agent memory as content or recommendation signals.
- Medication features only organize confirmed instructions with explicit subject/representative authority. No diagnosis, prescribing, inferred dose, missed-dose doubling or emergency guarantee. Clinical/privacy policy gates stay visible.
- Push is a hint, not durable truth or guaranteed alarm. OS permission is not recipient consent. External destinations, providers, legal basis and cost need separate approval; no live external sends are enabled by this backlog.
- Revocation stops future authorized disclosure/effects; it cannot recall downloaded bytes or already committed external effects. Rejoin receives a new admission, not old grants.
- Preserve existing development data/keys, source chapters and concurrent changes. Never use personal devices or reset data to make a check pass.

## Execution Order

1. Preserve and qualify existing manual foundations; build missing task/calendar and Space settings workflows through the real API and both clients.
2. Finish other private Space types and lifecycle with enforceable capacity/history rules, then reliable private conversations. Resolve actual cross-platform encryption library/mode/device policy before sending messages under an encryption claim.
3. Build public authoring/discovery together with reporting, blocks, moderation and visibility withdrawal. A public feed is not production-ready before those controls exist.
4. Add event collaboration, recurring schedules and safe care records under their distinct permission/time/policy gates; add files with quarantine and current-authorized access.
5. Complete data rights, process-death/offline recovery, locale/accessibility and operations. The independent testing workstream qualifies security, devices, failure recovery, load and release, but implementation work still runs focused checks after changes.
6. Integrate the separately built Agent only through existing authorized domain services after the structured human product is usable.

## Current Build Batch

Implemented this batch: an authorized calendar agenda over existing date-only tasks and personal timed reminders on backend, web and Android. This does not manufacture event, recurrence, external-calendar or medication support.

- [Backend calendar](../backend/app/modules/planning/calendar.py): authenticated `GET /v1/calendar`, exact Space/admission/task grant, only the caller's reminders, 1-31 inclusive days within 1900-2100, named timezone, current status/source-change facts, opaque account/admission/range/zone-bound 15-minute cursor and bounded pages. One UNION query applies the existing access joins to both sources. No new tables, schedules or delivery effects.
- [Web calendar](../web/src/features/planning/calendar-screen.tsx): `/app/calendar`, family selector, month/date controls, profile timezone or UTC, date-grouped agenda, explicit refresh/paging and source links. Typed validation rejects wrong-Space/out-of-range/malformed/duplicate/reordered entries and repeated cursors. Failed refresh hides old private rows. The shared header exposes the calendar.
- [Native calendar](../android/app/src/main/java/com/community/platform/feature/planning/CalendarScreen.kt): account-page entry, family/zone/month selection, date picker, bounded agenda/paging and links to existing tasks/reminders. Hilt repository and account-isolated ViewModel use the shared Keystore/session path. Failure/account changes clear entries; no mutation queue or additional permissions. The native screen is built, not device-qualified.

| Fresh check on 2026-09-28 | Result and boundary |
| --- | --- |
| PostgreSQL task/calendar/authorization/migration suite | 65 passed, 79.02 s. Includes 12 calendar cases for date-only versus instant, DST fold ordering, recipient privacy, grant revocation/rejoin, range validation and cursor scope. Local artifact: `backend/.local/calendar-backend-20260928.xml`. Not a full backend suite. |
| Web typed client/BFF checks | 36 passed. Simulated transport, real serialization/validation/allowlist code; not 36 live journeys. |
| Web production build | Isolated `calendar-20260928` artifact passed compilation/typecheck and includes `/app/calendar`. |
| Real browser/BFF/API/PostgreSQL journey | 1 passed, 6.946 s. Real synthetic registration, persisted task/reminder, date/timezone selection, cancellation, source navigation, unavailable Space, offline hide/retry and 320/390/768 width/control bounds. Artifact: `.local/calendar-live-web.xml`; captures: `.local/screenshots/calendar-live-desktop.png` and `calendar-live-mobile.png`. |
| Native task/calendar JVM checks | 26 passed across TaskRepositoryTest (14) and TaskViewModelTest (12), no failures/errors/skips. Five new calendar cases cover transport, schemas, month/zone, failed refresh and account changes. Simulated transport, not Android-to-server execution. |
| Native packaging/lint | Debug application and instrumentation APKs built; lint has 0 errors and 11 existing warnings. No device install, native calendar screenshot, release-R8/runtime, process-death or full accessibility claim. |

The first live browser run exposed a real paused-offline-query defect: explicit refresh did not produce an error because TanStack Query paused it. Calendar reads now use `networkMode: always`; the live rerun passed offline failure/hiding. A later test-only navigation ambiguity was corrected by waiting for the Tasks page before resolving a title shared with the calendar. Neither failed run is counted as a pass.

Historical calendar preview: port 3007. The current settings build also serves `/app/calendar` on port 3008. Local synthetic accounts only. The independent testing handoff should first qualify the native calendar on an owned disposable device, verify large text/TalkBack/date picker/back navigation, then process-death/account switching and current-grant revocation. The remaining 190-group ledger is not closed by this calendar batch.

## Space Name Settings Batch

Implemented on 2026-09-28: owner-only name editing through a fresh settings review on backend, web and Kotlin Android. The name is the only accepted input. Space type, privacy, membership, task grants, reminders and history do not change. This is a local implementation choice under the existing Space contract, not approval of broader lifecycle policy.

- [Service](../backend/app/modules/spaces/service.py) and [migration 0011](../backend/migrations/versions/0011_space_settings.py): `GET/PATCH /v1/spaces/{space_id}/settings`. PATCH requires a UUID `Idempotency-Key` and exact `If-Match` from the owner review. Account/Space/member locks, post-wait session revalidation, name/version, actual-actor audit/outbox and admission-bound receipt form one transaction. An identical committed retry returns current settings without restoring an older name. Changed intent conflicts; missing/stale review returns 428/412; nonowners and old admissions cannot retrieve settings receipts. At most 500 retained rename receipts per Space is a local bound.
- Pending, unexpired invitations or ownership offers block new renames with `SPACE_REVIEW_PENDING`. Resolve or withdraw those reviews first. A rename never silently changes the Space name under a pending admission/ownership review. Expired pending rows do not block; successful old-command reconciliation does not perform another rename.
- [Web editor](../web/src/features/spaces/settings.tsx): owner settings icon in `/app/spaces`, exact Space/current-name review, draft protection, immutable uncertain retry, explicit discard/reload after conflict and server-canonical result. BFF permits only authenticated GET/PATCH at this route and rejects query injection. Private cache keys include account and Space; denied settings are hidden.
- [Native editor](../android/app/src/main/java/com/community/platform/feature/spaces/SpaceSettingsScreen.kt): entry from owner Space details; isolated Hilt repository/ViewModel, retained draft, explicit retry/conflict reload, account-generation cancellation and denied-state clearing. Leaving an uncertain command warns that the in-memory retry identity will be lost. No process-death persistence or offline mutation queue is claimed.

| Fresh check | Observed result |
| --- | --- |
| PostgreSQL settings-specific | 13 passed, including strict names/extra-field rejection, owner/member scope, pending review expiry, replay/current-state, replaced admission, ownership loss, concurrent retry, audit rollback and preserving migration. |
| Combined Space/migration suite | **110 passed**, 127.29 s; `backend/.local/space-settings-backend-20260928.xml`. This is the affected suite, not a full backend run. |
| Web client/BFF suite | **38 passed**, including two new settings checks. Simulated transport, not 38 live journeys. |
| Live browser/BFF/API/database | **1 passed**, 9.678 s; `.local/space-settings-live-web.xml`. Two real synthetic accounts, dropped committed PATCH response/exact retry/version increment once, stale draft kept until explicit discard/reload, persistence, member-visible name/no owner controls, 320/390/768 dialog bounds. Captures: `.local/screenshots/space-settings-live-desktop.png` and `space-settings-live-mobile.png`. |
| Native affected JVM suites | **47 passed**: Space repository 20, Space ViewModel 21, new settings 6; no failures/errors/skips. Includes actual Retrofit encoding with intercepted responses, uncertainty, conflicts, lost access and late account response checks. |
| Native/web builds | Isolated web production build and TypeScript passed. Android app/test APKs and lint passed: zero errors, 11 existing warnings. DTOs use the existing Space shrinker keep rule; no new dependencies. |

Native settings and calendar device journeys, large text/TalkBack/IME/back-navigation, release runtime and process-death recovery remain for the independent qualification workstream. No device was installed or operated in this batch. The failed native duplicate-declaration edit was removed and recompiled; the first live test failed on a screenshot-path variable shadow, fixed before the complete passing rerun. Neither failure is counted as success.

Current preview: `http://127.0.0.1:3000/app/spaces`. Open an owner's Space settings icon. Migration 0011 was applied without a database/key reset. The regenerated [OpenAPI](../packages/openapi/openapi.json) also incorporates the earlier implemented calendar and separate export routes; no existing operation/schema semantics were changed in that settings export. Agent files, original chapters and proposed decisions were not edited; no commit, push, provider sends or production deployment was performed.

## Solo Spaces Batch

Solo now has explicit creation on web and Android using the same private Space, task, calendar and reminder authorities. A Solo Space admits only its human owner. Invitation creation, persisted-invitation acceptance and ownership transfer are refused. There is no conversion, self-leave, second-person grant or implicit sharing. Migration `0012` adds commit-time database triggers that enforce exactly one active creator-owner and reject type changes, including direct database bypass attempts. Downgrading to a family-only schema refuses to discard retained Solo data.

Creation keys bind name and type; both clients retain them unchanged across uncertain responses. Solo screens identify the type and hide family admission/member-management controls. Owner-only name settings work unchanged; tasks use the original admission grants and date-only semantics, and reminders remain personal. Internal `FamilySpace` type names retained for compatibility do not limit the new supported wire type.

Evidence on 2026-09-28: **167 backend Space/task/migration tests passed** in 232.50 s (`backend/.local/solo-backend-20260928.xml`), including five Solo cases for owner capacity, direct-write rejection, privacy, task/calendar/reminder reuse and invalid invitation acceptance. **75 native JVM checks passed**, zero failures/errors/skips (Space repository 21, Space ViewModel 22, settings 6, task repository 14, task ViewModel 12). App/test APK builds and lint passed with zero errors and 11 existing warnings. Native device behavior remains unverified.

The real Solo journey passed once on the earlier preview (8.658 s), then Solo and settings both passed again at the required **http://127.0.0.1:3000**, with two tests/zero failures/skips in `.local/solo-settings-port3000.xml`. The canonical-port checks cover dropped committed creation response with exact type/key/body retry, owner rename, task creation, calendar date/zone/source integration, persistence and absent family controls. Reminder setup in this journey uses the real API, not the reminder creation screen; existing reminder UI evidence is separate. Browser captures are `.local/screenshots/solo-calendar-live-desktop.png` and `solo-space-live-mobile.png`. The missing first Solo test selection was detected, its absent test body restored, and only the actual passing runs are counted.

No Agent runtime, new third-party provider or production data was introduced. Couple/custom/temporary lifecycle, conversion, wider history policy and the remaining ledger are still open. Implementation continues from the next manual planning gap; this batch does not close the whole product.

No full-product or production completion is claimed. Each batch must record changed paths, exact checks actually run, results, screenshots when applicable, and remaining gaps; the independent testing agent receives these boundaries rather than a blanket 'done'.

## Space Chat And Direct Messages Batch

Implemented 2026-09-28 to 2026-09-30 on backend, web and Kotlin Android. Evidence and bounds: [build status checkpoint](BUILD_STATUS.md#space-chat-and-direct-messages-checkpoint).

- Backend [messaging module](../backend/app/modules/messaging/service.py) and [migration 0014](../backend/migrations/versions/0014_conversations.py): `POST /v1/spaces/{space_id}/conversations` (open the Space chat or a direct conversation), `GET /v1/conversations` (paged, total `unread_count`), `GET /v1/conversations/{id}`, `GET/POST /v1/conversations/{id}/messages` (position paging `before`/`after`; send with `Idempotency-Key`), `POST .../messages/{message_id}/delete`, `POST .../read`. All require a session; the actor is derived server-side.
- Web [messages screen](../web/src/features/messaging/messages-screen.tsx) at `/app/messages` (header icon and per-Space chat link): Space choice, Space chat and direct-message buttons, conversation list with unread badges, chat pane with protection notice, history note, earlier pages, pending/unknown/failed sends, delete confirmation, read-only notice. The BFF allows exactly the seven operations and only the reviewed query parameters.
- Android [messaging feature](../android/app/src/main/java/com/community/platform/feature/messaging/MessagingScreen.kt): **Messages** on the account screen and **Space chat** in Space details; same rules as web, account-generation isolation, polling only while visible, and a 512 KiB response cap for message pages.
- Rules kept: history from the current admission only; no old messages after rejoin; outsiders see 404; read state per admission; deletion does not recall seen copies; server-readable storage is labeled as such. Open: E2E protocol and device keys, WebSocket/push, offline outbox, edits, reactions, attachments, reporting of messages, native device qualification.

## Public Community Batch

Implemented 2026-09-30 on backend, web and Kotlin Android. Evidence: [build status checkpoint](BUILD_STATUS.md#public-community-checkpoint).

- Backend [community module](../backend/app/modules/community/service.py) and [migration 0015](../backend/migrations/versions/0015_public_community.py): 29 operations. Signed-out reads: `GET /v1/pages/{page_ref}`, `.../posts`, `GET /v1/posts/{post_id}`, `.../comments`, `GET /v1/discover/pages`, `GET /v1/discover/posts`; a valid session adds the viewer's follow/like/save/block state. Everything else needs a session: page create/edit/follow, post draft/edit/publish/delete, like/save, comments, feed, saved list, reports and blocks.
- Web: `/app/home` (Following, Latest, Saved), `/app/discover`, `/app/pages` (your pages, create page, pages you follow), `/app/safety` (blocked list), and public `/pages/[handle]` and `/posts/[id]`, which work signed out. Android: **Community** on the account screen with Home, Discover, Your pages, Blocked, page and post screens.
- Rules kept: drafts are visible only to the page owner; publishing needs an explicit confirmation of the reviewed version; creates keep one key across retries; counts change only when the state changes; page owners never see who reported them; blocked pages disappear from every feed and search for the blocker; private Spaces, chats, tasks and reminders never enter these queries. No account IDs appear in public responses.
- Open: page roles/editors, media, shares, hashtags/topic pages, scheduled publication, trending/local/personalized ranking, mutes, moderator case tools and appeals, server-rendered public pages for search engines, native device qualification.

## Space Events And RSVP Batch

Implemented 2026-09-30 to 2026-10-01 on backend, web and Kotlin Android. Evidence: [build status checkpoint](BUILD_STATUS.md#space-events-and-rsvp-checkpoint).

- Backend [events module](../backend/app/modules/events/service.py) and [migration 0017](../backend/migrations/versions/0017_space_events.py): `POST/GET /v1/spaces/{space_id}/events` (create with `Idempotency-Key`; list `upcoming`/`past`, paged), `GET/PATCH /v1/events/{event_id}` (edit with reviewed `If-Match`), `POST .../cancel` (`If-Match`), `POST .../attendance`. All require a session; the actor is derived server-side.
- Web `/app/events?space_id=` (icon on each Space row) and Android **Events** on the Space detail screen: upcoming/past lists, detail with responses, create/edit form, cancel confirmation, exact-retry handling for an unconfirmed create.
- Rules kept: a member sees only events created since their current admission; the wall-clock time and zone the organizer typed are kept and the exact UTC instant is stored; a time that does not exist (clocks forward) or happens twice (clocks back) is refused so nobody is guessed for; a past, more than two-year-out or longer than 14-day event is refused; a response is per admission and stops counting when the person leaves; a reschedule marks earlier responses as needing confirmation; cancelled or ended events refuse responses and edits; only the organizer (same admission) or the Space owner can edit or cancel. Bounds: 500 events and 100 upcoming per Space.
- Open: invitations beyond Space members, public events, capacity/waitlists, guests, check-in, polls, budgets, expenses, recurring events, reminders tied to an event, calendar agenda entries for events, editing multi-day events on Android, native device qualification.

## Care Batch

Backend by a separate care workstream; web and Android screens built 2026-10-01 and kept by [DEC-007](DECISIONS.md#accepted-decisions). Evidence: [build status checkpoint](BUILD_STATUS.md#care-checkpoint).

- Backend [care module](../backend/app/modules/care/service.py) and [migration 0016](../backend/migrations/versions/0016_care_instructions.py): create an instruction (`Idempotency-Key`, `confirmed: true` required), list current or stopped, read one, stop with `If-Match`, report a dose as taken or skipped with `If-Match`, and a day view.
- Web `/app/care` (Medicines in the header) and Android **Medicines** on the account screen: day plan with previous/next day, medicines list with current and stopped, an add form that copies details exactly and requires a confirmation tick, taken/skipped notes with exact retry, and a stop confirmation that says it does not tell you to stop taking the medicine.
- Rules kept: only the person can read or change their records, with no caregiver, owner or administrator path; the source is recorded (prescriber, pharmacist, package label or self); the app gives no advice and does not check the instructions; up to six daily times in a named zone; a time skipped by a clock change is shown at its shifted time, and a repeated time uses the first occurrence; notes are self-reports, not adherence. Bounds: 30 current and 500 total instructions, 20 new per day.
- Open: who approves the medical, legal and privacy rules (Q12); caregiver access by grant; notifications at dose times; editing an instruction (stop and re-add today); native device qualification.