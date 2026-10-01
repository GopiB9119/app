# Account Access Development Boundary

This is a synthetic-data development build, not a production identity service. Only `.test` email addresses are accepted. Email goes to local Mailpit, never to an external recipient. Existing product and security decisions remain proposed/open; this implementation does not approve real-user rollout.

Use the [shared local runbook](README.md) for Docker, migrations, web startup and combined verification. Use a free web port and match `COMMUNITY_WEB_ORIGINS` to it. Browser automation requires permission for the local hosts under the active network policy; do not bypass a denied host with another tool, proxy or address.

## Account Journey

Open `/register`, enter a synthetic address such as `alex@example.test`, and obtain the code from the local Mailpit inbox on port 8025. Finish enrollment in the same browser or Android app context. The code is not proof of real-world identity or live email delivery. Credentials are set only when the initiating context completes verification.

The account screen supports name/timezone changes, active-session review, session revocation and logout. Recovery uses a new purpose-bound local challenge and revokes prior sessions after resetting the password. Lost verification responses are recovered through sign-in or a new challenge; consumed proof does not mint another session.

## Offline Verification

The [offline web component tests](../../tests/unit/identity-ui.test.mjs) run the actual account form in an isolated in-memory Chromium page. Esbuild bundles the component locally; API responses and Next Link are test doubles, and every outbound browser request is blocked. They do not visit the local application or replace the live browser/BFF/delivery journey.

Set `COMMUNITY_CHROMIUM_PATH` to an installed isolated Chromium executable when the browser expected by the Playwright package is unavailable. This workstation used the existing Playwright `chromium-1228/chrome-win64/chrome.exe` installation. Then run:

```powershell
npm --prefix web run test:unit
```

The five checks cover recovery completion, invalid inputs, failed reset without false success, stable retries and changed-email request identity. A changed email is an explicit new request; an unchanged retry preserves the original key.

The [offline native screen tests](../../android/app/src/androidTest/java/com/community/platform/feature/identity/IdentityScreenTest.kt) use the real Compose screen with simulated callbacks and never construct the networking ViewModel. Together with [KeystoreSessionTest](../../android/app/src/androidTest/java/com/community/platform/feature/identity/KeystoreSessionTest.kt), they ran successfully on API 36 with Wi-Fi and mobile data disabled in an owned read-only emulator session. Only those two classes were selected; do not run the whole instrumentation package when local-service requests are prohibited.

## Android

