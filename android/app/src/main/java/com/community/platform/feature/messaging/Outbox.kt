package com.community.platform.feature.messaging

import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.SessionStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import javax.inject.Inject
import kotlin.coroutines.CoroutineContext

/** The background sender gives up on a message after this many attempts; it stays kept and shown as unconfirmed. */
const val MAX_BACKGROUND_ATTEMPTS = 5

/** A kept message opened again: its original request key and body, and the background attempts so far. */
data class KeptMessage(val intent: SendIntent, val attempts: Int)

/** Runs [OutboxSender] for one account in the background; WorkManager on the phone. */
interface OutboxWork {
    fun schedule(accountId: String)
    fun cancelAll()
}

/** What the chat screen needs from the messages kept on the phone (DEC-021). */
interface MessageOutbox {
    /** Keeps [intent] before it is sent; false when nothing was kept. */
    suspend fun keep(intent: SendIntent): Boolean
    suspend fun kept(accountId: String, conversationId: String): List<KeptMessage>
    suspend fun forget(keys: Collection<String>)
    fun schedule(accountId: String)

    companion object {
        /** Keeps nothing, so unconfirmed messages live in memory only. */
        val None: MessageOutbox = object : MessageOutbox {
            override suspend fun keep(intent: SendIntent) = false
            override suspend fun kept(accountId: String, conversationId: String) = emptyList<KeptMessage>()
            override suspend fun forget(keys: Collection<String>) = Unit
            override fun schedule(accountId: String) = Unit
        }
    }
}

/**
 * Unsent chat messages kept sealed on the phone: written before they are sent, removed once the server confirms or
 * refuses them or the person discards them, and all deleted when the session ends or the account changes.
 */
class Outbox(
    private val store: UnsentMessages,
    private val sealer: MessageSealer,
    private val work: OutboxWork,
    private val io: CoroutineContext = Dispatchers.IO,
    private val clock: () -> Long = System::currentTimeMillis,
) : MessageOutbox {
    override suspend fun keep(intent: SendIntent): Boolean = withContext(io) {
        store.put(UnsentMessage(intent.key, intent.accountId, intent.conversationId, sealer.seal(intent.body, binding(intent)), clock(), 0))
        true
    }

    override suspend fun kept(accountId: String, conversationId: String): List<KeptMessage> =
        withContext(io) { open(store.inConversation(accountId, conversationId)) }

    suspend fun kept(accountId: String): List<KeptMessage> = withContext(io) { open(store.ofAccount(accountId)) }

    // A message the person discarded must be removed even when the screen goes away at once.
    override suspend fun forget(keys: Collection<String>) = withContext(io + NonCancellable) { keys.forEach(store::remove) }

    suspend fun attempted(key: String) = withContext(io) { store.countAttempt(key) }

    override fun schedule(accountId: String) = work.schedule(accountId)

    /** Starts background sending when [accountId] has a kept message the sender may still try. */
    suspend fun resume(accountId: String) {
        if (kept(accountId).any { it.attempts < MAX_BACKGROUND_ATTEMPTS }) work.schedule(accountId)
    }

    /** Deletes every kept message of every account and stops background sending. Blocks. */
    fun clear() {
        store.clear()
        work.cancelAll()
    }

    private fun open(rows: List<UnsentMessage>): List<KeptMessage> = rows.mapNotNull { row ->
        val intent = SendIntent(row.accountId, row.conversationId, row.requestKey, "")
        val body = sealer.open(row.sealedBody, binding(intent))
        if (body == null) {
            // It can never be opened, so it can never be sent.
            store.remove(row.requestKey)
            null
        } else KeptMessage(intent.copy(body = body), row.attempts)
    }

    private fun binding(intent: SendIntent) = "${intent.accountId}/${intent.conversationId}/${intent.key}"
}

/** The app's session store: signing out, an ended session and a different account delete every kept message. */
class OutboxSessionStore(private val inner: SessionStore, private val outbox: Outbox) : SessionStore {
    override fun load(): Credentials? = inner.load()

    override fun save(credentials: Credentials) {
        if (inner.load()?.accountId != credentials.accountId) outbox.clear()
        inner.save(credentials)
    }

    // Kept messages go first, so a failure leaves the person signed in to try again.
    override fun clear() {
        outbox.clear()
        inner.clear()
    }
}

/** Sends kept messages in the background with their original keys and bodies, under the rules of the chat screen. */
class OutboxSender @Inject constructor(
    private val outbox: Outbox,
    private val repository: MessagingRepository,
    private val session: SessionStore,
) {
    /**
     * Sends each kept message of [accountId] once and returns true when one should be tried again later.
     * While another account, or nobody, is signed in, it sends nothing and deletes nothing.
     */
    suspend fun send(accountId: String): Boolean {
        if (signedIn() != accountId) return false
        val tried = HashSet<String>()
        var again = false
        while (true) {
            // A message kept while this runs is sent in the same run.
            val next = outbox.kept(accountId).firstOrNull { it.intent.key !in tried && it.attempts < MAX_BACKGROUND_ATTEMPTS } ?: return again
            val key = next.intent.key
            tried += key
            try {
                repository.send(next.intent)
                outbox.forget(listOf(key))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                val failure = error as? IdentityFailure
                when {
                    // The ended session or the new account has deleted every kept message.
                    failure != null && (failure.status == 401 || failure.code == "ACCOUNT_CHANGED") -> return false
                    // Nobody sees a refusal here, so a rate limit waits for the next run instead of dropping the message.
                    failure?.status == 429 -> { outbox.attempted(key); return true }
                    failure != null && failure.status in 400..499 && failure.status != 408 -> outbox.forget(listOf(key))
                    else -> {
                        outbox.attempted(key)
                        if (next.attempts + 1 < MAX_BACKGROUND_ATTEMPTS) again = true
                    }
                }
            }
        }
    }

    /** At app start: background sending for the kept messages of the signed-in account. */
    suspend fun resume() {
        try {
            signedIn()?.let { outbox.resume(it) }
        } catch (error: CancellationException) {
            throw error
        } catch (_error: Exception) {
            // They stay kept and appear in their chat; the next start tries again.
        }
    }

    private suspend fun signedIn(): String? = withContext(Dispatchers.IO) { session.load()?.accountId }
}
