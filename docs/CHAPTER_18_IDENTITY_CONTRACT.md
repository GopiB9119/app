# Chapter 18: Identity, Verification and Invitation Contract

Status: DRAFT FOR PRODUCT AND SECURITY REVIEW. This is a design contract, not implemented authentication, approved provider integration or a security certification.

## 1. Scope and Authority

This advances the [Chapter 1 release plan](CHAPTER_01_RELEASE_PLAN.md), especially C1-J01 account/onboarding, C1-J03 private membership, C1-J08 data rights and C1-T03 identity handoff. The original [Chapter 18](Chapter18.md) remains unchanged.

- M1 needs verified accounts, profiles/timezones, revocable sessions, targeted invitations, accepted family membership and a recovery contract. A supplied phone number is not a membership or permission grant.
- The full chapter also covers relationships, contact discovery, join requests, blocking, public/page identities, account lifecycle, export and Agent delegation. These are retained without silently adding every advanced capability to M1.
- The Chapter 1 scope decisions remain proposed/open. Continuing design does not approve those decisions or authorize application implementation, live messages, paid services or deployment.
- Source rules, design recommendations and pending choices are distinguished below. Exact database DDL belongs to Chapter 6; a canonical error/event envelope belongs to Chapter 7; Space-specific role and admission policy belongs to Chapter 3.
- All implementation, provider and product-test evidence is NOT RUN. IDs in this document identify planned contracts and checks, not executed tests or developer agents.

## 2. Source Architecture Decisions

