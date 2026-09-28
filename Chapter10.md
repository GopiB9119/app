# Chapter 10 — Backend Service Decomposition, Cloud Infrastructure, Deployment, Scaling, Disaster Recovery, and Production Operations

## 10.1 Purpose

The backend is the central execution layer for:

* Identity and authentication

* Public community pages

* Posts and feeds

* Private spaces

* Membership and permissions

* Conversations

* Realtime messaging

* Agent execution

* Agent memory

* File processing

* Notifications

* Search

* Moderation

* Audit logging

* Billing-ready usage tracking, if added later

* System monitoring and operations

The backend must support Android, web, desktop, and agent clients through the same domain services.

```
Android App
      |
Web App
      |
Desktop Client
      |
Agent Clients
      |
      v
API Gateway / Edge
      |
      v
Backend Platform
```

# 10.2 Architecture Principle

The backend should not begin as dozens of independent microservices.

Start with a modular monolith plus independently scalable workers, then split services only when there is a clear operational or performance reason.

## Recommended evolution

```
Phase 1:
Modular monolith
+
Worker pool
+
Realtime gateway
+
PostgreSQL
+
Redis
+
Object storage

Phase 2:
Extract high-load services

Phase 3:
Extract independently owned domain services

Phase 4:
Multi-region deployment where justified
```

This avoids early complexity in:

* Distributed transactions

* Service discovery

* Debugging

* Deployment

* Authentication propagation

* Data ownership

* Cross-service observability

# 10.3 Initial Backend Topology

```
                         ┌─────────────────────┐
                         │ CDN / Edge / WAF     │
                         └──────────┬──────────┘
                                    |
                         ┌──────────▼──────────┐
                         │ API Gateway          │
                         └──────────┬──────────┘
                                    |
                 ┌──────────────────┼──────────────────┐
                 |                  |                  |
        ┌────────▼────────┐ ┌───────▼────────┐ ┌───────▼────────┐
        │ HTTP API        │ │ WebSocket      │ │ Admin API      │
        │ Runtime         │ │ Gateway        │ │ Runtime        │
        └────────┬────────┘ └───────┬────────┘ └───────┬────────┘
                 |                  |                  |
                 └──────────────────┼──────────────────┘
                                    |
                         ┌──────────▼──────────┐
                         │ Domain Modules      │
                         └──────────┬──────────┘
                                    |
       ┌────────────────────────────┼────────────────────────────┐
       |                            |                            |
┌──────▼──────┐             ┌───────▼────────┐           ┌───────▼────────┐
│ PostgreSQL  │             │ Redis          │           │ Object Storage │
└─────────────┘             └────────────────┘           └────────────────┘
                                    |
                         ┌──────────▼──────────┐
                         │ Queue / Event Bus   │
                         └──────────┬──────────┘
                                    |
       ┌───────────────┬────────────┼───────────────┬───────────────┐
       |               |            |               |               |
┌──────▼──────┐ ┌──────▼──────┐ ┌───▼────────┐ ┌────▼────────┐ ┌────▼────────┐
│ Agent Worker│ │ File Worker │ │ Notification│ │ Search      │ │ Scheduled   │
│ Pool        │ │ Pool        │ │ Worker      │ │ Worker      │ │ Jobs        │
└─────────────┘ └─────────────┘ └────────────┘ └─────────────┘ └─────────────┘
```

# 10.4 Backend Domain Modules

The initial backend should contain clear domain boundaries.

