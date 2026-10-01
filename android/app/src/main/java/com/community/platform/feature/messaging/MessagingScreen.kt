package com.community.platform.feature.messaging

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import com.community.platform.feature.spaces.SpaceMemberDto
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class MessagingActions(
    val refresh: () -> Unit = {},
    val more: () -> Unit = {},
    val selectSpace: (String) -> Unit = {},
    val openSpaceChat: () -> Unit = {},
    val openDirect: (SpaceMemberDto) -> Unit = {},
    val select: (ConversationDto) -> Unit = {},
    val close: () -> Unit = {},
    val reload: () -> Unit = {},
    val loadEarlier: () -> Unit = {},
    val draft: (String) -> Unit = {},
    val send: () -> Unit = {},
    val retry: (String) -> Unit = {},
    val stopTracking: (String) -> Unit = {},
    val editFailed: (String) -> Unit = {},
    val askDelete: (MessageDto) -> Unit = {},
    val cancelDelete: () -> Unit = {},
    val confirmDelete: () -> Unit = {},
)

@Composable
fun MessagingRoute(viewModel: MessagingViewModel, accountId: String, timezone: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.resume() }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { viewModel.pause() }
    DisposableEffect(viewModel) { onDispose { viewModel.pause() } }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) MessagingScreen(state, MessagingActions(
        refresh = { viewModel.refreshList() }, more = viewModel::moreConversations, selectSpace = viewModel::selectSpace,
        openSpaceChat = viewModel::openSpaceChat, openDirect = viewModel::openDirect, select = viewModel::select,
        close = viewModel::closeChat, reload = { viewModel.pollNow() }, loadEarlier = viewModel::loadEarlier,
        draft = viewModel::draft, send = viewModel::send, retry = viewModel::retry, stopTracking = viewModel::stopTracking,
        editFailed = viewModel::editFailed, askDelete = viewModel::askDelete, cancelDelete = viewModel::cancelDelete,
        confirmDelete = viewModel::confirmDelete,
    ), timezone, onBack)
}

private fun formatter(timezone: String): DateTimeFormatter {
    val zone = try { ZoneId.of(timezone) } catch (_error: RuntimeException) { ZoneId.systemDefault() }
    return DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withZone(zone)
}

private fun DateTimeFormatter.display(value: String?): String =
    value?.let { try { format(Instant.parse(it)) } catch (_error: RuntimeException) { null } } ?: ""

