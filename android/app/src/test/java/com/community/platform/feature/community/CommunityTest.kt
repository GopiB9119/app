package com.community.platform.feature.community

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
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
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val commentId = "5f2b5d20-7e7d-4c60-9c73-2e6b5b4d3c03"
    private val page = PageDto(pageId, "river-walkers", "River Walkers", "Weekend walks", "hobbies", 0, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", false, false, false, null)
    private val post = PostDto(postId, pageId, "river-walkers", "River Walkers", "Saturday walk", "Meet at 7", "published", 0, 0, "2026-09-19T10:00:00Z", "2026-09-19T10:01:00Z", null, false, false, false, null)
    private val comment = CommentDto(commentId, postId, null, "Sam", "Count me in", "visible", "2026-09-19T10:02:00Z", false, false)

    private fun <Value> ok(value: Value, pagination: PaginationDto? = null): Response<EnvelopeDto<Value>> = Response.success(EnvelopeDto(value, null, pagination))
    private fun <Value> failed(status: Int, code: String = "SYNTHETIC"): Response<EnvelopeDto<Value>> =
        Response.error(status, """{"error":{"code":"$code","message":"Synthetic $code","details":{}}}""".toResponseBody("application/json".toMediaType()))

    inner class FakeApi : CommunityApi {
        var feedPosts = listOf(post)
        var pageResult: Response<EnvelopeDto<PageDto>>? = null
        var createFailure = 0
        var createCode = "SYNTHETIC"
        var feedFailure = 0
        val keys = mutableListOf<Pair<String, CreatePageDto>>()
        val comments = mutableListOf<CreateCommentDto>()
        val actions = mutableListOf<String>()
        val queries = mutableListOf<String?>()
        val edits = mutableListOf<Pair<String, CreatePostDto>>()
        var editFailure = 0
        private fun list() = PaginationDto(null, false)
        override suspend fun feed(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> = if (feedFailure != 0) failed(feedFailure) else ok(feedPosts, list())
        override suspend fun latest(authorization: String, query: String?, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> { queries += query; return ok(feedPosts, list()) }
        override suspend fun saved(authorization: String, cursor: String?, limit: Int) = ok(feedPosts.filter { it.saved }, list())
        override suspend fun discover(authorization: String, query: String?, topic: String?, cursor: String?, limit: Int) = ok(listOf(page), list())
        override suspend fun myPages(authorization: String) = ok(emptyList<PageDto>())
        override suspend fun page(authorization: String, reference: String) = pageResult ?: ok(page)
        override suspend fun pagePosts(authorization: String, reference: String, cursor: String?, limit: Int) = ok(listOf(post), list())
        override suspend fun drafts(authorization: String, pageId: String) = ok(emptyList<PostDto>())
        override suspend fun createPage(authorization: String, key: String, body: CreatePageDto): Response<EnvelopeDto<PageDto>> {
            keys += key to body
            return if (createFailure != 0) failed(createFailure, createCode) else ok(page.copy(handle = body.handle, name = body.name, canManage = true, etag = "\"v1\""))
        }
        override suspend fun follow(authorization: String, pageId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PageDto>> {
            actions += action
            return ok(page.copy(following = action == "follow", followerCount = if (action == "follow") 1 else 0))
        }
        override suspend fun createPost(authorization: String, pageId: String, key: String, body: CreatePostDto) =
            ok(post.copy(id = commentId, status = "draft", publishedAt = null, canManage = true, etag = "\"d1\""))
        override suspend fun post(authorization: String, postId: String) = ok(post)
        override suspend fun updatePost(authorization: String, postId: String, etag: String, body: CreatePostDto): Response<EnvelopeDto<PostDto>> {
            edits += etag to body
            return if (editFailure != 0) failed(editFailure, "CONTENT_CHANGED")
            else ok(post.copy(title = body.title, body = body.body, editedAt = "2026-09-19T10:05:00Z", canManage = true, etag = "\"v2\""))
        }
        override suspend fun publish(authorization: String, postId: String, etag: String, body: Map<String, String>) = ok(post)
        override suspend fun deletePost(authorization: String, postId: String, etag: String, body: Map<String, String>) = ok(OutcomeDto(postId, "deleted"))
        override suspend fun react(authorization: String, postId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PostDto>> {
            actions += action
            return ok(post.copy(liked = action == "like", likeCount = if (action == "like") 1 else 0, saved = action == "save"))
        }
        override suspend fun comments(authorization: String, postId: String, cursor: String?, limit: Int) = ok(listOf(comment), list())
        override suspend fun comment(authorization: String, postId: String, key: String, body: CreateCommentDto): Response<EnvelopeDto<CommentDto>> {
            comments += body
            return ok(comment.copy(id = pageId, mine = true, canRemove = true, parentId = body.parentId, body = body.body))
        }
        override suspend fun endComment(authorization: String, commentId: String, body: Map<String, String>) = ok(comment.copy(status = "deleted", body = null))
        override suspend fun report(authorization: String, body: CreateReportDto) = ok(ReportDto(pageId, body.targetType, body.targetId, body.reason, "received", "2026-09-19T10:03:00Z"))
        override suspend fun blocks(authorization: String) = ok(emptyList<BlockDto>())
        override suspend fun block(authorization: String, body: CreateBlockDto) = ok(BlockDto(commentId, "page", body.targetId, "River Walkers", "2026-09-19T10:04:00Z"))
        override suspend fun unblock(authorization: String, blockId: String, body: Map<String, String>) = ok(OutcomeDto(blockId, "removed"))
    }

    private val api = FakeApi()
    private val repository = CommunityRepository(api, fixture.accounts)
    private var model: CommunityViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private suspend fun idle(current: CommunityViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(): CommunityViewModel {
        val current = CommunityViewModel(repository); model = current
        current.bind(fixture.accountId); idle(current)
        return current
    }

    @Test fun rejectsInconsistentPublicFacts() {
        for (bad in listOf(page.copy(canManage = true), page.copy(handle = "Bad Handle"), page.copy(topic = "gossip"), page.copy(following = true, blocked = true), page.copy(followerCount = -1))) {
            assertThrows(IdentityFailure::class.java) { repository.page(bad) }
        }
        for (bad in listOf(post.copy(status = "draft"), post.copy(publishedAt = null), post.copy(etag = "\"x\""), post.copy(status = "draft", publishedAt = null, canManage = false), post.copy(editedAt = "2026-09-19T10:05:00Z", status = "draft", publishedAt = null, canManage = true, etag = "\"x\""))) {
            assertThrows(IdentityFailure::class.java) { repository.post(bad) }
        }
        for (bad in listOf(comment.copy(body = null), comment.copy(status = "deleted"), comment.copy(postId = pageId), comment.copy(status = "removed", body = null, canRemove = true), comment.copy(parentId = commentId))) {
            assertThrows(IdentityFailure::class.java) { repository.comment(bad, postId) }
        }
        assertEquals(post, repository.post(post))
    }

    @Test fun unknownPageCreationRetriesTheSameKeyAndBody() = runBlocking {
        val current = ready()
        api.createFailure = 503
        assertTrue(current.createPage("  River-Walkers ", "  River   Walkers ", "hobbies", " Walks "))
        idle(current)
        val pending = current.state.value.pending as CreateIntent.Page
        assertEquals(CreatePageDto("river-walkers", "River Walkers", "Walks", "hobbies"), pending.body)
        assertFalse(current.createPage("other-page", "Other", "local", ""))
        assertEquals(1, api.keys.size)
        api.createFailure = 0
        current.retry(); idle(current)
        assertEquals(2, api.keys.size)
        assertEquals(api.keys[0], api.keys[1])
        assertNull(current.state.value.pending)
        assertEquals(Destination.Page("river-walkers"), current.state.value.destination)
        assertNotNull(current.state.value.notice)
    }

    @Test fun definiteCreationRejectionReleasesTheCommand() = runBlocking {
        val current = ready()
        api.createFailure = 409; api.createCode = "HANDLE_TAKEN"
        current.createPage("river-walkers", "River Walkers", "hobbies", ""); idle(current)
        assertNull(current.state.value.pending)
        assertEquals("Synthetic HANDLE_TAKEN", current.state.value.error)
        assertFalse(current.createPage("Bad Handle", "Name", "hobbies", ""))
        assertEquals(1, api.keys.size)
    }

    @Test fun likeSaveAndFollowShowOnlyConfirmedState() = runBlocking {
        val current = ready()
        current.like(current.state.value.posts.single()); idle(current)
        assertEquals(1, current.state.value.posts.single().likeCount)
        current.save(current.state.value.posts.single()); idle(current)
        assertTrue(current.state.value.posts.single().saved)
        current.open(Destination.Discover); idle(current)
        current.follow(current.state.value.pages.single()); idle(current)
        assertTrue(current.state.value.pages.single().following)
        assertEquals(listOf("like", "save", "follow"), api.actions)
    }

    @Test fun discoverSearchesPublicPostsWithTheSubmittedWords() = runBlocking {
        val current = ready()
        current.search("  river \n walk ", "hobbies"); idle(current)
        assertEquals(Destination.Discover, current.state.value.destination)
        assertEquals(listOf(page), current.state.value.pages)
        assertTrue(api.queries.isEmpty())
        current.searchFor(true); idle(current)
        assertTrue(current.state.value.searchPosts)
        assertEquals(listOf(post), current.state.value.posts)
        assertEquals(listOf<String?>("river walk"), api.queries)
        current.like(current.state.value.posts.single()); idle(current)
        assertEquals(1, current.state.value.posts.single().likeCount)
        current.searchFor(false); idle(current)
        assertFalse(current.state.value.searchPosts)
        assertEquals(listOf(page), current.state.value.pages)
        assertTrue(current.state.value.posts.isEmpty())
        current.open(Destination.Feed(FeedTab.LATEST)); idle(current)
        assertEquals(listOf("river walk", null), api.queries)
    }

    @Test fun postSearchSendsOneNormalizedQuery() = runBlocking {
        val requests = mutableListOf<Request>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            requests += chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(listOf(post), null, PaginationDto(null, false))).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        assertEquals(listOf(post), wire.latest(fixture.accountId, "first", "  river \n walk ").items)
        wire.latest(fixture.accountId, null, "x".repeat(90))
        wire.latest(fixture.accountId, null, "   ")
        wire.latest(fixture.accountId, null)
        assertTrue(requests.all { it.url.encodedPath == "/v1/discover/posts" })
        assertEquals("river walk", requests[0].url.queryParameter("q"))
        assertEquals("first", requests[0].url.queryParameter("cursor"))
        assertEquals("x".repeat(80), requests[1].url.queryParameter("q"))
        assertNull(requests[2].url.queryParameter("q"))
        assertNull(requests[3].url.queryParameter("q"))
    }

    @Test fun postEditSendsTheReviewedVersionAndKeepsTheTextUntilConfirmed() = runBlocking {
        val owned = post.copy(canManage = true, etag = "\"v1\"")
        api.feedPosts = listOf(owned)
        val current = ready()
        current.startEdit(post); assertNull(current.state.value.editingPostId)
        current.startEdit(owned); assertEquals(postId, current.state.value.editingPostId)
        assertFalse(current.editPost(owned, "", "   "))
        assertNotNull(current.state.value.error)
        assertTrue(current.editPost(owned, " Saturday walk ", "Meet at 7 ")); idle(current)
        assertTrue(api.edits.isEmpty())
        assertNull(current.state.value.editingPostId)

        current.startEdit(owned)
        api.editFailure = 412
        assertTrue(current.editPost(owned, "  ", " Meet at 8 ")); idle(current)
        assertEquals(listOf("\"v1\"" to CreatePostDto(null, "Meet at 8")), api.edits)
        assertEquals("Synthetic CONTENT_CHANGED", current.state.value.error)
        assertEquals(postId, current.state.value.editingPostId)
        assertEquals("Meet at 7", current.state.value.posts.single().body)

        api.editFailure = 0
        assertTrue(current.editPost(owned, "  ", " Meet at 8 ")); idle(current)
        assertEquals(2, api.edits.size)
        assertEquals(api.edits[0], api.edits[1])
        val saved = current.state.value.posts.single()
        assertEquals("Meet at 8", saved.body); assertNull(saved.title); assertEquals("\"v2\"", saved.etag)
        assertNull(current.state.value.editingPostId)
        assertNull(current.state.value.error)
    }

    @Test fun postEditWireCarriesIfMatchAndClearsTheTitle() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        var reply = post.copy(title = null, body = "Meet at 8", editedAt = "2026-09-19T10:05:00Z", canManage = true, etag = "\"v2\"")
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(reply, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        val owned = post.copy(canManage = true, etag = "\"v1\"")
        assertEquals(reply, wire.updatePost(fixture.accountId, owned, null, "Meet at 8"))
        assertEquals("PATCH", requests[0].method)
        assertEquals("/v1/posts/$postId", requests[0].url.encodedPath)
        assertEquals("\"v1\"", requests[0].header("If-Match"))
        assertEquals(JsonParser.parseString("""{"title":null,"body":"Meet at 8"}"""), JsonParser.parseString(bodies[0]))
        reply = reply.copy(id = commentId)
        assertThrows(IdentityFailure::class.java) { runBlocking { wire.updatePost(fixture.accountId, owned, null, "Meet at 8") } }
        assertThrows(IdentityFailure::class.java) { runBlocking { wire.updatePost(fixture.accountId, post, null, "Meet at 8") } }
        assertEquals(2, requests.size)
    }

    @Test fun backNavigationReturnsThroughHistory() = runBlocking {
        val current = ready()
        current.open(Destination.Discover); idle(current)
        current.open(Destination.Page("river-walkers")); idle(current)
        assertEquals("River Walkers", current.state.value.page?.name)
        assertTrue(current.back()); idle(current)
        assertEquals(Destination.Discover, current.state.value.destination)
        assertTrue(current.back()); idle(current)
        assertEquals(Destination.Feed(FeedTab.FOLLOWING), current.state.value.destination)
        assertFalse(current.back())
    }

    @Test fun missingPageIsShownAsUnavailable() = runBlocking {
        val current = ready()
        api.pageResult = failed(404, "NOT_FOUND")
        current.open(Destination.Page("missing-page")); idle(current)
        assertTrue(current.state.value.missing)
        assertNull(current.state.value.page)
    }

    @Test fun repliesOnlyAnswerTopLevelComments() = runBlocking {
        val current = ready()
        current.open(Destination.Post(postId)); idle(current)
        assertEquals(listOf(comment), current.state.value.comments)
        assertFalse(current.comment("Deep", comment.copy(parentId = pageId)))
        assertFalse(current.comment("   ", null))
        assertTrue(current.comment("See you", comment)); idle(current)
        assertEquals(listOf(CreateCommentDto("See you", commentId)), api.comments)
        assertNull(current.state.value.pending)
    }

    @Test fun sessionLossRequiresSignIn() = runBlocking {
        val current = ready()
        api.feedFailure = 401
        current.reload(); idle(current)
        assertTrue(current.state.value.requiresSignIn)
        assertTrue(current.state.value.posts.isEmpty())
    }

    @Test fun accountChangeDropsLateFeed() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val delayed = object : CommunityApi by api {
            override suspend fun feed(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> {
                entered.complete(Unit); release.await(); return api.feed(authorization, cursor, limit)
            }
        }
        val current = CommunityViewModel(CommunityRepository(delayed, fixture.accounts)); model = current
        current.bind(fixture.accountId)
        withTimeout(5000) { entered.await() }
        current.bind(null); release.complete(Unit)
        assertEquals(CommunityState(), current.state.value)
    }

    @Test fun largestValidFeedPageDecodesThroughTheResponseLimit() = runBlocking {
        val posts = List(20) { post.copy(id = java.util.UUID.randomUUID().toString(), title = "😀".repeat(120), body = "😀".repeat(5000)) }
        val json = Gson().toJson(EnvelopeDto(posts, null, PaginationDto(null, false)))
        assertTrue(json.toByteArray().size in 65537..524288)
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }.build()
        val page = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts).feed(fixture.accountId, null)
        assertEquals(posts, page.items)
    }

    @Test fun onlyBoundedCommunityListsExceedTheDefaultLimit() {
        fun request(path: String, bytes: Int, method: String = "GET"): Int {
            val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
                okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                    .body("x".repeat(bytes).toResponseBody()).build()
            }.build()
            val body = if (method == "GET") null else "{}".toRequestBody("application/json".toMediaType())
            return http.newCall(Request.Builder().url("https://offline.invalid$path").method(method, body).build()).execute().use { it.body!!.bytes().size }
        }
        for (path in listOf("/v1/feed", "/v1/discover/posts", "/v1/me/saved-posts", "/v1/pages/river-walkers/posts", "/v1/pages/$pageId/posts", "/v1/posts/$postId/comments")) {
            assertEquals(524288, request(path, 524288))
            assertThrows(java.io.IOException::class.java) { request(path, 524289) }
        }
        assertEquals(1572864, request("/v1/pages/$pageId/drafts", 1572864))
        assertThrows(java.io.IOException::class.java) { request("/v1/pages/$pageId/drafts", 1572865) }
        assertEquals(262144, request("/v1/me/blocks", 262144))
        assertThrows(java.io.IOException::class.java) { request("/v1/me/blocks", 262145) }
        for (path in listOf("/v1/posts/$postId", "/v1/pages/river-walkers", "/v1/discover/pages", "/v1/me/pages", "/v1/pages/river-walkers/drafts")) {
            assertThrows(java.io.IOException::class.java) { request(path, 65537) }
        }
        assertThrows(java.io.IOException::class.java) { request("/v1/posts/$postId/comments", 65537, "POST") }
    }

    @Test fun wireCarriesKeysPreconditionsAndStrictBodies() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            val path = request.url.encodedPath
            val payload: Any = when {
                path == "/v1/pages" -> EnvelopeDto(page.copy(canManage = true, etag = "\"v1\""), null)
                path.endsWith("/follow") -> EnvelopeDto(page.copy(following = true), null)
                else -> EnvelopeDto(post, null)
            }
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(payload).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        val key = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
        wire.create(CreateIntent.Page(fixture.accountId, key, CreatePageDto("river-walkers", "River Walkers", "", "hobbies")))
        assertEquals(key, requests[0].header("Idempotency-Key"))
        assertEquals(setOf("handle", "name", "description", "topic"), JsonParser.parseString(bodies[0]).asJsonObject.keySet())
        wire.follow(fixture.accountId, pageId, true)
        assertEquals("/v1/pages/$pageId/follow", requests[1].url.encodedPath)
        assertEquals("{}", bodies[1])
        wire.publish(fixture.accountId, post.copy(canManage = true, etag = "\"d2\"").let { it })
        assertEquals("\"d2\"", requests[2].header("If-Match"))
        assertEquals("POST", requests[2].method)
    }
}
