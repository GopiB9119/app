# Android Agent

The agent screen on Android ([T35](../../../../../../../../../../docs/TASKS.md#approved-requirements-not-built-yet)), the same flows as the [web screen](../../../../../../../../../../web/src/features/agents/README.md). It is built under [DEC-012](../../../../../../../../../../docs/DECISIONS.md#accepted-decisions), which stays provisional until the owner reviews it (conflict C11). The agent follows fixed rules on the server; there is no AI model.

## What it does

- Opened from the account screen ("Agent").
- Choose a Space, ask in plain words, answer the agent's question in place, check the exact fields of a change ("Check this before I do it") and then Approve or "Don't do it". "Stop this request" ends a request that is waiting for an answer.
- Requests are listed newest first, ten at a time, with "Show earlier requests". Memories lists saved notes; deleting one needs a confirmation that names it.
- Nothing is sent while typing. Messages follow the server's rules: trimmed, 1 to 500 characters, no control or format characters (emoji are allowed).

## Retries

- One command runs at a time. If its answer is lost, the command is kept exactly, with the same request key, approval version and key, or answer, and the screen offers "Send again", "Approve again" or "Try again". "Reload to check" drops it and reloads instead.
- Each approval keeps one key per choice, so pressing Approve again can never approve twice; the server also returns the saved result for a repeated key.
- A definite refusal, for example an approval that changed or expired, clears the command, shows the server's message and reloads the requests.
- Deleting a memory that is already gone counts as deleted.
- Leaving the screen with an unconfirmed command asks first. A 401 or a change of account clears everything.

## Files

| File | Role |
| --- | --- |
| [AgentModels.kt](AgentModels.kt) | Transfer objects, commands and the message rules. |
| [AgentApi.kt](AgentApi.kt) | The 8 API calls the screen uses, with `Idempotency-Key` on ask and approve and `If-Match` on approve and reject. |
| [AgentRepository.kt](AgentRepository.kt) | Checks every response against the request: Space, run, approval, consistent statuses, version tags and pages that move forward without repeats. |
| [AgentViewModel.kt](AgentViewModel.kt) | State, the single running or unconfirmed command, and account isolation. |
| [AgentScreen.kt](AgentScreen.kt) | The screen, built from the design tokens and the existing toggle and dialog styles. |

Responses are capped at 512 KiB for request pages and 256 KiB for memories (`IdentityModule`).

## Tests

`AgentTest` (JVM) and `AgentScreenTest` (on a device, with fake state). Results are in the [checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#android-agent-checkpoint).
