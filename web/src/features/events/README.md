# events

Built: `/app/events?space_id=`, opened with **Events for** a Space on the Spaces page. It shows upcoming and past lists, event details with responses, a create and edit form with a time-zone choice, cancel confirmation, and an exact retry of an unconfirmed create. Times show in the event's zone, and also in yours when it differs.

Evidence: [events checkpoint](../../../../docs/BUILD_STATUS.md#space-events-and-rsvp-checkpoint).

## Workflow Improvements

The 2026-10-02 [T121/T123 checkpoint](../../../../docs/BUILD_STATUS.md#web-event-workflow-improvements-checkpoint) adds:

- Draft-discard confirmation for create and edit: close, Space/event/view changes and same-window links. Active saves disable those exits; reload warns. Unconfirmed creates retain the original body/key after a canceled exit.
- The opened edit and its version survive transient detail-refresh failures; a denied read hides the editor. No silent overwrite of a newer version.
- Refresh keeps the selected Space when the list order changes; if it disappears from the list, another Space must be chosen explicitly and starts with an empty form.
- Real-calendar validation and API-aligned code-point limits (title 120, location 200, details 2,000), character counters, linked field errors and focus after a refused save unlocks.
- App-language dates and ranges, explicit viewer timezone when different, and no redundant second time for equivalent zone aliases.
- Outdated-response marks directly in the list, Refresh, and event targets sized from the design tokens.

Use the VS Code **Community Platform: verify web event clarity** task for the 28 client/screen checks and **Community Platform: verify live events** for the two synthetic local journeys. The latter requires the existing web preview at http://127.0.0.1:3000 and local backend/mail services. These tasks do not start or reset the backend. Both passed at the checkpoint; reports live under `.local/`.

Limitations: drafts and pending keys are page-memory state, not persistent drafts. Forced reload, browser process loss and history Back/Forward navigation are not covered by the discard guard. Native date controls can scroll their values at large text sizes. Telugu/Hindi strings are machine drafts. Android parity for these particular improvements was not built in this batch; another session owns its current event work.

## Recommended Next Features

These are prioritized recommendations from the existing workflow and [Chapter 17 contract](../../../../docs/CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md), not approvals or completed features. Keep the current private Space event model; none requires replacing the event service or inventing a second calendar backend.

| Priority | Improvement and value | Existing coverage / boundary before implementation |
| --- | --- | --- |
| 1 | Find and reopen a particular event: private direct links, search and date/response filters | The page currently accepts only `space_id`; selected event state is not in the URL. Existing authorized Space search already includes events, so reuse it where appropriate. Links must recheck access; a filter over just the loaded page must not claim to search every event |
| 2 | Qualify calendar and personal reminders end to end | Alert controls and calendar-related code already exist, while T23 is still Blocked and X2 records unconfirmed work. Resolve that authority gap, then verify reschedule, cancellation, membership loss and delivery. Do not duplicate existing controls or automatically opt anyone into reminders |
| 3 | All-day and recurring events | All-day means calendar dates, not midnight UTC. Recurrence needs stable occurrence IDs, end conditions, clock-change handling and explicit one-occurrence/future/all-series edit rules, using a maintained temporal library; it cannot be added as a client-only repeat checkbox. C17-D04 and the scheduling decisions govern |
| 4 | Clearer participation and change history | Current records already mark outdated replies, but no full event revision history or confirmed-versus-outdated attendance summary is exposed. Decide which edits require renewed RSVP and which members may see histories; an RSVP stays intent, never a check-in |
| 5 | Event-linked tasks, documents and discussion | Reuse existing Space/task/file/conversation permissions and history. Linking something must not grant access to its private content; no automatic new event membership or cross-Space copies |
| 6 | Invitations, co-organizers, capacity and waitlists | C17-D03/D10 require role, audience, guest-count and location-visibility decisions. Capacity must be enforced atomically on the server, including concurrent last-slot requests. A forwarded link must not become an invitation or a public roster |
| 7 | Polls to agree on a date | C17-D06 needs ballot/result visibility, close/change/tie rules and who can confirm the winning time. A poll result is a proposal, not permission to reschedule or notify everyone |
| 8 | Calendar file export and provider sync | A local calendar file is different from Google/Outlook synchronization. Specify fields, timezones, cancellation/updates and privacy first; provider access and external sends remain blocked by DEC-005 |

Durable drafts should be considered alongside priorities 1-3, with explicit account isolation, expiry, private-data storage and sign-out cleanup. Budgets, expenses, payments, public discovery and external invitations belong after those core workflows and their permission/consent decisions, not in this form-improvement batch.

Source chapters: 2, 3, 17.

Feature inventory: shared-events, public-events, organizer-workspaces, rsvp, registration-capacity, waitlists, attendance, polls-ballots, budgets, expenses, contributions, cancellation-postponement, event-permissions.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
