# Community Agent: Design System and Prototype Handoff (DESIGN.md)

Status: PROPOSED, 2026-10-07. Source: the owner's "Product Design Master Brief" (65 sections, pasted in chat on 2026-10-07),
reconciled with what this repository already decides and builds. Nothing here approves a feature, a provider, spending or a
change to an accepted decision; those are listed in [section 13](#13-decisions-the-owner-needs-to-make).

How this file relates to the others:

| Question | Authority |
| --- | --- |
| Which colour, size, radius or target value is used today | [tokens.json](../packages/design-tokens/tokens.json) (DEC-013), generated into CSS and Kotlin |
| Which values are proposed next (Peacock palette, type scale, motion) | [COMMUNITY_AGENT_PLAN section 9](COMMUNITY_AGENT_PLAN.md#9-visual-design-system), pending owner decision D1 |
| What each component means, when to use it, its states and behaviour | This file |
| What the Agent may do in the real world | Accepted decisions, [research section 18.2](PRODUCT_RESEARCH_2026-10-07.md#182-traceability-for-all-47-requested-roadmap-items) and [privacy readiness](PRIVACY_READINESS.md); this file only designs the states |

Labels: **EXISTS** (built and tested in this repository), **PARTIAL**, **MISSING**, **BLOCKED** (needs an owner decision or an
external dependency before it can be real).

---

## 1. Reconciliation of the brief with current decisions

Most of the brief agrees with what exists: two agent layers (DEC-060), private-by-default Space answers (DEC-061), approval
before changes, public content always reviewed, per-request auto-approve for eligible tools, deletable memories, four Space
types, 44 px targets, 320 px and 200% text checks. The rows below are where the brief and the repository differ.

| # | Brief | Repository today | Proposed resolution | Owner? |
| --- | --- | --- | --- | --- |
| R1 | 8 primary destinations: Home, Spaces, Community, Messages, Events, Tasks, Agent, Profile (§3, §59) | 5 sections, same on web and Android (DEC-014): Home, Spaces, Messages, Discover, Profile; Agent, search and notifications in the header | Mobile keeps 5 (the brief itself asks for "a compact number" on mobile), with Discover renamed **Community**. The desktop rail adds a second group: Events, Tasks, Agent Activity. | Yes (D8, amends DEC-014) |
| R2 | Distinctive identity, "avoid generic", Agent / Community / Private Space colour roles (§42, §43) | iOS-style blue `#0068d6` | Adopt Peacock (plan 9.C): teal = your Spaces and primary actions, clay = public Community, slate blue = Agent. Adds the missing **Private Space** role by giving it the brand teal. | Yes (D1, already open) |
| R3 | Agent places orders, books, pays, sends email (§15–§20, §28, §32, §34) | No transaction, booking, mailbox or payment connector; quick-commerce proposal is read-only (D5); local work allows no external providers or spending (AGENTS.md rule 7) | Design every state now. The prototype uses clearly labelled **Demo provider** data. A real "Completed" or receipt appears only after a verified provider confirmation with a reference. | Yes, per provider (D9) |
| R4 | Agent Permissions screen with categories incl. Shopping, Bookings, Financial actions, Public publishing (§18) | One per-request auto-approve switch; public content and split plans always ask | Per-category setting with three levels: *Always ask*, *Auto for low risk*, *Not allowed*. Financial actions and Public publishing are fixed at *Always ask* and show why. | Yes (D10) |
| R5 | Task states To do / In progress / **Waiting** / Done (§25) | `open`, `in_progress`, `completed`, `cancelled` | Show *To do / In progress / Done / Cancelled* now. "Waiting" needs a stored reason (waiting on whom or what), not just a label. | Yes (D11) |
| R6 | Custom Space type (§5) | family, couple, group, solo | No new type: a custom Space is a Group Space with its own name and icon. | No (routine) |
| R7 | Space sections Overview, Messages, Tasks, Events, Plans, Files, Agent, Members, Settings (§59) | Spaces screen with tasks, events, documents, members, settings and chat; no "Plans" | "Plans" is the home for trip, shopping and poll workspaces once each exists; hide the tab while empty of capabilities. | No |
| R8 | Demo journey ends "Dinner booked" (§53) | No booking connector | Prototype copy says "Demo booking confirmed". In the product without a connector the Agent prepares the details and the person books; the Space message says "Reservation details ready", never "booked". | Covered by D9 |
| R9 | Stitch prototype output (§63) | Real Next.js website with tests | The 24 screens map to routes (section 11). A design-tool prototype is not produced from this repository; this file is the handoff a design tool or coding agent consumes. | No |

---

## 2. Principles

1. **Tell Community Agent what you need.** One composer with `@agent` is the entry to every capability; the person never
   picks a specialist agent. Complexity lives underneath.
2. **Human first, agent second.** People, plans and conversations lead; the Agent is a participant with a quiet visual cue,
   not the centre of the screen.
3. **Where am I, who can see this, what can I do.** Every screen answers these three questions above the fold.
4. **Action with control.** The Agent shows what it understood, what it found and exactly what will happen before any
   change. Nothing is shown as sent, paid, booked or transferred unless a confirmed result says so.
5. **Privacy by default, visible but calm.** Private, shared and public are always labelled with an icon and words.
6. **Useful over engaging.** No infinite feed as the main experience; discovery is organised around jobs (events, help,
   people who can help).
7. **States are facts.** Progress, status and receipts come from server records, never from timers or guesses.

Do not build: a chatbot landing page, a widget dashboard, a social-media clone, neon or purple "AI" styling, heavy
gradients or glass, cards for every list row, more than one primary button per region.

---

## 3. Information architecture

```text
Community Agent
├── Home                 what needs me now
├── Spaces               private: Family, Couple, Solo, Group
│   └── <Space>          Overview · Messages · Tasks · Events · Plans · Files · Agent · Members · Settings
├── Community            public: Discover · Pages · People · Events · Help · Offers · Topics
├── Messages             every conversation, incl. private agent answers
├── Events*              all events I can see, across Spaces and public pages
├── Tasks*               all tasks assigned to me or created by me
├── Agent Activity*      Running · Needs approval · Scheduled · Completed · Failed · History
└── Profile              identity, public activity, settings, privacy, agent settings
```

`*` desktop rail only (R1); on mobile they are reached from Home cards and the Space tabs.

Main Agent lives in the header ("Ask") and on Community. A Space Agent lives inside its Space (header button, composer
`@agent`, Agent tab). The two never share one conversation.

---

## 4. Tokens

Values: **today** from `tokens.json` v1, **proposed** from plan 9.O (D1). Screens use token variables only; `npm run
check:tokens` enforces this for stylesheets on the token list.

### 4.1 Colour roles

| Role | Meaning | Today (web variable) | Proposed light / dark |
| --- | --- | --- | --- |
| Primary | The one main action in a region; selected state | `--color-primary` `#0068d6` | `#0D6B66` / `#3FA79D` |
| Secondary | Accent used sparingly | `--color-accent` `#b84900` | Community clay (below) |
| Background | Page canvas | `--color-background` `#f2f2f7` | `#F7F6F3` / `#111413` |
| Surface | Cards, sheets, composer | `--color-surface` `#ffffff` | `#FFFFFF` / `#181C1B` |
| Elevated surface | Menus, popovers, bottom sheets | surface + shadow | `#FFFFFF` + floating shadow / `#202524` |
| Text | Main text | `--color-ink` `#1c1c1e` | `#1B1F1E` / `#ECEFEE` |
| Muted text | Supporting text, metadata | `--color-muted` `#636366` | `#4E5452` / `#B8C0BD` |
| Border | Dividers | `--color-border` `#e5e5ea` | `#E3DFD8` / `#2E3533` |
| Control border | Inputs (3:1 minimum) | `--color-control-border` `#86868b` | `#857E74` / `#6E7774` |
| Success | Confirmed result | `--color-success` `#1f7a39` | `#1E7339` / `#6CCB8A` |
| Warning | Needs attention, not broken | `--color-warning-surface` | `#8A5300` on `#FFF3D6` |
| Error | Failed or blocked | `--color-danger` `#d60012` | `#B3261E` / `#F28B82` |
| Info | Neutral notice | (none) | `#1F5FA6` / `#8AB4F8` |
| Agent | Agent label, activity line, approval card edge | (none; primary used) | `#3B5A86` on `#EAF0F8` |
| Community | Public kind labels, Community header line | (none) | `#A3471F` on `#F8E9E2` |
| Private Space | Space header line, Space switcher selection | (none) | brand teal `#0D6B66` on `#E2F1EF` |

Rules: about 75% neutral, 15% supporting, at most 10% brand and status. Colour never carries meaning alone: every status
and scope also has an icon and a word. Agent and Community colours never fill large areas.

### 4.2 Typography

One family: Source Sans 3 (bundled, SIL OFL) with Noto Sans Telugu / Devanagari fallbacks; letter spacing 0 (Telugu and
Hindi). Weights 400, 600, 700 only (plan 9.D's 650 rounds to 600 for fewer weights). Scale from plan 9.D: H1 32/40, H2
24/32, H3 20/28, Body large 18/28 (agent answers), Body 16/24, Body small 14/20, Caption 13/18, Label 14/20, Button 16/20.
Sizes in `rem` so 200% text works (known gap: most web text is still px, see the tokens README). Prices, counts and times
use tabular figures. Telugu and Hindi line height ×1.15; no fixed-height text containers.

### 4.3 Spacing, radius, elevation, motion, breakpoints

| Group | Values |
| --- | --- |
| Spacing | Multiples of `--space-unit` (4 px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Card padding 16 mobile / 20 desktop; section gap 32 / 48; page margin 16 / 24 / 32 |
| Radius | Today: control 12, dialog 16, pill 96. Proposed: 4 badge, 8 chip/input, 12 card/button, 16 dialog/sheet, 24 bottom-sheet top, pill |
| Elevation | Flat (border only, default), Raised (list hover), Floating (menus, sheets), Modal (dialog + overlay). Prefer borders to shadows |
| Motion | 120 ms small state, 200 ms expand/tab, 320 ms sheet/dialog; standard ease `cubic-bezier(0.2,0,0,1)`, exit `cubic-bezier(0.3,0,1,1)`. **Built:** `tokens.json` `motion` → `--motion-fast/medium/slow`, `--ease-standard`, `--ease-exit` (web only; checked by `npm run check:tokens`). Reduced motion: opacity only, ≤120 ms |
| Breakpoints | < 768 mobile (bottom bar), 768–1023 tablet, ≥ 1024 desktop (left rail); reading width 720, wide 1200 |
| Targets | 44 px web minimum, 48 px primary mobile actions, 48 dp Android |

### 4.4 Icons

Lucide, 16 / 20 / 24 px, decorative icons `aria-hidden`. Fixed meanings (never reuse for anything else):

| Meaning | Icon | Used today |
| --- | --- | --- |
| Agent | `Bot` | agent screen, messages |
| Private (only you / this Space) | `LockKeyhole` | messages, Spaces |
| Public / Community | `Globe` | Spaces, discover |
| Members | `UsersRound` | Spaces |
| Needs approval | `ShieldCheck` (proposed; today a text label) | — |
| Completed | `CheckCircle2` | agent screen |
| Working | `LoaderCircle` (animated only while the server reports work) | agent screen |
| Failed | `CircleAlert` (proposed) | — |
| Scheduled | `CalendarClock` | Spaces |
| Auto-approve | `Zap` / `ZapOff` | agent composer |

---

## 5. Status and trust vocabulary

One vocabulary for the whole product. Each state has an icon, a word and a colour role, and comes from a server field.

### 5.1 Agent states

| Brief state | Shown text | Server source | Icon / role | Live region |
| --- | --- | --- | --- | --- |
| Thinking | "Understanding your request" | run `queued` / first `running` step | LoaderCircle / Agent | polite |
| Researching | "Searching …", "Reading <source>", "Comparing 3 options" | running tool call (read) | LoaderCircle / Agent | polite, once per step |
| Preparing | "Preparing <action>" | running, write tool being proposed | LoaderCircle / Agent | polite |
| Needs approval | "Check this before I do it" | run `waiting_for_approval`, approval `pending` | ShieldCheck / Warning | assertive once |
| Waiting for information | "One question" | run `waiting_for_user` | MessageCircle / Agent | assertive once |
| Executing | "Doing it now" | approval `approved`, run `running` or `verifying` | LoaderCircle / Agent | polite |
| Completed | Result, then sources | run `completed` | CheckCircle2 / Success | polite |
| Failed | What failed, that nothing changed (or what did), what to do next | `failed`, `timed_out`, `expired` | CircleAlert / Error | assertive |
| Cancelled | "Stopped. Nothing was changed." | `cancelled` | X / muted | polite |
| Scheduled | "Scheduled for <time>" | a stored future job (reminder; future approved mandate). **No scheduled agent runs exist today** | CalendarClock / Info | none |

Never show a working state when no run is active; never animate indefinitely without a server step.

### 5.2 Trust badges

`Verified` (email verified only), `Private`, `Shared with <Space>`, `Public`, `Agent action`, `Needs approval`,
`Completed`, `Failed`, `Scheduled`, `Draft`, `Demo`. Badge = icon + word; colour is secondary. `Draft` and `Demo` are
mandatory wherever a result could be mistaken for a real send, booking or payment.

---

## 6. Components

Every component below is reusable; one-off layouts need a reason. "Today" names the existing implementation.

### 6.1 Foundations

| Component | Means / use when | Do not use when | States | Today |
| --- | --- | --- | --- | --- |
| Button | Primary (one per region), Secondary, Quiet (text), Destructive | Navigation between pages (use a link) | default, hover, focus, pressed, disabled + reason, loading with verb ("Saving…") | `components/ui/button` |
| Input / Textarea | Labelled field; label outside, hint below, error under the field | Placeholder as the only label | default, focus, filled, error, disabled, counting (limits) | `components/ui/textarea`, form inputs |
| Search | Finds within the current scope; scope named in the placeholder ("Search Family") | Global search inside a Space without saying so | empty, typing, results, no results with next step | search page |
| Avatar / Avatar group | A person; group shows up to 3 + "+N" with full names for screen readers | Decoration | image, initials, unknown | partial |
| Tabs | Sibling views of one object (Space sections) | Steps of a flow | selected (bar + weight, not colour only), focus | partial |
| Settings row | One setting: label, current value, control or chevron | Multi-field forms | default, changed, saving, saved, error | settings pages |
| Toast | Confirms a completed, low-stakes result; offers Undo where possible | Errors that need action (use inline error), approvals | info, success; auto-dismiss ≥ 6 s, pausable | partial |
| Dialog | Confirms a destructive or irreversible step | Long forms on mobile (use a bottom sheet) | open, busy (locked), error inside | `ConfirmDialog`, `components/ui/dialog` |
| Bottom sheet (mobile) / Drawer (desktop) | Secondary task without leaving context: event details, approval review, filters | Primary navigation | closed, peek, open, busy | MISSING |
| Empty state | Explains what will appear and offers one or two next steps, incl. "Ask Agent" | Errors | — | many screens |
| Loading / Skeleton | Skeleton for known layout; agent progress for agent work | Indefinite spinner | — | `components/ui/skeleton` |
| Error state | Names what failed, what did not change, and the next action (Retry, alternative) | "Something went wrong" | retrying, retry failed | many screens |

Copy patterns: empty — "Nothing planned yet. Create your first family event or ask Agent to help." [Create event] [Ask
Agent]; error — "Booking couldn't be completed because the provider did not confirm availability." [Try again] [Find
another option].

### 6.2 Navigation and place

| Component | Means / use when | States | Today |
| --- | --- | --- | --- |
| Main navigation | Bottom bar (mobile, 5 items) / left rail (desktop, 5 + secondary group) | current (`aria-current`), focus, badge count | EXISTS, `navigation.tsx` (5 items) |
| Space switcher | Lists my Spaces: icon, name, type, member summary ("Mom, Dad, Gopi + 2"), privacy badge, last activity | current, unread, invited, none yet | PARTIAL: icon, name, type, role, privacy (also on mobile), member count with up to three other names ("5 members: Sam, Priya, Taylor + 1 more") and Agent on/off (2026-10-07), plus "Last message <time>" from the Space chat (hidden when it predates the viewer joining) |
| Space header | Answers where / who / what: icon, name, type, "Private Space", member count, [Ask Agent], More | normal, read-only role, agent off for this Space | PARTIAL: [space-header.tsx](../web/src/features/spaces/space-header.tsx) on Tasks, Events, Documents and the Messages pane before a chat opens (icon, name, type, privacy, members with names, Agent on/off, Ask Agent → Space chat, section links Chat · Tasks · Events · Documents); an open Space chat keeps its compact header plus a More menu (other sections and Agent tasks); on phones the header shows in the chat list |
| Community header | Public page: name, purpose, followers, rules link, trust facts, one primary action (Follow → Create post) | following, member, pending, moderated, archived | EXISTS for pages |
| Scope bar | One line above any composer: "Visible to: Family (5)" / "Only you" / "Everyone" | — | PARTIAL (messages privacy notice) |

Private Space vs Community is distinguished by four cues together: header line colour (teal vs clay), icon (Lock vs
Globe), the words "Private Space" / "Public", and the agent name ("Family Agent" vs "Main Agent").

### 6.3 Conversation

| Component | Means / use when | States | Today |
| --- | --- | --- | --- |
| Message bubble | Human text; replies quote a one-line excerpt; reactions under the bubble; mentions highlighted | sending, sent, failed + Retry, edited, deleted | EXISTS (attachments MISSING) |
| Composer | Text with `@agent` and `@member` suggestions, scope bar, send; mobile keeps it thumb-reachable | empty, typing, mention list, sending, offline | EXISTS |
| Agent message | Agent reply: `Bot` icon + "Family Agent" label + Agent-colour edge; body is normal text, not a giant card | streaming steps, final, private-to-you (with Share) | EXISTS (private answers DEC-061) |
| Agent progress | Compact step list ("Finding restaurants… Checking availability… Found 3 options") tied to server steps, collapsible after completion | per 5.1 | EXISTS on agent screen |
| Inline object card | A task, event, poll, booking or expense posted into chat: kind label + title + one facts line + one action; opens the full card in a sheet | per object | PARTIAL (task/event references) |

### 6.4 Action cards

All share one anatomy: **kind label · title · context line · facts row · one primary action (+ secondary)**. Lists of
non-actionable items use dividers, not cards.

| Component | Means / use when | Required facts | States | Today |
| --- | --- | --- | --- | --- |
| Approval card | The Agent wants to change something | What I understood · What I found · What will happen · Visible to · amount/time when relevant · [Approve] [Change] [Cancel] | pending, approving, approved, rejected, expired, superseded, failed after approval | EXISTS (exact payload, `If-Match`, idempotency) |
| Receipt | Record of a completed action | Action, Space, provider, total, approved by, status, reference, time; [View] | completed (verified reference), local-only ("Saved in this Space"), demo | PARTIAL (local action records; no external receipts) |
| Task card | A to-do with owner | title, assignee, due, status word + icon, agent suggestion line (optional) | To do, In progress, Done, Cancelled (Waiting: D11) | EXISTS |
| Event card | A planned occasion | title, date, time, place, organiser, counts (5 going, 1 maybe), [Going] [Maybe] [Can't go] [Ask Agent] | upcoming, full + waitlist, changed, cancelled, past | EXISTS (Space events; public RSVP UI PARTIAL) |
| Poll | A group choice | question, options with counts, who can vote, closes at; agent-generated polls say so | open, voted (changeable until close), closed with winner, tie | IMPLEMENTED LOCALLY: event polls (0061), Space polls at `/app/polls` (0060), and explicitly reviewed Space Agent creation/read tools (0062); Agent tools never vote or close polls. The retained runtime is upgraded to 0062; model configuration remains blocked. See [capability evidence](COMMUNITY_AGENT_PLAN.md#reviewed-space-agent-poll-capability-2026-10-08) and [activation](../infra/README.md#agent-poll-runtime-activation-2026-10-08) |
| Expense card | Shared cost | total, your share, split method, rounding shown, "Not settled" | draft plan, approved plan, partially settled, settled | EXISTS as the event budget panel (planned vs recorded, expenses, contributions, split shares, "not a payment" notice) and Space Agent split plans; settlements and transfers MISSING |
| Shopping card | A list and options | items, store, price, delivery time, total, price time; [Prepare cart] [Compare] [Order] | list, compared, cart prepared, needs approval, ordered (verified) | MISSING (D5 read-only proposal; ordering BLOCKED, D9) |
| Booking card | Any reservation: restaurant, doctor, salon, gym, repair, movie, event, travel | provider, date, time, location, price, availability, status, action | available, held, needs approval, confirmed (reference), unavailable, changed, cancelled | MISSING; confirmation BLOCKED (D9) |
| Travel card / workspace | A trip | name, dates, travellers; sections Overview, Transport, Stay, Activities, Food, Budget, Bookings, Documents, Agent | planning, booked parts, disruption, past | MISSING |
| Disruption alert | A change that affects plans | what changed, what it affects, alternatives; [Review alternatives] | new, reviewed, resolved | MISSING (needs monitoring, research 18.2 rows 34–39) |
| Research comparison | A decision | Summary, Recommendation + reason, comparison table, pros, cons, risks, sources with dates (read vs only searched) | partial sources, conflicting sources | PARTIAL (sources exist; no comparison layout) |
| Email draft | Proposed email | To, Subject, body, attachments; [Edit] [Send]; badge "Draft — not sent" | draft, sending, sent (provider confirmation), failed | MISSING; mailbox BLOCKED (D9) |
| Inbox summary | Mail triage | counts by category and suggested bulk actions; [Review] | — | MISSING; BLOCKED (D9) |

Money rule: amounts show currency, rounding and source time. "Paid", "Transferred", "Ordered", "Booked" and "Sent" appear
only with a verified reference; otherwise use "Plan", "Prepared", "Draft" or "Demo".

### 6.5 Trust and permission

| Component | Means / use when | Today |
| --- | --- | --- |
| Privacy card | Explains a scope split in one sentence and two lists: "Shared with Family: events, tasks" / "Only you: medical records" | PARTIAL: "Who can see what" in the Space header (members see chat, tasks, events and documents from when they joined; Agent answers and memories and medicines are only yours; direct chats only their two people), each line matching a server rule |
| Permission card | One capability: what it allows, an example, the level (Always ask / Auto for low risk / Not allowed), why locked if locked | MISSING (D10) |
| Role row | Member, role (Owner, Admin, Member, Limited member), granular permissions on expand | PARTIAL (owner/admin/member; invite policy) |
| Memory row | One thing the agent remembers: content, where it came from, [Edit] [Forget], master switch "Use memories" | EXISTS (edit, disable and delete per memory; one master switch MISSING) |
| Connected account row | Service, what it can read/do, last used, [Disconnect] | MISSING (no integrations) |

Private personal information never becomes visible to Space members by joining a Space; any new shared resource needs
field/resource-level access tests (research 18.2 row 6).

---

## 7. Interaction rules

1. `@agent` in a Space reaches that Space's Agent; in Community or the header "Ask" it reaches the Main Agent. The Main Agent
   never reads private Space data; offering to continue in a Space is a link, not a data transfer.
2. Reads need no approval. Every change shows an approval card unless the person's category level allows auto-approve for that
   low-risk tool. Public publishing, comments, new public pages, money and split plans always ask.
3. Approvals are exact: the approved payload is what runs; a changed snapshot asks again. Retry reuses the same idempotency key.
4. Results flow back into the Space as one short message ("Dinner details ready for Saturday 7:30 PM") with the card attached.
5. Drafts stay drafts until a confirmed send; demo results stay labelled.
6. Destructive actions confirm in a dialog naming the object and its audience; reversible actions prefer Undo.
7. Every interactive state has a defined behaviour: loading, empty, error, permission denied, offline, success.

---

## 8. Responsive rules

Mobile is re-ordered, not shrunk: primary action first and thumb-reachable; bottom bar; sheets instead of side panels; one
line of metadata; secondary actions in a menu; composer fixed above the bar. Desktop: left rail, list and detail side by
side, optional Agent side panel inside a Space, reading width 720 px. Check every changed screen at 320 px and 200% text
(DEC-013).

## 9. Accessibility rules

WCAG 2.2 AA minimum. Text 4.5:1, large text and non-text 3:1 (checked by `npm run check:tokens`). Visible 2 px focus ring
with 2 px offset; full keyboard use; landmarks and headings; labels outside fields; agent progress in a polite live region,
approvals and failures announced once; no meaning by colour alone; plain language for older adults and low digital literacy;
English, Telugu and Hindi.

## 10. Motion rules

Motion explains change of place or state: sheets slide, new messages fade in, completed steps collapse. No looping animation
except progress tied to real work. Reduced motion: opacity only.

### 10.1 Agent progress (built 2026-10-07)

[agent-progress.tsx](../web/src/features/agents/agent-progress.tsx) renders a working run from its recorded events only:

| Part | Behaviour | Motion |
| --- | --- | --- |
| Current step | Latest event summary with its step icon (search, read, compare, approval, question, review); the only part in a `role="status"` region, so each new step is announced once | New text rises 4 px and fades in (`--motion-medium`) |
| Trail | Up to 3 previous steps, muted, hidden from screen readers (already announced) | Each new row rises in |
| Signal | Small dot with a soft pulse | Loops only while the server reports `queued`/`running`/`verifying`; removed with the progress block |
| Elapsed | m:ss since the latest start, approval or answer; hidden after an hour | Tabular figures, no animation |
| Stop | Always available while working | — |
| Approval / question card | Appears when the run reaches that state | Rises in (`--motion-slow`) |

Live: run step hints arrive over `/api/live` for Space **and** Main Agent runs (hints carry identifiers only, never content),
so each step appears as it is committed. Polling falls back to every 1.5 s while the live stream is down and slows to 5 s while
it is connected. Reduced motion replaces every rise with a ≤120 ms fade and stops the pulse.

---

## 11. Screen inventory (brief §63)

| # | Screen | Route today | Status | Main gap |
| --- | --- | --- | --- | --- |
| 1 | Home | `/app` | PARTIAL | Greets the person by name (their timezone) and says how many things need them; Needs attention leads with Agent requests waiting for approval or an answer (Main Agent and each Space with its agent on), then invitations, join and reminder requests; Your Spaces show members and Agent on/off. Narrow rows move the action below the text instead of splitting words |
| 2 | Space selector | `/app/spaces` | PARTIAL | Member summary, privacy badge, last activity |
| 3–6 | Family / Couple / Solo / Group Space | `/app/spaces` | PARTIAL | Space header, per-type overview emphasis, Plans tab |
| 7 | Community | `/app/discover`, `/app/pages` | PARTIAL | Rename, job-based sections (Events, Help, People) |
| 8 | Messages | `/app/messages` | EXISTS | Attachments, inline object cards |
| 9 | @Agent conversation | `/app/messages`, `/app/agent` | EXISTS | — |
| 10 | Agent working | `/app/agent` | EXISTS | Brief's step wording |
| 11 | Agent approval | `/app/agent` | EXISTS | Bottom-sheet review on mobile |
| 12 | Agent Activity | `/app/agent` (history) | PARTIAL | Dedicated all-Space inbox with status filters (research 18.2 row 40) |
| 13 | Shopping result | — | MISSING | D5, D9 |
| 14 | Travel planner | — | MISSING | Trip object |
| 15 | Event | `/app/events` | EXISTS | Public RSVP UI |
| 16 | Task | `/app/tasks` | EXISTS | Waiting state (D11) |
| 17 | Shared expense | `/app/events` budget panel, Space Agent split plan | EXISTS | Settlements |
| 18 | Research comparison | `/app/agent` answers | PARTIAL | Comparison layout |
| 19 | Booking | — | MISSING | D9 |
| 20 | Privacy | `/app/settings/privacy` | EXISTS | Shared vs private explainer per Space |
| 21 | Agent permissions | composer switch | PARTIAL | Category screen (D10) |
| 22 | Agent memory | `/app/agent` | EXISTS | Master "Use memories" switch |
| 23 | Profile | `/app/settings/account` | PARTIAL | Public profile view |
| 24 | Settings | `/app/settings/*` | PARTIAL | Notifications, Accessibility, Language, Connected accounts sections |

Every screen also needs: normal, loading, empty, error, permission denied, offline; agent screens add working, waiting,
needs approval, completed, failed, scheduled; booking screens add confirmed and unavailable; search adds results and no results.

## 12. Demo journeys (brief §53–§56)

| Journey | Real today | Must be Demo-labelled | Acceptance checks |
| --- | --- | --- | --- |
| Family dinner → trip | Space chat `@agent`, preferences from memories, approval card, Space message, task/event creation | Restaurant search results and availability, booking confirmation | Approval payload equals executed action; Space message says "Demo"/"details ready", never "booked" without a reference; trip opens as a workspace, not a paragraph |
| Solo "Plan my week" | Tasks, events, reminders in the Solo Space | — (no external calendar) | Plan uses only this Space's items; edits create tasks/events only after approval |
| Group restaurant for eight | Space chat, approvals | Restaurant options, reservation | Poll created after approval; one vote per member, changeable until close; winner computed from votes; booking approval names the party size |
| Community public events | Main Agent public search, public pages and page events | — | No private Space data in the Main Agent's context; joining an event uses the page-event RSVP |

## 13. Decisions the owner needs to make

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 (open) | Visual direction | Peacock, adding the Private Space role (R2) |
| D8 | Navigation | Mobile 5 with Discover → Community; desktop rail adds Events, Tasks, Agent Activity (R1, amends DEC-014) |
| D9 | Real-world transactions | Keep Demo-labelled prototypes; choose one provider at a time with lawful API, scopes, review, idempotency and verified receipts before any real order, booking, send or payment (R3) |
| D10 | Agent Permissions levels | Three levels per category; money and public publishing fixed at Always ask (R4) |
| D11 | Task "Waiting" | Add only with a stored reason and who/what is awaited (R5) |

Until these are recorded in the decision log, implementation continues only on items that need none of them: Space header,
Space switcher details, Home "needs you" ordering, Agent Activity inbox, polls, expense card, research comparison layout and
the empty/error/loading copy patterns above.
