# care (Android)

The Medicines screen, for the rules in the [care backend notes](../../../../../../../../../../backend/app/modules/care/README.md): add an instruction after confirming it, see a day's doses, report a dose as taken or skipped, and stop an instruction.

| File | Role |
| --- | --- |
| `CareRepository.kt` | The care API calls with the shared signed-in session, `Idempotency-Key` on every change and `If-Match` with the reviewed version on stop and report. |
| `CareViewModel.kt` | Screen state. An unconfirmed save keeps its key, so `retryCreate` cannot add a second instruction. |
| `CareScreen.kt` | The Compose screen. |

Tests: `android/app/src/test/java/com/community/platform/feature/care/CareTest.kt` (JVM). No device test covers this screen yet. Evidence: [care checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#care-checkpoint).
