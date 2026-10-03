package com.community.platform.feature.events

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.TypeAdapter
import com.google.gson.annotations.JsonAdapter
import com.google.gson.annotations.SerializedName
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.google.gson.stream.JsonWriter
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

val EVENT_RESPONSES = listOf("going", "maybe", "not_going")
const val MAX_CAPACITY = 500

data class AttendeeDto(
    val name: String, val response: String, @SerializedName("responded_at") val respondedAt: String,
    val outdated: Boolean, val mine: Boolean, @SerializedName("waitlist_position") val waitlistPosition: Int? = null,
)

data class EventDto(
    val id: String, @SerializedName("space_id") val spaceId: String, @SerializedName("space_name") val spaceName: String,
    val title: String, val description: String, val location: String, val timezone: String,
    @SerializedName("local_start") val localStart: String, @SerializedName("local_end") val localEnd: String?,
    @SerializedName("starts_at") val startsAt: String, @SerializedName("ends_at") val endsAt: String?,
    val status: String, val ended: Boolean, @SerializedName("created_by_name") val createdByName: String,
    @SerializedName("created_at") val createdAt: String, @SerializedName("updated_at") val updatedAt: String,
    @SerializedName("schedule_changed_at") val scheduleChangedAt: String?, @SerializedName("cancelled_at") val cancelledAt: String?,
    val going: Int, val maybe: Int, @SerializedName("not_going") val notGoing: Int,
    @SerializedName("my_response") val myResponse: String?, @SerializedName("my_response_outdated") val myResponseOutdated: Boolean,
    @SerializedName("can_manage") val canManage: Boolean, @SerializedName("can_respond") val canRespond: Boolean,
    val etag: String?, val attendees: List<AttendeeDto>? = null,
    val capacity: Int? = null, val waitlisted: Int = 0, @SerializedName("my_waitlist_position") val myWaitlistPosition: Int? = null,
)

/** What a saved form says about the capacity: nothing (an edit keeps it; a new event has none), no limit, or a number of places. */
sealed interface CapacityChoice {
    data object Leave : CapacityChoice
    data object Unlimited : CapacityChoice
    data class Limit(val places: Int) : CapacityChoice
}

/** Leave writes no "capacity" field at all; Unlimited writes null, which removes an event's capacity. */
class CapacityAdapter : TypeAdapter<CapacityChoice>() {
    override fun write(writer: JsonWriter, value: CapacityChoice?) {
        if (value is CapacityChoice.Limit) { writer.value(value.places.toLong()); return }
        val nulls = writer.serializeNulls
        writer.serializeNulls = value == CapacityChoice.Unlimited
        writer.nullValue()
        writer.serializeNulls = nulls
    }

    override fun read(reader: JsonReader): CapacityChoice =
        if (reader.peek() == JsonToken.NULL) { reader.nextNull(); CapacityChoice.Unlimited } else CapacityChoice.Limit(reader.nextInt())
}

data class EventBodyDto(
    val title: String, val description: String, val location: String, val timezone: String,
    @SerializedName("local_start") val localStart: String, @SerializedName("local_end") val localEnd: String?,
    @field:JsonAdapter(CapacityAdapter::class) val capacity: CapacityChoice = CapacityChoice.Leave,
)

data class AttendanceDto(val response: String)
data class EventPage(val items: List<EventDto>, val nextCursor: String?)

/** One create attempt identity; a retry reuses this exact key and body so the server returns the first event. */
data class EventCreateIntent(val accountId: String, val spaceId: String, val key: String, val body: EventBodyDto)

enum class EventProblem { TITLE, TITLE_LONG, LOCATION_LONG, DETAILS_LONG, CONTROL, DATE, START, END, END_BEFORE_START, ZONE, CAPACITY }

private val CONTROLS = Regex("[\\u0000-\\u0008\\u000B-\\u001F\\u007F\\u202A-\\u202E\\u2066-\\u2069]")

fun eventBody(
    title: String, details: String, location: String, timezone: String, date: String, start: String, end: String,
    capacity: CapacityChoice = CapacityChoice.Leave,
) = EventBodyDto(
    title = title.trim().replace(Regex("\\s+"), " "), description = details.replace("\r\n", "\n").trim(),
    location = location.trim().replace(Regex("\\s+"), " "), timezone = timezone.trim(),
    localStart = "${date.trim()}T${start.trim()}", localEnd = end.trim().takeIf { it.isNotEmpty() }?.let { "${date.trim()}T$it" },
    capacity = capacity,
)

