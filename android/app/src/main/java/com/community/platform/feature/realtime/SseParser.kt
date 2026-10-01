package com.community.platform.feature.realtime

import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive
import com.google.gson.Strictness
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import java.io.IOException
import java.io.StringReader

/** A hint from `GET /v1/live`. Hints carry IDs only; screens re-read their data through the API. */
sealed class LiveEvent {
    /** The stream is open. Anything may have changed while it was closed. */
    data object Ready : LiveEvent()

    data class Change(val kind: String, val conversationId: String?, val spaceId: String?, val reason: String) : LiveEvent()

    /** Hints were lost for this stream: re-read everything. */
    data object Resync : LiveEvent()

    data class End(val reason: String) : LiveEvent()
}

private const val MAX_EVENT_CHARACTERS = 16_384
private const val MAX_FIELD_CHARACTERS = 64
private val ID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

/**
 * Incremental Server-Sent Events parser. Feed each line without its line break; a blank line ends a frame.
 * Comments, unknown fields, unknown event types and malformed frames produce no event.
 */
class SseParser {
    private var type = ""
    private val data = StringBuilder()
    private var oversized = false
    private var first = true

    /** Returns the event a blank line completes, or null. */
    fun feed(line: String): LiveEvent? {
        val text = if (first) line.removePrefix("\uFEFF") else line
        first = false
        if (text.isEmpty()) return dispatch()
        if (text.startsWith(':')) return null
        val colon = text.indexOf(':')
        val field = if (colon < 0) text else text.substring(0, colon)
        val value = if (colon < 0) "" else text.substring(colon + 1).removePrefix(" ")
        when (field) {
            "event" -> type = value
            "data" -> append(value)
            // "id" and "retry" are not used: hints are re-read through the API and reconnect delays are fixed.
        }
        return null
    }

    private fun append(value: String) {
        if (oversized) return
        if (data.length + value.length + 1 > MAX_EVENT_CHARACTERS) {
            oversized = true
            data.setLength(0)
            return
        }
        data.append(value).append('\n')
    }

    private fun dispatch(): LiveEvent? {
        val name = type
        val payload = if (data.isEmpty()) null else data.substring(0, data.length - 1)
        val dropped = oversized
        type = ""
        data.setLength(0)
        oversized = false
        if (dropped || payload == null) return null
        return try { event(name, payload) } catch (_error: JsonParseException) { null } catch (_error: IllegalArgumentException) { null }
    }

    private fun event(name: String, payload: String): LiveEvent? {
        val body = json(payload) ?: return null
        return when (name) {
            "ready" -> LiveEvent.Ready
            "resync" -> LiveEvent.Resync
            "end" -> LiveEvent.End(text(body, "reason"))
            "change" -> {
                val kind = text(body, "kind")
                val conversationId = id(body, "conversation_id")
                require(kind != "conversation" || conversationId != null) { "A conversation change names its conversation" }
                LiveEvent.Change(kind, conversationId, id(body, "space_id"), text(body, "reason"))
            }
            else -> null
        }
    }

    private fun json(payload: String): JsonObject? = try {
        val reader = JsonReader(StringReader(payload)).apply { strictness = Strictness.STRICT }
        val element = JsonParser.parseReader(reader)
        if (reader.peek() == JsonToken.END_DOCUMENT) element as? JsonObject else null
    } catch (_error: IOException) { null }

    private fun text(body: JsonObject, name: String): String {
        val value = (body.get(name) as? JsonPrimitive)?.takeIf { it.isString }?.asString
        require(value != null && value.isNotBlank() && value.length <= MAX_FIELD_CHARACTERS) { "$name is missing" }
        return value
    }

    /** Null when absent; an ID that is present must be a UUID. */
    private fun id(body: JsonObject, name: String): String? {
        val value = body.get(name)
        if (value == null || value.isJsonNull) return null
        val id = (value as? JsonPrimitive)?.takeIf { it.isString }?.asString
        require(id != null && ID.matches(id)) { "$name is not an ID" }
        return id
    }
}
