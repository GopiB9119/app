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

/** The vocabulary's 20 topics (T126), used until GET /v1/taxonomy has loaded. */
val TOPICS = listOf(
    "technology", "education", "business", "science", "health", "family", "sports", "entertainment", "culture", "food",
    "travel", "lifestyle", "environment", "news", "local", "events", "hobbies", "support", "community", "other",
)

/** Topic codes the app accepts on a page: the bundled list, plus every topic the vocabulary has listed since it loaded. */
object KnownTopics {
    @Volatile var codes: Set<String> = TOPICS.toSet()
        private set
    fun add(more: Collection<String>) { codes = codes + more }
    operator fun contains(code: String) = code in codes
}
val REPORT_REASONS = listOf("spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other")
val HANDLE_PATTERN = Regex("[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]")

/** A page shows at most three pinned posts (DEC-025). */
const val MAX_PINNED_POSTS = 3

/** The server counts the 2,000 characters of page rules as code points (Python `len`). */
const val PAGE_RULES_LIMIT = 2000

/** A page has at most ten moderators (DEC-025). */
const val MAX_MODERATORS = 10

/** The states a page shows (DEC-025): archived pages are read only, and a deleted page reaches only its owner until it is erased. */
val PAGE_STATES = setOf("active", "read_only", "deleted")
val MODERATOR_STATES = setOf("pending", "active", "declined", "cancelled", "withdrawn", "removed", "stepped_down", "expired", "invalidated")
val HANDOVER_STATES = setOf("pending", "accepted", "declined", "cancelled", "expired", "invalidated")

/**
 * [rules] is null only from a server that does not send rules; the screens treat that as no rules.
 * [status] is null only from a server without page states, and then means active. [purgeAfter] reaches only the owner of a deleted page.
 */
data class PageDto(
    val id: String, val handle: String, val name: String, val description: String, val topic: String,
    @SerializedName("follower_count") val followerCount: Int, @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String, val following: Boolean, val blocked: Boolean,
    @SerializedName("can_manage") val canManage: Boolean, val etag: String?, val rules: String? = null,
    val moderation: ModerationMarkDto? = null, val status: String? = null, @SerializedName("purge_after") val purgeAfter: String? = null,
    val classification: ClassificationDto? = null,
    val limited: Boolean = false, val limit: PageLimitDto? = null,
) {
    val readOnly: Boolean get() = status == "read_only"
    /** A platform moderator limited or hid the page (DEC-040): nothing new can be published or commented. */
    val paused: Boolean get() = limited || moderation?.hidden == true
    val deleted: Boolean get() = status == "deleted"
    /** Nothing new can be posted, commented, liked, followed or pinned unless the page is active. */
    val writable: Boolean get() = status == null || status == "active"
}

/** A person invited to moderate one of your pages, or who moderates it now. Public views never show moderators. */
data class ModeratorDto(
    val id: String, @SerializedName("page_id") val pageId: String, @SerializedName("account_id") val accountId: String,
    @SerializedName("display_name") val displayName: String, val status: String, @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String?, @SerializedName("resolved_at") val resolvedAt: String?, val etag: String,
)

/** Your own invitation to moderate a page, or a page you moderate. */
data class ModeratorRoleDto(
    val id: String, @SerializedName("page_id") val pageId: String, @SerializedName("page_handle") val pageHandle: String,
    @SerializedName("page_name") val pageName: String, val status: String, @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String?, @SerializedName("resolved_at") val resolvedAt: String?, val etag: String,
)

/** An offer to hand a page over to one of its moderators. It lasts 15 minutes. */
data class HandoverDto(
    val id: String, @SerializedName("page_id") val pageId: String, @SerializedName("page_handle") val pageHandle: String,
    @SerializedName("page_name") val pageName: String, @SerializedName("from_account_id") val fromAccountId: String,
    @SerializedName("from_name") val fromName: String, @SerializedName("to_account_id") val toAccountId: String,
    @SerializedName("to_name") val toName: String, val status: String, @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String?, @SerializedName("resolved_at") val resolvedAt: String?, val etag: String,
)

