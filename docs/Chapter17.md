# Chapter 17 — Events, Polls, Contributions, Collaborative Planning, Shared Budgets, Tasks, and Community Workspaces

## 17.1 Purpose and Scope

This chapter defines the event and collaborative-workspace architecture for public communities, private family groups, couple spaces, solo spaces, custom groups, and temporary event communities.

The system supports:

* Public and private events

* Festival planning

* Family functions

* Meetings

* Trips

* Community gatherings

* Group polls

* Shared budgets

* Contributions

* Expense tracking

* Task assignment

* Checklists

* Schedules

* Shared documents

* Event discussions

* Attendance management

* Invitations

* Reminders

* Agent-assisted planning

* Approval workflows

* Event-specific permissions

* Event cancellation and recovery

The event system must function independently of the AI agent. The agent assists through authorized tools but does not become the source of truth for event data.

# 17.2 Core Architectural Principles

## Principle 1: Event Data Is Structured

Important event information must be stored in structured fields.

Examples:

* Date

* Time

* Timezone

* Location

* Organizer

* Attendees

* Tasks

* Budget

* Contributions

* Poll results

* Deadlines

* Consent

* Notification preferences

The agent may generate drafts, but confirmed event data must be stored in the event domain.

## Principle 2: Agent Suggestions Are Not Confirmed Facts

The agent may suggest:

* A date

* A venue

* A budget

* A task list

* A contribution target

* A reminder

* A schedule

The system must distinguish:

```
SUGGESTED
DRAFT
PROPOSED
PENDING_APPROVAL
CONFIRMED
CANCELLED
COMPLETED
```

The agent must not present a proposal as confirmed.

## Principle 3: Financial Actions Require Explicit Confirmation

The platform may support:

* Budget planning

* Contribution pledges

* Expense recording

* Balance calculations

* Payment status tracking

Actual money movement requires a separate payment integration and explicit user confirmation.

The agent must not:

* Transfer money autonomously

* Change a contribution amount without approval

* Mark a payment as completed without evidence

* Expose one member’s financial information to unauthorized members

## Principle 4: Event Time Must Be Timezone-Aware

Store:

* UTC timestamps for system processing

* Original timezone identifier

* Local date and time

* Recurrence or schedule rules

* User display timezone where relevant

Example:

```
event_timezone = Asia/Kolkata
starts_at_utc = 2026-09-20T10:30:00Z
local_start = 2026-09-20 16:00
```

The system must not rely only on a fixed UTC offset because daylight-saving rules may change.

# 17.3 Event Types

## Public Events

Visible through discovery and search.

Examples:

* Public festival

* Community meetup

* Educational session

* Public cultural event

* Open volunteer activity

Public events must still support:

* Visibility settings

* Organizer controls

* Moderation

* Attendance privacy

* Location privacy

* Approval requirements

## Private Group Events

Visible only to authorized members of a group.

Examples:

* Family function

* Private birthday

* Group trip

* Couple planning

* Private meeting

Private events must not appear in:

* Global search

* Public recommendations

* Public trending

* Public autocomplete

* Unrelated agent retrieval

## Personal Events

Owned by one user.

Examples:

* Personal task

* Solo plan

* Private appointment

* Personal reminder

* Individual goal

Personal events may be shared selectively.

## Temporary Events

Created for a limited period.

Examples:

* Festival coordination

* Short-term project

* Trip planning

* Emergency coordination

* One-day gathering

Temporary events should have:

* Start date

* End date

* Auto-archive policy

* Membership expiry

* Data-retention policy

## Recurring Events

Examples:

* Weekly family meeting

* Monthly community gathering

* Daily group activity

* Repeated volunteer event

Recurring events should use a recurrence rule rather than creating unrelated records manually.

# 17.4 Event Lifecycle

```
DRAFT
  ↓
PROPOSED
  ↓
PENDING_APPROVAL
  ↓
PUBLISHED
  ↓
OPEN_FOR_REGISTRATION
  ↓
IN_PROGRESS
  ↓
COMPLETED
  ↓
ARCHIVED
```

Alternative states:

```
DRAFT → CANCELLED
PUBLISHED → POSTPONED
PUBLISHED → CANCELLED
PUBLISHED → PRIVATE
PUBLISHED → QUARANTINED
COMPLETED → ARCHIVED
```

