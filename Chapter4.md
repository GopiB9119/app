# Chapter 4 — Messaging, Realtime Communication, Notifications, and Event Delivery Architecture

## 4.1 Objective

The messaging system must support:

* Private group chat

* Family communication

* Couple conversations

* Solo agent conversations

* Custom group discussions

* Temporary event coordination

* Agent-generated messages

* Task and event updates

* Reminder notifications

* Delivery and read receipts

* Offline synchronization

* Multi-device sessions

* Web and Android clients

* High message throughput

* Reliable delivery even when realtime connections fail

The central design principle is:

> Persist important data first, then distribute realtime events.

A WebSocket connection is a delivery channel. It is not the source of truth.

# 4.2 Communication Channels

The platform should separate communication into different channels.

```
Communication System
├── Durable Command API
├── WebSocket Realtime Gateway
├── Internal Event Bus
├── Push Notification Service
├── Email Notification Service
├── WhatsApp Integration
├── Voice/Call Integration
└── Background Scheduler
```

## 4.2.1 Durable Command API

Used for:

* Sending messages

* Editing messages

* Deleting messages

* Creating tasks

* Creating events

* Approving agent actions

* Marking messages as read

* Updating notification preferences

Possible protocols:

* HTTPS/REST

* gRPC for internal services

* WebSocket commands only when carefully designed

Recommended:

```
Android/Web Client → HTTPS API → Backend
```

## 4.2.2 WebSocket Realtime Gateway

Used for:

* New message delivery

* Typing indicators

* Presence updates

* Message status

* Task updates

* Event updates

* Agent response streaming

* Notification synchronization

* Membership changes

The WebSocket gateway should not directly write business data without passing through domain services.

## 4.2.3 Internal Event Bus

Used to distribute events between backend modules.

Examples:

```
MessageCreated
MessageEdited
MessageDeleted
MemberJoined
MemberRemoved
TaskCreated
EventUpdated
ReminderTriggered
AgentActionApproved
NotificationRequested
```

Initial implementation:

* PostgreSQL transactional outbox

* Redis Streams or a broker

* Background event dispatcher

Later options:

* NATS

* Apache Kafka

* RabbitMQ

* Redpanda

The first version should avoid unnecessary infrastructure complexity.

# 4.3 End-to-End Message Lifecycle

```
User types message
        ↓
Client creates local draft
        ↓
Client generates client_message_id
        ↓
Client sends command
        ↓
Authentication
        ↓
Space authorization
        ↓
Conversation authorization
        ↓
Message validation
        ↓
Database transaction
        ↓
Message stored
        ↓
Outbox event stored
        ↓
API returns accepted message
        ↓
Event dispatcher publishes event
        ↓
WebSocket gateway delivers event
        ↓
Push notification if required
        ↓
Recipients acknowledge delivery
        ↓
Read receipts are recorded
```

The message should receive a server ID only after successful persistence.

# 4.4 Message States

A message may have different states on the client and server.

## 4.4.1 Client States

```
DRAFT
QUEUED
SENDING
SENT
DELIVERED
READ
FAILED
RETRYING
CANCELLED
```

## 4.4.2 Server States

```
ACCEPTED
PERSISTED
DISPATCHED
PARTIALLY_DELIVERED
DELIVERED
DELETED
REJECTED
```

The client must not display a message as fully sent when the backend has not confirmed persistence.

# 4.5 Message Command Contract

Example request:

JSON

```
{
  "conversation_id": "conversation_123",
  "client_message_id": "client_abc_001",
  "message_type": "TEXT",
  "body": "Are we meeting at 7 PM?",
  "reply_to_message_id": null,
  "attachments": []
}
```

Example response:

JSON

```
{
  "message_id": "message_789",
  "conversation_id": "conversation_123",
  "client_message_id": "client_abc_001",
  "status": "PERSISTED",
  "created_at": "2026-09-17T18:30:00Z"
}
```

## 4.5.1 Required Validation

The backend must validate:

* User authentication

* Active membership

* Conversation membership

* Message type

* Body length

* Attachment ownership

* Reply target

* Rate limit

* Space policy

* User mute or suspension status

* Content restrictions

* Idempotency key

# 4.6 Message Data Model

```
messages
--------
id
conversation_id
sender_type
sender_user_id
sender_agent_id
client_message_id
message_type
body_ciphertext
body_search_index
reply_to_message_id
thread_root_message_id
metadata_json
created_at
edited_at
deleted_at
```

## 4.6.1 Sender Types

```
USER
AGENT
SYSTEM
INTEGRATION
```

The sender type must be stored explicitly.

An agent message should never be disguised as a human message.

# 4.7 Message Types

```
TEXT
IMAGE
VIDEO
AUDIO
VOICE_NOTE
FILE
LOCATION
POLL
SYSTEM
TASK_UPDATE
EVENT_UPDATE
REMINDER
AGENT_RESPONSE
APPROVAL_REQUEST
MEMBER_UPDATE
```

Each message type should have a strict schema.

For example, a task update should reference a task ID rather than duplicating the entire task object inside the message.

# 4.8 Message Idempotency

Mobile networks frequently retry requests.

Without idempotency:

```
User taps Send
    ↓
Request reaches server
    ↓
Response is lost
    ↓
Client retries
    ↓
Duplicate message created
```

With idempotency:

```
client_message_id = abc123
```

The server checks:

```
conversation_id + sender_user_id + client_message_id
```

If the message already exists, return the existing message.

Recommended database constraint:

SQL

```
CREATE UNIQUE INDEX uq_message_idempotency
ON messages(conversation_id, sender_user_id, client_message_id);
```

# 4.9 Ordering Guarantees

Global ordering across the entire platform is unnecessary.

Ordering should be maintained per conversation.

Recommended fields:

```
conversation_id
sequence_number
created_at
id
```

## 4.9.1 Conversation Sequence

Each conversation may maintain a monotonically increasing sequence.

```
Message A → sequence 100
Message B → sequence 101
Message C → sequence 102
```

Clients use sequence numbers to detect missing events.

If the client receives:

```
100
102
```

It knows that sequence `101` is missing and requests synchronization.

# 4.10 Pagination

Messages should not be loaded all at once.

Use cursor-based pagination.

http

```
GET /v1/conversations/{id}/messages?before=message_789&limit=50
```

Response:

JSON

```
{
  "items": [],
  "next_cursor": "cursor_abc",
  "has_more": true
}
```

Cursor pagination is preferable to offset pagination because messages are continuously inserted.

## 4.10.1 Recommended Limits

```
Default page size: 50
Maximum page size: 100
Maximum message body: policy-defined
Maximum attachment count: policy-defined
```

# 4.11 WebSocket Connection Lifecycle

```
CONNECTING
    ↓
AUTHENTICATING
    ↓
AUTHENTICATED
    ↓
SUBSCRIBING
    ↓
CONNECTED
    ↓
RECONNECTING
    ↓
CLOSED
```

## 4.11.1 Connection Handshake

The client sends:

JSON

```
{
  "type": "AUTH",
  "access_token": "short_lived_token",
  "device_id": "device_123",
  "last_event_id": "event_456"
}
```

The server validates:

* Token

* User session

* Device status

* Token expiry

* Account restrictions

The client should not send a list of arbitrary spaces and expect the server to trust it.

The server determines which spaces and conversations the user may subscribe to.

# 4.12 WebSocket Event Format

JSON

```
{
  "event_id": "event_1001",
  "event_type": "message.created",
  "aggregate_type": "conversation",
  "aggregate_id": "conversation_123",
  "sequence": 101,
  "payload": {
    "message_id": "message_789",
    "sender_type": "USER",
    "created_at": "2026-09-17T18:30:00Z"
  },
  "occurred_at": "2026-09-17T18:30:01Z"
}
```

## 4.12.1 Event Requirements

Every event should contain:

* Event ID

* Event type

* Aggregate type

* Aggregate ID

* Sequence number

* Payload

* Timestamp

* Schema version

Example:

```
schema_version = 1
```

This allows the event format to evolve.

# 4.13 Event Delivery Guarantees

The platform should aim for:

```
At-least-once event delivery
```

This means clients may receive an event more than once.

Therefore, clients must deduplicate using:

```
event_id
```

Exactly-once delivery is difficult across unreliable networks and should not be assumed.

## 4.13.1 Client Event Handling

```
Receive event
    ↓
Check event_id
    ↓
If already processed: ignore
    ↓
If new: validate sequence
    ↓
Apply local state change
    ↓
Persist local event marker
    ↓
Acknowledge if required
```

# 4.14 Transactional Outbox

The transactional outbox solves the dual-write problem.

Without an outbox:

```
Write message to database
    ↓
Publish event
    ↓
Event broker fails
```

The message exists but recipients never receive an event.

With an outbox:

```
Database transaction
├── Insert message
└── Insert outbox event
        ↓
Transaction commits
        ↓
Dispatcher publishes outbox event
        ↓
Event marked as published
```

## 4.14.1 Outbox Table

