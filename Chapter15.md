# Chapter 15 — Search, Discovery, Recommendations, Feeds, Ranking, Moderation, and Global Community Content Architecture

## 15.1 Purpose and Scope

This chapter defines how users discover, search, browse, rank, filter, report, and interact with community content.

The architecture covers:

* Public community pages

* Public posts

* Comments and replies

* Hashtags and topics

* Events and festivals

* Interest-based discovery

* Following and membership feeds

* Recommended content

* Local and language-based discovery

* Search and autocomplete

* Trending content

* Moderation and reporting

* Spam and abuse detection

* Ranking and recommendation services

* Privacy-aware indexing

* Android and web experiences

* Realtime feed updates

* Analytics and observability

The system must support global-scale discovery without exposing private information.

# 15.2 Core Architectural Principles

## Principle 1: Visibility Before Ranking

A piece of content must pass authorization and visibility filtering before it can be considered for search, feeds, recommendations, or trends.

The order is:

```
Request
  ↓
Identity Resolution
  ↓
Visibility and Authorization Filter
  ↓
Content Eligibility
  ↓
Candidate Retrieval
  ↓
Ranking
  ↓
Safety and Policy Filter
  ↓
Response
```

The system must never:

1. Retrieve private content.

2. Rank it.

3. Remove it later.

Private content should be excluded at the earliest possible stage.

## Principle 2: Search and Recommendation Are Different Systems

Search answers:

> “Find content matching what the user requested.”

Recommendations answer:

> “Show content the user may find useful or interesting.”

Search prioritizes:

* Query relevance

* Exact matches

* Semantic similarity

* Freshness

* User permissions

Recommendations prioritize:

* User interests

* Followed pages

* Memberships

* Content quality

* Diversity

* Freshness

* Safety

* Previous interaction patterns

These systems may share indexing infrastructure but should have separate ranking logic.

## Principle 3: Ranking Must Not Override Safety

Content with high engagement must not automatically receive high distribution.

The ranking system must consider:

* Moderation status

* Report volume

* Confirmed policy violations

* Spam probability

* Coordinated manipulation

* User blocks

* Muted topics

* Age or region restrictions

* Sensitive-content settings

## Principle 4: Private Content Is Not a Discovery Source

The following must not be used to improve public recommendations:

* Private family conversations

* Private couple conversations

* Private solo-space content

* Private medicine reminders

* Private files

* Private agent memory

* Private calendar data

* Private direct messages

Private data may only influence private experiences where the user has authorized that use.

# 15.3 Content Visibility Model

Every searchable or discoverable object must have an explicit visibility policy.

## Visibility Types

```
PUBLIC
FOLLOWERS_ONLY
MEMBERS_ONLY
SELECTED_MEMBERS
PRIVATE
AGENT_ONLY
TEMPORARY_SHARE
UNLISTED
QUARANTINED
DELETED
```

## Visibility Rules

|
Visibility

|

Searchable by owner

|

Searchable by members

|

Public discovery

|
| --- | --- | --- | --- |
|

Public

|

Yes

|

Yes

|

Yes

|
|

Followers only

|

Yes

|

Followers

|

No

|
|

Members only

|

Yes

|

Authorized members

|

No

|
|

Selected members

|

Yes

|

Selected users

|

No

|
|

Private

|

Yes

|

No

|

No

|
|

Agent only

|

Authorized agent

|

No

|

No

|
|

Temporary share

|

Authorized recipients

|

Authorized recipients

|

No

|
|

Unlisted

|

Direct link or authorized access

|

Based on permissions

|

No

|
|

Quarantined

|

Moderators/owner based on policy

|

No

|

No

|
|

Deleted

|

Audit/recovery rules only

|

No

|

No

|

The visibility filter must be enforced in:

* PostgreSQL queries

* Search indexes

* Recommendation candidate generation

* Cache keys

* Feed materialization

* Notification payloads

* Analytics exports

* Agent retrieval tools

# 15.4 Content Eligibility States

A content object must have a lifecycle state.

```
DRAFT
PROCESSING
PENDING_MODERATION
PUBLISHED
LIMITED
AGE_RESTRICTED
QUARANTINED
REMOVED
DELETED
APPEALED
RESTORED
```

## Eligibility Rules

Only eligible content may appear in normal discovery.

