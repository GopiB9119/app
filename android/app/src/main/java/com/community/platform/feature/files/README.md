# Android Documents

Local native client for the existing Space text-document API, built on 2026-10-01 under R5, R10, R11 and R13 and the owner's explicit Android implementation request. No backend, web, agent, dependency, design-token, device or emulator changes were made by this session.

## Built Scope

- Storage Access Framework selection for text MIME types; display-name and declared-size checks before opening the stream; at most 524289 bytes read; strict UTF-8 decoding; leading BOM and line-break normalization. Only .txt, .md, .markdown and .csv names are accepted.
- Name and source size shown before explicit Add. One immutable account/Space/key/body for a chosen file; uncertain results keep the choice locked for explicit Retry. Definite rejections release it and display the service message.
- Active-document lists, Load more, restart after invalid/expired pages, metadata, plain numbered text and marked search citations. A final newline does not add an extra displayed line. Document text is never parsed as Markdown or HTML.
- Permission-controlled deletion with exact document/Space confirmation and explicit Retry delete. Definitive lost access removes cached document text; a refusal to delete does not hide still-readable text.
- Account-generation isolation and current AccountRepository authorization. Request Gson disables HTML escaping only for the document API. Response caps are 1.5 MiB for detail, 256 KiB for lists/search and 64 KiB for other new endpoints.
- Space detail Documents entry and [private-search handoff](../discovery/README.md). Existing navigation stays available. The screens use the existing design tokens and resource strings.

Pending commands and chosen text live only in ViewModel memory. They are not a durable offline queue and are not preserved through process death. Leaving an uncertain action explicitly warns that its retry will be lost.

## Manual File Manifest

Created, all under android/:

