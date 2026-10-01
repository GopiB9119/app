# events

Built for local synthetic use: Space events with RSVP (6 operations). Create with `Idempotency-Key`; list upcoming or past events, paged; read one with its responses; edit and cancel with `If-Match`; answer Going, Maybe or Not going.

- A member sees only events created since their current admission.
- The organizer's local date, time and IANA zone are kept, and the exact UTC instant is stored. A local time that does not exist, or happens twice, on that date is refused.
- Refused: events in the past, more than two years ahead or longer than 14 days. Up to 500 events, 100 of them upcoming, per Space.
- A response belongs to the admission and stops counting when the person leaves. A changed time marks earlier responses as needing confirmation. Cancelled or ended events refuse responses and edits.
- Only the organizer (in the same admission) or the Space owner can edit or cancel.

A response states intent; it is not attendance. Fixed on 2026-10-01: [T02 and T04](../../../../docs/TASKS.md#defects-that-break-approved-requirements) ([checkpoint](../../../../docs/BUILD_STATUS.md#history-boundary-and-late-save-fixes-checkpoint)). Evidence: [events checkpoint](../../../../docs/BUILD_STATUS.md#space-events-and-rsvp-checkpoint).

Source chapters: 2, 3, 17.

Feature inventory: shared-events, public-events, organizer-workspaces, rsvp, registration-capacity, waitlists, attendance, polls-ballots, budgets, expenses, contributions, cancellation-postponement, event-permissions.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
