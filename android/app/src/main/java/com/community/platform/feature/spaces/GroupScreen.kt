package com.community.platform.feature.spaces

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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R

@Composable
fun GroupRoute(viewModel: GroupViewModel, accountId: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) GroupScreen(state, viewModel, onBack)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GroupScreen(state: GroupState, viewModel: GroupViewModel, onBack: () -> Unit) {
    val back: () -> Unit = { if (!state.busy) { if (state.asking != null && state.pendingAsk == null) viewModel.cancelAsk() else if (!state.locked) onBack() } }
    BackHandler(onBack = back)
    val shape = RoundedCornerShape(6.dp)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.groups_back)) }
                Text(stringResource(if (state.managing) R.string.groups_access else R.string.groups_find), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                IconButton(onClick = viewModel::refresh, enabled = !state.locked) { Icon(Icons.Default.Refresh, stringResource(R.string.spaces_refresh)) }
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("group-workspace"), verticalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(20.dp)) {
                    state.error?.let { item("error") { GroupMessage(it, true) } }
                    state.notice?.let { item("notice") { GroupMessage(it, false) } }
                    if (state.managing) {
                        val managed = state.managedSpace
                        val settings = state.settings
                        if (managed != null && managed.role in setOf("owner", "admin")) {
                            item("access") {
                                Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                                    Text(settings?.name ?: managed.name, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
                                    if (managed.role == "owner" && settings != null) {
                                        Text(stringResource(if (settings.visibility == "public") R.string.groups_public_now else R.string.groups_private_now))
                                        if (!state.confirmingVisibility) {
                                            OutlinedButton(onClick = viewModel::proposeVisibility, enabled = !state.locked, shape = shape, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("group-visibility")) {
                                                Text(stringResource(if (settings.visibility == "public") R.string.groups_make_private else R.string.groups_make_public))
                                            }
                                        } else {
                                            Text(stringResource(if (settings.visibility == "public") R.string.groups_confirm_private else R.string.groups_confirm_public))
                                            if (state.pendingVisibility != null && !state.busy) Text(stringResource(R.string.groups_unconfirmed))
                                            FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                                                TextButton(onClick = viewModel::keepVisibility, enabled = !state.locked, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) { Text(stringResource(R.string.cancel)) }
                                                Button(onClick = viewModel::confirmVisibility, enabled = !state.busy, shape = shape, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("group-visibility-confirm")) { Text(stringResource(R.string.confirm)) }
                                            }
                                        }
                                        HorizontalDivider()
                                    }
                                    Text(stringResource(R.string.groups_requests_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                                    if (managed.role == "owner" && settings?.visibility == "private") Text(stringResource(R.string.groups_requests_private))
                                    else if (state.reviews.isEmpty() && !state.busy && state.error == null) Text(stringResource(R.string.groups_requests_none))
                                }
                            }
                            items(state.reviews, key = { "review-${it.id}" }) { review ->
                                Column(Modifier.fillMaxWidth().testTag("group-review-${review.id}"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(review.displayName, style = MaterialTheme.typography.titleMedium)
                                    if (review.note.isNotBlank()) Text(review.note, style = MaterialTheme.typography.bodyMedium)
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedButton(onClick = { viewModel.decide(review, approve = false) }, enabled = !state.locked, shape = shape, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.groups_decline)) }
                                        Button(onClick = { viewModel.decide(review, approve = true) }, enabled = !state.locked, shape = shape, modifier = Modifier.heightIn(min = 48.dp).testTag("group-approve-${review.id}")) { Text(stringResource(R.string.groups_approve)) }
                                    }
                                    HorizontalDivider()
                                }
                            }
                        }
                    } else {
                        item("intro") { Text(stringResource(R.string.groups_intro), style = MaterialTheme.typography.bodyMedium) }
                        item("search") {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(value = state.query, onValueChange = viewModel::query, label = { Text(stringResource(R.string.groups_search)) }, singleLine = true, enabled = !state.locked,
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { viewModel.search() }), modifier = Modifier.fillMaxWidth().testTag("group-search"))
                                Button(onClick = viewModel::search, enabled = !state.locked, shape = shape, modifier = Modifier.heightIn(min = 48.dp).testTag("group-search-action")) { Icon(Icons.Default.Search, null); Text(stringResource(R.string.groups_search_action), Modifier.padding(start = 8.dp)) }
                            }
                        }
                        if (state.groups.isEmpty() && !state.busy && state.error == null) item("none") { Text(stringResource(R.string.groups_none)) }
                        items(state.groups, key = { "group-${it.id}" }) { entry ->
                            Card(Modifier.fillMaxWidth().testTag("group-${entry.id}"), shape = RoundedCornerShape(10.dp)) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(entry.name, style = MaterialTheme.typography.titleLarge)
                                    if (entry.description.isNotBlank()) Text(entry.description, style = MaterialTheme.typography.bodyMedium)
                                    Text(stringResource(R.string.groups_member_count, entry.memberCount), style = MaterialTheme.typography.labelLarge)
                                    when {
                                        entry.viewerRole == "owner" -> Text(stringResource(R.string.groups_owner), color = MaterialTheme.colorScheme.primary)
                                        entry.viewerRole == "admin" -> Text(stringResource(R.string.groups_admin), color = MaterialTheme.colorScheme.primary)
                                        entry.viewerRole == "member" -> Text(stringResource(R.string.groups_member), color = MaterialTheme.colorScheme.primary)
                                        entry.pendingRequestId != null -> FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text(stringResource(R.string.groups_requested), color = MaterialTheme.colorScheme.primary, modifier = Modifier.align(Alignment.CenterVertically))
                                            OutlinedButton(onClick = { viewModel.withdraw(entry.pendingRequestId) }, enabled = !state.locked, shape = shape, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.groups_withdraw)) }
                                        }
                                        state.asking?.id == entry.id -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            OutlinedTextField(value = state.pendingAsk?.note ?: state.note, onValueChange = viewModel::note, label = { Text(stringResource(R.string.groups_note)) }, enabled = state.pendingAsk == null && !state.busy, minLines = 2, maxLines = 5, modifier = Modifier.fillMaxWidth().testTag("group-note"))
                                            Text("${(state.pendingAsk?.note ?: state.note).length}/280", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.End))
                                            if (state.pendingAsk != null && !state.busy) Text(stringResource(R.string.groups_unconfirmed))
                                            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                TextButton(onClick = viewModel::cancelAsk, enabled = !state.locked, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.cancel)) }
                                                Button(onClick = viewModel::sendAsk, enabled = !state.busy, shape = shape, modifier = Modifier.heightIn(min = 48.dp).testTag("group-send")) { Text(stringResource(if (state.pendingAsk != null) R.string.groups_retry else R.string.groups_send)) }
                                            }
                                        }
                                        entry.canRequest -> Button(onClick = { viewModel.startAsk(entry) }, enabled = !state.locked && state.asking == null, shape = shape, modifier = Modifier.heightIn(min = 48.dp).testTag("group-ask-${entry.id}")) { Text(stringResource(R.string.groups_ask)) }
                                        else -> Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Lock, null); Text(stringResource(R.string.groups_unavailable), Modifier.padding(start = 6.dp)) }
                                    }
                                }
                            }
                        }
                        if (state.cursor != null) item("more") { TextButton(onClick = viewModel::more, enabled = !state.locked) { Text(stringResource(R.string.groups_more)) } }
                        item("requests-title") { Text(stringResource(R.string.groups_my_requests), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp).semantics { heading() }) }
                        if (state.requests.isEmpty() && !state.busy) item("requests-none") { Text(stringResource(R.string.groups_no_requests)) }
                        items(state.requests, key = { "request-${it.id}" }) { request ->
                            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(request.spaceName, style = MaterialTheme.typography.titleMedium)
                                Text(stringResource(joinStatus(request.status)), style = MaterialTheme.typography.labelLarge)
                                if (request.note.isNotBlank()) Text(request.note, style = MaterialTheme.typography.bodySmall)
                                if (request.status == "pending") OutlinedButton(onClick = { viewModel.withdraw(request.id) }, enabled = !state.locked, shape = shape, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.groups_withdraw)) }
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupMessage(message: String, error: Boolean) {
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(4.dp),
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) { Text(message, Modifier.padding(12.dp)) }
}

private fun joinStatus(status: String) = when (status) {
    "pending" -> R.string.groups_status_pending
    "approved" -> R.string.groups_status_approved
    "declined" -> R.string.groups_status_declined
    "cancelled" -> R.string.groups_status_cancelled
    "closed" -> R.string.groups_status_closed
    else -> R.string.groups_status_expired
}
