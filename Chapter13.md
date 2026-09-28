# Chapter 13 — Scheduling, Notifications, External Communications, Medicine Reminders, Calendar Workflows, and Escalation Architecture

# 13.1 Purpose

This chapter defines the architecture for time-based and event-based actions across:

* Personal spaces

* Family groups

* Couple groups

* Solo workspaces

* Custom groups

* Community pages

* Temporary event groups

The system must support:

* One-time reminders

* Recurring reminders

* Shared schedules

* Event countdowns

* Calendar synchronization

* Task deadlines

* Medicine reminder workflows

* Missed-response escalation

* In-app notifications

* Push notifications

* Email

* WhatsApp

* Voice calls

* SMS through approved providers

* Human approval for sensitive actions

The scheduling system must be independent from the agent runtime.

The agent may create or modify a schedule through authorized tools, but the scheduler itself must execute reliably without requiring an LLM to remain active.

# 13.2 Core Architecture

```
User / Agent / Admin
        ↓
Scheduling API
        ↓
Authorization + Consent
        ↓
Schedule Database
        ↓
Scheduler Service
        ↓
Due Job Queue
        ↓
Notification Orchestrator
        ↓
Channel Adapter
        ↓
Provider
        ↓
Delivery Status
        ↓
Retry / Escalation / Audit
```

The agent is responsible for:

* Understanding natural-language requests

* Preparing a schedule

* Asking for missing information

* Creating a draft

* Requesting approval

The scheduling service is responsible for:

* Time calculations

* Recurrence

* Time zones

* Due-job detection

* Delivery attempts

* Retry rules

* Escalation

* Execution history

# 13.3 Scheduling Principles

## 13.3.1 Store time in UTC, preserve the user’s time zone

Every schedule must store:

```
timezone
local_time
UTC execution time
recurrence rule
daylight-saving behavior
```

Example:

JSON

```
{
  "local_time": "19:00",
  "timezone": "Asia/Kolkata",
  "recurrence": "FREQ=DAILY"
}
```

Do not store only:

```
19:00
```

Without a time zone, the schedule becomes ambiguous.

## 13.3.2 Recurring schedules must use calendar semantics

Avoid calculating recurring events as:

```
last_execution + 24 hours
```

That approach fails with:

* Daylight-saving changes

* Month boundaries

* Calendar-specific recurrence

* Missed executions

* Time-zone changes

Use recurrence rules such as:

```
FREQ=DAILY
FREQ=WEEKLY;BYDAY=MO,WE,FR
FREQ=MONTHLY;BYMONTHDAY=1
```

## 13.3.3 Schedules must be idempotent

A scheduler restart must not create duplicate notifications.

Each occurrence requires a unique execution key:

```
schedule_id + occurrence_start_time
```

Example:

```
schedule_123:2026-09-19T13:30:00Z
```

The database must enforce uniqueness.

# 13.4 Scheduling Domain Model

## 13.4.1 Schedule

Represents the user’s intended recurring or one-time plan.

```
schedule_id
owner_type
owner_id
created_by_user_id
created_by_agent_id
space_id
title
description
schedule_type
timezone
start_at
end_at
recurrence_rule
status
approval_policy
created_at
updated_at
```

Possible schedule types:

```
one_time
recurring
deadline
countdown
event
medicine_reminder
follow_up
escalation
```

Possible statuses:

```
draft
pending_approval
active
paused
completed
cancelled
expired
```

## 13.4.2 Schedule Recipient

```
schedule_recipient_id
schedule_id
user_id
contact_id
delivery_preferences
consent_status
role
is_required
```

Recipients must be resolved at execution time when membership or preferences can change.

## 13.4.3 Schedule Occurrence

An occurrence represents one concrete execution.

```
occurrence_id
schedule_id
scheduled_at_utc
local_date
local_time
timezone
status
attempt_count
last_attempt_at
completed_at
idempotency_key
```

Statuses:

```
pending
leased
processing
sent
partially_sent
failed
skipped
cancelled
expired
```

## 13.4.4 Delivery Attempt

