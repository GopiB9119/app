package com.community.platform.feature.care

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
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject

enum class CareView { DAY, MEDICINES, ADD }

/** The client window stays inside the server's 31-day window in every zone. */
const val CARE_DAY_WINDOW = 30L

data class CareState(
    val accountId: String? = null,
    val timezone: String = "UTC",
    val view: CareView = CareView.DAY,
    val today: String = "",
    val date: String = "",
    val day: CareDayDto? = null,
    val stopped: Boolean = false,
    val instructions: List<CareInstructionDto> = emptyList(),
    val draft: CareDraft = CareDraft(),
    val problem: CareProblem? = null,
    val pendingCreate: CareCreateIntent? = null,
    val pendingReport: CareReportIntent? = null,
    val confirmingStop: CareInstructionDto? = null,
    val pendingStop: Pair<String, String>? = null,
    val loading: Boolean = false,
    val working: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val requiresSignIn: Boolean = false,
) {
    val busy: Boolean get() = loading || working
    val canGoBack: Boolean get() = today.isNotEmpty() && date > shift(today, -CARE_DAY_WINDOW)
    val canGoForward: Boolean get() = today.isNotEmpty() && date < shift(today, CARE_DAY_WINDOW)
}

private fun shift(date: String, days: Long) = LocalDate.parse(date).plusDays(days).toString()

fun todayIn(timezone: String, instant: Instant): String = try {
    instant.atZone(ZoneId.of(timezone)).toLocalDate().toString()
} catch (_error: DateTimeException) {
    instant.atZone(ZoneId.of("UTC")).toLocalDate().toString()
}

