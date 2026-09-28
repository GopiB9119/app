package com.community.platform.feature.scheduling

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import retrofit2.Response
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReminderRepository @Inject constructor(private val api: ReminderApi, private val accounts: AccountRepository) {
    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected reminder response.")
    private fun validate(test: () -> Unit) {
        try { test() } catch (_error: IllegalArgumentException) { invalid() } catch (_error: NullPointerException) { invalid() }
        catch (_error: java.time.DateTimeException) { invalid() }
    }
    private fun reminder(value: ReminderDto): ReminderDto {
        validate {
            UUID.fromString(value.id); UUID.fromString(value.taskId); UUID.fromString(value.spaceId)
            LocalDateTime.parse(value.localTime); ZoneId.of(value.timezone)
            require(Instant.parse(value.expiresAt) > Instant.parse(value.scheduledAt))
            require(value.version.toLong() > 0 && value.channel == "in_app")
            require(value.status in setOf("scheduled", "available", "cancelled", "suppressed", "expired", "failed"))
            require(value.acknowledgedAt == null || value.status == "available")
            value.acknowledgedAt?.let(Instant::parse)
        }
        return value
    }
    private fun notification(value: InboxNotificationDto): InboxNotificationDto {
        validate {
            UUID.fromString(value.id); UUID.fromString(value.reminderId); UUID.fromString(value.taskId); UUID.fromString(value.spaceId)
            Instant.parse(value.scheduledAt); Instant.parse(value.createdAt)
            value.readAt?.let(Instant::parse); value.acknowledgedAt?.let(Instant::parse)
            require(value.taskTitle.isNotEmpty())
        }
        return value
    }
    private fun <Value : Any> page(response: Response<EnvelopeDto<List<Value>>>, unread: Boolean = false): ReminderPage<Value> {
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid()
        if (items.size > 20 || pagination.hasMore != (pagination.nextCursor != null)) invalid()
        if (pagination.nextCursor != null && (pagination.nextCursor.isBlank() || pagination.nextCursor.length > 2048 || items.isEmpty())) invalid()
        val count = response.body()?.unreadCount
        if (unread && (count == null || count < 0)) invalid()
        return ReminderPage(items, pagination.nextCursor, count)
    }
    suspend fun preview(accountId: String, body: PreviewReminderDto): ReminderPreviewDto = accounts.authorized(accountId) {
        val result = accounts.result(api.preview(it, body))
        validate {
            require(result.taskId == body.taskId && result.recipient.accountId == accountId)
            require(result.timezone == body.timezone && LocalDateTime.parse(result.localTime) == LocalDateTime.parse(body.localTime))
            require(result.channel == "in_app" && result.taskVersion.toLong() > 0)
            require(result.options.size in 1..2 && result.options.map { option -> option.scheduledAt }.distinct().size == result.options.size)
            Instant.parse(result.expiresAt)
            result.options.forEach { option ->
                require(Instant.parse(option.dispatchExpiresAt) > Instant.parse(option.scheduledAt))
                require(option.utcOffsetMinutes in -840..840 && option.previewToken.length in 32..4096)
            }
        }
        result
    }
    suspend fun save(intent: ReminderCreateIntent): ReminderDto = accounts.authorized(intent.accountId) {
        val result = reminder(accounts.result(api.create(it, intent.requestKey, SaveReminderDto(intent.previewToken))))
        if (result.taskId != intent.taskId) invalid()
        result
    }
    suspend fun reminders(accountId: String, taskId: String? = null, cursor: String? = null): ReminderPage<ReminderDto> = accounts.authorized(accountId) {
        val result = page(api.reminders(it, taskId, cursor))
        result.items.forEach { item -> reminder(item); if (taskId != null && item.taskId != taskId) invalid() }
        if (result.items.map { item -> item.id }.distinct().size != result.items.size) invalid()
        result
    }
    suspend fun cancel(accountId: String, identifier: String): ReminderDto = accounts.authorized(accountId) {
        val result = reminder(accounts.result(api.cancel(it, identifier, emptyMap())))
        if (result.id != identifier) invalid()
        result
    }
    suspend fun inbox(accountId: String, cursor: String? = null): ReminderPage<InboxNotificationDto> = accounts.authorized(accountId) {
        val result = page(api.inbox(it, cursor), unread = true)
        result.items.forEach(::notification)
        if (result.items.map { item -> item.id }.distinct().size != result.items.size) invalid()
        result
    }
    suspend fun read(accountId: String, identifier: String): InboxNotificationDto = accounts.authorized(accountId) {
        val result = notification(accounts.result(api.read(it, identifier, emptyMap())))
        if (result.id != identifier) invalid()
        result
    }
    suspend fun acknowledge(accountId: String, identifier: String): InboxNotificationDto = accounts.authorized(accountId) {
        val result = notification(accounts.result(api.acknowledge(it, identifier, emptyMap())))
        if (result.id != identifier) invalid()
        result
    }
    private fun preference(response: Response<EnvelopeDto<ReminderPreferenceDto>>): ReminderPreferences {
        val value = accounts.result(response)
        val etag = response.headers()["ETag"] ?: invalid()
        validate { require(value.version.toLong() > 0 && etag.length in 3..160 && etag.startsWith('"') && etag.endsWith('"')) }
        return ReminderPreferences(value, etag)
    }
    suspend fun preferences(accountId: String): ReminderPreferences = accounts.authorized(accountId) { preference(api.preferences(it)) }
    suspend fun setPreferences(accountId: String, enabled: Boolean, etag: String): ReminderPreferences = accounts.authorized(accountId) {
        preference(api.updatePreferences(it, etag, UpdateReminderPreferenceDto(enabled)))
    }

    private fun requestUuid(value: String) { require(UUID.fromString(value).toString() == value) }
    private fun requestPerson(value: ReminderRecipientDto) {
        requestUuid(value.accountId)
        require(value.displayName.isNotBlank() && value.displayName.codePointCount(0, value.displayName.length) <= 80)
    }
    private fun request(value: ReminderRequestDto, accountId: String): ReminderRequestDto {
        validate {
            requestUuid(value.id); requestUuid(value.taskId); requestUuid(value.spaceId)
            requestPerson(value.requestedBy); requestPerson(value.recipient)
            require(value.requestedBy.accountId != value.recipient.accountId)
            require(accountId == value.requestedBy.accountId || accountId == value.recipient.accountId)
            require(value.taskTitle.isNotBlank() && value.taskTitle.codePointCount(0, value.taskTitle.length) <= 200)
            require(value.taskVersion.matches(Regex("[1-9][0-9]*")) && value.version.matches(Regex("[1-9][0-9]*")))
            require(value.channel == "in_app" && value.status in setOf("pending", "accepted", "declined", "cancelled", "expired", "outdated"))
            val local = LocalDateTime.parse(value.localTime)
            require(local.second == 0 && local.nano == 0)
            ZoneId.of(value.timezone)
            val scheduled = Instant.parse(value.scheduledAt)
            require(Instant.parse(value.dispatchExpiresAt) > scheduled)
            require(Instant.parse(value.expiresAt) <= scheduled && Instant.parse(value.createdAt) < Instant.parse(value.expiresAt))
            value.resolvedAt?.let(Instant::parse)
            require(value.status != "pending" || value.resolvedAt == null)
            require(value.status !in setOf("accepted", "declined", "cancelled") || value.resolvedAt != null)
            value.reminderId?.let(::requestUuid)
            require(value.status == "accepted" || value.reminderId == null)
            require(accountId != value.requestedBy.accountId || value.reminderId == null)
            require(accountId != value.recipient.accountId || value.status != "accepted" || value.reminderId != null)
        }
        return value
    }
    private fun matchRequest(result: ReminderRequestDto, expected: ReminderRequestDto) {
        validate {
            require(result.id == expected.id && result.taskId == expected.taskId && result.spaceId == expected.spaceId)
            require(result.recipient.accountId == expected.recipient.accountId && result.requestedBy.accountId == expected.requestedBy.accountId)
            require(result.taskVersion == expected.taskVersion && result.timezone == expected.timezone)
            require(LocalDateTime.parse(result.localTime) == LocalDateTime.parse(expected.localTime))
            require(Instant.parse(result.scheduledAt) == Instant.parse(expected.scheduledAt))
        }
    }
    suspend fun previewRequest(accountId: String, body: PreviewReminderRequestDto): ReminderPreviewDto = accounts.authorized(accountId) {
        val result = accounts.result(api.previewRequest(it, body))
        validate {
            require(result.taskId == body.taskId && result.recipient.accountId == body.recipientAccountId)
            require(result.requestedBy?.accountId == accountId && result.recipient.accountId != accountId)
            requestPerson(requireNotNull(result.requestedBy)); requestPerson(result.recipient)
            val local = LocalDateTime.parse(result.localTime)
            require(local == LocalDateTime.parse(body.localTime) && local.second == 0 && local.nano == 0)
            require(result.timezone == body.timezone && result.channel == "in_app" && result.taskVersion.matches(Regex("[1-9][0-9]*")))
            ZoneId.of(result.timezone); Instant.parse(result.expiresAt)
            val expiry = Instant.parse(requireNotNull(result.requestExpiresAt))
            require(result.options.size in 1..2)
            require(result.options.map(ReminderOptionDto::previewToken).distinct().size == result.options.size)
            val instants = result.options.map { option -> Instant.parse(option.scheduledAt) }
            require(instants.distinct().size == instants.size && instants == instants.sorted())
            result.options.forEach { option ->
                require(option.utcOffsetMinutes in -840..840 && option.previewToken.length in 32..4096)
                require(local.toInstant(ZoneOffset.ofTotalSeconds(option.utcOffsetMinutes * 60)) == Instant.parse(option.scheduledAt))
                require(Instant.parse(option.dispatchExpiresAt) > Instant.parse(option.scheduledAt) && expiry <= Instant.parse(option.scheduledAt))
            }
        }
        result
    }
    suspend fun saveRequest(intent: ReminderRequestCreateIntent): ReminderRequestDto = accounts.authorized(intent.accountId) {
        val result = request(accounts.result(api.createRequest(it, intent.requestKey, SaveReminderDto(intent.previewToken))), intent.accountId)
        validate {
            require(result.requestedBy.accountId == intent.accountId && result.recipient.accountId == intent.recipientAccountId)
            require(result.taskId == intent.taskId && result.spaceId == intent.spaceId && result.taskVersion == intent.taskVersion)
            require(result.timezone == intent.timezone && LocalDateTime.parse(result.localTime) == LocalDateTime.parse(intent.localTime))
            require(Instant.parse(result.scheduledAt) == Instant.parse(intent.scheduledAt))
        }
        result
    }
    suspend fun requests(accountId: String, direction: ReminderRequestDirection, cursor: String? = null): ReminderPage<ReminderRequestDto> = accounts.authorized(accountId) {
        val result = page(api.requests(it, direction.wireValue, cursor))
        if (cursor != null && cursor == result.nextCursor) invalid()
        if (result.items.map(ReminderRequestDto::id).distinct().size != result.items.size) invalid()
        result.items.forEach { item ->
            request(item, accountId)
            val owner = if (direction == ReminderRequestDirection.RECEIVED) item.recipient.accountId else item.requestedBy.accountId
            if (owner != accountId) invalid()
        }
        result
    }
    suspend fun reviewRequest(accountId: String, proposal: ReminderRequestDto): ReminderRequestReviewDto = accounts.authorized(accountId) {
        if (proposal.recipient.accountId != accountId) throw IdentityFailure("NOT_FOUND", "Reminder request not found.", 404)
        val result = accounts.result(api.reviewRequest(it, proposal.id))
        request(result.request, accountId); matchRequest(result.request, proposal)
        validate {
            require(result.request.status == "pending" && !result.request.sourceChanged && result.previewToken.length in 32..4096)
            require(Instant.parse(result.expiresAt) <= Instant.parse(result.request.expiresAt))
        }
        result
    }
    suspend fun respondRequest(intent: ReminderRequestResponseIntent): ReminderRequestDto = accounts.authorized(intent.accountId) { authorization ->
        val accountId = if (intent.response == ReminderRequestResponse.CANCEL) intent.request.requestedBy.accountId else intent.request.recipient.accountId
        if (accountId != intent.accountId) throw IdentityFailure("NOT_FOUND", "Reminder request not found.", 404)
        val response = when (intent.response) {
            ReminderRequestResponse.ACCEPT -> {
                val token = intent.previewToken ?: throw IdentityFailure("PREVIEW_INVALID", "Review this request first.", 400)
                api.acceptRequest(authorization, intent.request.id, SaveReminderDto(token))
            }
            ReminderRequestResponse.DECLINE -> api.declineRequest(authorization, intent.request.id, emptyMap())
            ReminderRequestResponse.CANCEL -> api.cancelRequest(authorization, intent.request.id, emptyMap())
        }
        val result = request(accounts.result(response), intent.accountId)
        matchRequest(result, intent.request)
        val expected = when (intent.response) { ReminderRequestResponse.ACCEPT -> "accepted"; ReminderRequestResponse.DECLINE -> "declined"; ReminderRequestResponse.CANCEL -> "cancelled" }
        if (result.status != expected) invalid()
        result
    }
}