package com.community.platform.feature.messaging

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.realtime.LiveEvent
import com.community.platform.feature.realtime.LiveSignals
import com.community.platform.feature.spaces.SpaceDto
import com.community.platform.feature.spaces.SpaceMemberDto
import com.community.platform.feature.spaces.SpaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.IOException
import java.util.UUID
import javax.inject.Inject

enum class SendState { SENDING, UNKNOWN, FAILED }

/** [kept]: also kept sealed on the phone (DEC-021), so leaving the chat or closing the app does not lose it. */
data class PendingSend(val intent: SendIntent, val state: SendState, val error: String? = null, val kept: Boolean = false)

data class ChatState(
    val conversation: ConversationDto,
    val messages: List<MessageDto> = emptyList(),
    val earlierCursor: String? = null,
    val loading: Boolean = true,
    val polling: Boolean = false,
    val loadingEarlier: Boolean = false,
    val pending: List<PendingSend> = emptyList(),
    val draft: String = "",
    val confirmDelete: String? = null,
    val deleting: String? = null,
    val denied: Boolean = false,
    val error: String? = null,
) {
    /** Leaving loses the retry identity of these sends: the ones not kept on the phone. */
    val unconfirmed: Boolean get() = pending.any { it.state != SendState.FAILED && !it.kept }
    val working: Boolean get() = loading || polling || loadingEarlier || deleting != null || pending.any { it.state == SendState.SENDING }
}

data class MessagingState(
    val accountId: String? = null,
    val entrySpaceId: String? = null,
    val conversations: List<ConversationDto> = emptyList(),
    val nextCursor: String? = null,
    val unreadCount: Int = 0,
    val listLoading: Boolean = false,
    val listSyncing: Boolean = false,
    val loadingMore: Boolean = false,
    val listError: String? = null,
    val spaces: List<SpaceDto> = emptyList(),
    val spacesLoading: Boolean = false,
    val selectedSpaceId: String? = null,
    val members: List<SpaceMemberDto> = emptyList(),
    val membersLoading: Boolean = false,
    val opening: Boolean = false,
    val openError: String? = null,
    val chat: ChatState? = null,
    val requiresSignIn: Boolean = false,
) {
    val selectedSpace: SpaceDto? get() = spaces.firstOrNull { it.id == selectedSpaceId }
    val busy: Boolean get() = listLoading || listSyncing || loadingMore || spacesLoading || membersLoading || opening || chat?.working == true
}

const val MESSAGE_POLL_MILLISECONDS = 5000L
/** While the live stream is open it reports changes, so polling only backs it up (the list every third poll). */
const val LIVE_MESSAGE_POLL_MILLISECONDS = 30_000L
private const val MAX_PENDING_SENDS = 20

