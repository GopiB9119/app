# identity

Built for local synthetic use: registration with email verification, sign-in and sign-out, account recovery and password reset, profile (display name and IANA time zone, edited with `If-Match`), device sessions with revocation, recent security activity and the time-zone list. The separate `identity-mail-worker` process sends verification and recovery codes only to the local Mailpit inbox, for `.test` addresses. Passwords use Argon2id. Sessions are opaque, revocable and last 8 hours; codes expire after 15 minutes or 5 attempts ([settings](../../config.py)).

Other modules reuse this module's session check (`IdentityService.authenticate`), the protected-field encryption in `security.py` and the shared outbox table.

`exports.py` adds five personal data export operations under `/v1/me/exports`, used by "Your data" on the web (`/app/settings/data`) and Android; the `export-worker` service (`python3 -m app.export_worker`) builds the archives ([DEC-022](../../../../docs/DECISIONS.md#accepted-decisions), T68). Each history in an archive holds at most 1,000 entries, and the archive's `omitted` list names any that held more, with its total ([checkpoint](../../../../docs/BUILD_STATUS.md#export-omissions-checkpoint)). Their behaviour is covered by `backend/tests/test_exports.py` ([checkpoint](../../../../docs/BUILD_STATUS.md#personal-data-export-verification-checkpoint)).

`deletion.py` deletes accounts (DEC-022, T68). `POST /v1/me/deletion` takes the password, is refused with `OWNED_SPACES_WITH_MEMBERS` (naming the Spaces) while the person owns a Space with other current members, and otherwise ends every session and every export and starts a 7-day grace period; signing in during it answers `ACCOUNT_DELETION_PENDING`, and `POST /v1/auth/cancel-deletion` restores the account and signs in. The `account-deletion-worker` service (`python3 -m app.deletion_worker`) then erases each due account in one transaction: its own data goes, messages and comments become deleted, pages are archived, it leaves every Space (a Space with no one else is closed and emptied), and the person shows as "Deleted account"; an account that owns a shared Space at that moment is skipped. Tests: `backend/tests/test_account_deletion.py`.

Sign-in limits count each browser's network separately when the web app runs behind a trusted reverse proxy: set `COMMUNITY_PROXY_KEY` here and the same value plus `COMMUNITY_TRUSTED_PROXY_HOPS` on the web app ([T10](../../../../docs/TASKS.md#approved-requirements-not-built-yet)). The encryption key can be replaced in stages without signing anyone out ([T11](../../../../docs/TASKS.md#approved-requirements-not-built-yet); [procedure](../platform/README.md#encryption-key-rotation)); the lookup key used for email lookups and stored digests is never rotated. Evidence: [account checkpoint](../../../../docs/BUILD_STATUS.md#account-checkpoint-evidence).

Source chapters: 1, 11, 18.

Feature inventory: account-access, email-verification, phone-verification, sessions-devices, profiles-handles, account-recovery, contact-linking, contact-discovery, relationships, privacy-consent, account-lifecycle, data-export, delegations.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
