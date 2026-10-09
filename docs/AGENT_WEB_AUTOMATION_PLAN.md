# Agent Web, Research, Monitoring and Shopping Plan

Updated: 2026-10-06. Scope: the owner's requested web Agent improvements. This is an implementation plan, not a claim that every feature below exists or that external purchases are authorized.

## Direction

Owner clarification (2026-10-06): these capabilities belong to the Agent. The person asks in normal chat; the Agent chooses and runs the necessary tools and returns useful information in that conversation. Do not build separate Fetch/Search forms, tabs or technical setup workflows for end users. Technical options belong to internal tool arguments. Ask in chat only for essential missing intent, and keep required action approvals inline.

Keep the existing Python Agent runtime and its typed tools, exact approvals, account boundaries and budgets. Improve its information pipeline first. Use the already installed Playwright with Chromium for a future isolated local browser adapter. Prefer a site's structured WebMCP tools when actually available and verified; do not assume BigBasket supports them.

TinyFish in VS Code is a developer integration. Registering that MCP server does not automatically install browser automation, monitoring or purchasing into the product. The product already calls TinyFish Search and Fetch through [WebLookup](../backend/app/modules/agents/web.py).

No browser can be called the fastest without measurements on the intended workflows. Chromium and Playwright avoid a new commercial browser dependency, but hosting, model use and remote automation can still cost money. Ten-minute delivery is a retailer/location/stock/service promise, not something our scripts can guarantee.

## Current Delivery

- Video embeds send only the site origin, not the private path or query, and still load only after Play. Narrow-screen and doubled-text component tests cover this. Real playback of the exact saved video `pKtweGSC2FU` is now verified by advancing media time, decoded video dimensions and a non-ad player state, not merely iframe loading. This is not a guarantee for unavailable, age-limited or embedding-disabled videos.
- Article extraction preserves sections and retains up to 24,000 characters, delivered in bounded model-safe sections. Continuations require the returned offset and content version; changed versions cannot be silently combined. Capped or unread content is explicit.
- Fetch requests prefer live content with `ttl=0`. This is a cache preference, not proof of freshness. Retrieval time is not publication or event time. Provider behavior needs live verification.
- News instructions require the supported date range, facts, context, changes, attribution and gaps. Detailed requests are not reduced to headlines by default. No prompt or passing finite test proves all news is correct or complete.
- Truncated model text and tool calls are rejected. A source-backed output-limit failure gets at most one answer-only recovery, with no tools and no replay of actions. Its output allocation fits within the same call/total budgets and respects a lower configured output cap. Valid final answers are retained up to 8,000 characters instead of the previous 4,000.
- Answers exceeding the display cap explicitly say that some details were omitted. Accepted reading follow-ups and exact-video requests do not offer a new-search tool; runtime source/ID checks remain as a second boundary.
- Provider-facing transcripts group every assistant tool batch with all its results before automatic article reads. This fixes a real multi-search news request rejection without replaying tools.
- An on-demand page comparison uses a complete earlier read from the same person's same Agent context. It ignores whitespace, duplicate identical lines and line reordering, and preserves changed text such as corrected dates. It does not start a recurring watch.
- Actual search/read/review events drive visible progress. The answer has a short entry animation that respects reduced motion. No hidden reasoning, fabricated percentages or fake browser steps are displayed.
- TinyFish's user-level VS Code HTTP MCP entry and global tool preferences are configured without a stored API key. The MCP endpoint is reachable and returns HTTP 401 with OAuth discovery metadata. Browser OAuth and tools/list are still pending; no TinyFish MCP tools are verified as available in this session. Start `tinyfish` through VS Code's MCP: List Servers command and complete sign-in directly in the browser, never in chat.
- Documented news search arguments are implemented for the Agent: `domain_type=news`, either recency or calendar dates, country and language. Conflicting/invalid filters are rejected before a provider call, and publisher/date metadata is retained as unverified source metadata. A real public query returned five news results with those fields. Activation status is recorded below; these arguments are not a separate user form.
- Saved-source text preview is active and live-verified inside chat: the source list has a click-to-load View text control backed by `GET /v1/agent-runs/{run_id}/web-text`. It returns the latest retained excerpt, at most 2,600 characters per source, only from a matching recorded page-read call/result. Partial and unavailable extracts are explicit, markup is rendered as text, and no new model or provider call occurs. Access still requires the current account and Space admission.
- The mistaken manual Fetch tab, its component, labels, client methods, proxy/API routes and separate worker path have been removed. The existing `read_web_page` tool now accepts validated optional extraction settings and returns bounded content, metadata and links to the same Agent conversation. Normal requests, quotas, Stop, source previews and approval boundaries are reused. No stored user history or database records were deleted.

