package com.community.platform.feature.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.realtime.LiveEvent
import com.community.platform.feature.realtime.LiveSignals
import com.community.platform.feature.spaces.SpaceDto
import com.community.platform.feature.spaces.SpaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

enum class SearchIssue { CONNECTION, RESPONSE }
enum class SearchKind { DOCUMENTS, TASKS, EVENTS }
enum class SearchNotice { UPDATED, SPACE_GONE }

data class SearchState(
    val accountId: String? = null,
    val spaces: List<SpaceDto> = emptyList(),
    val spacesLoaded: Boolean = false,
    val spaceId: String? = null,
    val query: String = "",
    val submittedQuery: String? = null,
    val submittedSpaceId: String? = null,
    val limit: Int = 20,
    val results: SearchResultsDto? = null,
    val loadingSpaces: Boolean = false,
    val searching: Boolean = false,
    val loadingMore: Boolean = false,
    val refreshing: Boolean = false,
    val stale: Boolean = false,
    val notice: SearchNotice? = null,
    val problem: SearchProblem? = null,
    val issue: SearchIssue? = null,
    val error: String? = null,
    val requiresSignIn: Boolean = false,
) {
    val busy: Boolean get() = loadingSpaces || searching
}

@HiltViewModel
class SearchViewModel @Inject constructor(private val repository: SearchRepository, private val spaces: SpaceRepository,
    private val live: LiveSignals = LiveSignals.None) : ViewModel() {
    private val mutableState = MutableStateFlow(SearchState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var spacesJob: Job? = null
    private var searchJob: Job? = null
    private var hintsJob: Job? = null
    private var refreshJob: Job? = null
    private var noticeJob: Job? = null
    private var requestVersion = 0L
    private var reloadOnHint = false
    private var refreshOnHint = false

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        spacesJob?.cancel(); searchJob?.cancel(); hintsJob?.cancel(); refreshJob?.cancel(); noticeJob?.cancel()
        requestVersion += 1
        reloadOnHint = false
        refreshOnHint = false
        mutableState.value = SearchState(accountId = accountId)
        if (accountId != null) { reloadSpaces(); listen() }
    }

    private fun notice(value: SearchNotice?) {
        noticeJob?.cancel()
        mutableState.update { it.copy(notice = value) }
        if (value != null) noticeJob = viewModelScope.launch {
            delay(6000)
            mutableState.update { it.copy(notice = null) }
        }
    }

    private fun listen() {
        val expected = generation
        hintsJob = viewModelScope.launch {
            live.events.collect { event ->
                val current = mutableState.value
                if (generation != expected || current.requiresSignIn) return@collect
                val reload = event == LiveEvent.Ready || event == LiveEvent.Resync || event is LiveEvent.Change && event.kind == "search" && event.reason in setOf("access", "space")
                val refresh = current.results != null && when (event) {
                    LiveEvent.Ready, LiveEvent.Resync -> true
                    is LiveEvent.Change -> event.kind == "search" && (current.submittedSpaceId == null ||
                        event.spaceId == current.submittedSpaceId && event.reason != "access")
                    else -> false
                }
                if (!reload && !refresh) return@collect
                reloadOnHint = reloadOnHint || reload
                refreshOnHint = refreshOnHint || refresh
                refreshJob?.cancel()
                refreshJob = launch {
                    delay(400)
                    mutableState.first { !it.busy && !it.loadingMore }
                    if (generation != expected) return@launch
                    val reloadSpaces = reloadOnHint
                    val refreshSearch = refreshOnHint
                    reloadOnHint = false
                    refreshOnHint = false
                    mutableState.update { it.copy(refreshing = it.results != null) }
                    var cancelled = false
                    try {
                        val repaired = if (reloadSpaces) readSpaces(current.accountId!!, expected) else false
                        if (generation == expected && mutableState.value.results != null && (refreshSearch || repaired)) read(quiet = true, preserveNotice = repaired)
                    } catch (error: CancellationException) { cancelled = true; throw error }
                    catch (error: Exception) {
                        fail(error, expected)
                        if (generation == expected && mutableState.value.results != null) mutableState.update { it.copy(stale = true) }
                    } finally {
                        // Only a read that ran to its end settles the hints it was started for; a newer hint cancels it and carries them on.
                        if (false) { reloadOnHint = false; refreshOnHint = false }
                        if (generation == expected && refreshJob == coroutineContext[Job]) mutableState.update { it.copy(refreshing = false) }
                    }
                }
            }
        }
    }

    private fun fail(error: Exception, expected: Long) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            spacesJob?.cancel(); searchJob?.cancel(); hintsJob?.cancel(); refreshJob?.cancel(); noticeJob?.cancel()
            mutableState.value = SearchState(accountId = mutableState.value.accountId, requiresSignIn = true)
            return
        }
        val unknown = failure == null || failure.status == 0 || failure.status >= 500
        mutableState.update { it.copy(error = if (!unknown) failure?.message else null,
            issue = if (error is IOException) SearchIssue.CONNECTION else if (unknown) SearchIssue.RESPONSE else null) }
    }

    fun reloadSpaces() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(loadingSpaces = true, error = null, issue = null) }
        spacesJob = viewModelScope.launch {
            try {
                if (readSpaces(account, expected)) read(quiet = true, preserveNotice = true)
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected) }
            finally { if (generation == expected) mutableState.update { it.copy(loadingSpaces = false) } }
        }
    }

    private suspend fun readSpaces(account: String, expected: Long): Boolean {
        val loaded = mutableListOf<SpaceDto>()
        val seenCursors = mutableSetOf<String>()
        var cursor: String? = null
        do {
            val page = spaces.spaces(account, cursor)
            if (page.items.any { item -> loaded.any { it.id == item.id } } || loaded.size + page.items.size > 50) {
                throw IdentityFailure("INVALID_RESPONSE", "The Space list could not be confirmed.")
            }
            loaded += page.items
            cursor = page.nextCursor
            if (cursor != null && !seenCursors.add(cursor)) throw IdentityFailure("INVALID_RESPONSE", "The Space list did not advance.")
        } while (cursor != null)
        if (generation != expected) return false
        val current = mutableState.value
        val gone = current.submittedSpaceId != null && loaded.none { it.id == current.submittedSpaceId }
        mutableState.update { it.copy(spaces = loaded.toList(), spacesLoaded = true,
            spaceId = it.spaceId?.takeIf { id -> loaded.any { space -> space.id == id } },
            submittedSpaceId = if (gone) null else it.submittedSpaceId, limit = if (gone) 20 else it.limit) }
        if (gone) notice(SearchNotice.SPACE_GONE)
        return gone && current.submittedQuery != null
    }

    fun query(value: String) {
        if (mutableState.value.searching || mutableState.value.requiresSignIn) return
        mutableState.update { it.copy(query = value, problem = null, issue = null, error = null) }
    }

    fun filter(spaceId: String?) {
        val current = mutableState.value
        if (current.busy || current.requiresSignIn || (spaceId != null && current.spaces.none { it.id == spaceId })) return
        refreshJob?.cancel(); searchJob?.cancel(); noticeJob?.cancel()
        requestVersion += 1
        reloadOnHint = false
        refreshOnHint = false
        mutableState.update { it.copy(spaceId = spaceId, results = null, submittedQuery = null, submittedSpaceId = null,
            limit = 20, loadingMore = false, refreshing = false, stale = false, notice = null, problem = null, issue = null, error = null) }
    }

    fun search() {
        val current = mutableState.value
        current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val query = normalizedSearchQuery(current.query)
        refreshJob?.cancel(); searchJob?.cancel()
        requestVersion += 1
        reloadOnHint = false
        refreshOnHint = false
        notice(null)
        searchProblem(query)?.let { problem ->
            mutableState.update { it.copy(problem = problem, results = null, submittedQuery = null, submittedSpaceId = null,
                limit = 20, refreshing = false, loadingMore = false, stale = false, issue = null, error = null) }
            return
        }
        mutableState.update { it.copy(submittedQuery = query, submittedSpaceId = current.spaceId, limit = 20,
            searching = true, refreshing = false, loadingMore = false, results = null, stale = false, problem = null, issue = null, error = null) }
        searchJob = viewModelScope.launch { read() }
    }

    fun showMore(kind: SearchKind) {
        val current = mutableState.value
        val results = current.results ?: return
        val more = when (kind) { SearchKind.DOCUMENTS -> results.moreDocuments; SearchKind.TASKS -> results.moreTasks; SearchKind.EVENTS -> results.moreEvents }
        if (current.busy || current.loadingMore || current.requiresSignIn || current.limit >= 100 || more != true) return
        refreshJob?.cancel(); searchJob?.cancel()
        requestVersion += 1
        notice(null)
        mutableState.update { it.copy(limit = (it.limit + 20).coerceAtMost(100), loadingMore = true, refreshing = false, stale = false, issue = null, error = null) }
        searchJob = viewModelScope.launch { read() }
    }

    private suspend fun read(quiet: Boolean = false, preserveNotice: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val query = current.submittedQuery ?: return
        val expected = generation
        val version = ++requestVersion
        if (quiet) mutableState.update { it.copy(refreshing = true) }
        try {
            val results = repository.search(account, query, current.submittedSpaceId, current.limit)
            if (generation == expected && requestVersion == version) {
                mutableState.update { it.copy(results = results, stale = false, issue = null, error = null) }
                if (quiet && !preserveNotice && current.results != results) notice(SearchNotice.UPDATED)
            }
        } catch (error: CancellationException) { throw error }
        catch (error: Exception) {
            if (generation == expected && requestVersion == version) {
                fail(error, expected)
                if (generation == expected && current.results != null) mutableState.update { it.copy(stale = true) }
            }
        } finally {
            if (generation == expected && requestVersion == version) mutableState.update { it.copy(searching = false, loadingMore = false, refreshing = false) }
        }
    }
}