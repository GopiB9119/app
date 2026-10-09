<#
.SYNOPSIS
Runs the project's checks one after another and writes one summary.

.DESCRIPTION
Each suite runs with the command the runbook names. Its output goes to its own log, and the summary records the
result, the test counts, the time taken and the commit the checks ran on, with the number of uncommitted changes.
Suites run one at a time: on a machine shared with other sessions, parallel runs are slower and fail by timing.

The script changes nothing in the repository. It writes only under the output folder and in the build folders the
tools already use, and it restores the environment variables it sets.

.PARAMETER Suite
The suites to run, separated by commas: runner, records, structure, tokens, golden, contracts, typecheck, client, unit, backend, android, device, live.
The default is every suite except two: live, which needs the web preview and the local services (COMMUNITY_WEB_URL,
by default http://127.0.0.1:3000), and device, which starts its own Android emulator for about half an hour
(scripts\verify-android-device.ps1).

.PARAMETER Output
The folder for the logs and the summary. The default is .local\verify\<date-time>.

.EXAMPLE
.\scripts\verify.ps1

.EXAMPLE
.\scripts\verify.ps1 -Suite client,unit

.EXAMPLE
npm run verify -- -Suite live
#>
param(
    [string[]]$Suite = @('runner', 'records', 'structure', 'tokens', 'golden', 'contracts', 'typecheck', 'client', 'unit', 'backend', 'android'),
    [string]$Output
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding($false)
$order = @('runner', 'records', 'structure', 'tokens', 'golden', 'contracts', 'typecheck', 'client', 'unit', 'backend', 'android', 'device', 'live')
$suites = @{
    runner    = @{ Title = 'Verification runner'; Kind = 'node'; Commands = @('powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.test.ps1') }
    # Records only grow: no task, decision, checkpoint or changelog section may disappear, in the working copy or the last commit.
    records   = @{ Title = 'Records kept'; Kind = 'node'; Commands = @('npm run test:records', 'npm run check:records'); Checks = @('npm run check:records') }
    structure = @{ Title = 'Structure'; Kind = 'node'; Commands = @('npm run test:structure', 'npm run check:structure'); Checks = @('npm run check:structure') }
    tokens    = @{ Title = 'Design tokens'; Kind = 'node'; Commands = @('npm run test:tokens', 'npm run check:tokens'); Checks = @('npm run check:tokens') }
    golden    = @{ Title = 'Agent golden evaluator'; Kind = 'node'; Commands = @('npm run test:golden', 'npm run golden'); Checks = @('npm run golden') }
    contracts = @{ Title = 'OpenAPI contract'; Kind = 'pytest'; Commands = @('npm run test:openapi', 'npm run check:openapi'); Checks = @('npm run check:openapi') }
    typecheck = @{ Title = 'Web type check'; Kind = 'none'; Commands = @('npm --prefix web run typecheck') }
    client    = @{ Title = 'Web client and BFF'; Kind = 'node'; Commands = @('npm --prefix web run test:client') }
    unit      = @{ Title = 'Web offline components'; Kind = 'node'; Commands = @('npm --prefix web run test:unit') }
    backend   = @{ Title = 'Backend'; Kind = 'pytest'; Commands = @('docker compose -f infra/compose.yaml --profile test run --rm tests pytest -q -p no:cacheprovider') }
    # --rerun runs the tests even when Gradle considers them up to date, so every result is from this run.
    android   = @{ Title = 'Android JVM'; Kind = 'junit'; Commands = @('android\gradlew.bat -p android :app:testDebugUnitTest --offline --console=plain --rerun') }
    device    = @{ Title = 'Android device'; Kind = 'instrument'; Commands = @('powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-android-device.ps1') }
    live      = @{ Title = 'Web live journeys'; Kind = 'node'; Commands = @('npm --prefix web run test:e2e') }
}

# "npm run verify -- -Suite client,unit" passes "client,unit" as one string.
$selected = @($Suite | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
$unknown = @($selected | Where-Object { $order -notcontains $_ })
if ($unknown.Count -gt 0) { throw "Unknown suite: $($unknown -join ', '). Choose from: $($order -join ', ')." }
$selected = @($order | Where-Object { $selected -contains $_ })

$started = Get-Date
if (-not $Output) { $Output = Join-Path $root ('.local\verify\' + $started.ToString('yyyyMMdd-HHmmss')) }
New-Item -ItemType Directory -Force -Path $Output | Out-Null
$Output = (Resolve-Path $Output).Path

$saved = @{}
$evidenceErrors = New-Object 'Collections.Generic.List[string]'
function Set-RunVariable([string]$Name, [string]$Value) {
    if (-not $saved.ContainsKey($Name)) { $saved[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process') }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Read-Counts([string]$Kind, [string]$Text, [datetime]$Since) {
    $counts = [ordered]@{}
    if ($Kind -eq 'node') {
        # The node test runner ends with lines such as "ℹ tests 59"; the leading symbol depends on the console.
        foreach ($match in [regex]::Matches($Text, '(?m)^\S*\s+(tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$')) {
            $counts[$match.Groups[1].Value] = [int]$match.Groups[2].Value
        }
        if ($counts.Count -gt 0) {
            foreach ($name in 'tests', 'pass', 'fail') {
                if (-not $counts.Contains($name)) { throw 'Incomplete Node test summary.' }
            }
        }
    } elseif ($Kind -eq 'pytest') {
        $summary = [regex]::Matches($Text, '(?m)^=*\s*((?:\d+ \w+(?:, )?)+) in [\d.]+s')
        if ($summary.Count -gt 0) {
            foreach ($part in [regex]::Matches($summary[$summary.Count - 1].Groups[1].Value, '(\d+) (\w+)')) {
                $counts[$part.Groups[2].Value] = [int]$part.Groups[1].Value
            }
        }
    } elseif ($Kind -eq 'junit') {
        $folder = Join-Path $root 'android\app\build\test-results\testDebugUnitTest'
        $files = @(Get-ChildItem -Path $folder -Filter 'TEST-*.xml' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $Since })
        if ($files.Count -gt 0) {
            $counts['classes'] = $files.Count
            $counts['uncaughtClasses'] = 0
            foreach ($name in 'tests', 'failures', 'errors', 'skipped') { $counts[$name] = 0 }
            foreach ($file in $files) {
                $report = New-Object Xml.XmlDocument
                $report.Load($file.FullName)
                $leafSuites = @($report.SelectNodes('//testsuite[not(.//testsuite)]'))
                if ($leafSuites.Count -eq 0) { throw "$($file.Name): no testsuite elements" }
                foreach ($leaf in $leafSuites) {
                    $values = @{}
                    foreach ($name in 'tests', 'failures', 'errors', 'skipped') {
                        $value = 0
                        if ($leaf.HasAttribute($name) -and (-not [int]::TryParse($leaf.GetAttribute($name), [ref]$value) -or $value -lt 0)) {
                            throw "$($file.Name): invalid JUnit counts"
                        }
                        $values[$name] = $value
                    }
                    if (-not $leaf.HasAttribute('tests') -or $values['failures'] + $values['errors'] + $values['skipped'] -gt $values['tests']) {
                        throw "$($file.Name): invalid JUnit counts"
                    }
                    foreach ($name in 'tests', 'failures', 'errors', 'skipped') { $counts[$name] += $values[$name] }
                }
                $stderr = (@($report.SelectNodes('//system-err')) | ForEach-Object { $_.InnerText }) -join "`n"
                if ($stderr -match '(?m)^\s*Exception in thread "[^"]+"') { $counts['uncaughtClasses']++ }
            }
        }
    } elseif ($Kind -eq 'instrument') {
        # am instrument -r reports each test as started (1), then passed (0), failed (-2), errored (-1), skipped by an
        # assumption (-3) or ignored (-4). A test that started and never finished, as when the app crashes, failed.
        $codes = @([regex]::Matches($Text, '(?m)^INSTRUMENTATION_STATUS_CODE: (-?\d+)') | ForEach-Object { [int]$_.Groups[1].Value })
        if ($codes.Count -gt 0) {
            $passed = @($codes | Where-Object { $_ -eq 0 }).Count
            $failed = @($codes | Where-Object { $_ -eq -1 -or $_ -eq -2 }).Count
            $skipped = @($codes | Where-Object { $_ -eq -3 -or $_ -eq -4 }).Count
            $failed += [Math]::Max(0, @($codes | Where-Object { $_ -eq 1 }).Count - $passed - $failed - $skipped)
            $counts['tests'] = $passed + $failed + $skipped
            $counts['failures'] = $failed
            $counts['skipped'] = $skipped
        }
    }
    return $counts
}

function Get-Tally([string]$Kind, $Totals) {
    # One shape for every runner: node reports tests/pass/fail, pytest passed/failed/errors, JUnit tests/failures/errors.
    if ($Totals.Count -eq 0) { return $null }
    $value = { param($name) if ($Totals.Contains($name)) { [int]$Totals[$name] } else { 0 } }
    $cancelled = 0
    if ($Kind -eq 'node') {
        $failed = & $value 'fail'; $cancelled = & $value 'cancelled'; $skipped = (& $value 'skipped') + (& $value 'todo'); $total = & $value 'tests'
    } elseif ($Kind -eq 'pytest') {
        $failed = (& $value 'failed') + (& $value 'error') + (& $value 'errors'); $skipped = (& $value 'skipped') + (& $value 'xfailed')
        $total = (& $value 'passed') + (& $value 'xpassed') + $failed + $skipped
    } else {
        $failed = (& $value 'failures') + (& $value 'errors'); $skipped = & $value 'skipped'; $total = & $value 'tests'
    }
    if ($total -eq 0 -and $failed -eq 0 -and $cancelled -eq 0) { return $null }
    $passed = $total - $failed - $skipped - $cancelled
    if ($passed -lt 0 -or ($Kind -eq 'node' -and $passed -ne (& $value 'pass'))) { throw 'Inconsistent test counts.' }
    return [ordered]@{ total = $total; passed = $passed; failed = $failed; skipped = $skipped; cancelled = $cancelled }
}

function Format-Tally($Tally) {
    if (-not $Tally) { return '' }
    $text = "$($Tally.passed) of $($Tally.total) passed"
    if ($Tally.failed) { $text += ", $($Tally.failed) failed" }
    if ($Tally.skipped) { $text += ", $($Tally.skipped) skipped" }
    if ($Tally.cancelled) { $text += ", $($Tally.cancelled) cancelled" }
    return $text
}

function Get-Blocker([string]$Name) {
    if ($Name -in @('backend', 'contracts') -and -not (Get-Command docker -ErrorAction SilentlyContinue)) { return 'Docker is not installed or not on PATH.' }
    if ($Name -eq 'backend') {
        # Sessions sharing this tree have written migrations with the same number at the same time; every test then fails
        # with "Multiple heads". Say so at once instead.
        $revisions = @{}
        $follows = @{}
        foreach ($file in @(Get-ChildItem -Path (Join-Path $root 'backend\migrations\versions') -Filter '*.py' -ErrorAction SilentlyContinue)) {
            $code = [IO.File]::ReadAllText($file.FullName)
            $revision = [regex]::Match($code, '(?m)^revision\s*=\s*[''"]([^''"]+)').Groups[1].Value
            if (-not $revision) { continue }
            if ($revisions.ContainsKey($revision)) { return "Two migrations both say revision $revision ($($revisions[$revision]) and $($file.Name)); one must be renumbered." }
            $revisions[$revision] = $file.Name
            $previous = [regex]::Match($code, '(?m)^down_revision\s*=\s*[''"]([^''"]+)').Groups[1].Value
            if ($previous) { $follows[$previous] = $true }
        }
        $heads = @($revisions.Keys | Where-Object { -not $follows.ContainsKey($_) } | Sort-Object)
        if ($heads.Count -gt 1) { return "The migrations have more than one newest revision ($($heads -join ', ')); one must follow the other." }
    }
    if ($Name -eq 'android') {
        if (-not $env:JAVA_HOME) { return 'JAVA_HOME is not set and Android Studio''s runtime was not found.' }
        if (-not (Test-Path (Join-Path $root 'android\gradlew.bat'))) { return 'android\gradlew.bat is missing.' }
    }
    if ($Name -eq 'device') {
        if (-not $env:JAVA_HOME) { return 'JAVA_HOME is not set and Android Studio''s runtime was not found.' }
        $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\sdk' }
        $emulator = Join-Path $sdk 'emulator\emulator.exe'
        if (-not (Test-Path $emulator) -or -not (Test-Path (Join-Path $sdk 'platform-tools\adb.exe'))) { return "The Android emulator or adb is missing from $sdk." }
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $devices = @(& $emulator -list-avds 2>$null | ForEach-Object { "$_".Trim() })
        $ErrorActionPreference = $previous
        # The virtual device the device tests were written for; verify-android-device.ps1 uses it by default.
        if ($devices -notcontains 'community_platform_m0_768f91e4') { return 'The virtual device community_platform_m0_768f91e4 is missing.' }
    }
    if ($Name -eq 'live') {
        try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri ($env:COMMUNITY_WEB_URL.TrimEnd('/') + '/login') | Out-Null }
        catch { return "The web preview at $env:COMMUNITY_WEB_URL did not answer. Start it and the local services first." }
    }
    return $null
}

function Invoke-Suite([string]$Name) {
    $definition = $suites[$Name]
    $log = Join-Path $Output "$Name.log"
    $since = Get-Date
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $blocker = Get-Blocker $Name
    $result = 'passed'
    $totals = [ordered]@{}
    $diagnostics = @()
    if ($blocker) {
        $result = 'not run'
        [IO.File]::WriteAllText($log, "Not run: $blocker`r`n", $utf8)
    } else {
        [IO.File]::WriteAllText($log, '', $utf8)
        foreach ($command in $definition.Commands) {
            Write-Host "[$Name] $command"
            $part = Join-Path $Output "$Name.$([guid]::NewGuid().ToString('N')).part.log"
            $batch = Join-Path $Output "$Name.cmd"
            # A batch file keeps the command exactly as written; PowerShell 5 rewrites quotes in native arguments.
            [IO.File]::WriteAllText($batch, "@echo off`r`ncd /d `"$root`"`r`n(call $command) > `"$part`" 2>&1`r`nexit /b %ERRORLEVEL%`r`n", [Text.Encoding]::ASCII)
            # Wait for cmd.exe itself, not the end of an output pipe: a process the command leaves behind,
            # such as a Gradle daemon, inherits that pipe and keeps it open for hours (T207).
            $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', "`"$batch`"") -NoNewWindow -PassThru
            $null = $process.Handle
            $process.WaitForExit()
            $code = $process.ExitCode
            $stream = [IO.File]::Open($part, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
            try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
            [IO.File]::AppendAllText($log, "> $command`r`n$text`r`n> exit code $code`r`n`r`n", $utf8)
            Remove-Item -LiteralPath $batch
            try { Remove-Item -LiteralPath $part -ErrorAction Stop }
            catch [IO.IOException] {
                [IO.File]::AppendAllText($log, "Retained output file held by a child process: $part`r`n", $utf8)
            }
            if ($code -ne 0) { $result = 'failed' }
            try {
                $counts = Read-Counts $definition.Kind $text $since
                if ($definition.Kind -ne 'none' -and $definition.Checks -notcontains $command -and -not (Get-Tally $definition.Kind $counts)) {
                    throw "No current $($definition.Kind) test results were reported."
                }
            } catch {
                $result = 'failed'
                $counts = [ordered]@{}
                $diagnostics += $_.Exception.Message
                [IO.File]::AppendAllText($log, "Verification failed: $($_.Exception.Message)`r`n", $utf8)
            }
            foreach ($key in $counts.Keys) {
                if ($totals.Contains($key)) { $totals[$key] += $counts[$key] } else { $totals[$key] = $counts[$key] }
            }
        }
    }
    $watch.Stop()
    $tally = Get-Tally $definition.Kind $totals
    # A runner that exits 0 while reporting failures still failed.
    if ($tally -and ($tally.failed -gt 0 -or $tally.cancelled -gt 0)) { $result = 'failed' }
    if ($result -eq 'passed' -and $tally -and $tally.passed -eq 0) {
        $result = 'not run'
        $blocker = 'All reported tests were skipped; no tests passed.'
        [IO.File]::AppendAllText($log, "Not run: $blocker`r`n", $utf8)
    }
    $counted = (@((Format-Tally $tally)) + $diagnostics | Where-Object { $_ }) -join '; '
    if ($definition.Kind -eq 'junit' -and $totals.Contains('uncaughtClasses') -and $totals['uncaughtClasses'] -gt 0) {
        $result = 'failed'
        $diagnostic = "uncaught exceptions in $($totals['uncaughtClasses']) JVM test classes; inspect XML system-err"
        $counted = (@($counted, $diagnostic) | Where-Object { $_ }) -join '; '
        [IO.File]::AppendAllText($log, "Verification failed: $diagnostic.`r`n", $utf8)
    }
    if ($definition.Kind -eq 'instrument' -and $result -eq 'failed') {
        # A class whose process stopped before any test started adds no counts, so name it.
        $classes = [regex]::Match([IO.File]::ReadAllText($log), '(?m)^Classes with problems: (.+?)\s*$')
        if ($classes.Success) { $counted = (@($counted, "problems in $($classes.Groups[1].Value)") | Where-Object { $_ }) -join '; ' }
    }
    if ($Name -eq 'records' -and $result -eq 'failed') {
        $lost = [regex]::Match([IO.File]::ReadAllText($log), '(?m)^Records check: (\d+ records? lost or reverted)\.')
        if ($lost.Success) { $counted = (@($counted, $lost.Groups[1].Value) | Where-Object { $_ }) -join '; ' }
    }
    $entry = [ordered]@{
        suite = $Name; title = $definition.Title; result = $result; tally = $tally; counts = $totals; summary = $counted
        seconds = [math]::Round($watch.Elapsed.TotalSeconds); log = $log; note = $blocker
    }
    $shown = if ($blocker) { "not run: $blocker" } elseif ($counted) { "$result ($counted)" } else { $result }
    Write-Host "[$Name] $shown in $($entry.seconds) s"
    return $entry
}

function Read-GitEvidence([string[]]$Arguments) {
    $previous = $ErrorActionPreference
    try {
        $git = Get-Command git -CommandType Application -ErrorAction Stop
        $ErrorActionPreference = 'Continue'
        $text = @(& $git -C $root @Arguments 2>$null)
        if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') exited with code $LASTEXITCODE." }
        return $text
    } catch {
        $evidenceErrors.Add("Source-state evidence unavailable: $($_.Exception.Message)")
        return $null
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Get-TreeState {
    # Each changed or untracked file with its status and write time, to see what changed while the checks ran.
    $state = @{}
    $listed = @(Read-GitEvidence @('status', '--porcelain', '-uall'))
    foreach ($entry in $listed) {
        if ($entry.Length -lt 4) { continue }
        $path = ($entry.Substring(3) -split ' -> ')[-1].Trim('"')
        $full = Join-Path $root $path
        $stamp = if (Test-Path -LiteralPath $full -PathType Leaf) { (Get-Item -LiteralPath $full).LastWriteTimeUtc.Ticks } else { 'none' }
        $state[$path] = "$($entry.Substring(0, 2))|$stamp"
    }
    return $state
}

Push-Location $root
try {
    Set-RunVariable 'FORCE_COLOR' '0'
    if (-not $env:COMMUNITY_CHROMIUM_PATH) {
        $browsers = Join-Path $env:LOCALAPPDATA 'ms-playwright'
        $chromium = Get-ChildItem -Path $browsers -Directory -Filter 'chromium-*' -ErrorAction SilentlyContinue |
            Sort-Object { [int]($_.Name -replace '\D', '') } -Descending |
            ForEach-Object { Join-Path $_.FullName 'chrome-win64\chrome.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($chromium) { Set-RunVariable 'COMMUNITY_CHROMIUM_PATH' $chromium }
    }
    if ($selected -contains 'android' -or $selected -contains 'device') {
        # Gradle 8.13 cannot run on the newest JDKs; Android Studio's own runtime can.
        $studio = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
        if (Test-Path $studio) { Set-RunVariable 'JAVA_HOME' $studio }
        $sdk = Join-Path $env:LOCALAPPDATA 'Android\sdk'
        if (-not $env:ANDROID_HOME -and (Test-Path $sdk)) { Set-RunVariable 'ANDROID_HOME' $sdk }
    }
    if ($selected -contains 'live' -and -not $env:COMMUNITY_WEB_URL) { Set-RunVariable 'COMMUNITY_WEB_URL' 'http://127.0.0.1:3000' }

    $commit = Read-GitEvidence @('rev-parse', '--short', 'HEAD')
    $changes = @(Read-GitEvidence @('status', '--porcelain')).Count
    $before = Get-TreeState
    if ($evidenceErrors.Count -gt 0) { $changes = $null }
    $shownCommit = if ($commit) { $commit } else { 'unknown' }
    $shownChanges = if ($null -ne $changes) { $changes } else { 'unknown' }
    Write-Host "Checks on $shownCommit with $shownChanges uncommitted changes; logs in $Output"
    $entries = @(foreach ($name in $selected) { Invoke-Suite $name })

    $finished = Get-Date
    $after = Get-TreeState
    $endCommit = Read-GitEvidence @('rev-parse', '--short', 'HEAD')
    # Other sessions share this working tree, so files can change while the suites run.
    $moved = @()
    if ($evidenceErrors.Count -eq 0) {
        $moved = @(@($before.Keys) + @($after.Keys) | Sort-Object -Unique | Where-Object { $before[$_] -ne $after[$_] })
    }
    $invariant = [Globalization.CultureInfo]::InvariantCulture
    $lines = @(
        '# Verification summary', '',
        "Started $($started.ToString('yyyy-MM-dd HH:mm:ss zzz', $invariant)), finished $($finished.ToString('HH:mm:ss', $invariant)), on commit ``$shownCommit`` with $shownChanges uncommitted changes.", ''
    )
    if ($commit -and $endCommit -and $endCommit -ne $commit) { $lines += "A commit was made during the run: it ended on ``$endCommit``.", '' }
    if ($moved.Count -gt 0) {
        $shown = ($moved | Select-Object -First 10 | ForEach-Object { "``$_``" }) -join ', '
        $counted = if ($moved.Count -eq 1) { '1 file' } else { "$($moved.Count) files" }
        $lines += "$counted changed during the run, so the results may mix the states before and after: $shown$(if ($moved.Count -gt 10) { ', ...' }).", ''
    }
    if ($evidenceErrors.Count -gt 0) { $lines += $evidenceErrors.ToArray() + @('') }
    $lines += '| Suite | Result | Counts | Seconds | Log |', '| --- | --- | --- | --- | --- |'
    foreach ($entry in $entries) {
        $result = if ($entry.note) { "not run: $($entry.note)" } else { $entry.result }
        $lines += "| $($entry.title) | $result | $($entry.summary) | $($entry.seconds) | $(Split-Path -Leaf $entry.log) |"
    }
    [IO.File]::WriteAllText((Join-Path $Output 'summary.md'), ($lines -join "`r`n") + "`r`n", $utf8)
    $record = [ordered]@{ started = $started.ToString('o'); finished = $finished.ToString('o'); commit = $commit; endCommit = $endCommit; uncommitted = $changes; changedDuringRun = $moved; evidenceErrors = $evidenceErrors.ToArray(); suites = $entries }
    [IO.File]::WriteAllText((Join-Path $Output 'summary.json'), ($record | ConvertTo-Json -Depth 5), $utf8)

    Write-Host ''
    $lines | Select-Object -Skip 2 | ForEach-Object { Write-Host $_ }
    Write-Host "Summary: $(Join-Path $Output 'summary.md')"
    $failed = @($entries | Where-Object { $_.result -ne 'passed' }).Count
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    Pop-Location
}
if ($failed -gt 0 -or $evidenceErrors.Count -gt 0) { exit 1 }
exit 0
