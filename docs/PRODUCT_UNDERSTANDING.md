# Product Understanding

Working document, started 2026-10-01. It organizes what you have explained so far (part 1) and compares it with the original chapters, the planning drafts in this folder and the current code. It records your explanation, the proposals and open questions drawn from it, and the register of conflicts (section 40). The [Product Constitution](PRODUCT_CONSTITUTION.md) is the highest authority; the [documentation map](README.md) lists the rest.

The confirmed requirements in section 37 were approved on 2026-10-01 ([DEC-001](DECISIONS.md#accepted-decisions)); their authoritative wording is in [Article 2 of the Product Constitution](PRODUCT_CONSTITUTION.md#article-2-approved-requirements). Everything else is labelled and not approved. Only approved requirements and recorded decisions go into the implementation plan. This document is updated as you continue explaining.

Code status reflects the repository at 2026-10-01 00:12. Other agent sessions were still changing code and documents at that time.

## Labels

| Label | Meaning |
| --- | --- |
| CONFIRMED | You said it in your explanation, or it is a standing instruction you gave, and nothing in the repository contradicts it. |
| PROPOSED | Written in the original chapters, the planning drafts or text you shared, or already built as a local choice, but not yet confirmed by you. |
| ASSUMED | My inference to fill a gap. Needs your check. |
| TBD | Not decided anywhere yet. |
| CONFLICTING | Your statement disagrees with the repository or documents, or the documents disagree with each other. |

Sources in brackets: **You** = your explanation on 2026-10-01. **Earlier** = a standing instruction from earlier sessions. **Sources** = [idea.md](idea.md) and Chapter1–20. **Drafts** = planning contracts and ADRs in `docs/`. **Code** = the repository. **Shared** = the text you shared on 2026-10-01 on how experienced designers and engineers make a product feel polished and consistent. **Part A** = the text you shared on 2026-10-01, "A. Community and Public Content — End-to-End Engineering Deep Dive", on the global community platform, public community pages, posts, discovery, news and ads; it calls news and ads "the two additional content types you mentioned". Part A also covers its follow-up, "Additional features and missing requirements", which you shared next: 102 more entries in nine areas and nine open decisions (see the [Part A inventory](#part-a-inventory)). "Built", "Partly built" and "Not built" describe the code, not the requirement.

## Change Control

- Approved requirements live in [Article 2 of the Product Constitution](PRODUCT_CONSTITUTION.md#article-2-approved-requirements) and change only as its [Article 8](PRODUCT_CONSTITUTION.md#article-8-amendments) describes.
- Conflicts are handled as its [Article 5](PRODUCT_CONSTITUTION.md#article-5-resolving-conflicts) describes and recorded in section 40.
- An item becomes CONFIRMED only when you confirm it. The change is dated here and in the [changelog](../CHANGELOG.md).

## 1. Product vision

- **CONFIRMED** A global community platform with public communities and private spaces. (You)
- **CONFIRMED** It includes an agent system that assists authorized workflows. (You)
- **CONFIRMED** It includes knowledge retrieval (RAG) over authorized documents and data. (You)
- **PROPOSED** Value: public participation plus private family, couple, solo and custom coordination; dependable messaging, tasks, calendars and reminders; a user-controlled agent; care coordination without medical decision-making. (Sources: idea.md, Chapter 1)
- **TBD** What "global" means at launch: countries, languages and legal regions.
- **TBD** Product name. The documents say "Community Platform"; the folder says "FamilyCarePlus". Neither is an approved brand.

## 2. Product principles

- **CONFIRMED** Workflows stay deterministic wherever timing, state changes, retries, acknowledgements and business rules matter. (You) Code: consistent; reminders run without AI.
- **CONFIRMED** AI assists workflows and is never the source of truth. (You)
- **CONFIRMED** An agent is not automatically an administrator. (You)
- **CONFIRMED** Retrieval respects Space, membership, permission and privacy boundaries. (You)
- **CONFIRMED** Strong privacy, security, auditability and observability. (You)
- **CONFIRMED** Build on the existing repository and decisions, not a different stack. (You)
- **PROPOSED** The backend decides every permission; screens and AI prompts never do. (Sources: Chapter 11) Code: built this way.
- **PROPOSED** Being a member of a Space does not give access to everything in it. (Sources: Chapter 3) Code: built; new members don't see earlier items, and direct chats stay between two people.
- **PROPOSED** Honest status: sent, delivered, read, acknowledged, task completed and medication taken are different facts. (Sources: Chapters 4, 13, 20) Code: built for reminders.
- **PROPOSED** Never call server-readable data end-to-end encrypted; no homemade cryptography. (Sources: Chapters 11, 19)
- **PROPOSED** Health features only organize confirmed instructions: no diagnosis, prescribing, dosage changes or emergency guarantees. (Sources: Chapters 1, 11, 13)
- **CONFLICTING** Whether private activity may influence public recommendations. Chapter 15 section 15.6.4 allows it "with explicit permission"; sections 15.2 and 15.35 forbid it. The feature list follows the stricter rule. (Sources, Drafts)
- **CONFIRMED** The product feels polished and consistent: each screen is arranged by what matters now rather than by decoration, and web and Android are one product with the same words, sections and design language, even where layouts differ. (Shared; Sources: Chapters 8, 9; you confirmed it with DEC-013 and DEC-014 on 2026-10-01)
- **CONFIRMED** [DEC-013](DECISIONS.md#accepted-decisions), confirmed by you on 2026-10-01: one design system defined once in the design tokens and generated into both apps, screen rules for every new or changed screen, and a fixed way for AI sessions to change screens. (Shared) Code: since 2026-10-01 (T36) the web stylesheet and the Android theme take their colours, corner sizes and target sizes from files generated from the design tokens, and since T37 part 1 so do the care, events, community, messages, tasks and checklist styles, with inputs at 3:1 contrast; the calendar, reminders and Spaces styles and the Android screens still hold values of their own.

## 3. Users

- **CONFIRMED** A user can belong to many Spaces. (You) Code: built, with a placeholder limit of 50 active Spaces.
- **PROPOSED** One account per person with verified email and password; phone later. (Drafts: ADR-0004) Code: built, with synthetic `.test` emails only.
- **CONFIRMED** Agents are identities separate from human accounts. (You) Code: no agent identity exists.
- **TBD** Minimum age, children and guardians. Chapters 11 and 16 say this needs a qualified policy.
- **TBD** Whether organizations can hold accounts, or only people.
- **TBD** Whether people can follow other people, or only communities and pages.

## 4. User personas

- **PROPOSED** Individual user, family organizer, family member, couple partner, solo user, custom group organizer, page owner, moderator, platform administrator, software agent. (Sources: Chapter 1)
- **PROPOSED** Caregiver and care recipient; the recipient's consent is separate from any family role. (Sources: Chapters 3, 13)
- **TBD** Which personas the first release serves.

## 5. Core concepts

- **CONFIRMED** Space is the main organizational concept. (You)
- **CONFLICTING** In the code and the proposed Space rules, a Space is private only, and public communities are a separate concept called Pages. (Code; Drafts: C3-D01) See D1.
- **PROPOSED** Decided in [DEC-011](DECISIONS.md#accepted-decisions) under your delegation, awaiting your review: Pages stay the public communities, and a group Space can also be public. Signed-in people can find a public group's name, description and member count and ask to join; everything inside it stays members-only.
- **CONFIRMED** Each Space has its own membership, roles, permissions and resources. (You)
- **CONFIRMED** An agent is a software identity working within an explicit scope. (You)
- **PROPOSED** Account, profile, relationship, follow, Space membership, conversation membership, consent and agent delegation are separate concepts. (Sources: idea.md, Chapter 18)
- **PROPOSED** Each period of membership is recorded separately; rejoining starts a new one and does not restore old access. (Drafts: Space contract) Code: built.
- **PROPOSED** A user has a public profile, a personal space, public pages, private spaces and agent workspaces, which "should share one consistent model". (Sources: idea.md section 24)
- **CONFLICTING** The sources disagree on public versus private. [idea.md](idea.md) lists public pages and private spaces separately; [Chapter 3](Chapter3.md) treats Spaces as private; [Chapter 6](Chapter6.md) section 6.8 allows public and discoverable Spaces. (Sources)

## 6. Space types

- **CONFIRMED** Family. (You) Code: built.
- **CONFIRMED** Solo. (You) Code: built; exactly one owner, enforced by the database.
- **CONFIRMED** Couple. (You) Code: built (T12) under [DEC-017](DECISIONS.md#accepted-decisions), provisional: the creator and one invited partner, and the database refuses a third person.
- **CONFIRMED** Custom group. (You) Code: built as the `group` type, private by default and optionally public ([DEC-011](DECISIONS.md#accepted-decisions), provisional); T22 is done.
- **CONFLICTING** Public community as a Space type. (You) The code builds public communities as Pages. See D1.
- **PROPOSED** Couple: at most two active people, active once the partner accepts; an agent is never a third partner. (Sources: Chapters 1, 3) DEC-017 (provisional) keeps the two-person limit but lets the creator use the Space at once; it shows as waiting until the partner joins.
- **PROPOSED** Custom: configurable roles, limits and history rules. (Sources: Chapter 1)
- **TBD** Temporary event Spaces: in the sources (Chapter 3, idea.md), not in your list. See D2.
- **TBD** Extra types in Chapter 6 section 6.8: event, project, support, organization.
- **TBD** Changing a Space's type, archiving and expiry.

## 7. Membership

- **CONFIRMED** Each Space has its own membership, and users can be members of many Spaces. (You)
- **PROPOSED** Invite an existing verified account; the person accepts or declines; the owner can withdraw; invitations expire after 72 hours. (Code: built)
- **PROPOSED** The owner removes members; members can leave; the owner cannot leave without transferring ownership; the new owner must accept the transfer. (Code: built)
- **PROPOSED** A former member returns only by a new invitation and does not regain old items. (Code: built)
- **PROPOSED** New members don't see items created before they joined. (Code: built) See D3.
- **PROPOSED** Following is not membership. (Sources: Chapter 2)
- **TBD** Invitations by email, phone, link or contacts; join requests; membership of public communities (depends on D1).
- **PROPOSED** Decided in DEC-011, awaiting your review: people ask to join a public group, with an optional note, and its owner approves or declines. Approval is a new admission, so the person sees nothing from before it.
- **TBD** Member limits. The current 50 per Space is a placeholder.

## 8. Roles

- **CONFIRMED** Each Space has its own roles. (You)
- **CONFIRMED** An agent is not automatically an administrator. (You)
- **PROPOSED** Space roles: owner, admin, moderator, member, guest, observer. One human owner; admins cannot manage other admins or the owner. (Sources: Chapter 3; Drafts: C3-D03) Code: owner, admin and member since [DEC-018](DECISIONS.md#accepted-decisions) (provisional): the owner makes admins, who help with invitations, removing ordinary members and join requests.
- **PROPOSED** Page roles: owner, administrators and editors. (Drafts: Chapter 2 contract) Code: owner only.
- **TBD** Which roles each Space type uses, and who assigns them.

## 9. Permissions

- **CONFIRMED** Each Space has its own permissions. (You)
- **CONFIRMED** Retrieval respects permissions. (You)
- **PROPOSED** Every read and write checks the current account, the current membership and access to that specific item. (Sources: Chapter 11) Code: built.
- **PROPOSED** Per-item audiences: whole Space, members only, chosen roles, owner only, author only, agent only. (Sources: Chapter 3) Code: not built.
- **TBD** Per-Space permission settings, such as who may create tasks or events. Code: fixed rules, except who can invite people, which the owner of a family or group Space chooses since [DEC-026](DECISIONS.md#accepted-decisions) (provisional).

## 10. Community

- **CONFIRMED** Public communities exist. (You)
- **CONFIRMED** The public side includes posts, comments, reactions, follows, discovery and search. (You)
- **CONFLICTING** You describe a public community as a Space; the code builds it as a Page. See D1.
- **PROPOSED** As built (limited): pages with one owner, private drafts, publish, edit, delete, follow, the Following, Latest and Saved feeds (under Discover since DEC-014), comments with one reply level, likes, saves, simple search, reports and blocks. (Code)
- **PROPOSED** Page membership separate from following: open, request, invite or closed. (Drafts: C2-D03, still OPEN)
- **PROPOSED** Page roles, image and video posts, shares, hashtags, scheduled posts, page analytics, and a page agent that answers only from approved public material. (Sources: Chapter 2) Code: not built.
- **PROPOSED** A public community is a managed space with its own identity, owner, moderators, members, rules and featured posts, not just a feed. A public community can be read without joining; a restricted one shows nothing members-only to others. Who may post is set for each community. (Part A) Code: a page has an identity (unique handle, name, description, topic) and one owner, who alone posts; members, moderators, rules and featured posts are not built. Group Spaces have members, but what they post stays members-only (DEC-011). See C12 and Q24.
- **PROPOSED** Permissions by role, defined in one place rather than as scattered checks: anyone can view public details and report; a community's moderators remove posts and manage members in that community only; only the owner hands over ownership or deletes the community. (Part A) Code: owner-only checks in the community service; platform moderators are separate from page owners (DEC-024). Handing over, archiving and deleting a page have no command yet (U-10).
- **PROPOSED** Communities for topics and for places, listed in a directory by category. (Part A) Code: ten fixed topics, including "local" and "news", with a topic filter on Discover; communities for places are not built (Q9).
- **PROPOSED** Unique, normalized community addresses; suspended or deleted communities leave discovery; a community and its owner's membership are created in one change. (Part A) Code: page handles are unique lowercase addresses; archived pages are left out of every list, and pages hidden by a moderator too, except for their owner, who sees them marked; a page is saved together with its audit and outbox records.
- **PROPOSED** A build order for this group only: foundations, communities and pages, posts, discovery, news, ads, then hardening, after checking the repository so that nothing already built is rebuilt. (Part A) The order for the whole product is still open (D6).

## 11. Content

- **CONFIRMED** Public content: posts, comments, reactions. (You)
- **CONFIRMED** Private content: conversations, tasks, events, documents and other shared resources. (You) Code: documents are text files only (T14, DEC-015).
- **TBD** Which "other shared resources": calendar, reminders, care records, polls, budgets?
- **ASSUMED** "Reactions" includes likes, which are built. Other reaction types are TBD.
- **PROPOSED** Drafts stay private until published; deleted posts leave a "deleted" marker. (Code: built)
- **PROPOSED** Images and files are virus-scanned before anyone sees them. (Sources: Chapter 14) Code: only text documents in private Spaces, which are never run and are not scanned (DEC-015); no images or other files yet.
- **PROPOSED** A post goes through stated steps: draft, processing (for media), review where the community's policy asks for it, published, and later edited, hidden, removed or archived. Its step is kept separate from who may see it. (Part A) Code: draft, published and deleted, enforced by the database, with hiding by a moderator as a separate mark (DEC-024); no processing, review or archive step.
- **PROPOSED** Edit history kept where moderation, audit or disputes need it, and a rule on whether an edited published post is checked again. (Part A) Code: an "edited" mark and a version number; the earlier text is not kept (U-10; C2-D05 OPEN).
- **PROPOSED** Images and video kept in object storage, uploaded through signed links, checked for their real file type and given thumbnails. (Part A) Code: not built; files other than text wait for a virus scanner, which DEC-005 does not allow (T14).
- **PROPOSED** A retried request never creates a second post, and errors carry stable codes. (Part A) Code: built: pages, posts and comments are created with a retry key, and errors have codes such as `PAGE_MANAGER_REQUIRED` and `CONTENT_CHANGED`. The routes differ from the text's suggestions: `/v1/pages/{page}/posts` instead of `/v1/communities/{id}/posts`, `POST /v1/posts/{id}/delete` instead of `DELETE /v1/posts/{id}`, and `POST /v1/reports` instead of `POST /v1/posts/{id}/report`. Both apps use the built routes, so they stay.
- **PROPOSED** **News** as its own kind of content, separate from people's posts that link to news: items from approved sources with the source, link, author, publication and import times, language, topic and usage rights; one item when the same story arrives twice; corrections, retractions and old stories handled; summaries never shown as the publisher's own words. (Part A) Code: not built; a page can only choose the topic "news". Importing from outside sources needs network access that DEC-005 does not allow. See Q22.
- **PROPOSED** **Ads**, clearly marked as sponsored and kept apart from posts and news: advertisers; campaigns with a schedule, budget, review and status; the ad and its link; allowed places in the apps; limits on how often one person sees an ad; and view and click counts protected from bots, replays and duplicates. Ads are first chosen by a community's topic, not by what a person does, and never with sensitive personal information. (Part A) Code: not built. Billing advertisers would need a payment provider, which DEC-005 does not allow. See Q23.

## 12. Messaging

- **CONFIRMED** Private Spaces can contain private conversations. (You)
- **PROPOSED** As built (limited): one chat per Space; direct chats between two members of the same Space; a retried message is saved once; history from when you joined; unread counts; authors can delete for everyone; stored encrypted but readable by the server; screens refresh every 5 seconds. (Code)
- **PROPOSED** Live updates, delivery and read status, and reconnect support are first-release must-haves. (Sources: Chapter 1) Code: not built.
- **TBD** End-to-end encryption. Two competing Chapter 19 drafts; no decision.
- **CONFLICTING** End-to-end encryption would stop server-side agents and retrieval from reading messages. (Sources: Chapters 11, 19 versus 12, 14)
- **TBD** Group chats beyond the Space chat, attachments, editing, reactions, threads, reporting messages and blocking in chat.

## 13. Tasks

- **CONFIRMED** Private Spaces can contain tasks. (You)
- **CONFIRMED** Agents can assist with tasks. (You)
- **PROPOSED** As built: create, edit, assign, progress, complete, reopen, cancel; date-only due dates; checklists; people see tasks created while they were members. (Code)
- **PROPOSED** Dependencies, recurring tasks and shared planning workspaces. (Sources: Chapters 1, 17) Code: not built.
- **TBD** Editing a checklist currently cancels reminders set earlier for that task. Is that intended?

## 14. Scheduling

- **CONFIRMED** Scheduling follows deterministic rules; AI can help but never decides timing. (You)
- **CONFIRMED** Agents can assist with scheduling. (You)
- **PROPOSED** As built: one-time reminders with the exact local time and timezone shown for review; reminding someone else requires their acceptance; a separate worker delivers; cancelling stops delivery. (Code)
- **PROPOSED** Recurrence, exceptions, snooze, quiet hours, escalation and external calendar sync. (Sources: Chapter 13) Code: not built.
- **CONFLICTING** Daylight-saving time is handled three different ways: reminders ask you to choose, events refuse ambiguous times, care takes the first occurrence. No rule is decided. (Code)
- **TBD** Medication and care reminders. The backend exists (for the person themselves only), and another session is building the screens. Scope and who approves the health rules are open.

## 15. Events

- **CONFIRMED** Private Spaces can contain events. (You)
- **PROPOSED** As built (limited): Space events with time, timezone and location; responses Going, Maybe and Not going; a time change marks earlier responses for reconfirmation. Backend, web and Android built; Android not yet tested on a device. (Code)
- **PROPOSED** Capacity, waitlists, check-in, polls, budgets, expenses and contributions. (Sources: Chapter 17) Code: not built.
- **TBD** Public events (depends on D1).
- **TBD** Showing events in the calendar. Code: not shown yet.

## 16. Notifications

- **CONFIRMED** Agents support notifications. (You)
- **TBD** Whether an agent may send notifications itself or only prepare them for a person to approve.
- **PROPOSED** As built: in-app inbox for reminders, with read and acknowledged kept separate; unread counts for chats; sign-in code emails to a local test inbox only. (Code)
- **PROPOSED** Push, email, SMS, WhatsApp and voice, each with consent, a verified destination, quiet hours and limits. (Sources: Chapter 20) Code: not built.
- **CONFIRMED** No real external sending without your approval. (Earlier)
- **TBD** Which channels the first release needs. (Drafts: C1-D03, still OPEN)

## 17. Search

- **CONFIRMED** The public side includes search. (You)
- **CONFIRMED** Search and retrieval respect permissions. (You)
- **PROPOSED** As built: search public pages by name, handle, description and topic. (Code)
- **PROPOSED** As built: search published public posts by the words in their title and text, newest first; drafts and blocked pages never match. Built under R4 ([T29](TASKS.md#approved-requirements-not-built-yet)). (Code)
- **PROPOSED** Public content search, plus a separate private search limited to what each person may see. (Sources: Chapter 15) Code: public page and post search built; relevance ranking, typo tolerance and private search not built.
- **TBD** How private search relates to RAG.

## 18. Discovery

- **CONFIRMED** The public side includes discovery. (You)
- **PROPOSED** As built: Discover holds the Following, Latest and Saved feeds and lists pages ranked by follower count, and Home shows posts from pages you follow (DEC-014). (Code)
- **PROPOSED** Recommendations, trending, local, topics and personalization controls, with permission checks before ranking. (Sources: Chapter 15) Code: not built.
- **PROPOSED** Private chats, tasks, calendars, health data and agent memory never feed public discovery. (Sources: Chapters 2, 15; Drafts: feature list)
- **CONFLICTING** Use of private signals for public recommendations (see section 2).
- **PROPOSED** Five kinds of discovery, each with its own rules instead of one hidden ranking: search, the community directory, the following feed, a recommended feed and trending. A request finds candidates, removes what the person may not see and any duplicates, ranks, pages with a cursor, and records only the views it is allowed to. (Part A) Code: search, the directory and the following feed are built, with the access checks inside each query and cursors bound to the person; recommended, trending and view records are not.
- **PROPOSED** Ranking by relevance, freshness, quality, safety, the person's chosen preferences, limits on repeats and variety of sources, never by raw likes or clicks alone. Every set of ranking rules has a version that is logged, and changes are tested. (Part A) Code: posts newest first, and pages by follower count.
- **PROPOSED** PostgreSQL search first and a separate search index later, holding only what its audience may see, filled in the background with retries and checked against the database. (Part A; Sources: Chapter 15) Code: PostgreSQL only, queried directly, so hidden and deleted items leave every list at once.

## 19. Moderation

You have not described moderation yet.

- **PROPOSED** Reports, blocking, muting, moderation cases, reviewer queues, restrictions, appeals and audited staff access. (Sources: Chapter 16)
- **PROPOSED** A public feed is not ready for real users until reporting, blocking and removing content all work. (Drafts: feature list)
- **PROPOSED** As built: reports are stored and blocks work on public content. Since 2026-10-01 the backend also lets platform moderators review reports on pages, posts and comments, hide them or take no action, with notices to authors and one appeal to another moderator ([DEC-024](DECISIONS.md#accepted-decisions), provisional); the web and Android screens for it are not built yet (T69). (Code)
- **TBD** Who moderates (platform staff, community admins or both), which policies apply, and in which legal regions.
- **PROPOSED** Content is checked automatically and through reports, with review queues, moderator actions, appeals and an audit trail. A community's own moderators act only in that community; platform staff act across the platform. (Part A) Code: platform moderators only (DEC-024); community moderators and automatic checks are not built.

## 20. Agents

- **CONFIRMED** The platform has an agent system. (You)
- **CONFIRMED** Agents are software identities working within explicit scopes. (You)
- **CONFIRMED** Agents have permissions, allowed tools, allowed resources and approval policies. (You)
- **CONFIRMED** Agents support conversations, task assistance, scheduling, notifications, memory, retrieval and other authorized workflows. (You)
- **CONFIRMED** Agents assist; they are never the source of truth. (You)
- **PROPOSED** One shared agent engine configured per scope, not a separately trained model or always-running process per group. (Sources: idea.md, Chapters 5, 12)
- **PROPOSED** First-release limits: answers, summaries, drafts, confirmed personal reminders and group tasks. No external messages or calls, no health-record access, no permission changes, no member removal, no financial actions. (Sources: [Chapter 1](Chapter1.md) section 33.3) See D4.
- **ASSUMED** The human product is built first and the agent by a separate workstream. (Earlier instruction recorded in the feature documents; please re-confirm.)
- **TBD** What "other authorized workflows" covers.
- **TBD** AI model provider and budget. None approved.
- **TBD** How the existing unconnected agent code fits: a rule-based request parser, data models and tool definitions, with no database tables, routes or screens. (Code)
- **PROPOSED** Agent answers reach the screen as typed blocks (text, list, event, person, confirmation, approval, error, progress) that each app draws with its own components; the agent never sends HTML or decides the layout. (Shared; Drafts: C12-D13)

## 21. Agent scopes

- **CONFIRMED** Every agent works within an explicit scope. (You)
- **PROPOSED** Scope kinds: personal agent; Space agent (family, couple, solo, custom); page or event agent. (Sources: idea.md section 24)
- **PROPOSED** The scope decides which data, permissions and memory rules apply. (Sources: idea.md, Chapter 12)
- **PROPOSED** An agent in a couple Space is not a third person. (Sources: Chapters 1, 3)
- **PROPOSED** The agent gets only the minimum data it needs, checked before any AI model sees it. (Sources: Chapters 5, 12)
- **PROPOSED** A page agent answers only from approved public page material. (Sources: Chapter 2)
- **TBD** Whether one agent can work across several Spaces.

## 22. Agent permissions

- **CONFIRMED** Agents have permissions and are not automatically administrators. (You)
- **PROPOSED** An agent never grants itself permissions and never has more authority than the person who delegated to it, checked when it acts. (Sources: Chapters 5, 11, 18)
- **PROPOSED** Risky or shared actions need a person to approve the exact action, and the approval expires. Approval never makes a forbidden action allowed. (Sources: Chapters 5, 12)
- **TBD** The approval rule for each kind of action. (Drafts: Chapter 12 decisions not approved)

## 23. Agent tools

- **CONFIRMED** Agents have allowed tools. (You)
- **PROPOSED** Agent tools call the same checked backend actions that people use, with no direct database or provider access. (Drafts: feature list, Chapter 12 contract)
- **PROPOSED** A tool registry with version, input schema, risk level and side-effect type; every tool call is logged. (Sources: Chapter 12)
- **TBD** The first set of tools.

## 24. Memory

- **CONFIRMED** Agents support memory. (You)
- **PROPOSED** Memory is opt-in and scoped, records its source, consent and expiry, and people can view, correct, delete or turn it off. (Sources: Chapters 1, 5, 12)
- **PROPOSED** No automatic memory from private couple conversations; care records stay separate from agent memory. (Sources: Chapters 1, 11)
- **TBD** Consent and retention rules. (Drafts: C12-D08, still OPEN)

## 25. RAG

- **CONFIRMED** Documents and other authorized data can be ingested, parsed, chunked, indexed and retrieved. (You) Code: not built.
- **CONFIRMED** Retrieval respects Space, membership, permission and privacy boundaries. (You)
- **PROPOSED** Files are stored as unchangeable versions and virus-scanned before processing; text is extracted first, with OCR only when needed; answers cite the exact file version and page. (Sources: Chapter 14)
- **PROPOSED** Start with PostgreSQL full-text search plus pgvector. Permissions are checked before retrieval and again before any AI model sees results. Deleting a file deletes everything derived from it. (Sources: Chapter 14)
- **TBD** Which "other authorized data" can be indexed: messages, tasks, care records?
- **TBD** Embedding and AI model provider. None approved.
- **CONFLICTING** Server-side retrieval of messages conflicts with end-to-end encryption, if chosen (section 12).

## 26. Privacy

- **CONFIRMED** Strong privacy, and retrieval respects privacy boundaries. (You)
- **PROPOSED** Private Space content never enters public discovery; public views show minimal information and never show account IDs. (Sources: Chapters 2, 15, 18) Code: built.
- **TBD** Public comments show the same display name people use inside private Spaces. Acceptable, or is a separate public profile needed?
- **PROPOSED** People can export and delete their data. (Sources: Chapters 1, 18) Code: export in the backend only; deletion not built.
- **PROPOSED** Health data is sensitive; care records belong to the person they describe; a family admin is not a guardian. (Sources: Chapters 3, 11, 13)
- **PROPOSED** Views of posts and ads are recorded only where allowed, analytics never become the record of content, and ads are never aimed using sensitive personal information. Deleting content also removes what was made from it: search entries, feed copies, media and analytics. (Part A) Code: no views or analytics are recorded; deleting a post clears its title and text at once.
- **TBD** Retention periods, consent versions, legal regions, data location, age and guardian rules.

## 27. Security

- **CONFIRMED** Strong security and auditability. (You)
- **PROPOSED** As built: strong password hashing, revocable sessions, protected cookies, cross-site request checks, a content security policy, encrypted personal data, secure storage on Android, and an audit record with each change. (Code)
- **PROPOSED** Optional two-step sign-in, re-checking identity for sensitive actions, key rotation, incident response and threat modeling. (Sources: Chapter 11)
- **PROPOSED** Email and password first; phone, passkeys and social sign-in later. (Drafts: ADR-0004, Chapter 18 contract)
- **TBD** Final sign-in methods. (Drafts: C1-D05, still OPEN)
- Known gaps in the code are listed in section 40.

## 28. Data

- **PROPOSED** PostgreSQL is the source of truth; Redis only for temporary data; files in object storage; search indexes can be rebuilt. (Sources: Chapters 6, 10) Code: PostgreSQL only.
- **PROPOSED** Every record has a clear owner and scope; each change is saved together with its audit and outbox records. (Sources: Chapters 6, 7) Code: mostly built; database migrations up to `0028`; a local restore drill exists.
- **PROPOSED** Changes are announced as versioned events with stable IDs, such as `community.created`, `post.published`, `post.hidden`, `news.item_ingested` and `ad.click_recorded`, and every reader ignores duplicates, so a repeated `post.published` never makes a second search entry or notice. (Part A) Code: page, post, comment and report changes write an outbox record with its own ID, a type such as `public.post_published` and schema version 1, except edits to a draft; follows, likes, saves and blocks write none (G8). Nothing reads these records yet, because search and feeds query the database directly ([ARCHITECTURE](ARCHITECTURE.md)).
- **CONFLICTING** One scope model for public and private data (see D1).
- **TBD** Retention, backup frequency, and how much data loss and downtime are acceptable.

## 29. APIs

You have not described APIs yet.

- **PROPOSED** A REST API under `/v1` with one response format. (Drafts: ADR-0001, ADR-0002) Code: built; the current operations are counted in the [OpenAPI README](../packages/openapi/README.md).
- **PROPOSED** Change requests carry a retry key, and edits carry the version the person reviewed, so a retry never applies a change twice. (Sources: Chapter 7) Code: built.
- **PROPOSED** Live updates over WebSocket. (Sources: Chapter 7) Code: not built.
- **TBD** Whether outside developers get a public API.

## 30. Mobile

- **CONFIRMED** There is a mobile app. (You)
- **PROPOSED** Android, built with Kotlin and Jetpack Compose. (Sources: Chapter 8) Code: built.
- **ASSUMED** "Mobile" means Android only; no document mentions iOS. See D5.
- **PROPOSED** Offline support with a local database and background sync. (Sources: Chapter 8) Code: not built.
- **PROPOSED** English, Telugu and Hindi. (Sources: Chapter 8) Code: English only.
- **CONFIRMED** [DEC-014](DECISIONS.md#accepted-decisions), confirmed by you on 2026-10-01: five main sections in a bottom bar (Home, Spaces, Messages, Discover, Profile), and Home as a personal overview: what needs attention, today, your Spaces, then pages you follow. (Shared; Sources: Chapter 8 sections 8.6 and 8.12) Code: no main navigation yet; every feature opens from the account screen.

## 31. Web

- **CONFIRMED** There is a web app. (You)
- **PROPOSED** Next.js with TypeScript, a same-site server layer that holds the session, and server-rendered public pages. (Sources: Chapter 9) Code: built, except server rendering of public pages.
- **CONFIRMED** The local web preview runs only at http://127.0.0.1:3000. (Earlier)
- **CONFIRMED** The same five main sections and Home as on Android ([DEC-014](DECISIONS.md#accepted-decisions), confirmed by you on 2026-10-01). (Shared; Sources: Chapter 8) Code: the header shows icons without words and has no link to Spaces, and Home is the public posts feed.

## 32. Backend

- **CONFIRMED** A backend service architecture on the existing stack. (You)
- **PROPOSED** One modular Python (FastAPI) backend with separate background workers, not many microservices at first. (Sources: Chapter 10) Code: built; an API plus sign-in email and reminder workers.
- **ASSUMED** Your "backend service architecture" is satisfied by this modular backend plus workers.
- **PROPOSED** More workers later for notifications, files and the agent. (Sources: Chapter 10)

## 33. Infrastructure

You have not described infrastructure yet.

- **CONFIRMED** Local development only for now: synthetic test data; no real users, external providers, spending or deployment without your approval. (Earlier)
- **CONFIRMED** Local network access is limited to 127.0.0.1, localhost and the Android emulator address 10.0.2.2. (Earlier)
- **PROPOSED** Docker Compose locally; managed cloud later with a secrets manager, automated build and test pipeline, staging, backups and restore drills. (Sources: Chapter 10) Code: local Docker only; no pipeline.
- **PROPOSED** An event bus or queue, Redis, object storage, a search index and an analytics store beside PostgreSQL; one modular backend first, with parts split off only when their load or operation needs it. (Part A; Sources: Chapter 10) Code: PostgreSQL only, in one modular backend with workers.
- **TBD** Cloud provider, regions, queue technology and environments.

## 34. Observability

- **CONFIRMED** Strong observability. (You)
- **PROPOSED** Structured logs without private data, metrics, and tracing from each request through workers and agent runs; audit kept separate from monitoring; on-call. (Sources: Chapters 10, 11) Code: health checks and worker logs; since 2026-10-01 also request logs without private data, trace IDs from the web proxy to the API and a key-protected metrics endpoint (T09). No collector, alerts or on-call.
- **PROPOSED** Initial targets, not validated: reads under 300 ms and writes under 500 ms (95th percentile), feed under 2 s, search under 1 s, first agent reply under 3 s, 99.5% availability. (Sources: Chapter 1 section 35)
- **PROPOSED** Also event lag, error rates and how long reports wait for a moderator. (Part A) Code: not measured; `/metrics` shows how much sign-in mail, reminder and export work is waiting (T32).
- **TBD** Final targets, including how on time reminders must be.

## 35. AI evaluation

You have not described AI evaluation yet.

- **PROPOSED** Test sets for normal, unclear, prompt-injection, privacy, approval, crash and retrieval cases. Rule-based checks for dates, amounts and permissions come before any AI judging. A critical safety failure blocks a release. Any change to prompts, models, tools or retrieval is re-evaluated. (Sources: Chapter 12)
- **TBD** Models, providers, budgets and pass thresholds.

## 36. Constraints

- **CONFIRMED** Deterministic business workflows; AI is never the source of truth. (You)
- **CONFIRMED** Use the existing stack; decide implementation by inspecting the repository. (You)
- **CONFIRMED** Implementation was stopped while you explained the product ([DEC-003](DECISIONS.md#accepted-decisions)) and resumed on 2026-10-01 ([DEC-006](DECISIONS.md#accepted-decisions)). (You)
- **CONFIRMED** Web preview only at http://127.0.0.1:3000. (Earlier)
- **CONFIRMED** Local only; synthetic data; no external providers, spending or deployment without approval. (Earlier)
- **ASSUMED** Human product first; agent built by a separate workstream. (Earlier; please re-confirm)
- **PROPOSED** The health, encryption-honesty and privacy principles in section 2.

## 37. Confirmed requirements

Approved by you on 2026-10-01 ([DEC-001](DECISIONS.md#accepted-decisions)). The authoritative wording is in [Article 2 of the Product Constitution](PRODUCT_CONSTITUTION.md#article-2-approved-requirements); this copy must match it, and the Code today column tracks progress. Only these go into the implementation plan, and they change only through a recorded decision.

| ID | Requirement | Code today |
| --- | --- | --- |
| R1 | Users can belong to many Spaces. | Built |
| R2 | Each Space has its own membership, roles, permissions and resources. | Partly built: owner, admin and member roles (admin under [DEC-018](DECISIONS.md#accepted-decisions), provisional); one per-Space permission setting, who can invite people ([DEC-026](DECISIONS.md#accepted-decisions), provisional) |
| R3 | Public communities and private Spaces both exist. | Built; the public side is Pages (see D1) |
| R4 | The public side has posts, comments, reactions, follows, discovery and search. | Partly built |
| R5 | The private side has conversations, tasks, events and documents. | Partly built: text documents (T14; [DEC-015](DECISIONS.md#accepted-decisions), provisional); PDF, images and office files wait for the scanner decision |
| R6 | Family, couple, solo and custom group Spaces. | Built: family, solo, group (T22) and couple (T12); groups and couples under provisional decisions ([DEC-011](DECISIONS.md#accepted-decisions), [DEC-017](DECISIONS.md#accepted-decisions)) |
| R7 | Agents are scoped software identities, never automatically administrators, with permissions, allowed tools, allowed resources and approval policies. | Started: an agent without an AI model that acts only within the person's own access, with exact approvals, on backend, web and Android (T33–T35; [DEC-012](DECISIONS.md#accepted-decisions), provisional) |
| R8 | Agents support conversations, task help, scheduling, notifications, memory and retrieval. | Partly built: task help, reminders and memory by fixed rules on the backend (T33); conversation with a model waits for Q17 |
| R9 | Workflows are deterministic; AI assists and is never the source of truth. | Built for existing workflows |
| R10 | Documents and authorized data can be ingested, parsed, chunked, indexed and retrieved. | Partly built: text documents are added, split into passages and searched by their words, without a model (T14, T15); embeddings wait for Q17 |
| R11 | Retrieval respects Space, membership, permission and privacy boundaries. | Search checks Space, membership and admission inside each query (T15). The membership bug in chat and events (G1) was fixed on 2026-10-01 (T02) |
| R12 | Strong privacy, security, auditability and observability. | Partly built: basic request logs, tracing and metrics, but no alerts or collector |
| R13 | Mobile and web apps with a backend, on the existing stack. | Built |

## 38. Proposed requirements

Waiting for your confirmation.

| ID | Proposal | From |
| --- | --- | --- |
| P1 | Membership does not give access to everything; new members don't see earlier items. | Chapter 3; built |
| P2 | Couple: at most two people. Solo: one owner. Custom: configurable. | Chapters 1, 3. The couple part is decided provisionally by [DEC-017](DECISIONS.md#accepted-decisions) and built (T12); solo is built |
| P3 | Following is not membership. | Chapter 2 |
| P4 | One human owner; ownership transfer needs acceptance; the owner cannot leave without transferring. | Space contract; built |
| P5 | Roles: owner, admin, moderator, member, guest, observer. | Chapter 3. Owner, admin and member decided provisionally by [DEC-018](DECISIONS.md#accepted-decisions) and built (T13); the other roles are not decided |
| P6 | Sent, delivered, read, acknowledged and completed are kept separate. | Chapters 4, 13, 20; built for reminders |
| P7 | Health boundaries: confirmed instructions only, no medical decisions. | Chapters 1, 11, 13 |
| P8 | First-release agent limits (no external messages, calls, health records, permission changes, member removal or payments). | Chapter 1 section 33.3 |
| P9 | Agent memory is opt-in and can be viewed, corrected, deleted and turned off. | Chapters 1, 5, 12 |
| P10 | Moderation (reports, blocks, cases, appeals) before any public launch. | Chapter 16 |
| P11 | People can export and delete their data. | Chapters 1, 18 |
| P12 | In-app notifications first; other channels need consent and approved providers. | Chapter 20 |
| P13 | Live messaging with delivery and read status. | Chapter 1 |
| P14 | REST API under `/v1` with one response format. | ADR-0001, ADR-0002 |
| P15 | One modular backend plus workers. | Chapter 10 |
| P16 | Android with Kotlin and Compose; web with Next.js. | Chapters 8, 9 |
| P17 | PostgreSQL as source of truth; pgvector for retrieval first. | Chapters 6, 14 |
| P18 | Performance targets from Chapter 1 section 35. | Chapter 1 |
| P19 | AI evaluation gates before release. | Chapter 12 |
| P20 | English, Telugu and Hindi. | Chapter 8 |
| P21 | One design system: colours, font, spacing, corner sizes and touch targets defined once and generated into both apps. Confirmed by you on 2026-10-01 as [DEC-013](DECISIONS.md#accepted-decisions). | Shared; Chapters 8, 9 |
| P22 | Screen rules: most important first, one main action, cards only for repeated items, plain words, short forms, a confirmation before anything hard to undo. Confirmed by you on 2026-10-01 as [DEC-013](DECISIONS.md#accepted-decisions). | Shared; Chapters 8, 9 |
| P23 | Home as a personal overview, and the same five main sections on web and Android. Confirmed by you on 2026-10-01 as [DEC-014](DECISIONS.md#accepted-decisions). | Shared; Chapter 8 |
| P24 | Agent answers as typed blocks that each app draws; no HTML from the agent. | Shared; C12-D13 |
| P25 | Each feature written up with who, what, why, when, where and how, its flow, states, edge cases, accessibility, both apps, API, data, agent behaviour and tests. | Shared |
| P26 | News as its own kind of content from approved sources, with attribution, links, one item per story, corrections and retractions, and summaries never shown as the publisher's words. The follow-up adds registering and verifying sources, permitted feeds and connectors, reliability and provenance, breaking-news updates, topics, several languages, relevance feedback, and labels that separate reporting, opinion and people's commentary. | Part A. Not built; outside sources need DEC-005 changed (Q22) |
| P27 | Ads clearly marked as sponsored, with campaigns, review, limits on how often one person sees an ad, and view and click counts protected from bots and duplicates; chosen by topic first and never with sensitive personal information. The follow-up adds registering and verifying advertisers, placements, budgets and pacing, sponsored community posts, reports for advertisers, complaints, and revenue accounting, with billing only if earning money is in scope. | Part A. Not built; billing needs a payment provider (Q23) |
| P28 | Public communities with an owner, moderators, members and rules, where each community sets who may post. | Part A. Conflicts with DEC-011 and the code (C12, Q24) |
| P29 | Posts with images, video, documents and audio, a processing step, review where the community's policy asks for it, and edit history where needed. The follow-up adds autosave, scheduled publishing, pinning, expiry, polls, link previews, cross-posting to several communities, collections such as guides and series, and alt text and captions. | Part A; Chapter 2. Images wait for the scanner decision (T14); review and history are U-10 |
| P30 | Recommended and trending feeds, each with its own rules, and ranking rules that are versioned and logged. The follow-up adds following topics, search filters, typo tolerance, suggestions, related content, duplicate detection, a choice of feed, limits on repetition and feedback on recommendations, always within what each person may see. | Part A; Chapter 15 |
| P31 | A feature is done only with its rules, a plan tied to the existing code, migrations, API and permission behaviour, events, tests that include refused access, end-to-end scenarios, metrics and failure handling, a security, privacy and abuse review, a working demonstration and a list of what is still missing. | Part A; compare P25. Checkpoints in [BUILD_STATUS](BUILD_STATUS.md) already record tests, live journeys and limits |
| P32 | Community management: categories and tags for topic, language and region; rules; verification of official communities; settings for posting, visibility and membership; ownership transfer; deletion with a recovery window; activity figures for owners; pinned announcements; names, descriptions and rules in several languages; and active, archived, restricted, suspended and deleted states. | Part A; Chapters 2, 15, 16. Partly in U-10, C2-D02, C2-D03 and C2-D06. Rules, pinned posts, moderators, handing over, archiving and deleting decided provisionally by [DEC-025](DECISIONS.md#accepted-decisions) (T83–T85) |
| P33 | Trust and safety, which the text calls critical for a global public platform: automatic spam, bot, fake-account and coordinated-abuse detection; muting and restricting people; comment and media moderation with queues and escalation; appeals; tracking repeat offenders; reports of illegal content and child-safety concerns; content warnings and sensitive-content settings; rate limits; and a moderation audit trail with transparency reports. | Part A; Chapters 15, 16. Extends P10; partly built ([DEC-024](DECISIONS.md#accepted-decisions), T69) |
| P34 | User controls: follow and unfollow, mute topics or communities, hide posts or kinds of content, feed, notification and content-language preferences, data download, deleting or deactivating an account, consent and privacy preferences, and who sees a public profile. | Part A; Chapters 15, 18. Partly built; account deletion is T68 ([DEC-022](DECISIONS.md#accepted-decisions)) |
| P35 | Operations for public content: versioned events, caches and search indexes that never keep deleted or restricted content, media lifecycle, background jobs, feature flags, data kept by region, disaster recovery, API versions, abuse and load tests, cost tracking, and retention and deletion in every dependent system. | Part A; Chapters 10, 11, 14, 15 |
| P36 | Optional AI help, not needed for the first release: sorting posts into categories, recommending communities, detecting language and translating, summaries, finding near-duplicates and spam, community knowledge summaries, help for moderators, understanding search queries and grouping news by topic. AI never makes a high-impact moderation decision alone, and its results are measured, monitored and treated as fallible. | Part A; Chapters 12, 15, 16. Waits for Q17; agrees with R9 |

### Part A inventory

The follow-up to Part A lists 102 entries in nine areas, checked against the repository on 2026-10-01. It counts 11 discovery and 13 trust and safety entries, but its lists hold 12 of each; the total, 102, is right. 26 are built at least in part, 48 are already in the original chapters, the contracts or the [feature list](PRODUCT_FEATURES.md) without being built, and 28 are new to the repository, 23 of them in the news and advertising areas.

| Area (entries) | Built, at least in part | Already planned, not built | New | Proposal |
| --- | --- | --- | --- | --- |
| Community management (10) | Topics with a filter; active and archived page states, and hiding by a moderator | Rules and pinned announcements (Chapter 16); verification (Chapter 2); posting and membership settings (C2-D03); language and region tags (Chapter 15); ownership transfer, deletion and recovery (U-10); owner insights (`community.page-analytics`); restricted and suspended states (`safety.restrictions`) | Names, descriptions and rules in several languages | P32 |
| Posts and content (13) | Drafts; comments with one reply level; likes | Scheduled publishing (`community.scheduled-publication`); pinning (Chapters 2, 16); edit history (U-10); polls, link previews and accessibility descriptions (Chapter 2); images, video, documents and audio (`community.media-posts`, waiting for the scanner decision); deeper replies (C2-D07) and more reactions (U-07) | Expiry; cross-posting to several communities; collections such as guides and series; and autosave, part of the drafts entry | P29 |
| Discovery (12) | Following pages; saved posts; the Following, Latest and Saved feeds; page and post search with a topic filter | Following topics, search filters, typo tolerance, suggestions, related content, trending, recommendations with their controls, duplicate detection, limits on repetition and feedback such as Not interested ([Chapter 15 contract](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md); the `discovery` rows of the feature list) | None | P30 |
| Trust and safety (12) | Reports on pages, posts and comments; blocking pages and comment authors; on the backend, moderators who review grouped reports, hide content or take no action, with notices, one appeal and a record of each decision (DEC-024, T69); limits on comments, reports and sign-in | Muting and restricting (`safety.muting`, `safety.restrictions`); escalation (`safety.reviewer-queues`); spam, bot and coordinated-abuse detection, repeat offenders, and illegal-content and child-safety reports (Chapter 15 and [Chapter 16](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) contracts); content warnings (Chapters 2, 15); wider rate limits (`platform.rate-limits`) | Transparency reports, part of the audit entry | P33 |
| News (11) | Only a "news" page topic | None | All 11: registering and verifying sources, feeds and connectors, reliability and provenance, breaking updates, corrections and retractions, topics, several languages, summaries with attribution, duplicate and syndicated articles, relevance feedback, and labels separating reporting, opinion and commentary | P26 |
| Advertising (12) | None | None. Chapter 15 only limits sponsored items in feeds, and Chapter 2 leaves creator monetization out of the first release | All 12 | P27 |
| User controls (10) | Follow and unfollow; in-app reminder preferences; the data download in the backend; reminder consent | Muting topics and communities (`safety.muting`); hiding posts (`discovery.feedback`); feed preferences (`discovery.personalization-controls`); notification categories and channels (`notifications.preferences`); content language (Chapter 15); account deletion (T68, DEC-022) and deactivation (`identity.account-lifecycle`); who sees a profile (Q15, U-18) | None | P34 |
| Operations (12) | Outbox records with a schema version, which nothing reads yet; `/v1` routes; workers for sign-in mail and reminders with retries, and metrics for waiting work (T32); a local restore drill; a security sweep of every route; deleting a document deletes everything made from it | Cache and search-index rules (Chapter 15 contract; no separate cache or index exists yet); media lifecycle (Chapter 14 contract); feature flags (`platform.feature-gates`); data location (Q9); recovery targets and retention periods (Q19); load tests and cost tracking (Chapter 10 contract) | None | P35 |
| AI help (10, optional) | None: the agent works without a model (DEC-012), and no model provider is approved (Q17) | Categorization, recommendations, language detection and translation, summaries, near-duplicate and spam detection, community knowledge answers, moderation help and query understanding (Chapters 2, 12, 14, 15, 16) | Grouping news by topic | P36 |

The text's nine open decisions: R3 and R4 already answer two. Private Spaces exist beside public communities (R3), and comments and reactions belong to the public side (R4) and are built; whether a public community can be restricted is C12. Q9 covers languages and regions, and Q22 and Q23 now also ask how news arrives and when ads start. Four are new: who may create a public community (Q25), the default feed (Q26), which moderation may be automated (Q27) and the volumes to plan for (Q28).

Since this inventory: page rules and pinned posts were built on 2026-10-01 under the provisional [DEC-025](DECISIONS.md#accepted-decisions) ([T83](TASKS.md#community-management)), so "rules and pinned announcements" and "pinning" above are now built for page owners. Moderators, handing over a page, and archiving and deleting a page are T84 and T85.

## 39. Open questions

| ID | Question | Sections |
| --- | --- | --- |
| D1 | Is a public community a kind of Space? A: keep Pages and Spaces separate with shared rules (matches the code). B: one Space model with public Spaces. C: both. Answered provisionally with C by [DEC-011](DECISIONS.md#accepted-decisions), made under your delegation; please review. Part A describes public communities whose members post publicly, which neither Pages nor group Spaces provide (C12, Q24). | 5, 6, 10 |
| D2 | Keep, drop or postpone temporary event Spaces? | 6 |
| D3 | Should new members still not see earlier items, and direct chats stay between two people? | 7, 9 |
| D4 | What can the agent do in the first release, and is it still a separate workstream? Answered provisionally by [DEC-012](DECISIONS.md#accepted-decisions), made under your delegation: a rule-based agent without an AI model, with your exact approval for every change; please review. | 20 |
| D5 | Is iOS in scope? | 30 |
| D6 | Which single build order is the roadmap? Seven documents give different orders; see [DECISIONS.md](DECISIONS.md#d6-competing-build-orders). | 36, 40 |
| D7 | How should the product look and be navigated? Answered by [DEC-013](DECISIONS.md#accepted-decisions) (one design system and screen rules) and [DEC-014](DECISIONS.md#accepted-decisions) (Home as a personal overview, five main sections), which you confirmed on 2026-10-01. | 2, 30, 31 |
| Q6 | Which "other shared resources" belong in private Spaces? | 11 |
| Q7 | Which "other authorized workflows" can agents run? | 20 |
| Q8 | Which "other authorized data" can be indexed for retrieval? | 25 |
| Q9 | What does "global" mean at launch: countries, languages, data location? | 1, 26 |
| Q10 | Which notification channels are needed at launch? | 16 |
| Q11 | End-to-end encryption for messages, given that it blocks server-side agent and retrieval access? | 12, 25 |
| Q12 | Who approves the medical, legal and privacy rules for care? Care itself is in scope for now ([DEC-007](DECISIONS.md#accepted-decisions)). | 14, 26 |
| Q13 | Which daylight-saving rule applies to each feature? | 14 |
| Q14 | Who moderates, and under which policies? | 19 |
| Q15 | Should public activity show the private display name, or a separate public profile? | 26 |
| Q16 | Can agents send notifications themselves, or only prepare them? | 16, 20 |
| Q17 | Which AI model providers, and what budget? | 20, 25, 35 |
| Q18 | Should editing a checklist cancel earlier reminders? | 13 |
| Q19 | Targets for availability, speed, reminder timeliness and data retention. | 26, 34 |
| Q20 | Product name. | 1 |
| Q21 | Which section opens after sign-in? [DEC-014](DECISIONS.md#accepted-decisions) lists Home first but does not say. Both apps still open Profile (the account screen), as before T38; Home is the usual choice. Changing it changes the sign-in step of every live journey. | 30, 31 |
| Q22 | Should news become an approved requirement (P26), and are news articles imported, linked, summarized, or all three? News pages could post linked news locally first; importing from outside sources needs DEC-005 changed. Asked on 2026-10-01; you were not available. | 11 |
| Q23 | Should ads become an approved requirement (P27), and do they start in the first release or once the platform has an audience? Simple sponsored posts chosen by community topic, with no billing, or a full advertiser system with campaigns, budgets and reports, whose billing needs a payment provider? Asked on 2026-10-01; you were not available. | 11, 26 |
| Q24 | Who can post in a public community: only the page owner (today), the owner and chosen editors, or members whose posts are public (P28)? Asked on 2026-10-01; you were not available. | 8, 10 |
| Q25 | Can anyone create a public community, or is approval needed? Today any signed-in account can create up to 5 pages, without approval. | 10 |
| Q26 | Is the public feed chronological by default, recommended, or chosen by each person? Today every feed is chronological: Following, Latest or Saved. | 18 |
| Q27 | Which moderation actions may be automated, and which always need a person? Today nothing is automated: moderators decide each report ([DEC-024](DECISIONS.md#accepted-decisions)). | 19 |
| Q28 | How many people, posts and media files should the first release and later years plan for? The current limits, such as 5 pages per account and 2,000 posts per page, are local placeholders. | 34 |

## 40. Conflicts with the existing repository

### Conflicts

Conflicts are recorded and resolved as [Article 5 of the Product Constitution](PRODUCT_CONSTITUTION.md#article-5-resolving-conflicts) describes. Each stays Open until a recorded decision resolves it.

| ID | Conflict | Sources and levels | Newer confirmed decision | Status |
| --- | --- | --- | --- | --- |
| C1 | Is a public community a kind of Space? | Your explanation (not yet confirmed) says a Space can be a public community. The code (level 8) and the [Space contract](CHAPTER_03_SPACE_CONTRACT.md) (level 5, C3-D01 PROPOSED) keep Spaces private and public communities as Pages. The original sources disagree with each other (Chapter 3, Chapter 6 section 6.8, idea.md). | DEC-011 (2026-10-01), made by the build session under your delegation | Resolved provisionally: Pages stay, and a group Space can be public (findable, ask to join) while its content stays members-only. Awaiting your review. |
| C2 | Which Space types exist? | R6 (level 1) names family, couple, solo and custom. The original sources add temporary event Spaces, and Chapter 6 adds event, project, support and organization types. | R6 (2026-10-01) settles the four named types; nothing settles the others | Open: D2 |
| C3 | What can agents do in the first release? | R8 (level 1) lists what agents support. Chapter 1 section 33.3 (level 6, PROPOSED) limits the first-release agent, and the feature documents (level 5) give all agent work to a separate workstream. | R8 (2026-10-01) sets the capabilities, not the first-release scope | Open: D4 |
| C4 | Can retrieval work over private conversations? | R11 (level 1) requires retrieval within privacy boundaries. The Chapter 19 contract (level 5; C19-D05 and C19-D06 OPEN) plans end-to-end encryption, which would stop the server reading messages. | None | Open: Q11 |
| C5 | Can private activity influence public recommendations? | The Chapter 15 contract (level 5) allows it in section 15.6.4 and forbids it in sections 15.2 and 15.35. | None | Open |
| C6 | Which daylight-saving rule applies? | R9 (level 1) requires deterministic workflows. The code (level 8) uses three rules: for a repeated local time, reminders let the person choose, events refuse, and care takes the first. Since 2026-10-01 repeating reminders ([DEC-010](DECISIONS.md#accepted-decisions), provisional) add a fourth: a repeated time takes the first, and a skipped time moves just past the change or is skipped, as the person chose when saving. Each rule is still deterministic. | None | Open: Q13 |
| C7 | Which build order is the roadmap? | Only confirmed decisions go into plans (Constitution Article 4). Seven documents at levels 5, 6, 7 and 9 give different build orders, including the End-to-End Plan in [TASKS.md](TASKS.md#end-to-end-plan), and [FEATURES_AND_SCREENS.md](FEATURES_AND_SCREENS.md) section 5 calls its order agreed without a recorded decision. | None | Open: D6 |
| C8 | Did implementation stop? | DEC-003 (level 1) paused implementation; the stop was recorded at 00:35:25 on 2026-10-01. The build session kept building care screens after your "please continue" in that session: web files last changed at 00:28 and Android files at 00:35:39. It ran checks until about 00:47 and stopped when it found DEC-003. Care was also not an approved requirement (Q12). See X1 in [TASKS.md](TASKS.md#work-outside-the-approved-scope). | DEC-006 and DEC-007 (2026-10-01) | Resolved: you resumed implementation and kept care |
| C9 | Separate documents for each design and engineering subject? | The text you shared (not yet confirmed) proposes 21 new documents, from `01_PRODUCT.md` to `21_AI_ENGINEERING_RULES.md`, and one 28-part master specification. DEC-008 (level 1) and the [documentation map](README.md) keep one authoritative document per subject, and every subject in that text already has one. | DEC-008 (2026-10-01) | Resolved: no parallel documents. The real gaps are filled in the existing documents: screen rules and design tokens ([DEC-013](DECISIONS.md#accepted-decisions)), Home and navigation ([DEC-014](DECISIONS.md#accepted-decisions)). |
| C10 | Was the alerts work approved? | Migration `0021` and the alerts code (level 8) were built on 2026-10-01 between 08:22 and about 10:08 by a session that left no record. They add quiet hours, backup people who are alerted about missed reminders, event and dose alerts, moving and replacing a repeating reminder, events in the calendar, and a calendar-file download. [TASKS.md](TASKS.md) (level 7) keeps T23–T26 and T28 Blocked on U-17, Q10, C13-D06, C13-D09, Q12, C13-D04 and C13-D05. [DEC-010](DECISIONS.md#accepted-decisions) and the changelog call this work not built, and no task, decision, checkpoint or changelog entry covers it. Found by the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#m3-a-whole-feature-was-built-with-no-record). | None | Open: you keep or revert the alerts work (X2 in [TASKS.md](TASKS.md#work-outside-the-approved-scope)). The audit session changed no code. |
| C11 | Can a session make a product decision when you delegate it? | [DECISIONS.md](DECISIONS.md#how-decisions-are-recorded) says only you approve a decision: an AI assistant can prepare one but never approve it. The Constitution (level 1) puts only confirmed requirements and accepted decisions into plans and tasks (Article 4 rule 4), and lets an AI apply only a resolution that a confirmed decision settles (Article 5 step 5). Build sessions made DEC-010 to DEC-014 under your general delegation, after you could not answer. They are listed under "Accepted Decisions" while marked unconfirmed, and T19–T22 and T33–T38 build on them. C1 was resolved on the strength of DEC-011, and the [End-to-End Plan](TASKS.md#end-to-end-plan) plans to decide Q8, P2 and P5 the same way. Found by the [engineering audit](ENGINEERING_AUDIT_2026-10-01.md#m2-ai-sessions-make-product-decisions-and-build-them-at-once). | None: the delegations were given in conversation and are not recorded as a decision. For DEC-013 and DEC-014: your confirmation on 2026-10-01. For the rule itself: [DEC-016](DECISIONS.md#accepted-decisions), your words in the completion session on 2026-10-01 ("I'm giving full permissions to you … if anything didn't mention properly then try to work on it"), recorded there | Resolved for the rule by DEC-016: when you delegate, a session may decide an open product choice provisionally, records it with your words, and you review it and may reverse it. Resolved for DEC-013 and DEC-014, which you confirmed on 2026-10-01; DEC-015, DEC-017 and DEC-018 were made under DEC-016 and stay provisional until you review them. Open for DEC-010 to DEC-012: you confirm or reverse each. |
| C12 | What is a public community, and who posts in it? | Part A (not yet confirmed) describes public communities with an owner, moderators, members, rules and featured posts, which anyone can read and where each community sets who may post, so members' posts can be public; restricted communities hide their content from others. [DEC-011](DECISIONS.md#accepted-decisions) (provisional, made under your delegation) keeps Pages as the public content model, published by their owner alone and followed by others, and lets a group Space be found and joined while its content stays members-only. The code (level 8) builds exactly that, and the [public content contract](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md) (level 5) leaves page membership open (C2-D03). None of them has a community whose members post publicly. | None: Part A is not confirmed, and DEC-011 is provisional | Open: Q24, asked on 2026-10-01 while you were not available. Pages and group Spaces stay as built until you decide. |

### Confirmed requirements the code does not meet yet

| ID | Requirement | Gap |
| --- | --- | --- |
| G1 | R11: retrieval respects membership | Fixed on 2026-10-01 (T02): a new member no longer sees a chat message or event created at the same moment they joined. History now compares admission order numbers instead of timestamps. |
| G2 | R12: security | Fixed on 2026-10-01: a direct message sent after the other person left (T03), changes saved after sign-in expired during a wait (T04), and one sign-in limit shared by all web users when the web app runs behind a trusted proxy (T10). Since T11, the encryption key can be replaced in stages without signing anyone out or losing stored data. Still open: production key custody (C11-D08); the lookup key itself is not rotated. |
| G3 | R12: observability | Since 2026-10-01: request logs without private data, trace IDs from the web proxy to the API and a key-protected metrics endpoint (T09), which also shows how much background work waits, for how long, and how much failed (T32). Missing: a collector, dashboards, alerts (targets, Q19), database server metrics, and traces into workers. |
| G4 | R2: roles and permissions | Owner, admin and member roles (admin since [DEC-018](DECISIONS.md#accepted-decisions), provisional); one per-Space permission setting, who can invite people ([DEC-026](DECISIONS.md#accepted-decisions), provisional); others not decided. |
| G5 | R5 and R10: documents and retrieval | Since 2026-10-01: text documents in private Spaces and search by words over documents, tasks and events, without a model (T14, T15). Missing: other file types and virus scanning (the scanner decision), and embeddings (Q17). |
| G6 | R6: couple and custom Spaces | Built: custom groups (T22, [DEC-011](DECISIONS.md#accepted-decisions)) and couple Spaces (T12, [DEC-017](DECISIONS.md#accepted-decisions)), both provisional until you review them. |
| G7 | R7 and R8: agents | Since 2026-10-01: an agent without an AI model, limited to the person's own access, with exact approvals and memory, on backend, web and Android (T33–T35). Missing: conversation with a model (Q17) and the owner's review of DEC-012. |
| G8 | R12: auditability | Follows, likes, saves and blocks leave no audit or outbox record; reports, message sends, comment creation and event answers leave only an outbox record. Whether each needs an audit record is open (U-06 in the [Domain Contract](DOMAIN.md#entity-decisions)). |
