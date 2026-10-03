# Community Platform — Complete Product & Engineering Blueprint

From idea → product specification → system architecture → developer tasks → runnable MVP → production platform

Gopi, your goal is not to build another social media app with a chatbot. You want to build a platform that helps people organize their communities, private relationships, family responsibilities, schedules, and everyday tasks—with an agent that can assist them across those contexts.

The right way to build this is to treat it as a serious product and engineering program, not a collection of screens and AI prompts.

This blueprint combines your community platform idea, family and couple groups, public pages, real-time messaging, agent orchestration, reminders, and the engineering stack you selected.

## 1. The product we are building

![Vibin' - Social Networking App UI/UX Animation 📱 by Orely on Dribbble](https://images.openai.com/static-rsc-4/8rzCR92QnxzrEOLPxsyTKAqgpSNqauXLh3VURHsljPqb8xBTl9UpwwUJsWpkv9vcE1uz0lNkju1QWJM79EWAQs7eIpRpVlGn-Ey8SjHmoKf_7GoBIcbM0y8KY8sb-bQiHJZoYGb1XSwWkmr5Zzs4RwrpD0pbdLg5n-hknBS10Dw?purpose=inline)

![Spacetalk App | | location tracking app | family monitoring app](https://images.openai.com/static-rsc-4/lIQKyaBn5wdI4Q0oL0Csq8tJpPHTCOwd6rNNZv_0pxI7ZTMon17NoD03DN30gDIuQJ3NATU4FKaqs5hUi6jGPXLa8vpAdK99ZJJSwQmLCyBKZhTY8cvH4ts9Q-IlEA9oYRvXSBlAiM_lD33fGuIzqDqCUS5e5XI8JELPR9tIGHY?purpose=inline)

![Smart Planner UI – Your Schedule, Upgraded by AI by Sunmait - UX UI Team on Dribbble](https://images.openai.com/static-rsc-4/24e_A51X97osbJTl1CIfXndE_pefBy3ohuKrbcWIaR4ICWgROAZ2lrM46V5b9-GJITJdX73ObytW-XHAWMNgcvsbY2_ckebuNScCQ4qlQ7EecCiE9u3db9opUvKvreSpS8cyQiy8Wkcicl5f952LK0Nscof_4Zy8k76SiVVJCDs?purpose=inline)

6

Product foundation

# A community and personal assistance platform

A single application with public communities, private spaces, real-time conversations, and context-aware agents that help people complete tasks.

Public community

Pages, posts, discovery, follows, comments, events.

Private spaces

Family, couples, solo, and custom groups.

AI assistance

Planning, memory, research, reminders, and tools.

Connected communication

In-app chat, notifications, and approved external messaging.

### Core product principle

> People own their data, groups, decisions, and actions. Agents assist; they do not silently take control.

This principle affects the database, UI, permissions, AI architecture, security, and every developer task.

## 2. Important architecture decisions before writing code

These are the decisions that should be locked before a large team starts implementation.

|
Area

|

Decision

|
| --- | --- |
|

Android

|

Kotlin + Jetpack Compose

|
|

Web

|

Next.js + TypeScript

|
|

Backend

|

Python + FastAPI

|
|

Primary database

|

PostgreSQL

|
|

Cache / coordination

|

Redis

|
|

Files

|

S3-compatible object storage

|
|

Realtime

|

WebSocket

|
|

Client API

|

REST

|
|

Internal communication

|

REST initially; gRPC for selected services

|
|

Agent orchestration

|

LangGraph

|
|

Local development

|

Docker Compose

|
|

Deployment

|

Containerized cloud infrastructure

|
|

Observability

|

Structured logs, metrics, traces

|
|

AI provider

|

Pluggable provider interface

|
|

Architecture

|

Modular monolith first, extract services when justified

|

### The most important decision: modular monolith first

Do not begin with 20 microservices, 15 databases, and a distributed agent cluster.

Start with one backend application containing clearly separated domain modules:

```
Client Applications
       │
       ▼
API / WebSocket Gateway
       │
       ▼
FastAPI Application
       │
       ├── Identity
       ├── Community
       ├── Pages & Posts
       ├── Groups & Membership
       ├── Messaging
       ├── Notifications
       ├── Scheduling
       ├── Agent Runtime
       ├── Memory
       └── Moderation
       │
       ├── PostgreSQL
       ├── Redis
       ├── Object Storage
       └── Background Workers
```

Why this is the starting point:

* Easier local development and debugging.

* Strong database transactions.

* Fewer deployment failures.

* Lower infrastructure cost.

* Clear domain boundaries that can later become services.

Do not confuse modular monolith with unstructured code. It must have strict module ownership, interfaces, tests, and database migration rules from day one.


# Part I — Product architecture

## 3. Product modules: complete inventory

The platform should be divided into product modules. Each module has its own purpose, screens, backend responsibilities, data, agent permissions, and acceptance criteria.

### A. Global Community

Public pages, posts, discovery, follows, comments, likes, shares, events, moderation.

### B. Private Spaces

Family, couples, solo, custom groups, invitations, membership, privacy.

### C. Messaging

Direct chat, group chat, agent chat, delivery, read receipts, presence, sync.

### D. Planning and Tasks

Events, reminders, schedules, appointments, tasks, recurrence, acknowledgements.

### E. Agent System

Conversation, planning, tools, memory, research, safety, evaluations.

### F. Trust and Operations

Identity, permissions, moderation, privacy, audit, security, monitoring, administration.

### What is core, and what is not?

A professional product team must distinguish the core product from future expansion.

|
Priority

|

Features

|
| --- | --- |
|

MVP core

|

Account, profile, public pages, posts, private family group, membership, group chat, basic agent chat, tasks, reminders, notifications

|
|

MVP supporting

|

Search, comments, likes, settings, audit logs, basic moderation, retry and offline handling

|
|

Phase 2

|

Couples and solo spaces, custom groups, calendar integrations, richer discovery, memory retrieval, advanced agent tools

|
|

Phase 3

|

External messaging integrations, voice workflows, advanced research, multi-language agent interaction, larger-scale infrastructure

|
|

Later

|

Marketplace, payments, complex health integrations, enterprise communities, advanced recommendation systems

|

Important: WhatsApp calling, automated medication management, unrestricted internet research, and fully autonomous agent actions should not be treated as simple MVP checkboxes. They require separate technical and safety validation.

# 4. Product requirements document (PRD)

Every feature needs a structured specification before developers implement it.

## Example: Create a family group

### User story

As a user, I want to create a private family group so that invited family members can communicate and coordinate tasks with assistance from an agent.

### Acceptance criteria

* A signed-in user can create a family group.

* The group has a unique identifier.

* The creator becomes the owner and admin.

* The user can provide a group name and description.

* The group starts private.

* The creator can invite members.

* The creator can configure agent permissions.

* Only authorized members can read private group content.

* All successful and failed operations have visible UI states.

* The backend validates authorization independently of the UI.

### Nonfunctional requirements

* All writes are authenticated.

* Membership changes are transactional.

* Duplicate invitations are handled safely.

* Every important action is auditable.

* No sensitive data is exposed in logs.

* Client retries do not create duplicate groups.

### Developer deliverables

1. API contract.

2. Database migration.

3. Backend service implementation.

4. Android screens.

5. Web screens.

6. Unit and integration tests.

7. Security tests.

8. API documentation.

9. Demo instructions.

10. Known limitations.

This is the style of work that scales. A developer should never receive only “build family groups.”

# Part II — UI/UX master plan

## 5. UX architecture

The user needs to understand three distinct contexts:

1. Discover — What is happening in the public community?

2. Connect — Where are my family, couple, solo, or custom spaces?

3. Assist — What can my agent help me do?

These should not be mixed into one confusing screen.

## Android navigation

App launch

Authentication

Welcome → Login → Register → Verification

Main application shell

Home · Discover · Spaces · Inbox · Profile

Home

Feed, updates, quick actions

Discover

Pages, search, events

Spaces

Family, couples, solo, custom

Inbox

Chats and notifications

Context detail

Page detail · Group detail · Chat · Agent workspace · Task detail

### Primary Android screen inventory

|
Screen

|

Responsibilities

|
| --- | --- |
|

Welcome

|

Product introduction, sign in, registration

|
|

Login / Register

|

Authentication and account setup

|
|

Home

|

Personalized feed and shortcuts

|
|

Discover

|

Search and discover public pages

|
|

Page detail

|

Header, posts, follow, join, events

|
|

Create page

|

Name, type, description, visibility

|
|

Create post

|

Text, images, audience, publishing

|
|

Comments

|

Threaded discussion, reactions, moderation

|
|

Spaces

|

List of private groups and solo space

|
|

Create family group

|

Name, members, privacy, agent settings

|
|

Group detail

|

Members, tasks, chat, settings

|
|

Member management

|

Invitations, roles, removal

|
|

Group chat

|

Messages, attachments, replies

|
|

Agent chat

|

Conversation, tools, approvals, sources

|
|

Task / Reminder

|

Schedule, assignee, status, recurrence

|
|

Notifications

|

Push and in-app events

|
|

Profile

|

Identity, activity, settings

|
|

Privacy settings

|

Visibility, consent, retention, deletion

|

## UI state contract

Every important screen must handle:

Loading

Skeleton state

Show layout placeholders, not a blank screen.

Empty

Useful next action

Explain what is missing and how to create it.

Error

Recovery path

Explain failure, retry safely, preserve user input.

Success

Confirmation

Show updated state and what happens next.

### UI/UX design rules

* Use one clear primary action per screen.

* Do not hide important privacy controls.

* Never place an agent action behind ambiguous wording.

* Confirm destructive actions.

* Preserve unsent messages and unsaved forms.

* Support accessibility labels, text scaling, and sufficient contrast.

* Use consistent spacing, typography, buttons, cards, dialogs, and navigation.

* Test the flow with real users before polishing animations.

# 6. Design system

The UI/UX team should build a reusable component library in Figma and implement it in both Android and web.

## Visual foundation

|
Token

|

Recommendation

|
| --- | --- |
|

Typography

|

Inter or a similar readable system

|
|

Mobile spacing

|

4dp base scale

|
|

Web spacing

|

4px base scale

|
|

Border radius

|

Consistent small, medium, large tokens

|
|

Colors

|

Semantic tokens: primary, surface, danger, success, warning

|
|

Icons

|

One coherent icon family

|
|

Motion

|

Short, purposeful, reduced-motion support

|
|

Dark mode

|

Designed from the start

|
|

Accessibility

|

WCAG-informed contrast and interaction sizing

|

### Component ownership

* `Button`

* `TextField`

* `Avatar`

* `PageCard`

* `PostCard`

* `GroupCard`

* `MessageBubble`

* `Composer`

* `AgentActionCard`

* `ApprovalDialog`

* `TaskCard`

* `ReminderCard`

* `NotificationItem`

* `MemberList`

* `PermissionSelector`

Do not implement the same component independently 20 times.

# Part III — Backend production architecture

## 7. Backend module structure

```
backend/
├── pyproject.toml
├── Dockerfile
├── alembic.ini
├── migrations/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── api/
│   │   ├── router.py
│   │   └── deps.py
│   ├── core/
│   │   ├── errors.py
│   │   ├── security.py
│   │   ├── logging.py
│   │   └── idempotency.py
│   ├── modules/
│   │   ├── identity/
│   │   ├── community/
│   │   ├── pages/
│   │   ├── posts/
│   │   ├── groups/
│   │   ├── messaging/
│   │   ├── notifications/
│   │   ├── scheduling/
│   │   ├── agents/
│   │   ├── memory/
│   │   └── moderation/
│   ├── infrastructure/
│   │   ├── postgres.py
│   │   ├── redis.py
│   │   ├── storage.py
│   │   ├── events.py
│   │   └── external_providers/
│   └── workers/
│       ├── notifications.py
│       ├── scheduled_tasks.py
│       └── agent_jobs.py
└── tests/
    ├── unit/
    ├── integration/
    └── contract/
```

### Module rules

Each module owns:

* API routes.

* Service layer.

* Repository layer.

* Domain models.

* Validation.

* Tests.

* Events it publishes.

* Permissions it requires.

Avoid a giant `utils.py`, a single 5,000-line service, or direct database access from every route.

## 8. Database architecture

PostgreSQL is the source of truth for core application data.

### Core entity relationships

Diagram options

![](data\:image/svg+xml;utf8,%3Csvg%20id%3D%22mermaid-_r_cb_%22%20width%3D%221177.6588134765625%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20class%3D%22erDiagram%22%20height%3D%22737.5%22%20viewBox%3D%224%204%201177.6588134765625%20737.5%22%20role%3D%22graphics-document%20document%22%20aria-roledescription%3D%22er%22%3E%3Cg%20class%3D%22edges%20edgePaths%22%3E%3Cpath%20d%3D%22M444.7109375%2C90.5L444.7109375%2C266.21704397470535Q444.7109375%2C268%20443.6251510623731%2C269.4142135623731L443.6251510623731%2C269.4142135623731Q442.5393646247462%2C270.8284271247462%20441.1251510623731%2C271.9142135623731L441.1251510623731%2C271.9142135623731Q439.7109375%2C273%20437.92798147470535%2C273L435.30639352529465%2C273Q433.5234375%2C273%20432.1092239376269%2C274.0857864376269L432.1092239376269%2C274.0857864376269Q430.6950103752538%2C275.1715728752538%20429.6092239376269%2C276.5857864376269L429.6092239376269%2C276.5857864376269Q428.5234375%2C278%20428.5234375%2C279.78295602529465L428.5234375%2C293%22%20id%3D%22id_entity-USERS-0_entity-MEMBERSHIPS-1_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-USERS-0_entity-MEMBERSHIPS-1_0%22%20data-points%3D%22W3sieCI6NDQ0LjcxMDkzNzUsInkiOjkwLjV9LHsieCI6NDQ0LjcxMDkzNzUsInkiOjI3M30seyJ4Ijo0MjguNTIzNDM3NSwieSI6MjczfSx7IngiOjQyOC41MjM0Mzc1LCJ5IjoyOTN9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M511.37760416666663%2C90.5L511.37760416666663%2C103.71704397470535Q511.37760416666663%2C105.5%20512.4633906042935%2C106.91421356237309L512.4633906042935%2C106.91421356237309Q513.5491770419204%2C108.32842712474618%20514.9633906042935%2C109.41421356237308L514.9633906042935%2C109.41421356237309Q516.3776041666666%2C110.5%20518.1605601919613%2C110.5L1036.4748564747053%2C110.5Q1038.2578125%2C110.5%201039.672026062373%2C111.58578643762691L1039.672026062373%2C111.58578643762692Q1041.0862396247462%2C112.67157287525382%201042.172026062373%2C114.08578643762691L1042.172026062373%2C114.08578643762691Q1043.2578125%2C115.5%201043.2578125%2C117.28295602529465L1043.2578125%2C293%22%20id%3D%22id_entity-USERS-0_entity-PAGES-2_1%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-USERS-0_entity-PAGES-2_1%22%20data-points%3D%22W3sieCI6NTExLjM3NzYwNDE2NjY2NjYzLCJ5Ijo5MC41fSx7IngiOjUxMS4zNzc2MDQxNjY2NjY2MywieSI6MTEwLjV9LHsieCI6MTA0My4yNTc4MTI1LCJ5IjoxMTAuNX0seyJ4IjoxMDQzLjI1NzgxMjUsInkiOjI5M31d%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M494.7109375%2C90.5L494.7109375%2C123.71704397470535Q494.7109375%2C125.5%20495.7967239376269%2C126.91421356237309L495.7967239376269%2C126.91421356237309Q496.8825103752538%2C128.32842712474618%20498.2967239376269%2C129.41421356237308L498.2967239376269%2C129.4142135623731Q499.7109375%2C130.5%20501.49389352529465%2C130.5L921.2482939747053%2C130.5Q923.03125%2C130.5%20924.4454635623731%2C131.5857864376269L924.4454635623731%2C131.58578643762692Q925.8596771247462%2C132.67157287525382%20926.9454635623731%2C134.0857864376269L926.9454635623731%2C134.0857864376269Q928.03125%2C135.5%20928.03125%2C137.28295602529465L928.03125%2C241.75L928.03125%2C422.75L928.03125%2C474%22%20id%3D%22id_entity-USERS-0_entity-POSTS-3_2%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-USERS-0_entity-POSTS-3_2%22%20data-points%3D%22W3sieCI6NDk0LjcxMDkzNzUsInkiOjkwLjV9LHsieCI6NDk0LjcxMDkzNzUsInkiOjEzMC41fSx7IngiOjkyOC4wMzEyNSwieSI6MTMwLjV9LHsieCI6OTI4LjAzMTI1LCJ5IjoyNDEuNzV9LHsieCI6OTI4LjAzMTI1LCJ5Ijo0MjIuNzV9LHsieCI6OTI4LjAzMTI1LCJ5Ijo0NzR9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M461.37760416666663%2C90.5L461.37760416666663%2C183.71704397470535Q461.37760416666663%2C185.5%20462.4633906042935%2C186.9142135623731L462.4633906042935%2C186.9142135623731Q463.5491770419204%2C188.32842712474618%20464.9633906042935%2C189.41421356237308L464.9633906042935%2C189.4142135623731Q466.37760416666663%2C190.5%20468.1605601919613%2C190.5L610.7600127247053%2C190.5Q612.54296875%2C190.5%20613.9571823123731%2C191.5857864376269L613.9571823123731%2C191.58578643762692Q615.3713958747462%2C192.67157287525382%20616.4571823123731%2C194.0857864376269L616.4571823123731%2C194.0857864376269Q617.54296875%2C195.5%20617.54296875%2C197.28295602529465L617.54296875%2C293%22%20id%3D%22id_entity-USERS-0_entity-CONVERSATION_MEMBERS-4_3%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-USERS-0_entity-CONVERSATION_MEMBERS-4_3%22%20data-points%3D%22W3sieCI6NDYxLjM3NzYwNDE2NjY2NjYzLCJ5Ijo5MC41fSx7IngiOjQ2MS4zNzc2MDQxNjY2NjY2MywieSI6MTkwLjV9LHsieCI6NjE3LjU0Mjk2ODc1LCJ5IjoxOTAuNX0seyJ4Ijo2MTcuNTQyOTY4NzUsInkiOjI5M31d%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M478.0442708333333%2C90.5L478.0442708333333%2C143.71704397470535Q478.0442708333333%2C145.5%20479.1300572709602%2C146.9142135623731L479.1300572709602%2C146.9142135623731Q480.2158437085871%2C148.32842712474618%20481.6300572709602%2C149.41421356237308L481.6300572709602%2C149.4142135623731Q483.0442708333333%2C150.5%20484.82722685862797%2C150.5L868.3160023080387%2C150.5Q870.0989583333334%2C150.5%20871.5131718957065%2C151.5857864376269L871.5131718957065%2C151.58578643762692Q872.9273854580796%2C152.67157287525382%20874.0131718957065%2C154.0857864376269L874.0131718957065%2C154.0857864376269Q875.0989583333334%2C155.5%20875.0989583333334%2C157.28295602529465L875.0989583333334%2C266.21704397470535Q875.0989583333334%2C268%20874.0131718957065%2C269.4142135623731L874.0131718957065%2C269.4142135623731Q872.9273854580796%2C270.8284271247462%20871.5131718957065%2C271.9142135623731L871.5131718957065%2C271.9142135623731Q870.0989583333334%2C273%20868.3160023080387%2C273L835.9808726919613%2C273Q834.1979166666666%2C273%20832.7837031042935%2C274.0857864376269L832.7837031042935%2C274.0857864376269Q831.3694895419204%2C275.1715728752538%20830.2837031042935%2C276.5857864376269L830.2837031042935%2C276.5857864376269Q829.1979166666666%2C278%20829.1979166666666%2C279.78295602529465L829.1979166666666%2C293%22%20id%3D%22id_entity-USERS-0_entity-TASKS-5_4%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-USERS-0_entity-TASKS-5_4%22%20data-points%3D%22W3sieCI6NDc4LjA0NDI3MDgzMzMzMzMsInkiOjkwLjV9LHsieCI6NDc4LjA0NDI3MDgzMzMzMzMsInkiOjE1MC41fSx7IngiOjg3NS4wOTg5NTgzMzMzMzM0LCJ5IjoxNTAuNX0seyJ4Ijo4NzUuMDk4OTU4MzMzMzMzNCwieSI6MjczfSx7IngiOjgyOS4xOTc5MTY2NjY2NjY2LCJ5IjoyNzN9LHsieCI6ODI5LjE5NzkxNjY2NjY2NjYsInkiOjI5M31d%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1026.5911458333335%2C371.5L1026.5911458333335%2C447.21704397470535Q1026.5911458333335%2C449%201025.5053593957066%2C450.4142135623731L1025.5053593957066%2C450.4142135623731Q1024.4195729580797%2C451.8284271247462%201023.0053593957066%2C452.9142135623731L1023.0053593957066%2C452.9142135623731Q1021.5911458333335%2C454%201019.8081898080388%2C454L968.1475393586279%2C454Q966.3645833333333%2C454%20964.9503697709602%2C455.0857864376269L964.9503697709602%2C455.0857864376269Q963.536156208587%2C456.1715728752538%20962.4503697709602%2C457.5857864376269L962.4503697709602%2C457.5857864376269Q961.3645833333333%2C459%20961.3645833333333%2C460.78295602529465L961.3645833333333%2C474%22%20id%3D%22id_entity-PAGES-2_entity-POSTS-3_5%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-PAGES-2_entity-POSTS-3_5%22%20data-points%3D%22W3sieCI6MTAyNi41OTExNDU4MzMzMzM1LCJ5IjozNzEuNX0seyJ4IjoxMDI2LjU5MTE0NTgzMzMzMzUsInkiOjQ1NH0seyJ4Ijo5NjEuMzY0NTgzMzMzMzMzMywieSI6NDU0fSx7IngiOjk2MS4zNjQ1ODMzMzMzMzMzLCJ5Ijo0NzR9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M961.3645833333333%2C552.5L961.3645833333333%2C565.7170439747053Q961.3645833333333%2C567.5%20962.4503697709602%2C568.9142135623731L962.4503697709602%2C568.9142135623731Q963.536156208587%2C570.3284271247462%20964.9503697709602%2C571.4142135623731L964.9503697709602%2C571.4142135623731Q966.3645833333333%2C572.5%20968.1475393586279%2C572.5L1094.9670439747053%2C572.5Q1096.75%2C572.5%201098.164213562373%2C573.5857864376269L1098.164213562373%2C573.5857864376269Q1099.5784271247462%2C574.6715728752538%201100.664213562373%2C576.0857864376269L1100.664213562373%2C576.0857864376269Q1101.75%2C577.5%201101.75%2C579.2829560252947L1101.75%2C655%22%20id%3D%22id_entity-POSTS-3_entity-COMMENTS-6_6%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-POSTS-3_entity-COMMENTS-6_6%22%20data-points%3D%22W3sieCI6OTYxLjM2NDU4MzMzMzMzMzMsInkiOjU1Mi41fSx7IngiOjk2MS4zNjQ1ODMzMzMzMzMzLCJ5Ijo1NzIuNX0seyJ4IjoxMTAxLjc1LCJ5Ijo1NzIuNX0seyJ4IjoxMTAxLjc1LCJ5Ijo2NTV9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M928.03125%2C552.5L928.03125%2C655%22%20id%3D%22id_entity-POSTS-3_entity-POST_REACTIONS-7_7%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-POSTS-3_entity-POST_REACTIONS-7_7%22%20data-points%3D%22W3sieCI6OTI4LjAzMTI1LCJ5Ijo1NTIuNX0seyJ4Ijo5MjguMDMxMjUsInkiOjY1NX1d%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1059.9244791666667%2C371.5L1059.9244791666667%2C384.71704397470535Q1059.9244791666667%2C386.5%201061.0102656042936%2C387.9142135623731L1061.0102656042936%2C387.9142135623731Q1062.0960520419205%2C389.3284271247462%201063.5102656042936%2C390.4142135623731L1063.5102656042936%2C390.4142135623731Q1064.9244791666667%2C391.5%201066.7074351919614%2C391.5L1097.3954293913719%2C391.5Q1099.1783854166665%2C391.5%201100.5925989790396%2C392.5857864376269L1100.5925989790396%2C392.5857864376269Q1102.0068125414127%2C393.6715728752538%201103.0925989790396%2C395.0857864376269L1103.0925989790396%2C395.0857864376269Q1104.1783854166665%2C396.5%201104.1783854166665%2C398.28295602529465L1104.1783854166665%2C474%22%20id%3D%22id_entity-PAGES-2_entity-PAGE_FOLLOWS-8_8%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-PAGES-2_entity-PAGE_FOLLOWS-8_8%22%20data-points%3D%22W3sieCI6MTA1OS45MjQ0NzkxNjY2NjY3LCJ5IjozNzEuNX0seyJ4IjoxMDU5LjkyNDQ3OTE2NjY2NjcsInkiOjM5MS41fSx7IngiOjExMDQuMTc4Mzg1NDE2NjY2NSwieSI6MzkxLjV9LHsieCI6MTEwNC4xNzgzODU0MTY2NjY1LCJ5Ijo0NzR9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M123.54921875000001%2C90.5L123.54921875000001%2C183.71704397470535Q123.54921875000001%2C185.5%20124.63500518762692%2C186.9142135623731L124.63500518762693%2C186.9142135623731Q125.72079162525384%2C188.32842712474618%20127.13500518762693%2C189.4142135623731L127.13500518762693%2C189.4142135623731Q128.54921875000002%2C190.5%20130.33217477529467%2C190.5L377.70923147470535%2C190.5Q379.4921875%2C190.5%20380.9064010623731%2C191.5857864376269L380.9064010623731%2C191.58578643762692Q382.3206146247462%2C192.67157287525382%20383.4064010623731%2C194.0857864376269L383.4064010623731%2C194.0857864376269Q384.4921875%2C195.5%20384.4921875%2C197.28295602529465L384.4921875%2C293%22%20id%3D%22id_entity-GROUPS-9_entity-MEMBERSHIPS-1_9%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-GROUPS-9_entity-MEMBERSHIPS-1_9%22%20data-points%3D%22W3sieCI6MTIzLjU0OTIxODc1MDAwMDAxLCJ5Ijo5MC41fSx7IngiOjEyMy41NDkyMTg3NTAwMDAwMSwieSI6MTkwLjV9LHsieCI6Mzg0LjQ5MjE4NzUsInkiOjE5MC41fSx7IngiOjM4NC40OTIxODc1LCJ5IjoyOTN9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M86.23046875%2C90.5L86.23046875%2C293%22%20id%3D%22id_entity-GROUPS-9_entity-CONVERSATIONS-10_10%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-GROUPS-9_entity-CONVERSATIONS-10_10%22%20data-points%3D%22W3sieCI6ODYuMjMwNDY4NzUsInkiOjkwLjV9LHsieCI6ODYuMjMwNDY4NzUsInkiOjI5M31d%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M86.23046875%2C371.5L86.23046875%2C474%22%20id%3D%22id_entity-CONVERSATIONS-10_entity-MESSAGES-11_11%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-CONVERSATIONS-10_entity-MESSAGES-11_11%22%20data-points%3D%22W3sieCI6ODYuMjMwNDY4NzUsInkiOjM3MS41fSx7IngiOjg2LjIzMDQ2ODc1LCJ5Ijo0NzR9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M142.20859375%2C90.5L142.20859375%2C163.71704397470535Q142.20859375%2C165.5%20143.29438018762693%2C166.9142135623731L143.29438018762693%2C166.9142135623731Q144.38016662525382%2C168.32842712474618%20145.79438018762693%2C169.4142135623731L145.79438018762693%2C169.4142135623731Q147.20859375%2C170.5%20148.99154977529466%2C170.5L789.0816273080387%2C170.5Q790.8645833333334%2C170.5%20792.2787968957065%2C171.5857864376269L792.2787968957065%2C171.58578643762692Q793.6930104580796%2C172.67157287525382%20794.7787968957065%2C174.0857864376269L794.7787968957065%2C174.0857864376269Q795.8645833333334%2C175.5%20795.8645833333334%2C177.28295602529465L795.8645833333334%2C293%22%20id%3D%22id_entity-GROUPS-9_entity-TASKS-5_12%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-GROUPS-9_entity-TASKS-5_12%22%20data-points%3D%22W3sieCI6MTQyLjIwODU5Mzc1LCJ5Ijo5MC41fSx7IngiOjE0Mi4yMDg1OTM3NSwieSI6MTcwLjV9LHsieCI6Nzk1Ljg2NDU4MzMzMzMzMzQsInkiOjE3MC41fSx7IngiOjc5NS44NjQ1ODMzMzMzMzM0LCJ5IjoyOTN9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M250.4609375%2C371.5L250.4609375%2C474%22%20id%3D%22id_entity-AGENTS-12_entity-AGENT_RUNS-13_13%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-AGENTS-12_entity-AGENT_RUNS-13_13%22%20data-points%3D%22W3sieCI6MjUwLjQ2MDkzNzUsInkiOjM3MS41fSx7IngiOjI1MC40NjA5Mzc1LCJ5Ijo0NzR9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M250.4609375%2C552.5L250.4609375%2C655%22%20id%3D%22id_entity-AGENT_RUNS-13_entity-AGENT_ACTIONS-14_14%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-AGENT_RUNS-13_entity-AGENT_ACTIONS-14_14%22%20data-points%3D%22W3sieCI6MjUwLjQ2MDkzNzUsInkiOjU1Mi41fSx7IngiOjI1MC40NjA5Mzc1LCJ5Ijo2NTV9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M104.88984375000001%2C90.5L104.88984375000001%2C203.71704397470535Q104.88984375000001%2C205.5%20105.97563018762692%2C206.9142135623731L105.97563018762692%2C206.9142135623731Q107.06141662525383%2C208.32842712474618%20108.47563018762692%2C209.4142135623731L108.47563018762692%2C209.4142135623731Q109.88984375000001%2C210.5%20111.67279977529466%2C210.5L243.67798147470535%2C210.5Q245.4609375%2C210.5%20246.8751510623731%2C211.5857864376269L246.8751510623731%2C211.5857864376269Q248.28936462474618%2C212.67157287525382%20249.3751510623731%2C214.0857864376269L249.3751510623731%2C214.0857864376269Q250.4609375%2C215.5%20250.4609375%2C217.28295602529465L250.4609375%2C293%22%20id%3D%22id_entity-GROUPS-9_entity-AGENTS-12_15%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20relationshipLine%22%20style%3D%22undefined%3B%3B%3Bundefined%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22id_entity-GROUPS-9_entity-AGENTS-12_15%22%20data-points%3D%22W3sieCI6MTA0Ljg4OTg0Mzc1MDAwMDAxLCJ5Ijo5MC41fSx7IngiOjEwNC44ODk4NDM3NTAwMDAwMSwieSI6MjEwLjV9LHsieCI6MjUwLjQ2MDkzNzUsInkiOjIxMC41fSx7IngiOjI1MC40NjA5Mzc1LCJ5IjoyOTN9XQ%3D%3D%22%20marker-start%3D%22url\(%23mermaid-_r_cb__er-onlyOneStart\)%22%20marker-end%3D%22url\(%23mermaid-_r_cb__er-zeroOrMoreEnd\)%22%3E%3C%2Fpath%3E%3C%2Fg%3E%3Cstyle%3E%23mermaid-_r_cb_%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%40keyframes%20edge-animation-frame%7Bfrom%7Bstroke-dashoffset%3A0%3B%7D%7D%40keyframes%20dash%7Bto%7Bstroke-dashoffset%3A0%3B%7D%7D%23mermaid-_r_cb_%20.edge-animation-slow%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2050s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_cb_%20.edge-animation-fast%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2020s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_cb_%20.error-icon%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3B%7D%23mermaid-_r_cb_%20.error-text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cb_%20.edge-thickness-normal%7Bstroke-width%3A1px%3B%7D%23mermaid-_r_cb_%20.edge-thickness-thick%7Bstroke-width%3A3.5px%3B%7D%23mermaid-_r_cb_%20.edge-pattern-solid%7Bstroke-dasharray%3A0%3B%7D%23mermaid-_r_cb_%20.edge-thickness-invisible%7Bstroke-width%3A0%3Bfill%3Anone%3B%7D%23mermaid-_r_cb_%20.edge-pattern-dashed%7Bstroke-dasharray%3A3%3B%7D%23mermaid-_r_cb_%20.edge-pattern-dotted%7Bstroke-dasharray%3A2%3B%7D%23mermaid-_r_cb_%20.marker%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_cb_%20.marker.cross%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_cb_%20svg%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3B%7D%23mermaid-_r_cb_%20p%7Bmargin%3A0%3B%7D%23mermaid-_r_cb_%20.entityBox%7Bfill%3Argb\(250%2C%20232%2C%20222\)%3Bstroke%3Argb\(239%2C%20139%2C%2087\)%3B%7D%23mermaid-_r_cb_%20.relationshipLabelBox%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3Bopacity%3A0.7%3Bbackground-color%3Argb\(249%2C%20249%2C%20249\)%3B%7D%23mermaid-_r_cb_%20.relationshipLabelBox%20rect%7Bopacity%3A0.5%3B%7D%23mermaid-_r_cb_%20.labelBkg%7Bbackground-color%3Argba\(249%2C%20249%2C%20249%2C%200.5\)%3B%7D%23mermaid-_r_cb_%20.edgeLabel%20.label%7Bfill%3Argb\(239%2C%20139%2C%2087\)%3Bfont-size%3A14px%3B%7D%23mermaid-_r_cb_%20.label%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cb_%20.edge-pattern-dashed%7Bstroke-dasharray%3A8%2C8%3B%7D%23mermaid-_r_cb_%20.node%20rect%2C%23mermaid-_r_cb_%20.node%20circle%2C%23mermaid-_r_cb_%20.node%20ellipse%2C%23mermaid-_r_cb_%20.node%20polygon%7Bfill%3Argb\(250%2C%20232%2C%20222\)%3Bstroke%3Argb\(239%2C%20139%2C%2087\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_cb_%20.relationshipLine%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3Bstroke-width%3A1%3Bfill%3Anone%3B%7D%23mermaid-_r_cb_%20.marker%7Bfill%3Anone!important%3Bstroke%3Argb\(93%2C%2093%2C%2093\)!important%3Bstroke-width%3A1%3B%7D%23mermaid-_r_cb_%20.node%7Bcolor-scheme%3Alight%3B%7D%23mermaid-_r_cb_%20%3Aroot%7B--mermaid-font-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3B%7D%3C%2Fstyle%3E%3Cg%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-onlyOneStart%22%20class%3D%22marker%20onlyOne%20er%22%20refX%3D%220%22%20refY%3D%229%22%20markerWidth%3D%2218%22%20markerHeight%3D%2218%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M9%2C0%20L9%2C18%20M15%2C0%20L15%2C18%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-onlyOneEnd%22%20class%3D%22marker%20onlyOne%20er%22%20refX%3D%2218%22%20refY%3D%229%22%20markerWidth%3D%2218%22%20markerHeight%3D%2218%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M3%2C0%20L3%2C18%20M9%2C0%20L9%2C18%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-zeroOrOneStart%22%20class%3D%22marker%20zeroOrOne%20er%22%20refX%3D%220%22%20refY%3D%229%22%20markerWidth%3D%2230%22%20markerHeight%3D%2218%22%20orient%3D%22auto%22%3E%3Ccircle%20fill%3D%22white%22%20cx%3D%2221%22%20cy%3D%229%22%20r%3D%226%22%3E%3C%2Fcircle%3E%3Cpath%20d%3D%22M9%2C0%20L9%2C18%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-zeroOrOneEnd%22%20class%3D%22marker%20zeroOrOne%20er%22%20refX%3D%2230%22%20refY%3D%229%22%20markerWidth%3D%2230%22%20markerHeight%3D%2218%22%20orient%3D%22auto%22%3E%3Ccircle%20fill%3D%22white%22%20cx%3D%229%22%20cy%3D%229%22%20r%3D%226%22%3E%3C%2Fcircle%3E%3Cpath%20d%3D%22M21%2C0%20L21%2C18%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-oneOrMoreStart%22%20class%3D%22marker%20oneOrMore%20er%22%20refX%3D%2218%22%20refY%3D%2218%22%20markerWidth%3D%2245%22%20markerHeight%3D%2236%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M0%2C18%20Q%2018%2C0%2036%2C18%20Q%2018%2C36%200%2C18%20M42%2C9%20L42%2C27%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-oneOrMoreEnd%22%20class%3D%22marker%20oneOrMore%20er%22%20refX%3D%2227%22%20refY%3D%2218%22%20markerWidth%3D%2245%22%20markerHeight%3D%2236%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M3%2C9%20L3%2C27%20M9%2C18%20Q27%2C0%2045%2C18%20Q27%2C36%209%2C18%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-zeroOrMoreStart%22%20class%3D%22marker%20zeroOrMore%20er%22%20refX%3D%2218%22%20refY%3D%2218%22%20markerWidth%3D%2257%22%20markerHeight%3D%2236%22%20orient%3D%22auto%22%3E%3Ccircle%20fill%3D%22white%22%20cx%3D%2248%22%20cy%3D%2218%22%20r%3D%226%22%3E%3C%2Fcircle%3E%3Cpath%20d%3D%22M0%2C18%20Q18%2C0%2036%2C18%20Q18%2C36%200%2C18%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22mermaid-_r_cb__er-zeroOrMoreEnd%22%20class%3D%22marker%20zeroOrMore%20er%22%20refX%3D%2239%22%20refY%3D%2218%22%20markerWidth%3D%2257%22%20markerHeight%3D%2236%22%20orient%3D%22auto%22%3E%3Ccircle%20fill%3D%22white%22%20cx%3D%229%22%20cy%3D%2218%22%20r%3D%226%22%3E%3C%2Fcircle%3E%3Cpath%20d%3D%22M21%2C18%20Q39%2C0%2057%2C18%20Q39%2C36%2021%2C18%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3C%2Fg%3E%3Cg%20class%3D%22subgraphs%22%3E%3C%2Fg%3E%3Cg%20class%3D%22nodes%22%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-USERS-0%22%20transform%3D%22translate\(478.0442708333333%2C%2051.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-50%22%20y%3D%22-39.25%22%20width%3D%22100%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-19.9765625%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EUSERS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-MEMBERSHIPS-1%22%20transform%3D%22translate\(406.5078125%2C%20332.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-66.046875%22%20y%3D%22-39.25%22%20width%3D%22132.09375%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-46.046875%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EMEMBERSHIPS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-PAGES-2%22%20transform%3D%22translate\(1043.2578125%2C%20332.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-50%22%20y%3D%22-39.25%22%20width%3D%22100%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-19.8828125%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPAGES%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-POSTS-3%22%20transform%3D%22translate\(944.6979166666666%2C%20513.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-50%22%20y%3D%22-39.25%22%20width%3D%22100%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-20.16796875%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPOSTS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-CONVERSATION_MEMBERS-4%22%20transform%3D%22translate\(617.54296875%2C%20332.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-104.98828125%22%20y%3D%22-39.25%22%20width%3D%22209.9765625%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-84.98828125%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ECONVERSATION_MEMBERS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-TASKS-5%22%20transform%3D%22translate\(812.53125%2C%20332.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-50%22%20y%3D%22-39.25%22%20width%3D%22100%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-19.203125%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ETASKS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-COMMENTS-6%22%20transform%3D%22translate\(1101.75%2C%20694.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-58.0234375%22%20y%3D%22-39.25%22%20width%3D%22116.046875%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-38.0234375%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ECOMMENTS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-POST_REACTIONS-7%22%20transform%3D%22translate\(928.03125%2C%20694.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-75.6953125%22%20y%3D%22-39.25%22%20width%3D%22151.390625%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-55.6953125%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPOST_REACTIONS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-PAGE_FOLLOWS-8%22%20transform%3D%22translate\(1104.1783854166665%2C%20513.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-69.48046875%22%20y%3D%22-39.25%22%20width%3D%22138.9609375%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-49.48046875%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPAGE_FOLLOWS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-GROUPS-9%22%20transform%3D%22translate\(114.21953125%2C%2051.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-46.6484375%22%20y%3D%22-39.25%22%20width%3D%2293.296875%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-26.6484375%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EGROUPS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-CONVERSATIONS-10%22%20transform%3D%22translate\(86.23046875%2C%20332.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-74.23046875%22%20y%3D%22-39.25%22%20width%3D%22148.4609375%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-54.23046875%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ECONVERSATIONS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-MESSAGES-11%22%20transform%3D%22translate\(86.23046875%2C%20513.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-53.70703125%22%20y%3D%22-39.25%22%20width%3D%22107.4140625%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-33.70703125%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EMESSAGES%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-AGENTS-12%22%20transform%3D%22translate\(250.4609375%2C%20332.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-50%22%20y%3D%22-39.25%22%20width%3D%22100%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-25.2109375%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EAGENTS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-AGENT_RUNS-13%22%20transform%3D%22translate\(250.4609375%2C%20513.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-62.484375%22%20y%3D%22-39.25%22%20width%3D%22124.96875%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-42.484375%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EAGENT_RUNS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22entity-AGENT_ACTIONS-14%22%20transform%3D%22translate\(250.4609375%2C%20694.25\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-73.0078125%22%20y%3D%22-39.25%22%20width%3D%22146.015625%22%20height%3D%2278.5%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-9.25\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%20transform%3D%22translate\(-53.0078125%2C%200\)%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EAGENT_ACTIONS%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabels%22%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(444.70703125%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-USERS-0_entity-MEMBERSHIPS-1_0%22%20transform%3D%22translate\(-12.49609375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2224.9921875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Ehas%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(1042.8515625%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-USERS-0_entity-PAGES-2_1%22%20transform%3D%22translate\(-18.09375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2236.1875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Eowns%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(927.89453125%2C%20332.25\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-USERS-0_entity-POSTS-3_2%22%20transform%3D%22translate\(-25.36328125%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2250.7265625%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Eauthors%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(617.21875%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-USERS-0_entity-CONVERSATION_MEMBERS-4_3%22%20transform%3D%22translate\(-17.17578125%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-3.5%22%20y%3D%22-2.9999990463256836%22%20width%3D%2234.3515625%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Ejoins%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(874.6653645833334%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-USERS-0_entity-TASKS-5_4%22%20transform%3D%22translate\(-29.06640625%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2258.1328125%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Eassigned%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(1026.4505208333335%2C%20422.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-PAGES-2_entity-POSTS-3_5%22%20transform%3D%22translate\(-27.859375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2255.71875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Econtains%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(1101.74609375%2C%20603.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-POSTS-3_entity-COMMENTS-6_6%22%20transform%3D%22translate\(-12.49609375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2224.9921875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Ehas%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(927.69921875%2C%20603.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-POSTS-3_entity-POST_REACTIONS-7_7%22%20transform%3D%22translate\(-26.66796875%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2253.3359375%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Ereceives%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(1104.1744791666665%2C%20422.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-PAGES-2_entity-PAGE_FOLLOWS-8_8%22%20transform%3D%22translate\(-12.49609375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2224.9921875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Ehas%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(384.3515625%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-GROUPS-9_entity-MEMBERSHIPS-1_9%22%20transform%3D%22translate\(-27.859375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2255.71875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Econtains%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(86.2265625%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-GROUPS-9_entity-CONVERSATIONS-10_10%22%20transform%3D%22translate\(-12.49609375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2224.9921875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Ehas%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(86.08984375%2C%20422.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-CONVERSATIONS-10_entity-MESSAGES-11_11%22%20transform%3D%22translate\(-27.859375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2255.71875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Econtains%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(795.7317708333334%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-GROUPS-9_entity-TASKS-5_12%22%20transform%3D%22translate\(-29.8671875%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2259.734375%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Emanages%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(250.1953125%2C%20422.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-AGENTS-12_entity-AGENT_RUNS-13_13%22%20transform%3D%22translate\(-28.734375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2257.46875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Eexecutes%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(250.4296875%2C%20603.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-AGENT_RUNS-13_entity-AGENT_ACTIONS-14_14%22%20transform%3D%22translate\(-30.46875%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2260.9375%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Eproposes%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(250.0546875%2C%20241.75\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22id_entity-GROUPS-9_entity-AGENTS-12_15%22%20transform%3D%22translate\(-18.09375%2C%20-11.25\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-2%22%20y%3D%22-2.9999990463256836%22%20width%3D%2236.1875%22%20height%3D%2222.5%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Eowns%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E)

## Database design rules

1. Every primary entity has a stable UUID.

2. Use foreign keys for relationships.

3. Use unique constraints for business invariants.

4. Use database transactions for multi-record writes.

5. Add indexes based on actual query patterns.

6. Use migrations for every schema change.

7. Never silently change production data types.

8. Never delete sensitive records without a documented retention policy.

9. Separate user identity from sensitive domain data.

10. Store timestamps in UTC; render them in the user's timezone.

11. Use optimistic concurrency or version checks where needed.

12. Avoid storing entire JSON blobs when relational constraints matter.

### Example: important tables

|
Table

|

Key purpose

|
| --- | --- |
|

`users`

|

Account identity

|
|

`profiles`

|

Display name, username, avatar

|
|

`pages`

|

Public or private community page

|
|

`page_members`

|

Membership and roles

|
|

`posts`

|

Published content

|
|

`comments`

|

Post discussions

|
|

`post_reactions`

|

Likes and reactions

|
|

`follows`

|

User/page follow relationships

|
|

`groups`

|

Private group identity

|
|

`group_members`

|

Group membership and roles

|
|

`conversations`

|

Chat containers

|
|

`conversation_members`

|

Chat participants

|
|

`messages`

|

Message records

|
|

`message_receipts`

|

Delivery/read status

|
|

`tasks`

|

Actionable work

|
|

`reminders`

|

Reminder schedules

|
|

`notifications`

|

User notifications

|
|

`agents`

|

Agent configuration and ownership

|
|

`agent_runs`

|

Execution records

|
|

`agent_actions`

|

Proposed and executed actions

|
|

`memory_items`

|

Scoped memory records

|
|

`audit_events`

|

Security and operational audit

|

### Important relationships and mistakes

Mistake: Putting `group_id` on every user profile.

Why it is bad: one user can belong to many groups. Membership is a many-to-many relationship.

Correct:

```
users
  id

groups
  id

group_members
  group_id
  user_id
  role
  status
  joined_at
```

Mistake: Putting `owner_id` as the only relationship for all posts.

Why it is bad: posts may belong to a page, group, or another context. The authorization model becomes ambiguous.

Correct: explicitly model the publishing context and enforce which context types are allowed.

Mistake: Using a single `is_private` boolean for every object.

Why it is bad: visibility is more complex than public/private. A post might be public, page-members-only, group-members-only, or restricted to a specific audience.

Correct: use a controlled visibility policy and server-side access checks.

# 9. API contract design

Use REST for client CRUD and WebSocket for real-time events. Keep API contracts versioned and documented.

### Example endpoints

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/me

GET    /api/v1/pages
POST   /api/v1/pages
GET    /api/v1/pages/{page_id}
POST   /api/v1/pages/{page_id}/follow

GET    /api/v1/posts
POST   /api/v1/posts
POST   /api/v1/posts/{post_id}/comments

GET    /api/v1/groups
POST   /api/v1/groups
GET    /api/v1/groups/{group_id}
POST   /api/v1/groups/{group_id}/invitations

GET    /api/v1/conversations
GET    /api/v1/conversations/{conversation_id}/messages
POST   /api/v1/conversations/{conversation_id}/messages

GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks/{task_id}

POST   /api/v1/agent-runs
GET    /api/v1/agent-runs/{run_id}
POST   /api/v1/agent-actions/{action_id}/approve
POST   /api/v1/agent-actions/{action_id}/reject
```

### API standards

Every API contract should define:

* Request schema.

* Response schema.

* Authentication requirements.

* Authorization requirements.

* Error codes.

* Pagination.

* Idempotency behavior.

* Rate limits.

* Audit behavior.

* Versioning.

Example error contract:

JSON

```
{
  "error": {
    "code": "GROUP_ACCESS_DENIED",
    "message": "You do not have access to this group.",
    "request_id": "req_123"
  }
}
```

The frontend must not rely on parsing human-readable error messages.

# Part IV — Real-time messaging

## 10. How real-time chat works

A WebSocket connection is not the same thing as a reliable message delivery system.

### Production flow

Diagram options

![](data\:image/svg+xml;utf8,%3Csvg%20id%3D%22mermaid-_r_ca_%22%20width%3D%221561%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%22873%22%20viewBox%3D%22-50%20-10%201561%20873%22%20role%3D%22graphics-document%20document%22%20aria-roledescription%3D%22sequence%22%3E%3Cg%3E%3Crect%20x%3D%221311%22%20y%3D%22787%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22B%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221386%22%20y%3D%22819.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%221386%22%20dy%3D%220%22%3EOther%20Clients%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%221111%22%20y%3D%22787%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22R%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221186%22%20y%3D%22819.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%221186%22%20dy%3D%220%22%3ERedis%20%2F%20Broker%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%22911%22%20y%3D%22787%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22DB%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22986%22%20y%3D%22819.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%22986%22%20dy%3D%220%22%3EPostgreSQL%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%22641%22%20y%3D%22787%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22API%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22716%22%20y%3D%22819.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%22716%22%20dy%3D%220%22%3EMessaging%20Service%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%22329%22%20y%3D%22787%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22164%22%20height%3D%2265%22%20name%3D%22W%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22411%22%20y%3D%22819.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%22411%22%20dy%3D%220%22%3EWebSocket%20Gateway%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Crect%20x%3D%220%22%20y%3D%22787%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22A%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-bottom%22%3E%3C%2Frect%3E%3Ctext%20x%3D%2275%22%20y%3D%22819.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%2275%22%20dy%3D%220%22%3EAndroid%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor5%22%20x1%3D%221386%22%20y1%3D%2265%22%20x2%3D%221386%22%20y2%3D%22787%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22B%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-5%22%3E%3Crect%20x%3D%221311%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22B%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221386%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%221386%22%20dy%3D%220%22%3EOther%20Clients%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor4%22%20x1%3D%221186%22%20y1%3D%2265%22%20x2%3D%221186%22%20y2%3D%22787%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22R%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-4%22%3E%3Crect%20x%3D%221111%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22R%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%221186%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%221186%22%20dy%3D%220%22%3ERedis%20%2F%20Broker%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor3%22%20x1%3D%22986%22%20y1%3D%2265%22%20x2%3D%22986%22%20y2%3D%22787%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22DB%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-3%22%3E%3Crect%20x%3D%22911%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22DB%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22986%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%22986%22%20dy%3D%220%22%3EPostgreSQL%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor2%22%20x1%3D%22716%22%20y1%3D%2265%22%20x2%3D%22716%22%20y2%3D%22787%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22API%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-2%22%3E%3Crect%20x%3D%22641%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22API%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22716%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%22716%22%20dy%3D%220%22%3EMessaging%20Service%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor1%22%20x1%3D%22411%22%20y1%3D%2265%22%20x2%3D%22411%22%20y2%3D%22787%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22W%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-1%22%3E%3Crect%20x%3D%22329%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22164%22%20height%3D%2265%22%20name%3D%22W%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%22411%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%22411%22%20dy%3D%220%22%3EWebSocket%20Gateway%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%3E%3Cline%20id%3D%22actor0%22%20x1%3D%2275%22%20y1%3D%2265%22%20x2%3D%2275%22%20y2%3D%22787%22%20class%3D%22actor-line%20200%22%20stroke-width%3D%220.5px%22%20stroke%3D%22%23999%22%20name%3D%22A%22%3E%3C%2Fline%3E%3Cg%20id%3D%22root-0%22%3E%3Crect%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23eaeaea%22%20stroke%3D%22%23666%22%20width%3D%22150%22%20height%3D%2265%22%20name%3D%22A%22%20rx%3D%223%22%20ry%3D%223%22%20class%3D%22actor%20actor-top%22%3E%3C%2Frect%3E%3Ctext%20x%3D%2275%22%20y%3D%2232.5%22%20dominant-baseline%3D%22central%22%20alignment-baseline%3D%22central%22%20class%3D%22actor%20actor-box%22%20style%3D%22text-anchor%3A%20middle%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%22%3E%3Ctspan%20x%3D%2275%22%20dy%3D%220%22%3EAndroid%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cstyle%3E%23mermaid-_r_ca_%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%40keyframes%20edge-animation-frame%7Bfrom%7Bstroke-dashoffset%3A0%3B%7D%7D%40keyframes%20dash%7Bto%7Bstroke-dashoffset%3A0%3B%7D%7D%23mermaid-_r_ca_%20.edge-animation-slow%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2050s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_ca_%20.edge-animation-fast%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2020s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_ca_%20.error-icon%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3B%7D%23mermaid-_r_ca_%20.error-text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_ca_%20.edge-thickness-normal%7Bstroke-width%3A1px%3B%7D%23mermaid-_r_ca_%20.edge-thickness-thick%7Bstroke-width%3A3.5px%3B%7D%23mermaid-_r_ca_%20.edge-pattern-solid%7Bstroke-dasharray%3A0%3B%7D%23mermaid-_r_ca_%20.edge-thickness-invisible%7Bstroke-width%3A0%3Bfill%3Anone%3B%7D%23mermaid-_r_ca_%20.edge-pattern-dashed%7Bstroke-dasharray%3A3%3B%7D%23mermaid-_r_ca_%20.edge-pattern-dotted%7Bstroke-dasharray%3A2%3B%7D%23mermaid-_r_ca_%20.marker%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20.marker.cross%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20svg%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3B%7D%23mermaid-_r_ca_%20p%7Bmargin%3A0%3B%7D%23mermaid-_r_ca_%20.actor%7Bstroke%3Argb\(239%2C%20139%2C%2087\)%3Bfill%3Argb\(250%2C%20232%2C%20222\)%3B%7D%23mermaid-_r_ca_%20text.actor%26gt%3Btspan%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Anone%3B%7D%23mermaid-_r_ca_%20.actor-line%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20.innerArc%7Bstroke-width%3A1.5%3Bstroke-dasharray%3Anone%3B%7D%23mermaid-_r_ca_%20.messageLine0%7Bstroke-width%3A1.5%3Bstroke-dasharray%3Anone%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20.messageLine1%7Bstroke-width%3A1.5%3Bstroke-dasharray%3A2%2C2%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20%23arrowhead%20path%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20.sequenceNumber%7Bfill%3A%23a2a2a2%3B%7D%23mermaid-_r_ca_%20%23sequencenumber%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20%23crosshead%20path%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_ca_%20.messageText%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Anone%3B%7D%23mermaid-_r_ca_%20.labelBox%7Bstroke%3Argba\(0%2C%200%2C%200%2C%200.05\)%3Bfill%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_ca_%20.labelText%2C%23mermaid-_r_ca_%20.labelText%26gt%3Btspan%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Anone%3B%7D%23mermaid-_r_ca_%20.loopText%2C%23mermaid-_r_ca_%20.loopText%26gt%3Btspan%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Anone%3B%7D%23mermaid-_r_ca_%20.loopLine%7Bstroke-width%3A2px%3Bstroke-dasharray%3A2%2C2%3Bstroke%3Argba\(0%2C%200%2C%200%2C%200.05\)%3Bfill%3Argba\(0%2C%200%2C%200%2C%200.05\)%3B%7D%23mermaid-_r_ca_%20.note%7Bstroke%3Argb\(248%2C%20212%2C%2093\)%3Bfill%3Argb\(249%2C%20249%2C%20249\)%3B%7D%23mermaid-_r_ca_%20.noteText%2C%23mermaid-_r_ca_%20.noteText%26gt%3Btspan%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Anone%3B%7D%23mermaid-_r_ca_%20.activation0%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3Bstroke%3Ahsl\(0%2C%200%25%2C%2087.6470588235%25\)%3B%7D%23mermaid-_r_ca_%20.activation1%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3Bstroke%3Ahsl\(0%2C%200%25%2C%2087.6470588235%25\)%3B%7D%23mermaid-_r_ca_%20.activation2%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3Bstroke%3Ahsl\(0%2C%200%25%2C%2087.6470588235%25\)%3B%7D%23mermaid-_r_ca_%20.actorPopupMenu%7Bposition%3Aabsolute%3B%7D%23mermaid-_r_ca_%20.actorPopupMenuPanel%7Bposition%3Aabsolute%3Bfill%3Argb\(250%2C%20232%2C%20222\)%3Bbox-shadow%3A0px%208px%2016px%200px%20rgba\(0%2C0%2C0%2C0.2\)%3Bfilter%3Adrop-shadow\(3px%205px%202px%20rgb\(0%200%200%20%2F%200.4\)\)%3B%7D%23mermaid-_r_ca_%20.actor-man%20line%7Bstroke%3Argb\(239%2C%20139%2C%2087\)%3Bfill%3Argb\(250%2C%20232%2C%20222\)%3B%7D%23mermaid-_r_ca_%20.actor-man%20circle%2C%23mermaid-_r_ca_%20line%7Bstroke%3Argb\(239%2C%20139%2C%2087\)%3Bfill%3Argb\(250%2C%20232%2C%20222\)%3Bstroke-width%3A2px%3B%7D%23mermaid-_r_ca_%20.node%7Bcolor-scheme%3Alight%3B%7D%23mermaid-_r_ca_%20%3Aroot%7B--mermaid-font-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3B%7D%3C%2Fstyle%3E%3Cg%3E%3C%2Fg%3E%3Cdefs%3E%3Csymbol%20id%3D%22computer%22%20width%3D%2224%22%20height%3D%2224%22%3E%3Cpath%20transform%3D%22scale\(.5\)%22%20d%3D%22M2%202v13h20v-13h-20zm18%2011h-16v-9h16v9zm-10.228%206l.466-1h3.524l.467%201h-4.457zm14.228%203h-24l2-6h2.104l-1.33%204h18.45l-1.297-4h2.073l2%206zm-5-10h-14v-7h14v7z%22%3E%3C%2Fpath%3E%3C%2Fsymbol%3E%3C%2Fdefs%3E%3Cdefs%3E%3Csymbol%20id%3D%22database%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%3E%3Cpath%20transform%3D%22scale\(.5\)%22%20d%3D%22M12.258.001l.256.004.255.005.253.008.251.01.249.012.247.015.246.016.242.019.241.02.239.023.236.024.233.027.231.028.229.031.225.032.223.034.22.036.217.038.214.04.211.041.208.043.205.045.201.046.198.048.194.05.191.051.187.053.183.054.18.056.175.057.172.059.168.06.163.061.16.063.155.064.15.066.074.033.073.033.071.034.07.034.069.035.068.035.067.035.066.035.064.036.064.036.062.036.06.036.06.037.058.037.058.037.055.038.055.038.053.038.052.038.051.039.05.039.048.039.047.039.045.04.044.04.043.04.041.04.04.041.039.041.037.041.036.041.034.041.033.042.032.042.03.042.029.042.027.042.026.043.024.043.023.043.021.043.02.043.018.044.017.043.015.044.013.044.012.044.011.045.009.044.007.045.006.045.004.045.002.045.001.045v17l-.001.045-.002.045-.004.045-.006.045-.007.045-.009.044-.011.045-.012.044-.013.044-.015.044-.017.043-.018.044-.02.043-.021.043-.023.043-.024.043-.026.043-.027.042-.029.042-.03.042-.032.042-.033.042-.034.041-.036.041-.037.041-.039.041-.04.041-.041.04-.043.04-.044.04-.045.04-.047.039-.048.039-.05.039-.051.039-.052.038-.053.038-.055.038-.055.038-.058.037-.058.037-.06.037-.06.036-.062.036-.064.036-.064.036-.066.035-.067.035-.068.035-.069.035-.07.034-.071.034-.073.033-.074.033-.15.066-.155.064-.16.063-.163.061-.168.06-.172.059-.175.057-.18.056-.183.054-.187.053-.191.051-.194.05-.198.048-.201.046-.205.045-.208.043-.211.041-.214.04-.217.038-.22.036-.223.034-.225.032-.229.031-.231.028-.233.027-.236.024-.239.023-.241.02-.242.019-.246.016-.247.015-.249.012-.251.01-.253.008-.255.005-.256.004-.258.001-.258-.001-.256-.004-.255-.005-.253-.008-.251-.01-.249-.012-.247-.015-.245-.016-.243-.019-.241-.02-.238-.023-.236-.024-.234-.027-.231-.028-.228-.031-.226-.032-.223-.034-.22-.036-.217-.038-.214-.04-.211-.041-.208-.043-.204-.045-.201-.046-.198-.048-.195-.05-.19-.051-.187-.053-.184-.054-.179-.056-.176-.057-.172-.059-.167-.06-.164-.061-.159-.063-.155-.064-.151-.066-.074-.033-.072-.033-.072-.034-.07-.034-.069-.035-.068-.035-.067-.035-.066-.035-.064-.036-.063-.036-.062-.036-.061-.036-.06-.037-.058-.037-.057-.037-.056-.038-.055-.038-.053-.038-.052-.038-.051-.039-.049-.039-.049-.039-.046-.039-.046-.04-.044-.04-.043-.04-.041-.04-.04-.041-.039-.041-.037-.041-.036-.041-.034-.041-.033-.042-.032-.042-.03-.042-.029-.042-.027-.042-.026-.043-.024-.043-.023-.043-.021-.043-.02-.043-.018-.044-.017-.043-.015-.044-.013-.044-.012-.044-.011-.045-.009-.044-.007-.045-.006-.045-.004-.045-.002-.045-.001-.045v-17l.001-.045.002-.045.004-.045.006-.045.007-.045.009-.044.011-.045.012-.044.013-.044.015-.044.017-.043.018-.044.02-.043.021-.043.023-.043.024-.043.026-.043.027-.042.029-.042.03-.042.032-.042.033-.042.034-.041.036-.041.037-.041.039-.041.04-.041.041-.04.043-.04.044-.04.046-.04.046-.039.049-.039.049-.039.051-.039.052-.038.053-.038.055-.038.056-.038.057-.037.058-.037.06-.037.061-.036.062-.036.063-.036.064-.036.066-.035.067-.035.068-.035.069-.035.07-.034.072-.034.072-.033.074-.033.151-.066.155-.064.159-.063.164-.061.167-.06.172-.059.176-.057.179-.056.184-.054.187-.053.19-.051.195-.05.198-.048.201-.046.204-.045.208-.043.211-.041.214-.04.217-.038.22-.036.223-.034.226-.032.228-.031.231-.028.234-.027.236-.024.238-.023.241-.02.243-.019.245-.016.247-.015.249-.012.251-.01.253-.008.255-.005.256-.004.258-.001.258.001zm-9.258%2020.499v.01l.001.021.003.021.004.022.005.021.006.022.007.022.009.023.01.022.011.023.012.023.013.023.015.023.016.024.017.023.018.024.019.024.021.024.022.025.023.024.024.025.052.049.056.05.061.051.066.051.07.051.075.051.079.052.084.052.088.052.092.052.097.052.102.051.105.052.11.052.114.051.119.051.123.051.127.05.131.05.135.05.139.048.144.049.147.047.152.047.155.047.16.045.163.045.167.043.171.043.176.041.178.041.183.039.187.039.19.037.194.035.197.035.202.033.204.031.209.03.212.029.216.027.219.025.222.024.226.021.23.02.233.018.236.016.24.015.243.012.246.01.249.008.253.005.256.004.259.001.26-.001.257-.004.254-.005.25-.008.247-.011.244-.012.241-.014.237-.016.233-.018.231-.021.226-.021.224-.024.22-.026.216-.027.212-.028.21-.031.205-.031.202-.034.198-.034.194-.036.191-.037.187-.039.183-.04.179-.04.175-.042.172-.043.168-.044.163-.045.16-.046.155-.046.152-.047.148-.048.143-.049.139-.049.136-.05.131-.05.126-.05.123-.051.118-.052.114-.051.11-.052.106-.052.101-.052.096-.052.092-.052.088-.053.083-.051.079-.052.074-.052.07-.051.065-.051.06-.051.056-.05.051-.05.023-.024.023-.025.021-.024.02-.024.019-.024.018-.024.017-.024.015-.023.014-.024.013-.023.012-.023.01-.023.01-.022.008-.022.006-.022.006-.022.004-.022.004-.021.001-.021.001-.021v-4.127l-.077.055-.08.053-.083.054-.085.053-.087.052-.09.052-.093.051-.095.05-.097.05-.1.049-.102.049-.105.048-.106.047-.109.047-.111.046-.114.045-.115.045-.118.044-.12.043-.122.042-.124.042-.126.041-.128.04-.13.04-.132.038-.134.038-.135.037-.138.037-.139.035-.142.035-.143.034-.144.033-.147.032-.148.031-.15.03-.151.03-.153.029-.154.027-.156.027-.158.026-.159.025-.161.024-.162.023-.163.022-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.011-.178.01-.179.008-.179.008-.181.006-.182.005-.182.004-.184.003-.184.002h-.37l-.184-.002-.184-.003-.182-.004-.182-.005-.181-.006-.179-.008-.179-.008-.178-.01-.176-.011-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.022-.162-.023-.161-.024-.159-.025-.157-.026-.156-.027-.155-.027-.153-.029-.151-.03-.15-.03-.148-.031-.146-.032-.145-.033-.143-.034-.141-.035-.14-.035-.137-.037-.136-.037-.134-.038-.132-.038-.13-.04-.128-.04-.126-.041-.124-.042-.122-.042-.12-.044-.117-.043-.116-.045-.113-.045-.112-.046-.109-.047-.106-.047-.105-.048-.102-.049-.1-.049-.097-.05-.095-.05-.093-.052-.09-.051-.087-.052-.085-.053-.083-.054-.08-.054-.077-.054v4.127zm0-5.654v.011l.001.021.003.021.004.021.005.022.006.022.007.022.009.022.01.022.011.023.012.023.013.023.015.024.016.023.017.024.018.024.019.024.021.024.022.024.023.025.024.024.052.05.056.05.061.05.066.051.07.051.075.052.079.051.084.052.088.052.092.052.097.052.102.052.105.052.11.051.114.051.119.052.123.05.127.051.131.05.135.049.139.049.144.048.147.048.152.047.155.046.16.045.163.045.167.044.171.042.176.042.178.04.183.04.187.038.19.037.194.036.197.034.202.033.204.032.209.03.212.028.216.027.219.025.222.024.226.022.23.02.233.018.236.016.24.014.243.012.246.01.249.008.253.006.256.003.259.001.26-.001.257-.003.254-.006.25-.008.247-.01.244-.012.241-.015.237-.016.233-.018.231-.02.226-.022.224-.024.22-.025.216-.027.212-.029.21-.03.205-.032.202-.033.198-.035.194-.036.191-.037.187-.039.183-.039.179-.041.175-.042.172-.043.168-.044.163-.045.16-.045.155-.047.152-.047.148-.048.143-.048.139-.05.136-.049.131-.05.126-.051.123-.051.118-.051.114-.052.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.051.07-.052.065-.051.06-.05.056-.051.051-.049.023-.025.023-.024.021-.025.02-.024.019-.024.018-.024.017-.024.015-.023.014-.023.013-.024.012-.022.01-.023.01-.023.008-.022.006-.022.006-.022.004-.021.004-.022.001-.021.001-.021v-4.139l-.077.054-.08.054-.083.054-.085.052-.087.053-.09.051-.093.051-.095.051-.097.05-.1.049-.102.049-.105.048-.106.047-.109.047-.111.046-.114.045-.115.044-.118.044-.12.044-.122.042-.124.042-.126.041-.128.04-.13.039-.132.039-.134.038-.135.037-.138.036-.139.036-.142.035-.143.033-.144.033-.147.033-.148.031-.15.03-.151.03-.153.028-.154.028-.156.027-.158.026-.159.025-.161.024-.162.023-.163.022-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.011-.178.009-.179.009-.179.007-.181.007-.182.005-.182.004-.184.003-.184.002h-.37l-.184-.002-.184-.003-.182-.004-.182-.005-.181-.007-.179-.007-.179-.009-.178-.009-.176-.011-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.022-.162-.023-.161-.024-.159-.025-.157-.026-.156-.027-.155-.028-.153-.028-.151-.03-.15-.03-.148-.031-.146-.033-.145-.033-.143-.033-.141-.035-.14-.036-.137-.036-.136-.037-.134-.038-.132-.039-.13-.039-.128-.04-.126-.041-.124-.042-.122-.043-.12-.043-.117-.044-.116-.044-.113-.046-.112-.046-.109-.046-.106-.047-.105-.048-.102-.049-.1-.049-.097-.05-.095-.051-.093-.051-.09-.051-.087-.053-.085-.052-.083-.054-.08-.054-.077-.054v4.139zm0-5.666v.011l.001.02.003.022.004.021.005.022.006.021.007.022.009.023.01.022.011.023.012.023.013.023.015.023.016.024.017.024.018.023.019.024.021.025.022.024.023.024.024.025.052.05.056.05.061.05.066.051.07.051.075.052.079.051.084.052.088.052.092.052.097.052.102.052.105.051.11.052.114.051.119.051.123.051.127.05.131.05.135.05.139.049.144.048.147.048.152.047.155.046.16.045.163.045.167.043.171.043.176.042.178.04.183.04.187.038.19.037.194.036.197.034.202.033.204.032.209.03.212.028.216.027.219.025.222.024.226.021.23.02.233.018.236.017.24.014.243.012.246.01.249.008.253.006.256.003.259.001.26-.001.257-.003.254-.006.25-.008.247-.01.244-.013.241-.014.237-.016.233-.018.231-.02.226-.022.224-.024.22-.025.216-.027.212-.029.21-.03.205-.032.202-.033.198-.035.194-.036.191-.037.187-.039.183-.039.179-.041.175-.042.172-.043.168-.044.163-.045.16-.045.155-.047.152-.047.148-.048.143-.049.139-.049.136-.049.131-.051.126-.05.123-.051.118-.052.114-.051.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.052.07-.051.065-.051.06-.051.056-.05.051-.049.023-.025.023-.025.021-.024.02-.024.019-.024.018-.024.017-.024.015-.023.014-.024.013-.023.012-.023.01-.022.01-.023.008-.022.006-.022.006-.022.004-.022.004-.021.001-.021.001-.021v-4.153l-.077.054-.08.054-.083.053-.085.053-.087.053-.09.051-.093.051-.095.051-.097.05-.1.049-.102.048-.105.048-.106.048-.109.046-.111.046-.114.046-.115.044-.118.044-.12.043-.122.043-.124.042-.126.041-.128.04-.13.039-.132.039-.134.038-.135.037-.138.036-.139.036-.142.034-.143.034-.144.033-.147.032-.148.032-.15.03-.151.03-.153.028-.154.028-.156.027-.158.026-.159.024-.161.024-.162.023-.163.023-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.01-.178.01-.179.009-.179.007-.181.006-.182.006-.182.004-.184.003-.184.001-.185.001-.185-.001-.184-.001-.184-.003-.182-.004-.182-.006-.181-.006-.179-.007-.179-.009-.178-.01-.176-.01-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.023-.162-.023-.161-.024-.159-.024-.157-.026-.156-.027-.155-.028-.153-.028-.151-.03-.15-.03-.148-.032-.146-.032-.145-.033-.143-.034-.141-.034-.14-.036-.137-.036-.136-.037-.134-.038-.132-.039-.13-.039-.128-.041-.126-.041-.124-.041-.122-.043-.12-.043-.117-.044-.116-.044-.113-.046-.112-.046-.109-.046-.106-.048-.105-.048-.102-.048-.1-.05-.097-.049-.095-.051-.093-.051-.09-.052-.087-.052-.085-.053-.083-.053-.08-.054-.077-.054v4.153zm8.74-8.179l-.257.004-.254.005-.25.008-.247.011-.244.012-.241.014-.237.016-.233.018-.231.021-.226.022-.224.023-.22.026-.216.027-.212.028-.21.031-.205.032-.202.033-.198.034-.194.036-.191.038-.187.038-.183.04-.179.041-.175.042-.172.043-.168.043-.163.045-.16.046-.155.046-.152.048-.148.048-.143.048-.139.049-.136.05-.131.05-.126.051-.123.051-.118.051-.114.052-.11.052-.106.052-.101.052-.096.052-.092.052-.088.052-.083.052-.079.052-.074.051-.07.052-.065.051-.06.05-.056.05-.051.05-.023.025-.023.024-.021.024-.02.025-.019.024-.018.024-.017.023-.015.024-.014.023-.013.023-.012.023-.01.023-.01.022-.008.022-.006.023-.006.021-.004.022-.004.021-.001.021-.001.021.001.021.001.021.004.021.004.022.006.021.006.023.008.022.01.022.01.023.012.023.013.023.014.023.015.024.017.023.018.024.019.024.02.025.021.024.023.024.023.025.051.05.056.05.06.05.065.051.07.052.074.051.079.052.083.052.088.052.092.052.096.052.101.052.106.052.11.052.114.052.118.051.123.051.126.051.131.05.136.05.139.049.143.048.148.048.152.048.155.046.16.046.163.045.168.043.172.043.175.042.179.041.183.04.187.038.191.038.194.036.198.034.202.033.205.032.21.031.212.028.216.027.22.026.224.023.226.022.231.021.233.018.237.016.241.014.244.012.247.011.25.008.254.005.257.004.26.001.26-.001.257-.004.254-.005.25-.008.247-.011.244-.012.241-.014.237-.016.233-.018.231-.021.226-.022.224-.023.22-.026.216-.027.212-.028.21-.031.205-.032.202-.033.198-.034.194-.036.191-.038.187-.038.183-.04.179-.041.175-.042.172-.043.168-.043.163-.045.16-.046.155-.046.152-.048.148-.048.143-.048.139-.049.136-.05.131-.05.126-.051.123-.051.118-.051.114-.052.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.051.07-.052.065-.051.06-.05.056-.05.051-.05.023-.025.023-.024.021-.024.02-.025.019-.024.018-.024.017-.023.015-.024.014-.023.013-.023.012-.023.01-.023.01-.022.008-.022.006-.023.006-.021.004-.022.004-.021.001-.021.001-.021-.001-.021-.001-.021-.004-.021-.004-.022-.006-.021-.006-.023-.008-.022-.01-.022-.01-.023-.012-.023-.013-.023-.014-.023-.015-.024-.017-.023-.018-.024-.019-.024-.02-.025-.021-.024-.023-.024-.023-.025-.051-.05-.056-.05-.06-.05-.065-.051-.07-.052-.074-.051-.079-.052-.083-.052-.088-.052-.092-.052-.096-.052-.101-.052-.106-.052-.11-.052-.114-.052-.118-.051-.123-.051-.126-.051-.131-.05-.136-.05-.139-.049-.143-.048-.148-.048-.152-.048-.155-.046-.16-.046-.163-.045-.168-.043-.172-.043-.175-.042-.179-.041-.183-.04-.187-.038-.191-.038-.194-.036-.198-.034-.202-.033-.205-.032-.21-.031-.212-.028-.216-.027-.22-.026-.224-.023-.226-.022-.231-.021-.233-.018-.237-.016-.241-.014-.244-.012-.247-.011-.25-.008-.254-.005-.257-.004-.26-.001-.26.001z%22%3E%3C%2Fpath%3E%3C%2Fsymbol%3E%3C%2Fdefs%3E%3Cdefs%3E%3Csymbol%20id%3D%22clock%22%20width%3D%2224%22%20height%3D%2224%22%3E%3Cpath%20transform%3D%22scale\(.5\)%22%20d%3D%22M12%202c5.514%200%2010%204.486%2010%2010s-4.486%2010-10%2010-10-4.486-10-10%204.486-10%2010-10zm0-2c-6.627%200-12%205.373-12%2012s5.373%2012%2012%2012%2012-5.373%2012-12-5.373-12-12-12zm5.848%2012.459c.202.038.202.333.001.372-1.907.361-6.045%201.111-6.547%201.111-.719%200-1.301-.582-1.301-1.301%200-.512.77-5.447%201.125-7.445.034-.192.312-.181.343.014l.985%206.238%205.394%201.011z%22%3E%3C%2Fpath%3E%3C%2Fsymbol%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22arrowhead%22%20refX%3D%227.9%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2212%22%20markerHeight%3D%2212%22%20orient%3D%22auto-start-reverse%22%3E%3Cpath%20d%3D%22M%20-1%200%20L%2010%205%20L%200%2010%20z%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22crosshead%22%20markerWidth%3D%2215%22%20markerHeight%3D%228%22%20orient%3D%22auto%22%20refX%3D%224%22%20refY%3D%224.5%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23000000%22%20stroke-width%3D%221pt%22%20d%3D%22M%201%2C2%20L%206%2C7%20M%206%2C2%20L%201%2C7%22%20style%3D%22stroke-dasharray%3A%200%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22filled-head%22%20refX%3D%2215.5%22%20refY%3D%227%22%20markerWidth%3D%2220%22%20markerHeight%3D%2228%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%2018%2C7%20L9%2C13%20L14%2C7%20L9%2C1%20Z%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Cdefs%3E%3Cmarker%20id%3D%22sequencenumber%22%20refX%3D%2215%22%20refY%3D%2215%22%20markerWidth%3D%2260%22%20markerHeight%3D%2240%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%2215%22%20cy%3D%2215%22%20r%3D%226%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3C%2Fdefs%3E%3Ctext%20x%3D%22242%22%20y%3D%2280%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EConnect%20%2B%20authenticate%3C%2Ftext%3E%3Cline%20x1%3D%2276%22%20y1%3D%22119%22%20x2%3D%22407%22%20y2%3D%22119%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22242%22%20y%3D%22134%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ESend%20message%20with%20client_message_id%3C%2Ftext%3E%3Cline%20x1%3D%2276%22%20y1%3D%22173%22%20x2%3D%22407%22%20y2%3D%22173%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22562%22%20y%3D%22188%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EValidate%20session%20and%20membership%3C%2Ftext%3E%3Cline%20x1%3D%22412%22%20y1%3D%22227%22%20x2%3D%22712%22%20y2%3D%22227%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22850%22%20y%3D%22242%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ETransaction%3A%20persist%20message%3C%2Ftext%3E%3Cline%20x1%3D%22717%22%20y1%3D%22281%22%20x2%3D%22982%22%20y2%3D%22281%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22850%22%20y%3D%22296%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ERecord%20outbox%20event%3C%2Ftext%3E%3Cline%20x1%3D%22717%22%20y1%3D%22335%22%20x2%3D%22982%22%20y2%3D%22335%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22853%22%20y%3D%22350%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ECommit%3C%2Ftext%3E%3Cline%20x1%3D%22985%22%20y1%3D%22389%22%20x2%3D%22720%22%20y2%3D%22389%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22565%22%20y%3D%22404%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EMessage%20accepted%3C%2Ftext%3E%3Cline%20x1%3D%22715%22%20y1%3D%22443%22%20x2%3D%22415%22%20y2%3D%22443%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22245%22%20y%3D%22458%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EMessage%20acknowledgement%3C%2Ftext%3E%3Cline%20x1%3D%22410%22%20y1%3D%22497%22%20x2%3D%2279%22%20y2%3D%22497%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22950%22%20y%3D%22512%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EPublish%20message%20event%3C%2Ftext%3E%3Cline%20x1%3D%22717%22%20y1%3D%22551%22%20x2%3D%221182%22%20y2%3D%22551%22%20class%3D%22messageLine0%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22800%22%20y%3D%22566%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EDeliver%20event%3C%2Ftext%3E%3Cline%20x1%3D%221185%22%20y1%3D%22605%22%20x2%3D%22415%22%20y2%3D%22605%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22897%22%20y%3D%22620%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3ENew%20message%3C%2Ftext%3E%3Cline%20x1%3D%22412%22%20y1%3D%22659%22%20x2%3D%221382%22%20y2%3D%22659%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22900%22%20y%3D%22674%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EDelivery%20%2F%20read%20receipt%3C%2Ftext%3E%3Cline%20x1%3D%221385%22%20y1%3D%22713%22%20x2%3D%22415%22%20y2%3D%22713%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3Ctext%20x%3D%22562%22%20y%3D%22728%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20alignment-baseline%3D%22middle%22%20class%3D%22messageText%22%20dy%3D%221em%22%20style%3D%22font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%26quot%3BSegoe%20UI%26quot%3B%2C%20Roboto%2C%20Oxygen%2C%20Ubuntu%2C%20Cantarell%2C%20%26quot%3BHelvetica%20Neue%26quot%3B%2C%20Arial%2C%20%26quot%3Bsans-serif%26quot%3B%3B%20font-size%3A%2016px%3B%20font-weight%3A%20400%3B%22%3EPersist%20receipt%3C%2Ftext%3E%3Cline%20x1%3D%22412%22%20y1%3D%22767%22%20x2%3D%22712%22%20y2%3D%22767%22%20class%3D%22messageLine1%22%20stroke-width%3D%222%22%20stroke%3D%22none%22%20marker-end%3D%22url\(%23arrowhead\)%22%20style%3D%22stroke-dasharray%3A%203%2C%203%3B%20fill%3A%20none%3B%22%3E%3C%2Fline%3E%3C%2Fsvg%3E)

### Message data

```
messages
├── id
├── conversation_id
├── sender_id
├── client_message_id
├── body / content reference
├── created_at
├── edited_at
└── deleted_at
```

### Rules

* Persist before broadcasting.

* Use client-generated idempotency keys.

* Never rely on WebSocket delivery as proof of database persistence.

* Support reconnect and message replay.

* Use sequence numbers or cursors.

* Handle offline sends.

* Store delivery and read receipts separately.

* Validate conversation membership on every write.

* Apply rate limits.

* Treat message attachments as separate storage objects.

### Redis role

Redis can support:

* Presence.

* Short-lived connection state.

* Pub/sub or streams.

* Rate limiting.

* Distributed locks where needed.

* Caching.

PostgreSQL remains the durable source of truth for messages.

# Part V — Agent architecture

## 11. The agent system you actually need

Your idea involves multiple kinds of agents. The right design is not to create a new independent AI process for every person or group immediately.

Use a shared agent runtime with scoped configurations.

### Agent types

1. Conversation agent

Answers questions, understands context, and helps users communicate with the platform.

2. Planning agent

Turns approved user requests into tasks, schedules, and plans.

3. Reminder agent

Evaluates due schedules and triggers notification workflows.

4. Memory agent

Retrieves relevant authorized context and manages retention.

5. Research agent

Searches approved sources and returns cited, qualified information.

6. Safety and policy layer

Validates permissions, sensitive data handling, risky actions, and approvals.

### Agent ownership model

When a user creates a family group:

```
User creates family group
        │
        ▼
Create group record
        │
        ▼
Create group agent configuration
        │
        ▼
Assign agent to group scope
        │
        ▼
Agent becomes available in group chat
```

But the agent should not automatically receive unlimited access to every group message, every family member, or every external integration.

A better model is:

```
Group
  └── Agent configuration
       ├── Allowed tools
       ├── Memory policy
       ├── Allowed data scopes
       ├── Approval policy
       ├── Notification policy
       └── Language / preferences
```

One runtime can serve thousands of group configurations.

## 12. LangGraph architecture

Use LangGraph for stateful agent workflows, not as the database or permission system.

### Graph

Diagram options

![](data\:image/svg+xml;utf8,%3Csvg%20id%3D%22mermaid-_r_cd_%22%20width%3D%22467.94915771484375%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20class%3D%22flowchart%22%20height%3D%221419.0999755859375%22%20viewBox%3D%224%204%20467.94915771484375%201419.0999755859375%22%20role%3D%22graphics-document%20document%22%20aria-roledescription%3D%22flowchart-v2%22%3E%3Cstyle%3E%23mermaid-_r_cd_%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%40keyframes%20edge-animation-frame%7Bfrom%7Bstroke-dashoffset%3A0%3B%7D%7D%40keyframes%20dash%7Bto%7Bstroke-dashoffset%3A0%3B%7D%7D%23mermaid-_r_cd_%20.edge-animation-slow%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2050s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_cd_%20.edge-animation-fast%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2020s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_cd_%20.error-icon%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3B%7D%23mermaid-_r_cd_%20.error-text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20.edge-thickness-normal%7Bstroke-width%3A1px%3B%7D%23mermaid-_r_cd_%20.edge-thickness-thick%7Bstroke-width%3A3.5px%3B%7D%23mermaid-_r_cd_%20.edge-pattern-solid%7Bstroke-dasharray%3A0%3B%7D%23mermaid-_r_cd_%20.edge-thickness-invisible%7Bstroke-width%3A0%3Bfill%3Anone%3B%7D%23mermaid-_r_cd_%20.edge-pattern-dashed%7Bstroke-dasharray%3A3%3B%7D%23mermaid-_r_cd_%20.edge-pattern-dotted%7Bstroke-dasharray%3A2%3B%7D%23mermaid-_r_cd_%20.marker%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_cd_%20.marker.cross%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_cd_%20svg%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3B%7D%23mermaid-_r_cd_%20p%7Bmargin%3A0%3B%7D%23mermaid-_r_cd_%20.label%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20.cluster-label%20text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20.cluster-label%20span%7Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20.cluster-label%20span%20p%7Bbackground-color%3Atransparent%3B%7D%23mermaid-_r_cd_%20.label%20text%2C%23mermaid-_r_cd_%20span%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20.node%20rect%2C%23mermaid-_r_cd_%20.node%20circle%2C%23mermaid-_r_cd_%20.node%20ellipse%2C%23mermaid-_r_cd_%20.node%20polygon%2C%23mermaid-_r_cd_%20.node%20path%7Bfill%3Argb\(250%2C%20232%2C%20222\)%3Bstroke%3Argb\(239%2C%20139%2C%2087\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_cd_%20.rough-node%20.label%20text%2C%23mermaid-_r_cd_%20.node%20.label%20text%2C%23mermaid-_r_cd_%20.image-shape%20.label%2C%23mermaid-_r_cd_%20.icon-shape%20.label%7Btext-anchor%3Amiddle%3B%7D%23mermaid-_r_cd_%20.node%20.katex%20path%7Bfill%3A%23000%3Bstroke%3A%23000%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_cd_%20.rough-node%20.label%2C%23mermaid-_r_cd_%20.node%20.label%2C%23mermaid-_r_cd_%20.image-shape%20.label%2C%23mermaid-_r_cd_%20.icon-shape%20.label%7Btext-align%3Acenter%3B%7D%23mermaid-_r_cd_%20.node.clickable%7Bcursor%3Apointer%3B%7D%23mermaid-_r_cd_%20.root%20.anchor%20path%7Bfill%3Argb\(93%2C%2093%2C%2093\)!important%3Bstroke-width%3A0%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_cd_%20.arrowheadPath%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_cd_%20.edgePath%20.path%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3Bstroke-width%3A2.0px%3B%7D%23mermaid-_r_cd_%20.flowchart-link%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3Bfill%3Anone%3B%7D%23mermaid-_r_cd_%20.edgeLabel%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Btext-align%3Acenter%3B%7D%23mermaid-_r_cd_%20.edgeLabel%20p%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_cd_%20.edgeLabel%20rect%7Bopacity%3A0.5%3Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bfill%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_cd_%20.labelBkg%7Bbackground-color%3Argba\(252%2C%20252%2C%20252%2C%200.5\)%3B%7D%23mermaid-_r_cd_%20.cluster%20rect%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3Bstroke%3Argba\(0%2C%200%2C%200%2C%200.05\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_cd_%20.cluster%20text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20.cluster%20span%7Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20div.mermaidTooltip%7Bposition%3Aabsolute%3Btext-align%3Acenter%3Bmax-width%3A200px%3Bpadding%3A2px%3Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A12px%3Bbackground%3Argb\(249%2C%20249%2C%20249\)%3Bborder%3A1px%20solid%20rgba\(0%2C%200%2C%200%2C%200.05\)%3Bborder-radius%3A2px%3Bpointer-events%3Anone%3Bz-index%3A100%3B%7D%23mermaid-_r_cd_%20.flowchartTitleText%7Btext-anchor%3Amiddle%3Bfont-size%3A18px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_cd_%20rect.text%7Bfill%3Anone%3Bstroke-width%3A0%3B%7D%23mermaid-_r_cd_%20.icon-shape%2C%23mermaid-_r_cd_%20.image-shape%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Btext-align%3Acenter%3B%7D%23mermaid-_r_cd_%20.icon-shape%20p%2C%23mermaid-_r_cd_%20.image-shape%20p%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bpadding%3A2px%3B%7D%23mermaid-_r_cd_%20.icon-shape%20rect%2C%23mermaid-_r_cd_%20.image-shape%20rect%7Bopacity%3A0.5%3Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bfill%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_cd_%20.label-icon%7Bdisplay%3Ainline-block%3Bheight%3A1em%3Boverflow%3Avisible%3Bvertical-align%3A-0.125em%3B%7D%23mermaid-_r_cd_%20.node%20.label-icon%20path%7Bfill%3AcurrentColor%3Bstroke%3Arevert%3Bstroke-width%3Arevert%3B%7D%23mermaid-_r_cd_%20.node%20text%7Bfont-size%3A16px%3Bfont-weight%3A600%3Bletter-spacing%3A-0.32px%3Bfill%3A%236d2e0f%3B%7D%23mermaid-_r_cd_%20.edgeLabels%20text%7Bfont-size%3A13px%3Bfont-weight%3A600%3Bletter-spacing%3A-0.08px%3Bfill%3A%236d2e0f%3B%7D%23mermaid-_r_cd_%20.node%20tspan%5Bfont-weight%3D%22normal%22%5D%2C%23mermaid-_r_cd_%20.edgeLabels%20tspan%5Bfont-weight%3D%22normal%22%5D%7Bfont-weight%3A600%3B%7D%23mermaid-_r_cd_%20.edgeLabel%20.label%20rect%7Bopacity%3A1%3Brx%3A13px%3Bry%3A13px%3Bfill%3A%23fff5f0%3Bstroke%3Argb\(229%2C%20208%2C%20195\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_cd_%20.node%20rect%2C%23mermaid-_r_cd_%20.node%20circle%2C%23mermaid-_r_cd_%20.node%20ellipse%2C%23mermaid-_r_cd_%20.node%20polygon%2C%23mermaid-_r_cd_%20.node%20path%7Bfill%3Argb\(255%2C%20231%2C%20217\)%3Bstroke%3Argba\(0%2C%200%2C%200%2C%200.1\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_cd_%20.node%20rect%7Brx%3A16px%3Bry%3A16px%3B%7D%23mermaid-_r_cd_%20.node.mermaid-decision%20.label-container%7Bfill%3A%23fff5f0%3Bstroke%3Argb\(229%2C%20208%2C%20195\)%3Bstroke-dasharray%3A2%202%3B%7D%23mermaid-_r_cd_%20.edgePaths%20.flowchart-link%7Bstroke%3Argb\(229%2C%20208%2C%20195\)%3Bstroke-width%3A1px%3Bstroke-linecap%3Around%3Bstroke-linejoin%3Around%3B%7D%23mermaid-_r_cd_%20.marker%7Bfill%3Argb\(229%2C%20208%2C%20195\)%3Bstroke%3Argb\(229%2C%20208%2C%20195\)%3B%7D%23mermaid-_r_cd_%20.node%7Bcolor-scheme%3Alight%3B%7D%23mermaid-_r_cd_%20%3Aroot%7B--mermaid-font-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3B%7D%3C%2Fstyle%3E%3Cg%3E%3Cmarker%20id%3D%22mermaid-_r_cd__flowchart-v2-pointEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%22-5%20-5%2010%2010%22%20refX%3D%220%22%20refY%3D%220%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2210%22%20markerHeight%3D%2210%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%200%20L%204%200%20M%200.8180194846605362%20-3.181980515339464%20L%204%200%20L%200.8180194846605362%203.181980515339464%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%20none%3B%20fill%3A%20none%3B%20stroke-linecap%3A%20round%3B%20stroke-linejoin%3A%20round%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_cd__flowchart-v2-pointStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%22-5%20-5%2010%2010%22%20refX%3D%220%22%20refY%3D%220%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2210%22%20markerHeight%3D%2210%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%200%20L%20-4%200%20M%20-0.8180194846605362%20-3.181980515339464%20L%20-4%200%20L%20-0.8180194846605362%203.181980515339464%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%20none%3B%20fill%3A%20none%3B%20stroke-linecap%3A%20round%3B%20stroke-linejoin%3A%20round%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_cd__flowchart-v2-circleEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%2211%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_cd__flowchart-v2-circleStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%22-1%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_cd__flowchart-v2-crossEnd%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%2212%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_cd__flowchart-v2-crossStart%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%22-1%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fg%3E%3Cg%20class%3D%22subgraphs%22%3E%3C%2Fg%3E%3Cg%20class%3D%22nodes%22%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-A-0%22%20transform%3D%22translate\(335.1998469034831%2C%2042\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-84.20812606811523%22%20y%3D%22-30%22%20width%3D%22168.41625213623047%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EUser%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20message%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-B-1%22%20transform%3D%22translate\(335.1998469034831%2C%20142\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-120.7862548828125%22%20y%3D%22-30%22%20width%3D%22241.572509765625%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ELoad%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20authorized%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20context%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-C-3%22%20transform%3D%22translate\(335.1998469034831%2C%20247.54999923706055\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-95.52437591552734%22%20y%3D%22-35.54999923706055%22%20width%3D%22191.0487518310547%22%20height%3D%2271.0999984741211%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-19.549999237060547\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ESafety%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20and%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20intent%3C%2Ftspan%3E%3C%2Ftspan%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%221em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3Eclassification%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%20%20mermaid-decision%22%20id%3D%22flowchart-D-5%22%20transform%3D%22translate\(335.1998469034831%2C%20353.0999984741211\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-77.49687576293945%22%20y%3D%22-30%22%20width%3D%22154.9937515258789%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ENeeds%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20tool%3F%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-E-7%22%20transform%3D%22translate\(113.17312622070312%2C%20619.0999984741211\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-101.17312622070312%22%20y%3D%22-30%22%20width%3D%22202.34625244140625%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EGenerate%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20response%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-F-9%22%20transform%3D%22translate\(361.03213755289715%2C%20519.0999984741211\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-80.3828125%22%20y%3D%22-30%22%20width%3D%22160.765625%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPlan%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20tool%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20call%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-G-11%22%20transform%3D%22translate\(361.03213755289715%2C%20619.0999984741211\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-95.95781326293945%22%20y%3D%22-30%22%20width%3D%22191.9156265258789%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPermission%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20check%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%20%20mermaid-decision%22%20id%3D%22flowchart-H-13%22%20transform%3D%22translate\(361.03213755289715%2C%20719.0999984741211\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-80.93078231811523%22%20y%3D%22-30%22%20width%3D%22161.86156463623047%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ERisky%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20action%3F%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-I-15%22%20transform%3D%22translate\(230.59109497070312%2C%20885.0999984741211\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-96.41796875%22%20y%3D%22-30%22%20width%3D%22192.8359375%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ERequest%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20approval%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-J-17%22%20transform%3D%22translate\(350.0390116373698%2C%201085.099998474121\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-113.91015625%22%20y%3D%22-30%22%20width%3D%22227.8203125%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EExecute%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20approved%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20tool%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-K-19%22%20transform%3D%22translate\(230.59109497070312%2C%20985.0999984741211\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-80.92250061035156%22%20y%3D%22-30%22%20width%3D%22161.84500122070312%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EWait%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20for%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20user%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-L-23%22%20transform%3D%22translate\(350.0390116373698%2C%201185.099998474121\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-77.77046966552734%22%20y%3D%22-30%22%20width%3D%22155.5409393310547%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EVerify%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20result%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-M-25%22%20transform%3D%22translate\(306.51385498046875%2C%201285.099998474121\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-130.57546997070312%22%20y%3D%22-30%22%20width%3D%22261.15093994140625%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPersist%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20action%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20and%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20response%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-N-27%22%20transform%3D%22translate\(306.51385498046875%2C%201385.099998474121\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-75.04390716552734%22%20y%3D%22-30%22%20width%3D%22150.0878143310547%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.75\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ESend%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20result%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edges%20edgePaths%22%3E%3Cpath%20d%3D%22M335.1998469034831%2C72L335.1998469034831%2C100%22%20id%3D%22L_A_B_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_A_B_0%22%20data-points%3D%22W3sieCI6MzM1LjE5OTg0NjkwMzQ4MzEsInkiOjcyfSx7IngiOjMzNS4xOTk4NDY5MDM0ODMxLCJ5IjoxMDR9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M335.1998469034831%2C172L335.1998469034831%2C200%22%20id%3D%22L_B_C_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_B_C_0%22%20data-points%3D%22W3sieCI6MzM1LjE5OTg0NjkwMzQ4MzEsInkiOjE3Mn0seyJ4IjozMzUuMTk5ODQ2OTAzNDgzMSwieSI6MjA0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M335.1998469034831%2C283.0999984741211L335.1998469034831%2C311.0999984741211%22%20id%3D%22L_C_D_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_C_D_0%22%20data-points%3D%22W3sieCI6MzM1LjE5OTg0NjkwMzQ4MzEsInkiOjI4My4wOTk5OTg0NzQxMjExfSx7IngiOjMzNS4xOTk4NDY5MDM0ODMxLCJ5IjozMTUuMDk5OTk4NDc0MTIxMX1d%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M309.36755625406903%2C383.0999984741211L309.36755625406903%2C396.31704244882644Q309.36755625406903%2C398.0999984741211%20308.28176981644214%2C399.5142120364942L308.28176981644214%2C399.5142120364942Q307.19598337881524%2C400.9284255988673%20305.78176981644214%2C402.0142120364942L305.78176981644214%2C402.0142120364942Q304.36755625406903%2C403.0999984741211%20302.5846002287744%2C403.0999984741211L119.95608224599778%2C403.0999984741211Q118.17312622070312%2C403.0999984741211%20116.75891265833003%2C404.185784911748L116.75891265833003%2C404.185784911748Q115.34469909595694%2C405.2715713493749%20114.25891265833005%2C406.685784911748L114.25891265833003%2C406.685784911748Q113.17312622070312%2C408.0999984741211%20113.17312622070312%2C409.88295449941575L113.17312622070312%2C519.0999984741211L113.17312622070312%2C577.0999984741211%22%20id%3D%22L_D_E_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_D_E_0%22%20data-points%3D%22W3sieCI6MzA5LjM2NzU1NjI1NDA2OTAzLCJ5IjozODMuMDk5OTk4NDc0MTIxMX0seyJ4IjozMDkuMzY3NTU2MjU0MDY5MDMsInkiOjQwMy4wOTk5OTg0NzQxMjExfSx7IngiOjExMy4xNzMxMjYyMjA3MDMxMiwieSI6NDAzLjA5OTk5ODQ3NDEyMTF9LHsieCI6MTEzLjE3MzEyNjIyMDcwMzEyLCJ5Ijo1MTkuMDk5OTk4NDc0MTIxMX0seyJ4IjoxMTMuMTczMTI2MjIwNzAzMTIsInkiOjU4MS4wOTk5OTg0NzQxMjExfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M361.03213755289715%2C383.0999984741211L361.03213755289715%2C477.0999984741211%22%20id%3D%22L_D_F_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_D_F_0%22%20data-points%3D%22W3sieCI6MzYxLjAzMjEzNzU1Mjg5NzE1LCJ5IjozODMuMDk5OTk4NDc0MTIxMX0seyJ4IjozNjEuMDMyMTM3NTUyODk3MTUsInkiOjQ4MS4wOTk5OTg0NzQxMjExfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M361.03213755289715%2C549.0999984741211L361.03213755289715%2C577.0999984741211%22%20id%3D%22L_F_G_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_F_G_0%22%20data-points%3D%22W3sieCI6MzYxLjAzMjEzNzU1Mjg5NzE1LCJ5Ijo1NDkuMDk5OTk4NDc0MTIxMX0seyJ4IjozNjEuMDMyMTM3NTUyODk3MTUsInkiOjU4MS4wOTk5OTg0NzQxMjExfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M361.03213755289715%2C649.0999984741211L361.03213755289715%2C677.0999984741211%22%20id%3D%22L_G_H_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_G_H_0%22%20data-points%3D%22W3sieCI6MzYxLjAzMjEzNzU1Mjg5NzE1LCJ5Ijo2NDkuMDk5OTk4NDc0MTIxMX0seyJ4IjozNjEuMDMyMTM3NTUyODk3MTUsInkiOjY4MS4wOTk5OTg0NzQxMjExfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M334.0552113850912%2C749.0999984741211L334.0552113850912%2C762.3170424488264Q334.0552113850912%2C764.0999984741211%20332.9694249474643%2C765.5142120364942L332.9694249474643%2C765.5142120364942Q331.8836385098374%2C766.9284255988673%20330.4694249474643%2C768.0142120364942L330.4694249474643%2C768.0142120364942Q329.0552113850912%2C769.0999984741211%20327.27225535979653%2C769.0999984741211L237.37405099599778%2C769.0999984741211Q235.59109497070312%2C769.0999984741211%20234.17688140833002%2C770.185784911748L234.17688140833002%2C770.185784911748Q232.76266784595694%2C771.2715713493749%20231.67688140833005%2C772.685784911748L231.67688140833002%2C772.685784911748Q230.59109497070312%2C774.0999984741211%20230.59109497070312%2C775.8829544994157L230.59109497070312%2C843.0999984741211%22%20id%3D%22L_H_I_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_H_I_0%22%20data-points%3D%22W3sieCI6MzM0LjA1NTIxMTM4NTA5MTIsInkiOjc0OS4wOTk5OTg0NzQxMjExfSx7IngiOjMzNC4wNTUyMTEzODUwOTEyLCJ5Ijo3NjkuMDk5OTk4NDc0MTIxMX0seyJ4IjoyMzAuNTkxMDk0OTcwNzAzMTIsInkiOjc2OS4wOTk5OTg0NzQxMjExfSx7IngiOjIzMC41OTEwOTQ5NzA3MDMxMiwieSI6ODQ3LjA5OTk5ODQ3NDEyMTF9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M388.0090637207031%2C749.0999984741211L388.0090637207031%2C802.0999984741211L388.0090637207031%2C985.0999984741211L388.0090637207031%2C1043.099998474121%22%20id%3D%22L_H_J_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_H_J_0%22%20data-points%3D%22W3sieCI6Mzg4LjAwOTA2MzcyMDcwMzEsInkiOjc0OS4wOTk5OTg0NzQxMjExfSx7IngiOjM4OC4wMDkwNjM3MjA3MDMxLCJ5Ijo4MDIuMDk5OTk4NDc0MTIxMX0seyJ4IjozODguMDA5MDYzNzIwNzAzMSwieSI6OTg1LjA5OTk5ODQ3NDEyMTF9LHsieCI6Mzg4LjAwOTA2MzcyMDcwMzEsInkiOjEwNDcuMDk5OTk4NDc0MTIxfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M230.59109497070312%2C915.0999984741211L230.59109497070312%2C943.0999984741211%22%20id%3D%22L_I_K_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_I_K_0%22%20data-points%3D%22W3sieCI6MjMwLjU5MTA5NDk3MDcwMzEyLCJ5Ijo5MTUuMDk5OTk4NDc0MTIxMX0seyJ4IjoyMzAuNTkxMDk0OTcwNzAzMTIsInkiOjk0Ny4wOTk5OTg0NzQxMjExfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M230.59109497070312%2C1015.0999984741211L230.59109497070312%2C1028.3170424488264Q230.59109497070312%2C1030.099998474121%20231.67688140833002%2C1031.5142120364942L231.67688140833005%2C1031.5142120364942Q232.76266784595694%2C1032.9284255988673%20234.17688140833002%2C1034.0142120364942L234.17688140833002%2C1034.0142120364942Q235.59109497070312%2C1035.099998474121%20237.37405099599778%2C1035.099998474121L305.28600352874184%2C1035.099998474121Q307.0689595540365%2C1035.099998474121%20308.4831731164096%2C1036.185784911748L308.4831731164096%2C1036.185784911748Q309.8973866787827%2C1037.2715713493749%20310.9831731164096%2C1038.685784911748L310.9831731164096%2C1038.685784911748Q312.0689595540365%2C1040.099998474121%20312.0689595540365%2C1041.8829544994157L312.0689595540365%2C1045.099998474121%22%20id%3D%22L_K_J_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_K_J_0%22%20data-points%3D%22W3sieCI6MjMwLjU5MTA5NDk3MDcwMzEyLCJ5IjoxMDE1LjA5OTk5ODQ3NDEyMTF9LHsieCI6MjMwLjU5MTA5NDk3MDcwMzEyLCJ5IjoxMDM1LjA5OTk5ODQ3NDEyMX0seyJ4IjozMTIuMDY4OTU5NTU0MDM2NSwieSI6MTAzNS4wOTk5OTg0NzQxMjF9LHsieCI6MzEyLjA2ODk1OTU1NDAzNjUsInkiOjEwNDkuMDk5OTk4NDc0MTIxfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M350.0390116373698%2C1115.099998474121L350.0390116373698%2C1143.099998474121%22%20id%3D%22L_J_L_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_J_L_0%22%20data-points%3D%22W3sieCI6MzUwLjAzOTAxMTYzNzM2OTgsInkiOjExMTUuMDk5OTk4NDc0MTIxfSx7IngiOjM1MC4wMzkwMTE2MzczNjk4LCJ5IjoxMTQ3LjA5OTk5ODQ3NDEyMX1d%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M350.0390116373698%2C1215.099998474121L350.0390116373698%2C1243.099998474121%22%20id%3D%22L_L_M_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_L_M_0%22%20data-points%3D%22W3sieCI6MzUwLjAzOTAxMTYzNzM2OTgsInkiOjEyMTUuMDk5OTk4NDc0MTIxfSx7IngiOjM1MC4wMzkwMTE2MzczNjk4LCJ5IjoxMjQ3LjA5OTk5ODQ3NDEyMX1d%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M306.51385498046875%2C1315.099998474121L306.51385498046875%2C1343.099998474121%22%20id%3D%22L_M_N_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_M_N_0%22%20data-points%3D%22W3sieCI6MzA2LjUxMzg1NDk4MDQ2ODc1LCJ5IjoxMzE1LjA5OTk5ODQ3NDEyMX0seyJ4IjozMDYuNTEzODU0OTgwNDY4NzUsInkiOjEzNDcuMDk5OTk4NDc0MTIxfV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M113.17312622070312%2C649.0999984741211L113.17312622070312%2C719.0999984741211L113.17312622070312%2C802.0999984741211L113.17312622070312%2C885.0999984741211L113.17312622070312%2C985.0999984741211L113.17312622070312%2C1085.099998474121L113.17312622070312%2C1185.099998474121L113.17312622070312%2C1228.3170424488264Q113.17312622070312%2C1230.099998474121%20114.25891265833003%2C1231.5142120364942L114.25891265833005%2C1231.5142120364942Q115.34469909595694%2C1232.9284255988673%20116.75891265833003%2C1234.0142120364942L116.75891265833003%2C1234.0142120364942Q118.17312622070312%2C1235.099998474121%20119.95608224599778%2C1235.099998474121L256.2057422982731%2C1235.099998474121Q257.98869832356775%2C1235.099998474121%20259.40291188594085%2C1236.185784911748L259.40291188594085%2C1236.185784911748Q260.81712544831396%2C1237.2715713493749%20261.90291188594085%2C1238.685784911748L261.90291188594085%2C1238.685784911748Q262.98869832356775%2C1240.099998474121%20262.98869832356775%2C1241.8829544994157L262.98869832356775%2C1245.099998474121%22%20id%3D%22L_E_M_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_E_M_0%22%20data-points%3D%22W3sieCI6MTEzLjE3MzEyNjIyMDcwMzEyLCJ5Ijo2NDkuMDk5OTk4NDc0MTIxMX0seyJ4IjoxMTMuMTczMTI2MjIwNzAzMTIsInkiOjcxOS4wOTk5OTg0NzQxMjExfSx7IngiOjExMy4xNzMxMjYyMjA3MDMxMiwieSI6ODAyLjA5OTk5ODQ3NDEyMTF9LHsieCI6MTEzLjE3MzEyNjIyMDcwMzEyLCJ5Ijo4ODUuMDk5OTk4NDc0MTIxMX0seyJ4IjoxMTMuMTczMTI2MjIwNzAzMTIsInkiOjk4NS4wOTk5OTg0NzQxMjExfSx7IngiOjExMy4xNzMxMjYyMjA3MDMxMiwieSI6MTA4NS4wOTk5OTg0NzQxMjF9LHsieCI6MTEzLjE3MzEyNjIyMDcwMzEyLCJ5IjoxMTg1LjA5OTk5ODQ3NDEyMX0seyJ4IjoxMTMuMTczMTI2MjIwNzAzMTIsInkiOjEyMzUuMDk5OTk4NDc0MTIxfSx7IngiOjI2Mi45ODg2OTgzMjM1Njc3NSwieSI6MTIzNS4wOTk5OTg0NzQxMjF9LHsieCI6MjYyLjk4ODY5ODMyMzU2Nzc1LCJ5IjoxMjQ5LjA5OTk5ODQ3NDEyMX1d%22%20marker-end%3D%22url\(%23mermaid-_r_cd__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabels%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_A_B_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_B_C_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_C_D_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(112.96218872070312%2C%20436.0999984741211\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_D_E_0%22%20transform%3D%22translate\(-8.7890625%2C-7.75\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-12%22%20y%3D%22-5.25%22%20width%3D%2241.578125%22%20height%3D%2226%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ENo%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(360.59463755289715%2C%20436.0999984741211\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_D_F_0%22%20transform%3D%22translate\(-9.0625%2C-7.75\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-12.5%22%20y%3D%22-5.25%22%20width%3D%2243.125%22%20height%3D%2226%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EYes%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_F_G_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_G_H_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(230.15359497070312%2C%20802.0999984741211\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_H_I_0%22%20transform%3D%22translate\(-9.0625%2C-7.75\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-12.5%22%20y%3D%22-5.25%22%20width%3D%2243.125%22%20height%3D%2226%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EYes%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(387.7981262207031%2C%20885.0999984741211\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_H_J_0%22%20transform%3D%22translate\(-8.7890625%2C-7.75\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-12%22%20y%3D%22-5.25%22%20width%3D%2241.578125%22%20height%3D%2226%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ENo%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_I_K_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_K_J_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_J_L_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_L_M_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_M_N_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_E_M_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E)

### Agent state

Python

Run

```
from typing import TypedDict


class AgentState(TypedDict):
    run_id: str
    user_id: str
    scope_type: str
    scope_id: str
    user_message: str
    authorized_context: list[dict]
    planned_actions: list[dict]
    tool_results: list[dict]
    approval_required: bool
    final_response: str
```

This is an illustrative contract. Production code must add strict validation, limits, error handling, and persistent run state.

### Tool architecture

```
Agent Runtime
    │
    ├── Calendar tool
    ├── Task tool
    ├── Reminder tool
    ├── Notification tool
    ├── Group membership tool
    ├── Research tool
    ├── Memory retrieval tool
    └── External messaging adapter
```

Every tool should define:

* Input schema.

* Output schema.

* Required permission.

* Allowed scopes.

* Risk level.

* Approval requirement.

* Audit event.

* Timeout.

* Retry policy.

* Idempotency behavior.

### Example: create reminder

The user says:

> Remind my father to take his medication every day at 8 AM.

The agent must not simply write a reminder from a sentence. It needs to resolve:

1. Which group?

2. Which member?

3. What medication?

4. What exact schedule?

5. What timezone?

6. What notification channel?

7. Who is authorized to create the reminder?

8. Is approval required?

9. Is the medication information complete?

10. What happens if the notification fails?

The agent can ask for missing information, create a draft, request approval, and then invoke the scheduling tool.

# 13. Medication, pregnancy, and health-related assistance

This area requires a separate safety boundary.

Your product can support:

* Storing user-provided medication details.

* Reminder scheduling.

* Caregiver task coordination.

* Approved notifications.

* Doctor and hospital discovery.

* General educational information from reliable sources.

* Appointment planning.

* Escalation to designated caregivers.

It should not independently diagnose conditions, prescribe medications, change dosages, or claim that internet content is medically proven.

### Example: medication reminder architecture

```
User / caregiver
      │
      ▼
Agent conversation
      │
      ▼
Collect medication details
      │
      ▼
Validate required fields
      │
      ▼
Show reminder preview
      │
      ▼
User / authorized caregiver approves
      │
      ▼
Create reminder
      │
      ▼
Scheduler evaluates due time
      │
      ▼
Notification dispatcher
      │
      ├── In-app push
      ├── Email
      └── Approved external messaging
```

### Critical rule

A reminder system is not a medical monitoring system.

If a person does not respond to a reminder, the system must follow a clearly configured escalation policy. It must not assume that a missed response means a medical emergency.

For children, pregnant people, and health-related data, use explicit consent, appropriate access controls, data minimization, and professional review of the safety requirements before launch.

# Part VI — External messaging and WhatsApp

## 14. WhatsApp integration

You mentioned open-source WhatsApp APIs and WhatsApp calls.

Treat this as a provider integration, not a core assumption.

```
Notification Service
       │
       ▼
Provider Interface
       ├── In-app
       ├── Push
       ├── Email
       └── WhatsApp adapter
                │
                ▼
       Approved provider API
```

### Important distinctions

|
Capability

|

Engineering requirement

|
| --- | --- |
|

WhatsApp text messages

|

Supported business/provider API, consent, templates where required

|
|

WhatsApp calls

|

Verify provider support, permissions, and supported call capabilities

|
|

User's personal WhatsApp account automation

|

Do not assume it is supported or safe

|
|

Open-source unofficial APIs

|

Provider stability, account risk, privacy, and legal review

|
|

Emergency health calls

|

Must not depend solely on an AI or unofficial messaging channel

|

Never design the system so a third-party WhatsApp library is the only way to deliver critical reminders.

# Part VII — Android implementation

## 15. Kotlin Jetpack Compose structure

```
android/
├── app/
├── core/
│   ├── common/
│   ├── designsystem/
│   ├── navigation/
│   ├── network/
│   ├── database/
│   └── auth/
├── feature/
│   ├── onboarding/
│   ├── home/
│   ├── discover/
│   ├── pages/
│   ├── groups/
│   ├── messaging/
│   ├── agent/
│   ├── tasks/
│   ├── notifications/
│   └── profile/
└── build-logic/
```

### Android technology

* Kotlin.

* Jetpack Compose.

* ViewModel.

* Coroutines and Flow.

* Hilt.

* Room.

* Retrofit / OkHttp.

* WebSocket client.

* WorkManager.

* Kotlin serialization or another consistent serialization approach.

* Unit tests and Compose UI tests.

### Recommended state pattern

```
Composable
    │
    ▼
ViewModel
    │
    ▼
Use Case
    │
    ▼
Repository
    ├── Remote API
    └── Local Room database
```

Example:

Kotlin

```
data class GroupChatUiState(
    val messages: List<Message> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val hasMore: Boolean = true
)

sealed interface GroupChatEvent {
    data class SendMessage(val text: String) : GroupChatEvent
    data object Retry : GroupChatEvent
    data object LoadMore : GroupChatEvent
}
```

The ViewModel owns screen state. The repository owns data access. The composable renders state and sends events.

# 16. Next.js web architecture

```
web/
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   ├── (auth)/
│   │   ├── (app)/
│   │   │   ├── home/
│   │   │   ├── discover/
│   │   │   ├── pages/
│   │   │   ├── groups/
│   │   │   ├── inbox/
│   │   │   └── settings/
│   ├── components/
│   ├── features/
│   ├── lib/
│   │   ├── api/
│   │   ├── auth/
│   │   └── realtime/
│   └── types/
├── public/
└── tests/
```

### Web rules

* Use server rendering where it helps public content and SEO.

* Use client components for interactive chat and forms.

* Keep API calls behind a typed client layer.

* Do not put secrets in browser code.

* Use responsive layouts.

* Reuse the design system.

* Handle auth expiration and API errors.

* Add end-to-end tests for primary flows.

# Part VIII — Team structure

## 17. Engineering organization

Your proposed five teams are a reasonable starting structure. For an actual startup, use ownership by domain and avoid creating too many specialist roles before there is enough work.

### Leadership

|
Role

|

Responsibility

|
| --- | --- |
|

Founder / Product owner

|

Vision, user needs, priorities, final product decisions

|
|

Technical lead

|

Architecture, engineering standards, technical tradeoffs

|
|

Product architect

|

PRD, user journeys, acceptance criteria

|
|

Design lead

|

UX direction, design system, prototypes

|
|

Engineering leads

|

Delivery, code quality, technical planning

|
|

Security / privacy owner

|

Risk, access, retention, data protection

|
|

QA / SRE owner

|

Quality, reliability, operations

|

### Team A — Product and design

* Product architect.

* UI/UX designer.

* Design system designer.

* User research / UX testing.

### Team B — Client engineering

* Android lead.

* Compose developers.

* Android data and sync developer.

* Web developers.

* Realtime client developer.

* QA automation developer.

### Team C — Backend and platform

* Backend lead.

* Identity engineer.

* Community / pages engineer.

* Groups engineer.

* Messaging engineer.

* Scheduling / notifications engineer.

* Data engineer.

* Platform engineer.

### Team D — AI and agents

* Agent architect.

* LangGraph engineer.

* Tool integration engineer.

* Memory / retrieval engineer.

* Safety engineer.

* Evaluation engineer.

### Team E — Quality, security, operations

* QA lead.

* Security engineer.

* Performance engineer.

* DevOps / SRE.

* Data protection owner.

* Release engineer.

### Developer responsibility contract

Every completed task must include:

* Code.

* Unit tests.

* Integration tests where appropriate.

* API contract changes.

* Database migration notes.

* ADR when architecture changes.

* Security considerations.

* Operational runbook updates.

* Demo instructions.

* Known limitations.

# Part IX — Repository structure

## 18. Monorepo

```
community-platform/
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODEOWNERS
├── .github/
│   └── workflows/
├── docs/
│   ├── prd/
│   ├── architecture/
│   ├── adr/
│   ├── api/
│   ├── security/
│   ├── runbooks/
│   └── demos/
├── android/
├── web/
├── backend/
├── agent/
├── infra/
│   ├── docker/
│   ├── terraform/
│   └── kubernetes/
├── packages/
│   └── api-contracts/
└── scripts/
```

### Branching and pull requests

Use short-lived feature branches and small pull requests.

A pull request should answer:

* What problem does this solve?

* Which requirements does it implement?

* What changed in the database?

* What tests were added?

* What security implications exist?

* How do we run the demo?

* What remains incomplete?

# Part X — Development roadmap

## 19. Milestones

These are proposed milestones, not promises about calendar duration. The duration depends on team size, experience, and scope.

0

### Foundation

PRD, architecture, database conventions, design system, repository, local development.

Exit: all foundations reviewed

1

### Identity and public community

Registration, profiles, pages, posts, discovery, follows, comments, basic moderation.

Exit: public community flow works end to end

2

### Private groups and chat

Family group creation, membership, invitations, permissions, chat, sync, notifications.

Exit: private group access and messaging verified

3

### Planning and reminders

Tasks, schedules, recurrence, timezone handling, notification dispatch, acknowledgement.

Exit: reliable approved reminder flow

4

### Agent MVP

Conversation, group-scoped context, tool calls, approvals, task creation, basic memory.

Exit: agent actions are safe and auditable

5

### Production readiness

Security, load testing, observability, backup/restore, failure handling, deployment, release.

Exit: production acceptance criteria pass

# Part XI — End-to-end demo plan

## 20. The first complete demo

The demo should prove one coherent user journey, not show 100 disconnected features.

### Demo sequence

1. Launch Android app

   Show welcome, registration, and successful login.

2. Create an account

   Display profile setup and privacy defaults.

3. Create a family group

   Enter group name, add an invited member, show the group agent configuration.

4. Open group chat

   Send messages from two test accounts. Demonstrate persistence, delivery, and reconnect.

5. Ask the agent

   Ask the agent to create a task or reminder. Show its interpretation and preview.

6. Approve the action

   The user approves. The backend creates the task and records the action.

7. Show the reminder

   Use a test schedule. Trigger a notification and show acknowledgement.

8. Demonstrate reliability

   Simulate a failed notification, retry, duplicate request, and WebSocket reconnect.

9. Show public community

   Create a public page, publish a post, comment, follow, and moderate a test item.

### Demo acceptance criteria

* All screens load.

* All important actions have loading, error, and success states.

* API failures do not corrupt data.

* Duplicate submissions do not create duplicate tasks.

* Unauthorized users cannot read private group data.

* Agent actions are visible and auditable.

* The demo can be run from a clean environment.

* All test data is synthetic.

* The README contains exact setup and run instructions.

# Part XII — Production engineering rules

## 21. Security

Required from the beginning:

* Strong authentication.

* Authorization on every protected resource.

* Group-scoped access checks.

* Secure token/session handling.

* Secret management.

* Encryption in transit and at rest.

* Rate limiting.

* Input validation.

* File upload validation.

* Audit logging.

* Data deletion and retention policies.

* Threat modeling.

* Prompt injection defenses.

* Tool permission enforcement.

* No sensitive data in logs.

### Agent security rules

The agent must not:

* Bypass group permissions.

* Read another group's messages.

* Expose private member data.

* Execute external actions without authorization.

* Treat user-provided instructions as system policy.

* Reveal internal prompts, credentials, or secrets.

* Make medical diagnoses or medication changes.

* Send external messages without the required consent and permission.

* Store every conversation by default as permanent memory.

## 22. Reliability and performance

### Reliability

* Database transactions.

* Idempotent writes.

* Outbox pattern for durable events.

* Background job retries.

* Dead-letter handling.

* Health checks.

* Graceful shutdown.

* Backups and restore testing.

* Failure alerts.

* Runbooks.

* Rollback procedures.

### Performance

* PostgreSQL indexes.

* Cursor pagination.

* Connection pooling.

* Redis caching where appropriate.

* Async I/O.

* Background workers for slow tasks.

* Streaming agent responses.

* Bounded agent loops.

* Query profiling.

* Load testing.

Do not promise millisecond-level completion for LLM research, external APIs, or complex workflows. Optimize for fast acknowledgment and responsive UI while long operations run asynchronously.

### Observability

Track:

* Request latency.

* Error rate.

* WebSocket connection health.

* Message delivery latency.

* Queue depth.

* Job failures.

* Agent execution duration.

* Token usage and cost.

* Tool errors.

* Approval rates.

* Reminder delivery success.

* Database health.

Use trace IDs across API requests, jobs, and agent runs.

# Part XIII — What not to do

## 23. Startup mistakes and their impact

|
Mistake

|

Bad impact

|

Better approach

|
| --- | --- | --- |
|

Build everything at once

|

Endless scope, no working product

|

Milestone-based MVP

|
|

Start with microservices

|

High operational complexity

|

Modular monolith

|
|

Let the agent access all data

|

Privacy and security failures

|

Scoped permissions

|
|

Trust UI permissions

|

Unauthorized access

|

Backend enforcement

|
|

Use unofficial messaging APIs as a foundation

|

Provider/account instability

|

Provider abstraction

|
|

Store all chat as memory

|

Privacy and irrelevant context

|

Explicit memory policy

|
|

No database migrations

|

Schema corruption

|

Versioned migrations

|
|

No idempotency

|

Duplicate reminders and messages

|

Idempotency keys

|
|

No load testing

|

Production outages

|

Capacity tests

|
|

No design system

|

Inconsistent UX

|

Shared component library

|
|

No acceptance criteria

|  |  |



anything else 


Yes. There are several important areas still missing from the blueprint. The previous answer covered the main product modules, but it was not yet a complete production specification.

The biggest missing pieces are the exact data contracts, agent execution lifecycle, privacy model, scheduling reliability, deployment architecture, and the developer-by-developer implementation backlog.

Below is the next layer of the project.

# Part XIV — Missing architecture decisions

## 24. The product needs a context model

Your platform has public pages, private groups, couples, solo spaces, and temporary event groups. These should share one consistent model.

### Context hierarchy

```
User
 ├── Public profile
 ├── Personal space
 ├── Public pages
 │    ├── Festival page
 │    ├── Community page
 │    └── Event page
 ├── Private spaces
 │    ├── Family
 │    ├── Couple
 │    └── Custom group
 └── Agent workspaces
      ├── Personal agent
      ├── Family agent
      └── Page / event agent
```

### Why this matters

Without a context model, developers will create different permission systems for every feature.

For example:

* The family agent may access family tasks.

* The public page agent may help summarize page content.

* The couple agent may assist with shared planning.

* The solo agent may manage personal tasks.

* A festival group agent may coordinate a temporary event.

The agent runtime can be shared, but the data scope, permissions, and memory policy must be different.

## 25. You need a dedicated permissions architecture

The previous plan mentioned roles, but a complete system needs permissions at the resource and action level.

### Permission matrix

|
Action

|

Public page member

|

Family member

|

Group admin

|

Agent

|
| --- | --- | --- | --- | --- |
|

View public page

|

Per visibility

|

—

|

—

|

Allowed by policy

|
|

Create public post

|

Per page policy

|

—

|

—

|

Only if authorized

|
|

View private group

|

—

|

Yes

|

Yes

|

Scoped

|
|

Invite member

|

—

|

Per policy

|

Yes

|

Only with authorization

|
|

Remove member

|

—

|

No

|

Per policy

|

Cannot bypass

|
|

Create reminder

|

—

|

Per policy

|

Per policy

|

Propose / execute per policy

|
|

Send external message

|

—

|

Per consent

|

Per consent

|

Explicitly authorized

|
|

Delete group

|

—

|

No

|

Owner / authorized

|

Never autonomously

|

This is only an initial policy example. The actual permissions must be defined for each resource and action.

### Additional missing permissions

* Page ownership transfer.

* Co-admins.

* Blocked users.

* Banned users.

* Pending invitations.

* Expired invitations.

* Group deletion.

* Account deletion.

* Agent access revocation.

* Member removal while tasks are active.

* Data export.

* Temporary event expiry.

# 26. Your data model needs a stronger separation

You should not mix all user information into one giant profile or agent memory table.

### Recommended data domains

```
Identity data
    users, profiles, sessions

Social data
    pages, posts, comments, reactions, follows

Private collaboration
    groups, memberships, invitations, conversations

Planning data
    tasks, reminders, schedules, acknowledgements

Agent data
    agent_configs, agent_runs, agent_actions, memories

Sensitive data
    restricted records, consent, access policies

Operations
    outbox_events, jobs, audit_events, delivery_attempts
```

### Important new tables

|
Table

|

Why it matters

|
| --- | --- |
|

`agent_configs`

|

Configuration per agent scope

|
|

`agent_permissions`

|

Explicit tool and data access

|
|

`agent_runs`

|

Track execution lifecycle

|
|

`agent_steps`

|

Debug graph execution

|
|

`agent_actions`

|

Track proposed and executed actions

|
|

`approval_requests`

|

Human approval workflow

|
|

`outbox_events`

|

Reliable event publishing

|
|

`scheduled_jobs`

|

Durable scheduled work

|
|

`delivery_attempts`

|

Track notification attempts

|
|

`consents`

|

Consent and authorization records

|
|

`data_access_logs`

|

Sensitive data access auditing

|
|

`memory_policies`

|

What can be retained and for how long

|

# Part XV — Agent execution lifecycle

## 27. You need a real agent runtime, not just LangGraph

LangGraph handles graph execution. Your platform needs a complete lifecycle around it.

## Agent run lifecycle

1. Receive request

   User sends a message or a scheduled job triggers the agent.

2. Create run

   Generate a run ID and persist the request.

3. Resolve context

   Determine user, group, page, permissions, and relevant data.

4. Plan

   LangGraph chooses the next steps within defined limits.

5. Validate tool access

   The backend checks authorization independently of the model.

6. Approve if required

   The user or authorized admin confirms the action.

7. Execute

   Invoke the tool with timeout, idempotency, and audit logging.

8. Verify

   Check the result and determine whether the action succeeded.

9. Complete

   Persist the final response, action result, and metrics.

### Missing agent features

* Run cancellation.

* Timeout handling.

* Retry limits.

* Loop detection.

* Budget limits.

* Model fallback.

* Tool failure recovery.

* Human approval expiration.

* Partial completion.

* Resume after worker crash.

* Agent versioning.

* Prompt/version management.

* Evaluation datasets.

* Conversation summarization.

* Memory deletion.

These are required before calling the agent system production-ready.

# 28. The agent needs a tool registry

Instead of hardcoding every tool inside the agent, define a registry.

Python

Run

```
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    required_permission: str
    requires_approval: bool
    timeout_seconds: int
    handler: Callable
```

Example registry:

```
calendar.create_event
tasks.create
reminders.create
notifications.send
groups.invite_member
memory.search
research.search
```

### Production rule

The model may request a tool, but the model does not decide whether it is authorized.

The execution layer decides.

```
LLM request
    │
    ▼
Tool registry
    │
    ▼
Permission check
    │
    ▼
Approval check
    │
    ▼
Execute tool
    │
    ▼
Audit + result
```

# Part XVI — Scheduling and reminder architecture

## 29. The scheduler is a separate reliability problem

You specifically want the agent to manage:

* Family reminders.

* Medication reminders.

* Appointments.

* Calendar events.

* Tasks.

* Recurring schedules.

* Notifications.

* Escalation.

The agent should create schedules, but it should not be responsible for waking itself up at the right time.

### Correct architecture

```
Agent
  │
  ▼
Create / update reminder
  │
  ▼
PostgreSQL
  │
  ▼
Scheduler worker
  │
  ▼
Due job
  │
  ▼
Notification dispatcher
  │
  ├── Push
  ├── In-app
  ├── Email
  └── Approved external provider
```

### Missing scheduling rules

* Timezone support.

* Daylight saving time.

* Recurrence rules.

* Duplicate prevention.

* Missed job recovery.

* Retry with backoff.

* Delivery status.

* User acknowledgement.

* Escalation policy.

* Quiet hours.

* Notification preferences.

* Schedule cancellation.

* Task reassignment.

* User deletion.

* Provider outage handling.

### Example reminder schema

```
reminders
├── id
├── owner_id
├── group_id
├── created_by
├── assigned_to
├── title
├── description
├── timezone
├── recurrence_rule
├── next_run_at
├── status
├── approval_status
├── created_at
└── updated_at
```

Use a durable scheduler with a clear job state machine. Redis alone should not be treated as the permanent source of scheduled reminders.


# Part XVII — More missing product modules

## 30. Account and identity management

The previous plan needs a complete identity system.

### Required features

* Registration and login.

* Email verification.

* Phone verification.

* Session management.

* Logout from all devices.

* Account recovery.

* Profile and username.

* Profile visibility.

* Block and unblock.

* Account deletion.

* Data export.

* Consent management.

* Device management.

* Notification preferences.

* Language and timezone.

### Important decisions

Phone numbers are not group membership.

A phone number can be used to invite someone, but the person should become a group member only after the invitation and membership rules are satisfied.

Do not automatically expose a person's phone number to all group members.

## 31. Public community architecture

You asked for a global community where people can create pages, posts, comments, likes, shares, and events.

The missing design areas are:

### Page types

* General community.

* Festival.

* Event.

* Organization.

* Interest.

* Educational.

* Local community.

* Temporary event page.

### Page lifecycle

```
Create draft
    ↓
Configure identity
    ↓
Configure visibility
    ↓
Publish
    ↓
Manage posts and members
    ↓
Moderate
    ↓
Archive or delete
```

### Missing social features

* Post editing.

* Post deletion.

* Draft posts.

* Media upload.

* Image processing.

* Comment pagination.

* Comment moderation.

* Reaction removal.

* Share privacy.

* Report content.

* Block page.

* Follow notifications.

* Search indexing.

* Content ranking.

* Spam prevention.

* Rate limits.

* Page analytics.

* Admin moderation queue.

### Discovery architecture

Do not begin with an expensive AI recommendation engine.

Start with:

```
Search index
    │
    ├── Pages
    ├── Posts
    ├── Events
    └── Public profiles
```

Then add personalized discovery after you have real usage data and a clear ranking policy.

# 32. Private groups need a formal lifecycle

### Family group

A family group can contain:

* Owner.

* Admins.

* Members.

* Invitations.

* Tasks.

* Shared events.

* Group chat.

* Agent configuration.

* Notification preferences.

### Couple group

A couple group should have:

* Exactly two active members under its couple membership policy.

* Shared tasks and planning.

* Private chat.

* Shared agent assistance.

* Explicit privacy boundaries.

* Optional child-care workspace with separate access rules.

Important: A couple group should not automatically collect all private couple messages into memory.

### Solo space

A solo space can contain:

* Personal tasks.

* Personal reminders.

* Private notes.

* Personal agent.

* Optional calendar integrations.

* Personal preferences.

### Custom group

Custom groups need:

* Member limits.

* Roles.

* Invite policy.

* Group visibility.

* Join policy.

* Agent permissions.

* Content retention.

* Group lifecycle.

### Temporary event group

This is useful for weddings, festivals, trips, and short-term projects.

Additional fields:

```
expires_at
archived_at
retention_policy
```

But expiration should not automatically delete all data. The product needs a clear archive, export, and deletion policy.

# Part XVIII — Privacy and data protection

## 33. You need a privacy architecture before health-related features

This is one of the most important missing parts.

Your platform may contain:

* Family relationships.

* Phone numbers.

* Private conversations.

* Child-related information.

* Medication information.

* Pregnancy-related information.

* Personal schedules.

* Sensitive couple conversations.

These should not all have the same storage and access rules.

### Data classification

|
Level

|

Examples

|

Default handling

|
| --- | --- | --- |
|

Public

|

Published page, public post

|

Public according to visibility

|
|

Private

|

Group messages, private tasks

|

Authorized members only

|
|

Sensitive

|

Health details, child information, private relationship data

|

Restricted access, explicit policy

|
|

Security-critical

|

Passwords, tokens, secrets

|

Never expose to agent or logs

|

### Agent memory policy

The default should be:

> The agent may use authorized context to answer the current request. Long-term memory requires an explicit retention policy.

You can support three memory modes:

1. Session context — Used during the current conversation.

2. Scoped memory — Retained for a specific user, group, or page according to policy.

3. No-retention sensitive context — Not stored as reusable agent memory.

A memory system should have:

* Scope.

* Owner.

* Source.

* Retention.

* Sensitivity classification.

* Deletion behavior.

* Access policy.

* Audit trail.

# Part XIX — AI safety and evaluation

## 34. Agent safety needs its own engineering program

You should have more than one safety developer responsible for a production agent.

### Required safety controls

* Prompt injection defenses.

* Tool allowlists.

* Permission enforcement.

* Sensitive-data filtering.

* Output validation.

* Approval workflows.

* Agent run limits.

* Tool timeouts.

* Audit logs.

* External communication safeguards.

* Sensitive content retention controls.

* Human escalation.

* Evaluation datasets.

* Incident response.

### Agent evaluation metrics

Do not measure the agent only by how fluent its answers are.

Track:

|
Metric

|

Purpose

|
| --- | --- |
|

Task success rate

|

Did the intended task complete?

|
|

Tool correctness

|

Did the agent select the correct tool?

|
|

Permission violations

|

Did it attempt unauthorized access?

|
|

Hallucination rate

|

Did it invent unsupported information?

|
|

Approval correctness

|

Did it request approval when needed?

|
|

Reminder correctness

|

Was the schedule created correctly?

|
|

Latency

|

How long did the run take?

|
|

Cost

|

How much did execution consume?

|
|

Recovery rate

|

Can failed workflows recover?

|

### Critical testing examples

* Agent attempts to read another family group's data.

* User asks the agent to send a message without permission.

* Agent receives malicious instructions in a public post.

* Agent is asked to change medication dosage.

* Agent is asked to delete a group.

* Agent is asked to expose a private conversation.

* Agent receives conflicting instructions from two members.

* Agent loses network access while executing a task.

# Part XX — Production infrastructure

## 35. Deployment architecture

Your Docker Compose setup is for local development. Production needs separate infrastructure.

```
                    Internet
                       │
                       ▼
              CDN / Load Balancer
                       │
               ┌───────┴────────┐
               │                │
               ▼                ▼
          Next.js Web      API Gateway
                                │
                ┌───────────────┼──────────────┐
                ▼               ▼              ▼
           FastAPI API    WebSocket        Agent API
                │               │              │
                └───────┬───────┴───────┬──────┘
                        │               │
                        ▼               ▼
                   PostgreSQL        Redis
                        │               │
                        ▼               ▼
                  Object Storage    Job Workers
                                        │
                                        ▼
                                External Providers
```

### Missing infrastructure decisions

* Cloud provider.

* Region.

* DNS.

* TLS certificates.

* Secret manager.

* Database backups.

* Database replicas.

* Object storage lifecycle.

* Queue technology.

* Worker autoscaling.

* Container orchestration.

* CI/CD deployment strategy.

* Staging environment.

* Production environment.

* Disaster recovery.

* Cost budgets.

* Incident management.

### Practical startup deployment

Start with:

```
Docker Compose
    ↓
Managed PostgreSQL
    ↓
Managed Redis
    ↓
Object storage
    ↓
Container deployment
    ↓
Monitoring + backups
```

Move to more complex orchestration only when workload and operational requirements justify it.

# 36. API contracts need a versioned specification

The previous API list was not enough for implementation.

You need a complete contract for each endpoint.

Example:

YAML

```
POST /api/v1/groups
```

### Request

JSON

```
{
  "name": "My Family",
  "description": "Family coordination",
  "type": "family",
  "visibility": "private",
  "agent_enabled": true
}
```

### Response

JSON

```
{
  "id": "group_uuid",
  "name": "My Family",
  "type": "family",
  "visibility": "private",
  "created_by": "user_uuid",
  "agent": {
    "id": "agent_uuid",
    "status": "active"
  },
  "created_at": "2026-09-17T12:00:00Z"
}
```

### Error cases

```
401 UNAUTHENTICATED
403 FORBIDDEN
409 DUPLICATE_GROUP
422 VALIDATION_ERROR
429 RATE_LIMITED
500 INTERNAL_ERROR
```

For production, the exact schemas should be generated and validated using OpenAPI and typed client generation.

# Part XXI — Developer task system

## 37. How to give tasks to developers like a top engineering organization

Do not assign tasks as:

> Build the complete agent system.

Break the work into epics, stories, tasks, dependencies, and acceptance criteria.

### Example: Group creation epic

Epic

## Family group creation

Owner: Groups backend + Android + Web

Task G-001 — Database schema

Create groups, memberships, and agent configuration tables. Add migrations and constraints.

Deliver: migration + tests

Task G-002 — Create group API

Implement authenticated creation, validation, transaction, and response schema.

Deliver: API + contract tests

Task G-003 — Android screen

Compose form, validation, loading, success, error, and retry behavior.

Deliver: UI + tests

Task G-004 — Web screen

Responsive form and API integration.

Deliver: page + tests

Task G-005 — Agent provisioning

Create group agent configuration, permissions, and audit event.

Deliver: service + tests

Task G-006 — End-to-end acceptance

Create group, invite test member, open chat, verify access, and run agent workflow.

Deliver: passing demo

### Task definition standard

Every ticket should contain:

```
ID
Title
Epic
Owner
Dependencies
Business context
Technical requirements
API contract
Database changes
UI requirements
Security requirements
Test cases
Acceptance criteria
Definition of done
```

# Part XXII — Startup operating model

## 38. How to handle a large startup idea without losing control

The challenge is not only writing code. It is managing scope, people, decisions, and operational risk.

### Weekly engineering rhythm

|
Cadence

|

Activity

|
| --- | --- |
|

Daily

|

Standup, blockers, task progress

|
|

Weekly

|

Product planning, architecture review, demo

|
|

Every 2 weeks

|

Sprint review and retrospective

|
|

Monthly

|

Security review, cost review, roadmap review

|
|

Every release

|

Regression tests, deployment checklist, rollback readiness

|

### Core documentation

* PRD.

* Product roadmap.

* Architecture overview.

* ADRs.

* API specifications.

* Database schema.

* Security threat model.

* Data retention policy.

* Agent tool registry.

* Agent evaluation report.

* Runbooks.

* Incident reports.

* Release notes.

### Engineering decision authority

You need to decide who can approve:

* Product scope.

* Architecture changes.

* Database changes.

* Security exceptions.

* External provider integrations.

* Agent capabilities.

* Production releases.

Without decision ownership, large teams create conflicting implementations.

# Part XXIII — Astra implementation plan

## 39. How to use Astra to build this product

If by Astra you mean the GPT-6 Astra Copilot model you mentioned previously, the correct approach is to use it as a development assistant—not as an autonomous replacement for the engineering team.

It can help generate:

* Architecture documents.

* Database schemas.

* API contracts.

* Kotlin Compose screens.

* Next.js components.

* FastAPI modules.

* LangGraph workflows.

* Unit tests.

* Integration tests.

* Documentation.

* Debugging plans.

* Review checklists.

But it cannot guarantee that an entire large application is correct, secure, or production-ready merely because you provide a very long prompt.

### The right workflow

```
Master Product Specification
          │
          ▼
Architecture Review
          │
          ▼
Milestone Specification
          │
          ▼
Developer Task Specification
          │
          ▼
Astra generates implementation
          │
          ▼
Run code and tests
          │
          ▼
Review and fix
          │
          ▼
Merge into repository
          │
          ▼
Next task
```

### Astra must work against the repository

Do not ask it to remember hundreds of thousands of lines of code from a chat.

It should inspect:

* Existing repository files.

* Current database migrations.

* API contracts.

* Existing tests.

* Architecture decisions.

* Current task.

* Known bugs.

* Build commands.

Every generated change must be reviewed, tested, and integrated into the actual project.

# Part XXIV — What is still needed for a truly complete specification?

The following areas should be added to the master project document.

## 40. Final missing-topic checklist

## Master plan readiness

Track the documentation areas that have been specified.

0 / 61

Product

Complete PRD and product glossary

User personas and user journeys

MVP / Phase 2 / Phase 3 scope

Product analytics and success metrics

Pricing and business model decisions

Architecture

Context model

Permission matrix

Service boundaries

API contract catalog

Database relationship specification

Event catalog

Failure handling architecture

UI/UX

Complete Figma design system

All screen specifications

Navigation contract

Component states

Accessibility requirements

Responsive web layouts

UX research and usability testing

Backend

Complete schema and migrations

Repository/service standards

OpenAPI specification

Idempotency strategy

Outbox and worker architecture

Pagination and indexing plan

Agents

Agent runtime lifecycle

Tool registry

Memory architecture

Approval system

Safety policy

Evaluation suite

Model/provider abstraction

Cost and token budgets

Scheduling

Durable scheduler

Timezone and recurrence rules

Delivery retry system

Notification preferences

Escalation policies

External provider contracts

Security

Threat model

Data classification

Privacy policy requirements

Consent management

Secret management

Penetration testing plan

Incident response

Operations

Cloud deployment design

CI/CD pipeline

Monitoring dashboards

Backup and restore

Disaster recovery

Load testing

Capacity planning

Release process

Execution

Team ownership matrix

Developer task backlog

Definition of done

Code review rules

Milestone exit criteria

Demo scripts

Production launch checklist

Reset checklist

# Recommended next step

We should now stop adding broad topics and start building the actual master specification in numbered chapters.

The next chapter should be:

Next chapter

# Chapter 1 — Complete Product Requirements Specification

A full product definition covering the vision, personas, use cases, core features, non-core features, product boundaries, user journeys, business rules, MVP scope, and acceptance criteria for every major module.

Start Chapter 1

After Chapter 1, we should proceed in this order:

1. Product Requirements Specification.

2. UX and UI/UX Master Plan.

3. Complete Database and Data Model.

4. Backend Architecture and API Contracts.

5. Real-time Messaging and Notification System.

6. Agent Architecture and LangGraph Runtime.

7. Security, Privacy, and Safety.

8. Android Architecture and Screen Implementation.

9. Web Architecture and Screen Implementation.

10. Developer Task Backlog and Repository.

11. Testing, Observability, and Production Infrastructure.

12. Complete Runnable Project and End-to-End Demo.

That sequence will turn the idea into an actual engineering specification instead of a list of technologies.
