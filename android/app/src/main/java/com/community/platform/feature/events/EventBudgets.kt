package com.community.platform.feature.events

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import java.math.BigDecimal
import java.text.NumberFormat
import java.time.DateTimeException
import java.time.Instant
import java.util.Currency
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

// Event budgets (DEC-039): whole paise or cents from the server; recording an expense is never a payment.
val BUDGET_CURRENCIES = listOf("INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD")
const val MAX_MINOR = 100_000_000_000L
const val MAX_BUDGET_CATEGORIES = 30
const val MAX_CATEGORY_NAME = 60
const val MAX_EXPENSE_NOTE = 120

// Contributions (DEC-041): what a person says they promised or gave; only they change it.
val CONTRIBUTION_STATES = listOf("promised", "given")
const val MAX_CONTRIBUTIONS = 200

// Splits (DEC-042): a plan for dividing the cost, never a bill. Percentages are hundredths of a percent.
val SPLIT_METHODS = listOf("equal", "percentages", "amounts")
val SPLIT_BASES = listOf("planned", "recorded")
const val MAX_SPLIT_PEOPLE = 100
const val WHOLE_PERCENT = 10_000L

data class BudgetCategoryDto(
    val id: String, val name: String, @SerializedName("estimate_minor") val estimateMinor: Long,
    @SerializedName("recorded_minor") val recordedMinor: Long, @SerializedName("remaining_minor") val remainingMinor: Long,
)

data class ExpenseDto(
    val id: String, @SerializedName("amount_minor") val amountMinor: Long, @SerializedName("category_id") val categoryId: String?,
    val note: String, @SerializedName("recorded_by_name") val recordedByName: String?, @SerializedName("recorded_at") val recordedAt: String,
    val mine: Boolean, @SerializedName("can_delete") val canDelete: Boolean,
)

data class ContributionDto(
    val id: String, @SerializedName("amount_minor") val amountMinor: Long, val state: String, val note: String?,
    @SerializedName("contributor_name") val contributorName: String?, @SerializedName("recorded_at") val recordedAt: String,
    val mine: Boolean, @SerializedName("can_change") val canChange: Boolean,
)

data class SplitShareDto(
    @SerializedName("account_id") val accountId: String?, val name: String?, val mine: Boolean, val value: Long?,
    @SerializedName("share_minor") val shareMinor: Long, @SerializedName("rounded_up") val roundedUp: Boolean,
)

data class SplitDto(
    val method: String, val base: String, @SerializedName("base_minor") val baseMinor: Long, @SerializedName("people_count") val peopleCount: Int,
    val shares: List<SplitShareDto>, @SerializedName("all_shares") val allShares: Boolean, @SerializedName("allocated_minor") val allocatedMinor: Long,
    @SerializedName("difference_minor") val differenceMinor: Long, @SerializedName("rounding_count") val roundingCount: Int,
)

data class SplitCandidateDto(@SerializedName("account_id") val accountId: String, val name: String)

data class BudgetDto(
    @SerializedName("event_id") val eventId: String, val currency: String?,
    val categories: List<BudgetCategoryDto>, val expenses: List<ExpenseDto>,
    @SerializedName("estimate_minor") val estimateMinor: Long, @SerializedName("recorded_minor") val recordedMinor: Long,
    @SerializedName("uncategorized_minor") val uncategorizedMinor: Long, @SerializedName("remaining_minor") val remainingMinor: Long,
    val contributions: List<ContributionDto> = emptyList(), @SerializedName("all_contributions") val allContributions: Boolean = false,
    @SerializedName("given_minor") val givenMinor: Long = 0, @SerializedName("promised_minor") val promisedMinor: Long = 0,
    @SerializedName("contribution_count") val contributionCount: Int = 0,
    val split: SplitDto? = null, @SerializedName("split_candidates") val splitCandidates: List<SplitCandidateDto> = emptyList(),
    @SerializedName("can_manage") val canManage: Boolean, @SerializedName("can_record") val canRecord: Boolean, val etag: String?,
)

data class PlanCategoryBody(val id: String?, val name: String, @SerializedName("estimate_minor") val estimateMinor: Long)
data class SaveBudgetBody(val currency: String, val categories: List<PlanCategoryBody>)
data class ExpenseBody(@SerializedName("amount_minor") val amountMinor: Long, val note: String, @SerializedName("category_id") val categoryId: String? = null)