```
PUBLISHED → eligible
LIMITED → eligible with reduced distribution
AGE_RESTRICTED → eligible only for allowed users
PENDING_MODERATION → not publicly discoverable
QUARANTINED → not discoverable
REMOVED → not discoverable
DELETED → not discoverable
```

Content can be visible to its creator while remaining unavailable to everyone else.

# 15.5 Global Discovery Model

Discovery should be divided into independent surfaces.

## Discovery Surfaces

1. Global search

2. Home feed

3. Following feed

4. Recommended feed

5. Local discovery

6. Topic discovery

7. Event discovery

8. Page discovery

9. Group discovery

10. Hashtag discovery

11. Trending content

12. Search suggestions

13. Related content

14. Similar pages

15. Similar events

Each surface should use a separate candidate-generation policy.

# 15.6 Feed Architecture

## 15.6.1 Home Feed

The home feed combines:

* Followed pages

* Joined groups

* Joined events

* Recommended public content

* Relevant topics

* Local content where enabled

* Important system announcements

* Agent-generated reminders where authorized

Suggested composition:

```
Following Content
  + Group Content
  + Event Content
  + Recommended Content
  + Topic Content
  + Local Content
```

The system must enforce diversity so the feed does not contain:

* Ten posts from one page consecutively

* Only one topic

* Only one content type

* Repeated content

* Excessive sponsored or promoted items

* Excessive engagement bait

## 15.6.2 Following Feed

The following feed contains content from:

* Followed pages

* Followed creators

* Followed topics

* Followed hashtags

* Joined public communities

It should be more chronological than the recommended feed.

Recommended ordering:

```
Recent eligible content
  ↓
Small quality adjustment
  ↓
Duplicate removal
  ↓
Diversity enforcement
```

The user should have an option to select:

* Latest

* Relevant

* Mixed

## 15.6.3 Group Feed

A group feed must only contain content authorized for the group.

It may include:

* Group posts

* Group announcements

* Shared files

* Events

* Polls

* Tasks

* Agent updates

* Member discussions

* Approved external references

Group content must never enter public discovery unless the creator explicitly publishes it publicly and the group policy permits external sharing.

## 15.6.4 Recommended Feed

The recommended feed uses:

* Declared interests

* Followed topics

* Followed pages

* Recent searches

* Content interactions

* Language preferences

* Approximate location, if enabled

* Similar users’ aggregated behavior

* Similar public content

* Event participation

* Explicit feedback

It must not use sensitive private content without explicit permission.

## 15.6.5 Local Discovery Feed

Local discovery may use:

* Country

* State or region

* City

* User-selected location

* Event location

* Language region

Precise location should not be exposed by default.

Use coarse geographic buckets such as:

```
Country
Region
City
Neighborhood, only with explicit permission
```

Local discovery should support:

* Local events

* Festivals

* Public pages

* Public groups

* Community announcements

* Local services

* Public discussions

# 15.7 Feed Candidate Generation

Ranking should not run against the entire database.

The system first generates candidates from multiple sources.

## Candidate Sources

```
FollowingCandidateSource
GroupCandidateSource
TopicCandidateSource
TrendingCandidateSource
SimilarContentCandidateSource
LocalCandidateSource
EventCandidateSource
FreshContentCandidateSource
EditorialCandidateSource
```

Each source returns candidates with metadata.

Example:

JSON

```
{
  "content_id": "post_123",
  "source": "following",
  "source_score": 0.82,
  "reason": "From a page you follow",
  "retrieved_at": "2026-09-18T12:00:00Z"
}
```

## Candidate Pipeline

```
Candidate Sources
  ↓
Merge
  ↓
Deduplicate
  ↓
Visibility Filter
  ↓
Block/Mute Filter
  ↓
Safety Filter
  ↓
Feature Enrichment
  ↓
Ranking
  ↓
Diversity Rules
  ↓
Final Feed
```

# 15.8 Search Architecture

## 15.8.1 Searchable Objects

The search system may index:

* Public pages

* Public posts

* Public comments, subject to policy

* Public events

* Public groups

* Public hashtags

* Public topics

* Public media metadata

* Public documents

* Public creator profiles

* Public locations

* Public announcements

It must not index:

* Private messages

* Private group posts

* Private files

* Private agent memory

* Private medical data

* Private calendar events

* Private reminders

## 15.8.2 Search Query Pipeline

