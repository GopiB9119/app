# Chapter 9: Web Routes, Rendering, State and Browser Security Contract

Status: DRAFT FOR PRODUCT, WEB, DESIGN AND SECURITY REVIEW. This is a design handoff, not a Next.js project, generated client, deployed website, Figma prototype, browser screenshot review or executed end-to-end test.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity contract](CHAPTER_18_IDENTITY_CONTRACT.md), [Space contract](CHAPTER_03_SPACE_CONTRACT.md), [data contract](CHAPTER_06_DATA_CONTRACT.md), [API/realtime contract](CHAPTER_07_API_REALTIME_CONTRACT.md) and [Android contract](CHAPTER_08_ANDROID_CONTRACT.md). It develops C1-T09 and C8-T12 into web-native workflows while retaining the same business authority and user outcomes.

- [Chapter 9](../Chapter9.md) owns this source. Next.js renders and coordinates the browser experience; FastAPI/domain services remain responsible for authoritative identity, resource access, membership, schedules and Agent actions. A BFF is not a second business backend.
- M1 is the ordinary synthetic family/task/one-time in-app-reminder workflow. Public community, chat, other Space types and controlled Agent features retain their agreed release scope. Browser routes do not silently add health, external calling, payments or advanced document capabilities.
- Original chapters and previous drafts are unchanged. Continuing design does not approve open policy/provider/SDK choices or authorize app scaffolding, installation, live integrations, a server, deployment or publication.
- All browser/runtime/visual/security acceptance scenarios are NOT RUN. Checks against source inventories establish document consistency, not a working website or a security certification.

## 2. Exact Source Topics

