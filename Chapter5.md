# Chapter 5 — Agent Runtime Architecture, LangGraph Workflows, Tool Execution, Memory, Approvals, and Human-in-the-Loop Controls

## 5.1 Objective

The agent system should help users and groups perform useful work while preserving:

* User control

* Privacy

* Permission boundaries

* Explainability

* Reliable execution

* Safe failure handling

* Human approval

* Memory isolation

* Auditability

* Cost control

* Loop protection

The agent must not be designed as an unrestricted chatbot with access to every database table and external service.

The correct design is:

```
User or Group
    ↓
Agent Interface
    ↓
Agent Gateway
    ↓
Policy and Permission Layer
    ↓
Agent Runtime
    ↓
Context Builder
    ↓
LangGraph Workflow
    ↓
Tool Execution Layer
    ↓
Verification
    ↓
Approval or Completion
    ↓
Response and Audit
```

# 5.2 Agent Types

The platform should support multiple agent scopes.

```
Agent System
├── Personal Agent
├── Space Agent
├── Conversation Agent
├── Task Agent
├── Reminder Agent
├── Event Planning Agent
├── Notification Agent
└── Coordinator Agent
```

## 5.2.1 Personal Agent

The personal agent operates inside a user’s solo space.

Possible responsibilities:

* Personal planning

* Reminders

* Notes

* Goal tracking

* Personal document organization

* Private knowledge retrieval

* Personal schedule assistance

The personal agent may access personal memory only when the user has enabled that capability.

## 5.2.2 Space Agent

The space agent operates for a family, couple, custom group, or event space.

Possible responsibilities:

* Summarize group discussions

* Create shared tasks

* Organize events

* Calculate shared costs

* Prepare schedules

* Track group decisions

* Remind members

* Coordinate approved workflows

The space agent should only access:

* Shared messages

* Shared tasks

* Shared events

* Approved files

* Approved memories

* Authorized member information

## 5.2.3 Conversation Agent

A conversation agent is attached to one conversation.

Its context is narrower than the full space agent.

```
Conversation Agent Context
├── Current conversation
├── Approved referenced messages
├── Relevant task records
├── Relevant event records
└── Explicit user instructions
```

It should not automatically retrieve unrelated space data.

## 5.2.4 Specialized Agents

Specialized agents may be implemented as graph nodes or subgraphs.

Examples:

```
Scheduling Agent
Task Agent
Event Agent
Document Agent
Notification Agent
Cost Calculation Agent
Reminder Agent
```

These agents should not independently decide permissions. They must use the central policy layer.

# 5.3 Agent Runtime Components

```
Agent Runtime
├── Agent Gateway
├── Session Manager
├── Context Builder
├── Prompt Builder
├── LangGraph Executor
├── Model Router
├── Tool Registry
├── Tool Executor
├── Approval Manager
├── Verification Layer
├── Memory Manager
├── Cost Controller
├── Loop Guard
├── Tracing Layer
└── Audit Writer
```

Each component should have one primary responsibility.

# 5.4 Agent Gateway

The Agent Gateway is the entry point for all agent requests.

It handles:

* Authentication

* Space resolution

* Conversation resolution

* Permission validation

* Request validation

* Rate limiting

* Agent configuration lookup

* Request correlation

* Idempotency

## 5.4.1 Request Flow

```
Client Request
    ↓
Authenticate User
    ↓
Resolve Agent Scope
    ↓
Validate Membership
    ↓
Validate Agent Enabled State
    ↓
Validate User Consent
    ↓
Create Agent Run
    ↓
Queue or Execute Workflow
```

## 5.4.2 Agent Request Model

JSON

```
{
  "space_id": "space_123",
  "conversation_id": "conversation_456",
  "message": "Help us plan the festival budget.",
  "client_request_id": "client_req_001",
  "requested_mode": "planning"
}
```

The server must derive the authenticated user from the access token. It must not trust a client-provided `user_id`.

# 5.5 Agent Run Model

Every agent invocation should create a durable run.

