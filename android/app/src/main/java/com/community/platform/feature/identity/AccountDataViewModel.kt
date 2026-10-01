package com.community.platform.feature.identity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import javax.inject.Inject
import kotlin.coroutines.coroutineContext

@HiltViewModel
class AccountDataViewModel @Inject constructor(private val repository: AccountRepository, gson: Gson) : ViewModel() {
    private val mutableState = MutableStateFlow(AccountDataState())
    val state = mutableState.asStateFlow()
    private val archiveJson = gson.newBuilder().setPrettyPrinting().create()
    private var generation = 0
    private var visible = false
    private var commandJob: Job? = null
    private var refreshJob: Job? = null
    private var pollingJob: Job? = null
    private var exportIntent: Pair<List<String>, String>? = null

    fun bind(profile: Profile?) {
        if (mutableState.value.accountId == profile?.user?.id) {
            profile?.let { account -> mutableState.update { it.copy(timezone = account.user.timezone) } }
            return
        }
        generation += 1
        commandJob?.cancel()
        refreshJob?.cancel()
        pollingJob?.cancel()
        exportIntent = null
        visible = false
        mutableState.value = AccountDataState(accountId = profile?.user?.id, timezone = profile?.user?.timezone ?: "UTC")
    }

    fun visible(shown: Boolean) {
        if (visible == shown) return
        visible = shown
        updatePolling()
        if (shown) refresh() else {
            refreshJob?.cancel()
            mutableState.update { it.copy(loading = false) }
        }
    }

    private fun updatePolling() {
        if (!visible || mutableState.value.accountId == null) {
            pollingJob?.cancel()
            pollingJob = null
        } else if (pollingJob?.isActive != true) {
            pollingJob = viewModelScope.launch {
                while (isActive) {
                    delay(5000)
                    if (mutableState.value.downloads.any { it.preparing }) refresh()
                }
            }
        }
    }

    fun refresh() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.loading || current.busy) return
        val expected = generation
        mutableState.update { it.copy(loading = true, listProblem = null) }
        refreshJob = viewModelScope.launch {
            try {
                val downloads = repository.exports(accountId)
                if (generation == expected) mutableState.update { it.copy(downloads = downloads, loaded = true) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (generation == expected && !sessionEnded(error)) mutableState.update { it.copy(listProblem = problem(error)) }
            } finally {
                if (generation == expected) {
                    updatePolling()
                    mutableState.update { it.copy(loading = false) }
                }
            }
        }
    }

    fun choose(category: String, checked: Boolean) {
        val current = mutableState.value
        if (current.busy || category !in accountExportCategories || (category in current.categories) == checked) return
        exportIntent = null
        mutableState.update { it.copy(categories = if (checked) it.categories + category else it.categories - category, problem = null, downloadSaved = false) }
    }

    fun prepare() {
        val current = mutableState.value
        if (current.accountId == null || current.busy || current.categories.isEmpty()) return
        val categories = accountExportCategories.filter { it in current.categories }
        // A retry after a lost answer reuses the key, so the service returns the same export instead of a second one.
        val intent = exportIntent?.takeIf { it.first == categories } ?: (categories to UUID.randomUUID().toString())
        exportIntent = intent
        command { accountId ->
            val download = repository.prepareExport(accountId, intent.first, intent.second)
            exportIntent = null
            replaceDownload(download)
        }
    }

    fun cancel(identifier: String) {
        if (mutableState.value.downloads.none { it.id == identifier && it.canCancel }) return
        command { accountId -> replaceDownload(repository.cancelExport(accountId, identifier)) }
    }

    fun download(identifier: String, openDestination: () -> OutputStream?) {
        if (mutableState.value.downloads.none { it.id == identifier && it.canDownload }) return
        command { accountId ->
            withContext(Dispatchers.IO) {
                val archive = repository.exportArchive(accountId, identifier)
                coroutineContext.ensureActive()
                try {
                    val destination = openDestination() ?: throw IOException("No selected output stream")
                    destination.bufferedWriter(Charsets.UTF_8).use { archiveJson.toJson(archive, it) }
                } catch (error: CancellationException) {
                    throw error
                } catch (_error: Exception) {
                    throw IdentityFailure("EXPORT_SAVE_FAILED", "")
                }
            }
            mutableState.update { it.copy(downloadSaved = true) }
        }
    }

    fun openDeletion() {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(deletionOpen = true, deletionProblem = null) }
    }

    fun closeDeletion() {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(deletionOpen = false, deletionProblem = null) }
    }

    fun delete(password: String, onDeleted: (AccountDeletionNotice) -> Unit = {}) {
        val current = mutableState.value
        if (!current.deletionOpen || password.isBlank()) return
        command(deleting = true) { accountId ->
            val deletion = repository.deleteAccount(accountId, password)
            visible = false
            exportIntent = null
            val notice = AccountDeletionNotice(deletion.purgeAfter, current.timezone)
            mutableState.value = AccountDataState(deleted = notice)
            onDeleted(notice)
        }
    }

    private fun replaceDownload(download: AccountExportDto) {
        mutableState.update { current ->
            val downloads = if (current.downloads.any { it.id == download.id }) current.downloads.map { if (it.id == download.id) download else it }
            else (listOf(download) + current.downloads).take(10)
            current.copy(downloads = downloads, loaded = true)
        }
    }

    private fun command(deleting: Boolean = false, operation: suspend (String) -> Unit) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.busy) return
        val expected = generation
        refreshJob?.cancel()
        mutableState.update { it.copy(busy = true, loading = false, problem = null, deletionProblem = null, downloadSaved = false) }
        commandJob = viewModelScope.launch {
            try {
                operation(accountId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (generation == expected && !sessionEnded(error)) mutableState.update {
                    if (deleting) it.copy(deletionProblem = problem(error)) else it.copy(problem = problem(error))
                }
            } finally {
                if (generation == expected) {
                    updatePolling()
                    mutableState.update { it.copy(busy = false) }
                }
            }
        }
    }

    private fun sessionEnded(error: Exception): Boolean {
        if (error !is IdentityFailure || (error.status != 401 && error.code != "ACCOUNT_CHANGED")) return false
        visible = false
        exportIntent = null
        mutableState.value = AccountDataState(signInRequired = true)
        updatePolling()
        return true
    }

    private fun problem(error: Exception): AccountDataProblem = when (error) {
        is IdentityFailure -> AccountDataProblem(error.code, error.details)
        is IOException -> AccountDataProblem("OFFLINE")
        else -> AccountDataProblem("REQUEST_FAILED")
    }
}