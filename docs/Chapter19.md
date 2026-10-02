# Chapter 19 — Conversations, Messaging, End-to-End Encryption, Presence, Delivery, and Realtime Communication Architecture

## 19.1 Purpose and Scope

This chapter defines the communication architecture for:

* One-to-one conversations

* Family group conversations

* Couple conversations

* Custom group chats

* Public-page discussions

* Event discussions

* Agent conversations

* Human-to-agent messages

* Agent-to-agent messages

* Announcements

* System notifications

* Presence and typing indicators

* Message delivery and read states

* Attachments and media

* End-to-end encryption

* Message search

* Message editing and deletion

* Moderation and reporting

* Offline synchronization

* Realtime event delivery

The messaging system must support fast interaction while preserving:

* Privacy

* Authorization

* Ordering

* Reliability

* Offline operation

* Message integrity

* Auditability for administrative actions

* Clear distinction between human and agent activity

# 19.2 Communication Domain Principles

The messaging system must follow these principles:

1. Messages belong to a conversation.

2. Conversations belong to a communication scope.

3. Every participant has an explicit membership or authorization relationship.

4. Message ordering is scoped to a conversation.

5. Delivery state is separate from read state.

6. Presence is ephemeral and must not be treated as permanent data.

7. Attachments are separate objects with independent authorization.

8. Agents receive only explicitly authorized context.

9. End-to-end encryption and server-side agent processing require a deliberate cryptographic design.

10. Message sending must be idempotent.

11. Realtime delivery must be recoverable through synchronization.

12. Deleted or edited messages must have defined behavior for caches, search indexes, notifications, and exports.

# 19.3 Communication Model

```
Account
   │
   └── Conversation Membership
           │
           └── Conversation
                   │
                   ├── Messages
                   ├── Participants
                   ├── Attachments
                   ├── Reactions
                   ├── Read States
                   ├── Delivery States
                   ├── Typing State
                   ├── Presence State
                   ├── Agent Participants
                   ├── Moderation Events
                   └── Encryption Metadata
```

## 19.3.1 Conversation Types

```
direct
group
family
couple
custom
event
page_discussion
announcement
agent
agent_human
agent_group
system
```

## 19.3.2 Conversation Visibility

```
private
members_only
public
restricted
temporary
archived
```

Visibility is not the same as membership.

A public conversation may still restrict:

* Who can post

* Who can reply

* Who can attach files

* Who can mention users

* Who can start agent runs

# 19.4 Conversation Lifecycle

```
DRAFT
   ↓
CREATED
   ↓
ACTIVE
   ├── MUTED
   ├── ARCHIVED
   ├── RESTRICTED
   ├── LOCKED
   └── DELETED
```

## 19.4.1 Conversation States

|
State

|

Meaning

|
| --- | --- |
|

`draft`

|

Not yet visible to participants

|
|

`active`

|

Messages may be sent

|
|

`muted`

|

Notification behavior changed

|
|

`restricted`

|

Posting limited to selected roles

|
|

`locked`

|

No new messages allowed

|
|

`archived`

|

Historical conversation

|
|

`deleted`

|

Conversation removed according to policy

|
|

`temporary`

|

Automatically expires

|

A locked conversation may remain readable.

# 19.5 Conversation Membership

Every private conversation requires explicit membership.

## 19.5.1 Participant Roles

```
owner
admin
moderator
organizer
member
guest
viewer
agent
system
```

## 19.5.2 Participant Permissions

```
conversation.view
conversation.send
conversation.reply
conversation.edit_own
conversation.delete_own
conversation.delete_any
conversation.add_member
conversation.remove_member
conversation.change_roles
conversation.pin_message
conversation.manage_settings
conversation.attach_files
conversation.start_agent_run
conversation.manage_agent
conversation.view_audit
```

Permissions must be evaluated against:

* Account status

* Conversation membership

* Resource membership

* Role

* Block status

* Conversation policy

* Message sensitivity

* Agent delegation

* Current restrictions

## 19.5.3 Participant Record

```
conversation_participant
- id
- conversation_id
- account_id
- participant_type
- role
- status
- joined_at
- left_at
- muted_until
- last_read_sequence
- last_delivered_sequence
- notification_policy
```

