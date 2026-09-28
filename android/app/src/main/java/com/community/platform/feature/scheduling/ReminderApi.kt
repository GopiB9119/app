package com.community.platform.feature.scheduling

import com.community.platform.feature.identity.EnvelopeDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ReminderApi {
    @POST("v1/reminders/preview")
    suspend fun preview(@Header("Authorization") authorization: String, @Body body: PreviewReminderDto): Response<EnvelopeDto<ReminderPreviewDto>>
    @POST("v1/reminders")
    suspend fun create(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: SaveReminderDto): Response<EnvelopeDto<ReminderDto>>
    @GET("v1/reminders")
    suspend fun reminders(@Header("Authorization") authorization: String, @Query("task_id") taskId: String?, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<ReminderDto>>>
    @POST("v1/reminders/{id}/cancel")
    suspend fun cancel(@Header("Authorization") authorization: String, @Path("id") identifier: String, @Body body: Map<String, String>): Response<EnvelopeDto<ReminderDto>>
    @GET("v1/notifications")
    suspend fun inbox(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<InboxNotificationDto>>>
    @POST("v1/notifications/{id}/read")
    suspend fun read(@Header("Authorization") authorization: String, @Path("id") identifier: String, @Body body: Map<String, String>): Response<EnvelopeDto<InboxNotificationDto>>
    @POST("v1/notifications/{id}/acknowledge")
    suspend fun acknowledge(@Header("Authorization") authorization: String, @Path("id") identifier: String, @Body body: Map<String, String>): Response<EnvelopeDto<InboxNotificationDto>>
    @GET("v1/me/notification-preferences")
    suspend fun preferences(@Header("Authorization") authorization: String): Response<EnvelopeDto<ReminderPreferenceDto>>
    @PATCH("v1/me/notification-preferences")
    suspend fun updatePreferences(@Header("Authorization") authorization: String, @Header("If-Match") etag: String, @Body body: UpdateReminderPreferenceDto): Response<EnvelopeDto<ReminderPreferenceDto>>
    @POST("v1/reminder-requests/preview")
    suspend fun previewRequest(@Header("Authorization") authorization: String, @Body body: PreviewReminderRequestDto): Response<EnvelopeDto<ReminderPreviewDto>>
    @POST("v1/reminder-requests")
    suspend fun createRequest(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: SaveReminderDto): Response<EnvelopeDto<ReminderRequestDto>>
    @GET("v1/reminder-requests")
    suspend fun requests(@Header("Authorization") authorization: String, @Query("direction") direction: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<ReminderRequestDto>>>
    @GET("v1/reminder-requests/{id}/review")
    suspend fun reviewRequest(@Header("Authorization") authorization: String, @Path("id") identifier: String): Response<EnvelopeDto<ReminderRequestReviewDto>>
    @POST("v1/reminder-requests/{id}/accept")
    suspend fun acceptRequest(@Header("Authorization") authorization: String, @Path("id") identifier: String, @Body body: SaveReminderDto): Response<EnvelopeDto<ReminderRequestDto>>
    @POST("v1/reminder-requests/{id}/decline")
    suspend fun declineRequest(@Header("Authorization") authorization: String, @Path("id") identifier: String, @Body body: Map<String, String>): Response<EnvelopeDto<ReminderRequestDto>>
    @POST("v1/reminder-requests/{id}/cancel")
    suspend fun cancelRequest(@Header("Authorization") authorization: String, @Path("id") identifier: String, @Body body: Map<String, String>): Response<EnvelopeDto<ReminderRequestDto>>
}