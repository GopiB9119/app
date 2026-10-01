package com.community.platform.feature.messaging

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceMemberDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
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

        override suspend fun conversation(authorization: String, conversationId: String): Response<EnvelopeDto<ConversationDto>> =
            if (readFailure != 0) failed(readFailure, "NOT_FOUND") else ok(conversation)

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
            val saved = stored.firstOrNull { it.clientMessageId == key } ?: message(stored.size + 1, mine = true, key = key, body = body.body).also(::add)
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
    }

    private val api = FakeApi()
    private val repository = MessagingRepository(api, fixture.accounts)
    private var model: MessagingViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private suspend fun idle(current: MessagingViewModel) = withTimeout(5000) { current.state.first { !it.busy } }

    private suspend fun ready(visible: Boolean = true, open: Boolean = true): MessagingViewModel {
        val current = MessagingViewModel(repository, fixture.repository); model = current
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
        assertEquals(listOf(null to null, null to "3", null to "33"), api.pages)
        assertEquals(listOf("3", "43"), api.reads)
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

    @Test fun readOnlyConversationRefusesDrafts() = runBlocking {
        api.conversation = spaceChat.copy(canSend = false)
        val current = ready()
        current.draft("Hello"); current.send()
        assertEquals("", current.state.value.chat!!.draft)
        assertTrue(api.sends.isEmpty())
    }

    @Test fun entrySpaceOpensItsSpaceChat() = runBlocking {
        val current = MessagingViewModel(repository, fixture.repository); model = current
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
        val current = MessagingViewModel(MessagingRepository(delayed, fixture.accounts), fixture.repository); model = current
        current.bind(fixture.accountId)
        withTimeout(5000) { entered.await() }
        current.bind(null); release.complete(Unit)
        assertEquals(MessagingState(), current.state.value)
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
}
