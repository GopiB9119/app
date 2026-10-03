Continue with Chapter 1 — Complete Product Requirements Specification for the community platform. Give a deep production-level PRD with every core and non-core module, user personas, public pages, posts, discovery, private family/couple/solo/custom groups, messaging, agent system, planning, reminders, privacy, health safety boundaries, user journeys, business rules, acceptance criteria, and MVP scope. Do not skip details.

# Chapter 1 — Complete Product Requirements Specification

## Community Platform

Document status: Product Requirements Specification Product type: Global community platform with private spaces and agent assistance Primary clients: Android application, desktop web application Initial architecture assumption: Modular monolith with independently deployable workers and agent runtime Primary backend: Python/FastAPI Agent orchestration: LangGraph Database: PostgreSQL Realtime: WebSocket Cache and transient coordination: Redis Object storage: S3-compatible storage Mobile: Kotlin + Jetpack Compose Web: Next.js + TypeScript

# 1. Product Vision

The platform combines two connected experiences:

1. Global community

   * Public pages

   * Posts

   * Events

   * Discussions

   * Discovery

   * Follows

   * Comments

   * Reactions

   * Moderation
2. Private personal and group spaces

   * Family groups

   * Couple groups

   * Solo spaces

   * Custom groups

   * Temporary event groups

   * Private messaging

   * Shared tasks

   * Reminders

   * Planning

   * Agent assistance

   * Consent-based memory

The platform should allow users to move between public participation and private coordination without confusing the two data environments.

A public festival page, a private family group, a couple’s conversation, and a solo planning space must have different visibility, membership, permissions, retention, and agent-access rules.

# 2. Product Goals

## 2.1 Primary goals

The platform must enable users to:

* Create and manage an account.

* Build a personal profile.

* Discover public content and communities.

* Create public pages.

* Publish and interact with posts.

* Follow pages and users.

* Create private groups.

* Invite members through approved channels.

* Communicate through private and group messaging.

* Create tasks, plans, events, and reminders.

* Use an agent within an explicitly authorized scope.

* Manage consent, memory, notifications, and permissions.

* Protect private and sensitive information.

* Report harmful content or unsafe behavior.

* Access the same core experience on Android and web.

## 2.2 Secondary goals

The platform should eventually support:

* Family coordination

* Couple planning

* Personal productivity

* Community event planning

* Volunteer coordination

* Interest-based communities

* Shared expenses

* Document and media collaboration

* Agent-assisted research

* External notification providers

* Approved WhatsApp or communication integrations

* Advanced analytics

* Organization and business pages

* Marketplace-like community services

## 2.3 Non-goals for the initial release

The first version should not attempt to build:

* A full medical diagnosis system

* A prescription or dosage decision system

* A banking or financial transaction platform

* An unrestricted autonomous agent

* An unofficial WhatsApp automation system

* A complete video-conferencing platform

* A full project-management suite

* A cryptocurrency or token system

* A universal social network algorithm

* A completely decentralized identity system

* A global moderation operation without clear escalation procedures

# 3. Product Principles

## 3.1 Privacy by default

Private spaces must remain private unless the user explicitly publishes or shares content.

## 3.2 Explicit scope

Every action must have a clear scope:

* User scope

* Conversation scope

* Group scope

* Page scope

* Event scope

* Agent scope

An agent operating in one scope must not automatically access another scope.

## 3.3 Human control

The agent may recommend, draft, organize, and execute approved low-risk actions. It must not make irreversible or high-impact decisions without appropriate approval.

## 3.4 Durable state

Important operations must be persisted before being broadcast or executed.

Examples:

* Messages

* Membership changes

* Reminders

* Agent actions

* Consent changes

* Moderation decisions

* Invitations

## 3.5 Explainable actions

Users should be able to understand:

* What the agent did

* Why it did it

* Which data it used

* Which tool it called

* Whether approval was required

* Whether the action succeeded or failed

## 3.6 Safe degradation

If the agent, notification provider, cache, or external integration fails, core messaging and data access must continue where possible.

## 3.7 No silent privilege escalation

An agent cannot obtain access merely because a user mentioned information in a conversation.

## 3.8 Reversible by default

Users should be able to:

* Cancel reminders

* Undo drafts

* Leave groups

* Revoke agent permissions

* Delete memories

* Withdraw consent

* Remove posts

* Disable notifications

# 4. User Personas

## 4.1 Individual user

A person who uses the platform for:

* Personal planning

* Solo tasks

* Public community participation

* Following pages

* Private conversations

* Agent assistance

### Needs

* Simple onboarding

* Privacy controls

* Reliable reminders

* Personal agent

* Clear separation between public and private activity

## 4.2 Family organizer

A person who creates and manages a family group.

### Needs

* Invite family members

* Organize shared tasks

* Schedule appointments

* Track non-medical reminders

* Coordinate events

* Escalate unacknowledged tasks

* Control group permissions

### Restrictions

The family organizer must not automatically access:

* Private direct messages

* Another member’s solo space

* Private couple conversations

* Sensitive health information without consent

## 4.3 Family member

A person invited to a family group.

### Needs

* Accept or reject invitation

* View group information

* Participate in group chat

* View assigned tasks

* Acknowledge reminders

* Control personal notification preferences

## 4.4 Couple user

A user participating in a private two-person space.

### Needs

* Private conversation

* Shared calendar

* Shared tasks

* Event planning

* Shared lists

* Agent-assisted coordination

### Privacy requirements

The agent must not automatically expose:

* Private individual memories

* Private searches

* Private conversations

* Individual activity history

* Personal notes

The couple space should have explicit shared-memory controls.

## 4.5 Solo-space user

A user who creates a private space for themselves.

### Use cases

* Personal planning

* Journaling

* Goals

* Reminders

* Study plans

* Travel plans

* Habit tracking

* Private agent conversations

### Privacy requirement

Solo-space data must not become public content unless explicitly published.

## 4.6 Custom group organizer

A user who creates a group for:

* Friends

* Students

* Colleagues

* Volunteers

* Hobby communities

* Event planning

* Local activities

### Needs

* Flexible roles

* Invite management

* Group rules

* Shared files

* Tasks

* Moderation

* Agent permissions

## 4.7 Public page owner

A person or organization managing a public page.

### Use cases

* Festival page

* Community organization

* Local event

* Educational group

* Interest community

* Creator page

* Business page

### Needs

* Publish posts

* Manage moderators

* Manage followers

* Create events

* Respond to comments

* Review analytics

* Configure page agent

## 4.8 Moderator

A platform or community-level moderator.

### Needs

* Review reports

* Hide harmful content

* Restrict users

* Review appeals

* Manage spam

* Escalate severe cases

* View only the minimum information required

## 4.9 Platform administrator

An authorized internal operator.

### Needs

* System health

* Abuse investigations

* User support

* Audit logs

* Configuration

* Feature flags

* Moderation escalation

* Incident response

Administrator access must be logged and limited by role.

## 4.10 Agent

The agent is a software participant, not a human user.

It may operate within:

* Personal scope

* Group scope

* Page scope

* Event scope

* Conversation scope

The agent must have:

* Identity

* Configuration

* Permissions

* Tool access

* Memory policy

* Safety policy

* Action history

* Usage limits

* Version

* Owner

* Scope

# 5. Product Surface Map

## 5.1 Android application

Primary screens:

1. Welcome

2. Sign up

3. Sign in

4. Verification

5. Profile setup

