# Incidents

The log of incidents. An incident is an event that harms, or could harm, real users, real data, security or the availability of a running environment. That includes exposing a real secret or real personal data during development.

Not incidents: bugs found by tests on synthetic data (they go in [TASKS.md](TASKS.md)) and local tool or emulator failures (they go in [BUILD_STATUS.md](BUILD_STATUS.md) when they affect evidence).

The product has no real users and no deployed environment. No incidents have been recorded.

## Log

| ID | Date | Summary | Severity | Status |
| --- | --- | --- | --- | --- |
| — | — | None recorded | — | — |

## Recording an Incident

```text
### INC-NNN Title
- Detected: date, time and how
- Impact: who and what was affected, including any data
- Timeline: what happened, in order
- Containment: what was done to stop it
- Cause: what caused it, or UNKNOWN
- Follow-up: task IDs in TASKS.md
- Status: open or closed, with the date
```

## Procedures

- **TBD** Severity levels, who is contacted and response times. The drafts propose procedures in [section 13 of the Chapter 10 contract](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md#13-failure-modes-and-incident-runbooks) (system failures) and [section 11 of the Chapter 16 contract](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md#11-specialized-safety-and-incident-response) (safety incidents).
- Local procedures for running and recovering the build are in the [runbooks](runbooks/README.md).
