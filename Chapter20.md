# Chapter 20 — Notifications, Push Delivery, Email, WhatsApp, Voice Calls, Escalation, and External Communication Provider Architecture

## 20.1 Purpose and Scope

This chapter defines the notification and external communication system.

It covers:

* In-app notifications

* Push notifications

* Email

* SMS

* WhatsApp

* Voice calls

* Reminder delivery

* Family escalation

* Trusted-contact notifications

* Event announcements

* Agent-generated notifications

* User communication preferences

* Quiet hours

* Consent management

* Provider adapters

* Delivery tracking

* Retry and failure handling

* Notification security

* Rate limiting

* Emergency and high-priority workflows

The notification system must remain separate from the agent reasoning system.

The agent may decide:

> “A reminder should be created.”

The notification service decides:

> “Which recipient, through which channel, at what time, under which consent and policy?”

# 20.2 Core Architecture Principle

The platform must not allow every agent or backend module to directly call WhatsApp, SMS, email, or voice providers.

Instead:

```
Agent or Domain Service
        ↓
Notification Command
        ↓
Notification Policy Engine
        ↓
Recipient Resolution
        ↓
Consent Verification
        ↓
Channel Selection
        ↓
Provider Adapter
        ↓
Delivery Attempt
        ↓
Status Tracking
        ↓
Retry / Escalation / Audit
```

This creates a single control point for:

* Consent

* Privacy

* Rate limits

* Delivery policy

* Provider switching

* Cost tracking

* Security

* Auditing

* Failure handling

# 20.3 Notification Types

## 20.3.1 System Notifications

Examples:

* New login

* Password changed

* Security alert

* Account recovery

* Data export ready

* Account deletion status

* Policy update

System notifications should normally use:

* In-app

* Push

* Verified email

* Optional SMS for high-risk security events

## 20.3.2 Social Notifications

Examples:

* New message

* Mention

* Reaction

* Comment

* New follower

* Group invitation

* Join request result

* New member

These are controlled by user preferences.

## 20.3.3 Productivity Notifications

Examples:

* Task due

* Event starting

* Poll closing

* Budget contribution reminder

* File processing complete

* Agent task completed

* Approval required

## 20.3.4 Family and Relationship Notifications

Examples:

* Shared reminder

* Schedule update

* Family announcement

* Trusted-contact escalation

* Missed response notification

* Group task assignment

These require resource membership and recipient-specific consent.

## 20.3.5 Sensitive Notifications

Examples:

* Medicine reminder

* Health-related schedule

* Personal financial contribution

* Private relationship matter

* Sensitive file update

* Emergency-related escalation

Sensitive notifications must use minimal content.

Example:

```
You have a private reminder.
```

Do not expose sensitive details in:

* Lock-screen push previews

* Email subject lines

* WhatsApp previews

* SMS content

* Shared device notifications

# 20.4 Notification Lifecycle

```
CREATED
   ↓
VALIDATING
   ↓
AUTHORIZED
   ↓
SCHEDULED or QUEUED
   ↓
DISPATCHING
   ├── SENT
   ├── DELIVERED
   ├── READ
   ├── FAILED
   ├── RETRYING
   ├── EXPIRED
   ├── CANCELLED
   └── SUPPRESSED
```

## 20.4.1 Status Definitions

|
Status

|

Meaning

|
| --- | --- |
|

`created`

|

Notification command received

|
|

`validating`

|

Payload and policy checks running

|
|

`authorized`

|

Sender and recipient permissions confirmed

|
|

`scheduled`

|

Delivery time is in the future

|
|

`queued`

|

Ready for a delivery worker

|
|

`dispatching`

|

Provider request is in progress

|
|

`sent`

|

Provider accepted the request

|
|

`delivered`

|

Provider confirmed delivery

|
|

`read`

|

Recipient opened or acknowledged it

|
|

`failed`

|

Delivery failed

|
|

`retrying`

|

Delivery will be attempted again

|
|

`suppressed`

|

Policy or preference prevented delivery

|
|

`cancelled`

|

User or system cancelled it

|
|

`expired`

|

Delivery window ended

|

Provider status must not be confused with user read status.

# 20.5 Notification Domain Components

