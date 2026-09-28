# Chapter 20: Notifications and Provider Delivery Contract

Status: DRAFT FOR PRODUCT, NOTIFICATION DELIVERY, PRIVACY AND OPERATIONS REVIEW. This is a design and verification plan, not an implemented notification service, verified provider integration, sent message or staffed emergency-response capability.

Document role: retained partial alternate proposal through six workflows. Use the [completed delivery review draft](CHAPTER_20_DELIVERY_CONTRACT.md) for the full current workflow/verification handoff and the [reconciliation index](CONTRACT_RECONCILIATION.md) for semantic ID mapping. This file's C20-B, C20-M, C20-P and C20-R families differ from that draft's; do not translate decisions or workflows by number. Its existing source catalogs, choices and prose remain retained, not independently approved or completed by this annotation.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md), [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [file/document](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md), [discovery](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md), [trust operations](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md), [event planning](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) and [messaging](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) drafts. It develops C19-T12 into shared recipient, consent, channel, attempt and recovery contracts.

- [Chapter 20](../Chapter20.md) owns notification/provider delivery. Chapter 13 owns deterministic schedule/occurrence timing; Chapter 19 owns message acceptance and conversation receipt facts. Reuse those authorities instead of creating another scheduler, account directory or messaging status engine.
- The source [core principle](../Chapter20.md#L59) prohibits unrestricted direct provider calls from every Agent or backend module. A centralized domain policy validates current purpose, actor, actual source, recipient, destination, consent, preferences, time, channel and budget before any permitted adapter effect.
- M1 remains synthetic ordinary family task plus confirmed one-time in-app reminder, without required Agent code or push/email proof. The source's initial in-app/push/email direction is retained below but does not resolve OPEN C1-D03, approve the existing proposed ADRs or silently extend M1. SMS/WhatsApp/voice, real care workflows and emergency handling have separate gates.
- Preserve all original chapters, earlier drafts, the team plan and proposed ADRs. Continued chapter planning does not approve unresolved policies or authorize installation, implementation, credentials, real contacts/health data, provider tests, messages/calls, spending, provisioning or deployment.
- Provider capability, consent/legal basis, intended recipient identity and delivery evidence must be verified independently. Owning a phone/email or accepting a provider request is not proof of the intended person, human receipt, treatment adherence or emergency response.
- All notification/database/scheduler/provider/webhook/consent/client/security/load tests are NOT RUN. Document checks and finite synthetic policy/state examples are not runtime durability, provider feasibility, compliance or production readiness evidence.

## 2. Exact Source Topics and Types

All thirty-five numbered topic titles and source anchors are retained, including the first topic's different heading depth.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C20-S01 | Purpose and Scope | [20.1](../Chapter20.md#L3) |
| C20-S02 | Core Architecture Principle | [20.2](../Chapter20.md#L59) |
| C20-S03 | Notification Types | [20.3](../Chapter20.md#L107) |
| C20-S04 | Notification Lifecycle | [20.4](../Chapter20.md#L231) |
| C20-S05 | Notification Domain Components | [20.5](../Chapter20.md#L393) |
| C20-S06 | Notification Command | [20.6](../Chapter20.md#L414) |
| C20-S07 | Notification Categories and Priority | [20.7](../Chapter20.md#L448) |
| C20-S08 | Recipient Resolution | [20.8](../Chapter20.md#L599) |
| C20-S09 | Consent Architecture | [20.9](../Chapter20.md#L649) |
| C20-S10 | User Communication Preferences | [20.10](../Chapter20.md#L720) |
| C20-S11 | Quiet Hours and Timezones | [20.11](../Chapter20.md#L763) |
| C20-S12 | Template Architecture | [20.12](../Chapter20.md#L809) |
| C20-S13 | In-App Notification Architecture | [20.13](../Chapter20.md#L862) |
| C20-S14 | Push Notification Architecture | [20.14](../Chapter20.md#L917) |
| C20-S15 | Email Architecture | [20.15](../Chapter20.md#L983) |
| C20-S16 | SMS Architecture | [20.16](../Chapter20.md#L1048) |
| C20-S17 | WhatsApp Architecture | [20.17](../Chapter20.md#L1096) |
| C20-S18 | Voice Call Architecture | [20.18](../Chapter20.md#L1180) |
| C20-S19 | Escalation Architecture | [20.19](../Chapter20.md#L1261) |
| C20-S20 | Medicine Reminder Communication | [20.20](../Chapter20.md#L1366) |
| C20-S21 | Notification Scheduling | [20.21](../Chapter20.md#L1427) |
| C20-S22 | Provider Adapter Contract | [20.22](../Chapter20.md#L1502) |
| C20-S23 | Retry Architecture | [20.23](../Chapter20.md#L1567) |
| C20-S24 | Delivery Tracking | [20.24](../Chapter20.md#L1635) |
| C20-S25 | Notification APIs | [20.25](../Chapter20.md#L1685) |
| C20-S26 | Database Model | [20.26](../Chapter20.md#L1738) |
| C20-S27 | Android Screens | [20.27](../Chapter20.md#L1785) |
| C20-S28 | Web/Desktop Screens | [20.28](../Chapter20.md#L1848) |
| C20-S29 | Security and Privacy | [20.29](../Chapter20.md#L1885) |
| C20-S30 | Agent Integration | [20.30](../Chapter20.md#L1989) |
| C20-S31 | Observability and Metrics | [20.31](../Chapter20.md#L2051) |
| C20-S32 | Failure Handling | [20.32](../Chapter20.md#L2131) |
| C20-S33 | Repository Structure | [20.33](../Chapter20.md#L2217) |
| C20-S34 | Final Architecture Decision | [20.34](../Chapter20.md#L2276) |
| C20-S35 | Acceptance Criteria | [20.35](../Chapter20.md#L2330) |

All five type headings from section 20.3 are retained. Category, priority, sensitivity and channel choice are related policy inputs, not equivalent grants.

| ID | Source notification type |
| --- | --- |
| C20-F01 | System Notifications |
| C20-F02 | Social Notifications |
| C20-F03 | Productivity Notifications |
| C20-F04 | Family and Relationship Notifications |
| C20-F05 | Sensitive Notifications |

## 3. Exact Lifecycle and Component Inventory

All fourteen status/meaning pairs from section 20.4.1 are preserved, with code formatting removed from state names. The source `read` description joins opened/acknowledged behavior; the canonical design must separate device/provider evidence, in-app read and an explicit business acknowledgment instead of treating that wording as proof of human action.

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

An earlier authorization outcome is not a standing permission after consent, source, device, destination or membership changes. A cancellation can coexist with a previously committed external attempt awaiting reconciliation. Canonical command, recipient notification, logical channel effect and attempt states need explicit transitions; source status inventory alone cannot express every such combination.

The fifteen component labels in section 20.5 are retained in source order. They are responsibilities, not fifteen required deployments or separate competing databases.

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

The structured command example's `allowed_channels`, `requires_consent`, `priority` and UUID fields are requests to validate, not authority a client/Agent can assign itself. Current domain policy decides the actual eligible recipients and effects. A template key and variables also need classification, exact version and audience validation before rendering.

The fourteen top-level source command fields in section 20.6 are `notification_id`, `category`, `priority`, `recipient_account_id`, `resource_type`, `resource_id`, `template_key`, `template_version`, `variables`, `allowed_channels`, `scheduled_for`, `expires_at`, `requires_consent`, `idempotency_key`. These do not replace the canonical authenticated command schema or server-derived actor/destination/version fields.

All seven example category-policy rows in section 20.7.2 are preserved. They are examples, not approved release defaults or permission to send every listed channel.

| ID | Source category | Source default channel | Source external channel |
| --- | --- | --- | --- |
| C20-G01 | Security alert | Push + email | Optional SMS |
| C20-G02 | Group message | In-app + push | Usually disabled |
| C20-G03 | Task reminder | In-app + push | Consent required |
| C20-G04 | Medicine reminder | In-app | Explicit consent required |
| C20-G05 | Family escalation | In-app + push | Explicit consent required |
| C20-G06 | Marketing | In-app/email | Separate opt-in |
| C20-G07 | Agent approval | In-app + push | Optional email |

The following source lists retain their values and order. Provider-channel statuses and category policy are not a single shared state machine.

| Source list | Values in source order |
| --- | --- |
| Priority levels, 20.7.1 | low, normal, high, critical |
| Preference levels, 20.10 | Global Account Preference, Category Preference, Resource Preference, Conversation Preference, Notification-Specific Override |
| Email delivery states, 20.15.2 | queued, accepted, delivered, bounced, soft_bounced, complained, opened, clicked, failed |
| Call statuses, 20.18.2 | queued, dialing, ringing, answered, voicemail, busy, no_answer, failed, cancelled, completed |
| Notification UX states, 20.27.2 | Loading, Delivered, Read, Suppressed, Failed, Retry available, Consent required, Permission required, Expired |

The nine escalation stop conditions from section 20.19.3 are retained verbatim. Their evaluation and already committed effects must be reconciled through the same execution boundary, not independent timers.

| ID | Source escalation stop |
| --- | --- |
| C20-Z01 | Recipient acknowledges |
| C20-Z02 | Task is completed |
| C20-Z03 | Event is cancelled |
| C20-Z04 | User revokes consent |
| C20-Z05 | Recipient leaves the resource |
| C20-Z06 | Admin cancels escalation |
| C20-Z07 | Maximum attempts reached |
| C20-Z08 | Expiration time reached |
| C20-Z09 | Policy condition becomes false |

All twenty-one core table names from section 20.26 are preserved. Reuse existing account, consent, scheduling, acknowledgment and delivery authorities; no duplicate timer or permission table is implied.

| ID | Source table |
| --- | --- |
| C20-M01 | notifications |
| C20-M02 | notification_templates |
| C20-M03 | notification_preferences |
| C20-M04 | notification_delivery_attempts |
| C20-M05 | notification_endpoints |
| C20-M06 | notification_digests |
| C20-M07 | notification_suppression_rules |
| C20-M08 | communication_consents |
| C20-M09 | external_channels |
| C20-M10 | external_channel_verifications |
| C20-M11 | schedules |
| C20-M12 | schedule_occurrences |
| C20-M13 | schedule_exceptions |
| C20-M14 | escalation_policies |
| C20-M15 | escalation_steps |
| C20-M16 | escalation_executions |
| C20-M17 | escalation_acknowledgements |
| C20-M18 | provider_accounts |
| C20-M19 | provider_credentials |
| C20-M20 | provider_webhook_events |
| C20-M21 | provider_rate_limits |

All eight important-index expressions in section 20.26.1 are retained. Separate uniqueness, scope constraints, durable work recovery and current policy checks are still required; an ordinary index does not supply them.

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

The section 20.22 adapter methods are `send`, `get_status`, `cancel`. Source request fields are `notification_id`, `recipient`, `channel`, `template_key`, `rendered_content`, `idempotency_key`, `metadata`; result fields are `accepted`, `provider_message_id`, `status`, `retryable`, `provider_error_code`. These illustrative interfaces do not prove a provider supports idempotency, status lookup or cancellation. Boolean accepted/cancel results need explicit unknown/unsupported/partial semantics in the canonical contract.

## 4. Exact Final Decisions and Acceptance

All twenty-five numbered decisions in section 20.34 remain verbatim.

| ID | Source final decision |
| --- | --- |
| C20-B01 | Notification delivery is separate from agent reasoning. |
| C20-B02 | Agents create structured notification commands, not unrestricted provider calls. |
| C20-B03 | A centralized policy engine evaluates consent, preferences, privacy, and rate limits. |
| C20-B04 | In-app notifications are the durable source of notification history. |
| C20-B05 | Push notifications are wake-up and delivery hints, not the source of truth. |
| C20-B06 | External providers are accessed through adapters. |
| C20-B07 | Provider-specific logic is isolated from the domain layer. |
| C20-B08 | Email, SMS, WhatsApp, and voice calls require channel-specific policies. |
| C20-B09 | External communication requires explicit consent and verified destinations. |
| C20-B10 | Sensitive content is redacted from push, SMS, email, WhatsApp, and voice workflows by default. |
| C20-B11 | Quiet hours are timezone-aware. |
| C20-B12 | Notification templates are versioned, localized, and schema-validated. |
| C20-B13 | Delivery attempts are idempotent and bounded by retry policies. |
| C20-B14 | Provider webhooks are authenticated and deduplicated. |
| C20-B15 | Escalation is a bounded state machine with clear stop conditions. |
| C20-B16 | Medicine reminders preserve confirmed information and do not infer medical instructions. |
| C20-B17 | Agents cannot independently assign critical priority or bypass consent. |
| C20-B18 | External communication can be disabled globally, by provider, by resource, or by agent. |
| C20-B19 | Notification delivery is asynchronous and independently scalable. |
| C20-B20 | The initial implementation should support in-app, push, and email first. |
| C20-B21 | SMS, WhatsApp, and voice should be added through the same provider abstraction. |
| C20-B22 | All external communication actions must be auditable. |
| C20-B23 | Notification content must never be logged in plaintext when sensitive. |
| C20-B24 | Cost and provider quota tracking are required before enabling large-scale external delivery. |
| C20-B25 | The scheduler and escalation engine must operate reliably even when the LLM is unavailable. |

All twenty-three acceptance criteria in section 20.35 remain verbatim. They are required capabilities for the released full scope, not reported passing tests or authorization to test live channels.

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

The typographic apostrophe in source acceptance criterion C20-A08 is normalized to ASCII. Other wording is unchanged. The initial channel direction, provider verification, care authority and emergency capability remain subject to their actual release decisions and evidence.

### APIs, Events and Agent Tools

All twenty-one source method/path pairs in section 20.25 are retained with whitespace normalized. The source omits `/v1`; reconcile Chapter 7 and the existing proposed prefix ADR before generating routes rather than deploy a second unversioned API.

| ID | Source operation |
| --- | --- |
| C20-P01 | `GET /notifications` |
| C20-P02 | `POST /notifications/{id}/read` |
| C20-P03 | `POST /notifications/read-all` |
| C20-P04 | `POST /notifications/{id}/dismiss` |
| C20-P05 | `GET /notifications/unread-count` |
| C20-P06 | `GET /me/notification-preferences` |
| C20-P07 | `PATCH /me/notification-preferences` |
| C20-P08 | `GET /me/communication-consents` |
| C20-P09 | `POST /me/communication-consents` |
| C20-P10 | `DELETE /me/communication-consents/{id}` |
| C20-P11 | `GET /me/external-channels` |
| C20-P12 | `POST /me/external-channels/link` |
| C20-P13 | `POST /me/external-channels/verify` |
| C20-P14 | `DELETE /me/external-channels/{id}` |
| C20-P15 | `PATCH /me/external-channels/{id}/preferences` |
| C20-P16 | `GET /resources/{id}/escalation-policies` |
| C20-P17 | `POST /resources/{id}/escalation-policies` |
| C20-P18 | `PATCH /escalation-policies/{id}` |
| C20-P19 | `POST /escalation-policies/{id}/pause` |
| C20-P20 | `POST /escalation-policies/{id}/resume` |
| C20-P21 | `POST /escalation-policies/{id}/test` |

The four client event names in section 20.13 and eight webhook-event names in section 20.24.2 are preserved with their source family. Webhook vocabulary is provider-normalized evidence, not permission to broadcast raw callbacks or overwrite unrelated client state.

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

All nine tool examples and ten ordered tool-policy rules from section 20.30 are preserved. A tool may request a permitted action, not change consent or self-assign critical priority.

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

| ID | Source ordered Agent tool rule |
| --- | --- |
| C20-R01 | Validate resource access. |
| C20-R02 | Validate recipient. |
| C20-R03 | Validate channel. |
| C20-R04 | Check consent. |
| C20-R05 | Check category policy. |
| C20-R06 | Check quiet hours. |
| C20-R07 | Check rate limits. |
| C20-R08 | Check whether approval is required. |
| C20-R09 | Render an approved template. |
| C20-R10 | Create an auditable notification command. |

### Client and Security Inventories

All fourteen Android notification-screen labels in section 20.27.1, eight literal web routes and nine administrator labels in section 20.28 are retained. Existing platform shell/navigation and role boundaries remain authoritative.

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

All fourteen threat labels and nineteen required controls from section 20.29 are preserved. They describe risks/requirements, not discovered vulnerabilities or tested protections.

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

## 5. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C20-D01 | Domain ownership and durable history | One policy-governed notification authority with durable per-recipient in-app history and separate channel effects/attempts. Reuse scheduler, identity and messaging services rather than duplicate them. | PROPOSED |
| C20-D02 | Current source and recipient authority | Validate actor/delegation, real source/version/audience/history and intended recipient before acceptance and dispatch, including retries, callbacks, exports and resumed runs. | PROPOSED |
| C20-D03 | Consent and legal basis | Define purpose/channel/resource/destination consent, verification bootstrap, mandatory notices, age/representative rules and revocation semantics; no role or client flag creates an exception. | OPEN |
| C20-D04 | Versioned destinations and devices | Bind account/contact/device endpoint generations and verified purposes, suppress stale/reassigned destinations and handle callback invalidation against the exact generation. | PROPOSED |
| C20-D05 | Temporal and routing policy | Choose recipient-zone quiet-hour, urgency/expiry/fallback/multi-channel/late-delivery semantics and limits. Source examples are not medical timing or emergency overrides. | OPEN |
| C20-D06 | Template and privacy control | Versioned localized typed templates and recipient-specific projection before provider disclosure, including subjects, previews, links, voice scripts and E2E metadata. | PROPOSED |
| C20-D07 | Logical effect and dispatch commitment | Stable intent/recipient/channel identity, exact approval and required durable audit/attempt reservation before external effect; define cancellation/revocation races without false recall. | PROPOSED |
| C20-D08 | Retry, fallback and unknown outcomes | Bounded provider-specific retries with original identity, reconciliation before uncertain repeat/fallback and explicit actual status; no universal exactly-once delivery guarantee. | PROPOSED |
| C20-D09 | Official provider capabilities | Select supported providers/accounts/regions/terms/templates/idempotency/status/webhooks/security/quotas/cost. No unofficial WhatsApp automation or assumed group/call/presence API. | OPEN |
| C20-D10 | Callback integrity and evidence | Verify exact provider/account/payload authenticity, durable inbox/dedup and fact reconciliation without allowing callbacks to create new recipient authority or revive cancelled work. | PROPOSED |
| C20-D11 | Escalation and sensitive care | Define bounded trigger/time origin/recipient/approval/stop rules and qualified care/emergency procedures before real sensitive use. Non-response is not diagnosis or automatic emergency contact. | OPEN |
| C20-D12 | Agent and client truth | Shared typed manual/tool policy, exact review and distinct saved/queued/accepted/delivered/read/acknowledged/unknown states with accessible privacy controls. | PROPOSED |
| C20-D13 | Budgets, retention and operations | Choose aggregate rate/cost/retry limits, evidence retention, protected operator replay, kill-switch propagation and isolated reconciled recovery targets. | OPEN |
| C20-D14 | Launch scope and acceptance | Reconcile C1-D03, channel rollout, provider/legal approval and real end-to-end evidence with the existing team plan/ADRs; ordinary in-app M1 is not push, email or care readiness. | OPEN |

These eight proposals and six open choices remain unapproved. A provider adapter, critical label, organizer request, model-generated command or continuation of planning cannot waive current authority, consent or mandatory safety boundaries.

## 6. Ownership, State and Integrity

### Separate Records and Facts

| Record group | Source tables | Required refinement |
| --- | --- | --- |
| Command and recipient notification | C20-M01 | Durable source intent/approval and minimal account-owned inbox projection, separately keyed from channel attempts. A broadcast command is not one recipient's read state. |
| Templates | C20-M02 | Exact approved version/channel/locale, typed variables, sensitivity projection and rendering provenance. No arbitrary model HTML or speech. |
| Preferences, digest and suppression | C20-M03, C20-M06, C20-M07 | Current purpose/scope rules and per-recipient policy epochs; grouping/digest membership does not bypass each source's access or expiry. |
| Consent | C20-M08 | Actual subject/representative, intended recipient, sender/resource/channel/category/purpose/time/sensitivity and bound destination policy, with withdrawal history. |
| Endpoints and channel verification | C20-M05, C20-M09, C20-M10 | Protected account/contact/device binding and generation, verified purpose, expiry/revocation and limited linking challenges. |
| Logical delivery and attempts | C20-M04 | Separate recipient/channel effect, approved destination/template, numbered transport attempts, provider/account references and known/unknown evidence. Add canonical effect records where required. |
| Schedule intent and occurrences | C20-M11, C20-M12, C20-M13 | Reuse Chapter 13 revisions/instances/exceptions and stable logical occurrence; queue time is not original due time. |
| Escalation | C20-M14, C20-M15, C20-M16, C20-M17 | Versioned finite policy, exact occurrence/recipient trigger, step effect and canonical domain acknowledgment. Do not equate notification read with task/medicine response. |
| Provider configuration and credentials | C20-M18, C20-M19 | Verified capabilities, environment/account/region, protected secret references and narrowly authorized rotations; a table name is not a secret vault. |
| Webhook inbox | C20-M20 | Authenticated bounded immutable evidence, provider/account/event identity, dedup/anomaly digest, processing receipt and limited retention. |
| Rate and cost ledger | C20-M21 | Aggregate admission/reservation/attempt/evidence policy across recipients/channels/providers, not only a per-worker counter. |

Reuse canonical current identity, consent, files, tasks, messaging and schedule authorities. Additional approval, source-revision, logical-effect, audit, job/outbox and reconciliation records implement missing integrity boundaries, not a competing notification engine. Typed source/recipient/endpoint/effect foreign keys and uniqueness prevent cross-resource or null-actor duplicate effects; opaque IDs alone are not authorization.

Separate command acceptance/validation, recipient eligibility, durable in-app availability/read/dismissal, logical channel delivery, transport attempts, provider facts, human acknowledgment and workflow stop state. A queued notice might later be suppressed; an unknown in-flight attempt might later be confirmed delivered after cancellation. Neither fact permits another send or proves the human acted. Do not flatten partial multi-recipient or multi-device results into a global `read`/`failed` flag.

Store intended due time, earliest policy-eligible dispatch, expiry, commitment/request time, provider acceptance/delivery/call events and human action receipt as different facts. Source `sent` means provider accepted only where that evidence exists. Email pixels/click scanners, voicemail, shared phone/device answers and push provider receipts cannot establish intended-person reading or task/clinical completion.

### Delivery Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C20-K01 | One durable policy authority controls accepted notification work. | Structured domain command/inbox/effect/receipt plus required audit/outbox, independent of model/client/provider uptime. |
| C20-K02 | Actual source and recipient authority is current. | Actor/delegation/parent/history/audience/restriction and intended recipient at creation, dispatch, read, replay, tools and exports. |
| C20-K03 | Consent and destination verification are scoped, distinct grants. | Purpose/category/channel/resource/time/sensitivity, binding generation and explicit lawful bootstrap/exception policy. |
| C20-K04 | Endpoint changes cannot redirect or disable another person's delivery. | Current account/device/contact generation, safe linking/revocation and callback conditional updates. |
| C20-K05 | Temporal policy cannot silently extend authority or clinical timing. | Recipient IANA zone, quiet-hour windows, current-clock expiry after waits, bounded deferral and approved priority exceptions. |
| C20-K06 | Content is exact, minimized and approved before provider disclosure. | Typed reviewed template/version/locale, safe render/link/preview projection and no E2E plaintext backdoor. |
| C20-K07 | Stable logical effects outlive attempts and worker claims. | Occurrence/source/recipient/channel identity, immutable approved payload/destination, bounded leases and transactional durable work. |
| C20-K08 | Cancellation and revocation have a defined dispatch boundary. | Current policy serialized with durable attempt/audit/budget commitment; already committed effects reconcile without false recall. |
| C20-K09 | Unknown provider outcome is not permission for another message. | Provider-specific idempotency/status/retry/fallback policy; preserve identity and reconcile before unsafe repeat or channel switch. |
| C20-K10 | Callbacks are authenticated evidence, not authority. | Exact provider/account/payload signature/replay validation, durable inbox/dedup and facts mapped to the intended attempt/generation. |
| C20-K11 | Read, delivery and domain acknowledgment remain separate. | Current recipient/version and actual supported evidence; inbox read-all/dismiss or call answer cannot stop unrelated escalation. |
| C20-K12 | Escalation is finite, purpose-bound and revocable. | Explicit timing origin, recipient/approval/consent, shared stop/commit boundary and aggregate attempt/time/cost caps. |
| C20-K13 | Sensitive care and Agent requests cannot invent new powers. | Confirmed instructions/subject authority, controlled tools/current approvals, no critical-priority or clinical/emergency shortcut. |
| C20-K14 | Kill switches and aggregate budgets apply across workers. | Effective current gates for global/provider/channel/resource/Agent/category with bounded reservations, audited changes and reviewed reopening. |
| C20-K15 | Clients and APIs expose only permitted honest state. | Canonical typed schema/conflict/idempotency, current source access, account-isolated caches/replay and accessible consent controls. |
| C20-K16 | Operating evidence and retention survive failure without overclaim. | Durable reconciliation, private telemetry/audit, protected replay, explicit provider/backup limits and isolated current-authority restore. |

## 7. Commands, Recipients and Communication Authority

### C20-W01 Accept a Structured, Scoped Notification Intent

Authenticate the actual domain actor/service/Agent and validate purpose, source type/ID/version/parent, audience and action authority. An opaque resource ID, category string, `requires_consent: false` or `priority: critical` in a client/model payload is not a permission grant. Derive sensitive classification, eligible priority and recipient interpretation from the owning domain/policy. Refer to protected source data instead of copying arbitrary conversation or medicine text into provider fields.

Admit an immutable validated intent with server-derived context, stable caller/action/resource idempotency and canonical source effect identity. One scheduled occurrence, task action or approved Agent effect must not generate new logical notices merely because a worker/node retries. Exact same intent retries return currently permitted receipts; changed recipient/content/channel under the same key conflicts. If a legitimate later reminder is separately approved, give it a distinct intentional occurrence/follow-up identity rather than weakening deduplication.

Preview only the recipient-safe approved template/variables and actual planned effects within the reviewer's authority. Expose material channel, destination interpretation, time/expiry, sensitivity and cost/approval implications, not just 'notify family'. Required approval binds exact immutable intent/source/template/recipient policy and expires/revalidates on change. A model's proposed content or a successful preview creates no dispatch permission.

Commit accepted domain work, minimal audit and initial recipient/validation jobs/outbox before acknowledgment. An asynchronous 202 means durable pending work, not 'sent'. Preserve caller-visible denial/suppression/pending status without leaking hidden contacts or private source details. Source truth and accepted work continue without the LLM or original app session, while current standing authority is still checked before effects.

### C20-W02 Resolve Intended Recipients and Versioned Endpoints

Resolve recipients only from permitted actual relationships: account, conversation, Space, event, assignee, explicitly configured trusted contact or eligible administrator/owner. Current membership alone is insufficient for restricted health/files/history; an administrator cannot receive every participant's sensitive details. A directory/contact-book entry, fuzzy name match or Agent-generated number is not a verified intended recipient. Do not infer external-recipient permission from an in-app mention or group membership.

Define whether a command freezes an explicitly reviewed recipient set or uses an approved dynamic selector. New members, removed members, changed guardians/caregivers and reassigned tasks require current eligibility, disclosed audience-change rules and renewed review where material. Record recipient identity and necessary policy provenance, not an unbounded snapshot of everyone's private contact details. Deduplicate the intended person/effect appropriately without collapsing distinct legitimate recipients who share a household phone.

Store each endpoint with account/contact/device ownership, channel/provider/environment, binding generation, verification purpose/status, locale/zone where appropriate and revocation. Encrypt usable tokens/destinations under restricted custody; an unsalted phone/email/token hash is not privacy protection against guessing, and a hash alone cannot send. Use reviewed canonical parsers/normalizers without equating email aliases or recycled phone numbers to one proven identity. Scope lookup/errors to prevent account/number enumeration.

Channel linking requires current authenticated user authority and reauthentication where specified. Verification challenges are purpose/session/account/destination-generation bound, short-lived, attempt/resend limited and replay safe; confirming a challenge does not automatically opt into every resource or sensitive category. Token rotation, device logout, contact change and invalid-destination callbacks affect only the exact bound generation. A late failure for an old push token or phone binding must not revoke the newer verified endpoint or redirect its queued messages automatically.

### C20-W03 Apply Consent, Preferences and Withdrawal

Treat proof of destination possession, consent to a purpose/channel/resource, current source visibility, OS notification permission and legal basis as distinct checks. Source section 20.9's 'required or strongly recommended' wording cannot weaken section 20.34's explicit-consent and verified-destination requirement for external communication. Adopt that stricter baseline pending an explicit qualified exception decision; sender/Agent approval is not recipient consent, and permission for event updates is not permission for medicine details or voice calls.

Account verification/recovery necessarily can involve an initially unverified destination. Define a separate narrowly authorized user-initiated bootstrap flow under Chapter 18: minimal purpose-bound challenge, anti-enumeration/abuse limits and no private group content or general reminders until verification/consent gates hold. Consent expressed to receive that challenge is not family-message/marketing enrollment. OTP/recovery tokens must not enter ordinary persistent inbox variables, model context, logs or unrestricted operator dashboards. Do not silently bypass the normal verified-recipient gate for arbitrary 'security' notifications.

The preference hierarchy is an input-resolution model, not automatic last-override-wins permission. A per-notification override may narrow a preference or use a specifically approved exception; it cannot re-enable revoked consent, banned content, invalid destination or a kill switch. Specify ordinary category defaults and the jurisdiction/purpose/recipient policy for genuinely required account/safety notices. The source example 'Security alerts: always enabled' is not blanket permission to call a person, ignore all quiet hours or repurpose their data.

Record grant/withdrawal/version/effective interval and subject or verified representative authority. Family-owner, trusted-contact, phone possession and guardian claims do not establish legal care authority. Opt-out/unsubscribe and authenticated provider complaint signals update the correct purpose/endpoint suppression promptly under a reviewed policy; remain robust to link-preview bots, forged callbacks and replay without disabling people's unrelated accounts. Standards-compliant unsubscribe handling is separate from ordinary GET actions; opening a link must not acknowledge a dose, approve a tool or opt someone in.

On withdrawal, commit current denial/consent epoch and durable cancellation/suppression intent before background queue cleanup. Recheck pending, deferred, retried, fallback, escalated and resumed work at dispatch. Do not evade revocation by switching channel, provider, destination or another group. Preserve minimal justified audit/dedup evidence without retaining secret content unnecessarily. Effects already past commitment may be in flight; attempt provider cancellation only if actually supported and reconcile honest outcomes rather than mark an accepted message as never sent.

## 8. Time Policy, Templates and In-App History

### C20-W04 Resolve Eligible Time and Channels

Use Chapter 13's deterministic schedule/occurrence authority for one-time, recurring, exception, pause/resume and relative reminders. The source `schedule_id + occurrence_key` constraint is necessary logical occurrence protection, not sufficient deduplication for every recipient/channel/follow-up effect or provider retry. Keep original due time, permissible dispatch interval and resolution version separate; editing a schedule/zone does not mint a second intended occurrence by changing its UTC timestamp.

Evaluate quiet hours in the recipient's configured IANA zone, including midnight-crossing windows, selected weekdays, timezone changes and daylight-saving gaps/folds under the approved temporal policy. Validate equal start/end semantics and missing/invalid zones explicitly. Deferring to the next allowed time never silently extends expiry, consent or approval. Recheck current time after lock waits/queue delays; PostgreSQL `now()` reflects transaction start, not necessarily the actual expiry decision time.

Category policy may defer, deliver only in-app, request a supported silent mode, suppress or use separately authorized escalation. Silent delivery is a requested channel behavior, not proof the OS/provider stayed silent on every device; unsupported modes require a permitted alternative, not a hidden downgrade. Urgency is assigned by an authorized reviewed workflow with a reason, never a model attempting to bypass limits. Unresolved care timing or quiet-hour conflict requires explicit human/policy resolution and cannot change prescribed dose timing.

Select only channels with current destination, consent, audience/template capability, preferences, delivery window, provider health and aggregate budget. Initial multi-channel behavior is explicit, not 'send every configured channel'. Same-channel provider fallback, alternate channel, new destination and escalation are different planned effects with their own review/policy. A timeout is not a known failure permitting a second provider or SMS blast. A disabled optional push path can leave allowed in-app history usable without presenting external delivery as complete.

### C20-W05 Render Reviewed Recipient-Specific Content

Templates have immutable approved version, channel/locale/schema, sensitivity and safe variables. Resolve required fields from authorized source versions; arbitrary model text, HTML, header values, phone numbers, URLs or voice scripts cannot be interpolated unrestrictedly. Escape/sanitize with maintained appropriate rendering libraries, bound size/encoding, restrict links/redirect destinations and avoid email/header/template injection. A template identifier alone does not make caller-supplied variables trusted.

Create the minimum audience-permitted projection before content reaches provider queues, logs, previews or SDK auto-display. Sensitive fields, third-party names, private titles, filenames, exact locations, relationship/financial/health details and E2E message bodies can leak through email subjects, caller scripts, SMS/WhatsApp previews, click-tracking links or metadata even when the main body is generic. Use safe authenticated in-app resource links instead of embedding reusable credentials or assuming a signed URL revokes instantly.

Localization preserves original meaning, explicit relevant timezone and confirmed clinical instructions; missing translation has a reviewed fallback, not an invented translation of dosage or uncertainty. Retain the necessary template/version/rendering provenance in protected history while respecting deletion/minimization. Updating a template or source variable cannot materially alter a previously approved pending message without the required fresh intent/review. Pure provider retry uses the same approved content/destination identity, not newly generated prose.

True-E2E conversation metadata does not grant notification services decryption rights. Generate a generic permitted hint when plaintext is unavailable; optional device-local preview follows Chapter 19's endpoint policy. Do not demand plaintext upload so the notification template can be filled. The preview shown to the sender/approver must itself be authorized for that viewer, and a public/private source change before dispatch may suppress or require a new projection rather than send stale details.

### C20-W06 Persist and Read Authorized In-App History

Create one durable per-recipient logical in-app notification for the eligible accepted source effect, atomically with its local outcome/outbox where ownership permits. External attempts are linked evidence, not the only history record. A created record does not prove the device displayed it or the human saw it; use an explicit availability/read/dismissal contract, and never infer external delivery from inbox creation. A lost realtime/push signal is repaired by current authorized inbox fetch/replay.

List/detail/unread/category/digest/grouped views must recheck account and relevant source/parent/history/lifecycle policy. A title/body/variables snapshot can be sensitive even after the source becomes private/deleted. Return an allowed redacted/unavailable state or remove eligible content according to policy, without claiming to erase already viewed bytes. Unread caches are rebuildable projections, not `last_id` arithmetic over hidden entries or a count that reveals inaccessible resources.

Read and dismiss are idempotent actions by the current recipient, separate from task/medicine/security acknowledgment. Define read-all with an explicit server-confirmed cutoff/snapshot/filter so a race with new arrivals does not mark unseen later items or another account's notifications read. Grouped views/digests retain constituent IDs and current authority; a digest is not permission to copy a private item into a wider audience or to extend every item's expiry. Collapse/replacement keys in push affect hints only and cannot discard durable inbox history silently.

Opening a deep link or tapping an action reauthorizes the actual resource and domain operation. GET/prefetch or provider click events must not acknowledge a reminder, accept an invite or execute an approval. Offline drafts/read intents are permitted only under the client policy and display pending state until confirmed; stale account/role/device responses cannot mutate another account's inbox. When the app is closed, in-app history alone provides no push/wake-up or exact-time promise.