data class PostDto(
    val id: String, @SerializedName("page_id") val pageId: String, @SerializedName("page_handle") val pageHandle: String,
    @SerializedName("page_name") val pageName: String, val title: String?, val body: String, val status: String,
    @SerializedName("like_count") val likeCount: Int, @SerializedName("comment_count") val commentCount: Int,
    @SerializedName("created_at") val createdAt: String, @SerializedName("published_at") val publishedAt: String?,
    @SerializedName("edited_at") val editedAt: String?, val liked: Boolean, val saved: Boolean,
    @SerializedName("can_manage") val canManage: Boolean, val etag: String?, val pinned: Boolean = false,
    val moderation: ModerationMarkDto? = null,
    @SerializedName("page_status") val pageStatus: String? = null,
    /** The post's own topic and interest codes, in order. Null only before validation, from a server that does not send them. */
    val topics: List<String>? = emptyList(), val interests: List<String>? = emptyList(),
    @SerializedName("page_limited") val pageLimited: Boolean = false,
) {
    val pageWritable: Boolean get() = pageStatus == null || pageStatus == "active"
    /** Nobody comments on a post of a limited page (DEC-040); likes and saves stay. */
    val commentsOpen: Boolean get() = pageWritable && !pageLimited
}

/** A post has at most three topics and five interests (DEC-036). */
const val POST_TOPICS_LIMIT = 3
const val POST_INTERESTS_LIMIT = 5

data class CommentDto(
    val id: String, @SerializedName("post_id") val postId: String, @SerializedName("parent_id") val parentId: String?,
    @SerializedName("author_name") val authorName: String, val body: String?, val status: String,
    @SerializedName("created_at") val createdAt: String, val mine: Boolean, @SerializedName("can_remove") val canRemove: Boolean,
    val moderation: ModerationMarkDto? = null,
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
data class CreatePostDto(val title: String?, val body: String, val topics: List<String> = emptyList(), val interests: List<String> = emptyList())
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
    /** Invites the account [inviteeId] to moderate the page. */
    data class Moderator(override val accountId: String, override val key: String, val pageId: String, val inviteeId: String) : CreateIntent
    /** Offers the page, as reviewed at [etag], to its moderator [toAccountId]. */
    data class Handover(override val accountId: String, override val key: String, val pageId: String, val etag: String, val toAccountId: String, val toName: String) : CreateIntent
}

