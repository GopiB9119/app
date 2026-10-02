package com.community.platform.feature.community

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class ModerationActions(
    val open: () -> Unit = {},
    val back: () -> Unit = {},
    val refresh: () -> Unit = {},
    val tab: (ModerationTab) -> Unit = {},
    val more: () -> Unit = {},
    val reloadQueue: () -> Unit = {},
    val reloadAppeals: () -> Unit = {},
    val reloadSafety: () -> Unit = {},
    val editDecision: (ModerationQueueDto, String?, String, String) -> Unit = { _, _, _, _ -> },
    val decide: (ModerationQueueDto) -> Unit = {},
    val editResolution: (String, String) -> Unit = { _, _ -> },
    val resolve: (ModerationAppealReviewDto, String) -> Unit = { _, _ -> },
    val selectAppeal: (ModerationNoticeDto?) -> Unit = {},
    val editAppeal: (String, String) -> Unit = { _, _ -> },
    val sendAppeal: (ModerationNoticeDto) -> Unit = {},
)

internal fun moderationActions(model: ModerationViewModel) = ModerationActions(
    model::openModeration, model::closeModeration, model::refresh, model::selectTab,
    { model.loadQueue(more = true) }, { model.loadQueue() }, model::loadAppeals, model::loadSafety,
    model::editDecision, model::recordDecision, model::editResolution, model::resolveAppeal,
    model::selectAppeal, model::editAppeal, model::sendAppeal,
)

@Composable
internal fun rememberModerationTime(timezone: String): DateTimeFormatter {
    val locale = LocalConfiguration.current.locales[0]
    return remember(timezone, locale) {
        val zone = try { ZoneId.of(timezone) } catch (_error: RuntimeException) { ZoneId.systemDefault() }
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale).withZone(zone)
    }
}

private fun DateTimeFormatter.showModerationTime(value: String): String = try { format(Instant.parse(value)) } catch (_error: RuntimeException) { "" }