6. Home feed

7. Discover

8. Page detail

9. Post detail

10. Create post

11. Notifications

12. Messages

13. Conversation detail

14. Groups

15. Group detail

16. Create group

17. Invitations

18. Tasks

19. Reminders

20. Calendar

21. Agent chat

22. Agent action approval

23. Memory management

24. Privacy settings

25. Notification settings

26. Account settings

27. Reports and safety

28. Help and support

## 5.2 Desktop web application

The web application should support:

* All core account operations

* Feed and discovery

* Page management

* Group management

* Messaging

* Tasks and reminders

* Agent chat

* Administration interfaces

* Moderation

* Analytics

* Data export and deletion

The web layout may use:

* Left navigation

* Central content area

* Right contextual panel

* Responsive mobile layout

# 6. Account and Identity Module

## 6.1 Account creation

Users may register using:

* Email

* Phone number

* Approved social login provider, if implemented later

Required fields:

* Display name

* Account identifier

* Password or provider authentication

* Consent to terms

* Consent to privacy policy

* Age confirmation where legally required

Optional fields:

* Profile photo

* Bio

* Location at coarse level

* Languages

* Interests

* Time zone

## 6.2 Authentication

Requirements:

* Password hashing using a modern password-hashing algorithm

* Email or phone verification

* Session management

* Refresh-token rotation

* Device/session listing

* Logout from one device

* Logout from all devices

* Suspicious-login detection

* Rate limiting

* Account lockout or progressive delay

* Optional multi-factor authentication

## 6.3 User profile

Profile fields:

* User ID

* Display name

* Username, if enabled

* Avatar

* Bio

* Pronouns, optional

* Languages

* Time zone

* Account creation date

* Public profile visibility

* Profile links, optional

Sensitive profile fields should not be public by default.

## 6.4 Account states

Possible states:

* Pending verification

* Active

* Restricted

* Suspended

* Deactivated

* Deletion pending

* Deleted

## 6.5 Acceptance criteria

* A user can register and verify an account.

* Duplicate email or phone registration is handled safely.

* Invalid authentication attempts are rate-limited.

* Users can view and revoke active sessions.

* Deactivated users cannot create new content.

* Deleted users follow a documented retention and deletion process.

# 7. Public Community Module

## 7.1 Public community definition

The public community is a discoverable area containing content intentionally published for a broad audience.

Content may include:

* Public pages

* Public posts

* Public events

* Public discussions

* Public comments

* Public announcements

* Public educational content

Public visibility must be an explicit content state.

## 7.2 Public page types

Supported page types:

* Community

* Event

* Festival

* Organization

* Creator

* Interest

* Educational

* Local activity

* Project

* Business, if later enabled

## 7.3 Page creation

Page creation requires:

* Page name

* Page type

* Description

* Visibility

* Owner

* Category

* Optional image

* Optional location

* Optional contact information

* Page rules

* Moderation settings

## 7.4 Page roles

Suggested roles:

|
Role

|

Permissions

|
| --- | --- |
|

Owner

|

Full page control and deletion

|
|

Admin

|

Manage page and members

|
|

Editor

|

Create and edit posts

|
|

Moderator

|

Review comments and reports

|
|

Analyst

|

View permitted analytics

|
|

Contributor

|

Submit content for review

|
|

Viewer

|

Read public content

|

## 7.5 Page visibility

Possible states:

* Public

* Unlisted

* Private

* Archived

* Suspended

A public page may be indexed or recommended. An unlisted page should be accessible through a direct link but excluded from general discovery.

## 7.6 Page features

Core:

* Page profile

* About section

* Posts

* Followers

* Comments

* Page members

* Events

* Rules

* Reports

* Moderation

* Page agent configuration

Later:

* Polls

* Livestreams

* Ticketing

* Donations

* Membership subscriptions

* Business tools

* Advanced analytics

## 7.7 Page acceptance criteria

* A user can create a page if authorized.

* Page ownership is stored independently from membership.

* Page roles are enforced on every write operation.

* Suspended pages cannot publish new content.

* Public page content is not exposed from private group storage.

* Page deletion follows a confirmation and retention workflow.

# 8. Posts Module

## 8.1 Post types

Initial post types:

* Text

* Image

* Video, if supported

* Link

* Event announcement

* Poll, optional for MVP

* Shared page announcement

## 8.2 Post fields

A post should include:

* Post ID

* Author ID

* Scope type

* Scope ID

* Body

* Media references

* Visibility

* Status

* Created timestamp

* Updated timestamp

* Edit history reference

* Moderation state

* Comment policy

* Reaction count

* Share count

## 8.3 Post visibility

Possible visibility values:

* Public

* Followers

* Page members

* Group members

* Selected members

* Only me

* Unlisted

Visibility must be enforced server-side.

## 8.4 Post lifecycle

```
Draft
  ↓
Submitted
  ↓
Moderation review, if required
  ↓
Published
  ↓
Edited or hidden
  ↓
Archived or deleted
```

## 8.5 Post interactions

Core:

* Like or reaction

* Comment

* Reply

* Share or reshare

* Save

* Report

* Hide

* Follow author/page

* Mute author/page

## 8.6 Editing rules

Possible policy:

* Author can edit their post.

* Page editors can edit page-owned posts.

* Moderators can hide but should not silently rewrite user content.

* Edit history should be retained for moderation and audit purposes.

* A deleted post should not remain visible through caches or search indexes.

## 8.7 Comment rules

Comments require:

* Parent post

* Author

* Optional parent comment

* Body

* Visibility

* Moderation status

* Created and updated timestamps

Supported controls:

* Disable comments

* Restrict comments to followers

* Restrict comments to page members

* Block specific users

* Report comment

* Hide comment

* Pin comment

## 8.8 Acceptance criteria

* A user can create a post in an authorized scope.

* A user cannot publish to a page without permission.

* Private posts never appear in public discovery.

* Comments obey the parent post’s visibility.

* Deleted content is removed from normal reads and search.

* Moderation status is visible to authorized operators.

# 9. Discovery Module

## 9.1 Discovery objectives

Discovery should help users find:

* Public pages

* Public posts

* Events

* Communities

* Topics

* People

* Interest groups

* Educational content

## 9.2 Discovery inputs

Possible inputs:

* Search query

* Topic

* Category

* Language

* Coarse location

* Follow graph

* Recent interactions

* Popularity

* Freshness

* Safety status

* User-selected interests

## 9.3 Discovery surfaces

1. Search

2. Explore feed

3. Trending topics

4. Suggested pages

5. Suggested users

6. Event discovery

7. Category pages

8. Hashtag or topic pages

9. Nearby public events, only with explicit location permission

## 9.4 Discovery privacy rules

The system must not use private data for public recommendations without appropriate consent.

Do not use:

* Private messages

* Private group content

* Private agent conversations

* Health information

* Private searches

* Private calendar data

* Private memories

Potentially allowed signals:

* Public interactions

* Public follows

* Explicit interests

* Public page membership

* User-selected discovery preferences

## 9.5 Search behavior

Search must support:

* Exact terms

* Partial terms

* Typo tolerance, later

* Filters

* Pagination

* Safe ranking

* Blocked-content filtering

* Deleted-content exclusion

## 9.6 Ranking principles

Ranking may consider:

* Relevance

* Freshness

* User-selected interests

* Public engagement

* Trust and safety signals

* Relationship to followed pages

* Language

* Explicit location preference

