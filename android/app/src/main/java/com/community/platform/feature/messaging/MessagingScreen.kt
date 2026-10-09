package com.community.platform.feature.messaging

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.filled.Face
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import com.community.platform.feature.agents.AgentCommand
import com.community.platform.feature.agents.AgentExecutionRecords
import com.community.platform.feature.agents.AgentProblem
import com.community.platform.feature.agents.agentMessageProblem
import com.community.platform.feature.agents.normalizedAgentMessage
import com.community.platform.feature.agents.statusLabel
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
    // Replies, reactions and edits (DEC-033).
    val startReply: (MessageDto) -> Unit = {},
    val cancelReply: () -> Unit = {},
    val react: (MessageDto, String, Boolean) -> Unit = { _, _, _ -> },
    val startEdit: (MessageDto) -> Unit = {},
    val editDraft: (String) -> Unit = {},
    val cancelEdit: () -> Unit = {},
    val saveEdit: () -> Unit = {},
    // Asking the agent with @agent (DEC-046): ask again about a request, or open the Agent on the chat's Space.
    val askAgentAgain: (MessageDto) -> Unit = {},
    val shareAgentAnswer: (MessageDto) -> Unit = {},
    val openAgent: (String) -> Unit = {},
    val openAgentReview: (String) -> Unit = {},
    val closeAgentReview: () -> Unit = {},
    val refreshAgentReview: () -> Unit = {},
    val agentReviewAnswer: (String) -> Unit = {},
    val answerAgentReview: () -> Unit = {},
    val decideAgentReview: (Boolean) -> Unit = {},
    val retryAgentReview: () -> Unit = {},
)

