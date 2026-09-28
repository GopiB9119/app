# Chapter 19: Conversations, Messaging, End-to-End Encryption and Realtime Contract

Status: DRAFT FOR PRODUCT, MESSAGING, SECURITY AND CRYPTOGRAPHY REVIEW. This is a design and verification plan, not implemented messaging, a deployed realtime gateway, a reviewed cryptographic protocol or an executed synchronization test.

Document role: retained alternate proposal. Use the [detailed messaging draft](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) as the working review reference and the [reconciliation index](CONTRACT_RECONCILIATION.md) for semantic ID/API correspondence. This is document routing, not product approval. C19 identifiers are file-local; in particular, this file's C19-D07 is not the same decision as C19-D07 in the detailed draft. No proposals or original sources are deleted by this clarification.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), the [Space contract](CHAPTER_03_SPACE_CONTRACT.md), the [API contract](CHAPTER_07_API_REALTIME_CONTRACT.md) and the [delivery contract](CHAPTER_20_DELIVERY_CONTRACT.md). The original [Chapter 19](../Chapter19.md) remains unchanged.

- [Chapter 19](../Chapter19.md) is the owning source for conversation types, membership, the message model, ordering, delivery/read states, offline sync, presence, typing, E2E modes and keys, attachments, edit/delete, reactions/threads/mentions, agent messaging, moderation hooks and failure handling.
- This alternate proposes **domain semantics** (what a conversation, message, receipt or key is and who may act); the [detailed messaging draft](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) is the current review reference and the [Chapter 7 contract](CHAPTER_07_API_REALTIME_CONTRACT.md) owns transport/envelope reconciliation.
- It addresses cross-chapter dependencies but does not approve or close them. [ADR-0005](adr/0005-mvp-scope-and-milestones.md) remains PROPOSED and its M2-M4 sequence conflicts with the release plan. The [team plan](TEAM_ORGANIZATION_EXECUTION_PLAN.md) requires owner reconciliation; this file does not establish M3 messaging, a launch encryption default or full-MVP channel scope as accepted decisions.
- The source defines three E2E agent-access designs (A/B/C) but does not select one; selection is C19-D07 and requires the cryptography review gate.
- All implementation, protocol, key-ceremony and sync evidence is NOT RUN. IDs identify planned contracts and checks, not executed work.
- The source ends at 19.34 without a numbered final-decision ledger; the 12 domain principles in [19.2](../Chapter19.md#L65) are adopted verbatim as the source requirement ledger below. Added workflows and state tables are explicitly proposed design.

## 2. Exact Source Domain Principles

All 12 principles in [19.2](../Chapter19.md#L65) are retained verbatim. They bind REST, WebSocket, workers, clients and agents together.

| ID | Source principle |
| --- | --- |
| C19-R01 | Messages belong to a conversation. |
| C19-R02 | Conversations belong to a communication scope. |
| C19-R03 | Every participant has an explicit membership or authorization relationship. |
| C19-R04 | Message ordering is scoped to a conversation. |
| C19-R05 | Delivery state is separate from read state. |
| C19-R06 | Presence is ephemeral and must not be treated as permanent data. |
| C19-R07 | Attachments are separate objects with independent authorization. |
| C19-R08 | Agents receive only explicitly authorized context. |
| C19-R09 | End-to-end encryption and server-side agent processing require a deliberate cryptographic design. |
| C19-R10 | Message sending must be idempotent. |
| C19-R11 | Realtime delivery must be recoverable through synchronization. |
| C19-R12 | Deleted or edited messages must have defined behavior for caches, search indexes, notifications, and exports. |

## 3. Source Topic Coverage

All 34 numbered source sections are retained with exact titles. Coverage does not imply the source provides a selected protocol, verified provider behavior or executed tests.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C19-S01 | Purpose and Scope | [19.1](../Chapter19.md#L3) |
| C19-S02 | Communication Domain Principles | [19.2](../Chapter19.md#L65) |
| C19-S03 | Communication Model | [19.3](../Chapter19.md#L93) |
| C19-S04 | Conversation Lifecycle | [19.4](../Chapter19.md#L157) |
| C19-S05 | Conversation Membership | [19.5](../Chapter19.md#L258) |
| C19-S06 | Message Model | [19.6](../Chapter19.md#L343) |
| C19-S07 | Message Sending Flow | [19.7](../Chapter19.md#L408) |
| C19-S08 | Idempotency and Duplicate Prevention | [19.8](../Chapter19.md#L446) |
| C19-S09 | Message Ordering | [19.9](../Chapter19.md#L486) |
| C19-S10 | Delivery and Read States | [19.10](../Chapter19.md#L534) |
| C19-S11 | Offline-First Messaging | [19.11](../Chapter19.md#L610) |
| C19-S12 | Realtime Transport | [19.12](../Chapter19.md#L667) |
| C19-S13 | Realtime Event Envelope | [19.13](../Chapter19.md#L739) |
| C19-S14 | Presence Architecture | [19.14](../Chapter19.md#L785) |
| C19-S15 | Typing Indicators | [19.15](../Chapter19.md#L853) |
| C19-S16 | End-to-End Encryption Architecture | [19.16](../Chapter19.md#L894) |
| C19-S17 | E2E Encryption Modes | [19.17](../Chapter19.md#L916) |
| C19-S18 | Encryption Key Architecture | [19.18](../Chapter19.md#L1000) |
| C19-S19 | Message Metadata and Privacy | [19.19](../Chapter19.md#L1062) |
| C19-S20 | Attachments and Media | [19.20](../Chapter19.md#L1106) |
| C19-S21 | Message Editing and Deletion | [19.21](../Chapter19.md#L1170) |
| C19-S22 | Reactions, Replies, Threads, and Mentions | [19.22](../Chapter19.md#L1202) |
| C19-S23 | Agent Messaging Architecture | [19.23](../Chapter19.md#L1270) |
| C19-S24 | Moderation and Reporting | [19.24](../Chapter19.md#L1356) |
| C19-S25 | Search Architecture | [19.25](../Chapter19.md#L1415) |
| C19-S26 | Notification Architecture | [19.26](../Chapter19.md#L1453) |
| C19-S27 | APIs | [19.27](../Chapter19.md#L1508) |
| C19-S28 | Database Model | [19.28](../Chapter19.md#L1604) |
| C19-S29 | Android Screens | [19.29](../Chapter19.md#L1666) |
| C19-S30 | Web/Desktop Screens | [19.30](../Chapter19.md#L1749) |
| C19-S31 | Performance and Scaling | [19.31](../Chapter19.md#L1793) |
| C19-S32 | Security Architecture | [19.32](../Chapter19.md#L1866) |
| C19-S33 | Observability | [19.33](../Chapter19.md#L1936) |
| C19-S34 | Failure Handling | [19.34](../Chapter19.md#L2003) |

## 4. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved contract | Status |
| --- | --- | --- | --- |
| C19-D01 | Conversation and membership canonicalization | Reconcile source conversation types ([19.3.1](../Chapter19.md#L115)) with Chapter 3/6 Space models and explicit participant admission/history. Parent Space membership does not automatically join every conversation; public-read and participant-write permissions remain distinct. | PROPOSED |
| C19-D02 | Message identity and idempotency | Client-generated `client_message_id` unique per (conversation, sender); server ID and per-conversation sequence allocated transactionally; retries return the canonical message, never a duplicate. | PROPOSED |
| C19-D03 | Ordering and synchronization | Per-conversation monotonic sequence; consistent snapshot watermark plus bounded catch-up with an explicit `requires_full_sync` path (C7-D09); cursors persisted with applied state. | PROPOSED |
| C19-D04 | Delivery and read model | Persisted, device-received, decrypted, read and business acknowledgment remain distinct. Group cursor/interval/per-message optimizations require explicit eligible-history coverage and multi-device aggregation; a maximum observed sequence is not proof all earlier messages were received or read. | PROPOSED |
| C19-D05 | Encryption mode selection | Choose a disclosed mode per conversation class. Server-readable encryption is an unapproved baseline option, not an adopted MVP default. True E2E needs a reviewed protocol and explicit endpoint/history policy; Agent access may remain disabled or use a separately approved disclosure design. | OPEN |
| C19-D06 | Key architecture and custody | Select key types, device custody (Keystore/WebCrypto/secure enclave), rotation triggers, multi-device enrollment and backup/recovery separation; key recovery policy is a separate C18-linked decision. | OPEN |
| C19-D07 | Agent access under E2E | Select no Agent access or a separately approved Design A (authorized conversation device), B (user-approved message forwarding) or C (local agent processing) from [19.17.3](../Chapter19.md#L958). Disclose the actual plaintext recipients and provider processing; no design may hide backend access behind a human-only E2E claim. | OPEN |
| C19-D08 | Offline command allowlist | Queue only reviewed ordinary sends with stable IDs and bounded reconciliation; approvals, invitations, moderation and destructive/external actions require online confirmation (aligns C8-D06). | PROPOSED |
| C19-D09 | Edit and delete semantics | Author-edit window, moderator-only paths, tombstones propagated to caches/indexes/notifications/exports; for true E2E, deletion is honest about already-authorized devices. | PROPOSED |
| C19-D10 | Attachments and media | Separate immutable attachment records and current download authority. Server-readable content follows scan/quarantine rules; opaque E2E content needs a disclosed reviewed endpoint-safety design or the incompatible feature remains blocked. Ciphertext scanning cannot certify plaintext safety. | PROPOSED |
| C19-D11 | Presence and typing limits | Ephemeral TTL state, rate-limited, privacy-minimized presence; typing indicators never persisted and never shown to unauthorized viewers. | PROPOSED |
| C19-D12 | Reactions, replies, threads, mentions | Canonical records with uniqueness constraints, thread inheritance from the parent conversation, participant-validated mentions with rate and abuse limits. | PROPOSED |
| C19-D13 | Agent messaging | Agent participants are typed and labeled; agent messages are never disguised as human messages; agent-to-agent traffic uses the reviewed structured protocol from [Chapter 7](../Chapter7.md) with bounded scope, hops, time and aggregate budgets. | PROPOSED |
| C19-D14 | Performance and fanout budgets | Define connection limits, fanout strategy (shared vs per-conversation streams), retention of the realtime journal and measurable SLOs before load claims; source figures are not benchmarks. | OPEN |

These ten proposals and four open decisions remain unapproved. C19-D05 through C19-D07 gate any true-E2E claim; no milestone may advertise E2E before the cryptography review passes.

## 5. Conversation and Membership Model

Source: [19.3](../Chapter19.md#L93), [19.4](../Chapter19.md#L157), [19.5](../Chapter19.md#L258). Proposed canonical rules:

- Conversation types reconcile to: `direct`, `space_group`, `space_agent`, `private_agent`, `page_discussion`, `event`, `announcement`, `system`. Space-linked conversations always reference an authorized Space (C19-D01); a `direct` conversation is a resource in its own right with its own membership.
- The earlier `draft -> active -> locked -> read_only -> archived -> deletion_pending -> deleted` sketch is a local proposal, not an adopted sequence copied from Space states. Publication, shared lock/restriction, personal mute, archive, expiry and deletion/retention need separate reviewed transition contracts.
- Membership is explicit per conversation even inside a Space (a Space member is not automatically in every conversation); roles are `owner/admin/moderator/member/guest/observer/agent` with `agent` never counted as a human member.
- Membership changes (add/remove/leave/ban) take effect at the transaction boundary: removed members lose new access immediately, while history visibility follows C3-D05/C3-D06 epoch rules and key-rotation policy (C19-D06).
- Conversation audience/visibility participates in read and discovery policy; membership/history, public-read eligibility and action permissions must also be checked. A public viewer need not be a member where anonymous reads are intentionally allowed, but that never grants posting, files or private history.

## 6. Message Lifecycle Workflows

### C19-W01 Send, Persist and Fanout

Source: [19.7](../Chapter19.md#L408), [19.8](../Chapter19.md#L446), [19.9](../Chapter19.md#L486), [19.10](../Chapter19.md#L534).

1. Client generates `client_message_id`, renders locally as pending, and sends via REST command (C7-D03).
2. Authenticate the actual non-null human/Agent/system actor and current conversation/parent/device/history policy. Personal notification mute is not a posting restriction. Validate bounded structured payload, mode/epoch and attachment/reply scope without pretending an opaque E2E body is server-readable.
3. Commit one canonical message, commit-safe per-conversation order and required audit/outbox/work intent before acknowledgment. A later sync barrier cannot skip a lower allocated sequence that commits afterward. Duplicate effects use stable identity and durable reconciliation, not just a queue's published flag.
4. The outbox dispatcher fans out authorized realtime events; missed events are recovered by sync (C19-W02), never by re-sending the message.
5. Delivery/read/decryption states are separate participant/device facts. A compact receipt cursor requires defined gap/history coverage and current sharing policy; no highest-sequence shortcut or naive unread subtraction. Provider acceptance and push delivery do not prove human reading or domain acknowledgment.

### C19-W02 Offline, Reconnect and Synchronization

Source: [19.11](../Chapter19.md#L610), [19.12](../Chapter19.md#L667), [19.13](../Chapter19.md#L739).

1. Offline sends persist locally as queued with their `client_message_id`; queued sends are never silently discarded and retry through the durable outbox on the client (WorkManager) with bounded attempts.
2. On reconnect the client re-authenticates, restores server-defined subscriptions (never client-asserted scopes), and resumes from its last event cursor.
3. The server returns missed events in order or an explicit `requires_full_sync` with resource scopes; the client applies events idempotently by event ID and reconciles queued sends to their canonical outcomes.
4. Durable event position differs from original message sequence, resource version and crypto epoch. Authorized snapshot/replay handles actual missing eligible state; hidden/global gaps are not automatically readable history. Stable local/canonical identity and data-plus-cursor/outbox commit together under the client contracts.
5. E2E recovery transfers only authorized sealed content and reviewed protocol artifacts, never raw endpoint private keys. Ratchet/nonce state and sealed outbox persistence require the selected library's tested crash/concurrency strategy. Reconcile an unknown accepted send before re-encrypting or minting a fresh command ID; no plaintext fallback.

### C19-W03 Editing and Deletion

Source: [19.21](../Chapter19.md#L1170). Implements C19-R12 across every projection.

- Authors may edit within a configured window; edits carry an edited marker and version, and significant changes may trigger re-moderation (Chapter 2 rule).
- Deletion types are explicit: `delete_for_me`, `delete_for_everyone`, `moderator_remove`, `retention_expired`, `temporary_message_expired`; each defines its effect on history, receipts, unread counts, notifications, search indexes, attachments and exports.
- Deletion writes a tombstone transactionally with its outbox event; downstream consumers (indexes, caches, client stores) apply removals idempotently.
- For true E2E conversations, the server cannot guarantee removal from every already-authorized device or backup; UI copy must not promise impossible deletion, and moderation of E2E content is limited to metadata, reports and consented evidence (C16-D10).

### C19-W04 Attachments and Media

Source: [19.20](../Chapter19.md#L1106), [Chapter 14](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md).

1. An attachment is a separate record linked to a message with its own authorization, processing status and (for E2E) its own encrypted file key.
2. Upload follows Chapter 14's immutable source-version and current audience contract. Actual plaintext scanning/quarantine gates apply where the selected mode exposes plaintext to an authorized scanner. Server checksum/scan of opaque E2E bytes is not a plaintext safety verdict; require an explicitly reviewed endpoint-processing path or leave the incompatible capability unavailable.
3. Thumbnails, metadata, filenames and attachment keys follow the actual encryption/disclosure boundary. Safe endpoint/server rendering, parser limits and current download authorization are required; no silent plaintext upload to generate a preview.
4. Removal blocks newly disallowed server access and future key distribution at the documented boundary. An expiring download URL alone does not ensure immediate revocation, and old device-held keys or copies cannot be recalled.

### C19-W05 Presence and Typing Indicators

Source: [19.14](../Chapter19.md#L785), [19.15](../Chapter19.md#L853). Implements C19-R06.

- Source presence values are `online/away/busy/do_not_disturb/offline/invisible`. Live status uses bounded per-device TTL leases and current privacy; expiry or Redis loss means unknown availability under policy, not evidence of a person's intent. Do not persist every heartbeat as permanent truth.
- Exact activity timestamps are not exposed beyond what the user's privacy settings permit; hidden conversation membership never leaks through presence.
- Typing indicators are ephemeral events, rate-limited, expired by inactivity timeout, cleared on disconnect, persisted nowhere, and never delivered to non-members.

## 7. End-to-End Encryption Contract

Source: [19.16](../Chapter19.md#L894), [19.17](../Chapter19.md#L916), [19.18](../Chapter19.md#L1000), [19.19](../Chapter19.md#L1062). This section records alternatives, not a resolved cryptography decision. Its local C19-D05 through C19-D07 remain OPEN; the detailed draft separately gates protocol, modes, device authority, recovery and Agent disclosure.

### 7.1 Disclosed Modes

| Mode | Who can read content | Server-side search | Moderation | Agent access | Status |
| --- | --- | --- | --- | --- | --- |
| `server_encrypted` | Authorized server processes (TLS + at-rest encryption; not E2E) | Only authorized server-readable sources | Scoped reviewed capabilities, not unrestricted access | Current purpose/scope/provider approval | Unapproved candidate |
| `end_to_end_encrypted` | Endpoint devices only | Unavailable | Metadata/reports/consented evidence only | Only via C19-D07 design | Gated |
| `client_side_agent` | Only the actual approved local endpoints unless content is explicitly disclosed elsewhere | Device-local available history; remote search is another disclosure | Only supported disclosed capabilities | Local only if model, tools and telemetry actually stay local | Unapproved processing arrangement, not a selected encryption protocol |

The system must never claim "end-to-end encrypted" while the server or a default agent can decrypt all content (source red-line; Chapter 11 §11.17).

### 7.2 Agent-Access Designs Under True E2E (C19-D07)

**Design A: Agent as an Authorized Conversation Device.** A specifically approved Agent endpoint becomes a cryptographic recipient under the actual participant/history/disclosure policy. Its key custody and downstream model/tool providers change who can read content. Do not describe a backend-readable Agent copy as human-endpoints-only privacy. Device verification, rekey/revocation and retained-plaintext limits require real implementation evidence.

**Design B: User-Approved Message Forwarding.** An authorized user selects locally decrypted content for the declared Agent recipient. This limits the selected context but still needs authority over the disclosed data, exact review, secure delivery and separate copy/provider retention. It does not require the Agent to receive the original conversation's key; it is not key-free, automatically MVP-safe or guaranteed private under every threat model.

**Design C: Local Agent Processing.** Actual local model/tool/telemetry processing can avoid some remote disclosure. Device capability, secure storage, updates and evaluations remain unverified; neither full assistance nor infeasibility for a release is established by this draft. A remote tool or inference request is an additional disclosure.

**Retained preference, not approval:** this alternate favors evaluating selected forwarding for early permitted E2E assistance. The detailed draft also permits no Agent access. Protocol/mode/default/history/provider and participant-consent choices remain OPEN; server-readable-first or deferring local inference are alternatives requiring review, not an established least-risk choice or consequence of the proposed milestone ADR.

### 7.3 Key Lifecycle Rules

- Key types: account identity key, device key, conversation key, message key, attachment key, agent device key, backup key (source 19.18.1).
- Use a maintained reviewed protocol/library and verify actual Keystore/WebCrypto/hardware protections. An encrypted-private-key field is not automatic permission for backend key custody. Any user-wrapped backup needs an explicitly approved recovery design; ordinary services must not gain usable true-E2E private keys. Browser-delivered code and updates remain part of the trusted endpoint.
- Rotation triggers: device removed, member removed/leaves, device compromise, algorithm/version change, agent access revoked (source 19.18.3).
- New history/key grants after removal/rejoin are explicit policy choices. Rotation cannot erase old keys/plaintext already received. Domain and authenticated cryptographic membership changes must coordinate at a defined send boundary; a database version increment alone does not prove rekeying occurred.
- Backup/recovery of keys is a separate high-risk decision (C18-D04 adjacency); recovery of login must never silently recover encryption keys (source rule).

### 7.4 Metadata Minimization

Ciphertext does not by itself hide routing, membership, timing, size or delivery metadata. Minimize what the actual protocol exposes; current presence/receipt/source privacy still applies. Do not send sensitive/E2E message previews to push or ordinary telemetry. IDs and hashes can be personal data too; use minimal protected correlation, not routinely logged decrypted previews. The delivery contract owns channel redaction and consent.

## 8. Agent Messaging Architecture

Source: [19.23](../Chapter19.md#L1270), [Chapter 12](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [Chapter 5](../Chapter5.md). Implements this alternate's C19-R08 and C19-D13 subject to the detailed draft's current disclosure and protocol gates.

- Agent participants are typed (`personal_agent`, `space_agent`, `conversation_agent`) and always labeled in UI and data; an agent message is never stored or rendered as a human message (sender type is explicit, Chapter 4 rule).
- Agent participation in a conversation requires explicit membership or delegation per Chapters 3/12/18; the agent reads only messages its scope and consent permit, at context-assembly time, permission-aware before ranking (never "retrieve all, ask the model to skip").
- Agent-originated sends follow C19-W01 exactly: same idempotency, authorization, persistence and receipt rules; agent messages cannot bypass quiet hours, consent or the Chapter 20 policy engine.
- Agent-to-agent messages use the structured envelope (request/response/approval/failure/cancel/handoff) with hop counts, visited-agent sets, deadlines and budget limits; natural-language agent-to-agent loops are forbidden.
- Every agent message and tool effect retains run/tool-call provenance for audit and user inspection; memory writes from conversations follow Chapter 12 consent and scope rules.

## 9. Moderation, Search and Notification Boundaries

Source: [19.24](../Chapter19.md#L1356), [19.25](../Chapter19.md#L1415), [19.26](../Chapter19.md#L1453).

- Reporting is available for messages/conversations within the privacy model: the reporter's own view plus consented evidence only; private-message and E2E evidence handling is a C16-D10 decision, not a default capability.
- Moderators act under Chapter 16 authority: no access to private conversations outside the space, no private agent memory, no platform-level ban from a Space role (source §16.21 restrictions apply here).
- Message search: server-side search exists only where the mode permits (`server_encrypted`); search indexing follows visibility and consent, excludes deleted/restricted content, and revalidates authorization before display (Chapter 15 rules). True-E2E conversations have no server-side body search — users search locally on device.
- Permitted notifications use the [delivery draft](CHAPTER_20_DELIVERY_CONTRACT.md), with stable logical effects, current recipient policy and redacted external hints. Not every message necessarily creates an inbox notification. Message unread state follows eligible conversation coverage and receipt rules, not provider or notification read state.
- Exports reauthorize the exact source/history and data-rights purpose under the identity/privacy contracts. True-E2E plaintext export requires an authorized endpoint with the necessary keys; neither account recovery nor operator access supplies missing keys.

## 10. API and Event Inventory

The Chapter 7 contract owns the envelope and canonical route inventory (C7-D01/D14). This contract contributes the messaging operations under `/v1` (proposed):

| ID | Operation | Boundary notes |
| --- | --- | --- |
| C19-P01 | `GET /v1/conversations` | Only authorized conversations; bounded cursor; excludes hidden membership unless permitted. |
| C19-P02 | `POST /v1/conversations` | Server-derived creator; type/scope/participants validated against current policy. |
| C19-P03 | `GET /v1/conversations/{id}` | Current membership; minimal projection for non-members. |
| C19-P04 | `GET /v1/conversations/{id}/messages` | Bounded current-authorized history and exact sequence semantics; E2E returns permitted sealed payload/protocol references, not raw private keys. |
| C19-P05 | `POST /v1/conversations/{id}/messages` | C19-W01; idempotency-keyed; returns canonical message with server sequence. |
| C19-P06 | `PATCH /v1/messages/{id}` | Exact author/owned-system-content policy and version; moderation removal must not impersonate another author's edit. |
| C19-P07 | `DELETE /v1/messages/{id}` | Explicit deletion type; tombstone + outbox; honest E2E limits. |
| C19-P08 | `POST /v1/conversations/{id}/read` | Actor-derived; advances per-member read cursor. |
| C19-P09 | `POST /v1/conversations/{id}/members` | Inviter authority; Space-policy checks; no hidden enrollment. |
| C19-P10 | `DELETE /v1/conversations/{id}/members/{user_id}` | Current actor/target roles; triggers key-rotation evaluation. |
| C19-P11 | `POST /v1/messages/{id}/reactions` / `DELETE ...` | One reaction per type per user; idempotent. |
| C19-P12 | `POST /v1/messages/{id}/report` | Reporter-scoped; routes to Chapter 16 intake. |
| C19-P13 | `GET /v1/sync` | Cursor-based catch-up; `requires_full_sync` path with resource scopes (C7-D09). |

Proposed realtime events (Chapter 7 envelope, C19-S13): `conversation.created`, `conversation.member_added/removed`, `message.created`, `message.edited`, `message.deleted`, `message.receipt.updated`, `conversation.read.updated`, `presence.updated`, `typing.started/stopped`, `attachment.processed`, `conversation.updated`. These are proposals pending C7-D08; all carry event ID, sequence, scope and schema version, and clients deduplicate by event ID.

## 11. Client Contract

Android and web follow the [Android](CHAPTER_08_ANDROID_CONTRACT.md) and [web](CHAPTER_09_WEB_CONTRACT.md) contracts: managed account-scoped connections, stable local/canonical message identity, atomic data/cursor/outbox, explicit browser-persistence policy and protected crypto-state ownership where E2E is enabled. Temporary offline sends survive only under the declared local-storage/key lifecycle; logout, uninstall and key loss have honest limits. Show pending acceptance, device receipt, pending decryption and read separately. Attachment scan/preview behavior depends on actual mode, and unread counts require eligible-history coverage. Current backend/device authority, not a cached role or key label, controls subsequent access.

## 12. Proposed Verification and Synthetic Controls

All evidence below is NOT RUN until authorized implementation. This alternate has no local C19-Vxx definitions. `MSG:C19-Vxx` references in the handoff table resolve only in the [detailed messaging draft](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md), which supplies the concrete verification families. Required scenarios retained from this alternate:

- Two synthetic members send/receive; kill the API mid-send and the dispatcher mid-fanout (no duplicate, no loss; canonical state on reload).
- Retry the same `client_message_id` from a second device (one message; canonical result for both).
- Event-gap injection: drop a required authorized stream event and prove consistent snapshot/catch-up. Global or filtered message-sequence gaps do not grant otherwise hidden history.
- `requires_full_sync` path after journal expiry; cursor and applied state persisted together across restart.
- Offline queue: airplane-mode send survives app kill; on reconnect the queued send persists exactly once; a revoked membership between queue and send is denied safely.
- Member removal mid-conversation: new sends fail, history per C3-D05/C3-D06, attachment downloads denied, key rotation evaluated per C19-D06.
- Edit/delete propagation to client stores, unread counts, notifications and (server-encrypted) search; deletion honesty checks for E2E copy.
- Concurrent reactions and read-cursor updates (idempotent, no lost updates).
- Typing/presence TTL expiry, disconnect clearing, and non-member non-delivery.
- Agent message: labeled, in-scope context only, approval-gated external draft, structured agent-to-agent envelope with hop/budget limits enforced.
- E2E fixture, only after mode/protocol approval: actual library conformance/interoperation/tamper/crash evidence, authenticated device/roster changes, key/history recovery and the approved Agent disclosure or no-access design. Placeholder ciphertext is not proof of server blindness or secure key management.
- Load sanity: bounded fanout under synthetic scale with connection and queue limits — as a budget check, not a benchmark claim.

## 13. Developer Handoff and Delivery Sequence

| Ticket | Accountable role | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C19-T01 | Product/messaging/security leads, Teams A/C/E | Applicable proposed ADR and owning-contract reviews | Resolve this alternate's open/proposed choices against the detailed review reference. Milestone, mode and protocol choices are not approved here. |
| C19-T02 | Backend messaging engineer, Team C | Reviewed data/API/identity contracts | Current authority, canonical identity, commit-safe order and durable acceptance; MSG:C19-V01 through MSG:C19-V06. |
| C19-T03 | Realtime engineer, Team C | Reviewed event/snapshot contract and C19-T02 | Authenticated replay, distinct ordering, receipt coverage and ephemeral privacy; MSG:C19-V07, MSG:C19-V09 through MSG:C19-V12. |
| C19-T04 | Client engineers, Team B | C19-T02, C19-T03; actual protocol integration if released | Stable offline/local state and truthful accessible mode/device/receipt UX; MSG:C19-V08, MSG:C19-V16, MSG:C19-V20, MSG:C19-V28. |
| C19-T05 | Files integration engineer, Team C | Reviewed Chapter 14 and messaging mode | Immutable authorized attachments, actual plaintext-aware safety and scoped/local search; MSG:C19-V21 through MSG:C19-V23. |
| C19-T06 | Agent engineers, Team D | Reviewed Chapter 12 and messaging disclosure mode | Attributed bounded context/tool access with exact disclosure and no prohibited MVP powers; MSG:C19-V24. |
| C19-T07 | Security/privacy engineers, Team E | C19-T02; selected protocol and actual custody design if released | Real protocol/enrollment/backup/endpoint evidence and reporting/retention privacy; MSG:C19-V13 through MSG:C19-V20, MSG:C19-V25, MSG:C19-V26, MSG:C19-V30. |
| C19-T08 | QA/release, Teams C/E | C19-T02 through C19-T07 for released scope | Execute applicable MSG:C19-V01 through MSG:C19-V32, including load/fault/recovery, and record limits. These are references to planned evidence, not test results. |

Tickets are handoff packages, not staffed people or executed work. Each delivers source/requirement IDs, API/migration notes, failure/race cases, tests and commands, ADRs where policy changes, runbooks and known limitations.

## 14. Demonstration, Remaining Risks and Planning-Set Completion

### Separate Synthetic Messaging Demonstration

A future demo, not an executed run: synthetic participants send/edit/delete on Android/core web, recover the same canonical logical message after accepted-response/fanout faults, reconcile offline state and authorized event gaps, and reject newly disallowed access after removal. Provider delivery/read and local decryption are independently evidenced, not an exactly-once network guarantee. A separately released Agent path remains within actual MVP/tool/approval restrictions; approval cannot enable a prohibited external action. E2E requires its separately approved real protocol/device/security checks, not merely this demonstration.

### Open Boundaries

- Ten PROPOSED and four OPEN decisions remain unapproved; true E2E does not exist until C19-D05–D07 pass cryptography review, and no mode may be advertised before its disclosure copy is approved.
- Protocol/library selection, authenticated device enrollment, multi-device state and key recovery are unselected. Ratcheting/key agreement and sender-metadata protection such as sealed-sender mechanisms address different properties; they are not interchangeable full-protocol alternatives. Use qualified review and the actual selected implementation's evidence.
- Fanout/connection budgets, journal retention and SLO targets are unmeasured; source figures are illustrations, not promises.
- Moderator/E2E tension (lawful access, consented evidence, child safety) is a legal and policy decision (C16-D10), not an engineering default.
- Critical observed leaks (cross-conversation reads, E2E red-line failure, duplicate effects, membership bypass) block the affected release; unrun tests are not passes.

### Planning Coverage and Next Review

The observed planning set contains drafts for 17 distinct chapter numbers, with duplicate Chapter 19 and Chapter 20 files. Chapters 2, 4 and 5 have no separately named chapter contract; overlap with later drafts must be traced before claiming complete coverage. Reading every source, drafting a contract and verifying runtime behavior are separate accomplishments.

Next is to reconcile this alternate with the [detailed messaging draft](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md), reconcile the delivery drafts, and review the existing proposed ADRs with the [team plan's decision owners](TEAM_ORGANIZATION_EXECUTION_PLAN.md). Existing policy choices remain OPEN or PROPOSED, not accepted by document consolidation. Detailed M1 backlog preparation and separately authorized scaffolding follow their actual prerequisites; this note does not authorize implementation or live providers.

