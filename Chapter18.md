# Chapter 18 — Identity, Profiles, Contacts, Membership, Invitations, Relationships, and Account Lifecycle Architecture

## 18.1 Purpose and Scope

This chapter defines the identity and membership foundation for the platform.

It covers:

* Account creation and authentication

* User identity and profiles

* Usernames, handles, and display names

* Email and phone verification

* Device and session management

* Contact discovery

* Family, couple, guardian, and trusted relationships

* Page and group membership

* Invitations and join requests

* Roles and permissions

* Account recovery

* Account deactivation and deletion

* Blocking, muting, and restricting

* Agent identity and delegated access

* Consent and communication preferences

* Data portability and privacy controls

This layer is foundational because every other domain depends on a reliable answer to:

> Who is this actor, what do they control, what are they allowed to access, and on whose behalf are they acting?

# 18.2 Core Identity Model

The platform must not treat all identity concepts as one database record.

The following concepts must remain separate.

```
Account
   │
   ├── Authentication Identity
   │      ├── Email credentials
   │      ├── Phone credentials
   │      ├── OAuth identity
   │      └── Passkey identity
   │
   ├── User Profile
   │      ├── Display name
   │      ├── Avatar
   │      ├── Bio
   │      ├── Language
   │      └── Privacy settings
   │
   ├── Memberships
   │      ├── Public pages
   │      ├── Family spaces
   │      ├── Couple spaces
   │      ├── Custom groups
   │      └── Event workspaces
   │
   ├── Relationships
   │      ├── Family relationship
   │      ├── Couple relationship
   │      ├── Guardian relationship
   │      └── Trusted relationship
   │
   ├── Devices and Sessions
   │
   ├── Consent and Preferences
   │
   └── Delegated Agent Access
```

## 18.2.1 Account

An account represents the platform-level owner.

It contains:

* Stable internal account ID

* Account status

* Creation timestamp

* Last activity timestamp

* Deletion state

* Security settings

* Legal and consent records

* Account recovery configuration

The internal account ID must be immutable.

Do not use email addresses or phone numbers as primary identifiers because they can change.

```
account_id = UUID or UUIDv7
```

## 18.2.2 Authentication Identity

Authentication identity answers:

> How does the user prove ownership of the account?

Examples:

* Email and password

* Phone OTP

* Passkey

* Google or Apple identity

* Enterprise identity provider

* Recovery code

* Trusted device

Authentication credentials must be stored separately from profile information.

## 18.2.3 Profile

A profile answers:

> How does the user appear to other users?

Profile data may include:

* Display name

* Username

* Avatar

* Cover image

* Bio

* Pronouns, if supported

* Language

* Timezone

* General region

* Interests

* Public links

* Profile visibility

Profile information must not automatically expose:

* Email address

* Phone number

* Exact location

* Private relationships

* Private group memberships

* Agent memory

* Emergency information

* Private files

## 18.2.4 Membership

Membership answers:

> What is the user’s relationship to a page, group, event, or workspace?

Examples:

* Owner

* Admin

* Moderator

* Organizer

* Member

* Viewer

* Guest

* Pending invitee

* Suspended member

* Removed member

Membership is scoped to a resource.

A user may be an administrator in one group and a normal member in another.

## 18.2.5 Relationship

Relationship answers:

> What connection exists between two accounts?

Examples:

* Family member

* Couple partner

* Parent or guardian

* Trusted contact

* Friend

* Colleague

* Care coordinator

* Emergency escalation contact

Relationships must be explicitly created, accepted, and revocable.

The platform must not infer sensitive relationships solely from:

* Contact-book matching

* Shared addresses

* Shared groups

* Message history

* Agent assumptions

* Similar names

# 18.3 Account Lifecycle

## 18.3.1 Account States

```
REGISTERED
   ↓
EMAIL_OR_PHONE_PENDING
   ↓
ACTIVE
   ├── SECURITY_REVIEW
   ├── TEMPORARILY_LOCKED
   ├── DEACTIVATED
   ├── DELETION_REQUESTED
   └── DELETED
```

Recommended state model:

|
State

|

Meaning

|
| --- | --- |
|

`pending_verification`

|

Account created but verification incomplete

|
|

`active`

|

Normal account operation

|
|

`restricted`

|

Some capabilities temporarily limited

|
|

`locked`

|

Authentication or security lock

|
|

`deactivated`

|

User has temporarily disabled account

|
|

`deletion_requested`

|

Deletion workflow is running

|
|

`deleted`

|

Personal account data removed or anonymized

|
|

`suspended`

|

Platform enforcement action

|
|

`banned`

|

Account permanently blocked from platform access

|

## 18.3.2 Registration Flow

```
User enters registration data
        ↓
Validate input
        ↓
Check abuse/rate limits
        ↓
Create pending account
        ↓
Create verification challenge
        ↓
Send email or phone verification
        ↓
User verifies
        ↓
Create initial profile
        ↓
Create default preferences
        ↓
Create initial device session
        ↓
Publish account-created event
        ↓
Account becomes active
```

