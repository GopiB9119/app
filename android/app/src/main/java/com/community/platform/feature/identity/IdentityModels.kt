package com.community.platform.feature.identity

import com.google.gson.annotations.SerializedName

data class EnvelopeDto<Value>(val data: Value?, val error: ErrorDto?, val pagination: PaginationDto? = null, @SerializedName("unread_count") val unreadCount: Int? = null)
data class PaginationDto(@SerializedName("next_cursor") val nextCursor: String?, @SerializedName("has_more") val hasMore: Boolean)
data class ErrorDto(val code: String?, val message: String?)
data class UserDto(
    val id: String,
    val email: String,
    @SerializedName("display_name") val displayName: String,
    val timezone: String,
    @SerializedName("email_verified") val emailVerified: Boolean,
    val version: Int,
)
data class AuthDto(
    @SerializedName("session_token") val token: String,
    @SerializedName("session_id") val sessionId: String,
    @SerializedName("expires_at") val expiresAt: String,
    val user: UserDto,
)
data class ChallengeDto(
    @SerializedName("challenge_id") val id: String,
    @SerializedName("expires_at") val expiresAt: String,
    @SerializedName("delivery_status") val deliveryStatus: String,
)
data class SessionDto(
    val id: String,
    @SerializedName("device_name") val deviceName: String,
    val platform: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String,
    val current: Boolean,
)
data class SecurityEventDto(val id: String, val action: String, @SerializedName("created_at") val createdAt: String)
data class DoneDto(val status: String)
data class BeginDto(val email: String, @SerializedName("context_secret") val contextSecret: String)
data class LoginDto(
    val email: String,
    val password: String,
    @SerializedName("device_name") val deviceName: String = "Android app",
    val platform: String = "android",
)
data class VerifyDto(
    @SerializedName("challenge_id") val challengeId: String,
    @SerializedName("context_secret") val contextSecret: String,
    val code: String,
    val password: String,
    @SerializedName("display_name") val displayName: String,
    val timezone: String,
    @SerializedName("device_name") val deviceName: String = "Android app",
    val platform: String = "android",
)
data class ResetDto(
    @SerializedName("challenge_id") val challengeId: String,
    @SerializedName("context_secret") val contextSecret: String,
    val code: String,
    val password: String,
)
data class ProfileDto(@SerializedName("display_name") val displayName: String, val timezone: String)
data class Profile(val user: UserDto, val etag: String)
data class Credentials(val token: String, val accountId: String)
data class StartIntent(val email: String, val purpose: EntryMode, val contextSecret: String, val requestKey: String)
data class PendingProof(val intent: StartIntent, val challenge: ChallengeDto)
enum class EntryMode { LOGIN, REGISTER, RECOVER }

class IdentityFailure(val code: String, override val message: String, val status: Int = 0) : Exception(message)