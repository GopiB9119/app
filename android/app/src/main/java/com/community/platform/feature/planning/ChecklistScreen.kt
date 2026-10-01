package com.community.platform.feature.planning

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.R

data class ChecklistActions(val title: (String) -> Unit, val save: () -> Unit, val retry: () -> Unit,
    val reload: () -> Unit, val check: (ChecklistItemDto, Boolean) -> Unit,
    val edit: (ChecklistItemDto) -> Unit, val remove: (ChecklistItemDto) -> Unit,
    val confirmRemove: () -> Unit, val cancelEdit: () -> Unit)

@Composable
fun ChecklistRoute(viewModel: ChecklistViewModel, accountId: String, taskId: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId && state.taskId == taskId) ChecklistScreen(state,
        ChecklistActions(viewModel::title, viewModel::saveTitle, viewModel::retry, viewModel::reload,
            viewModel::check, viewModel::edit, viewModel::remove, viewModel::confirmRemove, viewModel::cancelEdit), onBack)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChecklistScreen(state: ChecklistState, actions: ChecklistActions, onBack: () -> Unit) {
    var exit by remember { mutableStateOf<String?>(null) }
    val back: () -> Unit = {
        if (!state.busy) {
            if (state.pending != null) exit = "uncertain"
            else if (state.dirty) exit = "close"
            else onBack()
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.checklist_back)) }
                Text(stringResource(R.string.checklist_title), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().align(Alignment.CenterHorizontally).testTag("task-checklist"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                state.error?.let { item("error") { Text(it, color = MaterialTheme.colorScheme.error) } }
                state.notice?.let { item("notice") { Text(it, color = MaterialTheme.colorScheme.primary) } }
                val basis = state.basis
                if (basis != null && !state.denied) {
                    item("heading") {
                        Text(basis.taskTitle, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                        Text(pluralStringResource(R.plurals.checklist_count, basis.items.size, basis.items.count { it.checked }, basis.items.size), style = MaterialTheme.typography.bodyMedium)
                    }
                    if (basis.items.isEmpty()) item("empty") { Text(stringResource(R.string.checklist_empty)) }
                    items(basis.items, key = { it.id }) { entry ->
                        Column {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(checked = entry.checked, onCheckedChange = { actions.check(entry, it) },
                                    enabled = basis.canCheck && !state.locked && !state.conflict && !state.dirty,
                                    modifier = Modifier.testTag("checklist-check-${entry.id}").semantics { contentDescription = entry.title })
                                Text(entry.title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                            }
                            if (basis.canManage) FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                IconButton(onClick = { actions.edit(entry) }, enabled = !state.locked && !state.conflict && !state.dirty) { Icon(Icons.Default.Edit, stringResource(R.string.checklist_edit, entry.title)) }
                                IconButton(onClick = { actions.remove(entry) }, enabled = !state.locked && !state.conflict && !state.dirty) { Icon(Icons.Default.Close, stringResource(R.string.checklist_remove, entry.title)) }
                            }
                            HorizontalDivider()
                        }
                    }
                    if (basis.canManage && state.removing == null) item("editor") {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedTextField(value = state.title, onValueChange = { actions.title(it.take(400)) },
                                label = { Text(stringResource(if (state.editingId == null) R.string.checklist_new else R.string.checklist_item_title)) },
                                enabled = !state.locked, minLines = 1, maxLines = 4, modifier = Modifier.fillMaxWidth().testTag("checklist-item-title"))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = actions.save, enabled = !state.locked && !state.conflict && state.title.isNotBlank(), modifier = Modifier.testTag("checklist-save")) {
                                    Icon(if (state.editingId == null) Icons.Default.Add else Icons.Default.Check, null)
                                    Text(stringResource(if (state.editingId == null) R.string.checklist_add else R.string.checklist_save), Modifier.padding(start = 8.dp))
                                }
                                if (state.editingId != null) TextButton(onClick = actions.cancelEdit, enabled = !state.locked) { Text(stringResource(R.string.cancel)) }
                            }
                        }
                    }
                    if (state.removing != null) item("remove-review") {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(stringResource(R.string.checklist_remove_question, state.removing.title))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                TextButton(onClick = actions.cancelEdit, enabled = !state.locked) { Text(stringResource(R.string.checklist_keep)) }
                                Button(onClick = actions.confirmRemove, enabled = !state.locked && !state.conflict) { Text(stringResource(R.string.checklist_remove_item)) }
                            }
                        }
                    }
                    if (state.pending != null && !state.busy) item("retry") {
                        Text(stringResource(R.string.checklist_uncertain))
                        Button(onClick = actions.retry, modifier = Modifier.testTag("checklist-retry")) { Icon(Icons.Default.Refresh, null); Text(stringResource(R.string.checklist_retry), Modifier.padding(start = 8.dp)) }
                    }
                    if (state.conflict) item("conflict") { TextButton(onClick = { exit = "reload" }, enabled = !state.busy) { Text(stringResource(R.string.checklist_reload)) } }
                } else if (!state.busy && !state.denied) item("reload") { TextButton(onClick = actions.reload) { Text(stringResource(R.string.checklist_reload)) } }
            }
        }
    }
    if (exit != null) AlertDialog(onDismissRequest = { exit = null },
        title = { Text(stringResource(if (exit == "uncertain") R.string.checklist_leave_uncertain else R.string.checklist_discard_title)) },
        text = { Text(stringResource(if (exit == "uncertain") R.string.checklist_leave_warning else R.string.checklist_discard_warning)) },
        confirmButton = { TextButton(onClick = { val action = exit; exit = null; if (action == "reload") actions.reload() else onBack() }) { Text(stringResource(R.string.checklist_continue)) } },
        dismissButton = { TextButton(onClick = { exit = null }) { Text(stringResource(R.string.space_settings_keep)) } })
}