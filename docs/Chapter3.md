# Chapter 3 — Private Spaces Architecture

## 3.1 Purpose

Private spaces are controlled environments where users can communicate, coordinate activities, store shared information, and interact with an agent without exposing the content to the global community.

The private-space architecture must guarantee:

1. Private content is not publicly discoverable.

2. Membership is explicit.

3. Every action is authorized against the current membership state.

4. Group agents only access approved data.

5. Personal information is not automatically shared with other members.

6. Leaving or removing a member immediately changes access.

7. Messages and tasks remain durable even if realtime delivery fails.

8. Sensitive actions require explicit approval.

9. Public and private data use separate authorization paths.

10. Privacy rules are enforced by the backend, not only by the mobile UI.

# 3.2 Private Space Types

The platform should use one generic `Space` abstraction with specialized policies.

```
Space
├── Family Space
├── Couple Space
├── Solo Space
├── Custom Group Space
└── Temporary Event Space
```

## 3.2.1 Family Space

Designed for:

* Parents and children

* Siblings

* Extended families

* Guardians and dependents

* Household coordination

* Family events

* Shared reminders

* Shared shopping and expenses

* Care coordination

Typical features:

* Family chat

* Family calendar

* Shared tasks

* Medicine reminders

* Appointment reminders

* Event planning

* Shared documents

* Emergency contact information

* Family agent

* Admin escalation

Important rule:

> A family administrator does not automatically receive access to every member’s private conversations, personal memories, health information, or individual agent context.

## 3.2.2 Couple Space

Designed for two people coordinating:

* Personal schedules

* Shared plans

* Travel

* Household tasks

* Expenses

* Events

* Reminders

* Private conversations

* Relationship planning

Core rule:

```
Maximum active human members = 2
```

The space may contain:

* Two human members

* One shared agent

* Optional approved integrations

The couple agent can access shared data but should not access each partner’s private data unless that partner explicitly grants permission.

## 3.2.3 Solo Space

A solo space is a private personal workspace.

It can be used for:

* Personal planning

* Journaling

* Personal tasks

* Reminders

* Private documents

* Personal agent conversations

* Goals

* Habit tracking

* Personal knowledge

* Private memory

Core rule:

```
Active human members = 1
```

A solo space may later create or connect to other spaces, but it should not automatically become a group.

The solo agent can access the user’s personal context according to the user’s permissions.

## 3.2.4 Custom Group Space

Designed for:

* Friends

* Colleagues

* Study groups

* Project teams

* Clubs

* Neighborhood groups

* Volunteer groups

* Interest groups

* Small organizations

Features:

* Flexible membership

* Multiple administrators

* Moderators

* Shared discussions

* Shared files

* Tasks

* Events

* Agent assistance

* Member roles

* Approval workflows

Custom groups should support configurable policies such as:

* Who can invite members

* Who can create posts

* Who can create events

* Who can use the agent

* Whether new members can view old messages

* Whether guests are allowed

* Whether members can export content

## 3.2.5 Temporary Event Space

Temporary spaces are created for a specific event or limited period.

Examples:

* Festival planning

* Birthday

* Wedding

* Trip

* Conference

* Community activity

* Emergency coordination

* Fundraising activity

* Short-term project

Properties:

```
start_time
end_time
auto_archive_at
membership_expiry_policy
```

A temporary event space may automatically transition to:

```
ACTIVE
→ READ_ONLY
→ ARCHIVED
```

The system must not permanently delete event data automatically unless the retention policy explicitly permits it.

# 3.3 Space Lifecycle

Every private space follows a controlled lifecycle.

```
DRAFT
  ↓
PENDING_ACTIVATION
  ↓
ACTIVE
  ↓
LOCKED
  ↓
READ_ONLY
  ↓
ARCHIVED
  ↓
DELETION_PENDING
  ↓
DELETED
```

## 3.3.1 State Definitions

|
State

|

Meaning

|
| --- | --- |
|

`DRAFT`

|

Space creation has started but is incomplete

|
|

`PENDING_ACTIVATION`

|