For agents:

```
agent_id
delegation_id
```

must also be recorded.

# 19.6 Message Model

A message is an immutable event with controlled mutable metadata.

## 19.6.1 Message Record

```
message
- id
- conversation_id
- sender_account_id
- sender_agent_id
- acting_identity_id
- client_message_id
- conversation_sequence
- message_type
- body_ciphertext
- body_preview
- reply_to_message_id
- thread_root_message_id
- status
- created_at
- edited_at
- deleted_at
- expires_at
- encryption_version
- metadata
```

Important fields:

* `client_message_id` prevents duplicate sends.

* `conversation_sequence` supports ordering.

* `sender_agent_id` identifies agent-generated messages.

* `acting_identity_id` identifies a page or organization acting through an agent.

* `encryption_version` supports future cryptographic migration.

## 19.6.2 Message Types

```
text
image
video
audio
file
location
poll
event_reference
task_reference
budget_reference
system
agent_status
approval_request
approval_result
call_event
membership_event
announcement
```

Message types should use structured payloads instead of encoding all information inside plain text.

# 19.7 Message Sending Flow

```
Client creates client_message_id
        ↓
Client encrypts message if required
        ↓
Client sends message command
        ↓
Authenticate session
        ↓
Authorize conversation membership
        ↓
Check block/restriction/policy
        ↓
Validate message schema
        ↓
Check idempotency
        ↓
Persist message transactionally
        ↓
Assign conversation sequence
        ↓
Write outbox event
        ↓
Return accepted message
        ↓
Fan out realtime event
        ↓
Process notifications
        ↓
Update delivery state
```

The server must not rely on the client timestamp for ordering.

Use the server-assigned conversation sequence.

# 19.8 Idempotency and Duplicate Prevention

Mobile networks frequently retry requests.

Every message send must include:

http

```
Idempotency-Key: <unique-request-key>
```

or:

JSON

```
{
  "client_message_id": "device-generated-uuid",
  "conversation_id": "conversation-id",
  "content": "..."
}
```

A unique constraint should exist on:

```
conversation_id + sender_account_id + client_message_id
```

If a duplicate request arrives:

* Return the original message

* Do not create another message

* Do not send duplicate notifications

* Do not duplicate agent processing

# 19.9 Message Ordering

Ordering must be defined explicitly.

## 19.9.1 Conversation Sequence

Each conversation has a monotonically increasing sequence:

```
conversation_sequence = 1, 2, 3, 4, ...
```

The sequence is used for:

* Synchronization

* Pagination

* Realtime event ordering

* Read receipts

* Delivery tracking

* Conflict resolution

## 19.9.2 Ordering Guarantees

Recommended guarantee:

> Messages are ordered within one conversation, but not globally across the entire platform.

Do not attempt to maintain one global message order across all users and conversations.

## 19.9.3 Concurrent Messages

If two users send messages simultaneously:

* The server assigns sequence numbers

* Both messages remain valid

* The UI displays server order

* The client may temporarily display optimistic order

* Reconciliation corrects the final order

# 19.10 Delivery and Read States

Delivery and read are separate.

## 19.10.1 Message State

```
pending
accepted
sent
delivered
read
failed
deleted
expired
```

For group conversations, aggregate state is insufficient.

A message may be:

* Delivered to some participants

* Read by some participants

* Not yet delivered to offline participants

## 19.10.2 Per-Participant Delivery

```
message_delivery
- id
- message_id
- participant_id
- delivered_at
- read_at
- delivery_status
```

For large groups, storing one row per message per participant may be expensive.

Alternative:

```
conversation_participant.last_delivered_sequence
conversation_participant.last_read_sequence
```

Use per-message delivery rows only when necessary, such as:

* Direct conversations

* Small groups

* Explicit delivery tracking

* Compliance-sensitive workflows

## 19.10.3 Read Receipts

Read receipts should be configurable.

Options:

* Everyone

* Contacts only

* Direct conversations only

* Disabled

* Per-conversation setting

System and security messages may have separate acknowledgement requirements.

# 19.11 Offline-First Messaging

The Android and web clients must support temporary offline operation.

## 19.11.1 Local Message States

