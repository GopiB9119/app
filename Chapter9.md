# Chapter 9 — Web/Desktop Architecture

## Next.js, TypeScript, Responsive Screens, Shared API Contracts, Realtime WebSockets, Agent Workspace, and Browser Security

## 9.1 Purpose

The web/desktop client provides access to the same community platform through a browser.

It must support:

* Public community discovery

* Public pages and posts

* Private family, couple, solo, and custom spaces

* Real-time conversations

* Agent conversations

* Agent execution status

* Human approvals

* Notifications

* File uploads

* Search

* Moderation

* Account and privacy settings

* Administrative functions

* Responsive desktop, tablet, and mobile browser layouts

The web application must not become a separate backend system. It should use the same API contracts, authorization rules, domain services, and event model as the Android application.

# 9.2 Final Web Architecture Decision

## Recommended stack

|
Layer

|

Technology

|
| --- | --- |
|

Framework

|

Next.js with TypeScript

|
|

Routing

|

Next.js App Router

|
|

UI

|

React

|
|

Styling

|

Tailwind CSS

|
|

Component system

|

Shared internal design system

|
|

Forms

|

React Hook Form

|
|

Validation

|

Zod

|
|

Server data

|

Next.js server-side fetching

|
|

Client data

|

TanStack Query

|
|

Local UI state

|

Zustand or React state

|
|

Realtime

|

WebSocket client

|
|

API contracts

|

OpenAPI-generated types and/or shared schemas

|
|

Authentication

|

Secure HttpOnly cookie session

|
|

Testing

|

Vitest, React Testing Library, Playwright

|
|

Error tracking

|

Sentry or equivalent

|
|

Deployment

|

Docker, CDN, managed platform, or Kubernetes

|
|

File upload

|

Presigned object-storage URLs

|
|

Analytics

|

Privacy-aware product analytics

|

The browser client should communicate with the backend through HTTPS APIs and WebSockets.

```
Browser
   |
   | HTTPS
   v
Next.js Web Application
   |
   | API requests
   v
API Gateway / Backend API
   |
   +--> Identity Service
   +--> Community Service
   +--> Space Service
   +--> Conversation Service
   +--> Agent Runtime
   +--> File Service
   +--> Notification Service
   +--> Search Service
```

The browser must never directly access:

* Database credentials

* Internal service credentials

* Agent provider API keys

* Queue credentials

* Object-storage secret keys

* Internal administrative APIs

* Private service-to-service endpoints

# 9.3 Web Application Responsibilities

The web application is responsible for:

1. Rendering user interfaces

2. Managing browser navigation

3. Displaying server data

4. Managing client-side cache

5. Handling user input

6. Sending authorized API requests

7. Displaying realtime events

8. Managing optimistic UI states

9. Uploading files through controlled flows

10. Displaying agent execution and approval states

11. Enforcing frontend-level UX restrictions

12. Providing accessibility and responsive behavior

The web application is not responsible for final authorization.

Every sensitive operation must be authorized again by the backend.

For example:

```
Frontend:
"Show Approve button"

Backend:
"Is this user allowed to approve this exact agent action?"
```

The frontend controls visibility and usability. The backend controls authority.

# 9.4 Recommended Repository Structure

```
web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── error.tsx
│   ├── not-found.tsx
│   ├── loading.tsx
│   │
│   ├── (public)/
│   │   ├── discover/
│   │   ├── pages/
│   │   ├── posts/
│   │   ├── events/
│   │   └── search/
│   │
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   ├── verify/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   │
│   ├── (protected)/
│   │   ├── home/
│   │   ├── spaces/
│   │   ├── conversations/
│   │   ├── agents/
│   │   ├── notifications/
│   │   ├── files/
│   │   ├── settings/
│   │   └── account/
│   │
│   ├── admin/
│   │   ├── reports/
│   │   ├── moderation/
│   │   ├── users/
│   │   └── audit/
│   │
│   └── api/
│       └── bff/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── navigation/
│   ├── community/
│   ├── spaces/
│   ├── chat/
│   ├── agents/
│   ├── files/
│   ├── notifications/
│   └── moderation/
│
├── features/
│   ├── auth/
│   ├── community/
│   ├── spaces/
│   ├── conversations/
│   ├── agents/
│   ├── notifications/
│   └── files/
│
├── lib/
│   ├── api/
│   ├── auth/
│   ├── websocket/
│   ├── validation/
│   ├── permissions/
│   ├── formatting/
│   └── telemetry/
│
├── hooks/
│   ├── use-current-user.ts
│   ├── use-space.ts
│   ├── use-conversation.ts
│   ├── use-agent-run.ts
│   └── use-realtime.ts
│
├── stores/
│   ├── ui-store.ts
│   ├── composer-store.ts
│   └── notification-store.ts
│
├── types/
│   ├── api.ts
│   ├── community.ts
│   ├── space.ts
│   ├── conversation.ts
│   └── agent.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── public/
├── middleware.ts
├── next.config.ts
├── package.json
└── tsconfig.json
```

