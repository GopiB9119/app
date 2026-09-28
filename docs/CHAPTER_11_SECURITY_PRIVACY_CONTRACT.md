# Chapter 11: Security, Privacy and Trust-Boundary Contract

Status: DRAFT FOR PRODUCT, SECURITY, PRIVACY AND ENGINEERING REVIEW. This is a design and verification plan, not a completed security audit, penetration test, legal opinion, compliance certification or proof of secure runtime behavior.

## 1. Scope and Authority

This consolidates the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [private Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md) and [backend operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md) drafts. It develops C10-T12 and the existing security/privacy gates without replacing domain-specific requirements.

- [Chapter 11](../Chapter11.md) is the owning source. Security applies to clients, sessions, data, APIs, realtime, Agents, tools, workers, providers, operators, telemetry, development and recovery, not just password handling.
- Preserve the first-release boundaries: M1 is ordinary family/task/one-time in-app reminders. The MVP Agent cannot access health records, diagnose, prescribe/change dosage, call/send externally, manage permissions/members or execute financial actions merely because a generic approval field exists.
- Requirements, proposed policies, known design conflicts and unverified runtime behavior remain distinct. Continuing planning does not approve earlier decisions or authorize code, live scans, exploit attempts, device access, cloud changes, real contacts/health data, provider calls, spending or deployment.
- All original chapters and earlier drafts remain unchanged. Examples are synthetic and descriptive; no credentials or private user content are collected into this document.
- All security and product acceptance scenarios are NOT RUN. Structural source/traceability checks do not establish encryption, isolation, prompt-injection resistance, legal compliance or production readiness.

## 2. Exact Source Topic Coverage