@Composable
fun MessagingRoute(viewModel: MessagingViewModel, accountId: String, timezone: String, onBack: () -> Unit, onSessionLost: () -> Unit, onOpenAgent: (String) -> Unit = {}) {
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
        confirmDelete = viewModel::confirmDelete, startReply = viewModel::startReply, cancelReply = viewModel::cancelReply,
        react = viewModel::react, startEdit = viewModel::startEdit, editDraft = viewModel::editDraft, cancelEdit = viewModel::cancelEdit,
        saveEdit = viewModel::saveEdit, askAgentAgain = viewModel::askAgentAgain, shareAgentAnswer = viewModel::shareAgentAnswer, openAgent = onOpenAgent,
        openAgentReview = viewModel::openAgentReview, closeAgentReview = viewModel::closeAgentReview,
        refreshAgentReview = viewModel::refreshAgentReview, agentReviewAnswer = viewModel::agentReviewAnswer,
        answerAgentReview = viewModel::answerAgentReview, decideAgentReview = viewModel::decideAgentReview,
        retryAgentReview = viewModel::retryAgentReview,
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
    val zone = remember(timezone) { try { ZoneId.of(timezone) } catch (_error: RuntimeException) { ZoneId.systemDefault() } }
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
                if (chat == null) ConversationList(state, actions, time) else ChatPane(chat, actions, time, zone, onStop = { stopKey = it })
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
        text = { Text(stringResource(if (chat.agentReview?.command != null) R.string.messages_agent_leave_warning else R.string.messages_leave_warning)) },
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
private fun ChatPane(chat: ChatState, actions: MessagingActions, time: DateTimeFormatter, zone: ZoneId, onStop: (String) -> Unit) {
    val list = rememberLazyListState()
    val newest = chat.messages.lastOrNull()?.id
    LaunchedEffect(newest, chat.pending.size) { if (list.firstVisibleItemIndex <= 2) list.scrollToItem(0) }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().padding(horizontal = 16.dp)) {
        chat.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp).testTag("chat-error")) }
        if (chat.denied) {
            Text(stringResource(R.string.messages_denied), modifier = Modifier.padding(top = 16.dp).testTag("chat-denied"))
            return@Column
        }
        // Newest items are first so the list stays anchored at the latest message. The notes about protection and history
        // scroll with the messages, so at large text and while replying the screen still has room for messages.
        LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("chat-messages"), state = list, reverseLayout = true, contentPadding = PaddingValues(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(chat.pending.reversed(), key = { "pending-${it.intent.key}" }) { entry -> PendingBubble(entry, chat.draft.isBlank(), actions, onStop) }
            items(chat.messages.reversed(), key = { it.id }) { message -> MessageBubble(message, chat, actions, time) }
            if (!chat.loading && chat.messages.isEmpty() && chat.pending.isEmpty()) item("none") { Text(stringResource(R.string.messages_none), modifier = Modifier.testTag("chat-empty")) }
            if (chat.loading && chat.messages.isEmpty()) item("loading") { Text(stringResource(R.string.messages_loading)) }
            if (chat.earlierCursor != null) item("earlier") {
                TextButton(onClick = actions.loadEarlier, enabled = !chat.loadingEarlier, modifier = Modifier.testTag("chat-earlier")) { Text(stringResource(R.string.messages_earlier)) }
            }
            chat.agentReview?.let { review -> item("agent-review-${review.runId}") { AgentReviewPanel(review, actions, zone) } }
            item("notes") {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Lock, null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.messages_protection), style = MaterialTheme.typography.labelMedium, modifier = Modifier.testTag("chat-protection"))
                    }
                    if (chat.conversation.kind == "space") Text(stringResource(R.string.messages_history_note), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (chat.conversation.canSend) Composer(chat, actions)
        else Text(stringResource(R.string.messages_read_only), modifier = Modifier.padding(vertical = 12.dp).testTag("chat-read-only"))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MessageBubble(message: MessageDto, chat: ChatState, actions: MessagingActions, time: DateTimeFormatter) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (message.mine) Alignment.CenterEnd else Alignment.CenterStart) {
        // The agent's replies come from the Space's agent, not a member, so they look unlike people's messages (DEC-046).
        Surface(
            color = when { message.fromAgent -> DesignTokens.Surface; message.mine -> MaterialTheme.colorScheme.primaryContainer; else -> MaterialTheme.colorScheme.surfaceVariant },
            border = if (message.fromAgent) BorderStroke(1.dp, DesignTokens.Accent) else null,
            shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth(0.86f).testTag("message-${message.position}"),
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        if (message.fromAgent) Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.testTag("message-agent-${message.position}")) {
                            Icon(Icons.Default.Face, null, Modifier.size(16.dp), tint = DesignTokens.Accent); Spacer(Modifier.width(6.dp))
                            Text(stringResource(R.string.messages_agent_name), style = MaterialTheme.typography.labelLarge)
                        } else Text(if (message.mine) stringResource(R.string.messages_you) else message.senderName, style = MaterialTheme.typography.labelLarge)
                        Text(time.display(message.createdAt), style = MaterialTheme.typography.labelSmall)
                        if (message.editedAt != null && message.status != "deleted") Text(stringResource(R.string.messages_edited), style = MaterialTheme.typography.labelSmall, modifier = Modifier.testTag("message-edited-${message.position}"))
                    }
                    if (message.mine && message.status == "sent") IconButton(onClick = { actions.askDelete(message) }, enabled = chat.deleting == null, modifier = Modifier.testTag("message-delete-${message.position}")) {
                        Icon(Icons.Default.Delete, stringResource(R.string.messages_delete))
                    }
                }
                message.replyTo?.let { reply -> Quote(reply, fromAgent = chat.messages.any { it.id == reply.messageId && it.fromAgent }) }
                when {
                    chat.editing == message.id -> {
                        val problem = messageProblem(chat.editDraft)
                        OutlinedTextField(value = chat.editDraft, onValueChange = actions.editDraft, label = { Text(stringResource(R.string.messages_edit_label)) },
                            isError = chat.editDraft.isNotBlank() && problem != null, minLines = 1, maxLines = 5,
                            supportingText = { Text(stringResource(R.string.messages_edit_hint)) }, modifier = Modifier.fillMaxWidth().testTag("message-edit-field"))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = actions.saveEdit, enabled = chat.acting == null && problem == null, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("message-edit-save")) { Text(stringResource(R.string.messages_edit_save)) }
                            TextButton(onClick = actions.cancelEdit, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("message-edit-cancel")) { Text(stringResource(R.string.messages_edit_cancel)) }
                        }
                    }
                    message.status == "sent" -> Text(message.body.orEmpty(), style = MaterialTheme.typography.bodyLarge)
                    message.status == "deleted" -> Text(stringResource(R.string.messages_deleted), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
                    else -> Text(stringResource(R.string.messages_unavailable), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                }
                AgentStatus(message, chat, actions)
                Reactions(message, chat, actions)
            }
        }
    }
}

