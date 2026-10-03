# identity

Built: sign-in, registration with email verification, recovery, and the account screen (**Profile** in the bottom bar) with profile, device sessions, security activity, sign-out, the reminder inbox and tasks in its header, and buttons for the agent, the blocked list and Privacy (`IdentityScreen.kt`, `IdentityViewModel.kt`; the Privacy page with each permission's take-back is in [privacy](../privacy/), T164). The other features open from the bottom bar and Home ([platform](../platform/README.md)).

When a saved sign-in cannot be checked at start (no connection or a server error), the screen keeps it and offers Try again instead of the sign-in form, so the person never signs in a second time and starts another server session. Typed sign-in fields survive rotation; the password and verification code are kept in memory only, never in saved state. An unsaved change to the display name or timezone in account settings also survives rotation, with the version it started from; only a save replaces it (T94). Both name fields keep 80 characters as the server counts them, an emoji counting once, and never half of one (T100). Sign-up starts in the device's timezone under the name the service lists (an older name such as Asia/Calcutta becomes Asia/Kolkata), otherwise in UTC.

Every native feature uses `AccountRepository.kt`: `authorized()` loads the saved session and checks it belongs to the expected account before each call, and `result()` turns error responses into `IdentityFailure`. `SessionStore.kt` keeps the session token encrypted with an Android Keystore AES-GCM key. `IdentityModels.kt` holds the shared response envelope and pagination types. Personal data export has no Android screen.

Signed-in feature requests take a credential snapshot under the session mutex, then release it before the network call (T82). A slow request no longer queues requests from other screens. A 401 clears only the exact credentials that request used, not a later sign-in, even for the same account. Logout, sign-in-again and acknowledged deletion use the same comparison; sign-in-again's cleanup still finishes after cancellation or a lost answer. Storage failures and original request errors remain explicit, and commands are never automatically retried.

Credential-producing transitions (login, verification, recovery and cancelling deletion) and the startup `current()` check retain their existing serialization. Screens still need their own command/read ordering guards; the session mutex is not a substitute for them. [Concurrency evidence and boundaries](../../../../../../../../../../docs/BUILD_STATUS.md#android-authenticated-request-concurrency).

Evidence: [account checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#account-checkpoint-evidence).

Source chapters: 1, 11, 18.

Feature inventory: account-access, email-verification, phone-verification, sessions-devices, profiles-handles, account-recovery, contact-linking, contact-discovery, relationships, privacy-consent, account-lifecycle, data-export, delegations.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
