package com.community.platform.feature.care

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

val CARE_SOURCES = listOf("prescriber", "pharmacist", "package_label", "self")
val DOSE_OUTCOMES = listOf("taken", "skipped")
const val MAX_DAILY_TIMES = 6
private val CLOCK_CHANGES = listOf("none", "shifted_forward", "repeated_time_first")
private val CLOCK = Regex("(?:[01][0-9]|2[0-3]):[0-5][0-9]")
private val DATE = Regex("\\d{4}-\\d{2}-\\d{2}")
private val CONTROLS = Regex("[\\u0000-\\u0009\\u000B-\\u001F\\u007F\\u202A-\\u202E\\u2066-\\u2069]")

data class CareInstructionDto(
    val id: String, @SerializedName("medicine_name") val medicineName: String, val strength: String, val form: String,
    val dose: String, val instructions: String, val source: String, val timezone: String, val times: List<String>,
    @SerializedName("start_date") val startDate: String, @SerializedName("end_date") val endDate: String?,
    val status: String, val version: Int, @SerializedName("confirmed_by_account_id") val confirmedByAccountId: String,
    @SerializedName("confirmed_at") val confirmedAt: String, @SerializedName("created_at") val createdAt: String,
    @SerializedName("stopped_at") val stoppedAt: String?, val etag: String,
)

data class CareDayInstructionDto(
    val id: String, @SerializedName("medicine_name") val medicineName: String, val strength: String, val form: String,
    val dose: String, val status: String,
)

data class CareReportDto(
    val outcome: String, val revision: Int, @SerializedName("reported_at") val reportedAt: String, @SerializedName("updated_at") val updatedAt: String,
)

data class CareOccurrenceDto(
    @SerializedName("instruction_id") val instructionId: String, @SerializedName("local_date") val localDate: String,
    @SerializedName("local_time") val localTime: String, @SerializedName("display_time") val displayTime: String,
    val timezone: String, @SerializedName("scheduled_at") val scheduledAt: String,
    @SerializedName("clock_change") val clockChange: String, val report: CareReportDto?,
    @SerializedName("can_report") val canReport: Boolean, val etag: String,
)

data class OmittedCareTimeDto(
    @SerializedName("instruction_id") val instructionId: String, @SerializedName("local_time") val localTime: String,
    @SerializedName("same_moment_as") val sameMomentAs: String,
)

data class CareDayDto(
    @SerializedName("local_date") val localDate: String, val instructions: List<CareDayInstructionDto>,
    val occurrences: List<CareOccurrenceDto>, val omitted: List<OmittedCareTimeDto>,
)

data class CreateCareInstructionDto(
    @SerializedName("medicine_name") val medicineName: String, val strength: String, val form: String, val dose: String,
    val instructions: String, val source: String, val timezone: String, val times: List<String>,
    @SerializedName("start_date") val startDate: String, @SerializedName("end_date") val endDate: String?, val confirmed: Boolean = true,
)

data class ReportDoseDto(@SerializedName("local_date") val localDate: String, @SerializedName("local_time") val localTime: String, val outcome: String)

data class CareDraft(
    val name: String = "", val strength: String = "", val form: String = "", val dose: String = "", val instructions: String = "",
    val source: String = "", val times: List<String> = listOf(""), val timezone: String = "UTC", val startDate: String = "",
    val endDate: String = "", val confirmed: Boolean = false,
)

/** One create attempt identity; a retry reuses this exact key and body so the server returns the first instruction. */
data class CareCreateIntent(val accountId: String, val key: String, val body: CreateCareInstructionDto)

/** One dose note attempt; a retry reuses the key and the reviewed dose version. */
data class CareReportIntent(val accountId: String, val key: String, val occurrence: CareOccurrenceDto, val outcome: String)

enum class CareProblem { NAME, NAME_LONG, DETAIL_LONG, DOSE, DOSE_LONG, INSTRUCTIONS_LONG, CONTROL, SOURCE, TIME, TIME_DUPLICATE, TIMES_MANY, START, END, END_BEFORE_START, ZONE, CONFIRM }

private fun oneLine(value: String) = value.trim().replace(Regex("\\s+"), " ")