Prerequisites: JDK 21, Android SDK 35 and the repository's Gradle wrapper 8.13. On this workstation, Android Studio provides the verified JDK:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\sdk"
.\android\gradlew.bat -p android :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --offline --console=plain
```

On another workstation, set `JAVA_HOME` to its JDK 21 installation and configure the SDK through `ANDROID_HOME` or an untracked local properties file. Use normal Google/Maven repositories when the cache is incomplete; never disable TLS to obtain missing artifacts.

The [Android application](../../android/app/build.gradle.kts) produces `app/build/outputs/apk/debug/app-debug.apk` under the Android project. Debug application ID: `com.community.platform.debug`. The release build has no usable API host and is not a deliverable for real users. HTTP is permitted only in the debug manifest for emulator/loopback hosts. Release configuration denies cleartext traffic.

Emulator debug networking uses `10.0.2.2:8000`. The instrumentation sources contain offline Keystore/screen tests and real synthetic account/family journeys. The latter have now passed on an owned disposable emulator after explicit local-only access approval; see the [live workflow checkpoint](../BUILD_STATUS.md#live-manual-workflow-checkpoint). Any rerun still requires that permitted service scope and confirmed device ownership. Offline checks or an APK build alone do not qualify a networked flow. No personal device was installed to or cleared during this build.

## Local Settings

| Concern | Implementation |
| --- | --- |
| API | `/v1`; Chapter 7 `data` or `error` plus `request_id`; [generated OpenAPI](../../packages/openapi/openapi.json) |
| Enrollment | Context-bound registration operation; 15-minute, six-digit challenge; five proof attempts; credentials enrolled at verification |
| Abuse limits | Durable PostgreSQL buckets; five signup/recovery attempts or ten logins per identity per 15 minutes; sixty per network (an IPv4 address or an IPv6 /64) |
| Email normalization | Maintained parser; preserved normalized local-part; no provider-specific dot/alias merging |
| Passwords | Argon2id, random salt, 19,456 KiB, two iterations, parallelism one; 12-128 characters; minimal common-password check |
| Sessions | Random opaque bearer; keyed digest in PostgreSQL; eight-hour fixed lifetime; maximum twenty active sessions |
| Browser | Same-origin allowlisted BFF; HttpOnly/SameSite=Strict cookies; mutation Origin checks; expected-account binding; private no-store responses; nonce CSP |
| Cookie transport | `Secure` is off only for loopback HTTP. Real HTTPS needs `COMMUNITY_SECURE_COOKIES=true` and reviewed deployment configuration |
| Android | Keystore AES-GCM for the session; backups disabled; no automatic network retry or offline identity-command queue |
| Profile | Display name and IANA timezone; strong ETag required for updates; stale changes return 412 |
| Recovery | Same-context, single-use local email challenge; password reset revokes old sessions; no phone/social/support-assisted recovery |
| Durability | PostgreSQL transaction includes account/session mutation, minimal security event and outbox intent |
| Test mail | Encrypted short-lived payload; bounded claims/retries; stable message ID; payload purged after sending/expiry; uncertain final claim is `unknown` |

These are explicit development settings, not approved production limits, password calibration, recovery assurance or delivery SLAs. Locally, every browser is `127.0.0.1`, so web sign-ins share one network bucket. Behind a reverse proxy that appends the client address to `X-Forwarded-For`, set the same secret `COMMUNITY_PROXY_KEY` on the API and the web app, and `COMMUNITY_TRUSTED_PROXY_HOPS` on the web app to the number of trusted proxies. The web app then names each browser's network on the five sign-in routes. Next.js keeps an `X-Forwarded-For` sent by the browser, so never set hops when the web app is reachable without the proxy. Distributed abuse policy and risk-based recovery still require further design and testing.

## Storage And Failure

The database persists in Docker's `community-platform_postgres-data` volume. The ignored backend local directory holds the identity encryption/HMAC key. Keep that key with its database: changing it makes stored contacts and sessions unusable. This key file is not production KMS custody. Mailpit deliberately exposes synthetic codes locally and must never contain real identities.

Do not use `down -v`, delete the identity key, or point tests at development data as routine troubleshooting. A local isolated restore drill exists (`scripts/restore-drill.ps1`; see the [platform notes](../../backend/app/modules/platform/README.md)). It checks the key's fingerprint but does not copy the key. Key rotation is a local, staged procedure ([platform notes](../../backend/app/modules/platform/README.md#encryption-key-rotation)); production key custody and backup custody have not been qualified. Test fixtures are restricted to a separate disposable `community_test` database and create a unique schema per invocation so concurrent test runs cannot reset each other's tables.

When the API is unavailable, clients show unconfirmed changes, not success. Browser mutations have no retries and use `networkMode: always`, so reconnecting does not silently submit an offline account edit. Expired/revoked sessions need a new sign-in.

The Android shared HTTP client also keeps automatic retries and redirects disabled. It retains no idle connections: the real family journey exposed an EOF on a reused connection, and a deterministic local peer-close regression reproduces that risk. Separate tests verify that the next explicit command succeeds and that a POST with no acknowledgment is not automatically replayed. Fresh connections add connection-setup cost; this local reliability decision is not a production latency or connection-reuse qualification. Unknown commands still require their explicit domain retry identity.

SMTP acceptance is local transport evidence only. A crash after acceptance can repeat the same synthetic message; stable IDs do not prove exactly-once delivery. The worker is restricted to local SMTP hostnames and is not a live-provider dispatch implementation.

## Dependencies

The PyPI artifact host failed TLS on this machine, including inside the initial Python image. The working backend uses signature-verified packages from Debian trixie's official repository. Observed versions: FastAPI 0.115.11, Uvicorn 0.32.0, SQLAlchemy 2.0.40, Alembic 1.13.2.dev0, psycopg 3.2.6, argon2-cffi 21.1.0, cryptography 43.0.0, Pydantic 2.10.6, pydantic-settings 2.8.1, email-validator 2.2.0, pytest 8.3.5 and httpx 0.28.1. Debian security patch status cannot be inferred from an upstream version string alone.

The web lockfile records Next.js 16.2.3/React 19.2.4 and integrity-checked cached official npm archives. Optional lint packages could not be fully resolved offline. A dependency/advisory audit and supported-version review remain release gates. No TLS or network policy was weakened.

Not delivered here: phone/passkey/social login, trusted-device enrollment, MFA, refresh-token rotation, breached-password service, legal/age policy, qualified real recovery, contact changes, handles/profile audiences, data export/deletion, live email, production hosting or security certification. Those capabilities remain in the inventory. Consult [build evidence](../BUILD_STATUS.md) before treating account access as complete.