Account creation must be idempotent.

If the same request is submitted multiple times, the backend must not create duplicate accounts.

Use:

```
Idempotency-Key
```

for registration and other account-mutating operations.

# 18.4 Authentication Architecture

## 18.4.1 Supported Authentication Methods

The authentication service should support a provider abstraction.

```
Authentication Provider
   ├── Email + Password
   ├── Phone OTP
   ├── Passkey / WebAuthn
   ├── Google OAuth
   ├── Apple Sign-In
   ├── Enterprise SSO
   └── Recovery Codes
```

The initial release may start with:

1. Email and password

2. Phone OTP

3. Google or Apple sign-in

4. Optional passkeys later

## 18.4.2 Password Requirements

Use:

* Argon2id password hashing

* Unique salt per password

* Password strength checks

* Breached-password detection where available

* Login rate limiting

* Failed-attempt monitoring

* Optional MFA

Never store:

* Plaintext passwords

* Reversible password encryption

* Password hints

* Passwords in logs

* Passwords in analytics events

## 18.4.3 Phone OTP

Phone OTP flow:

```
User enters phone number
        ↓
Normalize to E.164 format
        ↓
Apply rate limits
        ↓
Generate short-lived challenge
        ↓
Send OTP through provider
        ↓
User enters OTP
        ↓
Verify hash and expiry
        ↓
Consume challenge
        ↓
Create authenticated session
```

OTP rules:

* Short expiration

* Limited attempts

* Single use

* No OTP in logs

* No unlimited resend

* Device and IP risk checks

* Abuse monitoring

Phone numbers must not be publicly exposed by default.

## 18.4.4 Social Login

External identity records should be separate:

```
external_identity
- id
- account_id
- provider
- provider_subject
- email_snapshot
- created_at
- last_used_at
```

The stable provider subject must be used for account linking.

Do not rely only on the email address returned by an external provider.

# 18.5 Email and Phone Verification

Verification is not only an onboarding feature. It is also required for sensitive actions.

Verification may be required for:

* Account recovery

* Changing email

* Changing phone number

* Creating large public pages

* Inviting many members

* Adding external communication channels

* Accessing sensitive agent features

* Changing ownership

* Exporting personal data

* Deleting the account

## 18.5.1 Verification Challenge Model

```
verification_challenge
- id
- account_id
- channel_type
- destination_hash
- challenge_hash
- purpose
- expires_at
- attempt_count
- consumed_at
- created_at
- metadata
```

Possible purposes:

```
registration
login
change_email
change_phone
account_recovery
sensitive_action
external_channel_link
```

The system must distinguish between:

* Verified at least once

* Currently verified

* Verification recently completed

* Verification required again for sensitive action

# 18.6 Session and Device Management

A user may be logged in on:

* Android phone

* Tablet

* Desktop browser

* Multiple browser profiles

* Web application

* Trusted automation client

Each session must be independently revocable.

## 18.6.1 Device Record

```
device
- id
- account_id
- platform
- device_name
- app_version
- operating_system
- public_key
- push_token
- last_seen_at
- trusted_at
- revoked_at
```

Do not depend on raw device fingerprints as the only security mechanism.

## 18.6.2 Session Record

```
session
- id
- account_id
- device_id
- session_token_hash
- created_at
- last_used_at
- expires_at
- revoked_at
- ip_snapshot
- user_agent_snapshot
- authentication_strength
```

Recommended browser approach:

* Secure, HttpOnly cookies

* SameSite protection

* CSRF protection

* Short-lived access session

* Rotating refresh/session identifiers

* Server-side revocation

Avoid storing long-lived authentication tokens in browser `localStorage`.

## 18.6.3 Security Screens

Users should be able to:

* View active sessions

* See device and approximate location information

* See last activity

* Revoke one session

* Revoke all other sessions

* Mark a device as trusted

* Remove a push notification token

* Review recent security events

# 18.7 Profile Architecture

## 18.7.1 Profile Fields

```
profile
- account_id
- username
- display_name
- normalized_display_name
- bio
- avatar_file_id
- cover_file_id
- language
- timezone
- region_code
- profile_visibility
- discoverability
- created_at
- updated_at
```

Additional profile fields should be modular rather than adding every possible field to the main table.

Examples:

* Interests

* Skills

* Public links

* Work information

* Education

* Event preferences

* Accessibility preferences

## 18.7.2 Profile Visibility

Supported visibility levels:

```
public
registered_users
connections
space_members
selected_accounts
private
```

Visibility must be evaluated separately for each field where necessary.

Example:

|
Field

|

Visibility

|
| --- | --- |
|

Display name

|

Public

|
|

Avatar

|

Public

|
|

Bio

|

Registered users

|
|

