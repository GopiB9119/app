package com.community.platform.feature.messaging

import com.google.gson.annotations.SerializedName

const val MAX_MESSAGE_CHARACTERS = 2000

data class ParticipantDto(
    @SerializedName("account_id") val accountId: String,
    @SerializedName("display_name") val displayName: String,
)

data class ConversationDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    val kind: String,
    val title: String,
    val participants: List<ParticipantDto>,
    @SerializedName("can_send") val canSend: Boolean,
    val protection: String,
    @SerializedName("last_position") val lastPosition: String,
    @SerializedName("read_position") val readPosition: String,
    @SerializedName("unread_count") val unreadCount: Int,
    @SerializedName("last_message_at") val lastMessageAt: String?,
    @SerializedName("created_at") val createdAt: String,
)

data class MessageDto(
    val id: String,
    @SerializedName("conversation_id") val conversationId: String,
    val position: String,
    @SerializedName("sender_account_id") val senderAccountId: String,
    @SerializedName("sender_name") val senderName: String,
    val mine: Boolean,
    @SerializedName("client_message_id") val clientMessageId: String?,
    val status: String,
    val body: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("deleted_at") val deletedAt: String?,
)

data class OpenConversationDto(val kind: String, @SerializedName("participant_account_id") val participantAccountId: String? = null)
data class SendMessageDto(val body: String)
data class MarkReadDto(@SerializedName("through_position") val throughPosition: String)

data class ConversationPage(val items: List<ConversationDto>, val nextCursor: String?, val unreadCount: Int)
data class MessagePage(val items: List<MessageDto>, val nextCursor: String?)

/** One send attempt identity. A retry reuses this exact key and body so the server returns the original message. */
data class SendIntent(val accountId: String, val conversationId: String, val key: String, val body: String)

enum class MessageProblem { EMPTY, TOO_LONG, CONTROL }

fun normalizeMessage(value: String): String = value.replace("\r\n", "\n").trim()

/**
 * Local copy of the definite server rules. Unassigned code points are left to the server because newer
 * emoji may be unknown to this device's character tables.
 */
fun messageProblem(value: String): MessageProblem? {
    val body = normalizeMessage(value)
    if (body.isEmpty()) return MessageProblem.EMPTY
    if (body.codePointCount(0, body.length) > MAX_MESSAGE_CHARACTERS) return MessageProblem.TOO_LONG
    val blocked = body.codePoints().anyMatch { point ->
        val type = Character.getType(point)
        point in 0x202A..0x202E || point in 0x2066..0x2069 ||
            type == Character.SURROGATE.toInt() || type == Character.PRIVATE_USE.toInt() ||
            (type == Character.CONTROL.toInt() && point != '\n'.code && point != '\t'.code)
    }
    return if (blocked) MessageProblem.CONTROL else null
}

fun mergeMessages(current: List<MessageDto>, incoming: List<MessageDto>): List<MessageDto> {
    val byId = LinkedHashMap<String, MessageDto>()
    current.forEach { byId[it.id] = it }
    incoming.forEach { byId[it.id] = it }
    return byId.values.sortedBy { it.position.toLong() }
}
