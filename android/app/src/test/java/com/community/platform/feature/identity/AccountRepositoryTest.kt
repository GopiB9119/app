package com.community.platform.feature.identity

import com.community.platform.IdentityModule
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import okhttp3.Headers.Companion.headersOf
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class AccountRepositoryTest {
    private val user = UserDto("62f3da14-12e9-4575-9541-caf8b98e2dfd", "alex@example.test", "Alex", "UTC", true, 1)
    private val token = "synthetic-session-token-with-more-than-32-characters"
    private val store = MemoryStore()
    private val fake = FakeApi(user, token)
    private val repository = AccountRepository(fake, store, Gson())

    @Test fun loginPersistsAndRestoresTheSameAccount() = runBlocking {
        repository.login(user.email, "Synthetic-password")
        assertEquals(user.id, store.value?.accountId)
        val restored = AccountRepository(fake, store, Gson()).current()
        assertEquals(user.id, restored?.user?.id)
        assertEquals("\"profile-1\"", restored?.etag)
    }

    @Test fun unauthorizedResponseClearsStoredSession() = runBlocking {
        store.save(Credentials(token, user.id))
        fake.meFailure = 401
        assertNull(repository.current())
        assertNull(store.load())
    }

    @Test fun temporaryFailureDoesNotEraseSession() = runBlocking {
        store.save(Credentials(token, user.id))
        fake.meFailure = 503
        val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.current() } }
        assertEquals(503, error.status)
        assertEquals(token, store.value?.token)
    }

    @Test fun staleAccountCannotIssueAMutation() = runBlocking {
        store.save(Credentials(token, user.id))
        val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.revokeOthers("another-account") } }
        assertEquals("ACCOUNT_CHANGED", error.code)
        assertEquals(0, fake.mutations)
    }

    @Test fun logoutClearsOnlyAfterServerAcknowledgment() = runBlocking {
        store.save(Credentials(token, user.id))
        fake.logoutFailure = true
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.logout(user.id) } }
        assertTrue(store.value != null)
        fake.logoutFailure = false
        repository.logout(user.id)
        assertNull(store.value)
    }

    @Test fun aRefusedRequestStillSignsOutTheSessionItUsed() = runBlocking {
        store.save(Credentials(token, user.id))
        val error = assertThrows(IdentityFailure::class.java) {
            runBlocking { repository.authorized(user.id) { throw IdentityFailure("AUTHENTICATION_REQUIRED", "Sign in to continue.", 401) } }
        }
        assertEquals(401, error.status)
        assertNull(store.value)
    }

    @Test fun cancelledLoginCannotSaveACredential() = runBlocking {
        fake.cancelLogin = true
        assertThrows(CancellationException::class.java) { runBlocking { repository.login(user.email, "secret") } }
        assertNull(store.value)
    }

    @Test fun profileMutationCarriesExpectedVersionAndDoesNotRetry() = runBlocking {
        store.save(Credentials(token, user.id))
        fake.profileFailure = true
        val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.update(user.id, "\"version-4\"", "New name", "UTC") } }
        assertEquals(412, error.status)
        assertEquals("\"version-4\"", fake.lastEtag)
        assertEquals(1, fake.mutations)
    }

    @Test fun registrationRetryPreservesOperationContext() = runBlocking {
        val intent = StartIntent(user.email, EntryMode.REGISTER, "context-with-thirty-two-characters", "same-request")
        repository.begin(intent)
        repository.begin(intent)
        assertEquals(listOf("same-request", "same-request"), fake.keys)
        assertFalse(fake.contexts.any { it != intent.contextSecret })
    }

    @Test fun idlePeerClosureDoesNotBreakTheNextExplicitCommand() {
        val requests = CopyOnWriteArrayList<String>()
        val releaseConnection = CountDownLatch(1)
        val peerClosed = CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        val client = IdentityModule.http()
        ServerSocket(0, 2, InetAddress.getByName("127.0.0.1")).use { server ->
            server.soTimeout = 5000
            val serving = executor.submit {
                server.accept().use { socket ->
                    requests.add(readFixtureRequest(socket, 0))
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}".toByteArray(Charsets.US_ASCII))
                    socket.getOutputStream().flush()
                    check(releaseConnection.await(5, TimeUnit.SECONDS))
                    socket.shutdownOutput()
                }
                peerClosed.countDown()
                server.accept().use { socket ->
                    requests.add(readFixtureRequest(socket, 2))
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".toByteArray(Charsets.US_ASCII))
                    socket.getOutputStream().flush()
                }
            }
            try {
                val origin = "http://127.0.0.1:${server.localPort}"
                client.newCall(Request.Builder().url("$origin/fixture/read").build()).execute().use { assertEquals("{}", it.body!!.string()) }
                releaseConnection.countDown()
                assertTrue(peerClosed.await(5, TimeUnit.SECONDS))
                client.newCall(Request.Builder().url("$origin/fixture/command").post("{}".toRequestBody("application/json".toMediaType())).build())
                    .execute().use { assertEquals(200, it.code); assertEquals("{}", it.body!!.string()) }
                serving.get(5, TimeUnit.SECONDS)
                assertEquals(listOf("GET /fixture/read HTTP/1.1", "POST /fixture/command HTTP/1.1"), requests)
                assertFalse(client.retryOnConnectionFailure)
            } finally {
                releaseConnection.countDown()
                client.connectionPool.evictAll()
                serving.cancel(true)
                executor.shutdownNow()
            }
        }
    }

    @Test fun unacknowledgedCommandIsNotAutomaticallyReplayed() {
        val requests = CopyOnWriteArrayList<String>()
        val executor = Executors.newSingleThreadExecutor()
        val client = IdentityModule.http()
        ServerSocket(0, 2, InetAddress.getByName("127.0.0.1")).use { server ->
            server.soTimeout = 5000
            val serving = executor.submit {
                server.accept().use { socket -> requests.add(readFixtureRequest(socket, 2)) }
                server.close()
            }
            try {
                val request = Request.Builder().url("http://127.0.0.1:${server.localPort}/fixture/command")
                    .post("{}".toRequestBody("application/json".toMediaType())).build()
                assertThrows(IOException::class.java) { client.newCall(request).execute().close() }
                serving.get(5, TimeUnit.SECONDS)
                assertEquals(listOf("POST /fixture/command HTTP/1.1"), requests)
                assertFalse(client.retryOnConnectionFailure)
            } finally {
                client.connectionPool.evictAll()
                serving.cancel(true)
                executor.shutdownNow()
            }
        }
    }

    private fun readFixtureRequest(socket: Socket, bodySize: Int): String {
        socket.soTimeout = 5000
        val reader = socket.getInputStream().bufferedReader(Charsets.US_ASCII)
        val request = reader.readLine() ?: error("Synthetic request line is missing")
        var headerCount = 0
        while (true) {
            val header = reader.readLine() ?: error("Synthetic headers ended early")
            if (header.isEmpty()) break
            check(++headerCount <= 32)
        }
        if (bodySize > 0) {
            val body = CharArray(bodySize) { reader.read().also { check(it >= 0) }.toChar() }
            assertEquals("{}", String(body))
        }
        return request
    }

    class MemoryStore : SessionStore {
        var value: Credentials? = null
        override fun load() = value
        override fun save(credentials: Credentials) { value = credentials }
        override fun clear() { value = null }
    }

    class FakeApi(private val user: UserDto, private val token: String) : IdentityApi {
        var meFailure = 0
        var meOffline = false
        var timezonesOffline = false
        var logins = 0
        var logoutFailure = false
        var profileFailure = false
        var cancelLogin = false
        var mutations = 0
        var lastEtag = ""
        val keys = mutableListOf<String>()
        val contexts = mutableListOf<String>()
        private fun <Value> ok(value: Value) = Response.success(EnvelopeDto(value, null))
        private fun <Value> failure(status: Int): Response<EnvelopeDto<Value>> = Response.error(status, """{"error":{"code":"SYNTHETIC_ERROR","message":"Synthetic failure"}}""".toResponseBody("application/json".toMediaType()))
        override suspend fun register(key: String, body: BeginDto): Response<EnvelopeDto<ChallengeDto>> {
            keys.add(key); contexts.add(body.contextSecret)
            return ok(ChallengeDto("challenge", "2026-09-19T12:00:00Z", "queued"))
        }
        override suspend fun recover(key: String, body: BeginDto) = register(key, body)
        override suspend fun verify(body: VerifyDto) = ok(AuthDto(token, "session", "2026-09-19T18:00:00Z", user))
        override suspend fun reset(body: ResetDto) = ok(DoneDto("ok"))
        override suspend fun login(body: LoginDto): Response<EnvelopeDto<AuthDto>> {
            if (cancelLogin) throw CancellationException("Synthetic cancellation")
            logins += 1
            return ok(AuthDto(token, "session", "2026-09-19T18:00:00Z", user))
        }
        override suspend fun me(authorization: String): Response<EnvelopeDto<UserDto>> {
            if (meOffline) throw IOException("Synthetic connection loss")
            return if (meFailure != 0) failure(meFailure) else Response.success(EnvelopeDto(user, null), headersOf("ETag", "\"profile-1\""))
        }
        override suspend fun profile(authorization: String, etag: String, body: ProfileDto): Response<EnvelopeDto<UserDto>> {
            mutations += 1; lastEtag = etag
            return if (profileFailure) failure(412) else me(authorization)
        }
        override suspend fun sessions(authorization: String) = ok(emptyList<SessionDto>())
        override suspend fun revoke(authorization: String, identifier: String): Response<EnvelopeDto<DoneDto>> { mutations += 1; return ok(DoneDto("ok")) }
        override suspend fun revokeOthers(authorization: String): Response<EnvelopeDto<DoneDto>> { mutations += 1; return ok(DoneDto("ok")) }
        override suspend fun logout(authorization: String): Response<EnvelopeDto<DoneDto>> = if (logoutFailure) failure(503) else ok(DoneDto("ok"))
        override suspend fun events(authorization: String) = ok(emptyList<SecurityEventDto>())
        override suspend fun timezones(): Response<EnvelopeDto<List<String>>> {
            if (timezonesOffline) throw IOException("Synthetic connection loss")
            return ok(listOf("UTC", "Asia/Kolkata"))
        }
    }
}