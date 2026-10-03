# Community Audit, 2026-10-02

A dated, read-only comparison of **Part B** with the repository at commit `1f5b1ef`. Part B is the community management and governance specification the product owner shared on 2026-10-02 (also saved as `docs/# Community Platform — Complete Communit.md`), together with the owner's own explanation in the same message: an interest-driven community system, ten ways to classify a community, an interest graph and nine kinds of community rules.

This is evidence (level 9), not an authority. Requirements are in the [Product Constitution](PRODUCT_CONSTITUTION.md); the owner's explanation and the proposals drawn from Part B are in the [Product Understanding](PRODUCT_UNDERSTANDING.md#part-b-inventory); the work is in [TASKS](TASKS.md#community-intelligence-and-governance).

## 1. How This Was Checked

- Read the Constitution, the decisions, the Product Understanding, the task list, the Chapter 2, 15 and 16 contracts, the feature list, the screen list and the Domain Contract.
- Read the code: backend modules `community`, `safety`, `spaces`, `identity`, `notifications`, `discovery`, `realtime`, `agents` and `events`; web `features/community`, `features/platform` and `features/identity`; Android `feature/community` and `feature/platform`. Five read-only research passes, on two models, listed what exists; every rule-bearing fact below was checked again against the code. Several defects they suggested are intended behaviour (for example, an archived page's posts stay in the feeds because an archived page stays readable) and are not listed.
- Counted from the code: 49 public community operations and 8 moderation operations; the generated API description has 192 operations on 163 paths; the newest migration is `0031`.
- No tests were run for this audit. The defects in section 7 were found by reading the code; each task starts with a test that fails before the fix.

## 2. What Exists Today

| Area | Built | Where |
| --- | --- | --- |
| Public community | Pages with a unique handle (3–30 characters, 31 reserved words), a name, a description, one of ten topics, rules (up to 2,000 characters), an owner, up to 10 moderators, followers; any signed-in account owns up to 5 pages | `backend/app/modules/community/` |
| Lifecycle | Active, read only (the owner's Archive), deleted with 7 days to restore and then erased with the handle kept, and `archived` for pages of deleted accounts; hiding by a platform moderator | `community/service.py`, `community/lifecycle.py` |
| Content | Text posts (title up to 120, text up to 5,000) with drafts, publish, edit, delete, up to 3 pins; comments with one reply level; likes; saves; reports with nine reasons; blocks | `community/service.py` |
| Discovery | Page directory by follower count with a topic filter and a word search on name, handle and description; post search on title and text; Following, Latest and Saved feeds, newest first; cursors bound to the person and the query | `community/service.py` lines 624–675 |
| Moderation | Platform moderators named by an operator command; grouped report queue; Hide or No action with a reason; author notices; one appeal to another moderator ([DEC-024](DECISIONS.md#accepted-decisions)) | `backend/app/modules/safety/` |
| Private groups | Group Spaces, private or public; public ones are found by name and description and joined by request ([DEC-011](DECISIONS.md#accepted-decisions)); owner, admin and member roles; who can invite | `backend/app/modules/spaces/` |
| Apps | Web: `/app/discover`, `/app/pages`, `/pages/[handle]`, `/posts/[id]`, `/app/home`, `/app/moderation`, `/app/safety`, in English, Telugu and Hindi. Android: the same flows under Discover and Profile | `web/src/features/community/`, `android/.../feature/community/` |

## 3. Capability by Capability

The 26 capabilities that Part B section 29 asks to check. **Built** means the capability works as Part B describes it, **Partly built** that some of it works, **Not built** that nothing does. "Needs a decision" means a product choice is open; the task names it.

| # | Capability | Status | What exists | What is missing | Next |
| --- | --- | --- | --- | --- | --- |
| 1 | Community creation and identity | Partly built | Create a page with handle, name, description and topic; it is active at once | A draft community before publishing, a welcome message, branding, organization identity, who may create (Q25) | [T146](TASKS.md#community-intelligence-and-governance) for images; the rest needs a decision |
| 2 | Categories and subcategories | Partly built | One of ten fixed topics, with a filter | A hierarchy, several per community, names in each language, management | [T126](TASKS.md#community-intelligence-and-governance) |
| 3 | Tags, interests and taxonomy management | Not built | — | Interests, a managed vocabulary, people's own interests; free-form tags | T126, T127, T128; free-form tags need a decision |
| 4 | Visibility and join policies | Partly built | Pages are public; group Spaces are private or public with join requests | Private and invite-only public communities, join policies for pages | T143, waiting for Q24 |
| 5 | Membership and invitations | Partly built | Spaces: invitations (72 hours), join requests (14 days), roles, removal, leaving; pages: following only | Membership of public communities | T143 |
| 6 | Roles and permissions | Partly built | Page owner and moderators; platform moderators; Space owner, admin and member | Content managers, event organizers, analysts, guests, custom roles from one permission registry | T143; P5 and Q24 |
| 7 | Rules and policy evaluation | Partly built | One free-text rules field per page | The nine rule categories, versions, citing a rule in reports and decisions, precedence over community rules, automatic checks | [T130](TASKS.md#community-intelligence-and-governance); automatic checks wait for Q27 |
| 8 | Verification | Not built | "official" is only a reserved handle word | A badge that says exactly what was verified, review, expiry | [T131](TASKS.md#community-intelligence-and-governance) |
| 9 | Customization | Partly built | Name, description, topic, rules | Avatar and cover (need image scanning), colours, welcome text, sections | T146; the rest needs a decision |
| 10 | Ownership transfer and succession | Built for pages and Spaces | Handover to a current moderator: a 15-minute offer, a recent sign-in, acceptance | What happens when the owner is gone; several owners for an organization | [T147](TASKS.md#community-intelligence-and-governance), waiting for Q31 |
| 11 | Deletion and recovery | Built for pages | Deleting needs the exact name; 7 days to restore; erased afterwards, handle kept | How long backups keep it (Q19) | — |
| 12 | Activity insights | Not built | Follower count only | Weekly figures for owners, without anyone's individual activity | [T132](TASKS.md#community-intelligence-and-governance) |
| 13 | Announcements and pinned content | Partly built | Up to 3 pinned posts | Announcements that notify followers, scheduling, expiry | [T133](TASKS.md#community-intelligence-and-governance) |
| 14 | Localization | Partly built | The apps in English, Telugu and Hindi ([DEC-023](DECISIONS.md#accepted-decisions)) | Community names, descriptions and rules in several languages | [T134](TASKS.md#community-intelligence-and-governance), waiting for Q33 |
| 15 | Lifecycle controls | Partly built | Active, read only, deleted; hiding by moderators | Draft, restricted and suspended | [T135](TASKS.md#community-intelligence-and-governance) |
| 16 | Content and feeds | Partly built | Text posts, comments, likes, saves; three chronological feeds | Images and video (scanner), scheduled posts, polls, shares, link previews (need internet access, [DEC-005](DECISIONS.md#accepted-decisions)), edit history (U-10) | T146; others need decisions |
| 17 | Interest-based discovery | Not built | — | Communities and posts chosen by a person's interests, with reasons | T126, T127, [T129](TASKS.md#community-intelligence-and-governance), [T136](TASKS.md#community-intelligence-and-governance) |
| 18 | News | Not built | A page can choose the topic "news" | News from approved sources with attribution | [T141](TASKS.md#community-intelligence-and-governance), waiting for Q22 and DEC-005 |
| 19 | Advertising | Not built | — | Sponsored posts, eligibility, frequency limits, reports | [T142](TASKS.md#community-intelligence-and-governance), waiting for Q23 and DEC-005 |
| 20 | Moderation and appeals | Partly built | Platform moderation with notices and one appeal; page moderators remove comments | A queue for page moderators, warnings and restrictions on people, automatic detection, quality figures | [T137](TASKS.md#community-intelligence-and-governance); Q14, Q27 |
| 21 | Events and planning | Partly built | Events inside private Spaces | Public community events, registrations, budgets | [T144](TASKS.md#community-intelligence-and-governance), waiting for U-17 |
| 22 | Community agent | Not built | A personal rule-based agent ([DEC-012](DECISIONS.md#accepted-decisions)) | Summaries, drafts and moderator help for communities | [T145](TASKS.md#community-intelligence-and-governance), waiting for Q17 |
| 23 | Notifications | Partly built | An in-app inbox for reminders; live hints for chats and the inbox; phone and browser alerts | Moderator invitations, handover offers, moderation decisions, announcements and join requests in the inbox | T133 |
| 24 | Search and recommendations | Partly built | Word search on pages and posts | Filters, typo tolerance, recommendations, trending | T126, T127, [T138](TASKS.md#community-intelligence-and-governance); trending waits for C15-D09 |
| 25 | Privacy, security and compliance | Partly built | Server-side checks, private Spaces never in public queries, encrypted personal data, audit, export, deletion, a sweep of every route | A written privacy notice and community policies; laws for each launch region | [T140](TASKS.md#community-intelligence-and-governance), waiting for qualified legal review and Q9 |
| 26 | Audit and observability | Partly built | Audit rows and outbox records for page and post changes; request logs; worker metrics | Follows, likes, saves and blocks leave no record (G8); nothing reads the outbox; moderation backlog figures | [T139](TASKS.md#community-intelligence-and-governance) |

## 4. The Owner's Ten Classification Dimensions

The owner's words, 2026-10-02: a community "can have multiple topics, interests, languages and regions", so "do not force a community into one category when its purpose is broader". [DEC-027](DECISIONS.md#accepted-decisions) builds the first part, provisionally.

| Dimension | The owner's examples | Purpose (the owner) | Today | DEC-027 |
| --- | --- | --- | --- | --- |
| Topic | technology, education, health, travel | the main subject | One of ten topics | A main topic and up to 2 more, from 20 topics |
| Interest | AI, gardening, cricket, cooking | the specific interest | — | Up to 10 per page, from 79 interests, each under a topic |
| Language | English, Telugu, Hindi, Tamil | language-based discovery | — | Up to 5 per page, from 31 languages |
| Region | country, state, city, place | geographic relevance | The topic "local" | Up to 3 places per page: countries, India's states and union territories, and its main cities |
| Community type | family, professionals, hobby, locals | the community's purpose | — | Up to 2, from 9 |
| Audience | beginners, experts, parents, students | who it is for | — | Up to 3, from 8 |
| Activity | learning, discussions, events, support | what members do | — | Up to 4, from 7 |
| Content preference | tutorials, discussions, news, videos | the content it prefers | — | Up to 4 content kinds, from 7 |
| Visibility | public, private, invite only | access | Pages are public; group Spaces are private or public | Not stored again; private and invite-only communities wait for Q24 |
| Lifecycle | active, archived, restricted | operational state | Active, read only, deleted | Not stored again; restricted is T135 |

## 5. The Interest Graph

The owner described a graph: a member connects to their interests, interests connect to topics, and topics connect to relevant communities, news and eligible sponsored content; a community connects to relevant news, posts and discussions, and eligible sponsored content. The owner's example: an interest in sustainable gardening leads to composting, soil health and urban farming, to communities such as urban gardeners and organic farming, to agriculture news, and to gardening tools or workshops as sponsors.

| Edge | Today | Plan |
| --- | --- | --- |
| Member → interests | — | T127: the person chooses topics, interests, languages and places; nothing is inferred |
| Interest → topic | — | T126: each interest sits under one topic in the shared vocabulary |
| Topic and interest → communities | — | T126 classifies pages; T127 suggests pages and says why |
| Community → posts and discussions | Posts belong to a page | T129: posts from pages that match your interests |
| Topic → news | — | T141, waiting for Q22 |
| Topic → sponsored content | — | T142, waiting for Q23; interests marked sensitive are never used |

The owner also mentioned family discussions as a source of interests. The current privacy rules forbid using private Spaces for public discovery or ads, so that is added to conflict [C5](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository) and the stricter rule stays until the owner decides.

## 6. The Owner's Nine Rule Categories

Posting guidelines; allowed and prohibited content; member behaviour and conduct; advertising and self-promotion; news sources and attribution; disclosure of AI-generated content; privacy and personal information; events, commerce and fundraising; moderation and appeal procedures. Today a page has one free-text rules field. [T130](TASKS.md#community-intelligence-and-governance) turns it into rules in these categories, versioned, so a report or a moderator's decision can name the rule. Automatic enforcement waits for Q27.

## 7. Defects Found

Each was confirmed by reading the code at the lines given.

| Task | Defect | Evidence |
| --- | --- | --- |
| [T148](TASKS.md#defects-that-break-approved-requirements) | Comment and message rate limits answer `Retry-After: 900`, a 15-minute wait, while their message says to wait a minute and the limit counts the last minute | `backend/app/errors.py` line 2 defaults `retry_after` to 900; `community/service.py` line 800 and `messaging/service.py` line 357 do not set it |
| [T149](TASKS.md#defects-that-break-approved-requirements) | Android shows topic and report reason codes in English to Telugu and Hindi users | `CommunityScreen.kt` lines 268, 288, 632, 743, 790 and 827 print the code with its first letter capitalized |
| [T150](TASKS.md#defects-that-break-approved-requirements) | The web moderation screen marks "Blocked" as the current page and gives no link back to it | `moderation-screen.tsx` lines 24 and 32 pass `current="safety"`; `shared.tsx` line 71 then shows Blocked as the current page |
| [T151](TASKS.md#defects-that-break-approved-requirements) | On the web, after a lost answer to a handover offer, the confirmation still shows its first button, which sends a new key, beside Retry | `page-management.tsx` lines 104–116 keep the confirmation open; line 181 makes a new key |

Also seen, not defects: Android has a second `HomeViewModel` in `feature/home` that nothing imports; erased pages' open reports stay in the moderation queue, shown as unavailable, as T115 intended.

## 8. Risks and Constraints

- **Local only ([DEC-005](DECISIONS.md#accepted-decisions)).** Importing news, ad networks and payments, link previews, push providers and image scanning all need internet access, external providers or money, none of which is approved.
- **Privacy.** Interests are personal data. DEC-027 keeps them private, chosen by the person, included in the data download and erased with the account, and uses nothing from private Spaces (C5). Interests marked sensitive (health, support and similar) must never choose ads.
- **Scale.** Suggestions score at most 500 candidate pages, the most followed first; volumes are unknown (Q28).
- **Translations.** The Telugu and Hindi names in the vocabulary are machine drafts until a native speaker reviews them, as [DEC-023](DECISIONS.md#accepted-decisions) says.
- **Open model questions.** Members who post (Q24, C12) and a public community as a kind of Space (D1) change the data model; T126 and T127 classify pages so the same vocabulary can classify a public group or a unified community later.

## 9. Order of Work

Dependencies first, as Part B section 26 asks, and nothing that needs an unanswered question:

1. T126 shared vocabulary and page classification, then T127 your interests and suggested pages (DEC-027).
2. T148–T151, the defects above.
3. T128 vocabulary administration; T129 posts from your interests; T136 feed controls.
4. Governance: T130 rules, T135 restricted and suspended, T131 verification, T132 insights, T133 notifications and announcements, T134 translations, T137 page moderators' queue.
5. Waiting for the owner: T141 news, T142 ads, T143 members who post, T144 public events, T145 community agent, T146 images, T147 succession, T140 legal texts.
