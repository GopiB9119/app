# care (backend)

Medicine instructions a person enters for themselves, and their own reports of each dose. Kept in scope by [DEC-007](../../../../docs/DECISIONS.md#accepted-decisions); who approves its medical, legal and privacy rules is still open (Q12). Evidence: [care checkpoint](../../../../docs/BUILD_STATUS.md#care-checkpoint).

## What it does

- **Instructions:** medicine name, strength, form, dose, free-text instructions, where they came from (`prescriber`, `pharmacist`, `package_label`, `self`), up to 6 daily times in a named timezone, a first and last day, and an explicit confirmation that the person checked them. The text is stored encrypted (`payload_cipher`) and is never interpreted.
- **Stop:** an instruction can be stopped, after reviewing it (`If-Match`); stopped instructions stay readable.
- **Day view:** the scheduled times for one date, within 31 days of today. A time that does not exist on a clock-change day moves forward by the gap (`shifted_forward`); a time that happens twice uses the first (`repeated_time_first`).
- **Reports:** `taken` or `skipped` for one scheduled time, from one hour before it until seven days after, after reviewing that dose (`If-Match`). A report is what the person says happened, not proof.

## Rules the code keeps

- **The person only.** Only the account that entered an instruction can read, stop or report it. There is no caregiver, Space owner or administrator path.
- **No medical decisions.** Nothing here suggests, checks or changes a medicine or dose, and nothing reminds anyone; the alerts work that can warn about a dose is separate and waits for the owner's decision (conflict C10, X2).
- **Writes are exact and atomic.** Each create, stop and report takes an `Idempotency-Key`; the change, its audit record (`care_audit_events`) and the outbox event commit together, and a failed audit rolls everything back.
- **Limits:** 30 active and 500 total instructions, 20 new instructions a day, a first day from 30 days ago to one year ahead, a course of at most ten years.

## Files and API

| File | Role |
| --- | --- |
| `api.py` | `GET`/`POST /v1/care/instructions`, `GET /v1/care/instructions/{id}`, `POST /v1/care/instructions/{id}/stop`, `POST /v1/care/instructions/{id}/reports`, `GET /v1/care/day`; all require sign-in. |
| `service.py` | `CareService`: the rules above and the clock-change mapping (`resolve`). |
| `models.py`, `schemas.py` | Tables from migration `0016` and the request and response types. |

Tests: `backend/tests/test_care.py`. Clients: [web](../../../../web/src/features/care/README.md) and [Android](../../../../android/app/src/main/java/com/community/platform/feature/care/README.md).
