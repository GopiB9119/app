# Chapter 6 — Data Architecture, PostgreSQL Schema, Redis State, Object Storage, RAG Indexes, Encryption, and Data Lifecycle

## 6.1 Purpose of This Chapter

The platform requires a data architecture that can support:

* Public community pages and posts

* Private family, couple, solo, and custom spaces

* Group membership and permissions

* Real-time conversations

* Tasks, events, reminders, and notifications

* AI-agent memory and execution state

* File uploads and document processing

* RAG retrieval

* End-to-end encrypted conversations

* Audit logs and security events

* Large-scale growth across multiple machines and regions

The central rule is:

> PostgreSQL is the source of truth. Redis is for fast temporary state. Object storage is for files. Search and vector indexes are derived data.

# 6.2 Core Data Principles

## Principle 1: Every record must have an owner and scope

Every important record must be associated with one or more of:

* `user_id`

* `space_id`

* `page_id`

* `conversation_id`

* `organization_id`, if organizations are introduced later

Examples:

|
Data

|

Required scope

|
| --- | --- |
|

Personal task

|

`owner_user_id`

|
|

Family task

|

`space_id`

|
|

Public post

|

`page_id` or `community_id`

|
|

Private message

|

`conversation_id`

|
|

Agent memory

|

`owner_user_id` or `space_id`

|
|

Uploaded family document

|

`space_id`

|
|

Medical reminder

|

`space_id` plus explicit consent

|
|

Audit event

|

actor, subject, and scope

|

A record without a clear scope is a security risk.

## Principle 2: Client input is never trusted

The client must not be allowed to decide:

* The current user ID

* The owner of a task

* The member role

* Whether a space is private

* Whether a message belongs to another conversation

* Whether an agent can access a document

* Whether a user has approved an action

The backend derives identity from the authenticated session:

```
access_token
    ↓
authenticated_user_id
    ↓
authorization check
    ↓
database query
    ↓
response
```

Never trust a client-supplied field such as:

JSON

```
{
  "user_id": "another-user-id",
  "role": "admin"
}
```

The server must ignore or reject unauthorized ownership and role fields.

## Principle 3: PostgreSQL owns durable state

PostgreSQL should be authoritative for:

* Users

* Spaces

* Membership

* Posts

* Messages

* Tasks

* Events

* Reminders

* Agent runs

* Approvals

* Memory records

* File metadata

* Document metadata

* Audit records

* Outbox events

Redis may temporarily hold a copy of some of this information, but Redis must not become the only location where important data exists.

## Principle 4: Derived data can be rebuilt

The following should be treated as rebuildable:

* Search indexes

* Vector embeddings

* Cached feeds

* Redis presence

* Recommendation indexes

* Aggregated counters

* Materialized projections

If a derived index is deleted, the system should be able to regenerate it from PostgreSQL and object storage.

# 6.3 Logical Data Domains

The database should be divided conceptually into bounded contexts.

```
Identity Domain
    ├── users
    ├── user_profiles
    ├── identities
    ├── sessions
    └── user_consents

Community Domain
    ├── pages
    ├── posts
    ├── comments
    ├── reactions
    ├── follows
    └── reports

Space Domain
    ├── spaces
    ├── space_policies
    ├── space_members
    ├── space_invitations
    └── space_events

Communication Domain
    ├── conversations
    ├── conversation_members
    ├── messages
    ├── message_receipts
    └── message_attachments

Planning Domain
    ├── tasks
    ├── events
    ├── reminders
    ├── notification_jobs
    └── notification_deliveries

Agent Domain
    ├── agent_configs
    ├── agent_runs
    ├── agent_steps
    ├── agent_tool_calls
    ├── agent_approvals
    ├── agent_checkpoints
    └── memory_items

File and RAG Domain
    ├── files
    ├── file_versions
    ├── documents
    ├── document_pages
    ├── document_chunks
    ├── embeddings
    └── ingestion_jobs

Security Domain
    ├── audit_events
    ├── security_events
    ├── access_grants
    ├── encryption_keys
    └── data_deletion_jobs

Integration Domain
    ├── external_accounts
    ├── external_messages
    ├── webhook_events
    └── outbox_events
```

