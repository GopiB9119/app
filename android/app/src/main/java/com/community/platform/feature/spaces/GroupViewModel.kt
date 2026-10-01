package com.community.platform.feature.spaces

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

data class GroupState(
    val accountId: String? = null,
    val managedSpaceId: String? = null,
    val query: String = "",
    val searched: String = "",
    val groups: List<SpaceDirectoryEntryDto> = emptyList(),
    val cursor: String? = null,
    val requests: List<JoinRequestDto> = emptyList(),
    val asking: SpaceDirectoryEntryDto? = null,
    val note: String = "",
    val pendingAsk: JoinIntent? = null,
    val settings: SpaceSettingsDto? = null,
    val reviews: List<JoinReviewDto> = emptyList(),
    val confirmingVisibility: Boolean = false,
    val pendingVisibility: VisibilityIntent? = null,
    val busy: Boolean = false,
    val requiresSignIn: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
) {
    val managing: Boolean get() = managedSpaceId != null
    val locked: Boolean get() = busy || pendingAsk != null || pendingVisibility != null
}

@HiltViewModel
class GroupViewModel @Inject constructor(private val repository: GroupRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(GroupState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var work: Job? = null

    fun bind(accountId: String?, managedSpaceId: String? = null) {
        val current = mutableState.value
        if (current.accountId == accountId && current.managedSpaceId == managedSpaceId) return
        generation += 1
        work?.cancel()
        mutableState.value = GroupState(accountId = accountId, managedSpaceId = if (accountId == null) null else managedSpaceId)
        if (accountId != null) refresh()
    }

    private fun update(expected: Long, transform: (GroupState) -> GroupState) {
        if (generation == expected) mutableState.update(transform)
    }

    private fun action(operation: suspend (String, Long) -> Unit) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        work = viewModelScope.launch {
            try { operation(accountId, expected) }
            catch (error: CancellationException) { throw error }
            catch (error: IdentityFailure) {
                update(expected) {
                    val definite = error.status in 400..499 && error.status != 408
                    when {
                        error.status == 401 || error.code == "ACCOUNT_CHANGED" -> GroupState(accountId = it.accountId, requiresSignIn = true, error = error.message)
                        // A refused command is final; only an unconfirmed one keeps its key for an exact retry.
                        definite -> it.copy(pendingAsk = null, pendingVisibility = null, confirmingVisibility = false, error = error.message)
                        else -> it.copy(error = error.message)
                    }
                }
            }
            catch (_error: IOException) { update(expected) { it.copy(error = "No connection. Changes are not confirmed.") } }
            catch (_error: Exception) { update(expected) { it.copy(error = "The group service returned an unexpected response. Changes are not confirmed.") } }
            finally { update(expected) { it.copy(busy = false) } }
        }
    }

    fun refresh() {
        val current = mutableState.value
        if (current.locked || current.asking != null) return
        action { accountId, expected ->
            val managed = current.managedSpaceId
            if (managed != null) {
                val settings = repository.settings(accountId, managed)
                val reviews = repository.pending(accountId, managed)
                update(expected) { it.copy(settings = settings, reviews = reviews) }
            } else {
                val page = repository.find(accountId, current.searched)
                val requests = repository.mine(accountId)
                update(expected) { it.copy(groups = page.items, cursor = page.nextCursor, requests = requests) }
            }
        }
    }

    fun query(value: String) { if (!mutableState.value.locked) mutableState.update { it.copy(query = value.take(80)) } }

    fun search() {
        val current = mutableState.value
        if (current.locked || current.managing) return
        val searched = current.query.trim()
        action { accountId, expected ->
            val page = repository.find(accountId, searched)
            update(expected) { it.copy(searched = searched, groups = page.items, cursor = page.nextCursor, asking = null, note = "") }
        }
    }

    fun more() {
        val current = mutableState.value
        val cursor = current.cursor ?: return
        if (current.locked) return
        action { accountId, expected ->
            val page = repository.find(accountId, current.searched, cursor)
            update(expected) { it.copy(groups = (it.groups + page.items).distinctBy(SpaceDirectoryEntryDto::id), cursor = page.nextCursor) }
        }
    }

    fun startAsk(entry: SpaceDirectoryEntryDto) {
        val current = mutableState.value
        if (current.locked || !entry.canRequest || current.groups.none { it.id == entry.id }) return
        mutableState.update { it.copy(asking = entry, note = "", error = null, notice = null) }
    }

    fun note(value: String) { if (!mutableState.value.locked) mutableState.update { it.copy(note = value.take(280)) } }

    fun cancelAsk() { if (!mutableState.value.locked) mutableState.update { it.copy(asking = null, note = "") } }

    fun sendAsk() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val entry = current.asking ?: return
        if (current.busy) return
        val note = current.note.trim()
        val disallowed = setOf(Character.CONTROL.toInt(), Character.FORMAT.toInt(), Character.SURROGATE.toInt(), Character.PRIVATE_USE.toInt(), Character.UNASSIGNED.toInt())
        if (current.pendingAsk == null && note.codePoints().anyMatch { it != '\n'.code && Character.getType(it) in disallowed }) {
            mutableState.update { it.copy(error = "Remove control and text-direction characters from the note.") }; return
        }
        val intent = current.pendingAsk ?: JoinIntent(accountId, entry.id, entry.name, note, UUID.randomUUID().toString())
        mutableState.update { it.copy(pendingAsk = intent) }
        action { account, expected ->
            val request = repository.ask(intent)
            val requests = repository.mine(account)
            val page = repository.find(account, mutableState.value.searched)
            update(expected) { it.copy(pendingAsk = null, asking = null, note = "", requests = requests, groups = page.items, cursor = page.nextCursor, notice = "Request sent to ${request.spaceName}. The owner will review it.") }
        }
    }

    fun withdraw(requestId: String) {
        if (mutableState.value.locked) return
        action { accountId, expected ->
            val request = repository.withdraw(accountId, requestId)
            val requests = repository.mine(accountId)
            val page = repository.find(accountId, mutableState.value.searched)
            update(expected) { it.copy(requests = requests, groups = page.items, cursor = page.nextCursor, notice = "Request to ${request.spaceName} withdrawn.") }
        }
    }

    fun decide(review: JoinReviewDto, approve: Boolean) {
        val current = mutableState.value
        val spaceId = current.managedSpaceId ?: return
        if (current.locked || current.reviews.none { it.id == review.id }) return
        action { accountId, expected ->
            repository.decide(accountId, spaceId, review, approve)
            val reviews = repository.pending(accountId, spaceId)
            val settings = repository.settings(accountId, spaceId)
            update(expected) { it.copy(reviews = reviews, settings = settings, notice = if (approve) "${review.displayName} joined the group." else "You declined ${review.displayName}. They can ask again in 7 days.") }
        }
    }

    fun proposeVisibility() {
        val current = mutableState.value
        if (!current.locked && current.settings != null) mutableState.update { it.copy(confirmingVisibility = true, error = null, notice = null) }
    }

    fun keepVisibility() { if (!mutableState.value.locked) mutableState.update { it.copy(confirmingVisibility = false) } }

    fun confirmVisibility() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val settings = current.settings ?: return
        if (current.busy || !current.confirmingVisibility) return
        val intent = current.pendingVisibility ?: VisibilityIntent(accountId, settings.id, if (settings.visibility == "public") "private" else "public", settings.etag, UUID.randomUUID().toString())
        mutableState.update { it.copy(pendingVisibility = intent) }
        action { account, expected ->
            val result = repository.changeVisibility(intent)
            val reviews = repository.pending(account, settings.id)
            update(expected) { it.copy(settings = result, reviews = reviews, pendingVisibility = null, confirmingVisibility = false,
                notice = if (result.visibility == "public") "The group is public. People can find it and ask to join." else "The group is private. It no longer appears in Find groups, and waiting requests were closed.") }
        }
    }
}