```
local_draft
queued
sending
accepted
delivered
read
retrying
failed
```

## 19.11.2 Offline Send Flow

```
User sends message offline
        ↓
Save to local database
        ↓
Mark as queued
        ↓
WorkManager or reconnect handler
        ↓
Send with client_message_id
        ↓
Server deduplicates
        ↓
Replace local temporary ID with server ID
        ↓
Update sequence and status
```

The client must not silently lose queued messages.

## 19.11.3 Conflict Handling

Possible conflicts:

* Message was deleted remotely

* User was removed from the conversation

* Conversation was locked

* Encryption keys are outdated

* Attachment upload expired

* Session was revoked

The UI must display actionable status rather than a generic failure.

# 19.12 Realtime Transport

## 19.12.1 Recommended Transport

Use:

* HTTPS REST for commands and history

* WebSocket for realtime events

* Push notifications for background wake-up

* Optional WebRTC for voice/video later

* gRPC for internal backend communication

  Android/Web
  │
  ├── HTTPS → API
  ├── WebSocket → Realtime Gateway
  └── Push Provider → Device Wake-up

  Backend
  │
  ├── Message Service
  ├── Presence Service
  ├── Notification Service
  ├── Queue/Stream
  └── WebSocket Fanout

## 19.12.2 WebSocket Connection Lifecycle

```
CONNECTING
   ↓
AUTHENTICATING
   ↓
CONNECTED
   ↓
SUBSCRIBED
   ├── RECONNECTING
   ├── REAUTHENTICATING
   ├── CLOSED
   └── FAILED
```

The client must send:

JSON

```
{
  "type": "connection.resume",
  "last_event_sequence": 12045
}
```

The server should replay missed events when available.

If the event history is unavailable, return:

JSON

```
{
  "type": "sync.required",
  "conversation_ids": ["..."]
}
```

The client then fetches authoritative state through REST.

# 19.13 Realtime Event Envelope

Every event should use a common envelope.

JSON

```
{
  "event_id": "event-uuid",
  "event_type": "message.created",
  "event_version": 1,
  "conversation_id": "conversation-uuid",
  "conversation_sequence": 245,
  "occurred_at": "2026-09-18T12:00:00Z",
  "correlation_id": "request-uuid",
  "payload": {}
}
```

Event categories:

```
message.created
message.updated
message.deleted
message.reaction_added
message.reaction_removed
message.delivery_updated
message.read_updated
conversation.created
conversation.updated
conversation.member_added
conversation.member_removed
conversation.locked
typing.started
typing.stopped
presence.updated
agent.run_started
agent.run_updated
agent.run_completed
approval.requested
approval.completed
```

Do not send events to a client before checking that the recipient is authorized to receive them.

# 19.14 Presence Architecture

Presence is ephemeral.

## 19.14.1 Presence States

```
online
away
busy
do_not_disturb
offline
invisible
```

Presence may be scoped to:

* Entire account

* Conversation

* Workspace

* Agent availability

## 19.14.2 Presence Storage

Use Redis with TTL:

```
presence:{account_id}
```

Example:

JSON

```
{
  "status": "online",
  "device_id": "device-id",
  "last_seen_at": "2026-09-18T12:00:00Z",
  "expires_at": "2026-09-18T12:00:30Z"
}
```

Presence must expire automatically if heartbeats stop.

Do not store every heartbeat in PostgreSQL.

## 19.14.3 Privacy Controls

Users may choose:

* Show online status

* Show last seen

* Show typing status

* Show read receipts

* Hide presence from selected users

* Show presence only to contacts

Presence should be approximate where exact timing is not necessary.

# 19.15 Typing Indicators

Typing indicators are transient events.

JSON

```
{
  "type": "typing.started",
  "conversation_id": "conversation-id",
  "account_id": "account-id"
}
```

Rules:

* Do not persist typing events permanently

* Use short TTL

* Rate limit typing events

* Stop typing after inactivity timeout

* Do not expose typing status to unauthorized users

* Support agent typing/status indicators separately

For agents, use status such as:

```
thinking
retrieving
waiting_for_approval
executing_tool
composing
completed
```

Do not expose hidden reasoning traces.

# 19.16 End-to-End Encryption Architecture

