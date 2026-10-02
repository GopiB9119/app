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
import java.util.UUID
import javax.inject.Inject

data class ChecklistState(
    val accountId: String? = null, val taskId: String? = null, val spaceId: String? = null,
    val basis: ChecklistDto? = null, val title: String = "", val editingId: String? = null,
    val removing: ChecklistItemDto? = null, val pending: ChecklistIntent? = null,
    val busy: Boolean = false, val conflict: Boolean = false, val denied: Boolean = false,
    val requiresSignIn: Boolean = false, val error: String? = null, val notice: String? = null,
    val messageId: Long = 0,
) {
    val locked: Boolean get() = busy || pending != null
    val dirty: Boolean get() = title.isNotEmpty() || editingId != null || removing != null
}

@HiltViewModel
class ChecklistViewModel @Inject constructor(private val repository: ChecklistRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(ChecklistState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var work: Job? = null

    fun bind(accountId: String?, taskId: String?, spaceId: String?) {
        val task = if (accountId == null) null else taskId
        val space = if (accountId == null) null else spaceId
        val current = mutableState.value
        if (current.accountId == accountId && current.taskId == task && current.spaceId == space) return
        generation += 1; work?.cancel()
        mutableState.value = ChecklistState(accountId = accountId, taskId = task, spaceId = space)
        if (accountId != null && task != null && space != null) reload()
    }

    private fun execute(operation: suspend (String, String, String) -> ChecklistDto) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val task = current.taskId ?: return
        val space = current.spaceId ?: return
        if (current.busy || current.denied) return
        val expected = generation
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        work = viewModelScope.launch {
            try {
                val result = operation(account, task, space)
                if (generation == expected) mutableState.update { it.copy(basis = result, pending = null, conflict = false, title = "", editingId = null, removing = null, notice = if (current.pending != null) "Checklist saved." else null, messageId = if (current.pending != null) it.messageId + 1 else it.messageId) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (generation == expected) mutableState.update {
                    val failure = error as? IdentityFailure
                    val denied = failure?.status in setOf(401, 403, 404) || failure?.code == "ACCOUNT_CHANGED"
                    val definite = failure != null && failure.status in 400..499 && failure.status != 408
                    if (denied) ChecklistState(accountId = account, taskId = task, spaceId = space, denied = true,
                        requiresSignIn = failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED", error = error.message, messageId = it.messageId + 1)
                    else it.copy(pending = if (definite) null else it.pending, conflict = it.conflict || definite,
                        error = if (error is IOException) "No connection. Changes are not confirmed." else error.message ?: "The checklist could not be confirmed.", messageId = it.messageId + 1)
                }
            } finally { if (generation == expected) mutableState.update { it.copy(busy = false) } }
        }
    }

    fun refresh() { val current = mutableState.value; if (!current.locked && !current.dirty && !current.conflict) reload() }
    fun reload() { if (!mutableState.value.locked) execute { account, task, space -> repository.read(account, task, space) } }
    fun title(value: String) { if (!mutableState.value.locked) mutableState.update { it.copy(title = value, notice = null) } }
    fun cancelEdit() { if (!mutableState.value.locked) mutableState.update { it.copy(title = "", editingId = null, removing = null) } }

    private fun submit(body: ChecklistChangeDto) {
        val current = mutableState.value
        val basis = current.basis ?: return
        val account = current.accountId ?: return
        if (current.locked || current.conflict || current.denied) return
        if (body.action == "check" && !basis.canCheck || body.action != "check" && !basis.canManage) return
        val intent = ChecklistIntent(account, basis.taskId, basis.spaceId, basis.etag, UUID.randomUUID().toString(), body)
        mutableState.update { it.copy(pending = intent) }
        retry()
    }
    fun retry() { val intent = mutableState.value.pending ?: return; execute { _, _, _ -> repository.change(intent) } }
    fun saveTitle() {
        val current = mutableState.value
        val title = current.title.trim()
        val invalid = setOf(Character.CONTROL.toInt(), Character.FORMAT.toInt(), Character.SURROGATE.toInt(), Character.PRIVATE_USE.toInt(), Character.UNASSIGNED.toInt())
        if (title.codePointCount(0, title.length) !in 1..200 || title.codePoints().anyMatch { Character.getType(it) in invalid }) {
            mutableState.update { it.copy(error = "Enter an item title of 1 to 200 plain characters.", messageId = it.messageId + 1) }; return
        }
        submit(ChecklistChangeDto(if (current.editingId == null) "add" else "rename", itemId = current.editingId, title = title))
    }
    fun check(item: ChecklistItemDto, checked: Boolean) {
        val current = mutableState.value
        if (current.dirty || current.basis?.items?.none { it == item } != false || item.checked == checked) return
        submit(ChecklistChangeDto("check", itemId = item.id, checked = checked))
    }
    fun edit(item: ChecklistItemDto) {
        val current = mutableState.value
        if (!current.locked && !current.dirty && !current.conflict && current.basis?.canManage == true && current.basis.items.any { it == item }) mutableState.update { it.copy(editingId = item.id, title = item.title, notice = null) }
    }
    fun remove(item: ChecklistItemDto) {
        val current = mutableState.value
        if (!current.locked && !current.dirty && !current.conflict && current.basis?.canManage == true && current.basis.items.any { it == item }) mutableState.update { it.copy(removing = item, notice = null) }
    }
    fun confirmRemove() { mutableState.value.removing?.let { submit(ChecklistChangeDto("remove", itemId = it.id)) } }
}