These domains can initially exist in one PostgreSQL database while remaining separated in the application code.

# 6.4 Recommended Technology Architecture

## Initial production architecture

```
Android App / Web App
        │
        ▼
API Gateway / Load Balancer
        │
        ▼
FastAPI Application
        │
        ├── PostgreSQL
        ├── Redis
        ├── Object Storage
        ├── Background Workers
        ├── WebSocket Gateway
        └── Agent Runtime
```

Recommended components:

|
Responsibility

|

Technology

|
| --- | --- |
|

Primary database

|

PostgreSQL

|
|

Vector search

|

pgvector initially

|
|

Cache and ephemeral state

|

Redis

|
|

File storage

|

S3-compatible object storage

|
|

Backend API

|

FastAPI

|
|

Database access

|

SQLAlchemy 2.x or SQLModel

|
|

Migrations

|

Alembic

|
|

Background jobs

|

Celery, Dramatiq, Arq, or Redis Streams

|
|

Realtime

|

WebSockets

|
|

Internal RPC

|

gRPC where useful

|
|

Agent orchestration

|

LangGraph

|
|

Agent utilities

|

Selective LangChain

|
|

Observability

|

OpenTelemetry

|
|

Container runtime

|

Docker

|
|

Deployment

|

Kubernetes or managed container platform

|

The architecture should avoid adding a separate database for every feature during the initial stage.

# 6.5 Identifier Strategy

Use sortable unique identifiers.

Recommended choices:

* UUIDv7, if supported by the chosen stack

* ULID

* UUID4, if UUIDv7/ULID support is inconvenient

For high-volume tables, sortable identifiers are useful because they improve insertion locality and make event ordering easier to inspect.

Example:

```
user_id        UUID
space_id       UUID
message_id     UUID
agent_run_id   UUID
document_id    UUID
```

Do not use sequential integer IDs as public identifiers because they can expose record counts and make enumeration easier.

# 6.6 Common Table Conventions

Most tables should use:

```
id
created_at
updated_at
deleted_at
version
```

Example:

SQL

```
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ NULL
version INTEGER NOT NULL DEFAULT 1
```

Use soft deletion when:

* The record may be needed for audit purposes

* References must remain valid

* The user may restore it

* Legal or operational retention requires preservation

Use hard deletion when:

* The data is temporary

* It contains short-lived tokens

* It is an expired cache record

* The user has requested permanent deletion and retention is not required

# 6.7 Identity and User Tables

## `users`

Stores the core account identity.

SQL

```
CREATE TABLE users (
    id UUID PRIMARY KEY,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    username VARCHAR(80) UNIQUE,
    display_name VARCHAR(160),
    email_hash BYTEA UNIQUE,
    phone_hash BYTEA UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

Sensitive raw values such as email and phone should not necessarily be stored in plain text in the primary table.

A stronger design is:

```
users
    ├── public profile fields
    └── protected identity table
```

## `user_profiles`

SQL

```
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    avatar_file_id UUID,
    bio TEXT,
    timezone VARCHAR(80),
    locale VARCHAR(20),
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## `user_consents`

Consent must be explicit, versioned, and revocable.

SQL

```
CREATE TABLE user_consents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    consent_type VARCHAR(80) NOT NULL,
    policy_version VARCHAR(40) NOT NULL,
    granted BOOLEAN NOT NULL,
    granted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    source VARCHAR(40),
    metadata JSONB NOT NULL DEFAULT '{}'
);
```

Examples:

```
agent_memory
agent_notifications
whatsapp_messages
phone_calls
health_related_reminders
document_processing
location_access
```

Consent should not be represented only by a boolean in a user profile. A separate consent record provides history and auditability.

# 6.8 Space and Group Data Model

A single generic `spaces` model should support:

* Family groups

* Couple spaces

* Solo spaces

* Custom groups

* Temporary event groups

* Private project groups

* Community subgroups

## `spaces`

SQL

