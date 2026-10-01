# platform

Built on the web: the main navigation and Home ([DEC-014](../../../../docs/DECISIONS.md#accepted-decisions), [T38](../../../../docs/TASKS.md#design-and-experience)).

- `navigation.tsx`: the five main sections, Home, Spaces, Messages, Discover and Profile, in that order, each with an icon and a visible label. Every signed-in page shows them under the header as a bar, and at 1200 px and wider as a column at the side. `mainSections` lists which paths belong to each section, so the current one is marked: calendar, medicines and reminders belong to Home; tasks, events and documents to Spaces; the feed, page and post search, your pages and public pages and posts to Discover; the account and Blocked to Profile. The styles are in `globals.css` (`.main-nav`, `.app-frame`), because every page's header uses them.
- `home-screen.tsx` at `/app`: the personal overview. Four sections load and fail on their own, each with View all: Needs attention (Space invitations, join requests to the public groups you own, reminder requests sent to you, and reminders you have not acknowledged), Today (tasks due, reminders and events today in your timezone, from each Space's calendar), Your Spaces, and From pages you follow. A failed source shows its own message and Retry; the rest stay. Calendar and Medicines open from here. Home shows only what the screen behind each View all already shows.

Not built here yet: the Android bottom bar and Home (T38, after T35). Sign-in still opens the account page.

Tests: `tests/unit/home-ui.test.mjs`. Evidence: [checkpoint](../../../../docs/BUILD_STATUS.md#home-and-main-navigation-checkpoint).

Source chapters: 6, 7, 8, 9, 10, 11.

Feature inventory: database-migrations, api-contracts, state-machines, authorization, audit, transactional-outbox, durable-jobs, worker-recovery, observability, rate-limits, feature-gates, backup-restore, deployment, design-system, accessibility, localization, client-offline-state.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json).
