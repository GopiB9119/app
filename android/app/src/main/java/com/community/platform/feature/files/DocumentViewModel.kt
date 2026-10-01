package com.community.platform.feature.files

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.UUID
import javax.inject.Inject

enum class DocumentIssue { CONNECTION, RESPONSE, ADD_UNCERTAIN, DELETE_UNCERTAIN, UNAVAILABLE }
enum class DocumentNotice { ADDED, DELETED, ALREADY_DELETED }

data class DocumentsState(
    val accountId: String? = null,
    val spaceId: String? = null,
    val spaceName: String = "",
    val documents: List<DocumentDto> = emptyList(),
    val nextCursor: String? = null,
    val loaded: Boolean = false,
    val viewingId: String? = null,
    val selected: DocumentDto? = null,
    val lineRange: DocumentLineRange? = null,
    val chosen: ChosenDocument? = null,
    val choiceKey: String? = null,
    val pending: DocumentCreateIntent? = null,
    val pendingDelete: DocumentDeleteIntent? = null,
    val confirmingDelete: Boolean = false,
    val loading: Boolean = false,
    val working: Boolean = false,
    val choosing: Boolean = false,
    val problem: DocumentProblem? = null,
    val issue: DocumentIssue? = null,
    val error: String? = null,
    val notice: DocumentNotice? = null,
    val requiresSignIn: Boolean = false,
    val unavailable: Boolean = false,
) {
    val busy: Boolean get() = loading || working || choosing
    val uncertain: Boolean get() = pending != null || pendingDelete != null
}

