package com.community.platform.feature.messaging

import androidx.lifecycle.viewModelScope
import com.community.platform.IdentityModule
import com.community.platform.feature.agents.AgentApi
import com.community.platform.feature.agents.AgentApprovalDto
import com.community.platform.feature.agents.AgentAnswerDto
import com.community.platform.feature.agents.AgentAskDto
import com.community.platform.feature.agents.AgentCommand
import com.community.platform.feature.agents.AgentDeletedDto
import com.community.platform.feature.agents.AgentFieldDto
import com.community.platform.feature.agents.AgentIssue
import com.community.platform.feature.agents.AgentMemoryDto
import com.community.platform.feature.agents.AgentRepository
import com.community.platform.feature.agents.AgentRunDto
import com.community.platform.feature.agents.AgentQuestionDto
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.scheduling.ReminderRepositoryTest
import com.community.platform.feature.scheduling.RepositoryAlertSource
import com.community.platform.feature.spaces.SpaceMemberDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

internal class MessagingAgentApi : AgentApi {
    val runs = mutableMapOf<String, AgentRunDto>()
    val runReads = mutableListOf<String>()
    val decisions = mutableListOf<Triple<String, String, String>>()
    val answers = mutableListOf<Pair<String, AgentAnswerDto>>()
    private val decided = mutableMapOf<Pair<String, String>, AgentRunDto>()
    var readFailure = 0
    var readGate: CompletableDeferred<Unit>? = null
    var readStarted: CompletableDeferred<Unit>? = null
    var readFinished: CompletableDeferred<Unit>? = null
    var loseApprovalResponse = false
    var loseApprovalBeforeCommit = false
    var effects = 0

    private fun <Value> ok(value: Value): Response<EnvelopeDto<Value>> = Response.success(EnvelopeDto(value, null))
    private fun <Value> unavailable(): Response<EnvelopeDto<Value>> = Response.error(501,
        """{"error":{"code":"UNAVAILABLE","message":"Synthetic unavailable"}}""".toResponseBody("application/json".toMediaType()))
    private fun <Value> failed(status: Int): Response<EnvelopeDto<Value>> = Response.error(status,
        """{"error":{"code":"NOT_FOUND","message":"Synthetic missing"}}""".toResponseBody("application/json".toMediaType()))

