package com.community.platform.feature.realtime

import com.community.platform.BuildConfig
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.Gson
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.Closeable
import java.io.IOException
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlin.coroutines.CoroutineContext

/** The OkHttpClient of the live stream: no response-size cap and no overall call deadline. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class LiveClient

/** One open stream of lines. The reader calls [close] once when it is done. */
interface LiveStream : Closeable {
    /** The next line without its line break, or null at the end of the stream. */
    suspend fun readLine(): String?

    /** Ends the stream from any thread, also while [readLine] waits for data. */
    fun cancel()
}

interface LiveTransport {
    /** Opens `GET /v1/live` for [accountId]; throws [IdentityFailure] when the stored session or the server refuses. */
    suspend fun open(accountId: String): LiveStream
}

/** What screens read: hints that something changed, and whether a live stream is open. */
interface LiveSignals {
    val events: SharedFlow<LiveEvent>
    val connected: StateFlow<Boolean>

    companion object {
        /** Never connects, so screens keep their own polling. */
        val None: LiveSignals = object : LiveSignals {
            override val events: SharedFlow<LiveEvent> = MutableSharedFlow()
            override val connected: StateFlow<Boolean> = MutableStateFlow(false)
        }
    }
}

/** Waits before reconnecting after the 1st, 2nd, ... stream that failed or ended; a stream that became ready starts over. */
internal val RECONNECT_SECONDS = longArrayOf(1, 2, 5, 10, 30)
internal const val LIMITED_SECONDS = 30L

/** Keeps one live stream open for the signed-in account while the app is in the foreground. */
@Singleton
class LiveUpdates internal constructor(private val transport: LiveTransport, context: CoroutineContext) : LiveSignals {
    @Inject constructor(transport: LiveTransport) : this(transport, Dispatchers.IO)

    private val scope = CoroutineScope(SupervisorJob() + context)
    private val lock = Any()
    private val mutableEvents = MutableSharedFlow<LiveEvent>(extraBufferCapacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private val mutableConnected = MutableStateFlow(false)
    override val events: SharedFlow<LiveEvent> = mutableEvents.asSharedFlow()
    override val connected: StateFlow<Boolean> = mutableConnected.asStateFlow()
    private var accountId: String? = null
    private var job: Job? = null
    private var generation = 0L

    /** Streams for [accountId] until [stop]; does nothing while that account's stream is running. */
    fun start(accountId: String) {
        synchronized(lock) {
            if (this.accountId == accountId && job?.isActive == true) return
            end()
            this.accountId = accountId
            val mine = generation
            job = scope.launch { run(accountId, mine) }
        }
    }

    fun stop() {
        synchronized(lock) { end() }
    }

    private fun end() {
        generation += 1
        job?.cancel()
        job = null
        accountId = null
        mutableConnected.value = false
    }

    private suspend fun run(accountId: String, mine: Long) {
        var failures = 0
        while (true) {
            var ready = false
            var limited = false
            try {
                if (!stream(accountId, mine) { ready = true }) return
            } catch (error: CancellationException) {
                throw error
            } catch (error: IdentityFailure) {
                if (error.status == 401 || error.code == "ACCOUNT_CHANGED") return
                limited = error.status == 429
            } catch (_error: Exception) {
                // Lost connections and server failures are retried below.
            } finally {
                publish(mine, connected = false)
            }
            if (ready) failures = 0
            val seconds = if (limited) LIMITED_SECONDS else RECONNECT_SECONDS[minOf(failures, RECONNECT_SECONDS.lastIndex)]
            failures += 1
            delay(seconds * 1000)
        }
    }

    /** Reads one stream until it ends; false when the server signed the account out. */
    private suspend fun stream(accountId: String, mine: Long, ready: () -> Unit): Boolean {
        val stream = transport.open(accountId)
        try {
            return coroutineScope {
                // A blocking read does not notice cancellation, so cancellation ends the stream itself.
                val canceller = launch { try { awaitCancellation() } finally { stream.cancel() } }
                try { read(stream, mine, ready) } finally { canceller.cancel() }
            }
        } finally {
            stream.close()
        }
    }

    private suspend fun read(stream: LiveStream, mine: Long, ready: () -> Unit): Boolean {
        val parser = SseParser()
        while (true) {
            val line = stream.readLine() ?: return true
            when (val event = parser.feed(line) ?: continue) {
                LiveEvent.Ready -> {
                    ready()
                    publish(mine, connected = true, event = event)
                }
                is LiveEvent.End -> {
                    publish(mine, event = event)
                    return event.reason != "signed_out"
                }
                else -> publish(mine, event = event)
            }
        }
    }

    /** Only the current stream may report; a stopped or replaced one stays silent. */
    private fun publish(mine: Long, connected: Boolean? = null, event: LiveEvent? = null) {
        synchronized(lock) {
            if (generation != mine) return
            if (connected != null) mutableConnected.value = connected
            if (event != null) mutableEvents.tryEmit(event)
        }
    }
}

private const val MAX_LINE_BYTES = 16_384L
private const val MAX_ERROR_BYTES = 65_536L

/** `GET /v1/live` with the stored session of the expected account. */
class OkHttpLiveTransport @Inject constructor(
    @LiveClient private val client: OkHttpClient,
    private val accounts: AccountRepository,
    private val gson: Gson,
) : LiveTransport {
    override suspend fun open(accountId: String): LiveStream {
        var opened: Response? = null
        try {
            return accounts.authorized(accountId) { authorization ->
                val call = client.newCall(
                    Request.Builder()
                        .url("${BuildConfig.API_URL}v1/live")
                        .header("Authorization", authorization)
                        .header("Accept", "text/event-stream")
                        .build(),
                )
                val response = call.execute().also { opened = it }
                if (!response.isSuccessful) throw refusal(response)
                if (response.body == null) throw IdentityFailure("INVALID_RESPONSE", "The live stream returned no content.", response.code)
                OkHttpLiveStream(call, response)
            }.also { opened = null }
        } finally {
            // Cancellation can discard a stream that had already opened.
            opened?.close()
        }
    }

    private fun refusal(response: Response): IdentityFailure {
        val error = try {
            gson.fromJson(response.peekBody(MAX_ERROR_BYTES).string(), EnvelopeDto::class.java)?.error
        } catch (_error: IOException) {
            null
        } catch (_error: RuntimeException) {
            null
        }
        return IdentityFailure(error?.code ?: "REQUEST_FAILED", error?.message ?: "Live updates are not available.", response.code)
    }
}

private class OkHttpLiveStream(private val call: Call, private val response: Response) : LiveStream {
    private val source = response.body!!.source()

    // A line longer than the limit, or one cut off by the end of the stream, fails with EOFException.
    override suspend fun readLine(): String? = if (source.exhausted()) null else source.readUtf8LineStrict(MAX_LINE_BYTES)

    override fun cancel() = call.cancel()

    override fun close() = response.close()
}

@Module
@InstallIn(SingletonComponent::class)
object RealtimeModule {
    @Provides fun transport(implementation: OkHttpLiveTransport): LiveTransport = implementation
    @Provides fun signals(implementation: LiveUpdates): LiveSignals = implementation
}