Required members or approvals are missing

|
|

`ACTIVE`

|

Normal use is allowed

|
|

`LOCKED`

|

Access is temporarily blocked

|
|

`READ_ONLY`

|

Users can read but cannot create new content

|
|

`ARCHIVED`

|

Historical access only

|
|

`DELETION_PENDING`

|

Deletion grace period is active

|
|

`DELETED`

|

Space is logically deleted

|

## 3.3.2 Why Logical Deletion Is Required

The system should not immediately physically delete a space because:

* Users may accidentally delete it.

* Legal or security investigations may require audit records.

* Members may need an export.

* Background jobs may still reference the space.

* Message synchronization may be incomplete.

* Billing or retention processes may need finalization.

Use:

```
deleted_at
deletion_requested_by
deletion_reason
deletion_scheduled_at
```

# 3.4 Generic Space Data Model

A common space model avoids separate duplicated implementations.

```
spaces
------
id
type
name
description
avatar_url
owner_user_id
status
visibility
created_at
updated_at
activated_at
archived_at
deleted_at
```

## 3.4.1 Space Type

```
FAMILY
COUPLE
SOLO
CUSTOM
TEMPORARY_EVENT
```

## 3.4.2 Visibility

Private spaces should use explicit visibility values.

```
PRIVATE
INVITE_ONLY
LINK_INVITE_ONLY
MEMBERS_ONLY
```

Recommended default:

```
PRIVATE
```

The space should not appear in:

* Global search

* Public discovery

* Public recommendations

* Public feeds

* Search-engine indexing

* Public profile pages

* Unauthenticated APIs

# 3.5 Space Policy Model

Policies should be stored independently from the base space record.

```
space_policies
-------------
space_id
allow_member_invites
allow_member_posts
allow_member_events
allow_member_tasks
allow_file_uploads
allow_agent_usage
allow_guest_members
allow_message_history_for_new_members
allow_member_export
require_admin_approval_for_join
require_approval_for_agent_actions
default_message_retention_days
auto_archive_at
```

## 3.5.1 Example Policy

JSON

```
{
  "allow_member_invites": false,
  "allow_member_posts": true,
  "allow_member_events": true,
  "allow_member_tasks": true,
  "allow_file_uploads": true,
  "allow_agent_usage": true,
  "allow_guest_members": false,
  "allow_message_history_for_new_members": false,
  "allow_member_export": true,
  "require_admin_approval_for_join": true,
  "require_approval_for_agent_actions": true
}
```

Policies must be checked server-side on every relevant request.

# 3.6 Membership Architecture

Membership is a first-class domain object.

Do not represent membership only as a list of user IDs inside the space record.

## 3.6.1 Membership Table

```
space_members
-------------
id
space_id
user_id
role
status
display_name
joined_at
invited_at
accepted_at
left_at
removed_at
muted_until
last_read_message_id
permissions_override
created_at
updated_at
```

## 3.6.2 Membership Status

```
INVITED
PENDING
ACTIVE
MUTED
SUSPENDED
LEFT
REMOVED
EXPIRED
```

## 3.6.3 Membership Roles

```
OWNER
ADMIN
MODERATOR
MEMBER
GUEST
OBSERVER
AGENT
```

The `AGENT` role should not be treated as a normal human member.

# 3.7 Role Permissions

## 3.7.1 Owner

The owner can:

* Rename the space

* Change space policies

* Add or remove administrators

* Delete or archive the space

* Manage integrations

* Configure the agent

* Transfer ownership

* Manage retention settings

* Approve sensitive operations

There should normally be one owner.

## 3.7.2 Admin

An administrator can:

* Manage members

* Approve invitations

* Remove members

* Manage group settings

* Create events

* Manage tasks

* Moderate messages

* Configure permitted agent behavior

An admin should not automatically access:

* Private member conversations

* Personal agent memory

* Private health information

* Private files

* Personal notes

## 3.7.3 Moderator

A moderator can:

* Manage messages

* Report content

* Mute members

* Remove inappropriate content

* Manage discussions

A moderator should not be able to:

* Delete the entire space

