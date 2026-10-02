# Chapter 7 — API Architecture, REST Endpoints, WebSockets, gRPC, Message Queues, Event-Driven Communication, and Realtime Synchronization

## 7.1 Purpose

This chapter defines how Android, web, backend services, workers, agents, and external integrations communicate.

The architecture must support:

* Fast API responses

* Real-time messages

* Offline mobile clients

* Reliable background processing

* Agent-to-backend communication

* Agent-to-agent communication

* Notifications

* File uploads

* Event and reminder execution

* Message delivery tracking

* Retries and failure recovery

* Horizontal scaling

The system should use different communication methods for different jobs.

# 7.2 Communication Architecture

```
Android App / Web App
        │
        ├── HTTPS REST API
        ├── WebSocket connection
        └── File upload connection
                │
                ▼
        API Gateway
                │
                ▼
        FastAPI Application
                │
        ┌───────┼────────┬──────────┐
        ▼       ▼        ▼          ▼
   PostgreSQL Redis   Agent API   Object Storage
        │
        ▼
 Transactional Outbox
        │
        ▼
 Message Broker / Redis Streams
        │
 ┌──────┼─────────┬───────────┬─────────┐
 ▼      ▼         ▼           ▼         ▼
Workers Agents  WebSocket  Notifications RAG
```

# 7.3 Communication Protocol Decision

|
Use case

|

Recommended protocol

|
| --- | --- |
|

Login and account APIs

|

REST over HTTPS

|
|

Create space

|

REST

|
|

Load feed

|

REST

|
|

Send normal message

|

REST or WebSocket

|
|

Receive real-time events

|

WebSocket

|
|

Typing indicators

|

WebSocket

|
|

Presence

|

WebSocket + Redis

|
|

File upload

|

Presigned HTTPS upload

|
|

Internal service-to-service calls

|

gRPC or REST

|
|

Background jobs

|

Queue or Redis Streams

|
|

Agent workflow execution

|

Internal service API + queue

|
|

Agent events

|

Event bus

|
|

External provider callbacks

|

HTTPS webhooks

|
|

Large document processing

|

Queue-based jobs

|
|

Mobile offline synchronization

|

REST sync endpoints

|

Do not use one protocol for everything.

# 7.4 REST API Design

Use versioned APIs:

```
https://api.example.com/v1/...
```

The actual domain can be configured later.

Recommended conventions:

```
GET     Read resource
POST    Create resource or execute command
PATCH   Partial update
PUT     Replace resource where appropriate
DELETE  Delete or request deletion
```

Use resource-oriented URLs.

Good:

```
GET    /v1/spaces/{space_id}
POST   /v1/spaces
GET    /v1/spaces/{space_id}/members
POST   /v1/spaces/{space_id}/members
GET    /v1/conversations/{conversation_id}/messages
POST   /v1/conversations/{conversation_id}/messages
```

Avoid action-heavy URLs for ordinary CRUD:

```
POST /createNewFamilyGroupNow
POST /getAllMessagesForUser
```

Commands are acceptable for explicit operations:

```
POST /v1/agent-runs/{run_id}/cancel
POST /v1/approvals/{approval_id}/approve
POST /v1/files/{file_id}/reprocess
```

# 7.5 Authentication

Every protected request must pass through authentication middleware.

```
Request
  ↓
Extract access token
  ↓
Validate signature and expiry
  ↓
Resolve user and session
  ↓
Check account status
  ↓
Attach authenticated principal
  ↓
Authorization
  ↓
Route handler
```

The authenticated principal should contain:

JSON

```
{
  "user_id": "user-123",
  "session_id": "session-456",
  "device_id": "device-789",
  "scopes": ["user"],
  "issued_at": "timestamp",
  "expires_at": "timestamp"
}
```

Do not use the request body to determine the authenticated user.

# 7.6 Authorization Model

Authentication answers:

> Who is making the request?

Authorization answers:

> Is this user allowed to perform this action on this resource?

Authorization should evaluate:

```
User identity
Resource owner
Space membership
Role
Granular permissions
Resource visibility
Consent
Agent policy
Conversation membership
File access
Action risk
```

Example:

Python

Run

```
async def require_space_permission(
    user_id: UUID,
    space_id: UUID,
    permission: str,
):
    member = await membership_repository.get(
        space_id=space_id,
        user_id=user_id,
    )

    if not member or member.membership_status != "active":
        raise ForbiddenError("Not a member of this space")

    if not permission_service.allows(member, permission):
        raise ForbiddenError("Permission denied")
```