```
agent_runs
----------
id
space_id
conversation_id
requested_by_user_id
agent_type
status
input_message_id
current_node
model_provider
model_name
started_at
completed_at
failure_reason
token_usage
cost_estimate
trace_id
created_at
```

## 5.5.1 Run States

```
CREATED
QUEUED
RUNNING
WAITING_FOR_APPROVAL
WAITING_FOR_TOOL
COMPLETED
FAILED
CANCELLED
TIMED_OUT
```

The run state must be updated whenever the workflow changes phase.

# 5.6 Agent Execution Modes

## Synchronous Mode

Used for short requests.

Examples:

* Explain a task

* Summarize a message

* Answer a simple question

* Suggest an event title

  Request → Runtime → Response

## Asynchronous Mode

Used for long-running operations.

Examples:

* Analyze many files

* Plan a large event

* Process a large conversation

* Run multiple tools

* Generate a detailed report

  Request → Create Run → Queue → Worker → Notification

## Streaming Mode

Used when the response should appear progressively.

```
Run Started
    ↓
Text Chunks
    ↓
Tool Status
    ↓
Approval Request
    ↓
Final Response
```

The final response must be persisted separately from streaming chunks.

# 5.7 LangGraph Workflow Design

LangGraph is suitable for representing agent execution as a stateful graph.

A typical workflow:

```
START
  ↓
Load Run
  ↓
Build Context
  ↓
Apply Policy
  ↓
Call Model
  ↓
Classify Response
  ├── Final Answer → Verify → Save → END
  ├── Tool Request → Authorize Tool
  ├── Approval Needed → WAIT
  └── Failure → Recover or END
```

## 5.7.1 Core State

Python

Run

```
from typing import TypedDict, Any


class AgentState(TypedDict, total=False):
    run_id: str
    user_id: str
    space_id: str | None
    conversation_id: str | None
    user_message: str
    context_items: list[dict[str, Any]]
    model_messages: list[dict[str, Any]]
    tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]
    pending_approval_id: str | None
    final_response: str | None
    error: str | None
    iteration_count: int
```

The state should contain only what the workflow needs.

Do not place unrestricted database connections, access tokens, or private secrets inside graph state.

# 5.8 Graph Nodes

## 5.8.1 Load Run Node

Responsibilities:

* Load agent run

* Validate status

* Load configuration

* Check cancellation

* Check timeout

## 5.8.2 Context Builder Node

Responsibilities:

* Load relevant messages

* Load approved tasks

* Load relevant events

* Load approved files

* Load permitted memory

* Apply scope filters

* Remove unauthorized data

## 5.8.3 Policy Node

Responsibilities:

* Check agent enabled state

* Check user permissions

* Check space policies

* Check consent

* Check sensitive-data rules

* Determine allowed tools

## 5.8.4 Model Node

Responsibilities:

* Build model request

* Apply system instructions

* Include approved context

* Set token limits

* Set timeout

* Track provider/model

* Capture usage

## 5.8.5 Tool Authorization Node

Responsibilities:

* Validate tool name

* Validate arguments

* Check user permissions

* Check agent permissions

* Classify risk

* Determine approval requirement

## 5.8.6 Tool Execution Node

Responsibilities:

* Execute only authorized tools

* Apply timeout

* Apply retry policy

* Record result

* Sanitize returned data

* Write tool audit event

## 5.8.7 Verification Node

Responsibilities:

* Validate tool output

* Check expected state changes

* Detect partial failure

* Confirm idempotency

* Decide whether another graph iteration is needed

## 5.8.8 Finalization Node

Responsibilities:

* Generate final response

* Persist assistant message

* Update agent run

* Save approved memory if applicable

* Publish realtime event

* Write audit record

# 5.9 Model Router

The model router selects a model based on task requirements.

Possible routing dimensions:

* Task complexity

* Privacy sensitivity

* Latency requirement

* Cost budget

* Context length

* Tool-use capability

* Availability

* User-selected model policy

Example:

```
Simple classification → lightweight model
Normal conversation → standard model
Complex planning → stronger model
Sensitive data → approved privacy-preserving route
Offline/local task → local model if available
```