All 44 numbered topics are retained with exact titles and source anchors.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C11-S01 | Purpose | [11.1](../Chapter11.md#L3) |
| C11-S02 | Security Architecture Principles | [11.2](../Chapter11.md#L59) |
| C11-S03 | Security Trust Zones | [11.3](../Chapter11.md#L93) |
| C11-S04 | Identity Architecture | [11.4](../Chapter11.md#L158) |
| C11-S05 | Account States | [11.5](../Chapter11.md#L200) |
| C11-S06 | Authentication Requirements | [11.6](../Chapter11.md#L229) |
| C11-S07 | Session Management | [11.7](../Chapter11.md#L279) |
| C11-S08 | Authorization Model | [11.8](../Chapter11.md#L322) |
| C11-S09 | Role-Based Access Control | [11.9](../Chapter11.md#L371) |
| C11-S10 | Attribute-Based Authorization | [11.10](../Chapter11.md#L406) |
| C11-S11 | Resource-Level Authorization | [11.11](../Chapter11.md#L441) |
| C11-S12 | Agent Authorization | [11.12](../Chapter11.md#L464) |
| C11-S13 | Tool Authorization | [11.13](../Chapter11.md#L518) |
| C11-S14 | Encryption in Transit | [11.14](../Chapter11.md#L566) |
| C11-S15 | Encryption at Rest | [11.15](../Chapter11.md#L604) |
| C11-S16 | End-to-End Encryption | [11.16](../Chapter11.md#L626) |
| C11-S17 | E2E Encryption and Agents | [11.17](../Chapter11.md#L673) |
| C11-S18 | Key Management | [11.18](../Chapter11.md#L697) |
| C11-S19 | Data Classification | [11.19](../Chapter11.md#L736) |
| C11-S20 | Agent Data Minimization | [11.20](../Chapter11.md#L837) |
| C11-S21 | Prompt Injection Defense | [11.21](../Chapter11.md#L880) |
| C11-S22 | Tool Output Security | [11.22](../Chapter11.md#L915) |
| C11-S23 | Dangerous Actions | [11.23](../Chapter11.md#L947) |
| C11-S24 | Approval Object | [11.24](../Chapter11.md#L991) |
| C11-S25 | Privacy Controls | [11.25](../Chapter11.md#L1015) |
| C11-S26 | Consent Management | [11.26](../Chapter11.md#L1051) |
| C11-S27 | Family and Group Privacy | [11.27](../Chapter11.md#L1090) |
| C11-S28 | Medical Reminder Safety | [11.28](../Chapter11.md#L1127) |
| C11-S29 | File Security | [11.29](../Chapter11.md#L1153) |
| C11-S30 | SSRF Protection | [11.30](../Chapter11.md#L1207) |
| C11-S31 | WebSocket Security | [11.31](../Chapter11.md#L1237) |
| C11-S32 | API Security | [11.32](../Chapter11.md#L1270) |
| C11-S33 | Audit Logging | [11.33](../Chapter11.md#L1310) |
| C11-S34 | Security Monitoring | [11.34](../Chapter11.md#L1376) |
| C11-S35 | Threat Modeling | [11.35](../Chapter11.md#L1418) |
| C11-S36 | Threat Categories | [11.36](../Chapter11.md#L1486) |
| C11-S37 | Security Testing | [11.37](../Chapter11.md#L1530) |
| C11-S38 | Incident Response | [11.38](../Chapter11.md#L1584) |
| C11-S39 | Key Compromise Response | [11.39](../Chapter11.md#L1632) |
| C11-S40 | Privacy-Preserving Observability | [11.40](../Chapter11.md#L1654) |
| C11-S41 | Compliance Readiness | [11.41](../Chapter11.md#L1690) |
| C11-S42 | Security Architecture Summary | [11.42](../Chapter11.md#L1738) |
| C11-S43 | Final Security Decisions | [11.43](../Chapter11.md#L1798) |
| C11-S44 | Chapter 11 Acceptance Criteria | [11.44](../Chapter11.md#L1825) |

## 3. Exact Source Principles and Decisions

All fifteen principles from section 11.2 are retained verbatim. Approval requirements do not authorize an otherwise prohibited action.

| ID | Source security principle |
| --- | --- |
| C11-R01 | Least privilege |
| C11-R02 | Deny by default |
| C11-R03 | Verify every request |
| C11-R04 | Separate public and private data |
| C11-R05 | Separate user permissions from agent permissions |
| C11-R06 | Never trust client-provided authorization |
| C11-R07 | Minimize collected data |
| C11-R08 | Encrypt data in transit and at rest |
| C11-R09 | Audit sensitive operations |
| C11-R10 | Make dangerous actions require explicit approval |
| C11-R11 | Design for compromise |
| C11-R12 | Make deletion and revocation possible |
| C11-R13 | Keep secrets outside application code |
| C11-R14 | Do not expose internal reasoning or credentials |
| C11-R15 | Treat external providers as untrusted boundaries |

All twenty lines from section 11.43's final-decision block are retained verbatim. Specific implementations, versions and threat-model tradeoffs still need review and evidence.

| ID | Source final security decision |
| --- | --- |
| C11-F01 | Secure session-based authentication |
| C11-F02 | Argon2id password hashing |
| C11-F03 | RBAC plus resource-level authorization |
| C11-F04 | Attribute-based policies for sensitive actions |
| C11-F05 | TLS everywhere |
| C11-F06 | Encryption at rest |
| C11-F07 | Central secrets management |
| C11-F08 | Explicit agent permissions |
| C11-F09 | Tool allowlists |
| C11-F10 | Approval gates for side effects |
| C11-F11 | Data minimization |
| C11-F12 | Private/public scope separation |
| C11-F13 | Presigned file uploads |
| C11-F14 | Sandboxed file processing |
| C11-F15 | WebSocket authorization |
| C11-F16 | Audit logs |
| C11-F17 | Threat modeling |
| C11-F18 | Security testing |
| C11-F19 | Incident response runbooks |
| C11-F20 | Backup and key-rotation procedures |

## 4. Exact Source Acceptance

All twenty criteria in section 11.44 are retained verbatim. Every criterion is NOT RUN; a checklist entry is not security assurance.

| ID | Source acceptance criterion |
| --- | --- |
| C11-A01 | Authentication and authorization are separate |
| C11-A02 | Every resource access is permission-checked |
| C11-A03 | Agents have independent scopes |
| C11-A04 | Tools have explicit allowlists |
| C11-A05 | External actions support approval policies |
| C11-A06 | Sensitive data is classified |
| C11-A07 | Private and public scopes are separated |
| C11-A08 | TLS is used for all network communication |
| C11-A09 | Storage and backups are encrypted |
| C11-A10 | Session revocation works |
| C11-A11 | File uploads are scanned and isolated |
| C11-A12 | WebSockets enforce subscription permissions |
| C11-A13 | Prompt injection defenses are tested |
| C11-A14 | Audit events cover sensitive operations |
| C11-A15 | Secrets are centrally managed |
| C11-A16 | Logs are redacted |
| C11-A17 | Security monitoring exists |
| C11-A18 | Incident runbooks are documented |
| C11-A19 | Backup restoration and key rotation are tested |
| C11-A20 | Applicable privacy obligations are reviewed |

## 5. Decisions and Verification Gates

| ID | Choice | Proposed control direction or unresolved policy | Status |
| --- | --- | --- | --- |
| C11-D01 | Identity assurance and privileged reauthentication | Select auth/provider/MFA/recovery methods and recent-proof requirements, with limits and account-state behavior reconciled to Chapter 18. A verified phone or email is not proof of legal identity or guardianship. | OPEN |
| C11-D02 | Current resource authorization | Centralize deny-by-default actor/action/resource/scope/history/consent checks across all transports and workers, with explicit transactional revocation and safe cache behavior. | PROPOSED |
| C11-D03 | Agent/tool authority and approval | Use bounded independent delegation, typed allowlisted tools and immutable exact-action approval; recheck current policy at execution. No self-approval, blanket approval or prohibited-action bypass. | PROPOSED |
| C11-D04 | E2E model and cryptographic protocol | Select disclosed conversation modes, reviewed maintained protocols, device/key enrollment, recovery and any Agent plaintext handoff. Do not claim server-readable content is opaque E2E. | OPEN |
| C11-D05 | Classification and derivative inheritance | Assign data owner/controller, scope, sensitivity, purpose and lineage before storage/use; derivatives cannot silently become public or unrestricted. Apply stricter handling to uncertain classification until resolved. | PROPOSED |
| C11-D06 | Consent, minors, care authority and launch jurisdictions | Decide legally appropriate consent/authority, age/guardian model, data residency/retention and care boundaries with qualified review. A family admin cannot consent for every member by role alone. | OPEN |
| C11-D07 | Model and external-provider data handling | Review retention, training use, deletion, region, subprocessors and permissible payloads against actual provider agreements/capabilities. No universal zero-retention or approved-provider claim. | OPEN |
| C11-D08 | Key and secret custody | Choose KMS/secret/local-device key design, roles, rotation/recovery/destruction policy and backup access. Encrypting a disk does not isolate authorized application processes or privileged operators. | OPEN |
| C11-D09 | File, URL and tool isolation | Use private quarantine/immutable artifacts, bounded isolated parsers/fetchers and restricted egress. Enforce policy before untrusted tool results or files can cause follow-on actions. | PROPOSED |
| C11-D10 | Revocation and offline exposure | Define maximum permitted cached/offline exposure, protected download design, client cleanup and in-flight limits. Ordinary signed-URL expiry or logout UI cannot promise immediate deletion of downloaded data. | OPEN |
| C11-D11 | Mandatory audit and private-safe telemetry | Commit required audit intent with sensitive effects, restrict access/retention and test redaction across traces, DLQ, crash and support surfaces. A best-effort log line is not an audit guarantee. | PROPOSED |
| C11-D12 | Abuse limits and failure policy | Choose role/resource/destination/provider/global rate, size, time and budget limits, plus fail-closed or explicitly bounded fallback if critical authority/limiter services fail. | OPEN |
| C11-D13 | Security evidence and release gate | Map concrete threats to preventive/detective/recovery controls, accountable owners and reproducible scoped tests. Unverified critical controls block dependent release rather than becoming approved by document completeness. | PROPOSED |
| C11-D14 | Incident, disclosure and compliance operations | Assign security/privacy/legal/safety/on-call ownership, incident and vulnerability intake procedures, retention/notice obligations and risk-acceptance authority. No jurisdiction-specific compliance claim without qualified review and implementation evidence. | OPEN |

These six proposals and eight open decisions are not finalized policy. The following contract must define the trust boundary, actual enforcement point, failure outcome and evidence needed for each sensitive workflow.

## 6. Assets, Trust Boundaries and Classification

The source's layered drawing is conceptual, not a claim that each boundary is trusted just because it is behind another service. Model data flow, identities, credentials and permitted effects separately from physical network placement. Internal services, operators, uploaded files, queues and external vendors each retain their own least-privilege boundary.

| Boundary | Protected assets and crossings | Required control and safe failure |
| --- | --- | --- |
| Untrusted browser/Android -> public edge | Account proof, resource IDs, form bodies, uploads and subscription requests. | Valid TLS/certificates, allowed origin/host/proxy handling, bounded parsing and authenticated current principal. Caller-supplied role/owner is never authoritative. |
| Web/BFF/realtime -> domain service | User/session/delegation context, projected private data and mutations. | Verified request-local context, actual parent/resource checks and narrow input/output schemas. Private network or layout check does not authorize the operation. |
| Domain -> PostgreSQL/Redis/object store | Ownership, membership/consent, business records, private bytes and durable intent. | Typed integrity constraints plus current service policy, least-privilege DB/storage identity and explicit cache/transaction rules. Missing current authority fails closed. |
| Domain/job -> worker/tool/Agent | Durable action references, source context, recipient and possible external side effects. | Authenticated producer, current scope/action/consent and immutable approval where required; leases/idempotency are not permission grants. |
| File/web/tool output -> parser/model/UI | Untrusted instructions, executable document features, private text, URLs and citations. | Quarantine, isolated bounded parsing, egress/renderer controls and data-versus-instruction separation. No automatic command, tool permission or public sharing from content text. |
| Platform -> external model/delivery/calendar/search provider | Minimized task data, recipient identifiers, credentials and provider effects. | Reviewed vendor/purpose/region, scoped secret and destination, approved consent, bounded requests and verified callbacks. Outage is not permission to disclose via another vendor/channel. |
| Operator/CI/support -> privileged control plane | User access, infrastructure, secrets, evidence, artifacts and recovery. | Strong scoped identity, recent authentication/approval, time-limited audited access and environment isolation. No routine all-private-data support view. |
| Runtime -> telemetry/export/backups -> recovery | Derived copies, identifiers, prompts, keys, deleted data and execution history. | Classification/retention/redaction, encryption/access separation, tracked purge and restore reconciliation. A restored backup cannot resurrect revoked access or deleted sources. |

### Exact Source Classes With Refined Handling

The five labels, examples and handling phrases below preserve the source table in section 11.19. The final column supplies proposed enforcement detail. The source's Internal = Authenticated access is not interpreted as access for every logged-in customer or every employee.

| ID | Source classification | Source examples | Source handling | Proposed enforcement detail |
| --- | --- | --- | --- | --- |
| C11-C01 | Public | Public page, public post | Public visibility rules | Only intentionally published, currently eligible representation; drafts, hidden fields, removed posts and private attachments stay excluded. Public once does not mean every cached future copy remains authorized. |
| C11-C02 | Internal | Product configuration | Authenticated access | Role/service-specific operational access, environment segregation and minimal client exposure. Security thresholds, secret references and privileged config are not ordinary authenticated user data. |
| C11-C03 | Private | Private messages, member details | Strict authorization | Current owner/membership/conversation/history/audience checks, protected cache and scoped derivatives. Admin role and group membership are insufficient for another person's private records. |
| C11-C04 | Sensitive | Medical reminders, personal documents | Strong access controls | Purpose-specific access/consent, minimum fields/context, reviewed encryption/client caching/provider use, strong audit and retention. Children, pregnancy and intimate relationship information can be sensitive even when not explicitly named in a table example. |
| C11-C05 | Highly sensitive | Encryption keys, credentials | Dedicated secret systems | Dedicated scoped key/secret custody, no model/normal app log exposure, tested rotation/revocation and recovery. One-use client-visible proofs/capabilities follow their separate narrow protocol, not an unrestricted secret export. |

Before collection, record the data subject/controller, owner, resource/conversation scope, classification, purpose, allowed audience, relevant consent/authority, source/version, retention, export/deletion and provider-processing rules. Ownership, authorship, affected person and administrator may be different actors; do not collapse them into one `owner_id` assumption.

Classification travels with derivatives: thumbnails, OCR text, embeddings, summaries, citations, private filenames, event metadata, notification previews, counters, exports and crash traces can disclose the same sensitive facts. A summary or vector is not anonymous just because it is not the original message. A classification downgrade or broader sharing requires an explicitly authorized transformation/review; uncertainty defaults to restricted handling until resolved, not public distribution.

Purpose also limits use. Data permitted to schedule a family meeting is not automatically usable for public recommendations, marketing, permanent Agent memory, unrelated model evaluation or developer testing. Querying fewer columns and keeping only necessary records is preferable to collecting everything and later relying on redaction. A source identifier without its private body can still reveal membership or activity; validate metadata as well as content.

## 7. Source Threat Categories and Concrete Cases

All twenty threat-category names from section 11.36 are retained verbatim. Cases describe plausible risks for this design, not discovered vulnerabilities in an existing application or evidence of an attack. Control/test references below specify proposed work; no exploit was executed.

| ID | Source threat category | Concrete platform case to test | Prevent, detect and recover boundary |
| --- | --- | --- | --- |
| C11-H01 | Account takeover | A new phone holder, attacker-created pending signup or weak support recovery acquires an existing person's account. | Bound enrolled proof, preregistration protection, risk/step-up, recovery/session revocation and scoped support audit; never merge by email/phone resemblance. |
| C11-H02 | Broken access control | A family admin reads a member's private Agent memory or changes peer/owner roles without authority. | Current actor/target policy, explicit personal/conversation scope and consent, default denial and audited management. |
| C11-H03 | Insecure direct object references | A permitted Space URL carries another Space's conversation, task, attachment or approval ID. | Verify the actual full resource chain, typed scope/FKs and authorized output before returning or mutating data. |
| C11-H04 | Injection | Search, SQL, template, command or parser input changes interpretation instead of remaining validated data. | Parameterized queries, typed operation schemas, maintained parsers/templates and no arbitrary dynamic SQL/shell from content. |
| C11-H05 | XSS | A post, Agent answer, document preview or error message executes browser code or exposes serialized private data. | Safe renderer/sanitizer/sinks, URL/media policy, tested CSP and minimal RSC/HTML projection; do not treat React escaping alone as complete protection. |
| C11-H06 | CSRF | A browser's valid cookie is used for an unrequested role change, approval, logout or data export. | Reviewed Origin/CSRF/SameSite policy on all mutation paths, including BFF/Server Actions and identity flows; GET/prefetch does not mutate. |
| C11-H07 | SSRF | An Agent URL, image optimizer or document link asks a backend to reach private infrastructure or leak its credentials. | Approved structured URL/DNS/connect/redirect policy and isolated egress, with no ambient user/provider secrets forwarded. |
| C11-H08 | Malicious uploads | A hostile document exhausts parsing resources, executes embedded content or replaces already scanned bytes. | Private immutable upload identity, signature/type/size/checksum checks, quarantine, isolated bounded parsing and safe preview/processing generations. |
| C11-H09 | Credential theft | Keys/tokens appear in APKs, web bundles, prompts, CI layers, logs or unrestricted support tools. | Dedicated custody, secret scanning, redacted projections, least privilege and rehearsed revocation/rotation; no secret pasted into assistant tools. |
| C11-H10 | Session fixation | Pre-login or stolen session state survives legitimate sign-in/reset or cross-tab account switching. | Rotate and bind verified sessions, controlled refresh/replay, current account checks and client context isolation. |
| C11-H11 | Prompt injection | Retrieved chat/file/web/tool text attempts to broaden scope, export private data or authorize a later tool. | Separate trusted policy and untrusted data; independently authorize retrieval/tools/effects even when model output requests a forbidden action. |
| C11-H12 | Tool abuse | A valid Agent invocation targets an unauthorized recipient, excessive volume or a stronger internal operation. | Typed allowlist, current delegated intersection, approved exact intent, destination rules and aggregate quotas; a trusted tool name alone is insufficient. |
| C11-H13 | Data leakage | Private data reappears through a shared cache, suggestion, notification, export or deleted-source summary. | Current scope/history/lineage on every projection, cache audience isolation, redaction and prompt revocation of retrieval eligibility. |
| C11-H14 | Insider misuse | A moderator/operator browses unrelated family data or exports private evidence under an admin label. | Case/task-scoped privileged access, strong authentication, reason/time bounds, dual approval where justified and protected reviewable audit. |
| C11-H15 | Supply-chain attacks | A dependency, image, plugin/tool schema or poisoned build obtains secrets or alters a release. | Reviewed maintained components, pinned/versioned artifacts, least-privilege CI, provenance/scans and compatibility/evaluation gates. |
| C11-H16 | Denial of service | Oversized requests, connections, search or expensive processing consume shared resources. | Multi-dimensional admission/payload/deadline/resource limits and dependency-aware fail-closed/bounded degradation. |
| C11-H17 | Queue flooding | Replayed invites, notifications or document jobs exceed processing capacity and delay accepted reminders. | Authenticated producers, durable dedup, bounded per-actor/resource lanes, deadlines/fairness and safe DLQ/replay controls. |
| C11-H18 | Agent runaway loops | Child agents/tools repeatedly call one another, accumulating cost and context with no progress. | Parent-aggregate steps/time/cost/hops/fanout quotas, checkpoint/cancellation and no self-granted execution budget. |
| C11-H19 | External provider compromise | A callback, model output or failed-provider fallback causes unauthorized disclosure or state changes. | Reviewed provider/purpose/account binding, minimized payload, verified callback protocol, output distrust and auditable isolation/revocation. |
| C11-H20 | Backup exposure | A backup/export/key snapshot leaks data or restores old grants and repeats external actions. | Separate encrypted access-controlled recovery, retention/holds, revocation/deletion replay and provider-effect reconciliation before service resumes. |

For each released workflow, name assets/actors, entry points, preconditions, trust boundaries, potential impact, preventive and detective controls, recovery owner, residual uncertainty and verification. Do not assign reassuring severity scores without a real data/exposure/likelihood assessment. A severe plausible boundary failure blocks the dependent feature until its control is specified and evidenced; it is not automatically a confirmed vulnerability.

## 8. Enforceable Security Rules

These proposed engineering rules connect source principles to enforcement. They do not replace current legal/privacy decisions or claim every attack can be prevented.

| ID | Rule | Required enforcement |
| --- | --- | --- |
| C11-K01 | Default deny across actual resource chains. | Authenticate caller then authorize action/parent/scope/object/audience/history, not URL shape or a generic logged-in/admin check. |
| C11-K02 | Proof, sessions and recovery are purpose-bound. | Current account state, enrolled destination, attempt/expiry/single-use, session rotation/revocation and required recent assurance. |
| C11-K03 | Revocation applies at sensitive execution boundaries. | Current policy/consent/delegation and transactional checks for new writes/dispatches; define in-flight and offline limitations explicitly. |
| C11-K04 | Output and metadata follow the same audience. | Filter fields, counts, IDs, previews, caches, search, files, events, exports and errors before disclosure, not only after rendering. |
| C11-K05 | Agent authority is a restricted intersection. | Current human/resource permission plus independent delegation/tool/data scope, limits and expiry; no automatic full-user privilege. |
| C11-K06 | Untrusted content cannot appoint policy or tools. | Keep data separate from trusted configuration; validate and authorize every proposed read/effect outside the model, including follow-on tool output and child handoffs. |
| C11-K07 | Approval binds exact permitted intent. | Immutable action/version/recipient/payload/tool/policy/expiry, eligible human and current checks; prohibited operations remain prohibited. |
| C11-K08 | Keys, credentials and encryption have separate custodianship. | Maintained cryptographic/secret systems, valid TLS, classified encrypted storage and tested rotation/recovery; no homemade protocol or credential logging. |
| C11-K09 | E2E claims match actual key/plaintext access. | Disclose recipients, devices, Agent/provider handoff, metadata and recovery limits; no silent server plaintext access or downgrade. |
| C11-K10 | Collection/use follows classification and purpose. | Data subject/controller/scope, minimal necessary payload, specific consent or other reviewed authority, retention and derivative lineage. |
| C11-K11 | Files and URL access are isolated and bounded. | Immutable quarantine/scan, safe parsers/renderers, structured destination policy, checked connection/redirects and least-privilege egress. |
| C11-K12 | Retry and queue semantics cannot amplify privilege or effects. | Durable logical IDs, idempotency/current access, leases/consumer dedup, exact outcome recording and reauthorized DLQ replay. |
| C11-K13 | Client storage and browser trust are explicit. | Account-isolated local caches/keys, safe deep links, CSRF/XSS/session and offline policies; UI/cached role is never authority. |
| C11-K14 | Runtime and operator capabilities are least privilege. | Role/environment identities, private control planes, constrained CI/artifacts, per-resource/provider budgets and no bypass on dependency failure. |
| C11-K15 | Audit and monitoring preserve evidence without duplicating secrets. | Durable minimal sensitive-action evidence, redacted telemetry, controlled retention/access and tested detection/response. |
| C11-K16 | Data rights, incident recovery and release need evidence. | Resumable purge/export, reviewed holds/key destruction, isolated restores, known residual risks and qualified jurisdiction/age/provider review. |

## 9. Identity, Resource and Agent Workflows

### C11-W01 Authenticate, Recover and Revoke

Use the reviewed Chapter 18 account/provider model with maintained password/passkey/OIDC/session components. Where passwords are stored locally, use source-preferred Argon2id with per-password salt and reviewed parameters; its source bcrypt fallback is not permission to silently change hashing strength. Passwords/OTPs/recovery codes never enter ordinary logs, analytics, support output or model context.

Bind proof to purpose, intended pending enrollment/account, verified destination/binding version, expiry and bounded attempts. Account activation and credential enrollment must not preserve an attacker-controlled password from a different pending signup. External provider subjects map by trusted issuer/subject, not email-only merges. Current phone control does not recover a previous number holder's account or prove intended family identity.

Rotate bootstrap/login/refresh session identifiers and enforce server-side revoke, current account state and device binding. Token signature/expiry alone is not proof a session remains allowed. Browser cookies need their CSRF/Origin policy, Android credentials need protected storage, and recovery must revoke affected sessions/grants and notify established permitted channels. Recent authentication for high-impact actions is tied to the actual operation, not a long-lived `verified=true` flag.

Canonical account states must be reconciled with Chapter 18 and deletion stages. A disabled/suspended/deleting account cannot obtain ordinary access by retrying a different transport. Narrow recovery, appeal and lawful data-rights routes may exist without restoring all old authority. Optional MFA for ordinary users does not settle mandatory assurance for operators or high-impact actions; C11-D01 remains open. Login recovery cannot regenerate destroyed E2E keys.

### C11-W02 Authorize the Actual Object and Current Action

Resolve the authenticated principal and current account status, then the actual object and its owner/Space/conversation/parent chain. Intersect membership/admission period, role/capability, target relationship, lifecycle, audience/history, current consent, block/restriction and delegation/approval where relevant. Validate input fields separately from response/admin/tool schemas; no mass assignment through metadata or generic PATCH.

Intentionally public reads can use an explicit anonymous principal under their public visibility policy. Do not require an account merely to view source-permitted public content, but do not silently downgrade a failed credential into anonymous authority for a protected operation. Public responses still enforce current publication, moderation, field and cache rules.

Space membership and a role are necessary inputs, not complete authority. A family admin cannot read private member conversations, files, calendars, care records or personal Agent memory without the appropriate grants. `OWNER_ONLY` means the reviewed actual data owner/subject, not automatically the Space owner. A page owner cannot publish another member's private file simply because it is attached to shared work.

Apply the same policy to REST, realtime subscriptions/dispatch/replay, internal RPC, workers, tool calls, search/retrieval, downloads and exports. Foreign-key existence protects data integrity but not user authorization. In-process calls can share a deliberate transaction; network calls require verified service/delegated identity, not a caller-supplied user header.

Mutable authority and target versions are rechecked at the reviewed transaction/execution boundary. Removal, role change, consent withdrawal or cancellation committed first prevents later disallowed effects; cache invalidation fanout cannot be the only enforcement. Previously delivered bytes or already committed/provider-accepted work cannot be retroactively erased. Failure to determine current authority fails closed on protected actions, with safe user-visible errors instead of treating a stale permission cache as proof.

Idempotent receipt replay still checks current read/access policy and original actor/intent binding. A valid old key cannot restore a removed membership, approve changed content or expose a cached private response. Hidden-resource errors/counts/timing and public discovery projections need privacy review too; opaque IDs are not a security boundary.

### C11-W03 Build Minimal Context and Resist Prompt Injection

Before retrieval, determine current requester, resource/conversation, permitted history, required task data, classification, source/consent validity and destination model policy. Filter candidates using authoritative access rules before ranking/reranking or model context, not by asking the model to ignore forbidden chunks after retrieval. Minimize fields/time window/token budget and retain authorized evidence/provenance, not the whole account/Space archive.

Posts, messages, PDF/OCR text, web pages, calendar titles, contact labels, tool results and child-agent messages are untrusted data even when returned by an authenticated API. Keep trusted instructions and tool registry/config separate, and represent data provenance clearly. A `trusted_as_instruction:false` label helps structure but is not an enforcement mechanism by itself; filters, system prompts and classifiers cannot guarantee that a model never follows hostile content.

Assume a model can propose the wrong tool/recipient/URL or omit an approval. The executor independently validates schemas, current authority, allowlisted actions/destinations, classification, consent, required approval and budgets before any effect. Test this deterministic boundary directly with synthetic forbidden proposals, not only with model-generated answers. A content detector may flag suspicious text for restricted review, but must not block harmless quoted discussion indiscriminately or copy raw private attack content into public logs.

Validate tool output as data with size/type/schema limits and safe source links. It cannot register a new privileged tool, alter policy, approve a next step or supply a secret destination. Retrieved instructions must not become procedural memory or trusted workflow code. Tool/graph/prompt/model/retrieval updates require evaluation regression, and compound multi-step cases matter because a harmless-looking first result can influence a later high-impact action.

Long-term memory requires the reviewed scope/consent/source/expiry policy. Do not silently transform every conversation into saved facts or let personal context enter a group summary. Derived memory, embeddings, checkpoints and cached snippets inherit source restrictions; deleting/restricting a source removes unauthorized retrieval eligibility while lineage cleanup proceeds. A model answering a public Page question cannot inspect private family content to improve relevance.

### C11-W04 Propose, Approve and Execute a Tool Action

The registry defines typed/versioned tools with declared scopes, actions, risk, input/output schema, side effects, approval/consent policy, idempotency, deadline and budgets. Runtime identity and delegation are independently verified; an LLM selecting a valid tool name does not prove it may access the selected object. Child authority is a bounded subset of the current parent task, not a way to escalate permissions across Agents.

Persist the validated exact action intent and revision, target resource, recipient/destination binding, tool/policy versions, consent requirements, initiator, potential side effects and expiry. The human review shows all material content and recipients, not just a friendly `content_preview`. The source's `required_by:space_admin` example is not blanket permission for an admin to approve another person's health/private data. Editing creates a new revision and review; no mutable hidden arguments under an old approval.

On confirmation and again at execution, validate eligible human/current assurance, exact payload digest/canonical representation, audience, purpose, expiry and current authority. A digest binds bytes/meaning under its documented schema; it does not establish consent by itself. Claim one permitted logical action durably and audit the decision. Parallel approval/execution, replay, cancellation or stale checkpoint must not bypass expiry or create duplicate effects.

Prohibited clinical, financial, membership or external MVP actions stay denied even with a generic approval. Any future standing permission is separately scoped by permitted purpose/recipient/action/limits/expiry/revocation, not 'approve everything similar'. Local transactional effects and external provider effects have different rollback guarantees; unknown external outcome is reconciled before retry and never reported as confirmed success or undo.

Stop new steps when delegation, account, membership, consent or limits are revoked/exceeded. Aggregate limits apply to children, retries and resumes; a new run ID is not a fresh unlimited budget. Preserve safe execution/audit state and expose partial/failed/waiting outcomes honestly. The backend deterministic scheduler, not an always-running Agent, owns accepted reminders.

## 10. Encryption, Files and Transport Workflows

### C11-W05 Protect Keys and State Accurate Encryption Claims

TLS with valid certificate/hostname verification protects browser/Android/API/WS/internal service/database/cache/object/provider paths as required by the source. Document actual termination and any supported internal re-encryption boundary; a TLS edge alone does not prove private traffic is protected afterward. No trust-all certificate or plaintext credential exception is adopted to bypass a local networking problem. Local synthetic development arrangements must be explicitly separate from production requirements.

Encrypt the selected storage/backups/exports/temporary processing and sensitive telemetry with maintained cryptographic/KMS/key-storage components. Define which principal can decrypt each data class, key reference/version, authenticated context, rotation, revoke/destruction, backup and recovery. Encryption at rest protects selected storage compromise scenarios; a process with valid plaintext read permission can still disclose data. Minimize that permission and plaintext lifetime rather than making universal encryption claims.

Use established reviewed cryptographic protocols and libraries, with their nonce/randomness/authentication/associated-data requirements; do not invent a messaging protocol, key derivation or reusable nonce scheme. Separate provider/signing/session secrets, password verifiers, database envelope keys and client E2E keys. Key metadata is not necessarily sufficient to recover the actual authorized decryption ability, and one broadly shared key may prevent selective deletion.

The four Agent/E2E options in section 11.17 remain alternatives, not all enabled at once:

| Source model | Source label | Plaintext and authority consequence |
| --- | --- | --- |
| A | Agent has no access | Server/Agent cannot read opaque E2E conversation content; affected search/summarization features are unavailable unless separately authorized readable data exists. |
| B | User shares selected content | Client decrypts only the selected content for a disclosed Agent/provider handoff. That copy has a new processing/retention/consent boundary; the original E2E transport does not make the handed-off copy invisible to its recipient. |
| C | Trusted agent endpoint | Agent is an explicit cryptographic participant with its own authorized identity/key lifecycle. Disclose what server/cloud/model can read through that endpoint; do not market it as only human devices possessing plaintext. |
| D | Client-side agent | Processing may happen on a trusted user device; any remote model call or telemetry containing plaintext is still a separate handoff, not automatically on-device privacy. |

Choose the applicable modes, protocol/version and client/platform support before implementation. Device enrollment, partner/member admission/removal, key epoch changes, verification, forward/backward access, compromise, attachments, metadata and backup/recovery need a complete protocol threat model. Removing membership stops new authorized service access but does not erase previously distributed keys or messages from another participant's device. Key rotation addresses future access under its protocol, not automatic recall.

Do not mix server-readable and E2E modes silently, downgrade to plaintext on error, or promise server-side scan/search/moderation of content the server cannot decrypt. E2E may still expose timing, routing, sizes and participant metadata. User-provided report evidence, client processing and optional handoff require clear UI and separate audience/retention rules. Recovery of an account and recovery of encrypted data are separate promises.

### C11-W06 Ingest Files and Fetch Only Approved Destinations

An authenticated upload session binds owner/resource/purpose, permitted size/media and immutable file version. Short-lived signed upload capability is scoped to that object/action, not a storage credential for listing arbitrary private buckets. Verify actual stored version, bytes/type/signature/checksum and required scan before processing/publication. Prevent late presigned writes or callbacks from replacing already scanned content, and do not equate an object ETag with SHA-256 for every provider.

Quarantine originals and isolate scanners/parsers/OCR/previews using least-privilege storage, unprivileged execution, bounded CPU/memory/time/decompression/nesting/page/file limits and minimal/no network access. Reject path traversal, symlink escape and unsupported executable/macro/embedded behavior through maintained parsers and extraction policy; never execute uploaded code to 'understand' a document. Malware scanning does not prove the content is safe for every renderer or the model will ignore its instructions.

Derived text/pages/thumbnails/chunks/vectors/citations retain immutable source/version, current audience, classification and deletion lineage. Download/share/preview/retrieval reauthorizes; ordinary presigned GET expiry does not provide immediate revocation of a URL already issued. Use the reviewed revocable access mechanism or explicitly qualify the promise. Already delivered bytes and authorized exports have unavoidable recall limits.

For user/Agent/provider-supplied URLs, use a maintained structured URL/IP parser and a narrow purpose-specific protocol/host/port policy, not ad hoc substring checks. Reject credentials in URLs and disallowed destinations, private/loopback/link-local/metadata and equivalent IPv4/IPv6 forms as required. Validate actual DNS resolution and the connection target through a design that addresses rebinding and avoids a second unvalidated resolution. Preserve TLS hostname verification when using a validated address.

Disable unnecessary redirects; if a reviewed use case permits them, bound hops and validate every destination/connect decision anew, dropping credentials across unapproved boundaries. Control DNS, proxy and cloud metadata paths using egress isolation as defense in depth. Response/compressed-size, time, content-type and parse bounds apply before unbounded buffering. Fetchers have no ambient user/provider credentials or unrestricted storage keys. URL allowlists, tenant-specific approved integrations and denied network policy are not to be bypassed for convenience.

### C11-W07 Contact External Providers and Validate Callbacks

Before each approved request, choose a configured provider/account/endpoint and verify its actual capability, processing region/purpose, retained/training data terms, credentials and outage behavior. Minimize payloads and use explicit subject/recipient/consent with the approved template and authority. A generic adapter method does not prove WhatsApp groups/calls/presence, cancellation or deletion APIs exist.

External communication checks current verified destination, contact binding, account/Space/history eligibility, purpose-specific consent, quiet hours/preferences, exact approval where required, spending/rate limits and cancellation. Family admin status, a relationship label, OS contacts permission or an OTP delivery request cannot enroll another person into calls or marketing. Initial invitations and verification have their separately reviewed delivery policies; no real external test sends are authorized here.

Use bounded least-privilege credentialed adapters; provider secrets never enter model context or clients. A provider timeout is an uncertain effect, not permission for an automatic new key, different recipient/channel or unapproved model fallback. Store accepted/delivered/read/acknowledged and failed/unknown separately and reconcile through supported provider evidence. No receipt is proof of medical adherence or emergency response.

Callbacks use the provider's official exact-byte/canonical signature, key-rotation and replay/timestamp scheme, with request size/media bounds. Bind the verified event to the configured provider account and stored logical operation/destination. Authenticity does not make content trustworthy instructions or confer unrelated verification/membership/approval. Persist a scoped event identity/digest and durable processing intent before acknowledging; deduplicate and handle out-of-order outcomes without regressing state. Retained raw callbacks are restricted/minimized, not ordinary logs.

### C11-W08 Enforce API, Realtime and Client-Side Boundaries

Use separate allowlisted input/domain/output/admin/tool schemas, parameterized database queries and the shared typed contract. Validate per-operation sizes/counts/media/deadlines and resource parent relations before expensive work. Safe machine errors and current-authorized idempotency/precondition handling prevent injection, stale overwrite and private existence leaks. A database object must not be serialized wholesale because its endpoint is authenticated.

Web uses current secure HttpOnly session binding, CSRF/Origin protections, safe redirects and tested renderer/CSP/media behavior from Chapter 9. Middleware/layout/Server Actions are not final authorization. Public HTML/RSC/metadata/prefetch/CDN/image caches cannot receive private projections; a data field hidden visually but serialized to the browser is disclosed. HttpOnly, React escaping and CSP each address limited threats, not all browser attacks.

Android/browser caches, drafts, pending commands, notifications and callbacks are bound to the intended account/environment/generation. Keystore custody and Room/DataStore presence alone do not prove local database encryption; browser persistence is not a secret vault. Offline access limits, key loss, backup transfer and shared-device/Back/BFCache behavior require the reviewed client policy. Client logout or remote deletion cannot prove forensic removal of already copied bytes.

WebSockets validate authentication, browser Origin where relevant, per-resource subscriptions, frame/rate/buffer budgets and current session/permission on private dispatch/replay. Do not put long-lived tokens into URLs/subprotocols or trust client channel/user names. Source-required disconnect on session revocation is an operational behavior to test; stopping private delivery must not wait for a delayed client disconnect. Reconnect, scoped snapshot/cursor reset and replay reauthorize; a live socket is not a permanent permission grant.

Internal RPC/workers also validate service identity and delegated actor, schema, purpose, expiry/current authority and bounds. A queued job reference or private network cannot appoint a user or resurrect a revoked grant. Failure of current authorization/durability blocks the protected operation; optional model/cache/presence degradation may leave safe manual workflows usable. Per-process limits alone cannot control distributed provider or spend exposure.

## 11. Consent, Care and Data-Rights Workflows

### C11-W09 Collect and Use Data for a Specific Authorized Purpose

Create an inventory before collecting data: purpose, required fields, affected people, ownership/controller, legal/contractual authority, current grant/consent, permitted recipients/providers/regions, retention and user controls. A broad terms checkbox is not permission for all future processing. Consent is one possible legally relevant basis, not an automatic substitute for the specific lawful basis required in every jurisdiction; the technical authorization rules still apply regardless of basis.

Distinguish what the user requests, what their account may do, what a data subject agreed to, what OS/browser permissions allow, what a provider supports and what the product permits. Receiving a verification code, installing the app, joining a family, accepting a relationship or enabling notifications does not authorize marketing, external calls, health sharing, address-book retention or permanent Agent memory. Log purpose/scope/version/source/evidence of grants and withdrawals without unnecessarily copying sensitive content into the consent record.

Privacy settings are server-enforced across profile visibility, discovery, messages, contact matching, Agent context/memory, file sharing, calendar access and external recipients. Withdrawing a grant promptly stops future disallowed use and derived retrieval/dispatch; local copies already delivered cannot be physically recalled by a toggle. Separate mandatory security/legal retention from optional analytics/training/marketing, disclose the distinction and do not repurpose retained records secretly. Unconsented provider/model fallback is not an outage mitigation.

Family/couple relationships and parent/guardian labels are separate from proven legal representation. Determine age/region/guardian authority and consent flows with qualified review before dependent real-user features. Do not infer age, pregnancy, incapacity, legal authority or medical facts from casual conversation, contact names or shared address. A child/dependent record is a separate data subject and not automatically a third human member of a two-person couple Space. Minimize collected family/child information rather than asking the Agent to gather everything.

Future supported care reminders retain confirmed user/professional instructions, units, dose text, source and intended schedule without interpreting an unclear image as definitive medication identification. Missing/uncertain OCR information needs review; an Agent suggestion cannot change treatment. Private status/name/dose/photo/location each has a permitted audience and purpose. No response or a delivered message is not proof of missed medication, harm or an emergency; escalation requires reviewed consent, limits and a real supported process.

Chapter 1's MVP excludes Agent health-record access and autonomous diagnosis/dosage decisions; source future-care examples and generic approval language do not override that boundary. General education/nearby-clinician assistance, if later approved, needs current credible evidence, uncertainty and clear non-clinician limitations; something appearing on the internet is not clinical validation. Pregnancy/children/care data remains sensitive even if the intended benefit is supportive. Live calls or emergency contact actions require their own verified integration and user-authority contract.

### C11-W10 Export, Delete and Enforce Retention

Publish an understandable per-domain data policy: what is stored, why, audience/region/provider, retention, user access/export/deletion, holds and backup behavior. Retention values and launch jurisdictions are OPEN, not source-proven defaults. Collect no real private data until its applicable policy and controls are ready for that release.

Use online recent authentication and current resource permission for export/deletion. Export selects only the requester's eligible records/fields, not everyone else's files/conversations because the requester once joined a Space. Use a consistent bounded snapshot/manifest, encrypted private artifact, scoped current-authorized download, expiry and cleanup. Recheck authority before release/download; a presigned link alone cannot guarantee immediate revocation or prevent an already authorized download being copied.

For deletion or source restriction, remove current access/retrieval eligibility first, revoke affected sessions/delegations and block new disallowed work at the reviewed boundary. C18-D09's immediate ordinary-access revocation on deletion request remains a proposal pending resolution of the source grace-period conflict. A grace window, if adopted, delays irreversible purge under a narrow authenticated cancellation path; it must not silently preserve general access or revive all old sessions on cancel.

Track resumable purge/anonymization across account/contact/profile, shared-resource ownership, original/derived files, search/vector/cache, Agent memory/checkpoints, exports, scheduled work and provider integrations. Keep source lineage so deleting one source cannot leave its private summary searchable elsewhere. A group deletion must not indiscriminately delete unrelated personal data; a retained shared message must not retain unnecessary profile/credential fields forever. Legal/safety holds require authorized documented scope and review, not a permanent blanket exception invented by a developer.

Classified backups and audit may follow separately disclosed retention. Record which data is purged, pending, lawfully retained or technically unrecoverable; do not declare everything gone after removing a DB row. Restore procedures must reapply current revocation/deletion/hold state before serving data or resuming sends. Key destruction requires particular review when keys protect multiple subjects/backups or legal records; a secure erase claim must match the storage/key design and actual evidence.

Access denial or account suspension does not eliminate a person's applicable data rights. Define narrowly authenticated recovery/rights/support paths without reopening ordinary private-resource authority. Conversely, a data-rights request is not blanket permission to export other people's sensitive content or bypass current E2E key availability. Provider-held copies/training/retention/deletion are governed by verified capabilities and agreements, with limits disclosed rather than assumed away.

## 12. Audit, Security Operations and Assurance

### C11-W11 Detect Misuse and Govern Privileged Changes

Sensitive operations create durable minimal audit intent: authentication/recovery/revocation, roles/memberships, private file access/deletion, Agent runs/tools/approvals, external dispatch, data rights, policy and operator changes. Preserve actor/acting identity, subject/resource/scope, action, time/version, result/reason and operation correlation as permitted. The audit store has stricter write/read/retention rules than ordinary debug logs; source append-oriented does not automatically mean cryptographically tamper-evident or immutable against every administrator.

For effects requiring accountability, commit audit intent with the local business transaction or stop when mandatory evidence cannot be preserved. Optional sampled performance telemetry has a different availability contract. Do not claim an external effect rolled back because its later log delivery failed; record/reconcile the unknown or completed effect durably. Third-party log/trace outages must not cause unlimited local payload buffering or wipe evidence.

Use safe structured logging, field allowlists, masking/redaction, restricted debug access and short reviewed retention. Check HTTP bodies, SQL parameters, exceptions, URL queries/referrers, WebSocket tickets, signed links, DLQ payloads, crash dumps, support attachments, browser session replay, mobile screenshots and model traces. Sampling reduces volume, not the sensitivity of what remains. Pseudonymous IDs/hashes and embeddings are not inherently anonymous; avoid high-cardinality private metric labels and unsupported de-identification claims.

Monitor bounded signals for account/session misuse, denial patterns, download/export spikes, suspicious tool/destination requests, approval reuse, queue floods, abnormal subscriptions, provider anomalies and privileged actions. Detection rules need severity, accountable owner, safe evidence, response/containment and tuning for false positives. A report/alert is not proof of wrongdoing. Do not expand routine surveillance or retain full private message bodies merely to make anomaly detection easier.

Support/moderation/operator access is case/task-scoped with strong authentication, recent assurance, reason, expiry and audit; dual approval applies where a reviewed high-impact operation warrants it. User-facing admin roles and platform operations roles are different. Break-glass access has a narrow approved purpose and after-use review, not a permanent shared credential or hidden ability to inspect arbitrary family data. Backups, exports, security dashboards and DLQ viewers follow the same boundary.

Release supply-chain controls include reviewed maintained libraries/protocols, locked supported versions, dependency/secret/SAST/container/IaC checks, minimal CI credentials, provenance and signed/verified immutable artifacts as appropriate. A signature proves origin/integrity under its trust chain, not that the component is vulnerability-free. Update response includes impact assessment, compatibility/evaluation tests and bounded rollout/rollback; an Agent cannot update its own privileged tool definition without the trusted release process.

Security testing is explicitly authorized and scoped to the intended repository/test environment. Prefer deterministic synthetic actors/data, constrained provider fixtures and controlled clocks. Live network scans, production exploitation, mass OTP/provider sends, personal-device capture or destructive recovery are not authorized by a documentation task. Preserve failures and exact artifact/environment evidence instead of labeling an untested dependency safe because a document says to use it.

### C11-W12 Respond to Compromise and Qualify Release

Follow the source lifecycle: Detect -> Triage -> Contain -> Investigate -> Eradicate -> Recover -> Review. Assign an incident commander with security/privacy/operations and product owners; legal/safety/provider escalation depends on the actual jurisdiction and impact. The development Agent is not the accountable legal officer, on-call human or substitute for a qualified security assessment.

Contain the affected capability without creating a bypass: revoke/disable compromised tokens or tool/provider grants, pause unauthorized external effects, isolate untrusted processing, preserve minimal evidence and limit further disclosure. Do not indiscriminately erase all keys/data or disable audit to simplify recovery. A replacement release must not reset a privacy/cost kill switch. Unknown effects and potentially leaked copies remain explicitly recorded.

Key response depends on key type and actual plaintext access: session signing keys, service/provider credentials, wrapping/data keys and device/conversation E2E keys have different exposure and recovery consequences. Identify affected resources and decrypt/impersonation capability, revoke relevant sessions/grants, rotate replacements with reviewed overlap, and re-encrypt/rekey only where necessary and supported. Rotation does not erase plaintext already exposed, restore lost forward secrecy retroactively or guarantee all prior ciphertext is safe. User/device key verification and account recovery need separate handling.

Restore into isolation with traffic/provider sends disabled until data/object/key integrity, current grants/deletions/cancellations and external outcomes are reconciled. A clean server restart or successful backup download is not a recovery test. If the latest authority state or external outcome cannot be established, keep affected operations blocked/reviewed rather than replay old approvals or expose pre-deletion data. Record actual recovery time/loss, failed stages, evidence and approval before gradual reopening.

Before launch, qualified review determines applicable obligations from business/user locations, ages, data classes, purposes, providers/subprocessors, regions and channels. Maintain data-flow/vendor inventories, access reviews, retention/rights procedures, incident/notice decision process and evidence. Do not call the platform GDPR/HIPAA compliant, child-safe, clinically validated or otherwise certified from this design. Specific legal bases, notice deadlines, age thresholds and residency terms are not invented here.

Risk acceptance records the residual issue, affected release/data, severity rationale, control/evidence gaps, mitigation/expiry and accountable approver. It cannot authorize prohibited processing, undo mandatory privacy obligations or turn a failed critical isolation test into a passed one. Dependent features remain gated; an M1 synthetic reminder demo can proceed only under its authorized test limits and never certifies all future health, E2E, provider or production controls.

## 13. Proposed Security Verification

All C11-V scenarios are proposed evidence families, currently NOT RUN. Each references source topics, acceptance criteria and threat categories plus the proposed enforceable rules/workflows. The threat register describes potential failures, not findings from an audit of existing code.

| Check | Source topics | Source acceptance | Threat categories | Security rules | Workflows | Required evidence |
| --- | --- | --- | --- | --- | --- | --- |
| C11-V01 | C11-S01, C11-S02, C11-S03, C11-S42, C11-S43 | C11-A01, C11-A02 | C11-H02, C11-H03 | C11-K01, C11-K14 | C11-W02, C11-W08, C11-W11 | Released data-flow/trust-boundary review and actual service/client/worker policies show one authority, explicit anonymous public reads and denied protected access without valid current context. |
| C11-V02 | C11-S04, C11-S05, C11-S06 | C11-A01 | C11-H01, C11-H09, C11-H10 | C11-K02, C11-K08 | C11-W01 | Maintained auth/password/proof paths resist concurrent preregistration/verification, wrong-purpose/recycled-contact recovery, weak role-based support override and unsafe account-state changes. Secrets do not appear in outputs or fixtures used outside approved custody. |
| C11-V03 | C11-S07 | C11-A10 | C11-H01, C11-H10, C11-H13 | C11-K02, C11-K03, C11-K13 | C11-W01, C11-W08 | Session fixation, refresh races/reuse, current/all-device revoke, stale tabs/mobile callbacks and expired/disabled account requests are tested against actual identity and clients. A signed token alone cannot preserve revoked authority. |
| C11-V04 | C11-S08, C11-S09, C11-S10, C11-S11 | C11-A02, C11-A07 | C11-H02, C11-H03 | C11-K01, C11-K03, C11-K04 | C11-W02 | Actor/target/parent/role/attribute/history matrix includes cross-Space child IDs, owner/admin/guest boundaries, version races, replay and unavailable current policy; checks operate server-side, not only in UI. |
| C11-V05 | C11-S27 | C11-A02, C11-A07 | C11-H02, C11-H03, C11-H13 | C11-K01, C11-K04, C11-K10 | C11-W02, C11-W09 | Family/couple membership and labels cannot expose personal conversations, health fields, memory, files or exact calendars; guest/rejoin and new-history grants do not broaden private data by accident. |
| C11-V06 | C11-S19, C11-S20 | C11-A06 | C11-H13, C11-H20 | C11-K04, C11-K10, C11-K16 | C11-W03, C11-W09, C11-W10 | All five source classes have reviewed owner/purpose/audience/retention and derivative handling; private previews/vectors/exports/identifiers are not reclassified public or anonymous merely by transformation. |
| C11-V07 | C11-S12, C11-S13 | C11-A03, C11-A04 | C11-H11, C11-H12 | C11-K05, C11-K06 | C11-W03, C11-W04 | Agent/tool registration, scope/action/schema, initiator/delegation and current resource permission reject excessive or self-granted capabilities and forged internal/child identity. |
| C11-V08 | C11-S20, C11-S21 | C11-A13 | C11-H11, C11-H13 | C11-K04, C11-K06, C11-K10 | C11-W03 | Authorized synthetic malicious-content evaluations and deterministic executor tests show retrieved/post/PDF/calendar instructions cannot make forbidden context or tool effects available. Test semantic false positives and multi-step propagation, not only a keyword filter. |
| C11-V09 | C11-S22 | C11-A13 | C11-H11, C11-H12, C11-H19 | C11-K06, C11-K11 | C11-W03, C11-W04, C11-W06, C11-W07 | Tool output size/schema/source/destination and renderer validation keep untrusted results as data; callbacks or labels cannot approve/register privileged follow-on tools or inject executable UI/procedural memory. |
| C11-V10 | C11-S23, C11-S24 | C11-A05 | C11-H02, C11-H12 | C11-K03, C11-K07, C11-K12 | C11-W04 | Exact recipient/payload/tool/policy/expiry binding, eligible approver and required assurance reject mutated or reused previews, changed authority and concurrent stale execution. Backend checks full intent, not just displayed summary. |
| C11-V11 | C11-S13, C11-S23, C11-S24 | C11-A05 | C11-H12, C11-H18 | C11-K05, C11-K07, C11-K12 | C11-W04 | Approved logical action executes at most once locally under races/replay; unknown external effect is reconciled. Cancel/delegation loss stops new steps; prohibited MVP action fails even with a generic approval or standing-grant claim. |
| C11-V12 | C11-S14 | C11-A08 | C11-H09, C11-H19 | C11-K08, C11-K14 | C11-W05, C11-W07, C11-W08 | Actual client/edge/internal/DB/cache/object/provider TLS paths and service identity enforce certificates/hostname/audience; no trust-all/plaintext private credential path hidden behind a TLS edge. |
| C11-V13 | C11-S15, C11-S18 | C11-A09, C11-A15 | C11-H09, C11-H20 | C11-K08, C11-K16 | C11-W05, C11-W10, C11-W12 | Chosen storage/export/temp/backup encryption and key-role separation are tested with real configured artifacts; encrypted-at-rest does not claim protection from an authorized plaintext process. |
| C11-V14 | C11-S16, C11-S17 | C11-A03, C11-A07, C11-A09 | C11-H13, C11-H14 | C11-K09, C11-K10 | C11-W05 | Selected reviewed E2E protocol/mode, actual key holders, device enrollment/removal, Agent option A/B/C/D and metadata/backup limits match UI/provider/storage behavior. No silent server-readable downgrade or automatic server scan of opaque content. |
| C11-V15 | C11-S18, C11-S39 | C11-A19 | C11-H09, C11-H20 | C11-K08, C11-K16 | C11-W05, C11-W12 | Approved key generation/rotation/revoke/loss/multi-device recovery and compromise drill measures actual decrypt/impersonation exposure and restore behavior. Account recovery cannot fabricate lost E2E data or undo prior disclosure. |
| C11-V16 | C11-S25, C11-S26 | C11-A06, C11-A07 | C11-H02, C11-H13 | C11-K03, C11-K10 | C11-W09 | Purpose/channel/subject/scope/version grants, withdrawal, preference and OS permission distinctions are tested across reads/jobs/model use. Consent to verification/invitation does not become marketing or broad memory permission. |
| C11-V17 | C11-S28 | C11-A03, C11-A06 | C11-H11, C11-H12, C11-H13 | C11-K05, C11-K07, C11-K10 | C11-W03, C11-W04, C11-W09 | Future approved care fixtures preserve confirmed source/units/dose text and field-level status-only sharing; unclear OCR, unsupported clinical action and false adherence/emergency claims are blocked. MVP Agent health-record/external prohibitions remain enforced. |
| C11-V18 | C11-S29 | C11-A11 | C11-H04, C11-H08 | C11-K11, C11-K14 | C11-W06 | Controlled hostile/oversized archive/document fixtures test immutable quarantine, file signatures, size/decompression/nesting/page limits, scan and unprivileged parser isolation without executing uploaded code or leaking worker credentials. |
| C11-V19 | C11-S29, C11-S32 | C11-A02, C11-A11 | C11-H03, C11-H08, C11-H13 | C11-K04, C11-K11 | C11-W06, C11-W08 | Version replacement after scan, wrong-owner completion, private thumbnail/citation/share/download and membership removal fail safely; declared immediate revocation is not 'tested' by waiting for an ordinary signed URL to expire. |
| C11-V20 | C11-S30 | C11-A02, C11-A11 | C11-H07, C11-H19 | C11-K11, C11-K14 | C11-W06, C11-W07 | Authorized isolated URL fixtures cover parsing/canonicalization, DNS/connect rebinding, private/IPv6/link-local/metadata destinations, redirects/proxies, credential forwarding and response/time limits. No live private-network scanning is inferred. |
| C11-V21 | C11-S31 | C11-A10, C11-A12 | C11-H02, C11-H03, C11-H16 | C11-K01, C11-K03, C11-K13 | C11-W08 | Real WS upgrade/origin/ticket auth, scoped subscription/replay, revoke/disconnect, slow consumer and frame/rate limits prevent new disallowed events; cached connections/cursors cannot restore authority. |
| C11-V22 | C11-S32 | C11-A02, C11-A07 | C11-H03, C11-H04, C11-H16 | C11-K01, C11-K04, C11-K12 | C11-W02, C11-W08 | Real released API tests cover SQL/search/template injection boundaries, mass assignment, safe output/errors/cursors, precondition/idempotency and request/time bounds. Domain/admin/tool schemas cannot be substituted for one another. |
| C11-V23 | C11-S01, C11-S25, C11-S32 | C11-A02, C11-A07 | C11-H05, C11-H06, C11-H13 | C11-K04, C11-K13 | C11-W08 | Actual browser/mobile XSS/CSRF/URL/deep-link/prefetch/RSC/cache/account-switch and local storage/backup policies protect private projections; UI hidden-state or a Keystore/HttpOnly label alone is not proof. |
| C11-V24 | C11-S33, C11-S40 | C11-A14, C11-A16 | C11-H09, C11-H13, C11-H14 | C11-K15 | C11-W11 | Required audit intent is durable with sensitive effects; sentinel private values stay out of ordinary log/trace/DLQ/dump/support/analytics paths. Privileged evidence read/retention/tamper protection and audit outage behavior are exercised. |
| C11-V25 | C11-S34 | C11-A17 | C11-H01, C11-H12, C11-H16, C11-H17 | C11-K14, C11-K15 | C11-W11 | Detection/alert fixtures identify relevant misuse with bounded safe metadata, assigned owner and tested response; false positives do not become automatic permanent enforcement or expanded surveillance. |
| C11-V26 | C11-S35, C11-S36 | C11-A02, C11-A13 | C11-H02, C11-H11, C11-H12, C11-H19 | C11-K01, C11-K05, C11-K06, C11-K11, C11-K13 | C11-W02, C11-W03, C11-W04, C11-W07, C11-W08 | Release-specific threat models trace assets/actors/entry/control/recovery and residual gaps, including composed multi-step failures. Threat enumeration alone cannot mark a control passed. |
| C11-V27 | C11-S37 | C11-A15, C11-A17 | C11-H09, C11-H15 | C11-K08, C11-K14, C11-K16 | C11-W11 | Actual dependency/secret/SAST/container/IaC and artifact trust gates use least-privilege CI, maintained libraries and actionable findings. Lockfile/signature existence alone does not prove no vulnerable component or exposed secret. |
| C11-V28 | C11-S12, C11-S13, C11-S32, C11-S34 | C11-A03, C11-A04, C11-A17 | C11-H16, C11-H17, C11-H18 | C11-K05, C11-K12, C11-K14 | C11-W04, C11-W08, C11-W11 | Multi-replica request/job/Agent fanout floods, retries, provider budgets and limiter/lease failures remain bounded and current-authorized. Child tasks or new challenge/command IDs cannot reset aggregate quotas. |
| C11-V29 | C11-S25, C11-S26, C11-S40, C11-S41 | C11-A07, C11-A20 | C11-H13, C11-H20 | C11-K10, C11-K16 | C11-W09, C11-W10 | Current-authorized export, scope/field consent, source deletion/derivatives, retention/hold/backup and provider limits match approved policy. Age/guardian/legal-basis/region decisions require qualified evidence, not inferred legal conclusions. |
| C11-V30 | C11-S38, C11-S39 | C11-A18, C11-A19 | C11-H01, C11-H09, C11-H14, C11-H19, C11-H20 | C11-K08, C11-K15, C11-K16 | C11-W11, C11-W12 | Authorized isolated incident/key-compromise/restore drills prove scoped containment, evidence preservation, current revocation/deletion replay, external-effect reconciliation and measured recovery; no live outbound copy or false key-rotation guarantee. |
| C11-V31 | C11-S37, C11-S41 | C11-A13, C11-A20 | C11-H11, C11-H15, C11-H19 | C11-K06, C11-K14, C11-K16 | C11-W03, C11-W07, C11-W11, C11-W12 | Model/prompt/tool/provider/library changes rerun relevant isolation/approval/evaluation gates and vendor/legal review; claimed data regions, retention/training/deletion settings are verified against actual selected terms and behavior. |
| C11-V32 | C11-S01, C11-S35, C11-S36, C11-S37, C11-S42, C11-S43, C11-S44 | C11-A01, C11-A02, C11-A03, C11-A04, C11-A05, C11-A06, C11-A07, C11-A08, C11-A09, C11-A10, C11-A11, C11-A12, C11-A13, C11-A14, C11-A15, C11-A16, C11-A17, C11-A18, C11-A19, C11-A20 | C11-H01, C11-H02, C11-H11, C11-H20 | C11-K01, C11-K03, C11-K05, C11-K07, C11-K10, C11-K15, C11-K16 | C11-W01, C11-W02, C11-W03, C11-W04, C11-W05, C11-W06, C11-W07, C11-W08, C11-W09, C11-W10, C11-W11, C11-W12 | Accepted release evidence names exact artifacts, environment, test scope, owners, residual risks and failed/unrun gates. A synthetic M1 demo cannot certify deferred health/E2E/Agent/provider/global compliance or production security. |

Use focused unit/policy tests, real database/transport/client integration for concurrency/cache/session behavior, protocol/library test vectors and qualified review for cryptographic design, controlled Agent evaluations and deterministic executor-denial tests, and permitted staging security/restore exercises. Fakes isolate logic but cannot prove live TLS, provider signatures/retention, encryption/key custody or browser sandbox behavior. Tools returning no diagnostics or a zero exit code do not substitute for actual test cases and artifacts.

Measure both prevented effects and data exposure: a rejected final tool call does not excuse secret leakage earlier into model context, logs or a rendered page. Tests use canary/synthetic secrets and content, not actual credentials, personal messages, children's data or medication images. Define expected allowed behavior as well as denial, so controls do not simply disable every feature or block legitimate public access. Test failures stay visible; they are not waived by generating more documentation or Agent runs.

## 14. Developer Handoff and Release Gates

| Ticket | Accountable role | Depends on | Deliverable and required evidence |
| --- | --- | --- | --- |
| C11-T01 | Product/security/privacy leads, Teams A/E | Relevant release and identity/Space/data/client/operations choices | Decide released data classes, purposes, authority, jurisdiction/age/provider scope and C11-D01 through C11-D14 applicability; record open blockers, risk owners and qualified-review needs. |
| C11-T02 | Security/platform architect, Teams C/E | C11-T01 | Versioned trust/data-flow/threat and policy matrix, canonical principal/scope/approval/classification handling and verification plan. Trace all source principles to concrete controls without claiming audit completion. |
| C11-T03 | Identity/security engineer, Teams C/E | C11-T02; approved identity implementation | Implement reviewed proof/password/session/recovery and assurance/revoke controls; C11-V02, C11-V03, C11-V12. Use maintained components and dedicated credential handling. |
| C11-T04 | Domain authorization/data engineer, Teams C/E | C11-T02, C11-T03; Space/data decisions | Implement current actor/target/resource/history/consent policy at every released read/write/job boundary; C11-V01, C11-V04 through C11-V06, C11-V22. No new global-role shortcut. |
| C11-T05 | Agent safety/memory engineer, Teams D/E | C11-T04; released Agent/tool contracts | Independent scoped tool/context/approval execution, untrusted-output isolation and aggregate budgets; C11-V07 through C11-V11, C11-V17, C11-V28. Do not introduce Agent/health powers into M1. |
| C11-T06 | Cryptography/platform/client specialists, Teams B/C/E | C11-T02, C11-T03, C11-T04; chosen E2E/key policy | Select reviewed protocol/libraries and implement agreed transit/storage/key/client modes with specialist review, C11-V12 through C11-V15. No homemade cryptography or silent server plaintext path. |
| C11-T07 | File/integration security engineer, Teams C/E | C11-T02, C11-T04; C11-T06 for released encrypted paths | Isolated immutable upload/parser/fetch/provider/callback boundaries and scoped credentials; C11-V18 through C11-V20, C11-V31. Live probes/providers need separate approval. |
| C11-T08 | Android/web security leads, Teams B/E | C11-T03, C11-T04, C11-T06, C11-T07 for released features | Actual client/WS/RSC/cache/storage/notification/link/renderer protections and safe account switching; C11-V21 through C11-V23. UI restrictions do not replace backend policy. |
| C11-T09 | Platform/audit/security operations, Teams C/E | C11-T03 through C11-T08 for released paths | Durable minimal audit, private-safe monitoring, least-privilege support/CI and artifact/secret controls; C11-V24 through C11-V28. Detection and audit failures have tested policy. |
| C11-T10 | Data-protection/incident/key owners, Team E | C11-T04, C11-T06, C11-T09; C11-T05 through C11-T08 for affected data | Implement reviewed retention/export/purge, provider limits and isolated compromise/restore runbooks; C11-V29 through C11-V31. Qualified legal review is a separate deliverable, not an AI certification. |
| C11-T11 | Independent security/QA reviewer, Team E | C11-T03 through C11-T10 for released scope | Execute applicable C11-V01 through C11-V32, inspect real artifacts and unexpected allowed/denied outcomes, record residual/failed/unverified controls and release gates. No false pass from mock-only testing. |
| C11-T12 | Agent/product/runtime architects, Teams A/C/D/E | C11-T02; C11-T11 for runtime assurance | Chapter 12 handoff for LangGraph states, tools, approvals, memory, context, delegation, cancellation, budgets and evaluations under these security boundaries. Planning can continue now; runtime readiness cannot. |

These are role-owned packages, not staffed employees, executed subagents or permission to deploy. Split work into bounded changes with source IDs, owner, dependencies, data/API/client implications, failure cases, actual test commands, applicable ADR/migration notes, runbook/demo and limitations. A security owner reviews each released feature from the beginning; the final testing package is not the first time consent or resource isolation is considered.

Release gates require the evidence appropriate to exposed features: actual auth/revoke, resource/data projection, transport and secret handling, request/worker bounds, rights/retention and response readiness before real users. Sensitive high-impact or privacy failures block the dependent feature; a proposed acceptance row or unresolved policy cannot be treated as a risk-approved production control. Advanced E2E/health/provider features remain unverified and out of scope until specifically approved and tested.

## 15. Security Demo, Tradeoffs and Next Chapter

The initial security demonstration, only after implementation and a disposable test environment are authorized, uses synthetic organizer/member/unrelated accounts. Show legitimate register/verify/family invitation and accepted task/reminder use; then wrong-account/resource access denial, session/member revocation, exact-recipient behavior and safe cancellation/retry. Verify private data does not appear in public search, logs, notifications, model context or another client's caches. Use separate bounded fixtures for backup/key/restore and future Agent injection/approval testing; do not send real family messages or collect real health content to demonstrate security.

| Mistake or tradeoff | Impact | Required position |
| --- | --- | --- |
| Treat admin/member/private-network labels as universal authority. | Private member data or powerful operations become available outside intended scope. | Current actor/action/resource/history/consent plus separate operator and Agent grants. |
| Rely on prompts or an injection detector as the final guard. | A model influenced by untrusted text can propose a forbidden disclosure/effect. | Deterministic retrieval/tool/destination/approval/budget enforcement outside the model, with actual tests. |
| Call encrypted disks or server-readable messages E2E. | Users receive an incorrect promise about who can read their data. | Disclosed mode, real key holders/recipients and reviewed protocol/recovery behavior. |
| Assume minimal metadata, hashes or vectors are anonymous. | Membership, identities or sensitive facts leak through secondary stores and telemetry. | Classification, purpose, scope and retention apply to derivatives too. |
| Approve a friendly summary but execute changed recipients/arguments. | The effect differs from the user's informed decision. | Immutable exact intent/version, full review and current authorization at execution. |
| Use a broad consent checkbox or family label for health/child data. | Unlawful or unwanted sensitive processing and unsafe care assumptions. | Verified applicable authority, purpose/field-specific permissions, minimization and qualified legal/clinical boundary review. |
| Rotate keys or restore backups without reviewing prior exposure and revocations. | Lost recoverability, resurrected deleted data or repeated external effects. | Key-type-specific incident response, isolated recovery and current privacy/effect reconciliation. |
| Claim compliance or safety from completed documents and tools. | False assurance hides missing controls, limits and operational responsibility. | Evidence-backed release gates, honest residual uncertainty and qualified independent review where required. |

Next: [Chapter 12](../Chapter12.md), specifying the complete Agent runtime under these boundaries: LangGraph states, tool registry, approvals, context/memory, child delegation, cancellation, recovery, budgets and evaluations. Reuse the architecture in [Chapter 5](../Chapter5.md) and carry [Chapter 13 scheduling](../Chapter13.md), [Chapter 14 files](../Chapter14.md), [Chapter 16 trust operations](../Chapter16.md), [Chapter 19 encryption](../Chapter19.md) and [Chapter 20 delivery](../Chapter20.md) into the relevant tools and workflows.

This completes the proposed Chapter 11 security/privacy handoff. Source requirements remain traceable and policy gaps remain open; no vulnerability assessment, encryption implementation, penetration test, live scan, compliance certification or production security is claimed.