/** The capacity a form sends, given the event's [current] one (null for a new event), or null when the typed text is not 1 to 500. */
fun capacityChoice(text: String, current: Int?): CapacityChoice? {
    val typed = text.trim()
    if (typed.isEmpty()) return if (current == null) CapacityChoice.Leave else CapacityChoice.Unlimited
    val places = typed.takeIf { Regex("\\d{1,3}").matches(it) }?.toInt()?.takeIf { it in 1..MAX_CAPACITY } ?: return null
    return if (places == current) CapacityChoice.Leave else CapacityChoice.Limit(places)
}

fun eventProblem(body: EventBodyDto): EventProblem? {
    fun length(value: String) = value.codePointCount(0, value.length)
    val date = body.localStart.substringBefore("T")
    return when {
        body.title.isEmpty() -> EventProblem.TITLE
        length(body.title) > 120 -> EventProblem.TITLE_LONG
        length(body.location) > 200 -> EventProblem.LOCATION_LONG
        length(body.description) > 2000 -> EventProblem.DETAILS_LONG
        listOf(body.title, body.location, body.description).any { CONTROLS.containsMatchIn(it) } -> EventProblem.CONTROL
        !Regex("\\d{4}-\\d{2}-\\d{2}").matches(date) || runCatching { java.time.LocalDate.parse(date) }.isFailure -> EventProblem.DATE
        !validLocal(body.localStart) -> EventProblem.START
        body.localEnd != null && !validLocal(body.localEnd) -> EventProblem.END
        body.localEnd != null && body.localEnd <= body.localStart -> EventProblem.END_BEFORE_START
        body.timezone !in ZoneId.getAvailableZoneIds() -> EventProblem.ZONE
        else -> null
    }
}

private fun validLocal(value: String) =
    Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}").matches(value) && runCatching { LocalDateTime.parse(value) }.isSuccess

