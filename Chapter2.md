# Chapter 2 — Global Community Architecture

## 2.1 Purpose

The Global Community module is the public-facing part of the platform. It allows users to discover, follow, create, publish, discuss, and organize around public content.

It must remain technically and logically separate from private spaces such as:

* Family groups

* Couple spaces

* Solo spaces

* Custom private groups

* Private agent conversations

* Private tasks and reminders

* Sensitive personal data

The community system should be designed around public content ownership, visibility, moderation, discovery, membership, and interaction.

# 2.2 Global Community Structure

```
Global Community
│
├── Home Feed
│   ├── Following feed
│   ├── Recommended feed
│   ├── Trending content
│   └── Recent public content
│
├── Discover
│   ├── Pages
│   ├── Topics
│   ├── Events
│   ├── People
│   ├── Communities
│   └── Search
│
├── Public Pages
│   ├── Community pages
│   ├── Festival pages
│   ├── Event pages
│   ├── Organization pages
│   ├── Creator pages
│   └── Interest pages
│
├── Public Posts
│   ├── Text
│   ├── Images
│   ├── Videos
│   ├── Links
│   ├── Polls
│   └── Announcements
│
├── Interactions
│   ├── Likes/reactions
│   ├── Comments
│   ├── Replies
│   ├── Shares
│   ├── Saves
│   └── Reports
│
└── Safety
    ├── Moderation
    ├── Blocking
    ├── Muting
    ├── Reporting
    └── Appeals
```

# 2.3 Public Community Concepts

## 2.3.1 Public page

A public page is a persistent identity for a topic, event, organization, creator, or community.

Examples:

* Ganesh Chaturthi community

* Local cultural organization

* Student community

* Technology community

* Festival planning page

* Educational page

* Sports community

* Travel interest page

A page has its own:

* Name

* Description

* Avatar

* Cover image

* Category

* Owner

* Administrators

* Moderators

* Posts

* Followers

* Events

* Rules

* Agent configuration

## 2.3.2 Public post

A public post is content intentionally published to a public audience.

A post belongs to:

* A user profile

* A public page

* A public event

* A public topic

A post must never become public merely because it was created inside a private group.

## 2.3.3 Public event

A public event is a discoverable activity with:

* Name

* Description

* Date and time

* Time zone

* Location or online details

* Organizer

* RSVP settings

* Public announcements

* Optional private organizer group

## 2.3.4 Topic

A topic groups related public content.

Examples:

* Festivals

* Education

* Technology

* Fitness

* Food

* Travel

* Local activities

* Volunteering

Topics should be controlled through a category system rather than allowing unrestricted arbitrary taxonomy.

# 2.4 Community Visibility Model

Visibility must be explicit at the resource level.

## 2.4.1 Visibility states

```
PUBLIC
FOLLOWERS_ONLY
PAGE_MEMBERS_ONLY
GROUP_MEMBERS_ONLY
SELECTED_USERS
OWNER_ONLY
UNLISTED
ARCHIVED
DELETED
```

## 2.4.2 Public visibility requirements

A resource can be public only when:

1. Its owner has permission to publish.

2. Its parent scope permits public content.

3. Its moderation state allows publication.

4. It does not contain restricted private data.

5. Its media is safe to display.

6. Its visibility policy is explicitly set to public.

## 2.4.3 Visibility inheritance

Visibility should normally inherit from the parent scope.

Examples:

* A post inside a public page may be public.

* A post inside a private family group remains private.

* A comment on a private post cannot become public.

* A file attached to a public post must have compatible public access.

* A private organizer discussion linked to a public event remains private.

## 2.4.4 Visibility change rules

Changing visibility from private to public should require:

* Clear confirmation

* Warning about who may access the content

* Preview of the public appearance

* Validation of attachments

* Privacy check

* Audit record

Changing visibility from public to private should:

* Remove the resource from public feeds

* Remove it from discovery indexes

* Revalidate existing shares

* Update cached responses

* Apply the new visibility to future reads

# 2.5 Public Page Requirements

## 2.5.1 Page creation flow

```
User opens Create
  ↓
Selects Public Page
  ↓
Chooses page category
  ↓
Enters page name
  ↓
Adds description
  ↓
Adds image
  ↓
Selects visibility
  ↓
Accepts page rules
  ↓
Creates page
  ↓
Page onboarding checklist appears
```