The system should avoid excessive engagement optimization that promotes harmful or misleading content.

## 9.7 Acceptance criteria

* Private content is excluded from discovery.

* Blocked users and hidden content are excluded.

* Search results respect visibility and membership.

* Users can clear search history.

* Users can control personalization where available.

* Search pagination is stable and cursor-based.

# 10. Follow, Membership, and Relationship Module

## 10.1 Relationship types

The system should distinguish:

* Follow

* Page membership

* Group membership

* Admin role

* Block

* Mute

* Restrict

* Invitation

* Pending request

These must not be represented as one generic relationship.

## 10.2 Follow rules

A user may:

* Follow a public page

* Unfollow a page

* Follow a public profile, if enabled

* Mute content

* View following list according to privacy settings

## 10.3 Block rules

Blocking should affect:

* Discovery

* Messaging

* Comments

* Mentions

* Invitations

* Recommendations

* Notifications

Blocking does not necessarily delete historical shared content. Historical content must follow documented visibility rules.

# 11. Private Spaces Module

Private spaces are distinct from public pages.

## 11.1 Space types

* Family group

* Couple group

* Solo space

* Custom group

* Temporary event group

* Private workspace

## 11.2 Common space fields

* Space ID

* Space type

* Name

* Description

* Owner

* Created timestamp

* Visibility

* Membership policy

* Agent policy

* Retention policy

* Status

* Deletion state

## 11.3 Common membership roles

* Owner

* Admin

* Moderator

* Member

* Guest

* Observer

* Agent

The agent should not be treated as a human member for legal or social purposes. It should have a separate agent identity and permission model.

# 12. Family Groups

## 12.1 Family group creation

The creator must provide:

* Group name

* Optional description

* Optional group image

* Member invitation details

* Group privacy settings

* Agent enablement choice

* Notification defaults

## 12.2 Invitation methods

Possible invitation methods:

* In-app invitation

* Email invitation

* SMS invitation

* Approved WhatsApp provider

* Shareable invitation link with expiration

Unapproved or unofficial messaging automation must not be foundational to the system.

## 12.3 Invitation fields

* Invitation ID

* Group ID

* Inviter ID

* Invitee contact

* Invitee user ID, if known

* Token hash

* Expiration time

* Status

* Accepted timestamp

* Rejected timestamp

* Revoked timestamp

## 12.4 Family group capabilities

* Group chat

* Shared tasks

* Shared events

* Shared lists

* Announcements

* Member roles

* Reminder escalation

* Shared agent

* Group files

* Group rules

* Member notification preferences

## 12.5 Family escalation

Example workflow:

```
Task created
  ↓
Assigned to member
  ↓
Reminder delivered
  ↓
Member acknowledges
  ├── Yes → Completed
  └── No → Retry according to policy
                 ↓
          Escalate to group admin
```

Escalation must be:

* Explicitly configured

* Visible to the assigned member

* Limited by privacy policy

* Logged

* Cancelable

* Disabled during quiet hours where appropriate

## 12.6 Family privacy

The group admin may manage group-level content but must not automatically read:

* Private direct messages

* Solo-space data

* Couple-space data

* Private agent memory

* Private notes

* Health information without consent

# 13. Couple Groups

## 13.1 Couple group definition

A couple group is a private two-person space.

## 13.2 Membership rules

Recommended initial rule:

* Exactly two active human members

* One creator

* One invited partner

* No third active member

* Agent identity may exist separately

## 13.3 Couple features

* Private messaging

* Shared tasks

* Shared calendar

* Shared shopping lists

* Shared event planning

* Shared agent

* Shared memories only by explicit consent

* Shared files

* Private notes

## 13.4 Couple privacy rules

Each user should be able to mark content as:

* Private to self

* Shared with partner

* Shared with agent

* Shared with both partner and agent

The agent must not infer that all couple content is shared content.

## 13.5 Relationship termination

The system should support:

* Leaving the couple space

* Removing the partner

* Exporting personal data

* Retaining shared content according to policy

* Converting the space to archived state

* Disabling agent access

* Revoking shared memory

The product should avoid making assumptions about the personal relationship.

# 14. Solo Spaces

## 14.1 Solo-space purpose

A solo space is a private environment for an individual.

## 14.2 Features

* Private chat

* Personal agent

* Tasks

* Reminders

* Calendar

* Notes

* Goals

* Plans

* Journaling

* Saved content

* Personal files

* Memory management

## 14.3 Solo-space rules

* Only the owner has access by default.

* No other user can be added unless the space is converted or content is explicitly shared.

* Agent access is controlled by the owner.

* Private notes are not used for public discovery.

* The user can export or delete the space.

# 15. Custom Groups

## 15.1 Custom group use cases

* Friends

* Students

* Work teams

* Volunteers

* Clubs

* Hobby groups

* Event planning

* Study groups

* Community projects

## 15.2 Custom group configuration

Group creator may configure:

* Name

* Description

* Group image

* Join policy

* Invite policy

* Approval policy

* Member limit

* Roles

* Group rules

* Message retention

* Agent access

* File sharing

* Task visibility

* Event visibility

## 15.3 Join policies

* Invite only

* Admin approval

* Member invitation

* Link-based invitation

* Public request to join

* Closed

## 15.4 Member removal

Removal must:

* Require appropriate permission

* Be recorded in audit logs

* Revoke future access immediately

* Preserve or remove historical content according to policy

* Notify the removed member where appropriate

# 16. Temporary Event Groups

Temporary groups support short-lived coordination for:

* Festivals

* Trips

* Weddings

* Meetings

* Volunteer activities

* Emergency-free community logistics

* Study sessions

## 16.1 Features

* Start and end date

* Event description

* Participant list

* Shared tasks

* Announcements

* Location details, if provided

* Agent planning

* Automatic archive

* Data retention policy

## 16.2 Expiration

At expiration:

* New membership may be disabled.

* Posting may be disabled.

* Group may become read-only.

* Agent actions may be disabled.

* Data may be archived or deleted according to policy.

# 17. Messaging Module

## 17.1 Messaging types

* One-to-one direct message

* Group message

* Page-to-user message, if enabled

* Agent conversation

* System message

* Announcement

* Task message

* Reminder message

## 17.2 Message fields

* Message ID

* Conversation ID

* Sender identity

* Sender type

* Client message ID

* Body

* Attachments

* Reply reference

* Forward reference

* Created timestamp

* Edited timestamp

* Deleted timestamp

* Delivery state

* Moderation state

* Encryption metadata, if applicable

## 17.3 Messaging requirements

* Persistent message storage

* Idempotent send

* Client-generated message ID

* Delivery acknowledgement

* Read receipt

* Typing indicator

* Presence, optional

* Reconnection

* Message pagination

* Unread counts

* Search

* Message deletion

* Report message

* Block user

* Attachment handling

## 17.4 Realtime message flow

```
Client sends message
  ↓
Authenticate WebSocket/session
  ↓
Validate conversation membership
  ↓
Validate content and rate limits
  ↓
Persist message transactionally
  ↓
Write outbox event
  ↓
Return acknowledgement
  ↓
Publish realtime event
  ↓
Deliver to connected recipients
  ↓
Record delivery/read receipts
```

## 17.5 Messaging guarantees

The system should target:

* At-most-once display for duplicate client retries

* Exactly-once logical message creation through idempotency

* Durable persistence before broadcast

* Replay after reconnect

* Cursor-based pagination

* No message loss during transient WebSocket failure

