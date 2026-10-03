package com.community.platform.feature.planning

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class CalendarActions(
    val refresh: () -> Unit,
    val selectSpace: (String) -> Unit,
    val selectMonth: (YearMonth) -> Unit,
    val selectTimezone: (String) -> Unit,
    val loadMore: () -> Unit,
    val loadMoreSpaces: () -> Unit,
    val selectView: (CalendarView) -> Unit = {},
    val selectDay: (LocalDate) -> Unit = {},
    val toggleSource: (String) -> Unit = {},
)

@Composable
fun CalendarRoute(viewModel: CalendarViewModel, accountId: String, onBack: () -> Unit, onSessionLost: () -> Unit, onOpenSource: (CalendarEntryDto) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId != accountId) return
    CalendarScreen(state, CalendarActions(viewModel::refresh, viewModel::selectSpace, viewModel::selectMonth, viewModel::selectTimezone, viewModel::loadMore, viewModel::loadMoreSpaces,
        viewModel::selectView, viewModel::selectDay, viewModel::toggleSource), onBack, onOpenSource)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CalendarScreen(state: CalendarState, actions: CalendarActions, onBack: () -> Unit, onOpenSource: (CalendarEntryDto) -> Unit) {
    var choosingSpace by remember { mutableStateOf(false) }
    var choosingZone by remember { mutableStateOf(false) }
    var choosingDate by remember { mutableStateOf(false) }
    BackHandler(onBack = onBack)
    val list = rememberLazyListState()
    // The error is the list's second item, after the controls. An error now hides the entries, so the shorter list already
    // shows it; it is still brought into view, as on the other screens, in case entries are ever kept beside an error.
    LaunchedEffect(state.error) { if (state.error != null) list.scrollToItem(1) }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.calendar_back)) }
                Text(stringResource(R.string.calendar_title), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                IconButton(onClick = actions.refresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, stringResource(R.string.calendar_refresh)) }
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            LazyColumn(Modifier.widthIn(max = 760.dp).fillMaxSize().align(Alignment.CenterHorizontally).testTag("calendar-workspace"), state = list, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item("controls") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box {
                            OutlinedButton(onClick = { choosingSpace = true }, enabled = !state.busy && state.spaces.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
                                Text(state.selectedSpace?.name ?: stringResource(R.string.calendar_choose_space), Modifier.weight(1f))
                                Icon(Icons.Default.ArrowDropDown, null)
                            }
                            DropdownMenu(expanded = choosingSpace, onDismissRequest = { choosingSpace = false }) {
                                state.spaces.forEach { space -> DropdownMenuItem(text = { Text(space.name) }, onClick = { choosingSpace = false; actions.selectSpace(space.id) }) }
                            }
                        }
                        if (state.spaceCursor != null) TextButton(onClick = actions.loadMoreSpaces, enabled = !state.busy) { Text(stringResource(R.string.calendar_more_spaces)) }
                        Box {
                            OutlinedButton(onClick = { choosingZone = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                                Text(state.timezone, Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, stringResource(R.string.calendar_timezone))
                            }
                            DropdownMenu(expanded = choosingZone, onDismissRequest = { choosingZone = false }) {
                                setOf(state.profileTimezone, "UTC").forEach { zone -> DropdownMenuItem(text = { Text(zone) }, onClick = { choosingZone = false; actions.selectTimezone(zone) }) }
                            }
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for ((view, label) in listOf(CalendarView.MONTH to R.string.calendar_view_month, CalendarView.WEEK to R.string.calendar_view_week, CalendarView.DAY to R.string.calendar_view_day)) {
                                FilterChip(selected = state.view == view, onClick = { actions.selectView(view) }, enabled = !state.busy, label = { Text(stringResource(label)) },
                                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("calendar-view-${view.name.lowercase()}"))
                            }
                        }
                        val (start, end) = state.range
                        val zone = ZoneId.of(state.timezone)
                        Text(when (state.view) {
                            CalendarView.MONTH -> state.month.format(DateTimeFormatter.ofPattern("MMMM uuuu"))
                            CalendarView.WEEK -> stringResource(R.string.calendar_week_range, start.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)), end.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)))
                            CalendarView.DAY -> start.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL))
                        }, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                        // A month steps by a month; a week by seven days; a day by one.
                        val step = when (state.view) { CalendarView.MONTH -> 0L; CalendarView.WEEK -> 7L; CalendarView.DAY -> 1L }
                        val (previous, next, choose) = when (state.view) {
                            CalendarView.MONTH -> Triple(R.string.calendar_previous, R.string.calendar_next, R.string.calendar_choose_month)
                            CalendarView.WEEK -> Triple(R.string.calendar_previous_week, R.string.calendar_next_week, R.string.calendar_choose_day)
                            CalendarView.DAY -> Triple(R.string.calendar_previous_day, R.string.calendar_next_day, R.string.calendar_choose_day)
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = { if (step == 0L) actions.selectMonth(state.month.minusMonths(1)) else actions.selectDay(state.day.minusDays(step)) }, enabled = !state.busy && start > LocalDate.of(1900, 1, 1)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(previous)) }
                            IconButton(onClick = { choosingDate = true }, enabled = !state.busy) { Icon(Icons.Default.DateRange, stringResource(choose)) }
                            TextButton(onClick = { if (step == 0L) actions.selectMonth(YearMonth.now(zone)) else actions.selectDay(LocalDate.now(zone)) }, enabled = !state.busy) { Text(stringResource(R.string.calendar_today)) }
                            IconButton(onClick = { if (step == 0L) actions.selectMonth(state.month.plusMonths(1)) else actions.selectDay(state.day.plusDays(step)) }, enabled = !state.busy && end < LocalDate.of(2100, 12, 31)) { Icon(Icons.AutoMirrored.Filled.ArrowForward, stringResource(next)) }
                        }
                        Text(stringResource(R.string.calendar_show), style = MaterialTheme.typography.labelLarge)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for ((source, label) in listOf("task" to R.string.calendar_show_tasks, "reminder" to R.string.calendar_show_reminders, "event" to R.string.calendar_show_events)) {
                                FilterChip(selected = source !in state.hidden, onClick = { actions.toggleSource(source) }, label = { Text(stringResource(label)) },
                                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("calendar-show-$source"))
                            }
                        }
                    }
                }
                if (state.error != null) item("error") {
                    Text(state.error, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    TextButton(onClick = actions.refresh, enabled = !state.busy) { Text(stringResource(R.string.calendar_retry)) }
                }
                if (state.loaded && !state.busy && state.error == null) {
                    val shown = state.shown
                    val hiddenCount = state.entries.size - shown.size
                    val solo = state.selectedSpace?.spaceType == "solo"
                    if (state.entries.isEmpty()) item("empty") { Text(stringResource(when { state.selectedSpace == null -> R.string.calendar_no_spaces; state.view == CalendarView.MONTH -> R.string.calendar_empty; else -> R.string.calendar_empty_dates })) }
                    if (hiddenCount > 0) item("hidden") { Text(stringResource(R.string.calendar_hidden, hiddenCount), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(shown, key = { "${it.kind}:${it.id}" }) { entry ->
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(LocalDate.parse(entry.date).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)), style = MaterialTheme.typography.labelLarge)
                            Text(entry.title, style = MaterialTheme.typography.titleMedium)
                            Text(if (entry.kind == "task") stringResource(R.string.calendar_due_date) else DateTimeFormatter.ofPattern("HH:mm O").format(Instant.parse(entry.scheduledAt).atZone(ZoneId.of(state.timezone))), style = MaterialTheme.typography.bodyMedium)
                            Text(when (entry.status) { "available" -> stringResource(R.string.calendar_in_inbox); "planned" -> stringResource(R.string.calendar_planned); else -> entry.status.replace('_', ' ') }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            // Reminders are always the person's own; tasks and events are the Space's, unless it is a solo Space.
                            Text(stringResource(if (!solo && calendarSource(entry) != "reminder") R.string.calendar_shared else R.string.calendar_only_you), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (entry.timezone != null) Text(stringResource(when { entry.kind == "event" -> R.string.calendar_event_zone; entry.seriesId != null -> R.string.calendar_repeating_zone; else -> R.string.calendar_scheduled_zone }, entry.timezone), style = MaterialTheme.typography.bodySmall)
                            if (entry.sourceChanged) Text(stringResource(R.string.calendar_source_changed), color = MaterialTheme.colorScheme.error)
                            TextButton(onClick = { onOpenSource(entry) }) {
                                Icon(when (entry.kind) { "task" -> Icons.AutoMirrored.Filled.List; "event" -> Icons.Default.DateRange; else -> Icons.Default.Notifications }, null)
                                Text(stringResource(when (entry.kind) { "task" -> R.string.calendar_open_tasks; "event" -> R.string.calendar_open_events; else -> R.string.calendar_open_reminders }), Modifier.padding(start = 8.dp))
                            }
                            HorizontalDivider()
                        }
                    }
                    if (state.nextCursor != null) item("more") { OutlinedButton(onClick = actions.loadMore) { Text(stringResource(R.string.calendar_more)) } }
                }
                item("bottom") { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
    if (choosingDate) {
        val monthView = state.view == CalendarView.MONTH
        val initial = if (monthView) state.month.atDay(1) else state.day
        val picker = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(), yearRange = 1900..2100,
            selectableDates = object : SelectableDates { override fun isSelectableYear(year: Int) = year in 1900..2100 })
        DatePickerDialog(onDismissRequest = { choosingDate = false }, confirmButton = {
            TextButton(enabled = picker.selectedDateMillis != null, onClick = {
                picker.selectedDateMillis?.let {
                    val chosen = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                    if (monthView) actions.selectMonth(YearMonth.from(chosen)) else actions.selectDay(chosen)
                }
                choosingDate = false
            }) { Text(stringResource(if (monthView) R.string.calendar_choose_month else R.string.calendar_choose_day)) }
        }, dismissButton = { TextButton(onClick = { choosingDate = false }) { Text(stringResource(R.string.calendar_close)) } }) { DatePicker(picker) }
    }
}