```
CREATE TABLE spaces (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id),
    space_type VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    visibility VARCHAR(32) NOT NULL DEFAULT 'private',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    avatar_file_id UUID,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

Possible `space_type` values:

```
family
couple
solo
custom
event
project
support
organization
```

Possible `visibility` values:

```
private
invite_only
discoverable
public
```

Do not assume that a public space means every internal record is public. Each post, file, task, and conversation must still have its own access rules.

## `space_policies`

SQL

```
CREATE TABLE space_policies (
    space_id UUID PRIMARY KEY REFERENCES spaces(id),
    allow_member_invites BOOLEAN NOT NULL DEFAULT false,
    allow_member_posts BOOLEAN NOT NULL DEFAULT true,
    allow_agent_actions BOOLEAN NOT NULL DEFAULT false,
    allow_agent_memory BOOLEAN NOT NULL DEFAULT false,
    allow_external_notifications BOOLEAN NOT NULL DEFAULT false,
    allow_file_uploads BOOLEAN NOT NULL DEFAULT true,
    allow_message_forwarding BOOLEAN NOT NULL DEFAULT false,
    require_admin_approval BOOLEAN NOT NULL DEFAULT true,
    retention_days INTEGER,
    policy_version VARCHAR(40) NOT NULL DEFAULT '1'
);
```

The agent must read the space policy before performing an action.

## `space_members`

SQL

```
CREATE TABLE space_members (
    space_id UUID NOT NULL REFERENCES spaces(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    membership_status VARCHAR(32) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    invited_by UUID REFERENCES users(id),
    permissions JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (space_id, user_id)
);
```

Recommended roles:

```
owner
admin
moderator
member
guest
observer
```

Do not rely only on the role string. Some spaces may require granular permissions:

JSON

```
{
  "can_manage_members": true,
  "can_create_events": true,
  "can_send_external_messages": false,
  "can_view_sensitive_files": false,
  "can_approve_agent_actions": true
}
```

Indexes:

SQL

```
CREATE INDEX idx_space_members_user
ON space_members(user_id, membership_status);

CREATE INDEX idx_space_members_space_status
ON space_members(space_id, membership_status);
```

# 6.9 Community Page and Post Tables

## `pages`

SQL

```
CREATE TABLE pages (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id),
    page_type VARCHAR(40) NOT NULL,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) UNIQUE NOT NULL,
    description TEXT,
    visibility VARCHAR(32) NOT NULL DEFAULT 'public',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Examples of page types:

```
festival
event
interest
education
local_community
creator
organization
public_group
```

## `posts`

SQL

```
CREATE TABLE posts (
    id UUID PRIMARY KEY,
    author_user_id UUID NOT NULL REFERENCES users(id),
    page_id UUID REFERENCES pages(id),
    space_id UUID REFERENCES spaces(id),
    post_type VARCHAR(32) NOT NULL DEFAULT 'text',
    visibility VARCHAR(32) NOT NULL DEFAULT 'public',
    body TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'published',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

A post should not simultaneously belong to unrelated access scopes unless the product explicitly supports cross-posting.

For example:

```
Public page post:
    page_id = X
    visibility = public

Family post:
    space_id = Y
    visibility = members

Personal post:
    author_user_id = Z
    visibility = private
```

## `comments`

SQL

```
CREATE TABLE comments (
    id UUID PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES posts(id),
    author_user_id UUID NOT NULL REFERENCES users(id),
    parent_comment_id UUID REFERENCES comments(id),
    body TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'published',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

# 6.10 Conversation and Message Data Model

## Conversation types

```
direct
group
space
agent
support
system
```

## `conversations`

SQL

```
CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    conversation_type VARCHAR(32) NOT NULL,
    space_id UUID REFERENCES spaces(id),
    created_by UUID REFERENCES users(id),
    encryption_mode VARCHAR(32) NOT NULL DEFAULT 'server_encrypted',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Possible encryption modes:

```
server_encrypted
end_to_end_encrypted
client_side_agent
```

## `conversation_members`

SQL

```
CREATE TABLE conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ,
    last_read_message_id UUID,
    PRIMARY KEY (conversation_id, user_id)
);
```

## `messages`

SQL

```
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender_user_id UUID REFERENCES users(id),
    sender_agent_id UUID,
    message_type VARCHAR(32) NOT NULL DEFAULT 'text',
    body TEXT,
    ciphertext BYTEA,
    encryption_metadata JSONB NOT NULL DEFAULT '{}',
    reply_to_message_id UUID REFERENCES messages(id),
    client_message_id VARCHAR(160),
    status VARCHAR(32) NOT NULL DEFAULT 'accepted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);
