package com.community.platform.feature.events

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class EventsActions(
    val back: () -> Unit = {}, val reload: () -> Unit = {}, val more: () -> Unit = {}, val showPast: (Boolean) -> Unit = {},
    val open: (EventDto) -> Unit = {}, val close: () -> Unit = {}, val startCreate: () -> Unit = {}, val startEdit: () -> Unit = {},
    val draft: ((EventDraft) -> EventDraft) -> Unit = {}, val save: () -> Unit = {}, val retry: () -> Unit = {},
    val discard: () -> Unit = {}, val respond: (String) -> Unit = {}, val askCancel: () -> Unit = {}, val keep: () -> Unit = {},
    val cancel: () -> Unit = {},
)

@Composable
fun EventsRoute(viewModel: EventsViewModel, accountId: String, spaceName: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) EventsScreen(state, EventsActions(
        back = onBack, reload = { if (state.mode == EventMode.DETAIL) viewModel.refreshSelected() else viewModel.reload() },
        more = { viewModel.reload(more = true) }, showPast = viewModel::showPast, open = viewModel::open, close = viewModel::close,
        startCreate = viewModel::startCreate, startEdit = viewModel::startEdit, draft = viewModel::draft, save = viewModel::save,
        retry = viewModel::retry, discard = viewModel::discardPending, respond = viewModel::respond, askCancel = viewModel::askCancel,
        keep = viewModel::keepEvent, cancel = viewModel::cancelEvent,
    ), spaceName)
}

private fun wallTime(local: String): String =
    runCatching { LocalDateTime.parse(local).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)) }.getOrDefault(local)

private fun whenText(event: EventDto): String {
    val end = event.localEnd?.let { if (it.substringBefore("T") == event.localStart.substringBefore("T")) it.substringAfter("T") else wallTime(it) }
    return "${wallTime(event.localStart)}${end?.let { " – $it" } ?: ""} (${event.timezone})"
}

private fun yourTime(event: EventDto): String? {
    val device = ZoneId.systemDefault()
    if (device.id == event.timezone) return null
    return runCatching {
        Instant.parse(event.startsAt).atZone(device).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT))
    }.getOrNull()
}

@Composable
private fun responseLabel(value: String) = stringResource(when (value) { "going" -> R.string.events_going; "maybe" -> R.string.events_maybe; else -> R.string.events_not_going })

@Composable
private fun problemText(problem: EventProblem) = stringResource(when (problem) {
    EventProblem.TITLE -> R.string.events_problem_title
    EventProblem.TITLE_LONG -> R.string.events_problem_title_long
    EventProblem.LOCATION_LONG -> R.string.events_problem_location_long
    EventProblem.DETAILS_LONG -> R.string.events_problem_details_long
    EventProblem.CONTROL -> R.string.events_problem_control
    EventProblem.DATE -> R.string.events_problem_date
    EventProblem.START -> R.string.events_problem_start
    EventProblem.END -> R.string.events_problem_end
    EventProblem.END_BEFORE_START -> R.string.events_problem_end_before
    EventProblem.ZONE -> R.string.events_problem_zone
})

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EventsScreen(state: EventsState, actions: EventsActions, spaceName: String) {
    val back: () -> Unit = {
        when {
            state.working -> Unit
            state.mode == EventMode.LIST -> actions.back()
            state.mode == EventMode.CREATE && state.pending != null -> actions.discard()
            else -> actions.close()
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.working, modifier = Modifier.testTag("events-back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.events_back)) }
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.events_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                    Text(spaceName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
                }
                IconButton(onClick = actions.reload, enabled = !state.busy) { Icon(Icons.Default.Refresh, stringResource(R.string.events_refresh)) }
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("events-content"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    state.error?.let { item("error") { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("events-error")) } }
                    state.notice?.let { item("notice") { Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.testTag("events-notice")) } }
                    when (state.mode) {
                        EventMode.LIST -> {
                            item("intro") { Text(stringResource(R.string.events_intro), style = MaterialTheme.typography.bodyMedium) }
                            item("controls") {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FilterChip(selected = !state.past, onClick = { actions.showPast(false) }, label = { Text(stringResource(R.string.events_upcoming)) }, modifier = Modifier.testTag("events-upcoming"))
                                    FilterChip(selected = state.past, onClick = { actions.showPast(true) }, label = { Text(stringResource(R.string.events_past)) }, modifier = Modifier.testTag("events-past"))
                                    Button(onClick = actions.startCreate, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("events-new")) { Text(stringResource(R.string.events_new)) }
                                }
                            }
                            if (!state.loading && state.events.isEmpty() && state.error == null) item("empty") {
                                Text(stringResource(if (state.past) R.string.events_empty_past else R.string.events_empty_upcoming), modifier = Modifier.testTag("events-empty"))
                            }
                            items(state.events, key = { it.id }) { event -> EventRow(event, state, actions) }
                            if (state.nextCursor != null) item("more") { TextButton(onClick = actions.more, enabled = !state.busy) { Text(stringResource(R.string.events_more)) } }
                        }
                        EventMode.DETAIL -> state.selected?.let { event -> item("detail") { EventDetail(event, state, actions) } }
                        EventMode.CREATE, EventMode.EDIT -> item("form") { EventForm(state, actions) }
                    }
                }
            }
        }
    }
    val selected = state.selected
    if (state.confirmingCancel && selected != null) AlertDialog(
        onDismissRequest = actions.keep,
        title = { Text(stringResource(R.string.events_cancel_title)) },
        text = { Text(stringResource(R.string.events_cancel_text, selected.title, selected.spaceName)) },
        confirmButton = { TextButton(onClick = actions.cancel, modifier = Modifier.testTag("event-cancel-confirm")) { Text(stringResource(R.string.events_cancel_confirm)) } },
        dismissButton = { TextButton(onClick = actions.keep) { Text(stringResource(R.string.events_keep)) } },
    )
}