```
Notification API
       │
       ├── Notification Command Service
       ├── Template Service
       ├── Recipient Resolver
       ├── Consent Service
       ├── Preference Service
       ├── Policy Engine
       ├── Scheduler
       ├── Channel Router
       ├── Provider Adapter Layer
       ├── Delivery Tracker
       ├── Retry Manager
       ├── Escalation Engine
       ├── Audit Service
       └── Notification Analytics
```

# 20.6 Notification Command

A notification command should contain structured information.

JSON

```
{
  "notification_id": "notification-uuid",
  "category": "task_reminder",
  "priority": "normal",
  "recipient_account_id": "account-uuid",
  "resource_type": "family_space",
  "resource_id": "space-uuid",
  "template_key": "task_due",
  "template_version": 1,
  "variables": {
    "task_id": "task-uuid"
  },
  "allowed_channels": [
    "in_app",
    "push"
  ],
  "scheduled_for": "2026-09-18T15:00:00Z",
  "expires_at": "2026-09-18T16:00:00Z",
  "requires_consent": true,
  "idempotency_key": "unique-key"
}
```

Do not place uncontrolled raw model-generated text directly into external communication.

The agent should produce structured variables and a template key.

# 20.7 Notification Categories and Priority

## 20.7.1 Priority Levels

```
low
normal
high
critical
```

Priority must not bypass all controls.

For example:

* `low`: optional feed or digest

* `normal`: standard reminders and messages

* `high`: important event or approval

* `critical`: narrowly defined safety or security workflow

The platform must define who can assign `critical`.

Agents should not freely mark messages as critical.

## 20.7.2 Category Policy

Each category should define:

```
category
default_channels
allowed_channels
minimum_priority
consent_requirement
quiet_hours_behavior
retry_policy
retention_policy
content_sensitivity
escalation_allowed
```

Example:

|
Category

|

Default channel

|

External channel

|
| --- | --- | --- |
|

Security alert

|

Push + email

|

Optional SMS

|
|

Group message

|

In-app + push

|

Usually disabled

|
|

Task reminder

|

In-app + push

|

Consent required

|
|

Medicine reminder

|

In-app

|

Explicit consent required

|
|

Family escalation

|

In-app + push

|

Explicit consent required

|
|

Marketing

|

In-app/email

|

Separate opt-in

|
|

Agent approval

|

In-app + push

|

Optional email

|

# 20.8 Recipient Resolution

The notification service must resolve recipients from authorized relationships.

Possible recipient sources:

* Direct account ID

* Conversation participants

* Group members

* Event attendees

* Task assignees

* Trusted contacts

* Escalation policy

* Page moderators

* Organization administrators

* Agent owner

Recipient resolution must apply:

* Current membership

* Account status

* Block status

* Relationship state

* Resource visibility

* Consent

* Notification preferences

* Channel availability

* Quiet hours

* Suppression rules

An agent must not send a notification to an arbitrary phone number without a verified recipient and explicit permission.

# 20.9 Consent Architecture

## 20.9.1 Consent Requirements

Consent is required or strongly recommended for:

* WhatsApp messages

* SMS

* Voice calls

* Email reminders

* Family escalation

* Trusted-contact alerts

* Health-related reminders

* Location-related alerts

* Marketing messages

* Agent access to communication channels

## 20.9.2 Consent Scope

Consent must be scoped to:

* Recipient

* Sender or resource

* Channel

* Notification category

* Purpose

* Time period

* Sensitivity level

Example:

```
User A allows Family Space B to send:
- In-app reminders: yes
- Push reminders: yes
- WhatsApp reminders: yes
- Voice calls: no
- Health-related content: no
```

## 20.9.3 Consent Revocation

When consent is revoked:

1. Stop future scheduled delivery.

2. Cancel queued notifications where possible.

3. Prevent retries.

4. Preserve audit metadata.

5. Notify the relevant owner if required.

6. Do not resend through another channel automatically.

# 20.10 User Communication Preferences

Preferences should be configurable at multiple levels.

```
Global Account Preference
        ↓
Category Preference
        ↓
Resource Preference
        ↓
Conversation Preference
        ↓
Notification-Specific Override
```

Example:

```
Global push: enabled
Family group push: enabled
Family group task reminders: enabled
Family group WhatsApp: disabled
Specific conversation: muted
Security alerts: always enabled
```