## Requirements and Boundaries

| Requested Area | Delivery Contract | Boundary |
| --- | --- | --- |
| News and research | Useful, dated, attributed briefings with source coverage and missing facts | Never manufacture fresh news, publication dates or independent confirmation |
| Search tool | Agent derives query and known topic/place/date constraints, reads real results and answers in chat | Search snippets are not full article evidence; no separate search form |
| Extraction tool | Agent reads supplied URLs, choosing Markdown by default and optional format, cache, selectors and link extraction when needed | Typed internal arguments, real provider schema and explicit partial/failure handling; no Fetch tab or form |
| Video | Explicit Play, native player controls, clear fallback, unavailable-content handling | Cannot guarantee embedding, ad-free playback, autoplay or arbitrary ad skipping |
| Page/topic watches | Opted-in, scheduled, meaningful-change summaries with Stop and history | No silent background jobs; no alert from a failed fetch |
| BigBasket/BB Now | Website only, location-aware product research and a reviewed basket | No assumed serviceability, stock, exact delivery time, automatic substitution or checkout |
| Other stores | Later adapters behind the same contract | No generic arbitrary-site write permission |
| Progress and animation | Real plans, tool activity, errors, cancellation and results | Observable work only, not private chain-of-thought |

Existing Main/Space separation, current identity and admission checks, medical restrictions and private chat handling remain. A generic chat confirmation does not approve an external change. Local development authorization is not permission to buy something, use a personal shopping account or spend on cloud automation.

## Delivery Order

### 1. Establish the External Connections

1. The seven named TinyFish/documentation/video hosts were added after the owner's direct go-ahead to the explicit host-permission question. Filtering remains enabled and all 28 earlier entries were retained. This does not permit other retailer/WebMCP hosts or paid/background work.
2. Start the VS Code TinyFish MCP server and complete its browser OAuth directly in VS Code. Do not put keys, passwords or tokens in chat.
3. Record the tools actually returned by MCP discovery. Test one harmless search and fetch, not a purchase or paid automation.
4. Official documentation now confirms Search/Fetch are free at any wallet balance, subject to API access and rate limits. Published rates are $0.016/automation step, $0.002/remote-browser minute and $0.005/completed monitor run; legacy contracts may differ. Account wallet/contract rates are not independently checked. No paid automation or remote browser/monitor was started.
5. Preserve existing 10,000-token call and 2,000,000-token total limits and shared ledger. The existing per-person web cap is 20 lookups/day unless the configured account says otherwise. Do not raise caps to make a demonstration pass.

If any automation call returns an error, inspect `get_run` or `list_runs` before retrying: the remote run may still be executing. Use `get_steps` for diagnostics and `cancel_run` for an owned run. Two or more automation URLs use `batch_create`/`batch_status`; asynchronous automation is used only when explicitly requested.

### 2. Finish the Conversational Information Tools

Use the current toolkit and source records rather than adding a second Agent engine.