```
User Query
  ↓
Normalize Input
  ↓
Language Detection
  ↓
Spell Correction
  ↓
Autocomplete/Intent Detection
  ↓
Permission Scope Resolution
  ↓
Keyword Retrieval
  ↓
Semantic Retrieval
  ↓
Metadata Filtering
  ↓
Result Fusion
  ↓
Ranking
  ↓
Highlighting
  ↓
Response
```

## Query Normalization

Normalize:

* Case

* Whitespace

* Punctuation

* Unicode variants

* Common spelling errors

* Transliteration variants

* Hashtag prefixes

* Language-specific forms

Examples:

```
"Ganesh chaturthi"
"#GaneshChaturthi"
"ganeshchaturthi"
"गणेश चतुर्थी"
```

These may be mapped to a common topic representation while preserving the original text.

# 15.9 Search Technology Decision

## Initial Architecture

Start with:

* PostgreSQL full-text search

* PostgreSQL trigram indexes

* PostgreSQL metadata filters

* pgvector for semantic retrieval

* Redis for autocomplete and hot queries

This reduces operational complexity during the first production phase.

## Later Scale Option

Introduce OpenSearch or Elasticsearch when required by:

* Very large public content volume

* High search request rate

* Complex faceting

* Advanced typo tolerance

* Distributed indexing

* Geo-search requirements

* Search-specific analytics

* Independent search scaling

## Decision

```
Phase 1:
PostgreSQL FTS + pgvector + Redis

Phase 2:
Dedicated search index if measured scale requires it

Phase 3:
Separate ranking and recommendation infrastructure
```

Do not introduce a search cluster only because it is popular. Introduce it when PostgreSQL search becomes a measured bottleneck.

# 15.10 Search Index Document

A public post index document may contain:

JSON

```
{
  "content_id": "post_123",
  "content_type": "post",
  "page_id": "page_45",
  "author_id": "user_10",
  "title": "Community Festival Planning",
  "body_text": "Planning details for the upcoming festival",
  "language": "en",
  "translated_terms": [
    "festival planning",
    "community event"
  ],
  "hashtags": [
    "festival",
    "community"
  ],
  "topics": [
    "events",
    "local-community"
  ],
  "location_bucket": "region_123",
  "published_at": "2026-09-18T10:00:00Z",
  "quality_score": 0.75,
  "moderation_state": "published",
  "visibility": "public",
  "embedding_version": "embedding-v1",
  "index_version": 3
}
```

Never place private message content or private agent memory into public indexes.

# 15.11 Ranking Architecture

Ranking should be implemented as a versioned service.

```
Ranking Request
  ↓
Feature Retrieval
  ↓
Policy Constraints
  ↓
Scoring Model
  ↓
Diversity Rules
  ↓
Explanation Generation
  ↓
Ranked Results
```

## Ranking Signals

Possible signals include:

### Relevance

* Query match

* Semantic similarity

* Topic match

* Hashtag match

* Title match

* Language match

### Quality

* Content completeness

* Author/page reputation

* Spam probability

* Report history

* Meaningful discussion

* Verified event details

* Duplicate probability

### Freshness

* Publication time

* Event proximity

* Recent updates

* Time-sensitive relevance

### User Relationship

* Followed page

* Group membership

* Previous meaningful interaction

* Saved content

* Declared interest

### Diversity

* Author diversity

* Topic diversity

* Format diversity

* Geographic diversity

* Language diversity

### Negative Signals

* User block

* User mute

* Repeated content

* Clickbait indicators

* Coordinated engagement

* High-confidence spam

* Policy violations

* Excessive frequency from one source

# 15.12 Ranking Constraints

Ranking must enforce hard constraints before soft scoring.

## Hard Constraints

```
Not visible → exclude
Blocked author → exclude
Muted topic → exclude
Removed content → exclude
Quarantined content → exclude
Unauthorized group content → exclude
Age restriction not satisfied → exclude
Regional restriction → exclude
```

## Soft Ranking

After eligibility:

```
Final Score =
  Relevance
  + Freshness
  + Quality
  + Relationship
  + Interest Match
  + Diversity Adjustment
  - Repetition Penalty
  - Spam Risk
  - Low Quality Penalty
```

The exact weights must be versioned and tested.

# 15.13 Ranking Explainability

Users should be able to understand why content appears.

Examples:

* “Because you follow this page”

* “Related to events you viewed”

* “Popular in your selected region”

* “Matches your selected interests”

* “Because you joined this group”

* “Similar to content you saved”

Do not expose:

* Private model features

* Sensitive inferred attributes

* Other users’ private behavior

* Internal security thresholds

* Anti-abuse detection logic

The explanation should be generated from approved reason codes rather than unrestricted model output.

# 15.14 Recommendation Architecture

## Recommendation Stages

```
User Profile Features
  ↓
Interest and Topic Features
  ↓
Candidate Generation
  ↓
Eligibility Filtering
  ↓
Scoring
  ↓
Diversity
  ↓
Safety
  ↓
Explanation
  ↓
Delivery
```

## Recommendation Categories

* Pages to follow

* Groups to join

* Events to attend

* Topics to explore

* Posts to read

* Creators to follow

* Public discussions to join

* Similar communities

* Related files or documents, only within authorized scopes

# 15.15 Cold-Start Strategy

New users have limited interaction data.

Use explicit onboarding instead of guessing sensitive preferences.

## New User Signals

* Selected language

* Selected region

* Selected topics

* Followed pages

* Joined groups

* Chosen interests

* Public event interactions

* Search queries

* Explicit “not interested” feedback

## Cold-Start Feed Mix

```
40% selected interests
20% local or regional public content
20% broadly useful public content
10% fresh content
10% exploration
```

These percentages are initial configuration values, not permanent truths. They should be evaluated using quality and safety metrics.

# 15.16 Trending Architecture

Trending content must not be based only on raw likes or views.

## Trending Signals

* Engagement velocity

* Unique participants

* Meaningful comments

* Saves

* Shares

* Event participation

* Search growth

* Geographic distribution

* Topic diversity

* Account quality

* Spam probability

## Anti-Gaming Controls

Apply:

* Per-user contribution caps

* Rate limits

* Duplicate interaction detection

* Suspicious-account weighting

* Device and IP pattern analysis

* Coordinated activity detection

* Engagement velocity anomaly detection

* Delayed trend qualification

* Human review for major trends

A trend should be explainable:

```
"Trending because discussion increased rapidly over the last 6 hours."
```

Avoid exposing exact anti-abuse thresholds.

# 15.17 Hashtags, Topics, and Categories

## Hashtags

Hashtags should support:

* Case normalization

* Unicode

* Transliteration

* Alias mapping

* Topic pages

* Related hashtags

* Moderation status

* Search indexing

Example:

```
#GaneshChaturthi
#गणेशचतुर्थी
#GaneshChaturthi2026
```

These may be associated with a canonical topic while remaining separate display strings.

## Topic Model

A topic may contain:

```
topic_id
canonical_name
localized_names
aliases
description
parent_topic_id
language
moderation_state
visibility
created_at
updated_at
```

## Categories

Examples:

* Events

* Family

* Education

* Technology

* Food

* Local Community

* Culture

* Sports

* Environment

* Volunteering

* Public Services

Categories should be controlled vocabulary. Topics and hashtags may be user-generated but require abuse controls.

# 15.18 Multilingual Search and Discovery

The system must support:

* Multiple languages per user

* Language-specific stemming

* Transliteration

* Unicode normalization

* Localized topic names

* Cross-language semantic retrieval

* Mixed-language queries

* Regional spellings

* Script variants

## Language Pipeline

```
Detect Language
  ↓
Normalize Unicode
  ↓
Generate Search Variants
  ↓
Keyword Search
  ↓
Cross-Language Semantic Search
  ↓
Language-Aware Ranking
```

Do not automatically translate private content into public indexes.

Translation of public content should preserve:

* Original text

* Translation status

* Translation provider/version

* User-visible disclaimer when translation is machine-generated

# 15.19 Search Suggestions and Autocomplete

Autocomplete should be fast and privacy-safe.

## Suggestion Types

* Recent user searches

* Public pages

* Public topics

* Public hashtags

* Public events

* Public groups

* Popular public queries

* Spelling corrections

## Privacy Rules

Do not expose:

* Another user’s private search

* Private group names

* Private event names

* Private contacts

* Private files

* Sensitive inferred interests

User search history should be:

* User-controlled

* Deletable

* Retained for a limited period

* Excluded from public analytics when identifying

# 15.20 Moderation Pipeline

