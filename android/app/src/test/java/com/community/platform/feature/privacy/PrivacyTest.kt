package com.community.platform.feature.privacy

import com.community.platform.IdentityModule
import com.community.platform.feature.agents.AgentDeletedDto
import com.community.platform.feature.agents.AgentMemoryDto
import com.community.platform.feature.agents.AgentRepository
import com.community.platform.feature.community.ClassificationRepository
import com.community.platform.feature.community.CommunityRepository
import com.community.platform.feature.community.InterestsDto
import com.community.platform.feature.community.SetInterestsDto
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.identity.SecurityEventDto
import com.community.platform.feature.scheduling.ReminderDto
import com.community.platform.feature.scheduling.ReminderPreferenceDto
import com.community.platform.feature.scheduling.ReminderRecipientDto
import com.community.platform.feature.scheduling.ReminderRepository
import com.community.platform.feature.scheduling.ReminderRequestDto
import com.community.platform.feature.scheduling.UpdateReminderPreferenceDto
import com.google.gson.Gson
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.util.Collections

/** The Privacy page (T164, DEC-034) against a synthetic server behind the real HTTP client: it lists what is allowed and takes each back through the operation that owns it. */
@OptIn(ExperimentalCoroutinesApi::class)
class PrivacyTest {
    private val gson = Gson()
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val otherId = "0f97b948-9800-432f-9d15-407df739d08e"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val taskId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
    private val standingRequest = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
    private val endedRequest = "8b2eac20-1b89-4e77-8c4b-3b3b9f8b3c04"
    private val pendingRequest = "9b2eac20-1b89-4e77-8c4b-3b3b9f8b3c05"
    private val standingReminder = "81a09cbf-901e-470c-a905-27d565be91ae"
    private val endedReminder = "426ca72f-3c77-409d-90a1-4da512c00421"
    private val memoryId = "3c5354a9-9967-4314-bdee-9c2f23b227a1"
    private val token = "synthetic-session-token-with-more-than-32-characters"

    private fun request(id: String, status: String, reminderId: String?) = ReminderRequestDto(
        id, taskId, spaceId, "Water the plants", "1", ReminderRecipientDto(otherId, "Sam"), ReminderRecipientDto(accountId, "Alex"),
        "2026-11-01T18:00", "UTC", "2026-11-01T18:00:00Z", "2026-11-02T18:00:00Z", "2026-11-01T06:00:00Z", "2026-10-01T05:00:00Z",
        if (status == "pending") null else "2026-10-01T06:00:00Z", status, false, reminderId, "1", "in_app",
    )
    private fun reminder(id: String, status: String) = ReminderDto(id, taskId, spaceId, "Water the plants", "2026-11-01T18:00", "UTC",
        "2026-11-01T18:00:00Z", "2026-11-02T18:00:00Z", status, null, false, null, "1", "in_app")
    private val memory = AgentMemoryDto(memoryId, "preference", null, "Meals", "Prefers vegetarian meals", "conversation", null, "2026-10-01T07:00:00Z")
    private val event = SecurityEventDto("5b1d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4", "session.created", "2026-10-01T05:00:00Z")

