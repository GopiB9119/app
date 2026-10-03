package com.community.platform.feature.planning

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
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import javax.inject.Inject

/** DEC-031: the month (as before), the Sunday-to-Saturday week, or one day. */
enum class CalendarView { MONTH, WEEK, DAY }

/** Where an entry comes from; planned repeats are reminders, so one choice shows or hides both. */
val CALENDAR_SOURCES = listOf("task", "reminder", "event")
fun calendarSource(entry: CalendarEntryDto) = if (entry.kind == "planned") "reminder" else entry.kind

private val firstCalendarDay = LocalDate.of(1900, 1, 1)
private val lastCalendarDay = LocalDate.of(2100, 12, 31)

/** The dates a view covers: the month, the Sunday-to-Saturday week around [day], or [day] itself, within 1900 to 2100. */
fun calendarRange(view: CalendarView, month: YearMonth, day: LocalDate): Pair<LocalDate, LocalDate> = when (view) {
    CalendarView.MONTH -> month.atDay(1) to month.atEndOfMonth()
    CalendarView.WEEK -> day.minusDays(day.dayOfWeek.value % 7L).let { start -> maxOf(start, firstCalendarDay) to minOf(start.plusDays(6), lastCalendarDay) }
    CalendarView.DAY -> day to day
}

data class CalendarState(
    val accountId: String? = null,
    val profileTimezone: String = "UTC",
    val timezone: String = "UTC",
    val month: YearMonth = YearMonth.now(ZoneId.of("UTC")),
    val spaces: List<FamilySpaceDto> = emptyList(),
    val spaceCursor: String? = null,
    val selectedSpace: FamilySpaceDto? = null,
    val entries: List<CalendarEntryDto> = emptyList(),
    val nextCursor: String? = null,
    val busy: Boolean = false,
    val loaded: Boolean = false,
    val error: String? = null,
    val requiresSignIn: Boolean = false,
    val view: CalendarView = CalendarView.MONTH,
    val day: LocalDate = LocalDate.now(ZoneId.of("UTC")),
    val hidden: Set<String> = emptySet(),
) {
    val range: Pair<LocalDate, LocalDate> get() = calendarRange(view, month, day)
    /** Hiding a source only changes what is shown; nothing is deleted and the request stays the same. */
    val shown: List<CalendarEntryDto> get() = entries.filter { calendarSource(it) !in hidden }
}

@HiltViewModel
class CalendarViewModel @Inject constructor(
    private val calendar: CalendarRepository,
    private val tasks: TaskRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(CalendarState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var work: Job? = null

    fun bind(accountId: String?, timezone: String = "UTC") {
        if (mutableState.value.accountId == accountId && (accountId == null || mutableState.value.profileTimezone == timezone)) return
        generation += 1
        work?.cancel()
        mutableState.value = CalendarState(accountId = accountId, profileTimezone = timezone, timezone = timezone, month = YearMonth.now(ZoneId.of(timezone)), day = LocalDate.now(ZoneId.of(timezone)))
        if (accountId != null) refresh()
    }

    private fun action(operation: suspend (String) -> Unit) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(busy = true, error = null, loaded = false) }
        work = viewModelScope.launch {
            try {
                operation(accountId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (generation == expected) mutableState.update {
                    val sessionLost = error is IdentityFailure && (error.status == 401 || error.code == "ACCOUNT_CHANGED")
                    it.copy(entries = emptyList(), nextCursor = null, requiresSignIn = sessionLost,
                        spaces = if (sessionLost) emptyList() else it.spaces,
                        selectedSpace = if (sessionLost || error is IdentityFailure && error.status in setOf(403, 404)) null else it.selectedSpace,
                        error = when (error) {
                            is IdentityFailure -> error.message
                            is IOException -> "No connection. The calendar is unavailable."
                            else -> "The calendar could not be loaded."
                        })
                }
            } finally {
                if (generation == expected) mutableState.update { it.copy(busy = false) }
            }
        }
    }

    fun refresh() = action { accountId ->
        val expected = generation
        val previous = mutableState.value.selectedSpace
        val spaces = tasks.spaces(accountId)
        if (expected != generation) return@action
        val selected = previous ?: spaces.items.firstOrNull()
        mutableState.update { it.copy(spaces = (spaces.items + listOfNotNull(previous)).distinctBy(FamilySpaceDto::id), spaceCursor = spaces.nextCursor, selectedSpace = selected, entries = emptyList(), nextCursor = null) }
        if (selected != null) load(accountId) else mutableState.update { it.copy(loaded = true) }
    }

    private suspend fun load(accountId: String, cursor: String? = null) {
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        val expected = generation
        val (start, end) = current.range
        val page = calendar.entries(accountId, selected.id, start, end, current.timezone, cursor)
        if (generation != expected) return
        mutableState.update { it.copy(entries = ((if (cursor == null) emptyList() else it.entries) + page.items).distinctBy { entry -> "${entry.kind}:${entry.id}" }.sortedWith(CalendarRepository.calendarOrder), nextCursor = page.nextCursor, loaded = true) }
    }

    fun selectSpace(identifier: String) {
        val selected = mutableState.value.spaces.firstOrNull { it.id == identifier } ?: return
        if (mutableState.value.busy) return
        mutableState.update { it.copy(selectedSpace = selected, entries = emptyList(), nextCursor = null) }
        action { load(it) }
    }

    fun selectMonth(month: YearMonth) {
        if (mutableState.value.busy || month.year !in 1900..2100) return
        mutableState.update { it.copy(month = month, entries = emptyList(), nextCursor = null) }
        action { load(it) }
    }

    /** Switching to a week or day starts from today when it is in the shown month, else the month's first day. */
    fun selectView(view: CalendarView) {
        val current = mutableState.value
        if (current.busy || view == current.view) return
        val today = LocalDate.now(ZoneId.of(current.timezone))
        val day = if (current.view == CalendarView.MONTH && view != CalendarView.MONTH) {
            if (YearMonth.from(today) == current.month) today else current.month.atDay(1)
        } else current.day
        val month = if (view == CalendarView.MONTH) YearMonth.from(day) else current.month
        mutableState.update { it.copy(view = view, day = day, month = month, entries = emptyList(), nextCursor = null) }
        action { load(it) }
    }

    fun selectDay(day: LocalDate) {
        if (mutableState.value.busy || day.year !in 1900..2100) return
        mutableState.update { it.copy(day = day, entries = emptyList(), nextCursor = null) }
        action { load(it) }
    }

    fun toggleSource(source: String) {
        if (source !in CALENDAR_SOURCES) return
        mutableState.update { it.copy(hidden = if (source in it.hidden) it.hidden - source else it.hidden + source) }
    }

    fun selectTimezone(timezone: String) {
        val current = mutableState.value
        if (current.busy || timezone !in setOf("UTC", current.profileTimezone)) return
        mutableState.update { it.copy(timezone = timezone, entries = emptyList(), nextCursor = null) }
        action { load(it) }
    }

    fun loadMore() {
        val cursor = mutableState.value.nextCursor ?: return
        action { load(it, cursor) }
    }

    fun loadMoreSpaces() {
        val cursor = mutableState.value.spaceCursor ?: return
        action { accountId ->
            val expected = generation
            val page = tasks.spaces(accountId, cursor)
            if (page.nextCursor == cursor) throw IdentityFailure("INVALID_RESPONSE", "Reload the Space list.")
            if (generation == expected) mutableState.update { it.copy(spaces = (it.spaces + page.items).distinctBy(FamilySpaceDto::id), spaceCursor = page.nextCursor, loaded = true) }
        }
    }
}