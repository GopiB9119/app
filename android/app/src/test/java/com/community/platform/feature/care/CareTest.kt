package com.community.platform.feature.care

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.spaces.SpaceRepositoryTest
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
import java.io.IOException
import java.time.Instant
import java.util.Collections

@OptIn(ExperimentalCoroutinesApi::class)
class CareTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val instructionId = "6a3c6e31-8f8e-4d71-8d84-3f7c6c5e4d04"
    private val otherId = "5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01"
    private val instruction = CareInstructionDto(
        id = instructionId, medicineName = "Synthetic tablet", strength = "5 mg", form = "tablet", dose = "One tablet", instructions = "",
        source = "package_label", timezone = "Asia/Kolkata", times = listOf("08:00", "20:00"), startDate = "2026-09-20", endDate = null,
        status = "active", version = 1, confirmedByAccountId = fixture.accountId, confirmedAt = "2026-09-20T05:00:00Z",
        createdAt = "2026-09-20T05:00:00Z", stoppedAt = null, etag = "\"i1\"",
    )
    private val dose = CareOccurrenceDto(instructionId, "2026-09-25", "08:00", "08:00", "Asia/Kolkata", "2026-09-25T02:30:00Z", "none", null, true, "\"o1\"")
    private val later = dose.copy(localTime = "20:00", displayTime = "20:00", scheduledAt = "2026-09-25T14:30:00Z", canReport = false, etag = "\"o3\"")
    private val day = CareDayDto("2026-09-25", listOf(CareDayInstructionDto(instructionId, "Synthetic tablet", "5 mg", "tablet", "One tablet", "active")), listOf(dose, later), emptyList())
    private val complete = CareDraft(
        name = "  Synthetic   tablet ", strength = "5 mg", form = "tablet", dose = "One tablet", source = "package_label",
        times = listOf("20:00", "08:00"), timezone = "Asia/Kolkata", startDate = "2026-09-20", confirmed = true,
    )

    private fun <Value> ok(value: Value): Response<EnvelopeDto<Value>> = Response.success(EnvelopeDto(value, null))
    private fun <Value> failed(status: Int, code: String = "SYNTHETIC"): Response<EnvelopeDto<Value>> =
        Response.error(status, """{"error":{"code":"$code","message":"Synthetic $code","details":{}}}""".toResponseBody("application/json".toMediaType()))

    inner class FakeApi : CareApi {
        var active = listOf(instruction)
        var stopped = emptyList<CareInstructionDto>()
        var listFailure = 0
        var createFailure = 0
        var createCode = "SYNTHETIC"
        var reportFailure = 0
        var reportCode = "SYNTHETIC"
        var stopFailure = 0
        var wrongReport = false
        val statuses = mutableListOf<String>()
        val dates = mutableListOf<String>()
        val creates = mutableListOf<Pair<String, CreateCareInstructionDto>>()
        val reports = mutableListOf<Triple<String, String, ReportDoseDto>>()
        val stops = mutableListOf<Pair<String, String>>()
        override suspend fun list(authorization: String, status: String): Response<EnvelopeDto<List<CareInstructionDto>>> {
            statuses += status
            return if (listFailure != 0) failed(listFailure) else ok(if (status == "stopped") stopped else active)
        }
        override suspend fun create(authorization: String, key: String, body: CreateCareInstructionDto): Response<EnvelopeDto<CareInstructionDto>> {
            creates += key to body
            return if (createFailure != 0) failed(createFailure, createCode) else ok(instruction.copy(
                medicineName = body.medicineName, strength = body.strength, form = body.form, dose = body.dose, instructions = body.instructions,
                source = body.source, timezone = body.timezone, times = body.times, startDate = body.startDate, endDate = body.endDate,
            ))
        }
        override suspend fun stop(authorization: String, instructionId: String, key: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<CareInstructionDto>> {
            stops += key to etag
            return if (stopFailure != 0) failed(stopFailure) else ok(instruction.copy(status = "stopped", stoppedAt = "2026-09-25T05:00:00Z", version = 2, etag = "\"i2\""))
        }
        override suspend fun report(authorization: String, instructionId: String, key: String, etag: String, body: ReportDoseDto): Response<EnvelopeDto<CareOccurrenceDto>> {
            reports += Triple(key, etag, body)
            if (reportFailure != 0) return failed(reportFailure, reportCode)
            val outcome = if (wrongReport) (if (body.outcome == "taken") "skipped" else "taken") else body.outcome
            return ok(dose.copy(report = CareReportDto(outcome, 1, "2026-09-25T02:40:00Z", "2026-09-25T02:40:00Z"), etag = "\"o2\""))
        }
        override suspend fun day(authorization: String, date: String): Response<EnvelopeDto<CareDayDto>> {
            dates += date
            return if (listFailure != 0) failed(listFailure) else ok(day.copy(localDate = date, occurrences = day.occurrences.map { it.copy(localDate = date) }))
        }
    }

    /** Hands each command to the fake server, then loses the server's answer while [lost] is set, as a dropped connection would. */
    inner class LossyApi : CareApi by api {
        var lost = false
        val sent: MutableList<List<Any>> = Collections.synchronizedList(mutableListOf())
        private fun <Value> deliver(answer: Response<Value>): Response<Value> = if (lost) throw IOException("Synthetic lost answer") else answer
        override suspend fun create(authorization: String, key: String, body: CreateCareInstructionDto): Response<EnvelopeDto<CareInstructionDto>> {
            sent += listOf(authorization, key, body)
            return deliver(api.create(authorization, key, body))
        }
        override suspend fun stop(authorization: String, instructionId: String, key: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<CareInstructionDto>> {
            sent += listOf(authorization, instructionId, key, etag, body)
            return deliver(api.stop(authorization, instructionId, key, etag, body))
        }
        override suspend fun report(authorization: String, instructionId: String, key: String, etag: String, body: ReportDoseDto): Response<EnvelopeDto<CareOccurrenceDto>> {
            sent += listOf(authorization, instructionId, key, etag, body)
            return deliver(api.report(authorization, instructionId, key, etag, body))
        }
    }

    private val api = FakeApi()
    private val repository = CareRepository(api, fixture.accounts)
    private var model: CareViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null, "UTC"); Dispatchers.resetMain() }

    private suspend fun idle(current: CareViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(source: CareRepository = repository): CareViewModel {
        val current = CareViewModel(source); model = current
        current.now = { Instant.parse("2026-09-25T03:00:00Z") }
        current.bind(fixture.accountId, "Asia/Kolkata"); idle(current)
        return current
    }

    @Test fun rejectsInconsistentMedicineFacts() {
        val bad = listOf(
            instruction.copy(status = "stopped"), instruction.copy(stoppedAt = "2026-09-21T05:00:00Z"), instruction.copy(endDate = "2026-09-19"),
            instruction.copy(times = listOf("08:00", "08:00")), instruction.copy(times = emptyList()), instruction.copy(times = listOf("8:00")),
            instruction.copy(source = "friend"), instruction.copy(confirmedByAccountId = otherId), instruction.copy(medicineName = " "),
            instruction.copy(strength = "x".repeat(61)), instruction.copy(startDate = "2026-02-30"), instruction.copy(version = 0), instruction.copy(etag = ""),
            Gson().fromJson("""{"id":"$instructionId"}""", CareInstructionDto::class.java),
        )
        for (value in bad) assertThrows(IdentityFailure::class.java) { repository.instruction(value, fixture.accountId) }
        assertEquals(instruction, repository.instruction(instruction, fixture.accountId))
        val report = CareReportDto("taken", 1, "2026-09-25T02:40:00Z", "2026-09-25T02:40:00Z")
        val badDoses = listOf(
            dose.copy(clockChange = "maybe"), dose.copy(displayTime = "09:00"), dose.copy(clockChange = "shifted_forward"),
            dose.copy(report = report.copy(outcome = "adhered")), dose.copy(report = report.copy(revision = 0)), dose.copy(scheduledAt = "soon"),
        )
        for (value in badDoses) assertThrows(IdentityFailure::class.java) { repository.occurrence(value) }
        val shifted = dose.copy(localTime = "02:30", displayTime = "03:30", clockChange = "shifted_forward", report = report)
        assertEquals(shifted, repository.occurrence(shifted))
        val badDays = listOf(
            day.copy(localDate = "2026-09-26"), day.copy(occurrences = listOf(dose, dose)), day.copy(occurrences = listOf(dose.copy(instructionId = otherId))),
            day.copy(occurrences = listOf(dose.copy(localDate = "2026-09-24"))), day.copy(omitted = listOf(OmittedCareTimeDto(otherId, "02:30", "03:30"))),
        )
        for (value in badDays) assertThrows(IdentityFailure::class.java) { repository.day(value, "2026-09-25") }
        assertEquals(day, repository.day(day, "2026-09-25"))
    }

    @Test fun formProblemsAreFoundBeforeSending() = runBlocking {
        assertEquals(
            CreateCareInstructionDto("Synthetic tablet", "5 mg", "tablet", "One tablet", "Line one\nLine two", "package_label", "Asia/Kolkata", listOf("08:00", "20:00"), "2026-09-20", null),
            careBody(complete.copy(instructions = " Line one\r\nLine two ")),
        )
        assertNull(careProblem(complete))
        assertNull(careProblem(complete.copy(instructions = "Line one\nLine two", endDate = "2026-09-20")))
        val cases = listOf(
            CareProblem.NAME to complete.copy(name = " "), CareProblem.NAME_LONG to complete.copy(name = "x".repeat(121)),
            CareProblem.DETAIL_LONG to complete.copy(form = "x".repeat(61)), CareProblem.DOSE to complete.copy(dose = ""),
            CareProblem.DOSE_LONG to complete.copy(dose = "x".repeat(121)), CareProblem.INSTRUCTIONS_LONG to complete.copy(instructions = "x".repeat(501)),
            CareProblem.CONTROL to complete.copy(instructions = "a\u0007b"), CareProblem.SOURCE to complete.copy(source = ""),
            CareProblem.TIME to complete.copy(times = listOf("08:00", "")), CareProblem.TIME to complete.copy(times = listOf("7pm")),
            CareProblem.TIME_DUPLICATE to complete.copy(times = listOf("08:00", "08:00")),
            CareProblem.TIMES_MANY to complete.copy(times = listOf("01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00")),
            CareProblem.START to complete.copy(startDate = "2026-02-30"), CareProblem.END to complete.copy(endDate = "soon"),
            CareProblem.END_BEFORE_START to complete.copy(endDate = "2026-09-19"), CareProblem.ZONE to complete.copy(timezone = "IST"),
            CareProblem.CONFIRM to complete.copy(confirmed = false),
        )
        for ((expected, draft) in cases) assertEquals(draft.toString(), expected, careProblem(draft))
        val current = ready()
        current.showMedicines(false); idle(current)
        current.startAdd()
        assertEquals(CareView.ADD, current.state.value.view)
        assertEquals(CareDraft(timezone = "Asia/Kolkata", startDate = "2026-09-25"), current.state.value.draft)
        current.draft { complete.copy(confirmed = false) }
        current.save(); idle(current)
        assertEquals(CareProblem.CONFIRM, current.state.value.problem)
        assertTrue(api.creates.isEmpty())
    }

    @Test fun unknownCreateRetriesTheSameKeyAndBody() = runBlocking {
        val current = ready()
        current.showMedicines(false); idle(current)
        current.startAdd()
        current.draft { complete }
        api.createFailure = 503
        current.save(); idle(current)
        assertNotNull(current.state.value.pendingCreate)
        assertEquals("Not confirmed. Retry sends the same medicine; it cannot be saved twice.", current.state.value.error)
        current.draft { it.copy(name = "Other") }
        assertEquals(complete.name, current.state.value.draft.name)
        api.createFailure = 0
        current.retryCreate(); idle(current)
        assertEquals(2, api.creates.size)
        assertEquals(api.creates[0], api.creates[1])
        assertEquals(careBody(complete), api.creates[0].second)
        assertTrue(api.creates[0].second.confirmed)
        assertNull(current.state.value.pendingCreate)
        assertEquals(CareView.MEDICINES, current.state.value.view)
        assertEquals("Synthetic tablet saved. It appears in your day plan from 2026-09-20.", current.state.value.notice)
    }

    @Test fun definiteCreateRejectionReleasesTheAttempt() = runBlocking {
        val current = ready()
        current.startAdd()
        current.draft { complete.copy(startDate = "2020-01-01") }
        api.createFailure = 422; api.createCode = "START_DATE_OUT_OF_RANGE"
        current.save(); idle(current)
        assertNull(current.state.value.pendingCreate)
        assertEquals("Synthetic START_DATE_OUT_OF_RANGE", current.state.value.error)
        assertEquals(CareView.ADD, current.state.value.view)
        current.draft { it.copy(startDate = "2026-09-20") }
        api.createFailure = 0
        current.save(); idle(current)
        assertEquals(2, api.creates.size)
        assertNotEquals(api.creates[0].first, api.creates[1].first)
    }

    @Test fun doseNotesKeepTheReviewedVersionAndRetryExactly() = runBlocking {
        val current = ready()
        assertEquals(listOf("2026-09-25"), api.dates)
        assertEquals(day.occurrences, current.state.value.day?.occurrences)
        api.reportFailure = 503
        current.report(dose, "taken"); idle(current)
        assertEquals("Your note is not confirmed. Choose it again to retry; it cannot be saved twice.", current.state.value.error)
        assertNotNull(current.state.value.pendingReport)
        api.reportFailure = 0
        current.report(dose, "taken"); idle(current)
        assertEquals(2, api.reports.size)
        assertEquals(api.reports[0], api.reports[1])
        assertEquals("\"o1\"", api.reports[0].second)
        assertEquals(ReportDoseDto("2026-09-25", "08:00", "taken"), api.reports[0].third)
        val noted = current.state.value.day!!.occurrences.first()
        assertEquals("taken", noted.report?.outcome)
        assertNull(current.state.value.pendingReport)
        current.report(later, "taken"); current.report(noted, "taken"); current.report(noted, "maybe"); idle(current)
        assertEquals(2, api.reports.size)
        api.wrongReport = true
        current.report(noted, "skipped"); idle(current)
        assertEquals("taken", current.state.value.day!!.occurrences.first().report?.outcome)
        assertEquals("Your note is not confirmed. Choose it again to retry; it cannot be saved twice.", current.state.value.error)
        api.wrongReport = false; api.reportFailure = 412; api.reportCode = "PRECONDITION_FAILED"
        current.report(noted, "skipped"); idle(current)
        assertEquals(api.reports[2].first, api.reports[3].first)
        assertNull(current.state.value.pendingReport)
        assertEquals("Synthetic PRECONDITION_FAILED", current.state.value.error)
        assertEquals(listOf("2026-09-25", "2026-09-25"), api.dates)
    }

    /**
     * Reads the day when asked and can hold that answer, so a note sent later is answered first.
     * Today the app-wide request lock keeps the note waiting instead; without it (T82) the older day would arrive last.
     */
    private inner class LateDay : CareApi by api {
        @Volatile var noted: CareOccurrenceDto? = null
        @Volatile var hold: CompletableDeferred<Unit>? = null
        @Volatile var holdReport: CompletableDeferred<Unit>? = null
        val read = CompletableDeferred<Unit>()
        val reporting = CompletableDeferred<Unit>()
        val dates: MutableList<String> = Collections.synchronizedList(mutableListOf())
        override suspend fun day(authorization: String, date: String): Response<EnvelopeDto<CareDayDto>> {
            dates += date
            val answer = day.copy(occurrences = listOf(noted ?: dose, later))
            hold?.let { gate -> read.complete(Unit); gate.await() }
            return ok(answer)
        }
        override suspend fun report(authorization: String, instructionId: String, key: String, etag: String, body: ReportDoseDto): Response<EnvelopeDto<CareOccurrenceDto>> {
            holdReport?.let { gate -> reporting.complete(Unit); gate.await() }
            return api.report(authorization, instructionId, key, etag, body).also { answer -> answer.body()?.data?.let { noted = it } }
        }
    }

    @Test fun aDoseNoteWhileTheDayLoadsIsNotUndoneByTheDaysOlderAnswer() = runBlocking {
        val source = LateDay()
        val current = ready(CareRepository(source, fixture.accounts))
        val gate = CompletableDeferred<Unit>()
        source.hold = gate
        current.reload()
        withTimeout(5000) { source.read.await() }
        current.report(dose, "taken")
        withTimeout(5000) { current.state.first { !it.working } }
        gate.complete(Unit)
        val settled = idle(current)
        assertEquals("taken", settled.day!!.occurrences.first().report?.outcome)
        // The first load, the one the note stopped, and that one sent again after the note.
        assertEquals(listOf("2026-09-25", "2026-09-25", "2026-09-25"), source.dates.toList())
    }

    @Test fun aLostDoseNoteWhileTheDayLoadsKeepsItsMessageAndTheDayStillLoads() = runBlocking {
        val source = LateDay()
        val current = ready(CareRepository(source, fixture.accounts))
        val gate = CompletableDeferred<Unit>()
        source.hold = gate
        current.reload()
        withTimeout(5000) { source.read.await() }
        api.reportFailure = 503
        current.report(dose, "taken")
        withTimeout(5000) { current.state.first { !it.working } }
        gate.complete(Unit)
        val settled = idle(current)
        assertEquals("Your note is not confirmed. Choose it again to retry; it cannot be saved twice.", settled.error)
        assertNotNull(settled.pendingReport)
        assertNull(settled.day!!.occurrences.first().report)
        assertEquals(3, source.dates.size)
    }

    @Test fun aRefreshWhileADoseNoteIsUnansweredIsNotSent() = runBlocking {
        val source = LateDay()
        val current = ready(CareRepository(source, fixture.accounts))
        val gate = CompletableDeferred<Unit>()
        source.holdReport = gate
        current.report(dose, "taken")
        withTimeout(5000) { source.reporting.await() }
        current.reload()
        gate.complete(Unit)
        val settled = idle(current)
        assertEquals("taken", settled.day!!.occurrences.first().report?.outcome)
        assertEquals(listOf("2026-09-25"), source.dates.toList())
    }

    @Test fun stopNeedsConfirmationAndRetriesWithTheSameKey() = runBlocking {
        val current = ready()
        current.showMedicines(false); idle(current)
        assertEquals(listOf(instruction), current.state.value.instructions)
        current.askStop(instruction)
        assertEquals(instruction, current.state.value.confirmingStop)
        current.keep()
        assertNull(current.state.value.confirmingStop)
        assertTrue(api.stops.isEmpty())
        api.stopFailure = 503
        current.askStop(instruction); current.stop(); idle(current)
        assertEquals("The stop is not confirmed. Choose Stop tracking again to retry.", current.state.value.error)
        api.stopFailure = 0; api.active = emptyList()
        current.askStop(instruction); current.stop(); idle(current)
        assertEquals(2, api.stops.size)
        assertEquals(api.stops[0], api.stops[1])
        assertEquals("\"i1\"", api.stops[0].second)
        assertEquals("Stopped tracking Synthetic tablet. Notes you made are kept.", current.state.value.notice)
        assertTrue(current.state.value.instructions.isEmpty())
        assertNull(current.state.value.pendingStop)
        current.askStop(instruction.copy(status = "stopped", stoppedAt = "2026-09-25T05:00:00Z"))
        assertNull(current.state.value.confirmingStop)
        api.stopped = listOf(instruction.copy(status = "stopped", stoppedAt = "2026-09-25T05:00:00Z", version = 2, etag = "\"i2\""))
        current.showMedicines(true); idle(current)
        assertEquals(api.stopped, current.state.value.instructions)
        assertEquals(listOf("active", "active", "stopped"), api.statuses)
    }

    @Test fun dayNavigationStaysInsideTheWindow() = runBlocking {
        val current = ready()
        repeat(35) { current.move(-1); idle(current) }
        assertEquals("2026-08-26", current.state.value.date)
        assertFalse(current.state.value.canGoBack)
        current.goToday(); idle(current)
        assertEquals("2026-09-25", current.state.value.date)
        repeat(35) { current.move(1); idle(current) }
        assertEquals("2026-10-25", current.state.value.date)
        assertFalse(current.state.value.canGoForward)
        assertEquals(62, api.dates.size)
        assertEquals("2026-10-25", current.state.value.day?.localDate)
    }

    @Test fun sessionLossRequiresSignIn() = runBlocking {
        val current = ready()
        api.listFailure = 401
        current.reload(); idle(current)
        assertTrue(current.state.value.requiresSignIn)
        assertNull(current.state.value.day)
    }

    @Test fun accountChangeDropsLateDay() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val delayed = object : CareApi by api {
            override suspend fun day(authorization: String, date: String): Response<EnvelopeDto<CareDayDto>> {
                entered.complete(Unit); release.await(); return api.day(authorization, date)
            }
        }
        val current = CareViewModel(CareRepository(delayed, fixture.accounts)); model = current
        current.bind(fixture.accountId, "UTC")
        withTimeout(5000) { entered.await() }
        current.bind(null, "UTC"); release.complete(Unit)
        assertNull(current.state.value.accountId)
        assertNull(current.state.value.day)
    }

    @Test fun wireCarriesKeysPreconditionsAndExactBodies() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            val path = request.url.encodedPath
            val payload: Any = when {
                path.endsWith("/stop") -> EnvelopeDto(instruction.copy(status = "stopped", stoppedAt = "2026-09-25T05:00:00Z", version = 2), null)
                path.endsWith("/reports") -> EnvelopeDto(dose.copy(report = CareReportDto("taken", 1, "2026-09-25T02:40:00Z", "2026-09-25T02:40:00Z")), null)
                path == "/v1/care/day" -> EnvelopeDto(day, null)
                request.method == "GET" -> EnvelopeDto(listOf(instruction), null)
                else -> EnvelopeDto(instruction, null)
            }
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(payload).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = CareRepository(IdentityModule.care(http, Gson()), fixture.accounts)
        wire.list(fixture.accountId, false)
        assertEquals("/v1/care/instructions", requests[0].url.encodedPath)
        assertEquals("status=active", requests[0].url.encodedQuery)
        val key = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
        wire.create(CareCreateIntent(fixture.accountId, key, careBody(complete)))
        assertEquals(key, requests[1].header("Idempotency-Key"))
        val json = JsonParser.parseString(bodies[1]).asJsonObject
        assertEquals(setOf("medicine_name", "strength", "form", "dose", "instructions", "source", "timezone", "times", "start_date", "end_date", "confirmed"), json.keySet())
        assertTrue(json.get("end_date").isJsonNull)
        assertTrue(json.get("confirmed").asBoolean)
        wire.day(fixture.accountId, "2026-09-25")
        assertEquals("/v1/care/day", requests[2].url.encodedPath)
        assertEquals("date=2026-09-25", requests[2].url.encodedQuery)
        wire.report(CareReportIntent(fixture.accountId, key, dose, "taken"))
        assertEquals("/v1/care/instructions/$instructionId/reports", requests[3].url.encodedPath)
        assertEquals("\"o1\"", requests[3].header("If-Match"))
        assertEquals(key, requests[3].header("Idempotency-Key"))
        assertEquals("""{"local_date":"2026-09-25","local_time":"08:00","outcome":"taken"}""", bodies[3])
        wire.stop(fixture.accountId, instruction, key)
        assertEquals("/v1/care/instructions/$instructionId/stop", requests[4].url.encodedPath)
        assertEquals("\"i1\"", requests[4].header("If-Match"))
        assertEquals("{}", bodies[4])
        assertTrue(requests.none { it.url.queryParameter("account_id") != null })
    }

    @Test fun failedOrLostCreateIsNeverShownAsSavedAndRetriesTheSameKeyAndBody() = runBlocking {
        val lossy = LossyApi()
        val current = ready(CareRepository(lossy, fixture.accounts))
        current.showMedicines(false); idle(current)
        val listed = current.state.value.instructions
        current.startAdd(); current.draft { complete }
        fun notSaved() {
            val state = current.state.value
            assertEquals("Not confirmed. Retry sends the same medicine; it cannot be saved twice.", state.error)
            assertNull(state.notice)
            assertEquals(CareView.ADD, state.view)
            assertEquals(complete, state.draft)
            assertEquals(listed, state.instructions)
            assertEquals(lossy.sent.first()[1], state.pendingCreate?.key)
        }
        api.createFailure = 503
        current.save(); idle(current)
        notSaved()
        api.createFailure = 0; lossy.lost = true
        current.retryCreate(); idle(current)
        notSaved()
        lossy.lost = false
        current.retryCreate(); idle(current)
        assertEquals(List(3) { lossy.sent.first() }, lossy.sent)
        assertEquals(listOf("Bearer ${fixture.token}", careBody(complete)), lossy.sent.first().let { listOf(it[0], it[2]) })
        val state = current.state.value
        assertEquals("Synthetic tablet saved. It appears in your day plan from 2026-09-20.", state.notice)
        assertNull(state.error)
        assertNull(state.pendingCreate)
        assertEquals(CareView.MEDICINES, state.view)
    }

    @Test fun failedOrLostStopIsNeverShownAsStoppedAndRetriesTheSameKeyAndBody() = runBlocking {
        val lossy = LossyApi()
        val current = ready(CareRepository(lossy, fixture.accounts))
        current.showMedicines(false); idle(current)
        fun notStopped() {
            val state = current.state.value
            assertEquals("The stop is not confirmed. Choose Stop tracking again to retry.", state.error)
            assertNull(state.notice)
            assertEquals(listOf(instruction), state.instructions)
            assertEquals(instructionId to lossy.sent.first()[2], state.pendingStop)
        }
        api.stopFailure = 503
        current.askStop(instruction); current.stop(); idle(current)
        notStopped()
        api.stopFailure = 0; api.active = emptyList(); lossy.lost = true
        current.askStop(instruction); current.stop(); idle(current)
        notStopped()
        lossy.lost = false
        current.askStop(instruction); current.stop(); idle(current)
        assertEquals(List(3) { lossy.sent.first() }, lossy.sent)
        assertEquals(listOf("Bearer ${fixture.token}", instructionId, "\"i1\"", emptyMap<String, String>()), lossy.sent.first().let { listOf(it[0], it[1], it[3], it[4]) })
        val state = current.state.value
        assertEquals("Stopped tracking Synthetic tablet. Notes you made are kept.", state.notice)
        assertNull(state.error)
        assertNull(state.pendingStop)
        assertTrue(state.instructions.isEmpty())
    }

    @Test fun refusedStopIsNeverShownAsStoppedAndReleasesItsKey() = runBlocking {
        val current = ready()
        current.showMedicines(false); idle(current)
        api.stopFailure = 412
        current.askStop(instruction); current.stop(); idle(current)
        val state = current.state.value
        assertEquals("Synthetic SYNTHETIC", state.error)
        assertNull(state.notice)
        assertNull(state.pendingStop)
        assertEquals(listOf(instruction), state.instructions)
        assertEquals(listOf("active", "active"), api.statuses)
        api.stopFailure = 0
        current.askStop(instruction); current.stop(); idle(current)
        assertEquals(2, api.stops.size)
        assertNotEquals(api.stops[0].first, api.stops[1].first)
        assertEquals("Stopped tracking Synthetic tablet. Notes you made are kept.", current.state.value.notice)
    }

    @Test fun failedOrLostDoseNoteIsNeverShownAsNotedAndRetriesTheSameKeyAndBody() = runBlocking {
        val lossy = LossyApi()
        val current = ready(CareRepository(lossy, fixture.accounts))
        fun notNoted() {
            val state = current.state.value
            assertEquals("Your note is not confirmed. Choose it again to retry; it cannot be saved twice.", state.error)
            assertNull(state.notice)
            assertEquals(day.occurrences, state.day?.occurrences)
            assertEquals(lossy.sent.first()[2], state.pendingReport?.key)
        }
        api.reportFailure = 503
        current.report(dose, "taken"); idle(current)
        notNoted()
        api.reportFailure = 0; lossy.lost = true
        current.report(dose, "taken"); idle(current)
        notNoted()
        lossy.lost = false
        current.report(dose, "taken"); idle(current)
        assertEquals(List(3) { lossy.sent.first() }, lossy.sent)
        assertEquals(listOf("Bearer ${fixture.token}", instructionId, "\"o1\"", ReportDoseDto("2026-09-25", "08:00", "taken")), lossy.sent.first().let { listOf(it[0], it[1], it[3], it[4]) })
        val state = current.state.value
        assertEquals("taken", state.day!!.occurrences.first().report?.outcome)
        assertNull(state.error)
        assertNull(state.pendingReport)
    }
}
