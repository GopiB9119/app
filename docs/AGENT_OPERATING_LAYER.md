# Shared Agent Operating Layer

Owner request: 2026-10-08. Scope: the existing backend and website, Main Agent and Space `@agent`.
This records the supplied interaction/execution specification and its delivery boundaries. It does not
restore the historical governance documents missing from this checkout or claim the full platform is built.

## Architecture

Keep one runtime, not a separate LLM endpoint for each component or specialist:

```text
Main Agent screen / Space chat / private request review
  -> existing authenticated conversation and Agent APIs
  -> Agent binding and bounded runtime
  -> authorized context, planning, memory and tool registry
  -> owning service permissions and exact human review
  -> execution, recorded sources and public activity
  -> versioned interaction messages
  -> shared content renderer and existing task/approval controls
```

Main Agent still cannot read private Spaces. A Space Agent remains bound to its Space and the person's
current admission. Sharing an answer does not share its private run, evidence, approvals or memory.
Capability names such as research, coding or design never grant authority to a different resource.
Custom/specialist bindings and agent-picker behavior remain a later implementation, not aliases that
silently inherit all Main or Space permissions.

## Delivered Foundation

- `AgentRunView.interaction` is an additive, serialization-only projection of already-authorized public
  fields. Version 1 includes run identity, agent kind, Space scope, run status and stable request/response
  message IDs. Existing response fields remain available for older clients.
- Message parts are discriminated by `type`: `text`, `markdown`, `activity`, `task`, `tool`, `sources`,
  `evidence`, `approval`, `question`, `handoffs`. Private model transcripts, credentials, prompts and
  checkpoint state are not projected. An activity trace is not chain-of-thought.
- The web client validates the projection against its enclosing run, including exact review fields,
  scope, status, message identity and content. Unsupported protocol versions/parts fail closed.
  Old responses without `interaction` use the same projection locally; their capabilities are not expanded.
- Main replies, private Space request reviews and explicitly shared `@agent` answer text use a common
  Markdown renderer: headings, lists, quotes, GFM tables/task lists, syntax-highlighted fenced code,
  bounded untrusted math rendered as MathML, line numbers and collapsible code. Human chat stays literal.
- Copy and download operate on exact answer/code text. Clipboard failure stays visible and retryable.
  Code downloads are plain text, never executed or automatically applied.
- Main request `Edit as new` fills an empty composer, preserves the original run, refuses to replace
  an existing/unconfirmed draft, turns off auto-approval and waits for a fresh explicit submission.
  It is not a persisted conversation branch, automatic regeneration or action retry.
- Source previews retain existing authorization/retry checks and now show the source domain and recorded
  retrieval time when available. Missing dates stay unknown. Retrieval is not publication time, origin
  freshness or independent fact verification; configured cache preferences still apply.
- Raw HTML and script/data/credential-bearing links are not rendered as active content. Markdown images
  become explicit links, not automatic remote requests. Existing user-initiated video playback is unchanged.
- Existing task status, recorded progress, Stop, clarifying questions, approvals, exact retries, source
  excerpts, memory controls and Space handoff links stay on their existing permission-checked paths.

This is a run-level interaction protocol, not a new durable conversation database or artifact store.
Legacy and structured fields are intentionally duplicated during this compatibility stage; a later version
can remove that duplication only after client migration.

## Complete Capability Map

`Existing` means current code, not a new qualification of every behavior. `Gated` means provider/configuration
is required and was not activated. `Planned` means not implemented by this delivery.