    override suspend fun ask(authorization: String, key: String, body: AgentAskDto) = unavailable<AgentRunDto>()
    override suspend fun runs(authorization: String, spaceId: String?, cursor: String?, limit: Int) = unavailable<List<AgentRunDto>>()
    override suspend fun getRun(authorization: String, runId: String): Response<EnvelopeDto<AgentRunDto>> {
        runReads += runId
        readStarted?.complete(Unit)
        try {
            readGate?.await()
            if (readFailure != 0) return failed(readFailure)
            return runs[runId]?.let(::ok) ?: failed(404)
        } finally { readFinished?.complete(Unit) }
    }
    override suspend fun answer(authorization: String, runId: String, body: AgentAnswerDto): Response<EnvelopeDto<AgentRunDto>> {
        answers += runId to body
        val current = runs[runId] ?: return failed(404)
        if (current.question?.id != body.questionId) return failed(409)
        val now = "2026-10-05T09:00:00Z"
        val approval = AgentApprovalDto("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", runId, current.spaceId, "tasks.update", "low",
            "Update only the task title.", listOf(AgentFieldDto("Title", body.answer), AgentFieldDto("Due date", "2026-10-06")),
            "pending", null, null, now, "2026-10-05T10:00:00Z", null, "1", "\"${"a".repeat(64)}\"")
        val changed = current.copy(status = "waiting_for_approval", question = null, approval = approval, updatedAt = now)
        runs[runId] = changed
        return ok(changed)
    }
    override suspend fun stop(authorization: String, runId: String, body: Map<String, String>) = unavailable<AgentRunDto>()
    override suspend fun approve(authorization: String, approvalId: String, key: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>> {
        decisions += Triple(approvalId, key, etag)
        decided[approvalId to key]?.let { return ok(it) }
        if (loseApprovalBeforeCommit) { loseApprovalBeforeCommit = false; throw IOException("Synthetic lost approval response before commit") }
        val current = runs.values.firstOrNull { it.approval?.id == approvalId } ?: return failed(404)
        val approval = current.approval ?: return failed(404)
        if (approval.etag != etag || approval.status != "pending") return failed(409)
        effects += 1
        val changed = current.copy(status = "completed", outcome = "action_completed", answer = "Updated the task title.",
            updatedAt = "2026-10-05T09:00:00Z", finishedAt = "2026-10-05T09:00:00Z",
            approval = approval.copy(status = "approved", decidedAt = "2026-10-05T09:00:00Z", resultRef = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                version = "2", etag = "\"${"b".repeat(64)}\""))
        runs[current.id] = changed
        decided[approvalId to key] = changed
        if (loseApprovalResponse) { loseApprovalResponse = false; throw IOException("Synthetic lost approval response") }
        return ok(changed)
    }
    override suspend fun reject(authorization: String, approvalId: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>> {
        val current = runs.values.firstOrNull { it.approval?.id == approvalId } ?: return failed(404)
        val approval = current.approval ?: return failed(404)
        if (approval.etag != etag || approval.status != "pending") return failed(409)
        val now = "2026-10-05T09:00:00Z"
        val changed = current.copy(status = "cancelled", stopReason = "rejected", answer = "Nothing was changed.", finishedAt = now,
            updatedAt = now, approval = approval.copy(status = "rejected", reason = "rejected", decidedAt = now, version = "2",
                etag = "\"${"c".repeat(64)}\""))
        runs[current.id] = changed
        return ok(changed)
    }
    override suspend fun memories(authorization: String) = unavailable<List<AgentMemoryDto>>()
    override suspend fun forget(authorization: String, memoryId: String) = unavailable<AgentDeletedDto>()
}

internal suspend fun MessagingViewModel.finishTestWork() {
    bind(null)
    withTimeout(5000) { requireNotNull(viewModelScope.coroutineContext[Job]).cancelAndJoin() }
}

@OptIn(ExperimentalCoroutinesApi::class)
class MessagingTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val conversationId = "5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01"
    private val spaceChat = ConversationDto(conversationId, fixture.spaceId, "Morgan family", "space", "Morgan family", emptyList(), true, "server_encrypted", "0", "0", 0, null, "2026-09-19T10:00:00Z")
    private val directChat = spaceChat.copy(kind = "direct", title = "Sam", participants = listOf(ParticipantDto(fixture.accountId, "Alex"), ParticipantDto(fixture.recipientId, "Sam")))

    private fun message(position: Int, mine: Boolean = false, key: String? = null, body: String = "Message $position") = MessageDto(
        UUID(7, position.toLong()).toString(), conversationId, position.toString(),
        if (mine) fixture.accountId else fixture.recipientId, if (mine) "Alex" else "Sam", mine,
        if (mine) key ?: UUID.randomUUID().toString() else null, "sent", body,
        Instant.parse("2026-09-19T10:00:00Z").plusSeconds(position.toLong()).toString(), null,
    )

    inner class FakeApi : MessagingApi {
        var conversation = spaceChat
        val stored = mutableListOf<MessageDto>()
        var listed: List<ConversationDto>? = null
        var listFailure = 0
        var readFailure = 0
        var readStarted: CompletableDeferred<Unit>? = null
        var readGate: CompletableDeferred<Unit>? = null
        var sendFailure = 0
        var dropAfterCommit = false
        var rawPage: List<MessageDto>? = null
        var rawPagination = PaginationDto(null, false)
        val opens = mutableListOf<OpenConversationDto>()
        val sends = mutableListOf<Pair<String, SendMessageDto>>()
        val pages = mutableListOf<Pair<String?, String?>>()
        val reads = mutableListOf<String>()
        val deletes = mutableListOf<String>()

        fun add(item: MessageDto) {
            stored += item
            conversation = conversation.copy(lastPosition = item.position, lastMessageAt = item.createdAt)
        }

        private fun <Value> ok(value: Value, pagination: PaginationDto? = null, unread: Int? = null): Response<EnvelopeDto<Value>> =
            Response.success(EnvelopeDto(value, null, pagination, unread))

        private fun <Value> failed(status: Int, code: String = "SYNTHETIC"): Response<EnvelopeDto<Value>> =
            Response.error(status, """{"error":{"code":"$code","message":"Synthetic $code","details":{}}}""".toResponseBody("application/json".toMediaType()))

        override suspend fun open(authorization: String, spaceId: String, body: OpenConversationDto): Response<EnvelopeDto<ConversationDto>> {
            opens += body
            return ok(conversation)
        }

        override suspend fun conversations(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<ConversationDto>>> {
            if (listFailure != 0) return failed(listFailure)
            val items = listed ?: listOf(conversation)
            return ok(items, PaginationDto(null, false), items.sumOf { it.unreadCount })
        }

        override suspend fun conversation(authorization: String, conversationId: String): Response<EnvelopeDto<ConversationDto>> {
            readStarted?.complete(Unit)
            readGate?.await()
            return if (readFailure != 0) failed(readFailure, "NOT_FOUND") else ok(conversation)
        }

        override suspend fun messages(authorization: String, conversationId: String, before: String?, after: String?, limit: Int): Response<EnvelopeDto<List<MessageDto>>> {
            pages += before to after
            if (readFailure != 0) return failed(readFailure, "NOT_FOUND")
            rawPage?.let { return ok(it, rawPagination) }
            val sorted = stored.sortedBy { it.position.toLong() }
            if (after != null) {
                val newer = sorted.filter { it.position.toLong() > after.toLong() }
                val page = newer.take(limit)
                return ok(page, PaginationDto(if (newer.size > limit) page.last().position else null, newer.size > limit))
            }
            val older = if (before == null) sorted else sorted.filter { it.position.toLong() < before.toLong() }
            val page = older.takeLast(limit)
            return ok(page, PaginationDto(if (older.size > limit) page.first().position else null, older.size > limit))
        }

        override suspend fun send(authorization: String, conversationId: String, key: String, body: SendMessageDto): Response<EnvelopeDto<MessageDto>> {
            sends += key to body
            if (sendFailure != 0) return failed(sendFailure, if (sendFailure == 429) "MESSAGE_RATE_LIMITED" else "SYNTHETIC")
            val saved = stored.firstOrNull { it.clientMessageId == key } ?: message(stored.size + 1, mine = true, key = key, body = body.body).let { created ->
                val original = body.replyTo?.let { id -> stored.firstOrNull { it.id == id } }
                if (original == null) created else created.copy(replyTo = ReplyDto(original.id, "sent", original.position, original.senderName, original.body))
            }.let { created ->
                // An @agent message is answered before the send returns (DEC-046); agentOutcomes lists what becomes of each.
                val outcome = if (mentionsAgent(created.body.orEmpty())) agentOutcomes.removeFirstOrNull() else null
                if (outcome == null) created else created.copy(agentRequest = AgentRequestDto(outcome, if (outcome in setOf("answered", "private", "waiting")) UUID.randomUUID().toString() else null))
            }.also { created -> add(created); if (created.agentRequest?.status == "answered") answerAgent(created) }
            return if (dropAfterCommit) failed(503) else ok(saved)
        }

        override suspend fun delete(authorization: String, conversationId: String, messageId: String, body: Map<String, String>): Response<EnvelopeDto<MessageDto>> {
            deletes += messageId
            val index = stored.indexOfFirst { it.id == messageId }
            if (index < 0) return failed(404, "NOT_FOUND")
            stored[index] = stored[index].copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z")
            return ok(stored[index])
        }

        override suspend fun markRead(authorization: String, conversationId: String, body: MarkReadDto): Response<EnvelopeDto<ConversationDto>> {
            reads += body.throughPosition
            conversation = conversation.copy(readPosition = body.throughPosition, unreadCount = 0)
            return ok(conversation)
        }

        // Edits and reactions (T162): each change raises the revision, as the API does.
        val edits = mutableListOf<EditMessageDto>()
        val reactions = mutableListOf<ReactDto>()
        var actionFailure: String? = null

        override suspend fun edit(authorization: String, conversationId: String, messageId: String, body: EditMessageDto): Response<EnvelopeDto<MessageDto>> {
            edits += body
            actionFailure?.let { return failed(409, it) }
            val index = stored.indexOfFirst { it.id == messageId }
            if (index < 0) return failed(404, "NOT_FOUND")
            stored[index] = stored[index].copy(body = body.body, editedAt = "2026-09-19T10:20:00Z", revision = stored[index].version + 1)
            return ok(stored[index])
        }

        override suspend fun react(authorization: String, conversationId: String, messageId: String, body: ReactDto): Response<EnvelopeDto<MessageDto>> {
            reactions += body
            actionFailure?.let { return failed(409, it) }
            val index = stored.indexOfFirst { it.id == messageId }
            if (index < 0) return failed(404, "NOT_FOUND")
            val others = stored[index].reactionList.filter { it.reaction != body.reaction }
            val next = (if (body.on) others + ReactionDto(body.reaction, 1, true) else others).sortedBy { REACTIONS.indexOf(it.reaction) }
            stored[index] = stored[index].copy(reactions = next, revision = stored[index].version + 1)
            return ok(stored[index])
        }

        // @agent in a chat (DEC-046).
        val agentOutcomes = ArrayDeque<String>()
        val agentAsks = mutableListOf<String>()

        /** The Space's agent replies under the request, as a message nobody in the chat wrote. */
        fun answerAgent(asked: MessageDto) = add(message(stored.size + 1, body = "Agent answer ${stored.count { it.fromAgent } + 1}").copy(
            senderName = "Agent", fromAgent = true, replyTo = ReplyDto(asked.id, "sent", asked.position, asked.senderName, asked.body)))

        override suspend fun askAgent(authorization: String, conversationId: String, messageId: String, body: Map<String, String>): Response<EnvelopeDto<MessageDto>> {
            agentAsks += messageId
            val index = stored.indexOfFirst { it.id == messageId && it.agentRequest != null }
            if (index < 0) return failed(404, "NOT_FOUND")
            if (stored[index].agentRequest?.status in setOf("pending", "failed")) {
                stored[index] = stored[index].copy(agentRequest = AgentRequestDto("answered", UUID.randomUUID().toString()))
                answerAgent(stored[index])
            }
            return ok(stored[index])
        }

        val shares = mutableListOf<String>()

        // DEC-061: sharing turns a private answer into one everyone in the chat reads.
        override suspend fun shareAgentAnswer(authorization: String, conversationId: String, messageId: String, body: Map<String, String>): Response<EnvelopeDto<MessageDto>> {
            shares += messageId
            val index = stored.indexOfFirst { it.id == messageId && it.agentRequest != null }
            if (index < 0) return failed(404, "NOT_FOUND")
            if (stored[index].agentRequest?.status == "private") {
                stored[index] = stored[index].copy(agentRequest = stored[index].agentRequest!!.copy(status = "answered"))
                answerAgent(stored[index])
            }
            return ok(stored[index])
        }
    }

    private val api = FakeApi()
    private val repository = MessagingRepository(api, fixture.accounts)
    private var model: MessagingViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup(): Unit = runBlocking {
        try { model?.finishTestWork() } finally { Dispatchers.resetMain() }
    }

    private suspend fun idle(current: MessagingViewModel) = withTimeout(5000) { current.state.first { !it.busy } }

    private suspend fun ready(visible: Boolean = true, open: Boolean = true): MessagingViewModel {
        val current = MessagingViewModel(repository, fixture.repository, agentRuns = AgentRepository(MessagingAgentApi(), fixture.accounts)); model = current
        current.bind(fixture.accountId)
        if (visible) current.resume()
        idle(current)
        if (open) { current.select(current.state.value.conversations.first()); idle(current) }
        return current
    }

    private fun invalid(block: suspend () -> Unit) {
        val failure = assertThrows(IdentityFailure::class.java) { runBlocking { block() } }
        assertEquals("INVALID_RESPONSE", failure.code)
    }

    private val agentRunId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    private fun reviewRun(id: String = agentRunId, needsTitle: Boolean = false): AgentRunDto {
        val now = "2026-10-05T09:00:00Z"
        val approval = if (needsTitle) null else AgentApprovalDto("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", id, fixture.spaceId,
            "tasks.update", "low", "Update only the task title.",
            listOf(AgentFieldDto("Task", "Water the plants"), AgentFieldDto("Title", "Water the garden"), AgentFieldDto("Due date", "6 October 2026")),
            "pending", null, null, now, "2026-10-05T10:00:00Z", null, "1", "\"${"a".repeat(64)}\"")
        return AgentRunDto(id, fixture.spaceId, "Change the task title and keep its due date", if (needsTitle) "waiting_for_user" else "waiting_for_approval",
            null, null, null, if (needsTitle) AgentQuestionDto("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "What should the task be called?", "2026-10-05T10:00:00Z") else null,
            approval, now, now, null, "1")
    }

    private fun sourceFor(runId: String, status: String = "private", position: Int = 1) =
        message(position, mine = true, key = UUID(8, position.toLong()).toString(), body = "@agent Change the task title").copy(
            agentRequest = AgentRequestDto(status, runId),
        )

    private suspend fun readyWithAgent(agentApi: MessagingAgentApi): MessagingViewModel {
        val current = MessagingViewModel(repository, fixture.repository, agentRuns = AgentRepository(agentApi, fixture.accounts)); model = current
        current.bind(fixture.accountId); current.resume(); idle(current)
        current.select(current.state.value.conversations.first()); idle(current)
        return current
    }

    @Test fun privateReviewLoadsOnlyFromTheRequestersOwnMessage() = runBlocking {
        val agentApi = MessagingAgentApi()
        val run = reviewRun()
        agentApi.runs[run.id] = run
        val other = message(1).copy(agentRequest = null)
        val source = sourceFor(run.id, position = 2)
        api.add(other); api.add(source)
        val current = readyWithAgent(agentApi)

        current.openAgentReview(other.id); idle(current)
        assertTrue(agentApi.runReads.isEmpty())
        assertNull(current.state.value.chat!!.agentReview)

        current.openAgentReview(source.id); idle(current)
        val review = current.state.value.chat!!.agentReview!!
        assertEquals(listOf(run.id), agentApi.runReads)
        assertEquals("tasks.update", review.run!!.approval!!.toolName)
        assertEquals("Water the garden", review.run!!.approval!!.fields[1].value)
        assertEquals("Update only the task title.", review.run!!.approval!!.summary)
    }

    @Test fun taskTitleAnswerUsesTheExactQuestionAndShowsTheReturnedUpdateReview() = runBlocking {
        val agentApi = MessagingAgentApi()
        val run = reviewRun(needsTitle = true)
        agentApi.runs[run.id] = run
        val source = sourceFor(run.id, status = "waiting")
        api.add(source)
        val current = readyWithAgent(agentApi)
        current.openAgentReview(source.id); idle(current)

        assertEquals("What should the task be called?", current.state.value.chat!!.agentReview!!.run!!.question!!.text)
        val oversized = "\uD83D\uDE00".repeat(501)
        current.agentReviewAnswer(oversized)
        current.answerAgentReview(); idle(current)
        assertEquals(oversized, current.state.value.chat!!.agentReview!!.answer)
        assertTrue(agentApi.answers.isEmpty())
        current.agentReviewAnswer("  Picnic groceries  ")
        current.answerAgentReview(); idle(current)
        assertEquals(AgentAnswerDto("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Picnic groceries"), agentApi.answers.single().second)
        val review = current.state.value.chat!!.agentReview!!.run!!
        assertEquals("tasks.update", review.approval!!.toolName)
        assertEquals("Picnic groceries", review.approval!!.fields.first { it.label == "Title" }.value)
        assertEquals("2026-10-06", review.approval!!.fields.first { it.label == "Due date" }.value)
    }

    @Test fun unknownApprovalKeepsItsKeyAndEtagAcrossClosingAndReopeningReview() = runBlocking {
        val agentApi = MessagingAgentApi()
        val run = reviewRun()
        agentApi.runs[run.id] = run
        val source = sourceFor(run.id)
        api.add(source)
        val current = readyWithAgent(agentApi)
        current.openAgentReview(source.id); idle(current)
        agentApi.loseApprovalBeforeCommit = true
        current.decideAgentReview(true); idle(current)
        val command = current.state.value.chat!!.agentReview!!.command as AgentCommand.Decide
        assertEquals(AgentIssue.UNCERTAIN, current.state.value.chat!!.agentReview!!.issue)
        assertTrue(current.state.value.chat!!.agentReview!!.run!!.awaitingApproval)

        current.closeAgentReview()
        current.openAgentReview(source.id); idle(current)
        assertEquals(command, current.state.value.chat!!.agentReview!!.command)
        current.decideAgentReview(false)
        assertEquals(1, agentApi.decisions.size)
        current.retryAgentReview(); idle(current)

        assertEquals(agentApi.decisions[0], agentApi.decisions[1])
        assertEquals(command.key, agentApi.decisions[1].second)
        assertEquals(command.etag, agentApi.decisions[1].third)
        assertEquals(1, agentApi.effects)
        assertEquals("completed", current.state.value.chat!!.agentReview!!.run!!.status)
        assertNull(current.state.value.chat!!.agentReview!!.command)
    }

    @Test fun staleRunReadDoesNotReopenAClosedPanel() = runBlocking {
        val agentApi = MessagingAgentApi()
        val run = reviewRun()
        agentApi.runs[run.id] = run
        agentApi.readStarted = CompletableDeferred()
        agentApi.readGate = CompletableDeferred()
        agentApi.readFinished = CompletableDeferred()
        val source = sourceFor(run.id)
        api.add(source)
        val current = readyWithAgent(agentApi)
        current.openAgentReview(source.id)
        withTimeout(5000) { agentApi.readStarted!!.await() }
        current.closeAgentReview()
        agentApi.readGate!!.complete(Unit)
        withTimeout(5000) { agentApi.readFinished!!.await() }
        assertNull(current.state.value.chat!!.agentReview)
    }

    @Test fun missingRunAndDeletedSourceClearThePrivateReview() = runBlocking {
        val agentApi = MessagingAgentApi()
        val source = sourceFor(agentRunId)
        api.add(source)
        val current = readyWithAgent(agentApi)
        current.openAgentReview(source.id); idle(current)
        assertNull(current.state.value.chat!!.agentReview)

        val run = reviewRun(id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
        val replacement = sourceFor(run.id, position = 2)
        agentApi.runs[run.id] = run
        api.add(replacement)
        current.pollNow(); idle(current)
        current.openAgentReview(replacement.id); idle(current)
        assertNotNull(current.state.value.chat!!.agentReview)

        api.stored[1] = api.stored[1].copy(status = "deleted", body = null, deletedAt = "2026-10-05T09:01:00Z", agentRequest = null)
        current.pollNow(); idle(current)
        assertNull(current.state.value.chat!!.agentReview)
    }

    @Test fun conversationAccessLossAndAccountChangeClearPrivateReviewState() = runBlocking {
        val agentApi = MessagingAgentApi()
        val run = reviewRun()
        agentApi.runs[run.id] = run
        val source = sourceFor(run.id)
        api.add(source)
        val current = readyWithAgent(agentApi)
        current.openAgentReview(source.id); idle(current)
        current.closeChat()
        assertNull(current.state.value.chat)

        current.select(current.state.value.conversations.first()); idle(current)
        current.openAgentReview(source.id); idle(current)
        assertNotNull(current.state.value.chat!!.agentReview)
        api.readFailure = 404
        current.pollNow(); idle(current)
        assertTrue(current.state.value.chat!!.denied)
        assertNull(current.state.value.chat!!.agentReview)

        current.bind(fixture.recipientId)
        idle(current)
        assertNull(current.state.value.chat)
        assertTrue(current.state.value.requiresSignIn)
    }

    @Test fun rejectsInconsistentConversationFacts() {
        for (bad in listOf(
            spaceChat.copy(readPosition = "1"), spaceChat.copy(lastMessageAt = "2026-09-19T10:01:00Z"),
            spaceChat.copy(protection = "end_to_end"), spaceChat.copy(kind = "direct"),
            directChat.copy(participants = listOf(ParticipantDto(fixture.accountId, "Alex"), ParticipantDto(fixture.accountId, "Alex"))),
            directChat.copy(participants = listOf(ParticipantDto(fixture.recipientId, "Sam"), ParticipantDto(fixture.invitationId, "Kim"))),
            spaceChat.copy(id = fixture.invitationId), spaceChat.copy(unreadCount = -1), spaceChat.copy(lastPosition = "01"),
        )) {
            api.conversation = bad
            invalid { repository.read(fixture.accountId, conversationId) }
        }
        api.conversation = directChat
        assertEquals("Sam", runBlocking { repository.read(fixture.accountId, conversationId) }.title)
    }

    @Test fun rejectsInconsistentMessagesAndPages() {
        val valid = message(2, mine = true)
        for (bad in listOf(
            valid.copy(body = null), valid.copy(status = "deleted"), valid.copy(clientMessageId = null),
            valid.copy(mine = false, clientMessageId = null), valid.copy(conversationId = fixture.spaceId),
            valid.copy(position = "0"), valid.copy(body = "x".repeat(MAX_MESSAGE_CHARACTERS + 1)),
            valid.copy(status = "unavailable", body = null, deletedAt = "2026-09-19T11:00:00Z"),
        )) {
            api.rawPage = listOf(bad)
            invalid { repository.messages(fixture.accountId, conversationId) }
        }
        api.rawPage = listOf(message(3), message(2))
        invalid { repository.messages(fixture.accountId, conversationId) }
        api.rawPage = listOf(message(5))
        invalid { repository.messages(fixture.accountId, conversationId, before = "4") }
        invalid { repository.messages(fixture.accountId, conversationId, after = "5") }
        api.rawPage = listOf(message(2), message(3)); api.rawPagination = PaginationDto("3", true)
        invalid { repository.messages(fixture.accountId, conversationId) }
        api.rawPagination = PaginationDto("2", true)
        assertEquals("2", runBlocking { repository.messages(fixture.accountId, conversationId) }.nextCursor)
        val deleted = message(4, mine = true).copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z")
        api.rawPage = listOf(deleted); api.rawPagination = PaginationDto(null, false)
        assertEquals("deleted", runBlocking { repository.messages(fixture.accountId, conversationId) }.items.single().status)
    }

    @Test fun fixtureCleanupFinishesAnUnansweredReadBeforeResettingMain() = runBlocking {
        val current = ready()
        val scope = requireNotNull(current.viewModelScope.coroutineContext[Job])
        val entered = CompletableDeferred<Unit>()
        val response = CompletableDeferred<Unit>()
        api.readStarted = entered
        api.readGate = response
        current.pollNow()
        withTimeout(5000) { entered.await() }
        current.finishTestWork()
        assertTrue(scope.isCompleted)
        assertTrue(scope.children.none())
        assertNull(current.state.value.accountId)
        assertTrue("Cleanup must cancel the read without releasing its answer.", !response.isCompleted)
    }

    @Test fun lostSendResponseRetriesTheSameKeyAndBodyOnce() = runBlocking {
        val current = ready()
        current.draft("  Bring water\r\n"); api.dropAfterCommit = true
        current.send(); idle(current)
        val pending = current.state.value.chat!!.pending.single()
        assertEquals(SendState.UNKNOWN, pending.state)
        assertEquals("Bring water", pending.intent.body)
        assertEquals("", current.state.value.chat!!.draft)
        api.dropAfterCommit = false
        current.retry(pending.intent.key); idle(current)
        assertEquals(2, api.sends.size)
        assertEquals(api.sends[0], api.sends[1])
        assertEquals(pending.intent.key, api.sends[1].first)
        assertEquals(1, api.stored.size)
        val chat = current.state.value.chat!!
        assertTrue(chat.pending.isEmpty())
        assertEquals(listOf("Bring water"), chat.messages.map { it.body })
    }

    @Test fun pollingConfirmsAnUnknownSendWithoutRetrying() = runBlocking {
        val current = ready()
        current.draft("Arriving at six"); api.dropAfterCommit = true
        current.send(); idle(current)
        assertEquals(SendState.UNKNOWN, current.state.value.chat!!.pending.single().state)
        api.dropAfterCommit = false
        current.pollNow(); idle(current)
        assertTrue(current.state.value.chat!!.pending.isEmpty())
        assertEquals(1, api.sends.size)
        assertEquals("Arriving at six", current.state.value.chat!!.messages.single().body)
    }

    @Test fun definiteRejectionIsNotRetriedAndCanBeEdited() = runBlocking {
        val current = ready()
        current.draft("Too fast"); api.sendFailure = 429
        current.send(); idle(current)
        val failed = current.state.value.chat!!.pending.single()
        assertEquals(SendState.FAILED, failed.state)
        current.retry(failed.intent.key)
        assertEquals(1, api.sends.size)
        current.draft("Other draft"); current.editFailed(failed.intent.key)
        assertEquals(1, current.state.value.chat!!.pending.size)
        current.draft(""); current.editFailed(failed.intent.key)
        assertEquals("Too fast", current.state.value.chat!!.draft)
        assertTrue(current.state.value.chat!!.pending.isEmpty())
    }

    @Test fun invalidDraftsAreNotSent() = runBlocking {
        val current = ready()
        for (bad in listOf("   ", "x".repeat(MAX_MESSAGE_CHARACTERS + 1), "spoof\u202Eevil", "bell\u0007")) {
            current.draft(bad); current.send()
        }
        assertTrue(api.sends.isEmpty())
        assertEquals(MessageProblem.CONTROL, messageProblem("spoof\u202Eevil"))
        assertNull(messageProblem("Line one\n\tLine two \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67"))
        assertNull(messageProblem("\uD83D\uDE00".repeat(MAX_MESSAGE_CHARACTERS)))
    }

    @Test fun visiblePollFillsGapsAndMarksNewestRead() = runBlocking {
        (1..3).forEach { api.add(message(it)) }
        val current = ready()
        assertEquals(listOf("3"), api.reads)
        (4..43).forEach { api.add(message(it)) }
        api.pages.clear()
        current.pollNow(); idle(current)
        assertEquals((1..43).map { it.toString() }, current.state.value.chat!!.messages.map { it.position })
        // T101: the gap after 3 (4 to 33) already joins the newest page (14 to 43), so no further page is asked for.
        assertEquals(listOf(null to null, null to "3"), api.pages)
        assertEquals(listOf("3", "43"), api.reads)
    }

    // T101: a backlog longer than one catch-up can fetch is shown without a hole, and only what is shown is marked read.
    @Test fun aLongBacklogIsShownWithoutAHoleAndOnlyWhatIsShownIsMarkedRead() = runBlocking {
        api.add(message(1))
        val current = ready()
        (2..332).forEach { api.add(message(it)) }
        current.pollNow(); idle(current)
        assertEquals((1..301).map { it.toString() }, current.state.value.chat!!.messages.map { it.position })
        assertEquals("301", api.reads.last())
        current.pollNow(); idle(current)
        assertEquals((1..332).map { it.toString() }, current.state.value.chat!!.messages.map { it.position })
        assertEquals("332", api.reads.last())
    }

    @Test fun hiddenChatIsNotMarkedRead() = runBlocking {
        (1..2).forEach { api.add(message(it)) }
        val current = ready(visible = false)
        assertEquals(2, current.state.value.chat!!.messages.size)
        assertTrue(api.reads.isEmpty())
        current.resume(); idle(current)
        assertEquals(listOf("2"), api.reads)
        current.pause()
        api.add(message(3)); current.pollNow(); idle(current)
        assertEquals(listOf("2"), api.reads)
    }

    @Test fun earlierPagesLoadBackwardByPosition() = runBlocking {
        (1..35).forEach { api.add(message(it)) }
        val current = ready()
        assertEquals("6", current.state.value.chat!!.earlierCursor)
        current.loadEarlier(); idle(current)
        val chat = current.state.value.chat!!
        assertEquals((1..35).map { it.toString() }, chat.messages.map { it.position })
        assertNull(chat.earlierCursor)
    }

    @Test fun accessLossClearsMessagesDraftAndPendingSends() = runBlocking {
        (1..2).forEach { api.add(message(it)) }
        val current = ready()
        current.draft("Unsent"); api.sendFailure = 503
        current.send(); idle(current)
        current.draft("Private draft")
        api.readFailure = 404
        current.pollNow(); idle(current)
        val chat = current.state.value.chat!!
        assertTrue(chat.denied)
        assertTrue(chat.messages.isEmpty() && chat.pending.isEmpty())
        assertEquals("", chat.draft)
        current.draft("After denial"); current.send()
        assertEquals("", current.state.value.chat!!.draft)
        assertEquals(1, api.sends.size)
    }

    @Test fun deletionNeedsConfirmationAndOnlyTargetsOwnSentMessages() = runBlocking {
        api.add(message(1)); api.add(message(2, mine = true))
        val current = ready()
        val (theirs, mine) = current.state.value.chat!!.messages
        current.askDelete(theirs)
        assertNull(current.state.value.chat!!.confirmDelete)
        current.askDelete(mine); current.cancelDelete(); current.confirmDelete()
        assertTrue(api.deletes.isEmpty())
        current.askDelete(mine)
        assertEquals(mine.id, current.state.value.chat!!.confirmDelete)
        current.confirmDelete(); idle(current)
        assertEquals(listOf(mine.id), api.deletes)
        val shown = current.state.value.chat!!.messages.last()
        assertEquals("deleted", shown.status)
        assertNull(shown.body)
        current.askDelete(shown)
        assertNull(current.state.value.chat!!.confirmDelete)
    }

    // T162 (DEC-033): replies, reactions and edits.
    @Test fun aReplyNamesWhatItAnswersAndAPlainMessageSendsOnlyItsBody() = runBlocking {
        api.add(message(1, body = "Dinner at 8"))
        val current = ready()
        current.startReply(current.state.value.chat!!.messages.first())
        current.draft("Works for me"); current.send(); idle(current)
        assertEquals(SendMessageDto("Works for me", message(1).id), api.sends.last().second)
        val reply = current.state.value.chat!!.messages.last().replyTo!!
        assertEquals("Dinner at 8", reply.excerpt)
        assertNull(current.state.value.chat!!.replyingTo)
        current.draft("And dessert"); current.send(); idle(current)
        assertNull(api.sends.last().second.replyTo)
    }

    @Test fun reactionsAndEditsAreSavedAndAnOlderCopyCannotUndoThem() = runBlocking {
        api.add(message(1, mine = true, body = "Dinner at 8").copy(createdAt = Instant.now().toString()))
        val current = ready()
        val mine = current.state.value.chat!!.messages.first()
        current.react(mine, "thanks", true); idle(current)
        assertEquals(listOf(ReactDto("thanks", true)), api.reactions)
        assertEquals(listOf(ReactionDto("thanks", 1, true)), current.state.value.chat!!.messages.first().reactionList)
        val beforeEdit = api.stored.toList()
        current.startEdit(mine); current.editDraft("  Dinner at 9 "); current.saveEdit(); idle(current)
        assertEquals(listOf(EditMessageDto("Dinner at 9")), api.edits)
        val shown = current.state.value.chat!!.messages.first()
        assertEquals("Dinner at 9", shown.body); assertEquals(3, shown.version); assertNull(current.state.value.chat!!.editing)
        // A page read before the edit arrives late.
        api.rawPage = beforeEdit
        current.pollNow(); idle(current)
        assertEquals("Dinner at 9", current.state.value.chat!!.messages.first().body)
        api.rawPage = null
        current.react(current.state.value.chat!!.messages.first(), "fire", true)
        assertEquals(1, api.reactions.size)
    }

    @Test fun onlyOwnRecentMessagesCanBeEditedAndAClosedWindowIsExplained() = runBlocking {
        api.add(message(1)); api.add(message(2, mine = true))
        api.add(message(3, mine = true).copy(createdAt = Instant.now().toString()))
        val current = ready()
        val (theirs, old, recent) = current.state.value.chat!!.messages
        current.startEdit(theirs); current.startEdit(old)
        assertNull(current.state.value.chat!!.editing)
        current.startEdit(recent)
        assertEquals(recent.id, current.state.value.chat!!.editing)
        api.actionFailure = "EDIT_WINDOW_CLOSED"
        current.editDraft("Too late"); current.saveEdit(); idle(current)
        assertEquals("This message can no longer be edited: 15 minutes have passed.", current.state.value.chat!!.error)
        assertNull(current.state.value.chat!!.editing)
        assertEquals("Message 3", current.state.value.chat!!.messages.last().body)
        current.pollNow(); idle(current)
        assertEquals("This message can no longer be edited: 15 minutes have passed.", current.state.value.chat!!.error)
        api.actionFailure = null
        current.react(recent, "thanks", true); idle(current)
        assertNull(current.state.value.chat!!.error)
        assertEquals(listOf(ReactionDto("thanks", 1, true)), current.state.value.chat!!.messages.last().reactionList)
    }

    @Test fun aSuccessfulPollClearsAnEarlierReadFailure() = runBlocking {
        api.add(message(1))
        val current = ready()
        api.readFailure = 503
        current.pollNow(); idle(current)
        assertNotNull(current.state.value.chat!!.error)
        api.readFailure = 0
        current.pollNow(); idle(current)
        assertNull(current.state.value.chat!!.error)
        assertEquals("Message 1", current.state.value.chat!!.messages.single().body)
    }

    @Test fun repliesReactionsAndEditsMustBeConsistent() {
        val sent = message(1, mine = true)
        for (bad in listOf(
            sent.copy(reactions = listOf(ReactionDto("thanks", 1, false), ReactionDto("like", 1, false))),
            sent.copy(reactions = listOf(ReactionDto("fire", 1, false))),
            sent.copy(reactions = listOf(ReactionDto("like", 0, false))),
            sent.copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z", reactions = listOf(ReactionDto("like", 1, false))),
            sent.copy(replyTo = ReplyDto(sent.id, "sent", "1", "Sam", "Hi")),
            sent.copy(replyTo = ReplyDto(UUID(9, 9).toString(), "sent", "1", "Sam", null)),
            sent.copy(replyTo = ReplyDto(UUID(9, 9).toString(), "unavailable", null, "Sam", null)),
        )) {
            api.rawPage = listOf(bad)
            invalid { repository.messages(fixture.accountId, conversationId) }
        }
        api.rawPage = listOf(sent.copy(replyTo = ReplyDto(UUID(9, 9).toString(), "unavailable", null, null, null), reactions = listOf(ReactionDto("like", 2, true))))
        runBlocking { assertEquals(1, repository.messages(fixture.accountId, conversationId).items.size) }
    }

    // T82: without the app-wide request lock, a page read before a deletion can arrive after it.
    @Test fun aPageReadBeforeADeletionDoesNotBringTheMessageBack() = runBlocking {
        api.add(message(1)); api.add(message(2, mine = true))
        val current = ready()
        val before = api.stored.toList()
        current.askDelete(current.state.value.chat!!.messages.last()); current.confirmDelete(); idle(current)
        api.rawPage = before
        current.pollNow(); idle(current)
        val shown = current.state.value.chat!!.messages.last()
        assertEquals("deleted", shown.status)
        assertNull(shown.body)
    }

    @Test fun aDeletedCopyIsKeptWhicheverCopyArrivesLast() {
        val sent = message(1, mine = true)
        val deleted = sent.copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z")
        val newer = message(2)
        assertEquals(listOf(deleted), mergeMessages(listOf(deleted), listOf(sent)))
        assertEquals(listOf(deleted), mergeMessages(listOf(sent), listOf(deleted)))
        assertEquals(listOf(deleted, newer), mergeMessages(listOf(deleted), listOf(sent, newer)))
    }

    // T82: a list read that began before the open chat was marked read is read again, so the chat is not shown unread once more.
    @Test fun aListReadFromBeforeTheChatWasMarkedReadIsReadAgain() = runBlocking {
        (1..2).forEach { api.add(message(it)) }
        api.conversation = api.conversation.copy(unreadCount = 2)
        val holding = AtomicBoolean(false)
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>(); val marked = CompletableDeferred<Unit>()
        val held = object : MessagingApi by api {
            override suspend fun conversations(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<ConversationDto>>> {
                val answer = api.conversations(authorization, cursor, limit)
                if (holding.compareAndSet(true, false)) { entered.complete(Unit); release.await() }
                return answer
            }
            override suspend fun markRead(authorization: String, conversationId: String, body: MarkReadDto): Response<EnvelopeDto<ConversationDto>> =
                api.markRead(authorization, conversationId, body).also { marked.complete(Unit) }
        }
        val current = MessagingViewModel(MessagingRepository(held, fixture.accounts), fixture.repository,
            agentRuns = AgentRepository(MessagingAgentApi(), fixture.accounts)); model = current
        current.bind(fixture.accountId); current.resume(); idle(current)
        assertEquals(2, current.state.value.unreadCount)
        holding.set(true)
        current.refreshList(quiet = true)
        withTimeout(5000) { entered.await() }
        current.select(current.state.value.conversations.single())
        // Without the lock the chat is read and marked read meanwhile; with it, that waits for the list.
        withTimeoutOrNull(1000) { marked.await() }
        release.complete(Unit)
        withTimeout(5000) { marked.await() }
        idle(current)
        assertEquals(listOf("2"), api.reads)
        assertEquals(0, current.state.value.conversations.single().unreadCount)
        assertEquals(0, current.state.value.unreadCount)
    }

    @Test fun readOnlyConversationRefusesDrafts() = runBlocking {
        api.conversation = spaceChat.copy(canSend = false)
        val current = ready()
        current.draft("Hello"); current.send()
        assertEquals("", current.state.value.chat!!.draft)
        assertTrue(api.sends.isEmpty())
    }

    @Test fun entrySpaceOpensItsSpaceChat() = runBlocking {
        val current = MessagingViewModel(repository, fixture.repository, agentRuns = AgentRepository(MessagingAgentApi(), fixture.accounts)); model = current
        current.bind(fixture.accountId, fixture.spaceId); idle(current)
        assertEquals(listOf(OpenConversationDto("space")), api.opens)
        assertEquals(conversationId, current.state.value.chat?.conversation?.id)
        assertEquals(2, current.state.value.members.size)
    }

    @Test fun directConversationOnlyForAnotherListedMember() = runBlocking {
        val current = ready(open = false)
        current.selectSpace(fixture.spaceId); idle(current)
        current.openDirect(fixture.ownerMember)
        current.openDirect(SpaceMemberDto(fixture.invitationId, "Kim", "member", fixture.space.createdAt, "\"kim\""))
        assertTrue(api.opens.isEmpty())
        api.conversation = spaceChat
        current.openDirect(fixture.otherMember); idle(current)
        assertEquals(OpenConversationDto("direct", fixture.recipientId), api.opens.single())
        assertNull(current.state.value.chat)
        assertNotNull(current.state.value.openError)
        api.conversation = directChat
        current.openDirect(fixture.otherMember); idle(current)
        assertEquals("Sam", current.state.value.chat?.conversation?.title)
    }

    @Test fun sessionLossClearsConversationsAndRequiresSignIn() = runBlocking {
        val current = ready(open = false)
        assertEquals(1, current.state.value.conversations.size)
        api.listFailure = 401
        current.refreshList(); idle(current)
        val state = current.state.value
        assertTrue(state.requiresSignIn)
        assertTrue(state.conversations.isEmpty() && state.spaces.isEmpty())
        assertNull(state.chat)
    }

    @Test fun accountChangeDropsLateConversationList() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val delayed = object : MessagingApi by api {
            override suspend fun conversations(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<ConversationDto>>> {
                entered.complete(Unit); release.await(); return api.conversations(authorization, cursor, limit)
            }
        }
        val current = MessagingViewModel(MessagingRepository(delayed, fixture.accounts), fixture.repository,
            agentRuns = AgentRepository(MessagingAgentApi(), fixture.accounts)); model = current
        current.bind(fixture.accountId)
        withTimeout(5000) { entered.await() }
        current.bind(null); release.complete(Unit)
        assertEquals(MessagingState(), current.state.value)
    }

    @Test fun conversationUnreadMarkersAreParsedValidatedAndOptionalForOlderServers() = runBlocking {
        var marker: String? = "a".repeat(64)
        val requests = mutableListOf<Request>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request()
            requests += request
            val payload = EnvelopeDto(listOf(spaceChat), null, PaginationDto(null, false), 1, marker)
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(payload).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = MessagingRepository(IdentityModule.messaging(http, Gson()), fixture.accounts)
        val page = wire.conversations(fixture.accountId)
        assertEquals(1, page.unreadCount)
        assertEquals(marker, page.unreadMarker)
        val source = RepositoryAlertSource(ReminderRepositoryTest.Fixture().repository, wire)
        val unread = source.unreadMessages(fixture.accountId)
        assertEquals(page.unreadCount, unread.count)
        assertEquals(marker, unread.marker)
        marker = null
        assertNull(wire.conversations(fixture.accountId).unreadMarker)
        assertNull(source.unreadMessages(fixture.accountId).marker)
        for (invalidMarker in listOf("", "a".repeat(63), "g".repeat(64), "a".repeat(65))) {
            marker = invalidMarker
            invalid { wire.conversations(fixture.accountId) }
        }
        assertTrue(requests.all { it.method == "GET" && it.url.encodedPath == "/v1/conversations" })
        assertTrue(requests.all { it.header("Authorization") == "Bearer ${fixture.token}" })
    }

    @Test fun wireCarriesIdempotencyKeyAndStrictBodies() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            val payload = when {
                request.url.encodedPath.endsWith("/messages") && request.method == "POST" -> EnvelopeDto(message(1, mine = true, key = request.header("Idempotency-Key")), null)
                request.url.encodedPath.endsWith("/conversations") -> EnvelopeDto(if (bodies.last().contains("direct")) directChat else spaceChat, null)
                else -> EnvelopeDto(spaceChat.copy(lastPosition = "1", readPosition = "1", lastMessageAt = "2026-09-19T10:00:01Z"), null)
            }
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(payload).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = MessagingRepository(IdentityModule.messaging(http, Gson()), fixture.accounts)
        val intent = SendIntent(fixture.accountId, conversationId, UUID.randomUUID().toString(), "Hello family")
        wire.send(intent)
        assertEquals("POST", requests[0].method)
        assertEquals("/v1/conversations/$conversationId/messages", requests[0].url.encodedPath)
        assertEquals(intent.key, requests[0].header("Idempotency-Key"))
        assertEquals(setOf("body"), JsonParser.parseString(bodies[0]).asJsonObject.keySet())
        wire.open(fixture.accountId, fixture.spaceId)
        assertEquals(setOf("kind"), JsonParser.parseString(bodies[1]).asJsonObject.keySet())
        wire.open(fixture.accountId, fixture.spaceId, fixture.recipientId)
        assertEquals(fixture.recipientId, JsonParser.parseString(bodies[2]).asJsonObject["participant_account_id"].asString)
        wire.markRead(fixture.accountId, conversationId, "1")
        assertEquals("""{"through_position":"1"}""", bodies[3])
    }

    @Test fun messagePagesMayExceedTheGeneralResponseCapButNotTheirOwn() = runBlocking {
        var size = 30
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val page = (1..size).map { message(it).copy(body = "\u20AC".repeat(MAX_MESSAGE_CHARACTERS)) }
            val payload = if (chain.request().url.encodedPath.endsWith("/messages")) EnvelopeDto(page, null, PaginationDto(null, false))
                else EnvelopeDto(spaceChat.copy(title = "x".repeat(40)), null)
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(payload).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = MessagingRepository(IdentityModule.messaging(http, Gson()), fixture.accounts)
        assertEquals(30, wire.messages(fixture.accountId, conversationId).items.size)
        size = 100
        assertThrows(IOException::class.java) { runBlocking { wire.messages(fixture.accountId, conversationId) } }
        assertTrue(wire.read(fixture.accountId, conversationId).canSend)
    }

    @Test fun onlyTheWordAtAgentAsksTheAgentAsTheServerReadsIt() {
        for (text in listOf("@agent help", "@Agent, help", "Thanks @agent!", "hey\n@agent\nhelp")) assertTrue(text, mentionsAgent(text))
        for (text in listOf("write to sam@agent.example", "@agents meet at six", "the agent can help", "x.@agent", "\u0C05@agent")) assertFalse(text, mentionsAgent(text))
    }

    @Test fun agentRepliesAndRequestsMustBeConsistent() {
        val runId = "8c3fbd31-2c9a-4f88-9d5d-4c4ca09c4d04"
        val asked = message(2, mine = true, body = "@agent help")
        val reply = message(3).copy(senderName = "Agent", fromAgent = true, replyTo = ReplyDto(asked.id, "sent", "2", "Alex", "@agent help"))
        for (valid in listOf(asked.copy(agentRequest = AgentRequestDto("answered", runId)), asked.copy(agentRequest = AgentRequestDto("off", null)), reply)) {
            api.rawPage = listOf(valid)
            assertEquals(valid, runBlocking { repository.messages(fixture.accountId, conversationId) }.items.single())
        }
        for (bad in listOf(
            reply.copy(agentRequest = AgentRequestDto("answered", runId)), message(3).copy(agentRequest = AgentRequestDto("pending", null)),
            asked.copy(agentRequest = AgentRequestDto("private", null)), asked.copy(agentRequest = AgentRequestDto("lost", null)),
            asked.copy(agentRequest = AgentRequestDto("answered", "run-1")), asked.copy(fromAgent = true),
        )) {
            api.rawPage = listOf(bad)
            invalid { repository.messages(fixture.accountId, conversationId) }
        }
    }

    // DEC-046: the agent answers before the send returns, so its reply is fetched at once, without waiting for the next poll.
    @Test fun anAgentReplyShowsAtOnceAndARequestWithoutAnAnswerCanBeAskedAgain(): Unit = runBlocking {
        val current = ready()
        api.agentOutcomes += listOf("answered", "failed")
        current.draft("@agent what is due today"); current.send(); idle(current)
        val answered = current.state.value.chat!!.messages
        assertEquals(listOf("@agent what is due today", "Agent answer 1"), answered.map { it.body })
        assertEquals("answered", answered.first().agentRequest?.status)
        assertTrue(answered.last().fromAgent && !answered.last().mine)

        current.draft("@agent what is on this week"); current.send(); idle(current)
        val failed = current.state.value.chat!!.messages.last()
        assertEquals("failed", failed.agentRequest?.status)
        current.askAgentAgain(failed); idle(current)
        val after = current.state.value.chat!!.messages
        assertEquals(listOf(failed.id), api.agentAsks)
        assertEquals("answered", after.single { it.id == failed.id }.agentRequest?.status)
        assertEquals("Agent answer 2", after.last().body)
        // Once answered, and for the agent's own reply, asking again sends nothing.
        current.askAgentAgain(after.single { it.id == failed.id }); current.askAgentAgain(after.last()); idle(current)
        assertEquals(1, api.agentAsks.size)
    }

    // DEC-061: an answer is private until its author shares it; sharing an answered request sends nothing.
    @Test fun aPrivateAgentAnswerIsSharedOnlyByItsAuthorAndOnlyOnce(): Unit = runBlocking {
        val current = ready()
        api.agentOutcomes += listOf("private")
        current.draft("@agent list my tasks"); current.send(); idle(current)
        val asked = current.state.value.chat!!.messages.single()
        assertEquals("private", asked.agentRequest?.status)
        current.shareAgentAnswer(asked); idle(current)
        val after = current.state.value.chat!!.messages
        assertEquals(listOf(asked.id), api.shares)
        assertEquals("answered", after.single { it.id == asked.id }.agentRequest?.status)
        assertEquals("Agent answer 1", after.last().body)
        current.shareAgentAnswer(after.single { it.id == asked.id }); current.shareAgentAnswer(after.last()); idle(current)
        assertEquals(1, api.shares.size)
    }

    @Test fun askingTheAgentAgainPostsAnEmptyBodyAndMustConfirmTheSameRequest(): Unit = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val asked = message(2, mine = true, body = "@agent help").copy(agentRequest = AgentRequestDto("answered", UUID(8, 1).toString()))
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(asked, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = MessagingRepository(IdentityModule.messaging(http, Gson()), fixture.accounts)
        assertEquals("answered", wire.askAgentAgain(fixture.accountId, conversationId, asked.id).agentRequest?.status)
        assertEquals("POST /v1/conversations/$conversationId/messages/${asked.id}/agent", "${requests[0].method} ${requests[0].url.encodedPath}")
        assertEquals("{}", bodies[0])
        invalid { wire.askAgentAgain(fixture.accountId, conversationId, message(3).id) }
    }
}
