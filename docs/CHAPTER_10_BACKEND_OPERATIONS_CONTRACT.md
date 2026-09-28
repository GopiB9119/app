# Chapter 10: Backend Processes, Deployment and Operations Contract

Status: DRAFT FOR PRODUCT, BACKEND, PLATFORM, SECURITY AND OPERATIONS REVIEW. This is a design handoff, not running infrastructure, provisioned cloud resources, a verified recovery exercise or permission to deploy.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity contract](CHAPTER_18_IDENTITY_CONTRACT.md), [Space contract](CHAPTER_03_SPACE_CONTRACT.md), [data contract](CHAPTER_06_DATA_CONTRACT.md), [API/realtime contract](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android contract](CHAPTER_08_ANDROID_CONTRACT.md) and [web contract](CHAPTER_09_WEB_CONTRACT.md). It develops C6-T10/C6-T11, C7-T06/C7-T11 and C9-T12 into process ownership and operational evidence requirements.

- [Chapter 10](../Chapter10.md) is the source. Begin with a domain-owned modular monolith, durable storage and separately executable worker/realtime roles. Logical domains do not require one deployed microservice or database per domain.
- M1 remains the synthetic account/family/task/one-time in-app-reminder workflow. Infrastructure should support that complete slice without making every future Agent, OCR, voice or public-feed service a prerequisite.
- Source tables, diagrams, configuration values and library choices are design inputs, not an approved cloud/vendor/version/cost commitment. Earlier product, identity, encryption, retention and provider gates stay pending.
- Preserve all original chapters and prior drafts. No container/image pull, network-policy change, service start, account creation, secret collection, migration, real message, spend or deployment is authorized by this planning continuation.
- All operational, restore, load, security and product acceptance scenarios are NOT RUN. Document consistency checks are not runtime proof, production readiness or a guarantee of zero incidents.

## 2. Exact Source Topic Coverage

