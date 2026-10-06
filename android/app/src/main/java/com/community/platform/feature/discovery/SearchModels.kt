package com.community.platform.feature.discovery

import com.google.gson.annotations.SerializedName

data class SearchDocumentDto(
    @SerializedName("document_id") val documentId: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    val name: String,
    @SerializedName("media_type") val mediaType: String,
    @SerializedName("start_line") val startLine: Int?,
    @SerializedName("end_line") val endLine: Int?,
    val excerpt: String,
    @SerializedName("added_at") val addedAt: String,
)

data class SearchTaskDto(
    @SerializedName("task_id") val taskId: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    val title: String,
    val excerpt: String,
    val status: String,
    @SerializedName("due_date") val dueDate: String?,
    @SerializedName("excerpt_in") val excerptIn: String? = null,
)

data class SearchEventDto(
    @SerializedName("event_id") val eventId: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    val title: String,
    val excerpt: String,
    val status: String,
    @SerializedName("starts_at") val startsAt: String,
    val timezone: String,
    @SerializedName("local_start") val localStart: String,
)

data class SearchResultsDto(
    val query: String,
    @SerializedName("space_id") val spaceId: String?,
    val documents: List<SearchDocumentDto>,
    val tasks: List<SearchTaskDto>,
    val events: List<SearchEventDto>,
    @SerializedName("more_documents") val moreDocuments: Boolean?,
    @SerializedName("more_tasks") val moreTasks: Boolean?,
    @SerializedName("more_events") val moreEvents: Boolean?,
    val limit: Int? = null,
) {
    val empty: Boolean get() = documents.isEmpty() && tasks.isEmpty() && events.isEmpty()
}

enum class SearchProblem { WORDS, TOO_LONG }

fun normalizedSearchQuery(value: String): String = value.map { if (it.isWhitespace() || it == '\u0085') ' ' else it }
    .joinToString("").trim().replace(Regex(" +"), " ")

fun searchProblem(query: String): SearchProblem? = when {
    query.codePointCount(0, query.length) > 200 -> SearchProblem.TOO_LONG
    !query.codePoints().anyMatch { Character.isLetterOrDigit(it) || Character.getType(it) in setOf(
        Character.NON_SPACING_MARK.toInt(), Character.COMBINING_SPACING_MARK.toInt(), Character.ENCLOSING_MARK.toInt()) } -> SearchProblem.WORDS
    else -> null
}