## 2.5.2 Page onboarding checklist

After creation, the page owner should see:

* Add profile image

* Add cover image

* Write description

* Add page rules

* Publish first post

* Invite initial followers

* Create first event

* Configure moderators

* Configure page agent

* Review privacy settings

## 2.5.3 Page profile screen

The page profile should contain:

### Header

* Page image

* Page name

* Verification status, if implemented

* Category

* Follow button

* Share button

* Report button

* More actions

### Information

* Description

* Rules

* Contact information, if public

* Website, if provided

* Location, if intentionally public

* Creation date

* Page owner information according to privacy policy

### Tabs

* Posts

* About

* Events

* Members, if visible

* Media

* Rules

* Agent, if publicly exposed

## 2.5.4 Page management

Authorized page roles may:

* Edit page information

* Create posts

* Schedule posts

* Moderate comments

* Manage page members

* Assign roles

* Create events

* Configure page agent

* View analytics

* Archive the page

Only the owner or authorized administrator may:

* Transfer ownership

* Delete the page

* Change critical settings

* Remove administrators

* Change page visibility

# 2.6 Page Membership and Following

Following and membership are different.

## 2.6.1 Following

A user follows a page to receive its public content.

Following normally does not grant:

* Access to private page content

* Administrative rights

* Access to page member information

* Access to private organizer discussions

## 2.6.2 Page membership

Membership may provide additional access to:

* Member-only posts

* Private page events

* Internal discussions

* Page resources

* Contributor tools

## 2.6.3 Membership policies

A page may use:

* Open following

* Approval-based membership

* Invite-only membership

* Closed membership

* Paid membership, later

* Event-specific membership

## 2.6.4 Follow rules

The system must support:

* Follow

* Unfollow

* Mute

* Block

* Hide recommendations

* Notification preferences

A user who blocks a page should not receive its normal discovery recommendations.

# 2.7 Public Post Architecture

## 2.7.1 Post composition

A post may contain:

* Text

* Images

* Video

* Audio, later

* Link preview

* Poll

* Event reference

* Page reference

* Topic tags

* Mentions

* Location, optional

* Accessibility description

* Content warning, if required

## 2.7.2 Post creation states

```
Draft
  ↓
Submitted
  ↓
Validation
  ↓
Moderation review, if required
  ↓
Published
  ↓
Edited
  ↓
Hidden
  ↓
Archived
  ↓
Deleted
```

## 2.7.3 Draft behavior

Drafts must be private to the author and authorized page editors.

Drafts must not:

* Appear in feeds

* Appear in search

* Trigger public notifications

* Be indexed

* Be used in public analytics

## 2.7.4 Publishing validation

Before publishing, validate:

* User authorization

* Parent page status

* Content size

* Media type

* Media access

* Mentions

* Links

* Visibility

* Moderation status

* Rate limits

* Spam signals

## 2.7.5 Edit rules

The platform should support:

* Editing by the author

* Editing by authorized page editors

* Edit timestamp

* Optional edit history

* Re-moderation after significant changes

A significant change may include:

* Changing text meaning

* Adding media

* Adding an external link

* Changing visibility

* Adding a sensitive topic

* Changing event details

# 2.8 Comments and Replies

## 2.8.1 Comment structure

```
Post
 ├── Comment
 │    ├── Reply
 │    └── Reply
 ├── Comment
 └── Comment
```

Each comment should contain:

* Comment ID

* Post ID

* Author ID

* Parent comment ID, optional

* Body

* Media, optional

* Status

* Created timestamp

* Updated timestamp

* Moderation state

## 2.8.2 Comment permissions

A user may comment when:

* The post is visible to them.

* Comments are enabled.

* They are not blocked or restricted.

* Their account is active.

* They satisfy page or group rules.

## 2.8.3 Comment controls

Post owners and authorized moderators may:

* Disable comments

* Limit comments

* Hide comments

* Pin comments

* Remove comments

* Restrict users

* Report comments

* Lock a discussion

## 2.8.4 Comment ranking

Initial MVP ranking:

1. Pinned comments

2. Relevant comments

3. Recent comments

4. Comments with meaningful engagement

Avoid ranking solely by raw engagement because it can promote harassment, controversy, or spam.

