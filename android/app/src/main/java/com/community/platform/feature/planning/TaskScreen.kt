package com.community.platform.feature.planning

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val unit = DesignTokens.SpaceUnit

data class TaskActions(
    val refresh: () -> Unit,
    val selectSpace: (String) -> Unit,
    val loadMoreSpaces: () -> Unit,
    val filter: (String?) -> Unit,
    val loadMore: () -> Unit,
    val create: () -> Unit,
    val open: (TaskRecord) -> Unit,
    val edit: (TaskRecord) -> Unit,
    val updateFields: (TaskFields, Boolean) -> Unit,
    val save: () -> Unit,
    val closeEditor: () -> Unit,
    val closeDetail: () -> Unit,
    val proposeStatus: (TaskRecord, String) -> Unit,
    val confirmStatus: () -> Unit,
    val cancelStatus: () -> Unit,
    val retry: () -> Unit,
    val reloadLatest: () -> Unit,
)

@Composable
fun TaskRoute(viewModel: TaskViewModel, accountId: String, onBack: () -> Unit, onSessionLost: () -> Unit, onRemind: ((TaskRecord) -> Unit)? = null, onChecklist: ((TaskRecord) -> Unit)? = null) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId != accountId) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(32.dp)) }
        return
    }
    TaskScreen(state, TaskActions(
        viewModel::refresh, viewModel::selectSpace, viewModel::loadMoreSpaces, viewModel::filter,
        viewModel::loadMore, viewModel::create, viewModel::open, viewModel::edit,
        viewModel::updateFields, viewModel::save, viewModel::closeEditor, viewModel::closeDetail,
        viewModel::proposeStatus, viewModel::confirmStatus, viewModel::cancelStatus,
        viewModel::retry, viewModel::reloadLatest,
    ), onBack, onRemind, onChecklist)
}