@Composable
fun ModerationScreen(state: ModerationState, actions: ModerationActions, timezone: String) {
    val time = rememberModerationTime(timezone)
    BackHandler { if (!state.working) actions.back() }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(DesignTokens.SpaceUnit * 2), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = actions.back, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.community_back))
                }
                Text(stringResource(R.string.moderation_title), style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = actions.refresh, enabled = !state.busy, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) {
                    Icon(Icons.Default.Refresh, stringResource(R.string.community_refresh))
                }
            }
            HorizontalDivider()
            when {
                state.accessLoading || state.moderator == null && state.accessError == null ->
                    Text(stringResource(R.string.moderation_loading), Modifier.padding(DesignTokens.SpaceUnit * 4))
                state.accessError != null -> Column(Modifier.padding(DesignTokens.SpaceUnit * 4)) { ModerationFailure(state.accessError, !state.busy, actions.refresh) }
                state.moderator != true -> Text(stringResource(R.string.moderation_only), Modifier.padding(DesignTokens.SpaceUnit * 4).testTag("moderation-denied"))
                else -> {
                    TabRow(selectedTabIndex = state.tab.ordinal) {
                        ModerationTab.entries.forEach { tab ->
                            Tab(selected = state.tab == tab, onClick = { actions.tab(tab) }, enabled = !state.working,
                                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-tab-${tab.name.lowercase()}"),
                                text = { Text(stringResource(if (tab == ModerationTab.REPORTS) R.string.moderation_reports else R.string.moderation_appeals)) })
                        }
                    }
                    if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    LazyColumn(Modifier.fillMaxWidth().weight(1f).testTag("moderation-content"),
                        contentPadding = PaddingValues(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 4)) {
                        state.message?.let { message -> item("message") { ModerationSuccess(message) } }
                        if (state.tab == ModerationTab.REPORTS) {
                            if (state.queue.loading) item("loading") { Text(stringResource(R.string.moderation_loading_reports)) }
                            state.queue.error?.let { error -> item("error") { ModerationFailure(error, !state.busy, actions.reloadQueue) } }
                            if (state.queue.loaded && !state.queue.loading && state.queue.error == null && state.queue.items.isEmpty())
                                item("empty") { Text(stringResource(R.string.moderation_reports_empty)) }
                            items(state.queue.items, key = ModerationQueueDto::key) { item -> QueueItem(item, state, actions, time) }
                            if (state.nextCursor != null) item("more") {
                                OutlinedButton(onClick = actions.more, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-more")) { Text(stringResource(R.string.community_more)) }
                            }
                        } else {
                            if (state.appeals.loading) item("loading") { Text(stringResource(R.string.moderation_loading_appeals)) }
                            state.appeals.error?.let { error -> item("error") { ModerationFailure(error, !state.busy, actions.reloadAppeals) } }
                            if (state.appeals.loaded && !state.appeals.loading && state.appeals.error == null && state.appeals.items.isEmpty())
                                item("empty") { Text(stringResource(R.string.moderation_appeals_empty)) }
                            items(state.appeals.items, key = { it.appeal.id }) { item -> AppealReviewItem(item, state, actions, time) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Preview(preview: ModerationPreviewDto, pageName: String?, targetType: String) {
    Text(if (pageName == null) moderationTargetLabel(targetType) else stringResource(R.string.moderation_summary, moderationTargetLabel(targetType), pageName), style = MaterialTheme.typography.labelLarge)
    (preview.name ?: preview.title)?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
    preview.handle?.let { Text("@$it", style = MaterialTheme.typography.bodySmall) }
    val excerpt = preview.body ?: preview.description.orEmpty()
    if (excerpt.isNotEmpty()) Text(excerpt.takeCodePoints(240) + if (excerpt.codePointLength() > 240) "..." else "")
    if (preview.status == "unavailable") Text(stringResource(R.string.moderation_content_unavailable))
}

@Composable
private fun QueueItem(item: ModerationQueueDto, state: ModerationState, actions: ModerationActions, time: DateTimeFormatter) {
    val draft = state.draft(item)
    Column(Modifier.fillMaxWidth().testTag("moderation-item-${item.key}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Preview(item.preview, item.pageName, item.targetType)
        Text(pluralStringResource(R.plurals.moderation_report_count, item.reportCount, item.reportCount))
        item.reasons.forEach { entry -> Text(stringResource(R.string.moderation_reason_count, moderationReasonLabel(entry.reason), entry.count)) }
        Text(stringResource(R.string.moderation_first_reported, time.showModerationTime(item.firstReportedAt)), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.moderation_decision), style = MaterialTheme.typography.titleSmall)
        Column(Modifier.selectableGroup()) {
            listOf("hide" to R.string.moderation_hide, "no_action" to R.string.moderation_no_action).forEach { (action, label) ->
                Row(Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                    .selectable(selected = draft.action == action, enabled = !state.working, role = Role.RadioButton) { actions.editDecision(item, action, draft.reason, draft.note) }
                    .testTag("moderation-${item.targetId}-$action"), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = draft.action == action, onClick = null, enabled = !state.working)
                    Text(stringResource(label), Modifier.weight(1f).padding(start = DesignTokens.SpaceUnit * 2))
                }
            }
        }
        ReasonPicker(draft.reason, !state.working) { actions.editDecision(item, draft.action, it, draft.note) }
        NoteInput(draft.note, !state.working, false, "moderation-note-${item.targetId}") { actions.editDecision(item, draft.action, draft.reason, it) }
        draft.error?.let { ModerationFailure(it) }
        Button(onClick = { actions.decide(item) }, enabled = !state.busy && draft.action != null && draft.note.codePointLength() <= 1000,
            shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-record-${item.targetId}")) {
            Icon(Icons.Default.Check, null)
            Text(stringResource(R.string.moderation_record), Modifier.weight(1f, fill = false).padding(start = DesignTokens.SpaceUnit * 2))
        }
        HorizontalDivider()
    }
}

@Composable
private fun ReasonPicker(reason: String, enabled: Boolean, onChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Text(stringResource(R.string.moderation_reason), style = MaterialTheme.typography.labelLarge)
    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-reason")) {
            Text(moderationReasonLabel(reason), Modifier.weight(1f))
            Icon(Icons.Default.ArrowDropDown, null)
        }
        DropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
            REPORT_REASONS.forEach { value ->
                DropdownMenuItem(text = { Text(moderationReasonLabel(value)) }, onClick = { expanded = false; onChange(value) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget))
            }
        }
    }
}

@Composable
private fun NoteInput(note: String, enabled: Boolean, required: Boolean, tag: String, onChange: (String) -> Unit) {
    val invalid = note.codePointLength() > 1000 || required && note.isNotEmpty() && note.isBlank()
    OutlinedTextField(value = note, onValueChange = { onChange(it.takeCodePoints(1000)) }, enabled = enabled,
        label = { Text(stringResource(if (required) R.string.moderation_note else R.string.moderation_note_optional)) },
        supportingText = {
            Column {
                Text(stringResource(R.string.moderation_note_count, note.codePointLength()))
                if (invalid) Text(stringResource(R.string.moderation_note_required))
            }
        }, isError = invalid, minLines = 2, maxLines = 5, modifier = Modifier.fillMaxWidth().testTag(tag))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AppealReviewItem(item: ModerationAppealReviewDto, state: ModerationState, actions: ModerationActions, time: DateTimeFormatter) {
    val draft = state.resolutions[item.appeal.id] ?: ModerationResolutionDraft()
    Column(Modifier.fillMaxWidth().testTag("moderation-appeal-${item.appeal.id}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Preview(item.preview, item.pageName, item.decision.targetType)
        Text(stringResource(R.string.moderation_summary, moderationActionLabel(item.decision.action), moderationReasonLabel(item.decision.reason)))
        Text(time.showModerationTime(item.decision.decidedAt), style = MaterialTheme.typography.bodySmall)
        Text(item.appeal.note)
        NoteInput(draft.note, !state.working && draft.outcome == null, false, "moderation-resolution-note-${item.appeal.id}") { actions.editResolution(item.appeal.id, it) }
        draft.error?.let { ModerationFailure(it) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            OutlinedButton(onClick = { actions.resolve(item, "upheld") }, enabled = !state.busy && draft.note.codePointLength() <= 1000 && (draft.outcome == null || draft.outcome == "upheld"),
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-uphold-${item.appeal.id}")) {
                Icon(Icons.Default.Check, null)
                Text(stringResource(R.string.moderation_keep), Modifier.weight(1f, fill = false).padding(start = DesignTokens.SpaceUnit * 2))
            }
            Button(onClick = { actions.resolve(item, "overturned") }, enabled = !state.busy && draft.note.codePointLength() <= 1000 && (draft.outcome == null || draft.outcome == "overturned"),
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-restore-${item.appeal.id}")) {
                Icon(Icons.Default.Refresh, null)
                Text(stringResource(R.string.moderation_restore), Modifier.weight(1f, fill = false).padding(start = DesignTokens.SpaceUnit * 2))
            }
        }
        HorizontalDivider()
    }
}

internal fun LazyListScope.moderationHistory(state: ModerationState, actions: ModerationActions, time: DateTimeFormatter) {
    if (state.moderator == true) item("moderation-entry") {
        TextButton(onClick = actions.open, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-open")) { Text(stringResource(R.string.moderation_queue)) }
    }
    state.accessError?.let { error -> item("moderation-access-error") { ModerationFailure(error, !state.busy, actions.reloadSafety) } }
    state.message?.let { message -> item("moderation-message") { ModerationSuccess(message) } }
    item("moderation-notices-title") { Text(stringResource(R.string.moderation_notices_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    if (state.notices.loading) item("moderation-notices-loading") { Text(stringResource(R.string.moderation_loading_notices)) }
    state.notices.error?.let { error -> item("moderation-notices-error") { ModerationFailure(error, !state.busy, actions.reloadSafety) } }
    if (state.notices.loaded && !state.notices.loading && state.notices.error == null && state.notices.items.isEmpty())
        item("moderation-notices-empty") { Text(stringResource(R.string.moderation_notices_empty)) }
    items(state.notices.items, key = { "moderation-notice-${it.id}" }) { notice ->
        Column(Modifier.fillMaxWidth().testTag("moderation-notice-${notice.id}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Text(stringResource(R.string.moderation_summary, moderationTargetLabel(notice.targetType), moderationActionLabel(notice.action)), style = MaterialTheme.typography.titleSmall)
            Text(moderationReasonLabel(notice.reason))
            Text(time.showModerationTime(notice.decidedAt), style = MaterialTheme.typography.bodySmall)
            val appealLabel = when (notice.appealStatus) {
                "open" -> R.string.moderation_appeal_waiting
                "upheld" -> R.string.moderation_appeal_kept
                "overturned" -> R.string.moderation_appeal_restored
                else -> if (notice.action == "restore" && notice.appealOf != null) R.string.moderation_appeal_restored else null
            }
            appealLabel?.let { Text(stringResource(it)) }
            if (notice.canAppeal) OutlinedButton(onClick = { actions.selectAppeal(notice) }, enabled = !state.busy,
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-appeal-open-${notice.id}")) {
                Text(stringResource(R.string.moderation_appeal))
            }
            HorizontalDivider()
        }
    }
    item("moderation-reports-title") { Text(stringResource(R.string.moderation_your_reports), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    if (state.reports.loading) item("moderation-reports-loading") { Text(stringResource(R.string.moderation_loading_your_reports)) }
    state.reports.error?.let { error -> item("moderation-reports-error") { ModerationFailure(error, !state.busy, actions.reloadSafety) } }
    if (state.reports.loaded && !state.reports.loading && state.reports.error == null && state.reports.items.isEmpty())
        item("moderation-reports-empty") { Text(stringResource(R.string.moderation_your_reports_empty)) }
    items(state.reports.items, key = { "moderation-report-${it.id}" }) { report ->
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Text(stringResource(R.string.moderation_summary, moderationTargetLabel(report.targetType), moderationReasonLabel(report.reason)), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(when (report.reviewState) {
                ReportReviewState.WAITING -> R.string.moderation_report_waiting
                ReportReviewState.ACTION_TAKEN -> R.string.moderation_report_action
                ReportReviewState.NO_ACTION -> R.string.moderation_report_no_action
            }))
            HorizontalDivider()
        }
    }
}

@Composable
internal fun ModerationAppealDialog(state: ModerationState, actions: ModerationActions) {
    val notice = state.notices.items.firstOrNull { it.id == state.selectedNoticeId && it.canAppeal } ?: return
    val draft = state.appealDrafts[notice.id] ?: ModerationAppealDraft()
    AlertDialog(onDismissRequest = { if (!state.working) actions.selectAppeal(null) }, shape = RoundedCornerShape(DesignTokens.DialogRadius),
        modifier = Modifier.testTag("moderation-appeal-dialog"), title = { Text(stringResource(R.string.moderation_appeal_title)) },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                Text(stringResource(R.string.moderation_summary, moderationTargetLabel(notice.targetType), moderationReasonLabel(notice.reason)))
                NoteInput(draft.note, !state.working, true, "moderation-appeal-note") { actions.editAppeal(notice.id, it) }
                draft.error?.let { ModerationFailure(it) }
            }
        }, confirmButton = {
            TextButton(onClick = { actions.sendAppeal(notice) }, enabled = !state.busy && draft.note.isNotBlank() && draft.note.codePointLength() <= 1000,
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-appeal-send")) {
                Icon(Icons.AutoMirrored.Filled.Send, null)
                Text(stringResource(R.string.moderation_send_appeal), Modifier.weight(1f, fill = false).padding(start = DesignTokens.SpaceUnit * 2))
            }
        }, dismissButton = {
            TextButton(onClick = { actions.selectAppeal(null) }, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderation-appeal-cancel")) {
                Icon(Icons.Default.Close, null)
                Text(stringResource(R.string.community_cancel), Modifier.weight(1f, fill = false).padding(start = DesignTokens.SpaceUnit * 2))
            }
        })
}

@Composable
internal fun ModerationMark(mark: ModerationMarkDto?) {
    if (mark != null) Text(stringResource(R.string.moderation_hidden_mark, moderationReasonLabel(mark.reason)),
        color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("moderation-hidden-mark"))
}

@Composable
private fun ModerationSuccess(message: ModerationMessage) {
    Text(stringResource(when (message) {
        ModerationMessage.DECISION_RECORDED -> R.string.moderation_decision_recorded
        ModerationMessage.APPEAL_RESOLVED -> R.string.moderation_appeal_resolved
        ModerationMessage.APPEAL_SENT -> R.string.moderation_appeal_sent
    }), color = MaterialTheme.colorScheme.primary, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("moderation-success"))
}

@Composable
private fun ModerationFailure(problem: ModerationProblem, enabled: Boolean = true, retry: (() -> Unit)? = null) {
    val label = when (problem.code) {
        "OFFLINE" -> R.string.moderation_offline
        "INVALID_RESPONSE" -> R.string.moderation_unconfirmed
        "CONFLICT_OF_INTEREST" -> if (problem.message == "Another moderator must review this appeal.") R.string.moderation_conflict_appeal else R.string.moderation_conflict_content
        "CONTENT_UNAVAILABLE", "NOT_FOUND" -> R.string.moderation_content_unavailable
        "CONTENT_ALREADY_HIDDEN" -> R.string.moderation_already_hidden
        "CONTENT_AUTHOR_REQUIRED" -> R.string.moderation_author_required
        "APPEAL_UNAVAILABLE" -> R.string.moderation_appeal_unavailable
        "APPEAL_ALREADY_EXISTS" -> R.string.moderation_appeal_exists
        "APPEAL_ALREADY_RESOLVED" -> R.string.moderation_appeal_already_resolved
        "IDEMPOTENCY_CONFLICT" -> R.string.moderation_key_conflict
        "CURSOR_INVALID", "CURSOR_EXPIRED" -> R.string.moderation_reload_queue
        "MODERATOR_REQUIRED" -> R.string.moderation_only
        else -> null
    }
    Text(if (label != null) stringResource(label) else problem.message ?: stringResource(R.string.moderation_failed), color = MaterialTheme.colorScheme.error,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }.testTag("moderation-error"))
    if (retry != null) OutlinedButton(onClick = retry, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius),
        modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) { Text(stringResource(R.string.community_retry)) }
}

@Composable
private fun moderationTargetLabel(target: String): String = stringResource(when (target) {
    "page" -> R.string.community_page
    "post" -> R.string.community_post
    else -> R.string.moderation_comment
})

@Composable
private fun moderationActionLabel(action: String): String = stringResource(when (action) {
    "hide" -> R.string.moderation_hidden
    "restore" -> R.string.moderation_restored
    else -> R.string.moderation_no_action
})

@Composable
private fun moderationReasonLabel(reason: String): String = stringResource(when (reason) {
    "spam" -> R.string.moderation_reason_spam
    "harassment" -> R.string.moderation_reason_harassment
    "hate" -> R.string.moderation_reason_hate
    "violence" -> R.string.moderation_reason_violence
    "sexual" -> R.string.moderation_reason_sexual
    "misinformation" -> R.string.moderation_reason_misinformation
    "self_harm" -> R.string.moderation_reason_self_harm
    "privacy" -> R.string.moderation_reason_privacy
    else -> R.string.moderation_reason_other
})