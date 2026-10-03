package com.community.platform.feature.messaging

import com.google.gson.annotations.SerializedName

const val MAX_MESSAGE_CHARACTERS = 2000

/** The six reactions in their fixed order (DEC-033). */
val REACTIONS = listOf("like", "love", "laugh", "wow", "sad", "thanks")
const val REPLY_EXCERPT_CHARACTERS = 120
const val EDIT_WINDOW_MILLISECONDS = 15L * 60 * 1000

/** The message a reply answers, as this person may see it. */
data class ReplyDto(
    @SerializedName("message_id") val messageId: String,
    val status: String,
    val position: String?,
    @SerializedName("sender_name") val senderName: String?,
    val excerpt: String?,
)

data class ReactionDto(val reaction: String, val count: Int, val mine: Boolean)

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
    // Servers from before replies, reactions and edits leave these out; Gson then leaves them null or 0.
    @SerializedName("edited_at") val editedAt: String? = null,
    @SerializedName("reply_to") val replyTo: ReplyDto? = null,
    val reactions: List<ReactionDto>? = null,
    val revision: Int = 1,
) {
    val reactionList: List<ReactionDto> get() = reactions.orEmpty()
    /** A missing revision counts as the first. */
    val version: Int get() = if (revision < 1) 1 else revision
}

data class OpenConversationDto(val kind: String, @SerializedName("participant_account_id") val participantAccountId: String? = null)
/** Gson leaves out a null [replyTo], so a message that answers none sends exactly what it always did. */
data class SendMessageDto(val body: String, @SerializedName("reply_to_message_id") val replyTo: String? = null)
data class EditMessageDto(val body: String)
data class ReactDto(val reaction: String, val on: Boolean)
data class MarkReadDto(@SerializedName("through_position") val throughPosition: String)

data class ConversationPage(val items: List<ConversationDto>, val nextCursor: String?, val unreadCount: Int)
data class MessagePage(val items: List<MessageDto>, val nextCursor: String?)

/** One send attempt identity. A retry reuses this exact key, body and answered message so the server returns the original. */
data class SendIntent(val accountId: String, val conversationId: String, val key: String, val body: String, val replyTo: String? = null)

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

/**
 * A deletion is final, so a copy read before it never brings the message back, whichever answer arrives last (T82).
 * Every edit or reaction raises the revision, so an older copy cannot undo one either (DEC-033).
 */
fun mergeMessages(current: List<MessageDto>, incoming: List<MessageDto>): List<MessageDto> {
    val byId = LinkedHashMap<String, MessageDto>()
    current.forEach { byId[it.id] = it }
    incoming.forEach { message ->
        val known = byId[message.id]
        if (known == null || message.deletedAt != null || (known.deletedAt == null && message.version >= known.version)) byId[message.id] = message
    }
    return byId.values.sortedBy { it.position.toLong() }
}

/** Whether the author may still edit [message] by the device clock; the server decides. */
fun editable(message: MessageDto, now: Long = System.currentTimeMillis()): Boolean =
    message.mine && message.status == "sent" &&
        runCatching { now - java.time.Instant.parse(message.createdAt).toEpochMilli() < EDIT_WINDOW_MILLISECONDS }.getOrDefault(false)