The model router must not bypass privacy policy merely because a different model is more capable.

# 5.10 Provider Abstraction

The agent runtime should use a provider interface.

Python

Run

```
from typing import Protocol


class ModelProvider(Protocol):
    async def generate(
        self,
        messages: list[dict],
        tools: list[dict],
        metadata: dict,
    ) -> dict:
        ...
```

Possible implementations:

```
OpenAIProvider
AnthropicProvider
GeminiProvider
LocalModelProvider
MockModelProvider
```

The application should not scatter provider-specific logic across every agent node.

Use:

```
Model Router
    ↓
Provider Adapter
    ↓
Selected Model
```

# 5.11 Prompt Architecture

Prompts should be assembled from separate layers.

```
System Policy
    +
Agent Role
    +
Space Policy
    +
User Permissions
    +
Task Instructions
    +
Retrieved Context
    +
Current User Message
```

## 5.11.1 Prompt Layers

### Platform Policy

Defines:

* Safety requirements

* Privacy boundaries

* Tool restrictions

* Approval rules

* Data handling rules

### Agent Role

Defines:

* What the agent does

* What it does not do

* Expected response style

* Available workflows

### Space Policy

Defines:

* Shared-space rules

* Member permissions

* Notification rules

* Agent configuration

### Runtime Context

Defines:

* Current conversation

* Relevant tasks

* Relevant events

* Approved memory

* User request

The model should not be allowed to redefine the platform policy through user messages or retrieved documents.

# 5.12 Tool Registry

All tools must be registered centrally.

```
Tool Registry
├── create_task
├── update_task
├── create_event
├── update_event
├── create_reminder
├── summarize_conversation
├── search_approved_files
├── calculate_cost
├── request_approval
├── send_internal_notification
└── create_external_message_draft
```

## 5.12.1 Tool Definition

Python

Run

```
from dataclasses import dataclass
from typing import Callable


@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: dict
    risk_level: str
    required_permissions: set[str]
    requires_approval: bool
    handler: Callable
```

The model may request a tool, but the model does not grant itself permission to execute it.

# 5.13 Tool Categories

## Read Tools

Examples:

* Read shared tasks

* Read shared events

* Search approved files

* Read permitted messages

* Read approved memory

## Write Tools

Examples:

* Create task

* Update event

* Create reminder

* Save approved memory

* Draft notification

## External Tools

Examples:

* Send WhatsApp message

* Send email

* Place a call

* Create external calendar event

* Access external APIs

## High-Risk Tools

Examples:

* Change medication information

* Delete space data

* Export private data

* Add or remove members

* Make a purchase

* Send sensitive external communication

High-risk tools should be disabled unless explicitly implemented and approved.

# 5.14 Tool Input Validation

Tool arguments must be validated using strict schemas.

Example:

Python

Run

```
from pydantic import BaseModel, Field


class CreateTaskInput(BaseModel):
    space_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    assigned_to_user_id: str | None = None
    due_at: str | None = None
```

Validation must occur:

1. Before the model sees the tool result.

2. Before authorization.

3. Before execution.

4. Before persistence.

5. Before external delivery.

Never pass arbitrary model-generated JSON directly to a database or external provider.

# 5.15 Tool Execution Contract

Every tool execution should include:

```
tool_call_id
agent_run_id
requested_by_user_id
space_id
tool_name
validated_arguments
risk_level
approval_id
idempotency_key
started_at
completed_at
status
result_reference
error_code
```

## 5.15.1 Tool Execution States

```
REQUESTED
AUTHORIZED
WAITING_FOR_APPROVAL
RUNNING
SUCCEEDED
FAILED
TIMED_OUT
CANCELLED
```

# 5.16 Tool Idempotency

A tool must not create duplicate side effects when a run retries.

Example:

```
agent_run_id + tool_call_id
```

For external messages:

```
provider + recipient + idempotency_key
```

For task creation:

```
space_id + agent_run_id + tool_call_id
```

If the same tool call is retried, the backend should return the original result where possible.