    /** Keeps each permission where its own feature keeps it; every list comes one item per page, so paging is always exercised. */
    inner class Server {
        val store = AccountRepositoryTest.MemoryStore().apply { save(Credentials(token, accountId)) }
        val mutations: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val bodies: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val ifMatch: MutableList<String?> = Collections.synchronizedList(mutableListOf())
        val directions: MutableList<String?> = Collections.synchronizedList(mutableListOf())
        val requests = listOf(request(standingRequest, "accepted", standingReminder), request(endedRequest, "accepted", endedReminder), request(pendingRequest, "pending", null))
        val reminders = linkedMapOf(standingReminder to reminder(standingReminder, "scheduled"), endedReminder to reminder(endedReminder, "cancelled"))
        @Volatile var preference = ReminderPreferenceDto(true, "1")
        @Volatile var memories = listOf(memory)
        @Volatile var interests = InterestsDto(listOf("technology"), emptyList(), emptyList(), emptyList(), "\"i1\"")
        @Volatile var signedOut = false
        @Volatile var offline = false

        private fun json(code: Int, body: String, request: Request, etag: String? = null) = okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1)
            .code(code).message("Synthetic").apply { if (etag != null) header("ETag", etag) }
            .body(body.toResponseBody("application/json".toMediaType())).build()
        private fun <Value> ok(value: Value, request: Request, pagination: PaginationDto? = null, etag: String? = null) =
            json(200, gson.toJson(EnvelopeDto(value, null, pagination)), request, etag)
        private fun error(code: Int, name: String, request: Request) =
            json(code, gson.toJson(mapOf("error" to mapOf("code" to name, "message" to "Synthetic $name", "details" to emptyMap<String, String>()))), request)
        private fun <Value> paged(items: List<Value>, request: Request): okhttp3.Response {
            val start = request.url.queryParameter("cursor")?.toInt() ?: 0
            val next = (start + 1).takeIf { it < items.size }?.toString()
            return ok(items.drop(start).take(1), request, PaginationDto(next, next != null))
        }

        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request()
            if (offline) throw IOException("Synthetic: no connection")
            val buffer = Buffer(); request.body?.writeTo(buffer); val body = buffer.readUtf8()
            val path = request.url.encodedPath
            if (request.method != "GET") { mutations += "${request.method} $path"; bodies += body; ifMatch += request.header("If-Match") }
            when {
                signedOut -> error(401, "AUTHENTICATION_REQUIRED", request)
                path == "/v1/reminder-requests" -> { directions += request.url.queryParameter("direction"); paged(requests, request) }
                path == "/v1/reminders" -> paged(reminders.values.toList(), request)
                path == "/v1/reminders/$standingReminder/cancel" -> {
                    reminders[standingReminder] = reminders.getValue(standingReminder).copy(status = "cancelled", version = "2")
                    ok(reminders.getValue(standingReminder), request)
                }
                path == "/v1/me/notification-preferences" && request.method == "GET" -> ok(preference, request, etag = "\"${preference.version}\"")
                path == "/v1/me/notification-preferences" && request.method == "PATCH" ->
                    if (request.header("If-Match") != "\"${preference.version}\"") error(412, "CONTENT_CHANGED", request)
                    else {
                        preference = ReminderPreferenceDto(gson.fromJson(body, UpdateReminderPreferenceDto::class.java).enabled, "${preference.version.toInt() + 1}")
                        ok(preference, request, etag = "\"${preference.version}\"")
                    }
                path == "/v1/agent-memories" -> ok(memories, request)
                path == "/v1/agent-memories/$memoryId" && request.method == "DELETE" -> { memories = emptyList(); ok(AgentDeletedDto(memoryId, "deleted"), request) }
                path == "/v1/me/interests" && request.method == "GET" -> ok(interests, request)
                path == "/v1/me/interests" && request.method == "PUT" ->
                    if (request.header("If-Match") != interests.etag) error(412, "CONTENT_CHANGED", request)
                    else {
                        val sent = gson.fromJson(body, SetInterestsDto::class.java)
                        interests = InterestsDto(sent.topics, sent.interests, sent.languages, sent.places, "\"i2\"")
                        ok(interests, request)
                    }
                path == "/v1/me/security-events" -> ok(listOf(event), request)
                else -> error(404, "NOT_FOUND", request)
            }
        }.build()

        val accounts = AccountRepository(IdentityModule.api(http, gson), store, gson)
        val model = PrivacyViewModel(
            ReminderRepository(IdentityModule.reminders(http, gson), accounts),
            AgentRepository(IdentityModule.agents(http, gson), accounts),
            ClassificationRepository(IdentityModule.classification(http, gson), CommunityRepository(IdentityModule.community(http, gson), accounts)),
            accounts,
        )
    }

    private var current: PrivacyViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { current?.bind(null); Dispatchers.resetMain() }

    private suspend fun settled(model: PrivacyViewModel) = withTimeout(5000) { model.state.first { !it.loading && !it.working } }
    private suspend fun opened(server: Server): PrivacyState {
        current = server.model
        server.model.bind(accountId)
        return settled(server.model)
    }
    private suspend fun takeBack(model: PrivacyViewModel, item: TakeBack): PrivacyState {
        model.ask(item)
        assertEquals(item, model.state.value.confirm)
        model.confirm()
        return settled(model)
    }

    @Test fun listsWhatIsAllowedAndTakesEachBackThroughItsOwnOperation(): Unit = runBlocking {
        val server = Server()
        var state = opened(server)
        // Only the accepted request whose reminder is still to come lets someone remind this person.
        assertEquals(listOf(standingRequest), state.requests.map { it.id })
        assertEquals(listOf("received"), server.directions.distinct())
        assertEquals(true, state.inApp?.value?.enabled)
        assertEquals(listOf(memoryId), state.memories.map { it.id })
        assertEquals(1, state.interestCount)
        assertEquals(listOf("session.created"), state.activity.map { it.action })
        assertNull(state.issue)
        assertTrue("opening the page changes nothing", server.mutations.isEmpty())

        state = takeBack(server.model, TakeBack.Request(state.requests.single()))
        assertTrue(state.done)
        assertNull(state.confirm)
        assertTrue(state.requests.isEmpty())
        state = takeBack(server.model, TakeBack.InApp("Reminders in your inbox", state.inApp!!.etag))
        assertEquals(false, state.inApp?.value?.enabled)
        state = takeBack(server.model, TakeBack.Memory(state.memories.single()))
        assertTrue(state.memories.isEmpty())
        state = takeBack(server.model, TakeBack.Interests("Interests", state.interests!!))
        assertEquals(0, state.interestCount)
        assertTrue(state.done)
        assertNull(state.issue)

        assertEquals(listOf("POST /v1/reminders/$standingReminder/cancel", "PATCH /v1/me/notification-preferences",
            "DELETE /v1/agent-memories/$memoryId", "PUT /v1/me/interests"), server.mutations)
        assertEquals("{\"in_app_reminders_enabled\":false}", server.bodies[1])
        assertEquals(listOf(null, "\"1\"", null, "\"i1\""), server.ifMatch)
        val cleared = gson.fromJson(server.bodies[3], SetInterestsDto::class.java)
        assertTrue(cleared.topics.isEmpty() && cleared.interests.isEmpty() && cleared.languages.isEmpty() && cleared.places.isEmpty())
    }

    @Test fun aRefusedTakeBackSaysSoAndShowsWhatIsCurrent(): Unit = runBlocking {
        val server = Server()
        val opened = opened(server)
        // Changed on another device after this page loaded: the server refuses the older version instead of overwriting it.
        server.preference = ReminderPreferenceDto(true, "2")
        val refused = takeBack(server.model, TakeBack.InApp("Reminders in your inbox", opened.inApp!!.etag))
        assertEquals(PrivacyIssue.TAKE_BACK, refused.issue)
        assertFalse(refused.done)
        assertNull(refused.confirm)
        assertEquals("\"2\"", refused.inApp?.etag)
        assertEquals(true, refused.inApp?.value?.enabled)

        val retried = takeBack(server.model, TakeBack.InApp("Reminders in your inbox", refused.inApp!!.etag))
        assertNull(retried.issue)
        assertTrue(retried.done)
        assertEquals(false, retried.inApp?.value?.enabled)
        assertEquals(listOf("\"1\"", "\"2\""), server.ifMatch)
    }

    @Test fun keepingSendsNothing(): Unit = runBlocking {
        val server = Server()
        val state = opened(server)
        server.model.ask(TakeBack.Memory(state.memories.single()))
        server.model.keep()
        assertNull(server.model.state.value.confirm)
        // Confirming with nothing asked does nothing either.
        server.model.confirm()
        assertFalse(server.model.state.value.working)
        assertTrue(server.mutations.isEmpty())
        assertEquals(1, server.model.state.value.memories.size)
    }

    @Test fun noConnectionIsNamedAndALostSessionAsksToSignInAgain(): Unit = runBlocking {
        val offline = Server().apply { offline = true }
        assertEquals(PrivacyIssue.CONNECTION, opened(offline).issue)
        offline.model.bind(null)

        val signedOut = Server().apply { signedOut = true }
        current = signedOut.model
        signedOut.model.bind(accountId)
        val state = withTimeout(5000) { signedOut.model.state.first { it.requiresSignIn } }
        assertTrue(state.requests.isEmpty())
        assertNull(state.issue)
        assertTrue(signedOut.mutations.isEmpty())
    }
}