End-to-end encryption requires a clear definition.

> A message is end-to-end encrypted when only authorized endpoints possess the keys needed to decrypt its content.

The backend may store:

* Ciphertext

* Message metadata

* Sender and conversation identifiers

* Encrypted attachment keys

* Key version

* Delivery metadata

The backend must not automatically possess plaintext decryption keys for true E2E conversations.

# 19.17 E2E Encryption Modes

The platform should distinguish multiple encryption modes.

## 19.17.1 Standard Server-Readable Mode

Used where the platform requires:

* Server-side search

* Server-side moderation

* Agent processing

* Message indexing

* Cross-device recovery

* Administrative content review

Content is encrypted in transit and at rest, but the authorized backend can process plaintext.

This is not true end-to-end encryption.

## 19.17.2 True E2E Mode

Used for private human conversations.

Properties:

* Keys generated and controlled by endpoints

* Server stores ciphertext

* Message content cannot be read by normal backend services

* Server-side full-text search is unavailable

* Server-side moderation is limited

* Agent access requires explicit cryptographic participation

## 19.17.3 E2E with Agent Participation

An agent cannot read true E2E messages merely because the user owns the agent.

Possible designs:

### Design A — Agent as an Authorized Conversation Device

The agent receives a device identity and conversation key material after explicit consent.

```
Human devices
      +
Authorized agent device
      ↓
Shared conversation encryption group
```

### Design B — User-Approved Message Forwarding

The user explicitly forwards selected messages to the agent.

```
Encrypted message
      ↓
User decrypts locally
      ↓
User selects content
      ↓
Content encrypted for agent
      ↓
Agent processes forwarded content
```

### Design C — Local Agent Processing

The agent runs on the user’s trusted device and receives decrypted content locally.

This provides stronger privacy but increases device complexity.

The architecture must not claim true E2E if the server or agent backend can decrypt all messages.

# 19.18 Encryption Key Architecture

## 19.18.1 Key Types

```
account identity key
device key
conversation key
message encryption key
attachment key
agent device key
backup key
```

## 19.18.2 Key Metadata

```
encryption_key
- id
- owner_type
- owner_id
- key_type
- public_key
- encrypted_private_key
- version
- status
- created_at
- revoked_at
```

Private keys should be protected by:

* Android Keystore

* Secure enclave where available

* Browser WebCrypto and protected storage

* Hardware-backed key storage where available

* Encrypted backups with user-controlled recovery material

## 19.18.3 Key Rotation

Rotate keys when:

* Device is removed

* User leaves a private group

* User is removed from a conversation

* Device is compromised

* Encryption version changes

* Agent access is revoked

The system must define whether old messages remain readable to removed participants.

This is a policy decision and must be communicated clearly.

# 19.19 Message Metadata and Privacy

Even when message content is encrypted, metadata may reveal:

* Sender

* Recipient

* Conversation membership

* Message timing

* Message size

* Device information

* Delivery status

* Attachment type

The platform should minimize metadata where practical.

Avoid exposing:

* Exact presence to unauthorized users

* Hidden group membership

* Private conversation titles

* Message previews in push notifications

* Sensitive file names

* Medical or financial content in notifications

For sensitive messages, use:

```
“You have a new private message.”
```

instead of including the message body.

# 19.20 Attachments and Media

Attachments must be separate resources.

## 19.20.1 Attachment Flow

```
Client requests upload authorization
        ↓
Server checks conversation permission
        ↓
Server returns short-lived upload URL
        ↓
Client uploads encrypted or validated file
        ↓
Upload completion event
        ↓
File scan and processing
        ↓
Attachment linked to message
        ↓
Realtime message event
```

## 19.20.2 Attachment Record

```
message_attachment
- id
- message_id
- file_id
- attachment_type
- encrypted_file_key
- thumbnail_file_id
- processing_status
- created_at
```

## 19.20.3 Attachment Security

* Short-lived upload URLs

* File size limits

* MIME validation

* File signature validation

* Malware scanning

* Quarantine

* Image metadata stripping

* Safe thumbnail generation

* Parser isolation

* Authorization on every download

* No public object-storage buckets

* Encryption key separation

# 19.21 Message Editing and Deletion