The repository should be organized by business capability rather than by random UI files.

# 9.5 Route Architecture

## Public routes

Public routes can be indexed by search engines when visibility permits.

```
/
├── /discover
├── /search
├── /pages/[pageSlug]
├── /pages/[pageSlug]/posts/[postId]
├── /events/[eventSlug]
├── /topics/[topicSlug]
└── /about
```

Public pages must support:

* Server-side rendering

* Metadata

* Open Graph previews

* Canonical URLs

* Structured content where appropriate

* Public visibility checks

* Moderation status

* Deleted or hidden content handling

* Pagination

* Shareable links

A private page must never be accidentally rendered as public content.

## Authenticated routes

```
/app
├── /home
├── /spaces
│   ├── /[spaceId]
│   ├── /[spaceId]/feed
│   ├── /[spaceId]/members
│   ├── /[spaceId]/calendar
│   ├── /[spaceId]/tasks
│   ├── /[spaceId]/files
│   └── /[spaceId]/settings
│
├── /conversations
│   ├── /[conversationId]
│   └── /new
│
├── /agents
│   ├── /[agentId]
│   ├── /[agentId]/runs
│   ├── /[agentId]/memory
│   └── /[agentId]/approvals
│
├── /notifications
├── /files
├── /settings
└── /account
```

The route structure should be understandable to users and stable enough for deep links.

# 9.6 Rendering Strategy

Different pages require different rendering methods.

## Server-side rendering

Use server rendering for:

* Public pages

* Public posts

* Public events

* Search-engine-visible content

* Initial authenticated page shells

* Pages where first-load performance matters

Benefits:

* Better initial loading

* Better SEO

* Smaller client-side JavaScript requirement

* Faster first meaningful content

## Static generation

Use static generation for content that changes infrequently:

* Help pages

* Documentation

* Terms and policies

* Public informational pages

* Marketing content

## Incremental regeneration

Use incremental regeneration for:

* Public community pages

* Public event summaries

* Popular public posts

* Topic pages

Revalidation must not expose private content.

## Client-side rendering

Use client components for:

* Chat

* Typing indicators

* Presence

* Agent streaming

* Live notifications

* Drag-and-drop interfaces

* Rich editors

* Interactive calendars

* File upload progress

* Approval dialogs

* Realtime feeds

A useful rule:

```
Read-heavy public content:
Server-rendered

Realtime and highly interactive content:
Client-rendered

Sensitive operations:
Backend-authorized API mutation
```

# 9.7 Layout Architecture

The application should use nested layouts.

```
Root Layout
   |
   +--> Theme Provider
   +--> Global Error Boundary
   +--> Accessibility Skip Link
   +--> Global Notification Layer
   |
   +--> Public Layout
   |      |
   |      +--> Public Navigation
   |      +--> Public Content
   |
   +--> Protected Layout
          |
          +--> Authenticated Navigation
          +--> Workspace Shell
          +--> Realtime Provider
          +--> Notification Center
          +--> Protected Content
```

## Desktop workspace shell

```
┌──────────────────────────────────────────────────────┐
│ Top Bar: Search | Notifications | Account            │
├───────────────┬───────────────────────┬──────────────┤
│ Left Sidebar  │ Main Content          │ Right Panel  │
│               │                       │              │
│ Home          │ Feed / Chat / Agent   │ Members      │
│ Spaces        │ Workspace             │ Details      │
│ Conversations │                       │ Activity     │
│ Agents        │                       │              │
│ Files         │                       │              │
└───────────────┴───────────────────────┴──────────────┘
```

## Responsive behavior

On smaller screens:

```
Desktop:
Three-column workspace

Tablet:
Two-column workspace

Mobile browser:
Single-column layout
Bottom navigation or collapsible navigation
Panels become sheets or dialogs
```