- [DocumentModels.kt](DocumentModels.kt), [DocumentApi.kt](DocumentApi.kt), [DocumentRepository.kt](DocumentRepository.kt), [DocumentViewModel.kt](DocumentViewModel.kt), [DocumentScreen.kt](DocumentScreen.kt).
- [../discovery/SearchModels.kt](../discovery/SearchModels.kt), [../discovery/SearchApi.kt](../discovery/SearchApi.kt), [../discovery/SearchRepository.kt](../discovery/SearchRepository.kt), [../discovery/SearchViewModel.kt](../discovery/SearchViewModel.kt), [../discovery/SearchScreen.kt](../discovery/SearchScreen.kt).
- [DocumentTest.kt](../../../../../../../test/java/com/community/platform/feature/files/DocumentTest.kt#L1), [SearchTest.kt](../../../../../../../test/java/com/community/platform/feature/discovery/SearchTest.kt#L1), [DocumentScreenTest.kt](../../../../../../../androidTest/java/com/community/platform/feature/files/DocumentScreenTest.kt#L1).

Changed, preserving concurrent work:

- [MainActivity.kt](../../MainActivity.kt#L1): new account-bound routes and return navigation.
- [IdentityModule.kt](../../IdentityModule.kt#L1): API providers, document-only non-escaping Gson and endpoint caps.
- [IdentityScreen.kt](../identity/IdentityScreen.kt#L1): optional account Search entry.
- [SpaceScreen.kt](../spaces/SpaceScreen.kt#L1): optional Space Documents entry.
- [strings.xml](../../../../../../res/values/strings.xml#L1): new user-visible text and the two previously missing Calendar resources, calendar_event_zone and calendar_open_events, required to unblock compilation.
- [proguard-rules.pro](../../../../../../../../proguard-rules.pro#L1): explicit files/discovery DTO rules alongside the existing general DTO and Retrofit rules.
- [README.md](README.md) and [../discovery/README.md](../discovery/README.md): implemented scope and verification evidence.

No existing tests were deleted, skipped or weakened. The shared theme, generated design tokens and dependency configuration were read but not edited. Repository-wide status documents and CHANGELOG were not edited because the owner restricted changes to android/.

## Verification

2026-10-01, shared local working tree, cached dependencies only. The final JUnit XML reports contain 224 tests across the 16 explicitly named classes below: 224 passed, 0 failures, 0 errors, 0 skipped. The focused final gate contains DocumentTest 20, SearchTest 10 and EventsTest 11: 41 passed, 0 failures/errors/skips.

| JVM Class | Passed |
| --- | ---: |
| com.community.platform.feature.care.CareTest | 10 |
| com.community.platform.feature.community.CommunityTest | 16 |
| com.community.platform.feature.discovery.SearchTest | 10 |
| com.community.platform.feature.events.EventsTest | 11 |
| com.community.platform.feature.files.DocumentTest | 20 |
| com.community.platform.feature.identity.AccountRepositoryTest | 10 |
| com.community.platform.feature.messaging.MessagingTest | 18 |
| com.community.platform.feature.planning.ChecklistTest | 7 |
| com.community.platform.feature.planning.TaskRepositoryTest | 15 |
| com.community.platform.feature.planning.TaskViewModelTest | 12 |
| com.community.platform.feature.scheduling.ReminderRepositoryTest | 23 |
| com.community.platform.feature.scheduling.ReminderViewModelTest | 19 |
| com.community.platform.feature.spaces.GroupRepositoryTest | 4 |
| com.community.platform.feature.spaces.SpaceRepositoryTest | 21 |
| com.community.platform.feature.spaces.SpaceSettingsTest | 6 |
| com.community.platform.feature.spaces.SpaceViewModelTest | 22 |
| Total | 224 |

Lint: 0 errors, 11 warnings (OldTargetApi 1, GradleDependency 8, PluralsCandidate 1, MissingApplicationIcon 1). Debug app and test APK builds both passed. Output sizes when inspected: app-debug.apk 12541332 bytes; app-debug-androidTest.apk 1225451 bytes.

Seven new fake-action Compose cases compiled: Add/Retry, exact delete confirmation and Cancel, plain text and cited lines, delete permission/Retry, three search sections and result targets, narrow large-text document controls, and narrow large-text search sections. Zero instrumented tests were executed.

### Exact Gradle Commands

Every command was submitted with the root-directory and environment prefix shown, one command at a time. No wildcard test-class filter was used. The terminal tool may display a simplified command after removing the redundant Set-Location prefix; the submitted commands below retain it.

A: document and Events gate, used during the incremental document work.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; .\android\gradlew.bat -p android :app:testDebugUnitTest --tests com.community.platform.feature.files.DocumentTest --tests com.community.platform.feature.events.EventsTest --offline --console=plain
```

B: requested focused document/search/Events gate.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; .\android\gradlew.bat -p android :app:testDebugUnitTest --tests com.community.platform.feature.files.DocumentTest --tests com.community.platform.feature.discovery.SearchTest --tests com.community.platform.feature.events.EventsTest --offline --console=plain
```

C: new screen compilation.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; .\android\gradlew.bat -p android :app:compileDebugKotlin --offline --console=plain
```

D: offline UI test compilation, not execution.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; .\android\gradlew.bat -p android :app:compileDebugAndroidTestKotlin --offline --console=plain
```

E: required lint gate.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; .\android\gradlew.bat -p android :app:lintDebug --offline --console=plain
```

F: both required APK builds.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; .\android\gradlew.bat -p android :app:assembleDebug :app:assembleDebugAndroidTest --offline --console=plain
```

G: complete JVM suite, run once after listing all 16 source classes.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME; .\android\gradlew.bat -p android :app:testDebugUnitTest --tests com.community.platform.feature.care.CareTest --tests com.community.platform.feature.community.CommunityTest --tests com.community.platform.feature.discovery.SearchTest --tests com.community.platform.feature.events.EventsTest --tests com.community.platform.feature.files.DocumentTest --tests com.community.platform.feature.identity.AccountRepositoryTest --tests com.community.platform.feature.messaging.MessagingTest --tests com.community.platform.feature.planning.ChecklistTest --tests com.community.platform.feature.planning.TaskRepositoryTest --tests com.community.platform.feature.planning.TaskViewModelTest --tests com.community.platform.feature.scheduling.ReminderRepositoryTest --tests com.community.platform.feature.scheduling.ReminderViewModelTest --tests com.community.platform.feature.spaces.GroupRepositoryTest --tests com.community.platform.feature.spaces.SpaceRepositoryTest --tests com.community.platform.feature.spaces.SpaceSettingsTest --tests com.community.platform.feature.spaces.SpaceViewModelTest --offline --console=plain
```

### Run History

| Order | Command | Result |
| ---: | --- | --- |
| 1 | A | FAIL, exit 1, before test execution: existing CalendarScreen referenced two missing strings. |
| 2 | A | PASS after adding those two resource declarations; 20 tests. |
| 3 | A | FAIL, exit 1, before test execution: one duplicate closing brace introduced in DocumentTest. |
| 4 | A | PASS after removing only that brace; 28 tests. |
| 5 | A | PASS with no-overlap expired-page recovery check; 28 tests. |
| 6 | A | PASS with final-newline/blank-file checks; 29 tests. |
| 7 | B | PASS after search implementation; 39 tests. |
| 8 | C | PASS; no tests executed. |
| 9 | D | PASS; seven new UI cases compiled, none executed. |
| 10 | B | PASS after navigation integration; 39 tests. |
| 11 | B | PASS after lost-access regressions; 41 tests. |
| 12 | E | PASS; 0 lint errors, 11 warnings. |
| 13 | H below | PASS; focused XML confirms 41 tests and zero failures/errors/skips; lint XML confirms 0/11. |
| 14 | F | PASS; debug app and test APKs built. |
| 15 | G | PASS; 224 tests, 16 classes, zero failures/errors/skips. |
| 16 | I below | PASS; aggregate XML totals checked and both APKs confirmed present. |

### Exact Evidence Commands

H: structured lint and focused-test report inspection.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; [xml]$lintReport=Get-Content android\app\build\reports\lint-results-debug.xml -Raw; $lintIssues=@($lintReport.issues.issue); $lintErrors=@($lintIssues | Where-Object { $_.severity -eq 'Error' -or $_.severity -eq 'Fatal' }); $lintWarnings=@($lintIssues | Where-Object { $_.severity -eq 'Warning' }); Write-Output ('Lint: errors=' + $lintErrors.Count + ', warnings=' + $lintWarnings.Count); $lintWarnings | Group-Object id | Select-Object Name,Count | Format-Table -AutoSize; Get-ChildItem android\app\build\test-results\testDebugUnitTest\TEST-*.xml | ForEach-Object { [xml]$report=Get-Content $_.FullName -Raw; $suite=$report.testsuite; Write-Output ($suite.name + ': tests=' + $suite.tests + ', failures=' + $suite.failures + ', errors=' + $suite.errors + ', skipped=' + $suite.skipped) }
```

I: complete-suite totals and APK inspection.

```powershell
Set-Location C:\Users\91961\Desktop\FamilyCarePlus; $suites=@(Get-ChildItem android\app\build\test-results\testDebugUnitTest\TEST-*.xml | ForEach-Object { [xml]$report=Get-Content $_.FullName -Raw; [pscustomobject]@{Class=$report.testsuite.name; Tests=[int]$report.testsuite.tests; Failures=[int]$report.testsuite.failures; Errors=[int]$report.testsuite.errors; Skipped=[int]$report.testsuite.skipped} }); $suites | Format-Table -AutoSize; $tests=($suites | Measure-Object Tests -Sum).Sum; $failures=($suites | Measure-Object Failures -Sum).Sum; $errors=($suites | Measure-Object Errors -Sum).Sum; $skipped=($suites | Measure-Object Skipped -Sum).Sum; Write-Output ('TOTAL: classes=' + $suites.Count + ', tests=' + $tests + ', failures=' + $failures + ', errors=' + $errors + ', skipped=' + $skipped); if ($suites.Count -ne 16 -or $failures -ne 0 -or $errors -ne 0 -or $skipped -ne 0) { throw 'Complete JVM evidence did not match the expected 16 clean suites' }; Get-Item android\app\build\outputs\apk\debug\app-debug.apk,android\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk | Select-Object FullName,Length,LastWriteTime | Format-List
```

## Not Verified

No emulator was started, no app was installed and no instrumented or live API journey was run. SAF/provider behavior, native screen rendering, TalkBack, actual dialog font scale, 320 dp/200% runtime layout, rotation/process death and release R8/runtime remain unverified. The new layout test sources compile; that is not a device-layout pass. Release keep rules were added, but no release build was requested or run.

## Remaining Domain Inventory

Source chapters: 6, 11, 14. Binary uploads, immutable versions, quarantine/scanning, media processing, OCR, broader extraction/embeddings, sharing and wider deletion lineage remain outside this native text-document slice. See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json).
