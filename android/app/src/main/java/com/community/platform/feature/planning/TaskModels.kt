package com.community.platform.feature.planning

import com.google.gson.annotations.SerializedName

data class FamilySpaceDto(val id: String, val name: String, val role: String)
data class TaskAssigneeDto(@SerializedName("account_id") val accountId: String, @SerializedName("display_name") val displayName: String)
data class TaskPermissionsDto(@SerializedName("can_edit") val canEdit: Boolean, @SerializedName("allowed_statuses") val allowedStatuses: List<String>)
data class FamilyTaskDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
    val title: String,
    val description: String,
    @SerializedName("due_date") val dueDate: String?,
    val status: String,
    val assignee: TaskAssigneeDto?,
    @SerializedName("assignee_unavailable") val assigneeUnavailable: Boolean,
    @SerializedName("created_by_account_id") val createdByAccountId: String,
    @SerializedName("completed_by_account_id") val completedByAccountId: String?,
    @SerializedName("completed_at") val completedAt: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String,
    val version: String,
    val permissions: TaskPermissionsDto,
    val etag: String? = null,
)
data class TaskRecord(val task: FamilyTaskDto, val etag: String)
data class TaskPage<Value>(val items: List<Value>, val nextCursor: String?)
data class CalendarEntryDto(
    val id: String,
    val kind: String,
    @SerializedName("task_id") val taskId: String,
    @SerializedName("space_id") val spaceId: String,
    val title: String,
    val date: String,
    @SerializedName("scheduled_at") val scheduledAt: String?,
    val timezone: String?,
    val status: String,
    @SerializedName("source_changed") val sourceChanged: Boolean,
)
data class TaskFields(val title: String, val description: String, val dueDate: String?, val assigneeId: String?)
data class CreateTaskDto(
    @SerializedName("space_id") val spaceId: String,
    val title: String,
    val description: String,
    @SerializedName("due_date") val dueDate: String?,
    @SerializedName("assignee_account_id") val assigneeAccountId: String?,
)
data class TaskStatusDto(val status: String)

sealed interface TaskCommand {
    val accountId: String
    val spaceId: String
    val requestKey: String
}

data class CreateTaskCommand(
    override val accountId: String, override val spaceId: String,
    override val requestKey: String, val fields: TaskFields,
) : TaskCommand

data class EditTaskCommand(
    override val accountId: String, override val spaceId: String,
    override val requestKey: String, val taskId: String, val etag: String,
    val fields: TaskFields, val changeAssignee: Boolean,
) : TaskCommand {
    fun payload(): Map<String, Any?> = buildMap {
        put("title", fields.title)
        put("description", fields.description)
        put("due_date", fields.dueDate)
        if (changeAssignee) put("assignee_account_id", fields.assigneeId)
    }
}

data class ChangeTaskStatusCommand(
    override val accountId: String, override val spaceId: String,
    override val requestKey: String, val taskId: String, val etag: String, val status: String,
) : TaskCommand