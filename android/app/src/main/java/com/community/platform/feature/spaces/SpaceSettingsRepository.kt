package com.community.platform.feature.spaces

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class SpaceSettingsDto(
    val id: String, val name: String,
    @SerializedName("space_type") val spaceType: String,
    val visibility: String, val status: String, val role: String, val version: String,
    @SerializedName("created_at") val createdAt: String,
    val etag: String,
    val description: String? = null,
    @SerializedName("member_invites") val memberInvites: Boolean = false,
)
data class EditSpaceSettingsDto(val name: String, val description: String? = null)
data class SpaceSettingsIntent(val accountId: String, val spaceId: String, val name: String, val etag: String, val key: String, val description: String? = null)
data class InvitePolicyDto(@SerializedName("member_invites") val memberInvites: Boolean)
data class InvitePolicyIntent(val accountId: String, val spaceId: String, val memberInvites: Boolean, val etag: String, val requestKey: String)

interface SpaceSettingsApi {
    @GET("v1/spaces/{id}/settings")
    suspend fun read(@Header("Authorization") authorization: String, @Path("id") spaceId: String): Response<EnvelopeDto<SpaceSettingsDto>>

    @PATCH("v1/spaces/{id}/settings")
    suspend fun save(@Header("Authorization") authorization: String, @Path("id") spaceId: String,
        @Header("If-Match") etag: String, @Header("Idempotency-Key") key: String,
        @Body body: EditSpaceSettingsDto): Response<EnvelopeDto<SpaceSettingsDto>>

    @POST("v1/spaces/{id}/invite-policy")
    suspend fun invitePolicy(@Header("Authorization") authorization: String, @Path("id") spaceId: String,
        @Header("If-Match") etag: String, @Header("Idempotency-Key") key: String,
        @Body body: InvitePolicyDto): Response<EnvelopeDto<SpaceSettingsDto>>
}

@Singleton
class SpaceSettingsRepository @Inject constructor(private val api: SpaceSettingsApi, private val accounts: AccountRepository) {
    private fun checked(response: Response<EnvelopeDto<SpaceSettingsDto>>, spaceId: String, description: String? = null): SpaceSettingsDto {
        val result = accounts.result(response)
        try {
            require(UUID.fromString(result.id).toString() == result.id && result.id == spaceId)
            require(result.name.isNotBlank() && result.name.codePointCount(0, result.name.length) <= 80)
            require(result.spaceType in setOf("family", "couple", "solo", "group") && result.visibility in setOf("private", "public") && result.status == "active" && result.role == "owner")
            require(result.visibility == "private" || result.spaceType == "group")
            require(!result.memberInvites || result.spaceType in setOf("family", "group"))
            result.description?.let { require(it.codePointCount(0, it.length) <= 280) }
            require(description == null || result.description == description.trim())
            require(result.version.matches(Regex("[1-9][0-9]*")) && result.version.toLong() > 0)
            require(result.etag.matches(Regex("\"[a-f0-9]{64}\"")))
            Instant.parse(result.createdAt)
        } catch (error: RuntimeException) {
            if (error is CancellationException) throw error
            throw IdentityFailure("INVALID_RESPONSE", "The Space settings could not be confirmed.")
        }
        return result
    }

    suspend fun read(accountId: String, spaceId: String): SpaceSettingsDto = accounts.authorized(accountId) {
        checked(api.read(it, spaceId), spaceId)
    }

    suspend fun save(intent: SpaceSettingsIntent): SpaceSettingsDto = accounts.authorized(intent.accountId) {
        checked(api.save(it, intent.spaceId, intent.etag, intent.key, EditSpaceSettingsDto(intent.name, intent.description)), intent.spaceId, intent.description)
    }

    suspend fun changeInvitePolicy(intent: InvitePolicyIntent): SpaceSettingsDto = accounts.authorized(intent.accountId) {
        val result = checked(api.invitePolicy(it, intent.spaceId, intent.etag, intent.requestKey, InvitePolicyDto(intent.memberInvites)), intent.spaceId)
        if (result.spaceType !in setOf("family", "group") || result.memberInvites != intent.memberInvites) {
            throw IdentityFailure("INVALID_RESPONSE", "The Space settings could not be confirmed.")
        }
        result
    }
}