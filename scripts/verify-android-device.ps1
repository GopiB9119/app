<#
.SYNOPSIS
Runs the Android device tests on an emulator this script starts and stops, with the network off.

.DESCRIPTION
Starts a read-only emulator, so nothing the tests do is saved to the virtual device, on the first free console port
from 5584. While it starts, the script builds the debug app and its tests. It then switches the emulator's network off,
sets a 640 x 1280 screen at density 320 (320 dp wide), installs copies of the two APKs, so that another session's build
cannot replace them halfway, and runs each device test class on its own. The live journeys, which need the local
services (`community_local_integration`), are left out. The font scale must be the same after each class as before it.

The emulator is shut down at the end, also after a failure. The script never uses or stops an emulator it did not
start. Logs and the APK copies go to .local\verify-device.

.PARAMETER Avd
The virtual device. The default is the API 36 image the device tests were written for.

.PARAMETER Class
Run only these classes (fully qualified names), instead of every class that needs no local services.

.PARAMETER BootMinutes
How long to wait for the emulator to start.

.PARAMETER SettleSeconds
How long to wait after the emulator reports that it has started. Just after start, Android is still busy and stops
processes that do not answer in time, including a test run's own process.

.PARAMETER AppApk
With TestApk, install these two APKs instead of building, for example the copies an earlier run kept.

.PARAMETER TestApk
The test APK that goes with AppApk.

.EXAMPLE
npm run verify -- -Suite device

.EXAMPLE
.\scripts\verify-android-device.ps1 -Class com.community.platform.feature.care.CareScreenTest
#>
param(
    [string]$Avd = 'community_platform_m0_768f91e4',
    [string[]]$Class,
    [int]$BootMinutes = 15,
    [int]$SettleSeconds = 60,
    [string]$AppApk,
    [string]$TestApk
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emulator = Join-Path $sdk 'emulator\emulator.exe'
$runner = 'com.community.platform.debug.test/androidx.test.runner.AndroidJUnitRunner'
foreach ($tool in $adb, $emulator) { if (-not (Test-Path $tool)) { throw "Missing $tool" } }
if (-not $env:JAVA_HOME) {
    # Gradle 8.13 cannot run on the newest JDKs; Android Studio's own runtime can.
    $studio = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
    if (Test-Path $studio) { $env:JAVA_HOME = $studio }
}
# Gradle finds the SDK only through ANDROID_HOME or android\local.properties, which is not kept in the repository.
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = $sdk }

function Invoke-Native([string]$File, [string[]]$Arguments) {
    # Native tools write progress to standard error, which PowerShell 5 would turn into errors.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $lines = @(& $File @Arguments 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return [pscustomobject]@{ Code = $code; Text = ($lines -join "`n").Trim() }
}

function Invoke-Device([string]$Command) {
    $result = Invoke-Native $adb (@('-s', $serial) + $Command.Split(' '))
    if ($result.Code -ne 0) { throw "adb $Command failed: $($result.Text)" }
    return $result.Text
}

function Write-Step([string]$Text) { Write-Output "[$((Get-Date).ToString('HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture))] $Text" }

if (-not $Class) {
    $Class = @(Get-ChildItem -Recurse -File -Path (Join-Path $root 'android\app\src\androidTest') -Filter '*.kt' | Sort-Object FullName | ForEach-Object {
        $code = [IO.File]::ReadAllText($_.FullName)
        if ($code -notmatch '@RunWith' -or $code.Contains('community_local_integration')) { return }
        $package = [regex]::Match($code, '(?m)^package\s+([\w.]+)').Groups[1].Value
        foreach ($match in [regex]::Matches($code, '(?m)^class\s+(\w+)')) { "$package.$($match.Groups[1].Value)" }
    })
}
if ($Class.Count -eq 0) { throw 'No device test classes were found.' }

$listening = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.LocalPort })
$attached = (Invoke-Native $adb @('devices')).Text
$port = 5584..5598 | Where-Object { $_ % 2 -eq 0 -and $listening -notcontains $_ -and $listening -notcontains ($_ + 1) -and $attached -notmatch "emulator-$_\b" } | Select-Object -First 1
if (-not $port) { throw 'No free emulator console port between 5584 and 5598.' }
$serial = "emulator-$port"

$folder = Join-Path $root '.local\verify-device'
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$emulatorLog = Join-Path $folder "emulator-$stamp.log"
$started = $null
$machines = @()
$rows = @()
$problems = @()
try {
    $arguments = @('-avd', $Avd, '-port', "$port", '-read-only', '-no-snapshot-load', '-no-snapshot-save', '-no-audio', '-no-boot-anim',
        '-no-window', '-gpu', 'software', '-feature', '-Vulkan', '-memory', '4096', '-cores', '4')
    $started = Start-Process -FilePath $emulator -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardOutput $emulatorLog -RedirectStandardError "$emulatorLog.err"
    $null = $started.Handle  # Keeps the exit code readable once it has stopped.
    Write-Step "Started $Avd on $serial (process $($started.Id), read-only); its log is $emulatorLog"

    if ($AppApk -or $TestApk) {
        if (-not ($AppApk -and $TestApk)) { throw 'Give both AppApk and TestApk, or neither.' }
        $apks = @((Resolve-Path -LiteralPath $AppApk).Path, (Resolve-Path -LiteralPath $TestApk).Path)
        Write-Step "Using $($apks -join ' and ') instead of building"
    } else {
        Write-Step 'Building the debug app and its tests while the emulator starts'
        $gradle = @('-p', (Join-Path $root 'android'), ':app:assembleDebug', ':app:assembleDebugAndroidTest', '--offline', '--console=plain')
        $build = Invoke-Native (Join-Path $root 'android\gradlew.bat') $gradle
        if ($build.Code -ne 0) {
            # Other sessions build the same tree; a build that ran into theirs usually passes a minute later.
            Write-Output (($build.Text -split "`n" | Where-Object { $_ -match '^(e: |\* What went wrong|> )' } | Select-Object -First 20) -join "`n")
            Write-Step 'The build failed; trying once more in 60 seconds'
            Start-Sleep -Seconds 60
            $build = Invoke-Native (Join-Path $root 'android\gradlew.bat') $gradle
        }
        if ($build.Code -ne 0) {
            Write-Output (($build.Text -split "`n" | Where-Object { $_ -match '^(e: |\* What went wrong|> )' } | Select-Object -First 20) -join "`n")
            throw 'The Android build failed.'
        }
        Write-Output (($build.Text -split "`n" | Select-Object -Last 3) -join "`n")
        $apks = foreach ($apk in 'debug\app-debug.apk', 'androidTest\debug\app-debug-androidTest.apk') {
            $copy = Join-Path $folder "$stamp-$(Split-Path -Leaf $apk)"
            Copy-Item -LiteralPath (Join-Path $root "android\app\build\outputs\apk\$apk") -Destination $copy
            $copy
        }
    }

    $deadline = (Get-Date).AddMinutes($BootMinutes)
    $boot = ''
    while ($boot -ne '1') {
        if ($started.HasExited) { throw "The emulator stopped while starting (exit code $($started.ExitCode)); see $emulatorLog." }
        if ((Get-Date) -gt $deadline) { throw "The emulator did not finish starting within $BootMinutes minutes." }
        Start-Sleep -Seconds 10
        $boot = (Invoke-Native $adb @('-s', $serial, 'shell', 'getprop', 'sys.boot_completed')).Text
    }
    # The console port must be served by the emulator this script started, never by another session's.
    $machines = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($started.Id)" | ForEach-Object { [int]$_.ProcessId })
    $owners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.OwningProcess })
    if (-not @($owners | Where-Object { $_ -eq $started.Id -or $machines -contains $_ })) { throw "Port $port is not served by the emulator this script started." }
    $name = ((Invoke-Native $adb @('-s', $serial, 'emu', 'avd', 'name')).Text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'OK' }) -join ','
    if ($name -ne $Avd) { throw "Unexpected virtual device on $serial : $name" }
    Write-Step "$serial has started; letting it settle for $SettleSeconds seconds"
    Start-Sleep -Seconds $SettleSeconds

    foreach ($command in 'shell cmd connectivity airplane-mode enable', 'shell svc wifi disable',
        'shell settings put global mobile_data 0', 'shell wm size 640x1280', 'shell wm density 320') { Invoke-Device $command | Out-Null }
    # A virtual device without telephony has no mobile data to switch off; the checks below still prove the network is off.
    $data = Invoke-Native $adb @('-s', $serial, 'shell', 'svc', 'data', 'disable')
    if ($data.Code -ne 0 -and $data.Text -notmatch "Can't find service: phone") { throw "adb shell svc data disable failed: $($data.Text)" }
    $airplane = Invoke-Device 'shell settings get global airplane_mode_on'
    $wifi = (Invoke-Device 'shell cmd wifi status') -split "`n" | Select-Object -First 1
    $mobile = Invoke-Device 'shell settings get global mobile_data'
    if ($airplane -ne '1' -or $wifi -notmatch 'Wifi is disabled' -or $mobile -ne '0') { throw "The network is not off: airplane mode $airplane, mobile data $mobile, $wifi" }
    Write-Step "Network off (airplane mode $airplane, $wifi, mobile data $mobile); screen 640x1280 at density 320"

    foreach ($apk in $apks) {
        $installed = Invoke-Native $adb @('-s', $serial, 'install', '-r', $apk)
        if ($installed.Code -ne 0) { throw "Installing $(Split-Path -Leaf $apk) failed: $($installed.Text)" }
    }
    Write-Step "Installed $(($apks | ForEach-Object { Split-Path -Leaf $_ }) -join ' and ')"

    foreach ($name in $Class) {
        $before = Invoke-Device 'shell settings get system font_scale'
        Write-Output "> $name"
        $instrument = @('-s', $serial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'community_disposable_ui_fixture', 'true', '-e', 'class', $name, $runner)
        $result = Invoke-Native $adb $instrument
        Write-Output $result.Text
        $notes = @()
        if ($result.Text -notmatch '(?m)^INSTRUMENTATION_STATUS_CODE:') {
            # The process was stopped before any test started, as Android does with a slow start on a busy system.
            # No test result is discarded, so one more attempt is safe; a class that crashes at start crashes again.
            Write-Step "No test of $name started; trying the class once more in 30 seconds"
            Start-Sleep -Seconds 30
            $result = Invoke-Native $adb $instrument
            Write-Output $result.Text
            $notes += 'run twice: no test started the first time'
        }
        $after = Invoke-Device 'shell settings get system font_scale'
        # Each test reports started (1), then passed (0), failed (-2), errored (-1), skipped by an assumption (-3) or ignored (-4).
        $codes = @([regex]::Matches($result.Text, '(?m)^INSTRUMENTATION_STATUS_CODE: (-?\d+)') | ForEach-Object { [int]$_.Groups[1].Value })
        $passed = @($codes | Where-Object { $_ -eq 0 }).Count
        $failed = @($codes | Where-Object { $_ -eq -1 -or $_ -eq -2 }).Count
        $skipped = @($codes | Where-Object { $_ -eq -3 -or $_ -eq -4 }).Count
        $unfinished = [Math]::Max(0, @($codes | Where-Object { $_ -eq 1 }).Count - $passed - $failed - $skipped)
        $faults = @()
        if ($result.Text -notmatch '(?m)^INSTRUMENTATION_CODE: -1\s*$') { $faults += 'the run did not finish normally' }
        if ($unfinished) { $faults += "$unfinished started and never finished" }
        if ($passed + $failed + $skipped -eq 0) { $faults += 'no test ran' }
        if ($after -ne $before) {
            $faults += "font scale $before before and $after after"
            Invoke-Device "shell settings put system font_scale $before" | Out-Null
        }
        if ($failed -or $skipped -or $faults) { $problems += $name }
        $rows += [pscustomobject]@{ Class = $name.Split('.')[-1]; Passed = $passed; Failed = $failed + $unfinished; Skipped = $skipped; Notes = (@($faults) + @($notes)) -join '; ' }
    }
} finally {
    if ($started) {
        # The virtual machine runs as a child of the emulator process; find it before the emulator stops.
        $machines += @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($started.Id)" -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.ProcessId })
        if (-not $started.HasExited) {
            Invoke-Native $adb @('-s', $serial, 'emu', 'kill') | Out-Null
            $deadline = (Get-Date).AddSeconds(90)
            while (-not $started.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3 }
        }
        # Stop only what this script started: the emulator and the virtual machine it launched.
        foreach ($id in @($machines | Sort-Object -Unique) + @($started.Id)) {
            $process = Get-Process -Id $id -ErrorAction SilentlyContinue
            if ($process -and $process.ProcessName -match '^(emulator|qemu-system)') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
        }
        Write-Step "Emulator on $serial shut down"
    }
}

Write-Output ''
Write-Output ($rows | Format-Table -AutoSize | Out-String -Width 200).TrimEnd()
$total = ($rows | Measure-Object -Property Passed -Sum).Sum
Write-Output "Device tests: $total passed in $($rows.Count) classes; $(($rows | Measure-Object -Property Failed -Sum).Sum) failed, $(($rows | Measure-Object -Property Skipped -Sum).Sum) skipped."
if ($problems.Count -gt 0) {
    Write-Output "Classes with problems: $(($problems | ForEach-Object { $_.Split('.')[-1] }) -join ', ')"
    exit 1
}
exit 0
