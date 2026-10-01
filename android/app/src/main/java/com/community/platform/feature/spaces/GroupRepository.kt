package com.community.platform.feature.spaces

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class SpaceDirectoryEntryDto(
    val id: String,
    val name: String,
    val description: String,
    @SerializedName("member_count") val memberCount: Int,
    @SerializedName("viewer_role") val viewerRole: String?,
    @SerializedName("pending_request_id") val pendingRequestId: String?,
    @SerializedName("can_request") val canRequest: Boolean,
)

data class JoinRequestDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    val note: String,
    val status: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String,
    @SerializedName("resolved_at") val resolvedAt: String?,
)

data class JoinReviewDto(
    val id: String,
    @SerializedName("account_id") val accountId: String,
    @SerializedName("display_name") val displayName: String,
    val note: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String,
)

data class CreateJoinRequestDto(val note: String)
data class VisibilityChangeDto(val visibility: String)
data class JoinIntent(val accountId: String, val spaceId: String, val spaceName: String, val note: String, val requestKey: String)
data class VisibilityIntent(val accountId: String, val spaceId: String, val visibility: String, val etag: String, val requestKey: String)

interface GroupApi {
    @GET("v1/discover/spaces")
    suspend fun directory(@Header("Authorization") authorization: String, @Query("q") query: String?, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<SpaceDirectoryEntryDto>>>

    @POST("v1/spaces/{id}/join-requests")
    suspend fun ask(@Header("Authorization") authorization: String, @Path("id") spaceId: String, @Header("Idempotency-Key") key: String, @Body body: CreateJoinRequestDto): Response<EnvelopeDto<JoinRequestDto>>

    @POST("v1/space-join-requests/{id}/cancel")
    suspend fun cancel(@Header("Authorization") authorization: String, @Path("id") requestId: String, @Body body: Map<String, String>): Response<EnvelopeDto<JoinRequestDto>>

    @GET("v1/me/space-join-requests")
    suspend fun mine(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<JoinRequestDto>>>

    @GET("v1/spaces/{id}/join-requests")
    suspend fun pending(@Header("Authorization") authorization: String, @Path("id") spaceId: String): Response<EnvelopeDto<List<JoinReviewDto>>>

    @POST("v1/spaces/{id}/join-requests/{requestId}/approve")
    suspend fun approve(@Header("Authorization") authorization: String, @Path("id") spaceId: String, @Path("requestId") requestId: String, @Body body: Map<String, String>): Response<EnvelopeDto<JoinRequestDto>>

    @POST("v1/spaces/{id}/join-requests/{requestId}/decline")
    suspend fun decline(@Header("Authorization") authorization: String, @Path("id") spaceId: String, @Path("requestId") requestId: String, @Body body: Map<String, String>): Response<EnvelopeDto<JoinRequestDto>>

    @GET("v1/spaces/{id}")
    suspend fun space(@Header("Authorization") authorization: String, @Path("id") spaceId: String): Response<EnvelopeDto<SpaceDto>>

    @GET("v1/spaces/{id}/settings")
    suspend fun settings(@Header("Authorization") authorization: String, @Path("id") spaceId: String): Response<EnvelopeDto<SpaceSettingsDto>>

    @POST("v1/spaces/{id}/visibility")
    suspend fun visibility(@Header("Authorization") authorization: String, @Path("id") spaceId: String, @Header("If-Match") etag: String, @Header("Idempotency-Key") key: String, @Body body: VisibilityChangeDto): Response<EnvelopeDto<SpaceSettingsDto>>
}

data class GroupPage(val items: List<SpaceDirectoryEntryDto>, val nextCursor: String?)

@Singleton
class GroupRepository @Inject constructor(private val api: GroupApi, private val accounts: AccountRepository) {
    private val statuses = setOf("pending", "approved", "declined", "cancelled", "closed", "expired")

    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected group response.")

    private fun <Value> checked(value: Value, block: (Value) -> Unit): Value {
        try { block(value) }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }
        return value
    }

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int, blank: Boolean = true) = require((blank || value.isNotBlank()) && value.codePointCount(0, value.length) <= limit)

    private fun entry(value: SpaceDirectoryEntryDto) = checked(value) {
        identifier(it.id); text(it.name, 80, blank = false); text(it.description, 280)
        require(it.memberCount in 1..50 && (it.viewerRole == null || it.viewerRole in setOf("owner", "admin", "member")))
        it.pendingRequestId?.let(::identifier)
        require(!(it.viewerRole != null && (it.pendingRequestId != null || it.canRequest)) && !(it.pendingRequestId != null && it.canRequest))
    }