* Transfer ownership

* Access private member data

* Change security policies

* Export all data

## 3.7.4 Member

A member can perform actions allowed by space policies:

* Read permitted content

* Send messages

* Create tasks

* Create events

* Upload files

* Use approved agent features

* Leave the space

## 3.7.5 Guest

Guests have restricted access.

Possible restrictions:

* Cannot see historical messages

* Cannot invite others

* Cannot access files

* Cannot use sensitive agent functions

* Cannot view member directory

* Membership automatically expires

## 3.7.6 Observer

Observers can read selected content but cannot create content.

Useful for:

* External advisors

* Event attendees

* Guardians

* Read-only participants

* Temporary reviewers

# 3.8 Membership Rules by Space Type

|
Space type

|

Human member rules

|
| --- | --- |
|

Family

|

Flexible, subject to policy

|
|

Couple

|

Maximum two active human members

|
|

Solo

|

One active human member

|
|

Custom

|

Flexible, subject to limits

|
|

Temporary event

|

Flexible, may expire automatically

|

## 3.8.1 Couple Validation

The backend must enforce:

```
if active_human_members >= 2:
    reject_new_human_member
```

The agent does not count toward the two-human-member limit.

## 3.8.2 Solo Validation

A solo space cannot accept another human member unless the user explicitly converts it into another space type.

That conversion should require:

1. User confirmation.

2. Policy migration.

3. Membership migration.

4. Audit event.

5. Updated agent permissions.

# 3.9 Invitation Architecture

Invitations should not expose private information.

## 3.9.1 Invitation Table

```
space_invitations
-----------------
id
space_id
invited_by_user_id
invited_email
invited_phone_hash
token_hash
role
status
expires_at
accepted_by_user_id
accepted_at
revoked_at
created_at
```

## 3.9.2 Invitation States

```
CREATED
SENT
OPENED
ACCEPTED
DECLINED
REVOKED
EXPIRED
```

## 3.9.3 Invitation Rules

* Invitation tokens must be random and unguessable.

* Store token hashes, not raw tokens.

* Invitations must expire.

* Invitations must be single-use.

* Revoked invitations cannot be reused.

* The invitee must authenticate before acceptance.

* The invitee must see the space name and inviter identity.

* The invitee must not see private messages before joining.

* Invitation endpoints must be rate-limited.

* The system must prevent user enumeration.

## 3.9.4 Invitation Flow

```
Owner/Admin creates invitation
        ↓
Backend validates permission
        ↓
Invitation token created
        ↓
Notification sent
        ↓
Invitee opens invitation
        ↓
Invitee authenticates
        ↓
Invitee accepts or declines
        ↓
Backend validates token and policy
        ↓
Membership created
        ↓
Audit event written
        ↓
Member receives onboarding state
```

# 3.10 Contact-Based Invitations

For family or couple spaces, the creator may provide:

* Name

* Email

* Phone number

* Relationship label

* Optional profile image

These fields must be handled carefully.

## 3.10.1 Contact Privacy

The system should:

* Normalize phone numbers before hashing.

* Avoid exposing contact details to other members.

* Store only necessary contact data.

* Require consent for persistent contact storage.

* Allow the inviter to delete unused invitations.

* Prevent contact details from appearing in public search.

* Avoid sending sensitive space information in SMS or WhatsApp previews.

Example notification:

```
You have been invited to join a private group.
Open the invitation to review the details.
```

Do not include private medical, financial, or relationship information in the notification preview.

# 3.11 Joining a Private Space

A user can join through:

1. Direct invitation.

2. Secure invitation link.

3. QR code.

4. Admin-approved request.

5. Existing verified relationship flow.

6. Organization-controlled invitation.

## 3.11.1 Join Request Table

```
space_join_requests
-------------------
id
space_id
requester_user_id
message
status
reviewed_by_user_id
reviewed_at
expires_at
created_at
```

## 3.11.2 Join Request States

```
PENDING
APPROVED
REJECTED
CANCELLED
EXPIRED
```

## 3.11.3 New Member History Access

Default:

