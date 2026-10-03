package com.community.platform.feature.community

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
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
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections
import java.util.UUID

/** Mutes, Not interested and Undo (T136, DEC-037), against a synthetic server behind the real HTTP client. */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedControlsTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val gson = Gson()
    private val stamp = "2026-10-03T10:00:00Z"
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val otherPageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a09"
    private val postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val otherPostId = "5f2b5d20-7e7d-4c60-9c73-2e6b5b4d3c03"
    private val page = PageDto(otherPageId, "town-news", "Town News", "", "news", 3, stamp, stamp, false, false, false, null, status = "active")
    private fun post(id: String, page: String = pageId, topics: List<String> = emptyList()) =
        PostDto(id, page, if (page == pageId) "river-walkers" else "town-news", if (page == pageId) "River Walkers" else "Town News", "Walk", "Meet at 7", "published",
            0, 0, stamp, stamp, null, false, false, false, null, topics = topics, interests = emptyList())

    inner class Server {
        val requests: MutableList<Request> = Collections.synchronizedList(mutableListOf())
        val bodies: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val posts = mutableListOf(post(postId, topics = listOf("hobbies")), post(otherPostId, otherPageId))
        val controls = mutableListOf<FeedControlDto>()
        var addError: Pair<Int, String>? = null
        var controlsJson: String? = null

        private fun json(code: Int, body: String, request: Request) = okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(code).message("Synthetic")
            .body(body.toResponseBody("application/json".toMediaType())).build()
        private fun <Value> ok(value: Value, request: Request, pagination: PaginationDto? = null) = json(200, gson.toJson(EnvelopeDto(value, null, pagination)), request)
        private fun error(code: Int, name: String, request: Request) =
            json(code, gson.toJson(mapOf("error" to mapOf("code" to name, "message" to "Synthetic $name", "details" to emptyMap<String, String>()))), request)

        /** What the server leaves out of the lists, as DEC-037 says. */
        private fun shown(item: PostDto) = controls.none { control ->
            control.kind == "hide_post" && control.postId == item.id || control.kind == "mute_page" && control.pageId == item.pageId ||
                control.kind == "mute_term" && control.code in item.topics.orEmpty()
        }

        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); val body = buffer.readUtf8(); bodies += body
            val path = request.url.encodedPath
            val none = PaginationDto(null, false)
            when {
                path == "/v1/feed" || path == "/v1/discover/posts" -> ok(posts.filter(::shown), request, none)
                path == "/v1/taxonomy" -> ok(emptyList<TermDto>(), request)
                path == "/v1/discover/pages" -> ok(emptyList<PageDto>(), request, none)
                path == "/v1/me/suggested-pages" -> ok(SuggestionsDto("interests-1", if (controls.any { it.pageId == otherPageId }) emptyList()
                    else listOf(SuggestedPageDto(page, listOf(ReasonDto("topic", "news"))))), request)
                path == "/v1/me/interest-posts" -> ok(emptyList<InterestPostDto>(), request, none)
                path == "/v1/me/feed-controls" && request.method == "GET" -> controlsJson?.let { json(200, it, request) } ?: ok(controls.toList(), request)
                path == "/v1/me/feed-controls" && request.method == "POST" -> {
                    addError?.let { (code, name) -> return@addInterceptor error(code, name, request) }
                    val sent = gson.fromJson(body, AddFeedControlDto::class.java)
                    val existing = controls.firstOrNull { it.kind == sent.kind && (if (sent.kind == "hide_post") it.postId == sent.postId else it.pageId == sent.pageId && it.code == sent.code) }
                    val control = existing ?: FeedControlDto(UUID.randomUUID().toString(), sent.kind,
                        pageId = sent.pageId ?: if (sent.kind == "hide_post") posts.first { it.id == sent.postId }.pageId else null,
                        pageName = if (sent.kind == "mute_term") null else "Some page", postId = sent.postId,
                        postAvailable = if (sent.kind == "hide_post") true else null, dimension = sent.dimension, code = sent.code, createdAt = stamp)
                    if (existing == null) controls.add(0, control)
                    json(201, gson.toJson(EnvelopeDto(control, null, null)), request)
                }
                path.startsWith("/v1/me/feed-controls/") && path.endsWith("/remove") -> {
                    val id = path.removePrefix("/v1/me/feed-controls/").removeSuffix("/remove")
                    if (controls.removeIf { it.id == id }) ok(OutcomeDto(id, "removed"), request) else error(404, "NOT_FOUND", request)
                }
                else -> error(404, "NOT_FOUND", request)
            }
        }.build()

        val community = CommunityRepository(IdentityModule.community(http, gson), fixture.accounts)
        val classification = ClassificationRepository(IdentityModule.classification(http, gson), community)
        val repository = FeedControlsRepository(IdentityModule.feedControls(http, gson), community)
        fun sent(method: String) = requests.indices.filter { requests[it].url.encodedPath == "/v1/me/feed-controls" && requests[it].method == method }.map { bodies[it] }
    }

    private var model: CommunityViewModel? = null
    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private suspend fun idle(current: CommunityViewModel) = withTimeout(5000) { current.state.first { !it.busy && !it.interestPostsLoading } }
    private suspend fun model(server: Server, destination: Destination = Destination.Feed(FeedTab.FOLLOWING)): CommunityViewModel {
        val current = CommunityViewModel(server.community, server.classification, server.repository); model = current
        current.bind(fixture.accountId); idle(current)
        if (destination != Destination.Feed(FeedTab.FOLLOWING)) { current.open(destination, remember = false); idle(current) }
        return current
    }

    private fun row(kind: String, extra: String) = """{"id":"${UUID.randomUUID()}","kind":"$kind",$extra"created_at":"$stamp"}"""

    @Test fun controlsAreReadAndMalformedOnesRefused(): Unit = runBlocking {
        val server = Server()
        server.controlsJson = """{"data":[${row("mute_page", """"page_id":"$pageId","page_handle":"river-walkers","page_name":"River Walkers",""")},""" +
            """${row("hide_post", """"page_id":"$pageId","page_handle":null,"page_name":null,"post_id":"$postId","post_title":null,"post_available":false,""")},""" +
            """${row("mute_term", """"dimension":"interest","code":"hiking",""")},${row("hide_suggestion", """"page_id":"$otherPageId",""")}]}"""
        val list = server.repository.controls(fixture.accountId)
        assertEquals(listOf("mute_page", "hide_post", "mute_term", "hide_suggestion"), list.map { it.kind })
        assertEquals(false, list[1].postAvailable)
        assertNull(list[1].pageName)
        assertEquals("Bearer ${fixture.token}", server.requests.last().header("Authorization"))

        val same = UUID.randomUUID()
        for (bad in listOf(
            row("mute_everything", """"page_id":"$pageId","""),
            row("mute_page", ""),
            row("mute_page", """"page_id":"$pageId","code":"hiking","""),
            row("hide_post", """"post_id":"$postId","""),
            row("mute_term", """"dimension":"place","code":"pune","""),
            row("mute_term", """"dimension":"topic","code":"Not A Code","""),
            row("mute_term", """"dimension":"topic","code":"news","page_id":"$pageId","""),
            """{"id":"not-a-uuid","kind":"mute_page","page_id":"$pageId","created_at":"$stamp"}""",
            """{"id":"$same","kind":"mute_page","page_id":"$pageId","created_at":"$stamp"},{"id":"$same","kind":"mute_page","page_id":"$otherPageId","created_at":"$stamp"}""",
        )) {
            server.controlsJson = """{"data":[$bad]}"""
            assertThrows(bad, IdentityFailure::class.java) { runBlocking { server.repository.controls(fixture.accountId) } }
        }
    }

    @Test fun eachKindSendsOnlyItsOwnFieldsAndRepeatingReturnsTheSameControl(): Unit = runBlocking {
        val server = Server()
        val hidden = server.repository.add(fixture.accountId, AddFeedControlDto.hidePost(postId))
        server.repository.add(fixture.accountId, AddFeedControlDto.mutePage(pageId))
        server.repository.add(fixture.accountId, AddFeedControlDto.muteTerm("topic", "hobbies"))
        server.repository.add(fixture.accountId, AddFeedControlDto.hideSuggestion(otherPageId))
        val keys = server.sent("POST").map { JsonParser.parseString(it).asJsonObject.keySet() }
        assertEquals(listOf(setOf("kind", "post_id"), setOf("kind", "page_id"), setOf("kind", "dimension", "code"), setOf("kind", "page_id")), keys)
        assertEquals("hide_post", JsonParser.parseString(server.sent("POST").first()).asJsonObject.get("kind").asString)
        assertEquals(hidden.id, server.repository.add(fixture.accountId, AddFeedControlDto.hidePost(postId)).id)
        // A body whose kind and target do not match is never sent.
        assertThrows(IdentityFailure::class.java) { runBlocking { server.repository.add(fixture.accountId, AddFeedControlDto("hide_post", pageId = pageId)) } }
        assertThrows(IdentityFailure::class.java) { runBlocking { server.repository.add(fixture.accountId, AddFeedControlDto.muteTerm("place", "pune")) } }
        assertEquals(5, server.sent("POST").size)
    }

    @Test fun removingSendsAnEmptyBodyAndAlreadyRemovedCountsAsRemoved(): Unit = runBlocking {
        val server = Server()
        val control = server.repository.add(fixture.accountId, AddFeedControlDto.mutePage(pageId))
        assertEquals(OutcomeDto(control.id, "removed"), server.repository.remove(fixture.accountId, control.id))
        assertEquals("{}", server.bodies.last())
        assertEquals(OutcomeDto(control.id, "removed"), server.repository.remove(fixture.accountId, control.id))
        assertEquals(2, server.requests.count { it.url.encodedPath == "/v1/me/feed-controls/${control.id}/remove" })
    }

    @Test fun notInterestedRemovesThePostInPlaceAndUndoBringsItBack(): Unit = runBlocking {
        val server = Server()
        val current = model(server)
        assertEquals(listOf(postId, otherPostId), current.state.value.posts.map { it.id })
        val feedLoads = server.requests.count { it.url.encodedPath == "/v1/feed" }
        current.hidePost(current.state.value.posts.first()); idle(current)
        assertEquals(listOf(otherPostId), current.state.value.posts.map { it.id })
        assertEquals("hide_post", current.state.value.undo?.control?.kind)
        // Removed in place: the list was not loaded again.
        assertEquals(feedLoads, server.requests.count { it.url.encodedPath == "/v1/feed" })

        current.undoControl(); idle(current)
        assertNull(current.state.value.undo)
        assertEquals(FEED_CONTROL_UNDONE, current.state.value.notice)
        assertEquals(listOf(postId, otherPostId), current.state.value.posts.map { it.id })
        assertTrue(server.controls.isEmpty())
    }

    @Test fun mutingAPageOrTopicRemovesEveryPostItCovers(): Unit = runBlocking {
        val server = Server()
        val current = model(server, Destination.Feed(FeedTab.LATEST))
        current.mutePage(otherPageId, "Town News"); idle(current)
        assertEquals(listOf(postId), current.state.value.posts.map { it.id })
        assertEquals("Town News", current.state.value.undo?.name)
        current.muteTerm("topic", "hobbies"); idle(current)
        assertEquals(emptyList<String>(), current.state.value.posts.map { it.id })
        assertEquals("mute_term", current.state.value.undo?.control?.kind)
    }

    @Test fun aRefusedControlKeepsTheItemAndShowsTheError(): Unit = runBlocking {
        val server = Server()
        server.addError = 409 to "FEED_CONTROL_LIMIT_REACHED"
        val current = model(server)
        current.hidePost(current.state.value.posts.first()); idle(current)
        assertEquals(listOf(postId, otherPostId), current.state.value.posts.map { it.id })
        assertEquals("Synthetic FEED_CONTROL_LIMIT_REACHED", current.state.value.error)
        assertNull(current.state.value.undo)
    }

    @Test fun savedPostsOfferNoControls(): Unit = runBlocking {
        val server = Server()
        val current = model(server, Destination.Feed(FeedTab.SAVED))
        current.hidePost(post(postId)); idle(current)
        assertTrue(server.sent("POST").isEmpty())
    }

    @Test fun notInterestedOnASuggestionRemovesItFromSuggestionsOnly(): Unit = runBlocking {
        val server = Server()
        val current = model(server, Destination.Discover)
        assertEquals(listOf(otherPageId), current.state.value.suggestions.map { it.page.id })
        current.hideSuggestion(page); idle(current)
        assertTrue(current.state.value.suggestions.isEmpty())
        assertEquals("hide_suggestion", JsonParser.parseString(server.sent("POST").single()).asJsonObject.get("kind").asString)
        current.undoControl(); idle(current)
        assertEquals(listOf(otherPageId), current.state.value.suggestions.map { it.page.id })
    }

    @Test fun mutedAndHiddenLoadsAndEachRowCanBeUndone(): Unit = runBlocking {
        val server = Server()
        server.repository.add(fixture.accountId, AddFeedControlDto.mutePage(pageId))
        server.repository.add(fixture.accountId, AddFeedControlDto.muteTerm("interest", "hiking"))
        val current = model(server, Destination.FeedControls)
        assertTrue(current.state.value.controlsLoaded)
        assertEquals(listOf("mute_term", "mute_page"), current.state.value.controls.map { it.kind })
        val term = current.state.value.controls.first()
        current.removeControl(term); idle(current)
        assertEquals(listOf("mute_page"), current.state.value.controls.map { it.kind })
        assertEquals(FEED_CONTROL_UNDONE, current.state.value.notice)
        // One already undone elsewhere (404) also leaves the list.
        server.controls.clear()
        current.removeControl(current.state.value.controls.single()); idle(current)
        assertTrue(current.state.value.controls.isEmpty())
        assertNull(current.state.value.error)
    }

    @Test fun anotherAccountDropsTheControls(): Unit = runBlocking {
        val server = Server()
        server.repository.add(fixture.accountId, AddFeedControlDto.mutePage(pageId))
        val current = model(server, Destination.FeedControls)
        assertNotNull(current.state.value.controls.singleOrNull())
        current.bind(null)
        assertTrue(current.state.value.controls.isEmpty())
        assertNull(current.state.value.undo)
    }
}
