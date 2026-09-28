# Team Organization and Engineering Execution Plan

Status: DRAFT FOR FOUNDER, TECHNICAL, PRODUCT, SECURITY AND DATA-RIGHTS REVIEW.

Planning baseline: 2026-09-19. This document proposes responsibilities, staffing options and delivery gates. It does not appoint people, approve architecture or product policy, authorize hiring/spending, or report an implemented application.

## 1. Scope and Corrections

Use this operating plan alongside the [release plan](CHAPTER_01_RELEASE_PLAN.md), [developer task standard](../idea.md#L3725), [operating cadence](../idea.md#L3800) and [Astra development workflow](../idea.md#L3911). Existing sources and chapter drafts remain unchanged. Conflicting requirements require an explicit decision in the owning contract, not an informal instruction in a ticket.

The supplied organization proposal needs these adjustments:

| Area | Aligned planning baseline |
| --- | --- |
| Headcount | Teams A-E are responsibility areas, not five fully staffed departments. Filling every listed specialist position separately would exceed 25 people. Section 2 gives non-overlapping headcounts. |
| Current documentation | There are 16 chapter drafts at this snapshot. The [Chapter 19 contract](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) already exists; review its open decisions rather than draft it again. [Chapter 20](../Chapter20.md) exists as source material but has no separate contract draft yet. |
| M1 behavior | Manual forms, synthetic accounts, an ordinary family task, a one-time reminder and durable in-app notification on Android and core web. No Agent code or Agent drafting is required. In-app history does not prove background push. |
| Unapproved decisions | C1-D01, C1-D02 and C1-D04 are PROPOSED; C1-D03, C1-D05 and C1-D06 are OPEN. Email/password-first in C18-D01 and the API recommendations are proposals, not accepted decisions. |
| Existing ADRs | Five ADR drafts are present and all are PROPOSED. Their Decision sections are recommendations pending approval, not evidence that the chapter decision registers are closed. Section 8 links the actual files. |
| Milestone conflict | [ADR 0005](adr/0005-mvp-scope-and-milestones.md) proposes M2 reliability, M3 messaging and M4 public community; the release plan uses M2 private communication, M3 public community and M4 planning completion. Section 7 retains the release-plan baseline pending explicit reconciliation. Its planning-completion work must not disappear. |
| Decision scope | Five ADR drafts cannot settle every encryption, health, invitation, retention or provider decision. Resolve prerequisites before dependent implementation and explicitly track deferred, unexposed capabilities. ADR 0005's required push/email proposal does not close the still-open channel decision by itself. |
| Staffing timing | Product/design, QA, security/privacy and operational ownership start during M0, even if qualified people initially cover these roles part-time. Dedicated hires can follow; responsibility cannot wait until M2. |
| Estimates | Days 1-90 are a planning window, not a delivery guarantee. Weeks 14-16 are a separately forecast extension, not part of a 90-day promise. Ticket count is not a capacity estimate. |
| Source attribution | The ticket fields come from the task standard. The Definition of Done below consolidates that standard and the release handoff requirements; it is not a verbatim quotation of section 37. |

M1 is not the full MVP or a real-user launch. The proposed full MVP still includes public community, the four private Space types, reliable messaging, planning, controlled Agent/memory, safety and data rights. All applicable [release gates](CHAPTER_01_RELEASE_PLAN.md) remain required.

## 2. Organization and Staffing

The Founder/CEO owns product priorities and commercial authorization. The Technical Co-lead owns architecture and engineering coherence. Domain leads own delivery within approved contracts. Security and data-rights owners have the blocking authority in section 3.

| Area | 12-person model | 18-person model | 25-person model |
| --- | --- | --- | --- |
| Leadership | 2 | 2 | 2 |
| A: Product and Design | 1 | 2 | 3 |
| B: Client Engineering | 3 | 5 | 7 |
| C: Backend and Data | 3 | 5 | 7 |
| D: Agent Engineering | 0 | 1 | 2 |
| E: Quality, Security and Operations | 3 | 3 | 4 |
| Total | 12 | 18 | 25 |

Each person is counted once, including the Founder and Technical Co-lead. These are alternative staffing models, not approved vacancies, current employees or a minimum team size. Fractional external support and its cost must be recorded separately; it cannot silently supply missing full-time capacity.

| Area | At 12 people | Additions to reach 18 | Additions to reach 25 |
| --- | --- | --- | --- |
| Leadership | Founder/CEO; Technical Co-lead | No additional executive layer | No additional executive layer |
| A | Product designer; Founder covers PM accountability | One PM | One UX research/design-system specialist |
| B | Android lead, Compose engineer, web lead | One Compose engineer and one web engineer | One Compose engineer and one web engineer |
| C | Backend lead and two senior backend engineers covering identity, Spaces, planning and data | Two engineers to separate messaging/notifications and data/files ownership | Two engineers to separate community and remaining planning/Space workloads |
| D | No dedicated hire; Technical Co-lead covers deferred Agent contract review | Agent architect | Tool/RAG/evaluation engineer |
| E | QA/automation lead, security/privacy engineer, platform/SRE engineer | Same three roles; reassess workload before increasing exposure | Release/automation engineer |

Roles such as identity lead, notifications lead, data-rights owner and release owner are explicit assignments within these headcounts. Team E's platform engineer can initially coordinate releases; Team C owns application durability and domain workers. Data architecture belongs to C; E owns deployment operations and privacy oversight. Tooling does not replace qualified legal, cryptographic or other specialist review when required.

Do not require one staff/principal engineer in every area. Share architecture leadership across the organization. Start senior-heavy for identity, authorization, durability and operations. A later 40% senior / 40% mid / 20% junior mix can be a planning heuristic for non-staff engineering roles, not an asserted industry standard; staff engineers still count inside the total headcount.

Every junior has a named senior mentor and reviewer before assignment. A mid-level engineer's risky change is reviewed by the domain lead. Leads have delivery and mentoring capacity reserved explicitly; one person covering three roles does not provide three people's throughput. One SRE is not a sustainable 24/7 rotation.

Before implementation, maintain a staffing register with role, named person, backup, allocation, qualifications, review authority and conflicts of interest. All person assignments remain pending here. If a required owner or independent reviewer is missing, the affected work is blocked until qualified coverage is assigned.

## 3. Decision Authority and Release Blocking

R = prepares or executes the decision; A = one accountable decision owner; C = consulted; I = informed. Additional required approvals are gates, not additional A entries. The accountable owner records the decision, affected versions, rationale and evidence.

| Decision | R | A | C | I | Required gate |
| --- | --- | --- | --- | --- | --- |
| Product scope, priorities and milestone acceptance | PM | Founder | Technical Co-lead, design, domain leads, QA | All teams | Applicable security/data-rights and acceptance gates remain binding |
| Architecture, ADRs and service extraction | Proposing domain lead | Technical Co-lead | Affected leads, security, operations | Engineering | Document alternatives, compatibility, operating cost and rollback implications |
| Database schema and migrations | Data/domain engineer | Backend lead | Client leads, Agent lead, operations | Affected teams | Technical Co-lead approval; security/privacy approval for sensitive changes |
| API and event contracts | Owning domain engineer | Backend lead | Android lead, web lead, Agent lead, QA | Engineering | Consumer review and compatibility evidence; Technical Co-lead for architectural breaks |
| Security controls and threat model | Domain engineer | Security owner | Technical Co-lead, data-rights owner, qualified specialists | Affected teams | No unresolved applicable security blocker |
| Data rights, retention and permitted processing | Data-rights implementer | Data-rights owner | Security, product, backend, qualified legal reviewer | Affected teams | Applicable legal basis, disclosure and data-lifecycle evidence |
| Agent capabilities and tool registry | Agent engineer | Agent lead | Backend, security, data-rights, product | Engineering | Security approval and applicable evaluations; prohibited actions stay prohibited |
| Technical provider acceptance | Integration engineer | Owning domain lead | Security, data-rights, operations, product | Technical Co-lead | Verified official capabilities and permitted data/region/retention terms |
| Provider spending and commercial commitment | PM or vendor coordinator | Founder | Owning domain lead, security, legal as needed | Release owner | Technical acceptance plus explicit budget/contract authorization |
| Design system | Product designer | Design lead | Android lead, web lead, accessibility reviewer | Product and engineering | Both clients review affected behavior and accessibility |
| Production release | Release engineer | Release owner | QA, backend, clients, Agent when applicable, security, data-rights | All teams and support | Exact artifact and environment have all applicable approvals and evidence |

Security and data-rights owners can each block a release, independently of product or budget approval. A release owner cannot override either veto. Record the blocking requirement, evidence, owner, remediation and re-review result. Qualified risk acceptance must follow an approved exception process and cannot waive mandatory duties or relabel a failed required control as passed.

For high-risk changes, the author, Technical Co-lead approver and security approver must be distinct qualified people. Multiple roles or two accounts held by the same person do not satisfy independent review. If the Technical Co-lead authors the change, assign a documented qualified technical delegate; if no independent review is available, do not merge or release it. Data-rights approval is additionally required where applicable.

A production go/no-go record binds the artifact, config, schema/API/event versions, environment, test results, limitations, approvers and rollback/forward-fix plan. An emergency deployment follows a separately approved incident process; an urgent label alone bypasses nothing.

## 4. Domain Ownership

Each epic has one accountable owner. Supporting teams contribute through the same service and contract boundaries; team boundaries do not imply separate microservices.

| Epic or responsibility | Accountable owner | Support and boundary | Source |
| --- | --- | --- | --- |
| Identity, sessions, recovery and invitation identity proof | C: Identity lead | E reviews security/privacy; D consumes scoped delegation. Space admission remains a Space mutation. | [Identity](CHAPTER_18_IDENTITY_CONTRACT.md) |
| Spaces, membership, roles, invitation admission and lifecycle | C: Spaces lead | Identity provides verified actor/destination evidence; A designs flows and B implements clients. | [Spaces](CHAPTER_03_SPACE_CONTRACT.md) |
| Schema, migrations and durable data integrity | C: Data lead | Domain owners define invariants; E operates migration tooling. No competing team-owned source of truth. | [Data](CHAPTER_06_DATA_CONTRACT.md) |
| API, events, synchronization and generated contracts | C: Backend lead | B and D are required consumers/reviewers. Each domain owns its operation semantics. | [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md) |
| Messaging, ordering, receipts and conversation authority | C: Messaging lead | B owns client reconciliation; E reviews privacy and cryptographic claims. | [Chapter 4](../Chapter4.md), [Messaging/encryption](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) |
| Tasks, scheduling, occurrences and reminder cancellation | C: Planning lead | D later drafts through the same services; B presents confirmed state. | [Scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md) |
| Notification policy, delivery history and provider adapters | C: Notifications lead | E owns operational/provider-risk review; scheduler owns due intent, not transport results. | [Chapter 20 source](../Chapter20.md), [Delivery review draft](CHAPTER_20_DELIVERY_CONTRACT.md) |
| File custody, scanning, extraction and retrieval storage | C: Files/data lead | D consumes authorized retrieval; E reviews isolation and data rights. | [Files/documents](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) |
| Agent retrieval, context assembly and RAG evaluations | D: Agent lead | C retains file/index authority; E reviews permitted context and providers. | [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [Files/documents](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) |
| Public community, feeds, search and discovery | C: Community lead | A owns feed UX; E owns moderation policy; private data cannot enter public discovery. | [Chapter 2](../Chapter2.md), [Discovery](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md) |
| Events, polls, collaborative tasks and record-only budgets | C: Planning lead | A/B own workflows; D assistance is later. Recording expenses does not authorize payments. | [Event collaboration](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) |
| Agent runtime, tools, memory and exact approvals | D: Agent lead | C owns domain effects; E owns safety gates. No separate permission implementation in tools. | [Chapter 5](../Chapter5.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) |
| Trust operations, moderation and appeals | E: Trust/safety owner | A/product and qualified policy reviewers define policy; C implements enforcement; D handles Agent abuse controls. | [Trust operations](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) |
| Security, privacy policy and data-rights coordination | E: Security/data-rights owner | Each C domain implements its export, deletion and revocation obligations. Role labels do not confer access to user data. | [Security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md) |
| Infrastructure, CI/CD, observability and disaster recovery | E: Platform/SRE owner | C owns application health, durable jobs and restore reconciliation; both rehearse recovery. | [Backend operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md) |
| Android shell, client data and design-system implementation | B: Android lead | A owns shared design language; C owns backend authorization. | [Android](CHAPTER_08_ANDROID_CONTRACT.md) |
| Web shell, client state and thin BFF | B: Web lead | A owns shared design language; BFF does not duplicate C's business rules. | [Web](CHAPTER_09_WEB_CONTRACT.md) |
| Cross-client acceptance and release evidence | E: QA lead | Every author owns tests; QA owns integrated coverage and evidence quality, not all test writing. | [Release plan](CHAPTER_01_RELEASE_PLAN.md) |

## 5. Work Intake, Tickets and Review

Quarterly outcomes -> approved milestone spec -> domain-owned epics -> designed stories -> bounded implementation tickets -> integrated evidence -> milestone acceptance.

The milestone spec states users, scope, non-goals, dependencies, contracts, risk owners, exit checks and demo script. Epics may span teams but keep one accountable owner. Estimate tickets at roughly 1-3 engineer-days after discovery; split larger work into testable changes without separating an invariant from the tests or transaction that enforce it. Spikes have a bounded question and decision/evidence deliverable.

### Definition of Ready

- One named accountable owner, an implementer and the required reviewers have capacity.
- Source requirement IDs and exact contract/ADR revisions are recorded; unapproved prerequisites are resolved or the ticket is limited explicitly to exploration.
- The user outcome, non-goals, API/data/UI impacts and security/data-rights risks are explicit.
- Dependencies have accepted outputs; mocks and simulators are identified as such.
- Acceptance includes failure, authorization, retry and concurrency cases where relevant, with runnable checks and expected results.
- Test data, environment, rollout and rollback/forward-fix needs are known. Real user data is not a default development fixture.

### Assignment and Review Rules

| Ticket type | Implementation assignment | Required review |
| --- | --- | --- |
| Screen from an approved design and contract | Mid-level engineer; junior may pair | Client lead or delegated senior; design/accessibility checks |
| Standard CRUD without a sensitive authority change | Mid-level engineer | In-domain senior; authorization and failure tests still apply |
| Schema migration or API/event contract change | Senior engineer | Backend lead and Technical Co-lead; affected consumers; security when sensitive |
| Invitations, recovery, revocation, cryptographic keys, payments, health data or Agent approvals | Senior engineer only for authority-bearing implementation | Technical Co-lead and Security owner as independent approvers; data-rights/specialist review where applicable |
| Infrastructure, CI, secrets, deployment or DR | Qualified platform engineer | Independent release/operations reviewer; security for privileged changes; affected domain lead |
| AI-assisted implementation | Same eligibility as the underlying risk class | Label `ai-assisted`; a human owns review, tests and integration. AI output is not a second approver. |

Junior participation in synthetic test fixtures or documentation does not make them the sole implementer of a sensitive control. A risky change cannot be reclassified as standard CRUD to reduce approvals. Payments, health features and Agent powers remain subject to release scope even when reviewers are available.

### Definition of Done

- Code is reviewed and integrated, with required unit tests and applicable integration, contract and client tests.
- API/event/schema changes and generated consumer contracts are consistent; migrations include compatibility and recovery notes.
- Architecture changes have an accepted applicable ADR; unrelated policy choices remain visibly unresolved.
- Security, privacy, consent and data-rights considerations are addressed with evidence for the affected controls.
- Runbooks, observability, operational limits and rollout/rollback instructions are updated where applicable.
- Demo instructions reproduce the intended outcome and relevant failure cases against the identified artifact.
- Known limitations, unimplemented scope and remaining decisions are explicit.
- Evidence records command/scenario, artifact/revision, environment, date, result and reviewer. PASS, FAIL and NOT RUN are distinct; skipped work is not passed. N/A requires a reason and reviewer agreement.

Documentation-only work records code/runtime items as N/A with reasons; its completed document checks do not satisfy product acceptance. A ticket can be done without being deployed, but a milestone is not accepted until its integrated exit checks pass.

Use these fields in the eventual ticket/PR template. This document does not install a repository PR template or branch protection.

```text
ID / title / epic / milestone
Accountable owner / implementer / required reviewers
Source requirement IDs / affected contracts and revisions / ADR status
Dependencies and accepted outputs
User outcome / technical requirements / explicit non-goals
API and event changes / database and migration changes / client changes
Risk class / security and data-rights considerations
Acceptance cases / test commands / expected results
Executed evidence: artifact, environment, date, result, evidence location
Rollout and rollback or forward-fix / runbook / demo instructions
Known limitations / remaining decisions / applicable DoD items
AI-assisted label when applicable
```

For example, a cancellation/revocation ticket cites C1-M08 and the relevant scheduling/Space rules, and proves the chosen execution boundary with an executable race test. A screenshot of a Cancel button is not that evidence.

### M1 Backlog Preparation

Expand the existing C1-T01 through C1-T11 handoffs rather than creating an unrelated roadmap. The ranges below are provisional decomposition sizes, not created tickets or committed estimates. Every implementation ticket includes its own tests; the final QA group adds integrated checks rather than taking over testing.

| Epic group | Lead area | Existing handoff | Candidate tickets |
| --- | --- | --- | --- |
| Scope, contracts and eight-surface design | A | C1-T01, C1-T02 | 4-6 |
| Local foundation, data and API contracts | C | C1-T05 | 4-6 |
| Identity and invitation proof | C | C1-T03 | 5-7 |
| Family admission, roles and tasks | C | C1-T04, C1-T06 | 5-7 |
| One-time schedules, in-app history and acknowledgment | C | C1-T06, C1-T07 | 6-8 |
| Android workflow | B | C1-T08 | 6-8 |
| Core web workflow | B | C1-T09 | 6-8 |
| Cross-client failure tests and security review | E | C1-T10, C1-T11 | 5-7 |
| Total | All | All eleven handoffs | 41-57 |

Split the two C1-T06 groups by task behavior versus schedule behavior, without duplicating work. Respect the handoffs' dependency graph. Contract fixtures can enable early client work after interface approval; integrated acceptance still depends on real services. Re-estimate against assigned people, review load and measured delivery before scheduling the board.

## 6. Cadence and Operating Signals

| Cadence | Participants | Required output |
| --- | --- | --- |
| Daily | Active delivery group; combine areas at small headcount | Blockers, owner, next action and dependency changes; avoid five duplicate standups |
| Weekly product planning | Founder, PM, relevant leads | Ordered ready work, scope decisions and capacity tradeoffs |
| Weekly architecture review | Technical Co-lead and affected leads | ADR/contract decisions, compatibility risks and unresolved owners |
| Weekly demo | Cross-functional team | Actual integrated behavior plus failures/limitations, labeled simulations and evidence |
| Every two weeks | Delivery team | Sprint review, forecast update and a small owned retrospective action list |
| Monthly | Security/privacy, technical, product and operations owners | Security review, incident follow-up, costs/budgets, roadmap and staffing review |
| Per release | Release owner and applicable gate owners | Regression evidence, migration/deploy checklist, affected rollback rehearsal, changelog and go/no-go record |

Monthly security review supplements, not replaces, per-change review. A failing required check or unresolved veto blocks the release. On-call and incident duties, backup coverage and escalation contacts are assigned before exposure requiring that support.

Track accepted milestone checks, aged blockers, work in progress, review latency, escaped defects, flaky tests, deployment failures, restore/recovery evidence and operating cost. Set targets after observing actual workload. Lines of code, AI-generated volume and ticket count are not productivity or readiness evidence. A reported test pass rate includes its denominator and excludes NOT RUN cases from the passed count.

## 7. Staffing Order and Milestones

1. Founder and Technical Co-lead establish scope and decision ownership. Assign qualified product/design, QA, security/data-rights and platform coverage immediately; interim coverage is named, not assumed.
2. Backend lead and a senior backend engineer establish identity, Space, data/API and durability contracts. Add another senior as concurrent domain work becomes justified.
3. Android and web leads join the approved interface/design work in parallel. Web is part of M1; do not defer all web work until the Android implementation finishes.
4. Add dedicated PM/design and QA capacity as needed to sustain a ready backlog and executable cross-client acceptance. Their ownership already exists from step 1.
5. Staff platform/SRE and security/privacy sufficiently before any real-user exposure. Fractional review can support early synthetic development but does not prove production operational coverage.
6. Add an Agent architect ahead of M5 for controlled runtime/tool design and evaluation. M1 uses manual forms and no Agent runtime; deterministic scheduling is backend work, not a substitute Agent milestone.
7. Hire additional domain engineers, then appropriately mentored mid/junior engineers, when approved work and reviewer capacity can support parallel delivery. Do not staff all future specialties before they have bounded work.

These are capability priorities, not purchase or recruitment authorization. Dedicated hires may combine several steps. Review staffing against actual bottlenecks and funding rather than promising all five areas their own specialist roster.

| Milestone | Delivery focus | Boundary |
| --- | --- | --- |
| M0 | Scope, contract decisions, design and reproducible local foundations | Only approved prerequisites authorize dependent implementation |
| M1 | Synthetic manual family task and one-time in-app reminder on both clients | All C1-M01 through C1-M10; not full MVP or public launch |
| M2 | Private Space types and reliable messaging | Encryption/access decisions before dependent messaging work |
| M3 | Public community and basic discovery | Publication, reporting and moderation gates before exposure |
| M4 | Remaining planning and agreed notification channels | Time, consent, cancellation and delivery evidence |
| M5 | Controlled Agent and memory | Scope, exact approvals, verification, audit and evaluations |
| M6 | Full release qualification | All agreed MVP outcomes and applicable launch gates |

Security, data rights, accessibility and observability apply throughout; M6 is integrated qualification, not the first time those controls are implemented.

## 8. Gated 30/60/90-Day Plan

Day 1 is the agreed kickoff with assigned capacity and authorization, not automatically this document's date. This is a forecast for M0/M1 work only. It does not schedule completion of M2-M6 within 90 days.

| Window | Planned deliverable | Accountable coordinator | Exit and dependency |
| --- | --- | --- | --- |
| Days 1-15 | Review the six C1 records and five proposed ADRs; confirm M1 scope and named owners; review the completed source mapping, public-content draft and nine follow-up handoffs | Technical Co-lead | Required owners accept M1 prerequisites; future unresolved choices retain owner and a before-use gate. Document routing or drafting alone does not close a decision. |
| Days 16-30 | Approved repository layout and local Compose environment; reproducible CI; canonical API schema and client-generation proof; design tokens and eight M1 surfaces; risk/test strategy | Backend lead | Both clients use the agreed contract; approved foundations run with synthetic data. Scaffolding requires separate implementation authorization. |
| Days 31-60 | Dependency-ordered ticket board; identity, family admission, task and one-time scheduling vertical slices integrated with Android and web; durable in-app delivery path | Backend lead | Demonstrate actual saved state and denied-access behavior; review progress against C1-M01 through C1-M10, without claiming unchecked cases. |
| Days 61-90 | Complete M1 workflow and focused duplicate/restart/reconnect/revocation/cancellation-race tests, accessibility/state checks and evidence review | QA lead | Product accepts M1 only after all ten checks have actual passing evidence and security/data-rights owners accept the bounded synthetic scope. |
| Beyond day 90, only if reforecast | Remaining M1 blockers or separately approved M2 preparation | Founder | Review causes, capacity and revised dates. A weeks 14-16 extension is outside the 90-day target; it cannot reduce mandatory gates. |

Start the backlog and design during the first window; days 31-60 mean implementation/refinement, not waiting a month to create tickets. Reforecast weekly using observed throughput and integration results, including review, security and test work. A target date never converts NOT RUN to PASS.

### Existing ADR Review

Five ADR draft files are present and each is PROPOSED. Review and reconcile these existing drafts rather than creating duplicate records or renumbering them. Required product confirmation remains necessary alongside section 3's technical/security review. Referenced canonical documents, generated packages and CI checks are separate deliverables whose existence and validation must be checked before use.

The [contract reconciliation index](CONTRACT_RECONCILIATION.md) now identifies the working [messaging](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) and [delivery](CHAPTER_20_DELIVERY_CONTRACT.md) review references, retained alternates and file-qualified ID/API mappings. The duplicate files are not two implementations or independent approvals. Editorial ADR corrections are complete; role assignment, policy acceptance and actual runtime evidence remain pending.

| Existing ADR | Subject and input | Decision owner | Still required |
| --- | --- | --- | --- |
| [ADR 0001](adr/0001-canonical-api-prefix.md) | Public `/v1` prefix and route ownership, from the [API draft](CHAPTER_07_API_REALTIME_CONTRACT.md) | Technical Co-lead | Backend/client agreement and required product confirmation; compatibility and route reconciliation |
| [ADR 0002](adr/0002-canonical-response-envelope.md) | One HTTP success/error envelope | Technical Co-lead | Validate exceptions and agree the schema location. Resolve the separate event-envelope handoff; this HTTP ADR does not define scoped event ordering or synchronization. |
| [ADR 0003](adr/0003-canonical-state-machines.md) | Domain-specific state and transition register | Technical Co-lead | Separate account, membership, invitation, task, schedule, run and approval machines; review actual transition/authority tables and generated checks, not only their proposed locations. Phase unexposed domains explicitly. |
| [ADR 0004](adr/0004-initial-authentication-method.md) | Auth baseline including the C18-D01 email/password-first proposal | Identity lead | Its context now correctly says C18-D01 PROPOSED; qualified technical/security/data-rights approval is still required. Invitation binding, verification transport and recovery remain separate prerequisites. |
| [ADR 0005](adr/0005-mvp-scope-and-milestones.md) | Full-MVP scope, notification channels and milestone order | Founder | The proposed M2-M4 order now matches the release/team baseline, with the older alternative retained as history. Accept or revise the actual scope/launch-channel decisions; C1-D03 stays OPEN and no push/email requirement is approved by editing the ADR. |

Subsequent decision work includes E2E/Agent access, history and revocation, provider feasibility/consent, launch jurisdictions/ages, data retention, and operating budgets/objectives. Five signed records do not automatically resolve these obligations. No ADR may introduce Agent health access, external communication or financial powers into M1.

## 9. Immediate Handoff and Evidence Status

The [reconciliation index](CONTRACT_RECONCILIATION.md) now records retained Chapter 19/20 alternatives, the completed Chapter 2/4/5 mapping and all nine follow-up drafts/qualification handoffs. The [public-content contract](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md) fills the page/post/comment/interaction design gap; existing event/API/scheduler/Agent contracts carry the adjacent refinements. Do not restart those drafts or treat the handoffs as implemented acceptance.

Next, assign actual named accountable owners and independent reviewers, then record approved/revised/deferred outcomes for the applicable existing ADR/domain proposals. No names, approval dates or staffed capabilities have been supplied by this planning task. Turn accepted M1 handoffs into bounded tickets; unapproved choices remain explicit blockers or narrowly authorized research. Later public-community and Agent qualification is not automatically a prerequisite for the manual M1 slice, and the Agent runtime/provider test gate remains NOT RUN.

This operating plan and its reconciliation links do not create a ticket board, monorepo scaffold, CI configuration, PR template or staffed team. The five existing ADRs remain PROPOSED inputs, not accepted decisions. Repository scaffolding, CI enforcement and application/provider work require their approved prerequisites and explicit authorization.

Documentation checks can establish links, reference validity, arithmetic and internal consistency. Runtime, database, device, browser, cryptographic, provider, security, accessibility, restore and product acceptance checks remain NOT RUN. No deployments, paid integrations or policy approvals are claimed.