Email

|

Private

|
|

Phone

|

Private

|
|

Timezone

|

Private or approximate

|
|

Group memberships

|

Private

|
|

Public posts

|

Public

|
|

Agent memory

|

Agent-authorized only

|

## 18.7.3 Exact Location

The profile should not expose exact location by default.

Possible location representations:

* Country

* State or province

* City

* Approximate region

* Hidden

Exact location should be stored only when required by a feature and should have:

* Explicit purpose

* Access restrictions

* Retention policy

* Audit logging

* User deletion controls

# 18.8 Usernames, Handles, and Display Names

These are different concepts.

## 18.8.1 Display Name

* Can contain spaces

* May not be unique

* Can use local languages

* May change over time

* Used for presentation

## 18.8.2 Username

* Unique within the platform

* Used for profile URLs

* Normalized for lookup

* Protected against impersonation

* Subject to reserved-name rules

Example:

```
display_name = "Ravi Kumar"
username = "ravi.kumar"
```

## 18.8.3 Handle Rules

Recommended rules:

* Case-insensitive uniqueness

* Unicode normalization

* Length limits

* Restricted symbols

* Reserved names

* Impersonation detection

* Change cooldown

* Previous-name protection where appropriate

Store both:

```
username_original
username_normalized
```

Do not expose internal account IDs in profile URLs if a stable public handle is available.

# 18.9 Contact Discovery and Address Book Matching

Contact discovery is privacy-sensitive.

The platform should not upload a user’s complete address book by default.

## 18.9.1 Safe Contact Discovery Model

```
User grants contact permission
        ↓
Explain purpose and retention
        ↓
Normalize local contacts
        ↓
Create protected identifiers
        ↓
Send only minimized matching data
        ↓
Server performs privacy-preserving lookup
        ↓
Return matched platform accounts
        ↓
Do not expose non-matches
```

Possible matching identifiers:

* Normalized phone number

* Normalized email address

Use keyed hashing or another privacy-preserving matching design.

Do not store raw address-book entries unless explicitly required and consented to.

## 18.9.2 Contact Permission States

```
not_requested
granted
denied
limited
revoked
```

The application must continue working if contact permission is denied.

Contact discovery must never be required for:

* Basic registration

* Reading public pages

* Creating a personal space

* Using the agent

* Sending normal in-platform messages

## 18.9.3 Contact Matching Restrictions

Contact matching must not automatically:

* Add friends

* Create family relationships

* Invite contacts

* Expose private group membership

* Reveal hidden profiles

* Send external messages

It may only show:

> “People you may know”

with privacy controls and opt-out support.

# 18.10 Relationships Architecture

Relationships should be explicit, scoped, and consent-based.

## 18.10.1 Relationship Types

```
family_member
couple_partner
parent
child
guardian
dependent
trusted_contact
care_coordinator
friend
colleague
custom
```

Some relationship types may require additional verification or mutual acceptance.

## 18.10.2 Relationship State Machine

```
PROPOSED
   ↓
PENDING_ACCEPTANCE
   ├── ACCEPTED
   ├── DECLINED
   ├── EXPIRED
   └── CANCELLED
```

For sensitive relationships:

```
PENDING_VERIFICATION
   ↓
PENDING_ACCEPTANCE
   ↓
ACTIVE
```

## 18.10.3 Relationship Record

```
relationship
- id
- requester_account_id
- target_account_id
- relationship_type
- directionality
- status
- label
- visibility
- requested_at
- accepted_at
- revoked_at
- expires_at
```

## 18.10.4 Family Relationships

Family spaces may contain:

* Adults

* Children

* Guardians

* Extended family

* Temporary participants

* Care coordinators

The platform must not automatically assume legal guardianship from a self-declared relationship.

Guardian-related features should use:

* Explicit declaration

* Consent

* Additional verification where required

* Restricted permissions

* Audit records

## 18.10.5 Couple Relationships

Couple relationships should support:

* Mutual invitation

* Shared space creation

* Shared schedules

* Shared tasks

* Shared files

* Shared agent access

* Private individual conversations

A couple relationship must not automatically grant access to:

* All private messages

* All personal files

* All private agent memory

* All account settings

* All external accounts

## 18.10.6 Trusted Contacts

A trusted contact may receive:

* Selected reminders

* Escalation notifications

* Event updates

* Safety-related alerts, if explicitly configured

The trusted contact must not automatically receive:

* Full medical history

* Private conversations

* Full agent memory

* Account passwords

* Unrelated notifications

# 18.11 Membership Architecture

Membership is always attached to a resource.

Supported resource types:

```
public_page
family_space
couple_space
solo_space
custom_group
event_workspace
temporary_space
organization
```

## 18.11.1 Membership States

```
invited
requested
pending_approval
active
muted
restricted
suspended
removed
left
expired
```

## 18.11.2 Membership Record

