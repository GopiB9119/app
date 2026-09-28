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
import kotlinx.coroutines.runBlocking
import okhttp3.Headers.Companion.headersOf
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
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
    }

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
        private fun <Value> response(value: Value, page: Boolean = false, count: Int? = null, cursor: String? = null): Response<EnvelopeDto<Value>> {
            calls += 1
            if (failure != 0) return Response.error(failure, """{"error":{"code":"SYNTHETIC","message":"Synthetic failure"}}""".toResponseBody("application/json".toMediaType()))
            return Response.success(EnvelopeDto(value, null, if (page) PaginationDto(cursor, cursor != null) else null, count), headersOf("ETag", "\"preferences-$preferenceVersion\""))
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
    }
}