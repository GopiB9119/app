# care (web)

The Medicines screen at `/app/care`, for the rules in the [care backend notes](../../../../backend/app/modules/care/README.md): add an instruction after confirming it, see a day's doses, report a dose as taken or skipped, and stop an instruction.

| File | Role |
| --- | --- |
| `client.ts` | Zod schemas and the calls: list, create (`Idempotency-Key`), stop and report (`Idempotency-Key` and `If-Match` with the reviewed version), and the day view; date and timezone helpers. |
| `care-screen.tsx` | The screen. An unconfirmed save keeps its key so a retry cannot add a second instruction or report. |
| `care.module.css` | Styles. |

Tests: the care cases in `tests/care-client.test.mjs`, and the screen offline in `tests/unit/care-ui.test.mjs` ([T63](../../../../docs/BUILD_STATUS.md#care-screen-offline-tests-checkpoint)). Evidence: [care checkpoint](../../../../docs/BUILD_STATUS.md#care-checkpoint).