```
delivery_attempt_id
occurrence_id
recipient_id
channel
provider
provider_message_id
status
failure_code
attempt_number
sent_at
delivered_at
read_at
```

This allows the system to distinguish:

* Notification created

* Provider accepted

* Message sent

* Message delivered

* Message read

* Delivery failed

# 13.5 Scheduling Database Tables

Recommended tables:

```
schedules
schedule_recipients
schedule_occurrences
schedule_exceptions
schedule_execution_locks
delivery_attempts
notification_templates
notification_preferences
consents
escalation_policies
escalation_steps
escalation_executions
calendar_connections
calendar_events
```

## 13.5.1 Schedule Exceptions

Recurring schedules need exceptions for:

* Skip one date

* Reschedule one occurrence

* Change recipient

* Change message

* Pause during a period

* Override time for a specific date

Example:

JSON

```
{
  "schedule_id": "schedule_123",
  "exception_date": "2026-09-22",
  "action": "skip",
  "reason": "Holiday"
}
```

Do not modify the entire recurrence rule for a single exception.

# 13.6 Scheduler Service

The scheduler should run continuously as a separate worker service.

## 13.6.1 Scheduler Loop

```
1. Find due schedules
2. Calculate due occurrences
3. Create occurrence records
4. Acquire execution lease
5. Publish occurrence to queue
6. Advance schedule cursor
7. Record scheduler metrics
8. Repeat
```

The scheduler must not send notifications directly.

## 13.6.2 Due-Job Query

Use an indexed query:

SQL

```
SELECT occurrence_id
FROM schedule_occurrences
WHERE status = 'pending'
  AND scheduled_at_utc <= NOW()
ORDER BY scheduled_at_utc
LIMIT 500;
```

Add indexes on:

```
(status, scheduled_at_utc)
(schedule_id, scheduled_at_utc)
(idempotency_key)
```

## 13.6.3 Distributed Execution Lease

For multiple scheduler instances:

```
1. Select due occurrence
2. Lock row or acquire Redis lease
3. Set lease owner
4. Set lease expiration
5. Publish job
6. Release or renew lease
```

A lease must expire automatically if a worker crashes.

# 13.7 Notification Orchestrator

The notification orchestrator chooses the appropriate channel.

```
Occurrence
    ↓
Recipient Resolver
    ↓
Consent Checker
    ↓
Preference Resolver
    ↓
Quiet Hours Check
    ↓
Risk and Approval Check
    ↓
Channel Selection
    ↓
Provider Adapter
    ↓
Delivery Tracking
```

## 13.7.1 Channel Priority

A user may configure:

```
1. In-app
2. Push
3. WhatsApp
4. Email
5. Voice call
```

The priority must not override:

* Consent

* Quiet hours

* Provider restrictions

* Emergency policy

* User opt-out

* Group permissions

## 13.7.2 Channel Selection Rules

Example:

```
If in-app is enabled:
    send in-app notification

If push is enabled and device token is valid:
    send push notification

If WhatsApp is enabled and consent is valid:
    send WhatsApp message

If escalation threshold is reached:
    use approved escalation channel
```

The system should avoid sending the same notification through every channel unless the policy explicitly requires multi-channel delivery.

# 13.8 Notification Types

## 13.8.1 Informational

Examples:

* New community post

* Event update

* Group announcement

* New comment

* Agent completed a task

Usually low risk.

## 13.8.2 Action Required

Examples:

* Approval request

* Task assignment

* Meeting confirmation

* Payment contribution request

* Schedule change

May require acknowledgement.

## 13.8.3 Sensitive

Examples:

* Medicine reminder

* Health-related information

* Private family escalation

* Personal financial details

* Sensitive document notification

Sensitive notifications require:

* Minimal message content

* Recipient validation

* Consent

* Channel restrictions

* Audit logging

## 13.8.4 Critical Escalation

Examples:

* Repeated missed response

* Important family task not acknowledged

* Safety-related configured escalation

* Time-sensitive event failure

The system should not automatically classify a situation as a medical emergency unless an explicit policy and authorized workflow supports that behavior.

# 13.9 Notification Template System

Templates must be versioned.

JSON

