package com.community.platform.feature.care

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val unit = DesignTokens.SpaceUnit

data class CareActions(
    val back: () -> Unit = {}, val reload: () -> Unit = {}, val showDay: () -> Unit = {}, val showMedicines: (Boolean) -> Unit = {},
    val move: (Long) -> Unit = {}, val today: () -> Unit = {}, val report: (CareOccurrenceDto, String) -> Unit = { _, _ -> },
    val startAdd: () -> Unit = {}, val draft: ((CareDraft) -> CareDraft) -> Unit = {}, val save: () -> Unit = {}, val retry: () -> Unit = {},
    val discard: () -> Unit = {}, val askStop: (CareInstructionDto) -> Unit = {}, val keep: () -> Unit = {}, val stop: () -> Unit = {},
)

@Composable
fun CareRoute(viewModel: CareViewModel, accountId: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) CareScreen(state, CareActions(
        back = onBack, reload = viewModel::reload, showDay = viewModel::showDay, showMedicines = viewModel::showMedicines,
        move = viewModel::move, today = viewModel::goToday, report = viewModel::report, startAdd = viewModel::startAdd,
        draft = viewModel::draft, save = viewModel::save, retry = viewModel::retryCreate, discard = viewModel::discardCreate,
        askStop = viewModel::askStop, keep = viewModel::keep, stop = viewModel::stop,
    ))
}

private fun dayLabel(date: String): String =
    runCatching { LocalDate.parse(date).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)) }.getOrDefault(date)

private fun shortDate(date: String): String =
    runCatching { LocalDate.parse(date).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) }.getOrDefault(date)

private fun localDay(instant: String, zone: String): String =
    runCatching { Instant.parse(instant).atZone(ZoneId.of(zone)).toLocalDate().format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) }.getOrDefault(instant)

private fun medicineTitle(name: String, strength: String, form: String) =
    name + (if (strength.isNotEmpty()) " $strength" else "") + (if (form.isNotEmpty()) " ($form)" else "")

@Composable
private fun outcomeLabel(value: String) = stringResource(if (value == "taken") R.string.care_taken else R.string.care_skipped)

@Composable
private fun sourceLabel(value: String) = stringResource(when (value) {
    "prescriber" -> R.string.care_source_prescriber
    "pharmacist" -> R.string.care_source_pharmacist
    "package_label" -> R.string.care_source_label
    else -> R.string.care_source_self
})

