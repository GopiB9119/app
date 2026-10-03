# Contract Reconciliation and Decision Handoff

Status: DRAFT FOR PRODUCT, TECHNICAL, SECURITY AND DATA-RIGHTS REVIEW. This records working-document routing, proposal reconciliation and targeted source coverage, not accepted product policy, generated schemas or implementation readiness.

## 1. Scope and Authority

- Preserve the original sources and all four Chapter 19/20 drafts. No file is deleted, renamed or silently merged. The fuller messaging and completed delivery drafts are the working review references; the other files retain their alternative proposals and source material.
- Working-reference selection is documentation organization only. OPEN/PROPOSED choices remain unapproved, and the original source plus owning domain requirements remain authoritative inputs. A matching identifier number in two files does not mean the same requirement.
- The five existing ADRs remain PROPOSED. Reconciliation corrects inaccurate status/artifact claims and aligns the recommended milestone order; it does not record Founder, technical, security, data-rights or specialist approval.
- The first milestone remains the proposed manual synthetic family task and confirmed one-time in-app reminder on Android and core web. It is not the full MVP, Agent implementation, real care workflow or evidence of push/email/provider delivery.
- This task changes planning documents only. No code, generated contracts, CI, credentials, devices, messages, payments, deployments or runtime/security tests are authorized or claimed.
- The Chapter 2/4/5 review below maps source topics, selected exact catalogs, operations and acceptance/test lists to existing owners. All nine follow-ups now have an owning draft or concrete qualification handoff; unresolved decisions, schema publication and runtime evidence remain gates, not implied completion.

## 2. Working Review References

Aliases below qualify IDs in this index. Elsewhere, cite the file and ID together; do not copy an unqualified `C19-D07` or `C20-B01` into a ticket and assume it is globally unique.

| Alias | File | Document role |
| --- | --- | --- |
| MSG | [CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md](CHAPTER_19_MESSAGING_ENCRYPTION_CONTRACT.md) | Working messaging review reference: source catalogs, twelve workflows, thirty-two proposed verification families and explicit protocol/history/device gates. |
| ALT19 | [CHAPTER_19_CONVERSATIONS_ENCRYPTION_CONTRACT.md](CHAPTER_19_CONVERSATIONS_ENCRYPTION_CONTRACT.md) | Retained alternate proposal. Its local decisions and simplified type/mode/API choices require review; its handoff evidence now explicitly references MSG. |
| DEL | [CHAPTER_20_DELIVERY_CONTRACT.md](CHAPTER_20_DELIVERY_CONTRACT.md) | Working delivery review reference: completed provider/retry/consent/escalation workflows, source inventories, retained route proposals and proposed verification/handoffs. |
| ALT20 | [CHAPTER_20_NOTIFICATION_DELIVERY_CONTRACT.md](CHAPTER_20_NOTIFICATION_DELIVERY_CONTRACT.md) | Retained partial alternate through six workflows. It contains useful source catalogs and alternative decision organization, not a second approved delivery engine or completed provider suite. |

All four remain design drafts. The working files' verification rows are plans, and their synthetic fixtures only check finite document properties. Historical document checks do not establish live message delivery, cryptographic security, consent enforcement or qualified operational readiness.

## 3. Chapter 19 Crosswalk

The following decision mapping is semantic, not an assertion of equivalence. Preserve the original ID/status in each file; related decisions can have different granularity and approval state. All fourteen alternate decisions have a review destination.

| Alternate decision | Related working decisions | Reconciliation needed |
| --- | --- | --- |
| ALT19:C19-D01 | MSG:C19-D01, MSG:C19-D07 | Conversation/parent/history policy and cryptographic device membership are separate; no automatic Space-to-conversation admission. |
| ALT19:C19-D02 | MSG:C19-D02 | Use one non-null canonical human/Agent/system sender and stable logical message receipt, not nullable-account deduplication. |
| ALT19:C19-D03 | MSG:C19-D02, MSG:C19-D03, MSG:C19-D13 | Commit-safe message order differs from event cursor, resource version and local sync transaction. |
| ALT19:C19-D04 | MSG:C19-D04, MSG:C19-D12 | Choose device/participant receipt coverage and privacy; a group high-water cursor is an optimization requiring proof, not a complete read model. |
| ALT19:C19-D05 | MSG:C19-D05, MSG:C19-D06 | Protocol selection and conversation-mode defaults are both OPEN; server-readable-first is not an adopted MVP default. |
| ALT19:C19-D06 | MSG:C19-D05, MSG:C19-D07, MSG:C19-D08 | Separate protocol, enrolled endpoint authority, history grants and recovery custody. Login recovery is not decryption-key recovery. |
| ALT19:C19-D07 | MSG:C19-D09 | Agent disclosure design, including no access, remains OPEN. MSG:C19-D07 instead concerns device/cryptographic membership. |
| ALT19:C19-D08 | MSG:C19-D13 | Queue only released offline operations; local data/cursor/outbox and actual crypto state need crash-safe compatible persistence. |
| ALT19:C19-D09 | MSG:C19-D10 | Exact edit/delete/report authority, tombstones and retained-history limits; no guarantee to erase already delivered plaintext. |
| ALT19:C19-D10 | MSG:C19-D06, MSG:C19-D11 | Scanning/search/thumbnail capabilities depend on actual plaintext availability; opaque ciphertext cannot receive a fabricated clean verdict. |
| ALT19:C19-D11 | MSG:C19-D12 | Presence/typing/receipt privacy and multi-device TTL behavior need their explicit shared policy. |
| ALT19:C19-D12 | MSG:C19-D01, MSG:C19-D10 | Replies/threads/mentions must respect actual same-conversation history and compatible key/audience boundaries. |
| ALT19:C19-D13 | MSG:C19-D02, MSG:C19-D09 | Actual actor attribution, bounded Agent context and selected disclosure are not an implicit cryptographic grant. |
| ALT19:C19-D14 | MSG:C19-D14 | Retention, fanout, resource limits and security evidence remain unmeasured release gates. |

### API Correspondence

ALT19 lists proposals under `/v1`; MSG preserves unprefixed source examples. The prefix remains subject to ADR-0001. This table records related operations, not deployed aliases or permission to generate routes before schema review.

| Alternate API | Working source API or owner | Difference to resolve |
| --- | --- | --- |
| ALT19:C19-P01 | MSG:C19-P02 | List conversations; numbering is reversed from creation in the alternate. |
| ALT19:C19-P02 | MSG:C19-P01 | Create conversation. |
| ALT19:C19-P03 | MSG:C19-P03 | Read conversation under actual current audience/history. |
| ALT19:C19-P04 | MSG:C19-P14 | Message history; message order is not the whole event-resume contract. |
| ALT19:C19-P05 | MSG:C19-P15 | Durable logical message send. |
| ALT19:C19-P06 | MSG:C19-P17 | Exact-author message edit; moderation is not author impersonation. |
| ALT19:C19-P07 | MSG:C19-P18 | Explicit deletion type and tombstone. |
| ALT19:C19-P08 | MSG:C19-P22 | Read action with explicit eligible coverage/privacy. |
| ALT19:C19-P09 | MSG:C19-P10 | Alternate `members` versus source `participants`; canonical noun and role semantics are not approved aliases. |
| ALT19:C19-P10 | MSG:C19-P11 | `user_id` versus `account_id` and removal/key-change boundaries need one typed contract. |
| ALT19:C19-P11 | MSG:C19-P19, MSG:C19-P20 | The alternate combines add/remove reaction and an incomplete DELETE example; use separately reviewed exact methods/paths. |
| ALT19:C19-P12 | MSG:C19-P21 | Selected message report, not unrestricted history disclosure. |
| ALT19:C19-P13 | C7-D08, C7-D09 in [CHAPTER_07_API_REALTIME_CONTRACT.md](CHAPTER_07_API_REALTIME_CONTRACT.md) | Sync is an API/event ownership decision, not an extra source Chapter 19 operation. |

Do not rename events mechanically. Alternate `message.edited`, `message.receipt.updated` and `conversation.read.updated` proposals must be reconciled with MSG's source `message.updated`, `message.delivery_updated` and `message.read_updated`. Commands, message sequences and event-stream positions are different concepts. Missing source operations in ALT19 stay represented in MSG; its shorter table is not the whole API.

ALT19 workflows map to MSG by behavior: send/fanout -> MSG:C19-W01, MSG:C19-W02, MSG:C19-W04; offline/reconnect -> MSG:C19-W03; editing/deletion -> MSG:C19-W08; media -> MSG:C19-W09; presence -> MSG:C19-W05. Retained alternate recommendations such as a simplified type vocabulary, a low-risk offline allowlist and evaluating selected forwarding are not silently adopted merely because the detailed workflows are the review starting point.

## 4. Chapter 20 Crosswalk

All fourteen ALT20 decisions map to related DEL choices. Similar behavior does not make the two decision IDs or statuses interchangeable.

| Alternate decision | Related working decisions | Reconciliation needed |
| --- | --- | --- |
| ALT20:C20-D01 | DEL:C20-D01, DEL:C20-D02, DEL:C20-D03 | One policy authority, structured durable intent and distinct recipient inbox/effect records. |
| ALT20:C20-D02 | DEL:C20-D02, DEL:C20-D08 | Current actor/source/recipient checks, not a cached authorized flag. |
| ALT20:C20-D03 | DEL:C20-D05, DEL:C20-D08, DEL:C20-D13 | General consent plus narrow first-contact/lawful-notice exceptions and sensitive representative authority remain gated. |
| ALT20:C20-D04 | DEL:C20-D04, DEL:C20-D05, DEL:C20-D08 | Endpoint generation, identity verification and purpose-specific grants are separate. |
| ALT20:C20-D05 | DEL:C20-D06, DEL:C20-D07, DEL:C20-D10 | Time/priority/expiry/channel policy and fallback semantics need explicit choices. |
| ALT20:C20-D06 | DEL:C20-D09 | Approved versioned localized content and minimal recipient projection. |
| ALT20:C20-D07 | DEL:C20-D02, DEL:C20-D10 | Immutable logical effect, required audit and dispatch commitment versus cancellation. |
| ALT20:C20-D08 | DEL:C20-D10 | Known rejection differs from unknown acceptance; no fresh key/channel after timeout. |
| ALT20:C20-D09 | DEL:C20-D04, DEL:C20-D05, DEL:C20-D12, DEL:C20-D14 | Official provider/account capabilities, terms, quota/cost and actual evidence remain OPEN gates. |
| ALT20:C20-D10 | DEL:C20-D11 | Authenticated durable callback observations, not consent or identity authority. |
| ALT20:C20-D11 | DEL:C20-D06, DEL:C20-D07, DEL:C20-D13 | Finite escalation/time origin and care/guardian/emergency boundaries. |
| ALT20:C20-D12 | DEL:C20-D01, DEL:C20-D02, DEL:C20-D03, DEL:C20-D13 | Shared manual/tool policy and honest inbox/domain-response state; preserve actual Agent restrictions. |
| ALT20:C20-D13 | DEL:C20-D10, DEL:C20-D12, DEL:C20-D14 | Aggregate attempt/cost/retention, operator replay and recovery policy. |
| ALT20:C20-D14 | DEL:C20-D04, DEL:C20-D05, DEL:C20-D12, DEL:C20-D14 | Launch-channel choice also requires OPEN C1-D03, not merely an adapter or this crosswalk. |

