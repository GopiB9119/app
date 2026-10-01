# platform

Shared parts of the Android app that belong to no single feature: Home and the main sections ([DEC-014](../../../../../../../../../../docs/DECISIONS.md#accepted-decisions), [T38](../../../../../../../../../../docs/TASKS.md#design-and-experience)). The web keeps the same parts in [web/src/features/platform](../../../../../../../../../../web/src/features/platform/README.md).

- `MainNavigation.kt`: the five main sections, Home, Spaces, Messages, Discover and Profile, in the same order and with the same names as on the web, as a bottom bar with visible labels. `mainBar()` decides where the bar shows: on the five top-level screens, hidden while one Space or one chat is open (their own back button leads out), and disabled while leaving would lose an unconfirmed or unsaved Space change or while a community change is being sent. At large text sizes a label is drawn just small enough to fit on one line. The people, chat and compass icons are drawn here because the core icon set has none.
- `HomeViewModel.kt`: Home's sections, each loading and failing on its own, with its own Retry: Needs attention (Space invitations, join requests for groups you own or administer, reminder requests sent to you, reminders you have not acknowledged), Today (each Space's calendar for today in your timezone, without finished or cancelled items), Your Spaces, and From pages you follow. A lost sign-in ends Home instead. `HomeRepository` reads everything through the existing Space, group, reminder, calendar and community repositories, so Home shows only what the screen behind each "View all" shows.
- `HomeScreen.kt`: the overview, with search, the bell with its unread count, Calendar and Medicines.

`MainActivity` shows the bar and opens each screen. Back from Home, Spaces, Messages and Discover returns to Profile, where the app opens after sign-in; screens opened from Home return to Home.

Tests: `HomeTest` (JVM), `HomeScreenTest` (device, including 320 dp with 200% text) and the live journey `AccountJourneyTest#nativeHomeShowsWhatNeedsAttentionAndTodayFromTheRealBackend`. Evidence is in the [checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#home-and-main-navigation-checkpoint).

The rest of the platform inventory in the [feature catalog](../../../../../../../../../../packages/feature-catalog/features.json) is not built here.