1. Define a typed provider-neutral request for search or extraction, then map only documented TinyFish parameters. Preserve request/response size, timeout, named-public-host and redirect checks.
2. Read the URLs supplied in the person's message through the same scoped Agent run. Batch independent fetches only when the executor can preserve exact URL/result mapping, cancellation and quota accounting. The provider supports up to ten URLs per batch; this is not a user form or a guarantee that unlimited reads fit the Agent's budget.
3. Let the Agent choose a documented cache preference when the request requires it: live (`ttl=0`), under one minute, under one hour, under one day, or any cached copy. Preserve an explicit user preference and distinguish it from observed freshness.
4. Allow the Agent to choose documented `include_selectors`/`exclude_selectors` (1-20 standard CSS selectors, each 1-1000 characters) and `links`/`image_links` flags. Metadata such as title, description, language, author and publication date is returned automatically; do not invent a metadata-request flag. Do not ask users to fill selector or format fields. Unmatched selectors must not silently fall back to the full page.
5. Default to Markdown. Render extracted HTML as inert escaped text, not executable markup. Validate structured JSON and show parsing failures. Do not load extracted images or links automatically.
6. Keep canonical URL, publisher, publication/update dates and retrieval time distinct. Preserve unknown dates. Treat canonical/OG/meta values as untrusted source claims, not authority to fetch another origin.
7. Deduplicate exact/canonical URLs and near-identical syndicated reports. Distinct hosts alone do not prove independent reporting. Select a primary source and corroborating coverage when available.
8. Maintain a bounded claim-to-source ledger: claim, supporting passage, source/version, date basis, contradictory passage and unresolved gaps. Summarize, do not reproduce whole articles.
9. Fetch additional sections only for missing requested details. Use deterministic extraction and date/unit parsing before model synthesis. Report partial coverage when budgets or provider access stop work.

Conversation UI: the existing composer is the entry point. Show actual reading/searching progress, the useful answer, source references and optional saved-text inspection in that same conversation. No separate Fetch/Search tab, URL counter form, selector controls or configuration page. Stop and exact change approvals stay in the conversation.

### 3. Qualify Video Playback

- Test a known embeddable video and unavailable, private, age-limited and embedding-disabled videos in a real permitted browser.
- Retain click-to-load, the exact user-selected ID, origin-only referrer, fixed 16:9 frame, sandbox and restricted frame host.
- If adding official player API controls, validate message origin and frame identity and load the SDK only after consent. Distinguish loaded, playing, paused, buffering and error where the official API supports them.
- Keep a visible Open on YouTube fallback and explicit retry. A successful iframe load does not prove playback.
- Let the native player handle advertising and its Skip button. Do not attempt cross-origin DOM injection, hide ads or pretend an ad state is available when the API does not expose it. Do not replace an exact requested video without asking.
- Verify desktop/mobile framing, keyboard controls, captions/fullscreen availability, reduced motion and no playback/network before Play. The approved-host test now proves one actual video plays and closes; the full unavailable/age/embedding/caption matrix remains separate.

### 4. Add Durable Watches

Before activation, the person chooses a URL or topic, meaningful-change criteria, frequency, expiration and notification destination. Default remains off/manual. Start with in-app notifications only; external email/WhatsApp/SMS are separate approvals.

Proposed records: Watch (owner/scope/specification/version/status), Snapshot (watch/version/source/extraction version/hash/timestamps/coverage), Check (lease/attempt/outcome), and Change (baseline/current/evidence/notification key). Reuse the existing scheduler/worker conventions and current identity/notification policy.

Algorithm:

1. Validate current watch authority, source scope, budget and cancellation before claiming work.
2. Fetch with a bounded policy. Authentication, timeout, blocked, unavailable and partial outcomes are not deletions or meaningful changes.
3. Normalize explicitly selected content, excluding only declared boilerplate. Never broadly discard all numbers or dates as noise.
4. Compare content hashes first. For changed snapshots, compute bounded text/structured-field differences. Preserve old/new values and provenance.
5. Evaluate the user's criteria against the differences. Use a model only when deterministic comparisons are insufficient; report uncertainty instead of forcing a binary verdict.
6. Deduplicate repeated/syndicated changes and notifications by watch version and change identity. Persist the new baseline only after a complete successful extraction.
7. Commit the durable change and in-app notification intent together. A crash or retry must not send another notification for the same change.
8. Stop, edit, expire and account/Space revocation invalidate future checks. Keep retention and deletion controls; do not resurrect old watches after restore.

