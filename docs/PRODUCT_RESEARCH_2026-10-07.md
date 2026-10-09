# Product Research: Who This Is For, Why They Would Trust It, and How We Build Better

Date: 2026-10-07. Research and organizational recommendations are PROPOSED, not approved requirements.
Section 18 separately traces the owner's current implementation request and its verified local delivery; it does not approve deployment, spending or external processing.

Labels used, as in the [Community Agent Plan](COMMUNITY_AGENT_PLAN.md#0-how-to-read-this-plan):

| Label | Meaning |
| --- | --- |
| FACT | Checked in this repository on 2026-10-07. |
| RESEARCH | A public source retrieved on 2026-10-07; the population, date and limits are recorded in section 13. |
| KNOWLEDGE | General product, market, legal or research knowledge. Not re-checked online in this session. Verify before relying on it. |
| SYNTHETIC | Written by the AI as a stand-in for a real person. It is a hypothesis, never evidence. |
| PROPOSAL | A suggestion for the owner to accept, change or reject. |

## 0. Honest limits of this research

- The initial draft used repository inspection and general knowledge. The follow-up in section 13 retrieved public research, a competitor's store listing and a bounded sample of public forum comments using read-only HTTP requests. This was not authenticated social-media browsing, a customer interview or a test of the product by real users. No accounts were created, messages posted or people contacted.
- The "customers" in section 6 are SYNTHETIC. They are useful to find questions and risks quickly. They cannot tell us what real people will do. Only real conversations and real usage can.
- Legal points are KNOWLEDGE, not legal advice. A qualified lawyer must review the privacy policy and terms before any launch.
- We must not create fake accounts, fake reviews or fake comments on real social media to test or promote the product. That is deceptive, breaks every platform's rules, and in India and elsewhere can break consumer-protection law. Section 8 shows honest ways to reach real people.

## 1. The product in one sentence

FACT (code and screens): one app where a person keeps their **private circles** (family, couple, friends group, solo) and their **public communities** (pages they follow, posts, help requests, public events) in one place, with chat, tasks, events, calendar, reminders, documents, medicine tracking, and an assistant with reviewed writes and an explicit opt-in automatic mode. Publishing a post, creating a public page and posting a comment still require review; not every public-side action has that rule.

Implementation inventory (FACT, backend + web; see the existing plan for Android scope): sign-up with email, Spaces (family, couple, group, solo) with owner/admin/member roles and invitations, Space chat and direct chat with replies/reactions/edits and @agent, tasks with checklists and priority, Space events with RSVP, capacity, waitlist and budgets with contributions and splits, month/week/day calendar, one-time and repeating reminders with snooze, medication instructions and dose notes, text documents and search inside Spaces, public pages with posts, comments, likes, saves, rules, pins, moderators, help requests and offers, public page events, Discover with interests and feed controls, reports, blocks, platform moderation with appeals, selected-data download, account deletion with a 7-day grace period, a signed-in privacy-controls page, English, Telugu and Hindi, and an assistant with Azure model and TinyFish web-provider integration code. Integration code does not prove a provider is configured or qualified in a particular deployment. This inventory is not a fresh whole-product test result.

## 2. Real-world problems it can solve

KNOWLEDGE + PROPOSAL. Each line is a real job people already do today with a messy mix of apps.

| Problem today | What people do now | How this product can help | Built? |
| --- | --- | --- | --- |
| Family plans get lost in long WhatsApp chats | Scroll, ask again, forget | Tasks, events and reminders inside the family Space, with who-does-what | Yes |
| People managing medicines need an understandable record | Phone calls, paper charts | Personal instruction and "taken/skipped" notes, not medical advice or guaranteed delivery | Partly: sharing with a caregiver is not built |
| Couples juggle plans across two calendars | Screenshots, notes apps | A private couple Space with a shared calendar | Yes |
| Apartment associations and clubs collect money for events | Spreadsheets, UPI screenshots | Event budgets, contributions and fair splits (no payments) | Yes, without payments |
| People new to a city cannot find trustworthy local groups | Facebook groups, word of mouth | Discover pages by interest, place and language | Yes |
| People need small help (a ride, a tutor, spare chairs) | Ask in many groups, risk scams | Help requests and offers on followed pages, with review on busy pages | Yes |
| Community organizers announce events to followers | Instagram, WhatsApp broadcasts | Public page events with "going" | Yes |
| Moderators fight spam alone | Delete by hand | Reports, rules, page moderators, platform moderation, appeals | Mostly |
| Too many apps for one family | 5 to 8 apps | One place for private and public life | Yes |
| Language barrier for many Indian users | English-only apps | Telugu and Hindi | Yes, machine-drafted translations |

## 3. Who can use it, across generations

PROPOSAL, from KNOWLEDGE of each group.

| Group | Main use | What they need most | Gap today (FACT) |
| --- | --- | --- | --- |
| Children under 13 | Not a target | Legal guardian consent, no ads, no public profile | No age check exists; children must not be allowed in yet |
| Teens 13 to 17 | Family Space, school clubs | Parental consent (India's DPDP Act treats everyone under 18 as a child), safe defaults | No age or guardian policy |
| Students 18 to 24 | Clubs, fests, friend groups, events | Fast invites, polls, photos | Invite by account ID only; no polls; no photos |
| Young couples | Shared plans and budgets | Privacy, simplicity | Mostly built |
| Parents 30 to 50 | Family organizer | Reminders that actually reach them, school events, photos | No push notifications; no photos |
| Caregivers | Parent's medicines, appointments | See doses taken, get alerted on missed doses | Caregiver sharing blocked (T158) |
| Older adults 60+ | Stay connected, medicines, family news | Big text, voice, very few buttons, their language | 200% text tested; no voice input; many sections |
| Community organizers | Pages, events, help | Reach, moderation, simple analytics | Built (limited) |
| Local helpers and small services | Offer help | Trust, safety | Help offers built; no verification |

## 4. Why people would use it instead of what they have

KNOWLEDGE unless linked to retrieved evidence in section 13. These are alternatives to investigate, not a verified catalogue of competitors' missing features. Compare current versions on the same task before claiming an advantage.

| Alternative | Strong at | Weak at, where we can win |
| --- | --- | --- |
| WhatsApp groups and Communities | Existing contacts; chat, photos and voice | Test whether explicit responsibility and task status improve the existing workflow; do not claim that WhatsApp lacks events |
| Telegram | Big groups, channels | Same lack of structure; spam |
| Facebook Groups | Established public communities | Test whether private coordination and understandable visibility offer enough reason to switch |
| Discord | Gaming and hobby communities | Complex for families and older users |
| Band (popular in Korea and parts of Asia) | Groups with posts, calendar, polls | Not focused on family care or Indian languages |
| Nextdoor | Neighbourhood communities | Verify current regional availability and local trust mechanisms before comparing |
| Meetup, Luma, Eventbrite | Public events | No family or private life |
| Cozi, FamilyWall, TimeTree | Family calendars and lists; Cozi also advertises reminders and calendar subscriptions (section 13) | Verify languages, permissions, migration and usability; "all-in-one" alone is not an advantage |
| MyGate, NoBrokerHood, ADDA (India) | Apartment management, visitors, dues | Built for associations, not for families or interests |
| Medisafe, MyTherapy | Medicine reminders | Not connected to family plans |
| Splitwise | Shared expenses | Not connected to events |

**Candidate differentiation (PROPOSAL, not demonstrated demand):** understandable private coordination in Telugu and Hindi, explicit responsibilities and consent, with public participation kept separate. Test whether people value that separation inside one app; combining private and public surfaces can also create confusion. Automatic assistant actions must be disclosed, not described as fresh approval before every write.

**Our honest weakness (KNOWLEDGE):** a social app is only useful when your people are on it. WhatsApp already has them. Features alone do not beat that. Section 7 explains how to start small.

## 5. Trust and privacy: what exists and what is missing

### 5.1 Built protections (FACT)

- Private Spaces, chats, tasks, calendars and care records are never used for public discovery, suggestions or ads (repository rule, enforced in queries).
- Message bodies, care records and stored exports use server-side encryption. This is **not** end-to-end encryption. The downloaded export is unencrypted, as the [export notice](../backend/app/modules/identity/exports.py#L50) explicitly says.
- Writes normally require review. The [runtime](../backend/app/modules/agents/runtime.py#L252) also supports explicitly enabled automatic actions for tools that do not always ask. The [tool definitions](../backend/app/modules/agents/toolkit.py) always ask before creating a public page, publishing a post or posting a comment; likes, follows, drafts and other eligible actions can run in the explicit automatic mode. No approval setting was changed by this work.
- Data download, account deletion with 7 days to cancel, a privacy page with take-back of each permission, blocks both ways, reports, appeals.
- The repository contains anonymous, expired-session and cross-Space access tests. Finite tests and implementation inspection do not establish complete security coverage or an independent security audit.

### 5.2 Missing before any real user (FACT, PROPOSAL)

| Gap | Why it matters | Proposal |
| --- | --- | --- |
| Public privacy and terms drafts now exist; no finalized policy | Draft pages are not evidence of legal review, accurate processor contracts or working request-handling operations | Complete the data map, operator/contact and retention details, review the drafts and translations, then approve publication terms |
| A signed-out start/trust screen was added during this session | A stranger still needs to understand actual visibility and processing before joining | Test comprehension and verify that draft notices are not mistaken for launch approval |
| No qualified age/guardian policy verified | Children's rules depend on jurisdiction, commencement dates and applicable exceptions | Start research with adults; obtain legal review and minimize collected age evidence before implementing an age gate |
| Processor disclosures not operationally qualified | Configured Azure OpenAI/TinyFish integrations can receive request/context or search data | Drafts now describe this; verify settings, regions, contracts and just-in-time disclosure before live use |
| No grievance contact | DPDP Act requires a way to raise complaints | Add a contact and a response time |
| No breach response plan | DPDP Act requires telling the Data Protection Board and affected people | Write a one-page runbook |
| Health data (medicines) | Sensitive; extra care expected everywhere | Keep it only-for-you by default; explain clearly; no sharing without explicit consent |
| Not end-to-end encrypted | Some users will assume it is | Keep the honest label; say what the server can read |

KNOWLEDGE, not a legal conclusion: have counsel assess India's DPDP framework, GDPR where applicable, COPPA and the FTC Health Breach Notification Rule where applicable. Establish the operator, launch jurisdictions, effective dates, exceptions and actual data flows first. An age gate or privacy page does not by itself establish compliance. The legal statements in the initial gap table are review prompts, not a determination of obligations in force on this date.

### 5.3 How trust is earned, in plain words (PROPOSAL)

1. Describe actual processing in the person's language. Do not publish promises about advertising, selling data or provider training until the owner approves them and contracts and implementation support them.
2. Distinguish in-product visibility from authorized server/provider processing. A private Space is not an end-to-end-encryption promise.
3. Explain exact reviews, any explicitly enabled automatic actions, cancellation and source provenance.
4. Make leaving understandable: selected-data export, its omissions, seven-day deletion cancellation, retained shared records, and backup/provider retention limits. Do not promise "download everything" or "delete everything."
5. Be reachable: a real contact and published response times.

## 6. Synthetic customer panel

SYNTHETIC. Fourteen model-written perspectives explore possible reactions to the inventory in section 1. No people were interviewed and these are not fourteen independent observations or browser users. Quoted remarks are invented examples for test design, not testimonials, evidence of demand or forecasts of what a demographic group wants.

| # | Person (synthetic) | Situation | First thing they try | What they like | What stops them | Idea they give |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Lakshmi, 68, retired teacher, Hyderabad, Telugu | Grandchildren abroad; takes 4 medicines | Medicine times | Telugu screens; big text works | "Too many sections. Where are the photos of my grandchildren?" | One simple home screen; voice notes; photos |
| 2 | Ravi, 42, IT employee, Bengaluru | Organizes a family of 5 | Family Space and tasks | Tasks with who-does-what | "I have to type an account ID to invite my wife? Nobody will do that." | Invite by link or phone number; share to WhatsApp |
| 3 | Priya, 35, working mother, caregiver for her diabetic father | Worries about missed doses | Care for her father | Clear dose plan | "I can't see if Appa took his tablets. That is the only thing I need." | Caregiver view with the father's consent; missed-dose alert |
| 4 | Arjun, 19, college cultural-fest coordinator | 40 volunteers, 6 events | Group Space and events | Capacity and waitlist | "No polls, no photos, and nobody gets a notification on their phone." | Polls; push notifications; QR join link |
| 5 | Meera and Karthik, 29 and 31, newly married | Rent, trips, groceries | Couple Space, budgets | Private by default, splits | "Can it remind us automatically before an event?" | Opt-in event reminders |
| 6 | Suresh, 55, apartment association secretary, 240 flats | Notices, festival funds, complaints | A page or group | Budgets and contributions; moderation | "I need polls, notices that everyone sees, and a record of who paid." | Notice board with "seen"; polls; payment record (no payments in app) |
| 7 | Fatima, 38, home baker | Wants local customers | A public page | Help offers, page events | "Can I show photos of my cakes?" | Photos; a simple catalogue (commerce not approved) |
| 8 | Venkat, 60, temple festival committee | 120 volunteers, donations | Page events and help posts | Volunteers can say "going" | "Older volunteers only use WhatsApp." | Share event to WhatsApp; printable volunteer list |
| 9 | Anita, 26, moderator of a 5,000-member gardening page | Spam and scams | Moderation | Rules, pins, reports | "Page moderators cannot see reports about our own page." | Page-level report queue (T137) |
| 10 | Dev, 15, school student | Wants to join his cricket club | Sign-up | Nothing yet | "It never asked my age." (A risk for us, not a feature for him) | Guardian consent flow before teens join |
| 11 | Rahul, 33, privacy-minded engineer | Reads the fine print | Privacy page | Honest "not end-to-end" label; data download | "Where is the privacy policy? Which AI provider sees my questions?" | Public policy; provider disclosure; security contact |
| 12 | Grace, 45, NGO relief coordinator | Floods; volunteers and needs | Help requests and offers | Need-by dates, review on busy pages | "In a crisis I need a map and fast verification." | Place filter on help; verified organization badge (T131) |
| 13 | Mohan, 72, Hindi speaker, new to smartphones | Wants family news | Home | Hindi | "I cannot type. I speak." | Voice input and read-aloud |
| 14 | Sara, 30, living in the US | Coordinates with family in India | Family calendar | Time zones shown correctly | "I need a notification when my mother adds something." | Push notifications; daily digest email |

### 6.1 Questions generated by the scenarios

SYNTHETIC, not panel consensus. Scenario numbers identify invented examples, not independent observations. None establishes a biggest barrier, universal preference or demand estimate.

1. Does the current account-ID invitation prevent two adults from joining and completing a shared task without coaching (#2, #4, #8)? Compare it with their present workaround before choosing a replacement.
2. Is a photo necessary to finish the selected job, or would a link or description suffice (#1, #4, #7)? Test the task rather than assuming everyone wants media uploads.
3. Which alerts need to arrive when the app is closed, and can participants distinguish scheduled, delivered and acknowledged reminders (#4, #5, #14)?
4. Which participants encounter a concrete reading, typing, dexterity, navigation or connectivity barrier (#1, #13)? Test assistive technology and device dictation; do not infer capability from age.
5. Can participants explain who sees private/public/AI-processed data and find a real support route (#10, #11)? Separately review the legal and operational notice requirements.
6. Would a poll or notice board reduce a recurring coordination failure, compared with existing chat and task tools (#4, #6)?
7. Is there a genuine consented caregiver job worth a separate clinical, privacy and safety review (#3)? Do not promise monitoring or medical benefit from the current personal-care feature.

### 6.2 Product rules the panel challenges (FACT about the rule, SYNTHETIC reaction)

- "No automatic reminders for tasks and events" (owner decision, [plan section 1](COMMUNITY_AGENT_PLAN.md#1-decisions-the-owner-needs-to-make)). Several personas expected reminders. PROPOSAL: keep "never automatic", but offer a one-tap **opt-in** reminder when creating or joining an event.
- "Invite by account ID." PROPOSAL: join links with expiry and use limits (T161 was blocked waiting for the owner).

## 7. Ruthless honesty: the biggest risk is not features

KNOWLEDGE + PROPOSAL.

- The product is very broad: family, couples, care, communities, moderation, events, budgets, an assistant with web search, news and shopping plans. Most successful products start with **one group and one painful job**, win there, then grow.
- Social products die from empty rooms, not missing features. Every new user must be able to bring their people in under one minute.
- PROPOSAL for a first wedge (owner to choose one):
  1. **Telugu-speaking families** (organizer + parents + medicines), or
  2. **Apartment associations and temple/festival committees** in Hyderabad (notices, events, funds, volunteers), or
  3. **College clubs and fests** (events, volunteers, polls).
- Pick one, find 10 real groups, and measure: did they invite their people, and did they come back in week 4?

## 8. How to get real feedback, honestly

PROPOSAL.

1. **Recruit 8 to 10 real people** matching the chosen wedge, from the owner's own network. Tell them it is a test.
2. **Interview first, demo second.** Ask about their past, not about our idea ("Tell me about the last time you organized a family event. What went wrong?"). Avoid "Would you use this?"; people say yes to be polite.
3. **Usability test** five tasks per person on their own phone: sign up, create a Space, invite one person, add an event, find a public page. Watch silently; note where they stop.
4. **Run a small pilot** with 3 to 5 real groups for 4 weeks on a test server, with their consent and a written privacy notice.
5. **Measure:** a group counts as activated when it has 3 or more members and one event or task in its first week; we track week-1 and week-4 return rates and invites accepted per group. Only counts, never content (no analytics exists yet; it must be designed privacy-first).
6. **Listen in public, honestly:** read real discussions in public forums and groups about family organizing, apartment associations and caregiving to learn words and pain points. Never post fake reviews or pretend to be a user.

Running this needs the owner: real contacts, a test server and a privacy notice. The AI can prepare the interview guide, consent text, test tasks and the analysis.

## 9. AI agent benchmarks and what they teach us

KNOWLEDGE. Public benchmarks, what each measures, and the lesson for our assistant. Scores change every few months; check current leaderboards before quoting numbers.

| Benchmark | Measures | Lesson for us |
| --- | --- | --- |
| τ-bench (tau-bench) | Customer-service agents following policies with tools and a simulated user; reports pass^k, success in all of k tries | Closest to our assistant. Reliability across repeats matters more than one lucky success. Run each golden case several times. |
| Berkeley Function Calling Leaderboard | Choosing and filling tool calls correctly | Measure wrong-tool and wrong-argument rates in our versioned golden corpus |
| GAIA | Real questions needing browsing, files and reasoning | News and research answers need multi-step checks and cited sources |
| WebArena, VisualWebArena, BrowseComp | Acting on and finding things in real websites | Web automation such as shopping is still error-prone; keep humans approving every action |
| OSWorld | Using a whole computer | General computer use is still far from human reliability |
| SWE-bench Verified, Terminal-Bench | Coding agents fixing real issues | Useful for how we build: tests first, small changes, review |

PROPOSAL for our own benchmark, building on the existing `npm run golden` corpus:

- Run each case 5 times and report pass^5, not only one pass.
- Add safety cases: requests to leak another Space, act without approval, give medical advice, or follow instructions hidden in a web page (prompt injection).
- Track cost and time per answer, and the share of answers with a cited source.
- Add Telugu and Hindi cases, and misspellings like the real request "openai and mafang" that the assistant misread (FACT, [plan section 3.3](COMMUNITY_AGENT_PLAN.md#33-known-problems)).
- Publish the results in the repository with the date, model and prompt version.

Implementation follow-up: another session added six designed safety/language cases and `--repeat N` support (1 to 10), with a case-level all-repeats score and saved-run round metadata. The current inventory has 47 requests in 45 threads; the offline scorer/CLI suite passed 60/60 after the report-shape integration fix. Missing planned rounds/cases must remain incomplete, not disappear from the denominator. No repeated live-model evaluation was run. The thread-level evaluation and grounding protocol in section 13.4 remain proposals; case-level repeat success is not the same as whole-conversation success.

## 10. How strong companies and startups keep improving

KNOWLEDGE, applied to us.

| Practice | What it means | For us |
| --- | --- | --- |
| Continuous discovery | Someone talks to a real user every week | One real conversation a week, notes saved |
| Small bets | Ship the smallest useful slice, learn, repeat | Small verified slices within one approved work cycle; do not require a new prompt after each repair |
| Clear decisions | Each decision has an owner, date and reason | A decisions log again (section 12) |
| Quality gates | Tests and checks before anything ships | `npm run verify`, backend suite, screen tests at 320 px and 200% text |
| Metrics that matter | Activation and retention, not time spent | Design privacy-first counts |
| Evals for AI | Golden sets, repeated runs, safety cases | Section 9 |
| AI agent teams | Agents write specs, tickets, tests, code and reviews; humans decide | The prompts in section 11 |
| Blameless reviews | Learn from every failure | A short note when something breaks |

## 11. How we work together

### 11.1 What the AI can and cannot do (FACT)

- This conversation does not create a persistent coding worker. Public sources were readable in this follow-up, but no authenticated social accounts, outreach or phone calls were used. A local process can run independently; that does not keep this Copilot conversation thinking between messages.
- It should not run an unattended loop that changes code forever: costs grow without limit, mistakes pile up unseen, and other sessions edit the same files at the same time (seen on 2026-10-07).
- The requested bounded local check loop is now implemented. Section 14 explains its limits and commands. It runs trusted offline checks and writes local reports; it does not repair code or approve actions. No scheduler or always-on service was installed.
- Within an authorized session, continue through ready work without repeated permission questions. Stop at the agreed completion condition, a material scope/approval blocker, or a resource limit, and leave an evidence-backed handoff. Neither an endless loop nor repeated "continue" messages are a substitute for an explicit goal.

### 11.2 Roles

| Owner | AI |
| --- | --- |
| Chooses the wedge and priorities | Researches, proposes options with a recommendation |
| Makes product, legal, money and privacy decisions | Builds, tests, fixes, documents |
| Brings real users and real feedback | Prepares interview guides and analyses notes |
| Provides credentials in the terminal, never in chat | Never asks for secrets in chat |

#### Proposed staffing and current AI assignments

PROPOSAL: plan for **eight core roles**, not eight hires made by this conversation. Start with fewer people covering these
responsibilities if resources require it; do not hire ahead of evidence. Android remains paused under the existing owner
instruction, so its slot is future capacity, not a current implementation assignment.

| Role | Count | Accountable output |
| --- | --- | --- |
| Product/research lead | 1 | A named user job, consented research, falsifiable hypotheses and prioritized opportunities |
| Engineering manager / senior architect | 1 | Ready task contracts, system boundaries, one writer per area, integration and release evidence |
| Full-stack engineers, with backend and web ownership | 2 | Small working slices, authorization, exact retries, recovery and maintainable contracts |
| UX/product designer | 1 | Comprehensible journeys, accessibility, language review coordination and observed usability |
| QA / test engineer | 1 | Independent final-state checks, adverse paths, reproducible failures and cross-device evidence |
| Platform / security engineer | 1 | Threat model, deployment and key controls, backups, incident response and operational limits |
| Android engineer, paused | 1 | Native implementation and device qualification only after Android work is resumed |

Qualified privacy/legal counsel, native-language reviewers and an independent security review are specialist functions,
not fictional employees. Before a pilot, name the people responsible for support, moderation/abuse handling and privacy
requests; these cannot be left to a model with no accountable operator. Growth, pricing and analytics work follow a
validated recurring job and an approved data-collection plan. Extra managers or separate "bug finder" titles are not a
substitute for engineering ownership and independent QA.

FACT: the owner's four requested model selections were used for bounded assignments on 2026-10-07:

| Registered Copilot model | Assignment in this batch |
| --- | --- |
| Claude Opus 5.5 | Product discovery, initial audience and clearly synthetic participant challenges |
| GPT-6.1 Sol | Engineering management and a reproduced supervisor completion-boundary defect |
| GPT-6 Astra | Privacy/security review and the deletion-draft mismatch with current behavior |
| Claude Sonnet 5.5 | Web typechecking and client-suite evidence, including the unsuccessful first run |

The coordinating assistant owns integration and the edits in this batch. These are completed delegated tasks, not a
permanent workforce. Development-model selections do not change the application's configured model, approval policy or
provider budget. Availability must be checked when invoking a future delegate; do not silently substitute a model.

The manager's task contract uses section 14.1: concrete outcome, evidence/authority, one writer and named files, acceptance
checks, prohibited actions, finite limits and a reviewer. Keep failures and blocked items visible. Review actual state,
not persuasive summaries; serialize shared-file edits; stop for material decisions rather than filling the queue with
unapproved features. Weekly product learning should ask whether two people completed the intended job, with how much
assistance and what privacy/delivery misunderstandings, not how many tokens, agents or screenshots were produced.

### 11.3 The loop

1. **Discover**: research or user notes give an opportunity.
2. **Decide**: the owner approves one line: "DECISION: …".
3. **Build**: form a falsifiable local hypothesis, add a focused failing check where practical, make the smallest change and validate it immediately. Changed screens also need 320 px and 200% text checks.
4. **Verify**: run focused checks first, then the required broader gates for the affected scope. Record actual results, source changes and unverified release gates; never weaken tests to obtain a pass.
5. **Learn**: real users try it; their notes feed step 1.

### 11.4 Prompts the owner can send

The project includes the [product-cycle skill](../.github/skills/product-cycle/SKILL.md). Open the app repository as the workspace or attach the skill file if the editor does not discover nested-repository skills. It guides active sessions; it does not keep a chat model running after a turn ends.

One batch-level instruction can replace repeated routine permission messages:

```text
Use product-cycle. Improve the approved adult coordination workflow end to end.
Start from current code, failing checks and the existing research plan. Separate
facts, retrieved evidence and synthetic hypotheses. Continue through ready
in-scope work, verify each change, preserve other workstreams, and record evidence.
Keep provider limits, privacy boundaries and exact approvals. Bring back only
material decisions, genuine blockers, or the completed and verified batch.
```

More specific prompts:

```
Discover: Research <topic> for <group>. Label facts, knowledge and assumptions. Give 3 options with a recommendation. No code.
```

```
DECISION: <one sentence>. Record it, then build it end to end on backend and web with tests first. Stop only for a decision I must make.
```

```
Verify: Run the required checks for <approved scope>. Fix confirmed in-scope defects, preserve other sessions' edits, and report failures, skipped checks and source changes honestly. Do not change unrelated behavior or bypass tests.
```

```
Review: Review everything changed since <commit> for bugs, privacy and security. Fix confirmed defects with a test first.
```

```
User notes: Here are consented, de-identified interview notes: <paste>. Separate observed behavior from opinions, compare with the synthetic hypotheses, and update the opportunity list without inventing quotes or demand estimates.
```

```
continue
```

### 11.5 Decisions before expanding scope

These are not repeated permission requests for routine engineering. Continue approved local work while material product, legal, external-access and spending decisions remain explicitly pending. Broad encouragement or "unlimited tokens" does not set a new monetary limit or authorize real-user processing.

| # | Decision | Recommendation |
| --- | --- | --- |
| A | Which first wedge (section 7) | Telugu-speaking families, or apartment and temple committees in Hyderabad |
| B | Restore the governance documents deleted in snapshot `7d94559` (Constitution, Decisions, Tasks, Features and Screens, Build Status) from commit `3f3de7f`, or retire them | Restore: `AGENTS.md` and the structure check still depend on them (FACT: `npm run test:structure` fails 4 of 5) |
| C | `AGENTS.md` rule 7 says no external providers, but the assistant now uses Azure and TinyFish (DEC-058, DEC-059) | Update rule 7 to name the approved providers |
| D | Complete and review the public privacy/terms drafts and age policy (section 5.2) | Draft routes now exist; operator/contact, retention, legal review and any age enforcement remain open |
| E | Join links (T161) | Yes, expiring links with a use limit, for group Spaces first |
| F | Photos (T146) | Yes, with the safe image rules proposed earlier (type check, re-encode, size limits) |
| G | Opt-in reminders for events | Yes, one tap, never automatic |
| H | Push notifications provider | Choose one (for example Firebase Cloud Messaging) when the owner accepts the cost and terms |
| I | Reusable project working procedure | The focused [product-cycle skill](../.github/skills/product-cycle/SKILL.md) is now added; do not reinstall an unreviewed collection of skills merely to increase agent count |

## 12. Ranked opportunities

PROPOSAL. Order reflects risk and the cheapest useful next experiment, not measured demand. The earlier numeric reach/confidence scores were guesses from synthetic personas; they must not be treated as customer evidence.

| Priority | Opportunity | Evidence strength | Cheapest discriminating check | Approval boundary |
| --- | --- | --- | --- | --- |
| 1 | Public privacy/terms information, operator contact and accurate provider disclosures | Strong evidence of a documentation gap; no legal qualification | Compare a draft data map with actual export, deletion, prompt and access behavior | Operator, jurisdiction, retention and legal review before publication |
| 2 | Complete one invitation-to-shared-task workflow | Existing implementation; invitation friction is still a hypothesis | Observe an adult organizer and recipient completing it with synthetic data, without coaching | Repair confirmed defects now; new invite mechanisms need a decision |
| 3 | Assistant reliability and authorization benchmark | Existing golden tooling and boundary tests; no new live-model score | Run offline checks; propose held-out, repeated task evaluations with explicit budgets | Offline checks ready; provider evaluation needs a defined cap and authority |
| 4 | Opt-in event reminders and reliable alerts | Synthetic requests; delivery outcomes not demonstrated here | Explain exact recipient/time/channel, cancel, reconnect and distinguish delivery from acknowledgement | G/H and notification/privacy policy |
| 5 | Localized, accessible core workflow | Existing strings and responsive tests; native-language usability unverified | Telugu/Hindi review, keyboard/screen-reader use and low-end phone testing | Research recruitment/consent; avoid age stereotypes |
| 6 | Calendar interoperability and migration | Cozi listing and public comments provide a relevant comparison | Test whether a read-only calendar import/export prototype reduces duplicate entry | New integration and data-sharing decisions |
| 7 | Polls, notices and page-moderator tools | Mainly synthetic scenarios | Observe an organizer's real scheduling/moderation job before adding controls | A/Q14 and authority model |
| 8 | Photos in posts, chat and events | Synthetic expectations, not adoption evidence | Test a mock workflow and design retention, abuse reporting and upload controls | F; no arbitrary media collection |
| 9 | Consented caregiver visibility | Potential value, high sensitivity; not a qualified current workflow | Study consent and revocation with synthetic records, not medical-outcome claims | Separate care policy and clinical/legal risk review |
| 10 | Voice input or a simplified home | Synthetic accessibility hypotheses | First test existing assistive technology and device dictation; identify an observed barrier | New processing/provider costs require approval |

### Invitation recovery evidence (2026-10-07)

FACT, a narrow repair under priority 2 rather than a new invitation mechanism: [invitation management](../web/src/features/spaces/invitations.tsx) now treats a 403/404 creation/history denial as an ended panel for owners and admins as well as members. A lost-response retry cannot leave both Retry and Close unavailable after access is lost. Stale actions are hidden, Close is enabled, and closing releases the other Space controls. Backend unavailable-recipient responses remain 409 and are not reclassified.

From the app root, with the installed Chromium supplied through `COMMUNITY_CHROMIUM_PATH`, `node --test tests/unit/spaces-ui.test.mjs` passes **25/25**. The focused pattern `unconfirmed invitation|invitation retry preserves` passes **10/10** across owner/admin, 403/404 and 1440/320 px; the 320 px cases set root text to 200%. Retry checks assert identical recipient, serialized body and idempotency key, exactly one stored invitation and no extra submission after denial. All fixture requests are intercepted; unexpected/outbound requests and browser errors fail the tests.

`npm --prefix web run typecheck` passes. `node --test tests/spaces-client.test.mjs tests/spaces-invite-policy-client.test.mjs` reports **4/4** checks. The [mobile retry](../.local/verify/invitation-recovery-20261007/invitation-retry-320.png), [mobile denied state](../.local/verify/invitation-recovery-20261007/invitation-denied-320.png) and [desktop retry](../.local/verify/invitation-recovery-20261007/invitation-retry-1440.png) were visually inspected. Local `/login` and `/app/spaces` returned HTTP 200; no authenticated live invitation was submitted. This verifies the tested UI recovery, not onboarding conversion, full accessibility conformance or real customer demand. The earlier watcher stop remains recorded as `changed`, not a passing qualification.

### Invitation inbox recovery evidence (2026-10-07)

FACT: the initial three browser regressions found that a 403/404/503 inbox read hid invitation rows but left a cached Join confirmation open. The current [inbox implementation](../web/src/features/spaces/invitations.tsx) clears the review on a failed read and does not render it in an error state. The follow-up extended the cases with a next-page cursor and reproduced a remaining stale pagination action at both desktop and mobile widths; pagination is now hidden during the error too. Recovery never automatically reopens a prior review, and an explicit new review uses the refreshed invitation name.

Fresh synthetic verification from the app root, with the installed Chromium selected by `COMMUNITY_CHROMIUM_PATH`:

- `node --test --test-name-pattern='inbox .* removes a stale join review' tests/unit/spaces-ui.test.mjs`: **6/6 passed** for 403/404/503 at 1280 px and 320 px; the latter verifies root text at 200%. The cases require zero invitation acceptance requests, no cached rows/dialog/pagination during failure, and fresh controls and review after recovery.
- `node --test tests/unit/spaces-ui.test.mjs`: **31/31 passed**, no failures or skips; [log](../.local/verify/inbox-recovery-20261007/spaces.log) and [JUnit](../.local/verify/inbox-recovery-20261007/spaces.xml) retained. Existing owner/admin retry and permission-loss checks remain intact.
- `npm --prefix web run typecheck` and `node --test tests/spaces-client.test.mjs tests/spaces-invite-policy-client.test.mjs`: types passed and **4/4 client checks passed**. Web source, public assets and design-token fingerprints matched before and after this combined run; this is not a whole-product or cross-platform qualification.

The [mobile error](../.local/verify/inbox-recovery-20261007/inbox-error-320.png), [mobile fresh review](../.local/verify/inbox-recovery-20261007/inbox-review-320.png) and [desktop fresh review](../.local/verify/inbox-recovery-20261007/inbox-review-1280.png) were inspected. The test asserts no horizontal overflow, unexpected requests or browser errors. `/login` and `/app/spaces` returned HTTP 200 on the existing local preview; no real invitation was sent. The watcher remains stopped on its earlier `changed` result and is not presented as running or as a stable-source pass. No permission policy, provider, backend/schema, saved environment file or deployment changed.

An additional [retained verifier run](../.local/verify/inbox-qualified-2026-10-07T07-50-31-885Z/summary.md) passed **31/31 Space UI tests**, **9/9 invitation-policy and role client checks**, and web typechecking, with no failures, skips, evidence errors or reported source changes. Its [seven watched input hashes](../.local/verify/inbox-qualified-2026-10-07T07-50-31-885Z/watched-inputs.json) also matched before and after. The [mobile error](../.local/verify/inbox-qualified-2026-10-07T07-50-31-885Z/captures/inbox-error-320.png) and [fresh review](../.local/verify/inbox-qualified-2026-10-07T07-50-31-885Z/captures/inbox-review-320.png) were inspected; the unavailable state exposes Retry, not cached invitation details or an acceptance action.

Earlier evidence is retained separately: [25/31 UI tests](../.local/verify/20261007074542430-385632/summary.md) passed before the pagination guard was integrated; the six failures required hiding the cached next-page action. A [subsequent 31/31 pass](../.local/verify/20261007074744941-389605/summary.md) recorded a concurrent test-file change for screenshot capture and is not treated as a stable-source result. Two initial regression attempts timed out on fixture locators before reaching the behavior assertion; after targeting the refresh control and the complete error container, all three original cases reproduced the retained stale Join dialog before repair. No assertion was removed to obtain the passing result.

### Invitation decision confirmation evidence (2026-10-07)

FACT: [recipient and sender decision handling](../web/src/features/spaces/invitations.tsx) previously accepted any schema-valid success body. Three browser regressions demonstrated false success for an acceptance naming another Space and declines naming another invitation or a different terminal outcome. Those results are now checked against the reviewed target before success. Withdrawal likewise checks the invitation ID and `revoked` state; its initial test attempt had an incorrect button label, which was corrected before four genuine mismatch failures were reproduced. Unconfirmed results retain the review/retry path.

Eight accept/decline recovery cases and six withdrawal cases pass at 1280 px and 320 px with doubled root text. They preserve the exact action path, body and account headers on retry and assert one stored membership/decision effect. The backend's existing invitation-bound idempotency is unchanged. The earlier owner/admin permission-loss and inbox-refresh tests remain intact.

An initial `node --test tests/unit/spaces-ui.test.mjs` run passed **51/51**, followed by clean web types and **4/4** client checks, but its input fingerprint changed during execution. A fixed capture at `/tmp/event-invitation-decisions-mQcWla` then preserved 182 source/config/asset inputs, reused the already installed dependencies, and excluded environment files. Running `node --test --test-reporter=spec --test-reporter-destination=spaces.log --test-reporter=junit --test-reporter-destination=spaces.xml tests/unit/spaces-ui.test.mjs` there passes **53/53** in 57.53 seconds. The JUnit has zero failures/errors/skips; every captured hash stayed unchanged and all captured inputs matched the shared workspace at final comparison. Two newer concurrent cases are included in this later result; the runs are not added together.

The [mobile acceptance retry](../.local/verify/invitation-decisions-20261007/decision-accept-retry-320.png), [mobile decline retry](../.local/verify/invitation-decisions-20261007/decision-decline-retry-320.png), and [desktop acceptance retry](../.local/verify/invitation-decisions-20261007/decision-accept-retry-1280.png) were inspected. Tests reject outbound requests, unexpected fixture endpoints and browser errors. `/login` and `/app/spaces` returned HTTP 200 on the existing local preview. These are synthetic UI/contract checks, not real customer actions, full accessibility conformance or live invitation delivery. The watcher remains stopped on its retained source-change report; no provider, backend/schema, saved environment file or deployment was changed.

### Invitation response identity evidence (2026-10-07)

The next continuation found that the reported accept/decline mismatch checks already passed in the shared worktree. The sender's creation path still treated any schema-valid invitation response as confirmation. Two new regressions returned another Space ID or recipient ID and reproduced a false success message. The [creation handler](../web/src/features/spaces/invitations.tsx) now checks the requested target before confirming the result.

An inconsistent response is treated as `INVALID_RESPONSE` with an unconfirmed outcome. It does not clear the original recipient or idempotency key; the explicit retry sends the same serialized request and results in one stored invitation. A positive control found that a strict text comparison also rejected uppercase UUID input returned in canonical lowercase by the API. The final guard compares recipient UUID letter case consistently while still rejecting a different account. That compatibility failure was caught during this repair, not a claimed pre-existing product defect.

The combined response boundaries now verified are:

| Operation | Required response match | Preserved behavior |
| --- | --- | --- |
| Create invitation | Requested Space and recipient UUID | Same-key/body retry; one stored invitation; valid uppercase recipient input |
| Accept | Space ID of the reviewed invitation | Existing recipient confirmation and repeat-decision behavior |
| Decline | Requested invitation ID and `declined` status | Existing decision retry behavior |
| Withdraw | Requested invitation ID and `revoked` status | Existing lost-reply and repeated-withdrawal behavior |

The accept/decline and withdrawal guards and their expanded tests were concurrent work; they were verified and preserved, not replaced. Rejecting a response does **not** undo a request that the server may already have committed. These checks prevent unsupported UI confirmation; server-side authorization and idempotent operations remain the authority for effects.

The [retained verifier report](../.local/verify/invitation-results-2026-10-07T08-14-07-781Z/summary.md) passes **53/53 Space UI tests**, **9/9 invitation-policy and role client checks**, and web typechecking, with zero skips, evidence errors or reported source changes. Its [seven watched input hashes](../.local/verify/invitation-results-2026-10-07T08-14-07-781Z/watched-inputs.json) also match before and after. The five focused creation checks cover both wrong-target replies at desktop/mobile sizes and the uppercase-UUID positive case; six existing withdrawal cases cover lost replies, wrong IDs and wrong statuses at both widths.

Reproduction commands from the application root, with an installed compatible Chromium:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-name-pattern='invitation creation rejects a mismatched target|canonical response for an uppercase' tests/unit/spaces-ui.test.mjs
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 tests/unit/spaces-ui.test.mjs
node --test tests/spaces-invite-policy-client.test.mjs tests/spaces-roles-client.test.mjs
npm --prefix web run typecheck
```

The [320 px error state](../.local/verify/invitation-results-2026-10-07T08-14-07-781Z/captures/invitation-target-error-320.png) and [desktop state](../.local/verify/invitation-results-2026-10-07T08-14-07-781Z/captures/invitation-target-error-1280.png) were inspected. The mobile test verifies root text at 200%, no horizontal overflow and a reachable Retry control. No real invitation was submitted; all component API responses are synthetic, and unexpected/outbound requests fail the tests. The existing local `/login` preview returned HTTP 200 without a server restart. No backend/schema, permission, age policy, provider, saved environment file or deployment change is claimed, and these scoped results are not full-product or native qualification.

## 13. Retrieved evidence and decision follow-up

### 13.1 Sources, method and limits

RESEARCH. Accessed 2026-10-07 without credentials, paid model calls or uploading repository/user data. Published studies, a first-party product description and public comments are different kinds of evidence; none are customers testing this application.

| Source | What was actually retrieved | Implication and limitation |
| --- | --- | --- |
| [Pew: How Americans View Data Privacy](https://www.pewresearch.org/internet/2023/10/18/how-americans-view-data-privacy/) | Survey of 5,101 U.S. adults, May 15-21, 2023. 67% reported little/no understanding of company data use; 73% felt little/no control over it. | Make processing and revocation understandable. These are U.S. attitudes from 2023, not an estimate of Indian demand or trust in this app. |
| [Pew: Mobile Fact Sheet](https://www.pewresearch.org/internet/fact-sheet/mobile/) | Published November 20, 2025; metadata updated September 1, 2026. Survey of 5,022 U.S. adults in 2025; smartphone ownership was 78% at 65+ and 97% at 18-29. 16% of adults were smartphone-only internet users. | Test connectivity, device capability and digital confidence, not age alone. U.S. adoption figures cannot be transferred to Telugu/Hindi-speaking households. |
| [W3C: WCAG overview](https://www.w3.org/WAI/standards-guidelines/wcag/) | The official accessibility standards overview, including WCAG 2.2. | Propose WCAG 2.2 AA as a target; 320 px/200% text checks alone do not establish conformance or usability. |
| [WCAG 2.2 specification](https://www.w3.org/TR/WCAG22/) | Retrieved the specification with reflow, target-size and accessible-authentication criteria. | Audit keyboard/focus, contrast, target sizes, error recovery and assistive technology; do not reduce inclusion to larger text or an age label. |
| [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | Retrieved its description of voluntary risk-management guidance across AI design, development, use and evaluation. | Maintain explicit risks, owners, measurements and controls. This is not a compliance certificate or evidence that a particular model is safe. |
| [Original tau-bench paper](https://arxiv.org/abs/2406.12045) | Retrieved the abstract describing user/tool/policy interaction, final-state evaluation and repeated-trial reliability. | Apply those measurement ideas to this product. Its 2024 experimental scores are historical, not scores for current models or this app. |
| [Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) | Retrieved the current page identifying BFCL V4 and function-calling evaluation. | Tool selection and argument quality are separate from privacy, grounded answers and adoption. No leaderboard ranking was copied or claimed here. |
| [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) | Retrieved official guidance discussing under-13 coverage and parental consent. | Assess the actual audience, jurisdiction and applicable duties with counsel; this is not a universal age policy for this product. |
| [Cozi official App Store listing](https://apps.apple.com/us/app/cozi-family-organizer/id407108860) / [public listing API](https://itunes.apple.com/lookup?id=407108860&country=us) | Listing for version 2026.08.28 advertises shared calendars, reminders, grocery/task lists and calendar subscriptions. The API reported 400,414 ratings and about 4.81/5 at retrieval. | Strong incumbent expectations. Vendor claims were not independently usability-tested; ratings are changing, self-selected store metadata, not this product's demand or active-user count. |
| [Public discussion query](https://hn.algolia.com/api/v1/search_by_date?query=family%20calendar&tags=comment&hitsPerPage=10&numericFilters=created_at_i%3E1735689600) | The ten newest matching Hacker News comments after January 1, 2025; returned dates were September 24-October 3, 2026, from 205 indexed matches. | Convenience sample from a technical community, clustered across a few stories. Not representative, not ten independent customer interviews, and not a prevalence estimate. |
| [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) | December 2024 guidance distinguishing predefined workflows from agents and recommending simple patterns; the retrieved page also warns that its tooling landscape has changed. | Start with the simplest controllable system, measure the need for autonomy, and account for latency/cost. Vendor experience is not proof that every company should adopt the same architecture. |
| [METR: early-2025 developer experiment](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) | Randomized experiment with 16 experienced open-source developers and 246 tasks; AI use took 19% longer in that setting. | Do not equate generated code, token volume or subjective speed with shipped value. This is a bounded historical result, not a claim about every developer or current model. |
| [METR: February 24, 2026 follow-up](https://metr.org/blog/2026-02-24-uplift-update/) | The authors describe newer measurements as an unreliable signal because of selection effects and difficulties measuring concurrent-agent work; they consider increased speedup likely but its size weakly evidenced. | Do not cherry-pick the earlier slowdown or promise a universal speedup. Measure this project's lead time, rework, escaped defects and actual user outcomes. |
| [Original tau-bench](https://github.com/sierra-research/tau-bench) / [current successor repository](https://github.com/sierra-research/tau2-bench) | The old repository says its tasks are outdated. The successor describes updated tasks/domains and warns that banking-knowledge results before v1.0.1 are not comparable with later grading. | Pin benchmark/task/grader versions and test policy-constrained state changes. No benchmark was installed or run against a paid model here, and no leaderboard ranking is claimed. |

The first relevance-ranked forum search returned mostly 2009-2015 comments; those were excluded from current-demand claims. The [Cozi review feed](https://itunes.apple.com/us/rss/customerreviews/id=407108860/sortBy=mostRecent/json) returned metadata but **zero review entries**. No reviews were invented to replace them. A WhatsApp article URL redirected to the blog index without usable article text, and an attempted Meta announcement URL returned 404; those attempts do not establish a competitor feature's presence or absence. The [MeitY framework URL](https://www.meity.gov.in/data-protection-framework) returned HTTP 200 but no usable framework text in this pass, so current Indian commencement dates and legal obligations were not independently established by that request.

Three product-relevant observations from the recent comment sample, paraphrased without collecting author identities:

- [Calendar synchronization, September 24](https://news.ycombinator.com/item?id=49832940): an external-calendar connection was the useful coordination feature the commenter wanted. Hypothesis: avoiding duplicate entry may matter more than another calendar view.
- [Service longevity, September 24](https://news.ycombinator.com/item?id=49836786): the commenter questioned dependence on software support for long-lived household tools. Hypothesis: understandable export and continuity matter to trust.
- [Agent context boundaries, September 30](https://news.ycombinator.com/item?id=49906726): a commenter described friction when an assistant crossed project-specific tools and rules. Hypothesis: clear context boundaries and reliable handoff matter more than having more agents.

These comments were not verified personal histories. They suggest experiments, not feature mandates. Comment points were unavailable (`null`), and view/like counts were not provided; no engagement figures or sentiment percentages are inferred. No demographic or health profiles were built from posts.

### 13.2 Recommended first job and how to disprove it

PROPOSAL: focus discovery on **adult family organizers and one other adult participant, initially in a language the team can review well**, coordinating one recurring weekly plan. The job is: "When our plan changes, we know who is responsible, what changed, and whether a reminder was actually accepted." Keep medical monitoring, public growth and minors out of the initial claim. This does not change the approved product scope.

Why this may work: the existing private Space, task, event, reminder and permission paths can support a complete job without needing a large public network. Why it may fail: another account, moving an established group, double-entering a calendar, unreliable alerts, and mixing public/private concepts may cost more effort than the app saves.

| Hypothesis | Smallest real check, after recruitment/consent approval | Evidence against it |
| --- | --- | --- |
| Lost responsibility is painful enough to change behavior | Ask about the last two actual coordination failures before showing the app; compare the current chat/calendar workaround | No recent recurring pain, or current tools resolve it easily |
| Two people can coordinate without an expert setting everything up | Observe invitation, acceptance, task handoff, opt-in reminder and cancellation with synthetic records | Repeated coaching, visibility confusion or abandonment |
| Private/public separation is understood | Ask each participant who can see a draft, a task, a message and an assistant response before acting | Any unexpected public disclosure or consistent misunderstanding |
| The assistant reduces work safely | Compare the same task manually and with the assistant; measure successful outcomes, corrections and time | More review effort, incorrect state, invented completion or unapproved changes |
| People return for the job rather than politeness | After an approved pilot, measure group-level use over several weeks and ask what displaced the app | Organizer-only activity, no completed shared jobs, or participants reverting to the old workflow |

Record numerator, denominator, cohort and period for every metric. Proposed activation is an accepted invitation plus a completed handoff involving two adults; proposed retention is another completed shared job in a later week. These definitions need agreement before collection. Do not treat session length, generated tokens, likes or an invented "1% success chance" as product success.

Design across generations by varying **capability and context**, not assigning preferences by birth year: keyboard/screen reader, dexterity, contrast, 200% text, low-end devices, intermittent connectivity, confidence, language and time zone. Include older experienced users and younger low-confidence users in approved research. Native speakers must review machine-drafted Telugu/Hindi. Supporting adults well does not authorize children, guardian processing or health-care workflows.

### 13.3 Trust work required before a real-user rollout

FACT: the [privacy screen](../web/src/features/identity/privacy-screen.tsx#L42) requires the signed-in account and offers permission withdrawal. The initial inspection found no public notice routes; another workstream subsequently added [privacy](../web/src/app/privacy/page.tsx), [terms](../web/src/app/terms/page.tsx) and a signed-out start screen, using clearly marked draft components in [about-screen.tsx](../web/src/features/platform/about-screen.tsx). This corrects the earlier inventory, not the unresolved legal/operational status. The [privacy messages](../web/src/features/i18n/areas/privacy.ts#L1) explicitly say translations await native-speaker review.

FACT: [exports](../backend/app/modules/identity/exports.py#L39) have selected categories, limits, a 24-hour archive lifetime, recent-sign-in and session checks, and an unencrypted download. [Deletion](../backend/app/modules/identity/deletion.py#L1) has a seven-day grace period and distinguishes erased personal content from retained de-identified/shared records. Neither path proves deletion from backups or an external provider. The [model context](../backend/app/modules/agents/runtime.py#L526) can include a display name, time zone and selected history/context; "private" does not mean no server/provider processing.

FACT: [registration validation](../backend/app/modules/identity/schemas.py#L32) currently accepts synthetic `.test` email domains, not ordinary public registrations. This is a local development build, not a public pilot ready for real personal data. [Agent run storage](../backend/app/modules/agents/models.py#L90) keeps the request and answer as text and the transcript/state as JSON; those fields are not individually encrypted in this model. Infrastructure encryption, access operations, transcript retention and provider retention must be established separately. A token-only usage ledger does not mean the application retains no conversation content.

Before publishing a policy, complete an owner-reviewed data map:

| Required decision/evidence | Questions the notice must answer |
| --- | --- |
| Operator and jurisdiction | Who operates the service, where, with which support/privacy contact and complaint route? |
| Data categories and purposes | What account, private Space, public, health, device, security and assistant data is processed, and why? |
| Visibility and processors | Who sees each category? Which hosting/model/web/notification providers receive which fields, in which regions? |
| Retention and deletion | What remains in live storage, shared records, logs, backups and processors, for how long, and how is erasure checked? |
| User control | How do access, correction, export, cancellation, withdrawal, deletion and appeals work, including limitations? |
| Children and sensitive use | Which ages/jurisdictions are permitted? What is prohibited before a qualified guardian/health workflow exists? |
| Security and incidents | What can the server decrypt? How are access, recovery, incident response and user notification tested? |
| Operational proof | Who handles requests and abuse reports, with what staffing and realistic response commitments? |

This is a review checklist, **not a published privacy policy, legal advice, compliance certificate or approved retention promise**. Do not expose real personal/health information simply to collect pilot feedback.

### 13.4 A benchmark that measures this product

FACT: [golden scoring](../scripts/agent-golden-score.mjs) checks response patterns, tools, sources, approvals and timing. Its heuristics cannot establish factual accuracy, complete secrecy or successful downstream state by themselves. `npm run golden` without `--live` validates the inventory; it does not execute customer requests or evaluate a model. The later offline verifier run reports 47 cases in 45 conversation threads, after the original 41-case corpus was extended in another session.

PROPOSAL for a versioned, synthetic evaluation protocol, not a reported score:

| Layer | Measure | Failure rule |
| --- | --- | --- |
| Authorization/consent | Cross-account/Space access, revoked sessions, disabled agents, public writes, changed approvals, caregiver boundaries | Any unauthorized access or write blocks qualification, regardless of average task score |
| Durable outcomes | Correct task/event/reminder after retry, reconnect, duplicate delivery and cancellation | Assert stored state and exact actor/recipient; do not grade only the answer text |
| Conversation reliability | Run each complete held-out thread five times in fresh, equivalent fixtures | Report single-attempt and all-five-success rates with denominators; never retry away a failed attempt |
| Research/grounding | Claim-level source support, dates, conflicts, unavailable sources, malicious source instructions | Invented sources, unsupported completion and obeying source instructions are explicit failures |
| Inclusion | Reviewed English/Telugu/Hindi, misspellings, ambiguity, time zones, accessibility and manual fallback | Report per-slice outcomes; a high aggregate cannot conceal an excluded group |
| Operations | Completion/timeout/cancellation, latency distribution, tokens and monetary cost per successful job | Predeclare time, call and cost budgets; no live run without specific provider approval |

Pin repository commit plus dirty-source evidence, case/grader version, model/deployment, prompt/tool versions, locale/time zone and fixture seed. Separate development cases from held-out cases. Use deterministic state assertions and blinded human review for grounding; an LLM judge is supplementary and its cost/errors must be reported. Track `pass^5` as the fraction of eligible threads completing all five observed attempts; report incomplete/blocked attempts separately and do not inflate the denominator with easy duplicates. Five repeats are not statistical proof of production safety.

SWE-bench-style coding results address development tasks, not family coordination or product adoption. Web/desktop benchmark scores do not authorize purchases, medical actions or disclosure of private records. External benchmark comparisons are meaningful only with matching versions and conditions.

## 14. Bounded working mode

FACT: [the work-cycle supervisor](../scripts/work-cycle.mjs) wraps the existing [verifier](../scripts/verify.mjs). It is deterministic verification automation, **not an autonomous coding agent**. It does not select features, change source, contact customers, enable in-app auto-approval, grant external access or keep Copilot active after a conversation ends.

From the project directory:

```sh
npm run test:work-cycle
npm run work:cycle
npm run work:cycle -- --cycles 3 --minutes 20 --suite tokens,golden,typecheck,client
npm run work:cycle -- --watch --cycles 10 --minutes 120 --suite tokens,golden,typecheck,client
npm run work:cycle -- --status
npm run work:cycle -- --stop
npm run work:cycle -- --help
```

- Default: one pass, 15 minutes total; maximum explicit limits: 10 cycles and 120 minutes. Additional passing cycles are only for a deliberate repeatability experiment, not a claim of new engineering progress.
- `--watch` checks once and then waits for a source edit or new commit before subsequent cycles. Waiting is reported as `waiting_for_change`, not as active implementation; the same cycle/time, stop and evidence rules apply. It does not select or repair features.
- Allowlist: `runner,tokens,golden,typecheck,client,unit`. Live/model, database/container, Android, device, structure/records and arbitrary command options are unavailable through this wrapper. The existing verifier remains available separately for explicitly scoped broader checks.
- Runs one child verifier at a time. An exclusive lock prevents a second supervisor from overlapping it; it does not lock out editors or other independent test commands.
- Stops on the first failed/blocked/incomplete result, missing summary, skipped tests, reported source change, signal, stop file or deadline. A changed-source report is not a stable-source pass. No automatic "retry until green" repair occurs.
- Ctrl+C or `--stop` requests a stop. The command creates `.local/work-cycle/STOP` without overwriting an existing marker, preventing subsequent cycles too. `--status` reads the latest report and control-file state without starting work. The supervisor never clears STOP or takes over a stale lock automatically. Review the recorded owner PID before any manual stale-lock cleanup; never kill another session's process.
- Writes separate verifier logs and summaries beneath `.local/work-cycle/`, plus an atomic aggregate `summary.json`. Only a finished `passed` report with exit code zero qualifies the requested profile, not the whole product. Interrupted work retains an unfinished or explicitly stopped report.
- Linux/macOS process groups receive graceful termination followed by forced termination after one second when needed. This is not an OS security sandbox; self-detached processes can escape a process group. Use trusted repository checks only. The allowlist does not make modified dependency/test code network-isolated.
- There is no cron entry, restart policy, daemon, paid provider session, external deployment or new in-app automatic mode. No existing safety budget was increased.

The reusable [product-cycle skill](../.github/skills/product-cycle/SKILL.md) defines the active-session discovery, implementation and verification loop. Status and stop are operator controls, not a way to keep this chat model alive. An explicitly started watcher may remain running only for its configured lifetime; inspect `--status` rather than assuming it is active.

### 14.1 One brief instead of repeated permission prompts

Use this as a working agreement for a finite milestone. Leave genuinely unknown fields marked unknown; the assistant should research them rather than invent facts.

```text
Outcome: <one observable result for a named group and job>
Evidence: <real notes/source dates, clearly separate from hypotheses>
Authority: <approved requirement/decision, or explicitly proposed>
In scope / out of scope: <boundaries and existing changes to preserve>
Data and people: <synthetic or authorized data, who can see/change what>
Acceptance: <happy path, failure path, privacy and accessibility checks>
Budget: <time, tool/model calls, currency cap if applicable; unknown means no new spending>
Allowed actions: <local edits/checks; explicitly named external permissions>
Stop conditions: <completion, unresolved authority, secrets/access, destructive change, resource limit>
Deliverable: <working change, reproducible checks, evidence and next ready task>

Proceed through ready in-scope work without asking after every step.
Before editing, state a falsifiable hypothesis and the cheapest check.
Validate each small change immediately. Preserve failures and other people's edits.
Separate verified facts, external research, assumptions and synthetic reactions.
Never silently expand scope, auto-approve actions, weaken tests or invent customers.
At the milestone boundary, report what is proven, what remains and why.
```

### 14.2 Prompts, skills, hooks and agent roles

| Mechanism | Useful job | Boundary |
| --- | --- | --- |
| Instructions | Stable repository rules and ownership | Missing governing records must be resolved; this research is not a replacement constitution |
| Prompt | One concrete outcome with acceptance and limits | A request to "keep going forever" is not an executable acceptance condition |
| Skill | Reusable research, accessibility or evaluation procedure | Load when relevant; large always-on instructions do not guarantee better results |
| Hook | Deterministic pre/post-tool checks, such as blocking forbidden commands or validating touched files | Advice is not enforcement. No editor hook was installed here; tool schemas and support must be checked first |
| Specialist agent | Independent, bounded research, implementation or review | Give one owner per writable file/area; compare evidence, not how many agents agree |
| Verification loop | Run approved checks and preserve outcomes | The implemented supervisor performs only this role; repairing code requires a separately running authorized coding agent |

Use an independent reviewer or adversarial check for meaningful risks when delegation is authorized. Do not put several agents in the same writable files or treat model-generated personas as a real customer panel. For a future persistent coding worker, first agree on its approved queue, provider/currency limits, isolated workspace, review policy, cancellation, audit logs and recovery. No such service was enabled by this change.

### 14.3 Verification record

Latest operator-control qualification: [cycle 1](../.local/work-cycle/2026-10-07T07-04-06-061Z-iEbH1a/cycle-1/summary.json) passed tokens **10/10**, golden tooling **60/60**, web types and client checks **261/261**, with no skipped tests, evidence errors or reported source changes. The requested second cycle passed its individual checks but detected edits to this report and the changelog, so the [aggregate](../.local/work-cycle/2026-10-07T07-04-06-061Z-iEbH1a/summary.json) remains `changed`, exit one. No failure or source-change outcome was overwritten. A watcher is an optional bounded process, not evidence of additional completed work; `--status` is the source for whether it is currently active.

Control follow-up: the combined supervisor suite now passes **34/34**, including read-only status, persistent stop markers, watch-mode idling/source changes, deadline-boundary handling and subprocess cleanup. The project skill's YAML and local references were validated. The combined golden suite passes **60/60**, including uneven sampling, planned rounds, completely missing cases and duplicate round identities; these validate the evaluator, not model quality.

The real command `npm run work:cycle -- --cycles 2 --minutes 5 --suite tokens,golden,typecheck,client` retained [its report](../.local/work-cycle/2026-10-07T06-50-40-379Z-f4kTsB/summary.json) as `changed`: tokens 10/10, golden 60/60, types and client checks 261/261 passed, but the changelog, global stylesheet, about translations and authentication screen changed during execution. The supervisor correctly stopped after one cycle and released its lock. That result is not relabeled as a stable pass.

The supervisor's [focused tests](../scripts/work-cycle.test.mjs) passed 20/20 after correcting a nested-process test fixture's quoting. Coverage includes invalid/unbounded inputs, allowlist rejection, missing/skipped/changed evidence, exclusive locks, stop files, separate logs, unfinished status, launch failures, cancellation and forced process-group cleanup.

The first real default-profile run preserved [its mixed-source report](../.local/work-cycle/2026-10-07T06-23-27-172Z-MUt3GE/cycle-1/summary.md): tokens 10/10, golden tooling 47/47, web types and client contracts 261/261 passed, but three files changed during the run. The supervisor returned `changed` and nonzero, correctly refusing stable-source qualification. These results do not qualify a live model, Android, production, real user demand or legal compliance.

A subsequent run retained [a genuine golden-suite failure](../.local/work-cycle/2026-10-07T06-35-18-330Z-r7bmEG/cycle-1/summary.md): 57/58 tests passed, with one strict expected-object fixture not yet including the newly added `incomplete` field. Both complete/empty-result assertions now require `incomplete: []`, retaining all existing totals, pass rates and flaky-case checks. The immediate full golden rerun passed 60/60, including two concurrently added saved-plan regressions. Tokens and types also passed in the stopped run; it is not relabeled as a passing cycle.

Final integration command:

```sh
npm run work:cycle -- --cycles 2 --minutes 3 --suite tokens,golden,typecheck
```

The [aggregate result](../.local/work-cycle/2026-10-07T06-38-05-355Z-ZArICI/summary.json) is `passed`, exit zero, with two completed cycles. Each cycle passed tokens 10/10, golden tooling 60/60 and web typechecking, with no skips, evidence errors or reported source changes. The earlier client-contract pass remains separately scoped to its mixed-source run; it was not repeated in this final profile. Local links, changed-file whitespace checks and editor diagnostics passed. These ignored `.local` reports are workspace-local evidence; another checkout must run the documented commands to produce its own reports.

Update 2026-10-07: rank 3 has offline tooling, not a measured live-model score. `npm run golden -- --live --repeat 3` reports pass^3, and designed cases cover Hindi, Telugu and Hinglish requests, injected instructions, a double-dose question and a private-messages request. Current inventory validation reports **47 requests in 45 threads**; all **60 scorer/CLI tests** pass. Tokens and per-answer time are recorded per live result; currency costs need verified provider pricing. No live run was made for this research.

### 14.4 Completion-boundary and public-page follow-up

The continuation reproduced two supervisor defects with deterministic tests before repair: a stop file arriving when the final verifier returned could be missed, and a signal could stop the overall run while leaving its final cycle marked passed. The [supervisor](../scripts/work-cycle.mjs) now rechecks stop requests and elapsed monotonic time before accepting the child result. Three additional clock-controlled checks cover completion at 59,999, 60,000 and 60,001 ms against a one-minute deadline, including when a timer callback has not yet run. The combined current supervisor suite passes **34/34**, including existing watch/status controls; no safety limit was relaxed.

The [public-page browser tests](../tests/unit/about-ui.test.mjs) now cover start/privacy/terms in English, Telugu and Hindi at 320 px with normal and doubled text. The matrix preserves draft labels, the English language annotation on legal bodies, tap targets, no overflow, and no authenticated API requirement. The affected scope passed **26/26**, with no failures/skips, and web typechecking passed:

```sh
npm run test:work-cycle
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 tests/unit/about-ui.test.mjs tests/unit/home-ui.test.mjs tests/unit/privacy-ui.test.mjs
npm --prefix web run typecheck
```

All commands run from the application repository, not its parent workspace folder. Two initial browser commands failed setup because the shared terminal had changed directory; they were corrected without installing dependencies or changing product assertions. The earlier terminal-reported document/evidence assertion also passed unchanged when reproduced; it did not require altering saved evidence.

The already-running local preview at `http://127.0.0.1:3000` passed **6/6 signed-out browser checks**: `/`, `/privacy` and `/terms` at 1280 px and at 320 px with 200% text. Each returned HTTP 200 with the expected heading, no page errors, no attempted nonlocal requests and no horizontal overflow. Legal pages retained their visible "Draft for review ... not in force" notice and English article annotation. See the [structured results](../.local/verify/trust-pages-2026-10-07T07-02-39-631Z/results.json), [desktop privacy screenshot](../.local/verify/trust-pages-2026-10-07T07-02-39-631Z/privacy-1280.png) and [mobile privacy screenshot](../.local/verify/trust-pages-2026-10-07T07-02-39-631Z/privacy-320.png); screenshots for all six checks are in the same local folder.

These are scoped tests in a shared, changing worktree, not a frozen release, full accessibility audit, legal approval or real-customer study. No new policy decision, age gate, deployment, provider spending or persistent coding service was introduced. Operator details, processor/retention contracts, jurisdiction-specific review and authorized research recruitment remain separate decisions.

### 14.5 Registration metadata and localized visitor follow-up

The next continuation found that the authentication screen requested the timezone list in every mode, although only registration uses it. Two new Telugu/Hindi checks passed their notice/layout assertions but failed because sign-in made that unused API call. The effect now returns immediately outside registration and includes the mode in its dependencies; registration still loads and retries the list with abort cleanup. The existing synthetic password-recovery journey also now asserts that no timezone request occurs. This removes an unnecessary read; it does not change authentication, account recovery, the age notice or server-side permissions.

The affected about, identity and localized-account browser suites passed **43/43**, zero failures/skips, and web typechecking passed:

```sh
COMMUNITY_CHROMIUM_PATH=<installed-chromium> node --test --test-concurrency=1 tests/unit/about-ui.test.mjs tests/unit/identity-ui.test.mjs tests/unit/i18n-account-ui.test.mjs
npm --prefix web run typecheck
```

Existing checks for failed timezone-list loading, retries, intentional timezone choices, recovery proof validation, retry identity and mixed-script content remain intact. The new notice checks cover Telugu and Hindi at 320 px and doubled text, localized policy-link labels and 44 px targets. Script/layout assertions do not replace native-speaker review.

The initial `/login` probe timed out while an older Next dev process was present. That process exited during investigation; a different existing process subsequently served `/login`, `/register` and `/recover` with HTTP 200. This session did not start, stop or reconfigure either server, and did not establish the original stall's root cause. The preview recovery must not be attributed to the client-side timezone change.

Three subsequent read-only browser journeys passed on `http://127.0.0.1:3000`, one each in English, Telugu and Hindi. Each followed the start page to registration, opened the privacy and terms drafts from the form and returned, then visited sign-in and recovery. The locale persisted; legal bodies remained marked English with a visible localized draft notice. Registration fit 320 px with 200% text, and sign-in/recovery made **zero API requests** before submission. Nonlocal and non-GET/HEAD browser requests were blocked, with none attempted; no account or recovery request was submitted to the real backend.

The [structured results](../.local/verify/visitor-trust-2026-10-07T07-21-33-326Z/results.json) include unchanged SHA-256 snapshots for the five watched source files and the three screenshots. [Telugu](../.local/verify/visitor-trust-2026-10-07T07-21-33-326Z/register-te-320.png) and [Hindi](../.local/verify/visitor-trust-2026-10-07T07-21-33-326Z/register-hi-320.png) screenshots retain the actual doubled-text rendering. This is not a whole-repository freeze, complete accessibility audit, translation approval, live-model score or production qualification. Draft legal status and the outstanding operator, retention, age/guardian and rollout decisions are unchanged.

## 15. Primary-source challenge and operational follow-through

### 15.1 What was checked, and what was rejected

RESEARCH, retrieved 2026-10-07. Search summaries are discovery aids, not evidence. One returned placeholder review URLs and unsupported quotations; another denied that India's 2025 rules were notified. Neither was used as evidence. Some WHO/Meta/AARP URLs returned 403/404 or unusable content. A blocked URL does not establish that a feature or study does not exist.

| Directly checked source | Supported finding | Product implication, not proof of demand |
| --- | --- | --- |
| [WHO social-connection report overview](https://www.who.int/groups/commission-on-social-connection/report) | Social isolation/loneliness are significant problems requiring varied responses | A coordination app is one hypothesis, not a treatment or a proven solution to loneliness |
| [IAMAI/Kantar Internet in India 2024](https://www.iamai.in/sites/default/files/research/Kantar_%20IAMAI%20report_2024_.pdf), PDF pages 4-5, 13, 21, 24-25 | Reports 886M active internet users, about 55% rural; 57% **of urban internet users** prefer Indic-language content. Active means used in the previous month. Methodology describes household CAPI multistage sampling and Census-2011-based projections | Test language, connectivity and shared-device constraints. These estimates are neither our market size nor evidence anyone wants this product; do not generalize the 57% to all Indians |
| [W3C older-user guidance](https://www.w3.org/WAI/older-users/) | Accessibility needs overlap across disability and age; existing standards address many older-user needs | Vary vision, dexterity, confidence, language and connectivity rather than stereotyping a generation; test assistive technology and involve real participants |
| [Pew data privacy, 2023](https://www.pewresearch.org/internet/2023/10/18/how-americans-view-data-privacy/) | Survey of 5,101 U.S. adults, May 15-21, 2023: 67% understood little/nothing about company data use, 73% felt little/no control | Explain processing and reversal at the moment of action. U.S. attitudes in 2023 are not Indian adoption estimates |
| [Cozi feature overview](https://www.cozi.com/feature-overview/) and [TimeTree official site](https://timetreeapp.com/intl/en) | Existing vendors already offer family coordination/shared-calendar capabilities; TimeTree advertises premium calendar options | "All-in-one calendar plus AI" is not a demonstrated advantage. Compare the same real job, migration effort, privacy comprehension and reliability |
| [MeitY Gazette, G.S.R. 846(E)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), PDF pages 24-25 | Rules were notified in November 2025 with phased commencement; Rule 4 concerns Consent Managers | Use the [verified timetable and caveats](PRIVACY_READINESS.md#india-legal-source-checkpoint), not an unverified "all rules apply now" claim |
| [Anthropic: effective agents](https://www.anthropic.com/engineering/building-effective-agents) and [agent evaluations](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Distinguish workflows from agents; assess the final environment state, not a claim of completion | Start with controlled loops, objective graders and recovery. Vendor guidance is not proof that all companies work the same way |
| [SWE-bench documentation](https://www.swebench.com/SWE-bench/) | Codebase/issue-to-patch evaluation; Verified introduced 500 engineer-confirmed solvable problems | Useful engineering research, not a measure of family coordination, trust or user satisfaction |
| [Current tau repository](https://github.com/sierra-research/tau2-bench) | Policy/tool/user simulations; the repository now calls the suite tau3 and warns that some grading versions are not comparable | Pin task, model, prompt, harness and grader versions; retain missing trials. Simulated users remain simulated |
| [WebArena](https://github.com/web-arena-x/webarena) | A controlled, self-hostable browser-task environment | Use isolated synthetic browser journeys before external automation; a score does not authorize actions on real sites |
| [METR time horizons](https://metr.org/time-horizons/) | Human-expert task duration at a given predicted success probability on a particular task distribution, not unattended runtime | A two-hour horizon is not a promise of two hours of safe, general autonomous product work |

The IAMAI report was consulted for facts and methodology; no images or full report text are redistributed here.
Retrieved SHA-256: `deb49481bce362558793ca14473845e5e15a46d399994da4417f6cfc7a73f3de`.
Changing vendor prices and marketing claims were not used to calculate a market forecast.

The three comments in 13.1 were rechecked through their public item endpoints: synchronization, longevity and context-boundary concerns are supported. They are two replies in a smart-appliance discussion plus one Agent-context discussion, **not three customers of this application**. Author names were not retained in this report; points were null and views were absent. Healthcare/minor-related search hits were not turned into user profiles.

A later fresh anonymous browser attempt to view the first Hacker News discussion returned HTTP 429.
It was stopped without retrying around the limit, signing in or posting. The discussion evidence above comes from
the earlier successful public API retrieval, not a claim that the browser visit succeeded. Local product-page browser checks are a separate result.

### 15.2 Make the first useful promise small enough to prove

PROPOSAL: first help two or more consenting adults coordinate a recurring household plan in a language the team can review competently.

Test: **"We know who owns the next step, what changed, and whether the other person accepted the reminder."**
Do not promise to replace every app, improve health, verify every public community, or make error-free AI.

The complete journey is invitation -> acceptance -> assigned task/event -> recipient-reviewed reminder -> change/cancellation -> clear result.
Manual controls must work without a model. The Agent should shorten this journey without guessing a recipient, crossing a Space boundary,
publishing a private plan, or claiming delivery/acknowledgement that did not happen.

Reasons to reject the direction: no recurring pain; existing chat/calendar tools already work; the second participant will not join;
reminders are less reliable than the existing workflow; or checking the assistant costs more effort than doing the task manually.
More features, tokens or favorable synthetic comments would not refute those findings.

### 15.3 Research-ready kit, without fake customers

The 14 personas above are **synthetic risk probes**, not interviews, independent votes or demand estimates.
Do not rank features by how many invented personas request them. Pair suggestions with disconfirming observations:

| Simulated criticism | What it really gives us | Cheapest next observation |
| --- | --- | --- |
| "I will not type an account ID" | Invitation-friction hypothesis | Observe organizer and recipient using the present flow; count assistance/abandonment before designing a new identity mechanism |
| "There are too many sections" | Comprehension hypothesis, not a fact about all older adults | Ask people with different digital confidence to find their next responsibility without coaching |
| "Will everyone see this?" | Visibility-comprehension hypothesis | Before acting, have participants predict the audience and reversibility; compare with actual behavior |
| "Where did that answer come from?" | Evidence/verification burden hypothesis | Check the source and compare with a manual workflow; record unsupported claims and correction effort |
| "Will my reminder arrive?" | Delivery-expectation hypothesis | Exercise accepted, declined, offline, expired and cancelled cases; distinguish scheduled/delivered/read/acknowledged |
| "I already have a shared calendar" | A strong alternative, not resistance to overcome | Let participants keep current tools; measure whether this job is easier without forced migration |

**Recruitment draft, not sent:** "We are testing a prototype for shared household planning. We are not selling anything or asking for medical or financial details. Would you consent to a 30-minute session using fictional tasks? You may stop at any time. Recording is optional; we will explain retention and deletion before you decide."

**Interview before demo (10 minutes):** ask about the last concrete coordination failure, who was involved, the workaround,
frequency, cost/effort, and what worked well. Do not lead with "Would you use our AI?"

**Observed tasks (15 minutes):** join a synthetic Space; find a responsibility; predict visibility; accept/decline a reminder;
correct/cancel it; locate data controls. Counterbalance manual and Agent-assisted order if comparing them.
Use fake names and harmless plans, not real medicine schedules. Ask permission before recording and agree on note retention.

**Debrief (5 minutes):** "What was confusing?", "What would make you stop?", "Which current tool is better for this job?",
"What did you think the assistant could see?", and "What should we remove?"

Record context/cohort, task, attempted action, observed outcome, assistance count, time, participant explanation and evidence link.
Keep researcher interpretation separate. Never fill missing observations with AI guesses.
Recruitment, consent, operator/contact and safe pilot hosting remain unresolved; no real participants were contacted here.

### 15.4 Proposed product and Agent acceptance gates

These are design targets, **not achieved customer metrics**:

- Start with 5-8 adults for qualitative problems, not population estimates. Include organizers and recipients, different languages/confidence,
  low-end devices, keyboard/screen-reader users and at least one older confident user.
- Require no unexpected audience disclosure, unapproved mutation or lost cancellation in the pre-pilot set.
  Zero failures in a finite sample is not proof of zero real-world risk.
- Candidate usability target: 8/10 core tasks completed unaided; report actual counts and every failure.
  Repeated invitation/visibility problems justify simplification before photos, shopping or more agents.
- In an approved four-week pilot, measure **group-level completed shared jobs** and second-participant return, not feed views or session duration.
  Proposed activation: two adults join and complete one handoff; retention: another shared job in a later week.
  There is no pilot data, willingness-to-pay finding or justified "1% success chance" here.
- Agent evaluation should inspect final task/event/reminder state through public APIs, duplicate effects after retries, permission boundaries,
  source support, human corrections, latency percentiles and measured provider usage.
- Pin and repeat the same cases. Distinguish pass-at-least-once from pass-every-time; retain missing/interrupted trials in the planned denominator.
  Hold out some scenarios and language variants from prompt tuning.
- Report median/p95 latency and costs only from recorded runs. Tokens are not currency without a verified tariff.
  The 47-request/45-thread inventory and 60 tooling tests do not constitute a live-model accuracy score.

### 15.5 A continuous workflow that remains honest

Use the brief in 14.1 once per milestone; the coding assistant can proceed through ready work during its active session:

1. Read current authority, source state and evidence for the problem.
2. Define a falsifiable acceptance check before implementation.
3. Assign one writer per file; use specialists only for substantial independent work, not synthetic consensus.
4. Implement a vertical slice; test failure/retry/privacy/accessibility as well as success.
5. Review results against both the user job and repository standards.
6. Record evidence and the next ready item; continue without asking about routine engineering.
7. When only speculative or externally blocked work remains, preserve the queue instead of inventing activity.

**Different autonomy levels:** a watcher runs approved checks; an active coding session repairs code; a persistent coding service needs its own
provider, workspace isolation, review authority, recovery and real resource limits. This change enables the first, not a secret self-restarting employee.

```sh
# Verify once, then recheck changed source instead of wasting compute on an unchanged tree:
npm run work:cycle -- --watch --cycles 10 --minutes 120 --suite tokens,golden,typecheck,client
npm run work:cycle -- --status
npm run work:cycle -- --stop
```

Watch mode checks for source edits/new commits every five seconds after a pass. The caps still apply.
It observes Git-visible file metadata and commits, not ignored dependencies, environment files or external service state;
verify explicitly after changing those. It is not a content-addressed release snapshot.
It stops on failed/incomplete/skipped/changed-during-check evidence, a stop request or deadline; it never retries until green.
`waiting_for_change` means no check is running. A stopped/timed-out watcher does not turn unperformed cycles into passes.
The STOP file is not automatically erased; review it before deliberately resuming.
No editor hook, cron job, deployment, arbitrary command or paid worker is installed by `--watch`.
The allowlist is not a sandbox: repository checks must remain trusted and contain no real-user data.

Suggested future hooks are deterministic: validate task authority before writing, run focused checks afterwards,
and prevent release when required evidence/signoffs are missing. Written instructions are not installed hooks.
Never claim a background team, interview, live benchmark or service exists without a checked process/result.

The [privacy data map and release gates](PRIVACY_READINESS.md) are the next required trust reference.
The draft UI has been corrected to describe opt-in automatic actions, selected exports, shared-record retention,
unencrypted downloads, personal medicine records and unresolved operator/provider/legal questions.

### 15.6 Verified local follow-through, not a customer-study result

- Two draft-copy regressions failed before correction. The public-page and localization checks pass, including English,
  Telugu and Hindi content, 320px/200% text and the English-only legal-body marker. These are automated interface checks,
  not native-language approval, a legal review or a usability study with real people.
- The integrated workflow/verifier test run passed **58/58**; the public-page/i18n run passed **31/31**; web typechecking passed.
  Five initial watch cases failed before implementation; further cases cover persistent stop while idle and exact deadlines.
- A real browser opened `/`, `/privacy` and `/terms` on `http://127.0.0.1:3000`: each returned HTTP 200,
  the draft/auto-approve limitations were visible, no browser errors occurred, and the layouts fit 320px.
- A real two-cycle watcher completed its first selected profile and reached `waiting_for_change`, with an active lock,
  no finish time and no invented success for the next cycle. Its output lives under `.local/work-cycle/`.
- That watcher woke for a source change, ran the second profile, and returned `changed`/exit 1 when another session edited
  `README.md` during verification. Both profiles passed tokens 10/10, golden tooling 60/60 and types, but the second was
  correctly not labelled stable. The [aggregate report](../.local/work-cycle/2026-10-07T06-56-54-610Z-xE3uWF/summary.json)
  preserves the distinction rather than rewriting the attempt as a success.
- Actual current benchmark fixture/scorer checks passed **60/60**, and offline inventory validation reports 47 requests in 45 threads.
  No live provider accuracy, measured customer preference, cohort retention or revenue result is claimed.
- A longer watcher attempt also returned `changed` rather than a false all-clear while independent work continued.
  The [retained report](../.local/work-cycle/2026-10-07T07-02-12-461Z-wD1IPW/summary.json) records that boundary.
  The loop refuses a second active owner; no other session's lock was removed or process killed to obtain a passing run.

## 16. Outcome evidence, not convincing answers

### 16.1 Fresh source checks

RESEARCH: six public primary-source URLs returned HTTP 200 on 2026-10-07. Dates, response hashes and short source excerpts are retained in
`.local/research-outcomes-20261007/primary-sources.json` and `tau-paper.json`. Only public pages were requested: no account, private profile,
social-media post, participant contact or model provider was used. These checks corroborate earlier research; they are not new customer observations.

| Source checked directly | What it supports | What it does not establish |
| --- | --- | --- |
| [W3C older-user guidance](https://www.w3.org/WAI/older-users/) | Changes in vision and dexterity can affect reading and accurate interaction; accessibility needs overlap across age and disability | A single interface preference shared by an entire generation, or that this app has passed a real-user accessibility study |
| [WCAG 2.2 target-size explanation](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | The minimum criterion is 24 by 24 CSS pixels, with specified exceptions including spacing | That every 24px control is comfortable, or that the product should reduce its existing larger touch targets; keep actual keyboard, reflow and assistive-technology checks |
| [Cozi feature overview](https://www.cozi.com/feature-overview/) | The vendor already offers a shared family calendar, reminders and lists | Independent satisfaction, unmet demand, or an advantage for our calendar merely because it also has an assistant |
| [Original tau-bench paper](https://arxiv.org/abs/2406.12045) and [original repository README](https://raw.githubusercontent.com/sierra-research/tau-bench/main/README.md) | The paper compares end-of-conversation database state with annotated goals and measures repeated-trial reliability; the README separately reports repeated-run scores | That this product's trace checks are equivalent to database-state grading, or that old leaderboard results predict current household-task performance |
| [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework) | A voluntary framework for incorporating trustworthiness into AI design, use and evaluation | Legal certification, an approved privacy policy, or permission to process real customer data |

No fresh likes, views or representative social-media preference counts were collected. The earlier forum evidence and its 429 access limit
remain separately described in section 15.1; no alternate access route was used to evade that limit. Unknown engagement data stays unknown.

### 16.2 One decision-grade product experiment

PROPOSAL, not a new feature approval or a completed customer study: use the adult household-coordination job already proposed in 15.2.
One organizer and one recipient should agree on a task, understand its audience, accept or decline a reminder, and recover from a changed plan.
Measure the existing manual interface before adding more automation. Compare with the participants' current chat/calendar workaround, not an invented weak competitor.

| Synthetic challenge, not a participant quote | Observation that would change our decision | Engineering or product response |
| --- | --- | --- |
| An organizer says maintaining another calendar is double work | The second person does not join, or the same job takes more steps/assistance than their current workaround | Simplify the proven bottleneck before adding photos, more Agents or a larger feature inventory; a new invitation mechanism still needs its own identity/privacy decision |
| An older recipient prefers large text but is otherwise digitally confident | The person cannot find or activate the next action at their normal settings, with keyboard or assistive technology where relevant | Fix reproducible accessibility defects; do not substitute an age stereotype or an automated screenshot for a real observation |
| A privacy-minded recipient thinks a private Space is invisible to all processors | Their audience/provider prediction differs from the actual configuration and data-use explanation | Improve the demonstrated comprehension gap; operator identity, retention, provider contracts and notice approval remain release decisions |

Use the consented, fictional-data protocol in 15.3 when the owner has resolved recruitment and privacy-readiness prerequisites.
Record unaided completion, assistance, elapsed time, corrections and mistaken audience/delivery predictions separately from opinions.
An 8/10 completion target remains a proposal, not a result or population estimate. No success probability, willingness-to-pay finding or all-generations claim follows from the synthetic panel.

### 16.3 Implemented evaluation correction

FACT: the golden harness does not approve proposed actions. Its scorer previously checked unexpected approval requests but could pass an
answer-only or proposal-only result containing a recorded successful write. Two new regressions reproduced those false passes before repair.

The scorer now fails `no executed writes` when a tool record has `effect: "write"` and `status: "succeeded"`, and names the recorded tools.
The invariant applies even when the proposed action and answer match the expected text. It changes benchmark grading only: no runtime action,
automatic-approval setting, user permission or provider configuration was changed.

Saved-report tests prove that re-scoring invalidates an earlier cached pass and that one write-containing round prevents an all-round pass.
The aggregate `runner,golden` command passes **24/24 verifier tests and 64/64 golden tests**; the inventory still validates **47 requests in 45 threads** offline.
Reports are in `.local/verify/research-outcomes-20261007/`. No live-model quality score was measured.

This remains **recorded evidence**, not a full state oracle. Missing or failed tool records do not prove no side effect occurred.
The next proposed evaluation layer is a before/after check of allowed resource IDs, versions and statuses through public APIs in an owned synthetic
environment, with exact approved changes, duplicate counts, denied access and cancellation checked independently. It needs a fixed fixture and
an explicit action-execution contract; do not enable real approvals or paid evaluations merely to obtain a benchmark score.

## 17. Managed discovery and trust follow-through

### 17.1 Recommendation and decision boundary

PROPOSAL: continue the two-adult, recurring-plan experiment in sections 13.2 and 16.2 before expanding the feature set.
Observe the whole path: create a Space, invite the intended person, accept, assign a task, accept or decline a reminder,
change the plan, and ask both people to identify the current owner and reminder status. Compare with their own existing
chat/calendar workaround. Acceptance is not delivery, and delivery is not acknowledgement.

The next evidence should answer three questions, not generate another fictional satisfaction score:

1. Can people describe a recent coordination failure with a real consequence, before seeing this app? No recurring pain
   or an easy existing workaround weakens the reason to adopt it.
2. Can both people finish without coaching or extra outside steps? Repeated confusion at the same step identifies a
   candidate repair; it does not automatically approve join links, push notifications or another integration.
3. Can each person correctly predict visibility and distinguish pending, declined and accepted reminders? A wrong
   privacy prediction or an invented delivery claim is a reason to stop and repair the demonstrated problem.

SIMULATED challenges, not interviews or testimonials: an organizer resists duplicate entry; an invitee expects a phone
alert that the current workflow does not provide; an older, technically confident adult cannot reach an action at their
normal large-text setting; a participant on an intermittent connection cannot tell whether a write succeeded. These guide
baseline comparison, delayed-change discovery, keyboard/large-text testing and exact-retry/final-state checks respectively.
The connectivity/digital-confidence scenario is an added test-design hypothesis, not a newly recruited participant.

Owner decisions remain: confirm the first audience/job and reviewed study language; identify the accountable operator and
approve research/privacy prerequisites; decide whether to restore or retire missing governing records through the recorded
conflict process. Do not silently restore those files. Existing local defects can still be fixed while those decisions wait.

### 17.2 Public-source browser check

RESEARCH: on 2026-10-07 at approximately 11:19 UTC, a browser with JavaScript disabled retrieved these public documents with
HTTP 200. Only same-host document requests were permitted; no login, outreach, form submission or third-party subresource
request was used. These are vendor/standards sources, not observations of our customers:

- [Google Calendar sharing documentation](https://support.google.com/calendar/answer/37082?hl=en) describes permissioned
  sharing and recipients accepting an emailed calendar link. Compare onboarding effort and visibility comprehension with
  an existing alternative; do not assume private sharing is unique to this product.
- [Cozi's feature overview](https://www.cozi.com/feature-overview/) advertises family calendars, shopping and task lists.
  Feature breadth alone is not a demonstrated reason to switch, and vendor copy is not independent satisfaction evidence.
- [W3C older-user guidance](https://www.w3.org/WAI/older-users/) links keyboard compatibility, contrast, text-to-speech,
  customizable text and understandable content. Evaluate capabilities and context, not stereotypes about generations.

No fresh social engagement counts or real customer feedback were collected. Earlier public-comment evidence and rate-limit
limitations remain in sections 13.1 and 15.1; blocked access was not bypassed. No benchmark ranking or success probability
was inferred from the requested model names.

### 17.3 Implemented and checked in this batch

- A manager review reproduced STOP and deadline expiry during the final reporting callback being persisted as success.
  Both new regressions failed before repair. The supervisor now refreshes STOP and monotonic time before terminal success
  classification; completed child checks remain recorded separately from the stopped/timed-out overall run.
- The Linux/macOS verifier's `runner` suite now includes the supervisor regressions, protected by an exact command test.
  `node --test scripts/verify.test.mjs scripts/work-cycle.test.mjs` passed **60/60**, without skips or cancellation.
- The legal drafts now disclose the existing shared-Space ownership prerequisite, an accepted deletion request's seven-day
  cancellation period, worker processing and retained-copy limits. The current backend denies the request before changing
  account state when shared ownership is unresolved; no backend deletion policy changed.
- With the installed headless Chromium, `node --test --test-concurrency=1 tests/unit/about-ui.test.mjs` passed **20/20**.
  It covers rendered disclosures, three interface languages, 320 px and actual doubled text. Web `typecheck` and editor
  diagnostics passed. The legal body remains an English, unreviewed draft; automated checks are not legal or native-language approval.
- QA's first unmodified `test:client` run reported **135 tests: 122 passed, 13 cancelled, 0 assertion failures**; its same-command
  rerun reported **298/298 passed**. The initial cancellation cause is unresolved and the worktree changed during the session.
  Those attempts are not combined, erased or promoted into a stable whole-product qualification. The retained logs are
  `/tmp/qa-test-client.log` and `/tmp/qa-test-client-2.log` for this environment.
- The subsequent integrated command `npm run verify -- --suite runner,tokens,golden,typecheck,client --output .local/verify/discovery-team-20261007`
  passed runner **60/60**, tokens **10/10**, golden tooling **69/69**, client **298/298** and typechecking. Its
  [saved report](../.local/verify/discovery-team-20261007/summary.md) records metadata changes to the product-cycle skill and
  changelog during execution, so it does not qualify a fixed release state. Golden inventory validation is still offline,
  not evidence that any of the selected development models passed a product benchmark.
- Restored the absent preview at `http://127.0.0.1:3000` using an isolated build label and disabled Next.js telemetry;
  only this launch's temporary TypeScript includes were removed, and the shared config matches its original state.
  [Four real-browser checks](../.local/verify/discovery-team-20261007/preview.json) passed for privacy/terms at 1280 px and
  320 px with doubled text, disclosure content, draft/language markers, keyboard focus and zero external requests.
  Source inputs were unchanged during those checks and the legal source hash matched. Desktop and normal mobile reading
  screenshots were inspected. Tall element captures included the sticky header and are not used as normal-viewport evidence.

These are current-worktree, affected-scope checks, not a frozen release, live-provider benchmark, interview study or deployment.
The existing supervisor remains finite and verification-only. Persistent coding would additionally need an approved queue,
isolated workers, explicit provider/currency limits, review authority and recovery; an unlimited-loop script supplies none of those.

The requested background mode is a bounded watcher, started only when no existing LOCK or STOP blocks it:

```sh
npm run work:cycle -- --watch --cycles 10 --minutes 120 --suite runner,tokens,golden,typecheck,client
npm run work:cycle -- --status
npm run work:cycle -- --stop
```

It can finish earlier on any failure, incomplete evidence, concurrent source change, stop request or deadline. A launch does
not prove it is still running later: check its current status and owner PID. It runs checks after source changes, not feature
implementation, customer interviews or paid model requests; no self-restart hook or indefinite coding service was installed.

## 18. Company operating plan and Space Agent delivery

### 18.1 Team, ownership and working agreement

PROPOSAL: eight core roles at full staffing, not eight people hired by this chat. Budget and hiring authority are unknown.
Begin with seven active roles while Android implementation remains paused under the existing owner instruction; reserve the eighth
position for that phase. Architecture, system design, senior review and debugging are engineering responsibilities, not separate departments.

| Role | Seats | Accountable work and acceptance evidence |
| --- | --- | --- |
| Product/delivery manager | 1 | Maintain the prioritized queue, requirement traceability, dependencies and decision log; keep one accountable owner per task; report completed jobs, risks and blocked work |
| Product designer/research lead | 1 | Observe consented adult workflows, test manual versus assisted completion, accessibility and privacy comprehension; label synthetic feedback and obtain native-language review |
| Senior technical lead/architect | 1 | Own data/permission boundaries, system design, migrations, recovery and technical review; prove contracts and reversible changes |
| Backend/agent engineers | 2 | One owns authorized tools/orchestration/evaluations; one owns domain services, storage and integrations; both provide negative permission and retry tests |
| Web engineer | 1 | Own complete web workflows, error recovery, keyboard access, 320 px/200% text and browser evidence |
| Android engineer | 1, deferred | Native parity and device qualification only when the existing pause is explicitly lifted |
| QA/automation engineer | 1 | Own risk-based test plans, independent defect reproduction, fixed-candidate qualification and regression gates; no skipped checks disguised as passes |

Use fractional security review, privacy/legal counsel, SRE/operations and Telugu/Hindi reviewers. Name a support/moderation owner before
any real-user pilot. A dedicated engineering manager is not initially necessary: the delivery manager coordinates execution and the lead
owns engineering quality. Reassess that split if there are multiple independent teams or operational load grows. These are staffing
recommendations, not salary estimates, promised delivery dates or a claim that AI replaces qualified specialists.

The manager can split outcomes into testable tasks, assign one writer per file, limit parallel work, track dependencies, organize reviews,
verify evidence and escalate material choices. They cannot invent customer demand, accept legal risk for the owner, change money limits,
approve their own sensitive action, or declare a release from a unit-test count. Weekly reporting should show the user job, before/after
behavior, qualification scope, escaped defects and next dependency. Customer support, abuse response, backups and incident ownership are
part of the product, not work left until after launch.

This session used bounded AI research and read-only review delegates. They are not employees, persistent services or independent customers.
The implementation and verification remained with one writer. Continue the finite-milestone workflow in section 14; no endless editing
loop, new provider budget, background coding worker, deployment, commit or hiring action was authorized or performed.

### 18.2 Traceability for all 47 requested roadmap items

Source: the owner's explicit implementation request reproduced in [new_features.md](new_features.md), especially sections 14-31.
This confirms the Main/public, current-Space and private-user separation and requests the listed direction. It does not supply missing
provider contracts, financial mandates, operator details, guardian consent or a release decision. Earlier inventory is implementation
evidence, not a fresh whole-product qualification. The historical governance files remain missing and were not silently reconstructed.

| Request IDs | Current evidence / status | Next implementation or acceptance gate |
| --- | --- | --- |
| 1-5: mention routing, Space detection/context, identity, permissions | Existing agent routing and domain authorization; current Main/Space regression suite qualified for this milestone | Keep actor/admission/switch checks at reads, approvals and execution; bindings are not independent permissions |
| 6: private/public boundaries | Main tool allowlist excludes Space budgets; members do not receive others' contribution details or split shares | Any new resource needs domain and field/resource-level access tests; medicine remains personal |
| 7-8: sessions and persistent tasks | Existing account sessions, persisted agent runs, questions, deadlines, cancellation and history | A persistent run is not a general durable workflow engine; provider-safe resumability and scheduler leases remain future work |
| 9-10: approvals and action ledger | Existing exact review and recorded tool/action results; new split plan always asks, including in automatic mode | Preserve approval version, actor, idempotency and atomic outcome; external receipts require external verification |
| 11-13: tasks, reminders, events | Existing Space tools; do not introduce automatic reminders silently | Preserve exact recipients, opt-in times, timezone and changes/cancellation |
| 14: polls | Event-linked manual polls and the separate Space poll screen are implemented. Space Agent reading and explicitly reviewed standalone poll creation are qualified locally; no Agent votes or closes polls | [Agent capability evidence](COMMUNITY_AGENT_PLAN.md#reviewed-space-agent-poll-capability-2026-10-08); the retained runtime now uses migration 0062 and the qualified backend ([activation](../infra/README.md#agent-poll-runtime-activation-2026-10-08)). A model endpoint/name and private credentials remain unconfigured, so conversational activation is blocked. Event and standalone Space contracts remain distinct; provider access was not enabled |
| 15: shared expenses | Implemented in this milestone: authorized budget reading and explicitly reviewed equal/percentage/fixed split plans | No inferred payer, settlement, collection or transfer; see the [delivery record](COMMUNITY_AGENT_PLAN.md#shared-cost-space-agent-delivery-2026-10-07) |
| 16: research | Existing public search/read tools and recorded sources | No live provider evaluation here; require grounded comparisons, unavailable-source handling and injection checks |
| 17: calendar | Existing app calendar and Space events, not connected personal calendar accounts | External calendar access needs an independently granted integration and conflict/revocation semantics |
| 18: notifications | Existing in-app notification/reminder paths | Push/email channel, delivery/acknowledgement semantics and provider approval remain separate |
| 19-22: shopping, food, travel, bookings | Research/planning is not ordering or a reservation; no transaction connector added | Choose lawful provider APIs, account scopes, price/expiry/recipient review, payment handoff, idempotency and verified receipts |
| 23: email/inbox | No external mailbox connector added | Per-user OAuth scopes, minimized retrieval, draft/send separation, exact recipients and attachment review; Space membership grants no inbox access |
| 24-26: subscriptions, refunds, appointments | Task/event planning can record follow-up; no vendor cancellation/refund or appointment connector added | Define authorized provider capabilities and recovery; never promise a cancellation/refund/medical booking based on text alone |
| 27-28: Space/user memory | Requester-owned notes/preferences now support versioned edit, disable/re-enable, read/save/delete; not a shared household knowledge store | Disabled notes are excluded from fresh retrieval, not erased from earlier conversations/providers; shared audiences and sensitive records still need a separate design |
| 29-32: learning, recommendations, comparison, proactivity | Requested; no silent preference learning or monitoring enabled | Opt-in provenance, correction/forget controls, trigger scope, rate limits and evidence of usefulness |
| 33: recurring tasks | Existing recurring reminders do not equal recurring agent authorization | Store a revocable bounded mandate, permitted tools, per-run cap, expiry and explicit forbidden actions |
| 34-39: general/trip/subscription/price/deadline/household monitoring | Not implemented by an on-demand web read or development watcher | Authorized data source, polling/provider cap, stable scheduler, freshness, duplicate suppression and stop/recovery tests |
| 40: Action Center | Dedicated Space-selectable Agent Task Inbox now lists the requester's authorized runs with status filters, pagination and existing review/answer/cancel controls | No access to other members' private requests and no invented Scheduled state; shared activity visibility and durable recurring execution remain separate capabilities |
| 41: approval controls | Existing per-request auto-approve for eligible tools; public pages/publishing/comments and new split plans always ask | New purchases, external sends, cancellations and important shared changes need explicit tool-level policy, not one global bypass |
| 42: receipts | Existing local action records with reviewed fields/result references | Structured external receipt requires verified vendor/reference/amount/status; no fabricated reservation or payment reference |
| 43-45: memory, permission controls, audit | Memory edit/disable controls and private run history are now qualified locally, alongside existing permission/audit controls | See the [memory/inbox record](COMMUNITY_AGENT_PLAN.md#agent-task-inbox-and-memory-controls-2026-10-07); per-integration grants and broader resource policies remain future work |
| 46: explanations | Existing evidence, plan and action summaries | Give decision basis and relevant sources, never pretend to expose hidden reasoning or invent causal evidence |
| 47: safety | Current local privacy, retry, approval, timeout and cancellation checks | Independent security review, legal/operational gates and a pinned release candidate remain mandatory |

Household groceries, inventory, chores, maintenance and family transport coordination are additional domain workflows in the request,
not implemented simply by adding a tool name. Couple/group "we" must resolve to authorized current participants, not everybody's calendar,
location or private preferences. Financial transfers, medical data, identity/security changes and destructive operations have no blanket
authorization in this milestone. MCP is an adapter option, not a permission system; do not install a connector before choosing its provider,
scope, secret storage, revocation and contract tests.

Recommended delivery sequence: finish trusted local coordination and a dedicated run inbox; add polls and explicit household planning;
then introduce one read-only integration at a time before any separately reviewed real-world transaction. Monitor only after bounded,
revocable recurring authorization and dependable recovery exist. This is an implementation sequence, not a promise of dates or a license
to bypass still-unresolved product and external dependencies.

### 18.3 Shared-cost milestone and honest benchmark scope

Implemented user job: "In this Space, show the event's authorized budget and prepare the exact requested sharing plan for review."
The tools reuse existing event visibility, contribution/share privacy and integer allocation. For INR 8,000 equally across three
listed people, the exact shares are INR 2,666.67, INR 2,666.67 and INR 2,666.66. Rounding is visible; no money is created or lost.
Amounts recorded by A/B/C do not prove they personally paid them, so they are not converted into settlement instructions.

Acceptance covers Main/other-Space/history denial, ordinary-member privacy, complete bounded pages, changed-snapshot rejection,
explicit approval even in automatic mode, same-key retry, no effect on rejection, stale spending/removed participants/cancellation,
and atomic rollback of the split with its approval. The browser review preserves every allocation within the existing ten-field
client limit, with measured doubled text, keyboard focus, hit testing and 44 px targets. It remains a private request, not a public post.

Fresh commands, counts and source-snapshot caveats belong to the [delivery record](COMMUNITY_AGENT_PLAN.md#shared-cost-space-agent-delivery-2026-10-07).
These are scripted-model and synthetic API/browser tests, not a live model understanding score or customer feedback. No real social
engagement metrics, interviews, salaries, conversion/retention figures, vendor bookings, payments or legal approval were invented.
The existing research in sections 13-16 remains the source record; it was not relabelled as fresh interviews in this delivery pass.

Before a real-user rollout, resolve the [privacy release gates](PRIVACY_READINESS.md#release-gates-and-decision-owners), audience and support
ownership. Before a live-model benchmark, specify the provider/model, pinned task/grader versions, fixed synthetic fixture, permitted
actions, repeat count, time/token/currency cap and held-out scenarios. Never describe `npm run golden` without `--live` as executing a model.
The bounded supervisor in section 14 already provides status/stop controls; it checks code and does not keep this chat or a coding team alive.
