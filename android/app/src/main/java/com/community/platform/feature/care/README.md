# care (Android)

The Medicines screen, for the rules in the [care backend notes](../../../../../../../../../../backend/app/modules/care/README.md): add an instruction after confirming it, see a day's doses, report a dose as taken or skipped, and stop an instruction.

| File | Role |
| --- | --- |
| `CareRepository.kt` | The care API calls with the shared signed-in session, `Idempotency-Key` on every change and `If-Match` with the reviewed version on stop and report. |
| `CareViewModel.kt` | Screen state. An unconfirmed save keeps its key, so `retryCreate` cannot add a second instruction. A change stops a day or list load still unanswered and sends it again once answered, keeping the change's message, and Refresh waits for the change, so an older answer cannot undo a dose note (T82). |
| `CareScreen.kt` | The Compose screen. The Stop tracking question scrolls, so its whole warning can be read at 200% text on a 320 dp screen (T93). |

Tests: `android/app/src/test/java/com/community/platform/feature/care/CareTest.kt` (JVM) and `android/app/src/androidTest/java/com/community/platform/feature/care/CareScreenTest.kt` (device, network off: the day plan and medicine list states, the stop confirmation, locked controls while a change is unconfirmed, and 320 dp at 200% text). Evidence: [care checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#care-checkpoint).