## State Rules

### Draft

Only authorized users can view or edit.

### Proposed

The event exists as a proposal and may be shown to selected members.

### Pending Approval

Required organizers or group admins must approve.

### Published

The event is available according to visibility rules.

### Open for Registration

Users can respond or register.

### In Progress

The event has started.

### Completed

The event has ended.

### Archived

The event is retained according to policy but is no longer active.

# 17.5 Event Ownership and Roles

## Event Roles

```
OWNER
ORGANIZER
CO_ORGANIZER
MODERATOR
FINANCE_MANAGER
TASK_MANAGER
ATTENDEE
INVITEE
VOLUNTEER
VIEWER
```

## Permission Examples

|
Permission

|

Owner

|

Organizer

|

Finance manager

|

Attendee

|
| --- | --- | --- | --- | --- |
|

Edit event details

|

Yes

|

Yes

|

No

|

No

|
|

Cancel event

|

Yes

|

Configurable

|

No

|

No

|
|

Manage attendees

|

Yes

|

Yes

|

No

|

No

|
|

Create tasks

|

Yes

|

Yes

|

No

|

No

|
|

Manage budget

|

Yes

|

Configurable

|

Yes

|

No

|
|

Record expenses

|

Yes

|

Configurable

|

Yes

|

No

|
|

Create polls

|

Yes

|

Yes

|

No

|

Configurable

|
|

View private budget data

|

Yes

|

Configurable

|

Yes

|

No

|
|

Invite members

|

Yes

|

Configurable

|

No

|

No

|
|

Manage event agents

|

Yes

|

Configurable

|

No

|

No

|

Permissions must be resource-scoped.

A finance manager for one event must not automatically gain access to all group finances.

# 17.6 Event Visibility

Supported visibility values:

```
PUBLIC
GROUP_MEMBERS
INVITE_ONLY
SELECTED_MEMBERS
FOLLOWERS
PRIVATE
UNLISTED
TEMPORARY_SHARE
```

## Location Visibility

Location should have a separate visibility setting.

```
EXACT_LOCATION
APPROXIMATE_LOCATION
CITY_ONLY
HIDDEN_UNTIL_APPROVED
HIDDEN_UNTIL_ATTENDING
PRIVATE
```

For sensitive events, show:

* City

* General area

* Venue category

* Meeting point only after confirmation

Do not expose exact locations by default for private or sensitive events.

# 17.7 Event Data Model

## `events`

```
id
owner_id
space_id
page_id
title
description
event_type
visibility
status
timezone
starts_at_utc
ends_at_utc
local_start_date
local_start_time
location_visibility
location_id
virtual_meeting_url_reference
capacity
registration_required
approval_required
created_by
created_at
updated_at
published_at
cancelled_at
archived_at
version
```

## `event_locations`

```
id
event_id
location_type
address_reference
city
region
country
latitude_encrypted
longitude_encrypted
display_label
visibility
created_at
updated_at
```

Exact coordinates must be encrypted and access-controlled.

## `event_roles`

```
event_id
user_id
role
permissions
assigned_by
created_at
revoked_at
```

## `event_attendees`

```
id
event_id
user_id
status
response
guest_count
checked_in_at
registered_at
updated_at
```

Possible responses:

```
GOING
MAYBE
NOT_GOING
WAITLISTED
PENDING
```

## `event_invitations`

```
id
event_id
inviter_id
invitee_id
channel
status
expires_at
created_at
accepted_at
```

# 17.8 Event Creation Workflow

```
Select Create Event
  ↓
Choose Event Type
  ↓
Enter Basic Details
  ↓
Select Date and Time
  ↓
Select Timezone
  ↓
Configure Visibility
  ↓
Configure Attendees
  ↓
Configure Budget and Tasks
  ↓
Review
  ↓
Save Draft or Publish
```

## Required Validation

* Title is not empty.

* Start time is valid.

* End time is after start time.

* Timezone is valid.

* Visibility is compatible with the parent space.

* Organizer has permission.

* Exact location requires appropriate access.

* Capacity is positive when provided.

* Registration settings are consistent.

* Public events pass moderation checks.

# 17.9 Event Agent Integration

