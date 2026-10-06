package com.community.platform.feature.messaging

import com.community.platform.feature.agents.AgentRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.realtime.LiveEvent
import com.community.platform.feature.realtime.LiveSignals
import com.community.platform.feature.spaces.SpaceRepositoryTest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/** Live hints and the polling interval of [MessagingViewModel]; the poll loop runs on virtual time. */
@OptIn(ExperimentalCoroutinesApi::class)
class MessagingLiveTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val fake = MessagingTest().FakeApi()
    private val api = CountingApi(fake)
    private val live = FakeLive()
    private val scheduler = TestCoroutineScheduler()
    private val otherConversation = "6f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a02"
    private var model: MessagingViewModel? = null

    private class FakeLive : LiveSignals {
        override val events = MutableSharedFlow<LiveEvent>()
        override val connected = MutableStateFlow(false)
    }

    /** Counts chat reads (one per poll) and list reads; [gate] holds the next chat read. */
    private class CountingApi(private val inner: MessagingApi) : MessagingApi by inner {
        val reads = AtomicInteger()
        val lists = AtomicInteger()
        @Volatile var gate: CompletableDeferred<Unit>? = null

        override suspend fun conversation(authorization: String, conversationId: String): Response<EnvelopeDto<ConversationDto>> {
            reads.incrementAndGet()
            gate?.await()
            return inner.conversation(authorization, conversationId)
        }

        override suspend fun conversations(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<ConversationDto>>> {
            lists.incrementAndGet()
            return inner.conversations(authorization, cursor, limit)
        }
    }

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher(scheduler)) }
    @After fun cleanup(): Unit = runBlocking {
        try { model?.finishTestWork() } finally { Dispatchers.resetMain() }
    }

    private suspend fun idle(current: MessagingViewModel) = withTimeout(5000) { current.state.first { !it.busy } }

    /** Waits until nothing is loading and no further request starts. */
    private suspend fun settle(current: MessagingViewModel) = withTimeout(10_000) {
        var last = -1
        while (true) {
            idle(current)
            delay(100)
            val seen = api.reads.get() + api.lists.get()
            if (seen == last && !current.state.value.busy) break
            last = seen
        }
    }

    private suspend fun until(condition: () -> Boolean) = withTimeout(5000) { while (!condition()) delay(5) }

    private suspend fun openChat(): MessagingViewModel {
        val current = MessagingViewModel(MessagingRepository(api, fixture.accounts), fixture.repository, live,
            agentRuns = AgentRepository(MessagingAgentApi(), fixture.accounts)); model = current
        current.bind(fixture.accountId)
        current.resume()
        idle(current)
        current.select(current.state.value.conversations.first()); settle(current)
        return current
    }

    private fun change(conversationId: String, reason: String = "message") = LiveEvent.Change("conversation", conversationId, fixture.spaceId, reason)

    private suspend fun loadedHistory(): MessagingViewModel {
        for (position in 1..65) fake.add(MessageDto(
            UUID(7, position.toLong()).toString(), fake.conversation.id, position.toString(),
            fixture.recipientId, "Sam", false, null, "sent", "Message $position", "2026-09-19T10:00:00Z", null,
        ))
        val current = openChat()
        assertEquals((36..65).map(Int::toString), current.state.value.chat!!.messages.map { it.position })
        repeat(2) { current.loadEarlier(); settle(current) }
        assertEquals((1..65).map(Int::toString), current.state.value.chat!!.messages.map { it.position })
        return current
    }

    @Test fun olderLoadedMessagesRefreshForDeletionEditsReactionsAndErasure() = runBlocking {
        val current = loadedHistory()
        val changes = listOf(
            "deleted" to fake.stored[2].copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z", revision = 2),
            "changed" to fake.stored[3].copy(body = "Corrected message", editedAt = "2026-09-19T10:01:00Z", revision = 2),
            "changed" to fake.stored[4].copy(reactions = listOf(ReactionDto("like", 1, false)), revision = 2),
            "member_left" to fake.stored[5].copy(senderName = "Deleted account", status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z", revision = 2),
        )
        for ((reason, message) in changes) {
            fake.stored[message.position.toInt() - 1] = message
            val before = fake.pages.size
            live.events.emit(change(fake.conversation.id, reason)); settle(current)
            assertEquals(reason, message, current.state.value.chat!!.messages.single { it.id == message.id })
            assertEquals(listOf(null to null, null to "0", null to "30"), fake.pages.drop(before))
        }
        val before = fake.pages.size
        live.events.emit(change(fake.conversation.id)); settle(current)
        assertEquals(listOf(null to null), fake.pages.drop(before))
        assertEquals(listOf("65"), fake.reads)
        assertEquals(65, current.state.value.chat!!.messages.size)
    }

    @Test fun reconnectRefreshesEveryLoadedPage() = runBlocking {
        val current = loadedHistory()
        for ((index, event) in listOf(LiveEvent.Ready, LiveEvent.Resync).withIndex()) {
            val message = fake.stored[index].copy(body = "Changed during disconnection", revision = 2)
            fake.stored[index] = message
            live.events.emit(event); settle(current)
            assertEquals(message, current.state.value.chat!!.messages.single { it.id == message.id })
        }
    }

    @Test fun anOlderPageHintDuringAPollSurvivesLaterNewMessageHints() = runBlocking {
        val current = loadedHistory()
        val reads = api.reads.get()
        val gate = CompletableDeferred<Unit>()
        api.gate = gate
        live.events.emit(change(fake.conversation.id))
        until { api.reads.get() == reads + 1 }
        val deleted = fake.stored[2].copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z", revision = 2)
        fake.stored[2] = deleted
        live.events.emit(change(fake.conversation.id, "deleted"))
        repeat(3) { live.events.emit(change(fake.conversation.id)) }
        api.gate = null
        gate.complete(Unit)
        until { api.reads.get() >= reads + 2 }
        settle(current)
        assertEquals(reads + 2, api.reads.get())
        assertEquals(deleted, current.state.value.chat!!.messages.single { it.id == deleted.id })
    }

    @Test fun theFallbackTimerRefreshesOlderMessagesWhenAHintIsMissed() = runBlocking {
        val current = loadedHistory()
        live.connected.value = true
        val changed = fake.stored[2].copy(body = "Changed without a hint", revision = 2)
        fake.stored[2] = changed
        scheduler.advanceTimeBy(30_001); settle(current)
        assertEquals(changed, current.state.value.chat!!.messages.single { it.id == changed.id })
    }

    @Test fun resumingRefreshesOlderMessagesWhoseHintsWereIgnored() = runBlocking {
        val current = loadedHistory()
        current.pause()
        val deleted = fake.stored[2].copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z", revision = 2)
        fake.stored[2] = deleted
        live.events.emit(change(fake.conversation.id, "deleted")); settle(current)
        assertEquals("Message 3", current.state.value.chat!!.messages.single { it.id == deleted.id }.body)
        current.resume(); settle(current)
        assertEquals(deleted, current.state.value.chat!!.messages.single { it.id == deleted.id })
    }

    @Test fun aFailedOlderPageRefreshRemainsPendingOnTheNextPoll() = runBlocking {
        val current = loadedHistory()
        val changed = fake.stored[2].copy(body = "Changed during an outage", revision = 2)
        fake.stored[2] = changed
        fake.readFailure = 503
        live.events.emit(change(fake.conversation.id, "changed")); settle(current)
        assertEquals("Message 3", current.state.value.chat!!.messages.single { it.id == changed.id }.body)
        fake.readFailure = 0
        live.events.emit(change(fake.conversation.id)); settle(current)
        assertEquals(changed, current.state.value.chat!!.messages.single { it.id == changed.id })
    }

    @Test fun refreshingLoadedHistoryDoesNotMarkAnUnfetchedGapRead() = runBlocking {
        val current = loadedHistory()
        for (position in 66..465) fake.add(fake.stored.last().copy(
            id = UUID(7, position.toLong()).toString(), position = position.toString(), body = "Message $position",
        ))
        val deleted = fake.stored[2].copy(status = "deleted", body = null, deletedAt = "2026-09-19T11:00:00Z", revision = 2)
        fake.stored[2] = deleted
        live.events.emit(LiveEvent.Resync); settle(current)
        assertEquals((1..365).map(Int::toString), current.state.value.chat!!.messages.map { it.position })
        assertEquals(listOf("65", "365"), fake.reads)
        assertEquals(deleted, current.state.value.chat!!.messages.single { it.id == deleted.id })
    }

    @Test fun hintForTheOpenChatPollsAtOnceAndAnotherConversationOnlyReadsTheList() = runBlocking {
        val current = openChat()
        val reads = api.reads.get()
        val lists = api.lists.get()
        live.events.emit(change(otherConversation)); settle(current)
        assertEquals(reads, api.reads.get())
        assertEquals(lists + 1, api.lists.get())
        live.events.emit(change(fake.conversation.id)); settle(current)
        assertEquals(reads + 1, api.reads.get())
        assertEquals(lists + 2, api.lists.get())
        live.events.emit(LiveEvent.Change("notifications", null, null, "delivered")); settle(current)
        assertEquals(reads + 1, api.reads.get())
        assertEquals(lists + 2, api.lists.get())
    }

    @Test fun readyAndResyncReadTheOpenChatAndTheList() = runBlocking {
        val current = openChat()
        val reads = api.reads.get()
        val lists = api.lists.get()
        live.events.emit(LiveEvent.Ready); settle(current)
        live.events.emit(LiveEvent.Resync); settle(current)
        assertEquals(reads + 2, api.reads.get())
        assertEquals(lists + 2, api.lists.get())
    }

    @Test fun hintsDuringARunningPollQueueExactlyOneMorePoll() = runBlocking {
        val current = openChat()
        val reads = api.reads.get()
        val gate = CompletableDeferred<Unit>()
        api.gate = gate
        live.events.emit(change(fake.conversation.id))
        until { api.reads.get() == reads + 1 }
        repeat(3) { live.events.emit(change(fake.conversation.id)) }
        api.gate = null
        gate.complete(Unit)
        until { api.reads.get() >= reads + 2 }
        settle(current)
        assertEquals(reads + 2, api.reads.get())
    }

    @Test fun aHiddenScreenIgnoresHintsAndCatchesUpWhenItResumes() = runBlocking {
        val current = openChat()
        val reads = api.reads.get()
        current.pause()
        live.events.emit(change(fake.conversation.id)); settle(current)
        assertEquals(reads, api.reads.get())
        current.resume(); settle(current)
        assertEquals(reads + 1, api.reads.get())
    }

    @Test fun pollsEveryThirtySecondsWhileConnectedAndEveryFiveSecondsOtherwise() = runBlocking {
        val current = openChat()
        val reads = api.reads.get()
        scheduler.advanceTimeBy(4_500); settle(current)
        assertEquals(reads, api.reads.get())
        scheduler.advanceTimeBy(1_000); settle(current)
        assertEquals(reads + 1, api.reads.get())

        live.connected.value = true
        scheduler.advanceTimeBy(29_000); settle(current)
        assertEquals(reads + 1, api.reads.get())
        scheduler.advanceTimeBy(1_500); settle(current)
        assertEquals(reads + 2, api.reads.get())

        live.connected.value = false
        scheduler.advanceTimeBy(4_500); settle(current)
        assertEquals(reads + 2, api.reads.get())
        scheduler.advanceTimeBy(1_000); settle(current)
        assertEquals(reads + 3, api.reads.get())
        // The next wait starts when that poll has finished, which on virtual time is the end of the previous step.
        scheduler.advanceTimeBy(5_500); settle(current)
        assertEquals(reads + 4, api.reads.get())
    }

    @Test fun theListRefreshesEveryNinetySecondsWhileConnected() = runBlocking {
        val current = MessagingViewModel(MessagingRepository(api, fixture.accounts), fixture.repository, live,
            agentRuns = AgentRepository(MessagingAgentApi(), fixture.accounts)); model = current
        current.bind(fixture.accountId)
        current.resume(); settle(current)
        live.connected.value = true
        val lists = api.lists.get()
        scheduler.advanceTimeBy(89_000); settle(current)
        assertEquals(lists, api.lists.get())
        scheduler.advanceTimeBy(1_500); settle(current)
        assertEquals(lists + 1, api.lists.get())

        live.connected.value = false
        scheduler.advanceTimeBy(14_500); settle(current)
        assertEquals(lists + 1, api.lists.get())
        scheduler.advanceTimeBy(1_000); settle(current)
        assertEquals(lists + 2, api.lists.get())
    }
}
