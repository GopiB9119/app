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
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
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
import java.io.IOException
import java.util.Collections

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val commentId = "5f2b5d20-7e7d-4c60-9c73-2e6b5b4d3c03"
    private val page = PageDto(pageId, "river-walkers", "River Walkers", "Weekend walks", "hobbies", 0, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", false, false, false, null)
    private val post = PostDto(postId, pageId, "river-walkers", "River Walkers", "Saturday walk", "Meet at 7", "published", 0, 0, "2026-09-19T10:00:00Z", "2026-09-19T10:01:00Z", null, false, false, false, null)
    private val comment = CommentDto(commentId, postId, null, "Sam", "Count me in", "visible", "2026-09-19T10:02:00Z", false, false)
    private val otherPageId = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c09"
    private val otherCommentId = "6a3c6e31-8f8e-4d71-8d84-3f7c6c5e4d05"
    private val reportId = "9d6f9b64-bc1b-4a04-b017-6caf9f8b7a08"
    private val pageBlockId = "7b4d7f42-9a9f-4e82-9e95-4a8d7d6f5e06"
    private val personBlockId = "8c5e8a53-ab0a-4f93-af06-5b9e8e7a6f07"
    private val draftId = "2b3c4d5e-6f70-4b1c-9d2e-4f5a6b7c8d10"
    private val stamp = "2026-09-19T10:04:00Z"
    private val otherComment = comment.copy(id = otherCommentId, authorName = "Kim", body = "Bring water")
    private val pageBlock = BlockDto(pageBlockId, "page", pageId, "River Walkers", stamp)
    private val personBlock = BlockDto(personBlockId, "account", null, "Sam", stamp)
    private val reported = "Report received. It is stored for review; the person reported is not told who sent it."

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
        val edits = mutableListOf<Pair<String, Map<String, String?>>>()
        var editFailure = 0
        private fun list() = PaginationDto(null, false)
        override suspend fun feed(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> = if (feedFailure != 0) failed(feedFailure) else ok(feedPosts, list())
        override suspend fun latest(authorization: String, query: String?, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> { queries += query; return ok(feedPosts, list()) }
        override suspend fun saved(authorization: String, cursor: String?, limit: Int) = ok(feedPosts.filter { it.saved }, list())
        override suspend fun discover(authorization: String, query: String?, topic: String?, cursor: String?, limit: Int) = ok(listOf(page), list())
        override suspend fun myPages(authorization: String) = ok(emptyList<PageDto>())
        override suspend fun following(authorization: String, cursor: String?, limit: Int) = ok(emptyList<PageDto>(), list())
        override suspend fun page(authorization: String, reference: String) = pageResult ?: ok(page)
        override suspend fun updatePage(authorization: String, pageId: String, etag: String, body: Map<String, String>) = ok(page.copy(canManage = true, etag = "\"p2\""))
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
        override suspend fun updatePost(authorization: String, postId: String, etag: String, body: Map<String, String?>): Response<EnvelopeDto<PostDto>> {
            edits += etag to body
            return if (editFailure != 0) failed(editFailure, "CONTENT_CHANGED")
            else ok(post.copy(title = if ("title" in body) body["title"] else post.title, body = body["body"] ?: post.body, editedAt = "2026-09-19T10:05:00Z", canManage = true, etag = "\"v2\""))
        }
        override suspend fun publish(authorization: String, postId: String, etag: String, body: Map<String, String>) = ok(post)
        override suspend fun deletePost(authorization: String, postId: String, etag: String, body: Map<String, String>) = ok(OutcomeDto(postId, "deleted"))
        override suspend fun react(authorization: String, postId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PostDto>> {
            actions += action
            return ok(post.copy(liked = action == "like", likeCount = if (action == "like") 1 else 0, saved = action == "save"))
        }
        override suspend fun pinnedPosts(authorization: String, reference: String) = ok(emptyList<PostDto>())
        override suspend fun pin(authorization: String, postId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PostDto>> {
            actions += action
            return ok(post.copy(pinned = action == "pin"))
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

    /** A server for reports and blocks. It records every call, can refuse a command or lose its answer, and alone decides what a block hides. */
    inner class SafetyApi : CommunityApi by api {
        val calls: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val sessions: MutableSet<String> = Collections.synchronizedSet(mutableSetOf())
        val reports: MutableList<CreateReportDto> = Collections.synchronizedList(mutableListOf())
        val blocking: MutableList<CreateBlockDto> = Collections.synchronizedList(mutableListOf())
        val removals: MutableList<Pair<String, Map<String, String>>> = Collections.synchronizedList(mutableListOf())
        var blocks = listOf<BlockDto>()
        var gone = setOf<String>()
        var failure = 0
        var failureCode = "SYNTHETIC"
        var lost = false
        var gate: CompletableDeferred<Unit>? = null
        val entered = CompletableDeferred<Unit>()
        var reportAnswer: ((CreateReportDto) -> ReportDto)? = null
        var blockAnswer: ((CreateBlockDto) -> BlockDto)? = null
        var removalAnswer: ((String) -> OutcomeDto)? = null
        private val pageBlocked get() = blocks.any { it.pageId == pageId }
        private val hiddenAuthors get() = blocks.filter { it.targetType == "account" }.map { it.label }
        private fun read(call: String, authorization: String) { calls += call; sessions += authorization }

        /** A lost answer is lost after the server applied the command, as when the connection drops on the way back. */
        private suspend fun <Value> command(call: String, authorization: String, missing: Boolean, apply: () -> Value): Response<EnvelopeDto<Value>> {
            read(call, authorization)
            gate?.let { entered.complete(Unit); it.await() }
            if (failure != 0) return failed(failure, failureCode)
            if (missing) return failed(404, "NOT_FOUND")
            val value = apply()
            if (lost) throw IOException("Synthetic lost answer")
            return ok(value)
        }

        override suspend fun page(authorization: String, reference: String): Response<EnvelopeDto<PageDto>> {
            read("GET /v1/pages/$reference", authorization)
            return if (pageId in gone) failed(404, "NOT_FOUND") else ok(page.copy(blocked = pageBlocked))
        }
        override suspend fun pagePosts(authorization: String, reference: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> {
            read("GET /v1/pages/$reference/posts", authorization)
            return ok(if (pageBlocked) emptyList() else listOf(post), PaginationDto(null, false))
        }
        override suspend fun post(authorization: String, postId: String): Response<EnvelopeDto<PostDto>> {
            read("GET /v1/posts/$postId", authorization)
            return if (postId in gone) failed(404, "NOT_FOUND") else ok(post)
        }
        override suspend fun comments(authorization: String, postId: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<CommentDto>>> {
            read("GET /v1/posts/$postId/comments", authorization)
            return ok(listOf(comment, otherComment).filter { it.id !in gone && it.authorName !in hiddenAuthors }, PaginationDto(null, false))
        }
        override suspend fun blocks(authorization: String): Response<EnvelopeDto<List<BlockDto>>> {
            read("GET /v1/me/blocks", authorization)
            return ok(blocks)
        }
        override suspend fun report(authorization: String, body: CreateReportDto): Response<EnvelopeDto<ReportDto>> {
            reports += body
            return command("POST /v1/reports", authorization, body.targetId in gone) {
                reportAnswer?.invoke(body) ?: ReportDto(reportId, body.targetType, body.targetId, body.reason, "received", stamp)
            }
        }
        override suspend fun block(authorization: String, body: CreateBlockDto): Response<EnvelopeDto<BlockDto>> {
            blocking += body
            return command("POST /v1/blocks", authorization, body.targetId in gone) {
                blockAnswer?.invoke(body) ?: (if (body.targetType == "page") pageBlock else personBlock).let { made ->
                    blocks.firstOrNull { it.id == made.id } ?: made.also { blocks = listOf(it) + blocks }
                }
            }
        }
        override suspend fun unblock(authorization: String, blockId: String, body: Map<String, String>): Response<EnvelopeDto<OutcomeDto>> {
            removals += blockId to body
            return command("POST /v1/blocks/$blockId/remove", authorization, removalAnswer == null && blocks.none { it.id == blockId }) {
                removalAnswer?.invoke(blockId) ?: OutcomeDto(blockId, "removed").also { blocks = blocks.filterNot { it.id == blockId } }
            }
        }
    }

    /** A server for the pages a person owns and follows. It records every call, pages the followed list by the limit it is sent, and can refuse a load or a command, lose an answer, or hold the list open. */
    inner class FollowApi : CommunityApi by api {
        val calls: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val sessions: MutableSet<String> = Collections.synchronizedSet(mutableSetOf())
        val bodies: MutableList<Map<String, String>> = Collections.synchronizedList(mutableListOf())
        private val known = mutableMapOf<String, PageDto>()
        var owned = listOf<PageDto>()
        var followed = listOf<PageDto>()
            set(value) { field = value; value.forEach { known[it.id] = it } }
        var ownedFailure = 0
        var listFailure = 0
        var failure = 0
        var gone = setOf<String>()
        var lost = false
        var answer: ((PageDto) -> PageDto)? = null
        var gate: CompletableDeferred<Unit>? = null
        val entered = CompletableDeferred<Unit>()

        override suspend fun myPages(authorization: String): Response<EnvelopeDto<List<PageDto>>> {
            calls += "GET /v1/me/pages"; sessions += authorization
            return if (ownedFailure != 0) failed(ownedFailure, "UNAVAILABLE") else ok(owned)
        }
        override suspend fun following(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PageDto>>> {
            calls += "GET /v1/me/following?limit=$limit" + if (cursor == null) "" else "&cursor=$cursor"
            sessions += authorization
            gate?.let { entered.complete(Unit); it.await() }
            if (listFailure != 0) return failed(listFailure, "UNAVAILABLE")
            val start = cursor?.removePrefix("after-")?.toInt() ?: 0
            val end = minOf(start + limit, followed.size)
            val next = if (end < followed.size) "after-$end" else null
            return ok(followed.subList(start, end), PaginationDto(next, next != null))
        }
        /** A lost answer is lost after the server applied the change. */
        override suspend fun follow(authorization: String, pageId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PageDto>> {
            calls += "POST /v1/pages/$pageId/$action"; sessions += authorization; bodies += body
            if (failure != 0) return failed(failure, "UNAVAILABLE")
            if (pageId in gone) return failed(404, "NOT_FOUND")
            val target = known.getValue(pageId)
            followed = followed.filterNot { it.id == pageId } + listOfNotNull(target.copy(following = true).takeIf { action == "follow" })
            if (lost) throw IOException("Synthetic lost answer")
            val result = target.copy(following = action == "follow")
            return ok(answer?.invoke(result) ?: result)
        }
    }

    /** A server for one page the person owns. It keeps the current version, refuses an edit against any other version with 412, and can refuse an edit or lose its answer after applying it. */
    inner class PageEditApi : CommunityApi by api {
        var current = page.copy(canManage = true, etag = "\"p1\"")
        val edits: MutableList<Pair<String, Map<String, String>>> = Collections.synchronizedList(mutableListOf())
        var failure = 0
        var failureCode = "SYNTHETIC"
        var gone = false
        var lost = false
        var gate: CompletableDeferred<Unit>? = null
        val entered = CompletableDeferred<Unit>()
        private var version = 1

        /** Applies a change as the server does and gives the page a new version, as when the owner edits it on another device. */
        fun change(fields: Map<String, String>) {
            version += 1
            current = current.copy(name = fields["name"] ?: current.name, description = fields["description"] ?: current.description,
                topic = fields["topic"] ?: current.topic, rules = fields["rules"] ?: current.rules, updatedAt = "2026-09-19T10:0$version:00Z", etag = "\"p$version\"")
        }
        override suspend fun page(authorization: String, reference: String): Response<EnvelopeDto<PageDto>> {
            gate?.let { entered.complete(Unit); it.await() }
            return if (gone) failed(404, "NOT_FOUND") else ok(current)
        }
        override suspend fun updatePage(authorization: String, pageId: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<PageDto>> {
            edits += etag to body
            if (failure != 0) return failed(failure, failureCode)
            if (gone || pageId != current.id) return failed(404, "NOT_FOUND")
            if (etag != current.etag) return failed(412, "CONTENT_CHANGED")
            change(body)
            if (lost) throw IOException("Synthetic lost answer")
            return ok(current)
        }
    }

    /** A server for one published post on a page the person owns. It keeps the current version, refuses an edit against any other version with 412, and can hold an edit open, refuse it, or lose its answer after applying it. */
    inner class PostEditApi : CommunityApi by api {
        var current = post.copy(canManage = true, etag = "\"v1\"")
        val edits: MutableList<Pair<String, Map<String, String?>>> = Collections.synchronizedList(mutableListOf())
        var failure = 0
        var lost = false
        var gate: CompletableDeferred<Unit>? = null
        val entered = CompletableDeferred<Unit>()
        private var version = 1

        /** Applies a change as the server does and gives the post a new version, as when the owner edits it on another device. */
        fun change(fields: Map<String, String?>) {
            version += 1
            current = current.copy(title = if ("title" in fields) fields["title"] else current.title, body = fields["body"] ?: current.body,
                editedAt = "2026-09-19T10:0$version:00Z", etag = "\"v$version\"")
        }
        override suspend fun page(authorization: String, reference: String): Response<EnvelopeDto<PageDto>> = ok(page.copy(canManage = true, etag = "\"p1\""))
        override suspend fun pagePosts(authorization: String, reference: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> =
            ok(listOf(current), PaginationDto(null, false))
        override suspend fun updatePost(authorization: String, postId: String, etag: String, body: Map<String, String?>): Response<EnvelopeDto<PostDto>> =
            edit(postId, etag, body)
        private suspend fun edit(postId: String, etag: String, fields: Map<String, String?>): Response<EnvelopeDto<PostDto>> {
            edits += etag to fields
            gate?.let { entered.complete(Unit); it.await() }
            if (failure != 0) return failed(failure, "UNAVAILABLE")
            if (postId != current.id) return failed(404, "NOT_FOUND")
            if (etag != current.etag) return failed(412, "CONTENT_CHANGED")
            change(fields)
            if (lost) throw IOException("Synthetic lost answer")
            return ok(current)
        }
    }

    private fun followedPage(index: Int) = page.copy(
        id = java.util.UUID.nameUUIDFromBytes("followed-$index".toByteArray()).toString(), handle = "walkers-$index", name = "Walkers $index", followerCount = 1, following = true,
    )

    private val api = FakeApi()
    private val repository = CommunityRepository(api, fixture.accounts)
    private var model: CommunityViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private suspend fun idle(current: CommunityViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(source: CommunityRepository = repository): CommunityViewModel {
        val current = CommunityViewModel(source); model = current
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
        assertEquals(listOf("\"v1\"" to mapOf<String, String?>("title" to null, "body" to "Meet at 8")), api.edits)
        assertEquals("This post changed since you opened it. Reload to review the current version.", current.state.value.error)
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

    @Test fun postEditSavesAgainstTheVersionItOpenedWithSoANewerVersionIsRefusedNotOverwritten() = runBlocking {
        val server = PostEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        val opened = current.state.value.posts.single()
        assertEquals("\"v1\"", opened.etag)
        current.startEdit(opened)
        // The owner changes the text on another device, and this screen refreshes while the editor stays open.
        server.change(mapOf("body" to "Meet at 9"))
        current.reload(); idle(current)
        val refreshed = current.state.value.posts.single()
        assertEquals("\"v2\"", refreshed.etag)
        assertEquals(postId, current.state.value.editingPostId)

        // The person changed only the title; the screen hands over the post it shows now, as Save does.
        assertTrue(current.editPost(refreshed, "Sunday walk", "Meet at 7")); idle(current)
        assertEquals(listOf("\"v1\"" to mapOf<String, String?>("title" to "Sunday walk")), server.edits)
        val state = current.state.value
        assertEquals("This post changed since you opened it. Reload to review the current version.", state.error)
        assertNull(state.notice)
        assertFalse(state.missing)
        assertEquals(postId, state.editingPostId)
        assertEquals(refreshed, state.posts.single())
        assertEquals(Triple("Saturday walk", "Meet at 9", "\"v2\""), server.current.let { Triple(it.title, it.body, it.etag) })
    }

    @Test fun postEditSendsOnlyTheFieldsThatDifferFromTheOpenedPost() = runBlocking {
        val server = PostEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        current.startEdit(current.state.value.posts.single())
        assertTrue(current.editPost(current.state.value.posts.single(), " Saturday walk ", " Meet at 8 ")); idle(current)
        current.startEdit(current.state.value.posts.single())
        assertTrue(current.editPost(current.state.value.posts.single(), "  ", "Meet at 8")); idle(current)
        assertEquals(listOf("\"v1\"" to mapOf<String, String?>("body" to "Meet at 8"), "\"v2\"" to mapOf<String, String?>("title" to null)), server.edits)
        val saved = current.state.value.posts.single()
        assertEquals(Triple(null, "Meet at 8", "\"v3\""), Triple(saved.title, saved.body, saved.etag))
        assertNull(current.state.value.editingPostId)
    }

    @Test fun anUnchangedPostSendsNothingEvenAfterARefreshShowsANewerVersion() = runBlocking {
        val server = PostEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        current.startEdit(current.state.value.posts.single())
        // Spaces the server would remove are not a change.
        assertTrue(current.editPost(current.state.value.posts.single(), " Saturday walk ", "Meet at 7\n")); idle(current)
        assertNull(current.state.value.editingPostId)

        current.startEdit(current.state.value.posts.single())
        server.change(mapOf("title" to "Sunday walk", "body" to "Meet at 9"))
        current.reload(); idle(current)
        // The person kept the text the editor opened with, so Save sends nothing and cannot undo the newer version.
        assertTrue(current.editPost(current.state.value.posts.single(), "Saturday walk", "Meet at 7")); idle(current)
        assertTrue(server.edits.isEmpty())
        assertNull(current.state.value.editingPostId)
        assertNull(current.state.value.error)
        assertEquals(Triple("Sunday walk", "Meet at 9", "\"v2\""), server.current.let { Triple(it.title, it.body, it.etag) })
    }

    @Test fun aPostEditShowsAsSavedOnlyAfterTheServerConfirmsIt() = runBlocking {
        val server = PostEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        val shown = current.state.value.posts.single()
        current.startEdit(shown)
        fun unconfirmed(message: String?) {
            val state = current.state.value
            assertEquals(message, state.error)
            assertNull(state.notice)
            assertFalse(state.missing)
            assertEquals(postId, state.editingPostId)
            assertEquals(shown, state.posts.single())
        }
        server.failure = 503
        assertTrue(current.editPost(shown, "Saturday walk", "Meet at 8")); idle(current)
        unconfirmed("Synthetic UNAVAILABLE")

        server.failure = 0
        val gate = CompletableDeferred<Unit>(); server.gate = gate
        assertTrue(current.editPost(shown, "Saturday walk", "Meet at 8"))
        withTimeout(5000) { server.entered.await() }
        assertTrue(current.state.value.working)
        unconfirmed(null)
        // The answer is lost after the server applied the change.
        server.lost = true; server.gate = null; gate.complete(Unit); idle(current)
        unconfirmed("No connection. Nothing new is confirmed.")
        assertEquals("Meet at 8" to "\"v2\"", server.current.let { it.body to it.etag })

        // Trying again still offers the version the editor opened with, so the server refuses it instead of applying it twice.
        server.lost = false
        assertTrue(current.editPost(shown, "Saturday walk", "Meet at 8")); idle(current)
        unconfirmed("This post changed since you opened it. Reload to review the current version.")
        assertEquals(List(3) { "\"v1\"" to mapOf<String, String?>("body" to "Meet at 8") }, server.edits)

        // Closing the editor and editing the reloaded post saves, and only then does the screen show the server's answer.
        current.cancelEdit(); current.reload(); idle(current)
        val latest = current.state.value.posts.single()
        assertEquals("\"v2\"", latest.etag)
        current.startEdit(latest)
        assertTrue(current.editPost(latest, "Saturday walk", "Meet at 8 by the bridge")); idle(current)
        val state = current.state.value
        assertEquals("Changes saved.", state.notice)
        assertNull(state.error)
        assertNull(state.editingPostId)
        assertEquals(server.current, state.posts.single())
        assertEquals("\"v3\"", state.posts.single().etag)
    }

    @Test fun postEditWireSendsOnlyTheChangedFields() = runBlocking {
        val bodies = mutableListOf<String>()
        val opened = post.copy(canManage = true, etag = "\"v1\"")
        var reply = opened.copy(body = "Meet at 8", editedAt = "2026-09-19T10:05:00Z", etag = "\"v2\"")
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request()
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(reply, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        assertEquals(reply, wire.updatePost(fixture.accountId, opened, "Saturday walk", "Meet at 8"))
        reply = opened.copy(title = null, editedAt = "2026-09-19T10:05:00Z", etag = "\"v2\"")
        assertEquals(reply, wire.updatePost(fixture.accountId, opened, null, "Meet at 7"))
        assertEquals(listOf("""{"body":"Meet at 8"}""", """{"title":null}""").map(JsonParser::parseString), bodies.map(JsonParser::parseString))
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
        // Page lists joined the larger limit with T83: twenty pages with 2,000 characters of rules each can exceed 64 KiB.
        for (path in listOf("/v1/feed", "/v1/discover/posts", "/v1/me/saved-posts", "/v1/pages/river-walkers/posts", "/v1/pages/$pageId/posts", "/v1/posts/$postId/comments",
            "/v1/pages/river-walkers/pinned-posts", "/v1/pages/$pageId/pinned-posts", "/v1/discover/pages", "/v1/me/following")) {
            assertEquals(524288, request(path, 524288))
            assertThrows(java.io.IOException::class.java) { request(path, 524289) }
        }
        assertEquals(1572864, request("/v1/pages/$pageId/drafts", 1572864))
        assertThrows(java.io.IOException::class.java) { request("/v1/pages/$pageId/drafts", 1572865) }
        assertEquals(262144, request("/v1/me/blocks", 262144))
        assertThrows(java.io.IOException::class.java) { request("/v1/me/blocks", 262145) }
        for (path in listOf("/v1/posts/$postId", "/v1/pages/river-walkers", "/v1/me/pages", "/v1/pages/river-walkers/drafts")) {
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

    @Test fun reportsAndBlocksSendOnlyTheChosenTargetToTheirRoutesWithTheSession() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            val sent = bodies.last().takeIf { it.isNotEmpty() }?.let { JsonParser.parseString(it).asJsonObject }
            val path = request.url.encodedPath
            val payload: Any = when (path) {
                "/v1/reports" -> EnvelopeDto(ReportDto(reportId, sent!!.get("target_type").asString, sent.get("target_id").asString, sent.get("reason").asString, "received", stamp), null)
                "/v1/blocks" -> EnvelopeDto(if (sent!!.get("target_type").asString == "page") pageBlock else personBlock, null)
                "/v1/me/blocks" -> EnvelopeDto(listOf(pageBlock, personBlock), null)
                else -> EnvelopeDto(OutcomeDto(personBlockId, "removed"), null)
            }
            val created = request.method == "POST" && (path == "/v1/reports" || path == "/v1/blocks")
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(if (created) 201 else 200).message(if (created) "Created" else "OK")
                .body(Gson().toJson(payload).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        wire.report(fixture.accountId, "page", pageId, "spam", "")
        wire.report(fixture.accountId, "post", postId, "misinformation", "Wrong date")
        wire.report(fixture.accountId, "comment", commentId, "harassment", "Line one\nLine two")
        assertEquals(listOf(pageBlock, personBlock), wire.blocks(fixture.accountId))
        assertEquals(pageBlock, wire.block(fixture.accountId, "page", pageId))
        assertEquals(personBlock, wire.block(fixture.accountId, "comment_author", commentId))
        assertEquals(OutcomeDto(personBlockId, "removed"), wire.unblock(fixture.accountId, personBlockId))
        val expected = listOf(
            Triple("POST", "/v1/reports", """{"target_type":"page","target_id":"$pageId","reason":"spam","details":""}"""),
            Triple("POST", "/v1/reports", """{"target_type":"post","target_id":"$postId","reason":"misinformation","details":"Wrong date"}"""),
            Triple("POST", "/v1/reports", """{"target_type":"comment","target_id":"$commentId","reason":"harassment","details":"Line one\nLine two"}"""),
            Triple("GET", "/v1/me/blocks", ""),
            Triple("POST", "/v1/blocks", """{"target_type":"page","target_id":"$pageId"}"""),
            Triple("POST", "/v1/blocks", """{"target_type":"comment_author","target_id":"$commentId"}"""),
            Triple("POST", "/v1/blocks/$personBlockId/remove", "{}"),
        )
        assertEquals(expected.size, requests.size)
        for ((index, request) in requests.withIndex()) {
            val (method, path, body) = expected[index]
            assertEquals(method, request.method)
            assertEquals(path, request.url.encodedPath)
            assertNull(request.url.encodedQuery)
            assertEquals("Bearer ${fixture.token}", request.header("Authorization"))
            assertNull(request.header("Idempotency-Key"))
            assertNull(request.header("If-Match"))
            if (body.isEmpty()) assertEquals("", bodies[index]) else assertEquals(JsonParser.parseString(body), JsonParser.parseString(bodies[index]))
        }
    }

    @Test fun reportNoticeAppearsOnlyAfterTheServerConfirmsTheChosenFacts() = runBlocking {
        val safety = SafetyApi()
        val current = ready(CommunityRepository(safety, fixture.accounts))
        current.open(Destination.Post(postId)); idle(current)
        val mark = safety.calls.size
        val chosen = CreateReportDto("comment", commentId, "harassment", "Rude reply")

        val gate = CompletableDeferred<Unit>(); safety.gate = gate
        current.report("comment", commentId, "harassment", "  Rude reply \n")
        withTimeout(5000) { safety.entered.await() }
        assertTrue(current.state.value.working)
        assertNull(current.state.value.notice)
        gate.complete(Unit); idle(current)
        assertEquals(reported, current.state.value.notice)
        assertNull(current.state.value.error)

        fun unconfirmed(message: String) {
            assertEquals(message, current.state.value.error)
            assertNull(current.state.value.notice)
            assertFalse(current.state.value.missing)
        }
        safety.failure = 429; safety.failureCode = "REPORT_RATE_LIMITED"
        current.report("comment", commentId, "harassment", "  Rude reply \n"); idle(current)
        unconfirmed("Synthetic REPORT_RATE_LIMITED")
        safety.failure = 0; safety.lost = true
        current.report("comment", commentId, "harassment", "  Rude reply \n"); idle(current)
        unconfirmed("No connection. Nothing new is confirmed.")
        safety.lost = false; safety.reportAnswer = { ReportDto(reportId, it.targetType, otherCommentId, it.reason, "received", stamp) }
        current.report("comment", commentId, "harassment", "  Rude reply \n"); idle(current)
        unconfirmed("The service returned an unexpected community response.")

        safety.reportAnswer = null
        current.report("post", postId, "misinformation", ""); idle(current)
        assertEquals(reported, current.state.value.notice)
        current.report("page", pageId, "spam", "Same link\nin every post"); idle(current)
        assertEquals(reported, current.state.value.notice)
        assertNull(current.state.value.error)
        assertEquals(List(4) { chosen } + CreateReportDto("post", postId, "misinformation", "") + CreateReportDto("page", pageId, "spam", "Same link\nin every post"), safety.reports)
        assertEquals(List(6) { "POST /v1/reports" }, safety.calls.drop(mark))
        assertEquals(setOf("Bearer ${fixture.token}"), safety.sessions)
        assertEquals(listOf(comment, otherComment), current.state.value.comments)
    }

    @Test fun blockingAPageIsConfirmedByTheServerWhichThenDecidesWhatIsHidden() = runBlocking {
        val safety = SafetyApi()
        val current = ready(CommunityRepository(safety, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        val shown = current.state.value.page!!
        fun unconfirmed(message: String) {
            val state = current.state.value
            assertEquals(message, state.error)
            assertNull(state.notice)
            assertFalse(state.missing)
            assertFalse(state.page!!.blocked)
            assertEquals(listOf(post), state.posts)
            assertTrue(state.blocks.isEmpty())
        }
        assertFalse(shown.blocked)
        assertEquals(listOf(post), current.state.value.posts)

        safety.failure = 409; safety.failureCode = "BLOCK_LIMIT_REACHED"
        current.blockPage(shown); idle(current)
        unconfirmed("Synthetic BLOCK_LIMIT_REACHED")
        safety.failure = 0; safety.blockAnswer = { pageBlock.copy(pageId = otherPageId) }
        current.blockPage(shown); idle(current)
        unconfirmed("The block could not be confirmed.")
        safety.blockAnswer = null; safety.lost = true
        val gate = CompletableDeferred<Unit>(); safety.gate = gate
        current.blockPage(shown)
        withTimeout(5000) { safety.entered.await() }
        assertTrue(current.state.value.working)
        assertNull(current.state.value.notice)
        gate.complete(Unit); idle(current)
        unconfirmed("No connection. Nothing new is confirmed.")

        safety.lost = false
        val mark = safety.calls.size
        current.blockPage(shown); idle(current)
        val state = current.state.value
        assertEquals("Page blocked. Its posts are hidden from you.", state.notice)
        assertNull(state.error)
        assertEquals(listOf("POST /v1/blocks", "GET /v1/pages/river-walkers", "GET /v1/me/blocks"), safety.calls.drop(mark))
        assertTrue(state.page!!.blocked)
        assertTrue(state.posts.isEmpty())
        assertEquals(listOf(pageBlock), state.blocks)
        assertEquals(List(4) { CreateBlockDto("page", pageId) }, safety.blocking)
        assertEquals(setOf("Bearer ${fixture.token}"), safety.sessions)
    }

    @Test fun blockingACommentAuthorIsConfirmedByTheServerWhichThenDecidesWhatIsHidden() = runBlocking {
        val safety = SafetyApi()
        val current = ready(CommunityRepository(safety, fixture.accounts))
        current.open(Destination.Post(postId)); idle(current)
        assertEquals(listOf(comment, otherComment), current.state.value.comments)
        fun unconfirmed(message: String) {
            assertEquals(message, current.state.value.error)
            assertNull(current.state.value.notice)
            assertFalse(current.state.value.missing)
            assertEquals(listOf(comment, otherComment), current.state.value.comments)
        }
        safety.failure = 409; safety.failureCode = "BLOCK_LIMIT_REACHED"
        current.blockAuthor(comment); idle(current)
        unconfirmed("Synthetic BLOCK_LIMIT_REACHED")
        safety.failure = 0; safety.lost = true
        current.blockAuthor(comment); idle(current)
        unconfirmed("No connection. Nothing new is confirmed.")
        safety.lost = false; safety.blockAnswer = { pageBlock }
        current.blockAuthor(comment); idle(current)
        unconfirmed("The block could not be confirmed.")

        safety.blockAnswer = null
        val mark = safety.calls.size
        current.blockAuthor(comment); idle(current)
        assertEquals("Person blocked. Their comments are hidden from you.", current.state.value.notice)
        assertNull(current.state.value.error)
        assertEquals(listOf("POST /v1/blocks", "GET /v1/posts/$postId", "GET /v1/posts/$postId/comments"), safety.calls.drop(mark))
        assertEquals(listOf(otherComment), current.state.value.comments)
        assertEquals(List(4) { CreateBlockDto("comment_author", commentId) }, safety.blocking)
        assertEquals(setOf("Bearer ${fixture.token}"), safety.sessions)
    }

    @Test fun unblockingIsConfirmedByTheServerAndReloadsWhatItShows() = runBlocking {
        val safety = SafetyApi()
        safety.blocks = listOf(pageBlock, personBlock)
        val current = ready(CommunityRepository(safety, fixture.accounts))
        current.open(Destination.Blocked); idle(current)
        assertEquals(listOf(pageBlock, personBlock), current.state.value.blocks)
        fun unconfirmed(message: String) {
            assertEquals(message, current.state.value.error)
            assertNull(current.state.value.notice)
            assertEquals(listOf(pageBlock, personBlock), current.state.value.blocks)
        }
        safety.failure = 503; safety.failureCode = "UNAVAILABLE"
        current.unblock(personBlock); idle(current)
        unconfirmed("Synthetic UNAVAILABLE")
        safety.failure = 0; safety.removalAnswer = { OutcomeDto(pageBlockId, "removed") }
        current.unblock(personBlock); idle(current)
        unconfirmed("The service returned an unexpected community response.")
        safety.removalAnswer = null; safety.lost = true
        current.unblock(personBlock); idle(current)
        unconfirmed("No connection. Nothing new is confirmed.")

        safety.lost = false
        var mark = safety.calls.size
        current.unblock(pageBlock); idle(current)
        assertEquals("Unblocked.", current.state.value.notice)
        assertNull(current.state.value.error)
        assertEquals(listOf("POST /v1/blocks/$pageBlockId/remove", "GET /v1/me/blocks"), safety.calls.drop(mark))
        // The server's list, which also lacks the person block whose earlier answer was lost.
        assertTrue(current.state.value.blocks.isEmpty())

        safety.blocks = listOf(pageBlock)
        current.open(Destination.Page("river-walkers")); idle(current)
        assertTrue(current.state.value.page!!.blocked)
        assertTrue(current.state.value.posts.isEmpty())
        mark = safety.calls.size
        current.unblock(current.state.value.blocks.single()); idle(current)
        assertEquals("Unblocked.", current.state.value.notice)
        assertEquals(listOf("POST /v1/blocks/$pageBlockId/remove", "GET /v1/pages/river-walkers", "GET /v1/pages/$pageId/posts"), safety.calls.drop(mark))
        assertFalse(current.state.value.page!!.blocked)
        assertEquals(listOf(post), current.state.value.posts)
        assertEquals(List(3) { personBlockId to emptyMap<String, String>() } + List(2) { pageBlockId to emptyMap<String, String>() }, safety.removals)
        assertEquals(setOf("Bearer ${fixture.token}"), safety.sessions)
    }

    @Test fun reportAndBlockAnswersThatDoNotMatchTheRequestAreRefused() = runBlocking {
        val safety = SafetyApi()
        val source = CommunityRepository(safety, fixture.accounts)
        fun refused(action: suspend () -> Any) =
            assertEquals("INVALID_RESPONSE", assertThrows(IdentityFailure::class.java) { runBlocking { action() } }.code)
        for (answer in listOf<(CreateReportDto) -> ReportDto>(
            { ReportDto(reportId, it.targetType, otherCommentId, it.reason, "received", stamp) },
            { ReportDto(reportId, "post", it.targetId, it.reason, "received", stamp) },
            { ReportDto(reportId, it.targetType, it.targetId, it.reason, "open", stamp) },
        )) {
            safety.reportAnswer = answer
            refused { source.report(fixture.accountId, "comment", commentId, "spam", "") }
        }
        for (status in listOf("received", "reviewing", "closed")) {
            safety.reportAnswer = { ReportDto(reportId, it.targetType, it.targetId, it.reason, status, stamp) }
            assertEquals(status, source.report(fixture.accountId, "comment", commentId, "spam", "").status)
        }
        val sent = safety.calls.size
        assertThrows(IllegalArgumentException::class.java) { runBlocking { source.report(fixture.accountId, "comment", commentId, "rude", "") } }
        assertEquals(sent, safety.calls.size)

        safety.blockAnswer = { pageBlock.copy(pageId = otherPageId) }
        refused { source.block(fixture.accountId, "page", pageId) }
        safety.blockAnswer = { personBlock }
        refused { source.block(fixture.accountId, "page", pageId) }
        safety.blockAnswer = { pageBlock }
        refused { source.block(fixture.accountId, "comment_author", commentId) }
        safety.blockAnswer = null
        assertEquals(pageBlock, source.block(fixture.accountId, "page", pageId))
        assertEquals(personBlock, source.block(fixture.accountId, "comment_author", commentId))

        safety.removalAnswer = { OutcomeDto(pageBlockId, "removed") }
        refused { source.unblock(fixture.accountId, personBlockId) }
        safety.removalAnswer = { OutcomeDto(it, "active") }
        refused { source.unblock(fixture.accountId, personBlockId) }
        safety.removalAnswer = null
        assertEquals(OutcomeDto(personBlockId, "removed"), source.unblock(fixture.accountId, personBlockId))

        for (bad in listOf(pageBlock.copy(id = "block-1"), pageBlock.copy(label = " "), pageBlock.copy(label = "x".repeat(81)), pageBlock.copy(pageId = null), personBlock.copy(pageId = pageId))) {
            safety.blocks = listOf(bad)
            refused { source.blocks(fixture.accountId) }
        }
        safety.blocks = listOf(pageBlock.copy(label = "😀".repeat(80)), personBlock)
        assertEquals(safety.blocks, source.blocks(fixture.accountId))
    }

    @Test fun aFailedReportOrBlockAboutAnotherItemKeepsThePageOrPostShown() = runBlocking {
        val safety = SafetyApi()
        val current = ready(CommunityRepository(safety, fixture.accounts))
        val missing = linkedMapOf<String, Boolean>()
        fun record(case: String) {
            assertEquals(case, "Synthetic NOT_FOUND", current.state.value.error)
            assertNull(case, current.state.value.notice)
            missing[case] = current.state.value.missing
        }
        current.open(Destination.Post(postId)); idle(current)
        safety.gone = setOf(commentId)
        current.report("comment", commentId, "spam", ""); idle(current)
        record("report a removed comment under the shown post")
        current.blockAuthor(comment); idle(current)
        record("block the author of a removed comment under the shown post")
        assertEquals(post, current.state.value.post)
        safety.gone = setOf(postId)
        current.report("post", postId, "spam", ""); idle(current)
        record("report the shown post after it was deleted")

        safety.gone = emptySet(); safety.blocks = listOf(pageBlock)
        current.open(Destination.Page("river-walkers")); idle(current)
        val block = current.state.value.blocks.single()
        safety.blocks = emptyList()
        current.unblock(block); idle(current)
        record("unblock the shown page when the block was already removed")
        assertEquals(pageId, current.state.value.page?.id)
        current.reload(); idle(current)
        assertEquals(listOf(post), current.state.value.posts)
        safety.gone = setOf(postId)
        current.report("post", postId, "spam", ""); idle(current)
        record("report a deleted post listed on the shown page")
        safety.gone = setOf(pageId)
        current.blockPage(current.state.value.page!!); idle(current)
        record("block the shown page after it was deleted")

        assertEquals(linkedMapOf(
            "report a removed comment under the shown post" to false,
            "block the author of a removed comment under the shown post" to false,
            "report the shown post after it was deleted" to true,
            "unblock the shown page when the block was already removed" to false,
            "report a deleted post listed on the shown page" to false,
            "block the shown page after it was deleted" to true,
        ), missing)
    }

    @Test fun aFailedCommandAboutAListedPostDraftOrCommentKeepsThePageOrPostShown() = runBlocking {
        val gone: MutableSet<String> = Collections.synchronizedSet(mutableSetOf())
        val draft = post.copy(id = draftId, title = "Next walk", status = "draft", publishedAt = null, canManage = true, etag = "\"d1\"")
        val owned = post.copy(canManage = true, etag = "\"v1\"")
        suspend fun <Value> unless(id: String, answer: suspend () -> Response<EnvelopeDto<Value>>): Response<EnvelopeDto<Value>> =
            if (id in gone) failed(404, "NOT_FOUND") else answer()
        val server = object : CommunityApi by api {
            override suspend fun page(authorization: String, reference: String): Response<EnvelopeDto<PageDto>> =
                unless(pageId) { ok(page.copy(canManage = true, etag = "\"p1\"")) }
            override suspend fun drafts(authorization: String, pageId: String): Response<EnvelopeDto<List<PostDto>>> = ok(listOf(draft))
            override suspend fun post(authorization: String, postId: String): Response<EnvelopeDto<PostDto>> = unless(postId) { ok(owned) }
            override suspend fun react(authorization: String, postId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PostDto>> =
                unless(postId) { api.react(authorization, postId, action, body) }
            override suspend fun publish(authorization: String, postId: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<PostDto>> =
                unless(postId) { api.publish(authorization, postId, etag, body) }
            override suspend fun deletePost(authorization: String, postId: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<OutcomeDto>> =
                unless(postId) { api.deletePost(authorization, postId, etag, body) }
            override suspend fun updatePost(authorization: String, postId: String, etag: String, body: Map<String, String?>): Response<EnvelopeDto<PostDto>> =
                unless(postId) { api.updatePost(authorization, postId, etag, body) }
            override suspend fun endComment(authorization: String, commentId: String, body: Map<String, String>): Response<EnvelopeDto<CommentDto>> =
                unless(commentId) { api.endComment(authorization, commentId, body) }
        }
        val current = ready(CommunityRepository(server, fixture.accounts))
        val missing = linkedMapOf<String, Boolean>()
        fun record(case: String) {
            assertEquals(case, "Synthetic NOT_FOUND", current.state.value.error)
            assertNull(case, current.state.value.notice)
            missing[case] = current.state.value.missing
        }
        current.open(Destination.Page("river-walkers")); idle(current)
        assertEquals(listOf(post), current.state.value.posts)
        assertEquals(listOf(draft), current.state.value.drafts)
        gone += postId
        current.like(post); idle(current)
        record("like a deleted post listed on the shown page")
        current.save(post); idle(current)
        record("save a deleted post listed on the shown page")
        gone += draftId
        current.publish(draft); idle(current)
        record("publish a deleted draft listed on the shown page")
        current.startEdit(draft)
        assertTrue(current.editPost(draft, "Later walk", "Meet at 8")); idle(current)
        record("edit a deleted draft listed on the shown page")
        current.deletePost(draft); idle(current)
        record("delete a deleted draft listed on the shown page")

        gone.clear()
        current.open(Destination.Post(postId)); idle(current)
        assertEquals(owned, current.state.value.post)
        gone += commentId
        current.endComment(comment); idle(current)
        record("end a removed comment under the shown post")
        gone += postId
        current.like(owned); idle(current)
        record("like the shown post after it was deleted")
        current.startEdit(owned)
        assertTrue(current.editPost(owned, "Sunday walk", "Meet at 9")); idle(current)
        record("edit the shown post after it was deleted")
        current.deletePost(owned); idle(current)
        record("delete the shown post after it was deleted")

        assertEquals(linkedMapOf(
            "like a deleted post listed on the shown page" to false,
            "save a deleted post listed on the shown page" to false,
            "publish a deleted draft listed on the shown page" to false,
            "edit a deleted draft listed on the shown page" to false,
            "delete a deleted draft listed on the shown page" to false,
            "end a removed comment under the shown post" to false,
            "like the shown post after it was deleted" to true,
            "edit the shown post after it was deleted" to true,
            "delete the shown post after it was deleted" to true,
        ), missing)
    }

    @Test fun reportDetailsCountCharactersLikeTheServerAndNeverSplitAnEmoji() = runBlocking {
        val safety = SafetyApi()
        val current = ready(CommunityRepository(safety, fixture.accounts))
        current.open(Destination.Post(postId)); idle(current)
        fun describe(text: String) = "${text.codePointCount(0, text.length)} characters, ${text.codePoints().filter { it in 0xD800..0xDFFF }.count()} lone surrogates"
        val emoji = "😀".repeat(1000)
        val cases = listOf(
            Triple("1,000 emoji are sent whole", emoji, emoji),
            Triple("1,001 emoji are cut to 1,000", emoji + "😀", emoji),
            Triple("a cut after a letter keeps every emoji whole", "a$emoji", "a" + "😀".repeat(999)),
            Triple("1,001 letters are cut to 1,000 as before", "x".repeat(1001), "x".repeat(1000)),
            Triple("surrounding spaces are trimmed before counting", " \n${"x".repeat(1000)}\n ", "x".repeat(1000)),
            Triple("short text keeps its lines", "  Line one\nLine two \n", "Line one\nLine two"),
        )
        val sent = linkedMapOf<String, String>()
        val wanted = linkedMapOf<String, String>()
        for ((case, typed, expected) in cases) {
            current.report("comment", commentId, "spam", typed); idle(current)
            assertEquals(case, reported, current.state.value.notice)
            val details = safety.reports.last().details
            sent[case] = describe(details) + if (details == expected) "" else ", different text"
            wanted[case] = describe(expected)
        }
        assertEquals(wanted, sent)
    }

    @Test fun reportDialogLimitKeepsWholeCharactersLikeTheServer() {
        val emoji = "😀".repeat(1000)
        assertEquals(emoji, emoji.takeCodePoints(REPORT_DETAILS_LIMIT))
        assertEquals(emoji, (emoji + "😀").takeCodePoints(REPORT_DETAILS_LIMIT))
        assertEquals("a" + "😀".repeat(999), "a$emoji".takeCodePoints(REPORT_DETAILS_LIMIT))
        assertEquals("x".repeat(1000), "x".repeat(1001).takeCodePoints(REPORT_DETAILS_LIMIT))
        assertEquals(" Rude reply \n", " Rude reply \n".takeCodePoints(REPORT_DETAILS_LIMIT))
        assertEquals("", "😀".takeCodePoints(0))
    }

    @Test fun followedPagesAreAskedForTwentyAtATimeWithTheCursorAndTheSession() = runBlocking {
        val requests = mutableListOf<Request>()
        var reply = EnvelopeDto(listOf(followedPage(1)), null, PaginationDto("after-1", true))
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(reply).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        assertEquals(CommunityPage(listOf(followedPage(1)), "after-1"), wire.following(fixture.accountId, null))
        reply = EnvelopeDto(listOf(followedPage(2)), null, PaginationDto(null, false))
        assertEquals(CommunityPage(listOf(followedPage(2)), null), wire.following(fixture.accountId, "after-1"))
        for ((request, cursor) in requests.zip(listOf(null, "after-1"))) {
            assertEquals("GET", request.method)
            assertEquals("/v1/me/following", request.url.encodedPath)
            assertEquals(setOfNotNull("limit", cursor?.let { "cursor" }), request.url.queryParameterNames)
            assertEquals("20", request.url.queryParameter("limit"))
            assertEquals(cursor, request.url.queryParameter("cursor"))
            assertEquals("Bearer ${fixture.token}", request.header("Authorization"))
        }

        fun refused(cursor: String?) = assertThrows(IdentityFailure::class.java) { runBlocking { wire.following(fixture.accountId, cursor) } }.message
        reply = EnvelopeDto(listOf(followedPage(2).copy(following = false)), null, PaginationDto(null, false))
        assertEquals("The service returned an unexpected community response.", refused(null))
        reply = EnvelopeDto(listOf(followedPage(2)), null, PaginationDto("after-1", true))
        assertEquals("The list is incomplete.", refused("after-1"))
        reply = EnvelopeDto(listOf(followedPage(2), followedPage(2)), null, PaginationDto(null, false))
        assertEquals("The service returned an unexpected community response.", refused(null))

        // Twenty pages with the longest names and descriptions, all emoji, still fit the response limit.
        val largest = List(20) { followedPage(it).copy(handle = "walkers-$it".padEnd(30, 'x'), name = "😀".repeat(80), description = "😀".repeat(500)) }
        reply = EnvelopeDto(largest, null, PaginationDto(null, false))
        assertTrue(Gson().toJson(reply).toByteArray().size in 49152..65536)
        assertEquals(largest, wire.following(fixture.accountId, null).items)
    }

    @Test fun followedPagesShowThatTheyAreLoadingThenTheListAndLoadMoreAddsTheNextPage() = runBlocking {
        val server = FollowApi()
        server.followed = List(21) { followedPage(it) }
        val current = ready(CommunityRepository(server, fixture.accounts))
        val gate = CompletableDeferred<Unit>(); server.gate = gate
        current.open(Destination.MyPages)
        withTimeout(5000) { server.entered.await() }
        current.state.value.let { state ->
            assertTrue(state.loading)
            assertEquals(ListStatus.LOADING, state.followedStatus)
            assertFalse(state.noFollowedPages)
            assertTrue(state.followed.isEmpty())
        }
        server.gate = null; gate.complete(Unit); idle(current)
        current.state.value.let { state ->
            assertEquals(ListStatus.LOADED, state.followedStatus)
            assertEquals(server.followed.take(20), state.followed)
            assertEquals("after-20", state.nextCursor)
            assertFalse(state.noFollowedPages)
            assertNull(state.error)
        }

        // A failed Load more keeps the pages already shown, and can be tried again.
        server.listFailure = 503
        current.reload(more = true); idle(current)
        current.state.value.let { state ->
            assertEquals("Synthetic UNAVAILABLE", state.error)
            assertEquals(ListStatus.LOADED, state.followedStatus)
            assertEquals(server.followed.take(20), state.followed)
            assertEquals("after-20", state.nextCursor)
        }
        server.listFailure = 0
        current.reload(more = true); idle(current)
        current.state.value.let { state ->
            assertEquals(server.followed, state.followed)
            assertNull(state.nextCursor)
            assertNull(state.error)
            assertEquals(ListStatus.LOADED, state.followedStatus)
        }
        assertEquals(listOf("GET /v1/me/pages", "GET /v1/me/following?limit=20") + List(2) { "GET /v1/me/following?limit=20&cursor=after-20" }, server.calls)
        assertEquals(setOf("Bearer ${fixture.token}"), server.sessions)
    }

    @Test fun followedPagesSayTheListIsEmptyOnlyAfterASuccessfulLoadAndAFailedLoadOffersRetry() = runBlocking {
        val server = FollowApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        fun shows(case: String, status: ListStatus, empty: Boolean, ownedEmpty: Boolean, error: String?) {
            val state = current.state.value
            assertFalse(case, state.busy)
            assertEquals(case, status, state.followedStatus)
            assertEquals(case, empty, state.noFollowedPages)
            assertEquals(case, ownedEmpty, state.noOwnedPages)
            assertEquals(case, error, state.error)
        }
        server.listFailure = 503
        current.open(Destination.MyPages); idle(current)
        shows("the first load failed", ListStatus.FAILED, empty = false, ownedEmpty = true, error = "Synthetic UNAVAILABLE")

        server.listFailure = 0
        val gate = CompletableDeferred<Unit>(); server.gate = gate
        current.reload()
        withTimeout(5000) { server.entered.await() }
        assertEquals(ListStatus.LOADING, current.state.value.followedStatus)
        assertFalse(current.state.value.noFollowedPages)
        server.gate = null; gate.complete(Unit); idle(current)
        shows("Retry loaded an empty list", ListStatus.LOADED, empty = true, ownedEmpty = true, error = null)

        server.listFailure = 503
        current.reload(); idle(current)
        shows("a refresh failed", ListStatus.FAILED, empty = false, ownedEmpty = true, error = "Synthetic UNAVAILABLE")

        server.listFailure = 0; server.ownedFailure = 503
        current.open(Destination.Discover); idle(current)
        current.open(Destination.MyPages); idle(current)
        shows("your own pages could not be loaded", ListStatus.FAILED, empty = false, ownedEmpty = false, error = "Synthetic UNAVAILABLE")
        server.ownedFailure = 0; server.followed = listOf(followedPage(1))
        current.reload(); idle(current)
        shows("Retry loaded both lists", ListStatus.LOADED, empty = false, ownedEmpty = true, error = null)
        assertEquals(listOf(followedPage(1)), current.state.value.followed)
    }

    @Test fun unfollowSendsTheFollowCommandForThatPageThenReloadsTheList() = runBlocking {
        val server = FollowApi()
        val first = followedPage(1)
        val second = followedPage(2)
        server.followed = listOf(first, second)
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.MyPages); idle(current)
        assertEquals(listOf(first, second), current.state.value.followed)
        fun unconfirmed(message: String) {
            val state = current.state.value
            assertEquals(message, state.error)
            assertNull(state.notice)
            assertFalse(state.missing)
            assertEquals(Destination.MyPages, state.destination)
            assertEquals(listOf(first, second), state.followed)
        }
        var mark = server.calls.size
        server.failure = 503
        current.unfollow(first); idle(current)
        unconfirmed("Synthetic UNAVAILABLE")
        // A 404 about a listed page does not mean anything shown is gone.
        server.failure = 0; server.gone = setOf(first.id)
        current.unfollow(first); idle(current)
        unconfirmed("Synthetic NOT_FOUND")
        server.gone = emptySet(); server.answer = { it.copy(following = true) }
        current.unfollow(first); idle(current)
        unconfirmed("The follow change could not be confirmed.")
        server.answer = null; server.lost = true
        current.unfollow(second); idle(current)
        unconfirmed("No connection. Nothing new is confirmed.")
        assertEquals(listOf(first, first, first, second).map { "POST /v1/pages/${it.id}/unfollow" }, server.calls.drop(mark))

        server.lost = false
        mark = server.calls.size
        current.unfollow(first); idle(current)
        assertNull(current.state.value.error)
        assertEquals(listOf("POST /v1/pages/${first.id}/unfollow", "GET /v1/me/pages", "GET /v1/me/following?limit=20"), server.calls.drop(mark))
        // The server's list, which also lacks the page whose earlier answer was lost.
        assertTrue(current.state.value.followed.isEmpty())
        assertTrue(current.state.value.noFollowedPages)
        assertEquals(List(5) { emptyMap<String, String>() }, server.bodies)
        assertEquals(setOf("Bearer ${fixture.token}"), server.sessions)
    }

    @Test fun pageEditIsOfferedOnlyToTheOwnerAndSendsOnlyTheChangedFields() = runBlocking {
        val server = PageEditApi()
        server.current = page
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        current.startPageEdit(current.state.value.page!!)
        assertNull(current.state.value.editingPage)
        assertFalse(current.editPage("River Runners", "Weekend walks", "hobbies"))

        server.current = page.copy(canManage = true, etag = "\"p1\"")
        current.reload(); idle(current)
        val opened = current.state.value.page!!
        current.startPageEdit(opened)
        assertEquals(opened, current.state.value.editingPage)
        // The same text, once spaces are tidied as the server tidies them, closes the editor and sends nothing.
        assertTrue(current.editPage("  River   Walkers ", " Weekend walks\n", "hobbies"))
        assertNull(current.state.value.editingPage)
        current.startPageEdit(opened)
        assertFalse(current.editPage("   ", "Weekend walks", "hobbies"))
        assertEquals("Use a name of 1 to 80 characters and a description of up to 500.", current.state.value.error)
        assertFalse(current.editPage("River Walkers", "Weekend walks", "gossip"))
        assertEquals(opened, current.state.value.editingPage)
        assertTrue(server.edits.isEmpty())

        val hold = CompletableDeferred<Unit>(); server.gate = hold
        assertTrue(current.editPage(" River  Runners ", "Weekend walks", "local"))
        // The server's answer shows as soon as it arrives, while the page and its posts reload.
        withTimeout(5000) { server.entered.await() }
        val answered = withTimeout(5000) { current.state.first { !it.working } }
        assertEquals(listOf("\"p1\"" to mapOf("name" to "River Runners", "topic" to "local")), server.edits)
        assertTrue(answered.loading)
        assertEquals(server.current, answered.page)
        assertEquals("\"p2\"", answered.page!!.etag)
        assertNull(answered.editingPage)
        assertEquals("Page saved.", answered.notice)
        server.gate = null; hold.complete(Unit); idle(current)
        current.state.value.let { state ->
            assertEquals(page.copy(name = "River Runners", topic = "local", updatedAt = "2026-09-19T10:02:00Z", canManage = true, etag = "\"p2\""), state.page)
            assertNull(state.editingPage)
            assertEquals("Page saved.", state.notice)
            assertNull(state.error)
        }
    }

    @Test fun pageEditSavesAgainstTheVersionItOpenedWithSoANewerVersionIsRefusedNotOverwritten() = runBlocking {
        val server = PageEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        current.startPageEdit(current.state.value.page!!)
        val opened = current.state.value.editingPage!!
        assertEquals("\"p1\"", opened.etag)
        // The owner changes the description on another device, and this screen refreshes while the editor stays open.
        server.change(mapOf("description" to "Sunday walks"))
        current.reload(); idle(current)
        assertEquals("\"p2\"", current.state.value.page!!.etag)
        assertEquals(opened, current.state.value.editingPage)

        assertTrue(current.editPage("River Runners", "Weekend walks", "hobbies")); idle(current)
        assertEquals(listOf("\"p1\"" to mapOf("name" to "River Runners")), server.edits)
        val refused = current.state.value
        assertEquals("This page changed since you opened the editor. Close it and reload before editing again.", refused.error)
        assertNull(refused.notice)
        assertFalse(refused.missing)
        assertEquals(opened, refused.editingPage)
        assertEquals(server.current, refused.page)
        assertEquals("River Walkers" to "Sunday walks", server.current.name to server.current.description)

        // Saving again still sends the version the editor opened with.
        assertTrue(current.editPage("River Runners", "Weekend walks", "hobbies")); idle(current)
        assertEquals(List(2) { "\"p1\"" to mapOf("name" to "River Runners") }, server.edits)
        assertEquals(opened, current.state.value.editingPage)
        // Closing the editor and opening it on the current version saves against that version.
        current.cancelPageEdit()
        assertNull(current.state.value.editingPage)
        current.startPageEdit(current.state.value.page!!)
        assertTrue(current.editPage("River Runners", "Sunday walks", "hobbies")); idle(current)
        assertEquals("\"p2\"" to mapOf("name" to "River Runners"), server.edits.last())
        assertEquals(Triple("River Runners", "Sunday walks", "\"p3\""), current.state.value.page!!.let { Triple(it.name, it.description, it.etag) })
        assertNull(current.state.value.editingPage)
        assertNull(current.state.value.error)
    }

    @Test fun aPageEditShowsAsSavedOnlyAfterTheServerConfirmsIt() = runBlocking {
        val server = PageEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        val shown = current.state.value.page!!
        current.startPageEdit(shown)
        fun unconfirmed(message: String) {
            val state = current.state.value
            assertEquals(message, state.error)
            assertNull(state.notice)
            assertFalse(state.missing)
            assertEquals(shown, state.editingPage)
            assertEquals(shown, state.page)
        }
        server.failure = 422; server.failureCode = "VALIDATION_FAILED"
        assertTrue(current.editPage("River Runners", "", "hobbies")); idle(current)
        unconfirmed("Synthetic VALIDATION_FAILED")
        server.failure = 0; server.lost = true
        assertTrue(current.editPage("River Runners", "", "hobbies")); idle(current)
        unconfirmed("No connection. Nothing new is confirmed.")
        // The server applied the change whose answer was lost; this screen does not claim it.
        assertEquals("River Runners" to "", server.current.name to server.current.description)
        assertEquals(List(2) { "\"p1\"" to mapOf("name" to "River Runners", "description" to "") }, server.edits)

        // A 404 about the shown page means it is gone.
        server.lost = false; server.gone = true
        assertTrue(current.editPage("River Runners", "", "hobbies")); idle(current)
        assertEquals("Synthetic NOT_FOUND", current.state.value.error)
        assertTrue(current.state.value.missing)
        assertNull(current.state.value.notice)
    }

    @Test fun pageNamesAndDescriptionsCountCharactersLikeTheServerWhenCreatingAndEditing() = runBlocking {
        val server = PageEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        val name = "😀".repeat(80)
        val description = "😀".repeat(500)
        val created = linkedMapOf(
            "81 emoji in the name" to current.createPage("river-walkers", "$name😀", "hobbies", ""),
            "501 emoji in the description" to current.createPage("river-walkers", "River Walkers", "hobbies", "$description😀"),
        )
        assertTrue(api.keys.isEmpty())
        created["80 and 500 emoji"] = current.createPage("river-walkers", name, "hobbies", description); idle(current)
        assertEquals(linkedMapOf("81 emoji in the name" to false, "501 emoji in the description" to false, "80 and 500 emoji" to true), created)
        assertEquals(CreatePageDto("river-walkers", name, description, "hobbies"), api.keys.single().second)

        assertEquals(Destination.Page("river-walkers"), current.state.value.destination)
        current.startPageEdit(current.state.value.page!!)
        val edited = linkedMapOf(
            "81 emoji in the name" to current.editPage("$name😀", "", "hobbies"),
            "501 emoji in the description" to current.editPage("River Walkers", "$description😀", "hobbies"),
        )
        assertTrue(server.edits.isEmpty())
        edited["80 and 500 emoji"] = current.editPage(name, description, "hobbies"); idle(current)
        assertEquals(linkedMapOf("81 emoji in the name" to false, "501 emoji in the description" to false, "80 and 500 emoji" to true), edited)
        assertEquals(listOf("\"p1\"" to mapOf("name" to name, "description" to description)), server.edits)
        assertEquals(name to description, current.state.value.page!!.let { it.name to it.description })
    }

    @Test fun pageEditWireSendsOnlyTheChangedFieldsWithTheOpenedVersion() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val opened = page.copy(canManage = true, etag = "\"p1\"")
        var reply = opened.copy(name = "River Runners", etag = "\"p2\"")
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(reply, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        assertEquals(reply, wire.updatePage(fixture.accountId, opened, mapOf("name" to "River Runners")))
        reply = opened.copy(description = "", topic = "local", etag = "\"p3\"")
        assertEquals(reply, wire.updatePage(fixture.accountId, opened, mapOf("description" to "", "topic" to "local")))
        for (request in requests) {
            assertEquals("PATCH", request.method)
            assertEquals("/v1/pages/$pageId", request.url.encodedPath)
            assertNull(request.url.encodedQuery)
            assertEquals("\"p1\"", request.header("If-Match"))
            assertEquals("Bearer ${fixture.token}", request.header("Authorization"))
            assertNull(request.header("Idempotency-Key"))
        }
        assertEquals(JsonParser.parseString("""{"name":"River Runners"}"""), JsonParser.parseString(bodies[0]))
        assertEquals(JsonParser.parseString("""{"description":"","topic":"local"}"""), JsonParser.parseString(bodies[1]))

        fun refused() = assertEquals("INVALID_RESPONSE", assertThrows(IdentityFailure::class.java) { runBlocking { wire.updatePage(fixture.accountId, opened, mapOf("name" to "River Runners")) } }.code)
        reply = reply.copy(id = otherPageId); refused()
        reply = page; refused()
        reply = opened.copy(handle = "other-walkers", etag = "\"p4\""); refused()
        assertEquals(5, requests.size)
        // A page without a version tag, an empty change or a field that cannot change is never sent.
        assertThrows(IdentityFailure::class.java) { runBlocking { wire.updatePage(fixture.accountId, page, mapOf("name" to "River Runners")) } }
        assertThrows(IdentityFailure::class.java) { runBlocking { wire.updatePage(fixture.accountId, opened, emptyMap()) } }
        assertThrows(IllegalArgumentException::class.java) { runBlocking { wire.updatePage(fixture.accountId, opened, mapOf("handle" to "other-walkers")) } }
        assertThrows(IllegalArgumentException::class.java) { runBlocking { wire.updatePage(fixture.accountId, opened, mapOf("topic" to "gossip")) } }
        assertEquals(5, requests.size)
    }

    @Test fun createPageAcceptsFiveHundredEmojiDescription() = runBlocking {
        val current = ready()
        val description = "\uD83D\uDE00".repeat(500)
        assertTrue(current.createPage("river-walkers", "River Walkers", "hobbies", description))
        idle(current)
        assertEquals(description, api.keys.single().second.description)
    }

    @Test fun followingWireUsesTheCursorAndTwentyItemLimit() = runBlocking {
        val requests = mutableListOf<Request>()
        val pages = List(20) { index -> followedPage(index).copy(name = "\uD83D\uDE00".repeat(80), description = "\uD83D\uDE00".repeat(500)) }
        val json = Gson().toJson(EnvelopeDto(pages, null, PaginationDto("second", true)))
        assertTrue(json.toByteArray(Charsets.UTF_8).size in 50000..65536)
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            requests += chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        assertEquals(CommunityPage(pages, "second"), wire.following(fixture.accountId, "first"))
        wire.following(fixture.accountId, null)
        assertTrue(requests.all { it.method == "GET" && it.url.encodedPath == "/v1/me/following" && it.url.queryParameter("limit") == "20" })
        assertEquals("first", requests[0].url.queryParameter("cursor"))
        assertNull(requests[1].url.queryParameter("cursor"))
        assertEquals("Bearer ${fixture.token}", requests[0].header("Authorization"))
    }

    @Test fun followingRefusesAnItemThatIsNotFollowed() = runBlocking {
        val server = FollowApi(); server.followed = listOf(page)
        val source = CommunityRepository(server, fixture.accounts)
        val failure = assertThrows(IdentityFailure::class.java) { runBlocking { source.following(fixture.accountId, null) } }
        assertEquals("INVALID_RESPONSE", failure.code)
        assertEquals(listOf("GET /v1/me/following?limit=20"), server.calls)
    }

    @Test fun pageEditWireCarriesReviewedVersionAndOnlyChangedFields() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val owned = page.copy(canManage = true, etag = "\"p1\"")
        var reply = owned.copy(topic = "events", etag = "\"p2\"")
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(reply, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        assertEquals(reply, wire.updatePage(fixture.accountId, owned, mapOf("topic" to "events")))
        reply = owned.copy(name = "New name", description = "", etag = "\"p2\"")
        assertEquals(reply, wire.updatePage(fixture.accountId, owned, mapOf("name" to "New name", "description" to "")))
        assertEquals(JsonParser.parseString("""{"topic":"events"}"""), JsonParser.parseString(bodies[0]))
        assertEquals(JsonParser.parseString("""{"name":"New name","description":""}"""), JsonParser.parseString(bodies[1]))
        assertTrue(requests.all { it.method == "PATCH" && it.url.encodedPath == "/v1/pages/$pageId" && it.header("If-Match") == "\"p1\"" })
        assertTrue(requests.all { it.header("Authorization") == "Bearer ${fixture.token}" && it.url.encodedQuery == null })
        for (unconfirmed in listOf(reply.copy(id = otherPageId), reply.copy(handle = "another-page"), reply.copy(canManage = false, etag = null))) {
            reply = unconfirmed
            val failure = assertThrows(IdentityFailure::class.java) { runBlocking { wire.updatePage(fixture.accountId, owned, mapOf("topic" to "events")) } }
            assertEquals("INVALID_RESPONSE", failure.code)
            assertEquals("The page change could not be confirmed.", failure.message)
        }
        assertEquals(5, requests.size)
    }

    @Test fun pageEditRequiresOwnershipReviewAndChanges() {
        val server = PageEditApi()
        val source = CommunityRepository(server, fixture.accounts)
        val owned = server.current
        for (unreviewed in listOf(page, owned.copy(etag = null), owned.copy(canManage = false))) {
            assertThrows(IdentityFailure::class.java) { runBlocking { source.updatePage(fixture.accountId, unreviewed, mapOf("topic" to "events")) } }
        }
        assertThrows(IdentityFailure::class.java) { runBlocking { source.updatePage(fixture.accountId, owned, emptyMap()) } }
        assertTrue(server.edits.isEmpty())
    }

    @Test fun ownedPageFailureOffersOneRetryForBothListsWithoutEitherEmptyMessage() = runBlocking {
        val server = FollowApi(); server.ownedFailure = 503; server.followed = listOf(followedPage(1))
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.MyPages); idle(current)
        current.state.value.let { state ->
            assertFalse(state.ownedLoaded)
            assertEquals("Synthetic UNAVAILABLE", state.ownedError)
            assertEquals(ListStatus.FAILED, state.followedStatus)
            assertEquals("Synthetic UNAVAILABLE", state.followedError)
            assertFalse(state.noOwnedPages)
            assertFalse(state.noFollowedPages)
            assertTrue(state.followed.isEmpty())
        }
        // The followed list is not asked for once the screen already shows a failure.
        assertEquals(listOf("GET /v1/me/pages"), server.calls)
        server.ownedFailure = 0
        current.retryFollowing(); idle(current)
        assertEquals(listOf("GET /v1/me/pages", "GET /v1/me/pages", "GET /v1/me/following?limit=20"), server.calls)
        current.state.value.let { state ->
            assertTrue(state.ownedLoaded)
            assertNull(state.ownedError)
            assertEquals(ListStatus.LOADED, state.followedStatus)
            assertEquals(server.followed, state.followed)
            assertNull(state.followedError)
        }
    }

    @Test fun followingFailureDoesNotHideOwnedPages() = runBlocking {
        val server = FollowApi(); server.owned = listOf(page.copy(canManage = true, etag = "\"p1\"")); server.listFailure = 503
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.MyPages); idle(current)
        assertTrue(current.state.value.ownedLoaded)
        assertEquals(server.owned, current.state.value.pages)
        assertNull(current.state.value.ownedError)
        assertEquals(ListStatus.FAILED, current.state.value.followedStatus)
        assertEquals("Synthetic UNAVAILABLE", current.state.value.followedError)
        assertFalse(current.state.value.noFollowedPages)
        server.listFailure = 0
        current.retryFollowing(); idle(current)
        assertTrue(current.state.value.noFollowedPages)
        assertNull(current.state.value.followedError)
    }

    @Test fun followingLoadMoreDeduplicatesPageIds() = runBlocking {
        val first = followedPage(1); val second = followedPage(2)
        val cursors = mutableListOf<String?>()
        val server = object : CommunityApi by api {
            override suspend fun following(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PageDto>>> {
                cursors += cursor
                return if (cursor == null) ok(listOf(first), PaginationDto("next", true)) else ok(listOf(first, second), PaginationDto(null, false))
            }
        }
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.MyPages); idle(current)
        assertEquals("next", current.state.value.followedNextCursor)
        current.reload(more = true); idle(current)
        assertEquals(listOf(first, second), current.state.value.followed)
        assertEquals(listOf(null, "next"), cursors)
        assertNull(current.state.value.followedNextCursor)
    }

    @Test fun pageEditNormalizesChangedFieldsAndUpdatesOwnedList() = runBlocking {
        val server = PageEditApi()
        val source = object : CommunityApi by server {
            override suspend fun myPages(authorization: String) = ok(listOf(server.current))
        }
        val current = ready(CommunityRepository(source, fixture.accounts))
        current.open(Destination.MyPages); idle(current)
        current.open(Destination.Page(page.handle)); idle(current)
        assertEquals(listOf(server.current), current.state.value.pages)
        current.startPageEdit(current.state.value.page!!)
        assertTrue(current.editPage("  New\tname\n", " \r\nLine one\r\nLine two \r\n", "events")); idle(current)
        assertEquals(listOf("\"p1\"" to mapOf("name" to "New name", "description" to "Line one\nLine two", "topic" to "events")), server.edits)
        assertEquals(server.current, current.state.value.page)
        assertEquals(listOf(server.current), current.state.value.pages)
        assertNull(current.state.value.editingPage)
        assertEquals("Page saved.", current.state.value.notice)
    }

    @Test fun pageEditValidationUsesTheSpecifiedMessageAndSendsNothing() = runBlocking {
        val server = PageEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page(page.handle)); idle(current)
        current.startPageEdit(current.state.value.page!!)
        val name = "\uD83D\uDE00".repeat(80); val description = "\uD83D\uDE00".repeat(500)
        for ((heading, text, topic) in listOf(Triple(" ", "", "hobbies"), Triple(name + "\uD83D\uDE00", "", "hobbies"),
            Triple("River Walkers", description + "\uD83D\uDE00", "hobbies"), Triple("River Walkers", "", "gossip"))) {
            assertFalse(current.editPage(heading, text, topic))
            assertEquals("Use a name of 1 to 80 characters and a description of up to 500.", current.state.value.error)
            assertEquals(server.current, current.state.value.editingPage)
        }
        assertTrue(server.edits.isEmpty())
        assertTrue(current.editPage(name, description, "hobbies")); idle(current)
        assertEquals(name to description, current.state.value.page!!.let { it.name to it.description })
    }

    @Test fun pageEditUnknownOutcomeKeepsSnapshotAndReloadsWhenClosed() = runBlocking {
        val server = PageEditApi(); server.lost = true
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page(page.handle)); idle(current)
        val opened = current.state.value.page!!
        current.startPageEdit(opened)
        assertTrue(current.editPage("New name", "", "hobbies")); idle(current)
        assertEquals("No connection. Nothing new is confirmed.", current.state.value.error)
        assertEquals(opened, current.state.value.editingPage)
        assertEquals(opened, current.state.value.page)
        assertNull(current.state.value.notice)
        assertTrue(current.state.value.pageEditFailed)
        current.cancelPageEdit(); idle(current)
        assertNull(current.state.value.editingPage)
        assertEquals(server.current, current.state.value.page)
        assertEquals("New name", current.state.value.page!!.name)
        assertNull(current.state.value.error)
    }

    @Test fun pageEditTimeoutAndServerFailuresKeepTheEditorAndTheOpenedVersion() = runBlocking {
        val server = PageEditApi(); server.failureCode = "UNAVAILABLE"
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page(page.handle)); idle(current)
        val opened = current.state.value.page!!
        current.startPageEdit(opened)
        for (status in listOf(408, 500, 503)) {
            server.failure = status
            assertTrue(current.editPage("New name", "", "hobbies")); idle(current)
            assertEquals("Synthetic UNAVAILABLE", current.state.value.error)
            assertTrue(current.state.value.pageEditFailed)
            assertEquals(opened, current.state.value.editingPage)
            assertEquals(opened, current.state.value.page)
            assertNull(current.state.value.notice)
        }
        assertEquals(List(3) { "\"p1\"" to mapOf("name" to "New name", "description" to "") }, server.edits)
    }

    @Test fun pageEditConflictKeepsSnapshotAndClosingReloadsLatest() = runBlocking {
        val server = PageEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page(page.handle)); idle(current)
        val opened = current.state.value.page!!
        current.startPageEdit(opened)
        server.change(mapOf("description" to "Newer description"))
        assertTrue(current.editPage("New name", opened.description, opened.topic)); idle(current)
        assertEquals("This page changed since you opened the editor. Close it and reload before editing again.", current.state.value.error)
        assertEquals(opened, current.state.value.editingPage)
        assertEquals(opened, current.state.value.page)
        assertEquals("\"p1\"", server.edits.single().first)
        current.cancelPageEdit(); idle(current)
        assertNull(current.state.value.editingPage)
        assertEquals(server.current, current.state.value.page)
        assertEquals("Newer description", current.state.value.page!!.description)
    }

    @Test fun pageEditSnapshotSurvivesRepeatedOpenAndRefresh() = runBlocking {
        val server = PageEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page(page.handle)); idle(current)
        val opened = current.state.value.page!!
        current.startPageEdit(opened)
        server.change(mapOf("description" to "Newer description"))
        current.reload(); idle(current)
        current.startPageEdit(current.state.value.page!!)
        assertEquals(opened, current.state.value.editingPage)
        assertTrue(current.editPage("New name", opened.description, opened.topic)); idle(current)
        assertEquals("\"p1\"", server.edits.single().first)
        assertEquals(server.current, current.state.value.page)
        assertEquals(opened, current.state.value.editingPage)
    }

    @Test fun followingLateAnswerAfterAccountChangeIsIgnored() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>(); val returned = CompletableDeferred<Unit>()
        val server = object : CommunityApi by api {
            override suspend fun following(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PageDto>>> = withContext(NonCancellable) {
                entered.complete(Unit); release.await()
                ok(listOf(followedPage(1)), PaginationDto(null, false)).also { returned.complete(Unit) }
            }
        }
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.MyPages)
        withTimeout(5000) { entered.await() }
        current.bind(null)
        release.complete(Unit)
        withTimeout(5000) { returned.await() }
        assertEquals(CommunityState(), current.state.value)
    }

    @Test fun followingLateAnswerAfterNavigationIsIgnored() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>(); val returned = CompletableDeferred<Unit>()
        val server = object : CommunityApi by api {
            override suspend fun following(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PageDto>>> = withContext(NonCancellable) {
                entered.complete(Unit); release.await()
                ok(listOf(followedPage(1)), PaginationDto(null, false)).also { returned.complete(Unit) }
            }
        }
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.MyPages)
        withTimeout(5000) { entered.await() }
        current.open(Destination.Discover)
        release.complete(Unit)
        withTimeout(5000) { returned.await() }
        idle(current)
        assertEquals(Destination.Discover, current.state.value.destination)
        assertTrue(current.state.value.followed.isEmpty())
        assertEquals(listOf(page), current.state.value.pages)
        assertNull(current.state.value.followedError)
    }

    @Test fun unfollowKeepsTheRowUntilTheServerAnswersAndBlocksAnotherCommand() = runBlocking {
        val followed = followedPage(1)
        val server = FollowApi(); server.followed = listOf(followed)
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        var requests = 0
        val delayed = object : CommunityApi by server {
            override suspend fun follow(authorization: String, pageId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PageDto>> {
                requests += 1; entered.complete(Unit); release.await()
                return server.follow(authorization, pageId, action, body)
            }
        }
        val current = ready(CommunityRepository(delayed, fixture.accounts))
        current.open(Destination.MyPages); idle(current)
        current.unfollow(followed)
        withTimeout(5000) { entered.await() }
        assertTrue(current.state.value.working)
        assertEquals(listOf(followed), current.state.value.followed)
        assertNull(current.state.value.notice)
        current.unfollow(followed)
        assertEquals(1, requests)
        release.complete(Unit); idle(current)
        assertTrue(current.state.value.followed.isEmpty())
        assertTrue(current.state.value.noFollowedPages)
        assertNull(current.state.value.error)
    }

    @Test fun pageInputCapsNeverSplitEmoji() {
        val emoji = "\uD83D\uDE00"
        for (limit in listOf(160, 1000)) {
            val capped = ("x" + emoji.repeat(limit)).takeCodePoints(limit)
            assertEquals("x" + emoji.repeat(limit - 1), capped)
            assertEquals(limit, capped.codePointLength())
            assertEquals(0L, capped.codePoints().filter { it in 0xD800..0xDFFF }.count())
        }
    }

    /** A server for a page the person owns with two published posts. It keeps which are pinned, latest pin first, refuses a pin over its limit, and can lose an answer after applying a change. */
    inner class PinApi : CommunityApi by api {
        val owned = page.copy(canManage = true, etag = "\"p1\"")
        val posts = listOf(post.copy(canManage = true, etag = "\"v1\""), post.copy(id = draftId, title = "Sunday walk", canManage = true, etag = "\"v1\""))
        var order = listOf<String>()
        val calls: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val bodies: MutableList<Map<String, String>> = Collections.synchronizedList(mutableListOf())
        var limit = MAX_PINNED_POSTS
        var lost = false
        private fun shown(item: PostDto) = item.copy(pinned = item.id in order)
        override suspend fun page(authorization: String, reference: String): Response<EnvelopeDto<PageDto>> = ok(owned)
        override suspend fun pagePosts(authorization: String, reference: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<PostDto>>> =
            ok(posts.map(::shown), PaginationDto(null, false))
        override suspend fun pinnedPosts(authorization: String, reference: String): Response<EnvelopeDto<List<PostDto>>> {
            calls += "GET /v1/pages/$reference/pinned-posts"
            return ok(order.map { id -> shown(posts.first { it.id == id }) })
        }
        override suspend fun pin(authorization: String, postId: String, action: String, body: Map<String, String>): Response<EnvelopeDto<PostDto>> {
            calls += "POST /v1/posts/$postId/$action"; bodies += body
            val target = posts.firstOrNull { it.id == postId } ?: return failed(404, "NOT_FOUND")
            if (action == "pin" && postId !in order) {
                if (order.size >= limit) return failed(409, "PIN_LIMIT_REACHED")
                order = listOf(postId) + order
            }
            if (action == "unpin") order = order - postId
            if (lost) throw IOException("Synthetic lost answer")
            return ok(shown(target))
        }
    }

    @Test fun pinnedPostsComeFromTheServerAndAPinShowsOnlyOnceItIsConfirmed() = runBlocking {
        val server = PinApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        assertTrue(current.state.value.pinned.isEmpty())
        assertEquals(listOf("GET /v1/pages/$pageId/pinned-posts"), server.calls)
        current.pin(current.state.value.posts.first { it.id == postId }); idle(current)
        current.state.value.let { state ->
            assertEquals(listOf(postId), state.pinned.map(PostDto::id))
            assertTrue(state.pinned.single().pinned)
            // The date-ordered list still holds the pinned post, as the server sends it; the screen shows it once.
            assertEquals(listOf(postId, draftId), state.posts.map(PostDto::id))
            assertNull(state.error)
        }
        current.pin(current.state.value.posts.first { it.id == draftId }); idle(current)
        assertEquals(listOf(draftId, postId), current.state.value.pinned.map(PostDto::id))
        current.pin(current.state.value.pinned.first { it.id == postId }); idle(current)
        assertEquals(listOf(draftId), current.state.value.pinned.map(PostDto::id))
        assertFalse(current.state.value.posts.first { it.id == postId }.pinned)
        assertEquals(listOf("pin", "pin", "unpin"), server.calls.filter { it.startsWith("POST") }.map { it.substringAfterLast('/') })
        assertEquals(List(3) { emptyMap<String, String>() }, server.bodies)
    }

    @Test fun aRefusedOrLostPinNeverShowsAsPinned() = runBlocking {
        val server = PinApi(); server.limit = 0
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        val shown = current.state.value.posts.first { it.id == postId }
        current.pin(shown); idle(current)
        current.state.value.let { state ->
            assertEquals("Synthetic PIN_LIMIT_REACHED", state.error)
            assertFalse(state.missing)
            assertTrue(state.pinned.isEmpty())
            assertFalse(state.posts.first { it.id == postId }.pinned)
        }
        server.limit = MAX_PINNED_POSTS; server.lost = true
        current.pin(shown); idle(current)
        current.state.value.let { state ->
            assertEquals("No connection. Nothing new is confirmed.", state.error)
            assertTrue(state.pinned.isEmpty())
            assertFalse(state.posts.first { it.id == postId }.pinned)
        }
        // The server applied the pin whose answer was lost; reloading shows it.
        current.reload(); idle(current)
        assertEquals(listOf(postId), current.state.value.pinned.map(PostDto::id))
        // Only a published post the person manages can be pinned.
        val sent = server.calls.size
        current.pin(post); current.pin(shown.copy(status = "draft", publishedAt = null))
        assertEquals(sent, server.calls.size)
    }

    @Test fun pinnedListsAreCheckedAndPinCommandsGoToTheirRoutesWithTheSession() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        var reply: Any = EnvelopeDto(listOf<PostDto>(), null)
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(reply).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        val pinned = post.copy(pinned = true)
        val several = List(4) { index -> pinned.copy(id = java.util.UUID.nameUUIDFromBytes("pinned-$index".toByteArray()).toString()) }
        reply = EnvelopeDto(several.take(MAX_PINNED_POSTS), null)
        assertEquals(several.take(MAX_PINNED_POSTS), wire.pinnedPosts(fixture.accountId, pageId))
        assertEquals("GET", requests[0].method)
        assertEquals("/v1/pages/$pageId/pinned-posts", requests[0].url.encodedPath)
        assertNull(requests[0].url.encodedQuery)
        assertEquals("Bearer ${fixture.token}", requests[0].header("Authorization"))
        // More than three, a repeat, a post that is not pinned, another page's post or a draft is refused.
        for (bad in listOf(several, listOf(pinned, pinned), listOf(post), listOf(pinned.copy(pageId = otherPageId)), listOf(pinned.copy(status = "draft", publishedAt = null, canManage = true, etag = "\"d\"")))) {
            reply = EnvelopeDto(bad, null)
            assertEquals("INVALID_RESPONSE", assertThrows(IdentityFailure::class.java) { runBlocking { wire.pinnedPosts(fixture.accountId, pageId) } }.code)
        }
        reply = EnvelopeDto(pinned, null)
        assertEquals(pinned, wire.pin(fixture.accountId, postId, true))
        reply = EnvelopeDto(post, null)
        assertEquals(post, wire.pin(fixture.accountId, postId, false))
        val commands = requests.drop(6)
        assertEquals(listOf("/v1/posts/$postId/pin", "/v1/posts/$postId/unpin"), commands.map { it.url.encodedPath })
        assertTrue(commands.all { it.method == "POST" && it.header("Authorization") == "Bearer ${fixture.token}" && it.header("Idempotency-Key") == null })
        assertEquals(listOf("{}", "{}"), bodies.drop(6))
        // An answer that does not show the requested state, or names another post, is not taken as done.
        reply = EnvelopeDto(post, null)
        assertEquals("INVALID_RESPONSE", assertThrows(IdentityFailure::class.java) { runBlocking { wire.pin(fixture.accountId, postId, true) } }.code)
        reply = EnvelopeDto(pinned.copy(id = draftId), null)
        assertEquals("INVALID_RESPONSE", assertThrows(IdentityFailure::class.java) { runBlocking { wire.pin(fixture.accountId, postId, true) } }.code)
    }

    @Test fun pageRulesAreEditedAgainstTheOpenedVersionAndCountCharactersLikeTheServer() = runBlocking {
        val server = PageEditApi()
        val current = ready(CommunityRepository(server, fixture.accounts))
        current.open(Destination.Page("river-walkers")); idle(current)
        current.startPageEdit(current.state.value.page!!)
        val longest = "\uD83D\uDE00".repeat(PAGE_RULES_LIMIT)
        assertFalse(current.editPage("River Walkers", "Weekend walks", "hobbies", "$longest\uD83D\uDE00"))
        assertEquals("Use rules of up to 2,000 characters.", current.state.value.error)
        assertTrue(server.edits.isEmpty())
        // Line endings and surrounding spaces are tidied as the server tidies them, and only the changed rules are sent.
        assertTrue(current.editPage("River Walkers", "Weekend walks", "hobbies", "  Be kind.\r\nNo selling.  ")); idle(current)
        assertEquals(listOf("\"p1\"" to mapOf("rules" to "Be kind.\nNo selling.")), server.edits)
        assertEquals("Be kind.\nNo selling.", current.state.value.page!!.rules)
        assertEquals("Page saved.", current.state.value.notice)
        // The same rules again, or no rules given, send nothing.
        current.startPageEdit(current.state.value.page!!)
        assertTrue(current.editPage("River Walkers", "Weekend walks", "hobbies", "Be kind.\nNo selling.\n"))
        current.startPageEdit(current.state.value.page!!)
        assertTrue(current.editPage("River Walkers", "Weekend walks", "hobbies"))
        assertEquals(1, server.edits.size)
        // The longest rules the server allows are sent, and an empty text removes them.
        current.startPageEdit(current.state.value.page!!)
        assertTrue(current.editPage("River Walkers", "Weekend walks", "hobbies", longest)); idle(current)
        current.startPageEdit(current.state.value.page!!)
        assertTrue(current.editPage("River Walkers", "Weekend walks", "hobbies", "   ")); idle(current)
        assertEquals(listOf("\"p2\"" to mapOf("rules" to longest), "\"p3\"" to mapOf("rules" to "")), server.edits.drop(1))
        assertEquals("", current.state.value.page!!.rules)
    }

    @Test fun rulesAndPinsAreCheckedLikeOtherPublicFacts() {
        val longest = "\uD83D\uDE00".repeat(PAGE_RULES_LIMIT)
        assertEquals(page.copy(rules = longest), repository.page(page.copy(rules = longest)))
        assertThrows(IdentityFailure::class.java) { repository.page(page.copy(rules = "$longest\uD83D\uDE00")) }
        assertEquals(post.copy(pinned = true), repository.post(post.copy(pinned = true)))
        assertThrows(IdentityFailure::class.java) { repository.post(post.copy(status = "draft", publishedAt = null, canManage = true, etag = "\"d\"", pinned = true)) }
        // An answer without rules or pins reads as a page without rules and a post that is not pinned.
        val olderPage = JsonParser.parseString(Gson().toJson(page)).asJsonObject.apply { remove("rules") }
        assertNull(repository.page(Gson().fromJson(olderPage, PageDto::class.java)).rules)
        val olderPost = JsonParser.parseString(Gson().toJson(post)).asJsonObject.apply { remove("pinned") }
        assertFalse(repository.post(Gson().fromJson(olderPost, PostDto::class.java)).pinned)
    }

    @Test fun pageListsWithTheLongestRulesDecodeThroughTheirResponseLimits() = runBlocking {
        val rules = "\uD83D\uDE00".repeat(PAGE_RULES_LIMIT)
        fun largest(count: Int, following: Boolean) = List(count) { index ->
            followedPage(index).copy(handle = "walkers-$index".padEnd(30, 'x'), name = "\uD83D\uDE00".repeat(80), description = "\uD83D\uDE00".repeat(500), rules = rules, following = following)
        }
        var json = ""
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CommunityRepository(IdentityModule.community(http, Gson()), fixture.accounts)
        // Twenty followed or found pages with the longest names, descriptions and rules, all emoji, are larger than 64 KiB.
        val followed = largest(20, following = true)
        json = Gson().toJson(EnvelopeDto(followed, null, PaginationDto(null, false)))
        assertTrue(json.toByteArray().size in 65537..524288)
        assertEquals(followed, wire.following(fixture.accountId, null).items)
        val found = largest(20, following = false)
        json = Gson().toJson(EnvelopeDto(found, null, PaginationDto(null, false)))
        assertEquals(found, wire.discover(fixture.accountId, "walkers", null, null).items)
        // The five pages a person may own still fit the default 64 KiB.
        val owned = largest(5, following = false).map { it.copy(canManage = true, etag = "\"p1\"") }
        json = Gson().toJson(EnvelopeDto(owned, null))
        assertTrue(json.toByteArray().size <= 65536)
        assertEquals(owned, wire.myPages(fixture.accountId))
    }
}
