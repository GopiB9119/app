package com.community.platform.feature.scheduling

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.R
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

data class ReminderActions(
    val refresh: () -> Unit, val tab: (ReminderTab) -> Unit,
    val fields: (String, String, String) -> Unit, val preview: () -> Unit,
    val selectOption: (Int) -> Unit, val changeTime: () -> Unit, val save: () -> Unit,
    val propose: (ReminderCommand) -> Unit, val confirm: () -> Unit, val cancel: () -> Unit,
    val read: (InboxNotificationDto) -> Unit, val preference: (Boolean) -> Unit,
    val retry: () -> Unit, val moreReminders: () -> Unit, val moreInbox: () -> Unit,
    val requestMode: (Boolean) -> Unit = {}, val requestDirection: (ReminderRequestDirection) -> Unit = {},
    val reviewRequest: (ReminderRequestDto) -> Unit = {}, val closeRequestReview: () -> Unit = {},
    val acceptRequest: () -> Unit = {}, val moreRequests: () -> Unit = {},
    val repeat: (RepeatMode) -> Unit = {}, val seriesFields: (String, String, Set<String>, String, String, String) -> Unit = { _, _, _, _, _, _ -> },
    val previewSeries: () -> Unit = {}, val seriesPolicy: (String) -> Unit = {}, val changeSeries: () -> Unit = {},
    val saveSeries: () -> Unit = {}, val moreSeries: () -> Unit = {}, val proposeSeries: (ReminderSeriesDto, SeriesOperation) -> Unit = { _, _ -> },
    val openSnooze: (InboxNotificationDto) -> Unit = {}, val snoozeChoice: (Int) -> Unit = {}, val closeSnooze: () -> Unit = {}, val snooze: () -> Unit = {},
)