```
backend/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── lifespan.py
│   │
│   ├── api/
│   │   ├── v1/
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── communities.py
│   │   │   ├── spaces.py
│   │   │   ├── posts.py
│   │   │   ├── conversations.py
│   │   │   ├── messages.py
│   │   │   ├── agents.py
│   │   │   ├── approvals.py
│   │   │   ├── files.py
│   │   │   ├── notifications.py
│   │   │   └── search.py
│   │   └── websocket.py
│   │
│   ├── domains/
│   │   ├── identity/
│   │   ├── community/
│   │   ├── spaces/
│   │   ├── conversations/
│   │   ├── agents/
│   │   ├── memory/
│   │   ├── files/
│   │   ├── notifications/
│   │   ├── moderation/
│   │   └── audit/
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── cache/
│   │   ├── queues/
│   │   ├── storage/
│   │   ├── email/
│   │   ├── messaging/
│   │   └── observability/
│   │
│   ├── workers/
│   │   ├── agent_worker.py
│   │   ├── file_worker.py
│   │   ├── notification_worker.py
│   │   ├── search_worker.py
│   │   └── scheduler_worker.py
│   │
│   └── tests/
```

Each domain should contain:

```
domain/
├── models.py
├── schemas.py
├── repository.py
├── service.py
├── permissions.py
├── events.py
├── tasks.py
└── tests/
```

The domain service is the main location for business rules.

# 10.5 Service Responsibilities

## Identity Service

Responsible for:

* Registration

* Login

* Logout

* Session management

* Password recovery

* Email verification

* Device sessions

* Account deletion

* Role assignment

* Security events

It must not contain community or agent business logic.

## Community Service

Responsible for:

* Public pages

* Posts

* Comments

* Reactions

* Topics

* Discovery metadata

* Visibility settings

* Public moderation

* Content reporting

## Space Service

Responsible for:

* Family spaces

* Couple spaces

* Solo spaces

* Custom groups

* Temporary event spaces

* Membership

* Invitations

* Roles

* Permissions

* Space settings

* Member removal

* Space deletion

## Conversation Service

Responsible for:

* Conversations

* Participants

* Messages

* Message status

* Attachments

* Mentions

* Read receipts

* Typing events

* Message search

* Conversation membership

## Agent Runtime

Responsible for:

* Agent registration

* Agent configuration

* Agent runs

* Graph execution

* Tool invocation

* Approval requests

* Run cancellation

* Retries

* Memory access

* Agent events

* Execution limits

* Failure recovery

The agent runtime must not directly bypass domain services.

For example, an agent should not directly write arbitrary rows into the calendar database.

It must call an authorized calendar tool or domain service.

## File Service

Responsible for:

* Upload sessions

* Object-storage keys

* File metadata

* Ownership

* Access control

* Virus scanning

* Text extraction

* Image processing

* File expiration

* Deletion

* Download authorization

## Notification Service

Responsible for:

* In-app notifications

* Push notifications

* Email notifications

* WhatsApp or external messaging adapters

* Notification preferences

* Delivery attempts

* Escalation

* Delivery status

* Retry handling

## Moderation Service

Responsible for:

* Reports

* Blocks

* Content review

* Automated moderation

* Human moderation

* Enforcement actions

* Appeals

* Audit records

# 10.6 Modular Monolith Rules

A modular monolith is only useful if modules are actually separated.

## Rules

1. Each domain owns its business rules.

2. Domains should not import internal implementation details from other domains.

3. Cross-domain operations use service interfaces.

4. Database tables have explicit ownership.

5. Events are used for asynchronous side effects.

6. Transactions remain local where possible.

7. Cross-domain transactions require deliberate design.

8. Tests should verify domain boundaries.

9. Shared utilities must remain small.

10. No “common” package should become a dumping ground.

Example:

```
Conversation Service
    |
    +--> asks Identity Service:
          "Is this user active?"

    +--> asks Space Service:
          "Can this user access this conversation?"

    +--> emits:
          message.created
```

# 10.7 API Runtime

## Recommended initial API stack

```
Python
FastAPI
Pydantic
SQLAlchemy
Alembic
asyncpg
Redis client
OpenTelemetry
```

Use asynchronous code for:

* Network calls

* Database operations

* Redis operations

* Object storage

* External providers

* WebSocket handling

Do not run CPU-heavy work inside the API process.

Move these to workers:

* PDF extraction

* OCR

* Video processing

* Embedding generation

* Large file scanning

