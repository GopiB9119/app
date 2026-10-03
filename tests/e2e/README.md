# e2e

Live journeys through a real browser, the web proxy, the API and PostgreSQL. They use synthetic accounts and local mail only, and need the local stack from the [runbook](../../docs/runbooks/README.md) with the web preview at http://127.0.0.1:3000.

| File | Journeys |
| --- | --- |
| `identity.test.mjs` | Accounts, Spaces, invitations, membership, tasks, reminders, messages, community, events, care, groups, documents and the agent |
| `scheduling.test.mjs` | Repeating reminders and snooze, with a real delivery by the worker |
| `alerts.test.mjs` | Alerts, quiet hours and backup people (conflict C10 in the Product Understanding) |

Run every journey from `web/`; the script picks up every `*.test.mjs` file in this folder. The tests use the Chromium that comes with the installed Playwright (build 1223 for Playwright 1.60); set `COMMUNITY_CHROMIUM_PATH` only to use another installed Chromium.

```powershell
npm run test:e2e
```

To save a JUnit report, set `FORCE_COLOR` to `0` first. `NO_COLOR` is not enough: Playwright still adds colour codes to its call logs, and those codes make the XML invalid.

```powershell
$env:FORCE_COLOR = '0'
node --test --test-concurrency=1 --test-reporter=junit --test-reporter-destination=../.local/live-journeys.xml "../tests/e2e/*.test.mjs"
```