interface EventsApi {
    @GET("v1/spaces/{space}/events")
    suspend fun list(@Header("Authorization") authorization: String, @Path("space") spaceId: String, @Query("when") period: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<EventDto>>>

    @GET("v1/events/{id}")
    suspend fun read(@Header("Authorization") authorization: String, @Path("id") eventId: String): Response<EnvelopeDto<EventDto>>

    @POST("v1/spaces/{space}/events")
    suspend fun create(@Header("Authorization") authorization: String, @Path("space") spaceId: String, @Header("Idempotency-Key") key: String, @Body body: EventBodyDto): Response<EnvelopeDto<EventDto>>

    @PATCH("v1/events/{id}")
    suspend fun update(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Header("If-Match") etag: String, @Body body: EventBodyDto): Response<EnvelopeDto<EventDto>>

    @POST("v1/events/{id}/cancel")
    suspend fun cancel(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<EventDto>>

    @POST("v1/events/{id}/attendance")
    suspend fun respond(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Body body: AttendanceDto): Response<EnvelopeDto<EventDto>>
}

/** Validates every event fact before the screen can show it. */
@Singleton
class EventsRepository @Inject constructor(private val api: EventsApi, private val accounts: AccountRepository) {
    private fun invalid(message: String = "The service returned an unexpected event response."): Nothing = throw IdentityFailure("INVALID_RESPONSE", message)

    private fun <Value> validate(block: () -> Value): Value =
        try { block() }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int, empty: Boolean = false) = require((empty || value.isNotBlank()) && value.codePointCount(0, value.length) <= limit)

    fun event(value: EventDto, spaceId: String? = null, detail: Boolean = false): EventDto = validate {
        identifier(value.id); identifier(value.spaceId)
        require(spaceId == null || value.spaceId == spaceId)
        text(value.spaceName, 80); text(value.title, 120); text(value.description, 2000, empty = true); text(value.location, 200, empty = true)
        require(value.status == "scheduled" || value.status == "cancelled")
        require((value.status == "cancelled") == (value.cancelledAt != null) && (value.localEnd == null) == (value.endsAt == null))
        require(validLocal(value.localStart) && (value.localEnd == null || validLocal(value.localEnd)))
        val start = Instant.parse(value.startsAt)
        value.endsAt?.let { require(Instant.parse(it) > start) }
        require(value.going >= 0 && value.maybe >= 0 && value.notGoing >= 0)
        require(value.myResponse == null || value.myResponse in EVENT_RESPONSES)
        require(value.myResponse != null || !value.myResponseOutdated)
        require(!value.canManage || value.etag != null)
        require(!value.canRespond || (value.status == "scheduled" && !value.ended))
        Instant.parse(value.createdAt); Instant.parse(value.updatedAt)
        value.scheduleChangedAt?.let(Instant::parse); value.cancelledAt?.let(Instant::parse)
        require(!detail || value.attendees != null)
        // Nobody waits without a capacity, nobody waits while a place is free, and a place in line is only for Going (DEC-032).
        value.capacity?.let { require(it in 1..MAX_CAPACITY && value.going <= it) }
        require(value.waitlisted >= 0 && (value.capacity != null || value.waitlisted == 0) && (value.waitlisted == 0 || value.going == value.capacity))
        value.myWaitlistPosition?.let { require(value.myResponse == "going" && it in 1..value.waitlisted) }
        value.attendees?.let { people ->
            require(people.size <= 500 && people.count { it.mine } <= 1)
            people.forEach {
                text(it.name, 80); require(it.response in EVENT_RESPONSES); Instant.parse(it.respondedAt)
                it.waitlistPosition?.let { place -> require(it.response == "going" && place in 1..value.waitlisted) }
            }
        }
        value
    }

    suspend fun list(accountId: String, spaceId: String, past: Boolean, cursor: String?): EventPage = accounts.authorized(accountId) { authorization ->
        val response = api.list(authorization, spaceId, if (past) "past" else "upcoming", cursor)
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid("The event list is incomplete.")
        validate {
            require(items.size <= 50 && items.map { it.id }.distinct().size == items.size)
            require(pagination.hasMore == (pagination.nextCursor != null))
            pagination.nextCursor?.let { require(it.isNotBlank() && it.length <= 2048 && it != cursor && items.isNotEmpty()) }
        }
        EventPage(items.map { item -> event(item, spaceId).also { if (it.ended != past) invalid() } }, pagination.nextCursor)
    }

    suspend fun read(accountId: String, eventId: String): EventDto = accounts.authorized(accountId) {
        event(accounts.result(api.read(it, eventId)), detail = true).also { event -> if (event.id != eventId) invalid() }
    }

    suspend fun create(intent: EventCreateIntent): EventDto = accounts.authorized(intent.accountId) {
        event(accounts.result(api.create(it, intent.spaceId, intent.key, intent.body)), intent.spaceId, detail = true).also { event ->
            if (event.title != intent.body.title || event.localStart != intent.body.localStart || event.timezone != intent.body.timezone
                || event.capacity != (intent.body.capacity as? CapacityChoice.Limit)?.places) {
                invalid("The created event does not match your form.")
            }
        }
    }

    suspend fun update(accountId: String, current: EventDto, body: EventBodyDto): EventDto = accounts.authorized(accountId) {
        val capacity = when (val choice = body.capacity) {
            is CapacityChoice.Limit -> choice.places
            CapacityChoice.Unlimited -> null
            CapacityChoice.Leave -> current.capacity
        }
        event(accounts.result(api.update(it, current.id, current.etag ?: invalid(), body)), current.spaceId, detail = true).also { event ->
            if (event.id != current.id || event.capacity != capacity) invalid()
        }
    }

    suspend fun cancel(accountId: String, current: EventDto): EventDto = accounts.authorized(accountId) {
        event(accounts.result(api.cancel(it, current.id, current.etag ?: invalid(), emptyMap())), current.spaceId, detail = true).also { event ->
            if (event.id != current.id || event.status != "cancelled") invalid("The cancellation could not be confirmed.")
        }
    }

    suspend fun respond(accountId: String, eventId: String, response: String): EventDto = accounts.authorized(accountId) {
        require(response in EVENT_RESPONSES)
        event(accounts.result(api.respond(it, eventId, AttendanceDto(response))), detail = true).also { event ->
            if (event.id != eventId || event.myResponse != response || event.myResponseOutdated) invalid("Your response could not be confirmed.")
        }
    }
}