```
membership
- id
- resource_type
- resource_id
- account_id
- role_id
- status
- invited_by
- joined_at
- left_at
- removed_at
- expires_at
- notification_preferences
```

A unique constraint must prevent duplicate active memberships:

```
(resource_type, resource_id, account_id)
```

## 18.11.3 Membership Permissions

Permissions must be resource-scoped.

Examples:

```
resource.view
resource.post
resource.comment
resource.invite
resource.remove_member
resource.manage_roles
resource.manage_settings
resource.manage_files
resource.manage_budget
resource.manage_events
resource.manage_agent
resource.view_audit
```

Do not use only a global role such as `admin`.

A user can have:

```
Group A: owner
Group B: member
Public Page C: moderator
Event D: finance_manager
```

# 18.12 Invitations and Join Requests

## 18.12.1 Invitation Flow

```
Member selects invite
        ↓
Check inviter permission
        ↓
Check target resource policy
        ↓
Check abuse limits
        ↓
Create invitation
        ↓
Send in-app or external notification
        ↓
Recipient accepts or declines
        ↓
Create membership transactionally
        ↓
Emit membership-created event
```

## 18.12.2 Invitation Types

* Existing account invitation

* Email invitation

* Phone invitation

* Link invitation

* QR invitation

* Event invitation

* Role-specific invitation

* Temporary invitation

## 18.12.3 Invitation Security

Every invitation must support:

* Random high-entropy token

* Expiration

* Maximum uses

* Resource binding

* Inviter identity

* Role restrictions

* Revocation

* Abuse throttling

* Audit trail

Never place sensitive data inside invitation URLs.

## 18.12.4 Join Requests

For discoverable groups:

```
User requests access
        ↓
Group policy evaluated
        ↓
Admin or moderator reviews
        ↓
Approve / reject / request information
        ↓
Membership created if approved
```

Join requests must not reveal private group information before approval.

# 18.13 Roles and Permission Management

## 18.13.1 Role Types

Platform roles:

* User

* Verified user

* Support agent

* Safety reviewer

* Platform administrator

Resource roles:

* Owner

* Admin

* Moderator

* Organizer

* Finance manager

* Task manager

* Agent manager

* Member

* Guest

* Viewer

## 18.13.2 Permission Evaluation

Every protected action should evaluate:

```
actor identity
        +
account status
        +
resource ownership
        +
membership status
        +
role permissions
        +
relationship permissions
        +
object visibility
        +
consent
        +
policy restrictions
```

Example:

Python

Run

```
authorize(
    actor=account_id,
    action="file.read",
    resource=file_id,
    context={
        "space_id": space_id,
        "relationship": relationship,
        "consent": consent_state,
    },
)
```

## 18.13.3 Owner Protection

Important resources should have ownership transfer rules.

Ownership transfer may require:

* Current owner authentication

* Recent verification

* Recipient acceptance

* Confirmation screen

* Audit event

* Optional waiting period

* Recovery path

Agents must never transfer ownership without explicit authorization.

# 18.14 Account Recovery

Account recovery is a high-risk workflow.

## 18.14.1 Recovery Methods

* Verified email

* Verified phone

* Passkey

* Recovery codes

* Previously trusted device

* Identity verification process

* Support-assisted recovery

## 18.14.2 Recovery Flow

```
User requests recovery
        ↓
Apply rate limits
        ↓
Select available recovery methods
        ↓
Verify challenge
        ↓
Risk evaluation
        ↓
Require additional verification if needed
        ↓
Reset credentials
        ↓
Revoke risky sessions
        ↓
Notify user through existing channels
        ↓
Write security audit event
```

## 18.14.3 Recovery Protections

Recovery must not:

* Reveal whether an account exists

* Allow unlimited attempts

* Immediately trust a new device

* Preserve all sessions after credential reset

* Expose private profile information

* Allow external communication changes without verification

High-risk changes should trigger a security notification and temporary restrictions.

# 18.15 Deactivation and Account Deletion

Deactivation and deletion are different.

## 18.15.1 Deactivation

Deactivation is reversible.

Possible effects:

* Profile hidden

* New invitations disabled

* Agent runs paused

* Notifications reduced

* Public content behavior determined by policy

* Existing memberships retained but marked inactive

* Recovery remains available

## 18.15.2 Deletion

Deletion is a controlled workflow.

```
User requests deletion
        ↓
Recent authentication
        ↓
Show affected resources
        ↓
Confirm deletion
        ↓
Grace period
        ↓
Cancel option
        ↓
Revoke sessions and tokens
        ↓
Delete or anonymize account data
        ↓
Delete private files and derived indexes
        ↓
Remove agent memory
        ↓
Handle authored content according to policy
        ↓
Complete deletion
```

## 18.15.3 Shared Resource Handling

Before deletion, show the user:

* Pages they own

* Groups they own

* Events they organize

* Files they control

* Agent schedules

* External communication integrations

