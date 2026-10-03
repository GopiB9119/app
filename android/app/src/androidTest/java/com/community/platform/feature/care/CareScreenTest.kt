package com.community.platform.feature.care

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasProgressBarRangeInfo
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.community.platform.CommunityTheme
import com.community.platform.feature.assertInside
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextEndReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.saveEvidence
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/** The Medicines screen built from synthetic state; the callbacks stand in for the view model. */
@RunWith(AndroidJUnit4::class)
class CareScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val medicineId = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b"
    private val today = "2026-10-02"
    private val medicine = CareInstructionDto(
        medicineId, "Metformin", "500 mg", "tablet", "1 tablet", "With breakfast", "prescriber", "Asia/Kolkata", listOf("08:00"),
        "2026-10-01", null, "active", 1, accountId, "2026-10-01T03:00:00Z", "2026-10-01T03:00:00Z", null, "\"instruction-1\"",
    )
    private val summary = CareDayInstructionDto(medicineId, "Metformin", "500 mg", "tablet", "1 tablet", "active")
    private val dose = CareOccurrenceDto(medicineId, today, "08:00", "08:00", "Asia/Kolkata", "2026-10-02T02:30:00Z", "none", null, true, "\"dose-1\"")
    private val loading = hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)

    private fun day(vararg doses: CareOccurrenceDto) = CareDayDto(today, listOf(summary), doses.toList(), emptyList())
    private fun state(plan: CareDayDto? = day(dose)) = CareState(
        accountId = accountId, timezone = "Asia/Kolkata", today = today, date = today, day = plan,
        draft = CareDraft(timezone = "Asia/Kolkata", startDate = today),
    )
    // A list scroll only reaches the item; the form is one tall item, so the node itself is then scrolled into view.
    private fun reveal(tag: String) {
        compose.onNodeWithTag("care-content").performScrollToNode(hasTestTag(tag))
        compose.onNodeWithTag(tag).performScrollTo()
    }

    @Test fun dayPlanShowsLoadingEmptyErrorAndDoseStates() {
        var current by mutableStateOf(state(plan = null).copy(loading = true))
        var reloads = 0
        compose.setContent { CommunityTheme { CareScreen(current, CareActions(reload = { reloads += 1 })) } }
        compose.onNode(loading).assertExists()
        compose.onNodeWithContentDescription("Refresh medicines").assertIsNotEnabled()
        reveal("care-date")
        compose.onNodeWithTag("care-day-empty").assertDoesNotExist()
        compose.onNodeWithTag("care-dose").assertDoesNotExist()

        compose.runOnIdle { current = state(plan = day()) }
        compose.onNode(loading).assertDoesNotExist()
        reveal("care-day-empty")
        compose.onNodeWithTag("care-day-empty").assertTextEquals("Nothing is scheduled for this day. Add a medicine under My medicines.")

        compose.runOnIdle { current = state(plan = null).copy(error = "No connection. Nothing new is confirmed.") }
        reveal("care-error")
        compose.onNodeWithTag("care-error").assertTextEquals("No connection. Nothing new is confirmed.")
        reveal("care-date")
        compose.onNodeWithTag("care-day-empty").assertDoesNotExist()
        compose.onNodeWithContentDescription("Refresh medicines").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, reloads) }

        compose.runOnIdle { current = state() }
        reveal("care-date")
        compose.onNodeWithTag("care-error").assertDoesNotExist()
        compose.onNodeWithTag("care-date").assertTextContains("(today)", substring = true)
        reveal("care-dose-status")
        compose.onNodeWithText("Metformin 500 mg (tablet)").assertIsDisplayed()
        compose.onNodeWithText("1 tablet").assertIsDisplayed()
        compose.onNodeWithTag("care-dose-status").assertTextEquals("Not noted")
        compose.onNodeWithTag("care-taken").assertIsEnabled().assertIsNotSelected()
        compose.onNodeWithTag("care-skipped").assertIsEnabled().assertIsNotSelected()
    }

    @Test fun medicineListsShowEmptyCurrentAndStoppedStates() {
        var current by mutableStateOf(state().copy(view = CareView.MEDICINES))
        val shown = mutableListOf<Boolean>()
        compose.setContent { CommunityTheme { CareScreen(current, CareActions(showMedicines = { shown += it })) } }
        reveal("care-medicines-empty")
        compose.onNodeWithTag("care-medicines-empty").assertTextEquals("No current medicines. Add one exactly as written on your instructions.")
        compose.onNodeWithTag("care-current").assertIsSelected()
        compose.onNodeWithTag("care-stopped").assertIsNotSelected().performClick()
        compose.runOnIdle {
            assertEquals(listOf(true), shown)
            current = current.copy(stopped = true, instructions = listOf(medicine.copy(status = "stopped", stoppedAt = "2026-10-05T04:00:00Z", version = 2)))
        }
        reveal("care-medicine")
        compose.onNodeWithText("Stopped on", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("care-stop").assertDoesNotExist()
        compose.onNodeWithText("The most recent 20 stopped medicines are shown.").assertIsDisplayed()
        compose.runOnIdle { current = current.copy(instructions = emptyList()) }
        reveal("care-medicines-empty")
        compose.onNodeWithTag("care-medicines-empty").assertTextEquals("No stopped medicines.")
    }

    @Test fun notingADoseSendsOnlyTheTappedChoiceAndShowsItOnlyOnceConfirmed() {
        var current by mutableStateOf(state())
        val reports = mutableListOf<Pair<CareOccurrenceDto, String>>()
        val actions = CareActions(report = { occurrence, outcome ->
            reports += occurrence to outcome
            current = current.copy(working = true, pendingReport = CareReportIntent(accountId, "note-key", occurrence, outcome))
        })
        compose.setContent { CommunityTheme { CareScreen(current, actions) } }
        reveal("care-taken")
        compose.onNodeWithTag("care-taken").performClick()
        compose.runOnIdle { assertEquals(listOf(dose to "taken"), reports) }
        // While the answer is pending the dose is not shown as noted, and neither choice can be sent again.
        compose.onNodeWithTag("care-dose-status").assertTextEquals("Not noted")
        compose.onNodeWithTag("care-taken").assertIsNotSelected().assertIsNotEnabled().performClick()
        compose.onNodeWithTag("care-skipped").assertIsNotEnabled().performClick()
        compose.onNodeWithTag("care-back").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(1, reports.size) }

        val noted = dose.copy(report = CareReportDto("taken", 1, "2026-10-02T02:40:00Z", "2026-10-02T02:40:00Z"), etag = "\"dose-2\"")
        compose.runOnIdle { current = current.copy(working = false, pendingReport = null, day = day(noted)) }
        compose.onNodeWithTag("care-dose-status").assertTextEquals("You noted: Taken")
        compose.onNodeWithTag("care-taken").assertIsSelected().assertIsNotEnabled()
        compose.onNodeWithTag("care-skipped").assertIsEnabled().assertTextEquals("Change to Skipped")
    }

    @Test fun aLostDoseNoteIsNeverShownAsNotedAndChoosingAgainRetriesIt() {
        val pending = CareReportIntent(accountId, "original-note-key", dose, "taken")
        val current = state().copy(pendingReport = pending, error = "Your note is not confirmed. Choose it again to retry; it cannot be saved twice.")
        val reports = mutableListOf<Pair<CareOccurrenceDto, String>>()
        compose.setContent { CommunityTheme { CareScreen(current, CareActions(report = { occurrence, outcome -> reports += occurrence to outcome })) } }
        reveal("care-error")
        compose.onNodeWithTag("care-error").assertTextEquals("Your note is not confirmed. Choose it again to retry; it cannot be saved twice.")
        reveal("care-dose-status")
        compose.onNodeWithTag("care-dose-status").assertTextEquals("Not noted")
        compose.onNodeWithTag("care-skipped").assertTextEquals("Skipped")
        compose.onNodeWithTag("care-taken").assertTextEquals("Taken").assertIsNotSelected().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf(dose to "taken"), reports) }
    }

    @Test fun aCommandInFlightDisablesEveryCareControl() {
        var current by mutableStateOf(state().copy(working = true))
        val calls = mutableListOf<String>()
        val actions = CareActions(
            back = { calls += "back" }, reload = { calls += "reload" }, showDay = { calls += "day" }, showMedicines = { calls += "medicines" },
            move = { calls += "move" }, today = { calls += "today" }, report = { _, _ -> calls += "report" }, startAdd = { calls += "add" },
            askStop = { calls += "stop" },
        )
        compose.setContent { CommunityTheme { CareScreen(current, actions) } }
        compose.onNodeWithTag("care-back").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Refresh medicines").assertIsNotEnabled().performClick()
        for (tag in listOf("care-show-day", "care-show-medicines", "care-previous", "care-next", "care-taken", "care-skipped")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsNotEnabled().performClick()
        }
        compose.runOnIdle { current = current.copy(view = CareView.MEDICINES, instructions = listOf(medicine)) }
        for (tag in listOf("care-current", "care-stopped", "care-add", "care-stop")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsNotEnabled().performClick()
        }
        compose.runOnIdle { assertTrue(calls.toString(), calls.isEmpty()) }
    }

    @Test fun stopTrackingAsksFirstAndKeepItSendsNothing() {
        var current by mutableStateOf(state().copy(view = CareView.MEDICINES, instructions = listOf(medicine)))
        val stops = mutableListOf<String>()
        val actions = CareActions(
            askStop = { current = current.copy(confirmingStop = it) },
            keep = { current = current.copy(confirmingStop = null) },
            stop = { stops += current.confirmingStop?.id ?: "without confirmation"; current = current.copy(confirmingStop = null) },
        )
        compose.setContent { CommunityTheme { CareScreen(current, actions) } }
        reveal("care-stop")
        compose.onNodeWithTag("care-stop").assertTextEquals("Stop tracking").performClick()
        compose.onNodeWithText("Stop tracking this medicine?").assertIsDisplayed()
        compose.onNodeWithText("Stop tracking Metformin?", substring = true).assertIsDisplayed()
        compose.runOnIdle { assertTrue(stops.isEmpty()) }
        compose.onNodeWithTag("care-stop-keep").assertTextEquals("Keep it").performClick()
        compose.onNodeWithText("Stop tracking this medicine?").assertDoesNotExist()
        compose.runOnIdle { assertTrue(stops.isEmpty()); assertNull(current.confirmingStop) }
        compose.onNodeWithTag("care-stop").performClick()
        compose.onNodeWithTag("care-stop-confirm").assertTextEquals("Yes, stop tracking").performClick()
        compose.runOnIdle { assertEquals(listOf(medicineId), stops) }
    }

    @Test fun aLostStopAnswerKeepsTheMedicineCurrentAndStopCanBeAskedAgain() {
        val current = state().copy(
            view = CareView.MEDICINES, instructions = listOf(medicine), pendingStop = medicineId to "original-stop-key",
            error = "The stop is not confirmed. Choose Stop tracking again to retry.",
        )
        val asked = mutableListOf<CareInstructionDto>()
        compose.setContent { CommunityTheme { CareScreen(current, CareActions(askStop = { asked += it })) } }
        reveal("care-error")
        compose.onNodeWithTag("care-error").assertTextEquals("The stop is not confirmed. Choose Stop tracking again to retry.")
        compose.onNodeWithTag("care-notice").assertDoesNotExist()
        reveal("care-stop")
        compose.onNodeWithText("Stopped on", substring = true).assertDoesNotExist()
        compose.onNodeWithTag("care-current").assertIsSelected()
        compose.onNodeWithTag("care-stop").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf(medicine), asked) }
    }

    @Test fun anUnconfirmedSaveLocksTheFormAndOffersOnlyRetryOrCheckingTheList() {
        val draft = CareDraft("Metformin", "500 mg", "tablet", "1 tablet", "With breakfast", "prescriber", listOf("08:00"), "Asia/Kolkata", today, "", true)
        val intent = CareCreateIntent(accountId, "original-create-key", careBody(draft))
        var current by mutableStateOf(state().copy(view = CareView.ADD, draft = draft, pendingCreate = intent, error = "Not confirmed. Retry sends the same medicine; it cannot be saved twice."))
        var retries = 0
        var discards = 0
        var saves = 0
        val drafts = mutableListOf<CareDraft>()
        val actions = CareActions(retry = { retries += 1 }, discard = { discards += 1 }, save = { saves += 1 }, draft = { drafts += it(current.draft) })
        compose.setContent { CommunityTheme { CareScreen(current, actions) } }
        reveal("care-error")
        compose.onNodeWithTag("care-error").assertTextEquals("Not confirmed. Retry sends the same medicine; it cannot be saved twice.")
        compose.onNodeWithTag("care-notice").assertDoesNotExist()
        reveal("care-name")
        compose.onNodeWithTag("care-name").assertIsNotEnabled().assertTextContains("Metformin")
        reveal("care-dose-field")
        compose.onNodeWithTag("care-dose-field").assertIsNotEnabled().assertTextContains("1 tablet")
        reveal("care-source-prescriber")
        compose.onNodeWithTag("care-source-prescriber").assertIsNotEnabled().assertIsSelected()
        reveal("care-confirm")
        compose.onNodeWithTag("care-confirm").assertIsNotEnabled().assertIsOn().performClick()
        reveal("care-retry")
        compose.onNodeWithTag("care-save").assertDoesNotExist()
        compose.onNodeWithTag("care-retry").assertTextEquals("Retry").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(0, saves); assertTrue(drafts.isEmpty()) }

        // The retry is in flight: neither choice can be sent a second time and the screen cannot be left.
        compose.runOnIdle { current = current.copy(working = true, error = null) }
        compose.onNodeWithTag("care-retry").assertIsNotEnabled()
        compose.onNodeWithTag("care-discard").assertIsNotEnabled()
        compose.onNodeWithTag("care-back").assertIsNotEnabled()
        compose.runOnIdle { current = current.copy(working = false) }
        compose.onNodeWithTag("care-discard").assertTextEquals("Close and check the list").performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(1, discards); assertEquals(intent, current.pendingCreate) }
    }

    @Test fun savingNeedsTheConfirmationTickAndKeepsTheDraftAsEntered() {
        var current by mutableStateOf(state().copy(view = CareView.ADD))
        var saves = 0
        val actions = CareActions(
            draft = { change -> current = current.copy(draft = change(current.draft), problem = null) },
            save = { saves += 1; current = current.copy(problem = careProblem(current.draft)) },
        )
        compose.setContent { CommunityTheme { CareScreen(current, actions) } }
        reveal("care-name")
        compose.onNodeWithTag("care-name").performTextReplacement("Metformin")
        reveal("care-dose-field")
        compose.onNodeWithTag("care-dose-field").performTextReplacement("1 tablet")
        reveal("care-source-prescriber")
        compose.onNodeWithTag("care-source-prescriber").performClick().assertIsSelected()
        reveal("care-time-0")
        compose.onNodeWithTag("care-time-0").performTextReplacement("08:00")
        reveal("care-confirm")
        compose.onNodeWithTag("care-confirm").assertIsOff()
        reveal("care-save")
        compose.onNodeWithTag("care-save").performClick()
        reveal("care-problem")
        compose.onNodeWithTag("care-problem").assertTextEquals("Confirm that these details match your instructions.")
        reveal("care-confirm")
        compose.onNodeWithTag("care-confirm").performClick().assertIsOn()
        compose.onNodeWithTag("care-problem").assertDoesNotExist()
        compose.runOnIdle {
            assertEquals(1, saves)
            assertEquals(CareDraft(name = "Metformin", dose = "1 tablet", source = "prescriber", times = listOf("08:00"), timezone = "Asia/Kolkata", startDate = today, confirmed = true), current.draft)
        }
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        val draft = CareDraft("Metformin", "500 mg", "tablet", "1 tablet", "With breakfast", "prescriber", listOf("08:00"), "Asia/Kolkata", today, "", true)
        val lost = "Not confirmed. Retry sends the same medicine; it cannot be saved twice."
        var current by mutableStateOf(state().copy(view = CareView.ADD, draft = draft))
        val actions = CareActions(save = { current = current.copy(pendingCreate = CareCreateIntent(accountId, "original-create-key", careBody(current.draft)), error = lost) })
        compose.setContent { CommunityTheme { CareScreen(current, actions) } }
        reveal("care-save")
        compose.onNodeWithTag("care-save").performClick()
        // The answer was lost: the message is the list's first item, far above the button that was pressed.
        compose.onNodeWithTag("care-error").assertIsDisplayed().assertTextEquals(lost)
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsDosesMedicinesAndTheStopQuestionUsable() {
        assertNarrowScreen()
        val name = "Metformin hydrochloride extended release"
        var current by mutableStateOf(state(plan = CareDayDto(today, listOf(summary.copy(medicineName = name)), listOf(dose), emptyList())))
        compose.setContent { CommunityTheme { CareScreen(current, CareActions(askStop = { current = current.copy(confirmingStop = it) }, keep = { current = current.copy(confirmingStop = null) })) } }
        for (tag in listOf("care-show-day", "care-show-medicines", "care-previous", "care-next", "care-date", "care-taken", "care-skipped")) compose.assertReachable("care-content", tag)
        compose.assertTextNotClipped(hasTestTag("care-date"))
        compose.assertTextNotClipped(hasText("$name 500 mg (tablet)"))
        compose.assertTextNotClipped(hasTestTag("care-dose-status"))
        compose.assertTextNotClipped(hasText("Taken") and hasAnyAncestor(hasTestTag("care-taken")))
        compose.onRoot().saveEvidence("care-day-native-large-text.png")

        compose.runOnIdle { current = current.copy(view = CareView.MEDICINES, instructions = listOf(medicine.copy(medicineName = name))) }
        for (tag in listOf("care-current", "care-stopped", "care-add", "care-stop")) compose.assertReachable("care-content", tag)
        compose.assertTextNotClipped(hasText("Stop tracking") and hasAnyAncestor(hasTestTag("care-stop")))
        compose.onNodeWithTag("care-stop").performClick()
        compose.onNode(isDialog()).saveEvidence("care-stop-native-large-text.png")
        compose.assertInside(isDialog(), hasTestTag("care-stop-keep"))
        compose.assertInside(isDialog(), hasTestTag("care-stop-confirm"))
        compose.assertTextNotClipped(hasText("Stop tracking this medicine?"))
        compose.assertTextNotClipped(hasText("Stop tracking $name?", substring = true))
        compose.onNode(hasText("Stop tracking $name?", substring = true)).performScrollTo().assertIsDisplayed()
        compose.assertTextEndReachable(hasText("Stop tracking $name?", substring = true))
        compose.onNode(isDialog()).saveEvidence("care-stop-native-large-text-end.png")
        compose.onNodeWithTag("care-stop-keep").performClick()

        compose.runOnIdle { current = current.copy(view = CareView.ADD) }
        compose.assertReachable("care-content", "care-confirm")
        compose.assertReachable("care-content", "care-save")
    }
}