| Requested Area | Current Boundary | Next Acceptance Condition |
| --- | --- | --- |
| Conversation identity, participants, history, pagination | Existing Space conversations and private requester-owned runs; typed messages added | Durable Agent conversation IDs, participant/scope checks, continuation and admission-aware history |
| Chat list, search, pin/archive/delete, unread/favorites/folders/sort/multi-select | Existing chat lists, pagination and Agent task status filters; remaining Agent conversation management planned | Persist per-person metadata and scope-bound search/cursors; safe bulk confirmation and exact retries |
| Text, Markdown, code, tables and math | Delivered shared renderer | Preserve sanitization, accessible tables/code, large text, exact clipboard/download and language coverage |
| Message actions | Copy/download/edit-as-new added; existing Stop, answer sharing and request/approval retry retained | Persist edit/branch/bookmark/report/feedback; add regenerate/continue/translate/summarize/follow-up/delegation without replaying effects |
| Developer actions | Code inspection display only | Sandboxed explain/fix/refactor/test/review, explicit patch review and scoped GitHub PR permission; no arbitrary browser execution |
| Prompt input and suggestions | Existing multiline composer, suggestions and Space `@agent` mentions | Unified agent/command/context pickers, prompt history, model/execution mode permissions and user-selected attachments; voice requires a separately configured input pipeline |
| Agent identity, picker and custom specialists | Existing Main/family/couple/group/solo bindings | Versioned definitions with instructions, capabilities, tool allowlists, output schema, safety/evaluation policy and no scope escalation |
| Delegation and handoff | Existing bounded read-only research helper and explicit Space-chat links | Durable parent/child tasks, budgets, cancellation, reviewed handoffs and source attribution; specialists cannot broaden the parent's authority |
| AgentActivity, status, loaders and shimmer | Existing recorded progress and reduced-motion loading; public activity message part added | Announce only real events; never expose private chain-of-thought or synthesize fake progress |
| Long-running tasks | Existing bounded runs, leases, waiting states, cancellation and task inbox | Durable queue/resumption identity, pause policy and coordinated child-task cancellation; do not relabel unsupported states as implemented |
| Browser read/search/live website content | Existing gated search and bounded public page extraction; source provenance added | Approved provider, quotas, SSRF/redirect defenses and live-provider evidence; report cached/partial/failed results honestly |
| Browser interactive/transactional | Planned | Isolated browser sessions, credential handling, navigation/download/upload policy, prompt-injection tests and transaction boundary before any submission |
| Research modes and evidence | Existing bounded search/read/helper, sources and excerpts; provider gated | Quick/standard/deep/comparative/technical/market/academic plans with claim-evidence mapping, deduplication, contradictions, confidence and timestamps |
| ChatSource/citations/preview/browser/evidence | Existing web sources, internal evidence and authorized excerpt preview; typed parts and dates added | Stable resource/version identities, accessible citation navigation, author/published metadata and per-resource access recheck; no invented trust score |
| Connectors | Planned, no connected accounts added | OAuth/service-specific auth, secret vault, discover/search/read/create/update/delete capability declarations, revocation, scopes, resource picker and audited execution |
| Purchases | Not enabled | Exact product/options/quantity/currency/final total/shipping/merchant/quote expiry review, explicit final authorization, idempotent execution and receipt/uncertain-outcome reconciliation |
| Bookings | Not enabled | Exact provider/service/location/date/timezone/party/price/cancellation terms review, explicit final authorization and confirmation/reconciliation |
| Unified tools and execution UI | Existing typed tool registry and permission-checked service adapters, progress/review/history; structured tool parts added | Versioned input/output schemas, category, effect/risk, confirmation policy, availability, async/streaming flags; no connector direct-to-LLM bypass |
| Attachments and selected context | Existing private text/Markdown/CSV document service and bounded retrieval; no generic chat upload | Quarantine/scan, MIME/magic/size/archive validation, safe extraction, object storage and ACL binding before retrieval; PDF/Office/image/audio/video need approved parsers and retention policy |
| Image understanding/generation and live demo media | Planned; Markdown media does not auto-fetch | Approved model/media provider, explicit data disclosure, bounded image/OCR context, source/license/alt-text provenance and safe local media serving |
| Charts, networks, flows and architecture | Planned, not generated from arbitrary executable Markdown | Typed artifact data with nodes/edges/groups or series/axes, validated references and limits, safe renderer, accessible text/table alternative, editable version and exports |
| Artifacts | Answer/code file downloads only, not a generic artifact lifecycle | Persistent document/spreadsheet/presentation/code/chart/diagram/image/dataset/report/research/architecture/plan/task records with owner/scope/version, edit/export/share/regenerate and provenance |
| Context and memory | Existing scoped history, personal/Space memory controls and owning-service retrieval | Explicit selected message/file/artifact/task/community/connector refs; distinct conversation/task/long-term/preferences/community stores with budgets and deletion semantics |
| Authorization and human approval | Existing runtime/owning-service checks and exact reviewed mutations | Intersect user, agent, connector, tool and resource permissions at prepare AND execute; external/destructive/privileged actions always require configured stronger review |
| Streaming | Existing live invalidation plus public recorded events, not token streaming | Versioned authorized message/tool/task/artifact/approval event envelopes with event IDs, sequence/cursor, deduplication, resumable delivery and redaction |
| Errors and AgentResult | Existing structured API failures/run outcomes and retry controls | Typed result with summary, sources, artifacts, confirmed actions, warnings/failures/citations/next actions; distinguish unknown action outcome from safe retry |
| Feedback and evaluation | Existing local golden evaluation tooling, not live quality certification | Scoped feedback/corrections/reports for answer/source/action/agent; quality, policy, hallucination, completion, latency and cost measures on reproducible datasets |

## Protocol And Safety Rules For Follow-Ups

1. Add behavior to the owning runtime/service before advertising a component as available. No decorative
   connector, purchase, booking, upload, image-generation or artifact controls that claim execution they cannot perform.
2. Treat tool output, websites, documents, images and connector text as untrusted data, never permission or
   instructions. Structured UI parts come from validated server records, not arbitrary Markdown directives.
3. Resolve selected context with the current user's resource/admission checks. Retrieve bounded sections;
   do not inject every attachment or the whole community. A generated answer never grants source access.