## 20.10.1 Preference Record

```
communication_preference
- id
- account_id
- scope_type
- scope_id
- category
- channel
- enabled
- minimum_priority
- quiet_hours_policy
- updated_at
```

# 20.11 Quiet Hours and Timezones

Quiet hours must be evaluated in the recipient’s configured timezone.

Store:

* IANA timezone

* Quiet-hours start

* Quiet-hours end

* Days of week

* Allowed exceptions

* Priority exceptions

Example:

```
Timezone: Asia/Kolkata
Quiet hours: 22:00–07:00
Normal reminders: delayed
Security alerts: delivered
Critical approved alerts: policy-dependent
```

Do not use only a numeric UTC offset because daylight-saving rules may change for some regions.

## 20.11.1 Quiet-Hour Strategies

When a notification falls inside quiet hours:

* Delay until the next allowed time

* Deliver only in-app

* Deliver silently

* Suppress

* Escalate only if a separate policy permits it

The policy must be category-specific.

# 20.12 Template Architecture

Templates must be versioned and localized.

## 20.12.1 Template Record

```
notification_template
- id
- template_key
- version
- channel
- language
- subject_template
- body_template
- sensitivity_level
- active
- created_at
```

## 20.12.2 Template Rules

* Templates are reviewed before production use.

* Variables are schema-validated.

* HTML email is sanitized.

* External messages use channel-specific templates.

* Sensitive variables are excluded from low-trust channels.

* Templates support localization.

* Templates have fallback language behavior.

* Old versions remain available for historical delivery records.

## 20.12.3 Example

```
Template key: task_due

In-app:
“Task {{task_title}} is due {{due_time}}.”

Privacy-safe push:
“You have a task reminder.”

WhatsApp with consent:
“Reminder: {{task_title}} is due {{due_time}}.”
```

# 20.13 In-App Notification Architecture

In-app notifications are durable platform records.

```
in_app_notification
- id
- account_id
- category
- title_key
- body_key
- variables
- resource_type
- resource_id
- read_at
- dismissed_at
- created_at
- expires_at
```

The client receives:

```
notification.created
notification.updated
notification.read
notification.dismissed
```

## 20.13.1 In-App Features

* Notification inbox

* Unread count

* Category filters

* Mark as read

* Mark all as read

* Dismiss

* Deep link to resource

* Notification preferences

* Expiration

* Grouped notifications

* Digest mode

Unread counts should be computed efficiently and may be cached in Redis.

# 20.14 Push Notification Architecture

Push notifications are a delivery mechanism, not the source of truth.

```
Notification Service
        ↓
Push Adapter
        ↓
FCM / APNs / Other Provider
        ↓
Device
        ↓
Application fetches authoritative data
```

The push payload should normally contain:

* Notification ID

* Resource ID

* Conversation ID

* Deep-link route

* Redacted title

* Redacted body

* Payload version

The application should fetch full content from the backend after opening.

## 20.14.1 Device Token Management

```
notification_endpoint
- id
- account_id
- device_id
- platform
- provider
- token_hash
- token_encrypted
- app_version
- locale
- timezone
- last_seen_at
- revoked_at
```

Rules:

* Tokens can rotate.

* Invalid tokens are disabled.

* Multiple devices are supported.

* Users can revoke one device.

* Push delivery does not imply message read.

* Sensitive content is redacted.

# 20.15 Email Architecture

Email is suitable for:

* Account verification

* Password recovery

* Security alerts

* Data export completion

* Invitations

* Event summaries

* Optional reminders

* Administrative notices

Email should use a provider adapter:

```
EmailProvider
   ├── Provider A
   ├── Provider B
   └── Development Mail Server
```

## 20.15.1 Email Security

* Verified sender domains

* SPF, DKIM, and DMARC configuration

* Signed links

* Short-lived action tokens

* No passwords or OTPs in logs

* Minimal sensitive content

* Unsubscribe handling for optional categories

* Bounce and complaint processing

* Template sanitization

## 20.15.2 Email Delivery States

```
queued
accepted
delivered
bounced
soft_bounced
complained
opened
clicked
failed
```

Email opens and clicks are not always reliable privacy-neutral measurements.