All 40 numbered topics are retained with exact titles and anchors.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C10-S01 | Purpose | [10.1](../Chapter10.md#L3) |
| C10-S02 | Architecture Principle | [10.2](../Chapter10.md#L57) |
| C10-S03 | Initial Backend Topology | [10.3](../Chapter10.md#L105) |
| C10-S04 | Backend Domain Modules | [10.4](../Chapter10.md#L147) |
| C10-S05 | Service Responsibilities | [10.5](../Chapter10.md#L221) |
| C10-S06 | Modular Monolith Rules | [10.6](../Chapter10.md#L425) |
| C10-S07 | API Runtime | [10.7](../Chapter10.md#L466) |
| C10-S08 | Worker Architecture | [10.8](../Chapter10.md#L515) |
| C10-S09 | Queue Selection | [10.9](../Chapter10.md#L554) |
| C10-S10 | Transactional Outbox | [10.10](../Chapter10.md#L594) |
| C10-S11 | Idempotency | [10.11](../Chapter10.md#L653) |
| C10-S12 | Database Scaling | [10.12](../Chapter10.md#L707) |
| C10-S13 | Connection Pooling | [10.13](../Chapter10.md#L762) |
| C10-S14 | Large Table Strategy | [10.14](../Chapter10.md#L792) |
| C10-S15 | Redis Responsibilities | [10.15](../Chapter10.md#L847) |
| C10-S16 | Distributed Locking | [10.16](../Chapter10.md#L891) |
| C10-S17 | Agent Runtime Scaling | [10.17](../Chapter10.md#L919) |
| C10-S18 | Agent Worker Isolation | [10.18](../Chapter10.md#L983) |
| C10-S19 | External Provider Adapters | [10.19](../Chapter10.md#L1022) |
| C10-S20 | External Messaging Safety | [10.20](../Chapter10.md#L1066) |
| C10-S21 | Cloud Infrastructure | [10.21](../Chapter10.md#L1101) |
| C10-S22 | Network Design | [10.22](../Chapter10.md#L1169) |
| C10-S23 | Secrets Management | [10.23](../Chapter10.md#L1219) |
| C10-S24 | Deployment Environments | [10.24](../Chapter10.md#L1269) |
| C10-S25 | Deployment Pipeline | [10.25](../Chapter10.md#L1328) |
| C10-S26 | Database Migration Strategy | [10.26](../Chapter10.md#L1385) |
| C10-S27 | Health Checks | [10.27](../Chapter10.md#L1408) |
| C10-S28 | Autoscaling | [10.28](../Chapter10.md#L1460) |
| C10-S29 | Rate Limiting | [10.29](../Chapter10.md#L1506) |
| C10-S30 | Disaster Recovery | [10.30](../Chapter10.md#L1564) |
| C10-S31 | Recovery Objectives | [10.31](../Chapter10.md#L1618) |
| C10-S32 | Backup Testing | [10.32](../Chapter10.md#L1661) |
| C10-S33 | Failure Handling | [10.33](../Chapter10.md#L1695) |
| C10-S34 | Circuit Breakers | [10.34](../Chapter10.md#L1753) |
| C10-S35 | Observability Architecture | [10.35](../Chapter10.md#L1791) |
| C10-S36 | Security Operations | [10.36](../Chapter10.md#L1871) |
| C10-S37 | Cost Control | [10.37](../Chapter10.md#L1919) |
| C10-S38 | Production Readiness Checklist | [10.38](../Chapter10.md#L1967) |
| C10-S39 | Final Backend Architecture Decision | [10.39](../Chapter10.md#L2037) |
| C10-S40 | Chapter 10 Acceptance Criteria | [10.40](../Chapter10.md#L2085) |

## 3. Source Rules and Architecture Inventory

The ten numbered rules from section 10.6 retain their wording; typographic quotes around common in the last rule are normalized to ASCII. A directory tree alone does not satisfy these boundaries.

| ID | Source modular-monolith rule |
| --- | --- |
| C10-R01 | Each domain owns its business rules. |
| C10-R02 | Domains should not import internal implementation details from other domains. |
| C10-R03 | Cross-domain operations use service interfaces. |
| C10-R04 | Database tables have explicit ownership. |
| C10-R05 | Events are used for asynchronous side effects. |
| C10-R06 | Transactions remain local where possible. |
| C10-R07 | Cross-domain transactions require deliberate design. |
| C10-R08 | Tests should verify domain boundaries. |
| C10-R09 | Shared utilities must remain small. |
| C10-R10 | No "common" package should become a dumping ground. |

All ten source `domains/` module names in section 10.4 are retained. Scheduling/planning, integration and search ownership must also be explicit for released workflows even though this particular source tree does not list them as independent domain folders.

| ID | Source domain module |
| --- | --- |
| C10-M01 | identity |
| C10-M02 | community |
| C10-M03 | spaces |
| C10-M04 | conversations |
| C10-M05 | agents |
| C10-M06 | memory |
| C10-M07 | files |
| C10-M08 | notifications |
| C10-M09 | moderation |
| C10-M10 | audit |

The twelve non-separator lines of section 10.39's architecture block are retained verbatim. Queue/hosting alternatives are not selected merely by appearing in this list.

| ID | Source final architecture component |
| --- | --- |
| C10-F01 | FastAPI Modular Monolith |
| C10-F02 | PostgreSQL |
| C10-F03 | Redis |
| C10-F04 | Transactional Outbox |
| C10-F05 | Redis Streams or Managed Queue |
| C10-F06 | Dedicated Worker Processes |
| C10-F07 | LangGraph Agent Runtime |
| C10-F08 | Object Storage |
| C10-F09 | WebSocket Gateway |
| C10-F10 | OpenTelemetry |
| C10-F11 | Docker |
| C10-F12 | Managed Cloud Infrastructure |

## 4. Exact Source Readiness and Acceptance

All 31 checklist entries from section 10.38 are retained with their category. All are planning requirements; none is marked implemented or passed.

| ID | Source category | Source readiness item |
| --- | --- | --- |
| C10-G01 | Application | API versioning exists |
| C10-G02 | Application | Authentication is secure |
| C10-G03 | Application | Authorization is centralized |
| C10-G04 | Application | Idempotency is implemented |
| C10-G05 | Application | Outbox is implemented |
| C10-G06 | Application | Background jobs are durable |
| C10-G07 | Application | Retries are bounded |
| C10-G08 | Application | Dead-letter queues exist |
| C10-G09 | Application | Agent execution is isolated |
| C10-G10 | Application | File uploads are scanned |
| C10-G11 | Application | Audit logs exist |
| C10-G12 | Infrastructure | Private database network |
| C10-G13 | Infrastructure | Secret manager |
| C10-G14 | Infrastructure | TLS |
| C10-G15 | Infrastructure | WAF or equivalent protection |
| C10-G16 | Infrastructure | Autoscaling |
| C10-G17 | Infrastructure | Health checks |
| C10-G18 | Infrastructure | Metrics |
| C10-G19 | Infrastructure | Logs |
| C10-G20 | Infrastructure | Traces |
| C10-G21 | Infrastructure | Backups |
| C10-G22 | Infrastructure | Restore tests |
| C10-G23 | Infrastructure | Rollback plan |
| C10-G24 | Operations | On-call ownership |
| C10-G25 | Operations | Incident runbooks |
| C10-G26 | Operations | Alert thresholds |
| C10-G27 | Operations | Deployment approvals |
| C10-G28 | Operations | Security response plan |
| C10-G29 | Operations | Data deletion process |
| C10-G30 | Operations | Provider outage plan |
| C10-G31 | Operations | Disaster recovery exercise |

All twenty source acceptance criteria from section 10.40 are retained verbatim. All are NOT RUN; source coverage is not an operational acceptance result.

| ID | Source acceptance criterion |
| --- | --- |
| C10-A01 | Backend domains have clear ownership |
| C10-A02 | API and worker processes are separated |
| C10-A03 | Long-running tasks never block HTTP requests |
| C10-A04 | Agent runs are queued and independently scalable |
| C10-A05 | Database writes and events use an outbox pattern |
| C10-A06 | Retried operations are idempotent |
| C10-A07 | Redis is not the sole durable data store |
| C10-A08 | Sensitive services are private-networked |
| C10-A09 | Secrets are centrally managed |
| C10-A10 | Deployments support rollback |
| C10-A11 | Migrations are backward compatible |
| C10-A12 | Health and readiness checks exist |
| C10-A13 | Metrics, logs, and traces are available |
| C10-A14 | Rate limits are enforced |
| C10-A15 | Provider failures use bounded retries and circuit breakers |
| C10-A16 | PostgreSQL backups are automated |
| C10-A17 | Restore procedures are tested |
| C10-A18 | Disaster recovery objectives are defined |
| C10-A19 | Agent and infrastructure costs are measurable |
| C10-A20 | Production incidents have documented runbooks |

## 5. Operational Decisions and Gates

| ID | Choice | Proposed direction or unresolved requirement | Status |
| --- | --- | --- | --- |
| C10-D01 | Initial backend boundary | One domain-owned modular monolith and shared authorized domain interfaces; extract services only for measured load, independent ownership/deployment or a stronger security/reliability boundary. | PROPOSED |
| C10-D02 | Executable roles and workload isolation | Independently executable HTTP, realtime, dispatcher/scheduler and worker roles; combine only compatible low-volume jobs without losing per-class quotas. Never run heavy parsing/Agent execution inside HTTP just to save a process. | PROPOSED |
| C10-D03 | Queue and worker transport | Select Redis Streams or a maintained managed queue/worker library after durability, acknowledgment, ordering, lease, retry, operational and cost review. PostgreSQL durable intent/recovery remains mandatory. | OPEN |
| C10-D04 | Database versions and capacity | Choose supported PostgreSQL/driver/pool/proxy versions, total connection/memory budgets, migration privileges and replica/failover consistency strategy. No guessed performance capacity. | OPEN |
| C10-D05 | Redis failure domains | Separate or explicitly isolate cache/presence eviction from queue/coordination needs; choose memory, persistence, failover, authentication and rate-limit-outage policies. One convenient Redis instance is not automatically suitable for every role. | OPEN |
| C10-D06 | Cloud, region and deployment platform | Choose launch region/data residency, provider, managed services, container host/orchestrator and network boundaries. Docker Compose is local development, not evidence of production HA. | OPEN |
| C10-D07 | Workload identity and secrets | Select service authentication, least-privilege IAM, secret/KMS delivery/rotation and scoped break-glass administration. Do not embed credentials in image layers, prompts or client configuration. | OPEN |
| C10-D08 | Service objectives and recovery promises | Agree workload, availability/latency/reminder tolerance, support window, RPO/RTO by data class and permitted recovery degradation. Source values are examples until adopted and measured. | OPEN |
| C10-D09 | Admission, backpressure and autoscaling | Bound requests, database connections, job lanes, provider concurrency and cost globally as well as per worker. Scaling may not exceed downstream budgets; overload returns honest states. | PROPOSED |
| C10-D10 | Health, readiness and drain | Distinguish process liveness, initialization/startup, role-specific readiness and workflow success. Optional provider outage should not restart or remove every healthy core API replica. | PROPOSED |
| C10-D11 | Release and migration compatibility | Immutable reviewed artifacts, versioned config/contracts, expand/backfill/contract migrations, staged rollout and safe roll-forward/rollback. Frontend deploy does not run arbitrary backend DDL. | PROPOSED |
| C10-D12 | External provider operating policy | Verify capabilities, regions, consent, templates, keys, status/idempotency/retry limits, cost and reconciliation. Provider fallback is not permission for another channel or broader data use. | OPEN |
| C10-D13 | Recovery and incident controls | Tested restore into isolation, source-of-truth verification, deletion/revocation replay, external-effect reconciliation and explicit approval before traffic/sends resume. Audited kill switches reduce capability, never bypass safety. | PROPOSED |
| C10-D14 | Operational ownership and retention | Assign release, on-call, safety, data-protection and cost owners; set escalation/alert/log/audit/metric retention and emergency access policy. Roles are responsibilities, not a claimed staffed team. | OPEN |

These six proposals and eight open decisions do not authorize provisioning or policy selection. A healthy process, a passing container config check or a backup file alone is not proof of the product workflow or recoverability.

## 6. Domain and Process Ownership

### Domain Contracts

Reuse the proposed canonical identities, memberships, schedules, API meanings and data constraints from earlier drafts. The source repository layout is one organizational example, not permission to create parallel `users/accounts`, Space memberships or reminder engines in different packages.

| Ownership group | Source modules | Required boundary |
| --- | --- | --- |
| Identity | C10-M01 | Account lifecycle, authentication/session proof and platform identity policy. Resource roles belong to the actual resource owner; the source's identity role-assignment responsibility does not create a global admin override for every Space. |
| Public community | C10-M02 | Page/post/comment/reaction/follow/publication and discovery metadata, with current public eligibility. Moderation cases/enforcement are coordinated with the safety owner, not independently implemented twice. |
| Private Spaces | C10-M03 | Space type, policy, scoped roles, invitation/admission, capacity, history and lifecycle. Shared services consume its decisions without reading or mutating its private implementation arbitrarily. |
| Conversations | C10-M04 | Conversation participation, durable ordered messages, receipts and permitted attachments/search. A Space owner or realtime broadcaster does not automatically own private sub-conversation access. |
| Agent execution and memory | C10-M05, C10-M06 | Bounded runs, tools, exact approvals, checkpoints and source-scoped memory with separate ownership where useful. Runtime never writes arbitrary domain rows or promotes retrieved text into policy. |
| Files | C10-M07 | Upload/version/scan/extraction/authorized download and derived-artifact lifecycle. Parser and provider adapters are replaceable implementations behind the domain, not privileged general fetchers. |
| Notifications | C10-M08 | Recipient/channel/preferences/consent, delivery attempts, acknowledgment and approved escalation. A separate deterministic scheduling capability owns due occurrence generation; do not keep an LLM alive as the timer. |
| Safety and moderation | C10-M09 | Case-scoped review/enforcement/appeals and interaction restrictions through central policy. A classifier prediction is not unrestricted removal or permission to browse all private evidence. |
| Audit/security evidence | C10-M10 | Controlled append/audit interfaces, safe metadata, retention and access. Critical business mutation must include durable audit intent in its transaction; a best-effort later audit worker cannot be its only evidence. |

Explicit additions required by the existing product: planning owns tasks/events/schedule intent; search owns rebuildable authorized projections; integration adapters own provider protocol mapping while domain services own authority; data-rights orchestration tracks export/deletion across released domains. These responsibilities can be modules or interfaces in the same backend, not necessarily new services or empty folders.

Cross-domain transactions within one database use a deliberate shared unit of work and reviewed interfaces. They must not commit each repository independently during one atomic admission or task/schedule operation. Longer cross-system workflows use durable staged state, idempotency and reconciliation; compensation cannot magically undo a sent message, deleted key or leaked data. Import/dependency tests and contract tests enforce boundaries rather than relying only on a source tree.

### Executable Roles

| Role | Work and scaling unit | Credentials, failure and release boundary |
| --- | --- | --- |
| Edge/gateway | TLS, trusted routing, WAF or equivalent abuse protection, request/connection/body limits and allowed proxy metadata. | Only designated entry surfaces are reachable; cannot bypass application authentication, CSRF or resource authorization. Public exposure is not unrestricted access. |
| HTTP API | Short bounded requests, identity/domain validation, local transactions and durable command acceptance. | Per-process connection/admission budgets; no OCR/long Agent graph inside the request or in an untracked fire-and-forget task. |
| Realtime gateway | Authenticated bounded connections/subscriptions, authorized projections and replay/reset. | Current session/membership checks and backpressure; not the message source of truth or a route to raw broker events. |
| Privileged admin surface | Case/operation-scoped safety, support and operational actions. | Separate audience, strong operator identity and audit; isolated deployment/network entry when required. Shared code does not justify public unrestricted admin routing. |
| Outbox dispatcher | Claim/publish durable domain event/job intent and reconcile transport handoff. | Bounded batches, owner/versioned claim, retry and progress; duplicate publication is expected and consumers deduplicate. |
| Scheduler | Materialize due occurrences/revisions and durable jobs without a model session. | Current schedule policy, indexed cursors and unique logical occurrences; leader optimization never replaces database invariants or expiry checks. |
| Notification workers | Approved in-app/selected provider dispatch, delivery attempt/status processing and acknowledgment/escalation coordination. | Current recipient/consent checks, global provider limits and dedicated outbound credentials; unknown outcomes block blind resend/fallback. |
| Agent workers | Persisted LangGraph runs/checkpoints, controlled tools, approval waits and bounded resource usage. | Separate concurrency/spend lanes; releases must handle old graph/checkpoint/tool versions. Waiting for a human releases scarce execution capacity. |
| File/media workers | Scan, extract/OCR/preview and bounded document generation jobs. | Treat uploaded bytes as hostile: isolated unprivileged execution, resource/temp-file/network limits and only needed object access. No database admin or notification credentials. |
| Search/projection/moderation workers | Derived indexes/counters, permitted analysis and policy-bound classifications. | May lag under load, but cannot relax audience/safety gates. High-risk publication waits or quarantines under policy if mandatory controls are unavailable. |
| Export/deletion/maintenance workers | Scoped lifecycle stages, retained-data handling and approved cleanup. | Privileged only for the required stage; audit, rate controls, holds and pause/recovery. No arbitrary bulk query/download through a generic job argument. |

These are executable responsibility boundaries, not a required initial fleet of eleven independently operated products. Share one reviewed code artifact when appropriate and choose role-specific entry points, identities, configuration and resource budgets. Separate dangerous parsers and different trust/latency classes. Multiple processes on one machine are not host failure tolerance; HA requires actual placement, data and recovery design.

### Operational Invariants

| ID | Rule | Consequence |
| --- | --- | --- |
| C10-K01 | Domain logic and data authority have one owner. | Clients, BFF, Agent/tools and workers use the same controlled services; extraction requires a real reason and transition plan. |
| C10-K02 | Processes, pools and external work are bounded. | Short API work, separate heavy/long work and per-class concurrency/deadlines stop one workload starving reminders or authentication. |
| C10-K03 | Accepted work has durable transactional intent. | Business state plus outbox/job/audit intent commits before acknowledgment; transport loss cannot silently erase accepted operations. |
| C10-K04 | Retries preserve logical identity and authority. | Same validated intent, current access and safe receipt; no new key or secret-bearing cached response after an unknown outcome. |
| C10-K05 | Claims and leases cannot overrule durable correctness. | Owner tokens, expiry, conditional finalization and consistent resource constraints; stale workers cannot release or commit another worker's claim. |
| C10-K06 | Authorization and consent are current at sensitive execution. | Delayed tools, dispatch, exports, admin actions and replay cannot rely solely on admission-time or cached permission. |
| C10-K07 | Capacity limits include every replica, rollout and dependency. | HTTP/WS/worker/migration pools, provider budgets and storage remain within measured global limits; autoscaling cannot create unlimited downstream load. |
| C10-K08 | Network and workload identity enforce least privilege. | Private data/control planes, authenticated internal calls, scoped egress and no caller-selected identity/URL proxy. |
| C10-K09 | Secret, key and environment lifecycle is explicit. | Protected delivery/rotation/revocation, isolated environments, validated startup config and no secrets in artifacts, prompts or logs. |
| C10-K10 | Releases and schema/queue versions remain compatible. | Immutable artifacts, staged config/migrations, old-client/worker compatibility and tested roll-forward/rollback; no automatic destructive reversal. |
| C10-K11 | Probes and drain report actual capability. | Liveness differs from readiness/progress; graceful stop preserves/reconciles work instead of claiming every in-flight operation completed. |
| C10-K12 | Failure modes degrade deliberately or fail closed. | Optional cache/presence/model failure does not grant access or stop all manual core use; unavailable authority or durability blocks sensitive acceptance. |
| C10-K13 | Recovery includes data, keys, revocation and external effects. | Restore in isolation; reapply privacy/cancellation history and reconcile provider outcomes before traffic or sends. Backup existence alone is not evidence. |
| C10-K14 | Telemetry and audit are useful, bounded and private. | Safe correlation and controlled audit survive where required; no raw messages, keys or high-cardinality private identifiers in ordinary metrics/logs. |
| C10-K15 | Cost and provider use are authorized and bounded. | Aggregate budget/reservation and per-purpose consent apply across child runs/retries; failover cannot silently spend or disclose more. |
| C10-K16 | Ownership, incident controls and acceptance are evidenced. | Named operational responsibility, tested runbooks/kill switches, actual commands/results and explicit untested scope; no production claim from documents. |

## 7. Request, Job and Worker Workflows

All workflows below are proposed operational refinements. No process has been started or configured for this document.

### C10-W01 Admit and Execute a Bounded API Request

Apply approved edge limits for connections, TLS/headers/body/media/decompression/time, then application admission and authentication with trusted proxy/Host/Origin policy. FastAPI/Pydantic validate bounded input and narrow ownership fields; a WAF cannot implement the actual Space/conversation/consent checks. Defaults and exact limits require workload/threat review, not copying arbitrary numeric examples.

Execute current-authorized domain work under the Chapter 6 transaction contract and Chapter 7 response semantics. Async I/O does not make CPU-heavy validation/parsing safe on the event loop. Small synchronous operations may complete during the request; long workflows become durable jobs/runs with IDs/status paths. Return 201 for its saved resource or 202 only after durable accepted intent, not after an in-memory `create_task` or transient queue publish.

Each request uses a bounded DB session/unit of work, pool acquisition, query/lock timeout and cancellation handling. Do not share one SQLAlchemy session across concurrent tasks or hold locks while calling a provider. Retry a serializable/deadlocked transaction only through a bounded reviewed whole-transaction policy that excludes external effects. A caller disconnect/timeout may occur after commit; reconcile by logical operation rather than assuming no effect.

API state remains stateless with respect to durable sessions/commands; local caches contain no sole authoritative permission or business records. A replica can stop without losing accepted reminders. Health and overload response capacity must itself be bounded; load shedding may preserve useful probes but cannot pretend a saturated process is ready for unlimited traffic.

### C10-W02 Deliver Realtime Without Making It Durable Truth

Authenticate the session, resource subscriptions and current audience/history under Chapter 7. Gate private projections before fanout and again at sensitive delivery/replay boundaries. Presence/typing have bounded Redis TTL state, not proof that a recipient read a message or can receive a call. Stateless/API scaling and sticky sessions do not replace authorized reconnect recovery.

Stored messages and change history remain in PostgreSQL/durable projections. Broker or gateway interruption may delay live delivery while authorized REST history and resynchronization remain possible. Bound connection count, subscriptions, frame size, slow-consumer buffers, replay batch and catch-up work; coalesce/drop permitted ephemeral signals, not durable updates while advancing the cursor.

Deploy/drain with a defined reconnect signal and enough replay retention. New connections avoid draining instances; existing ones complete safe handoff or close within a bounded window. Account revocation/member removal stops new protected delivery regardless of connection longevity. No old replica or stale cached subscription may continue serving private events merely because its process has not exited.

### C10-W03 Persist, Publish, Claim and Reconcile Work

Commit business mutation and durable outbox/job/audit intent together. A dispatcher claims a bounded batch, publishes with stable event/job identity and records transport acknowledgment under its lease/version. Publish-before-mark creates possible duplicates on crash, which consumers must handle. Mark-before-confirmed-publication loses work and is not acceptable.

Transport acknowledgment is not business completion. A durable job ledger, retained outbox/replay policy and reconciliation sweep must recover unfinished accepted operations even if a broker loses a message previously marked published. Define which acknowledgments allow compaction; deleting every published outbox row without another authoritative pending-work record cannot meet the recovery promise.

Consumers verify producer/schema/job references, check current domain eligibility, claim with owner token/expiry and commit processed state plus durable dedup identity before acknowledging the broker. If Redis Streams is chosen, plan pending entries, reclaim after lease/worker loss, dead-letter handling and retention so trimming does not destroy unfinished work. Redis Pub/Sub alone has no durable replay guarantee. Alternative managed-queue redelivery/visibility/FIFO limits require provider-specific verification.

Lease renewal/finalization is conditional on the actual owner/fencing epoch. A timeout is not proof the old worker is dead. Redis locks may reduce duplicate effort but must not replace PostgreSQL uniqueness/admission/approved-action constraints; a provider that ignores fencing may still execute a stale request. Perform slow external work outside DB locks and reconcile unknown outcomes with supported provider idempotency/status, never claiming universal exactly-once delivery.

Backoff/jitter, attempts, availability windows, overall deadlines and queue age are durable reviewed policies. Permission/input/expired-approval errors are not transient failures to retry forever. DLQ inspection/replay is scoped, audited, redacted and reauthorizes the original intent; creating a new key or clearing counters does not make an uncertain external action safe.

### C10-W04 Materialize Schedules and Deliver Notifications

The scheduler calculates durable occurrences from reviewed local-time/timezone/revision rules without an active app or LLM. Materialize occurrence identity, cursor and delivery work atomically; restarts, duplicate timer events and two scheduler replicas cannot create two logical occurrences for the same intent. Unique constraints and current revision checks remain authoritative even when leader leases exist.

Check effective time/expiry after relevant lock waits; PostgreSQL transaction-start `now()` alone can be stale. Use bounded indexed due scans and recovery sweeps so a late cleanup process cannot extend guest/member access or revive cancelled schedules. Separate schedule lag, queue wait, provider latency and client visibility in status/metrics rather than calling them all reminder execution time.

Notification workers resolve current recipient binding, resource/history access, purpose-specific consent, preferences/quiet hours, selected channel/template and allowed escalation. A saved standing reminder can outlive its creator's short-lived login session, but not the current account/resource/consent authority it requires. Record skipped, expired, failed or held work honestly if outages exceed the reviewed delivery tolerance; do not silently send every overdue reminder in a recovery burst.

M1 is in-app history and explicit acknowledgment. Live push/email/SMS/WhatsApp/voice have distinct provider approval, opt-in, capacity, status and cost gates. Provider acceptance, delivery, read and user acknowledgment are separate facts; no message receipt proves medication adherence or a clinical emergency. Escalation has bounded recipients/delays/attempts, minimal disclosure and stop conditions for response, cancellation, expiry or revoked consent.

### C10-W05 Run the Agent With Isolation and Budgets

The HTTP API validates a scoped request and saves the run plus durable job intent; a separate Agent worker loads a compatible graph/tool/policy revision and current delegation. Run status is queried/streamed through the same API/realtime contract, not invented by worker logs or a progress animation. Manual tasks/messages/reminders should still work if a model provider is unavailable.

Bound aggregate steps, duration, tokens/cost, tool requests, parallel children, recursion, output size, retrieval amount, provider connections and retries. Enforce limits on the server across resumed/child runs, not only per HTTP request or a client-supplied `max_cost`. Checkpoint before waiting for approval/provider workflow transitions where required, release scarce active slots and reload with current authority. Waiting for a human must not reserve a GPU/model connection/DB transaction indefinitely.

Tools call current-authorized domain interfaces; no arbitrary SQL, filesystem/network endpoint, shell execution or privileged service tokens from model text. Model output and retrieved/file content are untrusted. Account/membership/consent/delegation/policy revocation invalidates later protected steps and exact approvals. Graph/version upgrades cannot reinterpret a pending approved payload; route compatible checkpoints or require an explicit reviewed migration/restart.

Provider unavailability pauses/fails the affected run with truthful partial/unknown outcomes and bounded retry. Alternate model/provider routing requires approved capability, privacy, jurisdiction, evaluation and budget compatibility; no silent downgrade or repeat of external effects. Product routing does not relax the user's Astra-only development-agent instruction. No Agent execution is part of the initial manual M1 workflow.

### C10-W06 Process Files, Search and Safety Work Separately

Untrusted files stay quarantined until required validation/scanning, then bounded workers operate on immutable versioned inputs and isolated temporary storage. Enforce CPU/memory/time/page/count/decompression limits, minimum object scope and egress restrictions. A resource-limit kill leaves resumable processing state, not a ready/searchable file. OCR/embedding bursts must not exhaust the API or notification pool.

Page/extraction/index jobs are idempotent per source/generation; partial failures preserve correct ordered provenance and no broader permissions. Search/vector/feed caches are rebuildable, but current object/consent/deletion eligibility gates serving and Agent context even while cleanup/reindex lags. Do not skip required security scanning to clear a queue backlog.

Moderation classification is scoped and distinguishable from confirmed human decisions. Mandatory safety controls failing may quarantine or delay eligible publication under reviewed policy; not every public read needs the classifier to be online. Case/evidence exports are protected; heavy safety/file work uses separate lanes and operator roles. Sensitive data cannot be copied into an unrestricted error payload or DLQ for easy debugging.

## 8. Capacity, Coordination and Backpressure

### C10-W07 Scale Within Downstream Limits

Scale independently by workload signals: API latency/admission/pool waits, realtime connections/replay/buffer pressure, worker oldest-job age/throughput and provider limits. CPU alone cannot distinguish idle workers waiting on a provider from spare useful capacity. Increasing replicas during an upstream quota outage may worsen retries, bills and database saturation.

Apply per-user, per-destination, per-Space, per-provider and global budgets as appropriate. Replica-local semaphores are not distributed provider/cost caps; choose an authoritative reservation/quota design with its own outage behavior. Shared networks require more than IP-only limits; new OTP challenge or child-run IDs cannot reset aggregate abuse budgets. Rate replies preserve safe machine code, request ID and bounded Retry-After semantics.

### Connection Budget Worked Example

This synthetic JSON example illustrates capacity arithmetic only. It is NOT recommended deployment configuration, a benchmark or permission to start these processes. `peak_instances` includes rollout surge; `pool_size + max_overflow` is the maximum per process before any pooling topology is modeled.

```json
{
	"database_max_connections": 160,
	"reserved_connections": 20,
	"migration_connections": 5,
	"operations_connections": 10,
	"roles": [
		{ "role": "http", "peak_instances": 6, "processes_per_instance": 2, "pool_size": 4, "max_overflow": 1 },
		{ "role": "realtime", "peak_instances": 4, "processes_per_instance": 1, "pool_size": 2, "max_overflow": 1 },
		{ "role": "notification", "peak_instances": 4, "processes_per_instance": 1, "pool_size": 3, "max_overflow": 1 },
		{ "role": "agent", "peak_instances": 4, "processes_per_instance": 1, "pool_size": 2, "max_overflow": 0 },
		{ "role": "file", "peak_instances": 2, "processes_per_instance": 1, "pool_size": 1, "max_overflow": 0 },
		{ "role": "scheduler", "peak_instances": 2, "processes_per_instance": 1, "pool_size": 2, "max_overflow": 0 },
		{ "role": "outbox", "peak_instances": 2, "processes_per_instance": 1, "pool_size": 2, "max_overflow": 0 }
	]
}
```

For this example, application pools require 106 connections; reservations/migrations/operations bring the total to 141, leaving 19 of 160 unallocated. If adding another role, replica surge, monitoring consumer, backup client or maintenance process, recompute rather than relying on the old headroom. This simple arithmetic does not prove memory, query throughput, I/O or HA capacity.

Budget API/worker pool minimum/maximum/overflow and acquisition timeout globally. If using PgBouncer or managed transaction pooling, separately calculate proxy client connections and actual server connections; review prepared statements, session variables/RLS context, advisory locks and driver behavior for the exact versions/mode. Do not assume a proxy creates infinite capacity or carries per-request identity safely between pooled transactions.

Large messages/audit/notifications/Agent steps/outbox/jobs use authorized composite-key cursors, measured indexes, vacuum/storage/WAL monitoring and explicit retention. Partition or archive only when query/retention volume warrants it; PostgreSQL partitioned uniqueness and cross-table constraints need review. Lagging replicas are not an immediate revocation authority. Multi-region placement must follow actual data residency/failover requirements, not the word global in the product vision.

### Redis and Queue Failure Domains

Cache eviction, typing/presence and durable-stream transport have different requirements. Logical database numbers alone do not isolate Redis process memory limits, eviction, failure or CPU contention. If sharing infrastructure, review key policies, memory reservations, authentication/ACL and degradation; stronger isolation may require separate managed instances or an independently durable transport. A queue that depends on no-eviction memory must reject/pressure intake safely before filling the host.

Redis can accelerate idempotency/session data only if authoritative receipt/revocation and accepted work remain recoverable from the chosen durable system. Presence TTL expiry becomes unknown/offline under its privacy policy, not a source of action authority. If a lock/limiter becomes unavailable, choose fail-closed or a strictly bounded approved fallback for security-sensitive paths; do not give unlimited login attempts or create split-brain Agent sends.

Backpressure includes payload/request admission, bounded queue length/age, provider quotas, worker concurrency, DB pool wait, disk/temp-file limits and cost. Prioritize interactive/manual and time-sensitive permitted reminders relative to optional bulk reindex/OCR, with starvation and fairness policy. Capacity exhausted before durable acceptance returns a safe unavailable/rate error. Capacity exhausted after acceptance leaves tracked queued/failed/expired state and alerts; it does not erase intent or fabricate success.

## 9. Environments, Network and Secrets

### C10-W08 Establish and Rotate a Least-Privilege Environment

This is a future provisioning procedure, not commands executed here. Select provider/region/host/data-residency and environment isolation under C10-D06/C10-D07 before handling real user data or money. Maintain versioned infrastructure/configuration and reviewed changes through the selected deployment tooling, not manual undocumented production tweaks.

| Environment | Permitted use | Separation and release boundary |
| --- | --- | --- |
| Local | Approved Docker Compose or equivalent developer runtime, synthetic data and explicit mocks. | Bind exposed debug/data ports narrowly to the intended host; reviewed images/dependencies and isolated volumes/credentials. Never imply that local mocks prove live SMS, push or model behavior. |
| Development | Shared integration with synthetic/test accounts and safe provider modes. | Separate identities, secrets, objects, queues and outbound destinations; debug logging still excludes sensitive payloads and tokens. |
| Staging | Production-like release candidate, migration, failure, load and restore tests. | Isolated tenant/accounts, cost bounds and no production credentials or uncontrolled sends. Sanitized production-derived data requires explicit legal/privacy review, not an assumed convenient copy. |
| Production | Authorized real-user service and operational controls. | Audited access/release approval, defined on-call, tested backups/restore, rollback and data-rights obligations. No direct deployment from an unreviewed model instruction or chat approval of planning. |

Only approved public entry points are exposed: web/CDN, API edge and authenticated realtime. Administrative domain operations may have an authenticated user-facing route, but internal admin/control APIs and sensitive management endpoints remain private or behind their reviewed privileged access path. Presigned object data transfer is a deliberate restricted data-plane exception, not public bucket browsing or storage management access.

Private PostgreSQL, Redis, broker, worker/control ports, metrics and object-management endpoints need explicit network and workload identity rules. Allow only required ingress/egress pairs. Internal REST/gRPC validates service identity/audience and delegated actor, not a trusted network header appointing a user. Apply supported TLS/hostname verification and least-privilege roles; never disable verification or broaden firewall/domain policy to work around a setup failure.

Uploaded documents and model-requested URLs cannot access cloud metadata, loopback/private networks or arbitrary destinations. Separate untrusted parsers from service secrets and use approved bounded egress/fetch adapters where required. Container/process resource limits and non-root/read-only/minimal-filesystem capabilities help isolation, but a container label alone is not a sandbox or complete tenant boundary.

Secrets live in the selected secret manager/Vault/secure provider-backed store with per-role access. Plain Kubernetes Secret base64 encoding or an environment variable name is not an encryption/access design; verify at-rest encryption, workload permissions, delivery, process/debug exposure and rotation. Runtime credentials are not baked into images, source control, CI logs, documentation examples, browser bundles, Android APKs or Agent prompts.

Rotation stages the new credential/key, supports a bounded overlap only where required, verifies new use, revokes old capability and audits the result. Signing/session key rotation, encryption-key rotation and provider API-key rotation have different invalidation and recovery semantics. Do not destroy a key required for lawful retained ciphertext/backups as a generic emergency cleanup step. Break-glass access has a named approver, scoped time-bound identity, safe audit and after-use review; it never removes the audit trail to make work easier.

Configuration has typed startup validation, environment/role identity, version and explicit mandatory/optional capabilities. An unavailable optional provider can disable that feature; missing critical database/auth/signing policy must not start a permissive default. Runtime flags can pause tools/providers/new work and reduce exposure, not silently enable prohibited health/external features or bypass consent. Snapshot effective configuration identity safely, excluding secret values.

## 10. Release, Health and Graceful Shutdown

### C10-W09 Release a Compatible Artifact and Drain Safely

Build a reviewed immutable artifact from the chosen source/dependency lock state, with software inventory/provenance, dependency/container scans, unit/integration/security tests and explicit configuration version. Signatures/digests identify an artifact; they do not prove its code safe or approve its deployment. Never bake runtime secrets into layers or trust a mutable latest tag as a reproducible rollback target.

Promote the same eligible artifact through controlled environments after matching environment-specific configuration/keys without mixing user data. A staging success does not authorize production automatically. Record artifact/schema/graph/tool/policy/API/event versions, release owner, change purpose, checks, maintenance/rollback boundary and approver. Backend, Android, web and old open tabs/long-lived sockets may span different versions; validate the supported compatibility matrix before exposing new required fields/events.

Use expand/backfill/validate/contract migrations with the data contract's lock budgets, batch checkpoints and real PostgreSQL checks. The source's dual-write example is a temporary versioned compatibility bridge with atomic updates and one defined authority, not permanent competing fields. Avoid running migrations once per autoscaled API pod or tying DDL blindly to frontend deployment. Elect a controlled migration executor, test interrupted backfills and validate constraints before contracting old schema. A destructive schema/key/data change may require roll-forward or restore; rolling back an image does not undo it.

Choose rolling, canary or blue/green deployment based on the environment, compatibility and measured risks. They are alternatives, not three systems every startup must maintain. Before traffic shift, require role-specific startup/readiness plus bounded synthetic workflow checks. Observe latency/errors, authorization/security signals, durable job lag, provider effects and cost, not just container uptime. Auto-rollback is permitted only where artifact/config/schema/work compatibility is actually safe; otherwise freeze, contain and use the approved recovery path. Do not automatically roll back to an image with a known exploit.

Agent graph/checkpoint, job schema and event-schema versions need a routing/migration plan. Old workers must not parse a new payload as a permissive old schema or repeat a new operation while retrying. Retain compatible consumers or pause/reconcile unsupported work. A DLQ is not a substitute for deciding whether an upgrade can resume existing approved runs.

### Probe Contract

The source names `/health/live`, `/health/ready` and `/metrics`. Treat them as proposed role-local operational endpoints, not automatically public `/v1` product routes. HTTP path, response/access format and chosen orchestrator integration still require implementation review; worker-only processes may expose a small management listener or an equivalent supervised health mechanism, not a second business API.

| Signal | What it proves | What it must not claim |
| --- | --- | --- |
| Startup/initialization | Required config, compatible schema and role initialization completed within a bounded supported window. | That all optional providers, every index rebuild or every historical job has completed. |
| Liveness | Process/event loop or worker supervisor can make the defined minimal progress; probe cost/deadline is bounded. | Successful database/provider connectivity on every probe. A shared DB outage must not trigger a full restart storm by itself. |
| Readiness | This role can accept the routed kind of work now under required dependency, capacity and drain conditions. | Universal product success. An API with a durable outbox may accept eligible bounded work while broker transport is down; a dispatcher requiring that broker may not be ready. |
| Worker progress | Heartbeats, claim/execution progress and lease recovery reflect the intended loop and workload. | A permanently stuck job is healthy merely because a separate probe thread responds. Use progress/deadline metrics as well as process liveness. |
| Workflow synthetic check | A bounded authorized synthetic request completes the particular login/chat/reminder or other released flow. | All users, regions or capabilities are healthy. Never send real notifications or use actual family/health records for a probe. |
| Metrics endpoint | Authenticated/private collection of approved aggregate telemetry. | Open administrative control, raw DB metadata, secrets or user-content dumps. |

Probes themselves have deadlines, modest budgets and safe caching of health evidence only within reviewed freshness. Avoid N replicas making expensive database/provider calls on every rapid health poll. Separate optional capability degradation from core readiness; model outage should not remove all healthy manual task APIs. Overload can shed work or reduce readiness under a designed policy without causing synchronized eviction/restart loops. A readiness false state stops new routed work but does not erase accepted jobs.

### Graceful Stop and Restart

On termination/deploy, mark draining, stop new admissions/subscriptions/claims, then finish or checkpoint existing bounded work according to its contract. HTTP in-flight transactions must finish or roll back; request cancellation is not proof an already committed command was undone. Realtime sends a safe reconnect/close path and preserves replay state. Do not acknowledge undelivered durable data just to empty a buffer.

Workers stop acquiring new leases, renew only while still legitimately working, and save current progress before releasing under the owner token. If force termination occurs, lease expiry/recovery and idempotency restore the job; do not mark it succeeded on shutdown or release another worker's claim. External sends already accepted or with unknown outcomes remain in reconciliation state. A deployment's drain timeout is chosen against actual job/checkpoint/provider behavior; not every long task is safe to abandon and retry.

Close per-role DB/provider/socket resources, flush bounded privacy-safe telemetry where possible and preserve essential audit intent in durable storage. A best-effort trace export failure need not undo a valid business transaction, but a mandatory audit-record failure may block a high-impact action. Deliberately decide that distinction before release.

## 11. Observability, Cost and Service Objectives

### C10-W10 Measure Workflows and Enforce Operating Budgets

Track the source's logs, metrics and traces through request -> domain -> DB/outbox -> job -> worker/run/tool -> provider -> client-visible result. These are related causation/correlation links, not necessarily one synchronous trace that stays open through hours of human approval. Use supported OpenTelemetry context propagation/span links and durable operation IDs without logging secrets in baggage or high-cardinality metric labels.

Metrics should distinguish admission failures, durably accepted work, execution failures, unknown provider outcomes, delivery, acknowledgment and cancellation. A message-send API 201 can be correct while the gateway is degraded; a low HTTP error rate can hide a stopped scheduler or growing DLQ. Similarly, one user's disabled permission is a policy result rather than an availability outage, but unusual denial patterns can signal a regression or abuse.

| Objective family | Indicator and scope | Decision/evidence required before launch |
| --- | --- | --- |
| Identity and API | Successful eligible operations, p95/p99 latency and error/admission/pool-wait split by route template. | Define operation eligibility, workload, measurement window, targets and outage exclusions. Existing Chapter 1 figures remain initial unbenchmarked targets. |
| Messaging/realtime | Durable acknowledgment, authorized fanout delay, reconnect/catch-up success and oldest unresolved stream lag. | Separate persistence from device receipt; select replay retention, consumer pressure bounds and supported offline conditions. |
| Scheduling | Occurrence materialization lag, due-to-dispatch lag, successful permitted delivery, skipped/expired and unknown outcomes. | Agree lateness/catch-up policy and tolerance per use case. No app background or medical-emergency guarantee is inferred. |
| Agent/tools | Queue/runtime/approval waits, verified completion/partial/failure, forbidden-action prevention and cost per run. | Define active versus human/provider wait, provider capability/budget and evaluation gates. Agent unavailability must not disable manual core functions. |
| Files/search/safety | Quarantine/processing age, partial/error rate, index freshness/ACL correctness and moderation backlog. | Define interactive/bulk priorities, mandatory scan/review gates and no-leak fallback; throughput cannot override safety. |
| Recovery/data rights | Backup freshness/coverage, demonstrated restore time/loss, purge/export stage age and overdue privacy operations. | Agree RPO/RTO, retention/legal holds, restore/revocation reconciliation and responsible operators. |

No numerical SLO/RPO/RTO is finalized here. SLO specifies intended service performance over an agreed population/window; RPO limits acceptable lost durable information at recovery; RTO bounds return of an explicitly defined service level after the agreed start of disruption. Recovery of a read-only subset or the PostgreSQL process alone does not satisfy a full-write/reminder-delivery RTO unless that degraded objective was explicitly chosen.

Use actionable multi-signal alerts and runbook links with named owning roles. Avoid paging on every transient retry, but do page/contain potential privacy leaks, authorization failure, unbounded spend, data loss, overdue time-sensitive work or inability to prove recovery integrity. Define error budgets and release freeze/review responses rather than claiming a target without an operational consequence.

### Privacy and Audit

Structured logs use safe action/result/latency codes and request/run/job identifiers where permitted. Never include passwords, OTPs, keys, provider tokens, private message bodies, medication details, contact books, full prompts or unredacted SQL parameters. User/Space IDs are still protected identifiers and must not be exported indiscriminately into third-party analytics. Traces, stack traces, crash dumps, query plans, dead-letter payloads and debugging snapshots follow the same data classification/retention controls.

Security/admin/audit records are access-controlled, append-oriented/tamper-aware and retained under documented lawful policy. Plain append-only application code is not immutable storage; the selected write privileges, retention locks or integrity mechanism require testing. Operational redaction must not destroy mandatory accountability; record minimal durable actor/action/subject evidence rather than raw sensitive payloads. A support console cannot export unrestricted private data to investigate an incident conveniently.

### Cost and Quota Contract

Attribute measured/estimated cost to provider/model/tool/run, processing/storage/egress, notification channel and permitted user/Space context. Distinguish reservation, reported usage and settled provider billing; token estimates alone do not prove actual invoiced cost. Keep pricing/version/currency provenance and exact arithmetic, and reconcile delayed bills without revealing private task contents.

Parallel Agent children, retries, resumed jobs and replica scale-up share an aggregate budget. Reserve capacity/spend before approved expensive work and settle/release conservatively after known outcome; never refund an unknown provider request then resend freely. Budget enforcement must work across workers and restarts, not one in-memory per-process counter. Unknown remaining budget may pause expensive work until reconciled rather than override the user's limits.

Model/channel/provider fallback needs separate capability/consent/data-region/evaluation and cost approval. A cheap model cannot be substituted merely to meet latency if its safety/structured-output contract differs. An expensive fallback cannot run because the primary is down without an approved budget. Core previously accepted authorized reminders/data rights need deliberate prioritization rather than being abandoned by an Agent budget toggle. No actual provider pricing, cloud capacity or monetary commitment is selected here.

## 12. Backup, Restore and Disaster Recovery

### C10-W11 Restore in Isolation Before Resuming Effects

The recovery unit includes more than PostgreSQL. Inventory database base backups/WAL, schemas/migration versions, object files/versions, key custody/access, audit/revocation/deletion ledgers, required queued/accepted operation state, configuration, identities, artifacts, DNS/TLS and external-provider mapping. Backup encryption keys must be recoverable under the policy too; an encrypted backup without usable authorized keys is not a verified recovery path.

| Data/capability | Recovery source and consistency concern | Open objective |
| --- | --- | --- |
| Identity, current authority and consent | Transactional DB plus latest verifiable revocations/key/session state. | RPO/RTO and assurance if recent revocation cannot be reconstructed; stale sessions must not silently reopen private data. |
| Messages/tasks/schedules/approvals | Coherent DB point-in-time plus durable command/event/cursor history and compatible schemas. | Accepted-work loss tolerance, logical effect reconstruction and safe client resync. |
| Object originals/derived files | Retained immutable versions, verified manifest/checksums, encryption access and DB references. | Match chosen DB recovery point to available files; missing originals versus rebuildable derivatives have different impact. |
| In-flight notifications/integrations | Durable delivery intent/attempts plus authenticated provider status/callback/history where supported. | Unknown or post-snapshot sends require reconciliation; cannot reset local state and promise no duplicate calls/messages. |
| Agent checkpoints/memory | Compatible graph/tool/policy artifacts, scoped retained sources and current delegation. | Resume only supported and authorized work; old approvals or deleted-source summaries cannot be revived. |
| Audit/deletion/retention evidence | Protected evidence store and current legal/retention decisions, not only a pre-deletion snapshot. | Reapply user deletion, key destruction and access changes before serving recovered data. |
| Cache, presence, search projections | Rebuild from eligible durable sources and fresh heartbeats. | These may recover later; cache loss does not justify loss of accepted jobs or disclosure from stale indexes. |
| Runtime/control plane | Versioned infrastructure/config, credentials/keys, release artifacts, network and operator access. | Recovery owner, environment/regional approval, cost budget and dependency availability. |

Define recovery objectives and restore drill frequency by the approved release/data classes. Multi-zone replication improves some availability failures but is not a backup against logical corruption/deletion or credential compromise. Cross-region copies create residency, key and cost obligations and can replicate bad writes; do not assume they are automatically required or sufficient.

### Recovery Procedure

1. Declare scope and incident ownership, contain ongoing corruption/exfiltration/repeated external effects, preserve safe evidence and freeze unsafe deployments/replays. Do not destroy the only recoverable data or credentials during investigation.
2. Identify a trusted recovery point using backup/WAL integrity, schema/version evidence, corruption window and authority/deletion history. Record why it was chosen and what loss could occur; latest is not always clean.
3. Restore to an isolated, explicitly authorized recovery environment with outbound providers and production traffic disabled. Use recovery-scoped identities, network controls and validated artifact/config versions; do not boot a copy with live production notification credentials.
4. Recover DB, required objects/versions, key access, audit/config and operational ledgers coherently. Validate checksums, relational/owner/capacity invariants, counts and known synthetic/authorized reference samples. Record missing/corrupt files and unavailable keys; successful PostgreSQL startup alone is insufficient.
5. Reapply or otherwise enforce latest verifiable session/consent/member revocations, account/file/memory deletion, legal holds and cancelled work. If latest authority cannot be proved, keep affected operations blocked and use a reviewed conservative reauthentication/reconsent/reconciliation process; do not assume old access grants are valid.
6. Reconcile externally executed or uncertain work after the restored snapshot with provider evidence and original logical IDs. Mark unknowns for review when the provider cannot establish outcome; never bulk replay a pre-snapshot pending queue into real recipients.
7. Rebuild necessary derived indexes under current eligibility, restore only compatible Agent/work queues and reinitialize ephemeral presence as unknown. Rotate cursor/stream generations if required so clients resync without resurrecting old cached authority or missing changes.
8. Run bounded synthetic workflows and safety checks, measure time/loss against agreed objectives, and obtain recovery approval. Gradually restore read/write/worker/provider capabilities with current quotas and alerting. Explicitly track any read-only/degraded capability and unresolved obligations.
9. Preserve restoration evidence, actual loss, failed stages, manual steps, timeline, owner/approver and follow-up improvements. Update runbooks and exercise them again when architecture/key/provider versions change.

Backup checks include protected storage/retention, restoration tests, PITR, object/key recovery, credential rotation/recovery, corruption scenarios and region failure only where that topology is intended. Use disposable synthetic environments for routine drills. Legal key destruction/deletion cannot be undone by restoring an old key copy without authority; policy determines what remains unrecoverable. Never run an outage, corruption or destructive restoration exercise against personal or production data based only on this planning document.

## 13. Failure Modes and Incident Runbooks

### C10-W12 Contain, Diagnose, Recover and Review

Each released capability has an accountable operational owner and an incident escalation path. Startup roles can be held by a small team, but ownership cannot be replaced by an autonomous Agent or an unmonitored log stream. The founder/product owner decides user-impact tradeoffs; technical/on-call leads execute recovery, security/privacy owners handle exposure/authority, and provider/safety specialists handle their approved domains.

| Failure | Immediate bounded behavior | Recovery and prohibited shortcut |
| --- | --- | --- |
| PostgreSQL or current authority unavailable | Reject protected writes and sensitive reads that cannot be authorized; stable temporary errors, limited retry and preserved correlation. | Restore/fail over through reviewed consistency and identity rules. Do not acknowledge volatile replacement jobs or route security checks to an arbitrary stale replica. |
| Broker/queue unavailable | Continue only operations whose required intent can be durably committed within capacity/SLO policy; dispatcher backs off and backlog is visible. | Reconcile DB job/outbox ledger after transport recovery. Never pretend in-memory buffering is durable or accept unlimited work. |
| Redis cache/presence unavailable | Presence becomes unknown, selected caches miss and optional experiences degrade. | Rebuild eligible caches and fresh heartbeats. If locks/limits/security depend on unavailable state, stop or use the explicitly approved bounded fallback; no permissive bypass. |
| Worker dies or lease expires | Existing durable job remains pending/claimed until conditional recovery; new execution observes fencing/idempotency. | Reconcile unknown external effect, reclaim safely and preserve errors. Do not release another worker's lock or assume a missing heartbeat proves no side effect. |
| Provider slows/rate-limits/fails | Respect per-provider circuit/admission limits and expose delayed/failed/unknown work honestly. | Use bounded retry and approved alternatives only after outcome/consent/cost checks. No uncontrolled cross-channel fallback or repeated real sends as health tests. |
| Scheduler late or stopped | Alert on due lag and preserve durable occurrence state; do not claim timely delivery. | Recover with approved missed/catch-up/expiry policy and caps, preventing a burst of stale reminders or duplicated logical occurrences. |
| File storage, scanner or parser fails | Keep unavailable/quarantined/partial status and prevent unsafe publication/retrieval. | Recover immutable versions or retry bounded processing. Never mark unscanned files safe or fetch private objects through a public proxy. |
| Model/Agent fails or exceeds budget | Pause/fail relevant run with actual partial results, release waiting capacity and keep manual core paths usable. | Reauthorize checkpoint/tools, bound retries and reconcile spend/effects. Do not widen permissions or silently use an unapproved model/provider. |
| Authorization/privacy anomaly | Fail closed on affected path, pause relevant fanout/tools/providers and involve security/privacy owner. | Preserve minimal evidence, validate corrected policy and scope of exposure before reopening; do not expose more private data to debug quickly. |
| Bad release or migration | Stop rollout/traffic shift and unsafe work; record artifact/schema/config state. | Use a tested compatible rollback or roll-forward/restore decision. Do not blindly downgrade destructive DDL or resume incompatible checkpoints. |
| Key/credential compromise | Revoke/quarantine affected capability through audited emergency controls and preserve evidence. | Rotate with reviewed session/data-key implications, verify remediation and recover access safely. Never print secrets or erase audit history. |
| Telemetry or audit sink failure | Buffer bounded optional telemetry or shed it with an alert; preserve required durable security/business evidence. | High-impact actions without mandated audit fail closed. An unreachable metrics collector does not justify unbounded logs or restarting the entire platform. |
| Budget/storage/capacity exhausted | Stop new expensive/oversized intake and prioritize reviewed critical work, exposing queued/denied states. | Diagnose the limiting dependency and clear retention/backlogs safely. Do not autoscale without a spending/capacity ceiling or delete user data indiscriminately. |

### Circuit Breaker Contract

Scope breakers by provider/account/operation where appropriate so one slow voice provider does not disable all in-app notifications. Classify failure and timeout independently from invalid recipient, access denial or a caller error. After the reviewed threshold, OPEN stops new calls while preserving durable pending/failure status. HALF_OPEN permits a small bounded probe budget, not every replica trying simultaneously. A successful test proves only that capability; it does not establish outcome for previous timed-out requests.

Probe with supported non-effectful or separately approved synthetic operations; a breaker should not place real calls or create duplicate appointments merely to check if the provider recovered. Cooldown/failure thresholds/concurrency are reviewed settings with metrics, not source-proven defaults. No library retry, RPC retry, worker retry and provider SDK retry should multiply unseen into an unbounded request storm; designate retry ownership and an end-to-end attempt/time budget.

### Runbook Record

Every production runbook must identify: trigger/symptoms and impacted user workflows; accountable owner and escalation; required access and permitted environment; evidence to capture safely; containment/kill switch; diagnostic hypotheses and discriminating checks; recovery/rollback steps with stop conditions; authority and external-effect reconciliation; user/support communications; verification; and follow-up record. Commands are reviewed against the actual environment at implementation time, not invented destructive shell snippets in a design file.

Kill switches are granular, audited and reversible through explicit approval: pause a provider/channel, new Agent runs, selected tools, file intake or a compromised credential scope while preserving safe manual operation. A fallback/restore must not reset a kill switch unexpectedly. Pausing external communication has user-visible consequences and pending-job treatment; it is not a hidden policy bypass or a guarantee of undoing already delivered data.

Incident evidence records safe timestamps, versions, actual service errors, request/job/run correlation, authority changes, provider outcomes and recovery measurements. Do not infer root cause from one healthy retry, exit code, container restart or a model explanation. Post-incident review separates trigger, contributing factors, observed impact, verified cause and unknowns; assign bounded corrective changes and verification rather than accumulating process without fixing the observed failure.

## 14. Proposed Operational Acceptance Evidence

All C10-V scenarios are proposed evidence families, currently NOT RUN. They map the source acceptance/readiness checklist to concrete operational checks. A planned drill, clean document or successful static container configuration is not a running-system result.

| Check | Source topics | Source acceptance | Source readiness | Operational rules | Workflows | Required evidence |
| --- | --- | --- | --- | --- | --- | --- |
| C10-V01 | C10-S01, C10-S02, C10-S04, C10-S05, C10-S06 | C10-A01 | C10-G03 | C10-K01, C10-K06 | C10-W01, C10-W03 | Import/data-ownership/service-contract tests prove all released domains share authoritative policy and deliberate transactions; no second BFF/Agent/member/scheduler implementation or dumping-ground common module. |
| C10-V02 | C10-S03, C10-S07, C10-S08 | C10-A02, C10-A03 | C10-G06, C10-G09 | C10-K02, C10-K03 | C10-W01, C10-W05, C10-W06 | Actual API versus worker process/resource boundaries under concurrent slow CPU/Agent/file work keep bounded manual request progress. No fire-and-forget task substituted for durable acceptance. |
| C10-V03 | C10-S07, C10-S22, C10-S29 | C10-A03, C10-A08, C10-A14 | C10-G14, C10-G15 | C10-K02, C10-K07, C10-K08 | C10-W01, C10-W08 | Real ingress/HTTP limits, trusted proxy/origin/TLS, parser/admission and safe error/cancel behavior reject abusive load without bypassing auth or unbounded response buffering. |
| C10-V04 | C10-S09, C10-S10 | C10-A05, C10-A07 | C10-G05, C10-G06 | C10-K03, C10-K04 | C10-W03 | Crash before/after DB commit, broker publish/ack and outbox mark leaves one logical accepted operation recoverable; rollback emits no business event. Lost published broker state is recoverable from durable job/replay policy. |
| C10-V05 | C10-S11 | C10-A06 | C10-G04 | C10-K04, C10-K06 | C10-W01, C10-W03, C10-W04 | Concurrent exact retries, changed intent, lost response, stale authority and expired dedup window do not duplicate work, overwrite content or replay private results to revoked callers. |
| C10-V06 | C10-S08, C10-S16 | C10-A06 | C10-G07, C10-G08 | C10-K04, C10-K05 | C10-W03 | Lease owner/expiry/renew/reclaim/finalization, stale worker completion, broker visibility, consumer dedup and privileged DLQ replay work on actual selected technology. Locks alone cannot prove provider exactly-once execution. |
| C10-V07 | C10-S12, C10-S13, C10-S14 | C10-A02 | C10-G12, C10-G16 | C10-K07, C10-K08 | C10-W07 | Peak replica/process/overflow/surge budgets, pool proxy mode/driver/RLS context, connection timeouts and authorized bounded query/index plans are tested. Arithmetic headroom alone is not throughput or failover proof. |
| C10-V08 | C10-S15, C10-S16 | C10-A07 | C10-G06, C10-G07 | C10-K03, C10-K05, C10-K12 | C10-W02, C10-W03, C10-W07 | Redis loss/eviction/stream trimming/failover does not erase accepted jobs or approvals. Presence degrades, affected lock/limit paths fail safely and reconciliation rebuilds without permissive cache authority. |
| C10-V09 | C10-S17, C10-S18 | C10-A04 | C10-G09 | C10-K02, C10-K06, C10-K15 | C10-W05 | Queued Agent execution outside HTTP, compatible checkpoint pause/resume, release of approval-wait capacity and aggregate steps/time/tool/cost limits survive child delegation and restart. |
| C10-V10 | C10-S19, C10-S20 | C10-A15 | C10-G30 | C10-K04, C10-K06, C10-K15 | C10-W04, C10-W05 | Adapter behavior validates current recipient, purpose/consent/template and revocation before dispatch; transient/unknown outcome, fallback and provider-key scope cannot duplicate sends or bypass channel/privacy approval. |
| C10-V11 | C10-S21, C10-S22, C10-S23 | C10-A08, C10-A09 | C10-G12, C10-G13, C10-G14 | C10-K08, C10-K09 | C10-W08 | Actual network/IAM/TLS policies protect DB/Redis/queue/control/metrics/object management; untrusted file/tool egress and forged service identity cannot access metadata/private networks or another user's authority. |
| C10-V12 | C10-S23, C10-S24 | C10-A09 | C10-G13, C10-G28 | C10-K09, C10-K16 | C10-W08 | Environment isolation and safe secret/signing/provider/encryption rotation/recovery are exercised without credentials in images, CI/frontend/APK/prompts/logs. Missing critical config cannot start permissively. |
| C10-V13 | C10-S24, C10-S25, C10-S39 | C10-A10 | C10-G23, C10-G27 | C10-K09, C10-K10 | C10-W08, C10-W09 | Immutable reviewed artifact/config promotion, canary/rolling traffic checks, explicit approval and compatible rollback work in staging; old clients/sockets/job schemas remain safe and no production access leaks into preview. |
| C10-V14 | C10-S25, C10-S26 | C10-A11 | C10-G01, C10-G23 | C10-K01, C10-K10 | C10-W09 | Actual empty/upgrade/interrupted backfill, old/new code, constraint validation and controlled migration ownership are tested. Destructive DDL/key changes do not claim automatic safe image rollback. |
| C10-V15 | C10-S27 | C10-A12 | C10-G17 | C10-K02, C10-K11, C10-K12 | C10-W01, C10-W09 | Probe deadline/load/auth/private metadata behavior plus startup/readiness/liveness semantics are tested during DB/broker/optional-model outage and overload. No dependency-induced restart storm or healthy-process-only readiness claim. |
| C10-V16 | C10-S08, C10-S25, C10-S27 | C10-A02, C10-A03 | C10-G06, C10-G23 | C10-K05, C10-K10, C10-K11 | C10-W02, C10-W03, C10-W09 | Rolling drain/termination during HTTP commit, WS replay and worker/provider work preserves committed intent, safe reclaims and explicit unknown outcomes. Worker probe cannot conceal stuck progress. |
| C10-V17 | C10-S28, C10-S29 | C10-A14 | C10-G16, C10-G26 | C10-K07, C10-K12, C10-K15 | C10-W07 | Measured load and provider throttling exercise per-user/destination/Space/provider/global limits, backpressure, fairness and scaling ceiling. More replicas cannot reset abuse/spend or overload downstream pools. |
| C10-V18 | C10-S30, C10-S31 | C10-A18 | C10-G21, C10-G31 | C10-K13, C10-K16 | C10-W11 | Owners approve workload/data-class RPO/RTO and degraded service definitions; drills compare observed loss/time and unresolved privacy/provider obligations, not just process startup time. |
| C10-V19 | C10-S30, C10-S32 | C10-A16, C10-A17 | C10-G21, C10-G22 | C10-K09, C10-K13 | C10-W11 | Automated backup integrity/retention and isolated PostgreSQL PITR restore are tested with real artifacts and chosen versions, including bad snapshot/WAL/key access and actual missing-data reporting. |
| C10-V20 | C10-S30, C10-S32 | C10-A17 | C10-G22, C10-G31 | C10-K09, C10-K13 | C10-W08, C10-W11 | Object version/checksum/key/config/credential and intended region recovery are exercised coherently with DB recovery point. Missing ciphertext keys or originals block a false full-recovery result. |
| C10-V21 | C10-S33 | C10-A07, C10-A15 | C10-G06, C10-G30 | C10-K03, C10-K06, C10-K12 | C10-W01, C10-W03, C10-W07 | Database/Redis/broker outage matrix distinguishes safe optional degradation from blocked authority/durability. No in-memory fallback acceptance, unlimited retry, stale permission replica or unbounded local backlog. |
| C10-V22 | C10-S19, C10-S33, C10-S34 | C10-A15 | C10-G07, C10-G30 | C10-K04, C10-K12, C10-K15 | C10-W04, C10-W12 | Realistic simulated provider timeout/429/failed signature/status cases verify breaker scope, bounded half-open probes, multi-layer retry budget and unknown-outcome reconciliation without real-user test sends. |
| C10-V23 | C10-S35 | C10-A13 | C10-G18, C10-G19, C10-G20 | C10-K14, C10-K16 | C10-W10 | Actual logs/metrics/traces correlate request/outbox/job/tool/provider with bounded cardinality and honest states. Telemetry outage/slow collector cannot block or exhaust all work; mandatory audit remains durable. |
| C10-V24 | C10-S35, C10-S36 | C10-A13, C10-A20 | C10-G11, C10-G28 | C10-K06, C10-K08, C10-K14 | C10-W10, C10-W12 | Inspect sentinel secrets/private content across failure logs, query traces, DLQ, dumps and admin evidence; privileged audit access, retention/tamper protections and mandatory-audit failure gates behave as designed. |
| C10-V25 | C10-S36 | C10-A08, C10-A09 | C10-G02, C10-G28 | C10-K06, C10-K08, C10-K09, C10-K16 | C10-W08, C10-W12 | Access reviews, dependency/container findings, compromised credentials, revocation and time-bound break-glass exercise enforce authentication and least privilege without deleting evidence or printing secrets. |
| C10-V26 | C10-S36 | C10-A20 | C10-G24, C10-G25, C10-G28 | C10-K12, C10-K16 | C10-W12 | An operator follows actual versioned incident/runbook and granular kill switches in a permitted drill, proving containment, escalation, re-enable approval and preservation of safe core behavior. |
| C10-V27 | C10-S37 | C10-A19 | C10-G26 | C10-K07, C10-K14, C10-K15 | C10-W05, C10-W07, C10-W10 | Concurrent/resumed/child runs and retry storms cannot exceed approved aggregate reservation policy; estimated versus billed usage, currency/pricing version, delayed settlement and alerts remain honest and private. |
| C10-V28 | C10-S20, C10-S36, C10-S37 | C10-A19 | C10-G29, C10-G30 | C10-K06, C10-K12, C10-K15 | C10-W04, C10-W05, C10-W12 | Provider/channel/model disable, opt-out and spend freeze block new disallowed effects without deleting accepted work or silently rerouting data. Restoring a release cannot turn off a privacy/cost kill switch. |
| C10-V29 | C10-S03, C10-S05, C10-S08, C10-S14 | C10-A03 | C10-G09, C10-G10 | C10-K02, C10-K06, C10-K07 | C10-W06 | Scanner/parser/OCR/embedding overload, malicious/oversized archives and worker termination preserve quarantine/provenance and do not starve notification/auth pools or give parsers provider/admin secrets. |
| C10-V30 | C10-S10, C10-S30, C10-S36 | C10-A05, C10-A17 | C10-G05, C10-G22, C10-G29 | C10-K03, C10-K06, C10-K13 | C10-W03, C10-W11, C10-W12 | Restore after deletion/revocation/cancel and provider sends reapplies current privacy history and reconciles external effects before service resumes; stale snapshot cannot restore unauthorized access or replay real sends. |
| C10-V31 | C10-S38, C10-S39 | C10-A20 | C10-G24, C10-G25, C10-G26, C10-G27, C10-G31 | C10-K10, C10-K13, C10-K16 | C10-W09, C10-W11, C10-W12 | Release owners review readiness evidence, actual failed/untested gates, rollback/restore/runbook versions and risk acceptance. Roles/checklists are not counted as staffed operations or executed drills. |
| C10-V32 | C10-S01, C10-S02, C10-S03, C10-S31, C10-S38, C10-S39, C10-S40 | C10-A01, C10-A02, C10-A03, C10-A04, C10-A05, C10-A06, C10-A07, C10-A08, C10-A09, C10-A10, C10-A11, C10-A12, C10-A13, C10-A14, C10-A15, C10-A16, C10-A17, C10-A18, C10-A19, C10-A20 | C10-G01, C10-G06, C10-G17, C10-G23, C10-G31 | C10-K01, C10-K03, C10-K06, C10-K11, C10-K13, C10-K16 | C10-W01, C10-W02, C10-W03, C10-W04, C10-W05, C10-W06, C10-W07, C10-W08, C10-W09, C10-W10, C10-W11, C10-W12 | Released Android/web/API/DB/worker workflow runs with approved synthetic data and actual versions, restarts/retries/denial/recovery. Scope all results; M1 cannot certify deferred Agent/files/external/multi-region production capability. |

Use real selected PostgreSQL/broker/client/process behavior for their relevant guarantees, not only in-memory fakes. Unit and mocked-provider tests isolate logic but cannot prove database rollback, distributed lease behavior, live provider delivery, networking, backup recovery or cross-zone availability. Save invocation/config/artifact identities, actual tests/measurements, skipped/failed gates and cleanup results. Routine drills use disposable authorized fixtures, not actual family data or production disruption. No such runtime tests were executed in this design task.

## 15. Developer Handoffs, Demo and Next Chapter

| Ticket | Accountable role | Depends on | Deliverable and acceptance evidence |
| --- | --- | --- | --- |
| C10-T01 | Product/platform/security leads, Teams A/C/E | Relevant prior scope/data/API/client decisions | Resolve operational choices for the delivered slice: environments/providers/region, authority, capacity, objectives, retention and ownership; retain all open gates and approval records. |
| C10-T02 | Backend architect, Team C | C10-T01 | Source-domain ownership, guarded interfaces/unit-of-work and role-specific entry points/configuration; C10-V01, C10-V02 design/build evidence. No one-service-per-folder mandate. |
| C10-T03 | Platform/identity engineer, Teams C/E | C10-T02 | Approved environment/network/TLS/IAM/secret delivery/rotation and synthetic local/staging setup; C10-V03, C10-V11, C10-V12. Real provisioning/spending requires its own authorization. |
| C10-T04 | Durable-work engineer, Team C | C10-T02, C10-T03; accepted data/API contracts | Implement outbox/job/inbox/lease/retry/DLQ and worker lifecycle on selected technology; C10-V04 through C10-V08. Preserve durable accepted work across broker failures. |
| C10-T05 | Planning/notification engineer, Team C | C10-T04; approved schedule/delivery policy | Implement ordinary M1 scheduler/in-app delivery and released adapter/receipt/consent checks; C10-V10, C10-V21, C10-V22 and source-specific schedule tests. No health or live external authority from this ticket. |
| C10-T06 | Agent/file/search/safety engineers, Teams C/D/E | C10-T04; released domain/provider/processing approvals | Split long-work isolation and quotas into reviewable capability tickets; C10-V09, C10-V27, C10-V29. Future heavy features cannot become hidden prerequisites for M1. |
| C10-T07 | Database/capacity engineer, Team C | C10-T02, C10-T04; C10-T05 and C10-T06 for released workloads | Validate query/index/pool/replica/Redis memory and global admission/autoscaling budgets with actual load; C10-V07, C10-V08, C10-V17. One synthetic budget calculation is not capacity approval. |
| C10-T08 | Release/platform engineer, Team C | C10-T03, C10-T04; C10-T05 through C10-T07 for released artifacts | Build compatible immutable artifacts, config/migrations, staged rollout, health/drain/rollback and old-job/client behavior; C10-V13 through C10-V16. No frontend-triggered destructive migration. |
| C10-T09 | Observability/cost engineer, Teams C/E | C10-T03, C10-T04; C10-T05 through C10-T08 for released paths | Implement private-safe logs/traces/metrics, alert ownership, audit guarantees and aggregate quota/cost reconciliation; C10-V23, C10-V24, C10-V27, C10-V28. |
| C10-T10 | SRE/data-protection/security leads, Team E | C10-T03, C10-T04, C10-T08, C10-T09 | Test backups/PITR/object/key/authority recovery and permitted outage/compromise runbooks against agreed RPO/RTO; C10-V18 through C10-V26, C10-V30. Preserve unknown effects rather than re-sending blindly. |
| C10-T11 | Integration/release QA, Teams C/E | C10-T04 through C10-T10 for the released scope | Execute applicable C10-V01 through C10-V32, integrated synthetic user flow, capacity/failure/restore and readiness review; publish versions, failures, simulations and untested scope. |
| C10-T12 | Security/product architecture leads, Teams A/C/E | C10-T02, C10-T03; C10-T11 for runtime acceptance | Chapter 11 handoff: current trust boundaries, identities, sensitive flows, operator powers, secrets/encryption, threat model and privacy gates. Design can proceed now; certification/compliance requires real evidence and qualified review. |

These are responsibility packages, not assigned staff, executed subagents or permission to provision everything. Split by released capability and independently reviewable changes with source IDs, owner/dependencies, risks, code/tests where applicable, contract/migration/ADR notes, exact test commands, operational runbook, demo and limitations. Security and data-rights controls begin in the foundation, not after the last release ticket.

### First Operational Demonstration

Once implementation and the specific test environment are authorized: start the approved local/staging artifact with synthetic data -> verify role-specific readiness and restricted management endpoints -> register/verify accounts and create/admit family membership -> save a task and one-time in-app reminder -> restart the relevant worker/transport while preserving durable work -> recover one logical notification and explicit acknowledgment -> cancel/revoke before later execution -> show safe denied access, bounded retry and traced outcome. Then demonstrate a backup/restore on a separate disposable fixture without live outbound channels.

The demonstration is the M1 slice under tested conditions, not full production certification. Live providers, E2E, advanced files/Agent, multi-region recovery and public safety operations need their own released-capability evidence. A health endpoint, screenshot, queue count or static Docker Compose validation cannot stand in for these workflows.

| Mistake | Bad impact | Required response |
| --- | --- | --- |
| Start with a separate microservice/database for every feature. | Deployment and distributed consistency work can overwhelm a small team before a useful feature exists. | Modular ownership plus justified process/isolation boundaries; extract only against measured need and a migration plan. |
| Acknowledge a volatile queue task or rely only on a published marker. | Accepted reminders disappear after broker loss. | Durable job/outbox state, explicit acknowledgment/retention meaning and reconciliation. |
| Scale API/workers without a total pool/provider/cost budget. | Database collapse, retry storms and uncontrolled spend. | Peak including surge, per-class fairness, global ceilings and measured downstream limits. |
| Fail all liveness probes when a shared dependency fails. | Restart storms compound an outage without repairing the dependency. | Separate process liveness, role readiness, capability degradation and workflow checks. |
| Treat a Redis lock or local idempotency key as exactly-once external action. | Duplicate messages/calls under stale workers or unknown provider outcomes. | Durable identity/fencing plus provider-specific reconciliation and honest uncertainty. |
| Restore a backup with live provider credentials and stale grants. | Replayed notifications, resurrected deleted content and unauthorized access. | Isolated restore, privacy/authority replay, external-effect reconciliation and explicit staged reopening. |
| Automatically roll back incompatible schema/config/key changes. | Old code corrupts new state or retained data becomes unrecoverable. | Compatibility gates and reviewed roll-forward/restore choices with actual evidence. |
| Save every private request to logs for easier debugging. | The observability system becomes an uncontrolled copy of family/health/identity data. | Minimal structured evidence, safe correlation, classification/retention and audited privileged investigation. |

Next: [Chapter 11](../Chapter11.md), consolidating identity/resource/Agent/operator trust boundaries, threat models, encryption and key policies, data classification, consent/retention, abuse controls and security verification. Carry [Chapter 12 Agent runtime](../Chapter12.md), [Chapter 13 scheduling](../Chapter13.md), [Chapter 16 trust operations](../Chapter16.md), [Chapter 19 encryption](../Chapter19.md) and [Chapter 20 delivery](../Chapter20.md) into their dependent security decisions.

This completes the proposed Chapter 10 operational handoff. All original requirements remain traceable, decisions remain labeled, and no infrastructure build, live integration, recovery exercise or production readiness is claimed.