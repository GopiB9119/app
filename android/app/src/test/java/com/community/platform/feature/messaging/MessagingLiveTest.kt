package com.community.platform.feature.messaging

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
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

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
        val current = MessagingViewModel(MessagingRepository(api, fixture.accounts), fixture.repository, live); model = current
        current.bind(fixture.accountId)
        current.resume()
        idle(current)
        current.select(current.state.value.conversations.first()); settle(current)
        return current
    }

    private fun change(conversationId: String) = LiveEvent.Change("conversation", conversationId, fixture.spaceId, "message")

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
        scheduler.advanceTimeBy(5_000); settle(current)
        assertEquals(reads + 4, api.reads.get())
    }

    @Test fun theListRefreshesEveryNinetySecondsWhileConnected() = runBlocking {
        val current = MessagingViewModel(MessagingRepository(api, fixture.accounts), fixture.repository, live); model = current
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
