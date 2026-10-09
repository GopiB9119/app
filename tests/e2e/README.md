# e2e

Live journeys through a real browser, the web proxy, the API and PostgreSQL. They use synthetic accounts and local mail only, and need the [local infrastructure](../../infra/README.md) with the web preview at http://127.0.0.1:3000.

| File | Journeys |
| --- | --- |
| [identity.test.mjs](identity.test.mjs) | Accounts, Spaces, standalone/event polls, invitations, membership, tasks, reminders, messages, community, events, care, groups, documents and the agent |
| `scheduling.test.mjs` | Repeating reminders and snooze, with a real delivery by the worker |
| `alerts.test.mjs` | Alerts, quiet hours and backup people (conflict C10 in the Product Understanding) |
| [agent-controls.test.mjs](agent-controls.test.mjs) | Four opt-in provider-free journeys: memory editing, private inbox controls, concurrent chat availability, and privacy/account downloads against an owned runtime |

Select provider-free journeys explicitly for the guarded runtime. Set `COMMUNITY_MAIL_URL` to its verified private Mailpit URL;
all mailbox-based fixtures honor it and otherwise default to port 8025. Set `COMMUNITY_CHROMIUM_PATH` to an installed compatible
Chromium executable. A path reported by Playwright is not proof that the browser is installed.

From the application root, for example:

```sh
COMMUNITY_WEB_URL=http://127.0.0.1:3000 COMMUNITY_MAIL_URL=http://127.0.0.1:32770 \
COMMUNITY_CHROMIUM_PATH=<installed-chromium> FORCE_COLOR=0 \
node --test --test-concurrency=1 --test-name-pattern='^(space polls:|polls:)' tests/e2e/identity.test.mjs
```

Use positive test-name prefixes and check the actual selected case count. A negative lookahead that matches the file/root name
can inadvertently select every child case. The [feature verification record](../../infra/README.md#local-feature-verification-2026-10-08)
distinguishes passing journeys, focused retries and provider-dependent gaps.

The moderation/appeal case in [classification.test.mjs](classification.test.mjs) accepts `COMMUNITY_SYNTHETIC_RUNTIME` pointing
to the guarded runtime metadata. Its base and mailbox URLs must match that runtime; temporary moderator changes and checked
cleanup are restricted to the case's own synthetic addresses. Without the flag it uses the existing Docker Compose operator CLI.

Only with separate approval and all provider prerequisites, run every journey from `web/`; the script below picks up every
`*.test.mjs` file, including model-dependent cases. A provider-free run must not use this broad command as its selection.

```powershell
npm run test:e2e
```

To save a JUnit report, set `FORCE_COLOR` to `0` first. `NO_COLOR` is not enough: Playwright still adds colour codes to its call logs, and those codes make the XML invalid.

```powershell
$env:FORCE_COLOR = '0'
node --test --test-concurrency=1 --test-reporter=junit --test-reporter-destination=../.local/live-journeys.xml "../tests/e2e/*.test.mjs"
```

## Provider-Free API Transport

The `api transport:` case in [identity.test.mjs](identity.test.mjs) checks the actual local API, mail worker and database
without visiting a website or requesting a model. It creates only new synthetic accounts and one task, verifies exact retries,
stale-write and access refusals, and reads the persisted task after a fresh login. Every created test session is logged out.
Synthetic accounts and the task remain as local test data. `COMMUNITY_API_URL` defaults to `http://127.0.0.1:8000` and
`COMMUNITY_MAIL_URL` to `http://127.0.0.1:8025`; both must be credential-free loopback HTTP origins.
Mailbox requests reject redirects and share a 20-second abort signal. Cleanup attempts every remaining session even when
one logout fails, and a failed cleanup remains a test failure. The journey checks exact saved fields and denied writes as
well as denied reads.

```powershell
node --test --test-concurrency=1 --test-name-pattern='^api transport:' tests/e2e/identity.test.mjs
```

Expect exactly one passing case and no skips. The file's shared browser fixture still requires installed Playwright/Chromium;
this case does not exercise browser controls and must never substitute for the browser, responsive or live-model gates.
Use the prefix `^api transport` without the colon to include the two synthetic mailbox/cleanup regression cases as well;
that selection expects three passes, including one real API journey.

## Provider-free Local Controls

From the application root, with the [guarded synthetic runtime](../../infra/README.md#account-downloads-and-focused-follow-up-2026-10-08),
its API, mail and export workers, and the preview already running:

```sh
FORCE_COLOR=0 \
COMMUNITY_AGENT_CONTROLS_RUNTIME="$PWD/.local/synthetic-api-polls-20261007-0bk7P8/runtime.json" \
COMMUNITY_CHROMIUM_PATH=<installed-chromium> \
node --test --test-concurrency=1 tests/e2e/agent-controls.test.mjs
```

The explicit runtime flag is required; without it these cases are skipped, not qualified. The launcher validates the owned source,
synthetic database and provider-disabled environment. Private Mailpit comes from that runtime, not a shared default mailbox.
The tests create fresh `.test` accounts/Spaces through the real browser/API and seed only those accounts with labeled synthetic
memories and request history. They do not submit model requests, approve real-world actions, reset existing data or impersonate
real customers. Synthetic accounts/history remain as test data; memory deletion is exercised on the test memory.
The account-data case requires the dedicated export worker. It verifies a real download, retry deduplication, another account/session's
inability to download it, permission withdrawal and export cancellation. It opens then cancels account-deletion confirmation and asserts
that no deletion command was sent. The chat case checks ten sends with active typing/live streams and thirty bounded health reads.
These four cases make no model request; other live files can require a separately approved model configuration.