The design must not depend on hover. Every important action must work through click, tap, keyboard, or accessible controls.

# 9.8 Shared Design System

The web and Android clients should use a common design language, even if their implementations differ.

Shared concepts include:

* Color semantics

* Typography hierarchy

* Spacing scale

* Border radius

* Icon meaning

* Status colors

* Error presentation

* Loading states

* Empty states

* Confirmation patterns

* Permission states

* Agent status indicators

Example status model:

|
Status

|

Meaning

|
| --- | --- |
|

`idle`

|

No active operation

|
|

`queued`

|

Waiting for execution

|
|

`running`

|

Currently executing

|
|

`waiting_approval`

|

Human decision required

|
|

`paused`

|

Temporarily stopped

|
|

`completed`

|

Successfully finished

|
|

`failed`

|

Execution failed

|
|

`cancelled`

|

User or system cancelled

|
|

`expired`

|

No longer actionable

|

The same status names should be used by:

* Backend

* Android

* Web

* Notifications

* Audit logs

* Analytics

# 9.9 Authentication and Session Management

## Recommended model

Use secure server-managed sessions with:

* Secure cookies

* HttpOnly cookies

* SameSite protection

* Short-lived access sessions

* Refresh or session rotation

* Server-side session revocation

* Device/session management

* Login activity records

Avoid storing long-lived authentication tokens in:

```
localStorage
sessionStorage
URL query parameters
browser-visible JavaScript variables
```

## Browser authentication flow

```
1. User opens login page
2. User submits credentials
3. Backend validates credentials
4. Backend creates session
5. Backend sets Secure + HttpOnly cookie
6. Browser redirects to protected area
7. Server validates session on protected requests
8. Backend rechecks authorization for every sensitive action
```

## Middleware responsibilities

Middleware may:

* Detect whether a session exists

* Redirect unauthenticated users

* Protect route groups

* Handle locale routing

* Add request correlation identifiers

* Prevent access to clearly protected paths

Middleware must not be treated as the only security boundary.

# 9.10 Backend-for-Frontend Pattern

A Backend-for-Frontend, or BFF, can be used for browser-specific concerns.

```
Browser
   |
   v
Next.js BFF
   |
   v
Backend API
```

The BFF can handle:

* Cookie-based authentication

* CSRF protection

* Request normalization

* Response shaping

* Browser-specific caching

* API aggregation

* Hiding internal service URLs

* Attaching correlation IDs

The BFF must not duplicate business authorization logic.

For larger systems, direct browser-to-API communication can be acceptable if:

* CORS is configured correctly

* Cookies are secure

* CSRF is handled

* API contracts are stable

* The API gateway is publicly exposed safely

# 9.11 Shared API Contracts

Android and web must use the same backend contract.

## Recommended approach

Define APIs using OpenAPI.

```
Backend API
   |
   +--> OpenAPI specification
           |
           +--> TypeScript client/types
           +--> Kotlin client/types
           +--> API documentation
           +--> Contract tests
```

Possible contract layers:

1. OpenAPI for HTTP endpoints

2. Protobuf for gRPC

3. Shared event schema for WebSocket events

4. JSON Schema for agent tool inputs and outputs

5. Zod schemas for frontend runtime validation

## Standard response envelope

JSON

```
{
  "data": {},
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-09-18T12:00:00Z"
  },
  "error": null
}
```

Error example:

JSON

```
{
  "data": null,
  "meta": {
    "request_id": "req_123"
  },
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You cannot access this resource.",
    "details": {}
  }
}
```

The frontend should use stable error codes rather than matching human-readable messages.

# 9.12 API Client Layer

Do not call `fetch()` randomly from every component.

Use a central API client.

```
components
   |
   v
feature hooks
   |
   v
API client
   |
   v
BFF or backend API
```

Example structure:

```
lib/api/
├── client.ts
├── errors.ts
├── auth-api.ts
├── community-api.ts
├── space-api.ts
├── conversation-api.ts
├── agent-api.ts
├── file-api.ts
└── notification-api.ts
```

The API client should support:

* Request IDs

* Timeouts

* Abort signals

* Standard error parsing

* Authentication handling

* Retry policy

* Idempotency keys

* Pagination

* File upload preparation

* Telemetry hooks

Do not automatically retry every mutation.