```
New members cannot automatically view all historical content.
```

Possible policies:

* No history

* Last 24 hours

* Last 7 days

* Selected pinned content

* Full history with admin approval

This is important because old messages may contain:

* Personal details

* Medical information

* Financial data

* Private arguments

* Previous event information

* Confidential files

# 3.12 Private Content Model

Private content should have explicit ownership and visibility.

## 3.12.1 Content Scopes

```
SPACE_SHARED
MEMBERS_ONLY
ROLE_RESTRICTED
OWNER_ONLY
PRIVATE_TO_AUTHOR
AGENT_ONLY
```

## 3.12.2 Example

|
Content

|

Default scope

|
| --- | --- |
|

Group message

|

`SPACE_SHARED`

|
|

Personal journal

|

`PRIVATE_TO_AUTHOR`

|
|

Shared event

|

`SPACE_SHARED`

|
|

Medical document

|

`OWNER_ONLY`

|
|

Group task

|

`SPACE_SHARED`

|
|

Personal reminder

|

`PRIVATE_TO_AUTHOR`

|
|

Agent memory

|

Restricted by consent

|
|

Admin audit record

|

`ROLE_RESTRICTED`

|

The backend must never infer that all data inside a private space is visible to all members.

# 3.13 Private Conversations

The platform should distinguish between:

```
Shared group conversation
Private member-to-member conversation
Private member-to-agent conversation
Shared group-agent conversation
```

## 3.13.1 Conversation Types

```
GROUP
DIRECT
GROUP_AGENT
PRIVATE_AGENT
SYSTEM
```

## 3.13.2 Conversation Table

```
conversations
-------------
id
space_id
type
created_by_user_id
title
status
created_at
updated_at
```

## 3.13.3 Conversation Membership

```
conversation_members
--------------------
conversation_id
user_id
role
joined_at
left_at
last_read_message_id
```

A user may belong to a space but not belong to every conversation within that space.

# 3.14 Private Messaging Architecture

## 3.14.1 Message Flow

```
Client
  ↓
Authentication
  ↓
Space membership validation
  ↓
Conversation membership validation
  ↓
Message schema validation
  ↓
Permission validation
  ↓
Message persistence
  ↓
Outbox event
  ↓
Realtime delivery
  ↓
Push notification if required
  ↓
Delivery/read receipts
```

## 3.14.2 Message Table

```
messages
--------
id
conversation_id
sender_user_id
sender_type
client_message_id
message_type
body_ciphertext
reply_to_message_id
attachment_count
created_at
edited_at
deleted_at
```

## 3.14.3 Required Message Properties

* Client-generated idempotency key

* Server-generated message ID

* Server timestamp

* Sender identity

* Conversation ID

* Delivery status

* Edit history where required

* Delete marker

* Attachment references

* Moderation state if applicable

## 3.14.4 Idempotency

If the client retries the same message:

```
same client_message_id
→ return existing server message
```

This prevents duplicate messages during:

* Weak network conditions

* App restarts

* WebSocket reconnects

* Background retries

* Mobile network switching

# 3.15 Realtime Private Messaging

Use:

* WebSocket for realtime events

* HTTP/gRPC for durable commands

* Redis Streams or a message broker for internal event distribution

* PostgreSQL as the source of truth

Recommended pattern:

```
Command API
  ↓
PostgreSQL transaction
  ↓
Transactional outbox
  ↓
Event dispatcher
  ↓
WebSocket gateway
  ↓
Connected clients
```

Do not make WebSocket delivery the only persistence mechanism.

## 3.15.1 Reconnection

When a client reconnects:

```
client sends last_received_event_id
        ↓
server checks event history
        ↓
server sends missed events
        ↓
client applies events in order
        ↓
client acknowledges synchronization
```

# 3.16 Shared Tasks

Private spaces may contain shared tasks.

Examples:

* Buy groceries

* Pay electricity bill

* Prepare festival materials

* Book a doctor appointment

* Clean the house

* Organize a trip

* Submit project documents

## 3.16.1 Task Table

