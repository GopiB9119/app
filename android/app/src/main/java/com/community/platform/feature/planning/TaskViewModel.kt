package com.community.platform.feature.planning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject

data class TaskEditor(
    val identity: String = UUID.randomUUID().toString(),
    val original: TaskRecord? = null,
    val fields: TaskFields = TaskFields("", "", null, null),
    val changeAssignee: Boolean = false,
) {
    val dirty: Boolean get() = original?.let {
        fields.title != it.task.title || fields.description != it.task.description ||
            fields.dueDate != it.task.dueDate || changeAssignee || fields.priority != it.task.priorityLevel
    } ?: (fields.title.isNotBlank() || fields.description.isNotBlank() || fields.dueDate != null || fields.assigneeId != null || fields.priority != "normal")
}

/** DEC-029 date choices, counted from the phone's own day; null is any date. */
fun dueRange(choice: String?, today: LocalDate): Pair<LocalDate?, LocalDate?>? = when (choice) {
    "before" -> null to today.minusDays(1)
    "today" -> today to today
    "week" -> today to today.plusDays(6)
    else -> null
}

data class TaskStatusConfirmation(val record: TaskRecord, val status: String)

data class TaskWorkspaceState(
    val accountId: String? = null,
    val busy: Boolean = false,
    val spaces: List<FamilySpaceDto> = emptyList(),
    val spaceCursor: String? = null,
    val selectedSpace: FamilySpaceDto? = null,
    val tasks: List<TaskRecord> = emptyList(),
    val openedFromSearchId: String? = null,
    val searchItemGone: Boolean = false,
    val nextCursor: String? = null,
    val statusFilter: String? = null,
    /** null is anyone; "me" or "none". */
    val assigneeFilter: String? = null,
    /** null is any date; "before", "today" or "week". */
    val dueFilter: String? = null,
    val detail: TaskRecord? = null,
    val editor: TaskEditor? = null,
    val assignees: List<TaskAssigneeDto> = emptyList(),
    val confirmation: TaskStatusConfirmation? = null,
    val pendingCommand: TaskCommand? = null,
    val conflict: Boolean = false,
    val requiresSignIn: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val messageId: Long = 0,
) {
    val navigationLocked: Boolean get() = busy || pendingCommand != null || editor != null
}

