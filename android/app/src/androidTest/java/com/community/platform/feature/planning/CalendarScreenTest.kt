package com.community.platform.feature.planning

import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasProgressBarRangeInfo
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.community.platform.CommunityTheme
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.saveEvidence
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/**
 * The month calendar built from synthetic state; the callbacks stand in for the view model. It only reads, so there is
 * nothing to confirm. Space events in the calendar belong to the unrecorded alerts work (X2, conflict C10) and are left out.
 */
@RunWith(AndroidJUnit4::class)
class CalendarScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val space = FamilySpaceDto("c2937183-70fb-4d7a-b0b6-b1bc9c499444", "Morgan family", "owner")
    private val other = FamilySpaceDto("0f97b948-9800-432f-9d15-407df739d08e", "Walking group", "member")
    private val due = CalendarEntryDto("c2302436-0dd7-4d99-a7c3-ead390fd08eb", "task", "c2302436-0dd7-4d99-a7c3-ead390fd08eb", space.id, "Buy groceries", "2026-10-05", null, null, "open", false)
    private val reminder = CalendarEntryDto("81a09cbf-901e-470c-a905-27d565be91ae", "reminder", "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a", space.id, "Call the plumber", "2026-10-06", "2026-10-06T03:30:00Z", "Asia/Kolkata", "scheduled", false)
    private val planned = CalendarEntryDto("4b7a1d0e-34c5-4d7f-9a2b-1c3d5e7f9a0b", "planned", "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f", space.id, "Water the plants", "2026-10-07", "2026-10-07T04:30:00Z", "Asia/Kolkata", "planned", false, "5d2c8f3a-1b4e-4c6d-9e7f-0a1b2c3d4e5f")
    private val month = YearMonth.of(2026, 10)
    private val monthTitle = month.format(DateTimeFormatter.ofPattern("MMMM uuuu"))
    private val loading = hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)

    private fun shownDate(entry: CalendarEntryDto) = LocalDate.parse(entry.date).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))
    private fun shownTime(entry: CalendarEntryDto) = DateTimeFormatter.ofPattern("HH:mm O").format(Instant.parse(entry.scheduledAt!!).atZone(ZoneId.of("Asia/Kolkata")))

    private fun state() = CalendarState(accountId = accountId, profileTimezone = "Asia/Kolkata", timezone = "Asia/Kolkata", month = month, spaces = listOf(space, other), selectedSpace = space)
    private fun actions(
        refresh: () -> Unit = {}, space: (String) -> Unit = {}, month: (YearMonth) -> Unit = {}, zone: (String) -> Unit = {},
        more: () -> Unit = {}, moreSpaces: () -> Unit = {},
    ) = CalendarActions(refresh, space, month, zone, more, moreSpaces)
    private fun reveal(text: String) {
        compose.onNodeWithTag("calendar-workspace").performScrollToNode(hasText(text))
        compose.onNode(hasText(text)).performScrollTo()
    }

    @Test fun loadingHidesEntriesAndEveryControlWaits() {
        val calls = mutableListOf<String>()
        val busy = state().copy(busy = true, loaded = true, entries = listOf(due), nextCursor = "synthetic-next", spaceCursor = "synthetic-spaces")
        val callbacks = actions(
            refresh = { calls += "refresh" }, space = { calls += "space" }, month = { calls += "month" }, zone = { calls += "zone" },
            more = { calls += "more" }, moreSpaces = { calls += "spaces" },
        )
        compose.setContent { CommunityTheme { CalendarScreen(busy, callbacks, {}, { calls += "open" }) } }
        compose.onNode(loading).assertExists()
        for (description in listOf("Refresh calendar", "Display timezone", "Previous month", "Choose month", "Next month")) {
            compose.onNodeWithContentDescription(description).assertIsNotEnabled().performClick()
        }
        compose.onNodeWithText("Morgan family").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Today").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Load more Spaces").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Buy groceries").assertDoesNotExist()
        compose.onNodeWithText("Load more entries").assertDoesNotExist()
        compose.onNodeWithText("No tasks or reminders for this month.").assertDoesNotExist()
        compose.runOnIdle { assertTrue(calls.toString(), calls.isEmpty()) }
    }

    @Test fun emptyStatesSayWhetherASpaceOrAnEntryIsMissing() {
        var current by mutableStateOf(CalendarState(accountId = accountId, profileTimezone = "Asia/Kolkata", timezone = "Asia/Kolkata", month = month, loaded = true))
        compose.setContent { CommunityTheme { CalendarScreen(current, actions(), {}, {}) } }
        compose.onNodeWithText("No family Spaces yet.").assertIsDisplayed()
        compose.onNodeWithText("Select a family Space").assertIsNotEnabled()
        compose.runOnIdle { current = state().copy(loaded = true) }
        compose.onNodeWithText("No tasks or reminders for this month.").assertIsDisplayed()
        compose.onNodeWithText("Morgan family").assertIsEnabled()
        compose.onNodeWithText(monthTitle).assertIsDisplayed()
    }

    @Test fun aFailedLoadShowsTheErrorHidesEarlierEntriesAndRetryReloads() {
        var refreshes = 0
        val failed = state().copy(loaded = true, entries = listOf(due, reminder), error = "No connection. The calendar is unavailable.")
        compose.setContent { CommunityTheme { CalendarScreen(failed, actions(refresh = { refreshes += 1 }), {}, {}) } }
        reveal("Retry calendar")
        compose.onNodeWithText("No connection. The calendar is unavailable.").assertIsDisplayed()
        compose.onNodeWithText("Buy groceries").assertDoesNotExist()
        compose.onNodeWithText("Call the plumber").assertDoesNotExist()
        compose.onNodeWithText("No tasks or reminders for this month.").assertDoesNotExist()
        compose.onNodeWithText("Retry calendar").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, refreshes) }
    }

    @Test fun entriesShowTheirDateTimeAndStatusAndOpenTheirOwnSource() {
        var current by mutableStateOf(state().copy(loaded = true, entries = listOf(due, reminder), nextCursor = "synthetic-next"))
        val opened = mutableListOf<CalendarEntryDto>()
        var pages = 0
        compose.setContent { CommunityTheme { CalendarScreen(current, actions(more = { pages += 1 }), {}, { opened += it }) } }
        reveal("Buy groceries")
        compose.onNodeWithText(shownDate(due)).assertIsDisplayed()
        compose.onNodeWithText("Due date").assertIsDisplayed()
        compose.onNodeWithText("open").assertIsDisplayed()
        reveal("Space tasks")
        compose.onNodeWithText("Space tasks").performClick()
        reveal("Call the plumber")
        compose.onNodeWithText(shownTime(reminder)).assertIsDisplayed()
        reveal("Scheduled in Asia/Kolkata")
        compose.onNodeWithText("scheduled").assertIsDisplayed()
        reveal("My reminders")
        compose.onNodeWithText("My reminders").performClick()
        reveal("Load more entries")
        compose.onNodeWithText("Load more entries").performClick()
        compose.runOnIdle { assertEquals(listOf(due, reminder), opened); assertEquals(1, pages) }

        compose.runOnIdle { current = current.copy(entries = listOf(planned), nextCursor = null) }
        reveal("Water the plants")
        compose.onNodeWithText(shownTime(planned)).assertIsDisplayed()
        reveal("Repeating reminder in Asia/Kolkata")
        compose.onNodeWithText("Planned, repeating").assertIsDisplayed()
        reveal("My reminders")
        compose.onNodeWithText("My reminders").performClick()
        compose.onNodeWithText("Load more entries").assertDoesNotExist()
        compose.runOnIdle { assertEquals(listOf(due, reminder, planned), opened) }
    }

    @Test fun monthTimezoneAndSpaceChangeOnlyByAnExplicitChoice() {
        val months = mutableListOf<YearMonth>()
        val zones = mutableListOf<String>()
        val spaces = mutableListOf<String>()
        compose.setContent { CommunityTheme { CalendarScreen(state().copy(loaded = true), actions(month = { months += it }, zone = { zones += it }, space = { spaces += it }), {}, {}) } }
        compose.onNodeWithContentDescription("Previous month").performClick()
        compose.onNodeWithContentDescription("Next month").performClick()
        compose.onNodeWithText("Today").performClick()
        compose.runOnIdle { assertEquals(listOf(YearMonth.of(2026, 9), YearMonth.of(2026, 11), YearMonth.now(ZoneId.of("Asia/Kolkata"))), months) }
        compose.onNodeWithContentDescription("Display timezone").performClick()
        compose.onNodeWithText("UTC").performClick()
        compose.runOnIdle { assertEquals(listOf("UTC"), zones) }
        compose.onNodeWithText("Morgan family").performClick()
        compose.onNodeWithText("Walking group").performClick()
        compose.runOnIdle { assertEquals(listOf(other.id), spaces); assertEquals(3, months.size) }
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        val entries = (1..6).map { due.copy(id = "c2302436-0dd7-4d99-a7c3-ead390fd08f$it", title = "Errand $it") }
        val offline = "No connection. The calendar is unavailable."
        var current by mutableStateOf(state().copy(loaded = true, entries = entries, nextCursor = "synthetic-next"))
        compose.setContent { CommunityTheme { CalendarScreen(current, actions(more = { current = current.copy(entries = emptyList(), nextCursor = null, error = offline) }), {}, {}) } }
        reveal("Load more entries")
        compose.onNodeWithText("Load more entries").performClick()
        // Loading more failed: the error follows the controls and replaces the entries, so it must be on screen.
        compose.onNodeWithText(offline).assertIsDisplayed()
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsTheControlsAndEntriesReachable() {
        assertNarrowScreen()
        val long = due.copy(title = "Buy groceries for the whole family and the weekend picnic")
        compose.setContent { CommunityTheme { CalendarScreen(state().copy(loaded = true, entries = listOf(long, reminder), nextCursor = "synthetic-next"), actions(), {}, {}) } }
        for (matcher in listOf(hasText("Morgan family"), hasContentDescription("Display timezone"), hasContentDescription("Previous month"),
            hasContentDescription("Choose month"), hasText("Today"), hasContentDescription("Next month"))) {
            compose.assertReachable("calendar-workspace", matcher)
        }
        compose.assertReachable("calendar-workspace", hasText(monthTitle))
        compose.assertTextNotClipped(hasText(monthTitle))
        compose.assertTextNotClipped(hasText("Today"))
        compose.assertReachable("calendar-workspace", hasText(long.title))
        compose.assertTextNotClipped(hasText(long.title))
        compose.onRoot().saveEvidence("calendar-native-large-text.png")
        for (matcher in listOf(hasText("Space tasks"), hasText("Call the plumber"), hasText("Scheduled in Asia/Kolkata"))) {
            compose.assertReachable("calendar-workspace", matcher)
        }
        compose.assertTextNotClipped(hasText("Scheduled in Asia/Kolkata"))
        compose.assertReachable("calendar-workspace", hasText("My reminders"))
        compose.assertReachable("calendar-workspace", hasText("Load more entries"))
    }
}