## 17.6 Encryption

If end-to-end encryption is implemented:

* Encryption keys must be managed separately from application content access.

* Server-side search may be limited.

* Moderation capabilities may change.

* Account recovery must be carefully designed.

* Group membership changes require key rotation.

* Agent access must be explicitly designed rather than assumed.

The product must not claim end-to-end encryption unless the complete protocol and implementation support it.

## 17.7 External messaging

External delivery should use an adapter model:

```
Notification domain
  ├── In-app provider
  ├── Push provider
  ├── Email provider
  ├── SMS provider
  └── Approved WhatsApp provider
```

External messages require:

* User consent

* Verified destination

* Provider compliance

* Rate limits

* Delivery status

* Opt-out

* Failure handling

* Audit logs

# 18. Notification Module

## 18.1 Notification channels

* In-app

* Push

* Email

* SMS

* Approved messaging provider

* Voice call provider, later

## 18.2 Notification types

* New message

* Mention

* Comment

* Group invitation

* Task assignment

* Reminder

* Reminder escalation

* Event update

* Security alert

* Agent approval request

* Account change

* Moderation result

## 18.3 Notification preferences

Users can configure:

* Channel

* Frequency

* Quiet hours

* Group-specific preferences

* Agent-specific preferences

* Emergency or high-priority exceptions

* Marketing preferences

* External messaging consent

## 18.4 Delivery states

* Pending

* Queued

* Sending

* Delivered

* Failed

* Retrying

* Canceled

* Expired

* Acknowledged

## 18.5 Acceptance criteria

* Notifications are not sent without valid permission.

* Duplicate delivery is prevented where possible.

* Failed deliveries are retried according to policy.

* Users can disable non-essential channels.

* Notification events are auditable.

* A reminder cannot depend on an LLM remaining active.

# 19. Tasks and Planning Module

## 19.1 Task types

* Personal task

* Group task

* Event task

* Recurring task

* Approval task

* Acknowledgement task

* Follow-up task

* Agent-generated draft task

## 19.2 Task fields

* Task ID

* Title

* Description

* Creator

* Assignee

* Scope

* Priority

* Due date

* Time zone

* Recurrence

* Status

* Completion timestamp

* Reminder policy

* Escalation policy

* Attachments

* Related conversation

* Related event

* Audit metadata

## 19.3 Task states

```
Draft
Open
Assigned
In progress
Blocked
Completed
Canceled
Expired
Archived
```

## 19.4 Planning features

Initial:

* Create task

* Assign task

* Set due date

* Set reminder

* Mark complete

* Reassign

* Add note

* View task list

* Filter by person, group, status, date

Later:

* Dependencies

* Kanban board

* Milestones

* Resource planning

* Budget tracking

* Shared expense calculation

* Automatic plan generation

## 19.5 Agent planning behavior

The agent may:

* Break a goal into tasks

* Suggest deadlines

* Identify dependencies

* Draft a schedule

* Ask clarification questions

* Detect conflicts

* Recommend reminders

The agent must not silently:

* Assign sensitive tasks

* Contact external people

* Modify another user’s calendar

* Create financial obligations

* Change medical treatment

* Delete existing plans

# 20. Reminders and Scheduling Module

## 20.1 Reminder types

* One-time reminder

* Recurring reminder

* Task reminder

* Event reminder

* Acknowledgement reminder

* Escalation reminder

* Quiet-hours deferred reminder

## 20.2 Reminder fields

* Reminder ID

* Owner

* Scope

* Related task

* Title

* Message

* Trigger time

* Time zone

* Recurrence rule

* Channel policy

* Escalation policy

* Status

* Last delivery

* Next delivery

* Cancellation timestamp

## 20.3 Scheduling requirements

The scheduler must support:

* Time zones

* Daylight-saving changes

* Recurrence

* Missed jobs

* Retry policy

* Duplicate prevention

* Cancellation

* Pause/resume

* Expiration

* User acknowledgment

* Delivery tracking

* Scheduler failover

## 20.4 Durable scheduling architecture

```
PostgreSQL
  ↓
Durable scheduled job record
  ↓
Scheduler worker
  ↓
Claim job with lock/idempotency
  ↓
Create notification delivery
  ↓
Notification dispatcher
  ↓
Provider adapter
  ↓
Delivery receipt
```

Redis may assist with coordination, but PostgreSQL or another durable store must remain the source of truth.

# 21. Agent System

## 21.1 Agent purpose

The agent provides assistance within a clearly defined scope.

It can support:

* Conversation

* Planning

* Task creation

* Reminder creation

* Summarization

* Research

* Event planning

* Group coordination

* Content drafting

* Information retrieval

* Notification drafting

* Approved tool execution

## 21.2 Agent types

### Personal agent

Operates in a user’s solo space.

### Group agent

Operates in a family, couple, custom, or event group.

### Page agent

Assists page owners with public content and page operations.

### Event agent

Assists with event planning and coordination.

### Platform support agent

Handles support workflows using restricted tools and limited data.

## 21.3 Shared runtime, scoped configuration

The system should avoid deploying a separate process for every user.

Recommended model:

```
Shared agent runtime
  +
Agent configuration
  +
Scope identity
  +
Permission policy
  +
Memory policy
  +
Tool policy
  +
Usage budget
```

## 21.4 Agent request lifecycle

```
Receive request
  ↓
Authenticate user
  ↓
Resolve scope
  ↓
Load authorized context
  ↓
Classify intent and risk
  ↓
Select agent configuration
  ↓
Plan response or action
  ↓
Check tool permissions
  ↓
Request approval if required
  ↓
Execute tool
  ↓
Verify result
  ↓
Persist action and evidence
  ↓
Respond
```

## 21.5 Agent permissions

Permission categories:

* Read public content

* Read group content

* Read private messages

* Read tasks

* Create tasks

* Modify tasks

* Create reminders

* Send notifications

* Send external messages

* Access files

* Access calendar

* Access location

* Access health-related records

* Modify page content

* Publish content

* Delete content

* Manage members

Permissions should be:

* Scope-specific

* User-controlled

* Revocable

* Audited

* Time-limited where appropriate

## 21.6 Tool execution policy

Each tool should define:

* Tool name

* Description

* Input schema

* Output schema

* Required permission

* Risk level

* Approval requirement

* Timeout

* Retry policy

* Idempotency policy

* Audit requirement

* Data classification

* Owner

## 21.7 Risk levels

### Low risk

May execute automatically if authorized:

* Create a draft

* Summarize visible messages

* Suggest a task

* Create a private reminder

* Format a list

* Search public content

### Medium risk

May require confirmation depending on settings:

* Create a shared task

* Assign a task

* Send an in-app group message

* Modify a shared plan

* Publish a page draft

### High risk

Require explicit approval:

* Send external messages

* Call someone

* Delete content

* Remove group members

* Access sensitive health data

* Change permissions

* Make financial transactions

* Publish sensitive information

* Modify medical dosage or treatment

* Perform irreversible actions


## 21.8 Agent Memory

### 21.8.1 Memory categories

The platform should separate memory into explicit categories.

|
Memory type

|

Example

|

Default visibility

|
| --- | --- | --- |
|

Conversation context

|

Recent messages in a chat

|

Current authorized scope

|
|

User preference

|

Preferred reminder time

|

User only

|
|

Group memory

|

Shared event decision

|

Group members with permission

|
|

Page memory

|

Page tone and publishing rules

|

