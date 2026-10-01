package com.community.platform.feature.planning

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Query
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

interface CalendarApi {
    @GET("v1/calendar")
    suspend fun entries(
        @Header("Authorization") authorization: String,
        @Query("space_id") spaceId: String,
        @Query("start_date") startDate: String,
        @Query("end_date") endDate: String,
        @Query("timezone") timezone: String,
        @Query("limit") limit: Int,
        @Query("cursor") cursor: String?,
    ): Response<EnvelopeDto<List<CalendarEntryDto>>>
}

@Singleton
class CalendarRepository @Inject constructor(private val api: CalendarApi, private val accounts: AccountRepository) {
    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The calendar could not be confirmed. Reload this view.")

    suspend fun entries(accountId: String, spaceId: String, month: YearMonth, timezone: String, cursor: String? = null): TaskPage<CalendarEntryDto> = accounts.authorized(accountId) { authorization ->
        require(month.year in 1900..2100)
        val zone = ZoneId.of(timezone)
        val response = api.entries(authorization, spaceId, month.atDay(1).toString(), month.atEndOfMonth().toString(), timezone, 20, cursor)
        val entries = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid()
        if (entries.size > 20 || pagination.hasMore != (pagination.nextCursor != null)) invalid()
        if (pagination.nextCursor != null && (pagination.nextCursor.isBlank() || pagination.nextCursor.length > 2048 || pagination.nextCursor == cursor || entries.isEmpty())) invalid()
        try {
            require(entries.map { "${it.kind}:${it.id}" }.distinct().size == entries.size)
            entries.forEach { entry ->
                require(UUID.fromString(entry.id).toString() == entry.id)
                if (entry.kind == "event") require(entry.taskId == null)
                else require(entry.taskId != null && UUID.fromString(entry.taskId).toString() == entry.taskId)
                require(entry.spaceId == spaceId && entry.title.length in 1..400)
                val date = LocalDate.parse(entry.date)
                require(date.toString() == entry.date && YearMonth.from(date) == month)
                when (entry.kind) {
                    "task" -> require(entry.id == entry.taskId && entry.scheduledAt == null && entry.timezone == null && !entry.sourceChanged && entry.seriesId == null && entry.status in setOf("open", "in_progress", "completed", "cancelled"))
                    "reminder", "planned", "event" -> {
                        when (entry.kind) {
                            "planned" -> require(entry.status == "planned" && entry.seriesId != null)
                            "event" -> require(entry.status in setOf("scheduled", "cancelled") && entry.seriesId == null && !entry.sourceChanged)
                            else -> require(entry.status in setOf("scheduled", "available", "cancelled", "suppressed", "expired", "failed"))
                        }
                        entry.seriesId?.let { series -> require(UUID.fromString(series).toString() == series) }
                        require(entry.timezone != null && (entry.timezone == "UTC" || entry.timezone.contains('/')))
                        ZoneId.of(entry.timezone)
                        require(Instant.parse(entry.scheduledAt).atZone(zone).toLocalDate() == date)
                    }
                    else -> invalid()
                }
            }
            require(entries.zipWithNext().all { (first, second) -> calendarOrder.compare(first, second) < 0 })
        } catch (error: RuntimeException) {
            if (error is CancellationException) throw error
            invalid()
        }
        TaskPage(entries, pagination.nextCursor)
    }

    companion object {
        val calendarOrder: Comparator<CalendarEntryDto> = compareBy<CalendarEntryDto> { it.date }
            .thenBy { it.kind != "task" }
            .thenBy { it.scheduledAt?.let(Instant::parse) ?: Instant.EPOCH }
            .thenBy { it.id }
    }
}