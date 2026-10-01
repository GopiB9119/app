package com.community.platform.feature.scheduling

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.community.platform.R
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale

internal fun weekdayLabel(value: String): String =
    DayOfWeek.of(seriesWeekdays.indexOf(value) + 1).getDisplayName(TextStyle.SHORT, Locale.getDefault())

internal fun formatLocalDate(value: String): String = LocalDate.parse(value).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))

@Composable
internal fun describeRule(frequency: String, every: Int, weekdays: List<String>, time: String): String {
    val days = weekdays.joinToString(", ", transform = ::weekdayLabel)
    return when {
        frequency == "daily" && every == 1 -> stringResource(R.string.series_every_day_at, time)
        frequency == "daily" -> pluralStringResource(R.plurals.series_every_days_at, every, every, time)
        every == 1 -> stringResource(R.string.series_every_week_at, days, time)
        else -> pluralStringResource(R.plurals.series_every_weeks_at, every, every, days, time)
    }
}

private fun seriesStatusLabel(value: String) = when (value) {
    "active" -> R.string.series_status_active; "paused" -> R.string.series_status_paused; "cancelled" -> R.string.series_status_cancelled
    "ended" -> R.string.series_status_ended; else -> R.string.series_status_stopped
}

private fun seriesReasonLabel(value: String) = when (value) {
    "by_person" -> R.string.series_reason_by_person; "task_changed" -> R.string.series_reason_task_changed
    "task_closed" -> R.string.series_reason_task_closed; "access_lost" -> R.string.series_reason_access_lost
    "account_inactive" -> R.string.series_reason_account_inactive; "preference_revoked" -> R.string.series_reason_preference_revoked
    else -> R.string.series_reason_stopped
}