# 20.16 SMS Architecture

SMS may be used for:

* OTP

* Account recovery

* High-priority alerts

* User-approved reminders

* Fallback communication

SMS must not be the default channel for all notifications.

## 20.16.1 SMS Restrictions

* Explicit consent

* Country and carrier restrictions

* Rate limits

* Cost controls

* Content length limits

* Sensitive-content redaction

* Opt-out support

* Provider delivery tracking

* Abuse monitoring

SMS content should not include:

* Full medical details

* Passwords

* Recovery codes in unnecessary contexts

* Private conversation text

* Large file links without authentication controls

# 20.17 WhatsApp Architecture

WhatsApp integration must use a provider abstraction.

```
WhatsApp Adapter
   ├── Approved business provider
   ├── Official API integration
   └── Development/test adapter
```

Open-source WhatsApp libraries may be useful for experimentation, but they must not be assumed to provide:

* Stable production guarantees

* Official platform authorization

* Long-term compatibility

* Compliance coverage

* Delivery guarantees

* Permission to automate arbitrary personal accounts

The architecture should isolate provider-specific logic.

## 20.17.1 WhatsApp Message Flow

```
User grants WhatsApp consent
        ↓
Phone number verified and linked
        ↓
Resource/category permission checked
        ↓
Template selected
        ↓
Notification policy evaluated
        ↓
Provider adapter called
        ↓
Provider message ID stored
        ↓
Delivery webhook received
        ↓
Status updated
```

## 20.17.2 WhatsApp Consent Record

```
external_channel_consent
- id
- account_id
- channel
- destination_hash
- destination_encrypted
- purpose
- resource_type
- resource_id
- status
- granted_at
- revoked_at
```

## 20.17.3 WhatsApp Rules

* Never message a person solely because they appear in a contact book.

* Do not send to unverified numbers.

* Do not expose group content to external recipients without consent.

* Do not send sensitive information by default.

* Do not retry indefinitely.

* Do not bypass user opt-out.

* Keep provider message IDs for reconciliation.

* Handle provider rate limits and template restrictions.

# 20.18 Voice Call Architecture

Voice calls are higher-impact than push or text notifications.

They should require:

* Explicit recipient consent

* Defined calling purpose

* Call-window policy

* Maximum attempts

* Call duration limits

* Quiet-hours policy

* Caller identity disclosure

* Opt-out handling

* Audit trail

## 20.18.1 Voice Call Flow

```
Call request created
        ↓
Recipient and consent validation
        ↓
Call policy evaluation
        ↓
Quiet hours check
        ↓
Call attempt queued
        ↓
Voice provider called
        ↓
Call status received
        ↓
Retry or escalation decision
        ↓
Final status recorded
```

## 20.18.2 Call Statuses

```
queued
dialing
ringing
answered
voicemail
busy
no_answer
failed
cancelled
completed
```

## 20.18.3 Voice Call Safety

The system must not impersonate a human without disclosure.

If an agent speaks:

> “This is an automated assistant calling on behalf of the family group.”

The recipient should be able to:

* End the call

* Opt out

* Request human contact

* Report abuse

* Change preferred channel

# 20.19 Escalation Architecture

Escalation is used when a notification remains unresolved.

Examples:

* A task is not acknowledged

* A family reminder is missed

* An event organizer does not respond

* A high-priority approval is pending

* A trusted-contact notification requires follow-up

Escalation must be policy-driven, not improvised by an agent.

## 20.19.1 Escalation Policy

```
escalation_policy
- id
- owner_account_id
- resource_type
- resource_id
- name
- trigger_type
- acknowledgement_required
- initial_delay
- maximum_duration
- stop_conditions
- active
```

## 20.19.2 Escalation Steps

```
escalation_step
- id
- policy_id
- step_order
- recipient_type
- recipient_id
- channel
- delay_after_previous
- template_key
- requires_consent
- maximum_attempts
```

Example:

```
Step 1:
Send in-app reminder to assigned member.

Step 2:
After 30 minutes, send push notification.

Step 3:
After 2 hours, notify group administrator.

Step 4:
After administrator approval, contact trusted person.
```

## 20.19.3 Stop Conditions

Escalation must stop when:

* Recipient acknowledges

* Task is completed