fun careBody(draft: CareDraft) = CreateCareInstructionDto(
    medicineName = oneLine(draft.name), strength = oneLine(draft.strength), form = oneLine(draft.form), dose = oneLine(draft.dose),
    instructions = draft.instructions.replace("\r\n", "\n").trim(), source = draft.source, timezone = draft.timezone.trim(),
    times = draft.times.map(String::trim).filter(String::isNotEmpty).distinct().sorted(), startDate = draft.startDate.trim(),
    endDate = draft.endDate.trim().ifEmpty { null },
)

private fun validDate(value: String) = DATE.matches(value) && runCatching { LocalDate.parse(value) }.isSuccess

fun careProblem(draft: CareDraft): CareProblem? {
    val body = careBody(draft)
    val entered = draft.times.map(String::trim)
    fun length(value: String) = value.codePointCount(0, value.length)
    return when {
        body.medicineName.isEmpty() -> CareProblem.NAME
        length(body.medicineName) > 120 -> CareProblem.NAME_LONG
        length(body.strength) > 60 || length(body.form) > 60 -> CareProblem.DETAIL_LONG
        body.dose.isEmpty() -> CareProblem.DOSE
        length(body.dose) > 120 -> CareProblem.DOSE_LONG
        length(body.instructions) > 500 -> CareProblem.INSTRUCTIONS_LONG
        listOf(body.medicineName, body.strength, body.form, body.dose, body.instructions).any { CONTROLS.containsMatchIn(it) } -> CareProblem.CONTROL
        body.source !in CARE_SOURCES -> CareProblem.SOURCE
        entered.isEmpty() || entered.any { !CLOCK.matches(it) } -> CareProblem.TIME
        entered.distinct().size != entered.size -> CareProblem.TIME_DUPLICATE
        entered.size > MAX_DAILY_TIMES -> CareProblem.TIMES_MANY
        !validDate(body.startDate) -> CareProblem.START
        body.endDate != null && !validDate(body.endDate) -> CareProblem.END
        body.endDate != null && body.endDate < body.startDate -> CareProblem.END_BEFORE_START
        body.timezone != "UTC" && ("/" !in body.timezone || body.timezone !in ZoneId.getAvailableZoneIds()) -> CareProblem.ZONE
        !draft.confirmed -> CareProblem.CONFIRM
        else -> null
    }
}

interface CareApi {
    @GET("v1/care/instructions")
    suspend fun list(@Header("Authorization") authorization: String, @Query("status") status: String): Response<EnvelopeDto<List<CareInstructionDto>>>

    @POST("v1/care/instructions")
    suspend fun create(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: CreateCareInstructionDto): Response<EnvelopeDto<CareInstructionDto>>

    @POST("v1/care/instructions/{id}/stop")
    suspend fun stop(@Header("Authorization") authorization: String, @Path("id") instructionId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: Map<String, String>): Response<EnvelopeDto<CareInstructionDto>>

    @POST("v1/care/instructions/{id}/reports")
    suspend fun report(@Header("Authorization") authorization: String, @Path("id") instructionId: String, @Header("Idempotency-Key") key: String, @Header("If-Match") etag: String, @Body body: ReportDoseDto): Response<EnvelopeDto<CareOccurrenceDto>>

    @GET("v1/care/day")
    suspend fun day(@Header("Authorization") authorization: String, @Query("date") date: String): Response<EnvelopeDto<CareDayDto>>
}

/** Validates every medicine fact before the screen can show it; only the signed-in person's own records are accepted. */
@Singleton
class CareRepository @Inject constructor(private val api: CareApi, private val accounts: AccountRepository) {
    private fun invalid(message: String = "The service returned an unexpected medicine response."): Nothing = throw IdentityFailure("INVALID_RESPONSE", message)