@Composable
internal fun RepeatChoice(state: ReminderWorkspaceState, enabled: Boolean, onRepeat: (RepeatMode) -> Unit) {
    Column {
        Text(stringResource(R.string.reminders_repeat), style = MaterialTheme.typography.labelLarge)
        RepeatMode.entries.forEach { mode ->
            val label = when (mode) { RepeatMode.ONCE -> R.string.reminders_repeat_once; RepeatMode.DAILY -> R.string.reminders_repeat_daily; RepeatMode.WEEKLY -> R.string.reminders_repeat_weekly }
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(selected = state.repeat == mode, enabled = enabled, role = Role.RadioButton, onClick = { onRepeat(mode) }).testTag("reminder-repeat-${mode.name}"), verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = state.repeat == mode, onClick = null, enabled = enabled)
                Text(stringResource(label), Modifier.padding(start = 12.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun SeriesFields(state: ReminderWorkspaceState, enabled: Boolean, onChanged: (String, String, Set<String>, String, String, String) -> Unit) {
    var timeOpen by remember { mutableStateOf(false) }
    var dateOpen by remember { mutableStateOf<Boolean?>(null) }
    var zoneOpen by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val weekly = state.repeat == RepeatMode.WEEKLY
    fun change(time: String = state.seriesTime, every: String = state.seriesEvery, days: Set<String> = state.seriesDays, start: String = state.seriesStart, end: String = state.seriesEnd, zone: String = state.timezone) =
        onChanged(time, every, days, start, end, zone)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(onClick = { timeOpen = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("series-time"), shape = RoundedCornerShape(6.dp)) {
            Text(state.seriesTime.ifEmpty { stringResource(R.string.series_choose_time) }, Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null)
        }
        OutlinedTextField(value = state.seriesEvery, onValueChange = { change(every = it) }, enabled = enabled, singleLine = true,
            label = { Text(stringResource(if (weekly) R.string.series_every_weeks else R.string.series_every_days)) },
            supportingText = { Text(stringResource(if (weekly) R.string.series_every_weeks_range else R.string.series_every_days_range)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth().testTag("series-every"))
        if (weekly) Column {
            Text(stringResource(R.string.series_weekdays), style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                seriesWeekdays.forEach { day ->
                    val checked = day in state.seriesDays
                    Row(Modifier.heightIn(min = 48.dp).toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = { change(days = if (it) state.seriesDays + day else state.seriesDays - day) }).testTag("series-weekday-$day"), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = checked, onCheckedChange = null, enabled = enabled)
                        Text(weekdayLabel(day), Modifier.padding(start = 4.dp, end = 8.dp))
                    }
                }
            }
        }
        OutlinedButton(onClick = { dateOpen = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("series-start"), shape = RoundedCornerShape(6.dp)) {
            Text(stringResource(R.string.series_first_day, state.seriesStart.takeIf(String::isNotEmpty)?.let(::formatLocalDate) ?: "-"), Modifier.weight(1f)); Icon(Icons.Default.DateRange, null)
        }
        OutlinedButton(onClick = { dateOpen = false }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("series-end"), shape = RoundedCornerShape(6.dp)) {
            Text(stringResource(R.string.series_last_day, state.seriesEnd.takeIf(String::isNotEmpty)?.let(::formatLocalDate) ?: "-"), Modifier.weight(1f)); Icon(Icons.Default.DateRange, null)
        }
        OutlinedButton(onClick = { query = ""; zoneOpen = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("series-zone"), shape = RoundedCornerShape(6.dp)) {
            Text(state.timezone, Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, stringResource(R.string.select_timezone))
        }
        Text(stringResource(R.string.series_limit), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (timeOpen) {
        val initial = state.seriesTime.takeIf(String::isNotEmpty)?.let(LocalTime::parse) ?: LocalTime.of(9, 0)
        val time = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute, is24Hour = true)
        AlertDialog(onDismissRequest = { timeOpen = false }, title = { Text(stringResource(R.string.series_choose_time)) }, text = { TimeInput(state = time) },
            confirmButton = { TextButton(onClick = { change(time = String.format(Locale.ROOT, "%02d:%02d", time.hour, time.minute)); timeOpen = false }, modifier = Modifier.testTag("series-time-confirm")) { Text(stringResource(R.string.confirm)) } },
            dismissButton = { TextButton(onClick = { timeOpen = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
    }
    dateOpen?.let { first ->
        val value = if (first) state.seriesStart else state.seriesEnd
        val picker = rememberDatePickerState(initialSelectedDateMillis = value.takeIf(String::isNotEmpty)?.let { LocalDate.parse(it).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() })
        DatePickerDialog(onDismissRequest = { dateOpen = null }, confirmButton = {
            TextButton(enabled = picker.selectedDateMillis != null, modifier = Modifier.testTag("series-date-confirm"), onClick = {
                picker.selectedDateMillis?.let { millis ->
                    val day = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    if (first) change(start = day) else change(end = day)
                }
                dateOpen = null
            }) { Text(stringResource(R.string.confirm)) }
        }, dismissButton = { TextButton(onClick = { dateOpen = null }) { Text(stringResource(R.string.cancel)) } }) { DatePicker(picker) }
    }
    if (zoneOpen) AlertDialog(onDismissRequest = { zoneOpen = false }, title = { Text(stringResource(R.string.select_timezone)) }, text = {
        Column {
            OutlinedTextField(value = query, onValueChange = { query = it.take(64) }, label = { Text(stringResource(R.string.search_timezone)) }, singleLine = true)
            LazyColumn(Modifier.heightIn(max = 320.dp)) {
                items(state.timezones.filter { it.contains(query, ignoreCase = true) }, key = { it }) { zone ->
                    TextButton(onClick = { change(zone = zone); zoneOpen = false }, modifier = Modifier.fillMaxWidth()) { Text(zone, Modifier.fillMaxWidth()) }
                }
            }
        }
    }, confirmButton = { TextButton(onClick = { zoneOpen = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SeriesReview(state: ReminderWorkspaceState, preview: ReminderSeriesPreviewDto, onPolicy: (String) -> Unit, onChange: () -> Unit, onSave: () -> Unit) {
    val skips = preview.clockChanges.any { it.change != "repeated_time_first" }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.testTag("series-review")) {
        Text(stringResource(R.string.series_review), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
        ReminderFact(stringResource(R.string.task_title), preview.taskTitle)
        ReminderFact(stringResource(R.string.reminders_recipient), stringResource(R.string.reminders_you, preview.recipient.displayName))
        ReminderFact(stringResource(R.string.series_repeats), describeRule(preview.frequency, preview.repeatEvery, preview.weekdays, preview.localTime))
        ReminderFact(stringResource(R.string.series_from), formatLocalDate(preview.startDate))
        ReminderFact(stringResource(R.string.series_until), formatLocalDate(preview.endDate))
        ReminderFact(stringResource(R.string.timezone), preview.timezone)
        ReminderFact(stringResource(R.string.series_count), preview.occurrenceCount.toString())
        Text(stringResource(R.string.reminders_in_app), style = MaterialTheme.typography.labelLarge)
        Text(stringResource(R.string.series_first_times), style = MaterialTheme.typography.titleMedium)
        preview.occurrences.forEach { occurrence ->
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("${formatLocalDate(occurrence.localDate)}, ${occurrence.displayTime}", style = MaterialTheme.typography.bodyLarge)
                Text("${offsetLabel(occurrence.utcOffsetMinutes)} / ${occurrence.scheduledAt.replace('T', ' ')}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                when (occurrence.adjustment) {
                    "shifted_forward" -> Text(stringResource(R.string.series_shifted), style = MaterialTheme.typography.bodySmall)
                    "repeated_time_first" -> Text(stringResource(R.string.series_repeated), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (preview.clockChanges.isNotEmpty()) Text(stringResource(R.string.series_clock_changes, preview.clockChanges.size), style = MaterialTheme.typography.bodySmall)
        if (skips) Column {
            Text(stringResource(R.string.series_policy_title, preview.localTime), style = MaterialTheme.typography.labelLarge)
            listOf("shift_forward" to R.string.series_policy_shift, "skip" to R.string.series_policy_skip).forEach { (policy, label) ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(selected = preview.clockChangePolicy == policy, enabled = !state.locked, role = Role.RadioButton, onClick = { onPolicy(policy) }).testTag("series-policy-$policy"), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = preview.clockChangePolicy == policy, onClick = null, enabled = !state.locked)
                    Text(stringResource(label), Modifier.padding(start = 12.dp))
                }
            }
        }
        Text(stringResource(R.string.series_disclosure), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onChange, enabled = !state.locked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("series-change")) { Text(stringResource(R.string.series_change)) }
            Button(onClick = onSave, enabled = !state.locked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("series-save")) {
                Icon(Icons.Default.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.series_save))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SeriesRow(state: ReminderWorkspaceState, series: ReminderSeriesDto, onCommand: (SeriesOperation) -> Unit) {
    val enabled = !state.locked && !state.reviewing
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("series-row-${series.id}")) {
        Text(series.taskTitle, style = MaterialTheme.typography.titleMedium)
        Text(stringResource(seriesStatusLabel(series.status)), color = MaterialTheme.colorScheme.primary)
        Text(describeRule(series.frequency, series.repeatEvery, series.weekdays, series.localTime))
        Text(stringResource(R.string.series_range, formatLocalDate(series.startDate), formatLocalDate(series.endDate), series.timezone), style = MaterialTheme.typography.bodySmall)
        series.nextOccurrence?.let { Text(stringResource(R.string.series_next, displayInstant(it.scheduledAt, series.timezone))) }
        series.reason?.let { Text(stringResource(seriesReasonLabel(it)), style = MaterialTheme.typography.bodySmall) }
        if (series.status == "active" && series.sourceChanged) Text(stringResource(R.string.series_source_changed), style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (series.status == "active" && series.nextOccurrence != null) OutlinedButton(onClick = { onCommand(SeriesOperation.SKIP) }, enabled = enabled, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("series-skip-${series.id}")) { Text(stringResource(R.string.series_skip)) }
            if (series.status == "active") OutlinedButton(onClick = { onCommand(SeriesOperation.PAUSE) }, enabled = enabled, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("series-pause-${series.id}")) { Text(stringResource(R.string.series_pause)) }
            if (series.status == "paused") OutlinedButton(onClick = { onCommand(SeriesOperation.RESUME) }, enabled = enabled, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("series-resume-${series.id}")) {
                Icon(Icons.Default.PlayArrow, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.series_resume))
            }
            if (series.status == "active" || series.status == "paused") OutlinedButton(onClick = { onCommand(SeriesOperation.CANCEL) }, enabled = enabled, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("series-cancel-${series.id}")) {
                Icon(Icons.Default.Close, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.series_cancel))
            }
        }
        HorizontalDivider()
    }
}

internal fun seriesConfirmTitle(operation: SeriesOperation) = when (operation) {
    SeriesOperation.SKIP -> R.string.series_confirm_skip; SeriesOperation.PAUSE -> R.string.series_confirm_pause
    SeriesOperation.RESUME -> R.string.series_confirm_resume; SeriesOperation.CANCEL -> R.string.series_confirm_cancel
}

internal fun seriesConfirmEffect(operation: SeriesOperation) = when (operation) {
    SeriesOperation.SKIP -> R.string.series_effect_skip; SeriesOperation.PAUSE -> R.string.series_effect_pause
    SeriesOperation.RESUME -> R.string.series_effect_resume; SeriesOperation.CANCEL -> R.string.series_effect_cancel
}

internal fun seriesConfirmAction(operation: SeriesOperation) = when (operation) {
    SeriesOperation.SKIP -> R.string.series_action_skip; SeriesOperation.PAUSE -> R.string.series_pause
    SeriesOperation.RESUME -> R.string.series_resume; SeriesOperation.CANCEL -> R.string.series_action_cancel
}

private fun snoozeLabel(minutes: Int) = when (minutes) { 10 -> R.string.snooze_10; 60 -> R.string.snooze_60; 180 -> R.string.snooze_180; else -> R.string.snooze_1440 }

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SnoozeDialog(state: ReminderWorkspaceState, item: InboxNotificationDto, onChoice: (Int) -> Unit, onClose: () -> Unit, onSnooze: () -> Unit, onRetry: () -> Unit) {
    val pending = state.pending as? ReminderCommand.Snooze
    val chosen = pending?.intent?.minutes ?: state.snoozeMinutes
    val close: () -> Unit = { if (!state.locked) onClose() }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().padding(20.dp), contentAlignment = Alignment.Center) {
            Surface(Modifier.widthIn(max = 560.dp).fillMaxWidth().heightIn(max = maxHeight).testTag("snooze-dialog"), shape = RoundedCornerShape(8.dp)) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(stringResource(R.string.snooze_title), style = MaterialTheme.typography.titleLarge)
                    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(item.taskTitle, style = MaterialTheme.typography.titleMedium)
                        Text(stringResource(R.string.snooze_label), style = MaterialTheme.typography.labelLarge)
                        snoozeChoices.forEach { minutes ->
                            val available = snoozeAvailable(item, minutes)
                            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(selected = chosen == minutes, enabled = available && !state.locked, role = Role.RadioButton, onClick = { onChoice(minutes) }).testTag("snooze-option-$minutes"), verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(selected = chosen == minutes, onClick = null, enabled = available && !state.locked)
                                Column(Modifier.padding(start = 12.dp)) {
                                    Text(stringResource(snoozeLabel(minutes)))
                                    Text(if (available) stringResource(R.string.snooze_about, displayInstant(snoozeUntil(minutes).toString(), state.timezone)) else stringResource(R.string.snooze_after_repeat), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                        Text(stringResource(R.string.snooze_disclosure), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        state.error?.let { ReminderMessage(it, true) }
                    }
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = close, enabled = !state.locked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("snooze-dismiss")) { Text(stringResource(R.string.cancel)) }
                        Button(onClick = { if (pending != null) onRetry() else onSnooze() }, enabled = !state.busy && chosen != null, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("snooze-confirm")) {
                            Icon(if (pending != null) Icons.Default.Refresh else Icons.Default.Check, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp))
                            Text(stringResource(if (pending != null) R.string.snooze_retry else R.string.notifications_snooze))
                        }
                    }
                }
            }
        }
    }
}