# 5.17 Approval Workflow

Agent approval is a separate durable workflow.

```
Agent Requests Action
        ↓
Risk Classification
        ↓
Permission Check
        ↓
Approval Record Created
        ↓
User Notification
        ↓
User Reviews Details
        ↓
Approve or Reject
        ↓
Backend Revalidates
        ↓
Tool Executes
        ↓
Result Verified
```

## 5.17.1 Approval Requirements

The approval screen should show:

* What the agent wants to do

* Why it wants to do it

* Target recipient or record

* Exact data to be shared

* Tool name

* Risk level

* Expiration time

* What happens after approval

* Whether the action is reversible

The user should not approve an opaque label such as:

```
Allow agent action?
```

Instead:

```
Send this message to the selected family administrator:
“Please check the pending reminder.”

Data shared:
- Reminder status
- No medicine name
- No dosage
- No prescription image
```

# 5.18 Approval Revalidation

Approval is not a permanent authorization.

When the user approves an action, the backend must revalidate:

* User still belongs to the space

* User still has approval permission

* Action has not changed

* Payload hash matches

* Recipient is still valid

* Consent remains active

* Tool is still enabled

* Action has not expired

If any condition fails, the action must be rejected or sent back for approval.

# 5.19 Human-in-the-Loop States

```
WAITING_FOR_USER_INPUT
WAITING_FOR_APPROVAL
WAITING_FOR_MEMBER_RESPONSE
WAITING_FOR_EXTERNAL_PROVIDER
WAITING_FOR_REVIEW
```

The graph must be resumable after waiting.

Do not keep a Python process blocked indefinitely while waiting for a user.

Recommended pattern:

```
Persist graph checkpoint
    ↓
Set run status = WAITING
    ↓
Return control to application
    ↓
User responds later
    ↓
Load checkpoint
    ↓
Resume graph
```

# 5.20 LangGraph Checkpointing

Checkpoint state should be stored in a durable backend.

Possible storage:

* PostgreSQL

* Redis for short-lived state

* Object storage for large artifacts

Recommended:

```
PostgreSQL = durable workflow state
Redis = short-lived coordination
Object storage = large artifacts
```

Checkpoint records may include:

```
run_id
thread_id
checkpoint_id
node_name
state_json
created_at
```

Sensitive values should not be stored in plaintext graph checkpoints.

# 5.21 Agent Memory Architecture

Memory should be divided into distinct layers.

```
Short-Term Context
    ↓
Conversation Memory
    ↓
Space Memory
    ↓
Personal Memory
    ↓
Long-Term Knowledge
```

## 5.21.1 Short-Term Context

Contains:

* Current user message

* Recent conversation messages

* Current tool results

* Current workflow state

It should expire naturally.

## 5.21.2 Conversation Memory

Contains:

* Important decisions

* Current discussion context

* Open questions

* Recent conclusions

Scope:

```
One conversation
```

## 5.21.3 Space Memory

Contains:

* Shared decisions

* Group preferences

* Event details

* Shared policies

* Approved recurring information

Scope:

```
One private space
```

## 5.21.4 Personal Memory

Contains:

* Personal preferences

* Personal goals

* Personal notes

* Private routines

* User-approved facts

Scope:

```
One user
```

Personal memory must not automatically enter space memory.

# 5.22 Memory Write Policy

The agent should not save every conversation message as memory.

A memory candidate should be evaluated for:

* Usefulness

* Stability

* Sensitivity

* Ownership

* Scope

* User consent

* Expiration

* Source reliability

Example memory candidates:

```
Useful:
“The family usually meets on Sunday evenings.”

Not automatically saved:
“The user is upset today.”

Potentially sensitive:
“The user has a medical condition.”

Private by default:
“The user’s personal financial concern.”
```

Sensitive memories require explicit consent and stricter access control.

# 5.23 Memory Consent

Consent records should be explicit.

```
memory_consents
--------------
id
user_id
space_id
memory_type
scope
status
granted_at
revoked_at
expires_at
```

Possible statuses:

```
NOT_REQUESTED
PENDING
GRANTED
DENIED
REVOKED
EXPIRED
```

The user should be able to:

* View saved memories

* Delete memories

* Correct memories

* Change scope

* Disable automatic memory

* Revoke consent

* Request a memory explanation

# 5.24 Memory Retrieval

Retrieval must be permission-aware before ranking.

Correct flow:

```
User Identity
    ↓
Current Space Membership
    ↓
Allowed Memory Scopes
    ↓
Consent Filter
    ↓
Sensitivity Filter
    ↓
Candidate Retrieval
    ↓
Relevance Ranking
    ↓
Context Budgeting
```

Incorrect flow:

```
Retrieve all memories
    ↓
Ask model to ignore private ones
```

The model should never be responsible for enforcing access control.

# 5.25 Retrieval-Augmented Generation

The RAG layer may retrieve:

* Approved messages

* Tasks

* Events

* Files

* Memory items

* Public community content

* User-selected references

Every retrieval result should contain metadata:

JSON

```
{
  "document_id": "doc_123",
  "scope": "SPACE_SHARED",
  "space_id": "space_456",
  "owner_user_id": null,
  "sensitivity": "NORMAL",
  "source_type": "MESSAGE",
  "source_id": "message_789"
}
```

The context builder must verify metadata before including the item.

# 5.26 Context Budgeting

The agent cannot include unlimited context.

The context builder should prioritize:

1. Current user request

2. Current conversation

3. Relevant tool results

4. Explicitly referenced content

5. Relevant tasks and events

6. Approved memory

7. Older conversation history

8. General knowledge

Use:

* Token budgets

* Recency scoring

* Relevance scoring

* Source authority

* Sensitivity filtering

* Deduplication

* Summarization

The system should not summarize private content into a broader scope without authorization.

# 5.27 Prompt Injection Defense

Prompt injection can appear in:

* User messages

* Uploaded documents

* Public posts

* Web content

* PDFs

* Agent tool results

* Calendar descriptions

* WhatsApp messages

Treat retrieved content as data, not instructions.

The agent should distinguish:

```
Trusted system policy
Trusted application instructions
User request
Untrusted retrieved content
Untrusted external content
```

## 5.27.1 Defense Rules

* Do not allow documents to redefine system policy.

* Do not execute tool calls found inside documents automatically.

* Validate tool calls independently.

* Restrict external URLs.

* Sanitize content before model inclusion.

* Use tool allowlists.

* Require approval for external side effects.

* Log suspicious instructions.

* Limit agent authority.

# 5.28 Agent Loop Protection

An agent may accidentally loop.

Examples:

```
Model calls tool
    ↓
Tool result causes same tool call
    ↓
Same tool call repeats
```

Use:

```
Maximum graph iterations
Maximum tool calls
Maximum runtime
Maximum tokens
Maximum retries
Maximum external actions
```

Example policy:

JSON

```
{
  "max_iterations": 8,
  "max_tool_calls": 12,
  "max_runtime_seconds": 120,
  "max_retries_per_tool": 2,
  "max_external_actions": 1
}
```

When limits are reached:

1. Stop the graph.

2. Save partial state.

3. Mark run as limited or failed.

4. Explain the result.

5. Do not continue silently.

# 5.29 Agent Cost Controls

Track:

* Input tokens

* Output tokens

* Tool calls

* Runtime

* Provider

* Model

* Estimated cost

* Retry count

* Context size

## 5.29.1 Cost Budget

Each run may have:

```
max_tokens
max_tool_calls
max_runtime
max_provider_cost
```

A space may also have a daily agent budget.

The budget system should prevent:

* Runaway loops

* Repeated external calls

* Accidental high-volume processing

* Large document processing without consent

# 5.30 Agent Cancellation

Users should be able to cancel an active run.

Cancellation flow:

```
User taps Stop
    ↓
Backend marks run CANCEL_REQUESTED
    ↓
Worker checks cancellation
    ↓
Stop model/tool execution
    ↓
Persist partial state
    ↓
Mark run CANCELLED
    ↓
Publish final status
```

