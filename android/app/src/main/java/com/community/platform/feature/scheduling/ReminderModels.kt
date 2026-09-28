package com.community.platform.feature.scheduling

import com.google.gson.annotations.SerializedName

data class PreviewReminderDto(@SerializedName("task_id") val taskId: String, @SerializedName("local_time") val localTime: String, val timezone: String)
data class ReminderRecipientDto(@SerializedName("account_id") val accountId: String, @SerializedName("display_name") val displayName: String)
data class ReminderOptionDto(
    @SerializedName("scheduled_at") val scheduledAt: String,
    @SerializedName("dispatch_expires_at") val dispatchExpiresAt: String,
    @SerializedName("utc_offset_minutes") val utcOffsetMinutes: Int,
    @SerializedName("preview_token") val previewToken: String,
)
data class ReminderPreviewDto(
    @SerializedName("task_id") val taskId: String,
    @SerializedName("task_title") val taskTitle: String,
    @SerializedName("task_version") val taskVersion: String,
    @SerializedName("local_time") val localTime: String,
    val timezone: String,
    val recipient: ReminderRecipientDto,
    val channel: String,
    val options: List<ReminderOptionDto>,
    @SerializedName("expires_at") val expiresAt: String,
    @SerializedName("requested_by") val requestedBy: ReminderRecipientDto? = null,
    @SerializedName("request_expires_at") val requestExpiresAt: String? = null,
)
data class SaveReminderDto(@SerializedName("preview_token") val previewToken: String)
data class ReminderDto(
    val id: String,
    @SerializedName("task_id") val taskId: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("task_title") val taskTitle: String,
    @SerializedName("local_time") val localTime: String,
    val timezone: String,
    @SerializedName("scheduled_at") val scheduledAt: String,
    @SerializedName("expires_at") val expiresAt: String,
    val status: String,
    val reason: String?,
    @SerializedName("source_changed") val sourceChanged: Boolean,
    @SerializedName("acknowledged_at") val acknowledgedAt: String?,
    val version: String,
    val channel: String,
)
data class InboxNotificationDto(
    val id: String,
    @SerializedName("reminder_id") val reminderId: String,
    @SerializedName("task_id") val taskId: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("task_title") val taskTitle: String,
    @SerializedName("scheduled_at") val scheduledAt: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("read_at") val readAt: String?,
    @SerializedName("acknowledged_at") val acknowledgedAt: String?,
)
data class ReminderPreferenceDto(@SerializedName("in_app_reminders_enabled") val enabled: Boolean, val version: String)
data class UpdateReminderPreferenceDto(@SerializedName("in_app_reminders_enabled") val enabled: Boolean)
data class ReminderPreferences(val value: ReminderPreferenceDto, val etag: String)
data class ReminderPage<Value>(val items: List<Value>, val nextCursor: String?, val unreadCount: Int? = null)
data class ReminderCreateIntent(val accountId: String, val taskId: String, val requestKey: String, val previewToken: String)

data class PreviewReminderRequestDto(
    @SerializedName("task_id") val taskId: String,
    @SerializedName("recipient_account_id") val recipientAccountId: String,
    @SerializedName("local_time") val localTime: String,
    val timezone: String,
)
data class ReminderRequestDto(
    val id: String,
    @SerializedName("task_id") val taskId: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("task_title") val taskTitle: String,
    @SerializedName("task_version") val taskVersion: String,
    @SerializedName("requested_by") val requestedBy: ReminderRecipientDto,
    val recipient: ReminderRecipientDto,
    @SerializedName("local_time") val localTime: String,
    val timezone: String,
    @SerializedName("scheduled_at") val scheduledAt: String,
    @SerializedName("dispatch_expires_at") val dispatchExpiresAt: String,
    @SerializedName("expires_at") val expiresAt: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("resolved_at") val resolvedAt: String?,
    val status: String,
    @SerializedName("source_changed") val sourceChanged: Boolean,
    @SerializedName("reminder_id") val reminderId: String?,
    val version: String,
    val channel: String,
)
data class ReminderRequestReviewDto(val request: ReminderRequestDto, @SerializedName("preview_token") val previewToken: String, @SerializedName("expires_at") val expiresAt: String)
data class ReminderRequestCreateIntent(
    val accountId: String, val taskId: String, val spaceId: String, val recipientAccountId: String,
    val requestKey: String, val previewToken: String, val taskVersion: String,
    val localTime: String, val timezone: String, val scheduledAt: String,
)
enum class ReminderRequestDirection(val wireValue: String) { RECEIVED("received"), SENT("sent") }
enum class ReminderRequestResponse { ACCEPT, DECLINE, CANCEL }
data class ReminderRequestResponseIntent(
    val accountId: String, val request: ReminderRequestDto, val response: ReminderRequestResponse, val previewToken: String? = null,
)