# 2.9 Reactions, Shares, and Saves

## 2.9.1 Reactions

The MVP may support:

* Like

* Remove like

Later:

* Multiple reactions

* Emoji reactions

* Reaction summaries

Reaction rules:

* One reaction per user per post, per reaction type.

* Repeated requests must be idempotent.

* Deleted posts cannot receive new reactions.

* Reaction counts should not be trusted as authorization data.

## 2.9.2 Shares

Sharing should distinguish:

* Public reshare

* Share to private group

* Share through direct message

* Copy link

* External share

A public post shared into a private group does not make the group public.

A private post must not be shareable publicly.

## 2.9.3 Saves

Saved posts are private to the saving user by default.

The system should support:

* Save

* Unsave

* Saved collections, later

* Search saved posts

* Delete saved reference

Saved content should not automatically influence public discovery unless the user has consented to personalization.

# 2.10 Public Feed Architecture

## 2.10.1 Feed types

### Following feed

Content from:

* Followed pages

* Followed users, if enabled

* Joined public communities

### Explore feed

Content based on:

* User-selected interests

* Public relevance

* Freshness

* Safety

* General popularity

* Language

* Explicit location preferences

### Trending feed

Content with:

* Rapid public engagement

* Freshness

* Low abuse risk

* Sufficient quality signals

* No unresolved severe moderation concerns

### Event feed

Public events filtered by:

* Date

* Topic

* Language

* Coarse location

* Organizer

* Availability

## 2.10.2 Feed requirements

The feed must support:

* Cursor pagination

* Pull-to-refresh

* Loading states

* Empty states

* Error states

* Hidden content

* Blocked content filtering

* Duplicate prevention

* Deleted content handling

* Content reporting

* Mute controls

## 2.10.3 Feed consistency

The system should use a hybrid approach:

* Database queries for initial MVP

* Cached or precomputed feeds for high-volume pages later

* Event-driven feed invalidation

* Cursor-based pagination

Do not build a complex recommendation engine before basic feed correctness is stable.

# 2.11 Discovery and Search

## 2.11.1 Searchable objects

Search may include:

* Public pages

* Public posts

* Public events

* Public users

* Public topics

* Public hashtags

Search must exclude:

* Private messages

* Private groups

* Solo notes

* Private agent conversations

* Sensitive health data

* Deleted content

* Blocked content

* Restricted content

## 2.11.2 Search filters

* Content type

* Topic

* Language

* Date

* Event date

* Page category

* Public location

* Popularity

* Relevance

## 2.11.3 Search indexing

Search indexing should be asynchronous.

```
Content published
  ↓
Outbox event
  ↓
Indexing worker
  ↓
Search index update
  ↓
Search becomes available
```

When content is deleted or made private:

```
Visibility change
  ↓
Outbox event
  ↓
Search removal/update
  ↓
Cache invalidation
```

## 2.11.4 Search consistency requirement

The database remains the source of truth.

If the search index is stale:

* The result must be revalidated before displaying sensitive content.

* Deleted or private resources must be rejected during final authorization.

* Search failure must not expose data.

# 2.12 Public Events

## 2.12.1 Event creation

A page owner or authorized user may create an event with:

* Event name

* Description

* Start date

* End date

* Time zone

* Location

* Online meeting details, later

* Organizer

* Cover image

* Visibility

* RSVP policy

* Capacity

* Reminder settings

* Related page

* Related private organizer group

## 2.12.2 RSVP states

```
Interested
Going
Not going
Waitlisted
Canceled
Attended
```

## 2.12.3 Event privacy

The organizer must control:

* Whether the attendee list is public

* Whether the exact location is public

* Whether contact information is public

* Whether event discussion is public

* Whether attendees can invite others

* Whether the event requires approval

## 2.12.4 Public event and private planning separation

Example:

```
Public Event Page
  ├── Public description
  ├── Public announcements
  ├── Public RSVP
  └── Public updates

Private Organizer Group
  ├── Budget planning
  ├── Vendor discussion
  ├── Task assignments
  ├── Private documents
  └── Agent-assisted planning
```

The agent must not copy private organizer content into public announcements without approval.

# 2.13 Community Agent

## 2.13.1 Public page agent

A page agent may assist with:

* Drafting posts

* Summarizing public comments