* Heavy moderation

* Agent execution

* Bulk notifications

# 10.8 Worker Architecture

Workers should be independently deployable from the API.

```
Queue
  |
  ├── Agent Worker
  ├── File Worker
  ├── Search Worker
  ├── Notification Worker
  ├── Scheduled Job Worker
  └── Moderation Worker
```

Each worker must support:

* Job acknowledgement

* Retry count

* Visibility timeout

* Dead-letter queue

* Idempotency

* Structured logs

* Metrics

* Graceful shutdown

* Concurrency limits

* Job timeout

* Cancellation where supported

# 10.9 Queue Selection

The system may use:

* Redis Streams for simpler initial event processing

* RabbitMQ for message-oriented workloads

* Kafka for very large event streams

* Cloud-managed queues for operational simplicity

## Initial recommendation

Use:

```
Redis Streams or a managed queue
+
Transactional outbox
+
Dead-letter queue
```

Do not introduce Kafka solely because the platform is described as “global.”

Kafka becomes useful when there is a demonstrated need for:

* Very high event volume

* Long event retention

* Multiple independent consumers

* Replayable event streams

* Partition-based scaling

* Large analytics pipelines

# 10.10 Transactional Outbox

The transactional outbox prevents database changes from succeeding while event publication fails.

## Unsafe flow

```
1. Save message to database
2. Publish event
3. Event publish fails
```

The message exists, but realtime and downstream systems never receive the event.

## Safe flow

```
1. Begin database transaction
2. Save message
3. Save outbox event
4. Commit transaction
5. Outbox worker publishes event
6. Mark outbox event as published

Database Transaction
├── messages
└── outbox_events

Outbox Publisher
      |
      v
Event Bus
      |
      ├── WebSocket Gateway
      ├── Notification Worker
      ├── Search Worker
      └── Audit Worker
```

Outbox records need:

* Event ID

* Event type

* Aggregate ID

* Payload

* Created timestamp

* Publish status

* Attempt count

* Last error

* Published timestamp

# 10.11 Idempotency

Every externally retryable operation needs an idempotency strategy.

Examples:

* Send message

* Create space

* Invite member

* Start agent run

* Approve agent action

* Send notification

* Complete file upload

* Create scheduled reminder

Example request:

JSON

```
{
  "idempotency_key": "idem_abc123",
  "conversation_id": "conv_123",
  "body": "Hello"
}
```

The backend should store:

```
idempotency_key
user_id
operation_type
request_hash
response_reference
created_at
expires_at
```

If the same request is repeated:

* Return the original result

* Do not duplicate the operation

* Reject if the same key is reused with different content

# 10.12 Database Scaling

## Initial database

Use PostgreSQL as the primary transactional database.

Responsibilities:

* Users

* Spaces

* Memberships

* Posts

* Conversations

* Messages

* Agent runs

* Approvals

* Notifications

* File metadata

* Audit records

## Scaling sequence

```
Stage 1:
Single primary PostgreSQL
Proper indexes
Connection pooling
Backups

Stage 2:
Read replicas
Query optimization
Partition large tables

Stage 3:
Dedicated databases by domain
Archival storage
Distributed search

Stage 4:
Regional data placement where legally and operationally required
```

Do not begin with multiple databases unless the domain requires it.

# 10.13 Connection Pooling

Every API and worker process can consume database connections.

Without limits:

```
10 API instances × 20 connections
+
10 workers × 10 connections
=
300 connections
```

Use:

* Application-level pool limits

* PgBouncer or managed pooling

* Separate worker pool sizes

* Connection timeouts

* Query timeouts

* Maximum connection budgets

The total connection budget must be calculated before scaling horizontally.

# 10.14 Large Table Strategy

Potentially large tables include:

* Messages

* Events

* Audit logs

* Notifications

* Agent steps

* Outbox events

* File processing jobs

Use:

* Composite indexes

* Cursor pagination

* Time-based partitioning where justified

* Archival policies

