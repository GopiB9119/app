# Community Agent: End-to-End Plan (Backend and Website)

Status: PROPOSED for the owner's review, 2026-10-06. Scope: backend and website. Android is paused on the owner's instruction
("don't touch Android first"). Inputs: the owner's two directives of 2026-10-06 (Master Product + UX + Agent + Engineering, and
Visual Design System), the owner's chat requests of 2026-10-05 and 2026-10-06, and an inspection of this repository on 2026-10-06.

## 0. How to read this plan

Every important statement carries one label.

| Label | Meaning |
| --- | --- |
| FACT | Checked in this repository or computed on 2026-10-06; the source is named. |
| OBSERVATION | Seen in real usage data in the local database. |
| KNOWLEDGE | General product, design or standards knowledge; not re-checked online in this session. |
| ASSUMPTION | Believed, not checked. Must be validated before it drives a big decision. |
| HYPOTHESIS | A testable claim with a metric. |
| DECISION | A proposed choice. "Owner" means the owner must confirm it. |

Research limits (FACT): this computer's network policy blocked docs.tinyfish.ai, bigbasket.com and youtube-nocookie.com in this
session, and w3.org and Apple's design site in earlier sessions. GitHub was reachable: the Lightpanda and WebMCP READMEs were read.
Competitor notes below are KNOWLEDGE, not fresh research. There are no user interviews yet, so personas are ASSUMPTIONS.
Evidence files: `.local/plan/inventory.txt` (repository inventory) and `.local/plan/contrast.txt` (contrast ratios).

## 1. Decisions the owner needs to make

Items marked ★ block the next phase.

