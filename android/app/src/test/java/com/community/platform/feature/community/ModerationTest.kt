package com.community.platform.feature.community

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
import java.io.IOException
import java.util.Collections
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
class ModerationTest {
    private val stamp = "2026-10-02T10:00:00Z"
    private val decisionId = "9d6f9b64-bc1b-4a04-b017-6caf9f8b7a08"
    private val targetId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val otherId = "5f2b5d20-7e7d-4c60-9c73-2e6b5b4d3c03"
    private val appealId = "8c5e8a53-ab0a-4f93-af06-5b9e8e7a6f07"
    private val fixture = SpaceRepositoryTest.Fixture()
    private val item = ModerationQueueDto("post", targetId, ModerationPreviewDto("published", title = "Saturday walk", body = "Meet at 7"), "River Walkers", 4,
        listOf(ModerationReasonDto("spam", 1), ModerationReasonDto("privacy", 3)), stamp)
    private val notice = ModerationNoticeDto(decisionId, "post", targetId, "hide", "privacy", stamp, null, null)
    private val decision = ModerationDecisionDto(decisionId, "post", targetId, "hide", "privacy", "Moderator note", fixture.recipientId, stamp, null)
    private val appeal = ModerationAppealDto(appealId, decisionId, "Please review", "open", stamp, null)
    private val review = ModerationAppealReviewDto(appeal, decision, item.preview, item.pageName, null)
    private var model: ModerationViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private data class Recorded(val request: Request, val body: String)

    private inner class Wire {
        val requests: MutableList<Recorded> = Collections.synchronizedList(mutableListOf())
        val committedDecisions = mutableMapOf<String, ModerationDecisionDto>()
        var moderator = true
        var queue = listOf(item)
        var nextCursor: String? = null
        var more = listOf(item.copy(targetId = otherId))
        var cursorError: String? = null
        var decisionError: String? = null
        var decisionMessage = "You cannot decide on content you wrote or a page you own."
        var loseDecision = false
        var wrongDecisionTarget = false
        var loseAppeal = false
        var wrongAppealId = false
        var appeals = listOf(review)
        var notices = listOf(notice)
        var reports = listOf(MyReportDto(otherId, "post", targetId, "spam", "open", null, null, stamp, null))
        /** A request to this path waits, once recorded, until [hold] is released, so the test can act while it is unanswered. */
        @Volatile var holdPath: String? = null
        val hold = CountDownLatch(1)
        val holding = CompletableDeferred<Unit>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request()
            val buffer = Buffer()
            request.body?.writeTo(buffer)
            val body = buffer.readUtf8()
            requests += Recorded(request, body)
            val path = request.url.encodedPath
            if (path == holdPath) { holding.complete(Unit); check(hold.await(5, TimeUnit.SECONDS)) { "The held request was never released" } }
            val gson = Gson()
            when {
                path == "/v1/me/moderator" -> response(request, EnvelopeDto(ModeratorStatusDto(moderator), null))
                path == "/v1/moderation/queue" -> {
                    val cursor = request.url.queryParameter("cursor")
                    val error = cursorError
                    if (cursor != null && error != null) failure(request, if (error == "CURSOR_EXPIRED") 410 else 400, error)
                    else response(request, EnvelopeDto(if (cursor == null) queue else more, null, PaginationDto(if (cursor == null) nextCursor else null, cursor == null && nextCursor != null)))
                }
                path == "/v1/moderation/decisions" -> {
                    val command = gson.fromJson(body, ModerationDecisionBodyDto::class.java)
                    val error = decisionError
                    if (error != null) failure(request, if (error == "MODERATOR_REQUIRED") 403 else 409, error, decisionMessage)
                    else {
                        val result = committedDecisions.getOrPut(requireNotNull(request.header("Idempotency-Key"))) {
                            ModerationDecisionDto(decisionId, command.targetType, if (wrongDecisionTarget) otherId else command.targetId, command.action, command.reason, command.note, fixture.accountId, stamp, null)
                        }
                        if (loseDecision) throw IOException("Synthetic lost decision answer")
                        response(request, EnvelopeDto(result, null), 201)
                    }
                }
                path == "/v1/moderation/appeals" -> response(request, EnvelopeDto(appeals, null))
                path.startsWith("/v1/moderation/appeals/") && path.endsWith("/resolve") -> {
                    val command = gson.fromJson(body, ModerationResolveBodyDto::class.java)
                    val selected = appeals.single { path == "/v1/moderation/appeals/${it.appeal.id}/resolve" }
                    response(request, EnvelopeDto(selected.appeal.copy(id = if (wrongAppealId) otherId else selected.appeal.id, status = command.outcome, resolvedAt = stamp), null))
                }
                path == "/v1/me/moderation-notices" -> response(request, EnvelopeDto(notices, null))
                path.startsWith("/v1/moderation/decisions/") && path.endsWith("/appeal") -> {
                    val command = gson.fromJson(body, ModerationAppealBodyDto::class.java)
                    if (loseAppeal) throw IOException("Synthetic lost appeal answer")
                    response(request, EnvelopeDto(appeal.copy(note = command.note), null), 201)
                }
                path == "/v1/me/reports" -> response(request, EnvelopeDto(reports, null))
                else -> throw AssertionError("Unexpected request: ${request.method} $path")
            }
        }.build()
        val repository = ModerationRepository(IdentityModule.moderation(http, Gson()), fixture.accounts)