* Pending invitations

* Financial or contribution records

The system may require:

* Ownership transfer

* Resource deletion

* Admin reassignment

* Cancellation of scheduled actions

## 18.15.4 Content Authored by Deleted Users

Possible policy:

* Personal data removed

* Public posts anonymized where legally and technically appropriate

* Group messages handled according to messaging retention policy

* Audit records retained only when required

* Files deleted or transferred based on ownership policy

The deletion policy must be documented and predictable.

# 18.16 Data Portability

Users should be able to export their personal data.

## 18.16.1 Export Scope

Possible export categories:

* Profile

* Account settings

* Posts

* Comments

* Messages, where technically supported

* Groups and memberships

* Events

* Tasks

* Files

* Agent memory

* Schedules

* Consent records

* Security history

## 18.16.2 Export Flow

```
User requests export
        ↓
Recent authentication
        ↓
Select data categories
        ↓
Create export job
        ↓
Collect authorized records
        ↓
Generate archive
        ↓
Encrypt archive
        ↓
Create short-lived download link
        ↓
Notify user
        ↓
Expire archive
```

Exports should be:

* Asynchronous

* Rate limited

* Audited

* Expiring

* Encrypted

* Permission-aware

# 18.17 Blocking, Muting, and Restricting

These are different controls.

## 18.17.1 Blocking

Blocking prevents or limits direct interaction.

Possible effects:

* Cannot message

* Cannot invite

* Cannot follow

* Cannot comment on each other’s content

* Cannot see certain profile information

* Cannot add to groups, subject to admin policy

Blocking must not automatically erase shared group history.

## 18.17.2 Muting

Muting affects notifications and feed visibility.

Examples:

* Mute a user

* Mute a group

* Mute a conversation

* Mute a topic

* Mute agent notifications

## 18.17.3 Restricting

Restricting is useful for community moderation.

Examples:

* Comments require approval

* Posting rate limited

* Cannot create invitations

* Cannot use external communication tools

* Cannot start agent runs

* Read-only membership

## 18.17.4 Block Record

```
account_block
- id
- blocker_account_id
- blocked_account_id
- scope
- reason_code
- created_at
- expires_at
```

Blocking must be enforced at the API and service layer, not only in the UI.

# 18.18 Identity Verification and Badges

Verification must have a clear purpose.

Possible badge types:

```
email_verified
phone_verified
identity_verified
organization_verified
official_page
trusted_contributor
```

A verified email or phone must not be presented as proof of real-world identity.

## 18.18.1 Verification Rules

* Badge meaning must be visible

* Verification method must be documented

* Badge can be revoked

* Verification data must be protected

* No misleading visual similarity to government verification

* Verification must not bypass authorization

* Verification must not guarantee safety or accuracy

# 18.19 Multi-Account and Organization Identities

The platform may support multiple identity types.

```
Identity
   ├── Personal account
   ├── Public page identity
   ├── Organization identity
   ├── Event identity
   └── Agent identity
```

## 18.19.1 Page Identity

A page identity may have:

* Separate display name

* Avatar

* Public posts

* Page roles

* Followers

* Page agent

* Moderators

* Audit history

A page identity must not be confused with the personal account controlling it.

## 18.19.2 Organization Identity

Organizations may have:

* Organization profile

* Members

* Teams

* Roles

* Shared files

* Public pages

* Billing or subscription boundary, if later added

* Compliance contacts

* Organization agents

## 18.19.3 Acting as a Page

The backend must record both:

```
actor_account_id
acting_identity_id
```

Example:

```
actor_account_id = human user
acting_identity_id = community page
```

This is required for:

* Audit

* Moderation

* Security investigations

* Attribution

* Reversal of actions

# 18.20 Agent Identity and Delegated Access

Agents must not operate as invisible extensions of the user.

Each agent requires an identity and authorization boundary.

## 18.20.1 Agent Record

```
agent
- id
- owner_account_id
- agent_type
- display_name
- status
- model_policy_id
- tool_policy_id
- memory_policy_id
- created_at
```

## 18.20.2 Agent Permissions

An agent may be authorized for:

* Read selected conversations

* Read selected files

* Create drafts

* Create reminders

* Manage tasks

* Suggest events

* Send in-app notifications

* Send external notifications

* Request approvals

The default permission set must be minimal.

## 18.20.3 Delegated Access Token

A delegated agent session should include:

```
delegation_id
agent_id
owner_account_id
resource_scope
allowed_actions
expires_at
approval_policy
revoked_at
```

Example:

```
Agent A:
- Can read Family Group A
- Can create task drafts
- Can schedule reminders
- Cannot delete files
- Cannot transfer ownership
- Cannot send external messages without approval
```

## 18.20.4 Agent Attribution

Every agent action must record:

```
initiated_by_account_id
executed_by_agent_id
acting_identity_id
approval_id
tool_name
resource_id
```

