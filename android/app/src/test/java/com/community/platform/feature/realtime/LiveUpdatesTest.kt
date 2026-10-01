package com.community.platform.feature.realtime

import com.community.platform.feature.identity.IdentityFailure
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class LiveUpdatesTest {
    private val account = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val otherAccount = "0f97b948-9800-432f-9d15-407df739d08e"
    private val ready = arrayOf("retry: 5000", "", "event: ready", """data: {"heartbeat_seconds":15,"max_seconds":1800}""", "")
    private fun end(reason: String) = arrayOf("event: end", """data: {"reason":"$reason"}""", "")
    private val offline: () -> LiveStream = { throw IOException("No connection") }

    private class FakeStream : LiveStream {
        private val queue = Channel<String?>(Channel.UNLIMITED)
        var cancelled = false
        var closed = false

        fun send(vararg lines: String) = lines.forEach { queue.trySend(it) }
        fun end() { queue.trySend(null) }
        override suspend fun readLine(): String? = queue.receive()
        override fun cancel() { cancelled = true }
        override fun close() { closed = true }
    }

    /** Records when and for whom a stream was opened; unscripted opens fail like a lost connection. */
    private class FakeTransport(private val clock: () -> Long) : LiveTransport {
        val opens = mutableListOf<Long>()
        val accounts = mutableListOf<String>()
        val outcomes = ArrayDeque<() -> LiveStream>()

        override suspend fun open(accountId: String): LiveStream {
            opens += clock()
            accounts += accountId
            return (outcomes.removeFirstOrNull() ?: { throw IOException("No connection") })()
        }
    }

    @Test fun readyMarksTheStreamConnectedAndHintsArePublished() = runTest {
        val transport = FakeTransport { testScheduler.currentTime }
        val stream = FakeStream()
        transport.outcomes += { stream }
        val live = LiveUpdates(transport, StandardTestDispatcher(testScheduler))
        val events = mutableListOf<LiveEvent>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { live.events.collect { events += it } }
        try {
            live.start(account); runCurrent()
            assertFalse("An open stream is not connected before it is ready", live.connected.value)
            stream.send(*ready); runCurrent()
            assertTrue(live.connected.value)
            stream.send("event: change", """data: {"kind":"notifications","reason":"delivered"}""", "", ": keep-alive", "", "event: resync", "data: {}", "")
            runCurrent()
            assertEquals(listOf(LiveEvent.Ready, LiveEvent.Change("notifications", null, null, "delivered"), LiveEvent.Resync), events)
            stream.end(); runCurrent()
            assertFalse("A closed stream is not connected while it waits to reconnect", live.connected.value)
            assertTrue(stream.closed)
        } finally {
            live.stop()
        }
    }

    @Test fun failedConnectionsWaitOneTwoFiveTenThenThirtySeconds() = runTest {
        val transport = FakeTransport { testScheduler.currentTime }
        val live = LiveUpdates(transport, StandardTestDispatcher(testScheduler))
        try {
            live.start(account)
            advanceTimeBy(80_000)
            assertEquals(listOf(0L, 1_000L, 3_000L, 8_000L, 18_000L, 48_000L, 78_000L), transport.opens)
            assertFalse(live.connected.value)
        } finally {
            live.stop()
        }
    }

    @Test fun aStreamThatBecameReadyStartsTheDelaysOver() = runTest {
        val transport = FakeTransport { testScheduler.currentTime }
        val stream = FakeStream().apply { send(*ready); end() }
        transport.outcomes.addAll(listOf(offline, offline, { stream }))
        val live = LiveUpdates(transport, StandardTestDispatcher(testScheduler))
        try {
            live.start(account)
            advanceTimeBy(6_500)
            assertEquals(listOf(0L, 1_000L, 3_000L, 4_000L, 6_000L), transport.opens)
            assertTrue(stream.closed)
        } finally {
            live.stop()
        }
    }

    @Test fun signedOutOrChangedAccountStopsReconnecting() = runTest {
        val failures = listOf(
            IdentityFailure("AUTHENTICATION_REQUIRED", "Sign in to continue.", 401),
            IdentityFailure("ACCOUNT_CHANGED", "The signed-in account changed. Reload before continuing.", 409),
        )
        for (failure in failures) {
            val transport = FakeTransport { testScheduler.currentTime }
            transport.outcomes += { throw failure }
            val live = LiveUpdates(transport, StandardTestDispatcher(testScheduler))
            try {
                val started = testScheduler.currentTime
                live.start(account)
                advanceTimeBy(120_000)
                assertEquals(failure.code, listOf(started), transport.opens)
                assertFalse(live.connected.value)
            } finally {
                live.stop()
            }
        }
    }

    @Test fun aLimitRefusalWaitsThirtySeconds() = runTest {
        val transport = FakeTransport { testScheduler.currentTime }
        transport.outcomes += { throw IdentityFailure("LIVE_LIMIT_REACHED", "Too many live connections for this account.", 429) }
        val live = LiveUpdates(transport, StandardTestDispatcher(testScheduler))
        try {
            live.start(account)
            advanceTimeBy(29_999)
            assertEquals(listOf(0L), transport.opens)
            advanceTimeBy(2)
            assertEquals(listOf(0L, 30_000L), transport.opens)
        } finally {
            live.stop()
        }
    }

    @Test fun signedOutEndStopsWhileATimeLimitReconnects() = runTest {
        val transport = FakeTransport { testScheduler.currentTime }
        val first = FakeStream().apply { send(*ready, *end("time_limit")) }
        val second = FakeStream().apply { send(*ready, *end("signed_out")) }
        transport.outcomes.addAll(listOf({ first }, { second }))
        val live = LiveUpdates(transport, StandardTestDispatcher(testScheduler))
        try {
            live.start(account)
            advanceTimeBy(120_000)
            assertEquals(listOf(0L, 1_000L), transport.opens)
            assertFalse(live.connected.value)
            assertTrue(first.closed && second.closed)
        } finally {
            live.stop()
        }
    }

    @Test fun stopEndsTheOpenStreamAndAnotherAccountReplacesIt() = runTest {
        val transport = FakeTransport { testScheduler.currentTime }
        val first = FakeStream().apply { send(*ready) }
        val second = FakeStream().apply { send(*ready) }
        transport.outcomes.addAll(listOf({ first }, { second }))
        val live = LiveUpdates(transport, StandardTestDispatcher(testScheduler))
        try {
            live.start(account); runCurrent()
            assertTrue(live.connected.value)
            live.start(account); runCurrent()
            assertEquals("The running account keeps its stream", listOf(account), transport.accounts)
            live.start(otherAccount); runCurrent()
            assertTrue(first.cancelled && first.closed)
            assertEquals(listOf(account, otherAccount), transport.accounts)
            assertTrue(live.connected.value)
            live.stop()
            assertFalse(live.connected.value)
            runCurrent()
            assertTrue(second.cancelled && second.closed)
            advanceTimeBy(120_000)
            assertEquals(2, transport.opens.size)
        } finally {
            live.stop()
        }
    }
}
