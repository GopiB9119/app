# identity

Built: sign-in, registration with email verification, recovery, and the account screen with profile, device sessions, security activity, sign-out and the buttons that open the other features (`IdentityScreen.kt`, `IdentityViewModel.kt`).

Every native feature uses `AccountRepository.kt`: `authorized()` loads the saved session and checks it belongs to the expected account before each call, and `result()` turns error responses into `IdentityFailure`. `SessionStore.kt` keeps the session token encrypted with an Android Keystore AES-GCM key. `IdentityModels.kt` holds the shared response envelope and pagination types. Personal data export has no Android screen.

Evidence: [account checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#account-checkpoint-evidence).

Source chapters: 1, 11, 18.

Feature inventory: account-access, email-verification, phone-verification, sessions-devices, profiles-handles, account-recovery, contact-linking, contact-discovery, relationships, privacy-consent, account-lifecycle, data-export, delegations.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