The UI must clearly display:

* Human action

* Agent suggestion

* Agent execution

* Approved action

* Automated scheduled action

# 18.21 Consent and Communication Preferences

Consent must be explicit, scoped, and revocable.

## 18.21.1 Consent Categories

* Contact discovery

* Email communication

* Phone communication

* WhatsApp communication

* Voice calls

* Push notifications

* Agent access to files

* Agent access to conversations

* Agent memory storage

* Family escalation

* Calendar access

* External provider integration

* Location use

* Data export

* Marketing communication

## 18.21.2 Consent Record

```
consent_record
- id
- account_id
- consent_type
- scope_type
- scope_id
- version
- status
- granted_at
- revoked_at
- source
- evidence
```

Consent must not be represented only by a boolean if scope and history matter.

## 18.21.3 Communication Preferences

```
communication_preference
- account_id
- channel
- category
- enabled
- quiet_hours
- timezone
- minimum_priority
- updated_at
```

Examples:

```
in_app / security = always
push / group_activity = enabled
whatsapp / reminders = consent_required
voice / escalation = disabled
email / marketing = disabled
```

# 18.22 Data Model

A simplified relational model:

```
accounts
profiles
authentication_identities
password_credentials
verification_challenges
devices
sessions
security_events
usernames
external_identities

relationships
relationship_requests
trusted_contacts

resources
memberships
roles
permissions
role_permissions
membership_roles

invitations
join_requests
account_blocks
account_restrictions
account_mutes

consent_records
communication_preferences
notification_endpoints

agents
agent_delegations
agent_permissions

account_deletion_requests
data_export_jobs
```

## 18.22.1 Important Constraints

* Account IDs are immutable

* Authentication identities are unique per provider

* Usernames are unique after normalization

* Active memberships are unique per resource/account

* Relationship requests cannot be duplicated while pending

* Sessions can be revoked individually

* Consent records are append-only or versioned

* Deleted accounts cannot authenticate

* Agent delegation must expire or be revocable

* Ownership changes must be audited

# 18.23 API Architecture

All APIs should be versioned:

```
/api/v1
```

## 18.23.1 Authentication APIs

http

```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
POST   /auth/verify-email
POST   /auth/verify-phone
POST   /auth/request-otp
POST   /auth/verify-otp
POST   /auth/recover
POST   /auth/reset-password
```

## 18.23.2 Profile APIs

http

```
GET    /me
PATCH  /me
GET    /profiles/{username}
PATCH  /me/profile
POST   /me/avatar
DELETE /me/avatar
PATCH  /me/privacy
PATCH  /me/preferences
```

## 18.23.3 Session APIs

http

```
GET    /me/sessions
DELETE /me/sessions/{session_id}
POST   /me/sessions/revoke-others
GET    /me/security-events
```

## 18.23.4 Relationship APIs

http

```
POST   /relationships/requests
GET    /relationships
POST   /relationships/requests/{id}/accept
POST   /relationships/requests/{id}/decline
DELETE /relationships/{id}
PATCH  /relationships/{id}
```

## 18.23.5 Membership APIs

http

```
GET    /resources/{resource_id}/members
POST   /resources/{resource_id}/invitations
GET    /invitations
POST   /invitations/{id}/accept
POST   /invitations/{id}/decline
POST   /resources/{resource_id}/join-requests
POST   /join-requests/{id}/approve
POST   /join-requests/{id}/reject
PATCH  /memberships/{id}/role
DELETE /memberships/{id}
```

## 18.23.6 Account Lifecycle APIs

http

```
POST   /me/deactivate
POST   /me/reactivate
POST   /me/delete-request
DELETE /me/delete-request
POST   /me/export
GET    /me/export-jobs
GET    /me/export-jobs/{id}
```

## 18.23.7 Agent Delegation APIs

http

```
GET    /agents
POST   /agents
GET    /agents/{id}
PATCH  /agents/{id}
POST   /agents/{id}/delegations
GET    /agents/{id}/delegations
DELETE /agents/{id}/delegations/{delegation_id}
```

# 18.24 Domain Events

Important events:

```
account.created
account.activated
account.restricted
account.locked
account.deactivated
account.deletion_requested
account.deleted

authentication.identity_added
authentication.identity_removed
authentication.login_succeeded
authentication.login_failed
authentication.password_changed
authentication.recovery_completed

profile.updated
username.changed
profile.visibility_changed

device.registered
device.revoked
session.created
session.revoked

verification.requested
verification.completed
verification.expired

relationship.requested
relationship.accepted
relationship.declined
relationship.revoked

membership.invited
membership.join_requested
membership.created
membership.role_changed
membership.suspended
membership.removed
membership.left

invitation.created
invitation.accepted
invitation.declined
invitation.expired
invitation.revoked

account.blocked
account.unblocked
account.muted
account.restricted

consent.granted
consent.revoked

agent.created
agent.delegation_created
agent.delegation_revoked

data_export.requested
data_export.completed
data_export.expired
```