    private fun <Value> validate(block: () -> Value): Value =
        try { block() }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int, empty: Boolean = false) = require((empty || value.isNotBlank()) && value.codePointCount(0, value.length) <= limit)
    private fun date(value: String) = require(validDate(value))
    private fun clock(value: String) = require(CLOCK.matches(value))
    private fun version(value: String) = require(value.length in 3..200)

    fun instruction(value: CareInstructionDto, accountId: String): CareInstructionDto = validate {
        identifier(value.id); identifier(value.confirmedByAccountId)
        require(value.confirmedByAccountId.equals(accountId, ignoreCase = true))
        text(value.medicineName, 120); text(value.strength, 60, empty = true); text(value.form, 60, empty = true)
        text(value.dose, 120); text(value.instructions, 500, empty = true); text(value.timezone, 64)
        require(value.source in CARE_SOURCES)
        require(value.times.size in 1..MAX_DAILY_TIMES && value.times.distinct().size == value.times.size)
        value.times.forEach(::clock)
        date(value.startDate)
        value.endDate?.let { date(it); require(it >= value.startDate) }
        require(value.status == "active" || value.status == "stopped")
        require((value.status == "stopped") == (value.stoppedAt != null) && value.version >= 1)
        Instant.parse(value.confirmedAt); Instant.parse(value.createdAt); value.stoppedAt?.let(Instant::parse)
        version(value.etag)
        value
    }

    fun occurrence(value: CareOccurrenceDto, localDate: String? = null): CareOccurrenceDto = validate {
        identifier(value.instructionId); date(value.localDate)
        require(localDate == null || value.localDate == localDate)
        clock(value.localTime); clock(value.displayTime); text(value.timezone, 64)
        Instant.parse(value.scheduledAt)
        require(value.clockChange in CLOCK_CHANGES)
        require((value.clockChange == "shifted_forward") == (value.displayTime != value.localTime))
        value.report?.let {
            require(it.outcome in DOSE_OUTCOMES && it.revision >= 1)
            Instant.parse(it.reportedAt); Instant.parse(it.updatedAt)
        }
        version(value.etag)
        value
    }

    fun day(value: CareDayDto, localDate: String): CareDayDto = validate {
        require(value.localDate == localDate)
        require(value.instructions.size <= 60 && value.occurrences.size <= 360 && value.omitted.size <= 360)
        val known = value.instructions.map { summary ->
            identifier(summary.id); text(summary.medicineName, 120); text(summary.strength, 60, empty = true)
            text(summary.form, 60, empty = true); text(summary.dose, 120)
            require(summary.status == "active" || summary.status == "stopped")
            summary.id
        }
        require(known.distinct().size == known.size)
        val seen = mutableSetOf<Pair<String, String>>()
        value.occurrences.forEach { require(occurrence(it, localDate).instructionId in known && seen.add(it.instructionId to it.localTime)) }
        value.omitted.forEach { identifier(it.instructionId); require(it.instructionId in known); clock(it.localTime); clock(it.sameMomentAs) }
        value
    }

    suspend fun list(accountId: String, stopped: Boolean): List<CareInstructionDto> = accounts.authorized(accountId) { authorization ->
        val status = if (stopped) "stopped" else "active"
        val items = accounts.result(api.list(authorization, status))
        validate { require(items.size <= (if (stopped) 20 else 30) && items.map { it.id }.distinct().size == items.size) }
        items.map { item -> instruction(item, accountId).also { if (it.status != status) invalid() } }
    }

    suspend fun create(intent: CareCreateIntent): CareInstructionDto = accounts.authorized(intent.accountId) {
        instruction(accounts.result(api.create(it, intent.key, intent.body)), intent.accountId).also { saved ->
            val body = intent.body
            if (saved.medicineName != body.medicineName || saved.dose != body.dose || saved.times != body.times || saved.timezone != body.timezone ||
                saved.startDate != body.startDate || saved.endDate != body.endDate || saved.source != body.source || saved.status != "active") {
                invalid("The saved instruction does not match what you confirmed.")
            }
        }
    }

    suspend fun stop(accountId: String, current: CareInstructionDto, key: String): CareInstructionDto = accounts.authorized(accountId) {
        instruction(accounts.result(api.stop(it, current.id, key, current.etag, emptyMap())), accountId).also { stopped ->
            if (stopped.id != current.id || stopped.status != "stopped") invalid("The stop could not be confirmed.")
        }
    }

    suspend fun day(accountId: String, localDate: String): CareDayDto = accounts.authorized(accountId) {
        day(accounts.result(api.day(it, localDate)), localDate)
    }

    suspend fun report(intent: CareReportIntent): CareOccurrenceDto = accounts.authorized(intent.accountId) {
        require(intent.outcome in DOSE_OUTCOMES)
        val shown = intent.occurrence
        val body = ReportDoseDto(shown.localDate, shown.localTime, intent.outcome)
        occurrence(accounts.result(api.report(it, shown.instructionId, intent.key, shown.etag, body)), shown.localDate).also { saved ->
            if (saved.instructionId != shown.instructionId || saved.localTime != shown.localTime || saved.report?.outcome != intent.outcome) {
                invalid("Your note could not be confirmed.")
            }
        }
    }
}