```
{
  "template_id": "family_reminder_v2",
  "channel": "whatsapp",
  "language": "en-IN",
  "body": "Reminder: {{event_title}} is scheduled for {{event_time}}.",
  "variables": [
    "event_title",
    "event_time"
  ],
  "version": 2,
  "status": "active"
}
```

Template rendering must:

* Escape unsafe content

* Validate required variables

* Enforce maximum length

* Remove unauthorized data

* Apply localization

* Preserve sensitive-data rules

Do not allow the model to inject arbitrary template markup.

# 13.10 Consent and Contact Preferences

Every external channel requires explicit consent.

## 13.10.1 Consent Record

```
consent_id
user_id
channel
purpose
scope
granted_at
expires_at
revoked_at
source
version
```

Examples of purpose:

```
personal_reminders
family_group_messages
event_updates
medicine_reminders
voice_calls
marketing
```

Consent must be purpose-specific.

Approval to receive event reminders does not automatically authorize medicine-related messages.

## 13.10.2 Contact Preference Record

JSON

```
{
  "user_id": "user_123",
  "preferred_channels": [
    "in_app",
    "push",
    "whatsapp"
  ],
  "quiet_hours": {
    "start": "22:00",
    "end": "07:00",
    "timezone": "Asia/Kolkata"
  },
  "language": "en-IN",
  "allow_voice_calls": false
}
```

## 13.10.3 Group-Level Preferences

A group may define:

* Default reminder channel

* Group quiet hours

* Who can create recurring reminders

* Who can escalate

* Required approval role

* Maximum notification frequency

* Allowed external providers

Individual user preferences must be respected unless a clearly defined, consented exception applies.

# 13.11 Quiet Hours

Quiet hours should be evaluated in the recipient’s time zone.

Possible policies:

```
deliver immediately
delay until quiet hours end
allow only high-priority notifications
require manual approval
skip occurrence
```

Example:

```
Reminder due at 23:00
Recipient quiet hours: 22:00–07:00
Result: Queue for 07:00 unless explicitly marked high priority
```

Do not use the sender’s time zone for every recipient.

# 13.12 Medicine Reminder Architecture

Medicine reminders require additional controls because the system may handle sensitive health information.

The platform should function as a reminder and coordination system, not as an autonomous medical decision-maker.

## 13.12.1 Medicine Record

```
medicine_id
owner_user_id
created_by_user_id
space_id
name
form
strength
dosage_text
route
schedule
start_date
end_date
prescriber_note
image_artifact_id
status
```

Examples of `form`:

```
tablet
capsule
liquid
injection
cream
inhaler
```

Examples of `route`:

```
oral
topical
inhaled
other
```

The system should store the dosage exactly as entered or confirmed.

It should not infer dosage from an image.

## 13.12.2 Medicine Reminder

```
medicine_reminder_id
medicine_id
scheduled_at
timezone
dose_label
recipient_user_id
acknowledgement_required
missed_after_minutes
escalation_policy_id
status
```

Example:

JSON

```
{
  "dose_label": "1 tablet",
  "scheduled_at": "2026-09-19T08:00:00+05:30",
  "acknowledgement_required": true,
  "missed_after_minutes": 30
}
```

The system should display:

* Medicine name

* Confirmed dosage text

* Scheduled time

* User-provided instructions

* Image, if provided

* Reminder acknowledgement controls

## 13.12.3 Medicine Reminder Safety Rules

The system must not:

* Diagnose a condition

* Recommend a new medicine

* Change dosage autonomously

* Infer dosage from an unclear image

* Substitute one medicine for another

* Tell a user to double a missed dose

* Present an unverified OCR result as confirmed

* Contact emergency services automatically without an explicitly designed and authorized process

If the dosage is unclear:

```
The dosage could not be verified. Please confirm it with the prescriber or pharmacist.
```

## 13.12.4 Medicine Reminder Acknowledgement

Possible states:

```
scheduled
notified
acknowledged
snoozed
skipped
missed
escalated
cancelled
```

The user may select:

* Taken

* Snooze

* Skip

* Need help

* Mark as missed

The system should record who made the update and when.

