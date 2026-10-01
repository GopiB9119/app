package com.community.platform.feature.discovery

import com.community.platform.feature.identity.EnvelopeDto
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Query

interface SearchApi {
    @GET("v1/search")
    suspend fun search(@Header("Authorization") authorization: String, @Query("q") query: String,
        @Query("space_id") spaceId: String?): Response<EnvelopeDto<SearchResultsDto>>
}