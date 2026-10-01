package com.community.platform.feature.spaces

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.R

data class SpaceSettingsActions(val name: (String) -> Unit, val save: () -> Unit, val retry: () -> Unit, val reload: () -> Unit)

@Composable
fun SpaceSettingsRoute(viewModel: SpaceSettingsViewModel, accountId: String, spaceId: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId && state.spaceId == spaceId) SpaceSettingsScreen(state,
        SpaceSettingsActions(viewModel::name, viewModel::save, viewModel::retry, viewModel::reload), onBack)
}

@Composable
fun SpaceSettingsScreen(state: SpaceSettingsState, actions: SpaceSettingsActions, onBack: () -> Unit) {
    var confirmation by remember { mutableStateOf<String?>(null) }
    val back: () -> Unit = {
        if (!state.busy) {
            if (state.pending != null) confirmation = "uncertain"
            else if (state.dirty) confirmation = "leave"
            else onBack()
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.space_settings_back)) }
                Text(stringResource(R.string.space_settings_title), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            Column(Modifier.widthIn(max = 640.dp).fillMaxWidth().align(Alignment.CenterHorizontally).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) }
                state.notice?.let { Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
                if (state.basis != null && !state.denied) {
                    Text(stringResource(R.string.space_settings_current, state.basis.name), style = MaterialTheme.typography.titleMedium)
                    Text(state.basis.id, style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(value = state.name, onValueChange = { actions.name(it.take(160)) },
                        label = { Text(stringResource(R.string.space_settings_name)) }, enabled = !state.locked,
                        minLines = 1, maxLines = 4, modifier = Modifier.fillMaxWidth().testTag("space-settings-name"))
                    if (state.pending != null && !state.busy) Text(stringResource(R.string.space_settings_uncertain))
                    Button(onClick = if (state.pending != null) actions.retry else actions.save,
                        enabled = !state.busy && !state.conflict && state.name.isNotBlank() && (state.pending != null || state.name.trim() != state.basis.name),
                        modifier = Modifier.fillMaxWidth().testTag("space-settings-save")) {
                        Icon(if (state.pending != null) Icons.Default.Refresh else Icons.Default.Check, null)
                        Text(stringResource(if (state.pending != null) R.string.space_settings_retry else R.string.space_settings_save), Modifier.padding(start = 8.dp))
                    }
                    if (state.conflict) TextButton(onClick = { confirmation = "reload" }, enabled = !state.busy) { Text(stringResource(R.string.space_settings_reload)) }
                } else if (!state.denied && !state.busy) TextButton(onClick = actions.reload) { Text(stringResource(R.string.space_settings_reload)) }
            }
        }
    }
    if (confirmation != null) AlertDialog(
        onDismissRequest = { confirmation = null },
        title = { Text(stringResource(if (confirmation == "uncertain") R.string.space_settings_unconfirmed_title else R.string.space_settings_discard_title)) },
        text = { Text(stringResource(if (confirmation == "uncertain") R.string.space_settings_leave_uncertain else if (confirmation == "reload") R.string.space_settings_discard_reload else R.string.space_settings_discard_body)) },
        confirmButton = { TextButton(onClick = { val action = confirmation; confirmation = null; if (action == "reload") actions.reload() else onBack() }) { Text(stringResource(if (confirmation == "uncertain") R.string.space_settings_leave else R.string.space_settings_discard)) } },
        dismissButton = { TextButton(onClick = { confirmation = null }) { Text(stringResource(R.string.space_settings_keep)) } },
    )
}