## 19.21.1 Editing

Recommended rules:

* Users may edit their own messages within a time window

* Admins may edit only system-generated content or use moderation actions

* Edited messages show an edited marker

* Original content may be retained in restricted audit storage where required

* E2E clients must synchronize edit events securely

## 19.21.2 Deletion Types

```
delete_for_me
delete_for_everyone
moderator_remove
retention_expired
temporary_message_expired
```

Deletion semantics must be explicit.

For true E2E messaging, the server may be unable to guarantee deletion from every already-authorized device.

The UI must not promise impossible deletion guarantees.

# 19.22 Reactions, Replies, Threads, and Mentions

## 19.22.1 Reactions

```
message_reaction
- message_id
- account_id
- reaction_type
- created_at
```

Unique constraint:

```
message_id + account_id + reaction_type
```

## 19.22.2 Replies

A reply references:

```
reply_to_message_id
```

The client should display:

* Original sender

* Short preview

* Message type

* Navigation to original message

## 19.22.3 Threads

Threads may be supported for:

* Public posts

* Event planning

* Group decisions

* Agent proposals

* Moderation discussions

Thread membership and visibility must be inherited from the parent conversation unless explicitly overridden.

## 19.22.4 Mentions

Mentions require:

* Participant validation

* Privacy checks

* Notification preferences

* Rate limiting

* Abuse controls

Do not allow arbitrary mention spam in large groups.

# 19.23 Agent Messaging Architecture

Agents are communication participants, not invisible background processes.

## 19.23.1 Agent Participant Types

```
personal_agent
family_agent
couple_agent
community_agent
event_agent
moderation_agent
notification_agent
system_agent
```

## 19.23.2 Agent Message Attribution

Every agent message must display:

* Agent name

* Agent type

* Acting scope

* Whether it is a suggestion or completed action

* Approval status where applicable

* Timestamp

* Related run ID when useful

Example:

```
Family Assistant
Suggested reminder — awaiting approval
```

## 19.23.3 Agent Context Rules

An agent may access only:

* Current conversation

* Authorized resource data

* Approved files

* Allowed memory scopes

* Relevant tasks/events

* Explicitly shared messages

The agent must not automatically read:

* All user conversations

* All family conversations

* All private files

* All relationship details

* All account data

## 19.23.4 Agent Output Types

```
informational_reply
draft_message
task_proposal
event_proposal
reminder_proposal
approval_request
tool_result
escalation_notice
error_notice
```

Important actions must use structured messages instead of plain text.

# 19.24 Moderation and Reporting

Messaging moderation depends on encryption mode.

## 19.24.1 Server-Readable Conversations

The platform may support:

* Automated abuse detection

* Spam detection

* Malware scanning

* User reports

* Moderator review

* Rate limits

* Content classification

## 19.24.2 True E2E Conversations

The platform may rely on:

* User reports with selected message submission

* Client-side safety classifiers

* Metadata-based abuse detection

* Account behavior signals

* Rate limits

* Block and report controls

* Device-level protections

A user report should allow the reporter to submit selected content with clear consent.

## 19.24.3 Reporting Record

```
message_report
- id
- reporter_account_id
- conversation_id
- message_id
- reason_code
- submitted_content_snapshot
- status
- reviewer_id
- created_at
```

Reports must not automatically expose unrelated conversation content.

# 19.25 Search Architecture

Search behavior depends on encryption mode.

## 19.25.1 Server-Readable Search

Use:

* PostgreSQL full-text search

* Trigram matching

* Search index

* Permission filters

* Conversation filters

* Date filters

* Sender filters

* Attachment filters

## 19.25.2 E2E Search

Possible approaches:

* Local device search

* Encrypted search indexes

* Search only messages cached on the device

* User-triggered local reindexing

Do not claim server-side search over plaintext if the server cannot decrypt the messages.

# 19.26 Notification Architecture

Message notifications should be generated through the notification service.

## 19.26.1 Notification Rules

Evaluate:

* User preference

* Conversation mute

* Quiet hours

* Mention status

* Priority

* Sender relationship

* Block status

* Message sensitivity

* Device availability

* External-channel consent

## 19.26.2 Notification Payload