* Event is cancelled

* User revokes consent

* Recipient leaves the resource

* Admin cancels escalation

* Maximum attempts reached

* Expiration time reached

* Policy condition becomes false

## 20.19.4 Escalation Privacy

Escalation must reveal only the minimum necessary information.

Example:

```
Unsafe:
“Your family member has not taken their 500 mg medicine.”

Safer:
“A configured family reminder needs attention.”
```

The exact content depends on explicit consent and the configured policy.

# 20.20 Medicine Reminder Communication

The system may support medicine reminders, but it must not act as an autonomous medical decision-maker.

## 20.20.1 Allowed Functions

* Store user-confirmed reminder text

* Store confirmed schedule

* Notify the user

* Notify an authorized family member

* Record acknowledgement

* Escalate missed acknowledgement according to consent

* Link to user-provided instructions

* Request confirmation from a clinician or pharmacist when unclear

## 20.20.2 Prohibited Autonomous Behavior

The agent must not:

* Infer dosage from an image

* Change dosage

* Recommend a new dosage

* Stop medication

* Double a missed dose

* Diagnose a condition

* Treat an unverified schedule as medically confirmed

* Send sensitive details to a third party without consent

## 20.20.3 Reminder Data

```
medicine_reminder
- id
- owner_account_id
- name_as_confirmed
- dosage_text_as_confirmed
- schedule
- timezone
- instructions_text
- confirmation_source
- confirmed_at
- confirmed_by
- status
```

The system should preserve the exact confirmed dosage text instead of silently normalizing it into a medical interpretation.

# 20.21 Notification Scheduling

The scheduler must be independent of the LLM.

## 20.21.1 Scheduling Flow

```
Agent or user creates reminder
        ↓
Validate schedule
        ↓
Check authorization
        ↓
Check consent
        ↓
Persist schedule
        ↓
Generate occurrence
        ↓
Scheduler leases due occurrence
        ↓
Create notification command
        ↓
Queue delivery
        ↓
Track outcome
```

## 20.21.2 Schedule Requirements

Support:

* One-time schedule

* Recurring schedule

* Timezone-aware schedule

* Quiet-hour adjustment

* Start and end date

* Exceptions

* Pause/resume

* Cancellation

* Acknowledgement requirement

* Escalation policy

* Expiration

## 20.21.3 Idempotent Occurrences

```
schedule_occurrence
- id
- schedule_id
- occurrence_key
- scheduled_for
- status
- leased_until
- completed_at
```

Unique constraint:

```
schedule_id + occurrence_key
```

This prevents duplicate notifications during retries.

# 20.22 Provider Adapter Contract

All external providers should implement a common interface.

Python

Run

```
class NotificationProvider:
    async def send(
        self,
        request: NotificationProviderRequest,
    ) -> NotificationProviderResult:
        ...

    async def get_status(
        self,
        provider_message_id: str,
    ) -> ProviderDeliveryStatus:
        ...

    async def cancel(
        self,
        provider_message_id: str,
    ) -> bool:
        ...
```

Provider request:

Python

Run

```
@dataclass
class NotificationProviderRequest:
    notification_id: str
    recipient: str
    channel: str
    template_key: str
    rendered_content: str
    idempotency_key: str
    metadata: dict[str, str]
```

Provider result:

Python

Run

```
@dataclass
class NotificationProviderResult:
    accepted: bool
    provider_message_id: str | None
    status: str
    retryable: bool
    provider_error_code: str | None
```

The domain layer must not depend on provider-specific response formats.

# 20.23 Retry Architecture

Retries must be bounded.

## 20.23.1 Retryable Failures

Examples:

* Temporary provider outage

* Network timeout

* Rate-limit response

* Temporary DNS failure

* Provider maintenance

* Queue worker interruption

## 20.23.2 Non-Retryable Failures

Examples:

* Invalid destination

* Consent revoked

* User blocked the channel

* Template rejected permanently

* Account deleted

* Authorization denied

* Unsupported channel

* Expired notification

## 20.23.3 Backoff

Use:

* Exponential backoff

* Jitter

* Maximum retry count

* Maximum delivery window

* Dead-letter queue

* Provider-specific retry rules

Example:

```
Attempt 1: immediate
Attempt 2: +30 seconds
Attempt 3: +2 minutes
Attempt 4: +10 minutes
Final: dead-letter or escalation decision
```

Do not retry a sensitive notification through a different channel without policy authorization.

# 20.24 Delivery Tracking

## 20.24.1 Delivery Attempt Record

```
notification_delivery_attempt
- id
- notification_id
- channel
- provider
- provider_message_id
- attempt_number
- status
- requested_at
- accepted_at
- delivered_at
- failed_at
- failure_code
- failure_reason_safe
```

## 20.24.2 Webhooks

Provider webhooks must be:

* Authenticated

* Signature-verified

* Idempotent

* Rate limited

* Schema validated

* Logged without sensitive content

Webhook events:

```
delivery.accepted
delivery.delivered
delivery.failed
delivery.bounced
delivery.complained
call.answered
call.no_answer
call.completed
```

# 20.25 Notification APIs

## 20.25.1 User Notification APIs

http

```
GET    /notifications
POST   /notifications/{id}/read
POST   /notifications/read-all
POST   /notifications/{id}/dismiss
GET    /notifications/unread-count
```

## 20.25.2 Preference APIs

http

```
GET    /me/notification-preferences
PATCH  /me/notification-preferences
GET    /me/communication-consents
POST   /me/communication-consents
DELETE /me/communication-consents/{id}
```

## 20.25.3 External Channel APIs

http

```
GET    /me/external-channels
POST   /me/external-channels/link
POST   /me/external-channels/verify
DELETE /me/external-channels/{id}
PATCH  /me/external-channels/{id}/preferences
```

## 20.25.4 Escalation APIs

http

```
GET    /resources/{id}/escalation-policies
POST   /resources/{id}/escalation-policies
PATCH  /escalation-policies/{id}
POST   /escalation-policies/{id}/pause
POST   /escalation-policies/{id}/resume
POST   /escalation-policies/{id}/test
```

Testing an escalation policy must use a sandbox or explicit test recipient.

# 20.26 Database Model

Core tables:

```
notifications
notification_templates
notification_preferences
notification_delivery_attempts
notification_endpoints
notification_digests
notification_suppression_rules

communication_consents
external_channels
external_channel_verifications

schedules
schedule_occurrences
schedule_exceptions

escalation_policies
escalation_steps
escalation_executions
escalation_acknowledgements

provider_accounts
provider_credentials
provider_webhook_events
provider_rate_limits
```

## 20.26.1 Important Indexes

```
notifications(account_id, created_at)
notifications(account_id, read_at)
notifications(status, scheduled_for)
notification_delivery_attempts(notification_id)
schedule_occurrences(status, scheduled_for)
escalation_executions(status, next_action_at)
communication_consents(account_id, channel, status)
notification_endpoints(account_id, platform, revoked_at)
```

Provider credentials must not be stored in ordinary application tables without encryption and access restrictions.

# 20.27 Android Screens

## 20.27.1 Notification Screens

* Notification inbox

* Unread notification list

* Notification detail

* Notification preferences

* Quiet hours

* Per-group notification settings

* Per-conversation notification settings

* Push permission screen

* External channel setup

* WhatsApp consent screen

* Voice-call consent screen

* Trusted-contact settings

* Escalation policy screen

* Reminder acknowledgement screen

## 20.27.2 Notification UX States

Every notification should support:

* Loading

* Delivered

* Read

* Suppressed

* Failed

* Retry available

* Consent required

* Permission required

* Expired

The user should understand why a notification was not sent.

Example:

```
WhatsApp reminder not sent.
Reason: WhatsApp permission is disabled.
```

# 20.28 Web/Desktop Screens

Recommended routes:

```
/notifications
/settings/notifications
/settings/communication
/settings/quiet-hours
/settings/external-channels
/resources/{id}/notifications
/resources/{id}/escalations
/resources/{id}/reminders
```

For administrators:

* Delivery dashboard

* Failed notifications

* Retry queue

* Escalation timeline

* Provider status

* Consent audit

* Notification template management

* Rate-limit dashboard

* Suppression reasons

Administrative screens must hide message content unless the administrator is explicitly authorized to view it.

# 20.29 Security and Privacy

## 20.29.1 Threats

* Notification spam

