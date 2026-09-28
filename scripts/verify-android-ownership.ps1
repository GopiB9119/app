param(
    [switch]$IncludeLive,
    [ValidateRange(60, 900)][int]$BootTimeoutSeconds = 600,
    [ValidateSet('', 'ownershipOfferShowsExactMemberAndWaitsForConfirmation')][string]$OfflineTest = '',
    [ValidateSet('community_ownership_verify_20260926', 'community_ownership_api361_20260926')]
    [string]$Fixture = 'community_ownership_verify_20260926'
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sdk = Join-Path $env:LOCALAPPDATA 'Android\sdk'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$avd = $Fixture
$serial = 'emulator-5584'
$port = 5584
$runName = 'ownership-device-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$output = Join-Path $root ('.local\' + $runName)
$null = [System.IO.Directory]::CreateDirectory($output)
$result = [ordered]@{ StartedUtc = [DateTime]::UtcNow.ToString('o'); Avd = $avd; Serial = $serial; IncludeLive = [bool]$IncludeLive; OfflineTest = $OfflineTest; Phase = 'preflight'; OfflinePassed = 0; LivePassed = 0; Artifacts = @(); Failure = $null; LauncherPid = $null; RuntimePid = $null; EmulatorExitCode = $null; ForcedShutdown = $false }
$emulator = $null
$stdout = $null
$stderr = $null
$stderrCopy = $null
$postBootOutput = $null

function Invoke-FixtureAdb([string[]]$Arguments) {
    $settings = [System.Diagnostics.ProcessStartInfo]::new()
    $settings.FileName = $adb
    $quoted = @($Arguments | ForEach-Object {
        if ($_.Contains('"') -or $_.EndsWith('\')) { throw 'Unsupported fixture argument' }
        '"' + $_ + '"'
    })
    $settings.Arguments = "-s $serial " + ($quoted -join ' ')
    $settings.UseShellExecute = $false
    $settings.CreateNoWindow = $true
    $settings.RedirectStandardOutput = $true
    $settings.RedirectStandardError = $true
    $probe = [System.Diagnostics.Process]::Start($settings)
    $handle = $probe.Handle
    try {
        $text = $probe.StandardOutput.ReadToEndAsync()
        $errors = $probe.StandardError.ReadToEndAsync()
        if (-not $probe.WaitForExit(60000)) { throw "Fixture ADB command timed out: $($Arguments -join ' ')" }
        if ($probe.ExitCode -ne 0) { throw "Fixture ADB command failed: $($Arguments -join ' '): $($errors.GetAwaiter().GetResult().Trim())" }
        return $text.GetAwaiter().GetResult() -split '\r?\n' | Where-Object { $_ -ne '' }
    } finally {
        if (-not $probe.HasExited) { $probe.Kill(); $probe.WaitForExit() }
        $probe.Dispose()
    }
}

function Save-FixtureImage([string]$Name) {
    if ($Name -notmatch '^ownership-native-(large-text|live)\.png$') { throw 'Unexpected screenshot name' }
    Assert-Fixture
    $remote = "/sdcard/Android/data/com.community.platform.debug/files/test-evidence/$Name"
    $size = [long](Invoke-FixtureAdb @('shell', 'stat', '-c', '%s', $remote) | Out-String).Trim()
    $before = (Invoke-FixtureAdb @('shell', 'sha256sum', $remote) | Out-String).Split(' ')[0].Trim()
    if ($size -lt 1000 -or $size -gt 5242880 -or $before -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected test screenshot metadata' }
    $partial = Join-Path $output ($Name + '.partial')
    $settings = [System.Diagnostics.ProcessStartInfo]::new()
    $settings.FileName = $adb
    $settings.Arguments = "-s $serial exec-out cat $remote"
    $settings.UseShellExecute = $false
    $settings.CreateNoWindow = $true
    $settings.RedirectStandardOutput = $true
    $settings.RedirectStandardError = $true
    $transfer = [System.Diagnostics.Process]::Start($settings)
    $handle = $transfer.Handle
    $file = [System.IO.FileStream]::new($partial, [System.IO.FileMode]::CreateNew)
    try {
        $copy = $transfer.StandardOutput.BaseStream.CopyToAsync($file)
        $errors = $transfer.StandardError.ReadToEndAsync()
        if (-not $transfer.WaitForExit(30000) -or -not $copy.Wait(5000)) { throw 'Screenshot transfer timed out' }
        if ($transfer.ExitCode -ne 0 -or $errors.GetAwaiter().GetResult()) { throw 'Screenshot transfer failed' }
    } finally {
        if (-not $transfer.HasExited) { $transfer.Kill(); $transfer.WaitForExit() }
        $file.Dispose()
        $transfer.Dispose()
    }
    $after = (Invoke-FixtureAdb @('shell', 'sha256sum', $remote) | Out-String).Split(' ')[0].Trim()
    $afterSize = [long](Invoke-FixtureAdb @('shell', 'stat', '-c', '%s', $remote) | Out-String).Trim()
    $hash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash
    if ($size -ne $afterSize -or (Get-Item -LiteralPath $partial).Length -ne $size -or $before -ne $after -or $hash -ne $before) { throw 'Screenshot changed or transfer was incomplete' }
    Move-Item -LiteralPath $partial -Destination (Join-Path $output $Name)
    $result.Artifacts += [pscustomobject]@{ Name = $Name; Bytes = $size; Sha256 = $hash }
}

function Save-BootDiagnostic([string]$Name, [string]$Arguments) {
    $settings = [System.Diagnostics.ProcessStartInfo]::new()
    $settings.FileName = $adb
    $settings.Arguments = "-s $serial $Arguments"
    $settings.UseShellExecute = $false
    $settings.CreateNoWindow = $true
    $settings.RedirectStandardOutput = $true
    $settings.RedirectStandardError = $true
    $probe = [System.Diagnostics.Process]::Start($settings)
    $handle = $probe.Handle
    $text = $probe.StandardOutput.ReadToEndAsync()
    $errors = $probe.StandardError.ReadToEndAsync()
    $completed = $probe.WaitForExit(15000)
    if (-not $completed) { $probe.Kill(); $probe.WaitForExit() }
    [pscustomobject]@{ Command = $Arguments; Completed = $completed; ExitCode = $probe.ExitCode; Output = $text.GetAwaiter().GetResult(); Error = $errors.GetAwaiter().GetResult() } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output ($Name + '.json')) -Encoding UTF8
    $probe.Dispose()
}

function Assert-Fixture {
    $runtimes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^qemu-system-x86_64(-headless)?\.exe$' })
    $owned = @($runtimes | Where-Object { $_.ParentProcessId -eq $emulator.Id -and $_.CommandLine -match ('-avd\s+' + $avd + '\b') -and $_.CommandLine -match '-port\s+5584\b' -and $_.CommandLine -match '-read-only' -and $_.CommandLine -match '-no-snapshot-save' })
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port })
    if ($runtimes.Count -ne 1 -or $owned.Count -ne 1 -or $owned[0].ProcessId -notin $listeners.OwningProcess) { throw 'Exclusive fixture process/port identity failed' }
    $name = @(Invoke-FixtureAdb @('emu', 'avd', 'name') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne 'OK' -and $_ -ne '' })
    if ($name.Count -ne 1 -or $name[0] -ne $avd) { throw 'AVD name does not match the owned fixture' }
    $result.RuntimePid = $owned[0].ProcessId
}