Safe retry candidates:

* Idempotent GET requests

* Read-only metadata requests

* Certain explicitly idempotent operations

Unsafe automatic retry candidates:

* Sending messages

* Creating payments

* Approving agent actions

* Sending external notifications

* Deleting data

# 9.13 Data Fetching and Client Cache

## Recommended division

### Next.js server fetching

Use for:

* Public page data

* Initial route data

* SEO-visible content

* Initial authenticated shell data

* Data that does not require continuous updates

### TanStack Query

Use for:

* Chat data

* Infinite feeds

* Notifications

* Agent runs

* Members

* Calendar data

* Mutations

* Realtime cache updates

* Background refetching

### Local state

Use React state or Zustand for:

* Modal visibility

* Selected tab

* Composer draft

* Sidebar state

* Temporary filters

* Unsaved form values

* UI preferences

Do not place all server data into a global state store.

# 9.14 Cache Rules

Every resource needs a defined cache policy.

|
Resource

|

Cache policy

|
| --- | --- |
|

Public page metadata

|

Cacheable

|
|

Public post list

|

Short-lived cache

|
|

Private messages

|

User-scoped, never shared

|
|

Agent run status

|

Short cache plus WebSocket

|
|

Member permissions

|

Short-lived, invalidate on changes

|
|

Notifications

|

User-scoped

|
|

File metadata

|

Permission-scoped

|
|

Account data

|

User-scoped, no public cache

|
|

Moderation decisions

|

Restricted, short-lived

|

Never cache private content in a shared CDN cache.

Cache keys must include the correct identity and permission context where required.

# 9.15 Realtime WebSocket Architecture

The web client needs one controlled realtime connection per authenticated browser session or workspace.

```
WebSocket Manager
   |
   +--> Conversation events
   +--> Message events
   +--> Typing events
   +--> Presence events
   +--> Agent events
   +--> Notification events
   +--> Membership events
   +--> Moderation events
```

## Event envelope

JSON

```
{
  "event_id": "evt_123",
  "event_type": "agent.run.updated",
  "version": 1,
  "sequence": 481,
  "occurred_at": "2026-09-18T12:00:00Z",
  "scope": {
    "space_id": "space_123",
    "conversation_id": "conv_123"
  },
  "data": {}
}
```

## WebSocket lifecycle

```
CONNECTING
   |
CONNECTED
   |
AUTHENTICATED
   |
SUBSCRIBED
   |
RECEIVING_EVENTS
   |
RECONNECTING
   |
RESYNC_REQUIRED
```

The browser must not assume that a WebSocket connection guarantees delivery.

## Reconnection algorithm

When disconnected:

1. Mark connection as offline

2. Stop sending realtime-dependent actions

3. Retry with exponential backoff

4. Reauthenticate if required

5. Send the last received sequence number

6. Request missed events or a fresh snapshot

7. Reconcile local cache

8. Mark connection as synchronized

   Last received sequence: 481

   Reconnect request:
   "Give events after sequence 481"

   Server:

   * Returns events 482–490
   * Or responds RESYNC_REQUIRED

   Client:

   * Applies events
   * Or downloads a fresh snapshot

The system must protect against:

* Duplicate events

* Out-of-order events

* Expired subscriptions

* Permission changes

* Stale browser tabs

* Multiple active connections

# 9.16 Chat Interface Architecture

The chat interface is a high-frequency component and requires special treatment.

## Chat screen structure

```
Conversation Screen
├── Header
│   ├── Conversation name
│   ├── Members
│   ├── Security indicator
│   └── Conversation actions
│
├── Message Timeline
│   ├── Date separators
│   ├── Text messages
│   ├── Media messages
│   ├── Files
│   ├── Agent messages
│   ├── System messages
│   └── Failed messages
│
├── Typing / Agent Status
│
└── Composer
    ├── Text input
    ├── Attachments
    ├── Mention support
    ├── Agent command support
    └── Send button
```

## Message states

```
LOCAL_DRAFT
   |
PENDING
   |
SENDING
   |
SENT
   |
DELIVERED
   |
READ
```

Failure states:

```
FAILED_RETRYABLE
FAILED_PERMANENT
BLOCKED_PERMISSION
CANCELLED
```

The UI must distinguish:

* Message accepted by the browser

* Message accepted by the backend

* Message delivered to recipients

* Message read by recipients

