package com.community.platform.feature.agents

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.DateTimeException
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class AgentActions(
    val back: () -> Unit = {}, val show: (AgentView) -> Unit = {}, val chooseSpace: (String?) -> Unit = {},
    val reloadSpaces: () -> Unit = {}, val reload: () -> Unit = {}, val more: () -> Unit = {}, val reloadMemories: () -> Unit = {},
    val message: (String) -> Unit = {}, val ask: () -> Unit = {}, val reply: (String, String) -> Unit = { _, _ -> },
    val answer: (String) -> Unit = {}, val decide: (String, Boolean) -> Unit = { _, _ -> }, val stop: (String) -> Unit = {},
    val askForget: (AgentMemoryDto) -> Unit = {}, val keep: () -> Unit = {}, val forget: () -> Unit = {},
    val retry: () -> Unit = {}, val discard: () -> Unit = {}, val openSpaceChat: (String) -> Unit = {},
)

@Composable
fun AgentRoute(viewModel: AgentViewModel, accountId: String, timezone: String, onBack: () -> Unit, onSessionLost: () -> Unit,
    onOpenSpaceChat: (String) -> Unit = {}) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) AgentScreen(state, AgentActions(back = onBack, show = viewModel::show, chooseSpace = viewModel::chooseSpace,
        reloadSpaces = viewModel::reloadSpaces, reload = { viewModel.reload() }, more = { viewModel.reload(more = true) },
        reloadMemories = viewModel::reloadMemories, message = viewModel::message, ask = viewModel::ask, reply = viewModel::reply,
        answer = viewModel::answer, decide = viewModel::decide, stop = viewModel::stop, askForget = viewModel::askForget,
        keep = viewModel::keepMemory, forget = viewModel::forget, retry = viewModel::retry, discard = viewModel::discard,
        openSpaceChat = onOpenSpaceChat), timezone)
}

private fun moment(value: String, zone: ZoneId): String = try {
    Instant.parse(value).atZone(zone).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT))
} catch (_error: DateTimeException) { value }

@Composable
internal fun statusLabel(run: AgentRunDto): String = stringResource(when {
    run.status == "completed" && run.outcome == "refused" -> R.string.agent_status_refused
    run.status == "completed" && run.intent == "unknown" -> R.string.agent_status_not_understood
    run.status == "queued" -> R.string.agent_status_queued
    run.status == "running" -> R.string.agent_status_running
    run.status == "waiting_for_approval" -> R.string.agent_status_approval
    run.status == "waiting_for_user" -> R.string.agent_status_question
    run.status == "verifying" -> R.string.agent_status_verifying
    run.status == "completed" -> R.string.agent_status_completed
    run.status == "failed" -> R.string.agent_status_failed
    run.status == "cancelled" -> R.string.agent_status_cancelled
    run.status == "timed_out" -> R.string.agent_status_timed_out
    else -> R.string.agent_status_expired
})

@Composable
private fun AgentMessages(state: AgentState, tag: String) {
    val announce = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
    state.problem?.let {
        Text(stringResource(when (it) {
            AgentProblem.EMPTY -> R.string.agent_problem_empty
            AgentProblem.TOO_LONG -> R.string.agent_problem_long
            AgentProblem.CONTROL -> R.string.agent_problem_control
        }), color = MaterialTheme.colorScheme.error, modifier = announce.testTag("$tag-problem"))
    }
    state.issue?.let {
        Text(stringResource(when (it) {
            AgentIssue.CONNECTION -> R.string.agent_offline
            AgentIssue.RESPONSE -> R.string.agent_unexpected
            AgentIssue.UNCERTAIN -> R.string.agent_uncertain
        }), color = MaterialTheme.colorScheme.error, modifier = announce.testTag("$tag-issue"))
    }
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = announce.testTag("$tag-error")) }
}