private enum class LocalConfirmation { DISCARD, LEAVE_UNCONFIRMED, RELOAD }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TaskScreen(state: TaskWorkspaceState, actions: TaskActions, onBack: () -> Unit, onRemind: ((TaskRecord) -> Unit)? = null, onChecklist: ((TaskRecord) -> Unit)? = null) {
    var localConfirmation by remember { mutableStateOf<LocalConfirmation?>(null) }
    var choosingSpace by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val viewKey = state.editor?.identity ?: state.detail?.task?.id ?: state.selectedSpace?.id ?: "spaces"
    LaunchedEffect(viewKey) { listState.scrollToItem(0) }
    // The message about the last action is the list's first item. A lazy list leaves out items scrolled off screen,
    // so after an action further down, such as saving the editor, bring it into view to be seen and announced.
    LaunchedEffect(state.error, state.notice, state.messageId) { if (state.error != null || state.notice != null) listState.scrollToItem(0) }
    val back: () -> Unit = {
        if (!state.busy) {
            when {
                state.pendingCommand != null -> localConfirmation = LocalConfirmation.LEAVE_UNCONFIRMED
                state.editor != null -> if (state.editor.dirty) localConfirmation = LocalConfirmation.DISCARD else actions.closeEditor()
                state.detail != null -> actions.closeDetail()
                else -> onBack()
            }
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = unit * 2, vertical = unit * 2), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.busy) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(if (state.editor != null || state.detail != null) R.string.tasks_back else R.string.tasks_account))
                }
                Column(Modifier.weight(1f).padding(horizontal = unit)) {
                    Text(stringResource(if (state.selectedSpace?.spaceType == "solo") R.string.solo_tasks else R.string.family_tasks), style = MaterialTheme.typography.titleLarge)
                    Text(state.selectedSpace?.name ?: stringResource(R.string.local_environment), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = actions.refresh, enabled = !state.navigationLocked) { Icon(Icons.Default.Refresh, stringResource(R.string.tasks_refresh)) }
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.widthIn(max = 760.dp).fillMaxSize().testTag("task-workspace"),
                    verticalArrangement = Arrangement.spacedBy(unit * 4),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(unit * 5),
                ) {
                    if (state.error != null) item("error") {
                        TaskMessage(state.error, true)
                        if (state.conflict) TextButton(onClick = { localConfirmation = LocalConfirmation.RELOAD }, enabled = !state.busy) {
                            Icon(Icons.Default.Refresh, null, Modifier.size(18.dp)); Spacer(Modifier.width(unit * 2)); Text(stringResource(R.string.tasks_reload_latest))
                        } else if (state.pendingCommand == null && state.editor == null) {
                            TextButton(onClick = actions.refresh, enabled = !state.busy) { Text(stringResource(R.string.tasks_retry_loading)) }
                        }
                    }
                    if (state.notice != null) item("notice") { TaskMessage(state.notice, false) }
                    if (state.pendingCommand != null && !state.busy) item("unconfirmed") {
                        Column(verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                            Text(stringResource(R.string.tasks_save_unconfirmed), style = MaterialTheme.typography.titleMedium)
                            Text(stringResource(R.string.tasks_may_be_saved), style = MaterialTheme.typography.bodyMedium)
                            OutlinedButton(onClick = actions.retry, shape = RoundedCornerShape(DesignTokens.ControlRadius)) {
                                Icon(Icons.Default.Refresh, null, Modifier.size(18.dp)); Spacer(Modifier.width(unit * 2)); Text(stringResource(R.string.tasks_retry_save))
                            }
                        }
                    }
                    val editor = state.editor
                    val detail = state.detail
                    when {
                        editor != null -> {
                            item("editor-title") { Text(stringResource(if (editor.original == null) R.string.tasks_new else R.string.tasks_edit), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() }) }
                            val enabled = !state.busy && state.pendingCommand == null
                            item("title") { OutlinedTextField(value = editor.fields.title, onValueChange = { actions.updateFields(editor.fields.copy(title = it.take(400)), false) }, label = { Text(stringResource(R.string.task_title)) }, enabled = enabled, minLines = 1, maxLines = 3, modifier = Modifier.fillMaxWidth().testTag("task-title")) }
                            item("notes") { OutlinedTextField(value = editor.fields.description, onValueChange = { actions.updateFields(editor.fields.copy(description = it.take(10000)), false) }, label = { Text(stringResource(R.string.task_notes)) }, enabled = enabled, minLines = 3, maxLines = 8, modifier = Modifier.fillMaxWidth().testTag("task-notes")) }
                            item("due-date") { TaskDateField(editor.fields.dueDate, enabled) { actions.updateFields(editor.fields.copy(dueDate = it), false) } }
                            item("assignee") { TaskAssigneeField(editor, state.assignees, enabled) { actions.updateFields(editor.fields.copy(assigneeId = it), true) } }
                            item("editor-actions") {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 3), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                                    Button(onClick = actions.save, enabled = enabled && !state.conflict && (editor.original == null || editor.dirty), shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("task-save")) {
                                        Icon(Icons.Default.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(unit * 2)); Text(stringResource(R.string.tasks_save))
                                    }
                                    OutlinedButton(onClick = back, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) { Text(stringResource(R.string.cancel)) }
                                }
                            }
                        }
                        detail != null -> {
                            item("detail") { TaskDetail(detail, state, actions, onRemind) }
                            if (onChecklist != null) item("checklist") { OutlinedButton(onClick = { onChecklist(detail) }, enabled = !state.navigationLocked, modifier = Modifier.fillMaxWidth().testTag("task-open-checklist")) { Icon(Icons.Default.Check, null); Text(stringResource(R.string.checklist_title), Modifier.padding(start = unit * 2)) } }
                        }
                        else -> {
                            item("controls") {
                                Column(verticalArrangement = Arrangement.spacedBy(unit * 4)) {
                                    OutlinedButton(onClick = { choosingSpace = true }, enabled = !state.busy && state.spaces.isNotEmpty(), shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("task-space")) {
                                        Text(state.selectedSpace?.name ?: stringResource(R.string.tasks_choose_space), Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null)
                                    }
                                    if (state.selectedSpace != null) FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 3), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                                        TaskFilter(state.statusFilter, !state.busy, actions.filter)
                                        Button(onClick = actions.create, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) {
                                            Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(unit * 2)); Text(stringResource(R.string.tasks_new))
                                        }
                                    }
                                }
                            }
                            if (!state.busy && state.spaces.isEmpty() && state.error == null) item("no-spaces") { Text(stringResource(R.string.tasks_no_spaces), style = MaterialTheme.typography.bodyLarge) }
                            if (!state.busy && state.selectedSpace != null && state.tasks.isEmpty() && state.error == null) item("no-tasks") { Text(stringResource(R.string.tasks_none), style = MaterialTheme.typography.bodyLarge) }
                            items(state.tasks, key = { "task-${it.task.id}" }) { record -> TaskRow(record, !state.busy, actions.open) }
                            if (state.nextCursor != null) item("load-more") { OutlinedButton(onClick = actions.loadMore, enabled = !state.busy, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.tasks_load_more)) } }
                        }
                    }
                    item("bottom-space") { Spacer(Modifier.height(unit * 4)) }
                }
            }
        }
    }
    if (choosingSpace) {
        AlertDialog(onDismissRequest = { choosingSpace = false }, title = { Text(stringResource(R.string.tasks_choose_space)) }, text = {
            LazyColumn(Modifier.heightIn(max = 380.dp)) {
                items(state.spaces, key = FamilySpaceDto::id) { space ->
                    TextButton(onClick = { actions.selectSpace(space.id); choosingSpace = false }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)) { Text(space.name, Modifier.fillMaxWidth()) }
                }
                if (state.spaceCursor != null) item { TextButton(onClick = actions.loadMoreSpaces, enabled = !state.busy) { Text(stringResource(R.string.tasks_more_spaces)) } }
            }
        }, confirmButton = { TextButton(onClick = { choosingSpace = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(DesignTokens.DialogRadius))
    }
    state.confirmation?.let { confirmation ->
        AlertDialog(onDismissRequest = actions.cancelStatus, title = { Text(stringResource(R.string.tasks_confirm_status, stringResource(statusLabel(confirmation.status)))) }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                Text(confirmation.record.task.title, style = MaterialTheme.typography.titleMedium)
                confirmation.record.task.assignee?.let { Text(stringResource(R.string.tasks_assigned_to, it.displayName)) }
            }
        }, confirmButton = { TextButton(onClick = actions.confirmStatus, enabled = !state.busy, modifier = Modifier.testTag("task-status-confirm")) { Text(stringResource(R.string.confirm)) } }, dismissButton = { TextButton(onClick = actions.cancelStatus, enabled = !state.busy, modifier = Modifier.testTag("task-status-cancel")) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(DesignTokens.DialogRadius))
    }
    localConfirmation?.let { confirmation ->
        val title = when (confirmation) { LocalConfirmation.DISCARD -> R.string.tasks_discard_draft; LocalConfirmation.LEAVE_UNCONFIRMED -> R.string.tasks_leave_unconfirmed; LocalConfirmation.RELOAD -> R.string.tasks_reload_discard }
        AlertDialog(onDismissRequest = { localConfirmation = null }, title = { Text(stringResource(title)) }, text = {
            if (confirmation == LocalConfirmation.LEAVE_UNCONFIRMED) Text(stringResource(R.string.tasks_retry_identity_warning))
        }, confirmButton = { TextButton(modifier = Modifier.testTag("task-local-confirm"), onClick = {
            localConfirmation = null
            when (confirmation) { LocalConfirmation.DISCARD -> actions.closeEditor(); LocalConfirmation.LEAVE_UNCONFIRMED -> onBack(); LocalConfirmation.RELOAD -> actions.reloadLatest() }
        }) { Text(stringResource(R.string.confirm)) } }, dismissButton = { TextButton(onClick = { localConfirmation = null }, modifier = Modifier.testTag("task-local-cancel")) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(DesignTokens.DialogRadius))
    }
}

@Composable
private fun TaskRow(record: TaskRecord, enabled: Boolean, open: (TaskRecord) -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(enabled = enabled, role = Role.Button) { open(record) }.padding(vertical = unit * 2).testTag("task-row-${record.task.id}"), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(unit * 3)) {
            Text(record.task.title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(19.dp), tint = MaterialTheme.colorScheme.primary)
        }
        Text(stringResource(statusLabel(record.task.status)), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Text(assigneeLabel(record.task), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        record.task.dueDate?.let { Text(stringResource(R.string.tasks_due_value, formatDate(it)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        HorizontalDivider(Modifier.padding(top = unit * 2))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TaskDetail(record: TaskRecord, state: TaskWorkspaceState, actions: TaskActions, onRemind: ((TaskRecord) -> Unit)?) {
    val task = record.task
    val enabled = !state.busy && state.pendingCommand == null && !state.conflict
    Column(verticalArrangement = Arrangement.spacedBy(unit * 5)) {
        Text(task.title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
        Text(stringResource(statusLabel(task.status)), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium)
        if (task.description.isNotEmpty()) SelectionContainer { Text(task.description, style = MaterialTheme.typography.bodyLarge) }
        HorizontalDivider()
        Text(assigneeLabel(task), style = MaterialTheme.typography.bodyLarge)
        Text(task.dueDate?.let { stringResource(R.string.tasks_due_value, formatDate(it)) } ?: stringResource(R.string.tasks_no_due_date))
        if (task.completedAt != null) {
            Text(stringResource(R.string.tasks_completed_at, task.completedAt), style = MaterialTheme.typography.bodySmall)
            task.completedByAccountId?.let { Text(stringResource(R.string.tasks_completed_by, it), style = MaterialTheme.typography.bodySmall) }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 3), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            if (onRemind != null && task.status in setOf("open", "in_progress")) OutlinedButton(onClick = { onRemind(record) }, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Icon(Icons.Default.Notifications, null, Modifier.size(18.dp)); Spacer(Modifier.width(unit * 2)); Text(stringResource(R.string.reminders_me)) }
            if (task.permissions.canEdit) OutlinedButton(onClick = { actions.edit(record) }, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius)) {
                Icon(Icons.Default.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(unit * 2)); Text(stringResource(R.string.tasks_edit))
            }
            task.permissions.allowedStatuses.forEach { status ->
                OutlinedButton(onClick = { actions.proposeStatus(record, status) }, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) {
                    Icon(if (status == "cancelled") Icons.Default.Close else Icons.Default.Check, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(unit * 2)); Text(stringResource(statusAction(status)))
                }
            }
        }
    }
}

@Composable
private fun TaskFilter(selected: String?, enabled: Boolean, onSelected: (String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("task-filter")) {
            Text(selected?.let { stringResource(statusLabel(it)) } ?: stringResource(R.string.tasks_all_statuses)); Icon(Icons.Default.ArrowDropDown, null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            listOf(null, "open", "in_progress", "completed", "cancelled").forEach { status ->
                DropdownMenuItem(text = { Text(status?.let { stringResource(statusLabel(it)) } ?: stringResource(R.string.tasks_all_statuses)) }, onClick = { expanded = false; onSelected(status) })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskDateField(value: String?, enabled: Boolean, onSelected: (String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2)) {
        Text(stringResource(R.string.task_due_date), style = MaterialTheme.typography.labelLarge)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.weight(1f).heightIn(min = DesignTokens.MinimumTarget).testTag("task-due-date"), shape = RoundedCornerShape(DesignTokens.ControlRadius)) {
                Icon(Icons.Default.DateRange, null, Modifier.size(19.dp)); Spacer(Modifier.width(unit * 3)); Text(value?.let(::formatDate) ?: stringResource(R.string.tasks_no_due_date), Modifier.weight(1f))
            }
            if (value != null) IconButton(onClick = { onSelected(null) }, enabled = enabled) { Icon(Icons.Default.Close, stringResource(R.string.tasks_clear_due_date)) }
        }
    }
    if (expanded) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = value?.let { LocalDate.parse(it).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() })
        DatePickerDialog(onDismissRequest = { expanded = false }, confirmButton = {
            TextButton(onClick = { picker.selectedDateMillis?.let { onSelected(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }; expanded = false }, enabled = picker.selectedDateMillis != null, modifier = Modifier.testTag("task-date-confirm")) { Text(stringResource(R.string.confirm)) }
        }, dismissButton = { TextButton(onClick = { expanded = false }) { Text(stringResource(R.string.cancel)) } }) { DatePicker(state = picker) }
    }
}

@Composable
private fun TaskAssigneeField(editor: TaskEditor, assignees: List<TaskAssigneeDto>, enabled: Boolean, onSelected: (String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val unavailable = editor.original?.task?.assigneeUnavailable == true && !editor.changeAssignee
    val selected = assignees.firstOrNull { it.accountId == editor.fields.assigneeId }?.displayName
    val label = if (unavailable) stringResource(R.string.tasks_assignee_unavailable) else selected ?: stringResource(R.string.tasks_unassigned)
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2)) {
        Text(stringResource(R.string.task_assignee), style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("task-assignee")) { Text(label, Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null) }
    }
    if (expanded) AlertDialog(onDismissRequest = { expanded = false }, title = { Text(stringResource(R.string.task_assignee)) }, text = {
        LazyColumn(Modifier.heightIn(max = 380.dp)) {
            item { TextButton(onClick = { onSelected(null); expanded = false }, modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)) { Text(stringResource(R.string.tasks_unassigned), Modifier.fillMaxWidth()) } }
            items(assignees, key = TaskAssigneeDto::accountId) { assignee ->
                TextButton(onClick = { onSelected(assignee.accountId); expanded = false }, modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)) {
                    Column(Modifier.fillMaxWidth()) { Text(assignee.displayName); Text(assignee.accountId, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }, confirmButton = { TextButton(onClick = { expanded = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(DesignTokens.DialogRadius))
}

@Composable
private fun TaskMessage(message: String, error: Boolean) {
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) {
        Text(message, Modifier.padding(unit * 3), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun assigneeLabel(task: FamilyTaskDto): String = when {
    task.assigneeUnavailable -> stringResource(R.string.tasks_assignee_unavailable)
    task.assignee != null -> stringResource(R.string.tasks_assigned_to, task.assignee.displayName)
    else -> stringResource(R.string.tasks_unassigned)
}

private fun statusLabel(status: String): Int = when (status) {
    "open" -> R.string.task_status_open
    "in_progress" -> R.string.task_status_in_progress
    "completed" -> R.string.task_status_completed
    else -> R.string.task_status_cancelled
}

private fun statusAction(status: String): Int = when (status) {
    "open" -> R.string.task_mark_open
    "in_progress" -> R.string.task_start
    "completed" -> R.string.task_complete
    else -> R.string.task_cancel
}

private fun formatDate(value: String): String = LocalDate.parse(value).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))