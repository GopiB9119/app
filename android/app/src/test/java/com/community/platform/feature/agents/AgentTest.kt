package com.community.platform.feature.agents

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
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
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class AgentTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val memoryId = "7b0c2f4e-5d1a-4c3b-9e8f-1a2b3c4d5e6f"
    private var ids = 0
    private var tags = 0
    private var clock = 0L
    private fun id() = "10000000-0000-4000-9000-%012x".format(++ids)
    private fun tag() = "\"%064x\"".format(++tags)
    private fun at() = Instant.parse("2026-10-01T09:00:00Z").plusSeconds(++clock).toString()

    private fun run(message: String, status: String = "running") = at().let { now ->
        AgentRunDto(id(), fixture.spaceId, message, status, null, null, null, null, null, now, now, null, "1")
    }
    private fun proposal(runId: String, fields: List<AgentFieldDto>, tool: String = "tasks.create", summary: String = "Create this task.") =
        AgentApprovalDto(id(), runId, fixture.spaceId, tool, "low", summary, fields, "pending", null, null, at(), "2026-10-02T09:00:00Z", null, "1", tag())
    private val taskFields = listOf(AgentFieldDto("Space", "Morgan family"), AgentFieldDto("Title", "Water the plants"),
        AgentFieldDto("Due date", "2 October 2026"), AgentFieldDto("Assigned to", "Nobody"))
    private fun memory(id: String = memoryId, content: String = "The spare key is under the blue pot") =
        AgentMemoryDto(id, "note", null, "Note", content, "approved_request", null, "2026-09-30T08:00:00Z")

    /** An in-memory agent service with the server's rules. `lose` applies a change and then loses its response. */
    inner class FakeApi : AgentApi {
        val runs = mutableListOf<AgentRunDto>()
        val byKey = mutableMapOf<String, String>()
        val asks = mutableListOf<Pair<String, AgentAskDto>>()
        val answers = mutableListOf<Pair<String, AgentAnswerDto>>()
        val decisions = mutableListOf<List<String?>>()
        val decided = mutableMapOf<String, String>()
        val effects = mutableListOf<String>()
        val memories = mutableListOf(memory())
        val forgets = mutableListOf<String>()
        var lose = 0
        var failure = 0
        var pageSize = AGENT_PAGE_SIZE
        var runsCalls = 0

        private fun <Value> reply(value: Value, pagination: PaginationDto? = null): Response<EnvelopeDto<Value>> =
            Response.success(EnvelopeDto(value, null, pagination))
        private fun <Value> refuse(status: Int, code: String): Response<EnvelopeDto<Value>> =
            Response.error(status, """{"error":{"code":"$code","message":"Synthetic $code"}}""".toResponseBody("application/json".toMediaType()))
        private fun <Value> applied(value: Value): Response<EnvelopeDto<Value>> {
            if (lose > 0) { lose -= 1; throw IOException("Synthetic lost response after the change was saved") }
            return reply(value)
        }
        private fun replace(changed: AgentRunDto): AgentRunDto { runs.replaceAll { if (it.id == changed.id) changed else it }; return changed }

        override suspend fun ask(authorization: String, key: String, body: AgentAskDto): Response<EnvelopeDto<AgentRunDto>> {
            if (failure != 0) return refuse(failure, "SYNTHETIC")
            asks += key to body
            val existing = byKey[key]?.let { id -> runs.first { it.id == id } }
            if (existing != null) return applied(existing)
            val created = run(body.message).let { started ->
                if (body.message.startsWith("Remind me")) started.copy(status = "waiting_for_user",
                    question = AgentQuestionDto(id(), "What time should I remind you?", "2026-10-02T09:00:00Z"))
                else started.copy(status = "waiting_for_approval", approval = proposal(started.id, taskFields))
            }
            byKey[key] = created.id
            runs.add(0, created)
            return applied(created)
        }

        override suspend fun runs(authorization: String, spaceId: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<AgentRunDto>>> {
            runsCalls += 1
            val mine = runs.filter { it.spaceId == spaceId }
            val start = cursor?.removePrefix("after-")?.toInt() ?: 0
            val more = start + pageSize < mine.size
            return reply(mine.drop(start).take(pageSize), PaginationDto(if (more) "after-${start + pageSize}" else null, more))
        }

        override suspend fun answer(authorization: String, runId: String, body: AgentAnswerDto): Response<EnvelopeDto<AgentRunDto>> {
            answers += runId to body
            val current = runs.first { it.id == runId }
            if (current.question?.id != body.questionId) return refuse(409, "QUESTION_CLOSED")
            return applied(replace(current.copy(status = "waiting_for_approval", question = null, approval = proposal(current.id,
                listOf(AgentFieldDto("Task", "Water the plants"), AgentFieldDto("When", "2 October 2026, 18:00")), "reminders.schedule",
                "Schedule this reminder for you."))))
        }

        override suspend fun stop(authorization: String, runId: String, body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>> {
            val current = runs.first { it.id == runId }
            if (current.finishedAt != null) return reply(current)
            return applied(replace(current.copy(status = "cancelled", question = null, answer = "Stopped. Nothing was changed.",
                stopReason = "cancelled", finishedAt = at())))
        }

        override suspend fun approve(authorization: String, approvalId: String, key: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>> {
            decisions += listOf("approve", approvalId, key, etag)
            val current = runs.first { it.approval?.id == approvalId }
            val approval = current.approval!!
            if (approval.status != "pending") return if (decided[approvalId] == key) reply(current) else refuse(409, "APPROVAL_DECIDED")
            if (etag != approval.etag) return refuse(412, "PRECONDITION_FAILED")
            decided[approvalId] = key
            effects += approvalId
            return applied(replace(current.copy(status = "completed", outcome = "action_completed", answer = "Done. Created \u201cWater the plants\u201d.",
                finishedAt = at(), approval = approval.copy(status = "approved", decidedAt = at(), resultRef = id(), version = "2", etag = tag()))))
        }

        override suspend fun reject(authorization: String, approvalId: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<AgentRunDto>> {
            decisions += listOf("reject", approvalId, null, etag)
            val current = runs.first { it.approval?.id == approvalId }
            val approval = current.approval!!
            if (approval.status == "rejected") return reply(current)
            if (approval.status != "pending") return refuse(409, "APPROVAL_DECIDED")
            if (etag != approval.etag) return refuse(412, "PRECONDITION_FAILED")
            return applied(replace(current.copy(status = "cancelled", answer = "Okay. Nothing was changed.", stopReason = "rejected", finishedAt = at(),
                approval = approval.copy(status = "rejected", reason = "rejected", decidedAt = at(), version = "2", etag = tag()))))
        }

        override suspend fun memories(authorization: String): Response<EnvelopeDto<List<AgentMemoryDto>>> =
            if (failure != 0) refuse(failure, "SYNTHETIC") else reply(memories.toList())

        override suspend fun forget(authorization: String, memoryId: String): Response<EnvelopeDto<AgentDeletedDto>> {
            if (memories.none { it.id == memoryId }) return refuse(404, "NOT_FOUND")
            memories.removeAll { it.id == memoryId }
            forgets += memoryId
            return applied(AgentDeletedDto(memoryId, "deleted"))
        }
    }

    private val api = FakeApi()
    private val repository = AgentRepository(api, fixture.accounts)
    private var model: AgentViewModel? = null
    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }
    private suspend fun settle(current: AgentViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(): AgentViewModel {
        val current = AgentViewModel(repository, fixture.repository); model = current
        current.bind(fixture.accountId); settle(current)
        return current
    }
    private suspend fun asked(current: AgentViewModel, message: String): AgentRunDto {
        current.message(message); current.ask(); settle(current)
        return current.state.value.runs.first()
    }

    @Test fun consistentRunsPassAndInconsistentOnesAreRefused() {
        val waiting = run("Add a task").let { it.copy(status = "waiting_for_approval", approval = proposal(it.id, taskFields)) }
        val asking = run("Remind me").copy(status = "waiting_for_user", question = AgentQuestionDto(id(), "What time?", "2026-10-02T09:00:00Z"))
        assertEquals(waiting, repository.run(waiting, fixture.spaceId))
        assertEquals(asking, repository.run(asking, fixture.spaceId))
        val approval = waiting.approval!!
        val invalid = listOf(waiting.copy(spaceId = id()), waiting.copy(status = "paused"), waiting.copy(version = "0"),
            waiting.copy(createdAt = "yesterday"), waiting.copy(message = " "), waiting.copy(outcome = "maybe"),
            asking.copy(status = "running"), waiting.copy(question = asking.question), asking.copy(question = null),
            waiting.copy(approval = approval.copy(status = "approved", decidedAt = at())),
            waiting.copy(approval = approval.copy(decidedAt = at())), waiting.copy(approval = approval.copy(runId = id())),
            waiting.copy(approval = approval.copy(etag = "\"abc\"")), waiting.copy(approval = approval.copy(risk = "high")),
            waiting.copy(approval = approval.copy(fields = List(11) { AgentFieldDto("Field", "Value") })),
            waiting.copy(approval = approval.copy(resultRef = "result")))
        for (value in invalid) assertThrows(IdentityFailure::class.java) { repository.run(value, fixture.spaceId) }
        assertThrows(IdentityFailure::class.java) { repository.memory(memory().copy(kind = "secret")) }
        assertThrows(IdentityFailure::class.java) { repository.memory(memory(content = "x".repeat(201))) }
    }

    @Test fun messageRulesMatchTheService() {
        assertEquals("Add a task", normalizedAgentMessage("  Add a task \n"))
        assertEquals(AgentProblem.EMPTY, agentMessageProblem(""))
        assertEquals(AgentProblem.TOO_LONG, agentMessageProblem("a".repeat(501)))
        assertNull(agentMessageProblem("a".repeat(500)))
        assertNull(agentMessageProblem("\uD83C\uDF31".repeat(500)))
        assertEquals(AgentProblem.TOO_LONG, agentMessageProblem("\uD83C\uDF31".repeat(501)))
        for (refused in listOf("Ring\u0007", "Two\nlines", "Joined\u200Dword", "Private\uE000", "Lone\uD83C")) {
            assertEquals(refused, AgentProblem.CONTROL, agentMessageProblem(refused))
        }
    }

    @Test fun pagesAdvanceWithoutRepeatsAndStayNewestFirst(): Unit = runBlocking {
        repeat(3) { api.runs.add(0, run("Request $it", "completed").copy(finishedAt = at())) }
        api.pageSize = 2
        val first = repository.runs(fixture.accountId, fixture.spaceId, null)
        assertEquals(listOf("Request 2", "Request 1"), first.items.map { it.message })
        assertEquals("after-2", first.nextCursor)
        val second = repository.runs(fixture.accountId, fixture.spaceId, first.nextCursor, first.items.map { it.id }.toSet())
        assertEquals(listOf("Request 0"), second.items.map { it.message })
        assertNull(second.nextCursor)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.runs(fixture.accountId, fixture.spaceId, null, setOf(api.runs[0].id)) } }
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.runs(fixture.accountId, fixture.spaceId, null, emptySet(), setOf("after-2")) } }
        api.runs.reverse()
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.runs(fixture.accountId, fixture.spaceId, null) } }
    }

    @Test fun askingShowsTheExactChangeAndNothingRunsBeforeApproval(): Unit = runBlocking {
        val current = ready()
        assertEquals(fixture.spaceId, current.state.value.spaceId)
        assertTrue(current.state.value.runsLoaded && current.state.value.runs.isEmpty())
        val created = asked(current, "  Add a task to water the plants tomorrow ")
        assertTrue(created.awaitingApproval)
        assertEquals(taskFields, created.approval!!.fields)
        assertEquals("", current.state.value.message)
        assertEquals(AgentAskDto(fixture.spaceId, "Add a task to water the plants tomorrow"), api.asks.single().second)
        assertTrue(api.effects.isEmpty())
        current.decide(created.id, true); settle(current)
        assertEquals("completed", current.state.value.runs.single().status)
        assertEquals(listOf(created.approval!!.id), api.effects)
        assertEquals(created.approval!!.etag, api.decisions.single()[3])
    }

    @Test fun aLostRequestIsSentAgainWithTheSameKeyAndCreatesOneRequest(): Unit = runBlocking {
        val current = ready()
        api.lose = 1
        current.message("Add a task to water the plants tomorrow"); current.ask(); settle(current)
        val pending = current.state.value.pending as AgentCommand.Ask
        assertEquals(AgentIssue.UNCERTAIN, current.state.value.issue)
        assertEquals(AGENT_AT_COMPOSER, current.state.value.at)
        current.message("Something else")
        assertEquals("Add a task to water the plants tomorrow", current.state.value.message)
        current.retry(); settle(current)
        assertNull(current.state.value.pending)
        assertEquals(listOf(pending.key, pending.key), api.asks.map { it.first })
        assertEquals(1, api.runs.size)
        assertEquals(1, current.state.value.runs.size)

        api.lose = 1
        current.message("Add a task to sweep the porch"); current.ask(); settle(current)
        assertTrue(current.state.value.pending is AgentCommand.Ask)
        current.discard(); settle(current)
        assertNull(current.state.value.pending)
        assertEquals(listOf("Add a task to sweep the porch", "Add a task to water the plants tomorrow"), current.state.value.runs.map { it.message })
        assertEquals("Add a task to sweep the porch", current.state.value.message)
    }

    @Test fun aLostApprovalIsSentAgainWithTheSameKeyAndVersionAndActsOnce(): Unit = runBlocking {
        val current = ready()
        val created = asked(current, "Add a task to water the plants tomorrow")
        api.lose = 1
        current.decide(created.id, true); settle(current)
        assertTrue(current.state.value.pending is AgentCommand.Decide)
        assertEquals(created.id, current.state.value.at)
        assertEquals(AgentIssue.UNCERTAIN, current.state.value.issue)
        current.decide(created.id, false); settle(current)
        assertEquals(1, api.decisions.size)
        current.retry(); settle(current)
        assertEquals(2, api.decisions.size)
        assertEquals(api.decisions[0], api.decisions[1])
        assertEquals(listOf(created.approval!!.id), api.effects)
        assertEquals("completed", current.state.value.runs.single().status)
        assertNull(current.state.value.pending)
    }

    @Test fun aChangedApprovalIsRefusedAndTheRequestsReload(): Unit = runBlocking {
        val current = ready()
        val created = asked(current, "Add a task to water the plants tomorrow")
        val changed = created.approval!!.copy(etag = tag(), version = "2")
        api.runs.replaceAll { it.copy(approval = changed) }
        val reads = api.runsCalls
        current.decide(created.id, true); settle(current)
        assertNull(current.state.value.pending)
        assertEquals("Synthetic PRECONDITION_FAILED", current.state.value.error)
        assertEquals(created.id, current.state.value.at)
        assertEquals(reads + 1, api.runsCalls)
        assertEquals(changed.etag, current.state.value.runs.single().approval!!.etag)
        assertTrue(api.effects.isEmpty())
        current.decide(created.id, true); settle(current)
        assertEquals(api.decisions[0][2], api.decisions[1][2])
        assertEquals(changed.etag, api.decisions[1][3])
        assertEquals("completed", current.state.value.runs.single().status)
    }

    @Test fun answeringAQuestionThenDecliningChangesNothing(): Unit = runBlocking {
        val current = ready()
        val asking = asked(current, "Remind me about water the plants")
        assertEquals("What time should I remind you?", asking.question!!.text)
        current.reply(asking.id, " 6 pm "); current.answer(asking.id); settle(current)
        assertEquals(asking.id to AgentAnswerDto(asking.question!!.id, "6 pm"), api.answers.single())
        val proposed = current.state.value.runs.single()
        assertTrue(proposed.awaitingApproval)
        assertFalse(current.state.value.replies.containsKey(asking.id))
        current.decide(proposed.id, false); settle(current)
        assertEquals(listOf("reject", proposed.approval!!.id, null, proposed.approval!!.etag), api.decisions.single())
        assertEquals("cancelled", current.state.value.runs.single().status)
        assertEquals("Okay. Nothing was changed.", current.state.value.runs.single().answer)
        assertTrue(api.effects.isEmpty())
    }

    @Test fun stoppingAQuestionEndsTheRequest(): Unit = runBlocking {
        val current = ready()
        val asking = asked(current, "Remind me about water the plants")
        current.stop(asking.id); settle(current)
        assertEquals("cancelled", current.state.value.runs.single().status)
        assertTrue(api.answers.isEmpty() && api.effects.isEmpty())
    }

    @Test fun aMemoryIsDeletedOnlyAfterConfirmingAndAMissingOneCountsAsDeleted(): Unit = runBlocking {
        api.memories += memory(id(), "Mornings are best for errands")
        val current = ready()
        current.show(AgentView.MEMORIES); settle(current)
        assertEquals(2, current.state.value.memories.size)
        val first = current.state.value.memories.first()
        current.askForget(first)
        assertEquals(first, current.state.value.confirmingForget)
        current.keepMemory()
        assertNull(current.state.value.confirmingForget)
        assertTrue(api.forgets.isEmpty())
        current.askForget(first); current.forget(); settle(current)
        assertEquals(listOf(first.id), api.forgets)
        assertNull(current.state.value.confirmingForget)
        assertEquals(1, current.state.value.memories.size)

        val second = current.state.value.memories.single()
        api.lose = 1
        current.askForget(second); current.forget(); settle(current)
        assertTrue(current.state.value.pending is AgentCommand.Forget)
        assertEquals(second, current.state.value.confirmingForget)
        assertEquals(AGENT_AT_MEMORIES, current.state.value.at)
        current.keepMemory()
        assertEquals(second, current.state.value.confirmingForget)
        current.retry(); settle(current)
        assertNull(current.state.value.pending)
        assertNull(current.state.value.confirmingForget)
        assertTrue(current.state.value.memories.isEmpty())
        assertEquals(listOf(first.id, second.id), api.forgets)
    }

    @Test fun aSignedOutAnswerClearsEverything(): Unit = runBlocking {
        val current = ready()
        asked(current, "Add a task to water the plants tomorrow")
        api.failure = 401
        current.show(AgentView.MEMORIES); settle(current)
        val state = current.state.value
        assertTrue(state.requiresSignIn)
        assertTrue(state.runs.isEmpty() && state.memories.isEmpty() && state.spaces.isEmpty())
        current.message("Anything"); current.ask()
        assertEquals("", current.state.value.message)
    }

    @Test fun wireRequestsCarryTheReviewedPathsHeadersAndBodies(): Unit = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val waiting = run("Add a task").let { it.copy(status = "waiting_for_approval", approval = proposal(it.id, taskFields)) }
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            bodies += request.body?.let { body -> Buffer().also { body.writeTo(it) }.readUtf8() } ?: ""
            val path = request.url.encodedPath
            val value: Any = when {
                path == "/v1/agent-memories" -> listOf(memory())
                path.startsWith("/v1/agent-memories/") -> AgentDeletedDto(memoryId, "deleted")
                path == "/v1/agent-runs" && request.method == "GET" -> listOf(waiting)
                else -> waiting
            }
            val pagination = if (path == "/v1/agent-runs" && request.method == "GET") PaginationDto(null, false) else null
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("Synthetic")
                .body(Gson().toJson(EnvelopeDto(value, null, pagination)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = AgentRepository(IdentityModule.agents(http, Gson()), fixture.accounts)
        val approval = waiting.approval!!
        wire.ask(AgentCommand.Ask(fixture.accountId, fixture.spaceId, "Add a task", "4b7a1d0e-34c5-4d7f-9a2b-1c3d5e7f9a0b"))
        wire.runs(fixture.accountId, fixture.spaceId, null)
        wire.decide(AgentCommand.Decide(fixture.accountId, fixture.spaceId, waiting.id, approval.id, approval.etag, true, "5c8b2e1f-45d6-4e80-8b3c-2d4e6f8a0b1c"))
        wire.decide(AgentCommand.Decide(fixture.accountId, fixture.spaceId, waiting.id, approval.id, approval.etag, false, "unused"))
        wire.stop(AgentCommand.Stop(fixture.accountId, fixture.spaceId, waiting.id))
        assertEquals(listOf(memory()), wire.memories(fixture.accountId))
        assertTrue(wire.forget(AgentCommand.Forget(fixture.accountId, memoryId)))

        assertEquals(listOf("POST /v1/agent-runs", "GET /v1/agent-runs", "POST /v1/agent-approvals/${approval.id}/approve",
            "POST /v1/agent-approvals/${approval.id}/reject", "POST /v1/agent-runs/${waiting.id}/cancel", "GET /v1/agent-memories",
            "DELETE /v1/agent-memories/$memoryId"), requests.map { "${it.method} ${it.url.encodedPath}" })
        assertTrue(requests.all { it.header("Authorization") == "Bearer ${fixture.token}" })
        assertEquals("4b7a1d0e-34c5-4d7f-9a2b-1c3d5e7f9a0b", requests[0].header("Idempotency-Key"))
        assertEquals("""{"space_id":"${fixture.spaceId}","message":"Add a task"}""", bodies[0])
        assertEquals(fixture.spaceId, requests[1].url.queryParameter("space_id"))
        assertEquals("10", requests[1].url.queryParameter("limit"))
        assertNull(requests[1].url.queryParameter("cursor"))
        assertEquals("5c8b2e1f-45d6-4e80-8b3c-2d4e6f8a0b1c", requests[2].header("Idempotency-Key"))
        assertEquals(approval.etag, requests[2].header("If-Match"))
        assertEquals(approval.etag, requests[3].header("If-Match"))
        assertNull(requests[3].header("Idempotency-Key"))
        assertEquals(listOf("{}", "{}", "{}"), bodies.subList(2, 5))
        assertEquals("", bodies[6])
    }

    @Test fun agentReadsAreCappedPerPath() {
        var size = 0
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("Synthetic")
                .body("x".repeat(size).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val runs = Request.Builder().url("https://offline.invalid/v1/agent-runs?space_id=${fixture.spaceId}").build()
        val memories = Request.Builder().url("https://offline.invalid/v1/agent-memories").build()
        size = 524288
        http.newCall(runs).execute().use { assertEquals(524288L, it.body!!.contentLength()) }
        size = 524289
        assertThrows(IOException::class.java) { http.newCall(runs).execute().close() }
        size = 262144
        http.newCall(memories).execute().use { assertEquals(262144L, it.body!!.contentLength()) }
        size = 262145
        assertThrows(IOException::class.java) { http.newCall(memories).execute().close() }
    }
}
