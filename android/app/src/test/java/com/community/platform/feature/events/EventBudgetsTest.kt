package com.community.platform.feature.events

import androidx.lifecycle.viewModelScope
import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.util.Locale
import java.util.UUID

// DEC-039 (T159): event budgets in exact money; recording an expense is never a payment.
@OptIn(ExperimentalCoroutinesApi::class)
class EventBudgetsTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val eventId = "6a3c6e31-8f8e-4d71-8d84-3f7c6c5e4d04"
    private val foodId = "8c1d7e52-5a3b-4f0e-9a61-0d4e6f2b7c11"
    private val milkId = "9d2e8f63-6b4c-4a1f-8b72-1e5f7a3c8d22"
    private val breadId = "a1b2c3d4-0e1f-4a2b-9c3d-4e5f6a7b8c90"

    private fun <Value> ok(value: Value): Response<EnvelopeDto<Value>> = Response.success(EnvelopeDto(value, null, null))
    private fun <Value> failed(status: Int, code: String): Response<EnvelopeDto<Value>> =
        Response.error(status, """{"error":{"code":"$code","message":"Synthetic $code","details":{}}}""".toResponseBody("application/json".toMediaType()))

    /** Works out every total from the stored amounts, and treats If-Match and retry keys, as the API does. */
    inner class FakeApi : EventBudgetsApi {
        var currency: String? = null
        var version = 0
        var categories = listOf<Triple<String, String, Long>>()
        val expenses = mutableListOf<ExpenseDto>()
        var open = true
        var loseRecords = 0
        var readStatus = 0
        var reads = 0
        // The next read, or the next delete, waits here until the test releases it.
        var holdRead: CompletableDeferred<Unit>? = null
        val readEntered = CompletableDeferred<Unit>()
        val readStopped = CompletableDeferred<Unit>()
        var holdDelete: CompletableDeferred<Unit>? = null
        val deleteEntered = CompletableDeferred<Unit>()
        val keys = mutableListOf<String>()
        val saves = mutableListOf<Pair<String, SaveBudgetBody>>()
        val deletes = mutableListOf<String>()
        private val seen = mutableSetOf<String>()
        // Contributions (DEC-041): the manager sees them all; anyone else only their own.
        val contributions = mutableListOf<ContributionDto>()
        var manager = true
        var loseGifts = 0
        var giftFailure: Pair<Int, String>? = null
        val giftKeys = mutableListOf<String>()
        val marks = mutableListOf<Pair<String, String>>()
        val withdrawals = mutableListOf<String>()
        private val seenGifts = mutableSetOf<String>()
        // Splits (DEC-042), divided from the current total as the API divides them.
        var candidates = listOf<SplitCandidateDto>()
        var stored: SaveSplitBody? = null
        var splitFailure: Pair<Int, String>? = null
        val splits = mutableListOf<Pair<String, SaveSplitBody>>()
        val unsplits = mutableListOf<String>()

        private fun divide(method: String, base: Long, values: List<Long?>): List<Pair<Long, Boolean>> = when (method) {
            "amounts" -> values.map { (it ?: 0L) to false }
            "equal" -> values.indices.map { if (it < base % values.size) base / values.size + 1 to true else base / values.size to false }
            else -> {
                val exact = values.map { base * (it ?: 0L) }
                val floors = exact.map { it / WHOLE_PERCENT }
                val extra = values.indices.sortedWith(compareBy({ -(exact[it] % WHOLE_PERCENT) }, { it })).take(maxOf(base - floors.sum(), 0L).toInt()).toSet()
                floors.mapIndexed { index, floor -> if (index in extra) floor + 1 to true else floor to false }
            }
        }

        fun view(): BudgetDto {
            fun recordedIn(category: String?) = expenses.filter { it.categoryId == category }.sumOf { it.amountMinor }
            fun contributed(state: String) = contributions.filter { it.state == state }.sumOf { it.amountMinor }
            val estimate = categories.sumOf { it.third }
            val recorded = expenses.sumOf { it.amountMinor }
            val split = stored?.let { body ->
                val base = if (body.base == "planned") estimate else recorded
                val divided = divide(body.method, base, body.people.map { it.value })
                val shares = body.people.mapIndexed { index, person ->
                    SplitShareDto(person.accountId, candidates.first { it.accountId == person.accountId }.name, person.accountId == fixture.accountId,
                        person.value, divided[index].first, divided[index].second)
                }
                val allocated = divided.sumOf { it.first }
                SplitDto(body.method, body.base, base, shares.size, if (manager) shares else shares.filter { it.mine }, manager, allocated, base - allocated, divided.count { it.second })
            }
            return BudgetDto(
                eventId = eventId, currency = currency,
                categories = categories.map { (id, name, planned) -> BudgetCategoryDto(id, name, planned, recordedIn(id), planned - recordedIn(id)) },
                expenses = expenses.map { it.copy(canDelete = open) }, estimateMinor = estimate, recordedMinor = recorded,
                uncategorizedMinor = recordedIn(null), remainingMinor = estimate - recorded,
                contributions = contributions.filter { manager || it.mine }.map { it.copy(canChange = open && it.mine) }, allContributions = manager,
                givenMinor = contributed("given"), promisedMinor = contributed("promised"), contributionCount = contributions.size,
                split = split, splitCandidates = if (manager && open && currency != null) candidates else emptyList(),
                canManage = open && manager, canRecord = open && currency != null, etag = "\"budget-$version\"",
            )
        }

        override suspend fun read(authorization: String, eventId: String): Response<EnvelopeDto<BudgetDto>> {
            reads += 1
            holdRead?.let { gate ->
                holdRead = null
                readEntered.complete(Unit)
                try { gate.await() } catch (error: CancellationException) { readStopped.complete(Unit); throw error }
            }
            return if (readStatus != 0) failed(readStatus, "SYNTHETIC") else ok(view())
        }

        override suspend fun save(authorization: String, eventId: String, etag: String, body: SaveBudgetBody): Response<EnvelopeDto<BudgetDto>> {
            saves += etag to body
            if (!open) return failed(409, "EVENT_CANCELLED")
            if (etag != "\"budget-$version\"") return failed(412, "BUDGET_CHANGED")
            currency = body.currency
            categories = body.categories.map { Triple(it.id ?: UUID.randomUUID().toString(), it.name, it.estimateMinor) }
            version += 1
            return ok(view())
        }

        override suspend fun record(authorization: String, eventId: String, key: String, body: ExpenseBody): Response<EnvelopeDto<BudgetDto>> {
            keys += key
            if (!open) return failed(409, "EVENT_CANCELLED")
            if (currency == null) return failed(409, "BUDGET_NOT_SET")
            if (body.categoryId != null && categories.none { it.first == body.categoryId }) return failed(409, "CATEGORY_UNAVAILABLE")
            if (seen.add(key)) {
                expenses.add(0, ExpenseDto(UUID.randomUUID().toString(), body.amountMinor, body.categoryId, body.note, "Sam", "2026-09-19T10:05:00Z", mine = true, canDelete = true))
                if (loseRecords > 0) { loseRecords -= 1; throw IOException("Synthetic answer lost after the expense was recorded") }
            }
            return ok(view())
        }

        override suspend fun delete(authorization: String, eventId: String, expenseId: String): Response<EnvelopeDto<BudgetDto>> {
            holdDelete?.let { gate -> holdDelete = null; deleteEntered.complete(Unit); gate.await() }
            deletes += expenseId
            if (!open) return failed(409, "EVENT_CANCELLED")
            expenses.removeAll { it.id == expenseId }
            return ok(view())
        }

        override suspend fun contribute(authorization: String, eventId: String, key: String, body: ContributionBody): Response<EnvelopeDto<BudgetDto>> {
            giftKeys += key
            giftFailure?.let { (status, code) -> return failed(status, code) }
            if (!open) return failed(409, "EVENT_CANCELLED")
            if (currency == null) return failed(409, "BUDGET_NOT_SET")
            if (seenGifts.add(key)) {
                contributions.add(0, ContributionDto(UUID.randomUUID().toString(), body.amountMinor, body.state, body.note, "Sam", "2026-09-19T10:06:00Z", mine = true, canChange = true))
                if (loseGifts > 0) { loseGifts -= 1; throw IOException("Synthetic answer lost after the contribution was recorded") }
            }
            return ok(view())
        }

        override suspend fun mark(authorization: String, eventId: String, contributionId: String, body: ContributionStateBody): Response<EnvelopeDto<BudgetDto>> {
            marks += contributionId to body.state
            val index = contributions.indexOfFirst { it.id == contributionId }
            if (index < 0) return failed(404, "CONTRIBUTION_NOT_FOUND")
            if (!contributions[index].mine) return failed(403, "CONTRIBUTION_CHANGE_DENIED")
            if (contributions[index].state != body.state && !open) return failed(409, "EVENT_CANCELLED")
            contributions[index] = contributions[index].copy(state = body.state)
            return ok(view())
        }

        override suspend fun withdraw(authorization: String, eventId: String, contributionId: String): Response<EnvelopeDto<BudgetDto>> {
            withdrawals += contributionId
            val found = contributions.firstOrNull { it.id == contributionId } ?: return ok(view())
            if (!found.mine) return failed(403, "CONTRIBUTION_CHANGE_DENIED")
            if (!open) return failed(409, "EVENT_CANCELLED")
            contributions.remove(found)
            return ok(view())
        }

        override suspend fun split(authorization: String, eventId: String, etag: String, body: SaveSplitBody): Response<EnvelopeDto<BudgetDto>> {
            splits += etag to body
            splitFailure?.let { (status, code) -> return failed(status, code) }
            if (etag != "\"budget-$version\"") return failed(412, "BUDGET_CHANGED")
            stored = body; version += 1
            return ok(view())
        }

        override suspend fun unsplit(authorization: String, eventId: String, etag: String): Response<EnvelopeDto<BudgetDto>> {
            unsplits += etag
            if (etag != "\"budget-$version\"") return failed(412, "BUDGET_CHANGED")
            if (stored != null) { stored = null; version += 1 }
            return ok(view())
        }
    }

    private val api = FakeApi()
    private val repository = EventBudgetsRepository(api, fixture.accounts)
    private var model: BudgetViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup(): Unit = runBlocking {
        try { finishTestWork() } finally { Dispatchers.resetMain() }
    }

    private suspend fun finishTestWork() {
        model?.let { current ->
            current.bind(null, null)
            withTimeout(5000) { requireNotNull(current.viewModelScope.coroutineContext[Job]).cancelAndJoin() }
        }
    }

    private suspend fun idle(current: BudgetViewModel) = withTimeout(5000) { current.state.first { !it.loading && !it.working } }
    private suspend fun ready(): BudgetViewModel {
        val current = BudgetViewModel(repository); model = current
        current.bind(fixture.accountId, eventId); idle(current)
        return current
    }

    private val budget = BudgetDto(
        eventId = eventId, currency = "INR",
        categories = listOf(BudgetCategoryDto(foodId, "Food", 999_999, 30, 999_969)),
        expenses = listOf(
            ExpenseDto(milkId, 20, foodId, "Milk", "Sam", "2026-09-19T10:02:00Z", mine = false, canDelete = true),
            ExpenseDto(breadId, 10, foodId, "Bread", null, "2026-09-19T10:01:00Z", mine = true, canDelete = true),
        ),
        estimateMinor = 999_999, recordedMinor = 30, uncategorizedMinor = 0, remainingMinor = 999_969, canManage = true, canRecord = true, etag = "\"budget-1\"",
    )

    @Test fun moneyIsReadAndShownInExactMinorUnits() {
        for ((text, expected) in listOf("0.1" to 10L, "0.10" to 10L, "1,234.5" to 123_450L, " 1500 " to 150_000L, "0" to 0L, "1000000000" to MAX_MINOR)) {
            assertEquals(text, expected, parseMinor(text))
        }
        for (text in listOf("", ".5", "1.234", "-5", "1e3", "1000000000.01", "12a", "\u0661\u0662", "1..2", "NaN")) assertNull(text, parseMinor(text))
        assertEquals("1234.50", minorText(123_450))
        assertEquals("0.05", minorText(5))
        assertEquals("-18333.33", minorText(-1_833_333))
        assertTrue(formatMoney(100_000_333_368, "INR", Locale.ENGLISH).endsWith("1,000,003,333.68"))
        assertTrue(formatMoney(20_000_000_000_000, "USD", Locale.US).endsWith("200,000,000,000.00"))
        assertEquals("-$18,333.33", formatMoney(-1_833_333, "USD", Locale.US))
    }

    @Test fun budgetsThatDoNotAddUpAreRefused() {
        assertEquals(budget, repository.budget(budget, eventId))
        val empty = budget.copy(currency = null, categories = emptyList(), expenses = emptyList(), estimateMinor = 0, recordedMinor = 0, remainingMinor = 0, canRecord = false)
        assertEquals(empty, repository.budget(empty, eventId))
        val (milk, bread) = budget.expenses
        for (value in listOf(
            budget.copy(recordedMinor = 31), budget.copy(uncategorizedMinor = 5), budget.copy(remainingMinor = 0), budget.copy(estimateMinor = 1),
            budget.copy(categories = listOf(BudgetCategoryDto(foodId, "Food", 999_999, 31, 999_968))),
            budget.copy(categories = listOf(BudgetCategoryDto(foodId, "Food", 999_999, 30, 0))),
            budget.copy(expenses = listOf(milk, bread.copy(categoryId = eventId))),
            budget.copy(expenses = listOf(milk, bread.copy(id = milkId))),
            budget.copy(expenses = listOf(milk.copy(amountMinor = 0, categoryId = foodId), bread)),
            budget.copy(currency = "JPY"), budget.copy(etag = null), budget.copy(eventId = foodId),
            empty.copy(canRecord = true), budget.copy(currency = null),
            budget.copy(expenses = listOf(milk, bread.copy(recordedAt = "yesterday"))),
        )) assertThrows(IdentityFailure::class.java) { repository.budget(value, eventId) }
    }

    @Test fun plansAndExpensesAreCheckedBeforeSending() = runBlocking {
        assertEquals(BudgetProblem.CURRENCY, planProblem(null, emptyList()))
        assertNull(planProblem("INR", emptyList()))
        assertEquals(BudgetProblem.CATEGORY_NAME, planProblem("INR", listOf(PlanRow(null, " ", "1"))))
        assertEquals(BudgetProblem.CATEGORY_DUPLICATE, planProblem("INR", listOf(PlanRow(null, "Food", "1"), PlanRow(null, " food ", ""))))
        assertEquals(BudgetProblem.ESTIMATE, planProblem("INR", listOf(PlanRow(null, "Food", "1.234"))))
        assertEquals(BudgetProblem.CATEGORY_NAME_LONG, planProblem("INR", listOf(PlanRow(null, "x".repeat(61), "1"))))
        assertEquals(BudgetProblem.CATEGORY_COUNT, planProblem("INR", (0..30).map { PlanRow(null, "Part $it", "1") }))
        assertEquals(SaveBudgetBody("INR", listOf(PlanCategoryBody(foodId, "Food and drink", 150_050), PlanCategoryBody(null, "Gifts", 0))),
            planBody("INR", listOf(PlanRow(foodId, "  Food   and drink ", "1,500.5"), PlanRow(null, "Gifts", ""))))
        assertEquals(BudgetProblem.AMOUNT, expenseProblem("0", "Bread"))
        assertEquals(BudgetProblem.NOTE, expenseProblem("10", "  "))
        assertEquals(BudgetProblem.NOTE_LONG, expenseProblem("10", "x".repeat(121)))
        assertEquals(BudgetProblem.CONTROL, expenseProblem("10", "Gift\u202e"))
        api.currency = "INR"; api.version = 1
        val current = ready()
        current.amount("1.234"); current.note("Bread"); current.record()
        assertEquals(BudgetProblem.AMOUNT, current.state.value.expenseProblem)
        assertNull(current.state.value.planProblem)
        assertEquals(emptyList<String>(), api.keys)
    }

    @Test fun aPlanSavesFromItsVersionAndALostExpenseIsRecordedOnceOnRetry() = runBlocking {
        val current = ready()
        assertEquals(null, current.state.value.budget?.currency)
        current.startPlan()
        current.currency("INR")
        current.addRow(); current.row(0, PlanRow(null, "Food", "1500"))
        current.addRow(); current.row(1, PlanRow(null, "Venue", "5000.50"))
        current.savePlan(); idle(current)
        assertEquals("\"budget-0\"" to SaveBudgetBody("INR", listOf(PlanCategoryBody(null, "Food", 150_000), PlanCategoryBody(null, "Venue", 500_050))), api.saves.single())
        assertNull(current.state.value.plan)
        val food = current.state.value.budget!!.categories.first { it.name == "Food" }.id

        api.loseRecords = 1
        current.amount("0.10"); current.category(food); current.note("Bread"); current.record(); idle(current)
        assertEquals(BudgetIssue.CONNECTION, current.state.value.issue)
        assertTrue(current.state.value.pending != null)
        current.record(); idle(current)
        assertEquals(2, api.keys.size)
        assertEquals(api.keys[0], api.keys[1])
        assertEquals(1, api.expenses.size)
        val after = current.state.value
        assertEquals(listOf(10L), after.budget!!.expenses.map { it.amountMinor })
        assertEquals(10L, after.budget!!.categories.first { it.id == food }.recordedMinor)
        assertEquals(Triple("", null as String?, ""), Triple(after.amount, after.categoryId, after.note))
        assertNull(after.pending)

        // A refusal releases the attempt and shows the budget as the server now has it.
        api.open = false
        current.amount("5"); current.note("Taxi"); current.record(); idle(current)
        assertEquals(BudgetIssue.CANCELLED, current.state.value.issue)
        assertNull(current.state.value.pending)
        assertEquals(false, current.state.value.budget!!.canRecord)
    }

    @Test fun aPlanChangedElsewhereIsRefusedAndReloadShowsTheCurrentOne() = runBlocking {
        api.currency = "INR"; api.version = 3; api.categories = listOf(Triple(foodId, "Food", 50_000L))
        val current = ready()
        current.startPlan()
        assertEquals(PlanDraft("\"budget-3\"", "INR", listOf(PlanRow(foodId, "Food", "500.00"))), current.state.value.plan)
        api.version = 4; api.categories = listOf(Triple(foodId, "Groceries", 50_000L))
        current.refresh(); idle(current)
        current.row(0, PlanRow(foodId, "Food", "600"))
        current.savePlan(); idle(current)
        assertEquals("\"budget-3\"", api.saves.single().first)
        assertEquals(BudgetIssue.CHANGED, current.state.value.issue)
        assertEquals("Food", current.state.value.plan!!.rows.single().name)
        current.reloadPlan(); idle(current)
        assertNull(current.state.value.plan)
        assertEquals("Groceries", current.state.value.budget!!.categories.single().name)
    }

    @Test fun deletingAsksFirstAndAUsedCategoryAndTheCurrencyStay() = runBlocking {
        api.currency = "INR"; api.version = 1; api.categories = listOf(Triple(foodId, "Food", 50_000L))
        api.expenses += ExpenseDto(milkId, 1_200, foodId, "Milk", "Sam", "2026-09-19T10:02:00Z", mine = false, canDelete = true)
        val current = ready()
        current.startPlan()
        current.currency("USD")
        assertEquals("INR", current.state.value.plan!!.currency)
        current.removeRow(0)
        assertEquals(1, current.state.value.plan!!.rows.size)
        current.closePlan()
        current.askDelete("not-an-expense")
        assertNull(current.state.value.confirmDelete)
        current.askDelete(milkId)
        assertEquals(milkId, current.state.value.confirmDelete)
        current.keep()
        assertNull(current.state.value.confirmDelete)
        assertEquals(emptyList<String>(), api.deletes)
        current.askDelete(milkId); current.delete(); idle(current)
        assertEquals(listOf(milkId), api.deletes)
        assertEquals(emptyList<ExpenseDto>(), current.state.value.budget!!.expenses)
        assertNull(current.state.value.confirmDelete)
    }

    @Test fun aLostSessionAsksToSignInAgainAndAFailedLoadSaysSo() = runBlocking {
        api.readStatus = 503
        val current = ready()
        assertEquals(BudgetIssue.LOAD, current.state.value.issue)
        api.readStatus = 401
        current.refresh(); idle(current)
        assertTrue(current.state.value.requiresSignIn)
    }

    // DEC-041 (T173): contributions people record for themselves; never a payment.
    private val giftId = "c3d4e5f6-2a3b-4c4d-9e5f-6a7b8c9d0e12"
    private val ownGiftId = "d4e5f6a7-3b4c-4d5e-8f6a-7b8c9d0e1f23"

    @Test fun contributionsAreCheckedBeforeSendingAndABlankNoteIsLeftOut() {
        assertEquals(BudgetProblem.AMOUNT, contributionProblem("0", "given", ""))
        assertEquals(BudgetProblem.STATE, contributionProblem("10", null, ""))
        assertEquals(BudgetProblem.STATE, contributionProblem("10", "paid", ""))
        assertEquals(BudgetProblem.NOTE_LONG, contributionProblem("10", "given", "x".repeat(121)))
        assertEquals(BudgetProblem.CONTROL, contributionProblem("10", "given", "Gift\u202e"))
        assertNull(contributionProblem("10", "promised", "   "))
        assertEquals(ContributionBody(2_550, "promised", null), contributionBody("25.5", "promised", "   "))
        assertEquals(ContributionBody(50_000, "given", "Cash to Sam"), contributionBody("500", "given", " Cash  to Sam "))
    }

    @Test fun budgetsWhoseContributionsDoNotAddUpAreRefused() {
        val gift = ContributionDto(giftId, 50_000, "given", "Cash to Sam", "Riya", "2026-09-19T10:04:00Z", mine = false, canChange = false)
        val promise = ContributionDto(ownGiftId, 2_550, "promised", null, "Sam", "2026-09-19T10:03:00Z", mine = true, canChange = true)
        val all = budget.copy(contributions = listOf(gift, promise), allContributions = true, givenMinor = 50_000, promisedMinor = 2_550, contributionCount = 2)
        assertEquals(all, repository.budget(all, eventId))
        // Someone who does not manage the budget sees only their own, inside the totals for everyone.
        val own = all.copy(contributions = listOf(promise), allContributions = false, givenMinor = 60_000, contributionCount = 5)
        assertEquals(own, repository.budget(own, eventId))
        for (value in listOf(
            all.copy(givenMinor = 50_001), all.copy(promisedMinor = 0), all.copy(contributionCount = 3),
            all.copy(contributions = listOf(gift.copy(canChange = true), promise)),
            all.copy(contributions = listOf(gift, promise.copy(id = giftId))),
            all.copy(contributions = listOf(gift.copy(state = "paid"), promise)),
            all.copy(contributions = listOf(gift, promise.copy(note = ""))),
            all.copy(contributions = listOf(gift, promise.copy(amountMinor = 0)), promisedMinor = 0),
            all.copy(contributions = listOf(gift, promise.copy(recordedAt = "yesterday"))),
            all.copy(allContributions = false), own.copy(promisedMinor = 100), own.copy(contributionCount = 0),
            budget.copy(currency = null, categories = emptyList(), expenses = emptyList(), estimateMinor = 0, recordedMinor = 0, remainingMinor = 0, canRecord = false, contributionCount = 1),
        )) assertThrows(IdentityFailure::class.java) { repository.budget(value, eventId) }
    }

    @Test fun aContributionIsRecordedOnceOnRetryAndOnlyItsOwnerMarksOrWithdrawsIt() = runBlocking {
        api.currency = "INR"; api.version = 1
        api.contributions += ContributionDto(giftId, 50_000, "given", "Riya cash", "Riya", "2026-09-19T10:04:00Z", mine = false, canChange = false)
        val current = ready()
        current.giftAmount("250"); current.contribute()
        assertEquals(BudgetProblem.STATE, current.state.value.giftProblem)
        current.giftState("paid")
        assertNull(current.state.value.giftState)
        assertEquals(emptyList<String>(), api.giftKeys)

        api.loseGifts = 1
        current.giftState("promised"); current.giftNote("  Sweets "); current.contribute(); idle(current)
        assertEquals(BudgetIssue.CONNECTION, current.state.value.issue)
        assertTrue(current.state.value.pendingGift != null)
        current.contribute(); idle(current)
        assertEquals(2, api.giftKeys.size)
        assertEquals(api.giftKeys[0], api.giftKeys[1])
        assertEquals(2, api.contributions.size)
        val after = current.state.value
        assertEquals(Triple("", null as String?, ""), Triple(after.giftAmount, after.giftState, after.giftNote))
        assertNull(after.pendingGift)
        val mine = after.budget!!.contributions.single { it.mine }
        assertEquals(Triple(25_000L, "promised", "Sweets"), Triple(mine.amountMinor, mine.state, mine.note))
        assertEquals(50_000L to 25_000L, after.budget!!.givenMinor to after.budget!!.promisedMinor)

        // Someone else's contribution offers nothing to change.
        current.mark(giftId, "promised"); current.askWithdraw(giftId)
        assertEquals(emptyList<Pair<String, String>>(), api.marks)
        assertNull(current.state.value.confirmWithdraw)
        current.mark(mine.id, "given"); idle(current)
        assertEquals(listOf(mine.id to "given"), api.marks)
        assertEquals(75_000L, current.state.value.budget!!.givenMinor)
        current.askWithdraw(mine.id)
        assertEquals(mine.id, current.state.value.confirmWithdraw)
        current.keepGift()
        assertNull(current.state.value.confirmWithdraw)
        assertEquals(emptyList<String>(), api.withdrawals)
        current.askWithdraw(mine.id); current.withdraw(); idle(current)
        assertEquals(listOf(mine.id), api.withdrawals)
        assertEquals(1, current.state.value.budget!!.contributionCount)
        assertNull(current.state.value.confirmWithdraw)

        // A retry that does not match says so in a contribution's words; a definite refusal releases the attempt.
        api.giftFailure = 409 to "IDEMPOTENCY_CONFLICT"
        current.giftAmount("5"); current.giftState("given"); current.contribute(); idle(current)
        assertEquals(BudgetIssue.CONTRIBUTION_RETRY_CONFLICT, current.state.value.issue)
        assertNull(current.state.value.pendingGift)
        api.giftFailure = null; api.open = false
        current.contribute(); idle(current)
        assertEquals(BudgetIssue.CANCELLED, current.state.value.issue)
        assertNull(current.state.value.pendingGift)
    }

    @Test fun aContributionAloneKeepsTheCurrencyAndAMemberSeesOnlyTheirOwn() = runBlocking {
        api.currency = "INR"; api.version = 1; api.manager = false
        api.contributions += ContributionDto(giftId, 50_000, "given", "Riya cash", "Riya", "2026-09-19T10:04:00Z", mine = false, canChange = false)
        val member = ready()
        val seen = member.state.value.budget!!
        assertEquals(Triple(emptyList<ContributionDto>(), 50_000L, 1), Triple(seen.contributions, seen.givenMinor, seen.contributionCount))
        member.bind(null, null)
        withTimeout(5000) { requireNotNull(member.viewModelScope.coroutineContext[Job]).cancelAndJoin() }
        api.manager = true
        val manager = ready()
        manager.startPlan()
        manager.currency("USD")
        assertEquals("INR", manager.state.value.plan!!.currency)
    }

    // DEC-042 (T174): splits divide the current total exactly and say how they were rounded.
    private val samId = "b3c4d5e6-4f5a-4b6c-8d7e-9f0a1b2c3d4e"
    private val riyaId = "c4d5e6f7-5a6b-4c7d-9e8f-0a1b2c3d4e5f"

    @Test fun splitsAreCheckedBeforeSendingAndCarryExactValues() {
        listOf("33.33" to 3_333L, "100" to 10_000L, "0" to 0L, " 12.5 " to 1_250L).forEach { (text, expected) -> assertEquals(text, expected, parsePercent(text)) }
        listOf("", "100.01", "33.333", "-1", "50%").forEach { assertNull(it, parsePercent(it)) }
        assertEquals("33.33", percentText(3_333)); assertEquals("100.00", percentText(10_000))
        val draft = SplitDraft("\"budget-1\"", "percentages", "planned", listOf(fixture.accountId to "50", samId to "49.99"))
        assertEquals(BudgetProblem.PERCENT_TOTAL, splitProblem(draft))
        assertEquals(BudgetProblem.PERCENT, splitProblem(draft.copy(people = listOf(fixture.accountId to "half"))))
        assertEquals(BudgetProblem.PEOPLE, splitProblem(draft.copy(people = emptyList())))
        assertEquals(BudgetProblem.SPLIT_AMOUNT, splitProblem(draft.copy(method = "amounts", people = listOf(samId to "1.234"))))
        assertNull(splitProblem(draft.copy(method = "equal", people = listOf(samId to "anything"))))
        assertEquals(SaveSplitBody("percentages", "planned", listOf(SplitPersonBody(fixture.accountId, 5_000), SplitPersonBody(samId, 5_000))),
            splitBody(draft.copy(people = listOf(fixture.accountId to "50", samId to "50.00"))))
        assertEquals(SaveSplitBody("equal", "recorded", listOf(SplitPersonBody(samId))), splitBody(draft.copy(method = "equal", base = "recorded", people = listOf(samId to "5"))))
        assertEquals(listOf(150_050L, 0L), splitBody(draft.copy(method = "amounts", people = listOf(samId to "1,500.5", riyaId to "0"))).people.map { it.value })
    }

    @Test fun splitsThatDoNotDivideTheCurrentTotalAreRefused() {
        fun share(account: String?, mine: Boolean, value: Long?, amount: Long, rounded: Boolean) = SplitShareDto(account, account?.let { "Sam" }, mine, value, amount, rounded)
        val equal = SplitDto("equal", "planned", 999_999, 2, listOf(share(fixture.accountId, true, null, 500_000, true), share(samId, false, null, 499_999, false)), true, 999_999, 0, 1)
        val candidates = listOf(SplitCandidateDto(samId, "Sam"))
        val good = budget.copy(split = equal, splitCandidates = candidates)
        assertEquals(good, repository.budget(good, eventId))
        val member = budget.copy(canManage = false, etag = null, split = equal.copy(allShares = false, shares = equal.shares.take(1)))
        assertEquals(member, repository.budget(member, eventId))
        val set = SplitDto("amounts", "planned", 999_999, 1, listOf(share(samId, false, 600_000, 600_000, false)), true, 600_000, 399_999, 0)
        assertEquals(budget.copy(split = set), repository.budget(budget.copy(split = set), eventId))
        for (value in listOf(
            good.copy(split = equal.copy(baseMinor = 1)), good.copy(split = equal.copy(base = "recorded")), good.copy(split = equal.copy(differenceMinor = 1)),
            good.copy(split = equal.copy(roundingCount = 0)), good.copy(split = equal.copy(peopleCount = 3)), good.copy(split = equal.copy(method = "shares")),
            good.copy(split = equal.copy(shares = listOf(share(fixture.accountId, true, null, 500_001, true), share(samId, false, null, 499_998, false)))),
            good.copy(split = equal.copy(shares = listOf(share(fixture.accountId, true, 1, 500_000, true), share(samId, false, null, 499_999, false)))),
            good.copy(split = set.copy(roundingCount = 1)), good.copy(split = set.copy(shares = listOf(share(samId, false, 600_000, 599_999, false)))),
            member.copy(split = equal.copy(allShares = false)), member.copy(split = equal.copy(allShares = false, shares = equal.shares.drop(1))),
            member.copy(splitCandidates = candidates),
        )) assertThrows(IdentityFailure::class.java) { repository.budget(value, eventId) }
    }

    @Test fun anOrganizerSplitsFromTheVersionTheyOpenedAndRemovingAsksFirst() = runBlocking {
        api.currency = "INR"; api.version = 1; api.categories = listOf(Triple(foodId, "Food", 10_000L))
        api.candidates = listOf(SplitCandidateDto(fixture.accountId, "Alex"), SplitCandidateDto(samId, "Sam"), SplitCandidateDto(riyaId, "Riya"))
        val current = ready()
        current.startSplit()
        assertEquals(SplitDraft("\"budget-1\"", "equal", "planned", emptyList()), current.state.value.split)
        current.saveSplit()
        assertEquals(BudgetProblem.PEOPLE, current.state.value.splitProblem)
        current.splitPerson("not-a-candidate", true)
        listOf(riyaId, fixture.accountId, samId).forEach { current.splitPerson(it, true) }
        current.splitMethod("percentages")
        listOf(riyaId, fixture.accountId, samId).forEach { current.splitValue(it, "33.33") }
        current.saveSplit()
        assertEquals(BudgetProblem.PERCENT_TOTAL, current.state.value.splitProblem)
        assertEquals(emptyList<Pair<String, SaveSplitBody>>(), api.splits)
        current.splitValue(samId, "33.34"); current.saveSplit(); idle(current)
        assertEquals("\"budget-1\"" to SaveSplitBody("percentages", "planned", listOf(SplitPersonBody(riyaId, 3_333), SplitPersonBody(fixture.accountId, 3_333), SplitPersonBody(samId, 3_334))),
            api.splits.single())
        assertNull(current.state.value.split)
        assertEquals(listOf(3_333L, 3_333L, 3_334L), current.state.value.budget!!.split!!.shares.map { it.shareMinor })

        // Opening again starts from the saved split; a version changed meanwhile is refused and the draft stays.
        current.startSplit()
        assertEquals(listOf(riyaId to "33.33", fixture.accountId to "33.33", samId to "33.34"), current.state.value.split!!.people)
        api.version += 1
        current.splitPerson(riyaId, false); current.splitMethod("equal"); current.saveSplit(); idle(current)
        assertEquals(BudgetIssue.CHANGED, current.state.value.issue)
        assertTrue(current.state.value.split != null)
        current.closeSplit()
        current.startSplit()
        api.splitFailure = 409 to "PERSON_UNAVAILABLE"
        current.saveSplit(); idle(current)
        assertEquals(BudgetIssue.PERSON_GONE, current.state.value.issue)
        api.splitFailure = null
        current.closeSplit()

        // The currency stays while a split exists; removing it asks first.
        current.startPlan(); current.currency("USD")
        assertEquals("INR", current.state.value.plan!!.currency)
        current.closePlan()
        current.unsplit()
        assertEquals(emptyList<String>(), api.unsplits)
        current.askUnsplit(); assertTrue(current.state.value.confirmUnsplit)
        current.keepSplit(); assertFalse(current.state.value.confirmUnsplit)
        current.askUnsplit(); current.unsplit(); idle(current)
        assertEquals(1, api.unsplits.size)
        assertNull(current.state.value.budget!!.split)
        assertFalse(current.state.value.confirmUnsplit)
    }

    // T82: an answer that started before a change must never replace what the change brought.
    @Test fun aChangeStopsAnUnansweredReadAndReadsAgainAfterItsAnswer() = runBlocking {
        api.currency = "INR"; api.version = 1; api.categories = listOf(Triple(foodId, "Food", 50_000L))
        api.expenses += ExpenseDto(milkId, 1_200, foodId, "Milk", "Sam", "2026-09-19T10:02:00Z", mine = false, canDelete = true)
        val current = ready()
        api.holdRead = CompletableDeferred()
        current.refresh()
        withTimeout(5000) { api.readEntered.await() }
        current.askDelete(milkId); current.delete(); idle(current)
        withTimeout(5000) { api.readStopped.await() }
        assertTrue(api.readStopped.isCompleted)
        assertEquals(listOf(milkId), api.deletes)
        assertEquals(3, api.reads)
        assertEquals(emptyList<ExpenseDto>(), current.state.value.budget!!.expenses)
    }

    @Test fun aRefreshDuringAnUnansweredChangeWaitsForIt() = runBlocking {
        api.currency = "INR"; api.version = 1; api.categories = listOf(Triple(foodId, "Food", 50_000L))
        api.expenses += ExpenseDto(milkId, 1_200, foodId, "Milk", "Sam", "2026-09-19T10:02:00Z", mine = false, canDelete = true)
        val current = ready()
        val release = CompletableDeferred<Unit>()
        api.holdDelete = release
        current.askDelete(milkId); current.delete()
        withTimeout(5000) { api.deleteEntered.await() }
        current.refresh()
        assertEquals(false, current.state.value.loading)
        assertEquals(1, api.reads)
        release.complete(Unit); idle(current)
        assertEquals(2, api.reads)
        assertEquals(emptyList<ExpenseDto>(), current.state.value.budget!!.expenses)
    }

    @Test fun cleanupWaitsForAnUnansweredBudgetReadToStop() = runBlocking {
        val current = ready()
        val release = CompletableDeferred<Unit>()
        api.holdRead = release
        current.refresh()
        withTimeout(5000) { api.readEntered.await() }
        finishTestWork()
        val scope = requireNotNull(current.viewModelScope.coroutineContext[Job])
        assertTrue(scope.isCompleted)
        assertFalse(scope.children.any())
        assertTrue(api.readStopped.isCompleted)
        assertFalse(release.isCompleted)
        assertNull(current.state.value.accountId)
        assertNull(current.state.value.budget)
    }

    @Test fun theWireCarriesKeysVersionsAndLeavesOutEmptyIds() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        api.currency = "INR"; api.version = 1; api.categories = listOf(Triple(foodId, "Food", 50_000L))
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            val saved = api.view().let { view ->
                val gift = { state: String -> ContributionDto(giftId, 2_550, state, null, "Sam", "2026-09-19T10:06:00Z", mine = true, canChange = true) }
                when {
                    request.url.encodedPath.endsWith("/contributions") -> view.copy(contributions = listOf(gift("promised")), promisedMinor = 2_550, contributionCount = 1)
                    request.method == "PUT" && request.url.encodedPath.contains("/contributions/") ->
                        view.copy(contributions = listOf(gift("given")), givenMinor = 2_550, contributionCount = 1)
                    request.method == "PUT" -> view.copy(categories = listOf(view.categories.single(), BudgetCategoryDto(milkId, "Gifts", 0, 0, 0)))
                    request.method == "POST" -> view.copy(expenses = listOf(ExpenseDto(breadId, 500, null, "Tip", "Sam", "2026-09-19T10:05:00Z", mine = true, canDelete = true)),
                        recordedMinor = 500, uncategorizedMinor = 500, remainingMinor = view.estimateMinor - 500)
                    else -> view
                }
            }
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(saved, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = EventBudgetsRepository(IdentityModule.eventBudgets(http, Gson()), fixture.accounts)
        wire.save(fixture.accountId, eventId, "\"budget-1\"", planBody("INR", listOf(PlanRow(foodId, "Food", "500"), PlanRow(null, "Gifts", ""))))
        assertEquals("PUT", requests[0].method)
        assertEquals("/v1/events/$eventId/budget", requests[0].url.encodedPath)
        assertEquals("\"budget-1\"", requests[0].header("If-Match"))
        val plan = JsonParser.parseString(bodies[0]).asJsonObject
        assertEquals(setOf("id", "name", "estimate_minor"), plan.getAsJsonArray("categories")[0].asJsonObject.keySet())
        assertEquals(setOf("name", "estimate_minor"), plan.getAsJsonArray("categories")[1].asJsonObject.keySet())
        val key = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
        wire.record(ExpenseIntent(fixture.accountId, eventId, key, expenseBody("5", " Tip ", null)))
        assertEquals(key, requests[1].header("Idempotency-Key"))
        assertEquals("""{"amount_minor":500,"note":"Tip"}""", bodies[1])
        wire.delete(fixture.accountId, eventId, milkId)
        assertEquals("DELETE", requests[2].method)
        assertEquals("/v1/events/$eventId/expenses/$milkId", requests[2].url.encodedPath)
        // A contribution without a note leaves the note out, and a change sends only the state.
        val giftKey = "8c3fbd31-2c9a-4f88-9d5c-4c4c0a9c4d14"
        wire.contribute(ContributionIntent(fixture.accountId, eventId, giftKey, contributionBody("25.5", "promised", "  ")))
        assertEquals("POST", requests[3].method)
        assertEquals("/v1/events/$eventId/contributions", requests[3].url.encodedPath)
        assertEquals(giftKey, requests[3].header("Idempotency-Key"))
        assertEquals("""{"amount_minor":2550,"state":"promised"}""", bodies[3])
        wire.mark(fixture.accountId, eventId, giftId, "given")
        assertEquals("PUT", requests[4].method)
        assertEquals("/v1/events/$eventId/contributions/$giftId", requests[4].url.encodedPath)
        assertEquals("""{"state":"given"}""", bodies[4])
        wire.withdraw(fixture.accountId, eventId, giftId)
        assertEquals("DELETE", requests[5].method)
        assertEquals("/v1/events/$eventId/contributions/$giftId", requests[5].url.encodedPath)
    }
}
