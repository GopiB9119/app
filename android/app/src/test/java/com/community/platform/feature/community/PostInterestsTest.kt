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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections

/** A post's own topics and interests, and "From your interests" on Discover (T129), against a synthetic server behind the real HTTP client. */
@OptIn(ExperimentalCoroutinesApi::class)
class PostInterestsTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val gson = Gson()
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val otherPostId = "5f2b5d20-7e7d-4c60-9c73-2e6b5b4d3c03"
    private val stamp = "2026-10-03T10:00:00Z"
    private val page = PageDto(pageId, "river-walkers", "River Walkers", "Weekend walks", "hobbies", 0, stamp, stamp, false, false, true, "\"p1\"", rules = "", status = "active")
    private val post = PostDto(postId, pageId, page.handle, page.name, "Saturday walk", "Meet at 7", "published", 0, 0, stamp, stamp, null, false, false, false, null,
        topics = listOf("hobbies"), interests = listOf("hiking"))
    private val terms = listOf(
        TermDto("topic", "hobbies", null, false, "active", TermNamesDto("Hobbies", null, null)),
        TermDto("topic", "events", null, false, "active", TermNamesDto("Events", null, null)),
        TermDto("interest", "hiking", null, false, "active", TermNamesDto("Hiking", null, null)),
        TermDto("interest", "fax", null, false, "retired", TermNamesDto("Fax machines", null, null)),
    )

    inner class Server {
        val requests: MutableList<Request> = Collections.synchronizedList(mutableListOf())
        val bodies: MutableList<String> = Collections.synchronizedList(mutableListOf())
        /** The raw JSON of each page of interest posts, by cursor ("" for the first). */
        val interestPages = mutableMapOf<String, String>()
        /** Cursors the server no longer accepts, as after the person changed their interests. */
        val staleCursors = mutableSetOf<String>()
        var interestStatus = 200
        var current = post.copy(canManage = true, etag = "\"v1\"")

        private fun json(code: Int, body: String, request: Request) = okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(code).message("Synthetic")
            .body(body.toResponseBody("application/json".toMediaType())).build()
        private fun <Value> ok(value: Value, request: Request, pagination: PaginationDto? = null) = json(200, gson.toJson(EnvelopeDto(value, null, pagination)), request)
        private fun error(code: Int, name: String, request: Request, details: Map<String, String> = emptyMap()) =
            json(code, gson.toJson(mapOf("error" to mapOf("code" to name, "message" to "Synthetic $name", "details" to details))), request)

        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); val body = buffer.readUtf8(); bodies += body
            val path = request.url.encodedPath
            val none = PaginationDto(null, false)
            when {
                path == "/v1/taxonomy" -> ok(terms, request)
                path == "/v1/feed" -> ok(emptyList<PostDto>(), request, none)
                path == "/v1/discover/pages" -> ok(emptyList<PageDto>(), request, none)
                path == "/v1/me/suggested-pages" -> ok(SuggestionsDto("interests-1", emptyList()), request)
                path == "/v1/me/interest-posts" -> {
                    val cursor = request.url.queryParameter("cursor").orEmpty()
                    when {
                        interestStatus != 200 -> error(interestStatus, "UNAVAILABLE", request)
                        cursor in staleCursors -> error(400, "CURSOR_INVALID", request)
                        else -> json(200, interestPages[cursor] ?: """{"data":[],"pagination":{"next_cursor":null,"has_more":false}}""", request)
                    }
                }
                path == "/v1/pages/${page.handle}" -> ok(page, request)
                path == "/v1/pages/$pageId/posts" && request.method == "POST" -> {
                    val sent = gson.fromJson(body, CreatePostDto::class.java)
                    if ("fax" in sent.interests) error(422, "TERM_UNAVAILABLE", request, mapOf("field" to "interests", "codes" to "fax"))
                    else ok(post.copy(id = otherPostId, status = "draft", publishedAt = null, canManage = true, etag = "\"d1\"", title = sent.title, body = sent.body,
                        topics = sent.topics, interests = sent.interests), request)
                }
                path == "/v1/posts/$postId" && request.method == "PATCH" -> {
                    val sent = JsonParser.parseString(body).asJsonObject
                    if (sent.has("interests") && sent.getAsJsonArray("interests").any { it.asString == "fax" }) return@addInterceptor error(422, "TERM_UNAVAILABLE", request, mapOf("field" to "interests", "codes" to "fax"))
                    current = current.copy(
                        title = if (sent.has("title")) sent.get("title").takeUnless { it.isJsonNull }?.asString else current.title,
                        body = if (sent.has("body")) sent.get("body").asString else current.body,
                        topics = if (sent.has("topics")) sent.getAsJsonArray("topics").map { it.asString } else current.topics,
                        interests = if (sent.has("interests")) sent.getAsJsonArray("interests").map { it.asString } else current.interests,
                        editedAt = stamp, etag = "\"v2\"")
                    ok(current, request)
                }
                path.endsWith("/posts") -> ok(emptyList<PostDto>(), request, none)
                path.endsWith("/pinned-posts") || path.endsWith("/drafts") || path.endsWith("/moderators") -> ok(emptyList<Any>(), request)
                else -> error(404, "NOT_FOUND", request)
            }
        }.build()

        val community = CommunityRepository(IdentityModule.community(http, gson), fixture.accounts)
        val classification = ClassificationRepository(IdentityModule.classification(http, gson), community)
        fun sent(path: String, method: String) = requests.indices.filter { requests[it].url.encodedPath == path && requests[it].method == method }.map { bodies[it] }
    }

    private fun item(id: String, reasons: String, extra: String = "") =
        """{"post":{"id":"$id","page_id":"$pageId","page_handle":"river-walkers","page_name":"River Walkers","title":null,"body":"Hello","status":"published",""" +
            """"like_count":0,"comment_count":0,"created_at":"$stamp","published_at":"$stamp","edited_at":null,"liked":false,"saved":false,"can_manage":false,"etag":null$extra},"reasons":$reasons}"""
    private fun pageOf(cursor: String?, vararg items: String) =
        """{"data":[${items.joinToString(",")}],"pagination":{"next_cursor":${cursor?.let { "\"$it\"" } ?: "null"},"has_more":${cursor != null}}}"""

    private var model: CommunityViewModel? = null
    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private suspend fun idle(current: CommunityViewModel) = withTimeout(5000) { current.state.first { !it.busy && !it.interestPostsLoading } }
    private suspend fun discover(server: Server): CommunityViewModel {
        val current = CommunityViewModel(server.community, server.classification); model = current
        current.bind(fixture.accountId); idle(current)
        current.open(Destination.Discover)
        withTimeout(5000) { current.state.first { !it.busy && !it.interestPostsLoading && it.interestPostsStatus != null } }
        return current
    }

    @Test fun interestPostsAreReadWithReasonsAndPostsWithoutTermsHaveEmptyLists(): Unit = runBlocking {
        val server = Server()
        server.interestPages[""] = pageOf("c1", item(postId, """[{"dimension":"interest","code":"hiking"}]""", ""","topics":["hobbies"],"interests":["hiking"]"""),
            item(otherPostId, """[{"dimension":"topic","code":"hobbies"}]"""))
        val result = server.classification.interestPosts(fixture.accountId, null)
        assertEquals("c1", result.nextCursor)
        assertEquals(listOf(postId, otherPostId), result.items.map { it.post.id })
        assertEquals(listOf("hobbies"), result.items[0].post.topics)
        assertEquals(listOf(ReasonDto("interest", "hiking")), result.items[0].reasons)
        // An older server leaves the post's lists out: they are empty, not null.
        assertEquals(emptyList<String>(), result.items[1].post.topics)
        assertEquals(emptyList<String>(), result.items[1].post.interests)
        assertEquals("20", server.requests.last().url.queryParameter("limit"))
        assertEquals("Bearer ${fixture.token}", server.requests.last().header("Authorization"))
    }

    @Test fun malformedInterestPostsAreRefused(): Unit = runBlocking {
        val reason = """[{"dimension":"topic","code":"hobbies"}]"""
        for (bad in listOf(
            pageOf(null, item(postId, "[]")),
            pageOf(null, item(postId, reason), item(postId, reason)),
            pageOf(null, item(postId, """[{"dimension":"place","code":"pune"}]""")),
            pageOf(null, item(postId, """[{"dimension":"topic","code":"hobbies"},{"dimension":"topic","code":"hobbies"}]""")),
            pageOf(null, item(postId, reason, ""","topics":["a","b","c","d"]""")),
            pageOf(null, item(postId, reason, ""","interests":["hiking","hiking"]""")),
            pageOf(null, item(postId, reason, ""","topics":["Not A Code"]""")),
            pageOf("c1"),
        )) {
            val server = Server()
            server.interestPages[""] = bad
            assertThrows(bad, IdentityFailure::class.java) { runBlocking { server.classification.interestPosts(fixture.accountId, null) } }
        }
    }

    @Test fun postValidationChecksTopicAndInterestLimits() {
        val repository = Server().community
        assertEquals(post, repository.post(post))
        assertEquals(post.copy(topics = emptyList(), interests = emptyList()), repository.post(post.copy(topics = null, interests = null)))
        for (bad in listOf(post.copy(topics = listOf("a", "b", "c", "d")), post.copy(interests = (1..6).map { "i-$it" }),
            post.copy(topics = listOf("a", "a")), post.copy(interests = listOf("Bad!")))) assertThrows(IdentityFailure::class.java) { repository.post(bad) }
    }

    @Test fun createSendsTheChosenTermsAndConfirmsThem(): Unit = runBlocking {
        val server = Server()
        val created = server.community.create(CreateIntent.Post(fixture.accountId, "k1", pageId, CreatePostDto("Walk", "Meet", listOf("events"), listOf("hiking")))) as PostDto
        assertEquals(listOf("events"), created.topics)
        val body = JsonParser.parseString(server.sent("/v1/pages/$pageId/posts", "POST").single()).asJsonObject
        assertEquals(listOf("events"), body.getAsJsonArray("topics").map { it.asString })
        assertEquals(listOf("hiking"), body.getAsJsonArray("interests").map { it.asString })
        // Without terms, empty lists are sent rather than null.
        server.community.create(CreateIntent.Post(fixture.accountId, "k2", pageId, CreatePostDto(null, "Meet")))
        val plain = JsonParser.parseString(server.sent("/v1/pages/$pageId/posts", "POST").last()).asJsonObject
        assertEquals(0, plain.getAsJsonArray("topics").size())
        assertEquals(0, plain.getAsJsonArray("interests").size())
    }

    @Test fun editSendsOnlyTheListsThatChanged(): Unit = runBlocking {
        val server = Server()
        // The post keeps a retired interest; changing only its topics must not send that interest again.
        val opened = server.current.copy(interests = listOf("fax"))
        server.current = opened
        val saved = server.community.updatePost(fixture.accountId, opened, opened.title, opened.body, topics = listOf("events"), interests = listOf("fax"))
        assertEquals(listOf("events"), saved.topics)
        val body = JsonParser.parseString(server.sent("/v1/posts/$postId", "PATCH").single()).asJsonObject
        assertEquals(setOf("topics"), body.keySet())
        assertEquals("\"v1\"", server.requests.last().header("If-Match"))

        // An empty list removes every topic; an unchanged list is left out.
        val second = server.community.updatePost(fixture.accountId, saved, saved.title, "Meet at 8", topics = emptyList(), interests = saved.interests)
        assertEquals(emptyList<String>(), second.topics)
        val emptied = JsonParser.parseString(server.sent("/v1/posts/$postId", "PATCH").last()).asJsonObject
        assertEquals(setOf("body", "topics"), emptied.keySet())
        assertEquals(0, emptied.getAsJsonArray("topics").size())

        // Text only: no list is sent.
        server.community.updatePost(fixture.accountId, second, null, second.body)
        val textOnly = JsonParser.parseString(server.sent("/v1/posts/$postId", "PATCH").last()).asJsonObject
        assertEquals(setOf("title"), textOnly.keySet())
        assertTrue(textOnly.get("title").isJsonNull)
        assertThrows(IdentityFailure::class.java) { runBlocking { server.community.updatePost(fixture.accountId, second, second.title, second.body, topics = listOf("a", "b", "c", "d")) } }
    }

    @Test fun feedsLoadTermNamesOnceForTheirMenus(): Unit = runBlocking {
        val server = Server()
        val current = CommunityViewModel(server.community, server.classification); model = current
        // Following opens first; the topic chips and the Mute menu on its posts need names, not codes.
        current.bind(fixture.accountId); idle(current)
        assertEquals("Hiking", current.state.value.taxonomy?.name("interest", "hiking", "en"))
        current.open(Destination.Feed(FeedTab.LATEST)); idle(current)
        current.open(Destination.Feed(FeedTab.FOLLOWING)); idle(current)
        assertEquals(1, server.requests.count { it.url.encodedPath == "/v1/taxonomy" })
    }

    @Test fun discoverLoadsInterestPostsAndShowsMore(): Unit = runBlocking {
        val server = Server()
        server.interestPages[""] = pageOf("c1", item(postId, """[{"dimension":"interest","code":"hiking"}]"""))
        server.interestPages["c1"] = pageOf(null, item(otherPostId, """[{"dimension":"topic","code":"hobbies"}]"""))
        val current = discover(server)
        assertEquals(ListStatus.LOADED, current.state.value.interestPostsStatus)
        assertEquals(listOf(postId), current.state.value.interestPosts.map { it.post.id })
        assertEquals("c1", current.state.value.interestPostsCursor)
        current.moreInterestPosts(); idle(current)
        assertEquals(listOf(postId, otherPostId), current.state.value.interestPosts.map { it.post.id })
        assertEquals(null, current.state.value.interestPostsCursor)
        assertEquals(listOf(null, "c1"), server.requests.filter { it.url.encodedPath == "/v1/me/interest-posts" }.map { it.url.queryParameter("cursor") })
    }

    @Test fun anOutdatedCursorLoadsTheListAgainFromTheStart(): Unit = runBlocking {
        val server = Server()
        server.interestPages[""] = pageOf("c1", item(postId, """[{"dimension":"interest","code":"hiking"}]"""))
        val current = discover(server)
        // The person changed their interests elsewhere: the old cursor is refused and the new first page replaces the list.
        server.staleCursors += "c1"
        server.interestPages[""] = pageOf(null, item(otherPostId, """[{"dimension":"topic","code":"hobbies"}]"""))
        current.moreInterestPosts(); idle(current)
        assertEquals(listOf(otherPostId), current.state.value.interestPosts.map { it.post.id })
        assertEquals(null, current.state.value.interestPostsCursor)
        assertEquals(ListStatus.LOADED, current.state.value.interestPostsStatus)
        assertEquals(null, current.state.value.error)
        assertEquals(listOf(null, "c1", null), server.requests.filter { it.url.encodedPath == "/v1/me/interest-posts" }.map { it.url.queryParameter("cursor") })
    }

    @Test fun nothingChosenShowsAnEmptyListAndAFailureNeverHidesThePages(): Unit = runBlocking {
        val empty = discover(Server())
        assertEquals(ListStatus.LOADED, empty.state.value.interestPostsStatus)
        assertTrue(empty.state.value.interestPosts.isEmpty())
        empty.bind(null)

        val server = Server().apply { interestStatus = 503 }
        val failed = discover(server)
        assertEquals(ListStatus.FAILED, failed.state.value.interestPostsStatus)
        assertEquals(null, failed.state.value.error)
        server.interestStatus = 200
        server.interestPages[""] = pageOf(null, item(postId, """[{"dimension":"interest","code":"hiking"}]"""))
        failed.moreInterestPosts(); idle(failed)
        assertEquals(ListStatus.LOADED, failed.state.value.interestPostsStatus)
        assertEquals(listOf(postId), failed.state.value.interestPosts.map { it.post.id })
    }

    @Test fun aRetiredTermKeepsTheDraftAndMarksTheTerm(): Unit = runBlocking {
        val server = Server()
        val current = CommunityViewModel(server.community, server.classification); model = current
        current.bind(fixture.accountId); idle(current)
        current.open(Destination.Page(page.handle)); idle(current)
        val session = current.state.value.composerSession
        assertTrue(current.createPost("Walk", "Meet at 7", listOf("events"), listOf("fax"))); idle(current)
        assertEquals(TERMS_UNAVAILABLE, current.state.value.error)
        assertEquals(listOf("fax"), current.state.value.unavailableTerms)
        assertEquals(null, current.state.value.pending)
        assertEquals(session, current.state.value.composerSession)

        assertTrue(current.createPost("Walk", "Meet at 7", listOf("events"), listOf("hiking"))); idle(current)
        assertEquals(session + 1, current.state.value.composerSession)
        assertTrue(current.state.value.unavailableTerms.isEmpty())
        // Too many topics are refused before anything is sent.
        val posts = server.sent("/v1/pages/$pageId/posts", "POST").size
        assertFalse(current.createPost("Walk", "Meet", listOf("hobbies", "events", "a", "b"), emptyList()))
        assertEquals(posts, server.sent("/v1/pages/$pageId/posts", "POST").size)
    }

    @Test fun editingTermsOnTheScreenSendsOnlyChangedLists(): Unit = runBlocking {
        val server = Server()
        val current = CommunityViewModel(server.community, server.classification); model = current
        current.bind(fixture.accountId); idle(current)
        val opened = server.current
        current.open(Destination.Page(page.handle)); idle(current)
        current.startEdit(opened)
        assertTrue(current.editPost(opened, opened.title.orEmpty(), opened.body, listOf("events"), opened.interests)); idle(current)
        assertEquals(setOf("topics"), JsonParser.parseString(server.sent("/v1/posts/$postId", "PATCH").single()).asJsonObject.keySet())
        assertEquals(null, current.state.value.editingPostId)

        // A retired interest is refused: the editor stays open with the term marked.
        val saved = server.current
        current.startEdit(saved)
        assertTrue(current.editPost(saved, saved.title.orEmpty(), saved.body, saved.topics, listOf("fax"))); idle(current)
        assertEquals(TERMS_UNAVAILABLE, current.state.value.error)
        assertEquals(listOf("fax"), current.state.value.unavailableTerms)
        assertEquals(saved.id, current.state.value.editingPostId)
    }
}