```
tasks
-----
id
space_id
created_by_user_id
assigned_to_user_id
title
description
status
priority
due_at
recurrence_rule
visibility_scope
completed_by_user_id
completed_at
created_at
updated_at
```

## 3.16.2 Task States

```
OPEN
IN_PROGRESS
BLOCKED
COMPLETED
CANCELLED
ARCHIVED
```

## 3.16.3 Task Permissions

A space may configure:

* Who can create tasks

* Who can assign tasks

* Who can edit tasks

* Who can mark tasks complete

* Whether members can assign tasks to others

* Whether agent-created tasks require approval

# 3.17 Shared Events

Events can be created inside private spaces.

Examples:

* Family gathering

* Birthday

* Festival celebration

* Couple trip

* Group meeting

* Study session

* Project deadline

## 3.17.1 Event Table

```
space_events
------------
id
space_id
created_by_user_id
title
description
location_text
start_at
end_at
timezone
visibility_scope
status
created_at
updated_at
```

## 3.17.2 Event Participation

```
event_participants
------------------
event_id
user_id
response
responded_at
```

Responses:

```
GOING
MAYBE
NOT_GOING
NO_RESPONSE
```

## 3.17.3 Event Privacy

Location and attendee information should be protected.

For example:

* Event title may be visible to all members.

* Exact location may be restricted.

* Guest list may be admin-only.

* Personal notes may remain private.

* RSVP responses may be visible only to the organizer.

# 3.18 Reminders and Notifications

The platform may support:

* Personal reminders

* Shared reminders

* Group reminders

* Agent-generated reminders

* Escalation reminders

* Recurring reminders

* Event reminders

## 3.18.1 Reminder Scope

```
PERSONAL
SPACE_SHARED
ROLE_RESTRICTED
```

## 3.18.2 Reminder Table

```
reminders
---------
id
space_id
owner_user_id
created_by_user_id
title
description
schedule
timezone
recurrence_rule
scope
status
next_run_at
last_run_at
created_at
updated_at
```

## 3.18.3 Escalation Flow

```
Reminder scheduled
        ↓
Reminder delivered to target member
        ↓
Wait for configured response window
        ↓
No response
        ↓
Check escalation policy
        ↓
Notify permitted admin or contact
        ↓
Write audit event
```

Escalation must not expose unnecessary details.

Example:

```
The scheduled reminder has not received a response.
Please check with the assigned member.
```

Do not automatically reveal private medical information in an escalation message.

# 3.19 Health-Related Private Data

Health-related features require a stricter boundary.

Potential data includes:

* Medicine name

* Dosage

* Schedule

* Prescription photo

* Appointment details

* Symptoms

* Doctor information

* Medical documents

## 3.19.1 Default Privacy

Health data should be:

```
PRIVATE_TO_OWNER
```

It becomes shared only through explicit consent.

## 3.19.2 Shared Health Reminder

A user may explicitly configure:

```
Share reminder status with family admin: YES
Share medicine name: NO
Share dosage: NO
Share prescription photo: NO
```

The agent must preserve these field-level permissions.

## 3.19.3 Safety Boundary

The agent may:

* Schedule a reminder

* Explain user-provided instructions

* Ask whether a reminder was completed

* Notify an authorized person

* Organize medical documents

* Help prepare questions for a clinician

The agent must not independently:

* Change medication dosage

* Recommend stopping prescribed medication

* Diagnose a condition

* Replace medical professionals

* Send sensitive health information to unauthorized members

High-impact health actions should require user confirmation.

# 3.20 Private Agent Architecture

Each private space may have an agent, but the agent is not automatically granted unrestricted access.

```
Space Agent
├── Shared conversation access
├── Shared tasks
├── Shared events
├── Approved reminders
├── Approved files
├── Space memory
└── Restricted action tools
```

## 3.20.1 Agent Configuration

```
space_agent_configs
-------------------
id
space_id
enabled
agent_name
system_policy_version
allowed_tools
memory_scope
requires_approval
escalation_policy
created_by_user_id
updated_at
```

## 3.20.2 Agent Permissions

