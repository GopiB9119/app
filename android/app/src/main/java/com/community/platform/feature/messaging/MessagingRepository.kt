package com.community.platform.feature.messaging

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

interface MessagingApi {
    @POST("v1/spaces/{spaceId}/conversations")
    suspend fun open(@Header("Authorization") authorization: String, @Path("spaceId") spaceId: String, @Body body: OpenConversationDto): Response<EnvelopeDto<ConversationDto>>

    @GET("v1/conversations")
    suspend fun conversations(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<ConversationDto>>>

    @GET("v1/conversations/{id}")
    suspend fun conversation(@Header("Authorization") authorization: String, @Path("id") conversationId: String): Response<EnvelopeDto<ConversationDto>>

    @GET("v1/conversations/{id}/messages")
    suspend fun messages(@Header("Authorization") authorization: String, @Path("id") conversationId: String, @Query("before") before: String?, @Query("after") after: String?, @Query("limit") limit: Int = 30): Response<EnvelopeDto<List<MessageDto>>>

    @POST("v1/conversations/{id}/messages")
    suspend fun send(@Header("Authorization") authorization: String, @Path("id") conversationId: String, @Header("Idempotency-Key") key: String, @Body body: SendMessageDto): Response<EnvelopeDto<MessageDto>>

    @POST("v1/conversations/{id}/messages/{messageId}/delete")
    suspend fun delete(@Header("Authorization") authorization: String, @Path("id") conversationId: String, @Path("messageId") messageId: String, @Body body: Map<String, String>): Response<EnvelopeDto<MessageDto>>

    @POST("v1/conversations/{id}/read")
    suspend fun markRead(@Header("Authorization") authorization: String, @Path("id") conversationId: String, @Body body: MarkReadDto): Response<EnvelopeDto<ConversationDto>>
}

/** Validates every conversation and message fact before the screen can show it. */
@Singleton
class MessagingRepository @Inject constructor(private val api: MessagingApi, private val accounts: AccountRepository) {
    private val position = Regex("0|[1-9][0-9]{0,9}")

    private fun invalid(message: String = "The service returned an unexpected message response."): Nothing =
        throw IdentityFailure("INVALID_RESPONSE", message)

    private fun <Value> validate(block: () -> Value): Value =
        try { block() }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }

    private fun identifier(value: String) {
        require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    }

    private fun label(value: String) {
        require(value.isNotBlank() && value.codePointCount(0, value.length) <= 80)
    }

    private fun conversation(value: ConversationDto, accountId: String, id: String? = null, spaceId: String? = null): ConversationDto = validate {
        identifier(value.id); identifier(value.spaceId)
        label(value.spaceName); label(value.title)
        require(value.kind == "space" || value.kind == "direct")
        require(value.protection == "server_encrypted")
        require(value.lastPosition.matches(position) && value.readPosition.matches(position))
        require(value.readPosition.toLong() <= value.lastPosition.toLong() && value.unreadCount >= 0)
        require((value.lastMessageAt == null) == (value.lastPosition == "0"))
        value.lastMessageAt?.let(Instant::parse)
        Instant.parse(value.createdAt)
        val direct = value.kind == "direct"
        require(value.participants.size == if (direct) 2 else 0)
        value.participants.forEach { participant -> identifier(participant.accountId); label(participant.displayName) }
        require(value.participants.map { it.accountId.lowercase() }.distinct().size == value.participants.size)
        require(!direct || value.participants.any { it.accountId.equals(accountId, ignoreCase = true) })
        require(id == null || value.id == id)
        require(spaceId == null || value.spaceId == spaceId)
        value
    }

    private fun message(value: MessageDto, accountId: String, conversationId: String): MessageDto = validate {
        identifier(value.id); identifier(value.senderAccountId)
        require(value.conversationId == conversationId)
        require(value.position.matches(position) && value.position != "0")
        label(value.senderName)
        require(value.status in setOf("sent", "deleted", "unavailable"))
        require((value.status == "sent") == (value.body != null))
        require((value.status == "deleted") == (value.deletedAt != null))
        require(value.mine == (value.clientMessageId != null))
        require(value.mine == value.senderAccountId.equals(accountId, ignoreCase = true))
        value.clientMessageId?.let(::identifier)
        value.body?.let { body -> require(body.isNotEmpty() && body.codePointCount(0, body.length) <= MAX_MESSAGE_CHARACTERS) }
        Instant.parse(value.createdAt)
        value.deletedAt?.let(Instant::parse)
        value
    }

