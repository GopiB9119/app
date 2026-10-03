package com.community.platform.feature.spaces

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R

data class SpaceSettingsActions(
    val name: (String) -> Unit, val save: () -> Unit, val retry: () -> Unit, val reload: () -> Unit, val description: (String) -> Unit,
    val proposeInvitePolicy: () -> Unit = {}, val cancelInvitePolicy: () -> Unit = {}, val confirmInvitePolicy: () -> Unit = {},
    val proposeAgentPolicy: () -> Unit = {}, val cancelAgentPolicy: () -> Unit = {}, val confirmAgentPolicy: () -> Unit = {},
)

@Composable
fun SpaceSettingsRoute(viewModel: SpaceSettingsViewModel, accountId: String, spaceId: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId && state.spaceId == spaceId) SpaceSettingsScreen(state,
        SpaceSettingsActions(viewModel::name, viewModel::save, viewModel::retry, viewModel::reload, viewModel::description,
            viewModel::proposeInvitePolicy, viewModel::cancelInvitePolicy, viewModel::confirmInvitePolicy,
            viewModel::proposeAgentPolicy, viewModel::cancelAgentPolicy, viewModel::confirmAgentPolicy), onBack)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SpaceSettingsScreen(state: SpaceSettingsState, actions: SpaceSettingsActions, onBack: () -> Unit) {
    var confirmation by remember { mutableStateOf<String?>(null) }
    val descriptionChanged = state.basis != null && state.description.trim() != state.basis.description.orEmpty()
    val descriptionDirty = state.basis != null && state.description != state.basis.description.orEmpty()
    val back: () -> Unit = {
        if (!state.busy) {
            if (state.pending != null || state.pendingInvitePolicy != null || state.pendingAgentPolicy != null) confirmation = "uncertain"
            else if (state.confirmingInvitePolicy) actions.cancelInvitePolicy()
            else if (state.confirmingAgentPolicy) actions.cancelAgentPolicy()
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
            Column(Modifier.widthIn(max = 640.dp).fillMaxWidth().align(Alignment.CenterHorizontally).verticalScroll(rememberScrollState()).padding(DesignTokens.SpaceUnit * 5), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 4)) {
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) }
                state.notice?.let { Text(when (it) {
                    "Everyone in the Space can now invite people." -> stringResource(R.string.space_settings_invite_policy_enabled)
                    "Only you and admins can invite people now." -> stringResource(R.string.space_settings_invite_policy_disabled)
                    "This Space changed. Reload and review it again." -> stringResource(R.string.space_settings_invite_policy_changed)
                    "The agent is on in this Space." -> stringResource(R.string.space_settings_agent_now_on)
                    "The agent is off in this Space." -> stringResource(R.string.space_settings_agent_now_off)
                    else -> it
                }, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
                if (state.basis != null && !state.denied) {
                    Text(stringResource(R.string.space_settings_current, state.basis.name), style = MaterialTheme.typography.titleMedium)
                    Text(state.basis.id, style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(value = state.name, onValueChange = { actions.name(it.take(160)) },
                        label = { Text(stringResource(R.string.space_settings_name)) }, enabled = !state.locked,
                        minLines = 1, maxLines = 4, modifier = Modifier.fillMaxWidth().testTag("space-settings-name"))
                    OutlinedTextField(value = state.description, onValueChange = actions.description,
                        label = { Text(stringResource(if (state.basis.visibility == "public") R.string.space_settings_description_public else R.string.space_settings_description_private)) },
                        enabled = !state.locked, minLines = 3, maxLines = 6,
                        supportingText = { Text(stringResource(R.string.space_settings_description_count, state.description.codePointCount(0, state.description.length)), Modifier.fillMaxWidth(), textAlign = TextAlign.End) },
                        modifier = Modifier.fillMaxWidth().testTag("space-settings-description"))
                    if (state.pending != null && !state.busy) Text(stringResource(if (state.pending.description != null) R.string.space_settings_uncertain_changes else R.string.space_settings_uncertain))
                    Button(onClick = if (state.pending != null) actions.retry else actions.save,
                        enabled = !state.busy && !state.conflict && !state.confirmingInvitePolicy && state.pendingInvitePolicy == null && !state.confirmingAgentPolicy && state.pendingAgentPolicy == null && state.name.isNotBlank() && (state.pending != null || state.name.trim() != state.basis.name || descriptionChanged),
                        shape = RoundedCornerShape(DesignTokens.ControlRadius),
                        modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("space-settings-save")) {
                        Icon(if (state.pending != null) Icons.Default.Refresh else Icons.Default.Check, null)
                        Text(stringResource(when {
                            state.pending?.description != null -> R.string.space_settings_retry_changes
                            state.pending != null -> R.string.space_settings_retry
                            descriptionChanged -> R.string.save_changes
                            else -> R.string.space_settings_save
                        }), Modifier.padding(start = 8.dp))
                    }
                    if (state.basis.role == "owner" && state.basis.spaceType in setOf("family", "group")) {
                        HorizontalDivider()
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                            Text(stringResource(R.string.space_settings_invite_policy_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                            Text(stringResource(if (state.basis.memberInvites) R.string.space_settings_invite_policy_everyone else R.string.space_settings_invite_policy_managers))
                            if (!state.confirmingInvitePolicy) {
                                OutlinedButton(onClick = actions.proposeInvitePolicy, enabled = !state.locked && !state.dirty && !state.conflict,
                                    shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("space-settings-invite-policy")) {
                                    Icon(Icons.Default.Edit, null)
                                    Text(stringResource(R.string.space_settings_invite_policy_change), Modifier.weight(1f).padding(start = DesignTokens.SpaceUnit * 2))
                                }
                            } else {
                                val enabled = state.pendingInvitePolicy?.memberInvites ?: !state.basis.memberInvites
                                Text(stringResource(if (enabled) R.string.space_settings_invite_policy_confirm_on else R.string.space_settings_invite_policy_confirm_off), Modifier.testTag("space-settings-invite-policy-description"))
                                if (state.pendingInvitePolicy != null && !state.busy) Text(stringResource(R.string.space_settings_invite_policy_uncertain))
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                                    TextButton(onClick = actions.cancelInvitePolicy, enabled = !state.busy && state.pendingInvitePolicy == null,
                                        modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("space-settings-invite-policy-cancel")) { Text(stringResource(R.string.cancel)) }
                                    Button(onClick = actions.confirmInvitePolicy, enabled = !state.busy,
                                        shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("space-settings-invite-policy-confirm")) {
                                        Text(stringResource(if (state.pendingInvitePolicy != null) R.string.space_settings_invite_policy_retry else R.string.confirm))
                                    }
                                }
                            }
                        }
                    }
                    if (state.basis.role == "owner") {
                        HorizontalDivider()
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                            Text(stringResource(R.string.space_settings_agent_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                            Text(stringResource(if (state.basis.agentEnabled) R.string.space_settings_agent_on else R.string.space_settings_agent_off))
                            if (!state.confirmingAgentPolicy) {
                                OutlinedButton(onClick = actions.proposeAgentPolicy, enabled = !state.locked && !state.dirty && !state.conflict,
                                    shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("space-settings-agent-policy")) {
                                    Icon(Icons.Default.Edit, null)
                                    Text(stringResource(if (state.basis.agentEnabled) R.string.space_settings_agent_turn_off else R.string.space_settings_agent_turn_on), Modifier.weight(1f).padding(start = DesignTokens.SpaceUnit * 2))
                                }
                            } else {
                                val enabled = state.pendingAgentPolicy?.agentEnabled ?: !state.basis.agentEnabled
                                Text(stringResource(if (enabled) R.string.space_settings_agent_confirm_on else R.string.space_settings_agent_confirm_off, state.basis.name), Modifier.testTag("space-settings-agent-policy-description"))
                                if (state.pendingAgentPolicy != null && !state.busy) Text(stringResource(R.string.space_settings_invite_policy_uncertain))
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                                    TextButton(onClick = actions.cancelAgentPolicy, enabled = !state.busy && state.pendingAgentPolicy == null,
                                        modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("space-settings-agent-policy-cancel")) { Text(stringResource(R.string.cancel)) }
                                    Button(onClick = actions.confirmAgentPolicy, enabled = !state.busy,
                                        shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("space-settings-agent-policy-confirm")) {
                                        Text(stringResource(if (state.pendingAgentPolicy != null) R.string.space_settings_invite_policy_retry else if (enabled) R.string.space_settings_agent_turn_on else R.string.space_settings_agent_turn_off))
                                    }
                                }
                            }
                        }
                    }
                    if (state.conflict) TextButton(onClick = { confirmation = "reload" }, enabled = !state.busy) { Text(stringResource(R.string.space_settings_reload)) }
                } else if (!state.denied && !state.busy) TextButton(onClick = actions.reload) { Text(stringResource(R.string.space_settings_reload)) }
            }
        }
    }
    if (confirmation != null) AlertDialog(
        onDismissRequest = { confirmation = null },
        title = { Text(stringResource(when {
            confirmation == "uncertain" -> R.string.space_settings_unconfirmed_title
            descriptionDirty -> R.string.space_settings_discard_changes_title
            else -> R.string.space_settings_discard_title
        })) },
        text = { Text(stringResource(when {
            confirmation == "uncertain" && (state.pendingInvitePolicy != null || state.pendingAgentPolicy != null) -> R.string.space_settings_invite_policy_leave_uncertain
            confirmation == "uncertain" && state.pending?.description != null -> R.string.space_settings_leave_uncertain_changes
            confirmation == "uncertain" -> R.string.space_settings_leave_uncertain
            confirmation == "reload" && descriptionDirty -> R.string.space_settings_discard_changes_reload
            confirmation == "reload" -> R.string.space_settings_discard_reload
            descriptionDirty -> R.string.space_settings_discard_changes_body
            else -> R.string.space_settings_discard_body
        })) },
        confirmButton = { TextButton(onClick = { val action = confirmation; confirmation = null; if (action == "reload") actions.reload() else onBack() }) { Text(stringResource(when {
            confirmation == "uncertain" -> R.string.space_settings_leave
            descriptionDirty -> R.string.space_settings_discard_changes
            else -> R.string.space_settings_discard
        })) } },
        dismissButton = { TextButton(onClick = { confirmation = null }) { Text(stringResource(R.string.space_settings_keep)) } },
    )
}