Page admins/agent

|
|

Task memory

|

Previous task outcomes

|

Authorized task scope

|
|

Semantic memory

|

Important long-term facts

|

Explicitly approved scope

|
|

Episodic memory

|

Past interaction summary

|

User or approved group

|
|

Sensitive memory

|

Health, relationship, financial information

|

Restricted and consent-based

|
|

Temporary context

|

Current request details

|

Short-lived

|
|

Audit record

|

Tool/action history

|

Authorized operators

|

### 21.8.2 Memory creation rules

The agent must not save every message automatically.

Memory creation should require one of:

* Explicit user request

* Explicit group policy

* User-approved preference

* System-generated operational record

* Required task state

* Legally required audit record

The agent should distinguish:

```
Conversation content
≠
Saved memory
≠
Operational record
≠
Audit log
```

### 21.8.3 Memory consent

The user should be able to:

* Enable or disable memory

* View saved memories

* Edit memories

* Delete individual memories

* Delete all memories

* Prevent a conversation from creating memory

* Control group memory

* Control sensitive memory

* Revoke agent access

* Export memory

For groups, every member should be informed when shared memory is enabled.

### 21.8.4 Memory scope

Memory must carry:

* Owner

* Scope type

* Scope ID

* Visibility

* Data classification

* Consent status

* Source reference

* Created timestamp

* Last-used timestamp

* Expiration timestamp, if applicable

* Deletion status

### 21.8.5 Memory isolation rules

The following are prohibited by default:

* Using a private solo memory in a family conversation

* Using one partner’s private conversation in a couple conversation

* Using a family member’s private health information to answer a group question

* Using private group content for public recommendations

* Using private conversations to personalize public discovery

* Sharing one user’s agent history with another user

### 21.8.6 Memory retrieval

Memory retrieval must apply filters before the model receives the data:

```
Candidate memories
  ↓
Scope filter
  ↓
User permission filter
  ↓
Consent filter
  ↓
Data classification filter
  ↓
Relevance filter
  ↓
Token and budget filter
  ↓
Agent context
```

The model must never be the only permission enforcement layer.

# 22. Health and Safety Boundaries

The platform may support health-related coordination, but it must not function as an unsupervised medical decision-maker.

## 22.1 Permitted health-related assistance

The agent may:

* Store a user-provided appointment reminder

* Remind a user to contact a clinician

* Help organize doctor questions

* Summarize user-provided instructions without changing them

* Track whether a reminder was acknowledged

* Help prepare a medication list entered by the user

* Suggest contacting emergency services for urgent symptoms

* Help coordinate transportation or family support

* Display a user-entered dosage exactly as recorded, with clear source labeling

## 22.2 Restricted or prohibited actions

The agent must not:

* Diagnose a condition

* Prescribe medication

* Change dosage

* Recommend stopping medication

* Infer pregnancy or medical conditions

* Make emergency triage decisions as a substitute for professionals

* Decide whether a symptom is safe

* Send sensitive health details to a group without consent

* Automatically share medication information with family members

* Claim that a medical recommendation is professional medical advice

* Make a clinical decision based solely on a photograph

## 22.3 Medication reminder rules

Medication reminders must be based on explicit user-entered or professionally supplied information.

Required fields may include:

* Medication name

* User-entered dosage

* Unit

* Schedule

* Start date

* End date

* Prescribing professional reference, if provided

* Notes

* Confirmation status

The agent may ask:

> “You entered 500 mg at 8:00 AM. Would you like a reminder?”

It must not independently decide:

> “You should take 500 mg now.”

## 22.4 Sensitive health-data access

Health-related data requires:

* Explicit consent

* Restricted storage

* Access logs

* Minimum necessary access

* Separate visibility settings

* Clear deletion controls

* No public discovery use

* No advertising use

* No automatic group sharing

## 22.5 Emergency handling

For emergency-related messages, the agent should:

1. State that it cannot replace emergency services.

2. Encourage contacting the relevant local emergency number or qualified professional.

3. Avoid making unsupported diagnostic claims.

4. Offer practical coordination help only if safe and authorized.

5. Avoid contacting others automatically unless the user has configured and authorized that behavior.

# 23. Agent Conversations

## 23.1 Agent chat modes

### Ask mode

The agent answers questions without taking external actions.

### Plan mode

The agent creates a proposed plan or task list.

### Execute mode

The agent performs authorized actions.

### Review mode

The agent summarizes completed actions and unresolved items.

### Approval mode

The agent presents pending actions requiring confirmation.

## 23.2 Agent message types

* User message

* Agent response

* Tool proposal

* Approval request

* Tool execution result

* Verification result

* Warning

* Failure

* Escalation

* System instruction

* Memory notice

## 23.3 Agent action display

Every action should show:

* Action name

* Target

* Scope

* Data used

* Result

* Timestamp

* Approval status

* Undo or cancellation option

* Failure reason, if applicable

## 23.4 Agent failure behavior

If a tool fails, the agent must:

* Report the failure honestly

* Avoid claiming completion

* Preserve the failure record

* Retry only according to policy

* Avoid infinite loops

* Offer a manual alternative

* Escalate when configured

# 24. Events Module

## 24.1 Event types

* Public event

* Private group event

* Personal event

* Page event

* Temporary event group

* Recurring event

## 24.2 Event fields

* Event ID

* Owner

* Scope

* Name

* Description

* Start time

* End time

* Time zone

* Location or online details

* Visibility

* Attendee policy

* Capacity

* RSVP status

* Reminder policy

* Related group

* Status

## 24.3 Event states

* Draft

* Published

* Open

* Full

* Canceled

* Completed

* Archived

## 24.4 Event rules

* Public events must have public visibility.

* Private events inherit group privacy unless explicitly changed.

* Attendee lists require visibility controls.

* Location information should not be public by default.

* Canceled events must trigger notifications to affected users.

* Event reminders must be time-zone aware.

# 25. Shared Expenses and Budget Planning

This is a later-stage feature, but the PRD should define boundaries.

## 25.1 Possible uses

* Festival contribution planning

* Trip budget

* Event cost estimation

* Shared shopping list totals

* Volunteer project costs

## 25.2 Initial allowed behavior

The agent may:

* Add user-entered amounts

* Calculate totals

* Split amounts according to explicit rules

* Create a budget draft

* Show assumptions

* Identify missing values

## 25.3 Restricted behavior

The agent must not:

* Transfer money

* Access bank accounts without a separately authorized integration

* Make financial commitments

* Send payment requests without approval

* Infer income or financial status

* Expose one member’s private financial data to others

All calculations should show:

* Input values

* Currency

* Rounding method

* Split method

* Assumptions

* Final total

# 26. File and Media Module

## 26.1 Supported media

Initial:

* Images

* Small documents

* Profile photos

* Page images

* Group attachments

Later:

* Video

* Audio

* Large documents

* Collaborative files

* PDF extraction

* Document summarization

## 26.2 Upload flow

```
Request upload
  ↓
Authorize scope
  ↓
Issue short-lived upload URL
  ↓
Upload to object storage
  ↓
Validate type and size
  ↓
Malware/content scan
  ↓
Create media record
  ↓
Attach to post/message/task
```

## 26.3 Media rules

* Validate MIME type and file signature.

* Enforce size limits.

* Use short-lived upload URLs.

* Store object references, not unrestricted public URLs.

* Apply access checks on download.

* Remove orphaned uploads.

* Support retention and deletion.