* External-channel abuse

* Consent bypass

* Provider credential theft

* Phone-number enumeration

* Sensitive push previews

* Fake escalation

* Agent-triggered harassment

* Repeated voice calls

* Malicious webhook injection

* Template injection

* Provider account takeover

* Unauthorized recipient resolution

* Cross-group notification leakage

## 20.29.2 Required Controls

* Explicit consent

* Channel verification

* Per-user rate limits

* Per-resource rate limits

* Per-agent rate limits

* Provider quotas

* Template allowlists

* Destination validation

* Webhook signature verification

* Encrypted provider credentials

* Audit logs

* Quiet hours

* Opt-out support

* Abuse detection

* External-channel kill switch

* Sensitive-content redaction

* Re-authentication for channel linking

* Idempotency

* Retry limits

## 20.29.3 External Communication Kill Switch

The platform must support emergency disabling of:

* All WhatsApp delivery

* All voice calls

* All SMS

* One provider

* One resource

* One agent

* One notification category

This is required for:

* Provider incidents

* Credential exposure

* Abuse

* Misconfiguration

* Unexpected cost

* Regulatory or policy concerns

# 20.30 Agent Integration

Agents may request notifications through tools.

Example tools:

```
notification.create
notification.preview
notification.cancel
notification.schedule
notification.acknowledge
escalation.create
escalation.pause
escalation.cancel
communication_consent.check
```

## 20.30.1 Agent Tool Rules

Before an agent creates a notification:

1. Validate resource access.

2. Validate recipient.

3. Validate channel.

4. Check consent.

5. Check category policy.

6. Check quiet hours.

7. Check rate limits.

8. Check whether approval is required.

9. Render an approved template.

10. Create an auditable notification command.

Agents must not:

* Invent phone numbers

* Contact arbitrary users

* Bypass quiet hours

* Mark normal messages as critical

* Change consent

* Enable WhatsApp without approval

* Escalate indefinitely

* Send private content to group members

* Repeatedly call a recipient after opt-out

# 20.31 Observability and Metrics

## 20.31.1 Delivery Metrics

* Notification creation rate

* Queue delay

* Provider acceptance rate

* Delivery rate

* Read rate

* Failure rate

* Retry rate

* Suppression rate

* Expiration rate

* Average delivery latency

* Provider webhook latency

## 20.31.2 Channel Metrics

* Push success rate

* Email bounce rate

* SMS delivery rate

* WhatsApp delivery rate

* Voice answer rate

* Voice no-answer rate

* Provider error rate

* Provider cost

* Provider quota usage

## 20.31.3 Escalation Metrics

* Escalations created

* Escalations acknowledged

* Average acknowledgement time

* Escalations reaching final step

* Escalations cancelled

* Consent-related suppression

* False escalation reports

* Admin intervention rate

## 20.31.4 Privacy Metrics

* Sensitive notification redactions

* Consent checks

* Consent failures

* External-channel opt-outs

* Unauthorized delivery attempts

* Provider credential access

* Notification content policy violations

# 20.32 Failure Handling

## 20.32.1 Provider Outage

When a provider fails:

1. Detect elevated error rate.

2. Open circuit breaker.

3. Stop immediate retries.

4. Route only to approved fallback providers.

5. Preserve notification state.

6. Notify administrators.

7. Reconcile provider status later.

Fallback must not violate consent or sensitivity policy.

## 20.32.2 Invalid Destination

If a phone number or email is invalid:

* Mark endpoint invalid

* Stop retries

* Ask user to update it

* Do not automatically use another destination

* Preserve in-app delivery where permitted

## 20.32.3 Consent Revoked During Delivery

If consent is revoked:

* Cancel queued delivery

* Stop future retries

* Attempt provider cancellation if supported

* Mark status as suppressed or cancelled

* Preserve audit event

## 20.32.4 Duplicate Notification

Use:

* Notification ID

* Idempotency key

* Unique occurrence key

* Provider idempotency support

* Consumer deduplication

A retry must not produce multiple external messages.

## 20.32.5 Escalation Loop

Protect against loops with:

* Maximum steps

* Maximum attempts

* Maximum duration

* Per-recipient cooldown

* Per-resource limits

* Stop conditions

* Manual cancellation