/** What became of the person's own @agent request and where to go next; an answer in the chat needs no note (DEC-046). */
@Composable
private fun AgentStatus(message: MessageDto, chat: ChatState, actions: MessagingActions) {
    val status = message.agentRequest?.status ?: return
    if (status == "answered" || message.status != "sent") return
    val text = stringResource(when (status) {
        "private" -> R.string.messages_agent_private
        "waiting" -> R.string.messages_agent_waiting
        "pending" -> R.string.messages_agent_pending
        "off" -> R.string.messages_agent_off
        "limited" -> R.string.messages_agent_limited
        "too_long" -> R.string.messages_agent_too_long
        else -> R.string.messages_agent_failed
    })
    Column(Modifier.testTag("agent-status-${message.position}")) {
        var sharing by remember { mutableStateOf(false) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Face, null, Modifier.size(15.dp), tint = DesignTokens.Muted); Spacer(Modifier.width(6.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
        when (status) {
            "private", "waiting" -> if (message.mine) TextButton(onClick = { actions.openAgentReview(message.id) },
                enabled = chat.conversation.kind == "space" && chat.acting == null,
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-open-${message.position}")) { Text(stringResource(R.string.messages_agent_review)) }
            "pending", "failed" -> TextButton(onClick = { actions.askAgentAgain(message) }, enabled = chat.acting == null && chat.conversation.canSend,
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-ask-again-${message.position}")) { Text(stringResource(R.string.messages_agent_ask_again)) }
        }
        if (status == "private" && message.mine && message.agentRequest?.runId != null) TextButton(onClick = { sharing = true },
            enabled = chat.acting == null && chat.conversation.canSend,
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-share-${message.position}")) { Text(stringResource(R.string.messages_agent_share)) }
        if (sharing) AlertDialog(onDismissRequest = { sharing = false },
            title = { Text(stringResource(R.string.messages_agent_share_title)) },
            text = { Text(stringResource(R.string.messages_agent_share_text)) },
            confirmButton = { TextButton(onClick = { sharing = false; actions.shareAgentAnswer(message) },
                modifier = Modifier.testTag("agent-share-confirm")) { Text(stringResource(R.string.messages_agent_share_confirm)) } },
            dismissButton = { TextButton(onClick = { sharing = false }) { Text(stringResource(R.string.messages_agent_keep_private)) } },
            modifier = Modifier.testTag("agent-share-dialog"))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AgentReviewPanel(review: AgentReviewState, actions: MessagingActions, zone: ZoneId) {
    val run = review.run
    Surface(
        color = DesignTokens.Surface,
        border = BorderStroke(1.dp, DesignTokens.Border),
        shape = RoundedCornerShape(DesignTokens.DialogRadius),
        modifier = Modifier.fillMaxWidth().testTag("agent-review-${review.runId}"),
    ) {
        Column(Modifier.padding(DesignTokens.SpaceUnit * 4), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.messages_agent_review_title), style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f).semantics { heading() }.testTag("agent-review-title"))
                IconButton(onClick = actions.closeAgentReview, modifier = Modifier.testTag("agent-review-close")) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.messages_agent_review_close))
                }
            }
            Text(review.run?.message.orEmpty(), style = MaterialTheme.typography.bodyMedium)
            if (run == null && review.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            run?.let { current ->
                Text(statusLabel(current), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.testTag("agent-review-status-${current.id}"))
                current.answer?.let { answer -> Text(answer, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("agent-review-answer-${current.id}")) }
                current.question?.let { question ->
                    val answerProblem = agentMessageProblem(normalizedAgentMessage(review.answer))
                    Text(question.text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("agent-review-question-${current.id}"))
                    val answering = review.command as? AgentCommand.Answer
                    OutlinedTextField(
                        value = answering?.answer ?: review.answer,
                        onValueChange = actions.agentReviewAnswer,
                        enabled = !review.loading && !review.working && review.command == null,
                        isError = review.answer.isNotEmpty() && answerProblem != null,
                        label = { Text(stringResource(R.string.agent_answer_label)) },
                        maxLines = 3,
                        supportingText = {
                            when (answerProblem) {
                                AgentProblem.EMPTY -> Text(stringResource(R.string.agent_problem_empty))
                                AgentProblem.TOO_LONG -> Text(stringResource(R.string.agent_problem_long))
                                AgentProblem.CONTROL -> Text(stringResource(R.string.agent_problem_control))
                                null -> Unit
                            }
                        },
                        modifier = Modifier.fillMaxWidth().testTag("agent-review-answer-field"),
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                        Button(
                            onClick = if (answering != null) actions.retryAgentReview else actions.answerAgentReview,
                            enabled = !review.loading && !review.working && (answering != null || review.command == null && answerProblem == null),
                            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-review-answer-submit"),
                        ) { Text(stringResource(if (answering != null) R.string.agent_try_again else R.string.agent_answer)) }
                    }
                }
                current.approval?.let { approval ->
                    HorizontalDivider(color = DesignTokens.Border)
                    Text(if (current.awaitingApproval) stringResource(R.string.agent_check) else approval.summary,
                        style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() }.testTag("agent-review-approval-${current.id}"))
                    approval.fields.forEachIndexed { index, field ->
                        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag("agent-review-field-${current.id}-$index")) {
                            Text(field.label, style = MaterialTheme.typography.bodySmall, color = DesignTokens.Muted)
                            Text(field.value, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    if (current.awaitingApproval) {
                        val deciding = review.command as? AgentCommand.Decide
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                            Button(
                                onClick = if (deciding?.approve == true) actions.retryAgentReview else { { actions.decideAgentReview(true) } },
                                enabled = !review.loading && !review.working && (review.command == null || deciding?.approve == true),
                                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-review-approve"),
                            ) { Text(stringResource(if (deciding?.approve == true) R.string.agent_approve_again else R.string.agent_approve)) }
                            OutlinedButton(
                                onClick = if (deciding?.approve == false) actions.retryAgentReview else { { actions.decideAgentReview(false) } },
                                enabled = !review.loading && !review.working && (review.command == null || deciding?.approve == false),
                                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-review-reject"),
                            ) { Text(stringResource(if (deciding?.approve == false) R.string.agent_try_again else R.string.agent_reject)) }
                        }
                    }
                }
                AgentExecutionRecords(current, zone)
            }
            review.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("agent-review-error")) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                TextButton(onClick = actions.refreshAgentReview, enabled = !review.loading && !review.working,
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("agent-review-refresh")) { Text(stringResource(R.string.agent_check_again)) }
            }
        }
    }
}