```

Constraints:

* A message should have either a user sender, an agent sender, or a system sender.

* `client_message_id` should be unique per conversation and sender to support idempotency.

* Message ordering should use server timestamps and sequence numbers where required.

For high-volume messaging, add:

SQL

```
ALTER TABLE messages
ADD COLUMN sequence_number BIGINT;
```

A sequence number helps with:

* Ordering

* Synchronization

* Offline clients

* Duplicate detection

* Reconnection recovery

## End-to-end encryption boundary

If a conversation is truly end-to-end encrypted:

```
Sender device
    ↓ encrypt
Encrypted message
    ↓
Server stores ciphertext
    ↓
Recipient device
    ↓ decrypt
Plaintext message
```

The server cannot normally read the message content.

This creates an important limitation:

> A server-side agent cannot inspect end-to-end encrypted messages unless the user explicitly provides readable content through a supported client-side flow.

Possible designs:

### Option A: Server-side agent, non-E2E conversation

The server can process messages, but the conversation is not fully end-to-end encrypted.

### Option B: Client-side agent

The agent runs on the user’s device and can access plaintext after local decryption.

### Option C: User-selected message handoff

The user selects messages and explicitly sends them to the agent:

```
User selects message
    ↓
Client decrypts
    ↓
User approves sharing
    ↓
Agent receives selected plaintext
```

Do not claim that a backend agent can automatically inspect E2E messages while preserving strict E2E encryption.

# 6.11 Tasks, Events, Reminders, and Notifications

## `tasks`

SQL

```
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    created_by UUID REFERENCES users(id),
    title VARCHAR(240) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    due_at TIMESTAMPTZ,
    assigned_to UUID REFERENCES users(id),
    source VARCHAR(32) NOT NULL DEFAULT 'user',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