The event agent should operate through tools.

## Event Tools

```
event.create_draft
event.get
event.update_draft
event.propose_schedule
event.propose_location
event.publish
event.cancel
event.postpone
event.list_attendees
event.send_invitation
event.create_poll
event.create_task
event.create_budget
event.calculate_estimate
event.create_reminder
event.summarize_discussion
event.generate_checklist
event.request_approval
```

Each tool requires:

* Agent identity

* Event scope

* Permission check

* Input validation

* Risk classification

* Audit event

* Idempotency key

# 17.10 Agent Event Workflow

Example: planning a festival.

```
User:
"Help us plan the festival."

  ↓

Agent:
Collects requirements

  ↓

Agent:
Creates planning draft

  ↓

Agent:
Suggests date, tasks, budget, and roles

  ↓

Members:
Review proposals

  ↓

Poll:
Members select preferred date

  ↓

Agent:
Summarizes results

  ↓

Organizer:
Confirms date and budget

  ↓

System:
Creates confirmed event schedule

  ↓

Scheduler:
Creates reminders

  ↓

Notification Service:
Sends approved notifications
```

The agent must not finalize the event based solely on conversational agreement if the platform requires formal organizer approval.

# 17.11 Event Discussions

Each event may have:

* Main discussion

* Announcement thread

* Task discussion

* Budget discussion

* Poll discussion

* Attendance discussion

* Private organizer discussion

Sensitive discussions should have separate visibility.

Example:

```
Public event:
Public announcement + public discussion

Private event:
Member discussion + organizer-only budget discussion
```

## Discussion Data

```
event_id
conversation_id
visibility
allowed_roles
created_at
```

# 17.12 Poll Architecture

Polls support collective decisions.

## Poll Types

* Single-choice

* Multiple-choice

* Ranked choice

* Yes/no

* Date selection

* Time selection

* Budget preference

* Anonymous poll

* Approval poll

* Availability poll

## Poll Configuration

```
question
description
options
selection_limit
anonymous
allow_change_vote
show_results_before_close
requires_membership
start_at
close_at
eligibility_rule
```

# 17.13 Poll Lifecycle

```
DRAFT
  ↓
OPEN
  ↓
CLOSED
  ↓
RESULTS_FINALIZED
  ↓
ARCHIVED
```

## Poll Rules

* A user may vote only if eligible.

* Duplicate votes must be prevented.

* Vote changes must be controlled.

* Anonymous votes must not expose voter identity.

* Poll results must respect visibility.

* Closed polls cannot be edited without creating a new version.

* Deleted users’ votes must follow documented retention rules.

# 17.14 Poll Data Model

## `polls`

```
id
event_id
space_id
creator_id
question
description
poll_type
anonymous
status
starts_at
closes_at
allow_vote_change
show_results_before_close
created_at
updated_at
```

## `poll_options`

```
id
poll_id
label
position
metadata
```

## `poll_votes`

```
id
poll_id
option_id
voter_id_hash
created_at
updated_at
```

For non-anonymous polls, the system may store the authorized voter identity. For anonymous polls, use a privacy-preserving design that prevents ordinary users and moderators from linking votes to individuals.

# 17.15 Shared Budget Architecture

The shared budget system supports planning and accounting, not autonomous financial transfers.

## Budget Features

* Estimated budget

* Approved budget

* Actual expenses

* Contributions

* Pledges

* Outstanding amounts

* Categories

* Attachments

* Receipts

* Approval status

* Currency conversion

* Member-level visibility

* Settlement tracking

## Budget Categories

```
VENUE
FOOD
DECORATION
TRANSPORT
EQUIPMENT
GIFTS
MUSIC
SECURITY
CLEANING
DOCUMENTATION
MISCELLANEOUS
```

# 17.16 Budget Lifecycle

```
DRAFT
  ↓
PROPOSED
  ↓
APPROVED
  ↓
ACTIVE
  ↓
RECONCILIATION
  ↓
CLOSED
```

## Budget Rules

* Only authorized users can approve a budget.

* Every modification creates an audit event.

* Actual expenses require a creator and timestamp.

* Receipts may be attached.

* Currency must be explicit.

* Estimates must be labeled as estimates.

* Calculations must be deterministic.