The same authorization service must be reused by:

* REST

* WebSockets

* gRPC

* Agents

* Workers

* Admin tools

# 7.7 Standard API Response Format

Use a consistent response structure.

## Success response

JSON

```
{
  "data": {
    "id": "space-123",
    "name": "Family Space"
  },
  "request_id": "req-123"
}
```

## Collection response

JSON

```
{
  "data": [
    {
      "id": "post-1",
      "body": "Example"
    }
  ],
  "pagination": {
    "next_cursor": "cursor-value",
    "has_more": true
  },
  "request_id": "req-123"
}
```

## Error response

JSON

```
{
  "error": {
    "code": "SPACE_ACCESS_DENIED",
    "message": "You do not have access to this space",
    "details": {}
  },
  "request_id": "req-123"
}
```

Never return raw stack traces to clients.

# 7.8 API Error Categories

Use stable machine-readable error codes.

```
AUTHENTICATION_REQUIRED
TOKEN_EXPIRED
ACCOUNT_DISABLED
RESOURCE_NOT_FOUND
ACCESS_DENIED
VALIDATION_FAILED
CONFLICT
RATE_LIMITED
IDEMPOTENCY_CONFLICT
APPROVAL_REQUIRED
EXTERNAL_PROVIDER_FAILED
TEMPORARY_UNAVAILABLE
INTERNAL_ERROR
```

HTTP status examples:

|
Status

|

Meaning

|
| --- | --- |
|

200

|

Successful read or update

|
|

201

|

Resource created

|
|

202

|

Accepted for asynchronous processing

|
|

204

|

Successful operation without response body

|
|

400

|

Invalid request

|
|

401

|

Not authenticated

|
|

403

|

Not authorized

|
|

404

|

Resource not found

|
|

409

|

Conflict or duplicate

|
|

422

|

Validation error

|
|

429

|

Rate limited

|
|

500

|

Internal server error

|
|

503

|

Temporarily unavailable

|

# 7.9 Core API Surface

## Identity APIs

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/logout
POST   /v1/auth/refresh
POST   /v1/auth/verify-email
POST   /v1/auth/verify-phone
GET    /v1/me
PATCH  /v1/me
GET    /v1/me/sessions
DELETE /v1/me/sessions/{session_id}
```

## Space APIs

```
POST   /v1/spaces
GET    /v1/spaces
GET    /v1/spaces/{space_id}
PATCH  /v1/spaces/{space_id}
DELETE /v1/spaces/{space_id}

GET    /v1/spaces/{space_id}/members
POST   /v1/spaces/{space_id}/members
PATCH  /v1/spaces/{space_id}/members/{user_id}
DELETE /v1/spaces/{space_id}/members/{user_id}

POST   /v1/spaces/{space_id}/invitations
GET    /v1/spaces/{space_id}/policies
PATCH  /v1/spaces/{space_id}/policies
```

## Community APIs

```
GET    /v1/pages
POST   /v1/pages
GET    /v1/pages/{page_id}
PATCH  /v1/pages/{page_id}

GET    /v1/pages/{page_id}/posts
POST   /v1/pages/{page_id}/posts
GET    /v1/posts/{post_id}
PATCH  /v1/posts/{post_id}
DELETE /v1/posts/{post_id}

POST   /v1/posts/{post_id}/comments
GET    /v1/posts/{post_id}/comments
POST   /v1/posts/{post_id}/reactions
DELETE /v1/posts/{post_id}/reactions
```

## Messaging APIs

```
GET    /v1/conversations
POST   /v1/conversations
GET    /v1/conversations/{conversation_id}
GET    /v1/conversations/{conversation_id}/messages
POST   /v1/conversations/{conversation_id}/messages
PATCH  /v1/messages/{message_id}
DELETE /v1/messages/{message_id}

POST   /v1/conversations/{conversation_id}/read
GET    /v1/conversations/{conversation_id}/members
```

## Planning APIs

```
GET    /v1/tasks
POST   /v1/tasks
GET    /v1/tasks/{task_id}
PATCH  /v1/tasks/{task_id}
DELETE /v1/tasks/{task_id}

GET    /v1/events
POST   /v1/events
GET    /v1/events/{event_id}
PATCH  /v1/events/{event_id}
DELETE /v1/events/{event_id}

