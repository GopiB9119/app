package com.community.platform.feature.events

import androidx.lifecycle.viewModelScope
import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger

@OptIn(ExperimentalCoroutinesApi::class)
class EventsTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val spaceId = fixture.spaceId
    private val eventId = "6a3c6e31-8f8e-4d71-8d84-3f7c6c5e4d04"
    private val event = EventDto(
        id = eventId, spaceId = spaceId, spaceName = "Morgan family", title = "Dinner", description = "", location = "", timezone = "Asia/Kolkata",
        localStart = "2026-09-25T18:30", localEnd = "2026-09-25T21:00", startsAt = "2026-09-25T13:00:00Z", endsAt = "2026-09-25T15:30:00Z",
        status = "scheduled", ended = false, createdByName = "Sam", createdAt = "2026-09-19T10:00:00Z", updatedAt = "2026-09-19T10:00:00Z",
        scheduleChangedAt = null, cancelledAt = null, going = 0, maybe = 0, notGoing = 0, myResponse = null, myResponseOutdated = false,
        canManage = true, canRespond = true, etag = "\"1\"",
    )
    private val detail = event.copy(attendees = emptyList())

    private fun <Value> ok(value: Value, pagination: PaginationDto? = null): Response<EnvelopeDto<Value>> = Response.success(EnvelopeDto(value, null, pagination))
    private fun <Value> failed(status: Int, code: String = "SYNTHETIC"): Response<EnvelopeDto<Value>> =
        Response.error(status, """{"error":{"code":"$code","message":"Synthetic $code","details":{}}}""".toResponseBody("application/json".toMediaType()))

    inner class FakeApi : EventsApi {
        var upcoming = listOf(event)
        var past = emptyList<EventDto>()
        var current = detail
        var listFailure = 0
        var nextCursor: String? = null
        var createFailure = 0
        var createCode = "SYNTHETIC"
        var wrongResponse = false
        val periods = mutableListOf<String>()
        val creates = mutableListOf<Pair<String, EventBodyDto>>()
        val updates = mutableListOf<Pair<String, EventBodyDto>>()
        val cancels = mutableListOf<String>()
        val responses = mutableListOf<String>()
        override suspend fun list(authorization: String, spaceId: String, period: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<EventDto>>> {
            periods += period
            return if (listFailure != 0) failed(listFailure) else ok(if (period == "past") past else upcoming, PaginationDto(nextCursor, nextCursor != null))
        }
        override suspend fun read(authorization: String, eventId: String) = ok(current)
        override suspend fun create(authorization: String, spaceId: String, key: String, body: EventBodyDto): Response<EnvelopeDto<EventDto>> {
            creates += key to body
            return if (createFailure != 0) failed(createFailure, createCode)
            else ok(detail.copy(title = body.title, location = body.location, description = body.description, timezone = body.timezone, localStart = body.localStart, localEnd = body.localEnd, endsAt = body.localEnd?.let { event.endsAt }))
        }
        override suspend fun update(authorization: String, eventId: String, etag: String, body: EventBodyDto): Response<EnvelopeDto<EventDto>> {
            updates += etag to body
            return ok(current.copy(localStart = body.localStart, localEnd = body.localEnd, endsAt = body.localEnd?.let { event.endsAt }, scheduleChangedAt = "2026-09-19T10:05:00Z", etag = "\"2\""))
        }
        override suspend fun cancel(authorization: String, eventId: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<EventDto>> {
            cancels += etag
            return ok(current.copy(status = "cancelled", cancelledAt = "2026-09-19T10:06:00Z", canRespond = false, etag = "\"3\""))
        }
        override suspend fun respond(authorization: String, eventId: String, body: AttendanceDto): Response<EnvelopeDto<EventDto>> {
            responses += body.response
            val answer = if (wrongResponse) "maybe" else body.response
            return ok(current.copy(
                myResponse = answer, myResponseOutdated = false, going = if (answer == "going") 1 else 0, maybe = if (answer == "maybe") 1 else 0,
                attendees = listOf(AttendeeDto("Sam", answer, "2026-09-19T10:07:00Z", outdated = false, mine = true)),
            ))
        }
    }

    private val api = FakeApi()
    private val repository = EventsRepository(api, fixture.accounts)
    private var model: EventsViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup(): Unit = runBlocking {
        try { finishTestWork() } finally { Dispatchers.resetMain() }
    }

    private suspend fun finishTestWork() {
        model?.let { current ->
            current.bind(null, null, "UTC")
            withTimeout(5000) { requireNotNull(current.viewModelScope.coroutineContext[Job]).cancelAndJoin() }
        }
    }

    private suspend fun idle(current: EventsViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(): EventsViewModel {
        val current = EventsViewModel(repository); model = current
        current.bind(fixture.accountId, spaceId, "Asia/Kolkata"); idle(current)
        return current
    }

    @Test fun rejectsInconsistentEventFacts() {
        val bad = listOf(
            event.copy(status = "draft"), event.copy(status = "cancelled", canRespond = false), event.copy(endsAt = null),
            event.copy(endsAt = "2026-09-25T12:00:00Z"), event.copy(going = -1), event.copy(myResponse = "yes"),
            event.copy(myResponseOutdated = true), event.copy(etag = null), event.copy(title = " "), event.copy(localStart = "2026-02-30T10:00"),
            event.copy(status = "cancelled", cancelledAt = "2026-09-19T10:06:00Z"), event.copy(ended = true),
            event.copy(attendees = listOf(AttendeeDto("Sam", "going", "2026-09-19T10:07:00Z", false, true), AttendeeDto("Ana", "maybe", "2026-09-19T10:08:00Z", false, true))),
        )
        for (value in bad) assertThrows(IdentityFailure::class.java) { repository.event(value) }
        assertThrows(IdentityFailure::class.java) { repository.event(event, spaceId = eventId) }
        assertThrows(IdentityFailure::class.java) { repository.event(event, detail = true) }
        assertEquals(event, repository.event(event))
        assertEquals(detail, repository.event(detail, spaceId, detail = true))
    }

    // DEC-032 (T154): capacity and waitlist facts, and what a form sends.
    @Test fun capacityAndWaitlistFactsAreChecked() {
        val full = event.copy(capacity = 2, going = 2, waitlisted = 2, myResponse = "going", myWaitlistPosition = 2)
        assertEquals(full, repository.event(full))
        val waiting = AttendeeDto("Ravi", "going", "2026-09-19T10:07:00Z", false, false, waitlistPosition = 1)
        assertEquals(full.copy(attendees = listOf(waiting)), repository.event(full.copy(attendees = listOf(waiting))))
        for (value in listOf(
            full.copy(capacity = null), full.copy(going = 3), full.copy(going = 1), full.copy(myResponse = "maybe"),
            full.copy(myWaitlistPosition = 3), full.copy(myWaitlistPosition = 0), full.copy(capacity = 501, going = 2),
            full.copy(attendees = listOf(waiting.copy(response = "maybe"))), full.copy(attendees = listOf(waiting.copy(waitlistPosition = 3))),
        )) assertThrows(IdentityFailure::class.java) { repository.event(value) }
    }

    @Test fun capacityIsSentOnlyWhenChosenOrRemoved() = runBlocking {
        assertEquals(CapacityChoice.Leave, capacityChoice(" ", null))
        assertEquals(CapacityChoice.Unlimited, capacityChoice("", 4))
        assertEquals(CapacityChoice.Leave, capacityChoice("4", 4))
        assertEquals(CapacityChoice.Limit(12), capacityChoice(" 12 ", null))
        for (text in listOf("0", "501", "2.5", "-1", "ten", "1000")) assertNull(text, capacityChoice(text, null))
        val gson = Gson().newBuilder().serializeNulls().create()
        val base = eventBody("Dinner", "", "", "Asia/Kolkata", "2026-09-25", "18:30", "")
        assertFalse(JsonParser.parseString(gson.toJson(base)).asJsonObject.has("capacity"))
        assertTrue(JsonParser.parseString(gson.toJson(base.copy(capacity = CapacityChoice.Unlimited))).asJsonObject.get("capacity").isJsonNull)
        assertEquals(7, JsonParser.parseString(gson.toJson(base.copy(capacity = CapacityChoice.Limit(7)))).asJsonObject.get("capacity").asInt)
        val current = ready()
        current.startCreate()
        current.draft { it.copy(title = "Dinner", date = "2026-09-25", start = "18:30", capacity = "0") }
        current.save(); idle(current)
        assertEquals(EventProblem.CAPACITY, current.state.value.problem)
        assertTrue(api.creates.isEmpty())
    }

    @Test fun formProblemsAreFoundBeforeSending() = runBlocking {
        assertEquals(
            EventBodyDto("Family dinner", "Bring\nsalad", "Home", "Asia/Kolkata", "2026-09-25T18:30", null),
            eventBody("  Family   dinner ", " Bring\r\nsalad ", "  Home ", " Asia/Kolkata ", "2026-09-25", "18:30", " "),
        )
        fun problem(title: String = "Dinner", date: String = "2026-09-25", start: String = "18:30", end: String = "", zone: String = "Asia/Kolkata") =
            eventProblem(eventBody(title, "", "", zone, date, start, end))
        assertEquals(EventProblem.TITLE, problem(title = "  "))
        assertEquals(EventProblem.TITLE_LONG, problem(title = "x".repeat(121)))
        assertEquals(EventProblem.CONTROL, problem(title = "a\u0007b"))
        assertEquals(EventProblem.DATE, problem(date = "2026-02-30"))
        assertEquals(EventProblem.START, problem(start = "25:00"))
        assertEquals(EventProblem.END, problem(end = "9"))
        assertEquals(EventProblem.END_BEFORE_START, problem(end = "18:30"))
        assertEquals(EventProblem.ZONE, problem(zone = "Mars/Base"))
        assertNull(problem(end = "21:00"))
        val current = ready()
        current.startCreate()
        assertEquals("Asia/Kolkata", current.state.value.draft.timezone)
        current.draft { it.copy(title = "Dinner", date = "2026-09-25", start = "7pm") }
        current.save(); idle(current)
        assertEquals(EventProblem.START, current.state.value.problem)
        assertTrue(api.creates.isEmpty())
    }

    @Test fun unknownCreateRetriesTheSameKeyAndBody() = runBlocking {
        val current = ready()
        current.startCreate()
        current.draft { it.copy(title = " Family   dinner ", date = "2026-09-25", start = "18:30", end = "21:00", location = "Home") }
        api.createFailure = 503
        current.save(); idle(current)
        assertNotNull(current.state.value.pending)
        assertEquals("Not confirmed. Retry sends the same event; it cannot be created twice.", current.state.value.error)
        current.draft { it.copy(title = "Other") }
        assertEquals(" Family   dinner ", current.state.value.draft.title)
        api.createFailure = 0
        current.retry(); idle(current)
        assertEquals(2, api.creates.size)
        assertEquals(api.creates[0], api.creates[1])
        assertEquals(EventBodyDto("Family dinner", "", "Home", "Asia/Kolkata", "2026-09-25T18:30", "2026-09-25T21:00"), api.creates[0].second)
        assertNull(current.state.value.pending)
        assertEquals(EventMode.DETAIL, current.state.value.mode)
        assertEquals("Family dinner", current.state.value.selected?.title)
        assertEquals("Event created.", current.state.value.notice)
    }

    @Test fun identicalLoadMoreFailuresPublishDistinctMessageOccurrences() = runBlocking {
        api.nextCursor = "synthetic-next"
        val current = ready()
        val initial = current.state.value
        api.listFailure = 503
        current.reload(more = true); idle(current)
        val first = current.state.value
        assertEquals("Synthetic SYNTHETIC", first.error)
        assertEquals(initial.messageId + 1, first.messageId)

        current.reload(more = true); idle(current)
        val second = current.state.value
        assertEquals(first.error, second.error)
        assertEquals(first.messageId + 1, second.messageId)
        assertEquals(initial.events, second.events)
        assertEquals(initial.nextCursor, second.nextCursor)
    }

    @Test fun confirmedCreateEditAndCancellationPublishNewNoticeOccurrences() = runBlocking {
        val current = ready()
        val initialMessageId = current.state.value.messageId
        current.startCreate()
        current.draft { it.copy(title = "Dinner", date = "2026-09-25", start = "18:30", end = "21:00") }
        current.save(); idle(current)
        assertEquals("Event created.", current.state.value.notice)
        assertEquals(initialMessageId + 1, current.state.value.messageId)
        assertNull(current.state.value.pending)
        assertEquals(EventMode.DETAIL, current.state.value.mode)

        current.startEdit()
        current.draft { it.copy(start = "19:00") }
        current.save(); idle(current)
        assertEquals("Event saved.", current.state.value.notice)
        assertEquals(initialMessageId + 2, current.state.value.messageId)
        assertEquals("2026-09-25T19:00", current.state.value.selected?.localStart)

        current.askCancel(); current.cancelEvent(); idle(current)
        assertEquals("Event cancelled.", current.state.value.notice)
        assertEquals(initialMessageId + 3, current.state.value.messageId)
        assertEquals("cancelled", current.state.value.selected?.status)
    }

    @Test fun definiteCreateRejectionReleasesTheAttempt() = runBlocking {
        val current = ready()
        current.startCreate()
        current.draft { it.copy(title = "Dinner", date = "2026-09-18", start = "18:30") }
        api.createFailure = 422; api.createCode = "EVENT_IN_PAST"
        current.save(); idle(current)
        assertNull(current.state.value.pending)
        assertEquals("Synthetic EVENT_IN_PAST", current.state.value.error)
        assertEquals(EventMode.CREATE, current.state.value.mode)
        current.draft { it.copy(date = "2026-09-25") }
        api.createFailure = 0
        current.save(); idle(current)
        assertEquals(2, api.creates.size)
        assertNotEquals(api.creates[0].first, api.creates[1].first)
    }

    @Test fun responsesShowOnlyTheConfirmedAnswer() = runBlocking {
        api.current = detail.copy(myResponse = "going", myResponseOutdated = true, going = 0,
            attendees = listOf(AttendeeDto("Sam", "going", "2026-09-19T09:00:00Z", outdated = true, mine = true)))
        val current = ready()
        current.open(event); idle(current)
        assertTrue(current.state.value.selected!!.myResponseOutdated)
        current.respond("going"); idle(current)
        assertFalse(current.state.value.selected!!.myResponseOutdated)
        assertEquals(1, current.state.value.selected!!.going)
        assertEquals(1, current.state.value.events.single().going)
        api.wrongResponse = true
        current.respond("not_going"); idle(current)
        assertEquals("going", current.state.value.selected!!.myResponse)
        assertEquals("Your response is not confirmed. Choose it again to retry.", current.state.value.error)
        current.respond("yes"); idle(current)
        assertEquals(listOf("going", "not_going"), api.responses)
    }

    @Test fun cancellationNeedsConfirmationAndThePrecondition() = runBlocking {
        val current = ready()
        current.open(event); idle(current)
        current.askCancel()
        assertTrue(current.state.value.confirmingCancel)
        current.keepEvent()
        assertFalse(current.state.value.confirmingCancel)
        assertTrue(api.cancels.isEmpty())
        current.askCancel(); current.cancelEvent(); idle(current)
        assertEquals(listOf("\"1\""), api.cancels)
        assertEquals("cancelled", current.state.value.selected?.status)
        assertFalse(current.state.value.selected!!.canRespond)
        api.current = detail.copy(canManage = false, etag = null)
        current.close(); idle(current)
        current.open(event); idle(current)
        current.askCancel()
        assertFalse(current.state.value.confirmingCancel)
    }

    @Test fun editingHereIsLimitedToSameDayEvents() = runBlocking {
        api.current = detail.copy(localEnd = "2026-09-26T01:00", endsAt = "2026-09-25T19:30:00Z")
        val current = ready()
        current.open(event); idle(current)
        current.startEdit()
        assertEquals(EventMode.DETAIL, current.state.value.mode)
        api.current = detail
        current.refreshSelected(); idle(current)
        current.startEdit()
        assertEquals(EventMode.EDIT, current.state.value.mode)
        assertEquals(EventDraft("Dinner", "2026-09-25", "18:30", "21:00", "Asia/Kolkata", "", ""), current.state.value.draft)
        current.draft { it.copy(start = "19:00") }
        current.save(); idle(current)
        assertEquals(listOf("\"1\"" to EventBodyDto("Dinner", "", "", "Asia/Kolkata", "2026-09-25T19:00", "2026-09-25T21:00")), api.updates)
        assertEquals(EventMode.DETAIL, current.state.value.mode)
        assertEquals("Event saved.", current.state.value.notice)
        assertEquals("\"2\"", current.state.value.selected?.etag)
    }

    @Test fun pastListAcceptsOnlyEndedEvents() = runBlocking {
        val current = ready()
        api.past = listOf(event.copy(ended = true, canRespond = false))
        current.showPast(true); idle(current)
        assertEquals(api.past, current.state.value.events)
        api.past = listOf(event)
        current.reload(); idle(current)
        assertEquals("The service returned an unexpected event response.", current.state.value.error)
        assertEquals(listOf("upcoming", "past", "past"), api.periods)
    }

    @Test fun sessionLossRequiresSignIn() = runBlocking {
        val current = ready()
        api.listFailure = 401
        current.reload(); idle(current)
        assertTrue(current.state.value.requiresSignIn)
        assertTrue(current.state.value.events.isEmpty())
    }

    @Test fun accountChangeDropsLateList() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val delayed = object : EventsApi by api {
            override suspend fun list(authorization: String, spaceId: String, period: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<EventDto>>> {
                entered.complete(Unit); release.await(); return api.list(authorization, spaceId, period, cursor, limit)
            }
        }
        val current = EventsViewModel(EventsRepository(delayed, fixture.accounts)); model = current
        current.bind(fixture.accountId, spaceId, "UTC")
        withTimeout(5000) { entered.await() }
        current.bind(null, null, "UTC"); release.complete(Unit)
        assertEquals(EventsState(), current.state.value)
    }

    /** Keeps a list's original answer while a later command changes the server's state. */
    inner class HeldServer : EventsApi by api {
        var holdList = 0
        val listReached = CompletableDeferred<Unit>(); val listRelease = CompletableDeferred<Unit>()
        val reads = AtomicInteger()
        val cursors: MutableList<String?> = Collections.synchronizedList(mutableListOf())
        @Volatile var refuseRead = false
        @Volatile var holdRespond = false
        val respondReached = CompletableDeferred<Unit>(); val respondRelease = CompletableDeferred<Unit>()
        override suspend fun list(authorization: String, spaceId: String, period: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<EventDto>>> {
            val number = reads.incrementAndGet(); cursors += cursor
            val answer = api.list(authorization, spaceId, period, cursor, limit)
            if (number == holdList) { listReached.complete(Unit); listRelease.await() }
            return answer
        }
        override suspend fun read(authorization: String, eventId: String): Response<EnvelopeDto<EventDto>> =
            if (refuseRead) failed(403) else api.read(authorization, eventId)
        override suspend fun respond(authorization: String, eventId: String, body: AttendanceDto): Response<EnvelopeDto<EventDto>> {
            if (holdRespond) { respondReached.complete(Unit); respondRelease.await() }
            val answer = api.respond(authorization, eventId, body)
            val confirmed = answer.body()!!.data!!
            api.upcoming = api.upcoming.map { if (it.id == eventId) it.copy(myResponse = confirmed.myResponse, going = confirmed.going, maybe = confirmed.maybe) else it }
            return answer
        }
    }

    private fun held(server: HeldServer): EventsViewModel = EventsViewModel(EventsRepository(server, fixture.accounts)).also { model = it }
    private suspend fun settled(current: EventsViewModel) = withTimeout(5000) { current.state.first { !it.working } }

    @Test fun aResponseWhileTheListLoadsIsNotUndoneByTheListsOlderAnswer() = runBlocking {
        val server = HeldServer()
        val current = held(server)
        current.bind(fixture.accountId, spaceId, "Asia/Kolkata"); idle(current)
        server.holdList = 2
        current.reload()
        withTimeout(5000) { server.listReached.await() }
        current.open(event); settled(current)
        current.respond("going"); settled(current)
        server.listRelease.complete(Unit)
        val state = idle(current)
        assertEquals("going", state.selected?.myResponse)
        assertEquals("going", state.events.single().myResponse)
    }

    @Test fun aRefusedChangeWhileTheListLoadsKeepsItsMessageAndTheListStillLoads(): Unit = runBlocking {
        val server = HeldServer()
        val current = held(server)
        current.bind(fixture.accountId, spaceId, "Asia/Kolkata"); idle(current)
        server.holdList = 2; server.refuseRead = true
        current.reload()
        withTimeout(5000) { server.listReached.await() }
        current.open(event); settled(current)
        val state = idle(current)
        assertEquals("Synthetic SYNTHETIC", state.error)
        assertEquals(3, server.reads.get())
        server.listRelease.complete(Unit)
    }

    @Test fun showMoreStoppedByAChangeIsSentAgainForTheSamePage(): Unit = runBlocking {
        api.nextCursor = "synthetic-next"
        val server = HeldServer()
        val current = held(server)
        current.bind(fixture.accountId, spaceId, "Asia/Kolkata"); idle(current)
        val next = event.copy(id = "6a3c6e31-8f8e-4d71-8d84-3f7c6c5e4d05", title = "Evening walk")
        api.upcoming = listOf(next); api.nextCursor = null
        server.holdList = 2
        current.reload(more = true)
        withTimeout(5000) { server.listReached.await() }
        current.open(event); settled(current)
        val state = idle(current)
        server.listRelease.complete(Unit)
        assertEquals(listOf(null, "synthetic-next", "synthetic-next"), server.cursors.toList())
        assertEquals(listOf(event, next), state.events)
        assertNull(state.nextCursor)
        assertNull(state.error)
    }

    @Test fun aRefreshWhileAResponseIsUnansweredIsNotSent() = runBlocking {
        api.nextCursor = "synthetic-next"
        val server = HeldServer()
        val current = held(server)
        current.bind(fixture.accountId, spaceId, "Asia/Kolkata"); idle(current)
        current.open(event); idle(current)
        val loaded = server.reads.get()
        server.holdRespond = true
        current.respond("going")
        withTimeout(5000) { server.respondReached.await() }
        current.reload(); current.reload(more = true)
        server.respondRelease.complete(Unit); idle(current)
        // A queued read could start just after the command's working flag clears.
        assertNull(withTimeoutOrNull(2000) { while (server.reads.get() == loaded) delay(10) })
        assertEquals("going", current.state.value.selected?.myResponse)
    }

    @Test fun cleanupWaitsForAnUnansweredListToStop() = runBlocking {
        val server = HeldServer().apply { holdList = 1 }
        val current = held(server)
        current.bind(fixture.accountId, spaceId, "Asia/Kolkata")
        withTimeout(5000) { server.listReached.await() }
        finishTestWork()
        val scope = requireNotNull(current.viewModelScope.coroutineContext[Job])
        assertTrue(scope.isCompleted)
        assertFalse(scope.children.any())
        assertFalse(server.listRelease.isCompleted)
        assertEquals(EventsState(), current.state.value)
    }

    @Test fun wireCarriesKeysPreconditionsAndExplicitOpenEnd() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val openEnded = detail.copy(localEnd = null, endsAt = null)
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            val path = request.url.encodedPath
            val payload: Any = when {
                request.method == "GET" && path.endsWith("/events") -> EnvelopeDto(listOf(event), null, PaginationDto(null, false))
                path.endsWith("/cancel") -> EnvelopeDto(openEnded.copy(status = "cancelled", cancelledAt = "2026-09-19T10:06:00Z", canRespond = false), null)
                path.endsWith("/attendance") -> EnvelopeDto(openEnded.copy(myResponse = "maybe", maybe = 1), null)
                else -> EnvelopeDto(openEnded, null)
            }
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(payload).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = EventsRepository(IdentityModule.events(http, Gson()), fixture.accounts)
        wire.list(fixture.accountId, spaceId, false, null)
        assertEquals("/v1/spaces/$spaceId/events", requests[0].url.encodedPath)
        assertEquals("upcoming", requests[0].url.queryParameter("when"))
        assertEquals("20", requests[0].url.queryParameter("limit"))
        assertNull(requests[0].url.queryParameter("cursor"))
        val key = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
        val body = eventBody("Dinner", "", "", "Asia/Kolkata", "2026-09-25", "18:30", "")
        wire.create(EventCreateIntent(fixture.accountId, spaceId, key, body))
        assertEquals(key, requests[1].header("Idempotency-Key"))
        val json = JsonParser.parseString(bodies[1]).asJsonObject
        assertEquals(setOf("title", "description", "location", "timezone", "local_start", "local_end"), json.keySet())
        assertTrue(json.get("local_end").isJsonNull)
        wire.update(fixture.accountId, detail, body)
        assertEquals("PATCH", requests[2].method)
        assertEquals("\"1\"", requests[2].header("If-Match"))
        wire.cancel(fixture.accountId, detail)
        assertEquals("/v1/events/$eventId/cancel", requests[3].url.encodedPath)
        assertEquals("\"1\"", requests[3].header("If-Match"))
        assertEquals("{}", bodies[3])
        wire.respond(fixture.accountId, eventId, "maybe")
        assertEquals("""{"response":"maybe"}""", bodies[4])
        assertNull(requests[4].header("Idempotency-Key"))
    }
}
