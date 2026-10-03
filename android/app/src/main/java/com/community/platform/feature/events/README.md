# events

Built: **Events** on the Space screen. It shows upcoming and past lists, details with responses, create and edit forms, cancel confirmation and an exact retry of an unconfirmed create. Only same-day or open-ended events can be edited here; longer events are edited on the web. The cancel question scrolls, so its whole text can be read at 200% text on a 320 dp screen (T93).

An event command cancels an unanswered list read and resumes that same page after the command answers, unless the command starts its own fresh list. Refresh and Show more send nothing while a command is unanswered. A resumed read keeps a refused command's message, and an older read cannot clear a newer read's loading state (T82). These guards also apply with [concurrent authenticated requests](../../../../../../../../../../docs/BUILD_STATUS.md#android-authenticated-request-concurrency).

Evidence: [events checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#space-events-and-rsvp-checkpoint) and [late-response protection](../../../../../../../../../../docs/BUILD_STATUS.md#android-event-late-response-protection). `EventsTest` covers exact retries, capacity, message occurrences, held-request ordering and awaited fixture cleanup. Device tests: `EventsScreenTest` (network off: list and detail states, the cancel confirmation, locked controls while a change is unconfirmed, and 320 dp at 200% text).

Source chapters: 2, 3, 17.

Feature inventory: shared-events, public-events, organizer-workspaces, rsvp, registration-capacity, waitlists, attendance, polls-ballots, budgets, expenses, contributions, cancellation-postponement, event-permissions.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