function Set-FixtureConnectivity([bool]$Live) {
    Assert-Fixture
    if ($Live) {
        Invoke-FixtureAdb @('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable')
        Invoke-FixtureAdb @('shell', 'svc', 'wifi', 'enable')
    } else {
        Invoke-FixtureAdb @('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
        Invoke-FixtureAdb @('shell', 'svc', 'wifi', 'disable')
    }
    Invoke-FixtureAdb @('shell', 'svc', 'data', 'disable')
    Invoke-FixtureAdb @('shell', 'settings', 'put', 'global', 'mobile_data', '0')
    $wifi = (Invoke-FixtureAdb @('shell', 'cmd', 'wifi', 'status') | Out-String).Trim()
    $mobile = (Invoke-FixtureAdb @('shell', 'settings', 'get', 'global', 'mobile_data') | Out-String).Trim()
    $expectedWifi = if ($Live) { 'Wifi is enabled' } else { 'Wifi is disabled' }
    $result.Connectivity = [pscustomobject]@{ Live = $Live; Wifi = $wifi; MobileData = $mobile; CapturedUtc = [DateTime]::UtcNow.ToString('o') }
    if ($wifi -notmatch $expectedWifi -or $mobile -ne '0') { throw "Guest connectivity state was not confirmed: Wi-Fi '$wifi'; mobile_data '$mobile'" }
}

function Invoke-OwnershipTests([string]$Class, [int]$Expected, [string]$Filename, [bool]$Live) {
    Assert-Fixture
    $before = (Invoke-FixtureAdb @('shell', 'settings', 'get', 'system', 'font_scale') | Out-String).Trim()
    $argument = if ($Live) { 'community_local_integration' } else { 'community_disposable_ui_fixture' }
    $lines = @(& $adb -s $serial shell am instrument -w -r -e $argument true -e class $Class com.community.platform.debug.test/androidx.test.runner.AndroidJUnitRunner)
    $exitCode = $LASTEXITCODE
    $lines | Set-Content -LiteralPath (Join-Path $output $Filename) -Encoding UTF8
    $after = (Invoke-FixtureAdb @('shell', 'settings', 'get', 'system', 'font_scale') | Out-String).Trim()
    $passes = @($lines | Where-Object { $_ -match '^INSTRUMENTATION_STATUS_CODE: 0\s*$' }).Count
    $lines
    if ($before -cne $after) { throw 'Original font setting was not restored' }
    if ($exitCode -ne 0 -or $passes -ne $Expected -or -not ($lines -match "^OK \($Expected tests?\)\s*$") -or ($lines -match '^INSTRUMENTATION_STATUS_CODE: -')) {
        Save-BootDiagnostic 'test-crash-buffer' 'shell logcat -b crash -d -v brief -t 200'
        Save-BootDiagnostic 'test-exit-info' 'shell dumpsys activity exit-info com.community.platform.debug'
        Save-BootDiagnostic 'test-events' 'shell logcat -b events -d -v brief -t 200'
        throw "The selected suite did not pass all $Expected cases without skips"
    }
    if ($Live) { $result.LivePassed = $passes } else { $result.OfflinePassed = $passes }
}

try {
    if ($IncludeLive -and $OfflineTest) { throw 'A focused offline probe cannot substitute for the complete live verification run' }
    if (-not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE ".android\avd\$avd.ini"))) { throw 'The dedicated ownership fixture is missing' }
    $runtimes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^qemu-system-x86_64(-headless)?\.exe$' })
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @($port, ($port + 1)) })
    if ($runtimes.Count -ne 0 -or $listeners.Count -ne 0) { throw 'Another emulator or port listener is active' }
    $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    & (Join-Path $root 'android\gradlew.bat') -p (Join-Path $root 'android') :app:assembleDebug :app:assembleDebugAndroidTest --offline --console=plain --max-workers=2
    if ($LASTEXITCODE -ne 0) { throw 'Native app/test APK build failed' }
    $appApk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
    $testApk = Join-Path $root 'android\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk'
    $result.AppSha256 = (Get-FileHash -LiteralPath $appApk -Algorithm SHA256).Hash
    $result.TestSha256 = (Get-FileHash -LiteralPath $testApk -Algorithm SHA256).Hash
    $result.Phase = 'boot'
    $result.BootTimeoutSeconds = $BootTimeoutSeconds
    $settings = [System.Diagnostics.ProcessStartInfo]::new()
    $settings.FileName = Join-Path $sdk 'emulator\emulator.exe'
    $settings.Arguments = "-avd $avd -port $port -read-only -no-snapshot-load -no-snapshot-save -gpu software -feature -Vulkan -memory 4096 -cores 4 -no-audio -no-boot-anim -no-window -show-kernel"
    $settings.UseShellExecute = $false
    $settings.CreateNoWindow = $true
    $settings.RedirectStandardInput = $true
    $settings.RedirectStandardOutput = $true
    $settings.RedirectStandardError = $true
    $emulator = [System.Diagnostics.Process]::Start($settings)
    $handle = $emulator.Handle
    $result.LauncherPid = $emulator.Id
    $stdout = [System.IO.StreamWriter]::new((Join-Path $output 'emulator.stdout.log'), $false, [System.Text.UTF8Encoding]::new($false))
    $stdout.AutoFlush = $true
    $stderr = [System.IO.FileStream]::new((Join-Path $output 'emulator.stderr.log'), [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read, 1, [System.IO.FileOptions]::WriteThrough)
    $stderrCopy = $emulator.StandardError.BaseStream.CopyToAsync($stderr)
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $booted = $false
    while (-not $booted) {
        $remaining = ($BootTimeoutSeconds * 1000) - [int]$timer.ElapsedMilliseconds
        if ($remaining -le 0) { throw "Boot-ready event did not arrive within $BootTimeoutSeconds seconds" }
        $lineTask = $emulator.StandardOutput.ReadLineAsync()
        $deadline = [System.Threading.Tasks.Task]::Delay($remaining)
        $completed = [System.Threading.Tasks.Task]::WhenAny([System.Threading.Tasks.Task[]]@($lineTask, $deadline)).GetAwaiter().GetResult()
        if ($completed -ne $lineTask) { throw "Boot-ready event did not arrive within $BootTimeoutSeconds seconds" }
        $line = $lineTask.GetAwaiter().GetResult()
        if ($null -eq $line) { throw 'Emulator output closed before boot readiness' }
        $stdout.WriteLine([DateTime]::UtcNow.ToString('o') + ' ' + $line)
        if ($line.Contains('Boot completed in')) { $booted = $true; Write-Output $line }
        if ($line.Contains('Wait for emulator')) { Write-Output $line }
    }
    $result.BootMilliseconds = $timer.ElapsedMilliseconds
    $postBootOutput = $emulator.StandardOutput.ReadToEndAsync()
    Assert-Fixture
    $boot = (Invoke-FixtureAdb @('shell', 'getprop', 'sys.boot_completed') | Out-String).Trim()
    $phone = (Invoke-FixtureAdb @('shell', 'service', 'check', 'phone') | Out-String).Trim()
    if ($boot -eq '1' -and $phone -ne 'Service phone: found') {
        $result.Phase = 'phone-ready'
        Invoke-FixtureAdb @('shell', 'cmd', '-w', 'phone', 'help') | Out-Null
        $phone = (Invoke-FixtureAdb @('shell', 'service', 'check', 'phone') | Out-String).Trim()
    }
    if ($boot -ne '1' -or $phone -ne 'Service phone: found') { throw 'Android boot and phone service must both be ready' }
    $installed = (Invoke-FixtureAdb @('shell', 'pm', 'list', 'packages', 'com.community.platform') | Out-String).Trim()
    if ($installed) { throw 'Expected a fresh overlay with no Community Platform packages' }
    $result.Phase = 'offline'
    Set-FixtureConnectivity $false
    Invoke-FixtureAdb @('shell', 'wm', 'size', '640x1280')
    Invoke-FixtureAdb @('shell', 'wm', 'density', '320')
    Invoke-FixtureAdb @('install', '--no-incremental', $appApk)
    Invoke-FixtureAdb @('install', '--no-incremental', $testApk)
    $screenClass = 'com.community.platform.feature.spaces.SpaceScreenTest'
    if ($OfflineTest) {
        Invoke-OwnershipTests "$screenClass#$OfflineTest" 1 'offline.txt' $false
    } else {
        Invoke-OwnershipTests $screenClass 15 'offline.txt' $false
        Save-FixtureImage 'ownership-native-large-text.png'
    }
    if ($IncludeLive) {
        $result.Phase = 'live'
        Set-FixtureConnectivity $true
        Invoke-OwnershipTests 'com.community.platform.feature.identity.AccountJourneyTest#nativeOwnershipAcceptanceAndFormerOwnerLeavePreserveHistory' 1 'live.txt' $true
        Save-FixtureImage 'ownership-native-live.png'
    }
    $result.Phase = 'passed'
} catch {
    $result.Failure = $_.Exception.Message
    throw
} finally {
    if ($null -ne $emulator) {
        $owned = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $emulator.Id -and $_.Name -match '^qemu-system-x86_64(-headless)?\.exe$' -and $_.CommandLine -match ('-avd\s+' + $avd + '\b') -and $_.CommandLine -match '-port\s+5584\b' -and $_.CommandLine -match '-read-only' })
        if ($owned.Count -eq 1) {
            $result.RuntimePid = $owned[0].ProcessId
            if ($result.Phase -in @('boot', 'phone-ready')) {
                Save-BootDiagnostic 'adb-state' 'get-state'
                Save-BootDiagnostic 'boot-property' 'shell getprop sys.boot_completed'
                Save-BootDiagnostic 'phone-service' 'shell service check phone'
                Save-BootDiagnostic 'boot-events' 'shell logcat -b events -d -v brief -t 80'
                Save-BootDiagnostic 'crash-buffer' 'shell logcat -b crash -d -v brief -t 100'
            }
            try { Invoke-FixtureAdb @('emu', 'kill') } catch { $result.CleanupWarning = $_.Exception.Message }
        }
        if (-not $emulator.WaitForExit(20000)) {
            foreach ($child in $owned) {
                $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($child.ProcessId)"
                if ($current -and $current.CreationDate -eq $child.CreationDate -and $current.CommandLine -eq $child.CommandLine) { Stop-Process -Id $child.ProcessId -Force; $result.ForcedShutdown = $true }
            }
            if (-not $emulator.HasExited) { $emulator.Kill(); $result.ForcedShutdown = $true; $emulator.WaitForExit() }
        }
        $result.EmulatorExitCode = $emulator.ExitCode
        if ($null -ne $stderrCopy) { $null = $stderrCopy.Wait(5000) }
        if ($null -ne $postBootOutput -and $postBootOutput.Wait(5000)) { $stdout.Write($postBootOutput.GetAwaiter().GetResult()) }
        if ($null -ne $stdout) { $stdout.Dispose() }
        if ($null -ne $stderr) { $stderr.Dispose() }
        $emulator.StandardInput.Close()
        $emulator.Dispose()
    }
    $result.FinishedUtc = [DateTime]::UtcNow.ToString('o')
    $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding UTF8
    Write-Output "Evidence: $output"
}