Moderation must operate before and after publication.

## Pre-Publication Flow

```
Create Content
  ↓
Validate Input
  ↓
Spam Check
  ↓
Safety Classification
  ↓
Policy Decision
  ↓
Publish / Limit / Quarantine / Review
```

## Post-Publication Flow

```
Published Content
  ↓
User Reports
  ↓
Automated Detection
  ↓
Behavioral Signals
  ↓
Human Review
  ↓
Limit / Remove / Restore / Escalate
```

## Moderation Outcomes

```
ALLOW
ALLOW_WITH_LIMITS
AGE_RESTRICT
REQUIRE_EDIT
QUARANTINE
REMOVE
ESCALATE_TO_HUMAN
ACCOUNT_REVIEW
```

Automated classifiers should produce confidence and reason codes, not irreversible decisions for all categories.

# 15.21 Human Review and Appeals

The platform requires:

* Moderator queues

* Priority levels

* Evidence bundles

* Reviewer assignment

* Conflict-of-interest controls

* Decision history

* Second review

* Appeals

* Restoration workflow

* Moderator audit logs

## Appeal Lifecycle

```
Action Applied
  ↓
User Appeals
  ↓
Appeal Validation
  ↓
Independent Review
  ↓
Decision
  ↓
Notify User
  ↓
Record Outcome
```

The appeal system should distinguish:

* Content removal

* Account restriction

* Group restriction

* Search demotion

* Event limitation

* Automated false positive

# 15.22 Spam, Abuse, Fraud, and Bot Detection

Detection should combine:

* Request rate

* Account age

* Device signals

* IP reputation

* Repeated content

* Link patterns

* Unusual engagement velocity

* Coordinated accounts

* Mass invitations

* Repeated reports

* Automation fingerprints

* Payment or contribution anomalies where applicable

## Response Levels

```
Observe
Rate Limit
Require Verification
Reduce Distribution
Temporarily Restrict
Quarantine Content
Suspend Account
Escalate to Human Review
```

Do not rely on a single signal. Detection decisions must be risk-based and reviewable.

# 15.23 Community Reporting

Users should be able to report:

* Posts

* Comments

* Pages

* Groups

* Events

* Accounts

* Files

* Messages where supported by the privacy model

* Agent-generated actions

## Report Categories

* Spam

* Harassment

* Threats

* Fraud

* Hate or abuse

* Sexual exploitation

* Child safety

* Privacy violation

* Dangerous misinformation

* Copyright concern

* Impersonation

* Illegal activity

* Other

Reports must include:

```
report_id
reporter_id
target_type
target_id
category
description
evidence_refs
created_at
status
resolution
```

The reporter should receive status updates without exposing confidential moderation details.

# 15.24 Data Model

## `content_items`

```
id
content_type
author_id
space_id
page_id
parent_id
visibility
moderation_state
publication_state
language
title
body_reference
created_at
published_at
updated_at
deleted_at
version
```

## `content_topics`

```
content_id
topic_id
source
confidence
created_at
```

## `hashtags`

```
id
canonical_name
display_name
language
moderation_state
created_at
```

## `content_hashtags`

```
content_id
hashtag_id
position
created_at
```

## `feed_candidates`

```
id
user_id
content_id
source
source_score
eligibility_snapshot
expires_at
created_at
```

## `feed_impressions`

```
id
user_id
content_id
feed_surface
rank_position
reason_code
shown_at
```

## `content_interactions`

```
id
user_id
content_id
interaction_type
value
created_at
```

## `ranking_features`

```
content_id
feature_version
quality_score
spam_score
safety_score
freshness_score
engagement_velocity
updated_at
```

## `search_queries`

```
id
user_id
query_hash
language
result_count
search_surface
created_at
```

Store raw queries only where justified by privacy policy and retention requirements.

## `moderation_cases`

```
id
target_type
target_id
trigger_source
priority
status
assigned_reviewer_id
decision
decision_reason
created_at
resolved_at
```

## `reports`

```
id
reporter_id
target_type
target_id
category
description
status
created_at
resolved_at
```

## `recommendation_feedback`

```
id
user_id
content_id
feedback_type
surface
created_at
```

Feedback types:

```
NOT_INTERESTED
MUTE_TOPIC
MUTE_AUTHOR
SHOW_MORE_LIKE_THIS
REPORT
HIDE
```