## 13.12.5 Family Medicine Coordination

If a family member is responsible for helping another person:

```
Patient / reminder owner
        ↓
Assigned caregiver
        ↓
Group administrator, if escalation is configured
```

The system must not expose medicine information to all group members by default.

Access should be granted to:

* The person receiving the reminder

* Explicitly assigned caregivers

* Authorized group administrators

* Approved agents with narrow scope

# 13.13 Escalation Architecture

Escalation occurs when an expected response or action does not happen within a configured time.

Examples:

* Family member does not acknowledge a reminder

* Event task remains incomplete

* Group admin approval is pending

* External notification fails

* A scheduled workflow repeatedly fails

## 13.13.1 Escalation Policy

JSON

```
{
  "policy_id": "escalation_123",
  "name": "Family Reminder Escalation",
  "trigger": "no_acknowledgement",
  "initial_wait_minutes": 30,
  "steps": [
    {
      "after_minutes": 30,
      "action": "notify_assigned_caregiver"
    },
    {
      "after_minutes": 60,
      "action": "notify_group_admin"
    }
  ],
  "max_attempts": 2,
  "requires_approval": true
}
```

## 13.13.2 Escalation Steps

Supported actions:

```
send_in_app
send_push
send_email
send_whatsapp
place_voice_call
notify_assigned_caregiver
notify_group_admin
create_admin_task
pause_workflow
request_human_review
```

Every escalation step must define:

* Recipient

* Channel

* Delay

* Consent requirement

* Approval requirement

* Retry limit

* Stop condition

## 13.13.3 Stop Conditions

Escalation must stop when:

* Recipient acknowledges

* User cancels

* Admin resolves the task

* Schedule is cancelled

* Consent is revoked

* Maximum escalation steps are reached

* The configured time window expires

## 13.13.4 Escalation Privacy

Use minimal content.

Instead of:

```
John has not taken his blood pressure medicine.
```

Use:

```
A configured reminder requires your attention.
Open the app for details.
```

The detailed content should be visible only to authorized recipients.

# 13.14 External Communication Adapters

The platform should use a provider abstraction.

```
Notification Service
    ├── InAppAdapter
    ├── PushAdapter
    ├── EmailAdapter
    ├── WhatsAppAdapter
    ├── VoiceAdapter
    └── SmsAdapter
```

Each adapter implements a common contract.

Python

Run

```
from typing import Protocol


class NotificationAdapter(Protocol):
    async def send(
        self,
        recipient: str,
        message: str,
        idempotency_key: str,
    ) -> dict:
        ...
```

## 13.14.1 Provider Adapter Responsibilities

* Provider authentication

* Request formatting

* Rate limiting

* Retry classification

* Error normalization

* Provider message ID capture

* Delivery webhook processing

* Provider health checks

The core platform must not depend on one provider’s proprietary response format.

## 13.14.2 WhatsApp Integration

The WhatsApp adapter should support:

* Approved templates

* Recipient consent

* Provider-specific message rules

* Delivery status webhooks

* Rate limits

* Opt-out handling

* Message deduplication

* Provider failure fallback

Open-source WhatsApp APIs should be isolated behind the adapter layer.

The platform must verify that the chosen provider and deployment method comply with applicable provider terms and local requirements.

## 13.14.3 Voice Calls

Voice calls require stronger safeguards:

* Explicit opt-in

* Call frequency limits

* Quiet-hours enforcement

* Caller identity transparency

* Retry limits

* Call outcome tracking

* Human escalation path

* No misleading automated claims

Call scripts should be approved templates, not unrestricted model-generated speech.

# 13.15 Calendar Integration

The calendar service should support:

* Internal platform calendar

* External calendar connections

* Event creation

* Event updates

* Event cancellation

* Participant invitations

* Reminder synchronization

* Conflict detection

## 13.15.1 Calendar Connection

```
connection_id
user_id
provider
provider_account_id
encrypted_access_token_reference
scopes
status
last_sync_at
```

Tokens must be stored through a secret-management or encrypted-token system.

Do not store provider tokens in ordinary application logs or client local storage.

## 13.15.2 Calendar Event

