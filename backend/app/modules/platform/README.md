# platform

Shared operational boundary. Only features with executable evidence in the [build status](../../../../docs/BUILD_STATUS.md) are implemented; today that is the local restore drill below.

Source chapters: 6, 7, 8, 9, 10, 11.

Feature inventory: database-migrations, api-contracts, state-machines, authorization, audit, transactional-outbox, durable-jobs, worker-recovery, observability, rate-limits, feature-gates, backup-restore, deployment, design-system, accessibility, localization, client-offline-state.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.

## Local Restore Drill

[`scripts/restore-drill.ps1`](../../../../scripts/restore-drill.ps1) exercises the isolated-restore procedure (C10-W11) on synthetic development data:

1. **Backup, read-only against the running stack.** One `REPEATABLE READ READ ONLY` transaction exports its snapshot; `pg_dump --snapshot` and the per-table row counts both use it, so concurrent local writes cannot skew the comparison. The custom-format dump is copied out with `docker compose cp` and the temporary file inside the database container is deleted. `manifest.json` records the recovery point, Alembic head, table counts, dump SHA-256 and the identity key's SHA-256.
2. **Restore in isolation.** [`infra/restore-drill.compose.yaml`](../../../../infra/restore-drill.compose.yaml) starts project `community-restore-drill`: tmpfs PostgreSQL on an `internal` network with no published ports, workers, mail service or route to the live project. `pg_restore --single-transaction --exit-on-error` restores everything or nothing.
3. **Verify.** `python3 -m app.modules.platform.restore` refuses every database except `restore-db`/`community_restore`. It checks the migration head, exact table set and row counts, and the key fingerprint. Every protected field must open and every email lookup HMAC must match with the recorded key, while a freshly generated control key must open none. Each active Space must have exactly one active owner. Outside hosts must be unreachable while the drill database is reachable.
4. **Seal the copy.** Revocations made after the snapshot cannot be proven, so unexpired restored sessions are revoked and pending identity challenges and mail payloads expire; everyone signs in again. Scheduled reminders are counted but not changed, and the drill runs no reminder worker.
5. **Tear down** only the drill project (`down --volumes`), then write `drill.json` with durations and the result.

Evidence stays under ignored `.local/restore-drill/<UTC timestamp>/`; treat those dumps as sensitive local data. The script refuses to start while containers from an earlier drill exist and never runs `down` against the main project.

Limits: this is a single-machine local fixture, not production backup storage, retention, encryption at rest, off-host copies or PITR/WAL archiving. The key is fingerprinted but deliberately not copied, so losing `backend/.local/identity.key` still makes protected fields unreadable; KMS custody and key rotation do not exist. There is no object storage yet, so files are not part of the recovery unit. The seal applies only to the disposable copy and writes no security event. A real recovery would still need an approved, audited path, reconciliation of work changed after the snapshot (for example, a reminder cancelled later would return as scheduled) and staged reopening. Measured durations are not RPO/RTO objectives.
