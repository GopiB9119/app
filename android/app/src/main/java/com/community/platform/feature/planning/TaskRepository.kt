package com.community.platform.feature.planning

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TaskRepository @Inject constructor(private val api: TaskApi, private val accounts: AccountRepository) {
    private val statuses = setOf("open", "in_progress", "completed", "cancelled")

    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected task response.")

    private fun etag(value: String?): String {
        if (value == null || value.length !in 3..140 || !value.startsWith('"') || !value.endsWith('"')) invalid()
        return value
    }

    private fun checked(task: FamilyTaskDto, expectedSpace: String? = null): FamilyTaskDto {
        try {
            UUID.fromString(task.id)
            UUID.fromString(task.spaceId)
            UUID.fromString(task.createdByAccountId)
            task.completedByAccountId?.let(UUID::fromString)
            task.assignee?.let { UUID.fromString(it.accountId); require(it.displayName.codePointCount(0, it.displayName.length) in 1..80) }
            task.dueDate?.let { require(LocalDate.parse(it).toString() == it) }
            Instant.parse(task.createdAt)
            Instant.parse(task.updatedAt)
            task.completedAt?.let(Instant::parse)
            require(task.title.length in 1..400 && task.description.length <= 10000)
            require(task.version.toLong() > 0 && task.status in statuses && (task.priority == null || task.priority in TASK_PRIORITIES))
            require(task.permissions.allowedStatuses.all { it in statuses })
            require(expectedSpace == null || task.spaceId == expectedSpace)
            require(!task.assigneeUnavailable || task.assignee == null)
            require(if (task.status == "completed") task.completedAt != null && task.completedByAccountId != null else task.completedAt == null && task.completedByAccountId == null)
        } catch (error: RuntimeException) {
            if (error is CancellationException) throw error
            invalid()
        }
        return task
    }

    private fun document(response: Response<EnvelopeDto<FamilyTaskDto>>, expectedSpace: String? = null): TaskRecord {
        val task = checked(accounts.result(response), expectedSpace)
        return TaskRecord(task, etag(response.headers()["ETag"]))
    }

    private fun <Value : Any> page(response: Response<EnvelopeDto<List<Value>>>, limit: Int): TaskPage<Value> {
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid()
        if (items.size > limit || pagination.hasMore != (pagination.nextCursor != null)) invalid()
        if (pagination.nextCursor != null && (pagination.nextCursor.isBlank() || pagination.nextCursor.length > 2048 || items.isEmpty())) invalid()
        return TaskPage(items, pagination.nextCursor)
    }

    suspend fun spaces(accountId: String, cursor: String? = null): TaskPage<FamilySpaceDto> = accounts.authorized(accountId) {
        val result = page(api.spaces(it, 50, cursor), 50)
        try {
            // Admins since DEC-018 (T13); refusing them made the whole task and calendar list fail for an admin.
            result.items.forEach { space -> UUID.fromString(space.id); require(space.name.isNotBlank() && space.role in setOf("owner", "admin", "member")) }
            require(result.items.map { space -> space.id }.distinct().size == result.items.size)
        } catch (_error: IllegalArgumentException) { invalid() }
        result
    }

    suspend fun tasks(accountId: String, spaceId: String, cursor: String? = null, status: String? = null, filters: TaskFilters = TaskFilters()): TaskPage<TaskRecord> = accounts.authorized(accountId) {
        val result = page(api.tasks(it, spaceId, 10, cursor, status, filters.assignee, filters.dueFrom, filters.dueTo), 10)
        val records = result.items.map { task -> TaskRecord(checked(task, spaceId), etag(task.etag)) }
        if (records.map { record -> record.task.id }.distinct().size != records.size) invalid()
        TaskPage(records, result.nextCursor)
    }

    suspend fun read(accountId: String, spaceId: String, taskId: String): TaskRecord = accounts.authorized(accountId) {
        val result = document(api.read(it, taskId), spaceId)
        if (result.task.id != taskId) invalid()
        result
    }

    suspend fun assignees(accountId: String, spaceId: String, taskId: String? = null): List<TaskAssigneeDto> = accounts.authorized(accountId) {
        val results = accounts.result(api.assignees(it, spaceId, taskId))
        if (results.size > 50) invalid()
        try { results.forEach { assignee -> UUID.fromString(assignee.accountId); require(assignee.displayName.codePointCount(0, assignee.displayName.length) in 1..80) } }
        catch (_error: IllegalArgumentException) { invalid() }
        results
    }

    suspend fun execute(command: TaskCommand): TaskRecord = accounts.authorized(command.accountId) { authorization ->
        val response = when (command) {
            is CreateTaskCommand -> api.create(authorization, command.requestKey, CreateTaskDto(command.spaceId, command.fields.title, command.fields.description, command.fields.dueDate, command.fields.assigneeId, command.fields.priority))
            is EditTaskCommand -> api.edit(authorization, command.taskId, command.requestKey, command.etag, command.payload())
            is ChangeTaskStatusCommand -> api.status(authorization, command.taskId, command.requestKey, command.etag, TaskStatusDto(command.status))
        }
        val result = document(response, command.spaceId)
        val target = when (command) { is CreateTaskCommand -> null; is EditTaskCommand -> command.taskId; is ChangeTaskStatusCommand -> command.taskId }
        if (target != null && target != result.task.id) invalid()
        result
    }
}