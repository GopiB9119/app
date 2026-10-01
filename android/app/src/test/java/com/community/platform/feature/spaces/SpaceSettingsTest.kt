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

    @Test fun aRefreshDuringAnUnansweredSaveIsNotSentSoItCannotBringBackTheOldName() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        var reads = 0
        val delayed = object : SpaceSettingsApi by api {
            override suspend fun read(authorization: String, spaceId: String): Response<EnvelopeDto<SpaceSettingsDto>> {
                reads += 1
                return api.read(authorization, spaceId)
            }
            override suspend fun save(authorization: String, spaceId: String, etag: String, key: String, body: EditSpaceSettingsDto): Response<EnvelopeDto<SpaceSettingsDto>> {
                entered.complete(Unit); release.await()
                return api.save(authorization, spaceId, etag, key, body)
            }
        }
        val current = SpaceSettingsViewModel(SpaceSettingsRepository(delayed, fixture.accounts))
        model = current
        current.bind(fixture.accountId, fixture.spaceId); idle(current)
        val before = reads
        current.name("Morgan household")
        value = original.copy(name = "Morgan household", version = "2", etag = "\"${"b".repeat(64)}\"")
        current.save()
        withTimeout(5000) { entered.await() }
        // T82: the screen sends one request at a time, so nothing started now can answer after the save.
        current.refresh(); current.reload()
        assertEquals(before, reads)
        release.complete(Unit); idle(current)
        assertEquals("Morgan household", current.state.value.basis!!.name)
        assertEquals(before, reads)
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

    @Test fun settingsDescriptionOnlySaveKeepsNameAndReviewedHeaders() = runBlocking {
        val current = ready()
        val description = "Family plans\nShared notes"
        current.description("  $description  ")
        assertTrue(current.state.value.dirty)
        value = original.copy(description = description, version = "2")
        current.save(); idle(current)
        assertEquals(1, commands.size)
        val (key, etag, body) = commands.single()
        assertEquals(original.name, body.name)
        assertEquals(description, body.description)
        assertEquals(original.etag, etag)
        assertEquals(key, UUID.fromString(key).toString())
        assertNull(current.state.value.pending)
        assertEquals(description, current.state.value.description)
        assertFalse(current.state.value.dirty)
    }

    @Test fun settingsNameOnlySaveLeavesDescriptionUnchanged() = runBlocking {
        val current = ready()
        value = original.copy(description = "Reviewed description")
        current.reload(); idle(current)
        current.name("New name")
        value = value.copy(name = "New name", version = "2")
        current.save(); idle(current)
        assertEquals(1, commands.size)
        assertEquals("New name", commands.single().third.name)
        assertNull(commands.single().third.description)
        assertEquals(original.etag, commands.single().second)
        assertEquals("Reviewed description", current.state.value.description)
        assertNull(current.state.value.pending)
    }

    @Test fun settingsUnknownDescriptionResultRetriesExactOriginalIntent() = runBlocking {
        val current = ready()
        current.name("New name")
        current.description("  New description\nSecond line  ")
        failure = 503
        current.save(); idle(current)
        val intent = current.state.value.pending!!
        assertEquals("New name", intent.name)
        assertEquals("New description\nSecond line", intent.description)
        assertEquals(original.etag, intent.etag)
        assertEquals(intent.key, UUID.fromString(intent.key).toString())
        current.name("Different name"); current.description("Different description")
        current.refresh(); current.reload(); current.save()
        assertEquals(1, commands.size)
        assertEquals(intent, current.state.value.pending)
        assertEquals("New name", current.state.value.name)
        assertEquals("  New description\nSecond line  ", current.state.value.description)
        failure = 0
        value = original.copy(name = intent.name, description = intent.description, version = "2")
        current.retry(); idle(current)
        assertEquals(2, commands.size)
        assertEquals(commands[0], commands[1])
        assertEquals(intent.key, commands[1].first)
        assertEquals(intent.etag, commands[1].second)
        assertEquals(intent.name, commands[1].third.name)
        assertEquals(intent.description, commands[1].third.description)
        assertNull(current.state.value.pending)
        assertFalse(current.state.value.dirty)
    }

    @Test fun settingsDescriptionRejectsOverlongAndControlCharactersLocally() = runBlocking {
        val current = ready()
        for (description in listOf("x".repeat(281), "Before\tAfter", "Before\rAfter", "Before\u0000After", "Before\u202eAfter", "\tDescription", "Description\r")) {
            current.description(description)
            current.save(); idle(current)
            assertEquals("Keep the description to 280 characters without control characters.", current.state.value.error)
            assertTrue(commands.isEmpty())
            assertNull(current.state.value.pending)
        }
    }

    @Test fun settingsDescriptionDraftResetsOnReloadAndTracksUnsavedChanges() = runBlocking {
        val current = ready()
        value = original.copy(description = "Reviewed description")
        current.reload(); idle(current)
        assertEquals("Reviewed description", current.state.value.description)
        assertFalse(current.state.value.dirty)
        current.description("Unsaved description")
        current.refresh()
        assertTrue(current.state.value.dirty)
        assertEquals("Unsaved description", current.state.value.description)
        current.reload(); idle(current)
        assertEquals("Reviewed description", current.state.value.description)
        assertFalse(current.state.value.dirty)
        current.description("  Reviewed description  ")
        current.save(); idle(current)
        assertTrue(commands.isEmpty())
        assertTrue(current.state.value.dirty)
        current.description("")
        value = value.copy(description = "", version = "2")
        current.save(); idle(current)
        assertEquals("", commands.single().third.description)
        assertFalse(current.state.value.dirty)
    }

    @Test fun settingsWireIncludesChangedDescriptionAndExactReviewHeaders() = runBlocking {
        var request: Request? = null
        val saved = original.copy(description = "New description\nSecond line")
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            request = chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(saved, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = SpaceSettingsRepository(IdentityModule.spaceSettings(http, Gson()), fixture.accounts)
        val intent = SpaceSettingsIntent(fixture.accountId, fixture.spaceId, original.name, original.etag, UUID.randomUUID().toString(), saved.description)
        assertEquals(saved, wire.save(intent))
        assertEquals(intent.etag, request!!.header("If-Match"))
        assertEquals(intent.key, request!!.header("Idempotency-Key"))
        val buffer = Buffer(); request!!.body!!.writeTo(buffer)
        val body = JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertEquals(setOf("name", "description"), body.keySet())
        assertEquals(original.name, body["name"].asString)
        assertEquals(saved.description, body["description"].asString)
    }

    @Test fun settingsResponseMustConfirmTrimmedDescription(): Unit = runBlocking {
        val intent = SpaceSettingsIntent(fixture.accountId, fixture.spaceId, original.name, original.etag, UUID.randomUUID().toString(), "  Reviewed description  ")
        for (description in listOf(null, "Other description", "  Reviewed description  ")) {
            value = original.copy(description = description)
            val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.save(intent) } }
            assertEquals("INVALID_RESPONSE", error.code)
            assertEquals("The Space settings could not be confirmed.", error.message)
        }
        value = original.copy(description = "Reviewed description")
        assertEquals(value, repository.save(intent))
    }
}