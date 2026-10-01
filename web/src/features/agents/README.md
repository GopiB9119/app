# agents (web)

The agent screen at `/app/agent` ([T34](../../../../docs/TASKS.md#approved-requirements-not-built-yet); [checkpoint](../../../../docs/BUILD_STATUS.md#agent-web-screen-checkpoint)), linked from the signed-in header as "Agent". It is built under [DEC-012](../../../../docs/DECISIONS.md#accepted-decisions), which stays provisional until the owner reviews it (conflict C11).

| File | Role |
| --- | --- |
| `client.ts` | Zod schemas for requests, approvals and memories, and the calls: ask (with `Idempotency-Key`), answer a question, approve (`If-Match` and `Idempotency-Key`) or reject (`If-Match`), stop, list memories, delete a memory. |
| `agent-screen.tsx` | Choose a Space, ask, see your requests newest first, answer a question, check the exact fields and approve or say no, and the Memories view with a confirmation before deleting. |
| `agents.module.css` | Colours, spacing, corners and target sizes from the design tokens only ([DEC-013](../../../../docs/DECISIONS.md#accepted-decisions)). |

Retries: an unconfirmed request keeps its text and key and offers "Send again"; each approval keeps one decision key, so a repeated Approve cannot act twice. Deleting a memory that is already gone, for example after a lost answer, counts as deleted. The web proxy allows only the agent operations listed in `tests/agents-client.test.mjs`, and refuses query parameters on every agent command.

Tests: `tests/agents-client.test.mjs` (client and proxy), `tests/unit/agents-ui.test.mjs` (the screen offline, including 320 px and 200% text) and the `agent:` journey in `tests/e2e/identity.test.mjs` (the real API).
