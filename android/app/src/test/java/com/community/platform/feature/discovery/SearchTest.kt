package com.community.platform.feature.discovery

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
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
    private val task = SearchTaskDto(taskId, fixture.spaceId, "Morgan family", "Budget review", "Plan the budget", "open", "2026-10-02")
    private val event = SearchEventDto(eventId, fixture.spaceId, "Morgan family", "Budget meeting", "Home", "scheduled", "2026-10-02T13:00:00Z", "Asia/Kolkata", "2026-10-02T18:30")
    private val results = SearchResultsDto("budget", null, listOf(document), listOf(task), listOf(event), false, false, false)

    inner class FakeApi : SearchApi {
        var value = results
        var failure = 0
        val calls = mutableListOf<Pair<String, String?>>()
        override suspend fun search(authorization: String, query: String, spaceId: String?): Response<EnvelopeDto<SearchResultsDto>> {
            calls += query to spaceId
            return if (failure != 0) Response.error(failure,
                """{"error":{"code":"SYNTHETIC","message":"Synthetic search error"}}""".toResponseBody("application/json".toMediaType()))
            else Response.success(EnvelopeDto(value.copy(query = query, spaceId = spaceId), null))
        }
    }

    private val api = FakeApi()
    private val repository = SearchRepository(api, fixture.accounts)
    private var model: SearchViewModel? = null
    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }
    private suspend fun idle(current: SearchViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(): SearchViewModel {
        val current = SearchViewModel(repository, fixture.repository); model = current
        current.bind(fixture.accountId); idle(current)
        return current
    }

    @Test fun parsesAllThreeKindsAndAllowsDistinctPassagesOfOneDocument() {
        val passages = results.copy(documents = listOf(document, document.copy(startLine = 8, endLine = 9, excerpt = "Another budget passage")))
        assertEquals(passages, repository.results(passages, "budget", null))
        assertEquals("open", repository.results(results, "budget", null).tasks.single().status)
        assertEquals("scheduled", repository.results(results, "budget", null).events.single().status)
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
            val filtered = results.copy(query = request.url.queryParameter("q")!!, spaceId = request.url.queryParameter("space_id"))
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
        wire.search(fixture.accountId, "budget", null)
        assertNull(requests[1].url.queryParameter("space_id"))
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
            override suspend fun search(authorization: String, query: String, spaceId: String?): Response<EnvelopeDto<SearchResultsDto>> {
                entered.complete(Unit); release.await(); return api.search(authorization, query, spaceId)
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