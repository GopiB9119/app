# identity

Built: sign-in, registration with email verification, recovery and password reset (`auth-screen.tsx`), and the account page at `/app/settings/account` with profile, device sessions, recent security activity and sign-out (`account-screen.tsx`).

The account forms are server-rendered, so they post rather than use GET, and their fields and button stay disabled until the page is interactive. Before this, an early Send put the email (and on sign-in the password) in the address, and text typed while the page loaded was silently replaced ([T30](../../../../docs/TASKS.md#defects-that-break-approved-requirements)).

Registration starts in the browser's timezone under the name the service lists, so an older name the browser reports, such as Asia/Calcutta, becomes Asia/Kolkata; when the service lists no such zone it starts in UTC ([T54](../../../../docs/TASKS.md#defects-that-break-approved-requirements)). When the list of timezones cannot be loaded, registration and the account page say so and offer Retry, using `timezone-list-problem.tsx`, which the reminder forms share ([T59](../../../../docs/TASKS.md#defects-that-break-approved-requirements)).

`client.ts` holds the shared typed `api()` helper that every web feature uses. It calls the same-origin proxy in `app/api/[...path]/route.ts`, sends the expected account ID and validates every response with Zod. `shell.tsx` is the shared page header with the navigation links.

The session cookie is HttpOnly and SameSite=Strict. The proxy refuses cross-site writes and requests made for an account other than the signed-in one. Personal data export has no web screen. Evidence: [account checkpoint](../../../../docs/BUILD_STATUS.md#account-checkpoint-evidence).

Source chapters: 1, 11, 18.

Feature inventory: account-access, email-verification, phone-verification, sessions-devices, profiles-handles, account-recovery, contact-linking, contact-discovery, relationships, privacy-consent, account-lifecycle, data-export, delegations.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
