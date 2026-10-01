package com.community.platform.feature.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.spaces.SpaceDto
import com.community.platform.feature.spaces.SpaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

enum class SearchIssue { CONNECTION, RESPONSE }

data class SearchState(
    val accountId: String? = null,
    val spaces: List<SpaceDto> = emptyList(),
    val spacesLoaded: Boolean = false,
    val spaceId: String? = null,
    val query: String = "",
    val results: SearchResultsDto? = null,
    val loadingSpaces: Boolean = false,
    val searching: Boolean = false,
    val problem: SearchProblem? = null,
    val issue: SearchIssue? = null,
    val error: String? = null,
    val requiresSignIn: Boolean = false,
) {
    val busy: Boolean get() = loadingSpaces || searching
}

@HiltViewModel
class SearchViewModel @Inject constructor(private val repository: SearchRepository, private val spaces: SpaceRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(SearchState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var spacesJob: Job? = null
    private var searchJob: Job? = null

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        spacesJob?.cancel(); searchJob?.cancel()
        mutableState.value = SearchState(accountId = accountId)
        if (accountId != null) reloadSpaces()
    }

    private fun fail(error: Exception, expected: Long) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            spacesJob?.cancel(); searchJob?.cancel()
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
                if (generation == expected) mutableState.update {
                    val selected = it.spaceId?.takeIf { id -> loaded.any { space -> space.id == id } }
                    it.copy(spaces = loaded.toList(), spacesLoaded = true, spaceId = selected, results = if (selected == it.spaceId) it.results else null)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected) }
            finally { if (generation == expected) mutableState.update { it.copy(loadingSpaces = false) } }
        }
    }

    fun query(value: String) {
        if (mutableState.value.searching || mutableState.value.requiresSignIn) return
        mutableState.update { it.copy(query = value, results = null, problem = null, issue = null, error = null) }
    }

    fun filter(spaceId: String?) {
        val current = mutableState.value
        if (current.busy || current.requiresSignIn || (spaceId != null && current.spaces.none { it.id == spaceId })) return
        mutableState.update { it.copy(spaceId = spaceId, results = null, problem = null, issue = null, error = null) }
    }

    fun search() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val query = normalizedSearchQuery(current.query)
        searchProblem(query)?.let { problem -> mutableState.update { it.copy(problem = problem, results = null) }; return }
        val expected = generation
        val filter = current.spaceId
        mutableState.update { it.copy(searching = true, results = null, problem = null, issue = null, error = null) }
        searchJob = viewModelScope.launch {
            try {
                val results = repository.search(account, query, filter)
                if (generation == expected) mutableState.update { it.copy(results = results) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected) }
            finally { if (generation == expected) mutableState.update { it.copy(searching = false) } }
        }
    }
}