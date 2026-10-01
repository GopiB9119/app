package com.community.platform.feature.files

import com.community.platform.feature.identity.EnvelopeDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface DocumentApi {
    @GET("v1/spaces/{space}/documents")
    suspend fun list(@Header("Authorization") authorization: String, @Path("space") spaceId: String,
        @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<DocumentDto>>>

    @GET("v1/documents/{id}")
    suspend fun read(@Header("Authorization") authorization: String, @Path("id") documentId: String): Response<EnvelopeDto<DocumentDto>>

    @POST("v1/spaces/{space}/documents")
    suspend fun create(@Header("Authorization") authorization: String, @Path("space") spaceId: String,
        @Header("Idempotency-Key") key: String, @Body body: DocumentBodyDto): Response<EnvelopeDto<DocumentDto>>

    @POST("v1/documents/{id}/delete")
    suspend fun delete(@Header("Authorization") authorization: String, @Path("id") documentId: String,
        @Body body: Map<String, String>): Response<EnvelopeDto<DocumentDeleteDto>>
}