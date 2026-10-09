package com.community.platform.feature.discovery

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import com.community.platform.feature.files.documentKindLabel
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class SearchActions(
    val back: () -> Unit = {}, val query: (String) -> Unit = {}, val filter: (String?) -> Unit = {}, val search: () -> Unit = {},
    val reloadSpaces: () -> Unit = {}, val openDocument: (SearchDocumentDto) -> Unit = {},
    val openTasks: (SearchTaskDto) -> Unit = {}, val openEvents: (SearchEventDto) -> Unit = {},
    val showMore: (SearchKind) -> Unit = {},
)

@Composable
fun SearchRoute(viewModel: SearchViewModel, accountId: String, onBack: () -> Unit, onSessionLost: () -> Unit,
    onOpenDocument: (SearchDocumentDto) -> Unit, onOpenTasks: (SearchTaskDto) -> Unit, onOpenEvents: (SearchEventDto) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) SearchScreen(state, SearchActions(back = onBack, query = viewModel::query, filter = viewModel::filter,
        search = viewModel::search, reloadSpaces = viewModel::reloadSpaces, openDocument = onOpenDocument, openTasks = onOpenTasks, openEvents = onOpenEvents,
        showMore = viewModel::showMore))
}

@Composable
private fun SearchHeading(label: String, tag: String) {
    Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = DesignTokens.SpaceUnit * 3).testTag(tag).semantics { heading() })
}