* Generate thumbnails asynchronously.

# 27. Moderation and Trust & Safety

## 27.1 Moderation areas

* Spam

* Harassment

* Threats

* Hate or discriminatory content

* Sexual exploitation

* Non-consensual intimate content

* Fraud

* Impersonation

* Malicious links

* Privacy violations

* Self-harm content

* Unsafe medical claims

* Illegal activity

* Platform manipulation

## 27.2 Moderation layers

1. Client-side reporting

2. Automated pre-screening

3. Post-publication detection

4. User reports

5. Moderator review

6. Escalation

7. Appeals

8. Account or content enforcement

## 27.3 Moderation actions

* Warn

* Hide content

* Remove content

* Limit distribution

* Disable comments

* Restrict posting

* Suspend account

* Remove page role

* Lock group

* Escalate to specialist review

## 27.4 Moderation principles

* Do not expose private content broadly for moderation convenience.

* Use minimum necessary access.

* Log moderator access.

* Provide appeal pathways.

* Avoid relying solely on automated decisions.

* Preserve evidence according to retention policy.

* Distinguish reports from confirmed violations.

## 27.5 User reporting

A report should include:

* Reporter

* Target type

* Target ID

* Reason

* Optional description

* Evidence references

* Created time

* Status

* Reviewer

* Resolution

* Appeal state

# 28. Privacy and Data Governance

## 28.1 Data classification

|
Classification

|

Examples

|

Controls

|
| --- | --- | --- |
|

Public

|

Public posts, public page description

|

Public read policy

|
|

Internal

|

Operational metadata

|

Authenticated access

|
|

Private

|

Direct messages, solo notes

|

Scope-based access

|
|

Sensitive

|

Health, identity verification

|

Restricted access and audit

|
|

Highly sensitive

|

Credentials, encryption keys

|

Strong isolation, never exposed to model

|

## 28.2 Data access requirements

Every request must evaluate:

* Authentication

* Authorization

* Scope

* Membership

* Role

* Object ownership

* Consent

* Data classification

* Retention status

* Block/restriction state

## 28.3 Privacy controls

Users should be able to control:

* Profile visibility

* Follow visibility

* Online status

* Read receipts

* Message requests

* Group invitations

* Agent memory

* External notifications

* Location access

* Personalization

* Search history

* Data export

* Account deletion

## 28.4 Data export

The platform should support an export containing, where permitted:

* Profile data

* Public posts

* Private posts

* Messages

* Tasks

* Reminders

* Events

* Agent memories

* Consent history

* Account settings

Exports must be:

* Authenticated

* Time-limited

* Encrypted in transit

* Audited

* Expirable

## 28.5 Account deletion

Deletion workflow:

```
Deletion requested
  ↓
Re-authentication
  ↓
Grace period, if configured
  ↓
Disable account
  ↓
Revoke sessions and tokens
  ↓
Remove or anonymize content according to policy
  ↓
Delete private data
  ↓
Delete agent memories
  ↓
Delete external integration tokens
  ↓
Record completion
```

Some audit, abuse-prevention, or legal records may require limited retention, which must be documented.

# 29. Permissions and Authorization

## 29.1 Authorization model

Use a combination of:

* Role-based access control

* Resource-based access control

* Scope-based permissions

* Consent-based access

* Ownership checks

* Attribute-based conditions

## 29.2 Authorization decision inputs

```
User
Role
Resource
Resource scope
Action
Membership
Consent
Data classification
Relationship state
Account status
Time restrictions
Policy version
```

## 29.3 Example

A family admin may:

* Add members

* Create group announcements

* Assign group tasks

* Configure group reminders

A family admin may not automatically:

* Read a member’s private messages

* Read the member’s solo notes

* Read private couple content

* Access health information

* Export another member’s data

## 29.4 Permission acceptance criteria

* Every protected endpoint performs authorization.

* Client-side hiding is never treated as security.

* Permission changes take effect immediately or within a documented propagation window.

* Revoked agents cannot continue using previously granted tools.

* All sensitive access is logged.

# 30. Core Business Rules

## 30.1 Account rules

1. One verified account identity cannot be duplicated.

2. Suspended accounts cannot create new content.

3. Account deletion revokes active sessions.

4. Usernames, if supported, must be unique.

5. Sensitive profile fields are private by default.

## 30.2 Public content rules

1. Only authorized users can publish.

2. Public content must pass required moderation checks.

3. Private content cannot enter public discovery.

4. Deleted content must not appear in normal feeds.

5. Page content follows page-level roles.

## 30.3 Group rules

1. Membership must be explicitly recorded.

2. Invitations expire.

3. Removed members lose future access.

4. Group admins cannot automatically access private member spaces.

5. Couple groups have a maximum of two active human members.

6. Solo spaces have one owner by default.

7. Temporary groups can expire and become read-only.

## 30.4 Messaging rules

1. Only conversation members can read messages.

2. Messages are persisted before broadcast.

3. Client retries must not create duplicate logical messages.

4. Deleted messages follow retention policy.

5. External messages require consent and provider authorization.

## 30.5 Agent rules

1. The agent acts only within its scope.

2. The agent cannot grant itself permissions.

3. High-risk actions require approval.

4. The agent cannot claim a failed action succeeded.

5. Memory creation follows policy.

6. Tool calls are logged.

7. Agent loops have maximum steps and budgets.

8. Sensitive data is not sent to the model unless authorized.

9. Agent access is revocable.

10. Agent configuration changes are versioned.

## 30.6 Reminder rules

1. Reminders are stored durably.

2. Reminder execution is idempotent.

3. Users can cancel reminders.

4. Escalation requires explicit configuration.

5. Health reminders cannot modify dosage or treatment.

6. Notifications respect channel consent and quiet hours.

# 31. User Journeys

## 31.1 New user onboarding

```
Open application
  ↓
Create account
  ↓
Verify email or phone
  ↓
Accept required policies
  ↓
Set display name and time zone
  ↓
Choose interests, optional
  ↓
Configure privacy
  ↓
Enter home feed
```

### Success criteria

* User reaches the home feed.

* Privacy defaults are shown clearly.

* User is not forced to provide unnecessary sensitive data.

* User can skip optional profile fields.

## 31.2 Create a public page

```
Open Create
  ↓
Select Public Page
  ↓
Enter name and description
  ↓
Select category
  ↓
Configure visibility
  ↓
Confirm ownership
  ↓
Create page
  ↓
Add first post
```

### Success criteria

* Page is created only for authenticated users.

* Owner receives full page permissions.

* Page appears in discovery only if public and eligible.

* Page moderation policy is applied.

## 31.3 Create a family group

```
Open Groups
  ↓
Create Family Group
  ↓
Enter group name
  ↓
Configure privacy
  ↓
Invite members
  ↓
Members accept
  ↓
Group chat opens
  ↓
Optional shared agent setup
```

### Success criteria

* Invitations are tracked.

* Invitees can accept or reject.

* Group content is private by default.

* Agent access is not enabled silently.

* Admin role is clearly displayed.

## 31.4 Create a couple space

```
Create private space
  ↓
Select Couple
  ↓
Invite one partner
  ↓
Partner accepts
  ↓
Two-person space becomes active
  ↓
Configure shared tasks and agent permissions
```

### Success criteria

* A third active human member cannot be added.

* Private individual content remains private.

* Shared content requires clear scope selection.

## 31.5 Create a solo plan

