package com.community.platform.feature.spaces

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.identity.UserDto
import com.google.gson.Gson
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
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class GroupRepositoryTest {
    private val accountId = "7fe1a0cb-1a5b-4f42-9b4c-0b6d8a0f2a11"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val requestId = "81a09cbf-901e-470c-a905-27d565be91ae"
    private val token = "synthetic-session-token-with-more-than-32-characters"
    private val entry = SpaceDirectoryEntryDto(spaceId, "Weekend hikers", "Lake walks", 3, null, null, true)
    private val request = JoinRequestDto(requestId, spaceId, "Weekend hikers", "Hello", "pending", "2026-09-19T10:00:00Z", "2026-10-03T10:00:00Z", null)
    private val settings = SpaceSettingsDto(spaceId, "Weekend hikers", "group", "private", "active", "owner", "2", "2026-09-19T10:00:00Z", "\"${"a".repeat(64)}\"", "Lake walks")
    private val space = SpaceDto(spaceId, settings.name, "group", "private", "active", "owner", "2", settings.createdAt, settings.description)
    private val api = FakeApi()
    private val repository: GroupRepository
    private var model: GroupViewModel? = null

    @Before fun dispatcher() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    init {
        val store = AccountRepositoryTest.MemoryStore().apply { save(Credentials(token, accountId)) }
        val accounts = AccountRepository(AccountRepositoryTest.FakeApi(UserDto(accountId, "alex@example.test", "Alex", "UTC", true, 1), token), store, Gson())
        repository = GroupRepository(api, accounts)
    }

    @Test fun findSendsTrimmedQueryAndRejectsInconsistentEntries(): Unit = runBlocking {
        assertEquals(listOf(entry), repository.find(accountId, "  hikers ").items)
        assertEquals("hikers", api.queries.single())
        assertNull(repository.find(accountId, "   ").nextCursor)
        assertNull(api.queries.last())
        for (invalid in listOf(entry.copy(viewerRole = "member"), entry.copy(pendingRequestId = requestId), entry.copy(memberCount = 0),
            entry.copy(viewerRole = "administrator", canRequest = false), entry.copy(description = "x".repeat(281)), entry.copy(id = "not-an-id"))) {
            api.entries = listOf(invalid)
            assertThrows(IdentityFailure::class.java) { runBlocking { repository.find(accountId, "") } }
        }
        api.entries = listOf(entry, entry)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.find(accountId, "") } }
        api.entries = listOf(entry)
        api.pagination = PaginationDto(null, true)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.find(accountId, "") } }
    }

    @Test fun adminDirectoryEntriesAreAccepted(): Unit = runBlocking {
        val admin = entry.copy(viewerRole = "admin", canRequest = false)
        api.entries = listOf(admin)
        assertEquals(listOf(admin), repository.find(accountId, "").items)
        api.entries = listOf(admin.copy(canRequest = true))
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.find(accountId, "") } }
        api.entries = listOf(admin.copy(pendingRequestId = requestId))
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.find(accountId, "") } }
    }

    @Test fun groupAccessRejectsWrongScopeTypeAndUnknownRoles(): Unit = runBlocking {
        for (invalid in listOf(space.copy(id = accountId), space.copy(spaceType = "family"), space.copy(role = "administrator"))) {
            api.space = invalid
            val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.access(accountId, spaceId) } }
            assertEquals("INVALID_RESPONSE", error.code)
        }
        api.space = space.copy(role = "admin")
        assertEquals("admin", repository.access(accountId, spaceId).role)
    }

    @Test fun adminGroupAccessNeverLoadsOwnerSettings(): Unit = runBlocking {
        api.space = space.copy(role = "admin")
        val review = JoinReviewDto(requestId, "4d7dff75-e4b8-4686-b779-744cdb8d09fb", "Sam", "", request.createdAt, request.expiresAt)
        api.reviews = listOf(review)
        val value = GroupViewModel(repository).also { model = it }
        value.bind(accountId, spaceId)
        withTimeout(5000) { value.state.first { !it.busy } }
        assertEquals("admin", value.state.value.managedSpace!!.role)
        assertEquals(listOf(review), value.state.value.reviews)
        assertNull(value.state.value.settings)
        assertEquals(0, api.settingsReads)
        value.proposeVisibility(); value.confirmVisibility()
        assertTrue(!value.state.value.confirmingVisibility)
        assertTrue(api.etags.isEmpty())
        value.refresh()
        withTimeout(5000) { value.state.first { !it.busy } }
        assertEquals(2, api.pendingReads)
        assertEquals(0, api.settingsReads)
    }

    @Test fun adminApprovesAndDeclinesWithoutLoadingSettings(): Unit = runBlocking {
        api.space = space.copy(role = "admin")
        val first = JoinReviewDto(requestId, "4d7dff75-e4b8-4686-b779-744cdb8d09fb", "Sam", "", request.createdAt, request.expiresAt)
        val second = first.copy(id = "e36cd6c7-8a5f-40c8-88f4-e8c3fa4a6cff", displayName = "Casey")
        api.reviews = listOf(first)
        val value = GroupViewModel(repository).also { model = it }
        value.bind(accountId, spaceId)
        withTimeout(5000) { value.state.first { !it.busy } }
        api.request = request.copy(status = "approved", resolvedAt = "2026-09-19T11:00:00Z")
        api.reviews = listOf(second)
        value.decide(first, approve = true)
        withTimeout(5000) { value.state.first { !it.busy } }
        assertEquals("Sam joined the group.", value.state.value.notice)
        assertEquals(listOf(second), value.state.value.reviews)
        api.request = request.copy(id = second.id, status = "declined", resolvedAt = "2026-09-19T11:00:00Z")
        api.reviews = emptyList()
        value.decide(second, approve = false)
        withTimeout(5000) { value.state.first { !it.busy } }
        assertEquals("You declined Casey. They can ask again in 7 days.", value.state.value.notice)
        assertTrue(value.state.value.reviews.isEmpty())
        assertEquals(listOf(first.id to true, second.id to false), api.decisions)
        assertEquals(0, api.settingsReads)
    }

    @Test fun joinNoteKeepsWholeCharactersUpToTheServerLimit(): Unit = runBlocking {
        val value = GroupViewModel(repository).also { model = it }
        value.bind(accountId, spaceId)
        withTimeout(5000) { value.state.first { !it.busy } }
        val emoji = "\uD83D\uDE00"
        value.note(emoji.repeat(281))
        assertEquals(emoji.repeat(280), value.state.value.note)
        value.note("a" + emoji.repeat(280))
        assertEquals("a" + emoji.repeat(279), value.state.value.note)
    }

    @Test fun aRefreshDuringAnUnansweredDecisionIsNotSentSoItCannotBringBackTheRequest(): Unit = runBlocking {
        val first = JoinReviewDto(requestId, "4d7dff75-e4b8-4686-b779-744cdb8d09fb", "Sam", "", request.createdAt, request.expiresAt)
        api.reviews = listOf(first)
        val value = GroupViewModel(repository).also { model = it }
        value.bind(accountId, spaceId)
        withTimeout(5000) { value.state.first { !it.busy } }
        val reads = api.pendingReads
        val release = CompletableDeferred<Unit>()
        api.hold = release
        api.request = request.copy(status = "approved", resolvedAt = "2026-09-19T11:00:00Z")
        value.decide(first, approve = true)
        withTimeout(5000) { api.holding.await() }
        api.reviews = emptyList()
        // T82: the screen sends one request at a time, so nothing started now can answer after the decision.
        value.refresh()
        assertEquals(reads, api.pendingReads)
        release.complete(Unit)
        withTimeout(5000) { value.state.first { !it.busy } }
        assertEquals("Sam joined the group.", value.state.value.notice)
        assertTrue(value.state.value.reviews.isEmpty())
    }

    @Test fun ownerGroupAccessRetainsVisibilityControls(): Unit = runBlocking {
        val value = GroupViewModel(repository).also { model = it }
        value.bind(accountId, spaceId)
        withTimeout(5000) { value.state.first { !it.busy } }
        assertEquals(settings, value.state.value.settings)
        assertEquals(1, api.settingsReads)
        value.proposeVisibility()
        assertTrue(value.state.value.confirmingVisibility)
        api.settings = settings.copy(visibility = "public")
        value.confirmVisibility()
        withTimeout(5000) { value.state.first { !it.busy } }
        assertEquals("public", value.state.value.settings!!.visibility)
        assertEquals(listOf(settings.etag), api.etags)
        assertNull(value.state.value.pendingVisibility)
    }

    @Test fun demotionToMemberClearsGroupAccessAndBlocksDecisions(): Unit = runBlocking {
        api.space = space.copy(role = "admin")
        val review = JoinReviewDto(requestId, "4d7dff75-e4b8-4686-b779-744cdb8d09fb", "Sam", "", request.createdAt, request.expiresAt)
        api.reviews = listOf(review)
        val value = GroupViewModel(repository).also { model = it }
        value.bind(accountId, spaceId)
        withTimeout(5000) { value.state.first { !it.busy } }
        api.space = space.copy(role = "member")
        value.refresh()
        withTimeout(5000) { value.state.first { !it.busy } }
        assertNull(value.state.value.managedSpace)
        assertNull(value.state.value.settings)
        assertTrue(value.state.value.reviews.isEmpty())
        assertEquals("Only owners and admins can review join requests.", value.state.value.error)
        value.decide(review, approve = true)
        assertTrue(api.decisions.isEmpty())
        assertEquals(0, api.settingsReads)
    }

    @Test fun askKeepsTheExactIntentAndRejectsAMismatchedResult(): Unit = runBlocking {
        val intent = JoinIntent(accountId, spaceId, "Weekend hikers", "Hello", "5b6a441c-ca03-464b-882b-8fd9dea36fdf")
        assertEquals(request, repository.ask(intent))
        assertEquals(request, repository.ask(intent))
        assertEquals(listOf(intent.requestKey, intent.requestKey), api.keys)
        assertEquals(listOf(CreateJoinRequestDto("Hello"), CreateJoinRequestDto("Hello")), api.notes)
        api.request = request.copy(spaceId = accountId)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.ask(intent) } }
        api.request = request.copy(status = "approved")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.ask(intent) } }
        api.request = request.copy(note = "Changed")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.ask(intent) } }
    }

    @Test fun withdrawAndDecisionsMustReturnTheMatchingRequestAndStatus(): Unit = runBlocking {
        api.request = request.copy(status = "cancelled", resolvedAt = "2026-09-19T11:00:00Z")
        assertEquals("cancelled", repository.withdraw(accountId, requestId).status)
        api.request = request.copy(status = "approved", resolvedAt = "2026-09-19T11:00:00Z")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.withdraw(accountId, requestId) } }
        val review = JoinReviewDto(requestId, "4d7dff75-e4b8-4686-b779-744cdb8d09fb", "Sam", "", request.createdAt, request.expiresAt)
        assertEquals("approved", repository.decide(accountId, spaceId, review, approve = true).status)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.decide(accountId, spaceId, review, approve = false) } }
        api.reviews = listOf(review.copy(accountId = accountId))
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.pending(accountId, spaceId) } }
        api.request = request.copy(status = "pending", resolvedAt = "2026-09-19T11:00:00Z")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.mine(accountId) } }
    }

    @Test fun visibilityChangesOnlyAGroupAndMustConfirmTheRequestedVisibility(): Unit = runBlocking {
        val intent = VisibilityIntent(accountId, spaceId, "public", settings.etag, "0d6f7f1e-27f0-4c8e-9a52-7a65f1b6e2c3")
        api.settings = settings.copy(visibility = "public")
        assertEquals("public", repository.changeVisibility(intent).visibility)
        assertEquals(settings.etag, api.etags.single())
        api.settings = settings
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.changeVisibility(intent) } }
        api.settings = settings.copy(spaceType = "family")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.settings(accountId, spaceId) } }
    }

    inner class FakeApi : GroupApi {
        var entries = listOf(entry)
        var pagination: PaginationDto? = PaginationDto(null, false)
        var request = this@GroupRepositoryTest.request
        var reviews: List<JoinReviewDto> = emptyList()
        var settings = this@GroupRepositoryTest.settings
        var space = this@GroupRepositoryTest.space
        var settingsReads = 0
        var pendingReads = 0
        val decisions = mutableListOf<Pair<String, Boolean>>()
        val queries = mutableListOf<String?>()
        val keys = mutableListOf<String>()
        val notes = mutableListOf<CreateJoinRequestDto>()
        val etags = mutableListOf<String>()
        var failure = 0
        var hold: CompletableDeferred<Unit>? = null
        val holding = CompletableDeferred<Unit>()

        private fun <Value> result(value: Value, paged: Boolean = false): Response<EnvelopeDto<Value>> {
            if (failure != 0) return Response.error(failure, """{"error":{"code":"SYNTHETIC","message":"Synthetic failure"}}""".toResponseBody("application/json".toMediaType()))
            return Response.success(EnvelopeDto(value, null, if (paged) pagination else null))
        }

        override suspend fun directory(authorization: String, query: String?, cursor: String?, limit: Int) = result(entries, paged = true).also { queries.add(query) }
        override suspend fun ask(authorization: String, spaceId: String, key: String, body: CreateJoinRequestDto) = result(request).also { keys.add(key); notes.add(body) }
        override suspend fun cancel(authorization: String, requestId: String, body: Map<String, String>) = result(request)
        override suspend fun mine(authorization: String) = result(listOf(request))
        override suspend fun pending(authorization: String, spaceId: String) = result(reviews).also { pendingReads += 1 }
        override suspend fun approve(authorization: String, spaceId: String, requestId: String, body: Map<String, String>): Response<EnvelopeDto<JoinRequestDto>> {
            hold?.let { holding.complete(Unit); it.await() }
            return result(request).also { decisions.add(requestId to true) }
        }
        override suspend fun decline(authorization: String, spaceId: String, requestId: String, body: Map<String, String>) = result(request).also { decisions.add(requestId to false) }
        override suspend fun space(authorization: String, spaceId: String) = result(space)
        override suspend fun settings(authorization: String, spaceId: String) = result(settings).also { settingsReads += 1 }
        override suspend fun visibility(authorization: String, spaceId: String, etag: String, key: String, body: VisibilityChangeDto) = result(settings).also { etags.add(etag) }
    }
}
