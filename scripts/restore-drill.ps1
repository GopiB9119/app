# Back up local PostgreSQL, then restore and verify it in a disposable, network-isolated Compose project.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$liveCompose = Join-Path $root 'infra\compose.yaml'
$drillCompose = Join-Path $root 'infra\restore-drill.compose.yaml'
$drillProject = 'community-restore-drill'
$drill = @('compose', '-p', $drillProject, '-f', $drillCompose)
$keyFile = Join-Path $root 'backend\.local\identity.key'
$started = [DateTime]::UtcNow
$stamp = $started.ToString('yyyyMMddTHHmmssZ')
$evidence = Join-Path $root ".local\restore-drill\$stamp"
$containerDump = "/tmp/community-restore-drill-$stamp.dump"
$utf8 = New-Object System.Text.UTF8Encoding $false

function Invoke-Docker {
    param([string]$Step, [string[]]$Arguments, [string]$InputText)
    $previous = $ErrorActionPreference
    # Docker reports progress on stderr; only its exit code decides success.
    $ErrorActionPreference = 'Continue'
    try {
        if ($PSBoundParameters.ContainsKey('InputText')) { $output = $InputText | & docker @Arguments } else { $output = & docker @Arguments }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) { throw "$Step failed with docker exit code $code" }
    if ($null -ne $output) { $output }
}

function Write-Json([string]$Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 12), $utf8)
}

function Get-Seconds($Watch) {
    [Math]::Round($Watch.Elapsed.TotalSeconds, 3)
}

if (-not (Test-Path -LiteralPath $keyFile -PathType Leaf)) { throw 'The identity key is missing; protected fields in a restored copy would be unreadable' }
if (Test-Path -LiteralPath $evidence) { throw "Refusing to overwrite drill evidence at $evidence" }
$live = @(Invoke-Docker -Step 'Read live services' -Arguments @('compose', '-f', $liveCompose, 'ps', '--status', 'running', '--services') | ForEach-Object { "$_".Trim() })
if ($live -notcontains 'db') { throw 'The local db service is not running; start the stack normally first' }
$leftovers = @(Invoke-Docker -Step 'Look for earlier drill containers' -Arguments @('ps', '-a', '-q', '--filter', "label=com.docker.compose.project=$drillProject") | Where-Object { "$_".Trim() })
if ($leftovers.Count -gt 0) { throw "Containers from $drillProject already exist; inspect them before another drill" }
Invoke-Docker -Step 'Check cached images' -Arguments @('image', 'inspect', '--format', '{{.Id}}', 'postgres:17-alpine', 'community-platform-api:latest') | Out-Null

