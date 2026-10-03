# Complete System Architecture and Engineering Blueprint

Community Agent Platform: Backend, Database, Web, Android, APIs, Infrastructure, Security, and Operations

This chapter defines a production-oriented reference architecture for building the application end to end. It connects the frontend, Android application, backend services, databases, AI agents, external integrations, infrastructure, and operational controls into one system.

The architecture is designed around five core principles:

- One authoritative backend: web and Android clients use the same business APIs and authorization rules.
- Strict space isolation: family, couple, solo, custom, and temporary-event spaces have distinct data boundaries.
- Privacy by default: sensitive information is private unless an explicit, validated permission allows access.
- Reliable asynchronous work: reminders, notifications, and agent tasks must survive retries, outages, and duplicate delivery.
- Evidence-based readiness: features are considered complete only when implementation, security, tests, and operational evidence exist.

This is a target architecture, not a claim that these systems are already implemented in your repository.

## 1. Overall system architecture

Client applications

Next.js website · Android app · Admin console · Optional external channels

Edge and API layer

DNS · CDN · WAF · TLS · API gateway · Rate limiting

Backend application

Identity and sessions

Authorization and policies

Spaces and memberships

Messaging and collaboration

Tasks and calendar

Medication reminders

Events and budgets

Agent orchestration

Consent and memory

Notifications and integrations

Data and asynchronous processing

PostgreSQL

Redis cache and coordination

Object storage

Transactional outbox

Queue and worker system

Search and vector index (optional)

External services and operations

FCM · APNs · Email/SMS · AI model providers · Observability · Backups · Secrets management

### Architecture decision

Start with a modular monolith, not a large collection of microservices.

A modular monolith gives the team one deployable backend while preserving clear domain boundaries. It reduces early operational complexity and makes database transactions easier. Split services later when scaling, deployment independence, or team ownership provides a concrete reason.

Recommended initial deployment units:

| Unit             | Responsibility                                               |
| ---------------- | ------------------------------------------------------------ |
| `api`            | Authenticated HTTP APIs and WebSocket endpoints              |
| `worker`         | Scheduled work, queue consumers, notifications, agent jobs   |
| `scheduler`      | Finds and enqueues due work; can initially run inside worker |
| `web`            | Website and admin interface                                  |
| `android`        | Native Android application                                   |
| `postgres`       | Authoritative transactional database                         |
| `redis`          | Cache, rate limits, ephemeral coordination                   |
| `object-storage` | Uploads, media, exports, and generated files                 |

Do not make Redis the source of truth for medication records, messages, membership, financial records, or agent permissions.

## 2. Technology stack and package selection

The following stack is a reference selection. The exact versions should be pinned in the repository and upgraded through a controlled process.

| Layer                | Technology                          | Purpose                                    |
| -------------------- | ----------------------------------- | ------------------------------------------ |
| Web                  | Next.js, React, TypeScript          | Website, dashboard, admin interface        |
| UI                   | Tailwind CSS, shadcn/ui, Radix UI   | Reusable accessible components             |
| Web data             | TanStack Query, Zod                 | Server state and validation                |
| Android              | Kotlin, Jetpack Compose             | Native Android experience                  |
| Android architecture | ViewModel, Coroutines, Flow         | State management and asynchronous work     |
| Android networking   | Retrofit or Ktor Client, OkHttp     | Typed HTTP calls                           |
| Backend              | Python, FastAPI                     | API and domain application                 |
| Backend validation   | Pydantic                            | Request and response schemas               |
| ORM                  | SQLAlchemy                          | Database access                            |
| Migrations           | Alembic                             | Versioned schema changes                   |
| Database             | PostgreSQL                          | Transactional system of record             |
| Cache                | Redis                               | Cache, short-lived state, coordination     |
| Background work      | Celery or a durable workflow engine | Asynchronous processing                    |
| Agent orchestration  | LangGraph or a custom orchestrator  | Agent workflows and tool execution         |
| API specification    | OpenAPI                             | Contract generation and client integration |
| Real-time updates    | WebSockets, optionally SSE          | Messaging and live state updates           |
| Object storage       | S3-compatible storage               | Uploads and generated media                |
| Push                 | Firebase Cloud Messaging, APNs      | Mobile push delivery                       |
| Observability        | OpenTelemetry, Prometheus, Grafana  | Traces, metrics, dashboards                |
| Error tracking       | Sentry or equivalent                | Exception reporting                        |
| Deployment           | Docker, managed container platform  | Reproducible runtime                       |
| Infrastructure       | Terraform or equivalent             | Infrastructure as code                     |
| CI/CD                | GitHub Actions                      | Build, test, scan, deploy                  |
| Secrets              | Cloud secret manager                | Credentials and signing keys               |

### Suggested repository structure

```
community-platform/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   └── tests/
│   ├── android/
│   │   ├── app/
│   │   ├── core/
│   │   ├── feature/
│   │   └── data/
│   └── admin/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── domains/
│   │   │   ├── identity/
│   │   │   ├── authorization/
│   │   │   ├── spaces/
│   │   │   ├── messaging/
│   │   │   ├── tasks/
│   │   │   ├── medication/
│   │   │   ├── events/
│   │   │   ├── budgets/
│   │   │   ├── agents/
│   │   │   ├── memory/
│   │   │   └── notifications/
│   │   ├── integrations/
│   │   ├── workers/
│   │   └── main.py
│   ├── migrations/
│   └── tests/
├── packages/
│   ├── api-client/
│   ├── contracts/
│   ├── design-tokens/
│   └── shared-types/
├── infrastructure/
│   ├── docker/
│   ├── terraform/
│   ├── monitoring/
│   └── deployment/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── security/
│   └── decisions/
├── .github/
│   └── workflows/
└── README.md
```

Important package boundary: shared packages should contain API schemas, generated clients, design tokens, and stable primitives. They should not contain backend business logic copied into the browser or Android app. Authorization decisions must remain server-side.

## 3. Domain architecture and module ownership

Each domain should own its business rules, persistence access, events, and tests. Other domains interact through explicit interfaces rather than directly modifying its tables.

| Domain        | Owns                                                     | Must not own                       |
| ------------- | -------------------------------------------------------- | ---------------------------------- |
| Identity      | Accounts, credentials, sessions, linked identities       | Space-specific permissions         |
| Authorization | Policy evaluation, role capabilities, grants             | UI visibility decisions alone      |
| Spaces        | Space lifecycle, settings, membership, invitations       | Private health records             |
| Messaging     | Conversations, messages, attachments, delivery state     | Membership authority               |
| Tasks         | Tasks, assignments, completion history                   | Medication occurrence truth        |
| Calendar      | Events, recurrence, time-zone interpretation             | Push delivery state                |
| Medication    | Medication plans, schedules, occurrences, user responses | Medical advice or diagnosis        |
| Agents        | Agent configurations, runs, tool execution, approvals    | Unrestricted data retrieval        |
| Memory        | Memory items, consent, retention, deletion               | Global unconsented memory          |
| Notifications | Delivery preferences, attempts, provider responses       | Original business records          |
| Events        | Event planning and participation                         | General space membership authority |
| Budgets       | Budget periods, entries, limits, summaries               | Bank account credentials           |

A domain may use another domain’s public service or query interface, but it should not bypass that domain’s access controls.

## 4. Database architecture

Use PostgreSQL as the authoritative database. A single database can contain multiple domain schemas or use clear table prefixes. Start with a shared database and enforce access through application services, foreign keys, and, where appropriate, row-level security.

### Core entity relationship diagram

\#chatgpt-mermaid-\_r_jq\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_jq\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_jq\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_jq\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_jq\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_jq\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_jq\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_jq\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_jq\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_jq\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_jq\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_jq\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_jq\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_jq\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_jq\_ p{margin:0;}#chatgpt-mermaid-\_r_jq\_ .entityBox{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_jq\_ .relationshipLabelBox{fill:rgb(243, 243, 243);opacity:0.7;background-color:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_jq\_ .relationshipLabelBox rect{opacity:0.5;}#chatgpt-mermaid-\_r_jq\_ .labelBkg{background-color:rgba(243, 243, 243, 0.5);}#chatgpt-mermaid-\_r_jq\_ .edgeLabel{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_jq\_ .edgeLabel .label rect{fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_jq\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_jq\_ .edgeLabel .label{fill:rgb(239, 139, 87);font-size:14px;}#chatgpt-mermaid-\_r_jq\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_jq\_ .edge-pattern-dashed{stroke-dasharray:8,8;}#chatgpt-mermaid-\_r_jq\_ .node rect,#chatgpt-mermaid-\_r_jq\_ .node circle,#chatgpt-mermaid-\_r_jq\_ .node ellipse,#chatgpt-mermaid-\_r_jq\_ .node polygon{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_jq\_ .relationshipLine{stroke:rgb(143, 143, 143);stroke-width:1px;fill:none;}#chatgpt-mermaid-\_r_jq\_ .marker{fill:none!important;stroke:rgb(143, 143, 143)!important;stroke-width:1;}#chatgpt-mermaid-\_r_jq\_ [data-look=neo].labelBkg{background-color:rgba(243, 243, 243, 0.5);}#chatgpt-mermaid-\_r_jq\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_jq\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_jq\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_jq\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_jq\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_jq\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_jq\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_jq\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}USERSSPACE_MEMBERSHIPSSPACESSPACE_INVITATIONSAGENT_BINDINGSAGENTSCONVERSATIONSMESSAGESTASKSEVENTSBUDGETSMEDICATION_PLANSMEDICATION_SCHEDULESMEDICATION_OCCURRENCESMEDICATION_RESPONSESAGENT_RUNSTOOL_CALLSCONSENTSMEMORY_ITEMSAUDIT_EVENTSjoinscontainsissueshasassignedparticipatesscopescontainssendsscopesassignedscopesownsownsschedulescreatesreceivesexecutesrecordsgrantsownsrecords

This is a logical model. Production relationships may need additional association tables, ownership fields, lifecycle records, and constraints.

### Core database tables

| Table                    | Key fields                                                                           | Important relationships           |
| ------------------------ | ------------------------------------------------------------------------------------ | --------------------------------- |
| `users`                  | `id`, `email_normalized`, `status`, `created_at`                                     | Account identity                  |
| `user_identities`        | `id`, `user_id`, `provider`, `provider_subject`                                      | External login identities         |
| `sessions`               | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`                            | Authenticated sessions            |
| `spaces`                 | `id`, `type`, `name`, `owner_user_id`, `status`                                      | Root for scoped collaboration     |
| `space_memberships`      | `id`, `space_id`, `user_id`, `role`, `status`                                        | User-to-space membership          |
| `space_invitations`      | `id`, `space_id`, `token_hash`, `expires_at`, `status`                               | Invitation lifecycle              |
| `permission_grants`      | `id`, `subject_type`, `subject_id`, `resource_scope`, `capability`                   | Explicit delegated access         |
| `conversations`          | `id`, `space_id`, `type`, `created_by`                                               | Space-scoped messaging            |
| `conversation_members`   | `conversation_id`, `user_id`, `last_read_at`                                         | Conversation participants         |
| `messages`               | `id`, `conversation_id`, `sender_id`, `body`, `created_at`                           | Conversation history              |
| `tasks`                  | `id`, `space_id`, `created_by`, `assignee_id`, `status`, `due_at`                    | Task lifecycle                    |
| `calendar_events`        | `id`, `space_id`, `title`, `starts_at`, `timezone`                                   | Shared scheduling                 |
| `medication_plans`       | `id`, `owner_user_id`, `name`, `instructions`, `status`                              | Private user-entered plan         |
| `medication_schedules`   | `id`, `plan_id`, `timezone`, `local_time`, `recurrence_rule`                         | Reminder schedule                 |
| `medication_occurrences` | `id`, `schedule_id`, `scheduled_at`, `state`                                         | One scheduled instance            |
| `medication_responses`   | `id`, `occurrence_id`, `user_id`, `response`, `recorded_at`                          | Self-reported action              |
| `agents`                 | `id`, `name`, `version`, `configuration`                                             | Agent definition                  |
| `agent_bindings`         | `id`, `agent_id`, `space_id`, `scope_policy_id`, `status`                            | Agent-to-space assignment         |
| `agent_runs`             | `id`, `binding_id`, `status`, `started_at`, `finished_at`                            | Agent execution                   |
| `tool_calls`             | `id`, `run_id`, `tool_name`, `input_digest`, `status`                                | Auditable tool invocation         |
| `consents`               | `id`, `user_id`, `scope`, `purpose`, `status`, `version`                             | Consent lifecycle                 |
| `memory_items`           | `id`, `owner_user_id`, `space_id`, `content_ref`, `retention_until`                  | Scoped stored memory              |
| `notification_jobs`      | `id`, `recipient_id`, `event_key`, `scheduled_at`, `status`                          | Durable delivery work             |
| `notification_attempts`  | `id`, `job_id`, `provider`, `status`, `attempted_at`                                 | Delivery audit                    |
| `outbox_events`          | `id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `published_at`      | Reliable event publication        |
| `audit_events`           | `id`, `actor_id`, `space_id`, `action`, `resource_type`, `resource_id`, `created_at` | Security and administrative audit |

Use UUIDs or another non-guessable identifier strategy for externally exposed record IDs. An unguessable ID is not authorization; every request still needs a permission check.

### Metadata conventions

Use consistent metadata across domains:

```
{
  "id": "uuid",
  "created_at": "2026-10-03T00:00:00Z",
  "updated_at": "2026-10-03T00:00:00Z",
  "created_by": "user-uuid",
  "version": 1,
  "deleted_at": null
}
```

This is a conceptual metadata example. Do not add every field mechanically to every table. For example, immutable audit events may not need `updated_at`, and records with strict retention requirements may require a different deletion model.

Recommended metadata rules:

- Use UTC timestamps for instants.
- Store IANA time-zone names for local schedules, such as `Asia/Kolkata`.
- Store explicit version numbers for optimistic concurrency where concurrent edits are possible.
- Keep audit records separate from mutable business records.
- Avoid storing duplicated derived values unless there is a clear consistency strategy.
- Use `jsonb` only for flexible metadata or versioned payloads, not as a substitute for relational constraints.

## 5. Database constraints and integrity rules

Database constraints are essential because application validation alone cannot protect data from every bug, concurrent request, migration, or background worker.

### Essential constraints

| Area                    | Constraint                                 | Reason                                |
| ----------------------- | ------------------------------------------ | ------------------------------------- |
| Users                   | Unique normalized email where applicable   | Prevent duplicate accounts            |
| Identity                | Unique `(provider, provider_subject)`      | Prevent identity collisions           |
| Membership              | Unique `(space_id, user_id)`               | Prevent duplicate memberships         |
| Invitations             | Unique token hash                          | Prevent ambiguous invitation lookup   |
| Conversation membership | Unique `(conversation_id, user_id)`        | Prevent duplicate participants        |
| Message                 | Foreign key to conversation and sender     | Preserve referential integrity        |
| Tasks                   | Valid status check                         | Prevent invalid task states           |
| Medication              | Foreign keys from schedule to plan         | Prevent orphan schedules              |
| Occurrences             | Unique schedule and occurrence key         | Prevent duplicate scheduled instances |
| Responses               | Valid response enum                        | Preserve action semantics             |
| Agent binding           | Unique active binding per applicable scope | Avoid conflicting configurations      |
| Consent                 | Versioned consent record                   | Preserve consent history              |
| Notifications           | Unique idempotency key                     | Prevent duplicate logical jobs        |
| Outbox                  | Unique event ID                            | Prevent duplicate publication records |
| Audit                   | Append-only access policy                  | Protect audit history                 |

A PostgreSQL-style example:

```
CREATE TABLE space_memberships (
    id UUID PRIMARY KEY,
    space_id UUID NOT NULL REFERENCES spaces(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (space_id, user_id),
    CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'GUEST')),
    CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'LEFT'))
);
```

Additional integrity requirements:

- A space must have a valid owner or a documented ownerless lifecycle state.
- Ownership transfer must be transactional and audited.
- Removing a member must revoke that member’s future access promptly.
- Deleting a space must not accidentally delete records that have separate legal, retention, or ownership rules.
- An occurrence must belong to the correct medication schedule and user scope.
- Agent runs must reference a valid agent binding and capture the binding version used.
- Notification retries must not create duplicate business actions.
- Every resource identifier accepted from a client must be checked against the authenticated user’s authorized scope.

### Row-level security

PostgreSQL row-level security (RLS) can provide defense in depth for space-scoped tables.

Conceptual example:

```
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_space_access
ON tasks
USING (
  space_id = current_setting('app.current_space_id', true)::uuid
);
```

