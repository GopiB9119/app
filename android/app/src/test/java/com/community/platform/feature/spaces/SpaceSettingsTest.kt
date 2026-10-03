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
import java.io.IOException
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class SpaceSettingsTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val original = SpaceSettingsDto(fixture.spaceId, "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z", "\"${"a".repeat(64)}\"")
    private var value = original
    private var failure = 0
    private val commands = mutableListOf<Triple<String, String, EditSpaceSettingsDto>>()
    private val policyCommands = mutableListOf<Triple<String, String, InvitePolicyDto>>()
    private val agentCommands = mutableListOf<Triple<String, String, AgentPolicyDto>>()
    private var policyError: Exception? = null
    private var reads = 0
    private val api = object : SpaceSettingsApi {
        override suspend fun read(authorization: String, spaceId: String): Response<EnvelopeDto<SpaceSettingsDto>> {
            assertEquals("Bearer ${fixture.token}", authorization)
            reads += 1
            return result()
        }
        override suspend fun save(authorization: String, spaceId: String, etag: String, key: String, body: EditSpaceSettingsDto): Response<EnvelopeDto<SpaceSettingsDto>> {
            commands.add(Triple(key, etag, body))
            return result()
        }
        override suspend fun invitePolicy(authorization: String, spaceId: String, etag: String, key: String, body: InvitePolicyDto): Response<EnvelopeDto<SpaceSettingsDto>> {
            assertEquals("Bearer ${fixture.token}", authorization)
            assertEquals(fixture.spaceId, spaceId)
            policyCommands.add(Triple(key, etag, body))
            policyError?.let { throw it }
            return result()
        }
        override suspend fun agentPolicy(authorization: String, spaceId: String, etag: String, key: String, body: AgentPolicyDto): Response<EnvelopeDto<SpaceSettingsDto>> {
            assertEquals("Bearer ${fixture.token}", authorization)
            assertEquals(fixture.spaceId, spaceId)
            agentCommands.add(Triple(key, etag, body))
            policyError?.let { throw it }
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

    @Test fun invitePolicyWireSendsExactPathHeadersAndBooleanBody(): Unit = runBlocking {
        var request: Request? = null
        var response = original.copy(memberInvites = true, version = "2", etag = "\"${"b".repeat(64)}\"")
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            request = chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(response, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = SpaceSettingsRepository(IdentityModule.spaceSettings(http, Gson()), fixture.accounts)
        for (enabled in listOf(true, false)) {
            response = response.copy(memberInvites = enabled)
            val intent = InvitePolicyIntent(fixture.accountId, fixture.spaceId, enabled, original.etag, UUID.randomUUID().toString())
            assertEquals(response, wire.changeInvitePolicy(intent))
            assertEquals("POST", request!!.method)
            assertEquals("/v1/spaces/${fixture.spaceId}/invite-policy", request!!.url.encodedPath)
            assertEquals("Bearer ${fixture.token}", request!!.header("Authorization"))
            assertEquals(intent.etag, request!!.header("If-Match"))
            assertEquals(intent.requestKey, request!!.header("Idempotency-Key"))
            val buffer = Buffer(); request!!.body!!.writeTo(buffer)
            val body = JsonParser.parseString(buffer.readUtf8()).asJsonObject
            assertEquals(setOf("member_invites"), body.keySet())
            assertEquals(enabled, body["member_invites"].asBoolean)
        }
    }

    @Test fun invitePolicyResultMustMatchSpaceOwnerAndRequestedChoice(): Unit = runBlocking {
        val intent = InvitePolicyIntent(fixture.accountId, fixture.spaceId, true, original.etag, UUID.randomUUID().toString())
        for (invalid in listOf(original, original.copy(id = fixture.accountId, memberInvites = true),
            original.copy(role = "member", memberInvites = true), original.copy(spaceType = "couple", memberInvites = true))) {
            value = invalid
            val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.changeInvitePolicy(intent) } }
            assertEquals("INVALID_RESPONSE", error.code)
        }
        value = original.copy(memberInvites = true)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.changeInvitePolicy(intent.copy(memberInvites = false)) } }
        value = original.copy(spaceType = "solo")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.changeInvitePolicy(intent.copy(memberInvites = false)) } }
    }

    @Test fun invitePolicyProposesCancelsAndConfirmsBothChoices() = runBlocking {
        val current = ready()
        current.proposeInvitePolicy()
        assertTrue(current.state.value.confirmingInvitePolicy)
        assertTrue(policyCommands.isEmpty())
        current.cancelInvitePolicy()
        current.confirmInvitePolicy()
        assertFalse(current.state.value.confirmingInvitePolicy)
        assertTrue(policyCommands.isEmpty())
        for (enabled in listOf(true, false)) {
            current.proposeInvitePolicy()
            value = original.copy(memberInvites = enabled, version = if (enabled) "2" else "3", etag = "\"${"b".repeat(64)}\"")
            current.confirmInvitePolicy(); idle(current)
            assertEquals(value, current.state.value.basis)
            assertEquals(enabled, policyCommands.last().third.memberInvites)
            assertNull(current.state.value.pendingInvitePolicy)
            assertFalse(current.state.value.confirmingInvitePolicy)
            assertFalse(current.state.value.locked)
            assertEquals(if (enabled) "Everyone in the Space can now invite people." else "Only you and admins can invite people now.", current.state.value.notice)
        }
        assertEquals(original.etag, policyCommands.first().second)
        assertEquals(value.etag, policyCommands.last().second)
        assertNotEquals(policyCommands.first().first, policyCommands.last().first)
    }

    @Test fun invitePolicyUnansweredRequestRetriesSameKeyEtagAndBody() = runBlocking {
        val current = ready()
        current.proposeInvitePolicy()
        policyError = IOException("Synthetic unanswered request")
        current.confirmInvitePolicy(); idle(current)
        val intent = current.state.value.pendingInvitePolicy!!
        assertTrue(current.state.value.confirmingInvitePolicy)
        assertTrue(current.state.value.locked)
        assertFalse(current.state.value.conflict)
        assertEquals("No connection. Changes are not confirmed.", current.state.value.error)
        current.cancelInvitePolicy(); current.proposeInvitePolicy(); current.reload(); current.refresh()
        current.name("Different name"); current.description("Different description"); current.save()
        assertEquals(original.name, current.state.value.name)
        assertEquals("", current.state.value.description)
        assertEquals(1, reads)
        assertEquals(1, policyCommands.size)
        assertTrue(commands.isEmpty())
        policyError = null
        value = original.copy(memberInvites = true, version = "2")
        current.retry(); idle(current)
        assertEquals(2, policyCommands.size)
        assertEquals(policyCommands[0], policyCommands[1])
        assertEquals(intent.requestKey, policyCommands.last().first)
        assertEquals(intent.etag, policyCommands.last().second)
        assertEquals(intent.memberInvites, policyCommands.last().third.memberInvites)
        assertEquals(intent.requestKey, UUID.fromString(intent.requestKey).toString())
        assertNull(current.state.value.pendingInvitePolicy)
    }

    @Test fun invitePolicyConflictReloadsSettingsBeforeAnotherReview() = runBlocking {
        val current = ready()
        current.proposeInvitePolicy()
        policyError = IdentityFailure("SPACE_CHANGED", "This Space changed. Reload and review it again.", 412)
        value = original.copy(name = "Other edit", version = "2", etag = "\"${"b".repeat(64)}\"")
        current.confirmInvitePolicy(); idle(current)
        assertEquals(2, reads)
        assertEquals(value, current.state.value.basis)
        assertEquals(value.name, current.state.value.name)
        assertNull(current.state.value.pendingInvitePolicy)
        assertFalse(current.state.value.confirmingInvitePolicy)
        assertFalse(current.state.value.conflict)
        assertEquals("This Space changed. Reload and review it again.", current.state.value.notice)
        current.retry(); current.confirmInvitePolicy()
        assertEquals(1, policyCommands.size)
        policyError = null
        current.proposeInvitePolicy()
        value = value.copy(memberInvites = true, version = "3")
        current.confirmInvitePolicy(); idle(current)
        assertEquals(value.etag, policyCommands.last().second)
        assertNotEquals(policyCommands.first().first, policyCommands.last().first)
    }

    @Test fun agentPolicyWireSendsExactPathAndRejectsAMismatchedResult(): Unit = runBlocking {
        var request: Request? = null
        val response = original.copy(agentEnabled = false, version = "2", etag = "\"${"b".repeat(64)}\"")
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            request = chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(response, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = SpaceSettingsRepository(IdentityModule.spaceSettings(http, Gson()), fixture.accounts)
        val intent = AgentPolicyIntent(fixture.accountId, fixture.spaceId, false, original.etag, UUID.randomUUID().toString())
        assertEquals(response, wire.changeAgentPolicy(intent))
        assertEquals("POST", request!!.method)
        assertEquals("/v1/spaces/${fixture.spaceId}/agent-policy", request!!.url.encodedPath)
        assertEquals(intent.etag, request!!.header("If-Match"))
        assertEquals(intent.requestKey, request!!.header("Idempotency-Key"))
        val buffer = Buffer(); request!!.body!!.writeTo(buffer)
        val body = JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertEquals(setOf("agent_enabled"), body.keySet())
        assertFalse(body["agent_enabled"].asBoolean)
        val error = assertThrows(IdentityFailure::class.java) { runBlocking { wire.changeAgentPolicy(intent.copy(agentEnabled = true)) } }
        assertEquals("INVALID_RESPONSE", error.code)
    }

    @Test fun agentPolicyConfirmsBothChoicesAndRetriesTheSameRequest() = runBlocking {
        val current = ready()
        assertTrue(current.state.value.basis!!.agentEnabled)
        current.proposeAgentPolicy(); current.cancelAgentPolicy(); current.confirmAgentPolicy()
        assertTrue(agentCommands.isEmpty())
        current.proposeAgentPolicy()
        policyError = IOException("Synthetic unanswered request")
        current.confirmAgentPolicy(); idle(current)
        val intent = current.state.value.pendingAgentPolicy!!
        assertTrue(current.state.value.locked)
        current.proposeInvitePolicy(); current.save()
        assertFalse(current.state.value.confirmingInvitePolicy)
        policyError = null
        value = original.copy(agentEnabled = false, version = "2", etag = "\"${"b".repeat(64)}\"")
        current.retry(); idle(current)
        assertEquals(2, agentCommands.size)
        assertEquals(agentCommands[0], agentCommands[1])
        assertEquals(intent.requestKey, agentCommands.last().first)
        assertFalse(agentCommands.last().third.agentEnabled)
        assertEquals("The agent is off in this Space.", current.state.value.notice)
        assertFalse(current.state.value.locked)
        current.proposeAgentPolicy()
        value = value.copy(agentEnabled = true, version = "3")
        current.confirmAgentPolicy(); idle(current)
        assertTrue(agentCommands.last().third.agentEnabled)
        assertEquals("\"${"b".repeat(64)}\"", agentCommands.last().second)
        assertEquals("The agent is on in this Space.", current.state.value.notice)
        assertTrue(policyCommands.isEmpty())
    }

    @Test fun agentPolicyNeedsTheOwnerAndSavedSettings() = runBlocking {
        val current = ready()
        current.name("Unsaved name")
        current.proposeAgentPolicy()
        assertFalse(current.state.value.confirmingAgentPolicy)
        current.name(original.name)
        value = original.copy(spaceType = "solo")
        current.reload(); idle(current)
        current.proposeAgentPolicy()
        assertTrue(current.state.value.confirmingAgentPolicy)
    }

    @Test fun invitePolicyRequiresFamilyOrGroupAndSavedSettings() = runBlocking {
        val current = ready()
        current.name("Unsaved name")
        current.proposeInvitePolicy()
        assertFalse(current.state.value.confirmingInvitePolicy)
        current.reload(); idle(current)
        for (type in listOf("couple", "solo")) {
            value = original.copy(spaceType = type)
            current.reload(); idle(current)
            current.proposeInvitePolicy(); current.confirmInvitePolicy()
            assertFalse(current.state.value.confirmingInvitePolicy)
        }
        assertTrue(policyCommands.isEmpty())
        value = original.copy(spaceType = "group")
        current.reload(); idle(current)
        current.proposeInvitePolicy()
        assertTrue(current.state.value.confirmingInvitePolicy)
    }

    @Test fun invitePolicyBusyConfirmationPreventsDoubleSends() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val delayed = object : SpaceSettingsApi by api {
            override suspend fun invitePolicy(authorization: String, spaceId: String, etag: String, key: String, body: InvitePolicyDto): Response<EnvelopeDto<SpaceSettingsDto>> {
                val response = api.invitePolicy(authorization, spaceId, etag, key, body)
                entered.complete(Unit); release.await()
                return response
            }
        }
        val current = SpaceSettingsViewModel(SpaceSettingsRepository(delayed, fixture.accounts))
        model = current
        current.bind(fixture.accountId, fixture.spaceId); idle(current)
        current.proposeInvitePolicy()
        value = original.copy(memberInvites = true, version = "2")
        current.confirmInvitePolicy()
        withTimeout(5000) { entered.await() }
        current.confirmInvitePolicy(); current.retry(); current.cancelInvitePolicy(); current.reload(); current.save()
        assertEquals(1, policyCommands.size)
        assertEquals(1, reads)
        assertTrue(current.state.value.busy)
        release.complete(Unit); idle(current)
        assertNull(current.state.value.pendingInvitePolicy)
        assertTrue(current.state.value.basis!!.memberInvites)
    }

    @Test fun settingsMemberInvitationsAreValidOnlyForFamilyAndGroup(): Unit = runBlocking {
        for (type in listOf("family", "group")) {
            value = original.copy(spaceType = type, memberInvites = true)
            assertTrue(repository.read(fixture.accountId, fixture.spaceId).memberInvites)
        }
        for (type in listOf("couple", "solo")) {
            value = original.copy(spaceType = type, memberInvites = true)
            val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.read(fixture.accountId, fixture.spaceId) } }
            assertEquals("INVALID_RESPONSE", error.code)
        }
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