/** One record attempt; a retry with the same details reuses its key, so a lost answer is not counted twice. */
data class ExpenseIntent(val accountId: String, val eventId: String, val key: String, val body: ExpenseBody)

data class ContributionBody(@SerializedName("amount_minor") val amountMinor: Long, val state: String, val note: String? = null)
data class ContributionStateBody(val state: String)
data class SplitPersonBody(@SerializedName("account_id") val accountId: String, val value: Long? = null)
data class SaveSplitBody(val method: String, val base: String, val people: List<SplitPersonBody>)

/** A split being edited: the people chosen, in order, each with the typed percentage or amount. */
data class SplitDraft(val etag: String, val method: String, val base: String, val people: List<Pair<String, String>>)

/** The same for a contribution. */
data class ContributionIntent(val accountId: String, val eventId: String, val key: String, val body: ContributionBody)

/** A category row of a plan being edited; [id] is null for a new one. */
data class PlanRow(val id: String?, val name: String, val estimate: String)

enum class BudgetProblem { CURRENCY, CATEGORY_COUNT, CATEGORY_NAME, CATEGORY_NAME_LONG, CATEGORY_DUPLICATE, ESTIMATE, AMOUNT, NOTE, NOTE_LONG, CONTROL, STATE, PEOPLE, PERCENT, PERCENT_TOTAL, SPLIT_AMOUNT }

private val CONTROLS = Regex("[\\u0000-\\u0008\\u000B-\\u001F\\u007F\\u202A-\\u202E\\u2066-\\u2069]")
private val MONEY = Regex("(\\d{1,10})(?:\\.(\\d{1,2}))?")

private fun clean(value: String) = value.trim().replace(Regex("\\s+"), " ")
private fun length(value: String) = value.codePointCount(0, value.length)

/** Typed money to whole paise or cents with no floating point: "1,234.5" is 123450. */
fun parseMinor(text: String): Long? {
    val match = MONEY.matchEntire(text.trim().replace(Regex("[,\\s]"), "")) ?: return null
    val value = match.groupValues[1].toLong() * 100 + match.groupValues[2].padEnd(2, '0').toLong()
    return value.takeIf { it <= MAX_MINOR }
}

/** Whole paise or cents as an exact decimal for a text field: 123450 is "1234.50". */
fun minorText(value: Long): String = BigDecimal.valueOf(value, 2).toPlainString()

fun formatMoney(value: Long, currency: String, locale: Locale = Locale.getDefault()): String {
    val format = NumberFormat.getCurrencyInstance(locale)
    format.currency = Currency.getInstance(currency)
    format.minimumFractionDigits = 2
    format.maximumFractionDigits = 2
    return format.format(BigDecimal.valueOf(value, 2))
}

fun planProblem(currency: String?, rows: List<PlanRow>): BudgetProblem? {
    if (currency !in BUDGET_CURRENCIES) return BudgetProblem.CURRENCY
    if (rows.size > MAX_BUDGET_CATEGORIES) return BudgetProblem.CATEGORY_COUNT
    val names = mutableSetOf<String>()
    for (row in rows) {
        val name = clean(row.name)
        when {
            name.isEmpty() -> return BudgetProblem.CATEGORY_NAME
            length(name) > MAX_CATEGORY_NAME -> return BudgetProblem.CATEGORY_NAME_LONG
            CONTROLS.containsMatchIn(name) -> return BudgetProblem.CONTROL
            !names.add(name.lowercase(Locale.ROOT)) -> return BudgetProblem.CATEGORY_DUPLICATE
            parseMinor(row.estimate.ifBlank { "0" }) == null -> return BudgetProblem.ESTIMATE
        }
    }
    return null
}

fun planBody(currency: String, rows: List<PlanRow>) = SaveBudgetBody(
    currency, rows.map { PlanCategoryBody(it.id, clean(it.name), parseMinor(it.estimate.ifBlank { "0" }) ?: 0) },
)

fun expenseProblem(amount: String, note: String): BudgetProblem? {
    val cleaned = clean(note)
    return when {
        (parseMinor(amount) ?: 0) < 1 -> BudgetProblem.AMOUNT
        cleaned.isEmpty() -> BudgetProblem.NOTE
        length(cleaned) > MAX_EXPENSE_NOTE -> BudgetProblem.NOTE_LONG
        CONTROLS.containsMatchIn(cleaned) -> BudgetProblem.CONTROL
        else -> null
    }
}