* Retention policies

* Separate event storage for high-volume telemetry

Avoid unbounded queries such as:

SQL

```
SELECT *
FROM messages
ORDER BY created_at DESC;
```

Use bounded queries:

SQL

```
SELECT *
FROM messages
WHERE conversation_id = :conversation_id
  AND created_at < :cursor
ORDER BY created_at DESC
LIMIT :page_size;
```

# 10.15 Redis Responsibilities

Redis may be used for:

* Short-lived cache

* Rate limiting

* Session metadata

* Presence

* Typing indicators

* Distributed locks

* Job streams

* WebSocket fanout

* Temporary agent state

* Idempotency records

* Request throttling

Redis should not be the only source of truth for durable data.

Examples of data that must remain durable:

* Messages

* Agent approvals

* Membership

* User settings

* Audit records

* File ownership

* Scheduled tasks

# 10.16 Distributed Locking

Use distributed locks only for operations that genuinely require coordination.

Examples:

* One scheduler processing a specific task

* Preventing duplicate agent execution

* Single active file-processing job

* Preventing concurrent destructive operations

A lock must include:

* Unique owner token

* Expiration

* Renewal policy

* Safe release

* Timeout behavior

Never release a lock belonging to another worker.

# 10.17 Agent Runtime Scaling

Agent workloads are different from ordinary API requests.

An agent run may:

* Execute for seconds or minutes

* Call multiple tools

* Wait for approval

* Retry

* Access memory

* Generate large outputs

* Require external APIs

* Consume significant model budget

Therefore, agent execution must run outside the HTTP request lifecycle.

```
HTTP Request
   |
   v
Create Agent Run
   |
   v
Queue Job
   |
   v
Agent Worker
   |
   +--> LangGraph
   +--> Tool Services
   +--> Memory
   +--> Approval State
   +--> Event Publisher
```

The API returns quickly:

JSON

```
{
  "run_id": "run_123",
  "status": "queued"
}
```

The client receives updates through:

* WebSocket

* Polling fallback

* Push notification

* Email notification where configured

# 10.18 Agent Worker Isolation

Agent execution should have limits:

* Maximum runtime

* Maximum graph steps

* Maximum tool calls

* Maximum retries

* Maximum parallel tools

* Maximum output size

* Maximum memory retrieval

* Maximum external requests

* Maximum cost budget

* Maximum recursion depth

Example configuration:

```
MAX_AGENT_RUNTIME_SECONDS
MAX_AGENT_STEPS
MAX_TOOL_CALLS
MAX_AGENT_RETRIES
MAX_PARALLEL_TOOL_CALLS
MAX_AGENT_OUTPUT_TOKENS
MAX_MEMORY_RESULTS
MAX_EXTERNAL_REQUESTS
```

These are server-side limits. A client must not be allowed to increase them.

# 10.19 External Provider Adapters

External services should be accessed through adapters.

```
Notification Service
   |
   +--> Email Adapter
   +--> Push Adapter
   +--> WhatsApp Adapter
   +--> SMS Adapter
   +--> Voice Adapter
```

The domain layer should call a stable interface:

Python

Run

```
class NotificationProvider:
    async def send(self, message: NotificationMessage) -> DeliveryResult:
        ...
```

The provider implementation handles:

* Authentication

* Provider-specific payloads

* Rate limits

* Retries

* Error mapping

* Delivery receipts

* Provider outages

The application should not depend directly on one provider’s API format.

# 10.20 External Messaging Safety

For WhatsApp, SMS, voice, and email:

* Obtain user consent

* Verify recipient identity

* Store communication preferences

* Respect opt-out requests

* Apply rate limits

* Record delivery status

* Require approval for sensitive actions

* Avoid sending confidential information by default

* Prevent duplicate delivery

* Escalate only according to configured rules

For sensitive reminders, the system should use minimal content in external messages.

Example:

```
A reminder is waiting in your private space.
Open the app for details.
```