All 20 decisions in [section 18.31](Chapter18.md#L2815) are retained verbatim. They describe the complete identity domain; they are not proof that it exists.

| ID | Source final architecture decision |
| --- | --- |
| C18-R01 | Account, profile, membership, relationship, and agent identity remain separate concepts. |
| C18-R02 | Account IDs are immutable and independent of email, phone, and username. |
| C18-R03 | Authentication is handled by a dedicated identity module. |
| C18-R04 | Authorization is evaluated at resource and action level. |
| C18-R05 | Membership roles are resource-scoped. |
| C18-R06 | Relationships require explicit creation and acceptance. |
| C18-R07 | Contact discovery is opt-in and privacy-preserving. |
| C18-R08 | Email and phone numbers are private by default. |
| C18-R09 | Sessions and devices are individually revocable. |
| C18-R10 | Account recovery is treated as a high-risk workflow. |
| C18-R11 | Deletion is asynchronous, resumable, audited, and policy-driven. |
| C18-R12 | Data export is asynchronous and protected by re-authentication. |
| C18-R13 | Blocking, muting, and restricting are separate capabilities. |
| C18-R14 | Page and organization identities are distinct from personal accounts. |
| C18-R15 | Agents operate through explicit, scoped, revocable delegation. |
| C18-R16 | External communication requires channel-specific consent. |
| C18-R17 | Ownership transfers require confirmation and audit records. |
| C18-R18 | All sensitive identity operations emit security and domain events. |
| C18-R19 | The initial implementation should be a modular identity domain inside the backend, not a separate microservice. |
| C18-R20 | The identity domain may be extracted later if scale, compliance, or organizational boundaries require it. |

## 3. Source Acceptance Ledger

All 23 criteria in [section 18.32](Chapter18.md#L2859) are retained verbatim. Their presence does not mean every capability is a Chapter 1 MVP requirement. Release applicability is called out in the workflows and handoff; every criterion currently has status NOT RUN.

| ID | Source acceptance criterion |
| --- | --- |
| C18-A01 | Users can register and authenticate securely. |
| C18-A02 | Email and phone verification work with expiration and retry limits. |
| C18-A03 | Users can manage active sessions and devices. |
| C18-A04 | Profiles support visibility and discoverability settings. |
| C18-A05 | Usernames are normalized and unique. |
| C18-A06 | Contact discovery is opt-in and privacy-preserving. |
| C18-A07 | Users can create and accept explicit relationships. |
| C18-A08 | Family, couple, trusted-contact, and custom relationship types are supported. |
| C18-A09 | Resource memberships are unique and role-scoped. |
| C18-A10 | Invitations expire, can be revoked, and are rate limited. |
| C18-A11 | Join requests support approval and rejection. |
| C18-A12 | Roles and permissions are evaluated server-side. |
| C18-A13 | Account recovery is protected against abuse. |
| C18-A14 | Users can deactivate, delete, and export their data. |
| C18-A15 | Blocking, muting, and restricting are enforced across APIs. |
| C18-A16 | Page and organization identities are auditable. |
| C18-A17 | Agent delegations are scoped, expirable, and revocable. |
| C18-A18 | Consent is stored with scope and history. |
| C18-A19 | Sensitive identity data is excluded from logs. |
| C18-A20 | Security events are observable. |
| C18-A21 | Deletion and export jobs are resumable. |
| C18-A22 | Android and web clients share API contracts. |
| C18-A23 | Automated tests cover authorization, account recovery, membership changes, and deletion. |

## 4. Initial Identity Boundaries

The [core model](Chapter18.md#L45), [verification model](Chapter18.md#L531) and [membership/invitation model](Chapter18.md#L1154) establish the following contract direction:

1. A stable internal account ID owns resources. A phone number, email, username, profile label or external provider email claim is not that account ID.
2. Authentication identities and verified contact points are separate from public profile fields. External identities use their stable provider subject, not an email-only account merge.
3. Verification is bound to a destination, account or pending attempt, purpose and expiry. Registration verification cannot automatically approve an export, recovery or changed phone number.
4. A session and its device are separately revocable. Current account state and server-side revocation still govern protected requests; possession of an old access token does not restore access.
5. A targeted family invitation is separate from membership. Final admission creates membership transactionally; current role/resource policy, intended recipient, expiry, revocation and duplicate acceptance must all be checked. A previously unbound destination may require organizer confirmation before admission under the proposed policy below.
6. A family/couple relationship is not guardianship, resource access or consent to external communication. Those permissions must be explicit and purpose-scoped.
7. Account recovery cannot rely on an unverified new destination, reveal account existence, silently trust a new device or preserve all old sessions after a credential reset.

These are design boundaries, not a substitute for the transaction, race, channel and recovery decisions that must precede implementation.

## 5. Decisions and Recommendations

| ID | Choice | Recommendation and tradeoff | Status |
| --- | --- | --- | --- |
| C18-D01 | Initial sign-in methods | Start with email/password plus verified email; support verified phone linking for phone-targeted family invitations. Phone-only sign-in, passkeys and social sign-in need explicit rollout decisions. This avoids making a recycled number the sole recovery credential but adds onboarding friction for phone-first users. | PROPOSED |
| C18-D02 | Identity, verification and delivery providers | Select maintained identity/authentication components and official supported delivery integrations after country, capability, cost, abuse and outage review. No provider or live SMS/email is approved here. | OPEN |
| C18-D03 | Family invitation binding | Target an existing account ID, or a verified phone/email destination claimed after sign-in; use single-use expiring invitations for M1. For a previously unbound destination, require organizer confirmation of the accepting account before activation. This adds friction but avoids equating current number possession with the intended family member. Open multi-use links/QR flows are separate capabilities. | PROPOSED |
| C18-D04 | Recovery and changed/recycled contacts | Require an enrolled recovery route and risk/step-up checks; current phone possession alone must not reveal or recover an unrelated historical account. Define disputed ownership, notification and waiting-period policy before implementation. | OPEN |
| C18-D05 | Verification/session/invitation policy values | Set challenge lifetime, attempt/resend limits, session/refresh lifetime, recent-auth window and invitation expiry before implementation; shorter values reduce exposure but increase friction. Source examples are not production configuration. | OPEN |
| C18-D06 | Account, membership and invitation states | Adopt one reviewed state model; keep mute/preferences separate from membership, and invitation state separate from active membership. Reconcile conflicting chapter enums before database/API generation. | PROPOSED |
| C18-D07 | Age, guardianship, jurisdiction and retention | Select launch ages/regions, lawful representation, personal-data retention and ownership-on-deletion rules with qualified review before real-user release. Family labels cannot establish this authority. | OPEN |
| C18-D08 | Identity assurance for privileged actions | Define recent-auth/step-up requirements for destination changes, recovery, ownership transfer, export, deletion and moderator/admin operations. Do not silently equate any successful OTP with sufficient assurance. | OPEN |
| C18-D09 | Deletion grace period versus revocation | Revoke ordinary sessions, delegations and new scheduled actions when a deletion request is committed, as Chapter 1 requires. A grace period delays irreversible purge, not access revocation. Define a restricted, recently authenticated cancellation path separately. | PROPOSED |
| C18-D10 | Membership, relationship and block policies | Chapter 3 must decide role delegation limits, owner continuity, history on admission, reactivation after removal and shared-group block effects. No implicit privileges from relationship labels or old invitation snapshots. | OPEN |
| C18-D11 | Discovery and handle policies | Choose username normalization/reservation/reuse rules and a reviewed opt-in contact matching design. Do not distribute a global matching secret to clients or treat plain hashes of phone numbers as anonymous. | OPEN |
| C18-D12 | External invitation delivery and consent | Separate a user-requested verification message, an organizer's initial invitation and recurring/marketing communication. Define permitted invitation delivery and required consent under provider and regional rules; otherwise do not send externally. A manual share is not platform delivery evidence. | OPEN |

Only the recommendation is selected for discussion, not approved for implementation. Phone-based family invitations remain in the design even if the first sign-in method is email/password. Rejecting C18-D01 must lead to a revised assurance and recovery contract, not an unreviewed phone-only fallback.

## 6. Identity Records and Ownership

This is a logical model derived from [18.2](Chapter18.md#L45) and [18.22](Chapter18.md#L2030), not executable DDL. The security invariants are contract requirements; table names, identifiers and exact migrations are reviewed in Chapter 6. Use maintained authentication, cryptographic and parsing libraries, not a custom authentication protocol.

| Record or relationship | Ownership and information | Required invariant |
| --- | --- | --- |
| Account -> authentication identities | One immutable internal account can have several enrolled authentication methods. | A trusted provider/issuer and subject maps to at most one account; linking requires authenticated proof, never matching an email claim alone. |
| Account -> contact points | Proposed separate records for encrypted email/phone, normalized lookup identifier, verification time/purpose and binding version. | Raw destinations are private. Define unique current binding and conflicts before implementation; changing a number never changes the account ID or transfers another account's resources. |
| Pending registration -> challenges | Minimal expiring registration attempt, approved credential enrollment and purpose-bound challenges. | Duplicate requests cannot create active duplicates or reserve an identity indefinitely. Verification must not activate credentials previously supplied by an attacker in an unrelated attempt. |
| Account or pending attempt -> verification challenges | Destination binding, purpose, secret digest, expiry, attempts, delivery state, consumed/superseded state. | Atomic bounded attempts and single consumption; a code for one purpose/account/destination cannot prove another. Provider acceptance is not verification. |
| Account -> profile and username | Display name, unique normalized handle, language, IANA timezone, optional region/avatar and field visibility. | Presentation fields never authenticate or grant roles. Atomic normalized-handle uniqueness, reserved-name policy and versioned updates. |
| Account -> devices -> sessions | Revocable device enrollment and independent authenticated sessions, expiry/assurance and refresh lineage where applicable. | Session belongs to its account/device; revocation is server-enforced. Device names, push tokens and fingerprints are not proof of identity. |
| Resource -> memberships -> roles | Account/resource membership, role grants, lifecycle and version. Resource registry or concrete FK scheme is a Chapter 6 choice. | Valid resource and account foreign keys; one current membership per resource/account. No unvalidated polymorphic ID or global admin flag grants arbitrary group authority. |
| Resource -> invitations/join requests | Intended account or destination, inviter, proposed role, state, expiry, token digest and use limit. | Invitation is not active membership. Resource/role/recipient binding cannot be changed by token submission. Final admission and audit/outbox commit together. |
| Account pair -> relationships | Direction, type, visibility, proposer, acceptance, expiry/revocation and separate authority evidence when needed. | No duplicate pending pair/type request under the chosen directionality rule. Accepted family labels still do not establish legal guardianship or care consent. |
| Account -> blocks/mutes/restrictions | Distinct interaction prohibition, notification preference and enforcement scopes. | Mute does not remove membership. Restrictions cannot be cleared by an ordinary profile edit or rejoining a group. |
| Account -> consent history/preferences/endpoints | Purpose/channel/resource/version, grant/revoke evidence, endpoint verification, quiet hours and language. | A preference is not consent; verified destination is not consent; a grant does not cover other purposes or recipients. Current effective permission governs dispatch. |
| Human -> acting identity / Agent delegation | Human initiator, page or Agent identity, resource/action allowlist, expiry, approval policy and revocation. | Effective authority is the intersection of current human, resource and delegation policy. An Agent cannot sign itself into wider access or inherit every user capability. |
| Account -> recovery/export/deletion jobs | High-risk operation identity, recent-auth evidence, versioned request, stages, retention and outcomes. | Durable resumable progress; no export of unrelated group data or false deletion-complete state after only removing the account row. |
| Security events, audit and outbox | Stable actor/action/target/result/time/correlation metadata, scoped access and retention. | Authorized mutation and durable audit/event intent are atomic where required. No raw credentials, OTPs, contact books or session tokens in ordinary events. |

For lookup, a keyed destination identifier with server-controlled key/version can reduce casual disclosure but is not anonymous data or a complete privacy-preserving contact-discovery protocol. Low-entropy phone numbers remain enumerable if keys or unrestricted lookup endpoints are exposed. Never send the global matching key to Android or browser clients.

## 7. Lifecycle and Authorization Rules

[18.3](Chapter18.md#L263) presents a lifecycle diagram and a different state table; [18.11](Chapter18.md#L1154) mixes invitations and muting into membership states. C18-D06 remains open. The following proposed behavior separates concerns rather than declaring those source enums interchangeable.

| State or condition | Allowed behavior | Explicit boundary |
| --- | --- | --- |
| Pending verification | Complete or restart the bound verification flow and abandon the attempt. | No private membership, protected data or general Agent tools. Only minimal bootstrap permissions, not a normal account session. |
| Active account | Actions permitted by current resource membership, visibility, consent and restrictions. | Active is necessary, not sufficient, for protected access. |
| Restricted/locked/suspended/banned | Policy-specific denial or limited recovery, appeal and lawful data-rights routes. | A successful login or OTP cannot clear enforcement. Security lock, suspension and permanent ban are different decisions. |
| Deactivated | Explicit authenticated reactivation and approved recovery/data-rights paths. | No new ordinary actions or active Agent delegation; retained memberships do not authorize background execution while inactive. |
| Deletion requested | Track deletion; use a separately scoped, recently authenticated cancellation/data-rights path if policy allows. | Proposed C18-D09 revokes ordinary sessions immediately. A cancel action does not silently restore old sessions or abandoned Agent runs. |
| Deleted | Minimal retained tombstone/audit required by documented policy only. | No ordinary authentication, reactivation, resource access or retargeting of old invites to a new account with the same contact. |
| Pending invitation/request | Review minimum permitted invitation data and accept/decline or await approval. | Not a member; no chat history, files, member list or Agent context. |
| Active membership | Actions allowed by role and each resource/conversation's policy. | No automatic access to every object or all past messages. |
| Removed/left/expired/suspended membership | Rejoin or appeal only under an explicit policy, where allowed. | A replayed accepted invitation cannot reactivate membership; issued resources and history follow a separately documented retention policy. |
| Muted notifications | Existing authorization remains unchanged. | Suppress selected notifications/feed items only; never use mute as an authorization state. |

For every protected request or queued action, derive the human/service principal from authenticated context, check current account status, current resource authority and target ownership, then apply block/restriction, visibility, consent and delegation rules. Recheck at the transactional execution boundary for writes. Do not authorize from client-supplied account IDs, stale role names or the Agent's prose.

## 8. Primary Identity Workflows

The workflows below are implementation proposals constrained by the source rules. Their acceptance evidence is specified later. They use synthetic accounts during development and do not authorize real OTP delivery or contact access.

### C18-W01 Registration and Credential Enrollment

Source: [18.3-18.5](Chapter18.md#L373). Applies to M1 once C18-D01, C18-D02 and C18-D05 are confirmed.

1. Validate the chosen identifier and credential format, required terms and age/region eligibility; enforce account/IP/device/destination abuse budgets. Contacts, exact location and optional profile fields are not prerequisites.
2. Create or resume a short-lived pending registration operation bound to the initiating browser/app context and idempotency key. Normalize identifiers consistently without merging unrelated accounts. Do not return another account's ID or existence from registration conflict handling.
3. Create a purpose-bound verification challenge and durable delivery intent. Report queued/sent/failed states truthfully; the pending account is not active because an SMS/email provider accepted a message.
4. Verify expiry, attempt limits, destination and operation binding; atomically consume proof. An attacker-created pending signup must not leave its password/social identity attached when the real destination owner completes a different legitimate signup. Re-enroll or confirm credentials within the proven context, invalidate conflicting pending attempts and never auto-merge solely by destination.
5. Commit activation, enrolled identity, initial profile/preferences, security audit and event intent under the reviewed transaction contract. Rotate any bootstrap session into a new authenticated session; the pending handle does not remain a privileged bearer credential.
6. Retry safely through the same operation context. Idempotency records must not store raw passwords/OTPs or replay bearer secrets to a different caller; repeated verification cannot mint unlimited independent sessions.

Use Argon2id with per-password salt and reviewed parameters via a maintained library if local password storage is selected. Offer password-manager/paste support, appropriate strength controls and rate limiting. Never use reversible password encryption, password hints or secrets in request telemetry. Exact password and account-linking policy belongs to C18-D01/C18-D08.

### C18-W02 Challenge, Contact Linking and Destination Change

Source: [18.4.3-18.5.1](Chapter18.md#L470). Required for the selected M1 verification channel; full chapter acceptance includes both email and phone.

- Challenges are bound to purpose, account or pending attempt, channel, canonical destination, binding version and server expiry. For short low-entropy OTPs, use a reviewed keyed verifier or provider-owned verification, not a plain unsalted digest vulnerable to offline enumeration. High-entropy links still need expiry, one-time consumption and protected digests.
- Limit guesses/resends across challenge, destination, account, device and network origin. Issuing a new challenge must not reset the aggregate abuse budget. Atomically check and consume; expired, already used, wrong-purpose or wrong-destination proof fails generically.
- Resend uses a defined current-challenge/supersession policy. Out-of-order delivery must not re-enable old codes. If a delivery worker needs a resendable secret, use a dedicated encrypted short-lived delivery payload with minimal sender access and purge; never an ordinary outbox/log field. Provider state and challenge verification state remain separate.
- Add/change a phone or email only from a current account session with required recent authentication, verification of the new destination and risk checks. Notify established channels where permitted. Competing claims do not automatically unlink another account or merge its resources.
- Increment contact binding version on verified change or revocation; invalidate dependent challenges, pending destination-targeted invites, delivery grants and recovery assumptions as policy requires. Existing account-targeted invitations remain bound to account ID, not a reassigned number.
- Current OTP possession proves control of a channel now, not historical ownership, legal identity or intended family relationship. Recovery and invitations must address SIM swap, recycling and disputed ownership under C18-D04. An unavailable old number is not an excuse to skip that contract.

### C18-W03 Login, Devices and Revocable Sessions

Source: [18.6](Chapter18.md#L596). Required for M1.

1. Validate credentials through the selected provider/library, apply current account restrictions and risk controls, and use generic unauthenticated failures. A provider-subject mapping must validate issuer/audience/signature and the chosen OAuth/OIDC flow; no email-only linking.
2. Create a new revocable server session associated with the authenticated account and device. Recommended internal design: an opaque session handle or a checked session identifier behind validated short-lived tokens; self-contained long-lived JWTs alone cannot provide immediate revocation.
3. Web uses Secure, HttpOnly cookies, an explicit SameSite/CSRF/Origin policy and approved redirect/deep-link destinations. No bearer tokens in URLs or browser localStorage. Android protects stored credentials using Keystore-backed secure storage, not plaintext Room or diagnostic logs; backup/logout rules must cover secrets and account-scoped caches.
4. Rotate refresh/session identifiers atomically, serialize refresh per session and test concurrent legitimate refresh and stolen-token reuse. Do not use unlimited overlap windows. Select the provider's documented replay/retry behavior under C18-D05 rather than improvising a token protocol.
5. Listing sessions reveals only the owner's privacy-minimized device/security metadata. Revoke one, other or all sessions according to the route's promise; a device-wide revoke also invalidates its sessions and push registration as appropriate. Reauth requirements prevent a stolen low-assurance session from silently replacing recovery methods.
6. On revocation, stop further protected HTTP operations, realtime delivery/replay and dependent Agent access under current policy. Client cache clearing is best effort on the next connection; do not promise to erase already downloaded data on an offline or hostile device. Identity-authority unavailability fails closed rather than treating stale cached membership as permission.

### C18-W04 Account Recovery

Source: [18.14](Chapter18.md#L1429). Required before real-user account rollout, even if a controlled M1 demo uses test reset fixtures.

Recovery starts with a generic response, rate limits and an enrolled route selected without public account enumeration. Use recent proof appropriate to the requested account and a risk evaluation; a newly supplied phone/email or Agent-assigned relationship is not a recovery route. A retired number cannot be used as sole proof to recover the historical holder's account.

After successful proof, bind the reset to a one-time scoped operation, update the credential through the maintained identity component, revoke risky sessions/refresh lineages and affected delegations, and notify established permitted channels. Do not preserve every old session or automatically mark a new device trusted. Recovery codes, when supported, are individually protected and single-use; support-assisted recovery needs restricted staff access, documented evidence and audit, not an unrestricted administrator reset button.

If all enrolled methods are unavailable, follow the reviewed recovery policy and expose honest limits; do not bypass controls to avoid a difficult user experience. Restoring login cannot resurrect deleted data, recreate lost E2E encryption keys or guarantee access to old ciphertext. Encryption-key recovery is a separate Chapter 19 decision.

### C18-W05 Targeted Family Invitation and Admission

Source: [18.12](Chapter18.md#L1242). The phone-first family idea is retained, with current identity proof and acceptance rather than automatic admission after installation.

1. The authenticated inviter selects the private Space and an intended account or phone/email destination. The backend checks current invite permission, account restrictions, resource lifecycle, roles they may grant, relevant blocks, quotas and duplicate pending invitations. It does not disclose whether arbitrary numbers have accounts.
2. Create a high-entropy, resource/recipient/role-bound invitation with an expiry, protected token digest and a one-use policy for M1. Capture recipient binding version where known. Owner status is not an ordinary invited role; ownership transfer has its own confirmation and audit flow.
3. Persist the invitation, scoped audit and delivery intent. Send externally only through the separately approved invitation policy in C18-D12. A valid invitation record is not proof that any message arrived. Unsupported delivery remains pending/manual or fails honestly; no unofficial WhatsApp automation.
4. An unauthenticated link/QR opening exposes only a generic invitation entry, not the private Space name, people or content. Keep secrets out of logs, referrers, analytics and preview crawlers; use approved app/web links, no-store behavior and a token-consumption POST. A GET or link preview must not accept an invite.
5. After installation/sign-in, prove the intended account or current destination binding before showing the minimum consent/review surface. Present the permitted Space title, inviter, proposed role, privacy/history implications and accept/decline controls; still do not expose member lists, files or chat history.
6. Under proposed C18-D03, a previously unbound destination needs the organizer to confirm the accepting account before activation. Acceptance records intent while that review is pending, with no active membership. Organizer confirmation requires current authority and shows only the minimum accepting-account information. If this additional gate is rejected, a documented alternative must address wrong-person/recycled-number admission risk.
7. On final admission, use one transaction to serialize against invitation consumption/revocation and the resource's membership/capacity changes. Re-evaluate current inviter authority, recipient eligibility/contact binding, block/policy/role/expiry/version and roster limits, then commit membership, consumed invitation, audit and outbox. The inviter's old login session need not still exist; their current account and authority must still permit the invitation.
8. Database uniqueness and resource-level serialization enforce one active membership and, for a couple, no more than two active humans even when different invitations race for the final slot. Invitation row locks alone do not serialize different invitations to the same Space. No ordinary acceptance bypasses a ban, reactivates a removed member or overwrites a stronger role.
9. A repeated acceptance by the same authorized actor returns a safe canonical result only if current policy allows it. It must not re-add a member who later left or was removed, nor disclose stale private payloads cached in an idempotency response. Expired/revoked/wrong-recipient links return safe failures. Race and retry outcomes need real database tests, not count-then-insert mocks.

For an existing account invitation, bind to immutable account ID; later phone reassignment cannot retarget it. For a not-yet-registered phone invite, proof of current possession plus the proposed confirmation gate reduces risk but does not certify legal identity. History, rejoin rules, temporary expiry and exact cancellation/acceptance ordering are finalized with Chapter 3.

### C18-W06 Profiles, Handles and Optional Contact Discovery

Source: [18.7-18.9](Chapter18.md#L686). Basic profile/timezone and field privacy are M1; optional discovery is full-domain work, not an onboarding prerequisite.

Use non-unique localized display names for presentation and a separately normalized unique handle for lookup. Specify normalization, length, reserved names, impersonation review and rename/reuse policy before migrations; two visually similar names are not automatically the same account. Version updates and unique indexes must handle concurrent handle claims.

Profile visibility is per permitted field/audience. Phone, email, private memberships, relationships, security events, exact location and Agent memory are private by default, including in profile caches/search. Coarse region, avatar and timezone exposure require their own policy; public posts do not make the author account's private fields public.

If contact discovery is enabled, show its purpose and retention, accept denied/limited/revoked OS permission and minimize data. Return only discoverable permitted matches, with anti-enumeration budgets, opt-out and deletion. No implicit relationships, invitation sending or group access. Simple phone hashes and large unbounded batched lookups are not an adequate privacy design. C18-D11 gates implementation of the matching protocol.

### C18-W07 Relationships, Join Requests, Roles and Ownership

Source: [18.10-18.13](Chapter18.md#L1008). Basic invitation and scoped roles are M1; full relationship types and configurable join policies follow the release matrix.

Relationships are proposed, accepted or declined, and later revocable/expiring with explicit visibility and direction. Deduplicate pending requests; sensitive guardian/dependent authority requires its own legal/verification model. A couple relationship or trusted-contact label does not expose all personal messages, files or memory. Consent to receive selected reminders is a separate grant.

For a resource that permits join requests, an authenticated requester submits without private-content disclosure, and an authorized reviewer approves/rejects. Final admission uses the same invariants as invitations. A private family Space does not become publicly discoverable just because the common join-request infrastructure exists.

Role changes and removal check current actor/target roles, resource version, owner protection and policy under a transaction. Owner transfer requires current owner step-up, recipient acceptance, a confirmation summary and audited atomic ownership change; do not leave an ownerless active Space or two unintended owners. Prevent self-escalation and an Agent or admin granting powers outside its authority. Complete the role hierarchy, leave/removal and blocked-account matrix in Chapter 3 before code.

### C18-W08 Blocking, Consent and Communication Preferences

Source: [18.17](Chapter18.md#L1663) and [18.21](Chapter18.md#L1951). Required for exposed interactions; detailed channel delivery belongs to Chapter 20.

Blocking governs prohibited interaction, muting governs chosen notifications/feed visibility, and restrictions govern policy-limited capabilities. Define server behavior for DMs, invitations, follows, comments, profile lookup, shared groups, scheduled delivery and Agent tools. Blocking does not promise removal of already shared group history. A muted member remains a member; a restricted member cannot clear enforcement by toggling preferences.

Store consent as versioned purpose/channel/resource evidence with revocation, not one account-wide boolean. Evaluate the current intended recipient, verified endpoint, purpose and consent before new dispatch; group admins cannot opt another person into WhatsApp, calls or marketing. Enrollment OTPs and initial invitations use an explicitly reviewed policy, not automatic permission for future messages. Keep notification settings, OS push permission, delivery-address verification and consent distinct. Revocation prevents subsequent authorized actions but cannot recall a message already delivered to an external provider.

### C18-W09 Deactivation, Deletion and Export

Source: [18.15-18.16](Chapter18.md#L1491). Account deletion and export remain proposed full-MVP obligations in C1-O16; they are not implemented by an account-row delete or a JSON dump.

Before destructive action, require online recent authentication and show owned/shared resources, schedules, integrations and irreversible effects. Deactivation is reversible and prevents new ordinary use as defined by policy, while retention and reactivation remain explicit. It is not deletion.

For deletion, C18-D09 proposes committing the deletion request together with ordinary session/delegation revocation and prevention of new authorized actions. A grace/cancellation window may delay purge only. The source Chapter 18 flow places revocation later; [Chapter 1's safety acceptance](Chapter1.md#L4409) requires it at request time. This proposed reconciliation is not silently approved. Cancellation needs a narrowly scoped reauthentication route because old sessions are already revoked.

Run an idempotent resumable purge across account/profile/contact data, eligible authored/shared content, private objects and derivatives, Agent memory/checkpoints, provider integrations, search/caches and scheduled work. Track domain checkpoints, retries, legal holds and disclosed backup expiry. Resolve sole ownership before deleting its principal; archival/transfer requirements must not retain unwanted ordinary login as a workaround. Do not mark complete until required domains finish; retained legal/audit/backup categories and downstream provider limitations are disclosed.

For export, use recent authentication, explicitly selected eligible categories and current permission checks when collecting and downloading. Generate an encrypted private archive, bounded resumable job and short-lived authenticated delivery. A presigned URL alone cannot guarantee immediate revocation; choose an authenticated access gateway or explicitly reviewed expiry model before implementation. Recheck on recovery/role/deletion changes, audit access, expire archives and remove derivatives. Do not export another person's private files/messages merely because the requester once belonged to their group. E2E message export needs the selected key/access model; server plaintext export cannot be promised for opaque ciphertext.

### C18-W10 Page Identities, Badges and Agent Delegation

Source: [18.18-18.20](Chapter18.md#L1736). Page attribution is public-community MVP; organization identities and advanced verification follow the release matrix; controlled Agent delegation comes after M1.

Record both the authenticated human initiator and the separately authorized acting page/organization identity. A selected page avatar in the UI is not authorization. Badges communicate their actual verification method; verified email/phone is not proof of real-world identity, safety or expertise and never bypasses permissions.

An Agent has its own identity and expiring/revocable delegation with resource/action scope, owner, policy and approval constraints. Enforce the intersection of current user and delegated permissions at every retrieval/tool execution, including after durable checkpoint resume. Pending approvals bind the exact payload/recipient/action and cannot survive policy change as unrestricted authority.

Revoking delegation prevents subsequent tool calls and cancels/pauses affected runs; record and reconcile already in-flight side effects rather than promise to undo them. UI and audit distinguish a human action, Agent draft, approved Agent execution and scheduler action. Chapter 18's general ability to authorize external messaging does not override Chapter 1's MVP prohibition on Agent external messages, calls, health-record access, permission changes, removal or financial actions.

## 9. API and Transaction Handoff

Source route families are in [18.23](Chapter18.md#L2097). The routes below retain source-relative spellings, except operations explicitly labeled as contract gaps. Chapter 18 proposes `/api/v1`, while other chapters use `/v1`; C1-D06 and C18-D06 require one canonical contract before clients or an OpenAPI document are generated. This table specifies behavior, not a second API envelope or implemented endpoints.

| Operation family | Source-relative routes or gap | Request and successful result | Authorization, retry and failure contract |
| --- | --- | --- | --- |
| Registration | `POST /auth/register` | Selected identifier, enrollment data and bounded pending-operation context; return a safe pending result, not another account's record. | Unauthenticated abuse controls, context-bound idempotency and generic existing-account handling; no credential/OTP logging or cross-caller cached secret response. |
| Verification | `POST /auth/verify-email`, `/auth/verify-phone`, `/auth/request-otp`, `/auth/verify-otp` | Challenge reference and proof for a server-bound purpose; consume once and return the permitted next state. | Validate binding, expiry, attempts and current operation. Neither a supplied `account_id` nor a caller-chosen purpose changes what proof authorizes. |
| Login and refresh | `POST /auth/login`, `/auth/refresh`, `/auth/logout` | Credentials or current refresh/session proof; establish, rotate or end the relevant session through the selected auth component. | Generic unauthenticated failure, current account policy, CSRF where applicable, replay/race handling and no automatic unsafe mutation retry. |
| Sessions and security | `GET /me/sessions`, `DELETE /me/sessions/{session_id}`, `POST /me/sessions/revoke-others`, `GET /me/security-events` | Owner-filtered session metadata and explicit revocation scope. | Session IDs are not authority. Confirm the behavior of current-session and device-wide revocation; device management beyond these routes is a contract gap. |
| Profile and privacy | `GET /me`, `PATCH /me`, `GET /profiles/{username}`, `PATCH /me/profile`, `/me/privacy`, `/me/preferences`, `POST /me/avatar`, `DELETE /me/avatar` | Narrow allowlisted changes and policy-filtered profile representation; use version-aware updates. | Reject mass assignment of roles, account status, consent or verification. Public lookups cannot reuse an owner's private cached projection; avatars follow the file validation pipeline. |
| Contact changes | Contract gap: add/change/remove email or phone and enroll/revoke recovery factors. | Authenticated contact-change operation, required step-up and new-destination verification; finish only after reviewed binding/conflict policy. | No arbitrary provider subject/verified flag from clients. Handle last recovery method, pending invitations, existing grants and notification of prior channels. |
| Invitations | `POST /resources/{resource_id}/invitations`, `GET /invitations`, `POST /invitations/{id}/accept`, `/decline` | Intended account/destination and permitted role; return policy-filtered pending/admitted/declined result. | Current inviter/recipient checks, token binding, deduplication and admission transaction. Revoke, resend, safe link exchange and organizer confirmation are explicit route gaps, not invented available APIs. |
| Membership and requests | `GET /resources/{resource_id}/members`, `POST /resources/{resource_id}/join-requests`, `POST /join-requests/{id}/approve`, `/reject`, `PATCH /memberships/{id}/role`, `DELETE /memberships/{id}` | Scoped roster and versioned role/removal/admission changes with canonical state. | Current target/actor permissions, ban and owner protection, resource capacity and audit. Define leave versus removal semantics; source ownership-transfer routes are a gap. |
| Relationships | `POST /relationships/requests`, `GET /relationships`, `POST /relationships/requests/{id}/accept`, `/decline`, `PATCH /relationships/{id}`, `DELETE /relationships/{id}` | A purpose/type/direction-bound proposal and explicit response or revocation. | Only eligible parties; server controls state transitions. Updating a label never establishes guardianship or elevates shared-resource authority. |
| Recovery | `POST /auth/recover`, `/auth/reset-password` | Generic initiation; scoped proof plus credential reset through the selected method. | Enumeration resistance, enrolled route, rate/risk/step-up controls, token single-use and session/credential epoch revocation. |
| Lifecycle and export | `POST /me/deactivate`, `/me/reactivate`, `/me/delete-request`, `DELETE /me/delete-request`, `POST /me/export`, `GET /me/export-jobs`, `/me/export-jobs/{id}` | Recently authenticated intent and canonical job/progress result; narrow reactivation/cancellation path where approved. | No unrestricted session restored by cancel; no private archive in ordinary API cache. Deletion-status and authorized archive download mechanisms need explicit contracts. |
| Agent identity and delegation | `GET /agents`, `POST /agents`, `GET /agents/{id}`, `PATCH /agents/{id}`, `POST /agents/{id}/delegations`, `GET /agents/{id}/delegations`, `DELETE /agents/{id}/delegations/{delegation_id}` | Owner-controlled Agent metadata and a validated subset of resource/action authority. | Owner/current-resource permission plus delegation policy; reject excessive scopes, self-escalation and MVP-prohibited tools. Revocation affects subsequent authorized execution. |
| Other identity controls | Contract gaps: blocks, mutes, restrictions, consent grant/revoke/history, contact discovery and privileged identity verification. | Separately authorized operations with purpose, target, effective state and history. | Profile or preferences patches must not stand in for consent, moderation or role APIs. Preserve subject privacy and audit sensitive access. |

All successful writes derive actor identity from authentication; client actor IDs are either rejected or treated as non-authoritative data. For unauthenticated endpoints, request IDs and challenge IDs are not account proof. Define bounded pagination for session, invitation, member, security-event and export lists. Errors distinguish safe validation, unauthenticated, forbidden, conflict, expired proof, rate limit and unavailable dependency without revealing private account existence or raw provider errors; HTTP status and envelope choices are finalized once in Chapter 7.

### Concurrency and Revocation

- Registration/challenge consumption, refresh rotation, invite admission, role/ownership changes, consent changes and lifecycle requests each need an explicit transactional execution point and safe retry contract. An idempotency key alone does not enforce atomicity or authorization.
- Recommended write pattern: authenticate, authorize current state, serialize/check expected versions, apply the business change and audit/outbox intent together, commit, then publish asynchronously. Preserve actor and scope binding when reconciling retries; do not return an old sensitive cached response after access is revoked.
- For invitation acceptance versus revocation, a removed inviter versus admission, and two simultaneous couple admissions, document which transaction commits first and what the losing request returns. Distinct invitations for the same resource need a shared admission constraint/lock, not isolated invitation locks alone.
- A revocation committed before a protected operation's authorization boundary must deny that new operation. Previously committed work and data already in transit cannot be retroactively erased. WebSocket delivery, exports, delayed notifications and Agent tools need a current-policy check at their respective sensitive boundaries, plus bounded invalidation and observable enforcement.
- Do not allow a stale cache to override a durable revocation. If current identity/authorization state cannot be established, protected operations fail closed. Public eligible content and already-authorized offline local display have separately stated limitations; neither is proof of live authorization.

### Events, Secrets and Provider Failure

Use the [18.24 event contract](Chapter18.md#L2206): event ID/type, aggregate type/ID, human actor, acting identity, timestamp, schema version and correlation ID. Registration-pending, account activation, invitation creation and actual membership admission are distinct events. A subscriber must not treat `invitation.created` or a provider callback as `membership.created`.

Publish state-changing domain events from durable outbox intent; consumers deduplicate and revalidate their own action. Record safe event metadata and result/error categories, not passwords, OTPs, tokens, recovery codes, full contacts, private relationship labels or sensitive message contents. Pseudonymous IDs and destination digests remain protected data with retention and scoped audit access.

Delivery/provider failure must not silently verify an identity, admit a user or switch to a weaker channel. Keep the pending challenge/delivery state, apply controlled retries and only offer separately enrolled/approved alternatives. Follow [18.29](Chapter18.md#L2676) for resumable lifecycle jobs, role version conflicts and stopped Agent delegation. Scope audit visibility separately from ordinary product analytics.

## 10. Android and Web Experience Contract

The [Android inventory](Chapter18.md#L2291) and [web settings routes](Chapter18.md#L2431) remain source requirements. This is a consolidated flow/state specification, not a claim of screens, Figma assets or prototype implementation.

| Flow surface | Required behavior and states | Release applicability |
| --- | --- | --- |
| Welcome, register and login | Chosen methods, privacy/terms, password-manager support; submitting, safe validation, throttled, verification required, unavailable provider and locked/restricted account. No account enumeration through different errors. | M1 after initial-method decision. |
| Email/phone verification and OTP | Mask only an already-authorized destination, clear purpose, server expiry/resend status, wrong/expired/used proof and accessible retry. Never display a code obtained from backend logs. | M1 for chosen proof; full chapter requires both channels. |
| Profile, handle and privacy | Localized display name, original/normalized username handling, timezone/language, avatar processing and a preview of the selected audience. Preserve safe drafts and show save conflicts. | Basic profile/settings in M1; wider visibility fields by release scope. |
| Devices, sessions and security events | Own active sessions, approximate metadata, current device distinction, revoke one/others, confirmation and re-login after revocation. No false claim of erasing an offline device. | M1 basic session control; advanced factors after selection. |
| Recovery, password/contact change | Enrolled-method recovery, generic initiation, required recent auth, failed proof/risk review, expired operation and notification of sensitive change. Distinguish login recovery from E2E-key recovery. | Contract required before real users; only selected methods shown. |
| Invitations and member management | Generic unauthenticated landing; identity proof before private preview; accept/decline and pending organizer confirmation if adopted; invalid/revoked/expired/wrong-account states. Version-aware role/removal actions and denied deep links. | Targeted family invitation in M1; additional Space policies later. |
| Relationships, join requests and contacts | Explicit requests, acceptance/revocation, scoped permissions and opt-in discoverability. Denied/limited/revoked contacts permissions preserve core usability. | Full domain/release decision, not required for the manual M1 invite. |
| Communication preferences and consent | Separate channel verification, OS permission, consent purpose/scope/history and mute/preferences. Show revoked grants and unavailable channels without silently enrolling alternatives. | Needed for exposed M1 channels; others separately approved. |
| Deactivation, deletion and export | Recent auth, affected-resource review, explicit confirmations, queued/running/partial/failed/retry/complete states, retained-data explanations and protected expiring download. | Full MVP privacy/data-rights gate; no pretend instant completion. |
| Acting identity and Agent settings | Clearly distinguish human, page, Agent, approved action and scheduled automation; inspect/revoke permitted delegation. Badge labels state what was verified. | Public/Agent milestones, not M1 Agent implementation. |

Every primary screen needs loading, success, applicable empty state, error/safe retry, expired session and current permission-denied behavior. Define accessible labels/focus, keyboard navigation, readable font scaling, localization/RTL, responsive constraints, back/deep-link handling and unsaved changes. Do not depend on color or hover alone.

Android follows ViewModel/StateFlow/repository and permitted account-scoped Room caches; secrets use approved Keystore-backed storage. Web uses the shared typed backend contracts and secure cookie/CSRF controls. Cached profile display can work offline with a stale-state indication; identity changes, invitation admission, role changes, consent grants, export and deletion require online confirmation. WorkManager retries/polls approved jobs, not unattended credential resets or offline acceptance of sensitive actions. Backgrounded or cancelled screens must not leak secrets into saved UI state.

## 11. Acceptance Evidence Matrix

Every source acceptance criterion is mapped below to planned proof. All C18-V scenarios are NOT RUN. They are scenario families, not an asserted number of implemented test functions. Full-chapter acceptance is broader than M1; a deferred capability remains explicitly unverified and must not be marked complete.

| Check | Source acceptance | Workflow | Required evidence, including negative cases |
| --- | --- | --- | --- |
| C18-V01 | C18-A01 | C18-W01, C18-W03 | Real Android/web registration and login using selected components; duplicate concurrent enrollment yields one valid identity binding. Attacker preregistration cannot retain its credential after the victim proves a different legitimate enrollment. Failed/unknown account responses do not expose existence. |
| C18-V02 | C18-A02 | C18-W02 | Each supported email/phone flow tests expiry, purpose/account/destination mismatch, consumed/superseded code, parallel guesses, bounded resend and provider failure. Two concurrent valid verifications cannot consume a proof twice; one channel cannot satisfy another purpose. |
| C18-V03 | C18-A03 | C18-W03 | List/revoke only owned sessions/devices; revoke current/other/device as promised. Concurrent refresh and stolen-token reuse follow reviewed rotation policy. Revocation denies the next protected HTTP/realtime boundary and cannot be defeated by cached account state. |
| C18-V04 | C18-A04 | C18-W06 | Field/audience matrix for own, public, connection, shared-Space and stranger views where supported. Private email/phone/relationships/memberships stay out of unauthorized responses and warmed profile/search caches. |
| C18-V05 | C18-A05 | C18-W06 | Atomic handle uniqueness under normalization/case/Unicode and parallel claims; reserved names, rename conflict and old-name policy are tested without treating display names as identity. |
| C18-V06 | C18-A06 | C18-W06 | Denied/limited/revoked OS contacts access leaves registration/Space/Agent use functional. Matching respects hidden users/opt-out and limits; scraping, public hash reversal and exporting a shared matching key are excluded from the design. |
| C18-V07 | C18-A07 | C18-W07 | Propose, accept, decline, expire and revoke relationships; wrong recipient, duplicate pending request and actor spoof fail. Revocation prevents later uses of relationship-dependent grants under defined policy. |
| C18-V08 | C18-A08 | C18-W07 | Family/couple/trusted/custom directions and visibility work as defined. Self-declared guardian or partner labels cannot read private messages, care records, files or change recovery credentials. |
| C18-V09 | C18-A09 | C18-W05, C18-W07 | Real database concurrent admission tests enforce one membership per resource/account and at most two couple humans. Invite retries do not restore a removed/banned member or overwrite roles. |
| C18-V10 | C18-A10 | C18-W05 | Expiry, revocation, wrong identity, forwarded link, reused token, duplicate issuance, inviter removal and role/capacity change all obey current policy. Previously unbound recipients stay pending until the proposed confirmation, if adopted. Token-bearing GET/prefetch cannot admit anyone. |
| C18-V11 | C18-A11 | C18-W07 | Approved join policy, reviewer authorization, accept/reject races, generic pre-admission views and duplicate prevention; private family resources never become discoverable through join-request lookup. |
| C18-V12 | C18-A12 | C18-W05, C18-W07 | Actor/target/resource permission matrix, mass-assignment rejection, cross-Space IDs, forbidden role grants and concurrent owner changes. Owner transfer uses intended recipient acceptance and no ownerless active resource. |
| C18-V13 | C18-A13 | C18-W04 | Recovery enumeration, replay, abusive retries, compromised session, new unverified destination, lost factors, SIM swap/recycled number and support override attempts. Successful reset revokes affected sessions and cannot restore lost encryption keys automatically. |
| C18-V14 | C18-A14 | C18-W09 | Separate deactivation/reactivation, deletion and export workflows with recent auth. Committed deletion request revokes ordinary sessions under proposed C18-D09; grace cancellation uses narrow reauth and does not resurrect prior sessions. |
| C18-V15 | C18-A15 | C18-W08 | Approved block/mute/restriction matrix across HTTP, realtime, invitations, cached profiles, Agent tools and delayed delivery. Muting does not remove access; blocking does not rewrite shared history. |
| C18-V16 | C18-A16 | C18-W10 | Human actor and acting page/organization remain attributable; missing/revoked page role fails despite a supplied acting identity. Verification badges convey only the proven fact and never bypass authorization. |
| C18-V17 | C18-A17 | C18-W10 | Excessive, expired, wrong-resource or revoked Agent delegation fails, including between draft/approval/execution and after checkpoint resume. Already in-flight external outcomes remain explicit rather than fabricated undo. |
| C18-V18 | C18-A18 | C18-W08 | Purpose/channel/resource/version history, grant/revoke and endpoint binding survive retry/concurrency. Preferences, contact possession, group-admin actions or OTP delivery cannot create unrelated consent. |
| C18-V19 | C18-A19 | C18-W01, C18-W02, C18-W03, C18-W09 | Inspect controlled success/failure traces, URLs, outbox, errors, crash reports and exports for sentinel passwords/OTPs/tokens/contact books. Only approved protected delivery payloads contain transient secrets. |
| C18-V20 | C18-A20 | C18-W03, C18-W08, C18-W10 | Observable safe security events and correlation across commits/workers; ordinary members cannot browse security/audit events. Alert tests cover failed-login/OTP abuse, revocation and unauthorized delegation without raw sensitive labels. |
| C18-V21 | C18-A21 | C18-W09 | Crash/resume deletion/export at domain boundaries; preserve completed checkpoints, purge expired archives and derived data, report holds/failures honestly. Permission changes before collection/download prevent unauthorized archive release. |
| C18-V22 | C18-A22 | C18-W01, C18-W03, C18-W05 | One agreed OpenAPI/error/version contract consumed by Android/web; explicit web cookie/CSRF and mobile credential handling differences. Deep links, expired sessions, duplicate submit, offline states and access denial meet the same domain behavior. |
| C18-V23 | C18-A23 | C18-W03, C18-W04, C18-W05, C18-W07, C18-W09 | Repeatable unit, real PostgreSQL transaction/race, API/auth, client and end-to-end suites cover authorization, recovery, membership changes and deletion. Record commands, artifacts, environment, skips and failures; mocks alone do not prove uniqueness/revocation/durability. |

Use synthetic destinations and controlled clocks for deterministic tests. Label simulated verification/delivery as simulated; test inbox access is not proof of official provider reachability or production abuse controls. Live delivery, real family contacts and personal-device data require their own authorization. No tests or provider calls were executed to create this plan.

## 12. Developer Handoffs and Demo

| Ticket | Accountable role | Depends on | Bounded deliverable and review evidence |
| --- | --- | --- | --- |
| C18-T01 | Product/identity lead, Teams A and C | C1-T01 and product decisions | Resolve initial methods/providers, C18-D01 through C18-D12 as needed for the selected release; label remaining open constraints. Produce approved assurance/channel/lifecycle policy, not a list of assumed providers. |
| C18-T02 | Security/data architect, Teams C and E | C18-T01 | Threat model and identity/verification/session logical records with transaction/retention rules; Chapters 6/7 contracts, role/state reconciliation and no-secret logging design. |
| C18-T03 | Authentication engineer, Team C | C18-T02 | Implement selected maintained auth component, enrollment and purpose-bound verification; API contracts and focused C18-V01, C18-V02, C18-V19 evidence. No live-send claim from a simulator. |
| C18-T04 | Session/recovery engineer, Team C | C18-T03 | Implement revocable session/refresh/device and recovery flows; C18-V03, C18-V13, C18-V20 plus fault/replay evidence. Keys/E2E recovery remain a separate contract. |
| C18-T05 | Spaces engineer, Team C | C18-T02, C18-T03; Chapter 3 admission policy | Implement targeted invitations and atomic membership operations, explicit recipient confirmation if approved, role/owner controls and source event intent; C18-V09 through C18-V12 on a real database. |
| C18-T06 | Profile/privacy engineer, Teams C and E | C18-T02, C18-T04 | Implement selected profile/handle/privacy, block/mute and scoped consent surfaces; C18-V04, C18-V05, C18-V15, C18-V18. Optional discovery/relationships require separate reviewed tickets, not silent bundled implementation. |
| C18-T07 | Data-rights engineer, Teams C and E | C18-T04, C18-T05, C18-T06 | Implement reviewed deactivation/deletion/export with owned-resource policy, narrow reauth and resumable stages; C18-V14, C18-V19 and C18-V21. |
| C18-T08 | Android lead and product designer, Teams B and A | C18-T02; C18-T03 through C18-T07 for applicable integrated acceptance | Implement selected identity surfaces using shared contracts, safe storage and lifecycle states; unit/Compose/integration and accessibility evidence for C18-V22. |
| C18-T09 | Web lead and product designer, Teams B and A | C18-T02; C18-T03 through C18-T07 for applicable integrated acceptance | Implement matching web flows, cookie/CSRF/Origin/redirect/privacy controls and responsive states; component/browser/security evidence for C18-V22. |
| C18-T10 | Agent engineer with security reviewer, Teams D and E | C18-T02, C18-T04, C18-T05, C18-T06; controlled-Agent milestone | Implement only permitted acting identity/delegation and revocation checkpoints; C18-V16, C18-V17, C18-V20. This is not authorization to add Agent code to M1. |
| C18-T11 | QA/security lead, Team E | C18-T03, C18-T04, C18-T05, C18-T06, C18-T07, C18-T08, C18-T09; C18-T10 when released | Integrate applicable evidence families and cross-client demo; record deferred capabilities and unverified providers. Release sign-off needs product/security acceptance, not only structural document checks. |

Tickets are handoff packages to split into reviewable changes, not staffed people or executed subagents. Each implementation delivers source/requirement IDs, owner/dependencies, API and migration notes, failure/race cases, tests and commands, applicable ADR, operational/security runbook, demo steps and known limitations. Documentation-only decisions must not claim executable evidence.

Proposed identity demo: create and verify organizer -> sign in on Android/web -> create private family via the Chapter 3 contract -> invite a synthetic intended account/phone -> demonstrate wrong-account and expired-link denial -> accept and confirm recipient if required -> show one canonical membership after retry -> revoke a session and deny further access -> demonstrate enrolled recovery and safe security notice. Separately demonstrate account-data lifecycle in a disposable fixture, never by deleting a real user account. An identity demo does not complete the task/reminder workflow by itself.

## 13. Decisions, Risks and Next Chapter

| Mistake | Impact | Required boundary |
| --- | --- | --- |
| Use phone/email/handle as the account primary key. | Contact change or recycling can corrupt ownership or target the wrong person. | Immutable internal identity and versioned contact bindings. |
| Activate a pre-existing pending password only because someone clicked a verification link. | An attacker can pre-register the victim's address and retain login credentials. | Bind proof to legitimate enrollment and re-enroll/confirm credentials with conflicting attempt invalidation. |
| Admit whoever holds a forwarded family invitation URL. | Private group data reaches the wrong account. | Intended account/destination proof, resource/role binding and the proposed confirmation for unbound recipients. |
| Treat JWT expiry, client logout or device name as revocation security. | Stolen sessions retain access until expiry or can impersonate another device. | Checked server revocation, validated device/session binding and protected-operation authorization. |
| Give contact-discovery clients a shared global hashing key. | A public app can be used to enumerate the platform's phone-number set. | Reviewed minimized matching protocol, server-held secrets where used, discoverability policy and abuse controls. |
| Use a group role or relationship label as recovery/health permission. | Account takeover or sensitive family-data disclosure. | Independent enrolled proof, explicit authority and purpose-scoped consent. |
| Treat an approval or Agent delegation as permanent authority. | Revoked users or changed scopes can still execute saved actions. | Recheck current user, resource, delegation and approval at sensitive execution boundaries. |
| Delay revocation until deletion finishes or report purge too early. | Supposedly deleted accounts can act or personal derivatives remain undisclosed. | Proposed immediate ordinary-access revocation plus resumable audited purge and honest retained-data status. |

The remaining choices are deliberate decision points, not forgotten requirements. In particular, initial sign-in methods and providers, previously unbound phone-invitation confirmation, recovery assurance, lifecycle grace behavior, age/region policy and authorization state names must be settled before dependent implementation. No numerical security limits, legal compliance, vendor features or delivery guarantees are inferred from examples.

Next: [Chapter 3](Chapter3.md) to define Space ownership, role hierarchy, invitation admission, couple capacity, shared/private conversation visibility, history on joining/leaving, removal/rejoin and temporary expiry. Carry these rules into [Chapter 6](Chapter6.md) relational constraints and [Chapter 7](Chapter7.md) canonical API/event contracts, with [Chapter 11](Chapter11.md) security and [Chapter 19](Chapter19.md) encryption decisions alongside. The Chapter 1 release scope remains a draft pending confirmation.