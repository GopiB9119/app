# Chapter 7: API, Events and Realtime Synchronization Contract

Status: DRAFT FOR PRODUCT, CLIENT, BACKEND AND SECURITY REVIEW. This is a proposed communication contract, not generated OpenAPI, running endpoints, implemented clients or verified transport behavior.

Source-of-truth role: the [documentation map](README.md) names this contract as the authority for the intended API contracts, at level 5 of the [authority hierarchy](PRODUCT_CONSTITUTION.md#article-4-authority-hierarchy). The API actually built is described by the generated [openapi.json](../packages/openapi/openapi.json), which is evidence of the implementation (level 8).

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity contract](CHAPTER_18_IDENTITY_CONTRACT.md), [Space contract](CHAPTER_03_SPACE_CONTRACT.md) and [data contract](CHAPTER_06_DATA_CONTRACT.md). It develops C1-T05, C18-V22, C3-D11 and C6-T12 into a shared client/backend handoff.

- [Chapter 7](Chapter7.md) is the source for REST, WebSocket, internal RPC, queue, webhook and synchronization behavior. Preserve source inventories without assuming the illustrative routes or envelopes are already canonical across chapters.
- The source ends at [7.31 Rate Limiting](Chapter7.md#L1542) with 'Rate limits should'. It has no completed rate policy or final acceptance list. New protocol details, limits, missing operations and tests are proposals, not recovered source text.
- M1 remains verified identity, private family admission, an ordinary shared task, one-time in-app reminder and acknowledgment. Public content, messaging, Agent and advanced integrations follow the release scope; a route's presence here does not add a capability to M1.
- Earlier product/policy/provider/encryption decisions remain pending. No original chapter or earlier draft is modified. No code, dependency install, live message, server, database or deployment is authorized by this planning continuation.
- All API/runtime acceptance evidence is NOT RUN. Document checks verify inventories and consistency, not endpoint correctness, authorization, delivery, recovery or production readiness.

## 2. Source Topic Coverage

All 31 numbered source topics are retained with exact titles and anchors.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C7-S01 | Purpose | [7.1](Chapter7.md#L3) |
| C7-S02 | Communication Architecture | [7.2](Chapter7.md#L35) |
| C7-S03 | Communication Protocol Decision | [7.3](Chapter7.md#L65) |
| C7-S04 | REST API Design | [7.4](Chapter7.md#L214) |
| C7-S05 | Authentication | [7.5](Chapter7.md#L262) |
| C7-S06 | Authorization Model | [7.6](Chapter7.md#L301) |
| C7-S07 | Standard API Response Format | [7.7](Chapter7.md#L365) |
| C7-S08 | API Error Categories | [7.8](Chapter7.md#L420) |
| C7-S09 | Core API Surface | [7.9](Chapter7.md#L569) |
| C7-S10 | Pagination | [7.10](Chapter7.md#L693) |
| C7-S11 | Idempotency | [7.11](Chapter7.md#L733) |
| C7-S12 | WebSocket Architecture | [7.12](Chapter7.md#L773) |
| C7-S13 | WebSocket Event Envelope | [7.13](Chapter7.md#L803) |
| C7-S14 | WebSocket Client Events | [7.14](Chapter7.md#L844) |
| C7-S15 | WebSocket Reconnection | [7.15](Chapter7.md#L879) |
| C7-S16 | Missed Event Recovery | [7.16](Chapter7.md#L912) |
| C7-S17 | Message Sending Architecture | [7.17](Chapter7.md#L959) |
| C7-S18 | Message Delivery States | [7.18](Chapter7.md#L993) |
| C7-S19 | Internal Service Communication | [7.19](Chapter7.md#L1019) |
| C7-S20 | Example gRPC Service Boundaries | [7.20](Chapter7.md#L1053) |
| C7-S21 | Message Queue Architecture | [7.21](Chapter7.md#L1104) |
| C7-S22 | Queue Job Envelope | [7.22](Chapter7.md#L1152) |
| C7-S23 | Retry Policy | [7.23](Chapter7.md#L1177) |
| C7-S24 | Dead-Letter Queue | [7.24](Chapter7.md#L1224) |
| C7-S25 | Agent Communication Flow | [7.25](Chapter7.md#L1262) |
| C7-S26 | Agent-to-Agent Communication | [7.26](Chapter7.md#L1304) |
| C7-S27 | Preventing Agent Loops | [7.27](Chapter7.md#L1363) |
| C7-S28 | External Messaging Architecture | [7.28](Chapter7.md#L1409) |
| C7-S29 | Webhook Processing | [7.29](Chapter7.md#L1473) |
| C7-S30 | Realtime Presence | [7.30](Chapter7.md#L1512) |
| C7-S31 | Rate Limiting | [7.31](Chapter7.md#L1542) |

## 3. Exact Core API Inventory

These are all 77 method/path pairs in source section 7.9, in source order. They are an inventory, not a second implementation of Chapter 18's generic resource routes or Chapter 3's nested routes. Source examples outside section 7.9 are addressed separately where their meaning differs.

| ID | Source operation | Domain |
| --- | --- | --- |
| C7-P01 | `POST /v1/auth/register` | Identity |
| C7-P02 | `POST /v1/auth/login` | Identity |
| C7-P03 | `POST /v1/auth/logout` | Identity |
| C7-P04 | `POST /v1/auth/refresh` | Identity |
| C7-P05 | `POST /v1/auth/verify-email` | Identity |
| C7-P06 | `POST /v1/auth/verify-phone` | Identity |
| C7-P07 | `GET /v1/me` | Identity |
| C7-P08 | `PATCH /v1/me` | Identity |
| C7-P09 | `GET /v1/me/sessions` | Identity |
| C7-P10 | `DELETE /v1/me/sessions/{session_id}` | Identity |
| C7-P11 | `POST /v1/spaces` | Spaces |
| C7-P12 | `GET /v1/spaces` | Spaces |
| C7-P13 | `GET /v1/spaces/{space_id}` | Spaces |
| C7-P14 | `PATCH /v1/spaces/{space_id}` | Spaces |
| C7-P15 | `DELETE /v1/spaces/{space_id}` | Spaces |
| C7-P16 | `GET /v1/spaces/{space_id}/members` | Spaces |
| C7-P17 | `POST /v1/spaces/{space_id}/members` | Spaces |
| C7-P18 | `PATCH /v1/spaces/{space_id}/members/{user_id}` | Spaces |
| C7-P19 | `DELETE /v1/spaces/{space_id}/members/{user_id}` | Spaces |
| C7-P20 | `POST /v1/spaces/{space_id}/invitations` | Spaces |
| C7-P21 | `GET /v1/spaces/{space_id}/policies` | Spaces |
| C7-P22 | `PATCH /v1/spaces/{space_id}/policies` | Spaces |
| C7-P23 | `GET /v1/pages` | Community |
| C7-P24 | `POST /v1/pages` | Community |
| C7-P25 | `GET /v1/pages/{page_id}` | Community |
| C7-P26 | `PATCH /v1/pages/{page_id}` | Community |
| C7-P27 | `GET /v1/pages/{page_id}/posts` | Community |
| C7-P28 | `POST /v1/pages/{page_id}/posts` | Community |
| C7-P29 | `GET /v1/posts/{post_id}` | Community |
| C7-P30 | `PATCH /v1/posts/{post_id}` | Community |
| C7-P31 | `DELETE /v1/posts/{post_id}` | Community |
| C7-P32 | `POST /v1/posts/{post_id}/comments` | Community |
| C7-P33 | `GET /v1/posts/{post_id}/comments` | Community |
| C7-P34 | `POST /v1/posts/{post_id}/reactions` | Community |
| C7-P35 | `DELETE /v1/posts/{post_id}/reactions` | Community |
| C7-P36 | `GET /v1/conversations` | Messaging |
| C7-P37 | `POST /v1/conversations` | Messaging |
| C7-P38 | `GET /v1/conversations/{conversation_id}` | Messaging |
| C7-P39 | `GET /v1/conversations/{conversation_id}/messages` | Messaging |
| C7-P40 | `POST /v1/conversations/{conversation_id}/messages` | Messaging |
| C7-P41 | `PATCH /v1/messages/{message_id}` | Messaging |
| C7-P42 | `DELETE /v1/messages/{message_id}` | Messaging |
| C7-P43 | `POST /v1/conversations/{conversation_id}/read` | Messaging |
| C7-P44 | `GET /v1/conversations/{conversation_id}/members` | Messaging |
| C7-P45 | `GET /v1/tasks` | Planning |
| C7-P46 | `POST /v1/tasks` | Planning |
| C7-P47 | `GET /v1/tasks/{task_id}` | Planning |
| C7-P48 | `PATCH /v1/tasks/{task_id}` | Planning |
| C7-P49 | `DELETE /v1/tasks/{task_id}` | Planning |
| C7-P50 | `GET /v1/events` | Planning |
| C7-P51 | `POST /v1/events` | Planning |
| C7-P52 | `GET /v1/events/{event_id}` | Planning |
| C7-P53 | `PATCH /v1/events/{event_id}` | Planning |
| C7-P54 | `DELETE /v1/events/{event_id}` | Planning |
| C7-P55 | `GET /v1/reminders` | Planning |
| C7-P56 | `POST /v1/reminders` | Planning |
| C7-P57 | `PATCH /v1/reminders/{reminder_id}` | Planning |
| C7-P58 | `DELETE /v1/reminders/{reminder_id}` | Planning |
| C7-P59 | `GET /v1/agents` | Agent |
| C7-P60 | `POST /v1/agents` | Agent |
| C7-P61 | `GET /v1/agents/{agent_id}` | Agent |
| C7-P62 | `PATCH /v1/agents/{agent_id}` | Agent |
| C7-P63 | `POST /v1/agent-runs` | Agent |
| C7-P64 | `GET /v1/agent-runs/{run_id}` | Agent |
| C7-P65 | `POST /v1/agent-runs/{run_id}/cancel` | Agent |
| C7-P66 | `GET /v1/agent-runs/{run_id}/steps` | Agent |
| C7-P67 | `GET /v1/approvals` | Agent |
| C7-P68 | `POST /v1/approvals/{approval_id}/approve` | Agent |
| C7-P69 | `POST /v1/approvals/{approval_id}/reject` | Agent |
| C7-P70 | `GET /v1/memory` | Agent |
| C7-P71 | `DELETE /v1/memory/{memory_id}` | Agent |
| C7-P72 | `POST /v1/files/upload-session` | Files |
| C7-P73 | `POST /v1/files/{file_id}/complete` | Files |
| C7-P74 | `GET /v1/files/{file_id}` | Files |
| C7-P75 | `GET /v1/files/{file_id}/download-url` | Files |
| C7-P76 | `DELETE /v1/files/{file_id}` | Files |
| C7-P77 | `POST /v1/files/{file_id}/reprocess` | Files |

`POST .../members` must not become a backdoor around intended-recipient proof and explicit admission. Its exact allowed operation needs reconciliation with invitation acceptance and Chapter 18's generic membership surface before publication. A route label does not grant the caller a role.

## 4. Source Error and Event Catalogs

All 13 error codes in [section 7.8](Chapter7.md#L420) are retained exactly. Their final status/retry/visibility mapping is proposed later. The source response example uses `SPACE_ACCESS_DENIED`, which is not in this catalog; this draft proposes normalizing it to `ACCESS_DENIED` where existence may be disclosed, not silently inventing competing client vocabularies.

| ID | Source error code |
| --- | --- |
| C7-E01 | AUTHENTICATION_REQUIRED |
| C7-E02 | TOKEN_EXPIRED |
| C7-E03 | ACCOUNT_DISABLED |
| C7-E04 | RESOURCE_NOT_FOUND |
| C7-E05 | ACCESS_DENIED |
| C7-E06 | VALIDATION_FAILED |
| C7-E07 | CONFLICT |
| C7-E08 | RATE_LIMITED |
| C7-E09 | IDEMPOTENCY_CONFLICT |
| C7-E10 | APPROVAL_REQUIRED |
| C7-E11 | EXTERNAL_PROVIDER_FAILED |
| C7-E12 | TEMPORARY_UNAVAILABLE |
| C7-E13 | INTERNAL_ERROR |

All seven listed event-envelope fields from [section 7.13](Chapter7.md#L803) are retained. Schema version, object revision, stream order and client resume cursor are distinct concepts that the source example does not fully specify.

| ID | Source event field |
| --- | --- |
| C7-F01 | event_id |
| C7-F02 | event_type |
| C7-F03 | version |
| C7-F04 | occurred_at |
| C7-F05 | scope |
| C7-F06 | sequence |
| C7-F07 | data |

## 5. Transport Responsibilities

| Boundary | Proposed responsibility | Not a guarantee or permission |
| --- | --- | --- |
| HTTPS REST | Authenticated client commands and reads with typed contracts, current authorization, bounded queries and durable acceptance. | A successful connection or accepted async request does not prove the business action completed. |
| WebSocket | Authorized server updates, subscriptions and bounded ephemeral typing/presence controls. | Not the only persistence store, an automatic subscription to every Space, or an authority derived from client payload. |
| HTTPS object transfer | Reviewed upload session and permitted immutable bytes, with trusted completion/scan/access checks. | Uploaded bytes are not automatically safe/searchable, and a signed URL alone cannot promise immediate revocation. |
| Internal REST/gRPC | Deliberate service boundaries with authenticated service identity, end-user delegation where applicable, deadlines and versioned schemas. | Internal network location or a trusted service credential is not unlimited access to every user's data. |
| Outbox and queues | Durable intent, asynchronous jobs, bounded retry, deduplication and recovery. | At-least-once delivery does not imply exactly-once provider effects; Redis presence is not durable truth. |
| HTTPS webhooks | Authenticated, bounded and deduplicated provider callbacks committed before background processing. | A callback cannot grant membership, consent or verification outside its particular provider/purpose binding. |

Initial recommendation: durable client writes use REST; WebSocket `message.send` stays deferred unless a real need justifies exposing it through the exact same domain operation/idempotency contract. This is a visible proposed choice within the source's REST-or-WebSocket alternative, not a claim that both were implemented.

## 6. Decisions Requiring Confirmation

| ID | Choice | Proposed direction or open gate | Status |
| --- | --- | --- | --- |
| C7-D01 | API prefix and canonical routes | Use `/v1` at the public API boundary, with environment origin configured separately. Reconcile Chapter 18's `/api/v1` and other route variants before generation; no automatic alias fleet or redirecting unsafe writes. | PROPOSED |
| C7-D02 | One success/error envelope | Use section 7.7's top-level `request_id`, typed `data`, optional collection `pagination`, or typed `error`; no success `error:null` wrapper. 204 and raw object-transfer/provider protocols remain explicit exceptions. | PROPOSED |
| C7-D03 | Durable message command transport | Start REST-first for message writes and other durable client commands; WebSocket carries updates and defined ephemeral controls. Any later WS write reuses the same service and stable logical command key. | PROPOSED |
| C7-D04 | Concurrency/preconditions | Require resource-scoped version preconditions for sensitive updates; propose HTTP validators/If-Match with explicit missing/stale outcomes and current authorization first. Define representation-aware validators before claiming strong ETags. | PROPOSED |
| C7-D05 | Idempotency and unknown outcomes | Use actor/action/resource-bound keys and canonical payload digests, bounded retention and current-authorized result reconciliation. No new key or alternate channel simply because a mutation response timed out. | PROPOSED |
| C7-D06 | Wire types and pagination | Use opaque string IDs/cursors, exact decimal strings for potentially 64-bit sequences, explicit timestamp/timezone/date types and stable bounded keysets. Do not round counters through JavaScript Number. | PROPOSED |
| C7-D07 | Browser/mobile WebSocket authentication | Select same-origin secure session cookies or a short-lived one-use WS ticket for browsers; native clients may use supported authorization headers. No long-lived access token in URL/subprotocol/logs; Origin and ticket issuance need review. | OPEN |
| C7-D08 | Event stream and resume semantics | Choose authorization-scoped durable stream identities, ordering and retention; distinguish transport sequence from conversation message sequence/resource version. Physical journal/projection cost and hidden-event metadata exposure require a decision before implementation. | OPEN |
| C7-D09 | Snapshot/realtime synchronization | Use a consistent authorized snapshot watermark plus bounded catch-up and an explicit reset path; persist cursor and applied state together. A page load followed by an uncoordinated subscription can lose updates. | PROPOSED |
| C7-D10 | Limits, timeouts and rate policy | Complete the missing source section with reviewed per-operation/user/resource/provider/connection budgets, payload/deadline/queue limits and outage behavior. No invented benchmark or numeric production promise. | OPEN |
| C7-D11 | Internal RPC and queue technology | Choose actual service boundaries, identity propagation, broker/worker options and supported gRPC mappings; no compulsory microservice split or externally exposed unrestricted RPC. | OPEN |
| C7-D12 | Provider/webhook capability | Verify provider signatures, replay windows, payload bounds, delivery-status meaning, idempotency, cancellation, account binding and consent. Generic adapter methods do not prove provider support. | OPEN |
| C7-D13 | Contract publication and clients | Use one versioned OpenAPI/event-schema source with reviewed typed Kotlin/TypeScript generation, breaking-change checks and backward compatibility. Tool/version selection and generated artifacts remain future work. | PROPOSED |
| C7-D14 | Missing operations and feature applicability | Add required invitation, ownership, task state, notification/ack, data-rights, follow/search/report/block and sync operations from owning chapters without duplicating domain services. Core source inventory is not the complete MVP API. | OPEN |

The proposed contract below must preserve current user/resource/consent and delegated-Agent boundaries from the earlier drafts. A transport, client schema, cached response, job envelope or idempotency record cannot confer authority on its own.

## 7. Proposed HTTP Contract

This section resolves wire-level examples into a proposed coherent format under C7-D01 through C7-D06, not an approved running API. Publish one reviewed OpenAPI document during implementation; do not keep three independently evolving envelope definitions from Chapters 1, 7 and 9.

### Requests and Primitive Types

- Public API origin is environment configuration; `/v1` is the proposed canonical prefix. Relative operation IDs are stable contract identities, independent of deployment host. Do not silently forward credentials to another origin or redirect unsafe mutation bodies while reconciling `/api/v1` aliases.
- Use HTTPS, explicit JSON content type for JSON operations, bounded request/response sizes and typed request schemas. Reject duplicate/ambiguous fields and unknown authority-bearing input; generated DTOs are not permission checks. A nested resource in a URL must belong to its claimed parent even when both IDs exist.
- Derive user/session/device/service identity from verified authentication, never from `user_id`, `sender_type`, `role` or `approved_by` in an untrusted body. Explicit editable fields are distinct from response, administrator and tool schemas. PATCH defines omitted versus null behavior per field; null must not erase identity, owner, policy or required values accidentally.
- UUIDs and other IDs are opaque strings. Potentially 64-bit counters, message/stream sequences and resource revision values use validated decimal strings in this proposal. Schema versions and bounded page counts can be JSON integers. Kotlin/TypeScript clients must not round sequence values through floating-point Number.
- Absolute timestamps use a documented RFC 3339 UTC representation; calendar timezone and local date/time are separate typed fields. Date-only tasks retain a date rather than an invented UTC midnight. Monetary values, when introduced, use explicit currency and exact decimal/minor-unit representations, not floats or localized text.
- A server-generated `request_id` is returned in the JSON envelope and matching response header for correlation. Client tracing IDs are untrusted bounded metadata, not actor identity. Redact tokens, destinations, approval payloads and private content from request logs and error details.

### Responses and Completion Meaning

| HTTP result | Meaning | Required behavior |
| --- | --- | --- |
| 200 | A permitted read or synchronous operation completed. | Return the current authorized representation or result; a status GET may describe a still-running or failed job without turning the GET itself into an HTTP error. |
| 201 | The promised resource was durably created. | Return its canonical ID and representation, plus an authorized Location where applicable. A saved message is not yet delivered/read by another device. |
| 202 | A durable operation was accepted for asynchronous work. | Return operation/run identity and a permitted status/reconciliation path. Use only after durable intent exists; it does not mean extraction, notification, deletion or an Agent tool finished. |
| 204 | The documented synchronous operation completed without a representation. | No JSON body. Do not serialize an envelope into a 204 response or use it to hide an unfinished destructive/provider action. |
| Error | The attempted operation did not receive the requested successful result. | Use the agreed safe catalog where the application handled the request. Timeout/disconnect/unknown external outcome may require reconciliation rather than repeating the action. |

Example proposed 201 representation, using synthetic IDs and an illustrative domain state:

```json
{
	"data": {
		"id": "b4e0f7a8-9c16-4b53-90d1-1ef59c04a112",
		"name": "Example family",
		"space_type": "family",
		"status": "active",
		"version": "1"
	},
	"request_id": "6b91b9c0-09ca-42cd-8d40-865237e21c94"
}
```

Example authorized empty collection:

```json
{
	"data": [],
	"pagination": {
		"next_cursor": null,
		"has_more": false
	},
	"request_id": "fbcab972-e9db-493f-9f2e-cad7245e823e"
}
```

Example safe field-validation response:

```json
{
	"error": {
		"code": "VALIDATION_FAILED",
		"message": "Check the highlighted fields.",
		"details": {
			"field_errors": [
				{ "field": "title", "code": "required" }
			]
		}
	},
	"request_id": "b39587e0-328f-4915-b510-a39d4af6ce41"
}
```

These are examples, not evidence that a domain enum, handler or generated schema exists. Success has `data` and no `error`; failure has `error` and no success `data`. Collections consistently use `pagination`; operations with no pagination do not invent an empty pagination object. `error.details` is a bounded per-code allowlisted schema, not raw Pydantic errors, provider responses, input values, stack traces or arbitrary user-supplied field names. Clients branch on machine codes, not English text, and localize presentation safely.

Private/authentication responses default to `Cache-Control: no-store` in HTTP infrastructure. Explicit account-scoped offline business storage is a separate reviewed client-data policy, not an accidental shared HTTP cache. Public caching must use an intentionally public representation with privacy/deletion invalidation; a logged-in owner's richer page response cannot be cached under the public URL alone. Conditional reads also reauthorize before returning 304 or metadata. Signed object transfers and provider webhooks use their documented media/protocol responses rather than forcing the application envelope onto another system.

### Version Preconditions

For edit/delete/role/policy/owner operations where lost updates matter, propose `If-Match` using an opaque validator obtained from the authorized representation. Missing required precondition returns 428; stale precondition returns 412 after current authorization, with a safe refresh path. Do not automatically refetch a newer version and repeat a dangerous edit that the user has not reviewed.

Define strong ETag semantics per selected representation, including audience/projection variation; reusing one tag for different representation bytes is not a correct strong validator. If a domain instead adopts an explicit `expected_version`, document that alternative once and reject ambiguous competing preconditions. A version token is never approval, consent or authorization. For an exact idempotent retry of an already committed command, return the permitted original receipt without executing again; do not incorrectly reject it solely because its successful first execution advanced the version.

### Early Source and Public-Domain Wire Handoff

COV-G04/COV-G05 in the [reconciliation index](CONTRACT_RECONCILIATION.md) now have the following concrete mapping requirements. This refines C7-D01/C7-D02/C7-D06/C7-D07/C7-D08/C7-D13/C7-D14 without changing their statuses. The [public-content contract](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md) C2-P01 through C2-P08 owns page/post/member/interaction command behavior; it references all 36 original source routes and separately lists missing commands rather than declaring them implemented.

Each published operation record must declare stable operation ID, one chosen method/path, source aliases retained as documentation, auth/actor derivation, allowed input fields, domain precondition, logical-effect identity, permitted output projection, errors, bounds and version policy. Include applicable outbox event kind, revision and per-recipient disclosure; absent fields mean incomplete contract, not permissive defaults. C7-T02 owns review/generation with the actual domain leads. No canonical OpenAPI or generated clients exist merely because this checklist does.

| Earlier example | Proposed interpretation before schema publication | Owning check |
| --- | --- | --- |
| Chapter 4 top-level message object and items/next_cursor/has_more | Domain result goes under data; collections use pagination under section 7. Preserve source examples in documentation, not a second runtime envelope. | C7-V01 through C7-V03 |
| Chapter 4 numeric sequence and last_event_id | Scoped event cursor, original conversation order and resource revision remain distinct; large sequences are exact decimal strings. No global replay authority from a known ID. | C7-V10; C7-V13 through C7-V19 |
| Chapter 4 event example omits schema_version | Required published envelope/version/aggregate/payload contract is section 11's proposal; unknown required versions trigger safe reset/update policy, not silent event loss. | C7-V13 through C7-V19 |
| Chapter 4 client/server SENT, ACCEPTED, PERSISTED, DELIVERED, READ | Map declared facts, not numeric enum ranks. Canonical send acceptance requires persistence; device receipt/read/decryption and business acknowledgment remain separate messaging facts. | C7-V06; messaging receipt verification |
| Chapter 4 presence/read/privacy labels | Current per-device/account projection and explicit recipient audience; later busy or invisible variants need a deliberate enum/capability map, not a synonym guessed by a client. | Messaging presence/receipt/privacy verification |
| Chapter 4 AUTH frame versus browser/native handshake | Keep C7-D07 OPEN until reviewed cookie/ticket/header and Origin/session behavior is chosen. A source access_token field does not mandate storing browser bearer credentials. | C7-V13 through C7-V19 |
| Chapter 4 delivery/call states and provider send string | Provider/account/version-specific observation map with known pending versus unknown effect and unsupported states. No generic delivered mapping from a provider ID or channel fallback. | C7-V25 through C7-V27; delivery callback verification |
| Public /feed versus /feeds, /search and generic versus nested post create | Choose one operation per declared public/scope surface; preserve actual parent/audience and no duplicate domain services. Source route inventory alone supplies no request/response schema. | C7-V05, C7-V10; C2-V20 in the public contract |

Before generating clients, review the mapping with Android/web consumers using authorized fixtures for positive and denied projections, absent/extra fields, wrong-parent IDs, large sequences, unknown versions, revoked replay and post-commit timeouts. Same source labels with different meanings must not share an enum accidentally. These are contract acceptance requirements; parsing example JSON or generating types is not runtime validation or approval.

## 8. Error, Retry and Reconciliation Semantics

The source codes are preserved; the following HTTP mapping is proposed. Private resource existence may be concealed by the same safe not-found response for absent and unauthorized targets. Authenticated clients that already legitimately know a resource exists can receive a scoped permission-denied result; do not expose private names or target roles through error choice/timing.

| Source code | Proposed HTTP mapping | Client action and limit |
| --- | --- | --- |
| AUTHENTICATION_REQUIRED | 401 | Authenticate through the normal flow; no mutation replay under a different account. |
| TOKEN_EXPIRED | 401 | Refresh once through serialized session handling if permitted, then reauthenticate if necessary. Revoked/disabled sessions cannot be refreshed into access. |
| ACCOUNT_DISABLED | 403 | Show only the allowed account recovery/appeal path; no automatic retry or policy bypass. Avoid using this code on public account-lookup probes. |
| RESOURCE_NOT_FOUND | 404 | Treat unavailable/hidden resource consistently; never infer permission from a cached prior existence. |
| ACCESS_DENIED | 403, or concealed 404 using RESOURCE_NOT_FOUND | Stop the protected action; permission changes require explicit resolution, not exponential retries. |
| VALIDATION_FAILED | 422 | Display approved field feedback and let the user correct the request; do not reflect unknown keys/values or retry unchanged input. |
| CONFLICT | 409 | Resolve a domain conflict or refresh state; a conflict is not instruction to overwrite the winner. |
| RATE_LIMITED | 429 | Respect documented Retry-After where supplied, deadline and retry budget. Do not automatically replay a mutation without the same safe logical identity. |
| IDEMPOTENCY_CONFLICT | 409 | Same key/logical command with different validated intent is rejected. Never silently replace prior content. |
| APPROVAL_REQUIRED | 409 for a blocked direct execution | Review the exact permitted action. An explicitly created pending-approval workflow may instead return 201/202 data describing its pending state; neither response claims execution. |
| EXTERNAL_PROVIDER_FAILED | 502 for a definitive upstream failure | Report the normalized failure. External outcome may still need reconciliation; an async job's failure is returned in its status resource, not by failing every status GET. |
| TEMPORARY_UNAVAILABLE | 503 | Retry eligible reads or reconcile/retry the same permitted idempotent command within bounds. Dependency failure cannot mark a mutation safely unexecuted by assumption. |
| INTERNAL_ERROR | 500 | Report safe correlation metadata; do not expose internals or assume a new command key is harmless. |

Additional proposed application codes fill explicit protocol gaps. They are not part of the source's thirteen-code list and need schema review before publication.

| ID | Proposed additional code | HTTP | Meaning |
| --- | --- | --- | --- |
| C7-N01 | INVALID_REQUEST | 400 | Malformed/ambiguous syntax or framing at an application-controlled boundary, without echoing unsafe payloads. |
| C7-N02 | PRECONDITION_REQUIRED | 428 | The operation requires a current edit/delete precondition. |
| C7-N03 | PRECONDITION_FAILED | 412 | The authorized resource no longer matches the supplied validator. |
| C7-N04 | CURSOR_INVALID | 400 | Cursor is malformed, tampered, or bound to different filters/scope/account. |
| C7-N05 | CURSOR_EXPIRED | 410 | An otherwise authorized collection cursor is outside its retention/snapshot window; start a documented new page session. Durable sync has its explicit reset result instead. |
| C7-N06 | IDEMPOTENCY_IN_PROGRESS | 409 | Same command is still being resolved; use the safe status path or bounded retry of that same command, not a new key. |
| C7-N07 | IDEMPOTENCY_WINDOW_EXPIRED | 409 | The acknowledged deduplication/replay window is over; require reconciliation or explicit new user intent before another side effect. |
| C7-N08 | REQUEST_TOO_LARGE | 413 | Request exceeds its operation limit; do not upload the same bytes repeatedly. |
| C7-N09 | UNSUPPORTED_MEDIA_TYPE | 415 | This endpoint does not accept the given media type. |
| C7-N10 | METHOD_NOT_ALLOWED | 405 | Wrong HTTP method; preserve appropriate Allow metadata without revealing private content. |
| C7-N11 | REQUEST_TIMEOUT | 408 | An application-controlled request-ingestion deadline elapsed; distinguish this from a tool/provider timeout after execution may have begun. |

Do not promise the JSON envelope for every TLS/proxy/server framing failure or WebSocket upgrade failure outside the application's error boundary. Clients handle non-JSON, truncated and empty failures with bounded parsing and safe messages. Parser/body/response limits must apply before an HTTP library buffers an unbounded response. A retryable error classification never authorizes a prohibited action or a fresh mutation ID.

## 9. Cross-Transport Contract Rules

These rules are proposed engineering requirements, not verbatim source guarantees or executed tests.

| ID | Rule | Enforcement and consequence |
| --- | --- | --- |
| C7-K01 | One logical domain operation per action. | REST, optional WS writes, internal RPC, tools and workers call the same authoritative service. Route aliases do not create independent membership, task or permission logic. |
| C7-K02 | Actor identity comes from verified transport/session context. | Resolve current user/device/session or service identity; body IDs, forwarded headers, gRPC metadata and Agent messages cannot appoint an arbitrary user. |
| C7-K03 | Authorization follows the actual resource chain and current policy. | Check parent/child relation, account/Space/conversation state, role, audience/history, consent, blocks, delegation and approval at sensitive boundaries, including replay and cached results. |
| C7-K04 | Input/output/resource use is bounded and typed. | Validate operation schemas, media, sizes, counts, deadlines and rate/queue limits before expensive work. Reject authority mass assignment and unsafe response/error projection. |
| C7-K05 | Transport acceptance and business completion are distinct. | 201/202, queue acceptance, WebSocket acknowledgment, provider acceptance, device delivery and user reading have precise separate meanings. Unknown outcomes remain explicit. |
| C7-K06 | Error and cache behavior cannot leak private context. | Stable safe codes, authorized field errors, no-store private HTTP responses, scope-aware caches and privacy-compatible hidden-resource behavior. |
| C7-K07 | Mutation retries preserve logical identity and current authorization. | Scoped idempotency, canonical intent digest, transactional receipt, safe in-progress/expiry handling and no stale private response replay. |
| C7-K08 | Concurrent updates require deliberate preconditions. | Expected version/validator and exact intent survive retries; policy/role changes cannot be overwritten after an automatic invisible refresh. |
| C7-K09 | Paging/recovery cursors are scope-bound, bounded and exact. | Stable order, opaque authenticated or server-stored cursor, expiry/snapshot semantics, no cross-user use and no float-rounded sequences. |
| C7-K10 | A WebSocket connection has no implicit universal subscription. | Authenticate securely, validate Origin where relevant, authorize each subscription/control/message and enforce revocation, expiry and buffer limits. |
| C7-K11 | Events are authorized projections with explicit stream semantics. | Stable event ID/schema, logical stream and resource versions; no raw DB object, private payload in a broad channel, or hidden-content counts exposed through global sequences. |
| C7-K12 | Snapshot, catch-up and local application are gap-safe. | A consistent watermark/barrier plus bounded replay; cursor and state commit atomically, explicit reset if retention or policy invalidates recovery. |
| C7-K13 | Durable work is at least once and externally bounded. | PostgreSQL intent/outbox, authenticated workers, conditional leases, consumer dedup, bounded retries/DLQ and provider reconciliation; not global exactly-once claims. |
| C7-K14 | Agent delegation is structured, minimal and bounded. | Parent/child identity, resource/action allowance, expiry, hop/time/cost limits and exact approval checked server-side. Natural-language handoff does not grant access. |
| C7-K15 | External callbacks and sends use provider-specific trust rules. | Verify signatures/canonical bytes/timestamps and endpoint binding, deduplicate scoped events, enforce consent and handle unknown/out-of-order results. |
| C7-K16 | Contract versions and operational evidence remain explicit. | OpenAPI/event/protobuf compatibility, supported client versions, safe correlation, cancellation/failure metrics and real transport tests; generated types alone are not runtime proof. |

### Idempotency and Version Ordering

The proposed receipt key is bound to authenticated principal or narrowly scoped pending enrollment, operation identity, target resource and caller key. Canonical intent includes the validated fields, target, relevant precondition and semantic defaults; authentication tokens and random request IDs are not part of intent. Different request intent with the same key is a conflict. Secret enrollment/login flows use their dedicated proof/session protocol, not replayable generic bearer-response caching.

Order: authenticate and check present access -> parse/validate bounded intent -> locate the caller-scoped receipt -> compare intent -> for an already committed exact command, return a current-authorized receipt without executing again -> for a new command, check version and current mutable authority in its transaction -> commit business result plus receipt/outbox -> respond. A later loss of membership may deny even the old result. The original receipt can identify the original result; newer representations are fetched through normal authorization, not substituted silently as proof of the original action.

An in-progress command has one execution owner and a bounded status/retry path. Crash or response timeout is reconciled using the same logical key; do not generate a new key to escape uncertainty. Expired dedup records require a durable logical object/command lookup or minimal non-sensitive tombstone during the promised retry window. `IDEMPOTENCY_WINDOW_EXPIRED` is only meaningful if the server can still distinguish an expired issued command from a brand-new key; define that storage/window policy before advertising it. Offline clients cannot assume unbounded retry rights.

Cancellation stops unstarted/new work after the documented authorization boundary, but cannot roll back an already accepted external message. Resource cancellation, request cancellation and closing a socket are different operations. HTTP client timeout does not necessarily cancel the server transaction or job. Never wrap an arbitrary provider call in a database retry loop.

### Pagination and Precision

Use bounded opaque `after`/`before` or the chosen single cursor convention, not incompatible per-client names. Encode or server-store operation/scope, principal/audience generation, filter/sort, last key, snapshot boundary, version and expiry with integrity protection. Encryption is needed if a signed cursor would otherwise reveal confidential data; a signature alone does not hide its contents. Cursors are not authorization tokens and current access is checked on every page.

Specify stable `(ordering_value,id)` keysets and null ordering, or authoritative per-conversation message sequence. A later privacy change can remove rows; a valid cursor must not resurrect them. Bound filtering work to avoid scanning an unlimited set merely to fill a page. A safely empty page with a continuation is possible under filtering; clients must follow the documented `has_more`/cursor semantics rather than treat an empty list as universal exhaustion. Counts include only authorized data or are omitted.

For changing ranked feeds, choose a bounded snapshot/ranking generation or documented freshness behavior; do not imply all pages form an immutable snapshot when they do not. On invalid or expired collection cursor, refresh only the authorized surface. Never fall back to unrestricted global pagination or reuse a cursor from a previous signed-in account.

## 10. Domain Operation Contracts

These seven workflow groups cover every source operation in section 7.9. Missing but required behavior is called out rather than invented as a working endpoint. Per-operation OpenAPI schemas and final states remain gated on the owning product/data decisions.

### C7-W01 Identity and Sessions

Source operations: C7-P01 through C7-P10. Apply the Chapter 18 enrollment, proof, session/recovery and anti-enumeration contract. Registration/verification may expose only a narrow pending context; login establishes a checked session, not any user named in a JSON field. Scope session listing/revocation to the actual account, serialize refresh and clear/rebind client data on account changes.

Web cookie routes need CSRF/Origin/SameSite policy; native authorization must follow the selected secure-storage/session model. Logout/revoke denies new protected HTTP and realtime boundaries while acknowledging already downloaded data cannot be recalled. `PATCH /me` edits allowlisted profile data, not account state, verification, password, consent or global role. Recovery, contact change, devices, consent history and data rights require explicit operations from Chapter 18; they are not secretly overloaded into `/me`.

### C7-W02 Spaces, Invitations and Policy

Source operations: C7-P11 through C7-P22. Creation derives owner from identity, supplies only permitted type/profile fields and commits the owner/policy/admission contract atomically. Space lists/details/member lists are authorized projections with safe counts and hidden-object behavior. Role and policy writes use current actor/target authority and preconditions.

`POST /spaces/{space_id}/invitations` creates an intended-recipient-bound invitation, not membership. Source `POST .../members` must be disabled or explicitly constrained to the reviewed admission operation; it cannot directly add a human without the required proof/acceptance. Invite preview/accept/decline/revoke/resend, organizer confirmation if adopted, owner transfer, leave/rejoin and lifecycle operations come from the identity/Space contracts and need canonical route selection. No source route variant can bypass couple limits, membership epochs or approval through a generic PATCH.

### C7-W03 Public Community

Source operations: C7-P23 through C7-P35. Public reads expose intentionally published eligible fields; owner/moderator views have separate projections and cache treatment. Page ownership, role assignment and publication are backend policy. Post/comment/reaction writes use the actual actor and parent, safe text/media handling, duplicate controls and current block/moderation restrictions.

Post creation is not automatically publication if the reviewed workflow requires a draft or approval. PATCH cannot change owning scope to leak private content. Reaction add/remove semantics must identify the intended reaction and actor explicitly; the source's collection DELETE spelling does not authorize deleting everybody's reactions. Follows, discovery/search, saved content and reporting/moderation routes are gaps in this core list, not dropped Chapter 1 requirements.

### C7-W04 Conversations and Messages

Source operations: C7-P36 through C7-P44. Conversation creation/list/detail/member views require explicit participant and history policy, including distinction between standalone DM and Space-bound private/shared conversations. A group owner cannot enroll themselves into another member's private Agent conversation via a participant payload.

Message command carries a client logical message ID and validated content/ciphertext/attachment references; sender comes from authentication. A duplicate logical message with different content is a conflict; sender/conversation/client key and command idempotency cannot conflict across REST and any later WS entry point. Persist message and outbox before acknowledging. Do not wait for recipient devices to claim the stored message succeeded.

Keep client-local queued/sending, server persistence, event publication, gateway/device delivery and user-read facts separate. Source `accepted` before `persisted` is not a reason to tell the user a non-durable message is sent. A 201 persisted result, a transient local pending state and an explicit 202 durable pending command, if supported, have different meanings. Device receipts are authenticated and bounded to that actor's authorized content; presence or a WebSocket write completing is not read evidence. Edit/delete/read commands enforce target scope, permitted transitions, expected version and history boundaries.

### C7-W05 Tasks, Events and Reminders

Source operations: C7-P45 through C7-P58. Global list/create endpoints require a typed permitted personal or Space context; any nested route derives context from its path and rejects conflicting body scope. Creator/owner and current assignee/recipient eligibility are server-derived or validated. A task due date does not create an unsolicited external reminder.

Example proposed task-create body for the authorized synthetic family context:

```json
{
	"scope": {
		"type": "space",
		"space_id": "b4e0f7a8-9c16-4b53-90d1-1ef59c04a112"
	},
	"title": "Prepare the meeting agenda",
	"due_date": "2026-09-25"
}
```

Explicit command/schema definitions must cover assignment, completion, schedule preview/activation/cancel, occurrences, notification history and acknowledgment. Do not accept arbitrary task state or recipient changes through a catch-all metadata field. Shared event title, location, attendee list and private notes have independent projection rules.

A reminder 201 means the confirmed intent/schedule is durably saved, not due delivery. M1 uses one-time in-app notifications. `DELETE` semantics must distinguish cancelling future execution from deleting retained history and already in-flight effects; return an honest pending result if cleanup is asynchronous. Revisions, local dates/timezones, recurrence exceptions, notification preference and consent follow Chapters 13/20 and the data contract. Health/Agent/external provider powers remain outside M1.

### C7-W06 Agent, Approvals and Memory

Source operations: C7-P59 through C7-P71. Agent config and runs carry explicit requester, permitted scope, approved tool/policy versions and bounded budgets. A start-run response points to durable run state; updates display queued/waiting/running/partial/failure and known results, not fabricated progress or hidden reasoning. Run/step/memory lists have separate audience/sensitivity projections, not a group-admin-wide dump.

An approval request identifies immutable action intent, recipients, tool/policy version, expiry and human permissions. An approval endpoint takes the intended approval/action revision, not replacement tool arguments. Human confirmation is bound to the exact reviewed action; execute only after current authorization is rechecked. Expired/revoked/mutated/prohibited actions fail; a tool/provider error cannot be reported as success. Cancel/reject stop new permitted work and reconcile already in-flight effects without false undo.

Memory reads/deletes respect owner, source, conversation/history, sensitivity and consent. Restriction/deletion removes retrieval eligibility before delayed derived cleanup. Agent tool adapters call the same domain operations as manual forms; a generated body, subagent message or supplied `requires_approval:false` cannot override policy. Public assistance cannot retrieve private Spaces to answer a public question.

### C7-W07 Files and Processing

Source operations: C7-P72 through C7-P77. Reconcile source singular `/files/upload-session` with other chapters' plural naming once. Create a scoped, bounded, expiring upload session; direct object upload transfers bytes but does not complete validation, malware scanning or indexing. Completion verifies the exact immutable stored version/checksum/type/size and current upload authority before enqueueing durable processing.

Return explicit upload/scan/processing/partial/ready/rejected states and a permitted status path. Reprocess has a new reviewed generation and idempotent job identity; it cannot overwrite old citation provenance or restart indefinitely. Downloads, previews, derivatives, filenames and citations reauthorize; `/download-url` does not automatically provide immediate revocation of an already issued presigned URL. Use a reviewed current-authorized mechanism or explicitly change the promise. Large bytes are not wrapped inside the normal JSON envelope or proxied through an unbounded API buffer by default.

### Missing Operations to Reconcile

| Capability absent or ambiguous in core inventory | Owning source/contract | Required decision |
| --- | --- | --- |
| Identity recovery, changed contacts, device controls and security events | Chapter 18, C18-W02 through C18-W04 | Explicit proof/recovery routes and assurance; not credential updates through profile PATCH. |
| Invite preview/accept/decline/revoke/resend and optional organizer confirmation | C18-W05 and C3-W02 | One intended-recipient admission contract and canonical routes; no direct `/members` bypass. |
| Join requests, owner transfer, leave/rejoin, archive/restore/conversion | C3-W03 through C3-W05 and C3-W10 | Current target-aware authorization, history/capacity and lifecycle semantics. |
| Follows, discovery/search, reports, blocking and moderation | Chapter 1, Chapters 2/15/16 and C18-W08 | Preserve MVP requirements and consistent public/private projection/error behavior. |
| Task assignment/completion, event RSVP and field privacy | C3-W07 and Chapter 17 | Explicit commands and role/field-specific validators; RSVP is not Space membership. |
| Schedule preview/activation/occurrences/cancel, notifications and acknowledgment | Chapters 13/20, C6-W06 through C6-W08 | Durable status and retry/cancellation semantics, separately from a saved reminder record. |
| Export/deletion requests and progress, protected archive download | C18-W09 and C6-W11 | Recent auth, resumable stages, permission-filtered results and no false immediate purge. |
| Agent delegation, exact-action revision, file version/citation/share access | C18-W10, C3-W08, C3-W09 and Chapters 12/14 | No privilege escalation or version/retention bypass through generic resources. |
| Async operation status/reconciliation and scoped sync recovery | Chapter 7 sections 7.15-7.24 | Define canonical operation/status and cursor reset schemas before clients rely on examples. |

Inventory gaps are implementation blockers for their dependent workflows, not justification to shrink the full MVP unnoticed. Canonical additions are published in the single OpenAPI/event specification after review; this document has not created that executable specification.

## 11. Realtime and Recovery Protocol

### C7-W08 Authenticate, Subscribe, Synchronize and Reconnect

Source: [7.12-7.18](Chapter7.md#L773) and [presence](Chapter7.md#L1512). This proposes a single application connection manager per signed-in client context, with explicitly authorized logical subscriptions. It is not a permanently trusted connection to every private Space.

**Connection:** negotiate the supported application protocol over WSS. Browser WebSocket APIs do not generally allow arbitrary Authorization headers; choose reviewed cookie-plus-Origin checks or an HTTPS-issued, short-lived one-use ticket delivered through a bounded authentication frame. Native clients can use supported protected headers. Bind any ticket to current session, audience, purpose, allowed origin and expiry; consuming a ticket does not freeze authority forever. Do not put long-lived bearer tokens in query strings, subprotocol values, analytics or proxy logs.

Before authentication succeeds, allow only a minimal bounded authentication/heartbeat surface and impose an authentication deadline. Validate Origin for cookie-bearing browser connections, allowed hosts/proxy trust and session/account state. CORS is not WebSocket authentication, and SameSite alone is not an Origin policy. Unsupported protocol/client versions receive a safe refusal; no fallback to trusting client user IDs.

**Subscription:** a client requests a particular resource/view, not a role or an arbitrary internal channel name. The server resolves current actor, Space/conversation/object/history/consent policy, then issues a bounded subscription identity. No automatic subscription to every group, all member directories, every Agent run or hidden administrative events. Reauthorize subscribe, every protected command, private dispatch/replay and resumption after policy changes.

Example proposed client subscription frame, distinct from the HTTP envelope:

```json
{
	"type": "subscribe",
	"client_request_id": "6e81a3ae-fbd2-40cc-b8a3-cde691f411fd",
	"resource": {
		"type": "conversation",
		"id": "dcb19978-6c49-40cc-a04d-474b5bbf9e8c"
	},
	"resume_cursor": null
}
```

`client_request_id` is a bounded correlation hint, not the server's authenticated principal or its HTTP `request_id`. The response contract distinguishes denied, preparing, catching-up, live and reset-required states. Data is not sent while a subscription merely awaits approval or synchronization.

### Durable Events and Ephemeral Controls

Proposed durable event envelope extends the seven source fields with explicit stream/resume information. Names/types must be published as one versioned schema after C7-D08 is settled; the following is synthetic example data, not a valid live cursor or credential.

```json
{
	"event_id": "9bc5b341-e60a-40e6-a010-75778094dc3a",
	"event_type": "message.created",
	"version": 1,
	"occurred_at": "2026-09-18T10:00:00Z",
	"stream_id": "stream_example_conversation_1",
	"sequence": "104",
	"scope": {
		"conversation_id": "dcb19978-6c49-40cc-a04d-474b5bbf9e8c",
		"space_id": "b4e0f7a8-9c16-4b53-90d1-1ef59c04a112"
	},
	"data": {
		"message_id": "69ae2c3a-3862-4754-ad21-48a420dad1c2",
		"message_sequence": "82",
		"resource_version": "1"
	},
	"resume_cursor": "opaque-example-resume-cursor"
}
```

- `event_id` identifies the logical durable event for deduplication. Redelivery keeps that identity; retrying transport is not creating a new business event. The schema `version` is not the resource version.
- `stream_id` and `sequence` identify the logical authorized delivery stream and its monotonic order. They are not a process-global Redis counter, a timestamp or a public count of private events. The message's authoritative conversation order is a separate `message_sequence`.
- `scope` and `data` are server-built allowed projections, never raw database rows or an LLM's requested audience. A small reference event is still sensitive: do not send an unauthorized ID and assume the later GET's denial fixes the leak.
- `resume_cursor` is an opaque principal/scope/filter/authorization-generation-bound position with retention and integrity rules. It is sensitive metadata for logging purposes, not a bearer permission grant. Client arithmetic on `sequence + 1` is not the recovery protocol.

Recommended C7-D08 direction: privately scoped delivery journals/projections per principal and logical subscription generation, with stable underlying domain event identities. This avoids exposing hidden global counts but has storage/fanout cost that must be measured. A shared resource journal with opaque filtered cursors is an alternative only if it satisfies the same privacy/order/reset contract. Do not declare the physical journal design selected without its data and capacity review.

Filtering, retention and audience changes can make apparent resource-event gaps legitimate. If private sequence exposure or old authorization becomes unsafe, rotate the stream generation and require a scoped reset, rather than disclosing missing private event details. A transport gap, duplicate and out-of-order frame must be handled through the documented journal/cursor protocol, not by requesting unrestricted history.

Typing and presence are a separate ephemeral control schema. Derive actor/device from the connection; the client cannot mark someone else online. Authorize viewers, bound update rate, use TTL and coarse/privacy-reviewed last-seen data. Device count is not necessarily public. Redis loss means unknown presence until fresh heartbeats. Do not permanently persist typing, put ephemeral frames into durable message replay, or infer WhatsApp availability, delivery or reading from in-app presence.

### Snapshot Barrier and Local Application

The bare source example `GET /v1/sync?after_sequence=104` is insufficient without stream, actor, authorization generation and retention semantics. The proposed `/v1/sync` contract uses an opaque bound cursor or an explicit authorized snapshot request; its exact operation schema is an addition requiring publication, not a complete source endpoint.

1. Authenticate and resolve the specific view, fields, audience/history and current policy generation. Establish a durable source-change boundary, not just the last Redis message the gateway happened to see.
2. Obtain an authorized consistent snapshot and its corresponding replay barrier. A viable design captures source-log positions with the data snapshot, waits for or tracks the projector through that boundary, and returns a resumable projection token. If projection is still preparing, expose that bounded state and retry path. Do not assign an unrelated asynchronously published cursor to a fresh database query and assume they match.
3. For multi-page snapshots, define a bounded materialized snapshot or versioned manifest/consistent paging method. Do not hold a database transaction open while a mobile user slowly fetches pages. Recheck access while paging; a policy change can invalidate the snapshot rather than permit old private rows to be served.
4. Buffer or replay the eligible events after the barrier while snapshot pages are loaded, then merge by canonical IDs and resource versions. Prevent changes committed between snapshot and subscription from disappearing. If buffer/history limits are exceeded, restart through the authorized reset path rather than silently skipping data.
5. Persist applied rows/tombstones and the confirmed cursor atomically. Android uses a Room transaction through repositories. Web persistent state needs an equivalent reviewed transactional store; if the web keeps only in-memory query state, do not save a durable cursor alone and skip reconstructing that state after reload.
6. Acknowledge only the position actually applied under that client context. A frame-received/stream acknowledgment is not a message-read receipt, reminder acknowledgment or proof a human saw the content. Pending local drafts/commands remain separate from canonical state and are reconciled using their own logical IDs and current permissions.

Example proposed HTTP sync reset after authentication and cursor/scope validation:

```json
{
	"data": {
		"events": [],
		"resume_cursor": null,
		"requires_full_sync": true,
		"reset_reason": "history_expired"
	},
	"request_id": "68403b41-1436-428f-a722-1e17dcddc52d"
}
```

A valid expired sync cursor may return this 200 reset result rather than a collection `CURSOR_EXPIRED` error. An unauthorized user or wrong-scope cursor does not get a broad refresh token or private resource list. Reset reasons are a small safe catalog, not private policy or member details. The client discards/rebuilds only the affected authorized canonical cache namespace while preserving appropriately scoped unsent drafts for explicit reconciliation. It must not restore old grants or replay destructive commands automatically after a reset.

### Reconnect, Revocation and Backpressure

Reconnect uses bounded exponential backoff with jitter, a cap/overall budget, network awareness, current authentication and authorized subscription restoration. Serialize refresh attempts so many failed API calls/sockets do not create a refresh storm. Do not reset the backoff just because TCP briefly connected; successful protocol recovery matters. The source's particular delay examples are not approved production values.

Revocation/account disable/membership expiry takes effect at the server's sensitive authorization boundary, even if the socket remains open. Stop disallowed delivery, invalidate affected subscriptions/cursors and send only a safe control notice or close. A client can already have received bytes or copied offline data; no protocol can honestly promise to erase them. A restored session or new membership starts under its actual generation, not an old cached subscription.

Bound connections per actor/device, subscriptions, frame sizes, decompression, queued bytes, in-flight commands and replay work. Drop/coalesce permitted ephemeral signals first; do not silently drop durable changes while advancing the cursor. Disconnect a slow consumer with a recoverable state when limits are reached, and let it resume from durable history. Use documented WebSocket close/control semantics, such as policy violation, oversized frame or overload where appropriate, not HTTP status codes inside an already upgraded connection. Close reasons must not contain secrets. If realtime is unavailable, bounded authorized REST polling/history can preserve core functionality without claiming live delivery.

## 12. Internal RPC, Queues and Agent Handoffs

### C7-W09 Execute Authorized Internal and Background Work

Source: [7.19-7.27](Chapter7.md#L1019). Start with domain calls inside the modular backend; use internal REST/gRPC only at justified process/service boundaries. The source's AgentRuntime, DocumentProcessor and RealtimeGateway protobuf examples describe possible interfaces, not required initial microservices or generated stubs.

Every internal request has authenticated service identity, audience, operation schema, deadline, payload/concurrency limits, trace context and an explicit authority model. When acting for a user, a trusted ingress may issue a bounded delegated context that the receiver verifies against current policy. A raw `user_id` or `X-User-ID` forwarded through an internal network is not proof. Least privilege also applies to worker consumers and administrative replay tools.

Use protobuf field/version compatibility deliberately: never reuse field numbers for different meanings, do not treat missing role/approval fields as permissive defaults, and bound streaming messages. gRPC status details/trailers and HTTP error adapters expose only approved public codes. `UNAUTHENTICATED`, `PERMISSION_DENIED`, `INVALID_ARGUMENT`, `FAILED_PRECONDITION`, `RESOURCE_EXHAUSTED` and `UNAVAILABLE` map according to the actual domain and boundary, not raw provider exception text. A deadline or cancellation alone cannot prove a mutation never committed; reconcile the logical operation before retry.

### Durable Queue Contract

Accept asynchronous work only after the business command, durable job/outbox intent and required audit commit. Broker publication is later and recoverable. Workers load authoritative scope/state; a queue payload is an instruction reference from an authenticated producer, not a permanent authorization snapshot.

Example proposed job envelope extending the source fields with scoped authority references:

```json
{
	"job_id": "f7fbc044-5a67-4b80-9cf2-c052475339d0",
	"job_type": "notification.send",
	"version": 1,
	"attempt": 1,
	"max_attempts": 5,
	"created_at": "2026-09-18T10:00:00Z",
	"available_at": "2026-09-18T10:01:00Z",
	"scope": {
		"space_id": "b4e0f7a8-9c16-4b53-90d1-1ef59c04a112"
	},
	"authorization_ref": "stored-action-grant-example",
	"payload": {
		"delivery_id": "301e153d-3748-4a08-b660-2cfe1942106b"
	},
	"trace_id": "c482108f95684d1a8d1f2a6397b19083"
}
```

The sample retry count is illustrative. Version/type selects a known worker schema; unknown versions cannot be interpreted as arbitrary method/URL/Python execution. Job identity stays stable across attempts. Actual attempt budget, availability, lease token/fencing and cancellation are checked against the durable job record, not accepted from an attacker-modified payload. Secrets and full private message bodies do not belong in ordinary job metadata.

Claim eligible work with bounded leases, perform slow external computation outside database transactions, then finalize using the current lease/version and consumer-dedup contract. A stale worker cannot release another worker's lease or overwrite its result. Broker acknowledgment follows durable processing progress. Repeated delivery, crash after commit/before broker ack, reordered callbacks and expired leases need explicit tests; local dedup does not guarantee an external provider honored the same key.

Distinguish standing user-authorized work from session-bound immediate work. A saved permitted family reminder should not stop solely because the original short-lived login token expired; it runs under its current durable authority/consent and schedule policy. Account disable, membership/consent revocation or cancellation must block later disallowed execution. Do not carry an old bearer token into a queue or assume all background jobs have the same delegation lifetime.

Retry temporary failures with bounded backoff/jitter/deadline only when replay is safe. Invalid input, current access denial, expired approval or a permanent provider rejection is not fixed by repeating it. Store a safe failure class and related operation IDs. Dead-letter access is privileged and redacted; replay revalidates scope/consent/approval, logical identity and possible external side effects. It cannot silently reset all counters, create a new command ID or replay an expired health/external action.

### Structured Agent Delegation

Agent-to-Agent messages retain the source request/response/event/approval/failure/cancel/handoff concepts but include trusted sender/recipient, parent run, task/correlation identity, explicit resource/action allowance, context references, deadline, remaining aggregate budget, hop count and cancellation linkage. Validate the sender against the running task, not a self-declared `sender_agent` string.

`requires_approval:false` in the source example is not permission to skip the policy engine. Child authority is bounded by the parent's current permitted task and cannot widen through a handoff or request for more context. Track aggregate cost/tool/runtime/depth/fanout, repeated requests and progress to stop loops; source hop values are examples, not approved quotas. A cancelled parent prevents new child effects and reconciles already in-flight work. Returned tool/Agent content is untrusted data, not new system instructions or a reason to run arbitrary URLs/commands.

The reusable product Agent's orchestration is distinct from this project's Astra-only development-agent requirement. Designing product-provider routing does not authorize silently changing the coding/subagent model.

## 13. External Provider and Webhook Contract

### C7-W10 Send Through Approved Adapters and Process Callbacks

Source: [7.28-7.29](Chapter7.md#L1409), with delivery rules in [Chapter 20](Chapter20.md). External channels remain separately gated; the MVP Agent does not gain WhatsApp/SMS/call/health-record powers from this interface design.

Before an approved send, resolve intended recipient and current verified endpoint, account/Space/object authority, purpose-specific consent, quiet hours/preferences, template/language/field redaction, required exact approval, budget/rate limits and current cancellation. Use one authoritative notification service and reviewed provider adapters. A generic `send_message` method is not evidence that a vendor supports group creation, calls, online presence, status lookup, idempotency or cancellation.

Validate provider destinations and approved outbound endpoints; do not let an LLM or user-supplied callback URL turn the worker into an unrestricted fetcher. Apply SSRF/redirect/private-address/response/deadline controls when any URL fetching is genuinely required. Provider secrets are retrieved through least-privilege server credentials, not prompts, browser bundles or client callbacks. Cross-channel fallback requires separate consent/policy and known outcome handling; a timeout does not justify calling someone instead of messaging them.

### Callback Trust and Durability

1. Apply edge and application payload/media/time bounds, route to the exact configured provider account/endpoint, and preserve the exact bytes/canonical representation required by that provider's signature protocol. Parsing and reserializing JSON before signature verification can change the signed content.
2. Verify signature/key rotation and replay/time rules using the official supported scheme. TLS, source IP or a hard-to-guess URL alone is not sufficient. Generic CSRF protection is not a replacement for webhook verification; callback auth is separate from browser cookies.
3. Bind the signed event to the expected provider account, external message or operation and intended recipient/context. A genuine signature for another tenant/provider account cannot update an unrelated delivery. Never map a claimed user ID directly into application authority.
4. Persist a scoped dedup key, payload digest, safe metadata and durable processing intent before acknowledging receipt. If the durable store is unavailable, use the provider's retry/failure protocol rather than replying success and losing the event. Duplicate acknowledged events are safe no-ops after consistency checks.
5. Treat duplicate IDs with inconsistent content as a reviewed anomaly; handle missing or non-global provider IDs under a provider-specific dedup strategy, not a fabricated universal hash formula. Out-of-order delivery/read/failure events update the delivery state machine without regressing confirmed state blindly.
6. Any raw callback payload retained for investigation is minimized, encrypted/restricted and short-lived under a reviewed policy; ordinary logs store only safe metadata. Provider text/attachments are untrusted content and cannot approve a tool, verify an arbitrary account, create membership or override safety instructions.
7. Emit authorized internal projections and truthful status. HTTP receipt of a webhook is not the same as completed processing; provider `accepted`, delivered, read and explicit user acknowledgment remain separate facts. Verified callbacks cannot certify medication adherence or human availability.

Document provider rate/billing limits, signature behavior, retry windows, supported status/cancel/idempotency semantics, destination verification and regional/consent requirements before live use. No live provider was selected or tested here.

## 14. Limits, Client State and Contract Evolution

### Complete the Missing Rate Policy

Section 7.31 is unfinished. The following is a proposed checklist with values OPEN under C7-D10, not a source-mandated set of numbers.

| Boundary | Budgets and controls to decide | Failure behavior |
| --- | --- | --- |
| Edge/HTTP ingress | Header/body sizes, upload/body deadlines, concurrent requests, connection/TLS limits, decompression and media-specific maximums. | Reject before expensive parsing where possible; safely handle non-JSON edge failures. No unbounded buffering while merely reading an error response. |
| Identity/invitations | Account, pending attempt, origin/device, destination and resource limits, aggregate OTP guesses/resends, recipient abuse controls. | Generic errors without account enumeration; new challenge IDs do not reset total abuse budget. Provider failure cannot verify an identity. |
| Reads/search/sync | Page/replay limits, maximum scanned candidates, cursor/snapshot lifetime, scope fanout, query time and provider-independent read budgets. | Bounded partial/reset/retry behavior without dropping ACL filters or leaking private counts. |
| Writes and background jobs | Per actor/resource/operation concurrency, retry budgets, admission/cancel deadlines, queue depth/age and durable capacity. | Persist accepted work or reject honestly; never return 202 for a job that exists only in volatile memory. |
| WebSocket | Sessions/connections, subscriptions, frame/decompressed sizes, messages per interval, authentication time and queued bytes. | Coalesce/drop permitted ephemeral state; disconnect slow consumers without pretending durable events were applied. |
| Agent/tools/external delivery | Per user/Space/provider/global spend, steps, hops, runtime, token/tool calls, external attempts and channel frequency. | Pause/deny/cancel under policy, preserve partial/unknown effects and honor opt-outs. No silent wider-model/channel or permission fallback. |

Limits need realistic workload/capacity, fairness and threat review; applying only one IP limit can penalize shared networks while failing to stop targeted recipient abuse. Redis-limit outages require an explicit bounded or fail-closed strategy, not unlimited attempts. Retry-After parsing is bounded and respects application deadlines; clients do not hammer an unavailable service after invalid headers. Report rate/admission/queue rejections separately from successful business effects.

### Shared Client Behavior

Android and web receive the same canonical resource identities, versions, machine errors, pagination and event schemas, while authentication storage differs. Android REST/WS/background updates pass through repositories into Room/StateFlow; web updates its typed query state or reviewed persistent cache through one reconciliation layer. Optimistic records keep their logical command IDs until the canonical server result is reconciled, without creating duplicate message/task identities.

Show loading/empty/error/offline/permission-denied/session-expired states and honest pending/unknown/partial operation outcomes. Do not say 'sent' for a local draft, 'delivered' for provider acceptance or 'completed' for an Agent run waiting on approval. Retry buttons retain safe logical identity and do not invisibly broaden recipients, refresh dangerous edits or accept a changed approval payload. On account switch, isolate/clear credentials, subscriptions, queues and cached data by the correct account; never replay one person's offline mutations under another session.

Offline read/draft support does not make authority changes safe offline. Joining, role/owner changes, new consent, approvals, export/deletion and external or medical actions require reviewed online confirmation. Preserve unsaved changes where privacy allows and explain necessary discard/review after revocation without showing forbidden content. Back/deep-link navigation rechecks current access. Accessible status announcements are bounded; realtime updates must not continuously steal focus or jump a user's feed position.

### Schemas, Versions and Observability

During implementation, one reviewed OpenAPI specification owns HTTP operation IDs, request/response/media/error/status/headers/security and cursor/idempotency/precondition behavior. Event/control/job/protobuf schemas have their own explicit versions and compatibility rules. Generate Kotlin/TypeScript bindings with chosen maintained tooling, validate runtime input/output and test clients against actual served schemas. Neither generation nor TypeScript types prove server authorization or wire compatibility.

Additive fields are allowed only under the documented decoder policy. Unknown authority-bearing request fields are not silently accepted. Unknown critical enum or event versions must not default to 'active', 'approved' or success: use an explicit unsupported/update/reset path. If an event cannot be safely applied, do not advance a durable cursor and silently lose it. New client capability negotiation and phased rollout prevent older clients from receiving required effects they cannot understand.

Treat field removal/rename, type change (including numeric versus string sequence), new required fields, status meaning, scope or envelope changes as potential breaking changes even without a path change. Define support windows, deprecation, schema-diff gates and rollout/rollback testing. Do not deploy untested aliases to hide contradictions between old chapters. Mobile clients may remain old for a long time, so server/client compatibility needs an explicit release matrix.

Trace request -> durable command -> outbox/job -> worker/Agent/tool -> provider -> result event using safe correlation IDs. Measure request/error latency, idempotency conflicts/in-progress/unknown outcomes, version conflicts, denied access, reconnect success, replay/reset lag, slow consumers, schema incompatibility, queue age/retry/DLQ, provider/webhook anomalies and cost. Template route labels and bounded codes avoid leaking user IDs/phones or producing unbounded metric cardinality. Restricted logs/audit are not a place for raw private payloads or secrets.

## 15. Proposed Acceptance Evidence

The source has no complete acceptance section. All C7-V scenarios below are proposed evidence families, currently NOT RUN. They cover source topics and protocol rules, not a fabricated list of already passing endpoint tests.

| Check | Source topics | Contract rules | Workflows | Required evidence |
| --- | --- | --- | --- | --- |
| C7-V01 | C7-S01, C7-S02, C7-S03, C7-S04 | C7-K01, C7-K04, C7-K16 | C7-W01, C7-W02, C7-W03, C7-W04, C7-W05, C7-W06, C7-W07 | Published operation schemas and canonical prefix/route mapping cover released requirements; alternate entry points cannot bypass one domain service. Deferred/missing operations remain explicit. |
| C7-V02 | C7-S05, C7-S06 | C7-K02, C7-K03, C7-K06 | C7-W01, C7-W02 | Forged body/header actor IDs, token expiry/revocation, wrong account/session and wrong-parent resources fail on HTTP with safe non-enumerating outcomes. |
| C7-V03 | C7-S07, C7-S08 | C7-K04, C7-K05, C7-K06 | C7-W01, C7-W05 | Actual 200/201/202/204/error/media responses match schema; 204 has no JSON and async acceptance is not completion. Sanitized validation does not echo arbitrary keys, secrets or provider errors; malformed/non-JSON failures are bounded. |
| C7-V04 | C7-S09 | C7-K01, C7-K02, C7-K03 | C7-W01, C7-W02 | Registration/proof/session/profile and Space/policy/invite operations match identity/admission rules; generic `/members` or `/me` cannot set active membership, recovery identity or privileges. |
| C7-V05 | C7-S09 | C7-K03, C7-K06, C7-K08 | C7-W03 | Public/private page/post/comment/reaction projections, intentional publication and actor-target checks work with warmed caches and privacy changes; no private media or drafts via public endpoint. |
| C7-V06 | C7-S09, C7-S17, C7-S18 | C7-K03, C7-K05, C7-K07 | C7-W04 | Authorized send persists message+outbox before acknowledgment; reply/attachment/participant scope, duplicate logical message, payload conflict and truthful receipt states survive retries. |
| C7-V07 | C7-S09 | C7-K03, C7-K05, C7-K08 | C7-W05 | Task/assignee/event/reminder operations enforce scope/field/timezone/recipient rules and defined state commands; cancellation versus in-flight work is honest and a saved reminder is not reported delivered. |
| C7-V08 | C7-S09, C7-S25 | C7-K03, C7-K05, C7-K14 | C7-W06 | Scoped Agent config/run/step/approval/memory APIs reject changed payload, stale authority, unauthorized source and prohibited action; failed or waiting work is not success. |
| C7-V09 | C7-S09 | C7-K03, C7-K04, C7-K05 | C7-W07 | Upload session/complete/reprocess/download/delete validate immutable object, scan and scope; no unsafe bytes, public filenames or false immediate-revocation guarantee from issued URLs. |
| C7-V10 | C7-S10 | C7-K03, C7-K09 | C7-W03, C7-W04, C7-W05, C7-W08 | Keyset pages under inserts/deletes/privacy changes, empty filtered continuation, wrong-scope/account/tampered/expired cursors and exact large sequence values behave as specified. No unrestricted fallback. |
| C7-V11 | C7-S11 | C7-K03, C7-K07 | C7-W02, C7-W04, C7-W05, C7-W06 | Same key/intended action concurrent retries return one permitted logical result; changed target/body/precondition conflicts, revoked callers cannot replay private receipts and expired windows cannot silently re-execute. |
| C7-V12 | C7-S04, C7-S08, C7-S11 | C7-K07, C7-K08 | C7-W02, C7-W03, C7-W05 | Missing/stale version conditions yield documented 428/412; exact already-committed retry does not execute twice or fail solely on its advanced revision. UI does not auto-overwrite after refresh. |
| C7-V13 | C7-S12 | C7-K02, C7-K04, C7-K10 | C7-W08 | Actual browser/native upgrade/authentication tests verify cookie/Origin or one-use ticket behavior, no URL bearer leakage, expired/replayed/wrong-origin ticket rejection and pre-auth bounds. |
| C7-V14 | C7-S06, C7-S12, C7-S14 | C7-K03, C7-K10, C7-K11 | C7-W08 | Per-resource subscribe/command/dispatch/replay checks deny private conversations, mass subscriptions, forged actor/role and expired membership, including revocation after connection. |
| C7-V15 | C7-S13 | C7-K06, C7-K09, C7-K11 | C7-W08 | Source envelope fields, schema version, authorized projections, stream/resource/message order separation and non-rounded decimal sequence survive real serialization; global hidden counts/raw DB objects are absent. |
| C7-V16 | C7-S15, C7-S16 | C7-K09, C7-K11, C7-K12 | C7-W08 | Mutate before/during/after snapshot and delayed projection; no lost/duplicate applied change across barrier, pages and live subscribe. Client rows/tombstones and cursor commit together, including process crash. |
| C7-V17 | C7-S15, C7-S16 | C7-K03, C7-K10, C7-K12 | C7-W08 | Reconnect, expired journal, policy-generation change, full reset and account switch rebuild only authorized state; old cursors/subscriptions cannot restore past membership or replay another user's commands. |
| C7-V18 | C7-S14, C7-S15, C7-S30 | C7-K04, C7-K10, C7-K11 | C7-W08 | Slow consumers, oversized frames, duplicate/out-of-order events, compressed payload bounds, heartbeat/auth deadlines and bounded backoff preserve durable recovery while ephemeral signals may expire. |
| C7-V19 | C7-S17, C7-S18, C7-S30 | C7-K03, C7-K05, C7-K11 | C7-W04, C7-W08 | Persistence, gateway/device delivery, stream ack, message read, notification acknowledgment and approximate presence remain separate; forged receipts/status and removed-viewer presence lookup fail. |
| C7-V20 | C7-S19, C7-S20 | C7-K01, C7-K02, C7-K03, C7-K04 | C7-W09 | Service identity/audience, delegated principal, deadline/size/stream limits, protobuf compatibility and public error adapters work across any real RPC boundary; internal caller cannot appoint a user. |
| C7-V21 | C7-S21, C7-S22 | C7-K05, C7-K13 | C7-W09 | API acknowledgment requires durable command/outbox. Broker loss, duplicate delivery and crash before/after DB commit/ack recover one logical effect; unknown job schema/publisher authority fails safely. |
| C7-V22 | C7-S23, C7-S24 | C7-K03, C7-K07, C7-K13 | C7-W09, C7-W10 | Retry classification/budgets, stale leases, cancellation and privileged DLQ inspection/replay respect current consent and unknown provider effects; no new logical key or blind counter reset. |
| C7-V23 | C7-S25 | C7-K01, C7-K03, C7-K14 | C7-W06, C7-W09 | Agent tool adapters use the same domain authorization as manual clients; a forged approval flag, URL or instruction cannot bypass permissions, recipient consent or action prohibition. |
| C7-V24 | C7-S26, C7-S27 | C7-K02, C7-K04, C7-K14 | C7-W06, C7-W09 | Structured parent/child identity, scope, hop/depth/time/cost limits and cancellation stop escalation/loops; child result content cannot become trusted system policy. |
| C7-V25 | C7-S28 | C7-K03, C7-K05, C7-K15 | C7-W10 | Approved recipient/channel/template, verified binding, consent/quiet hours/rates and provider-specific unknown-outcome handling prevent unauthorized send or silent cross-channel fallback. |
| C7-V26 | C7-S29 | C7-K02, C7-K04, C7-K15 | C7-W10 | Exact-byte signature verification, key rotation, stale/replayed event, wrong provider account, duplicate ID with changed content and oversized payload reject invalid callbacks; correct URL/IP alone is insufficient. |
| C7-V27 | C7-S21, C7-S29 | C7-K05, C7-K13, C7-K15 | C7-W09, C7-W10 | Persist webhook/inbox job before success acknowledgment; DB outage, duplicate/out-of-order statuses, processing crash and untrusted payload cannot lose accepted events or grant unrelated authority. |
| C7-V28 | C7-S30, C7-S31 | C7-K03, C7-K04, C7-K10 | C7-W01, C7-W08, C7-W09 | Reviewed actor/resource/destination/provider budgets, Redis failure mode, presence TTL/visibility, limited replay work and fairness are exercised without client-side-only limits or infinite reconnect/retry. |
| C7-V29 | C7-S07, C7-S08, C7-S09 | C7-K04, C7-K06, C7-K16 | C7-W01, C7-W03, C7-W07 | Generated Kotlin/TypeScript clients and actual served OpenAPI agree on response/status/media/header/error shapes, null/omitted fields and large numeric strings; non-JSON and malicious error bodies are handled safely. |
| C7-V30 | C7-S10, C7-S11, C7-S15, C7-S16 | C7-K07, C7-K08, C7-K12 | C7-W04, C7-W05, C7-W08 | Offline optimistic state, HTTP/WS race, process death, token refresh, account switch, safe drafts and sensitive-action restrictions produce correct UI states without duplicate effects or cache mixing. |
| C7-V31 | C7-S13, C7-S19, C7-S22, C7-S26 | C7-K06, C7-K11, C7-K16 | C7-W06, C7-W08, C7-W09 | Old/new client and HTTP/event/job/protobuf compatibility matrix, unknown enums/critical versions, safe correlation/log redaction and rollback gates are tested; unsupported frames never silently advance cursors. |
| C7-V32 | C7-S01, C7-S02, C7-S03, C7-S31 | C7-K01, C7-K03, C7-K05, C7-K13, C7-K16 | C7-W01, C7-W02, C7-W03, C7-W04, C7-W05, C7-W06, C7-W07, C7-W08, C7-W09, C7-W10 | Release-scoped Android/web/API/DB/WS/worker demo and bounded load exercise denial/retry/cancel/recovery; record actual artifacts, failures, skips and provider simulations. A schema or mocked transport is not end-to-end proof. |

Use synthetic data and permitted test devices, controlled clocks and real supported HTTP/WebSocket/database/queue clients for their relevant behaviors. Unit tests and schema validation complement but do not replace actual upgrade/origin, transaction race, transport disconnect, parser bounds or signed-provider fixture checks. No runtime tests, clients, providers or servers were executed for this document.

## 16. Developer Handoff and Next Chapter

| Ticket | Accountable role | Depends on | Deliverable and evidence |
| --- | --- | --- | --- |
| C7-T01 | Product/API/security leads, Teams A/C/E | Relevant Chapter 1/18/3/6 choices | Approve canonical prefix/envelope, route reconciliation, state/retry/version and applicable C7-D01 through C7-D14 decisions. Do not infer approval from continuing to draft. |
| C7-T02 | API architect, Team C | C7-T01 | Versioned OpenAPI/error/header/schema operation catalog and missing-route contracts; safe request/response DTOs, domain mappings and initial compatibility matrix. C7-V01 through C7-V03. |
| C7-T03 | Identity/Space API engineers, Team C | C7-T02; approved identity/Space/data implementation | Implement actual auth/session/invite/member/policy routes and precondition/idempotency adapters using one domain service; C7-V02, C7-V04, C7-V11, C7-V12. |
| C7-T04 | Planning/community/messaging API engineers, Team C | C7-T03; released domain services | Split reviewed operation families into bounded changes, with durable message/task/event/reminder meanings and public/private projections; C7-V05 through C7-V07, C7-V10 through C7-V12. No entire-platform implementation implied by one package. |
| C7-T05 | Realtime/sync engineer, Teams B/C | C7-T02, C7-T03, C7-T04; approved stream/journal design | Implement chosen browser/native auth, subscriptions, snapshot barrier, replay/reset, current authorization and backpressure; real C7-V13 through C7-V19. |
| C7-T06 | Platform/worker engineer, Team C | C7-T02, C7-T03; C7-T04 for released jobs | Implement required internal RPC, durable queue/worker schemas, cancellation/deadline/retry/DLQ controls; C7-V20 through C7-V22. Avoid microservices or gRPC without a real boundary. |
| C7-T07 | Agent/file API engineers, Teams C/D | C7-T02, C7-T03, C7-T06; released Agent/file/data services | Implement only approved Agent/approval/memory and upload/processing/download contracts; C7-V08, C7-V09, C7-V23, C7-V24. These broader capabilities are not hidden M1 prerequisites. |
| C7-T08 | Integration/notification engineer, Team C | C7-T02, C7-T06; provider/consent approvals | Implement reviewed adapters, signed callbacks, dedup and unknown-outcome reconciliation; C7-V25 through C7-V27 using labeled fixtures before separately authorized live sends. |
| C7-T09 | Android lead/designer, Teams B/A | C7-T02; C7-T03 through C7-T08 for released integrations | Typed API/WS client, bounded HTTP errors, Room state/cursor reconciliation, safe refresh/offline queues and visible outcomes; C7-V29 through C7-V31 with native evidence. |
| C7-T10 | Web lead/designer, Teams B/A | C7-T02; C7-T03 through C7-T08 for released integrations | Typed client, cookie/CSRF/Origin controls, query/persistent-state reconciliation, responsive accessible flows and compatibility; browser evidence for C7-V13 and C7-V29 through C7-V31. |
| C7-T11 | QA/security/SRE leads, Team E | C7-T03 through C7-T10 for released scope | Run applicable real-transport/schema/security/recovery/load evidence C7-V01 through C7-V32; confirm limits/observability and document failures, simulations and deferred capabilities. |
| C7-T12 | Client/product architecture leads, Teams A/B/C | C7-T02; C7-T09 through C7-T11 for runtime acceptance | Chapter 8 screen/navigation/state handoff using canonical schemas and actual pending/error/recovery semantics. Design can proceed now; runnable-client acceptance needs executed evidence. |

These are responsibility packages, not staffed developers, executed subagents or automatic authorization to build everything. Split large packages into bounded tickets with source IDs, owner/dependencies, exact endpoint/schema changes, database and privacy implications, test commands, ADR/migration notes where applicable, runbook, demo steps and known limits. Security review and client feedback occur throughout, not only in the final QA package.

The first release-scoped demo remains account/proof -> family creation -> intended invitation/admission -> shared task/one-time reminder -> durable in-app notification -> acknowledgment -> cancellation/revocation/retry/restart evidence on Android and core web. A 202 response or simulated provider cannot stand in for the completed workflow. Broader demos add reliable chat/reconnect, public participation and controlled Agent actions only as their milestones are delivered.

| Mistake | Consequence | Contract protection |
| --- | --- | --- |
| Treat WebSocket connectivity, a queued job or HTTP 202 as completed action. | Lost work and misleading user status. | Durable intent plus explicit operation states and separate delivery/read facts. |
| Retry a timed-out mutation with a new key or another channel. | Duplicate messages, tasks or calls. | Same logical identity, current-authorized receipt and unknown-outcome reconciliation. |
| Send global/raw events and rely on the client to hide private fields. | Cross-Space content and metadata exposure. | Authorized scoped projections, current dispatch checks and bounded generation-aware streams. |
| Subscribe after loading a snapshot without a barrier. | Changes committed between the two steps disappear from the client. | Consistent source watermark, catch-up and atomic state/cursor commit. |
| Trust internal IDs, queue flags or signed callback payloads as unlimited authority. | Privilege escalation and unintended provider actions. | Verified actor/service/provider binding plus current domain and consent checks. |
| Let every client invent errors, versions and sync rules. | Hard-to-reproduce Android/web disagreement and broken old clients. | One published contract, typed adapters and versioned compatibility tests. |

Next: [Chapter 8](Chapter8.md), translating these identity, Space, data and API contracts into Android navigation, feature/state ownership, Room synchronization, screen states, accessibility and testable user flows. Carry [Chapter 9 web](Chapter9.md) parity alongside the shared workflow, and retain [Chapter 11 security](Chapter11.md) and [Chapter 19 encryption](Chapter19.md) gates before dependent implementation.

This completes the proposed Chapter 7 handoff. Source inventories are preserved, open choices are visible, and the document does not certify generated schemas, deployed APIs, live integrations or runnable clients.