Do not automatically send sensitive medical or personal details through an external channel.

# 10.21 Cloud Infrastructure

A production deployment needs:

* Compute

* Database

* Redis

* Object storage

* Queue system

* CDN

* DNS

* TLS certificates

* Secret management

* Monitoring

* Logging

* Backup storage

* Disaster recovery environment

## Logical cloud layout

```
Cloud Account / Project
├── Network
│   ├── Public Subnets
│   └── Private Subnets
│
├── Edge
│   ├── DNS
│   ├── CDN
│   └── WAF
│
├── Compute
│   ├── Web/API
│   ├── WebSocket
│   ├── Workers
│   └── Scheduler
│
├── Data
│   ├── PostgreSQL
│   ├── Redis
│   └── Object Storage
│
├── Security
│   ├── Secrets
│   ├── IAM
│   ├── KMS
│   └── Audit Logs
│
└── Operations
    ├── Metrics
    ├── Logs
    ├── Traces
    ├── Alerts
    └── Backups
```

# 10.22 Network Design

## Public components

Only expose:

* CDN

* API gateway

* WebSocket gateway

* Public web application

## Private components

Keep private:

* PostgreSQL

* Redis

* Internal queues

* Worker services

* Internal admin services

* Object-storage management endpoints

* Internal service APIs

  Internet
  |
  v
  WAF / Load Balancer
  |
  v
  Public API
  |
  v
  Private Network
  |
  ├── Database
  ├── Redis
  ├── Queue
  └── Workers

Use network policies to restrict which services can communicate.

# 10.23 Secrets Management

Secrets must be stored in:

* Cloud secret manager

* Vault

* Kubernetes secrets backed by a secure provider

* Encrypted deployment secret store

Never commit secrets to:

* Git

* Docker images

* Frontend bundles

* Logs

* Error messages

* Chat messages

* Configuration examples

Separate secrets by environment:

```
development
staging
production
```

Rotate:

* API keys

* Database passwords

* Signing keys

* Provider credentials

* Encryption keys

* Session secrets

# 10.24 Deployment Environments

Use at least:

```
Local
Development
Staging
Production
```

## Local

* Docker Compose

* Local PostgreSQL

* Local Redis

* Mock providers

* Development object storage

## Development

* Shared developer environment

* Test data

* Debug logging

* Safe external provider mocks

## Staging

* Production-like infrastructure

* Realistic load tests

* Migration testing

* Security testing

* Release candidate validation

## Production

* Restricted access

* Audited changes

* Real backups

* Alerting

* Rollback

* Incident response

# 10.25 Deployment Pipeline

```
Commit
   |
   v
Static checks
   |
   v
Unit tests
   |
   v
Integration tests
   |
   v
Security scan
   |
   v
Build image
   |
   v
Push immutable artifact
   |
   v
Deploy staging
   |
   v
Smoke tests
   |
   v
Approval
   |
   v
Deploy production
   |
   v
Health verification
```

The deployment system should support:

* Rolling deployments

* Blue/green deployments

* Canary deployments

* Automatic rollback

* Database migration safety

* Versioned configuration

* Release notes

* Deployment audit logs

# 10.26 Database Migration Strategy

Migrations must be backward compatible when rolling deployments are used.

## Safe sequence

```
1. Add nullable column
2. Deploy code that writes both formats
3. Backfill data
4. Deploy code that reads the new format
5. Remove old format later
```

Avoid:

```
1. Drop column immediately
2. Deploy new application later
```

During rolling deployment, old and new application versions may run simultaneously.

# 10.27 Health Checks

Every service should expose:

```
/health/live
/health/ready
/metrics
```

## Liveness

Checks whether the process is alive.

It should not fail merely because PostgreSQL is temporarily unavailable.

## Readiness

Checks whether the service can receive traffic.

May verify:

* Database connectivity

* Required configuration

* Queue connectivity

* Critical dependencies

## Metrics

Expose:

* Request count

* Request latency

* Error count