This example is incomplete for production. A secure implementation must establish the context from a trusted authenticated backend transaction, handle missing or invalid context safely, define write policies with `WITH CHECK`, and ensure connection-pool reuse cannot leak session context between requests.

RLS should complement, not replace, service-layer authorization. Test direct SQL access, background jobs, migrations, and administrative access separately.

## 6. Backend API architecture and contracts

Use versioned REST APIs for core business operations. Use WebSockets for interactive real-time communication where needed. Keep API contracts in OpenAPI and generate typed clients where practical.

Example request lifecycle

1\. Client request

2\. Authentication

3\. Input validation

4\. Authorization and scope resolution

5\. Domain service and transaction

6\. Database + outbox write

7\. Response / asynchronous event

### API domain map

| Domain             | Example endpoints                                                         | Purpose                     |
| ------------------ | ------------------------------------------------------------------------- | --------------------------- |
| Authentication     | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`    | Session management          |
| Users              | `GET /v1/me`, `PATCH /v1/me`                                              | Account profile             |
| Spaces             | `POST /v1/spaces`, `GET /v1/spaces`, `GET /v1/spaces/{id}`                | Space lifecycle             |
| Membership         | `POST /v1/spaces/{id}/invitations`, `POST /v1/invitations/{token}/accept` | Invitations and membership  |
| Permissions        | `GET /v1/spaces/{id}/permissions`, `POST /v1/grants`                      | Permission administration   |
| Messaging          | `GET /v1/conversations`, `POST /v1/conversations/{id}/messages`           | Communication               |
| Tasks              | `GET /v1/spaces/{id}/tasks`, `POST /v1/tasks`, `PATCH /v1/tasks/{id}`     | Task management             |
| Calendar           | `GET /v1/spaces/{id}/calendar`, `POST /v1/events`                         | Scheduling                  |
| Medication         | `GET /v1/medication/plans`, `POST /v1/medication/plans`                   | Private medication tracking |
| Medication actions | `POST /v1/medication/occurrences/{id}/responses`                          | Record user response        |
| Agents             | `GET /v1/spaces/{id}/agents`, `POST /v1/agent-runs`                       | Scoped agent management     |
| Memory             | `GET /v1/memory`, `POST /v1/memory/consents`                              | Memory and consent          |
| Notifications      | `GET /v1/notifications`, `PATCH /v1/notification-preferences`             | Notification settings       |
| Events             | `GET /v1/spaces/{id}/events`, `POST /v1/events`                           | Event planning              |
| Budgets            | `GET /v1/spaces/{id}/budgets`, `POST /v1/budget-entries`                  | Budget tracking             |

Avoid exposing internal database structure directly through the API. A response should reflect the client’s use case and permission scope, not simply serialize an ORM object.

### Example API contract: create a space

Request:

```
POST /v1/spaces
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: 7f6b...

{
  "name": "Weekend Planning",
  "type": "CUSTOM",
  "visibility": "PRIVATE"
}
```

Response:

```
{
  "id": "space-uuid",
  "name": "Weekend Planning",
  "type": "CUSTOM",
  "visibility": "PRIVATE",
  "status": "ACTIVE",
  "created_at": "2026-10-03T00:00:00Z"
}
```

Contract requirements:

- Validate the space type against the supported enum.
- Derive the initial owner from the authenticated identity, never from a client-supplied `owner_user_id`.
- Enforce the caller’s space-creation limits.
- Create the space and owner membership atomically.
- Return a stable error contract for invalid input, authentication failure, authorization failure, and rate limiting.
- Ensure retries with the same idempotency key do not create multiple spaces.

### Example API contract: medication response

Request:

```
POST /v1/medication/occurrences/occurrence-uuid/responses
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: action-uuid

{
  "response": "TAKEN",
  "recorded_at": "2026-10-03T08:02:00+05:30"
}
```

Response:

```
{
  "occurrence_id": "occurrence-uuid",
  "response": "TAKEN",
  "recorded_at": "2026-10-03T02:32:00Z",
  "recording_type": "USER_REPORTED"
}
```

The server should verify that the authenticated user is authorized to update that occurrence. The action `TAKEN` means the user reported taking the medication; it does not verify ingestion or establish a medical fact. `SKIPPED`, `SNOOZED`, and `NOT_NOW` must remain distinct states or action records. In particular, `NOT_NOW` must not be interpreted as taken or skipped.

### Standard error contract

```
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource.",
    "request_id": "req-uuid",
    "details": []
  }
}
```

Recommended HTTP status mapping:

| Status | Meaning                                     |
| ------ | ------------------------------------------- |
| `400`  | Malformed request                           |
| `401`  | Missing or invalid authentication           |
| `403`  | Authenticated but not authorized            |
| `404`  | Resource missing or intentionally concealed |
| `409`  | State conflict or duplicate operation       |
| `422`  | Schema or semantic validation error         |
| `429`  | Rate limit exceeded                         |
| `500`  | Unexpected server error                     |
| `503`  | Temporary service unavailability            |

Use `404` rather than `403` for selected sensitive resources when revealing their existence would itself disclose private information. Apply this consistently and document it in the API contract.

## 7. Website architecture

The website should be organized by user workflows, not only by technical components.

Website navigation model

Application shell

Session · Active space · Global notifications · Account menu

Home

Activity and personal overview

Spaces

Members, settings, permissions

Messages

Conversations and attachments

Tasks

Assignments and progress

Calendar

Schedules and shared events

Health

Private medication tracking

Agents

Agent configuration and approvals

Events and budgets

Planning and shared expenses

### Web implementation boundaries

- Route layer: page composition, navigation, loading boundaries.
- Feature layer: feature-specific UI, validation, queries, mutations.
- API client: typed requests, token handling, retries, error mapping.
- Design system: accessible primitives, tokens, layouts, forms.
- Permission-aware presentation: hide or disable actions where appropriate, while treating server authorization as authoritative.
- Offline and failure states: distinguish unsaved edits, stale data, and failed actions.
- Admin interface: use separate authorization scopes and audited administrative actions.

Example feature structure:

```
apps/web/features/spaces/
├── api/
│   ├── get-spaces.ts
│   ├── create-space.ts
│   └── update-space.ts
├── components/
│   ├── space-card.tsx
│   ├── space-switcher.tsx
│   └── member-list.tsx
├── hooks/
├── schemas/
├── pages/
└── tests/
```

Do not put all feature behavior into a single global state store. Use server-state tooling for API data and local state for transient interface interactions.

## 8. Android application architecture

Use a native Android application with Kotlin and Jetpack Compose. It should consume the same backend contracts as the website.

\#chatgpt-mermaid-\_r_nd\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_nd\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_nd\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_nd\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_nd\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_nd\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_nd\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_nd\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_nd\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_nd\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_nd\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_nd\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_nd\_ p{margin:0;}#chatgpt-mermaid-\_r_nd\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_nd\_ .label text,#chatgpt-mermaid-\_r_nd\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ .node rect,#chatgpt-mermaid-\_r_nd\_ .node circle,#chatgpt-mermaid-\_r_nd\_ .node ellipse,#chatgpt-mermaid-\_r_nd\_ .node polygon,#chatgpt-mermaid-\_r_nd\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ .rough-node .label text,#chatgpt-mermaid-\_r_nd\_ .node .label text,#chatgpt-mermaid-\_r_nd\_ .image-shape .label,#chatgpt-mermaid-\_r_nd\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_nd\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ .rough-node .label,#chatgpt-mermaid-\_r_nd\_ .node .label,#chatgpt-mermaid-\_r_nd\_ .image-shape .label,#chatgpt-mermaid-\_r_nd\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_nd\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_nd\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_nd\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_nd\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_nd\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_nd\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_nd\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_nd\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_nd\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_nd\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_nd\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_nd\_ .icon-shape,#chatgpt-mermaid-\_r_nd\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_nd\_ .icon-shape p,#chatgpt-mermaid-\_r_nd\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_nd\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_nd\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_nd\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_nd\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_nd\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_nd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_nd\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_nd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_nd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_nd\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_nd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_nd\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_nd\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_nd\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_nd\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_nd\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ .node rect,#chatgpt-mermaid-\_r_nd\_ .node circle,#chatgpt-mermaid-\_r_nd\_ .node ellipse,#chatgpt-mermaid-\_r_nd\_ .node polygon,#chatgpt-mermaid-\_r_nd\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_nd\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_nd\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_nd\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_nd\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_nd\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Compose UIViewModelsUse casesRepositoriesAPI clientLocal database / cacheWorkManagerFirebase Cloud MessagingCommunity backend

### Android module layout

```
android/
├── app/
├── core/
│   ├── common/
│   ├── network/
│   ├── database/
│   ├── designsystem/
│   ├── navigation/
│   ├── auth/
│   └── notifications/
└── feature/
    ├── home/
    ├── spaces/
    ├── messaging/
    ├── tasks/
    ├── calendar/
    ├── medication/
    ├── agents/
    ├── events/
    └── budgets/
```

### Android SDK and library guidance

| Package or SDK                  | Use                                   |
| ------------------------------- | ------------------------------------- |
| Jetpack Compose                 | Declarative interface                 |
| AndroidX Lifecycle              | Lifecycle-aware state                 |
| Navigation Compose              | Navigation                            |
| Kotlin Coroutines and Flow      | Asynchronous state and streams        |
| Retrofit or Ktor                | HTTP client                           |
| OkHttp                          | Network transport and interceptors    |
| Room                            | Local relational cache                |
| DataStore                       | Small preference and settings storage |
| WorkManager                     | Deferrable background synchronization |
| FCM                             | Push notification delivery            |
| Android Keystore                | Protected cryptographic key storage   |
| Credential Manager              | Modern sign-in flows                  |
| Hilt or Koin                    | Dependency injection                  |
| Macrobenchmark and UI Automator | Performance and UI tests              |

### Offline and synchronization rules

- Cache only data the user is allowed to access.
- Keep private health data out of shared-space caches.
- Store pending user actions with idempotency keys.
- Use server versions or ETags to detect stale edits.
- Define conflict behavior for concurrent edits.
- Never silently overwrite newer server state.
- Handle logout by clearing user-specific local data and revoking or discarding pending operations according to the security policy.
- Do not rely on Android background scheduling for exact-time medication delivery. Device restrictions, connectivity, battery optimization, and force-stop behavior can delay or suppress local work. Server-side scheduling and push delivery should be the primary reminder path, with local scheduling as a documented supplement.

## 9. Agent runtime and tool-access architecture

Agents are privileged application actors. They must not connect directly to the database or receive unrestricted credentials.

\#chatgpt-mermaid-\_r_ns\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_ns\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ns\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ns\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_ns\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_ns\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_ns\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_ns\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_ns\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_ns\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ns\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ns\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_ns\_ p{margin:0;}#chatgpt-mermaid-\_r_ns\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_ns\_ .label text,#chatgpt-mermaid-\_r_ns\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ .node rect,#chatgpt-mermaid-\_r_ns\_ .node circle,#chatgpt-mermaid-\_r_ns\_ .node ellipse,#chatgpt-mermaid-\_r_ns\_ .node polygon,#chatgpt-mermaid-\_r_ns\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ .rough-node .label text,#chatgpt-mermaid-\_r_ns\_ .node .label text,#chatgpt-mermaid-\_r_ns\_ .image-shape .label,#chatgpt-mermaid-\_r_ns\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_ns\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ .rough-node .label,#chatgpt-mermaid-\_r_ns\_ .node .label,#chatgpt-mermaid-\_r_ns\_ .image-shape .label,#chatgpt-mermaid-\_r_ns\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_ns\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_ns\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ns\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ns\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_ns\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_ns\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ns\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ns\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_ns\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_ns\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ns\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_ns\_ .icon-shape,#chatgpt-mermaid-\_r_ns\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_ns\_ .icon-shape p,#chatgpt-mermaid-\_r_ns\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_ns\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_ns\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ns\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_ns\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_ns\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_ns\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_ns\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_ns\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_ns\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ns\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_ns\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ns\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_ns\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_ns\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_ns\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_ns\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ .node rect,#chatgpt-mermaid-\_r_ns\_ .node circle,#chatgpt-mermaid-\_r_ns\_ .node ellipse,#chatgpt-mermaid-\_r_ns\_ .node polygon,#chatgpt-mermaid-\_r_ns\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_ns\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_ns\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_ns\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_ns\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ns\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}User requestAuthenticated APIScope and permissionevaluatorAgent bindingAuthorized context retrievalModel and workfloworchestratorTool gatewayApproval required?Validated tool executionAudit and run recordsResponse or proposed actionYesNo

### Required agent metadata

An agent binding should have fields such as:

```
{
  "id": "binding-uuid",
  "agent_id": "agent-uuid",
  "space_id": "space-uuid",
  "scope_policy_id": "policy-uuid",
  "status": "ACTIVE",
  "configuration_version": 3,
  "allowed_tools": [
    "read_space_tasks",
    "create_task_proposal"
  ],
  "approval_policy": "REQUIRED_FOR_MUTATIONS",
  "created_at": "2026-10-03T00:00:00Z"
}
```

This metadata is descriptive, not an authorization token. The server must resolve permissions from authoritative records for every operation.

### Tool categories

| Tool category  | Examples                                  | Access rules                                   |
| -------------- | ----------------------------------------- | ---------------------------------------------- |
| Read-only      | Read authorized tasks, list shared events | Scope-filter every query                       |
| Proposal       | Suggest a task, draft a schedule          | Store as a proposal until accepted             |
| Mutating       | Create task, update event                 | Permission check and audit                     |
| Sensitive      | Access private medication records         | Separate explicit grant and purpose            |
| External       | Send email, create calendar event         | Integration-specific authorization and consent |
| Administrative | Transfer ownership, delete space          | Strong authorization and confirmation          |

### Agent security controls

- Bind every run to a specific agent binding and scope.
- Re-check permission at execution time, not only when the run starts.
- Pass only the minimum authorized context to the model.
- Treat retrieved messages, documents, and web content as untrusted input.
- Prevent prompt instructions from granting permissions or bypassing tool policies.
- Require user confirmation for consequential or sensitive mutations.
- Store tool name, scope, approval state, result status, and relevant audit metadata.
- Apply per-agent rate, token, and cost limits.
- Support cancellation, timeout, retry, and human escalation.
- Do not allow cross-space retrieval by default.
- Do not expose private medication records to a family or group agent without a separate, explicit, revocable permission.

## 10. Privacy, security, and data governance

Privacy should be implemented as enforceable controls, not only described in a policy document.

### Data classification

| Classification | Examples                                                  | Controls                                                               |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Public         | Public community profile or public event listing          | Publication controls, abuse protection                                 |
| Internal       | Non-sensitive operational metadata                        | Authenticated access, retention limits                                 |
| Private        | Direct messages, personal tasks, private notes            | User and conversation authorization                                    |
| Sensitive      | Medication records, health-related data, private memories | Explicit scope, strict access logging, minimization, limited retention |
| Secret         | Password hashes, API keys, refresh-token material         | Secret manager, encryption, no client exposure                         |

### Privacy rules to implement

Purpose limitation

- Collect information for a defined feature purpose.
- Do not reuse health or personal data for advertising, agent training, or unrelated personalization without a separately reviewed and valid basis.
- Make optional collection genuinely optional.

Access control

- Enforce access at the API and data-access layers.
- Define owner, administrator, member, guest, agent, and service-account capabilities.
- Ensure a role does not automatically imply access to every record in a space.
- Revoke access after membership removal, permission revocation, or account suspension.

Consent and transparency

- Record what was agreed to, by whom, for what purpose, and under which policy version.
- Provide a way to view and revoke applicable permissions.
- Distinguish consent from other legal bases where relevant.
- Make agent memory visible and manageable where feasible.

Data lifecycle

- Define retention periods for messages, attachments, medication records, agent traces, and audit logs.
- Support account export and deletion workflows.
- Define soft deletion, permanent deletion, and backup-expiration behavior separately.
- Ensure deletion propagates to search indexes, caches, derived memory, and third-party integrations where applicable.
- Maintain legal holds only when justified and documented.

Encryption

- Use TLS for data in transit.
- Use managed encryption at rest for databases and object storage.
- Protect sensitive fields with additional encryption where threat modeling supports it.
- Keep keys separate from encrypted data and rotate them under a defined procedure.
- Never log secrets, access tokens, full medication instructions, or private message bodies by default.

### Privacy and security threat model

| Threat                            | Example                                                  | Mitigation                                              |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Broken object-level authorization | User changes a task ID to access another space           | Scope checks on every resource access                   |
| Cross-space agent leakage         | Agent retrieves messages from a different space          | Binding-scoped retrieval and authorization tests        |
| Prompt injection                  | Malicious message instructs an agent to reveal records   | Treat content as untrusted; enforce tool gateway policy |
| Session theft                     | Stolen refresh token used from another device            | Secure token storage, rotation, revocation              |
| Duplicate actions                 | Retried request creates two financial entries            | Idempotency keys and unique constraints                 |
| Insider misuse                    | Admin accesses sensitive personal records without reason | Least privilege, audit, access review                   |
| Notification disclosure           | Lock-screen text reveals private medication details      | Generic notification content by default                 |
| Data export leakage               | Export URL remains accessible after sharing              | Short-lived signed URLs and ownership checks            |
| Dependency compromise             | Vulnerable library introduces malicious code             | Dependency scanning, pinning, review, SBOM              |
| Backup exposure                   | Database backup is copied to an unprotected location     | Encryption, restricted access, restore testing          |

### Regulatory and policy review

Because the product may process health-related information and operate in India or other jurisdictions, have qualified legal and privacy professionals assess applicable requirements before production launch. Review, as relevant, India’s Digital Personal Data Protection framework and rules in force at launch, applicable health-data obligations, consumer-protection requirements, children’s privacy, cross-border processing, and any additional jurisdiction-specific rules.

Do not market the medication reminder feature as a medical device, clinical decision system, or medical advice service unless the product has been specifically assessed and built for that intended use.

## 11. Background jobs, events, and notification delivery

Use durable asynchronous processing for tasks that must continue after an API request finishes.

### Reliable event flow

Push ProviderWorkerQueueOutbox PublisherPostgreSQLAPIClientPush ProviderWorkerQueueOutbox PublisherPostgreSQLAPIClient#chatgpt-mermaid-\_r_oc\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_oc\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_oc\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_oc\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_oc\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_oc\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_oc\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_oc\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_oc\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_oc\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_oc\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_oc\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_oc\_ p{margin:0;}#chatgpt-mermaid-\_r_oc\_ .actor{stroke:rgb(239, 139, 87);fill:rgb(250, 232, 222);stroke-width:1;}#chatgpt-mermaid-\_r_oc\_ rect.actor.outer-path[data-look="neo"]{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_oc\_ rect.note[data-look="neo"]{stroke:rgb(248, 212, 93);fill:rgb(243, 243, 243);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_oc\_ text.actor>tspan{fill:rgb(13, 13, 13);stroke:none;}#chatgpt-mermaid-\_r_oc\_ .actor-line{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ .innerArc{stroke-width:1.5;stroke-dasharray:none;}#chatgpt-mermaid-\_r_oc\_ .messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ .messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ [id$="-arrowhead"] path{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ .sequenceNumber{fill:#707070;}#chatgpt-mermaid-\_r_oc\_ [id$="-sequencenumber"]{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ [id$="-crosshead"] path{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_oc\_ .messageText{fill:rgb(13, 13, 13);stroke:none;}#chatgpt-mermaid-\_r_oc\_ .labelBox{stroke:rgba(0, 0, 0, 0.1);fill:rgb(252, 252, 252);filter:none;}#chatgpt-mermaid-\_r_oc\_ .labelText,#chatgpt-mermaid-\_r_oc\_ .labelText>tspan{fill:rgb(13, 13, 13);stroke:none;}#chatgpt-mermaid-\_r_oc\_ .loopText,#chatgpt-mermaid-\_r_oc\_ .loopText>tspan{fill:rgb(13, 13, 13);stroke:none;}#chatgpt-mermaid-\_r_oc\_ .sectionTitle,#chatgpt-mermaid-\_r_oc\_ .sectionTitle>tspan{fill:rgb(13, 13, 13);stroke:none;}#chatgpt-mermaid-\_r_oc\_ .loopLine{stroke-width:2px;stroke-dasharray:2,2;stroke:rgba(0, 0, 0, 0.1);fill:rgba(0, 0, 0, 0.1);}#chatgpt-mermaid-\_r_oc\_ .note{stroke:rgb(248, 212, 93);fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_oc\_ .noteText,#chatgpt-mermaid-\_r_oc\_ .noteText>tspan{fill:rgb(13, 13, 13);stroke:none;font-weight:normal;}#chatgpt-mermaid-\_r_oc\_ .activation0{fill:rgb(243, 243, 243);stroke:hsl(0, 0%, 85.2941176471%);}#chatgpt-mermaid-\_r_oc\_ .activation1{fill:rgb(243, 243, 243);stroke:hsl(0, 0%, 85.2941176471%);}#chatgpt-mermaid-\_r_oc\_ .activation2{fill:rgb(243, 243, 243);stroke:hsl(0, 0%, 85.2941176471%);}#chatgpt-mermaid-\_r_oc\_ .actorPopupMenu{position:absolute;}#chatgpt-mermaid-\_r_oc\_ .actorPopupMenuPanel{position:absolute;fill:rgb(250, 232, 222);box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);filter:drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4));}#chatgpt-mermaid-\_r_oc\_ .actor-man circle,#chatgpt-mermaid-\_r_oc\_ line{fill:rgb(250, 232, 222);stroke-width:2px;}#chatgpt-mermaid-\_r_oc\_ g rect.rect{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_oc\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_oc\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_oc\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_oc\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_oc\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_oc\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_oc\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_oc\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Create task or scheduleCommit business record + outbox eventTransaction committedSuccess responseRead unpublished outbox rowsPublish eventDeliver jobCheck state and idempotencySend notificationProvider responseRecord attempt and outcome

### Job metadata

A durable job record should include:

- Job ID and event key
- Domain and resource identifiers
- Intended recipient or destination
- Scheduled execution time
- Time zone or recurrence context where applicable
- Retry count and next retry time
- Idempotency key
- Current state
- Last error category
- Creation and completion timestamps

### Job state model

```
PENDING
   |
   v
