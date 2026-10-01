package com.community.platform.feature.spaces

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
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
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class SpaceSettingsTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val original = SpaceSettingsDto(fixture.spaceId, "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z", "\"${"a".repeat(64)}\"")
    private var value = original
    private var failure = 0
    private val commands = mutableListOf<Triple<String, String, EditSpaceSettingsDto>>()
    private val api = object : SpaceSettingsApi {
        override suspend fun read(authorization: String, spaceId: String): Response<EnvelopeDto<SpaceSettingsDto>> {
            assertEquals("Bearer ${fixture.token}", authorization)
            return result()
        }
        override suspend fun save(authorization: String, spaceId: String, etag: String, key: String, body: EditSpaceSettingsDto): Response<EnvelopeDto<SpaceSettingsDto>> {
            commands.add(Triple(key, etag, body))
            return result()
        }
        fun result(): Response<EnvelopeDto<SpaceSettingsDto>> = if (failure == 0) Response.success(EnvelopeDto(value, null)) else Response.error(failure, """{"error":{"code":"CHECK_FAILED","message":"Synthetic failure","details":{}}}""".toResponseBody("application/json".toMediaType()))
    }
    private val repository = SpaceSettingsRepository(api, fixture.accounts)
    private var model: SpaceSettingsViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null, null); Dispatchers.resetMain() }
    private suspend fun idle(current: SpaceSettingsViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(): SpaceSettingsViewModel {
        val current = SpaceSettingsViewModel(repository)
        model = current
        current.bind(fixture.accountId, fixture.spaceId)
        idle(current)
        assertEquals(original, current.state.value.basis)
        return current
    }

    @Test fun settingsRejectWrongOwnerScopeAndReview(): Unit = runBlocking {
        assertEquals(original, repository.read(fixture.accountId, fixture.spaceId))
        for (invalid in listOf(original.copy(id = fixture.accountId), original.copy(role = "member"), original.copy(etag = "bad"), original.copy(visibility = "public"))) {
            value = invalid
            assertThrows(IdentityFailure::class.java) { runBlocking { repository.read(fixture.accountId, fixture.spaceId) } }
        }
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.read(UUID.randomUUID().toString(), fixture.spaceId) } }
    }

    @Test fun settingsUnknownResultKeepsExactCommandAndShowsCurrentServerName() = runBlocking {
        val current = ready()
        current.name("New name")
        failure = 503
        current.save(); idle(current)
        val intent = current.state.value.pending
        assertNotNull(intent)
        current.name("Changed draft"); current.refresh(); current.reload(); current.save()
        assertEquals("New name", current.state.value.name)
        assertEquals(1, commands.size)
        failure = 0
        value = original.copy(name = "Later server name", version = "3")
        current.retry(); idle(current)
        assertEquals(commands[0], commands[1])
        assertEquals(intent!!.key, commands[1].first)
        assertNull(current.state.value.pending)
        assertEquals("Later server name", current.state.value.name)
        assertTrue(current.state.value.notice!!.contains("Later server name"))
    }

    @Test fun settingsConflictKeepsDraftUntilExplicitReload() = runBlocking {
        val current = ready()
        current.name("Stale draft"); failure = 412
        current.save(); idle(current)
        assertTrue(current.state.value.conflict)
        assertNull(current.state.value.pending)
        assertEquals("Stale draft", current.state.value.name)
        current.save(); current.refresh()
        assertEquals(1, commands.size)
        failure = 0; value = original.copy(name = "Other edit", version = "2", etag = "\"${"b".repeat(64)}\"")
        current.reload(); idle(current)
        assertFalse(current.state.value.conflict)
        assertEquals("Other edit", current.state.value.name)
        current.name("Reviewed draft"); current.save(); idle(current)
        assertNotEquals(commands[0].first, commands[1].first)
        assertEquals(value.etag, commands[1].second)
    }

    @Test fun settingsAccessLossClearsTheDraftAndReview() = runBlocking {
        val current = ready()
        current.name("Private draft"); failure = 404
        current.save(); idle(current)
        assertTrue(current.state.value.denied)
        assertNull(current.state.value.basis)
        assertNull(current.state.value.pending)
        assertEquals("", current.state.value.name)
    }

    @Test fun settingsAccountSwitchRejectsLateRead() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val delayed = object : SpaceSettingsApi by api {
            override suspend fun read(authorization: String, spaceId: String): Response<EnvelopeDto<SpaceSettingsDto>> {
                entered.complete(Unit); release.await()
                return Response.success(EnvelopeDto(original, null))
            }
        }
        val current = SpaceSettingsViewModel(SpaceSettingsRepository(delayed, fixture.accounts))
        model = current
        current.bind(fixture.accountId, fixture.spaceId)
        withTimeout(5000) { entered.await() }
        current.bind(null, null); release.complete(Unit)
        assertEquals(SpaceSettingsState(), current.state.value)
    }

    @Test fun settingsWireHasOnlyNameAndExactReviewHeaders() = runBlocking {
        var request: Request? = null
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            request = chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(original, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = SpaceSettingsRepository(IdentityModule.spaceSettings(http, Gson()), fixture.accounts)
        val intent = SpaceSettingsIntent(fixture.accountId, fixture.spaceId, "New", original.etag, UUID.randomUUID().toString())
        wire.save(intent)
        assertEquals("PATCH", request!!.method)
        assertEquals("/v1/spaces/${fixture.spaceId}/settings", request!!.url.encodedPath)
        assertEquals(intent.etag, request!!.header("If-Match"))
        assertEquals(intent.key, request!!.header("Idempotency-Key"))
        val buffer = Buffer(); request!!.body!!.writeTo(buffer)
        val body = JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertEquals(setOf("name"), body.keySet())
        assertEquals("New", body["name"].asString)
    }
}