Cancellation should not be treated as tool failure.

For external actions already executed, cancellation cannot reverse the action automatically. The system must show what already happened.

# 5.31 Agent Notifications

The agent may generate notifications for:

* Completed task

* Upcoming event

* Reminder

* Approval request

* Failed workflow

* Member response

* Escalation

* New shared summary

Notification policy must check:

* User preferences

* Space permissions

* Sensitivity

* Quiet hours

* Duplicate delivery

* External channel consent

The agent should not directly call push, email, or WhatsApp providers.

It should create a notification request through the notification service.

# 5.32 Agent-to-Agent Communication

If multiple agents exist, they should communicate through structured messages.

```
Coordinator Agent
    ↓
Scheduling Agent
    ↓
Task Agent
    ↓
Notification Agent
    ↓
Coordinator Agent
```

## 5.32.1 Agent Message Contract

JSON

```
{
  "message_id": "agent_msg_123",
  "from_agent": "coordinator",
  "to_agent": "scheduling",
  "task_type": "find_available_time",
  "payload": {
    "space_id": "space_123",
    "date_range": "next_week"
  },
  "permissions": [
    "READ_SHARED_EVENTS"
  ],
  "deadline": "2026-09-18T12:00:00Z"
}
```

Each agent should receive:

* Explicit task

* Explicit scope

* Explicit permissions

* Deadline

* Correlation ID

* Expected output schema

Agents should not pass unrestricted context to each other.

# 5.33 Coordinator Agent

The coordinator may:

* Understand the user’s goal

* Break the goal into subtasks

* Assign subtasks

* Collect results

* Resolve conflicts

* Ask for approval

* Produce final response

The coordinator should not automatically have every domain permission.

A coordinator may delegate:

```
Planning → Planning Agent
Scheduling → Scheduling Agent
Files → Document Agent
Notifications → Notification Agent
```

Each sub-agent operates under least privilege.

# 5.34 Agent Result Verification

The agent should verify actions rather than trusting tool return text.

For a task creation:

```
Tool says task created
        ↓
Query task by idempotency key
        ↓
Confirm task exists
        ↓
Confirm correct space
        ↓
Confirm correct title
        ↓
Confirm correct assignee
        ↓
Mark action verified
```

For an external message:

```
Provider returns message ID
        ↓
Store provider message ID
        ↓
Record send status
        ↓
Do not claim delivery until provider confirms
```

# 5.35 Agent Audit Trail

Every run should produce a trace.

```
Agent Run
├── User Request
├── Context Sources
├── Policy Decision
├── Model Request Metadata
├── Tool Calls
├── Approval Requests
├── Tool Results
├── Verification
├── Final Response
└── Cost and Timing
```

Avoid storing raw chain-of-thought reasoning.

Store operational metadata such as:

* Decision category

* Tool selected

* Policy result

* Approval status

* Verification result

* Error code

* Source references

# 5.36 Agent Database Tables

```
agent_configs
agent_runs
agent_messages
agent_tool_calls
agent_tool_results
agent_action_approvals
agent_checkpoints
agent_memory_items
memory_consents
agent_notifications
agent_cost_records
agent_audit_events
```

## 5.36.1 Agent Tool Calls

```
agent_tool_calls
----------------
id
agent_run_id
tool_call_id
tool_name
arguments_json
validated_arguments_json
risk_level
status
approval_id
idempotency_key
started_at
completed_at
error_code
created_at
```

## 5.36.2 Agent Cost Records

```
agent_cost_records
------------------
id
agent_run_id
provider
model
input_tokens
output_tokens
cached_tokens
tool_calls
runtime_ms
estimated_cost
created_at
```

# 5.37 Agent API Endpoints

http

```
POST /v1/agent-runs
GET  /v1/agent-runs/{run_id}
POST /v1/agent-runs/{run_id}/cancel
GET  /v1/agent-runs/{run_id}/events
POST /v1/agent-runs/{run_id}/resume
```

## Tool APIs

http