    suspend fun conversations(accountId: String, cursor: String? = null): ConversationPage = accounts.authorized(accountId) { authorization ->
        val response = api.conversations(authorization, cursor)
        val items = accounts.result(response)
        val envelope = response.body() ?: invalid()
        val pagination = envelope.pagination ?: invalid("The conversation list is incomplete.")
        val unread = envelope.unreadCount ?: invalid("The conversation list is incomplete.")
        validate {
            require(items.size <= 20 && unread >= 0)
            require(pagination.hasMore == (pagination.nextCursor != null))
            pagination.nextCursor?.let { next -> require(next.isNotBlank() && next.length <= 2048 && next != cursor && items.isNotEmpty()) }
            require(items.map { it.id }.distinct().size == items.size)
        }
        items.forEach { conversation(it, accountId) }
        ConversationPage(items, pagination.nextCursor, unread)
    }

    suspend fun read(accountId: String, conversationId: String): ConversationDto = accounts.authorized(accountId) {
        conversation(accounts.result(api.conversation(it, conversationId)), accountId, id = conversationId)
    }

    suspend fun open(accountId: String, spaceId: String, participantId: String? = null): ConversationDto = accounts.authorized(accountId) {
        val body = if (participantId == null) OpenConversationDto("space") else OpenConversationDto("direct", participantId)
        val result = conversation(accounts.result(api.open(it, spaceId, body)), accountId, spaceId = spaceId)
        if (result.kind != body.kind || (participantId != null && result.participants.none { person -> person.accountId.equals(participantId, ignoreCase = true) })) {
            invalid("The opened conversation does not match your choice.")
        }
        result
    }

    /** [before] and [after] are exclusive message positions; the server returns at most one page in ascending order. */
    suspend fun messages(accountId: String, conversationId: String, before: String? = null, after: String? = null): MessagePage = accounts.authorized(accountId) { authorization ->
        require(before == null || after == null)
        val response = api.messages(authorization, conversationId, before, after)
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid("Message pagination is missing.")
        items.forEach { message(it, accountId, conversationId) }
        validate {
            require(items.size <= 50 && items.map { it.id }.distinct().size == items.size)
            val positions = items.map { it.position.toLong() }
            require(positions.zipWithNext().all { (left, right) -> left < right })
            before?.let { limit -> require(positions.all { value -> value < limit.toLong() }) }
            after?.let { limit -> require(positions.all { value -> value > limit.toLong() }) }
            require(pagination.hasMore == (pagination.nextCursor != null))
            // Older pages continue before the first returned message; newer pages continue after the last one.
            pagination.nextCursor?.let { next -> require(next == (if (after != null) items.last() else items.first()).position) }
        }
        MessagePage(items, pagination.nextCursor)
    }

    suspend fun send(intent: SendIntent): MessageDto = accounts.authorized(intent.accountId) {
        val result = message(accounts.result(api.send(it, intent.conversationId, intent.key, SendMessageDto(intent.body))), intent.accountId, intent.conversationId)
        if (!result.mine || result.clientMessageId != intent.key) invalid("The sent message could not be confirmed.")
        result
    }

    suspend fun delete(accountId: String, conversationId: String, messageId: String): MessageDto = accounts.authorized(accountId) {
        val result = message(accounts.result(api.delete(it, conversationId, messageId, emptyMap())), accountId, conversationId)
        if (result.id != messageId || result.status != "deleted" || !result.mine) invalid("The deletion could not be confirmed.")
        result
    }

    suspend fun markRead(accountId: String, conversationId: String, through: String): ConversationDto = accounts.authorized(accountId) {
        conversation(accounts.result(api.markRead(it, conversationId, MarkReadDto(through))), accountId, id = conversationId)
    }
}
