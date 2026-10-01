package com.community.platform.feature.files

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import java.io.IOException
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class DocumentActions(
    val back: () -> Unit = {}, val reload: () -> Unit = {}, val more: () -> Unit = {}, val chooseFile: () -> Unit = {},
    val add: () -> Unit = {}, val retry: () -> Unit = {}, val open: (DocumentDto) -> Unit = {}, val close: () -> Unit = {},
    val askDelete: () -> Unit = {}, val keep: () -> Unit = {}, val delete: () -> Unit = {}, val retryDelete: () -> Unit = {},
    val discard: () -> Unit = {},
)

private val DOCUMENT_MIME_TYPES = arrayOf("text/plain", "text/markdown", "text/csv", "text/comma-separated-values", "text/x-markdown", "text/*")

private fun readDocumentUri(resolver: ContentResolver, uri: Uri): ChosenDocument {
    var name: String? = null
    var size: Long? = null
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn)
            if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn).takeIf { it >= 0 }
        }
    }
    return readDocumentFile(name ?: throw DocumentFileFailure(DocumentProblem.NAME), size) {
        resolver.openInputStream(uri) ?: throw IOException("The selected file could not be opened.")
    }
}

@Composable
fun DocumentRoute(viewModel: DocumentViewModel, accountId: String, spaceId: String, onBack: () -> Unit, onSessionLost: () -> Unit, onCloseViewer: (() -> Unit)? = null) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val resolver = LocalContext.current.contentResolver
    var pickerAccount by remember { mutableStateOf<String?>(null) }
    var pickerSpace by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && viewModel.state.value.accountId == pickerAccount && viewModel.state.value.spaceId == pickerSpace) {
            viewModel.chooseFile { readDocumentUri(resolver, uri) }
        }
        pickerAccount = null; pickerSpace = null
    }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId && state.spaceId == spaceId) DocumentScreen(state, DocumentActions(
        back = onBack, reload = { state.viewingId?.let { viewModel.open(it, state.lineRange) } ?: viewModel.reload() },
        more = { viewModel.reload(more = true) }, chooseFile = {
            pickerAccount = accountId; pickerSpace = spaceId; picker.launch(DOCUMENT_MIME_TYPES)
        }, add = viewModel::add, retry = viewModel::retry, open = { viewModel.open(it.id) }, close = onCloseViewer ?: viewModel::closeViewer,
        askDelete = viewModel::askDelete, keep = viewModel::keepDocument, delete = viewModel::delete,
        retryDelete = viewModel::retryDelete, discard = viewModel::discardPending,
    ))
}

@Composable
internal fun documentKindLabel(mediaType: String?): String = stringResource(when (mediaType) {
    "text/markdown" -> R.string.documents_markdown
    "text/csv" -> R.string.documents_csv
    else -> R.string.documents_text
})

@Composable
private fun sizeLabel(bytes: Int): String = stringResource(R.string.documents_size,
    NumberFormat.getNumberInstance().apply { maximumFractionDigits = 1 }.format(bytes / 1024.0))

private fun addedDate(value: String): String = Instant.parse(value).atZone(ZoneId.systemDefault())
    .format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))

@Composable
private fun DocumentMessages(state: DocumentsState) {
    state.problem?.let { problem -> Text(stringResource(when (problem) {
        DocumentProblem.NAME -> R.string.documents_problem_name
        DocumentProblem.TYPE -> R.string.documents_problem_type
        DocumentProblem.TOO_LARGE -> R.string.documents_problem_size
        DocumentProblem.UTF8 -> R.string.documents_problem_utf8
        DocumentProblem.CONTROL -> R.string.documents_problem_control
        DocumentProblem.EMPTY -> R.string.documents_problem_empty
        DocumentProblem.READ -> R.string.documents_problem_read
    }), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("document-problem")) }
    state.issue?.let { issue -> Text(stringResource(when (issue) {
        DocumentIssue.CONNECTION -> R.string.documents_connection
        DocumentIssue.RESPONSE -> R.string.documents_response
        DocumentIssue.ADD_UNCERTAIN -> R.string.documents_add_uncertain
        DocumentIssue.DELETE_UNCERTAIN -> R.string.documents_delete_uncertain
        DocumentIssue.UNAVAILABLE -> R.string.documents_unavailable
    }), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("document-issue")) }
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("document-error")) }
    state.notice?.let { notice -> Text(stringResource(when (notice) {
        DocumentNotice.ADDED -> R.string.documents_added
        DocumentNotice.DELETED -> R.string.documents_deleted
        DocumentNotice.ALREADY_DELETED -> R.string.documents_already_deleted
    }), color = MaterialTheme.colorScheme.primary, modifier = Modifier.testTag("document-notice")) }
}