4. Persist source IDs/versions and artifact relationships without exposing hidden records. Shared artifacts
   need their own reviewed ACL transition; sharing a message cannot implicitly publish supporting private data.
5. Purchases, bookings, external messages, publishing, deletion, invitations, permission changes, merges,
   deployment and financial actions need policy-specific approval. Informational research cannot authorize them.
   Current auto-approve does not authorize a future external transaction. An uncertain submission must be
   reconciled with the provider before retry, not sent again with a new key.
6. Keep activity events factual and compact: action, tool, progress, source and review state. Never store or
   expose private chain-of-thought as a chat part, log, debugging panel or streamed token channel.
7. Preserve current run status names on version 1 (`queued`, `running`, `waiting_for_approval`,
   `waiting_for_user`, `verifying`, `completed`, `failed`, `cancelled`, `timed_out`, `expired`). Planning,
   generic waiting and pause/resume need actual state transitions and recovery tests before new enum values.
8. A future artifact part references a server-authorized artifact/version, not arbitrary executable HTML,
   SVG scripts or remote embedded applications. Diagram nodes/edges and chart datasets stay structured and editable.
9. A future stream uses `{schema_version, event_id, run_id, sequence, type, created_at, payload}` with an
   allowlisted payload per event. Resume checks current access; replay never re-executes an action.
10. Keep evaluation honest: fixture output is synthetic, successful local checks do not prove provider quality,
    and a source timestamp does not prove a claim. Never claim a purchase, booking or receipt without provider evidence.

## Component Ownership

- Chat/input: `ChatConversation`, `ChatListView`, `ChatMessage`, `ChatMessageActions`, `ChatLoader`,
  `ChatAttachment`, `ChatError`, `ChatSearch`, `PromptInput`, `PromptSuggestion`, `AgentMention`,
  `AgentPicker`, `CommandPicker`, `AttachmentPicker`, `ContextSelector`, `MessageBranch`, `MessageEdit`.
- Runtime views: `AgentStatus`, `AgentActivity`, `AgentTask`, `AgentTaskProgress`, `AgentDelegation`,
  `AgentHandoff`, `AgentResult`, `AgentApproval`, `AgentSelector`, `AgentMemoryIndicator`, `ConversationContext`.
- Tools/approvals: `ChatTool`, `ToolCall`, `ToolExecution`, `ToolProgress`, `ToolResult`, `ToolApproval`,
  `ToolError`, `HumanApproval`, `PurchaseApproval`, `BookingApproval`, `PublishApproval`, `DeleteApproval`,
  `ExternalActionApproval`. Every command goes through the same runtime authorization boundary.
- Sources/research: `ChatSource`, `SourceCitation`, `SourceList`, `SourcePreview`, `SourceBrowser`,
  `SourceEvidence`, `ResearchTask`, `ResearchProgress`, `SearchResults`, `ResearchSources`, `Evidence`, `ResearchReport`.
- Content/media: `Markdown`, `CodeBlock`, `Table`, `Citation`, `Math`, `RichContent`, `AttachmentUpload`,
  `AttachmentPreview`, `AttachmentViewer`, `FileContext`, `MediaViewer`, `Image`, `ImageGallery`.
- Artifacts/visuals: `Artifact`, `ArtifactPreview`, `ArtifactEditor`, `ArtifactVersion`, `ArtifactExport`,
  `ArtifactShare`, `Chart`, `Graph`, `Diagram`, `ArchitectureDiagram`, `FlowDiagram`, `VisualizationViewer`.
- Integrations/system: `ConnectorPicker`, `ConnectorAuth`, `ConnectorPermissions`, `ConnectorResourcePicker`,
  `ConnectorStatus`, `StreamingResponse`, `TextShimmer`, `PermissionIndicator`, `SafetyNotice`, `Feedback`, `Retry`.

These are ownership names, not a claim that each has a React file. Existing components should be composed
and extracted when reused; a registry entry alone is not implementation.

## Delivery Order And Activation

1. This delivery: additive protocol, safe shared rich content/actions, source provenance and regressions.
2. Durable conversation/context and artifact contracts, with private-resource and lifecycle tests.
3. Selected attachments and safe structured chart/diagram rendering, backed by those contracts.
4. Connector and research capability adapters with explicit provider/data-processing configuration.
5. Specialist delegation and resumable task/stream contracts with bounded cost and permission inheritance.
6. Interactive browsing and transactional providers only after end-to-end approval, receipt and uncertain-outcome tests.

No external provider, real account, purchase, booking, new paid service, deployment or Android change was
enabled. The retained API may serve a previously qualified source snapshot; this source change alone does
not upgrade that running backend. A compatible web client can still read the previous API responses.

The current dependency audit also reports pre-existing framework/toolchain advisories. The newly introduced
math paths are constrained to the patched direct KaTeX version. A framework upgrade and its wider regression
qualification are separate from this feature, and remain a prerequisite for a production claim.