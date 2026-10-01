package com.community.platform.feature.agents

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
import java.util.UUID
import javax.inject.Inject

enum class AgentView { REQUESTS, MEMORIES }

/** CONNECTION and RESPONSE stop a read; UNCERTAIN means a change may or may not have been saved. */
enum class AgentIssue { CONNECTION, RESPONSE, UNCERTAIN }

/** Where a problem is shown: the composer, a request card (its run ID), the memory list or the delete dialog. */
const val AGENT_AT_COMPOSER = "composer"
const val AGENT_AT_MEMORIES = "memories"

data class AgentState(
    val accountId: String? = null,
    val view: AgentView = AgentView.REQUESTS,
    val spaces: List<SpaceDto> = emptyList(),
    val spacesLoaded: Boolean = false,
    val spaceId: String? = null,
    val message: String = "",
    val runs: List<AgentRunDto> = emptyList(),
    val nextCursor: String? = null,
    val runsLoaded: Boolean = false,
    val memories: List<AgentMemoryDto> = emptyList(),
    val memoriesLoaded: Boolean = false,
    val replies: Map<String, String> = emptyMap(),
    val confirmingForget: AgentMemoryDto? = null,
    val running: AgentCommand? = null,
    val pending: AgentCommand? = null,
    val loading: Boolean = false,
    val problem: AgentProblem? = null,
    val issue: AgentIssue? = null,
    val error: String? = null,
    val at: String? = null,
    val requiresSignIn: Boolean = false,
) {
    val busy: Boolean get() = loading || running != null
    val uncertain: Boolean get() = pending != null
    val space: SpaceDto? get() = spaces.firstOrNull { it.id == spaceId }
}

@HiltViewModel
class AgentViewModel @Inject constructor(private val repository: AgentRepository, private val spaces: SpaceRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(AgentState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var loadJob: Job? = null
    private var commandJob: Job? = null
    private val cursors = mutableSetOf<String>()
    // One key per approval and choice, so pressing Approve again can never approve a second time.
    private val decisionKeys = mutableMapOf<String, String>()

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        loadJob?.cancel(); commandJob?.cancel()
        cursors.clear(); decisionKeys.clear()
        mutableState.value = AgentState(accountId = accountId)
        if (accountId != null) reloadSpaces()
    }

    private fun idle(current: AgentState = mutableState.value) = !current.busy && !current.uncertain && !current.requiresSignIn

    private fun fail(error: Exception, expected: Long, at: String?, command: AgentCommand? = null) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            loadJob?.cancel(); commandJob?.cancel()
            cursors.clear(); decisionKeys.clear()
            mutableState.value = AgentState(accountId = mutableState.value.accountId, requiresSignIn = true)
            return
        }
        val unknown = failure == null || failure.status == 0 || failure.status >= 500 || failure.status == 408
        mutableState.update {
            it.copy(pending = if (unknown && command != null) command else it.pending, at = at,
                error = if (!unknown) failure?.message else null,
                issue = when { unknown && command != null -> AgentIssue.UNCERTAIN; error is IOException -> AgentIssue.CONNECTION; unknown -> AgentIssue.RESPONSE; else -> null })
        }
    }

    fun reloadSpaces() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (!idle(current)) return
        val expected = generation
        mutableState.update { it.copy(loading = true, problem = null, issue = null, error = null, at = null) }
        loadJob = viewModelScope.launch {
            try {
                val loaded = mutableListOf<SpaceDto>()
                val seen = mutableSetOf<String>()
                var cursor: String? = null
                do {
                    val page = spaces.spaces(account, cursor)
                    if (page.items.any { item -> loaded.any { it.id == item.id } } || loaded.size + page.items.size > 50) {
                        throw IdentityFailure("INVALID_RESPONSE", "The Space list could not be confirmed.")
                    }
                    loaded += page.items
                    cursor = page.nextCursor
                    if (cursor != null && !seen.add(cursor)) throw IdentityFailure("INVALID_RESPONSE", "The Space list did not advance.")
                } while (cursor != null)
                if (generation == expected) {
                    val chosen = mutableState.value.spaceId?.takeIf { id -> loaded.any { it.id == id } } ?: loaded.firstOrNull()?.id
                    mutableState.update { it.copy(spaces = loaded.toList(), spacesLoaded = true, spaceId = chosen) }
                    // The first page loads in the same job, so the screen never looks idle between the two reads.
                    if (chosen != null) {
                        val page = repository.runs(account, chosen, null)
                        if (generation == expected && mutableState.value.spaceId == chosen) {
                            cursors.clear()
                            mutableState.update { it.copy(runs = page.items, nextCursor = page.nextCursor, runsLoaded = true) }
                        }
                    }
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected, AGENT_AT_COMPOSER) }
            finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }

    fun show(view: AgentView) {
        val current = mutableState.value
        if (current.view == view || current.busy || current.uncertain || current.requiresSignIn) return
        mutableState.update { it.copy(view = view, problem = null, issue = null, error = null, at = null, confirmingForget = null) }
        if (view == AgentView.MEMORIES) reloadMemories() else if (current.spaceId != null) reload()
    }

    fun chooseSpace(spaceId: String) {
        val current = mutableState.value
        if (!idle(current) || current.spaceId == spaceId || current.spaces.none { it.id == spaceId }) return
        cursors.clear()
        mutableState.update { it.copy(spaceId = spaceId, runs = emptyList(), nextCursor = null, runsLoaded = false, replies = emptyMap(),
            problem = null, issue = null, error = null, at = null) }
        reload()
    }

    fun reload(more: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        if (!idle(current)) return
        val cursor = if (more) current.nextCursor ?: return else null
        val expected = generation
        mutableState.update { it.copy(loading = true, issue = null, error = null, at = null) }
        loadJob = viewModelScope.launch {
            try {
                var restarted = false
                val page = try {
                    repository.runs(account, space, cursor, if (more) current.runs.map(AgentRunDto::id).toSet() else emptySet(),
                        if (more) cursors.toSet() else emptySet())
                } catch (error: IdentityFailure) {
                    if (!more || error.code !in setOf("CURSOR_INVALID", "CURSOR_EXPIRED")) throw error
                    restarted = true
                    repository.runs(account, space, null)
                }
                if (generation == expected && mutableState.value.spaceId == space) {
                    if (!more || restarted) cursors.clear()
                    if (more && !restarted && cursor != null) cursors += cursor
                    mutableState.update { it.copy(runs = if (more && !restarted) it.runs + page.items else page.items,
                        nextCursor = page.nextCursor, runsLoaded = true) }
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected, AGENT_AT_COMPOSER) }
            finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }

    fun reloadMemories() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (!idle(current)) return
        val expected = generation
        mutableState.update { it.copy(loading = true, issue = null, error = null, at = null) }
        loadJob = viewModelScope.launch {
            try {
                val loaded = repository.memories(account)
                if (generation == expected) mutableState.update { it.copy(memories = loaded, memoriesLoaded = true) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected, AGENT_AT_MEMORIES) }
            finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }

    fun message(value: String) {
        val current = mutableState.value
        if (current.busy || current.pending is AgentCommand.Ask || current.requiresSignIn) return
        mutableState.update { it.copy(message = value, problem = null, error = if (it.at == AGENT_AT_COMPOSER) null else it.error) }
    }

    fun ask() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        if (!idle(current)) return
        val message = normalizedAgentMessage(current.message)
        agentMessageProblem(message)?.let { problem -> mutableState.update { it.copy(problem = problem, issue = null, error = null, at = AGENT_AT_COMPOSER) }; return }
        submit(AgentCommand.Ask(account, space, message, UUID.randomUUID().toString()))
    }

    fun reply(runId: String, value: String) {
        if (mutableState.value.busy || mutableState.value.pending?.runId == runId) return
        mutableState.update { it.copy(replies = it.replies + (runId to value)) }
    }

    fun answer(runId: String) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val run = current.runs.firstOrNull { it.id == runId } ?: return
        val question = run.question ?: return
        if (!idle(current)) return
        val answer = normalizedAgentMessage(current.replies[runId].orEmpty())
        if (agentMessageProblem(answer) != null) return
        submit(AgentCommand.Answer(account, run.spaceId, run.id, question.id, answer))
    }

    fun decide(runId: String, approve: Boolean) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val run = current.runs.firstOrNull { it.id == runId } ?: return
        val approval = run.approval ?: return
        if (!idle(current) || !run.awaitingApproval) return
        val key = decisionKeys.getOrPut("${approval.id}:$approve") { UUID.randomUUID().toString() }
        submit(AgentCommand.Decide(account, run.spaceId, run.id, approval.id, approval.etag, approve, key))
    }

    fun stop(runId: String) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val run = current.runs.firstOrNull { it.id == runId } ?: return
        if (!idle(current) || run.question == null) return
        submit(AgentCommand.Stop(account, run.spaceId, run.id))
    }

    fun askForget(memory: AgentMemoryDto) {
        val current = mutableState.value
        if (!idle(current) || current.memories.none { it.id == memory.id }) return
        mutableState.update { it.copy(confirmingForget = memory, issue = null, error = null, at = null) }
    }

    fun keepMemory() {
        val current = mutableState.value
        if (current.running is AgentCommand.Forget || current.pending is AgentCommand.Forget) return
        mutableState.update { it.copy(confirmingForget = null, issue = null, error = null, at = null) }
    }

    fun forget() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val memory = current.confirmingForget ?: return
        if (!idle(current)) return
        submit(AgentCommand.Forget(account, memory.id))
    }

    /** Sends the unconfirmed command again with exactly the same content and key. */
    fun retry() { mutableState.value.pending?.let(::submit) }

    /** Drops an unconfirmed command and reloads, so the screen shows what the service actually has. */
    fun discard() {
        val current = mutableState.value
        val pending = current.pending ?: return
        if (current.busy) return
        mutableState.update { it.copy(pending = null, issue = null, error = null, at = null,
            confirmingForget = if (pending is AgentCommand.Forget) null else it.confirmingForget) }
        if (current.view == AgentView.MEMORIES) reloadMemories() else reload()
    }

    private fun submit(command: AgentCommand) {
        val current = mutableState.value
        if (current.busy || current.requiresSignIn || current.accountId != command.accountId) return
        if (current.pending != null && current.pending != command) return
        val at = command.runId ?: if (command is AgentCommand.Forget) AGENT_AT_MEMORIES else AGENT_AT_COMPOSER
        val expected = generation
        mutableState.update { it.copy(running = command, problem = null, issue = null, error = null, at = null) }
        commandJob = viewModelScope.launch {
            try {
                when (command) {
                    is AgentCommand.Forget -> {
                        repository.forget(command)
                        if (generation == expected) mutableState.update {
                            it.copy(pending = null, confirmingForget = null, memories = it.memories.filterNot { memory -> memory.id == command.memoryId })
                        }
                    }
                    else -> {
                        val changed = when (command) {
                            is AgentCommand.Ask -> repository.ask(command)
                            is AgentCommand.Answer -> repository.answer(command)
                            is AgentCommand.Decide -> repository.decide(command)
                            is AgentCommand.Stop -> repository.stop(command)
                            is AgentCommand.Forget -> error("Handled above")
                        }
                        if (generation == expected && mutableState.value.spaceId == command.spaceIdOrNull()) mutableState.update {
                            val listed = it.runs.any { run -> run.id == changed.id }
                            it.copy(pending = null,
                                runs = if (listed) it.runs.map { run -> if (run.id == changed.id) changed else run } else listOf(changed) + it.runs,
                                message = if (command is AgentCommand.Ask) "" else it.message,
                                replies = if (command is AgentCommand.Answer || command is AgentCommand.Stop) it.replies - changed.id else it.replies)
                        } else if (generation == expected) mutableState.update { it.copy(pending = null) }
                    }
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val status = (error as? IdentityFailure)?.status
                val definite = status != null && status in 400..499 && status != 408
                if (generation == expected && definite) mutableState.update { it.copy(pending = null) }
                fail(error, expected, at, command)
                // A definite refusal means the screen is out of date, for example an approval that changed or expired.
                // After a 401 or an account change, fail() has already moved to a new generation, so nothing reloads.
                // The reload marks the screen as loading before this command stops running, so it never looks idle in between.
                if (generation == expected && definite) {
                    when (command) {
                        is AgentCommand.Forget -> reloadMemoriesKeepingError()
                        is AgentCommand.Ask -> Unit
                        else -> reloadKeepingError()
                    }
                }
            } finally { if (generation == expected) mutableState.update { it.copy(running = null) } }
        }
    }

    private fun AgentCommand.spaceIdOrNull(): String? = when (this) {
        is AgentCommand.Ask -> spaceId
        is AgentCommand.Answer -> spaceId
        is AgentCommand.Decide -> spaceId
        is AgentCommand.Stop -> spaceId
        is AgentCommand.Forget -> null
    }

    private fun reloadKeepingError() {
        val saved = mutableState.value
        val account = saved.accountId ?: return
        val space = saved.spaceId ?: return
        val expected = generation
        mutableState.update { it.copy(loading = true) }
        loadJob = viewModelScope.launch {
            try {
                val page = repository.runs(account, space, null)
                if (generation == expected && mutableState.value.spaceId == space) {
                    cursors.clear()
                    mutableState.update { it.copy(runs = page.items, nextCursor = page.nextCursor, runsLoaded = true) }
                }
            } catch (error: CancellationException) { throw error }
            catch (_error: Exception) { }
            finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }

    private fun reloadMemoriesKeepingError() {
        val account = mutableState.value.accountId ?: return
        val expected = generation
        mutableState.update { it.copy(loading = true) }
        loadJob = viewModelScope.launch {
            try {
                val loaded = repository.memories(account)
                if (generation == expected) mutableState.update {
                    it.copy(memories = loaded, memoriesLoaded = true,
                        confirmingForget = it.confirmingForget?.takeIf { memory -> loaded.any { item -> item.id == memory.id } })
                }
            } catch (error: CancellationException) { throw error }
            catch (_error: Exception) { }
            finally { if (generation == expected) mutableState.update { it.copy(loading = false) } }
        }
    }
}