GET    /v1/reminders
POST   /v1/reminders
PATCH  /v1/reminders/{reminder_id}
DELETE /v1/reminders/{reminder_id}
```

## Agent APIs

```
GET    /v1/agents
POST   /v1/agents
GET    /v1/agents/{agent_id}
PATCH  /v1/agents/{agent_id}

POST   /v1/agent-runs
GET    /v1/agent-runs/{run_id}
POST   /v1/agent-runs/{run_id}/cancel
GET    /v1/agent-runs/{run_id}/steps

GET    /v1/approvals
POST   /v1/approvals/{approval_id}/approve
POST   /v1/approvals/{approval_id}/reject

GET    /v1/memory
DELETE /v1/memory/{memory_id}
```

## File APIs

```
POST   /v1/files/upload-session
POST   /v1/files/{file_id}/complete
GET    /v1/files/{file_id}
GET    /v1/files/{file_id}/download-url
DELETE /v1/files/{file_id}
POST   /v1/files/{file_id}/reprocess
```

# 7.10 Pagination

Use cursor pagination for large collections.

Avoid:

```
?page=1000&limit=50
```

Prefer:

```
?limit=50&after=cursor-value
```

Cursor pagination is useful for:

* Messages

* Posts

* Comments

* Notifications

* Agent events

* Audit events

* File lists

The cursor should encode a stable ordering key, such as:

```
created_at + id
```

Never expose internal database implementation details unnecessarily.

# 7.11 Idempotency

For requests that create side effects, support idempotency keys.

Examples:

```
POST /v1/conversations/{id}/messages
POST /v1/agent-runs
POST /v1/files/upload-session
POST /v1/notifications
```

Request:

http

```
Idempotency-Key: 8b3d-client-operation-123
```

The server stores:

```
key
authenticated_user_id
operation_type
request_hash
response_status
response_body
created_at
expires_at
```

If the same key is reused with a different request body, return:

```
IDEMPOTENCY_CONFLICT
```

# 7.12 WebSocket Architecture

WebSockets are used for server-pushed events and interactive realtime features.

## Connection flow

```
Client opens WebSocket
        ↓
Authenticate connection
        ↓
Validate token/session
        ↓
Register connection in Redis
        ↓
Subscribe to allowed channels
        ↓
Send connection acknowledgement
        ↓
Begin event delivery
```

Endpoint:

```
/v1/realtime
```

The connection should not automatically subscribe to every space or conversation. The server determines subscriptions from authorized membership.

# 7.13 WebSocket Event Envelope

Use a consistent event envelope.

JSON

```
{
  "event_id": "event-123",
  "event_type": "message.created",
  "version": 1,
  "occurred_at": "2026-09-18T10:00:00Z",
  "scope": {
    "conversation_id": "conversation-123",
    "space_id": "space-123"
  },
  "sequence": 104,
  "data": {
    "message_id": "message-123"
  }
}
```

Important fields:

* `event_id`

* `event_type`

* `version`

* `occurred_at`

* `scope`

* `sequence`

* `data`

Do not send unrestricted database objects directly over WebSockets.

# 7.14 WebSocket Client Events

Examples:

JSON

```
{
  "type": "message.send",
  "client_message_id": "client-msg-123",
  "conversation_id": "conversation-123",
  "body": "Hello"
}
```

JSON

```
{
  "type": "typing.start",
  "conversation_id": "conversation-123"
}
```

JSON

```
{
  "type": "presence.update",
  "status": "online"
}
```

The server must validate every client event exactly as it validates REST requests.

# 7.15 WebSocket Reconnection

Mobile networks are unreliable. The client must support:

* Disconnect detection

* Exponential backoff

* Token refresh

* Re-authentication

* Subscription restoration

* Missed-event recovery

* Duplicate event handling

* Sequence tracking

Example reconnect strategy:

```
Attempt 1: immediate
Attempt 2: 1 second
Attempt 3: 2 seconds
Attempt 4: 5 seconds
Attempt 5: 10 seconds
Then capped retry interval
```

Do not reconnect continuously without a limit.

# 7.16 Missed Event Recovery

WebSockets alone are insufficient for reliable synchronization.

The client should maintain:

```
last_received_event_id
last_received_sequence
last_sync_timestamp
```

After reconnect:

```
GET /v1/sync?after_sequence=104
```

The server returns missed events or instructs the client to perform a full refresh.

Possible sync response:

JSON

```
{
  "events": [],
  "next_sequence": 120,
  "requires_full_sync": false
}
```

If the event history is no longer available:

JSON

```
{
  "events": [],
  "requires_full_sync": true,
  "resources": [
    "conversations",
    "notifications"
  ]
}
```

# 7.17 Message Sending Architecture

A reliable message send flow:

```
Client creates client_message_id
        ↓
