# Chapter 17: Events and Collaborative Planning Contract

Status: DRAFT FOR PRODUCT, EVENT PLANNING, DATA AND SECURITY REVIEW. This is a design and verification plan, not an implemented event workspace, ballot system, financial ledger or payment integration.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md), [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [file/document](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md), [discovery](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md) and [trust operations](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) drafts. It develops C16-T12 into event ownership, attendance, polls, tasks, budgets and collaborative workflow contracts.

- [Chapter 17](../Chapter17.md) is the source owner. The event domain is durable truth even when the Agent is unavailable. Existing identity, Space, conversation, file, scheduling, notification and safety domains keep their responsibilities; an event workspace is not a duplicate implementation of them.
- [Chapter 19](../Chapter19.md) and [Chapter 20](../Chapter20.md) remain encryption and external-delivery dependencies. Event membership, Space membership, invitation, attendance, financial visibility and Agent delegation are separate authorities.
- M1 remains the synthetic ordinary family task and confirmed one-time in-app reminder. A later event/collaboration demonstration is a separate slice, not an added M1 prerequisite or proof of the complete MVP.
- Planning estimates, contribution requests/pledges, expense assertions, payment evidence and actual money movement are distinct. No event role, poll result, Agent suggestion or generic approval enables an unapproved payment provider or prohibited MVP financial action.
- The source has complete final decisions and acceptance criteria. Preserve them below; added transaction, state, privacy, concurrency and operating rules are proposed refinements, not approved product policy or accounting/legal advice.
- Preserve original sources and earlier drafts. Continued planning does not authorize code, installs, real invitations/contacts, ballots, expenses, payments/refunds, model/provider calls, devices, provisioning, spending or deployment.
- All event, database, poll, ledger, scheduler, provider, client and security tests are NOT RUN. Document checks and synthetic arithmetic/state fixtures are not runtime integrity, anonymous-voting proof, payment reconciliation or production readiness.

## 2. Exact Source Topics and Principles

All thirty-eight numbered topic titles and source anchors are retained, including the first topic's different heading depth.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C17-S01 | Purpose and Scope | [17.1](../Chapter17.md#L3) |
| C17-S02 | Core Architectural Principles | [17.2](../Chapter17.md#L55) |
| C17-S03 | Event Types | [17.3](../Chapter17.md#L173) |
| C17-S04 | Event Lifecycle | [17.4](../Chapter17.md#L293) |
| C17-S05 | Event Ownership and Roles | [17.5](../Chapter17.md#L358) |
| C17-S06 | Event Visibility | [17.6](../Chapter17.md#L613) |
| C17-S07 | Event Data Model | [17.7](../Chapter17.md#L653) |
| C17-S08 | Event Creation Workflow | [17.8](../Chapter17.md#L757) |
| C17-S09 | Event Agent Integration | [17.9](../Chapter17.md#L803) |
| C17-S10 | Agent Event Workflow | [17.10](../Chapter17.md#L846) |
| C17-S11 | Event Discussions | [17.11](../Chapter17.md#L907) |
| C17-S12 | Poll Architecture | [17.12](../Chapter17.md#L947) |
| C17-S13 | Poll Lifecycle | [17.13](../Chapter17.md#L989) |
| C17-S14 | Poll Data Model | [17.14](../Chapter17.md#L1019) |
| C17-S15 | Shared Budget Architecture | [17.15](../Chapter17.md#L1064) |
| C17-S16 | Budget Lifecycle | [17.16](../Chapter17.md#L1112) |
| C17-S17 | Budget Data Model | [17.17](../Chapter17.md#L1146) |
| C17-S18 | Contribution Privacy | [17.18](../Chapter17.md#L1226) |
| C17-S19 | Payment Integration Boundary | [17.19](../Chapter17.md#L1264) |
| C17-S20 | Task and Checklist Architecture | [17.20](../Chapter17.md#L1305) |
| C17-S21 | Task Dependencies | [17.21](../Chapter17.md#L1368) |
| C17-S22 | Collaborative Workspace | [17.22](../Chapter17.md#L1394) |
| C17-S23 | Event Files | [17.23](../Chapter17.md#L1473) |
| C17-S24 | Event Notifications | [17.24](../Chapter17.md#L1510) |
| C17-S25 | Reminder Rules | [17.25](../Chapter17.md#L1556) |
| C17-S26 | Event Cancellation and Postponement | [17.26](../Chapter17.md#L1594) |
| C17-S27 | Event Versioning | [17.27](../Chapter17.md#L1642) |
| C17-S28 | Event APIs | [17.28](../Chapter17.md#L1693) |
| C17-S29 | Event Realtime Events | [17.29](../Chapter17.md#L1821) |
| C17-S30 | Conflict Resolution | [17.30](../Chapter17.md#L1846) |
| C17-S31 | Android Screens | [17.31](../Chapter17.md#L1916) |
| C17-S32 | Web/Desktop Screens | [17.32](../Chapter17.md#L1986) |
| C17-S33 | Event Metrics | [17.33](../Chapter17.md#L2044) |
| C17-S34 | Failure Handling | [17.34](../Chapter17.md#L2110) |
| C17-S35 | Security Requirements | [17.35](../Chapter17.md#L2174) |
| C17-S36 | Repository Structure | [17.36](../Chapter17.md#L2206) |
| C17-S37 | Final Architecture Decision | [17.37](../Chapter17.md#L2294) |
| C17-S38 | Acceptance Criteria | [17.38](../Chapter17.md#L2354) |

The four principle titles in section 17.2 remain verbatim.

| ID | Source principle |
| --- | --- |
| C17-R01 | Event Data Is Structured |
| C17-R02 | Agent Suggestions Are Not Confirmed Facts |
| C17-R03 | Financial Actions Require Explicit Confirmation |
| C17-R04 | Event Time Must Be Timezone-Aware |

## 3. Exact Event, Lifecycle and Role Inventory

All five type headings in section 17.3 are retained. Public/private audience, personal/group ownership, temporary lifetime and recurrence are not necessarily mutually exclusive dimensions.

| ID | Source event type heading |
| --- | --- |
| C17-F01 | Public Events |
| C17-F02 | Private Group Events |
| C17-F03 | Personal Events |
| C17-F04 | Temporary Events |
| C17-F05 | Recurring Events |

The source proposal and event-lifecycle sequences retain their values and order. Canonical transitions must separate review/publication, visibility, moderation, registration and temporal state; the sequences are not authorization by themselves.

| Source list | Values in source order |
| --- | --- |
| Proposal distinction, 17.2 | SUGGESTED, DRAFT, PROPOSED, PENDING_APPROVAL, CONFIRMED, CANCELLED, COMPLETED |
| Main event lifecycle, 17.4 | DRAFT, PROPOSED, PENDING_APPROVAL, PUBLISHED, OPEN_FOR_REGISTRATION, IN_PROGRESS, COMPLETED, ARCHIVED |

The six alternative source transitions are `DRAFT -> CANCELLED`, `PUBLISHED -> POSTPONED`, `PUBLISHED -> CANCELLED`, `PUBLISHED -> PRIVATE`, `PUBLISHED -> QUARANTINED`, `COMPLETED -> ARCHIVED`; arrows are normalized to ASCII. Moving to private or quarantined is not a reason to discard event history or grant access to another subsystem.

All ten role names in section 17.5 are retained. A role is interpreted with current event/Space/source permissions, actual target and per-module data access.

| ID | Source event role |
| --- | --- |
| C17-M01 | OWNER |
| C17-M02 | ORGANIZER |
| C17-M03 | CO_ORGANIZER |
| C17-M04 | MODERATOR |
| C17-M05 | FINANCE_MANAGER |
| C17-M06 | TASK_MANAGER |
| C17-M07 | ATTENDEE |
| C17-M08 | INVITEE |
| C17-M09 | VOLUNTEER |
| C17-M10 | VIEWER |

An invitee is not automatically an attendee/member, a finance manager does not obtain another user's payment credentials, and a public viewer is not entitled to the attendee roster, private location or internal budget. Data-subject consent and legal representative authority remain separate from an organizer label.

All ten permission-example rows and five source columns from section 17.5 are preserved. 'Yes' still requires current role scope, actual resource/parent, subject/audience policy and lifecycle; 'Configurable' is an unresolved product rule, not an unconditional allow. The source owner/finance budget examples do not grant unrelated event, banking or personal-finance access.

| ID | Permission | Owner | Organizer | Finance manager | Attendee |
| --- | --- | --- | --- | --- | --- |
| C17-G01 | Edit event details | Yes | Yes | No | No |
| C17-G02 | Cancel event | Yes | Configurable | No | No |
| C17-G03 | Manage attendees | Yes | Yes | No | No |
| C17-G04 | Create tasks | Yes | Yes | No | No |
| C17-G05 | Manage budget | Yes | Configurable | Yes | No |
| C17-G06 | Record expenses | Yes | Configurable | Yes | No |
| C17-G07 | Create polls | Yes | Yes | No | Configurable |
| C17-G08 | View private budget data | Yes | Configurable | Yes | No |
| C17-G09 | Invite members | Yes | Configurable | No | No |
| C17-G10 | Manage event agents | Yes | Configurable | No | No |

Additional source inventories retain their values and order. They need separate canonical transition/policy definitions, not one combined status field.

| Source list | Values in source order |
| --- | --- |
| Event visibility, 17.6 | PUBLIC, GROUP_MEMBERS, INVITE_ONLY, SELECTED_MEMBERS, FOLLOWERS, PRIVATE, UNLISTED, TEMPORARY_SHARE |
| Location visibility, 17.6 | EXACT_LOCATION, APPROXIMATE_LOCATION, CITY_ONLY, HIDDEN_UNTIL_APPROVED, HIDDEN_UNTIL_ATTENDING, PRIVATE |
| Attendance responses, 17.7 | GOING, MAYBE, NOT_GOING, WAITLISTED, PENDING |
| Poll lifecycle, 17.13 | DRAFT, OPEN, CLOSED, RESULTS_FINALIZED, ARCHIVED |
| Budget categories, 17.15 | VENUE, FOOD, DECORATION, TRANSPORT, EQUIPMENT, GIFTS, MUSIC, SECURITY, CLEANING, DOCUMENTATION, MISCELLANEOUS |
| Budget lifecycle, 17.16 | DRAFT, PROPOSED, APPROVED, ACTIVE, RECONCILIATION, CLOSED |
| Contribution states, 17.17 | NOT_REQUESTED, REQUESTED, PLEDGED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED, REFUNDED |
| Contribution visibility, 17.18 | OWNER_ONLY, FINANCE_MANAGERS, ALL_EVENT_MEMBERS, CONTRIBUTOR_ONLY, AGGREGATE_ONLY |
| Payment distinction, 17.19 | PLEDGE, PAYMENT_INITIATED, PAYMENT_CONFIRMED, PAYMENT_FAILED, REFUND_PENDING, REFUNDED |
| Task status, 17.20 | BACKLOG, TODO, IN_PROGRESS, BLOCKED, WAITING_APPROVAL, DONE, CANCELLED |
| File visibility, 17.23 | PRIVATE_EVENT, EVENT_MEMBERS, ORGANIZERS_ONLY, FINANCE_MANAGERS, PUBLIC_EVENT, SELECTED_ATTENDEES |

All twelve record headings from sections 17.7, 17.14 and 17.17 are retained. Their fields are conceptual; typed same-parent relationships, versioned changes and financial/voter privacy need the refinements below.

| ID | Source record |
| --- | --- |
| C17-L01 | events |
| C17-L02 | event_locations |
| C17-L03 | event_roles |
| C17-L04 | event_attendees |
| C17-L05 | event_invitations |
| C17-L06 | polls |
| C17-L07 | poll_options |
| C17-L08 | poll_votes |
| C17-L09 | budgets |
| C17-L10 | budget_categories |
| C17-L11 | expenses |
| C17-L12 | contributions |

All ten source poll-type labels in section 17.12 are retained. Anonymous/result-visibility and approval purpose are different dimensions from the tally algorithm; support must be explicit rather than accepting every label with one simplistic vote counter.

| ID | Source poll type |
| --- | --- |
| C17-I01 | Single-choice |
| C17-I02 | Multiple-choice |
| C17-I03 | Ranked choice |
| C17-I04 | Yes/no |
| C17-I05 | Date selection |
| C17-I06 | Time selection |
| C17-I07 | Budget preference |
| C17-I08 | Anonymous poll |
| C17-I09 | Approval poll |
| C17-I10 | Availability poll |

All twelve workspace-module labels in section 17.22 remain in source order.

| ID | Source workspace module |
| --- | --- |
| C17-N01 | Overview |
| C17-N02 | Schedule |
| C17-N03 | Tasks |
| C17-N04 | Budget |
| C17-N05 | Contributions |
| C17-N06 | Polls |
| C17-N07 | Files |
| C17-N08 | Discussions |
| C17-N09 | Attendees |
| C17-N10 | Announcements |
| C17-N11 | Agent |
| C17-N12 | Activity history |

## 4. Exact Final Decisions and Acceptance

All seventeen final decisions in section 17.37 are preserved verbatim.

| ID | Source final decision |
| --- | --- |
| C17-B01 | Events are first-class domain objects. |
| C17-B02 | Event data is structured and versioned. |
| C17-B03 | The agent creates proposals and executes authorized tools. |
| C17-B04 | Organizers confirm important changes. |
| C17-B05 | Public and private events use separate visibility enforcement. |
| C17-B06 | Polls support collective decisions. |
| C17-B07 | Budgets use deterministic calculations. |
| C17-B08 | Contributions are tracked separately from actual payments. |
| C17-B09 | Payment providers are accessed through adapters. |
| C17-B10 | Tasks support dependencies and assignments. |
| C17-B11 | Event files use event-scoped permissions. |
| C17-B12 | Reminders use the central scheduler. |
| C17-B13 | Notifications use the central communication system. |
| C17-B14 | Realtime updates use event contracts and sequence numbers. |
| C17-B15 | High-impact actions require approvals. |
| C17-B16 | Event cancellation and postponement are auditable. |
| C17-B17 | Event workspaces are modular and extensible. |

All twenty-eight acceptance criteria in section 17.38 are preserved verbatim. They describe required capabilities, not completed tests.

| ID | Source acceptance criterion |
| --- | --- |
| C17-A01 | Users can create public, private, personal, and temporary events. |
| C17-A02 | Event visibility is enforced. |
| C17-A03 | Events support timezone-aware dates. |
| C17-A04 | Organizers and co-organizers have scoped permissions. |
| C17-A05 | Invitations and attendance responses work. |
| C17-A06 | Events support discussions and announcements. |
| C17-A07 | Polls support voting and result finalization. |
| C17-A08 | Anonymous polls protect voter identity as promised. |
| C17-A09 | Tasks can be assigned and tracked. |
| C17-A10 | Task dependencies prevent invalid completion. |
| C17-A11 | Budgets support estimates, approvals, and actual expenses. |
| C17-A12 | Contributions are tracked separately from payments. |
| C17-A13 | Financial information is permission-controlled. |
| C17-A14 | Event files inherit correct visibility. |
| C17-A15 | Agents can create drafts and suggestions. |
| C17-A16 | Agents cannot finalize sensitive changes without approval. |
| C17-A17 | Event reminders use the central scheduler. |
| C17-A18 | Notifications respect consent and preferences. |
| C17-A19 | Calendar synchronization is idempotent. |
| C17-A20 | Event changes are versioned. |
| C17-A21 | Cancellation and postponement are supported. |
| C17-A22 | Realtime updates reach authorized clients. |
| C17-A23 | Android and web workspaces are implemented. |
| C17-A24 | Event failures do not create duplicate records. |
| C17-A25 | Budget calculations are deterministic. |
| C17-A26 | Event activity is auditable. |
| C17-A27 | Moderation can restrict or remove unsafe events. |
| C17-A28 | Private event data cannot enter public search or recommendations. |

### Tools, APIs and Events

All eighteen tool names from section 17.9 are retained. Registration is not permission to publish, invite externally, change finances or run every tool in the first release.

| ID | Source Agent tool |
| --- | --- |
| C17-U01 | event.create_draft |
| C17-U02 | event.get |
| C17-U03 | event.update_draft |
| C17-U04 | event.propose_schedule |
| C17-U05 | event.propose_location |
| C17-U06 | event.publish |
| C17-U07 | event.cancel |
| C17-U08 | event.postpone |
| C17-U09 | event.list_attendees |
| C17-U10 | event.send_invitation |
| C17-U11 | event.create_poll |
| C17-U12 | event.create_task |
| C17-U13 | event.create_budget |
| C17-U14 | event.calculate_estimate |
| C17-U15 | event.create_reminder |
| C17-U16 | event.summarize_discussion |
| C17-U17 | event.generate_checklist |
| C17-U18 | event.request_approval |

The fourteen method/path pairs from section 17.28 are preserved.

| ID | Source operation |
| --- | --- |
| C17-P01 | `POST /v1/events` |
| C17-P02 | `GET /v1/events/{event_id}` |
| C17-P03 | `PATCH /v1/events/{event_id}` |
| C17-P04 | `POST /v1/events/{event_id}/publish` |
| C17-P05 | `POST /v1/events/{event_id}/cancel` |
| C17-P06 | `POST /v1/events/{event_id}/attendance` |
| C17-P07 | `POST /v1/events/{event_id}/invitations` |
| C17-P08 | `POST /v1/events/{event_id}/polls` |
| C17-P09 | `POST /v1/polls/{poll_id}/votes` |
| C17-P10 | `POST /v1/events/{event_id}/tasks` |
| C17-P11 | `POST /v1/events/{event_id}/budgets` |
| C17-P12 | `POST /v1/budgets/{budget_id}/expenses` |
| C17-P13 | `POST /v1/budgets/{budget_id}/contributions` |
| C17-P14 | `GET /v1/events/{event_id}/activity` |

All eighteen realtime event names from section 17.29 are retained. Each needs a permitted projection, not a raw broadcast of financial, location or ballot details.

| ID | Source event |
| --- | --- |
| C17-E01 | event.created |
| C17-E02 | event.updated |
| C17-E03 | event.published |
| C17-E04 | event.postponed |
| C17-E05 | event.cancelled |
| C17-E06 | event.attendee.joined |
| C17-E07 | event.attendee.updated |
| C17-E08 | event.poll.opened |
| C17-E09 | event.poll.closed |
| C17-E10 | event.poll.vote_recorded |
| C17-E11 | event.task.created |
| C17-E12 | event.task.updated |
| C17-E13 | event.task.completed |
| C17-E14 | event.budget.updated |
| C17-E15 | event.expense.recorded |
| C17-E16 | event.contribution.updated |
| C17-E17 | event.file.attached |
| C17-E18 | event.announcement.created |

### Client and Security Inventories

All twenty-one Android event-screen labels from section 17.31 are preserved.

| ID | Source Android surface |
| --- | --- |
| C17-C01 | Event discovery |
| C17-C02 | Event detail |
| C17-C03 | Create event |
| C17-C04 | Edit event |
| C17-C05 | Event preview |
| C17-C06 | Attendee list |
| C17-C07 | Invitation management |
| C17-C08 | Calendar view |
| C17-C09 | Event schedule |
| C17-C10 | Task board |
| C17-C11 | Budget dashboard |
| C17-C12 | Expense form |
| C17-C13 | Contribution status |
| C17-C14 | Poll list |
| C17-C15 | Poll voting |
| C17-C16 | Event files |
| C17-C17 | Event discussion |
| C17-C18 | Event agent |
| C17-C19 | Event activity history |
| C17-C20 | Cancellation confirmation |
| C17-C21 | Event archive |

The ten source Event Agent Screen items are `Current event context`, `Suggested actions`, `Draft changes`, `Pending approvals`, `Tasks`, `Budget calculations`, `Evidence references`, `Tool execution status`, `Errors`, `Confirmation requirements`. The web workspace header is `Title, date, status, organizer`; its right-panel items are `Attendees`, `Upcoming reminders`, `Pending approvals`.

All ten main-navigation labels and fourteen organizer/moderator controls from section 17.32 are retained. These are surface labels, not a new approved route tree.

| ID | Source web main navigation |
| --- | --- |
| C17-H01 | Overview |
| C17-H02 | Schedule |
| C17-H03 | Tasks |
| C17-H04 | Budget |
| C17-H05 | Contributions |
| C17-H06 | Polls |
| C17-H07 | Files |
| C17-H08 | Discussion |
| C17-H09 | Agent |
| C17-H10 | Activity |

| ID | Source category | Source control |
| --- | --- | --- |
| C17-O01 | Organizer Controls | Publish |
| C17-O02 | Organizer Controls | Edit |
| C17-O03 | Organizer Controls | Postpone |
| C17-O04 | Organizer Controls | Cancel |
| C17-O05 | Organizer Controls | Manage attendees |
| C17-O06 | Organizer Controls | Assign roles |
| C17-O07 | Organizer Controls | Approve budget |
| C17-O08 | Organizer Controls | Export authorized event data |
| C17-O09 | Organizer Controls | Archive event |
| C17-O10 | Moderator Controls | Review reports |
| C17-O11 | Moderator Controls | Restrict event |
| C17-O12 | Moderator Controls | Hide event |
| C17-O13 | Moderator Controls | Review organizer history |
| C17-O14 | Moderator Controls | Apply event-level enforcement |

All fifteen security requirements in section 17.35 remain verbatim.

| ID | Source security requirement |
| --- | --- |
| C17-Q01 | Event access must be checked on every request. |
| C17-Q02 | Invitations must be scoped to event and recipient. |
| C17-Q03 | Attendance visibility must be configurable. |
| C17-Q04 | Exact locations must be encrypted. |
| C17-Q05 | Budget data must be role-protected. |
| C17-Q06 | Anonymous poll votes must remain unlinkable where promised. |
| C17-Q07 | Contribution records must not expose private financial data. |
| C17-Q08 | Files must use event-scoped authorization. |
| C17-Q09 | External invitations require consent. |
| C17-Q10 | Agent tools must be event-scoped. |
| C17-Q11 | Event cancellation requires appropriate permission. |
| C17-Q12 | Calendar tokens must be encrypted. |
| C17-Q13 | Webhook events must be verified. |
| C17-Q14 | Audit logs must record important changes. |
| C17-Q15 | Deleted or private events must be removed from discovery and recommendations. |

## 5. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C17-D01 | Event-domain ownership | First-class versioned structured event records with current actor/parent/target policy and durable work, independent of the Agent or client lifecycle. | PROPOSED |
| C17-D02 | Lifecycle dimensions | Separate publication/approval, audience, registration, temporal progress, moderation and archive/retention state; a transition in one cannot silently reset another. | PROPOSED |
| C17-D03 | Admission, roles and capacity | Define owner continuity, organizer/co-organizer/finance scopes, intended-recipient invitations, RSVP versus admitted membership, guest counts/waitlists, history and temporary expiry. | OPEN |
| C17-D04 | Time and occurrences | Reuse Chapter 13's named-zone/UTC/local intent and stable instance/exception identity, calendar conflict and deterministic scheduling rules. | PROPOSED |
| C17-D05 | Exact review and concurrent changes | Bind important edits/publication/cancellation to approved immutable intent and current versions; shared idempotency/outbox/receipt patterns prevent duplicate or stale actions. | PROPOSED |
| C17-D06 | Poll semantics and privacy | Select released ballot types, electorate/close/quorum/tie/change policies, result visibility and actual voter-identity protection. Anonymous UI labels alone are insufficient. | OPEN |
| C17-D07 | Tasks and dependencies | Reuse canonical scoped task/checklist records, current assignee rights and an acyclic dependency model with deterministic completion/cancellation behavior. | PROPOSED |
| C17-D08 | Budget arithmetic and provenance | Use reviewed exact currency units, explicit calculation/revision semantics, controlled expense corrections and approved deterministic totals; model text is not financial truth. | PROPOSED |
| C17-D09 | Contributions, privacy and payment boundary | Define request/pledge/confirmed receipt/refund evidence, balance meanings, permitted audiences and provider/legal/consent gates. No money movement in the initial record-only slice. | OPEN |
| C17-D10 | Module audiences and sharing | Decide attendee roster/location/discussion/file/poll/budget visibility and history per module. Public event discovery does not publish every workspace module or source artifact. | OPEN |
| C17-D11 | Agent planning | Shared controlled tools produce reviewable proposals and authorized effects with exact approvals, aggregate budgets, current context and truthful receipts; no automatic clinical/financial authority. | PROPOSED |
| C17-D12 | Cancellation and recovery | Immediately stop new disallowed admissions/changes/dispatch at defined gates, then reconcile dependent tasks/polls/schedules/calendar/provider work without duplicate effects or false rollback. | PROPOSED |
| C17-D13 | Client and interface contract | Reconcile missing routes, canonical status/amount/cursor types, conflict UX, accessible workspaces and allowed offline writes before code generation. | OPEN |
| C17-D14 | Operating evidence | Select scale/limits, retention, polling/close timing, currency/rounding edge policy, cost/SLOs, restore and required security/quality evidence for released scope. | OPEN |

These eight proposals and six open decisions remain unapproved. A demo, poll majority, organizer role or continued planning cannot override current authority, participant privacy or the boundary between a financial record and an actual payment.

## 6. Domain Ownership, State and Integrity

### Canonical Records and Relationships

| Record group | Source references | Required refinement |
| --- | --- | --- |
| Event, location and versions | C17-L01, C17-L02 | Stable event/series/instance identity, typed owner/Space/page parent, immutable approved revisions and independently controlled location/meeting-link projection. |
| Roles, invitations and attendance | C17-L03, C17-L04, C17-L05 | Current role/grant history, intended invitee/version/expiry, distinct RSVP/admission/guest capacity and attributed check-in. A foreign key proves existence, not permission. |
| Poll configuration, options and ballots | C17-L06, C17-L07, C17-L08 | Versioned electorate/options/rules, poll-bound option references, one eligible ballot identity with revisioned choices and privacy-safe receipt/tally lineage. |
| Budget/category/expense/contribution | C17-L09, C17-L10, C17-L11, C17-L12 | Explicit currency/scale, immutable approved plan revisions, controlled posted/correction records and provenance; contribution summaries are not payment credentials or a provider ledger. |
| Shared tasks/checklists and dependency graph | Canonical task domain from Chapter 6 | Event/parent scope, current assignee/approval, graph revision and same-scope references; no independent event-task engine with conflicting completion rules. |
| Discussions/files/announcements | Canonical conversation and file domains | Typed event links and narrower per-thread/file/grant audiences with history, immutable media versions and current retrieval access. |
| Schedules/calendar/delivery | Chapters 13 and 20 | Stable occurrence/effect identity, event revision, permitted recipients and current consent; clients/Agents do not run the authoritative timer. |
| Approval/activity/workflow receipts | Existing approval/audit/job authorities | Exact immutable intent, current approvers, version/preconditions, mandatory audit/outbox and independent dependent-effect status. |

Do not duplicate users/memberships/files/transactions merely because the source uses event-specific views. Composite same-parent constraints must bind a poll option to its poll, an expense category to its budget, a budget to its event/Space, and a receipt to its actual source. Protect nullable ownership/uniqueness semantics deliberately. Separate source state, approval status, user-reported facts, computed totals and external evidence instead of letting one writable status string control them all.

Public discoverability, member admission, registration window, temporal progress, moderation, cancellation and retention have independent policies. A public event can still have a private organizer chat, hidden exact location, restricted contributions and anonymous ballots. Event ownership is not ownership of every participant's identity, finance or health data. Quarantine/parent restriction cannot be cleared by an organizer publishing a new schedule, and archive must not reactivate expired invitations, grants or queued work.

### Collaboration Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C17-K01 | Event records, not Agent conversation, are durable truth. | Structured owned domain writes, approved versions and receipts; manual workflows remain usable without a model. |
| C17-K02 | Permissions follow each actual resource and module. | Actor/event/parent/history/role/subject/audience and current restrictions across APIs, workers, search, exports, tools and notifications. |
| C17-K03 | Invitations, attendance and capacity are distinct. | Intended recipient binding, current admission/registration rules, atomic capacity accounting and explicit guest/waitlist/expiry policy. |
| C17-K04 | Material changes and approvals bind exact versions. | Current authorized human review, expected revisions and stable logical requests; a poll/Agent suggestion is not formal approval. |
| C17-K05 | Event time and recurrence use one deterministic authority. | Named zone/local intent/UTC, stable series-instance mapping, approved offsets and calendar/schedule revision reconciliation. |
| C17-K06 | Poll ballots and finalization are atomic and rule-bound. | Current electorate/time/configuration, one controlled ballot revision, valid options, bounded selected tally and deterministic closure. |
| C17-K07 | Poll privacy is an explicit tested promise. | Separated identity/ballot access, safe receipts/results/logs/events and no claim of anonymity from a plain voter hash. |
| C17-K08 | Task dependencies remain acyclic under concurrent edits. | Same-scope graph/version serialization, current assignment/approval and explicit completion/override/reopen/cancel semantics. |
| C17-K09 | Monetary amounts and totals are exact and reproducible. | Explicit currency/scale, checked integer/decimal arithmetic, approved rounding/FX provenance and immutable calculation inputs. |
| C17-K10 | Contributions and expenses are not payment confirmation. | Separate request/pledge/received assertion/evidence/settlement/refund identities, controlled corrections and current financial privacy. |
| C17-K11 | Future payment effects require a separate authorized integration. | Verified provider/account/currency/amount/idempotency/webhook and approval; unknown outcomes reconcile before another attempt. |
| C17-K12 | Linked media and collaboration never widen audience implicitly. | Current event plus actual source/thread/file/location/financial restrictions, safe public projections and lineage-aware deletion. |
| C17-K13 | Agent tools cannot invent authority, evidence or completion. | Shared domain services, scoped allowed tools, exact approval, bounded execution and truthful partial results. |
| C17-K14 | Cancellation stops new disallowed work before cleanup. | Versioned denial/stop intent and idempotent dependent-effect reconciliation; no false recall, automatic refund or restoration of revoked work. |
| C17-K15 | APIs and clients preserve confirmed versus pending state. | Typed schema/version/idempotency, authorized replay, currency/time/ballot privacy and account-isolated offline semantics. |
| C17-K16 | Audit, metrics and recovery prove only observed outcomes. | Durable required audit/work intent, bounded resources/retention, private telemetry and isolated restore of current grants and effect history. |

## 7. Event Creation, Admission and Versioned Changes

### C17-W01 Draft, Review and Publish an Owned Event

Authenticate the creator and validate the intended account/Space/page parent, current organizer/creation policy and permitted event type/audience. Personal, private-group, temporary and recurring attributes compose only under explicit policy; an event form cannot turn a private Space into a public community. Derive actor/ownership fields server-side and keep draft audience minimal. Reuse the current role/admission model instead of accepting a caller-supplied owner or finance grant.

Validate nonempty bounded title, supported typed date/time, IANA zone, end after start, positive capacity if set, consistent registration/approval settings and location visibility. Resolve ambiguous/nonexistent local time through Chapter 13 policy, not a fixed UTC offset or guessed client zone. A date-only event is not implicitly midnight UTC. Recurrence and event-relative reminders use the selected maintained temporal engine, supported subset and explicit series/instance semantics.

Preview the exact timing/zone, affected recipients/audience, admitted roles, location projection, draft modules and any external/calendar/notification effects. Suggested venue/date/budget and member conversation remain proposals until an eligible human confirms the required exact revision. Choosing a poll winner does not independently publish, book a venue, charge members or send invitations. A public event must pass current moderation/media/public-index policy before discovery; creating a draft or successful upload is not clearance.

Commit the permitted event/revision, approved intent and required audit/outbox/work receipts through the owning service. Idempotent retries of the same creation do not create a second event or budget; changed intent conflicts. Domain data persists even if the Agent/browser stops. Status reports saved draft, pending approval, published scope and dependent work separately rather than a single 'all done' response while calendar or notices are pending.

### C17-W02 Invite, Register and Admit Under Current Capacity

Bind each invitation to the event/instance, intended verified account or separately approved contact, inviter authority, recipient interpretation, expiry and maximum use. Follow Chapter 18's intended-recipient identity rules; possessing a recycled phone number or a forwarded link is not sufficient proof of the intended person. GET/prefetch does not accept an invitation. Event admission never silently creates Space membership or grants historical conversations/files, and Space membership alone does not override invite-only or selected-attendee policy.

Distinguish a person's response (going/maybe/not going), organizer-approved registration, active admitted participation, waitlist position, guest count and actual check-in. A GOING tap is not proof of physical attendance; check-in has an attributed authorized actor and its own fraud/duplicate policy. Specify what guests count toward capacity, whether anonymous guests get accounts/rights and how guardian/representative consent is handled. No guest label bypasses couple/solo Space membership constraints.

Serialize capacity reservation/admission, cancellation, guest-count change and waitlist promotion against a stable event/instance capacity authority. Count-then-insert without an appropriate lock/constraint/atomic reservation can oversubscribe under concurrent responses. Idempotent repeat requests reuse the same admission/reservation; expiry/release and promotion are bounded durable operations, not assumptions about a notification being delivered. Capacity reduction below occupied/reserved units requires an explicit conflict/waitlist/cancellation decision, not automatic eviction.

Recheck registration window, current inviter/recipient permission, blocks/restrictions, event cancellation, parent eligibility and capacity after lock waits using current authoritative time. Cleanup lag cannot extend an invitation or event expiry; PostgreSQL transaction-start `now()` is not necessarily current time after waiting. Define static versus dynamic eligibility, rejoin/history and owner departure explicitly. Invite revocation, new roles or archive restoration cannot reset old acceptance receipts to admit someone again.

Attendee names, contact details, guest information, invite status, counters, exact location and virtual meeting links have separate audience rules. HIDDEN_UNTIL_ATTENDING requires a precise current admitted-status definition; a self-declared RSVP cannot automatically unlock a sensitive address. Location/link metadata, maps, geocoding requests, image EXIF and lock-screen notices must not leak more than the viewer may see. External invitation dispatch uses purpose/channel consent and the Chapter 20 provider boundary, never a generic event role alone.

#### Public RSVP Mapping Proposal

This refines COV-G03 in the [reconciliation index](CONTRACT_RECONCILIATION.md) for the [public-content contract](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md). C17-D03/C17-D10 remain OPEN. Preserve Chapter 2's six labels as user-facing facts, not one writable enum mixing interest, capacity and attendance.

| Chapter 2 label | Proposed owning fact | Allowed change and evidence |
| --- | --- | --- |
| Interested | Account's interest response | No reservation, admission, private address or roster grant. Notification choices remain separate. |
| Going | Account intends to attend | Registration can still be pending/waitlisted/denied. Display a separately confirmed place only after atomic admission/reservation succeeds. |
| Not going | Account declines or withdraws | Release only its actual active reservation once; retain truthful prior attendance/history under retention policy. Do not cancel the event. |
| Waitlisted | Admission service has queued an eligible registration | Server-owned state with reviewed ordering/expiry; no self-promotion or capacity grant by PATCH. A promoted offer is not accepted unless the chosen policy explicitly admits it. |
| Canceled | Registration cancellation or event cancellation, explicitly identified | Return the affected object/reason scope. Event cancellation stops admission/future work; one attendee's cancellation cannot change everyone else's responses. |
| Attended | Attributed check-in/attendance record | Authorized organizer/device or a separately labeled self-report; never inferred from Going, presence, read receipts or a delivered reminder. Corrections append attributed history. |

Proposed response shape separates response, registration, reservation units and attendance with their own revisions, plus current allowed actions. Each command binds event/instance, actual participant/representative and expected version; stable retries cannot release twice or revive an expired offer. Notification is a consequence of the durable transition, not acceptance evidence.

Before public enablement, select default audiences for roster/name, counts, exact location/meeting link, contact and discussion independently. Public description does not select PUBLIC for the other fields. A current admitted-status check must happen on reads, metadata, exports, reminders and map links; narrowing removes eligibility before cache cleanup. Extend C17-V04 and the existing audience/cancellation checks with simultaneous final-slot admission, withdrawal/promotion, stale offer accept, event cancel, representative changes and public-to-private projection races. These are required tests, not executed results.

### C17-W03 Edit Roles and Material Event Details Without Lost Updates

Use expected event/module revision and current actor/target policy for organizer transfer, role grants, time/location/capacity/visibility/registration/description changes. Define one accountable owner and continuity under transfer/departure, with target-aware co-organizer and finance limits. No self-promotion, delegated grant beyond the grantor's power, or inheritance of another participant's private data. Membership/role withdrawal invalidates pending privileged changes at their current execution boundary.

Material changes create an immutable new revision and invalidate or revalidate the exact prior approvals/preview. Published descriptions and attachments can affect moderation/safety, so the source last-write-wins example for 'non-critical descriptions' is not a blanket permission to overwrite published reviewed content. Restrict last-write-wins, if approved, to truly low-risk draft/local preference fields; do not merge financial approval, dates, ballots, location or audience changes without explicit conflict semantics.

The source `409 Conflict` example and Chapter 7's representation-precondition rules must be reconciled: typed domain version conflict and an HTTP If-Match precondition failure may have distinct canonical status/code meanings. Neither client should silently refetch and overwrite. Show the actual changed fields, author/time and new review requirement within the user's permitted view; audit/history must not reveal earlier private locations or other contributors' finances to new/public viewers.

Coordinate source-grant changes with search/public projections and dependent modules. Publishing a previously private event does not automatically publish its discussions, receipts, roster or file sources. A newly restrictive parent/moderation state blocks dependent disclosure before cache/index cleanup. Postponement/cancellation use C17-W11 rather than generic patching of status fields that bypass schedule and registration effects.

## 8. Polls, Decisions, Tasks and Checklists

### C17-W04 Admit Ballots and Finalize a Versioned Poll

Define a released poll's electorate, purpose, choice/ranking algorithm, immutable option IDs, selection limits, start/close instants, change policy, result visibility, quorum/tie/abstention and member-departure/deletion treatment. Anonymous voting and an 'approval poll' are independent configuration dimensions. Date/time options bind their actual zone/instant semantics; a poll preference does not become formal budget/event approval unless the separate approved governance contract explicitly allows it and all authority checks hold.

Verify current actor eligibility and poll/event/parent state at a serialized vote acceptance boundary, with current time after waits. A delayed close worker cannot keep voting open past the agreed deadline. Define the exact half-open window and receipt semantics; a retry for an already committed ballot after closure can return its permitted receipt, not cast a fresh late vote. Changes to options/question/rules after votes begin require an explicit new version/revote policy, never relabel existing selections to mean something else.

Store one logical ballot per eligible voting identity/poll revision and atomically replace its allowed choices when vote changes are permitted. Multiple-choice/ranked ballots cannot be implemented as unrelated per-option inserts with partial success; uniqueness, poll-bound option foreign keys, distinct selections, limits and stale ballot-version checks must hold together. Durable receipts/outbox and tally input versions prevent duplicate counting after retries, timeout or double taps. A client pending vote is not counted until the server accepts it, and an offline retry still faces the current deadline/eligibility rule.

Closing and finalization are distinct: close admissions at the required boundary, then compute from a consistent accepted-ballot snapshot under the declared algorithm and finalize a versioned result. Use maintained reviewed tally libraries for complex ranked-choice rules rather than inventing an election engine. Specify exhausted ballots, ties, quorum, invalid ballots and any eligible-voter changes; a background retry cannot finalize two contradictory results or silently change a winner. A correction/reopen is an explicit audited new decision/version.

The source `voter_id_hash` field does not itself provide anonymity. A plain hash of a known account ID is guessable/linkable, and logs, authenticated request IDs, timing, activity events, exports, small-result changes or moderator joins can reveal a ballot. Define precisely who must not link votes and whether the service can; ordinary users/moderators must not gain a join path under the promised anonymous mode. Separate eligibility/dedup handles and ballot custody, minimize correlation, restrict key/service access and use a reviewed privacy-preserving protocol where required, not hand-written cryptography. Hide individual-vote events/results and apply the chosen cohort/disclosure policy; repeated before/after totals can still reveal single voters.

A named-poll first slice can be released before an unverified anonymous design, but it must be labeled named and cannot claim the source anonymous criterion has passed. Delete/retention/moderation policy for ballots must reconcile integrity, voter rights and the stated privacy promise without retaining a hidden broadly accessible identity lookup. Agents may summarize authorized finalized results, never cast impersonated votes, infer private voter identities or treat a majority as permission to move money.

### C17-W05 Assign Work and Maintain an Acyclic Dependency Graph

Reuse canonical event-scoped tasks/checklists with current assignee eligibility, due-time zone, attachments, approvals and visibility. General/shopping/volunteer/approval/document/venue/food/transport/reminder/follow-up/financial task labels do not grant extra capabilities; completing 'pay vendor' is an attributed task report, not bank settlement. Assignment and delegated reassignment follow actual event/Space role and person consent policy, not an Agent assigning anyone it finds in contacts.

Validate every dependency against the same authorized graph/context and explicit permitted cross-context relationship if ever supported. Use a maintained graph library or reviewed database graph algorithm with cycle/self-edge/duplicate/reference checks; serialize graph mutation by graph revision/lock so concurrent A-depends-on-B and B-depends-on-A edits cannot both pass separate acyclic snapshots. Bound graph size/traversal/locking and avoid leaking restricted dependency titles through errors.

Completion checks the current task/assignee/approval and prerequisite states at the same coordinated decision boundary. Prevent blocked completion unless an authorized explicit override with reason/scope/history is allowed; record it as an override, not a fictional completed predecessor. Checklist completion, task done, waiting approval and event completion are separate facts. A cancelled prerequisite is not automatically satisfied, and reopening an upstream task needs a declared downstream invalidation/review policy rather than silently rewriting past work.

Store durable changes and notification/scheduler intent atomically with stable action identity. Reminders execute through Chapter 13 using the actual task/event revision. Duplicate callbacks or offline command replay cannot double-complete, reassign a removed participant, revive a cancelled task or mark a next occurrence done. Board reordering and task content/status edits have separate conflict rules; moving a card visually does not skip server dependency or approval checks.

## 9. Budgets, Contributions and Payment Boundaries

### C17-W06 Calculate and Approve a Reproducible Budget

Keep estimated, proposed, approved and actual/reconciled amounts separate, with input/source, currency, category and version provenance. A deterministic backend calculation owns totals; an Agent can draft items or explain results but cannot supply an authoritative sum, invent a receipt or change an approved contribution target. Budget approval binds the exact budget/event revision, category allocations, currency/FX/rounding policy and required authorized humans, not a mutable dashboard total.

Represent money with a reviewed currency definition and exact minor units or bounded fixed-precision decimals. Do not use binary floating point or assume every currency has two decimal places. Wire amounts use explicit validated decimal/integer-string semantics that survive JavaScript numeric limits; reject excess precision, non-finite values, overflow and currency mismatches rather than round implicitly. Treat positive expense entries, adjustments, refunds, liabilities and transfers as distinct typed operations under an approved sign convention.

If currency conversion is released, retain original amount/currency and a reviewed immutable rate quote/source/time/pair, precision, rounding mode and converted amount used in that calculation. Do not sum mixed currencies or rewrite past approved totals using a new rate. Fees, taxes, discounts, estimates and conversion gains/losses need explicit domain meaning; a calculated event budget is not an accounting certification. External rate providers and financial data disclosure remain approval gates.

Calculate totals from a coherent authorized set of accepted records and versions, with snapshot/transaction boundaries or a versioned materialization that states its freshness. Category totals reconcile to the budget under the declared rules. Splitting a total across participants must allocate any indivisible minor-unit remainder deterministically under an explicitly approved rule, preserve the total and record which participant received which target. A changing member order or retry cannot shift an already approved share silently.

Expense submission records the actual creator/time, claimed expense date, amount/currency/category, approval state and protected immutable receipt reference. A screenshot/OCR result is evidence to review, not independent provider confirmation. Correct posted/approved records through attributed reversal/adjustment or controlled version history rather than deleting the old amount. Repeated submissions use a stable logical expense identity; equal amount/date alone cannot distinguish duplicate from two legitimate expenses.

Concurrent budget/expense approvals coordinate against current budget revision and any approved reservation/overspend rule so two reviewers do not both spend the same headroom. Decide whether limits are warnings, approval gates or hard spending constraints. Recording an already incurred expense must not fabricate a lower total merely to stay within a cap; preserve the claim and expose its review/over-budget status. If totals cannot be verified, keep submitted records durable and show unavailable or explicitly last-confirmed-as-of data, never an invented successful calculation.

### C17-W07 Track Contributions Without Fabricating Settlement

Separate requested target, pledged amount, reported received amount, independently verified payment evidence, refunded amount and outstanding/overpayment state by contributor and currency. A pledge is not available cash, payment initiation is not confirmation and event cancellation is not a refund. Record provenance and actor for manual receipt/settlement assertions with labels that do not misrepresent bank/provider verification. Aggregate collected amounts use the declared evidence policy; estimates, pledges and initiated/unknown payments are not silently counted as received.

Use immutable logical contribution/receipt/payment/refund identities and controlled correction/reversal entries, linked to the actual budget/event/contributor. Validate same-parent/currency references, positive magnitude/type rules and authorized changes. A manual receipt later matched to a provider receipt must not count the same funds twice; reconciliation uses explicit evidence/identity mapping, not amount/time guessing. Net received, remaining target, approved expense total and funding gap are distinct calculations; negative/over-target outcomes must be explained rather than clamped away without a separate overpayment figure.

Choose exact per-field/audience meaning for OWNER_ONLY, FINANCE_MANAGERS, ALL_EVENT_MEMBERS, CONTRIBUTOR_ONLY and AGGREGATE_ONLY. Event owner and financial data subject are not synonymous; the source permission matrix applies only within reviewed shared-budget authority. Keep bank details, credentials, full transaction IDs, private notes and unapproved contribution information out of public events, generic activity, notifications, exports, Agent context and accessible client caches. An aggregate can still identify a single contributor by subtraction or small cohorts; define grouping/delay/suppression and avoid promising anonymity from hidden names alone.

The initial record-only slice performs no payments or refunds. Future payment integration requires separate product/legal/provider/custody review, verified payer/payee/account binding, authorized exact amount/currency/purpose, explicit confirmation, approved adapter credentials and bounded cost/risk controls. A finance role, approval poll or generic 'approved' Agent state is not payment consent. Avoid collecting raw payment credentials in event records or model context; use the selected provider's reviewed secure flow.

For any later enabled integration, distinguish durable payment intent, provider attempt, known/unknown result, settlement and refund lineage. Authenticate webhook signatures/account binding and durably deduplicate provider event/effect IDs before acknowledging; validate amount/currency/status against the intended payment. Handle duplicate, contradictory and out-of-order callbacks without double credit/refund or trusting a client redirect as proof. A timeout after provider acceptance can be unknown; reconcile with the provider before retrying or using another channel/adapter. There is no general atomic transaction spanning PostgreSQL and a payment network.

Refund pending is distinct from confirmed refund, and chargebacks/disputes/reversals need separate later-reviewed states beyond the source example enum. Refund/correction approval cannot exceed relevant eligible funds or clear another unrelated receipt under the chosen policy. Contribution reminders and notices obey recipient consent/privacy and bounded frequency; they must not shame a person by exposing private amounts or imply a debt/obligation not established by the approved model.

## 10. Workspace Audiences and Agent Planning

### C17-W08 Link Discussions, Files and Activity With Narrow Audiences

Compose the twelve workspace modules from their owning services with an explicit permitted projection per actor. Public overview/discussion, organizer-only planning, finance threads, private invitations, participant tasks and poll results are not one universal 'event member' audience. An event role can narrow eligible actions but does not silently join a conversation, unlock a source file, create a historical membership grant or give an attendee another participant's private records.

Bind discussion threads and files to the actual event/source/parent with current role/history policy. Announcements and summaries retain the disclosure limits of their sources; a private budget conversation cannot become a public Agent summary simply because it appears under the same event. Attachment creation verifies the caller may share the exact immutable source version to the intended event audience. Public publication must not follow an inherited private source link without explicit audience-expansion authority and media/moderation checks.

Apply Chapter 14 scan/quarantine/version and Chapter 15 discovery rules before previews, RAG retrieval, indexes, thumbnails, metadata, exports and notification deep links. OCR from a receipt is an uncertain extraction, not a verified expense or payment. Exact location/virtual meeting URLs and geocoding/map previews have their own consent/provider/access controls; encrypted coordinates do not prevent a plaintext address leaking in a title, attachment or log. Unlisted URLs are not credentials, and expiring signed downloads have the earlier in-flight/revocation limits.

Activity is an audience-filtered committed change projection, not a raw audit feed. Show allowed actor/what/when/current version and actual notification status without exposing hidden voters, deleted private fields, confidential moderator reasons or contributor details. Restricted and anonymous changes may need generic aggregated invalidations instead of actor-level timeline items. Export authorized event data only after current per-module policy, reauthentication/approval where required and protected archive delivery; organizer status is not an unrestricted dataset export role.

### C17-W09 Turn Agent Proposals Into Explicit Authorized Effects

The event Agent is a scoped configuration of the shared runtime, not another owner or always-running scheduler. Admit a request against the actual event/Space/actor, allowed modules/tools, current classification/consent and budget. Untrusted discussion, poll text, file content, receipts and tool outputs remain data, not instructions to widen scope, disclose private amounts, approve a payment or mark tasks complete.

Collect material missing requirements and draft typed proposals for dates, locations, tasks, budget estimates, polls or checklists. Mark suggestion/draft/proposed/pending approval versus confirmed state truthfully; unverified venue availability, organizer attendance, payment status and estimates cannot be presented as facts. Deterministically validate time, graph rules and calculations through the domain services. No autonomous booking, clinical/financial action or external invitation is implied by a tool name or a plausible narrative.

Reviewers see the exact affected event/module revisions, recipients, content/audience, time/amount/currency and dependent effects within their own authority. Conversation agreement, a poll tally or a generic approval checkbox does not replace the required formal organizer/finance/subject approval. Changed intent, source state, roles or deadlines invalidate or revalidate the approval under the canonical policy. The first financial record-only slice cannot unlock provider money movement by approving an estimate.

Execute permitted tools through the same domain services as manual forms using stable business-effect identity and receipts that survive node retries/replanning. A same-database confirmed bundle can be transactional where the chosen contract requires it; external calendars, notifications and providers need independent durable effects/reconciliation, not an assumed global rollback. No partial unapproved mutation is allowed. If approved substeps commit and later work fails, show the known completed subset plus pending/failed/unknown outcomes rather than claim the whole plan succeeded or silently undo real records.

On pause/cancel/recovery recheck current event lifecycle, user/delegation permissions, approval versions and aggregate time/tool/cost limits before new work. An Agent crash cannot erase event data; checkpoint replay cannot resurrect a cancelled event or repeat invitations/budget entries. A scheduled reminder continues only under its own still-valid approved authority, independent of whether the planning model remains active. Manual event workflows stay available during model outage.

## 11. Scheduling, Calendar and Cancellation

### C17-W10 Schedule Event-Relative Work Through the Central Services

Represent each reminder with the actual event/instance or task/poll/contribution target, source revision, temporal intent, recipient and purpose/channel policy. Reuse Chapter 13's stable logical occurrence and dispatch identities, not event-version-plus-UTC keys that create a second copy after postponement. Event starts/end, task deadlines and poll close times are distinct anchors. Clarify whether 'one day before' means a local calendar day or a fixed 24-hour duration; resolve relative wording from its original request reference/zone.

Generate only bounded approved work with current recipient eligibility, consent, quiet hours, deadline/late policy and exact content audience. Recheck event cancellation, role/membership changes and source authority before dispatch. A public event reminder must not reveal private attendance/location/budget data on lock screens or external channels. Per-recipient acknowledgment is not event attendance, task completion or payment evidence. Repeated reminders have reviewed windows/counts and stop conditions rather than endless Agent loops.

Reuse the canonical internal event and Chapter 13 calendar mapping to avoid two calendars each regenerating reminders from the other. External calendar sync needs approved minimal OAuth scopes/encrypted token custody, provider-account/event/series-instance identity, version conflict policy and atomic cursor/change progress. Inbound edits and exceptions create reviewed source revisions; provider invitation/update emails are external effects requiring the appropriate review. Unknown writes reconcile before retry, and a provider outage leaves the canonical event intact with pending sync status.

Commit schedule/outbox intent with domain change where shared ownership allows, otherwise retain a durable event-to-scheduler command/receipt/reconciler. Losing a queue publication cannot lose accepted work. Revalidate after expiry/lock waits with current time; a late close/archive/reminder worker does not extend the actual voting/admission/consent window. Realtime is a current authorized projection, not an exact delivery or timing guarantee.

### C17-W11 Cancel, Postpone, Archive and Recover Deliberately

An authorized cancellation binds event/instance scope, expected revision, required approval, reason and the reviewed dependent-effect policy. Atomically mark the current event cancellation/stop epoch, close new disallowed registration/actions and record mandatory audit plus durable cleanup/notification intent. Do not wait for a provider notice before enforcing cancellation: the source's sequential illustration is not permission to keep accepting attendees or sending reminders while notification is failing.

Reconcile future reminders, calendar writes, Agent parent/child runs, task/checklist work, poll admission, pending budget approvals, contribution requests and workspace activity using stable per-effect identities. Pause/cancel behavior is explicit per domain; never mark unfinished tasks done or erase accepted ballots to hide a cancellation. Preserve posted expenses, payment evidence and disputes under their retention rights. Source 'handle contributions' does not mean automatic refund, fabricated refunded status or reversal of a payment without its separate authorized workflow.

A cancellation before the relevant dispatch/action commitment blocks the new effect; after commitment an external send/calendar/payment may be in flight or unknown and requires honest reconciliation. Late callbacks can update actual evidence but cannot reopen the event, registration, approvals or recurring schedule. Already delivered messages/downloads cannot be recalled. An organizer-facing timeline distinguishes cancellation accepted, required effects pending, failed and fully reconciled within the defined scope.

Postponement preserves event identity while recording a new approved schedule revision and explicit series/instance/following-instance scope. Show the exact new date/time/zone/location, affected attendee confirmations, tasks/deadlines/polls and possible external notices. Do not blindly add the same elapsed offset to every dependent task or clinical/financial deadline. New/old future occurrences are mapped/superseded under Chapter 13 rules, not both dispatched; uncommitted stale work rechecks the revision. Calendar failure does not silently revert the agreed event or duplicate external entries.

Archive, temporary membership expiry, cancellation, deletion and safety quarantine differ. Expiry checks remain effective when cleanup stops; archive history is readable only under current grants and does not revive past invitations/votes/approvals. Deletion first excludes source/derived discovery and new access, then purges permitted lineage with explicit legal/financial/ballot retention or hold exceptions. Restoring a backup/archive must reapply current revocations, cancellation, evidence and provider outcomes before opening traffic or effects, not resurrect an old 'published' status.

## 12. Interfaces, Client Experience and Operations

### Source Tool, API and Event Mapping

All eighteen tools and fourteen source APIs map once below. Missing operations remain explicit canonical-schema work; no generic patch endpoint may set protected lifecycle, payment, approval or ballot-result fields.

| Behavior group | Source tools | Source APIs | Contract |
| --- | --- | --- | --- |
| Draft/read/review/publish | C17-U01, C17-U02, C17-U03, C17-U04, C17-U05, C17-U06, C17-U18 | C17-P01, C17-P02, C17-P03, C17-P04 | C17-W01, C17-W03, C17-W09: exact typed proposal/current authority and approved immutable effects. |
| Cancel/postpone | C17-U07, C17-U08 | C17-P05 | C17-W11: current version/scope, immediate stop gate and dependent reconciliation. No source postpone path is invented. |
| Attendance/invitation | C17-U09, C17-U10 | C17-P06, C17-P07 | C17-W02: intended recipient, module privacy and atomic capacity/registration. |
| Polls | C17-U11 | C17-P08, C17-P09 | C17-W04: electorate/ballot identity, deadline, privacy and deterministic versioned results. |
| Tasks/checklists | C17-U12, C17-U17 | C17-P10 | C17-W05: current assignee, graph integrity and explicit completion/approval. |
| Budgets/expenses/contributions | C17-U13, C17-U14 | C17-P11, C17-P12, C17-P13 | C17-W06, C17-W07: exact calculations, provenance, field privacy and no implicit payment. |
| Reminders | C17-U15 | None in section 17.28 | C17-W10: canonical scheduler/notification contracts and stable occurrence identity. |
| Discussion/activity | C17-U16 | C17-P14 | C17-W08, C17-W09: authorized source summary and minimal current activity projection. |

Missing contracts include event list/search, owner/role changes, invite acceptance/revoke/list, waitlist/check-in/guest changes, series exceptions/postpone/archive/restore, poll edit/open/close/finalized results/ballot receipt, task update/dependencies/override, budget approval/correction/reconciliation, contribution evidence, discussion/file links, export and calendar/schedule linkage. Reconcile existing Chapters 7/13/14/18 routes before adding variants. The record-only APIs cannot accept caller-provided paid/refunded/provider-confirmed fields as proof.

Use Chapter 7's typed envelopes, exact request/idempotency and representation-aware concurrency contract. Currency amounts, revisions, event sequence and resource IDs have explicit safe wire types; binary floating-point JSON numbers and client clocks do not decide ledger/voting truth. Current authorization precedes receipt/result/history disclosure. All reads are bounded and scoped, including attendee lists, financial aggregates, ballot results, activity and export status. Error details never echo restricted source titles, bank identifiers or voter identity.

| Event group | Source events | Projection boundary |
| --- | --- | --- |
| Lifecycle and revision | C17-E01, C17-E02, C17-E03, C17-E04, C17-E05 | Approved current event/instance revision and actual pending effects; do not broadcast hidden locations or imply cancellation recalled messages. |
| Attendance | C17-E06, C17-E07 | Current roster/count/privacy projection, not every participant's contact/guest details. |
| Polls | C17-E08, C17-E09, C17-E10 | Closed is not necessarily finalized. Anonymous mode avoids voter/timing/selection disclosure; use only allowed receipt or aggregate invalidation. |
| Tasks | C17-E11, C17-E12, C17-E13 | Current authorized task/graph version and attributed completion/override, not financial or clinical proof. |
| Finance | C17-E14, C17-E15, C17-E16 | Permission-controlled record/evidence/calculation version; submitted expense or updated contribution is not bank settlement. |
| Media and announcements | C17-E17, C17-E18 | Exact eligible source version and permitted audience, not an automatic public share. |

Resource/module versions, schema versions and scoped stream sequences are distinct. Follow Chapter 7 snapshot/replay and Chapter 8/9 account-generation rules. Repeated REST/WS observations merge by canonical identity, not matching text/amount/time. A coarse authorized event stream may need invalidations to avoid leaking hidden module activity; do not expose global gaps/counts or anonymous-vote timing through an otherwise redacted payload.

### Workspace Mapping

All twelve source modules, twenty-one Android screens, ten web navigation labels and fourteen web controls map once below. Their implementation shares domain semantics while preserving existing platform navigation/layout conventions.

| Workspace flow | Source modules | Android surfaces | Web navigation | Web controls |
| --- | --- | --- | --- | --- |
| Overview, discovery and composing | C17-N01 | C17-C01, C17-C02, C17-C03, C17-C04, C17-C05 | C17-H01 | C17-O01, C17-O02 |
| Schedule and lifecycle | C17-N02 | C17-C08, C17-C09, C17-C20, C17-C21 | C17-H02 | C17-O03, C17-O04, C17-O09 |
| Admission and role management | C17-N09 | C17-C06, C17-C07 | Header/right-panel controls | C17-O05, C17-O06 |
| Tasks and checklists | C17-N03 | C17-C10 | C17-H03 | Domain-specific actions under existing permissions |
| Budget and contributions | C17-N04, C17-N05 | C17-C11, C17-C12, C17-C13 | C17-H04, C17-H05 | C17-O07 |
| Polls and results | C17-N06 | C17-C14, C17-C15 | C17-H06 | Domain-specific actions under existing permissions |
| Files | C17-N07 | C17-C16 | C17-H07 | Domain-specific actions under existing permissions |
| Discussions and announcements | C17-N08, C17-N10 | C17-C17 | C17-H08 | Domain-specific actions under existing permissions |
| Agent proposals and approvals | C17-N11 | C17-C18 | C17-H09 | Exact permitted tool/action review |
| Activity and authorized export | C17-N12 | C17-C19 | C17-H10 | C17-O08 |
| Case-scoped event moderation | No unrestricted workspace module | Existing Chapter 16 safety flow | Existing Chapter 16 workspace | C17-O10, C17-O11, C17-O12, C17-O13, C17-O14 |

Clearly distinguish suggested, saved draft, pending approval, confirmed, pending sync, queued/sent notification, server-accepted ballot, finalized result, reported received and provider-confirmed states. Display exact date/zone/currency and relevant evidence/freshness; unavailable calculations stay unavailable. A vote/attendance/task edit pending offline is not applied server-side and may be rejected after closing, cancellation, changed membership or version. Never replay privileged finance/approval commands blindly after account/role switch.

Reuse stable responsive operational layouts, tab navigation, typed date/time/zone/currency inputs, selectors for poll type, radio/checkbox/rank controls appropriate to a released ballot, and explicit action buttons/icons with accessible names. Task-board drag/drop needs keyboard and non-drag alternatives. Anonymous-mode/result-visibility review, exact financial/cancellation confirmation and conflict resolution must be readable without hidden truncation. Support large text, long titles/amounts, RTL/mixed scripts, keyboard/TalkBack/screen readers and current permitted context on narrow screens; avoid overlapping desktop side panels on mobile.

### C17-W12 Observe, Reconcile and Recover the Released Workspace

Deploy the source's modules within the established domain-owned modular monolith and bounded workers; its repository tree does not demand separate service deployments or a second task/scheduler engine. Bound participant/guest/poll-option/ballot/graph/file/activity counts, expensive recalculations, concurrency, queues, exports and model/provider budgets. Ordinary manual updates, reminders and reports must not wait on an Agent conversation or a large budget export.

Track durable creation/approval/attendance/ballot/ledger/reconciliation state and actual latency/failure/duplicate/conflict counts. Registration conversion, check-in/attendance, pledged contribution, received evidence, event completion and task completion have different denominators and cannot be inferred from clicks or notifications. Protect exact locations, individual votes, finance details and private event names from ordinary logs/metric labels/analytics exports; apply cohort/privacy policy to aggregates and case-scoped access to audit.

Use stable logical jobs, current versions/fencing, bounded retries and receipts for creation, poll close, budget recompute, reminder/calendar work, archive and cleanup. Broker acknowledgment or outbox publication is not completion; reconciliation finds accepted work with missing progress. Deterministic invalid input is not endlessly retried. Provider outage/fallback obeys current consent and unknown-effect reconciliation; manual event truth survives failed notifications/calendars/Agent calls with honest pending state.

Version changes must preserve source identities, currency/rounding definitions, ballot rules and pending commands. Migrate with approved compatibility and rollback boundaries rather than resetting counters, vote identities, dedup receipts or financial history. A stale closed-poll client can view a permitted receipt/result but cannot reopen voting through a replay. A budget failure preserves accepted expense records and recomputes verified totals when possible, not returns an Agent estimate as success.

Restore into isolation without live outbound effects; reconcile current event/role/Space restrictions, cancellation, consent, ballot/financial retention/deletion and post-snapshot provider results before serving or dispatching. Durable local data and an object backup are not proof that external payments/calendar invites were rolled back. Incomplete authority or unknown effects stay blocked/reviewed. Define real RPO/RTO, workload and operational targets before production, and test actual components with synthetic identities and evidence rather than real money or private family data.

## 13. Proposed Verification and Synthetic Controls

The following thirty-two evidence families refine the source acceptance/security requirements. All application/database/poll/ledger/payment/scheduler/Agent/client tests are NOT RUN. One family may require multiple positive, negative, concurrent and fault cases; these rows are not passing-test counts or financial/privacy certification.

| ID | Verification family and required evidence | Traceability |
| --- | --- | --- |
| C17-V01 | Typed ownership and audience: all event types/roles/permission examples, parent/Space/subject/history and module grants, forged source IDs and public/private discovery keep current authority distinct from a role label. | C17-S01, C17-S02, C17-S03, C17-S05, C17-S06, C17-S07, C17-S35; C17-R01; C17-B01, C17-B05; C17-A01, C17-A02, C17-A04, C17-A28; C17-Q01, C17-Q15; C17-K01, C17-K02, C17-K12; C17-W01, C17-W02, C17-W03 |
| C17-V02 | Draft/review/publication: required fields, public moderation, positive capacity, timezone gap/fold/end/date-only cases, independent state dimensions and exact human review cannot publish an Agent suggestion as confirmed. | C17-S02, C17-S04, C17-S08; C17-R01, C17-R02, C17-R04; C17-B02, C17-B04, C17-B15; C17-A01, C17-A03, C17-A16; C17-K01, C17-K04, C17-K05; C17-W01 |
| C17-V03 | Intended invitation: recipient/account/destination binding, expired/revoked/replayed links, GET prefetch, existing admission and external consent do not grant Space/history access or admit an unintended contact. | C17-S05, C17-S07, C17-S08; C17-A04, C17-A05; C17-Q02, C17-Q09; C17-K02, C17-K03; C17-W02 |
| C17-V04 | Capacity and attendance concurrency: guest weights, repeated RSVP, simultaneous last-slot registrations, waitlist promotions/expiry, capacity decrease and check-in attribution preserve limits without equating GOING to physical attendance. | C17-S05, C17-S07, C17-S27; C17-A05, C17-A24; C17-Q02, C17-Q03; C17-K03, C17-K04, C17-K16; C17-W02, C17-W03 |
| C17-V05 | Location and roster privacy: exact/coarse/hidden-until-admitted projection, meeting links/map/EXIF/geocoding/counters/exports and membership changes cannot disclose private attendance or address data through public metadata. | C17-S06, C17-S07, C17-S18, C17-S35; C17-A02, C17-A05, C17-A28; C17-Q03, C17-Q04; C17-K02, C17-K03, C17-K12; C17-W02, C17-W08 |
| C17-V06 | Important edit and role conflicts: concurrent date/amount/location/audience/organizer changes, stale approvals, owner continuity/target grants and last-write-wins boundaries preserve exact versions and explicit user resolution. | C17-S05, C17-S27, C17-S30; C17-B02, C17-B04, C17-B15; C17-A04, C17-A16, C17-A20; C17-K02, C17-K04, C17-K15; C17-W03 |
| C17-V07 | Public/private and safety changes: source/media/parent restrictions, private-to-public audience review and caches/indexes/recommendations/exports cannot leak internal modules or bypass current event-level enforcement. | C17-S03, C17-S06, C17-S23, C17-S35; C17-B05, C17-B11; C17-A02, C17-A14, C17-A27, C17-A28; C17-Q08, C17-Q15; C17-K02, C17-K12, C17-K14; C17-W01, C17-W03, C17-W08, C17-W11 |
| C17-V08 | Released poll rules: all ten type/configuration distinctions, electorate, option identities, selection/ranking bounds, quorum/ties and results visibility are explicit; changed wording/options cannot reinterpret existing ballots. | C17-S12, C17-S13, C17-S14; C17-B06; C17-A07; C17-K04, C17-K06, C17-K07; C17-W04 |
| C17-V09 | Ballot integrity and close races: concurrent/repeated/multiple-choice replacements, invalid cross-poll options, stale revisions, late offline retry, after-lock expiry and missing close worker preserve one valid accepted ballot. | C17-S12, C17-S13, C17-S14, C17-S34; C17-A07, C17-A24; C17-K04, C17-K06, C17-K15; C17-W04 |
| C17-V10 | Anonymous-poll promise: actual eligibility/ballot separation, keyed/cryptographic design as selected, moderator joins, low-entropy hashes, logs/events/exports/timing/small-result changes and deletion cannot relink identities within the promised threat model. | C17-S12, C17-S14, C17-S29, C17-S35; C17-A08; C17-Q06; C17-K02, C17-K07, C17-K12, C17-K16; C17-W04, C17-W08 |
| C17-V11 | Deterministic finalization: consistent accepted-ballot snapshot, actual selected tally library, close/finalize retry, ties/quorum/exhaustion and membership/correction policy yield a stable versioned result, not automatic organizer/financial approval. | C17-S10, C17-S12, C17-S13; C17-R02, C17-R03; C17-B06; C17-A07, C17-A16; C17-K04, C17-K06, C17-K13; C17-W04, C17-W09 |
| C17-V12 | Task assignment and checklist state: current assignee/reassignment/approval, event/Space references, due-time/attachments, duplicate/offline updates and financial task labels cannot create unauthorized side effects or fictional completion. | C17-S20; C17-B10; C17-A09; C17-K02, C17-K05, C17-K08, C17-K15; C17-W05 |
| C17-V13 | Dependency graph concurrency: self/cross-context/cyclic references, concurrent opposite edges, blocked completion, explicit override and cancelled/reopened prerequisite semantics are enforced at the shared graph decision boundary. | C17-S20, C17-S21; C17-B10; C17-A09, C17-A10; C17-K04, C17-K08; C17-W05 |
| C17-V14 | Exact monetary arithmetic: explicit currency/exponent, wire precision, overflow/non-finite/excess decimals, mixed currency, versioned FX/fees/rounding and deterministic remainder allocation preserve every minor unit and input provenance. | C17-S15, C17-S16, C17-S17; C17-R03; C17-B07; C17-A11, C17-A25; C17-K09, C17-K10; C17-W06 |
| C17-V15 | Budget/expense authority and corrections: exact approved revision, competing approvals/reservations/overspend policy, same-budget category/receipt, stable expense identity, audit history and unavailable totals retain claims without hidden mutation or invented sums. | C17-S15, C17-S16, C17-S17, C17-S30, C17-S34; C17-B07, C17-B15; C17-A11, C17-A20, C17-A24, C17-A25, C17-A26; C17-Q05, C17-Q14; C17-K02, C17-K04, C17-K09, C17-K16; C17-W06 |
| C17-V16 | Contribution provenance and reconciliation: target/pledge/asserted receipt/provider evidence/refund distinction, duplicate evidence matching, currency binding, outstanding/overpayment/funding-gap semantics and corrections never fabricate settlement. | C17-S17, C17-S18, C17-S19; C17-R03; C17-B08; C17-A12, C17-A25; C17-K09, C17-K10, C17-K11; C17-W07 |
| C17-V17 | Financial field privacy: all five visibility choices, owner-versus-subject/finance scopes, aggregate differencing, receipt/transaction IDs and activity/RAG/export/notice/cache paths expose only permitted amounts and evidence. | C17-S05, C17-S18, C17-S23, C17-S35; C17-A13, C17-A14; C17-Q05, C17-Q07, C17-Q08; C17-K02, C17-K10, C17-K12; C17-W06, C17-W07, C17-W08 |
| C17-V18 | Future provider boundary, only if separately enabled: exact confirmation/payer/payee/amount/currency, secure adapter credentials, signed/deduplicated/account-bound webhooks, timeout/late/refund/dispute reconciliation and no autonomous financial action. | C17-S02, C17-S19, C17-S35; C17-R03; C17-B08, C17-B09, C17-B15; C17-A12, C17-A13, C17-A16; C17-Q13; C17-K04, C17-K10, C17-K11; C17-W07 |
| C17-V19 | Scoped collaboration and media: twelve modules, public/organizer/finance threads, immutable attachment sharing/history, scan/RAG/source grants, summaries and authorized exports never broaden the original audience. | C17-S11, C17-S22, C17-S23; C17-B11, C17-B17; C17-A06, C17-A14; C17-Q01, C17-Q08; C17-K02, C17-K12, C17-K15; C17-W08 |
| C17-V20 | Agent proposal and review: all eighteen tools, scoped context, untrusted poll/file/discussion input, deterministic dates/calculations and actual approved revisions keep draft/pending/confirmed distinct and forbidden MVP actions disabled. | C17-S02, C17-S09, C17-S10; C17-R01, C17-R02, C17-R03; C17-B03, C17-B04, C17-B15; C17-A15, C17-A16; C17-Q10; C17-K01, C17-K04, C17-K09, C17-K13; C17-W01, C17-W09 |
| C17-V21 | Agent failure and effect identity: replay/replan/child work, approved partial commits, cancellation/delegation change and model outage preserve event data, stop new disallowed actions and reconcile unknown effects without duplicate invitations/records. | C17-S09, C17-S10, C17-S34; C17-B03; C17-A15, C17-A16, C17-A24; C17-Q10; C17-K01, C17-K04, C17-K13, C17-K14, C17-K16; C17-W09, C17-W11 |
| C17-V22 | Central deterministic reminders: zone/local/calendar versus elapsed offsets, recurrence/exception/event revision, stable occurrence ID, late/quiet windows and recipient withdrawal avoid duplicate or wrongly timed notices across postponement. | C17-S02, C17-S24, C17-S25, C17-S27; C17-R04; C17-B12; C17-A03, C17-A17; C17-K03, C17-K05, C17-K14; C17-W10, C17-W11 |
| C17-V23 | Calendar mapping and recovery: exact account/event/series-instance identity, encrypted minimal-scope tokens, inbound/outbound conflict, cursor/idempotency, failed/unknown writes and invitation emails preserve canonical event truth without loops or duplicate entries. | C17-S24, C17-S25, C17-S26, C17-S34; C17-A19; C17-Q12, C17-Q13; C17-K04, C17-K05, C17-K14, C17-K16; C17-W10, C17-W11 |
| C17-V24 | Notice consent and truthful outcome: category/channel/recipient/quiet-hour policy, no unapproved fallback, sensitive lock-screen minimization and sent/delivered/read versus attendance/vote/payment evidence remain distinct. | C17-S24, C17-S25, C17-S34; C17-B13; C17-A18; C17-Q02, C17-Q03, C17-Q07, C17-Q09; C17-K02, C17-K03, C17-K05, C17-K10, C17-K12; C17-W02, C17-W07, C17-W10 |
| C17-V25 | Cancel/postpone transaction and races: exact authority/scope/revision, immediate admission/dispatch gate, queued/committed tasks/polls/Agent/reminders/calendars and partial provider outcomes are reconciled without auto-refund or false rollback. | C17-S26, C17-S27, C17-S30; C17-B16; C17-A20, C17-A21; C17-Q11, C17-Q14; C17-K04, C17-K05, C17-K10, C17-K11, C17-K14; C17-W03, C17-W11 |
| C17-V26 | Temporary lifetime, archive and deletion: role/history expiry despite cleanup outage, source/derivative exclusion, ballot/finance/file retention, safety holds and isolated restore never revive cancelled work, revoked invitations or old provider effects. | C17-S03, C17-S04, C17-S26, C17-S35; C17-A01, C17-A02, C17-A21, C17-A27, C17-A28; C17-Q01, C17-Q11, C17-Q15; C17-K02, C17-K03, C17-K12, C17-K14, C17-K16; C17-W02, C17-W08, C17-W11, C17-W12 |
| C17-V27 | Canonical APIs and concurrency: fourteen source paths/approved gaps, typed actor/resource/ballot/currency/version, expected-version versus HTTP preconditions, bounded reads and currently authorized idempotency receipts prohibit direct paid/status patches. | C17-S28, C17-S30; C17-B02; C17-A20, C17-A24; C17-Q01, C17-Q02, C17-Q05, C17-Q06; C17-K02, C17-K04, C17-K06, C17-K09, C17-K15; C17-W03, C17-W04, C17-W07 |
| C17-V28 | Realtime and account recovery: eighteen event meanings, scoped sequence/snapshot/replay, deduplication, anonymous/financial/hidden-module metadata and late old-account responses expose only authorized current state. | C17-S29, C17-S31; C17-B14; C17-A08, C17-A13, C17-A22; C17-Q03, C17-Q06, C17-Q07; C17-K02, C17-K07, C17-K12, C17-K15; C17-W04, C17-W07, C17-W08 |
| C17-V29 | Client workflow and accessibility: twenty-one Android/ten web navigation/fourteen controls, Agent context/review, exact amount/zone/ballot labels, keyboard task-board alternatives, large text/RTL, pending/offline/conflict/cancellation and role switch. | C17-S22, C17-S31, C17-S32; C17-B17; C17-A23; C17-K04, C17-K06, C17-K09, C17-K13, C17-K15; C17-W01, C17-W02, C17-W04, C17-W05, C17-W06, C17-W09, C17-W11 |
| C17-V30 | Audit and private metrics: durable actor/intent/result/version records and actual attendance/contribution/completion denominators; locations, votes, finance/contact/evidence canaries stay out of ordinary logs/exports/caches. | C17-S18, C17-S27, C17-S33, C17-S35; C17-A13, C17-A26; C17-Q04, C17-Q06, C17-Q07, C17-Q14; C17-K02, C17-K07, C17-K10, C17-K12, C17-K16; C17-W06, C17-W07, C17-W08, C17-W12 |
| C17-V31 | Capacity, faults and recovery: bounded participants/ballots/graphs/exports, lost jobs/fenced workers, notification/calendar/Agent outage, budget recompute, compatible upgrades and isolated restore retain required authority and accepted records. | C17-S07, C17-S14, C17-S17, C17-S33, C17-S34, C17-S36; C17-A19, C17-A24, C17-A25; C17-K01, C17-K03, C17-K06, C17-K08, C17-K09, C17-K14, C17-K16; C17-W02, C17-W04, C17-W05, C17-W06, C17-W10, C17-W11, C17-W12 |
| C17-V32 | Separate synthetic collaboration journey: exact event proposal/publication, intended capacity admission, named poll result, authorized dependency completion and record-only budget/contribution, then postpone/cancel/revoke/retry controls on Android/core web. | C17-S01, C17-S02, C17-S37, C17-S38; C17-R01, C17-R02, C17-R03, C17-R04; C17-K01, C17-K02, C17-K03, C17-K04, C17-K05, C17-K06, C17-K08, C17-K09, C17-K10, C17-K13, C17-K14, C17-K15, C17-K16; C17-W01, C17-W02, C17-W03, C17-W04, C17-W05, C17-W06, C17-W07, C17-W08, C17-W09, C17-W10, C17-W11, C17-W12 |

### Synthetic Capacity, Ballot, Graph, Money and Timing Fixture

This JSON is documentation, not an application schema or actual ledger/ballot dataset. All identities, accepted-record flags and amounts are synthetic assumptions. It has five finite groups. The equal-split remainder rule, capacity and timing examples are illustrative policies for checking the arithmetic, not approved product defaults or anonymous-voting evidence.

```json
{
	"fixture_kind": "synthetic_event_collaboration_controls",
	"runtime_executed": false,
	"admission": {
		"capacity_units": 4,
		"admitted_units": 2,
		"reserved_units": 1,
		"request_with_one_guest_units": 2,
		"expected_guest_request_allowed": false,
		"single_person_control_units": 1,
		"expected_single_person_allowed": true,
		"expected_committed_occupied_units": 4,
		"replay_additional_units": 0
	},
	"poll": {
		"starts_at": "2026-09-19T10:00:00Z",
		"closes_at": "2026-09-19T11:00:00Z",
		"request_started_at": "2026-09-19T10:59:59Z",
		"after_lock_at": "2026-09-19T11:00:01Z",
		"expected_new_ballot_after_lock_allowed": false,
		"ballot_mode": "named_single_choice",
		"options": ["date-a", "date-b"],
		"accepted_ballots_before_change": [
			{ "voter": "synthetic-a", "revision": 1, "choices": ["date-a"] },
			{ "voter": "synthetic-b", "revision": 1, "choices": ["date-b"] }
		],
		"accepted_change_before_close": { "voter": "synthetic-a", "revision": 2, "choices": ["date-b"] },
		"expected_ballot_count_after_change": 2,
		"expected_final_counts": { "date-a": 0, "date-b": 2 },
		"expected_formal_event_approval_created": false
	},
	"tasks": {
		"task_ids": ["venue-choice", "venue-confirm", "transport-book"],
		"dependencies": [
			{ "task": "venue-confirm", "depends_on": "venue-choice" },
			{ "task": "transport-book", "depends_on": "venue-confirm" }
		],
		"done_task_ids": ["venue-choice"],
		"attempt_complete_task": "transport-book",
		"expected_blocked": true,
		"cycle_control": { "task": "venue-choice", "depends_on": "transport-book" },
		"expected_cycle_control_rejected": true
	},
	"money": {
		"currency": "INR",
		"minor_unit_exponent": 2,
		"calculation_mode": "synthetic_record_only",
		"split_total_minor": "10001",
		"split_rule": "equal_floor_then_ordinal_remainder",
		"ordered_participant_ids": ["synthetic-a", "synthetic-b", "synthetic-c"],
		"expected_split_minor": ["3334", "3334", "3333"],
		"accepted_expense_minor": ["4250", "3065"],
		"assumed_accepted_receipt_minor": ["4500", "1000"],
		"assumed_confirmed_refund_minor": ["500"],
		"pledged_minor_not_received": "7000",
		"initiated_minor_not_confirmed": "2000",
		"target_minor": "12000",
		"expected_expense_total_minor": "7315",
		"expected_net_received_minor": "5000",
		"expected_remaining_target_minor": "7000",
		"expected_funding_gap_minor": "2315",
		"foreign_currency_control": "USD",
		"foreign_amount_minor": "100",
		"expected_direct_mixed_currency_sum_allowed": false,
		"actual_money_movements_executed": 0
	},
	"schedule_change": {
		"event_id": "synthetic-event-1",
		"zone": "Asia/Kolkata",
		"fixed_reminder_offset_seconds": -7200,
		"before": {
			"event_revision": 4,
			"local_start": "2026-09-20T18:00:00",
			"starts_at": "2026-09-20T12:30:00Z",
			"reminder_due_at": "2026-09-20T10:30:00Z",
			"logical_occurrence_id": "synthetic-instance-reminder-2h"
		},
		"after": {
			"event_revision": 5,
			"local_start": "2026-09-21T17:00:00",
			"starts_at": "2026-09-21T11:30:00Z",
			"reminder_due_at": "2026-09-21T09:30:00Z",
			"logical_occurrence_id": "synthetic-instance-reminder-2h"
		},
		"cancellation_committed_before_dispatch": true,
		"expected_new_dispatch_allowed": false,
		"expected_automatic_refunds": 0,
		"provider_calls_executed": 0
	}
}
```

A documentation check can evaluate capacity arithmetic, the half-open vote window after a wait, a named ballot replacement without double counting, finite graph cycle/block conditions, exact minor-unit sums/remainder allocation and the explicitly selected two-hour offset. Local timezone checking may map IANA `Asia/Kolkata` to Windows `India Standard Time` using .NET; this is not selection/testing of the production recurrence library or a change to the system clock. The fixture does not model real concurrent transactions, voter anonymity, actual money, current permissions or provider effects. Tests C17-V04, C17-V09, C17-V13 through C17-V18 and C17-V22 through C17-V25 must later exercise those actual boundaries.

## 14. Developer Handoff and Delivery Sequence

These twelve packages are responsibilities, not mandatory separate services or executed Agents. Design proceeds now; implementations and live integrations remain separately authorized. Conditional poll/finance/Agent/provider capabilities do not become ordinary-reminder M1 prerequisites, and no record-only milestone may claim the full acceptance list has passed.

| ID | Owner | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C17-T01 | Product, event, privacy and financial-boundary leads | Relevant identity/Space/data/API/scheduling/file/safety decisions | Resolve C17-D01 through C17-D14, first released modes, role/capacity/ballot/amount/privacy semantics and actual proof thresholds. Keep payments and unsupported anonymous voting disabled until their separate gates pass. |
| C17-T02 | Domain/data/transaction architect | C17-T01 | Define typed ownership, independent state/revisions, monetary wire/precision rules, ballot/task/capacity relationships and foundational audit/idempotency/outbox/receipt primitives before dependent writes; C17-V01, C17-V02, C17-V06, C17-V14, C17-V30. |
| C17-T03 | Event/lifecycle engineer | C17-T02; canonical temporal/policy services | Implement exact draft/review/publication/edit, owner continuity, current public/private/module eligibility and cancellation stop epoch; C17-V01, C17-V02, C17-V06, C17-V07, C17-V25, C17-V26. |
| C17-T04 | Invitation/attendance engineer | C17-T02, C17-T03 | Implement intended recipient, current roles/admission/guest/capacity/waitlist and roster/location privacy; C17-V03 through C17-V05. No event-to-Space automatic membership. |
| C17-T05 | Poll/privacy engineer | C17-T02, C17-T03, C17-T04 | Implement only reviewed poll/tally modes, atomic ballot/close/version rules and independently validated anonymity where enabled; C17-V08 through C17-V11. Named mode cannot be relabeled anonymous. |
| C17-T06 | Task/workspace engineer | C17-T02, C17-T03, C17-T04 | Integrate canonical scoped tasks/checklists with coordinated acyclic graph/approval/assignee semantics; C17-V12, C17-V13. Avoid a duplicate task engine. |
| C17-T07 | Budget/contribution engineer | C17-T01, C17-T02, C17-T03, C17-T04 | Implement exact approved plan/expense/correction/record-only contribution calculation and field privacy; C17-V14 through C17-V17. C17-V18 and provider/legal/confirmation gates apply only before a separately approved payment integration. |
| C17-T08 | Domain integration/Agent engineer | C17-T03, C17-T04; C17-T05, C17-T06, C17-T07 for released modules | Implement narrowed discussion/file/activity links, exact Agent tools/approvals, canonical scheduler/calendar notices and dependent cancellation reconciliation; C17-V19 through C17-V25. No new provider authority. |
| C17-T09 | API, Android and web engineers | C17-T03, C17-T04; C17-T05 through C17-T08 for released modules | Reconcile missing operations then implement shared typed current-authorized state, stable realtime/pending UX and accessible workspaces; C17-V27 through C17-V29. No financial or anonymous-ballot data in generic feeds. |
| C17-T10 | Platform/privacy/recovery engineer | C17-T02, C17-T03, C17-T08; released module protocols | Operate bounded jobs/audit/cost/metrics/retention, compatible upgrades, deletion and isolated current-authority/effect restore; C17-V24 through C17-V26, C17-V30, C17-V31. Foundational durable primitives are delivered in C17-T02, not postponed to operations. |
| C17-T11 | Independent QA, privacy, temporal and calculation reviewers | C17-T02 through C17-T10 for released scope | Execute applicable C17-V01 through C17-V32 with exact synthetic artifacts, library/provider/simulator identities, faults/concurrency and independent expected results. Static fixture math does not certify real ballots, settlement or storage. |
| C17-T12 | Messaging, encryption, security and product leads | C17-T01, C17-T02, C17-T08, C17-T09; C17-T11 for implemented evidence | Chapter 19 handoff for conversation participation/history, reliable message/attachment delivery, E2E key boundaries and reporting/Agent access. Chapter 18 identity is already drafted; design continues without enabling payments or external messaging. |

An authorized first event slice can use synthetic private event drafts, intended accounts, an ordinary named single-choice poll, scoped task dependencies and explicitly record-only same-currency estimates/contributions. Publish only the permitted reviewed event projection, reuse central reminders and demonstrate conflict/cancel/retry evidence. Enable public discovery, richer ballots, financial/provider channels or anonymous voting only with their own gates; the broader source requirements remain requirements, not implied completed functionality.

## 15. Demonstration, Remaining Risks and Next Chapter

### Separate Synthetic Collaboration Exercise

This future exercise is not the ordinary-reminder M1 and has not been executed. Use synthetic accounts, harmless event content and record-only amounts under isolated authorized dependencies; do not send real invitations or move money.

1. Create a private event under the actual authorized Space with explicit date/time/zone, capacity, module audiences and owner. Keep a denied account and a public-viewer projection as privacy controls.
2. Save an Agent/manual proposal and verify it remains a draft until exact authorized review. A poll preference or conversation agreement must not silently confirm a date or budget.
3. Invite intended accounts, admit within capacity and show separate RSVP/registration/guest/waitlist outcomes. Compete for a final slot and retry the winning request without oversubscription or unintended Space membership.
4. Open a reviewed named poll, submit and change a vote atomically, then close and finalize under its declared rules. Show a pending/offline late vote rejected without claiming anonymous mode or formal approval from the tally.
5. Assign dependent tasks, reject a concurrent cycle and block completion before prerequisites. Record a permitted explicit override separately if that policy is released, never fabricate precursor completion.
6. Approve an exact versioned same-currency budget and deterministic allocation. Record synthetic expense/receipt/pledge evidence separately, demonstrate correction and privacy, and show that pledges or payment initiation are not counted as received funds.
7. Attach an authorized scanned synthetic file and link a private finance discussion. A public event view, generic activity feed or Agent summary must not expose that source's restricted content.
8. Schedule approved event-relative in-app reminders with the LLM stopped. Postpone the same event instance and show revised due time under stable identity, with pending calendar sync if simulated external integration fails.
9. Cancel another event before dispatch; stop admission/new disallowed work immediately, reconcile tasks/polls/Agent/reminders, and preserve financial evidence without automatic refunds. Demonstrate a committed in-flight outcome honestly in a separate fault control.
10. Reconnect/switch accounts, retry writes and restore an isolated snapshot under current revocations. Verify Android/core-web accessibility and current authorized state using actual receipts/versions/effect evidence, not a successful screenshot alone.

Record exact event/module/configuration/library versions, actors/roles, currency/rounding/ballot/time rules, confirmed versus pending data, concurrency/fault boundaries and observed failures/skips. Keep artifacts synthetic and logs free of individual votes, private location/finance data and credentials. A narrow pass does not certify full MVP readiness, arbitrary currencies/tallies, anonymous voting, payment settlement, scale or legal/accounting compliance.

### Open Boundaries

- Eight PROPOSED and six OPEN decisions remain unapproved. Source enum overlaps, Configurable permissions, intended admission/guest rules, important conflict handling and absent API operations require canonical definitions before implementations diverge.
- Anonymous ballots need an explicit threat model and real privacy/integrity evidence; a `voter_id_hash`, hidden name or redacted vote payload is not enough. Complex tallies and concurrent graph/capacity changes require reviewed engines and transactional tests.
- Currency/scale/rounding/FX definitions, approval thresholds, receipt provenance and amount visibility remain separate from provider payment authority. No organizer, majority vote, Agent or signed screenshot can create bank confirmation or automatic refund.
- Public event visibility never means public attendee/location/budget/file/history access. Source grants, age/guardian policy, moderation, private search exclusion and selected E2E/reporting rules still apply to every derivative and client path.
- Postponement/cancellation is not one atomic transaction with calendars, messages or money. Current stop gates, stable logical effects, unknown outcome reconciliation and isolated restore are required; downloaded/in-flight data has honest limits.
- Critical observed disclosure, duplicate financial effect, ballot-identity leak, over-capacity admission, stale approval or cancellation bypass blocks the affected feature. Unrun tests and document arithmetic are not passes; residual-risk approval cannot waive required permissions or law.

The [Chapter 18 identity contract](CHAPTER_18_IDENTITY_CONTRACT.md) was drafted earlier in the dependency sequence. Next is [Chapter 19](../Chapter19.md): conversations, reliable messaging, end-to-end encryption, presence, delivery, attachments and scoped offline/realtime recovery. Carry the [Agent](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [file](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md), [trust](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) and [notification](../Chapter20.md) boundaries. Continue design/developer handoff, not implementation, provider calls or financial actions.