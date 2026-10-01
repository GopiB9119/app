# agents (backend)

The agent's first release, without an AI model ([T33](../../../../docs/TASKS.md#approved-requirements-not-built-yet), [checkpoint](../../../../docs/BUILD_STATUS.md#agent-backend-checkpoint)). Built under [DEC-012](../../../../docs/DECISIONS.md#accepted-decisions), which waits for the owner's review (conflict C11).

## Files

| File | Role |
| --- | --- |
| `parser.py` | Turns one plain-words request into an intent: list tasks, create, complete, remind, remember, list memories, help, or a refusal category. Fixed rules, no model. |
| `tools.py` | The fixed, versioned tool list (`POLICY_VERSION`), which tools need approval, and the refusal texts. |
| `service.py` | `AgentService`: requests, questions, approvals, execution, memories, history and expiry. |
| `api.py` | The 10 operations under `/v1/agent-runs`, `/v1/agent-approvals`, `/v1/agent-memories` and `/v1/agent-tools`. All require sign-in. |
| `models.py`, `schemas.py` | Tables from migration `0023` and the response views. |

## Rules the code keeps

- **Nothing changes without approval.** A change becomes an approval with exact fields. It runs only when the person approves that version (`If-Match` with the approval's tag, `Idempotency-Key` for the decision), through `TaskService` or `ReminderService`, with the approval's own effect key, so a retry cannot run it twice. Approvals expire after 15 minutes.
- **Only what the person can see.** Tasks and members are read through the task service's own visibility queries. A request belongs to the person and to their current admission in that Space; after leaving or rejoining, earlier requests answer 404.
- **Refusals change nothing:** health and medicines, contacting anyone, reminding other people, money, members, deleting, and sensitive notes.
- **Bounded:** 100 requests a day, at most 4 questions in one request, 50 notes, 10 items listed in an answer, history pages of at most 50.
- **One change at a time per person.** `hold()` takes a per-person transaction lock (`pg_advisory_xact_lock`) before any agent row lock, so parallel requests cannot pass the daily limit, the note limit or a request key. Lock order: person, then request, then approval. The account row is not locked here, because approving calls the task and reminder services, which lock it in their own transactions.

## Tests

`backend/tests/test_agents.py` (19). Local defect injection: `.local/t33-defects.ps1` with `backend/.local/t33_defects.py`; each of the 9 defects must make its test fail.
