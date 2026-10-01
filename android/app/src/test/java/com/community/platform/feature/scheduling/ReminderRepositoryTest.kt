package com.community.platform.feature.scheduling

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.identity.UserDto
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import okhttp3.Headers.Companion.headersOf
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.util.UUID

class ReminderRepositoryTest {
    private val fixture = Fixture()

    @Test fun previewMustBelongToTheSelectedTaskAndCurrentAccount(): Unit = runBlocking {
        val result = fixture.repository.preview(fixture.accountId, fixture.request)
        assertEquals(2, result.options.size)
        fixture.api.previewValue = result.copy(recipient = ReminderRecipientDto(UUID.randomUUID().toString(), "Other"))
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.preview(fixture.accountId, fixture.request) } }
    }

    @Test fun reviewRejectsRepeatedInstantsAndUnexpectedChannels(): Unit = runBlocking {
        fixture.api.previewValue = fixture.preview.copy(options = listOf(fixture.preview.options[0], fixture.preview.options[0]))
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.preview(fixture.accountId, fixture.request) } }
        fixture.api.previewValue = fixture.preview.copy(channel = "email")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.preview(fixture.accountId, fixture.request) } }
    }

    @Test fun explicitSaveRetryRetainsReviewedTokenAndKey() = runBlocking {
        val intent = ReminderCreateIntent(fixture.accountId, fixture.taskId, UUID.randomUUID().toString(), fixture.preview.options[1].previewToken)
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.save(intent) } }
        assertEquals(1, fixture.api.keys.size)
        fixture.api.failure = 0
        fixture.repository.save(intent)
        assertEquals(listOf(intent.requestKey, intent.requestKey), fixture.api.keys)
        assertEquals(listOf(intent.previewToken, intent.previewToken), fixture.api.tokens)
    }

    @Test fun readingDoesNotCallAcknowledgment() = runBlocking {
        val value = fixture.repository.read(fixture.accountId, fixture.notificationId)
        assertEquals(listOf("read"), fixture.api.actions)
        assertNull(value.acknowledgedAt)
        fixture.repository.acknowledge(fixture.accountId, fixture.notificationId)
        assertEquals(listOf("read", "acknowledge"), fixture.api.actions)
    }

    @Test fun inboxRequiresAnUnreadCountAndConsistentPagination(): Unit = runBlocking {
        fixture.api.unread = null
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.inbox(fixture.accountId) } }
        fixture.api.unread = -1
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.inbox(fixture.accountId) } }
        fixture.api.unread = 1
        assertEquals(1, fixture.repository.inbox(fixture.accountId).unreadCount)
    }

    @Test fun exhaustedDeliveryIsAValidReminderButCannotClaimAcknowledgment(): Unit = runBlocking {
        fixture.api.reminderValue = fixture.reminder.copy(status = "failed", reason = "dispatch_failed")
        val result = fixture.repository.reminders(fixture.accountId)
        assertEquals("failed", result.items.single().status)
        assertEquals("dispatch_failed", result.items.single().reason)
        assertNull(result.items.single().acknowledgedAt)
        fixture.api.reminderValue = fixture.api.reminderValue.copy(acknowledgedAt = "2026-11-01T06:33:00Z")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.reminders(fixture.accountId) } }
    }

    @Test fun missingSessionAndDifferentAccountCannotSendAnyReminderRequest() = runBlocking {
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.preview(UUID.randomUUID().toString(), fixture.request) } }
        fixture.store.clear()
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.inbox(fixture.accountId) } }
        assertEquals(0, fixture.api.calls)
    }

    @Test fun preferenceChangesCarryTheReviewedEtagAndDoNotRetry() = runBlocking {
        fixture.api.failure = 412
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.setPreferences(fixture.accountId, false, "\"preferences-1\"") } }
        assertEquals(listOf("\"preferences-1\""), fixture.api.etags)
        assertEquals(1, fixture.api.calls)
    }

    @Test fun actualRetrofitEncodingSendsOnlyTheApprovedPreview() = runBlocking {
        var payload = ""
        var key: String? = null
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val bytes = Buffer()
            chain.request().body!!.writeTo(bytes)
            payload = bytes.readUtf8()
            key = chain.request().header("Idempotency-Key")
            val json = Gson().toJson(EnvelopeDto(fixture.reminder, null))
            okhttp3.Response.Builder().request(chain.request()).code(200).message("Synthetic")
                .protocol(Protocol.HTTP_1_1).body(json.toResponseBody("application/json".toMediaType())).build()
        }.build()
        val repository = ReminderRepository(IdentityModule.reminders(client, Gson()), fixture.accounts)
        val intent = ReminderCreateIntent(fixture.accountId, fixture.taskId, UUID.randomUUID().toString(), fixture.preview.options[1].previewToken)
        repository.save(intent)
        val encoded = JsonParser.parseString(payload).asJsonObject
        assertEquals(setOf("preview_token"), encoded.keySet())
        assertEquals(intent.previewToken, encoded["preview_token"].asString)
        assertEquals(intent.requestKey, key)
        assertTrue(!payload.contains("account_id"))
    }

    @Test fun proposalPreviewBindsRequesterRecipientAndResolvedClockTime(): Unit = runBlocking {
        val body = PreviewReminderRequestDto(fixture.taskId, fixture.otherId, fixture.request.localTime, fixture.request.timezone)
        val result = fixture.repository.previewRequest(fixture.accountId, body)
        assertEquals(fixture.otherId, result.recipient.accountId)
        fixture.api.requestPreviewValue = result.copy(requestedBy = result.recipient)
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.previewRequest(fixture.accountId, body) } }
        fixture.api.requestPreviewValue = result.copy(options = result.options.map { it.copy(utcOffsetMinutes = 0) })
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.previewRequest(fixture.accountId, body) } }
    }

    @Test fun proposalSaveRetainsOnlyItsReviewedPayloadAndKey() = runBlocking {
        val intent = fixture.requestIntent()
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.saveRequest(intent) } }
        fixture.api.failure = 0
        fixture.repository.saveRequest(intent)
        assertEquals(listOf(intent.requestKey, intent.requestKey), fixture.api.requestKeys)
        assertEquals(listOf(intent.previewToken, intent.previewToken), fixture.api.requestTokens)
        assertTrue(fixture.api.keys.isEmpty())
    }

    @Test fun proposalSaveRejectsMismatchedTimeOrTarget(): Unit = runBlocking {
        val intent = fixture.requestIntent()
        fixture.api.requestValue = fixture.proposal.copy(scheduledAt = "2026-11-01T05:30:00Z")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.saveRequest(intent) } }
        fixture.api.requestValue = fixture.proposal.copy(recipient = ReminderRecipientDto(fixture.notificationId, "Another"))
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.saveRequest(intent) } }
    }

    @Test fun requestListsRejectWrongAudienceLeakedReminderIdsAndRepeatedCursors(): Unit = runBlocking {
        fixture.api.requestItems = listOf(fixture.proposal)
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.requests(fixture.accountId, ReminderRequestDirection.RECEIVED) } }
        fixture.api.requestItems = listOf(fixture.proposal.copy(status = "accepted", resolvedAt = "2026-09-19T10:01:00Z", reminderId = fixture.reminderId))
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.requests(fixture.accountId, ReminderRequestDirection.SENT) } }
        fixture.api.requestItems = listOf(fixture.proposal)
        fixture.api.requestCursor = "same"
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.requests(fixture.accountId, ReminderRequestDirection.SENT, "same") } }
    }

    @Test fun onlyTheIntendedRecipientCanLoadOrAcceptAReview() = runBlocking {
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.reviewRequest(fixture.accountId, fixture.proposal) } }
        val intent = ReminderRequestResponseIntent(fixture.accountId, fixture.proposal, ReminderRequestResponse.ACCEPT, "x".repeat(64))
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.respondRequest(intent) } }
        assertEquals(0, fixture.api.calls)
        fixture.receiveRequest()
        val review = fixture.repository.reviewRequest(fixture.accountId, fixture.incoming)
        fixture.repository.respondRequest(ReminderRequestResponseIntent(fixture.accountId, review.request, ReminderRequestResponse.ACCEPT, review.previewToken))
        assertEquals(listOf("accept"), fixture.api.requestActions)
    }

    @Test fun recipientReviewCannotSubstituteAnotherRequestOrExpiredWindow(): Unit = runBlocking {
        fixture.receiveRequest()
        val original = fixture.api.requestReviewValue!!
        assertTrue(original.request.id != fixture.reminderId)
        fixture.api.requestReviewValue = original.copy(request = original.request.copy(id = fixture.reminderId))
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.reviewRequest(fixture.accountId, fixture.incoming) } }
        fixture.api.requestReviewValue = original.copy(expiresAt = "2026-11-01T06:30:00Z")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.reviewRequest(fixture.accountId, fixture.incoming) } }
    }

    @Test fun actualRetrofitAcceptanceSendsOnlyTheRecipientReviewToken() = runBlocking {
        fixture.receiveRequest()
        var payload = ""
        var route = ""
        var authorization: String? = null
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val buffer = Buffer(); chain.request().body!!.writeTo(buffer)
            payload = buffer.readUtf8(); route = chain.request().url.encodedPath; authorization = chain.request().header("Authorization")
            val accepted = fixture.incoming.copy(status = "accepted", resolvedAt = "2026-09-19T10:01:00Z", reminderId = fixture.reminderId, version = "2")
            okhttp3.Response.Builder().request(chain.request()).code(200).message("Synthetic").protocol(Protocol.HTTP_1_1)
                .body(Gson().toJson(EnvelopeDto(accepted, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val repository = ReminderRepository(IdentityModule.reminders(client, Gson()), fixture.accounts)
        val intent = ReminderRequestResponseIntent(fixture.accountId, fixture.incoming, ReminderRequestResponse.ACCEPT, "recipient-review-token-".repeat(4))
        repository.respondRequest(intent)
        assertEquals("/v1/reminder-requests/${fixture.incoming.id}/accept", route)
        assertEquals(setOf("preview_token"), JsonParser.parseString(payload).asJsonObject.keySet())
        assertEquals(intent.previewToken, JsonParser.parseString(payload).asJsonObject["preview_token"].asString)
        assertTrue(authorization!!.startsWith("Bearer "))
    }

    @Test fun seriesPreviewMustEchoTheRuleForTheCurrentAccount(): Unit = runBlocking {
        fixture.offerSeries()
        assertEquals(7, fixture.repository.previewSeries(fixture.accountId, fixture.rule).occurrenceCount)
        val preview = fixture.seriesPreview
        for (invalid in listOf(preview.copy(localTime = "09:00"), preview.copy(clockChangePolicy = "skip"), preview.copy(recipient = ReminderRecipientDto(fixture.otherId, "Sam")),
            preview.copy(occurrences = listOf(preview.occurrences[0].copy(utcOffsetMinutes = 0))), preview.copy(occurrences = preview.occurrences.reversed()),
            preview.copy(occurrences = listOf(preview.occurrences[0].copy(reminderId = fixture.reminderId))), preview.copy(channel = "email"))) {
            fixture.api.seriesPreviewValue = invalid
            assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.previewSeries(fixture.accountId, fixture.rule) } }
        }
        val calls = fixture.api.calls
        for (rule in listOf(fixture.rule.copy(weekdays = listOf("mon")), fixture.rule.copy(frequency = "weekly", repeatEvery = 5, weekdays = listOf("mon")),
            fixture.rule.copy(frequency = "weekly", weekdays = listOf("tue", "mon")), fixture.rule.copy(endDate = "2027-11-02"), fixture.rule.copy(localTime = "8:00"))) {
            assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.previewSeries(fixture.accountId, rule) } }
        }
        assertEquals(calls, fixture.api.calls)
    }

    @Test fun seriesSaveRetryKeepsItsKeyAndTokenAndChecksTheSavedRule(): Unit = runBlocking {
        fixture.offerSeries()
        val intent = SeriesCreateIntent(fixture.accountId, UUID.randomUUID().toString(), fixture.seriesPreview.previewToken, fixture.rule)
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.saveSeries(intent) } }
        fixture.api.failure = 0
        assertEquals(fixture.seriesId, fixture.repository.saveSeries(intent).id)
        assertEquals(listOf(intent.requestKey, intent.requestKey), fixture.api.seriesKeys)
        assertEquals(listOf(intent.previewToken, intent.previewToken), fixture.api.seriesTokens)
        fixture.api.seriesValue = fixture.series.copy(localTime = "09:00", nextOccurrence = null, status = "ended")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.saveSeries(intent) } }
    }

    @Test fun seriesListRejectsInconsistentStatesAndForeignTasks(): Unit = runBlocking {
        fixture.offerSeries()
        assertEquals(fixture.seriesId, fixture.repository.series(fixture.accountId, fixture.taskId).items.single().id)
        val series = fixture.series
        for (invalid in listOf(series.copy(status = "paused"), series.copy(status = "paused", reason = "by_person"), series.copy(reason = "by_person"),
            series.copy(nextOccurrence = series.nextOccurrence!!.copy(reminderId = null)), series.copy(taskId = fixture.spaceId), series.copy(etag = ""), series.copy(repeatEvery = 31))) {
            fixture.api.seriesItems = listOf(invalid)
            assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.series(fixture.accountId, fixture.taskId) } }
        }
        fixture.api.seriesItems = listOf(series.copy(status = "paused", reason = "task_changed", nextOccurrence = null))
        assertEquals("paused", fixture.repository.series(fixture.accountId).items.single().status)
    }

    @Test fun seriesCommandsSendTheReviewedEtagAndRequireTheConfirmedState(): Unit = runBlocking {
        fixture.offerSeries()
        val intent = SeriesCommandIntent(fixture.accountId, fixture.series, SeriesOperation.PAUSE, UUID.randomUUID().toString())
        assertEquals("paused", fixture.repository.commandSeries(intent).status)
        assertEquals(listOf("pause|${intent.requestKey}|\"series-1\"|${fixture.seriesId}"), fixture.api.seriesCommands)
        fixture.api.seriesResult = fixture.series
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.commandSeries(intent) } }
        fixture.api.seriesResult = fixture.series.copy(status = "ended", nextOccurrence = null)
        assertEquals("ended", fixture.repository.commandSeries(intent.copy(operation = SeriesOperation.SKIP)).status)
    }

    @Test fun snoozeSendsOnlyAnOfferedDurationAndMustCloseFurtherSnoozing(): Unit = runBlocking {
        fixture.offerSnooze()
        val item = fixture.repository.inbox(fixture.accountId).items.single()
        assertTrue(item.canSnooze)
        val calls = fixture.api.calls
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.snooze(SnoozeIntent(fixture.accountId, item, 15, UUID.randomUUID().toString())) } }
        assertEquals(calls, fixture.api.calls)
        val intent = SnoozeIntent(fixture.accountId, item, 10, UUID.randomUUID().toString())
        assertEquals("2026-11-01T06:42:00Z", fixture.repository.snooze(intent).snoozedUntil)
        assertEquals(listOf("${intent.requestKey}|10"), fixture.api.snoozes)
        fixture.api.snoozeValue = item
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.snooze(intent) } }
        fixture.api.notificationValue = item.copy(snoozedUntil = "2026-11-01T06:42:00Z")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.inbox(fixture.accountId) } }
    }

    @Test fun remindersAcceptOccurrencesAndFollowUpsButRejectMixedKinds(): Unit = runBlocking {
        val occurrence = fixture.reminder.copy(seriesId = fixture.seriesId, occurrenceDate = "2026-11-01")
        val followUp = fixture.reminder.copy(id = fixture.notificationId, seriesId = fixture.seriesId, followUpOf = fixture.reminderId, snoozeCount = 1)
        for (valid in listOf(occurrence, followUp, fixture.reminder.copy(followUpOf = fixture.reminderId, snoozeCount = 3))) {
            fixture.api.reminderValue = valid
            assertEquals(valid, fixture.repository.reminders(fixture.accountId).items.single())
        }
        assertTrue(occurrence.seriesOccurrence && !followUp.seriesOccurrence)
        for (invalid in listOf(occurrence.copy(occurrenceDate = null), followUp.copy(snoozeCount = 0), fixture.reminder.copy(snoozeCount = 1),
            followUp.copy(occurrenceDate = "2026-11-01"), followUp.copy(snoozeCount = 4), occurrence.copy(seriesId = "series"))) {
            fixture.api.reminderValue = invalid
            assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.reminders(fixture.accountId) } }
        }
    }

    @Test fun actualRetrofitSeriesCommandUsesTheRouteEtagAndIdempotencyKey(): Unit = runBlocking {
        var route = ""
        var payload = ""
        var headers = emptyList<String?>()
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val buffer = Buffer(); chain.request().body!!.writeTo(buffer)
            payload = buffer.readUtf8(); route = chain.request().url.encodedPath
            headers = listOf(chain.request().header("If-Match"), chain.request().header("Idempotency-Key"))
            val paused = fixture.series.copy(status = "paused", reason = "by_person", nextOccurrence = null, version = "2", etag = "\"series-2\"")
            okhttp3.Response.Builder().request(chain.request()).code(200).message("Synthetic").protocol(Protocol.HTTP_1_1)
                .body(Gson().toJson(EnvelopeDto(paused, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val repository = ReminderRepository(IdentityModule.reminders(client, Gson()), fixture.accounts)
        val intent = SeriesCommandIntent(fixture.accountId, fixture.series, SeriesOperation.PAUSE, UUID.randomUUID().toString())
        assertEquals("paused", repository.commandSeries(intent).status)
        assertEquals("/v1/reminder-series/${fixture.seriesId}/pause", route)
        assertEquals(listOf<String?>("\"series-1\"", intent.requestKey), headers)
        assertEquals("{}", payload)
    }

    @Test fun actualRetrofitSeriesCreationSendsOnlyTheReviewedTokenAndKey() = runBlocking {
        val requests = mutableListOf<Request>()
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            requests.add(chain.request())
            okhttp3.Response.Builder().request(chain.request()).code(201).message("Synthetic").protocol(Protocol.HTTP_1_1)
                .header("ETag", fixture.series.etag)
                .body(Gson().toJson(EnvelopeDto(fixture.series, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val repository = ReminderRepository(IdentityModule.reminders(client, Gson()), fixture.accounts)
        val intent = SeriesCreateIntent(fixture.accountId, UUID.randomUUID().toString(), fixture.seriesPreview.previewToken, fixture.rule)
        assertEquals(fixture.series, repository.saveSeries(intent))
        val request = requests.single()
        val buffer = Buffer(); request.body!!.writeTo(buffer)
        val body = JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertEquals("POST", request.method)
        assertEquals("/v1/reminder-series", request.url.encodedPath)
        assertNull(request.url.query)
        assertEquals(setOf("preview_token"), body.keySet())
        assertEquals(intent.previewToken, body["preview_token"].asString)
        assertEquals(listOf(intent.requestKey), request.headers.values("Idempotency-Key"))
        assertNull(request.header("If-Match"))
        assertEquals("Bearer synthetic-session-token-with-more-than-32-characters", request.header("Authorization"))
    }

    @Test fun actualRetrofitSnoozeSendsOnlyTheOfferedMinutesAndKey() = runBlocking {
        fixture.offerSnooze()
        val item = fixture.api.notificationValue
        val snoozed = item.copy(readAt = "2026-11-01T06:32:00Z", canSnooze = false, snoozedUntil = "2026-11-01T06:42:00Z")
        val requests = mutableListOf<Request>()
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            requests.add(chain.request())
            okhttp3.Response.Builder().request(chain.request()).code(200).message("Synthetic").protocol(Protocol.HTTP_1_1)
                .body(Gson().toJson(EnvelopeDto(snoozed, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val repository = ReminderRepository(IdentityModule.reminders(client, Gson()), fixture.accounts)
        val intent = SnoozeIntent(fixture.accountId, item, 10, UUID.randomUUID().toString())
        assertEquals(snoozed, repository.snooze(intent))
        val request = requests.single()
        val buffer = Buffer(); request.body!!.writeTo(buffer)
        val body = JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertEquals("POST", request.method)
        assertEquals("/v1/notifications/${item.id}/snooze", request.url.encodedPath)
        assertNull(request.url.query)
        assertEquals(setOf("minutes"), body.keySet())
        assertEquals(10, body["minutes"].asInt)
        assertEquals(listOf(intent.requestKey), request.headers.values("Idempotency-Key"))
        assertNull(request.header("If-Match"))
        assertEquals("Bearer synthetic-session-token-with-more-than-32-characters", request.header("Authorization"))
    }

    @Test fun actualRetrofitResumeSkipAndCancelUseReviewedSeriesPreconditions() = runBlocking {
        val paused = fixture.series.copy(status = "paused", reason = "by_person", nextOccurrence = null)
        val skipped = fixture.series.copy(nextOccurrence = fixture.series.nextOccurrence!!.copy(
            reminderId = fixture.otherId, localDate = "2026-11-02", scheduledAt = "2026-11-02T02:30:00Z"))
        val cancelled = fixture.series.copy(status = "cancelled", nextOccurrence = null)
        var answer = fixture.series
        val requests = mutableListOf<Request>()
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            requests.add(chain.request())
            okhttp3.Response.Builder().request(chain.request()).code(200).message("Synthetic").protocol(Protocol.HTTP_1_1)
                .header("ETag", answer.etag)
                .body(Gson().toJson(EnvelopeDto(answer, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val repository = ReminderRepository(IdentityModule.reminders(client, Gson()), fixture.accounts)
        for ((operation, original, result) in listOf(
            Triple(SeriesOperation.RESUME, paused, fixture.series),
            Triple(SeriesOperation.SKIP, fixture.series, skipped),
            Triple(SeriesOperation.CANCEL, fixture.series, cancelled),
            Triple(SeriesOperation.CANCEL, paused, cancelled),
        )) {
            answer = result.copy(version = "2", etag = "\"series-2\"")
            val intent = SeriesCommandIntent(fixture.accountId, original, operation, UUID.randomUUID().toString())
            val calls = requests.size
            assertEquals(answer, repository.commandSeries(intent))
            assertEquals(calls + 1, requests.size)
            val request = requests.last()
            val buffer = Buffer(); request.body!!.writeTo(buffer)
            assertEquals("POST", request.method)
            assertEquals("/v1/reminder-series/${original.id}/${operation.wireValue}", request.url.encodedPath)
            assertNull(request.url.query)
            assertEquals("{}", buffer.readUtf8())
            assertEquals(listOf(original.etag), request.headers.values("If-Match"))
            assertEquals(listOf(intent.requestKey), request.headers.values("Idempotency-Key"))
            assertEquals("Bearer synthetic-session-token-with-more-than-32-characters", request.header("Authorization"))
        }
    }

    class Fixture {
        val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
        val taskId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
        val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
        val reminderId = "81a09cbf-901e-470c-a905-27d565be91ae"
        val notificationId = "426ca72f-3c77-409d-90a1-4da512c00421"
        val otherId = "3c5354a9-9967-4314-bdee-9c2f23b227a1"
        val request = PreviewReminderDto(taskId, "2026-11-01T01:30:00", "America/New_York")
        val user = UserDto(accountId, "alex@example.test", "Alex", "America/New_York", true, 1)
        val store = AccountRepositoryTest.MemoryStore().apply { save(Credentials("synthetic-session-token-with-more-than-32-characters", accountId)) }
        val accounts = AccountRepository(AccountRepositoryTest.FakeApi(user, "synthetic-session-token-with-more-than-32-characters"), store, Gson())
        val preview = ReminderPreviewDto(taskId, "Groceries", "1", request.localTime, request.timezone, ReminderRecipientDto(accountId, "Alex"), "in_app", listOf(
            ReminderOptionDto("2026-11-01T05:30:00Z", "2026-11-02T05:30:00Z", -240, "first-reviewed-token-".repeat(4)),
            ReminderOptionDto("2026-11-01T06:30:00Z", "2026-11-02T06:30:00Z", -300, "second-reviewed-token-".repeat(4)),
        ), "2026-09-19T10:05:00Z")
        val reminder = ReminderDto(reminderId, taskId, spaceId, "Groceries", request.localTime, request.timezone, "2026-11-01T06:30:00Z", "2026-11-02T06:30:00Z", "scheduled", null, false, null, "1", "in_app")
        val notification = InboxNotificationDto(notificationId, reminderId, taskId, spaceId, "Groceries", reminder.scheduledAt, "2026-11-01T06:31:00Z", null, null)
        val proposal = ReminderRequestDto(notificationId, taskId, spaceId, "Groceries", "1", ReminderRecipientDto(accountId, "Alex"), ReminderRecipientDto(otherId, "Sam"), request.localTime, request.timezone,
            reminder.scheduledAt, reminder.expiresAt, "2026-09-22T10:00:00Z", "2026-09-19T10:00:00Z", null, "pending", false, null, "1", "in_app")
        val incoming = proposal.copy(requestedBy = proposal.recipient, recipient = proposal.requestedBy)
        val api = FakeApi(preview, reminder, notification).apply {
            requestValue = proposal
            requestPreviewValue = preview.copy(requestedBy = proposal.requestedBy, recipient = proposal.recipient, requestExpiresAt = proposal.expiresAt)
        }
        val repository = ReminderRepository(api, accounts)
        fun requestIntent() = ReminderRequestCreateIntent(accountId, taskId, spaceId, otherId, UUID.randomUUID().toString(), preview.options[1].previewToken,
            "1", request.localTime, request.timezone, reminder.scheduledAt)
        fun receiveRequest() {
            api.requestValue = incoming
            api.requestItems = listOf(incoming)
            api.requestReviewValue = ReminderRequestReviewDto(incoming, "recipient-review-token-".repeat(4), "2026-09-19T10:05:00Z")
        }
        val seriesId = "5b0a7e0c-2f55-4b5e-9d0e-7b1d6f3c2a11"
        val rule = PreviewReminderSeriesDto(taskId, "08:00", "Asia/Kolkata", "2026-11-01", "2026-11-07", "daily", 1, emptyList(), "shift_forward")
        val occurrence = SeriesOccurrenceDto(null, "2026-11-01", "08:00", "2026-11-01T02:30:00Z", 330, "none")
        val seriesPreview = ReminderSeriesPreviewDto(taskId, "Groceries", "1", ReminderRecipientDto(accountId, "Alex"), "daily", 1, emptyList(), "08:00", "Asia/Kolkata",
            "2026-11-01", "2026-11-07", "shift_forward", listOf(occurrence, occurrence.copy(localDate = "2026-11-02", scheduledAt = "2026-11-02T02:30:00Z")), 7, emptyList(),
            "in_app", "series-preview-token-".repeat(4), "2026-09-19T10:05:00Z")
        val series = ReminderSeriesDto(seriesId, taskId, spaceId, "Groceries", "1", false, "daily", 1, emptyList(), "08:00", "Asia/Kolkata", "2026-11-01", "2026-11-07",
            "shift_forward", "active", null, occurrence.copy(reminderId = reminderId), "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", "1", "\"series-1\"", "in_app")
        fun offerSeries() {
            api.seriesPreviewValue = seriesPreview
            api.seriesValue = series
            api.seriesItems = listOf(series)
        }
        fun offerSnooze(before: String = "2026-11-02T02:30:00Z") {
            api.notificationValue = notification.copy(seriesId = seriesId, canSnooze = true, snoozeBefore = before)
        }
    }

    data class SeriesCommandCall(val key: String, val etag: String, val identifier: String, val operation: String, val body: Map<String, String>)
    data class SnoozeCall(val key: String, val identifier: String, val body: SnoozeDto)

    class FakeApi(var previewValue: ReminderPreviewDto, var reminderValue: ReminderDto, var notificationValue: InboxNotificationDto) : ReminderApi {
        var failure = 0
        var cancelValue: ReminderDto? = null
        var calls = 0
        var unread: Int? = 1
        var enabled = true
        var preferenceVersion = 1
        val keys = mutableListOf<String>()
        val tokens = mutableListOf<String>()
        val actions = mutableListOf<String>()
        val etags = mutableListOf<String>()
        var requestValue: ReminderRequestDto? = null
        var requestPreviewValue: ReminderPreviewDto? = null
        var requestReviewValue: ReminderRequestReviewDto? = null
        var requestItems = emptyList<ReminderRequestDto>()
        var requestCursor: String? = null
        val requestKeys = mutableListOf<String>()
        val requestTokens = mutableListOf<String>()
        val requestActions = mutableListOf<String>()
        var seriesPreviewValue: ReminderSeriesPreviewDto? = null
        var seriesValue: ReminderSeriesDto? = null
        var seriesItems = emptyList<ReminderSeriesDto>()
        var seriesResult: ReminderSeriesDto? = null
        val seriesKeys = mutableListOf<String>()
        val seriesTokens = mutableListOf<String>()
        val seriesCommands = mutableListOf<String>()
        val seriesCalls = mutableListOf<SeriesCommandCall>()
        var snoozeValue: InboxNotificationDto? = null
        val snoozes = mutableListOf<String>()
        val snoozeCalls = mutableListOf<SnoozeCall>()
        var commandEntered: CompletableDeferred<Unit>? = null
        var commandGate: CompletableDeferred<Unit>? = null
        var loseCommandAnswer = false
        private fun <Value> response(value: Value, page: Boolean = false, count: Int? = null, cursor: String? = null): Response<EnvelopeDto<Value>> {
            calls += 1
            if (failure != 0) return Response.error(failure, """{"error":{"code":"SYNTHETIC","message":"Synthetic failure"}}""".toResponseBody("application/json".toMediaType()))
            return Response.success(EnvelopeDto(value, null, if (page) PaginationDto(cursor, cursor != null) else null, count), headersOf("ETag", "\"preferences-$preferenceVersion\""))
        }
        private suspend fun <Value> deliverCommand(answer: Response<EnvelopeDto<Value>>): Response<EnvelopeDto<Value>> {
            commandEntered?.complete(Unit)
            commandGate?.await()
            if (loseCommandAnswer && answer.isSuccessful) throw IOException("Synthetic lost answer after the command was applied")
            return answer
        }
        override suspend fun preview(authorization: String, body: PreviewReminderDto) = response(previewValue)
        override suspend fun create(authorization: String, key: String, body: SaveReminderDto): Response<EnvelopeDto<ReminderDto>> { keys.add(key); tokens.add(body.previewToken); return response(reminderValue) }
        override suspend fun reminders(authorization: String, taskId: String?, cursor: String?, limit: Int) = response(listOf(reminderValue), true)
        override suspend fun cancel(authorization: String, identifier: String, body: Map<String, String>): Response<EnvelopeDto<ReminderDto>> { actions.add("cancel"); return response(cancelValue ?: reminderValue.copy(status = "cancelled")) }
        override suspend fun inbox(authorization: String, cursor: String?, limit: Int) = response(listOf(notificationValue), true, unread)
        override suspend fun read(authorization: String, identifier: String, body: Map<String, String>): Response<EnvelopeDto<InboxNotificationDto>> { actions.add("read"); return response(notificationValue.copy(readAt = "2026-11-01T06:32:00Z")) }
        override suspend fun acknowledge(authorization: String, identifier: String, body: Map<String, String>): Response<EnvelopeDto<InboxNotificationDto>> { actions.add("acknowledge"); return response(notificationValue.copy(acknowledgedAt = "2026-11-01T06:33:00Z")) }
        override suspend fun preferences(authorization: String) = response(ReminderPreferenceDto(enabled, preferenceVersion.toString()))
        override suspend fun updatePreferences(authorization: String, etag: String, body: UpdateReminderPreferenceDto): Response<EnvelopeDto<ReminderPreferenceDto>> { etags.add(etag); if (failure == 0) { enabled = body.enabled; preferenceVersion += 1 }; return response(ReminderPreferenceDto(enabled, preferenceVersion.toString())) }
        override suspend fun previewRequest(authorization: String, body: PreviewReminderRequestDto) = response(requireNotNull(requestPreviewValue))
        override suspend fun createRequest(authorization: String, key: String, body: SaveReminderDto): Response<EnvelopeDto<ReminderRequestDto>> { requestKeys.add(key); requestTokens.add(body.previewToken); return response(requireNotNull(requestValue)) }
        override suspend fun requests(authorization: String, direction: String, cursor: String?, limit: Int) = response(requestItems, page = true, cursor = requestCursor)
        override suspend fun reviewRequest(authorization: String, identifier: String) = response(requireNotNull(requestReviewValue))
        override suspend fun acceptRequest(authorization: String, identifier: String, body: SaveReminderDto): Response<EnvelopeDto<ReminderRequestDto>> {
            requestActions.add("accept"); requestTokens.add(body.previewToken)
            return response(requireNotNull(requestValue).copy(status = "accepted", reminderId = reminderValue.id, resolvedAt = "2026-09-19T10:01:00Z", version = "2"))
        }
        override suspend fun declineRequest(authorization: String, identifier: String, body: Map<String, String>): Response<EnvelopeDto<ReminderRequestDto>> {
            requestActions.add("decline"); return response(requireNotNull(requestValue).copy(status = "declined", resolvedAt = "2026-09-19T10:01:00Z", version = "2"))
        }
        override suspend fun cancelRequest(authorization: String, identifier: String, body: Map<String, String>): Response<EnvelopeDto<ReminderRequestDto>> {
            requestActions.add("cancel"); return response(requireNotNull(requestValue).copy(status = "cancelled", resolvedAt = "2026-09-19T10:01:00Z", version = "2"))
        }
        override suspend fun previewSeries(authorization: String, body: PreviewReminderSeriesDto) = response(requireNotNull(seriesPreviewValue))
        override suspend fun createSeries(authorization: String, key: String, body: SaveReminderDto): Response<EnvelopeDto<ReminderSeriesDto>> {
            seriesKeys.add(key); seriesTokens.add(body.previewToken); return response(requireNotNull(seriesValue))
        }
        override suspend fun series(authorization: String, taskId: String?, cursor: String?, limit: Int) = response(seriesItems, true)
        override suspend fun commandSeries(authorization: String, key: String, etag: String, identifier: String, operation: String, body: Map<String, String>): Response<EnvelopeDto<ReminderSeriesDto>> {
            seriesCommands.add("$operation|$key|$etag|$identifier")
            seriesCalls.add(SeriesCommandCall(key, etag, identifier, operation, body.toMap()))
            val current = requireNotNull(seriesValue)
            val next = seriesResult ?: when (operation) {
                "pause" -> current.copy(status = "paused", reason = "by_person", nextOccurrence = null)
                "cancel" -> current.copy(status = "cancelled", reason = null, nextOccurrence = null)
                "skip" -> current.copy(nextOccurrence = current.nextOccurrence?.copy(localDate = "2026-11-02", scheduledAt = "2026-11-02T02:30:00Z"))
                else -> current.copy(status = "active", reason = null)
            }.copy(version = "2", etag = "\"series-2\"")
            val answer = response(next)
            if (answer.isSuccessful) {
                seriesValue = next
                seriesItems = seriesItems.map { if (it.id == identifier) next else it }
            }
            return deliverCommand(answer)
        }
        override suspend fun snooze(authorization: String, key: String, identifier: String, body: SnoozeDto): Response<EnvelopeDto<InboxNotificationDto>> {
            snoozes.add("$key|${body.minutes}")
            snoozeCalls.add(SnoozeCall(key, identifier, body))
            val next = snoozeValue ?: notificationValue.copy(readAt = "2026-11-01T06:32:00Z", canSnooze = false, snoozedUntil = "2026-11-01T06:42:00Z")
            val answer = response(next)
            if (answer.isSuccessful) {
                if (notificationValue.readAt == null && next.readAt != null) unread = unread?.let { (it - 1).coerceAtLeast(0) }
                notificationValue = next
            }
            return deliverCommand(answer)
        }
    }
}