* Creating event descriptions

* Answering questions using approved public page data

* Suggesting content schedules

* Identifying unanswered public questions

* Drafting announcements

* Organizing public FAQs

## 2.13.2 Restricted page agent actions

The page agent must not automatically:

* Publish content without permission

* Delete comments

* Ban users

* Change page ownership

* Reveal private administrator discussions

* Expose private analytics

* Send external messages

* Make claims not supported by page data

## 2.13.3 Public question answering

A page agent may answer from:

* Page description

* Public posts

* Public event details

* Approved FAQs

* Public rules

* Public announcements

It must not answer from:

* Private admin chat

* Private member data

* Private event planning

* Unpublished drafts

* Private page documents

* Personal memories of page administrators

## 2.13.4 Public content generation

Generated public content should follow this flow:

```
User requests draft
  ↓
Agent creates draft
  ↓
User reviews
  ↓
Content validation
  ↓
Moderation checks
  ↓
User or authorized editor publishes
```

For MVP, generated content should remain a draft until a human explicitly publishes it.

# 2.14 Public Community Moderation

## 2.14.1 Moderation triggers

* User report

* Automated safety signal

* Spam detection

* Link reputation

* Repeated posting

* Coordinated abuse

* Page moderator action

* Legal or safety escalation

## 2.14.2 Content states

```
Visible
Under review
Limited
Hidden
Removed
Appeal pending
Restored
```

## 2.14.3 Moderation visibility

A normal user should see only the appropriate result:

* Content unavailable

* Content removed

* Content under review

* Content restricted

Internal moderation reasons may be limited to authorized reviewers to avoid abuse of enforcement systems.

## 2.14.4 Appeals

An appeal should include:

* Original action

* Appeal reason

* User statement

* Reviewer

* Decision

* Decision timestamp

* Notification result

# 2.15 Public Community Notifications

Notifications may be generated for:

* New post from followed page

* Comment reply

* Mention

* Reaction

* Page announcement

* Event update

* RSVP change

* Moderator action

* Follow request, if applicable

* Page role change

Users must be able to configure:

* Per-page notifications

* Per-event notifications

* Comment notifications

* Mention notifications

* Digest frequency

* Push/email settings

# 2.16 Public Community Data Model

A minimal relational model:

```
users
profiles

pages
page_members
page_roles
page_followers

posts
post_media
post_topics
post_mentions

comments
comment_mentions
reactions
post_shares
saved_posts

topics
hashtags
events
event_attendees

reports
moderation_actions
appeals

notifications
notification_deliveries

outbox_events
audit_events
```

## 2.16.1 Important constraints

* A page must have one owner.

* A page role must reference an existing page member.

* A user can follow a page only once.

* A user can react once per supported reaction type.

* A comment must reference an accessible post.

* A post must reference a valid scope.

* A private scope cannot publish directly to public discovery.

* Deleted pages cannot receive new posts.

* Suspended users cannot publish.

# 2.17 Public Community API Requirements

## 2.17.1 Page endpoints

```
POST   /pages
GET    /pages/{page_id}
PATCH  /pages/{page_id}
DELETE /pages/{page_id}

GET    /pages/{page_id}/posts
POST   /pages/{page_id}/posts

POST   /pages/{page_id}/follow
DELETE /pages/{page_id}/follow

GET    /pages/{page_id}/members
POST   /pages/{page_id}/members
PATCH  /pages/{page_id}/members/{user_id}
DELETE /pages/{page_id}/members/{user_id}
```

## 2.17.2 Post endpoints

```
POST   /posts
GET    /posts/{post_id}
PATCH  /posts/{post_id}
DELETE /posts/{post_id}

GET    /posts/{post_id}/comments
POST   /posts/{post_id}/comments

POST   /posts/{post_id}/reactions
DELETE /posts/{post_id}/reactions

POST   /posts/{post_id}/report
POST   /posts/{post_id}/save
DELETE /posts/{post_id}/save
```

## 2.17.3 Discovery endpoints

```
GET /feed/following
GET /feed/explore
GET /feed/trending
GET /discover/pages
GET /discover/events
GET /search
```

## 2.17.4 Event endpoints

```
POST   /events
GET    /events/{event_id}
PATCH  /events/{event_id}
DELETE /events/{event_id}

POST   /events/{event_id}/rsvp
DELETE /events/{event_id}/rsvp
GET    /events/{event_id}/attendees
```

