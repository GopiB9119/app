# agents (web)

The agent screen at `/app/agent` ([T34](../../../../docs/TASKS.md#approved-requirements-not-built-yet)). **Not linked from any navigation:** it waits for the owner's review of [DEC-012](../../../../docs/DECISIONS.md#accepted-decisions) (conflict C11). The agent API has been live on the local server since the development database reached `0024`; this screen has not been run against it.

| File | Role |
| --- | --- |
| `client.ts` | Zod schemas for requests, approvals and memories, and the calls: ask (with `Idempotency-Key`), answer a question, approve (`If-Match` and `Idempotency-Key`) or reject (`If-Match`), stop, list memories, delete a memory. |
| `agent-screen.tsx` | Choose a Space, ask, see your requests newest first, answer a question, check the exact fields and approve or say no, and the Memories view with a confirmation before deleting. |
| `agents.module.css` | Colours, spacing, corners and target sizes from the design tokens only ([DEC-013](../../../../docs/DECISIONS.md#accepted-decisions)). |

Retries: an unconfirmed request keeps its text and key and offers "Send again"; each approval keeps one decision key, so a repeated Approve cannot act twice. The web proxy allows only the agent operations listed in `tests/agents-client.test.mjs`, and refuses query parameters on every agent command.