SCHEDULED
   |
   v
PROCESSING
   |       \
   v        v
SUCCEEDED  RETRY_WAIT
              |
              v
          PROCESSING
              |
              v
         DEAD_LETTER
```

Define retry policies by job category. A temporary push-provider failure may be retried, but an expired invitation or a revoked permission should not be retried as if it were a transient infrastructure error.

### Notification requirements

- Support in-app, push, email, and optional SMS channels.
- Respect channel preferences and consent.
- Deduplicate logical notifications.
- Record provider acceptance separately from confirmed device display.
- Handle invalid tokens and token rotation.
- Avoid sensitive content in notification previews.
- Apply quiet hours and user-local time rules.
- Allow users to manage notification categories.
- Track delivery latency and failure rate.
- Make retries safe and bounded.

## 12. Server and deployment architecture

For the first production deployment, use managed infrastructure where possible. It reduces the amount of operational work required from a small engineering team.

Public internet

DNS and domain routing

CDN, WAF, TLS termination

Static asset delivery, bot and request filtering

Private application network

Web runtime

Next.js

API runtime

FastAPI

Worker runtime

Jobs and agents

Scheduler

Due-work discovery

Private managed data services

PostgreSQL with backups

Redis

Object storage

Queue or workflow engine

### Environment separation

Maintain separate environments:

| Environment | Purpose                    | Data policy                         |
| ----------- | -------------------------- | ----------------------------------- |
| Local       | Developer workflow         | Synthetic or anonymized data        |
| CI          | Automated validation       | Ephemeral test data                 |
| Development | Shared integration testing | Non-production data                 |
| Staging     | Release validation         | Synthetic or controlled test data   |
| Production  | Live users                 | Real user data with strict controls |

Do not copy production personal data into development or staging by default.

### Infrastructure controls

- Private database and cache networking.
- Managed database backups and point-in-time recovery where supported.
- Separate credentials for each environment and service.
- Health checks and graceful shutdown.
- Horizontal scaling for stateless API and worker processes.
- Explicit resource limits and autoscaling policies.
- Deployment rollback procedures.
- Database migration review and compatibility checks.
- Object-storage lifecycle rules.
- Disaster-recovery runbooks and periodic restore exercises.

### Domain and DNS plan

Use a domain layout such as:

| Domain               | Purpose                            |
| -------------------- | ---------------------------------- |
| `www.example.com`    | Public website                     |
| `app.example.com`    | Authenticated web application      |
| `api.example.com`    | Public API entry point             |
| `admin.example.com`  | Restricted admin application       |
| `assets.example.com` | Public or controlled static assets |
| `hooks.example.com`  | Verified external webhook endpoint |

These are naming examples. Select the actual domain after checking availability and security requirements. Avoid exposing internal service hostnames or management interfaces through public DNS.

## 13. External integrations, SDKs, and tools

Integrations should be isolated behind adapters so a provider can be replaced without rewriting domain logic.

| Integration        | SDK or interface                                    | Engineering requirements                                    |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------- |
| AI models          | Provider SDK behind a model adapter                 | Timeouts, cost controls, model versioning, privacy review   |
| Push notifications | Firebase Admin SDK, APNs provider                   | Token lifecycle, retries, delivery status                   |
| Email              | Transactional email provider SDK/API                | Verified sender domains, bounce handling                    |
| SMS                | Regional SMS provider                               | Consent, cost limits, delivery reports                      |
| Calendar           | Google Calendar or Microsoft Graph APIs, if enabled | OAuth scopes, token revocation, sync conflict handling      |
| Payments           | Payment provider SDK, if monetization is introduced | Webhook verification, idempotency, financial reconciliation |
| File uploads       | S3 SDK or compatible API                            | Signed uploads, MIME checks, size limits, malware scanning  |
| Search             | PostgreSQL full-text search initially               | Scope-aware search and indexing                             |
| Analytics          | Privacy-reviewed analytics SDK                      | Event minimization, consent, retention                      |
| Error tracking     | Sentry SDK or equivalent                            | Redaction and environment separation                        |
| Tracing            | OpenTelemetry SDK                                   | Trace propagation and sensitive-data filtering              |

### Integration adapter pattern

For example, notification domain logic should call an internal interface:

```
class PushProvider:    async def send(        self,        token: str,        title: str,        body: str,        data: dict[str, str],    ) -> "PushResult":        ...
```

Provider-specific implementations handle FCM or APNs details. The notification domain decides what should be sent and whether the recipient is eligible. The provider adapter handles how to deliver it.

The same pattern applies to AI models, calendar providers, email, and object storage.

### Webhook security

For every inbound webhook:

- Verify the provider signature against the raw request body.
- Check timestamp freshness where supported.
- Deduplicate by provider event ID.
- Persist the event before acknowledging it if processing is asynchronous.
- Process events idempotently.
- Reject unrecognized event types safely.
- Never trust webhook-supplied user or resource identifiers without resolving them against local records.

## 14. Monitoring, observability, and production operations

Monitoring must cover system health and product correctness. A service can return HTTP 200 responses while silently delivering reminders late or leaking data across scopes.

### Observability architecture

\#chatgpt-mermaid-\_r_po\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_po\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_po\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_po\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_po\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_po\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_po\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_po\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_po\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_po\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_po\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_po\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_po\_ p{margin:0;}#chatgpt-mermaid-\_r_po\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_po\_ .label text,#chatgpt-mermaid-\_r_po\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ .node rect,#chatgpt-mermaid-\_r_po\_ .node circle,#chatgpt-mermaid-\_r_po\_ .node ellipse,#chatgpt-mermaid-\_r_po\_ .node polygon,#chatgpt-mermaid-\_r_po\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ .rough-node .label text,#chatgpt-mermaid-\_r_po\_ .node .label text,#chatgpt-mermaid-\_r_po\_ .image-shape .label,#chatgpt-mermaid-\_r_po\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_po\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ .rough-node .label,#chatgpt-mermaid-\_r_po\_ .node .label,#chatgpt-mermaid-\_r_po\_ .image-shape .label,#chatgpt-mermaid-\_r_po\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_po\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_po\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_po\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_po\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_po\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_po\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_po\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_po\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_po\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_po\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_po\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_po\_ .icon-shape,#chatgpt-mermaid-\_r_po\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_po\_ .icon-shape p,#chatgpt-mermaid-\_r_po\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_po\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_po\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_po\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_po\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_po\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_po\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_po\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_po\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_po\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_po\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_po\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_po\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_po\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_po\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_po\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_po\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_po\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_po\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ .node rect,#chatgpt-mermaid-\_r_po\_ .node circle,#chatgpt-mermaid-\_r_po\_ .node ellipse,#chatgpt-mermaid-\_r_po\_ .node polygon,#chatgpt-mermaid-\_r_po\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_po\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_po\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_po\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_po\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_po\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}APIWebAndroidWorkersDatabaseOpenTelemetryDatabase metricsTrace backendMetrics backendError trackingDashboards and alerts

### Operational metrics

| Metric                    | What it measures                                | Alert condition example                |
| ------------------------- | ----------------------------------------------- | -------------------------------------- |
| API availability          | Successful API requests                         | Sustained error-rate breach            |
| API latency               | Request response time                           | p95 above agreed threshold             |
| Database connections      | Connection pool use                             | Sustained saturation                   |
| Database query latency    | Slow or blocked queries                         | Critical query regression              |
| Queue depth               | Pending background work                         | Queue age exceeds target               |
| Worker failures           | Failed jobs                                     | Failure rate above threshold           |
| Reminder punctuality      | Difference between scheduled and processed time | Delivery processing lag exceeds target |
| Push provider errors      | Provider rejection and timeout                  | Provider failure spike                 |
| Agent tool denials        | Authorization denials and policy blocks         | Unusual access pattern                 |
| Agent cost                | Token and provider cost                         | Budget threshold exceeded              |
| Login failures            | Authentication failure patterns                 | Brute-force indicators                 |
| Cross-scope test failures | Isolation regression in CI                      | Any failure blocks release             |
| Backup health             | Backup success and restore evidence             | Backup or restore-check failure        |

Set alert thresholds from observed baseline behavior, user commitments, and operational capacity. Avoid inventing service-level objectives before collecting production-like measurements.

### Logging rules

Use structured logs with fields such as:

```
{
  "timestamp": "2026-10-03T00:00:00Z",
  "level": "INFO",
  "service": "api",
  "request_id": "req-uuid",
  "trace_id": "trace-id",
  "event": "task_created",
  "space_id": "space-uuid",
  "result": "success"
}
```

Use pseudonymous identifiers where feasible. Do not include message bodies, medication instructions, credentials, full user profiles, or raw agent context in routine logs.

### Incident response

Prepare documented procedures for:

- Suspected cross-space data exposure
- Credential or signing-key compromise
- Database outage or corruption
- Reminder processing delays
- AI provider outage or unsafe agent behavior
- Push or email provider failure
- Unauthorized administrative access
- Data deletion or export failure

Every incident procedure should specify an owner, severity classification, containment actions, communication path, evidence preservation requirements, and post-incident review.

## 15. API, data, and event versioning

Versioning must cover more than URLs. Background jobs, stored agent configurations, mobile clients, and event payloads may outlive the code that created them.

| Contract            | Recommended approach                                       |
| ------------------- | ---------------------------------------------------------- |
| REST API            | Explicit major version in path, such as `/v1`              |
| OpenAPI             | Versioned contract artifact and compatibility checks       |
| Database            | Forward-compatible migrations with rollback planning       |
| Events              | Versioned event type or schema version                     |
| Agent configuration | Immutable configuration version per run                    |
| Mobile app          | Backward-compatible API support for older released clients |
| Webhooks            | Versioned event schemas and signature policy               |
| Memory records      | Schema version for migration and interpretation            |

For database migrations, use an expand-and-contract approach:

1. Add a compatible schema change.
2. Deploy code that can work with old and new structures.
3. Backfill data in controlled batches.
4. Switch reads and writes.
5. Remove obsolete fields only after compatibility is established.

Do not combine destructive schema changes with a release that depends on the new schema unless a tested recovery plan exists.

## 16. Testing strategy and release gates

Testing should validate both individual features and the boundaries between them.

| Test layer     | Examples                                                     | Release purpose              |
| -------------- | ------------------------------------------------------------ | ---------------------------- |
| Unit           | Permission rules, recurrence calculations, state transitions | Verify isolated logic        |
| Integration    | API plus PostgreSQL, queue and worker interactions           | Verify component boundaries  |
| Contract       | OpenAPI and generated client compatibility                   | Prevent client/server drift  |
| Authorization  | Cross-user and cross-space resource access                   | Prevent data leakage         |
| Agent security | Tool scope, prompt injection, approval behavior              | Limit agent authority        |
| Android UI     | Login, offline state, reminders, navigation                  | Verify native workflows      |
| Web E2E        | Invite member, create task, send message                     | Verify user journeys         |
| Reliability    | Retry, duplicate events, worker restart                      | Verify durable processing    |
| Performance    | Concurrent users, message history, search                    | Validate capacity            |
| Recovery       | Database restore and job replay                              | Verify disaster recovery     |
| Privacy        | Export, revoke, delete, retention                            | Verify lifecycle obligations |

### Mandatory cross-space test cases

- A member of Space A cannot read Space B’s tasks by changing a resource ID.
- A family agent cannot retrieve an individual user’s private medication plan by searching a shared space.
- Removing an agent binding prevents future tool calls under that binding.
- A revoked grant blocks subsequent access, including queued actions that have not yet executed.
- A conversation participant cannot access unrelated conversations in the same space.
- A background job cannot bypass user or space scope because it runs with elevated service credentials.
- A stale Android client cannot overwrite newer data without a conflict response.
- Duplicate API requests do not create duplicate financial entries, task actions, or medication responses.

### Release gates

1. Gate 1 — Foundation

   Repository standards, environment setup, migrations, CI, secrets, and baseline monitoring work.
2. Gate 2 — Identity and spaces

   Authentication, membership, invitation lifecycle, ownership transfer, and authorization tests pass.
3. Gate 3 — Core collaboration

   Messaging, tasks, calendar, offline handling, and notification reliability meet agreed acceptance criteria.
4. Gate 4 — Sensitive data and agents

   Private health data boundaries, consent, agent scope enforcement, approval workflows, and audit evidence pass review.
5. Gate 5 — Production readiness

   Backup restoration, monitoring, security review, incident runbooks, and load testing are complete.
6. Gate 6 — Controlled launch

   Release to a limited user group, monitor error and latency trends, validate support workflows, and expand only after review.

## 17. Additional systems you should include

These are frequently overlooked in large application architecture plans. They should be tracked as explicit workstreams rather than left for the end.

| Missing or easily overlooked system | Why it matters                                                                     | Required deliverable                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Feature flags                       | Control gradual rollout and emergency shutdown                                     | Flag service, ownership, expiry policy                        |
| Abuse prevention                    | Prevent spam, harassment, fraudulent invitations, and automated misuse             | Reporting, rate limits, moderation workflows                  |
| Search permissions                  | Search can expose records even when direct APIs are protected                      | Scope-aware indexing and authorization                        |
| User onboarding                     | New users need a clear path through identity, spaces, invitations, and permissions | Onboarding journeys and recovery states                       |
| Account recovery                    | Lost devices and credentials can lock users out                                    | Recovery flow and abuse protections                           |
| Ownership succession                | Spaces can become inaccessible when an owner leaves                                | Transfer and recovery workflow                                |
| Data portability                    | Users may need copies of their records                                             | Export pipeline and secure downloads                          |
| Data deletion propagation           | Deleting a record in one system may leave copies elsewhere                         | Deletion orchestration and verification                       |
| Localization                        | Language and regional time handling affect reminders and communication             | Translation infrastructure and locale testing                 |
| Accessibility                       | Users need accessible navigation and controls                                      | Accessibility standards and automated/manual audits           |
| Billing and entitlements            | Required if paid tiers or usage limits are introduced                              | Subscription state, entitlements, billing integration         |
| Content moderation                  | Public communities and shared content require safety processes                     | Reports, review queues, enforcement actions                   |
| Admin governance                    | Support and operations staff need controlled tools                                 | Least-privilege admin roles and audited actions               |
| Legal and policy workflows          | Privacy requests, disputes, and retention exceptions need handling                 | Documented procedures and case tracking                       |
| Cost controls                       | AI, storage, messaging, and external APIs can create unexpected costs              | Budgets, quotas, alerts, cost attribution                     |
| Disaster recovery                   | Backups alone do not prove recoverability                                          | Recovery objectives, restore tests, runbooks                  |
| Software supply-chain security      | Dependency and build compromise can affect every client                            | SBOM, dependency scanning, signed artifacts                   |
| Release management                  | Web and mobile clients deploy on different schedules                               | Compatibility matrix and staged rollout plan                  |
| Support tooling                     | User problems need safe diagnosis                                                  | Redacted diagnostics and support access controls              |
| Product analytics governance        | Usage measurement can become excessive tracking                                    | Event catalog, purpose, retention, consent rules              |
| Search and AI evaluation            | Agent quality can regress without obvious infrastructure errors                    | Evaluation datasets, quality metrics, safety regression tests |

## 18. Suggested engineering ownership

Assign one accountable owner per domain. A developer can own more than one area in a small team, but security and architecture decisions should receive independent review.

| Role                | Primary responsibility                          | Deliverables                                          |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Principal architect | Cross-domain design and technical decisions     | Architecture decisions, interfaces, risk register     |
| Backend lead        | API, domain services, transactions              | Backend modules, contracts, integration tests         |
| Database engineer   | Data model, migrations, performance             | ERD, constraints, indexes, recovery tests             |
| Web lead            | Website architecture and workflows              | Web application, accessibility, E2E tests             |
| Android lead        | Native architecture and synchronization         | Android app, offline behavior, device tests           |
| AI/agent engineer   | Agent orchestration and tool safety             | Agent runtime, evaluation suite, scope controls       |
| Security engineer   | Threat modeling and security validation         | Threat model, authorization tests, security reviews   |
| DevOps/SRE          | Infrastructure and operations                   | CI/CD, observability, backups, runbooks               |
| QA engineer         | Product and integration quality                 | Test plans, regression suite, release evidence        |
| Product designer    | Information architecture and interaction design | User journeys, wireframes, interaction specifications |
| Product owner       | Scope and acceptance criteria                   | Prioritized backlog, release requirements             |

For a smaller team, combine roles thoughtfully. Do not combine the authority to approve sensitive access changes with the sole responsibility for validating those changes.

## 19. Implementation sequence

The system has dependencies. Building all modules in parallel without shared contracts will produce integration failures.

### Dependency-oriented implementation plan

\#chatgpt-mermaid-\_r_qk\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_qk\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qk\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qk\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_qk\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_qk\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_qk\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_qk\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_qk\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_qk\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_qk\_ p{margin:0;}#chatgpt-mermaid-\_r_qk\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_qk\_ .label text,#chatgpt-mermaid-\_r_qk\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .node rect,#chatgpt-mermaid-\_r_qk\_ .node circle,#chatgpt-mermaid-\_r_qk\_ .node ellipse,#chatgpt-mermaid-\_r_qk\_ .node polygon,#chatgpt-mermaid-\_r_qk\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .rough-node .label text,#chatgpt-mermaid-\_r_qk\_ .node .label text,#chatgpt-mermaid-\_r_qk\_ .image-shape .label,#chatgpt-mermaid-\_r_qk\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_qk\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .rough-node .label,#chatgpt-mermaid-\_r_qk\_ .node .label,#chatgpt-mermaid-\_r_qk\_ .image-shape .label,#chatgpt-mermaid-\_r_qk\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_qk\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_qk\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_qk\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_qk\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_qk\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_qk\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_qk\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_qk\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_qk\_ .icon-shape,#chatgpt-mermaid-\_r_qk\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_qk\_ .icon-shape p,#chatgpt-mermaid-\_r_qk\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_qk\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_qk\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_qk\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_qk\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_qk\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_qk\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_qk\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_qk\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_qk\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .node rect,#chatgpt-mermaid-\_r_qk\_ .node circle,#chatgpt-mermaid-\_r_qk\_ .node ellipse,#chatgpt-mermaid-\_r_qk\_ .node polygon,#chatgpt-mermaid-\_r_qk\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_qk\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_qk\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_qk\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Repository, CI, environments,standardsIdentity and sessionmanagementAuthorization and space modelCore database and auditfoundationWeb and Android applicationshellsMessaging, tasks, calendarDurable jobs and notificationsPrivate medication workflowsScoped agent runtime andconsentEvents, budgets, integrationsSecurity, reliability, recoveryvalidationControlled production launch

A practical execution approach:

- Foundation: establish repository conventions, CI, environments, database migrations, API contracts, and observability.
- Identity and spaces: complete authentication, membership, invitations, permissions, and audit logging.
- Core collaboration: build messaging, tasks, calendar, and web/Android integration.
- Durability: implement outbox processing, scheduling, notification delivery, and retry semantics.
- Sensitive workflows: implement medication tracking, consent, private memory, and scoped agents.
- Expansion: add events, budgets, and optional third-party integrations.
- Hardening: complete security, privacy, load, backup, recovery, and operational reviews.
- Launch: deploy gradually with explicit rollback criteria and support readiness.

The exact timeline depends on the current repository, team size, existing code quality, and selected infrastructure.

## 20. Architecture readiness checklist

## Readiness tracker

0/20 complete

Architecture

Domain ownership and module boundaries documented

API and event contracts versioned

Web, Android, backend, and worker boundaries defined

Environment and deployment design reviewed

Database

ERD and migrations reviewed

Foreign keys, unique constraints, and indexes implemented

Space isolation tests pass

Backup and restore process tested

API and clients

OpenAPI specification published

Generated clients or contract checks integrated

Error and idempotency conventions implemented

Web and Android integration tests pass

Privacy and security

Threat model approved

Sensitive data classification and retention defined

Consent, export, and deletion flows tested

Agent and service-account permissions reviewed

Operations

Metrics, traces, logs, and alerts configured

Incident and rollback runbooks available

Queue retries and dead-letter handling tested

Production readiness and cost controls reviewed

This tracker is interactive in this conversation and is not a repository audit.

&#x20;Copy checklist

## Final architectural recommendations

For the initial production design, keep the system focused:

1. Use a modular FastAPI backend with PostgreSQL as the source of truth.
2. Use a shared, versioned API contract for Next.js and Kotlin clients.
3. Make space membership, resource scope, and permission checks foundational.
4. Treat medication records and private memory as sensitive, user-controlled data.
5. Keep agents behind a server-side tool gateway with per-binding permissions.
6. Use durable jobs and idempotency for reminders, notifications, and agent actions.
7. Prefer managed infrastructure until scale or cost requirements justify operating more systems directly.
8. Establish monitoring, recovery, privacy, and security controls before enabling broad production access.

The next engineering artifact should be a repository-specific implementation audit: map the current code, database tables, APIs, packages, and deployment files against this blueprint. That audit should classify every feature as implemented and verified, partially implemented, not started, blocked, or not applicable. It will turn this target architecture into a concrete, evidence-backed backlog for the development agents.


Yes. The gap is not simply a few missing packages or database tables. What you need is a complete, implementation-level engineering master specification that connects product requirements, system architecture, source code, infrastructure, performance engineering, security, testing, and deployment into one executable development plan.

There are several important areas that need to be made explicit beyond the previous chapters:

- Repository intelligence and automated engineering: agents must inspect the actual codebase, run the application, inspect browser behavior, analyze API and network failures, identify unfinished features, and implement verified fixes.
- Performance engineering: profiling, query plans, indexing, caching, connection pooling, pagination, real-time delivery, load testing, and measurable latency targets.
- Communication architecture: REST, WebSockets, gRPC, event-driven communication, and end-to-end encryption, with clear rules about where each is appropriate.
- Production code standards: concrete implementation contracts, real database migrations, complete error handling, no placeholder implementations, and integration with actual services.
- Engineering governance: architecture decision records, domain ownership, interface contracts, dependency management, security review, release gates, and evidence-based completion.
- Scalability and reliability: capacity planning for thousands of concurrent users, horizontal scaling, backpressure, retry handling, disaster recovery, and operational cost limits.
- AI engineering: agent lifecycle, model routing, tool permissions, retrieval boundaries, workflow state, evaluations, observability, and safe execution.
- Product and operational completeness: onboarding, account recovery, abuse prevention, moderation, analytics governance, support tooling, localization, accessibility, and lifecycle management.

One distinction is critical: a blueprint can specify production-ready implementation requirements, but production-ready code cannot be guaranteed without examining your current repository, integrations, infrastructure, and test results. The specification should require real implementation and verification rather than claiming that unimplemented pieces are complete.

## 1. Important technology decisions to settle

Some of the technologies you listed solve different problems. They should not all be added indiscriminately.

| Technology     | Recommended responsibility                                                    | Decision                                                     |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| REST           | Public web and Android business APIs                                          | Primary client API                                           |
| WebSockets     | Live chat, presence, typing indicators, live updates                          | Use for real-time features                                   |
| gRPC           | Internal service-to-service calls where typed RPC and streaming provide value | Introduce selectively                                        |
| GraphQL        | Flexible client-driven querying                                               | Optional; not needed alongside REST without a clear use case |
| PostgreSQL     | Authoritative relational data                                                 | Core database                                                |
| Redis          | Caching, rate limiting, ephemeral coordination                                | Supporting data store                                        |
| Outbox pattern | Reliable publication of committed domain events                               | Required for important asynchronous workflows                |
| OpenAPI        | REST contracts                                                                | Required                                                     |
| Protobuf       | gRPC contracts                                                                | Required if gRPC is adopted                                  |
| Playwright     | Browser and end-to-end testing                                                | Required for critical web journeys                           |
| Playwright MCP | Agent-assisted browser inspection and troubleshooting                         | Developer tool                                               |
| WebMCP         | Structured tools exposed by websites to agents                                | Experimental, optional                                       |
| LangChain      | Model integrations and agent-building abstractions                            | Use where it reduces integration work                        |
| LangGraph      | Stateful, long-running agent workflows                                        | Suitable for complex agent orchestration                     |
| Groq           | Model inference provider                                                      | Provider adapter, not an orchestration framework             |
| Model gateway  | Routing, provider failover, policy, cost control                              | Recommended internal abstraction                             |
| API gateway    | Edge routing, rate limits, request controls                                   | Use at the edge                                              |
| Tool gateway   | Authorization and validation for agent actions                                | Required for agent security                                  |

LangGraph is designed for stateful and long-running agent workflows, while LangChain provides higher-level building blocks and integrations.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.langchain.com\&sz=32)

LangChain

+1

&#x20;Groq provides a model API, so it belongs behind a model-provider interface rather than being treated as the agent architecture itself.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://console.groq.com\&sz=32)

GroqDocs



### Communication topology

\#chatgpt-mermaid-\_r_117\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_117\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_117\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_117\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_117\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_117\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_117\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_117\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_117\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_117\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_117\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_117\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_117\_ p{margin:0;}#chatgpt-mermaid-\_r_117\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_117\_ .label text,#chatgpt-mermaid-\_r_117\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ .node rect,#chatgpt-mermaid-\_r_117\_ .node circle,#chatgpt-mermaid-\_r_117\_ .node ellipse,#chatgpt-mermaid-\_r_117\_ .node polygon,#chatgpt-mermaid-\_r_117\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ .rough-node .label text,#chatgpt-mermaid-\_r_117\_ .node .label text,#chatgpt-mermaid-\_r_117\_ .image-shape .label,#chatgpt-mermaid-\_r_117\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_117\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ .rough-node .label,#chatgpt-mermaid-\_r_117\_ .node .label,#chatgpt-mermaid-\_r_117\_ .image-shape .label,#chatgpt-mermaid-\_r_117\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_117\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_117\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_117\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_117\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_117\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_117\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_117\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_117\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_117\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_117\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_117\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_117\_ .icon-shape,#chatgpt-mermaid-\_r_117\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_117\_ .icon-shape p,#chatgpt-mermaid-\_r_117\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_117\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_117\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_117\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_117\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_117\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_117\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_117\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_117\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_117\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_117\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_117\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_117\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_117\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_117\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_117\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_117\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_117\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_117\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ .node rect,#chatgpt-mermaid-\_r_117\_ .node circle,#chatgpt-mermaid-\_r_117\_ .node ellipse,#chatgpt-mermaid-\_r_117\_ .node polygon,#chatgpt-mermaid-\_r_117\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_117\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_117\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_117\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_117\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_117\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Next.js webAndroidAdmin consoleCDN / WAF / API gatewayREST APIWebSocket gatewayInternal gRPC interfacesDomain modulesPostgreSQLOutbox and event dispatcherQueue / workflow engineWorkers and agent runtimeModel gatewayPush and external providersselective internal RPC

Use REST for ordinary client operations, WebSockets for live sessions, and gRPC only for internal boundaries where independent services or streaming justify the added complexity. A modular monolith does not need internal gRPC calls between every module.

## 2. End-to-end encryption requires a separate design

End-to-end encryption is not just an encryption flag on the message table. It changes the system's data and access model.

Critical architecture decision

If messages are end-to-end encrypted, the backend should not possess the keys needed to read message contents. This affects server-side search, moderation, agent context retrieval, multi-device synchronization, backups, account recovery, and reporting.

A proper E2EE design must specify:

- Identity and device key generation and verification.
- Key distribution and membership changes.
- Forward secrecy and post-compromise security requirements.
- Group key management and device addition/removal.
- Encrypted attachment handling.
- Encrypted local storage and secure key backup, if supported.
- Multi-device synchronization and account recovery.
- Message metadata that remains visible to the server.
- Abuse reporting and user-authorized message disclosure.
- How agents can interact with encrypted conversations, if at all.

Use a reviewed protocol and established cryptographic libraries. Do not invent your own encryption protocol. Do not claim the entire chat system is E2EE if only data at rest or transport is encrypted.

A practical design decision is to separate server-readable collaborative spaces from E2EE private conversations, or explicitly design E2EE group spaces from the start. If agents need access to message content, that access must be intentionally designed around the encryption model rather than silently weakening encryption.

## 3. Performance and scalability engineering

"Thousands of users at once" is a requirement to validate, not a number that automatically determines the infrastructure. Define the workload first.

Track at least:

- Concurrent authenticated users.
- Active WebSocket connections.
- Requests per second by endpoint.
- Message send and delivery rates.
- Database reads and writes per second.
- Queue throughput and oldest-job age.
- Reminder scheduling volume and punctuality.
- Agent runs, tokens, latency, and cost.
- Upload size and bandwidth.
- Geographic distribution and network quality.

### Performance workstream

| Area            | Engineering work                                                              | Evidence required                       |
| --------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| Website loading | Route splitting, bundle analysis, image optimization, caching                 | Real-user performance measurements      |
| API latency     | Endpoint profiling, async I/O, payload reduction                              | p50, p95, p99 by route                  |
| Database        | Query plans, composite indexes, N+1 detection, pool tuning                    | Explain plans and load-test results     |
| Chat            | Connection management, message batching, pagination, delivery acknowledgments | Concurrent connection and message tests |
| Search          | Scope-aware indexes, cursor pagination, query limits                          | Search latency and authorization tests  |
| Caching         | Cache-aside strategy, TTL, invalidation, stampede protection                  | Hit ratio and stale-data tests          |
| Workers         | Queue partitioning, bounded concurrency, backpressure                         | Queue age and throughput under load     |
| Android         | Startup profiling, lazy loading, local cache, paging                          | Startup and scroll-performance results  |
| Agent execution | Model selection, context minimization, concurrency limits                     | Latency, quality, and cost evaluation   |
| Infrastructure  | Autoscaling, connection limits, resource sizing                               | Load and failure tests                  |

Do not start by adding more servers to fix slow queries. First measure where time is spent: client rendering, DNS/TLS, network, API processing, database waits, external provider latency, or queue delay.

Set measurable service targets after baseline testing. For example, define separate latency objectives for ordinary reads, writes, chat message acknowledgment, and reminder processing instead of using one global API-latency target.

## 4. Browser intelligence and automated engineering agents

Your development agents should have a structured way to inspect the application instead of relying on code reading alone.

The Playwright MCP tooling supports browser interaction, console inspection, network request inspection, and tracing. Traces can capture DOM snapshots, screenshots, network activity, and console logs.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://playwright.dev\&sz=32)

Playwright

+2



A development agent should follow this loop:

\#chatgpt-mermaid-\_r_11o\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_11o\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_11o\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_11o\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_11o\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_11o\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_11o\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_11o\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_11o\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_11o\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_11o\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_11o\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_11o\_ p{margin:0;}#chatgpt-mermaid-\_r_11o\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_11o\_ .label text,#chatgpt-mermaid-\_r_11o\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ .node rect,#chatgpt-mermaid-\_r_11o\_ .node circle,#chatgpt-mermaid-\_r_11o\_ .node ellipse,#chatgpt-mermaid-\_r_11o\_ .node polygon,#chatgpt-mermaid-\_r_11o\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ .rough-node .label text,#chatgpt-mermaid-\_r_11o\_ .node .label text,#chatgpt-mermaid-\_r_11o\_ .image-shape .label,#chatgpt-mermaid-\_r_11o\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_11o\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ .rough-node .label,#chatgpt-mermaid-\_r_11o\_ .node .label,#chatgpt-mermaid-\_r_11o\_ .image-shape .label,#chatgpt-mermaid-\_r_11o\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_11o\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_11o\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_11o\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_11o\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_11o\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_11o\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_11o\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_11o\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_11o\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_11o\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_11o\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_11o\_ .icon-shape,#chatgpt-mermaid-\_r_11o\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_11o\_ .icon-shape p,#chatgpt-mermaid-\_r_11o\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_11o\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_11o\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_11o\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_11o\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_11o\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_11o\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_11o\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_11o\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_11o\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_11o\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_11o\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_11o\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_11o\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_11o\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_11o\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_11o\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ .node rect,#chatgpt-mermaid-\_r_11o\_ .node circle,#chatgpt-mermaid-\_r_11o\_ .node ellipse,#chatgpt-mermaid-\_r_11o\_ .node polygon,#chatgpt-mermaid-\_r_11o\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_11o\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_11o\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_11o\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_11o\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_11o\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Inspect repository andinstructionsBuild and start real applicationOpen application usingPlaywrightInspect UI, console, requests,responses, timingsReproduce a failureTrace failure to frontend, API,DB, worker, or providerImplement a scoped fixRun unit, integration, contract,and E2E testsReview diff, security, andperformanceCommit or create reviewablechangeFailureIssues found

Use WebMCP as an optional agent interface for web applications that intentionally expose structured tools. It is experimental in the documented Playwright integration, and tools exposed by a page must be treated as untrusted input. It should not become a dependency for ordinary application functionality or core test execution.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://playwright.dev\&sz=32)

Playwright

+1



For browser automation, use isolated test accounts and non-production environments. Restrict access to browser storage, credentials, and unsafe code execution. Browser automation agents should not have unrestricted access to production user sessions.

## 5. Production implementation rules

These rules should be mandatory for every development agent and human contributor.

- No placeholder endpoints, fake business logic, `TODO` implementations presented as complete, or success responses that do not perform the operation.
- No hardcoded API keys, database credentials, signing keys, or production secrets.
- No client-side authorization as the only security control.
- No unbounded database queries, unbounded agent loops, or unlimited external API retries.
- No silent exception swallowing or generic success states after failures.
- No destructive database migrations without an approved migration and recovery plan.
- No direct agent access to database credentials.
- No cross-space access based on guessed IDs or model-generated assumptions.
- No unreviewed cryptographic implementations.
- No feature marked complete without tests and evidence.

There is an important distinction between fake production behavior and test fixtures. Automated tests need controlled test data to verify known conditions. That data must be isolated from real users, clearly identified, and never used as a substitute for implementing real production behavior.

For every feature, require these deliverables:

1. Requirements and user journey.
2. Domain owner and dependency map.
3. Data model and migration.
4. API or event contract.
5. Authorization and privacy rules.
6. Frontend and Android integration, if applicable.
7. Error, loading, empty, offline, and conflict states.
8. Unit, integration, contract, and end-to-end tests.
9. Logging, metrics, and alerting.
10. Deployment, rollback, and operational documentation.
11. Security and performance review where relevant.
12. Evidence from actual execution.

## 6. Master instruction for GitHub Copilot and engineering agents

The following is a reusable top-level instruction for your project. It directs agents to inspect the real repository first, identify blockers, coordinate specialist roles, and implement work in dependency order.

# Community Agent Platform — Master Engineering Execution Directive

## Mission

Act as a coordinated team of senior software engineers, architects, security engineers, database engineers, frontend and Android engineers, AI engineers, DevOps/SRE engineers, QA engineers, and product designers.

Your mission is to inspect, complete, validate, and prepare the existing Community Agent Platform for production.

Do not assume the repository matches any proposed architecture. Inspect the actual source code, project instructions, current database, migrations, API contracts, deployment configuration, tests, and existing features before making decisions.

Do not claim implementation, testing, security, or production readiness without evidence.

## 1. Repository discovery and initial audit

Inspect:

- Repository structure, packages, modules, and build configuration.
- Existing backend routes, services, models, schemas, and dependencies.
- Database tables, relationships, constraints, indexes, migrations, and query patterns.
- Website pages, components, state management, API integrations, and loading behavior.
- Android modules, SDKs, networking, local persistence, background work, and synchronization.
- Messaging implementation, real-time connections, delivery semantics, and encryption status.
- Agent frameworks, model integrations, tool access, workflow state, and memory boundaries.
- Worker processes, queues, schedulers, outbox implementation, and retry handling.
- Authentication, sessions, API keys, permissions, CORS, rate limits, and secrets.
- CI/CD, environments, containers, deployment, infrastructure, and operational tooling.
- Tests, test coverage, failing workflows, known issues, and existing technical debt.

Create an evidence-based feature inventory with these statuses:

- Implemented and verified
- Implemented but not verified
- Partially implemented
- Not started
- Blocked
- Not applicable

For each incomplete or blocked item, document the cause, affected files or services, dependencies, risks, and next actions.

Do not overwrite working code merely to match a proposed architecture. Record architectural differences and explain why a change is necessary.

## 2. Architecture and technical governance

Maintain:

- System context and deployment diagrams.
- Domain architecture and ownership boundaries.
- Entity relationship diagrams.
- API and event contracts.
- Security and data-flow diagrams.
- Architecture decision records.
- Dependency and integration maps.
- Technical risk register.
- Performance and capacity assumptions.
- Release gates and operational readiness criteria.

Use a modular architecture with explicit domain interfaces.

Do not create unnecessary microservices. Introduce service boundaries only when they solve a measurable scaling, isolation, deployment, or organizational problem.

## 3. Required technical domains

Audit and implement the following domains where required by the product:

- Identity, sessions, login, recovery, and account lifecycle.
- Authorization, roles, capabilities, permissions, and delegated access.
- Spaces, memberships, invitations, ownership transfer, and lifecycle.
- Messaging, conversations, delivery state, attachments, and privacy.
- Tasks, calendar, recurrence, scheduling, and synchronization.
- Medication plans, schedules, occurrences, user-reported actions, and privacy.
- Events, festivals, budgets, and shared planning.
- Agents, bindings, workflows, tool gateway, approvals, and evaluations.
- Consent, memory, retention, export, and deletion.
- Notifications, delivery preferences, providers, retries, and audit.
- Search, uploads, integrations, moderation, support, and administration.
- Analytics, feature flags, billing if applicable, and cost controls.

For each domain, define its owner, authoritative tables, business invariants, API contracts, events, authorization policy, test strategy, monitoring, and operational procedures.

## 4. Technology and package governance

Use the existing repository's working technology where it is appropriate. Evaluate changes through documented architecture decisions.

The reference stack is:

- Website: Next.js, React, TypeScript.
- Android: Kotlin, Jetpack Compose, AndroidX.
- Backend: Python, FastAPI, Pydantic, SQLAlchemy.
- Database: PostgreSQL and Alembic.
- Cache: Redis.
- APIs: REST with OpenAPI.
- Real-time: WebSockets.
- Internal RPC: gRPC where justified.
- Background processing: durable queue or workflow engine, transactional outbox.
- Agent workflows: LangGraph and LangChain where appropriate.
- Model providers: replaceable provider adapters, including Groq or other selected providers.
- Browser testing: Playwright and Playwright MCP.
- Observability: OpenTelemetry, metrics, traces, structured logs, and error tracking.
- Infrastructure: containers, infrastructure as code, CI/CD, managed services where appropriate.

Pin dependencies, use supported versions, scan for vulnerabilities, document upgrades, and remove unused dependencies.

Do not add packages merely because they are popular. Record the problem each dependency solves, its security implications, maintenance status, and operational cost.

## 5. Database and metadata requirements

For every table and relationship, review:

- Primary and foreign keys.
- Unique constraints.
- Check constraints and valid state transitions.
- Required versus optional fields.
- String length, normalization, and collation rules.
- Timestamp and time-zone semantics.
- Indexes based on real query patterns.
- Deletion and retention behavior.
- Concurrency and versioning.
- Transaction boundaries.
- Migration compatibility and rollback strategy.
- Query performance and connection-pool behavior.

Use PostgreSQL as the authoritative source of transactional business data.

Use metadata consistently without adding unnecessary fields to every table.

Use `EXPLAIN` and representative load tests to verify important query paths. Detect N+1 queries, missing indexes, unbounded result sets, lock contention, and excessive database connections.

All migrations must be reviewed, tested against representative existing data, and compatible with the deployment sequence.

## 6. API and integration requirements

Define consistent conventions for:

- REST endpoint naming and versioning.
- OpenAPI contracts.
- Request and response schemas.
- Authentication and authorization.
- Validation and error codes.
- Pagination and sorting.
- Filtering and field selection.
- Idempotency keys.
- Optimistic concurrency.
- Rate limits and quotas.
- CORS and browser credential rules.
- WebSocket authentication and reconnection.
- gRPC service definitions, where used.
- Webhook verification and deduplication.
- API key issuance, hashing, rotation, scopes, and revocation.
- Client generation and contract compatibility.

Never expose private API keys or privileged credentials in browser or Android bundles.

Use short-lived user credentials where appropriate. Keep service credentials server-side and apply least privilege.

Generate and validate typed clients from the actual API contract. Do not maintain independently drifting client schemas.

## 7. Website and Android requirements

For the website:

- Inspect route architecture and loading behavior.
- Reduce unnecessary client JavaScript and duplicate requests.
- Apply pagination, lazy loading, and caching appropriately.
- Implement accessible components and keyboard navigation.
- Provide clear loading, empty, error, offline, and conflict states.
- Test critical user journeys using Playwright.
- Inspect browser console errors, network requests, failed responses, and performance traces.

For Android:

- Use feature-oriented modules and clear repository boundaries.
- Use lifecycle-aware state and structured concurrency.
- Implement secure token and key handling.
- Use local persistence only where justified.
- Define offline action queues, idempotency, and conflict handling.
- Use WorkManager for suitable deferrable work, not as a guarantee of exact-time delivery.
- Implement notification permission and device-token lifecycle handling.
- Test on supported Android versions and realistic network conditions.

## 8. Messaging and encryption

Inspect the current chat implementation before redesigning it.

Measure:

- Connection setup and reconnection.
- Message acknowledgment and delivery.
- History pagination.
- Database write latency.
- WebSocket concurrency.
- Payload size and rendering cost.
- Attachment upload and download.
- Offline message behavior.
- Duplicate and out-of-order event handling.

Design end-to-end encryption as a separate, reviewed security architecture. Use established protocols and cryptographic libraries.

Document key lifecycle, device identity, group membership changes, recovery, backups, attachment encryption, metadata exposure, and how agent access interacts with encrypted content.

Do not describe transport encryption or database encryption as end-to-end encryption.

## 9. Agent runtime and security

Agents must operate through a controlled tool gateway.

For every agent:

- Bind execution to a specific agent configuration and scope.
- Resolve permissions server-side.
- Retrieve only authorized context.
- Re-check permissions before consequential operations.
- Enforce tool schemas and resource boundaries.
- Separate read, proposal, and mutation tools.
- Require approvals for sensitive actions.
- Record runs, tool calls, denials, failures, and approval outcomes.
- Set timeouts, concurrency limits, token limits, and cost budgets.
- Support cancellation and safe retry behavior.
- Evaluate output quality and security regressions.

Treat user messages, documents, web content, browser tools, and model output as untrusted.

Never allow model-generated instructions to grant permissions, bypass access controls, or directly execute arbitrary production database operations.

## 10. Performance and scalability

Establish a workload model for thousands of concurrent users.

Measure concurrency, request rates, active WebSocket connections, database activity, queue throughput, uploads, reminders, and agent execution.

Profile before optimizing.

Investigate:

- Slow route rendering and excessive client bundles.
- Repeated and sequential API calls.
- Unnecessary data fetching.
- Slow SQL queries and missing indexes.
- Connection-pool saturation.
- Cache invalidation and stale data.
- WebSocket fanout and reconnect storms.
- Worker starvation and queue backlogs.
- Model-provider latency and cost.
- Excessive logging and telemetry overhead.

Use load tests and failure tests to verify the chosen capacity. Document measured limits and scaling behavior. Do not claim a specific concurrency capacity without test evidence.

## 11. Privacy, security, and governance

Maintain a data classification and processing inventory.

For sensitive data, document:

- Purpose and legal basis.
- Data owner and authorized readers.
- Storage and transmission protection.
- Retention and deletion policy.
- Export behavior.
- Third-party processing.
- Logging and analytics restrictions.
- Agent and service-account access.
- Incident response requirements.

Implement access-control tests, threat modeling, dependency scanning, secret scanning, audit logging, secure session management, and privacy lifecycle workflows.

Review applicable legal and regulatory obligations with qualified professionals before production launch.

## 12. Workers, events, and reliability

For durable workflows, implement:

- Transactional outbox where appropriate.
- Versioned event schemas.
- Idempotent consumers.
- Bounded retries and backoff.
- Dead-letter handling.
- Job state transitions.
- Cancellation and timeout behavior.
- Queue monitoring and backpressure.
- Reconciliation for incomplete operations.
- Auditability of sensitive actions.

Test duplicate events, process restarts, database outages, provider failures, stale permissions, and delayed jobs.

Never assume exactly-once delivery from an ordinary queue. Build effectively-once business behavior through idempotency and durable state transitions.

## 13. Monitoring and production operations

Instrument APIs, workers, schedulers, integrations, databases, and agent workflows.

Track:

- Availability and error rate.
- p50, p95, and p99 latency.
- Database query latency and connection saturation.
- Queue depth and oldest-job age.
- Reminder processing delay.
- Push-provider failures.
- WebSocket connections and delivery delay.
- Agent tool denials, quality, latency, and cost.
- Authentication failures.
- Backup success and restore evidence.
- Deployment failures and rollback frequency.

Use structured logs with request and trace identifiers. Redact sensitive values.

Maintain incident response, escalation, rollback, backup restoration, key rotation, provider outage, and suspected data exposure runbooks.

## 14. Testing and release requirements

Use the appropriate test layer:

- Unit tests for domain logic and algorithms.
- Integration tests for database, API, workers, and providers.
- Contract tests for clients and services.
- Authorization tests for all sensitive resource boundaries.
- Playwright E2E tests for web journeys.
- Android UI and synchronization tests.
- Agent evaluation and tool-security tests.
- Load, stress, and soak tests.
- Failure-injection and recovery tests.
- Migration and backup restoration tests.
- Accessibility and privacy tests.

Do not use mocks to claim that real external integrations, real database transactions, or production behavior have been verified.

Test doubles and synthetic fixtures are allowed in isolated automated tests. Validate critical integrations against real sandbox or staging environments where supported.

Every release must pass defined gates for identity, permissions, privacy, functionality, performance, reliability, security, and rollback readiness.

## 15. Development-agent operating model

Create specialist workstreams with explicit file and domain ownership.

Each workstream must publish:

- Assigned owner.
- Scope and exclusions.
- Dependencies.
- Files and modules it owns.
- Contracts it consumes and produces.
- Acceptance criteria.
- Tests and verification commands.
- Security and performance risks.
- Completion evidence.
- Open blockers.

Do not allow multiple agents to make conflicting edits to the same foundational contracts or migrations without coordination.

A coordinating architect must review cross-domain changes and resolve interface conflicts.

Agents must not report completion merely because code was generated. They must build, test, inspect the result, and report actual outcomes.

## 16. Required outputs

Produce and maintain these project artifacts:

1. Repository audit and feature-status matrix.
2. Complete system and deployment architecture.
3. Domain ownership and interface map.
4. ERD and reviewed database schema.
5. API specification and generated client strategy.
6. Event catalog and schema versioning plan.
7. Security threat model and data-flow diagrams.
8. Privacy, retention, export, and deletion design.
9. Web and Android architecture and interaction specifications.
10. Agent runtime and tool authorization design.
11. Performance baseline and capacity test plan.
12. CI/CD, infrastructure, monitoring, and recovery plan.
13. Test strategy and regression suite.
14. Prioritized implementation backlog.
15. Architecture decision records and risk register.
16. Production readiness report with evidence.

## 17. Definition of done

A feature is complete only when:

- Its requirements and domain ownership are clear.
- Real implementation exists in the repository.
- Database changes and contracts are reviewed.
- Authorization and privacy behavior are tested.
- Frontend and Android integration works where applicable.
- Error, retry, offline, and conflict states are addressed.
- Relevant unit, integration, contract, and E2E tests pass.
- Monitoring and operational handling exist.
- Documentation reflects actual implementation.
- The change is reviewed and deployable.
- Test evidence and unresolved risks are reported.

Begin with repository inspection and an evidence-based audit. Then produce the dependency-ordered plan. Implement the highest-priority, unblocked work in reviewable increments. Do not invent missing repository details or silently replace working implementations.

## 7. What is still needed from your project to move from blueprint to implementation

The most important missing input now is not another list of technologies. It is the actual project state.

Without repository evidence, no one can accurately determine:

- Which packages and SDKs are already installed.
- Which chat implementation is slow and why.
- Whether database queries or network requests are causing loading delays.
- Which APIs already exist and which are incomplete.
- Whether current encryption is transport-only, at-rest, or genuinely end-to-end.
- Which migrations are safe to change.
- Which features are blocked by existing code or integration decisions.
- What infrastructure currently exists and what it can support.

If you connect or provide the GitHub repository, the next task should be to create the real repository audit, blocker map, architecture gap report, and implementation backlog. That is the step that will turn this broad engineering specification into actual, repository-specific work.

The core principle is: one authoritative architecture, real implementation, measurable performance, enforced privacy, and verified completion—not just a large collection of frameworks and diagrams.



The next step for your Community Agent Platform is to move beyond the feature list and establish a complete engineering control system. Your existing architecture already covers major components such as the backend, web and Android clients, database, agents, messaging, security, and deployment. The remaining gaps are often hidden in the interactions between these components.

The following is an additional gap analysis focused on areas that are easy to overlook in large, multi-client, AI-enabled community applications. It is a planning checklist, not a claim that these features are absent from your repository.

# 1. Additional product and platform gaps

| Area                  | Often-missed requirements                                                                                  | Why they matter                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Identity and accounts | Account linking, multiple devices, account recovery, username changes, account merging, session revocation | Prevents account loss and identity conflicts        |
| Community lifecycle   | Community discovery, onboarding, invitations, join requests, archived communities, ownership succession    | Supports communities beyond their initial creation  |
| Membership            | Pending, active, muted, suspended, banned, left, removed states; membership history                        | Avoids ambiguous authorization                      |
| Roles and permissions | Custom roles, scoped permissions, permission inheritance, temporary grants, emergency access               | Prevents overpowered admins and inconsistent access |
| Content lifecycle     | Drafts, scheduled posts, edits, revisions, deletion, restoration, retention                                | Makes content management predictable                |
| Feed and discovery    | Ranking explanations, pagination, deduplication, personalization controls, blocked-topic handling          | Improves relevance and user control                 |
| Notifications         | Per-channel preferences, quiet hours, digest mode, deduplication, delivery receipts, retry policies        | Avoids notification overload and missed alerts      |
| Search                | Permission-aware indexing, multilingual search, typo tolerance, filters, index deletion and rebuilds       | Prevents information leaks and poor discovery       |
| Trust and safety      | Reporting, moderation queues, appeals, rate limits, spam detection, audit history                          | Supports healthy communities at scale               |
| Accessibility         | Screen readers, keyboard navigation, contrast, dynamic text, localization and RTL support                  | Makes the application usable across different needs |
| Monetization          | Subscription entitlements, ad eligibility, billing events, refunds, invoices, spending controls            | Prevents payment and entitlement inconsistencies    |
| Integrations          | Webhooks, import/export, calendar sync, push providers, OAuth scopes, integration revocation               | Makes external connections manageable               |
| Data portability      | Export jobs, export formats, progress, expiration, download authorization                                  | Gives users practical control over their data       |
| Account closure       | Grace periods, legal retention exceptions, content ownership decisions, deletion status                    | Prevents incomplete or contradictory deletion       |
| Multi-region behavior | Time zones, locale-specific dates, regional data policies, failover design                                 | Avoids errors across regions and jurisdictions      |

A critical design rule: every feature should specify its owner, data model, permissions, API contract, events, UI states, failure behavior, metrics, and tests. A feature is not complete merely because a screen or endpoint exists.

# 2. Hidden architecture and distributed-systems gaps

These are particularly important because your platform combines multiple clients, real-time communication, scheduled actions, and AI agents.

## Expanded system architecture

Client applications

Next.js web · Android · Admin console · External integrations

Edge and identity layer

CDN · WAF · API gateway · Authentication · Rate limiting · Bot protection

Application platform

Identity and access

Community and membership

Content and feed

Messaging and presence

Events and scheduling

Notifications

Search and discovery

Billing and entitlements

Async and real-time infrastructure

Event outbox · Durable queues · WebSocket gateway · Schedulers · Workflow engine

Data platform

PostgreSQL · Redis · Object storage · Search index · Analytics warehouse

AI and integrations

Agent runtime · Model gateway · Tool gateway · Provider adapters · Webhooks

Cross-cutting: observability, policy enforcement, secrets, audit, privacy, deployment and disaster recovery

Logical reference architecture. It does not require each box to become a separate microservice.

| Missing design decision     | Required engineering work                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tenant and space boundaries | Define whether a space, community, organization, or account is the authorization boundary for each domain             |
| Consistency model           | Decide which operations require strong consistency and which can be eventually consistent                             |
| Idempotency                 | Define retry-safe behavior for messages, payments, reminders, event creation, and agent actions                       |
| Concurrency control         | Handle simultaneous edits, duplicate joins, competing ownership transfers, and overlapping scheduled jobs             |
| Event ordering              | Specify ordering guarantees per conversation, community, aggregate, or workflow                                       |
| Backpressure                | Limit work when queues, model providers, database pools, or WebSocket connections become saturated                    |
| Partial failure             | Define what happens when a database commit succeeds but a push notification, search update, or external webhook fails |
| Reconciliation              | Add scheduled jobs to identify and repair stale projections, missed events, or inconsistent states                    |
| Schema evolution            | Plan backward-compatible API, event, database, and mobile-client changes                                              |
| Clock correctness           | Store timestamps consistently, use UTC internally where appropriate, and preserve local time-zone rules for schedules |
| Data residency              | Identify whether data must remain within particular regions and how backups and logs are handled                      |
| Dependency isolation        | Prevent one slow integration, agent workflow, or large community from exhausting shared resources                     |

A particularly important addition is a reconciliation framework. Queues and event delivery are not sufficient by themselves. Your system should periodically verify that critical records and their derived state agree.

For example, a reminder may be committed in PostgreSQL while its queue publication fails. A reconciliation job should detect the missing scheduled work and repair it safely without creating duplicate reminders.

# 3. Missing database and data lifecycle details

Your ERD should include more than the primary product entities. It also needs operational, security, and lifecycle data.

| Data group    | Additional tables or concepts                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Identity      | `sessions`, `devices`, `account_links`, `recovery_requests`, `login_attempts`                                           |
| Authorization | `roles`, `permissions`, `role_permissions`, `membership_role_assignments`, `temporary_grants`                           |
| Content       | `content_revisions`, `content_attachments`, `content_reactions`, `content_reports`, `content_visibility`                |
| Messaging     | `conversation_members`, `message_receipts`, `message_edits`, `device_keys`, `key_transparency_records` where applicable |
| Operations    | `outbox_events`, `inbox_deduplication`, `job_attempts`, `scheduled_jobs`, `dead_letter_records`                         |
| Integrations  | `oauth_connections`, `webhook_endpoints`, `webhook_deliveries`, `provider_events`                                       |
| AI            | `agent_runs`, `agent_steps`, `tool_invocations`, `agent_approvals`, `model_usage_records`                               |
| Privacy       | `consent_records`, `data_export_jobs`, `deletion_requests`, `retention_policies`                                        |
| Security      | `audit_events`, `security_incidents`, `access_reviews`, `credential_rotation_records`                                   |
| Billing       | `subscriptions`, `entitlements`, `invoices`, `payment_events`, `refunds`                                                |

For each table, specify:

- Primary key and tenant/space scope.
- Foreign keys and deletion behavior.
- Unique constraints and partial indexes.
- Whether soft deletion is allowed and how it affects visibility.
- Data classification and retention period.
- Access-control policy and audit requirements.
- Expected table size, write volume, and query patterns.
- Migration and backfill strategy.
- Ownership by a specific domain.

Do not add every proposed table blindly. Validate the schema against actual product requirements and query patterns.

## Database cases that deserve explicit tests

- A user cannot read another space's records by changing an ID in an API request.
- A deleted community does not leave visible search results or active invitations.
- Ownership transfer cannot leave a community without a valid owner.
- Two concurrent membership requests cannot create duplicate active memberships.
- A retried payment webhook cannot grant an entitlement twice.
- A database migration can be applied and rolled back or forward-repaired according to its documented strategy.
- Restored backups preserve referential integrity and required encryption protections.
- A user deletion request propagates to derived systems, with documented exceptions for legally required retention.
- Search and analytics data do not preserve prohibited personal information indefinitely.

# 4. Missing API and contract governance

Your OpenAPI specification should become a shared engineering contract rather than a document produced after implementation.

| Contract area     | Required addition                                                                   |
| ----------------- | ----------------------------------------------------------------------------------- |
| API versioning    | Compatibility policy, deprecation period, client support windows                    |
| Error model       | Stable machine-readable error codes, field-level validation errors, correlation IDs |
| Pagination        | Cursor format, stable sorting, maximum page size, behavior when records change      |
| Filtering         | Allowed fields, operators, validation and query cost limits                         |
| Idempotency       | Key scope, retention, payload mismatch behavior, replay response                    |
| Authentication    | Session, token, service identity, expiration, revocation and refresh rules          |
| Authorization     | Resource-level checks, action-level permissions and tenant scoping                  |
| Uploads           | Signed URL lifetime, content-type validation, file size limits, malware scanning    |
| Webhooks          | Signature verification, replay protection, retry schedule, delivery history         |
| Rate limiting     | Per-user, per-IP, per-token, per-community and per-provider policies                |
| API documentation | Examples, authentication requirements, permission notes and known limitations       |
| Client generation | Generated-client versioning, linting, compatibility checks and regeneration rules   |

Add automated contract tests that compare implementation behavior against OpenAPI. Also test the reverse direction: the API contract must not expose internal fields or unsupported capabilities accidentally.

A useful rule is to require every API operation to document its authorization requirement, idempotency behavior, error cases, rate limits, and audit impact.

# 5. Missing AI-agent safety and governance

Your AI agents need their own lifecycle, permissions, and reliability controls. A model response should never be treated as proof that an action is valid or authorized.

### Controlled agent action flow

1\. User request

Authenticated identity and active space

2\. Policy and scope check

Resolve permitted resources, actions and consent

3\. Agent planning

Choose tools within a constrained execution plan

4\. Tool gateway

Validate schema, permission, limits and current state

5\. Approval gate

Require confirmation for consequential actions

6\. Domain service

Perform validated transaction and record audit event

7\. Result and evaluation

Return outcome, record usage and verify side effects

Add the following requirements:

- Agent identity distinct from the user and from other agents.
- Space-scoped tool permissions and short-lived delegated authorization.
- Consent checks before using personal memory or sensitive content.
- Prompt-injection defenses for messages, web pages, uploaded files, and retrieved documents.
- Tool allowlists, input validation, output validation, and execution timeouts.
- Human approval for irreversible or high-impact actions.
- Budget limits for tokens, tool calls, concurrent runs, and external services.
- Model/provider fallback policies that do not silently change safety behavior.
- Versioned prompts, tools, policies, and evaluation datasets.
- Agent-run replay and debugging with sensitive data redacted.
- Evaluation for hallucination, unauthorized tool use, prompt injection, cross-space leakage, and incorrect state changes.
- A kill switch for a misbehaving agent or compromised integration.
- Clear user-facing distinction between an AI-generated suggestion and a completed action.

For the AI stack, separate responsibilities:

| Component                          | Responsibility                                                  |
| ---------------------------------- | --------------------------------------------------------------- |
| LangGraph                          | Stateful workflow orchestration and resumable agent processes   |
| LangChain                          | Optional reusable model/tool abstractions                       |
| Groq or another inference provider | Model inference service                                         |
| Model gateway                      | Provider routing, budgets, quotas, timeouts and policy controls |
| Tool gateway                       | Authorization and validation for every tool invocation          |
| Domain services                    | Authoritative business rules and transactions                   |
| Evaluation pipeline                | Offline and online quality, safety and regression evaluation    |

The model provider should not own your application's authorization rules or business data.

# 6. Missing security, privacy, and compliance controls

Security is not one module. It is a set of controls applied to every data flow and operational process.

| Area              | Additional work                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Threat modeling   | Model abuse cases for users, moderators, agents, integrations, insiders and compromised devices                   |
| Secrets           | Centralized secret management, rotation, access policies, leak detection                                          |
| Cryptography      | Key ownership, key rotation, backup encryption, device enrollment, recovery and compromise handling               |
| Authentication    | MFA options, suspicious-login handling, session inventory, secure recovery                                        |
| Authorization     | Deny-by-default policies, resource-level checks, permission-change propagation                                    |
| Web security      | CSP, CSRF defenses where relevant, secure cookies, XSS prevention, dependency scanning                            |
| Mobile security   | Secure token storage, rooted-device threat assessment, app-link validation, certificate and transport protections |
| Data protection   | Classification, encryption in transit and at rest, redaction, retention and minimization                          |
| Abuse prevention  | Spam controls, credential-stuffing defense, scraping limits, automated abuse detection                            |
| Supply chain      | Dependency pinning, SBOM, signed artifacts, build provenance, vulnerability response                              |
| Incident response | Breach triage, evidence preservation, containment, user notification decision process                             |
| Privacy rights    | Consent withdrawal, export, deletion, correction and retention exceptions                                         |

For chat encryption, explicitly decide whether each conversation is server-readable or end-to-end encrypted. If E2EE is required, design multi-device enrollment, group membership changes, key rotation, recovery, message search, reporting, and backup behavior together. Encryption alone does not solve account compromise or malicious recipients.

Create a data-flow inventory for each sensitive data type. For example, a medication reminder may appear in the database, notification payload, logs, agent context, mobile cache, backup, and analytics. Every appearance needs a defined purpose and retention policy.

# 7. Missing reliability, operations, and performance engineering

Thousands of concurrent users is a capacity target, not an architecture guarantee. You need workload assumptions and repeatable evidence.

## Define service objectives

| Service                    | Example objective to validate                                        |
| -------------------------- | -------------------------------------------------------------------- |
| Core read APIs             | p95 latency below 300 ms under agreed load                           |
| Core write APIs            | p95 latency below 500 ms under agreed load                           |
| WebSocket message delivery | p95 server-side delivery below 1 second under agreed load            |
| Reminder processing        | 99% processed within the defined punctuality window                  |
| Notification dispatch      | Defined provider acceptance and retry targets                        |
| Agent workflow             | Maximum runtime, spend and concurrency per workflow class            |
| Search                     | p95 query latency and index freshness targets                        |
| Availability               | Separate objectives for critical user flows and noncritical features |

These are starting examples, not guaranteed or universal targets. Establish the final objectives after measuring real usage, provider limits, and infrastructure costs.

## Capacity and resilience tests

- Baseline load tests for normal traffic.
- Peak tests for simultaneous logins, feed refreshes, event launches, and message bursts.
- Stress tests to identify saturation and recovery behavior.
- Soak tests to find leaks, queue buildup, connection exhaustion, and slow degradation.
- Dependency-failure tests for Redis, database failover, queue outages, push providers, and model providers.
- Recovery tests for backups, corrupted data, and failed deployments.
- Multi-tenant noisy-neighbor tests for very large communities and unusually active users.
- Cost tests for high-volume notifications, media, search, and agent workflows.

Measure not just requests per second, but active WebSocket connections, database pool utilization, queue age, message fan-out, cache hit rate, object-storage operations, model tokens, and per-feature cost.

## Missing operational artifacts

### Production operations package

0 of 14 reviewed

Mark all reviewed

Service-level objectives and error budgets

Architecture decision records

Dependency and ownership catalog

On-call escalation policy

Incident severity and communication matrix

Database restore runbook

Deployment rollback runbook

Queue backlog and dead-letter recovery runbook

Credential and encryption-key rotation runbook

Provider outage and failover runbook

Security incident response plan

Data export and deletion operations runbook

Capacity planning and cost review

Post-incident review template

Also define how alerts are routed. An alert should have an owner, severity, actionable threshold, diagnostic context, and runbook. Alerts that do not trigger an action should be reviewed or removed.

# 8. Missing web, Android, and user-experience details

The web and Android clients should share domain contracts, but their implementation details and failure modes differ.

| Area             | Web requirements                                               | Android requirements                                               |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Navigation       | Deep links, route guards, browser history                      | App links, back stack, notification navigation                     |
| Authentication   | Secure session lifecycle, CSRF protection where relevant       | Secure token storage, biometric unlock where appropriate           |
| Offline behavior | Draft preservation, reconnect handling                         | Local persistence, queued writes, sync conflict handling           |
| Media            | Responsive delivery, upload progress, preview and cancellation | Background upload, compression, storage and permission handling    |
| Notifications    | In-app notifications and browser permission handling           | FCM integration, notification channels, deep links                 |
| Performance      | Bundle splitting, server rendering strategy, caching           | Startup time, memory, battery and background execution             |
| Accessibility    | Keyboard navigation, semantic structure, focus handling        | TalkBack, scalable text, touch target sizing                       |
| Diagnostics      | Browser console, network traces, performance measurements      | Crash reporting, network diagnostics, lifecycle and ANR monitoring |

Additional UI states should be designed for every significant flow:

- Initial loading, partial loading, and skeleton states.
- Empty states with meaningful next actions.
- Permission denied, access expired, and account suspended.
- Offline, reconnecting, and stale data.
- Duplicate submission and conflicting edits.
- Upload interrupted, unsupported file, and storage quota reached.
- Notification permission denied.
- Agent needs approval, failed, timed out, or partially completed.
- Community archived, deleted, or inaccessible.
- Maintenance mode and forced upgrade.

For Android, add an explicit offline-sync state machine. WorkManager is appropriate for deferrable persistent work, but it is not a real-time delivery guarantee. Use server-side scheduling for reminders and other time-critical events.

For web diagnostics, use Playwright tests and traces to inspect UI behavior, browser console errors, network failures, and performance regressions. Treat browser-agent tools as privileged automation: isolate credentials, restrict access to production, and avoid exposing sensitive user data in traces.

# 9. Missing test strategy and release gates

A test suite needs to prove system properties, not just verify that individual functions return expected values.

| Test level           | What it must verify                                                        |
| -------------------- | -------------------------------------------------------------------------- |
| Unit                 | Business rules, validation, permissions, state transitions                 |
| Database integration | Constraints, transactions, migrations, isolation                           |
| API integration      | Authentication, authorization, error contracts, idempotency                |
| Contract             | OpenAPI compatibility, generated-client compatibility, event schemas       |
| End-to-end           | Complete web and Android user journeys                                     |
| Security             | Access-control bypasses, injection, abuse limits, secret leakage           |
| AI evaluation        | Prompt injection, unsafe tool calls, scope violations, factual reliability |
| Performance          | Latency, throughput, saturation, recovery, resource consumption            |
| Resilience           | Retries, duplicate events, outages, recovery and reconciliation            |
| Accessibility        | Keyboard, screen-reader and mobile accessibility                           |
| Disaster recovery    | Backup integrity, restore time, recovery point and data consistency        |

Important cross-domain scenarios to include:

1. A user leaves a space while an agent run is in progress.
2. An administrator's permissions are revoked while they have an active session.
3. A community changes ownership while invitations and scheduled posts are pending.
4. A message is sent twice because a client retries after a timeout.
5. A payment provider sends an event late or out of order.
6. A user deletes their account while an export or agent workflow is running.
7. A mobile client reconnects after being offline for several days.
8. A queue worker crashes after committing a transaction but before acknowledging its job.
9. A moderator acts on content that has already been deleted or edited.
10. A model provider changes behavior or becomes unavailable during a workflow.

Use a release gate that blocks deployment when critical security checks, required migrations, contract compatibility, or core end-to-end journeys fail. Make exceptions explicit, time-limited, and owned by a responsible engineer.

# 10. Missing engineering organization and repository governance

A large project can fail even with a sound architecture if ownership and implementation boundaries are unclear.

Define these engineering roles or agent responsibilities:

| Role                                    | Primary ownership                                                 |
| --------------------------------------- | ----------------------------------------------------------------- |
| Principal architect                     | Architecture decisions, boundaries, technical risk                |
| Product engineer                        | User journeys, acceptance criteria and prioritization             |
| Backend domain engineers                | Business rules, APIs, transactions and events                     |
| Web engineer                            | Next.js application, accessibility and browser performance        |
| Android engineer                        | Kotlin app, offline behavior and lifecycle                        |
| Data engineer                           | Database design, migrations, query performance and data lifecycle |
| Platform engineer                       | CI/CD, infrastructure, reliability and observability              |
| Security engineer                       | Threat models, access control, privacy and incident readiness     |
| AI engineer                             | Agent orchestration, tool safety, evaluation and model costs      |
| QA / SDET                               | Test strategy, automation, regression and release verification    |
| Technical writer / developer experience | API docs, runbooks, architecture records and onboarding           |

These can be people or scoped coding-agent roles. One person may cover several responsibilities in a small team, but ownership should remain explicit.

## Repository structure to evaluate

```
community-platform/
├── apps/
│   ├── web/
│   ├── android/
│   ├── admin/
│   └── api/
├── services/
│   ├── workers/
│   ├── scheduler/
│   └── realtime/
├── packages/
│   ├── api-contracts/
│   ├── event-contracts/
│   ├── design-system/
│   ├── observability/
│   └── shared-test-fixtures/
├── agents/
│   ├── workflows/
│   ├── tools/
│   ├── policies/
│   └── evaluations/
├── infrastructure/
│   ├── environments/
│   ├── modules/
│   └── policies/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── verification/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── security/
│   ├── operations/
│   └── product/
└── .github/
    ├── workflows/
    ├── CODEOWNERS
    └── copilot-instructions.md
```

This is a reference structure, not a requirement to reorganize a working repository. Avoid moving code simply to make the repository look architecturally neat. First map existing packages, dependencies, deployment units, and domain ownership.

Require each pull request to include:

- A linked issue and acceptance criteria.
- The affected domains and contracts.
- A migration and compatibility assessment where relevant.
- Security and privacy impact.
- Tests and actual results.
- Observability changes.
- Rollback or forward-recovery considerations.
- Documentation updates.

# 11. A feature-completeness matrix you can apply to every module

Use this matrix for every product module, including communities, messaging, scheduling, events, advertisements, search, moderation, payments, and AI agents.

| Dimension   | Completion question                                                           |
| ----------- | ----------------------------------------------------------------------------- |
| Product     | Are personas, user journeys, edge cases, and acceptance criteria defined?     |
| UX          | Are loading, empty, failure, offline, and permission states designed?         |
| Domain      | Are invariants, state transitions, ownership, and lifecycle defined?          |
| Database    | Are constraints, indexes, migrations, retention, and isolation covered?       |
| API         | Are contracts, authorization, idempotency, pagination, and errors documented? |
| Events      | Are event names, schemas, ordering, retries, and deduplication specified?     |
| Clients     | Are web and Android behaviors and compatibility addressed?                    |
| Security    | Are threat models, permissions, abuse cases, and audit events addressed?      |
| Privacy     | Are consent, minimization, export, deletion, and retention addressed?         |
| Performance | Are workload assumptions, targets, profiling, and load tests defined?         |
| Operations  | Are metrics, alerts, dashboards, runbooks, and recovery paths available?      |
| Testing     | Are unit, integration, contract, E2E, security, and failure tests complete?   |
| Release     | Are rollout, migration, rollback, feature flags, and support plans ready?     |
| Ownership   | Is there a named owner and a documented support path?                         |

A module should not be marked production-ready solely because its UI and API are implemented.

# 12. Recommended order for closing the gaps

1. Repository and system audit

   Inventory real packages, routes, database objects, API contracts, dependencies, deployment units, tests, and known blockers. Tag each finding as implemented, partial, missing, broken, or unverified.
2. Domain and access-control contracts

   Define resource ownership, space boundaries, permission matrices, state machines, and transaction invariants. Prioritize identity, membership, community ownership, and sensitive personal data.
3. Core data and API foundations

   Stabilize schema conventions, migration safety, API errors, idempotency, OpenAPI, event contracts, and shared client generation.
4. Core user journeys

   Complete onboarding, community creation, membership, posting, messaging, events, scheduling, and notification preferences, with their failure states.
5. Async reliability and AI governance

   Implement durable jobs, retries, reconciliation, scoped agent tools, approvals, evaluation, budget controls, and auditability.
6. Security, privacy, and recovery

   Complete threat models, sensitive-data mapping, access reviews, deletion/export flows, backup verification, restore exercises, and incident procedures.
7. Performance and operational readiness

   Establish workload models, load and soak tests, service objectives, capacity limits, dashboards, alerts, and operational runbooks.
8. Staged release and evidence

   Roll out through controlled environments, run real integration and browser tests, verify recovery procedures, and collect evidence before increasing traffic.

The most useful deliverable from this process is a traceability system that links:

`Product requirement → user journey → domain owner → schema → API → event → UI → test → metric → runbook → release status`

This makes it possible to identify features that are only partially implemented and dependencies that are blocking multiple teams.

The key limitation remains repository visibility. I can identify common missing engineering areas and give you a systematic audit framework, but I cannot establish which ones are genuinely missing, already implemented, or broken in your application without examining the actual codebase, migrations, contracts, and deployment configuration.

For your GitHub Copilot agents, the next concrete instruction should be: do not start adding features yet. First produce a repository-backed gap report with file paths, symbols, schema evidence, test evidence, dependency blockers, and prioritized implementation tasks. That prevents parallel agents from duplicating work, inventing existing capabilities, or building incompatible versions of the same system.

# Community Agent Platform — Final Master Engineering Blueprint

This is the consolidated final plan for taking your Community Agent Platform from its current codebase to a production-ready application. It combines product scope, architecture, engineering ownership, implementation standards, security, AI governance, scalability, testing, deployment, and release management.

The central rule for your GitHub Copilot agents is:

Inspect first. Prove what exists. Identify gaps. Implement in dependency order. Test real behavior. Release only with evidence.

A comprehensive plan is not proof of production readiness. Production readiness must be demonstrated through the actual repository, integrated environments, tests, security reviews, and operational exercises.

# 1. Final product scope

Your application should be organized around the following product domains.

| Domain                | Main capabilities                                                                | Core dependencies                           |
| --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- |
| Identity and accounts | Registration, login, recovery, sessions, devices, account settings               | Authentication, database, security          |
| Spaces                | Personal, family, couple, custom, and temporary spaces                           | Identity, membership, permissions           |
| Communities           | Creation, discovery, categories, tags, rules, verification, ownership, deletion  | Spaces, content, moderation                 |
| Membership and roles  | Invitations, join requests, custom roles, permissions, bans, appeals             | Identity, communities                       |
| Messaging             | Direct and group conversations, attachments, receipts, presence, optional E2EE   | Identity, storage, real-time infrastructure |
| Content and feeds     | Posts, comments, reactions, media, feeds, drafts, revisions                      | Communities, storage, search                |
| Events and calendar   | Events, festivals, schedules, RSVPs, recurring events, time zones                | Spaces, notifications                       |
| Tasks and reminders   | Tasks, medication reminders, snooze, skip, completion reporting                  | Scheduling, notifications, privacy          |
| Notifications         | Push, email, in-app, browser notifications, preferences, digests                 | Events, messaging, integrations             |
| Search and discovery  | Community, content, people, event and topic search                               | Content, permissions, indexing              |
| Moderation and safety | Reports, moderation queues, appeals, anti-spam, audit trails                     | Communities, content, identity              |
| Personalization       | Interest preferences, feed controls, recommendation explanations                 | Consent, content, analytics                 |
| Advertising           | Ad eligibility, contextual targeting, frequency caps, measurement, user controls | Consent, privacy, billing                   |
| AI agents             | Space-scoped assistants, workflows, memory, tool use, approvals                  | Identity, domain services, model gateway    |
| Integrations          | Calendar, OAuth, webhooks, external providers                                    | Identity, secrets, event infrastructure     |
| Monetization          | Plans, subscriptions, entitlements, payments, refunds                            | Billing provider, identity                  |
| Administration        | Support, trust and safety, operational dashboards, policy management             | Audit, authorization, observability         |
| Privacy and lifecycle | Consent, data export, deletion, retention, account closure                       | Every data-owning domain                    |

Each domain needs its own product requirements, domain model, API contracts, events, authorization policy, user interface states, tests, observability, and operational ownership.

# 2. Final target architecture

Start with a modular monolith and independently scalable worker processes. Extract services only when measured operational or organizational needs justify the additional complexity.

## End-to-end system architecture

Clients

Next.js · Android/Kotlin · Admin portal · External clients

Edge and access

CDN · WAF · API gateway · Authentication · Rate limits

Application backend

Identity and access

Spaces and communities

Content and feed

Messaging

Events and scheduling

Notifications

Search

Billing and ads

Privacy and governance

Agent control plane

Shared domain services and transaction boundaries

Real-time and async

WebSocket gateway · Outbox · Queue · Workers · Scheduler · Workflow engine

AI and integrations

Model gateway · Tool gateway · Agent runtime · Provider adapters · Webhooks

Data

PostgreSQL · Redis · Object storage · Search index · Analytics

Operations

Metrics · Logs · Traces · Secrets · Audit · CI/CD · Backup and recovery

## Technology decisions

| Layer                     | Proposed technology                                     | Responsibility                                  |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| Web                       | Next.js, TypeScript                                     | Web application and server-rendered experiences |
| Android                   | Kotlin, Jetpack Compose                                 | Native mobile application                       |
| Backend                   | FastAPI, Python                                         | Domain APIs and application services            |
| Database                  | PostgreSQL                                              | Authoritative transactional state               |
| Cache and ephemeral state | Redis                                                   | Caching, rate limiting, transient coordination  |
| Real-time                 | WebSockets                                              | Live messaging and presence                     |
| Internal RPC              | gRPC, selectively                                       | High-value internal service communication       |
| API contracts             | OpenAPI                                                 | REST contract and client generation             |
| Event contracts           | Versioned schemas, optionally Protobuf                  | Durable event compatibility                     |
| Async processing          | Durable queue or workflow engine                        | Retries, scheduled work and long-running jobs   |
| AI orchestration          | LangGraph, where useful                                 | Stateful and resumable agent workflows          |
| Model access              | Provider adapters and model gateway                     | Routing, budgets and inference                  |
| File storage              | S3-compatible object storage                            | Media, exports and attachments                  |
| Search                    | PostgreSQL initially; dedicated engine if justified     | Search and discovery                            |
| Infrastructure            | Containers, managed services, infrastructure as code    | Reproducible environments and scaling           |
| Testing                   | Pytest, Playwright, Android tests, contract tests       | Verification                                    |
| Observability             | OpenTelemetry-compatible telemetry and monitoring stack | Diagnostics and reliability                     |

Do not adopt every technology immediately. GraphQL, microservices, multiple databases, a dedicated event platform, and custom orchestration are optional architectural choices, not automatic requirements.

# 3. Domain ownership and engineering boundaries

Every domain should own its business rules and data writes.

| Domain        | Owns                                                   | Must not do                                         |
| ------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Identity      | Accounts, sessions, authentication lifecycle           | Decide community-specific permissions               |
| Membership    | Membership status, roles, invitations                  | Bypass community policies                           |
| Community     | Rules, configuration, ownership and lifecycle          | Directly manage payment-provider state              |
| Messaging     | Conversations, messages, delivery state                | Read E2EE content that the protocol does not expose |
| Scheduling    | Due times, recurrence, execution status                | Treat a queue message as the authoritative schedule |
| Notifications | Delivery attempts and preferences                      | Assume provider acceptance means user receipt       |
| Agents        | Run state, plans, approvals, tool history              | Directly write arbitrary domain tables              |
| Billing       | Subscription and entitlement state                     | Trust unverified client payment claims              |
| Privacy       | Export and deletion orchestration                      | Silently ignore downstream systems                  |
| Platform      | Infrastructure, observability, release and reliability | Own product business logic                          |

Enforce these boundaries through module dependencies, code review, database ownership conventions, and tests.

# 4. Core database and API foundation

Your database should cover both product data and operational state.

Essential entity groups

- Identity: users, sessions, devices, account recovery, linked accounts.
- Spaces: spaces, memberships, invitations, role assignments.
- Communities: communities, rules, categories, tags, ownership history.
- Content: posts, revisions, comments, reactions, attachments, reports.
- Messaging: conversations, members, messages, receipts, device keys where relevant.
- Scheduling: events, tasks, reminders, occurrences, execution history.
- Notifications: preferences, notification records, delivery attempts.
- AI: agents, runs, steps, tool calls, approvals, usage records.
- Operations: outbox events, idempotency records, jobs, dead-letter records.
- Privacy: consents, exports, deletion requests, retention policies.
- Governance: audit events, moderation actions, access reviews.
- Monetization: plans, subscriptions, entitlements, payment events.

For every table, document:

- Primary and foreign keys.
- Tenant or space scope.
- Unique constraints and indexes.
- State transitions and deletion behavior.
- Sensitive-data classification and retention.
- Expected read and write patterns.
- Migration and backfill strategy.
- Ownership and authorized writers.

## API standards

Every REST endpoint should define:

- Authentication and authorization.
- Request and response schemas.
- Stable error codes and correlation IDs.
- Pagination and filtering behavior.
- Rate limits and payload limits.
- Idempotency behavior for retryable writes.
- Audit requirements.
- Compatibility and deprecation policy.
- Contract and integration tests.

Generate client libraries from OpenAPI where appropriate. Avoid maintaining manually duplicated web and Android request models without compatibility checks.

# 5. Security, privacy, and AI controls

These are release-critical requirements, not optional future enhancements.

Security

- Deny-by-default authorization.
- Resource-level access checks on every sensitive operation.
- Secure session lifecycle and account recovery.
- Centralized secret storage and rotation.
- Input validation and abuse prevention.
- Dependency and container vulnerability management.
- Audit logs for privileged actions.
- Threat models for account compromise, malicious content, insiders and agents.

Privacy

- Data classification and purpose limitation.
- Consent and consent withdrawal.
- User-accessible export and deletion flows.
- Retention and backup deletion policies.
- Sensitive-data redaction in logs and traces.
- Explicit rules for memory use and cross-space isolation.
- Regional and legal requirements assessed for the actual launch jurisdictions.

AI governance

- Separate agent identities and user identities.
- Scope-bound, short-lived permissions.
- Tool gateway with validation and authorization at execution time.
- Approval gates for consequential actions.
- Prompt-injection defenses for untrusted content.
- Token, time, concurrency and monetary budgets.
- Versioned prompts, policies, tools and evaluations.
- Agent kill switch and incident response.
- User-visible action results that distinguish suggestions from completed operations.

Encryption

- Decide which content is server-readable and which is E2EE.
- Use established, reviewed cryptographic protocols.
- Define device enrollment, key changes, recovery and backups.
- Document the implications for search, moderation, agents and multi-device sync.

# 6. Performance and scalability targets

Establish measurable objectives based on expected usage. These are illustrative initial targets to validate under representative load, not guaranteed capacity.

| Metric                           | Example initial target                        |
| -------------------------------- | --------------------------------------------- |
| Core API read p95                | Under 300 ms                                  |
| Core API write p95               | Under 500 ms                                  |
| WebSocket server delivery p95    | Under 1 second                                |
| Search p95                       | Under 500 ms                                  |
| Reminder punctuality             | 99% within a defined processing window        |
| Core user journey availability   | Explicit monthly SLO                          |
| Queue age                        | Per-queue threshold based on business urgency |
| Agent spend                      | Per-run and per-user budget limits            |
| Recovery point and recovery time | Explicitly defined and tested                 |

Test ordinary load, peak traffic, bursts, long-running load, saturation, recovery, noisy-neighbor behavior, and dependency outages.

Track database connection use, query latency, queue age, WebSocket connections, message fan-out, cache efficiency, notification outcomes, model usage, and per-feature infrastructure cost.

# 7. Complete client requirements

Web

- Responsive layouts and accessibility.
- Secure authentication and route protection.
- Robust loading, empty, error, and permission states.
- Deep links and reliable navigation.
- Upload progress, cancellation and validation.
- Performance budgets and browser diagnostics.
- Playwright end-to-end tests with traces and network checks.

Android

- Kotlin and Compose module boundaries.
- Repository and API-client layers.
- Local persistence and explicit offline-sync behavior.
- WorkManager for appropriate deferrable work.
- Push notifications and deep links.
- Secure credential storage.
- Battery, memory, startup and background-execution testing.
- TalkBack, scalable text and lifecycle testing.

Both clients should use compatible domain contracts and consistent authorization semantics, while preserving platform-specific interaction patterns.

# 8. Engineering execution plan

| Phase                                     | Main work                                                           | Exit evidence                                         |
| ----------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| 0. Repository audit                       | Inventory actual implementation, gaps, blockers and dependencies    | Evidence-backed status report                         |
| 1. Foundations                            | Domain boundaries, auth, permissions, schema conventions, contracts | Architecture decisions and passing foundational tests |
| 2. Core product                           | Spaces, communities, membership, content, messaging                 | End-to-end core journeys                              |
| 3. Scheduling and notifications           | Events, tasks, reminders, delivery and retry workflows              | Punctuality, idempotency and failure tests            |
| 4. Search, moderation and personalization | Indexing, discovery, safety and controls                            | Permission-aware search and moderation workflows      |
| 5. AI and integrations                    | Agent runtime, tool gateway, approvals, provider adapters           | Safety evaluations, budgets and audit evidence        |
| 6. Monetization and governance            | Billing, ads, entitlements, privacy and administration              | Verified billing events and lifecycle tests           |
| 7. Reliability and security               | Load, soak, threat, backup, restore and incident exercises          | Measured objectives and successful recovery drills    |
| 8. Staged production release              | Controlled rollout, monitoring, support and rollback                | Release sign-off with evidence                        |

The order is dependency-oriented. Actual sequencing should be adjusted after the repository audit reveals existing implementation and blockers.

# 9. Final GitHub Copilot master execution directive

Use the following as the primary instruction for your GitHub Copilot coding agent or lead engineering agent. The lead agent should coordinate specialized agents, resolve dependencies, and ensure that implementation is based on evidence from your actual repository.

# Community Agent Platform — Master Engineering Execution Directive

## Mission

Act as the principal engineering agent responsible for auditing, completing, testing, and preparing the Community Agent Platform for production.

Build on the actual existing repository. Do not assume features are missing or complete without evidence. Do not replace functioning systems without a justified technical reason.

The objective is a secure, maintainable, scalable, observable, production-ready platform across web, Android, backend, data, real-time communication, AI agents, infrastructure, and operations.

## Phase 1: Repository intelligence

Before implementation:

1. Inspect the complete repository structure and existing development instructions.
2. Identify languages, frameworks, packages, modules, services, APIs, database objects, migrations, infrastructure, CI/CD, tests, and documentation.
3. Trace important user journeys from UI to API, database, asynchronous processing, and external integrations.
4. Identify duplicated implementations, abandoned code, dependency conflicts, missing contracts, circular dependencies, security risks, and performance bottlenecks.
5. Run existing tests and record actual results.
6. Identify build failures, configuration blockers, unavailable integrations, and missing environment variables without exposing secrets.
7. Produce an evidence-backed feature and architecture status report.

Use these status classifications:

- Implemented and verified
- Implemented but unverified
- Partially implemented
- Missing
- Broken
- Blocked
- Not applicable

Include repository paths, relevant symbols, test evidence, dependencies, impact, and proposed next actions for each finding.

Do not claim that a capability works because its package, route, screen, or documentation exists.

## Phase 2: Architecture and product contracts

Establish:

- Domain ownership and dependency boundaries.
- Entity relationships and database constraints.
- Authentication and authorization policies.
- API and event contracts.
- State machines and transaction invariants.
- Data classification, consent, retention, and deletion rules.
- Web and Android integration contracts.
- Asynchronous workflow and failure-handling rules.
- Security threat models.
- Service objectives and capacity assumptions.

Record material architecture decisions in version-controlled architecture decision records.

## Phase 3: Implementation backlog

Convert verified gaps into small, independently testable engineering tasks.

Each task must include:

- Business purpose.
- Current repository evidence.
- Required behavior.
- Dependencies.
- Affected domains and files where known.
- API, database, event and UI impacts.
- Security and privacy implications.
- Acceptance criteria.
- Test requirements.
- Rollout and recovery considerations.
- Owner and status.

Prioritize foundational blockers, security defects, data integrity risks, and core user journeys before optional enhancements.

## Phase 4: Specialized engineering roles

Coordinate specialized agents or developers for:

- Architecture and technical governance.
- Backend and domain services.
- Web application and design system.
- Android and offline synchronization.
- Database and data engineering.
- Real-time messaging.
- AI orchestration and tool security.
- Infrastructure and reliability.
- Application security and privacy.
- Quality engineering and automation.
- Documentation and developer experience.

Assign explicit file and domain ownership. Avoid concurrent changes to shared contracts and migrations without coordination.

## Phase 5: Production implementation standards

All production code must:

- Follow existing repository conventions unless a documented change is justified.
- Enforce authorization on the server.
- Validate untrusted input and external provider responses.
- Use safe transaction and concurrency patterns.
- Handle retries, idempotency, timeouts and partial failures.
- Avoid unbounded work, unbounded queries and uncontrolled resource use.
- Include meaningful error handling and diagnostic context.
- Protect secrets and sensitive information.
- Support compatible deployment and schema evolution.
- Include tests for normal behavior and relevant failure cases.

Do not add fake production services, hardcoded credentials, insecure cryptography, silent error suppression, placeholder implementations presented as complete, or unsupported success claims.

Test fixtures and local development simulators are permitted only when clearly isolated from production paths.

## Phase 6: Cross-platform and AI integration

For web and Android, verify complete user journeys, authorization, state consistency, navigation, offline behavior where applicable, accessibility, and failure recovery.

For agents:

- Use distinct agent identities.
- Enforce space-scoped permissions.
- Validate every tool invocation.
- Recheck authorization at execution time.
- Require approval for consequential actions.
- Protect against prompt injection.
- Record usage, costs, approvals, and results.
- Evaluate unsafe actions, cross-space leakage, hallucinations and provider failures.
- Provide a kill switch and recovery procedure.

Agents must use approved domain services and tool gateways, not direct unrestricted database access.

## Phase 7: Quality and security verification

Implement and execute:

- Unit tests.
- Database integration tests.
- API and event contract tests.
- Cross-space isolation tests.
- Web and Android end-to-end tests.
- Accessibility tests.
- Security and abuse tests.
- Agent safety evaluations.
- Performance, load and soak tests.
- Migration and rollback or recovery tests.
- Backup restoration and disaster-recovery exercises.

Use Playwright for browser automation, including relevant console, network and trace inspection.

Report exact commands, environment, results, failures, skipped tests and unresolved limitations. Never report an unexecuted test as passing.

## Phase 8: Production readiness

Verify:

- Environment configuration and secret management.
- CI/CD quality and security gates.
- Deployment and migration compatibility.
- Monitoring, logs, metrics and traces.
- Service-level objectives and actionable alerts.
- Queue retry and dead-letter procedures.
- Backup integrity and restoration.
- Rollback and forward-recovery plans.
- Incident escalation and runbooks.
- Provider outage behavior.
- Cost and capacity limits.
- Privacy and security sign-off.
- Support and release communication.

Release through controlled environments and staged rollout. Do not claim readiness without evidence.

## Required deliverables

Maintain these repository artifacts:

1. Repository inventory and evidence-backed audit.
2. Product capability matrix.
3. Architecture overview and context diagrams.
4. Domain ownership and dependency map.
5. ERD and database data dictionary.
6. API and event contract catalog.
7. Permission matrix and threat models.
8. Data-flow and retention inventory.
9. UI and cross-platform journey inventory.
10. Agent safety and evaluation plan.
11. Prioritized implementation backlog.
12. Test strategy and execution reports.
13. Performance and capacity report.
14. Deployment and infrastructure documentation.
15. Monitoring and incident runbooks.
16. Backup and disaster-recovery evidence.
17. Production readiness checklist.
18. Release report with known risks and limitations.

Keep these artifacts synchronized with actual implementation.

## Definition of done

A task is complete only when:

- Its acceptance criteria are satisfied.
- The code is integrated with the actual application.
- Relevant tests have been executed and results recorded.
- Authorization and data isolation are verified.
- Contracts and documentation are updated.
- Observability and failure handling are adequate.
- Compatibility and migration risks are addressed.
- The implementation has passed review.
- Remaining limitations are documented.

A feature is production-ready only when its critical dependencies, security controls, recovery behavior, performance requirements and operational ownership have also been verified.

## Reporting protocol

At the end of each implementation cycle, report:

- What was inspected.
- What was implemented.
- Which files and modules changed.
- Which tests were executed and their results.
- What remains incomplete.
- What is blocked and why.
- Any security, privacy, performance or data-integrity concerns.
- The next dependency-ready tasks.

Do not fabricate progress, repository facts, test results, integrations, or deployment status.

Begin with repository discovery and the evidence-backed audit. Do not start a large implementation wave before the audit, dependency analysis and task boundaries are reviewed.

# 10. Final production 

## Production 

Product and architecture

Every major domain has a documented owner

Core journeys and failure states are specified

Domain boundaries and dependency rules are verified

API and event contracts are versioned

Data and security

Space isolation and authorization tests pass

Migrations and recovery procedures are verified

Sensitive data has defined retention and access rules

Export and deletion workflows are tested

Secrets and privileged access are controlled

AI and real-time

Agent tools enforce scoped permissions

Consequential agent actions use approval gates

Messaging retry and delivery semantics are tested

Agent budgets and emergency shutdown are verified

Reliability and operations

Load and soak tests have measured results

Monitoring and alerts have owners and runbooks

Backup restoration has been exercised

Incident and rollback procedures have been tested

Capacity and cost limits are documented

Release

Critical automated tests pass

Known defects and exceptions are reviewed

Deployment and migration plans are approved

Staged rollout and rollback are available

Support ownership and release communication are ready