All 37 numbered source topics are retained with exact titles and anchors.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C9-S01 | Purpose | [9.1](../Chapter9.md#L5) |
| C9-S02 | Final Web Architecture Decision | [9.2](../Chapter9.md#L41) |
| C9-S03 | Web Application Responsibilities | [9.3](../Chapter9.md#L256) |
| C9-S04 | Recommended Repository Structure | [9.4](../Chapter9.md#L300) |
| C9-S05 | Route Architecture | [9.5](../Chapter9.md#L407) |
| C9-S06 | Rendering Strategy | [9.6](../Chapter9.md#L480) |
| C9-S07 | Layout Architecture | [9.7](../Chapter9.md#L577) |
| C9-S08 | Shared Design System | [9.8](../Chapter9.md#L638) |
| C9-S09 | Authentication and Session Management | [9.9](../Chapter9.md#L775) |
| C9-S10 | Backend-for-Frontend Pattern | [9.10](../Chapter9.md#L837) |
| C9-S11 | Shared API Contracts | [9.11](../Chapter9.md#L883) |
| C9-S12 | API Client Layer | [9.12](../Chapter9.md#L949) |
| C9-S13 | Data Fetching and Client Cache | [9.13](../Chapter9.md#L1027) |
| C9-S14 | Cache Rules | [9.14](../Chapter9.md#L1087) |
| C9-S15 | Realtime WebSocket Architecture | [9.15](../Chapter9.md#L1186) |
| C9-S16 | Chat Interface Architecture | [9.16](../Chapter9.md#L1291) |
| C9-S17 | Agent Workspace | [9.17](../Chapter9.md#L1393) |
| C9-S18 | Agent Execution UI States | [9.18](../Chapter9.md#L1534) |
| C9-S19 | Agent Streaming | [9.19](../Chapter9.md#L1570) |
| C9-S20 | Community Feed Architecture | [9.20](../Chapter9.md#L1610) |
| C9-S21 | Space Architecture | [9.21](../Chapter9.md#L1676) |
| C9-S22 | File Upload Architecture | [9.22](../Chapter9.md#L1725) |
| C9-S23 | Browser Security | [9.23](../Chapter9.md#L1804) |
| C9-S24 | Permission-Aware UI | [9.24](../Chapter9.md#L1934) |
| C9-S25 | Loading, Error, and Empty States | [9.25](../Chapter9.md#L1974) |
| C9-S26 | Performance Architecture | [9.26](../Chapter9.md#L2037) |
| C9-S27 | Accessibility | [9.27](../Chapter9.md#L2102) |
| C9-S28 | Internationalization | [9.28](../Chapter9.md#L2150) |
| C9-S29 | Notifications | [9.29](../Chapter9.md#L2186) |
| C9-S30 | Observability | [9.30](../Chapter9.md#L2229) |
| C9-S31 | Testing Strategy | [9.31](../Chapter9.md#L2291) |
| C9-S32 | Deployment Architecture | [9.32](../Chapter9.md#L2407) |
| C9-S33 | CI/CD Pipeline | [9.33](../Chapter9.md#L2450) |
| C9-S34 | Browser Offline Strategy | [9.34](../Chapter9.md#L2498) |
| C9-S35 | Final Web Architecture | [9.35](../Chapter9.md#L2543) |
| C9-S36 | Chapter 9 Acceptance Criteria | [9.36](../Chapter9.md#L2580) |
| C9-S37 | Final Decision | [9.37](../Chapter9.md#L2618) |

## 3. Exact Source Acceptance and Final Decisions

All 17 acceptance criteria in section 9.36 are retained verbatim. Each is NOT RUN; planned scenarios and source reading are not executed browser evidence.

| ID | Source acceptance criterion |
| --- | --- |
| C9-A01 | Public pages can be server-rendered |
| C9-A02 | Private content is permission-protected |
| C9-A03 | Authentication uses secure sessions |
| C9-A04 | No secrets are exposed to the browser |
| C9-A05 | Web and Android use the same API contracts |
| C9-A06 | WebSocket reconnect and resynchronization work |
| C9-A07 | Chat supports pending, sent, failed, and delivered states |
| C9-A08 | Agent runs show real execution states |
| C9-A09 | Approval actions require backend authorization |
| C9-A10 | Spaces use a shared configurable shell |
| C9-A11 | File uploads use controlled object-storage flows |
| C9-A12 | Browser security headers are configured |
| C9-A13 | XSS and CSRF protections are tested |
| C9-A14 | Large feeds and conversations are virtualized or paginated |
| C9-A15 | Accessibility requirements are tested |
| C9-A16 | E2E tests cover critical workflows |
| C9-A17 | Deployment supports rollback and observability |

All twelve technology lines in section 9.37 are retained verbatim as source decisions. Exact versions, libraries and deployment topology remain reviewed implementation choices.

| ID | Source final decision |
| --- | --- |
| C9-R01 | Next.js + TypeScript |
| C9-R02 | React Server Components where appropriate |
| C9-R03 | Client Components for realtime interactions |
| C9-R04 | TanStack Query for server state |
| C9-R05 | Zustand or local React state for UI state |
| C9-R06 | WebSockets for realtime events |
| C9-R07 | OpenAPI for HTTP contracts |
| C9-R08 | Zod for runtime validation |
| C9-R09 | Secure HttpOnly cookie sessions |
| C9-R10 | Presigned object-storage uploads |
| C9-R11 | Playwright for end-to-end testing |
| C9-R12 | Docker for deployment |

## 4. Exact Source Route Inventory

The 30 entries below preserve section 9.5's public and authenticated trees, including roots, containers and original relative labels. An interpreted absolute path is proposed for clarity; bracketed values are dynamic segments, not literal URLs or existing pages.

| ID | Source area | Source tree label | Interpreted full path |
| --- | --- | --- | --- |
| C9-N01 | Public | / | / |
| C9-N02 | Public | /discover | /discover |
| C9-N03 | Public | /search | /search |
| C9-N04 | Public | /pages/[pageSlug] | /pages/[pageSlug] |
| C9-N05 | Public | /pages/[pageSlug]/posts/[postId] | /pages/[pageSlug]/posts/[postId] |
| C9-N06 | Public | /events/[eventSlug] | /events/[eventSlug] |
| C9-N07 | Public | /topics/[topicSlug] | /topics/[topicSlug] |
| C9-N08 | Public | /about | /about |
| C9-N09 | Authenticated | /app | /app |
| C9-N10 | Authenticated | /home | /app/home |
| C9-N11 | Authenticated | /spaces | /app/spaces |
| C9-N12 | Authenticated | /[spaceId] | /app/spaces/[spaceId] |
| C9-N13 | Authenticated | /[spaceId]/feed | /app/spaces/[spaceId]/feed |
| C9-N14 | Authenticated | /[spaceId]/members | /app/spaces/[spaceId]/members |
| C9-N15 | Authenticated | /[spaceId]/calendar | /app/spaces/[spaceId]/calendar |
| C9-N16 | Authenticated | /[spaceId]/tasks | /app/spaces/[spaceId]/tasks |
| C9-N17 | Authenticated | /[spaceId]/files | /app/spaces/[spaceId]/files |
| C9-N18 | Authenticated | /[spaceId]/settings | /app/spaces/[spaceId]/settings |
| C9-N19 | Authenticated | /conversations | /app/conversations |
| C9-N20 | Authenticated | /[conversationId] | /app/conversations/[conversationId] |
| C9-N21 | Authenticated | /new | /app/conversations/new |
| C9-N22 | Authenticated | /agents | /app/agents |
| C9-N23 | Authenticated | /[agentId] | /app/agents/[agentId] |
| C9-N24 | Authenticated | /[agentId]/runs | /app/agents/[agentId]/runs |
| C9-N25 | Authenticated | /[agentId]/memory | /app/agents/[agentId]/memory |
| C9-N26 | Authenticated | /[agentId]/approvals | /app/agents/[agentId]/approvals |
| C9-N27 | Authenticated | /notifications | /app/notifications |
| C9-N28 | Authenticated | /files | /app/files |
| C9-N29 | Authenticated | /settings | /app/settings |
| C9-N30 | Authenticated | /account | /app/account |

Next.js route groups such as `(protected)` do not contribute a URL segment. To implement the proposed `/app/...` URLs, the actual App Router hierarchy needs the corresponding literal `app` segment underneath the framework's route root. The source's section 9.4 group-only repository sketch would otherwise produce different paths. Do not create both trees and duplicate permission/cache logic to hide the discrepancy.

The source's auth, administrative and additional detail/editor flows appear outside this route list. They remain explicit required additions where released, not automatically dropped because section 9.5 does not enumerate them.

## 5. Decisions and Boundaries

| ID | Choice | Proposed direction or open gate | Status |
| --- | --- | --- | --- |
| C9-D01 | URL and layout convention | Adopt the interpreted public plus literal `/app` workspace routes, stable canonical links and an explicit auth/admin map; resolve the repository sketch mismatch once. | PROPOSED |
| C9-D02 | Browser/API session topology | Prefer a thin same-origin, session-aware BFF for browser HTTP credentials where appropriate; define secure backend session binding, CSRF and realtime endpoint strategy before implementation. Direct API is a distinct alternative, not a second active auth system. | PROPOSED |
| C9-D03 | Framework and deployment versions | Select maintained Next.js/React/Node/library versions and actual container/host/CDN behavior, including RSC/fetch/cache/streaming support. No historical installed version is assumed safe or compatible. | OPEN |
| C9-D04 | Rendering and cache policy | Default private representations to explicit dynamic request-scoped reads and no shared HTTP/data cache. Public caching requires verified public eligibility and enforceable invalidation/current-access behavior; ISR is not blanket permission. | PROPOSED |
| C9-D05 | API/error/event schema | Use the Chapter 7 proposed canonical envelope/types and adapters, not the different section 9.11 envelope as a new source of truth. Final schema and version policy remain subject to review. | PROPOSED |
| C9-D06 | Web state and account isolation | TanStack Query for canonical browser server state, local React state for presentation; add Zustand only for a real cross-tree UI need. Account/environment generations isolate callbacks, hydration, subscriptions and any persistence. | PROPOSED |
| C9-D07 | Browser offline persistence | Decide eligible cached fields/drafts/messages, retention, encryption/key handling, shared-device threat model and IndexedDB/service-worker use. Do not silently persist private query caches or approval queues. | OPEN |
| C9-D08 | Realtime transport and multiple tabs | Use Chapter 7 scoped auth/subscription/snapshot recovery; select cookie/ticket hosting and bounded multi-tab strategy. Initial per-tab connections with limits may be simpler than fragile leader election. | PROPOSED |
| C9-D09 | Browser notifications | Choose in-app/browser push support and permission UX separately. M1 proves in-app history only; push/service workers cannot promise exact timing or an always-running Agent. | OPEN |
| C9-D10 | Web visual and accessible layouts | Reuse Chapter 8's proposed semantic tokens and typography language with web-native components, responsive unframed workspaces and keyboard/touch access. No Figma/visual approval is implied. | PROPOSED |
| C9-D11 | CSP, trusted content and third-party services | Select tested CSP/nonce strategy, content/media renderers, image proxy/URL rules, analytics and error tooling for the real hosting environment. Consent and secret exposure require threat review. | OPEN |
| C9-D12 | Asset and upload processing | Retain presigned immutable upload/version identity, reviewed file previews and current-authorized download behavior; browser file grants/resume constraints require explicit handling. | PROPOSED |
| C9-D13 | Browser/test support and performance budgets | Define browser/assistive-tech/device matrix, locale launch scope, cache/connection budgets and performance acceptance with measurements. Desktop screenshot success is not mobile/accessibility certification. | OPEN |
| C9-D14 | Release and data rights | Resolve missing invitation, recovery, member management, task/reminder editor, moderation and export/deletion routes from owning contracts. Deployment/signing/domain/provider/publication gates are separate from this design. | OPEN |

All proposals remain unapproved. A client component, layout gate, cached role, internal BFF credential or signed URL does not grant authority. Every sensitive domain operation rechecks the actual current actor/resource/consent relationship on the backend.

## 6. Runtime Ownership and Web Rules

The proposed web application uses App Router layouts/pages, feature hooks, a shared typed API client and explicit server-only session adapters. Tailwind/internal components, React Hook Form/Zod, TanStack Query and Vitest/React Testing Library/Playwright follow the source stack. Exact package versions, module boundaries and generated schemas are not supplied or installed here.

| Owner | Responsibility | Boundary |
| --- | --- | --- |
| Root/public/workspace layouts | Document language, semantic landmarks, accessible navigation and appropriate public or authenticated shell. | Layouts can persist across navigation; a one-time layout check cannot authorize every future resource read or mutation. |
| Request-scoped server data layer | Resolve trusted session/context, fetch permitted initial data and map allowed server/RSC projections. | No module-global authenticated QueryClient, cookie jar, user object or mutable token-bearing API singleton. |
| Thin BFF/route handlers | Browser-specific session/CSRF/transport normalization, safe aggregation and approved upstream routes. | No arbitrary-URL proxy, privileged universal credential or second set of domain permissions/scheduling logic. |
| Client providers and feature hooks | Account-context query client, allowed realtime subscriptions, canonical response/event merge and view models. | UI store is not a second copy of all server records; component unmount does not authorize use of a stale result. |
| Local form/UI state | User edits, selected view, disclosure/dialog state and classified drafts. | No long-lived auth tokens, private query cache or approval execution queue in an unrestricted persistence middleware. |
| Shared components | Render permitted immutable models, semantic states and user intent. | Hidden controls, disabled buttons and Zod validation do not replace server authentication/authorization. |
| Backend/domain services | Identity and current resource rights, persistence, schedules, jobs, Agent tools, audit and deletion. | A BFF request still carries authenticated user/service context; internal origin does not grant everyone access. |
| Browser persistence/service worker, if selected | Explicitly approved offline data/draft support and narrowly scoped background handling. | Not default caching of private HTML/RSC/API data, an unlimited sender or an exact reminder clock. |
| Deployment/telemetry | Versioned artifacts, secure headers, secrets, health, tracing and rollback. | Source maps, logs, previews and public environment variables must not contain protected data or credentials. |

### Client Invariants

| ID | Rule | Required behavior |
| --- | --- | --- |
| C9-K01 | FastAPI remains the shared business authority. | BFF, server functions and client hooks invoke the same domain contracts as Android; no shadow membership, scheduler or Agent backend. |
| C9-K02 | Authentication is current and context-bound. | Verify session/account, rotate/revoke correctly, bind upstream caller, protect cookies and CSRF; never trust body/header user IDs. |
| C9-K03 | Every read/mutation uses actual resource authorization. | Apply parent/scope/history/consent/role/delegation checks; middleware, layout, opaque ID and cached capability are not authorization. |
| C9-K04 | Server rendering and hydration disclose only permitted projections. | Recheck before sensitive fetch/serialization; no secret in HTML, RSC, props, error boundaries, metadata, prefetch or telemetry. |
| C9-K05 | Each cache layer has a reviewed audience and lifetime. | No private shared CDN/data/route cache. Public revocation, client cache, router/BFCache, image and service-worker behavior are explicit. |
| C9-K06 | One typed transport contract preserves meaning. | Reuse Chapter 7 headers/envelope/errors, exact sequences/dates, bounded parsing, operation IDs and preconditions. Source examples do not create a parallel schema. |
| C9-K07 | Mutation retry and optimistic state retain logical identity. | Same intended command and receipt; no new key/channel or invisible overwrite after timeout/conflict. |
| C9-K08 | Account, environment and session generations isolate state. | Late HTTP/RSC/WS responses, multi-tab messages and persisted drafts cannot be rebound to another principal or backend origin. |
| C9-K09 | Realtime authorization and catch-up are deliberate. | Authenticate/subscription/dispatch/replay checks, snapshot barrier, bounded backoff/buffers and explicit reset; socket connection is not message delivery. |
| C9-K10 | Offline data and cursor persistence remain coherent. | Persist allowed data and applied cursor together if supported; no cursor alone over an empty reloaded cache and no automatic sensitive offline execution. |
| C9-K11 | Agent execution and approvals are honest and exact. | Actual states, explicit immutable action/recipient/expiry review, current online authorization, scoped memory and no unrestricted future-action approval. |
| C9-K12 | Files and external content are untrusted. | Immutable upload/scan/index states, approved renderer and URL/proxy boundaries; backend validates bytes and audience independently. |
| C9-K13 | Browser permissions, notification preferences and consent differ. | No silent channel enrollment; redacted preview and current-authorized links/acknowledgments. Push is not exact timing or proof of reading. |
| C9-K14 | XSS, CSRF, redirect and framing defenses are layered. | Trusted content sanitization, tested CSP/Origin/CSRF/session policy, bounded requests and safe URLs; no broad bypass for convenience. |
| C9-K15 | Responsive accessible interaction is a core contract. | Semantic HTML, keyboard/touch/focus, zoom/RTL/language, stable paged lists and truthful pending/error states. |
| C9-K16 | Versions, observability and evidence are explicit. | Compatible HTTP/event/client artifacts, bounded private-safe diagnostics, measured performance and genuine browser/deployment tests. |

## 7. Rendering, Sessions and Cache Boundaries

### Rendering Decision Matrix

React Server Components and SSR are related but not synonymous; a Client Component may still be pre-rendered on the server. Marking a file `use client` does not guarantee its props never appear in HTML or RSC transport. Select exact behavior for the chosen framework version and deployment adapter and verify actual network output.

| Surface | Proposed rendering approach | Authorization and caching |
| --- | --- | --- |
| Public pages/posts/events/topics | Server-render permitted public projections with stable canonical metadata; interactive reactions/follows use client islands. | Never fetch the owner's private representation and strip it in the browser. Mutable publication/visibility needs current eligibility or an enforceable purge policy before public caching. |
| About/help/legal material | Static generation for approved, non-personal content. | Keep legal/version provenance; do not bake environment secrets or account-specific variants into build artifacts. |
| Public search/discovery | Request/query-appropriate server result or client fetching with bounded filters and pagination. | Search query privacy/retention and cache-key cardinality matter; do not expose another person's personalized result or recent private search. |
| Authenticated home/Space shell | Request-scoped server shell with minimal permitted initial data and client boundaries for live sections. | Explicit dynamic/no-store behavior as supported; permissions rechecked in the actual server data read, not only the shell layout. |
| Chat/Agent/notification/calendar interactions | Client state over authorized typed API/events; optional minimal request-scoped hydration. | No private static build/ISR payload. Initial hydration and later refresh must refer to the same principal/generation and safe projection. |
| Approval/security/data-rights/admin views | Online, current-authorized data and exact action state. | No shared cache or permissive stale approval. Sensitive operations reauthenticate/authorize at execution, regardless of display state. |
| File preview/large bytes | Authorized metadata shell and reviewed preview/object transfer flow. | Do not embed raw private file bytes or signed URLs into public OG/image optimizers or indefinitely cached rendered pages. |

For routes whose private content or existence must be concealed, make the authorization/metadata decision before emitting sensitive streamed content. A suspended route may have begun its outer response; do not assume a late not-found/error can retroactively set a 404 status or retract bytes already sent. Robots/noindex/canonical tags are SEO signals, not an access-control substitute. Hidden or deleted resources must not leak titles through metadata generation, sitemap/OG cards or error pages.

### Session and BFF Proposal

Under C9-D02, an opaque host-scoped Secure/HttpOnly browser session handle maps server-side to the reviewed backend session/delegation. Alternatively, a reviewed direct API cookie topology can be selected; do not run two competing sessions with different revocation behavior. Specify cookie path/domain/SameSite, expiry/rotation, CSRF proof, trusted origin and login/logout callbacks for the actual domains. Use a host-only cookie and the appropriate supported prefix where that configuration permits; do not widen Domain or CORS to make a test pass.

HttpOnly reduces JavaScript token extraction but does not stop an XSS payload from invoking cookie-authenticated actions. It also does not mean cookies cease to be credentials stored by the browser. The source's no-secrets-to-browser rule means no provider/internal/database keys or long-lived script-readable bearer tokens; unavoidable short-lived form/session proofs are handled through the reviewed browser protocol and never logged.

For every server handler or server-rendered private fetch, resolve the request's actual session and current backend authority. BFF upstream credential mapping is request-local; do not forward every browser header/cookie or a caller-supplied upstream URL. Allowlist upstream origin/path/method and response headers, preserve request correlation safely, and never act for an arbitrary `user_id` with a universal admin token. Cookie refresh/rotation requires supported response handling, not assuming a Server Component can always set response cookies while streaming.

Middleware/proxy may redirect a clearly unauthenticated route or attach locale/correlation metadata. Actual server components, route handlers and Server Actions, if used, still validate session, CSRF/Origin, input and resource authorization. Server Actions are mutation endpoints, not trusted private functions simply because their implementation is server-only. Code-splitting identifiers or action closure IDs are not permission grants. Prefer consistent mutation adapters to the shared FastAPI contract; do not build an alternative auth/payment/scheduler implementation there.

Session rotation is coordinated to avoid many tabs/requests minting conflicting refreshes. The backend remains robust to legitimate concurrency and stolen-token reuse. On revoke/logout/account switch, invalidate current browser context, query caches, subscriptions, stored work and protected navigation; reject stale responses before rendering. An old tab discovering changed cookies must first re-resolve the current session, not send its queued old-account commands with the new cookie.

Validate return paths against an approved same-origin route allowlist, including normalized/encoded/protocol-relative/backslash and cross-environment cases. A raw `next` parameter is not trusted. Private invitation links expose only the identity-bound preview after sign-in, not full Space details in an unauthenticated shell. Callback/verification tokens have a narrow one-time flow and Referrer-Policy/logging protection; no token stored as a permanent route/query-state value.

### Cache-Layer Checklist

| Layer | Required design |
| --- | --- |
| Request memoization / server data client | Confine authenticated context and any QueryClient to a single request. No module-global promise/token/client carrying one user's data into another request. |
| Next.js persistent data cache | Opt private fetches out explicitly using supported version-specific APIs/configuration. Global cache wrappers/tags cannot omit principal, projection or scope, and should not be used for sensitive private data by default. |
| Full route / ISR / CDN | Cache only intended public variants with a reviewed invalidation/current-eligibility boundary. `no-store` on one backend fetch must be verified all the way to response/CDN behavior; a cookie or Vary header alone is not universal cache isolation. |
| RSC/HTML/serialized hydration | Dehydrate only allowed queries/fields for that request. A field excluded from the visible component but still present in page props or the RSC stream is disclosed. No entire account/session/Agent trace dump. |
| Browser router/prefetch cache | Framework navigation may keep or prefetch data independently of HTTP caches. Disable or tightly bound sensitive prefetch and clear/refresh protected route state on session/scope change. Re-authorize the destination rather than trusting a prefetched result. |
| TanStack Query / React state | Keys and merge context include trusted environment/account, resource/query filters and appropriate generation. Clear on switch, cancel/reject obsolete responses, avoid stale permission-driven execution and keep private data out of global singleton stores. |
| IndexedDB / persisted query state | Off by default for sensitive records until C9-D07 is resolved. If enabled, account/classification/version/retention plus local state/cursor atomicity are required. Browser storage is not an OS secret vault and XSS can access it. |
| Service worker / CacheStorage | No cache-all strategy for private HTML, RSC, auth/API endpoints, signed private media or exports. Version/cleanup and account-bound offline behavior must be verified; service workers can outlive a page and a logout. |
| Image optimizer / CDN thumbnails | Public approved images may be optimized. Private images require a reviewed authorized fetch and cache path, not a shared optimization URL or raw access token. Remote image proxy input needs SSRF/host/type/size/redirect controls. |
| Browser history / BFCache / downloads | A back-forward restored DOM or downloaded file may survive independently of fetch policies. Revalidate/redact protected state on relevant lifecycle/session changes and enforce a reviewed shared-device/offline policy; never promise remote erasure of bytes already delivered. |

The source calls public metadata/feeds cacheable and recommends ISR. For content that can later become private, TTL-only cache expiration cannot satisfy immediate revocation. Proposed default: do not publicly cache those representations until an enforceable eligibility/purge model is selected; use current-authorized rendering instead. A failed purge must fail closed or follow an explicitly approved bounded-exposure policy, not quietly serve the old private content. Already copied public content cannot be recalled from third parties.

## 8. Typed Requests, Forms and Browser State

The Chapter 9 example envelope (`meta.request_id`, `error:null`, `PERMISSION_DENIED`) conflicts with Chapter 7's proposed top-level `request_id`, mutually exclusive `data`/`error` and catalog. C9-D05 proposes using the Chapter 7 contract for both clients. Do not introduce a second error parser keyed on English text or mix numeric and string event sequences. The example `idempotency_key` in a chat JSON body is likewise not an independent retry identity alongside a different header key; use the published single mapping.

Keep separate server-only and browser transports over the same generated operation types. On the server, accept a trusted request-local context; in the browser, use the configured approved relative BFF/API origin and credential policy. Do not let arbitrary component URLs inherit cookies or Authorization headers. Centralize bounds, abort/deadlines, safe error parsing, correlation, exact wire types and retry/precondition semantics.

OpenAPI-derived types and Zod runtime validation need one schema ownership/version policy, not manually divergent models. Validate actual responses and events at boundaries; TypeScript types do not check an HTTP payload. Unknown critical states/fields cannot default to approved/active/completed. Maintain exact opaque IDs and decimal-string sequences, canonical dates/instants/timezones and explicit money types. Format localized presentation separately.

| State owner | What it stores | Consistency rule |
| --- | --- | --- |
| TanStack Query | Canonical scoped server records/pages/status and allowed hydrated data. | One merge/version policy per resource; do not let a late refetch overwrite newer socket data or optimistic pending intent blindly. |
| Local React state | Disclosure, selection, filter input and simple form presentation. | Route/account scoped, reset appropriately; not a full parallel database of server records. |
| React Hook Form | User-editable form values and localized validation/dirty state. | Track submitted revision separately from newer edits. Async validation/stale response cannot silently save or overwrite the changed form. |
| Optional Zustand store | A demonstrated cross-tree UI need such as workspace panel arrangement. | No blanket persistent store of users/messages/tokens. Selectors and teardown prevent global private-state propagation. |
| Command/reconciliation store | If permitted, immutable command ID, intended actor/environment/scope, body digest and expected version/status. | HTTP retry, realtime echo and multiple tabs converge on the same logical intent. Account changes require review, not silent reauthentication as someone else. |
| Optional IndexedDB | Only reviewed offline drafts/cache/commands and applied cursor data. | Transactions bind cursor plus materialized state; no persisted cursor over an empty in-memory query cache. Migration/retention/eviction/key-loss behavior is explicit. |

Forms show loading/validation/submitting/accepted/waiting/conflict/failure and save confirmation accurately. Use 201 for its actual durable resource creation, 202 for durable queued intent, 204 without a body and typed errors as specified; a status request can return 200 while the underlying job failed. Exact committed idempotent retry retrieves a currently permitted receipt instead of executing again or failing solely because the first write advanced the version. A changed action/precondition uses a new explicit review, not an automatic overwrite.

Cancel stale query work using abort signals and discard results with obsolete account/resource generation. Aborting fetch does not prove the server did not commit a mutation. Unknown outcomes reconcile via original command identity/status; never choose a new key or fallback channel simply because the tab lost connectivity. Do not enable library automatic retries for every mutation. Stale/wrong-scope cursors, unsupported responses and revoked sessions use safe refresh/re-auth/reset paths that retain only permitted drafts.

Error boundaries must not expose stack traces, internal hosts, private request bodies or server-rendered data in fallback markup. Authentication-required, validation, permission-denied, offline, rate-limited, stale-version and provider/unknown failure are distinct states. An authorized empty response is not the same as a failed or denied request. Independent home/dashboard sections can fail locally without blanking other working modules.

## 9. Web Workflow and Route Contracts

Source-route mappings below cover all 30 entries once, including `/app` and list containers. Additional auth, administrative, editor/detail and approval/run destinations are source-backed workflow needs, not secretly existing routes. All route implementation and tests remain future work.

### C9-W01 Public Entry, Discovery, Search and Information

Source routes: C9-N01, C9-N02, C9-N03, C9-N07, C9-N08.

Make the usable public experience the default entry: discover/search public communities or continue to the signed-in workspace under the approved redirect behavior. `/about` carries informational material; a large marketing landing page is not required by this design. Avoid forcing onboarding or contacts permission to browse permitted public content.

Search/topic/discovery surfaces keep query/filter state explicit, bounded and safely shareable where appropriate. Cancel obsolete queries, paginate by the agreed cursor and distinguish first load, no results, refresh, next-page error and offline permitted cache. Preserve reading position when new content arrives. Autocomplete and recent-search state must not expose private group names, contacts, other users' searches or sensitive inferred interests.

Canonical metadata, structured data and share previews use only intentional public projections. Locale/canonical links and unknown/removed-topic states must be defined. Personalized results cannot be stored under one shared public search URL, and current public visibility is enforced before server output and index/cache reuse.

### C9-W02 Public Pages, Posts and Events

Source routes: C9-N04 through C9-N06.

Server-render approved public Page/post/event content with real permitted media, safe metadata and current moderation status. Display follow versus membership as separate actions. A page-specific post route verifies the post belongs to that page, not merely that both identifiers exist. Deleted/private pages do not reveal their former title through breadcrumbs, image proxies, OG metadata or streamed errors.

Post composer, edit, comment/reaction controls, page role management and event RSVP/detail are explicit additional interactions. Authorized publication reviews the actual destination, audience, content and attached media; draft save is not publish. An old private draft must not become public because a tab switched page identity. Comment edits, reactions and removal use current actor/version/idempotency rules and preserve accessible pending/conflict states.

Event title/location/attendee/RSVP data follows the backend's field projection. Public festival pages and private organizer Spaces may link without sharing all contents. Attending a public event is not family membership. Media/image/document states remain honest and no frame/proxy may load a forbidden original to satisfy a public preview.

### C9-W03 Authentication and Safe Entry

Source auth routes appear in section 9.4 rather than the section 9.5 tree: login, register, verify, forgot-password and reset-password. Exact paths/callbacks remain C9-D01/C9-D02 decisions; this draft does not add a second identity system.

Use the selected enrollment and recovery methods from Chapter 18. Password-manager/paste support, generic safe errors, purpose-bound OTP/verification, expired/resend/rate status and an enrolled recovery route are essential. Optional contacts, exact location and browser notification permission are not login prerequisites. Provider receipt of a code is not completed identity proof.

After authentication, rotate/bind the session and create the new browser state generation, then validate the intended return destination again. A pending invitation reviews minimum context only after the correct account/contact proof; source-required acceptance and proposed organizer confirmation are not replaced by 'logged in with the number'. Reject malicious `next` parameters, conflicting account context and identity probes without exposing private details.

Refresh, revoke, disabled accounts and password/contact reset behave under the shared identity contract. Request-local server clients and browser clients resolve the same current principal. A stale authenticated layout or a cached login response cannot re-enable a revoked session. Support browser back/reload, multiple tabs and interrupted submission without reusing another account's credentials or displaying their old hydration state.

### C9-W04 Workspace, Spaces, Members and Settings

Source routes: C9-N09 through C9-N14, C9-N18.

The `/app` root can resolve to an approved workspace home rather than a separate duplicate dashboard. Home sections for tasks/reminders/conversations/approvals load independently with correct current/refresh/offline/error state. The workspace shell has clear active account and Space context; optional side panels must not fetch inaccessible data just because the layout has room.

Space list/create/detail/feed use one shared configurable shell for family/couple/solo/custom/temporary policies. Render capabilities from the current backend projection, not inferred solely from `space_type`; creating a group does not enable health/finance/Agent permissions from a UI feature flag. Member counts and avatars are shown only to eligible viewers, including guest/history rules.

Invitation creation/review/acceptance, join requests, role management, leave/removal and ownership transfer are additional destination flows. Keep intended recipient, grantable role, version/expiry and current actor/target checks. Source `/members` must not directly add someone who never accepted; couple limit races are server facts, not only a disabled Invite button. Proposed recipient confirmation remains an open policy dependency.

On removed/expired membership or archived/locked Space, revoke protected projections, stop relevant subscriptions and navigate to a permitted parent. Rejoin/restore cannot populate previous history, file keys or memory from a stale cache. Security-policy changes are specific reviewed operations, not arbitrary JSON hidden behind a generic settings form.

### C9-W05 Planning and Notification Inbox

Source routes: C9-N15, C9-N16, C9-N27.

Calendar/tasks surfaces link to additional event/task/reminder editors and details. Show exact date-only versus timed due semantics, IANA timezone, eligible assignee/recipient and field visibility. Edits carry reviewed expected versions; a later response or another tab's update causes a visible merge/review decision rather than silently overriding current input. Unsaved drafts remain scoped and recoverable only under permitted storage policy.

For M1, use an ordinary one-time in-app reminder attached to the intended task/workflow. Preview recipient, local time, timezone and channel before saving. Distinguish local form, durably saved schedule, due notification and explicit acknowledgment. A backend schedule continues without an open tab or LLM; the browser does not stay alive as its timer.

The notification center combines permitted task/calendar, invitation, message, Agent, moderation and security references according to release scope. Opening or acknowledging an old notification rechecks account/target permissions and cannot reveal a removed Space. Read notification, user acknowledgment, message-read receipt and provider delivery are different facts. Browser push permission and external channels remain separately gated; M1 only proves in-app history while open/reconnected.

Cancellation/assignment removal/time changes display truthful current status and unknown in-flight outcomes. No phone call, medication instruction or unsupported calendar integration is added merely to make the demo look complete. Shared field/privacy and data-rights rules match Android.

### C9-W06 Conversation Lists and Chat

Source routes: C9-N19 through C9-N21.

List/create/detail operates on actual permitted participants and conversation context. Support narrow-screen list/detail navigation and large-screen side-by-side selection without duplicate data owners. Back/deep-link/reload retains only the current authorized identity; an owner/moderator is not automatically a participant in a private conversation.

The timeline provides stable local render IDs, bounded history, messages/media/Agent/system attribution, composer/attachments and explicit connection state. Security indicators reflect the selected actual E2E mode, not a field named ciphertext. Preserve reading/keyboard focus and avoid automatic jumps during new messages or image decode.

Queue only reviewed ordinary messages under C9-D07 and the Chapter 7 idempotency contract. Preserve immutable logical client message ID/body digest/account/scope, reconcile REST-before-WS or WS-before-REST via authoritative identity/version, and keep retryable/permanent/permission/unknown results distinct. A temporary client object replaced by a server ID must not lose reply/attachment mappings or cause two visible messages. Do not guess canonical matching from message body/time.

Read/delivered status comes from the defined authenticated evidence, not socket-open or network-send completion. Typing/presence are ephemeral and privacy-controlled; they do not reveal actual online state of external WhatsApp contacts. Edits/deletes/replies/receipts follow current version and history rules. Offline pending data durability across reload is only promised if the chosen browser persistence design actually supports it.

### C9-W07 Agent Runs, Approvals and Memory

Source routes: C9-N22 through C9-N26.

Agent entry/detail includes explicit personal/Space/conversation scope and allowed capabilities, with a work-focused conversation area and inspectable run/evidence panel. Detailed graph/run diagnostics are optional, not mandatory to create a reminder. Stream partial text and actual task/tool state only; never raw private chain-of-thought, model/provider prompts, secrets or invented progress percentages.

Canonical queued/planning/executing/waiting/partial/completed/failed/cancelled states must be mapped from the approved backend contract, not separate UI enums that silently coerce unknown values into success. Reconnect/retry/final replacement preserves partial content and action outcomes. Closing a stream does not prove the server job stopped; use the authenticated cancellation operation and reconcile effects already committed.

Approval detail is an additional exact-action view: full action/payload, target context, recipient(s), side effects, schedule, risk and expiry with action-specific controls. Editing produces a new validated action revision and review, never edits an already approved payload in place. 'Approve future similar actions' in the source is an optional separate, bounded standing-delegation design; it is not an unrestricted grant, not default MVP and cannot authorize prohibited actions. Do not auto-submit cached approvals on reconnect.

Memory view/edit/delete/expiry/consent reflects permitted owner/source/history/classification. Basic view/delete is MVP; richer controls follow scope. Removal/source deletion must exclude protected memory and cached detail immediately at relevant access boundaries, with tracked derivative cleanup. A shared Agent pane must not serialize every member's private context into page props. Unsafe generated links/Markdown/citations pass through the reviewed renderer and current-authorized source retrieval.

### C9-W08 File Lists, Uploads and Document Views

Source routes: C9-N17, C9-N28.

File list/detail/upload/progress/share/version/citation views are explicit additions. Use file input/drag-and-drop with accessible keyboard equivalents and bounded client checks for count/size/names; backend verifies actual bytes/type/scan/owner/scope. A browser File or object URL is neither durable storage nor authority.

Presigned upload references an immutable version/session. Direct transfer completion is separate from backend completion/scan/processing/indexing. Show selected/validating/preparing/uploading/uploaded/scanning/processing/partial/ready/rejected/failed truthfully; source READY for a generic file is not evidence every document has searchable chunks. Reprocess/cancel uses current identity and generation.

File objects may not survive reload, and permissions/handles are browser-dependent. Resume only when the selected supported mechanism retains the exact permitted bytes and checksum; otherwise require re-selection and verify identity. Revoke object URLs when no longer needed; unbounded previews/blobs cause memory and privacy problems. Staged offline files, if allowed, need explicit retention/clear/key-loss rules, not automatic IndexedDB persistence of every upload.

Private preview/image optimization/OG paths cannot bypass current access. External documents, SVG/HTML and extracted Markdown are untrusted; use approved isolated viewers and sanitized rendering. Display page/version/source provenance and do not request unauthorized original files for a convenient thumbnail. Signed download URLs and saved files have explicit revocation/retention limitations matching the Space and data contracts.

### C9-W09 Account, Preferences and Data Rights

Source routes: C9-N29, C9-N30.

Settings group profile/handle/language/timezone, privacy/discoverability, active sessions/devices, recovery, contacts, notifications, Agent permissions and approved connected services. They share domain behavior with Android but use browser-native semantic forms/dialogs. Unknown provider support is a disabled/unavailable capability, not a pretend connected account.

OS/browser permissions, verified endpoints, channel preferences, recipient consent and Agent delegation remain independent. Consent edits are online purpose/scope/versioned actions with revocation, not a broadly persisted profile toggle. Optional permission denial leaves unrelated features usable and does not repeatedly prompt the user.

Deactivation, deletion and export require current/step-up authentication, affected-resource preview and explicit confirmation. Proposed immediate session revocation at a deletion request remains pending policy, not quietly deferred to keep the UI convenient. Show durable job progress, failed/partial/held/complete states and restricted grace-cancellation handling. An expired session can open only its reviewed recovery/status path, not arbitrary private data.

Exports are permission-filtered encrypted/expiring artifacts with authorized download and cleanup; do not drop them into a public directory or logged URL. Account login recovery does not automatically recover E2E keys. Logout/account switch closes the old context and ensures Back, restored tabs, service-worker messages or pending command retries do not reopen the prior account's private view.

### C9-W10 Moderation and Administrative Workspaces

The source repository includes admin reports/moderation/users/audit outside the primary route tree. Exact admin URLs, identity strength and feature release scope are decisions, not an exposed internal service API.

Use a separate privileged navigation/role gate plus backend-authorized case-scoped operations with recent-auth/MFA policy where required. A reviewer sees permitted evidence and separate policy/history/action panels; confidential notes, reporter identity and raw private content are not placed in every hydrated query or exported grid. No arbitrary private-message search based on an 'admin' UI flag.

Cases, reports, appeals and restore actions use versions, exact targets, audit and safe retry. Automated classifier/Agent output is marked as evidence/recommendation, not automatically a final decision. User report/block/privacy/appeal screens remain accessible through their released workflows; moderation functionality is not dropped because it is absent from the 30-route inventory. Sensitive enforcement, impersonation/support access and bulk export require explicit server policies rather than a generic admin proxy.

## 10. Realtime, Multiple Tabs and Offline Recovery

### C9-W11 Apply Events and Recover Browser State

Use one controlled realtime manager for the active tab/application context, with bounded account-level connection policy. Initial proposal permits multiple tabs each with one authorized connection and server quotas; optimize to SharedWorker/leader coordination only when justified and correctly tested. BroadcastChannel/leader election is not a security boundary or guarantee of exactly-once execution.

Follow Chapter 7 browser cookie/Origin or short-lived one-use ticket authentication. Browser WebSocket does not generally support arbitrary Authorization headers. No long-lived bearer token in the URL, subprotocol or localStorage. Native Android auth can differ while the same subscription, scope and event meaning applies. Connection-open/authenticated/subscribed/synchronized are distinct states.

Authorize each requested stream/view and each sensitive delivery/replay. Source `sequence:481` is illustrative; the proposed canonical contract uses exact decimal strings and separate stream, message sequence, resource version and resume cursor. A single user-global counter leaking hidden events or a client-supplied Space ID is not an authorization protocol.

Snapshot and resume use the Chapter 7 coordinated source watermark/barrier and current policy generation. An arbitrary new HTTP fetch plus the latest socket event is not a consistent snapshot. Buffer/replay after the barrier, apply tombstones and version-aware patches, and reset when retention/policy invalidates recovery. Unknown critical schemas do not get silently ignored while advancing the cursor.

For memory-only TanStack Query state, reconnect may use a cursor valid for the actual in-memory applied snapshot. After a full page reload, reconstruct authorized data before using any resume cursor; do not persist just `last_sequence` while the corresponding rows were discarded. If IndexedDB persistence is approved, commit materialized records and applied cursor transactionally and rebuild query projections from that version. Browser storage quota/eviction/crash must lead to resync, not missing historical changes.

Incoming data passes through one reducer/merge path with account/environment/generation checks. A late stale HTTP result, prior-account RSC hydration or duplicate event cannot overwrite new canonical records or pending local command intent. Notifications/Agent progress and full resources have specific update/refetch contracts; a reference event is not assumed to contain every field. Cancellation reduces wasted work but cannot retroactively undo a server mutation.

### Tab and Session Races

Cookie sessions may be shared across tabs. Each command's intended account context must match the server-resolved current account when executed. Use an approved context-binding/precondition and refresh coordination, not only a browser broadcast that can be delayed or lost. A hint that session changed triggers current-session revalidation and local cleanup; do not transfer bearer tokens, full private records or executable commands through cross-tab messages.

Test logout/switch/recovery in one tab while another has pending messages, open approvals, an upload or a back-forward cached page. Invalidate inappropriate generations, refuse stale work and show a safe reauthentication/review state. A new login as the same account may permit reconciliation of existing legitimate work; login as a different account never implicitly retargets it. Local lock/fencing helps coordination, but the authoritative idempotency/admission checks stay server-side.

### Offline and Resource Limits

Keep public cache and permitted private offline cache separate. Source offline capability is limited: safe drafts and recent authorized content may be supported under C9-D07. No automatic offline approval, external send, invitation/admission, role/owner change, calendar change, financial action, deletion or medical notification. A backend-approved saved reminder runs independently of tab lifetime, but its recipient/membership/consent remain checked by the server.

Browser storage is subject to shared-device access, XSS, quota, eviction and user clearing. Encryption with a key accessible to the same running JavaScript does not neutralize an XSS attacker; a meaningful offline key/unlock design changes UX and requires review. Do not claim pending messages survive reload/browser closure until the selected durable storage contract is implemented and tested. Never request persistent storage permission as a substitute for explaining those limits.

Bound subscriptions, query cache size, retries, frame/decompression/queued bytes and rendered timeline. Use exponential backoff with jitter, session-refresh serialization, online/visibility lifecycle awareness and server rate responses. `navigator.onLine` is a hint, not proof of backend reachability. Suspend unnecessary offscreen work where safe; resuming revalidates state. Drop/coalesce permitted typing/presence signals, not durable changes while falsely advancing the cursor. Slow-consumer disconnect must have a valid replay/reset route.

An error or provider outage cannot freeze all manual workflows. Authorized REST refresh/status/history can recover when realtime is unavailable. Streams/push events remain hints or explicit durable events according to their schemas; they are not proof of a user's acknowledgment or a medical outcome.

## 11. Browser Security and Notifications

### Content, Script and Framing Boundaries

Use React escaping for normal text and a maintained, correctly configured sanitizer/renderer for supported rich text or Markdown. Escaping is not a complete URL, CSS, SVG, HTML or code-preview security policy. Never render arbitrary Agent/document/server error output as executable HTML, script, iframe or style. `dangerouslySetInnerHTML` requires a documented narrow sanitized input pipeline, not trust based on the content's author.

URL handling permits only the context's approved schemes and origins. Reject script/protocol-relative or encoded bypasses and distinguish app-created object URLs for approved local previews from untrusted user data URLs. Rich links/citations open only permitted resources; new-window links use appropriate isolation. Do not fetch untrusted metadata server-side, pass arbitrary URLs to an image optimizer, or proxy private network addresses through a thumbnail API. Use allowlisted immutable media references and bounded verified fetches where actual proxying is required.

For untrusted HTML/SVG/document previews, prefer an isolated viewer/origin or download flow with strict content type, disposition, sandbox and frame policies. A sandbox configured to restore broad script and same-origin privileges may defeat the intended isolation; choose capabilities deliberately. Private object URLs, thumbnails, filenames and citation text still need authorization and retention. Upload scan completion does not mean the browser may execute the document.

Configure a tested CSP for the actual Next.js/React build, dynamic RSC/script behavior, WebSocket origins and media needs. Use reviewed nonce/hash or narrowly allowlisted scripts; restrict object/base/frame/form/connect/image sources. Nonces must be generated per response and applied consistently; shared caching of a response with a nonce needs explicit compatible design. Do not solve a production policy failure by allowing all origins or adding broad `unsafe-inline`/`unsafe-eval`. Trusted Types can add protection where supported but is not a universal browser substitute for safe sinks and sanitization.

Set supported protections at the deployed edge/runtime, including TLS, appropriate HSTS only for the approved domain policy, content-type/nosniff, Referrer-Policy, Permissions-Policy and frame-ancestors/X-Frame-Options as appropriate. Referrer controls protect invitation, upload and export locations. A document listing headers does not mean they are actually served; test public/private/error/redirect/RSC/upload paths and CDN overrides. CSP frame-ancestors belongs in a response header, not only an HTML meta tag.

### Cookie Mutations and CSRF

Cookie-authenticated state changes need the selected CSRF token strategy plus trusted Origin/Referer validation where applicable and deliberately restrictive credentialed CORS. SameSite is defense in depth; sibling subdomains or browser exceptions mean it is not the sole proof of intent. Cover login/session binding, refresh/logout, registration/contact changes, upload completion, Agent approval, role edits and data rights, not just JSON CRUD.

GET/HEAD/link preview/prefetch never accept an invitation, delete data, submit an approval or mutate business state. Validate supported content types and reject alternate form/JSON paths that bypass controls. Scope multipart/file requests and credentials correctly; direct object-store uploads follow their separate signed policy without forwarding application cookies. Preflight success does not authenticate a caller.

Server Actions and BFF handlers must enforce the same rules as browser API mutations. XSS can execute inside a valid origin, so CSRF is not an XSS remedy. Protect both, use short-lived checked sessions and high-impact reauthentication, and never give the BFF an unconstrained service-account override to compensate for missing user credentials.

### Secrets, Environments and Permission Gates

Only intentionally public configuration uses `NEXT_PUBLIC_`. Public API/WS origins or an ingest DSN, when chosen, are not server credentials; publication still needs abuse/privacy review. Provider keys, database URLs, signing secrets, Sentry upload/auth tokens and sensitive model configuration remain server-only with runtime/CI secret controls. Import boundaries, RSC serialization, generated source maps, debug pages and bundled error data all need exposure checks; a variable without the public prefix can still leak if explicitly serialized.

Choose whether a value is compiled into the client or safely supplied as public runtime configuration. Many frontend public values are build-time substitutions; changing a container environment variable later may not change already built JavaScript. Artifact promotion across dev/staging/production must not route a production account, cookie or signed upload to a test environment. Trusted origins/configuration cannot be changed by query string or Agent instructions.

Backend capabilities drive UI affordances only. Permissions are field/resource-specific and current; a stale admin control, decrypted cached file or existing tab never authorizes a later mutation. A reviewed app lock/local confirmation can protect a shared device but is not server-recognized step-up authentication unless the identity protocol proves it. No claim is made that logout can recall already delivered DOM, browser history, screenshot, download or third-party copies.

### Notification Center and Browser Push

In-app notifications are authorized records with a type/resource reference, privacy-safe content, read/acknowledgment state and current target access. Deep links pass the same auth/resource/history checks as manual navigation. A logged-out or switched-account tab cannot open another account's cached family message from a notification intent.

Browser notification/push permission is optional and only requested at a relevant user action. Permission, push endpoint association, category preference, recipient verification and purpose-specific consent are separate states. Server notification payloads and service-worker display must already be appropriately redacted; page JavaScript may not run before the OS displays a push. Push endpoint rotation, logout and account rebind need verified server updates and safe handling of late messages.

Do not assume the page is open, a service worker runs forever, a browser supports background sync, or a push delivery means the person read it. Sleeping/frozen/closed tabs, revoked permission, private browsing and OS restrictions need supported behavior and limitations. M1 uses durable in-app history, not a browser timer or a live push/call/WhatsApp guarantee. Acknowledgment remains an explicit authenticated action; no medication adherence or emergency assurance follows from browser visibility.

## 12. Responsive Design, Accessibility and Performance

### Shared Language, Native Web Layout

Reuse the proposed semantic colors, Source Sans 3/Noto script coverage, typography hierarchy, 4-unit spacing and privacy/status meanings in the [Android design contract](CHAPTER_08_ANDROID_CONTRACT.md). Those tokens remain proposals; font licensing, web loading/fallback, contrast across actual surfaces and visual approval still need verification. Do not copy Android dp sizing blindly into web CSS or assume existing token arithmetic proves an accessible rendered page.

Use purposeful, restrained type with zero letter-spacing and browser text scaling; avoid viewport-scaled fonts or shrinking meaningful labels to fit. Page bands and lists remain unframed, with repeated item cards or genuinely framed tools only and corners at most 8 px unless a future approved design requires otherwise. Do not place page sections in stacked floating cards or nest cards. No decorative gradient blobs or oversized hero layout belongs in the working application.

| Surface | Wide layout | Narrow layout and state behavior |
| --- | --- | --- |
| Public discovery/Page | Bounded readable content with navigation/filter area and useful real media. | Single primary column, accessible filter dialog/sheet, stable pagination and no clipped controls. |
| Workspace home | Optional left navigation, main independent sections and context panel where useful. | Compact navigation and stacked sections; one service failure does not hide available tasks. |
| Space detail/members | Shared Space header/context and permitted tabs; lists/tables support scanning. | Tabs can become an accessible menu or scrollable control without hiding the active view; member actions do not expose extra private columns. |
| Chat | Conversation list plus selected timeline; optional authorized details. | One view at a time with clear Back/selection restoration, composer above keyboard and preserved timeline position. |
| Agent workspace | Conversation plus optional run/evidence panel, exact review dialog. | Panels become accessible drawers/dialogs or separate routes; do not compress an approval into unreadable truncated text. |
| File/notification/planning | Efficient lists, previews/details and reviewed primary commands. | Stable row/media geometry, readable date/timezone/status, no hover-only action or inaccessible drag target. |
| Moderator view | Case queue, permitted evidence and policy/action context. | Adapt sequentially with explicit selected case and full reviewed action; no hidden decisive fields. |

Use CSS grid/flex with `min-width: 0`, bounded tracks, intrinsic wrapping and aspect ratios for media. Implement responsive constraints, not widths that shift when an icon/progress label or image arrives. Read-only code or data tables may need an explicitly accessible scroll area; general content and primary commands must reflow. Target at least 44 CSS px interactive hit areas in the proposed design, with generous touch layouts and equivalent keyboard access. This is a design target, not a certification claim.

Use Lucide or the chosen existing icon library for familiar navigation/tool controls, with semantic accessible names and appropriate tooltips. Use buttons for commands, anchors for navigation, labeled checkbox/switch for true binary preferences, radio/segmented/menu controls for choices and native or reviewed accessible date/time/numeric inputs. Read-only permission status is not a switch that grants access. User copy reports actual state and action, not marketing explanations of the app's features or keyboard-shortcut tutorials.

Actual avatars, page/post images, document thumbnails and public media must be permitted assets with known provenance and appropriate display, not fabricated family photos or stock backgrounds suggesting real user data. User-dependent absence has neutral placeholder/initials states. Width/height/aspect and descriptive alt text are part of the contract; no asset was fetched or rendered for this document.

### Accessibility and Locale

Use semantic landmarks/headings, skip links, forms/labels, descriptive control roles and errors tied to fields. Dialogs manage focus, Escape/cancel behavior and focus restoration; keyboard navigation must reach all actions without a trap. Responsive menus, context actions, file picking and drag/drop need equivalent touch/keyboard paths. Use reviewed accessibility primitives for complex widgets rather than hand-rolled focus behavior when an established component fits.

Chat/Agent notifications announce permitted concise changes without interrupting typing; allow pausing live announcements and preserve history/focus on pagination. Color, animation or an icon alone never conveys failure, approval, read/delivery or privacy state. Long payloads and translated labels remain fully inspectable before a sensitive action.

Proposed testing includes 320 CSS px reflow, 200% text resize, 400% zoom where applicable, landscape/mobile keyboard, reduced motion, visible focus, light/dark contrast and real screen readers on the supported browser matrix. These are future tests, not validated screenshots. Automated accessibility checks complement keyboard and assistive-technology review; they cannot certify the whole experience.

Use resource-based localization aligned with the planned English/Telugu/Hindi baseline and reviewed later locales/RTL. Preserve original user names/content, support bidi isolation in mixed-script identifiers where needed and do not reverse logical message order with layout direction. Locale-aware dates/numbers/timezones/currency are presentation over canonical values. SSR and first client render must agree on selected locale/timezone and formatted snapshot to avoid hydration mismatch; relative times can update after hydration without exposing stale or incorrect dates.

### Performance Without Privacy Shortcuts

Measure route JavaScript, server render/hydration latency, interaction/input delay, long tasks, list/scroll behavior, memory growth, WS reconnect/replay time, API latency and upload handling on realistic devices/networks. Source debounce and 60 FPS values are examples/targets, not guaranteed budgets. Establish a documented workload before optimizing or claiming numbers.

Use bounded keyset pagination and appropriate virtualization with stable keys and accessible reading behavior, not rendering all conversation history. Load heavy editors/calendars/viewers on demand; keep client boundaries small and avoid sending entire private objects solely to support one button. Cancel stale work and use transitions/deferred input where appropriate with the selected React version; do not add memoization everywhere without measurements or compiler guidance.

Prevent module-global rerenders and duplicate fetching from multiple providers. Preserve scroll/image dimensions to avoid layout shifts. Thumbnail/image optimization follows the reviewed authorization path even when a public proxy would be faster. A virtualized DOM is not an excuse to lose keyboard focus or omit accessible history navigation. Long-running background tabs must release object URLs, subscriptions, event handlers and bounded cache generations on teardown.

## 13. Deployment, Observability and Release Gates

The source permits Docker/CDN/managed hosting. Select supported runtime and actual long-lived WebSocket topology before deployment: a serverless/edge route may not support proxying a persistent socket. A thin BFF can serve HTTP while the browser connects to a separately secured WS gateway using its reviewed ticket/cookie flow. Do not force sockets through an unsupported runtime or fall back to insecure cross-origin tokens.

Build immutable, traceable artifacts with reviewed dependency lockfiles, Node/Next/React versions, TypeScript/lint/unit/component/build/security gates and provenance. Preview and staging use synthetic data, separate sessions/keys/providers and protected access; previews are not allowed to read production accounts to appear realistic. No secrets in client bundles, public environment values, build logs, public source maps or container history. Store private source-map upload credentials outside the application.

Test actual HTML/RSC/static chunks, security headers, redirects, cookies, CDN cache policy, BFF routes, WS handshake and upload CORS at the deployed boundary. Header configuration in source alone is not evidence it survived proxies. CSP nonces and cache modes must work with the chosen renderer, not be weakened after a failing production build.

Rollout/rollback must handle old open tabs, old JavaScript chunks, deployment skew in RSC/action protocols and versioned API/event schemas. Retain required assets or provide a safe reload/update path that preserves permitted unsent drafts without auto-resubmitting sensitive mutations. A browser with an unsupported critical event version cannot simply advance its cursor and ignore the change. One versioned API schema and compatibility matrix binds both Android and web.

Separate frontend rollout from reviewed backend migrations; a web startup/build hook must not blindly apply destructive database changes. Canary or phased release, health/readiness, smoke tests, rollback artifacts and ownership are required before public deployment. An endpoint responding 200 or a successful build does not certify login, private caching, realtime or data-rights workflows.

Observability uses safe route templates, request/correlation IDs, bounded error categories and actual operation state; source browser-generated correlation hints remain untrusted. Track API/render/WS/job-facing UI failures, session/permission denial, idempotency conflicts/unknown outcomes, reconnect/reset, stale-tab/version mismatch, upload state and action completion separately. Do not put arbitrary private IDs/queries in high-cardinality metrics or send message bodies to error tracking.

Error tracking, analytics, screenshots/session replay, network breadcrumbs and DOM capture can expose private data even when manual logs are clean. Default sensitive routes to no session replay/content capture until a reviewed minimization/redaction/consent policy and tests prove suitability. Apply retention/access controls and inspect serialized events and source maps. Secret/health/private-content redaction must cover failures and provider messages, not just happy-path telemetry.

## 14. Proposed Acceptance Evidence

All C9-V scenarios are proposed evidence families, currently NOT RUN. They map to the exact source acceptance/topics and the web contract rules. Deferred capabilities remain unverified; document coverage is not browser/security execution.

| Check | Source topics | Source acceptance | Contract rules | Workflows | Required evidence |
| --- | --- | --- | --- | --- | --- |
| C9-V01 | C9-S01, C9-S02, C9-S03, C9-S04, C9-S35, C9-S37 | C9-A05 | C9-K01, C9-K06, C9-K16 | C9-W03, C9-W04 | Actual module/server-client boundaries and served contracts show one FastAPI authority, request-local session transport and no alternate BFF business logic or internal credential leakage. |
| C9-V02 | C9-S05, C9-S07 | C9-A02, C9-A10 | C9-K03, C9-K08, C9-K15 | C9-W01, C9-W03, C9-W04 | Source-to-canonical routes, literal /app mapping, deep links, auth return, Back/reload, unknown/denied resources and protected layout persistence behave correctly without duplicating route implementations. |
| C9-V03 | C9-S05, C9-S06 | C9-A01, C9-A02 | C9-K03, C9-K04, C9-K05 | C9-W01, C9-W02 | Inspect initial HTML, RSC, metadata, OG/sitemap, prefetch and streamed error output for public/private/deleted content. Private titles or props never escape before a late denial. |
| C9-V04 | C9-S06, C9-S13, C9-S14 | C9-A02, C9-A04 | C9-K04, C9-K05, C9-K08 | C9-W02, C9-W04 | Two isolated users hit the same server concurrently and through warmed data/route/CDN/query caches. No global QueryClient/session/response crosses users; mutation to private tests real cache eligibility/invalidation failure behavior. |
| C9-V05 | C9-S09, C9-S10 | C9-A03, C9-A04 | C9-K01, C9-K02, C9-K03 | C9-W03 | Real login/refresh/revoke and BFF/direct topology verify cookie flags/domain/path, request-local backend binding, assurance and safe callbacks. Forged user/upstream headers/URLs cannot gain proxy or admin authority. |
| C9-V06 | C9-S09, C9-S23 | C9-A03, C9-A13 | C9-K02, C9-K14 | C9-W03, C9-W09 | CSRF/login-CSRF, disallowed Origin/Referer, credentialed CORS, alternate forms/media and GET/prefetch state changes are rejected on actual APIs/BFF/Server Actions where present. SameSite alone is not the test. |
| C9-V07 | C9-S11, C9-S12 | C9-A05 | C9-K06, C9-K07 | C9-W03, C9-W05, C9-W06 | Generated/validated TypeScript and Kotlin contracts agree on envelope, errors, 204/202 meaning, exact large sequences, dates/nulls and preconditions. Non-JSON/oversized errors and misleading provider responses are bounded. |
| C9-V08 | C9-S12, C9-S13 | C9-A05, C9-A07 | C9-K06, C9-K07, C9-K08 | C9-W05, C9-W06 | Double-submit, lost acknowledgment, in-progress/expired idempotency and stale version cannot create a second effect or automatic overwrite. Current revoked authority cannot replay a private old receipt. |
| C9-V09 | C9-S13, C9-S14 | C9-A02, C9-A05 | C9-K04, C9-K05, C9-K08 | C9-W04, C9-W11 | SSR hydration, late refetch after WS update, form edits during submit and changed account/environment discard stale data correctly. No copying all server records into a persistent global UI store. |
| C9-V10 | C9-S15 | C9-A02, C9-A06 | C9-K02, C9-K03, C9-K09 | C9-W11 | Real browser WS cookie/Origin or one-use ticket auth, per-resource subscription, revoked membership and expired session tests; no long-lived URL/subprotocol bearer or automatic all-Space subscription. |
| C9-V11 | C9-S15, C9-S34 | C9-A06 | C9-K09, C9-K10 | C9-W06, C9-W11 | Mutations during snapshot/paging/connection and delayed events recover with barrier/cursor semantics. Crash/reload tests prove no persisted cursor skips state absent from the memory cache or IndexedDB. |
| C9-V12 | C9-S15, C9-S30 | C9-A06, C9-A17 | C9-K08, C9-K09, C9-K16 | C9-W11 | Bounded reconnect, slow consumer, oversized/unknown-version frames, duplicate/out-of-order events, retained-history expiry and safe reset preserve authorization and report truthful synchronized state. |
| C9-V13 | C9-S09, C9-S14, C9-S15, C9-S34 | C9-A02, C9-A03 | C9-K05, C9-K08, C9-K10 | C9-W03, C9-W09, C9-W11 | Multiple tabs with login/logout/account switch/refresh, BFCache/history restore, pending commands and late service-worker messages cannot read or mutate as the wrong account. Server context binding handles lost broadcasts. |
| C9-V14 | C9-S16 | C9-A07, C9-A14 | C9-K07, C9-K09, C9-K15 | C9-W06 | Timeline pending-to-canonical identity, REST/WS arrival races, reply/media references, cursor history and stable scroll/focus work. Browser accepted, backend persisted, delivered and read are separately evidenced. |
| C9-V15 | C9-S17, C9-S18, C9-S19 | C9-A08 | C9-K04, C9-K11, C9-K16 | C9-W07 | Actual Agent queued/waiting/partial/failure/cancel/final stream replacement is rendered without fabricated progress, hidden reasoning, private scope mixing or false completed status after HTTP 202. |
| C9-V16 | C9-S17, C9-S24 | C9-A02, C9-A09 | C9-K03, C9-K07, C9-K11 | C9-W07 | Exact full payload/recipient/expiry/version is inspectable; edits create a new review. Stale/offline/replayed/unauthorized approval and blanket future-action escalation fail, including after role change. |
| C9-V17 | C9-S17, C9-S24 | C9-A02, C9-A09 | C9-K03, C9-K04, C9-K11 | C9-W07 | Memory owner/source/consent/history and deletion/revocation exclude forbidden hydrated/cached detail, sources and citations. Shared membership does not expose private member memory. |
| C9-V18 | C9-S20 | C9-A01, C9-A14 | C9-K03, C9-K05, C9-K15 | C9-W01, C9-W02 | Public feed queries/filters, duplicate reactions, new-post indicator, keyset pages, public/private change, removed posts and accessible stable media/list geometry work with real API data. |
| C9-V19 | C9-S21, C9-S24 | C9-A02, C9-A10 | C9-K01, C9-K03, C9-K08 | C9-W04 | All released Space types share components yet enforce current roles/history/private conversations. Invites, couple cap, membership expiry/removal and restricted settings fail correctly at the backend despite stale UI controls. |
| C9-V20 | C9-S21, C9-S25, C9-S29 | C9-A05, C9-A10, C9-A16 | C9-K06, C9-K07, C9-K13 | C9-W05 | Task assignment/timezone/date-only/event field privacy, one-time reminder review, inbox/ack and cancel/conflict/retry match Android and backend; no implication of live push or medical outcome. |
| C9-V21 | C9-S22 | C9-A11 | C9-K03, C9-K12 | C9-W08 | File input/drag-drop, size/type/immutable upload version, late PUT/callback, scan rejection, partial indexing and controlled completion are tested. Browser MIME checks alone never mark ready. |
| C9-V22 | C9-S22, C9-S23, C9-S34 | C9-A02, C9-A11, C9-A13 | C9-K05, C9-K10, C9-K12, C9-K14 | C9-W08, C9-W11 | Reload/grant loss/reselection, object URL cleanup, private thumbnails/citations, signed-link revocation limits, malicious HTML/SVG/file names and SSRF through preview/optimizer paths are reviewed and exercised. |
| C9-V23 | C9-S23 | C9-A04, C9-A12, C9-A13 | C9-K04, C9-K12, C9-K14 | C9-W02, C9-W07, C9-W08 | XSS/URL/Markdown/RSC injection and framing tests cover post/comment/Agent/file/error content using the actual sanitizer and deployed CSP/header configuration, not only React escaping. |
| C9-V24 | C9-S23, C9-S32 | C9-A03, C9-A04, C9-A12, C9-A13 | C9-K02, C9-K04, C9-K14, C9-K16 | C9-W03, C9-W09 | Open redirects/encoded paths, cookies, production bundles/source maps, public env substitution, BFF upstream allowlists and error pages do not leak credentials, internal hosts or cross-environment sessions. |
| C9-V25 | C9-S25 | C9-A10, C9-A16 | C9-K07, C9-K08, C9-K15 | C9-W01, C9-W03, C9-W04, C9-W05, C9-W06, C9-W07, C9-W08, C9-W09, C9-W10 | Loading/authorized empty/error/offline/stale/permission-denied/session-expired and unknown action results are independently tested for delivered screens. Unsaved changes and safe review/retry do not produce false success. |
| C9-V26 | C9-S07, C9-S08, C9-S27 | C9-A15 | C9-K15 | C9-W01, C9-W04, C9-W06, C9-W07, C9-W08, C9-W10 | Real narrow/wide/zoom/keyboard/screen-reader/reduced-motion tests verify reflow, hit areas, focus/dialog restoration, contrast and complete approval content. No hover-only controls or nested decorative panels. |
| C9-V27 | C9-S28 | C9-A15 | C9-K06, C9-K15 | C9-W01, C9-W03, C9-W05, C9-W06, C9-W07 | Reviewed locales/fonts/plurals, mixed-script/RTL, long labels and SSR/client timezone agreement preserve canonical data and avoid hydration mismatch or inaccessible controls. |
| C9-V28 | C9-S26 | C9-A14, C9-A15 | C9-K05, C9-K09, C9-K15 | C9-W01, C9-W06, C9-W07, C9-W08, C9-W11 | Measure realistic route bundles/hydration, input/scroll, cache/blob memory, image layout, replay and virtualized keyboard access. Reference frame/debounce targets are not declared achieved without browser/device evidence. |
| C9-V29 | C9-S29, C9-S34 | C9-A02, C9-A16 | C9-K03, C9-K08, C9-K10, C9-K13 | C9-W05, C9-W09, C9-W11 | Optional notification permission, endpoint rotation/rebind, late redacted push/service-worker display and revoked target links/acks work with account context. Browser closure/offline limits are disclosed; no exact timer guarantee. |
| C9-V30 | C9-S24, C9-S30, C9-S31 | C9-A02, C9-A04, C9-A16 | C9-K03, C9-K11, C9-K14, C9-K16 | C9-W07, C9-W09, C9-W10 | Data rights and case-scoped admin operations, export/deletion progress, current assurance and sensitive audit/telemetry isolation reject unauthorized bulk evidence or private-content session replay. |
| C9-V31 | C9-S30, C9-S32, C9-S33 | C9-A12, C9-A17 | C9-K02, C9-K05, C9-K14, C9-K16 | C9-W03, C9-W11 | Actual preview/staging/production boundary, immutable artifact, deployed headers/caches, health, safe traces, old-tab/chunk/API compatibility and rollback preserve secrets and user state without auto-migrations. |
| C9-V32 | C9-S01, C9-S31, C9-S34, C9-S35, C9-S36, C9-S37 | C9-A01, C9-A02, C9-A03, C9-A04, C9-A05, C9-A06, C9-A07, C9-A08, C9-A09, C9-A10, C9-A11, C9-A12, C9-A13, C9-A14, C9-A15, C9-A16, C9-A17 | C9-K01, C9-K06, C9-K09, C9-K10, C9-K16 | C9-W01, C9-W02, C9-W03, C9-W04, C9-W05, C9-W06, C9-W07, C9-W08, C9-W09, C9-W10, C9-W11 | Released browser/FastAPI/data/WS/worker flow uses actual artifacts and includes denial/retry/network/reset/account switching. Record commands, real results, simulations and deferred features; mocks, source coverage or a loading page do not prove end-to-end completion. |

Use Vitest/React Testing Library for pure state, validation, reducers and semantic components, then real browser/HTTP/WebSocket/backend integration for cookies, CSRF, RSC/cache behavior, concurrency and lifecycle. Playwright covers supported browsers/viewports with isolated synthetic accounts, screenshots and accessibility/manual review as appropriate. A mocked network cannot prove backend authorization or provider delivery; a saved screenshot path cannot prove it was reviewed. No browser sessions, servers or tests were launched to produce this draft.

## 15. Developer Handoff, Demo and Next Chapter

| Ticket | Accountable role | Depends on | Deliverable and evidence |
| --- | --- | --- | --- |
| C9-T01 | Product/web/security leads, Teams A/B/E | Applicable Chapter 1/18/3/6/7/8 decisions | Resolve route/topology/cache/offline/browser/design/provider gates for the release slice; record C9-D01 through C9-D14 without treating proposals as approved. |
| C9-T02 | Web/API architect, Teams B/C | C9-T01 | Reviewed App Router hierarchy, server/client boundaries, request-local BFF/session adapter, typed transport and deployment compatibility; C9-V01 through C9-V09 design-to-build evidence. |
| C9-T03 | Product designer/frontend systems engineer, Teams A/B | C9-T01, C9-T02 | Actual responsive prototypes, component/state/asset/font system aligned with Android and web semantics; keyboard/focus/reflow/locale requirements for C9-V25 through C9-V28. |
| C9-T04 | Web identity/Space engineer, Team B | C9-T02, C9-T03; released identity/Space APIs | Implement current-session auth, onboarding, family/create/invite/member/settings flows with real cache isolation and CSRF; C9-V02, C9-V04 through C9-V09, C9-V19. |
| C9-T05 | Web data/realtime engineer, Teams B/C | C9-T02; canonical snapshot/stream and backend contracts | Implement account-bound query merge, WS subscriptions, barrier/reset, multi-tab and approved offline storage; C9-V09 through C9-V14. No unsupported browser auth workaround. |
| C9-T06 | Web planning/notification engineer, Team B | C9-T04, C9-T05; released scheduling APIs | Ordinary M1 task/reminder review/inbox/ack, timezone/preference/state and cancellation; C9-V20, C9-V25, C9-V29. Push and external channels remain separate gates. |
| C9-T07 | Web community/messaging engineer, Team B | C9-T03, C9-T04, C9-T05; released public/chat APIs | Split public render/feed/post and reliable chat changes into bounded tickets; C9-V03, C9-V14, C9-V18. Not hidden prerequisites for the first family reminder slice. |
| C9-T08 | Web Agent/file engineer, Teams B/D | C9-T03, C9-T04, C9-T05; approved Agent/file APIs | Exact scoped Agent/run/approval/memory and immutable upload/preview state; C9-V15 through C9-V17 and C9-V21 through C9-V23. No MVP health/external authority added by UI examples. |
| C9-T09 | Security/privacy engineer, Teams B/E | C9-T02; C9-T04 through C9-T08 for released integrations | Verify actual cookie/CSRF/XSS/CSP/RSC/cache/media/telemetry boundaries and data-rights/admin surfaces; C9-V04 through C9-V06, C9-V13, C9-V22 through C9-V24, C9-V30. |
| C9-T10 | Web QA/accessibility/performance engineer, Teams B/E | C9-T03; C9-T04 through C9-T09 for delivered flows | Real supported-browser narrow/wide/zoom/screen-reader/locale/network/lifecycle tests and measured budgets; C9-V25 through C9-V29, with genuine screenshots/results and limits. |
| C9-T11 | Release/SRE/integration QA, Teams C/E | C9-T04 through C9-T10 for released scope | Run applicable C9-V01 through C9-V32, deployed-boundary/rollback/old-tab compatibility and shared Android/backend demo. Publish failures, synthetic provider use and untested capabilities. |
| C9-T12 | Backend/platform architecture lead, Team C | C9-T02; C9-T11 for runtime evidence | Chapter 10 handoff for process/deployment topology, request-local services, secure network/worker boundaries, observability, budgets and recovery. Design may proceed now; production readiness requires later executed gates. |

These are ownership packages, not staffed people, executed subagents or authorization to implement all features at once. Split into source-linked reviewable tickets with owners, dependencies, exact schema/API/UI changes, tests/commands, security/privacy risks, applicable ADR/migration notes, runbook, demo and limitations. Continuous security/accessibility review starts with the first slice.

Once implementation is authorized, demonstrate the browser M1 with synthetic data: register/verify/sign in -> private family creation -> intended invitation and acceptance/confirmation -> shared task/one-time reminder review -> persisted in-app notification -> explicit acknowledgment -> reload/offline/retry/cancel or removal -> denied stale link. Compare canonical results on Android/core web where those clients exist. No file, Agent, push/provider or full-MVP success is inferred from that smaller demonstration.

| Mistake | Consequence | Design requirement |
| --- | --- | --- |
| Cache authenticated HTML/RSC globally or hydrate a whole backend object. | One user or anonymous crawler receives another user's private data. | Request-local principal, explicit no shared private cache and minimal serialized projections. |
| Treat middleware/layout or BFF service credentials as final authority. | Cross-resource access or hidden bypass of identity/consent rules. | Current backend checks in the actual read/mutation with a verified scoped principal. |
| Reuse old-tab state after cookie account switch. | Commands execute under the wrong user or old data remains visible. | Context generations, server-bound intended account and account-scoped cache/outbox recovery. |
| Persist only a last-sequence token or queue every mutation offline. | Missed changes after reload or unauthorized repeated approvals/deletions. | Coherent state/cursor persistence and an explicit safe-operation allowlist. |
| Assume React escaping, HttpOnly or CSP alone solves browser security. | XSS/CSRF/URL/proxy or serialization leaks remain. | Layered tested sinks, origins, session/CSRF, projection and deployed header controls. |
| Interpret status transitions or cached private content as current truth. | False delivery/completion and unauthorized data after revocation. | Canonical state/versions, safe stale behavior, current authorization and honest limits. |
| Ship only a normal desktop screenshot. | Mobile/zoom/keyboard/screen-reader workflows break. | Responsive semantic layouts and actual supported-browser/assistive-tech evidence. |

Next: [Chapter 10](../Chapter10.md), consolidating backend service/process ownership, deployment environments, queues/workers, secure network and secret boundaries, scaling, observability, backups, recovery and release gates. Carry [Chapter 11 security](../Chapter11.md), [Chapter 13 scheduling](../Chapter13.md), [Chapter 19 encryption](../Chapter19.md) and [Chapter 20 delivery](../Chapter20.md) into their affected operational decisions.

This completes the proposed web design handoff. Source coverage, client parity and known conflicts are documented; no Next.js files, generated clients, website, deployment, browser test or approved visual artifact is claimed.