@HiltViewModel
class CareViewModel @Inject constructor(private val repository: CareRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CareState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var loads = 0L
    private var loadJob: Job? = null
    internal var now: () -> Instant = Instant::now

    fun bind(accountId: String?, timezone: String) {
        val current = mutableState.value
        if (current.accountId == accountId && current.timezone == timezone) return
        generation += 1
        loadJob?.cancel()
        val today = todayIn(timezone, now())
        mutableState.value = CareState(accountId = accountId, timezone = timezone, today = today, date = today, draft = CareDraft(timezone = timezone, startDate = today))
        if (accountId != null) reload()
    }

    private fun fail(error: Exception, expected: Long, unknownMessage: String? = null) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            loadJob?.cancel()
            mutableState.value = CareState(accountId = mutableState.value.accountId, timezone = mutableState.value.timezone, requiresSignIn = true)
            return
        }
        val unknown = error is IOException || failure == null || failure.status >= 500 || failure.status == 0
        val message = when {
            unknown && unknownMessage != null -> unknownMessage
            error is IOException -> "No connection. Nothing new is confirmed."
            else -> error.message ?: "Something went wrong."
        }
        mutableState.update { it.copy(error = message) }
    }

    private fun command(work: suspend (String) -> Unit, unknownMessage: String) {
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

    fun reload() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val expected = generation
        val ticket = ++loads
        loadJob?.cancel()
        mutableState.update { it.copy(loading = true, error = null, today = todayIn(it.timezone, now())) }
        loadJob = viewModelScope.launch {
            try {
                when (current.view) {
                    CareView.DAY -> {
                        val date = current.date
                        val day = repository.day(account, date)
                        if (generation == expected && mutableState.value.date == date) mutableState.update { it.copy(day = day) }
                    }
                    CareView.MEDICINES -> {
                        val stopped = current.stopped
                        val items = repository.list(account, stopped)
                        if (generation == expected && mutableState.value.stopped == stopped) mutableState.update { it.copy(instructions = items) }
                    }
                    CareView.ADD -> Unit
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected) }
            finally { if (generation == expected && loads == ticket) mutableState.update { it.copy(loading = false) } }
        }
    }

    fun showDay() {
        if (mutableState.value.working) return
        mutableState.update { it.copy(view = CareView.DAY, problem = null, error = null, notice = null) }
        reload()
    }

    fun showMedicines(stopped: Boolean) {
        val current = mutableState.value
        if (current.working) return
        mutableState.update {
            it.copy(view = CareView.MEDICINES, stopped = stopped, instructions = if (it.stopped == stopped) it.instructions else emptyList(), problem = null, error = null, notice = null)
        }
        reload()
    }

    fun move(days: Long) {
        val current = mutableState.value
        if (current.working || current.today.isEmpty()) return
        val next = shift(current.date, days)
        if (next < shift(current.today, -CARE_DAY_WINDOW) || next > shift(current.today, CARE_DAY_WINDOW)) return
        mutableState.update { it.copy(date = next, day = null, pendingReport = null, notice = null) }
        reload()
    }

    fun goToday() {
        val current = mutableState.value
        if (current.working) return
        val today = todayIn(current.timezone, now())
        mutableState.update { it.copy(today = today, date = today, day = if (it.date == today) it.day else null, pendingReport = null, notice = null) }
        reload()
    }

    fun startAdd() {
        val current = mutableState.value
        if (current.working) return
        mutableState.update {
            it.copy(view = CareView.ADD, problem = null, error = null, notice = null,
                draft = if (it.pendingCreate != null) it.draft else CareDraft(timezone = it.timezone, startDate = it.today))
        }
    }

    fun draft(change: (CareDraft) -> CareDraft) {
        val current = mutableState.value
        if (current.working || current.pendingCreate != null) return
        mutableState.update { it.copy(draft = change(it.draft), problem = null) }
    }

    fun save() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.working) return
        careProblem(current.draft)?.let { problem -> mutableState.update { it.copy(problem = problem) }; return }
        val body = careBody(current.draft)
        val intent = current.pendingCreate?.takeIf { it.body == body } ?: CareCreateIntent(account, UUID.randomUUID().toString(), body)
        mutableState.update { it.copy(pendingCreate = intent) }
        submit(intent)
    }

    fun retryCreate() { mutableState.value.pendingCreate?.let(::submit) }

    fun discardCreate() {
        if (mutableState.value.working) return
        mutableState.update {
            it.copy(pendingCreate = null, view = CareView.MEDICINES, stopped = false, draft = CareDraft(timezone = it.timezone, startDate = it.today), problem = null, error = null)
        }
        reload()
    }

    private fun submit(intent: CareCreateIntent) = command({ _ ->
        try {
            val saved = repository.create(intent)
            mutableState.update {
                it.copy(pendingCreate = null, view = CareView.MEDICINES, stopped = false, draft = CareDraft(timezone = it.timezone, startDate = it.today),
                    notice = "${saved.medicineName} saved. It appears in your day plan from ${saved.startDate}.")
            }
            reload()
        } catch (error: IdentityFailure) {
            // A definite rejection releases the attempt; an unknown outcome keeps it for an exact retry.
            if (error.status in 400..499 && error.status != 408) mutableState.update { it.copy(pendingCreate = null) }
            throw error
        }
    }, "Not confirmed. Retry sends the same medicine; it cannot be saved twice.")

    fun report(occurrence: CareOccurrenceDto, outcome: String) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.working || outcome !in DOSE_OUTCOMES || !occurrence.canReport || occurrence.report?.outcome == outcome) return
        val intent = current.pendingReport?.takeIf { it.occurrence == occurrence && it.outcome == outcome }
            ?: CareReportIntent(account, UUID.randomUUID().toString(), occurrence, outcome)
        mutableState.update { it.copy(pendingReport = intent) }
        command({ _ ->
            try {
                val saved = repository.report(intent)
                mutableState.update { state ->
                    state.copy(pendingReport = null, day = state.day?.let { day ->
                        day.copy(occurrences = day.occurrences.map { if (it.instructionId == saved.instructionId && it.localTime == saved.localTime) saved else it })
                    })
                }
            } catch (error: IdentityFailure) {
                if (error.status in 400..499 && error.status != 408) {
                    mutableState.update { it.copy(pendingReport = null) }
                    reload()
                }
                throw error
            }
        }, "Your note is not confirmed. Choose it again to retry; it cannot be saved twice.")
    }

    fun askStop(item: CareInstructionDto) {
        if (item.status == "active" && !mutableState.value.working) mutableState.update { it.copy(confirmingStop = item) }
    }

    fun keep() = mutableState.update { it.copy(confirmingStop = null) }

    fun stop() {
        val current = mutableState.value
        val item = current.confirmingStop ?: return
        if (current.working) return
        val key = current.pendingStop?.takeIf { it.first == item.id }?.second ?: UUID.randomUUID().toString()
        mutableState.update { it.copy(confirmingStop = null, pendingStop = item.id to key) }
        command({ account ->
            try {
                repository.stop(account, item, key)
                mutableState.update { it.copy(pendingStop = null, notice = "Stopped tracking ${item.medicineName}. Notes you made are kept.") }
                reload()
            } catch (error: IdentityFailure) {
                if (error.status in 400..499 && error.status != 408) {
                    mutableState.update { it.copy(pendingStop = null) }
                    reload()
                }
                throw error
            }
        }, "The stop is not confirmed. Choose Stop tracking again to retry.")
    }
}