@HiltViewModel
class DocumentViewModel @Inject constructor(private val repository: DocumentRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(DocumentsState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var loadJob: Job? = null
    private var commandJob: Job? = null
    private var choiceJob: Job? = null
    private val cursors = mutableSetOf<String>()

    fun bind(accountId: String?, spaceId: String?, spaceName: String = "", documentId: String? = null, range: DocumentLineRange? = null) {
        val current = mutableState.value
        if (current.accountId == accountId && current.spaceId == spaceId) return
        generation += 1
        loadJob?.cancel(); commandJob?.cancel(); choiceJob?.cancel()
        cursors.clear()
        mutableState.value = DocumentsState(accountId = accountId, spaceId = spaceId, spaceName = spaceName)
        if (accountId != null && spaceId != null) {
            if (documentId == null) reload() else open(documentId, range)
        }
    }

    private fun fail(error: Exception, expected: Long, uncertain: DocumentIssue? = null) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            loadJob?.cancel(); choiceJob?.cancel()
            cursors.clear()
            mutableState.value = DocumentsState(accountId = mutableState.value.accountId, spaceId = mutableState.value.spaceId, requiresSignIn = true)
            return
        }
        val unknown = failure == null || failure.status == 0 || failure.status >= 500 || failure.status == 408
        mutableState.update {
            it.copy(error = if (!unknown) failure?.message else null,
                issue = when { unknown && uncertain != null -> uncertain; error is IOException -> DocumentIssue.CONNECTION; unknown -> DocumentIssue.RESPONSE; else -> null })
        }
    }

    fun reload(more: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        if (current.busy || current.uncertain || current.requiresSignIn) return
        val cursor = if (more) current.nextCursor ?: return else null
        val expected = generation
        mutableState.update { it.copy(loading = true, error = null, issue = null) }
        loadJob = viewModelScope.launch {
            try {
                var restarted = false
                val page = try {
                    repository.list(account, space, cursor, if (more) current.documents.map(DocumentDto::id).toSet() else emptySet(),
                        if (more) cursors.toSet() else emptySet())
                } catch (error: IdentityFailure) {
                    if (!more || error.code !in setOf("CURSOR_INVALID", "CURSOR_EXPIRED")) throw error
                    restarted = true
                    repository.list(account, space, null)
                }
                if (generation == expected) {
                    if (!more || restarted) cursors.clear()
                    if (more && !restarted && cursor != null) cursors += cursor
                    mutableState.update { it.copy(documents = if (more && !restarted) it.documents + page.items else page.items,
                        nextCursor = page.nextCursor, loaded = true, unavailable = false) }
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                fail(error, expected)
                if (generation == expected && (error as? IdentityFailure)?.status == 404) {
                    mutableState.update { it.copy(documents = emptyList(), selected = null, nextCursor = null, unavailable = true) }
                }
            } finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }

    fun choose(file: ChosenDocument) {
        val current = mutableState.value
        if (current.busy || current.uncertain || current.requiresSignIn || current.unavailable) return
        val problem = documentNameProblem(file.name) ?: documentTextProblem(file.content)
        if (problem != null || file.content != normalizedDocumentText(file.content)) {
            mutableState.update { it.copy(problem = problem ?: DocumentProblem.CONTROL) }
            return
        }
        mutableState.update { it.copy(chosen = file, choiceKey = UUID.randomUUID().toString(), problem = null, error = null, issue = null, notice = null) }
    }

    fun chooseFile(read: () -> ChosenDocument) {
        val current = mutableState.value
        if (current.busy || current.uncertain || current.requiresSignIn || current.unavailable) return
        val expected = generation
        mutableState.update { it.copy(choosing = true, problem = null, error = null, issue = null, notice = null) }
        choiceJob = viewModelScope.launch {
            try {
                val file = withContext(Dispatchers.IO) { read().also { ensureActive() } }
                if (generation == expected) mutableState.update {
                    it.copy(chosen = file, choiceKey = UUID.randomUUID().toString())
                }
            } catch (error: CancellationException) { throw error }
            catch (error: DocumentFileFailure) { if (generation == expected) mutableState.update { it.copy(problem = error.problem) } }
            catch (_error: Exception) { if (generation == expected) mutableState.update { it.copy(problem = DocumentProblem.READ) } }
            finally { if (generation == expected) mutableState.update { it.copy(choosing = false) } }
        }
    }

    fun add() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        val file = current.chosen ?: return
        val key = current.choiceKey ?: return
        if (current.busy || current.uncertain || current.requiresSignIn || current.unavailable) return
        val intent = DocumentCreateIntent(account, space, key, file.body)
        mutableState.update { it.copy(pending = intent) }
        submit(intent)
    }

    fun retry() { mutableState.value.pending?.let(::submit) }

    private fun submit(intent: DocumentCreateIntent) {
        val current = mutableState.value
        if (current.busy || current.accountId != intent.accountId || current.spaceId != intent.spaceId || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(working = true, error = null, issue = null, notice = null) }
        commandJob = viewModelScope.launch {
            try {
                val created = repository.create(intent)
                if (generation == expected) mutableState.update {
                    it.copy(pending = null, chosen = null, choiceKey = null,
                        documents = if (created.status == "active") listOf(created) + it.documents.filterNot { item -> item.id == created.id }
                            else it.documents.filterNot { item -> item.id == created.id },
                        notice = if (created.status == "active") DocumentNotice.ADDED else DocumentNotice.ALREADY_DELETED)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (generation == expected && (error as? IdentityFailure)?.status?.let { it in 400..499 && it != 408 } == true) {
                    mutableState.update { it.copy(pending = null) }
                }
                fail(error, expected, DocumentIssue.ADD_UNCERTAIN)
                if (generation == expected && (error as? IdentityFailure)?.status == 404) {
                    mutableState.update { it.copy(documents = emptyList(), selected = null, nextCursor = null, chosen = null, choiceKey = null, unavailable = true) }
                }
            } finally { if (generation == expected) mutableState.update { it.copy(working = false) } }
        }
    }

    fun open(documentId: String, range: DocumentLineRange? = null) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        if (current.busy || current.uncertain || current.requiresSignIn || current.unavailable) return
        val expected = generation
        mutableState.update { it.copy(viewingId = documentId, selected = null, lineRange = range, loading = true, error = null,
            issue = null, problem = null, notice = null, confirmingDelete = false) }
        loadJob = viewModelScope.launch {
            try {
                val detail = repository.read(account, documentId, space)
                if (range != null && detail.status == "active" && (range.first < 1 || range.last < range.first || range.last > documentLines(detail.content!!).size)) {
                    throw IdentityFailure("INVALID_RESPONSE", "The cited document lines could not be confirmed.")
                }
                if (generation == expected) mutableState.update { it.copy(selected = detail, spaceName = detail.spaceName) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                fail(error, expected)
                if (generation == expected && (error as? IdentityFailure)?.status == 404) mutableState.update {
                    it.copy(issue = DocumentIssue.UNAVAILABLE, documents = it.documents.filterNot { item -> item.id == documentId })
                }
            } finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }

    fun closeViewer() {
        val current = mutableState.value
        if (current.busy || current.uncertain) return
        mutableState.update { it.copy(viewingId = null, selected = null, lineRange = null, confirmingDelete = false, error = null, issue = null) }
        if (!current.loaded) reload()
    }

    fun askDelete() {
        val current = mutableState.value
        if (!current.busy && !current.uncertain && current.selected?.canDelete == true) mutableState.update { it.copy(confirmingDelete = true) }
    }

    fun keepDocument() { if (!mutableState.value.working) mutableState.update { it.copy(confirmingDelete = false) } }

    fun delete() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val document = current.selected ?: return
        if (!current.confirmingDelete || current.busy || current.uncertain || document.canDelete != true) return
        val intent = DocumentDeleteIntent(account, document.id, document.spaceId)
        mutableState.update { it.copy(pendingDelete = intent, confirmingDelete = false) }
        submitDelete(intent)
    }

    fun retryDelete() { mutableState.value.pendingDelete?.let(::submitDelete) }

    private fun submitDelete(intent: DocumentDeleteIntent) {
        val current = mutableState.value
        if (current.busy || current.accountId != intent.accountId || current.spaceId != intent.spaceId || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(working = true, error = null, issue = null, notice = null) }
        commandJob = viewModelScope.launch {
            try {
                val deleted = repository.delete(intent)
                if (generation == expected) mutableState.update {
                    it.copy(pendingDelete = null, selected = it.selected?.copy(status = "deleted", name = null, mediaType = null,
                        sizeBytes = null, lineCount = null, sha256 = null, content = null, canDelete = false, deletedAt = deleted.deletedAt),
                        documents = it.documents.filterNot { item -> item.id == deleted.id }, notice = DocumentNotice.DELETED)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (generation == expected && (error as? IdentityFailure)?.status?.let { it in 400..499 && it != 408 } == true) {
                    mutableState.update { it.copy(pendingDelete = null) }
                }
                fail(error, expected, DocumentIssue.DELETE_UNCERTAIN)
                if (generation == expected && (error as? IdentityFailure)?.status == 404) mutableState.update {
                    it.copy(selected = null, documents = it.documents.filterNot { item -> item.id == intent.documentId }, issue = DocumentIssue.UNAVAILABLE)
                }
            } finally { if (generation == expected) mutableState.update { it.copy(working = false) } }
        }
    }

    fun discardPending() {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(pending = null, pendingDelete = null, chosen = null, choiceKey = null, error = null, issue = null) }
    }
}