For normal messages:

JSON

```
{
  "type": "new_message",
  "conversation_id": "conversation-id",
  "message_id": "message-id"
}
```

For sensitive conversations:

JSON

```
{
  "type": "private_message",
  "conversation_id": "conversation-id"
}
```

Do not send plaintext message bodies through push providers for sensitive conversations.

# 19.27 APIs

## 19.27.1 Conversation APIs

http

```
POST   /conversations
GET    /conversations
GET    /conversations/{id}
PATCH  /conversations/{id}
DELETE /conversations/{id}
POST   /conversations/{id}/archive
POST   /conversations/{id}/lock
POST   /conversations/{id}/unlock
```

## 19.27.2 Participant APIs

http

```
GET    /conversations/{id}/participants
POST   /conversations/{id}/participants
DELETE /conversations/{id}/participants/{account_id}
PATCH  /conversations/{id}/participants/{account_id}
POST   /conversations/{id}/leave
```

## 19.27.3 Message APIs

http

```
GET    /conversations/{id}/messages
POST   /conversations/{id}/messages
GET    /messages/{id}
PATCH  /messages/{id}
DELETE /messages/{id}
POST   /messages/{id}/reactions
DELETE /messages/{id}/reactions/{reaction}
POST   /messages/{id}/report
```

## 19.27.4 Read and Delivery APIs

http

```
POST   /conversations/{id}/read
POST   /conversations/{id}/delivered
GET    /conversations/{id}/unread-count
```

## 19.27.5 Encryption APIs

http

```
POST   /devices/{id}/keys
GET    /conversations/{id}/encryption-metadata
POST   /conversations/{id}/key-rotation
POST   /conversations/{id}/devices
DELETE /conversations/{id}/devices/{device_id}
```

## 19.27.6 Realtime WebSocket Commands

JSON

```
{
  "type": "subscribe",
  "conversation_ids": ["conversation-id"]
}
```

JSON

```
{
  "type": "typing.start",
  "conversation_id": "conversation-id"
}
```

JSON

```
{
  "type": "read.update",
  "conversation_id": "conversation-id",
  "sequence": 245
}
```

# 19.28 Database Model

Core tables:

```
conversations
conversation_participants
conversation_roles
conversation_settings

messages
message_versions
message_delivery
message_reactions
message_mentions
message_attachments
message_reports

conversation_events
message_outbox
message_retention_policies

devices
device_keys
conversation_keys
key_distribution_events

presence_states
typing_states

agent_participants
agent_message_links
agent_run_messages

notification_preferences
notification_deliveries
```

## 19.28.1 Recommended Indexes

```
messages(conversation_id, conversation_sequence)
messages(conversation_id, created_at)
messages(sender_account_id, created_at)
conversation_participants(account_id, status)
message_delivery(message_id, participant_id)
message_reactions(message_id)
message_mentions(account_id, created_at)
```

For large conversations, partitioning may be introduced by:

* Conversation group

* Time range

* Tenant or organization

* Message creation month

Do not partition prematurely.

# 19.29 Android Screens

## 19.29.1 Conversation Screens

* Conversation list

* Direct chat

* Group chat

* Family chat

* Couple chat

* Event chat

* Public discussion

* Agent chat

* Announcement feed

* Archived conversations

* Muted conversations

## 19.29.2 Chat Components

* Message list

* Message composer

* Reply preview

* Attachment picker

* Upload progress

* Voice recording interface

* Emoji/reaction picker

* Mention selector

* Thread view

* Read receipt indicator

* Delivery status

* Typing indicator

* Agent status indicator

* Approval card

* Task/event preview card

* Message search

* Conversation settings

* Member list

* Encryption information

## 19.29.3 Android Local Data

Use Room tables for:

```
LocalConversation
LocalParticipant
LocalMessage
LocalAttachment
LocalReaction
LocalOutboxMessage
LocalSyncCursor
LocalReadState
```

The UI should render from Room first and synchronize with the backend.

# 19.30 Web/Desktop Screens

Recommended routes:

```
/messages
/messages/{conversation_id}
/messages/{conversation_id}/search
/messages/{conversation_id}/members
/messages/{conversation_id}/settings
/messages/{conversation_id}/encryption
/messages/{conversation_id}/files
/messages/{conversation_id}/threads
```