* Agent processing started

* Agent processing completed

These are different events.

## Optimistic message handling

When the user sends a message:

```
1. Generate client_message_id
2. Render message locally as PENDING
3. Send API request with idempotency key
4. Backend accepts or rejects message
5. Replace temporary message with canonical message
6. Reconcile through realtime event
```

Example:

JSON

```
{
  "client_message_id": "client_msg_123",
  "conversation_id": "conv_123",
  "body": "Hello",
  "idempotency_key": "idem_123"
}
```

The backend must deduplicate repeated submissions.

# 9.17 Agent Workspace

The agent workspace should not look like a normal chat screen only.

It must expose execution state and user control.

## Agent workspace layout

```
┌──────────────────────────────────────────────────────┐
│ Agent Header                                         │
│ Name | Scope | Status | Permissions                  │
├───────────────────────┬──────────────────────────────┤
│ Conversation          │ Execution Details             │
│                       │                              │
│ User messages         │ Current run                   │
│ Agent responses       │ Steps                         │
│ Tool results          │ Waiting approval              │
│ Clarifications        │ Evidence                      │
│                       │ Errors                        │
├───────────────────────┴──────────────────────────────┤
│ Composer / Command / Approval Actions                │
└──────────────────────────────────────────────────────┘
```

## Agent screens

### Agent home

Displays:

* Available agents

* Agent purpose

* Authorized spaces

* Recent activity

* Current status

* Pending approvals

* Last completed tasks

### Agent conversation

Displays:

* User request

* Agent response

* Clarifying questions

* Tool activity summaries

* Evidence references

* Approval requests

* Final result

### Agent run details

Displays:

* Run ID

* Start time

* Current state

* Graph node

* Current step

* Previous steps

* Tool calls

* Tool results

* Retry count

* Token/cost information where permitted

* Failure reason

* Cancellation control

### Approval screen

Displays:

* Requested action

* Target

* Data to be sent

* External recipient

* Schedule

* Side effects

* Risk level

* Approve

* Reject

* Edit

* Approve once

* Approve future similar actions, if supported

### Memory screen

Displays:

* Stored preferences

* Memory source

* Creation date

* Scope

* User visibility

* Edit action

* Delete action

* Expiration status

Sensitive memory must not be displayed to users without authorization.

# 9.18 Agent Execution UI States

The frontend must represent the complete lifecycle.

```
IDLE
QUEUED
PLANNING
EXECUTING
WAITING_FOR_TOOL
WAITING_FOR_APPROVAL
WAITING_FOR_USER
RETRYING
COMPLETED
FAILED
CANCELLED
```

Example UI:

```
Planning request
      ↓
Checking calendar permissions
      ↓
Waiting for your approval
      ↓
Sending notification
      ↓
Completed
```

Do not display fabricated progress.

The backend should emit actual state transitions. The frontend should render those events.

# 9.19 Agent Streaming

Agent streaming may include:

* Partial text

* Status updates

* Tool execution summaries

* Approval requests

* Final structured results

The system should not stream raw internal reasoning or private chain-of-thought content.

Safe streamed content includes:

```
"Checking the group calendar"
"Found three available time slots"
"Waiting for approval before sending invitations"
```

The frontend should support:

* Stream cancellation

* Reconnection

* Partial-result recovery

* Final-result replacement

* Duplicate event handling

* Run expiration

* Error display

# 9.20 Community Feed Architecture

The feed may contain:

* Text posts

* Images

* Videos

* Files

* Polls

* Events

* Announcements

* Agent-generated summaries

* Moderation notices

* Shared tasks

* Cost calculations

## Feed requirements

* Cursor pagination

* Stable ordering

* Pull-to-refresh equivalent

* Infinite scroll

* Skeleton loading

* Empty state

* Deleted content placeholders

* Permission-aware rendering

* Report and block actions

* Optimistic reactions

* Duplicate prevention

* Realtime insertion handling

## Feed insertion problem

When a new post arrives through WebSocket, do not automatically insert it into the middle of the user’s current reading position.

Use:

```
"3 new posts"
```

Then allow the user to load them.

This prevents the feed from jumping while the user is reading.

# 9.21 Space Architecture

Family, couple, solo, and custom spaces should share a common web shell.