fun expenseBody(amount: String, note: String, categoryId: String?) = ExpenseBody(parseMinor(amount) ?: 0, clean(note), categoryId)

fun contributionProblem(amount: String, state: String?, note: String): BudgetProblem? {
    val cleaned = clean(note)
    return when {
        (parseMinor(amount) ?: 0) < 1 -> BudgetProblem.AMOUNT
        state !in CONTRIBUTION_STATES -> BudgetProblem.STATE
        length(cleaned) > MAX_EXPENSE_NOTE -> BudgetProblem.NOTE_LONG
        CONTROLS.containsMatchIn(cleaned) -> BudgetProblem.CONTROL
        else -> null
    }
}

/** A blank note is left out, so the request matches one sent without a note. */
fun contributionBody(amount: String, state: String, note: String) = ContributionBody(parseMinor(amount) ?: 0, state, clean(note).ifEmpty { null })

private val PERCENT = Regex("(\\d{1,3})(?:\\.(\\d{1,2}))?")

/** A typed percentage to hundredths of a percent, with no floating point: "33.33" is 3333. */
fun parsePercent(text: String): Long? {
    val match = PERCENT.matchEntire(text.trim()) ?: return null
    val value = match.groupValues[1].toLong() * 100 + match.groupValues[2].padEnd(2, '0').toLong()
    return value.takeIf { it <= WHOLE_PERCENT }
}

/** Hundredths of a percent as an exact decimal: 3333 is "33.33". */
fun percentText(value: Long): String = BigDecimal.valueOf(value, 2).toPlainString()

fun splitProblem(draft: SplitDraft): BudgetProblem? {
    if (draft.people.isEmpty() || draft.people.size > MAX_SPLIT_PEOPLE) return BudgetProblem.PEOPLE
    if (draft.method == "percentages") {
        val values = draft.people.map { parsePercent(it.second) }
        if (values.any { it == null }) return BudgetProblem.PERCENT
        if (values.sumOf { it ?: 0 } != WHOLE_PERCENT) return BudgetProblem.PERCENT_TOTAL
    }
    if (draft.method == "amounts" && draft.people.any { parseMinor(it.second) == null }) return BudgetProblem.SPLIT_AMOUNT
    return null
}

fun splitBody(draft: SplitDraft) = SaveSplitBody(draft.method, draft.base, draft.people.map { (account, value) ->
    SplitPersonBody(account, when (draft.method) { "percentages" -> parsePercent(value) ?: 0; "amounts" -> parseMinor(value) ?: 0; else -> null })
})

interface EventBudgetsApi {
    @GET("v1/events/{id}/budget")
    suspend fun read(@Header("Authorization") authorization: String, @Path("id") eventId: String): Response<EnvelopeDto<BudgetDto>>

    @PUT("v1/events/{id}/budget")
    suspend fun save(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Header("If-Match") etag: String, @Body body: SaveBudgetBody): Response<EnvelopeDto<BudgetDto>>

    @POST("v1/events/{id}/expenses")
    suspend fun record(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Header("Idempotency-Key") key: String, @Body body: ExpenseBody): Response<EnvelopeDto<BudgetDto>>

    @DELETE("v1/events/{id}/expenses/{expense}")
    suspend fun delete(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Path("expense") expenseId: String): Response<EnvelopeDto<BudgetDto>>

    @POST("v1/events/{id}/contributions")
    suspend fun contribute(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Header("Idempotency-Key") key: String, @Body body: ContributionBody): Response<EnvelopeDto<BudgetDto>>

    @PUT("v1/events/{id}/contributions/{contribution}")
    suspend fun mark(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Path("contribution") contributionId: String, @Body body: ContributionStateBody): Response<EnvelopeDto<BudgetDto>>

    @DELETE("v1/events/{id}/contributions/{contribution}")
    suspend fun withdraw(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Path("contribution") contributionId: String): Response<EnvelopeDto<BudgetDto>>

    @PUT("v1/events/{id}/budget/split")
    suspend fun split(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Header("If-Match") etag: String, @Body body: SaveSplitBody): Response<EnvelopeDto<BudgetDto>>

    @DELETE("v1/events/{id}/budget/split")
    suspend fun unsplit(@Header("Authorization") authorization: String, @Path("id") eventId: String, @Header("If-Match") etag: String): Response<EnvelopeDto<BudgetDto>>
}

