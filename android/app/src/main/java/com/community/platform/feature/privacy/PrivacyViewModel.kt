package com.community.platform.feature.privacy

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.agents.AgentCommand
import com.community.platform.feature.agents.AgentMemoryDto
import com.community.platform.feature.agents.AgentRepository
import com.community.platform.feature.community.ClassificationRepository
import com.community.platform.feature.community.InterestPart
import com.community.platform.feature.community.InterestsDto
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.SecurityEventDto
import com.community.platform.feature.scheduling.ReminderPreferences
import com.community.platform.feature.scheduling.ReminderRepository
import com.community.platform.feature.scheduling.ReminderRequestDirection
import com.community.platform.feature.scheduling.ReminderRequestDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

/** A permission the person can take back, through the operation that already owns it (DEC-034). */
sealed interface TakeBack {
    val name: String
    data class Request(val request: ReminderRequestDto) : TakeBack { override val name get() = request.taskTitle }
    data class InApp(override val name: String, val etag: String) : TakeBack
    data class Memory(val memory: AgentMemoryDto) : TakeBack { override val name get() = memory.content }
    data class Interests(override val name: String, val opened: InterestsDto) : TakeBack
}

enum class PrivacyIssue { CONNECTION, LOAD, TAKE_BACK }

data class PrivacyState(
    val accountId: String? = null,
    val loading: Boolean = false,
    val requests: List<ReminderRequestDto> = emptyList(),
    val inApp: ReminderPreferences? = null,
    val memories: List<AgentMemoryDto> = emptyList(),
    val interests: InterestsDto? = null,
    val activity: List<SecurityEventDto> = emptyList(),
    val confirm: TakeBack? = null,
    val working: Boolean = false,
    val done: Boolean = false,
    val issue: PrivacyIssue? = null,
    val requiresSignIn: Boolean = false,
) {
    val interestCount: Int get() = interests?.let { it.topics.size + it.interests.size + it.languages.size + it.places.size } ?: 0
}

private const val MAX_PAGES = 10

@HiltViewModel
class PrivacyViewModel @Inject constructor(
    private val reminders: ReminderRepository,
    private val agent: AgentRepository,
    private val classification: ClassificationRepository,
    private val accounts: AccountRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(PrivacyState())
    val state = mutableState.asStateFlow()
    @Volatile private var generation = 0L
    @Volatile private var loads = 0L
    private var job: Job? = null

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        job?.cancel()
        mutableState.value = PrivacyState(accountId = accountId)
        if (accountId != null) load(clearIssue = true)
    }

    fun refresh() { if (!mutableState.value.working) load(clearIssue = true) }

    /** After a take-back the page reloads either way; a failed take-back keeps its message through that reload. */
    private fun load(clearIssue: Boolean) {
        val account = mutableState.value.accountId ?: return
        val expected = generation
        val mine = ++loads
        job?.cancel()
        mutableState.update { if (clearIssue) it.copy(loading = true, issue = null, done = false) else it.copy(loading = true) }
        job = viewModelScope.launch {
            try {
                val requests = standingRequests(account)
                val inApp = reminders.preferences(account)
                val memories = agent.memories(account)
                val interests = classification.interests(account)
                val activity = accounts.events(account).take(20)
                mutableState.update {
                    if (generation != expected || loads != mine) it
                    else it.copy(requests = requests, inApp = inApp, memories = memories, interests = interests, activity = activity)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { if (loads == mine) fail(expected, error, PrivacyIssue.LOAD) }
            // A cancelled older load must not end a newer one's progress, so the check sits inside update's retry.
            finally { mutableState.update { if (generation == expected && loads == mine) it.copy(loading = false) else it } }
        }
    }

    /** Accepted requests whose reminder is still to come: the reminders other members may still send. */
    private suspend fun standingRequests(account: String): List<ReminderRequestDto> {
        val accepted = mutableListOf<ReminderRequestDto>()
        var cursor: String? = null
        for (page in 0 until MAX_PAGES) {
            val result = reminders.requests(account, ReminderRequestDirection.RECEIVED, cursor)
            accepted += result.items.filter { it.status == "accepted" && it.reminderId != null }
            cursor = result.nextCursor ?: break
        }
        val wanted = accepted.mapNotNull { it.reminderId }.toSet()
        val scheduled = mutableSetOf<String>()
        val seen = mutableSetOf<String>()
        cursor = null
        for (page in 0 until MAX_PAGES) {
            if (seen.containsAll(wanted)) break
            val result = reminders.reminders(account, null, cursor)
            result.items.filter { it.id in wanted }.forEach { seen += it.id; if (it.status == "scheduled") scheduled += it.id }
            cursor = result.nextCursor ?: break
        }
        return accepted.filter { it.reminderId in scheduled }
    }

    fun ask(item: TakeBack) { mutableState.update { if (it.working) it else it.copy(confirm = item, issue = null, done = false) } }
    fun keep() { mutableState.update { if (it.working) it else it.copy(confirm = null) } }

    fun confirm() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val item = current.confirm ?: return
        if (current.working) return
        val expected = generation
        mutableState.update { it.copy(working = true, issue = null, done = false) }
        viewModelScope.launch {
            var failed = false
            try {
                when (item) {
                    is TakeBack.Request -> reminders.cancel(account, item.request.reminderId!!)
                    is TakeBack.InApp -> reminders.setPreferences(account, false, item.etag)
                    is TakeBack.Memory -> agent.forget(AgentCommand.Forget(account, item.memory.id))
                    is TakeBack.Interests -> classification.setInterests(account, item.opened, InterestPart.entries.associateWith { emptyList() })
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { failed = true; fail(expected, error, PrivacyIssue.TAKE_BACK) }
            finally {
                // Success or not, the page reloads so it shows what the server now holds. The reload starts before the
                // command ends, so the page never looks settled in between.
                if (generation == expected && !mutableState.value.requiresSignIn) {
                    load(clearIssue = false)
                    mutableState.update { it.copy(working = false, confirm = null, done = !failed) }
                }
            }
        }
    }

    private fun fail(expected: Long, error: Exception, issue: PrivacyIssue) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") { mutableState.update { PrivacyState(accountId = it.accountId, requiresSignIn = true) }; return }
        mutableState.update { it.copy(issue = if (error is IOException) PrivacyIssue.CONNECTION else issue) }
    }
}
