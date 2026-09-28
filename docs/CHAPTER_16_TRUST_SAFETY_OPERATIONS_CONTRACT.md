# Chapter 16: Trust, Safety, Governance and Moderation Operations Contract

Status: DRAFT FOR PRODUCT, TRUST OPERATIONS, SECURITY AND PRIVACY REVIEW. This is a design and verification plan, not an implemented moderator console, staffed safety operation, legal procedure or demonstrated incident-response capability.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md), [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [file/document](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) and [discovery](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md) drafts. It develops C15-T12 into policy governance, operator authority, evidence custody and reliable safety operations.

- [Chapter 16](../Chapter16.md) is the source owner. Chapter 15 already defines publication eligibility, report/appeal behavior and current restrictions; this chapter refines operational responsibility without building a second independent enforcement engine. [Chapter 19](../Chapter19.md) and [Chapter 20](../Chapter20.md) remain encryption and notification dependencies.
- A platform role, community administrator, assigned case, service credential, classifier prediction or Agent label is not universal authority over private conversations, health records, files or memory. Access requires current actor/action/target/context/purpose and appropriate case or grant, with narrowly scoped privileged sessions where required.
- The source has complete final architecture and acceptance sections. Preserve those below; added policy, data, transaction, test and runbook details are proposed refinements, not approved law, product choices or operating evidence.
- M1 remains the synthetic ordinary family task and one-time in-app reminder. A later synthetic safety-operations exercise is a separate slice. Public features still need the safety/appeal/operating controls they depend on; a narrow demonstration cannot imply complete platform readiness.
- Preserve all original sources and prior drafts. Continued planning does not authorize code, installs, real reports/evidence, account enforcement, investigation of users/devices, model/provider calls, emergency contact, legal disclosure, provisioning, spending or deployment.
- All authorization, policy, queue, enforcement, audit, moderation, incident, Android/web and security tests are NOT RUN. Document checks and explicitly synthetic state fixtures are not proof of clinical/emergency response, legal compliance, staffing, tamper resistance or production safety.

## 2. Exact Source Topics and Enforcement Principles

All forty-three numbered topic titles and anchors are retained, including the first topic's different heading depth.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C16-S01 | Purpose and Scope | [16.1](../Chapter16.md#L3) |
| C16-S02 | Trust and Safety Objectives | [16.2](../Chapter16.md#L49) |
| C16-S03 | Governance Model | [16.3](../Chapter16.md#L95) |
| C16-S04 | Policy Hierarchy | [16.4](../Chapter16.md#L195) |
| C16-S05 | Community Policy Structure | [16.5](../Chapter16.md#L222) |
| C16-S06 | Enforcement Principles | [16.6](../Chapter16.md#L300) |
| C16-S07 | Enforcement Levels | [16.7](../Chapter16.md#L340) |
| C16-S08 | Enforcement Scope | [16.8](../Chapter16.md#L444) |
| C16-S09 | Moderation Sources | [16.9](../Chapter16.md#L477) |
| C16-S10 | Moderation Case Lifecycle | [16.10](../Chapter16.md#L521) |
| C16-S11 | Case Priority | [16.11](../Chapter16.md#L558) |
| C16-S12 | Moderator Queue Architecture | [16.12](../Chapter16.md#L592) |
| C16-S13 | Moderator Roles | [16.13](../Chapter16.md#L637) |
| C16-S14 | Moderator Authorization | [16.14](../Chapter16.md#L695) |
| C16-S15 | Evidence Management | [16.15](../Chapter16.md#L730) |
| C16-S16 | Privacy-Safe Moderation | [16.16](../Chapter16.md#L784) |
| C16-S17 | Automated Moderation | [16.17](../Chapter16.md#L818) |
| C16-S18 | Human-in-the-Loop Requirements | [16.18](../Chapter16.md#L878) |
| C16-S19 | Appeals Architecture | [16.19](../Chapter16.md#L906) |
| C16-S20 | Appeals Outcomes | [16.20](../Chapter16.md#L957) |
| C16-S21 | Community-Level Moderation | [16.21](../Chapter16.md#L988) |
| C16-S22 | Group Governance | [16.22](../Chapter16.md#L1034) |
| C16-S23 | Agent Trust and Safety | [16.23](../Chapter16.md#L1075) |
| C16-S24 | Agent Misuse Cases | [16.24](../Chapter16.md#L1147) |
| C16-S25 | Spam and Coordinated Abuse Operations | [16.25](../Chapter16.md#L1189) |
| C16-S26 | Fraud and Scam Protection | [16.26](../Chapter16.md#L1239) |
| C16-S27 | Child and Vulnerable User Safety | [16.27](../Chapter16.md#L1287) |
| C16-S28 | Threat and Emergency Handling | [16.28](../Chapter16.md#L1315) |
| C16-S29 | Safety Notifications | [16.29](../Chapter16.md#L1357) |
| C16-S30 | Moderator Quality Assurance | [16.30](../Chapter16.md#L1389) |
| C16-S31 | Safety Analytics | [16.31](../Chapter16.md#L1431) |
| C16-S32 | Safety Incident Management | [16.32](../Chapter16.md#L1487) |
| C16-S33 | Audit Architecture | [16.33](../Chapter16.md#L1546) |
| C16-S34 | Data Retention | [16.34](../Chapter16.md#L1596) |
| C16-S35 | APIs | [16.35](../Chapter16.md#L1712) |
| C16-S36 | Event Contracts | [16.36](../Chapter16.md#L1817) |
| C16-S37 | Android Safety Screens | [16.37](../Chapter16.md#L1867) |
| C16-S38 | Web/Desktop Safety Screens | [16.38](../Chapter16.md#L1925) |
| C16-S39 | Failure Handling | [16.39](../Chapter16.md#L1979) |
| C16-S40 | Security Requirements | [16.40](../Chapter16.md#L2031) |
| C16-S41 | Repository Structure | [16.41](../Chapter16.md#L2063) |
| C16-S42 | Final Architecture Decision | [16.42](../Chapter16.md#L2157) |
| C16-S43 | Acceptance Criteria | [16.43](../Chapter16.md#L2219) |

The nine enforcement principles in section 16.6 retain their exact wording. Reports, predictions, disagreements, suspected violations, confirmed violations and technical errors remain different forms of evidence/state.

| ID | Source enforcement principle |
| --- | --- |
| C16-R01 | Proportionate |
| C16-R02 | Consistent |
| C16-R03 | Explainable |
| C16-R04 | Reversible where appropriate |
| C16-R05 | Auditable |
| C16-R06 | Sensitive to context |
| C16-R07 | Resistant to retaliation |
| C16-R08 | Independent of popularity |
| C16-R09 | Independent of payment or status |

## 3. Exact Governance and Authority Inventory

All six governance-layer labels from section 16.3 are retained in order; they describe responsibilities, not an automatic inheritance of private-data access.

| ID | Source governance layer |
| --- | --- |
| C16-G01 | Platform Governance |
| C16-G02 | Policy and Safety Governance |
| C16-G03 | Operations Governance |
| C16-G04 | Community Governance |
| C16-G05 | Space-Level Moderation |
| C16-G06 | User-Level Controls |

The source policy-precedence labels are `Lawful Platform Requirements`, `Global Platform Safety Policy`, `Regional Policy`, `Community Policy`, `Page or Event Rules`, `User Preferences`, in that order. Lower policy cannot permit what a higher applicable requirement prohibits. Jurisdiction applicability and conflicts require qualified review, not a string ordering interpreted as legal advice.

All eight enforcement level numbers and labels from section 16.7 are preserved as separate columns rather than the source's typographic dash.

| ID | Source level | Source label |
| --- | --- | --- |
| C16-L01 | Level 0 | No Action |
| C16-L02 | Level 1 | Informational Warning |
| C16-L03 | Level 2 | Content Limitation |
| C16-L04 | Level 3 | Content Removal |
| C16-L05 | Level 4 | Feature Restriction |
| C16-L06 | Level 5 | Temporary Account Restriction |
| C16-L07 | Level 6 | Permanent Account Enforcement |
| C16-L08 | Level 7 | Emergency Escalation |

The ten source enforcement scopes are `CONTENT_ONLY`, `COMMENT_ONLY`, `EVENT_ONLY`, `PAGE_ONLY`, `GROUP_ONLY`, `FEATURE_ONLY`, `ACCOUNT_ONLY`, `DEVICE_OR_SESSION`, `NETWORK_ORIGIN`, `PLATFORM_WIDE`. A local rule action does not escalate automatically into a platform ban, and a higher level is not necessarily the next step for every case.

All six role headings in section 16.13 and twelve permission strings in section 16.14 are retained. A role's existence does not imply all twelve permissions.

| ID | Source role |
| --- | --- |
| C16-M01 | Platform Safety Reviewer |
| C16-M02 | Specialized Safety Reviewer |
| C16-M03 | Community Moderator |
| C16-M04 | Appeals Reviewer |
| C16-M05 | Senior Safety Reviewer |
| C16-M06 | Safety Administrator |

| ID | Source permission |
| --- | --- |
| C16-U01 | case.read |
| C16-U02 | case.assign |
| C16-U03 | case.comment |
| C16-U04 | case.request_evidence |
| C16-U05 | case.apply_content_action |
| C16-U06 | case.apply_account_action |
| C16-U07 | case.review_appeal |
| C16-U08 | case.view_private_evidence |
| C16-U09 | policy.read |
| C16-U10 | policy.edit |
| C16-U11 | policy.publish |
| C16-U12 | audit.read |

Sensitive permission use requires the source's MFA, short-lived privileged session, access reason and audit controls; dual approval applies where the reviewed action policy requires it. Assigned-case access, evidence-category clearance, jurisdiction, conflicts and current account/session status still apply. No moderator may search arbitrary private conversations solely through a role or generic case ID.

All five priority codes/descriptions from section 16.11 and ten queue labels from section 16.12 are retained. Priority is not a grant, and these labels do not set numeric response-time promises.

| ID | Source priority | Source description |
| --- | --- | --- |
| C16-I01 | P0 | Immediate danger or critical platform incident |
| C16-I02 | P1 | Severe safety risk or rapidly spreading harmful content |
| C16-I03 | P2 | Significant user or community harm |
| C16-I04 | P3 | Standard moderation issue |
| C16-I05 | P4 | Low-risk policy or quality issue |

| ID | Source queue |
| --- | --- |
| C16-N01 | Safety Queue |
| C16-N02 | Spam Queue |
| C16-N03 | Fraud Queue |
| C16-N04 | Privacy Queue |
| C16-N05 | Child Safety Queue |
| C16-N06 | Account Integrity Queue |
| C16-N07 | Agent Safety Queue |
| C16-N08 | Copyright Queue |
| C16-N09 | Appeals Queue |
| C16-N10 | Legal Request Queue |

The following source inventories retain order without adopting one combined lifecycle. Child/parent relationships, grant scope and action state need canonical schemas before implementation.

| Source list | Values in source order |
| --- | --- |
| Trigger sources, 16.9 | USER_REPORT, AUTOMATED_CLASSIFIER, MODERATOR, SECURITY_SYSTEM, AGENT_GUARDRAIL, LEGAL_REQUEST, APPEAL, ADMIN_REPORT |
| Main case lifecycle, 16.10 | NEW, TRIAGED, QUEUED, ASSIGNED, UNDER_REVIEW, ACTION_PENDING, ACTION_APPLIED, NOTIFIED, APPEAL_WINDOW, CLOSED |
| Appeal outcomes, 16.20 | UPHELD, PARTIALLY_REVERSED, FULLY_REVERSED, ACTION_REDUCED, ACTION_EXTENDED, INSUFFICIENT_EVIDENCE, DUPLICATE_APPEAL, OUT_OF_SCOPE |
| Join policies, 16.22 | OPEN, REQUEST_TO_JOIN, INVITE_ONLY, APPROVAL_REQUIRED, TEMPORARY, CLOSED |
| Posting policies, 16.22 | ANY_MEMBER, APPROVED_MEMBERS, MODERATOR_ONLY, OWNER_ONLY, AGENT_ASSISTED |
| Agent enforcement, 16.24 | Pause Run, Revoke Tool, Invalidate Approval, Quarantine Output, Disable Agent, Require Human Review, Revoke Session |
| Incident lifecycle, 16.32 | Detected, Classified, Assigned, Contained, Eradicated, Recovered, Reviewed, Closed |

The six source alternative case transitions are `NEW -> DUPLICATE`, `NEW -> INVALID`, `UNDER_REVIEW -> ESCALATED`, `ACTION_APPLIED -> APPEALED`, `APPEALED -> RESTORED`, `APPEALED -> UPHELD`; arrows are normalized to ASCII. Notification, appeal and restriction state will be modeled separately so this illustrative chain cannot block appeals until message delivery or undo other active restrictions.

## 4. Exact Final Design and Acceptance

All seventeen final-design items in section 16.42 are preserved verbatim.

| ID | Source final design item |
| --- | --- |
| C16-B01 | Versioned policy registry |
| C16-B02 | Structured enforcement actions |
| C16-B03 | Case-based moderation |
| C16-B04 | Specialized queues |
| C16-B05 | Least-privilege moderator roles |
| C16-B06 | Evidence snapshots |
| C16-B07 | Automated classification with human review |
| C16-B08 | Independent appeals |
| C16-B09 | Group-level delegated moderation |
| C16-B10 | Agent-specific safety controls |
| C16-B11 | Spam and fraud detection |
| C16-B12 | Emergency escalation |
| C16-B13 | Immutable audit trails |
| C16-B14 | Privacy-preserving evidence access |
| C16-B15 | Safety analytics |
| C16-B16 | Incident management |
| C16-B17 | Regional and multilingual support |

All twenty-three acceptance criteria in section 16.43 are retained verbatim. They state required capabilities, not achieved outcomes.

| ID | Source acceptance criterion |
| --- | --- |
| C16-A01 | Policies are versioned and auditable. |
| C16-A02 | Reports create structured cases. |
| C16-A03 | Cases have priority and queue assignment. |
| C16-A04 | Moderators have scoped permissions. |
| C16-A05 | Private data is not broadly exposed during review. |
| C16-A06 | Automated classifiers produce reason codes and confidence. |
| C16-A07 | High-risk cases receive human review. |
| C16-A08 | Enforcement is scoped and proportionate. |
| C16-A09 | Users receive clear enforcement notifications. |
| C16-A10 | Appeals are supported. |
| C16-A11 | Appeals are independently reviewable. |
| C16-A12 | Group moderators cannot override platform policy. |
| C16-A13 | Agent actions are governed by risk-based controls. |
| C16-A14 | Spam and coordinated abuse are detected. |
| C16-A15 | Fraud and suspicious links are handled. |
| C16-A16 | Emergency escalation exists. |
| C16-A17 | Moderator actions are audited. |
| C16-A18 | Evidence retention is controlled. |
| C16-A19 | Safety incidents have a lifecycle. |
| C16-A20 | Android and web safety workflows are implemented. |
| C16-A21 | Queue backlog and reviewer quality are measurable. |
| C16-A22 | Classifier, policy, and audit failures have safe fallbacks. |
| C16-A23 | The platform can investigate and recover from major safety incidents. |

### APIs and Events

The twelve method/path pairs from section 16.35 are preserved; repeated report/case routes in Chapter 15 refer to the same domain service, not a second implementation.

| ID | Source operation |
| --- | --- |
| C16-P01 | `POST /v1/reports` |
| C16-P02 | `GET /v1/reports/{report_id}` |
| C16-P03 | `POST /v1/appeals` |
| C16-P04 | `GET /v1/appeals/{appeal_id}` |
| C16-P05 | `GET /v1/moderation/queues/{queue_id}/cases` |
| C16-P06 | `GET /v1/moderation/cases/{case_id}` |
| C16-P07 | `POST /v1/moderation/cases/{case_id}/actions` |
| C16-P08 | `POST /v1/moderation/cases/{case_id}/restore` |
| C16-P09 | `POST /v1/spaces/{space_id}/moderators` |
| C16-P10 | `DELETE /v1/spaces/{space_id}/moderators/{user_id}` |
| C16-P11 | `GET /v1/agents/{agent_id}/safety-status` |
| C16-P12 | `POST /v1/agents/{agent_id}/pause` |

The three event types in the JSON examples of section 16.36 are retained. Source envelope/state spelling is illustrative and must be reconciled with Chapter 7; the audit example `moderation.action.applied` is a separate audit-stream example, not a fourth ordinary client event or interchangeable spelling.

| ID | Source event type |
| --- | --- |
| C16-E01 | safety.report.created |
| C16-E02 | safety.enforcement.applied |
| C16-E03 | safety.appeal.resolved |

### Client Inventories

All twenty-six Android labels from section 16.37 and eight user-facing web labels from section 16.38 are preserved.

| ID | Source category | Source Android surface |
| --- | --- | --- |
| C16-C01 | User Screens | Community guidelines |
| C16-C02 | User Screens | Report content sheet |
| C16-C03 | User Screens | Report confirmation |
| C16-C04 | User Screens | Report status |
| C16-C05 | User Screens | Account restriction screen |
| C16-C06 | User Screens | Content removal explanation |
| C16-C07 | User Screens | Appeal form |
| C16-C08 | User Screens | Appeal status |
| C16-C09 | User Screens | Safety center |
| C16-C10 | User Screens | Blocked accounts |
| C16-C11 | User Screens | Muted topics |
| C16-C12 | User Screens | Privacy complaint form |
| C16-C13 | User Screens | Suspicious-link warning |
| C16-C14 | User Screens | Agent action approval |
| C16-C15 | User Screens | Agent safety status |
| C16-C16 | Moderator Screens | Moderation queue |
| C16-C17 | Moderator Screens | Case details |
| C16-C18 | Moderator Screens | Evidence viewer |
| C16-C19 | Moderator Screens | Policy reference |
| C16-C20 | Moderator Screens | User and content context |
| C16-C21 | Moderator Screens | Action selector |
| C16-C22 | Moderator Screens | Escalation screen |
| C16-C23 | Moderator Screens | Appeal queue |
| C16-C24 | Moderator Screens | Audit history |
| C16-C25 | Moderator Screens | Reviewer workload |
| C16-C26 | Moderator Screens | Incident dashboard |

| ID | Source web user surface |
| --- | --- |
| C16-H01 | Safety center |
| C16-H02 | Community guidelines |
| C16-H03 | Report history |
| C16-H04 | Appeals dashboard |
| C16-H05 | Account enforcement details |
| C16-H06 | Privacy and personalization controls |
| C16-H07 | Agent permissions |
| C16-H08 | External communication approvals |

The source moderator-workspace areas are `Left Panel: Queues and filters`, `Center: Case evidence and context`, `Right Panel: Policy, action, history, and escalation`, `Bottom: Audit trail and reviewer notes`. Its required capabilities are `Keyboard navigation`, `Bulk triage for low-risk cases`, `Case locking`, `Assignment`, `Internal notes`, `Evidence redaction`, `Appeal review`, `Policy version comparison`. These are workflow requirements, not implemented screens or a requirement to squeeze four simultaneous panels onto a phone.

### Security and Retention Inventories

All fifteen security requirements from section 16.40 remain verbatim.

| ID | Source security requirement |
| --- | --- |
| C16-Q01 | Separate user, moderator, administrator, and service identities. |
| C16-Q02 | Require privileged authentication for moderator actions. |
| C16-Q03 | Use case-scoped access. |
| C16-Q04 | Encrypt sensitive evidence. |
| C16-Q05 | Redact unnecessary personal information. |
| C16-Q06 | Protect moderation APIs from enumeration. |
| C16-Q07 | Prevent moderators from exporting unrestricted datasets. |
| C16-Q08 | Apply rate limits to reports and appeals. |
| C16-Q09 | Detect report brigading. |
| C16-Q10 | Prevent users from discovering reporter identity. |
| C16-Q11 | Protect classifier endpoints from adversarial probing. |
| C16-Q12 | Log policy and permission changes. |
| C16-Q13 | Require approval for high-impact enforcement. |
| C16-Q14 | Secure agent safety controls against prompt injection. |
| C16-Q15 | Use immutable audit records. |

All ten data/handling pairs from section 16.34 are retained. These qualitative suggestions are not approved numerical retention or a legal basis to retain every case indefinitely.

| ID | Source data | Source suggested handling |
| --- | --- | --- |
| C16-O01 | Active moderation case | Retain while open |
| C16-O02 | Closed case | Retain according to policy and legal requirements |
| C16-O03 | Evidence snapshot | Limited retention |
| C16-O04 | User report | Retain for case and abuse analysis |
| C16-O05 | Moderator notes | Restricted retention |
| C16-O06 | Audit logs | Longer retention with access controls |
| C16-O07 | Raw classifier features | Minimize and expire |
| C16-O08 | Search history | User-controlled limited retention |
| C16-O09 | Deleted content | Remove from normal systems and retain only where justified |
| C16-O10 | Appeal records | Retain according to enforcement and legal needs |

## 5. Decisions and Operating Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C16-D01 | Applicable policy registry | Stable policy keys and immutable approved versions, typed precedence/applicability and explicit effective intervals; human-readable localization cannot silently change enforcement semantics. | PROPOSED |
| C16-D02 | Operator authorization | Current action/target/case/assignment/category/purpose checks in domain services, independently of role labels and operator UI. | PROPOSED |
| C16-D03 | Privilege assurance and emergency access | Select workforce identity/MFA, step-up freshness, bounded privileged grants, dual-control rules, device/credential custody and exceptional-access process. No existing unrestricted administrator role is assumed. | OPEN |
| C16-D04 | Evidence custody | Exact immutable snapshots/versions, minimal context, safe rendering, provenance and current time-limited field/category access; a snapshot does not create permission to collect everything. | PROPOSED |
| C16-D05 | Automation and high-risk review | Select policy categories, calibrated language/capability thresholds, allowed automated restrictions, required human decisions and safe outages. Confidence alone does not authorize enforcement. | OPEN |
| C16-D06 | Queue and staffing commitments | Define severity/priority clocks, skill/jurisdiction matching, assignment/fairness/escalation, reviewer capacity/wellbeing and measured review/appeal targets. | OPEN |
| C16-D07 | Reliable enforcement effects | Exact target revision and action scope, independent restrictions, stable decision/effect receipts, current gates and durable audit/outbox with honest partial/unknown downstream work. | PROPOSED |
| C16-D08 | Independent appeals and restoration | Review the actual action with conflict separation; overturning one restriction cannot undo later deletion, another restriction or a new source revision without current validation. | PROPOSED |
| C16-D09 | Community and Agent delegation | Scoped grant/revocation through existing Space/Agent authorities, no local override of higher policy and no Agent self-grant, audit deletion or prohibited MVP action. | PROPOSED |
| C16-D10 | Privacy, evidence retention and lawful access | Resolve jurisdictions/ages/representatives, private-message/E2E evidence, legal holds, retention by artifact and supported data rights before real cases. | OPEN |
| C16-D11 | Emergency, vulnerability and fraud response | Select qualified human procedures, escalation contacts, authority/capability, regional obligations and truthful communications; no automatic emergency-service or medical/legal response promise. | OPEN |
| C16-D12 | Notifications and user experience | Shared typed report/case/action/appeal projections, minimized versioned explanations and current authorized delivery; keep sensitive internal notes separate from user-facing status. | PROPOSED |
| C16-D13 | Audit and incident recovery | Separate mandatory durable security evidence from optional telemetry, bounded fail-safe behavior and isolated recovery that reapplies current restrictions/revocations before service. | PROPOSED |
| C16-D14 | Quality and release evidence | Choose independent review rubrics, language/region cohorts, versions, metric definitions, abuse/retaliation checks and required drills/capacity evidence before launch. | OPEN |

These eight proposals and six open decisions remain unapproved. Legal/security requirements and required access controls cannot be waived by a role, classifier, urgent label, backlog target or planning continuation.

## 6. Operational Ownership and Integrity Rules

### Separate Records and Authority

| Record group | Responsibility | Required boundary |
| --- | --- | --- |
| Policy key/version/publication | Approved semantics, applicable scope/jurisdiction, action allowlist, effective interval and translated guidance. | Editing is not publishing; applicable old/new versions and supersession/revocation must be traceable. |
| Operator identity/privileged grant | Workforce account, authentication assurance, bounded permission/case/purpose, expiry and revocation. | Ordinary user login, community role, service identity and workforce administration are separate authorities. |
| Report and case | Typed source/target/parent, reported revision, trigger, priority, queue, related cases and progress. | User report, classifier allegation and confirmed finding are not interchangeable; deduplication cannot erase independent evidence. |
| Assignment and review attempt | Qualified reviewer, conflict checks, lease/fence, expected case version and handoff. | A UI lock prevents accidental overlap only; database/action preconditions arbitrate concurrent decisions. |
| Evidence manifest/artifact | Exact source version, acquisition purpose, integrity/chain of custody, classification, redaction and retention. | Stable evidence does not mean every reviewer may read it or that its contents are true. |
| Classification/recommendation | Model/rule/input/evidence version, reason codes, uncertainty and allowed proposed actions. | Classification never supplies its own enforcement credential or bypasses required human review. |
| Decision/action/restriction | Exact target/action/scope/duration/policy, approvals and durable effect receipts. | Multiple independent restrictions coexist; one appeal or expiry cannot clear them all. |
| Appeal and resolution | Particular decision, appellant, new context, independent review and outcome. | Case closure, notification delivery, appeal eligibility and enforcement expiry are different clocks. |
| Incident and communications | Commander, severity, bounded containment, timeline, hypotheses, verification and action owners. | Urgency cannot create access, legal authority or an automatic emergency-contact capability. |
| Audit/retention/deletion | Required immutable event evidence, custody, holds, expiry, purge and isolated recovery. | Retaining a case for a lawful purpose never restores ordinary publication or general moderator access. |

Reuse Chapters 6/11/15 authorities and constraints, with composite typed target/case/source-version references, durable outbox/jobs and explicit audit ownership. Avoid a generic administrator endpoint that directly updates every domain's status. Source section 16.41 module names describe responsibilities; they neither create files here nor require a separate microservice fleet or a competing monorepo layout.

The source case chain is an explanatory lifecycle, not a single blocking transaction. Report acceptance, evidence acquisition, review, enforcement effects, notification, appeal and cleanup can advance independently with explicit dependencies. A delivered notification is not required to durably accept a permitted appeal, and a provider outage cannot make a committed restriction disappear. Record each domain transition with its own version and authority.

### Trust Operations Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C16-K01 | Policies are applicable approved versions, not mutable prose. | Stable keys, reviewed publication/effective intervals, precedence and explicit current fallback/revocation policy. |
| C16-K02 | Roles do not replace current case/action authorization. | Actual workforce/community/service principal, target/assignment/category/purpose and current policy in every domain request and worker. |
| C16-K03 | Privilege and dual approval are bounded and independent. | Server-validated assurance/grant/expiry, separate qualified approvers and exact intent/version; no self-escalation through UI or case text. |
| C16-K04 | Intake is durable and evidence is not a verdict. | Stable report/case identities, source provenance, idempotency and safe anti-enumeration/retaliation controls. |
| C16-K05 | Queue assignment is qualified, versioned and fair. | Severity/skill/language/jurisdiction/conflict checks, fenced leases and audited escalation rather than popularity-only routing. |
| C16-K06 | Evidence is minimal, immutable by version and currently protected. | Purpose-bound acquisition, integrity/lineage, redacted safe viewers, category/time-limited grants and no unrestricted exports. |
| C16-K07 | Classifiers propose within policy; people review required cases. | Actual input/model/policy capability, calibrated uncertainty, deterministic executor and explicit outage behavior. |
| C16-K08 | Enforcement scope and logical effects are durable. | Exact target/revision, restriction identity, version/preconditions, audit/outbox and current downstream gates; no universal exactly-once external promise. |
| C16-K09 | Appeal resolution changes only authorized restrictions. | Independent reviewer, action-specific outcome, current source/owner/other constraints and controlled restoration. |
| C16-K10 | Delegated community and Agent powers remain subsets. | Target-aware grant/revocation and higher-policy limits; no private-memory access, arbitrary exports or prohibited MVP powers. |
| C16-K11 | Vulnerability and urgency do not grant unchecked action. | Qualified human procedures, appropriate age/representative model, documented escalation authority and no unsupported emergency-service promises. |
| C16-K12 | User notices and status are truthful minimized projections. | Current recipient/version/purpose, localized policy explanation, protected reporter/reviewer details and honest queued/delivered/pending state. |
| C16-K13 | Mandatory audit exists before sensitive disclosure or effect. | Durable minimal access/action intent at the defined boundary, protected custody and bounded reconciliation; optional telemetry cannot substitute. |
| C16-K14 | Retention, revocation and recovery preserve restrictions. | Current eligibility exclusion, lineage purge/holds, grant expiry and isolated restore before new reads/actions. |
| C16-K15 | Operators and clients share domain truth and accessible controls. | Typed scoped API/event state, conflict handling, protected sessions/caches and no client-only authority or fake success. |
| C16-K16 | Quality, capacity and incidents require real evidence. | Independent judgments, meaningful denominators, private metrics, staffed escalation, bounded degraded modes and tested recovery. |

## 7. Policy, Privilege and Case Admission

### C16-W01 Draft, Approve, Publish and Retire Policy

Separate policy authoring, review/approval, activation and operational enforcement. Keep a stable policy key with immutable revisions and typed actions, scopes, jurisdiction/age applicability, severity, exceptions, required approvals/review, appeal policy and effective interval. Store human guidance and localized examples alongside machine-readable semantics; translated prose cannot silently alter the allowed action. A community rule can narrow conduct within its authority but not grant what higher applicable policy prohibits.

Validate schema, conflicting/overlapping applicability, precedence, planned effect, compatibility and required qualified legal/product/security review before publication. Distinct `policy.edit`, `policy.publish` and role-management authority prevent one content editor from deploying a platform-wide rule or granting itself publication rights. High-impact changes require the reviewed separation of duties, exact revision approvals and rollout/rollback plan. Record actor, actual approver, policy digest/version, effective time and mandatory audit intent durably.

Evaluate an enforcement decision against the explicit applicable policy version and its evidence/target time; document whether a changed rule affects an existing case, ongoing restriction or only future conduct. Do not retroactively relabel every old case using a new classifier. Urgent protective policy changes can require controlled re-evaluation, with stable action identity and user explanation. Legal precedence is a reviewed applicability problem, not automatically resolved by the diagram's vertical order.

During policy-service failure, only a verified, still-approved, unrevoked, compatible cached version within its accepted staleness/effective window is eligible. Record fallback mode and the version used. Unknown freshness, revocation, jurisdiction or required control means restrict/defer the affected sensitive action, not use an arbitrary last response forever. Restoring synchronization cannot resurrect a retired rule or drop currently active restrictions without the approved migration decision.

### C16-W02 Establish and Recheck Narrow Operator Privilege

Authenticate the workforce operator independently from ordinary user and service identities, using reviewed MFA and session controls. Bind a privileged grant to the actual account/session, permissions, case or bounded queue task, evidence category, purpose/reason, expiry and revocation epoch. Backend checks assurance/freshness; a user-entered reason or a client 'MFA complete' flag is not proof. Role onboarding/offboarding, recovery, contractor expiry and device/session compromise have explicit privilege-revocation paths.

For every read, export, decision, worker execution and long-lived viewer/download, check current role/grant, assignment/jurisdiction/category, conflict, target/parent and time. Reevaluate after lock waits or queued delays; PostgreSQL transaction-start `now()` is not necessarily the current time needed for expiry. A case assignment authorizes only permitted work on that case, not arbitrary searches through the reporter's family or full conversation history. Distinguish redacted case metadata, raw private evidence, action authority and audit access.

Dual approval binds the exact action/policy/target/version/scope/duration and remains valid only for distinct eligible human principals with no prohibited conflict. Two sessions, role labels or Agent identities controlled by one approver do not supply independence. Changing material intent invalidates prior approval; old request receipts cannot leak revoked evidence. No actor may grant itself a broader moderator role, approve its own sensitive access through an editable case, or use an automation account to avoid separation.

Any emergency or break-glass path is a separately approved, narrow, time-bounded and audited process with qualified authority and prompt independent review. It does not bypass applicable law, encryption capability, subject protections or required evidence capture. No such credential/provider/process is configured by this document. When required assurance/grant/audit evidence cannot be established, deny the sensitive operation and expose a safe pending/escalation path rather than manufacture success.

### C16-W03 Accept Reports and Create Typed Cases

Treat user/moderator reports, automated safety/security signals, Agent guardrails, trusted-partner referrals, legal requests and appeals as different authenticated or validated sources with their own trust level. A legal-request label is not proof of authenticity, jurisdiction or authority; route it to qualified verification before disclosure. Data-protection/support complaints need their correct domain procedure instead of being treated automatically as content violations.

Validate target type/ID/parent and evidence references under the reporter's permitted view/submission model without confirming hidden resources through errors, counters or status. Record alleged source revision and reporter context. Accept a minimized complaint when the referenced content is no longer available under the supported flow, without pretending to have captured evidence or granting the reporter new access. Case context cannot be broadened merely because an arbitrary private ID is in report text.

Commit report receipt, structured case or explicit linked-case outcome, required audit and queue/evidence work durably before acknowledgment. A 202 means preserved pending work, not a finding or action. Stable request keys prevent duplicate submissions; similarity clustering can combine investigation work while preserving each independent report/evidence and appropriate status visibility. Rate limits and report-brigading detection protect capacity but cannot automatically classify the reported user as guilty or silently discard urgent distinct evidence.

Record source, evidence availability, alleged versus confirmed facts and actual transition history. A report, model score, disagreement, policy dispute and technical error are not interchangeable findings. Separate user-facing receipt/status from confidential case assignment, reviewer identities, other reporters, internal signals and private notes. Attachments/links are untrusted and follow the Chapter 14 scan/immutable-version rules; no automatic network fetch or Agent instruction execution from a report.

## 8. Queue Assignment and Evidence Custody

### C16-W04 Triage, Assign and Escalate Qualified Work

Triage uses severity, credibility, immediacy, scale, vulnerable-user indicators under the approved age model, legal deadlines and distribution risk. Popularity/wealth/payment/status or a single report count cannot decide priority. Keep initial and current priority/reason history; source P0 through P4 are categories, not response-time guarantees. Define clocks for intake, triage, review, temporary protection, appeal and legal deadlines separately, with business-calendar versus continuous-time semantics where relevant.

Route to the appropriate queue by policy category, region/language, evidence clearance and reviewer skill, then apply conflict-of-interest and workload controls. Queue listing reveals only eligible case metadata; assignment does not automatically unlock private evidence. Restricted categories use authorized reviewer pools and safe exposure defaults. Backlog aging/fairness and explicit escalation keep lower-priority work from vanishing without making it permissible to downgrade quality or assign untrained reviewers.

Use durable assignment versions and bounded leases/fences. An expired case lock, crashed browser or reassignment can transfer work, but a stale original reviewer cannot submit against a newer case/target version. Preserve drafts/notes under scope and do not allow a UI heartbeat alone to lock a case indefinitely. Bulk triage is an explicit bounded low-risk operation with per-case eligibility/revision/outcome receipts and confirmation, not a mass high-impact action under one broad approval.

Measure staffing/capacity and escalation coverage before enabling a policy dependent on human response. Temporary containment requires defined authority, scope, duration and review; queue congestion is not an indefinite-ban policy. Operator wellbeing, exposure management, breaks and supervised handoffs are part of the process, not only throughput optimization. No live review service or 24-hour monitoring coverage is claimed here.

### C16-W05 Acquire, Inspect, Redact and Retire Evidence

Capture only relevant authorized source revisions in a stable evidence manifest: original/derived object versions, acquisition actor/source/purpose/time, permitted context, integrity digest, transformation and retention policy. A digest detects mismatch to recorded bytes; it does not prove truthful content, lawful acquisition or complete chain of custody. Later source edits cannot overwrite the reviewed snapshot, but a snapshot also cannot turn unrelated private history into permitted evidence.

Separate reported excerpts, platform-verified source metadata, classifier output, translations, reviewer notes and factual findings. Record coverage/missingness and original language; qualified review must account for context, satire/quotation and translation/OCR uncertainty rather than converting tool confidence into truth. Redactions and translations are versioned derivatives tied to the protected original; they must preserve the meaning necessary for review without unnecessarily exposing medical, identity, location, financial or relationship data.

Gate raw/private evidence by current case, category, purpose, field-level grant, reviewer assurance and expiry. Prefer redacted views by default. Use short-lived revocation-aware viewer/download paths and isolated media rendering; presigned GET TTL alone does not provide immediate revocation. Record a durable minimal access intent before sensitive bytes leave the boundary and reconcile outcome/partial transfer; a browser click or full-page-render callback is not reliable proof of all access. Already delivered bytes cannot be recalled.

Do not auto-load external links, trackers or images in reports; released link inspection must use the bounded SSRF/egress controls from Chapter 11. Malicious media and attachments stay quarantined or enter a specially authorized isolated reviewer path, not ordinary app-origin rendering. Restrict screenshots/downloads/exports where supported, while accurately stating that a viewer cannot technically prevent every form of recording. No unrestricted dataset export or private-user search endpoint exists merely because a moderator needs case context.

For private messages/E2E, select the explicit reporting/plaintext-disclosure model before support. User-provided excerpts reveal only supplied permitted evidence and do not grant server decryption of other messages. Agent memory is not exposed by default; a scoped operational trace is not permission to retrieve intimate preferences or raw reasoning. Retained evidence, notes, credentials and legal-request material have separate custody/access/retention; holds are explicit, reviewed and bounded by applicable duty, not an excuse to retain all raw features forever.

Expire grants and remove normal eligibility before asynchronous derivative purge. Track originals, redactions, translations, classifier inputs/results, exports, cached viewer pages, notes and evidence references through the Chapter 14 lineage/deletion process. A lawful retained case snapshot remains restricted even when the public source was deleted. The ten source retention recommendations need approved durations, legal basis, hold release and actual purge/recovery evidence before real cases.

## 9. Classification and Reliable Enforcement

### C16-W06 Classify, Recommend and Obtain Required Human Review

Choose reviewed deterministic rules and classifiers for the released policy categories and supported languages/modalities. Input manifests identify exact source/evidence versions, available context, redaction, model/rule/provider version and purpose. Approval to investigate a case is not blanket approval to upload its private evidence to an external classifier. Provider retention/region/training/capability and prompt-injection boundaries apply before any input leaves the platform.

Return typed findings, reason codes, uncertainty and an allowed recommendation. Validate output schema and policy compatibility; text cannot nominate arbitrary SQL, credentials or domain actions. A high confidence score is not a calibrated finding across every category/language, and missing input or unseen media cannot be declared reviewed. Stable inference/work identity, bounded attempts/cost and protected trace references prevent replay from multiplying cases or silently choosing a weaker fallback.

The source confidence bands permit bounded automatic limited action only for an approved low-severity policy; low confidence, conflicting signals and required context lead to human review, while high severity can require authorized temporary containment and urgent escalation. High/unknown required-risk classification never becomes low-risk simply because a model is unavailable. Deterministic rules can continue only within their approved coverage. Queue backlog does not lower the threshold or remove the review requirement.

Human reviewers examine relevant original context, evidence quality, policy application and alternate interpretations, including satire, quotation, public-interest material and vulnerable users. Their decision records reasoning sufficient for review without requiring or exposing a model's hidden chain-of-thought. Required high-impact review is an actual qualified human decision, not clicking the classifier's recommendation without inspection. Material changes, new contradictory evidence or stale policy/target state require revalidation rather than reuse of an old review.

### C16-W07 Apply, Expire or Reconcile a Scoped Restriction

An enforcement command names the particular case/decision, target type/ID/parent and expected revision, policy version, action, scope, duration/expiry, reason, approver set and logical effect key. Validate current actor/assignment/grant/assurance, applicable policy and required independent approvals at commit. A group-level complaint cannot become a platform-wide suspension through a changed scope field. High-impact effects require the approved action-specific authorization even when a service or emergency queue initiates the workflow.

Persist decision history, independent restriction/effect identity, expected state transition, required audit and durable downstream work together within the owning transaction boundary. Use optimistic version checks or appropriate serialization to arbitrate concurrent reviewers, appeals and target edits. A stale action is rejected/reviewed, not silently applied to a new revision. Distinguish an exact idempotent retry from a changed action under the same key; returning an old receipt still requires current permitted disclosure.

When restrictions span domains, define the effective-denial boundary and partial execution explicitly. A central current restriction can deny new permitted checks before asynchronous search/media/session/Agent cleanup completes; each relevant domain must actually consult or synchronize that authority under a tested protocol. Database status changes alone do not prove every access path stopped. Track per-effect receipts, failures and reconciliation without claiming an atomic distributed transaction or universal exactly-once external effect.

Feature/account restrictions must specify what remains available, such as account-security recovery, safety notices, data rights or appeals through a deliberately narrow path. Do not grant unrestricted ordinary sessions to make an appeal accessible, or lock a restricted person out of every permitted appeal route. Session/device/network actions use actual scoped identities and reviewed collateral-impact limits; shared household devices or network addresses are not a reliable one-person identity.

Restrict new work at the defined current authorization/commitment boundary. Already sent provider messages, delivered bytes and in-flight irreversible effects may need reconciliation or a separate authorized compensating action; an Agent pause or case cancellation is not magical recall. Delayed callbacks record actual outcomes without restarting cancelled work. Temporary restriction expiry uses authoritative current time even when a cleanup worker is down, removes only that restriction and cannot override a later/independent restriction or deletion.

## 10. Appeals and Delegated Safety Controls

### C16-W08 Receive, Review and Resolve an Action-Specific Appeal

Accept an appeal for its particular decision/action under the released eligibility/window policy, recording appellant, reason/context and permitted evidence. Durable receipt and pending state precede asynchronous review; retries return the same permitted appeal. If the review service is unavailable but durable intake is healthy, preserve the submission and queue work. If intake cannot commit, report failure/retry honestly rather than falsely show received. Notification failure cannot itself prevent a valid appeal submission.

Assign an eligible appropriately independent reviewer with jurisdiction/category clearance and conflict checks. The original decision-maker cannot satisfy a required independent review through another role/session, and an Agent does not constitute a second human. Where the source's 'where possible' independence language requires a staffing exception, define and disclose the approved escalation procedure; do not silently self-review a severe action. Rate-limit repeated identical appeals without discarding materially new evidence or preventing required legal rights.

The eight source outcomes describe the appeal result, not a universal content state. Record which restriction is upheld, reduced, reversed or otherwise changed, with exact affected scope/duration. `INSUFFICIENT_EVIDENCE` needs an explicit policy result for the active action rather than pretending it means guilty or harmless by default. `ACTION_EXTENDED` requires a documented independent policy basis, notice and applicable further review; filing an appeal alone cannot justify retaliation. New misconduct belongs to an appropriately linked distinct finding/action.

Resolve against current case/action/source/policy versions and apply reversal through the same idempotent domain effect protocol. Restore only after checking owner intent, deletion, current content/media eligibility, other account/parent restrictions, membership/grants and applicable rules. Overturning restriction A leaves restriction B active. A removed person is not automatically readmitted, and revoked invitations/Agent approvals/provider sends are not recreated just because a case outcome changed.

Provide a minimized outcome, applicable category, general reason, action still active and permitted next step. Keep internal notes, reviewer identity where protected, reporter details and detection thresholds out of the response. Recompute affected discovery state under current eligibility rather than forcing prior reach or training signals back into place. Maintain controlled correction/decision history and retention; case closure is not proof all purge/notification/compensation jobs have completed.

### C16-W09 Govern Community Delegation and Contain Agent Misuse

Community owners/moderators operate only on assigned page/Space/event resources and permitted targets under Chapters 3/18. Role grants, revocations and transfers require actual grantor authority and target-aware constraints; no self-promotion, peer/owner override or platform ban through a local role endpoint. Domain membership/history, conversation/file grants and subject consent remain separate. Delegating moderation does not expose private Agent memory, every family health record, unrestricted exports or unrelated conversations.

The source join/post policy enums describe policy choices, not permission to make existing private Spaces public. Reconcile OPEN/TEMPORARY/APPROVAL_REQUIRED with the canonical admission/expiry states, couple capacity, solo ownership and actual history rules; posting `AGENT_ASSISTED` never means autonomous unrestricted publication. Local rules are versioned and communicated under their scope, can be stricter where allowed, and cannot override higher policy or required appeal rights. Revocation affects pending moderator actions and cached case views at current gates.

Agent identity, owner, scope, allowlist, approval, budget, maximum steps/time and memory boundaries come from Chapter 12's shared runtime. The source risk examples are LOW (read public information, summarize, classify), MEDIUM (drafts, non-sensitive events, tasks), HIGH (external messaging, membership changes, sharing), CRITICAL (medical, financial, legal, irreversible actions). These are illustrative classifications; actual resource/data/recipient/effect determines risk. Generic approval for a critical source example does not legalize diagnosis/dosage changes, unsupported emergency contact or other forbidden MVP Agent capabilities.

Detect and record attempts at unauthorized access, prompt injection, fabricated evidence/completion, approval bypass, unbounded loops, exfiltration, manipulative messages and child-Agent scope escalation. The safety layer uses trusted configuration and deterministic tool policy; reports, evidence or another Agent's output cannot reconfigure it. Explicit operator/owner authority can pause a run, revoke a tool/session/delegation, invalidate exact approvals, quarantine output, disable an Agent or require human review through the source control types.

Contain parent and applicable child work, schedules/standing grants and pending external effects according to their actual ownership/policy; pausing a transient Agent does not automatically cancel every independently approved reminder. Recheck current grants at resumed runs and tool commits. Review the cause and remaining permissions before restart; revoked tools/approvals do not silently return from a checkpoint or configuration rollback. Agent failure investigation uses narrowly scoped operational evidence rather than unrestricted private context or raw reasoning.

## 11. Specialized Safety and Incident Response

### C16-W10 Handle Abuse, Fraud, Vulnerability and Urgent Escalation

Combine approved behavioral/security evidence under a minimized lawful purpose; account age, report volume, one device/IP signal or popularity is not proof of misconduct. Deduplicate and cap coordinated contributions while preserving legitimate shared-device, household, new-user and language-community behavior. Progressive challenges, rate limits, feature restrictions and investigation require bounded collateral-impact and review/appeal rules. Network mitigation is a separately authorized infrastructure action, not a moderator text field.

Fraud reports, suspicious links/QR targets, account impersonation, contribution changes and organizer claims retain documented provenance and uncertainty. Verified indicators state what was verified; they do not certify honesty or endorse a fundraiser/product. Use approved bounded isolated link inspection without ambient credentials or arbitrary network access, and do not log sensitive query strings/credentials. Warn/block under policy with minimal actionable wording; do not publicly label an account fraudulent solely from a heuristic, nor introduce payment or contribution functionality through this safety contract.

Child and vulnerable-user protections use the declared/verified age and legally appropriate representative model, not casual conversation, a family label or a moderator's guess. Decide age-appropriate contact/discovery/location/Agent restrictions and specialist evidence access before the relevant release. A supposed guardian must not automatically receive private content or reports, particularly where that disclosure could create risk. Qualified safeguarding/legal procedures govern sensitive preservation/escalation; routine model or support tooling does not receive unnecessary sensitive material.

Urgent cases follow detection, authorized immediate containment, senior review, evidence preservation, temporary protection, required escalation, authorized notification, documented decision and post-incident review. Agree qualified contacts, jurisdiction, on-call coverage, authority and deadlines before promising response. Preserve evidence while minimizing exposure, with exact audit/effect records for containment. Pre-authorized reversible protection is not a bypass for irreversible enforcement, unlogged access or indiscriminate account/network restrictions.

The platform and Agent must not claim continuous emergency monitoring, automatic medical triage, law-enforcement contact or guaranteed rescue. Approved user-facing messaging may direct people to appropriate local emergency services when needed; any actual contact or legal disclosure requires the separately designed authorized workflow and verified destination. Do not infer a medical emergency from an unacknowledged reminder. Severity and urgency can change routing, not the fundamental permission or capability boundary.

### C16-W11 Command an Incident and Verify Recovery

Create a durable incident with the actual reporter/detection source, severity, affected systems/user estimate with uncertainty, commander, timelines, containment, communications and action owners. Separate observed evidence from hypotheses and confirmed cause; a large report spike is not automatically a breach. Link relevant cases/decisions without exposing all incident evidence to every linked reviewer. Incidents and ordinary cases have different lifecycles and closure evidence.

Use approved runbooks to contain the particular compromised identity, token/key type, tool/provider/resource or deployment. Workforce credentials, API/service credentials, data-encryption keys and E2E keys need different handling; 'rotate all keys' is not a safe universal plan. Protect ongoing unrelated core/safety/appeal workflows where feasible. A kill switch has exact scope, owner, durable audit, rollback/re-enable policy and measurable enforcement, not merely an admin UI toggle.

Collect minimal relevant immutable evidence and preserve integrity/access history without dumping raw private databases into tickets, terminals or analytics. Perform qualified investigation in isolated case-scoped tooling; support impersonation, device access, external legal requests and user recovery need separate verified procedures. Never collect passwords, session tokens or private-key material through ordinary support forms or an Agent transcript. Lawful notifications and disclosure decisions need designated qualified ownership and recorded timing.

Containment, eradication and recovery require distinct evidence. Restore into isolation with live outbound effects disabled, reconcile current revocations/deletions/restrictions/privileged grants and post-snapshot external outcomes before reopening. Rebuild indexes/caches from eligible authoritative records; rollback cannot revive an unsafe policy, stale moderator grant, removed content or cancelled Agent tool. Unknown authority/effect state remains blocked or under review, not marked recovered from a successful database restore alone.

Close only against an approved evidence-backed scope: repaired root cause or explicitly bounded unresolved risk, verified containment/recovery, communications, outstanding corrective-action owners and retained investigation artifacts. Review technical, policy, operational/training and detection gaps without silently rewriting the original timeline. Define RPO/RTO, incident duty coverage and drills with the operations team; no real incident exercise or recovery has been performed for this document.

## 12. Audit, Interfaces, Clients and Operating Quality

### C16-W12 Preserve Audit, Communicate Safely and Operate the Service

Mandatory audit is a protected minimal record of actual actor/service/delegation, context/case/action/target revision, policy/approval, reason, time, outcome and correlation. Persist intent at the appropriate access/effect boundary, with post-effect outcome/reconciliation where the result is uncertain. A successful mutation followed by best-effort logging is not an auditable transaction. For sensitive reads, record authorized access intent before disclosure; transport failure may mean some bytes were delivered, not 'no access'.

Protect append-only records from normal update/delete privileges and test actual custody, tamper detection, key/storage controls, access separation, retention and recovery. Append-only SQL or a hash chain alone does not prove immutable tamper resistance against every privileged operator. Audit reading and export are themselves scoped/audited; keep raw evidence, secrets, query strings and confidential notes out of routine event payloads. Use controlled correction records rather than rewriting history, with lawful expiry/hold release managed separately.

A remote audit-sink outage can buffer already durable authorized minimal events in a reviewed bounded protected ledger/outbox, preserving ordering/identity and reconciliation. This is not permission for volatile unbounded logs or duplicate actions. If the required durable record cannot be committed, do not execute sensitive disclosure or irreversible enforcement. Any exceptional containment path must be explicitly approved and preserve its required durable evidence; emergency wording is not a general unaudited bypass. Alarm on buffer capacity/loss/tamper risk and drain without resetting event identities.

Send safety notices through Chapter 20's durable notification service with minimal approved localized templates and exact action/appeal version. Show understandable current restriction, general policy category and next step without accusing unconfirmed wrongdoing or revealing reporters, private evidence/reviewer notes or anti-abuse thresholds. Current recipient binding, authorized category/channel policy and lawful exceptions govern delivery; a moderator cannot turn a safety message into marketing or unconsented external escalation. Provider acceptance is not human receipt, and a delayed old notice must not misrepresent a subsequently changed decision.

Expose notice/appeal status in a permitted authenticated safety channel even when ordinary capabilities are restricted, under the narrow identity/recovery policy. Notification failure remains pending/failed independently of enforcement; queue or appeal-service failures preserve already accepted work with stable receipts and retries. Choose fair appeal-window/notice-access policies explicitly rather than silently count from a message the user could not access.

Measure actual clocks, workload/age/backlog, skilled coverage, reviewer agreement, independent error labels, overturns, access incidents and Agent interventions. Report counts per 1,000 impressions are not violation prevalence, and appeals are a selected sample rather than a complete false-positive/negative estimate. Define labels/denominators, unseen-content sampling and language/region/category cohorts with privacy floors. Calibration, double review, sampled audits, error taxonomy and reviewer wellbeing must not reward rushed decisions or hide hard cases to meet throughput targets.

Operate within bounded queue/storage/evidence/parser/model/cost and workforce capacity. Low-risk bulk triage and last-approved-policy/classifier fallbacks stay within current authority. Integrate safe load shedding, escalation coverage, role-specific health/drain, compatible schema/policy releases and external kill switches with Chapters 10/11. Evaluate actual components, provider/language behavior, permission races and drills under isolated synthetic fixtures. This planning document supplies no staffing, legal certification, model precision/recall, audit tamper test or production SLO evidence.

### Source API, Permission and Queue Mapping

All twelve source APIs map once below. Missing assignment/lock/evidence/audit/policy/session/incident endpoints remain canonical-schema decisions, not capabilities supplied by generic CRUD.

| API group | Source operations | Required behavior |
| --- | --- | --- |
| Reports | C16-P01, C16-P02 | C16-W03: durable idempotent receipt and reporter-safe status with target/evidence permission. |
| Appeals | C16-P03, C16-P04 | C16-W08: specific action, independent review and durable truthful pending/outcome. |
| Queue/case reads | C16-P05, C16-P06 | C16-W02, C16-W04, C16-W05: scoped redacted projection, current assignment/grant and protected evidence. |
| Enforcement/restore | C16-P07, C16-P08 | C16-W07, C16-W08: exact revision/scope/approval and current competing restrictions. |
| Community delegation | C16-P09, C16-P10 | C16-W09: actual grantor/target authority, current Space limits and auditable revocation. |
| Agent safety | C16-P11, C16-P12 | C16-W09: allowed operational projection and durable bounded pause, not arbitrary context/tool administration. |

| Permission group | Source permissions | Guarded responsibility |
| --- | --- | --- |
| Case navigation and collaboration | C16-U01, C16-U02, C16-U03, C16-U04 | Qualified assignment, safe context/notes, current case version and minimal evidence requests. |
| Sensitive evidence | C16-U08 | Separate private-evidence category/field/purpose/expiry grant and mandatory access audit. |
| Decisions and appeals | C16-U05, C16-U06, C16-U07 | Action-specific authority, independence/approval and exact target/restriction scope. |
| Policy | C16-U09, C16-U10, C16-U11 | Separate read/author/publish duties, approved compatible version and durable audit. |
| Audit | C16-U12 | Case/incident/purpose-bound read or separately approved bounded export; no unrestricted data access. |

| Routing family | Source queues | Required review boundary |
| --- | --- | --- |
| General/community and integrity | C16-N01, C16-N02, C16-N06 | Current category-specific authority; public/community moderation differs from account security. |
| Specialist | C16-N03, C16-N04, C16-N05, C16-N08 | Fraud/privacy/child/copyright qualification, jurisdiction, minimized evidence and reviewed escalation. |
| Agent safety | C16-N07 | Bounded operational/tool evidence and containment under existing delegation, never private-memory browsing. |
| Independent appeal | C16-N09 | Actual decision-specific independent review, not the original reviewer using another queue. |
| Legal requests | C16-N10 | Verified request/applicability and qualified disclosure decision; queue label grants no access. |

Use Chapter 7 envelopes, auth/context, opaque IDs, version preconditions, request/idempotency and event schemas. Report/appeal receipt reads and case/evidence URLs reauthorize now; an old signed cursor or logged-in moderator is not enough. Strong account-scoped CSRF/Origin controls and privileged BFF/session isolation apply to web mutations. Reconcile administrative role grants, policy/evidence export, review notes, explicit restriction lookup and emergency/runbook actions before any route/tool exposes them. Do not allow client patching of approved/closed/status fields to bypass transitions.

All three source events map once to their actual projection: C16-E01 records accepted report creation for permitted consumers; C16-E02 records the defined committed enforcement fact, not proof every downstream provider notice completed; C16-E03 records the appeal result, not unconditional source restoration. Audit events and internal confidential case updates are not broadcast to ordinary Space members. Replay follows scoped versioned Chapter 7 barriers and current permissions; removed access or reassignment changes which data can be returned.

### Client Workflow Mapping

All twenty-six Android and eight web user labels map once below. Desktop moderation uses the source's four workspace areas and eight capabilities, under the same domain policy as the listed mobile review surfaces.

| Flow | Source Android surfaces | Source web user surfaces | Required experience |
| --- | --- | --- | --- |
| Guidance and personal safety | C16-C01, C16-C09, C16-C10, C16-C11, C16-C13 | C16-H01, C16-H02, C16-H06 | Current guidelines, block/mute/privacy controls and specific suspicious-link warnings without implied guilt or unsafe link fetching. |
| Reports and privacy complaints | C16-C02, C16-C03, C16-C04, C16-C12 | C16-H03 | Select permitted target/evidence, receive durable receipt, track minimized status and avoid duplicate offline submission. |
| Restrictions and appeals | C16-C05, C16-C06, C16-C07, C16-C08 | C16-H04, C16-H05 | Action/scope/duration, general reason, valid appeal path and accurate pending/partial/active outcome. |
| Agent permission and safety | C16-C14, C16-C15 | C16-H07, C16-H08 | Exact permitted approval and pause/status; listed external-approval UI does not enable prohibited MVP tools. |
| Case review | C16-C16, C16-C17, C16-C18, C16-C19, C16-C20, C16-C21, C16-C22 | Moderator workspace, not an ordinary user page | Queue/assignment, safe redacted evidence, policy comparison, exact action preview and qualified escalation. |
| Appeal, audit and operating review | C16-C23, C16-C24, C16-C25, C16-C26 | Moderator workspace, not an ordinary user page | Independent case outcomes, scoped audit, workload/incident status and current privileged-session checks. |

Keep server-current access and generation binding across tabs, account/role changes, cached routes, suspended sessions and long-lived evidence viewers. Offline user drafts may be retained only under the client privacy policy; sensitive approvals/enforcement/evidence must not replay as if privilege were still current. Expired access clears/stops newly disallowed views/requests with a safe state, without claiming to erase already seen data. Missing evidence, redacted evidence, unassigned/locked cases, conflicts, audit unavailable and pending effects are distinct states.

Use the existing restrained operational layout with stable evidence/action regions, accessible labels/icons, keyboard/focus order and screen-reader/TalkBack support. On smaller displays present the same stages through clear navigation instead of overlapping four panels. Never preselect a high-impact enforcement action or hide its scope/duration in a confirmation. Revalidate after edits and before submission; reviewers must see the actual current version they approve. Isolate evidence, model outputs, reviewer notes and user-facing explanations, and disable routine sensitive session replay/screenshots/telemetry according to the reviewed policy.

## 13. Proposed Verification and Synthetic Controls

The following thirty-two evidence families refine the source acceptance criteria. All application/policy/identity/queue/audit/classifier/enforcement/client/incident tests are NOT RUN. Each family may require many scenarios and independent judgments; thirty-two rows do not mean thirty-two executed tests or qualified legal/safety certification.

| ID | Verification family and required evidence | Traceability |
| --- | --- | --- |
| C16-V01 | Applicable policy semantics: stable keys, effective versions, hierarchy/jurisdiction, local stricter rules, conflicting exceptions and translation consistency; lower policy cannot authorize a higher-policy prohibition. | C16-S01, C16-S02, C16-S03, C16-S04, C16-S05; C16-R02, C16-R06; C16-B01; C16-A01; C16-K01; C16-W01 |
| C16-V02 | Policy publication and fallback: edit versus publish, independent approval, exact digest, retired/revoked/expired or incompatible cached rules, change rollout and stale sync cannot authorize an unreviewed rule. | C16-S03, C16-S05, C16-S14, C16-S39; C16-R05; C16-A01, C16-A22; C16-Q12; C16-K01, C16-K03, C16-K13; C16-W01, C16-W02, C16-W12 |
| C16-V03 | Role and identity boundaries: all six roles, twelve permissions, ordinary/workforce/service identities, case/category/jurisdiction assignment and actual target authority; administrator or queue membership alone cannot expose private data. | C16-S13, C16-S14, C16-S16, C16-S40; C16-B05, C16-B14; C16-A04, C16-A05; C16-Q01, C16-Q02, C16-Q03; C16-K02, C16-K03; C16-W02 |
| C16-V04 | Privilege lifetime and revocation: MFA/step-up/grant freshness after lock waits, offboarding/reassignment, long-lived viewer/tab/worker and session recovery deny newly disallowed reads/actions without falsely recalling delivered bytes. | C16-S14, C16-S16, C16-S35; C16-A04, C16-A05; C16-Q02, C16-Q03; C16-K02, C16-K03, C16-K14; C16-W02, C16-W05 |
| C16-V05 | Independent approval and exceptional access: two sessions of one approver, actor self-approval, conflicts, changed action/target/policy and expired approvals fail required dual control; any break-glass path is bounded, qualified and durably audited. | C16-S06, C16-S14, C16-S18, C16-S40; C16-R05, C16-R07; C16-A07, C16-A08; C16-Q12, C16-Q13; C16-K02, C16-K03, C16-K08, C16-K13; C16-W02, C16-W07 |
| C16-V06 | Durable intake and deduplication: typed targets/parents, trigger provenance, received versus committed state, duplicate request versus independent related reports, forged legal-request label and unavailable-source complaint handling. | C16-S09, C16-S10, C16-S35; C16-B03; C16-A02; C16-Q06, C16-Q08; C16-K04, C16-K05; C16-W03 |
| C16-V07 | Reporter privacy and anti-retaliation: inaccessible-ID probes, clustered reports, brigading, attachments/links, status/notification leakage and high report counts cannot reveal reporters or constitute automatic guilt. | C16-S06, C16-S09, C16-S25, C16-S40; C16-R01, C16-R07, C16-R08, C16-R09; C16-A02, C16-A14; C16-Q06, C16-Q08, C16-Q09, C16-Q10; C16-K04, C16-K11, C16-K12; C16-W03, C16-W10, C16-W12 |
| C16-V08 | Priority and queue routing: all priorities/queues, language/region/skill/evidence clearance, conflict and backlog aging; popularity-only routing, unqualified assignment and leaked queue metadata are rejected. | C16-S11, C16-S12, C16-S13; C16-R06, C16-R08, C16-R09; C16-B04, C16-B17; C16-A03, C16-A21; C16-K02, C16-K05, C16-K16; C16-W04 |
| C16-V09 | Concurrent assignment and bulk triage: lease expiry, crash, stale lock/heartbeat, reassignment and partial bulk failure preserve per-case expected versions and receipts without mass high-impact execution or indefinite locks. | C16-S10, C16-S12, C16-S38; C16-A03, C16-A08; C16-K03, C16-K05, C16-K08, C16-K15; C16-W04, C16-W07 |
| C16-V10 | Evidence snapshot integrity: exact source version/acquisition purpose, later edits, missing context, checksum/manifest mismatch, translation/OCR uncertainty and redaction derivatives remain attributable rather than assumed true. | C16-S15, C16-S16; C16-R06; C16-B06, C16-B14; C16-A05, C16-A18; C16-Q04, C16-Q05; C16-K06, C16-K14; C16-W05 |
| C16-V11 | Sensitive evidence viewing: case/field/category grant, unsafe media/embedded links, revocation during range requests, cache/export/screenshot limits and unrelated context/Agent memory prevent privileged data overreach. | C16-S14, C16-S15, C16-S16, C16-S40; C16-B05, C16-B14; C16-A04, C16-A05; C16-Q03, C16-Q04, C16-Q05, C16-Q07, C16-Q10; C16-K02, C16-K03, C16-K06, C16-K13; C16-W02, C16-W05 |
| C16-V12 | Private-message/E2E and representative limits: selected reported plaintext, unavailable keys, guardian/subject authority and lawful-request verification cannot unlock unrelated conversations or automatically reveal a vulnerable user's report. | C16-S16, C16-S27; C16-A05; C16-Q03, C16-Q04, C16-Q05; C16-K02, C16-K06, C16-K11, C16-K14; C16-W03, C16-W05, C16-W10 |
| C16-V13 | Classifier contract and provider privacy: exact evidence/model/policy version, schema/reason codes/confidence, missing media/language support, untrusted text and cost-bounded replay cannot execute commands or disclose unapproved evidence. | C16-S17, C16-S23, C16-S40; C16-B07; C16-A06; C16-Q11, C16-Q14; C16-K01, C16-K06, C16-K07, C16-K10; C16-W06, C16-W09 |
| C16-V14 | Human review and safe automation: high severity, ambiguity, satire/quotation, vulnerable/public-interest cases, disagreeing models and outage/unknown risk use qualified context-sensitive review or authorized temporary protection, not rubber-stamping. | C16-S06, C16-S17, C16-S18, C16-S39; C16-R01, C16-R02, C16-R06, C16-R08, C16-R09; C16-B07; C16-A06, C16-A07, C16-A22; C16-Q13; C16-K07, C16-K11, C16-K16; C16-W06, C16-W10 |
| C16-V15 | Scoped enforcement transaction: all levels/scopes, current role/policy/target revision, competing reviewer/edit, identical retry/changed key and audit failure preserve one authorized logical decision/effect without a local-to-platform escalation. | C16-S07, C16-S08, C16-S10, C16-S35; C16-R01, C16-R02, C16-R05; C16-B02; C16-A08, C16-A17; C16-Q13, C16-Q15; C16-K02, C16-K03, C16-K08, C16-K13; C16-W07 |
| C16-V16 | Restriction fanout and expiry: access denial across domain/cache/index/session/tool paths, partial/unknown external outcomes, temporary expiry with scheduler outage and independent restrictions cannot create an accidental reinstatement. | C16-S07, C16-S08, C16-S24, C16-S39; C16-R04; C16-A08, C16-A13, C16-A22; C16-K08, C16-K10, C16-K14; C16-W07, C16-W09, C16-W11 |
| C16-V17 | Appeal admission and resilience: restricted account's narrow appeal route, duplicate submission, unavailable review versus unavailable durable intake, notice delay and distinct new evidence preserve valid submissions and truthful pending status. | C16-S19, C16-S29, C16-S39; C16-R03, C16-R07; C16-B08; C16-A09, C16-A10, C16-A22; C16-Q08; C16-K04, C16-K09, C16-K12; C16-W07, C16-W08, C16-W12 |
| C16-V18 | Independent appeal outcome: all eight outcomes, same-human conflicts, qualified review, insufficient evidence, partial reversal and retaliatory extension controls bind the particular action and explain what remains active. | C16-S19, C16-S20, C16-S30; C16-R02, C16-R03, C16-R07; C16-B08; C16-A10, C16-A11; C16-K03, C16-K09, C16-K12; C16-W08 |
| C16-V19 | Restoration races: overturn A with restriction B, later owner deletion/new version/parent restriction, expired membership and revoked invites/approvals does not republish or recreate unrelated authority/effects. | C16-S10, C16-S20, C16-S35; C16-R04; C16-A08, C16-A11; C16-K08, C16-K09, C16-K14; C16-W07, C16-W08 |
| C16-V20 | Community delegation: grantor/target constraints, self/peer/owner changes, couple/solo admission rules, local policy precedence, grant revocation and private file/history/memory access never become platform-wide moderator rights. | C16-S03, C16-S04, C16-S21, C16-S22; C16-B09; C16-A04, C16-A12; C16-Q03, C16-Q07, C16-Q12; C16-K01, C16-K02, C16-K10; C16-W09 |
| C16-V21 | Agent containment: contextual risk, prompt injection/fabricated results, parent/child scopes, pause/revoke/approval invalidation and resumed checkpoints obey current grants without enabling forbidden MVP clinical/financial/external powers. | C16-S23, C16-S24; C16-B10; C16-A13; C16-Q12, C16-Q14; C16-K03, C16-K07, C16-K08, C16-K10; C16-W06, C16-W09 |
| C16-V22 | Coordinated abuse and fraud evidence: duplicate/conspiring reports, shared device/IP/new-user controls, link/QR inspection, organizer indicators and verification warnings are minimized, reviewable and not unsupported public guilt claims. | C16-S25, C16-S26; C16-R01, C16-R07, C16-R08, C16-R09; C16-B11; C16-A14, C16-A15; C16-Q08, C16-Q09, C16-Q11; C16-K04, C16-K06, C16-K11, C16-K16; C16-W03, C16-W10 |
| C16-V23 | Vulnerability and emergency readiness: qualified age/representative policy, specialist custody, pre-authorized bounded containment, senior review, verified contact authority and truthful user messaging; no diagnosis or automatic emergency action from non-response. | C16-S07, C16-S27, C16-S28; C16-R01, C16-R06; C16-B12; C16-A07, C16-A16; C16-Q03, C16-Q05, C16-Q13; C16-K03, C16-K06, C16-K11, C16-K13, C16-K16; C16-W10 |
| C16-V24 | Safety notification and status: current recipient/action version, localized minimal reasons, protected reporter/reviewer data, stale delayed notice, provider failure and notice/appeal timing remain distinct from enforcement effect. | C16-S20, C16-S29, C16-S36; C16-R03; C16-A09; C16-Q10; C16-K08, C16-K09, C16-K12, C16-K15; C16-W07, C16-W08, C16-W12 |
| C16-V25 | Mandatory audit and failure: before-disclosure/action durability, mutation/outbox atomicity, remote-sink loss versus ledger-write failure, bounded protected buffering, replay dedup and tamper/access tests prevent unrecorded irreversible actions. | C16-S14, C16-S33, C16-S39, C16-S40; C16-R05; C16-B13; C16-A17, C16-A22; C16-Q12, C16-Q15; C16-K03, C16-K08, C16-K13, C16-K16; C16-W02, C16-W05, C16-W07, C16-W12 |
| C16-V26 | Retention and data rights: ten data classes, case/hold expiry, minimized features, source deletion versus lawful restricted snapshot, derivative/export purge and grant/key loss stay bounded and restore cannot revive normal access. | C16-S15, C16-S16, C16-S34; C16-B06, C16-B14; C16-A05, C16-A18; C16-Q04, C16-Q05, C16-Q07; C16-K06, C16-K13, C16-K14; C16-W05, C16-W11, C16-W12 |
| C16-V27 | Incident command and recovery: eight lifecycle stages, actual-versus-hypothesized cause, key-type-specific containment, scoped communications, isolated restore/current revocations and verified closure/corrective owners survive faults. | C16-S28, C16-S32, C16-S39; C16-B16; C16-A19, C16-A23; C16-K02, C16-K08, C16-K11, C16-K13, C16-K14, C16-K16; C16-W10, C16-W11 |
| C16-V28 | API and event boundaries: twelve canonical operations/approved gaps, three minimized events, typed case/target/version/idempotency, privileged BFF/CSRF, safe errors and authorized replay do not disclose revoked receipts or internal notes. | C16-S35, C16-S36, C16-S40, C16-S41; C16-A04, C16-A20; C16-Q01, C16-Q02, C16-Q03, C16-Q06; C16-K02, C16-K03, C16-K08, C16-K12, C16-K15; C16-W02, C16-W03, C16-W07, C16-W08, C16-W12 |
| C16-V29 | Client and moderator workflow parity: twenty-six Android/eight web user surfaces, four workspace areas/eight capabilities, role/account/offline/lock races, exact previews and accessible large-text/keyboard/assistive/RTL states. | C16-S37, C16-S38; C16-A20; C16-K02, C16-K03, C16-K05, C16-K06, C16-K12, C16-K15; C16-W02, C16-W04, C16-W05, C16-W08, C16-W09, C16-W12 |
| C16-V30 | Independent quality and private analytics: calibration/sampling/second review, labels/denominators, language/region cohort floors, retaliation/private-access incidents and wellbeing prevent rushed-throughput or popularity bias incentives. | C16-S02, C16-S06, C16-S30, C16-S31; C16-R01, C16-R02, C16-R05, C16-R06, C16-R07, C16-R08, C16-R09; C16-B15, C16-B17; C16-A21; C16-K05, C16-K11, C16-K13, C16-K16; C16-W04, C16-W06, C16-W12 |
| C16-V31 | Safe degraded operations: classifier/policy/audit/appeal failures, backlog/resource saturation, compatible releases and on-call coverage preserve required policy and durable work without claimed unknown SLOs or capacity. | C16-S12, C16-S17, C16-S32, C16-S39, C16-S41; C16-A03, C16-A07, C16-A21, C16-A22, C16-A23; C16-K01, C16-K05, C16-K07, C16-K13, C16-K14, C16-K16; C16-W01, C16-W04, C16-W06, C16-W08, C16-W11, C16-W12 |
| C16-V32 | Isolated synthetic safety journey: receipt/case/qualified assignment/redacted evidence/approved exact action/notice/independent appeal, denied operator and privilege-expiry/audit-loss/stale-restoration controls with actual evidence and unrun limits. | C16-S01, C16-S42, C16-S43; C16-R01, C16-R03, C16-R04, C16-R05; C16-A02, C16-A04, C16-A08, C16-A09, C16-A10, C16-A11, C16-A17, C16-A20; C16-K01, C16-K02, C16-K03, C16-K06, C16-K08, C16-K09, C16-K13, C16-K15, C16-K16; C16-W01, C16-W02, C16-W03, C16-W04, C16-W05, C16-W06, C16-W07, C16-W08, C16-W09, C16-W10, C16-W11, C16-W12 |

### Synthetic Privilege, Policy and Audit Fixture

This JSON is documentation with assumed inputs and synthetic principals, not an authorization engine or an enforcement API. Five groups describe necessary checks at finite instants. Fixture timestamps and staleness limits are controls, not production configuration, and distinct principal IDs alone cannot prove actual human independence or qualification.

```json
{
	"fixture_kind": "synthetic_trust_operation_controls",
	"runtime_executed": false,
	"privilege": {
		"operator_id": "synthetic-reviewer-a",
		"case_id": "synthetic-case-1",
		"permission": "case.view_private_evidence",
		"required_scope_checks_pass": true,
		"privileged_grant_revoked": false,
		"grant_expires_at": "2026-09-19T09:05:00Z",
		"request_started_at": "2026-09-19T09:04:00Z",
		"after_lock_at": "2026-09-19T09:06:00Z",
		"expected_after_lock_allowed": false,
		"before_expiry_control_at": "2026-09-19T09:04:30Z",
		"expected_before_expiry_allowed": true
	},
	"dual_approval": {
		"initiator_id": "synthetic-operator",
		"intent_revision": "synthetic-intent-7",
		"required_distinct_approvers": 2,
		"all_other_approval_checks_pass": true,
		"duplicate_principal_sessions": [
			{ "principal_id": "synthetic-reviewer-b", "session_id": "session-1", "intent_revision": "synthetic-intent-7" },
			{ "principal_id": "synthetic-reviewer-b", "session_id": "session-2", "intent_revision": "synthetic-intent-7" }
		],
		"expected_duplicate_sessions_allowed": false,
		"independent_principal_control": [
			{ "principal_id": "synthetic-reviewer-b", "session_id": "session-1", "intent_revision": "synthetic-intent-7" },
			{ "principal_id": "synthetic-reviewer-c", "session_id": "session-3", "intent_revision": "synthetic-intent-7" }
		],
		"expected_independent_control_allowed": true,
		"changed_intent_revision_control": "synthetic-intent-8",
		"expected_changed_intent_allowed": false
	},
	"policy_fallback": {
		"approved": true,
		"compatible": true,
		"revoked": false,
		"revocation_status_known": true,
		"effective_from": "2026-09-19T08:00:00Z",
		"effective_until": "2026-09-19T10:00:00Z",
		"verified_at": "2026-09-19T09:00:00Z",
		"maximum_staleness_seconds": 300,
		"check_at": "2026-09-19T09:04:00Z",
		"expected_allowed": true,
		"stale_control_at": "2026-09-19T09:06:00Z",
		"expected_stale_control_allowed": false,
		"expected_unknown_revocation_allowed": false
	},
	"audit_boundary": {
		"all_other_action_checks_pass": true,
		"cases": [
			{ "id": "remote-sink-down", "remote_sink_available": false, "durable_required_record_committed": true, "expected_effect_may_commit": true },
			{ "id": "required-ledger-failed", "remote_sink_available": true, "durable_required_record_committed": false, "expected_effect_may_commit": false }
		]
	},
	"restoration": {
		"overturned_restriction": "synthetic-restriction-a",
		"active_restrictions_before": ["synthetic-restriction-a", "synthetic-restriction-b"],
		"expected_active_restrictions_after": ["synthetic-restriction-b"],
		"owner_deleted_after_action": true,
		"expected_restored": false,
		"external_effects_executed": 0
	}
}
```

A local document check can parse UTC timestamps, apply end-exclusive grant/policy expiry, compare cache age, count distinct approver principals bound to the exact intent and evaluate the explicit audit/restoration flags. It must reject the expired grant after a lock wait, duplicate sessions, changed intent, stale or unknown policy status, missing required durable audit and restoration with another restriction/deletion. These assumed flags do not test real MFA, workforce identity, clock sources, case authorization, audit durability, two-phase network effects or independent human review. Actual C16-V02 through C16-V05, C16-V15, C16-V19 and C16-V25 must exercise the selected services and fault boundaries.

## 14. Developer Handoff and Delivery Sequence

These twelve packages assign responsibility; they are not mandatory separate services, hired reviewers, live Agents or authorization to investigate real users. Conditional specialist/legal/provider/Agent capabilities remain behind their approved gates, while the safety controls required by an enabled public feature are not optional.

| ID | Owner | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C16-T01 | Product, policy, trust, privacy and qualified legal leads | Relevant release/identity/Space/API/security/discovery/file decisions | Resolve C16-D01 through C16-D14, category/jurisdiction/age/evidence policies, required human/dual control and real operating commitments. Do not approve numerical source examples by default. |
| C16-T02 | Policy/domain/data architect | C16-T01 | Define immutable policy versions, applicability, typed case/target/evidence/action/restriction/appeal records, transition boundaries and compatible publication/fallback; deliver the foundational protected audit schema/writer and atomic access/action-intent primitives before dependent reads or effects. C16-V01, C16-V02, C16-V15 and the prerequisite durability portion of C16-V25. |
| C16-T03 | Workforce identity/security engineer | C16-T02; selected identity and key custody decisions | Implement current case/category/purpose authority, privileged session/revocation, approved separation of duties and bounded exception paths; C16-V03 through C16-V05. Role labels alone do not pass. |
| C16-T04 | Case/queue workflow engineer | C16-T02, C16-T03 | Implement durable report intake, clustering without evidence loss, priority/qualified assignment, leases/concurrency and safe receipts; C16-V06 through C16-V09. Coordinate real staffing with operations. |
| C16-T05 | Evidence/privacy engineer | C16-T02, C16-T03, C16-T04; accepted file/encryption boundaries | Implement minimal versioned acquisition/redaction/translation, protected viewer/access auditing and retention lineage; C16-V10 through C16-V12, C16-V26. No unrestricted private search or exports. |
| C16-T06 | Classification/enforcement engineer | C16-T01, C16-T02, C16-T03, C16-T04, C16-T05 | Implement approved rule/model outputs, required human decisions and exact audited restriction/effect protocol; C16-V13 through C16-V16. Audit prerequisites must exist before enabling effects. |
| C16-T07 | Appeals/governance engineer | C16-T03, C16-T04, C16-T05, C16-T06 | Implement independent action-specific appeal, partial outcomes/restoration and scoped community delegation; C16-V17 through C16-V20. Owner deletion or other restrictions cannot be cleared accidentally. |
| C16-T08 | Agent safety and specialist operations leads | C16-T03, C16-T05, C16-T06; approved specialist procedures | Implement only released bounded Agent containment and specialist abuse/fraud/vulnerability/escalation controls; C16-V21 through C16-V23. Legal/emergency/provider authority is a separate prerequisite. |
| C16-T09 | Audit, incident and platform engineer | C16-T02, C16-T03, C16-T05; C16-T06, C16-T08 for integrated drills | Harden and operate the C16-T02 audit primitives with private custody/buffering/purge and incident/restore controls; C16-V25 through C16-V27, C16-V31. Integrated drill dependencies do not delay the foundational audit boundary. |
| C16-T10 | API, notification, Android and web engineers | C16-T04, C16-T05, C16-T06, C16-T07, C16-T09 for released scope | Implement canonical typed APIs/events, minimized notice/status and accessible account/privilege-safe user/reviewer flows; C16-V24, C16-V28, C16-V29. Sensitive UI controls do not create authority. |
| C16-T11 | Independent QA, security, language and trust reviewers | C16-T02 through C16-T10 for released scope | Execute applicable C16-V01 through C16-V32 with exact artifacts/components/policies and actual reviewer qualifications, faults, failures/skips and independent expected judgments. Separate document checks, mocks and real operating evidence. |
| C16-T12 | Event, planning, finance-boundary and product leads | C16-T01, C16-T02, C16-T07, C16-T10; C16-T11 for implemented safety evidence | Chapter 17 handoff for events, polls, shared tasks/budgets/contributions and collaborative planning with scoped approvals, cancellation and safety boundaries. Design may proceed now; no payment or financial authority is implied. |

Stage implementation, when authorized, around policy and current authority, durable intake/evidence, foundational audit and exact restriction identity, then controlled decisions/appeals and client/operating evidence. Do not wait until after enforcement to add mandatory audit. The table separates foundational contracts from integrated drills; ownership packages may coordinate within a stage without creating an unaudited interim release.

An initial synthetic review slice can use ordinary non-sensitive public content, a limited reversible feature restriction, a qualified independent appeal and no external notifications/providers. Broader public release still requires its actual risk coverage and staffing; child/legal/emergency/clinical/financial or automated high-impact workflows are not enabled by passing that narrow slice. This exercise does not replace the ordinary-reminder M1.

## 15. Demonstration, Remaining Risks and Next Chapter

### Separate Synthetic Trust Operations Exercise

This is a future controlled exercise, not an executed moderation action or staffed service. Use synthetic accounts, ordinary harmless test content, deliberately fabricated cases and isolated dependencies only when implementation/testing is authorized.

1. Publish an approved synthetic policy version through distinct author/reviewer duties, with applicability/effective interval and exact audit history. Attempt to use a retired or unapproved rule as a negative control.
2. Submit an authorized report twice with the same logical request key. Preserve one receipt/case relationship and safe reporter-visible status without treating the report as a confirmed violation.
3. Route the case by category/language/priority to a qualified reviewer. Show that an unrelated role/queue or an expired grant cannot reveal the evidence; acquire a narrowly scoped valid grant through the approved process.
4. Inspect the exact redacted source snapshot and its provenance, separating model output and notes from verified evidence. Record authorized access before disclosure; later source edits do not replace the reviewed version.
5. Review a proposed reversible action with its real scope/duration/policy/target revision. Reject two sessions of one person where independent approval is required, and invalidate approval when material intent changes.
6. Commit the exact action with required audit and durable effects. Lose a queue publication/retry a request in the isolated harness and recover the same logical effect without expanding scope or repeating notices.
7. Demonstrate that a remote audit-sink outage can reconcile a permitted already-durable event, while failure to record required audit blocks the sensitive effect. Do not call in-memory logging an acceptable receipt.
8. Submit a permitted appeal during a simulated review-service outage and retain truthful pending state. Assign an independent eligible reviewer, reverse only the particular action and retain a second restriction or subsequent owner deletion.
9. Revoke reviewer or Agent authority while work is queued; reject stale actions/resumes and preserve reconciliation of any already committed effect. Demonstrate local moderator limits against unrelated private content/platform permissions.
10. Exercise a synthetic incident/restore and client reconnect/account-role switch: current exclusions and grants are applied before access resumes, and Android/core web present accurate state with accessible review controls.

Record actual policy/component/artifact versions, actor/grant/case/action identity, accepted versus applied/outcome state, time/fault boundaries, audit/effect receipts, independent review evidence and failures/skips. Avoid raw private material and credentials in artifacts. A narrow passing exercise cannot establish every jurisdiction/language, specialist staffing, emergency response, model accuracy, legal compliance or production incident capability.

### Open Boundaries

- Eight PROPOSED and six OPEN choices remain unapproved. Workforce assurance, privileged-session lifetimes, dual-control/exception rules, applicable policy freshness and case/evidence permissions need concrete selection and real adversarial tests.
- Source case/appeal/incident diagrams are inventories, not complete canonical state machines. Notification status, appeal eligibility, active restrictions, source lifecycle and purge work remain separate; restoration cannot be a generic status reset.
- Classifier scores, automated-risk labels and abuse indicators are not findings or enforcement credentials. Human independence, qualification, language/context quality and real coverage/backlog capacity cannot be proven by a mocked reviewer account.
- Append-only audit, encrypted references, containers, expiring links and a case ID do not individually guarantee tamper resistance, privacy or authorization. Test the real custody/disclosure/commitment and recovery boundaries.
- Age/guardian authority, E2E evidence, legal requests, preservation/holds, emergency escalation and external contact need separately approved qualified procedures. This draft does not authorize live investigations, private-data collection or automatic emergency/clinical/financial actions.
- Critical observed authority/audit bypass, private-data leakage, retaliation or stale restoration blocks the affected release. Unrun tests, missing staffing and unknown capabilities are not passes; residual-risk acceptance cannot waive mandatory law or safety controls.

Next is [Chapter 17](../Chapter17.md): events, polls, contributions, shared budgets, tasks and collaborative planning. Carry the [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [file/document](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md), [encryption](../Chapter19.md) and [notification delivery](../Chapter20.md) boundaries. Continue design/developer handoff without authorizing payments, implementation, providers or policy changes.