# 15.25 Cache Architecture

Use Redis for:

* Trending lists

* Search suggestions

* Popular topics

* Public page summaries

* Feed cursors

* Short-lived candidate sets

* Ranking feature snapshots

* Rate limits

* Deduplication keys

* User preference caches

## Cache Key Examples

```
feed:user:{user_id}:{surface}:{cursor}
trending:{region}:{topic}:{window}
search:suggest:{language}:{prefix}
page:summary:{page_id}
topic:summary:{topic_id}
ranking:features:{content_id}:{version}
```

Never cache a private response under a public key.

Cache keys must include all relevant authorization dimensions.

# 15.26 Fanout Strategy

There are two common feed strategies.

## Fanout on Write

When content is created, distribute references to followers.

Advantages:

* Fast feed reads

* Good for high-read systems

Disadvantages:

* Expensive for accounts with millions of followers

* Complicated privacy changes

* Difficult for recommendation blending

## Fanout on Read

Generate feed candidates when the user requests them.

Advantages:

* Easier visibility enforcement

* Lower write amplification

* Better for recommendation mixing

Disadvantages:

* More read-time work

* Requires caching and candidate services

## Decision

Use a hybrid approach:

```
Normal accounts:
Fanout on write or hybrid

Large public pages:
Fanout on read

Recommended content:
Candidate generation on read

Private groups:
Authorization-aware read path

Trending:
Precomputed aggregates
```

# 15.27 Realtime Feed Updates

Realtime events may include:

```
content.published
content.updated
content.removed
content.limited
content.restored
topic.trending
page.followed
recommendation.updated
moderation.action_applied
```

The client should not blindly insert every event into the visible feed.

The client should:

1. Validate event sequence.

2. Check whether the content is already present.

3. Apply local visibility rules.

4. Insert a “new posts available” indicator.

5. Refresh or merge when the user requests.

This avoids disruptive feed movement.

# 15.28 Ranking and Discovery APIs

## Search

http

```
GET /v1/search?q=festival&surface=global
```

## Search Suggestions

http

```
GET /v1/search/suggestions?q=ganesh
```

## Home Feed

http

```
GET /v1/feeds/home?cursor=...
```

## Following Feed

http

```
GET /v1/feeds/following?cursor=...
```

## Recommended Feed

http

```
GET /v1/feeds/recommended?cursor=...
```

## Trending

http

```
GET /v1/discovery/trending?region=...
```

## Topics

http

```
GET /v1/topics/{topic_id}
GET /v1/topics/{topic_id}/content
```

## Recommendation Feedback

http

```
POST /v1/recommendations/feedback
```

## Report Content

http

```
POST /v1/reports
```

## Moderation Case

http

```
GET /v1/moderation/cases/{case_id}
```

All endpoints must enforce:

* Authentication where needed

* Visibility

* Rate limits

* Abuse controls

* Cursor validation

* Idempotency for writes

* Audit logging for sensitive operations

# 15.29 Event Contracts

## Content Published

JSON

```
{
  "event_type": "content.published",
  "event_id": "evt_123",
  "content_id": "post_123",
  "content_type": "post",
  "visibility": "public",
  "author_id": "user_10",
  "page_id": "page_45",
  "moderation_state": "published",
  "occurred_at": "2026-09-18T12:00:00Z"
}
```

## Content Removed

JSON

```
{
  "event_type": "content.removed",
  "event_id": "evt_124",
  "content_id": "post_123",
  "reason_code": "policy_violation",
  "occurred_at": "2026-09-18T12:05:00Z"
}
```

## Recommendation Feedback

JSON

```
{
  "event_type": "recommendation.feedback",
  "event_id": "evt_125",
  "user_id": "user_10",
  "content_id": "post_123",
  "feedback_type": "not_interested",
  "surface": "home",
  "occurred_at": "2026-09-18T12:06:00Z"
}
```

# 15.30 Android Screens

## Discovery Screens

* Global search screen

* Search suggestions screen

* Search results screen

* Search filters bottom sheet

* Topic screen

* Hashtag screen

* Trending screen

* Recommended pages screen

* Recommended groups screen

* Recommended events screen

* Local discovery screen

## Feed Screens

* Home feed

* Following feed

* Group feed

* Page feed

* Event feed

* Saved content

* Hidden content management

* “Why am I seeing this?” explanation sheet