```
READ_SHARED_MESSAGES
CREATE_SHARED_TASKS
CREATE_SHARED_EVENTS
CREATE_REMINDERS
SEND_NOTIFICATIONS
READ_APPROVED_FILES
REQUEST_MEMBER_CONFIRMATION
ESCALATE_TO_ADMIN
```

Dangerous permissions should be disabled by default:

```
SEND_EXTERNAL_MESSAGE
CHANGE_MEDICAL_DATA
DELETE_CONTENT
INVITE_MEMBERS
EXPORT_DATA
MAKE_PURCHASE
CHANGE_SECURITY_POLICY
```

# 3.21 Agent Memory Isolation

Memory must be scoped.

```
PERSONAL_MEMORY
SPACE_MEMORY
CONVERSATION_MEMORY
TASK_MEMORY
EVENT_MEMORY
TEMPORARY_CONTEXT
```

## 3.21.1 Memory Rules

1. Personal memory cannot automatically enter group memory.

2. Group memory cannot automatically enter every member’s personal memory.

3. A private conversation cannot automatically be summarized into the group.

4. Sensitive information requires explicit consent before sharing.

5. Memory records must retain their source and scope.

6. Deleted content must trigger memory review.

7. Removed members must lose access to future restricted memory.

8. Agent retrieval must filter by current permissions.

## 3.21.2 Memory Table

```
memory_items
------------
id
owner_type
owner_id
space_id
conversation_id
source_message_id
content_ciphertext
memory_type
sensitivity_level
consent_required
consent_status
created_at
updated_at
deleted_at
```

## 3.21.3 Retrieval Filter

Every agent retrieval request should include:

```
user_id
space_id
conversation_id
allowed_scopes
allowed_sensitivity_levels
current_membership
consent_context
```

The agent should never query the entire database and filter afterward.

# 3.22 Agent Action Approval

Agent actions should be classified.

## 3.22.1 Low-Risk Actions

May be automatic if enabled:

* Suggest a task

* Summarize a group discussion

* Create a draft event

* Create a draft reminder

* Answer questions from shared content

* Organize approved files

## 3.22.2 Medium-Risk Actions

Require confirmation depending on policy:

* Send a group notification

* Assign a task to another member

* Change an event

* Escalate a reminder

* Share a summary

## 3.22.3 High-Risk Actions

Always require explicit approval:

* Send external messages

* Share health data

* Make purchases

* Delete records

* Change membership

* Export private content

* Change security settings

* Change medication information

## 3.22.4 Approval Table

```
agent_action_approvals
----------------------
id
space_id
agent_run_id
requested_by_agent
action_type
payload_hash
risk_level
status
approved_by_user_id
approved_at
rejected_at
expires_at
created_at
```

States:

```
PENDING
APPROVED
REJECTED
EXPIRED
EXECUTED
FAILED
CANCELLED
```

# 3.23 Family Admin Escalation

The family creator may be the escalation contact, but escalation must be configurable.

## 3.23.1 Escalation Configuration

```
escalation_policies
-------------------
id
space_id
trigger_type
target_user_id
fallback_user_id
delay_seconds
allowed_channels
message_template
requires_sensitive_data_consent
enabled
```

Possible triggers:

* Reminder not acknowledged

* Event conflict

* Task overdue

* Member requests help

* Agent cannot complete an action

* Safety-related user-defined condition

## 3.23.2 Escalation Rules

* Notify only authorized recipients.

* Avoid unnecessary private details.

* Respect quiet hours.

* Record the escalation event.

* Provide an opt-out where appropriate.

* Do not repeatedly spam the group.

* Stop escalation when the target responds.

* Prevent escalation loops.

# 3.24 Files and Media

Private spaces may support:

* Images

* PDFs

* Videos

* Voice notes

* Documents

* Receipts

* Event materials

* Prescription photos

* Shared spreadsheets

## 3.24.1 File Table

```
space_files
-----------
id
space_id
uploaded_by_user_id
conversation_id
object_key
file_name
mime_type
size_bytes
checksum
visibility_scope
encryption_key_reference
scan_status
created_at
deleted_at
```