# The dump and the counts share one exported snapshot, so concurrent local writes cannot skew the comparison.
$snapshotSql = @"
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot() AS drill_snapshot \gset
\setenv DRILL_SNAPSHOT :drill_snapshot
\! pg_dump --username=community --dbname=community --format=custom --snapshot="`$DRILL_SNAPSHOT" --file=$containerDump; echo "dump|`$?"
SELECT 'time|' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
SELECT 'alembic|' || version_num FROM alembic_version;
SELECT 'server|' || current_setting('server_version');
SELECT format('SELECT %L || count(*) FROM %I.%I', 'count|' || table_name || '|', table_schema, table_name) FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name \gexec
COMMIT;
"@ -replace "`r`n", "`n"

$facts = @{}
$tables = [ordered]@{}
$durations = [ordered]@{}
$report = $null
$verifyExit = $null
$failure = $null
$passed = $false
$teardown = 'not needed'
$snapshotAttempted = $false
$drillStarted = $false
try {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $snapshotAttempted = $true
    $lines = @(Invoke-Docker -Step 'Snapshot and dump' -Arguments @('compose', '-f', $liveCompose, 'exec', '-T', 'db', 'psql', '-X', '-q', '-A', '-t', '--username=community', '--dbname=community') -InputText $snapshotSql)
    foreach ($line in $lines) {
        $parts = "$line".Trim().Split('|')
        if ($parts.Count -eq 3 -and $parts[0] -eq 'count') { $tables[$parts[1]] = [long]$parts[2] }
        elseif ($parts.Count -eq 2 -and $parts[0] -in @('dump', 'time', 'alembic', 'server')) { $facts[$parts[0]] = $parts[1] }
    }
    if ($facts['dump'] -ne '0') { throw 'pg_dump did not complete inside the exported snapshot' }
    if (-not $facts['time'] -or -not $facts['alembic'] -or $tables.Count -eq 0) { throw 'Snapshot facts are incomplete' }
    New-Item -ItemType Directory -Path $evidence | Out-Null
    $dumpFile = Join-Path $evidence 'database.dump'
    Invoke-Docker -Step 'Copy dump' -Arguments @('compose', '-f', $liveCompose, 'cp', "db:$containerDump", $dumpFile) | Out-Null
    Invoke-Docker -Step 'Remove temporary dump' -Arguments @('compose', '-f', $liveCompose, 'exec', '-T', 'db', 'rm', '-f', $containerDump) | Out-Null
    $snapshotAttempted = $false
    $durations.backup = Get-Seconds $watch
    $dumpItem = Get-Item -LiteralPath $dumpFile
    if ($dumpItem.Length -le 0) { throw 'The copied dump is empty' }
    $manifest = [ordered]@{
        schemaVersion = 1
        createdAt = [DateTime]::UtcNow.ToString('o')
        source = [ordered]@{ composeProject = 'community-platform'; service = 'db'; database = 'community'; serverVersion = $facts['server'] }
        snapshot = [ordered]@{ transactionTime = $facts['time']; alembicVersion = $facts['alembic']; tables = $tables }
        dump = [ordered]@{ file = 'database.dump'; format = 'pg_dump custom'; bytes = $dumpItem.Length; sha256 = (Get-FileHash -LiteralPath $dumpFile -Algorithm SHA256).Hash }
        key = [ordered]@{ sha256 = (Get-FileHash -LiteralPath $keyFile -Algorithm SHA256).Hash; copiedIntoBackup = $false }
    }
    Write-Json (Join-Path $evidence 'manifest.json') $manifest

    $env:RESTORE_DRILL_BACKUP_DIR = $evidence
    $env:RESTORE_DRILL_KEY_FILE = $keyFile
    $env:RESTORE_DRILL_DB_PASSWORD = [Guid]::NewGuid().ToString('N')
    $watch.Restart()
    $drillStarted = $true
    Invoke-Docker -Step 'Start isolated database' -Arguments ($drill + @('up', '-d', '--wait', 'restore-db')) | Out-Null
    $durations.isolatedDatabase = Get-Seconds $watch
    $watch.Restart()
    Invoke-Docker -Step 'Restore dump' -Arguments ($drill + @('exec', '-T', 'restore-db', 'pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--username=restore_drill', '--dbname=community_restore', '/drill/database.dump')) | Out-Null
    $durations.restore = Get-Seconds $watch
    $watch.Restart()
    $ErrorActionPreference = 'Continue'
    $output = & docker @($drill + @('run', '--rm', '-T', 'verify'))
    $verifyExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $durations.verification = Get-Seconds $watch
    $durations.recovery = [Math]::Round($durations.isolatedDatabase + $durations.restore + $durations.verification, 3)
    $reportText = $output | Out-String
    [System.IO.File]::WriteAllText((Join-Path $evidence 'verification.json'), $reportText, $utf8)
    $report = $reportText | ConvertFrom-Json
    $passed = $verifyExit -eq 0 -and $report.passed -eq $true
} catch {
    $failure = $_.Exception.Message
} finally {
    $ErrorActionPreference = 'Continue'
    if ($snapshotAttempted) { & docker compose -f $liveCompose exec -T db rm -f $containerDump | Out-Null }
    if ($drillStarted) {
        & docker @($drill + @('--profile', 'verify', 'down', '--volumes', '--remove-orphans')) | Out-Null
        $teardown = if ($LASTEXITCODE -eq 0) { 'removed' } else { "failed with docker exit code $LASTEXITCODE" }
    }
    $ErrorActionPreference = 'Stop'
    Remove-Item Env:RESTORE_DRILL_BACKUP_DIR, Env:RESTORE_DRILL_KEY_FILE, Env:RESTORE_DRILL_DB_PASSWORD -ErrorAction SilentlyContinue
}

$result = if ($passed -and -not $failure -and $teardown -eq 'removed') { 'PASS' } else { 'FAIL' }
$summary = [ordered]@{
    schemaVersion = 1
    result = $result
    startedAt = $started.ToString('o')
    finishedAt = [DateTime]::UtcNow.ToString('o')
    recoveryPoint = $facts['time']
    alembicVersion = $facts['alembic']
    tables = $tables.Count
    rows = [long](($tables.Values | Measure-Object -Sum).Sum)
    durationsSeconds = $durations
    verificationExitCode = $verifyExit
    teardown = $teardown
    failure = $failure
}
if (Test-Path -LiteralPath $evidence) { Write-Json (Join-Path $evidence 'drill.json') $summary }
if ($report) {
    Write-Output ('Recovery point {0}, migration {1}: {2} rows in {3} tables, counts matched {4}, protected fields readable {5}, owner invariant {6}, sessions revoked {7}, isolation {8}' -f
        $facts['time'], $facts['alembic'], $report.counts.rows, $report.counts.tables, $report.counts.passed, $report.ciphertext.passed,
        $report.invariants.passed, $report.seal.applied.revokedSessions, $report.isolation.passed)
}
Write-Output ('{0}: recovery {1}s (database {2}s, restore {3}s, checks {4}s); backup {5}s; teardown {6}; evidence {7}' -f
    $result, $durations.recovery, $durations.isolatedDatabase, $durations.restore, $durations.verification, $durations.backup, $teardown, $evidence)
if ($failure) { throw "Restore drill failed: $failure" }
if ($result -ne 'PASS') { throw "Restore drill failed; see $evidence" }
