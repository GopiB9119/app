package com.community.platform.feature.events

import android.content.res.Configuration
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.R
import com.community.platform.feature.InLanguage
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.saveEvidence
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.util.Locale

/** An event's budget (DEC-039, T159) on the events screen, built from synthetic state; the callbacks stand in for the view model. */
@RunWith(AndroidJUnit4::class)
class EventBudgetScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val eventId = "7a3e5c1d-2b4f-4a6e-8c0d-1e2f3a4b5c6d"
    private val foodId = "8c1d7e52-5a3b-4f0e-9a61-0d4e6f2b7c11"
    private val venueId = "a7e3c1d2-4b5f-4e6a-8b9c-0d1e2f3a4b5c"
    private val milkId = "9d2e8f63-6b4c-4a1f-8b72-1e5f7a3c8d22"
    private val breadId = "a1b2c3d4-0e1f-4a2b-9c3d-4e5f6a7b8c90"
    private val event = EventDto(
        eventId, spaceId, "Morgan family", "Naming ceremony", "", "Community hall", "Asia/Kolkata",
        "2026-10-10T10:00", "2026-10-10T12:00", "2026-10-10T04:30:00Z", "2026-10-10T06:30:00Z", "scheduled", false, "Alex Example",
        "2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z", null, null, 0, 0, 0, null, false, true, true, "\"event-1\"", emptyList(),
    )
    private val budget = BudgetDto(
        eventId, "INR",
        listOf(BudgetCategoryDto(foodId, "Food", 150_000, 30, 149_970), BudgetCategoryDto(venueId, "Venue", 500_050, 0, 500_050)),
        listOf(
            ExpenseDto(milkId, 20, foodId, "Milk", "Sam Example", "2026-10-02T10:02:00Z", mine = false, canDelete = true),
            ExpenseDto(breadId, 10, foodId, "Bread", "Alex Example", "2026-10-02T10:01:00Z", mine = true, canDelete = true),
        ),
        650_050, 30, 0, 650_020, canManage = true, canRecord = true, etag = "\"budget-2\"",
    )
    private val events = EventsState(accountId = accountId, spaceId = spaceId, mode = EventMode.DETAIL, selected = event, draft = EventDraft(timezone = "Asia/Kolkata"))
    private val target get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun money(value: Long, language: String? = null) =
        formatMoney(value, "INR", language?.let(Locale::forLanguageTag) ?: target.resources.configuration.locales[0])

    // The detail is one tall item of the list, so the list scrolls to it and then to the node inside it.
    private fun reveal(matcher: SemanticsMatcher) {
        compose.onNodeWithTag("events-content").performScrollToNode(matcher)
        compose.onNode(matcher).performScrollTo()
    }
    private fun reveal(tag: String) = reveal(hasTestTag(tag))

    @Test fun totalsAreExactTheBudgetSaysItIsNotAPaymentAndDeletingAsksFirst() {
        var state by mutableStateOf(BudgetState(accountId = accountId, eventId = eventId, budget = budget))
        var records = 0
        var deletes = 0
        val actions = BudgetActions(
            amount = { state = state.copy(amount = it) }, note = { state = state.copy(note = it) }, category = { state = state.copy(categoryId = it) },
            record = { records += 1 }, askDelete = { state = state.copy(confirmDelete = it) }, keep = { state = state.copy(confirmDelete = null) },
            delete = { deletes += 1 },
        )
        compose.setContent { CommunityTheme { EventsScreen(events, EventsActions(), "Morgan family", state, actions) } }
        reveal("budget-not-payment")
        compose.onNodeWithTag("budget-not-payment").assertTextEquals("Recording an expense is not a payment. Nothing is collected or owed here.")
        reveal("budget-planned")
        compose.onNodeWithTag("budget-planned").assertTextEquals("Planned: ${money(650_050)}")
        compose.onNodeWithTag("budget-recorded").assertTextEquals("Recorded: ${money(30)}")
        compose.onNodeWithTag("budget-remaining").assertTextEquals("Left: ${money(650_020)}")
        reveal(hasText("Food: planned ${money(150_000)}, recorded ${money(30)}, ${money(149_970)} left"))

        reveal("budget-amount")
        compose.onNodeWithTag("budget-amount").performTextInput("0.10")
        reveal("budget-category-$foodId")
        compose.onNodeWithTag("budget-category-$foodId").performClick().assertIsSelected()
        reveal("budget-note")
        compose.onNodeWithTag("budget-note").performTextInput("Tea")
        reveal("budget-record-button")
        compose.onNodeWithTag("budget-record-button").performClick()
        compose.runOnIdle { assertEquals(Triple("0.10", foodId, "Tea"), Triple(state.amount, state.categoryId, state.note)); assertEquals(1, records) }

        val milk = hasContentDescription("Delete expense ${money(20)}: Milk")
        reveal(milk)
        compose.onNode(milk).performClick()
        reveal("budget-delete-text")
        compose.onNodeWithTag("budget-delete-text").assertTextEquals("Delete the expense of ${money(20)} for everyone? Expenses cannot be edited; record it again if needed.")
        reveal("budget-delete-keep")
        compose.onNodeWithTag("budget-delete-keep").performClick()
        compose.onNodeWithTag("budget-delete-text").assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, deletes) }
        reveal(milk)
        compose.onNode(milk).performClick()
        reveal("budget-delete-confirm")
        compose.onNodeWithTag("budget-delete-confirm").performClick()
        compose.runOnIdle { assertEquals(1, deletes) }

        // Going over shows how much over, not a negative amount.
        compose.runOnIdle { state = state.copy(confirmDelete = null, budget = budget.copy(
            expenses = budget.expenses + ExpenseDto(venueId.replace('a', 'b'), 3_000_000, null, "Catering", "Sam Example", "2026-10-02T10:03:00Z", false, true),
            recordedMinor = 3_000_030, uncategorizedMinor = 3_000_000, remainingMinor = 650_050 - 3_000_030,
        )) }
        reveal("budget-remaining")
        compose.onNodeWithTag("budget-remaining").assertTextEquals("Over by ${money(3_000_030 - 650_050)}")
        reveal(hasText("Recorded without a category: ${money(3_000_000)}"))
    }

    @Test fun aMemberSeesNoPlanControlsAndACancelledEventOnlyReads() {
        var state by mutableStateOf(BudgetState(accountId = accountId, eventId = eventId, budget = budget.copy(canManage = false, etag = null,
            expenses = budget.expenses.map { it.copy(canDelete = it.mine) })))
        compose.setContent { CommunityTheme { EventsScreen(events, EventsActions(), "Morgan family", state, BudgetActions()) } }
        reveal("budget-record")
        compose.onNodeWithTag("budget-open-plan").assertDoesNotExist()
        reveal(hasContentDescription("Delete expense ${money(10)}: Bread"))
        compose.onNode(hasContentDescription("Delete expense ${money(20)}: Milk")).assertDoesNotExist()
        compose.runOnIdle { state = state.copy(budget = state.budget!!.copy(canRecord = false, expenses = budget.expenses.map { it.copy(canDelete = false) })) }
        reveal(hasText("Bread"))
        compose.onNodeWithTag("budget-record").assertDoesNotExist()
        compose.onNodeWithTag("budget-delete").assertDoesNotExist()
    }

    // The plan, the expense form and a delete question, in English, Telugu and Hindi, which are longer and taller.
    @DeviceFontScale(2f)
    @Test fun thePlanExpensesAndDeleteQuestionFitAt320DpAnd200PercentTextInEveryLanguage() {
        assertNarrowScreen()
        fun text(language: String, id: Int) = target.createConfigurationContext(
            Configuration(target.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) },
        ).getString(id)
        val long = budget.copy(categories = listOf(
            BudgetCategoryDto(foodId, "Food, sweets and drinks for the evening after the ceremony", 150_000, 30, 149_970),
            BudgetCategoryDto(venueId, "Venue", 500_050, 0, 500_050),
        ), expenses = budget.expenses.map { it.copy(note = "Snacks and tea for everyone who helped set up the chairs, the stage and the lights") })
        val plan = PlanDraft("\"budget-2\"", "INR", long.categories.map { PlanRow(it.id, it.name, minorText(it.estimateMinor)) })
        var language by mutableStateOf("en")
        var state by mutableStateOf(BudgetState(accountId = accountId, eventId = eventId, budget = long, plan = plan))
        compose.setContent { CommunityTheme { InLanguage(language) { EventsScreen(events, EventsActions(), "Morgan family", state, BudgetActions()) } } }
        for (current in listOf("en", "te", "hi")) {
            compose.runOnIdle { language = current; state = state.copy(plan = plan, confirmDelete = null) }
            reveal(hasText(text(current, R.string.budget_title)))
            reveal("budget-not-payment")
            compose.assertTextNotClipped(hasTestTag("budget-not-payment"))
            val line = hasText(text(current, R.string.budget_category).format(long.categories[0].name, money(150_000, current), money(30, current), money(149_970, current)))
            compose.assertReachable("events-content", line)
            compose.assertTextNotClipped(line)
            for (tag in listOf("budget-currency-INR", "budget-category-name-0", "budget-category-estimate-0", "budget-category-remove-1", "budget-add-category",
                "budget-save", "budget-close-plan", "budget-amount", "budget-category-$foodId", "budget-note", "budget-record-button")) {
                compose.assertReachable("events-content", tag)
            }
            for (tag in listOf("budget-add-category", "budget-save", "budget-record-button")) compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
            compose.onRoot().saveEvidence("events-budget-$current-large-text.png")
            compose.runOnIdle { state = state.copy(plan = null, confirmDelete = milkId) }
            compose.assertReachable("events-content", "budget-delete-text")
            compose.assertTextNotClipped(hasTestTag("budget-delete-text"))
            for (tag in listOf("budget-delete-confirm", "budget-delete-keep")) {
                compose.assertReachable("events-content", tag)
                compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
            }
            compose.onRoot().saveEvidence("events-budget-delete-$current-large-text.png")
        }
        compose.onNodeWithText(text("hi", R.string.budget_delete_confirm)).assertHeightIsAtLeast(48.dp)
    }

    // DEC-041 (T173): contributions people record for themselves, kept apart from spending.
    private val giftId = "c3d4e5f6-2a3b-4c4d-9e5f-6a7b8c9d0e12"
    private val ownGiftId = "d4e5f6a7-3b4c-4d5e-8f6a-7b8c9d0e1f23"
    private val gifts = budget.copy(
        contributions = listOf(
            ContributionDto(giftId, 50_000, "given", "Riya: lamps and flowers for the hall, given in cash to Sam on Friday evening", "Riya Venkataraman-Subramanian", "2026-10-02T10:04:00Z", mine = false, canChange = false),
            ContributionDto(ownGiftId, 2_550, "promised", null, "Alex Example", "2026-10-02T10:03:00Z", mine = true, canChange = true),
        ),
        allContributions = true, givenMinor = 50_000, promisedMinor = 2_550, contributionCount = 2,
    )

    @Test fun contributionsAreKeptApartAndOnlyOnesOwnCanBeMarkedOrWithdrawn() {
        var state by mutableStateOf(BudgetState(accountId = accountId, eventId = eventId, budget = gifts))
        var contributed = 0
        val marks = mutableListOf<Pair<String, String>>()
        var withdrawals = 0
        val actions = BudgetActions(
            giftAmount = { state = state.copy(giftAmount = it) }, giftState = { state = state.copy(giftState = it) }, giftNote = { state = state.copy(giftNote = it) },
            contribute = { contributed += 1 }, mark = { id, value -> marks += id to value },
            askWithdraw = { state = state.copy(confirmWithdraw = it) }, keepGift = { state = state.copy(confirmWithdraw = null) }, withdraw = { withdrawals += 1 },
        )
        compose.setContent { CommunityTheme { EventsScreen(events, EventsActions(), "Morgan family", state, actions) } }
        reveal("budget-given")
        compose.onNodeWithTag("budget-given").assertTextEquals("Given: ${money(50_000)}")
        compose.onNodeWithTag("budget-promised").assertTextEquals("Promised: ${money(2_550)}")
        compose.onNodeWithTag("budget-contribution-count").assertTextEquals("Contributions recorded: 2")
        compose.onNodeWithTag("budget-recorded").assertTextEquals("Recorded: ${money(30)}")
        reveal("budget-gift-amount")
        compose.onNodeWithTag("budget-gift-amount").performTextInput("25")
        reveal("budget-gift-state-given")
        compose.onNodeWithTag("budget-gift-state-given").performClick().assertIsSelected()
        reveal("budget-gift-note")
        compose.onNodeWithTag("budget-gift-note").performTextInput("Flowers")
        reveal("budget-contribute-button")
        compose.onNodeWithTag("budget-contribute-button").performClick()
        compose.runOnIdle { assertEquals(Triple("25", "given", "Flowers"), Triple(state.giftAmount, state.giftState, state.giftNote)); assertEquals(1, contributed) }

        // Someone else's contribution has no controls; one's own is marked, or withdrawn after a question.
        compose.onNode(hasContentDescription("Withdraw your contribution of ${money(50_000)}")).assertDoesNotExist()
        val mark = hasContentDescription("Mark your contribution of ${money(2_550)} as given")
        reveal(mark)
        compose.onNode(mark).performClick()
        compose.runOnIdle { assertEquals(listOf(ownGiftId to "given"), marks) }
        val withdraw = hasContentDescription("Withdraw your contribution of ${money(2_550)}")
        reveal(withdraw)
        compose.onNode(withdraw).performClick()
        reveal("budget-withdraw-text")
        compose.onNodeWithTag("budget-withdraw-text").assertTextEquals("Withdraw your contribution of ${money(2_550)}? It leaves the totals; record it again if needed.")
        reveal("budget-withdraw-keep")
        compose.onNodeWithTag("budget-withdraw-keep").performClick()
        compose.onNodeWithTag("budget-withdraw-text").assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, withdrawals) }
        reveal(withdraw)
        compose.onNode(withdraw).performClick()
        reveal("budget-withdraw-confirm")
        compose.onNodeWithTag("budget-withdraw-confirm").performClick()
        compose.runOnIdle { assertEquals(1, withdrawals) }

        // A member sees the totals and only their own, and is told who else can see them.
        compose.runOnIdle { state = state.copy(confirmWithdraw = null, budget = gifts.copy(canManage = false, etag = null,
            contributions = gifts.contributions.filter { it.mine }, allContributions = false)) }
        reveal("budget-contributions-private")
        compose.onNodeWithTag("budget-contributions-private").assertTextEquals("Only you, the organizer and the Space owner see your contributions. Others see only the totals.")
        compose.onNode(hasText("Riya: lamps", substring = true)).assertDoesNotExist()
    }

    @DeviceFontScale(2f)
    @Test fun contributionsFitAt320DpAnd200PercentTextInEveryLanguage() {
        assertNarrowScreen()
        fun text(language: String, id: Int) = target.createConfigurationContext(
            Configuration(target.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) },
        ).getString(id)
        var language by mutableStateOf("en")
        var state by mutableStateOf(BudgetState(accountId = accountId, eventId = eventId, budget = gifts))
        compose.setContent { CommunityTheme { InLanguage(language) { EventsScreen(events, EventsActions(), "Morgan family", state, BudgetActions()) } } }
        for (current in listOf("en", "te", "hi")) {
            compose.runOnIdle { language = current; state = state.copy(confirmWithdraw = null) }
            reveal("budget-contributions")
            compose.onNodeWithTag("budget-given").assertTextEquals(text(current, R.string.budget_given).format(money(50_000, current)))
            val note = hasText("Riya: lamps", substring = true)
            compose.assertReachable("events-content", note)
            compose.assertTextNotClipped(note)
            for (tag in listOf("budget-gift-amount", "budget-gift-state-promised", "budget-gift-state-given", "budget-gift-note", "budget-contribute-button", "budget-mark", "budget-withdraw")) {
                compose.assertReachable("events-content", tag)
            }
            for (tag in listOf("budget-contribute-button", "budget-mark", "budget-withdraw")) compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
            compose.onRoot().saveEvidence("events-contributions-$current-large-text.png")
            compose.runOnIdle { state = state.copy(confirmWithdraw = ownGiftId) }
            compose.assertReachable("events-content", "budget-withdraw-text")
            compose.assertTextNotClipped(hasTestTag("budget-withdraw-text"))
            for (tag in listOf("budget-withdraw-confirm", "budget-withdraw-keep")) {
                compose.assertReachable("events-content", tag)
                compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
            }
            compose.onRoot().saveEvidence("events-contributions-withdraw-$current-large-text.png")
        }
    }

    // DEC-042 (T174): a split shows how the cost is divided and the rounding; the editor fits at 320 dp / 200%.
    private val samId = "b3c4d5e6-4f5a-4b6c-8d7e-9f0a1b2c3d4e"

    @DeviceFontScale(2f)
    @Test fun theSplitAndItsEditorFitAt320DpAnd200PercentTextInEveryLanguage() {
        assertNarrowScreen()
        fun text(language: String, id: Int) = target.createConfigurationContext(
            Configuration(target.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) },
        ).getString(id)
        val split = SplitDto("percentages", "planned", 650_050, 2, listOf(
            SplitShareDto(accountId, "Alex Example", true, 3_333, 216_662, true),
            SplitShareDto(samId, "Saraswati Venkataraman-Subramanian", false, 6_667, 433_388, false),
        ), true, 650_050, 0, 1)
        val withSplit = budget.copy(split = split, splitCandidates = listOf(SplitCandidateDto(accountId, "Alex Example"), SplitCandidateDto(samId, "Saraswati Venkataraman-Subramanian")))
        val draft = SplitDraft("\"budget-2\"", "percentages", "planned", listOf(accountId to "33.33", samId to "66.67"))
        var language by mutableStateOf("en")
        var state by mutableStateOf(BudgetState(accountId = accountId, eventId = eventId, budget = withSplit))
        compose.setContent { CommunityTheme { InLanguage(language) { EventsScreen(events, EventsActions(), "Morgan family", state, BudgetActions()) } } }
        for (current in listOf("en", "te", "hi")) {
            compose.runOnIdle { language = current; state = state.copy(split = null) }
            compose.assertReachable("events-content", "split-method")
            compose.onNodeWithTag("split-method").assertTextEquals(text(current, R.string.split_percentages).format(text(current, R.string.split_base_planned), money(650_050, current)))
            compose.assertTextNotClipped(hasTestTag("split-not-bill"))
            compose.assertReachable("events-content", "split-rounding")
            compose.assertTextNotClipped(hasTestTag("split-rounding"))
            for (tag in listOf("split-open", "split-remove")) {
                compose.assertReachable("events-content", tag)
                compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
            }
            compose.onRoot().saveEvidence("events-split-$current-large-text.png")
            compose.runOnIdle { state = state.copy(split = draft) }
            for (tag in listOf("split-method-amounts", "split-base-recorded", "split-person-$samId", "split-value-$samId", "split-save", "split-close")) {
                compose.assertReachable("events-content", tag)
            }
            for (tag in listOf("split-person-$samId", "split-save", "split-close")) compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
            compose.onRoot().saveEvidence("events-split-editor-$current-large-text.png")
        }
    }
}