interface CommunityApi {
    @GET("v1/feed") suspend fun feed(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/discover/posts") suspend fun latest(@Header("Authorization") authorization: String, @Query("q") query: String?, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/me/saved-posts") suspend fun saved(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/discover/pages") suspend fun discover(@Header("Authorization") authorization: String, @Query("q") query: String?, @Query("topic") topic: String?, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PageDto>>>
    @GET("v1/me/pages") suspend fun myPages(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<PageDto>>>
    @GET("v1/me/following") suspend fun following(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PageDto>>>
    @GET("v1/pages/{ref}") suspend fun page(@Header("Authorization") authorization: String, @Path("ref") reference: String): Response<EnvelopeDto<PageDto>>
    @PATCH("v1/pages/{id}") suspend fun updatePage(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<PageDto>>
    @GET("v1/pages/{ref}/posts") suspend fun pagePosts(@Header("Authorization") authorization: String, @Path("ref") reference: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/pages/{ref}/pinned-posts") suspend fun pinnedPosts(@Header("Authorization") authorization: String, @Path("ref") reference: String): Response<EnvelopeDto<List<PostDto>>>
    @GET("v1/pages/{id}/drafts") suspend fun drafts(@Header("Authorization") authorization: String, @Path("id") pageId: String): Response<EnvelopeDto<List<PostDto>>>
    @POST("v1/pages") suspend fun createPage(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: CreatePageDto): Response<EnvelopeDto<PageDto>>
    @POST("v1/pages/{id}/{action}") suspend fun follow(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Path("action") action: String, @Body body: Map<String, String>): Response<EnvelopeDto<PageDto>>
    @POST("v1/pages/{id}/posts") suspend fun createPost(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Header("Idempotency-Key") key: String, @Body body: CreatePostDto): Response<EnvelopeDto<PostDto>>
    @GET("v1/posts/{id}") suspend fun post(@Header("Authorization") authorization: String, @Path("id") postId: String): Response<EnvelopeDto<PostDto>>
    @PATCH("v1/posts/{id}") suspend fun updatePost(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("If-Match") etag: String, @Body body: Map<String, String?>): Response<EnvelopeDto<PostDto>>
    /** The same edit, also carrying the post's topic or interest list when either changed. */
    @PATCH("v1/posts/{id}") suspend fun updatePostTerms(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("If-Match") etag: String, @Body body: Map<String, @JvmSuppressWildcards Any?>): Response<EnvelopeDto<PostDto>>
    @POST("v1/posts/{id}/publish") suspend fun publish(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<PostDto>>
    @POST("v1/posts/{id}/delete") suspend fun deletePost(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<OutcomeDto>>
    @POST("v1/posts/{id}/{action}") suspend fun react(@Header("Authorization") authorization: String, @Path("id") postId: String, @Path("action") action: String, @Body body: Map<String, String>): Response<EnvelopeDto<PostDto>>
    @POST("v1/posts/{id}/{action}") suspend fun pin(@Header("Authorization") authorization: String, @Path("id") postId: String, @Path("action") action: String, @Body body: Map<String, String>): Response<EnvelopeDto<PostDto>>
    @GET("v1/posts/{id}/comments") suspend fun comments(@Header("Authorization") authorization: String, @Path("id") postId: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 50): Response<EnvelopeDto<List<CommentDto>>>
    @POST("v1/posts/{id}/comments") suspend fun comment(@Header("Authorization") authorization: String, @Path("id") postId: String, @Header("Idempotency-Key") key: String, @Body body: CreateCommentDto): Response<EnvelopeDto<CommentDto>>
    @POST("v1/comments/{id}/delete") suspend fun endComment(@Header("Authorization") authorization: String, @Path("id") commentId: String, @Body body: Map<String, String>): Response<EnvelopeDto<CommentDto>>
    @POST("v1/reports") suspend fun report(@Header("Authorization") authorization: String, @Body body: CreateReportDto): Response<EnvelopeDto<ReportDto>>
    @GET("v1/me/blocks") suspend fun blocks(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<BlockDto>>>
    @POST("v1/blocks") suspend fun block(@Header("Authorization") authorization: String, @Body body: CreateBlockDto): Response<EnvelopeDto<BlockDto>>
    @POST("v1/blocks/{id}/remove") suspend fun unblock(@Header("Authorization") authorization: String, @Path("id") blockId: String, @Body body: Map<String, String>): Response<EnvelopeDto<OutcomeDto>>
    @GET("v1/pages/{id}/moderators") suspend fun moderators(@Header("Authorization") authorization: String, @Path("id") pageId: String): Response<EnvelopeDto<List<ModeratorDto>>>
    @POST("v1/pages/{id}/moderators") suspend fun inviteModerator(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Header("Idempotency-Key") key: String, @Body body: Map<String, String>): Response<EnvelopeDto<ModeratorDto>>
    @POST("v1/pages/{id}/moderators/{moderator}/{action}") suspend fun resolveModerator(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Path("moderator") moderatorId: String, @Path("action") action: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<ModeratorDto>>
    @GET("v1/me/moderator-roles") suspend fun moderatorRoles(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<ModeratorRoleDto>>>
    @POST("v1/pages/{id}/handover") suspend fun offerHandover(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<HandoverDto>>
    @GET("v1/pages/{id}/handover") suspend fun handover(@Header("Authorization") authorization: String, @Path("id") pageId: String): Response<EnvelopeDto<HandoverDto>>
    @GET("v1/me/handover-offers") suspend fun handoverOffers(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<HandoverDto>>>
    @POST("v1/pages/{id}/handover/{offer}/{action}") suspend fun respondHandover(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Path("offer") offerId: String, @Path("action") action: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<HandoverDto>>
    @POST("v1/pages/{id}/{action}") suspend fun pageState(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Path("action") action: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<PageDto>>
}

@Singleton
class CommunityRepository @Inject constructor(private val api: CommunityApi, internal val accounts: AccountRepository) {
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
        require(value.handle.matches(Regex("[a-z0-9][a-z0-9-]{1,28}[a-z0-9]")) && value.topic in KnownTopics && value.followerCount >= 0)
        value.classification?.let { classification ->
            ClassificationPart.entries.forEach { part ->
                val codes = classification.codes(part)
                require(codes.size <= part.limit && codes.distinct().size == codes.size && codes.all(::isCode))
            }
        }
        text(value.name, 80); text(value.description, 500, empty = true); value.rules?.let { text(it, PAGE_RULES_LIMIT, empty = true) }
        require(value.canManage == (value.etag != null) && !(value.following && value.blocked))
        Instant.parse(value.createdAt); Instant.parse(value.updatedAt)
        value.moderation?.let { require(it.hidden && it.reason in REPORT_REASONS) }
        value.limit?.let { require(value.limited && value.canManage && it.reason in REPORT_REASONS) }
        // Only the owner sees a deleted page, with the time it will be erased.
        require((value.status == null || value.status in PAGE_STATES) && (!value.deleted || value.canManage) && (value.purgeAfter == null || value.deleted))
        value.purgeAfter?.let(Instant::parse)
        value
    }

    private fun handle(value: String) = require(value.matches(Regex("[a-z0-9][a-z0-9-]{1,28}[a-z0-9]")))
    private fun times(created: String, expires: String?, resolved: String?) { Instant.parse(created); expires?.let(Instant::parse); resolved?.let(Instant::parse) }
    private fun tag(value: String) = require(value.isNotBlank() && value.length <= 200)

    fun moderator(value: ModeratorDto, pageId: String): ModeratorDto = validate {
        identifier(value.id); identifier(value.accountId); require(value.pageId == pageId)
        text(value.displayName, 80); tag(value.etag)
        require(value.status in MODERATOR_STATES && (value.status != "pending" || value.expiresAt != null))
        times(value.createdAt, value.expiresAt, value.resolvedAt)
        value
    }

    fun role(value: ModeratorRoleDto): ModeratorRoleDto = validate {
        identifier(value.id); identifier(value.pageId); handle(value.pageHandle)
        text(value.pageName, 80); tag(value.etag)
        require(value.status in MODERATOR_STATES && (value.status != "pending" || value.expiresAt != null))
        times(value.createdAt, value.expiresAt, value.resolvedAt)
        value
    }

    fun handover(value: HandoverDto, pageId: String): HandoverDto = validate {
        identifier(value.id); identifier(value.fromAccountId); identifier(value.toAccountId); handle(value.pageHandle)
        require(value.pageId == pageId && value.fromAccountId != value.toAccountId)
        text(value.pageName, 80); text(value.fromName, 80); text(value.toName, 80); tag(value.etag)
        require(value.status in HANDOVER_STATES && (value.status != "pending" || value.expiresAt != null))
        times(value.createdAt, value.expiresAt, value.resolvedAt)
        value
    }

    fun post(value: PostDto): PostDto = validate {
        identifier(value.id); identifier(value.pageId)
        text(value.pageName, 80); value.title?.let { text(it, 120) }; text(value.body, 5000)
        require(value.status == "draft" || value.status == "published")
        require(value.pageStatus == null || value.pageStatus in PAGE_STATES)
        require((value.status == "published") == (value.publishedAt != null) && (value.editedAt == null || value.status == "published"))
        require(value.canManage == (value.etag != null) && (value.status == "published" || value.canManage))
        require(!value.pinned || value.status == "published")
        require(value.likeCount >= 0 && value.commentCount >= 0)
        Instant.parse(value.createdAt); value.publishedAt?.let(Instant::parse); value.editedAt?.let(Instant::parse)
        value.moderation?.let { require(it.hidden && it.reason in REPORT_REASONS) }
        val topics = value.topics.orEmpty()
        val interests = value.interests.orEmpty()
        require(postTerms(topics, POST_TOPICS_LIMIT) && postTerms(interests, POST_INTERESTS_LIMIT))
        value.copy(topics = topics, interests = interests)
    }

    private fun postTerms(codes: List<String>, limit: Int) = codes.size <= limit && codes.distinct().size == codes.size && codes.all(::isCode)

    fun comment(value: CommentDto, postId: String): CommentDto = validate {
        identifier(value.id); value.parentId?.let(::identifier)
        require(value.postId == postId && value.parentId != value.id)
        text(value.authorName, 80); value.body?.let { text(it, 2000) }
        require(value.status in setOf("visible", "deleted", "removed") && (value.status == "visible") == (value.body != null))
        require(!value.canRemove || value.status == "visible")
        Instant.parse(value.createdAt)
        value.moderation?.let { require(it.hidden && it.reason in REPORT_REASONS) }
        value
    }

    private fun <Value> paged(response: Response<EnvelopeDto<List<Value>>>, cursor: String?, id: (Value) -> String, check: (Value) -> Value): CommunityPage<Value> {
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid("The list is incomplete.")
        // A next cursor equal to the one sent would return the same page again, as on the web.
        if (cursor != null && pagination.nextCursor == cursor) invalid("The list is incomplete.")
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
            // A topic matches a page's main topic or one of its other topics.
            page(item).also { if (it.blocked || (topic != null && it.topic != topic && topic !in it.classification?.otherTopics.orEmpty())) invalid() }
        }
    }
    suspend fun myPages(accountId: String): List<PageDto> = accounts.authorized(accountId) {
        accounts.result(api.myPages(it)).map(::page).also { pages -> if (pages.size > 5 || pages.any { page -> !page.canManage }) invalid() }
    }
    suspend fun following(accountId: String, cursor: String?) = accounts.authorized(accountId) {
        paged(api.following(it, cursor), cursor, PageDto::id) { item -> page(item).also { page -> if (!page.following) invalid() } }
    }
    suspend fun page(accountId: String, reference: String): PageDto = accounts.authorized(accountId) {
        page(accounts.result(api.page(it, reference))).also { page -> if (page.id != reference && page.handle != reference.lowercase()) invalid() }
    }
    suspend fun pagePosts(accountId: String, pageId: String, cursor: String?) = accounts.authorized(accountId) {
        paged(api.pagePosts(it, pageId, cursor), cursor, PostDto::id) { item -> published(item).also { post -> if (post.pageId != pageId) invalid() } }
    }
    /** The page's pinned posts, latest pin first. Each also stays in the page's date-ordered list. */
    suspend fun pinnedPosts(accountId: String, pageId: String): List<PostDto> = accounts.authorized(accountId) {
        accounts.result(api.pinnedPosts(it, pageId)).map(::published).also { posts ->
            if (posts.size > MAX_PINNED_POSTS || posts.map(PostDto::id).distinct().size != posts.size || posts.any { post -> !post.pinned || post.pageId != pageId }) invalid()
        }
    }
    /** Pins a published post to the top of its page, or unpins it; shown as done only when the server confirms it. */
    suspend fun pin(accountId: String, postId: String, pin: Boolean): PostDto = accounts.authorized(accountId) {
        post(accounts.result(api.pin(it, postId, if (pin) "pin" else "unpin", emptyMap()))).also { post ->
            if (post.id != postId || post.pinned != pin) invalid("The change could not be confirmed.")
        }
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
    /** Sends only the changed fields, against the version tag of the page as the editor opened it. */
    suspend fun updatePage(accountId: String, opened: PageDto, changes: Map<String, String>): PageDto = accounts.authorized(accountId) {
        if (!opened.canManage || opened.etag == null || changes.isEmpty()) invalid()
        require(changes.isNotEmpty() && setOf("name", "description", "topic", "rules").containsAll(changes.keys) && (changes["topic"] ?: TOPICS.first()) in KnownTopics)
        page(accounts.result(api.updatePage(it, opened.id, opened.etag ?: invalid(), changes))).also { result ->
            if (result.id != opened.id || result.handle != opened.handle || !result.canManage) invalid("The page change could not be confirmed.")
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
                if (it.pageId != intent.pageId || it.status != "draft" || !it.canManage || it.topics != intent.body.topics || it.interests != intent.body.interests) invalid("The draft could not be confirmed.")
            }
            is CreateIntent.Comment -> comment(accounts.result(api.comment(authorization, intent.postId, intent.key, intent.body)), intent.postId).also {
                if (!it.mine || it.status != "visible" || it.parentId != intent.body.parentId) invalid("The comment could not be confirmed.")
            }
            // A retry with the same key returns the original invitation or offer, whatever has happened to it since.
            is CreateIntent.Moderator -> moderator(accounts.result(api.inviteModerator(authorization, intent.pageId, intent.key, mapOf("account_id" to intent.inviteeId))), intent.pageId).also {
                if (it.accountId != intent.inviteeId) invalid("The invitation could not be confirmed.")
            }
            is CreateIntent.Handover -> handover(accounts.result(api.offerHandover(authorization, intent.pageId, intent.key, intent.etag, mapOf("to_account_id" to intent.toAccountId))), intent.pageId).also {
                if (it.toAccountId != intent.toAccountId) invalid("The handover offer could not be confirmed.")
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
    /** Sends only the fields that differ from [opened], the post as the editor opened it, against that version's tag. A removed title is sent as null. */
    /** [topics] and [interests] are sent only when they differ from the opened post's, so an unchanged retired term is never sent again; an empty list removes them all. */
    suspend fun updatePost(accountId: String, opened: PostDto, title: String?, body: String, topics: List<String>? = null, interests: List<String>? = null): PostDto = accounts.authorized(accountId) {
        val changes = buildMap<String, String?> {
            if (title != opened.title) put("title", title)
            if (body != opened.body) put("body", body)
        }
        val lists = buildMap<String, List<String>> {
            if (topics != null && topics != opened.topics.orEmpty()) put("topics", topics)
            if (interests != null && interests != opened.interests.orEmpty()) put("interests", interests)
        }
        if (changes.isEmpty() && lists.isEmpty()) invalid()
        validate { require(postTerms(lists["topics"].orEmpty(), POST_TOPICS_LIMIT) && postTerms(lists["interests"].orEmpty(), POST_INTERESTS_LIMIT)) }
        val etag = opened.etag ?: invalid()
        val response = if (lists.isEmpty()) api.updatePost(it, opened.id, etag, changes) else api.updatePostTerms(it, opened.id, etag, changes + lists)
        post(accounts.result(response)).also { result ->
            if (result.id != opened.id || result.status != opened.status || !result.canManage ||
                lists["topics"]?.let { sent -> result.topics != sent } == true || lists["interests"]?.let { sent -> result.interests != sent } == true) invalid("The edit could not be confirmed.")
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

    /** The page's moderators and its waiting invitation; only the owner may ask. */
    suspend fun moderators(accountId: String, pageId: String): List<ModeratorDto> = accounts.authorized(accountId) {
        accounts.result(api.moderators(it, pageId)).map { row -> moderator(row, pageId) }.also { rows ->
            if (rows.size > MAX_MODERATORS + 1 || rows.map(ModeratorDto::id).distinct().size != rows.size || rows.any { row -> row.status != "pending" && row.status != "active" }) invalid()
        }
    }
    /** Your waiting invitations to moderate a page, and the pages you moderate. */
    suspend fun moderatorRoles(accountId: String): List<ModeratorRoleDto> = accounts.authorized(accountId) {
        accounts.result(api.moderatorRoles(it)).map(::role).also { rows ->
            if (rows.map(ModeratorRoleDto::id).distinct().size != rows.size || rows.any { row -> row.status != "pending" && row.status != "active" }) invalid()
        }
    }
    /**
     * The invited person accepts, declines or steps down; the owner withdraws an invitation or removes a moderator.
     * Each is sent against the version as reviewed, and is shown as done only when the server confirms the outcome.
     */
    suspend fun resolveModerator(accountId: String, pageId: String, moderatorId: String, etag: String, action: String): ModeratorDto = accounts.authorized(accountId) {
        val outcome = MODERATOR_OUTCOMES[action] ?: invalid()
        moderator(accounts.result(api.resolveModerator(it, pageId, moderatorId, action, etag, emptyMap())), pageId).also { row ->
            if (row.id != moderatorId || row.status != outcome) invalid("The change could not be confirmed.")
        }
    }
    /** The page's latest handover offer, for the owner who made it or the moderator it was made to; null when there is none. */
    suspend fun handover(accountId: String, pageId: String): HandoverDto? = accounts.authorized(accountId) {
        val response = api.handover(it, pageId)
        if (response.code() == 404) null else handover(accounts.result(response), pageId)
    }
    /** Pages offered to you that you can still accept. */
    suspend fun handoverOffers(accountId: String): List<HandoverDto> = accounts.authorized(accountId) {
        accounts.result(api.handoverOffers(it)).map { offer -> handover(offer, offer.pageId) }.also { offers ->
            if (offers.map(HandoverDto::id).distinct().size != offers.size || offers.any { offer -> offer.status != "pending" }) invalid()
        }
    }
    /** The moderator accepts or declines an offer; the owner cancels it. */
    suspend fun respondHandover(accountId: String, offer: HandoverDto, action: String): HandoverDto = accounts.authorized(accountId) {
        val outcome = HANDOVER_OUTCOMES[action] ?: invalid()
        handover(accounts.result(api.respondHandover(it, offer.pageId, offer.id, action, offer.etag, emptyMap())), offer.pageId).also { result ->
            if (result.id != offer.id || result.status != outcome) invalid("The change could not be confirmed.")
        }
    }
    /**
     * Archives the page (read only), restores it, or deletes it, against the version as reviewed.
     * Deleting needs [confirm], the page's name typed exactly; restoring a deleted page brings back the state it had.
     */
    suspend fun changePageState(accountId: String, page: PageDto, action: String, confirm: String? = null): PageDto = accounts.authorized(accountId) {
        if (action !in setOf("archive", "restore", "delete") || (action == "delete") != (confirm != null)) invalid()
        page(accounts.result(api.pageState(it, page.id, action, page.etag ?: invalid(), confirm?.let { name -> mapOf("confirm" to name) } ?: emptyMap()))).also { result ->
            val confirmed = when (action) {
                "archive" -> result.readOnly
                "delete" -> result.deleted && result.purgeAfter != null
                else -> !result.deleted && (page.deleted || !result.readOnly)
            }
            if (result.id != page.id || !result.canManage || !confirmed) invalid("The change could not be confirmed.")
        }
    }
}

private val MODERATOR_OUTCOMES = mapOf("accept" to "active", "decline" to "declined", "withdraw" to "withdrawn", "remove" to "removed", "step-down" to "stepped_down")
private val HANDOVER_OUTCOMES = mapOf("accept" to "accepted", "decline" to "declined", "cancel" to "cancelled")
