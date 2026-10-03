package com.community.platform.feature.community

import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import java.io.IOException
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** What a feed control does (DEC-037): mute a page or a topic or interest, or mark a post or a suggested page Not interested. */
val FEED_CONTROL_KINDS = setOf("mute_page", "mute_term", "hide_post", "hide_suggestion")
private val MUTED_DIMENSIONS = setOf("topic", "interest")

/** DEC-037's limits added together: 200 pages, 100 terms, 1,000 posts and 500 suggestions. */
const val FEED_CONTROLS_LIMIT = 1800

/** One of your mutes or Not interested marks. Private to you. A page or post no longer shown has no name or title. */
data class FeedControlDto(
    val id: String, val kind: String, @SerializedName("page_id") val pageId: String? = null, @SerializedName("page_handle") val pageHandle: String? = null,
    @SerializedName("page_name") val pageName: String? = null, @SerializedName("post_id") val postId: String? = null,
    @SerializedName("post_title") val postTitle: String? = null, @SerializedName("post_available") val postAvailable: Boolean? = null,
    val dimension: String? = null, val code: String? = null, @SerializedName("created_at") val createdAt: String,
)

/** Exactly the fields its kind needs; the others stay null and are left out of the body. */
data class AddFeedControlDto(
    val kind: String, @SerializedName("page_id") val pageId: String? = null, @SerializedName("post_id") val postId: String? = null,
    val dimension: String? = null, val code: String? = null,
) {
    companion object {
        fun mutePage(pageId: String) = AddFeedControlDto("mute_page", pageId = pageId)
        fun hideSuggestion(pageId: String) = AddFeedControlDto("hide_suggestion", pageId = pageId)
        fun hidePost(postId: String) = AddFeedControlDto("hide_post", postId = postId)
        fun muteTerm(dimension: String, code: String) = AddFeedControlDto("mute_term", dimension = dimension, code = code)
    }
}

interface FeedControlsApi {
    @GET("v1/me/feed-controls") suspend fun controls(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<FeedControlDto>>>
    @POST("v1/me/feed-controls") suspend fun add(@Header("Authorization") authorization: String, @Body body: AddFeedControlDto): Response<EnvelopeDto<FeedControlDto>>
    @POST("v1/me/feed-controls/{id}/remove") suspend fun remove(@Header("Authorization") authorization: String, @Path("id") controlId: String, @Body body: Map<String, String>): Response<EnvelopeDto<OutcomeDto>>
}

/** Stands in where no feed-controls service is wired, such as a test of the older community screens: nothing is sent. */
object UnavailableFeedControlsApi : FeedControlsApi {
    private fun none(): Nothing = throw IOException("Feed controls are not available.")
    override suspend fun controls(authorization: String) = none()
    override suspend fun add(authorization: String, body: AddFeedControlDto) = none()
    override suspend fun remove(authorization: String, controlId: String, body: Map<String, String>) = none()
}

@Singleton
class FeedControlsRepository @Inject constructor(private val api: FeedControlsApi, private val community: CommunityRepository) {
    private val accounts get() = community.accounts

    val available: Boolean get() = api !== UnavailableFeedControlsApi

    private fun invalid(message: String = "The service returned an unexpected community response."): Nothing = throw IdentityFailure("INVALID_RESPONSE", message)

    private fun identifier(value: String?) = require(value != null && UUID.fromString(value).toString().equals(value, ignoreCase = true))

    /** Checks that the control names what its kind needs and nothing else. */
    fun control(value: FeedControlDto): FeedControlDto = try {
        identifier(value.id)
        require(value.kind in FEED_CONTROL_KINDS)
        Instant.parse(value.createdAt)
        value.pageHandle?.let { require(it.matches(Regex("[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"))) }
        value.pageName?.let { require(it.isNotBlank() && it.codePointCount(0, it.length) <= 80) }
        value.postTitle?.let { require(it.codePointCount(0, it.length) <= 120) }
        when (value.kind) {
            "mute_page", "hide_suggestion" -> {
                identifier(value.pageId)
                require(value.postId == null && value.dimension == null && value.code == null && value.postAvailable == null && value.postTitle == null)
            }
            "hide_post" -> {
                identifier(value.postId); value.pageId?.let(::identifier)
                require(value.postAvailable != null && value.dimension == null && value.code == null)
            }
            else -> require(value.dimension in MUTED_DIMENSIONS && value.code != null && isCode(value.code) &&
                value.pageId == null && value.postId == null && value.postAvailable == null && value.pageName == null && value.postTitle == null)
        }
        value
    } catch (_error: IllegalArgumentException) { invalid() } catch (_error: NullPointerException) { invalid() } catch (_error: DateTimeException) { invalid() }

    /** Your mutes and Not interested marks, newest first. */
    suspend fun controls(accountId: String): List<FeedControlDto> = accounts.authorized(accountId) {
        accounts.result(api.controls(it)).map(::control).also { list ->
            if (list.size > FEED_CONTROLS_LIMIT || list.map(FeedControlDto::id).distinct().size != list.size) invalid()
        }
    }

    /** Adds a control; repeating it returns the same one. Shown as done only when the server returns what was asked for. */
    suspend fun add(accountId: String, request: AddFeedControlDto): FeedControlDto = accounts.authorized(accountId) { authorization ->
        val shape = when (request.kind) {
            "mute_page", "hide_suggestion" -> request.pageId != null && request.postId == null && request.dimension == null && request.code == null
            "hide_post" -> request.postId != null && request.pageId == null && request.dimension == null && request.code == null
            "mute_term" -> request.dimension in MUTED_DIMENSIONS && request.code?.let(::isCode) == true && request.pageId == null && request.postId == null
            else -> false
        }
        if (!shape) invalid("This cannot be muted or hidden.")
        control(accounts.result(api.add(authorization, request))).also { result ->
            val matches = result.kind == request.kind && when (request.kind) {
                "hide_post" -> result.postId == request.postId
                "mute_term" -> result.dimension == request.dimension && result.code == request.code
                else -> result.pageId == request.pageId
            }
            if (!matches) invalid("The change could not be confirmed.")
        }
    }

    /** Takes a control back. One already removed (404) counts as removed. */
    suspend fun remove(accountId: String, controlId: String): OutcomeDto = accounts.authorized(accountId) { authorization ->
        val response = api.remove(authorization, controlId, emptyMap())
        if (response.code() == 404) OutcomeDto(controlId, "removed")
        else accounts.result(response).also { if (it.id != controlId || it.status != "removed") invalid("The change could not be confirmed.") }
    }
}