## Moderation Screens

* Report content bottom sheet

* Report confirmation

* Report status

* Appeal form

* Account restriction notice

* Content removal explanation

* Community guidelines

## Interaction States

Every feed item should support:

```
Loading
Loaded
Refreshing
Offline
Hidden
Removed
Limited
Failed
Retrying
```

Use paging with:

* Stable cursors

* Duplicate prevention

* Offline cache

* Pull-to-refresh

* New-content indicator

* Retry actions

# 15.31 Web/Desktop Screens

## Public

* Global search page

* Search results with filters

* Topic landing page

* Hashtag landing page

* Trending page

* Public page discovery

* Public event discovery

* Local discovery

* Related content panel

## Authenticated

* Home feed

* Following feed

* Recommended feed

* Saved items

* Search history

* Personalization controls

* Hidden/muted topics

* Recommendation feedback history

## Moderator

* Moderation dashboard

* Report queue

* Case details

* Evidence viewer

* User history

* Content history

* Appeals queue

* Policy decision panel

* Audit log

The moderator interface must separate:

* User-generated evidence

* Automated model output

* Previous decisions

* Reviewer notes

* Confidential information

# 15.32 Personalization Controls

Users should control:

* Topics of interest

* Languages

* Regional discovery

* Local recommendations

* Autoplay behavior

* Sensitive content preferences

* Suggested groups

* Suggested events

* Search history

* Recommendation personalization

* Data used for personalization

* Mute/block settings

Provide a global setting:

```
Use my activity to personalize recommendations
```

If disabled, the system may still use:

* Current query

* Explicit follows

* Memberships

* User-selected interests

* Safety and visibility rules

It should not use broad behavioral history for personalization.

# 15.33 Metrics and Observability

## Search Metrics

* Search latency

* Query success rate

* Zero-result rate

* Click-through rate

* Query reformulation rate

* Search abandonment

* Autocomplete latency

* Index freshness

* Search permission errors

* Language-specific quality

## Feed Metrics

* Feed latency

* Time to first item

* Duplicate rate

* Empty feed rate

* Refresh rate

* Content diversity

* User hides

* User mutes

* Report rate

* Session depth

* Retention-related metrics

## Recommendation Metrics

* Follow conversion

* Save rate

* Meaningful interaction rate

* “Not interested” rate

* Diversity

* Novelty

* Repetition

* Cold-start performance

* Safety incident rate

## Moderation Metrics

* Reports per 1,000 views

* Time to review

* Time to action

* False-positive rate

* Appeal overturn rate

* Automated classifier precision

* Automated classifier recall

* Repeat offender rate

* Quarantine backlog

* Moderator workload

Metrics must be segmented by:

* Language

* Region

* Content type

* Device

* Feed surface

* Account type

* Moderation outcome

Avoid optimizing only for raw engagement.

# 15.34 Failure Handling

## Search Index Delay

If indexing is delayed:

* Show a clear indexing state for the creator

* Keep content available through direct authorized retrieval

* Retry indexing asynchronously

* Avoid duplicate indexing jobs

## Ranking Service Failure

Fallback order:

```
Personalized Ranking
  ↓ failure
Cached Ranking
  ↓ failure
Freshness + Relevance Ranking
  ↓ failure
Chronological Eligible Content
```

## Recommendation Failure

Fallback to:

* Following feed

* Joined groups

* Selected topics

* Fresh public content

## Moderation Classifier Failure

For low-risk content:

* Queue for delayed review where policy permits

For high-risk content:

* Quarantine or restrict publication until classification is available

## Redis Failure

Use:

* Database-backed fallback

* Reduced personalization

* Chronological feeds

* Rate-limit degradation policy

## Search Cluster Failure

If a dedicated search cluster exists:

* Fall back to PostgreSQL search for limited surfaces

* Disable expensive semantic retrieval

* Preserve permission filters

* Return partial results with a retry option

# 15.35 Security and Privacy Requirements

## Search Security

* Apply authorization before result ranking.

* Do not expose private titles in autocomplete.

* Do not leak existence of private groups.

* Do not reveal hidden users through search.

* Avoid timing differences that disclose private content.

* Sanitize search highlights.

* Prevent query injection into search DSLs.

* Rate-limit expensive semantic queries.

## Feed Security

* Recheck visibility at delivery time.

