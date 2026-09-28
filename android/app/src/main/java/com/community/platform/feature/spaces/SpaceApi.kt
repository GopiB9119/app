package com.community.platform.feature.spaces

import com.community.platform.feature.identity.EnvelopeDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface SpaceApi {
    @GET("v1/spaces/{spaceId}/ownership-transfers")
    suspend fun ownershipOffers(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<OwnershipTransferDto>>>

    @POST("v1/spaces/{spaceId}/ownership-transfers")
    suspend fun offerOwnership(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: CreateOwnershipOfferDto): Response<EnvelopeDto<OwnershipTransferDto>>

    @POST("v1/spaces/{spaceId}/ownership-transfers/{id}/accept")
    suspend fun acceptOwnership(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Path("id") identifier: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<OwnershipTransferDto>>

    @POST("v1/spaces/{spaceId}/ownership-transfers/{id}/decline")
    suspend fun declineOwnership(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Path("id") identifier: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<OwnershipTransferDto>>

    @POST("v1/spaces/{spaceId}/ownership-transfers/{id}/cancel")
    suspend fun cancelOwnership(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Path("id") identifier: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<OwnershipTransferDto>>

    @GET("v1/spaces")
    suspend fun spaces(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<SpaceDto>>>

    @GET("v1/spaces/{id}")
    suspend fun space(@Header("Authorization") authorization: String, @Path("id") spaceId: String): Response<EnvelopeDto<SpaceDto>>

    @POST("v1/spaces")
    suspend fun create(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: CreateFamilySpaceDto): Response<EnvelopeDto<SpaceDto>>

    @GET("v1/invitations")
    suspend fun inbox(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<SpaceInvitationDto>>>

    @GET("v1/spaces/{id}/invitations")
    suspend fun sent(@Header("Authorization") authorization: String, @Path("id") spaceId: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<SpaceInvitationDto>>>

    @POST("v1/spaces/{id}/invitations")
    suspend fun invite(@Header("Authorization") authorization: String, @Path("id") spaceId: String, @Header("Idempotency-Key") key: String, @Body body: CreateSpaceInvitationDto): Response<EnvelopeDto<SpaceInvitationDto>>

    @POST("v1/invitations/{id}/accept")
    suspend fun accept(@Header("Authorization") authorization: String, @Path("id") invitationId: String, @Body body: Map<String, String>): Response<EnvelopeDto<SpaceDto>>

    @POST("v1/invitations/{id}/decline")
    suspend fun decline(@Header("Authorization") authorization: String, @Path("id") invitationId: String, @Body body: Map<String, String>): Response<EnvelopeDto<InvitationOutcomeDto>>

    @POST("v1/spaces/{spaceId}/invitations/{invitationId}/revoke")
    suspend fun revoke(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Path("invitationId") invitationId: String, @Body body: Map<String, String>): Response<EnvelopeDto<InvitationOutcomeDto>>

    @GET("v1/spaces/{spaceId}/members")
    suspend fun members(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String): Response<EnvelopeDto<List<SpaceMemberDto>>>

    @POST("v1/spaces/{spaceId}/members/{accountId}/remove")
    suspend fun removeMember(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Path("accountId") accountId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<MembershipOutcomeDto>>

    @POST("v1/spaces/{spaceId}/leave")
    suspend fun leave(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<MembershipOutcomeDto>>
}