```
GET  /v1/agent-tools
GET  /v1/agent-runs/{run_id}/tool-calls
GET  /v1/agent-runs/{run_id}/tool-results
```

## Approval APIs

http

```
GET  /v1/agent-approvals
GET  /v1/agent-approvals/{approval_id}
POST /v1/agent-approvals/{approval_id}/approve
POST /v1/agent-approvals/{approval_id}/reject
```

## Memory APIs

http

```
GET    /v1/memory
GET    /v1/memory/{memory_id}
PATCH  /v1/memory/{memory_id}
DELETE /v1/memory/{memory_id}
POST   /v1/memory/{memory_id}/revoke-consent
```

# 5.38 Android Agent Screens

## Agent Home

Displays:

* Agent status

* Current scope

* Enabled tools

* Recent runs

* Pending approvals

* Memory controls

* Privacy settings

## Agent Chat

Displays:

* User messages

* Agent responses

* Streaming status

* Tool execution indicators

* Approval requests

* Failed actions

* Retry controls

* Cancel controls

## Approval Screen

Displays:

* Exact action

* Data being used

* Target

* Risk level

* Expiration

* Approve

* Reject

## Memory Screen

Displays:

* Saved memory items

* Source

* Scope

* Sensitivity

* Created date

* Edit

* Delete

* Revoke permission

## Agent Settings

Controls:

* Enable/disable agent

* Allowed tools

* Automatic actions

* Approval requirement

* Notification channels

* Memory behavior

* External communication

* Quiet hours

* Spending or usage limits

# 5.39 Web Agent Screens

```
/spaces/[spaceId]/agent
/spaces/[spaceId]/agent/runs
/spaces/[spaceId]/agent/approvals
/spaces/[spaceId]/agent/memory
/spaces/[spaceId]/agent/tools
/spaces/[spaceId]/agent/settings
```

Desktop users should be able to inspect:

* Run status

* Tool calls

* Approval history

* Agent permissions

* Memory sources

* Cost summaries

* Failed workflows

* Audit records

# 5.40 Agent Security Model

## Least Privilege

Each agent receives only the permissions needed for its task.

## Scope Isolation

A personal agent cannot read group data without permission.

A group agent cannot read personal data without permission.

## Tool Allowlist

Only registered tools may execute.

## Approval Boundary

External and high-risk actions require approval.

## Data Minimization

Only relevant context is sent to the model.

## Secret Isolation

API keys and provider credentials must never enter model prompts or graph state.

## Auditability

Every side effect must have a traceable run and tool call.

# 5.41 Agent Failure Handling

## Model Timeout

* Retry only within limits.

* Use fallback model if policy permits.

* Mark the run as incomplete if no response.

* Do not repeat external side effects.

## Tool Failure

* Record error.

* Retry if idempotent.

* Ask the user if manual action is needed.

* Do not claim completion.

## Approval Timeout

* Mark approval expired.

* Do not execute automatically.

* Notify user only according to preferences.

## Context Retrieval Failure

* Continue only if sufficient context remains.

* Clearly state missing information.

* Do not fabricate retrieved data.

## Provider Outage

* Queue or fail gracefully.

* Show current status.

* Preserve user request.

* Avoid repeated rapid retries.

# 5.42 Testing Strategy

## Unit Tests

Test:

* Permission checks

* Tool schemas

* Risk classification

* Memory scope filtering

* Consent checks

* Loop limits

* Cost limits

* Approval expiration

* Idempotency

## Graph Tests

Test:

* Normal completion

* Tool execution

* Multiple tool calls

* Approval pause and resume

* Cancellation

* Timeout

* Failure recovery

* Checkpoint restore

* Maximum iteration handling

## Security Tests

Test:

* Agent accessing another space

* Agent accessing personal memory

* Unauthorized tool call

* Prompt injection from a file

* Approval payload modification

* Replayed approval

* Removed member resuming old run

* Cross-user notification leakage

* External message without consent

## Evaluation Tests

Measure:

* Correct tool selection

* Correct argument generation

* Policy compliance

* Factual grounding
* Error handling and recovery