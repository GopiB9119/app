# Privacy Readiness: Evidence, Not Promises

Reviewed against the local working tree on 2026-10-07. **DRAFT / NOT A COMPLIANCE CERTIFICATE.**
This is a technical data map and release checklist for the owner and qualified legal reviewer.
It is not an approved privacy policy, a legal opinion, or permission to process real personal data.

## What a visitor can see today

- [Public privacy draft](../web/src/app/privacy/page.tsx) and [terms draft](../web/src/app/terms/page.tsx):
  explicitly labelled unreviewed and not in force. Their English body is marked `lang="en"` even when the surrounding interface is translated.
- [Signed-in Privacy controls](../web/src/features/identity/privacy-screen.tsx):
  interests, saved Agent memories, reminder permissions and related activity. These controls are not a substitute for a notice.
- Agent > Memories now supports owner-reviewed edit and disable/re-enable as well as deletion. Disabled memories stay visible to their
  owner but are excluded from fresh memory retrieval. Neither disabling nor deleting erases earlier conversations or provider copies.
- The [Agent task inbox](../web/src/app/app/agent/tasks/page.tsx) shows the requester's own runs within a selected current Space,
  not a shared dashboard of other members' private Agent requests. Status filters do not expand history or admission permissions.
- Reminder-permission scans disclose incomplete results and link to manual pagination instead of presenting a bounded scan
  as an exhaustive empty list. Failed reads and changed permissions invalidate unsubmitted reviews; wrong-target cancellation
  receipts cannot confirm success. The linked Reminders page preserves explicit reconciliation of unconfirmed cancellations.
  [Qualified backend/web evidence and remaining limits](../README.md#privacy-permission-and-reminder-recovery-2026-10-07)
  do not establish a complete consent register, legal approval or a real-user release.
- [Draft wording](../web/src/features/platform/legal-drafts.tsx) now distinguishes private Spaces from public content,
  normal review from opt-in automatic actions, stored encryption from unencrypted downloads, and personal erasure from retained shared records.
- Both drafts explain that an account owning a Space with other members must resolve that ownership before requesting
  deletion. The seven-day cancellation period starts after an accepted request; there is no unconditional immediate-erasure promise.
- [AI data-use details](../web/src/features/agents/provider-notice.tsx) are available in Main Agent even with history,
  before sending a Space-chat `@agent` draft, and in private follow-up reviews. The localized dialog describes configured
  providers and permitted data fields without sending a message, changing settings or discarding the current draft.
  This is an explanation, not recorded legal consent or a completed processor-contract review.

Do not replace a missing operator/contact/retention decision with a plausible name, invented response deadline,
or a claim such as "fully private", "GDPR compliant", "we never share data", or "delete everything".

## Implementation-backed data map

The visibility column describes the intended application boundary, not protection from the server or every configured processor.
Finite tests do not establish complete security coverage. A deployment's hosting, logs, backups and contracts need separate review.

| Data and purpose | Application visibility and processing | Current control / evidence | Unresolved before real rollout |
| --- | --- | --- | --- |
| Email, display name, timezone; registration and account access | Account services; an authorized model context can contain display name and timezone | [Identity schemas](../backend/app/modules/identity/schemas.py), [Agent context](../backend/app/modules/agents/runtime.py) | Operator identity, permitted users/jurisdictions, production email delivery, retention and notices |
| Password and session records; account protection | Server validates credentials and revocable sessions; passwords are hashed, not model inputs | [Identity security](../backend/app/modules/identity/security.py), [session API](../backend/app/modules/identity/api.py) | Key custody, session/log retention, recovery operations and incident ownership |
| Private Space membership, tasks, events, documents and messages | Current account/admission permissions; historical access is not simply "every member sees everything" | [Spaces](../backend/app/modules/spaces), [Agent route definitions](../backend/app/modules/agents/registry.py) | Deployment access review, support/admin access, backup retention and invitation disclosure |
| Standalone Space poll questions, choices and votes | Reads and identifier-only change hints exclude memberships admitted after the poll; current-admission votes contribute counts, and only the requester's own selection is returned | [Poll service](../backend/app/modules/polls/service.py), [rejoin and hint regressions](../backend/tests/test_polls.py); [qualification](../README.md#poll-admission-privacy-2026-10-07) | Reconcile Space/Event contracts, result-visibility and close-authority policy before declaring web delivery; audit/outbox access and retention need separate review |
| Space Agent poll results and creation reviews | Only the current Space's authorized poll data, including totals and the requester's own choice, can enter the configured model context and run history; Main Agent has no poll tools | [Poll tools](../backend/app/modules/agents/toolkit.py) require exact approval for creation even in automatic mode, recheck access and commit with the approval; no voting or poll closure by the Agent | Model/provider notice and retention apply to these permitted results. Poll counts can reveal choices in small groups; do not promise anonymity or infer individual votes |
| Event-linked poll questions, choices and ballots | Event admission rules apply; responses show current-member totals and only the requester's own choice. Individual ballots remain server-side records; aggregate counts in small groups can still reveal choices | [Event polls](../backend/app/modules/events/polls.py), [versioned vote regressions](../backend/tests/test_event_polls.py): owner/organizer management, actor-bound retries and account-erasure cleanup | Not anonymous or end-to-end encrypted. Shared poll text follows existing shared retention; sole-member Space text is redacted, personal ballots and receipts removed on purge. Runtime activation and operational retention review remain separate |
| Event budgets, contribution notes and split plans | A Space Agent can read only the requester's authorized event view; ordinary members receive their own contributions/shares, while the organizer/owner can see all. These permitted results and exact proposed shares can enter the configured model context and stored run history; the Main Agent cannot access them | [Budget permissions](../backend/app/modules/events/budgets.py), [agent tools](../backend/app/modules/agents/toolkit.py). Split plans always need explicit approval and never move money | Treat financial planning notes as personal data; qualify provider disclosure, retention and support access. Recorded amounts are self-reported, not verified payments or debts |
| Medicine instructions and dose notes | Personal care records, not a shared caregiver dashboard | [Care module](../backend/app/modules/care) | No clinical or emergency claim; any future caregiver sharing needs its own authority, consent and revocation design |
| Public pages, published posts, comments and events | Intentionally public within the relevant publishing/access rules | [Community module](../backend/app/modules/community) | Explain publication, copies/redistribution, reporting and practical moderation responsibilities |
| Agent messages, prior context, tool results, approvals and memories | Requester/context checks; Main Agent and Space Agents have different scopes | [Runtime](../backend/app/modules/agents/runtime.py), [toolkit](../backend/app/modules/agents/toolkit.py), [private chat review](../web/src/features/agents/agent-screen.tsx), [data-use explanation](../web/src/features/agents/provider-notice.tsx) | Deployment-specific fields/regions, provider retention/training settings, support access and any legally required consent/notice records |
| Memory edits and future-retrieval setting | Only the memory owner can edit content or change enabled state; ownership and Main/Space scope do not change. Prior transcript/provider copies can remain | [Memory service](../backend/app/modules/agents/service.py), [migration 0059](../backend/migrations/versions/0059_agent_memory_controls.py): version preconditions and digest-only retry receipts; receipts are removed with the memory | Define operational retention and provider erasure separately; do not describe the switch as recalling information already processed |
| Web search words and fetched URLs | TinyFish integration when configured; URLs and queries can themselves reveal sensitive intent | [Web tools](../backend/app/modules/agents/web.py) | Processor contract, region, retention, prohibited inputs and failed-fetch handling; integration code is not proof of activation |
| Video playback | No video frame before Play; an external video provider receives a request once the user chooses playback | [Video source component](../web/src/features/agents/agent-screen.tsx), [offline tests](../tests/unit/agents-ui.test.mjs) | Provider disclosure and regional requirements; origin-only referrers do not mean zero third-party processing |
| Selected-data export | Stored archive encrypted; downloaded file unencrypted; category/history/size and access limits apply | [Export notice and limits](../backend/app/modules/identity/exports.py): 24-hour archive lifetime, bounded history, rechecked access | Verify every intended category; do not promise a complete account mirror; explain securing the downloaded file |
| Account erasure | Shared-Space ownership can block a request; accepted requests have a seven-day cancellation period, then worker-driven deletion and de-identification; some shared records remain | [Deletion operations](../backend/app/modules/identity/deletion.py) | Backups, processor copies, legal holds, operational completion monitoring and notices |
| Security/operational telemetry | Request identifiers, rate-limiting and operational records; deployment logs can add more | [Telemetry](../backend/app/telemetry.py), [configuration](../backend/app/config.py) | Full data inventory, minimization, access and deletion periods. Do not equate "no ad feature" with a verified no-sale contract |

## Assistant authority, in plain language

1. The model proposes; domain services and current permissions determine what can happen.
2. Normally the person sees the exact proposed change and approves or rejects it.
3. A person can enable **auto-approve** for an eligible request. Some actions then run without another confirmation.
4. New public pages, publishing, comments, event cost-sharing plans and Space Agent poll creation retain explicit review requirements.
5. Stop and revocation prevent future eligible work; a completed action or data already sent to a provider cannot be recalled merely by stopping the request.
6. "Private Space" is a sharing scope, **not end-to-end encryption** or a promise of no server/provider processing.

## India legal-source checkpoint

Primary source actually retrieved: MeitY's [Gazette notification G.S.R. 846(E), dated 13 November 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).
PDF page 24 contains Rule 1's timetable; page 25 identifies Rule 4 as registration/obligations of Consent Managers.
Retrieved SHA-256: `eabc7d05e013144615d78ddc0e8b9c9aac1920e814f4fad38ce6560951f5aa08`.

| Rules | Commencement specified by that notification |
| --- | --- |
| 1, 2, 17-21 | Publication date |
| 4 (Consent Managers) | One year after publication |
| 3, 5-16, 22, 23 | Eighteen months after publication |

At the 2026-10-07 research date, the latter two phases are still future under this text.
This is **not** a conclusion that no privacy duties apply now. Counsel must check the Act's separate commencement
notifications, the December 2025 corrigendum, later amendments, other laws, jurisdictions, actual processing and any exceptions.
One search summary incorrectly claimed no rules had been notified; the directly retrieved Gazette disproved that claim.
The full consolidated legal position was not independently certified here.

Do not enable children or collect identity documents just because a draft says "18+".
An unenforced eligibility sentence is not age assurance, guardian consent or a child-safety program.
First recruit adults for consented research using synthetic product records.
Assess GDPR, COPPA or other regimes only where the operator, users, services and jurisdiction make them relevant;
do not assert that all apply or that all exemptions apply.

## Release gates and decision owners

Roles below are responsibilities, not people already hired or agents silently running.

| Gate | Evidence needed | Responsible decision-maker | Current status |
| --- | --- | --- | --- |
| Accountable operator | Legal entity/person, contact, address/jurisdiction, real complaint handling | Product owner + counsel | Unresolved |
| Accurate notice | Approved data map, purposes, sharing, retention, changes and rights; native-language review | Owner + counsel + language reviewers | English draft only; translated interface copy remains machine-drafted |
| Processor control | Hosting/model/search/email/video/notification inventory, signed terms and verified region/settings | Technical lead + owner | Integration code inspected; deployment/contract evidence absent |
| Ages and sensitive use | Permitted audience, minimized age assurance where required, abuse and health boundaries | Owner + counsel | No qualified child/guardian workflow |
| Data exit | Exercise export limits, deletion cancellation/purge, shared retention, backup/provider handling | Engineering + privacy owner | Application tests exist; full operational lifecycle not qualified |
| Independent release checks | Access-control review, restore drill, incident exercise, breach-contact ownership | Technical lead + qualified reviewers | Prior automated checks are not a complete release assessment |
| Real-user pilot | Recruitment consent, de-identified notes, retention period, opt-out, named support | Research lead + owner | No real participants recruited by this work |

**Pilot remains unqualified while these gates are unresolved.** Continue local engineering, synthetic usability tests,
source research and draft refinement; do not silently declare legal approval or deploy real-user processing.

## Public research boundaries

Use permitted public pages or documented APIs. Do not bypass authentication, robots/access controls, rate limits or paywalls.
Keep only the source/date and a brief problem paraphrase where possible; avoid names, contact details,
health disclosures, profiles of minors and copied full comment archives. Record unavailable engagement data as unavailable.
No fake accounts, fabricated testimonials, unsolicited outreach or automated posting were used in this work.