```

## `events`

SQL

```
CREATE TABLE events (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    created_by UUID REFERENCES users(id),
    title VARCHAR(240) NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    timezone VARCHAR(80) NOT NULL,
    location JSONB,
    visibility VARCHAR(32) NOT NULL DEFAULT 'members',
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## `reminders`

SQL

```
CREATE TABLE reminders (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    related_task_id UUID REFERENCES tasks(id),
    related_event_id UUID REFERENCES events(id),
    title VARCHAR(240) NOT NULL,
    reminder_at TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(80) NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'in_app',
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
    recurrence_rule TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## `notification_deliveries`

SQL

```
CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    reminder_id UUID REFERENCES reminders(id),
    channel VARCHAR(32) NOT NULL,
    provider VARCHAR(80),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    provider_message_id VARCHAR(240),
    attempted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

For health-related reminders:

* Require explicit consent

* Store the source of the instruction

* Do not silently change dosage

* Require confirmation for high-impact actions

* Keep a record of who created or approved the reminder

* Distinguish a reminder from medical advice

Example:

```
Reminder:
    "Take the medication at 8 PM."

Not automatically allowed:
    "Increase the dosage to 20 mg."
```

Dosage changes should require human confirmation and appropriate professional guidance.

# 6.12 Agent Data Architecture

The agent system needs durable records for:

* Configuration

* Runs

* Steps

* Tool calls

* Approvals

* Checkpoints

* Memory

* Errors

* Cost and token usage

## `agent_configs`

SQL

```
CREATE TABLE agent_configs (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    agent_type VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    configuration JSONB NOT NULL DEFAULT '{}',
    policy JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## `agent_runs`

SQL

```
CREATE TABLE agent_runs (
    id UUID PRIMARY KEY,
    agent_config_id UUID REFERENCES agent_configs(id),
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    trigger_type VARCHAR(40) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    goal TEXT,
    current_node VARCHAR(160),
    parent_run_id UUID REFERENCES agent_runs(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failure_reason TEXT,
    token_usage JSONB NOT NULL DEFAULT '{}',
    cost_metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Possible statuses:

```
queued
running
waiting_for_approval
waiting_for_tool
completed
failed
cancelled
timed_out
replanned
```

## `agent_steps`

SQL

```
CREATE TABLE agent_steps (
    id UUID PRIMARY KEY,
    agent_run_id UUID NOT NULL REFERENCES agent_runs(id),
    step_index INTEGER NOT NULL,
    node_name VARCHAR(160) NOT NULL,
    step_type VARCHAR(40) NOT NULL,
    input JSONB,
    output JSONB,
    status VARCHAR(32) NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_run_id, step_index)
);
```

Do not store unrestricted sensitive prompts and outputs indefinitely. Apply retention and redaction policies.

## `agent_tool_calls`

SQL

```
CREATE TABLE agent_tool_calls (
    id UUID PRIMARY KEY,
    agent_run_id UUID NOT NULL REFERENCES agent_runs(id),
    agent_step_id UUID REFERENCES agent_steps(id),
    tool_name VARCHAR(160) NOT NULL,
    input JSONB NOT NULL,
    output JSONB,
    approval_required BOOLEAN NOT NULL DEFAULT false,
    approval_id UUID,
    status VARCHAR(32) NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error JSONB
);
```

Tool calls must be auditable.

A tool call should record:

```
Who requested it
Which agent initiated it
Which space it belongs to
Which policy allowed it
Whether approval was required
What arguments were passed
What result was returned
Whether it caused an external side effect
```

# 6.13 Agent Approval Model

## `agent_approvals`

SQL

```
CREATE TABLE agent_approvals (
    id UUID PRIMARY KEY,
    agent_run_id UUID NOT NULL REFERENCES agent_runs(id),
    requested_by_agent BOOLEAN NOT NULL DEFAULT true,
    approver_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    action_type VARCHAR(80) NOT NULL,
    action_payload JSONB NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Actions commonly requiring approval:

* Sending WhatsApp messages

* Making phone calls

* Inviting external users

* Sharing private documents

* Sending health-related information

* Deleting data

* Creating financial commitments

* Changing important reminders

* Posting publicly on behalf of a user

* Accessing sensitive family information

Approval must be bound to a specific action payload. A generic approval such as “I approve everything” is unsafe.

# 6.14 Agent Checkpoints

LangGraph-style workflows need resumable state.

Use a durable checkpoint store containing:

```
run_id
graph_version
node_name
state_snapshot
pending_interrupt
retry_count
created_at
expires_at
```

The checkpoint should not necessarily store every full message or document. Store references to durable data whenever possible.

Example:

JSON

```
{
  "run_id": "run-123",
  "graph_version": "v4",
  "current_node": "approval_gate",
  "pending_action_id": "approval-456",
  "state_refs": [
    "task-123",
    "event-456"
  ]
}
```

This reduces duplication and limits sensitive data exposure.

# 6.15 Agent Memory Architecture

Memory must be separated into categories.

```
Short-term conversation state
    └── current run or conversation

Working memory
    └── temporary task context

Long-term user memory
    └── durable user-approved preferences

Space memory
    └── shared family or group facts

Episodic memory
    └── previous completed interactions

Semantic memory
    └── extracted facts and knowledge

Document memory
    └── references to uploaded files and chunks
```

## `memory_items`

SQL

```
CREATE TABLE memory_items (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    memory_type VARCHAR(40) NOT NULL,
    content TEXT NOT NULL,
    source_type VARCHAR(40),
    source_id UUID,
    sensitivity VARCHAR(20) NOT NULL DEFAULT 'normal',
    consent_required BOOLEAN NOT NULL DEFAULT true,
    consent_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    confidence NUMERIC(5,4),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

Memory access rules:

1. A memory must have an owner or space.

2. Shared memory requires space permission.

3. Sensitive memory requires stronger permission.

4. Users must be able to inspect and delete memory.

5. The agent must not silently convert every conversation into permanent memory.

6. Memory should have expiration where appropriate.

Examples of memory that may be stored with consent:

```
Preferred language: Telugu
Preferred reminder time: 8 PM
Family event planning preference
Recurring grocery preference
Preferred communication channel
```

Examples requiring stricter handling:

```
Health information
Medication details
Financial information
Private relationship information
Identity documents
Location history
```

# 6.16 File and Object Storage Architecture

Files should not be stored directly inside PostgreSQL as large binary objects in the initial architecture.

Use:

```
PostgreSQL
    └── file metadata

Object Storage
    └── actual file bytes
```

## `files`

SQL

```
CREATE TABLE files (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    uploaded_by UUID REFERENCES users(id),
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(160),
    size_bytes BIGINT NOT NULL,
    storage_provider VARCHAR(40) NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    checksum_sha256 CHAR(64),
    visibility VARCHAR(32) NOT NULL DEFAULT 'private',
    scan_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    processing_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    encryption_mode VARCHAR(32) NOT NULL DEFAULT 'server_encrypted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

## Object key convention

```
tenant/{tenant_id}/space/{space_id}/file/{file_id}/original
```

For example:

```
space/space-123/file/file-456/original
```

Do not use user-controlled filenames as the storage key.

## Secure upload flow

```
1. Client requests upload permission
2. Backend authenticates user
3. Backend checks space permissions
4. Backend creates file metadata
5. Backend generates presigned upload URL
6. Client uploads directly to object storage
7. Storage event or callback starts scanning
8. Malware/content scan runs
9. File is marked safe or rejected
10. Extraction pipeline begins
```

The backend must validate:

* File size

* MIME type

* Extension

* User permission

* Space policy

* Storage quota

* File checksum

* Malware scan result

Never trust only the filename extension.

# 6.17 Document Processing and RAG Data Model

The RAG pipeline should treat each uploaded document as a sequence of processing stages.

```
File Upload
    ↓
File Validation
    ↓
Malware Scan
    ↓
Text Extraction
    ↓
Page Segmentation
    ↓
Chunking
    ↓
Metadata Enrichment
    ↓
Embedding Generation
    ↓
Vector Index
    ↓
Permission-Aware Retrieval
```

## `documents`

SQL

```
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id),
    owner_user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    title VARCHAR(300),
    language VARCHAR(40),
    page_count INTEGER,
    extraction_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    indexing_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    parser_name VARCHAR(100),
    parser_version VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## `document_pages`

SQL

```
CREATE TABLE document_pages (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id),
    page_number INTEGER NOT NULL,
    text TEXT,
    extraction_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (document_id, page_number)
);
```

## `document_chunks`

SQL

```
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id),
    page_id UUID REFERENCES document_pages(id),
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    start_offset INTEGER,
    end_offset INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, chunk_index)
);
```

## `embeddings`

If using pgvector:

SQL

```
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
    id UUID PRIMARY KEY,
    chunk_id UUID NOT NULL REFERENCES document_chunks(id),
    model_name VARCHAR(160) NOT NULL,
    model_version VARCHAR(80),
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chunk_id, model_name, model_version)
);
```

The vector dimension must match the selected embedding model.

# 6.18 Permission-Aware RAG Retrieval

The retrieval system must apply authorization before returning chunks.

Unsafe pattern:

```
Search all documents
    ↓
Retrieve top 20 chunks
    ↓
Ask the model to ignore private content
```

Correct pattern:

```
1. Authenticate user
2. Resolve accessible spaces
3. Resolve accessible documents
4. Apply permission filters
5. Perform vector search within allowed scope
6. Re-rank allowed results
7. Return citations
```

Example metadata filter:

JSON

```
{
  "owner_user_id": "user-123",
  "space_ids": ["space-1", "space-2"],
  "visibility": ["private", "members"],
  "membership_status": "active"
}
```

The vector database must not be treated as an authorization system by itself. The application must enforce access scope.

## Initial vector architecture

Use PostgreSQL with pgvector when:

* The dataset is moderate

* Operational simplicity matters

* Strong relational permission filters are important

* The team wants fewer infrastructure components

Move to a separate vector database only when:

* Vector search becomes a measurable bottleneck

* Dataset size exceeds PostgreSQL’s practical operating range

* Specialized filtering or indexing is required

* Independent scaling is necessary