* Queue depth

* Worker execution time

* Database pool usage

* WebSocket connections

* Agent run counts

* File processing throughput

# 10.28 Autoscaling

Scale different workloads independently.

## API scaling signals

* CPU

* Memory

* Request rate

* Latency

* Active connections

## Worker scaling signals

* Queue depth

* Oldest job age

* Processing latency

* Failed job count

* Worker utilization

## Agent worker scaling signals

* Agent queue depth

* Average run duration

* Tool wait time

* Provider rate limits

* Cost budget

* Concurrent runs

Do not scale solely on CPU for queue-driven workloads.

A worker may be CPU-idle while the queue is growing because it is waiting on external APIs.

# 10.29 Rate Limiting

Rate limits should apply at multiple levels.

## User level

* Login attempts

* Message sends

* Post creation

* Agent runs

* File uploads

* Search requests

## IP level

* Login

* Registration

* Password reset

* Public API abuse

## Space level

* Bulk invitations

* Notifications

* Agent actions

* Public posting

## Provider level

* Email

* WhatsApp

* SMS

* Voice

* Model APIs

Rate-limit responses should include:

```
Retry-After
request_id
stable error code
```

# 10.30 Disaster Recovery

Disaster recovery must cover:

* Database loss

* Region outage

* Object-storage failure

* Queue failure

* Redis loss

* Credential compromise

* Accidental deletion

* Bad deployment

* Data corruption

* Provider outage

## Backup strategy

Back up:

* PostgreSQL

* Object metadata

* Critical configuration

* Encryption key metadata

* Audit records

* Required queue state

* Deployment artifacts

Object files may require:

* Versioning

* Lifecycle policies

* Cross-region replication

* Soft deletion

* Retention locks for required records

# 10.31 Recovery Objectives

Define two important targets.

## Recovery Point Objective

How much data loss is acceptable?

Example categories:

```
Critical messages:
Very low tolerated loss

Analytics:
Higher tolerated loss

Temporary cache:
May be rebuilt
```

## Recovery Time Objective

How quickly must service return?

Example categories:

```
Authentication:
High priority

Messaging:
High priority

Search indexing:
Can recover asynchronously

Analytics:
Lower priority
```

The actual targets must be agreed upon before production launch.

# 10.32 Backup Testing

A backup that has never been restored is not a verified backup.

Perform:

* Automated backup checks

* Restore tests

* Point-in-time recovery tests

* Object-storage recovery tests

* Credential recovery drills

* Region-failure exercises

* Database corruption simulations

* Runbook validation

Record:

* Restore duration

* Missing data

* Failed steps

* Required manual actions

* Recovery owner

# 10.33 Failure Handling

## Database unavailable

The API should:

* Fail safely

* Avoid retry storms

* Return a stable temporary error

* Stop nonessential work

* Preserve request IDs

* Alert operators

## Redis unavailable

The system should distinguish:

* Features that can degrade

* Features that must stop

* Data that must never be lost

For example:

* Presence may be temporarily unavailable

* Durable messages must still use PostgreSQL

* Rate limiting may use a fallback strategy

* Agent execution locks may require a safe stop

## Queue unavailable

The API should not report a background task as accepted unless durable job creation succeeded.

## Provider unavailable

Use:

* Retries with limits

* Circuit breakers

* Fallback providers

* Delayed delivery

* Clear user status

* Dead-letter handling

# 10.34 Circuit Breakers

Circuit breakers protect the system from repeatedly calling failing providers.

States:

```
CLOSED
   |
Failure threshold reached
   v
OPEN
   |
Cooldown elapsed
   v
HALF_OPEN
   |
Successful test
   v
CLOSED
```

Use circuit breakers for:

* Model providers

* Email providers

* WhatsApp providers

* Voice providers

* Search services

* External calendar APIs

* Payment services if added later

# 10.35 Observability Architecture

Use three major signals.

## Logs

Structured event records:

JSON