private val EMOJI = mapOf("like" to "\uD83D\uDC4D", "love" to "\u2764\uFE0F", "laugh" to "\uD83D\uDE02", "wow" to "\uD83D\uDE2E", "sad" to "\uD83D\uDE22", "thanks" to "\uD83D\uDE4F")

@Composable
private fun reactionName(reaction: String): String = stringResource(when (reaction) {
    "like" -> R.string.messages_reaction_like
    "love" -> R.string.messages_reaction_love
    "laugh" -> R.string.messages_reaction_laugh
    "wow" -> R.string.messages_reaction_wow
    "sad" -> R.string.messages_reaction_sad
    else -> R.string.messages_reaction_thanks
})

@Composable
private fun Quote(reply: ReplyDto, fromAgent: Boolean = false) {
    val text = when (reply.status) {
        "sent" -> "${if (fromAgent) stringResource(R.string.messages_agent_name) else reply.senderName}: ${reply.excerpt}"
        "deleted" -> stringResource(R.string.messages_quote_deleted)
        else -> stringResource(R.string.messages_quote_hidden)
    }
    Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().testTag("message-quote")) {
        Text(text, style = MaterialTheme.typography.bodySmall, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Reactions(message: MessageDto, chat: ChatState, actions: MessagingActions) {
    var picking by remember(message.id) { mutableStateOf(false) }
    val active = message.status == "sent" && chat.conversation.canSend && chat.editing != message.id
    if (message.reactionList.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        message.reactionList.forEach { item ->
            val name = reactionName(item.reaction)
            val description = if (item.mine) stringResource(R.string.messages_reaction_mine, name, item.count) else stringResource(R.string.messages_reaction_count, name, item.count)
            FilterChip(selected = item.mine, onClick = { actions.react(message, item.reaction, !item.mine) }, enabled = active && chat.acting == null,
                label = { Text("${EMOJI[item.reaction]} ${item.count}") },
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).semantics { contentDescription = description }.testTag("reaction-${message.position}-${item.reaction}"))
        }
    }
    if (active) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        TextButton(onClick = { actions.startReply(message) }, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("message-reply-${message.position}")) { Text(stringResource(R.string.messages_reply)) }
        TextButton(onClick = { picking = !picking }, enabled = chat.acting == null, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("message-react-${message.position}")) { Text(stringResource(R.string.messages_react)) }
        if (editable(message)) TextButton(onClick = { actions.startEdit(message) }, enabled = chat.acting == null, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("message-edit-${message.position}")) { Text(stringResource(R.string.messages_edit_message)) }
    }
    if (active && picking) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.testTag("reaction-picker-${message.position}")) {
        REACTIONS.forEach { reaction ->
            val mine = message.reactionList.any { it.reaction == reaction && it.mine }
            val name = reactionName(reaction)
            FilterChip(selected = mine, onClick = { picking = false; actions.react(message, reaction, !mine) }, enabled = chat.acting == null,
                label = { Text(EMOJI.getValue(reaction)) },
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).semantics { contentDescription = name }.testTag("reaction-choice-$reaction"))
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
    chat.replyingTo?.let { original ->
        Row(Modifier.fillMaxWidth().padding(top = 8.dp).testTag("reply-bar"), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.messages_replying_to, when { original.fromAgent -> stringResource(R.string.messages_agent_name); original.mine -> stringResource(R.string.messages_you); else -> original.senderName }) + ": " + original.body.orEmpty(),
                style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            TextButton(onClick = actions.cancelReply, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("reply-cancel")) { Text(stringResource(R.string.messages_reply_cancel)) }
        }
    }
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = chat.draft, onValueChange = actions.draft, label = { Text(stringResource(R.string.messages_composer)) },
            isError = problem != null, minLines = 1, maxLines = 5, enabled = !chat.loading,
            supportingText = {
                Column {
                    Text(when (problem) {
                        MessageProblem.TOO_LONG -> pluralStringResource(R.plurals.messages_problem_long, MAX_MESSAGE_CHARACTERS, MAX_MESSAGE_CHARACTERS)
                        MessageProblem.CONTROL -> stringResource(R.string.messages_problem_control)
                        else -> stringResource(R.string.messages_count, length, MAX_MESSAGE_CHARACTERS)
                    })
                    if (problem == null && mentionsAgent(chat.draft)) Text(stringResource(R.string.messages_agent_hint), modifier = Modifier.testTag("agent-hint"))
                }
            },
            modifier = Modifier.weight(1f).testTag("message-composer"),
        )
        Spacer(Modifier.width(8.dp))
        IconButton(onClick = actions.send, enabled = !chat.loading && messageProblem(chat.draft) == null, modifier = Modifier.testTag("message-send")) {
            Icon(Icons.AutoMirrored.Filled.Send, stringResource(R.string.messages_send), tint = MaterialTheme.colorScheme.primary)
        }
    }
}
