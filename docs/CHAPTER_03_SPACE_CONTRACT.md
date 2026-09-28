# Chapter 3: Private Space Policies, Membership and Access Contract

Status: DRAFT FOR PRODUCT AND SECURITY REVIEW. This is a planning contract, not implemented authorization or approved resolution of every product choice.

## 1. Scope and Source Authority

This continues the [Chapter 1 release plan](CHAPTER_01_RELEASE_PLAN.md) and [Chapter 18 identity contract](CHAPTER_18_IDENTITY_CONTRACT.md). It refines C1-J03 private membership, C1-J04 conversations, C1-J05 planning and C1-T04 Space policy. C18-W05 admission, C18-W07 roles and C18-D03 recipient confirmation remain linked proposals, not newly approved behavior.

- [Chapter 3](../Chapter3.md) is the owning source for private family, couple, solo, custom and temporary-event Spaces. Public participation stays a separate Page contract; shared infrastructure does not make a private Space publicly discoverable.
- Family is the first delivery slice. Couple, solo and custom remain in the proposed full MVP; temporary-event behavior is retained in the wider product without silently changing release priority.
- Original chapters and earlier planning drafts remain unchanged. Continuing planning does not authorize coding, real invitations, sensitive data use, deployment or paid providers.
- The source ends at [3.27.1 Android Feature Modules](../Chapter3.md#L2066) without a module list or final acceptance section. New UI, transaction and test details in this document are explicitly design proposals, not invented source text.
- All product tests and implementation evidence are NOT RUN. Source coverage checks validate the draft's traceability, not runtime privacy, reliability or production readiness.

## 2. Exact Source Guarantees

All ten guarantees in [section 3.1](../Chapter3.md#L3) are retained verbatim. Application permissions must make these enforceable rather than leave them as Agent prompt instructions.

| ID | Source guarantee |
| --- | --- |
| C3-R01 | Private content is not publicly discoverable. |
| C3-R02 | Membership is explicit. |
| C3-R03 | Every action is authorized against the current membership state. |
| C3-R04 | Group agents only access approved data. |
| C3-R05 | Personal information is not automatically shared with other members. |
| C3-R06 | Leaving or removing a member immediately changes access. |
| C3-R07 | Messages and tasks remain durable even if realtime delivery fails. |
| C3-R08 | Sensitive actions require explicit approval. |
| C3-R09 | Public and private data use separate authorization paths. |
| C3-R10 | Privacy rules are enforced by the backend, not only by the mobile UI. |

## 3. Source Topic Coverage

All 27 numbered topics are retained with their exact source titles. This index records coverage; it does not imply the incomplete source provides finished schemas, every transition or executable tests.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C3-S01 | Purpose | [3.1](../Chapter3.md#L3) |
| C3-S02 | Private Space Types | [3.2](../Chapter3.md#L29) |
| C3-S03 | Space Lifecycle | [3.3](../Chapter3.md#L267) |
| C3-S04 | Generic Space Data Model | [3.4](../Chapter3.md#L398) |
| C3-S05 | Space Policy Model | [3.5](../Chapter3.md#L463) |
| C3-S06 | Membership Architecture | [3.6](../Chapter3.md#L508) |
| C3-S07 | Role Permissions | [3.7](../Chapter3.md#L564) |
| C3-S08 | Membership Rules by Space Type | [3.8](../Chapter3.md#L700) |
| C3-S09 | Invitation Architecture | [3.9](../Chapter3.md#L784) |
| C3-S10 | Contact-Based Invitations | [3.10](../Chapter3.md#L868) |
| C3-S11 | Joining a Private Space | [3.11](../Chapter3.md#L911) |
| C3-S12 | Private Content Model | [3.12](../Chapter3.md#L987) |
| C3-S13 | Private Conversations | [3.13](../Chapter3.md#L1088) |
| C3-S14 | Private Messaging Architecture | [3.14](../Chapter3.md#L1139) |
| C3-S15 | Realtime Private Messaging | [3.15](../Chapter3.md#L1229) |
| C3-S16 | Shared Tasks | [3.16](../Chapter3.md#L1275) |
| C3-S17 | Shared Events | [3.17](../Chapter3.md#L1344) |
| C3-S18 | Reminders and Notifications | [3.18](../Chapter3.md#L1420) |
| C3-S19 | Health-Related Private Data | [3.19](../Chapter3.md#L1497) |
| C3-S20 | Private Agent Architecture | [3.20](../Chapter3.md#L1572) |
| C3-S21 | Agent Memory Isolation | [3.21](../Chapter3.md#L1630) |
| C3-S22 | Agent Action Approval | [3.22](../Chapter3.md#L1698) |
| C3-S23 | Family Admin Escalation | [3.23](../Chapter3.md#L1784) |
| C3-S24 | Files and Media | [3.24](../Chapter3.md#L1837) |
| C3-S25 | Private Space API Design | [3.25](../Chapter3.md#L1900) |
| C3-S26 | Authorization Middleware | [3.26](../Chapter3.md#L1984) |
| C3-S27 | Android Architecture | [3.27](../Chapter3.md#L2042) |

## 4. Space Types and Human Membership

The source type values in [3.4.1](../Chapter3.md#L420) are preserved. A type supplies defaults and constraints, not separate duplicated identity, messaging, scheduling or Agent implementations.

| ID | Source type | Human membership contract | Important boundary |
| --- | --- | --- | --- |
| C3-Y01 | FAMILY | Flexible membership subject to reviewed policy, explicit invitation/acceptance and capacity controls. | Family admin does not own each member's personal data or consent. |
| C3-Y02 | COUPLE | At most two active human members; a shared Agent and approved integrations are not additional humans. | A third human cannot bypass the limit by being labeled guest, observer, Agent or service. Private partner data stays separately authorized. |
| C3-Y03 | SOLO | Exactly one active human member in an active solo Space. | Adding another human requires explicit conversion with policy, membership and Agent-permission migration; no silent promotion into a group. |
| C3-Y04 | CUSTOM | Flexible membership, roles and guest/history/export policies within platform limits. | Custom policy cannot relax platform privacy, safety, legal or identity constraints. |
| C3-Y05 | TEMPORARY_EVENT | Explicit membership and time/expiry policy; automatic read-only/archive is possible. | Archive is not physical deletion. Temporary guests and background work must respect the effective expiry even if a cleanup worker is late. |

The source's count-then-reject example is not a complete concurrent admission algorithm. Account type is server-defined; every human with active membership counts regardless of role. Final admission, reactivation and type conversion need shared resource-level serialization and database invariants.

The source lists OWNER, ADMIN, MODERATOR, MEMBER, GUEST, OBSERVER and AGENT roles. Human role assignment and Agent/service identity must be distinct; the AGENT label is not a way to exempt a real person from human-member limits or give automation unrestricted data access.

## 5. Decisions Requiring Confirmation

All choices below are OPEN or PROPOSED. They do not silently approve the unresolved Chapter 1 or Chapter 18 decisions.

| ID | Choice | Recommendation or unresolved contract | Status |
| --- | --- | --- | --- |
| C3-D01 | Private Space versus public Page | Keep private Spaces non-discoverable. Separate audience, joining mechanism and lifecycle instead of treating PRIVATE, INVITE_ONLY, MEMBERS_ONLY and deletion states as interchangeable visibility values. Reconcile Chapter 6's public Space example before schema design. | PROPOSED |
| C3-D02 | Canonical lifecycle and membership states | Keep invitations, memberships, delivery telemetry, user notification mute and moderation restrictions separate. The source MUTED example blocks posting, so split that behavior explicitly rather than copying an ambiguous enum. | PROPOSED |
| C3-D03 | Owner, admin and moderator hierarchy | Use one current human owner; only the owner manages admins/security policies and ownership. Admins manage approved lower roles but not peer admins/owner or private member data. Define target-aware role changes and non-escalating policy edits. | PROPOSED |
| C3-D04 | Couple activation, separation and replacement | Decide pending activation, departure behavior and whether replacement is permitted. Recommend no automatic replacement access to previous shared history; a replacement, if allowed, is a new reviewed admission, not reusing the former partner's identity. | OPEN |
| C3-D05 | History and newly admitted members | Default to content visible from the current admission onward, with explicit resource-specific historical grants. Define task/event/notification visibility as well as messages; an old record edited today must not silently become newly visible. | PROPOSED |
| C3-D06 | Leave, removal, suspension and rejoining | Define owner continuity, active bans/restrictions, rejoin approval and old history access. Recommend new admission epochs and no reactivation through old accepted invitations; block effects in shared groups require a specific matrix. | OPEN |
| C3-D07 | Guests, effective expiry and scheduled work | Set permitted guest roles, directory/history/file access, expiry, temporary-Space lifecycle and what happens to pending reminders, approvals and assignments. Worker delays cannot extend authorization. | OPEN |
| C3-D08 | Space-type conversion | Require preview, explicit confirmation, versioned policy/membership migration and audit; sharing existing private content is a separate decision. Solo conversion is not bulk consent to reveal all existing personal data. | PROPOSED |
| C3-D09 | Archive, deletion, export and retention | Define archive-read policy, deletion grace/cancellation, ownership loss, legal holds, derived-data purge and disclosed backup expiry. An export setting never authorizes all members' private content. | OPEN |
| C3-D10 | Content ownership, care data and Agent limits | Resolve OWNER_ONLY and PRIVATE_TO_OWNER to the explicit data owner, not automatically the Space owner. Preserve resource/recipient consent and scoped Agent authority. Admin status and approval cannot authorize clinical decisions or Chapter 1's prohibited MVP Agent actions. | PROPOSED |
| C3-D11 | API, events and data ownership | Reconcile Chapter 3 Space routes with Chapter 18 generic-resource routes, canonical states, action names, error envelopes, idempotency and revocation boundaries in Chapters 6/7. Avoid two independent membership implementations. | OPEN |
| C3-D12 | Policy values and changing defaults | Select capacity limits, guest/approval/history/retention defaults and policy-change effects with explicit risk review. JSON examples and suggested history windows are not approved settings. | OPEN |
| C3-D13 | Incomplete source and screen/test additions | Use proposed screen/state and acceptance designs to fill planning gaps, clearly labeled as additions. Do not claim the source includes the missing Android feature modules or a finished acceptance list. | OPEN |

The contract below proposes target-aware permissions, lifecycle/admission workflows and implementation handoffs. It does not authorize implementing unresolved choices.

## 6. Effective Permissions and Data Audiences

Authorization is an intersection, not a choice of whichever rule is most permissive:

`authenticated actor + current account status + Space lifecycle + current membership + permitted role/action + target relationship + object/conversation audience + history window + consent + restrictions + valid delegation/approval when required`

An owner role cannot bypass another person's private-object rule. Current membership must be evaluated on HTTP, WebSocket subscription and event delivery/replay, file access, search, export, Agent context/tool use and delayed jobs. IDs supplied by clients or an LLM identify a requested object; they never prove access to it. An unavailable authorization dependency is not permission to serve a stale private response.

### Proposed Role Matrix

This is the C3-D03 proposal derived from the source roles, not a replacement for product approval. All cells remain conditional on the intersection above. A role is not blanket data access; a private conversation still requires its own membership and history permission.

| Action | Owner | Admin | Moderator | Member | Guest / observer |
| --- | --- | --- | --- | --- | --- |
| Read content | Only authorized content. | Only authorized content. | Only assigned/authorized content. | Only authorized content. | Only specifically permitted content; observer is read-only. |
| Send/create content | Allowed by capability and lifecycle. | Allowed by capability and lifecycle. | Allowed by capability and lifecycle. | Allowed by Space policy and capability. | Guest only when explicitly enabled; observer cannot create content. |
| Issue invitations | Within admission policy and grantable roles. | Within approved policy; no owner/admin grants. | No default grant; explicit lower-role invitation capability only. | Only if enabled, with a restricted proposed role. | No default invitation power. |
| Change human roles | Manage admins and lower roles; ownership uses a separate transfer. | Manage approved lower roles, not peer admins/owner or self-promotion. | No default role management. | No role management. | No role management. |
| Remove/restrict people | Current-policy eligible targets, not an ownerless self-removal. | Approved lower-role targets only, not peer admins/owner. | Scoped content restrictions if delegated; no default membership removal. | Self-leave, subject to owner continuity when relevant. | Self-leave/revoke participation; expiry applies independently. |
| Moderate shared content | Only within authorized moderation scope. | Only within authorized moderation scope. | Assigned moderation scope, audited. | Report permitted content; no general moderation powers. | Report permitted content; no general moderation powers. |
| Change policy/integrations | Reviewed settings, required step-up/consent and audit; no override of platform rules. | Only allowlisted non-security settings expressly delegated. | No security-policy changes. | Own preferences only. | Own preferences only. |
| Archive/delete/restore | Separate confirmed lifecycle operations and retention rules. | No default Space deletion or restoration power. | No Space deletion or restoration power. | No Space deletion or restoration power. | No Space deletion or restoration power. |
| Transfer ownership | Current-owner step-up plus eligible recipient acceptance and atomic commit. | Cannot independently transfer. | Cannot transfer. | May accept an eligible owner-initiated transfer. | Must become eligible before any reviewed transfer. |
| Export | Permitted resource-specific data only; never all members' private data. | Explicit permitted export scope only. | No blanket export. | Own/authorized data if policy permits. | Only specifically permitted data. |

The platform's support or safety roles are separate, case-scoped and audited. They do not enter a private Space through an invisible owner override. A human cannot be converted to an Agent identity by changing a membership role; Agent powers require current human authority plus explicit delegation.

### Audience Interpretation

| Source label | Contract interpretation requiring canonicalization | Boundary |
| --- | --- | --- |
| SPACE_SHARED / MEMBERS_ONLY | A defined audience of current eligible Space members, further narrowed by conversation, object and history rules. | Neither means public, every past member, all chat history or every private field. Resolve overlap in Chapter 6 instead of implementing inconsistent synonyms. |
| ROLE_RESTRICTED | Explicit permitted roles/actions evaluated against current assignments. | A role change can revoke access; a role name in an old token cannot retain it. |
| OWNER_ONLY / PRIVATE_TO_OWNER | Proposed explicit resource owner or data subject, not an inferred Space administrator. | The source uses both labels for private/medical records; resolve data owner versus controller and grants before schema generation. |
| PRIVATE_TO_AUTHOR | Private to the permitted author context and explicitly approved delegates. | Placing the record in a Space does not share it with members or a new Space owner. |
| AGENT_ONLY | A controlled processing audience with provenance, purpose and authorized human control. | Not every Agent, not a secrecy bypass for operators, and not a way to evade user deletion/access rights. |

New data and referenced artifacts inherit no wider audience than their authorized purpose. Shared task descriptions cannot leak a private document through a preview; event title visibility does not imply location/guest-list visibility. A private-to-public publication is a separate authorized Page operation with explicit content and attachment review, not toggling a Space into public discovery.

## 7. Lifecycle, Membership and History

The source lifecycle diagram lists states but does not define every allowed transition. The following is a proposed action policy; exact state transitions and error contracts remain C3-D02/C3-D09 decisions.

| Space condition | Permitted behavior | Background and access boundary |
| --- | --- | --- |
| DRAFT | Owner-bound creation work and explicit discard. | No ordinary group content, unreviewed invitations or recipient notifications. |
| PENDING_ACTIVATION | Required identity/admission/owner confirmations and minimal authorized review. | Pending invitees cannot read messages/files/member directories; pending membership is not active. |
| ACTIVE | Current-authorized actions permitted by type, object and policies. | Re-evaluate at each delayed execution and recipient dispatch. |
| LOCKED | Only separately authorized recovery, safety and data-rights operations. | Normal reads/writes and new private delivery are blocked; caches do not bypass the lock. |
| READ_ONLY | Authorized historical/current reads within the viewer's history/audience limits. | No new shared content, automatic Agent writes or ordinary reminder dispatch. Security revocation, preferences, self-leave and data-rights routes require explicitly separated handling. |
| ARCHIVED | Approved historical access and lifecycle/export operations. | No automatic new admission, shared writes or revived scheduled work. Archive does not broaden history or consent. |
| DELETION_PENDING | Confirmed deletion workflow and narrowly scoped recovery/export/cancellation if policy permits. | Stop new ordinary protected actions and jobs as defined at request time; grace does not automatically preserve write access. |
| DELETED | Minimal tombstone and authorized retained audit/legal records. | No normal content access. Physical purge and backup expiry have distinct, honestly reported stages. |

Restore is an explicit versioned transition after authority, retention and current policy checks. It must not silently restore expired invitations, former members, cancelled reminders, revoked grants, consumed approvals or old external delivery permissions. Retention deadlines and active holds are evaluated independently of UI state.

### Membership Epochs

Proposed canonical design: a stable account/Space relationship has versioned admission periods. Each admitted period records its start, end, status, role changes, conversation joins and history grants. Keep notification mute/preferences separate from whether membership is active. Moderation-enforced write restrictions are separate from a user's decision not to receive notifications.

A new invite, join request or relationship request cannot erase an active suspension, ban or removal restriction. A rejoin is an explicitly approved new admission, not clearing timestamps on an old row or replaying its invitation. Read-only participants must still be able to decline invitations, withdraw consent and request lawful data rights; a ban does not justify silently losing those rights.

Suspending a couple member must not inadvertently free a reusable slot and later reactivate three humans. Decide whether a suspended place remains reserved and serialize admission/reactivation against that decision. ACTIVE couple and solo invariants must hold on every activation, type conversion, recovery and restore, not just the first invitation acceptance.

### History Contract

The source default is no automatic access to all old content. Proposed C3-D05 uses the current admission and conversation-join boundaries plus resource-specific historical grants. Compute effective access from current authorization, the permitted audience of the exact record/version, and the approved history window.

- A new member sees only eligible content from their authorized period, unless a specific historical grant applies. An administrator's full-history setting cannot override an author's private audience, medical consent or a restricted sub-conversation.
- Editing, pinning, quoting, forwarding, assigning, summarizing or reindexing an old record does not automatically make its private body or attachments new content visible to an entrant. A deliberate share of an older task/event requires authority and a preview of the exact data being shared.
- Apply the same boundary to message counts, unread badges, previews, full-text/vector search, notifications, calendar views, files/citations, exports and Agent summaries. Omitting a message body while revealing its private title or participants is still a disclosure.
- Keep read cursors per conversation and admitted viewer context. A Space-level `last_read_message_id` example is not a sufficient global ordering/history authority across multiple conversations. Hidden or forbidden items must not be disclosed by gap repair or receipt metadata.
- On rejoin, do not automatically restore the prior epoch's conversation membership, cryptographic keys, private files or consent. E2E keys and history restoration require the Chapter 19 contract; backend authorization alone does not distribute or revoke cryptographic access already granted.
- Retained content after someone leaves is governed by source ownership, deletion requests and lawful retention. Membership removal is not immediate destruction of all their authored messages or erasure from recipients' devices.

## 8. Space Workflows

All workflows are proposed refinements of the source guarantees. They are not new release approvals. Chapter 18 still controls identity proof, session/recipient binding and recovery; this chapter controls Space-local membership and content policy.

### C3-W01 Create and Activate a Space

Authenticate the creator, enforce account/type/region/abuse eligibility, validate a narrow name/description/type payload and derive owner identity server-side. Create the Space, policy snapshot/version, owner relationship and required audit/outbox intent atomically; an idempotent retry cannot create a second owned Space. Reject client fields attempting to set arbitrary ownership, active members, security policy or privileged Agent tools.

Family, solo, custom and temporary types activate only when their reviewed prerequisites hold. A couple may remain pending until its required second participant accepts, under C3-D04; the source does not authorize inventing a third person or auto-confirming the partner. For an active solo Space there is one eligible human owner. Do not provision unrelated chat/files/provider accounts or dangerous Agent permissions just because a Space record exists.

A default shared conversation, when the messaging milestone is implemented, requires explicit admitted participant enrollment and its own policy. A private personal or Agent conversation is not automatically the shared conversation. Creation remains a domain service, not five copied services or a new LLM process per Space.

### C3-W02 Invite, Prove Recipient and Admit

Use C18-W05 and the still-proposed C18-D03 intended-recipient/organizer-confirmation policy. The inviter needs current permission for the Space and the specific role offered; only approved external invitation channels may dispatch. Phone contacts and relationship labels remain private and minimized, with purpose/retention controls. External previews reveal no sensitive Space, health or relationship details.

Preserve the source's random unguessable token, protected digest, expiry, single-use, authenticated acceptance, revoked-token denial, rate limiting and anti-enumeration rules. Show the Space name and inviter only after the identity-bound preview checks, never through an unauthenticated crawler. A token-bearing GET cannot consume admission. A forwarded link or verified new phone holder alone is not necessarily the intended family member.

Final admission must serialize current Space/policy/capacity, invitation state, recipient identity binding, inviter authority, required approvals and eligibility. Commit admission epoch, invited role, invitation consumption, approved conversation grants, audit and event intent together. Database uniqueness plus resource-level serialization protects concurrent different invitations for the last couple slot. A token lock alone or checking a cached member count is insufficient.

Retries by the same authorized actor return a current safe result; a stale accepted invitation must not reactivate a person who subsequently left or was removed. Decline, expiry, recipient mismatch, inviter demotion, changed grantable role, duplicate request or concurrent revoke must have explicit losing outcomes without revealing private payloads. Delivery status such as SENT/OPENED is separate from invitation validity and membership acceptance.

### C3-W03 Join Requests, Guests and Human Limits

When a private Space supports requests, give an intended requester only a generic entry and the minimum authorized review surface. Request approval is a policy action, not public discovery. QR/link/organization/verified-relationship entry points all converge on the same identity and admission rules, and relationships never confer automatic membership.

Owner/admin reviewers must currently have authority, and a request approved under an old policy is rechecked when admission commits. Guest and observer human identities count toward the couple maximum. Expiring guest access uses server time and effective policy on every access; a delayed cleanup worker cannot extend it. Directory, history, file, invitation and sensitive-Agent rights are independently limited.

Join-request states, invitation states and actual membership states remain separate. Refusing a new request must not destroy an existing membership, and a changed role proposal cannot skip intended-recipient confirmation. User-facing limits, pending request retention and abuse thresholds need approved values under C3-D07/C3-D12.

### C3-W04 Change Roles, Policies and Ownership

Use target-aware checks: actor/current role, target/current role, proposed change, current object scope, policy version and required recent authentication/approval. Under proposed C3-D03, an admin cannot grant admin/owner, remove peer admins, demote the owner or promote themselves. Content moderation power does not confer membership or security administration.

Ownership transfer is a separate two-party operation with current-owner step-up, eligible recipient acceptance, exact Space/role intent, expiry and version control. Atomically change owner designation and owner-role grants, record audit/outbox intent, and preserve the reviewed invariant; concurrent transfer/removal/deletion cannot leave an active resource ownerless. An unavailable/deactivated/deleting sole owner requires a documented continuity or closure process, not secret admin takeover or indefinite denial of account deletion rights.

Narrow settings DTOs separate presentation from joining, retention, history, export, integration and Agent security policies. Broadening audiences/history requires explicit review and any affected data-owner consent, not a blanket checkbox that reveals existing private content. Narrowing policy takes effect at sensitive access/execution boundaries and invalidates affected approvals, subscriptions, caches and queued actions as required. A restore or version conflict cannot reset stronger restrictions to defaults.

### C3-W05 Leave, Remove, Suspend and Rejoin

Members can leave through the authorized self-service path; only permitted actors may remove or suspend a target. Owner continuity is handled explicitly by transfer or controlled closure. Removing another person cannot be disguised as a self-leave request with a supplied account ID. Read-only/archive mode does not by itself cancel necessary leave, consent-revocation or data-rights paths.

Commit the membership/role/epoch change and durable revocation/audit/event intent. Subsequent protected requests and sensitive dispatches check the updated authority; do not wait for an asynchronous cleanup event to make a removed member unauthorized. Stop new realtime delivery/replay, file authorization, exports and scoped Agent retrieval/tools. Disable old invitations or standing grants that would otherwise reactivate or notify the removed actor.

Task assignment, future event participation, calendar synchronization, reminders and approvals must be reconciled. Pause/skip work that depended on departed authority or an ineligible recipient; reassignment needs a new authorized decision, not automatically handing private task details to an admin. Decide independently owned personal data separately from Space-owned collaboration. A deletion or departure does not imply silent deletion of every shared record.

Rejoining must pass current identity/admission/restriction/capacity checks and begin a new authorized epoch. Do not inherit the old role, history, cryptographic keys, consent, file shares or approvals without explicit current grants. Suspension/reactivation races must preserve the same human capacity and role invariants as fresh admission.

### C3-W06 Conversations, Messages and Reconnect

Distinguish GROUP, DIRECT, GROUP_AGENT, PRIVATE_AGENT and SYSTEM conversation types from audiences. For Space-bound conversations, check current Space and conversation membership; a separate platform DM, if supported, uses its own Chapter 19 contract. A group owner is not automatically a participant in members' private conversations.

Authenticate the sender, validate current content and write policy, enforce reply/attachment ownership and message bounds, and atomically persist the message with outbox intent before reporting durable acceptance. Deduplicate by logical actor/conversation/client request; human, Agent and system sender identities must be server-controlled and must not collide through nullable human IDs. Editing/deleting/reading receipts needs target-specific rights and concurrency rules.

Realtime is a delivery mechanism, not the source of truth. Reconnect authenticates again, applies current history/audience filters and uses bounded cursors/sequence recovery. Duplicate or out-of-order events are reconciled against stored state; missing/expired history requires a safe resync, not unrestricted replay. Redis presence and typing are temporary and privacy-controlled, not proof of delivery, reading or availability.

Self-selected notification mute does not prohibit writing. A moderator's communication restriction may prohibit it under explicit policy. The source example's MUTED branch does not justify combining the two. Decide E2E mode before promising server summaries, moderation search or attachment scanning: `body_ciphertext` is a field name, not proof of end-to-end encryption.

### C3-W07 Tasks, Events, Reminders and Care Boundaries

Task creation/assignment/edit/completion requires the appropriate capability and object visibility; assignees must be currently eligible in the same Space. Specify creator/assignee/manager transition rights rather than assume every member can complete others' tasks. Preserve the source task states as input for reconciliation with other chapters; no unreviewed enum becomes the canonical database contract here.

Events separate title, exact location, participants/RSVPs and private notes. An event attendee is not automatically a Space member. Changing a date, guest list or owner revalidates associated reminders and notices under current privacy and consent. A public festival Page and its private organizer Space do not share audiences implicitly.

The scheduler remains independent of the LLM, with durable schedules, occurrences and delivery attempts as defined in Chapters 13/20. Resolve current recipient, membership, account status, object/history access, purpose, quiet hours and consent before dispatch. Membership loss, expiry, archived state, cancelled work or withdrawn authority prevents new disallowed dispatch; provider delivery already in flight is recorded and reconciled, not falsely recalled.

Escalation has an explicit authorized recipient, template, delay, channel, retry bound, stop conditions and audit. It stops on response/cancel/revocation/expiry and cannot loop through fallback contacts indefinitely. No response is not a diagnosis, proof of missed medication or automatic emergency. Use minimal generic notification details.

Health records are private to the authorized data owner/subject; status, medicine name, dosage and image each require an appropriate explicit grant. Family admin and task-manager roles do not substitute for consent or clinical authority. Chapter 1 excludes MVP Agent health-record access, diagnosis/dosage decisions and external messaging/calls; the source's future care examples remain out of that MVP implementation. Approval cannot turn a prohibited clinical decision into an allowed tool call.

### C3-W08 Agent Configuration, Memory and Approval

A Space gets a scoped configuration of the shared Agent runtime, not an independent trained model or unrestricted administrator. Default dangerous tools are disabled. Effective tool access is the intersection of current initiator authority, Space/object policies, delegation, action schema, sensitivity/consent and exact approval where required. A shared Agent summary respects the audience of every cited source; content authorized for a private request cannot automatically be posted into GROUP_AGENT.

Preserve personal, Space, conversation, task, event and temporary-context boundaries. No automatic personal-to-group memory transfer, no automatic group-to-every-member memory, and no private-conversation summary into group context. Every memory retains source, owner, scope, sensitivity and consent. Deleting or restricting a source makes dependent memory unavailable to unauthorized retrieval and triggers lineage review/purge according to policy; it is not an excuse to keep leaking the deleted content until a worker finishes.

Filter before candidate retrieval/ranking and again before sensitive use; an Agent cannot query all private data then filter its answer. Membership/history/revocation limits cover summaries, derived indexes, checkpoints, cached results and quoted material. Removing a person stops future protected access but does not magically erase their already exported/downloaded copy.

Approved actions bind exact intent, target, recipients, payload, tool/policy versions and expiry. Persist while awaiting the human; recheck authority when resuming. Rejected, cancelled, superseded, expired or policy-invalid approvals cannot execute. Cancellation stops new actions and reconciles unknown in-flight effects; do not claim rollback of external sends. The family admin is not automatically the appropriate approver for another member's personal/health data.

### C3-W09 Private Files, Shares and Data Projection

Use private object storage, validated size/type/signature, scan/quarantine, encryption when required, opaque object keys and scoped access audit. A Space attachment links to its authorized conversation/object; thumbnail, preview, OCR page, embedding, citation and download require the same current audience constraints. An upload must not become searchable or Agent-readable before required processing/safety gates pass.

Short-lived signed URLs reduce exposure but do not by themselves provide immediate revocation of already issued URLs. To honor C3-R06 for new access, use a current-authorized delivery gateway or a reviewed revocable mechanism; any bounded exposure alternative requires an explicit change to the promise, not calling ordinary URL expiry immediate revocation. Already transmitted bytes cannot be recalled. Document streaming and offline-client limitations honestly.

Permission-filter list/count/search/preview/export and private filenames; avoid public cache keys, raw storage paths or unscoped processing outputs. Content explicitly published to a public Page needs authority over every included artifact and any required consent. Shared possession or an admin's export right is not permission to republish another member's private file.

### C3-W10 Convert, Expire, Archive, Restore and Delete

Solo-to-group or another permitted type conversion needs a preview, explicit confirmation, versioned policy migration, valid membership migration, audit and updated Agent permissions. Keep old private records private unless separately selected and authorized for sharing. Re-evaluate human capacity and required participants atomically; copied resources keep source provenance and no wider audience by accident.

Temporary Spaces use explicit start/end/archive instants, membership expiry and retention. Enforce effective expiry in access/execution policy even when scheduler materialization is late. Read-only/archive does not send previously queued invitations/reminders or resume an approval merely because its timer fired. Reconcile unfinished events/tasks/jobs without deleting retained history automatically.

Archive/restore/delete are separate confirmed, version-checked operations with current authority. Proposed restore does not resurrect grants, invitations, members, messages already purged or cancelled jobs; show what can and cannot return. Space deletion cannot indiscriminately remove independently owned personal files or unrelated account data.

Deletion tracks a grace/purge workflow across records, subscriptions, schedules, files/derivatives, search, Agent memory, caches and export packages. Use resumable idempotent stages, auditable retention/holds and disclosed backup handling. A tombstone supports synchronization but is not completed physical deletion. Define permitted export/cancellation and ownership-continuity paths before implementation, and never label the workflow complete after deleting only the Space row.

## 9. Data Invariants and Transaction Handoff

These are logical requirements for [Chapter 6](../Chapter6.md), not executable SQL or a final schema. Retain one ownership boundary for memberships and admissions across Chapter 18's generic resource model and this chapter's Space tables; do not create two conflicting sources of truth.

| Aggregate or relationship | Constraint to enforce | Failure prevented |
| --- | --- | --- |
| Space -> owner, type, lifecycle and policy | Immutable Space ID, valid account owner, versioned type/state and one effective policy version; active type/owner invariants reviewed together. | Client-selected owner, stale policy replacement, ownerless active Space or incomplete creation. |
| Space/account -> membership and admission epochs | Unique current membership identity per Space/account; valid period/state/version, role provenance and explicit reactivation. | Duplicate membership, overlapping admissions and resurrected access through an old invite. |
| Space -> active/reserved human roster | Serialize capacity-sensitive admission, reactivation, conversion and restore with the same durable resource invariant. | Different invitation transactions or suspension/replacement races exceeding couple/solo limits. |
| Space -> invitations and join requests | Valid Space/inviter/recipient, grantable role, protected token, purpose, expiry, use count and version; independent delivery telemetry. | Wrong-role admission, token reuse, account enumeration and SENT being mistaken for membership. |
| Space/account -> role and ownership changes | Current actor and target versions, no invalid owner removal, eligible two-party transfer and atomic audit. | Self-promotion, admin-to-owner takeover or lost updates between role changes. |
| Space -> conversations -> participants/messages | Conversation belongs to the expected Space; participants reference eligible admitted actors; replies and attachment references belong to their authorized conversation/resource. | Cross-Space message/reply/file attachment or unauthorized private-conversation entry. |
| Conversation/actor/request -> message/outbox | Stable logical idempotency scope, canonical server ID/order, valid sender type, durable message and outgoing event intent in one transaction. | Duplicate messages, null-sender collisions, event-before-commit and phantom success. |
| Membership/conversation -> history grants/read cursors | Admission identity, authorized sequence/time boundaries, explicit grant scope and current revoke/version checks. | Rejoin recovering old private history or one conversation's cursor authorizing another. |
| Space -> tasks/events/participants | Same-Space references, current eligible assignee/participant, explicit field audience and expected version on writes. | Assigning to a removed member, leaking a private event location or creating a relationship by RSVP. |
| Schedule -> occurrences/recipient deliveries | Source object/Space, accountable initiator, verified permitted recipient, schedule version, unique occurrence and bounded retry history. | Departed authority continuing sends, duplicate due work and escalation with stale consent. |
| File -> object versions/derivatives/shares | Valid owner/Space/conversation, explicit audience, scan status, source-version lineage and revocable access policy. | A private preview/index/share being more public than its original file. |
| Agent config/delegation -> run/approval/memory | Current human/resource scope, allowed actions, policy version, exact approved payload and source/consent lineage. | Cross-Space tool calls, reused approvals and deleted private text leaking through derived memory. |
| Lifecycle job -> retained records and purge stages | Versioned state transition, completed/failed stages, retention/hold evidence, safe tombstones and resumable cleanup. | False deletion-complete claims, lost synchronization and restore reviving already-revoked work. |

### Execution and Race Boundaries

Document the lock/version strategy and ordering before implementation. A valid approach can use a short transaction and shared roster/policy row serialization with expected versions, but the final SQL and isolation choice require Chapter 6 review and real PostgreSQL race tests. Do not present `COUNT(*) < 2` followed by a separate insert as proof of couple capacity.

Authenticate and authorize current state, acquire the reviewed serialization boundary, revalidate mutable invariants, commit the change plus required audit/outbox, then asynchronously publish. Avoid provider/LLM calls while holding a database lock. An idempotency record is scoped to actor/action/resource/request hash; reusing a key with another payload is a conflict, not permission to repeat a mutation. Replays must still respect current read/return permissions.

Tests must cover invitation accept versus revoke, invitation accept versus inviter demotion, join versus last-slot join, role change versus owner transfer, removal versus send/export/tool execution, suspend versus replacement/reactivation, and expiry/archive versus dispatch. Define the transaction's authorized execution point and return the canonical winning state; no claim of reversing actions already committed or bytes already transmitted.

Revocation is effective for new protected operations at the agreed execution boundary. Durable policy/membership changes are not postponed until their fanout/cache cleanup message arrives. Subscribers and workers recheck current authorization before private replay, context assembly, archive download or provider dispatch. Define invalidation deadlines and fail-closed behavior if current authority cannot be determined; offline caches and already downloaded data have separately disclosed limits.

### Events and Policy Versions

[Chapter 7](../Chapter7.md) owns the canonical envelope. Proposed event families include Space creation/policy/lifecycle change, membership admission/role/end/suspension, invitation/request state and relevant object changes. Use stable event ID, type, schema version, aggregate/version, Space, authorized actor/acting identity, occurrence time and correlation ID; these are proposals, not finalized new event names.

Consumers deduplicate and re-evaluate their own action. A membership event is not an unrestricted snapshot of the private roster, phone numbers, relationship labels, history or health details. Event metadata, audit and logs have access and retention controls. Security logs use safe action/result categories; never include invitation tokens, secrets, message bodies or unredacted care information.

## 10. Source API Inventory and Contract Boundaries

All 40 source method/path pairs from [3.25](../Chapter3.md#L1900) are retained below. They are a source inventory, not generated OpenAPI or a commitment to duplicate Chapter 18's `/resources` routes. Choose a single canonical prefix and domain operation in Chapter 7. REST is the client command/query baseline, WebSocket carries realtime updates, and selected internal gRPC requires an actual boundary rather than being mandatory for every service.

| ID | Source operation | Owning workflow | Required contract boundary |
| --- | --- | --- | --- |
| C3-P01 | `POST /v1/spaces` | C3-W01 | Creator-derived ownership, narrow payload, atomic policy/owner creation and idempotency. |
| C3-P02 | `GET /v1/spaces` | C3-W01 | Only currently permitted Spaces; bounded cursor and privacy-safe counts/previews. |
| C3-P03 | `GET /v1/spaces/{space_id}` | C3-W01 | Current membership/lifecycle; no private metadata disclosure through guessed IDs. |
| C3-P04 | `PATCH /v1/spaces/{space_id}` | C3-W04 | Separate presentation from security fields, allowed actor/target changes and expected version. |
| C3-P05 | `DELETE /v1/spaces/{space_id}` | C3-W10 | Confirmed lifecycle request with retention/status, not an immediate unaudited row delete. |
| C3-P06 | `POST /v1/spaces/{space_id}/archive` | C3-W10 | Explicit authorized transition and dependent-work reconciliation. |
| C3-P07 | `POST /v1/spaces/{space_id}/restore` | C3-W10 | Retained-state/current-authority checks; never silently revive former grants or purged data. |
| C3-P08 | `GET /v1/spaces/{space_id}/members` | C3-W03 | Roster visibility and field filtering; guest/pending access is not assumed. |
| C3-P09 | `POST /v1/spaces/{space_id}/members/invite` | C3-W02 | Current invite permission, intended recipient, permitted role, expiry and abuse controls. |
| C3-P10 | `POST /v1/spaces/{space_id}/join-requests` | C3-W03 | Defined request-entry policy without exposing private content or public discoverability. |
| C3-P11 | `POST /v1/spaces/{space_id}/join-requests/{id}/approve` | C3-W03 | Request belongs to the Space; current reviewer authority and atomic admission checks. |
| C3-P12 | `POST /v1/spaces/{space_id}/join-requests/{id}/reject` | C3-W03 | Scoped current review; do not destroy a pre-existing membership or leak private review notes. |
| C3-P13 | `PATCH /v1/spaces/{space_id}/members/{user_id}` | C3-W04 | Target-aware allowlisted role/restriction operation; no owner flag or arbitrary account mutation. |
| C3-P14 | `DELETE /v1/spaces/{space_id}/members/{user_id}` | C3-W05 | Current actor/target roles, owner continuity, durable revocation and safe retry. |
| C3-P15 | `POST /v1/spaces/{space_id}/leave` | C3-W05 | Authenticated self, not a submitted target identity; explicit owner continuity/data-rights route. |
| C3-P16 | `GET /v1/spaces/{space_id}/conversations` | C3-W06 | Only entitled conversations, permitted metadata and history-aware counts. |
| C3-P17 | `POST /v1/spaces/{space_id}/conversations` | C3-W06 | Permitted conversation type/participants, explicit audience and no hidden admin enrollment. |
| C3-P18 | `GET /v1/conversations/{conversation_id}/messages` | C3-W06 | Current conversation/Space/history rules and bounded safe cursor recovery. |
| C3-P19 | `POST /v1/conversations/{conversation_id}/messages` | C3-W06 | Server-derived sender, authorized write/reply/attachments, message+outbox commit and dedup. |
| C3-P20 | `PATCH /v1/messages/{message_id}` | C3-W06 | Current edit rights/version; editing old content does not broaden history visibility. |
| C3-P21 | `DELETE /v1/messages/{message_id}` | C3-W06 | Defined author/moderation delete semantics, tombstone and downstream lineage handling. |
| C3-P22 | `POST /v1/conversations/{conversation_id}/read` | C3-W06 | Read cursor constrained to authorized content and actor; no inferred read from presence. |
| C3-P23 | `GET /v1/spaces/{space_id}/tasks` | C3-W07 | Private/shared task and history filtering, including counts and reminders. |
| C3-P24 | `POST /v1/spaces/{space_id}/tasks` | C3-W07 | Creator from session, current create capability, approved audience and eligible assignment. |
| C3-P25 | `PATCH /v1/tasks/{task_id}` | C3-W07 | Field/transition-specific authority and version checks; no assignment/visibility bypass. |
| C3-P26 | `POST /v1/tasks/{task_id}/complete` | C3-W07 | Authorized actor/transition, explicit completion evidence and safe repeated request. |
| C3-P27 | `POST /v1/tasks/{task_id}/assign` | C3-W07 | Assignee belongs to the eligible current Space audience; race against removal is checked. |
| C3-P28 | `GET /v1/spaces/{space_id}/events` | C3-W07 | Field-level location/attendee/notes/RSVP and history filtering. |
| C3-P29 | `POST /v1/spaces/{space_id}/events` | C3-W07 | Permitted creator, timezone-aware event and explicit audience/participant contract. |
| C3-P30 | `PATCH /v1/events/{event_id}` | C3-W07 | Allowed field/version changes with affected schedule/recipient reconciliation. |
| C3-P31 | `POST /v1/events/{event_id}/rsvp` | C3-W07 | Authorized participant response, no implied Space admission or guest-list access. |
| C3-P32 | `DELETE /v1/events/{event_id}` | C3-W07 | Defined cancel/delete operation, dependent reminder stop and retention semantics. |
| C3-P33 | `GET /v1/spaces/{space_id}/agent` | C3-W08 | Only safe permitted configuration/status; no provider secrets or private member context. |
| C3-P34 | `PATCH /v1/spaces/{space_id}/agent` | C3-W08 | Current configuration capability, bounded allowlists and no self-granted permissions. |
| C3-P35 | `POST /v1/spaces/{space_id}/agent/chat` | C3-W08 | Explicit requester/conversation scope and authorized input/retrieval; shared and private outputs differ. |
| C3-P36 | `GET /v1/spaces/{space_id}/agent/actions` | C3-W08 | Initiator/approver/auditor-specific access; not all admins see every member's private action. |
| C3-P37 | `POST /v1/agent-actions/{action_id}/approve` | C3-W08 | Eligible human, exact payload/action/recipient, expiry and current authority; no prohibited action. |
| C3-P38 | `POST /v1/agent-actions/{action_id}/reject` | C3-W08 | Eligible actor and current action state; reconcile already-running work honestly. |
| C3-P39 | `GET /v1/spaces/{space_id}/agent/memory` | C3-W08 | Source/audience/history/consent-filtered memory, not unrestricted Space-wide recall. |
| C3-P40 | `DELETE /v1/agent-memory/{memory_id}` | C3-W08 | Current memory/data-owner authority, retrieval exclusion and tracked dependent cleanup. |

Explicit contract gaps: intended-recipient invite preview/exchange/accept/decline/revoke/resend and organizer confirmation; ownership-transfer initiation/acceptance; policy/history-grant changes; type conversion; guest expiry/suspension/reactivation; file downloads/shares; export/purge progress and cancellation; reminders/escalation. Reuse owning Chapter 18/13/14/20 operations where applicable and choose canonical routes once. An absent route is not permission to tunnel a sensitive operation through a generic Space PATCH.

Responses use safe versioned schemas and narrow field projections, current authorization, consistent errors, request IDs, bounded pagination and explicit optimistic concurrency. Unauthenticated/wrong-resource lookup must not reveal private Space existence, roster counts, contact identities or confidential audit reasons. Private bodies and bearer credentials are excluded from shared cache/telemetry. Do not promise exactly-once external delivery from a local idempotency key.

## 11. Android and Web Screen Contract

The source specifies the Android stack but stops before its feature module list. The following flows are proposed additions linked to [Chapter 8](../Chapter8.md) and [Chapter 9](../Chapter9.md), not recovered missing text. Retain Kotlin/Compose, ViewModel/StateFlow, repositories and permitted Room state, and the selected Retrofit/OkHttp baseline; the source's Ktor alternative is not a reason to add a second HTTP client. The web client uses the same backend contracts and does not duplicate domain policy.

| Surface | User outcome | Required exceptional states |
| --- | --- | --- |
| Space list and create | See entitled Spaces and create a chosen supported type with a clear private context. | Empty/loading/error/offline, verification or policy denial, invalid input, duplicate submit and pending activation. |
| Space detail and navigation | Understand the selected Space and see only permitted Chat, Tasks, Events, Files, Agent, Members and Settings areas when implemented. | Removed/expired membership, locked/read-only/archive status, stale role and denied deep link. Hidden controls do not replace backend checks. |
| Invite and review | Invite an intended account/contact, review role/privacy and accept/decline after identity proof. | Wrong account, expired/revoked/used link, rate limit, failed delivery and pending organizer confirmation if adopted. |
| Members, roles and ownership | View permitted member information and perform allowed management or two-party owner transfer. | Target changed role, last owner, concurrent changes, missing step-up, unsupported grant and safe refresh without replaying a dangerous write. |
| Shared/private conversations | Show explicit participants/audience, honest send/delivery/read state, history limit and reconnect recovery. | Private sub-conversation denial, history not granted, duplicate/retrying send, session expiry, stale cursor and restricted posting distinct from mute. |
| Tasks, events and reminders | Create/edit authorized shared work with assignee, date/timezone, audience, recipient and notification review. | Stale or removed assignee, hidden location/RSVP, missing consent, cancellation race and delivery failure. No medication/Agent-health feature in M1. |
| Agent, approvals and memory | Distinguish private versus shared context, drafts versus executed actions, exact approvals and source-bound memory controls. | Disabled/revoked scope, waiting/expired/rejected approval, provider failure, partial/unknown outcome and source no longer available. |
| Files, history and export | See processing states, allowed sources and history, preview exact intended sharing/export scope. | Scan/quarantine/partial failure, revoked share, denied older content, unauthorized derivative/citation, expiring export and retained-data notice. |
| Leave, remove and rejoin | Explain immediate future-access loss, retained shared history and owner/assignment implications. | Owner continuity, stale target, ban/restriction, pending new admission and no automatic restoration of old history. |
| Conversion and lifecycle | Review type change, expiry, archive/restore or deletion effects on content, memberships and scheduled work. | Capacity conflict, prohibited state, missing data-owner consent, delayed purge, hold, expired restore window and irrecoverable deletion. |

Every primary surface needs loading, success, applicable empty state, recoverable error/safe retry, current access denial and session expiry. Define back navigation, approved deep links, preserved safe drafts/unsaved changes, screen-reader labels, focus order, keyboard access, RTL/localized text, readable scaling and responsive dimensions. Never expose private context in notification previews, task-switcher screenshots, analytics or placeholder data contrary to the reviewed privacy policy.

Android and web may show permitted cached data offline with an honest stale-state indication. They cannot prove live membership while disconnected. Sensitive approvals, role/owner changes, joining/rejoining, consent grants, type conversion and destructive operations require online confirmation. Best-effort cache clearing on reconnect cannot retract data already copied by a formerly authorized user.

M1 only implements the approved family/create/invite/membership/task/reminder subset. The other screens are full-domain planning obligations, not evidence of a built UI or a requirement to implement every future feature before the first demo. Prototype artifacts, module packaging and component tests remain developer deliverables.

## 12. Proposed Acceptance Evidence

Chapter 3 has no completed source acceptance list. All C3-V scenarios below are proposed evidence families, currently NOT RUN. They map to the exact topic/guarantee ledgers rather than being presented as verbatim source criteria. Some cover future or broader MVP capabilities and must remain unverified until that capability is actually delivered.

| Check | Source topics | Guarantees | Workflows | Required evidence |
| --- | --- | --- | --- | --- |
| C3-V01 | C3-S01, C3-S04, C3-S26 | C3-R01, C3-R09, C3-R10 | C3-W01, C3-W09 | Seed private Space names/content, phone labels and files; public search/feed/recommendations/profile/sitemap/media and unauthenticated APIs exclude them, including warmed caches and guessed IDs. |
| C3-V02 | C3-S02, C3-S04, C3-S05 | C3-R02, C3-R03, C3-R07 | C3-W01 | Real transaction rollback/retry creates one consistent Space, policy and owner relationship; client owner/status/tool-field injection is rejected and pending activation grants no shared data. |
| C3-V03 | C3-S02, C3-S08 | C3-R02, C3-R03 | C3-W02, C3-W03, C3-W05 | Concurrent invitations, guest/observer admission, suspension/replacement/reactivation and restore preserve the couple maximum of two active humans; Agent labeling cannot exempt a human. |
| C3-V04 | C3-S02, C3-S08 | C3-R02, C3-R05, C3-R08 | C3-W01, C3-W10 | Active solo has one human; unauthorized second admission fails. Explicit conversion migrates required policies atomically without sharing old personal records or changing Agent permissions silently. |
| C3-V05 | C3-S02, C3-S08, C3-S11 | C3-R03, C3-R06 | C3-W03, C3-W10 | Custom limits and temporary guest/Space expiry are enforced using a controlled clock while cleanup is stopped; directory/history/files and new job execution obey effective expiry. |
| C3-V06 | C3-S03 | C3-R03, C3-R06, C3-R07 | C3-W10 | Exercise allowed/denied locked/read-only/archive/deletion transitions, stale restore and resumable purge. Restore never revives revoked permissions, cancelled jobs, expired invites or purged data. |
| C3-V07 | C3-S05, C3-S07 | C3-R03, C3-R05, C3-R10 | C3-W04 | Policy change/version races, target-aware admin limits, private-data denial for owner/admin and restrictive policy cache invalidation are enforced server-side. Broad history policy cannot override object consent. |
| C3-V08 | C3-S06, C3-S07, C3-S26 | C3-R02, C3-R03 | C3-W04, C3-W05, C3-W06 | Invitations, active membership, notification mute and moderation restriction are distinct. Mute alone cannot block writing or grant access; restricted posting does not rely on client hiding a button. |
| C3-V09 | C3-S07 | C3-R02, C3-R03, C3-R08 | C3-W04, C3-W05 | Concurrent owner transfer/removal/deletion and admin self-promotion fail safely; intended recipient acceptance and recent-auth policy are required and the active ownership invariant survives. |
| C3-V10 | C3-S09 | C3-R02, C3-R03, C3-R05 | C3-W02 | Token randomness/storage/expiry/single-use, intended recipient, invitee preview, revoked/forwarded/replayed links, inviter demotion and GET/prefetch non-consumption all have real API and race evidence. |
| C3-V11 | C3-S10 | C3-R02, C3-R05 | C3-W02 | Contact normalization and private previews do not expose accounts or Space details. A reassigned number cannot retarget an existing-account invite; new binding and proposed organizer confirmation are enforced if adopted. |
| C3-V12 | C3-S11, C3-S12 | C3-R03, C3-R05 | C3-W02, C3-W03, C3-W06 | Direct/link/QR/request entry uses the same admission checks. History tests cover no-history/windows/pins/explicit grants plus quotes, old edits, notifications, counts, search, Agent summaries and event/task references. |
| C3-V13 | C3-S06, C3-S11 | C3-R03, C3-R06 | C3-W05 | Leave/remove/suspend commits deny the next protected boundary; old accepted invites, cached roles and prior admission epochs cannot restore access or clear a ban. Safe rejoin creates only newly authorized rights. |
| C3-V14 | C3-S12, C3-S19 | C3-R05, C3-R10 | C3-W07, C3-W09 | Each audience and data-owner interpretation is tested against owner/admin/member/stranger; shared container membership does not expose private notes, care fields, file previews or exact location. |
| C3-V15 | C3-S13 | C3-R03, C3-R05 | C3-W06 | GROUP/DIRECT/GROUP_AGENT/PRIVATE_AGENT/SYSTEM participant and history checks prevent private conversation reads, joins, metadata leaks and admin self-enrollment. Space-bound and standalone-DM rules are not mixed. |
| C3-V16 | C3-S14 | C3-R03, C3-R07 | C3-W06 | Transaction rollback emits no delivered message; retry after lost acknowledgment yields one canonical message. Cross-conversation replies/attachments and forged Agent/system senders fail; receipts remain truthful. |
| C3-V17 | C3-S15 | C3-R03, C3-R06, C3-R07 | C3-W05, C3-W06 | Disconnect/reconnect, duplicate/out-of-order events, expired cursors and concurrent removal are tested. Replay/counts/receipts honor current history grants; presence does not fabricate delivery or read evidence. |
| C3-V18 | C3-S16 | C3-R03, C3-R05, C3-R07 | C3-W07 | Creator/assignee/manager rights and versioned task transitions persist; cross-Space or removed assignees are rejected during concurrent assignment, with no private description exposed by reassignment. |
| C3-V19 | C3-S17 | C3-R03, C3-R05 | C3-W07 | Event creation/edit/cancel, timezone and field-level title/location/attendee/notes/RSVP privacy are verified. RSVP does not create Space membership; cancellation reconciles dependent reminders. |
| C3-V20 | C3-S18 | C3-R03, C3-R06, C3-R07 | C3-W05, C3-W07, C3-W10 | Durable schedules work without the LLM; retry/restart creates one logical occurrence. Current recipient, membership, consent, lifecycle and expiry prevent disallowed sends at the dispatch boundary. |
| C3-V21 | C3-S19 | C3-R04, C3-R05, C3-R08 | C3-W07, C3-W08 | Status-only care permission cannot expose medicine/dosage/image. Clinical diagnosis/dose decisions and MVP health/external Agent actions stay denied even with admin or generic approval. Future care tests do not imply a current health feature. |
| C3-V22 | C3-S20 | C3-R03, C3-R04 | C3-W08 | Space Agent config cannot add powers beyond human/resource/delegation policy. Disabled dangerous tools, guessed Space IDs, stale initiator membership and self-modified tool allowlists fail. |
| C3-V23 | C3-S21 | C3-R04, C3-R05, C3-R06 | C3-W05, C3-W08 | Personal/Space/conversation/task/event memory stays scoped with source provenance; deleted/restricted sources, changed history and revoked consent are excluded before retrieval and output, including cached checkpoints. |
| C3-V24 | C3-S22 | C3-R03, C3-R04, C3-R08 | C3-W08 | Changed payload/recipient/tool/policy, expired/rejected/cancelled approval and permission loss between draft/approval/execution cannot execute. Resume/retry records uncertainty for already in-flight effects, not false success or rollback. |
| C3-V25 | C3-S23 | C3-R03, C3-R05, C3-R08 | C3-W07 | Approved escalation recipients/channels, quiet hours, minimal data, opt-out, bounded retries, response/cancel/revoke stop conditions and loop prevention are exercised. No response does not trigger unsupported emergency claims. |
| C3-V26 | C3-S24 | C3-R03, C3-R05, C3-R06 | C3-W09 | Upload validation/quarantine, private originals/derivatives/citations, expiry and membership removal are tested. A previously issued ordinary signed URL must not falsely satisfy an immediate-revocation claim; approved delivery enforcement and limits are demonstrated. |
| C3-V27 | C3-S25 | C3-R03, C3-R09, C3-R10 | C3-W01, C3-W02, C3-W04, C3-W06, C3-W07, C3-W08 | Every released operation in the source API inventory has current resource/action checks, input allowlists, safe errors/cursors and concurrency/retry coverage. Canonical routes call one domain operation, not duplicate membership stores. |
| C3-V28 | C3-S26 | C3-R03, C3-R06, C3-R10 | C3-W04, C3-W05, C3-W08, C3-W09 | Central policy tests include actor and target roles, audience/history/consent, unavailable authority, policy-cache changes, delayed workers, exports, realtime and tools; no old cached private response after denial. |
| C3-V29 | C3-S27 | C3-R05, C3-R10 | C3-W01, C3-W02, C3-W05, C3-W06, C3-W07, C3-W08, C3-W10 | Android/core web primary states, accessibility, responsive layouts, text scaling, back/deep links, drafts and offline limitations are tested for delivered flows. No claim of missing source modules or complete screens from headings alone. |
| C3-V30 | C3-S01, C3-S03, C3-S25, C3-S26 | C3-R02, C3-R03, C3-R06, C3-R07, C3-R08 | C3-W01, C3-W02, C3-W03, C3-W04, C3-W05, C3-W06, C3-W07, C3-W08, C3-W09, C3-W10 | Synthetic end-to-end release-specific demo combines real DB/API/client behavior with permission, capacity, restart/retry and revocation races. Record commands, artifacts, skips and limits; mocked snapshots and structural document checks are not runtime proof. |

Use synthetic accounts, permitted test devices and controlled clocks; do not change the host clock, send to real family contacts, inspect private personal-device content or test destructive deletion on real accounts. Match security and concurrency coverage to delivered scope. Preserve failures and incomplete evidence instead of rounding a partial demo up to full-MVP or production acceptance.

## 13. Developer Handoffs and Demonstration

| Ticket | Accountable role | Depends on | Deliverable and acceptance evidence |
| --- | --- | --- | --- |
| C3-T01 | Product and security leads, Teams A/E | C1-T01; relevant Chapter 18 decisions | Resolve Space roles/lifecycle/history/admission and C3-D01 through C3-D13 for the selected slice. Record exclusions and unresolved cases instead of claiming policy approval from this draft. |
| C3-T02 | Data/API/policy architect, Team C | C3-T01; Chapter 18 identity contract | Chapter 6/7 schema, transaction, canonical state/API/event and central policy design; map all source guarantees and relevant evidence scenarios before dependent code. |
| C3-T03 | Spaces engineer, Team C | C3-T02 | Implement reviewed creation, type/owner invariants and narrow settings with atomic audit/outbox; C3-V01, C3-V02, C3-V04, C3-V07. No duplicated service per Space type. |
| C3-T04 | Membership/identity engineer, Team C | C3-T03; C18-T05 | Implement identity-bound invites/requests and transactional capacity-safe admission using one domain operation; C3-V03, C3-V05, C3-V10, C3-V11, C3-V12. |
| C3-T05 | Authorization engineer, Teams C/E | C3-T04 | Implement target-aware roles/owner transfer, leave/removal/suspension/rejoin and revocation across released paths; C3-V07, C3-V08, C3-V09, C3-V13, C3-V28. |
| C3-T06 | Messaging/files engineers, Team C | C3-T05; chosen encryption/file contracts | Implement released conversation/history/message and file projection boundaries, with ordered replay and current access; C3-V12, C3-V14 through C3-V17, C3-V26. Split independent messaging/file changes into reviewable tickets. |
| C3-T07 | Planning/notification engineer, Team C | C3-T05; scheduling/delivery contracts | Apply current membership/audience/consent to tasks, events, reminders and escalation; C3-V18, C3-V19, C3-V20, C3-V25. M1 remains ordinary tasks and one-time in-app reminders. |
| C3-T08 | Agent/memory engineer, Team D | C3-T05, C3-T06, C3-T07; controlled-Agent milestone | Enforce scoped config/context/memory, exact approval and no privileged tool bypass; C3-V21 through C3-V24. No Agent code or health access silently added to M1. |
| C3-T09 | Lifecycle/privacy engineer, Teams C/E | C3-T05; C3-T06, C3-T07, C3-T08 for released dependent domains | Implement reviewed conversion/expiry/archive/restore/purge and authorized export coordination; C3-V04 through C3-V06, C3-V13, C3-V20, C3-V26. Do not block M1 on unimplemented future providers. |
| C3-T10 | Android lead/designer, Teams B/A | C3-T02; C3-T03 through C3-T09 for released flow integration | Implement approved Compose/Room/API screens and current-state reconciliation; source-linked navigation, accessibility and negative states under C3-V29. |
| C3-T11 | Web lead/designer, Teams B/A | C3-T02; C3-T03 through C3-T09 for released flow integration | Implement core web workflows with shared authorization contracts, safe cache/session boundaries, responsive states and C3-V29 evidence. |
| C3-T12 | QA/security lead, Team E | C3-T03 through C3-T11 for the released scope | Run applicable C3-V01 through C3-V30 with real transaction/client evidence; publish failures, environment, deferred capabilities and release sign-off blockers. |

These are ownership packages, not hired people, executed subagents or a mandate to implement the entire chapter at once. Split large packages by reviewable change and preserve their dependency/acceptance links. Required deliverables include code and focused tests where applicable, API/migration notes, changed-policy ADRs, security/recovery runbooks, demo instructions and honest limitations. Documentation-only tasks explain which executable deliverables are not applicable.

M1 demonstration: synthetic organizer creates family -> intended member accepts with identity proof and confirmation if required -> unrelated account is denied -> authorized member creates task/reminder -> recipient receives in-app history and acknowledges -> removal before a later due occurrence prevents new access/delivery -> reconnect and repeated admission requests do not restore the old membership. This demonstrates the family slice only, not all Space types or a live external provider.

Broader Space demonstrations add concurrent last-slot couple joins, solo conversion without private-data disclosure, guest expiry with cleanup stopped, restricted conversation/history, role/owner transfer races and archive/restore without revived permissions. Controlled Agent, E2E, generic files and health capabilities require their own approved milestones; no source paragraph or mock response proves them implemented.

## 14. Risks and Next Design Step

| Mistake | Impact | Required correction |
| --- | --- | --- |
| Treat every group member or admin as an audience for all Space data. | Private conversations, care details and personal memory leak. | Intersect current membership with object/conversation/history/consent, including secondary projections. |
| Use a separate count check or role label to enforce couple size. | Concurrent joins/reactivation admit a third human. | Shared transactional capacity invariant across every admission and lifecycle path. |
| Reuse an old membership row or accepted invite without an admission boundary. | A returning member inherits revoked roles/history/keys. | Explicit re-admission, current policy and new reviewed grants. |
| Treat a new edit/summary/notification as permission to disclose old content. | History restrictions are bypassed by derived data. | Preserve source audience and historical provenance in all projections. |
| Depend only on cache invalidation or signed-URL expiry for immediate revocation. | Removed members continue retrieving private content. | Current authorization at sensitive delivery boundaries and an actually revocable file path; disclose in-flight/offline limits. |
| Treat owner policy edits or generic approval as authority over personal data. | Privilege escalation or prohibited Agent/clinical action. | Target-aware capabilities, actual data-owner consent and absolute prohibited-action boundaries. |
| Archive/delete only the Space record. | Orphaned jobs continue sending, indexes retain private data or purge is falsely reported complete. | Transactional state change plus resumable, permission-aware dependent-work cleanup and retention. |

Next is [Chapter 6: database architecture](../Chapter6.md), using this contract and the identity draft to select canonical entities, constraints, admission/ownership transactions, state models and migration boundaries. Follow with [Chapter 7: API/event contracts](../Chapter7.md); carry [Chapter 11 security](../Chapter11.md), [Chapter 19 encryption](../Chapter19.md), [Chapter 13 scheduling](../Chapter13.md), [Chapter 14 files](../Chapter14.md) and [Chapter 20 delivery](../Chapter20.md) alongside their affected records.

The immediate product decisions remain the proposed role hierarchy, private/history defaults, intended-recipient confirmation, couple departure/replacement, owner continuity and restore/rejoin policy. This draft advances design without selecting those policies on the user's behalf or starting application implementation.