    private fun request(value: JoinRequestDto) = checked(value) {
        identifier(it.id); identifier(it.spaceId); text(it.spaceName, 80, blank = false); text(it.note, 280)
        require(it.status in statuses && Instant.parse(it.expiresAt) > Instant.parse(it.createdAt))
        it.resolvedAt?.let(Instant::parse)
        require(it.status != "pending" || it.resolvedAt == null)
        require(it.status in setOf("pending", "expired") || it.resolvedAt != null)
    }

    private fun settings(value: SpaceSettingsDto, spaceId: String) = checked(value) {
        identifier(it.id); text(it.name, 80, blank = false)
        require(it.id == spaceId && it.role == "owner" && it.spaceType == "group" && it.visibility in setOf("private", "public"))
        require(it.etag.matches(Regex("\"[a-f0-9]{64}\"")))
    }

    suspend fun find(accountId: String, query: String, cursor: String? = null): GroupPage = accounts.authorized(accountId) { authorization ->
        val response = api.directory(authorization, query.trim().ifBlank { null }, cursor)
        val items = accounts.result(response).onEach { entry(it) }
        val pagination = response.body()?.pagination ?: invalid()
        if (items.size > 20 || pagination.hasMore != (pagination.nextCursor != null) || items.map { it.id }.distinct().size != items.size) invalid()
        if (pagination.nextCursor != null && (pagination.nextCursor == cursor || pagination.nextCursor.length > 2048)) invalid()
        GroupPage(items, pagination.nextCursor)
    }

    suspend fun ask(intent: JoinIntent): JoinRequestDto = accounts.authorized(intent.accountId) { authorization ->
        val result = request(accounts.result(api.ask(authorization, intent.spaceId, intent.requestKey, CreateJoinRequestDto(intent.note))))
        if (result.spaceId != intent.spaceId || result.note != intent.note.trim()) invalid()
        result
    }

    suspend fun withdraw(accountId: String, requestId: String): JoinRequestDto = accounts.authorized(accountId) { authorization ->
        val result = request(accounts.result(api.cancel(authorization, requestId, emptyMap())))
        if (result.id != requestId || result.status != "cancelled") invalid()
        result
    }

    suspend fun mine(accountId: String): List<JoinRequestDto> = accounts.authorized(accountId) { authorization ->
        accounts.result(api.mine(authorization)).onEach { request(it) }.also { if (it.size > 50) invalid() }
    }

    suspend fun pending(accountId: String, spaceId: String): List<JoinReviewDto> = accounts.authorized(accountId) { authorization ->
        accounts.result(api.pending(authorization, spaceId)).onEach { review ->
            checked(review) {
                identifier(it.id); identifier(it.accountId); text(it.displayName, 80, blank = false); text(it.note, 280)
                require(it.accountId != accountId && Instant.parse(it.expiresAt) > Instant.parse(it.createdAt))
            }
        }.also { if (it.size > 100) invalid() }
    }

    suspend fun decide(accountId: String, spaceId: String, review: JoinReviewDto, approve: Boolean): JoinRequestDto = accounts.authorized(accountId) { authorization ->
        val response = if (approve) api.approve(authorization, spaceId, review.id, emptyMap()) else api.decline(authorization, spaceId, review.id, emptyMap())
        val result = request(accounts.result(response))
        if (result.id != review.id || result.spaceId != spaceId || result.status != (if (approve) "approved" else "declined")) invalid()
        result
    }

    suspend fun access(accountId: String, spaceId: String): SpaceDto = accounts.authorized(accountId) { authorization ->
        val result = checked(accounts.result(api.space(authorization, spaceId))) {
            identifier(it.id); text(it.name, 80, blank = false)
            require(it.id == spaceId && it.spaceType == "group" && it.status == "active" && it.visibility in setOf("private", "public"))
            require(it.role in setOf("owner", "admin", "member") && it.version.matches(Regex("[1-9][0-9]*")) && it.version.toLong() > 0)
            it.description?.let { description -> text(description, 280) }
            Instant.parse(it.createdAt)
        }
        if (result.role !in setOf("owner", "admin")) throw IdentityFailure("ACCESS_DENIED", "Only owners and admins can review join requests.", 403)
        result
    }

    suspend fun settings(accountId: String, spaceId: String): SpaceSettingsDto = accounts.authorized(accountId) { authorization ->
        settings(accounts.result(api.settings(authorization, spaceId)), spaceId)
    }

    suspend fun changeVisibility(intent: VisibilityIntent): SpaceSettingsDto = accounts.authorized(intent.accountId) { authorization ->
        val result = settings(accounts.result(api.visibility(authorization, intent.spaceId, intent.etag, intent.requestKey, VisibilityChangeDto(intent.visibility))), intent.spaceId)
        if (result.visibility != intent.visibility) invalid()
        result
    }
}