## 3.24.2 File Security

* Use private object storage.

* Generate short-lived signed URLs.

* Validate MIME type and file size.

* Scan uploads for malware.

* Encrypt sensitive files.

* Log downloads for sensitive content.

* Prevent public bucket access.

* Do not expose raw storage paths.

* Revoke access after membership removal.

# 3.25 Private Space API Design

## 3.25.1 Space APIs

http

```
POST   /v1/spaces
GET    /v1/spaces
GET    /v1/spaces/{space_id}
PATCH  /v1/spaces/{space_id}
DELETE /v1/spaces/{space_id}
POST   /v1/spaces/{space_id}/archive
POST   /v1/spaces/{space_id}/restore
```

## 3.25.2 Membership APIs

http

```
GET    /v1/spaces/{space_id}/members
POST   /v1/spaces/{space_id}/members/invite
POST   /v1/spaces/{space_id}/join-requests
POST   /v1/spaces/{space_id}/join-requests/{id}/approve
POST   /v1/spaces/{space_id}/join-requests/{id}/reject
PATCH  /v1/spaces/{space_id}/members/{user_id}
DELETE /v1/spaces/{space_id}/members/{user_id}
POST   /v1/spaces/{space_id}/leave
```

## 3.25.3 Conversation APIs

http

```
GET    /v1/spaces/{space_id}/conversations
POST   /v1/spaces/{space_id}/conversations
GET    /v1/conversations/{conversation_id}/messages
POST   /v1/conversations/{conversation_id}/messages
PATCH  /v1/messages/{message_id}
DELETE /v1/messages/{message_id}
POST   /v1/conversations/{conversation_id}/read
```

## 3.25.4 Task APIs

http

```
GET    /v1/spaces/{space_id}/tasks
POST   /v1/spaces/{space_id}/tasks
PATCH  /v1/tasks/{task_id}
POST   /v1/tasks/{task_id}/complete
POST   /v1/tasks/{task_id}/assign
```

## 3.25.5 Event APIs

http

```
GET    /v1/spaces/{space_id}/events
POST   /v1/spaces/{space_id}/events
PATCH  /v1/events/{event_id}
POST   /v1/events/{event_id}/rsvp
DELETE /v1/events/{event_id}
```

## 3.25.6 Agent APIs

http

```
GET    /v1/spaces/{space_id}/agent
PATCH  /v1/spaces/{space_id}/agent
POST   /v1/spaces/{space_id}/agent/chat
GET    /v1/spaces/{space_id}/agent/actions
POST   /v1/agent-actions/{action_id}/approve
POST   /v1/agent-actions/{action_id}/reject
GET    /v1/spaces/{space_id}/agent/memory
DELETE /v1/agent-memory/{memory_id}
```

# 3.26 Authorization Middleware

Every private-space request should pass through a common authorization layer.

```
Request
  ↓
Authenticate user
  ↓
Resolve space
  ↓
Resolve membership
  ↓
Check membership status
  ↓
Resolve role
  ↓
Resolve content scope
  ↓
Check policy
  ↓
Check consent
  ↓
Authorize operation
  ↓
Execute service method
```

## 3.26.1 Example Policy Function

Python

Run

```
def can_send_message(user, space, conversation):
    membership = get_membership(user.id, space.id)

    if membership is None:
        return False

    if membership.status not in {"ACTIVE", "MUTED"}:
        return False

    if membership.status == "MUTED":
        return False

    if not is_conversation_member(user.id, conversation.id):
        return False

    if not space.policy.allow_member_posts:
        return membership.role in {"OWNER", "ADMIN", "MODERATOR"}

    return True
```

This is illustrative. Production authorization should be centralized and tested independently.

# 3.27 Android Architecture

Use:

* Kotlin

* Jetpack Compose

* ViewModel

* Kotlin Coroutines

* StateFlow

* Room for local persistence

* Retrofit or Ktor client

* WebSocket client

* WorkManager for background work

* Android Keystore for local secrets

## 3.27.1 Android Feature Modules
