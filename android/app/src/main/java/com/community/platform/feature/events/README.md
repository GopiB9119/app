# events

Built: **Events** on the Space screen. It shows upcoming and past lists, details with responses, create and edit forms, cancel confirmation and an exact retry of an unconfirmed create. Only same-day or open-ended events can be edited here; longer events are edited on the web. The cancel question scrolls, so its whole text can be read at 200% text on a 320 dp screen (T93).

Evidence: [events checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#space-events-and-rsvp-checkpoint) (`EventsTest`, 11 JVM tests). Device tests: `EventsScreenTest` (network off: list and detail states, the cancel confirmation, locked controls while a change is unconfirmed, and 320 dp at 200% text).

Source chapters: 2, 3, 17.

Feature inventory: shared-events, public-events, organizer-workspaces, rsvp, registration-capacity, waitlists, attendance, polls-ballots, budgets, expenses, contributions, cancellation-postponement, event-permissions.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
