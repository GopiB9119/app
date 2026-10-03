package com.community.platform.feature.planning

import com.community.platform.feature.identity.EnvelopeDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface TaskApi {
    @GET("v1/spaces")
    suspend fun spaces(@Header("Authorization") authorization: String, @Query("limit") limit: Int, @Query("cursor") cursor: String?): Response<EnvelopeDto<List<FamilySpaceDto>>>

    @GET("v1/tasks")
    suspend fun tasks(@Header("Authorization") authorization: String, @Query("space_id") spaceId: String, @Query("limit") limit: Int, @Query("cursor") cursor: String?, @Query("status") status: String?,
        @Query("assignee") assignee: String?, @Query("due_from") dueFrom: String?, @Query("due_to") dueTo: String?): Response<EnvelopeDto<List<FamilyTaskDto>>>

    @GET("v1/tasks/assignees")
    suspend fun assignees(@Header("Authorization") authorization: String, @Query("space_id") spaceId: String, @Query("task_id") taskId: String?): Response<EnvelopeDto<List<TaskAssigneeDto>>>

    @GET("v1/tasks/{id}")
    suspend fun read(@Header("Authorization") authorization: String, @Path("id") taskId: String): Response<EnvelopeDto<FamilyTaskDto>>

    @POST("v1/tasks")
    suspend fun create(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: CreateTaskDto): Response<EnvelopeDto<FamilyTaskDto>>

    @PATCH("v1/tasks/{id}")
    suspend fun edit(@Header("Authorization") authorization: String, @Path("id") taskId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: Map<String, @JvmSuppressWildcards Any?>): Response<EnvelopeDto<FamilyTaskDto>>

    @POST("v1/tasks/{id}/status")
    suspend fun status(@Header("Authorization") authorization: String, @Path("id") taskId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: TaskStatusDto): Response<EnvelopeDto<FamilyTaskDto>>
}