* Invalidate caches after privacy changes.

* Remove deleted content from candidate stores.

* Do not use private interactions for public recommendations.

* Protect recommendation feedback from unauthorized access.

## Moderation Security

* Restrict moderator access.

* Log every sensitive lookup.

* Encrypt evidence references.

* Apply least privilege.

* Prevent moderators from accessing unrelated private spaces.

* Separate confidential reviewer notes from user-visible explanations.

## Agent Security

Agents may use discovery tools only within their granted scope.

Example:

```
Public Discovery Agent:
Can search public content only.

Family Agent:
Can search authorized family-space content only.

Personal Agent:
Can search user-authorized private content only.

Moderator Agent:
Can access moderation evidence only within assigned permissions.
```

# 15.36 Repository Structure

```
platform/
├── apps/
│   ├── android/
│   │   ├── feature-discovery/
│   │   ├── feature-search/
│   │   ├── feature-feed/
│   │   ├── feature-topics/
│   │   ├── feature-recommendations/
│   │   └── feature-reporting/
│   │
│   └── web/
│       ├── app/
│       │   ├── search/
│       │   ├── discover/
│       │   ├── trending/
│       │   ├── topics/
│       │   ├── feed/
│       │   └── moderation/
│       └── components/
│
├── services/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── search.py
│   │   │   ├── feeds.py
│   │   │   ├── discovery.py
│   │   │   ├── topics.py
│   │   │   └── reports.py
│   │   └── dependencies/
│   │
│   ├── ranking/
│   │   ├── candidate_sources/
│   │   ├── feature_store/
│   │   ├── rankers/
│   │   ├── diversity/
│   │   └── explanations/
│   │
│   ├── search/
│   │   ├── indexing/
│   │   ├── query/
│   │   ├── autocomplete/
│   │   ├── language/
│   │   └── permissions/
│   │
│   ├── recommendations/
│   │   ├── candidate_generation/
│   │   ├── cold_start/
│   │   ├── feedback/
│   │   └── policies/
│   │
│   ├── moderation/
│   │   ├── classifiers/
│   │   ├── rules/
│   │   ├── cases/
│   │   ├── appeals/
│   │   └── enforcement/
│   │
│   └── workers/
│       ├── index_worker.py
│       ├── trend_worker.py
│       ├── ranking_worker.py
│       ├── moderation_worker.py
│       └── cleanup_worker.py
│
├── packages/
│   ├── contracts/
│   ├── visibility/
│   ├── ranking-schemas/
│   ├── moderation-policies/
│   └── event-schemas/
│
├── migrations/
│   ├── content/
│   ├── discovery/
│   ├── moderation/
│   └── analytics/
│
└── tests/
    ├── search/
    ├── feeds/
    ├── ranking/
    ├── recommendations/
    ├── moderation/
    ├── privacy/
    └── abuse/
```

# 15.37 Testing Strategy

## Search Tests

* Exact match

* Typo tolerance

* Multilingual queries

* Transliteration

* Zero-result behavior

* Private-content leakage

* Deleted-content exclusion

* Search pagination

* Search index delay

## Feed Tests

* Visibility enforcement

* Block/mute filtering

* Duplicate removal

* Diversity constraints

* Cursor stability

* Offline synchronization

* Realtime insertion

* Deleted content removal

## Ranking Tests

* Ranking version compatibility

* Explanation correctness

* Feature fallback

* Cold-start behavior

* Safety constraints

* Bias and language quality

* Manipulation resistance

## Moderation Tests

* High-risk content quarantine

* False-positive handling

* Human review

* Appeal restoration

* Moderator authorization

* Audit trail integrity

* Report deduplication

## Security Tests

* Search injection

* Authorization bypass

* Cache leakage

* Private group discovery

* Timing leakage

* Rate-limit bypass

* Bot behavior

* Malicious media metadata

# 15.38 Final Architecture Decision

The final design is:

```
Public Content Store
  ↓
Visibility and Authorization Layer
  ↓
Content Eligibility Layer
  ↓
PostgreSQL FTS + pgvector
  ↓
Redis Autocomplete and Hot Cache
  ↓
Candidate Generation Services
  ↓
Ranking Service
  ↓
Diversity and Safety Filters
  ↓
Feed/Search API
  ↓
Android/Web Clients
```

Moderation operates as an independent but integrated pipeline:
