package com.community.platform.feature.community

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.UUID
import javax.inject.Inject

enum class ModerationTab { REPORTS, APPEALS }
enum class ModerationMessage { DECISION_RECORDED, APPEAL_RESOLVED, APPEAL_SENT }
data class ModerationProblem(val code: String, val message: String? = null)
data class ModerationList<Value>(val items: List<Value> = emptyList(), val loading: Boolean = false, val loaded: Boolean = false, val error: ModerationProblem? = null)
data class ModerationDecisionDraft(val action: String? = null, val reason: String, val note: String = "", val error: ModerationProblem? = null)
data class ModerationAppealDraft(val note: String = "", val error: ModerationProblem? = null)
data class ModerationResolutionDraft(val note: String = "", val outcome: String? = null, val error: ModerationProblem? = null)

data class ModerationState(
    val accountId: String? = null,
    val reviewing: Boolean = false,
    val tab: ModerationTab = ModerationTab.REPORTS,
    val moderator: Boolean? = null,
    val accessLoading: Boolean = false,
    val accessError: ModerationProblem? = null,
    val queue: ModerationList<ModerationQueueDto> = ModerationList(),
    val nextCursor: String? = null,
    val appeals: ModerationList<ModerationAppealReviewDto> = ModerationList(),
    val notices: ModerationList<ModerationNoticeDto> = ModerationList(),
    val reports: ModerationList<MyReportDto> = ModerationList(),
    val decisions: Map<String, ModerationDecisionDraft> = emptyMap(),
    val resolutions: Map<String, ModerationResolutionDraft> = emptyMap(),
    val appealDrafts: Map<String, ModerationAppealDraft> = emptyMap(),
    val selectedNoticeId: String? = null,
    val working: Boolean = false,
    val message: ModerationMessage? = null,
    val requiresSignIn: Boolean = false,
) {
    val busy: Boolean get() = accessLoading || queue.loading || appeals.loading || notices.loading || reports.loading || working
    fun draft(item: ModerationQueueDto): ModerationDecisionDraft = decisions[item.key] ?: ModerationDecisionDraft(reason = item.defaultReason)
}

@HiltViewModel
class ModerationViewModel @Inject constructor(private val repository: ModerationRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(ModerationState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var accessJob: Job? = null
    private var queueJob: Job? = null
    private var appealsJob: Job? = null
    private var safetyJob: Job? = null
    private val decisionIntents = mutableMapOf<String, ModerationDecisionIntent>()
    private val appealIntents = mutableMapOf<String, ModerationAppealIntent>()
    private val resolutionIntents = mutableMapOf<String, ModerationResolveBodyDto>()

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        viewModelScope.coroutineContext.cancelChildren()
        clearIntents()
        mutableState.value = ModerationState(accountId = accountId)
    }

    private fun clearIntents() { decisionIntents.clear(); appealIntents.clear(); resolutionIntents.clear() }
    private fun update(expected: Long, transform: (ModerationState) -> ModerationState) {
        if (generation == expected) mutableState.update(transform)
    }

    private fun problem(error: Exception, expected: Long): ModerationProblem {
        if (error is CancellationException) throw error
        val failure = error as? IdentityFailure
        val result = ModerationProblem(failure?.code ?: if (error is IOException) "OFFLINE" else "UNKNOWN", failure?.message)
        if (generation != expected) return result
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            clearIntents()
            mutableState.value = ModerationState(accountId = mutableState.value.accountId, requiresSignIn = true)
            viewModelScope.coroutineContext.cancelChildren()
        } else if (failure?.code == "MODERATOR_REQUIRED") {
            denyModerator()
        }
        return result
    }

    private fun denyModerator() {
        decisionIntents.clear(); resolutionIntents.clear()
        mutableState.update { it.copy(moderator = false, queue = ModerationList(), appeals = ModerationList(), nextCursor = null, decisions = emptyMap(), resolutions = emptyMap()) }
    }

    private fun checkAccess() {
        val account = mutableState.value.accountId ?: return
        val expected = generation
        accessJob?.cancel()
        mutableState.update { it.copy(accessLoading = true, accessError = null) }
        accessJob = viewModelScope.launch {
            try {
                val allowed = repository.isModerator(account)
                if (generation == expected) {
                    if (allowed) mutableState.update { it.copy(moderator = true) } else denyModerator()
                    if (allowed && mutableState.value.reviewing) loadSelected()
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = problem(error, expected)
                update(expected) { it.copy(accessError = failure) }
            } finally { update(expected) { it.copy(accessLoading = false) } }
        }
    }

    fun loadSafety() {
        val account = mutableState.value.accountId ?: return
        if (mutableState.value.working) return
        val expected = generation
        checkAccess()
        safetyJob?.cancel()
        mutableState.update { it.copy(notices = it.notices.copy(loading = true, error = null), reports = it.reports.copy(loading = true, error = null)) }
        safetyJob = viewModelScope.launch {
            try {
                val notices = repository.notices(account)
                update(expected) { it.copy(notices = ModerationList(notices, loaded = true)) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = problem(error, expected)
                update(expected) { it.copy(notices = it.notices.copy(loading = false, error = failure)) }
            }
            if (generation != expected) return@launch
            try {
                val reports = repository.reports(account)
                update(expected) { it.copy(reports = ModerationList(reports, loaded = true)) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = problem(error, expected)
                update(expected) { it.copy(reports = it.reports.copy(loading = false, error = failure)) }
            }
        }
    }

    fun openModeration() {
        if (mutableState.value.working) return
        mutableState.update { it.copy(reviewing = true, message = null) }
        checkAccess()
    }

    fun closeModeration() {
        if (!mutableState.value.working) mutableState.update { it.copy(reviewing = false, message = null) }
    }

    fun refresh() { if (!mutableState.value.working) checkAccess() }

    fun selectTab(tab: ModerationTab) {
        if (mutableState.value.working) return
        mutableState.update { it.copy(tab = tab, message = null) }
        val loaded = if (tab == ModerationTab.REPORTS) mutableState.value.queue.loaded else mutableState.value.appeals.loaded
        if (!loaded) loadSelected()
    }

    private fun loadSelected() { if (mutableState.value.tab == ModerationTab.REPORTS) loadQueue() else loadAppeals() }

    fun loadQueue(more: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.moderator != true || current.working) return
        val cursor = if (more) current.nextCursor ?: return else null
        val expected = generation
        queueJob?.cancel()
        mutableState.update { it.copy(queue = it.queue.copy(loading = true, error = null)) }
        queueJob = viewModelScope.launch {
            try {
                var restarted = false
                val page = try { repository.queue(account, cursor) }
                catch (error: IdentityFailure) {
                    if (cursor == null || error.code !in setOf("CURSOR_EXPIRED", "CURSOR_INVALID")) throw error
                    restarted = true
                    repository.queue(account, null)
                }
                update(expected) {
                    if (it.moderator != true) it else it.copy(
                        queue = ModerationList(if (more && !restarted) (it.queue.items + page.items).distinctBy(ModerationQueueDto::key) else page.items, loaded = true),
                        nextCursor = page.nextCursor,
                    )
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = problem(error, expected)
                update(expected) { if (it.moderator != true) it else it.copy(queue = it.queue.copy(loading = false, error = failure)) }
            } finally { update(expected) { it.copy(queue = it.queue.copy(loading = false)) } }
        }
    }

    fun loadAppeals() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.moderator != true || current.working) return
        val expected = generation
        appealsJob?.cancel()
        mutableState.update { it.copy(appeals = it.appeals.copy(loading = true, error = null)) }
        appealsJob = viewModelScope.launch {
            try {
                val appeals = repository.appeals(account)
                update(expected) { if (it.moderator != true) it else it.copy(appeals = ModerationList(appeals, loaded = true)) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = problem(error, expected)
                update(expected) { if (it.moderator != true) it else it.copy(appeals = it.appeals.copy(loading = false, error = failure)) }
            } finally { update(expected) { it.copy(appeals = it.appeals.copy(loading = false)) } }
        }
    }

    fun editDecision(item: ModerationQueueDto, action: String?, reason: String, note: String) {
        val current = mutableState.value
        if (current.working || current.moderator != true || current.queue.items.none { it.key == item.key }) return
        val draft = ModerationDecisionDraft(action, reason, note)
        if (current.draft(item).copy(error = null) != draft) decisionIntents.remove(item.key)
        mutableState.update { it.copy(decisions = it.decisions + (item.key to draft)) }
    }

    fun recordDecision(item: ModerationQueueDto) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val draft = current.draft(item)
        if (current.busy || current.moderator != true || current.queue.items.none { it.key == item.key } ||
            draft.action !in setOf("hide", "no_action") || draft.reason !in REPORT_REASONS || !validNote(draft.note)) return
        val body = ModerationDecisionBodyDto(item.targetType, item.targetId, requireNotNull(draft.action), draft.reason, normalized(draft.note))
        val intent = decisionIntents[item.key]?.takeIf { it.body == body }
            ?: ModerationDecisionIntent(account, UUID.randomUUID().toString(), body).also { decisionIntents[item.key] = it }
        command(onFailure = { problem -> mutableState.update { it.copy(decisions = it.decisions + (item.key to draft.copy(error = problem))) } },
            work = { repository.decide(intent) },
            success = {
                decisionIntents.remove(item.key)
                mutableState.update { it.copy(queue = it.queue.copy(items = it.queue.items.filterNot { row -> row.key == item.key }),
                    decisions = it.decisions - item.key, message = ModerationMessage.DECISION_RECORDED) }
            })
    }

    fun editResolution(appealId: String, note: String) {
        val current = mutableState.value
        if (current.working || resolutionIntents.containsKey(appealId)) return
        mutableState.update { it.copy(resolutions = it.resolutions + (appealId to ModerationResolutionDraft(note))) }
    }

    fun resolveAppeal(item: ModerationAppealReviewDto, outcome: String) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val draft = current.resolutions[item.appeal.id] ?: ModerationResolutionDraft()
        if (current.busy || current.moderator != true || current.appeals.items.none { it.appeal.id == item.appeal.id } ||
            outcome !in setOf("upheld", "overturned") || !validNote(draft.note)) return
        val body = resolutionIntents[item.appeal.id] ?: ModerationResolveBodyDto(outcome, normalized(draft.note))
        if (body.outcome != outcome) return
        resolutionIntents[item.appeal.id] = body
        mutableState.update { it.copy(resolutions = it.resolutions + (item.appeal.id to draft.copy(outcome = outcome, error = null))) }
        command(onFailure = { problem -> mutableState.update { it.copy(resolutions = it.resolutions + (item.appeal.id to draft.copy(outcome = outcome, error = problem))) } },
            work = { repository.resolve(account, item.appeal.id, body) },
            success = {
                resolutionIntents.remove(item.appeal.id)
                mutableState.update { it.copy(appeals = it.appeals.copy(items = it.appeals.items.filterNot { row -> row.appeal.id == item.appeal.id }),
                    resolutions = it.resolutions - item.appeal.id, message = ModerationMessage.APPEAL_RESOLVED) }
            })
    }

    fun selectAppeal(notice: ModerationNoticeDto?) {
        val current = mutableState.value
        if (current.working || (notice != null && current.notices.items.none { it.id == notice.id && it.canAppeal })) return
        mutableState.update { it.copy(selectedNoticeId = notice?.id, message = null) }
    }

    fun editAppeal(decisionId: String, note: String) {
        val current = mutableState.value
        if (current.working) return
        if (current.appealDrafts[decisionId]?.note != note) appealIntents.remove(decisionId)
        mutableState.update { it.copy(appealDrafts = it.appealDrafts + (decisionId to ModerationAppealDraft(note))) }
    }

    fun sendAppeal(notice: ModerationNoticeDto) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val draft = current.appealDrafts[notice.id] ?: ModerationAppealDraft()
        if (current.busy || current.notices.items.none { it.id == notice.id && it.canAppeal } || !validNote(draft.note, required = true)) return
        val body = ModerationAppealBodyDto(normalized(draft.note))
        val intent = appealIntents[notice.id]?.takeIf { it.body == body }
            ?: ModerationAppealIntent(account, UUID.randomUUID().toString(), notice.id, body).also { appealIntents[notice.id] = it }
        command(onFailure = { problem -> mutableState.update { it.copy(appealDrafts = it.appealDrafts + (notice.id to draft.copy(error = problem))) } },
            work = { repository.appeal(intent) },
            success = { result ->
                appealIntents.remove(notice.id)
                mutableState.update { it.copy(notices = it.notices.copy(items = it.notices.items.map { row -> if (row.id == notice.id) row.copy(appealStatus = result.status) else row }),
                    appealDrafts = it.appealDrafts - notice.id, selectedNoticeId = null, message = ModerationMessage.APPEAL_SENT) }
            })
    }

    private fun <Value> command(onFailure: (ModerationProblem) -> Unit, work: suspend () -> Value, success: (Value) -> Unit) {
        val expected = generation
        mutableState.update { it.copy(working = true, message = null) }
        viewModelScope.launch {
            try {
                val result = work()
                if (generation == expected) success(result)
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = problem(error, expected)
                if (generation == expected && failure.code != "MODERATOR_REQUIRED") onFailure(failure)
            } finally { update(expected) { it.copy(working = false) } }
        }
    }

    private fun normalized(note: String) = note.trim().replace("\r\n", "\n")
    private fun validNote(note: String, required: Boolean = false) = note.codePointLength() <= 1000 && (!required || note.isNotBlank())
}