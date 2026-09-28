package com.community.platform.feature.identity

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface IdentityApi {
    @POST("v1/auth/register")
    suspend fun register(@Header("Idempotency-Key") key: String, @Body body: BeginDto): Response<EnvelopeDto<ChallengeDto>>

    @POST("v1/auth/recover")
    suspend fun recover(@Header("Idempotency-Key") key: String, @Body body: BeginDto): Response<EnvelopeDto<ChallengeDto>>

    @POST("v1/auth/verify-email")
    suspend fun verify(@Body body: VerifyDto): Response<EnvelopeDto<AuthDto>>

    @POST("v1/auth/reset-password")
    suspend fun reset(@Body body: ResetDto): Response<EnvelopeDto<DoneDto>>

    @POST("v1/auth/login")
    suspend fun login(@Body body: LoginDto): Response<EnvelopeDto<AuthDto>>

    @GET("v1/me")
    suspend fun me(@Header("Authorization") authorization: String): Response<EnvelopeDto<UserDto>>

    @PATCH("v1/me/profile")
    suspend fun profile(@Header("Authorization") authorization: String, @Header("If-Match") etag: String, @Body body: ProfileDto): Response<EnvelopeDto<UserDto>>

    @GET("v1/me/sessions")
    suspend fun sessions(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<SessionDto>>>

    @DELETE("v1/me/sessions/{id}")
    suspend fun revoke(@Header("Authorization") authorization: String, @Path("id") identifier: String): Response<EnvelopeDto<DoneDto>>

    @POST("v1/me/sessions/revoke-others")
    suspend fun revokeOthers(@Header("Authorization") authorization: String): Response<EnvelopeDto<DoneDto>>

    @POST("v1/auth/logout")
    suspend fun logout(@Header("Authorization") authorization: String): Response<EnvelopeDto<DoneDto>>

    @GET("v1/me/security-events")
    suspend fun events(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<SecurityEventDto>>>

    @GET("v1/timezones")
    suspend fun timezones(): Response<EnvelopeDto<List<String>>>
}