```
SpaceShell
├── SpaceHeader
├── SpaceNavigation
├── SpaceOverview
├── SpaceFeed
├── SpaceMembers
├── SpaceCalendar
├── SpaceTasks
├── SpaceFiles
├── SpaceConversations
├── SpaceAgent
└── SpaceSettings
```

The available tabs should be driven by backend configuration and permissions.

Example:

JSON

```
{
  "space_id": "space_123",
  "space_type": "family",
  "features": {
    "feed": true,
    "calendar": true,
    "tasks": true,
    "files": true,
    "agent": true,
    "finance": false
  },
  "permissions": {
    "can_invite": true,
    "can_manage_members": false,
    "can_approve_agent_actions": true
  }
}
```

The frontend should not infer permissions solely from `space_type`.

A family space may have different permissions from another family space.

# 9.22 File Upload Architecture

Files should not be uploaded through the main API server when large uploads are expected.

## Recommended flow

```
1. Browser requests upload session
2. Backend validates permission and metadata
3. Backend returns presigned upload URL
4. Browser uploads directly to object storage
5. Object storage confirms upload
6. Browser calls complete-upload endpoint
7. Backend scans and validates file
8. File becomes available

Browser
   |
   | Request upload
   v
File Service
   |
   | Presigned URL
   v
Object Storage
```

## Upload states

```
SELECTED
VALIDATING
PREPARING
UPLOADING
UPLOADED
SCANNING
READY
REJECTED
FAILED
```

## Client-side checks

The browser may check:

* File size

* Filename length

* Extension

* Declared MIME type

* Number of files

* Duplicate selection

The backend must independently check:

* Actual file type

* File size

* Malware status

* Content policy

* Ownership

* Space permission

* Upload expiry

* File hash

* Processing status

Never trust browser-provided MIME types.

# 9.23 Browser Security

## XSS protection

Use:

* React escaping by default

* Strict HTML sanitization for rich content

* Trusted sanitization library

* Content Security Policy

* No unsafe HTML rendering unless necessary

* Safe Markdown rendering

* URL scheme validation

Reject dangerous schemes such as:

```
javascript:
data:
vbscript:
```

unless explicitly supported and safely handled.

## CSRF protection

For cookie-authenticated APIs, use:

* SameSite cookies

* CSRF tokens where needed

* Origin validation

* Referer validation where appropriate

* Strict mutation handling

All state-changing requests must be protected.

## Content Security Policy

A suitable CSP should restrict:

* Script sources

* Frame sources

* Image sources

* Connect sources

* Object sources

* Form destinations

* Base URL behavior

Avoid broad policies such as:

```
script-src *
```

Do not add `unsafe-eval` unless there is a documented requirement.

## Clickjacking protection

Use:

* `frame-ancestors`

* `X-Frame-Options` where appropriate

* Secure embedding policies

* Explicit allowlists for trusted integrations

## Open redirect protection

Do not blindly redirect to a user-supplied URL.

Unsafe:

```
/login?next=https://malicious.example
```

Safe approach:

* Allow only internal paths

* Validate origin

* Reject protocol-relative URLs

* Reject external schemes

* Use an allowlist

## Sensitive data exposure

Do not expose:

* Private messages in page source when unnecessary

* Internal IDs unnecessarily

* Access tokens

* Agent provider prompts

* Tool credentials

* Private memory

* Internal error stack traces

* Database details

* Internal network addresses

Use public identifiers where appropriate, but do not assume an opaque ID replaces authorization.

# 9.24 Permission-Aware UI

The frontend should consume explicit permissions from the backend.

Example:

JSON

```
{
  "permissions": {
    "can_view": true,
    "can_post": true,
    "can_comment": true,
    "can_invite": false,
    "can_manage_members": false,
    "can_approve_agent_actions": true,
    "can_view_memory": true
  }
}
```

Use permissions to:

* Show or hide controls

* Disable unavailable actions

* Explain restrictions

* Avoid confusing failed interactions

However:

```
Hidden button ≠ security
```

The backend must still reject unauthorized requests.

# 9.25 Loading, Error, and Empty States

Every major screen requires explicit states.

## Loading

Use:

* Skeletons

* Progress indicators

* Preserved layout dimensions

* Streaming placeholders

Avoid blank screens.

## Empty

Examples:

* No spaces yet

* No conversations

* No notifications

* No files

* No agent runs

* No search results

* No pending approvals

An empty state should explain the next action.

## Error

Display:

* What failed

* Whether the action may be retried