/** Checks that every total is the sum of the amounts shown before the screen can show it. */
@Singleton
class EventBudgetsRepository @Inject constructor(private val api: EventBudgetsApi, private val accounts: AccountRepository) {
    private fun invalid(message: String = "The service returned an unexpected budget response."): Nothing = throw IdentityFailure("INVALID_RESPONSE", message)

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int, empty: Boolean = false) = require((empty || value.isNotBlank()) && length(value) <= limit)

    fun budget(value: BudgetDto, eventId: String): BudgetDto = try {
        identifier(value.eventId)
        require(value.eventId.equals(eventId, ignoreCase = true))
        require(value.currency == null || value.currency in BUDGET_CURRENCIES)
        require(value.categories.size <= MAX_BUDGET_CATEGORIES && value.expenses.size <= 200)
        val categories = value.categories.map { it.id }.toSet()
        require(categories.size == value.categories.size && value.expenses.map { it.id }.toSet().size == value.expenses.size)
        fun recordedIn(category: String?) = value.expenses.filter { it.categoryId == category }.sumOf { it.amountMinor }
        value.categories.forEach {
            identifier(it.id); text(it.name, MAX_CATEGORY_NAME)
            require(it.estimateMinor in 0..MAX_MINOR && it.recordedMinor == recordedIn(it.id) && it.remainingMinor == it.estimateMinor - it.recordedMinor)
        }
        value.expenses.forEach {
            identifier(it.id); text(it.note, MAX_EXPENSE_NOTE, empty = true)
            require(it.amountMinor in 1..MAX_MINOR && (it.categoryId == null || it.categoryId in categories))
            it.recordedByName?.let { name -> text(name, 80) }
            Instant.parse(it.recordedAt)
        }
        require(value.estimateMinor == value.categories.sumOf { it.estimateMinor } && value.recordedMinor == value.expenses.sumOf { it.amountMinor })
        require(value.uncategorizedMinor == recordedIn(null) && value.remainingMinor == value.estimateMinor - value.recordedMinor)
        require(value.contributions.size <= MAX_CONTRIBUTIONS && value.contributions.map { it.id }.toSet().size == value.contributions.size)
        value.contributions.forEach {
            identifier(it.id)
            require(it.amountMinor in 1..MAX_MINOR && it.state in CONTRIBUTION_STATES && (!it.canChange || it.mine))
            it.note?.let { note -> text(note, MAX_EXPENSE_NOTE) }
            it.contributorName?.let { name -> text(name, 80) }
            Instant.parse(it.recordedAt)
        }
        fun contributed(state: String) = value.contributions.filter { it.state == state }.sumOf { it.amountMinor }
        require(value.givenMinor >= 0 && value.promisedMinor >= 0 && value.contributionCount in 0..MAX_CONTRIBUTIONS)
        // Someone who does not manage the budget sees only their own contributions, so theirs can only be part of the totals.
        if (value.allContributions) {
            require(value.givenMinor == contributed("given") && value.promisedMinor == contributed("promised") && value.contributionCount == value.contributions.size)
        } else {
            require(value.contributions.all { it.mine } && contributed("given") <= value.givenMinor && contributed("promised") <= value.promisedMinor)
            require(value.contributions.size <= value.contributionCount)
        }
        require(value.currency != null || (value.categories.isEmpty() && value.expenses.isEmpty() && value.contributionCount == 0 && value.split == null && !value.canRecord))
        value.split?.let { split(it, value) }
        require(value.splitCandidates.isEmpty() || value.canManage)
        value.splitCandidates.forEach { identifier(it.accountId); text(it.name, 80) }
        require(!value.canManage || value.etag != null)
        value
    } catch (_error: IllegalArgumentException) { invalid() }
    catch (_error: NullPointerException) { invalid() }
    catch (_error: DateTimeException) { invalid() }

    /** A split divides the current total; only set amounts may differ from it, and every rounded share is counted. */
    private fun split(split: SplitDto, budget: BudgetDto) {
        require(split.method in SPLIT_METHODS && split.base in SPLIT_BASES && split.peopleCount in 1..MAX_SPLIT_PEOPLE && split.shares.size <= MAX_SPLIT_PEOPLE)
        require(split.baseMinor == (if (split.base == "planned") budget.estimateMinor else budget.recordedMinor))
        require(split.differenceMinor == split.baseMinor - split.allocatedMinor && split.allocatedMinor >= 0)
        require(if (split.method == "amounts") split.roundingCount == 0 else split.differenceMinor == 0L)
        split.shares.forEach {
            it.accountId?.let(::identifier)
            it.name?.let { name -> text(name, 80) }
            require(it.shareMinor >= 0)
            require(when (split.method) {
                "amounts" -> it.value == it.shareMinor && !it.roundedUp
                "equal" -> it.value == null
                else -> it.value != null && it.value in 0..WHOLE_PERCENT
            })
        }
        if (split.allShares) {
            require(split.shares.size == split.peopleCount && split.shares.sumOf { it.shareMinor } == split.allocatedMinor)
            require(split.shares.count { it.roundedUp } == split.roundingCount)
            require(split.method != "percentages" || split.shares.sumOf { it.value ?: 0 } == WHOLE_PERCENT)
            require(split.method != "equal" || split.shares.all { it.shareMinor - split.shares.last().shareMinor in 0..1 })
        } else {
            require(split.shares.size <= 1 && split.shares.all { it.mine })
        }
    }

    suspend fun read(accountId: String, eventId: String): BudgetDto = accounts.authorized(accountId) {
        budget(accounts.result(api.read(it, eventId)), eventId)
    }

    suspend fun save(accountId: String, eventId: String, etag: String, body: SaveBudgetBody): BudgetDto = accounts.authorized(accountId) {
        budget(accounts.result(api.save(it, eventId, etag, body)), eventId).also { saved ->
            if (saved.currency != body.currency || saved.categories.map(BudgetCategoryDto::name) != body.categories.map(PlanCategoryBody::name)) {
                invalid("The saved budget does not match your changes.")
            }
        }
    }

    suspend fun record(intent: ExpenseIntent): BudgetDto = accounts.authorized(intent.accountId) {
        budget(accounts.result(api.record(it, intent.eventId, intent.key, intent.body)), intent.eventId).also { saved ->
            if (saved.expenses.none { item -> item.mine && item.amountMinor == intent.body.amountMinor && item.note == intent.body.note && item.categoryId == intent.body.categoryId }) {
                invalid("The expense could not be confirmed.")
            }
        }
    }

    suspend fun delete(accountId: String, eventId: String, expenseId: String): BudgetDto = accounts.authorized(accountId) {
        budget(accounts.result(api.delete(it, eventId, expenseId)), eventId).also { saved ->
            if (saved.expenses.any { item -> item.id == expenseId }) invalid("The deletion could not be confirmed.")
        }
    }

    suspend fun contribute(intent: ContributionIntent): BudgetDto = accounts.authorized(intent.accountId) {
        budget(accounts.result(api.contribute(it, intent.eventId, intent.key, intent.body)), intent.eventId).also { saved ->
            if (saved.contributions.none { item -> item.mine && item.amountMinor == intent.body.amountMinor && item.state == intent.body.state && item.note == intent.body.note }) {
                invalid("The contribution could not be confirmed.")
            }
        }
    }

    suspend fun mark(accountId: String, eventId: String, contributionId: String, state: String): BudgetDto = accounts.authorized(accountId) {
        budget(accounts.result(api.mark(it, eventId, contributionId, ContributionStateBody(state))), eventId).also { saved ->
            if (saved.contributions.none { item -> item.id == contributionId && item.mine && item.state == state }) invalid("The change could not be confirmed.")
        }
    }

    suspend fun withdraw(accountId: String, eventId: String, contributionId: String): BudgetDto = accounts.authorized(accountId) {
        budget(accounts.result(api.withdraw(it, eventId, contributionId)), eventId).also { saved ->
            if (saved.contributions.any { item -> item.id == contributionId }) invalid("The withdrawal could not be confirmed.")
        }
    }

    suspend fun split(accountId: String, eventId: String, etag: String, body: SaveSplitBody): BudgetDto = accounts.authorized(accountId) {
        budget(accounts.result(api.split(it, eventId, etag, body)), eventId).also { saved ->
            val split = saved.split
            if (split == null || split.method != body.method || split.base != body.base || split.peopleCount != body.people.size) invalid("The split could not be confirmed.")
        }
    }

    suspend fun unsplit(accountId: String, eventId: String, etag: String): BudgetDto = accounts.authorized(accountId) {
        budget(accounts.result(api.unsplit(it, eventId, etag)), eventId).also { saved ->
            if (saved.split != null) invalid("The removal could not be confirmed.")
        }
    }
}