```
Open Solo Space
  ↓
Tell agent a goal
  ↓
Agent asks clarification questions
  ↓
Agent drafts tasks
  ↓
User approves
  ↓
Tasks and reminders are created
  ↓
User tracks progress
```

### Success criteria

* The agent does not create unexpected external actions.

* Tasks are editable.

* Reminders are durable.

* User can delete the plan and related memory.

## 31.6 Family reminder escalation

```
Admin creates task
  ↓
Assigns task to member
  ↓
Member receives reminder
  ↓
Member acknowledges or completes
  ↓
If not acknowledged:
    retry
  ↓
If escalation threshold reached:
    notify admin
```

### Success criteria

* Escalation is configured in advance.

* The assigned member can see the escalation policy.

* Admin receives only the required status.

* The system does not reveal unrelated private content.

## 31.7 Public event planning

```
User creates public event page
  ↓
Adds event details
  ↓
Publishes announcement
  ↓
Users discover event
  ↓
Users RSVP
  ↓
Private organizer group coordinates tasks
  ↓
Agent drafts budget and schedule
  ↓
Organizer approves
```

### Success criteria

* Public event details are separated from private organizer discussions.

* Attendee information follows visibility settings.

* Agent cannot publish private planning information accidentally.

## 31.8 Agent approval flow

```
User asks agent to send message
  ↓
Agent drafts message
  ↓
System checks external-send permission
  ↓
Approval screen appears
  ↓
User reviews recipient and content
  ↓
User approves
  ↓
Provider sends message
  ↓
Delivery status is recorded
```

### Success criteria

* Recipient is clearly displayed.

* Message content can be edited.

* User can cancel.

* Failure is reported.

* Approval is recorded.

# 32. Functional Requirements by Priority

## 32.1 Must-have

### Identity

* Registration

* Login

* Verification

* Session management

* Profile

### Public community

* Public pages

* Page roles

* Text and image posts

* Comments

* Reactions

* Follows

* Search

* Basic discovery

* Reports

### Private spaces

* Family groups

* Couple spaces

* Solo spaces

* Custom groups

* Invitations

* Membership roles

* Group privacy

### Messaging

* Direct messages

* Group chat

* WebSocket realtime

* Message persistence

* Delivery and read status

* Unread counts

* Reconnect support

### Planning

* Tasks

* Assignment

* Due dates

* Basic reminders

* Shared events

* Notification preferences

### Agent

* Agent chat

* Scope-aware context

* Task drafting

* Reminder drafting

* Public search assistance

* Approval flow

* Tool audit log

* Basic memory controls

### Safety

* Reporting

* Blocking

* Basic moderation

* Privacy settings

* Account deletion request

* Data access controls

## 32.2 Should-have

* Polls

* Saved posts

* Hashtags

* Event RSVP

* Calendar view

* Recurring tasks

* Reminder escalation

* Page analytics

* Agent memory editor

* File attachments

* Email notifications

* Push notifications

* Advanced search filters

* Group rules

* Member approval workflows

* Content scheduling

* Data export

## 32.3 Could-have

* Video

* Audio rooms

* Voice calls

* External calendar integration

* Approved WhatsApp integration

* SMS integration

* Shared expenses

* OCR

* PDF summarization

* Agent-generated event budgets

* Recommendation engine

* Advanced personalization

* Translation

* Multi-language agent responses

## 32.4 Won’t-have in MVP

* Autonomous financial transactions

* Medical diagnosis

* Medication dosage decisions

* Unrestricted external communication

* Unofficial WhatsApp automation

* Full video-conferencing platform

* Public access to private agent memory

* Complex marketplace payments

* Fully decentralized identity

* Autonomous member removal

* Autonomous publishing of sensitive content

# 33. MVP Definition

## 33.1 MVP objective

Validate that users can:

1. Create an account.

2. Participate in public community content.

3. Create a private group or solo space.

4. Send reliable messages.

5. Create tasks and reminders.

6. Use an agent safely within a limited scope.

7. Maintain control over privacy and permissions.

## 33.2 MVP modules

### Client

* Android onboarding

* Android home feed

* Android public page

* Android post creation

* Android messages

* Android groups

* Android tasks

* Android agent chat

* Web equivalent for core workflows

### Backend

* Authentication

* Users and profiles

* Pages

* Posts

* Comments

* Reactions

* Follows

* Groups

* Invitations

* Conversations

* Messages

* Tasks

* Reminders

* Notifications

* Agent sessions

* Agent permissions

* Audit events

* Reports

### Infrastructure

* PostgreSQL

* Redis

* Object storage

* FastAPI

* WebSocket gateway

* Background worker

* Scheduler worker

* Notification worker

* LangGraph agent runtime

* Docker Compose

* CI tests

* Basic observability

## 33.3 MVP agent capabilities

The MVP agent may:

* Answer questions using authorized context

* Summarize visible conversation content

* Draft tasks

* Create personal reminders after confirmation

* Create group tasks after confirmation

* Summarize public pages

* Draft public posts

* Suggest event plans

* Explain pending actions

* Store user-approved preferences

The MVP agent should not:

* Send external messages

* Make calls

* Access health records

* Change permissions

* Remove members

* Publish without confirmation

* Use private content for discovery

* Execute financial actions

# 34. MVP Acceptance Criteria

## 34.1 Identity

* User registration and login work on Android and web.

* Verification state is enforced.

* Session revocation works.

* Unauthorized requests return appropriate errors.

## 34.2 Public pages and posts

* Authenticated users can create public pages.

* Page owners can assign roles.

* Authorized users can publish posts.

* Users can comment and react.

* Public content appears in public discovery.

* Private content never appears publicly.

## 34.3 Groups

* Users can create family, couple, solo, and custom spaces.

* Invitations can be sent and accepted.

* Couple spaces cannot exceed two active human members.

* Group membership changes are audited.

* Removed members cannot access new private content.

## 34.4 Messaging

* Messages persist before realtime delivery.

* Client retries do not duplicate messages.

* Users can reconnect and retrieve missed messages.

* Read and delivery states are recorded.

* Conversation access is membership-controlled.

## 34.5 Tasks and reminders

* Users can create and complete tasks.

* Tasks can be assigned to authorized members.

* Reminders are durable.

* Canceled reminders do not execute.

* Notification failures are recorded.

* Time zones are handled correctly.

## 34.6 Agent

* Agent context is limited to the current scope.

* Agent tool permissions are checked server-side.

* High-risk actions require approval.

* Failed actions are not reported as successful.

* Agent runs and tool calls are auditable.

* Users can delete saved memories.

* Agent access can be disabled.

## 34.7 Safety

* Users can report content.

* Users can block other users.

* Moderators can review reports.

* Sensitive data is excluded from public discovery.

* Health boundaries are enforced in prompts, tools, and backend policy.

* Account deletion revokes active sessions.

# 35. Non-Functional Requirements

## 35.1 Performance targets

Initial targets:

* API p95 for common reads: under 300 ms under expected MVP load

* API p95 for common writes: under 500 ms excluding external providers

* WebSocket message acknowledgement: under 500 ms under normal load

* Feed first meaningful response: under 2 seconds under normal conditions

* Agent first response token: target under 3 seconds where provider latency permits

* Reminder execution: within configured delivery tolerance

* Search response: under 1 second for common queries

These are targets, not guarantees. They must be validated through load testing.

## 35.2 Availability

Initial target:

* Core API availability: 99.5% or better for MVP