* Agent-generated totals must be verified by the backend.

# 17.17 Budget Data Model

## `budgets`

```
id
event_id
space_id
currency
estimated_total
approved_total
actual_total
status
created_by
approved_by
approved_at
created_at
updated_at
```

## `budget_categories`

```
id
budget_id
name
estimated_amount
approved_amount
actual_amount
position
created_at
updated_at
```

## `expenses`

```
id
budget_id
category_id
created_by
amount
currency
description
expense_date
receipt_file_id
approval_status
approved_by
created_at
updated_at
```

## `contributions`

```
id
budget_id
contributor_id
target_amount
pledged_amount
received_amount
currency
status
visibility
created_at
updated_at
```

Possible contribution states:

```
NOT_REQUESTED
REQUESTED
PLEDGED
PARTIALLY_RECEIVED
RECEIVED
CANCELLED
REFUNDED
```

# 17.18 Contribution Privacy

Financial visibility must be configurable.

## Visibility Options

```
OWNER_ONLY
FINANCE_MANAGERS
ALL_EVENT_MEMBERS
CONTRIBUTOR_ONLY
AGGREGATE_ONLY
```

Example:

A group may see:

```
Total target: ₹50,000
Collected: ₹32,000
Remaining: ₹18,000
```

without seeing each person’s contribution.

The system must not expose:

* Bank details

* Payment credentials

* Full transaction identifiers

* Private financial notes

* Unapproved contribution information

# 17.19 Payment Integration Boundary

The core event system should use a payment abstraction.

```
Payment Request
  ↓
Payment Provider Adapter
  ↓
Provider Result
  ↓
Webhook Verification
  ↓
Payment Ledger
  ↓
Contribution Status
```

The platform should distinguish:

```
PLEDGE
PAYMENT_INITIATED
PAYMENT_CONFIRMED
PAYMENT_FAILED
REFUND_PENDING
REFUNDED
```

The agent may:

* Explain contribution status

* Remind a user

* Summarize totals

* Prepare a payment request

The agent must not independently initiate or confirm sensitive financial operations without the required approval and provider confirmation.

# 17.20 Task and Checklist Architecture

Tasks support event execution.

## Task Types

* General task

* Shopping item

* Volunteer task

* Approval task

* Document task

* Venue task

* Food task

* Transport task

* Reminder task

* Follow-up task

* Financial task

## Task Fields

```
id
event_id
space_id
title
description
status
priority
assignee_id
created_by
due_at
timezone
dependency_ids
checklist_items
attachment_ids
approval_required
created_at
updated_at
completed_at
```

## Task Status

```
BACKLOG
TODO
IN_PROGRESS
BLOCKED
WAITING_APPROVAL
DONE
CANCELLED
```

# 17.21 Task Dependencies

Tasks may depend on other tasks.

Example:

```
Choose venue
  ↓
Confirm venue
  ↓
Book transport
  ↓
Finalize schedule
```

The system must prevent:

* Circular dependencies

* Invalid task references

* Completing blocked tasks without override

* Unauthorized reassignment

# 17.22 Collaborative Workspace

Each event may contain a workspace.

## Workspace Modules

* Overview

* Schedule

* Tasks

* Budget

* Contributions

* Polls

* Files

* Discussions

* Attendees

* Announcements

* Agent

* Activity history

## Workspace Layout

```
Event Header
  ↓
Summary and Status
  ↓
Tabs:
Overview | Schedule | Tasks | Budget | Polls | Files | Chat | Agent
```

The workspace should adapt to the event type.

For a family function:

* Attendees

* Food

* Budget

* Tasks

* Reminders

For a public meetup:

* Registration

* Location

* Announcements

* Schedule

* Moderation

For a trip:

* Transport

* Accommodation

* Packing checklist

* Shared expenses

* Itinerary

# 17.23 Event Files

Event files may include:

* Invitations

* Posters

* Receipts

* Maps

* Schedules

* Documents

* Vendor quotations

* Checklists

* Photos

* Meeting notes

Every file must inherit or explicitly define visibility.

```
PRIVATE_EVENT
EVENT_MEMBERS
ORGANIZERS_ONLY
FINANCE_MANAGERS
PUBLIC_EVENT
SELECTED_ATTENDEES
```

