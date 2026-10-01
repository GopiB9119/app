package com.community.platform.feature.community

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

val TOPICS = listOf("community", "education", "health", "local", "family", "events", "hobbies", "support", "news", "other")
val REPORT_REASONS = listOf("spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other")
val HANDLE_PATTERN = Regex("[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]")

data class PageDto(
    val id: String, val handle: String, val name: String, val description: String, val topic: String,
    @SerializedName("follower_count") val followerCount: Int, @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String, val following: Boolean, val blocked: Boolean,
    @SerializedName("can_manage") val canManage: Boolean, val etag: String?,
)

data class PostDto(
    val id: String, @SerializedName("page_id") val pageId: String, @SerializedName("page_handle") val pageHandle: String,
    @SerializedName("page_name") val pageName: String, val title: String?, val body: String, val status: String,
    @SerializedName("like_count") val likeCount: Int, @SerializedName("comment_count") val commentCount: Int,
    @SerializedName("created_at") val createdAt: String, @SerializedName("published_at") val publishedAt: String?,
    @SerializedName("edited_at") val editedAt: String?, val liked: Boolean, val saved: Boolean,
    @SerializedName("can_manage") val canManage: Boolean, val etag: String?,
)

data class CommentDto(
    val id: String, @SerializedName("post_id") val postId: String, @SerializedName("parent_id") val parentId: String?,
    @SerializedName("author_name") val authorName: String, val body: String?, val status: String,
    @SerializedName("created_at") val createdAt: String, val mine: Boolean, @SerializedName("can_remove") val canRemove: Boolean,
)

data class BlockDto(
    val id: String, @SerializedName("target_type") val targetType: String, @SerializedName("page_id") val pageId: String?,
    val label: String, @SerializedName("created_at") val createdAt: String,
)

data class ReportDto(
    val id: String, @SerializedName("target_type") val targetType: String, @SerializedName("target_id") val targetId: String,
    val reason: String, val status: String, @SerializedName("created_at") val createdAt: String,
)

data class OutcomeDto(val id: String, val status: String)
data class CreatePageDto(val handle: String, val name: String, val description: String, val topic: String)
data class CreatePostDto(val title: String?, val body: String)
data class CreateCommentDto(val body: String, @SerializedName("parent_id") val parentId: String? = null)
data class CreateReportDto(@SerializedName("target_type") val targetType: String, @SerializedName("target_id") val targetId: String, val reason: String, val details: String)
data class CreateBlockDto(@SerializedName("target_type") val targetType: String, @SerializedName("target_id") val targetId: String)
data class CommunityPage<Value>(val items: List<Value>, val nextCursor: String?)

/** A create command keeps one key for every retry, so a lost response cannot make a second page, post or comment. */
sealed interface CreateIntent {
    val accountId: String
    val key: String
    data class Page(override val accountId: String, override val key: String, val body: CreatePageDto) : CreateIntent
    data class Post(override val accountId: String, override val key: String, val pageId: String, val body: CreatePostDto) : CreateIntent
    data class Comment(override val accountId: String, override val key: String, val postId: String, val body: CreateCommentDto) : CreateIntent
}