@Composable
fun DocumentScreen(state: DocumentsState, actions: DocumentActions) {
    var confirmingLeave by remember(state.accountId, state.spaceId) { mutableStateOf(false) }
    val back: () -> Unit = {
        when {
            state.busy -> Unit
            state.uncertain -> confirmingLeave = true
            state.viewingId != null -> actions.close()
            else -> actions.back()
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(DesignTokens.SpaceUnit * 2), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.busy, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("documents-back")) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.documents_back))
                }
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.documents_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                    Text(state.spaceName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = actions.reload, enabled = !state.busy && !state.uncertain && !state.requiresSignIn) {
                    Icon(Icons.Default.Refresh, stringResource(R.string.documents_refresh))
                }
            }
            HorizontalDivider(color = DesignTokens.Border)
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(DesignTokens.SpaceUnit)) else Spacer(Modifier.height(DesignTokens.SpaceUnit))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                if (state.viewingId == null) DocumentList(state, actions) else DocumentViewer(state, actions)
            }
        }
    }
    val selected = state.selected
    if (state.confirmingDelete && selected?.name != null) DocumentConfirmation(
        title = stringResource(R.string.documents_delete), text = stringResource(R.string.documents_delete_confirmation, selected.name, selected.spaceName),
        confirm = stringResource(R.string.documents_delete), dismiss = stringResource(R.string.documents_cancel),
        onConfirm = actions.delete, onDismiss = actions.keep, tag = "document-delete-dialog", confirmTag = "document-delete-confirm", danger = true,
    )
    if (confirmingLeave) DocumentConfirmation(
        title = stringResource(R.string.documents_leave_title),
        text = stringResource(R.string.documents_leave_confirmation, state.pending?.body?.name ?: selected?.name.orEmpty(), state.spaceName),
        confirm = stringResource(R.string.documents_leave), dismiss = stringResource(R.string.documents_stay),
        onConfirm = { confirmingLeave = false; actions.discard(); actions.back() }, onDismiss = { confirmingLeave = false },
        tag = "document-leave-dialog", confirmTag = "document-leave-confirm",
    )
}

@Composable
private fun DocumentList(state: DocumentsState, actions: DocumentActions) {
    LazyColumn(Modifier.widthIn(max = DesignTokens.SpaceUnit * 180).fillMaxSize().testTag("documents-content"),
        contentPadding = PaddingValues(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
        item("add") {
            Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                DocumentMessages(state)
                Text(stringResource(R.string.documents_text_only), style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = actions.chooseFile, enabled = !state.busy && !state.uncertain && !state.unavailable && !state.requiresSignIn,
                    shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("document-choose")) {
                    Icon(Icons.Default.Add, null)
                    Text(stringResource(R.string.documents_choose), Modifier.padding(start = DesignTokens.SpaceUnit * 2))
                }
                state.chosen?.let { file ->
                    Text(file.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("document-chosen-name"))
                    Text(sizeLabel(file.sizeBytes), modifier = Modifier.testTag("document-chosen-size"))
                    Button(onClick = if (state.pending == null) actions.add else actions.retry, enabled = !state.busy,
                        shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                            .testTag(if (state.pending == null) "document-add" else "document-retry")) {
                        Text(stringResource(if (state.pending == null) R.string.documents_add else R.string.documents_retry))
                    }
                }
                HorizontalDivider(color = DesignTokens.Border)
            }
        }
        if (state.loaded && state.documents.isEmpty() && state.error == null && state.issue == null) item("empty") {
            Text(stringResource(R.string.documents_empty), modifier = Modifier.testTag("documents-empty"))
        }
        items(state.documents, key = { it.id }) { document ->
            Column(Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                .clickable(enabled = !state.busy && !state.uncertain, role = Role.Button) { actions.open(document) }
                .padding(vertical = DesignTokens.SpaceUnit * 2).testTag("document-row-${document.id}"),
                verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                Text(document.name.orEmpty(), style = MaterialTheme.typography.titleMedium)
                DocumentMetadata(document)
                HorizontalDivider(color = DesignTokens.Border)
            }
        }
        if (state.nextCursor != null) item("more") {
            OutlinedButton(onClick = actions.more, enabled = !state.busy && !state.uncertain, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("documents-more")) { Text(stringResource(R.string.documents_more)) }
        }
    }
}

