package com.community.platform.feature.discovery

import com.community.platform.feature.files.DOCUMENT_MAX_BYTES
import com.community.platform.feature.files.documentMediaType
import com.community.platform.feature.files.documentNameProblem
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.IdentityFailure
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SearchRepository @Inject constructor(private val api: SearchApi, private val accounts: AccountRepository) {
    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned unexpected search results.")
    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int, empty: Boolean = false) = require((empty || value.isNotBlank()) && value.codePointCount(0, value.length) <= limit)
    private fun scope(id: String, name: String, expected: String?) {
        identifier(id); text(name, 80); require(expected == null || expected == id)
    }

    fun results(value: SearchResultsDto, query: String, spaceId: String?): SearchResultsDto = try {
        require(value.query == query && value.spaceId == spaceId)
        value.spaceId?.let(::identifier)
        require(value.documents.size <= 20 && value.tasks.size <= 20 && value.events.size <= 20)
        require(value.moreDocuments != null && value.moreTasks != null && value.moreEvents != null)
        require(value.moreDocuments != true || value.documents.size == 20)
        require(value.moreTasks != true || value.tasks.size == 20)
        require(value.moreEvents != true || value.events.size == 20)
        require(value.tasks.map { it.taskId }.distinct().size == value.tasks.size)
        require(value.events.map { it.eventId }.distinct().size == value.events.size)
        value.documents.forEach {
            identifier(it.documentId); scope(it.spaceId, it.spaceName, spaceId)
            require(documentNameProblem(it.name) == null && documentMediaType(it.name) == it.mediaType)
            val first = requireNotNull(it.startLine); val last = requireNotNull(it.endLine)
            require(first >= 1 && last >= first && last <= DOCUMENT_MAX_BYTES + 1)
            text(it.excerpt, 242, empty = true); Instant.parse(it.addedAt)
        }
        value.documents.groupBy { it.documentId }.values.forEach { passages ->
            val first = passages.first()
            require(passages.all { it.spaceId == first.spaceId && it.spaceName == first.spaceName && it.name == first.name &&
                it.mediaType == first.mediaType && it.addedAt == first.addedAt })
        }
        value.tasks.forEach {
            identifier(it.taskId); scope(it.spaceId, it.spaceName, spaceId); text(it.title, 200); text(it.excerpt, 242, empty = true)
            require(it.status in setOf("open", "in_progress", "completed", "cancelled"))
            it.dueDate?.let { date -> require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(date)); LocalDate.parse(date) }
        }
        value.events.forEach {
            identifier(it.eventId); scope(it.spaceId, it.spaceName, spaceId); text(it.title, 120); text(it.excerpt, 242, empty = true)
            require(it.status in setOf("scheduled", "cancelled") && it.timezone in ZoneId.getAvailableZoneIds())
            require(Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}").matches(it.localStart))
            require(Instant.parse(it.startsAt).atZone(ZoneId.of(it.timezone)).toLocalDateTime() == LocalDateTime.parse(it.localStart))
        }
        value
    } catch (_error: IllegalArgumentException) { invalid() }
      catch (_error: NullPointerException) { invalid() }
      catch (_error: DateTimeException) { invalid() }

    suspend fun search(accountId: String, query: String, spaceId: String?): SearchResultsDto = accounts.authorized(accountId) {
        val normalized = normalizedSearchQuery(query)
        require(searchProblem(normalized) == null)
        spaceId?.let(::identifier)
        results(accounts.result(api.search(it, normalized, spaceId)), normalized, spaceId)
    }
}