@HiltViewModel
class TaskViewModel @Inject constructor(private val repository: TaskRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(TaskWorkspaceState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var work: Job? = null
    private var entrySpaceId: String? = null
    private var entryTaskId: String? = null
    internal var today: () -> LocalDate = { LocalDate.now() }

    fun bind(accountId: String?, initialSpaceId: String? = null, initialTaskId: String? = null) {
        val requestedSpaceId = if (accountId == null) null else initialSpaceId
        val requestedTaskId = if (accountId == null) null else initialTaskId
        if (accountId == mutableState.value.accountId && requestedSpaceId == entrySpaceId && requestedTaskId == entryTaskId) return
        generation += 1
        work?.cancel()
        entrySpaceId = requestedSpaceId
        entryTaskId = requestedTaskId
        mutableState.value = TaskWorkspaceState(accountId = accountId)
        if (accountId != null) refresh()
    }

    private fun update(expected: Long, change: (TaskWorkspaceState) -> TaskWorkspaceState) {
        if (expected == generation) mutableState.update(change)
    }

    private fun action(block: suspend (String, Long) -> Unit) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        work = viewModelScope.launch {
            try {
                block(accountId, expected)
            } catch (error: CancellationException) {
                throw error
            } catch (error: IdentityFailure) {
                update(expected) {
                    when {
                        error.status == 401 || error.code == "ACCOUNT_CHANGED" -> TaskWorkspaceState(accountId = it.accountId, requiresSignIn = true, error = error.message, messageId = it.messageId + 1)
                        error.status in setOf(403, 404) -> TaskWorkspaceState(accountId = it.accountId, error = error.message, messageId = it.messageId + 1)
                        error.status == 412 -> it.copy(pendingCommand = null, confirmation = null, conflict = true, error = error.message, messageId = it.messageId + 1)
                        error.status in 400..499 && error.status != 408 -> it.copy(pendingCommand = null, confirmation = null, error = error.message, messageId = it.messageId + 1)
                        else -> it.copy(error = error.message, messageId = it.messageId + 1)
                    }
                }
            } catch (_error: IOException) {
                update(expected) { it.copy(error = "No connection. Changes are not confirmed.", messageId = it.messageId + 1) }
            } catch (_error: Exception) {
                update(expected) { it.copy(error = "The task service returned an unexpected response. Changes are not confirmed.", messageId = it.messageId + 1) }
            } finally {
                update(expected) { it.copy(busy = false) }
            }
        }
    }

    fun refresh() {
        if (mutableState.value.pendingCommand != null || mutableState.value.editor != null) return
        action { accountId, expected ->
            val spaces = repository.spaces(accountId)
            val desired = mutableState.value.selectedSpace?.id ?: entrySpaceId
            val selected = if (desired == null) spaces.items.firstOrNull() else spaces.items.firstOrNull { it.id == desired }
            if (desired != null && selected == null) throw IdentityFailure("SPACE_UNAVAILABLE", "This family Space is no longer available.", 404)
            update(expected) { it.copy(spaces = spaces.items, spaceCursor = spaces.nextCursor, selectedSpace = selected, tasks = emptyList(), nextCursor = null, detail = null, confirmation = null, conflict = false) }
            if (selected != null) loadTasks(accountId, selected.id, expected)
        }
    }

    fun loadMoreSpaces() {
        val current = mutableState.value
        val cursor = current.spaceCursor ?: return
        if (current.navigationLocked) return
        action { accountId, expected ->
            val page = repository.spaces(accountId, cursor)
            update(expected) { it.copy(spaces = (it.spaces + page.items).distinctBy(FamilySpaceDto::id), spaceCursor = page.nextCursor) }
        }
    }

    fun selectSpace(identifier: String) {
        val current = mutableState.value
        if (current.navigationLocked || current.selectedSpace?.id == identifier) return
        val selected = current.spaces.firstOrNull { it.id == identifier } ?: return
        action { accountId, expected ->
            update(expected) { it.copy(selectedSpace = selected, tasks = emptyList(), detail = null, nextCursor = null, conflict = false) }
            loadTasks(accountId, identifier, expected)
        }
    }

    fun filter(status: String?) {
        if (status != null && status !in setOf("open", "in_progress", "completed", "cancelled")) return
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        if (current.navigationLocked || current.statusFilter == status) return
        mutableState.update { it.copy(statusFilter = status, tasks = emptyList(), nextCursor = null, detail = null) }
        action { accountId, expected -> loadTasks(accountId, selected.id, expected) }
    }

    fun filterAssignee(choice: String?) {
        if (choice != null && choice !in setOf("me", "none")) return
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        if (current.navigationLocked || current.assigneeFilter == choice) return
        mutableState.update { it.copy(assigneeFilter = choice, tasks = emptyList(), nextCursor = null, detail = null) }
        action { accountId, expected -> loadTasks(accountId, selected.id, expected) }
    }

    fun filterDue(choice: String?) {
        if (choice != null && choice !in setOf("before", "today", "week")) return
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        if (current.navigationLocked || current.dueFilter == choice) return
        mutableState.update { it.copy(dueFilter = choice, tasks = emptyList(), nextCursor = null, detail = null) }
        action { accountId, expected -> loadTasks(accountId, selected.id, expected) }
    }

    private fun filters(state: TaskWorkspaceState): TaskFilters {
        val range = dueRange(state.dueFilter, today())
        val assignee = when (state.assigneeFilter) { "me" -> state.accountId; "none" -> "none"; else -> null }
        return TaskFilters(assignee, range?.first?.toString(), range?.second?.toString())
    }

    private fun shows(state: TaskWorkspaceState, task: FamilyTaskDto): Boolean {
        if (state.statusFilter != null && state.statusFilter != task.status) return false
        if (state.assigneeFilter == "me" && task.assignee?.accountId != state.accountId) return false
        if (state.assigneeFilter == "none" && (task.assignee != null || task.assigneeUnavailable)) return false
        val range = dueRange(state.dueFilter, today()) ?: return true
        val due = task.dueDate?.let(LocalDate::parse) ?: return false
        return (range.first == null || !due.isBefore(range.first)) && (range.second == null || !due.isAfter(range.second))
    }

    private suspend fun loadTasks(accountId: String, spaceId: String, expected: Long, cursor: String? = null) {
        val current = mutableState.value
        val page = repository.tasks(accountId, spaceId, cursor, current.statusFilter, filters(current))
        update(expected) { it.copy(tasks = ((if (cursor == null) emptyList() else it.tasks) + page.items).distinctBy { item -> item.task.id }, nextCursor = page.nextCursor) }
        val target = entryTaskId?.takeIf { spaceId == entrySpaceId && current.statusFilter == null && current.assigneeFilter == null && current.dueFilter == null }
        if (target == null) {
            update(expected) { it.copy(openedFromSearchId = null, searchItemGone = false) }
            return
        }
        try {
            val record = mutableState.value.tasks.firstOrNull { it.task.id == target } ?: repository.read(accountId, spaceId, target)
            update(expected) { it.copy(tasks = listOf(record) + it.tasks.filterNot { item -> item.task.id == target }, openedFromSearchId = target, searchItemGone = false) }
        } catch (error: IdentityFailure) {
            if (error.status !in setOf(403, 404)) throw error
            update(expected) { it.copy(openedFromSearchId = null, searchItemGone = true) }
        }
    }

    fun loadMore() {
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        val cursor = current.nextCursor ?: return
        if (current.navigationLocked) return
        action { accountId, expected -> loadTasks(accountId, selected.id, expected, cursor) }
    }

    fun open(record: TaskRecord) {
        if (mutableState.value.navigationLocked) return
        action { accountId, expected ->
            val fresh = repository.read(accountId, record.task.spaceId, record.task.id)
            update(expected) { it.copy(detail = fresh, conflict = false) }
        }
    }

    fun create() {
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        if (current.navigationLocked) return
        action { accountId, expected ->
            val assignees = repository.assignees(accountId, selected.id)
            update(expected) { it.copy(editor = TaskEditor(), assignees = assignees, detail = null, conflict = false) }
        }
    }

    fun edit(record: TaskRecord) {
        if (mutableState.value.navigationLocked) return
        action { accountId, expected -> loadEditor(accountId, record, expected) }
    }

    private suspend fun loadEditor(accountId: String, record: TaskRecord, expected: Long) {
        val fresh = repository.read(accountId, record.task.spaceId, record.task.id)
        if (!fresh.task.permissions.canEdit) throw IdentityFailure("ACCESS_DENIED", "This task cannot be edited.", 403)
        val assignees = repository.assignees(accountId, fresh.task.spaceId, fresh.task.id)
        val fields = TaskFields(fresh.task.title, fresh.task.description, fresh.task.dueDate, fresh.task.assignee?.accountId, fresh.task.priorityLevel)
        update(expected) { it.copy(editor = TaskEditor(original = fresh, fields = fields), detail = null, assignees = assignees, conflict = false) }
    }

    fun updateFields(fields: TaskFields, changeAssignee: Boolean = false) {
        val current = mutableState.value
        val editor = current.editor ?: return
        if (current.busy || current.pendingCommand != null) return
        mutableState.update { it.copy(editor = editor.copy(fields = fields, changeAssignee = editor.changeAssignee || changeAssignee), error = null, notice = null) }
    }

    fun closeEditor() {
        val current = mutableState.value
        if (current.busy || current.pendingCommand != null) return
        mutableState.update { it.copy(editor = null, assignees = emptyList(), conflict = false, error = null) }
    }

    fun closeDetail() {
        if (mutableState.value.busy || mutableState.value.pendingCommand != null) return
        mutableState.update { it.copy(detail = null, confirmation = null, conflict = false, error = null) }
    }

    fun reloadLatest() {
        val current = mutableState.value
        if (current.pendingCommand != null) return
        val record = current.editor?.original ?: current.detail ?: return
        action { accountId, expected ->
            if (current.editor != null) loadEditor(accountId, record, expected)
            else {
                val fresh = repository.read(accountId, record.task.spaceId, record.task.id)
                update(expected) { it.copy(detail = fresh, confirmation = null, conflict = false) }
            }
        }
    }

    fun save() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val selected = current.selectedSpace ?: return
        val editor = current.editor ?: return
        if (current.busy || current.pendingCommand != null || current.conflict) return
        val fields = editor.fields.copy(title = editor.fields.title.trim())
        if (fields.title.codePointCount(0, fields.title.length) !in 1..200 || fields.description.codePointCount(0, fields.description.length) > 5000) {
            mutableState.update { it.copy(error = "Use a title of 1 to 200 characters and notes of at most 5,000 characters.", messageId = it.messageId + 1) }
            return
        }
        try { fields.dueDate?.let { require(LocalDate.parse(it).toString() == it) } }
        catch (_error: RuntimeException) { mutableState.update { it.copy(error = "Select a valid calendar date.", messageId = it.messageId + 1) }; return }
        if ((editor.original == null || editor.changeAssignee) && fields.assigneeId != null && current.assignees.none { it.accountId == fields.assigneeId }) {
            mutableState.update { it.copy(error = "Select an eligible task assignee.", messageId = it.messageId + 1) }
            return
        }
        if (fields.priority !in TASK_PRIORITIES) return
        val key = UUID.randomUUID().toString()
        val command = editor.original?.let {
            EditTaskCommand(accountId, selected.id, key, it.task.id, it.etag, fields, editor.changeAssignee, fields.priority != it.task.priorityLevel)
        } ?: CreateTaskCommand(accountId, selected.id, key, fields)
        mutableState.update { it.copy(pendingCommand = command) }
        executePending()
    }

    fun proposeStatus(record: TaskRecord, status: String) {
        if (mutableState.value.navigationLocked || mutableState.value.conflict) return
        if (status !in record.task.permissions.allowedStatuses) return
        mutableState.update { it.copy(confirmation = TaskStatusConfirmation(record, status), error = null, notice = null) }
    }

    fun cancelStatus() {
        if (!mutableState.value.busy && mutableState.value.pendingCommand == null) mutableState.update { it.copy(confirmation = null) }
    }

    fun confirmStatus() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val confirmation = current.confirmation ?: return
        if (current.busy || current.pendingCommand != null) return
        val record = confirmation.record
        val command = ChangeTaskStatusCommand(accountId, record.task.spaceId, UUID.randomUUID().toString(), record.task.id, record.etag, confirmation.status)
        mutableState.update { it.copy(pendingCommand = command, confirmation = null) }
        executePending()
    }

    fun retry() {
        if (mutableState.value.pendingCommand != null) executePending()
    }

    private fun executePending() {
        val command = mutableState.value.pendingCommand ?: return
        action { accountId, expected ->
            if (command.accountId != accountId) throw IdentityFailure("ACCOUNT_CHANGED", "Sign in again before continuing.", 401)
            val saved = repository.execute(command)
            update(expected) { current ->
                val others = current.tasks.filterNot { it.task.id == saved.task.id }
                val matchesFilter = shows(current, saved.task)
                current.copy(
                    tasks = if (matchesFilter) listOf(saved) + others else others,
                    detail = saved, editor = null, assignees = emptyList(), pendingCommand = null,
                    confirmation = null, conflict = false, error = null,
                    notice = if (command is ChangeTaskStatusCommand) "Task status saved." else "Task saved.",
                    messageId = current.messageId + 1,
                )
            }
        }
    }
}