* Durable message persistence during transient realtime failure

* Background job retry

* Database backup and restore testing

* Graceful degradation when agent provider fails

## 35.3 Security

Required:

* TLS

* Secure password hashing

* Token rotation

* Server-side authorization

* Input validation

* Rate limiting

* CSRF protection where applicable

* Secure file uploads

* Secret management

* Audit logging

* Dependency scanning

* Container scanning

* Backup encryption

* Least-privilege service accounts

## 35.4 Scalability

The initial system should scale by independently increasing:

* API workers

* WebSocket workers

* Scheduler workers

* Notification workers

* Agent workers

* Search workers

* Media processing workers

The database schema and event model must not prevent later service extraction.

## 35.5 Observability

Track:

* Request latency

* Error rate

* WebSocket connections

* Message delivery latency

* Queue depth

* Job retries

* Scheduler lag

* Agent latency

* Agent tool failures

* Token and model usage

* Notification delivery

* Moderation queue size

* Database health

* Cache hit rate

* Permission-denied events

* Sensitive data access

# 36. API Requirements

## 36.1 API style

Use:

* REST for standard CRUD and queries

* WebSocket for realtime messaging

* gRPC for selected internal service communication

* Event/outbox pattern for asynchronous work

## 36.2 API principles

* Versioned endpoints

* OpenAPI specification

* Typed request and response schemas

* Cursor pagination

* Idempotency keys

* Consistent error format

* Request IDs

* Authorization on every protected operation

* Rate limits

* Backward compatibility policy

## 36.3 Example resource groups

```
/auth
/users
/profiles
/pages
/posts
/comments
/follows
/groups
/invitations
/conversations
/messages
/tasks
/reminders
/events
/notifications
/agents
/agent-runs
/agent-actions
/memories
/reports
/privacy
/data-export
```

## 36.4 Standard error format

JSON

```
{
  "error": {
    "code": "GROUP_MEMBERSHIP_REQUIRED",
    "message": "You must be a member of this group.",
    "request_id": "request-id",
    "details": {}
  }
}
```

Do not expose internal stack traces or sensitive policy details to clients.

# 37. Data Model Requirements

## 37.1 Required core entities

```
users
profiles
sessions
devices
pages
page_members
posts
post_media
comments
reactions
follows
groups
group_members
group_invitations
conversations
conversation_members
messages
message_receipts
tasks
task_assignments
reminders
events
event_attendees
notifications
notification_deliveries
agents
agent_configs
agent_permissions
agent_sessions
agent_runs
agent_steps
agent_actions
approval_requests
memory_items
memory_policies
consents
reports
moderation_actions
audit_events
outbox_events
scheduled_jobs
media_objects
```

## 37.2 General database rules

* Use UUIDs or another secure identifier.

* Use foreign keys.

* Use unique constraints.

* Use check constraints where appropriate.

* Store timestamps in UTC.

* Store user time zone separately.

* Add indexes based on actual query patterns.

* Use migrations.

* Avoid unbounded JSON as the primary data model.

* Encrypt or isolate sensitive fields where required.

* Use soft deletion only when justified.

* Define retention for every major entity.

# 38. Analytics and Product Measurement

## 38.1 Product metrics

### Activation

* Account completion rate

* First public interaction

* First private space creation

* First message sent

* First task created

* First agent interaction

### Engagement

* Daily active users

* Weekly active users

* Public posts created

* Comments

* Reactions

* Group messages

* Task completion rate

* Reminder acknowledgement rate

### Retention

* Day 1 retention

* Day 7 retention

* Day 30 retention

* Group activity retention

* Agent usage retention

### Trust and safety

* Reports per 1,000 posts

* Moderation response time

* False-positive appeal rate

* Block rate

* Spam rate

* Privacy incidents

* Unauthorized access attempts

### Agent quality

* User approval rate

* Tool success rate

* Tool failure rate

* Incorrect completion claims

* User correction rate

* Memory deletion rate

* Average run steps

* Cost per agent session

* Escalation rate

## 38.2 Analytics privacy

Do not collect unnecessary content.

Analytics should prefer:

* Event metadata

* Aggregated counts

* Pseudonymous identifiers

* Short retention

* Explicit consent where required

Private message bodies and private health data should not be used for ordinary product analytics.

# 39. Release Strategy

## Phase 0 — Foundation

* Repository setup

* CI/CD

* Authentication

* Database migrations

* API conventions

* Error handling

* Logging

* Basic Android/web shells

* Local Docker environment

## Phase 1 — Private communication

* Groups

* Invitations

* Conversations

* Messages

* WebSocket

* Receipts

* Notifications

## Phase 2 — Public community

* Pages

* Posts

* Comments

* Reactions

* Follows

* Discovery

* Reporting

## Phase 3 — Planning

* Tasks

* Events

* Reminders

* Scheduler

* Escalation

* Calendar views

## Phase 4 — Controlled agent

* Agent chat

* Scope-aware context

* Task drafting

* Reminder creation

* Approval requests

* Tool registry

* Audit trail

* Memory controls

## Phase 5 — Hardening

* Load testing

* Security testing

* Privacy review

* Disaster recovery

* Moderation operations

* Accessibility

* Localization

* Production readiness

# 40. Launch Readiness Checklist

## Product

* MVP workflows are documented.

* User-facing privacy explanations are complete.

* Empty, loading, error, and offline states exist.

* Account deletion is implemented.

* User reporting is available.

* Agent limitations are visible.

## Engineering

* Database migrations are reproducible.

* API schemas are versioned.

* WebSocket reconnect works.

* Idempotency is implemented.

* Background jobs are durable.

* Scheduler handles retries and duplicates.

* Secrets are not stored in source control.

* Backups are tested.

* Monitoring and alerting are configured.

## Security

* Authorization tests cover every protected resource.

* Private data cannot enter public discovery.

* Agent tools enforce permissions server-side.

* High-risk actions require approval.

* Sensitive access is audited.

* File uploads are validated.

* Rate limits are active.

* Dependency and container scans pass.

## AI

* Agent prompts are versioned.

* Tool schemas are validated.

* Runaway loops are limited.

* Model failures are handled.

* Memory creation is controlled.

* Memory deletion works.

* Health safety boundaries are enforced.

* Agent actions are explainable.

* Evaluation datasets exist.

* Human review exists for high-risk behavior.

## Operations

* Incident runbooks exist.

* Moderation escalation is defined.

* Support process is defined.

* Data retention is documented.

* Provider outage behavior is tested.

* Restore-from-backup procedure is tested.

* Cost limits and usage alerts are configured.

# 41. Final MVP Product Definition

The MVP is complete when a user can:

1. Create and secure an account.

2. Discover public pages and posts.

3. Create and manage a public page.

4. Publish public content.

5. Create a private family, couple, solo, or custom space.

6. Invite and manage members.

7. Send reliable private messages.

8. Create tasks, events, and reminders.

9. Receive notifications.

10. Use an agent within a restricted scope.

11. Approve or reject agent actions.

12. View and delete agent memories.

13. Report harmful content.

14. Block other users.

15. Control privacy and notification settings.

16. Export or delete account data.

17. Continue using core features when the agent or external provider is unavailable.

The central product boundary is:

> Public community content is for intentional public participation. Private spaces are for controlled coordination. Agents assist only within explicit permissions, consent, and scope.

This boundary should influence the database model, API authorization, mobile navigation, agent context assembly, notification system, moderation design, and every future feature.