@HiltViewModel
class MessagingViewModel @Inject constructor(
    private val repository: MessagingRepository,
    private val spaces: SpaceRepository,
    private val live: LiveSignals = LiveSignals.None,
    private val outbox: MessageOutbox = MessageOutbox.None,
) : ViewModel() {
    private val mutableState = MutableStateFlow(MessagingState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var chatGeneration = 0L
    private var accountJob: Job = SupervisorJob()
    private var chatJob: Job = SupervisorJob()
    private var listJob: Job? = null
    private var listReads = 0L
    private var pollLoop: Job? = null
    private var visible = false
    private var entryOpened = false
    private var markedThrough = 0L
    private var hintPollChat = -1L
    private var hintRefresh = -1L

    private fun accountScope() = CoroutineScope(viewModelScope.coroutineContext + accountJob)
    private fun chatScope() = CoroutineScope(viewModelScope.coroutineContext + chatJob)

    fun bind(accountId: String?, entrySpaceId: String? = null) {
        val entry = if (accountId == null) null else entrySpaceId
        val current = mutableState.value
        if (current.accountId == accountId && current.entrySpaceId == entry) return
        generation += 1; chatGeneration += 1
        accountJob.cancel(); chatJob.cancel()
        accountJob = SupervisorJob(viewModelScope.coroutineContext[Job])
        chatJob = SupervisorJob(accountJob)
        listJob = null; pollLoop = null; entryOpened = false; markedThrough = 0
        mutableState.value = MessagingState(accountId = accountId, entrySpaceId = entry, selectedSpaceId = entry)
        if (accountId != null) {
            refreshList()
            loadSpaces()
            listen()
            if (visible) startPolling()
        }
    }

    /** Polling runs only while the screen is visible, so a hidden chat is not marked read. */
    fun resume() { visible = true; startPolling(); refreshList(quiet = true); mutableState.value.chat?.let { if (!it.denied) pollNow() } }
    fun pause() { visible = false; pollLoop?.cancel(); pollLoop = null }

    private fun startPolling() {
        pollLoop?.cancel()
        if (!visible || mutableState.value.accountId == null) return
        val expected = generation
        pollLoop = accountScope().launch {
            var tick = 0
            while (isActive && generation == expected) {
                // A change in the live connection starts the wait again with the other interval.
                val connected = live.connected.value
                val interval = if (connected) LIVE_MESSAGE_POLL_MILLISECONDS else MESSAGE_POLL_MILLISECONDS
                if (withTimeoutOrNull(interval) { live.connected.first { it != connected } } != null) { tick = 0; continue }
                tick += 1
                val chat = mutableState.value.chat
                if (chat != null) { if (!chat.denied) poll(first = false) }
                else if (tick % 3 == 0) refreshList(quiet = true)
            }
        }
    }

    /** Live hints carry IDs only: a hint about the open chat polls it now, and any conversation change re-reads the list. */
    private fun listen() {
        val expected = generation
        accountScope().launch {
            live.events.collect { event ->
                // A hidden screen catches up when it resumes.
                if (generation != expected || !visible) return@collect
                when (event) {
                    is LiveEvent.Change -> if (event.kind == "conversation") {
                        val open = mutableState.value.chat?.conversation?.id
                        if (open != null && open.equals(event.conversationId, ignoreCase = true)) pollForHint()
                        refreshForHint()
                    }
                    LiveEvent.Ready, LiveEvent.Resync -> { pollForHint(); refreshForHint() }
                    is LiveEvent.End -> Unit
                }
            }
        }
    }

    /** Polls the open chat now, or exactly once more after the poll that is running; polls never overlap. */
    private fun pollForHint() {
        val chat = mutableState.value.chat ?: return
        val expectedChat = chatGeneration
        if (chat.denied || hintPollChat == expectedChat) return
        hintPollChat = expectedChat
        chatScope().launch(start = CoroutineStart.UNDISPATCHED) {
            try {
                mutableState.first { state -> state.chat.let { it == null || !it.polling && !it.loading } }
            } finally {
                if (hintPollChat == expectedChat) hintPollChat = -1
            }
            poll(first = false)
        }
    }

    /** Re-reads the conversation list now, or exactly once more after the read that is running. */
    private fun refreshForHint() {
        val running = listJob?.takeIf { it.isActive }
        if (running == null) { refreshList(quiet = true); return }
        val expected = generation
        if (hintRefresh == expected) return
        hintRefresh = expected
        accountScope().launch {
            try { running.join() } finally { if (hintRefresh == expected) hintRefresh = -1 }
            refreshList(quiet = true)
        }
    }

    private fun sessionLost(error: Throwable) = (error as? IdentityFailure)?.let { it.status == 401 || it.code == "ACCOUNT_CHANGED" } == true

    private fun describe(error: Throwable, fallback: String) =
        if (error is IOException) "No connection. Check your connection and try again." else error.message?.takeIf { it.isNotBlank() } ?: fallback

    private fun lose(expected: Long) {
        if (generation != expected) return
        val account = mutableState.value.accountId
        generation += 1; chatGeneration += 1
        accountJob.cancel(); chatJob.cancel()
        accountJob = SupervisorJob(viewModelScope.coroutineContext[Job])
        chatJob = SupervisorJob(accountJob)
        mutableState.value = MessagingState(accountId = account, requiresSignIn = true)
    }

    private fun updateChat(expectedChat: Long, transform: (ChatState) -> ChatState) {
        if (chatGeneration != expectedChat) return
        mutableState.update { current -> current.chat?.let { current.copy(chat = transform(it)) } ?: current }
    }

    fun refreshList(quiet: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.requiresSignIn || listJob?.isActive == true) return
        readList(account, quiet)
    }

    /**
     * After a change of this screen's own (a send, a deletion, marking read, opening a conversation) or a chat found gone, a list read
     * already under way started before it and could answer after it with what came before, so that read stops and the list is read again (T82).
     */
    private fun listChanged() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.requiresSignIn) return
        listJob?.cancel()
        readList(account, quiet = true)
    }

    private fun readList(account: String, quiet: Boolean) {
        val expected = generation
        val read = ++listReads
        mutableState.update { if (quiet) it.copy(listSyncing = true) else it.copy(listLoading = true, listError = null) }
        listJob = accountScope().launch {
            try {
                val page = repository.conversations(account)
                if (generation == expected) mutableState.update { it.copy(conversations = page.items, nextCursor = page.nextCursor, unreadCount = page.unreadCount, listError = null) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (sessionLost(error)) lose(expected)
                else if (generation == expected) mutableState.update { it.copy(listError = describe(error, "Conversations could not be loaded.")) }
            } finally {
                // A read stopped by a change leaves its marks to the read that replaced it.
                mutableState.update { if (generation == expected && listReads == read) it.copy(listLoading = false, listSyncing = false, loadingMore = false) else it }
            }
        }
    }

    fun moreConversations() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val cursor = current.nextCursor ?: return
        if (current.loadingMore || listJob?.isActive == true) return
        val expected = generation
        val read = ++listReads
        mutableState.update { it.copy(loadingMore = true, listError = null) }
        listJob = accountScope().launch {
            try {
                val page = repository.conversations(account, cursor)
                if (generation == expected) mutableState.update { state ->
                    state.copy(conversations = (state.conversations + page.items).distinctBy { it.id }, nextCursor = page.nextCursor, unreadCount = page.unreadCount)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (sessionLost(error)) lose(expected)
                else if (generation == expected) {
                    // An expired or rejected cursor restarts from the newest conversations.
                    val restart = (error as? IdentityFailure)?.status in setOf(400, 410)
                    mutableState.update { it.copy(listError = describe(error, "More conversations could not be loaded."), nextCursor = if (restart) null else it.nextCursor) }
                }
            } finally {
                mutableState.update { if (generation == expected && listReads == read) it.copy(loadingMore = false) else it }
            }
        }
    }

    private fun loadSpaces() {
        val account = mutableState.value.accountId ?: return
        val expected = generation
        mutableState.update { it.copy(spacesLoading = true) }
        accountScope().launch {
            try {
                val all = mutableListOf<SpaceDto>()
                var cursor: String? = null
                for (page in 0 until 3) {
                    val result = spaces.spaces(account, cursor)
                    all += result.items
                    cursor = result.nextCursor ?: break
                }
                if (generation != expected) return@launch
                val loaded = all.distinctBy { it.id }
                mutableState.update { state ->
                    state.copy(spaces = loaded, selectedSpaceId = state.selectedSpaceId?.takeIf { id -> loaded.any { it.id == id } })
                }
                val entry = mutableState.value.entrySpaceId
                val selected = mutableState.value.selectedSpaceId
                if (entry != null && !entryOpened) {
                    entryOpened = true
                    if (selected == entry) { loadMembers(entry); openSpaceChat() }
                    else mutableState.update { it.copy(openError = "This Space is not available to you.") }
                } else if (selected != null) loadMembers(selected)
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (sessionLost(error)) lose(expected)
                else if (generation == expected) mutableState.update { it.copy(openError = describe(error, "Your Spaces could not be loaded.")) }
            } finally {
                if (generation == expected) mutableState.update { it.copy(spacesLoading = false) }
            }
        }
    }

    fun selectSpace(spaceId: String) {
        val current = mutableState.value
        if (current.opening || current.spaces.none { it.id == spaceId }) return
        mutableState.update { it.copy(selectedSpaceId = spaceId, members = emptyList(), openError = null) }
        loadMembers(spaceId)
    }

    private fun loadMembers(spaceId: String) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.spaces.firstOrNull { it.id == spaceId }?.spaceType != "family") return
        val expected = generation
        mutableState.update { it.copy(membersLoading = true) }
        accountScope().launch {
            try {
                val roster = spaces.members(account, spaceId)
                if (generation == expected && mutableState.value.selectedSpaceId == spaceId) mutableState.update { it.copy(members = roster) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (sessionLost(error)) lose(expected)
                else if (generation == expected) mutableState.update { it.copy(openError = describe(error, "Members could not be loaded.")) }
            } finally {
                if (generation == expected) mutableState.update { it.copy(membersLoading = false) }
            }
        }
    }

    fun openSpaceChat() = open(null)
    fun openDirect(member: SpaceMemberDto) {
        val current = mutableState.value
        if (member.accountId == current.accountId || current.members.none { it == member }) return
        open(member.accountId)
    }

    private fun open(participantId: String?) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.selectedSpaceId ?: return
        if (current.opening || current.chat != null || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(opening = true, openError = null) }
        accountScope().launch {
            try {
                val conversation = repository.open(account, space, participantId)
                if (generation == expected) { show(conversation); listChanged() }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (sessionLost(error)) lose(expected)
                else if (generation == expected) mutableState.update { it.copy(openError = describe(error, "The conversation could not be opened.")) }
            } finally {
                if (generation == expected) mutableState.update { it.copy(opening = false) }
            }
        }
    }

    fun select(conversation: ConversationDto) {
        val current = mutableState.value
        if (current.chat != null || current.opening || current.conversations.none { it.id == conversation.id }) return
        show(conversation)
    }

    private fun show(conversation: ConversationDto) {
        chatGeneration += 1
        chatJob.cancel(); chatJob = SupervisorJob(accountJob)
        markedThrough = conversation.readPosition.toLong()
        mutableState.update { it.copy(chat = ChatState(conversation)) }
        val expectedChat = chatGeneration
        // Kept messages come back before the first read, which may already show some of them as confirmed.
        chatScope().launch { restoreKept(expectedChat, conversation.id); poll(first = true) }
    }

    /** Messages kept on the phone for this chat return as unconfirmed; nothing is sent until the person retries. */
    private suspend fun restoreKept(expectedChat: Long, conversationId: String) {
        val account = mutableState.value.accountId ?: return
        val kept = try { outbox.kept(account, conversationId) } catch (error: CancellationException) { throw error } catch (_error: Exception) { return }
        if (kept.isEmpty()) return
        updateChat(expectedChat) { chat ->
            val known = chat.pending.map { it.intent.key }.toSet()
            chat.copy(pending = chat.pending + kept.filter { it.intent.key !in known }.map { PendingSend(it.intent, SendState.UNKNOWN, kept = true) })
        }
    }

    fun closeChat() {
        if (mutableState.value.chat == null) return
        chatGeneration += 1
        chatJob.cancel(); chatJob = SupervisorJob(accountJob)
        mutableState.update { it.copy(chat = null) }
        refreshList(quiet = true)
    }

    fun pollNow(first: Boolean = false) { chatScope().launch { poll(first) } }

    private suspend fun poll(first: Boolean) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val chat = current.chat ?: return
        if (chat.denied || chat.polling) return
        val expected = generation
        val expectedChat = chatGeneration
        val conversationId = chat.conversation.id
        updateChat(expectedChat) { it.copy(polling = true) }
        try {
            val view = repository.read(account, conversationId)
            val latest = repository.messages(account, conversationId)
            var incoming = latest.items
            val known = mutableState.value.chat?.messages?.lastOrNull()?.position?.toLong()
            // More than one page may have arrived since the previous poll; fetch the gap forward. Until the gap is closed,
            // only messages that follow on without a hole are shown, so none is skipped or marked read unseen (as T41 on the web).
            if (known != null && latest.items.isNotEmpty() && latest.items.first().position.toLong() > known + 1) {
                val gap = mutableListOf<MessageDto>()
                var after = known.toString()
                var closed = false
                var page = 0
                while (page < 10 && !closed) {
                    val next = repository.messages(account, conversationId, after = after)
                    gap += next.items
                    val joined = gap.isNotEmpty() && gap.last().position.toLong() >= latest.items.first().position.toLong() - 1
                    val cursor = next.nextCursor
                    if (joined || cursor == null) closed = true else after = cursor
                    page += 1
                }
                incoming = if (closed) gap + latest.items else gap
            }
            if (chatGeneration != expectedChat) return
            absorb(expectedChat, incoming)
            updateChat(expectedChat) { it.copy(conversation = view, error = null, earlierCursor = if (first) latest.nextCursor else it.earlierCursor) }
            val newest = mutableState.value.chat?.messages?.lastOrNull()?.position?.toLong() ?: 0L
            if (visible && newest > maxOf(markedThrough, view.readPosition.toLong())) {
                val previous = markedThrough
                markedThrough = newest
                try {
                    val read = repository.markRead(account, conversationId, newest.toString())
                    updateChat(expectedChat) { it.copy(conversation = read) }
                    listChanged()
                } catch (error: CancellationException) { throw error }
                catch (error: Exception) {
                    markedThrough = previous
                    throw error
                }
            }
        } catch (error: CancellationException) { throw error }
        catch (error: Exception) { chatFailure(expected, expectedChat, error, "Messages could not be loaded.") }
        finally { updateChat(expectedChat) { it.copy(polling = false, loading = false) } }
    }

    private fun chatFailure(expected: Long, expectedChat: Long, error: Exception, fallback: String) {
        if (sessionLost(error)) { lose(expected); return }
        if ((error as? IdentityFailure)?.status == 404) {
            // Access ended: drop every private message, draft and pending send for this conversation, also those kept on the phone.
            val conversationId = mutableState.value.chat?.conversation?.id?.takeIf { chatGeneration == expectedChat }
            updateChat(expectedChat) { ChatState(it.conversation.copy(unreadCount = 0), loading = false, denied = true, error = "You no longer have access to this conversation.") }
            conversationId?.let(::forgetConversation)
            listChanged()
            return
        }
        updateChat(expectedChat) { it.copy(error = describe(error, fallback)) }
    }

    private suspend fun absorb(expectedChat: Long, incoming: List<MessageDto>) {
        val confirmed = incoming.filter { it.mine }.mapNotNull { it.clientMessageId }.toSet()
        // A kept message the server shows is confirmed, so it is no longer kept.
        val settled = mutableState.value.chat?.pending.orEmpty().filter { it.kept && it.intent.key in confirmed && it.state != SendState.SENDING }
        updateChat(expectedChat) { chat ->
            chat.copy(
                messages = mergeMessages(chat.messages, incoming),
                pending = chat.pending.filterNot { it.intent.key in confirmed && it.state != SendState.SENDING },
            )
        }
        forgetKept(settled.map { it.intent.key })
    }

    fun loadEarlier() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val chat = current.chat ?: return
        val cursor = chat.earlierCursor ?: return
        if (chat.loadingEarlier || chat.denied) return
        val expected = generation
        val expectedChat = chatGeneration
        updateChat(expectedChat) { it.copy(loadingEarlier = true, error = null) }
        chatScope().launch {
            try {
                val page = repository.messages(account, chat.conversation.id, before = cursor)
                absorb(expectedChat, page.items)
                updateChat(expectedChat) { it.copy(earlierCursor = page.nextCursor) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { chatFailure(expected, expectedChat, error, "Earlier messages could not be loaded.") }
            finally { updateChat(expectedChat) { it.copy(loadingEarlier = false) } }
        }
    }

    fun draft(value: String) {
        updateChat(chatGeneration) { if (it.denied || !it.conversation.canSend) it else it.copy(draft = value.take(MAX_MESSAGE_CHARACTERS * 2)) }
    }

    fun send() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val chat = current.chat ?: return
        if (chat.denied || chat.loading || !chat.conversation.canSend || messageProblem(chat.draft) != null) return
        if (chat.pending.size >= MAX_PENDING_SENDS) {
            updateChat(chatGeneration) { it.copy(error = "Resolve the unconfirmed messages before sending more.") }
            return
        }
        val intent = SendIntent(account, chat.conversation.id, UUID.randomUUID().toString(), normalizeMessage(chat.draft))
        updateChat(chatGeneration) { it.copy(draft = "", error = null, pending = it.pending + PendingSend(intent, SendState.SENDING)) }
        deliver(intent)
    }

    /** Retries exactly the original body with the original key; the server returns the first saved copy. */
    fun retry(key: String) {
        val chat = mutableState.value.chat ?: return
        val entry = chat.pending.firstOrNull { it.intent.key == key && it.state == SendState.UNKNOWN } ?: return
        if (chat.denied) return
        updateChat(chatGeneration) { state -> state.copy(pending = state.pending.map { if (it.intent.key == key) it.copy(state = SendState.SENDING, error = null) else it }) }
        deliver(entry.intent)
    }

    private fun deliver(intent: SendIntent) {
        val expected = generation
        val expectedChat = chatGeneration
        chatScope().launch {
            try {
                // Kept before it is sent, so closing the app or losing the network does not lose it (DEC-021).
                if (keep(intent)) updateChat(expectedChat) { chat -> chat.copy(pending = chat.pending.map { if (it.intent.key == intent.key) it.copy(kept = true) else it }) }
                val message = repository.send(intent)
                forgetKept(listOf(intent.key))
                absorb(expectedChat, listOf(message))
                updateChat(expectedChat) { chat -> chat.copy(pending = chat.pending.filterNot { it.intent.key == intent.key }) }
                listChanged()
            } catch (error: CancellationException) {
                // The chat went away before the answer, so a kept message is sent in the background.
                scheduleKept(intent.accountId)
                throw error
            } catch (error: Exception) {
                val failure = error as? IdentityFailure
                if (sessionLost(error) || failure?.status == 404) { chatFailure(expected, expectedChat, error, "The message was not confirmed."); return@launch }
                val definite = failure != null && failure.status in 400..499 && failure.status != 408
                // A refused message stays on screen to edit but is no longer kept; any other failure is retried in the background.
                if (definite) forgetKept(listOf(intent.key)) else scheduleKept(intent.accountId)
                updateChat(expectedChat) { chat ->
                    chat.copy(pending = chat.pending.map {
                        if (it.intent.key == intent.key) it.copy(state = if (definite) SendState.FAILED else SendState.UNKNOWN, error = describe(error, "The message was not confirmed."), kept = it.kept && !definite) else it
                    })
                }
                if (failure?.code == "CONVERSATION_READ_ONLY") pollNow()
            }
        }
    }

    fun stopTracking(key: String) {
        val chat = mutableState.value.chat ?: return
        if (chat.pending.none { it.intent.key == key && it.state == SendState.UNKNOWN }) return
        updateChat(chatGeneration) { state -> state.copy(pending = state.pending.filterNot { it.intent.key == key && it.state == SendState.UNKNOWN }) }
        accountScope().launch { forgetKept(listOf(key)) }
    }

    // The kept copy never decides what the screen shows: when keeping or removing fails, the chat goes on as before.
    private suspend fun keep(intent: SendIntent): Boolean =
        try { outbox.keep(intent) } catch (error: CancellationException) { throw error } catch (_error: Exception) { false }

    private suspend fun forgetKept(keys: List<String>) {
        if (keys.isEmpty()) return
        try { outbox.forget(keys) } catch (error: CancellationException) { throw error } catch (_error: Exception) { }
    }

    private fun forgetConversation(conversationId: String) {
        val account = mutableState.value.accountId ?: return
        accountScope().launch {
            val kept = try { outbox.kept(account, conversationId) } catch (error: CancellationException) { throw error } catch (_error: Exception) { return@launch }
            forgetKept(kept.map { it.intent.key })
        }
    }

    private fun scheduleKept(accountId: String) {
        try { outbox.schedule(accountId) } catch (_error: Exception) { }
    }

    fun editFailed(key: String) {
        updateChat(chatGeneration) { chat ->
            val entry = chat.pending.firstOrNull { it.intent.key == key && it.state == SendState.FAILED }
            if (entry == null || chat.draft.isNotBlank()) chat
            else chat.copy(draft = entry.intent.body, pending = chat.pending - entry)
        }
    }

    fun askDelete(message: MessageDto) {
        updateChat(chatGeneration) { chat ->
            val known = chat.messages.firstOrNull { it.id == message.id }
            if (chat.denied || chat.deleting != null || known == null || !known.mine || known.status != "sent") chat else chat.copy(confirmDelete = known.id)
        }
    }

    fun cancelDelete() { updateChat(chatGeneration) { it.copy(confirmDelete = null) } }

    fun confirmDelete() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val chat = current.chat ?: return
        val messageId = chat.confirmDelete ?: return
        if (chat.deleting != null || chat.denied) return
        val expected = generation
        val expectedChat = chatGeneration
        updateChat(expectedChat) { it.copy(confirmDelete = null, deleting = messageId, error = null) }
        chatScope().launch {
            try {
                absorb(expectedChat, listOf(repository.delete(account, chat.conversation.id, messageId)))
                listChanged()
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if ((error as? IdentityFailure)?.status == 404 && !sessionLost(error)) {
                    // The message or the conversation is gone; a fresh read tells which.
                    updateChat(expectedChat) { it.copy(error = "This message is no longer available.") }
                    pollNow()
                } else chatFailure(expected, expectedChat, error, "The deletion was not confirmed. Reload to check.")
            } finally { updateChat(expectedChat) { it.copy(deleting = null) } }
        }
    }

    override fun onCleared() {
        accountJob.cancel()
        chatJob.cancel()
    }
}