@Composable
fun SearchScreen(state: SearchState, actions: SearchActions) {
    BackHandler(onBack = actions.back)
    val words = searchWords(state.submittedQuery ?: state.results?.query.orEmpty())
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(DesignTokens.SpaceUnit * 2), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = actions.back, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.search_back)) }
                Text(stringResource(R.string.search_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
            }
            HorizontalDivider(color = DesignTokens.Border)
            if (state.busy || state.loadingMore || state.refreshing) LinearProgressIndicator(Modifier.fillMaxWidth().height(DesignTokens.SpaceUnit).clearAndSetSemantics {})
            else Spacer(Modifier.height(DesignTokens.SpaceUnit))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(Modifier.widthIn(max = DesignTokens.SpaceUnit * 180).fillMaxSize().testTag("search-content"),
                    contentPadding = PaddingValues(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                    item("form") { SearchForm(state, actions) }
                    item("status") {
                        Column(Modifier.fillMaxWidth().testTag("search-status").semantics { liveRegion = LiveRegionMode.Polite },
                            verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                            if (state.loadingMore) Text(stringResource(R.string.search_loading_more))
                            state.notice?.let { Text(stringResource(if (it == SearchNotice.UPDATED) R.string.search_updated else R.string.search_space_gone)) }
                            if (state.stale) Text(stringResource(R.string.search_stale))
                        }
                    }
                    val results = state.results
                    if (results != null) {
                        if (results.empty) item("empty") { Text(stringResource(R.string.search_empty), modifier = Modifier.testTag("search-empty")) }
                        item("documents-heading") { SearchHeading(stringResource(R.string.documents_title), "search-documents-heading") }
                        if (results.documents.isEmpty()) item("no-documents") { Text(stringResource(R.string.search_no_documents)) }
                        itemsIndexed(results.documents, key = { index, document -> "${document.documentId}:$index" }) { index, document ->
                            SearchResult(document.name, document.spaceName, document.excerpt, "search-document-$index", { actions.openDocument(document) }, words) {
                                Text(stringResource(R.string.search_document_lines, documentKindLabel(document.mediaType), document.startLine ?: 0, document.endLine ?: 0), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        if (results.moreDocuments == true) item("more-documents") { SearchMore(state, SearchKind.DOCUMENTS, actions) }
                        item("tasks-heading") { SearchHeading(stringResource(R.string.search_tasks), "search-tasks-heading") }
                        if (results.tasks.isEmpty()) item("no-tasks") { Text(stringResource(R.string.search_no_tasks)) }
                        items(results.tasks, key = { it.taskId }) { task ->
                            SearchResult(task.title, task.spaceName, task.excerpt, "search-task-${task.taskId}", { actions.openTasks(task) }, words, task.excerptIn == "checklist") {
                                Text(stringResource(when (task.status) {
                                    "in_progress" -> R.string.search_task_in_progress; "completed" -> R.string.search_task_completed
                                    "cancelled" -> R.string.search_task_cancelled; else -> R.string.search_task_open
                                }), style = MaterialTheme.typography.bodySmall)
                                task.dueDate?.let { Text(stringResource(R.string.search_due,
                                    LocalDate.parse(it).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))), style = MaterialTheme.typography.bodySmall) }
                            }
                        }
                        if (results.moreTasks == true) item("more-tasks") { SearchMore(state, SearchKind.TASKS, actions) }
                        item("events-heading") { SearchHeading(stringResource(R.string.search_events), "search-events-heading") }
                        if (results.events.isEmpty()) item("no-events") { Text(stringResource(R.string.search_no_events)) }
                        items(results.events, key = { it.eventId }) { event ->
                            SearchResult(event.title, event.spaceName, event.excerpt, "search-event-${event.eventId}", { actions.openEvents(event) }, words) {
                                Text(stringResource(if (event.status == "cancelled") R.string.search_event_cancelled else R.string.search_event_scheduled), style = MaterialTheme.typography.bodySmall)
                                Text(stringResource(R.string.search_event_time,
                                    LocalDateTime.parse(event.localStart).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)), event.timezone),
                                    style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        if (results.moreEvents == true) item("more-events") { SearchMore(state, SearchKind.EVENTS, actions) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchForm(state: SearchState, actions: SearchActions) {
    var choosingSpace by remember { mutableStateOf(false) }
    val width = LocalConfiguration.current.screenWidthDp.dp - DesignTokens.SpaceUnit * 8
    Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        OutlinedTextField(value = state.query, onValueChange = actions.query, enabled = !state.searching && !state.requiresSignIn,
            label = { Text(stringResource(R.string.search_query)) }, supportingText = { Text(stringResource(R.string.search_scope)) },
            minLines = 1, maxLines = 3,
            shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().testTag("search-query"))
        Text(stringResource(R.string.search_space), style = MaterialTheme.typography.labelLarge)
        Box(Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { choosingSpace = true }, enabled = !state.busy && state.spacesLoaded && !state.requiresSignIn,
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("search-space")) {
                Text(state.spaces.firstOrNull { it.id == state.spaceId }?.name ?: stringResource(R.string.search_all_spaces), Modifier.weight(1f))
                Icon(Icons.Default.ArrowDropDown, null)
            }
            DropdownMenu(expanded = choosingSpace, onDismissRequest = { choosingSpace = false }, modifier = Modifier.widthIn(max = width)) {
                DropdownMenuItem(text = { Text(stringResource(R.string.search_all_spaces)) }, onClick = { choosingSpace = false; actions.filter(null) },
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget))
                state.spaces.forEach { space -> DropdownMenuItem(text = { Text(space.name) }, onClick = { choosingSpace = false; actions.filter(space.id) },
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) }
            }
        }
        state.problem?.let { Text(stringResource(if (it == SearchProblem.WORDS) R.string.search_problem_words else R.string.search_problem_length),
            color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("search-problem")) }
        state.issue?.let { Text(stringResource(if (it == SearchIssue.CONNECTION) R.string.search_connection else R.string.search_response),
            color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("search-issue")) }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("search-error")) }
        if (!state.spacesLoaded && !state.loadingSpaces) TextButton(onClick = actions.reloadSpaces, enabled = !state.busy,
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) { Text(stringResource(R.string.search_reload_spaces)) }
        Button(onClick = actions.search, enabled = !state.busy && !state.requiresSignIn, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("search-submit")) {
            Icon(Icons.Default.Search, null)
            Text(stringResource(R.string.search_title), Modifier.padding(start = DesignTokens.SpaceUnit * 2))
        }
    }
}

@Composable
private fun SearchMore(state: SearchState, kind: SearchKind, actions: SearchActions) {
    val tag = "search-more-${kind.name.lowercase(java.util.Locale.ROOT)}"
    if (state.limit >= 100) Text(stringResource(R.string.search_first_page, 100), modifier = Modifier.testTag(tag))
    else OutlinedButton(onClick = { actions.showMore(kind) }, enabled = !state.loadingMore && !state.busy && !state.requiresSignIn,
        shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag(tag)) {
        Text(stringResource(when (kind) {
            SearchKind.DOCUMENTS -> R.string.search_more_documents
            SearchKind.TASKS -> R.string.search_more_tasks
            SearchKind.EVENTS -> R.string.search_more_events
        }))
    }
}

@Composable
private fun marked(value: String, words: List<String>) = buildAnnotatedString {
    val style = SpanStyle(fontWeight = FontWeight.Bold, background = MaterialTheme.colorScheme.primaryContainer,
        color = MaterialTheme.colorScheme.onPrimaryContainer)
    highlightPieces(value, words).forEach { piece ->
        if (piece.marked) withStyle(style) { append(piece.text) } else append(piece.text)
    }
}

@Composable
private fun SearchResult(title: String, space: String, excerpt: String, tag: String, onClick: () -> Unit,
    words: List<String>, checklist: Boolean = false, details: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).clickable(role = Role.Button, onClick = onClick)
        .padding(vertical = DesignTokens.SpaceUnit * 2).testTag(tag), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        Text(marked(title, words), style = MaterialTheme.typography.titleMedium)
        Text(space, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        details()
        if (excerpt.isNotEmpty()) {
            if (checklist) Text(stringResource(R.string.search_in_checklist), style = MaterialTheme.typography.labelLarge)
            Text(marked(excerpt, words), style = MaterialTheme.typography.bodyMedium)
        }
        HorizontalDivider(color = DesignTokens.Border)
    }
}