        private fun response(request: Request, value: Any, code: Int = 200) = okhttp3.Response.Builder()
            .request(request).protocol(Protocol.HTTP_1_1).code(code).message("Synthetic")
            .body(Gson().toJson(value).toResponseBody("application/json".toMediaType())).build()

        private fun failure(request: Request, status: Int, code: String, message: String = "Synthetic $code") =
            response(request, mapOf("error" to mapOf("code" to code, "message" to message, "details" to emptyMap<String, String>())), status)

        fun sent(path: String) = requests.filter { it.request.url.encodedPath == path }
        fun decisions() = sent("/v1/moderation/decisions")
        fun queueCursors() = sent("/v1/moderation/queue").map { it.request.url.queryParameter("cursor") }
    }

    private suspend fun idle(current: ModerationViewModel): ModerationState = withTimeout(5000) { current.state.first { !it.busy } }

    private suspend fun ready(wire: Wire, safety: Boolean = false): ModerationViewModel {
        model?.bind(null)
        val current = ModerationViewModel(wire.repository)
        model = current
        current.bind(fixture.accountId)
        if (safety) current.loadSafety() else current.openModeration()
        idle(current)
        return current
    }

    private fun choose(current: ModerationViewModel, action: String = "hide", reason: String = "privacy", note: String = "Review note") {
        current.editDecision(item, action, reason, note)
    }

    @Test fun nonModeratorSendsNoQueueOrAppealsRequest() = runBlocking {
        val wire = Wire().apply { moderator = false }
        val current = ready(wire)
        current.loadQueue()
        current.selectTab(ModerationTab.APPEALS)
        current.loadAppeals()
        idle(current)
        assertEquals(false, current.state.value.moderator)
        assertEquals(1, wire.sent("/v1/me/moderator").size)
        assertTrue(wire.sent("/v1/moderation/queue").isEmpty())
        assertTrue(wire.sent("/v1/moderation/appeals").isEmpty())
        assertTrue(current.state.value.queue.items.isEmpty())
    }

    @Test fun decisionSendsExactBodyKeyAndSessionWithoutADefaultAction() = runBlocking {
        val wire = Wire()
        val current = ready(wire)
        assertNull(current.state.value.draft(item).action)
        assertEquals("privacy", current.state.value.draft(item).reason)
        current.recordDecision(item)
        assertTrue(wire.decisions().isEmpty())
        choose(current, note = "  First line\r\nSecond line  ")
        current.recordDecision(item)
        idle(current)
        val sent = wire.decisions().single()
        assertEquals("POST", sent.request.method)
        assertEquals("Bearer ${fixture.token}", sent.request.header("Authorization"))
        assertNotNull(UUID.fromString(sent.request.header("Idempotency-Key")))
        assertEquals(JsonParser.parseString("""{"target_type":"post","target_id":"$targetId","action":"hide","reason":"privacy","note":"First line\nSecond line"}"""), JsonParser.parseString(sent.body))
        assertNull(sent.request.url.encodedQuery)
    }

    @Test fun decisionRetryReusesKeyAfterLostAnswer() = runBlocking {
        val wire = Wire().apply { loseDecision = true }
        val current = ready(wire)
        choose(current)
        current.recordDecision(item)
        idle(current)
        assertEquals(listOf(item), current.state.value.queue.items)
        assertEquals("OFFLINE", current.state.value.draft(item).error?.code)
        assertNull(current.state.value.message)
        wire.loseDecision = false
        current.recordDecision(item)
        idle(current)
        val requests = wire.decisions()
        assertEquals(2, requests.size)
        assertEquals(requests[0].request.header("Idempotency-Key"), requests[1].request.header("Idempotency-Key"))
        assertEquals(requests[0].body, requests[1].body)
        assertEquals(1, wire.committedDecisions.size)
        assertTrue(current.state.value.queue.items.isEmpty())
        assertEquals(ModerationMessage.DECISION_RECORDED, current.state.value.message)
    }

    @Test fun changingAnyDecisionFieldGetsANewKeyEvenIfChangedBack() = runBlocking {
        val wire = Wire().apply { loseDecision = true }
        val current = ready(wire)
        choose(current)
        current.recordDecision(item); idle(current)
        choose(current, note = "Changed note")
        choose(current)
        current.recordDecision(item); idle(current)
        choose(current, action = "no_action")
        current.recordDecision(item); idle(current)
        choose(current, action = "no_action", reason = "spam")
        current.recordDecision(item); idle(current)
        assertEquals(4, wire.decisions().size)
        assertEquals(4, wire.decisions().map { it.request.header("Idempotency-Key") }.distinct().size)
        assertEquals(wire.decisions()[0].body, wire.decisions()[1].body)
        assertEquals("no_action", JsonParser.parseString(wire.decisions()[2].body).asJsonObject["action"].asString)
        assertEquals("spam", JsonParser.parseString(wire.decisions()[3].body).asJsonObject["reason"].asString)
    }

    @Test fun successRemovesOnlyTheDecidedQueueItem() = runBlocking {
        val remaining = item.copy(targetId = otherId)
        val wire = Wire().apply { queue = listOf(item, remaining) }
        val current = ready(wire)
        choose(current, action = "no_action")
        current.recordDecision(item); idle(current)
        assertEquals(listOf(remaining), current.state.value.queue.items)
        assertEquals(ModerationMessage.DECISION_RECORDED, current.state.value.message)
        assertFalse(current.state.value.decisions.containsKey(item.key))
    }

    // Without the app-wide request lock (T82), a read sent beside a decision could answer after it and bring the decided item back.
    @Test fun aRefreshDuringAnUnansweredDecisionIsNotSentSoItCannotBringBackTheItem() = runBlocking {
        val wire = Wire()
        val current = ready(wire)
        choose(current)
        wire.holdPath = "/v1/moderation/decisions"
        current.recordDecision(item)
        withTimeout(5000) { wire.holding.await() }
        val sent = wire.requests.size
        current.refresh()
        current.loadQueue()
        current.selectTab(ModerationTab.APPEALS)
        wire.hold.countDown()
        val settled = idle(current)
        assertEquals(sent, wire.requests.size)
        assertTrue(settled.queue.items.isEmpty())
        assertEquals(ModerationTab.REPORTS, settled.tab)
        assertEquals(ModerationMessage.DECISION_RECORDED, settled.message)
    }

    @Test fun aDecisionWhileTheQueueLoadsIsNotSentSoTheQueuesOlderAnswerCannotBringTheItemBack() = runBlocking {
        val wire = Wire()
        val current = ready(wire)
        choose(current)
        wire.holdPath = "/v1/moderation/queue"
        current.loadQueue()
        withTimeout(5000) { wire.holding.await() }
        current.recordDecision(item)
        wire.hold.countDown()
        val settled = idle(current)
        assertTrue(wire.decisions().isEmpty())
        assertEquals(listOf(item), settled.queue.items)
        assertEquals("Review note", settled.draft(item).note)
    }

    @Test fun conflictOfInterestKeepsTheItemAndServerMessage() = runBlocking {
        val wire = Wire().apply { decisionError = "CONFLICT_OF_INTEREST" }
        val current = ready(wire)
        choose(current)
        current.recordDecision(item); idle(current)
        assertEquals(listOf(item), current.state.value.queue.items)
        assertEquals("CONFLICT_OF_INTEREST", current.state.value.draft(item).error?.code)
        assertEquals(wire.decisionMessage, current.state.value.draft(item).error?.message)
        assertEquals("Review note", current.state.value.draft(item).note)
        assertNull(current.state.value.message)
    }

    @Test fun loadMoreSendsTheCursorAndAppendsWithoutDuplicates() = runBlocking {
        val second = item.copy(targetId = otherId)
        val wire = Wire().apply { nextCursor = "after-first"; more = listOf(item, second) }
        val current = ready(wire)
        assertEquals("after-first", current.state.value.nextCursor)
        current.loadQueue(more = true); idle(current)
        assertEquals(listOf(null, "after-first"), wire.queueCursors())
        assertEquals(listOf(item, second), current.state.value.queue.items)
        assertNull(current.state.value.nextCursor)
        assertTrue(wire.sent("/v1/moderation/queue").all { it.request.url.queryParameter("limit") == "20" })
    }

    private suspend fun cursorRestarts(code: String) {
        val replacement = item.copy(targetId = otherId)
        val wire = Wire().apply { nextCursor = "expired-cursor" }
        val current = ready(wire)
        wire.queue = listOf(replacement)
        wire.nextCursor = null
        wire.cursorError = code
        current.loadQueue(more = true); idle(current)
        assertEquals(listOf(null, "expired-cursor", null), wire.queueCursors())
        assertEquals(listOf(replacement), current.state.value.queue.items)
        assertNull(current.state.value.nextCursor)
        assertNull(current.state.value.queue.error)
    }

    @Test fun expiredCursorReloadsFromTheStart() = runBlocking { cursorRestarts("CURSOR_EXPIRED") }
    @Test fun invalidCursorReloadsFromTheStart() = runBlocking { cursorRestarts("CURSOR_INVALID") }

    @Test fun resolveSendsOutcomeAndNoteToTheRightAppealAndRemovesIt() = runBlocking {
        val other = review.copy(appeal = appeal.copy(id = otherId))
        val wire = Wire().apply { appeals = listOf(review, other) }
        val current = ready(wire)
        current.selectTab(ModerationTab.APPEALS); idle(current)
        assertEquals("open", wire.sent("/v1/moderation/appeals").single().request.url.queryParameter("status"))
        current.editResolution(otherId, "  Restore this content  ")
        current.resolveAppeal(other, "overturned"); idle(current)
        val sent = wire.sent("/v1/moderation/appeals/$otherId/resolve").single()
        assertEquals("POST", sent.request.method)
        assertEquals(JsonParser.parseString("""{"outcome":"overturned","note":"Restore this content"}"""), JsonParser.parseString(sent.body))
        assertEquals(listOf(review), current.state.value.appeals.items)
        assertEquals(ModerationMessage.APPEAL_RESOLVED, current.state.value.message)
        current.resolveAppeal(review, "upheld"); idle(current)
        assertEquals("upheld", JsonParser.parseString(wire.sent("/v1/moderation/appeals/$appealId/resolve").single().body).asJsonObject["outcome"].asString)
        assertTrue(current.state.value.appeals.items.isEmpty())
    }

    @Test fun aResolutionForTheWrongAppealDoesNotRemoveTheItem() = runBlocking {
        val wire = Wire().apply { wrongAppealId = true }
        val current = ready(wire)
        current.selectTab(ModerationTab.APPEALS); idle(current)
        current.resolveAppeal(review, "upheld"); idle(current)
        assertEquals(listOf(review), current.state.value.appeals.items)
        assertEquals("INVALID_RESPONSE", current.state.value.resolutions[appealId]?.error?.code)
        assertNull(current.state.value.message)
    }

    @Test fun appealSendsRequiredNoteAndKeyAndUpdatesItsNotice() = runBlocking {
        val wire = Wire()
        val current = ready(wire, safety = true)
        current.selectAppeal(notice)
        current.editAppeal(decisionId, "   ")
        current.sendAppeal(notice)
        assertTrue(wire.sent("/v1/moderation/decisions/$decisionId/appeal").isEmpty())
        current.editAppeal(decisionId, "  Please review again  ")
        current.sendAppeal(notice); idle(current)
        val sent = wire.sent("/v1/moderation/decisions/$decisionId/appeal").single()
        assertEquals("POST", sent.request.method)
        assertEquals("Bearer ${fixture.token}", sent.request.header("Authorization"))
        assertNotNull(UUID.fromString(sent.request.header("Idempotency-Key")))
        assertEquals(JsonParser.parseString("""{"note":"Please review again"}"""), JsonParser.parseString(sent.body))
        assertEquals("open", current.state.value.notices.items.single().appealStatus)
        assertFalse(current.state.value.notices.items.single().canAppeal)
        assertNull(current.state.value.selectedNoticeId)
        assertEquals(ModerationMessage.APPEAL_SENT, current.state.value.message)
    }

    @Test fun appealRetryAfterClosingTheDialogKeepsItsKeyButAnEditedNoteChangesIt() = runBlocking {
        val wire = Wire().apply { loseAppeal = true }
        val current = ready(wire, safety = true)
        current.selectAppeal(notice)
        current.editAppeal(decisionId, "Please review")
        current.sendAppeal(notice); idle(current)
        assertEquals("OFFLINE", current.state.value.appealDrafts[decisionId]?.error?.code)
        current.selectAppeal(null)
        current.selectAppeal(notice)
        assertEquals("Please review", current.state.value.appealDrafts[decisionId]?.note)
        current.sendAppeal(notice); idle(current)
        current.editAppeal(decisionId, "More context")
        wire.loseAppeal = false
        current.sendAppeal(notice); idle(current)
        val sent = wire.sent("/v1/moderation/decisions/$decisionId/appeal")
        assertEquals(3, sent.size)
        assertEquals(sent[0].request.header("Idempotency-Key"), sent[1].request.header("Idempotency-Key"))
        assertEquals(sent[0].body, sent[1].body)
        assertNotEquals(sent[1].request.header("Idempotency-Key"), sent[2].request.header("Idempotency-Key"))
        assertEquals(ModerationMessage.APPEAL_SENT, current.state.value.message)
    }

    @Test fun staleOrIneligibleNoticesCannotSendAnAppeal() = runBlocking {
        val wire = Wire().apply { notices = listOf(notice.copy(appealStatus = "open")) }
        val current = ready(wire, safety = true)
        current.selectAppeal(notice)
        current.editAppeal(decisionId, "Please review")
        current.sendAppeal(notice); idle(current)
        assertNull(current.state.value.selectedNoticeId)
        assertTrue(wire.sent("/v1/moderation/decisions/$decisionId/appeal").isEmpty())
    }

    @Test fun safetyLoadsReportsWithAllThreeReviewStates() = runBlocking {
        val wire = Wire()
        val waiting = wire.reports.single()
        wire.reports = listOf(waiting, waiting.copy(id = targetId, status = "reviewed", outcome = "action_taken", action = "hide", reviewedAt = stamp),
            waiting.copy(id = appealId, status = "reviewed", outcome = "no_action", action = "no_action", reviewedAt = stamp))
        val current = ready(wire, safety = true)
        assertEquals(listOf(ReportReviewState.WAITING, ReportReviewState.ACTION_TAKEN, ReportReviewState.NO_ACTION), current.state.value.reports.items.map { it.reviewState })
        assertTrue(current.state.value.reports.loaded)
        assertEquals(listOf(notice), current.state.value.notices.items)
        assertTrue(wire.sent("/v1/moderation/queue").isEmpty())
        assertEquals(1, wire.sent("/v1/me/reports").size)
    }

    @Test fun mismatchedDecisionResponseDoesNotRemoveContent() = runBlocking {
        val wire = Wire().apply { wrongDecisionTarget = true }
        val current = ready(wire)
        choose(current)
        current.recordDecision(item); idle(current)
        assertEquals(listOf(item), current.state.value.queue.items)
        assertEquals("INVALID_RESPONSE", current.state.value.draft(item).error?.code)
        assertNull(current.state.value.message)
    }

    @Test fun moderatorRevocationClearsQueueAndConfidentialDrafts() = runBlocking {
        val wire = Wire().apply { decisionError = "MODERATOR_REQUIRED" }
        val current = ready(wire)
        choose(current)
        current.recordDecision(item); idle(current)
        assertEquals(false, current.state.value.moderator)
        assertTrue(current.state.value.queue.items.isEmpty())
        assertTrue(current.state.value.decisions.isEmpty())
        current.loadQueue(); current.loadAppeals()
        assertEquals(1, wire.sent("/v1/moderation/queue").size)
        assertTrue(wire.sent("/v1/moderation/appeals").isEmpty())
    }

    @Test fun accountChangeClearsSafetyHistoryAndRetryIntents() = runBlocking {
        val wire = Wire().apply { loseDecision = true }
        val current = ready(wire)
        choose(current); current.recordDecision(item); idle(current)
        val originalKey = wire.decisions().single().request.header("Idempotency-Key")
        current.bind(null)
        assertEquals(ModerationState(), current.state.value)
        current.bind(fixture.accountId); current.openModeration(); idle(current)
        choose(current); current.recordDecision(item); idle(current)
        assertNotEquals(originalKey, wire.decisions().last().request.header("Idempotency-Key"))
    }

    @Test fun overlongNotesCannotSendDecisionsOrAppeals() = runBlocking {
        val wire = Wire()
        val current = ready(wire)
        choose(current, note = "a".repeat(1001))
        current.recordDecision(item)
        assertTrue(wire.decisions().isEmpty())
        current.closeModeration(); current.loadSafety(); idle(current)
        current.editAppeal(decisionId, "a".repeat(1001))
        current.sendAppeal(notice)
        assertTrue(wire.sent("/v1/moderation/decisions/$decisionId/appeal").isEmpty())
    }

    @Test fun inconsistentReportAndQueueResponsesAreRejected(): Unit = runBlocking {
        val wire = Wire()
        wire.reports = listOf(wire.reports.single().copy(status = "reviewed"))
        assertThrows(IdentityFailure::class.java) { runBlocking { wire.repository.reports(fixture.accountId) } }
        wire.queue = listOf(item.copy(reportCount = 100))
        assertThrows(IdentityFailure::class.java) { runBlocking { wire.repository.queue(fixture.accountId, null) } }
    }

    @Test fun moderationMarksAreParsedForPagesPostsAndComments() {
        val gson = Gson()
        val marked = """{"moderation":{"hidden":true,"reason":"privacy"}}"""
        val marks = listOf(
            gson.fromJson(marked, PageDto::class.java).moderation,
            gson.fromJson(marked, PostDto::class.java).moderation,
            gson.fromJson(marked, CommentDto::class.java).moderation,
        )
        marks.forEach { assertEquals(ModerationMarkDto(true, "privacy"), it) }
        assertNull(gson.fromJson("{}", PageDto::class.java).moderation)
        assertNull(gson.fromJson("{}", PostDto::class.java).moderation)
        assertNull(gson.fromJson("{}", CommentDto::class.java).moderation)
    }

    @Test fun appealIsOfferedOnlyForAnActiveHidingDecisionWithoutAnAppeal() {
        val notice = ModerationNoticeDto(decisionId, "post", targetId, "hide", "privacy", stamp, null, null)
        assertTrue(notice.canAppeal)
        listOf("no_action", "restore").forEach { assertFalse(notice.copy(action = it).canAppeal) }
        listOf("open", "upheld", "overturned").forEach { assertFalse(notice.copy(appealStatus = it).canAppeal) }
        assertFalse(notice.copy(appealOf = decisionId).canAppeal)
    }

    @Test fun reportsMapToWaitingActionTakenAndNoAction() {
        val report = MyReportDto(decisionId, "post", targetId, "spam", "open", null, null, stamp, null)
        assertEquals(ReportReviewState.WAITING, report.reviewState)
        assertEquals(ReportReviewState.ACTION_TAKEN, report.copy(status = "reviewed", outcome = "action_taken", action = "hide", reviewedAt = stamp).reviewState)
        assertEquals(ReportReviewState.NO_ACTION, report.copy(status = "reviewed", outcome = "no_action", action = "no_action", reviewedAt = stamp).reviewState)
    }

    @Test fun defaultReasonIsTheMostReportedReason() {
        val item = ModerationQueueDto("post", targetId, ModerationPreviewDto("published"), "River Walkers", 6,
            listOf(ModerationReasonDto("spam", 1), ModerationReasonDto("privacy", 4), ModerationReasonDto("other", 1)), stamp)
        assertEquals("privacy", item.defaultReason)
    }
}