@Composable
private fun problemText(problem: CareProblem) = stringResource(when (problem) {
    CareProblem.NAME -> R.string.care_problem_name
    CareProblem.NAME_LONG -> R.string.care_problem_name_long
    CareProblem.DETAIL_LONG -> R.string.care_problem_detail_long
    CareProblem.DOSE -> R.string.care_problem_dose
    CareProblem.DOSE_LONG -> R.string.care_problem_dose_long
    CareProblem.INSTRUCTIONS_LONG -> R.string.care_problem_instructions_long
    CareProblem.CONTROL -> R.string.care_problem_control
    CareProblem.SOURCE -> R.string.care_problem_source
    CareProblem.TIME -> R.string.care_problem_time
    CareProblem.TIME_DUPLICATE -> R.string.care_problem_time_duplicate
    CareProblem.TIMES_MANY -> R.string.care_problem_times_many
    CareProblem.START -> R.string.care_problem_start
    CareProblem.END -> R.string.care_problem_end
    CareProblem.END_BEFORE_START -> R.string.care_problem_end_before
    CareProblem.ZONE -> R.string.care_problem_zone
    CareProblem.CONFIRM -> R.string.care_problem_confirm
})

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CareScreen(state: CareState, actions: CareActions) {
    val back: () -> Unit = {
        when {
            state.working -> Unit
            state.view == CareView.ADD && state.pendingCreate != null -> actions.discard()
            state.view == CareView.ADD -> actions.showMedicines(false)
            else -> actions.back()
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(unit * 2), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.working, modifier = Modifier.testTag("care-back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.care_back)) }
                Text(stringResource(R.string.care_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = actions.reload, enabled = !state.busy && state.view != CareView.ADD) { Icon(Icons.Default.Refresh, stringResource(R.string.care_refresh)) }
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("care-content"), contentPadding = PaddingValues(unit * 4), verticalArrangement = Arrangement.spacedBy(unit * 3)) {
                    state.error?.let { item("error") { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("care-error")) } }
                    state.notice?.let { item("notice") { Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("care-notice")) } }
                    if (state.view != CareView.ADD) {
                        item("intro") { Text(stringResource(R.string.care_intro), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("care-intro")) }
                        item("views") {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                                FilterChip(selected = state.view == CareView.DAY, onClick = actions.showDay, enabled = !state.working, label = { Text(stringResource(R.string.care_day_plan)) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-show-day"))
                                FilterChip(selected = state.view == CareView.MEDICINES, onClick = { actions.showMedicines(state.stopped) }, enabled = !state.working, label = { Text(stringResource(R.string.care_my_medicines)) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-show-medicines"))
                            }
                        }
                    }
                    when (state.view) {
                        CareView.DAY -> {
                            item("day-bar") { DayBar(state, actions) }
                            val day = state.day
                            if (!state.loading && day != null && day.occurrences.isEmpty() && state.error == null) item("day-empty") {
                                Text(stringResource(R.string.care_day_empty), modifier = Modifier.testTag("care-day-empty"))
                            }
                            if (day != null) {
                                val names = day.instructions.associateBy { it.id }
                                items(day.occurrences, key = { "${it.instructionId}-${it.localTime}" }) { occurrence -> DoseRow(occurrence, names[occurrence.instructionId], state, actions) }
                                if (day.omitted.isNotEmpty()) item("omitted") {
                                    Column(verticalArrangement = Arrangement.spacedBy(unit)) {
                                        day.omitted.forEach { omitted ->
                                            Text(stringResource(R.string.care_omitted, names[omitted.instructionId]?.medicineName ?: "", omitted.localTime, omitted.sameMomentAs), style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                            item("fine-print") { Text(stringResource(R.string.care_fine_print), style = MaterialTheme.typography.bodySmall) }
                        }
                        CareView.MEDICINES -> {
                            item("medicine-controls") {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                                    FilterChip(selected = !state.stopped, onClick = { actions.showMedicines(false) }, enabled = !state.working, label = { Text(stringResource(R.string.care_current)) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-current"))
                                    FilterChip(selected = state.stopped, onClick = { actions.showMedicines(true) }, enabled = !state.working, label = { Text(stringResource(R.string.care_stopped)) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-stopped"))
                                    Button(onClick = actions.startAdd, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-add")) { Text(stringResource(R.string.care_add)) }
                                }
                            }
                            if (!state.loading && state.instructions.isEmpty() && state.error == null) item("medicines-empty") {
                                Text(stringResource(if (state.stopped) R.string.care_stopped_empty else R.string.care_active_empty), modifier = Modifier.testTag("care-medicines-empty"))
                            }
                            items(state.instructions, key = { it.id }) { item -> MedicineRow(item, state, actions) }
                            if (state.stopped && state.instructions.isNotEmpty()) item("stopped-limit") { Text(stringResource(R.string.care_stopped_limit), style = MaterialTheme.typography.bodySmall) }
                        }
                        CareView.ADD -> item("form") { MedicineForm(state, actions) }
                    }
                }
            }
        }
    }
    state.confirmingStop?.let { item ->
        AlertDialog(
            onDismissRequest = actions.keep,
            title = { Text(stringResource(R.string.care_stop_title)) },
            text = { Text(stringResource(R.string.care_stop_text, item.medicineName)) },
            confirmButton = { TextButton(onClick = actions.stop, modifier = Modifier.testTag("care-stop-confirm")) { Text(stringResource(R.string.care_stop_confirm)) } },
            dismissButton = { TextButton(onClick = actions.keep, modifier = Modifier.testTag("care-stop-keep")) { Text(stringResource(R.string.care_keep)) } },
        )
    }
}

@Composable
private fun DayBar(state: CareState, actions: CareActions) {
    Column(verticalArrangement = Arrangement.spacedBy(unit)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { actions.move(-1) }, enabled = !state.working && state.canGoBack, modifier = Modifier.testTag("care-previous")) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.care_previous_day))
            }
            Text(
                dayLabel(state.date) + if (state.date == state.today) " " + stringResource(R.string.care_today_mark) else "",
                style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).semantics { heading() }.testTag("care-date"),
            )
            IconButton(onClick = { actions.move(1) }, enabled = !state.working && state.canGoForward, modifier = Modifier.testTag("care-next")) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.care_next_day))
            }
        }
        if (state.date != state.today) TextButton(onClick = actions.today, enabled = !state.working, modifier = Modifier.testTag("care-today")) { Text(stringResource(R.string.care_go_today)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DoseRow(occurrence: CareOccurrenceDto, medicine: CareDayInstructionDto?, state: CareState, actions: CareActions) {
    val current = occurrence.report?.outcome
    Column(Modifier.fillMaxWidth().testTag("care-dose"), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
        Row(verticalAlignment = Alignment.Top) {
            Text(occurrence.displayTime, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(unit * 3))
            Column(Modifier.weight(1f)) {
                Text(medicine?.let { medicineTitle(it.medicineName, it.strength, it.form) } ?: "", style = MaterialTheme.typography.titleMedium)
                medicine?.dose?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            }
        }
        Text(
            (if (current != null) stringResource(R.string.care_noted, outcomeLabel(current)) else stringResource(R.string.care_not_noted)) +
                if (medicine?.status == "stopped") " " + stringResource(R.string.care_stopped_mark) else "",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("care-dose-status"),
        )
        if (occurrence.clockChange == "shifted_forward") Text(stringResource(R.string.care_shifted, occurrence.localTime, occurrence.displayTime), style = MaterialTheme.typography.bodySmall)
        if (occurrence.clockChange == "repeated_time_first") Text(stringResource(R.string.care_repeated, occurrence.localTime), style = MaterialTheme.typography.bodySmall)
        if (occurrence.canReport) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                DOSE_OUTCOMES.forEach { value ->
                    val label = if (current != null && current != value) stringResource(R.string.care_change_to, outcomeLabel(value)) else outcomeLabel(value)
                    FilterChip(
                        selected = current == value, enabled = !state.working && current != value, onClick = { actions.report(occurrence, value) },
                        label = { Text(label) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-$value"),
                    )
                }
            }
        } else {
            val early = runCatching { Instant.parse(occurrence.scheduledAt).isAfter(Instant.now()) }.getOrDefault(false)
            Text(stringResource(if (early) R.string.care_report_early else R.string.care_report_closed), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("care-report-window"))
        }
        HorizontalDivider()
    }
}

@Composable
private fun MedicineRow(item: CareInstructionDto, state: CareState, actions: CareActions) {
    Column(Modifier.fillMaxWidth().testTag("care-medicine"), verticalArrangement = Arrangement.spacedBy(unit)) {
        Text(medicineTitle(item.medicineName, item.strength, item.form), style = MaterialTheme.typography.titleMedium)
        Text(item.dose, style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.care_schedule, item.times.joinToString(", "), item.timezone), style = MaterialTheme.typography.bodySmall)
        Text(
            item.endDate?.let { stringResource(R.string.care_from_to, shortDate(item.startDate), shortDate(it)) } ?: stringResource(R.string.care_from, shortDate(item.startDate)),
            style = MaterialTheme.typography.bodySmall,
        )
        if (item.instructions.isNotEmpty()) Text(item.instructions, style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.care_source_line, sourceLabel(item.source), localDay(item.confirmedAt, state.timezone)), style = MaterialTheme.typography.bodySmall)
        item.stoppedAt?.let { Text(stringResource(R.string.care_stopped_on, localDay(it, state.timezone)), style = MaterialTheme.typography.bodySmall) }
        if (item.status == "active") OutlinedButton(onClick = { actions.askStop(item) }, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-stop")) {
            Text(stringResource(R.string.care_stop))
        }
        HorizontalDivider()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MedicineForm(state: CareState, actions: CareActions) {
    val draft = state.draft
    val locked = state.working || state.pendingCreate != null
    Column(verticalArrangement = Arrangement.spacedBy(unit * 3), modifier = Modifier.testTag("care-form")) {
        Text(stringResource(R.string.care_add_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.care_add_intro), style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(value = draft.name, onValueChange = { value -> actions.draft { it.copy(name = value.take(240)) } }, enabled = !locked, singleLine = true,
            label = { Text(stringResource(R.string.care_field_name)) }, modifier = Modifier.fillMaxWidth().testTag("care-name"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            OutlinedTextField(value = draft.strength, onValueChange = { value -> actions.draft { it.copy(strength = value.take(120)) } }, enabled = !locked, singleLine = true,
                label = { Text(stringResource(R.string.care_field_strength)) }, modifier = Modifier.widthIn(min = 140.dp).testTag("care-strength"))
            OutlinedTextField(value = draft.form, onValueChange = { value -> actions.draft { it.copy(form = value.take(120)) } }, enabled = !locked, singleLine = true,
                label = { Text(stringResource(R.string.care_field_form)) }, modifier = Modifier.widthIn(min = 140.dp).testTag("care-form-field"))
        }
        OutlinedTextField(value = draft.dose, onValueChange = { value -> actions.draft { it.copy(dose = value.take(240)) } }, enabled = !locked, singleLine = true,
            label = { Text(stringResource(R.string.care_field_dose)) }, modifier = Modifier.fillMaxWidth().testTag("care-dose-field"))
        OutlinedTextField(value = draft.instructions, onValueChange = { value -> actions.draft { it.copy(instructions = value.take(1000)) } }, enabled = !locked, minLines = 2, maxLines = 6,
            label = { Text(stringResource(R.string.care_field_instructions)) }, modifier = Modifier.fillMaxWidth().testTag("care-instructions"))
        Text(stringResource(R.string.care_source_question), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        Column(Modifier.selectableGroup()) {
            CARE_SOURCES.forEach { value ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                        .selectable(selected = draft.source == value, enabled = !locked, role = Role.RadioButton, onClick = { actions.draft { it.copy(source = value) } })
                        .testTag("care-source-$value"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = draft.source == value, onClick = null, enabled = !locked)
                    Spacer(Modifier.width(unit * 2))
                    Text(sourceLabel(value))
                }
            }
        }
        Text(stringResource(R.string.care_times_title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        draft.times.forEachIndexed { index, time ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = time, onValueChange = { value -> actions.draft { it.copy(times = it.times.mapIndexed { at, old -> if (at == index) value.take(5) else old }) } },
                    enabled = !locked, singleLine = true, label = { Text(stringResource(R.string.care_time_n, index + 1)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f).testTag("care-time-$index"))
                if (draft.times.size > 1) IconButton(onClick = { actions.draft { it.copy(times = it.times.filterIndexed { at, _ -> at != index }) } }, enabled = !locked) {
                    Icon(Icons.Default.Close, stringResource(R.string.care_remove_time, index + 1))
                }
            }
        }
        if (draft.times.size < MAX_DAILY_TIMES) TextButton(onClick = { actions.draft { it.copy(times = it.times + "") } }, enabled = !locked, modifier = Modifier.testTag("care-add-time")) {
            Text(stringResource(R.string.care_add_time))
        }
        OutlinedTextField(value = draft.timezone, onValueChange = { value -> actions.draft { it.copy(timezone = value.take(64)) } }, enabled = !locked, singleLine = true,
            label = { Text(stringResource(R.string.care_field_zone)) }, modifier = Modifier.fillMaxWidth().testTag("care-zone"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            OutlinedTextField(value = draft.startDate, onValueChange = { value -> actions.draft { it.copy(startDate = value.take(10)) } }, enabled = !locked, singleLine = true,
                label = { Text(stringResource(R.string.care_field_start)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.widthIn(min = 160.dp).testTag("care-start"))
            OutlinedTextField(value = draft.endDate, onValueChange = { value -> actions.draft { it.copy(endDate = value.take(10)) } }, enabled = !locked, singleLine = true,
                label = { Text(stringResource(R.string.care_field_end)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.widthIn(min = 160.dp).testTag("care-end"))
        }
        Row(
            Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                .toggleable(value = draft.confirmed, enabled = !locked, role = Role.Checkbox, onValueChange = { checked -> actions.draft { it.copy(confirmed = checked) } })
                .testTag("care-confirm"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = draft.confirmed, onCheckedChange = null, enabled = !locked)
            Spacer(Modifier.width(unit * 2))
            Text(stringResource(R.string.care_confirm))
        }
        state.problem?.let { Text(problemText(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("care-problem")) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            if (state.pendingCreate != null) {
                Button(onClick = actions.retry, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-retry")) { Text(stringResource(R.string.care_retry)) }
                OutlinedButton(onClick = actions.discard, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-discard")) { Text(stringResource(R.string.care_discard)) }
            } else {
                Button(onClick = actions.save, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("care-save")) { Text(stringResource(R.string.care_save)) }
                TextButton(onClick = { actions.showMedicines(false) }, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) { Text(stringResource(R.string.care_close_form)) }
            }
        }
    }
}
