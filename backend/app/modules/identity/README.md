# identity

Built for local synthetic use: registration with email verification, sign-in and sign-out, account recovery and password reset, profile (display name and IANA time zone, edited with `If-Match`), device sessions with revocation, recent security activity and the time-zone list. The separate `identity-mail-worker` process sends verification and recovery codes only to the local Mailpit inbox, for `.test` addresses. Passwords use Argon2id. Sessions are opaque, revocable and last 8 hours; codes expire after 15 minutes or 5 attempts ([settings](../../config.py)).

Other modules reuse this module's session check (`IdentityService.authenticate`), the protected-field encryption in `security.py` and the shared outbox table.

`exports.py` adds five personal data export operations under `/v1/me/exports`. They have no web or Android client and no configured worker. Their behaviour is covered by `backend/tests/test_exports.py` ([checkpoint](../../../../docs/BUILD_STATUS.md#personal-data-export-verification-checkpoint)).

Sign-in limits count each browser's network separately when the web app runs behind a trusted reverse proxy: set `COMMUNITY_PROXY_KEY` here and the same value plus `COMMUNITY_TRUSTED_PROXY_HOPS` on the web app ([T10](../../../../docs/TASKS.md#approved-requirements-not-built-yet)). The encryption key can be replaced in stages without signing anyone out ([T11](../../../../docs/TASKS.md#approved-requirements-not-built-yet); [procedure](../platform/README.md#encryption-key-rotation)); the lookup key used for email lookups and stored digests is never rotated. Evidence: [account checkpoint](../../../../docs/BUILD_STATUS.md#account-checkpoint-evidence).

Source chapters: 1, 11, 18.

Feature inventory: account-access, email-verification, phone-verification, sessions-devices, profiles-handles, account-recovery, contact-linking, contact-discovery, relationships, privacy-consent, account-lifecycle, data-export, delegations.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