@Composable
fun AgentScreen(state: AgentState, actions: AgentActions, timezone: String = "UTC") {
    val zone = remember(timezone) { try { ZoneId.of(timezone) } catch (_error: DateTimeException) { ZoneOffset.UTC } }
    var leaving by remember { mutableStateOf(false) }
    val back: () -> Unit = { if (state.uncertain) { leaving = true } else { actions.back() } }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(DesignTokens.SpaceUnit * 2), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.agent_back))
                }
                Text(stringResource(R.string.agent_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
                if (state.view == AgentView.REQUESTS) IconButton(onClick = actions.reload,
                    enabled = !state.busy && !state.uncertain, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-refresh")) {
                    Icon(Icons.Default.Refresh, stringResource(R.string.agent_refresh))
                }
            }
            HorizontalDivider(color = DesignTokens.Border)
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(DesignTokens.SpaceUnit)) else Spacer(Modifier.height(DesignTokens.SpaceUnit))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(Modifier.widthIn(max = DesignTokens.SpaceUnit * 180).fillMaxSize().testTag("agent-content"),
                    contentPadding = PaddingValues(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                    item("intro") { Text(stringResource(R.string.agent_intro), style = MaterialTheme.typography.bodyMedium, color = DesignTokens.Muted) }
                    item("views") { AgentViews(state, actions) }
                    if (state.view == AgentView.REQUESTS) requests(state, actions, zone) else memories(state, actions)
                }
            }
        }
    }
    state.confirmingForget?.let { memory ->
        val forgetting = state.pending is AgentCommand.Forget
        AgentConfirmation(title = stringResource(R.string.agent_forget_title), tag = "agent-forget-dialog",
            confirm = stringResource(if (forgetting) R.string.agent_try_again else R.string.agent_forget),
            dismiss = stringResource(if (forgetting) R.string.agent_check_again else R.string.agent_keep),
            onConfirm = if (forgetting) actions.retry else actions.forget, onDismiss = if (forgetting) actions.discard else actions.keep,
            enabled = state.running == null, danger = true) {
            Text(stringResource(R.string.agent_forget_text, memory.label, memory.content), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(R.string.agent_forget_warning), style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
            if (state.at == AGENT_AT_MEMORIES) AgentMessages(state, "agent-forget")
        }
    }
    if (leaving) AgentConfirmation(title = stringResource(R.string.agent_leave_title), tag = "agent-leave-dialog",
        confirm = stringResource(R.string.agent_leave), dismiss = stringResource(R.string.agent_stay),
        onConfirm = { leaving = false; actions.back() }, onDismiss = { leaving = false }) {
        Text(stringResource(R.string.agent_leave_text), style = MaterialTheme.typography.bodyMedium)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AgentViews(state: AgentState, actions: AgentActions) {
    val enabled = !state.busy && !state.uncertain && !state.requiresSignIn
    FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        FilterChip(selected = state.view == AgentView.REQUESTS, onClick = { actions.show(AgentView.REQUESTS) }, enabled = enabled,
            label = { Text(stringResource(R.string.agent_requests)) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-show-requests"))
        FilterChip(selected = state.view == AgentView.MEMORIES, onClick = { actions.show(AgentView.MEMORIES) }, enabled = enabled,
            label = { Text(stringResource(R.string.agent_memories)) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-show-memories"))
    }
}

private fun LazyListScope.requests(state: AgentState, actions: AgentActions, zone: ZoneId) {
    if (!state.spacesLoaded) {
        item("spaces-messages") {
            Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                if (state.at == AGENT_AT_COMPOSER) AgentMessages(state, "agent-spaces")
                if (!state.loading) TextButton(onClick = actions.reloadSpaces, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-reload-spaces")) {
                    Text(stringResource(R.string.agent_reload_spaces))
                }
            }
        }
        return
    }
    item("composer") { AgentComposer(state, actions) }
    item("history") { Text(stringResource(R.string.agent_history), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = DesignTokens.SpaceUnit * 2).semantics { heading() }) }
    if (state.runsLoaded && state.runs.isEmpty()) item("empty") { Text(stringResource(R.string.agent_empty), color = DesignTokens.Muted, modifier = Modifier.testTag("agent-empty")) }
    items(state.runs, key = { it.id }) { run -> AgentRunCard(run, state, actions, zone) }
    if (state.nextCursor != null) item("more") {
        OutlinedButton(onClick = actions.more, enabled = !state.busy && !state.uncertain, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("agent-more")) { Text(stringResource(R.string.agent_earlier)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AgentComposer(state: AgentState, actions: AgentActions) {
    var choosingSpace by remember { mutableStateOf(false) }
    val asking = state.pending as? AgentCommand.Ask
    val width = LocalConfiguration.current.screenWidthDp.dp - DesignTokens.SpaceUnit * 8
    Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(stringResource(R.string.agent_space), style = MaterialTheme.typography.labelLarge)
        Box(Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { choosingSpace = true }, enabled = !state.busy && !state.uncertain && !state.requiresSignIn,
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("agent-space")) {
                Text(if (state.spaceId == null) stringResource(R.string.agent_main) else state.space?.name.orEmpty(), Modifier.weight(1f))
                Icon(Icons.Default.ArrowDropDown, null)
            }
            DropdownMenu(expanded = choosingSpace, onDismissRequest = { choosingSpace = false }, modifier = Modifier.widthIn(max = width)) {
                DropdownMenuItem(text = { Text(stringResource(R.string.agent_main)) }, onClick = { choosingSpace = false; actions.chooseSpace(null) },
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-choose-main"))
                state.spaces.forEach { space -> DropdownMenuItem(text = { Text(space.name) }, onClick = { choosingSpace = false; actions.chooseSpace(space.id) },
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) }
            }
        }
        if (state.spaceId == null) Text(stringResource(R.string.agent_main_hint), style = MaterialTheme.typography.bodySmall,
            color = DesignTokens.Muted, modifier = Modifier.testTag("agent-main-hint"))
        if (state.space?.agentEnabled == false && asking == null) {
            Text(stringResource(R.string.agent_off_in_space), style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("agent-off"))
            if (state.at == AGENT_AT_COMPOSER) AgentMessages(state, "agent-composer")
        } else {
            OutlinedTextField(value = asking?.message ?: state.message, onValueChange = actions.message,
                enabled = !state.busy && asking == null && !state.requiresSignIn,
                label = { Text(stringResource(R.string.agent_message)) }, supportingText = { Text(stringResource(R.string.agent_message_hint)) },
                isError = state.problem != null, minLines = 2, maxLines = 5, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.fillMaxWidth().testTag("agent-message"))
            if (state.at == AGENT_AT_COMPOSER) AgentMessages(state, "agent-composer")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                Button(onClick = if (asking != null) actions.retry else actions.ask, enabled = !state.busy && (state.pending == null || asking != null),
                    shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-ask")) {
                    Icon(Icons.AutoMirrored.Filled.Send, null, Modifier.size(DesignTokens.SpaceUnit * 5))
                    Text(stringResource(if (asking != null) R.string.agent_send_again else R.string.agent_ask), Modifier.padding(start = DesignTokens.SpaceUnit * 2))
                }
                if (asking != null) TextButton(onClick = actions.discard, enabled = !state.busy,
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-edit")) { Text(stringResource(R.string.agent_edit_request)) }
            }
        }
    }
}

@Composable
private fun planKindLabel(kind: AgentPlanKind): String = stringResource(when (kind) {
    AgentPlanKind.CHECK -> R.string.agent_plan_kind_check
    AgentPlanKind.TOOL -> R.string.agent_plan_kind_tool
    AgentPlanKind.APPROVAL -> R.string.agent_plan_kind_approval
    AgentPlanKind.RESPONSE -> R.string.agent_plan_kind_response
})

@Composable
private fun planStatusLabel(status: AgentPlanStatus): String = stringResource(when (status) {
    AgentPlanStatus.PENDING -> R.string.agent_plan_status_pending
    AgentPlanStatus.DONE -> R.string.agent_plan_status_done
    AgentPlanStatus.SKIPPED -> R.string.agent_plan_status_skipped
    AgentPlanStatus.FAILED -> R.string.agent_tool_status_failed
})

@Composable
private fun evidenceKindLabel(kind: AgentEvidenceKind): String = stringResource(when (kind) {
    AgentEvidenceKind.TASK -> R.string.agent_evidence_task
    AgentEvidenceKind.REMINDER -> R.string.agent_evidence_reminder
    AgentEvidenceKind.MEMORY -> R.string.agent_evidence_memory
    AgentEvidenceKind.ROSTER -> R.string.agent_evidence_roster
    AgentEvidenceKind.POLICY -> R.string.agent_evidence_policy
    AgentEvidenceKind.EVENT -> R.string.agent_evidence_event
    AgentEvidenceKind.DOCUMENT -> R.string.agent_evidence_document
    AgentEvidenceKind.PAGE -> R.string.agent_evidence_page
    AgentEvidenceKind.POST -> R.string.agent_evidence_post
    AgentEvidenceKind.COMMENT -> R.string.agent_evidence_comment
    AgentEvidenceKind.REPORT -> R.string.agent_evidence_report
    AgentEvidenceKind.MESSAGE -> R.string.agent_evidence_message
    AgentEvidenceKind.SPACE -> R.string.agent_evidence_space
    AgentEvidenceKind.INTERESTS -> R.string.agent_evidence_interests
})

@Composable
private fun toolStatusLabel(status: AgentToolStatus): String = stringResource(when (status) {
    AgentToolStatus.SUCCEEDED -> R.string.agent_tool_status_succeeded
    AgentToolStatus.FAILED -> R.string.agent_tool_status_failed
})

@Composable
private fun AgentRecordSection(title: String, tag: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().testTag(tag), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        content()
    }
}

@Composable
internal fun AgentExecutionRecords(run: AgentRunDto, zone: ZoneId) {
    var expanded by remember(run.id) { mutableStateOf(false) }
    val stateLabel = stringResource(if (expanded) R.string.agent_details_expanded else R.string.agent_details_collapsed)
    Column(Modifier.fillMaxWidth()) {
        TextButton(onClick = { expanded = !expanded },
            modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                .semantics { stateDescription = stateLabel }.testTag("agent-records-toggle-${run.id}")) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(if (expanded) R.string.agent_hide_request_details else R.string.agent_request_details),
                    Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
                Icon(Icons.Default.ArrowDropDown, null)
            }
        }
        if (expanded) {
            Column(Modifier.fillMaxWidth().padding(start = DesignTokens.SpaceUnit * 2),
                verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                HorizontalDivider(color = DesignTokens.Border)
                AgentRecordSection(stringResource(R.string.agent_records_plan), "agent-records-plan-${run.id}") {
                    if (run.plan.isEmpty()) Text(stringResource(R.string.agent_records_empty_plan), color = DesignTokens.Muted)
                    run.plan.forEachIndexed { index, step ->
                        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag("agent-plan-step-${run.id}-$index"),
                            verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                            Text(step.label, style = MaterialTheme.typography.bodyMedium)
                            Text(stringResource(R.string.agent_record_plan_meta, planKindLabel(step.kind), planStatusLabel(step.status)),
                                style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
                            step.tool?.let { Text(stringResource(R.string.agent_record_tool, it), style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
                AgentRecordSection(stringResource(R.string.agent_records_sources), "agent-records-sources-${run.id}") {
                    if (run.evidence.isEmpty()) Text(stringResource(R.string.agent_records_empty_sources), color = DesignTokens.Muted)
                    run.evidence.forEachIndexed { index, source ->
                        Text(stringResource(R.string.agent_record_source, evidenceKindLabel(source.kind), source.label),
                            style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth().testTag("agent-source-${run.id}-$index"))
                    }
                }
                AgentRecordSection(stringResource(R.string.agent_records_actions), "agent-records-actions-${run.id}") {
                    if (run.toolCalls.isEmpty()) Text(stringResource(R.string.agent_records_empty_actions), color = DesignTokens.Muted)
                    run.toolCalls.forEachIndexed { index, call ->
                        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag("agent-action-${run.id}-$index"),
                            verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                            Text(stringResource(R.string.agent_record_tool_version, call.toolName, call.toolVersion),
                                style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            Text(stringResource(R.string.agent_record_action_meta,
                                stringResource(if (call.effect == AgentToolEffect.READ) R.string.agent_tool_effect_read else R.string.agent_tool_effect_write),
                                stringResource(if (call.risk == AgentToolRisk.LOW) R.string.agent_tool_risk_low else R.string.agent_tool_risk_medium),
                                toolStatusLabel(call.status)), style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
                            Text(call.summary, style = MaterialTheme.typography.bodyMedium)
                            Text(stringResource(R.string.agent_record_time, moment(call.createdAt, zone)), style = MaterialTheme.typography.bodySmall,
                                color = DesignTokens.Muted, modifier = Modifier.testTag("agent-record-time-${run.id}-$index"))
                        }
                    }
                }
                AgentRecordSection(stringResource(R.string.agent_records_activity), "agent-records-activity-${run.id}") {
                    Text(stringResource(R.string.agent_record_updated, moment(run.updatedAt, zone)), style = MaterialTheme.typography.bodySmall,
                        color = DesignTokens.Muted, modifier = Modifier.testTag("agent-run-updated-${run.id}"))
                    run.finishedAt?.let { Text(stringResource(R.string.agent_record_finished, moment(it, zone)), style = MaterialTheme.typography.bodySmall,
                        color = DesignTokens.Muted, modifier = Modifier.testTag("agent-run-finished-${run.id}")) }
                    if (run.events.isEmpty()) Text(stringResource(R.string.agent_records_empty_activity), color = DesignTokens.Muted)
                    run.events.forEachIndexed { index, event ->
                        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag("agent-event-${run.id}-$index"),
                            verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                            Text(event.eventType.replace('_', ' ').replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelLarge)
                            Text(event.summary, style = MaterialTheme.typography.bodyMedium)
                            Text(stringResource(R.string.agent_record_time, moment(event.createdAt, zone)), style = MaterialTheme.typography.bodySmall,
                                color = DesignTokens.Muted)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AgentRunCard(run: AgentRunDto, state: AgentState, actions: AgentActions, zone: ZoneId) {
    val pending = state.pending?.takeIf { it.runId == run.id }
    val free = !state.busy && (state.pending == null || pending != null)
    Surface(shape = RoundedCornerShape(DesignTokens.DialogRadius), color = DesignTokens.Surface, border = BorderStroke(1.dp, DesignTokens.Border),
        modifier = Modifier.fillMaxWidth().testTag("agent-run-${run.id}")) {
        Column(Modifier.padding(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Text(run.message, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(moment(run.createdAt, zone), style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
            Text(statusLabel(run), style = MaterialTheme.typography.labelLarge, color = DesignTokens.Primary, modifier = Modifier.testTag("agent-status-${run.id}"))
            run.answer?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("agent-answer-text-${run.id}")) }
            run.handoffs?.forEach { handoff ->
                OutlinedButton(onClick = { actions.openSpaceChat(handoff.spaceId) }, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("agent-handoff-${handoff.spaceId}")) {
                    Text(stringResource(R.string.agent_open_space_chat, handoff.name))
                }
            }
            run.question?.let { question ->
                HorizontalDivider(color = DesignTokens.Border)
                Text(question.text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("agent-question-${run.id}"))
                val answering = pending as? AgentCommand.Answer
                val reply = answering?.answer ?: state.replies[run.id].orEmpty()
                OutlinedTextField(value = reply, onValueChange = { actions.reply(run.id, it) }, enabled = free && pending == null,
                    label = { Text(stringResource(R.string.agent_answer_label)) }, maxLines = 3, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.fillMaxWidth().testTag("agent-reply-${run.id}"))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                    Button(onClick = if (answering != null) actions.retry else { { actions.answer(run.id) } },
                        enabled = free && (answering != null || pending == null && agentMessageProblem(normalizedAgentMessage(reply)) == null),
                        shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-answer-${run.id}")) {
                        Text(stringResource(if (answering != null) R.string.agent_try_again else R.string.agent_answer))
                    }
                    TextButton(onClick = if (pending is AgentCommand.Stop) actions.retry else { { actions.stop(run.id) } },
                        enabled = free && (pending == null || pending is AgentCommand.Stop),
                        modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-stop-${run.id}")) {
                        Text(stringResource(if (pending is AgentCommand.Stop) R.string.agent_try_again else R.string.agent_stop))
                    }
                }
            }
            run.approval?.let { approval ->
                HorizontalDivider(color = DesignTokens.Border)
                Text(if (run.awaitingApproval) stringResource(R.string.agent_check) else approval.summary, style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.semantics { heading() }.testTag("agent-check-${run.id}"))
                approval.fields.forEachIndexed { index, field ->
                    // Read each label together with its value.
                    Column(Modifier.semantics(mergeDescendants = true) {}.testTag("agent-field-${run.id}-$index")) {
                        Text(field.label, style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
                        Text(field.value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    }
                }
                if (run.awaitingApproval) {
                    Text(stringResource(R.string.agent_waiting, moment(approval.expiresAt, zone)), style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
                    val deciding = pending as? AgentCommand.Decide
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                        Button(onClick = if (deciding?.approve == true) actions.retry else { { actions.decide(run.id, true) } },
                            enabled = free && (pending == null || deciding?.approve == true), shape = RoundedCornerShape(DesignTokens.ControlRadius),
                            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-approve-${run.id}")) {
                            Icon(Icons.Default.Check, null, Modifier.size(DesignTokens.SpaceUnit * 5))
                            Text(stringResource(if (deciding?.approve == true) R.string.agent_approve_again else R.string.agent_approve), Modifier.padding(start = DesignTokens.SpaceUnit * 2))
                        }
                        OutlinedButton(onClick = if (deciding?.approve == false) actions.retry else { { actions.decide(run.id, false) } },
                            enabled = free && (pending == null || deciding?.approve == false), shape = RoundedCornerShape(DesignTokens.ControlRadius),
                            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-reject-${run.id}")) {
                            Icon(Icons.Default.Close, null, Modifier.size(DesignTokens.SpaceUnit * 5))
                            Text(stringResource(if (deciding?.approve == false) R.string.agent_try_again else R.string.agent_reject), Modifier.padding(start = DesignTokens.SpaceUnit * 2))
                        }
                    }
                }
            }
            AgentExecutionRecords(run, zone)
            if (state.at == run.id) AgentMessages(state, "agent-run-${run.id}")
            if (pending != null) TextButton(onClick = actions.discard, enabled = !state.busy,
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-discard-${run.id}")) { Text(stringResource(R.string.agent_check_again)) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
private fun LazyListScope.memories(state: AgentState, actions: AgentActions) {
    item("memories-title") { Text(stringResource(R.string.agent_memories_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    item("memories-hint") { Text(stringResource(R.string.agent_memories_hint), style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted) }
    if (state.at == AGENT_AT_MEMORIES && state.confirmingForget == null) item("memories-messages") {
        Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            AgentMessages(state, "agent-memories")
            if (!state.memoriesLoaded && !state.loading) TextButton(onClick = actions.reloadMemories,
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-reload-memories")) { Text(stringResource(R.string.agent_try_again)) }
        }
    }
    if (state.memoriesLoaded && state.memories.isEmpty()) item("memories-empty") {
        Text(stringResource(R.string.agent_memories_empty), color = DesignTokens.Muted, modifier = Modifier.testTag("agent-memories-empty"))
    }
    items(state.memories, key = { it.id }) { memory ->
        val description = stringResource(R.string.agent_memory_delete_label, memory.content)
        Column(Modifier.fillMaxWidth().testTag("agent-memory-${memory.id}")) {
            HorizontalDivider(color = DesignTokens.Border)
            FlowRow(Modifier.fillMaxWidth().padding(vertical = DesignTokens.SpaceUnit * 2), horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                Column(Modifier.align(Alignment.CenterVertically)) {
                    Text(memory.label, style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
                    Text(memory.content, style = MaterialTheme.typography.bodyMedium)
                }
                TextButton(onClick = { actions.askForget(memory) }, enabled = !state.busy && !state.uncertain,
                    modifier = Modifier.align(Alignment.CenterVertically).heightIn(min = DesignTokens.MinimumTarget)
                        .semantics { contentDescription = description }.testTag("agent-forget-${memory.id}")) {
                    Icon(Icons.Default.Delete, null, Modifier.size(DesignTokens.SpaceUnit * 5))
                    Text(stringResource(R.string.agent_memory_delete), Modifier.padding(start = DesignTokens.SpaceUnit * 2))
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AgentConfirmation(title: String, tag: String, confirm: String, dismiss: String, onConfirm: () -> Unit, onDismiss: () -> Unit,
    enabled: Boolean = true, danger: Boolean = false, body: @Composable () -> Unit) {
    val height = LocalConfiguration.current.screenHeightDp.dp - DesignTokens.SpaceUnit * 8
    Dialog(onDismissRequest = { if (enabled) onDismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.padding(DesignTokens.SpaceUnit * 4).widthIn(max = DesignTokens.SpaceUnit * 140).fillMaxWidth().heightIn(max = height).testTag(tag),
            shape = RoundedCornerShape(DesignTokens.DialogRadius), color = DesignTokens.Surface) {
            Column(Modifier.padding(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                    body()
                }
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2, Alignment.End),
                    verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                    TextButton(onClick = onDismiss, enabled = enabled, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("$tag-cancel")) { Text(dismiss) }
                    Button(onClick = onConfirm, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                        colors = if (danger) ButtonDefaults.buttonColors(containerColor = DesignTokens.Danger, contentColor = DesignTokens.Surface) else ButtonDefaults.buttonColors(),
                        modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("$tag-confirm")) { Text(confirm) }
                }
            }
        }
    }
}