POST or WebSocket message.send
        ↓
Authenticate sender
        ↓
Check conversation membership
        ↓
Check message policy
        ↓
Validate content
        ↓
Check idempotency
        ↓
Database transaction:
    Insert message
    Insert outbox event
        ↓
Return accepted message
        ↓
Outbox worker publishes event
        ↓
WebSocket gateway broadcasts
        ↓
Receipts update asynchronously
```

The API should not wait for every recipient device to receive the message before responding.

# 7.18 Message Delivery States

Use separate states for message persistence and delivery.

```
accepted
persisted
published
delivered_to_gateway
delivered_to_device
read
failed
```

A message being stored successfully does not mean it has been read.

## Receipts

```
sent
delivered
read
```

For E2E messages, the server can usually track delivery metadata without reading the ciphertext.

# 7.19 Internal Service Communication

Use REST for simple internal operations and gRPC for high-volume, strongly typed communication.

## gRPC is useful for:

* Agent runtime calls

* Document extraction workers

* Embedding workers

* Realtime gateway communication

* Internal authorization checks

* High-frequency service calls

* Streaming events

## REST is useful for:

* Simple administrative services

* External-facing APIs

* Debugging

* Integrations

* Low-frequency internal calls

Do not introduce gRPC merely because it is fast. Network latency, database queries, serialization, and queue delays often dominate total response time.

# 7.20 Example gRPC Service Boundaries

protobuf

```
service AgentRuntime {
  rpc StartRun(StartRunRequest) returns (StartRunResponse);
  rpc GetRun(GetRunRequest) returns (GetRunResponse);
  rpc CancelRun(CancelRunRequest) returns (CancelRunResponse);
  rpc StreamRunEvents(StreamRunEventsRequest)
      returns (stream AgentEvent);
}
```

protobuf

```
service DocumentProcessor {
  rpc ExtractPage(ExtractPageRequest)
      returns (ExtractPageResponse);

  rpc CreateChunks(CreateChunksRequest)
      returns (CreateChunksResponse);
}
```

protobuf

```
service RealtimeGateway {
  rpc PublishEvent(PublishEventRequest)
      returns (PublishEventResponse);
}
```

All gRPC methods still require:

* Authentication between services

* Service identity

* Authorization

* Request deadlines

* Retry rules

* Tracing

* Payload limits

# 7.21 Message Queue Architecture

Background jobs should not block API requests.

```
API Request
    ↓
Validate and persist command
    ↓
Insert outbox event
    ↓
Queue publisher
    ↓
Worker queue
    ↓
Worker
    ↓
Update database
    ↓
Publish result event
```

Jobs include:

* Send notification

* Send WhatsApp message

* Make external call

* Extract PDF pages

* Generate embeddings

* Index documents

* Generate feed recommendations

* Run agent workflow

* Rebuild memory

* Export account data

* Delete files

* Process webhooks

# 7.22 Queue Job Envelope

JSON

```
{
  "job_id": "job-123",
  "job_type": "document.extract_page",
  "version": 1,
  "attempt": 1,
  "max_attempts": 5,
  "created_at": "timestamp",
  "available_at": "timestamp",
  "payload": {
    "document_id": "document-123",
    "page_number": 8
  },
  "trace_id": "trace-123"
}
```

Workers should be idempotent.

If the same job runs twice, it should not create duplicate chunks, duplicate notifications, or duplicate external messages.

# 7.23 Retry Policy

Not every error should be retried.

## Retryable errors

```
Network timeout
Temporary database outage
Provider rate limit
Temporary object storage failure
Worker process crash
Service unavailable
```

## Non-retryable errors

```
Invalid file
Permission denied
Malformed request
Invalid recipient
Expired approval
Unsupported operation
Permanently rejected provider request
```

Use exponential backoff with jitter.

```
retry_delay = base_delay * 2^attempt + random_jitter
```

Every job should have:

* Maximum attempts

* Dead-letter handling

* Error classification

* Retry delay

* Timeout

* Cancellation support

# 7.24 Dead-Letter Queue

A dead-letter queue stores jobs that repeatedly fail.

```
Main Queue
    ↓
