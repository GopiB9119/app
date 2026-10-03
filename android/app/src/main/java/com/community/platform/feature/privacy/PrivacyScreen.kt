package com.community.platform.feature.privacy

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import com.community.platform.feature.identity.formatAccountDataTimestamp
import com.community.platform.feature.identity.securityEventLabel

data class PrivacyActions(
    val refresh: () -> Unit = {},
    val ask: (TakeBack) -> Unit = {},
    val keep: () -> Unit = {},
    val confirm: () -> Unit = {},
)

@Composable
fun PrivacyRoute(viewModel: PrivacyViewModel, timezone: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    PrivacyScreen(state, PrivacyActions(viewModel::refresh, viewModel::ask, viewModel::keep, viewModel::confirm), timezone, onBack)
}

@Composable
fun PrivacyScreen(state: PrivacyState, actions: PrivacyActions, timezone: String, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    fun display(value: String?) = value?.let { formatAccountDataTimestamp(it, timezone) } ?: ""
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.privacy_back)) }
                Text(stringResource(R.string.privacy_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = actions.refresh, enabled = !state.loading && !state.working) { Icon(Icons.Default.Refresh, stringResource(R.string.privacy_refresh)) }
            }
            if (state.loading || state.working) LinearProgressIndicator(Modifier.fillMaxWidth()) else HorizontalDivider()
            LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("privacy-list"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item("intro") {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(stringResource(R.string.privacy_subtitle), style = MaterialTheme.typography.bodyLarge)
                        Text(stringResource(R.string.privacy_not_stored), style = MaterialTheme.typography.bodySmall)
                    }
                }
                state.issue?.let { issue ->
                    item("issue") {
                        Text(stringResource(when (issue) { PrivacyIssue.CONNECTION -> R.string.privacy_offline; PrivacyIssue.LOAD -> R.string.privacy_load_failed; PrivacyIssue.TAKE_BACK -> R.string.privacy_take_back_failed }),
                            color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("privacy-issue").semantics { liveRegion = LiveRegionMode.Polite })
                    }
                }
                if (state.done) item("done") { Text(stringResource(R.string.privacy_done), modifier = Modifier.testTag("privacy-done").semantics { liveRegion = LiveRegionMode.Polite }) }
                item("requests") { Section(stringResource(R.string.privacy_requests)) }
                if (state.requests.isEmpty() && !state.loading) item("requests-none") { Text(stringResource(R.string.privacy_none)) }
                items(state.requests, key = { "request-${it.id}" }) { request ->
                    Permission(
                        stringResource(R.string.privacy_request_purpose, request.requestedBy.displayName, request.taskTitle, display(request.scheduledAt)),
                        stringResource(R.string.privacy_request_uses), request.resolvedAt?.let { stringResource(R.string.privacy_since, display(it)) },
                        TakeBack.Request(request), state, actions,
                    )
                }
                item("in-app") { Section(stringResource(R.string.privacy_in_app)) }
                state.inApp?.let { preferences ->
                    item("in-app-row") {
                        if (preferences.value.enabled) Permission(stringResource(R.string.privacy_in_app_on), stringResource(R.string.privacy_in_app_uses), null,
                            TakeBack.InApp(stringResource(R.string.privacy_in_app), preferences.etag), state, actions)
                        else Text(stringResource(R.string.privacy_in_app_off), modifier = Modifier.testTag("privacy-in-app-off"))
                    }
                }
                item("memories") { Section(stringResource(R.string.privacy_memories)) }
                if (state.memories.isEmpty() && !state.loading) item("memories-none") { Text(stringResource(R.string.privacy_none)) }
                items(state.memories, key = { "memory-${it.id}" }) { memory ->
                    Permission(memory.content, stringResource(R.string.privacy_memory_uses), stringResource(R.string.privacy_since, display(memory.createdAt)), TakeBack.Memory(memory), state, actions)
                }
                item("interests") { Section(stringResource(R.string.privacy_interests)) }
                state.interests?.let { interests ->
                    item("interests-row") {
                        if (state.interestCount == 0) Text(stringResource(R.string.privacy_none), modifier = Modifier.testTag("privacy-interests-none"))
                        else Permission(stringResource(R.string.privacy_interests_count, state.interestCount), stringResource(R.string.privacy_interests_uses), null,
                            TakeBack.Interests(stringResource(R.string.privacy_interests), interests), state, actions)
                    }
                }
                item("activity") {
                    Section(stringResource(R.string.privacy_activity))
                    Text(stringResource(R.string.privacy_activity_note), style = MaterialTheme.typography.bodySmall)
                }
                items(state.activity, key = { "event-${it.id}" }) { event ->
                    Column {
                        Text(stringResource(securityEventLabel(event.action)), style = MaterialTheme.typography.bodyMedium)
                        Text(display(event.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
    state.confirm?.let { item ->
        AlertDialog(
            onDismissRequest = actions.keep,
            title = { Text(stringResource(R.string.privacy_confirm_title)) },
            // A memory or a task title can be long; at 200% text it scrolls instead of pushing the actions away.
            text = { Column(Modifier.verticalScroll(rememberScrollState())) { Text(item.name, modifier = Modifier.testTag("privacy-dialog-name")) } },
            confirmButton = { TextButton(onClick = actions.confirm, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("privacy-confirm")) { Text(stringResource(R.string.privacy_take_back)) } },
            dismissButton = { TextButton(onClick = actions.keep, enabled = !state.working, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("privacy-keep")) { Text(stringResource(R.string.privacy_keep)) } },
            modifier = Modifier.testTag("privacy-dialog"),
            shape = RoundedCornerShape(DesignTokens.DialogRadius),
        )
    }
}

private fun TakeBack.tag() = when (this) {
    is TakeBack.Request -> "privacy-take-back-request-${request.id}"
    is TakeBack.InApp -> "privacy-take-back-in-app"
    is TakeBack.Memory -> "privacy-take-back-memory-${memory.id}"
    is TakeBack.Interests -> "privacy-take-back-interests"
}

@Composable
private fun Section(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
}

@Composable
private fun Permission(purpose: String, uses: String, since: String?, item: TakeBack, state: PrivacyState, actions: PrivacyActions) {
    Surface(shape = RoundedCornerShape(DesignTokens.ControlRadius), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(purpose, style = MaterialTheme.typography.titleSmall)
            Text(uses, style = MaterialTheme.typography.bodySmall)
            since?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            val label = stringResource(R.string.privacy_take_back_named, item.name)
            OutlinedButton(onClick = { actions.ask(item) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag(item.tag()).semantics { contentDescription = label }) {
                Text(stringResource(R.string.privacy_take_back))
            }
        }
    }
}
