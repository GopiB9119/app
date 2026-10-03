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
function Get-Blocker([string]$Name) { return $null }

function Write-Report([string]$Name, [string]$Stderr = '', [int]$Failures = 0, [int]$Skipped = 0, [bool]$Old = $false) {
    $path = Join-Path $reports "TEST-$Name.xml"
    $escaped = [Security.SecurityElement]::Escape($Stderr)
    [IO.File]::WriteAllText($path, "<testsuite name='$Name' tests='3' failures='$Failures' errors='0' skipped='$Skipped'><system-err>$escaped</system-err></testsuite>", $utf8)
    $item = Get-Item -LiteralPath $path
    $item.LastWriteTime = if ($Old) { (Get-Date).AddDays(-1) } else { (Get-Date).AddMinutes(1) }
}

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message`: expected '$Expected', got '$Actual'." }
}

try {
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    [IO.Directory]::CreateDirectory($reports) | Out-Null

    Write-Report 'fixture'
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'passed' 'Clean reports pass'
    Assert-Equal $entry.tally.passed 3 'Test totals are preserved'

    Write-Report 'fixture' 'WARNING: synthetic diagnostic' -Skipped 1
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'passed' 'Warnings are not uncaught exceptions'
    Assert-Equal $entry.tally.passed 2 'Skipped tests are not passed'
    Assert-Equal $entry.tally.skipped 1 'Skipped tests stay visible'

    $fatal = 'Exception in thread "DefaultDispatcher-worker-2" kotlinx.coroutines.CoroutinesInternalError: Fatal exception in coroutines machinery'
    Write-Report 'fixture' $fatal
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Uncaught worker errors fail despite exit zero'
    Assert-Equal $entry.counts.uncaughtClasses 1 'The affected class is counted'
    Assert-Equal $entry.tally.passed 3 'Worker errors do not invent failed test cases'
    if ($entry.summary -notmatch 'uncaught exceptions in 1 JVM test class') { throw 'The summary omitted the uncaught error.' }

    Write-Report 'other' ($fatal + "`n" + $fatal)
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Multiple affected classes fail'
    Assert-Equal $entry.counts.uncaughtClasses 2 'Classes, not duplicated stack traces, are counted'
    Assert-Equal $entry.tally.total 6 'All fresh reports contribute their test counts'

    Write-Report 'fixture'
    Write-Report 'other' $fatal -Old $true
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'passed' 'Old reports do not poison the current run'
    Assert-Equal $entry.counts.classes 1 'Only fresh reports are counted'

    Write-Report 'fixture' -Failures 1
    $entry = Invoke-Suite 'android'
    Assert-Equal $entry.result 'failed' 'Ordinary JUnit failures still fail'
    Assert-Equal $entry.tally.failed 1 'Ordinary failures retain their count'

    Write-Output '# tests 6'
    Write-Output '# pass 6'
    Write-Output '# fail 0'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force
}