@Composable
private fun DocumentMetadata(document: DocumentDto) {
    Text(stringResource(R.string.documents_summary, documentKindLabel(document.mediaType), sizeLabel(document.sizeBytes ?: 0),
        pluralStringResource(R.plurals.documents_lines, document.lineCount ?: 0, document.lineCount ?: 0)), style = MaterialTheme.typography.bodySmall)
    Text(stringResource(R.string.documents_added_by, document.addedByName), style = MaterialTheme.typography.bodySmall)
    Text(addedDate(document.addedAt), style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun DocumentViewer(state: DocumentsState, actions: DocumentActions) {
    val document = state.selected
    val lines = remember(document?.id, document?.content) { document?.content?.let(::documentLines).orEmpty() }
    val list = rememberLazyListState()
    LaunchedEffect(document?.id, state.lineRange) {
        state.lineRange?.let { range -> if (range.first in 1..lines.size) list.scrollToItem(range.first) }
    }
    LazyColumn(Modifier.widthIn(max = DesignTokens.SpaceUnit * 180).fillMaxSize().testTag("document-viewer"), state = list,
        contentPadding = PaddingValues(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        item("header") {
            Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                DocumentMessages(state)
                if (document?.status == "active") {
                    Text(document.name.orEmpty(), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                    DocumentMetadata(document)
                    if (document.canDelete == true || state.pendingDelete != null) {
                        OutlinedButton(onClick = if (state.pendingDelete == null) actions.askDelete else actions.retryDelete, enabled = !state.busy,
                            shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                                .testTag(if (state.pendingDelete == null) "document-delete" else "document-retry-delete")) {
                            Icon(Icons.Default.Delete, null)
                            Text(stringResource(if (state.pendingDelete == null) R.string.documents_delete else R.string.documents_retry_delete),
                                Modifier.padding(start = DesignTokens.SpaceUnit * 2))
                        }
                    }
                    state.lineRange?.let { Text(stringResource(R.string.documents_cited_lines, it.first, it.last), style = MaterialTheme.typography.labelLarge) }
                } else if (document?.status == "deleted") Text(stringResource(R.string.documents_unavailable))
                HorizontalDivider(color = DesignTokens.Border)
            }
        }
        itemsIndexed(lines, key = { index, _ -> index }) { index, line ->
            val number = index + 1
            val cited = state.lineRange?.let { number in it.first..it.last } == true
            Row(Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                .background(if (cited) DesignTokens.PrimarySurface else MaterialTheme.colorScheme.surface)
                .padding(DesignTokens.SpaceUnit * 2).testTag("document-line-$number").semantics { selected = cited },
                verticalAlignment = Alignment.Top) {
                Text(number.toString(), style = MaterialTheme.typography.bodySmall, fontWeight = if (cited) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.widthIn(min = DesignTokens.SpaceUnit * 8).padding(end = DesignTokens.SpaceUnit * 2))
                Text(line, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DocumentConfirmation(title: String, text: String, confirm: String, dismiss: String, onConfirm: () -> Unit, onDismiss: () -> Unit,
    tag: String, confirmTag: String, danger: Boolean = false) {
    val height = LocalConfiguration.current.screenHeightDp.dp - DesignTokens.SpaceUnit * 8
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.padding(DesignTokens.SpaceUnit * 4).widthIn(max = DesignTokens.SpaceUnit * 140).fillMaxWidth().heightIn(max = height).testTag(tag),
            shape = RoundedCornerShape(DesignTokens.DialogRadius), color = DesignTokens.Surface) {
            Column(Modifier.padding(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 3)) {
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                    Text(text, style = MaterialTheme.typography.bodyMedium)
                }
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2, Alignment.End),
                    verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                    TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("$tag-cancel")) { Text(dismiss) }
                    Button(onClick = onConfirm, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                        colors = if (danger) ButtonDefaults.buttonColors(containerColor = DesignTokens.Danger, contentColor = DesignTokens.Surface) else ButtonDefaults.buttonColors(),
                        modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag(confirmTag)) { Text(confirm) }
                }
            }
        }
    }
}