```
{
  "timestamp": "2026-09-18T12:00:00Z",
  "level": "ERROR",
  "service": "agent-worker",
  "request_id": "req_123",
  "run_id": "run_123",
  "event": "tool_execution_failed",
  "tool": "calendar.create_event",
  "error_code": "PROVIDER_TIMEOUT"
}
```

## Metrics

Track:

* API latency

* Error rate

* Queue depth

* Job age

* Database latency

* Cache hit ratio

* WebSocket disconnects

* Agent completion rate

* Agent failure rate

* Approval wait time

* File extraction throughput

* Notification delivery rate

## Traces

Trace:

```
HTTP request
   |
   v
Domain service
   |
   v
Database query
   |
   v
Outbox event
   |
   v
Worker job
   |
   v
Agent run
   |
   v
Tool call
   |
   v
External provider
```

# 10.36 Security Operations

Production operations must include:

* Vulnerability scanning

* Dependency updates

* Secret rotation

* Access reviews

* Audit log review

* Suspicious login detection

* Rate-limit monitoring

* Abuse detection

* Incident response

* Data deletion workflows

* Backup encryption

* Key management

* Least-privilege IAM

Administrative actions must be audited.

Examples:

* User suspension

* Space deletion

* Role changes

* Data export

* Memory deletion

* Manual agent cancellation

* Provider credential changes

# 10.37 Cost Control

Track costs by:

* User

* Space

* Agent

* Agent run

* Model provider

* Tool

* File processing job

* Notification channel

* Storage

* Compute

Cost controls include:

* Per-user limits

* Per-space limits

* Per-agent limits

* Daily budgets

* Maximum run duration

* Maximum tool calls

* Model selection policies

* Queue concurrency limits

* File size limits

* Storage lifecycle policies

An agent must not continue indefinitely because a tool keeps failing.

# 10.38 Production Readiness Checklist

## Application

* API versioning exists

* Authentication is secure

* Authorization is centralized

* Idempotency is implemented

* Outbox is implemented

* Background jobs are durable

* Retries are bounded

* Dead-letter queues exist

* Agent execution is isolated

* File uploads are scanned

* Audit logs exist

## Infrastructure

* Private database network

* Secret manager

* TLS

* WAF or equivalent protection

* Autoscaling

* Health checks

* Metrics

* Logs

* Traces

* Backups

* Restore tests

* Rollback plan

## Operations

* On-call ownership

* Incident runbooks

* Alert thresholds

* Deployment approvals

* Security response plan

* Data deletion process

* Provider outage plan

* Disaster recovery exercise

# 10.39 Final Backend Architecture Decision

Use the following initial production architecture:

```
FastAPI Modular Monolith
+
PostgreSQL
+
Redis
+
Transactional Outbox
+
Redis Streams or Managed Queue
+
Dedicated Worker Processes
+
LangGraph Agent Runtime
+
Object Storage
+
WebSocket Gateway
+
OpenTelemetry
+
Docker
+
Managed Cloud Infrastructure
```

Extract services only when there is a clear reason:

* Independent scaling

* Independent deployment

* Different security boundary

* Different data ownership

* Different reliability requirement

* Different team ownership

* Provider isolation

* High-volume workload

# 10.40 Chapter 10 Acceptance Criteria

Chapter 10 is complete when:

* Backend domains have clear ownership

* API and worker processes are separated

* Long-running tasks never block HTTP requests

* Agent runs are queued and independently scalable

* Database writes and events use an outbox pattern

* Retried operations are idempotent

* Redis is not the sole durable data store

* Sensitive services are private-networked

* Secrets are centrally managed

* Deployments support rollback

* Migrations are backward compatible

* Health and readiness checks exist

* Metrics, logs, and traces are available

* Rate limits are enforced

* Provider failures use bounded retries and circuit breakers

* PostgreSQL backups are automated

* Restore procedures are tested

* Disaster recovery objectives are defined

* Agent and infrastructure costs are measurable

* Production incidents have documented runbooks

