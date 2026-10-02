param([switch]$LocalRequestJourney)

$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
$serial = 'emulator-5580'
$avd = 'community_platform_m0_768f91e4'
$started = [DateTime]::UtcNow.ToString('o')
$name = @(& $adb -s $serial emu avd name | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne 'OK' -and $_ -ne '' })
if ($LASTEXITCODE -ne 0 -or $name.Count -ne 1 -or $name[0] -ne $avd) { throw 'Unexpected test emulator' }
$owned = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^qemu-system-x86_64(-headless)?\.exe$' -and
    $_.CommandLine -match ('(?:^|\s)-avd\s+' + [regex]::Escape($avd) + '(?:\s|$)') -and
    $_.CommandLine -match '(?:^|\s)-read-only(?:\s|$)' -and
    $_.CommandLine -match '(?:^|\s)-no-snapshot-save(?:\s|$)' -and
    $_.CommandLine -match '(?:^|\s)-port\s+5580(?:\s|$)'
})
$listener = @(Get-NetTCPConnection -State Listen -LocalPort 5580 -ErrorAction SilentlyContinue)
if ($owned.Count -ne 1 -or $owned[0].ProcessId -notin $listener.OwningProcess) { throw 'The read-only test runtime must own port 5580' }
$boot = (& $adb -s $serial shell getprop sys.boot_completed | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $boot -ne '1') { throw 'Emulator has not completed boot' }
if ($LocalRequestJourney) {
    $installed = (& $adb -s $serial shell pm list packages com.community.platform.debug | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $installed) { throw 'The live request journey requires a fresh disposable overlay without an installed debug app' }
    & $adb -s $serial shell cmd connectivity airplane-mode disable
    if ($LASTEXITCODE -ne 0) { throw 'Cannot disable guest airplane mode for the explicitly selected local journey' }
    & $adb -s $serial shell svc wifi enable
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enable guest Wi-Fi for the explicitly selected local journey' }
} else {
    & $adb -s $serial shell cmd connectivity airplane-mode enable
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enable guest airplane mode' }
    & $adb -s $serial shell svc wifi disable
    if ($LASTEXITCODE -ne 0) { throw 'Cannot disable guest Wi-Fi' }
}
& $adb -s $serial shell svc data disable
if ($LASTEXITCODE -ne 0) { throw 'Cannot disable guest mobile data' }
$wifi = (& $adb -s $serial shell cmd wifi status | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify guest Wi-Fi state' }
if (-not $LocalRequestJourney -and $wifi -notmatch 'Wifi is disabled') { throw 'Guest Wi-Fi is not disabled' }
if ($LocalRequestJourney -and $wifi -notmatch 'Wifi is enabled') { throw 'Guest Wi-Fi is not enabled for the selected local journey' }
$mobile = (& $adb -s $serial shell settings get global mobile_data | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $mobile -ne '0') { throw 'Guest mobile data is not disabled' }
& $adb -s $serial shell wm size 640x1280
if ($LASTEXITCODE -ne 0) { throw 'Cannot set the test viewport' }
& $adb -s $serial shell wm density 320
if ($LASTEXITCODE -ne 0) { throw 'Cannot set the test density' }
$originalScale = (& $adb -s $serial shell settings get system font_scale | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the original guest font scale' }
& .\android\gradlew.bat -p android :app:assembleDebug :app:assembleDebugAndroidTest --offline --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Native test build failed' }
& $adb -s $serial install -r .\android\app\build\outputs\apk\debug\app-debug.apk
if ($LASTEXITCODE -ne 0) { throw 'Debug install failed' }
& $adb -s $serial install -r .\android\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk
if ($LASTEXITCODE -ne 0) { throw 'Test install failed' }
if ($LocalRequestJourney) {
    $expectedTests = 1
    $result = @(& $adb -s $serial shell am instrument -w -r -e community_local_integration true -e class com.community.platform.feature.scheduling.ReminderRequestJourneyTest com.community.platform.debug.test/androidx.test.runner.AndroidJUnitRunner)
} else {
    $expectedTests = 13
    $result = @(& $adb -s $serial shell am instrument -w -r -e community_disposable_ui_fixture true -e class com.community.platform.feature.scheduling.ReminderScreenTest com.community.platform.debug.test/androidx.test.runner.AndroidJUnitRunner)
}
$instrumentExit = $LASTEXITCODE
$finalScale = (& $adb -s $serial shell settings get system font_scale | Out-String).Trim()
$scaleExit = $LASTEXITCODE
$passes = @($result | Where-Object { $_ -match '^INSTRUMENTATION_STATUS_CODE: 0\s*$' }).Count
$passed = $instrumentExit -eq 0 -and $passes -eq $expectedTests -and [bool]($result -match "^OK \($expectedTests tests?\)\s*$") -and -not [bool]($result -match '^INSTRUMENTATION_STATUS_CODE: -')
$restored = $scaleExit -eq 0 -and $originalScale -ceq $finalScale
$filename = if ($LocalRequestJourney) { 'native-reminder-request-live-5580.txt' } else { 'native-reminder-5580-suite.txt' }
$output = Join-Path $PSScriptRoot (Join-Path '..\.local' $filename)
New-Item -ItemType Directory -Path (Split-Path $output -Parent) -Force | Out-Null
@("Started UTC: $started", "Runtime PID: $($owned[0].ProcessId)", "Local request journey: $LocalRequestJourney", "Original font scale: $originalScale", "Final font scale: $finalScale", "Passing tests: $passes", "Suite passed: $passed", "Font scale restored: $restored") + $result | Set-Content -LiteralPath $output -Encoding UTF8
$result
Write-Output "Evidence: $output"
if (-not $passed) { throw "The selected reminder suite did not pass $expectedTests/$expectedTests without skips" }
if (-not $restored) { throw 'Guest font scale was not restored' }