# agents (web)

The agent screen at `/app/agent` ([T34](../../../../docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](../../../../docs/BUILD_STATUS.md#agent-web-screen-checkpoint)), linked from the signed-in header as "Agent". It is built under [DEC-012](../../../../docs/DECISIONS.md#accepted-decisions), which stays provisional until the owner reviews it (conflict C11).

| File | Role |
| --- | --- |
| `client.ts` | Zod schemas for requests, approvals and memories, and the calls: ask (with `Idempotency-Key`), answer a question, approve (`If-Match` and `Idempotency-Key`) or reject (`If-Match`), stop, list memories, delete a memory. |
| `agent-screen.tsx` | Choose a Space, ask, see your requests newest first, answer a question, check the exact fields and approve or say no, and the Memories view with a confirmation before deleting. |
| `agents.module.css` | Colours, spacing, corners and target sizes from the design tokens only ([DEC-013](../../../../docs/DECISIONS.md#accepted-decisions)). |
| `agent-progress.tsx`, `agent-progress.module.css` | The working state of a request, built only from its recorded events: the current step (announced once), up to three earlier steps, elapsed time, Stop, and a pulse that runs only while the server reports work. Motion uses the `--motion-*` tokens; reduced motion fades only ([DESIGN.md 10.1](../../../../docs/DESIGN.md#101-agent-progress-built-2026-10-07)). |

Retries: an unconfirmed request keeps its text and key and offers "Send again"; each approval keeps one decision key, so a repeated Approve cannot act twice. Deleting a memory that is already gone, for example after a lost answer, counts as deleted. The web proxy allows only the agent operations listed in `tests/agents-client.test.mjs`, and refuses query parameters on every agent command.

Tests: `tests/agents-client.test.mjs` (client and proxy), `tests/unit/agents-ui.test.mjs` (the screen offline, including 320 px and 200% text) and the `agent:` journey in `tests/e2e/identity.test.mjs` (the real API).

## Shared Interaction Foundation (2026-10-08)

The [operating-layer delivery map](../../../../docs/AGENT_OPERATING_LAYER.md) records the complete owner
request, implemented boundaries and provider-dependent follow-ups. `client.ts` validates version-1 structured
interaction parts against their enclosing authorized run and adapts older responses without broadening scope.

`agent-message.tsx` and its token-based stylesheet render safe Markdown, tables, highlighted code and MathML
in Main responses, private Space reviews and explicitly shared Agent reply text. Code and answers can be copied
or downloaded; code can be collapsed or shown with line numbers. Raw HTML is disabled and Markdown images
are explicit links, not tracking requests. Clipboard failure is retryable. This renderer cannot execute tools.

Edit-as-new fills an empty Main composer and turns off auto-approval; it does not rewrite history, overwrite
an unresolved draft or submit automatically. Source cards show the domain and recorded retrieval timestamp
when present, without inventing freshness for older sources. Private tools, evidence, activity and approvals
stay in private review even when answer text is shared into a Space chat.