Events should contain:

```
event_id
event_type
aggregate_type
aggregate_id
actor_account_id
acting_identity_id
occurred_at
schema_version
correlation_id
```

Avoid placing sensitive raw data in event payloads.

# 18.25 Android Architecture

## 18.25.1 Required Screens

### Authentication

* Welcome

* Register

* Login

* Email verification

* Phone verification

* OTP entry

* Password reset

* Account recovery

* Passkey enrollment

* Security alerts

### Profile

* My profile

* Edit profile

* Username management

* Avatar management

* Profile preview

* Privacy settings

* Discoverability settings

* Communication preferences

### Security

* Active devices

* Active sessions

* Login history

* Change password

* MFA/passkey settings

* Recovery codes

* Revoke all sessions

### Relationships

* Relationships list

* Add relationship

* Pending requests

* Family relationship setup

* Couple relationship setup

* Trusted contacts

* Relationship permissions

* Remove relationship

### Membership

* Invitations

* Join requests

* Group members

* Member profile

* Role management

* Remove or restrict member

* Ownership transfer

### Account Lifecycle

* Deactivate account

* Delete account

* Export data

* Deletion status

## 18.25.2 Android State Model

Kotlin

```
sealed interface AccountUiState {
    data object Loading : AccountUiState
    data class Ready(
        val profile: Profile,
        val sessions: List<Session>,
        val relationships: List<Relationship>,
    ) : AccountUiState
    data class Error(val message: String) : AccountUiState
}
```

Use:

* ViewModel

* StateFlow

* Room cache

* Repository pattern

* WorkManager for export polling and recovery tasks

* Secure storage through Android Keystore

* Localized validation

* Offline read support for cached profile data

Sensitive actions must require online confirmation.

# 18.26 Web/Desktop Screens

Recommended routes:

```
/settings/profile
/settings/privacy
/settings/security
/settings/sessions
/settings/notifications
/settings/relationships
/settings/contacts
/settings/agents
/settings/data
/invitations
/join-requests
/resources/{id}/members
/resources/{id}/roles
```

## 18.26.1 Web Security

* HttpOnly secure cookies

* CSRF protection

* Content Security Policy

* No sensitive tokens in local storage

* Re-authentication for dangerous actions

* Session revocation

* Secure file previews

* Audit history for administrative changes

* Browser permission minimization

## 18.26.2 Responsive Design

The member-management UI must work on:

* Mobile browser

* Tablet

* Desktop

* Large administrative screens

On narrow screens:

* Use bottom sheets for role editing

* Use stacked member cards

* Keep destructive actions behind confirmation

* Avoid exposing private data in dense tables

# 18.27 Security and Privacy Architecture

## 18.27.1 Threats

Threats include:

* Credential stuffing

* OTP abuse

* Account takeover

* Session theft

* Email change attacks

* SIM-swap risk

* Invitation abuse

* Contact scraping

* Username impersonation

* Relationship spoofing

* Unauthorized agent delegation

* Privilege escalation

* Ownership takeover

* Data export abuse

* Deletion abuse

* Insider access

* Enumeration of private accounts

## 18.27.2 Required Controls

* Rate limiting

* IP and device risk signals

* Password hashing with Argon2id

* Session rotation

* Session revocation

* MFA/passkeys

* Generic authentication errors

* Email and phone verification

* Resource-level authorization

* Audit logs

* Consent enforcement

* Abuse detection

* Invitation limits

* Privacy-preserving contact matching

* Re-authentication for sensitive operations

* Secure deletion workflows

* Encryption in transit and at rest

## 18.27.3 Privacy Boundaries

The following must be private by default:

* Phone number

* Email address

* Exact location

* Private group membership

* Relationship details

* Agent memory

* Personal files

* Security events

* Recovery methods

* External integration credentials

# 18.28 Metrics and Observability

## 18.28.1 Authentication Metrics

* Registration success rate

* Verification completion rate

* Login success rate

* Failed login rate

* OTP delivery latency

* OTP failure rate

* Account recovery success rate

* Account takeover indicators

* Session revocation count

## 18.28.2 Membership Metrics

* Invitation acceptance rate

* Join request approval rate

* Membership creation latency

* Membership removal rate

* Role-change frequency

* Ownership transfer count

* Invitation abuse rate

## 18.28.3 Privacy Metrics

* Contact matching requests

* Contact matching opt-out rate

* Consent grant/revocation rate

* Data export requests

* Deletion completion time

* Unauthorized access attempts

* Agent delegation revocations

Logs must include:

```
request_id
correlation_id
account_id, when safe
resource_id, when safe
action
result
latency
failure_code
```

Never log:

* Passwords

* OTPs

* Session tokens

* Recovery codes

* Raw private contact books

* Full private messages

* Unredacted sensitive agent context