interface CommunityApi {
    @GET("v1/feed") suspend fun feed(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/discover/posts") suspend fun latest(@Header("Authorization") authorization: String, @Query("q") query: String?, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/me/saved-posts") suspend fun saved(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/discover/pages") suspend fun discover(@Header("Authorization") authorization: String, @Query("q") query: String?, @Query("topic") topic: String?, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PageDto>>>
    @GET("v1/me/pages") suspend fun myPages(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<PageDto>>>
    @GET("v1/pages/{ref}") suspend fun page(@Header("Authorization") authorization: String, @Path("ref") reference: String): Response<EnvelopeDto<PageDto>>
    @GET("v1/pages/{ref}/posts") suspend fun pagePosts(@Header("Authorization") authorization: String, @Path("ref") reference: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/pages/{id}/drafts") suspend fun drafts(@Header("Authorization") authorization: String, @Path("id") pageId: String): Response<EnvelopeDto<List<PostDto>>>
    @POST("v1/pages") suspend fun createPage(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: CreatePageDto): Response<EnvelopeDto<PageDto>>
    @POST("v1/pages/{id}/{action}") suspend fun follow(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Path("action") action: String, @Body body: Map<String, String>): Response<EnvelopeDto<PageDto>>
    @POST("v1/pages/{id}/posts") suspend fun createPost(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Header("Idempotency-Key") key: String, @Body body: CreatePostDto): Response<EnvelopeDto<PostDto>>
    @GET("v1/posts/{id}") suspend fun post(@Header("Authorization") authorization: String, @Path("id") postId: String): Response<EnvelopeDto<PostDto>>
    @PATCH("v1/posts/{id}") suspend fun updatePost(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("If-Match") etag: String, @Body body: CreatePostDto): Response<EnvelopeDto<PostDto>>
    @POST("v1/posts/{id}/publish") suspend fun publish(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<PostDto>>
    @POST("v1/posts/{id}/delete") suspend fun deletePost(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<OutcomeDto>>
    @POST("v1/posts/{id}/{action}") suspend fun react(@Header("Authorization") authorization: String, @Path("id") postId: String, @Path("action") action: String, @Body body: Map<String, String>): Response<EnvelopeDto<PostDto>>
    @GET("v1/posts/{id}/comments") suspend fun comments(@Header("Authorization") authorization: String, @Path("id") postId: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 50): Response<EnvelopeDto<List<CommentDto>>>
    @POST("v1/posts/{id}/comments") suspend fun comment(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("Idempotency-Key") key: String, @Body body: CreateCommentDto): Response<EnvelopeDto<CommentDto>>
    @POST("v1/comments/{id}/delete") suspend fun endComment(@Header("Authorization") authorization: String, @Path("id") commentId: String, @Body body: Map<String, String>): Response<EnvelopeDto<CommentDto>>
    @POST("v1/reports") suspend fun report(@Header("Authorization") authorization: String, @Body body: CreateReportDto): Response<EnvelopeDto<ReportDto>>
    @GET("v1/me/blocks") suspend fun blocks(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<BlockDto>>>
    @POST("v1/blocks") suspend fun block(@Header("Authorization") authorization: String, @Body body: CreateBlockDto): Response<EnvelopeDto<BlockDto>>
    @POST("v1/blocks/{id}/remove") suspend fun unblock(@Header("Authorization") authorization: String, @Path("id") blockId: String, @Body body: Map<String, String>): Response<EnvelopeDto<OutcomeDto>>
}

@Singleton
class CommunityRepository @Inject constructor(private val api: CommunityApi, private val accounts: AccountRepository) {
    private fun invalid(message: String = "The service returned an unexpected community response."): Nothing = throw IdentityFailure("INVALID_RESPONSE", message)

    private fun <Value> validate(block: () -> Value): Value =
        try { block() }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int, empty: Boolean = false) = require((empty || value.isNotBlank()) && value.codePointCount(0, value.length) <= limit)

    fun page(value: PageDto): PageDto = validate {
        identifier(value.id)
        require(value.handle.matches(Regex("[a-z0-9][a-z0-9-]{1,28}[a-z0-9]")) && value.topic in TOPICS && value.followerCount >= 0)
        text(value.name, 80); text(value.description, 500, empty = true)
        require(value.canManage == (value.etag != null) && !(value.following && value.blocked))
        Instant.parse(value.createdAt); Instant.parse(value.updatedAt)
        value
    }

    fun post(value: PostDto): PostDto = validate {
        identifier(value.id); identifier(value.pageId)
        text(value.pageName, 80); value.title?.let { text(it, 120) }; text(value.body, 5000)
        require(value.status == "draft" || value.status == "published")
        require((value.status == "published") == (value.publishedAt != null) && (value.editedAt == null || value.status == "published"))
        require(value.canManage == (value.etag != null) && (value.status == "published" || value.canManage))
        require(value.likeCount >= 0 && value.commentCount >= 0)
        Instant.parse(value.createdAt); value.publishedAt?.let(Instant::parse); value.editedAt?.let(Instant::parse)
        value
    }

    fun comment(value: CommentDto, postId: String): CommentDto = validate {
        identifier(value.id); value.parentId?.let(::identifier)
        require(value.postId == postId && value.parentId != value.id)
        text(value.authorName, 80); value.body?.let { text(it, 2000) }
        require(value.status in setOf("visible", "deleted", "removed") && (value.status == "visible") == (value.body != null))
        require(!value.canRemove || value.status == "visible")
        Instant.parse(value.createdAt)
        value
    }

    private fun <Value> paged(response: Response<EnvelopeDto<List<Value>>>, cursor: String?, id: (Value) -> String, check: (Value) -> Value): CommunityPage<Value> {
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid("The list is incomplete.")
        validate {
            require(items.size <= 100 && items.map(id).distinct().size == items.size)
            require(pagination.hasMore == (pagination.nextCursor != null))
            pagination.nextCursor?.let { require(it.isNotBlank() && it.length <= 2048 && it != cursor && items.isNotEmpty()) }
        }
        return CommunityPage(items.map(check), pagination.nextCursor)
    }

    private fun published(value: PostDto) = post(value).also { if (it.status != "published") invalid() }

    suspend fun feed(accountId: String, cursor: String?) = accounts.authorized(accountId) { paged(api.feed(it, cursor), cursor, PostDto::id, ::published) }
    suspend fun latest(accountId: String, cursor: String?, query: String? = null) = accounts.authorized(accountId) { authorization ->
        val text = query?.trim()?.replace(Regex("\\s+"), " ")?.take(80)?.ifEmpty { null }
        paged(api.latest(authorization, text, cursor), cursor, PostDto::id, ::published)
    }
    suspend fun saved(accountId: String, cursor: String?) = accounts.authorized(accountId) {
        paged(api.saved(it, cursor), cursor, PostDto::id) { item -> published(item).also { post -> if (!post.saved) invalid() } }
    }
    suspend fun discover(accountId: String, query: String, topic: String?, cursor: String?) = accounts.authorized(accountId) { authorization ->
        val text = query.trim().replace(Regex("\\s+"), " ").take(80)
        paged(api.discover(authorization, text.ifEmpty { null }, topic, cursor), cursor, PageDto::id) { item ->
            page(item).also { if (it.blocked || (topic != null && it.topic != topic)) invalid() }
        }
    }
    suspend fun myPages(accountId: String): List<PageDto> = accounts.authorized(accountId) {
        accounts.result(api.myPages(it)).map(::page).also { pages -> if (pages.size > 5 || pages.any { page -> !page.canManage }) invalid() }
    }
    suspend fun page(accountId: String, reference: String): PageDto = accounts.authorized(accountId) {
        page(accounts.result(api.page(it, reference))).also { page -> if (page.id != reference && page.handle != reference.lowercase()) invalid() }
    }
    suspend fun pagePosts(accountId: String, pageId: String, cursor: String?) = accounts.authorized(accountId) {
        paged(api.pagePosts(it, pageId, cursor), cursor, PostDto::id) { item -> published(item).also { post -> if (post.pageId != pageId) invalid() } }
    }
    suspend fun drafts(accountId: String, pageId: String): List<PostDto> = accounts.authorized(accountId) {
        accounts.result(api.drafts(it, pageId)).map(::post).also { posts -> if (posts.any { post -> post.status != "draft" || post.pageId != pageId }) invalid() }
    }
    suspend fun post(accountId: String, postId: String): PostDto = accounts.authorized(accountId) {
        post(accounts.result(api.post(it, postId))).also { post -> if (post.id != postId) invalid() }
    }
    suspend fun comments(accountId: String, postId: String, cursor: String?) = accounts.authorized(accountId) {
        paged(api.comments(it, postId, cursor), cursor, CommentDto::id) { item -> comment(item, postId) }
    }
    suspend fun follow(accountId: String, pageId: String, follow: Boolean): PageDto = accounts.authorized(accountId) {
        page(accounts.result(api.follow(it, pageId, if (follow) "follow" else "unfollow", emptyMap()))).also { page ->
            if (page.id != pageId || page.following != follow) invalid("The follow change could not be confirmed.")
        }
    }
    suspend fun react(accountId: String, postId: String, action: String): PostDto = accounts.authorized(accountId) {
        require(action in setOf("like", "unlike", "save", "unsave"))
        post(accounts.result(api.react(it, postId, action, emptyMap()))).also { post ->
            val confirmed = when (action) { "like" -> post.liked; "unlike" -> !post.liked; "save" -> post.saved; else -> !post.saved }
            if (post.id != postId || !confirmed) invalid("The change could not be confirmed.")
        }
    }
    suspend fun create(intent: CreateIntent): Any = accounts.authorized(intent.accountId) { authorization ->
        when (intent) {
            is CreateIntent.Page -> page(accounts.result(api.createPage(authorization, intent.key, intent.body))).also {
                if (!it.canManage || it.handle != intent.body.handle) invalid("The new page could not be confirmed.")
            }
            is CreateIntent.Post -> post(accounts.result(api.createPost(authorization, intent.pageId, intent.key, intent.body))).also {
                if (it.pageId != intent.pageId || it.status != "draft" || !it.canManage) invalid("The draft could not be confirmed.")
            }
            is CreateIntent.Comment -> comment(accounts.result(api.comment(authorization, intent.postId, intent.key, intent.body)), intent.postId).also {
                if (!it.mine || it.status != "visible" || it.parentId != intent.body.parentId) invalid("The comment could not be confirmed.")
            }
        }
    }
    suspend fun publish(accountId: String, post: PostDto): PostDto = accounts.authorized(accountId) {
        post(accounts.result(api.publish(it, post.id, post.etag ?: invalid(), emptyMap()))).also { result ->
            if (result.id != post.id || result.status != "published") invalid("Publication could not be confirmed.")
        }
    }
    suspend fun deletePost(accountId: String, post: PostDto): OutcomeDto = accounts.authorized(accountId) {
        accounts.result(api.deletePost(it, post.id, post.etag ?: invalid(), emptyMap())).also { result ->
            if (result.id != post.id || result.status != "deleted") invalid("The deletion could not be confirmed.")
        }
    }
    suspend fun updatePost(accountId: String, post: PostDto, title: String?, body: String): PostDto = accounts.authorized(accountId) {
        post(accounts.result(api.updatePost(it, post.id, post.etag ?: invalid(), CreatePostDto(title, body)))).also { result ->
            if (result.id != post.id || result.status != post.status || !result.canManage) invalid("The edit could not be confirmed.")
        }
    }
    suspend fun endComment(accountId: String, comment: CommentDto): CommentDto = accounts.authorized(accountId) {
        comment(accounts.result(api.endComment(it, comment.id, emptyMap())), comment.postId).also { result ->
            if (result.id != comment.id || result.status == "visible") invalid("The removal could not be confirmed.")
        }
    }
    suspend fun report(accountId: String, targetType: String, targetId: String, reason: String, details: String): ReportDto = accounts.authorized(accountId) {
        require(reason in REPORT_REASONS)
        accounts.result(api.report(it, CreateReportDto(targetType, targetId, reason, details))).also { result ->
            if (result.targetType != targetType || result.targetId != targetId || result.status != "received" && result.status != "reviewing" && result.status != "closed") invalid()
        }
    }
    suspend fun blocks(accountId: String): List<BlockDto> = accounts.authorized(accountId) {
        accounts.result(api.blocks(it)).also { blocks ->
            validate { blocks.forEach { block -> identifier(block.id); text(block.label, 80); require((block.targetType == "page") == (block.pageId != null)) } }
        }
    }
    suspend fun block(accountId: String, targetType: String, targetId: String): BlockDto = accounts.authorized(accountId) {
        accounts.result(api.block(it, CreateBlockDto(targetType, targetId))).also { result ->
            if ((targetType == "page") != (result.targetType == "page") || (targetType == "page" && result.pageId != targetId)) invalid("The block could not be confirmed.")
        }
    }
    suspend fun unblock(accountId: String, blockId: String): OutcomeDto = accounts.authorized(accountId) {
        accounts.result(api.unblock(it, blockId, emptyMap())).also { if (it.id != blockId || it.status != "removed") invalid() }
    }
}