* Whether data may be stale

* A retry control

* A support/reference ID when useful

Example:

```
The conversation could not be loaded.

Your connection may have been interrupted.
Retry
```

Do not display raw stack traces to users.

# 9.26 Performance Architecture

## Performance priorities

1. Fast initial rendering

2. Small JavaScript bundles

3. Efficient navigation

4. Smooth scrolling

5. Low memory usage

6. Fast chat interaction

7. Realtime stability

8. Efficient file uploads

## Techniques

* Server-render public content

* Use dynamic imports for heavy components

* Lazy-load editors and calendars

* Virtualize long message lists

* Virtualize large feeds

* Compress images

* Use responsive image sizes

* Avoid unnecessary global state updates

* Debounce search

* Cancel stale requests

* Paginate all large collections

* Use cursor-based pagination

* Cache stable public data

* Avoid rendering hidden panels unnecessarily

## Performance budgets

Set measurable limits such as:

```
Initial route JavaScript: defined budget
Largest feed render: defined budget
Chat scroll frame rate: target 60 FPS where practical
Search debounce: approximately 200–300 ms
Maximum messages rendered at once: bounded
Maximum feed page size: bounded
```

The exact values should be measured against real devices and network conditions.

# 9.27 Accessibility

The web client must support:

* Keyboard navigation

* Visible focus indicators

* Screen readers

* Semantic HTML

* Accessible dialogs

* Proper form labels

* Error announcements

* Reduced motion

* Sufficient contrast

* Text resizing

* Captions for video

* Alternative text for meaningful images

* Accessible status updates

* Focus restoration after dialogs

* Logical heading hierarchy

Chat-specific accessibility:

* Announce new messages without interrupting typing

* Allow users to pause live announcements

* Provide readable timestamps

* Make message actions keyboard accessible

* Provide text alternatives for attachments

* Ensure agent status changes are announced appropriately

# 9.28 Internationalization

The web client should support:

* Multiple languages

* Locale-aware dates

* Locale-aware numbers

* Time zones

* Right-to-left layouts where required

* Localized validation messages

* Pluralization

* Accessible translated labels

Never store only formatted display strings as the source of truth.

Store canonical values:

JSON

```
{
  "created_at": "2026-09-18T12:00:00Z",
  "amount_minor": 125000,
  "currency": "INR"
}
```

Format them according to the user’s locale and timezone.

# 9.29 Notifications

The notification center should combine:

* Direct messages

* Mentions

* Space invitations

* Agent approval requests

* Agent completion notices

* Calendar reminders

* Task reminders

* Moderation actions

* Security alerts

Notification records should contain:

JSON

```
{
  "notification_id": "notif_123",
  "type": "agent.approval_required",
  "title": "Approval required",
  "body": "An agent wants to send a message.",
  "resource": {
    "type": "agent_run",
    "id": "run_123"
  },
  "read_at": null,
  "created_at": "2026-09-18T12:00:00Z"
}
```

The notification should deep-link to the correct screen.

# 9.30 Observability

The web client should produce structured telemetry without collecting unnecessary private content.

Track:

* Route performance

* API latency

* WebSocket connection status

* Reconnection count

* Error rate

* Upload failures

* Agent UI failures

* Search latency

* Feature usage

* Browser/device category

* Correlation IDs

Avoid collecting:

* Full private message bodies

* Private files

* Sensitive memory

* Authentication tokens

* Passwords

* Unredacted personal data

Every request should carry a correlation ID where practical.

```
Browser request ID
   |
   v
API request ID
   |
   v
Service trace ID
   |
   v
Agent run ID
   |
   v
Tool execution ID
```

This allows a failed action to be traced across the complete system.

# 9.31 Testing Strategy

## Unit tests

Test:

* Formatting functions

* Permission helpers

* Validation schemas

* API error mapping

* State transitions

* Message reducers

* WebSocket event handling

* Agent status mapping

## Component tests

Test:

* Chat composer

* Message rendering

* Approval dialog

* Space navigation

* Feed cards

* File upload component

* Notification center

* Permission-aware controls

## Integration tests

Test:

* Login flow

* API client behavior

* Cache invalidation

* WebSocket synchronization

* Optimistic message reconciliation

* Agent run updates

* File upload completion

## End-to-end tests

Use Playwright for:

* Registration

* Login

* Public page browsing

* Creating a space

* Inviting members