# 2.18 Android Screen Requirements

## 2.18.1 Home feed

Components:

* Top app bar

* Feed selector

* Create button

* Post cards

* Loading indicator

* Empty state

* Error retry

* Pull-to-refresh

* Report and hide actions

## 2.18.2 Discover screen

Sections:

* Search field

* Suggested pages

* Trending topics

* Upcoming events

* Categories

* Recent searches

* Personalized recommendations, if enabled

## 2.18.3 Page detail screen

Components:

* Page header

* Follow button

* Page description

* Tabs

* Posts

* Events

* About

* More menu

* Report page

* Share page

## 2.18.4 Create post screen

Features:

* Text editor

* Media picker

* Topic selection

* Mention selection

* Visibility selector

* Draft saving

* Preview

* Publish button

* Error handling

## 2.18.5 Post detail screen

Features:

* Full post

* Comments

* Replies

* Reaction controls

* Share

* Save

* Report

* Author/page navigation

# 2.19 Web Screen Requirements

The web application should provide:

* Responsive feed

* Search

* Page management

* Post editor

* Comment moderation

* Event management

* Member management

* Analytics, later

* Agent drafting panel

* Moderation queue

For page administrators, the desktop layout should support:

```
Left navigation
  ├── Overview
  ├── Posts
  ├── Comments
  ├── Events
  ├── Members
  ├── Moderation
  ├── Agent
  ├── Analytics
  └── Settings

Main content area

Right contextual panel
  ├── Draft status
  ├── Pending reports
  ├── Scheduled content
  └── Recent activity
```

# 2.20 Public Community Acceptance Criteria

## Pages

* Authenticated users can create public pages.

* Page owners can assign roles.

* Page visibility is enforced server-side.

* Suspended pages cannot publish.

* Page deletion follows a controlled workflow.

* Public pages appear in discovery only when eligible.

## Posts

* Users can publish authorized public posts.

* Drafts remain private.

* Posts support editing and deletion.

* Private posts never appear in public feeds.

* Media access follows post visibility.

* Significant edits can trigger re-moderation.

## Discovery

* Search excludes private and deleted content.

* Blocked users and content are filtered.

* Search supports pagination.

* Stale indexes are revalidated before display.

* Users can hide or mute content.

## Events

* Public events can be created.

* RSVP status is stored.

* Attendee visibility is configurable.

* Private organizer planning remains private.

* Event cancellation generates appropriate notifications.

## Agent

* Page agents access only approved public page data.

* Generated content is draft-first.

* Publishing requires human authorization.

* Agent actions are logged.

* Private administrator conversations are excluded.

## Safety

* Users can report pages, posts, comments, and users.

* Moderators can review reports.

* Appeals are supported or explicitly scheduled for a later phase.

* Blocking affects discovery, messaging, and notifications.

* Moderation actions are audited.

# 2.21 Chapter 2 MVP Boundary

The MVP Global Community module includes:

1. Public user profiles

2. Public pages

3. Page ownership and roles

4. Text and image posts

5. Comments and replies

6. Basic reactions

7. Follows

8. Public search

9. Following feed

10. Basic explore feed

11. Public events

12. RSVP

13. Reporting

14. Blocking and muting

15. Basic moderation

16. Page agent draft assistance

17. Public/private visibility enforcement

18. Android and web support

The following should remain outside the first MVP unless resources are sufficient:

* Advanced recommendation algorithms

* Livestreaming

* Audio rooms

* Creator monetization

* Paid memberships

* Advanced analytics

* Automated public publishing

* Complex hashtag ranking

* Full video processing

* Public marketplace

* Large-scale influencer tools

## Chapter 2 Final Architecture Decision

The Global Community should be built as a domain module with:

```
Public API
  ↓
Authorization and visibility policy
  ↓
Page/Post/Event domain services
  ↓
PostgreSQL
  ↓
Outbox events
  ├── Feed indexing
  ├── Search indexing
  ├── Notifications
  ├── Moderation
  ├── Analytics
  └── Agent context updates
```

The most important design rule is:

> A resource is public only because its owner and policy explicitly made it public. No agent, feed service, search index, cache, or notification worker may bypass that decision.
