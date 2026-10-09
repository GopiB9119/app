package com.community.platform.feature.discovery

import com.community.platform.IdentityModule
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.realtime.LiveEvent
import com.community.platform.feature.realtime.LiveSignals
import com.community.platform.feature.spaces.SpaceApi
import com.community.platform.feature.spaces.SpaceDto
import com.community.platform.feature.spaces.SpaceRepository
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class SearchTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val documentId = "6a3c6e31-8f8e-4d71-8d84-3f7c6c5e4d04"
    private val taskId = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
    private val eventId = "8b2eac20-1b89-4e77-8c4b-3b3b9f8b3c04"
    private val document = SearchDocumentDto(documentId, fixture.spaceId, "Morgan family", "budget.md", "text/markdown", 2, 4, "<=> budget", "2026-10-01T10:00:00Z")
    private val task = SearchTaskDto(taskId, fixture.spaceId, "Morgan family", "Budget review", "Plan the budget", "open", "2026-10-02", "notes")
    private val event = SearchEventDto(eventId, fixture.spaceId, "Morgan family", "Budget meeting", "Home", "scheduled", "2026-10-02T13:00:00Z", "Asia/Kolkata", "2026-10-02T18:30")
    private val results = SearchResultsDto("budget", null, listOf(document), listOf(task), listOf(event), false, false, false, 20)

    inner class FakeApi : SearchApi {
        var value = results
        var failure = 0
        var paged = false
        var gate: CompletableDeferred<Unit>? = null
        val limits = mutableListOf<Int?>()
        val calls = mutableListOf<Pair<String, String?>>()
        override suspend fun search(authorization: String, query: String, spaceId: String?, limit: Int?): Response<EnvelopeDto<SearchResultsDto>> {
            calls += query to spaceId
            limits += limit
            gate?.await()
            val effective = limit ?: 20
            val response = if (paged) value.copy(documents = List(effective) { document.copy(startLine = it + 1, endLine = it + 1) }, moreDocuments = true) else value
            return if (failure != 0) Response.error(failure,
                """{"error":{"code":"SYNTHETIC","message":"Synthetic search error"}}""".toResponseBody("application/json".toMediaType()))
            else Response.success(EnvelopeDto(response.copy(query = query, spaceId = spaceId, limit = effective), null))
        }
    }

    private class Signals : LiveSignals {
        override val events = MutableSharedFlow<LiveEvent>()
        override val connected = MutableStateFlow(false)
    }
    private val signals = Signals()
    private val dispatcher = UnconfinedTestDispatcher()
    private fun advanceTimeBy(milliseconds: Long) = dispatcher.scheduler.advanceTimeBy(milliseconds)
    private fun runCurrent() = dispatcher.scheduler.runCurrent()
    private val api = FakeApi()
    private val repository = SearchRepository(api, fixture.accounts)
    private var model: SearchViewModel? = null
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun cleanup() = runBlocking {
        model?.bind(null)
        model?.viewModelScope?.coroutineContext?.get(Job)?.cancelAndJoin()
        Dispatchers.resetMain()
    }
    private suspend fun idle(current: SearchViewModel) = withContext(Dispatchers.Default) {
        withTimeout(5000) { current.state.first { !it.busy && !it.refreshing && !it.loadingMore } }
    }
    private suspend fun ready(): SearchViewModel {
        val current = SearchViewModel(repository, fixture.repository, signals); model = current
        current.bind(fixture.accountId); idle(current)
        return current
    }

    @Test fun parsesAllThreeKindsAndAllowsDistinctPassagesOfOneDocument() {
        val passages = results.copy(documents = listOf(document, document.copy(startLine = 8, endLine = 9, excerpt = "Another budget passage")))
        assertEquals(passages, repository.results(passages, "budget", null))
        assertEquals("open", repository.results(results, "budget", null).tasks.single().status)
        assertEquals("scheduled", repository.results(results, "budget", null).events.single().status)
    }

    @Test fun rejectsResponseWithDifferentEffectiveLimit() {
        val json = Gson().toJsonTree(results).asJsonObject
        json.addProperty("limit", 40)
        val parsed = Gson().fromJson(json, SearchResultsDto::class.java)
        assertThrows(IdentityFailure::class.java) { repository.results(parsed, "budget", null) }
    }

    @Test fun validatesEveryLimitAndChecklistSource() {
        for (limit in listOf(1, 20, 40, 60, 80, 100)) {
            val page = results.copy(limit = limit, documents = List(limit) { document.copy(startLine = it + 1, endLine = it + 1) }, moreDocuments = true)
            assertEquals(page, repository.results(page, "budget", null, limit))
            assertThrows(IdentityFailure::class.java) { repository.results(page.copy(documents = page.documents.dropLast(1)), "budget", null, limit) }
            assertThrows(IdentityFailure::class.java) { repository.results(page.copy(documents = page.documents + document), "budget", null, limit) }
            assertThrows(IdentityFailure::class.java) { repository.results(page.copy(limit = null), "budget", null, limit) }
            val tasks = List(limit) { task.copy(taskId = java.util.UUID(1, it.toLong()).toString()) }
            val events = List(limit) { event.copy(eventId = java.util.UUID(2, it.toLong()).toString()) }
            val full = results.copy(limit = limit, tasks = tasks, events = events, moreTasks = true, moreEvents = true)
            assertEquals(full, repository.results(full, "budget", null, limit))
            for (invalid in listOf(full.copy(tasks = tasks.dropLast(1)), full.copy(events = events.dropLast(1)),
                full.copy(tasks = tasks + task), full.copy(events = events + event))) {
                assertThrows(IdentityFailure::class.java) { repository.results(invalid, "budget", null, limit) }
            }
        }
        for (limit in listOf(0, 101)) assertThrows(IdentityFailure::class.java) { repository.results(results.copy(limit = limit), "budget", null, limit) }
        for (source in listOf(null, "title")) assertThrows(IdentityFailure::class.java) {
            repository.results(results.copy(tasks = listOf(task.copy(excerptIn = source))), "budget", null)
        }
        assertEquals("checklist", repository.results(results.copy(tasks = listOf(task.copy(excerptIn = "checklist"))), "budget", null).tasks.single().excerptIn)
    }

    @Test fun showMoreKeepsEarlierResultsAndStopsAtOneHundred() = runBlocking {
        api.paged = true
        val current = ready(); current.query("budget"); current.search(); idle(current)
        for (limit in listOf(40, 60, 80, 100)) {
            val before = current.state.value.results
            api.gate = CompletableDeferred()
            current.showMore(SearchKind.DOCUMENTS)
            assertEquals(before, current.state.value.results)
            assertTrue(current.state.value.loadingMore)
            assertEquals(limit, current.state.value.limit)
            api.gate!!.complete(Unit); idle(current); api.gate = null
            assertEquals(limit, current.state.value.results?.limit)
        }
        current.showMore(SearchKind.DOCUMENTS)
        assertEquals(listOf(null, 40, 60, 80, 100), api.limits)
        current.filter(fixture.spaceId)
        assertEquals(20, current.state.value.limit)
        assertEquals(5, api.calls.size)
        current.search(); idle(current)
        assertEquals(20, current.state.value.limit)
    }

    @Test fun liveBurstRefreshesOnlyTheWatchedSpaceAndAnnouncesOnlyChanges() = runBlocking {
        val current = ready(); current.filter(fixture.spaceId); current.query("budget"); current.search(); idle(current)
        signals.events.emit(LiveEvent.Change("search", null, taskId, "document"))
        advanceTimeBy(500); runCurrent()
        assertEquals(1, api.calls.size)
        repeat(3) { signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "task")); advanceTimeBy(100) }
        assertEquals(1, api.calls.size)
        advanceTimeBy(400); runCurrent(); idle(current)
        assertEquals(2, api.calls.size)
        assertNull(current.state.value.notice)
        val before = current.state.value.results
        api.value = results.copy(documents = listOf(document.copy(excerpt = "Changed budget")))
        api.gate = CompletableDeferred()
        signals.events.emit(LiveEvent.Ready); advanceTimeBy(400); runCurrent()
        assertEquals(before, current.state.value.results)
        assertTrue(current.state.value.refreshing)
        assertFalse(current.state.value.busy)
        api.gate!!.complete(Unit); idle(current); api.gate = null
        assertEquals(SearchNotice.UPDATED, current.state.value.notice)
        advanceTimeBy(6000); runCurrent()
        assertNull(current.state.value.notice)
        signals.events.emit(LiveEvent.Resync); advanceTimeBy(400); runCurrent(); idle(current)
        assertEquals(4, api.calls.size)
        assertNull(current.state.value.notice)
    }

    @Test fun quietFailureKeepsResultsAndSessionLossStillClearsThem() = runBlocking {
        val current = ready(); current.query("budget"); current.search(); idle(current)
        val before = current.state.value.results
        api.failure = 503
        signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "event")); advanceTimeBy(400); runCurrent(); idle(current)
        assertEquals(before, current.state.value.results)
        assertTrue(current.state.value.stale)
        api.failure = 401
        signals.events.emit(LiveEvent.Ready); advanceTimeBy(400); runCurrent(); idle(current)
        assertNull(current.state.value.results)
        assertTrue(current.state.value.requiresSignIn)
    }

    @Test fun lostSpaceIsRepairedBySearchingAllSpaces() = runBlocking {
        val current = ready(); current.query("budget"); current.filter(fixture.spaceId); current.search(); idle(current)
        fixture.api.listedSpaces = emptyList()
        signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "access"))
        advanceTimeBy(400); runCurrent(); idle(current)
        assertTrue(current.state.value.spaces.isEmpty())
        assertNull(current.state.value.spaceId)
        assertNull(current.state.value.submittedSpaceId)
        assertEquals("budget" to null, api.calls.last())
        assertEquals(SearchNotice.SPACE_GONE, current.state.value.notice)
        assertEquals(2, api.calls.size)
    }

    @Test fun liveDoesNothingWithoutAnOpenSearchAndTypingDoesNotSubmit() = runBlocking {
        val current = ready()
        for (hint in listOf(LiveEvent.Ready, LiveEvent.Resync, LiveEvent.Change("search", null, fixture.spaceId, "task"))) {
            signals.events.emit(hint); advanceTimeBy(400); runCurrent(); idle(current)
        }
        assertTrue(api.calls.isEmpty())
        current.query("budget"); current.search(); idle(current)
        current.query("insurance")
        assertEquals("budget", current.state.value.submittedQuery)
        signals.events.emit(LiveEvent.Ready); advanceTimeBy(400); runCurrent(); idle(current)
        assertEquals("budget" to null, api.calls.last())
        assertEquals("insurance", current.state.value.query)
    }

    @Test fun reconnectRepairsASpaceLostWhileDisconnected() = runBlocking {
        val current = ready(); current.query("budget"); current.filter(fixture.spaceId); current.search(); idle(current)
        fixture.api.listedSpaces = emptyList()
        signals.events.emit(LiveEvent.Ready); advanceTimeBy(400); runCurrent(); idle(current)
        assertNull(current.state.value.spaceId)
        assertEquals("budget" to null, api.calls.last())
        assertEquals(SearchNotice.SPACE_GONE, current.state.value.notice)
        assertEquals(2, api.calls.size)
    }

    @Test fun highlightsUnicodeWordsFileNamesDatesAndPrefixes() {
        assertEquals(listOf("policy", "10"), searchWords("POLICY policy 10"))
        assertEquals(listOf("policy", "10", "Bud"), highlightPieces("insurance_policy.txt 2026-10-04 Budget", searchWords("policy 10 bud")).filter { it.marked }.map { it.text })
        assertTrue(highlightPieces("rebudget", searchWords("budget")).none { it.marked })
        for (word in listOf("\u0c2a\u0c3e\u0c32\u0c38\u0c40", "\u0928\u0940\u0924\u093f", "\uD801\uDC00")) {
            assertEquals(listOf(word.lowercase(java.util.Locale.ROOT)), searchWords(word))
            assertEquals(word, highlightPieces("$word.txt", searchWords(word)).single { it.marked }.text)
        }
        assertEquals("a b c d e f g h i j k l m n", searchWords("a_b.c/d\\e@f:g-h+i&j<k>l,m n").joinToString(" "))
    }

    @Test fun accessHintDoesNotLoseAnEarlierDocumentHintInTheSameBurst() = runBlocking {
        val current = ready(); current.filter(fixture.spaceId); current.query("budget"); current.search(); idle(current)
        signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "document"))
        advanceTimeBy(100)
        signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "access"))
        advanceTimeBy(400); runCurrent(); idle(current)
        assertEquals(2, api.calls.size)
        assertEquals(fixture.spaceId, current.state.value.submittedSpaceId)
        assertNull(current.state.value.notice)
    }

    @Test fun aNewerHintKeepsTheSpaceReloadThatAnEarlierHintStarted() = runBlocking {
        var gate: CompletableDeferred<Unit>? = null
        val reads = java.util.concurrent.atomic.AtomicInteger()
        val slow = object : SpaceApi by fixture.api {
            override suspend fun spaces(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<SpaceDto>>> {
                reads.incrementAndGet()
                gate?.await()
                return fixture.api.spaces(authorization, cursor, limit)
            }
        }
        val current = SearchViewModel(repository, SpaceRepository(slow, fixture.accounts), signals); model = current
        current.bind(fixture.accountId); idle(current)
        current.query("budget"); current.filter(fixture.spaceId); current.search(); idle(current)
        val before = reads.get()
        fixture.api.listedSpaces = emptyList()
        gate = CompletableDeferred()
        signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "access")); advanceTimeBy(400); runCurrent()
        withContext(Dispatchers.Default) { withTimeout(5000) { while (reads.get() == before) kotlinx.coroutines.delay(5) } }
        // A document hint arrives while the Spaces are still being read: it cancels that read but must not drop the reload.
        signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "document")); advanceTimeBy(400); runCurrent()
        gate!!.complete(Unit); idle(current)
        assertNull(current.state.value.submittedSpaceId)
        assertEquals(SearchNotice.SPACE_GONE, current.state.value.notice)
        assertEquals("budget" to null, api.calls.last())
    }

    @Test fun newerHintCancelsAnInFlightQuietRefresh() = runBlocking {
        val current = ready(); current.query("budget"); current.search(); idle(current)
        val first = CompletableDeferred<Unit>(); api.gate = first
        signals.events.emit(LiveEvent.Ready); advanceTimeBy(400); runCurrent()
        withContext(Dispatchers.Default) { withTimeout(5000) { while (api.calls.size < 2) kotlinx.coroutines.delay(5) } }
        val second = CompletableDeferred<Unit>(); api.gate = second
        signals.events.emit(LiveEvent.Change("search", null, fixture.spaceId, "task")); advanceTimeBy(400); runCurrent()
        withContext(Dispatchers.Default) { withTimeout(5000) { while (api.calls.size < 3) kotlinx.coroutines.delay(5) } }
        api.value = results.copy(documents = listOf(document.copy(excerpt = "Latest budget")))
        second.complete(Unit); idle(current)
        first.complete(Unit)
        assertEquals("Latest budget", current.state.value.results?.documents?.single()?.excerpt)
        assertEquals(SearchNotice.UPDATED, current.state.value.notice)
        current.bind(null)
        signals.events.emit(LiveEvent.Ready); advanceTimeBy(6000); runCurrent()
        assertEquals(SearchState(), current.state.value)
        assertEquals(3, api.calls.size)
    }

    @Test fun invalidNewSubmissionCannotRestoreAnOlderQuietRead() = runBlocking {
        val current = ready(); current.query("budget"); current.search(); idle(current)
        val gate = CompletableDeferred<Unit>(); api.gate = gate
        signals.events.emit(LiveEvent.Ready); advanceTimeBy(400); runCurrent()
        withContext(Dispatchers.Default) { withTimeout(5000) { while (api.calls.size < 2) kotlinx.coroutines.delay(5) } }
        current.query("& *"); current.search()
        gate.complete(Unit); idle(current)
        assertNull(current.state.value.results)
        assertEquals(SearchProblem.WORDS, current.state.value.problem)
        assertEquals(20, current.state.value.limit)
    }

    @Test fun searchAndEntryStringsHaveDraftTranslationsWithIdenticalArguments() {
        val root = listOf(java.io.File("src/main/res"), java.io.File("app/src/main/res"), java.io.File("android/app/src/main/res")).first { it.isDirectory }
        val entryNames = setOf("tasks_from_search", "tasks_from_search_gone", "events_from_search_gone")
        fun strings(locale: String): Map<String, String> {
            val document = javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(java.io.File(root, "$locale/strings.xml"))
            val entries = document.getElementsByTagName("string")
            val result = linkedMapOf<String, String>()
            for (index in 0 until entries.length) {
                val entry = entries.item(index)
                val name = entry.attributes.getNamedItem("name").nodeValue
                if (!name.startsWith("search_") && name !in entryNames) continue
                assertNull("Duplicate $locale/$name", result.put(name, entry.textContent))
            }
            return result
        }
        val english = strings("values")
        assertTrue(english.keys.containsAll(entryNames))
        assertEquals("Results updated.", english["search_updated"])
        val arguments = Regex("%[0-9]+\\\$[a-zA-Z]")
        for (locale in listOf("values-hi", "values-te")) {
            val translated = strings(locale)
            assertEquals(english.keys, translated.keys)
            for ((name, text) in english) {
                assertTrue("Empty $locale/$name", translated.getValue(name).isNotBlank())
                assertEquals("Arguments $locale/$name", arguments.findAll(text).map { it.value }.toList(),
                    arguments.findAll(translated.getValue(name)).map { it.value }.toList())
            }
        }
    }

    @Test fun rejectsWrongQueryScopeRangeMediaAndMissingFlags() {
        val invalid = listOf(results.copy(query = "other"), results.copy(spaceId = fixture.spaceId), results.copy(moreDocuments = null),
            results.copy(documents = listOf(document.copy(spaceId = "bad"))), results.copy(documents = listOf(document.copy(startLine = 0))),
            results.copy(documents = listOf(document.copy(endLine = 1))), results.copy(documents = listOf(document.copy(mediaType = "text/html"))),
            results.copy(documents = listOf(document.copy(addedAt = "yesterday"))), results.copy(moreEvents = true))
        for (value in invalid) assertThrows(IdentityFailure::class.java) { repository.results(value, "budget", null) }
        assertThrows(IdentityFailure::class.java) { repository.results(results.copy(spaceId = taskId), "budget", taskId) }
        assertThrows(IdentityFailure::class.java) { repository.results(results.copy(documents = listOf(document, document.copy(spaceId = taskId))), "budget", null) }
    }

    @Test fun rejectsDuplicateTasksEventsInvalidStatusesAndDates() {
        val invalid = listOf(results.copy(tasks = listOf(task, task)), results.copy(events = listOf(event, event)),
            results.copy(tasks = listOf(task.copy(status = "blocked"))), results.copy(tasks = listOf(task.copy(dueDate = "2026-02-30"))),
            results.copy(events = listOf(event.copy(status = "draft"))), results.copy(events = listOf(event.copy(timezone = "Mars/Base"))),
            results.copy(events = listOf(event.copy(localStart = "2026-10-02T19:30"))), results.copy(events = listOf(event.copy(startsAt = "later"))),
            results.copy(tasks = List(21) { task.copy(taskId = java.util.UUID.randomUUID().toString()) }))
        for (value in invalid) assertThrows(IdentityFailure::class.java) { repository.results(value, "budget", null) }
    }

    @Test fun queryValidationUsesWordsAndUnicodeCodePoints() {
        assertEquals("family budget", normalizedSearchQuery("  family\t\n budget\u00A0 "))
        assertEquals(SearchProblem.WORDS, searchProblem(" * & "))
        assertEquals(SearchProblem.TOO_LONG, searchProblem("a".repeat(201)))
        assertNull(searchProblem("budget"))
        assertNull(searchProblem("\uD801\uDC00".repeat(200)))
    }

    @Test fun interceptedJsonAndWireCarryTheOptionalSpaceFilter() = runBlocking {
        val requests = mutableListOf<Request>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val filtered = results.copy(query = request.url.queryParameter("q")!!, spaceId = request.url.queryParameter("space_id"),
                limit = request.url.queryParameter("limit")?.toInt() ?: 20)
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("Synthetic")
                .body(Gson().toJson(EnvelopeDto(filtered, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = SearchRepository(IdentityModule.search(http, Gson()), fixture.accounts)
        val parsed = wire.search(fixture.accountId, " family  budget ", fixture.spaceId)
        assertEquals("family budget", parsed.query)
        assertEquals(document, parsed.documents.single())
        assertEquals("/v1/search", requests[0].url.encodedPath)
        assertEquals(fixture.spaceId, requests[0].url.queryParameter("space_id"))
        assertEquals("family budget", requests[0].url.queryParameter("q"))
        assertEquals("Bearer ${fixture.token}", requests[0].header("Authorization"))
        assertNull(requests[0].url.queryParameter("limit"))
        wire.search(fixture.accountId, "budget", null)
        assertNull(requests[1].url.queryParameter("space_id"))
        assertEquals(40, wire.search(fixture.accountId, "budget", null, 40).limit)
        assertEquals("40", requests[2].url.queryParameter("limit"))
    }

    @Test fun searchResponseCapIsExactly256KiB() {
        var size = 262144
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("Synthetic")
                .body("x".repeat(size).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val request = Request.Builder().url("https://offline.invalid/v1/search?q=budget").build()
        http.newCall(request).execute().use { assertEquals(262144L, it.body!!.contentLength()) }
        size += 1
        assertThrows(IOException::class.java) { http.newCall(request).execute().close() }
    }

    @Test fun typingAndFilteringNeverSearchUntilTheExplicitAction() = runBlocking {
        val current = ready()
        assertEquals(listOf(fixture.space), current.state.value.spaces)
        current.query("  budget "); current.query("family budget"); current.filter(fixture.spaceId)
        assertTrue(api.calls.isEmpty())
        current.search(); idle(current)
        assertEquals(listOf("family budget" to fixture.spaceId), api.calls)
        assertEquals(fixture.spaceId, current.state.value.results?.spaceId)
        current.filter(null)
        assertNull(current.state.value.results)
        assertEquals(1, api.calls.size)
    }

    @Test fun badQueriesAndUnknownFiltersDoNotReachTheApi() = runBlocking {
        val current = ready()
        current.query("& *"); current.search()
        assertEquals(SearchProblem.WORDS, current.state.value.problem)
        current.query("x".repeat(201)); current.search()
        assertEquals(SearchProblem.TOO_LONG, current.state.value.problem)
        current.filter(taskId)
        assertNull(current.state.value.spaceId)
        assertTrue(api.calls.isEmpty())
    }

    @Test fun accountChangeDropsLatePrivateSearchResults() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val delayed = object : SearchApi by api {
            override suspend fun search(authorization: String, query: String, spaceId: String?, limit: Int?): Response<EnvelopeDto<SearchResultsDto>> {
                entered.complete(Unit); release.await(); return api.search(authorization, query, spaceId, limit)
            }
        }
        val current = SearchViewModel(SearchRepository(delayed, fixture.accounts), fixture.repository); model = current
        current.bind(fixture.accountId); idle(current)
        current.query("budget"); current.search()
        withTimeout(5000) { entered.await() }
        current.bind(null); release.complete(Unit)
        assertEquals(SearchState(), current.state.value)
    }

    @Test fun definiteErrorIsShownAndSessionLossClearsPrivateData() = runBlocking {
        val current = ready()
        current.query("budget"); api.failure = 422
        current.search(); idle(current)
        assertEquals("Synthetic search error", current.state.value.error)
        assertFalse(current.state.value.searching)
        api.failure = 0
        current.search(); idle(current)
        assertEquals(1, current.state.value.results?.documents?.size)
        api.failure = 401
        current.search(); idle(current)
        assertTrue(current.state.value.requiresSignIn)
        assertTrue(current.state.value.spaces.isEmpty())
        assertNull(current.state.value.results)
    }
}