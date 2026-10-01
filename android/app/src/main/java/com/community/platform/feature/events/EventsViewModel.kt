package com.community.platform.feature.events

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

enum class EventMode { LIST, DETAIL, CREATE, EDIT }

data class EventDraft(
    val title: String = "", val date: String = "", val start: String = "", val end: String = "",
    val timezone: String = "UTC", val location: String = "", val details: String = "",
)

data class EventsState(
    val accountId: String? = null,
    val spaceId: String? = null,
    val past: Boolean = false,
    val mode: EventMode = EventMode.LIST,
    val events: List<EventDto> = emptyList(),
    val nextCursor: String? = null,
    val selected: EventDto? = null,
    val draft: EventDraft = EventDraft(),
    val problem: EventProblem? = null,
    val pending: EventCreateIntent? = null,
    val confirmingCancel: Boolean = false,
    val loading: Boolean = false,
    val working: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val requiresSignIn: Boolean = false,
) {
    val busy: Boolean get() = loading || working
}

@HiltViewModel
class EventsViewModel @Inject constructor(private val repository: EventsRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(EventsState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var zone = "UTC"
    private var loadJob: Job? = null

    fun bind(accountId: String?, spaceId: String?, timezone: String) {
        zone = timezone
        val current = mutableState.value
        if (current.accountId == accountId && current.spaceId == spaceId) return
        generation += 1
        loadJob?.cancel()
        mutableState.value = EventsState(accountId = accountId, spaceId = spaceId, draft = EventDraft(timezone = timezone))
        if (accountId != null && spaceId != null) reload()
    }

    private fun fail(error: Exception, expected: Long, unknownMessage: String? = null) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            loadJob?.cancel()
            mutableState.value = EventsState(accountId = mutableState.value.accountId, spaceId = mutableState.value.spaceId, requiresSignIn = true)
            return
        }
        val unknown = error is IOException || failure == null || failure.status >= 500 || failure.status == 0
        val message = when {
            unknown && unknownMessage != null -> unknownMessage
            error is IOException -> "No connection. Nothing new is confirmed."
            else -> error.message ?: "Something went wrong."
        }
        mutableState.update { it.copy(error = message) }
        if (failure?.status == 404 && mutableState.value.mode != EventMode.LIST) {
            mutableState.update { it.copy(mode = EventMode.LIST, selected = null, confirmingCancel = false) }
            reload()
        }
    }

    private fun command(work: suspend (String) -> Unit, unknownMessage: String? = null) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.working) return
        val expected = generation
        mutableState.update { it.copy(working = true, error = null, notice = null) }
        viewModelScope.launch {
            try { work(account) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected, unknownMessage) }
            finally { if (generation == expected) mutableState.update { it.copy(working = false) } }
        }
    }

    fun showPast(past: Boolean) {
        if (mutableState.value.past == past || mutableState.value.working) return
        mutableState.update { it.copy(past = past, events = emptyList(), nextCursor = null, mode = EventMode.LIST, selected = null) }
        reload()
    }

    fun reload(more: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        val cursor = if (more) current.nextCursor ?: return else null
        val past = current.past
        val expected = generation
        loadJob?.cancel()
        mutableState.update { it.copy(loading = true, error = if (more) it.error else null) }
        loadJob = viewModelScope.launch {
            try {
                val page = repository.list(account, space, past, cursor)
                if (generation == expected && mutableState.value.past == past) mutableState.update {
                    it.copy(events = if (more) (it.events + page.items).distinctBy(EventDto::id) else page.items, nextCursor = page.nextCursor)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected) }
            finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }

    fun open(event: EventDto) {
        if (mutableState.value.working) return
        mutableState.update { it.copy(mode = EventMode.DETAIL, selected = event, confirmingCancel = false, error = null, notice = null) }
        command({ account -> val detail = repository.read(account, event.id); mutableState.update { it.copy(selected = detail) } })
    }

    fun close() {
        val current = mutableState.value
        if (current.working) return
        if (current.mode == EventMode.EDIT && current.selected != null) {
            mutableState.update { it.copy(mode = EventMode.DETAIL, problem = null) }
            return
        }
        mutableState.update { it.copy(mode = EventMode.LIST, selected = null, confirmingCancel = false, problem = null) }
        reload()
    }

    fun startCreate() {
        if (mutableState.value.working) return
        mutableState.update {
            it.copy(mode = EventMode.CREATE, selected = null, problem = null, error = null, notice = null,
                draft = if (it.pending != null) it.draft else EventDraft(timezone = zone))
        }
    }

    /** Only same-day or open-ended events are editable here; longer events keep their exact end on the web editor. */
    fun startEdit() {
        val event = mutableState.value.selected ?: return
        if (!event.canManage || mutableState.value.working || !editableHere(event)) return
        mutableState.update {
            it.copy(mode = EventMode.EDIT, problem = null, error = null, notice = null, draft = EventDraft(
                title = event.title, date = event.localStart.substringBefore("T"), start = event.localStart.substringAfter("T"),
                end = event.localEnd?.substringAfter("T") ?: "", timezone = event.timezone, location = event.location, details = event.description,
            ))
        }
    }

    fun draft(change: (EventDraft) -> EventDraft) {
        val current = mutableState.value
        if (current.working || current.pending != null) return
        mutableState.update { it.copy(draft = change(it.draft), problem = null) }
    }

    fun save() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        if (current.working) return
        val draft = current.draft
        val body = eventBody(draft.title, draft.details, draft.location, draft.timezone, draft.date, draft.start, draft.end)
        eventProblem(body)?.let { problem -> mutableState.update { it.copy(problem = problem) }; return }
        if (current.mode == EventMode.EDIT) {
            val event = current.selected ?: return
            command({ id ->
                val saved = repository.update(id, event, body)
                mutableState.update { it.copy(mode = EventMode.DETAIL, selected = saved, notice = "Event saved.") }
            }, "The change is not confirmed. Reload the event to check it before editing again.")
            return
        }
        val intent = current.pending?.takeIf { it.body == body } ?: EventCreateIntent(account, space, UUID.randomUUID().toString(), body)
        mutableState.update { it.copy(pending = intent) }
        submit(intent)
    }

    fun retry() { mutableState.value.pending?.let(::submit) }

    fun discardPending() {
        if (mutableState.value.working) return
        mutableState.update { it.copy(pending = null, mode = EventMode.LIST, draft = EventDraft(timezone = zone), error = null) }
        reload()
    }

    private fun submit(intent: EventCreateIntent) = command({ _ ->
        try {
            val created = repository.create(intent)
            mutableState.update { it.copy(pending = null, mode = EventMode.DETAIL, selected = created, past = false, draft = EventDraft(timezone = zone), notice = "Event created.") }
            reload()
        } catch (error: IdentityFailure) {
            // A definite rejection releases the attempt; an unknown outcome keeps it for an exact retry.
            if (error.status in 400..499 && error.status != 408) mutableState.update { it.copy(pending = null) }
            throw error
        }
    }, "Not confirmed. Retry sends the same event; it cannot be created twice.")

    fun respond(response: String) {
        val event = mutableState.value.selected ?: return
        if (!event.canRespond || response !in EVENT_RESPONSES) return
        command({ account ->
            val updated = repository.respond(account, event.id, response)
            mutableState.update { state -> state.copy(selected = updated, events = state.events.map { if (it.id == updated.id) updated else it }) }
        }, "Your response is not confirmed. Choose it again to retry.")
    }

    fun askCancel() { if (mutableState.value.selected?.canManage == true) mutableState.update { it.copy(confirmingCancel = true) } }
    fun keepEvent() = mutableState.update { it.copy(confirmingCancel = false) }

    fun cancelEvent() {
        val event = mutableState.value.selected ?: return
        mutableState.update { it.copy(confirmingCancel = false) }
        command({ account ->
            val cancelled = repository.cancel(account, event)
            mutableState.update { it.copy(selected = cancelled, notice = "Event cancelled.") }
        }, "The cancellation is not confirmed. Reload the event to check it.")
    }

    fun refreshSelected() {
        val event = mutableState.value.selected ?: return
        open(event)
    }

    companion object {
        fun editableHere(event: EventDto) = event.localEnd == null || event.localEnd.substringBefore("T") == event.localStart.substringBefore("T")
    }
}