## 19.30.1 Desktop Layout

```
Conversation Sidebar
        │
        ├── Search
        ├── Filters
        ├── Unread groups
        └── Archived conversations

Main Chat Area
        │
        ├── Header
        ├── Message timeline
        ├── Thread panel
        └── Composer

Context Panel
        │
        ├── Members
        ├── Files
        ├── Tasks
        ├── Events
        ├── Agent
        └── Settings
```

On mobile widths, the context panel should become a separate route or bottom sheet.

# 19.31 Performance and Scaling

## 19.31.1 Performance Targets

Initial targets should be defined as service-level objectives.

Example targets:

* Message command accepted quickly under normal load

* Realtime fanout within a low-latency target

* History pagination stable under large conversations

* Presence updates throttled

* Push notifications processed asynchronously

* Attachment uploads independent of message persistence

Do not promise millisecond-level end-to-end delivery across public networks. Network conditions, device state, provider latency, and push systems introduce variability.

## 19.31.2 Scaling Components

Scale independently:

```
API instances
WebSocket gateways
Message workers
Notification workers
Presence workers
Attachment workers
Search workers
Agent workers
```

Use:

* Redis Streams or a durable queue

* Partitioned fanout

* Conversation-level ordering

* Backpressure

* Bounded connection counts

* Connection draining during deployments

* Horizontal WebSocket scaling

## 19.31.3 Large Group Strategy

For large groups:

* Avoid sending every typing event to every participant

* Use fanout-on-read for low-activity groups

* Use fanout-on-write for high-value notification events

* Batch unread counters

* Use sequence-based read states

* Paginate members and messages

* Limit mention notifications

* Use announcement mode for high-volume updates

# 19.32 Security Architecture

## 19.32.1 Threats

* Unauthorized message reading

* Conversation enumeration

* Session theft

* Replay attacks

* Duplicate message injection

* WebSocket hijacking

* Malicious attachments

* Metadata leakage

* Group membership abuse

* Agent context leakage

* Push notification exposure

* Encryption key theft

* Malicious client modification

* Message deletion abuse

* Spam and flooding

## 19.32.2 Required Controls

* Server-side authorization

* Secure session validation

* WebSocket authentication

* Conversation membership checks

* Message size limits

* Rate limiting

* Idempotency

* Attachment scanning

* Encryption key rotation

* Secure device registration

* Audit logs for administrative actions

* Sensitive notification redaction

* Abuse detection

* Block and report enforcement

* Agent scope validation

* Replay protection

* Secure event sequence handling

# 19.33 Observability

## 19.33.1 Metrics

* Message send success rate

* Message acceptance latency

* WebSocket connection count

* WebSocket reconnect rate

* Event delivery latency

* Duplicate message rate

* Failed message rate

* Offline queue size

* Notification delivery rate

* Read receipt latency

* Presence update rate

* Attachment processing latency

* Encryption key rotation failures

* Agent message processing latency

* Report volume

* Spam rate

## 19.33.2 Tracing

Trace:

```
message.send
   ↓
authorization
   ↓
database.persist
   ↓
outbox.publish
   ↓
realtime.fanout
   ↓
notification.dispatch
```

Every trace should include:

```
request_id
message_id
conversation_id
client_message_id
account_id, where safe
correlation_id
```

Do not record plaintext E2E message content.

# 19.34 Failure Handling

## 19.34.1 WebSocket Disconnect

Client behavior:

1. Mark connection unavailable

2. Continue local rendering

3. Queue outgoing messages

4. Reconnect with backoff

5. Resume from last event sequence

6. Fetch missing data if required

7. Reconcile pending messages

## 19.34.2 Queue Failure

Use:

* Retry policy

* Dead-letter queue

* Idempotent consumers

* Outbox replay

* Alerting

* Manual reprocessing

## 19.34.3 Message Persistence Success but Fanout Failure

The message must remain visible through history APIs.

The realtime layer can later replay the event.

Never roll back a successfully persisted message only because WebSocket delivery failed.

## 19.34.4 Encryption Failure

If encryption fails:

* Do not send plaintext as fallback