@Composable
private fun EventRow(event: EventDto, state: EventsState, actions: EventsActions) {
    Column(
        Modifier.fillMaxWidth().clickable(enabled = !state.working, role = Role.Button) { actions.open(event) }.padding(vertical = 6.dp).testTag("event-row"),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(event.title, style = MaterialTheme.typography.titleMedium)
        if (event.status == "cancelled") Text(stringResource(R.string.events_cancelled), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelLarge)
        Text(whenText(event), style = MaterialTheme.typography.bodyMedium)
        if (event.location.isNotEmpty()) Text(event.location, style = MaterialTheme.typography.bodySmall)
        Text(
            stringResource(R.string.events_counts, event.going, event.maybe, event.notGoing) +
                (event.myResponse?.let { " · " + stringResource(R.string.events_you_responded, responseLabel(it)) } ?: ""),
            style = MaterialTheme.typography.bodySmall,
        )
        HorizontalDivider()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EventDetail(event: EventDto, state: EventsState, actions: EventsActions) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("event-detail")) {
        Text(event.title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
        if (event.status == "cancelled") Text(stringResource(R.string.events_cancelled_notice), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("event-cancelled"))
        else if (event.ended) Text(stringResource(R.string.events_ended_notice))
        Text(whenText(event))
        yourTime(event)?.let { Text(stringResource(R.string.events_your_time, it), style = MaterialTheme.typography.bodySmall) }
        if (event.location.isNotEmpty()) Text(event.location)
        if (event.description.isNotEmpty()) Text(event.description, style = MaterialTheme.typography.bodyMedium)
        Text(
            stringResource(R.string.events_organized, event.spaceName, event.createdByName.ifEmpty { stringResource(R.string.events_former_member) }) +
                (if (event.scheduleChangedAt != null) " " + stringResource(R.string.events_time_changed) else ""),
            style = MaterialTheme.typography.bodySmall,
        )
        if (event.canRespond) {
            Text(stringResource(R.string.events_your_response), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            if (event.myResponseOutdated) Text(stringResource(R.string.events_outdated), modifier = Modifier.testTag("event-outdated"))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EVENT_RESPONSES.forEach { value ->
                    FilterChip(
                        selected = event.myResponse == value && !event.myResponseOutdated, enabled = !state.working,
                        onClick = { actions.respond(value) }, label = { Text(responseLabel(value)) },
                        modifier = Modifier.testTag("event-${value.replace('_', '-')}"),
                    )
                }
            }
        } else event.myResponse?.let {
            Text(stringResource(R.string.events_you_responded, responseLabel(it)) + if (event.myResponseOutdated) " " + stringResource(R.string.events_before_change) else "")
        }
        Text(stringResource(R.string.events_responses), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.events_counts, event.going, event.maybe, event.notGoing), modifier = Modifier.testTag("event-counts"))
        val people = event.attendees.orEmpty()
        if (people.isEmpty()) Text(stringResource(R.string.events_no_responses), style = MaterialTheme.typography.bodySmall)
        people.forEach { person ->
            Text(
                "${if (person.mine) stringResource(R.string.events_you) else person.name}: ${responseLabel(person.response)}" +
                    if (person.outdated) " " + stringResource(R.string.events_before_change) else "",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (event.canManage) {
            val editable = EventsViewModel.editableHere(event)
            if (!editable) Text(stringResource(R.string.events_edit_web), style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = actions.startEdit, enabled = editable && !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("event-edit")) { Text(stringResource(R.string.events_edit)) }
                OutlinedButton(onClick = actions.askCancel, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("event-cancel")) { Text(stringResource(R.string.events_cancel)) }
            }
        }
        TextButton(onClick = actions.close, enabled = !state.working) { Text(stringResource(R.string.events_back_to_list)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EventForm(state: EventsState, actions: EventsActions) {
    val draft = state.draft
    val locked = state.working || state.pending != null
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(if (state.mode == EventMode.EDIT) R.string.events_edit else R.string.events_new), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
        OutlinedTextField(value = draft.title, onValueChange = { value -> actions.draft { it.copy(title = value.take(240)) } }, enabled = !locked, singleLine = true,
            label = { Text(stringResource(R.string.events_field_title)) }, modifier = Modifier.fillMaxWidth().testTag("event-title"))
        OutlinedTextField(value = draft.date, onValueChange = { value -> actions.draft { it.copy(date = value.take(10)) } }, enabled = !locked, singleLine = true,
            label = { Text(stringResource(R.string.events_field_date)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth().testTag("event-date"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = draft.start, onValueChange = { value -> actions.draft { it.copy(start = value.take(5)) } }, enabled = !locked, singleLine = true,
                label = { Text(stringResource(R.string.events_field_start)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.widthIn(min = 140.dp).testTag("event-start"))
            OutlinedTextField(value = draft.end, onValueChange = { value -> actions.draft { it.copy(end = value.take(5)) } }, enabled = !locked, singleLine = true,
                label = { Text(stringResource(R.string.events_field_end)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.widthIn(min = 140.dp).testTag("event-end"))
        }
        OutlinedTextField(value = draft.timezone, onValueChange = { value -> actions.draft { it.copy(timezone = value.take(64)) } }, enabled = !locked, singleLine = true,
            label = { Text(stringResource(R.string.events_field_zone)) }, modifier = Modifier.fillMaxWidth().testTag("event-zone"))
        OutlinedTextField(value = draft.location, onValueChange = { value -> actions.draft { it.copy(location = value.take(400)) } }, enabled = !locked, singleLine = true,
            label = { Text(stringResource(R.string.events_field_location)) }, modifier = Modifier.fillMaxWidth().testTag("event-location"))
        OutlinedTextField(value = draft.details, onValueChange = { value -> actions.draft { it.copy(details = value.take(4000)) } }, enabled = !locked, minLines = 2, maxLines = 6,
            label = { Text(stringResource(R.string.events_field_details)) }, modifier = Modifier.fillMaxWidth().testTag("event-details"))
        Text(stringResource(R.string.events_visibility), style = MaterialTheme.typography.bodySmall)
        state.problem?.let { Text(problemText(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("event-problem")) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state.pending != null && state.mode == EventMode.CREATE) {
                Button(onClick = actions.retry, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("event-retry")) { Text(stringResource(R.string.events_retry)) }
                OutlinedButton(onClick = actions.discard, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("event-discard")) { Text(stringResource(R.string.events_discard)) }
            } else {
                Button(onClick = actions.save, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("event-save")) {
                    Text(stringResource(if (state.mode == EventMode.EDIT) R.string.events_save else R.string.events_create))
                }
                TextButton(onClick = actions.close, enabled = !state.working) { Text(stringResource(R.string.events_close_form)) }
            }
        }
    }
}
