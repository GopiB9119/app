# Documentation Map

This page lists the authoritative documents for each level of the authority hierarchy and for each area of the project. The hierarchy and the rules for resolving conflicts are set by the [Product Constitution](PRODUCT_CONSTITUTION.md), the highest authority. Start here before changing requirements, design, code or tests.

## Rules

1. **The [Product Constitution](PRODUCT_CONSTITUTION.md) is the highest authority.** Its [Article 4](PRODUCT_CONSTITUTION.md#article-4-authority-hierarchy) sets the nine levels listed below. A lower level never overrides a higher-level invariant.
2. **One authority per subject.** Other documents may repeat or summarize a subject. If they disagree with its authority, that is a conflict under rule 3.
3. **Conflicts follow [Article 5](PRODUCT_CONSTITUTION.md#article-5-resolving-conflicts):** detect, record in [section 40 of the Product Understanding](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository), find the newer confirmed decision, never choose silently, resolve, update the authoritative document, and only then implement.
4. **Code and tests are evidence** of what exists, not proof of what should exist ([Article 6](PRODUCT_CONSTITUTION.md#article-6-code-and-tests-are-evidence)). No task silently destroys existing behaviour ([Article 7](PRODUCT_CONSTITUTION.md#article-7-protecting-existing-behaviour)).
5. **Drafts are not approvals.** Contracts marked DRAFT and ADRs marked PROPOSED bind nothing until confirmed.
6. **Implementation is active** ([DEC-006](DECISIONS.md#accepted-decisions), replacing DEC-003). Work follows [TASKS.md](TASKS.md).

The product owner approves decisions. The [team plan](TEAM_ORGANIZATION_EXECUTION_PLAN.md) defines approval roles, but nobody is assigned to them. An AI assistant cannot approve anything.

## Authority Hierarchy

Level 1 is the highest. The rules are in [Article 4 of the Product Constitution](PRODUCT_CONSTITUTION.md#article-4-authority-hierarchy).

| Level | Authority | Documents |
| --- | --- | --- |
| 1 | Product Constitution | [PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 2 | Domain Contract | [DOMAIN.md](DOMAIN.md) |
| 3 | Data and Security Contracts | [CHAPTER_06_DATA_CONTRACT.md](CHAPTER_06_DATA_CONTRACT.md) (data model); [CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md) (security and privacy); [AI_POLICY.md](AI_POLICY.md) (use of AI) |
| 4 | Architecture | [ARCHITECTURE.md](ARCHITECTURE.md); [CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md); ADR-0001 to ADR-0004 in [adr/](adr/) |
| 5 | UX, API and Agent specifications | UX: [FEATURES_AND_SCREENS.md](FEATURES_AND_SCREENS.md), [CHAPTER_08_ANDROID_CONTRACT.md](CHAPTER_08_ANDROID_CONTRACT.md), [CHAPTER_09_WEB_CONTRACT.md](CHAPTER_09_WEB_CONTRACT.md) and the [design tokens](../packages/design-tokens/tokens.json). API: [CHAPTER_07_API_REALTIME_CONTRACT.md](CHAPTER_07_API_REALTIME_CONTRACT.md). Agent: [CHAPTER_12_AGENT_RUNTIME_CONTRACT.md](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md). The [area contracts](#area-contracts) below. |
| 6 | Roadmap | [CHAPTER_01_RELEASE_PLAN.md](CHAPTER_01_RELEASE_PLAN.md) (release scope, journeys and acceptance; section 12 is the proposed delivery order); [ADR-0005](adr/0005-mvp-scope-and-milestones.md) |
| 7 | Tasks | [TASKS.md](TASKS.md) |
| 8 | Implementation | Code and configuration in `backend/`, `web/`, `android/`, `agent/`, `infra/`, `packages/` (including the generated [openapi.json](../packages/openapi/openapi.json)) and `scripts/`; module READMEs; the [runbooks](runbooks/README.md) |
| 9 | Tests and verification evidence | Tests in `backend/tests/`, `tests/` and the Android test folders; [BUILD_STATUS.md](BUILD_STATUS.md); [EVALUATIONS.md](EVALUATIONS.md); [INCIDENTS.md](INCIDENTS.md); the status columns in [PRODUCT_FEATURES.md](PRODUCT_FEATURES.md); the dated [engineering baseline](ENGINEERING_BASELINE_2026-09-30.md) and [engineering audit](ENGINEERING_AUDIT_2026-10-01.md) |

Outside the levels: [DECISIONS.md](DECISIONS.md), where each decision takes the level of the document it changes; the [Product Understanding](PRODUCT_UNDERSTANDING.md), which records the product owner's explanation, the proposals and open questions, and the conflict register; the [changelog](../CHANGELOG.md); [AGENTS.md](../AGENTS.md); the original sources ([idea.md](../idea.md) and Chapters 1–20); and the supporting documents listed below.

## Authoritative Documents

| Area | Authority | Also see | Status |
| --- | --- | --- | --- |
| Product | [PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) (approved requirements and decisions in force) | [PRODUCT_UNDERSTANDING.md](PRODUCT_UNDERSTANDING.md) (explanation, proposals, open questions, conflict register); [PRODUCT_FEATURES.md](PRODUCT_FEATURES.md) (190 feature groups with build status); [CHAPTER_01_RELEASE_PLAN.md](CHAPTER_01_RELEASE_PLAN.md) (release scope, journeys, acceptance) | R1–R13 approved 2026-10-01; everything else labelled |
| Domain | [DOMAIN.md](DOMAIN.md), the Domain Contract for 34 entities | Area contracts below; [states package](../packages/states/README.md) | Current; entity-level open decisions U-01 to U-18 |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | [Backend and operations contract](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md); [ADRs](adr/) | As built, with links to the intended design |
| Security | [CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md) | Known gaps in [TASKS.md](TASKS.md); [account runbook](runbooks/ACCOUNT_ACCESS.md) | Draft; R12 approved |
| Privacy | [CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md) | [Product Understanding section 26](PRODUCT_UNDERSTANDING.md#26-privacy) | Draft; R11 and R12 approved |
| Agent system | [CHAPTER_12_AGENT_RUNTIME_CONTRACT.md](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) | [AI_POLICY.md](AI_POLICY.md); [file and retrieval contract](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md); [agent folder](../agent/README.md) | Draft; R7 and R8 approved |
| AI policy | [AI_POLICY.md](AI_POLICY.md) | Chapter 11, 12 and 14 contracts | Current |
| Data model | [CHAPTER_06_DATA_CONTRACT.md](CHAPTER_06_DATA_CONTRACT.md) (intended design) | As built: `backend/app/modules/*/models.py` and `backend/migrations/versions/`; table list in [DOMAIN.md](DOMAIN.md#modules-and-tables) | Draft; code at migration 0022 |
| API contracts | [CHAPTER_07_API_REALTIME_CONTRACT.md](CHAPTER_07_API_REALTIME_CONTRACT.md) (intended design) | As built: [openapi.json](../packages/openapi/openapi.json), generated from the code; [ADR-0001](adr/0001-canonical-api-prefix.md); [ADR-0002](adr/0002-canonical-response-envelope.md) | Draft; 119 operations built |
| UX | [FEATURES_AND_SCREENS.md](FEATURES_AND_SCREENS.md) | [Android contract](CHAPTER_08_ANDROID_CONTRACT.md); [web contract](CHAPTER_09_WEB_CONTRACT.md); [design tokens](../packages/design-tokens/tokens.json) | Updated with each build batch |
| Design system | [Design tokens](../packages/design-tokens/README.md) (values, generated into both apps) and the screen rules in [FEATURES_AND_SCREENS section 4](FEATURES_AND_SCREENS.md#4-rules-every-feature-follows) | [Android contract section 11](CHAPTER_08_ANDROID_CONTRACT.md#11-design-system-and-accessibility-contract); [web contract section 12](CHAPTER_09_WEB_CONTRACT.md#12-responsive-design-accessibility-and-performance) | Provisional ([DEC-013](DECISIONS.md#accepted-decisions)) |
| Decisions | [DECISIONS.md](DECISIONS.md) | [ADRs](adr/); the decision table in each contract; [CONTRACT_RECONCILIATION.md](CONTRACT_RECONCILIATION.md) | Current |
| Roadmap | [CHAPTER_01_RELEASE_PLAN.md section 12](CHAPTER_01_RELEASE_PLAN.md#12-proposed-delivery-sequence) | [ADR-0005](adr/0005-mvp-scope-and-milestones.md); [team plan](TEAM_ORGANIZATION_EXECUTION_PLAN.md) | PROPOSED, not approved; other documents give conflicting build orders (decision D6) |
| Tasks | [TASKS.md](TASKS.md) | | Current |
| Progress | [BUILD_STATUS.md](BUILD_STATUS.md) | Status columns in [PRODUCT_FEATURES.md](PRODUCT_FEATURES.md) | Updated with each build batch |
| Evaluations | [EVALUATIONS.md](EVALUATIONS.md) | Per-batch checks in [BUILD_STATUS.md](BUILD_STATUS.md); AI evaluation plan in section 13 of the Chapter 12 contract | Current |
| Incidents | [INCIDENTS.md](INCIDENTS.md) | [Runbooks](runbooks/README.md); failure procedures in section 13 of the Chapter 10 contract and section 11 of the Chapter 16 contract | None recorded |
| Changelog | [CHANGELOG.md](../CHANGELOG.md) | [BUILD_STATUS.md](BUILD_STATUS.md) for history before 2026-10-01 | Current |

## Area Contracts

Design detail for each product area. All are drafts; their PROPOSED and OPEN items are not approved.

| Area | Contract |
| --- | --- |
| Public pages and posts | [CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md) |
| Spaces, membership and access | [CHAPTER_03_SPACE_CONTRACT.md](CHAPTER_03_SPACE_CONTRACT.md) |
| Scheduling, reminders and care | [CHAPTER_13_SCHEDULING_CONTRACT.md](CHAPTER_13_SCHEDULING_CONTRACT.md) |
| Files, documents and retrieval | [CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) |
| Search, discovery and ranking | [CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md) |
| Trust, safety and moderation | [CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) |
| Events and collaboration | [CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) |
| Identity and invitations | [CHAPTER_18_IDENTITY_CONTRACT.md](CHAPTER_18_IDENTITY_CONTRACT.md) |
| Messaging and encryption | [CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) (working reference) |
| Notification delivery | [CHAPTER_20_DELIVERY_CONTRACT.md](CHAPTER_20_DELIVERY_CONTRACT.md) (working reference) |

## Supporting and Historical Documents

These are not authorities.

- [CONTRACT_RECONCILIATION.md](CONTRACT_RECONCILIATION.md): explains the duplicate Chapter 19 and 20 drafts and lists decision gates.
- [CHAPTER_19_CONVERSATIONS_ENCRYPTION_CONTRACT.md](CHAPTER_19_CONVERSATIONS_ENCRYPTION_CONTRACT.md) and [CHAPTER_20_NOTIFICATION_DELIVERY_CONTRACT.md](CHAPTER_20_NOTIFICATION_DELIVERY_CONTRACT.md): alternative drafts, kept for reference.
- [TEAM_ORGANIZATION_EXECUTION_PLAN.md](TEAM_ORGANIZATION_EXECUTION_PLAN.md): draft team structure and approval roles; nobody is assigned.
- [ENGINEERING_BASELINE_2026-09-30.md](ENGINEERING_BASELINE_2026-09-30.md): dated snapshot. ARCHITECTURE, TASKS and EVALUATIONS are the maintained versions.
- [ENGINEERING_AUDIT_2026-10-01.md](ENGINEERING_AUDIT_2026-10-01.md): dated read-only audit. Its actions are T39–T53 and X2 in TASKS, and its conflicts are C10 and C11 in the Product Understanding.
- [ENGINEERING_ASSESSMENT.md](ENGINEERING_ASSESSMENT.md): empty file of unknown origin.
- [Runbooks](runbooks/README.md): how to run and verify the local build.
- Module READMEs in `backend/app/modules/`, `web/src/features/` and the Android `feature/` folders: agents, discovery, files, integrations, realtime and safety keep the generated "reserved, not implemented" placeholder on all three platforms, as do web and Android platform and Android notifications. Discovery search, reports and blocks currently live in the community module, and the native reminder inbox lives in `feature/scheduling`.

## Update Rules

| When | Update |
| --- | --- |
| The product owner explains more of the product | PRODUCT_UNDERSTANDING (labels and sections 37–40); DECISIONS if something is decided; the Constitution if a requirement is approved |
| A decision is made | DECISIONS, then the affected authority document, then every lower document that repeats or depends on it, then CHANGELOG |
| Two sources disagree | Record the conflict in section 40 of the Product Understanding and follow [Article 5 of the Constitution](PRODUCT_CONSTITUTION.md#article-5-resolving-conflicts); change nothing that depends on it until it is resolved |
| Code changes | BUILD_STATUS with evidence; status in PRODUCT_FEATURES and FEATURES_AND_SCREENS; TASKS; CHANGELOG; ARCHITECTURE or DOMAIN if the structure changes; regenerate OpenAPI if the API changes |
| A full test suite or evaluation runs | EVALUATIONS (per-batch checks go in BUILD_STATUS) |
| Something affects real users, real data, security or availability | INCIDENTS, with follow-up tasks in TASKS |
