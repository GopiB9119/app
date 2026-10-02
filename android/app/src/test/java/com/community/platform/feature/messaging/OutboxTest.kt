package com.community.platform.feature.messaging

import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.IOException

/** Unsent chat messages kept sealed on the phone (DEC-021), with fakes for the store, the sealer and WorkManager. */
@OptIn(ExperimentalCoroutinesApi::class)
class OutboxTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val fake = MessagingTest().FakeApi()
    private val store = MemoryUnsent()
    private val sealer = ReversingSealer()
    private val work = RecordingWork()
    private val outbox = Outbox(store, sealer, work, Dispatchers.Unconfined) { 1_000L }
    private var offline = false
    private var keptBeforeSend: Boolean? = null
    private val models = mutableListOf<MessagingViewModel>()

    /** Records whether the message was already kept when the request left, and can fail as if the network dropped. */
    private val api = object : MessagingApi by fake {
        override suspend fun send(authorization: String, conversationId: String, key: String, body: SendMessageDto): Response<EnvelopeDto<MessageDto>> {
            if (keptBeforeSend == null) keptBeforeSend = store.rows.containsKey(key)
            if (offline) throw IOException("synthetic network loss")
            return fake.send(authorization, conversationId, key, body)
        }
    }
    private val repository = MessagingRepository(api, fixture.accounts)

    class MemoryUnsent : UnsentMessages {
        val rows = linkedMapOf<String, UnsentMessage>()
        override fun put(message: UnsentMessage) { rows.putIfAbsent(message.requestKey, message) }
        override fun inConversation(accountId: String, conversationId: String) = rows.values.filter { it.accountId == accountId && it.conversationId == conversationId }
        override fun ofAccount(accountId: String) = rows.values.filter { it.accountId == accountId }
        override fun remove(requestKey: String) { rows.remove(requestKey) }
        override fun countAttempt(requestKey: String) { rows[requestKey]?.let { rows[requestKey] = it.copy(attempts = it.attempts + 1) } }
        override fun clear() = rows.clear()
    }

    /** Not encryption: a reversible change bound to the message, so the tests can see that only sealed text is stored. */
    class ReversingSealer : MessageSealer {
        var sealed = 0
        override fun seal(plain: String, binding: String): String { sealed += 1; return "sealed|$binding|${plain.reversed()}" }
        override fun open(sealed: String, binding: String): String? =
            sealed.removePrefix("sealed|$binding|").takeIf { it != sealed }?.reversed()
    }

    class RecordingWork : OutboxWork {
        val scheduled = mutableListOf<String>()
        var cancelled = 0
        override fun schedule(accountId: String) { scheduled += accountId }
        override fun cancelAll() { cancelled += 1 }
    }

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { models.forEach { it.bind(null) }; Dispatchers.resetMain() }

    private suspend fun idle(current: MessagingViewModel) = withTimeout(5000) { current.state.first { !it.busy } }

    private suspend fun openChat(): MessagingViewModel {
        val current = MessagingViewModel(repository, fixture.repository, outbox = outbox).also { models += it }
        current.bind(fixture.accountId)
        current.resume()
        idle(current)
        current.select(current.state.value.conversations.first())
        idle(current)
        return current
    }

    private suspend fun send(current: MessagingViewModel, text: String) {
        current.draft(text)
        current.send()
        idle(current)
    }

    @Test fun aMessageIsKeptSealedBeforeItIsSentAndForgottenOnceConfirmed() = runBlocking {
        val current = openChat()
        send(current, "Bring water")
        assertEquals(true, keptBeforeSend)
        assertEquals(1, sealer.sealed)
        assertTrue("A confirmed message is no longer kept.", store.rows.isEmpty())
        assertTrue(current.state.value.chat!!.pending.isEmpty())
    }

    @Test fun aLostAnswerKeepsTheSameKeyAndBodyAndAsksForBackgroundSending() = runBlocking {
        val current = openChat()
        offline = true
        send(current, "Bring water")
        val pending = current.state.value.chat!!.pending.single()
        assertEquals(SendState.UNKNOWN, pending.state)
        assertTrue(pending.kept)
        val row = store.rows.getValue(pending.intent.key)
        assertEquals(fixture.accountId, row.accountId)
        assertNotEquals("Only sealed text is stored.", "Bring water", row.sealedBody)
        assertFalse(row.sealedBody.contains("Bring water"))
        assertEquals(listOf(fixture.accountId), work.scheduled)
    }

    @Test fun aServerErrorKeepsTheMessageButARefusalIsNoLongerKept() = runBlocking {
        val current = openChat()
        fake.sendFailure = 503
        send(current, "First")
        assertEquals(1, store.rows.size)
        fake.sendFailure = 422
        send(current, "Second")
        val refused = current.state.value.chat!!.pending.single { it.intent.body == "Second" }
        assertEquals(SendState.FAILED, refused.state)
        assertFalse(refused.kept)
        assertEquals("Only the message the server did not refuse stays kept.", listOf("First"), store.rows.values.map { sealer.open(it.sealedBody, "${it.accountId}/${it.conversationId}/${it.requestKey}") })
    }

    @Test fun aNewScreenShowsKeptMessagesAndRetrySendsTheOriginalKeyAndBody() = runBlocking {
        val first = openChat()
        offline = true
        send(first, "Bring water")
        val key = first.state.value.chat!!.pending.single().intent.key
        first.bind(null)

        // The app was closed: a new screen finds the kept message, unconfirmed, and sends nothing by itself.
        offline = false
        val sendsBefore = fake.sends.size
        val reopened = openChat()
        val restored = reopened.state.value.chat!!.pending.single()
        assertEquals(key, restored.intent.key)
        assertEquals("Bring water", restored.intent.body)
        assertEquals(SendState.UNKNOWN, restored.state)
        assertEquals(sendsBefore, fake.sends.size)

        reopened.retry(key)
        idle(reopened)
        assertEquals(key to "Bring water", fake.sends.last().let { it.first to it.second.body })
        assertTrue(store.rows.isEmpty())
        assertTrue(reopened.state.value.chat!!.pending.isEmpty())
    }

    @Test fun stoppingTrackingForgetsTheKeptMessage() = runBlocking {
        val current = openChat()
        offline = true
        send(current, "Bring water")
        val key = current.state.value.chat!!.pending.single().intent.key
        current.stopTracking(key)
        withTimeout(5000) { while (store.rows.isNotEmpty()) kotlinx.coroutines.delay(5) }
        assertTrue(current.state.value.chat!!.pending.isEmpty())
    }

    @Test fun theBackgroundSenderSendsEachKeptMessageOnceWithItsOriginalKey() = runBlocking {
        val first = openChat()
        offline = true
        send(first, "One")
        send(first, "Two")
        first.bind(null)
        val keys = store.rows.keys.toList()
        val sender = OutboxSender(outbox, repository, fixture.store)

        // Still offline: each is tried once, counted, kept, and another run is asked for.
        val sendsBefore = fake.sends.size
        assertTrue(sender.send(fixture.accountId))
        assertEquals(sendsBefore, fake.sends.size)
        assertEquals(listOf(1, 1), store.rows.values.map { it.attempts })

        offline = false
        assertFalse(sender.send(fixture.accountId))
        assertEquals(keys, fake.sends.takeLast(2).map { it.first })
        assertEquals(listOf("One", "Two"), fake.sends.takeLast(2).map { it.second.body })
        assertTrue(store.rows.isEmpty())
    }

    @Test fun theBackgroundSenderDoesNothingForAnotherAccountAndGivesUpAfterFiveAttempts() = runBlocking {
        val first = openChat()
        offline = true
        send(first, "One")
        first.bind(null)
        val key = store.rows.keys.single()
        val sender = OutboxSender(outbox, repository, fixture.store)

        val other = AccountRepositoryTest.MemoryStore().apply { save(Credentials("another-token", fixture.recipientId)) }
        assertFalse(OutboxSender(outbox, repository, other).send(fixture.accountId))
        assertEquals("Nothing is deleted while another account is signed in.", setOf(key), store.rows.keys)
        assertEquals(0, store.rows.getValue(key).attempts)

        repeat(MAX_BACKGROUND_ATTEMPTS - 1) { assertTrue(sender.send(fixture.accountId)) }
        assertFalse("The last attempt asks for no further run.", sender.send(fixture.accountId))
        assertEquals(MAX_BACKGROUND_ATTEMPTS, store.rows.getValue(key).attempts)
        offline = false
        val sends = fake.sends.size
        assertFalse(sender.send(fixture.accountId))
        assertEquals("A message past its attempts is not sent again in the background.", sends, fake.sends.size)
        assertEquals(setOf(key), store.rows.keys)
    }

    @Test fun signingOutOrChangingAccountDeletesEveryKeptMessage() = runBlocking {
        val inner = AccountRepositoryTest.MemoryStore().apply { save(Credentials("token", fixture.accountId)) }
        val sessions = OutboxSessionStore(inner, outbox)
        store.put(UnsentMessage("k1", fixture.accountId, "c1", "sealed", 1, 0))
        sessions.save(Credentials("token-2", fixture.accountId))
        assertEquals("The same account keeps its messages.", 1, store.rows.size)
        sessions.save(Credentials("token-3", fixture.recipientId))
        assertTrue(store.rows.isEmpty())
        assertEquals(1, work.cancelled)
        store.put(UnsentMessage("k2", fixture.recipientId, "c1", "sealed", 1, 0))
        sessions.clear()
        assertTrue(store.rows.isEmpty())
        assertEquals(2, work.cancelled)
        assertEquals(null, inner.load())
    }

    @Test fun aKeptMessageThatCanNoLongerBeOpenedIsDropped() = runBlocking {
        store.put(UnsentMessage("k1", fixture.accountId, "c1", "tampered", 1, 0))
        assertTrue(outbox.kept(fixture.accountId, "c1").isEmpty())
        assertTrue(store.rows.isEmpty())
    }
}