The current on-demand comparison is not this scheduler. The proposed frequency must fit the real lookup cap; ten URLs every fifteen minutes would exceed the current default and is not approved by this plan.

### 5. Build a BigBasket-Only Browser Adapter

Start with product inspection and a local draft basket. Prefer structured WebMCP actions only if the real site advertises compatible tools. Otherwise use installed Playwright/Chromium with semantic locators and a separately versioned BigBasket adapter. Do not introduce an unrestricted browser scripting tool to the model.

Adapter operations should be small and typed: inspect serviceability, search products, read a product/variant, inspect basket, propose a quantity change, and read checkout details. Every operation validates the expected origin, page identity and resulting state. Keep selectors and fixtures in the site adapter, not in prompts. Add future stores through new adapters, not relaxed origin checks.

Workflow:

1. Ask for shopping list, quantities, budget and the needed locality. Let the person sign in and enter OTP/address/payment details directly in the isolated browser. Never collect them through Agent chat.
2. Confirm the site actually offers service to that locality. Show the retailer's current delivery estimate without promising ten minutes.
3. Match product name, brand, variant, pack size and unit; reject ambiguous matches. Use exact decimal/minor-unit arithmetic for price and normalized unit comparisons, never binary floats for money.
4. Return a draft basket with product identity, quantities, unit prices, stock observations, substitutes and missing items. Ask before substituting or exceeding budget.
5. Show an exact review before each external mutation unless a separately agreed bounded batch approval covers those precise mutations. Auto-approve for ordinary in-app actions does not cover external cart/checkout.
6. Re-read stock, price, quantities, fees, delivery window and account immediately before applying the reviewed change. Any material difference invalidates approval.
7. If a mutation times out, inspect the current cart/order before retrying. Bind reconciliation to the original intent; never repeat a possibly completed order blindly.
8. Keep checkout/payment disabled until its separate security, product, retailer-terms and failure-handling gates are satisfied. Final purchase needs explicit current approval of the exact total, items, address and delivery details.

Do not export shopping cookies or login state to TinyFish/cloud automation by default. CAPTCHA, reauthentication and ambiguous checkout states return control to the person. No anti-bot bypass or use of undocumented private retailer APIs.

### 6. Measure and Refine

- Record queue, model, search, fetch, extraction and rendering latency separately, including median/p95 and failure rate. Do not confuse a faster spinner with faster work.
- Benchmark the existing local browser against alternatives on the same allowed read-only product tasks before adding a new browser framework.
- Batch independent extraction only after result mapping and quota reservation are tested. Keep dependent cart writes serialized.
- Reuse verified source versions, avoid repeated searches for accepted follow-ups and use conditional requests/cache metadata when actually supported.
- Keep smooth scrolling under the reader's control. Animation must not shift controls, hide errors, distract during long reads or run when reduced motion is requested.
- Provide Cancel, visible partial results and exact retry identity. No fake percentage or fabricated internal reasoning transcript.

## Acceptance Gates

| Area | Required Checks |
| --- | --- |
| Retrieval | Long article correction after the first section; changed-version refusal; complete/capped distinction; valid structured tool JSON; freshness request; unreadable sources |
| News | Real dated sources, source inspection, actual supported period, conflicting/undated coverage, attribution and visible gaps; human review of briefing accuracy |
| Privacy | Same-account/Agent/admission baseline only; no private path referrer; no secrets in logs, provider prompts or instructions; chat-origin isolation |
| MCP | Real OAuth and tools/list success; harmless Search/Fetch; pricing/caps verified; error-after-start inspection before any retry |
| Conversational extraction | Natural request to tools to answer in one chat; safe URLs; per-source failures; internal selector/format bounds; quota/cancellation; inert source text; no separate form/API workflow |
| Monitoring | No activation before approval, failure is not deletion, noise/meaningful change controls, replay deduplication, crash/lease recovery and Stop/revocation |
| Shopping | Wrong origin/account, wrong pack/unit, changed price/stock, unavailable delivery, approval expiry, lost mutation response and no duplicate checkout |
| Video | Real playback plus embed-disabled/error cases; no network before Play; exact video; native controls, mobile, captions and keyboard |
| UI | 320px through desktop, actual 200% text, reduced motion, no overlap, reachable composer/Stop, truthful progress and preserved reading position |