* Agent run limits

# 20.33 Repository Structure

```
platform/
├── backend/
│   ├── notifications/
│   │   ├── commands/
│   │   ├── templates/
│   │   ├── preferences/
│   │   ├── consent/
│   │   ├── recipient_resolution/
│   │   ├── policy_engine/
│   │   ├── scheduling/
│   │   ├── delivery/
│   │   ├── retries/
│   │   ├── suppression/
│   │   ├── escalation/
│   │   ├── audit/
│   │   └── analytics/
│   │
│   ├── providers/
│   │   ├── push/
│   │   ├── email/
│   │   ├── sms/
│   │   ├── whatsapp/
│   │   └── voice/
│   │
│   ├── workers/
│   │   ├── notification_dispatch/
│   │   ├── scheduled_occurrences/
│   │   ├── delivery_reconciliation/
│   │   ├── escalation_engine/
│   │   └── provider_webhooks/
│   │
│   └── migrations/
│
├── apps/
│   ├── android/
│   │   ├── feature-notifications/
│   │   ├── feature-reminders/
│   │   ├── feature-consent/
│   │   ├── feature-external-channels/
│   │   └── feature-escalations/
│   │
│   └── web/
│       ├── notifications/
│       ├── preferences/
│       ├── external-channels/
│       ├── reminders/
│       └── escalations/
│
└── packages/
    ├── notification-contracts/
    ├── provider-contracts/
    ├── template-schemas/
    ├── consent-types/
    └── event-schemas/
```

# 20.34 Final Architecture Decision

The notification and communication system will use these decisions:

1. Notification delivery is separate from agent reasoning.

2. Agents create structured notification commands, not unrestricted provider calls.

3. A centralized policy engine evaluates consent, preferences, privacy, and rate limits.

4. In-app notifications are the durable source of notification history.

5. Push notifications are wake-up and delivery hints, not the source of truth.

6. External providers are accessed through adapters.

7. Provider-specific logic is isolated from the domain layer.

8. Email, SMS, WhatsApp, and voice calls require channel-specific policies.

9. External communication requires explicit consent and verified destinations.

10. Sensitive content is redacted from push, SMS, email, WhatsApp, and voice workflows by default.

11. Quiet hours are timezone-aware.

12. Notification templates are versioned, localized, and schema-validated.

13. Delivery attempts are idempotent and bounded by retry policies.

14. Provider webhooks are authenticated and deduplicated.

15. Escalation is a bounded state machine with clear stop conditions.

16. Medicine reminders preserve confirmed information and do not infer medical instructions.

17. Agents cannot independently assign critical priority or bypass consent.

18. External communication can be disabled globally, by provider, by resource, or by agent.

19. Notification delivery is asynchronous and independently scalable.

20. The initial implementation should support in-app, push, and email first.

21. SMS, WhatsApp, and voice should be added through the same provider abstraction.

22. All external communication actions must be auditable.

23. Notification content must never be logged in plaintext when sensitive.

24. Cost and provider quota tracking are required before enabling large-scale external delivery.

25. The scheduler and escalation engine must operate reliably even when the LLM is unavailable.

# 20.35 Acceptance Criteria

The system is complete when:

* Notifications can be created, scheduled, delivered, read, suppressed, and cancelled.

* In-app notification history is durable.

* Push delivery supports multiple devices.

* Email delivery supports verification, recovery, and optional reminders.

* Provider adapters isolate external service dependencies.

* Consent is checked before external delivery.

* Users can configure notification categories and channels.

* Quiet hours work using the recipient’s timezone.

* Sensitive content is redacted.

* WhatsApp integration uses verified destinations and explicit consent.

* Voice calls have attempt limits and opt-out support.

* Escalation policies have bounded steps and stop conditions.

* Notification retries are idempotent.

* Provider webhooks are verified and deduplicated.

* Invalid destinations are disabled safely.

* External providers can be disabled through a kill switch.

* Agent notification tools enforce authorization and policy.

* Medicine reminders do not change or infer dosage.

* Delivery metrics and provider costs are observable.

* Failed notifications can be investigated and safely retried.

* Android and web clients expose notification and consent controls.

* Notification data is protected by resource-level authorization.

* The system continues operating when the LLM or one provider is unavailable.