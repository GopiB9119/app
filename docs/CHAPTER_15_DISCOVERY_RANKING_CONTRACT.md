# Chapter 15: Search, Discovery, Feeds, Ranking and Moderation Contract

Status: DRAFT FOR PRODUCT, DISCOVERY, TRUST AND PRIVACY REVIEW. This is a design and verification plan, not an implemented search service, recommendation model, moderation system or measured global-scale platform.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md), [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md) and [file/document](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) drafts. It develops C14-T12 into public-content eligibility and search/feed/moderation contracts.

- [Chapter 15](../Chapter15.md) owns search, discovery, candidate generation, ranking, personalization, reporting and related client surfaces. Content/identity/Space/file domains remain authoritative for their actual objects and grants; this chapter does not create a competing page/post database or complete every publication/interaction CRUD contract.
- [Chapter 16](../Chapter16.md) owns the adjacent trust/operations detail; [Chapter 19](../Chapter19.md) and [Chapter 20](../Chapter20.md) remain encryption and notification dependencies. Search, recommendations and moderation can share infrastructure without sharing unrestricted data or authority.
- Private family/couple/solo conversations, files, care records, calendar data, direct messages and Agent memory are not public-discovery training, feature or candidate sources. Authorized private search is a separate scoped experience. Membership or permission to read privately does not imply permission to distribute publicly.
- M1 remains the synthetic ordinary family task and one-time in-app reminder. A later public-discovery demonstration is a separate slice, not an added M1 prerequisite or evidence that the full MVP exists.
- The source ends at [15.38](../Chapter15.md#L2704) after the main architecture diagram and the sentence promising an independent integrated moderation pipeline. No final pipeline or final acceptance list follows. New workflows/acceptance below are proposed refinements, not recovered source text.
- Preserve all original sources and prior drafts. Continued planning does not approve policy proposals or authorize code, package installs, live queries/crawling, user profiling, moderation actions, provider/model calls, devices, spending, provisioning or deployment.
- All search/index/ranking/recommendation/moderation/client/security/load tests are NOT RUN. Document checks and explicitly synthetic fixture arithmetic are not evidence of runtime privacy, model quality, staffing readiness or production capacity.

## 2. Exact Source Topics and Principles

All thirty-eight numbered topic titles and their source anchors are retained, including the first topic's different heading depth.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C15-S01 | Purpose and Scope | [15.1](../Chapter15.md#L3) |
| C15-S02 | Core Architectural Principles | [15.2](../Chapter15.md#L47) |
| C15-S03 | Content Visibility Model | [15.3](../Chapter15.md#L171) |
| C15-S04 | Content Eligibility States | [15.4](../Chapter15.md#L398) |
| C15-S05 | Global Discovery Model | [15.5](../Chapter15.md#L432) |
| C15-S06 | Feed Architecture | [15.6](../Chapter15.md#L470) |
| C15-S07 | Feed Candidate Generation | [15.7](../Chapter15.md#L650) |
| C15-S08 | Search Architecture | [15.8](../Chapter15.md#L710) |
| C15-S09 | Search Technology Decision | [15.9](../Chapter15.md#L817) |
| C15-S10 | Search Index Document | [15.10](../Chapter15.md#L870) |
| C15-S11 | Ranking Architecture | [15.11](../Chapter15.md#L909) |
| C15-S12 | Ranking Constraints | [15.12](../Chapter15.md#L1015) |
| C15-S13 | Ranking Explainability | [15.13](../Chapter15.md#L1051) |
| C15-S14 | Recommendation Architecture | [15.14](../Chapter15.md#L1083) |
| C15-S15 | Cold-Start Strategy | [15.15](../Chapter15.md#L1127) |
| C15-S16 | Trending Architecture | [15.16](../Chapter15.md#L1165) |
| C15-S17 | Hashtags, Topics, and Categories | [15.17](../Chapter15.md#L1223) |
| C15-S18 | Multilingual Search and Discovery | [15.18](../Chapter15.md#L1301) |
| C15-S19 | Search Suggestions and Autocomplete | [15.19](../Chapter15.md#L1351) |
| C15-S20 | Moderation Pipeline | [15.20](../Chapter15.md#L1399) |
| C15-S21 | Human Review and Appeals | [15.21](../Chapter15.md#L1450) |
| C15-S22 | Spam, Abuse, Fraud, and Bot Detection | [15.22](../Chapter15.md#L1506) |
| C15-S23 | Community Reporting | [15.23](../Chapter15.md#L1549) |
| C15-S24 | Data Model | [15.24](../Chapter15.md#L1616) |
| C15-S25 | Cache Architecture | [15.25](../Chapter15.md#L1785) |
| C15-S26 | Fanout Strategy | [15.26](../Chapter15.md#L1824) |
| C15-S27 | Realtime Feed Updates | [15.27](../Chapter15.md#L1885) |
| C15-S28 | Ranking and Discovery APIs | [15.28](../Chapter15.md#L1917) |
| C15-S29 | Event Contracts | [15.29](../Chapter15.md#L2016) |
| C15-S30 | Android Screens | [15.30](../Chapter15.md#L2066) |
| C15-S31 | Web/Desktop Screens | [15.31](../Chapter15.md#L2156) |
| C15-S32 | Personalization Controls | [15.32](../Chapter15.md#L2228) |
| C15-S33 | Metrics and Observability | [15.33](../Chapter15.md#L2276) |
| C15-S34 | Failure Handling | [15.34](../Chapter15.md#L2384) |
| C15-S35 | Security and Privacy Requirements | [15.35](../Chapter15.md#L2458) |
| C15-S36 | Repository Structure | [15.36](../Chapter15.md#L2524) |
| C15-S37 | Testing Strategy | [15.37](../Chapter15.md#L2614) |
| C15-S38 | Final Architecture Decision | [15.38](../Chapter15.md#L2704) |

The four principle titles from section 15.2 are preserved verbatim.

| ID | Source principle |
| --- | --- |
| C15-R01 | Visibility Before Ranking |
| C15-R02 | Search and Recommendation Are Different Systems |
| C15-R03 | Ranking Must Not Override Safety |
| C15-R04 | Private Content Is Not a Discovery Source |

## 3. Exact Source Visibility and Eligibility

The source enum inventories are preserved without treating audience, lifecycle, delegation and sharing mechanism as one canonical state machine.

| Source list | Values in source order |
| --- | --- |
| Visibility types, 15.3 | PUBLIC, FOLLOWERS_ONLY, MEMBERS_ONLY, SELECTED_MEMBERS, PRIVATE, AGENT_ONLY, TEMPORARY_SHARE, UNLISTED, QUARANTINED, DELETED |
| Eligibility states, 15.4 | DRAFT, PROCESSING, PENDING_MODERATION, PUBLISHED, LIMITED, AGE_RESTRICTED, QUARANTINED, REMOVED, DELETED, APPEALED, RESTORED |

All ten rows and four columns of the source visibility matrix are retained. 'Yes' is conditional on current ownership/authority, lifecycle, moderation, age/region and applicable policy, not a bypass. An Agent, owner or moderator does not gain ordinary disclosure rights to quarantined/deleted or another subject's protected content from this inventory.

| ID | Visibility | Searchable by owner | Searchable by members | Public discovery |
| --- | --- | --- | --- | --- |
| C15-M01 | Public | Yes | Yes | Yes |
| C15-M02 | Followers only | Yes | Followers | No |
| C15-M03 | Members only | Yes | Authorized members | No |
| C15-M04 | Selected members | Yes | Selected users | No |
| C15-M05 | Private | Yes | No | No |
| C15-M06 | Agent only | Authorized agent | No | No |
| C15-M07 | Temporary share | Authorized recipients | Authorized recipients | No |
| C15-M08 | Unlisted | Direct link or authorized access | Based on permissions | No |
| C15-M09 | Quarantined | Moderators/owner based on policy | No | No |
| C15-M10 | Deleted | Audit/recovery rules only | No | No |

The seven explicit state/eligibility pairs in section 15.4 are preserved as separate columns; source arrows are represented by the table relation. They are baseline examples, not the complete transition or age-assurance policy.

| ID | Source state | Source eligibility meaning |
| --- | --- | --- |
| C15-F01 | PUBLISHED | eligible |
| C15-F02 | LIMITED | eligible with reduced distribution |
| C15-F03 | AGE_RESTRICTED | eligible only for allowed users |
| C15-F04 | PENDING_MODERATION | not publicly discoverable |
| C15-F05 | QUARANTINED | not discoverable |
| C15-F06 | REMOVED | not discoverable |
| C15-F07 | DELETED | not discoverable |

Creator review and case-scoped moderation views are different from ordinary search/feed eligibility. `APPEALED` alone cannot restore distribution, `RESTORED` is not an override of later deletion/restriction, and audience/grant metadata must not be inferred from an index document or cached candidate.

## 4. Exact Final Architecture Inventory

The ten labeled components in the section 15.38 main pipeline are retained in order. Its arrows are a conceptual flow, not a claim that each component is a separately deployed service or that a post-ranking filter may replace the initial authorization gate.

| ID | Source architecture component |
| --- | --- |
| C15-B01 | Public Content Store |
| C15-B02 | Visibility and Authorization Layer |
| C15-B03 | Content Eligibility Layer |
| C15-B04 | PostgreSQL FTS + pgvector |
| C15-B05 | Redis Autocomplete and Hot Cache |
| C15-B06 | Candidate Generation Services |
| C15-B07 | Ranking Service |
| C15-B08 | Diversity and Safety Filters |
| C15-B09 | Feed/Search API |
| C15-B10 | Android/Web Clients |

The unfinished final moderation-pipeline sentence stays an explicit source gap. The earlier moderation/report/appeal sections still supply requirements and will be developed without inventing missing final decisions.

### Discovery Surfaces, Candidate Sources and Data Records

The fifteen surfaces in section 15.5 require separate eligibility/candidate policies, not fifteen mandatory deployments.

| ID | Source discovery surface |
| --- | --- |
| C15-G01 | Global search |
| C15-G02 | Home feed |
| C15-G03 | Following feed |
| C15-G04 | Recommended feed |
| C15-G05 | Local discovery |
| C15-G06 | Topic discovery |
| C15-G07 | Event discovery |
| C15-G08 | Page discovery |
| C15-G09 | Group discovery |
| C15-G10 | Hashtag discovery |
| C15-G11 | Trending content |
| C15-G12 | Search suggestions |
| C15-G13 | Related content |
| C15-G14 | Similar pages |
| C15-G15 | Similar events |

All nine candidate-source names in section 15.7 are retained.

| ID | Source candidate generator |
| --- | --- |
| C15-N01 | FollowingCandidateSource |
| C15-N02 | GroupCandidateSource |
| C15-N03 | TopicCandidateSource |
| C15-N04 | TrendingCandidateSource |
| C15-N05 | SimilarContentCandidateSource |
| C15-N06 | LocalCandidateSource |
| C15-N07 | EventCandidateSource |
| C15-N08 | FreshContentCandidateSource |
| C15-N09 | EditorialCandidateSource |

All twelve data-model headings in section 15.24 are retained. These records refine domain-owned projections, signals and cases; they are not applied DDL or authority to duplicate existing content tables.

| ID | Source record |
| --- | --- |
| C15-L01 | content_items |
| C15-L02 | content_topics |
| C15-L03 | hashtags |
| C15-L04 | content_hashtags |
| C15-L05 | feed_candidates |
| C15-L06 | feed_impressions |
| C15-L07 | content_interactions |
| C15-L08 | ranking_features |
| C15-L09 | search_queries |
| C15-L10 | moderation_cases |
| C15-L11 | reports |
| C15-L12 | recommendation_feedback |

### API and Event Inventory

The eleven operation examples in section 15.28 are preserved, including illustrative query strings. Query values are examples, not fixed application behavior; canonical paths and bounded typed parameters follow Chapter 7.

| ID | Source operation example |
| --- | --- |
| C15-P01 | `GET /v1/search?q=festival&surface=global` |
| C15-P02 | `GET /v1/search/suggestions?q=ganesh` |
| C15-P03 | `GET /v1/feeds/home?cursor=...` |
| C15-P04 | `GET /v1/feeds/following?cursor=...` |
| C15-P05 | `GET /v1/feeds/recommended?cursor=...` |
| C15-P06 | `GET /v1/discovery/trending?region=...` |
| C15-P07 | `GET /v1/topics/{topic_id}` |
| C15-P08 | `GET /v1/topics/{topic_id}/content` |
| C15-P09 | `POST /v1/recommendations/feedback` |
| C15-P10 | `POST /v1/reports` |
| C15-P11 | `GET /v1/moderation/cases/{case_id}` |

The first nine event names come from section 15.27. The tenth is the additional distinct name in section 15.29; its other two examples reuse the published/removed events.

| ID | Source event |
| --- | --- |
| C15-E01 | content.published |
| C15-E02 | content.updated |
| C15-E03 | content.removed |
| C15-E04 | content.limited |
| C15-E05 | content.restored |
| C15-E06 | topic.trending |
| C15-E07 | page.followed |
| C15-E08 | recommendation.updated |
| C15-E09 | moderation.action_applied |
| C15-E10 | recommendation.feedback |

### Client Inventories

All twenty-six Android labels from section 15.30 retain their category and wording; typographic double quotes around one explanation label are normalized to ASCII.

| ID | Source category | Source Android surface |
| --- | --- | --- |
| C15-C01 | Discovery Screens | Global search screen |
| C15-C02 | Discovery Screens | Search suggestions screen |
| C15-C03 | Discovery Screens | Search results screen |
| C15-C04 | Discovery Screens | Search filters bottom sheet |
| C15-C05 | Discovery Screens | Topic screen |
| C15-C06 | Discovery Screens | Hashtag screen |
| C15-C07 | Discovery Screens | Trending screen |
| C15-C08 | Discovery Screens | Recommended pages screen |
| C15-C09 | Discovery Screens | Recommended groups screen |
| C15-C10 | Discovery Screens | Recommended events screen |
| C15-C11 | Discovery Screens | Local discovery screen |
| C15-C12 | Feed Screens | Home feed |
| C15-C13 | Feed Screens | Following feed |
| C15-C14 | Feed Screens | Group feed |
| C15-C15 | Feed Screens | Page feed |
| C15-C16 | Feed Screens | Event feed |
| C15-C17 | Feed Screens | Saved content |
| C15-C18 | Feed Screens | Hidden content management |
| C15-C19 | Feed Screens | "Why am I seeing this?" explanation sheet |
| C15-C20 | Moderation Screens | Report content bottom sheet |
| C15-C21 | Moderation Screens | Report confirmation |
| C15-C22 | Moderation Screens | Report status |
| C15-C23 | Moderation Screens | Appeal form |
| C15-C24 | Moderation Screens | Account restriction notice |
| C15-C25 | Moderation Screens | Content removal explanation |
| C15-C26 | Moderation Screens | Community guidelines |

All twenty-six web/desktop labels from section 15.31 are retained. These are surface labels, not a second approved Next.js route tree.

| ID | Source category | Source web/desktop surface |
| --- | --- | --- |
| C15-H01 | Public | Global search page |
| C15-H02 | Public | Search results with filters |
| C15-H03 | Public | Topic landing page |
| C15-H04 | Public | Hashtag landing page |
| C15-H05 | Public | Trending page |
| C15-H06 | Public | Public page discovery |
| C15-H07 | Public | Public event discovery |
| C15-H08 | Public | Local discovery |
| C15-H09 | Public | Related content panel |
| C15-H10 | Authenticated | Home feed |
| C15-H11 | Authenticated | Following feed |
| C15-H12 | Authenticated | Recommended feed |
| C15-H13 | Authenticated | Saved items |
| C15-H14 | Authenticated | Search history |
| C15-H15 | Authenticated | Personalization controls |
| C15-H16 | Authenticated | Hidden/muted topics |
| C15-H17 | Authenticated | Recommendation feedback history |
| C15-H18 | Moderator | Moderation dashboard |
| C15-H19 | Moderator | Report queue |
| C15-H20 | Moderator | Case details |
| C15-H21 | Moderator | Evidence viewer |
| C15-H22 | Moderator | User history |
| C15-H23 | Moderator | Content history |
| C15-H24 | Moderator | Appeals queue |
| C15-H25 | Moderator | Policy decision panel |
| C15-H26 | Moderator | Audit log |

Source interaction states are `Loading`, `Loaded`, `Refreshing`, `Offline`, `Hidden`, `Removed`, `Limited`, `Failed`, `Retrying`. Source feedback values are `NOT_INTERESTED`, `MUTE_TOPIC`, `MUTE_AUTHOR`, `SHOW_MORE_LIKE_THIS`, `REPORT`, `HIDE`. UI progress, feedback, moderation and content eligibility remain different state domains.

### Security and Test Inventories

All nineteen bullet requirements in the search/feed/moderation security subsections of 15.35 are retained verbatim.

| ID | Source category | Source security requirement |
| --- | --- | --- |
| C15-Q01 | Search Security | Apply authorization before result ranking. |
| C15-Q02 | Search Security | Do not expose private titles in autocomplete. |
| C15-Q03 | Search Security | Do not leak existence of private groups. |
| C15-Q04 | Search Security | Do not reveal hidden users through search. |
| C15-Q05 | Search Security | Avoid timing differences that disclose private content. |
| C15-Q06 | Search Security | Sanitize search highlights. |
| C15-Q07 | Search Security | Prevent query injection into search DSLs. |
| C15-Q08 | Search Security | Rate-limit expensive semantic queries. |
| C15-Q09 | Feed Security | Recheck visibility at delivery time. |
| C15-Q10 | Feed Security | Invalidate caches after privacy changes. |
| C15-Q11 | Feed Security | Remove deleted content from candidate stores. |
| C15-Q12 | Feed Security | Do not use private interactions for public recommendations. |
| C15-Q13 | Feed Security | Protect recommendation feedback from unauthorized access. |
| C15-Q14 | Moderation Security | Restrict moderator access. |
| C15-Q15 | Moderation Security | Log every sensitive lookup. |
| C15-Q16 | Moderation Security | Encrypt evidence references. |
| C15-Q17 | Moderation Security | Apply least privilege. |
| C15-Q18 | Moderation Security | Prevent moderators from accessing unrelated private spaces. |
| C15-Q19 | Moderation Security | Separate confidential reviewer notes from user-visible explanations. |

The four Agent role/scope examples in section 15.35 are preserved. They are scoped configurations of the shared runtime, not four new services or blanket moderator powers.

| ID | Source Agent role | Source allowed scope |
| --- | --- | --- |
| C15-U01 | Public Discovery Agent | Can search public content only. |
| C15-U02 | Family Agent | Can search authorized family-space content only. |
| C15-U03 | Personal Agent | Can search user-authorized private content only. |
| C15-U04 | Moderator Agent | Can access moderation evidence only within assigned permissions. |

All thirty-nine test labels from section 15.37 are retained. These are source test requirements, not executed tests; the proposed evidence families below make their observations explicit.

| ID | Source category | Source test label |
| --- | --- | --- |
| C15-A01 | Search Tests | Exact match |
| C15-A02 | Search Tests | Typo tolerance |
| C15-A03 | Search Tests | Multilingual queries |
| C15-A04 | Search Tests | Transliteration |
| C15-A05 | Search Tests | Zero-result behavior |
| C15-A06 | Search Tests | Private-content leakage |
| C15-A07 | Search Tests | Deleted-content exclusion |
| C15-A08 | Search Tests | Search pagination |
| C15-A09 | Search Tests | Search index delay |
| C15-A10 | Feed Tests | Visibility enforcement |
| C15-A11 | Feed Tests | Block/mute filtering |
| C15-A12 | Feed Tests | Duplicate removal |
| C15-A13 | Feed Tests | Diversity constraints |
| C15-A14 | Feed Tests | Cursor stability |
| C15-A15 | Feed Tests | Offline synchronization |
| C15-A16 | Feed Tests | Realtime insertion |
| C15-A17 | Feed Tests | Deleted content removal |
| C15-A18 | Ranking Tests | Ranking version compatibility |
| C15-A19 | Ranking Tests | Explanation correctness |
| C15-A20 | Ranking Tests | Feature fallback |
| C15-A21 | Ranking Tests | Cold-start behavior |
| C15-A22 | Ranking Tests | Safety constraints |
| C15-A23 | Ranking Tests | Bias and language quality |
| C15-A24 | Ranking Tests | Manipulation resistance |
| C15-A25 | Moderation Tests | High-risk content quarantine |
| C15-A26 | Moderation Tests | False-positive handling |
| C15-A27 | Moderation Tests | Human review |
| C15-A28 | Moderation Tests | Appeal restoration |
| C15-A29 | Moderation Tests | Moderator authorization |
| C15-A30 | Moderation Tests | Audit trail integrity |
| C15-A31 | Moderation Tests | Report deduplication |
| C15-A32 | Security Tests | Search injection |
| C15-A33 | Security Tests | Authorization bypass |
| C15-A34 | Security Tests | Cache leakage |
| C15-A35 | Security Tests | Private group discovery |
| C15-A36 | Security Tests | Timing leakage |
| C15-A37 | Security Tests | Rate-limit bypass |
| C15-A38 | Security Tests | Bot behavior |
| C15-A39 | Security Tests | Malicious media metadata |

## 5. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C15-D01 | Public/private purpose separation | Public candidates and personalization features use only eligible public sources and approved public-experience signals. Private search stays scoped; private reads, memory and care data do not train or personalize public discovery. | PROPOSED |
| C15-D02 | Eligibility before ranking | Apply current audience, parent, history, lifecycle, moderation and user restriction policy before candidate/ranking disclosure; keep a final current check without treating it as a substitute. | PROPOSED |
| C15-D03 | Authoritative domain projection | Reuse content-domain truth with revisioned durable outbox/projection and exclusion gates. Index/cache/fanout state is derived and cannot grant access or revive removed content. | PROPOSED |
| C15-D04 | Initial search infrastructure | Start with reviewed PostgreSQL FTS/pgvector plus bounded Redis caching where justified; keep dedicated search-cluster adoption tied to measured requirements rather than assumed global-scale readiness. | PROPOSED |
| C15-D05 | Ranking objectives and quality | Choose released signals, query/recommendation objectives, score normalization, diversity rules, explainability and multilingual quality/safety thresholds before optimizing weights. | OPEN |
| C15-D06 | Feed materialization and pagination | Use domain-appropriate bounded fanout/read assembly and versioned opaque cursor semantics; recheck current eligibility so a feed snapshot cannot preserve revoked disclosure. | PROPOSED |
| C15-D07 | Personalization and data rights | Resolve opt-in/defaults, permitted public signals, age/jurisdiction, history retention, profile reset and deletion propagation. A clear-history control must state what it does and does not remove. | OPEN |
| C15-D08 | Language and local discovery | Define supported language/tokenization/translation and explicit coarse location sources, consent, thresholds and retention. No silent precise-location or private-chat inference. | OPEN |
| C15-D09 | Trending and abuse resistance | Define windows, minimum cohorts, genuine-interaction evidence, anti-coordination review and false-positive/appeal limits. Reports/engagement alone cannot determine guilt or unrestricted distribution. | OPEN |
| C15-D10 | Moderation state and reviewer authority | Separate case, content, account and appeal states; use exact-revision decisions, case-scoped reviewer access, controlled restoration and durable audit/effect records. | PROPOSED |
| C15-D11 | Moderation automation and outage policy | Select approved rule/model providers, launch-category thresholds, human staffing and fail-closed/limited-distribution behavior. Classifier score is evidence, not unrestricted enforcement authority. | OPEN |
| C15-D12 | User controls and client truth | Expose honest reasons, public/restricted context, follow/mute/block/feedback/report/appeal flows and explicit pending states through shared domain APIs. Feedback is not permission to expose hidden data. | PROPOSED |
| C15-D13 | Cache, withdrawal and operations | Current eligibility across caches/search/feeds/notifications/metadata; bounded invalidation, privacy-safe telemetry, deletions and isolated recovery with honest already-delivered limits. | PROPOSED |
| C15-D14 | Capacity, versions and release evidence | Select component/model/configuration versions, rate/cost/resource limits, workload/SLOs, recovery objectives and required real quality/security/load gates. Source numbers and architecture diagrams are not benchmarks. | OPEN |

These eight proposals and six open decisions remain unapproved. A recommendation, ranking fallback or product continuation cannot waive mandatory access, safety, private-data boundaries or required legal review.

## 6. Ownership, Policy Boundaries and Invariants

### Reconcile the Source Diagrams Without Weakening Policy

Principle 4 and section 15.35 prohibit private content/interactions as public recommendation inputs. Section 15.6.4's 'without explicit permission' caveat must not become an exception that silently sends private family, care or intimate data into public ranking. Proposed resolution: any permitted private personalization stays inside its separately authorized private experience. Explicit follows and interests can be public-experience signals under their policy; private group membership/activity does not become a public similarity feature merely because a home feed also has a private module.

The candidate/recommendation diagrams show filters after generation, while Principle 1 requires visibility before candidates/ranking. Every source query must first enforce its surface's current eligible scope. Post-merge and final checks are additional defenses against changes and deduplication mistakes, not permission to retrieve private bodies/features into a public candidate/ranking service. Likewise, metadata filtering after semantic retrieval cannot repair an earlier external embedding/reranking disclosure.

The source mentions public groups and group discovery. Earlier Space contracts keep family/couple/solo/custom/temporary contexts private unless a separately reviewed public-community or opt-in directory projection exists. This chapter does not flip a private Space's database visibility or publish its name, roster, activity or existence. Explicit public publication of group-origin material requires the actual content owner's/subject's authority and group policy, not only a member's access.

### Ownership and Durable Records

| Boundary | Source records | Required refinement |
| --- | --- | --- |
| Content-domain truth | C15-L01 | Reuse typed page/post/comment/event/file/profile ownership, parents and revisions. A discovery projection is not another editable copy or authority to change private source content. |
| Taxonomy and annotation | C15-L02, C15-L03, C15-L04 | Canonical topics, localized aliases, moderated hashtags and versioned attribution/confidence. Preserve display spellings; alias matching is not a grant or evidence of user identity. |
| Candidate materialization | C15-L05 | Surface/source/configuration, source revision, expiry and scope/eligibility epoch; copied eligibility is a hint, not final authorization. |
| Measurement and interaction | C15-L06, C15-L07 | Account/surface/session and stable event identity, actual visible-impression definition, policy-approved purpose and retention. Prefetch/rerender is not another genuine view. |
| Feature and ranking generation | C15-L08 | Approved feature provenance, freshness/missingness, schema/model/policy version and resource/scope. No private-data fallback on cache miss. |
| Search history and suggestions | C15-L09 | Separate per-user recent history from approved aggregate public terms; a low-entropy query hash is not anonymization. |
| Case/report/appeal | C15-L10, C15-L11 | Exact target revision, reporter/evidence scope, reviewer assignment, decision/effect/appeal history and audit. Polymorphic IDs require real typed-parent validation. |
| Feedback and preferences | C15-L12 | Authorized per-user/surface action identity, preference version, current use consent and deletion lineage. Report feedback must link to a real report workflow, not forge an enforcement outcome. |

Add or reuse durable projection jobs/outbox, exclusions, pagination snapshots, preference epochs, trend-window contributions, moderation decisions/enforcement receipts and appeal records as needed. PostgreSQL remains durable truth; Redis and search indexes are rebuildable acceleration. A counter or materialized list cannot override current content/account/parent/age/region/safety policy.

Keep independent dimensions for audience/grants, content publication, moderation/distribution restrictions, account restrictions, report/case and appeal lifecycle. A published child comment still requires its parent's eligible context; a removed parent must not leak through replies, quotes, snippets, share previews, media metadata or notifications. Page attribution and the acting human account remain distinct for authorization/audit; follow/block enforcement must define the relevant visible principal without revealing confidential authorship.

### Discovery Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C15-K01 | Surface and purpose determine eligible sources. | Public search/recommendations never use private content or private interaction features; authorized private modules retain their own context. |
| C15-K02 | Current authority precedes ranking and disclosure. | Actual actor/source/parent/history/lifecycle/moderation/block/mute/age/region constraints in source queries and current response gates. |
| C15-K03 | Projection follows committed revisioned truth. | Atomic domain change/outbox and stable projection identity with tombstones; stale replay cannot restore removed or private material. |
| C15-K04 | Search is bounded, language-aware and safe. | Typed query/filters, maintained tokenizer/normalizer, parameterized retrieval, sanitized highlights, safe suggestions and reviewed provider processing. |
| C15-K05 | Hard constraints cannot become scoring penalties. | Denied content never reaches scoring; missing required policy is unknown/deny, while optional ranking features have explicit fallback. |
| C15-K06 | Features, scores and explanations have provenance. | Versioned approved signal schemas/normalization and deterministic reason codes; no private feature or fabricated explanation. |
| C15-K07 | Feed windows and cursors are scoped and stable. | Opaque bounded snapshot/keyset contract, deduplication/tiebreakers and current reauthorization on every page/replay. |
| C15-K08 | Personalization controls change actual data use. | Purpose-specific collection/use/retention, disabled behavioral history, explicit interests and isolated private modules; reset/delete propagation is auditable. |
| C15-K09 | Trends measure bounded eligible contributions. | Deduplication, capped unique contributors, window/cohort policy and reviewable anti-abuse evidence; raw engagement/reports are not truth. |
| C15-K10 | Publication and moderation bind exact revisions. | Required scan/classification/review state, deterministic outcome authority and fail policy; editing cannot reuse clearance for different content. |
| C15-K11 | Reports and cases have least-privilege access. | Valid target/evidence, protected reporter identity, case-scoped reviewers/Agent tools, conflict controls and audited sensitive lookups. |
| C15-K12 | Appeals and enforcement are durable distinct state machines. | Idempotent decision/effect receipts, independent review, current competing restrictions and safe restoration, not a single APPEALED/RESTORED override. |
| C15-K13 | Withdrawal reaches every derived disclosure path. | Current exclusions plus bounded cache/index/fanout/notification/metadata cleanup, preference epochs and isolated restore. |
| C15-K14 | Client controls reflect domain truth. | Typed shared APIs/events, visible public/private context, honest pending/offline/removed states and accessible stable navigation. |
| C15-K15 | Measurement is minimized and valid. | Authenticated event attribution, privacy-safe query/impression metrics, cohort limits and lineage for analytics/experiments/deletion. |
| C15-K16 | Fallback and release preserve required policy. | Eligible-only degradation, bounded resources/cost, measured language/safety/quality evidence and human-operating readiness. |

## 7. Publication, Indexing and Search Workflows

### C15-W01 Establish or Change an Eligible Content Revision

The owning domain validates the actual actor/page/Space/parent, permitted audience, source version, author attribution and required media scan/moderation. A user cannot set a ready/published/low-risk flag or classify another member's private material as public through a discovery API. Follows, membership, file access, moderation role and Agent delegation are separate authorities. An unlisted or temporary link is not a candidate for global discovery.

Commit a content revision and the necessary publication/eligibility/exclusion change with durable audit/outbox intent. An edit to text, media, audience, target or another material risk field invalidates relevant previous classification/review for that revision. Define whether the old eligible revision stays visible during review or the item is restricted; do not expose an unreviewed replacement under the old published ID or choose a policy implicitly. Optimistic concurrency and idempotency prevent an old composer/reviewer from overwriting the winner.

Removal, privacy narrowing, parent/account restriction or deletion becomes ineligible at current serving boundaries before asynchronous index/fanout cleanup. Cancellation/withdrawal of a scheduled publication rechecks the same current eligibility at its durable dispatch/publish commitment; the scheduler is not a new authority. Public media and derivatives must already have the Chapter 14 scan/audience/version clearance. A human-approved share still cannot override a subject's private-data rights or the existing MVP Agent restrictions.

### C15-W02 Project Indexes, Topics and Candidate References

Build a versioned minimal projection of eligible public content, including actual type/parent/source revision, audience/moderation eligibility, permitted display/search fields, language/taxonomy, approved coarse location and processing/index configuration. Search fields, embeddings, translations and featured summaries are disclosure/processing derivatives; model/provider approval and classification rules apply before external processing. Public profile search respects discoverability/hidden-account settings and cannot expose a private contact graph.

Use stable logical job identity, current source revision and fenced claims for asynchronous indexing. Record accepted work and progress durably; an outbox published marker is not evidence that the search projection completed. Late publish/update jobs cannot overwrite a newer tombstone, restricted state or generation. Retain safe deletion/version evidence through the supported replay window and reconcile missing jobs. An index-delay state can be shown to an authorized creator while direct retrieval still enforces all scan/publication/moderation gates.

Initially review PostgreSQL FTS, trigram and metadata indexes plus compatible pgvector embeddings, with Redis only where useful. Pin tokenizer/language/model/dimension/metric/index versions and use staged compatible generation changes. A dedicated search engine is a later measured capacity/feature decision, not a mandatory first release. External indexes and PostgreSQL are not atomic; every query output must join or otherwise enforce current authoritative eligibility even when index updates lag. RLS/index ACLs need tested role/filter behavior, not assumed safety from their names.

Taxonomy uses controlled categories and versioned moderated topic/hashtag aliases. Preserve original display strings, normalization and script provenance; do not collapse visually confusable or transliterated names into the same identity blindly. Alias changes require invalidation/reindex rules and cannot broaden a content audience. Moderated/removed topics, hashtags, pages or parent events cannot leak through facet counts, suggestions, child snippets or related-content edges.

### C15-W03 Search, Normalize and Suggest Within the Allowed Surface

Resolve an intentional public or authenticated scoped principal and a server-validated surface before selecting sources. A client `surface`, Space ID, region, category or cursor narrows only permitted access. Failed credentials on a protected operation are not silently downgraded to anonymous. The public search path does not look in private indexes first and remove private results later; authorized family/personal search remains an independent data/purpose boundary.

Use maintained Unicode/language/tokenization utilities with explicit normalization, transliteration and bounded typo-expansion policy. Keep the original query and distinguish suggestions from an applied query correction, particularly names, numbers, negatives, dates and exact phrases. Actual support for English/Telugu/Hindi or other released scripts must be evaluated; FTS stemming and cross-language semantic matching do not follow automatically from selecting PostgreSQL or an embedding model. Machine translation of public text retains source/version/status and a user-visible disclaimer; it never translates private text into public fields.

Validate length/filter/operator/range/candidate/time/token/cost bounds and use parameterized database queries or typed search DSL builders. Treat highlighting as untrusted content with escaping/sanitization; no raw markup from a query, post or media title executes in the UI. Search terms in a GET URL can reach browser history, referrers, proxy logs and telemetry; source route examples do not justify logging raw sensitive queries. Adopt redaction/no-referrer/private-response policy and a reviewed request alternative where sensitive scoped search needs one.

Apply eligibility and blocks/mutes before candidate output, feature enrichment or external reranking; normalize/fuse keyword and vector scores without treating incomparable raw scores as calibrated probabilities. Approximate indexes can lose recall under filters; improve bounded retrieval inside the protected scope rather than widen permissions. Exact matches, semantic similarity, freshness and diversity are search-specific objectives, not a reuse of an engagement-optimized recommended-feed score.

Suggestions combine public eligible terms/entities with the requesting user's permitted recent searches in separate keyed projections. Do not turn another person's raw/private or rare identifying query into a popular public suggestion. Aggregated terms require reviewed minimum cohorts, sensitive-term exclusion, retention and abuse controls; hashing low-entropy queries does not anonymize them. Suggestions, zero-result states, counts/facets and response timing must not reveal private group/user/file existence. Rate limits and bounded consistent query paths reduce probing risk; test leakage rather than promise mathematical constant-time search.

Return bounded results with source/content revision, current permitted snippets, stable ordering/cursor contract, reason where supported and truthful freshness/partial-state metadata. No eligible results, unavailable index and insufficient optional semantic capacity are different outcomes; none may expose denied identifiers. Only approved models/services see query text, and an Agent's public discovery role cannot switch to private sources through a request parameter.

## 8. Feed Assembly, Ranking and Personalization

### C15-W04 Assemble a Scoped Feed With Stable Continuation

Home can combine followed public content, eligible recommendations and separately authorized group/event/task/reminder modules. Keep each module's source context, audience and purposes explicit through candidates, features, serialization, cache and telemetry. A private task appearing to its authorized recipient on Home cannot enter a public recommendation/trending corpus or a shared public feed cache. Group feeds use current membership/history and object permissions; private file and Agent updates retain their narrower grants.

Following supports the source's Latest, Relevant and Mixed modes. Latest should have a defined chronological order with a stable identity tiebreaker; do not secretly rerank it by engagement while calling it latest. Relevant/Mixed can use separately versioned approved relevance/diversity policies. Follow/unfollow, creator/page restrictions and muted topics must affect eligible content promptly according to the serving contract. A follow edge is not permission to another private community or historical member-only material.

Followers-only content, where released, uses a separate currently verified follower-audience path inside the personalized feed. It does not enter the global public index or public feature/trend corpus. Comment/reply/reaction/save/follow commands reuse their owning domain's current actor/target/parent policy and stable idempotent effects; a feed impression or public card does not grant mutation rights. Later unlike/unfollow/delete events reconcile their contribution without applying a blind negative counter twice.

Generate bounded source references, resolve current eligibility, merge by canonical content/version identity and deduplicate under a declared repost/quote/updated-content policy. Reposts and wrappers must not launder removed or private originals; fresh commentary is a distinct domain decision with its own permitted content and provenance. Fanout-on-write copies references rather than unlimited private payloads. Large pages/read-time recommendations, authorized private-group reads and precomputed trends use the source's hybrid approach where measured; millions of followers are not permission for unbounded synchronous fanout.

Choose opaque versioned keyset or bounded ranked-snapshot cursors per surface/mode. Bind principal/scope, query/filters, preference and ranking/index generation, stable sort tuple or manifest position and expiry. A raw offset into a changing score list is not stable pagination. Do not expose hidden IDs or a global sequence/count through tokens. If required configuration changes invalidate a cursor, return an explicit restart/resync outcome rather than silently skip/duplicate content or replay another account's snapshot.

Reauthorize every selected item and parent at each page/refresh/replay. A snapshot freezes ordering, not permission: removed or newly blocked entries disappear. Advance past excluded positions using bounded scan/backfill rules; return fewer eligible items or an explicit exhausted/degraded page when necessary, without leaking why a hidden entry existed. Define whether newly published items await refresh and how edits maintain stable row identity. Never fill a short page with denied content just to meet a page size.

Saved content is an authorized reference, not a perpetual copy/grant. Hidden-item management belongs to its own user. Offline clients can show only the permitted retained cache under the earlier client policy, with honest freshness and revocation limits; old downloaded bytes cannot be recalled, but next server access/replay must not renew withdrawn authority.

### C15-W05 Score, Diversify and Explain Eligible Candidates

Hard exclusions are not finite negative weights. The source's not-visible, blocked author, muted topic, removed/quarantined, unauthorized group, unsatisfied age restriction and regional restriction conditions run before scoring. Unknown required age/region/visibility/moderation policy is not an eligible default. LIMITED must specify allowed surfaces and a constrained distribution policy; a huge relevance or engagement score cannot restore full reach.

Use versioned surface-specific feature schemas, model/rule configuration and deterministic tiebreakers. Preserve feature origin, age, missingness and validity; optional freshness/relevance/quality features have explicit fallbacks, but missing current safety or authority cannot use a stale permissive feature. Client-supplied scores, counts, age claims or reason codes are not trusted. Same-dimension vector compatibility and approved public signal provenance apply to learned and heuristic rankers alike.

Search prioritizes requested relevance; recommendations optimize the reviewed usefulness/safety/diversity objectives, not raw session depth alone. Normalize scores before any weighted combination, test score ranges/NaN/infinity, and document clipping/threshold behavior. The source soft-score formula lists concepts, not approved weights or a trained model. Penalizing spam probability may be appropriate within the eligible set, but confirmed exclusion policies remain absolute.

Apply reviewed author/topic/format/region/language diversity and repetition limits with deterministic behavior across a page or session window. State whether a limit is hard or soft. A too-small eligible corpus may yield an underfilled page; soft-limit relaxation needs an explicit rule and cannot relax privacy, blocks or required safety. Paid/editorial promotion, if ever released, needs labeling, ownership and frequency gates; editorial priority is not a moderation exception.

Generate explanations from approved reason codes with permitted evidence such as an explicit follow or selected region. Choose a reason that actually contributed under the selected policy and is still true for the response; do not claim 'because you follow' after unfollow or invent a reason for a fallback. Do not expose private membership, other users' behavior, sensitive inferred attributes, confidential authorship or anti-abuse thresholds. Model-generated persuasive copy is not a replacement for factual explanation provenance.

### C15-W06 Apply Personalization, Language and Local Controls

Separate collection, use, retention and deletion for search history, impressions, public interactions, explicit interests and private-context activity. The global 'Use my activity to personalize recommendations' control must disable broad behavioral-history use in candidates, features, embeddings, caches and experiments, not merely hide a label. Current query, approved explicit follows/interests and required safety can still apply; private membership remains confined to the authorized private module rather than a public similarity feature.

Cold start uses declared language, interests, region and approved public choices. The source 40/20/20/10/10 mix is an illustrative configuration requiring evaluation, not a launch promise. Define fallback when a category has no eligible content and cap exploration; new/empty profiles do not justify guessing religion, health, relationships or other sensitive traits from private context or proxies. Similar-user aggregates require approved public signals, minimum cohorts and leakage/bias review, not a private social graph export.

Local discovery defaults to a deliberately selected or separately consented coarse region. Event venue location may be public while an attendee's location is not. Neighborhood/precise location, IP/device inference, retention and proximity minimums need explicit approval and safety review. Do not reveal exact home/work coordinates, membership or attendance through sparse counts, recommendations, explanations or distance sorting. Languages, local topics and machine translations are user-visible preferences/data, not reliable proxies for identity or legal jurisdiction.

Feedback binds actor, content/surface, action key and preference version. Not interested, Hide, Mute author/topic, Show more and Report have distinct scopes, undo and persistence semantics; none automatically enforces a platform violation. Mute/block remain hard exclusions on the surfaces where policy applies and are not erased by a positive recommendation action. A Report action creates or links a report receipt under C15-W09; retrying feedback does not create repeated reports or notifications.

Clear history, reset recommendations, disable personalization and delete account are different actions with explicit effects and retention disclosures. Remove eligibility for disallowed feature use before background feature/cache cleanup; delayed event ingestion cannot repopulate a cleared profile from an older epoch. Already trained models/aggregates need an approved retention/retraining or data-rights strategy, not an unsupported promise of instant unlearning. No such training or activity collection is authorized by this design.

## 9. Trending, Interaction Integrity and Abuse

### C15-W07 Aggregate Eligible Contributions and Review Manipulation

Define an actual impression, click, meaningful interaction and trend contribution before measuring them. A server returning a candidate, browser prefetch, repeated composition, auto-refresh or duplicate mobile retry is not necessarily another viewed item or unique participant. Use validated account/surface/content/revision/event identity and reviewed visibility/exposure evidence, with reasonable offline reconciliation and fraud limits. Do not trust arbitrary client counts, timestamps or opaque identities as proof of genuine independent people.

Windowed trends combine approved public signals such as capped unique participation, discussion, saves or public event interest. Version the event-time/processing-time window, late-arrival/watermark policy, expiry, per-person contribution cap, qualifying cohort and topic/region grouping. A removed/private item or disallowed interaction must become ineligible at serving and be reconciled from future aggregates under policy; stale counters cannot keep it trending. A trend explanation such as the source six-hour example must match the actual computed window, not a static label.

Deduplicate contributions and compare multiple indicators of coordination, content repetition and unusual velocity. Report volume can prioritize review but is not proof of guilt; popularity alone is not proof of quality. Shared IPs, family devices, new accounts, language communities and legitimate rapid interest can produce misleading signals. Device/IP analysis and fingerprinting require reviewed lawful purpose, minimization and retention; they are not unrestricted collection permission.

Use reviewable graduated responses, not an irreversible single-score verdict. The source levels are Observe, Rate Limit, Require Verification, Reduce Distribution, Temporarily Restrict, Quarantine Content, Suspend Account and Escalate to Human Review. Enforcement authority and appeal requirements depend on the actual action; a recommendation worker cannot suspend an account directly. Aggregate floors, risk thresholds and investigator evidence remain protected, while user-facing reasons explain the applied policy appropriately.

Keep contribution/cost/rate limits at account, source, region/window and global levels with bounded computation and safe degraded behavior. Automated requests or repeated reports cannot exhaust reviewers indefinitely or boost content merely by generating measurement events. Human-reviewed editorial and major-trend interventions are attributable/versioned and cannot bypass current privacy or mandatory safety gates.

## 10. Moderation, Reporting and Appeals

### C15-W08 Classify and Apply a Reviewed Publication Policy

Run required pre-publication validation/spam/safety checks against the exact text/media/source revision and declared audience. Post-publication reports, new detection and behavioral signals may reopen evaluation without rewriting historical decisions. File/media quarantine and scan evidence comes from Chapter 14; a classifier only seeing text must not claim unseen media was reviewed. Models/providers see only authorized necessary data under their own privacy/capability gates.

The eight source outcomes are `ALLOW`, `ALLOW_WITH_LIMITS`, `AGE_RESTRICT`, `REQUIRE_EDIT`, `QUARANTINE`, `REMOVE`, `ESCALATE_TO_HUMAN`, `ACCOUNT_REVIEW`. Treat these as proposed domain decisions with explicit permission and effects, not arbitrary model output applied as code. Preserve policy/rule/model versions, reason codes, uncertainty and input/evidence references. Classifier confidence is not calibrated truth across languages or an unconditional authority for irreversible actions.

Preconditions include current target revision, actual actor/reviewer/service capability, source/parent/account state, age/region rules and any required review. REQUIRE_EDIT needs a new reviewed revision, not a client flag clearing the restriction. An ALLOW result cannot override another active legal/account/parent restriction. A public page moderator's local authority differs from platform enforcement; neither receives every user's private content by role label.

Define outage/timeout policy by released risk category and required checks. A low-risk delayed-review path can publish only if an explicitly approved policy permits it and required other gates pass. High-risk or unclassified required-check failures remain quarantined/restricted until a valid decision; do not classify unknown risk as low merely because the classifier is down. Model fallback requires approved privacy/capability/language evidence and cannot silently lower a safety threshold.

Apply allowed actions through deterministic domain services with expected version and stable decision/effect identity. Commit restrictions, case history, required audit and outbox intent durably; retry/replay cannot apply an old removal to an unrelated edited target or emit duplicate notices. External notifications follow Chapter 20 and may be uncertain/in flight; they do not define whether the restriction is currently effective. C15-W10 enforces current visibility while caches and indexes catch up.

### C15-W09 Submit Reports, Review Cases and Resolve Appeals

Validate reporter identity/eligibility, typed target/parent and current permitted evidence submission without turning reports into a private-ID existence oracle. Bind uploaded evidence to safe immutable versions and disclose what the reporter shares with reviewers. Reports about private messages under Chapter 19 require an explicit supported reporting/selected-evidence model; a report or moderator badge does not provide universal decryption or access to the surrounding conversation.

Idempotency prevents repeated submission of the same logical report; broader report clustering may link cases while retaining independent reporters/evidence and protecting their identities. Limit abuse without assuming a high report count proves misconduct or suppressing all repeat concerns. Provide a protected report receipt/status and relevant outcome, never confidential reviewer notes, other reporters, private evidence or exploitable thresholds. Evidence/description fields are untrusted content, not Agent instructions.

Case assignment controls reviewer jurisdiction/capability, queue priority, conflicts of interest, separation of duties and second-review requirements. Each sensitive lookup is currently authorized and audited; page/family administrators are not platform moderators. Case-scoped user/content history includes only relevant approved context, with separate evidence, automated output, previous decisions, reviewer notes and confidential material. Quarantined files render through safe review tooling, not privileged application-origin previews. A Moderator Agent is a narrow assistant under the same controls, not an autonomous enforcement owner.

Use an expected case/target revision and durable transition/effect receipts for concurrent reviews. Separate 'decision recorded' from all downstream notifications/purges completing. Preserve reason/policy provenance and qualified correction history; an old queued reviewer result cannot replace a newer decision or a source edit silently. Access to evidence can be retained under a lawful case purpose after public withdrawal without restoring its ordinary visibility.

Appeals reference the actual restriction/decision, eligible appellant and review window. Validate the appeal, assign an appropriately independent reviewer and resolve that action, not every restriction on the account or content. An appeal-open state does not automatically restore reach. Restoration must recheck current owner intent, version, scan/eligibility, deletion, age/region, account/parent and other independent restrictions. Overturning decision A does not erase decision B or publish a file the owner later deleted.

Record outcome, user-safe explanation and notifications with idempotency and current audience. Define which distribution/features need recomputation after an overturn; do not reuse tainted or stale aggregates to force a ranking result. Case/evidence/report/appeal retention, legal holds, deletion rights and access revocation require Chapter 16/11 policy and qualified jurisdiction review. No moderation staffing, legal compliance or classifier accuracy has been demonstrated here.

## 11. Cache, Fanout and Withdrawal Consistency

### C15-W10 Keep Every Derived Surface Within Current Eligibility

Public shared caches contain only explicitly eligible public projections. Personalized/private modules need principal/context, purpose, surface, filters/locale/region, preference/permission epoch and content/index/ranking version dimensions as applicable. The source cache-key examples omit some of these dimensions and are not copy-ready complete keys. A raw search query, bearer token or private group identifier in a loggable key can itself leak information; use protected keyed representations where needed without claiming that a hash makes low-entropy data anonymous.

Check current authoritative exclusions/grants on delivery even if a candidate list, feature snapshot or signed cursor was generated earlier. Invalidate caches/materialized references after privacy changes, but do not make queue speed or TTL the only enforcement. A fanout cleanup lag cannot leak a removed post through feed text, a child comment, media, saved content, related items, autocomplete, counts, open-graph metadata, sitemaps, RSS-like exports or a notification worker.

Truly public responses may use reviewed CDN/SSR caching only under a stated eligibility/purge policy. A stale public CDN copy or externally downloaded/search-engine copy cannot be universally recalled; if the product requires current per-request revocation, use a serving path that enforces it rather than assert that a short TTL does so. RSC/prefetch/private image optimizers/browser history/BFCache and offline caches follow the earlier web/Android disclosure limits. No sensitive response is cached publicly for convenience.

Apply preference revocation, account closure, content deletion and moderation changes through durable revisioned exclusion/tombstone intent plus cleanup/reconciliation. Trace derived indexes, feature snapshots, candidate lists, translations/embeddings, history/profiles, notification intent and analytics under their retention policy. An old event, dropped cleanup message or background reindex cannot restore withdrawn eligibility. Backup restore stays isolated until current privacy/restriction/delete decisions and post-snapshot effects are reconciled.

Redis/search/ranking outages may reduce optional personalization or fall back to fresh relevance/chronological eligible data. They cannot drop blocks/mutes, current visibility, age/region limits or required moderation because a policy cache is unavailable. Recover required policy from its durable source or fail closed for the affected surface. Cached ranking is usable only when its scope/configuration/current eligibility are still valid; unknown safety is not a ranking feature default.

## 12. API, Client, Realtime and Operating Contract

### C15-W11 Expose Scoped Results and Honest User Controls

Use the Chapter 7 canonical schemas, current authorization, version/conditional writes, protected cursor/idempotency receipts and safe errors. Intentional public reads may be anonymous; personal feedback/history, private feeds and cases require their actual actor permissions. Admin UI, local filtering or a requested surface is never final authorization. Source event examples' `event_type`, `occurred_at` and lowercase state spellings must be reconciled with the canonical envelope/state schemas, not introduced as another competing wire format.

All fifteen discovery surfaces and nine generators map once to their primary behavioral group below. Implementations can reuse a permitted generator across groups without merging public/private authority.

| Primary group | Source discovery surfaces | Source candidate generators | Owning workflows |
| --- | --- | --- | --- |
| Query, taxonomy and suggestions | C15-G01, C15-G06, C15-G10, C15-G12 | C15-N03 | C15-W02, C15-W03 |
| Home and following composition | C15-G02, C15-G03 | C15-N01, C15-N02 | C15-W04 |
| Recommended and related/similar public items | C15-G04, C15-G13, C15-G14, C15-G15 | C15-N05, C15-N08, C15-N09 | C15-W05, C15-W06 |
| Local and public event/page/group directories | C15-G05, C15-G07, C15-G08, C15-G09 | C15-N06, C15-N07 | C15-W02, C15-W03, C15-W06 |
| Trending | C15-G11 | C15-N04 | C15-W07 |

All eleven source API examples and ten event names map once below; query parameters remain typed examples rather than literal fixed filters.

| API group | Source operations | Contract |
| --- | --- | --- |
| Search and suggestions | C15-P01, C15-P02 | C15-W03: bounded public/scoped queries, approved normalization/highlights and separate personal history. |
| Feed continuation | C15-P03, C15-P04, C15-P05 | C15-W04, C15-W05, C15-W06: scope/mode/generation-bound cursors and current eligibility. |
| Trends and taxonomy | C15-P06, C15-P07, C15-P08 | C15-W02, C15-W07: moderated eligible entities and privacy-safe region/cohort aggregates. |
| Recommendation feedback | C15-P09 | C15-W06: authenticated distinct action meanings, expected preference version and idempotency. |
| Report and case read | C15-P10, C15-P11 | C15-W09: exact target/evidence and case-specific permission, not a universal report-history endpoint. |

| Event group | Source events | Projection rule |
| --- | --- | --- |
| Content publication/revision | C15-E01, C15-E02 | Committed revision and permitted current projection, not automatic insertion into every visible feed. |
| Restriction/restore | C15-E03, C15-E04, C15-E05 | Reconcile actual active constraints; restoration never bypasses later deletion or reveals confidential reasons. |
| Trends | C15-E06 | Eligible window/topic/region projection without rare-user identifiers or raw private signals. |
| Personal changes | C15-E07, C15-E08, C15-E10 | Requesting account's permitted preferences/refresh intent, not broadcast behavioral history. |
| Moderation | C15-E09 | Case-scoped sensitive outcome and separately minimized user-facing notice. |

Schema gaps include follow/unfollow, modes and private-module scope, group/page/event feeds, saves/hides/block/mute/history/reset, taxonomy moderation, report receipt/status, appeal submission, case assignment/decision/restoration and experiment/admin configuration. Reuse owning Chapter 7/16/domain contracts before adding paths. A GET must not perform a follow/report/approval mutation. Idempotent retries return only currently permitted receipts; mutable preference writes cannot silently overwrite another tab/device's newer state.

Realtime uses scoped sequence/barrier/replay rules and stable content identities. A 'new posts available' indicator preserves scroll position; removal/revocation is enforced immediately in permitted local state rather than waiting for an optional refresh to keep showing withdrawn content. Clients re-fetch authorized projections instead of trusting event payloads or local visibility rules as permission. Reconnect/account-switch and old-pagination responses are generation-bound; no old account's suggestions or private Home cards enter the new account's state.

| Client flow | Source Android surfaces | Source web/desktop surfaces | Required experience |
| --- | --- | --- | --- |
| Search/filter/suggest | C15-C01, C15-C02, C15-C03, C15-C04 | C15-H01, C15-H02 | Clear public/scoped context, bounded filters, original/corrected query and truthful empty/error states. |
| Topics and hashtags | C15-C05, C15-C06 | C15-H03, C15-H04 | Localized display/aliases, eligible content and controlled follow/mute behavior. |
| Trending and local | C15-C07, C15-C11 | C15-H05, C15-H08 | Actual time window/coarse selected region, privacy-safe reasons and no inferred precise location. |
| Recommended entities and related items | C15-C08, C15-C09, C15-C10 | C15-H06, C15-H07, C15-H09 | Public eligible entities with honest reasons and no private-Space discovery. |
| Home and contextual feeds | C15-C12, C15-C13, C15-C14, C15-C15, C15-C16 | C15-H10, C15-H11, C15-H12 | Stable modes/cursors/new-content indicator and visibly distinct authorized private modules. |
| Saved and hidden content | C15-C17, C15-C18 | C15-H13, C15-H16 | Current-access references, scoped undo/mute controls and safe removed/unavailable state. |
| Reasons, history and preferences | C15-C19 | C15-H14, C15-H15, C15-H17 | Approved reason codes and real disable/reset/delete effects with clear scope. |
| Reports and status | C15-C20, C15-C21, C15-C22 | No dedicated label in section 15.31 | Protected target/evidence selection, pending receipt, non-confidential status and duplicate prevention. |
| Appeals, restrictions and guidelines | C15-C23, C15-C24, C15-C25, C15-C26 | No dedicated end-user label in section 15.31 | Actual decision/reason, appeal eligibility and honest pending/restoration outcome. |
| Case-scoped moderation | No moderator console in section 15.30 | C15-H18, C15-H19, C15-H20, C15-H21, C15-H22, C15-H23, C15-H24, C15-H25, C15-H26 | Assigned evidence, source/model/notes separation, independent review, least privilege and audit. |

Missing end-user web or mobile preference surfaces must be deliberately added if needed for the released workflow, not inferred to exist from a table label. Use the established unframed operational design, familiar icons with accessible names, segmented feed modes, filters/menus, binary preference toggles and stable list dimensions. Support long/mixed-script text, RTL, large type, keyboard/screen readers/TalkBack, reduced motion and non-color status. No autoplay or infinite-scroll behavior may override accessibility/user settings; provide predictable continuation and position recovery.

### C15-W12 Measure, Degrade and Release With Evidence

Keep source section 15.36's module responsibilities without assuming its `apps/services/packages` tree overrides previous monorepo choices or requires separate deployed microservices. Domain-owned API/search/ranking/recommendation/moderation modules plus separately executable workers fit the current modular-monolith approach. Shared schema/policy libraries need versioned compatibility; clients do not own ranking or authorization policy through copied code.

Bound query expansion, candidate fanout, feature reads, vectors/model calls, impression ingestion, aggregate windows, queue backlog, moderator workloads and database/Redis pools per account/surface and globally. Cache failure must not cause unrestricted database fanout or disable required abuse gates. Protect ordinary APIs/reminders from expensive discovery and media work. Human review capacity, escalation paths and appeal timelines are release prerequisites for policies that depend on them, not free unlimited services.

Version experiments with approved public data/signal purposes, stable assignment and required safety exclusions across every arm/control/fallback. Do not experiment away consent, privacy or required moderation, and do not expose a control group to disallowed content to measure engagement. Distinguish offline synthetic/golden ranking tests, limited authorized experiments and measured production outcomes. Signal provenance, learning/training and deletion strategy must be approved before collecting or using real behavior.

Measure search latency/quality/index freshness, feed duplicates/diversity, useful interaction/negative feedback, trend abuse, and moderation precision/recall/review time/overturns with defined denominators and independent labels. Reports per 1,000 observed views is not a violation rate; appeal overturn rate is not classifier accuracy. Language/region/content/device/surface/account/moderation segmentation needs minimum cohorts and privacy-reviewed storage/export. Never optimize raw engagement while hiding leakage, safety failures, sparsely served languages or moderation backlog.

Use minimal protected correlation/audit references, not raw queries, content, private group names, feature vectors, evidence payloads or reviewer notes in ordinary logs/metrics/session replay. Maintain required sensitive-lookup/action audit durably and assess actual tamper/access/retention controls. Guard exports, caches and debug endpoints as carefully as UI responses; aggregate statistics are not automatically anonymous.

Test real index/filter/tokenizer/ranker/cache/queue and client behavior in isolated synthetic environments. Exercise index lag, ranking/semantic/Redis/classifier outage, lost jobs, stale snapshots, version upgrades, parent removal, preference reset, concurrent decisions and restored backups. Fall back only to still-eligible sources with honest reduced/partial behavior. A retrieval diagram, mock classifier or synthetic score check is not proof of language quality, legal compliance, fairness, constant-time behavior or a globally scalable deployment.

## 13. Proposed Verification and Synthetic Controls

The thirty-nine source test labels in section 4 are not a complete test suite or a final source acceptance section. The following thirty-two proposed evidence families specify observable behaviors for those requirements. All application/index/ranking/model/moderation/client/security/load tests remain NOT RUN; a family can need many scenarios, and these row counts are not passing-test counts.

| ID | Verification family and required evidence | Traceability |
| --- | --- | --- |
| C15-V01 | Public/private scope: all ten visibility types, real actor/parent/history/subject/Agent authority, public-group ambiguity and mixed Home modules; denied content/features never enter a public candidate service or reveal existence. | C15-S01, C15-S02, C15-S03, C15-S04; C15-R01, C15-R04; C15-A06, C15-A10, C15-A33, C15-A35; C15-Q03, C15-Q04, C15-Q12; C15-K01, C15-K02; C15-W01, C15-W03, C15-W04 |
| C15-V02 | Publication revision and hierarchy: edited media/text/audience, parent/account/age/region changes, old clearance, concurrent writes and cancelled scheduled publication cannot disclose an unreviewed or unauthorized revision. | C15-S03, C15-S04, C15-S20, C15-S24; C15-A10, C15-A22, C15-A39; C15-K02, C15-K03, C15-K10; C15-W01, C15-W08 |
| C15-V03 | Durable projection and index delay: before/after commit faults, lost publish, retries, stale worker/model generation and delete-before-index preserve one current projection; creator status/direct reads remain authorized. | C15-S09, C15-S10, C15-S24, C15-S34; C15-A07, C15-A09; C15-Q11; C15-K03, C15-K13, C15-K16; C15-W01, C15-W02, C15-W10 |
| C15-V04 | Search relevance: exact phrase/name/ID, typed filters, bounded typo expansion, preserved original correction and truthful zero/partial/outage states using the real selected query engine. | C15-S08, C15-S09; C15-R02; C15-A01, C15-A02, C15-A05; C15-K04, C15-K16; C15-W03 |
| C15-V05 | Language and taxonomy: supported multilingual/mixed-script/transliteration/alias/region variants, confusables, versioned public translation and tokenizer/model limits; measure quality without importing private language data. | C15-S17, C15-S18; C15-A03, C15-A04, C15-A23; C15-K01, C15-K04, C15-K06; C15-W02, C15-W03, C15-W06 |
| C15-V06 | Suggestion and query privacy: per-user history separation, rare/sensitive query exclusion, reset/retention, URL/referrer/log/cache paths and hidden-title/group/account count/timing probes. | C15-S19, C15-S24, C15-S32, C15-S35; C15-A06, C15-A35, C15-A36; C15-Q02, C15-Q03, C15-Q04, C15-Q05; C15-K01, C15-K04, C15-K08, C15-K15; C15-W03, C15-W06 |
| C15-V07 | Hostile query and metadata: parameterized SQL/DSL, bounded expensive operators/semantic calls, sanitized highlights, crafted topic/media text and least-privilege Agent scope before provider disclosure. | C15-S08, C15-S10, C15-S35; C15-A32, C15-A37, C15-A39; C15-Q06, C15-Q07, C15-Q08; C15-K02, C15-K04, C15-K16; C15-W02, C15-W03 |
| C15-V08 | Candidate source boundaries: fifteen surface policies and nine generators enforce current eligible scope before merging/feature enrichment; copied eligibility, global top-k and post-filter-only paths cannot leak or widen permission. | C15-S05, C15-S06, C15-S07, C15-S14; C15-R01; C15-A06, C15-A10, C15-A22; C15-Q01, C15-Q09; C15-K01, C15-K02, C15-K05; C15-W03, C15-W04, C15-W05 |
| C15-V09 | Feed composition and fanout: private Home/follower-only modules, group/history, Latest/Relevant/Mixed semantics, stale references, repeated wrappers/reposts and removed originals remain scope-safe without duplicate items. | C15-S06, C15-S07, C15-S26; C15-A10, C15-A12, C15-A17; C15-K01, C15-K02, C15-K03, C15-K07; C15-W04 |
| C15-V10 | Search/feed pagination: stable tiebreakers/snapshot windows, inserts/edits, cross-account/filter/mode cursor replay, expiry and removed-between-pages positions avoid leak/duplicates and handle bounded underfill honestly. | C15-S08, C15-S25, C15-S28; C15-A08, C15-A12, C15-A14; C15-K02, C15-K07, C15-K13; C15-W03, C15-W04, C15-W10 |
| C15-V11 | Hard constraints before scores: high engagement/private/blocked/muted/removed/quarantined/age-or-region-denied candidates are excluded before scoring; missing required policy cannot be a permissive optional-feature fallback. | C15-S04, C15-S11, C15-S12; C15-R03; C15-A11, C15-A22; C15-Q01; C15-K02, C15-K05, C15-K16; C15-W05 |
| C15-V12 | Ranking compatibility and reasons: versioned feature schema/model/normalization, NaN/range/missing inputs, deterministic ties and actual explanation evidence; unfollow/fallback/private-feature changes cannot produce fabricated reasons. | C15-S11, C15-S12, C15-S13; C15-A18, C15-A19, C15-A20; C15-K05, C15-K06; C15-W05 |
| C15-V13 | Diversity, repetition and cold start: sparse corpora, per-author/topic/format limits, explicit soft-limit policy and approved mix/fallback produce safe underfill; evaluate language coverage and utility beyond engagement. | C15-S06, C15-S11, C15-S14, C15-S15; C15-A13, C15-A21, C15-A23; C15-K05, C15-K06, C15-K08, C15-K16; C15-W04, C15-W05, C15-W06 |
| C15-V14 | Personalization opt-out and reset: collection/use/retention distinctions, no behavioral-history features when disabled, explicit-interest fallback, old-epoch ingestion/cache/training lineage and separate private membership behavior. | C15-S14, C15-S15, C15-S24, C15-S32; C15-R04; C15-A06, C15-A20, C15-A21; C15-Q12, C15-Q13; C15-K01, C15-K08, C15-K13, C15-K15; C15-W06, C15-W10 |
| C15-V15 | Local and regional privacy: selected coarse location, missing required regional/age policy, sparse cohorts, public venue versus private attendee and approved translation/geo feature retention; no private identity/proximity inference. | C15-S06, C15-S14, C15-S18, C15-S32; C15-A22, C15-A23; C15-K01, C15-K02, C15-K08, C15-K15; C15-W03, C15-W06 |
| C15-V16 | Feedback and actions: all six feedback meanings, actor/surface/idempotency/version, concurrent preference undo, current block/mute, report linkage and interaction retractions prevent forged enforcement or duplicate counters. | C15-S24, C15-S28, C15-S29, C15-S32; C15-A11, C15-A31; C15-Q13; C15-K02, C15-K08, C15-K14; C15-W04, C15-W06, C15-W09, C15-W11 |
| C15-V17 | Impression and trend windows: prefetch/rerender/retry dedup, actual exposure, event/processing time, late arrivals, unique/capped contributions and removed/private sources produce explainable eligible aggregates. | C15-S16, C15-S24, C15-S33; C15-A24, C15-A38; C15-K01, C15-K09, C15-K15; C15-W07 |
| C15-V18 | Abuse and false positives: coordinated engagement/reporting, repeated links, shared devices/IPs, new users and rapid legitimate interest exercise multiple reviewable signals, graduated authority and bounded resources. | C15-S16, C15-S22; C15-A24, C15-A26, C15-A37, C15-A38; C15-K09, C15-K11, C15-K16; C15-W07, C15-W09 |
| C15-V19 | Pre/post moderation and outage: all eight outcomes, exact revision/media coverage, required-check failure, approved low-risk delayed review, high/unknown-risk quarantine and incompatible fallback do not publish unsafe unresolved content. | C15-S20, C15-S34; C15-A22, C15-A25, C15-A26; C15-K02, C15-K10, C15-K16; C15-W01, C15-W08 |
| C15-V20 | Enforcement receipts and concurrency: two reviewers, source edits, stale classifier results, duplicate action jobs and notification failures preserve one current authorized decision/effect without restoring other restricted state. | C15-S20, C15-S21, C15-S24, C15-S29; C15-A27, C15-A30; C15-K03, C15-K10, C15-K11, C15-K12; C15-W08, C15-W09 |
| C15-V21 | Report submission and status: typed targets, allowed message/file evidence, idempotent submission versus clustered independent reports, anti-enumeration, protected reporter identity and safe notification/status. | C15-S23, C15-S24, C15-S28; C15-A29, C15-A31; C15-Q14, C15-Q16, C15-Q18, C15-Q19; C15-K01, C15-K11, C15-K12; C15-W09 |
| C15-V22 | Reviewer and Agent custody: case assignment/jurisdiction/conflict controls, private evidence/history access, safe renderer, separate model output/notes and audited sensitive reads; no family/page admin shortcut or autonomous Moderator Agent. | C15-S21, C15-S31, C15-S35; C15-A27, C15-A29, C15-A30; C15-Q14, C15-Q15, C15-Q16, C15-Q17, C15-Q18, C15-Q19; C15-K01, C15-K11, C15-K15; C15-W09 |
| C15-V23 | Appeal restoration: independent review of the particular action, false-positive correction and concurrent delete/other restriction/version change cannot let APPEALED/RESTORED become a blanket publication grant. | C15-S04, C15-S21; C15-A26, C15-A28, C15-A30; C15-K02, C15-K10, C15-K11, C15-K12, C15-K13; C15-W09 |
| C15-V24 | Cache/fanout withdrawal: wrong-key/scope/preference epoch, current delivery checks, CDN/SSR/prefetch/media/metadata/saved/notification paths and delayed cleanup never renew disallowed access; limits on already delivered bytes remain honest. | C15-S25, C15-S26, C15-S34, C15-S35; C15-A07, C15-A17, C15-A34; C15-Q09, C15-Q10, C15-Q11; C15-K02, C15-K07, C15-K13; C15-W10 |
| C15-V25 | Delete and restore lineage: content, candidate/index/feature/history/translation/profile/notification derivatives, lost tombstones, replay and isolated backup restore use current privacy/policy before serving or rebuilding. | C15-S10, C15-S24, C15-S25, C15-S34; C15-A07, C15-A17, C15-A34; C15-Q10, C15-Q11, C15-Q12; C15-K03, C15-K08, C15-K13, C15-K16; C15-W02, C15-W06, C15-W10, C15-W12 |
| C15-V26 | Canonical API/event semantics: eleven source operation examples, approved gaps, actor/surface/cursor/typed error and version/idempotency rules, event envelope/state normalization and no stale receipt disclosure. | C15-S28, C15-S29, C15-S36; C15-A08, C15-A18, C15-A33; C15-K02, C15-K03, C15-K07, C15-K14; C15-W03, C15-W06, C15-W09, C15-W11 |
| C15-V27 | Realtime/offline/account races: ten event types, ordered authorized replay, current removal, stable new-content indicator/scroll, duplicate REST/WS results and late old-account suggestions or Home modules. | C15-S27, C15-S30; C15-A12, C15-A14, C15-A15, C15-A16, C15-A17; C15-K02, C15-K07, C15-K13, C15-K14; C15-W04, C15-W10, C15-W11 |
| C15-V28 | Client parity and accessibility: all twenty-six Android and twenty-six web surfaces, missing required user controls, pending/report/appeal/error/empty states, long/mixed-script/RTL/large text and assistive navigation. | C15-S30, C15-S31, C15-S32; C15-A05, C15-A15, C15-A19, C15-A23; C15-K07, C15-K08, C15-K11, C15-K14; C15-W03, C15-W06, C15-W09, C15-W11 |
| C15-V29 | Degradation and resource limits: Redis/index/ranking/semantic/classifier loss, missing features, traffic bursts and queue/reviewer saturation retain hard policy, bounded optional fallbacks and accurate partial states. | C15-S09, C15-S23, C15-S34, C15-S36; C15-A09, C15-A20, C15-A25, C15-A37; C15-Q08; C15-K04, C15-K05, C15-K10, C15-K16; C15-W03, C15-W05, C15-W08, C15-W10, C15-W12 |
| C15-V30 | Privacy-safe measurement: actual impression/report denominators, protected query hashes/history, cohort floors, minimized segmented metrics/exports and content/secret canaries across logs/caches/audit/debug surfaces. | C15-S19, C15-S24, C15-S33, C15-S35; C15-A06, C15-A30, C15-A34, C15-A36; C15-Q05, C15-Q12, C15-Q13, C15-Q15; C15-K01, C15-K09, C15-K11, C15-K15; C15-W03, C15-W07, C15-W09, C15-W12 |
| C15-V31 | Quality, experiments and operating readiness: exact policy/model/index/tokenizer versions, multilingual golden judgments, independent false-positive/appeal evidence, bounded authorized experiments and real review/on-call capacity; critical failures cannot hide in averages. | C15-S11, C15-S15, C15-S18, C15-S21, C15-S33, C15-S36, C15-S37; C15-A18, C15-A21, C15-A23, C15-A24, C15-A26, C15-A27, C15-A28; C15-K06, C15-K08, C15-K09, C15-K12, C15-K15, C15-K16; C15-W05, C15-W06, C15-W07, C15-W09, C15-W12 |
| C15-V32 | Synthetic discovery demonstration: scoped publish/index/search/feed/follow/feedback/report/review/appeal plus denied/private/high-score, index-delay, removal-before-next-page and stale-restore controls on Android/core web. | C15-S01, C15-S02, C15-S38; C15-R01, C15-R02, C15-R03, C15-R04; C15-K01, C15-K02, C15-K03, C15-K05, C15-K07, C15-K10, C15-K12, C15-K13, C15-K14; C15-W01, C15-W02, C15-W03, C15-W04, C15-W05, C15-W06, C15-W07, C15-W08, C15-W09, C15-W10, C15-W11, C15-W12 |

### Synthetic Eligibility, Continuation and Appeal Fixture

The following is documentation with assumed policy inputs and synthetic identities. Its score numbers, author cap and page size are intentionally small controls, not approved ranking weights or production diversity settings. A local check can evaluate these finite expectations; it cannot prove that real source queries exclude private data, that a ranking model is fair or that a moderation service enforces them.

```json
{
	"fixture_kind": "synthetic_discovery_policy_controls",
	"runtime_executed": false,
	"ranking": {
		"surface": "public_recommended",
		"page_size": 3,
		"max_per_author": 1,
		"tie_breaker": "content_id_ordinal_ascending",
		"candidates": [
			{ "id": "public-a", "author": "author-a", "visibility": "PUBLIC", "state": "PUBLISHED", "parent_allowed": true, "blocked": false, "muted": false, "age_allowed": true, "region_allowed": true, "score": 90 },
			{ "id": "public-b", "author": "author-a", "visibility": "PUBLIC", "state": "PUBLISHED", "parent_allowed": true, "blocked": false, "muted": false, "age_allowed": true, "region_allowed": true, "score": 80 },
			{ "id": "public-c", "author": "author-b", "visibility": "PUBLIC", "state": "PUBLISHED", "parent_allowed": true, "blocked": false, "muted": false, "age_allowed": true, "region_allowed": true, "score": 80 },
			{ "id": "private-high", "author": "author-c", "visibility": "MEMBERS_ONLY", "state": "PUBLISHED", "parent_allowed": true, "blocked": false, "muted": false, "age_allowed": true, "region_allowed": true, "score": 9999 },
			{ "id": "removed-high", "author": "author-d", "visibility": "PUBLIC", "state": "REMOVED", "parent_allowed": true, "blocked": false, "muted": false, "age_allowed": true, "region_allowed": true, "score": 9000 },
			{ "id": "blocked-high", "author": "author-e", "visibility": "PUBLIC", "state": "PUBLISHED", "parent_allowed": true, "blocked": true, "muted": false, "age_allowed": true, "region_allowed": true, "score": 8000 },
			{ "id": "muted-high", "author": "author-f", "visibility": "PUBLIC", "state": "PUBLISHED", "parent_allowed": true, "blocked": false, "muted": true, "age_allowed": true, "region_allowed": true, "score": 7000 },
			{ "id": "age-denied", "author": "author-g", "visibility": "PUBLIC", "state": "AGE_RESTRICTED", "parent_allowed": true, "blocked": false, "muted": false, "age_allowed": false, "region_allowed": true, "score": 6000 },
			{ "id": "region-denied", "author": "author-h", "visibility": "PUBLIC", "state": "PUBLISHED", "parent_allowed": true, "blocked": false, "muted": false, "age_allowed": true, "region_allowed": false, "score": 5000 },
			{ "id": "parent-denied", "author": "author-i", "visibility": "PUBLIC", "state": "PUBLISHED", "parent_allowed": false, "blocked": false, "muted": false, "age_allowed": true, "region_allowed": true, "score": 4000 }
		],
		"expected_eligible_ids": ["public-a", "public-b", "public-c"],
		"expected_ranked_before_diversity": ["public-a", "public-b", "public-c"],
		"expected_selected_ids": ["public-a", "public-c"],
		"expected_underfilled": true
	},
	"continuation": {
		"snapshot_order": ["public-a", "public-b", "public-c"],
		"already_returned_ids": ["public-a"],
		"next_position": 1,
		"revoked_before_next_page": ["public-b"],
		"still_eligible_ids": ["public-a", "public-c"],
		"expected_next_ids": ["public-c"],
		"expected_final_position": 3
	},
	"appeal": {
		"overturned_action": "synthetic-action-a",
		"active_restrictions_before": ["synthetic-action-a", "synthetic-action-b"],
		"expected_active_restrictions_after": ["synthetic-action-b"],
		"owner_deleted_after_action": true,
		"expected_publicly_restored": false
	},
	"personalization": {
		"use_behavioral_activity": false,
		"allowed_inputs": ["current_public_query", "explicit_public_follows", "selected_interests", "required_safety"],
		"excluded_inputs": ["public_behavioral_history", "private_family_activity", "private_agent_memory"],
		"provider_calls_executed": 0
	}
}
```

The check must filter the assumed eligible set before any scoring, apply the declared score/tie order and author cap, and retain an underfilled result rather than insert a high-scoring denied item. The continuation group is an independent finite ordering control, not a reusable real cursor or diversity state; it advances past a revoked position without returning it. Overturning one action leaves the other action and owner deletion effective. The personalization group checks declared sets only, not real model inputs, data deletion or retraining. Actual C15-V08, C15-V10 through C15-V14 and C15-V23 evidence must exercise authoritative services.

## 14. Developer Handoff and Delivery Sequence

These are responsibility packages, not twelve mandatory deployments or running Agents. Design may proceed now; implementation, provider calls, profiling, experiments and enforcement require separate authorization and the applicable policy gates.

| ID | Owner | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C15-T01 | Product, discovery, privacy and trust leads | Relevant release/identity/Space/data/API/security/file decisions | Resolve C15-D01 through C15-D14, surface boundaries, source conflicts, public data-use/age/region rules, moderation staffing and evidence thresholds. Keep private discovery features and unsupported public groups disabled. |
| C15-T02 | Content/data/policy engineer | C15-T01 | Define canonical identity/parent/revision and independent audience/publication/moderation/case states, current eligibility/exclusion and durable outbox/projection protocol; C15-V01 through C15-V03. |
| C15-T03 | Search/taxonomy/language engineer | C15-T02; selected engine/model approvals | Implement versioned authorized indexing, lexical/vector/metadata filtering, normalization/aliases/suggestions and safe output; C15-V03 through C15-V08. No global private candidate pool. |
| C15-T04 | Feed/data engineer | C15-T02, C15-T03 | Implement source scopes, hybrid fanout/read assembly, follower/private modules, stable cursor windows and current reauthorization; C15-V08 through C15-V10. |
| C15-T05 | Ranking/quality engineer | C15-T01, C15-T03, C15-T04 | Implement hard gates, compatible feature schemas, reviewed score/diversity/tie policy and true reason codes; C15-V11 through C15-V13. No weights that can outscore a denial. |
| C15-T06 | Preference/recommendation engineer | C15-T02, C15-T04, C15-T05 | Implement explicit interest/local/language controls, opt-out/use separation, feedback identity and reset/deletion epochs; C15-V14 through C15-V16. Private signals never feed public ranking. |
| C15-T07 | Trend/abuse/measurement engineer | C15-T02, C15-T05, C15-T06 | Implement validated impressions/contributions, bounded windows/cohorts, dedup/retractions and multi-signal reviewable abuse controls; C15-V17, C15-V18, C15-V30. No unrestricted device profiling. |
| C15-T08 | Trust/moderation engineer | C15-T01, C15-T02, C15-T03; accepted file/evidence security | Implement exact-revision required checks/outage policy, deterministic enforcement receipts, protected report/case/reviewer/appeal flow and safe restoration; C15-V19 through C15-V23. Provider and staffing gates remain mandatory. |
| C15-T09 | API, realtime, Android and web engineers | C15-T03, C15-T04, C15-T05, C15-T06, C15-T08 for released scope | Reconcile missing routes/envelopes then implement current authorized surfaces/events, stable lists and complete accessible feedback/report/appeal controls; C15-V26 through C15-V28. |
| C15-T10 | Platform/privacy operations engineer | C15-T03, C15-T04, C15-T06, C15-T07, C15-T08 | Enforce cache/exclusion/replay/restore contracts, bounded load/degradation, private audit/metrics and measured operating capacity; C15-V24, C15-V25, C15-V29 through C15-V31. |
| C15-T11 | Independent QA, privacy, language and trust reviewers | C15-T02 through C15-T10 for released scope | Execute applicable C15-V01 through C15-V32 with versioned synthetic/golden artifacts, actual component/model/simulator identity, failure/skip records and independent expected judgments. Document arithmetic is not runtime or fairness proof. |
| C15-T12 | Trust/safety, support, security and product leads | C15-T01, C15-T08, C15-T09; C15-T11 for implemented evidence | Chapter 16 handoff for scoped operational authority, moderation/review/appeal operations, audit, incident/support and abuse/privacy controls. Design continues without claiming the current system or staff exists. |

An authorized first discovery slice can use synthetic explicitly public pages/posts, deterministic eligible chronological feeds and bounded lexical search plus controlled follow/feedback/report workflows. Hybrid semantic/recommendation features require their approved model/data/quality gates before release; the source's full hybrid-search goal remains visible rather than claimed from this early slice. Public moderation/reporting safeguards cannot be postponed merely to make a public demonstration easier, and none of this replaces the original ordinary-reminder M1.

## 15. Demonstration, Open Risks and Next Chapter

### Separate Synthetic Discovery Demonstration

This future script is a design acceptance aid, not an executed app or authorized public launch. Use synthetic accounts/content and isolated dependencies, with agreed deterministic query/ranking policy and no real behavioral tracking.

1. Create eligible synthetic public content, a private Space item, a followers-only item and removed/pending-moderation controls, all with explicit owners/parents/revisions. The private controls never enter the public index or feature stream.
2. Publish an exact reviewed eligible revision and show durable state/outbox/projection. Delay or lose an index notification, then recover without duplicating or revealing blocked content; an authorized creator sees truthful indexing progress.
3. Search an exact term and a supported normalized/language variant; display permitted results/highlights and a truthful zero-result state. The denied account cannot enumerate private titles or group existence through suggestions, facets or cursor probing.
4. Follow a public page, open Following in Latest mode and show stable chronological results. A followers-only item appears only through its verified personalized path; public Home recommendations do not learn from the private module.
5. Rank a finite eligible corpus with explicit ties/diversity and include a high-scoring denied control. Show an honest approved explanation and an underfilled page when the hard policy leaves insufficient results.
6. Disable behavioral personalization, change explicit interests and mute a topic. Verify actual feature/input/use changes, not only UI labels; replay an older activity event without rebuilding the cleared profile.
7. Continue a feed after one queued/snapshotted item is removed. Advance the bounded cursor past it without exposing it, jumping the scroll unexpectedly or returning another account's state.
8. Submit/retry a report with permitted evidence, view a minimized receipt/status and inspect it under assigned reviewer access. An unrelated moderator/account cannot open the evidence or confidential notes.
9. Apply an exact-revision decision, appeal independently and exercise an owner-delete or second-restriction race. A successful appeal of one action cannot publish content still prohibited for another reason.
10. Exercise ranking/Redis/classifier degradation, reconnect/account switch and Android/core-web accessibility. Observe current exclusion, bounded fallback and real safe audit/receipt/projection evidence rather than relying on a screenshot or classifier assertion.

Record exact artifacts, policies/versions/configuration, candidate eligibility before scoring, ordering/cursor/effect identity, attempted versus actual external calls, failure points and expected versus observed client/domain states. Distinguish deterministic document fixtures, component tests, end-to-end tests and independently reviewed quality evidence. A narrow pass does not prove scale, every language, anti-abuse completeness, clinical/legal compliance or production readiness.

### Remaining Decisions and Limits

- Eight PROPOSED and six OPEN decisions remain unapproved. Public versus private recommendation data, filter placement, public-group meaning, source enum/envelope conflicts and missing interface operations need canonical resolutions before implementations diverge.
- Real tokenizer/index/model/filter behavior, ranking weights/diversity, cold-start mixtures, local/cohort rules and quality thresholds are unmeasured. Source examples are not benchmarks or permission to collect sensitive profiles.
- Cache invalidation alone cannot guarantee current authorization, and external downloads/CDNs/search copies have honest retention limits. Feed snapshots and old moderation events cannot preserve or restore withdrawn disclosure rights.
- Moderation needs policy, least-privilege evidence custody, qualified independent review and actual operating capacity. Automated scores, report counts, engagement and appeal outcomes measure different things; none is a universal truth or irreversible authority.
- Privacy-safe activity use/reset/deletion, query URLs/logging, reviewer retention/holds and private-message/E2E reporting remain linked Chapter 11/16/19 decisions. No Agent/provider or public-ranker shortcut overrides them.
- Critical observed leakage, required-gate bypass, stale restoration or authorization failure blocks the dependent feature. Unrun tests, missing labels and unknown operating capacity are not passing evidence; a risk sign-off cannot waive mandatory duties.

Next is [Chapter 16](../Chapter16.md): trust, safety, moderation/admin operations, case access, audit, support and incident controls. Carry [Chapter 19](../Chapter19.md) for encryption and [Chapter 20](../Chapter20.md) for notification delivery. Continue design/developer handoff, preserving the incomplete source ending and prior contracts without inferring implementation or policy approval.