* Sending messages

* Uploading files

* Starting an agent run

* Approving an action

* Rejecting an action

* Reconnecting after network loss

* Permission denial

* Account logout

## Security tests

Test:

* Unauthorized route access

* Cross-space access

* IDOR attempts

* CSRF

* XSS

* Open redirects

* Malicious filenames

* Oversized uploads

* Expired sessions

* Revoked sessions

* Stale permission states

# 9.32 Deployment Architecture

## Basic deployment

```
CDN / Edge
   |
   v
Next.js Web Application
   |
   +--> API Gateway
   +--> WebSocket Gateway
   +--> Object Storage
```

## Container deployment

```
Docker Image
   |
   v
Web Runtime
   |
   +--> Health endpoint
   +--> Readiness endpoint
   +--> Structured logs
   +--> Metrics
```

Environment variables may include:

```
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_WS_BASE_URL
NEXT_PUBLIC_APP_ENV
NEXT_PUBLIC_ANALYTICS_ENABLED
SENTRY_DSN
```

Only variables explicitly intended for the browser may use the `NEXT_PUBLIC_` prefix.

Never expose secrets through public environment variables.

# 9.33 CI/CD Pipeline

```
Pull Request
   |
   +--> Type checking
   +--> Linting
   +--> Unit tests
   +--> Component tests
   +--> Build
   +--> Security scan
   +--> Dependency scan
   |
   v
Preview Deployment
   |
   v
Integration Tests
   |
   v
Production Approval
   |
   v
Production Deployment
```

Deployment should include:

* Immutable build artifacts

* Versioned releases

* Rollback support

* Environment separation

* Secret management

* Build provenance

* Error monitoring

* Smoke tests

* Health checks

Database migrations must not be coupled blindly to frontend deployment.

# 9.34 Browser Offline Strategy

The browser can support limited offline behavior.

Useful offline features:

* Preserve unsent message drafts

* Display cached public content

* Display recently opened conversations

* Queue safe drafts

* Show offline status

* Retry uploads where supported

Do not automatically queue sensitive or irreversible operations without explicit user control.

Examples requiring caution:

* Agent approvals

* External messages

* Deletions

* Invitations

* Financial actions

* Medication-related notifications

* Calendar changes

The UI must clearly distinguish:

```
Saved locally
Not yet sent
Sent to server
Completed
```

# 9.35 Final Web Architecture

```
Next.js App Router
   |
   +--> Public Server-Rendered Pages
   |
   +--> Protected Workspace
   |      |
   |      +--> TanStack Query
   |      +--> WebSocket Manager
   |      +--> Local UI State
   |      +--> Shared API Client
   |
   +--> Agent Workspace
   |      |
   |      +--> Run Timeline
   |      +--> Approval UI
   |      +--> Tool Status
   |      +--> Memory UI
   |      +--> Evidence UI
   |
   +--> Community UI
   |      |
   |      +--> Public Pages
   |      +--> Private Spaces
   |      +--> Feed
   |      +--> Members
   |      +--> Events
   |
   +--> Secure File Upload
   |
   +--> Browser Security Layer
   |
   +--> Observability and Testing
```

# 9.36 Chapter 9 Acceptance Criteria

Chapter 9 is complete when:

* Public pages can be server-rendered

* Private content is permission-protected

* Authentication uses secure sessions

* No secrets are exposed to the browser

* Web and Android use the same API contracts

* WebSocket reconnect and resynchronization work

* Chat supports pending, sent, failed, and delivered states

* Agent runs show real execution states

* Approval actions require backend authorization

* Spaces use a shared configurable shell

* File uploads use controlled object-storage flows

* Browser security headers are configured

* XSS and CSRF protections are tested

* Large feeds and conversations are virtualized or paginated

* Accessibility requirements are tested

* E2E tests cover critical workflows

* Deployment supports rollback and observability

# 9.37 Final Decision

Use:

```
Next.js + TypeScript
React Server Components where appropriate
Client Components for realtime interactions
TanStack Query for server state
Zustand or local React state for UI state
WebSockets for realtime events
OpenAPI for HTTP contracts
Zod for runtime validation
Secure HttpOnly cookie sessions
Presigned object-storage uploads
Playwright for end-to-end testing
Docker for deployment
```

The web client should remain a thin, secure, responsive interface over the shared platform backend.

It must not create a second version of the business logic.