@Composable
fun MessagingScreen(state: MessagingState, actions: MessagingActions, timezone: String, onBack: () -> Unit) {
    val chat = state.chat
    var leaving by remember { mutableStateOf(false) }
    var stopKey by remember { mutableStateOf<String?>(null) }
    val time = remember(timezone) { formatter(timezone) }
    val back: () -> Unit = {
        when {
            chat == null -> onBack()
            chat.unconfirmed -> leaving = true
            else -> actions.close()
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(if (chat == null) R.string.messages_back else R.string.messages_back_list)) }
                Column(Modifier.weight(1f)) {
                    if (chat == null) Text(stringResource(R.string.messages_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                    else {
                        Text(chat.conversation.title, style = MaterialTheme.typography.titleLarge, maxLines = 2, modifier = Modifier.testTag("chat-title").semantics { heading() })
                        Text(
                            if (chat.conversation.kind == "space") stringResource(R.string.messages_space_chat_in, chat.conversation.spaceName)
                            else stringResource(R.string.messages_direct_in, chat.conversation.spaceName),
                            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary,
                        )
                    }
                }
                if (chat == null && state.unreadCount > 0) Badge(Modifier.padding(end = 4.dp)) { Text(state.unreadCount.toString()) }
                IconButton(onClick = if (chat == null) actions.refresh else actions.reload, enabled = if (chat == null) !state.listLoading else !chat.denied && !chat.polling) {
                    Icon(Icons.Default.Refresh, stringResource(if (chat == null) R.string.messages_refresh else R.string.messages_refresh_chat))
                }
            }
            HorizontalDivider()
            val showProgress = if (chat == null) state.listLoading || state.opening || state.loadingMore else chat.loading || chat.loadingEarlier || chat.deleting != null
            if (showProgress) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                if (chat == null) ConversationList(state, actions, time) else ChatPane(chat, actions, time, onStop = { stopKey = it })
            }
        }
    }
    if (chat?.confirmDelete != null) AlertDialog(
        onDismissRequest = actions.cancelDelete,
        title = { Text(stringResource(R.string.messages_delete_title)) },
        text = { Text(stringResource(R.string.messages_delete_warning)) },
        confirmButton = { TextButton(onClick = actions.confirmDelete, modifier = Modifier.testTag("message-delete-confirm")) { Text(stringResource(R.string.messages_delete_confirm)) } },
        dismissButton = { TextButton(onClick = actions.cancelDelete) { Text(stringResource(R.string.messages_keep)) } },
    )
    if (leaving && chat != null) AlertDialog(
        onDismissRequest = { leaving = false },
        title = { Text(stringResource(R.string.messages_leave_title)) },
        text = { Text(stringResource(R.string.messages_leave_warning)) },
        confirmButton = { TextButton(onClick = { leaving = false; actions.close() }) { Text(stringResource(R.string.messages_leave)) } },
        dismissButton = { TextButton(onClick = { leaving = false }) { Text(stringResource(R.string.messages_stay)) } },
    )
    stopKey?.let { key ->
        AlertDialog(
            onDismissRequest = { stopKey = null },
            title = { Text(stringResource(R.string.messages_stop_title)) },
            text = { Text(stringResource(R.string.messages_stop_warning)) },
            confirmButton = { TextButton(onClick = { stopKey = null; actions.stopTracking(key) }) { Text(stringResource(R.string.messages_stop_tracking)) } },
            dismissButton = { TextButton(onClick = { stopKey = null }) { Text(stringResource(R.string.messages_keep)) } },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ConversationList(state: MessagingState, actions: MessagingActions, time: DateTimeFormatter) {
    LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("conversation-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        state.listError?.let { item("list-error") { Text(it, color = MaterialTheme.colorScheme.error) } }
        item("start-heading") { Text(stringResource(R.string.messages_start), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
        if (state.spaces.isEmpty() && !state.spacesLoading) item("no-spaces") { Text(stringResource(R.string.messages_no_spaces)) }
        if (state.spaces.isNotEmpty()) item("spaces") {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(stringResource(R.string.messages_choose_space), style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.spaces.forEach { space ->
                        FilterChip(selected = space.id == state.selectedSpaceId, onClick = { actions.selectSpace(space.id) }, enabled = !state.opening,
                            label = { Text(space.name, maxLines = 2) }, modifier = Modifier.testTag("messages-space-${space.id}"))
                    }
                }
            }
        }
        state.selectedSpace?.let { space ->
            item("open-actions") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = actions.openSpaceChat, enabled = !state.opening, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("messages-open-space")) {
                        Icon(Icons.Default.Home, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.messages_open_space, space.name))
                    }
                    state.members.filter { it.accountId != state.accountId }.forEach { member ->
                        OutlinedButton(onClick = { actions.openDirect(member) }, enabled = !state.opening, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("messages-direct-${member.accountId}")) {
                            Icon(Icons.Default.Person, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.messages_direct, member.displayName))
                        }
                    }
                }
            }
        }
        state.openError?.let { item("open-error") { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("messages-open-error")) } }
        item("list-heading") {
            HorizontalDivider()
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.messages_conversations), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            if (state.unreadCount > 0) Text(pluralStringResource(R.plurals.messages_unread_count, state.unreadCount, state.unreadCount), style = MaterialTheme.typography.bodyMedium)
        }
        if (state.conversations.isEmpty() && !state.listLoading && state.listError == null) item("empty") { Text(stringResource(R.string.messages_empty_list)) }
        items(state.conversations, key = { it.id }) { conversation ->
            val subtitle = if (conversation.kind == "space") stringResource(R.string.messages_space_chat) else stringResource(R.string.messages_direct_in, conversation.spaceName)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(enabled = !state.opening, role = Role.Button) { actions.select(conversation) }
                    .padding(vertical = 6.dp).testTag("conversation-${conversation.id}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(if (conversation.kind == "space") Icons.Default.Home else Icons.Default.Person, null, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(conversation.title, style = MaterialTheme.typography.titleSmall, maxLines = 2)
                    Text(listOf(subtitle, time.display(conversation.lastMessageAt)).filter { it.isNotEmpty() }.joinToString(" / "), style = MaterialTheme.typography.bodySmall)
                }
                if (conversation.unreadCount > 0) {
                    val description = pluralStringResource(R.plurals.messages_unread_count, conversation.unreadCount, conversation.unreadCount)
                    Badge(Modifier.semantics { contentDescription = description }) { Text(conversation.unreadCount.toString()) }
                }
            }
            HorizontalDivider()
        }
        if (state.nextCursor != null) item("more") {
            TextButton(onClick = actions.more, enabled = !state.loadingMore) { Text(stringResource(R.string.messages_more)) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChatPane(chat: ChatState, actions: MessagingActions, time: DateTimeFormatter, onStop: (String) -> Unit) {
    val list = rememberLazyListState()
    val newest = chat.messages.lastOrNull()?.id
    LaunchedEffect(newest, chat.pending.size) { if (list.firstVisibleItemIndex <= 2) list.scrollToItem(0) }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Lock, null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.messages_protection), style = MaterialTheme.typography.labelMedium, modifier = Modifier.testTag("chat-protection"))
        }
        if (chat.conversation.kind == "space") Text(stringResource(R.string.messages_history_note), style = MaterialTheme.typography.bodySmall)
        chat.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp).testTag("chat-error")) }
        if (chat.denied) {
            Text(stringResource(R.string.messages_denied), modifier = Modifier.padding(top = 16.dp).testTag("chat-denied"))
            return@Column
        }
        // Newest items are first so the list stays anchored at the latest message.
        LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("chat-messages"), state = list, reverseLayout = true, contentPadding = PaddingValues(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(chat.pending.reversed(), key = { "pending-${it.intent.key}" }) { entry -> PendingBubble(entry, chat.draft.isBlank(), actions, onStop) }
            items(chat.messages.reversed(), key = { it.id }) { message -> MessageBubble(message, chat, actions, time) }
            if (!chat.loading && chat.messages.isEmpty() && chat.pending.isEmpty()) item("none") { Text(stringResource(R.string.messages_none), modifier = Modifier.testTag("chat-empty")) }
            if (chat.loading && chat.messages.isEmpty()) item("loading") { Text(stringResource(R.string.messages_loading)) }
            if (chat.earlierCursor != null) item("earlier") {
                TextButton(onClick = actions.loadEarlier, enabled = !chat.loadingEarlier, modifier = Modifier.testTag("chat-earlier")) { Text(stringResource(R.string.messages_earlier)) }
            }
        }
        if (chat.conversation.canSend) Composer(chat, actions)
        else Text(stringResource(R.string.messages_read_only), modifier = Modifier.padding(vertical = 12.dp).testTag("chat-read-only"))
    }
}