The RAG system must apply event permissions before retrieving file content.

# 17.24 Event Notifications

Notifications may include:

* Event created

* Invitation received

* Invitation accepted

* Event date changed

* Event cancelled

* Poll opened

* Poll closing soon

* Task assigned

* Task overdue

* Budget approved

* Contribution requested

* Contribution received

* Location updated

* Event starting soon

* Event completed

* Post-event survey

Sensitive notifications should contain minimal information.

Example:

```
"An update is available in your private event."
```

rather than exposing private details on a lock screen.

# 17.25 Reminder Rules

Reminder creation must support:

* Event-relative reminders

* Fixed-time reminders

* Task deadlines

* Poll closing reminders

* Contribution reminders

* Attendee reminders

* Organizer reminders

* Repeated reminders

* Quiet hours

* Channel preferences

Example:

```
Event starts:
2026-09-20 18:00 Asia/Kolkata

Reminder:
24 hours before
2 hours before
30 minutes before
```

The scheduler must generate deterministic occurrence IDs to prevent duplicate notifications.

# 17.26 Event Cancellation and Postponement

Cancellation requires:

* Authorized organizer

* Optional confirmation

* Reason category

* Attendee notification

* Task handling

* Budget handling

* Contribution handling

* Calendar synchronization

* Agent run cancellation

* Audit record

## Cancellation Effects

```
Event Cancelled
  ↓
Stop Future Reminders
  ↓
Notify Attendees
  ↓
Close Registration
  ↓
Pause Event Tasks
  ↓
Mark Pending Expenses
  ↓
Handle Contributions
  ↓
Update Calendar
  ↓
Archive or Retain Workspace
```

Postponement should preserve the event identity while creating a schedule revision.

# 17.27 Event Versioning

Important changes must create versions.

Versioned fields include:

* Date

* Time

* Location

* Capacity

* Visibility

* Budget

* Registration policy

* Organizer

* Schedule

* Event description

Example:

```
Version 1:
September 20, 6 PM

Version 2:
September 21, 5 PM

Version 3:
September 21, 6 PM
```

Users should be able to see:

* What changed

* Who changed it

* When it changed

* Whether approval was required

* Whether notifications were sent

# 17.28 Event APIs

## Create Event

http

```
POST /v1/events
```

## Get Event

http

```
GET /v1/events/{event_id}
```

## Update Event

http

```
PATCH /v1/events/{event_id}
```

## Publish Event

http

```
POST /v1/events/{event_id}/publish
```

## Cancel Event

http

```
POST /v1/events/{event_id}/cancel
```

## Register or Respond

http

```
POST /v1/events/{event_id}/attendance
```

## Invite Member

http

```
POST /v1/events/{event_id}/invitations
```

## Create Poll

http

```
POST /v1/events/{event_id}/polls
```

## Vote

http

```
POST /v1/polls/{poll_id}/votes
```

## Create Task

http

```
POST /v1/events/{event_id}/tasks
```

## Create Budget

http

```
POST /v1/events/{event_id}/budgets
```

## Record Expense

http

```
POST /v1/budgets/{budget_id}/expenses
```

## Request Contribution

http

```
POST /v1/budgets/{budget_id}/contributions
```

## Get Event Activity

http

```
GET /v1/events/{event_id}/activity
```

All write operations require:

* Authorization

* Validation

* Idempotency

* Version checks

* Audit events

* Conflict handling

# 17.29 Event Realtime Events

```
event.created
event.updated
event.published
event.postponed
event.cancelled
event.attendee.joined
event.attendee.updated
event.poll.opened
event.poll.closed
event.poll.vote_recorded
event.task.created
event.task.updated
event.task.completed
event.budget.updated
event.expense.recorded
event.contribution.updated
event.file.attached
event.announcement.created
```

Clients should use sequence numbers and event cursors.

# 17.30 Conflict Resolution

Conflicts may occur when multiple members edit:

* Event date

* Budget

* Task assignment

* Poll settings

* Attendee status

* Event location

## Conflict Strategies

### Last-Write-Wins

Suitable for:

* Non-critical descriptions

* Draft notes

* UI preferences

### Version Check

Suitable for:

* Date changes

* Budget approval

* Event cancellation

