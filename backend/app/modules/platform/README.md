# platform

Shared operational boundary. Only features with executable evidence in the [build status](../../../../docs/BUILD_STATUS.md) are implemented; today that is the local restore drill and the encryption key rotation procedure below, and request telemetry in [`app/telemetry.py`](../../telemetry.py): request logs without private data, W3C trace IDs and a key-protected `/metrics` ([checkpoint](../../../../docs/BUILD_STATUS.md#observability-basics-checkpoint)), which also reports waiting and failed background work from [`work.py`](work.py) ([checkpoint](../../../../docs/BUILD_STATUS.md#background-work-metrics-checkpoint)).

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

Limits: this is a single-machine local fixture, not production backup storage, retention, encryption at rest, off-host copies or PITR/WAL archiving. The key is fingerprinted but deliberately not copied, so losing `backend/.local/identity.key` still makes protected fields unreadable; KMS custody does not exist, and key rotation is the local procedure below. There is no object storage yet, so files are not part of the recovery unit. The seal applies only to the disposable copy and writes no security event. A real recovery would still need an approved, audited path, reconciliation of work changed after the snapshot (for example, a reminder cancelled later would return as scheduled) and staged reopening. Measured durations are not RPO/RTO objectives.

## Encryption Key Rotation

`python3 -m app.modules.platform.keys` replaces the encryption key in `backend/.local/identity.key` in stages ([T11](../../../../docs/TASKS.md#approved-requirements-not-built-yet), R12). Nobody is signed out and every stored value stays readable throughout. Run it in the API image so it uses the same key file and database:

```powershell
docker compose -f infra/compose.yaml run --rm --no-deps api python3 -m app.modules.platform.keys status
```

The key file holds encryption keys, the primary one first, and a separate lookup key for email lookups and the stored digests of sessions and repeated requests. A single-key file, the original format, keeps working. The first `add` converts it, keeping the lookup key the single key always produced, so rotation never changes a lookup. Values are protected in six columns: account and challenge emails, verification mail, export archives, care instructions and message bodies. Short-lived tokens given to clients (list cursors and previews, 15 minutes at most) use the same keys.

1. `status` shows each key's ID (the first 12 hex characters of its SHA-256) and how many stored values in each column open with each key. It changes nothing.
2. `add` creates a new key that is not used for writing yet. Restart every process that loads the key file: `docker compose -f infra/compose.yaml restart api identity-mail-worker reminder-worker`, and any export worker. Every process can now read both keys.
3. `promote <id>` makes the new key the primary key, so new values are written with it. Restart again. Older values and tokens still open, because the old key stays in the file.
4. `reencrypt` writes every stored value that is not on the primary key again with the primary key. It works in batches (500 rows, export archives 4 at a time) and changes a row only if it still holds the value that was read, so a change made meanwhile is never overwritten. The content and original timestamp are kept, so versions, ETags and message bindings do not change. It is safe to repeat.
5. `verify` passes only when every stored value opens with the primary key.
6. `retire <id>` refuses the primary key, any key until 24 hours after it stopped being primary, and any key while `verify` fails. It then writes the key to `backend/.local/retired-keys/<id>.json` before removing it from the key file. Restart again.
7. `restore <id>` brings a retired key back as a reading key, for example to restore a backup taken before the rotation.

Each command prints a JSON report with key IDs and counts, never key material, and exits with 1 when it refuses. Files are written with owner-only permissions, through a temporary file that replaces the key file in one step. A change that would drop a key without archiving it, or change the lookup key, is refused. A damaged key file stops the command and the services; it is never replaced with a new key.

Limits: the lookup key is not rotated. Sessions are stored only as digests, so changing it would sign everyone out and break repeated-request detection; that needs its own plan. A key set through `COMMUNITY_SECRET_KEY` is refused, because rotation edits only the key file. Rotation needs restarts; there is no live reload. Keep each retired key as long as any backup made before its retirement. Keys stay in local files: production custody (KMS, roles, backup access and destruction) is open decision [C11-D08](../../../../docs/CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md).