@Composable
fun ReminderRoute(viewModel: ReminderViewModel, accountId: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) ReminderScreen(state, ReminderActions(
        viewModel::refresh, viewModel::tab, viewModel::fields, viewModel::preview,
        viewModel::selectOption, viewModel::changeTime, viewModel::save,
        viewModel::propose, viewModel::confirm, viewModel::cancelConfirmation,
        viewModel::read, viewModel::preference, viewModel::retry, viewModel::moreReminders, viewModel::moreInbox,
        viewModel::requestMode, viewModel::requestDirection, viewModel::reviewRequest,
        viewModel::closeRequestReview, viewModel::acceptRequest, viewModel::moreRequests,
        viewModel::repeat, viewModel::seriesFields, viewModel::previewSeries, viewModel::seriesPolicy, viewModel::changeSeries,
        viewModel::saveSeries, viewModel::moreSeries, viewModel::proposeSeries,
        viewModel::openSnooze, viewModel::snoozeChoice, viewModel::closeSnooze, viewModel::snooze,
    ), onBack)
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun ReminderScreen(state: ReminderWorkspaceState, actions: ReminderActions, onBack: () -> Unit) {
    var confirmLeave by remember { mutableStateOf(false) }
    val back: () -> Unit = { if (!state.busy) { if (state.pending != null) confirmLeave = true else onBack() } }
    BackHandler(onBack = back)
    val scroll = rememberLazyListState()
    LaunchedEffect(state.tab, state.preview != null) { scroll.scrollToItem(0) }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.reminders_back)) }
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.reminders_title), style = MaterialTheme.typography.titleLarge)
                    Text(stringResource(R.string.reminders_in_app), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
                }
                IconButton(onClick = actions.refresh, enabled = !state.locked && !state.reviewing) { Icon(Icons.Default.Refresh, stringResource(R.string.reminders_refresh)) }
            }
            ScrollableTabRow(selectedTabIndex = state.tab.ordinal, edgePadding = 0.dp) {
                ReminderTab.entries.forEach { tab ->
                    val label = when (tab) { ReminderTab.INBOX -> R.string.reminders_inbox; ReminderTab.REMINDERS -> R.string.reminders_mine; ReminderTab.REQUESTS -> R.string.reminder_requests }
                    Tab(selected = state.tab == tab, onClick = { actions.tab(tab) }, enabled = !state.locked && !state.reviewing,
                        modifier = Modifier.testTag("reminder-tab-${tab.name}"), text = { Text(stringResource(label)) })
                }
            }
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(state = scroll, modifier = Modifier.widthIn(max = 680.dp).fillMaxSize().testTag("reminder-workspace"), verticalArrangement = Arrangement.spacedBy(18.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp)) {
                    state.error?.let { item("error") { ReminderMessage(it, true); if (state.pending == null) TextButton(onClick = actions.refresh, enabled = !state.busy && !state.reviewing) { Text(stringResource(R.string.tasks_retry_loading)) } } }
                    state.notice?.let { item("notice") { ReminderMessage(it, false) } }
                    if (state.pending != null && !state.busy) item("retry") {
                        Text(stringResource(R.string.tasks_may_be_saved))
                        OutlinedButton(onClick = actions.retry, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-retry")) { Icon(Icons.Default.Refresh, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.reminders_retry)) }
                    }
                    if (state.tab == ReminderTab.REMINDERS) {
                        if (state.taskId != null && state.taskTitle.isNotEmpty()) {
                            item("task") { Text(state.taskTitle, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() }) }
                            val eligible = state.taskOpen && if (state.requestForAssignee) state.canRequest && state.assignee != null else state.preferences?.value?.enabled == true
                            if (!state.taskOpen || (!state.requestForAssignee && state.preferences?.value?.enabled == false)) item("disabled") { Text(stringResource(if (!state.taskOpen) R.string.reminders_task_closed else R.string.reminders_disabled), color = MaterialTheme.colorScheme.error) }
                            val preview = state.preview
                            val seriesPreview = state.seriesPreview
                            if (state.canRequest && state.assignee != null && preview == null && seriesPreview == null) item("recipient") {
                                Column {
                                    Text(stringResource(R.string.reminders_recipient), style = MaterialTheme.typography.labelLarge)
                                    Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(selected = !state.requestForAssignee, onClick = { actions.requestMode(false) }, enabled = !state.locked, modifier = Modifier.testTag("reminder-recipient-self")); Text(stringResource(R.string.reminders_me), Modifier.weight(1f)) }
                                    Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(selected = state.requestForAssignee, onClick = { actions.requestMode(true) }, enabled = !state.locked, modifier = Modifier.testTag("reminder-recipient-assignee")); Text(stringResource(R.string.reminder_request_for, state.assignee.displayName), Modifier.weight(1f)) }
                                }
                            }
                            if (!state.requestForAssignee && preview == null && seriesPreview == null) item("repeat") { RepeatChoice(state, !state.locked && eligible, actions.repeat) }
                            if (seriesPreview != null) item("series-review") { SeriesReview(state, seriesPreview, actions.seriesPolicy, actions.changeSeries, actions.saveSeries) }
                            else if (state.repeat != RepeatMode.ONCE && !state.requestForAssignee) {
                                item("series-fields") { SeriesFields(state, !state.locked && eligible, actions.seriesFields) }
                                item("series-preview-action") { Button(onClick = actions.previewSeries, enabled = !state.locked && eligible && state.seriesTime.isNotEmpty(), shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().testTag("series-preview")) { Icon(Icons.Default.Refresh, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.series_review_action)) } }
                            } else if (preview != null) {
                                item("preview") {
                                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                        Text(stringResource(if (preview.requestedBy == null) R.string.reminders_review else R.string.reminder_request_review), style = MaterialTheme.typography.titleLarge)
                                        ReminderFact(stringResource(R.string.task_title), preview.taskTitle)
                                        ReminderFact(stringResource(R.string.reminders_recipient), if (preview.recipient.accountId == state.accountId) stringResource(R.string.reminders_you, preview.recipient.displayName) else preview.recipient.displayName)
                                        ReminderFact(stringResource(R.string.reminders_local), preview.localTime.replace('T', ' '))
                                        ReminderFact(stringResource(R.string.timezone), preview.timezone)
                                        preview.requestExpiresAt?.let { ReminderFact(stringResource(R.string.reminder_request_expiry), it.replace('T', ' ')) }
                                        if (preview.requestedBy != null) Text(stringResource(R.string.reminder_request_requires_acceptance), style = MaterialTheme.typography.bodySmall)
                                        Text(stringResource(R.string.reminders_no_push), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        if (preview.options.size > 1) Text(stringResource(R.string.reminders_ambiguous), style = MaterialTheme.typography.titleMedium)
                                    }
                                }
                                items(preview.options.indices.toList(), key = { "option-$it" }) { index ->
                                    val option = preview.options[index]
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                        RadioButton(selected = state.selectedOption == index, onClick = { actions.selectOption(index) }, enabled = !state.locked, modifier = Modifier.testTag("reminder-option-$index"))
                                        Column(Modifier.weight(1f).padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text(offsetLabel(option.utcOffsetMinutes), style = MaterialTheme.typography.titleMedium)
                                            Text(option.scheduledAt.replace('T', ' '), style = MaterialTheme.typography.bodyMedium)
                                            Text(stringResource(R.string.reminders_deadline, option.dispatchExpiresAt.replace('T', ' ')), style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                                item("review-actions") { FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(onClick = actions.changeTime, enabled = !state.locked, shape = RoundedCornerShape(6.dp)) { Text(stringResource(R.string.reminders_change_time)) }
                                    Button(onClick = actions.save, enabled = !state.locked && state.selectedOption != null, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-save")) { Icon(if (preview.requestedBy == null) Icons.Default.Check else Icons.AutoMirrored.Filled.Send, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(if (preview.requestedBy == null) R.string.reminders_save else R.string.reminder_request_send)) }
                                } }
                            } else {
                                item("time-fields") { ReminderTimeFields(state, !state.locked && eligible, actions.fields) }
                                item("preview-action") { Button(onClick = actions.preview, enabled = !state.locked && eligible && state.date.isNotEmpty() && state.time.isNotEmpty(), shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().testTag("reminder-preview")) { Icon(Icons.Default.DateRange, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.reminders_review_time)) } }
                            }
                            item("schedule-divider") { HorizontalDivider() }
                        }
                        item("series-heading") { Text(stringResource(R.string.series_heading), style = MaterialTheme.typography.titleLarge) }
                        if (state.series.isEmpty() && !state.busy) item("series-none") { Text(stringResource(R.string.series_none)) }
                        items(state.series, key = { "series-${it.id}" }) { series -> SeriesRow(state, series) { operation -> actions.proposeSeries(series, operation) } }
                        if (state.seriesCursor != null) item("more-series") { TextButton(onClick = actions.moreSeries, enabled = !state.locked && !state.reviewing) { Text(stringResource(R.string.series_more)) } }
                        item("reminders-heading") { Text(stringResource(R.string.reminders_mine), style = MaterialTheme.typography.titleLarge) }
                        if (state.reminders.isEmpty() && !state.busy) item("none") { Text(stringResource(R.string.reminders_none)) }
                        items(state.reminders, key = ReminderDto::id) { reminder ->
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(reminder.taskTitle, style = MaterialTheme.typography.titleMedium)
                                Text(stringResource(reminderStatusLabel(reminder.status)), color = MaterialTheme.colorScheme.primary)
                                Text(displayInstant(reminder.scheduledAt, reminder.timezone))
                                Text(reminder.timezone, style = MaterialTheme.typography.bodySmall)
                                if (reminder.followUpOf != null) Text(stringResource(R.string.reminders_snoozed_count, reminder.snoozeCount), style = MaterialTheme.typography.bodySmall)
                                else if (reminder.seriesId != null) Text(stringResource(R.string.reminders_part_of_series), style = MaterialTheme.typography.bodySmall)
                                reminder.reason?.let { Text(stringResource(reminderReasonLabel(it)), style = MaterialTheme.typography.bodySmall) }
                                if (reminder.status == "scheduled" && reminder.sourceChanged) Text(stringResource(R.string.reminders_source_changed), style = MaterialTheme.typography.bodySmall)
                                if (reminder.acknowledgedAt != null) Text(stringResource(R.string.reminders_acknowledged), color = MaterialTheme.colorScheme.primary)
                                if (reminder.status == "scheduled" && !reminder.seriesOccurrence) OutlinedButton(onClick = { actions.propose(ReminderCommand.Cancel(reminder)) }, enabled = !state.locked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-cancel-${reminder.id}")) { Icon(Icons.Default.Close, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.reminders_cancel)) }
                                HorizontalDivider()
                            }
                        }
                        if (state.reminderCursor != null) item("more") { TextButton(onClick = actions.moreReminders, enabled = !state.locked) { Text(stringResource(R.string.reminders_more)) } }
                    } else if (state.tab == ReminderTab.REQUESTS) {
                        item("request-direction") {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                ReminderRequestDirection.entries.forEach { direction -> Row(verticalAlignment = Alignment.CenterVertically) {
                                    RadioButton(selected = state.requestDirection == direction, onClick = { actions.requestDirection(direction) }, enabled = !state.locked && !state.reviewing, modifier = Modifier.testTag("reminder-request-direction-${direction.name}"))
                                    Text(stringResource(if (direction == ReminderRequestDirection.RECEIVED) R.string.reminder_requests_received else R.string.reminder_requests_sent))
                                } }
                            }
                        }
                        if (state.requests.isEmpty() && !state.busy) item("no-requests") { Text(stringResource(R.string.reminder_requests_none)) }
                        items(state.requests, key = ReminderRequestDto::id) { proposal ->
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(proposal.taskTitle, style = MaterialTheme.typography.titleLarge)
                                Text(stringResource(requestStatusLabel(proposal.status)), color = MaterialTheme.colorScheme.primary)
                                Text(stringResource(if (state.requestDirection == ReminderRequestDirection.RECEIVED) R.string.reminder_request_from else R.string.reminder_request_for,
                                    if (state.requestDirection == ReminderRequestDirection.RECEIVED) proposal.requestedBy.displayName else proposal.recipient.displayName))
                                Text(displayInstant(proposal.scheduledAt, proposal.timezone))
                                Text(proposal.timezone, style = MaterialTheme.typography.bodySmall)
                                if (proposal.status == "pending") FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (proposal.recipient.accountId == state.accountId) {
                                        Button(onClick = { actions.reviewRequest(proposal) }, enabled = !state.locked && !state.reviewing, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-request-review-${proposal.id}")) { Icon(Icons.Default.DateRange, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.reminder_request_review_action)) }
                                        OutlinedButton(onClick = { actions.propose(ReminderCommand.RespondRequest(ReminderRequestResponseIntent(requireNotNull(state.accountId), proposal, ReminderRequestResponse.DECLINE))) }, enabled = !state.locked && !state.reviewing, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-request-decline-${proposal.id}")) { Icon(Icons.Default.Close, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.reminder_request_decline)) }
                                    } else if (proposal.requestedBy.accountId == state.accountId) {
                                        OutlinedButton(onClick = { actions.propose(ReminderCommand.RespondRequest(ReminderRequestResponseIntent(requireNotNull(state.accountId), proposal, ReminderRequestResponse.CANCEL))) }, enabled = !state.locked && !state.reviewing, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-request-withdraw-${proposal.id}")) { Icon(Icons.Default.Close, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.reminder_request_withdraw)) }
                                    }
                                }
                                HorizontalDivider()
                            }
                        }
                        if (state.requestCursor != null) item("more-requests") { TextButton(onClick = actions.moreRequests, enabled = !state.locked && !state.reviewing) { Text(stringResource(R.string.reminder_requests_more)) } }
                    } else {
                        item("unread") { Text(stringResource(R.string.reminders_unread, state.unreadCount), style = MaterialTheme.typography.titleMedium) }
                        if (state.inbox.isEmpty() && !state.busy) item("none") { Text(stringResource(R.string.notifications_none)) }
                        items(state.inbox, key = InboxNotificationDto::id) { notification ->
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(notification.taskTitle, style = MaterialTheme.typography.titleLarge)
                                Text(displayInstant(notification.scheduledAt, state.timezone))
                                Text(stringResource(if (notification.readAt == null) R.string.reminders_unread_label else R.string.reminders_read_label), style = MaterialTheme.typography.labelLarge)
                                if (notification.acknowledgedAt != null) Text(stringResource(R.string.reminders_acknowledged), color = MaterialTheme.colorScheme.primary)
                                notification.snoozedUntil?.let { Text(stringResource(R.string.notifications_snoozed_until, displayInstant(it, state.timezone)), style = MaterialTheme.typography.bodyMedium) }
                                if (notification.snoozeCount > 0) Text(stringResource(R.string.reminders_snoozed_count, notification.snoozeCount), style = MaterialTheme.typography.bodySmall)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (notification.readAt == null) TextButton(onClick = { actions.read(notification) }, enabled = !state.locked, modifier = Modifier.testTag("notification-read-${notification.id}")) { Text(stringResource(R.string.reminders_mark_read)) }
                                    if (notification.canSnooze) OutlinedButton(onClick = { actions.openSnooze(notification) }, enabled = !state.locked && !state.reviewing, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("notification-snooze-${notification.id}")) { Text(stringResource(R.string.notifications_snooze)) }
                                    if (notification.acknowledgedAt == null) OutlinedButton(onClick = { actions.propose(ReminderCommand.Acknowledge(notification)) }, enabled = !state.locked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("notification-ack-${notification.id}")) { Icon(Icons.Default.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.reminders_acknowledge)) }
                                }
                                HorizontalDivider()
                            }
                        }
                        if (state.inboxCursor != null) item("more") { TextButton(onClick = actions.moreInbox, enabled = !state.locked) { Text(stringResource(R.string.notifications_more)) } }
                        state.preferences?.let { preference -> item("preferences") {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(stringResource(R.string.reminders_preferences), style = MaterialTheme.typography.titleLarge)
                                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = preference.value.enabled, onCheckedChange = actions.preference, enabled = !state.locked, modifier = Modifier.testTag("reminder-preference")); Text(stringResource(R.string.reminders_preference_label), Modifier.weight(1f)) }
                                Text(stringResource(R.string.reminders_preference_effect), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        } }
                    }
                    item("space") { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
    state.confirmation?.takeUnless { it is ReminderCommand.RespondRequest }?.let { command ->
        val title = when (command) { is ReminderCommand.Cancel -> R.string.reminders_confirm_cancel; is ReminderCommand.Series -> seriesConfirmTitle(command.intent.operation); else -> R.string.reminders_confirm_ack }
        val taskTitle = when (command) { is ReminderCommand.Cancel -> command.reminder.taskTitle; is ReminderCommand.Acknowledge -> command.notification.taskTitle; is ReminderCommand.Series -> command.intent.series.taskTitle; else -> "" }
        AlertDialog(onDismissRequest = actions.cancel, title = { Text(stringResource(title)) }, text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(taskTitle)
            if (command is ReminderCommand.Acknowledge) Text(stringResource(R.string.reminders_ack_not_complete))
            if (command is ReminderCommand.Series) {
                val series = command.intent.series
                Text(describeRule(series.frequency, series.repeatEvery, series.weekdays, series.localTime))
                series.nextOccurrence?.let { Text(stringResource(R.string.series_next, displayInstant(it.scheduledAt, series.timezone))) }
                Text(stringResource(seriesConfirmEffect(command.intent.operation)))
            }
        } }, confirmButton = { TextButton(onClick = actions.confirm, enabled = !state.busy, modifier = Modifier.testTag("reminder-confirm")) { Text(stringResource(if (command is ReminderCommand.Series) seriesConfirmAction(command.intent.operation) else R.string.confirm)) } }, dismissButton = { TextButton(onClick = actions.cancel, enabled = !state.busy, modifier = Modifier.testTag("reminder-dismiss")) { Text(stringResource(if (command is ReminderCommand.Series) R.string.series_keep else R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
    }
    state.snoozing?.let { item -> SnoozeDialog(state, item, actions.snoozeChoice, actions.closeSnooze, actions.snooze, actions.retry) }
    val response = (state.pending as? ReminderCommand.RespondRequest) ?: (state.confirmation as? ReminderCommand.RespondRequest)
    val proposal = state.requestReview?.request ?: response?.intent?.request
    if (proposal != null) {
        val responseType = response?.intent?.response ?: ReminderRequestResponse.ACCEPT
        val label = when (responseType) { ReminderRequestResponse.ACCEPT -> R.string.reminder_request_accept; ReminderRequestResponse.DECLINE -> R.string.reminder_request_decline; ReminderRequestResponse.CANCEL -> R.string.reminder_request_withdraw }
        val close: () -> Unit = { if (!state.locked) { if (state.requestReview != null) actions.closeRequestReview() else actions.cancel() } }
        Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().padding(20.dp), contentAlignment = Alignment.Center) {
                Surface(modifier = Modifier.widthIn(max = 560.dp).fillMaxWidth().heightIn(max = maxHeight).testTag("reminder-request-dialog"), shape = RoundedCornerShape(8.dp)) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(stringResource(if (responseType == ReminderRequestResponse.ACCEPT) R.string.reminder_request_review else label), style = MaterialTheme.typography.titleLarge)
                        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).testTag("reminder-request-review-body"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            ReminderFact(stringResource(R.string.task_title), proposal.taskTitle)
                            ReminderFact(stringResource(R.string.reminder_request_sender), proposal.requestedBy.displayName)
                            ReminderFact(stringResource(R.string.reminders_recipient), proposal.recipient.displayName)
                            ReminderFact(stringResource(R.string.reminders_local), proposal.localTime.replace('T', ' '))
                            ReminderFact(stringResource(R.string.timezone), proposal.timezone)
                            ReminderFact(stringResource(R.string.reminder_request_utc), proposal.scheduledAt.replace('T', ' '))
                            Text(stringResource(R.string.reminders_in_app), style = MaterialTheme.typography.labelLarge)
                            Text(stringResource(R.string.reminders_deadline, proposal.dispatchExpiresAt.replace('T', ' ')))
                            ReminderFact(stringResource(R.string.reminder_request_expiry), proposal.expiresAt.replace('T', ' '))
                            if (responseType == ReminderRequestResponse.ACCEPT) Text(stringResource(R.string.reminder_request_accept_effect))
                            state.error?.let { ReminderMessage(it, true) }
                        }
                        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = close, enabled = !state.locked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-request-dismiss")) { Text(stringResource(R.string.cancel)) }
                            Button(onClick = { if (state.pending != null) actions.retry() else if (responseType == ReminderRequestResponse.ACCEPT) actions.acceptRequest() else actions.confirm() }, enabled = !state.busy, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("reminder-request-confirm")) {
                                Icon(if (state.pending != null) Icons.Default.Refresh else if (responseType == ReminderRequestResponse.ACCEPT) Icons.Default.Check else Icons.Default.Close, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(if (state.pending != null) R.string.reminders_retry else label))
                            }
                        }
                    }
                }
            }
        }
    }
    if (confirmLeave) AlertDialog(onDismissRequest = { confirmLeave = false }, title = { Text(stringResource(R.string.tasks_leave_unconfirmed)) }, text = { Text(stringResource(R.string.tasks_retry_identity_warning)) }, confirmButton = { TextButton(onClick = { confirmLeave = false; onBack() }) { Text(stringResource(R.string.confirm)) } }, dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReminderTimeFields(state: ReminderWorkspaceState, enabled: Boolean, onChanged: (String, String, String) -> Unit) {
    var dateOpen by remember { mutableStateOf(false) }
    var timeOpen by remember { mutableStateOf(false) }
    var zoneOpen by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(onClick = { dateOpen = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("reminder-date"), shape = RoundedCornerShape(6.dp)) { Text(state.date.ifEmpty { stringResource(R.string.reminders_select_date) }, Modifier.weight(1f)); Icon(Icons.Default.DateRange, null) }
        OutlinedButton(onClick = { timeOpen = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("reminder-time"), shape = RoundedCornerShape(6.dp)) { Text(state.time.ifEmpty { stringResource(R.string.reminders_select_time) }, Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null) }
        OutlinedButton(onClick = { query = ""; zoneOpen = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("reminder-zone"), shape = RoundedCornerShape(6.dp)) { Text(state.timezone, Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null) }
    }
    if (dateOpen) {
        val date = rememberDatePickerState(initialSelectedDateMillis = state.date.takeIf(String::isNotEmpty)?.let { LocalDate.parse(it).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() })
        DatePickerDialog(onDismissRequest = { dateOpen = false }, confirmButton = { TextButton(onClick = { date.selectedDateMillis?.let { onChanged(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString(), state.time, state.timezone) }; dateOpen = false }, enabled = date.selectedDateMillis != null, modifier = Modifier.testTag("reminder-date-confirm")) { Text(stringResource(R.string.confirm)) } }, dismissButton = { TextButton(onClick = { dateOpen = false }) { Text(stringResource(R.string.cancel)) } }) { DatePicker(date) }
    }
    if (timeOpen) {
        val initial = state.time.takeIf(String::isNotEmpty)?.let(LocalTime::parse) ?: LocalTime.of(9, 0)
        val time = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute, is24Hour = true)
        AlertDialog(onDismissRequest = { timeOpen = false }, title = { Text(stringResource(R.string.reminders_select_time)) }, text = { TimeInput(state = time) }, confirmButton = { TextButton(onClick = { onChanged(state.date, String.format(Locale.ROOT, "%02d:%02d", time.hour, time.minute), state.timezone); timeOpen = false }, modifier = Modifier.testTag("reminder-time-confirm")) { Text(stringResource(R.string.confirm)) } }, dismissButton = { TextButton(onClick = { timeOpen = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
    }
    if (zoneOpen) AlertDialog(onDismissRequest = { zoneOpen = false }, title = { Text(stringResource(R.string.select_timezone)) }, text = {
        Column {
            OutlinedTextField(value = query, onValueChange = { query = it.take(64) }, label = { Text(stringResource(R.string.search_timezone)) }, singleLine = true)
            LazyColumn(Modifier.heightIn(max = 320.dp)) { items(state.timezones.filter { it.contains(query, ignoreCase = true) }, key = { it }) { zone -> TextButton(onClick = { onChanged(state.date, state.time, zone); zoneOpen = false }, modifier = Modifier.fillMaxWidth()) { Text(zone, Modifier.fillMaxWidth()) } } }
        }
    }, confirmButton = { TextButton(onClick = { zoneOpen = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
}

@Composable
internal fun ReminderFact(label: String, value: String) { Column { Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, style = MaterialTheme.typography.bodyLarge) } }
@Composable
internal fun ReminderMessage(message: String, error: Boolean) { Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) { Text(message, Modifier.padding(12.dp)) } }
internal fun displayInstant(value: String, zone: String) = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withZone(ZoneId.of(zone)).format(Instant.parse(value))
internal fun offsetLabel(value: Int): String { val magnitude = kotlin.math.abs(value); return String.format(Locale.ROOT, "UTC%s%02d:%02d", if (value >= 0) "+" else "-", magnitude / 60, magnitude % 60) }
private fun reminderStatusLabel(value: String) = when (value) { "scheduled" -> R.string.reminders_scheduled; "available" -> R.string.reminders_available; "cancelled" -> R.string.task_status_cancelled; "expired" -> R.string.reminders_expired; "failed" -> R.string.reminders_failed; else -> R.string.reminders_stopped }
private fun requestStatusLabel(value: String) = when (value) { "pending" -> R.string.reminder_request_pending; "accepted" -> R.string.reminder_request_accepted; "declined" -> R.string.reminder_request_declined; "cancelled" -> R.string.reminder_request_withdrawn; "expired" -> R.string.reminders_expired; else -> R.string.reminders_source_changed }
private fun reminderReasonLabel(value: String) = when (value) { "task_changed" -> R.string.reminders_source_changed; "task_closed" -> R.string.reminders_task_closed; "preference_revoked" -> R.string.reminders_permission_withdrawn; "dispatch_expired" -> R.string.reminders_deadline_passed; "dispatch_retry" -> R.string.reminders_retry_pending; "dispatch_failed" -> R.string.reminders_retry_exhausted
    "skipped" -> R.string.reminders_reason_skipped; "series_paused" -> R.string.reminders_reason_series_paused; "series_cancelled" -> R.string.reminders_reason_series_cancelled
    "series_ended" -> R.string.reminders_reason_series_ended; "series_suppressed" -> R.string.reminders_reason_series_suppressed; "acknowledged" -> R.string.reminders_reason_acknowledged
    else -> R.string.reminders_access_changed }