```
event_id
owner_type
owner_id
created_by_user_id
external_event_id
title
description
start_at
end_at
timezone
location
recurrence_rule
visibility
sync_status
```

## 13.15.3 Calendar Sync

Use a synchronization cursor where the provider supports it.

```
1. Read last sync cursor
2. Request provider changes
3. Apply additions
4. Apply updates
5. Apply deletions
6. Save new cursor
7. Record sync result
```

Handle:

* Duplicate events

* Deleted events

* Conflicting edits

* Time-zone changes

* Token expiration

* Provider rate limits

* Partial synchronization

## 13.15.4 Conflict Handling

If two users edit the same shared event:

```
Detect conflict
    ↓
Compare version numbers
    ↓
Apply conflict policy
    ↓
Notify affected users
    ↓
Request resolution if needed
```

For high-impact changes, do not silently overwrite another user’s edit.

# 13.16 Agent Integration

Agents interact with scheduling through tools.

Recommended tools:

```
schedule.create_draft
schedule.get
schedule.update
schedule.pause
schedule.resume
schedule.cancel
schedule.list
schedule.preview_occurrences
schedule.create_exception
notification.draft
notification.preview
notification.send_approved
escalation.get_status
escalation.resolve
calendar.event.create_draft
calendar.event.update_draft
medicine.reminder.create_draft
medicine.reminder.acknowledge
```

## 13.16.1 Agent Scheduling Flow

```
User: Remind my family every Sunday at 7 PM
        ↓
Agent parses intent
        ↓
Agent asks for missing details
        ↓
Runtime validates group permissions
        ↓
Schedule draft created
        ↓
User reviews
        ↓
User approves
        ↓
Schedule becomes active
        ↓
Scheduler generates occurrences
```

The agent should not silently activate a recurring external communication schedule unless policy explicitly allows it.

# 13.17 Scheduling APIs

## Create Schedule Draft

http

```
POST /v1/schedules/drafts
```

## Preview Occurrences

http

```
POST /v1/schedules/preview
```

## Activate Schedule

http

```
POST /v1/schedules/{schedule_id}/activate
```

## Pause Schedule

http

```
POST /v1/schedules/{schedule_id}/pause
```

## Resume Schedule

http

```
POST /v1/schedules/{schedule_id}/resume
```

## Cancel Schedule

http

```
POST /v1/schedules/{schedule_id}/cancel
```

## List Occurrences

http

```
GET /v1/schedules/{schedule_id}/occurrences
```

## Acknowledge Reminder

http

```
POST /v1/reminders/{reminder_id}/acknowledge
```

## Snooze Reminder

http

```
POST /v1/reminders/{reminder_id}/snooze
```

## Mark Reminder Missed

http

```
POST /v1/reminders/{reminder_id}/missed
```

## Resolve Escalation

http

```
POST /v1/escalations/{escalation_id}/resolve
```

## Notification Delivery History

http

```
GET /v1/notifications/{notification_id}/deliveries
```

# 13.18 Realtime Events

```
schedule.created
schedule.updated
schedule.paused
schedule.resumed
schedule.cancelled
schedule.occurrence_due
reminder.sent
reminder.acknowledged
reminder.snoozed
reminder.missed
escalation.started
escalation.step_executed
escalation.resolved
notification.queued
notification.sent
notification.delivered
notification.failed
calendar.sync_started
calendar.sync_completed
calendar.sync_failed
```

The client should update the UI through event synchronization rather than relying only on local timers.

# 13.19 Android Screens

Recommended screens:

```
SchedulesScreen
ScheduleDetailScreen
CreateScheduleScreen
SchedulePreviewScreen
ReminderScreen
ReminderHistoryScreen
MedicineReminderScreen
MedicineDetailScreen
CaregiverAssignmentScreen
EscalationPolicyScreen
NotificationPreferencesScreen
ConnectedCalendarsScreen
CalendarEventEditorScreen
DeliveryHistoryScreen
ApprovalScreen
```

## Important UI elements

For schedule creation:

* Title

* Date

* Time

* Time zone

* Recurrence

* Recipients

* Channel
* Notes