### Identifier Families

Ranges below pair by suffix only where the source values have been compared. They are crosswalk instructions, not renaming patches. Keep links/IDs qualified in old tickets and review records.

| ALT20 identifiers | DEL identifiers | Meaning |
| --- | --- | --- |
| C20-B01 through C20-B25 | C20-R01 through C20-R25 | The twenty-five exact source final decisions. DEL's B family instead denotes source API operations. |
| C20-P01 through C20-P21 | C20-B01 through C20-B21 | The twenty-one source method/path pairs. DEL:C20-P01 through DEL:C20-P11 are separate retained API proposals, not these source rows. |
| C20-M01 through C20-M21 | C20-J01 through C20-J21 | The twenty-one source tables. DEL's M family instead denotes command fields. |
| C20-R01 through C20-R10 | C20-Y01 through C20-Y10 | The ten ordered source Agent tool rules. |
| C20-S01 through C20-S35 | C20-S01 through C20-S35 | Source topics and line anchors. |
| C20-F01 through C20-F05 | C20-F01 through C20-F05 | Source notification type labels. |
| C20-L01 through C20-L14 | C20-L01 through C20-L14 | Source lifecycle/status meanings; source `read` wording is not domain acknowledgment. |
| C20-N01 through C20-N15 | C20-N01 through C20-N15 | Source responsibility components. |
| C20-G01 through C20-G07 | C20-G01 through C20-G07 | Illustrative category defaults, not approved channels. |
| C20-A01 through C20-A23 | C20-A01 through C20-A23 | Source acceptance requirements, with the stated apostrophe normalization. |
| C20-I01 through C20-I08 | C20-I01 through C20-I08 | Source index expressions, not applied constraints. |
| C20-E01 through C20-E12 | C20-E01 through C20-E12 | Source client/provider observation names and families. |
| C20-U01 through C20-U09 | C20-U01 through C20-U09 | Source tools, not granted capabilities. |
| C20-C01 through C20-C14 | C20-C01 through C20-C14 | Android surfaces. |
| C20-H01 through C20-H08 | C20-H01 through C20-H08 | Literal source web routes. |
| C20-O01 through C20-O09 | C20-O01 through C20-O09 | Administrator surfaces with scoped access. |
| C20-X01 through C20-X14 | C20-X01 through C20-X14 | Source threat labels. |
| C20-Q01 through C20-Q19 | C20-Q01 through C20-Q19 | Source required controls. |
| C20-Z01 through C20-Z09 | Section 3's ordered source-stop paragraph | Same nine escalation-stop phrases; do not invent DEL Z IDs. |

ALT20's fourteen command fields are prose, corresponding to DEL:C20-M01 through DEL:C20-M14. Its C20-K01 through C20-K16 are related proposed invariants, not verbatim equivalents; compare their actual text before citing a boundary. Decision and workflow families require the semantic maps, not suffix-based translation.

| ALT20 workflow | DEL workflow references | Retained behavior |
| --- | --- | --- |
| ALT20:C20-W01 | DEL:C20-W07, DEL:C20-W10 | Structured command, preview/approval, durable logical effect and current commitment. |
| ALT20:C20-W02 | DEL:C20-W08, DEL:C20-W02 | Intended account/contact resolution and versioned endpoint binding. |
| ALT20:C20-W03 | DEL:C20-W08, DEL:C20-W04 | Purpose consent, verification bootstrap, preference precedence and withdrawal. |
| ALT20:C20-W04 | DEL:C20-W09 | Recipient-zone time/expiry and allowed channels. |
| ALT20:C20-W05 | DEL:C20-W07 | Reviewed localized template and minimal permitted variables. |
| ALT20:C20-W06 | DEL:C20-W01 | Durable inbox/read/dismiss and source-domain acknowledgment separation. |

Additional explicit ALT20 details to carry into review are approved canonical destination parsing without collapsing aliases/shared household recipients; verification secrets excluded from persistent inbox variables; standards-specific unsubscribe handling distinct from ordinary GET mutations; and silent delivery as a requested provider/OS behavior, not proof that every device stayed silent. DEL already supplies the later provider/retry/webhook/escalation/operating workflows and verification plan. No unique policy is discarded by routing to DEL; unresolved differences remain in the retained alternate.

## 5. ADR Reconciliation and Approval Gates

| Existing ADR | Reconciled proposal | Accountable decision role | Still required before dependent implementation |
| --- | --- | --- | --- |
| [adr/0001-canonical-api-prefix.md](adr/0001-canonical-api-prefix.md) | `/v1` candidate and one reviewed operation inventory; source route examples retained rather than rewritten. | Technical Co-lead | Domain/backend/client route decisions, compatibility and required product review. No generated OpenAPI is implied. |
| [adr/0002-canonical-response-envelope.md](adr/0002-canonical-response-envelope.md) | One proposed HTTP envelope with explicit exceptions; event streams stay under C7-D08/C7-D09, not a nonexistent event ADR. | Technical Co-lead | Schema location/toolchain, untrusted-response validation, exact event contract and consumer evidence. |
| [adr/0003-canonical-state-machines.md](adr/0003-canonical-state-machines.md) | Proposed owned state registry, separate authority/state families and generation plus tests, not an assertion that drift is impossible. | Technical Co-lead | Actual M1 transition/authority/concurrency definitions and reviewed future-domain gates. |
| [adr/0004-initial-authentication-method.md](adr/0004-initial-authentication-method.md) | C18-D01 is PROPOSED, while C1-D05 is OPEN. Email/password-first and phone linking remain recommendations. | Identity lead | Qualified technical/security/data-rights review, recovery/invitation binding, transport exceptions and real verification evidence. |
| [adr/0005-mvp-scope-and-milestones.md](adr/0005-mvp-scope-and-milestones.md) | Proposed M2 private communication, M3 public community, M4 planning completion, aligned with release/team plans. The conflicting old sequence is retained as history. | Founder | Scope acceptance and C1-D01 through C1-D04 outcomes; launch channels stay OPEN C1-D03. Security/data-rights vetoes remain binding. |

No human names or approval dates have been supplied. The role labels above are not staffed owners or substitutes for independent qualified review. Apply the R/A/required-gate rules in [TEAM_ORGANIZATION_EXECUTION_PLAN.md](TEAM_ORGANIZATION_EXECUTION_PLAN.md); an assistant, duplicate accounts or two roles held by the same person do not supply independent approval.

| Outstanding gate | Decision owner | Concrete evidence or deliverable needed |
| --- | --- | --- |
| Full MVP scope and launch channels | Founder with product, security and data-rights review | Resolve owning C1 records, explicit public-launch acceptance and approved provider scope. |
| Canonical message/delivery APIs and states | Backend lead with Technical Co-lead and client/domain review | File-qualified operations, schema/event/cursor/state definitions and version/compatibility plan for the released slice. |
| Encryption mode/protocol/Agent disclosure | Technical Co-lead with Security and Data-rights owners plus qualified cryptography review | Actual selected library/protocol, endpoint/history/recovery threat model, participant disclosure and required evidence. No default selected here. |
| Identity/bootstrap/invitation authority | Identity lead with independent security review | Purpose-bound proof, intended-recipient admission/recovery semantics and bounded synthetic versus real delivery plan. |
| Delivery providers, care and external channels | Notifications lead; Founder for spend; Security/Data-rights owners | Verified official capabilities, consent/legal/purpose limits, kill/budget policy and explicit test/live authorization. |
| Named implementation/review capacity | Founder and Technical Co-lead | Actual accountable owners, implementers, independent reviewers, availability and backup plan before a work item is ready. |
| Source-area coverage and M1 readiness | Product and domain leads; QA for traceability | Map remaining source requirements to current drafts and gaps; plan and later execute C1-M01 through C1-M10. Document checks are not milestone acceptance. |

## 6. Coverage and Artifact Boundaries

After the public-content addition there are 20 `CHAPTER_*.md` files for 18 distinct chapter numbers: 1, 2, 3 and 6 through 20. Chapters 19 and 20 each have two drafts; Chapters 4/5 are traced into later owning contracts rather than duplicated. Counts are an inventory snapshot, not proof every idea is approved or implemented; concurrent additions must not be reverted to preserve the count.

| Reviewed source area | Owning coverage | Draft and remaining gate |
| --- | --- | --- |
| [Chapter2.md](Chapter2.md) | [CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md), [CHAPTER_01_RELEASE_PLAN.md](CHAPTER_01_RELEASE_PLAN.md), [CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md), [CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) | All 21 numbered topics, the final architecture, 32 acceptance bullets and 36 source operations are routed below. COV-G01/COV-G02 now have a public-content draft; event/API refinements address COV-G03/COV-G04. Proposed choices and actual evidence remain unapproved. |
| [Chapter4.md](Chapter4.md) | [CHAPTER_06_DATA_CONTRACT.md](CHAPTER_06_DATA_CONTRACT.md), [CHAPTER_07_API_REALTIME_CONTRACT.md](CHAPTER_07_API_REALTIME_CONTRACT.md), MSG, DEL | All 31 topics and 14 source catalogs remain traced. COV-G05 has a wire-mapping addendum and COV-G06 a candidate job-transition table in Chapter 13. The original scheduled-jobs ending is still incomplete; later proposals are not recovered source text. |
| [Chapter5.md](Chapter5.md) | [CHAPTER_12_AGENT_RUNTIME_CONTRACT.md](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), MSG | All 42 topics, 17 source operations, six catalogs and 32 proposed tests remain traced. Chapter 12 now supplies state/API completion, seven memory controls and qualification handoffs for COV-G07 through COV-G09. No runtime/provider proof is implied. |