@Composable
private fun MessageBubble(message: MessageDto, chat: ChatState, actions: MessagingActions, time: DateTimeFormatter) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (message.mine) Alignment.CenterEnd else Alignment.CenterStart) {
        Surface(
            color = if (message.mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth(0.86f).testTag("message-${message.position}"),
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(if (message.mine) stringResource(R.string.messages_you) else message.senderName, style = MaterialTheme.typography.labelLarge)
                        Text(time.display(message.createdAt), style = MaterialTheme.typography.labelSmall)
                    }
                    if (message.mine && message.status == "sent") IconButton(onClick = { actions.askDelete(message) }, enabled = chat.deleting == null, modifier = Modifier.testTag("message-delete-${message.position}")) {
                        Icon(Icons.Default.Delete, stringResource(R.string.messages_delete))
                    }
                }
                when (message.status) {
                    "sent" -> Text(message.body.orEmpty(), style = MaterialTheme.typography.bodyLarge)
                    "deleted" -> Text(stringResource(R.string.messages_deleted), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
                    else -> Text(stringResource(R.string.messages_unavailable), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PendingBubble(entry: PendingSend, canEdit: Boolean, actions: MessagingActions, onStop: (String) -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth(0.86f).testTag("pending-${entry.state.name.lowercase()}")) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(entry.intent.body, style = MaterialTheme.typography.bodyLarge)
                when (entry.state) {
                    SendState.SENDING -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.messages_sending), style = MaterialTheme.typography.labelMedium)
                    }
                    SendState.UNKNOWN -> {
                        Text(stringResource(R.string.messages_unknown), style = MaterialTheme.typography.bodyMedium)
                        entry.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { actions.retry(entry.intent.key) }, modifier = Modifier.testTag("pending-retry")) { Text(stringResource(R.string.messages_retry)) }
                            TextButton(onClick = { onStop(entry.intent.key) }) { Text(stringResource(R.string.messages_stop_tracking)) }
                        }
                    }
                    SendState.FAILED -> {
                        Text(stringResource(R.string.messages_failed, entry.error ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                        TextButton(onClick = { actions.editFailed(entry.intent.key) }, enabled = canEdit) { Text(stringResource(R.string.messages_edit)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Composer(chat: ChatState, actions: MessagingActions) {
    val problem = if (chat.draft.isBlank()) null else messageProblem(chat.draft)
    val length = normalizeMessage(chat.draft).let { it.codePointCount(0, it.length) }
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = chat.draft, onValueChange = actions.draft, label = { Text(stringResource(R.string.messages_composer)) },
            isError = problem != null, minLines = 1, maxLines = 5, enabled = !chat.loading,
            supportingText = {
                Text(when (problem) {
                    MessageProblem.TOO_LONG -> pluralStringResource(R.plurals.messages_problem_long, MAX_MESSAGE_CHARACTERS, MAX_MESSAGE_CHARACTERS)
                    MessageProblem.CONTROL -> stringResource(R.string.messages_problem_control)
                    else -> stringResource(R.string.messages_count, length, MAX_MESSAGE_CHARACTERS)
                })
            },
            modifier = Modifier.weight(1f).testTag("message-composer"),
        )
        Spacer(Modifier.width(8.dp))
        IconButton(onClick = actions.send, enabled = !chat.loading && messageProblem(chat.draft) == null, modifier = Modifier.testTag("message-send")) {
            Icon(Icons.AutoMirrored.Filled.Send, stringResource(R.string.messages_send), tint = MaterialTheme.colorScheme.primary)
        }
    }
}