* Visibility changes

### Explicit Approval

Suitable for:

* Final event date

* Major budget changes

* Public publication

* External invitations

* Financial actions

Example:

```
Client sends:
version = 4

Server version:
version = 5

Result:
409 Conflict

Client:
Refreshes latest version and asks user to resolve
```

# 17.31 Android Screens

## Event Screens

* Event discovery

* Event detail

* Create event

* Edit event

* Event preview

* Attendee list

* Invitation management

* Calendar view

* Event schedule

* Task board

* Budget dashboard

* Expense form

* Contribution status

* Poll list

* Poll voting

* Event files

* Event discussion

* Event agent

* Event activity history

* Cancellation confirmation

* Event archive

## Event Agent Screen

The agent interface should show:

* Current event context

* Suggested actions

* Draft changes

* Pending approvals

* Tasks

* Budget calculations

* Evidence references

* Tool execution status

* Errors

* Confirmation requirements

# 17.32 Web/Desktop Screens

## Event Workspace

```
Header:
Title, date, status, organizer

Main Navigation:
Overview
Schedule
Tasks
Budget
Contributions
Polls
Files
Discussion
Agent
Activity

Right Panel:
Attendees
Upcoming reminders
Pending approvals
```

## Organizer Controls

* Publish

* Edit

* Postpone

* Cancel

* Manage attendees

* Assign roles

* Approve budget

* Export authorized event data

* Archive event

## Moderator Controls

* Review reports

* Restrict event

* Hide event

* Review organizer history

* Apply event-level enforcement

# 17.33 Event Metrics

## Product Metrics

* Events created

* Events published

* Event completion rate

* Registration conversion

* Attendance rate

* Poll participation

* Task completion

* Budget completion

* Contribution completion

* Event cancellation rate

* Repeat organizers

* Agent-assisted planning rate

## Reliability Metrics

* Event creation latency

* Notification delay

* Calendar sync delay

* Duplicate reminder rate

* Task update latency

* Poll vote failure rate

* Budget calculation error rate

* Realtime event delay

* Conflict rate

* Queue backlog

## Safety Metrics

* Reported events

* Restricted events

* Fraud reports

* Suspicious contribution activity

* Unauthorized invitation attempts

* Location privacy incidents

* Organizer abuse cases

# 17.34 Failure Handling

## Event Creation Failure

* Keep local draft on the client.

* Retry with the same idempotency key.

* Do not create duplicate events.

* Show a clear retry state.

## Notification Failure

* Retry through provider adapter.

* Respect provider rate limits.

* Use fallback channels only with consent.

* Record delivery status.

## Calendar Failure

* Preserve event state.

* Mark synchronization as pending.

* Retry using provider cursor and idempotency.

* Do not duplicate calendar entries.

## Poll Vote Failure

* Keep vote pending locally.

* Retry safely.

* Prevent duplicate votes.

* Show final server status.

## Budget Calculation Failure

* Use deterministic backend calculation.

* Show unavailable status rather than inventing totals.

* Preserve submitted expense records.

* Recompute after recovery.

## Agent Failure

* Preserve event data.

* Mark agent run failed or paused.

* Do not partially apply unapproved changes.

* Allow resume from checkpoint.

* Show which actions completed.

# 17.35 Security Requirements

* Event access must be checked on every request.

* Invitations must be scoped to event and recipient.

* Attendance visibility must be configurable.

* Exact locations must be encrypted.

* Budget data must be role-protected.

* Anonymous poll votes must remain unlinkable where promised.

* Contribution records must not expose private financial data.

* Files must use event-scoped authorization.

* External invitations require consent.

* Agent tools must be event-scoped.

* Event cancellation requires appropriate permission.

* Calendar tokens must be encrypted.

* Webhook events must be verified.

* Audit logs must record important changes.

* Deleted or private events must be removed from discovery and recommendations.

# 17.36 Repository Structure