# 18.29 Failure Handling

## 18.29.1 Verification Provider Failure

If email, SMS, or OTP provider fails:

* Keep challenge state

* Allow controlled retry

* Apply resend limits

* Show clear status

* Provide alternate verification method where available

* Do not create duplicate challenges unnecessarily

## 18.29.2 Duplicate Invitation

Use a uniqueness check and idempotency key.

Possible response:

```
Invitation already pending
```

Do not create multiple active invitations for the same recipient and resource unless explicitly supported.

## 18.29.3 Concurrent Role Changes

Use:

* Transaction boundaries

* Version columns

* Optimistic concurrency

* Owner protection

* Audit records

If two admins modify a role simultaneously, one operation must fail safely or require refresh.

## 18.29.4 Account Deletion Failure

Deletion must be resumable.

Track:

```
deletion_job_id
current_stage
completed_stages
failed_stage
retry_count
last_error_code
```

Do not report deletion as complete until all required data domains have been processed.

## 18.29.5 Agent Delegation Failure

If delegation is revoked while an agent is running:

1. Mark delegation revoked

2. Cancel or pause affected run

3. Prevent further tool calls

4. Record audit event

5. Notify the user

6. Preserve safe execution history

# 18.30 Repository Structure

```
platform/
├── apps/
│   ├── android/
│   │   ├── feature-auth/
│   │   ├── feature-profile/
│   │   ├── feature-security/
│   │   ├── feature-relationships/
│   │   ├── feature-membership/
│   │   └── feature-settings/
│   │
│   └── web/
│       ├── app/
│       │   ├── auth/
│       │   ├── settings/
│       │   ├── invitations/
│       │   └── resources/
│       └── components/
│
├── backend/
│   ├── identity/
│   │   ├── accounts/
│   │   ├── authentication/
│   │   ├── verification/
│   │   ├── sessions/
│   │   ├── profiles/
│   │   ├── usernames/
│   │   ├── relationships/
│   │   ├── memberships/
│   │   ├── invitations/
│   │   ├── consent/
│   │   ├── recovery/
│   │   ├── deletion/
│   │   ├── exports/
│   │   └── agents/
│   │
│   ├── api/
│   ├── workers/
│   ├── events/
│   ├── policies/
│   └── migrations/
│
├── packages/
│   ├── api-contracts/
│   ├── protobuf/
│   ├── event-schemas/
│   ├── auth-client/
│   ├── permission-engine/
│   └── shared-types/
│
└── infrastructure/
    ├── postgres/
    ├── redis/
    ├── object-storage/
    ├── observability/
    └── deployment/
```

# 18.31 Final Architecture Decision

The identity system will use the following decisions:

1. Account, profile, membership, relationship, and agent identity remain separate concepts.

2. Account IDs are immutable and independent of email, phone, and username.

3. Authentication is handled by a dedicated identity module.

4. Authorization is evaluated at resource and action level.

5. Membership roles are resource-scoped.

6. Relationships require explicit creation and acceptance.

7. Contact discovery is opt-in and privacy-preserving.

8. Email and phone numbers are private by default.

9. Sessions and devices are individually revocable.

10. Account recovery is treated as a high-risk workflow.

11. Deletion is asynchronous, resumable, audited, and policy-driven.

12. Data export is asynchronous and protected by re-authentication.

13. Blocking, muting, and restricting are separate capabilities.

14. Page and organization identities are distinct from personal accounts.

15. Agents operate through explicit, scoped, revocable delegation.

16. External communication requires channel-specific consent.

17. Ownership transfers require confirmation and audit records.

18. All sensitive identity operations emit security and domain events.

19. The initial implementation should be a modular identity domain inside the backend, not a separate microservice.

20. The identity domain may be extracted later if scale, compliance, or organizational boundaries require it.

# 18.32 Acceptance Criteria

The implementation is complete when:

* Users can register and authenticate securely.

* Email and phone verification work with expiration and retry limits.

* Users can manage active sessions and devices.

* Profiles support visibility and discoverability settings.

* Usernames are normalized and unique.

* Contact discovery is opt-in and privacy-preserving.

* Users can create and accept explicit relationships.

* Family, couple, trusted-contact, and custom relationship types are supported.

* Resource memberships are unique and role-scoped.

* Invitations expire, can be revoked, and are rate limited.

* Join requests support approval and rejection.

* Roles and permissions are evaluated server-side.

* Account recovery is protected against abuse.

* Users can deactivate, delete, and export their data.

* Blocking, muting, and restricting are enforced across APIs.

* Page and organization identities are auditable.

* Agent delegations are scoped, expirable, and revocable.

* Consent is stored with scope and history.

* Sensitive identity data is excluded from logs.

* Security events are observable.

* Deletion and export jobs are resumable.

* Android and web clients share API contracts.

* Automated tests cover authorization, account recovery, membership changes, and deletion.