Coverage means a trace to reviewed planning text, not implementation, accepted policy or a claim that every field/schema is complete. A general invariant or endpoint name does not close a missing domain workflow. The following review retains source behavior and points to specific gaps instead of making another copy of the entire platform design.

References with a unique chapter prefix resolve to these owning drafts; MSG and DEL remain the file-qualified aliases defined above.

| Prefix | Owning review draft |
| --- | --- |
| C1 | [CHAPTER_01_RELEASE_PLAN.md](CHAPTER_01_RELEASE_PLAN.md) |
| C2 | [CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md) |
| C6 | [CHAPTER_06_DATA_CONTRACT.md](CHAPTER_06_DATA_CONTRACT.md) |
| C7 | [CHAPTER_07_API_REALTIME_CONTRACT.md](CHAPTER_07_API_REALTIME_CONTRACT.md) |
| C8 | [CHAPTER_08_ANDROID_CONTRACT.md](CHAPTER_08_ANDROID_CONTRACT.md) |
| C9 | [CHAPTER_09_WEB_CONTRACT.md](CHAPTER_09_WEB_CONTRACT.md) |
| C10 | [CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md) |
| C12 | [CHAPTER_12_AGENT_RUNTIME_CONTRACT.md](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) |
| C13 | [CHAPTER_13_SCHEDULING_CONTRACT.md](CHAPTER_13_SCHEDULING_CONTRACT.md) |
| C14 | [CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) |
| C15 | [CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md) |
| C16 | [CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) |
| C17 | [CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) |
| C18 | [CHAPTER_18_IDENTITY_CONTRACT.md](CHAPTER_18_IDENTITY_CONTRACT.md) |

### Chapter 2: Public Community Trace

The entire source was read for this review. The following 22 rows route its 21 numbered topics and final architecture. Existing cross-cutting safeguards are not counted as a complete public-content domain contract.