| # | Decision | Recommendation | Why it matters |
| --- | --- | --- | --- |
| D1 ★ | Visual direction: keep the current iOS-style blue tokens, or adopt the "Peacock" palette (section 9) | Adopt Peacock: teal action color, warm stone neutrals, clay community accent | The website redesign another session is doing right now uses iOS blue (#0068d6); the directive asks for a distinct, non-default-blue brand. |
| D2 ★ | Agent model and budget | Use gpt-5-mini for answers and keep gpt-5-nano for quick routing; raise the total budget from 2M to 10M tokens and the per-call limit from 10,000 to 24,000 | The smallest model at low reasoning effort is the main cause of misunderstanding (section 3.3). 1.12M of the 2M budget is used (FACT, usage ledger). |
| D3 | Help requests and offers | Add "Request" and "Offer" as kinds of public posts, with a need-by date, area and status; inside Spaces keep using tasks | The directive's core community loop (need help, get matched, outcome) does not exist yet. |
| D4 | Public events | Let public pages publish events (today every event belongs to a private Space) | The directive needs a full event lifecycle for communities. |
| D5 | Quick-commerce (BigBasket first) | Start read-only: find products and prices, compare, build a cart list with links; the person buys in the store's own app. One script per store. No automatic buying. | Store terms, account security and money risk. |
| D6 | Trust signals | Show facts only: email verified, member since, role (owner, admin, moderator, organizer), new member, requests helped. No reputation score. | The directive forbids fake authority and unfair newcomer penalties. |
| D7 | Development browser policy | Allow the YouTube embed domains and docs.tinyfish.ai in the VS Code network policy, or test in Chrome or Edge | Videos cannot play in the VS Code browser (FACT: blocked by policy); TinyFish API details can't be read. |

Already decided by the owner (FACT, chat 2026-10-06): no automatic reminders for tasks and events; Android work waits.

## 2. Coordination with work already in progress

FACT (file times on 2026-10-06 between 10:19 and 10:33):

- One chat session is redesigning the whole website in an "iOS style": `web/src/components/ui/*` (11 files), the app chrome,
  `globals.css`, about 20 screens, and the design tokens (now primary #0068d6, background #f2f2f7, system font stack).
- Another chat session is changing the Agent's web reading and progress display: `backend/app/modules/agents/{web,toolkit,prompts,runtime}.py`,
  their tests, `agent-screen.tsx` and `agents.module.css` (prompt version 10 became 11 at 10:28).

Working rules (DECISION):

1. One design authority: the semantic tokens in section 9.O, kept in `packages/design-tokens/tokens.json` (the existing single
   source, DEC-013) and generated into CSS. Screens use tokens only; no colors typed by hand.
2. One owner per file at a time. Check file times before editing; never overwrite another session's work.
3. Ship small slices that pass their tests. No big-bang rewrite.

## 3. What exists today

### 3.1 Inventory (FACT, `.local/plan/inventory.txt`)

| Area | Today |
| --- | --- |
| Backend | FastAPI, SQLAlchemy 2, Alembic, PostgreSQL. 16 modules: agents, care, community, discovery, events, files, identity, integrations (empty), messaging, notifications, planning, platform, realtime, safety, scheduling, spaces. 82 tables. 52 migrations, head 0053. |
| API | 215 operations, 181 paths, 334 schemas in `packages/openapi/openapi.json`. Largest groups: Public community 58, Spaces 24, Notifications 20, Events 15, Messaging 11, Agent 10. |
| Workers | identity mail, reminders, exports, account deletion (Docker Compose). |
| Website | Next.js 16.2.3, React 19.2.4, TanStack Query 5, Zod 3, react-hook-form, Radix primitives, lucide icons. 29 pages, 17 feature folders, about 22,600 lines of TypeScript and CSS. Same-origin BFF proxy with CSP. English, Telugu and Hindi. |
| Design system | `tokens.json`: 17 colors, 4px spacing unit, radii 12/16/96, touch targets 44 (web) and 48 (Android). New UI kit: alert, badge, button, card, dropdown-menu, item, section, skeleton, textarea, tooltip. |
| Agent | LLM ReAct runtime on Azure gpt-5-nano (reasoning effort low, 10,000 tokens per call, 2M-token ledger). Main Agent (public community, web, own memories, buttons to Space chats) and one agent per Space (tasks, events, reminders, documents, members). Every change needs approval unless the person turns on auto-approve; public content always asks. Space chat answers are private by default (DEC-061). Web search and page reading through TinyFish (20 lookups per person per day). Limits: 12 steps, 30 tool calls, 2 research helpers per run. |
| Tests | Backend: 60 files, 629 test functions. Web: 62 files, 672 cases, 8 of them live end-to-end files. |
| CI/CD | None (no `.github/workflows`). Local `scripts/verify.ps1`. |
| Deployment | Local Docker Compose only. |
| Observability | JSON request logs with request, trace and span IDs; `/metrics` with work-queue gauges; the token ledger. No trace viewer. |
| Analytics | None. |

### 3.2 Gaps against the directives (FACT: no tables or routes exist for these)

- Help requests, offers, services, opportunities.
- Public community events (events live only inside private Spaces).
- Trust signals beyond roles and verified email; no "this helped" feedback.
- Community recommendations beyond interests and suggested pages (`/v1/me/suggested-pages` exists).
- Watching pages or topics for changes; shopping help.
- Admin views of agent activity and system health (the moderation queue exists).
- Product metrics.

### 3.3 Known problems

1. Misunderstanding (OBSERVATION, `agent_runs`, 2026-10-06 01:13): "i want to day news about openai and mafang" was searched
   literally as "OpenAI news Mafang". The agent read OpenAI's news list page (headings only) and a MAFANG fund page, then ended
   with a menu of options instead of the news.
2. Incomplete news (FACT, `web.py` before the other session's current change): 5 results with 300-character snippets, about 3,000
   characters per page, inside a 10,000-token call.
3. Videos (FACT): in the VS Code browser YouTube embeds are blocked by policy. The agent also offered guessed videos.
4. Wrong context (OBSERVATION, 01:16): a BigBasket product request got video results first.
5. Slow or stuck website (owner's report to the redesign session; ASSUMPTION about the cause until measured on a production build).
6. Out-of-date tests (FACT, earlier run): `tests/unit/agents-ui.test.mjs` still expects removed controls.

## 4. Product discovery

### 4.1 Personas and jobs (ASSUMPTION: validate with 5 to 8 interviews and usage data)

| Persona | Functional job | Emotional job | Social job | Trigger | Workaround today | Anxiety | Success |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Family organizer | Coordinate tasks, events and reminders | Feel in control, less nagging | Be the reliable one | School, doctor and bill dates | WhatsApp groups and memory | Forgetting; family information leaking | Everyone knows what to do, on time |
| Family member, including older people | See what's needed, answer fast | Not feel lost | Contribute | A message or notification | Phone calls | Complicated apps, small text | Done in one or two taps |
| Couple | Shared plans, private notes | Closeness, privacy | None | Daily planning | Chat plus notes apps | Others seeing | Private by default |
| Interest or local community member | Find people, events and answers | Belonging | Recognition | New city or hobby | Facebook groups, WhatsApp | Scams, spam | The right community quickly, and trusted |
| Page owner or organizer | Inform, grow, run events | Pride | Standing | Launch or event | Instagram, WhatsApp broadcasts | Moderation work | Active members, little spam |
| Moderator | Keep the space safe | Fairness | Respect | Reports | Manual review | Mistakes, burnout | Quick, fair decisions with evidence |
| Helper or service provider | Offer skills | Usefulness | Reputation | Requests nearby | Word of mouth | Fake requests | Matched with real needs |

Trust requirement shared by all (ASSUMPTION): nothing private leaves its Space, nothing happens without approval, and the agent says
where its information came from.

### 4.2 Community model (DECISION)

Keep the two containers that already exist (FACT): public Pages (open communities with followers and posts) and private Spaces
(family, couple, group, solo). New community types are policies on these containers (topic, location, posting rules), not new
tables. Local and support communities are Pages with a location or topic and stricter posting rules.

### 4.3 Core objects

| Directive object | Status (FACT) | Plan |
| --- | --- | --- |
| User, Profile, Community (Page, Space), Membership, Role, Permission, Post, Comment, Reaction, Conversation, Message, Group (group Space), Event (Space), Task, Notification, Report, ModerationAction, Agent run/approval/tool call, AuditEvent | Exist | Keep. |
| Request, Offer | Missing | D3: a `kind` on public posts (post, request, offer) with need-by date, area and status (open, helped, closed). Inside Spaces, requests are tasks. |
| Service, Opportunity | Missing | Not now: no evidence of need. Revisit after requests and offers are used. |
| TrustSignal | Partial (roles, verified email) | Computed when read from existing facts; nothing stored as a score. |
| Reputation | Missing | Do not build a score (directive section 15). |
| Recommendation | Partial (suggested pages) | Add explainable reasons ("Because you follow Gardening"). |
| KnowledgeItem, SearchIndex | Partial (documents and chunks; search endpoints) | Unify search later (section 7.2). |
| AgentSession, AgentTask | Exist as runs, events, tool calls, approvals | Keep; add a trace view for admins. |

## 5. Community graph and privacy

```
USER
 ├── FOLLOWS ─────────→ PAGE (public)
 ├── MEMBER_OF ───────→ SPACE (private)
 ├── HAS_ROLE ────────→ PAGE / SPACE (owner, admin, moderator, organizer)
 ├── CREATED ─────────→ POST / REQUEST / OFFER / COMMENT / EVENT
 ├── RESPONDED_TO ────→ REQUEST            (proposed, D3)
 ├── MARKED_HELPED ───→ REQUEST            (proposed, D3)
 ├── INTERESTED_IN ───→ TOPIC / PLACE / LANGUAGE
 └── BLOCKED / MUTED ─→ USER / PAGE / TERM (private to the person)
```

Rules (DECISION):

- Ranking may use follows, interests, page roles, nearby area (only if given) and past help.
- Never exposed: private Space membership, who reported whom, who viewed what, block and mute lists.
- Agents follow DEC-060 (FACT): the Main Agent sees public data and the person's own memories; a Space's agent sees only its Space.

## 6. Information architecture (website)

Current main navigation (FACT, `navigation.tsx`): Home, Spaces, Messages, Discover, Profile. The Agent page `/app/agent` is not one
of the five sections.

Proposal (DECISION):

| Area | Purpose | Notes |
| --- | --- | --- |
| Home | "What needs me now" | Approvals waiting, requests for me, today's tasks and events, unread messages, updates from followed pages. Ranked by relevance and time, never by time spent. |
| Spaces | Private communities | Tasks, events, documents, members, Space chat with @agent. |
| Messages | All chats | Space chats, direct chats, private agent answers with Share. |
| Discover | Public communities | Pages, posts, requests and offers (D3), public events (D4). |
| Profile | Account and safety | Account, privacy, data, interests, feed controls, blocked, moderation (by role). |
| Ask (header button) | The Main Agent | Opens `/app/agent` from every screen. Keeps five sections, avoids crowding. |
| Search (header) | One search | Tabs: All, Communities, Posts, Requests, Events, People (people only within shared communities). |

## 7. Experience plan by area

7.1 Home: approvals and questions from the agent first; then items with dates today; then updates. Empty state: "Nothing needs you
right now. [Ask the Agent] [Discover communities]".

7.2 Search and Discover: natural language becomes filters the person can see and remove as chips. Example: "I need a plumber near
me tomorrow" becomes kind = request or offer, topic = home services, area = the person's chosen area, date = tomorrow. Without an
area given, ask once; never guess location.

7.3 Community page: header (name, purpose, rules link, members, trust facts), tabs Posts, Requests, Events, About. One primary action
per state: Follow; after following, Create post.

7.4 Creation: one composer with a kind selector (Post, Request, Offer, Event), smart defaults (current community), and a preview line
"Visible to: everyone / followers / this Space". Publishing always shows exactly what will be published.

7.5 Help loop (D3):

```
Need help → describe it (or ask the Agent) → Agent suggests public communities and posts (public data only)
→ person chooses → post a Request or message the page → helpers respond → requester marks "Helped" → optional thanks
```

Measures: time to first response, share of requests helped within 48 hours, reports per request.

7.6 Events: public events on pages (D4): create, RSVP, capacity, updates, cancellation, and reminders only when the person asks
(no automatic reminders, owner decision).

7.7 Messaging (exists): add a clearer delivery and read state, report and block in the chat header, private agent answers (done,
DEC-061).

7.8 Notifications: two groups, "Needs you" and "Updates".

7.9 Trust: D6 facts only, each with a plain explanation on tap.

7.10 Safety: checks before publishing (spam and scam signals, links, repeated text), the existing rate limits, report and block, the
existing moderator queue, and human review for high-impact actions. AI may flag and suggest; it never removes or punishes on its own.

## 8. Agent system

### 8.1 Principles

The agent helps; the person decides. Every change is approved, except when the person turns on auto-approve, and public content
always asks. Space answers are private by default. Facts come with sources and dates. The screen never shows "thinking" unless the
server is really working.

### 8.2 Orchestrator

FACT (today): request, then context (scope, memories, recent turns), then a ReAct loop of model and tools, then an answer or an
approval card. Proposed changes (DECISION):

```
request
  → understand: fix spelling and short forms ("to day" → today), detect language and kind of request
  → clarify: one question only if two meanings would change the answer ("MAFANG fund or the MAANG companies?")
  → plan: a short to-do list for 3 or more steps
  → gather: tools (read first), keeping each result short and on topic
  → verify: dates present, numbers copied correctly, at least 2 sources for news or say "only one source"
  → answer: the answer first, then details, then sources. No menu of options at the end.
  → or approval card: what I understood, what I found, what will happen, Approve / Change / Cancel
```

### 8.3 Agents by capability

| Agent | Responsibility | Tools | Permissions | Memory | On failure | Evaluated by |
| --- | --- | --- | --- | --- | --- | --- |
| Main Agent (exists) | Public community, the web, personal memories | Pages and posts (read; writes after approval), web search and read, memories, Space-chat buttons | Public data and the person's own data | The person's memories, not Space notes | Says what failed; never guesses | Golden set of real requests (8.12) |
| Space Agent (exists) | One Space's tasks, events, reminders, documents | Space tools only | That Space, with the person's own role | That Space's notes | Same | Golden set per Space type |
| Research helper (exists) | Reading several sources | Read-only web and documents | Read-only | None | Returns what it has and the gaps | Source coverage |
| Safety check (new, not a chat agent) | Spam and scam signals before publishing | Rules plus a classifier | Flag and hold for review only | None | High-risk content waits for a human | Precision and recall on a labelled set |
| Moderation assistant (new) | Summarize reports, suggest an action | Read reports | Suggest only | None | Falls back to the plain queue | Agreement with moderators |
| Watcher (new, a scheduled job) | Check pages or topics for meaningful changes | Fetch | Read-only | Last content per watch | Backs off, then pauses the watch | False-alert rate |

Not built (directive section 17): analytics, UX research, developer and QA "agents" inside the product. These are engineering
practices, not user features.

### 8.4 Agent graph

```
START → UNDERSTAND → (CLARIFY? → wait for the person) → PLAN
      → GATHER ──┬── web ────┐
                 ├── community┤ (each step: timeout, 1 retry for timeouts, never retry a write)
                 └── memory ──┘
      → VERIFY ─(fails)→ REPLAN (at most once) ─→ GATHER
      → CHANGE NEEDED? ─yes→ APPROVAL CARD → (approved → ACT → RESULT) / (rejected → ANSWER)
                        ─no──→ ANSWER
      → DONE        (cancel from any state; limits: steps, tool calls, time, tokens)
```

### 8.5 Context and token budget (DECISION, needs D2)

- Per call: 24,000 tokens. Per run: 120,000. Per person per day: set by the owner.
- Tool results are cut to the facts needed; long pages are read in parts (the other session is building this now).
- History: the last few turns in full, older turns as a short summary.
- Model tiers: a small model for understanding and routing, a mid model for answers. Record the model used in each run.

### 8.6 News pipeline (DECISION)

1. Rewrite the query: fix spelling, expand short forms, add the date range ("today" means the person's local date).
2. Search; prefer result URLs that are articles with dates over home pages and lists.
3. Read the top 2 or 3 articles (one batch call when the API allows; up to 10 URLs per call per the owner's TinyFish notes).
4. Extract headline, date, place, key facts and figures, who said it.
5. Write "As of <date>: …", group by topic, attribute claims, list sources with dates; say clearly what could not be confirmed.

HYPOTHESIS: with steps 1 to 5 and a mid model, at least 80% of the golden news questions get dated, multi-source answers.

### 8.7 Web tools

FACT: TinyFish Search and Fetch are used with the owner's key. Next (DECISION, needs D7 to read the API): batch reading, a 10-minute
cache for identical reads, and per-person daily limits kept.

### 8.8 Videos

Show only results with a real video ID, play on click, keep "Open on YouTube" as a fallback, and never claim the video started.
Automatic ad skipping is not built: YouTube's terms forbid interfering with ads, and the browser stops our page from pressing
buttons inside YouTube's player.

### 8.9 Watch a page or topic (phase 5)

```
create watch (link or topic, how often: daily by default) → scheduled check → fetch → clean (remove menus, ads, dates)
→ compare with the last version → meaningful? (new paragraphs or changed numbers above a threshold)
→ in-app notice: what changed, with a link → keep the new version
```

Limits: 5 watches per person, at most every 6 hours. Failures back off and pause the watch with a notice.

### 8.10 Quick-commerce (phase 5, D5)

- Store adapters, one script per store (BigBasket first), behind one interface: `search(query, area) → products` with name, size,
  price, MRP, link and whether availability is known.
- The agent compares and builds a cart list; the person buys in the store's own app or site.
- Later, with a new decision: a browser extension that fills the cart in the person's own logged-in browser after approval.
- Never: store passwords, card numbers or one-time codes; buy automatically.
- Browser technology: Playwright with headless Chromium as the reliable baseline. Lightpanda as a spike (FACT from its README:
  AGPL-3.0; in its own benchmark about 9 times faster and 16 times less memory than Chrome; no Windows binary, so Docker or WSL;
  sends usage telemetry unless `LIGHTPANDA_DISABLE_TELEMETRY=true`; partial web API coverage).

### 8.11 WebMCP (later)

FACT (W3C community repository): WebMCP is a draft proposal that lets a website register tools (`document.modelContext.registerTool`)
for agents in the browser. It helps only where the website itself adopts it, so it does not help with BigBasket today. Our own site
could register tools (search, create post, RSVP) so browser assistants can use it safely.

### 8.12 Evaluation

A golden set of about 50 real requests, made anonymous, covering news, community actions, Space actions, videos, shopping and mixed
languages. Each is scored on: understood intent, right tools, complete answer, dates present, no invented sources, approval used
correctly. Run it before every prompt or model change; track the pass rate.

### 8.13 Observability

A trace per run (steps, tools, tokens, time, errors) visible to admins, and daily totals of runs, failures, tokens and average time.
No message text in logs.

## 9. Visual design system

### 9.A Design philosophy

"Quiet help." A calm neutral canvas, one warm action color, text-first hierarchy, and an agent that appears as a helpful participant
in the conversation rather than the centre of the product. Every color, size and movement must help someone understand or act.

### 9.B Brand personality

Human, trusted, modern, intelligent, calm, useful. Avoid: generic SaaS, gaming, crypto, AI neon, heavy glass effects, heavy
gradients, everything very rounded, clutter.

### 9.C Directions and palettes

Three directions were compared, with the current tokens as a baseline. Contrast values are FACT from `.local/plan/contrast.mjs`
(WCAG 2 formula).

| | A. Calm Community, "Peacock" | B. Modern Intelligent, "Ink and Mint" | C. Civic Utility, "Evergreen and Marigold" | Baseline: current iOS style |
| --- | --- | --- | --- | --- |
| Brand | Peacock teal #0D6B66 | Ink navy #1E3A5F | Evergreen #1B5E3A | Blue #0068D6 |
| Secondary | Clay #A3471F (community) | Mint #0B7A66 (agent) | Marigold #E8A317 (fills only) | Orange #B84900 |
| Neutrals | Warm stone (#F7F6F3 to #1B1F1E) | Cool grey (#F5F6F8 to #111827) | Pure white and green-grey | iOS greys (#F2F2F7, #1C1C1E) |
| White text on brand | 6.34:1 | 11.50:1 | 7.75:1 | 5.31:1 |
| Key risk | Teal close to success green: separate with icons and labels | Looks like fintech or generic SaaS | White text on marigold fails (2.17:1); brand vs success green indistinct (1.32:1); saffron-like colors carry political and religious meaning in India | Looks like every iOS app; weak brand distinctiveness; the directive asks against default blue |
| Personality | Warm, human, trustworthy, culturally positive in India (peacock) | Precise, technical, cool | Clear, official, practical | Familiar, neutral |

Selection (DECISION, Owner D1): A, with C's density rules for information-heavy screens and B's precision for agent states.

### 9.C.1 Color tokens (selected)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| color.action.primary | #0D6B66 | #3FA79D | Primary buttons, selected state |
| color.action.primaryHover | #0A5853 | #4DB6AC | Hover |
| color.action.primaryActive | #084743 | #5CC2B7 | Pressed (dark mode presses lighter so the dark label keeps 8.00:1) |
| color.action.primarySubtle | #E2F1EF | #12302D | Selected rows, chips |
| color.action.onPrimary | #FFFFFF | #06201D | Label on primary |
| color.text.primary | #1B1F1E | #ECEFEE | Main text |
| color.text.secondary | #4E5452 | #B8C0BD | Supporting text |
| color.text.tertiary | #646A67 | #959D9A | Metadata |
| color.text.disabled | #A3A8A5 | #5E6663 | Disabled (exempt from contrast rules; never the only cue) |
| color.text.link | #0D6B66 | #4DB6AC | Links (always underlined in body text) |
| color.surface.background | #F7F6F3 | #111413 | Page |
| color.surface.default | #FFFFFF | #181C1B | Cards, sheets |
| color.surface.elevated | #FFFFFF + shadow | #202524 | Menus, popovers |
| color.surface.subtle | #F0EEEA | #1C2120 | Inputs, quiet sections |
| color.surface.inverse | #1B1F1E | #ECEFEE | Toasts |
| color.border.default | #E3DFD8 | #2E3533 | Dividers |
| color.border.subtle | #EDEAE4 | #262C2A | Inner dividers |
| color.border.strong | #857E74 | #6E7774 | Input borders (3:1 or more) |
| color.status.success / subtle / strong | #1E7339 / #E6F4EA / #155C2D | #6CCB8A / #173222 / #8FD9A6 | Success, with a check icon |
| color.status.warning / subtle / strong | #8A5300 / #FFF3D6 / #6B4000; icon #C27400 | #F2B54A / #33270F / #F7C978 | Warning, with a triangle icon |
| color.status.error / subtle / strong | #B3261E / #FDECEA / #8C1D17 | #F28B82 / #3A1A18 / #F6AEA9 | Error, with an alert icon |
| color.status.info / subtle / strong | #1F5FA6 / #E7F0FB / #174A82 | #8AB4F8 / #172A44 / #ADC8FA | Information, with an info icon |
| color.focus | #1F5FA6 | #8AB4F8 | Focus ring (2px, 2px offset) |
| color.selection | #CDE7E4 | #1E4A46 | Text selection |
| color.overlay | rgba(27, 31, 30, 0.48) | rgba(0, 0, 0, 0.6) | Behind dialogs |
| color.agent.default / subtle | #3B5A86 / #EAF0F8 | #A9C1E8 / #1A2433 | Agent label, agent activity |
| color.community.default / subtle | #A3471F / #F8E9E2 | #E8A07F / #34221A | Community accents (sparingly) |
| color.verified | #0D6B66 + check icon | #4DB6AC + check icon | "Email verified" fact only |

Color ratio (DECISION): about 75% neutral surfaces, 15% supporting tones, at most 10% brand and status. Meaning is never carried by
color alone: status uses icon, text and color together.

### 9.D Typography

Family (DECISION): Source Sans 3 (FACT: already bundled under the SIL Open Font License; humanist and readable; tabular figures
through `font-feature-settings: "tnum"`), with Noto Sans Telugu and Noto Sans Devanagari as script fallbacks, and the system stack
while fonts load. One family, no second display font. Letter spacing 0 (DEC-013) because Telugu and Hindi break with tracking.

| Style | Weight | Size / line height (px) | Use |
| --- | --- | --- | --- |
| Display | 700 | 40 / 48 | Landing only |
| H1 | 700 | 32 / 40 | Page title |
| H2 | 650 | 24 / 32 | Section title |
| H3 | 650 | 20 / 28 | Card title |
| H4 | 650 | 17 / 24 | Small heading |
| Body large | 400 | 18 / 28 | Reading view, agent answers |
| Body | 400 | 16 / 24 | Default |
| Body small | 400 | 14 / 20 | Supporting text |
| Caption | 400 | 13 / 18 | Timestamps, metadata |
| Label | 600 | 14 / 20 | Form labels, chips |
| Button | 600 | 16 / 20 | Buttons |
| Navigation | 600 | 13 / 16 (mobile tab bar), 15 / 20 (desktop) | Navigation |
| Numeric | 500, tabular | 16 / 24 | Prices, counts, times |

Telugu and Hindi use line height × 1.15. Text sizes use rem so 200% text works.

### 9.E Spacing

Scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 as `space.1` to `space.24` (the number times 4).

| Use | Value |
| --- | --- |
| Button padding | 12 × 16 (compact 8 × 12) |
| Input padding | 12 × 14 |
| Card padding | 16 (mobile), 20 (desktop) |
| Gap between items in a list | 12 |
| Section spacing | 32 (mobile), 48 (desktop) |
| Page margin | 16 (mobile), 24 (tablet), 32 (desktop) |
| Label to field | 6 → rounded to 8 |
| Form field to field | 16 |

### 9.F Layout

| | Mobile < 768 | Tablet 768–1023 | Desktop ≥ 1024 |
| --- | --- | --- | --- |
| Columns | 4 | 8 | 12 |
| Gutter | 16 | 20 | 24 |
| Margin | 16 | 24 | 32 |
| Navigation | Bottom tab bar | Bottom tab bar or rail | Left rail |
| Content width | Full | Full | Reading 720, wide 1200 |

Breakpoints: 480, 768, 1024, 1280. Mobile reorders content (primary action first) instead of shrinking desktop.

### 9.G Radius and elevation

Radius: XS 4 (badges), SM 8 (chips, inputs), MD 12 (cards, buttons), LG 16 (dialogs, sheets), XL 24 (bottom sheet top), Pill 999
(avatars, toggles). Elevation: Flat (border only), Raised (0 1px 2px rgba(16,24,20,0.06)), Floating (0 8px 24px rgba(16,24,20,0.12)),
Modal (0 24px 48px rgba(16,24,20,0.18) plus the overlay). Prefer borders and surface contrast to shadows.

### 9.G.1 Components and states

Components: Button, Icon Button, Input, Textarea, Select, Search, Checkbox, Radio, Switch, Tabs, Segmented Control, Card, List item,
Avatar, Badge, Chip, Tooltip, Popover, Dropdown, Dialog, Drawer/Sheet, Toast, Banner, Navigation, Breadcrumb (desktop only),
Pagination ("Load more"), Progress, Skeleton, Empty state, Error state.

| State | Rule |
| --- | --- |
| Default | Token colors only |
| Hover | One step darker surface or primary hover; never the only cue |
| Focus | 2px focus ring with 2px offset on every focusable element |
| Active | Primary active; scale 0.98 at most |
| Disabled | Disabled text, no pointer; keep the label readable; explain why nearby when not obvious |
| Loading | Spinner inside the control plus the action word ("Saving…"); keep the size |
| Error | Error border, icon and message under the field |
| Success | Check icon and text, then return to default |
| Selected | Primary subtle background, check or bar indicator |

### 9.H Agent UI system

States come only from the server (run status, tool calls, events). Never shown when nothing is running.

| State | Shown when | Text |
| --- | --- | --- |
| Starting | Run queued | "Starting…" |
| Understanding | First model step | "Understanding your request" |
| Searching | A web or community search runs | "Searching the web for …" |
| Reading | A page or document read runs | "Reading <source title>" |
| Comparing | Research helper or several reads | "Comparing 3 sources" |
| Waiting for approval | Approval pending | "Check this before I do it" |
| Needs clarification | Question pending | "One question" |
| Completed | Completed | Answer, then sources |
| Failed | Failed or timed out | What failed, nothing changed, what you can do |

Action card for important changes:

```
┌ Agent ─────────────────────────────────────┐
│ What I understood   Add "Buy milk" for Sam │
│ What I found        Sam has 2 open tasks   │
│ What will happen    New task, due tomorrow │
│ Visible to          This Space             │
│ [ Approve ]  [ Change ]  [ Cancel ]        │
└────────────────────────────────────────────┘
```

Low-risk reads need no card. Public content always shows the card, even with auto-approve. Provenance: every web answer lists its
sources with title, site and date, marking "read" versus "only searched".

### 9.I Community UI system

Community card, Member card, Community header, Membership state (Follow, Following, Member, Pending), Trust facts (D6), Post card,
Request card, Offer card, Event card, Conversation preview, Agent suggestion, Agent action (9.H), Agent result. All share one card
anatomy: kind label, title, one line of context, facts row, one primary action.

```
┌ REQUEST · Gardening Hyderabad ─────────────┐
│ Need help pruning a mango tree             │
│ Kondapur · by Saturday · 2 responses       │
│ ✓ Email verified · Member since 2026       │
│ [ Offer help ]                    Save ☆   │
└────────────────────────────────────────────┘
```

### 9.J Motion

| Token | Duration | Use |
| --- | --- | --- |
| motion.fast | 120 ms | Hover, press, small state changes |
| motion.medium | 200 ms | Expand, collapse, switch tabs |
| motion.slow | 320 ms | Sheets and dialogs entering |

Easing: standard cubic-bezier(0.2, 0, 0, 1); exit cubic-bezier(0.3, 0, 1, 1). With `prefers-reduced-motion`: opacity only, 120 ms
at most, no movement. No looping animation except progress indicators tied to real work.

### 9.K Accessibility

Targets (DECISION): WCAG 2.2 AA, aiming higher where practical (KNOWLEDGE: text 4.5:1, large text 3:1, non-text 3:1, target size
24 px minimum at AA). Measured critical pairs (FACT, `.local/plan/contrast.txt`):

| Pair (light) | Ratio | Pair (dark) | Ratio |
| --- | --- | --- | --- |
| Primary text on background | 15.41 | Primary text on background | 16.01 |
| Secondary text on background | 7.16 | Secondary text on surface | 9.27 |
| Tertiary text on background | 5.11 | Tertiary text on elevated | 5.60 |
| Link on surface | 6.34 | Brand text on surface | 7.05 |
| White on primary / hover / active | 6.34 / 8.29 / 10.54 | Label on primary button | 5.86 |
| Error text on error subtle | 5.72 | Error text on surface | 7.20 |
| Warning text on warning subtle | 5.74 | Warning text on surface | 9.41 |
| Success text on success subtle | 5.19 | Success text on surface | 8.64 |
| Agent text on agent subtle | 6.12 | Agent text on surface | 9.40 |
| Input border on surface | 4.01 | Input border on surface | 3.73 |
| Focus ring on background | 5.99 | Focus ring on background | 8.79 |

Interaction: touch targets 44 px (48 px for primary mobile actions), full keyboard use, visible focus, landmarks and headings,
labels outside hint text, live regions for agent progress, layouts that work at 320 px wide and 200% text.

Every other token pair in 9.O was also checked (FACT, `.local/plan/contrast-extra.txt`): all status, agent and community text on
their subtle backgrounds pass 4.5:1 in both modes. One failure was found and corrected: the dark pressed button was #2E8C83
(4.22:1 with its label) and is now #5CC2B7 (8.00:1).

### 9.L Responsive rules

Mobile: one column, bottom navigation, primary action reachable by the thumb, metadata trimmed to one line, secondary actions in a
menu. Tablet: two columns where useful (list and detail). Desktop: left rail, list and detail side by side, optional side panel for
the agent, wider reading width capped at 720 px for text.

### 9.M Screen-by-screen structure

| Screen | Purpose | Primary action | Key components | States |
| --- | --- | --- | --- | --- |
| Home | What needs me now | Act on the top item | Approval cards, today list, updates | Empty, loading skeleton, error with retry |
| Discover | Find communities and help | Follow or Offer help | Search, filter chips, community and request cards | No results with suggestions |
| Search results | Find anything | Open a result | Tabs, result cards | No results, partial results |
| Community page | Understand and join | Follow, then Create post | Header, tabs, post, request and event cards | Read-only, moderated, archived |
| Post or request detail | Read and respond | Comment or Offer help | Post, comments, report | Deleted, hidden, closed |
| Spaces list | Open a private community | Open Space | Space cards | No Spaces: Create or Join |
| Space | Coordinate | Add task or event | Tasks, events, documents, members, chat entry | Agent off, read-only |
| Messages | Talk | Send | Conversation list, chat, composer, agent replies with Share | Offline, unsent, private answer |
| Agent | Get help | Send request | Conversation, activity, action cards, sources | Working, waiting, failed |
| Events | Plan and attend | RSVP | Event cards, calendar | Full, cancelled, past |
| Notifications | Catch up | Open item | Grouped list | Nothing new |
| Settings | Control privacy and data | Save changes | Sections, toggles | Saved, error |
| Moderation | Review reports | Decide | Queue, evidence, decision form | Empty queue |

### 9.N Structural wireframes

Home (mobile):

```
┌──────────────────────────────┐
│ Community        [Ask] [🔔]  │
│ Needs you (2)                │
│ ┌ Agent: approve task? ────┐ │
│ │ [Approve] [Change]       │ │
│ └──────────────────────────┘ │
│ Today                        │
│ • 5 pm  School meeting       │
│ • Water the plants (Sam)     │
│ Updates from pages you follow│
│ ┌ Gardening Hyderabad ─────┐ │
│ └──────────────────────────┘ │
│ [Home][Spaces][Msgs][Disc][Me]│
└──────────────────────────────┘
```

Agent (desktop):

```
┌ Rail ┬─────────────── Conversation ───────────────┬─ Sources ──────┐
│ Home │ You: today's news about OpenAI and MAANG    │ 1 Reuters 6 Oct│
│ Spcs │ Agent: One question: MAFANG fund or MAANG?  │ 2 CNBC 6 Oct   │
│ Msgs │ You: MAANG companies                        │ 3 The Verge    │
│ Disc │ ● Searching the web for "OpenAI news today" │                │
│ Me   │ ● Reading Reuters, CNBC                      │                │
│      │ Agent: As of 6 Oct 2026: …                   │                │
│      ├──────────────────────────────────────────────┤                │
│      │ [ Message the Agent…                ] [Send] │                │
└──────┴──────────────────────────────────────────────┴────────────────┘
```

Community page (mobile):

```
┌──────────────────────────────┐
│ ← Gardening Hyderabad        │
│ Share tips and help nearby   │
│ 1.2k followers · Rules       │
│ [ Follow ]                   │
│ Posts | Requests | Events    │
│ ┌ REQUEST card ────────────┐ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 9.O Design tokens (implementation-ready)

To live in `packages/design-tokens/tokens.json` version 2 and generate CSS variables (and later Kotlin):

```json
{
  "version": 2,
  "color": {
    "light": {
      "action": { "primary": "#0D6B66", "primaryHover": "#0A5853", "primaryActive": "#084743", "primarySubtle": "#E2F1EF", "onPrimary": "#FFFFFF" },
      "text": { "primary": "#1B1F1E", "secondary": "#4E5452", "tertiary": "#646A67", "disabled": "#A3A8A5", "link": "#0D6B66" },
      "surface": { "background": "#F7F6F3", "default": "#FFFFFF", "elevated": "#FFFFFF", "subtle": "#F0EEEA", "inverse": "#1B1F1E" },
      "border": { "default": "#E3DFD8", "subtle": "#EDEAE4", "strong": "#857E74" },
      "status": {
        "success": "#1E7339", "successSubtle": "#E6F4EA", "successStrong": "#155C2D",
        "warning": "#8A5300", "warningSubtle": "#FFF3D6", "warningStrong": "#6B4000", "warningIcon": "#C27400",
        "error": "#B3261E", "errorSubtle": "#FDECEA", "errorStrong": "#8C1D17",
        "info": "#1F5FA6", "infoSubtle": "#E7F0FB", "infoStrong": "#174A82"
      },
      "focus": "#1F5FA6", "selection": "#CDE7E4", "overlay": "rgba(27, 31, 30, 0.48)",
      "agent": { "default": "#3B5A86", "subtle": "#EAF0F8" },
      "community": { "default": "#A3471F", "subtle": "#F8E9E2" },
      "verified": "#0D6B66"
    },
    "dark": {
      "action": { "primary": "#3FA79D", "primaryHover": "#4DB6AC", "primaryActive": "#5CC2B7", "primarySubtle": "#12302D", "onPrimary": "#06201D" },
      "text": { "primary": "#ECEFEE", "secondary": "#B8C0BD", "tertiary": "#959D9A", "disabled": "#5E6663", "link": "#4DB6AC" },
      "surface": { "background": "#111413", "default": "#181C1B", "elevated": "#202524", "subtle": "#1C2120", "inverse": "#ECEFEE" },
      "border": { "default": "#2E3533", "subtle": "#262C2A", "strong": "#6E7774" },
      "status": {
        "success": "#6CCB8A", "successSubtle": "#173222", "successStrong": "#8FD9A6",
        "warning": "#F2B54A", "warningSubtle": "#33270F", "warningStrong": "#F7C978",
        "error": "#F28B82", "errorSubtle": "#3A1A18", "errorStrong": "#F6AEA9",
        "info": "#8AB4F8", "infoSubtle": "#172A44", "infoStrong": "#ADC8FA"
      },
      "focus": "#8AB4F8", "selection": "#1E4A46", "overlay": "rgba(0, 0, 0, 0.6)",
      "agent": { "default": "#A9C1E8", "subtle": "#1A2433" },
      "community": { "default": "#E8A07F", "subtle": "#34221A" },
      "verified": "#4DB6AC"
    }
  },
  "font": { "family": "Source Sans 3", "fallback": ["Noto Sans Telugu", "Noto Sans Devanagari", "system-ui", "sans-serif"], "letterSpacing": 0 },
  "type": {
    "display": [40, 48, 700], "h1": [32, 40, 700], "h2": [24, 32, 650], "h3": [20, 28, 650], "h4": [17, 24, 650],
    "bodyLarge": [18, 28, 400], "body": [16, 24, 400], "bodySmall": [14, 20, 400], "caption": [13, 18, 400],
    "label": [14, 20, 600], "button": [16, 20, 600], "navigation": [13, 16, 600], "numeric": [16, 24, 500]
  },
  "space": { "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40, "12": 48, "16": 64, "20": 80, "24": 96 },
  "radius": { "xs": 4, "sm": 8, "md": 12, "lg": 16, "xl": 24, "pill": 999 },
  "border": { "width": 1, "focusWidth": 2, "focusOffset": 2 },
  "shadow": {
    "raised": "0 1px 2px rgba(16, 24, 20, 0.06)",
    "floating": "0 8px 24px rgba(16, 24, 20, 0.12)",
    "modal": "0 24px 48px rgba(16, 24, 20, 0.18)"
  },
  "motion": { "fast": 120, "medium": 200, "slow": 320, "easing": "cubic-bezier(0.2, 0, 0, 1)", "exit": "cubic-bezier(0.3, 0, 1, 1)" },
  "breakpoint": { "sm": 480, "md": 768, "lg": 1024, "xl": 1280 },
  "z": { "sticky": 100, "navigation": 200, "dropdown": 300, "overlay": 400, "modal": 500, "toast": 600, "tooltip": 700 },
  "icon": { "sm": 16, "md": 20, "lg": 24, "stroke": 1.75 },
  "target": { "web": 44, "webPrimaryMobile": 48, "android": 48 },
  "container": { "reading": 720, "wide": 1200 }
}
```

### 9.P Red-team findings on the visual system

| Finding | Correction |
| --- | --- |
| The focus ring (#1F5FA6) and the primary button (#0D6B66) have almost the same brightness (1.02:1) | Always draw the ring with a 2px offset so it sits on the background (5.99:1), never directly on the button |
| Teal brand and success green can be confused | Success always has a check icon and the word; the brand never appears in status messages |
| Disabled text is low contrast by design | Never use disabled styling alone; explain why an action is unavailable |
| Clay accent could make every card colorful | Clay only for community kind labels and the community header line |
| Agent color could dominate | Agent color only for the agent label and activity line; answers use normal text |
| Many cards stacked look busy | Lists use dividers, not cards, unless items are actionable |
| Heavy glass effects in the ongoing redesign (ASSUMPTION: a `glass` experiment exists in `.local/ios-redesign`) | Solid surfaces; at most a light blur behind the bottom bar on supported browsers |
| Telugu and Hindi text clipping | Line height × 1.15 and no fixed heights on text containers |

### 9.Q Recommendation

Peacock gives the product its own recognizable, calm identity that feels human and Indian-friendly without religious or political
color associations, keeps AA contrast everywhere it matters (measured above), and stays quiet so that people, communities and the
agent's evidence are the focus.

## 10. Engineering

### 10.1 Architecture (FACT, keep)

A modular monolith with separate workers. Agents call the same domain services as the website, so permissions and business rules
are never bypassed. New capabilities are new modules or new tools, not a rewrite.

### 10.2 Data model changes (DECISION, each with an Alembic migration and a downgrade)

| Migration | Change | Needs |
| --- | --- | --- |
| 0054 | BUILT 2026-10-06: `public_pages.help_open`, `help_posts` (request or offer, need-by date, area, status), `help_replies` (private) | D3 |
| 0055 | BUILT 2026-10-06: `help_reports` (to the page's owner and moderators; kept separate from platform reports) | D3 |
| 0056 | BUILT 2026-10-06: `page_events` (separate from Space events), `page_event_responses` (going only; exact place hidden unless the page shows it) | D4 |
| 0057 | `watches` (owner, link or topic, frequency, last content hash, last checked, state), `watch_changes` | Phase 5 |
| 0058 | `agent_feedback` (run, helpful yes or no, reason) | Phase 1 |
| none | Trust facts are computed when read | D6 |

### 10.3 Security

Already in place (FACT): server sessions, CSRF and Origin checks, CSP, rate buckets, audit and outbox tables, encrypted messages,
per-request permission checks, agent approvals with exact payloads. Add: rate limits on new request and offer posts; link and phone
number checks in requests (scam signals); hold first posts of new accounts in busy communities for review; model output and web text
always treated as untrusted (already a rule in the prompts).

BUILT 2026-10-06 for requests and offers: 5 open and 5 new per day; no links, phone numbers or email addresses in public text;
reports to the page's owner and moderators (Keep or Remove); new accounts (under 30 days) wait for approval on pages with 50 or
more followers; a "Needs your review" list on My pages for the people who run each page.

BUILT 2026-10-06 for requests and offers: 5 open and 5 new per day, link/phone/email refusal, reports to page managers, holds for
new accounts (under 30 days) on pages with 50 or more followers, and a "Needs your review" list on My pages.

### 10.4 Privacy

Requests show an area, never an exact address. People search only inside shared communities. Watches and shopping lists are private
to the person. Export and deletion cover every new table (existing export and deletion modules are extended).

### 10.5 Observability

Keep JSON logs and metrics; add the agent run trace (8.13); add counts for requests created, responded and helped.

### 10.6 Performance

Measure first (DECISION): a production build of the website, page load and API time at the 95th percentile on the main screens, and
the agent's time to first visible step. The redesign session is already measuring navigation and API timing. Then fix the slowest
screens with server rendering for first data, smaller client bundles and fewer sequential requests.

### 10.7 Failure engineering

| Service | Timeout | Retry | Fallback | Visible to the person |
| --- | --- | --- | --- | --- |
| Model call | 45 s | Transient errors only, with backoff | Stop the run, keep the request | "I couldn't finish. Nothing was changed." |
| Web search and read | 8–12 s | None (one call per tool step) | Answer with what was read and name the gap | "One page couldn't be read." |
| Store adapter | 15 s | One | Show the store search link | "Prices couldn't be loaded; open BigBasket." |
| Watch check | 15 s | Backoff 1 h, 6 h, 24 h | Pause the watch after 3 failures | "Paused: the page couldn't be read." |
| Live updates | 30 s | Reconnect with backoff | Polling | Nothing; data still refreshes |

Agent limits stay: steps, tool calls, research helpers, time and token budget per run.

### 10.8 Testing

| Kind | Scope |
| --- | --- |
| Unit | Domain rules, query rewrite, news extraction, adapters' parsers |
| Integration | Database, API, agent tools against the real services in test schemas |
| Contract | OpenAPI check (exists: `scripts/check-openapi.mjs`) |
| Agent | Golden set (8.12): intent, tools, permissions, refusals, failures |
| End-to-end | Main journeys in a browser (exists for many areas; update agent ones) |
| Security | Authorization sweeps (exist for Spaces), injection, rate limits, private-data boundaries |
| UX regression | 320 px, 200% text, keyboard, contrast checks for tokens (exist in part) |

### 10.9 CI

None today (FACT). Add a pipeline when the repository has a remote: types, unit tests, backend tests, OpenAPI check, token check.
Until then, `scripts/verify.ps1` is the gate before each delivery.

### 10.10 Definition of done

Coherent UX; happy path and error states work; permissions enforced and tested; accessibility checked (320 px, 200% text,
keyboard, contrast); security and privacy reviewed; tests pass and were run; observability added; performance measured; migration
with downgrade; the feature's measures defined; existing features still work.

## 11. Metrics

| Group | Measures |
| --- | --- |
| Person's value | Agent answers rated helpful; requests helped within 48 hours; time to first response; tasks completed on time |
| Community health | Response rate; unanswered requests; repeat helpers; reports per 100 posts; moderation time |
| Quality | Agent failure rate; golden-set pass rate; errors; page load at the 95th percentile |
| Cost | Tokens per answered request; web lookups per day |

Experiments follow: hypothesis, expected behavior, measure, test, result, decision. No experiment without a decision it will inform.

## 12. Roadmap (dependency order)

| Phase | Goal | Contents | Depends on | Done when |
| --- | --- | --- | --- | --- |
| 0. Stabilize | Safe base | Coordinate the two active sessions; fix out-of-date tests; measure performance; budget decision | D2 | All suites green; baseline numbers recorded |
| 1. Agent understanding and news | Answers people can use | Model tiers, query rewrite, one clarifying question, news pipeline, answer format, feedback button, golden set, run trace | D2, Phase 0 | Golden set at 80% or more; news answers dated with 2 or more sources or an explicit gap |
| 2. Design system v2 | One calm, consistent look | Tokens v2 (light and dark), UI kit states, shell, Home, Agent, Messages first, then the other screens | D1 | No hand-typed colors (token check); contrast and 320 px / 200% checks pass |
| 3. Agent UI | Clear, trustworthy agent | Real activity line, action cards, sources panel, video cards, Space-chat buttons | Phases 1 and 2 | Every state traced to a server fact; keyboard and screen-reader checks |
| 4. Community help | Real outcomes between people | Requests and offers, responses, "Helped", trust facts, public events | D3, D4, D6 | End-to-end journey passes; metrics recorded |
| 5. Watch and shopping | Useful automation | Watches with notices; BigBasket read-only adapter and cart list | D5, D7 | False-alert rate measured; no stored credentials; no automatic purchase |
| 6. Safety and admin | Healthy communities | Pre-publish checks, moderation assistant, agent activity and system health views | Phase 4 | Moderator agreement measured; audit complete |
| 7. Measure and learn | Decisions from data | Metrics, experiments, CI | Phases 1–6 | Dashboard and one experiment run |
| Later | | Android parity, WebMCP tools for our site, browser extension for carts | Owner decisions | |

### 12.1 Feature specifications (summary)

| Feature | Problem | User | Flow | Permissions | Data | Agent | Security and privacy | Measure | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| News pipeline | Incomplete, undated news | Main Agent users | Section 8.6 | Public web only | Run sources with dates | Main Agent, research helper | Web text untrusted; no private data in queries | Golden-set pass rate | Dated, sourced answers; gaps stated |
| Clarifying question | Wrong guesses | All | Ask once when meanings differ | None | Question on the run | Both agents | None new | Clarifications that changed the answer | No question when the meaning is clear |
| Requests and offers | No help loop | Members, helpers | Section 7.5 | Post by followers or members per page rules; respond by any signed-in person | 0054 | Suggests communities | Area not address; scam checks; rate limits | Helped within 48 h | Create, respond, mark helped, report, all tested |
| Public events | Events only private | Page owners, members | Create, RSVP, update, cancel | Page roles | 0055 | Can draft events with approval | Exact address only to attendees if the owner chooses | RSVPs, attendance | Full lifecycle tested |
| Watch | Missing changes that matter | Anyone | Section 8.9 | Own watches only | 0056 | Can create a watch with approval | Public links only; no logged-in pages | False alerts | Alerts only on meaningful changes in tests |
| Shopping, read-only | Comparing 10-minute stores is slow | Families | Ask, compare, cart list, buy in store | Own lists | Cart list on the run | Main Agent | No credentials, no purchase, store terms reviewed | Lists created, links opened | Prices with source and time; no automatic action |
| Agent action card | Unclear consequences | All | Section 9.H | Existing approvals | Existing | Both | Exact payload shown | Approval rate and reversals | Matches the approved payload exactly |
| Design tokens v2 | Inconsistent, generic look | All | Section 9 | None | tokens.json v2 | None | None | Contrast checks | Generated CSS used everywhere |

## 13. Red team of this plan

| Risk | Mitigation |
| --- | --- |
| Personas are guesses | Interview 5 to 8 people (family organizer, older member, page owner, helper) before phase 4 |
| A mid model raises cost | Tiered models, per-run and daily budgets, measured tokens per answered request |
| Requests and offers attract spam and scams | Rate limits, link and phone checks, new-account holds, reports, moderator queue |
| The ongoing redesign diverges from these tokens | D1 first; the redesign consumes tokens v2; token check fails on hand-typed colors |
| Two sessions editing the same files | Section 2 rules; file-time checks; one owner per file |
| Store adapters break when sites change | Adapter tests with saved pages; clear failure message with the store link |
| Watch alerts become noise | Meaningful-change filter, daily default, easy pause, false-alert measure |
| Agent shows activity that didn't happen | States only from server events (9.H), tested |
| Older users struggle | 44–48 px targets, 200% text, plain words, one primary action per screen |
| Network policy blocks research and testing in VS Code | D7, or test in Chrome or Edge |

## 14. Final recommendation

Fix the agent's understanding and news first (phase 1, needs D2), because that is what the owner and users feel every day. In
parallel, settle the visual direction (D1) so the redesign already in progress builds on one calm, accessible token set. Then make
the agent's work visible and trustworthy (phase 3), and only then add the community help loop, public events, watches and
read-only shopping. Each step is the smallest system that reliably helps a real person finish something meaningful with less effort
and more confidence, while keeping communities safe.
