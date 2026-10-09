$ErrorActionPreference = 'Stop'
$names = @('Read-Counts', 'Get-Tally', 'Format-Tally', 'Invoke-Suite')
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'verify.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
$functions = @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $names -contains $node.Name
}, $true))
if ($functions.Count -ne $names.Count) { throw 'The verification runner functions were not found.' }
foreach ($definition in $functions) { . ([ScriptBlock]::Create($definition.Extent.Text)) }

$root = [IO.Directory]::CreateDirectory((Join-Path ([IO.Path]::GetTempPath()) ('community-verify-test-' + [guid]::NewGuid().ToString('N')))).FullName
$Output = Join-Path $root 'logs'
$reports = Join-Path $root 'android\app\build\test-results\testDebugUnitTest'
$utf8 = New-Object Text.UTF8Encoding($false)
$suites = @{ android = @{ Title = 'Synthetic JVM'; Kind = 'junit'; Commands = @('echo Synthetic successful runner') } }
$syntheticBlocker = $null
$checks = 0
function Get-Blocker([string]$Name) { return $syntheticBlocker }

function Write-Report([string]$Name, [string]$Stderr = '', [int]$Failures = 0, [int]$Skipped = 0, [bool]$Old = $false, [string]$Xml) {
    $path = Join-Path $reports "TEST-$Name.xml"
    if (-not $Xml) {
        $escaped = [Security.SecurityElement]::Escape($Stderr)
        $Xml = "<testsuite name='$Name' tests='3' failures='$Failures' errors='0' skipped='$Skipped'><system-err>$escaped</system-err></testsuite>"
    }
    [IO.File]::WriteAllText($path, $Xml, $utf8)
    $item = Get-Item -LiteralPath $path
    $item.LastWriteTime = if ($Old) { (Get-Date).AddDays(-1) } else { (Get-Date).AddMinutes(1) }
}

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message`: expected '$Expected', got '$Actual'." }
}

try {
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    [IO.Directory]::CreateDirectory($reports) | Out-Null

    $suiteParameter = @($ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq 'Suite' })[0]
    $defaults = $suiteParameter.DefaultValue.SafeGetValue()
    $configuration = @{}
    foreach ($name in @('order', 'suites')) {
        $assignment = $ast.Find({
            param($node)
            $node -is [Management.Automation.Language.AssignmentStatementAst] -and
                $node.Left -is [Management.Automation.Language.VariableExpressionAst] -and
                $node.Left.VariablePath.UserPath -eq $name
        }, $false)
        if (-not $assignment) { throw "The runner's $name declaration was not found." }
        $configuration[$name] = & ([ScriptBlock]::Create($assignment.Right.Extent.Text))
    }
    $expectedOrder = @('runner', 'records', 'structure', 'tokens', 'golden', 'contracts', 'typecheck', 'client', 'unit', 'backend', 'android', 'device', 'live')
    Assert-Equal ($configuration.order -join ',') ($expectedOrder -join ',') 'Golden follows tokens without removing prior suites'
    Assert-Equal ($defaults -join ',') (($expectedOrder | Where-Object { $_ -notin @('device', 'live') }) -join ',') 'Golden is included in default suites'
    Assert-Equal (($configuration.suites.Keys | Sort-Object) -join ',') (($expectedOrder | Sort-Object) -join ',') 'Every suite retains its definition'
    Assert-Equal $configuration.suites.golden.Kind 'node' 'Golden uses Node test counts'
    Assert-Equal ($configuration.suites.golden.Commands -join ',') 'npm run test:golden,npm run golden' 'Evaluator tests run before offline inventory'
    Assert-Equal ($configuration.suites.golden.Checks -join ',') 'npm run golden' 'Inventory is a count-free check'
    $checks++

    Write-Report 'fixture'
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'passed' 'Clean reports pass'
    Assert-Equal $entry.tally.passed 3 'Test totals are preserved'
    $checks++

    Write-Report 'fixture' 'WARNING: synthetic diagnostic' -Skipped 1
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'passed' 'Warnings are not uncaught exceptions'
    Assert-Equal $entry.tally.passed 2 'Skipped tests are not passed'
    Assert-Equal $entry.tally.skipped 1 'Skipped tests stay visible'
    $checks++

    $fatal = 'Exception in thread "DefaultDispatcher-worker-2" kotlinx.coroutines.CoroutinesInternalError: Fatal exception in coroutines machinery'
    Write-Report 'fixture' $fatal
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Uncaught worker errors fail despite exit zero'
    Assert-Equal $entry.counts.uncaughtClasses 1 'The affected class is counted'
    Assert-Equal $entry.tally.passed 3 'Worker errors do not invent failed test cases'
    if ($entry.summary -notmatch 'uncaught exceptions in 1 JVM test class') { throw 'The summary omitted the uncaught error.' }
    $checks++

    Write-Report 'other' ($fatal + "`n" + $fatal)
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Multiple affected classes fail'
    Assert-Equal $entry.counts.uncaughtClasses 2 'Classes, not duplicated stack traces, are counted'
    Assert-Equal $entry.tally.total 6 'All fresh reports contribute their test counts'
    $checks++

    Write-Report 'fixture'
    Write-Report 'other' $fatal -Old $true
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'passed' 'Old reports do not poison the current run'
    Assert-Equal $entry.counts.classes 1 'Only fresh reports are counted'
    $checks++

    Write-Report 'fixture' -Old $true
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Stale-only reports cannot pass'
    Assert-Equal $entry.tally $null 'Missing current results have no tally'
    if ($entry.summary -notmatch 'No current junit test results') { throw 'Missing results were not explained.' }
    $checks++

    Write-Report 'fixture' -Failures 1
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Ordinary JUnit failures still fail'
    Assert-Equal $entry.tally.failed 1 'Ordinary failures retain their count'
    $checks++

    $nested = '<testsuite tests="5" failures="1" errors="1" skipped="1"><testsuite tests="3" failures="1" skipped="1"/><testsuite tests="2" errors="1"/></testsuite><testsuite tests="1"/>'
    foreach ($xml in @("<testsuites>$nested</testsuites>", "<testsuite tests='99' failures='0'>$nested</testsuite>")) {
        Write-Report 'fixture' -Xml $xml
        $entry = Invoke-Suite 'android'
        Assert-Equal $entry.result 'failed' 'Nested failures override successful wrapper totals and exit zero'
        Assert-Equal $entry.counts.classes 1 'Nested suites do not invent report files'
        Assert-Equal $entry.tally.total 6 'Only leaf suite counts contribute to totals'
        Assert-Equal $entry.tally.passed 3 'Nested passed counts are preserved'
        Assert-Equal $entry.tally.failed 2 'Nested failures and errors are preserved'
        Assert-Equal $entry.tally.skipped 1 'Nested skipped counts are preserved'
        $checks++
    }

    Write-Report 'fixture' -Xml '<testsuites><testsuite tests="2"/><testsuite tests="1" skipped="1"/></testsuites>'
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'passed' 'Nested clean reports pass without wrapper totals'
    Assert-Equal $entry.tally.total 3 'Nested clean totals are preserved'
    Assert-Equal $entry.tally.passed 2 'Missing optional attributes default to zero'
    Assert-Equal $entry.tally.skipped 1 'Nested clean skipped counts are preserved'
    $checks++

    foreach ($xml in @(
        '<testsuite failures="0"/>',
        '<testsuite tests="-1"/>',
        '<testsuite tests="3" failures="-1"/>',
        '<testsuite tests="3" errors="-1"/>',
        '<testsuite tests="3" skipped="-1"/>',
        '<testsuite tests="2" failures="1" errors="1" skipped="1"/>',
        '<testsuite tests="0" skipped="1"/>',
        '<testsuites><testsuite tests="1" failures="2"/><testsuite tests="3"/></testsuites>',
        '<testsuites><testsuite tests="1" failures="-1"/><testsuite tests="2" failures="1"/></testsuites>',
        '<testsuite tests=""/>',
        '<testsuite tests="1.5"/>',
        '<testsuite tests="3" skipped="invalid"/>'
    )) {
        Write-Report 'fixture' -Xml $xml
        $entry = Invoke-Suite 'android'
        Assert-Equal $entry.result 'failed' "Invalid leaf counts fail at exit zero: $xml"
        Assert-Equal $entry.tally $null 'Invalid counts never contribute to a tally'
        if ($entry.summary -notmatch 'invalid JUnit counts') { throw 'Invalid counts were not explained.' }
        $checks++
    }

    Write-Report 'fixture' -Xml '<testsuites/>'
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Reports without test suites fail'
    Assert-Equal $entry.tally $null 'Reports without test suites have no tally'
    if ($entry.summary -notmatch 'no testsuite elements') { throw 'Missing test suites were not explained.' }
    $checks++

    [IO.File]::WriteAllText((Join-Path $reports 'TEST-fixture.xml'), '<testsuite', $utf8)
    (Get-Item -LiteralPath (Join-Path $reports 'TEST-fixture.xml')).LastWriteTime = (Get-Date).AddMinutes(1)
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Malformed XML fails without aborting subsequent suites'
    $checks++

    $suites['node'] = @{ Title = 'Synthetic Node'; Kind = 'node'; Commands = @('echo Successful command with no results') }
    $entry = Invoke-Suite 'node'
    Assert-Equal $entry.result 'failed' 'A successful command without test results cannot pass'
    $checks++

    $suites['node'].Commands = @('echo # tests 5 & echo # pass 1 & echo # fail 1 & echo # cancelled 1 & echo # skipped 1 & echo # todo 1')
    $entry = Invoke-Suite 'node'
    Assert-Equal $entry.result 'failed' 'Reported failure and cancellation override exit zero'
    Assert-Equal $entry.tally.failed 1 'Failures do not include cancellations'
    Assert-Equal $entry.tally.cancelled 1 'Cancellations remain distinct'
    Assert-Equal $entry.tally.skipped 2 'Skipped and todo tests are not passed'
    Assert-Equal $entry.tally.passed 1 'Only successful tests are passed'
    $checks++

    $suites['node'].Commands = @('echo # tests 1 & echo # pass 0 & echo # fail 0 & echo # skipped 1')
    $entry = Invoke-Suite 'node'
    Assert-Equal $entry.result 'not run' 'An all-skipped suite is not a pass'
    $checks++

    $suites['node'].Commands = @('echo # tests 1 & echo # pass 1 & echo # fail 0 & exit /b 7', 'echo # tests 1 & echo # pass 1 & echo # fail 0')
    $entry = Invoke-Suite 'node'
    Assert-Equal $entry.result 'failed' 'Nonzero exits override successful counts'
    Assert-Equal $entry.tally.passed 2 'Later commands still execute after failure'
    if ([IO.File]::ReadAllText($entry.log) -notmatch 'exit code 7') { throw 'The nonzero exit was not logged.' }
    $checks++

    $suites['golden'] = $configuration.suites.golden.Clone()
    foreach ($code in @(0, 7)) {
        $inventory = "echo Offline golden inventory & exit /b $code"
        $suites['golden'].Commands = @('echo # tests 2 & echo # pass 2 & echo # fail 0', $inventory)
        $suites['golden'].Checks = @($inventory)
        $entry = Invoke-Suite 'golden'
        $expected = if ($code -eq 0) { 'passed' } else { 'failed' }
        Assert-Equal $entry.result $expected 'Inventory exit status controls the suite despite passing evaluator tests'
        Assert-Equal $entry.tally.total 2 'Inventory does not add test counts'
        Assert-Equal $entry.tally.passed 2 'Passing evaluator counts are preserved'
        Assert-Equal $entry.tally.failed 0 'Inventory failures do not invent failed test cases'
        Assert-Equal $entry.summary '2 of 2 passed' 'Inventory does not require a Node summary'
        $log = [IO.File]::ReadAllText($entry.log)
        if ($log -notmatch 'Offline golden inventory' -or $log -notmatch "exit code $code") { throw 'The inventory result was not logged.' }
        $checks++
    }

    $syntheticBlocker = 'Synthetic missing prerequisite'
    $entry = Invoke-Suite 'node'
    Assert-Equal $entry.result 'not run' 'Missing prerequisites are not passes'
    Assert-Equal $entry.tally $null 'Blocked suites do not invent results'
    $syntheticBlocker = $null
    $checks++

    $tally = Get-Tally 'pytest' (Read-Counts 'pytest' '=== 3 passed, 1 error, 2 skipped, 1 xfailed in 0.12s ===' (Get-Date))
    Assert-Equal $tally.total 7 'Pytest total includes errors and expected failures'
    Assert-Equal $tally.failed 1 'Pytest errors fail'
    Assert-Equal $tally.skipped 3 'Pytest skipped and expected failures remain visible'
    $checks++

    # T207: a command can leave a process running, as Gradle leaves its daemon, that holds the command's output handle for hours.
    $suites['helper'] = @{ Title = 'Synthetic helper'; Kind = 'none'; Commands = @('start "" /b powershell -NoProfile -Command "Set-Content -LiteralPath helper.pid -Value $PID; Start-Sleep -Seconds 30" & echo Synthetic helper left running') }
    $entry = Invoke-Suite 'helper'
    $deadline = (Get-Date).AddSeconds(10)
    while (-not $helperId -and (Get-Date) -lt $deadline) {
        $helperId = [int](Get-Content -LiteralPath (Join-Path $root 'helper.pid') -ErrorAction SilentlyContinue | Select-Object -First 1)
        if (-not $helperId) { Start-Sleep -Milliseconds 100 }
    }
    if (-not $helperId) { throw 'The synthetic helper did not start.' }
    if (-not (Get-Process -Id $helperId -ErrorAction SilentlyContinue)) { throw 'The runner waited for a process the command left running.' }
    Assert-Equal $entry.result 'passed' 'A command that leaves a process running still reports its own result'
    if ([IO.File]::ReadAllText($entry.log) -notmatch 'Synthetic helper left running') { throw 'The command output was not kept.' }
    $checks++

    $scripts = [IO.Directory]::CreateDirectory((Join-Path $root 'scripts')).FullName
    $bin = [IO.Directory]::CreateDirectory((Join-Path $root 'evidence-bin')).FullName
    $wrapper = Join-Path $scripts 'verify.ps1'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verify.ps1') -Destination $wrapper
    $gitPath = Join-Path $bin 'git.cmd'
    $savedPath = $env:PATH
    try {
        $env:PATH = $bin
        foreach ($failure in @('none', 'rev-parse', 'status', 'after', 'missing')) {
            $evidenceOutput = Join-Path $Output "evidence $failure"
            $marker = Join-Path $evidenceOutput 'after.marker'
            $gitText = "@echo off`r`n"
            if ($failure -in @('rev-parse', 'status')) { $gitText += "if `"%~3`"==`"$failure`" exit /b 9`r`n" }
            if ($failure -eq 'after') { $gitText += "if exist `"$marker`" exit /b 9`r`n" }
            $gitText += "if `"%~3`"==`"rev-parse`" echo abc1234`r`nexit /b 0`r`n"
            [IO.File]::WriteAllText($gitPath, $gitText, [Text.Encoding]::ASCII)
            if ($failure -eq 'missing') { Remove-Item -LiteralPath $gitPath }
            $npmText = "@echo off`r`necho Synthetic successful check`r`n"
            if ($failure -eq 'after') { $npmText += "type nul > `"$marker`"`r`n" }
            $npmText += "exit /b 0`r`n"
            [IO.File]::WriteAllText((Join-Path $bin 'npm.cmd'), $npmText, [Text.Encoding]::ASCII)
            $wrapperOutput = @(& (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $wrapper -Suite typecheck -Output $evidenceOutput 2>&1)
            $code = $LASTEXITCODE
            $expectedCode = if ($failure -eq 'none') { 0 } else { 1 }
            Assert-Equal $code $expectedCode "Git evidence $failure exit code: $($wrapperOutput -join [Environment]::NewLine)"
            $record = [IO.File]::ReadAllText((Join-Path $evidenceOutput 'summary.json')) | ConvertFrom-Json
            Assert-Equal $record.suites[0].result 'passed' 'Missing evidence does not rewrite a successful suite result'
            Assert-Equal $record.changedDuringRun.Count 0 'Missing evidence does not invent source changes'
            if ($failure -eq 'none') {
                Assert-Equal $record.evidenceErrors.Count 0 'Successful Git commands produce no evidence errors'
                Assert-Equal $record.commit 'abc1234' 'The starting commit is preserved'
                Assert-Equal $record.endCommit 'abc1234' 'The ending commit is preserved'
                Assert-Equal $record.uncommitted 0 'A clean source state retains its count'
            } else {
                if ($record.evidenceErrors.Count -eq 0) { throw "Git evidence $failure errors were omitted from JSON." }
                $summary = [IO.File]::ReadAllText((Join-Path $evidenceOutput 'summary.md'))
                if ($summary -notmatch 'Source-state evidence unavailable:') { throw 'Missing Git evidence was omitted from the summary.' }
                if ($summary -match 'A commit was made during the run:') { throw 'Missing Git evidence invented a commit change.' }
                if ($failure -ne 'missing' -and ($record.evidenceErrors -join '') -notmatch 'exited with code 9') { throw 'The Git exit code was omitted.' }
                if ($failure -eq 'after') {
                    Assert-Equal $record.commit 'abc1234' 'Ending failures preserve the starting commit'
                    Assert-Equal $record.endCommit $null 'An unavailable ending commit is not invented'
                } else {
                    Assert-Equal $record.uncommitted $null 'Unavailable source state is not reported as clean'
                }
            }
            $checks++
        }
    } finally {
        $env:PATH = $savedPath
    }

    Write-Output "# tests $checks"
    Write-Output "# pass $checks"
    Write-Output '# fail 0'
} finally {
    if ($helperId) {
        Stop-Process -Id $helperId -Force -ErrorAction SilentlyContinue
        Wait-Process -Id $helperId -Timeout 10 -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $root -Recurse -Force
}