The existing regression homes are [runtime tests](../backend/tests/test_agent_runtime.py), [component tests](../tests/unit/agents-ui.test.mjs) and [live journeys](../tests/e2e/agent-llm.test.mjs). Keep failed evidence; a new passing run does not erase a provider outage or prove every market case.

## Product Opportunities to Validate

These are research hypotheses, not claims that no competing product solves them:

- Briefings that show how old each fact is and exactly which questions remain unanswered.
- A correction detector that notices a changed date or amount while ignoring layout churn.
- Shopping that distinguishes the requested pack/variant from a superficially similar cheap result.
- Retry handling that first checks whether a cart/order/remote run already changed.
- Private local shopping sessions without exporting personal cookies to a cloud browser.
- Watches that explain why a change matters and let the person tune noise without losing important numbers.
- A single clear progress view across research, approvals, browser interruptions and partial results.

Fresh competitive research, BigBasket WebMCP support and retailer automation terms remain unverified; their additional site access is not part of the seven-host approval. Published TinyFish rates and Search/Fetch contracts have now been read, but account-specific billing has not been independently checked. Do not turn remaining unknowns into marketing claims.

## Reference Material and Remaining Decisions

Requested official references: https://docs.tinyfish.ai/for-coding-agents , https://docs.tinyfish.ai/llms-full.txt , https://docs.tinyfish.ai/mcp-integration#authentication-flow . WebMCP references to verify: https://webmachinelearning.github.io/webmcp/ and https://developer.chrome.com/blog/webmcp-epp . VS Code: https://code.visualstudio.com/docs/copilot/customization/mcp-servers . Retailer: https://www.bigbasket.com/ . These were not all retrievable in the current environment.

Still needed before dependent live work: VS Code OAuth and actual MCP tool discovery; account-specific automation costs and any additional retailer/WebMCP host permission; BigBasket locality/test account and allowed action scope; exact checkout policy; watch frequency/criteria/destination/retention; and permission for paid remote automation. None requires sharing secrets in chat. No background monitoring, paid browser run or real purchase is active.

## Verification Record

