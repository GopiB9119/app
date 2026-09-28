# Chapter 2: Public Pages, Posts and Interactions Contract

Status: DRAFT FOR PRODUCT, COMMUNITY, IDENTITY, SECURITY AND DATA-RIGHTS REVIEW. This fills the public-content design gap, not an implemented service, accepted role policy or completed release test.

## 1. Scope and Existing Owners

Own page creation/profile/roles/lifecycle and post/comment/reaction/follow/share/save commands. Public event admission, search/ranking, moderation cases, identity, files, Agent execution and delivery retain their existing owners. A shared component is not permission to merge their data or authorities.

- [Chapter 2 source](../Chapter2.md) remains unchanged. The [reconciliation index](CONTRACT_RECONCILIATION.md) preserves its 22 topic anchors, 32 acceptance criteria and 36 source operations as COV2-A01 through COV2-A32 and COV2-P01 through COV2-P36. Those are index-local IDs, not definitions in this file.
- [Data](CHAPTER_06_DATA_CONTRACT.md) C6-E07 owns typed page/post/comment constraints; [API](CHAPTER_07_API_REALTIME_CONTRACT.md) C7-W03 owns transport policy. This document supplies the missing domain behavior, not a second database or envelope.
- [Identity](CHAPTER_18_IDENTITY_CONTRACT.md) C18-W07/C18-W10 supplies intended admission, ownership and actual human/page attribution; [files](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) owns immutable media and safe processing.
- [Discovery](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md) owns eligible projections/ranking; [trust and safety](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) owns case-scoped enforcement/appeals. Page moderation does not grant platform operator powers.
- [Events](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md), [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [messaging](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) and [delivery](CHAPTER_20_DELIVERY_CONTRACT.md) remain single domain authorities.
- [Android](CHAPTER_08_ANDROID_CONTRACT.md) C8-W02/C8-W06 and [web](CHAPTER_09_WEB_CONTRACT.md) C9-W02 implement these projections/commands through their shared client contracts. No client has been built or exercised here.

The [release plan](CHAPTER_01_RELEASE_PLAN.md) and five existing proposed ADRs remain unapproved. Full public-community scope is not the manual synthetic M1 task/reminder slice. Text/image posts, comments/replies, basic likes, follows, public search/feeds/events/RSVP, reporting/blocking/muting, moderation and draft-first Agent assistance retain the source release boundaries. Audio, full video processing, paid membership, marketplace, advanced analytics and autonomous publishing do not become enabled by this draft.

## 2. Decisions Before Use

Every direction below is a proposal. OPEN rows identify choices that cannot be settled by documentation alone; none changes an owning ADR or existing decision status.

| ID | Choice | Direction or required decision | Status |
| --- | --- | --- | --- |
| C2-D01 | Page authority | Use the explicit page action/target matrix below, separate from Space roles and follower status. | PROPOSED |
| C2-D02 | Owner continuity and critical changes | One accountable human owner; transfer requires owner step-up, intended successor acceptance and atomic exchange. Administrative initiation is not unilateral takeover. | PROPOSED |
| C2-D03 | Membership and history | Choose launched open/request/invite/closed/event-linked admission policies, role combinations, roster audience, member-history defaults and page-specific block effects. Paid admission remains deferred. | OPEN |
| C2-D04 | Publication revisions | Separate private working revision from approved published revision; explicit human publication of exact content/audience and current source rights. | PROPOSED |
| C2-D05 | Edit and review policy | Choose material-change rules, whether a prior eligible revision stays visible during review, edit-history audiences and appeal requirements before public launch. | OPEN |
| C2-D06 | Lifecycle and retention | Archive disables new ordinary publication/interaction while retaining permitted reads; deletion excludes ordinary disclosure before resumable purge. Select retention/restore/slug-reuse/legal-hold policy. | PROPOSED |
| C2-D07 | Comments and ranking | Choose depth, edit windows, pin limits, locked-thread behavior and exact pinned/relevant/recent/meaningful-engagement ordering with bounded stable cursors. | OPEN |
| C2-D08 | Reactions and follows | Explicit actor-scoped add/remove/set commands, stable idempotent effects, uniqueness and authoritative contribution accounting; never retry a toggle. | PROPOSED |
| C2-D09 | Sharing and saves | Shares are authorized references with current original eligibility; saves are private references and not consent to public personalization. | PROPOSED |
| C2-D10 | Media and references | Reuse immutable permitted file versions, safe link rendering/fetching and typed source references; no client-supplied clean/public flags. | PROPOSED |
| C2-D11 | Interfaces and distribution | One reviewed operation/schema set, durable domain/audit/outbox changes and current-authorized search/feed/notification projections. Source routes remain examples. | PROPOSED |
| C2-D12 | Release evidence and limits | Select named reviewers, taxonomy/profile-field rules, formats, rate/size/capacity limits, workload/SLOs, moderation staffing and actual acceptance evidence. | OPEN |

## 3. Page Authority and Field Audiences

Source [2.5](../Chapter2.md#L268) names owner, administrators, moderators and authorized editors. The matrix is a conservative proposed capability assignment, not a hierarchy inferred from role names. A target's scope, membership, resource revision, account restriction, source audience and policy still apply to every allowed cell. Multiple approved roles may combine capabilities, never bypass a denial or ownership protection.

| ID | Action | Proposed allowed actor | Target and restriction boundary |
| --- | --- | --- | --- |
| C2-R01 | Read published public projection | Visitor, follower, member or staff | Only current eligible public fields; no private owner contact, drafts, internal roster, analytics or organizer data. |
| C2-R02 | Read member-only or selected content | Currently entitled admitted member or explicitly selected account | Follow alone grants no private access. Staff title alone grants no unrelated conversation, file or historical access. |
| C2-R03 | Create a page | Eligible authenticated human | Derive initial owner from session; no caller-supplied owner/verified badge or mass assignment of capabilities. |
| C2-R04 | Edit ordinary page profile/rules | Owner or authorized administrator | Allowlisted fields, expected revision, field audience and any required re-review. Editor may change content drafts, not hidden critical settings. |
| C2-R05 | Create/edit page-attributed draft and submit review | Owner, administrator or assigned editor | Actual human actor retained; page attribution separately authorized. Personal drafts outside the page remain private. |
| C2-R06 | Publish/schedule a reviewed page revision | Current owner, administrator or assigned publishing editor | Exact human intent, current authority, media and moderation clearance. An Agent may only draft in the source MVP. |
| C2-R07 | Comment/react/share permitted public content | Eligible authenticated human | Parent visible, page/post/thread controls allow action, no relevant block/restriction. Reading a public URL does not grant write capability. |
| C2-R08 | Edit own comment | Original human author | Current parent access, allowed window and revision. Page moderators cannot rewrite another person's words. |
| C2-R09 | Hide/remove/pin/lock page discussion | Owner, administrator or assigned moderator; post author only for explicitly allowed own-post controls | Local moderation only, attributable reason/audit, exact target. No platform ban or private evidence access from a page role. |
| C2-R10 | Admit/remove ordinary page members | Owner or administrator with explicit membership capability | Same intended admission service, restricted grant set and owner protection. No self-escalation, forced follower admission or arbitrary historical grants. |
| C2-R11 | Assign/revoke administrator, editor or moderator | Owner; administrator only for explicitly delegated lower capabilities | Non-owner cannot grant administrator, owner, privileges they lack or remove the owner. Revocation serialized with affected writes. |
| C2-R12 | Transfer ownership/delete/change visibility or other critical setting | Owner confirmation; administrator may submit a bounded proposal | Source permits an authorized administrator; this proposal requires explicit owner authorization for the exact action, not broad implied power. Recovery/legal intervention belongs to independently reviewed identity/safety procedures. |
| C2-R13 | Archive/restore page | Owner or lifecycle-authorized administrator | Restore rechecks current ownership, restrictions and retained data; it never republishes removed revisions or revives old grants/work automatically. |
| C2-R14 | View analytics/configure page Agent | Explicitly authorized owner/administrator | Minimized approved analytics only; advanced analytics is later scope. Agent configuration cannot grant private administrator data, publishing or provider authority. |
| C2-R15 | Follow/unfollow/mute/block/save/manage preferences | Actual account controlling its own edge/preferences | An owner cannot opt people into follows, membership, personal saves or external consent. Moderation restrictions use a different operation. |

The initial owner and current role bindings reference actual page membership. One owner binding is authoritative; any cached owner column must remain transactionally consistent, not a second editable ownership source. Freeze new privileged page activity when ownership is unavailable or restricted; do not silently elect the first administrator. Deactivation/deletion follows the identity continuity path without retaining unwanted ordinary login just to satisfy an owner constraint.

Profile fields have explicit public/member/staff/owner projections: name/category, approved avatar/cover, description, public rules and safe website may be intentionally public; contact information, location, owner identity and member lists need separate intentional exposure. A badge represents only the verified method. Draft/onboarding state and pending role invitations are never public analytics or index input. Reject unsupported taxonomy/category IDs; changes to category policy do not silently expose restricted pages.

## 4. Records and Invariants

Names below are logical additions/refinements to C6-E07, not delivered DDL or mandatory new services. Reconcile source page_followers with the existing page_follows proposal once. Do not store parallel editable copies under both names.

| ID | Record family | Required integrity |
| --- | --- | --- |
| C2-E01 | Page, owner/member/role bindings, settings revision | Typed account/page links; one owner; roles reference an admitted page member; authority and lifecycle revisions protect updates. |
| C2-E02 | Invitation/join/transfer intent | Intended recipient, permitted capabilities, expiry, actor, current version, acceptance/revocation evidence; token possession alone is not admission. |
| C2-E03 | Post, immutable revision, published-revision pointer | Immutable typed parent, actual human author and acting page where applicable; audience and lifecycle separate; publication refers only to a cleared exact revision. |
| C2-E04 | Revision media/topics/mentions/event/link references | Typed same-context references, immutable file/source versions, per-reference audience, server-verified eligibility; private original cannot be made public by a foreign key. |
| C2-E05 | Comment/reply revision and thread controls | Composite parent/post relationship, bounded acyclic ancestry, actual author, status/revision and moderation overlay; no cross-post parent or parent replacement through PATCH. |
| C2-E06 | Reaction/follow edge and command receipt | Unique actor/target/type where applicable; explicit current desired state, version and stable logical command; retry does not duplicate counters or notices. |
| C2-E07 | Share reference and private saved reference | Original ID/version and permitted destination; actor's save membership private and unique; no ungoverned copied private preview. |
| C2-E08 | Review/clearance, restriction, audit/outbox/work references | Reuse owning file/moderation/work services. Immutable input/policy provenance and accepted durable intent; consumer receipts track work beyond outbox publication. |

| ID | Invariant | Enforcement boundary |
| --- | --- | --- |
| C2-K01 | Current actual actor/action/target/parent decides authority. | Every HTTP, tool, worker, replay, export, file and cached representation; payload roles are never grants. |
| C2-K02 | Publicity is intentional and source-compatible. | Explicit exact revision/audience confirmation plus parent/data-subject/media/moderation gates. Private Space content cannot be cross-posted by changing scope fields. |
| C2-K03 | Membership, follow, staff, owner and Agent scopes differ. | Intended admission/history and target-aware action matrix; no hidden grant from an avatar, role name or subscription. |
| C2-K04 | Acceptance is durable and idempotent. | Mutation, command receipt and required audit/outbox/work commit together. Same key/different intent conflicts; unknown response reconciles under current read authority. |
| C2-K05 | Publication and review bind exact revisions. | Concurrent editor/reviewer/publisher changes use preconditions. Clearance cannot be reused for changed media, audience or text. |
| C2-K06 | Restriction and deletion beat stale derived copies. | Serving gates exclude denied original/parent before asynchronous cache/index/notification cleanup; old work cannot republish tombstones. |
| C2-K07 | Child references cannot disclose a denied parent. | Replies, quotes, counts, attachment previews, bookmarks, mentions and notifications recheck origin/version/audience. |
| C2-K08 | Counts represent unique eligible contributions, not authority. | Edge-state transition determines counter/outbox change once; eligibility/withdrawal and repair reconcile authoritative contributions. |
| C2-K09 | No approved Agent draft means automatic publication. | Only current eligible human publication command activates the exact draft; automatic public publishing stays outside source MVP. |
| C2-K10 | Already public copies cannot be universally recalled. | Narrowing/delete blocks new platform-authorized disclosure, with honest browser/CDN/download/provider/backup limits and reviewed retention. |

## 5. Page Lifecycle Workflows

### C2-W01 Create, Onboard and Read a Page

Validate the actual authenticated creator, eligible account, bounded name/description, reviewed category and safe media. Reserve any chosen unique identifier atomically; choose normalization/reserved names/reuse before release, not from display-name equality. Duplicate creation with the same logical intent returns one page and owner membership.

Show the destination and public appearance, intentional field audiences, selected visibility and current page rules before submitting. Commit page, authoritative owner/member/role bindings, versioned rules/consent evidence where required, and durable audit/outbox. New page existence does not publish an unreviewed post or auto-invite contacts. Public profile exposure itself must pass applicable content/media gates; an incomplete profile can remain an owner-only draft.

Onboarding tracks the source checklist: avatar, cover, description, rules, first post, followers, first event, moderators, Agent and privacy review. Optional steps are not mandatory secret collection or external sends. Only source-released controls are enabled. Read endpoints return an allowlisted projection and representation-specific cache validator; public, member and owner responses never share an unqualified cache key. Member/owner existence, errors, previews and counts cannot expose confidential data.

### C2-W02 Admit Members and Change Page Capabilities

Following is an explicit account-owned edge to public content; it is not approval-based membership. Page join requests and invitations use identity's current intended-recipient proof, expiry and acceptance semantics. GET/prefetch never accepts; member creation endpoints cannot bypass consent or expose draft/roster/history before admission. Event-specific access expires under its actual admission grant, not a permanent page role.

Define history/roster audience in C2-D03. New membership cannot reveal previously restricted drafts, conversations, files or personal admin memory. Rejoin establishes a new interval; cached membership and old invitations do not restore prior rights. Membership does not override a selected-user audience exclusion.

Role changes/removals validate actor and target capabilities plus expected page/role version after any lock wait. Use one reviewed serialization protocol for role/lifecycle change and privileged command commit, not only a check before acquiring a lock. Prevent owner removal/self-escalation, last-owner departure and a revoked editor's queued publication. Cancel or fence affected scheduled work and delegations; old sockets/tabs lose denied projections without claiming remote content erasure.

### C2-W03 Transfer, Archive, Restrict and Delete

Transfer is an exact versioned intent from the current owner with required recent authentication and intended eligible successor acceptance. Serialize it with ownership/role changes; exchange the single owner binding atomically with audit/outbox and a stable receipt. Expiry, revocation, blocked/deactivated successor, replay and two simultaneous transfer acceptances must not produce two owners or an ownerless writable page. Former-owner privileges after transfer require explicit selection/review, not automatic retention of every administrator power.

Keep audience, lifecycle and platform/page restrictions independent. Proposed lifecycle is owner-only draft, active, archived, deletion requested and purged; these are candidates, not recovered source enum values. Suspension is an independent write/distribution restriction, not an archive flag an owner can clear. Archive is read-only under continuing audience/safety policy. Restoring it does not restore rejected media, deleted content, revoked membership, expired grants or cancelled schedules.

Deletion confirms impact on posts/comments/media/roles/events/follows/search and any distinct protected evidence. Commit ordinary disclosure/write exclusion and invalidation/work intent before acknowledging acceptance; purge is resumable with explicit status and retention/hold rules. Preserve necessary tombstone/version receipts through replay windows. A page deletion does not delete independent personal originals, a separately owned event or every recipient's copy. Exact child disposition, cancellation notices and data-rights handling must be selected before enabling deletion, not delegated to an accidental database cascade.

## 6. Authoring and Publication Workflows

### C2-W04 Save a Typed Private Draft

Resolve author, acting identity and immutable owning page/profile/event/topic context. Only explicitly supported scope shapes from C6-E07 are accepted; cross-posting is a separate reviewed action, never PATCH of owner/parent IDs. Personal-profile post creation is not permission to post as a page. Persist stable draft identity and bounded revision under current author/editor authority with no public outbox topic, feed, search, notification or analytics input.

Text/image first-MVP support does not automatically include every composition option. Validate allowed tags, mentions, media, typed event/page/poll reference, optional location, alt text and content warning. Use safe maintained text/Markdown/HTML rendering and URL policy; no scripts, unsafe embeds or unrestricted server link-preview fetch. Strip/review metadata and contact/location disclosure. File completion, immutable source verification, scan and derivative clearance remain Chapter 14 work; a client media URL is not proof.

Save/edit uses expected revision and stable logical intent. Replayed offline edits cannot overwrite a newer draft or publish it when a destination changed. Keep conflicted local edits visibly private pending review; no automatic client merge for audience, author, parent or sensitive fields. Authorized page editors may edit page drafts, not another human's unrelated personal draft. Cancellation of upload/draft work has explicit status rather than inventing a published deletion.

### C2-W05 Review, Publish, Schedule and Edit

Publish is a distinct human-authorized command binding page/post, exact revision/content, audience, attachments/references, policy and required clearance. Preview describes who can see it. Validate current account/page/publishing role, parent, limits, block/restriction, mention eligibility, link/media safety and moderation. Approval cannot override a subject's private rights or the prohibition on publicly resharing a private post.

Serialize publication against relevant authority/lifecycle/revision changes. Atomically set the published-revision pointer and current eligibility, record actual human/page actor and required audit/outbox. Public projection uses that immutable revision, not the latest mutable draft row. Multiple publisher/reviewer attempts cannot publish incompatible revisions or produce duplicate first-publication notifications.

A published edit creates a new working revision with its own review. Significant changes include meaning, media, links, audience, sensitivity and event references. C2-D05 selects whether the old eligible revision remains visible during review; an unavailable/withdrawn/unsafe old revision is never kept visible merely to avoid an empty card. Do not expose the new body under the old cleared ID or leak private historic revisions through edit history. Material changes invalidate stale approvals and scheduled intents.

Scheduled publication stores an exact revision, human authorization, time/zone and durable occurrence in Chapter 13. At due time, recheck the current creator/publisher authority, parent, cleared revision and all exclusion gates before the publication commitment. Revocation/cancellation before that boundary wins. An event update or changed draft cannot silently change the approved publication payload or generate another logical effect. Scheduling is not a permanently running Agent timer.

Narrowing audience/withdrawing hides denied fields at serving boundaries before projection cleanup. Existing copies may persist outside current control. Widening an intentionally restricted resource requires a new exact human publication review and compatible source rights; it cannot convert a private Space post to public via shared component reuse. Public shares of private posts remain forbidden.

### C2-W06 Comment, Reply and Moderate Locally

Comment/reply commands derive the human author, actual post and optional same-post parent chain. Check current visible published parent, active account, page rules, comments enabled/limited/locked state and restrictions at commit. Validate depth/size/media and bound ancestor traversal; no cross-post reply, cycle, forged author or client-selected moderation result.

Authors may edit their own comments within the selected window using exact revision/re-review policy. Owners/moderators may hide/remove/pin/lock only within assigned scope, with attributable actions rather than author impersonation. Distinguish delete-for-author intent from page removal and platform restriction. Restoring one local restriction cannot clear another platform or parent restriction. Moderation reason exposure is audience-specific and case evidence stays in Chapter 16.

Parent removal leaves at most an eligible minimal tombstone; visible child text/quotes must not leak the removed original. Independent replies are retained, hidden or removed under an explicit policy, never an accidental unbounded cascade. Thread lock and concurrent comment creation share an effective version/serialization boundary. Disabling new comments is distinct from hiding old ones.

Preserve source ordering intent: pinned, relevant, recent, meaningful engagement. C2-D07 must define exact mode/tie rules and scope of pins; do not reinterpret this list as an already calibrated score. Use deterministic identity tiebreaks and bounded cursor generations with current eligibility. Anti-abuse and quality rules cannot be replaced by raw like counts; a moderation change may yield fewer items instead of disclosing excluded comments.

## 7. Social Interaction Workflows

### C2-W07 React and Follow Without Duplicate Effects

Accept explicit add/remove or desired-state commands on the actual actor/target and permitted reaction type; default first-MVP like versus later multi-reactions follows release selection. A unique actor/post/type edge enforces the source rule. Follow similarly has one actor/page edge and never creates page membership.

Serialize edge transitions or enforce equivalent conditional writes. Only a real inactive-to-active or active-to-inactive change creates the corresponding counter/outbox contribution; duplicated removes cannot decrement twice or make negative counts. Preserve a stable command receipt so add-remove-delayed-retry(add) cannot resurrect the old intent. A genuinely new command from a stale tab requires the selected edge version/order policy, not a retry toggle. Counts are repairable projections of eligible contributions, never authorization.

Apply current deleted/archived/blocked/account/page policy before new interactions. Whether existing follow edges remain dormant or are revoked by block is a C2-D03 decision; unblocking cannot silently regrant private audience/history or external notifications. Unlike/unfollow, media withdrawal and replay repair cannot emit duplicate notices or count restricted content as public trend evidence. Third parties never receive an unrestricted list of people who saved a post.

### C2-W08 Share, Save and Apply Personal Controls

Public reshare retains an eligible public original reference and separately reviewed commentary. Private/group/DM shares authorize the destination and original content without making that destination public. Copy/external links point only to a permitted projection and never contain access tokens, private IDs-as-capabilities or sensitive preview text. External copy/download recipients can retain material; deletion is not universal recall. A private post cannot be made public by extracting its quote, attachment or thumbnail into a share wrapper.

Revalidate original and destination on read/replay/preview, including ancestors, files and current restrictions. If no longer eligible, return a safe unavailable reference rather than cached title/body/media. Model-generated summaries are still derived source data, not automatic anonymization or independent public content. Independently authored commentary needs its own review and cannot disguise an unauthorized copy.

Save/unsave/search-saved belong to the saving account, with idempotent unique references and current original permission. A save is not a permanent entitlement, public signal consent or unrestricted offline archive. Search filters private saved references before ranking; unavailable original metadata is not revealed to a removed account. Collections remain later scope. Deletion of a saved reference does not delete the original post.

Mute hides chosen feed/notification surfaces; block prevents the selected interactions; hide recommendation is ranking feedback; notification preferences control a defined category/resource; platform restrictions are separately enforced. Each operation states its scope, pending/canonical outcome and undo behavior. None removes a page membership or opts into model personalization by accident.

## 8. Domain Integrations and Distribution

### C2-W09 Connect Public Events and Page Agent Drafts

Create/link events through Chapter 17 with current page organizer authority, source media and selected public field audiences. Public description/announcements do not publish organizer chat, budget, documents, exact location, contact details or roster. RSVP never admits a Space member or establishes physical attendance; the source six-label mapping stays under the event owner and COV-G03 in the index.

Page Agent retrieval uses only currently approved public page description/posts/events/FAQs/rules/announcements. Exclude private admin conversations, unpublished drafts as public-answer sources, personal admin memory, private documents/member data and analytics. An authorized private editor may request a private drafting task using separately authorized material, but its output retains source classification and still cannot be published automatically. The model must not silently turn private drafting context into public question-answering context.

Agent-suggested post/event/FAQ/schedule is a draft with attributed provenance. No autonomous publish, delete-comment, ban, owner change, unsupported factual claim or external send. A human publication command still binds actual content/revision and data rights; approving an Agent run or enabling its page configuration is not blanket future publication approval.

### C2-W10 Project, Notify, Restrict and Recover

Domain mutation commits revisioned durable outbox/audit/work intent; search/feed/media/notification/Agent context are downstream projections, not publication authorities. Project by aggregate revision/generation with stable logical effect identity; delayed edits cannot beat a newer exclusion/tombstone. Broker PUBLISHED is not completed downstream work. Reconcile failed/missing consumer progress with bounded retries and fences.

All ten source notification triggers are preserved: followed-page post, comment reply, mention, reaction, page announcement, event update, RSVP change, moderator action, optional follow request and page role change. Route to Chapter 20 with source revision/occurrence, actual recipient, purpose, category and minimum permitted template variables. Fanout rechecks current recipients/source authority, block/mute/preferences, endpoint/consent and dispatch commitment; a list captured during publication is not permanent authority. Do not notify repeatedly on edit/replay or broaden a static approved recipient set without review.

Retain six preference groups: per-page, per-event, comment, mention, digest frequency and push/email. Digest defaults, event names and cutoff/window identity require reviewed schema; do not collect hidden content into a public digest. Read/dismiss is not domain acknowledgment. Withdrawing a post cannot recall an already committed external send; render honest source unavailability and reconcile in-flight effects.

Report page/post/comment/account through Chapter 16; page membership never grants private report evidence or reporter identity. Block enforcement, cache invalidation and restriction checking apply across direct reads, search, feeds, saved/share previews, image proxies, OG metadata, sitemaps, SSE/WS, exports, notifications and restored clients. Restoring backup in isolation must reapply current exclusions/deletions before fanout or scheduling. Logs use permitted IDs/reasons/counts, not raw drafts, contact values or private evidence.

## 9. API and Client Handoff

Source paths remain exactly those in index COV2-P01 through COV2-P36; do not duplicate or silently normalize them here. The proposed `/v1` prefix, HTTP envelope, validators, stable idempotency, exact sequence types and cursor/reset semantics are owned by Chapter 7 and existing ADRs. Additional operations below are behavioral requirements whose exact method/path/schema must be reviewed before generation.

| ID | Operation family and source index IDs | Required request/result and failure contract |
| --- | --- | --- |
| C2-P01 | Page create/read/profile/delete: COV2-P01 through COV2-P04 | Allowlisted typed profile/audience, current human actor, expected revision and logical key. Return permitted draft/published/archive/deletion-job state, not purge-complete on acceptance. Transfer/archive/restore/critical-setting proposals require distinct reviewed operations. |
| C2-P02 | Page members/follow: COV2-P07 through COV2-P12 | Own follow edge versus intended admission and target-aware role operations. Member lists are filtered; POST members cannot grant arbitrary owner/admin or bypass acceptance. Join/invite/revoke/leave/transfer accept/decline need explicit schemas. |
| C2-P03 | Post create/list/read/edit/delete: COV2-P05/COV2-P06/COV2-P13 through COV2-P16 | Immutable typed parent, acting identity, working/published revision, bounded content/reference manifest. Draft save, submit, human publish, schedule/cancel and withdraw are explicit operations, not writable status flags. |
| C2-P04 | Comments/reactions: COV2-P17 through COV2-P20 | Same-post parent and actual actor; versioned own edit/remove, scoped moderation/pin/lock and stable add/remove edge semantics. Collection DELETE cannot delete everybody's reactions. Missing comment commands are not implied by GET/POST. |
| C2-P05 | Report/save/share: COV2-P21 through COV2-P23 | Report receipt from owning safety service; private save/un-save and current-authorized saved listing/search. Source has no dedicated share routes: define permitted reference creation/read/removal separately from external/native sharing UI. |
| C2-P06 | Discovery: COV2-P24 through COV2-P29 | Reconcile /feed versus /feeds and public versus scoped search with Chapter 15; no parallel ranking service or private-context fallback. |
| C2-P07 | Events: COV2-P30 through COV2-P36 | Chapter 17 owns event revision, public projections, RSVP/admission/capacity and attendee view; Chapter 13/20 own affected schedules/notifications. |
| C2-P08 | Personal controls, publication status and recovery | Reviewed mute/block/hide/preference, exact revision/clearance status and command-outcome lookup; current actor before replaying receipts. No raw private moderation/audit or upload/provider secrets in responses. |

Authorize before idempotency-receipt disclosure and representation validators. Missing/stale preconditions, invalid schema/parent, denied action, unavailable original, expired approval, pending media/review and unknown outcome are distinct typed meanings under Chapter 7; choose canonical status codes there, not one guessed code per client. Resource discovery must not leak via different private errors. Reject mass-assignment fields; all cookie mutations use web Origin/CSRF protection and no ordinary GET triggers a change.

Android/core web flows expose current page identity/audience, private draft, uploading/scanning/review/published/deferred/failed states, accessible errors and conflict recovery. A submit button does not announce publication on a local optimistic update. Composer/role/ownership flows retain the exact reviewed destination/revision across navigation; stale tabs, logout, switched account and revoked role clear protected state and cannot auto-submit an old public action. Safe ordinary local drafts remain recoverable under the client retention policy.

Page screens retain source header/information/tabs/onboarding and role-appropriate management. Post detail retains replies, reaction, share/save/report and author/page navigation. Owner/member views do not reuse public SSR/Room/query caches without actual audience/account binding. Public real media uses approved derivatives with stable dimensions and accessible alt text; no unauthorized image proxy to fill a placeholder. Native/browser validation, accessibility and responsive rendering are required future evidence, not results of this document.

## 10. Verification and Acceptance Trace

All checks below are proposed and NOT RUN. They need actual selected database/service/worker/client fixtures, controlled clocks, parallel operations, request/actor traces and observable durable outcomes. A static matrix or scripted boolean fixture is not authorization, concurrency, media or UI acceptance.

| ID | Focused check and failure boundary | Source acceptance in index |
| --- | --- | --- |
| C2-V01 | Duplicate/concurrent page creation produces one page/owner; invalid taxonomy/profile fields and forged owner/badge rejected. | COV2-A01 |
| C2-V02 | Every matrix role/action/target allowed and denied case, role combinations, stale editor and restricted account; no personal draft or admin evidence leak. | COV2-A02, COV2-A03, COV2-A04 |
| C2-V03 | Intended admission, follow versus member rights, hidden roster, join/leave/rejoin/history and replayed invitation; no owner loss on removal. | COV2-A02, COV2-A03 |
| C2-V04 | Two concurrent ownership transfers, stale successor acceptance, self-escalation, owner deletion/deactivation and admin takeover attempts preserve the approved continuity policy. | COV2-A02, COV2-A05 |
| C2-V05 | Archive/suspend/delete wins against post creation/publication; partial purge resumes; restore/replay cannot revive revoked memberships, deleted revisions or cancelled schedules. | COV2-A04, COV2-A05, COV2-A06 |
| C2-V06 | Draft CRUD and account/page attribution stay private through feed/search/analytics/SSR/deep links/caches and restored offline composer. | COV2-A07, COV2-A08, COV2-A10 |
| C2-V07 | Human exact-revision publication versus concurrent editor/reviewer, changed audience/reference and revoked role; no unreviewed content under old published pointer. | COV2-A07, COV2-A09, COV2-A12, COV2-A25 |
| C2-V08 | File replacement/scan failure, unsafe HTML/link preview, private mention/reference and forbidden derivative access; exact immutable media clearance required. | COV2-A11, COV2-A12 |
| C2-V09 | Scheduled publish versus cancel/revoke/delete/draft edit at commitment; duplicate occurrence/recovery does not publish twice. | COV2-A04, COV2-A07, COV2-A12 |
| C2-V10 | Cross-post parent, cycle/depth limits, locked-thread race, forged comment author, significant edit and independent moderator/author actions; parent removal hides restricted quotes. | COV2-A03, COV2-A09, COV2-A31, COV2-A32 |
| C2-V11 | Stable pinned/ranked/recent pages under inserts/hides/restrictions; no hidden-entry count leak or raw-engagement-only amplification. | COV2-A14, COV2-A15 |
| C2-V12 | Concurrent and replayed reaction/follow add/remove, changed payload, add-remove-delayed retry and contribution repair; no double increment/decrement or unauthorized follower access. | COV2-A14, COV2-A17, COV2-A31 |
| C2-V13 | Public reshare/private/DM/link/external variants deny private source copying and current revoked originals, including cached thumbnails and Agent summaries. | COV2-A10, COV2-A11, COV2-A21 |
| C2-V14 | Private save/search/unsave controls exclude other users, revoked originals and unintended public personalization; deleted save does not delete original. | COV2-A03, COV2-A10, COV2-A13 |
| C2-V15 | Outbox crash/replay/tombstone order, warmed index/feed/cache/OG/media projections and bounded cursor recovery under visibility/block changes. | COV2-A06, COV2-A10, COV2-A13, COV2-A14, COV2-A15, COV2-A16 |
| C2-V16 | Hide/mute/block and six notification preference groups affect actual permitted recipients; ten source triggers deduplicate and redact. Delay/revoke before dispatch and reconcile in-flight sends. | COV2-A17, COV2-A22, COV2-A31 |
| C2-V17 | Public event create/edit/cancel, selected RSVP/capacity/attendance semantics, restricted location/roster/contact and private organizer linkage using owning event tests. | COV2-A18, COV2-A19, COV2-A20, COV2-A21, COV2-A22 |
| C2-V18 | Public Agent answer context excludes admin drafts/memory/documents; attributed draft needs human publish, actions audited and prohibited tools denied despite generic approval. | COV2-A23, COV2-A24, COV2-A25, COV2-A26, COV2-A27 |
| C2-V19 | Typed page/post/comment/account reports, authorized independent review/appeal, no reporter exposure, and local restoration cannot clear an independent restriction. | COV2-A28, COV2-A29, COV2-A30, COV2-A32 |
| C2-V20 | Real transport schemas/preconditions/idempotency/error projections, browser CSRF and account-switched Android/web pending/conflict/deep-link/accessibility flows. | COV2-A01 through COV2-A32 for the released slice |

## 11. Developer Handoff and Evidence Boundary

| ID | Accountable review role | Prerequisites | Bounded deliverable |
| --- | --- | --- | --- |
| C2-T01 | Product/community lead with Identity, Security and Data-rights | Existing release/ADR outcomes for this scope | Review C2-D01 through C2-D12, role matrix, source coverage and named independent reviewers. Do not mark accepted from continued drafting. |
| C2-T02 | Community/backend lead | C2-T01 | Reviewed page/member/owner/revision/edge constraints and transaction boundaries using C6-E07; implement only when separately authorized. C2-V01 through C2-V05, C2-V12. |
| C2-T03 | Community/media/moderation leads | C2-T01, C2-T02 | Draft/publish/scheduled-edit/comment/share/save behavior with existing file/scheduler/safety services; explicit retention and restoration rules. C2-V06 through C2-V14. |
| C2-T04 | API/client leads | C2-T01; agreed domain shapes from C2-T02/C2-T03 | Reconcile the 36 source routes and C2-P01 through C2-P08 additions into one reviewed schema. Android/web public and privileged projections with pending/conflict states. C2-V20. |
| C2-T05 | Discovery/event/notification/Agent leads | C2-T01; owning-domain release gates; C2-T03/C2-T04 for integration | Implement no duplicate domain service; current eligibility, public event fields, human publication and bounded durable fanout. C2-V15 through C2-V19. |
| C2-T06 | QA/security/operations leads | C2-T02 through C2-T05 for released implementation | Execute real authorized positive/negative/concurrency/recovery/client evidence; record exact versions, failures and untested gates. No production-readiness verdict from planning checks. |

COV-G01/COV-G02 in the index now have a cohesive draft and testable handoff, not accepted policy or runtime closure. COV-G03/COV-G04 carry event and API choices to their existing owners. Named capacity, actual approvals, canonical schema publication and implementation remain outstanding. No source requirement, alternate contract or existing ADR was deleted to accelerate this draft.