Worker attempts
    ↓
Failure
    ↓
Retry
    ↓
Failure threshold reached
    ↓
Dead-Letter Queue
```

The system should provide:

* Admin visibility

* Error details

* Retry manually

* Cancel job

* Inspect payload safely

* Redact sensitive data

* Link to trace ID

* Link to related resource

Never blindly replay a dead-letter job that may cause an external side effect.

# 7.25 Agent Communication Flow

The agent should not directly call every backend component.

Recommended:

```
Agent
    ↓
Tool Registry
    ↓
Authorized Tool Adapter
    ↓
Domain Service
    ↓
Database / External Provider
```

Example:

```
Agent wants to create reminder
        ↓
create_reminder tool
        ↓
Permission check
        ↓
Consent check
        ↓
Approval policy
        ↓
ReminderService
        ↓
PostgreSQL
        ↓
Outbox
        ↓
Notification scheduler
```

This prevents agents from bypassing normal business rules.

# 7.26 Agent-to-Agent Communication

Agents should communicate through structured messages rather than unrestricted natural-language loops.

## Agent message envelope

JSON

```
{
  "message_id": "agent-msg-123",
  "conversation_id": "agent-conversation-123",
  "sender_agent": "planning-agent",
  "recipient_agent": "notification-agent",
  "message_type": "request",
  "task_id": "task-123",
  "requires_approval": false,
  "payload": {
    "reminder_id": "reminder-123"
  },
  "created_at": "timestamp"
}
```

Supported message types:

```
request
response
event
approval_request
approval_result
failure
cancel
handoff
```

Agent-to-agent communication must include:

* Correlation ID

* Parent run ID

* Sender identity

* Recipient identity

* Scope

* Permission context

* Timeout

* Maximum hop count

* Retry policy

* Cancellation support

# 7.27 Preventing Agent Loops

Agent communication can accidentally create infinite loops.

Use:

```
max_steps
max_turns
max_hops
max_runtime
max_tool_calls
max_cost
visited_agent_set
parent_run_id
```

Example:

JSON

```
{
  "max_hops": 4,
  "current_hop": 2,
  "visited_agents": [
    "coordinator",
    "planning-agent"
  ]
}
```

Reject or pause a request when:

* Hop limit is exceeded

* The same agent repeats the same request

* Cost limit is exceeded

* The approval expires

* The user cancels the run

* The tool repeatedly fails

# 7.28 External Messaging Architecture

External channels may include:

* WhatsApp

* SMS

* Email

* Phone calls

* Push notifications

Use an adapter interface:

Python

Run

```
class MessagingProvider:
    async def send_message(
        self,
        recipient: str,
        content: str,
        metadata: dict,
    ) -> ProviderResult:
        ...
```

Provider-specific code should not be scattered across agents.

```
NotificationService
    ├── WhatsAppAdapter
    ├── SmsAdapter
    ├── EmailAdapter
    ├── PushAdapter
    └── VoiceCallAdapter
```

Before sending:

1. Confirm recipient.

2. Check user consent.

3. Check space policy.

4. Check agent authorization.

5. Check whether approval is required.

6. Apply rate limits.

7. Redact sensitive content where necessary.

8. Record the action.

9. Send through the provider.

10. Store delivery status.

# 7.29 Webhook Processing

External providers may send duplicate or out-of-order webhooks.

Webhook flow:

```
Provider webhook
    ↓
Verify signature
    ↓
Validate timestamp
    ↓
Store raw event metadata
    ↓
Check idempotency
    ↓
Queue processing job
    ↓
Update delivery state
    ↓
Publish internal event
```

Store:

```
provider
provider_event_id
event_type
received_at
signature_status
processing_status
payload_hash
processed_at
```

Never trust a webhook merely because it came to the correct URL.

# 7.30 Realtime Presence

Presence is ephemeral.

Recommended Redis structure:

```
presence:user:{user_id}
presence:conversation:{conversation_id}
presence:space:{space_id}
```

Presence should expire automatically using TTL.

Example:

```
online
last_seen
device_count
expires_at
```

Typing indicators should not be stored permanently in PostgreSQL.

```
typing:{conversation_id}:{user_id}
TTL: a few seconds
```

# 7.31 Rate Limiting

Rate limits should
