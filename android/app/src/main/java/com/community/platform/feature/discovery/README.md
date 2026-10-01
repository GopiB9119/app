# Android Private Search

Built 2026-10-01 for the existing authenticated private-search API under the owner's explicit Android implementation request. This is distinct from public community discovery and does not change the agent feature.

## Built Scope

- Explicit Search action; editing the words or optional Space filter does not send requests.
- Current Space options from the existing SpaceRepository, with bounded paging and repeated-page/duplicate protection.
- Strict query/filter/result validation, at most 20 per kind, required continuation flags, valid document citations, task states/dates and event states/times/timezones. Distinct passages of one document are preserved.
- Documents, Tasks and Events sections showing the Space name, plus the first-20 and excluded-data empty-state notices. Messages, care records and reminders are not searched.
- Document results open the plain-text viewer at their cited lines. Task and event results open the existing corresponding Space screens, with return navigation preserving the search results.
- Account-generation isolation, AccountRepository authorization, a 256 KiB response cap, existing design tokens and resource strings.

Implementation: [SearchModels.kt](SearchModels.kt), [SearchApi.kt](SearchApi.kt), [SearchRepository.kt](SearchRepository.kt), [SearchViewModel.kt](SearchViewModel.kt), [SearchScreen.kt](SearchScreen.kt).

## Verification

SearchTest: 10 passed, 0 failures/errors/skips. Final document/search/Events gate: 41 passed. Complete JVM suite: 224 passed across 16 classes, 0 failures/errors/skips. Lint: 0 errors, 11 warnings. Debug application and instrumentation APKs built successfully, including seven new fake-action UI cases compiled without running them.

The [document feature record](../files/README.md#verification) contains every manual file change, exact commands, run history, per-class counts and verification limits. Native UI, real SAF, live API, accessibility, actual 320 dp/200% rendering and release runtime were not exercised. All edits stayed under android/; dependencies, shared theme/tokens, backend, web and agent code were left untouched by this session.

## Remaining Domain Inventory

Source chapters: 1, 2, 15. Broader topics, local discovery, trending, suggestions, ranking, personalization controls, feedback, eligibility projections and translations are not implemented by this private-search slice. Public discovery remains in the existing community feature. See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json).