```
outbox_events
-------------
id
aggregate_type
aggregate_id
event_type
payload_json
status
attempt_count
available_at
published_at
created_at
last_error
```

States:

```
PENDING
PROCESSING
PUBLISHED
FAILED
DEAD_LETTERED
```

# 4.15 Outbox Dispatcher

The dispatcher should:

1. Read pending events.

2. Lock a batch.

3. Publish events.

4. Mark successful events as published.

5. Retry failed events.

6. Move permanently failed events to a dead-letter queue.

7. Emit metrics.

8. Preserve event ordering where required.

Example retry schedule:

```
Attempt 1: immediate
Attempt 2: 1 second
Attempt 3: 5 seconds
Attempt 4: 30 seconds
Attempt 5: 2 minutes
```

Do not retry forever.

# 4.16 Offline-First Android Messaging

The Android client should support temporary offline operation.

## 4.16.1 Local Tables

```
local_messages
--------------
local_id
conversation_id
client_message_id
server_message_id
body
status
created_at
last_attempt_at
failure_reason

sync_state
----------
conversation_id
last_server_sequence
last_event_id
last_sync_at
```

## 4.16.2 Offline Flow

```
User sends message offline
        ↓
Save locally as QUEUED
        ↓
Display pending state
        ↓
Network returns
        ↓
Send queued command
        ↓
Server validates and persists
        ↓
Replace local temporary ID
        ↓
Mark SENT
```

The UI should show:

* Pending

* Sending

* Sent

* Failed

* Retry

It should not silently discard queued messages.

# 4.17 Multi-Device Synchronization

A user may use:

* Android phone

* Tablet

* Desktop browser

* Multiple browser tabs

All devices should synchronize through the backend.

## 4.17.1 Device Identity

```
user_id
device_id
session_id
platform
app_version
last_seen_at
push_token
```

## 4.17.2 Synchronization Rules

* Messages sent from one device appear on other devices.

* Read state may be device-specific or user-wide.

* Drafts should normally remain device-local.

* Push notifications should be suppressed on the active device where possible.

* Revoked devices lose access.

* A new device must complete authentication before synchronization.

# 4.18 Typing Indicators

Typing indicators are ephemeral.

They should not be persisted as normal messages.

Example event:

JSON

```
{
  "event_type": "typing.started",
  "conversation_id": "conversation_123",
  "user_id": "user_456"
}
```

Rules:

* Expire automatically.

* Do not store in PostgreSQL.

* Rate-limit typing events.

* Do not reveal typing status to unauthorized users.

* Stop indicator after inactivity timeout.

* Clear indicators when a user disconnects.

# 4.19 Presence

Presence can use:

```
ONLINE
AWAY
OFFLINE
DO_NOT_DISTURB
INVISIBLE
```

Presence should be approximate, not a guarantee.

Avoid showing exact activity timestamps unless necessary.

The backend may use:

* Redis TTL keys

* WebSocket connection registry

* Heartbeats

* Device presence aggregation

Example:

```
presence:user_123 → expires in 60 seconds
```

# 4.20 Read Receipts

Read receipts should be scoped.

Possible models:

```
USER_READ
CONVERSATION_READ
MESSAGE_READ
```

For large groups, recording every user-message pair may become expensive.

Recommended:

```
conversation_members.last_read_sequence
```

This allows the backend to infer that a member has read all messages up to a sequence number.

## 4.20.1 Read State Table

```
conversation_read_states
------------------------
conversation_id
user_id
last_read_sequence
last_read_message_id
updated_at
```

# 4.21 Delivery Receipts

Delivery means the message reached a device or was synchronized to the recipient’s account.

It does not mean the user read it.

Use separate states:

```
SENT
DELIVERED
READ
```

Do not claim that a message was delivered if the backend only stored it.

# 4.22 Push Notification Architecture

Push notifications should be generated from backend events.

```
Domain Event
    ↓
Notification Decision
    ↓
User Preferences
    ↓
Quiet Hours
    ↓
Privacy Redaction
    ↓
Channel Selection
    ↓
Push Provider
    ↓
Delivery Result
```

Potential providers:

* Firebase Cloud Messaging for Android

* Apple Push Notification service for iOS if added later

* Web Push for browsers

# 4.23 Notification Types

```
NEW_MESSAGE
MENTION
REPLY
TASK_ASSIGNED
TASK_DUE
EVENT_CREATED
EVENT_CHANGED
REMINDER
AGENT_APPROVAL_REQUIRED
MEMBER_JOINED
MEMBER_REMOVED
SECURITY_ALERT
SYSTEM_NOTICE
```

## 4.23.1 Notification Priority

```
LOW
NORMAL
HIGH
CRITICAL
```

Critical notifications should be narrowly defined.

The system should not mark every agent message as critical.

# 4.24 Notification Privacy

Notification content must be redacted according to sensitivity.

Unsafe notification:

```
Your brother has not taken his 500 mg medicine.
```

Safer notification:

```
A private reminder needs your attention.
```

The user may choose:

```
Show full preview
Show sender only
Show generic notification
Do not show on lock screen
```

Notification preferences should support:

* Per space

* Per conversation

* Per category

* Per device

* Quiet hours

* Mention-only mode

* Agent notification settings

# 4.25 Notification Preference Model

```
notification_preferences
------------------------
id
user_id
space_id
conversation_id
category
channel
enabled
priority
quiet_hours_start
quiet_hours_end
show_preview
updated_at
```

Example:

JSON

```
{
  "category": "NEW_MESSAGE",
  "channel": "PUSH",
  "enabled": true,
  "priority": "NORMAL",
  "show_preview": false
}
```

# 4.26 Notification Deduplication

A notification may be triggered multiple times by retries.

Use a unique notification key:

```
user_id + event_id + channel
```

Example:

SQL

```
CREATE UNIQUE INDEX uq_notification_delivery
ON notification_deliveries(user_id, event_id, channel);
```

This prevents duplicate push notifications.

# 4.27 Notification Delivery Table

```
notification_deliveries
-----------------------
id
user_id
event_id
channel
provider
status
provider_message_id
attempt_count
last_error
sent_at
delivered_at
created_at
```

States:

```
PENDING
SENDING
SENT
DELIVERED
FAILED
SUPPRESSED
EXPIRED
```

# 4.28 WhatsApp Integration Boundary

If the platform uses an open-source WhatsApp integration, it must be isolated behind a provider interface.

```
Notification Service
        ↓
Channel Router
        ↓
WhatsApp Provider Adapter
        ↓
WhatsApp Integration
```

The rest of the backend should not depend directly on a particular WhatsApp library.

## 4.28.1 Provider Interface

Python

Run

```
from dataclasses import dataclass
from typing import Protocol


@dataclass
class OutboundMessage:
    recipient: str
    text: str
    idempotency_key: str


class MessagingProvider(Protocol):
    async def send_message(
        self,
        message: OutboundMessage,
    ) -> str:
        ...
```

Possible providers:

```
PUSH_PROVIDER
EMAIL_PROVIDER
WHATSAPP_PROVIDER
SMS_PROVIDER
VOICE_PROVIDER
```

Each provider must implement:

* Send

* Delivery status

* Retry behavior

* Rate limiting

* Error normalization

* Idempotency

* Opt-out handling

# 4.29 External Message Safety

External channels require stronger safeguards.

Before sending an external message, verify:

1. The user enabled the channel.

2. The recipient is authorized.

3. The recipient contact is verified.

4. The content does not contain unauthorized private data.

5. The action has required approval.

6. The message is not a duplicate.

7. The provider is available.

8. The user has not revoked consent.

Agent-generated external messages should normally begin as drafts.

```
Agent drafts message
        ↓
User reviews
        ↓
User approves
        ↓
Backend sends
```

# 4.30 Voice and Call Notifications

If voice or calls are added later, use a separate call orchestration module.

```
Call Request
    ↓
Permission Check
    ↓
Recipient Availability
    ↓
Quiet Hours Check
    ↓
Call Provider
    ↓
Call State Events
    ↓
Audit Log
```

Call states:

```
REQUESTED
RINGING
ACCEPTED
DECLINED
MISSED
FAILED
COMPLETED
CANCELLED
```

The agent must not repeatedly call a person without respecting:

* User preferences

* Quiet hours

* Maximum retry count

* Escalation policy

* Emergency policy

* Consent requirements

# 4.31 Reminder Scheduler

Reminders should be handled by a durable scheduler, not by an Android timer alone.

```
Reminder Created
    ↓
Persist Reminder
    ↓
Calculate next_run_at
    ↓
Scheduler Claims Due Reminder
    ↓
Create Reminder Event
    ↓
Notification Service
    ↓
Delivery
    ↓
Response Window
    ↓
Optional Escalation
```

## 4.31.1 Scheduler Table

```
scheduled_jobs
--------------
id
job_type
aggregate_type
aggregate_id
run_at
timezone
status
attempt_count
locked_until
last_error
created_at
updated_at
```

States:
