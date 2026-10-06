package com.community.platform.feature.agents

import com.community.platform.feature.identity.EnvelopeDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface AgentApi {
    @POST("v1/agent-runs")
    suspend fun ask(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String,
        @Body body: AgentAskDto): Response<EnvelopeDto<AgentRunDto>>

    @GET("v1/agent-runs")
    suspend fun runs(@Header("Authorization") authorization: String, @Query("space_id") spaceId: String?,
        @Query("cursor") cursor: String?, @Query("limit") limit: Int = AGENT_PAGE_SIZE): Response<EnvelopeDto<List<AgentRunDto>>>

    @GET("v1/agent-runs/{run}")
    suspend fun getRun(@Header("Authorization") authorization: String, @Path("run") runId: String): Response<EnvelopeDto<AgentRunDto>>

    @POST("v1/agent-runs/{run}/resume")
    suspend fun answer(@Header("Authorization") authorization: String, @Path("run") runId: String,
        @Body body: AgentAnswerDto): Response<EnvelopeDto<AgentRunDto>>

    @POST("v1/agent-runs/{run}/cancel")
    suspend fun stop(@Header("Authorization") authorization: String, @Path("run") runId: String,
        @Body body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>>

    @POST("v1/agent-approvals/{approval}/approve")
    suspend fun approve(@Header("Authorization") authorization: String, @Path("approval") approvalId: String,
        @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>>

    @POST("v1/agent-approvals/{approval}/reject")
    suspend fun reject(@Header("Authorization") authorization: String, @Path("approval") approvalId: String,
        @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>>

    @GET("v1/agent-memories")
    suspend fun memories(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<AgentMemoryDto>>>

    @DELETE("v1/agent-memories/{memory}")
    suspend fun forget(@Header("Authorization") authorization: String, @Path("memory") memoryId: String): Response<EnvelopeDto<AgentDeletedDto>>
}
