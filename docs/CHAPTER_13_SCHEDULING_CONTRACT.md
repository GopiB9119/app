# Chapter 13: Scheduling, Calendar and Reminder Delivery Contract

Status: DRAFT FOR PRODUCT, SCHEDULING, DELIVERY AND SECURITY REVIEW. This is a design and verification plan, not an implemented scheduler, calendar connection, medication service or live notification integration.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md), [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md) and [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) drafts. It develops C12-T12 and the ordinary family-reminder milestone into explicit timing and delivery contracts.

- [Chapter 13](../Chapter13.md) is the owning source; [Chapter 20](../Chapter20.md) supplies the adjacent delivery/provider boundary. The Agent understands and drafts permitted intent; deterministic backend services own time calculation, occurrences, dispatch, acknowledgment and escalation without an active model or app.
- M1 remains verified synthetic accounts, private family membership, an ordinary task and a confirmed one-time in-app reminder. Broader recurrence, external calendars, escalation, medicine records and provider channels retain their own release and safety gates. No source example adds health-record access, diagnosis/dosage decisions or external calls/messages to the MVP Agent.
- The source ends at [13.19 Android Screens](../Chapter13.md#L1374), with the schedule-creation field 'Notes'. It has no finished web-screen, test or final acceptance section. Additions below are proposed engineering contracts, not recovered source text.
- Preserve all original chapters and earlier drafts. Planning continuation does not approve open policy choices or authorize code, services, model/provider calls, real contacts/health data, credentials, device actions, provisioning, spending or deployment.
- All scheduler/database/calendar/delivery/product tests are NOT RUN. Document and synthetic time-arithmetic checks are not runtime durability, provider capability, clinical validation or timing guarantees.

## 2. Exact Source Topics and Principles

All nineteen numbered topics are retained with their exact titles and source anchors.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C13-S01 | Purpose | [13.1](../Chapter13.md#L3) |
| C13-S02 | Core Architecture | [13.2](../Chapter13.md#L57) |
| C13-S03 | Scheduling Principles | [13.3](../Chapter13.md#L113) |
| C13-S04 | Scheduling Domain Model | [13.4](../Chapter13.md#L193) |
| C13-S05 | Scheduling Database Tables | [13.5](../Chapter13.md#L322) |
| C13-S06 | Scheduler Service | [13.6](../Chapter13.md#L374) |
| C13-S07 | Notification Orchestrator | [13.7](../Chapter13.md#L431) |
| C13-S08 | Notification Types | [13.8](../Chapter13.md#L501) |
| C13-S09 | Notification Template System | [13.9](../Chapter13.md#L575) |
| C13-S10 | Consent and Contact Preferences | [13.10](../Chapter13.md#L612) |
| C13-S11 | Quiet Hours | [13.11](../Chapter13.md#L688) |
| C13-S12 | Medicine Reminder Architecture | [13.12](../Chapter13.md#L712) |
| C13-S13 | Escalation Architecture | [13.13](../Chapter13.md#L883) |
| C13-S14 | External Communication Adapters | [13.14](../Chapter13.md#L994) |
| C13-S15 | Calendar Integration | [13.15](../Chapter13.md#L1094) |
| C13-S16 | Agent Integration | [13.16](../Chapter13.md#L1198) |
| C13-S17 | Scheduling APIs | [13.17](../Chapter13.md#L1249) |
| C13-S18 | Realtime Events | [13.18](../Chapter13.md#L1347) |
| C13-S19 | Android Screens | [13.19](../Chapter13.md#L1374) |

The three principle titles from section 13.3 retain their wording; the typographic apostrophe in the first title is normalized to ASCII.

| ID | Source principle |
| --- | --- |
| C13-R01 | Store time in UTC, preserve the user's time zone |
| C13-R02 | Recurring schedules must use calendar semantics |
| C13-R03 | Schedules must be idempotent |

## 3. Source Domain and Storage Inventory

All four source domain model titles are retained. Interpretation below adds distinctions needed for implementation; it is not an applied schema.

| ID | Source model | Responsibility and boundary |
| --- | --- | --- |
| C13-M01 | Schedule | Versioned user-authorized one-time or recurring intent, owning context, temporal rule and policy. Not a running LLM timer. |
| C13-M02 | Schedule Recipient | Intended person/account or separately approved contact, purpose/channel preferences and authority. A stored recipient row is not permanent consent or current membership. |
| C13-M03 | Schedule Occurrence | One concrete logical instance of the schedule, with resolved due time, revision and execution history. Separate from each recipient/channel attempt. |
| C13-M04 | Delivery Attempt | One bounded transport attempt for a logical recipient/channel delivery, with provider evidence. Acceptance, delivery, read and human acknowledgment are distinct. |

The following source enum lists are preserved as inventory, not adopted canonical state machines. Reconcile occurrence, recipient delivery and acknowledgment states instead of merging all into one status field.

| Source list | Values in source order |
| --- | --- |
| Schedule types | one_time, recurring, deadline, countdown, event, medicine_reminder, follow_up, escalation |
| Schedule statuses | draft, pending_approval, active, paused, completed, cancelled, expired |
| Occurrence statuses | pending, leased, processing, sent, partially_sent, failed, skipped, cancelled, expired |

All fourteen proposed table names in section 13.5 are retained. Reuse canonical consent/preferences/calendar authorities rather than create duplicate tables merely because chapters name them differently.

| ID | Source proposed table |
| --- | --- |
| C13-B01 | schedules |
| C13-B02 | schedule_recipients |
| C13-B03 | schedule_occurrences |
| C13-B04 | schedule_exceptions |
| C13-B05 | schedule_execution_locks |
| C13-B06 | delivery_attempts |
| C13-B07 | notification_templates |
| C13-B08 | notification_preferences |
| C13-B09 | consents |
| C13-B10 | escalation_policies |
| C13-B11 | escalation_steps |
| C13-B12 | escalation_executions |
| C13-B13 | calendar_connections |
| C13-B14 | calendar_events |

The data draft additionally requires schedule revisions, a logical recipient delivery, durable in-app notification, acknowledgment records and outbox/job state. They implement missing integrity boundaries, not another independently calculating reminder engine.

## 4. Exact Tool, API, Event and Screen Inventories

All eighteen recommended tool names from section 13.16 are preserved. Registration is not permission to expose every tool in M1 or to the MVP Agent.

| ID | Source tool |
| --- | --- |
| C13-U01 | schedule.create_draft |
| C13-U02 | schedule.get |
| C13-U03 | schedule.update |
| C13-U04 | schedule.pause |
| C13-U05 | schedule.resume |
| C13-U06 | schedule.cancel |
| C13-U07 | schedule.list |
| C13-U08 | schedule.preview_occurrences |
| C13-U09 | schedule.create_exception |
| C13-U10 | notification.draft |
| C13-U11 | notification.preview |
| C13-U12 | notification.send_approved |
| C13-U13 | escalation.get_status |
| C13-U14 | escalation.resolve |
| C13-U15 | calendar.event.create_draft |
| C13-U16 | calendar.event.update_draft |
| C13-U17 | medicine.reminder.create_draft |
| C13-U18 | medicine.reminder.acknowledge |

All twelve method/path pairs from section 13.17 are retained. The meaning of reminder/occurrence IDs and missing operations still needs the canonical Chapter 7 schema; do not mark the latest dose or every recurrence complete from an ambiguous series ID.

| ID | Source scheduling operation |
| --- | --- |
| C13-P01 | `POST /v1/schedules/drafts` |
| C13-P02 | `POST /v1/schedules/preview` |
| C13-P03 | `POST /v1/schedules/{schedule_id}/activate` |
| C13-P04 | `POST /v1/schedules/{schedule_id}/pause` |
| C13-P05 | `POST /v1/schedules/{schedule_id}/resume` |
| C13-P06 | `POST /v1/schedules/{schedule_id}/cancel` |
| C13-P07 | `GET /v1/schedules/{schedule_id}/occurrences` |
| C13-P08 | `POST /v1/reminders/{reminder_id}/acknowledge` |
| C13-P09 | `POST /v1/reminders/{reminder_id}/snooze` |
| C13-P10 | `POST /v1/reminders/{reminder_id}/missed` |
| C13-P11 | `POST /v1/escalations/{escalation_id}/resolve` |
| C13-P12 | `GET /v1/notifications/{notification_id}/deliveries` |

All twenty realtime event names from section 13.18 are preserved. They need versioned authorized projections, not a raw database broadcast or a client timer inferred state.

| ID | Source event |
| --- | --- |
| C13-E01 | schedule.created |
| C13-E02 | schedule.updated |
| C13-E03 | schedule.paused |
| C13-E04 | schedule.resumed |
| C13-E05 | schedule.cancelled |
| C13-E06 | schedule.occurrence_due |
| C13-E07 | reminder.sent |
| C13-E08 | reminder.acknowledged |
| C13-E09 | reminder.snoozed |
| C13-E10 | reminder.missed |
| C13-E11 | escalation.started |
| C13-E12 | escalation.step_executed |
| C13-E13 | escalation.resolved |
| C13-E14 | notification.queued |
| C13-E15 | notification.sent |
| C13-E16 | notification.delivered |
| C13-E17 | notification.failed |
| C13-E18 | calendar.sync_started |
| C13-E19 | calendar.sync_completed |
| C13-E20 | calendar.sync_failed |

All fifteen Android screen names from section 13.19 are retained. Equivalent web flows reuse domain semantics, not native screen code; a listed screen is not evidence it exists.

| ID | Source Android screen |
| --- | --- |
| C13-C01 | SchedulesScreen |
| C13-C02 | ScheduleDetailScreen |
| C13-C03 | CreateScheduleScreen |
| C13-C04 | SchedulePreviewScreen |
| C13-C05 | ReminderScreen |
| C13-C06 | ReminderHistoryScreen |
| C13-C07 | MedicineReminderScreen |
| C13-C08 | MedicineDetailScreen |
| C13-C09 | CaregiverAssignmentScreen |
| C13-C10 | EscalationPolicyScreen |
| C13-C11 | NotificationPreferencesScreen |
| C13-C12 | ConnectedCalendarsScreen |
| C13-C13 | CalendarEventEditorScreen |
| C13-C14 | DeliveryHistoryScreen |
| C13-C15 | ApprovalScreen |

## 5. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C13-D01 | Scheduling authority | One deterministic service for manual and permitted Agent-created schedules. Persist intent/occurrences/work independently of models, clients or a transient Redis timer. | PROPOSED |
| C13-D02 | Calendar and timezone engine | Select maintained recurrence and IANA timezone libraries, supported rule subset, versioned tzdata and explicit gap/fold/month-edge policies. No handwritten calendar parser or fixed-offset substitute. | OPEN |
| C13-D03 | Time semantics | Distinguish fixed instant, local calendar time in a named zone, date-only deadline, and a separately approved elapsed interval. Reject ambiguous input without required resolution. | PROPOSED |
| C13-D04 | Occurrence identity across edits | Use stable logical series/occurrence identity and explicit revision/supersession mapping; retry, snooze or zone/edit changes must not create a second copy of the same intended effect. | PROPOSED |
| C13-D05 | Late, paused, expired and missed work | Choose catch-up windows, skip/coalesce behavior, per-case tolerance, pause/resume and acknowledgment deadlines. No universal immediate-delivery or unlimited backfill policy. | OPEN |
| C13-D06 | Recipient set and ownership | Prefer an explicitly reviewed recipient set for the first slice, plus current eligibility at dispatch; define dynamic membership expansion, leaving/ownership transfer and non-user contacts separately. | PROPOSED |
| C13-D07 | Channel selection and quiet hours | Define purpose/category/channel policy in each recipient's timezone. Multi-channel/fallback/priority exceptions need explicit permission; clinical timing cannot be shifted casually. | OPEN |
| C13-D08 | Cancellation and uncertainty | Serialize eligibility/cancellation against a defined dispatch commitment, retain receipts and reconcile already in-flight effects. Do not promise recall after a provider has accepted. | PROPOSED |
| C13-D09 | Acknowledgment, snooze and escalation | Bind per-recipient per-occurrence human input, monotonic stop rules and auditable revisions; snooze changes a notification, not a prescribed dose or clinical instruction. | PROPOSED |
| C13-D10 | Care information and authority | Decide verified instruction provenance, data subject/caregiver authority, field-level consent, age/jurisdiction, retention and human oversight before any real health feature. MVP Agent health restrictions remain in force. | OPEN |
| C13-D11 | Calendar integration | Choose providers, minimal scopes, source of truth, event mappings, recurrence/exception semantics, conflict/dedup and disconnect behavior. Merely storing OAuth tokens is not completed sync. | OPEN |
| C13-D12 | Templates, provider policy and budgets | Use reviewed versioned localized templates and verified official provider capabilities/consent/keys/idempotency/callback behavior. No unofficial WhatsApp automation or assumed calling/presence/group API. | OPEN |
| C13-D13 | Client and Agent contract | Shared typed manual/tool services, explicit preview/activation, exact approval and honest saved/due/sent/delivered/acknowledged/unknown states; no UI/LLM authority shortcuts. | PROPOSED |
| C13-D14 | Timing evidence and operations | Agree workload, materialization horizon, lease/batch/retry/time budgets, SLOs, retention and restore/reconciliation evidence before launch. Sample dates/counts are not production settings. | OPEN |

These seven proposals and seven open decisions remain unapproved. M1 implements only the approved one-time ordinary in-app subset when implementation is authorized; later scheduling features are retained without making every provider or care workflow a first-demo prerequisite.

As built on 2026-10-01 under [DEC-010](DECISIONS.md#accepted-decisions), provisional and awaiting the owner's review: a narrow subset of C13-D04, C13-D05 and C13-D09. That is daily and weekly repeating in-app reminders for oneself, skip the next time, pause and resume, at most one late time after downtime, and snooze (10 minutes to 1 day, at most three times). The rule engine is a small standard-library computation over `zoneinfo` for those two rule shapes only; it parses no rule text. Choosing a maintained recurrence library (C13-D02) and every other row above stay as marked. Evidence: [checkpoint](BUILD_STATUS.md#repeating-reminders-snooze-and-planned-times-checkpoint).

## 6. Ownership, Records and Execution Rules

### One Scheduler, Several Distinct Records

The scheduling service owns temporal intent and occurrence generation. The notification service owns recipient/channel policy and delivery history. The calendar adapter reconciles selected external events; the Agent calls the same authorized services as manual forms. PostgreSQL owns durable business state, while Redis/queues accelerate work and object storage holds protected artifacts. Neither an Android alarm, a browser timer nor a LangGraph checkpoint is the authoritative scheduler.

| Record group | Source table references | Required refinement |
| --- | --- | --- |
| Intended schedule, recipients and exceptions | C13-B01, C13-B02, C13-B04 | Separate stable series identity, immutable approved revisions, explicit time basis, intended recipient set/selector and one-instance exception. Typed ownership/context and source links follow the data contract. |
| Concrete occurrence and execution claim | C13-B03, C13-B05 | Preserve logical recurrence slot, scheduled UTC/local intent, revision/provenance, current outcome and owner/fenced lease. An execution lock is coordination, not the only duplicate or permission guard. |
| Logical delivery and attempts | C13-B06 | Add one logical recipient/channel delivery with separately numbered attempts, provider references, known/unknown status and durable in-app notification. Repeated attempt is not a new occurrence. |
| Rendered content | C13-B07 | Approved template version, locale, bounded typed variables, classification and exact permitted audience; retain needed rendering provenance without logging sensitive payloads. |
| Current recipient policy | C13-B08, C13-B09 | Reuse authoritative consent/preferences/endpoints and current binding versions. A copied `consent_status` in a job is not current authority. |
| Escalation | C13-B10, C13-B11, C13-B12 | Versioned policy, absolute/relative delay basis, bounded typed steps, eligible recipients, stop conditions and per-occurrence/recipient execution history. |
| External calendar mapping | C13-B13, C13-B14 | Protected account-scoped provider connection, canonical event/series/instance identity, version/sync cursor, supported recurrence and conflict state. Do not duplicate the internal event source of truth accidentally. |

Additional records may be required for schedule revisions, recipient acknowledgments, logical deliveries, snooze follow-ups, webhook inbox and outbox/jobs. Their exact names/DDL are not created here. Foreign keys must bind each child to its actual schedule/occurrence/recipient/scope, and uniqueness must cover logical identity with deliberate NULL handling. A reminder linked to a task/event cannot point into an unrelated Space merely because both IDs exist.

Keep these timestamps separate: originally intended time, resolved scheduled instant, earliest permitted dispatch, expiry/latest allowed dispatch, claimed/committed attempt, provider acceptance/delivery/read and user-reported acknowledgment. Do not overwrite due time with quiet-hours deferral or a retry timestamp and lose what actually happened. Individual recipient outcomes are authoritative; a group-level `sent` or `partially_sent` summary cannot conceal failure, suppression or uncertainty for a particular person.

### Scheduling Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C13-K01 | Timing and accepted work are durable without an LLM. | Manual and Agent tools persist through the same deterministic service; a model/app outage cannot erase a committed schedule. |
| C13-K02 | Ownership and recipients are authorized now. | Account/Space/object/history/delegation and intended recipient/contact binding plus purpose-specific consent at activation and sensitive dispatch. |
| C13-K03 | Time basis and zone are explicit. | Preserve named IANA zone, local calendar intent, resolved UTC instant, clock/reference and relevant tzdata provenance. Dates and elapsed durations are separate types. |
| C13-K04 | Recurrence and previews share a bounded calendar engine. | Maintained rules/timezone libraries, explicit gap/fold/month-edge/COUNT/UNTIL semantics and bounded horizons; previews cannot use a simpler divergent algorithm. |
| C13-K05 | Material changes invalidate the old approved intent. | Immutable revision and compare-and-set for time, recipient, content, channel, exception, escalation and external-calendar changes; exact review when required. |
| C13-K06 | Logical occurrence identity survives retries and changes. | Stable series/recurrence-slot identity with explicit exception/supersession lineage; do not deduplicate only by a mutable resolved UTC timestamp or create duplicates by adding a new revision to the key. |
| C13-K07 | Materialization and work intent commit atomically. | Insert unique occurrences, durable jobs/outbox and cursor/revision progress together; crash cannot advance past work that was never durably created. |
| C13-K08 | Claims do not replace cancellation or revocation checks. | Fenced leases, current time/authority and a documented dispatch commitment; new disallowed sends stop while previously committed external outcomes are reconciled. |
| C13-K09 | Delivery attempts do not invent exactly-once provider behavior. | Stable recipient/channel effect, known provider idempotency/status and bounded retry; timeout may be unknown, not permission to send again elsewhere. |
| C13-K10 | Quiet hours and priority cannot bypass permission. | Recipient-zone windows, preferences, expiry and explicit permitted exceptions; a sender/Agent priority label does not overrule opt-out or clinical safety. |
| C13-K11 | Templates preserve exact meaning and audience. | Versioned localized schema, safe rendering, approved content/field projection and no secret or sensitive preview leakage. |
| C13-K12 | Acknowledgment and snooze refer to one person and occurrence. | Current eligible actor, stable action ID, recorded actor/time and controlled state transition; delivery/read/Taken self-report are different facts. |
| C13-K13 | Escalation is bounded, revocable and not emergency inference. | Explicit trigger/time basis/recipient/channel/limits/stop conditions, rechecked before each step and after race/retry. |
| C13-K14 | Calendar sync is scoped, versioned and conflict-aware. | Provider account/calendar/series-instance binding, secure OAuth tokens, atomic applied changes/cursor and no blind last-write or duplicate invitation/reminder loop. |
| C13-K15 | Agent and client views report domain truth. | Typed tools/APIs/events, exact approval, current scope, honest pending/due/failed/unknown and accessible review. A UI timer is not completion evidence. |
| C13-K16 | Operational safety has measurable, private evidence. | Bounded load/cost/time/retention, audit, deliberate outage/restore/catch-up policy and real tests separate from synthetic document checks. |

## 7. Temporal Semantics and Recurrence Contract

### Time Basis

| Kind of intent | Durable representation | Meaning and change rule |
| --- | --- | --- |
| One fixed instant | Confirmed UTC instant, entered local value/zone/offset and request provenance. | Display may change with viewer timezone, but travel or profile edits do not silently move the instant. M1 uses this after explicit local-time resolution. |
| Local calendar recurrence | DTSTART/local anchor, named zone, supported RRULE/RDATE/EXDATE/exception policy and rule revision. | A daily 19:00 event remains 19:00 in that named zone; elapsed UTC spacing can change at daylight-saving transitions. |
| Per-recipient local time | Explicitly approved separate recipient-time intent, each recipient zone and stable derived instance mapping. | Not the same as everyone attending one meeting instant. Requires clear preview and authority before adoption; do not infer it from 'remind my family'. |
| Elapsed interval | Absolute anchor plus an approved exact duration and count/end rule. | A reviewed every-N-hours interval is different from a calendar day. Do not convert medication wording into either policy without confirmed instructions. |
| Date-only deadline/all-day event | Local date or date range with explicit owning calendar context. | Does not imply midnight UTC, an exact delivery time or an extra notification. Any reminder time is separately selected. |
| Event-relative reminder/countdown | Canonical event/instance identity, event revision and typed before/after offset. | Event edits re-resolve only eligible future work under the reviewed approval/conflict policy; past delivered evidence remains immutable. |

Accept an offset/instant/local-zone combination only when the fields are consistent with the chosen mode. Do not use a short abbreviation such as IST or CST, a browser offset, or the sender's current timezone as an unreviewed global schedule zone. IANA zone IDs are the portable contract; Windows-specific timezone identifiers used in local documentation checks do not become the production wire format.

Resolve 'tomorrow', 'next Sunday' or 'after lunch' from an explicit request reference, locale/zone and verified task/event context; ask when material meaning is missing. Persist the resolved intent. A delayed Agent approval cannot reinterpret tomorrow relative to its resume date. An approval expires or requires fresh review when the intended occurrence is no longer appropriate.

### Recurrence Engine and Exceptional Dates

Choose a maintained standards-aware recurrence implementation and timezone database for the backend, for example a reviewed Python dateutil/zoneinfo/tzdata combination if compatible with the selected stack. Verify its documented gap/fold and rule behavior; a popular library does not choose the product's timing policy. Do not hand-roll RRULE parsing or assume merely attaching timezone information validates a nonexistent local time.

Specify a supported recurrence subset, normalized DTSTART/value types, week-start/calendar semantics, bounds on BY* expansions, count/end and query horizons. Reject unsupported/conflicting rules rather than approximate silently. RDATE/EXDATE and external provider instances must use consistent temporal types. Library/RFC COUNT and inclusive UNTIL semantics are not interchangeable with a separate application-exclusive end boundary; document both without hidden off-by-one sends.

| Edge case | Required proposed behavior | Decision still needed |
| --- | --- | --- |
| Daylight-saving spring gap | Detect a local clock time that does not exist; a one-off form requires an explicit valid resolution. | Recurrence can skip or apply a specifically reviewed shift under policy. Do not quietly pick an offset, send at a guessed time or alter clinical instructions. |
| Daylight-saving fall overlap | Detect two possible instants for the same local label and retain the chosen fold/offset when resolved. | Select a reviewed earlier/later occurrence policy; do not send twice unless two distinct reminders were deliberately approved. |
| Monthly day 29/30/31 or leap day | Follow the chosen calendar/RRULE semantics and expose previewed omitted dates. | Skipping an invalid calendar date differs from last-day clamping; clamping is a separately explicit rule, not a library workaround. |
| Zone/profile travel change | Preserve explicit schedule zone versus viewer/quiet-hours zone. | Following a recipient's changing location is a separate opt-in policy with reviewed future occurrences, not automatic phone-location inference. |
| Timezone database update | Record relevant rule/zone/engine versions and identify affected not-yet-committed future occurrences. | Recompute/review according to policy; never create a second logical occurrence solely because the UTC offset prediction changed. |
| Overdue approval or long downtime | Retain intended time and expose late/expired/missed status with actual evidence. | Choose bounded catch-up/skip/coalesce/manual review per purpose; no universal 'send everything now'. |

Preview and execution use the same approved rule/zone revision and bounded occurrence window. A preview response identifies draft/series revision, original local labels, resolved instants/offsets, gaps/folds/omissions, recipient interpretation, channel/quiet-hour effects and known conflicts. It is not a guarantee that current recipient consent, provider availability or future timezone law will remain unchanged. Material change invalidates the old preview/approval or requires explicit revalidation.

### Occurrence Identity and Edits

The source `schedule_id + occurrence_start_time` example is a useful uniqueness starting point for an unchanged simple schedule, not sufficient for every edit, fold, snooze or timezone-rule change. Proposed identity uses a stable series ID and original recurrence slot/instance key, with the selected fold if necessary and explicit mapping to resolved UTC time and governing revision. The reviewed key design may use an immutable ordinal or standards-aligned recurrence identifier, but it must be stable for the same intended instance.

Changing one occurrence's time retains its original logical identity and adds an exception/resolution revision. A new scheduled timestamp does not create permission to dispatch both old and new copies. 'This and following' edits may create a new series segment with a defined cutoff and supersession mapping; close the old future segment and migrate/retire existing planned occurrences atomically. A wholesale rule change with ambiguous correspondence needs an explicit decision, not a guessed timestamp merge.

Never use a new schedule revision, worker attempt, Agent node or delivery retry as a fresh logical occurrence identity. Keep already committed/delivered records immutable and link cancellation/correction rather than rewrite history. A snooze creates a bounded notification follow-up for the same intended occurrence/recipient; it is not another dose, a new recurring schedule or a normal provider retry.

Use authoritative server time for due/expiry/cancellation decisions, reevaluated after lock waits. PostgreSQL `now()` is the transaction-start time; a long-running transaction cannot justify dispatching a now-expired job. Monotonic clocks bound elapsed request/lease work as appropriate, but persisted calendar intent and deadlines require agreed absolute time. Clock skew/forward/backward adjustment is observable and must not duplicate instances or grant extra authority.

## 8. Schedule, Dispatch and Acknowledgment Workflows

### C13-W01 Create and Preview Scoped Intent

Authenticate the requester and validate owner/Space/source object, permitted creator/assignee role, audience/history, account restrictions and required consent. Treat an external contact as a specifically verified authorized destination under the future provider policy, not merely a phone string. For M1 use synthetic admitted account recipients and in-app delivery.

Create a narrow draft with title/content source, temporal kind/zone/local intent, recurrence if released, intended recipient set or approved selector, channel/category, acknowledgment and escalation settings where permitted. Derive actor/ownership server-side; clients and Agent tools cannot set approved/active status or override a data owner's private audience through metadata.

Preview bounded occurrences and conflicts using the same backend engine as materialization. Do not guess a missing meeting time, medicine/dose or recipient approval. Compare local label, zone and UTC instant, and surface invalid/ambiguous dates and quiet-hour deferral clearly. Return versioned proposed effects and data exposure, not a live provider send. A drafted schedule or preview may be persisted, but it is not active dispatch authority.

### C13-W02 Confirm and Activate an Exact Revision

The authorized human sees the exact timing, affected occurrences, target people, content/fields, channels and escalation behavior within their own viewing authority. A count-only recipient summary or a generic 'approve schedule' does not identify whose data will be sent where. Required approval binds the exact immutable revision/tool/policy/recipient interpretation and expiry; a changed member list, time, content, channel or recurring rule can require new review.

Activation rechecks current caller/owner/delegation, recipient eligibility/consent, relevant source/event versions, quota and policy inside the reviewed transaction. Commit the active schedule/revision, approved authority references, initial cursor/work intent and required audit/outbox. An idempotent retry returns the permitted canonical result; stale payload/key or expected-version conflict does not silently overwrite the winner.

A recurring standing grant has an explicit purpose, rule, recipients or governed selector, channels, bounds and revocation. It is not reusable consent for future unrelated actions. A selected static recipient set is still checked at execution; a dynamic 'current members' selector must define who may be added later, exclusion/reporting and approval implications. Do not silently include new family members or phone-number holders under an old action approval.

### C13-W03 Materialize Due Work and Recover It

The scheduler is a separate deterministic service. Scan eligible schedule revisions/occurrences in indexed bounded batches, use a documented horizon/cursor and serialize mutable revision/cancel state. Generate stable instances plus durable jobs/outbox and advance the cursor in one transaction. A crash before commit advances nothing; after commit, durable reconciliation finds pending work even if the queue publish disappears.

Database uniqueness and resource-specific version checks arbitrate concurrent materializers; Redis leadership/leases are optimizations, not the sole correctness mechanism. Use stable due ordering with a tiebreaker and bounded per-Space fairness. A `LIMIT 500` source example is not an approved batch/throughput setting, and an infinite or expensive RRULE must not expand unbounded history to find the next item.

Claim runnable work using a bounded owner-token/fencing/lease policy and short transactions; supported row-lock/skip-locked job patterns must not skip a membership check and infer permission. Slow rendering/provider/network work occurs outside database locks. Stale workers cannot commit outcomes or release another claim. Restart/replay preserves occurrence/effect IDs; it does not reset attempts, deadlines, quotas or consent.

Late materialization is recorded, not hidden by moving the intended due time forward. Apply the approved overdue/catch-up policy and limits before creating a recovery burst. Optional caches and queues can be rebuilt from PostgreSQL intent; an LLM, app process, user socket or original login-token lifetime is not required to keep an already authorized schedule progressing.

#### Durable Job Transition Proposal

Chapter 4 ends at scheduled_jobs States: without defining values. This is a new candidate refinement for COV-G06 in the [reconciliation index](CONTRACT_RECONCILIATION.md), not recovered source text or approval of a canonical enum. A schedule, occurrence, job, dispatch attempt, recipient inbox and acknowledgment each retain their own state.

| Candidate job state | Entry or next transition | Required guard |
| --- | --- | --- |
| ready | Accepted durable work eligible for a future due claim | Stable job/effect identity, source revision and deadline; a paused/revoked source prevents claiming even while the job row exists. |
| leased | Worker atomically claims ready or due retry_wait | Current time after lock wait, eligible source and fenced owner/expiry. Lease acquisition is not dispatch commitment. |
| retry_wait | Definitively retryable failure without unresolved external effect | Preserve identity/payload/deadline/attempt budget and next eligible time. Invalid authority or expired approval is not retryable. |
| reconciliation_required | Effect may have committed or provider acceptance is unknown | Only bounded receipt/status investigation or qualified review; no new send/key/channel until uncertainty is safely resolved. |
| completed | This job's declared durable goal is verified | Enqueue completion, materialization, inbox creation and provider dispatch have different goal evidence. Provider acceptance is not delivered/read/acknowledged. |
| cancelled | Stop intent wins before the relevant effect commitment | No new ordinary effect. If already committed, preserve potentially in-flight evidence and a separately tracked reconciliation obligation. |
| superseded | Reviewed source revision replaces not-yet-committed work | Link old/new intended work and fence the old claim; do not mint a second logical occurrence merely because time/revision changed. |
| expired | Latest permitted execution time passed before allowed commitment | No backlog send on restart. Preserve intended time and selected missed/late policy. |
| dead_lettered | Definitive failure or bounded attempts exhausted | Restricted diagnostic record and owner review; replay requires current authority and same logical effect reconciliation, not a bulk blind resend. |

Lease loss goes through durable outcome inspection: requeue a proven safe unfinished job, finalize a verified committed receipt, or enter reconciliation_required. An expired lease alone never proves no effect occurred. Late worker/callback evidence cannot change a newer job owner or reopen cancelled/superseded work; it may append reconciled effect evidence only. Preserve cancellation and current-source exclusion while reconciling.

Implement the chosen transitions with compare-and-set revision/fence, durable attempt/outcome receipt and required audit/outbox. Extend existing materialization/claim/dispatch/restore evidence with crash before/after effect and receipt, cancel-versus-claim, cancel-versus-commit, stale owner, pause/resume, supersession and expired catch-up. No numeric lease/retry default or runtime pass is selected by this table.

### C13-W04 Commit a Permitted Recipient Delivery

Resolve current schedule/revision, intended recipient/account/contact binding, source object/history visibility, classification, consent/preferences, quiet hours, approval, expiry, provider availability and budget immediately before the reviewed dispatch commitment. A claimed job or old `consent_status` is not sufficient. Immutable approved payload must still match the allowed recipient and current policy; a revoked group member cannot receive private reminder details through a delayed queue.

Separate logical recipient/channel delivery from numbered transport attempts. A proposed uniqueness key includes occurrence, recipient identity and approved channel/follow-up identity as appropriate; a push to multiple permitted device endpoints is delivery fanout under one user notification, not multiple human acknowledgments. Pure provider retry preserves logical payload and destination; changing either requires new reviewed intent, not mutating a timed-out request.

For local in-app notification, commit the authorized durable notification and result together where possible. For external delivery, serialize cancellation/current authority against a durable dispatch intent/commitment, then invoke the provider outside locks using its supported idempotency identity. A cancellation that commits before that boundary prevents the new send. After commitment, the UI must treat the effect as potentially in flight even if the worker has not recorded provider acceptance; there is no universal atomic transaction across PostgreSQL and a remote messaging service.

Perform an additional current check before actual network send when possible, but do not claim that this removes every race after the check. Record provider acceptance/reference and verified callbacks without claiming delivery/read/ack prematurely. Timeout/crash after commitment may be unknown; reconcile or review before retry and never switch to an unapproved channel automatically. A late success event may update the true outcome of a cancelled in-flight delivery without resurrecting the schedule.

### C13-W05 Edit, Pause, Resume and Cancel

Writes use current actor/target policy, expected revision and exact logical request identity. Distinguish editing one instance, following instances and the whole series. An exception changes only its intended instance; preserve older effect/history and use the explicit supersession strategy for future rows. A comment-only metadata update should not regenerate every delivered occurrence or invalidate unrelated evidence.

Pause stops new disallowed materialization/dispatch according to the explicit paused state, including queued work at its dispatch gate. It is not cancel or deletion and cannot recall already delivered messages. Resume rechecks authority/revisions/consent and uses the chosen missed-work policy; no default full backlog resend, revived expired approval or restoration of a removed recipient. Permanent cancellation does not become active again from a late queue callback.

Cancel the intended series/instance/follow-up scope explicitly, revoke future dispatch eligibility and coordinate queued recipients, escalation and external calendar work. Preserve outcome records and disclose any already committed/unknown sends. Removing a Space member, archived/expired Space, deleted source, withdrawn consent, closed account or changed endpoint can stop or redact work even if nobody presses Cancel.

Ownership transfer or creator departure requires an explicit rule for the schedule's authority and intended recipients. An authorized Space-owned household task may have a reviewed continuity path; a private personal/care reminder must not be inherited by an administrator with all contents. Ordinary session expiry alone does not revoke a separately valid standing schedule, but current account/resource/purpose authority still governs it.

### C13-W06 Acknowledge, Snooze, Skip or Record a Miss

An action names the particular occurrence and recipient, acting account/representative authority and action revision/key. Source reminder-ID routes must either identify that unique record or carry an explicit validated occurrence/recipient selection. Never guess 'the latest reminder', acknowledge a whole recurring series, or let a caregiver act for everyone because they belong to the group.

Store immutable action evidence with server receipt time, actual actor, reported outcome and related version. A user-entered action time can be recorded separately as untrusted/reviewed input; it must not rewrite server delivery or security history. Repeated acknowledgments are idempotent; explicit corrections append controlled history rather than deleting evidence. Delivery/read/notification acknowledgment and self-reported Taken are distinct, and none is objective clinical adherence proof.

Snooze is a bounded, approved follow-up notification for that recipient/occurrence with a stable request identity, resolved time, maximum count/window and conflict checks against future instances. It does not modify prescribed dose, move a treatment schedule or advise doubling a missed dose. If a snooze passes the next scheduled occurrence, expiry or quiet hours, the reviewed policy must warn/deny/resolve rather than silently merge two clinical or household events.

Skip, need-help, miss and resolution have different meanings and scope. An automatic 'missed' state means the configured response window ended without a recorded response, not that the task or medicine was physically not completed. A late valid acknowledgment stops future eligible escalation under its transaction policy but does not erase earlier notices or falsely claim they were recalled. Offline clients may preserve permitted local drafts but cannot stop server escalation before the server receives authorized acknowledgment; display that uncertainty.

## 9. Recipient Policy, Care and Escalation

### C13-W07 Apply Preferences, Quiet Hours and Templates

Classify purpose and sensitivity from reviewed domain policy. The source informational, action-required, sensitive and critical-escalation categories guide handling; neither a model label nor a user's 'urgent' field grants an emergency exception. Group defaults cannot override an individual's more restrictive consent, visibility, verified destination or channel rules. OS notification permission, marketing consent and family membership are not interchangeable grants.

Resolve quiet hours in each recipient's named timezone, including windows crossing midnight, weekday exceptions and daylight-saving changes. Preserve the intended due time and record the deferred earliest dispatch time plus reason. Delayed work rechecks consent, current quiet-hours policy, expiry, acknowledgment and cancellation at wake-up. If the quiet-hours end falls after the allowed delivery window, apply the reviewed skip/expire/review policy instead of sending stale material. Decide whether an end equal to start means disabled or a full-day window; do not leave clients and workers to interpret it differently.

The source 23:00 to 07:00 deferral is an illustration, not a safe medical timing default. For care reminders, notification deferral cannot silently reschedule treatment or imply that taking medicine at the new time is appropriate. An unresolved timing/quiet-hours conflict blocks activation or requires the defined human review. Quiet hours, frequency caps, endpoint invalidation and provider kill switches remain effective during retries and fallback.

Channel selection is an explicit policy, not the source priority list executed as 'send everywhere'. Define intended initial channel(s), permitted fallback trigger, delay, eligible destination and aggregate cost/frequency budget. A timeout with unknown provider acceptance is not a definite failure that permits another channel. Push endpoints belong to current account/device bindings; after logout/reassignment a stale token must not carry another person's details. Durable in-app history is the notification source of truth, not proof of external delivery or app wake-up.

Render only reviewed template versions with schema-validated variables, length/encoding bounds, escaping and channel-specific link restrictions. Apply recipient locale and locale-aware date/number formatting while retaining explicit zone when ambiguity matters. Missing translations require a declared fallback that preserves meaning; clinical text remains exactly entered/confirmed with any separately reviewed translation provenance. No unrestricted model-generated markup, speech or sensitive interpolations. A template update cannot change the material meaning of an already approved send without the required re-review.

External messages use minimal authorized content and authenticated deep links rather than sensitive titles, doses, participant lists or reusable credentials. Access checks also cover previews, delivery receipts, lock-screen payloads, email subjects and link metadata. Group administrators can receive a generic escalation only under the proper policy; opening details still requires the patient's or task owner's current grant.

### C13-W08 Preserve Confirmed Care Instructions and Authority

Keep medicine records and other care information in a separately authorized sensitive domain linked to the scheduler. Record the data subject, entered/confirmed-by identity, source/provenance, exact confirmed dosage/instructions, intended schedule, version and permitted caregivers. An uploaded image or OCR extraction is unverified input until a qualified, authorized confirmation process accepts it. No schedule preview, translation, Agent summary or reminder text can turn uncertain OCR into a confirmed prescription.

Store values such as medicine name, form, strength, route, dates and dosage text as entered/confirmed under the released care workflow. Validate structural input without inferring a diagnosis, substituting medicine, inventing dose, interpreting unclear units, recommending a catch-up/double dose or changing treatment. Confirmation of a task in the UI does not prove clinical appropriateness. The care/legal/age/guardian/provider scope in C13-D10 requires independent review before real records or delivery are enabled.

Authorize the subject and explicitly designated representatives at the actual record/field/action level. A family owner, group administrator, relative, verified phone holder or listed caregiver is not automatically a legal guardian or entitled to all health history. Changes in representation, membership, consent, care assignment or subject account must stop disallowed pending disclosures. Preserve past audit evidence only under its reviewed access/retention basis. An approved Agent role still cannot bypass the MVP prohibition on accessing health records or making clinical decisions.

Present Taken, Snooze, Skip, Need help and Mark as missed only when permitted, and bind them to a particular person and scheduled occurrence. Label Taken as a self-report or attributed caregiver report, not objective adherence. Need help enters the explicitly configured human assistance path; it is not an automated diagnosis or emergency-services call. Stop/correction rules must be clear when a caregiver and recipient act concurrently or the plan is changed.

Sensitive images, logs, search, exports, memory, notifications and backups inherit the record's restrictions. Chapter 14 file processing and Chapter 19 encryption choices remain dependencies: server-side scanning/Agent access is not silently compatible with opaque end-to-end encrypted content. The platform cannot promise continuous monitoring, exact external delivery or emergency response from this design.

### C13-W09 Execute and Stop a Bounded Escalation

An escalation policy has a versioned trigger, scope, required response, time origin, permitted steps, recipient bindings, channel/purpose consent, approval, limits and expiry. Define whether a delay is relative to intended due time, durable notification availability, provider acceptance, verified delivery or the previous step. Do not conflate the source `initial_wait_minutes` and each `after_minutes` or add them twice. Some channels never prove delivery; the fallback timing rule must say what happens then.

Create one eligible execution per intended occurrence/recipient/policy trigger, with explicit stable step identity. Claim and recheck that the trigger remains true, required approvals still hold, previous steps meet their dependencies, the target can receive the minimal data, and all count/time/cost limits remain. Notification-failure escalation differs from 'no acknowledgment' and must not falsely state that a person ignored an undelivered reminder. A missing callback is not proof of human non-response.

Serialize acknowledgment, skip/help resolution, cancellation and each step's dispatch commitment with the same current execution state/version. A stop committed before the step's commitment prevents it; an already committed/unknown send is reconciled honestly. Each next step rechecks the stop conditions. Do not allow a stale worker, delayed callback or resumed queue entry to restart a resolved escalation or create another step under a new attempt ID.

The seven source stops are preserved: recipient acknowledgment, user cancellation, authorized admin resolution, schedule cancellation, consent revocation, maximum steps and time-window expiry. Additional current restrictions such as lost recipient/subject authority, revoked delegation, deleted source and channel kill switch suppress the affected action. Whether Skip or Need help ends the entire execution or creates a distinct bounded human task is an explicit product decision; it never implies an open-ended loop.

Support only released action types through domain services: an in-app notification, approved provider delivery, authorized caregiver/admin notice, admin task, pause or human-review request. Creating an admin task needs its own deduplicated effect and restricted audience. Voice calls need a separate opt-in, transparent caller identity, approved script, quiet-hours and finite call limits; no Agent-generated emergency assertion. Source waits of 30/60 minutes and two attempts are examples, not approved universal policy or clinical deadlines.

## 10. Internal Calendar and External Synchronization

### C13-W10 Connect, Synchronize and Resolve Calendar Changes

The internal event model works without a provider. Define its owner/Space/participants, visibility, date-only versus timed interval, end semantics, event version, series/instance/exception identity and linked reminder policy. A countdown is a client projection of an authorized event instant, not a new scheduled job for every displayed second. Viewing free/busy time does not authorize disclosure of titles, attendees, locations or health details.

External connections require a chosen official provider and reviewed capability matrix: supported calendars, scopes, recurring/all-day instances, cursors, conditional edits, cancellation/invitation behavior, rate limits and idempotency/status. Use the provider-supported secure OAuth flow with account-bound state/nonce and PKCE where applicable, exact callback/redirect validation and minimal scopes. Store protected token references with narrow worker access; no refresh token in logs, URLs, browser storage, event data or Agent context. Destination account verification and token refresh failure are distinct from app login.

Bind mappings to connection/provider account/calendar plus series/instance identifiers, not a globally assumed external event ID. Identify one authority for each synced field and direction; merely seeing an external event does not authorize republishing it into a Space or inviting external attendees. Calendar invitations, updates and cancellations may themselves send provider emails; preview that effect, consent/policy and data audience rather than describing the write as a harmless local edit.

For each bounded sync page, validate and apply additions/updates/tombstones plus the corresponding checkpoint/cursor atomically. Retried pages deduplicate; failures before commit replay without losing changes. If a provider distinguishes a page token from a final sync cursor, persist the right intermediate state and advance final completion only after all required pages. Expired cursors require an isolated bounded resync/reconciliation, not deletion of all known events or unconstrained re-import. Incomplete pages cannot justify declaring unseen events deleted.

Treat all-day dates, recurrence masters, RECURRENCE-ID/instance exceptions, changed zones and deleted instances explicitly. Imported unsupported rules enter a visible unsupported/review state, not an approximate schedule. Provider text, attachments and links are untrusted content, never Agent instructions or trusted URLs. Preserve authoritative internal IDs and provenance so a local update echoed by sync is recognized without suppressing a genuinely new remote edit. One imported event must not generate duplicate internal reminders, recurring series or invitation feedback loops.

Resolve simultaneous local/remote/shared-user changes using expected versions, provider ETags/preconditions where supported and recorded base revisions. If conditional writes are unavailable, disclose that limit and use the reviewed conflict path; local compare-and-set cannot invent provider-side concurrency safety. High-impact time, attendee, cancellation, visibility and care-linked changes require clear review rather than silent last-write wins. A calendar cancellation affects associated future reminders under explicit ownership policy, not unrelated tasks that merely mention the event.

Before each outbound calendar effect, recheck connection/grant, current source/recipient authority, exact approved event revision and provider budget. Handle unknown writes by provider query/reconciliation or human review before retry. Authenticated/deduplicated webhook hints enqueue a scoped sync; a webhook is not permission to read every calendar or overwrite internal history. Connection revocation blocks new sync/effects and revokes tokens where supported; imported data retention and independently confirmed internal reminders follow a disclosed reviewed policy, not silent deletion or unconditional continued sync.

## 11. API, Agent, Realtime and Client Experience

### C13-W11 Project the Same Scheduling Truth to Each Client

Reuse Chapter 7 envelopes, typed errors, representation/version preconditions, scoped idempotency and authorized snapshot/replay. Manual forms and Agent tools call the same domain service; neither a hidden client control nor `requires_approval: false` confers authority. Server-derived actor/context and exact resource/recipient policy apply to every query and command, including preview, list, occurrence history and delivery investigation.

The source tools/APIs map to the following behavior groups exactly once. These are mappings, not generated OpenAPI or an implementation of missing endpoints.

| Behavior group | Source tools | Source APIs | Contract |
| --- | --- | --- | --- |
| Draft/read/preview | C13-U01, C13-U02, C13-U07, C13-U08 | C13-P01, C13-P02, C13-P07 | C13-W01, C13-W02: minimal authorized reads and explicit bounded temporal preview; creating a draft does not activate it. |
| Edit/activate/lifecycle/exception | C13-U03, C13-U04, C13-U05, C13-U06, C13-U09 | C13-P03, C13-P04, C13-P05, C13-P06 | C13-W02, C13-W05: reviewed revision/scope, concurrency and cancellation/in-flight semantics. No source Agent activate tool is assumed. |
| Notification content/delivery history | C13-U10, C13-U11, C13-U12 | C13-P12 | C13-W04, C13-W07: exact approved permitted send and protected outcome evidence. A tool name does not enable external channels. |
| Care drafts and reminder response | C13-U17, C13-U18 | C13-P08, C13-P09, C13-P10 | C13-W06, C13-W08: occurrence/recipient/actor identity and health restrictions; ordinary acknowledgment is not a medicine-record grant. |
| Escalation inspect/resolve | C13-U13, C13-U14 | C13-P11 | C13-W09: authorized resolution, finite steps and no revival after stop. |
| Calendar drafts | C13-U15, C13-U16 | None in section 13.17 | C13-W10: exact event/connection/context, external side-effect disclosure and conflict policy. |

Schema gaps remain explicit: schedule list/get/update/exception operations, individual occurrence editing/cancellation, template/preferences/consent management, care record/assignment and Skip/Need help/correction, calendar connect/revoke/sync/conflict resolution, notification read and authorized retry are not fully specified by the twelve paths. Reconcile Chapter 7 and Chapter 20 before choosing canonical routes; do not create contradictory APIs or let generic update patch server-owned statuses.

Activation/update commands bind draft/source/event versions and explicit temporal mode, zone, relevant rule/exception, recipient policy, content/template version, channel/purpose, acknowledgment/escalation and required approval identity. Recipient IDs and occurrence IDs are separately typed. APIs enforce bounded date ranges/cursors and reject ambiguous local time, unsupported recurrence, stale revisions, lost authority, expired approval and unsafe retries with safe typed details. Exact error names and source-status reconciliation remain canonical-schema decisions, not ad hoc strings invented independently in both apps.

Realtime projects durable committed facts to current authorized subscribers. Event IDs, stream sequence and schema/resource versions are distinct from occurrence time or provider event time. A source `sent` event must identify its defined stage; it does not prove device receipt, read or human action. Replay/reconnect follows Chapter 7's barrier and client atomic cursor rules; do not infer state by sorting words such as `failed`, `delivered` and `acknowledged` or by trusting provider timestamps alone.

| Event group | Source events | Projection rule |
| --- | --- | --- |
| Schedule revision/lifecycle | C13-E01, C13-E02, C13-E03, C13-E04, C13-E05 | Expose permitted revision/state and scope of change, not another person's private plan or revoked future approval. |
| Occurrence due | C13-E06 | Due is a scheduler fact; quiet-hours deferral, suppression or in-flight delivery may still follow. |
| Delivery stages | C13-E07, C13-E14, C13-E15, C13-E16, C13-E17 | Recipient/channel-specific known facts with uncertainty; authentic late receipts may reconcile an in-flight effect without reopening cancelled work. |
| Human response | C13-E08, C13-E09, C13-E10 | Specific occurrence/recipient and permitted actor attribution; no whole-series or clinical-adherence inference. |
| Escalation | C13-E11, C13-E12, C13-E13 | Scoped execution/step/stop state with minimal metadata and current audience. |
| Calendar sync | C13-E18, C13-E19, C13-E20 | Connection-owner-authorized progress/failure, not raw tokens/provider payloads or global calendar counts. |

Android uses lifecycle-aware state and durable authorized sync; web uses request/account-isolated state and reviewed cache behavior. Pending local action, server-saved draft, active schedule, due, quiet-hours delayed, suppressed/expired, provider-accepted, verified-delivered, read, reported response and unknown outcome are distinguishable. A tap while offline cannot appear server-confirmed; account switching, lost membership and stale navigation must clear/deny disallowed views and actions.

| Client flow | Source Android screens | Required experience shared with web |
| --- | --- | --- |
| Browse and inspect | C13-C01, C13-C02 | Scoped calendar/list views, timezone/filter controls, next intended occurrence, recipient eligibility and meaningful empty/loading/error/revoked states. |
| Compose and preview | C13-C03, C13-C04 | Title/type/date/time/zone/recurrence/recipients/channels/acknowledgment/escalation/notes; show reviewable exceptions, fold/invalid-time choices and unsaved-change protection. Unsupported features remain unavailable. |
| Respond and inspect history | C13-C05, C13-C06, C13-C07, C13-C08 | Clear particular occurrence and person, intended versus deferred time, approved action controls and attributed self-reports; protected care details are separate from ordinary reminders. |
| Assign care access | C13-C09 | Subject/representative confirmation and narrow permissions; no default share-with-family switch or admin shortcut. |
| Review escalation | C13-C10 | Ordered steps, timing origin, recipients/channels, approvals, limits, stop conditions and effects already in flight. |
| Preferences and consent | C13-C11 | Category/purpose/channel controls, personal quiet hours/zone, language and opt-out with visible consequences for eligible pending work. |
| Calendar connection/edit | C13-C12, C13-C13 | Provider/account/calendar/scopes, sync status, conflict resolution and disconnect; clearly distinguish internal save from external invitations. |
| Delivery investigation | C13-C14 | Redacted per-recipient/channel attempt timeline, actual evidence, unknown/reconciliation state and only authorized bounded retry. |
| Exact review | C13-C15 | All material timing/recipients/content/channel/escalation effects in an accessible review, expiry/version change and explicit approve/reject/edit. Edit produces a new revision, not silent approval reuse. |

Use established Android/web visual conventions: unframed operational layouts, stable responsive controls, icons with accessible names/tooltips, toggles for preferences, date/time/zone pickers and actual recurrence options, not giant decorative cards. Preserve source language and confirmed sensitive meaning, explicit locale/zone, keyboard/TalkBack/screen-reader order, large text, RTL and non-color-only status. Unfamiliar scheduling terms should be resolved through clear field labels and validation, without exposing internal enum jargon as the whole UI.

## 12. Runtime Operations and Failure Recovery

### C13-W12 Measure Timing and Recover Without Repeating Effects

Deploy the deterministic scheduler, notification workers and calendar sync with role-specific readiness, bounded queues and database/provider budgets. Inactive/waiting future work consumes durable storage, not a sleeping worker per reminder. Separate expensive OCR/Agent jobs from time-sensitive work under the operations contract. Agree horizon/batch/lease/poll interval/retry/parallelism and per-account/Space fairness from measured capacity; no numerical SLO or emergency promise is set by this draft.

Measure scheduling lag from intended due time to durable occurrence availability, permitted-dispatch delay separately from queue delay, in-app commit latency, provider acceptance/delivery latency when known, expiry/suppression/unknown counts, acknowledgment-window outcomes, escalation stop races, calendar cursor age/conflicts and retry/cost rates. Quiet-hours or approved future deferral must not be counted as infrastructure lateness, nor used to hide actual scheduler lateness. Use bounded-cardinality, privacy-reviewed telemetry and correlation references; no medicine names, message bodies, tokens, contact strings or full calendar content in logs or metric labels.

Outbox publication alone is not completion. A reconciler must find accepted logical work lacking progress after a lost broker message, expired lease or worker crash. Retention of receipts/dedup keys must cover the supported replay/retry/restore window; if that evidence has expired, block unsafe automatic replay rather than create fresh identities. Retry classification is provider-specific and bounded with backoff/jitter and total deadlines. Provider outages/cost caps must not disable unrelated in-app/history/core manual workflows or trigger unrestricted fallback.

Authenticate provider webhooks against the verified provider/account, exact payload/signature rules and replay window, then durably deduplicate accepted events before acknowledgment. Map events only to the intended effect. Keep append-only evidence and a reviewed state reducer for delayed, duplicate, contradictory and out-of-order facts; a provider cannot assert a user's Taken action or resolve unrelated escalation. Provider health checks and signature validation are necessary, not proof that every claimed delivery reached the intended person.

Define kill switches for global external delivery, provider/channel, Space/resource, schedule, care capability and Agent delegation with audited scope and enforcement at claims/dispatch. Turning a switch back on does not immediately flush every expired or unreviewed job. Test loss of PostgreSQL/queue/provider, clock skew, tzdata update, process crash, rolling version changes, token revocation and cancellation races in isolated synthetic environments. A simulated provider proves platform response to its model, not official provider capability or real delivery latency.

Restore into isolation without live outbound credentials. Reconcile schedule/revision/occurrence/cursor/job/receipt/audit history with current cancellation, consent, membership, account deletion and provider effects that happened after the snapshot. Reapply current privacy/tombstone/kill-switch information before admitting users or dispatching; never resurrect removed recipients, cancelled escalations or already delivered effects. Incomplete authority or unknown external outcomes remain blocked/reviewed. Define RPO/RTO, catch-up windows, external-status evidence and degraded-service communications before release.

Retention/deletion policy covers schedules, sensitive care sources, templates/rendered payloads, attempts/webhook evidence, acknowledgments, derived analytics, calendar imports/tokens and backups. Required minimal audit/dedup evidence can differ from user-facing history retention, but its lawful basis/access/expiry is explicit. Continuing a retention record is not continuing permission to send, expose details or train an Agent memory.

## 13. Proposed Acceptance and Temporal Fixtures

The source stops before an acceptance section. The following thirty-two verification families are proposed requirements, not source quotations or executed tests. All runtime, scheduler, database, Android/web, Agent, care, provider and recovery evidence is NOT RUN. One family can require multiple tests; thirty-two rows do not mean thirty-two passing tests.

| ID | Verification family and required evidence | Traceability |
| --- | --- | --- |
| C13-V01 | Scoped ownership and data integrity: reject unrelated Space/task/event/recipient links, forbidden creators, private-history leakage and forged actor/status fields; validate composite ownership and uniqueness under concurrency. | C13-S01, C13-S02, C13-S04, C13-S05; C13-K01, C13-K02; C13-W01 |
| C13-V02 | Temporal input types: distinguish instant, zoned local time, date-only, elapsed interval and event-relative offset; reject inconsistent zone/offset/instant combinations and ambiguous abbreviations. | C13-S03; C13-R01; C13-K03; C13-W01 |
| C13-V03 | Relative-time and delayed approval: bind tomorrow to the original request zone/reference, detect changed event versions and reject an expired or no-longer-appropriate proposal without moving its date silently. | C13-S03, C13-S16; C13-K03, C13-K05; C13-W01, C13-W02 |
| C13-V04 | Daylight-saving gaps/folds: use the selected production engine against reviewed fixtures, distinguish zero/one/two candidate instants, expose the policy and prevent unintended duplicate sends. | C13-S03; C13-K03, C13-K04; C13-W01, C13-W03 |
| C13-V05 | Recurrence boundaries: exercise daily/week/month/leap-day rules, supported BY* combinations, DTSTART/RDATE/EXDATE types, COUNT/UNTIL, end boundaries and expensive/unsupported inputs; preview and execution agree. | C13-S03, C13-S06; C13-R02; C13-K04; C13-W01, C13-W03 |
| C13-V06 | Travel and timezone updates: distinguish viewer, schedule and quiet-hours zones; tzdata/profile edits preserve fixed instants and stable logical instances or require the documented future revision review. | C13-S03, C13-S11, C13-S15; C13-K03, C13-K05, C13-K06; C13-W05, C13-W07, C13-W10 |
| C13-V07 | Exact activation and standing grants: stale preview, changed audience/content/channel, expired approval, quota failure or revoked creator/subject authority cannot activate; concurrent/idempotent retries preserve one reviewed result. | C13-S04, C13-S10, C13-S16, C13-S17; C13-K02, C13-K05; C13-W02 |
| C13-V08 | Logical identity through edits: one-instance and following-series changes, exceptions, timezone recomputation and retry retire/supersede the correct planned work without double dispatch or rewriting past effects. | C13-S03, C13-S04, C13-S05; C13-R03; C13-K05, C13-K06; C13-W03, C13-W05 |
| C13-V09 | Atomic materialization: inject faults before/after occurrence, durable job/outbox and cursor commits; a lost publish is recovered and an uncommitted instance cannot be skipped permanently. | C13-S05, C13-S06; C13-K07; C13-W03 |
| C13-V10 | Concurrent scheduler and backlog: duplicate leaders/materializers, huge rules, overdue horizons, pause/resume and tenant bursts obey uniqueness, bounded catch-up and fair resource limits. | C13-S06; C13-K04, C13-K06, C13-K07, C13-K16; C13-W03, C13-W05, C13-W12 |
| C13-V11 | Lease and clock faults: stale workers cannot mutate another claim; expired authority after lock waits, clock adjustment and rolling-version recovery do not extend permission or create duplicate effects. | C13-S06; C13-K08, C13-K16; C13-W03, C13-W04, C13-W12 |
| C13-V12 | Cancellation commitment races: cancel before commitment prevents the send; cancel/crash during a committed external call retains unknown or reconciled evidence and cannot restart the series/escalation. | C13-S06, C13-S07, C13-S14; C13-K08, C13-K09; C13-W04, C13-W05 |
| C13-V13 | Durable in-app delivery: one allowed notification per logical recipient effect, restart/lost queue/repeated claim recovery, current access on history and useful operation while clients/LLM/providers are unavailable. | C13-S02, C13-S07, C13-S14; C13-K01, C13-K07, C13-K09; C13-W03, C13-W04 |
| C13-V14 | Provider uncertainty and receipts: supported idempotency, timeout after acceptance, duplicate/out-of-order/forged callbacks and reconciliation do not invent delivered/read/ack status or authorize another send. | C13-S07, C13-S14, C13-S18; C13-K09, C13-K16; C13-W04, C13-W12 |
| C13-V15 | Recipient and purpose changes: static/dynamic roster behavior, history boundary, account removal, caregiver withdrawal, recycled destination and device reassignment stop disallowed pending disclosures. | C13-S04, C13-S10, C13-S12; C13-K02, C13-K10; C13-W02, C13-W04, C13-W07, C13-W08 |
| C13-V16 | Quiet hours: cross-midnight/weekday/gap/fold/equal-boundary windows, preference changes, expiry before wake-up and care conflicts use recipient zones and preserve original due time without unapproved priority bypass. | C13-S07, C13-S10, C13-S11, C13-S12; C13-K03, C13-K10; C13-W07 |
| C13-V17 | Channel policy and limits: consent/opt-out/kill switch/frequency/cost caps override defaults; only approved multi-channel or known-failure fallback occurs, and an unknown outcome cannot trigger a duplicate fallback. | C13-S07, C13-S08, C13-S10, C13-S14; C13-K09, C13-K10, C13-K16; C13-W04, C13-W07, C13-W12 |
| C13-V18 | Template and locale safety: schema, size/encoding, escaping, links, locale fallback, material version changes and sensitive field projection are enforced in previews, lock screens, subjects and telemetry. | C13-S08, C13-S09, C13-S14; C13-K11; C13-W07 |
| C13-V19 | Human action identity: per-recipient/per-occurrence acknowledgment, representative authorization, idempotent duplicate, concurrent correction and late/offline action preserve actor/time and cannot mark a whole series or another person complete. | C13-S04, C13-S12, C13-S17; C13-K02, C13-K12; C13-W06 |
| C13-V20 | Snooze follow-up: stable follow-up identity/count/window, conflict with the next occurrence, expiry/quiet hours and repeated tap/retry create only the allowed notification and never modify dosage or treatment timing. | C13-S12, C13-S17; C13-K06, C13-K10, C13-K12; C13-W06, C13-W08 |
| C13-V21 | Missed, Skip, Need help and late response: lack of recorded response is not physical non-adherence; late response/resolution stops eligible future work while preserving prior effects and the configured human-assistance path. | C13-S08, C13-S12, C13-S13; C13-K12, C13-K13; C13-W06, C13-W08, C13-W09 |
| C13-V22 | Care-data safety: confirmed text/provenance, unresolved OCR, caregiver/subject/guardian permissions and derivative access; reject diagnosis, dose inference/change, substitution, double-dose advice and unsupported emergency claims. | C13-S12, C13-S16; C13-K02, C13-K11, C13-K12, C13-K15; C13-W08 |
| C13-V23 | Escalation finite-state evidence: explicit delay origin, one logical step, acknowledgment/cancel races, each source stop, permissions/consent and finite attempts/expiry/cost; an undelivered notice is not asserted to be ignored. | C13-S08, C13-S13, C13-S14; C13-K08, C13-K09, C13-K13; C13-W09 |
| C13-V24 | Calendar connection security: provider/account/calendar-scoped mappings, minimal scopes, callback binding, token custody/refresh/revocation and authorized free/busy versus private event details. | C13-S15; C13-K02, C13-K14; C13-W10 |
| C13-V25 | Sync checkpoints and deletion: partial pages, duplicate changes, invalid final cursor, crash at commit, expired-cursor resync, tombstones and echoed writes preserve one event and cannot erase unseen events or create feedback loops. | C13-S15; C13-K07, C13-K14; C13-W10 |
| C13-V26 | Calendar recurrence and conflicts: all-day/master/instance exceptions, unsupported rules, changed zones, simultaneous edits, invitation side effects, unknown writes, cancellation and disconnect follow explicit authority and resolution rules. | C13-S15; C13-K03, C13-K05, C13-K06, C13-K09, C13-K14; C13-W10 |
| C13-V27 | Agent boundaries: typed drafts/previews and permitted tools share manual policy; exact approval, replay identity, untrusted calendar/text and forbidden MVP care/external operations stay bounded, and accepted schedules run with the LLM down. | C13-S01, C13-S02, C13-S16; C13-K01, C13-K05, C13-K15; C13-W01, C13-W02, C13-W11 |
| C13-V28 | API contracts: resolve the twelve source paths and missing operations, typed reminder/occurrence/recipient IDs, scope/version/idempotency, bounded reads and safe errors; no generic status patch or implicit latest-instance action. | C13-S17; C13-K02, C13-K05, C13-K12, C13-K15; C13-W06, C13-W11 |
| C13-V29 | Realtime and replay: the twenty event meanings, durable projection versions, ordered scoped recovery and current access hold across disconnect/revocation/account switch; provider timestamps do not supply client authorization. | C13-S18; C13-K02, C13-K09, C13-K15; C13-W11 |
| C13-V30 | Client workflow parity: exercise all fifteen source screens and equivalent web flows, accurate state/unknown handling, account/offline races, exact review, unsaved changes, responsive layout, locale/RTL and assistive technology. | C13-S19; C13-K11, C13-K12, C13-K15; C13-W01, C13-W06, C13-W07, C13-W08, C13-W09, C13-W10, C13-W11 |
| C13-V31 | Operations and privacy: measured due/eligible/queue latency, capacity/fairness/cost, outages, compatible upgrades, private logs, retention and isolated restore with current revocations and post-snapshot provider reconciliation. | C13-S05, C13-S06, C13-S07, C13-S10, C13-S14, C13-S15; C13-K07, C13-K08, C13-K09, C13-K16; C13-W12 |
| C13-V32 | M1 ordinary family journey: synthetic intended admission, shared task, exact one-time in-app reminder, durable independent execution and per-person acknowledgment, plus cancellation/revocation/retry/restart/denied-account controls on Android and core web. | C13-S01, C13-S02, C13-S03, C13-S04, C13-S07, C13-S17, C13-S18, C13-S19; C13-K01, C13-K02, C13-K07, C13-K08, C13-K12, C13-K15; C13-W01, C13-W02, C13-W03, C13-W04, C13-W05, C13-W06, C13-W11, C13-W12 |

### Synthetic Time-Arithmetic Fixture

This JSON is documentation, not an API request or a scheduler test file. All identities are synthetic. It specifies five examples: one ordinary meeting, local daily time across a daylight-saving change, a nonexistent clock time, an ambiguous clock time and quiet-hours deferral past expiry. Notification counts are expected future test assertions, not observed sends. Dates, windows and limits are illustrative, not production or medical defaults.

```json
{
	"fixture_kind": "synthetic_document_time_arithmetic",
	"runtime_executed": false,
	"ordinary_meeting": {
		"request_at": "2026-09-18T09:00:00Z",
		"zone": "Asia/Kolkata",
		"relative_date": "tomorrow",
		"resolved_local": "2026-09-19T19:00:00",
		"expected_due_at": "2026-09-19T13:30:00Z",
		"intended_recipients": ["synthetic-member-a", "synthetic-member-b"],
		"channel": "in_app",
		"expected_scheduled_deliveries_before_activation": 0,
		"expected_logical_notifications_after_authorized_due_dispatch": 2,
		"expected_external_provider_sends": 0
	},
	"daily_wall_clock": {
		"zone": "America/New_York",
		"occurrences": [
			{ "local": "2026-03-07T09:00:00", "utc": "2026-03-07T14:00:00Z" },
			{ "local": "2026-03-08T09:00:00", "utc": "2026-03-08T13:00:00Z" }
		],
		"expected_elapsed_hours": 23,
		"fixed_elapsed_24h_control": {
			"next_at": "2026-03-08T14:00:00Z",
			"next_local": "2026-03-08T10:00:00"
		}
	},
	"gap": {
		"zone": "America/New_York",
		"local": "2026-03-08T02:30:00",
		"expected_candidate_instants": 0,
		"resolution": "requires_explicit_policy"
	},
	"fold": {
		"zone": "America/New_York",
		"local": "2026-11-01T01:30:00",
		"candidate_utc": ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"],
		"resolution": "not_selected",
		"sends_authorized_by_fixture": 0
	},
	"quiet_hours": {
		"zone": "Asia/Kolkata",
		"starts": "22:00:00",
		"ends": "07:00:00",
		"intended_local": "2026-09-19T23:00:00",
		"earliest_next_local": "2026-09-20T07:00:00",
		"intended_due_at": "2026-09-19T17:30:00Z",
		"earliest_permitted_at": "2026-09-20T01:30:00Z",
		"expires_at": "2026-09-19T18:30:00Z",
		"expected_dispatch": "blocked_by_expiry",
		"medical_policy": false
	}
}
```

A local documentation check may parse this fixture and verify its finite conversions with .NET timezone data, explicitly mapping `Asia/Kolkata` to Windows `India Standard Time` and `America/New_York` to `Eastern Standard Time`. That does not select or test the production recurrence library, approve a gap/fold policy, materialize an occurrence, dispatch a message, change the system clock or demonstrate future timezone-law correctness. The actual selected engine must later run C13-V02 through C13-V06 with versioned fixtures and independent expected results.

## 14. Developer Handoff and Delivery Sequence

These are responsibility packages, not twelve mandatory services, people or running Agents. Cross-chapter implementation prerequisites apply only when implementation is authorized; design can proceed without pretending those prerequisites already pass. Conditional recurrence, care, provider and calendar packages do not block the ordinary in-app M1 subset.

| ID | Owner | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C13-T01 | Product, scheduling and security leads | Relevant release, identity, Space, data, API and security decisions | Resolve released scope and C13-D01 through C13-D14, temporal meanings, recipient authority, safety and real evidence thresholds. Keep numeric examples and provider/care capabilities unapproved until reviewed. |
| C13-T02 | Temporal/domain engineer | C13-T01 | Select maintained recurrence/IANA libraries and canonical temporal/rule/exception/preview contracts; versioned C13-V02 through C13-V06 evidence. No handwritten parser or independent client recurrence engine. |
| C13-T03 | Data/backend engineer | C13-T02; accepted data/API ownership contracts | Implement schedule/revision/recipient/instance/receipt/job relationships, stable identity, source constraints and atomic transactions; C13-V01, C13-V07 through C13-V09. |
| C13-T04 | Scheduler/worker engineer | C13-T02, C13-T03 | Implement bounded horizon/cursor, materialization, current-time/fenced claims, restart/reconciler and late/pause policy; C13-V09 through C13-V13. |
| C13-T05 | Notification/policy engineer | C13-T01, C13-T03, C13-T04 | Implement current recipient/purpose/channel policy, quiet hours, templates, durable in-app history and explicit dispatch commitment. External adapters remain Chapter 20 gates; C13-V12 through C13-V18. |
| C13-T06 | Reminder workflow engineer | C13-T03, C13-T04, C13-T05 | Implement exact occurrence/recipient acknowledgment, bounded snooze, correction, edit/cancel and late-response races; C13-V08, C13-V12, C13-V19 through C13-V21. |
| C13-T07 | Escalation and authorized care engineer | C13-T02, C13-T05, C13-T06; care/privacy approval before sensitive scope | Implement only released finite escalation and confirmed-instruction/representative workflows; C13-V15, C13-V16, C13-V20 through C13-V23. Do not treat this package as clinical/provider authorization. |
| C13-T08 | Calendar integration engineer | C13-T02, C13-T03, C13-T04, C13-T06; explicit provider approval | Implement internal calendar and selected scoped sync/cursors/conflicts/instance mapping, token custody and invitation effects; C13-V24 through C13-V26. Provider capability must be verified, not inferred. |
| C13-T09 | API, Agent, Android and web engineers | C13-T03, C13-T05, C13-T06; C13-T07, C13-T08 for released features | Implement shared authorized typed operations, exact reviews and honest durable event/client state; C13-V27 through C13-V30. Reconcile missing source routes before generating clients. |
| C13-T10 | Platform and operations engineer | C13-T04, C13-T05, C13-T06; C13-T07, C13-T08 for released features | Enforce measured budgets/readiness, private observability, kill switches, upgrades, retention and isolated reconciled recovery; C13-V11, C13-V14, C13-V17, C13-V31. |
| C13-T11 | Independent QA, security and domain reviewers | C13-T02 through C13-T10 for released scope | Execute applicable C13-V01 through C13-V32 with exact artifact/library/tzdata/provider/simulator identities and faults; record failures/skips/limits. Document arithmetic or mocks cannot certify live provider timing, care safety or restore. |
| C13-T12 | File, search, privacy and product leads | C13-T01, C13-T03, C13-T09; C13-T11 for implemented scheduling evidence | Chapter 14 handoff: immutable authorized file versions, quarantine/OCR/document lineage and permitted retrieval for attachments or care sources. Design may proceed now; OCR is not confirmed medical instruction and stored files do not expand Agent access. |

Order the authorized first slice as policy and temporal contract, durable data/work identity, one-time deterministic in-app execution, cancellation/acknowledgment, shared client projection and fault evidence. Add recurring rules, bounded escalation, sensitive care scope and provider/calendar channels only with their own gates. [Chapter 20](../Chapter20.md#L2276) remains the notification/provider detail owner; this chapter defines the timing and effect boundaries it must honor.

## 15. Demonstration, Remaining Risks and Next Chapter

### Ordinary Family M1 Demonstration

Use only synthetic accounts and content, a controlled test clock where appropriate and the approved one-time in-app subset. This is a future demo script, not a report of completed work.

1. Establish verified synthetic accounts, a private family and an intended invitation/admission. Keep a third unauthorized account as a denial control.
2. Create an ordinary shared task and select the actual admitted recipient accounts. Do not use medicine data, real contacts or a dynamic future-member audience.
3. Enter a specific local date/time and named zone, resolve it to one instant and review recipients, content and the in-app channel. Preview alone schedules no delivery.
4. Activate the exact reviewed revision and show the durable canonical state. Stop the Agent/LLM path; the accepted schedule must not depend on it.
5. Restart a scheduler/worker or lose a broker publication in the isolated fixture. Recover the same occurrence and logical effects without a duplicate or lost cursor interval.
6. At the permitted due time, create one durable authorized in-app notification for each intended recipient. Do not report that a closed app woke up or an external channel delivered.
7. Acknowledge one recipient's particular occurrence and show persisted attribution/history on Android and core web. Do not mark another recipient or the entire recurring series complete.
8. Cancel a separate future reminder before dispatch commitment and verify that it does not send. Show the honest in-flight/unknown state in a separate controlled race if that capability is in the released slice.
9. Revoke a recipient's relevant access before another queued effect commits; deny private history and new dispatch. The unrelated account cannot enumerate occurrence details, delivery receipts or acknowledgment actions.
10. Repeat an activation/acknowledgment request, reconnect a client and switch accounts. Demonstrate stable logical identity, current authorization and pending-versus-confirmed UI rather than relying on visual timers or a happy-path screenshot.

Record actual build/configuration, server/client/library versions, synthetic inputs, expected versus observed state/effects, fault locations, attempt/receipt/cursor evidence and failures/skips. Keep sensitive content out of logs and artifacts. A passing M1 is evidence for this narrow workflow, not the full MVP, push/email/WhatsApp/voice, arbitrary recurrence, care safety, complete Agent behavior or production capacity.

### Release Boundaries and Remaining Risks

- The seven OPEN and seven PROPOSED choices in section 5 remain unapproved. Source schedule/occurrence/acknowledgment enums overlap and need a canonical state transition specification before code generation; local leases/UTC uniqueness alone do not solve provider uncertainty or edited recurrence identity.
- Exact gap/fold/month-edge and overdue/quiet-hour/escalation policies, supported recurrence subset, temporal engine/tzdata versions, standing-grant/recipient changes and measurable budgets must be selected before the corresponding feature activates. Refuse an unresolved material intent rather than silently approximate it.
- Official provider capability, consent/legal basis, recipient identity, calendar invitation side effects and external timing cannot be proven by an adapter interface. Source references to open-source WhatsApp APIs do not override the earlier ban on unofficial automation in the MVP design.
- Health/guardian authority, verified instructions, retention, sensitive derivatives and encryption require separate reviewed product/legal/security decisions. No continuous-monitoring, clinical adherence, emergency-service, universal exactly-once, immediate recall or compliance-certification claim follows from this document.
- Do not release a dependent feature with a known critical authority/privacy/duplicate-effect/cancellation failure. An explicitly accepted residual risk cannot waive required permission, legal duties or convert NOT RUN evidence into a pass. Disable unresolved future capabilities without mislabeling the ordinary M1 as the complete product.

Next is [Chapter 14](../Chapter14.md): upload/file/document processing, immutable generations, quarantine/scanning, OCR/chunks/embeddings, authorization-aware retrieval and citation/deletion lineage. Carry the [trust/operations](../Chapter16.md), [encryption](../Chapter19.md) and [notification delivery](../Chapter20.md) dependencies forward. Continue design and developer handoff; source preservation and planning continuation still do not authorize implementation or approve these policy choices.