```
platform/
├── services/
│   ├── events/
│   │   ├── event_service.py
│   │   ├── event_lifecycle.py
│   │   ├── event_permissions.py
│   │   ├── event_versioning.py
│   │   ├── event_locations.py
│   │   └── event_search.py
│   │
│   ├── attendance/
│   │   ├── registration.py
│   │   ├── invitations.py
│   │   └── waitlist.py
│   │
│   ├── polls/
│   │   ├── poll_service.py
│   │   ├── vote_service.py
│   │   └── result_service.py
│   │
│   ├── budgets/
│   │   ├── budget_service.py
│   │   ├── expense_service.py
│   │   ├── contribution_service.py
│   │   ├── ledger.py
│   │   └── payment_adapters/
│   │
│   ├── tasks/
│   │   ├── task_service.py
│   │   ├── dependency_graph.py
│   │   └── checklist_service.py
│   │
│   ├── workspaces/
│   │   ├── workspace_service.py
│   │   ├── activity_service.py
│   │   └── workspace_permissions.py
│   │
│   └── agents/
│       ├── event_tools.py
│       ├── budget_tools.py
│       ├── poll_tools.py
│       ├── task_tools.py
│       └── approval_workflows.py
│
├── workers/
│   ├── event_notification_worker.py
│   ├── event_reminder_worker.py
│   ├── calendar_sync_worker.py
│   ├── poll_close_worker.py
│   ├── budget_reconciliation_worker.py
│   └── event_archive_worker.py
│
├── apps/
│   ├── android/
│   │   ├── feature-events/
│   │   ├── feature-polls/
│   │   ├── feature-budgets/
│   │   ├── feature-tasks/
│   │   └── feature-event-agent/
│   │
│   └── web/
│       ├── app/events/
│       ├── app/workspaces/
│       ├── app/budgets/
│       ├── app/polls/
│       └── app/moderation/events/
│
├── packages/
│   ├── event-contracts/
│   ├── poll-contracts/
│   ├── budget-contracts/
│   ├── task-contracts/
│   └── event-events/
│
└── tests/
    ├── events/
    ├── attendance/
    ├── polls/
    ├── budgets/
    ├── contributions/
    ├── tasks/
    ├── permissions/
    └── agent-tools/
```

# 17.37 Final Architecture Decision

The event and collaborative-workspace architecture is:

```
Event Domain
  ↓
Event Lifecycle and Permissions
  ↓
Attendance and Invitations
  ↓
Discussion, Polls, Tasks, Files
  ↓
Budget and Contribution Modules
  ↓
Scheduler and Notification Services
  ↓
Agent Tool Layer
  ↓
Approval and Audit Layer
  ↓
Android/Web Workspaces
```

The final decisions are:

* Events are first-class domain objects.

* Event data is structured and versioned.

* The agent creates proposals and executes authorized tools.

* Organizers confirm important changes.

* Public and private events use separate visibility enforcement.

* Polls support collective decisions.

* Budgets use deterministic calculations.

* Contributions are tracked separately from actual payments.

* Payment providers are accessed through adapters.

* Tasks support dependencies and assignments.

* Event files use event-scoped permissions.

* Reminders use the central scheduler.

* Notifications use the central communication system.

* Realtime updates use event contracts and sequence numbers.

* High-impact actions require approvals.

* Event cancellation and postponement are auditable.

* Event workspaces are modular and extensible.

# 17.38 Acceptance Criteria

Chapter 17 is complete when:

* Users can create public, private, personal, and temporary events.

* Event visibility is enforced.

* Events support timezone-aware dates.

* Organizers and co-organizers have scoped permissions.

* Invitations and attendance responses work.

* Events support discussions and announcements.

* Polls support voting and result finalization.

* Anonymous polls protect voter identity as promised.

* Tasks can be assigned and tracked.

* Task dependencies prevent invalid completion.

* Budgets support estimates, approvals, and actual expenses.

* Contributions are tracked separately from payments.

* Financial information is permission-controlled.

* Event files inherit correct visibility.

* Agents can create drafts and suggestions.

* Agents cannot finalize sensitive changes without approval.

* Event reminders use the central scheduler.

* Notifications respect consent and preferences.

* Calendar synchronization is idempotent.

* Event changes are versioned.

* Cancellation and postponement are supported.

* Realtime updates reach authorized clients.

* Android and web workspaces are implemented.

* Event failures do not create duplicate records.

* Budget calculations are deterministic.

* Event activity is auditable.

* Moderation can restrict or remove unsafe events.

* Private event data cannot enter public search or recommendations.
