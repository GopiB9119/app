# Chapter 20: Notification Delivery and External Communication Contract

Status: DRAFT FOR PRODUCT, DELIVERY, SECURITY AND PRIVACY REVIEW. This is a design and verification plan, not an implemented delivery service, approved provider integration, push infrastructure or emergency capability.

Document role: working Chapter 20 review reference, not an approved canonical specification. Use the [reconciliation index](CONTRACT_RECONCILIATION.md) for file-qualified mappings to the retained [partial alternate](CHAPTER_20_NOTIFICATION_DELIVERY_CONTRACT.md) and for unresolved ADR/owner gates. A review reference does not approve providers, launch channels or implementation.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md) and the delivery handoffs in the [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [messaging](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [trust operations](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) and [event](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) drafts. It addresses C1-D03, C13-D07, C13-D12 and C19-T12 without approving those proposals.

- [Chapter 20](Chapter20.md) is the owning source for in-app, push, email, SMS, WhatsApp, voice, templates, quiet hours, escalation and provider adapters. This contract proposes the canonical delivery design; it does not approve live providers or deployment.
- Chapter 13 owns schedule/occurrence timing. This contract owns notification command admission, recipient/channel policy, delivery and provider outcomes, reusing the same occurrence and escalation authorities rather than adding an independent timer or business-acknowledgment engine.
- The centralized policy engine authorizes permitted work; authorized dispatch workers invoke provider adapters. Agents and unrelated domain modules cannot bypass that path or obtain provider credentials. Policy evaluation itself need not make network calls.
- M1 remains synthetic manual family task plus confirmed one-time in-app reminder, without required Agent code, push or email proof. [ADR-0005](adr/0005-mvp-scope-and-milestones.md) proposes additional M1/M2 and M6 channel sequencing but remains PROPOSED. The [team plan](TEAM_ORGANIZATION_EXECUTION_PLAN.md) records the milestone conflict and OPEN C1-D03; this chapter does not close either. SMS/WhatsApp/voice and real care workflows remain separately gated.
- The [partial notification-delivery alternate](CHAPTER_20_NOTIFICATION_DELIVERY_CONTRACT.md) remains retained with its existing body and a routing annotation. The shared reconciliation index maps its source catalogs and decisions; C20 IDs are file-local and the underlying policy/API choices still need actual owner approval before becoming one canonical specification.
- Preserve original sources, earlier drafts, the team plan and proposed ADRs. Planning does not authorize implementation, credentials, real recipients/health data, test sends/calls, provider or model requests, provisioning, spending, deployment or policy approval.
- All runtime notification/database/scheduler/provider/webhook/client/security tests are NOT RUN. IDs identify planned requirements and evidence families; document and synthetic checks prove only their stated properties.
- The source has completed final decisions and acceptance criteria at section 20.35, but no verified provider capabilities or operational evidence. Additional workflows and runbook requirements below are proposed refinements, not recovered source text or guarantees of emergency response.

## 2. Exact Source Final Decisions

All 25 decisions in [20.34](Chapter20.md#L2276) are retained verbatim. They are design requirements, not proof of capability.

| ID | Source final decision |
| --- | --- |
| C20-R01 | Notification delivery is separate from agent reasoning. |
| C20-R02 | Agents create structured notification commands, not unrestricted provider calls. |
| C20-R03 | A centralized policy engine evaluates consent, preferences, privacy, and rate limits. |
| C20-R04 | In-app notifications are the durable source of notification history. |
| C20-R05 | Push notifications are wake-up and delivery hints, not the source of truth. |
| C20-R06 | External providers are accessed through adapters. |
| C20-R07 | Provider-specific logic is isolated from the domain layer. |
| C20-R08 | Email, SMS, WhatsApp, and voice calls require channel-specific policies. |
| C20-R09 | External communication requires explicit consent and verified destinations. |
| C20-R10 | Sensitive content is redacted from push, SMS, email, WhatsApp, and voice workflows by default. |
| C20-R11 | Quiet hours are timezone-aware. |
| C20-R12 | Notification templates are versioned, localized, and schema-validated. |
| C20-R13 | Delivery attempts are idempotent and bounded by retry policies. |
| C20-R14 | Provider webhooks are authenticated and deduplicated. |
| C20-R15 | Escalation is a bounded state machine with clear stop conditions. |
| C20-R16 | Medicine reminders preserve confirmed information and do not infer medical instructions. |
| C20-R17 | Agents cannot independently assign critical priority or bypass consent. |
| C20-R18 | External communication can be disabled globally, by provider, by resource, or by agent. |
| C20-R19 | Notification delivery is asynchronous and independently scalable. |
| C20-R20 | The initial implementation should support in-app, push, and email first. |
| C20-R21 | SMS, WhatsApp, and voice should be added through the same provider abstraction. |
| C20-R22 | All external communication actions must be auditable. |
| C20-R23 | Notification content must never be logged in plaintext when sensitive. |
| C20-R24 | Cost and provider quota tracking are required before enabling large-scale external delivery. |
| C20-R25 | The scheduler and escalation engine must operate reliably even when the LLM is unavailable. |

All twenty-three acceptance criteria from section 20.35 are also preserved verbatim. These are required behaviors, not executed tests.

| ID | Source acceptance criterion |
| --- | --- |
| C20-A01 | Notifications can be created, scheduled, delivered, read, suppressed, and cancelled. |
| C20-A02 | In-app notification history is durable. |
| C20-A03 | Push delivery supports multiple devices. |
| C20-A04 | Email delivery supports verification, recovery, and optional reminders. |
| C20-A05 | Provider adapters isolate external service dependencies. |
| C20-A06 | Consent is checked before external delivery. |
| C20-A07 | Users can configure notification categories and channels. |
| C20-A08 | Quiet hours work using the recipient's timezone. |
| C20-A09 | Sensitive content is redacted. |
| C20-A10 | WhatsApp integration uses verified destinations and explicit consent. |
| C20-A11 | Voice calls have attempt limits and opt-out support. |
| C20-A12 | Escalation policies have bounded steps and stop conditions. |
| C20-A13 | Notification retries are idempotent. |
| C20-A14 | Provider webhooks are verified and deduplicated. |
| C20-A15 | Invalid destinations are disabled safely. |
| C20-A16 | External providers can be disabled through a kill switch. |
| C20-A17 | Agent notification tools enforce authorization and policy. |
| C20-A18 | Medicine reminders do not change or infer dosage. |
| C20-A19 | Delivery metrics and provider costs are observable. |
| C20-A20 | Failed notifications can be investigated and safely retried. |
| C20-A21 | Android and web clients expose notification and consent controls. |
| C20-A22 | Notification data is protected by resource-level authorization. |
| C20-A23 | The system continues operating when the LLM or one provider is unavailable. |

The typographic apostrophe in C20-A08 is normalized to ASCII; no other acceptance wording is changed.

## 3. Source Topic Coverage

All 35 numbered source sections are retained with exact titles. Coverage does not imply the source provides finished canonical schemas, verified provider behavior or executed tests.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C20-S01 | Purpose and Scope | [20.1](Chapter20.md#L3) |
| C20-S02 | Core Architecture Principle | [20.2](Chapter20.md#L59) |
| C20-S03 | Notification Types | [20.3](Chapter20.md#L107) |
| C20-S04 | Notification Lifecycle | [20.4](Chapter20.md#L231) |
| C20-S05 | Notification Domain Components | [20.5](Chapter20.md#L393) |
| C20-S06 | Notification Command | [20.6](Chapter20.md#L414) |
| C20-S07 | Notification Categories and Priority | [20.7](Chapter20.md#L448) |
| C20-S08 | Recipient Resolution | [20.8](Chapter20.md#L599) |
| C20-S09 | Consent Architecture | [20.9](Chapter20.md#L649) |
| C20-S10 | User Communication Preferences | [20.10](Chapter20.md#L720) |
| C20-S11 | Quiet Hours and Timezones | [20.11](Chapter20.md#L763) |
| C20-S12 | Template Architecture | [20.12](Chapter20.md#L809) |
| C20-S13 | In-App Notification Architecture | [20.13](Chapter20.md#L862) |
| C20-S14 | Push Notification Architecture | [20.14](Chapter20.md#L917) |
| C20-S15 | Email Architecture | [20.15](Chapter20.md#L983) |
| C20-S16 | SMS Architecture | [20.16](Chapter20.md#L1048) |
| C20-S17 | WhatsApp Architecture | [20.17](Chapter20.md#L1096) |
| C20-S18 | Voice Call Architecture | [20.18](Chapter20.md#L1180) |
| C20-S19 | Escalation Architecture | [20.19](Chapter20.md#L1261) |
| C20-S20 | Medicine Reminder Communication | [20.20](Chapter20.md#L1366) |
| C20-S21 | Notification Scheduling | [20.21](Chapter20.md#L1427) |
| C20-S22 | Provider Adapter Contract | [20.22](Chapter20.md#L1502) |
| C20-S23 | Retry Architecture | [20.23](Chapter20.md#L1567) |
| C20-S24 | Delivery Tracking | [20.24](Chapter20.md#L1635) |
| C20-S25 | Notification APIs | [20.25](Chapter20.md#L1685) |
| C20-S26 | Database Model | [20.26](Chapter20.md#L1738) |
| C20-S27 | Android Screens | [20.27](Chapter20.md#L1785) |
| C20-S28 | Web/Desktop Screens | [20.28](Chapter20.md#L1848) |
| C20-S29 | Security and Privacy | [20.29](Chapter20.md#L1885) |
| C20-S30 | Agent Integration | [20.30](Chapter20.md#L1989) |
| C20-S31 | Observability and Metrics | [20.31](Chapter20.md#L2051) |
| C20-S32 | Failure Handling | [20.32](Chapter20.md#L2131) |
| C20-S33 | Repository Structure | [20.33](Chapter20.md#L2217) |
| C20-S34 | Final Architecture Decision | [20.34](Chapter20.md#L2276) |
| C20-S35 | Acceptance Criteria | [20.35](Chapter20.md#L2330) |

### Source Types and Status Meanings

All five type headings and fourteen status/meaning pairs are retained. Source backticks around status names are omitted; the source `read` wording is an inventory, not a reason to merge transport evidence, inbox read and business acknowledgment.

| ID | Source notification type |
| --- | --- |
| C20-F01 | System Notifications |
| C20-F02 | Social Notifications |
| C20-F03 | Productivity Notifications |
| C20-F04 | Family and Relationship Notifications |
| C20-F05 | Sensitive Notifications |

| ID | Source status | Source meaning |
| --- | --- | --- |
| C20-L01 | created | Notification command received |
| C20-L02 | validating | Payload and policy checks running |
| C20-L03 | authorized | Sender and recipient permissions confirmed |
| C20-L04 | scheduled | Delivery time is in the future |
| C20-L05 | queued | Ready for a delivery worker |
| C20-L06 | dispatching | Provider request is in progress |
| C20-L07 | sent | Provider accepted the request |
| C20-L08 | delivered | Provider confirmed delivery |
| C20-L09 | read | Recipient opened or acknowledged it |
| C20-L10 | failed | Delivery failed |
| C20-L11 | retrying | Delivery will be attempted again |
| C20-L12 | suppressed | Policy or preference prevented delivery |
| C20-L13 | cancelled | User or system cancelled it |
| C20-L14 | expired | Delivery window ended |

An earlier authorized result is not permanent permission. Cancellation intent can coexist with an already committed attempt awaiting a receipt. Canonical command, recipient, channel-effect, attempt, provider-observation and business-response transitions must be defined separately, including an explicit unknown outcome when evidence is incomplete.

All fifteen component labels from section 20.5 are retained; they are responsibilities, not fifteen required deployments.

| ID | Source component |
| --- | --- |
| C20-N01 | Notification API |
| C20-N02 | Notification Command Service |
| C20-N03 | Template Service |
| C20-N04 | Recipient Resolver |
| C20-N05 | Consent Service |
| C20-N06 | Preference Service |
| C20-N07 | Policy Engine |
| C20-N08 | Scheduler |
| C20-N09 | Channel Router |
| C20-N10 | Provider Adapter Layer |
| C20-N11 | Delivery Tracker |
| C20-N12 | Retry Manager |
| C20-N13 | Escalation Engine |
| C20-N14 | Audit Service |
| C20-N15 | Notification Analytics |

### Source Category Defaults and Command Fields

The seven category rows from section 20.7.2 remain examples, not approved channel defaults or consent exceptions.

| ID | Source category | Source default channel | Source external channel |
| --- | --- | --- | --- |
| C20-G01 | Security alert | Push + email | Optional SMS |
| C20-G02 | Group message | In-app + push | Usually disabled |
| C20-G03 | Task reminder | In-app + push | Consent required |
| C20-G04 | Medicine reminder | In-app | Explicit consent required |
| C20-G05 | Family escalation | In-app + push | Explicit consent required |
| C20-G06 | Marketing | In-app/email | Separate opt-in |
| C20-G07 | Agent approval | In-app + push | Optional email |

The fourteen top-level fields in the section 20.6 JSON example are retained. Server policy derives or validates each field; `requires_consent: false`, priority or allowed channels supplied by a caller cannot waive authority.

| ID | Source command field |
| --- | --- |
| C20-M01 | notification_id |
| C20-M02 | category |
| C20-M03 | priority |
| C20-M04 | recipient_account_id |
| C20-M05 | resource_type |
| C20-M06 | resource_id |
| C20-M07 | template_key |
| C20-M08 | template_version |
| C20-M09 | variables |
| C20-M10 | allowed_channels |
| C20-M11 | scheduled_for |
| C20-M12 | expires_at |
| C20-M13 | requires_consent |
| C20-M14 | idempotency_key |

The source inventories below preserve order; they are not combined into one state machine.

| Source list | Values in source order |
| --- | --- |
| Priority levels, 20.7.1 | low, normal, high, critical |
| Preference levels, 20.10 | Global Account Preference, Category Preference, Resource Preference, Conversation Preference, Notification-Specific Override |
| Email delivery states, 20.15.2 | queued, accepted, delivered, bounced, soft_bounced, complained, opened, clicked, failed |
| Call statuses, 20.18.2 | queued, dialing, ringing, answered, voicemail, busy, no_answer, failed, cancelled, completed |

The nine source escalation stops are `Recipient acknowledges`, `Task is completed`, `Event is cancelled`, `User revokes consent`, `Recipient leaves the resource`, `Admin cancels escalation`, `Maximum attempts reached`, `Expiration time reached`, `Policy condition becomes false`. They remain current gates even when a worker retries or a provider response arrives late.

## 4. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C20-D01 | Notification policy engine | One centralized engine owns consent, preference, quiet-hours, priority, category and rate evaluation for every channel; the scheduler and agents may not dispatch around it. | PROPOSED |
| C20-D02 | Command model and idempotency | Structured notification commands with stable logical ID, purpose, resource, recipient set, priority, template key and payload digest; repeats reconcile to the canonical record, not a new send. | PROPOSED |
| C20-D03 | In-app as durable truth | Persist business state plus notification intent atomically where possible, then materialize deduplicated recipient inbox records. Inbox read/dismiss state is separate from authorized task/reminder/approval acknowledgment owned by the source domain. | PROPOSED |
| C20-D04 | Push infrastructure | Select provider(s), credential custody, device registration, token lifecycle, platform quotas and time-sensitive exception behavior before any push path activates. | OPEN |
| C20-D05 | Email and verification policy | Select provider, destination binding, a narrowly authorized first-contact verification/recovery path, action-token security, bounce/complaint handling and suppression. Verification cannot require already-proven possession or become a general consent bypass. | OPEN |
| C20-D06 | Priority and critical senders | Define priority levels, who may assign them, quiet-hours exceptions and the prohibition on agent self-assigned criticality; clinical timing cannot be casually deferred. | OPEN |
| C20-D07 | Quiet hours and batching | Per-recipient timezone evaluation, exception categories, batching/digest defaults and the interaction with acknowledgment deadlines from Chapter 13. | OPEN |
| C20-D08 | Consent and destination binding | Purpose/resource/channel/recipient/sensitivity-scoped grants and versioned verified endpoint binding, with protected destination values and keyed lookup if needed. Revocation stops new dispatch at the defined commitment boundary; in-flight effects are reconciled honestly. | PROPOSED |
| C20-D09 | Templates and localization | Versioned reviewed templates with schema-validated variables, escaping, localization and honest fallback when a locale or channel template is missing. | PROPOSED |
| C20-D10 | Retry and uncertainty | Stable logical recipient/channel effects, bounded attempts with provider-specific backoff, and reconciliation of unknown outcomes before retry or fallback. Local deduplication cannot guarantee exactly-once effects at an external provider. | PROPOSED |
| C20-D11 | Webhook trust | Provider-specific signature/authentication, freshness/replay and payload bounds, scoped event identity/digest and durable inbox before acknowledgment. Delivery callbacks do not grant membership, identity proof or consent; authenticated opt-out callbacks may only restrict the affected channel/purpose. | PROPOSED |
| C20-D12 | SMS, WhatsApp and voice gates | Approved business providers, template compliance, call-window/attempt limits, disclosure for automated voice and kill switches per provider; unofficial automation remains banned. | OPEN |
| C20-D13 | Escalation contracts | Bounded policies with steps, delays, maximum attempts and stop conditions; minimal-content templates; family/caregiver authority must come from Chapter 3/18 grants, not role labels. | PROPOSED |
| C20-D14 | Observability and cost | Delivery, failure, latency, quota and cost metrics per provider/channel with sensitive-content-free telemetry; budgets block scale-up before external delivery activates. | OPEN |

These eight proposals and six open choices remain unapproved. An adapter interface alone proves no provider capability for any channel.

## 5. Channel Responsibility Matrix

| Channel | Durable role | Wake/attention role | Required gates |
| --- | --- | --- | --- |
| In-app | Durable permitted notification history and inbox read/dismiss state; the M1 delivery slice. | Realtime event to open clients. | Atomic source intent, deduplicated inbox, current scoped access; separate domain acknowledgment. |
| Push | Not the source of truth. | Device wake-up and headline only. | C20-D04; redacted content; token hygiene; platform quotas. |
| Email | External copy under a permitted purpose; not authoritative application state. | Mailbox notification, not proof of a human opening it. | C20-D05; sender authentication, endpoint/consent rules and separately reviewed verification exception; suppression. |
| SMS | Bounded text under an explicitly approved purpose, not a default channel. | Attention. | C20-D12; country/carrier rules, recipient consent, limits and redaction; narrow verification policy separately reviewed. |
| WhatsApp | Approved business provider only. | Attention via approved templates. | C20-D12; destination verified/linked; template approval; no unofficial automation. |
| Voice | Highest-impact channel. | Escalation attention. | C20-D12; consent, call window, attempt caps, automated-call disclosure, opt-out. |

Push, email, SMS, WhatsApp and voice exclude sensitive source detail by default (C20-R10). In-app details still require current source/recipient authority; even a notification title can disclose private information. Verification/recovery tokens are a separate short-lived purpose-bound credential delivery with strict safeguards, not ordinary reminder content or a generic exception for all security messages.

### Records, State and Provider Boundaries

The twenty-one table names and eight index expressions from section 20.26 are preserved. Reuse existing identity/consent/scheduler/audit authorities; a table list does not require another timer, credential database or separate service per component.

| ID | Source table |
| --- | --- |
| C20-J01 | notifications |
| C20-J02 | notification_templates |
| C20-J03 | notification_preferences |
| C20-J04 | notification_delivery_attempts |
| C20-J05 | notification_endpoints |
| C20-J06 | notification_digests |
| C20-J07 | notification_suppression_rules |
| C20-J08 | communication_consents |
| C20-J09 | external_channels |
| C20-J10 | external_channel_verifications |
| C20-J11 | schedules |
| C20-J12 | schedule_occurrences |
| C20-J13 | schedule_exceptions |
| C20-J14 | escalation_policies |
| C20-J15 | escalation_steps |
| C20-J16 | escalation_executions |
| C20-J17 | escalation_acknowledgements |
| C20-J18 | provider_accounts |
| C20-J19 | provider_credentials |
| C20-J20 | provider_webhook_events |
| C20-J21 | provider_rate_limits |

| ID | Source index expression |
| --- | --- |
| C20-I01 | notifications(account_id, created_at) |
| C20-I02 | notifications(account_id, read_at) |
| C20-I03 | notifications(status, scheduled_for) |
| C20-I04 | notification_delivery_attempts(notification_id) |
| C20-I05 | schedule_occurrences(status, scheduled_for) |
| C20-I06 | escalation_executions(status, next_action_at) |
| C20-I07 | communication_consents(account_id, channel, status) |
| C20-I08 | notification_endpoints(account_id, platform, revoked_at) |

Indexes are not uniqueness or authorization constraints. Same-source/recipient/destination-generation relationships need typed foreign keys and deliberate NULL handling. Keep immutable command/source occurrence identity, recipient inbox item, logical channel effect, numbered attempt, provider observations, domain acknowledgment and cancellation intent distinct. One notification may be accepted on one device, suppressed on another channel and still unacknowledged; one mutable status cannot truthfully represent all of those facts.

| Record family | Source references | Responsibility |
| --- | --- | --- |
| Recipient history, content and digests | C20-J01, C20-J02, C20-J06 | Canonical permitted inbox and immutable template/render provenance; digest membership does not create another domain acknowledgment or resend every item. |
| Current communication policy | C20-J03, C20-J07, C20-J08 | Explicit category/purpose/source/sensitivity, current preferences/consent/suppression and versioned withdrawal. |
| Destinations and verification | C20-J05, C20-J09, C20-J10 | Account/device/channel/environment binding, proof/challenge state and protected versioned destination values. |
| Timing | C20-J11, C20-J12, C20-J13 | Chapter 13's stable approved schedule/occurrence/exception authority; not an independent notification-specific recurrence engine. |
| Escalation | C20-J14, C20-J15, C20-J16, C20-J17 | One bounded policy/step execution and a reference to the actual domain acknowledgment, not an unrelated parallel task-completion state. |
| Provider effects and receipts | C20-J04, C20-J18, C20-J19, C20-J20, C20-J21 | Stable logical effects, attempts, credential references, authenticated inbox observations and aggregate quotas/cost. |

Add or reuse durable command/job/outbox, logical effect, budget reservation and replay/tombstone receipts where the source tables lack them. Commit business change plus durable notification intent in one transaction where both share the owner; otherwise use a durable idempotent integration command and reconciliation. Do not assume every notification inbox insert can share every domain transaction or that a published outbox marker proves downstream completion.

The section 20.22 adapter methods are `send`, `get_status`, `cancel`. Source request fields are `notification_id`, `recipient`, `channel`, `template_key`, `rendered_content`, `idempotency_key`, `metadata`. Source result fields are `accepted`, `provider_message_id`, `status`, `retryable`, `provider_error_code`. This interface is a starting inventory, not evidence that every provider implements all operations or supports the same guarantees.

Before enabling an adapter, record verified provider/account/environment capabilities: supported channels/purposes/regions, consent/template rules, idempotency scope/lifetime/payload constraints, status queries without a returned message ID, callback signatures/retry semantics, cancellation meaning, error classification, content/encoding limits, quotas/cost and data retention. Unsupported status/cancel and unknown outcome need typed results; a boolean cancel return must not falsely mean an accepted message was recalled. Only approved adapters receive narrowly scoped credentials; neither clients nor Agents choose arbitrary URLs, provider accounts or authentication headers.

### Delivery Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C20-K01 | Durable domain intent outlives clients and models. | Structured source command, inbox/effect/job identity and required audit/outbox, not a transient queue or sleeping LLM. |
| C20-K02 | Current source and recipient authority controls disclosure. | Actor/delegation/parent/history/audience/restriction and intended recipient at admission, dispatch, inbox read/replay, tools and exports. |
| C20-K03 | Consent, destination proof and preference are distinct. | Purpose/category/channel/resource/time/sensitivity and actual binding version; any first-contact verification exception is narrow and independently reviewed. |
| C20-K04 | Endpoint generations prevent stale redirection. | Account/device/provider/environment/current endpoint binding and conditional invalidation; no fallback to another unreviewed contact. |
| C20-K05 | Time policy preserves intent and expiry. | Recipient named timezone, current clock after waits, bounded late/quiet-hour/digest policy and explicit priority exceptions. |
| C20-K06 | Content stays within approved meaning and audience. | Versioned typed template/locale/render projection, exact approval and redaction before any provider or telemetry sees data. |
| C20-K07 | Logical effects survive worker attempts and retries. | Stable source occurrence/recipient/channel identity and immutable payload/destination, database constraints and durable consumer receipts. |
| C20-K08 | Dispatch has a defined cancellation/withdrawal boundary. | Current policy serialized against committed attempt/audit/budget intent; in-flight effects reconcile without a recall promise. |
| C20-K09 | Uncertain outcomes cannot trigger unsafe repeats. | Verified provider idempotency/status rules, bounded retry and explicit authorized fallback; no new key/channel merely because a request timed out. |
| C20-K10 | Provider callbacks are evidence with limited authority. | Exact signature/account/attempt/generation binding, durable dedup inbox and out-of-order fact reducer; opt-out can restrict, not grant rights. |
| C20-K11 | Inbox activity is not a domain response. | Read/dismiss/read-all, delivery/call answer and authenticated per-recipient/occurrence acknowledgment remain separate. |
| C20-K12 | Escalation is bounded and stops on current facts. | Explicit timing origin/recipient/step identity, approvals and stop conditions with shared commit interlock and aggregate limits. |
| C20-K13 | Agent and care workflows cannot create extra powers. | Confirmed source instructions, subject/representative grants, controlled tools and exact approvals; no criticality, clinical or emergency shortcut. |
| C20-K14 | Kill switches and budgets bind all execution paths. | Global/provider/channel/account/resource/category/Agent gates and shared atomic reservations, including fallback/manual replay. |
| C20-K15 | Clients show permitted, versioned and honest state. | Canonical typed APIs/cursors, current source access, account-isolated caches/replay and explicit pending/unknown/suppressed states. |
| C20-K16 | Operating and retention claims need actual evidence. | Private audit/metrics, durable reconciliation, protected cleanup and isolated restore with current revocations and post-snapshot effects. |

## 6. Delivery Workflow Contracts

### C20-W01 In-App Notification (M1 slice)

Source: [20.13](Chapter20.md#L862), [20.4](Chapter20.md#L231). This is the synthetic ordinary in-app M1 slice, not proof of push/email or the full MVP.

1. A business change (reminder due, approval needed, invitation result) commits its record plus a durable notification command in one PostgreSQL transaction (C6-D11).
2. Resolve the explicitly approved recipient set or governed selector, then check current eligibility. Exclude revoked/departed recipients; do not silently add new members to a previously approved static audience.
3. Consent and preference checks still apply to in-app delivery (category opt-out, quiet-hour deferral where the category permits), but no external channel is contacted.
4. One in-app record per recipient per logical notification is created with a stable ID; repeated commands reconcile to the existing record instead of duplicating it.
5. Realtime delivery is an update, not the record: a missed WebSocket event is recovered by history/sync, never by re-sending the notification.
6. Persist recipient-scoped read/dismiss state separately from a task/reminder/approval response. Domain acknowledgment is an authenticated idempotent action on the exact recipient/occurrence with its own receipt; opening, dismissing or marking the inbox read does not complete the task or stop an acknowledgment escalation automatically.
7. Cancellation before dispatch suppresses the pending command; after the record exists, cancellation marks it and any in-flight channel attempt follows the uncertainty rules in C20-W04.

### C20-W02 Push and Email (Release Gated)

Source: [20.14](Chapter20.md#L917), [20.15](Chapter20.md#L983).

1. Activation requires approved C20-D04/C20-D05 gates: provider credentials in secret management, device/destination registration flows, redaction templates and quota/cost wiring (C20-R24).
2. Bind push endpoints to current account/device/provider/environment and token generation. Redact before provider/SDK auto-display, including titles, E2E previews and deep-link metadata. Token rotation, logout/reassignment and late invalid-token callbacks must not disable or leak to a newer binding; supported multi-device fanout is not multiple human acknowledgments.
3. Routine email uses verified destination versions and permitted purposes. Initial verification/recovery requires a separately reviewed user-initiated, bounded, minimal challenge flow to the claimed destination; no unrelated private data or arbitrary Agent recipient is allowed. Keep sender-domain SPF/DKIM/DMARC, token expiry/single-use/intent binding, anti-enumeration and bounce/complaint safeguards. Mail scanners/prefetch must not confirm sensitive actions simply by following a GET link.
4. Provider acceptance, delivered-to-mailbox/device evidence, opened/clicked measurements and application read/acknowledgment are separate. Email proxy loads/link scanners are not reliable human-read evidence; privacy-invasive tracking requires its own decision, not default instrumentation.

### C20-W03 External Channels: SMS, WhatsApp, Voice (gated)

Source: [20.16](Chapter20.md#L1048), [20.17](Chapter20.md#L1096), [20.18](Chapter20.md#L1180).

1. No channel activates without its gate decision (C20-D12), an approved provider contract and kill-switch capability (C20-R18).
2. WhatsApp destinations must be verified and linked with purpose-scoped consent; only provider-approved templates are used; provider message IDs are retained for reconciliation.
3. Voice calls require purpose, window, attempt caps, caller disclosure ("This is an automated assistant calling on behalf of...") and recipient controls (end, opt out, request human, report).
4. The system never messages a person merely because they appear in a contact book (source rule) and never treats contact-book import as platform consent.

### C20-W04 Uncertainty, Retry and Reconciliation

Source: [20.23](Chapter20.md#L1567), [20.24](Chapter20.md#L1635), [20.32](Chapter20.md#L2131).

1. Separate one logical recipient/channel effect from numbered durable transport attempts. Bind the reviewed destination/version, payload/template and stable business identity; a new worker attempt is not a new notification.
2. Recheck current resource/recipient authority, purpose-specific consent, destination binding, expiry, quiet hours, approval and kill switches before a documented durable dispatch commitment. Cancellation or revocation committed before that boundary prevents a new send. After commitment, an effect may be in flight and cannot be presumed recalled.
3. Classify failures using the selected provider's actual behavior and send phase. A timeout, lost response, interrupted worker or some provider 5xx responses may leave acceptance unknown; a definitive pre-send or provider rejection can be a known failure. A generic `retryable` flag does not establish whether the first effect happened.
4. Reconcile unknown outcomes through supported status/callback or documented idempotent replay semantics before any retry or fallback. If the provider cannot establish the outcome safely, retain unknown/manual-review state instead of sending with a fresh key or destination. Provider idempotency lifetime, payload matching and account scope must be verified; local leases and uniqueness cannot provide universal exactly-once external delivery.
5. Retry only eligible known failures or safely reconciled effects within approved attempt/time/cost limits, respecting provider-specific backoff and any valid retry delay. Permanent denials such as revoked consent, invalid destination or expiry remain stopped; a dead-letter queue is not permission to replay them. A kill switch also gates retries and fallback.
6. Preserve cancellation intent and append later provider evidence without restarting the command or escalation. Provider acceptance, provider-reported delivery, local read and domain acknowledgment remain distinct; late delivery can be true even after cancellation was requested.

### C20-W05 Escalation State Machine

Source: [20.19](Chapter20.md#L1261). Policy-driven, never improvised by an agent (source rule).

1. An escalation policy defines trigger, initial delay, ordered steps, recipients/channels/templates, maximum attempts and stop conditions. Its delay basis must be explicit; do not add an initial delay twice or infer a new timer from each retry.
2. Stop conditions include the authorized domain acknowledgment/completion, cancellation, consent revocation, loss of recipient/resource authority, maximum attempts, expiry or the trigger becoming false. Reading the inbox alone does not prove the underlying task was completed.
3. Use minimal content such as "A configured reminder needs attention"; opening details still requires current access to the actual source.
4. Resolve permitted caregivers/admins/trusted contacts under current scoped grants before each step. Every step goes through the same notification policy and dispatch commitment as other sends; account or role labels cannot bypass consent, quiet hours or provider gates.
5. Serialize acknowledgment/stop transitions against the next step's commitment, preserve stable step/effect IDs and audit the trigger/stop evidence. Reconcile any already committed step honestly; a delayed callback must not revive a resolved escalation.

### C20-W06 Medicine Reminder Communication

Source: [20.20](Chapter20.md#L1366). Coordination and reminders only, never autonomous medical behavior.

- Allowed: store confirmed reminder text and schedule, notify the recipient and explicitly authorized caregivers, record acknowledgment, escalate missed acknowledgment per consent, link user-provided instructions.
- Prohibited: inferring dosage from images, changing or recommending dosage, stopping medication, doubling missed doses, diagnosing, treating unverified OCR or schedules as medically confirmed, or disclosing sensitive details to an unauthorized third party. Automatic emergency contact is unavailable without a separately designed and authorized process.
- External content is redacted by default; dose details appear only to recipients with explicit care-data consent (links to C13-D10, C11-D06).
- Snooze changes a notification, not a prescribed dose; the domain record distinguishes attributed taken/snoozed/skipped/missed/help states with actor and time under Chapter 13. Lack of a recorded response is not proof of missed medication, and a family-admin role is not a care-data grant.

Care instructions retain their exact entered/confirmed source, actor and version. When instructions are unclear, ask the user to confirm with a clinician or pharmacist; any actual contact requires its own approved recipient, consent and communication workflow. Missing confirmation, ambiguous OCR, age/guardian or legal basis cannot be fixed by an Agent choosing a template. In-app access is not automatic permission to disclose health details externally. The existing MVP Agent restrictions remain in force; listing a medicine workflow here does not enable health-record access or a real clinical service.

### C20-W07 Admit and Render One Reviewed Logical Command

Authenticate the actual domain actor or scoped Agent delegation and derive/validate the source resource, recipient interpretation, category, sensitivity, priority, channels and allowed action. Explicitly distinguish draft/preview from dispatch authorization. Client or model fields such as `requires_consent: false`, a critical label or arbitrary destination never waive policy. A viewed attachment, private conversation or existing contact grants no general right to notify outsiders.

Preserve the logical source event/occurrence ID independently from command retries, provider attempts and Agent node/replan IDs. Deduplicate at the business-effect boundary; the same occurrence must not become a new notification because a schedule revision, new worker or alternate route assigned a fresh request ID. Material changes in audience, destination, channel, content or timing create reviewed revisions, not mutable data under an uncertain accepted request. Current authorization still gates old idempotency receipt disclosure.

Render only a reviewed template version with bounded typed variables, approved locale, channel-specific escaping/sanitization and a safe fallback language. Preserve the exact meaning of confirmed instructions and any required qualifiers/units; never quietly truncate them to fit a provider. Subject lines, lock-screen titles, filenames, links and metadata are disclosure too. Missing/rejected provider template or translation requires an approved safe alternative or suppression/review, not unrestricted model prose. Preserve necessary historical template/render provenance under restricted retention rather than log full content.

Domain identifiers in variables are not authority to fetch every field of the source. Build the recipient-specific minimal projection after current source access checks. E2E messages cannot become server-readable just to produce a notification preview; use a generic permitted hint. A digest must revalidate every item/audience at construction and dispatch, retain stable item/window identity and not resend items individually because the digest failed. Grouping/redaction must not expose hidden member counts or private subjects.

Persist accepted intent and required work/audit transactionally through the owning abstraction. Return saved/draft/queued state and canonical identity, not a delivery promise. A lost queue publication is recovered from a durable ledger/reconciler. This path works without a live model, original browser or sender login token; execution still requires a current valid durable grant and source authority.

### C20-W08 Bind Destinations, Consent and Preferences Precisely

Resolve permitted recipient accounts or explicitly approved trusted contacts using current membership/assignment/history/relationship and source visibility. Distinguish a reviewed static recipient set from a dynamic selector with an approved rule for later members. Validate non-user contacts under an explicit contact/consent model; importing an address book or knowing a phone number cannot create permission. No public/global contact matching or differing lookup errors may reveal unrelated accounts or destinations.

Version endpoint ownership and verification for account/device/channel/provider/environment. A newly linked number/email or rotated push token is not interchangeable with the old approved destination. Apply Chapter 18 intended-recipient and recovery safeguards; possession of a mailbox/number does not prove legal guardianship, an intended family identity or every purpose-specific consent. Reauthentication, challenge attempt/resend/expiry limits, anti-replay and anti-abuse checks govern linking/verification. A proof succeeds only through the owning identity/channel verifier, not a delivery callback or Agent assertion.

Use maintained reviewed canonical parsers/normalizers and retain the verified binding rather than merging email aliases or recycled/shared household numbers as one person. Deduplicate the logical intended recipient/effect without collapsing distinct authorized people who happen to share a destination. Verification/recovery tokens belong to their narrow secret-delivery path, not ordinary persistent inbox variables, Agent context, logs or unrestricted dashboards.

External reminder/marketing/care grants are explicit purpose/category/source/channel/sensitivity/time permissions tied to the actual recipient and current destination binding. OS push permission, account login, a preference toggle and consent are different controls. Protect destinations and provider tokens with narrow encryption/custody; plain phone/email hashes are enumerable, so any matching/index token needs a reviewed keyed scoped design and remains personal data. Grant proof and audit references are minimized and never ordinary log/metric labels.

Resolve the source's 'required or strongly recommended' wording and 'security alerts: always enabled' example against final decision C20-R09 through an approved exception registry, not a broad bypass. User-initiated verification/recovery must reach a claimed destination before it is proven, but permits only a bounded purpose-bound challenge without unrelated private source data. Required safety/legal messages need their own qualified purpose/recipient policy; optional marketing opt-out cannot be evaded by relabeling the category. Do not enable an unresolved exception automatically.

Use explicit precedence for global/category/resource/conversation preferences and notification overrides. A stricter consent, legal/source restriction, revoked destination or kill switch cannot be overridden by a sender's priority. Grant/revoke and preference writes are actor-scoped, versioned and idempotent; a stale tab or resumed worker cannot re-enable an old grant. Withdrawal commits current exclusion before queue cleanup and stops future retries/fallback. Regrant is a new reviewed version and does not flush all suppressed/expired old work automatically.

Handle standards-compliant optional-category unsubscribe through the selected provider's reviewed protocol, including anti-forgery and correct endpoint/purpose scope. It is separate from ordinary GET actions: link scanning must never opt someone in, approve an Agent action or acknowledge a reminder. A suppression mechanism cannot disable unrelated account security or another recipient's grants.

### C20-W09 Resolve Due Time, Quiet Hours and Frequency Policy

Reuse Chapter 13's occurrence identity, calendar semantics and explicit local/UTC/zone provenance. Keep intended due time, earliest permitted dispatch, expiry, attempt time and acknowledgment/escalation deadline distinct. Evaluate current time after locks/queue waits; PostgreSQL transaction-start `now()` cannot justify a send whose window has already expired. Pause/resume/postponement maps existing logical work instead of creating a duplicate occurrence.

Evaluate cross-midnight/day-of-week quiet hours in each recipient's configured IANA zone using the reviewed temporal library. Define gaps/folds, equal start/end, travel/profile-zone changes and priority exceptions explicitly. Recheck at deferred wake-up after consent, timezone, source or template changes. When the next allowed time is beyond expiry, suppress/expire or request the agreed human review rather than deliver stale content. Do not silently move a medical treatment time or change clinical instructions to fit quiet hours.

Choose permitted immediate/in-app-only/silent/deferred/suppressed behavior by category and actual channel capability. Silent push still discloses to a provider and is not a consent bypass; requesting silent mode does not prove the OS/provider stayed silent on every device. If required behavior is unsupported, use only an approved safe alternative or suppress it, not a hidden downgrade. A high/critical label or 'escalation' name cannot create another channel, recipient or emergency exception. Escalation delay is anchored to the declared source fact, not to every retry; late delivery and no delivery are different from a person ignoring a reminder.

Coordinate notification-specific limits with per-recipient/resource/Agent/provider and aggregate budgets, including digest frequency, repeated occurrence windows and voice cooldowns. Bound catch-up after outage; do not send every old reminder or restart exhausted escalation just because a worker returns. Numeric waits/backoff examples in the source are unapproved configuration, not guaranteed delivery timing.

### C20-W10 Commit, Dispatch and Cancel a Fenced Attempt

Claim eligible durable work with a bounded owner/fencing lease and preserve stable logical effect/attempt identity. Lease expiry alone cannot justify a second worker sending an attempt that may already have crossed its external boundary. Recheck current actor/source/recipient/destination/consent, approval/template revision, quiet hours, expiry, suppression, kill switches and provider capability immediately before the defined durable dispatch commitment. Required unknown policy fails closed for the affected effect, without disabling unrelated in-app reads.

Commit the attempt's immutable request identity, protected exact destination/payload reference, provider account/environment, required audit and quota/cost reservation before calling the network adapter. Do not hold database locks across remote I/O. Domain withdrawal/cancellation and commitment share a reviewed serialization/version protocol: cancellation that wins prevents the send; if commitment wins, it is potentially in flight even before the worker receives provider acceptance. A further current check just before I/O can narrow exposure but cannot eliminate every race across a remote network boundary.

Provider success is a fact about acceptance and any actually supported delivery evidence. Store correlation/message IDs and timestamps only for the intended effect/account. If the network call or result commit fails, preserve unknown state and reservation for reconciliation; do not release the budget and launch another unbounded attempt. Same-account idempotent replay may be safe only under verified scope/lifetime/payload semantics. Status queries can be eventually consistent; a temporary 'not found' is not automatically proof no effect occurred.

Cancel queued work locally and attempt provider cancellation only when supported and still useful. Distinguish cancellation requested, confirmed provider cancellation, too late, unsupported and unknown. A later authenticated delivered/answered observation can coexist with cancelled future work, without resuming it. Changing provider, phone, content or channel is a new authorized effect/fallback branch, not an automatic transport retry of an uncertain request. Reconcile potentially accepted attempts before switching.

Provider circuits, rate delays and unsupported operations produce typed safe outcomes. The source `retryable` flag and `cancel -> bool` sketches need enrichment for rejection versus unknown, cancel capability and observation provenance. FCM/APNs/provider collapse or replacement features may merge alert hints only under approved semantics; they must not collapse distinct domain occurrences or replace durable in-app history. Failed external delivery leaves current authorized inbox and source business state intact.

### C20-W11 Verify Callbacks and Reduce Out-of-Order Evidence

Authenticate the actual configured provider/account/environment and verify its documented exact-byte or canonical signature, timestamp/freshness/replay scheme and key rotation. Enforce size/content-type/schema/rate bounds and safe comparison through maintained libraries. Never fetch an arbitrary callback-supplied key, URL or message body with ambient credentials. IP allowlisting alone is not callback authentication, and not all providers expose the same signature/timestamp/event-ID fields; absent capabilities need a reviewed adapter-specific contract.

Persist an authenticated bounded inbox record plus durable processing intent before acknowledging accepted callback work. Deduplicate by provider/account/event identity and protected payload digest; same ID/different payload is an anomaly, not a second delivery. If a provider has no reliable event ID, define a verified bounded alternative or restrict support. Invalid signatures/schema are rejected; an inbox/database failure does not receive a false successful acknowledgment. Raw payload retention is protected and minimized, not plaintext messages/destinations in ordinary logs.

Bind observations to the intended message/attempt/destination generation. A callback can arrive before the worker records the send response; hold/reconcile it safely rather than drop it or attach it to another account. Maintain an append-only fact history and tested provider-specific reducer: late accepted does not regress delivered, complaints/bounces/opt-outs can add restrictions after a reported delivery, and provider timestamps do not replace server observation or authority. Unknown provider IDs cannot create notification rows or consent.

Validate invalid-token/destination updates against the actual binding generation that failed; a delayed callback for a revoked token must not disable the user's newer endpoint. Authenticated opt-out/complaint evidence can suppress the appropriate future channel/purpose, but never grant consent, confirm an identity challenge or mark a domain task complete. Email opens/clicks and answered/voicemail/completed calls are not proof of the intended human reading, taking medicine or approving an action. Shared mailboxes and voicemail require minimal content even when a number was previously verified.

Suppress webhook event disclosure to ordinary resource members. Use minimal permitted application updates under the canonical event contract; operator receipt investigation is case/resource/purpose-scoped and audited. Malicious or duplicated callback traffic cannot create an escalation loop, release a budget without evidence or bypass a kill switch. Source webhook names are internal/provider observations, not automatically user-facing events.

### C20-W12 Operate Kill Switches, Safe Replay and Reconciled Recovery

Implement effective global/channel/provider/account/resource/category/Agent kill gates at admission where applicable and again at retry/fallback/dispatch commitment. Source targets include all WhatsApp, voice or SMS, one provider/resource/Agent/category; R18 also requires global external disablement. Scope, privileged authority, configuration version and audit are explicit. A circuit breaker protects provider health; a policy kill switch denies an action even when the provider is healthy. Reopening does not resurrect cancelled/opted-out/expired work or flush an unbounded backlog.

Reserve and reconcile quotas/cost at shared authoritative boundaries across workers, deployments and fallback providers. Bound attempts, time windows, call duration, template/message parts, fanout and overall daily/incident budgets. SMS Unicode/segment encoding and voice duration can change cost; estimates and billed outcomes are different facts. Local counters per process or resetting reservations after timeout cannot enforce a global cap. Mandatory audit failure blocks the dependent sensitive action; an unavailable optional metric sink is not equivalent to losing required durable evidence.

DLQ records hold safe error codes, source/effect/attempt/version references and minimal diagnostics, not raw credentials or sensitive content. Operator replay requires current case/action authority, original evidence, policy/budget checks and reconciliation of uncertainty. A revoked/expired denial stays stopped; corrected configuration or reconsent is not permission to mutate an old accepted destination/content under the same key. Preserve original failures rather than label them passed after a blind retry.

Observe command/inbox creation, eligible queue lag, provider acceptance/delivery latency, suppressions/expiry/unknowns, retries, invalidations, opt-outs, acknowledgment and escalation stop races with meaningful denominators. Quiet-hour waiting is separate from scheduler/worker delay; provider acceptance is not human reach. Keep contact values, tokens, payloads, health/financial details and low-entropy destination hashes out of ordinary traces/metric labels. Operators see redacted purpose-scoped evidence; investigation is not unrestricted inbox browsing.

Retain command/effect/receipt/dedup and audit evidence for the reviewed retry/provider/restore window while minimizing plaintext content and honoring lawful holds/erasure. Source deletion or access withdrawal excludes new inbox detail/provider disclosure before physical cleanup of digests/caches/export references. Restoring backups requires current consent, endpoint ownership, source revocations, kill switches and post-snapshot external effects before traffic or dispatch. Run isolated restore without live provider credentials, and keep unknown authority/outcomes blocked. No restore, provider test, message or call has been executed here.

## 7. Agent Integration Boundaries

Source: [20.30](Chapter20.md#L1989). Agents issue structured requests through Chapter 12's allowlisted tools and the same authorized service as manual creation. Draft/preview may exist without dispatch authority; executing a permitted external effect requires the exact policy-approved human action and current recipient/channel/template/version checks. This does not enable external communication or health-record access prohibited in the MVP Agent scope. No provider credentials, arbitrary contact lookup or self-assigned critical priority reaches the model.

All nine tool names are retained. `notification.acknowledge` cannot impersonate a human recipient: it requires an authenticated authorized human/domain action or an explicit reviewed representative workflow, and still records the true actor. `communication_consent.check` is a scoped read, not grant modification or a global phone-number oracle.

| ID | Source Agent tool |
| --- | --- |
| C20-U01 | notification.create |
| C20-U02 | notification.preview |
| C20-U03 | notification.cancel |
| C20-U04 | notification.schedule |
| C20-U05 | notification.acknowledge |
| C20-U06 | escalation.create |
| C20-U07 | escalation.pause |
| C20-U08 | escalation.cancel |
| C20-U09 | communication_consent.check |

The ten ordered source tool rules remain verbatim; they are policy requirements, not executed model evaluations.

| ID | Source rule |
| --- | --- |
| C20-Y01 | Validate resource access. |
| C20-Y02 | Validate recipient. |
| C20-Y03 | Validate channel. |
| C20-Y04 | Check consent. |
| C20-Y05 | Check category policy. |
| C20-Y06 | Check quiet hours. |
| C20-Y07 | Check rate limits. |
| C20-Y08 | Check whether approval is required. |
| C20-Y09 | Render an approved template. |
| C20-Y10 | Create an auditable notification command. |

Source reminders/context never become control instructions. Stable effect receipts survive Agent replay/cancellation, and successful scheduling ends the relevant reasoning run rather than keeping an LLM timer alive. Revoked delegation blocks new disallowed effects at the defined gate, while late accepted provider outcomes reconcile honestly. No model can change consent, invent a destination, infer a clinical emergency, loop voice calls after opt-out or broadcast private source data to an entire group.

## 8. Security and Privacy Boundaries

Source: [20.29](Chapter20.md#L1885). The following fourteen threat labels and nineteen control labels are preserved verbatim. They identify requirements and possible risks, not observed vulnerabilities or validated provider capabilities.

| ID | Source threat |
| --- | --- |
| C20-X01 | Notification spam |
| C20-X02 | External-channel abuse |
| C20-X03 | Consent bypass |
| C20-X04 | Provider credential theft |
| C20-X05 | Phone-number enumeration |
| C20-X06 | Sensitive push previews |
| C20-X07 | Fake escalation |
| C20-X08 | Agent-triggered harassment |
| C20-X09 | Repeated voice calls |
| C20-X10 | Malicious webhook injection |
| C20-X11 | Template injection |
| C20-X12 | Provider account takeover |
| C20-X13 | Unauthorized recipient resolution |
| C20-X14 | Cross-group notification leakage |

| ID | Source required control |
| --- | --- |
| C20-Q01 | Explicit consent |
| C20-Q02 | Channel verification |
| C20-Q03 | Per-user rate limits |
| C20-Q04 | Per-resource rate limits |
| C20-Q05 | Per-agent rate limits |
| C20-Q06 | Provider quotas |
| C20-Q07 | Template allowlists |
| C20-Q08 | Destination validation |
| C20-Q09 | Webhook signature verification |
| C20-Q10 | Encrypted provider credentials |
| C20-Q11 | Audit logs |
| C20-Q12 | Quiet hours |
| C20-Q13 | Opt-out support |
| C20-Q14 | Abuse detection |
| C20-Q15 | External-channel kill switch |
| C20-Q16 | Sensitive-content redaction |
| C20-Q17 | Re-authentication for channel linking |
| C20-Q18 | Idempotency |
| C20-Q19 | Retry limits |

Apply least privilege to provider keys, signing/verification secrets, queues, operators and exports. Store credential references in ordinary records where possible, with actual encrypted restricted custody outside client/model access; source `provider_credentials` is not permission to place plaintext secrets in business tables. Rotate/revoke compromised accounts through reviewed incident procedures without silently switching to an unapproved personal account or bypassing domain/network policy.

First-contact verification is the narrow unresolved identity-policy case described in C20-W02 and C20-W08, not an exception for ordinary reminders. Channel possession, recipient identity, consent, data-subject authority and legal basis remain separate. Care/child/relationship/financial notifications require current subject/representative grants and reviewed jurisdiction/retention; labels such as family admin, urgent or trusted contact do not create those rights. E2E payloads stay opaque to ordinary notification rendering; redaction cannot be used as a pretext to decrypt whole conversations.

Notify, inbox-read, deep-link, history, operator inspection, status/export and replay paths enforce current source/recipient access. A generic safe suppression reason should not reveal another user's number, consent history, hidden group or care record. Required audit preserves minimal actor/action/version/reason/effect evidence without secret payloads. Local/offline/external mailbox copies and already delivered bytes have real recall/deletion limits; no compliance, emergency-response or absolute privacy guarantee follows from this draft.

## 9. API and Event Inventory

The [Chapter 7 contract](CHAPTER_07_API_REALTIME_CONTRACT.md) owns canonical route/envelope/version/idempotency conventions. The twenty-one section 20.25 source operations below are retained with whitespace normalized to one separator. Their omitted `/v1` prefix must be reconciled with that owning contract; this inventory is not a second unversioned API deployment.

| ID | Source operation |
| --- | --- |
| C20-B01 | `GET /notifications` |
| C20-B02 | `POST /notifications/{id}/read` |
| C20-B03 | `POST /notifications/read-all` |
| C20-B04 | `POST /notifications/{id}/dismiss` |
| C20-B05 | `GET /notifications/unread-count` |
| C20-B06 | `GET /me/notification-preferences` |
| C20-B07 | `PATCH /me/notification-preferences` |
| C20-B08 | `GET /me/communication-consents` |
| C20-B09 | `POST /me/communication-consents` |
| C20-B10 | `DELETE /me/communication-consents/{id}` |
| C20-B11 | `GET /me/external-channels` |
| C20-B12 | `POST /me/external-channels/link` |
| C20-B13 | `POST /me/external-channels/verify` |
| C20-B14 | `DELETE /me/external-channels/{id}` |
| C20-B15 | `PATCH /me/external-channels/{id}/preferences` |
| C20-B16 | `GET /resources/{id}/escalation-policies` |
| C20-B17 | `POST /resources/{id}/escalation-policies` |
| C20-B18 | `PATCH /escalation-policies/{id}` |
| C20-B19 | `POST /escalation-policies/{id}/pause` |
| C20-B20 | `POST /escalation-policies/{id}/resume` |
| C20-B21 | `POST /escalation-policies/{id}/test` |

### Existing Proposed Additions

The following eleven P-series proposals were already in this delivery draft. Keep them distinct from the source B-series inventory. Some overlap source routes and some fill gaps; they require consolidation rather than parallel endpoints for the same consent or acknowledgment. None is a generated schema or implemented API.

| ID | Operation | Boundary notes |
| --- | --- | --- |
| C20-P01 | `POST /v1/notifications` | Proposed scoped command creation, not unrestricted mass messaging; idempotency-keyed durable intent, not a delivery promise. |
| C20-P02 | `GET /v1/notifications` | Scoped inbox query with cursor pagination; excludes other recipients' records. |
| C20-P03 | `GET /v1/notifications/{id}` | Recipient-or-authorized-viewer access; minimal projection. |
| C20-P04 | `POST /v1/notifications/{id}/read` | Actor-derived reader; per-recipient read state. |
| C20-P05 | `POST /v1/notifications/{id}/acknowledge` | Proposed entry to the source domain's exact recipient/occurrence action; it must not create a second acknowledgment authority. |
| C20-P06 | `POST /v1/notifications/{id}/cancel` | Authorized suppress before dispatch; honest state afterward. |
| C20-P07 | `GET /v1/notifications/{id}/deliveries` | Attempt/receipt history for authorized viewers. |
| C20-P08 | `PATCH /v1/me/notification-preferences` | Category/channel/quiet-hour preferences with consent linkage. |
| C20-P09 | `POST /v1/consents/external-channel` | Purpose/channel/resource-scoped grant with verified destination. |
| C20-P10 | `DELETE /v1/consents/external-channel/{id}` | Proposed duplicate of source consent revocation to reconcile; new commitment denied, already committed effects reconciled. |
| C20-P11 | `POST /v1/webhooks/{provider}` | Configured provider/account/environment callback entry, not arbitrary handler selection; authenticated inbox committed before acknowledgment. |

All four in-app client event names from section 20.13 and eight provider webhook event names from section 20.24.2 are preserved with their source family. Provider observations are not automatically public realtime events or proof of human action.

| ID | Source family | Source event |
| --- | --- | --- |
| C20-E01 | In-app client | notification.created |
| C20-E02 | In-app client | notification.updated |
| C20-E03 | In-app client | notification.read |
| C20-E04 | In-app client | notification.dismissed |
| C20-E05 | Provider webhook | delivery.accepted |
| C20-E06 | Provider webhook | delivery.delivered |
| C20-E07 | Provider webhook | delivery.failed |
| C20-E08 | Provider webhook | delivery.bounced |
| C20-E09 | Provider webhook | delivery.complained |
| C20-E10 | Provider webhook | call.answered |
| C20-E11 | Provider webhook | call.no_answer |
| C20-E12 | Provider webhook | call.completed |

The earlier proposed names `notification.command.created`, `notification.delivered.inapp`, `notification.acknowledged`, `notification.dispatch.status_changed`, `escalation.started`, `escalation.step_executed`, `escalation.resolved` remain unapproved additions to reconcile with Chapters 7 and 13. Do not emit a second 'delivered' notification merely because an inbox row exists, or treat a transport callback as a task acknowledgment. Event schemas, sequence scope, retention and safe per-recipient projection need one canonical contract.

### Behavior Mapping

All source APIs, retained API proposals and Agent tools map once below. 'None' identifies a missing source path, not permission to improvise one during implementation.

| Behavior | Source APIs | Proposed APIs | Source tools | Domain boundary |
| --- | --- | --- | --- | --- |
| Inbox/read/dismiss/count | C20-B01, C20-B02, C20-B03, C20-B04, C20-B05 | C20-P02, C20-P03, C20-P04 | None | C20-W01: current recipient/source access and durable bounded read state. |
| Command draft/preview | None in section 20.25 | C20-P01 | C20-U01, C20-U02 | C20-W07: exact scoped intent, reviewed render and separate send approval. |
| Preferences | C20-B06, C20-B07 | C20-P08 | None | C20-W08, C20-W09: current account, expected version and non-overridable consent/suppression. |
| Consent | C20-B08, C20-B09, C20-B10 | C20-P09, C20-P10 | C20-U09 | C20-W08: proof/scope/binding and withdrawal before new commitment. |
| Destination linking/verification | C20-B11, C20-B12, C20-B13, C20-B14, C20-B15 | None | None | C20-W02, C20-W08: narrow challenge, current account and endpoint generation. |
| Domain acknowledgment | None in section 20.25 | C20-P05 | C20-U05 | C20-W01, C20-W05: exact authorized source response, not inbox read. |
| Command cancellation | None in section 20.25 | C20-P06 | C20-U03 | C20-W04, C20-W10: stop gate plus reconciliation of in-flight effects. |
| Scheduling | Chapter 13 owns the source command | None in this proposal list | C20-U04 | C20-W09: approved occurrence/temporal identity and bounded deferral. |
| Escalation policy | C20-B16, C20-B17, C20-B18, C20-B19, C20-B20, C20-B21 | None | C20-U06, C20-U07, C20-U08 | C20-W05: policy versus active execution scope, current stop conditions and safe tests. |
| Attempts and callbacks | None in section 20.25 | C20-P07, C20-P11 | None | C20-W10, C20-W11: scoped evidence, no recipient enumeration or arbitrary status patch. |

Resource IDs in escalation routes need a validated actual resource type/parent, not a polymorphic-ID permission shortcut. Policy pause/resume and execution cancel are different transitions. The source test route uses an isolated sandbox or explicitly authorized test recipient/channel with normal consent, quotas and redaction; 'test' must not call a real caregiver or voice provider by default. This drafting task does not execute any test route.

Use current actor checks before writes and idempotency-receipt reads, exact version/precondition semantics for policy/preferences and bounded cursor queries. Protect cookie-based mutations with the Chapter 9 Origin/CSRF/session model. Read-all binds a deliberate authenticated inbox snapshot/boundary and updates only the allowed items through that point; concurrently arriving notifications remain unread. Retried read/dismiss is idempotent, and unread counters reconcile from authoritative eligible rows rather than applying duplicate decrements. Define any expiring/hidden/dismissed count policy explicitly.

API accepted/queued status means durable state, not provider delivery. Realtime/history recovery uses Chapter 7's authorized snapshot/replay barrier; apply local data and cursor coherently in account-isolated client state. Resource versions, attempt IDs and stream positions differ. Revoked source history and old callback payloads must not leak through cache, replay, deep-link metadata, exports or a newly authenticated account. In-app historical rendering also needs a reviewed template/variable projection rather than blindly rendering a newly changed template against old sensitive variables.

## 10. Client Contract

Android and web follow the existing [Android contract](CHAPTER_08_ANDROID_CONTRACT.md) and [web contract](CHAPTER_09_WEB_CONTRACT.md). OS push permission is distinct from consent, preferences and the in-app inbox. Background delivery limits, stale/offline state, endpoint revocation and permission denial must be visible without claiming an exact timer or human receipt.

All fourteen Android screen labels, eight literal web routes and nine administrator labels from sections 20.27/20.28 are retained. Routes must be reconciled with the Chapter 9 shell, not added as a second routing vocabulary.

| ID | Source Android surface |
| --- | --- |
| C20-C01 | Notification inbox |
| C20-C02 | Unread notification list |
| C20-C03 | Notification detail |
| C20-C04 | Notification preferences |
| C20-C05 | Quiet hours |
| C20-C06 | Per-group notification settings |
| C20-C07 | Per-conversation notification settings |
| C20-C08 | Push permission screen |
| C20-C09 | External channel setup |
| C20-C10 | WhatsApp consent screen |
| C20-C11 | Voice-call consent screen |
| C20-C12 | Trusted-contact settings |
| C20-C13 | Escalation policy screen |
| C20-C14 | Reminder acknowledgement screen |

| ID | Source web route |
| --- | --- |
| C20-H01 | `/notifications` |
| C20-H02 | `/settings/notifications` |
| C20-H03 | `/settings/communication` |
| C20-H04 | `/settings/quiet-hours` |
| C20-H05 | `/settings/external-channels` |
| C20-H06 | `/resources/{id}/notifications` |
| C20-H07 | `/resources/{id}/escalations` |
| C20-H08 | `/resources/{id}/reminders` |

| ID | Source administrator surface |
| --- | --- |
| C20-O01 | Delivery dashboard |
| C20-O02 | Failed notifications |
| C20-O03 | Retry queue |
| C20-O04 | Escalation timeline |
| C20-O05 | Provider status |
| C20-O06 | Consent audit |
| C20-O07 | Notification template management |
| C20-O08 | Rate-limit dashboard |
| C20-O09 | Suppression reasons |

The nine source UX labels are `Loading`, `Delivered`, `Read`, `Suppressed`, `Failed`, `Retry available`, `Consent required`, `Permission required`, `Expired`. Add canonical pending/queued/deferred/provider-accepted/unknown/cancel-requested states where needed; 'Delivered' must name the actually supported channel fact rather than imply every device or human received it.

| Flow | Source Android surfaces | Source web routes | Source admin surfaces | Required experience |
| --- | --- | --- | --- | --- |
| Inbox and detail | C20-C01, C20-C02, C20-C03 | C20-H01 | None | Current allowed content, read/dismiss versus domain response, stable counts and accessible pending/error state. |
| Preferences and scoped history | C20-C04, C20-C06, C20-C07 | C20-H02, C20-H06 | None | Category/resource/conversation scope, truthful suppression reason and conflict-safe edits. |
| Quiet hours | C20-C05 | C20-H04 | None | Named recipient zone, days/window and reviewed exceptions without hidden clinical rescheduling. |
| Channel consent and setup | C20-C08, C20-C09, C20-C10, C20-C11 | C20-H03, C20-H05 | None | Actual account/endpoint generation, verification versus grant, OS permission and explicit opt-out. |
| Trusted contacts | C20-C12 | Within authorized resource settings | None | Intended contact, purpose/data authority and separate disclosure/communication consent. |
| Escalation settings | C20-C13 | C20-H07 | None | Ordered recipient/channel/timing basis, limits, approvals and current stop/cancel state. |
| Reminder response | C20-C14 | C20-H08 | None | Exact source occurrence and actor, not a read-all side effect or unsupported medication claim. |
| Delivery operations | Not an ordinary inbox permission | Protected operator workspace | C20-O01, C20-O02, C20-O03, C20-O05, C20-O08, C20-O09 | Safe receipt/status/cost, unknown-outcome review and bounded authorized replay, never unrestricted payload access. |
| Consent and templates | Not an ordinary inbox permission | Protected operator workspace | C20-O06, C20-O07 | Case/purpose-scoped audit, versioned approved content and least-privilege change review. |
| Escalation investigation | Not an ordinary inbox permission | Protected operator workspace | C20-O04 | Attributed trigger/step/stop and in-flight evidence without private care-data leakage. |

Keep Android Room and web state bound to the actual account/environment/session generation. Late callbacks, push deep links and pending preference changes from an old account cannot alter the new account. Local/offline acknowledgments remain pending until the source domain accepts them and cannot stop server escalation earlier. Required source details are fetched under current access; unread badges or saved notification text are not ongoing authorization.

Use established restrained layouts, accessible labels/icons, toggles for enablement, time/day/zone pickers and clear ordered escalation controls. Support keyboard/TalkBack/screen readers, large text, RTL and long localized reasons without clipped confirmations. Unknown outcome is not presented as a resend invitation; setup and test controls default to safe non-live behavior. Suppression explanations disclose useful permitted reasons, not hidden source existence or another person's consent history. No app/server or visual implementation was created in this task.

## 11. Proposed Verification and Synthetic Controls

These thirty-two proposed evidence families cover the source and the refined workflows. All application/database/provider/webhook/scheduler/client/security tests are NOT RUN. A family can require many fault, race and negative cases; row counts and static fixtures are not passing runtime tests, verified provider capability or compliance certification.

| ID | Verification family and required evidence | Traceability |
| --- | --- | --- |
| C20-V01 | Central command authority: typed actor/source/parent/purpose/current recipient and allowed channel, forged raw destinations/critical flags, and no direct Agent/domain provider bypass. | C20-S01, C20-S02, C20-S05, C20-S06, C20-S08; C20-R01, C20-R02, C20-R03; C20-A01, C20-A22; C20-Q01, C20-Q08; C20-X03, C20-X13, C20-X14; C20-K01, C20-K02; C20-W07, C20-W08 |
| C20-V02 | Durable logical identity: business change/command/outbox faults, lost publish, duplicate workers/occurrence commands and changed payload under a repeated key preserve one recipient/channel effect and recover accepted work. | C20-S06, C20-S13, C20-S21, C20-S26, C20-S32; C20-R04, C20-R13, C20-R19, C20-R25; C20-A02, C20-A13, C20-A23; C20-Q18; C20-K01, C20-K07, C20-K16; C20-W01, C20-W04, C20-W07, C20-W12 |
| C20-V03 | Inbox truth: current source/recipient visibility, idempotent read/dismiss, bounded read-all snapshot with new arrivals, unread reconciliation and reconnect never mark a domain task acknowledged or reveal revoked details. | C20-S04, C20-S13, C20-S25; C20-R04, C20-R05; C20-A01, C20-A02, C20-A22; C20-Q11; C20-X14; C20-K02, C20-K11, C20-K15; C20-W01, C20-W05 |
| C20-V04 | Endpoint generations: token rotation, account/device/environment reassignment, old callback invalidation, revoked devices and multi-device fanout cannot redirect private notifications or disable a newer endpoint. | C20-S08, C20-S14, C20-S24, C20-S32; C20-R05, C20-R09; C20-A03, C20-A15; C20-Q02, C20-Q08, C20-Q17; C20-X05, C20-X06, C20-X13; C20-K03, C20-K04, C20-K10; C20-W02, C20-W08, C20-W11 |
| C20-V05 | Intended destination and verification: linking/recovery proof, changed/recycled/shared destinations, reauthentication, scoped challenge expiry/resends and anti-enumeration distinguish possession from intended recipient and consent. | C20-S08, C20-S09, C20-S15, C20-S16; C20-R09; C20-A04, C20-A06, C20-A15; C20-Q02, C20-Q08, C20-Q17; C20-X05, C20-X13; C20-K02, C20-K03, C20-K04; C20-W02, C20-W08 |
| C20-V06 | Purpose-specific consent and revocation: source/category/channel/sensitivity/recipient/time, static versus dynamic audiences, withdrawal before commit and regrant/late retry prevent grant reuse or automatic backlog replay. | C20-S03, C20-S08, C20-S09, C20-S10, C20-S32; C20-R03, C20-R09; C20-A06, C20-A07; C20-Q01, C20-Q13; C20-X03, C20-X13, C20-X14; C20-K02, C20-K03, C20-K08; C20-W04, C20-W08 |
| C20-V07 | Narrow exception policy: initial verification to an unproven endpoint, security/legal messages, marketing relabeling, privileged critical priority and unknown policy never become a blanket consent or private-content bypass. | C20-S03, C20-S07, C20-S09, C20-S10, C20-S15; C20-R08, C20-R09, C20-R17; C20-A04, C20-A06; C20-Q01, C20-Q02, C20-Q14; C20-X01, C20-X02, C20-X03; C20-K02, C20-K03, C20-K13; C20-W02, C20-W08, C20-W09 |
| C20-V08 | Preference precedence: account/category/resource/conversation overrides, OS permission differences, conflict/retry from another tab/device and current caches cannot re-enable muted or withdrawn delivery. | C20-S10, C20-S25, C20-S27, C20-S28; C20-R03; C20-A07, C20-A21; C20-Q01, C20-Q13; C20-X03, C20-X14; C20-K03, C20-K04, C20-K15; C20-W01, C20-W08 |
| C20-V09 | Quiet hours and expiry: recipient zones, midnight/weekdays/DST gaps/folds/equal boundaries/travel changes, priority exceptions and post-lock time checks preserve intended due time and block deferral past expiry. | C20-S07, C20-S11, C20-S21; C20-R11; C20-A08; C20-Q12; C20-X02; C20-K03, C20-K05, C20-K08; C20-W06, C20-W09, C20-W10 |
| C20-V10 | Scheduler and digest identity: recurring edits/exceptions/pause/resume, lost due jobs, bounded catch-up and digest item/window membership do not duplicate notifications or silently extend deadlines/consent. | C20-S13, C20-S19, C20-S21; C20-R04, C20-R15, C20-R25; C20-A02, C20-A12, C20-A13, C20-A23; C20-Q18, C20-Q19; C20-K01, C20-K05, C20-K07, C20-K12; C20-W05, C20-W07, C20-W09 |
| C20-V11 | Template/render integrity: immutable reviewed version, schema/length/encoding/HTML/link handling, locale fallback and materially changed approval retain meaning and exclude arbitrary model-generated markup or speech. | C20-S06, C20-S12, C20-S15, C20-S17; C20-R02, C20-R10, C20-R12; C20-A09; C20-Q07, C20-Q16; C20-X06, C20-X11, C20-X14; C20-K02, C20-K06; C20-W02, C20-W03, C20-W07 |
| C20-V12 | Sensitive and E2E disclosure: titles, variables, previews, deep links, subjects, shared-device/voicemail payloads, digests and traces use only current allowed content; no server decryption to build an E2E preview. | C20-S03, C20-S12, C20-S14, C20-S18, C20-S20, C20-S29; C20-R10, C20-R23; C20-A09, C20-A22; C20-Q16; C20-X06, C20-X11, C20-X14; C20-K02, C20-K06, C20-K13; C20-W02, C20-W03, C20-W06, C20-W07 |
| C20-V13 | Real push behavior: selected platform/provider credentials, multi-device limits, payload version/background auto-display, collapse/expiry and invalid-token handling preserve in-app truth without guaranteed wake/read claims. | C20-S14; C20-R05, C20-R20; C20-A03; C20-Q06, C20-Q10, C20-Q16; C20-X04, C20-X06; C20-K04, C20-K06, C20-K07, C20-K11; C20-W02, C20-W10 |
| C20-V14 | Email security and evidence: sender SPF/DKIM/DMARC, verification/recovery token scoping, mail-prefetch/GET behavior, bounce/complaint suppression, optional unsubscribe and open/click uncertainty obey the actual provider contract. | C20-S15; C20-R08, C20-R20; C20-A04, C20-A15; C20-Q01, C20-Q10, C20-Q13, C20-Q16; C20-X02, C20-X03, C20-X04; C20-K03, C20-K04, C20-K06, C20-K10, C20-K11; C20-W02, C20-W08, C20-W11 |
| C20-V15 | SMS release limits: country/carrier rules, verified intended endpoint, explicit purpose, Unicode/segment length and cost, opt-out and bounded approved fallback do not expose private conversations or unnecessary credentials. | C20-S16; C20-R08, C20-R21; C20-A06, C20-A15, C20-A19; C20-Q01, C20-Q06, C20-Q08, C20-Q13; C20-X01, C20-X02, C20-X05; C20-K03, C20-K04, C20-K06, C20-K14; C20-W03, C20-W08, C20-W12 |
| C20-V16 | WhatsApp provider feasibility: official authorized account/capability/template/window rules, linked verified endpoint and explicit purpose consent, opt-out and status receipts; no arbitrary personal-account automation or contact-book consent. | C20-S17; C20-R08, C20-R09, C20-R21; C20-A10; C20-Q01, C20-Q02, C20-Q07, C20-Q13, C20-Q15; C20-X02, C20-X03, C20-X12; C20-K03, C20-K04, C20-K06, C20-K14; C20-W03, C20-W08, C20-W10 |
| C20-V17 | Voice safeguards: explicit opt-in/purpose/recipient, quiet/call window, attempt/duration/cooldown caps, automated caller disclosure, voicemail minimization and end/opt-out/human-request paths do not imply actual human acknowledgment. | C20-S18, C20-S19; C20-R08, C20-R15, C20-R21; C20-A11, C20-A12; C20-Q01, C20-Q12, C20-Q13, C20-Q19; C20-X08, C20-X09; C20-K03, C20-K05, C20-K11, C20-K12, C20-K14; C20-W03, C20-W05, C20-W11 |
| C20-V18 | Adapter capability and custody: three source methods, request/result fields, unsupported query/cancel, scope/lifetime of idempotency and configured account/environment/credentials are verified rather than inferred from interface stubs. | C20-S22, C20-S26; C20-R06, C20-R07; C20-A05; C20-Q08, C20-Q10; C20-X04, C20-X12; C20-K04, C20-K07, C20-K09, C20-K10; C20-W10, C20-W11 |
| C20-V19 | Dispatch commitment races: fenced worker takeover, required audit/quota transaction, cancellation/consent/expiry/kill switch before versus after commitment and failed result persistence preserve denied new sends and honest in-flight uncertainty. | C20-S04, C20-S09, C20-S23, C20-S32; C20-R13, C20-R18, C20-R22; C20-A01, C20-A06, C20-A13, C20-A16; C20-Q11, C20-Q15, C20-Q18; C20-K07, C20-K08, C20-K09, C20-K14; C20-W04, C20-W10 |
| C20-V20 | Retry and fallback uncertainty: pre-send known rejection versus timeout/5xx ambiguity, stale not-found status, idempotency-window expiry, same-payload replay and alternate provider/channel constraints prevent unsafe second sends or unlimited retry. | C20-S23, C20-S24, C20-S32; C20-R13; C20-A13, C20-A20, C20-A23; C20-Q18, C20-Q19; C20-X01, C20-X02; C20-K03, C20-K07, C20-K08, C20-K09; C20-W04, C20-W10, C20-W12 |
| C20-V21 | Webhook trust and durability: provider/account/signature/key rotation/freshness/body limits, forged and repeated callbacks, same-ID changed digest and inbox/job commit-before-ack hold on actual provider payload fixtures. | C20-S24, C20-S29; C20-R14; C20-A14; C20-Q09, C20-Q10, C20-Q11, C20-Q18; C20-X04, C20-X10, C20-X12; C20-K07, C20-K10, C20-K16; C20-W11 |
| C20-V22 | Evidence ordering and endpoint invalidation: callback before send-response storage, delivered then late accepted, complaint/opt-out, cancelled late success and old-generation token failure preserve true facts without regrant, false acknowledgment or new sends. | C20-S14, C20-S15, C20-S18, C20-S24, C20-S32; C20-R05, C20-R14; C20-A14, C20-A15; C20-Q02, C20-Q13; C20-X03, C20-X10, C20-X13; C20-K04, C20-K08, C20-K10, C20-K11; C20-W02, C20-W04, C20-W11 |
| C20-V23 | Finite escalation and domain response: all nine stops, explicit delay origin, one step/effect identity, acknowledgment versus read/dismiss/call-answer, stop-versus-commit race and source changes/caps prevent loops or misleading ignored-person claims. | C20-S19, C20-S21, C20-S32; C20-R15, C20-R25; C20-A12, C20-A23; C20-Q01, C20-Q12, C20-Q19; C20-X07, C20-X08, C20-X09; C20-K05, C20-K08, C20-K11, C20-K12; C20-W01, C20-W05, C20-W09, C20-W10 |
| C20-V24 | Care-data and instruction safety: confirmed source text/schedule, authorized subject/representative/caregiver, age/legal gates, unclear OCR and missed-response/snooze semantics cannot infer/change dosage, diagnose or promise emergency rescue. | C20-S03, C20-S19, C20-S20; C20-R10, C20-R16; C20-A09, C20-A18; C20-Q01, C20-Q16; C20-X07, C20-X08, C20-X14; C20-K02, C20-K05, C20-K06, C20-K12, C20-K13; C20-W05, C20-W06 |
| C20-V25 | Agent current authority and exact review: all nine tools/ten rules, hostile source/template input, allowed draft versus send, recipient/channel/version approval, replay/child limits, critical-label attempts and forged acknowledgments stay within MVP/domain policy. | C20-S06, C20-S30; C20-R01, C20-R02, C20-R17; C20-A17; C20-Q01, C20-Q05, C20-Q07; C20-X03, C20-X08, C20-X11, C20-X13; C20-Y01, C20-Y02, C20-Y03, C20-Y04, C20-Y05, C20-Y06, C20-Y07, C20-Y08, C20-Y09, C20-Y10; C20-K02, C20-K06, C20-K07, C20-K13; C20-W05, C20-W07, C20-W08 |
| C20-V26 | API/client parity and privacy: 21 source paths versus 11 proposals, canonical conflict/idempotency/events, current read-all/sync scope, endpoint verification, account switch, accessibility and clear unknown/suppression controls across 14 Android/eight web surfaces. | C20-S13, C20-S25, C20-S27, C20-S28; C20-R04, C20-R05; C20-A07, C20-A21, C20-A22; C20-Q02, C20-Q08, C20-Q17; C20-X05, C20-X06, C20-X14; C20-K02, C20-K04, C20-K11, C20-K15; C20-W01, C20-W02, C20-W08 |
| C20-V27 | Kill switches and global budgets: active healthy provider with policy stop, queued/retrying/fallback/manual work, per-user/resource/Agent/provider aggregate reservations, quota pressure and bounded reopening obey limits across concurrent workers. | C20-S07, C20-S23, C20-S29, C20-S31, C20-S32; C20-R18, C20-R24; C20-A16, C20-A19; C20-Q03, C20-Q04, C20-Q05, C20-Q06, C20-Q14, C20-Q15, C20-Q19; C20-X01, C20-X02, C20-X08, C20-X09, C20-X12; C20-K08, C20-K09, C20-K14; C20-W03, C20-W10, C20-W12 |
| C20-V28 | Operator investigation and replay: protected DLQ, source/destination access, no raw payload exports, stale consent/approval/budget denial and unknown-outcome evidence remain enforced during support, manual retry and escalation testing. | C20-S23, C20-S25, C20-S28, C20-S32; C20-R22, C20-R23; C20-A20, C20-A22; C20-Q10, C20-Q11, C20-Q14; C20-X03, C20-X04, C20-X14; C20-K02, C20-K08, C20-K09, C20-K15, C20-K16; C20-W04, C20-W11, C20-W12 |
| C20-V29 | Retention/deletion/restore: source grants, inbox/digest/template variables, command/effect/dedup/audit/provider evidence and backup limits preserve current exclusion and post-snapshot outcomes before any restored delivery. | C20-S12, C20-S13, C20-S26, C20-S29, C20-S32; C20-R04, C20-R22, C20-R23; C20-A02, C20-A22; C20-Q11, C20-Q16, C20-Q18; C20-X04, C20-X14; C20-K02, C20-K06, C20-K07, C20-K08, C20-K16; C20-W01, C20-W07, C20-W12 |
| C20-V30 | Honest private observability: acceptance/delivery/read/ack/call metrics, valid denominators and queue-versus-quiet-hour delay; secret/contact/health/finance/E2E canaries stay out of payloads, logs, traces, metrics and operator projections. | C20-S04, C20-S24, C20-S28, C20-S31; C20-R22, C20-R23, C20-R24; C20-A19; C20-Q10, C20-Q11, C20-Q16; C20-X04, C20-X06, C20-X14; C20-K06, C20-K10, C20-K11, C20-K16; C20-W02, C20-W06, C20-W11, C20-W12 |
| C20-V31 | Bounded failure and independent operation: model/provider/queue/Redis/clock/audit outage, scheduler backlog, pool/circuit saturation and compatible deployment/drain recover durable intent without unsafe fallback, lost work or one-process-per-reminder design. | C20-S05, C20-S21, C20-S23, C20-S32, C20-S33; C20-R01, C20-R19, C20-R25; C20-A05, C20-A13, C20-A23; C20-Q06, C20-Q11, C20-Q19; C20-K01, C20-K05, C20-K07, C20-K08, C20-K09, C20-K14, C20-K16; C20-W04, C20-W09, C20-W10, C20-W12 |
| C20-V32 | M1 ordinary in-app journey and separate gated provider qualification: intended accounts, current source, durable one-time occurrence/inbox, duplicate/restart/revoke/read/ack/cancel controls on Android/core web, then isolated authorized provider tests only after their gates. | C20-S01, C20-S34, C20-S35; C20-R04, C20-R20, C20-R21, C20-R25; C20-A01, C20-A02, C20-A21, C20-A23; C20-K01, C20-K02, C20-K03, C20-K07, C20-K08, C20-K11, C20-K13, C20-K15, C20-K16; C20-W01, C20-W02, C20-W03, C20-W04, C20-W05, C20-W06, C20-W07, C20-W08, C20-W09, C20-W10, C20-W11, C20-W12 |

### Synthetic Delivery Controls

This JSON is documentation with synthetic identities and assumed policy/provider facts, not a notification engine or webhook security test. Six groups distinguish logical identity, quiet-hour expiry, cancellation order, retry uncertainty, callback observations and inbox/domain state. Times and limits are illustrative. No raw destination, credentials or live provider appears, and no provider sends are executed.

```json
{
	"fixture_kind": "synthetic_delivery_contract_controls",
	"runtime_executed": false,
	"logical_identity": {
		"source_occurrence_id": "synthetic-occurrence-1",
		"recipient_id": "synthetic-member-a",
		"channel": "email",
		"payload_marker": "fixture-payload-a",
		"worker_attempt_ids": ["attempt-1", "attempt-2"],
		"expected_logical_effects": 1,
		"different_payload_control": "fixture-payload-b",
		"expected_changed_payload_conflict": true,
		"approved_endpoint_generation": 3,
		"current_endpoint_generation_control": 4,
		"expected_changed_endpoint_send_allowed": false
	},
	"quiet_hours": {
		"zone": "Asia/Kolkata",
		"quiet_start": "22:00:00",
		"quiet_end": "07:00:00",
		"intended_local": "2026-09-19T23:00:00",
		"intended_due_at": "2026-09-19T17:30:00Z",
		"next_allowed_local": "2026-09-20T07:00:00",
		"next_allowed_at": "2026-09-20T01:30:00Z",
		"expires_at": "2026-09-19T18:30:00Z",
		"expected_new_dispatch_allowed": false,
		"medical_policy": false
	},
	"cancellation_order": {
		"cases": [
			{ "id": "cancel-wins", "cancel_order": 10, "proposed_commit_order": 11, "expected_commit_allowed": false, "expected_existing_attempt_reconciliation": false },
			{ "id": "commit-wins", "cancel_order": 11, "proposed_commit_order": 10, "expected_commit_allowed": true, "expected_existing_attempt_reconciliation": true }
		],
		"expected_new_attempts_after_cancel": 0,
		"expected_universal_recall": false
	},
	"retry_policy": {
		"cases": [
			{ "id": "known-rejected", "outcome": "known_not_accepted", "current_authority": true, "within_limits": true, "verified_same_effect_replay_safe": false, "expected_retry_permitted": true },
			{ "id": "unknown-no-proof", "outcome": "unknown", "current_authority": true, "within_limits": true, "verified_same_effect_replay_safe": false, "expected_retry_permitted": false },
			{ "id": "unknown-safe-replay-control", "outcome": "unknown", "current_authority": true, "within_limits": true, "verified_same_effect_replay_safe": true, "expected_retry_permitted": true },
			{ "id": "consent-withdrawn", "outcome": "known_not_accepted", "current_authority": false, "within_limits": true, "verified_same_effect_replay_safe": false, "expected_retry_permitted": false },
			{ "id": "window-ended", "outcome": "known_not_accepted", "current_authority": true, "within_limits": false, "verified_same_effect_replay_safe": false, "expected_retry_permitted": false }
		],
		"unknown_alternate_channel_send_allowed": false
	},
	"callback_observations": {
		"provider_account": "synthetic-provider-account",
		"effect_id": "synthetic-effect-1",
		"cancel_requested": true,
		"events": [
			{ "id": "callback-2", "kind": "delivery.delivered", "provider_account": "synthetic-provider-account", "effect_id": "synthetic-effect-1", "authentication_assumed_valid": true },
			{ "id": "callback-1", "kind": "delivery.accepted", "provider_account": "synthetic-provider-account", "effect_id": "synthetic-effect-1", "authentication_assumed_valid": true },
			{ "id": "callback-2", "kind": "delivery.delivered", "provider_account": "synthetic-provider-account", "effect_id": "synthetic-effect-1", "authentication_assumed_valid": true },
			{ "id": "callback-3", "kind": "delivery.complained", "provider_account": "synthetic-provider-account", "effect_id": "synthetic-effect-1", "authentication_assumed_valid": true },
			{ "id": "wrong-account", "kind": "delivery.delivered", "provider_account": "another-provider-account", "effect_id": "synthetic-effect-1", "authentication_assumed_valid": true },
			{ "id": "invalid-auth", "kind": "delivery.delivered", "provider_account": "synthetic-provider-account", "effect_id": "synthetic-effect-1", "authentication_assumed_valid": false }
		],
		"expected_distinct_accepted_observations": 3,
		"expected_delivered_fact_retained": true,
		"expected_future_channel_suppressed": true,
		"expected_domain_acknowledged": false,
		"expected_command_reactivated": false
	},
	"inbox_and_acknowledgment": {
		"read_all_snapshot_through": "101",
		"eligible_unread_sequences": ["100", "101", "102"],
		"expected_remaining_unread": ["102"],
		"domain_acknowledged": false,
		"expected_escalation_stopped_by_read_all": false,
		"domain_ack_control_order": 20,
		"next_step_commit_order": 21,
		"expected_next_step_allowed_after_domain_ack": false
	},
	"provider_calls_executed": 0,
	"messages_or_calls_sent": 0
}
```

A documentation check can evaluate the finite order/identity/flag relationships and exact UTC/local conversion through .NET with the explicit IANA-to-Windows mapping `Asia/Kolkata` to `India Standard Time`. It does not select or test the production recurrence library, serialize real workers, verify webhook signatures, prove provider replay guarantees or exercise a database. The positive safe-replay control assumes the capability was independently verified; the fixture itself supplies no such verification. The callback flags are assumed facts, not authentication code. Actual C20-V02, C20-V03, C20-V09 and C20-V19 through C20-V23 must later run against the selected implementation.

## 12. Developer Handoff and Delivery Sequence

The earlier T01 through T09 responsibilities are retained and made explicit; T10 through T12 separate provider reconciliation, operating recovery and cross-contract consolidation. These are proposed work packages, not staffed people, created tickets, executed Agents or permission to contact providers.

| ID | Accountable role | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C20-T01 | Product/delivery/security/data-rights leads, Teams A/C/E | Current release/identity/scheduling/privacy decisions and proposed ADR review | Resolve C20-D01 through C20-D14, narrow verification exceptions, exact acknowledgment/state semantics, launch channels and numeric policies. Reconcile OPEN C1-D03 and ADR-0005 rather than treating its Decision prose as approval. |
| C20-T02 | Backend delivery engineer, Team C | C20-T01; accepted owning data/API contracts | Implement typed command/source/recipient/effect identities, current policy, durable inbox, foundational audit/idempotency/outbox/reconciliation and exact template/consent state; C20-V01 through C20-V08, C20-V11. Required audit precedes effects. |
| C20-T03 | Realtime/sync engineer, Team C | C20-T02; accepted Chapter 7 snapshot/replay contract | Implement current authorized inbox/history/read-all/counter and account-isolated event recovery; C20-V03, C20-V26. A websocket event is not the notification record. |
| C20-T04 | Push/email integration engineer, Teams C/E | C20-T02, C20-T08, C20-T10; approved C20-D04, C20-D05 | Implement verified endpoint-generation/token/challenge flows, sanitized templates, actual push/email adapter behaviors, bounces/complaints and safe callbacks; C20-V04, C20-V05, C20-V12 through C20-V14. No live activation before provider gates. |
| C20-T05 | External-channel engineer, Team C | C20-T02, C20-T08, C20-T10; C20-D12 approved per released channel | Implement official permitted SMS/WhatsApp/voice capabilities, opt-out/call controls, quotas and tested idempotency/status/cancel limits; C20-V15 through C20-V18. A test adapter cannot verify a real provider's guarantees. |
| C20-T06 | Scheduling/escalation engineer, Team C | C20-T02, C20-T08, C20-T10; accepted Chapter 13 contract | Integrate stable due occurrences, current quiet-hour/expiry decisions and finite domain-ack/step/stop interlocks; C20-V09, C20-V10, C20-V23, C20-V24. Clinical timing and care authority stay separately gated. |
| C20-T07 | Android/web client engineers, Team B | C20-T02, C20-T03, C20-T06; C20-T04, C20-T05 for released channels | Implement current permitted inbox, preferences, verification/consent, sandboxed test UX and exact source-response controls with accessibility and account isolation; C20-V03, C20-V08, C20-V26. |
| C20-T08 | Security/privacy engineer, Team E | C20-T02; reviewed workforce/key/identity boundaries | Define and verify provider credential custody, minimal templates, scope/consent/Agent policy, payload/callback/telemetry controls and test threat corpus; C20-V05 through C20-V08, C20-V11, C20-V12, C20-V24, C20-V25. Integrated provider evidence remains separately required. |
| C20-T09 | Independent QA/release reviewers, Teams C/E | C20-T02 through C20-T08, C20-T10, C20-T11 for released scope | Execute applicable C20-V01 through C20-V32 with exact component/provider/simulator identity, faults, failures/skips and independent expected outcomes. No runtime readiness from document counts or mocked receipts. |
| C20-T10 | Provider state/reconciliation engineer, Team C | C20-T02, C20-T08 | Implement logical effects/attempt fencing, dispatch commitment, adapter capability contracts, authenticated durable webhook inbox, observation reducer and bounded safe retry/fallback; C20-V18 through C20-V22. |
| C20-T11 | Platform/operations engineer, Teams C/E | C20-T02, C20-T03, C20-T06, C20-T10; C20-T04, C20-T05 for released channels | Operate current kill switches, aggregate budget reservations, private audit/metrics, protected DLQ/retention and isolated restore/reconciliation; C20-V27 through C20-V31. Circuit recovery cannot waive policy. |
| C20-T12 | Product and technical decision owners, Teams A/C/E | C20-T01, C20-T02; C20-T09 for implemented evidence | Review the file-qualified reconciliation index and retained alternatives, proposed ADR outcomes and named owners before canonical schemas or detailed M1 work are approved. Document routing is complete; policy acceptance and implementation remain separately authorized. |

Order the first authorized slice around approved policy/source authority, durable intent and inbox, read/domain-response semantics, central scheduling and failure evidence on both clients. Push/email and later external channels share those foundations but have separate identity, capability, consent and operating gates. A required security/recovery transport must have its own explicit scope approval; this does not convert an in-app demo into proof of all MVP channels. Each package supplies source IDs, schema/migration implications, race/failure cases, actual checks, runbook limits and qualified approval where needed.

## 13. Demonstration, Remaining Risks and Next Planning Work

### Separate Synthetic Delivery Demonstration

This is an unexecuted future script using only synthetic accounts, ordinary task content and permitted sandbox/test adapters. It does not add health records, Agent code, real messages/calls or every provider channel to M1.

1. Confirm an ordinary task/one-time in-app reminder under actual intended family admission. Previewing a draft alone creates no delivery, and a denied account cannot read its details.
2. Commit the source/command intent, interrupt the dispatcher or lose a broker publish, then recover the same logical recipient notification from durable state without a duplicate.
3. Read/dismiss one inbox item or mark a bounded snapshot read while a newer item arrives. Keep the new item unread and show that none of these operations completes the task.
4. Submit the explicit per-recipient/occurrence acknowledgment and stop future eligible escalation. Attribute the actor and preserve already committed evidence honestly.
5. Revoke another recipient's relevant authority before a separate queued attempt commits; deny new dispatch and restricted history. Repeat the old command without exposing its private receipt or creating another effect.
6. Exercise recipient-zone quiet hours and expiry, including a supported DST case later in the selected temporal engine. Do not move a prescribed dose or force an expired reminder through another channel.
7. In an isolated adapter simulation, distinguish known rejection from lost/ambiguous response, safely reconcile uncertainty, and show that a fresh provider/key/channel is not an automatic retry.
8. Process callback duplication, delivered-before-accepted ordering, a bad signature and an old endpoint-generation failure. Keep the true observed outcome without fabricated read/acknowledgment or reactivated work.
9. Activate an authorized kill switch or exhaust an aggregate test budget mid-batch. Stop new commitments/retries/fallback while preserving permitted in-app history and tracking already in-flight effects.
10. Reconnect/switch accounts on Android/core web and restore an isolated snapshot with outbound effects disabled. Apply current consent/source/device/kill-switch state and reconcile post-snapshot effects before any newly permitted send.

Record exact builds/configuration, source/grant/endpoint/template/occurrence/effect/attempt identities, simulated versus real component boundaries, expected versus observed states and failures/skips. Provider-specific sandbox or live test authorization, verified recipients and independent evidence are required before any real integration claim. Static JSON, a simulation or a successful inbox screenshot does not demonstrate official provider capability, human receipt, clinical adherence or emergency response.

### Open Boundaries

- Eight PROPOSED and six OPEN decisions remain unapproved; push/email do not activate on proposal alone, and SMS/WhatsApp/voice need their channel, consent, provider and kill-switch gates. Required first-contact verification or lawful notices need a narrow reviewed policy rather than a blanket exemption.
- Provider status semantics, webhook replay windows, token/destination lifecycle and template-approval processes require verified provider evidence; adapter interfaces prove nothing.
- Escalation authority (caregiver/admin/trusted contact) depends on Chapter 3/18/13 grants and consent; family labels authorize nothing.
- Clinical timing, quiet-hour exceptions and medicine content redaction need Chapter 13 and security review before any health-adjacent external send.
- In-flight/offline external delivery has honest limits: revocation prevents new commitments, but a prior committed attempt may still be accepted or delivered. Local uniqueness and leases do not prove universal exactly-once external delivery; recall is not promised.
- Critical observed leakage, duplicate external effects, consent bypass or webhook forgery blocks the affected release; unrun tests are not passes and a residual-risk sign-off cannot waive mandatory duties.

This contract defines the delivery responsibilities for the released slice. It carries no live-provider authorization, implemented channels, clinical/emergency/compliance claim or proof that all product planning is complete.

The [Chapter 19 messaging contract](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) is already drafted; do not repeat it as an unfinished next chapter. The [reconciliation index](CONTRACT_RECONCILIATION.md) now records working-file routing, alternate ID/API correspondence and remaining approval gates. Next, actual owners review those proposals under the [team plan](TEAM_ORGANIZATION_EXECUTION_PLAN.md), confirm source-area coverage and prepare a detailed M1 backlog limited to approved prerequisites. Do not equate the draft count with all twenty chapters implemented or fully specified. Carry [Chapter 13](CHAPTER_13_SCHEDULING_CONTRACT.md) and [Chapter 11](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md) into every channel decision; scaffolding, credentials, provider tests and deployment require separate authorization.