- Backend Agent integration: 117 tests passed in `backend/.local/agent-news-tool-order-final-regression-20261006.xml`. After the final tool-selection/display-limit change, its focused 11 checks passed in `backend/.local/agent-news-tool-selection-20261006.xml`. These are overlapping suites, not 128 distinct tests.
- Actual-component UI: 3 checks passed in `.local/agent-news-final-ui-20261006.xml`, including origin-only iframe request headers, no pre-Play traffic, 320px/200% text, real progress, Stop availability and reduced motion. Web TypeScript passed.
- Real model, existing TinyFish API and browser: both live journeys passed in `.local/agent-web-information-20261006-113334.xml`; web information 74.317 seconds, news information 73.554 seconds. Fresh synthetic accounts only. These prove the exercised workflows, not exhaustive news accuracy or external video streaming.
- Retained earlier live failures: a repeated offer paraphrase, output-limit failure, invalid parallel-tool transcript ordering, and rejected-but-still-offered searches. No failed run was relabeled or deleted.
- TinyFish user-level MCP configuration and instructions passed local checks. No TinyFish MCP tools were exposed to this session, so OAuth, server connection and tool discovery are NOT verified. The existing product's successful TinyFish Search/Fetch calls are a separate integration.
- Earlier automatic unavailable-user replies were not treated as consent. On the later direct reply to the explicit seven-host question, the owner said "please continue"; the scoped interpretation was announced before adding only `agent.tinyfish.ai`, `docs.tinyfish.ai`, `code.visualstudio.com`, `www.youtube-nocookie.com`, `www.youtube.com`, `i.ytimg.com` and `*.googlevideo.com`. The filter and 28 existing host entries were verified unchanged. Paid automation, recurring watches, BigBasket browser/cart/checkout and automatic ad handling were not activated.
- Prompt `agent-react-2026-10-06-12` is active after guarded API-only reloads. The saved live test task checks readiness and does not restart the API. The preview remains http://127.0.0.1:3000/app/agent .
- Saved-source follow-up: 9 backend checks passed in `backend/.local/agent-source-preview-final-20261006.xml`; 3 scoped client/BFF checks passed; 6 combined source/media/progress UI checks passed in `.local/agent-source-preview-media-20261006.xml`. Full web TypeScript and generated OpenAPI equality checks passed. Desktop and 320px/200% text screenshots were inspected. Cases cover no model/provider access, other-account denial, stale Space admission, bounded/legacy extracts, mismatched/unpaired records, inert markup and cached-text removal after denial.
- Saved-source activation was initially blocked by database revision `0053` versus workspace head `0054` (public-page help requests/offers, a separate change). On continuation, migration `0054` was already applied. The API was reloaded only after the schema matched and the other live test and Agent runs had finished. This work did not apply the migration or reset data.
- The separate `saved source preview:` browser journey passed in 8.126 seconds: `.local/agent-source-preview-live-20261006-121923.xml`. It reused the owned synthetic web-information fixture, matched the displayed text to the real API, verified the complete run remained unchanged, observed no Agent commands or external browser requests, and confirmed logout. Desktop and 320px/200% text captures were inspected. This validates the new endpoint without another model conversation or TinyFish lookup; the earlier two information journeys remain separate evidence.
- Two earlier preview-only attempts are retained: a discarded login response body (the assertion no longer reads that body), and an initial navigation timeout whose exact cause was not established. The passing test uses DOM-ready navigation followed by actual control waits. Re-run it with `COMMUNITY_AGENT_SOURCE_PREVIEW_STAMP` naming an existing owned web-information synthetic fixture; it must not be pointed at a personal account.
- Before the later direct host go-ahead, the follow-up access check still found those hosts blocked and the automatic permission reply had no selected approval. That historical host blocker is now resolved for only the seven entries above. OAuth, recurring watches and shopping remain pending; the separate Fetch-form proposal was rejected and replaced by Agent-managed extraction in chat.
- Real playback passed in 12.244 seconds: `.local/agent-video-playback-live-20261006-124109.xml`. The test allowed only the approved video hosts, waited for decoded non-ad media to advance by more than one second, checked no video request before Play, retained the exact video ID and removed the iframe with Close. Capture: `.local/screenshots/agent-video-playback-live-1791270681545.png`.
- News filters: 12 focused checks passed in `backend/.local/agent-news-provider-filters-prompt13-20261006.xml`. One real existing-provider query (`NASA space news`, news category, last seven days) returned five results with five publishers and five reported dates in 1.944 seconds. This is adapter evidence, not activation of the new Agent prompt or independent verification of each news claim.
- The broader Agent runtime/model/kinds run had 98 passes and one retained failure in `test_the_database_keeps_main_agent_requests_out_of_spaces_and_refuses_a_lossy_downgrade`: its final assertion hard-codes revision `0053`, while the fixture is now at `0055`. No unrelated migration/test was edited. The development database was `0054` versus workspace `0055` (help request/offer reports), so no API reload or migration was performed for prompt 13. The live task is pinned to 13 for use after schema alignment and explicit activation.
- Chat-first correction: 113 runtime/approval checks passed in `backend/.local/agent-chat-extraction-regression-20261006.xml`, eight actual-component checks in `.local/agent-chat-extraction-ui-final-20261006.xml`, three scoped client/proxy checks, full web TypeScript and regenerated OpenAPI equality. Tests cover natural multi-link requests, optional formats/selectors, source metadata, exact retry, quota/Stop and removal of the manual workflow. Prompt 14 and a real `llm web extraction:` journey are prepared; activation/live verification remain to be recorded after the shared API is idle.