| Source topic | Existing planning trace | Remaining boundary or follow-up |
| --- | --- | --- |
| [2.1 Purpose](Chapter2.md#L3) | C6-D03; C15-D01 | Public content and private Spaces, messages, care data and Agent context remain separate. |
| [2.2 Global Community Structure](Chapter2.md#L25) | C8-W02; C9-W01; C15-W04 | Home/discovery/page/post/interaction/safety surfaces are represented; actual authoring commands need COV-G01/COV-G02. |
| [2.3 Public Community Concepts](Chapter2.md#L76) | C6-E07, C6-E12; C18-W10; C15-W02 | Page identity, typed post parent and public event are distinct. Controlled topic/category governance and page field audiences belong in COV-G01, not arbitrary taxonomy from an Agent. |
| [2.4 Community Visibility Model](Chapter2.md#L190) | C7-K03; C15-W01, C15-W10; C14-W10 | Preserve all nine source labels; ARCHIVED/DELETED are lifecycle dimensions, not audience grants. Publicity requires owner, parent, moderation, private-data and media checks. Confirmation does not override another subject's rights; COV-G01 specifies actual transitions. |
| [2.5 Public Page Requirements](Chapter2.md#L268) | C7-W03; C18-W07, C18-W10; C9-W02 | Creation/onboarding, profile/tabs/rules, owner/admin/moderator powers, critical settings, archive/transfer/delete and analytics exposure need the page-specific COV-G01 matrix. Discovery explicitly delegates these commands. |
| [2.6 Page Membership and Following](Chapter2.md#L408) | C18-W07, C18-W08; C15-W04 | Follow is not admission or a private-history grant. COV-G01 defines page join/invite/closed/event-specific policies and role membership; paid membership remains later scope. Mute, block, hide and notification preferences stay distinct. |
| [2.7 Public Post Architecture](Chapter2.md#L474) | C7-W03; C8-W06; C9-W02; C15-W01 | Compose/preview/private draft, allowed formats/mentions/location/accessibility/warnings, publish validation and significant-edit review need COV-G02. The illustrative linear state diagram is not an approved transition machine. Audio and full video processing are not silently promoted into first-MVP scope. |
| [2.8 Comments and Replies](Chapter2.md#L598) | C6-E07; C7-W03; C15-W01; C16-W07 | Parent/post binding and current restrictions are covered. Reply depth, edit/delete, enable/limit/lock/pin/hide controls, moderator versus author powers and source comment-ordering policy need COV-G02. |
| [2.9 Reactions, Shares, and Saves](Chapter2.md#L681) | C7-W03; C15-W04, C15-W06, C15-W10 | COV-G02 defines idempotent add/remove/count contributions, public/private/DM/link/external share variants and private save/search/unsave. A share cannot publish private source content. Optional personalization needs C15-D07; saving is not consent to public signal use. |
| [2.10 Public Feed Architecture](Chapter2.md#L745) | C15-D04, C15-D05, C15-D06; C15-W04, C15-W05, C15-W07; C8-W02 | Following/explore/trending/event feeds, stable cursors, exclusion and loading/error/empty states have owners. Keep basic feed correctness ahead of advanced ranking; workload and scoring choices remain unapproved. |
| [2.11 Discovery and Search](Chapter2.md#L847) | C15-W02, C15-W03, C15-W10 | Eligible public objects/filters, durable asynchronous projection and final current authorization are covered. Stale indexes never authorize private, deleted, blocked or restricted results. Exact public route variants need COV-G04. |
| [2.12 Public Events](Chapter2.md#L943) | C6-E12; C17-W01, C17-W02, C17-W03, C17-W11; C17-D03, C17-D10 | Creation/capacity/cancellation and separate organizer planning are detailed. COV-G03 reconciles six source RSVP labels, admission/attendance distinctions and per-field public location/roster/contact/discussion settings. |
| [2.13 Community Agent](Chapter2.md#L1027) | C12-W02, C12-W03, C12-W04, C12-W05; C18-W10 | Approved public page sources only; drafts/FAQ/summaries are not permission to publish, remove, ban, transfer, disclose admin data or send externally. Human publication remains explicit. Agent assistance is not part of the manual M1 slice. |
| [2.14 Public Community Moderation](Chapter2.md#L1119) | C15-W08, C15-W09; C16-W03, C16-W07, C16-W08 | Signals, case authority, restricted user views and action-specific appeals have owners. The source's possible later appeals require a real release decision; no automatic deferral or staffed reviewer is implied. |
| [2.15 Public Community Notifications](Chapter2.md#L1183) | DEL:C20-W01, DEL:C20-W08, DEL:C20-W09, DEL:C20-W10; C18-W08 | Current audience, purpose, destination and preferences are covered. COV-G04 retains all ten source triggers and six preference groups, including per-page/event settings and digest frequency, for explicit event/fanout contracts. |
| [2.16 Public Community Data Model](Chapter2.md#L1221) | C6-D03; C6-E07, C6-E12; C18-W07 | The 26 table names and nine constraints are source requirements, not delivered DDL. Reconcile page_followers versus page_follows, page_roles/member coupling, one active owner, post topics/mentions/shares/saves and child-parent constraints under COV-G01/COV-G02/COV-G04. |
| [2.17 Public Community API Requirements](Chapter2.md#L1281) | C7-W03, C7-W05; C7-D01, C7-D13, C7-D14 | All 36 operations are inventoried below. Sixteen match the core C7 inventory after prefix normalization only; the other twenty need owning-domain reconciliation, not fabricated availability. |
| [2.18 Android Screen Requirements](Chapter2.md#L1346) | C8-W02, C8-W05, C8-W06 | Five source screens and their interaction/error states map to public entry, event and composer workflows. Page management and detailed interaction policy still depend on COV-G01/COV-G02; no Android UI has been run. |
| [2.19 Web Screen Requirements](Chapter2.md#L1454) | C9-W01, C9-W02, C9-W10 | Responsive feed/editor, management, moderation and Agent draft surfaces have owners. Desktop navigation/context panels do not themselves define authority; advanced analytics remains later scope. |
| [2.20 Public Community Acceptance Criteria](Chapter2.md#L1501) | The 32-row acceptance trace below | Source criteria are preserved and routed, not marked passed. Page/authoring/API decisions still block their dependent implementation. |
| [2.21 Chapter 2 MVP Boundary](Chapter2.md#L1579) | C1-D01, C1-D02, C1-D03, C1-D04 | Retain all 18 included features and 11 later/excluded categories. Full community MVP is not M1. Resource availability alone does not approve paid membership, autonomous publishing, full video or another deferred capability. |
| [Final Architecture Decision](Chapter2.md#L1643) | C6-E07; C7-W03; C15-W01, C15-W02; DEL:C20-W10 | Authorized page/post/event mutation precedes PostgreSQL commit and durable outbox projections. Feeds, search, caches, notifications and Agent context cannot grant publicity. |

#### Chapter 2 Acceptance Trace

The criterion text below is retained from section 2.20. References identify planned behavior or a named gap, not executed tests. C7-V05 is the shared public-projection verification family; the missing detailed public-domain cases must be added through COV-G01/COV-G02 before release acceptance.

| ID | Source group | Source criterion | Planning trace or remaining gate |
| --- | --- | --- | --- |
| COV2-A01 | Pages | Authenticated users can create public pages. | C7-W03; COV-G01 |
| COV2-A02 | Pages | Page owners can assign roles. | C18-W07, C18-W10; COV-G01 |
| COV2-A03 | Pages | Page visibility is enforced server-side. | C7-K03; C15-W01, C15-W10; COV-G01 |
| COV2-A04 | Pages | Suspended pages cannot publish. | C7-W03; C15-W01; COV-G01 |
| COV2-A05 | Pages | Page deletion follows a controlled workflow. | C6-W11; C15-W10; COV-G01 |
| COV2-A06 | Pages | Public pages appear in discovery only when eligible. | C15-W01, C15-W02, C15-W10 |
| COV2-A07 | Posts | Users can publish authorized public posts. | C7-W03; C8-W06; C9-W02; COV-G02 |
| COV2-A08 | Posts | Drafts remain private. | C15-W01; C8-W06; C9-W02; COV-G02 |
| COV2-A09 | Posts | Posts support editing and deletion. | C7-W03; C15-W01, C15-W10; COV-G02 |
| COV2-A10 | Posts | Private posts never appear in public feeds. | C15-D01; C15-W04, C15-W10 |
| COV2-A11 | Posts | Media access follows post visibility. | C14-W10, C14-W11; C15-W01 |
| COV2-A12 | Posts | Significant edits can trigger re-moderation. | C15-W01, C15-W08; COV-G02 |
| COV2-A13 | Discovery | Search excludes private and deleted content. | C15-W03, C15-W10 |
| COV2-A14 | Discovery | Blocked users and content are filtered. | C18-W08; C15-W03, C15-W04 |
| COV2-A15 | Discovery | Search supports pagination. | C7-D06; C15-W03 |
| COV2-A16 | Discovery | Stale indexes are revalidated before display. | C15-W02, C15-W03, C15-W10 |
| COV2-A17 | Discovery | Users can hide or mute content. | C15-W06; C18-W08 |
| COV2-A18 | Events | Public events can be created. | C17-W01; COV-G03 |
| COV2-A19 | Events | RSVP status is stored. | C6-E12; C17-W02; COV-G03 |
| COV2-A20 | Events | Attendee visibility is configurable. | C17-W02; C17-D10; COV-G03 |
| COV2-A21 | Events | Private organizer planning remains private. | C17-W01, C17-W08; C9-W02 |
| COV2-A22 | Events | Event cancellation generates appropriate notifications. | C17-W10, C17-W11; DEL:C20-W10 |
| COV2-A23 | Agent | Page agents access only approved public page data. | C12-W02; C18-W10 |
| COV2-A24 | Agent | Generated content is draft-first. | C12-W03, C12-W04; C18-W10; COV-G02 |
| COV2-A25 | Agent | Publishing requires human authorization. | C12-W05; C7-W03; C18-W10; COV-G02 |
| COV2-A26 | Agent | Agent actions are logged. | C12-W01, C12-W04, C12-W06 |
| COV2-A27 | Agent | Private administrator conversations are excluded. | C12-W02; C18-W10 |
| COV2-A28 | Safety | Users can report pages, posts, comments, and users. | C16-W03; COV-G04 |
| COV2-A29 | Safety | Moderators can review reports. | C16-W02, C16-W04, C16-W05 |
| COV2-A30 | Safety | Appeals are supported or explicitly scheduled for a later phase. | C16-W08; product/security launch decision, not an assumed deferral |
| COV2-A31 | Safety | Blocking affects discovery, messaging, and notifications. | C18-W08; C15-W04; MSG:C19-W01; DEL:C20-W08 |
| COV2-A32 | Safety | Moderation actions are audited. | C16-W07, C16-W12 |

#### Chapter 2 Source Operations

These are the 36 source method/path pairs in section 2.17, in source order. A C7-P reference means an inventory match after adding the proposed `/v1` prefix, not a selected schema or working endpoint. COV-G04 also reconciles singular `/feed` versus later `/feeds`, public versus scoped `/search`, generic versus nested creation, membership admission and operation-specific permissions; it must not blindly alias unsafe writes.

| ID | Source operation | Core inventory match or owning review |
| --- | --- | --- |
| COV2-P01 | `POST /pages` | C7-P24 |
| COV2-P02 | `GET /pages/{page_id}` | C7-P25 |
| COV2-P03 | `PATCH /pages/{page_id}` | C7-P26 |
| COV2-P04 | `DELETE /pages/{page_id}` | COV-G01, COV-G04 |
| COV2-P05 | `GET /pages/{page_id}/posts` | C7-P27 |
| COV2-P06 | `POST /pages/{page_id}/posts` | C7-P28 |
| COV2-P07 | `POST /pages/{page_id}/follow` | C18-W08; COV-G01, COV-G04 |
| COV2-P08 | `DELETE /pages/{page_id}/follow` | C18-W08; COV-G01, COV-G04 |
| COV2-P09 | `GET /pages/{page_id}/members` | C18-W07; COV-G01, COV-G04 |
| COV2-P10 | `POST /pages/{page_id}/members` | C18-W07; COV-G01, COV-G04 |
| COV2-P11 | `PATCH /pages/{page_id}/members/{user_id}` | C18-W07; COV-G01, COV-G04 |
| COV2-P12 | `DELETE /pages/{page_id}/members/{user_id}` | C18-W07; COV-G01, COV-G04 |
| COV2-P13 | `POST /posts` | C7-W03; COV-G02, COV-G04 |
| COV2-P14 | `GET /posts/{post_id}` | C7-P29 |
| COV2-P15 | `PATCH /posts/{post_id}` | C7-P30 |
| COV2-P16 | `DELETE /posts/{post_id}` | C7-P31 |
| COV2-P17 | `GET /posts/{post_id}/comments` | C7-P33 |
| COV2-P18 | `POST /posts/{post_id}/comments` | C7-P32 |
| COV2-P19 | `POST /posts/{post_id}/reactions` | C7-P34 |
| COV2-P20 | `DELETE /posts/{post_id}/reactions` | C7-P35 |
| COV2-P21 | `POST /posts/{post_id}/report` | C16-W03; COV-G04 |
| COV2-P22 | `POST /posts/{post_id}/save` | C7-W03; COV-G02, COV-G04 |
| COV2-P23 | `DELETE /posts/{post_id}/save` | C7-W03; COV-G02, COV-G04 |
| COV2-P24 | `GET /feed/following` | C15-W04; COV-G04 |
| COV2-P25 | `GET /feed/explore` | C15-W04; COV-G04 |
| COV2-P26 | `GET /feed/trending` | C15-W07; COV-G04 |
| COV2-P27 | `GET /discover/pages` | C15-W03; COV-G04 |
| COV2-P28 | `GET /discover/events` | C15-W03; COV-G04 |
| COV2-P29 | `GET /search` | C15-W03; COV-G04 |
| COV2-P30 | `POST /events` | C7-P51 |
| COV2-P31 | `GET /events/{event_id}` | C7-P52 |
| COV2-P32 | `PATCH /events/{event_id}` | C7-P53 |
| COV2-P33 | `DELETE /events/{event_id}` | C7-P54 |
| COV2-P34 | `POST /events/{event_id}/rsvp` | C17-W02; COV-G03, COV-G04 |
| COV2-P35 | `DELETE /events/{event_id}/rsvp` | C17-W02; COV-G03, COV-G04 |
| COV2-P36 | `GET /events/{event_id}/attendees` | C17-W02; COV-G03, COV-G04 |

### Chapter 4: Communication and Delivery Trace

The entire source was read through its final `States:` line. Chapter 4 is the early communication/notification/scheduler design, not an independent replacement for the later general backend contract. All 31 numbered top-level topics have an owner below. Its examples are preserved, including incomplete or insufficient examples; later refinements remain proposals under their owning decisions.

| Source topic | Existing planning trace | Reconciliation boundary |
| --- | --- | --- |
| [4.1 Objective](Chapter4.md#L3) | MSG:C19-W02; C7-W08; C10-W02 | Durable persistence precedes realtime distribution; throughput/reliability objectives are not measured capacity. |
| [4.2 Communication Channels](Chapter4.md#L43) | C7-D03, C7-D11; C7-W09; C10-W03 | REST-first durable commands, authorized WS updates and durable internal work are distinct. Broker options are candidates, not a mandatory infrastructure stack. |
| [4.3 End-to-End Message Lifecycle](Chapter4.md#L156) | MSG:C19-W01, MSG:C19-W02; C6-W05 | Actual sender/parent/conversation authorization, message plus audit/outbox commit and canonical receipt precede success. Fanout failure does not erase the message. |
| [4.4 Message States](Chapter4.md#L196) | MSG:C19-D02, MSG:C19-D04; MSG:C19-W02, MSG:C19-W04 | Nine client and seven server labels are source vocabulary; canonical transitions distinguish accepted persistence, transport, device receipt and read. COV-G05 owns reconciliation. |
| [4.5 Message Command Contract](Chapter4.md#L228) | C7-D02, C7-D04, C7-D05; MSG:C19-W02 | Source JSON and twelve validation bullets are illustrations, not complete mode-aware DTOs. Personal mute is not a send restriction; current bans/locks and source access are separate. |
| [4.6 Message Data Model](Chapter4.md#L287) | C6-W05; MSG:C19-W02, MSG:C19-W09, MSG:C19-W10 | Four explicit sender kinds remain attributable. Nullable sender columns and ciphertext/search field names do not establish non-human deduplication or E2E search capability. |
| [4.7 Message Types](Chapter4.md#L322) | MSG:C19-W02, MSG:C19-W08, MSG:C19-W09 | Preserve all 15 types with bounded tagged schemas and currently authorized task/event/file references. Inventory is not approval to ship every media type. |
| [4.8 Message Idempotency](Chapter4.md#L346) | C7-D05; MSG:C19-W02 | Source user-ID composite is insufficient for nullable Agent/system actors. Use stable actual actor/intent, immutable payload binding and current-authorized reconciliation; do not retry with a new key after uncertainty. |
| [4.9 Ordering Guarantees](Chapter4.md#L387) | MSG:C19-W02, MSG:C19-W03; C7-D06, C7-D08, C7-D09 | Commit-safe conversation order differs from an authorized event cursor. A gap can reflect hidden history, tombstones or another event class, not permission to fetch every missing integer. |
| [4.10 Pagination](Chapter4.md#L423) | C7-D02, C7-D06, C7-D10; MSG:C19-W03 | Source URL/envelope and 50/100 page sizes are examples. Final schema uses reviewed scoped opaque cursors, precise sequences, bounded history and current authorization. |
| [4.11 WebSocket Connection Lifecycle](Chapter4.md#L458) | C7-D07, C7-D08; C7-W08; C18-W03 | The AUTH-frame example does not select browser credentials/tickets. Validate account/session/device/Origin as applicable, derive allowed subscriptions and reauthorize replay. |
| [4.12 WebSocket Event Format](Chapter4.md#L507) | C7-D06, C7-D08, C7-D13; C7-W08 | The example omits the required schema version and uses a numeric sequence. COV-G05 reconciles exact envelope, version, stream identity and wire precision; no generated schema exists. |
| [4.13 Event Delivery Guarantees](Chapter4.md#L555) | C7-W08; MSG:C19-W03; C8-W11; C9-W11 | At-least-once transport requires idempotent local application. Data/tombstone, dedup marker and cursor commit together; sequential pseudocode is not a crash-safe transaction. |
| [4.14 Transactional Outbox](Chapter4.md#L591) | C6-W05, C6-W07; C10-W03 | Business state and required outbox/work intent are atomic. PUBLISHED does not prove a consumer completed the durable effect. |
| [4.15 Outbox Dispatcher](Chapter4.md#L649) | C10-W03; C7-W09 | Bounded claims, fencing, consumer receipts, recovery and DLQ ownership supplement the source dispatcher. Retry timings are examples; slow provider/network I/O must not hold business locks. |
| [4.16 Offline-First Android Messaging](Chapter4.md#L681) | C8-W04, C8-W11; MSG:C19-W03 | Keep stable local render identity and client/server mapping, atomic pending intent and appropriate crypto persistence. Replacing an ID must not lose replies/attachments; permission loss blocks stale sends without pretending a force-stopped app runs continuously. |
| [4.17 Multi-Device Synchronization](Chapter4.md#L742) | C18-W03; C9-W11; MSG:C19-W03, MSG:C19-W04, MSG:C19-W06, MSG:C19-W07 | Session/device authentication, cryptographic enrollment and readable history differ. Local drafts, cross-device read aggregation and active-device push suppression need reviewed privacy policy, not blanket guarantees. |
| [4.18 Typing Indicators](Chapter4.md#L782) | MSG:C19-W05 | Authenticated bounded ephemeral leases, rate limits, lost-stop expiry and current audience; no normal-message persistence or stale replay. |
| [4.19 Presence](Chapter4.md#L814) | MSG:C19-D12; MSG:C19-W05 | Retain five source states, including invisible and do-not-disturb. Multi-device leases and Redis loss cannot prove human availability; the later additional busy label is a schema choice. |
| [4.20 Read Receipts](Chapter4.md#L846) | MSG:C19-D04, MSG:C19-D12; MSG:C19-W04 | Three source read models and a scalar cursor are not universal proof. Coverage, gaps, rejoin/history, privacy and explicit mark-read intent must be defined before aggregation. |
| [4.21 Delivery Receipts](Chapter4.md#L880) | MSG:C19-W04 | Persisted, device-received, decrypted and read are distinct facts. A socket write or provider acceptance is not human reading or business acknowledgment. |
| [4.22 Push Notification Architecture](Chapter4.md#L896) | MSG:C19-W05; DEL:C20-W02, DEL:C20-W08, DEL:C20-W10; DEL:C20-D04 | Domain event, policy, preferences, quiet hours and redaction precede an approved provider. FCM/Web Push are candidates; iOS/APNs remains a later possibility, not current delivered scope. |
| [4.23 Notification Types](Chapter4.md#L926) | DEL:C20-W07, DEL:C20-W09; DEL:C20-D06 | Thirteen types and four priorities require approved category/template mapping. An Agent cannot self-assign criticality or create an emergency capability. |
| [4.24 Notification Privacy](Chapter4.md#L957) | MSG:C19-W05; DEL:C20-W06, DEL:C20-W07, DEL:C20-W08 | Four preview choices and seven preference scopes need actual device/channel behavior. Generic medical-reminder wording does not authorize health data use, treatment decisions or private remote plaintext previews. |
| [4.25 Notification Preference Model](Chapter4.md#L998) | DEL:C20-W08, DEL:C20-W09 | The simple row/JSON needs versioned account/resource/category/channel/device precedence, recipient timezone, endpoint binding and consent. Preferences cannot override a restriction or withdrawn grant. |
| [4.26 Notification Deduplication](Chapter4.md#L1031) | DEL:C20-D02, DEL:C20-D10; DEL:C20-W04, DEL:C20-W10 | Source user/event/channel uniqueness can deduplicate a local record only. Stable logical effects, payload/endpoint versions and provider-specific reconciliation are required; no exactly-once external-send promise. |
| [4.27 Notification Delivery Table](Chapter4.md#L1052) | DEL:C20-W04, DEL:C20-W10, DEL:C20-W11 | Separate command, recipient inbox, logical channel effect, attempt and authenticated provider evidence. Seven source states do not represent every pending/unknown/out-of-order outcome. |
| [4.28 WhatsApp Integration Boundary](Chapter4.md#L1083) | C7-D12; DEL:C20-D12; DEL:C20-W03, DEL:C20-W04, DEL:C20-W11 | The Protocol interface and five provider kinds are illustrative. Maintained officially approved capabilities, actual idempotency/status/cancel behavior and verified callbacks are before-use gates; source open-source wording is not permission for unofficial account automation. |
| [4.29 External Message Safety](Chapter4.md#L1151) | C18-W08, C18-W10; DEL:C20-W03, DEL:C20-W08, DEL:C20-W10 | Preserve all eight checks, but draft/review/approval cannot enable a prohibited MVP Agent action. Current purpose/recipient/endpoint consent and dispatch authority remain required at commitment. |
| [4.30 Voice and Call Notifications](Chapter4.md#L1185) | DEL:C20-D12; DEL:C20-W03, DEL:C20-W05, DEL:C20-W11 | Eight call labels require provider-specific mapping, bounded attempts/windows, automated-voice disclosure and consent. Repeated calls or emergency escalation are not authorized by an Agent's urgency claim. |
| [4.31 Reminder Scheduler](Chapter4.md#L1232) | C6-W07; C13-W03, C13-W04, C13-W09; DEL:C20-W10 | Durable schedule/occurrence/recipient intent and stop boundaries replace device-only timers. Source 4.31.1 stops at States: with no values; COV-G06 must not present later proposals as recovered source states. |

#### Chapter 4 Source Vocabulary

These 14 ordered catalogs preserve the original examples. They are not one merged state machine, supported product scope or automatically adopted wire spelling. Source JSON examples and numeric limits remain examples; enum mapping is part of COV-G05.

| ID | Source family | Exact source values, in order |
| --- | --- | --- |
| COV4-L01 | 4.4.1 client states | DRAFT, QUEUED, SENDING, SENT, DELIVERED, READ, FAILED, RETRYING, CANCELLED |
| COV4-L02 | 4.4.2 server states | ACCEPTED, PERSISTED, DISPATCHED, PARTIALLY_DELIVERED, DELIVERED, DELETED, REJECTED |
| COV4-L03 | 4.6.1 sender types | USER, AGENT, SYSTEM, INTEGRATION |
| COV4-L04 | 4.7 message types | TEXT, IMAGE, VIDEO, AUDIO, VOICE_NOTE, FILE, LOCATION, POLL, SYSTEM, TASK_UPDATE, EVENT_UPDATE, REMINDER, AGENT_RESPONSE, APPROVAL_REQUEST, MEMBER_UPDATE |
| COV4-L05 | 4.11 connection lifecycle | CONNECTING, AUTHENTICATING, AUTHENTICATED, SUBSCRIBING, CONNECTED, RECONNECTING, CLOSED |
| COV4-L06 | 4.14.1 outbox states | PENDING, PROCESSING, PUBLISHED, FAILED, DEAD_LETTERED |
| COV4-L07 | 4.19 presence | ONLINE, AWAY, OFFLINE, DO_NOT_DISTURB, INVISIBLE |
| COV4-L08 | 4.20 read models | USER_READ, CONVERSATION_READ, MESSAGE_READ |
| COV4-L09 | 4.21 receipt states | SENT, DELIVERED, READ |
| COV4-L10 | 4.23 notification types | NEW_MESSAGE, MENTION, REPLY, TASK_ASSIGNED, TASK_DUE, EVENT_CREATED, EVENT_CHANGED, REMINDER, AGENT_APPROVAL_REQUIRED, MEMBER_JOINED, MEMBER_REMOVED, SECURITY_ALERT, SYSTEM_NOTICE |
| COV4-L11 | 4.23.1 notification priority | LOW, NORMAL, HIGH, CRITICAL |
| COV4-L12 | 4.27 delivery states | PENDING, SENDING, SENT, DELIVERED, FAILED, SUPPRESSED, EXPIRED |
| COV4-L13 | 4.28 provider kinds | PUSH_PROVIDER, EMAIL_PROVIDER, WHATSAPP_PROVIDER, SMS_PROVIDER, VOICE_PROVIDER |
| COV4-L14 | 4.30 call states | REQUESTED, RINGING, ACCEPTED, DECLINED, MISSED, FAILED, COMPLETED, CANCELLED |

#### Chapter 4 Examples That Need the Later Contract

| ID | Early source example or ambiguity | Owning refinement and meaningful future check |
| --- | --- | --- |
| COV4-R01 | 4.8 unique index contains nullable sender_user_id for non-human senders. | MSG:C19-W02 requires a non-null actual actor and immutable logical intent. Test concurrent Agent/system duplicate sends and changed payload under the same identity, not only human retries. |
| COV4-R02 | 4.5 user mute appears alongside send restrictions. | MSG:C19-W01 separates personal mute from lock/ban policy. Test muted-but-authorized send versus actually restricted send; do not silently choose an ambiguous policy from the field name. |
| COV4-R03 | 4.4 ACCEPTED/PERSISTED and 4.21 delivery labels can be confused. | MSG:C19-W02/MSG:C19-W04 bind canonical send acceptance to commit and separate recipient/read facts. Fail fanout after commit and verify durable history without fabricated delivery/read receipts. |
| COV4-R04 | 4.5/4.10 envelopes, 4.11 AUTH and 4.12 numeric sequence/missing schema_version are not one protocol. | C7-D02/C7-D06/C7-D07/C7-D08/C7-D13 require actual schema and client compatibility decisions. Validate untrusted examples, sequences above 2^53, browser authentication and wrong-stream/version rejection against the selected contract. Parsing the seven source JSON examples alone proves none of this. |
| COV4-R05 | 4.9 assumes every missing conversation integer identifies a fetchable message. | MSG:C19-W02/MSG:C19-W03 separate commit-safe order from authorized event replay. Test interleaved commits, edits, hidden history, tombstones and snapshot-barrier catch-up. |
| COV4-R06 | 4.13 sequential local writes and 4.16 temporary-ID replacement can lose state after a crash. | MSG:C19-W03 and C8-W11 require stable identity plus atomic data/outbox/cursor and compatible crypto-state recovery. Test both REST/WS arrival orders and crash points, without unsafe ciphertext regeneration. |
| COV4-R07 | 4.14 marks an outbox record PUBLISHED and 4.15 shows a finite retry schedule. | C10-W03/C7-W09 require durable consumer progress, fenced claims and reconciliation beyond broker publication. Test publish-without-consume, expired lease, duplicate delivery, unknown provider outcome and safe DLQ recovery; numbers remain reviewed configuration. |
| COV4-R08 | 4.20 infers all earlier messages were read from a scalar last_read_sequence. | MSG:C19-W04 requires a defined eligible coverage boundary or explicit mark-read intent. Test missing lower eligible messages, unreadable ciphertext, history admission, rejoin and multi-device aggregation. |
| COV4-R09 | 4.6 body_ciphertext/body_search_index and 4.16 local body fields can imply unsupported encryption properties. | MSG:C19-W06/MSG:C19-W07/MSG:C19-W09 gate actual protocol, local storage, endpoint enrollment and mode-specific search/media. Account authentication is not cryptographic enrollment; test only after selecting reviewed implementations. |
| COV4-R10 | 4.17 active-device suppression and 4.19 TTL can be mistaken for reliable attention/availability. | MSG:C19-W05 and DEL:C20-W02 treat presence/push as bounded hints. Test lost Redis, revoked heartbeat, multiple devices, invisible/DND and unsupported silent delivery without declaring a human unavailable. |
| COV4-R11 | 4.26 says a unique row prevents duplicate push; 4.28 send_message returns only a string. | DEL:C20-W04/DEL:C20-W10/DEL:C20-W11 retain stable logical effects and typed accepted/unknown/failure evidence. Test timeout after provider acceptance, endpoint replacement and duplicate/reordered callbacks; provider support is not inferred from an interface. |
| COV4-R12 | 4.24 medical wording and 4.29 draft approval may be read as new care/external authority. | C18-W10, C13-W08 and DEL:C20-W03/DEL:C20-W06 retain source-data, caregiver, legal and release gates. Deny prohibited MVP Agent sends/calls and unauthorized private previews even with a generic approval or critical label. |
| COV4-R13 | 4.10 page sizes, 4.15 retry times and 4.19 60-second presence TTL are illustrative. | C7-D10, MSG:C19-D14 and DEL:C20-D14 require workload/capability/retention choices and actual tests. Do not convert examples into SLOs, emergency timing guarantees or measured capacity. |
| COV4-R14 | 4.31.1 ends with States: and no enum or transition definitions. | C13-W03/C13-W04 and C6-W07 supply proposed later job/occurrence workflows. COV-G06 tracks the missing early source definition; fixture or source-text checks cannot approve the actual scheduler state machine. |

### Chapter 5: Agent Runtime Trace

The entire source was read through the final evaluation-test bullet. Its 42 topics describe an early Agent runtime, not 42 separate services or permission to run developer delegates. Chapter 12 remains the runtime owner, with identity, source-domain, messaging, scheduling and delivery boundaries retained. None of these workflows is required to implement the no-Agent M1 slice.

| Source topic | Existing planning trace | Reconciliation boundary |
| --- | --- | --- |
| [5.1 Objective](Chapter5.md#L3) | C12-W01, C12-W02, C12-W04, C12-W06 | User control, scope, approval, audit, budgets and verification are runtime/service duties, not prompt-only safety. |
| [5.2 Agent Types](Chapter5.md#L57) | C12-D03; C12-W01, C12-W02, C12-W08; MSG:C19-W10 | Eight scope roles and seven specialized examples can share configurations/subgraphs. Personal, Space, conversation and coordinator contexts are not mutually inheritable grants; notification/reminder roles do not own deterministic timers or providers. |
| [5.3 Agent Runtime Components](Chapter5.md#L166) | C12 sections 6 and 8 through 12; C10-W05 | Fifteen responsibilities map to shared admission/context/model/tool/approval/memory/verification/budget/audit components. A component diagram does not require fifteen deployable services. |
| [5.4 Agent Gateway](Chapter5.md#L189) | C12-W01; C18-W10 | Authenticate and derive actual actor/scope, validate configuration/consent and persist idempotent run/work intent. requested_mode is not authority; no arbitrary client user/thread identity. |
| [5.5 Agent Run Model](Chapter5.md#L249) | C12-D02, C12-D14; C12-W01, C12-W09 | Durable nine-state source vocabulary needs reconciliation with wait/partial/unknown/cancel phases and typed versioned control state. A row and current_node alone are not a recoverable graph. |
| [5.6 Agent Execution Modes](Chapter5.md#L291) | C12-W01, C12-W06, C12-W11; C10-W05 | Synchronous, asynchronous and streaming are transport/execution choices. Bound short requests; keep long work in owned workers and final persisted output separate from provisional chunks. No live process waits indefinitely for a human. |
| [5.7 LangGraph Workflow Design](Chapter5.md#L345) | C12-D01, C12-D14; C12-W01, C12-W02, C12-W05, C12-W09 | The total=False TypedDict is illustrative, not runtime schema validation. Enforce mandatory server-owned identities, bounded safe state and current authorization before retrieval, not only at a later graph Policy node. |
| [5.8 Graph Nodes](Chapter5.md#L399) | C12-W01 through C12-W06; C12-W09, C12-W10 | Eight source node responsibilities have owners. Context/risk/tool/verification/finalization boundaries persist across re-entry; a model never certifies its own permission or successful effect. |
| [5.9 Model Router](Chapter5.md#L529) | C12-D09; C12-W10 | Task/capability/privacy/latency/cost/availability and user policy govern only approved routes. Product routing does not override the separate development-model restriction or permit undisclosed provider fallback. |
| [5.10 Provider Abstraction](Chapter5.md#L563) | C12-D01, C12-D09; C12-W04, C12-W10 | Five provider-class examples and a dict-returning Protocol are not selected dependencies or proof of typed streaming, cancellation, usage, retention or tool support. COV-G09 requires real capability evidence. |
| [5.11 Prompt Architecture](Chapter5.md#L607) | C12-W02, C12-W03, C12-W04 | Preserve trusted policy/role/context provenance, but do not use prompt layering as the authorization mechanism. Retrieved or user text cannot rewrite tools, source grants or system policy. |
| [5.12 Tool Registry](Chapter5.md#L683) | C12-D04; C12-W04 | Retain eleven named tools as examples, not an enabled toolset. Versioned input/output, caller/scope, timeout, reconciliation and disclosure metadata supplement the illustrative dataclass. |
| [5.13 Tool Categories](Chapter5.md#L726) | C12-W04; C18-W10; DEL:C20-W03 | Read/write/external/high-risk categories are contextual. Sensitive reads and draft writes still require authority; medication, membership, money and external effects are not enabled merely by approval or a registry label. |
| [5.14 Tool Input Validation](Chapter5.md#L788) | C12-W04; C7-D06 | The sample BaseModel does not declare extra-field rejection or validate a string due_at as a temporal intent. COV-G07 requires actual strict input/output schemas and source-domain validation before any effect. |
| [5.15 Tool Execution Contract](Chapter5.md#L824) | C12-W04, C12-W06, C12-W09 | Fourteen execution fields and eight source states need actual operation/effect/attempt identities, protected arguments, versioned receipts and explicit unknown outcomes. Tool return text is not completion evidence. |
| [5.16 Tool Idempotency](Chapter5.md#L858) | C12-D06; C12-W04, C12-W09 | run_id plus tool_call_id works only if stable for the logical effect. Replan, node re-entry or a fresh model-generated call ID cannot authorize repeating an already accepted or unknown effect. |
| [5.17 Approval Workflow](Chapter5.md#L882) | C12-W05; C8-W08; C9-W07 | Review exact permitted data, recipients, tool/action/revision/risk/expiry/reversibility. Approval is durable and attributable, not an opaque yes or authority over another subject's data. |
| [5.18 Approval Revalidation](Chapter5.md#L949) | C12-W04, C12-W05 | All eight source checks remain current at approval/resume and effect commitment. Payload hash alone does not establish recipient authority, valid consent or an unexpired tool grant. |
| [5.19 Human-in-the-Loop States](Chapter5.md#L973) | C12-D02; C12-W05, C12-W09 | Five wait reasons require typed responder/deadline/resume semantics and a released worker. Generic WAIT is not a new accepted enum or permission to patch arbitrary checkpoint state. |
| [5.20 LangGraph Checkpointing](Chapter5.md#L1003) | C12-D14; C12-W05, C12-W09 | PostgreSQL durability, bounded Redis coordination and protected artifact references have owners. Safe serializer/encryption, tenant/thread binding, accepted checkpoint revision and effect reconciliation are not supplied by choosing a checkpointer alone. |
| [5.21 Agent Memory Architecture](Chapter5.md#L1036) | C12-W02, C12-W07; C12-D08 | Five early memory layers describe scope/lifetime; Chapter 12's memory types describe other dimensions. Do not mechanically map personal/Space memory onto semantic/episodic types or promote personal facts into shared memory. |
| [5.22 Memory Write Policy](Chapter5.md#L1126) | C12-W07 | Usefulness, stability, sensitivity, ownership, scope, consent, expiry and source reliability constrain candidates. Model sentiment/health/finance inference is not automatically saved or treated as a confirmed fact. |
| [5.23 Memory Consent](Chapter5.md#L1166) | C12-D08; C12-W07; C8-W08; C9-W07 | Six source statuses and seven user controls need versioned purpose/subject/scope policy. COV-G08 distinguishes delete, correct, disable, explain, revoke and audience change; shared memory is not controlled by one caller alone. |
| [5.24 Memory Retrieval](Chapter5.md#L1211) | C12-W02, C12-W07; C14-W08 | Current identity/history/consent/sensitivity filtering precedes retrieval and ranking. Asking a model to ignore unauthorized candidates cannot undo disclosure. |
| [5.25 Retrieval-Augmented Generation](Chapter5.md#L1245) | C12-W02, C12-W06; C14-W08, C14-W09; MSG:C19-W09 | Seven source categories and the sample metadata are references, not self-authenticating grants. Validate immutable source/version/audience and actual availability; E2E and public/private purpose boundaries still apply. |
| [5.26 Context Budgeting](Chapter5.md#L1281) | C12-W02, C12-W10 | Preserve the current request and required policy/evidence within selected tokenizer/model limits. Summarization cannot widen private scope or silently remove constraints to fit. |
| [5.27 Prompt Injection Defense](Chapter5.md#L1321) | C12-W02, C12-W04, C12-W08, C12-W12 | Untrusted file/web/message/calendar/tool/child data cannot grant tools, URLs or disclosure. Sanitization and labels are not complete prevention; scope/URL/output controls and minimized suspicious-event logging remain independent. |
| [5.28 Agent Loop Protection](Chapter5.md#L1373) | C12-D10; C12-W03, C12-W09, C12-W10 | The example's 8 iterations, 12 tools, 120 seconds, 2 retries and 1 external action are not approved quotas or permission for one external send. Durable aggregate budgets stop and report limited/partial work honestly. |
| [5.29 Agent Cost Controls](Chapter5.md#L1424) | C12-W10 | Reserve and reconcile user/Space/provider/run/child cost, token, tool and time budgets. Restart/retry/parallelism does not reset allowances; actual versus estimated usage and unknown billing remain explicit. |
| [5.30 Agent Cancellation](Chapter5.md#L1469) | C12-W09; C12-W04 | Authenticated cancellation intent stops new eligible effects, propagates cooperative cancellation and retains verified/unknown prior effects. CANCEL_REQUESTED is not proof all in-flight work is undone. |
| [5.31 Agent Notifications](Chapter5.md#L1495) | C12-W04, C12-W06; DEL:C20-W07, DEL:C20-W08, DEL:C20-W10 | Eight source triggers pass through centralized notification policy. Agent draft/approved tool requests do not directly call push/email/WhatsApp or bypass release, recipient and quiet-hour constraints. |
| [5.32 Agent-to-Agent Communication](Chapter5.md#L1533) | C12-W08; C7-W09 | Structured sender/task/scope/deadline/correlation/output contracts preserve least privilege. A permissions array or next_week string is not signed authority or a resolved temporal contract; caller identity and current grants must be derived. |
| [5.33 Coordinator Agent](Chapter5.md#L1586) | C12-D03, C12-D11; C12-W03, C12-W08 | Bounded subgraphs/children may help a justified task; the coordinator gains neither every permission nor unrestricted merged context. Parent budgets/cancellation and result verification remain authoritative. |
| [5.34 Agent Result Verification](Chapter5.md#L1617) | C12-W06; DEL:C20-W11 | Verify actual authorized domain receipts/state and exact intended result. Provider message ID/acceptance, supported delivery observation, human read and domain acknowledgment remain different claims. |
| [5.35 Agent Audit Trail](Chapter5.md#L1651) | C12-W06, C12-W10, C12-W11 | Operational decision/effect/source/cost evidence is scoped and redacted. No raw chain-of-thought, credentials or unrestricted prompts/arguments in traces, client events or support views. |
| [5.36 Agent Database Tables](Chapter5.md#L1687) | C6-W09, C6-W11; C12 section 6; C12-W04, C12-W07, C12-W09 | Twelve source table names and tool/cost field lists are a starting inventory, not delivered DDL. Reuse canonical effect/approval/checkpoint/memory/consent/audit ownership; agent_notifications cannot become an independent send authority. |
| [5.37 Agent API Endpoints](Chapter5.md#L1743) | C7-W06; C12-W11; COV-G07 | All 17 source pairs are mapped below; nine match at least one existing core/runtime inventory, eight require explicit operation reconciliation. No duplicate approval or memory service by path spelling. |
| [5.38 Android Agent Screens](Chapter5.md#L1788) | C8-W07, C8-W08; C12-W11 | Five source screens retain scope, progress, exact approval, memory and settings controls. Auto-action/spend/channel toggles cannot enable prohibited capabilities; pending/offline/expired/revoked states remain honest. |
| [5.39 Web Agent Screens](Chapter5.md#L1888) | C9-W07; C12-W11 | Six source Space routes and eight inspection categories need the approved shell/routing and request-local projections. No private trace/memory in shared SSR/query caches or raw provider state in panels. |
| [5.40 Agent Security Model](Chapter5.md#L1917) | C12-W02, C12-W04, C12-W05, C12-W08; C18-W10 | Least privilege, scope, allowlists, approvals, minimization, secret isolation and effect audit are backend requirements. An approval never overrides a prohibited action or an absent subject grant. |
| [5.41 Agent Failure Handling](Chapter5.md#L1949) | C12-W03, C12-W05, C12-W09, C12-W10 | Five failure categories have bounded pause/fail/reconcile behavior. Missing context is not fabricated; expired approval does not auto-execute; provider fallback retains privacy and retries do not repeat uncertain effects. |
| [5.42 Testing Strategy](Chapter5.md#L1997) | C12-W12; the 32-row test trace below | All source test topics map to existing proposed evidence families. No test fixture/model/provider run or pass rate is created by this trace; COV-G09 remains before-use work. |

#### Chapter 5 Source Vocabulary

These six catalogs retain 44 source entries. Memory scope/lifetime layers, consent status, run state, tool state and waiting reason are different dimensions; their similar labels do not authorize automatic conversion. Tool names are proposed examples, not currently exposed capabilities.

| ID | Source family | Exact source values, in order |
| --- | --- | --- |
| COV5-L01 | 5.5.1 run states | CREATED, QUEUED, RUNNING, WAITING_FOR_APPROVAL, WAITING_FOR_TOOL, COMPLETED, FAILED, CANCELLED, TIMED_OUT |
| COV5-L02 | 5.15.1 tool execution states | REQUESTED, AUTHORIZED, WAITING_FOR_APPROVAL, RUNNING, SUCCEEDED, FAILED, TIMED_OUT, CANCELLED |
| COV5-L03 | 5.19 human waits | WAITING_FOR_USER_INPUT, WAITING_FOR_APPROVAL, WAITING_FOR_MEMBER_RESPONSE, WAITING_FOR_EXTERNAL_PROVIDER, WAITING_FOR_REVIEW |
| COV5-L04 | 5.23 memory consent states | NOT_REQUESTED, PENDING, GRANTED, DENIED, REVOKED, EXPIRED |
| COV5-L05 | 5.12 registry examples | create_task, update_task, create_event, update_event, create_reminder, summarize_conversation, search_approved_files, calculate_cost, request_approval, send_internal_notification, create_external_message_draft |
| COV5-L06 | 5.21 memory layers | Short-Term Context, Conversation Memory, Space Memory, Personal Memory, Long-Term Knowledge |

#### Chapter 5 Source Operations

C7/C12 references are exact method/path inventory matches, not working routes. C7-P67 through C7-P69 use `/approvals`, not `/agent-approvals`; C12-P08/C12-P09 use Agent-nested memory paths rather than the source's global memory paths. COV-G07 reconciles the actual operation, scope and payload before generation, without broad route aliases or separate authorities.

| ID | Source operation | Existing inventory or required contract |
| --- | --- | --- |
| COV5-P01 | `POST /v1/agent-runs` | C7-P63; C12-P01 |
| COV5-P02 | `GET /v1/agent-runs/{run_id}` | C7-P64; C12-P02 |
| COV5-P03 | `POST /v1/agent-runs/{run_id}/cancel` | C7-P65; C12-P03 |
| COV5-P04 | `GET /v1/agent-runs/{run_id}/events` | C12-P07 |
| COV5-P05 | `POST /v1/agent-runs/{run_id}/resume` | C12-P06 |
| COV5-P06 | `GET /v1/agent-tools` | C12-W04, C12-W11; COV-G07 |
| COV5-P07 | `GET /v1/agent-runs/{run_id}/tool-calls` | C12-W04, C12-W11; COV-G07 |
| COV5-P08 | `GET /v1/agent-runs/{run_id}/tool-results` | C12-W06, C12-W11; COV-G07 |
| COV5-P09 | `GET /v1/agent-approvals` | C12-W05, C12-W11; COV-G07 |
| COV5-P10 | `GET /v1/agent-approvals/{approval_id}` | C12-W05, C12-W11; COV-G07 |
| COV5-P11 | `POST /v1/agent-approvals/{approval_id}/approve` | C12-P04 |
| COV5-P12 | `POST /v1/agent-approvals/{approval_id}/reject` | C12-P05 |
| COV5-P13 | `GET /v1/memory` | C7-P70 |
| COV5-P14 | `GET /v1/memory/{memory_id}` | C12-W07, C12-W11; COV-G07 |
| COV5-P15 | `PATCH /v1/memory/{memory_id}` | C12-W07, C12-W11; COV-G07 |
| COV5-P16 | `DELETE /v1/memory/{memory_id}` | C7-P71 |
| COV5-P17 | `POST /v1/memory/{memory_id}/revoke-consent` | C12-W07, C12-W11; COV-G07, COV-G08 |

#### Chapter 5 Source Test Trace

The 32 test labels from section 5.42 are retained in source order: nine unit, nine graph, nine security and five evaluation topics. The cited C12-V families are proposed and NOT RUN; an exact label match is traceability, not evidence that the behavior works.

| ID | Source group | Exact source test topic | Existing proposed evidence |
| --- | --- | --- | --- |
| COV5-V01 | Unit Tests | Permission checks | C12-V01, C12-V02, C12-V08 |
| COV5-V02 | Unit Tests | Tool schemas | C12-V08 |
| COV5-V03 | Unit Tests | Risk classification | C12-V08, C12-V11 |
| COV5-V04 | Unit Tests | Memory scope filtering | C12-V05, C12-V14, C12-V15 |
| COV5-V05 | Unit Tests | Consent checks | C12-V05, C12-V13, C12-V14 |
| COV5-V06 | Unit Tests | Loop limits | C12-V18, C12-V19 |
| COV5-V07 | Unit Tests | Cost limits | C12-V18 |
| COV5-V08 | Unit Tests | Approval expiration | C12-V13 |
| COV5-V09 | Unit Tests | Idempotency | C12-V09, C12-V10, C12-V12 |
| COV5-V10 | Graph Tests | Normal completion | C12-V19, C12-V21, C12-V22 |
| COV5-V11 | Graph Tests | Tool execution | C12-V08, C12-V09 |
| COV5-V12 | Graph Tests | Multiple tool calls | C12-V09, C12-V17, C12-V18 |
| COV5-V13 | Graph Tests | Approval pause and resume | C12-V12, C12-V13 |
| COV5-V14 | Graph Tests | Cancellation | C12-V27 |
| COV5-V15 | Graph Tests | Timeout | C12-V03, C12-V10, C12-V28 |
| COV5-V16 | Graph Tests | Failure recovery | C12-V26, C12-V28 |
| COV5-V17 | Graph Tests | Checkpoint restore | C12-V04, C12-V12, C12-V26 |
| COV5-V18 | Graph Tests | Maximum iteration handling | C12-V18, C12-V19 |
| COV5-V19 | Security Tests | Agent accessing another space | C12-V01, C12-V02, C12-V05 |
| COV5-V20 | Security Tests | Agent accessing personal memory | C12-V02, C12-V05, C12-V14 |
| COV5-V21 | Security Tests | Unauthorized tool call | C12-V08, C12-V20 |
| COV5-V22 | Security Tests | Prompt injection from a file | C12-V07, C12-V20 |
| COV5-V23 | Security Tests | Approval payload modification | C12-V11, C12-V13 |
| COV5-V24 | Security Tests | Replayed approval | C12-V12, C12-V13 |
| COV5-V25 | Security Tests | Removed member resuming old run | C12-V05, C12-V13, C12-V26 |
| COV5-V26 | Security Tests | Cross-user notification leakage | C12-V02, C12-V20, C12-V22, C12-V25 |
| COV5-V27 | Security Tests | External message without consent | C12-V08, C12-V13, C12-V20 |
| COV5-V28 | Evaluation Tests | Correct tool selection | C12-V06, C12-V23 |
| COV5-V29 | Evaluation Tests | Correct argument generation | C12-V06, C12-V08, C12-V23 |
| COV5-V30 | Evaluation Tests | Policy compliance | C12-V20, C12-V23 |
| COV5-V31 | Evaluation Tests | Factual grounding | C12-V21, C12-V23 |
| COV5-V32 | Evaluation Tests | Error handling and recovery | C12-V23, C12-V24, C12-V28 |

Four source JSON examples can be parsed, but they do not validate their schemas, authority, dates or privacy. Four Python snippets are illustrative state/provider/registry/input definitions, not implemented runtime code or selected package versions. In particular, dataclass risk/approval fields are policy inputs, not permission; a returned dict/string or checkpoint is not verified effect evidence. Preserve the original examples and apply the owning strict schemas and failure tests before implementation.

### Coverage Follow-up Register

Each identified gap now has the draft or qualification handoff below. This closes the missing-document routing work, not the policy, implementation or test gate. Existing owning decisions remain OPEN/PROPOSED; actual named assignments and independent approval are still required.

| ID | Owning review role and surface | Supplied draft and remaining acceptance |
| --- | --- | --- |
| COV-G01 | Community/backend lead with Identity, Product and Security; C6-E07/C7-W03/C18-W10 | Draft supplied: [public-content contract](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md) C2-R01 through C2-R15, C2-W01 through C2-W03 and C2-V01 through C2-V05. Exact page capability/target, admission/history, ownership transfer and lifecycle proposals await C2-D01/C2-D02/C2-D03/C2-D06/C2-D12 review and actual concurrency evidence. |
| COV-G02 | Community/backend and client leads with Product, Security and QA | Draft supplied: public contract C2-W04 through C2-W10, C2-P01 through C2-P08 and C2-V06 through C2-V20. Human revision-bound publication, comment controls, retry-safe interactions and private shares/saves are explicit. C2-D04/C2-D05/C2-D07 through C2-D12 and execution evidence remain gates. |
| COV-G03 | Event lead with Product, Identity and Security; C17-D03/C17-D10 | Draft supplied: [event contract](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) Public RSVP Mapping Proposal within C17-W02 maps all six source labels into separate response/admission/attendance facts and specifies field-audience/race tests. C17-D03/C17-D10 stay OPEN; no default roster/location exposure or guest rule approved. |
| COV-G04 | API/community/client/notification leads and QA; C7-D01/C7-D13/C7-D14 | Draft supplied: C2-P01 through C2-P08 account for 36 source operations plus missing commands; C2-W10 retains all ten notification triggers/six preference groups. [API contract](CHAPTER_07_API_REALTIME_CONTRACT.md) Early Source and Public-Domain Wire Handoff defines mandatory operation records. Canonical route/DTO/event review, generated schemas and transport tests remain undelivered. |
| COV-G05 | Messaging/realtime/delivery leads with client and Security review; C7-D02/C7-D06/C7-D07/C7-D08/C7-D13, MSG:C19-D04/MSG:C19-D12/MSG:C19-D14 | Draft supplied: API wire addendum gives eight mappings and discriminating tests alongside COV4-R01 through COV4-R13. Preserve fact/sequence/privacy/provider distinctions, not suffix-based enum conversion. Actual auth/stream/mode/default/schema choices and provider compatibility evidence remain before-use gates. |
| COV-G06 | Scheduler/backend operations leads with Product/Security; C6-W07, C13-W03/C13-W04, C10-W03 | Draft supplied: [scheduling contract](CHAPTER_13_SCHEDULING_CONTRACT.md) Durable Job Transition Proposal gives nine candidate job states, fencing/recovery and effect-uncertainty rules. Chapter 4's source ending remains incomplete. Select/review actual transitions and run crash/cancel/claim/restore tests; no Agent requirement added to M1. |
| COV-G07 | Agent/API/client leads with Security; C12-D02/C12-D13/C12-D14, C7-D14 | Draft supplied: [Agent contract](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) Chapter 5 State Projection Proposal and Operation Completion Proposal define separate wait/run/tool/effect facets, eight missing source operation boundaries and strict typed resume/input/output. All 17 source pairs stay in this index. Actual canonical schemas, compatibility and privacy/security tests remain required. |
| COV-G08 | Agent memory and Data-rights owners with Product/Security; C12-D08, C12-W07 | Draft supplied: Agent Memory Control and Consent Proposal defines all seven source controls, six consent labels, exact-grant revocation and reviewed audience change. C12-D08 stays OPEN for actual consent/retention rules; correction/revocation/derivative/restore evidence remains NOT RUN. |
| COV-G09 | Agent/runtime/QA leads with Technical Co-lead/Security; C12-D01/C12-D09/C12-D10/C12-D12/C12-D14 | Qualification handoff supplied: Agent Runtime Qualification Handoff lists six evidence areas and ties all 32 source test topics to actual C12-V execution. This is not a runtime-complete row: package/provider versions, reviewed limits, named reviewers, authorized fixtures/model trials and real results remain required. Mock success or JSON parsing does not satisfy these gates. |

### Review Outcome and Next Design Work

The targeted topic/catalog/acceptance trace is complete: 94 numbered topics plus Chapter 2's final architecture have review destinations. The nine identified follow-ups now have draft behavior or a concrete qualification handoff. This does not settle every schema, approve policy or supply runtime evidence; all existing OPEN/PROPOSED decisions are unchanged.

- Chapter 2 now has one cohesive [public-content draft](CHAPTER_02_PUBLIC_CONTENT_CONTRACT.md), with 15 authority rows, ten workflows, eight operation families and 20 future evidence families covering all 32 source acceptance criteria. Its 12 decisions remain eight PROPOSED/four OPEN.
- Chapter 4's later owners now include explicit wire-mapping and candidate job-transition addenda. The source ending and unapproved auth/stream/provider choices remain visible; no duplicate communication engine was created.
- Chapter 5's existing runtime now includes state projection, missing-operation contracts, all seven memory controls and a six-area qualification handoff. No package integration, model evaluation or provider result is claimed.

COV-G03/COV-G04 carry public-event and shared API/notification decisions into their existing owners. Role labels still need actual named accountable people and independent review. Later public-community and Agent work is not automatically a prerequisite for the manual M1 slice; only that slice's actual identity, Space, task, scheduling, in-app, client and operational contracts gate its implementation. No implementation or policy approval is granted by closing this documentation review.

No separate contract is required merely to increase file count. Fill a demonstrated gap in its owning existing draft when suitable; create another document only for a real ownership need.

The referenced `packages/openapi/`, `packages/states/`, `docs/CANONICAL_STATES.md` and `docs/milestones/` were not present at this check. They are proposed future outputs, not delivered schemas, validators, client generators or CI. This reconciliation adds none of those implementation artifacts. Their existence and actual validation must be checked again before any work relies on them.

## 7. Use and Verification

For future work, start from the working file and an exact file-qualified requirement, identify unresolved owning decisions and required reviewers, then define a bounded outcome and executable evidence. Preserve the alternate ID in a migration note rather than mechanically renumbering it. Only an actual reviewed decision can change OPEN/PROPOSED to accepted policy; only executed checks against a specific artifact can establish runtime behavior.

Document checks cover source/link integrity, complete fourteen-row decision crosswalks, source catalog/API correspondence, unchanged decision statuses, provisional milestone consistency and preservation of originals. The targeted coverage extension also checks 95 source-topic anchors, Chapter 2's 32 acceptance bullets and 36 operations, Chapter 4's 14 catalogs, and Chapter 5's six catalogs, 17 operations and 32 proposed tests. Source JSON parsing checks syntax only. These checks do not cover cryptography, providers, app rendering, database transactions, real identity/consent enforcement or production operations.

Next is actual owner review of the five proposed ADRs and the applicable domain decisions, with accepted/revised/deferred outcomes and named independent reviewers recorded by authorized people. The public-content draft, Chapter 2/4/5 mapping and duplicate routing need not be recreated. A bounded M1 backlog can then use accepted prerequisites while explicitly tracking unresolved ones. Do not begin scaffolding, create credentials, contact providers, claim COV-G09 passed or approve policy merely because drafting is complete for these identified gaps.