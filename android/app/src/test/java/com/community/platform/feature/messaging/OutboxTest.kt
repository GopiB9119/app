package com.community.platform.feature.messaging

import com.community.platform.feature.agents.AgentRepository
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.SessionStore
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

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
    @After fun cleanup(): Unit = runBlocking {
        try { models.forEach { it.finishTestWork() } } finally { Dispatchers.resetMain() }
    }

    private suspend fun idle(current: MessagingViewModel) = withTimeout(5000) { current.state.first { !it.busy } }

    private suspend fun openChat(messageRepository: MessagingRepository = repository): MessagingViewModel {
        val current = MessagingViewModel(messageRepository, fixture.repository, outbox = outbox,
            agentRuns = AgentRepository(MessagingAgentApi(), fixture.accounts)).also { models += it }
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

    @Test fun aSendAfterSignOutLeavesNoKeptMessage() = runBlocking {
        val sessions = OutboxSessionStore(fixture.store, outbox)
        val accounts = AccountRepository(AccountRepositoryTest.FakeApi(fixture.user, fixture.token), sessions, Gson())
        val current = openChat(MessagingRepository(api, accounts))
        sessions.clear()
        send(current, "Typed after the session ended")
        assertTrue(current.state.value.requiresSignIn)
        assertTrue(fake.sends.isEmpty())
        assertTrue("A rejected signed-out send must leave no message on the phone.", store.rows.isEmpty())
    }

    @Test fun aStaleChatCannotKeepItsSendAfterAnotherAccountSignsIn() = runBlocking {
        val sessions = OutboxSessionStore(fixture.store, outbox)
        val accounts = AccountRepository(AccountRepositoryTest.FakeApi(fixture.user, fixture.token), sessions, Gson())
        val current = openChat(MessagingRepository(api, accounts))
        sessions.save(Credentials("new-account-token", fixture.recipientId))
        assertTrue(outbox.keep(SendIntent(fixture.recipientId, "new-chat", "new-account-message", "Keep the new account's message")))
        send(current, "Old screen still open")
        assertTrue(current.state.value.requiresSignIn)
        assertTrue(fake.sends.isEmpty())
        assertEquals("Only the replacement account's message remains.", setOf("new-account-message"), store.rows.keys)
        assertEquals(fixture.recipientId, sessions.load()?.accountId)
    }

    @Test fun anUnreadableSessionAlsoErasesItsKeptMessages() = runBlocking {
        val unreadable = object : SessionStore by fixture.store {
            override fun load(): Credentials? { fixture.store.clear(); return null }
        }
        val sessions = OutboxSessionStore(unreadable, outbox)
        assertTrue(outbox.keep(SendIntent(fixture.accountId, "c1", "k1", "Previously kept")))
        assertEquals(null, sessions.load())
        assertTrue("A session that cleared itself must not leave its outbox behind.", store.rows.isEmpty())
        assertEquals(1, work.cancelled)
    }

    @Test fun aMissingSessionClearsQueuedMessagesBeforeTheWorkerReturns() = runBlocking {
        val sessions = OutboxSessionStore(fixture.store, outbox)
        sessions.clear()
        assertTrue(outbox.keep(SendIntent(fixture.accountId, "c1", "k1", "Kept by an old screen")))
        assertFalse(OutboxSender(outbox, repository, sessions).send(fixture.accountId))
        assertTrue(fake.sends.isEmpty())
        assertTrue("The worker must leave no private outbox while signed out.", store.rows.isEmpty())
    }

    @Test fun missingSessionCleanupCannotEraseAReplacementSessionsMessages() = runBlocking {
        fixture.store.clear()
        val readStarted = CountDownLatch(1)
        val releaseRead = CountDownLatch(1)
        val saveStarted = CountDownLatch(1)
        val holdRead = AtomicBoolean(true)
        val failure = AtomicReference<Throwable>()
        val inner = object : SessionStore by fixture.store {
            override fun load(): Credentials? {
                val captured = fixture.store.load()
                if (holdRead.compareAndSet(true, false)) {
                    readStarted.countDown()
                    check(releaseRead.await(10, TimeUnit.SECONDS))
                }
                return captured
            }
        }
        val sessions = OutboxSessionStore(inner, outbox)
        val reader = Thread { try { sessions.load() } catch (error: Throwable) { failure.set(error) } }
        val writer = Thread {
            try {
                saveStarted.countDown()
                sessions.save(Credentials("replacement-token", fixture.accountId))
                runBlocking { outbox.keep(SendIntent(fixture.accountId, "c1", "replacement", "Keep this new message")) }
            } catch (error: Throwable) { failure.set(error) }
        }
        try {
            reader.start()
            assertTrue(readStarted.await(5, TimeUnit.SECONDS))
            writer.start()
            assertTrue(saveStarted.await(5, TimeUnit.SECONDS))
            withTimeout(5000) {
                while (writer.isAlive && writer.state != Thread.State.BLOCKED) kotlinx.coroutines.delay(5)
            }
            assertEquals("Saving must wait for the missing-session cleanup lock.", Thread.State.BLOCKED, writer.state)
        } finally {
            releaseRead.countDown()
            reader.join(5000)
            writer.join(5000)
        }
        assertFalse(reader.isAlive || writer.isAlive)
        assertEquals(null, failure.get())
        assertEquals("replacement-token", sessions.load()?.token)
        assertEquals(setOf("replacement"), store.rows.keys)
    }

    /** A software AES key in place of the Keystore, which can fail once as the Keystore sometimes does. */
    class FlakyKey : com.community.platform.feature.identity.SessionKey {
        private val generator = javax.crypto.KeyGenerator.getInstance("AES").apply { init(256) }
        private var key = generator.generateKey()
        var failures = 0
        var replaced = 0
        override fun current(): javax.crypto.SecretKey {
            if (failures > 0) { failures -= 1; throw java.security.ProviderException("synthetic Keystore error") }
            return key
        }
        override fun replace() { replaced += 1; key = generator.generateKey() }
    }

    // T104: one Keystore error while keeping a message must not replace the key that sealed every other kept message.
    @Test fun aKeystoreErrorWhileKeepingOneMessageLosesNoOtherKeptMessage() = runBlocking {
        val key = FlakyKey()
        val sealed = Outbox(store, KeystoreMessageSealer(key), work, Dispatchers.Unconfined) { 1_000L }
        assertTrue(sealed.keep(SendIntent(fixture.accountId, "c1", "k1", "First")))
        key.failures = 1
        assertTrue(sealed.keep(SendIntent(fixture.accountId, "c1", "k2", "Second")))
        assertEquals(listOf("First", "Second"), sealed.kept(fixture.accountId, "c1").map { it.intent.body })
        assertEquals(0, key.replaced)
    }
    @Test fun aKeyThatStillFailsIsReplacedOnceSoNewMessagesCanBeKept() = runBlocking {
        val key = FlakyKey()
        val sealed = Outbox(store, KeystoreMessageSealer(key), work, Dispatchers.Unconfined) { 1_000L }
        key.failures = 2
        assertTrue(sealed.keep(SendIntent(fixture.accountId, "c1", "k1", "First")))
        assertEquals(1, key.replaced)
        assertEquals(listOf("First"), sealed.kept(fixture.accountId, "c1").map { it.intent.body })
    }
    // T162: a kept reply keeps what it answers, inside the sealed text; a body kept before replies reads as before.
    @Test fun aKeptReplyKeepsTheMessageItAnswers() = runBlocking {
        val answered = "8c3fbd31-2c9a-4f88-9d5d-4c4ca09c4d04"
        assertTrue(outbox.keep(SendIntent(fixture.accountId, "c1", "k1", "Works for me", answered)))
        assertTrue(outbox.keep(SendIntent(fixture.accountId, "c1", "k2", "Plain")))
        assertFalse(store.rows.getValue("k1").sealedBody.contains(answered))
        val kept = outbox.kept(fixture.accountId, "c1").map { it.intent }
        assertEquals(listOf(answered to "Works for me", null to "Plain"), kept.map { it.replyTo to it.body })
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

    @Test fun aSignOutWhileAMessageIsSealedLeavesNothingKept() = runBlocking {
        lateinit var racing: Outbox
        // Signing out happens while the body is being sealed.
        val clearing = object : MessageSealer {
            override fun seal(plain: String, binding: String): String { racing.clear(); return "sealed|$binding|${plain.reversed()}" }
            override fun open(sealed: String, binding: String): String? = null
        }
        racing = Outbox(store, clearing, work, Dispatchers.Unconfined) { 1L }
        assertFalse(racing.keep(SendIntent(fixture.accountId, "c1", "k1", "Bring water")))
        assertTrue(store.rows.isEmpty())
    }
}
