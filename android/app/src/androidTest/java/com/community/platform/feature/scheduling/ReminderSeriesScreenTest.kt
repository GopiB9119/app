package com.community.platform.feature.scheduling

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
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
import java.time.Duration
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

private data class SeriesCase(val tag: String, val title: String, val effect: String, val action: String, val expected: Pair<String, SeriesOperation>)

/**
 * Repeating reminders (series) and snooze on the reminder screen, built from synthetic state; the callbacks stand in for
 * the view model. Changing a series and moving its next time belong to the unrecorded alerts work (conflict C10) and are
 * left out; Android has neither.
 */
@RunWith(AndroidJUnit4::class)
class ReminderSeriesScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val taskId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val seriesId = "5d2c8f3a-1b4e-4c6d-9e7f-0a1b2c3d4e5f"
    private val pausedId = "6e3d9a4b-2c5f-4d7e-8f90-1b2c3d4e5f60"
    private val reminderId = "81a09cbf-901e-470c-a905-27d565be91ae"
    private val notificationId = "426ca72f-3c77-409d-90a1-4da512c00421"
    private val me = ReminderRecipientDto(accountId, "Alex Example")
    private val next = SeriesOccurrenceDto(null, "2026-10-03", "08:00", "2026-10-03T02:30:00Z", 330, "none")
    private val active = ReminderSeriesDto(
        seriesId, taskId, spaceId, "Water the plants", "1", false, "daily", 1, emptyList(), "08:00", "Asia/Kolkata", "2026-10-02", "2026-10-31",
        "shift_forward", "active", null, next, "2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z", "1", "\"series-1\"", "in_app",
    )
    private val paused = active.copy(
        id = pausedId, taskTitle = "Take out the recycling", frequency = "weekly", weekdays = listOf("mon", "thu"),
        status = "paused", reason = "by_person", nextOccurrence = null, version = "3", etag = "\"series-3\"",
    )
    private val rule = PreviewReminderSeriesDto(taskId, "08:00", "Asia/Kolkata", "2026-10-02", "2026-10-31", "daily", 1, emptyList(), "shift_forward")
    private val review = ReminderSeriesPreviewDto(
        taskId, "Water the plants", "1", me, "daily", 1, emptyList(), "08:00", "Asia/Kolkata", "2026-10-02", "2026-10-31", "shift_forward",
        listOf(
            SeriesOccurrenceDto(null, "2026-10-02", "08:00", "2026-10-02T02:30:00Z", 330, "none"),
            SeriesOccurrenceDto(null, "2026-10-03", "08:00", "2026-10-03T02:30:00Z", 330, "none"),
            SeriesOccurrenceDto(null, "2026-10-04", "08:00", "2026-10-04T02:30:00Z", 330, "none"),
        ),
        30, emptyList(), "in_app", "series-review-token-".repeat(4), "2026-10-02T10:00:00Z",
    )
    // New York skips 02:30 on 14 March 2027, so the review asks what should happen that day.
    private val springRule = rule.copy(localTime = "02:30", timezone = "America/New_York", startDate = "2027-03-07", endDate = "2027-03-21", frequency = "weekly", weekdays = listOf("sun"))
    private val springForward = review.copy(
        frequency = "weekly", weekdays = listOf("sun"), localTime = "02:30", timezone = "America/New_York", startDate = "2027-03-07", endDate = "2027-03-21",
        occurrences = listOf(
            SeriesOccurrenceDto(null, "2027-03-07", "02:30", "2027-03-07T07:30:00Z", -300, "none"),
            SeriesOccurrenceDto(null, "2027-03-14", "03:30", "2027-03-14T07:30:00Z", -240, "shifted_forward"),
            SeriesOccurrenceDto(null, "2027-03-21", "02:30", "2027-03-21T06:30:00Z", -240, "none"),
        ),
        occurrenceCount = 3, clockChanges = listOf(ClockChangeDto("2027-03-14", "shifted_forward")),
    )
    private val notification = InboxNotificationDto(
        notificationId, reminderId, taskId, spaceId, "Water the plants", "2026-10-02T02:30:00Z", "2026-10-02T02:31:00Z", null, null,
        seriesId, 0, null, true, null,
    )
    private val preferences = ReminderPreferences(ReminderPreferenceDto(true, "1"), "\"preferences-1\"")
    private val loading = hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)

    private fun task() = ReminderWorkspaceState(
        accountId = accountId, taskId = taskId, spaceId = spaceId, taskTitle = "Water the plants", taskOpen = true, tab = ReminderTab.REMINDERS,
        timezone = "Asia/Kolkata", timezones = listOf("Asia/Kolkata", "UTC"), preferences = preferences,
    )
    private fun mine(vararg series: ReminderSeriesDto) = ReminderWorkspaceState(accountId = accountId, tab = ReminderTab.REMINDERS, timezone = "Asia/Kolkata", preferences = preferences, series = series.toList())
    private fun inbox() = ReminderWorkspaceState(accountId = accountId, tab = ReminderTab.INBOX, timezone = "Asia/Kolkata", preferences = preferences, inbox = listOf(notification), unreadCount = 1)
    private fun actions(refresh: () -> Unit = {}, retry: () -> Unit = {}, confirm: () -> Unit = {}, cancel: () -> Unit = {}) =
        ReminderActions(refresh, {}, { _, _, _ -> }, {}, {}, {}, {}, {}, confirm, cancel, {}, {}, retry, {}, {})
    // A list scroll only reaches the item; a series review or row can be taller than the screen, so the node is then scrolled into view.
    private fun reveal(matcher: SemanticsMatcher) {
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(matcher)
        compose.onNode(matcher).performScrollTo()
    }
    private fun reveal(tag: String) = reveal(hasTestTag(tag))
    private fun inRow(id: String, text: String, substring: Boolean = false) = hasText(text, substring) and hasAnyAncestor(hasTestTag("series-row-$id"))
    private fun inReview(text: String) = hasText(text) and hasAnyAncestor(hasTestTag("series-review"))

    @Test fun seriesListShowsLoadingEmptyErrorAndOnlyTheActionsEachStatusAllows() {
        var current by mutableStateOf(mine().copy(busy = true))
        var refreshes = 0
        compose.setContent { CommunityTheme { ReminderScreen(current, actions(refresh = { refreshes += 1 }), {}) } }
        compose.onNode(loading).assertExists()
        reveal(hasText("Repeating reminders"))
        compose.onNodeWithText("No repeating reminders.").assertDoesNotExist()

        compose.runOnIdle { current = mine() }
        reveal(hasText("No repeating reminders."))
        compose.onNodeWithText("No repeating reminders.").assertIsDisplayed()

        compose.runOnIdle { current = mine().copy(error = "No connection. Changes are not confirmed.") }
        reveal(hasText("Retry loading"))
        compose.onNodeWithText("No connection. Changes are not confirmed.").assertIsDisplayed()
        compose.onNodeWithText("Retry loading").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, refreshes); current = mine(active, paused) }

        reveal("series-row-$seriesId")
        compose.onNode(inRow(seriesId, "Active")).assertIsDisplayed()
        compose.onNode(inRow(seriesId, "Every day at 08:00")).assertIsDisplayed()
        compose.onNode(inRow(seriesId, "Next: ", substring = true)).assertIsDisplayed()
        for (tag in listOf("series-skip-$seriesId", "series-pause-$seriesId", "series-cancel-$seriesId")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsEnabled()
        }
        compose.onNodeWithTag("series-resume-$seriesId").assertDoesNotExist()
        reveal("series-row-$pausedId")
        compose.onNode(inRow(pausedId, "Paused")).assertIsDisplayed()
        compose.onNode(inRow(pausedId, "Paused by you.")).assertIsDisplayed()
        for (tag in listOf("series-resume-$pausedId", "series-cancel-$pausedId")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsEnabled()
        }
        compose.onNodeWithTag("series-skip-$pausedId").assertDoesNotExist()
        compose.onNodeWithTag("series-pause-$pausedId").assertDoesNotExist()
    }

    @Test fun aSeriesTimeIsNotOfferedThePlainCancel() {
        val occurrence = ReminderDto(
            reminderId, taskId, spaceId, "Water the plants", "2026-10-03T08:00", "Asia/Kolkata", "2026-10-03T02:30:00Z", "2026-10-04T02:30:00Z",
            "scheduled", null, false, null, "1", "in_app", seriesId, "2026-10-03",
        )
        val single = occurrence.copy(id = "9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e", taskTitle = "Buy groceries", seriesId = null, occurrenceDate = null)
        compose.setContent { CommunityTheme { ReminderScreen(mine(active).copy(reminders = listOf(occurrence, single)), actions(), {}) } }
        reveal(hasText("Part of a repeating reminder"))
        compose.onNodeWithText("Part of a repeating reminder").assertIsDisplayed()
        compose.onNodeWithTag("reminder-cancel-$reminderId").assertDoesNotExist()
        reveal("reminder-cancel-${single.id}")
        compose.onNodeWithTag("reminder-cancel-${single.id}").assertIsEnabled()
    }

    @Test fun aRepeatingReminderIsSavedOnlyFromItsReview() {
        var current by mutableStateOf(task())
        val calls = mutableListOf<String>()
        val callbacks = actions().copy(
            repeat = { mode -> current = current.copy(repeat = mode, seriesStart = "2026-10-02", seriesEnd = "2026-10-31") },
            seriesFields = { time, every, days, start, end, zone -> current = current.copy(seriesTime = time, seriesEvery = every, seriesDays = days, seriesStart = start, seriesEnd = end, timezone = zone) },
            previewSeries = { calls += "review"; current = current.copy(seriesPreview = review, seriesRule = rule) },
            saveSeries = { calls += "save" },
        )
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        reveal("reminder-repeat-DAILY")
        compose.onNodeWithTag("reminder-repeat-DAILY").performClick().assertIsSelected()
        reveal("series-preview")
        compose.onNodeWithTag("series-preview").assertIsNotEnabled().performClick()
        reveal("series-time")
        compose.onNodeWithTag("series-time").performClick()
        compose.onNodeWithTag("series-time-confirm").performClick()
        compose.runOnIdle { assertEquals("09:00", current.seriesTime); assertTrue(calls.isEmpty()) }
        reveal("series-preview")
        compose.onNodeWithTag("series-preview").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf("review"), calls) }

        reveal("series-review")
        compose.onNode(inReview("Water the plants")).assertExists()
        compose.onNode(inReview("Every day at 08:00")).assertExists()
        compose.onNode(inReview("30")).assertExists()
        compose.onNode(inReview("Asia/Kolkata")).assertExists()
        compose.runOnIdle { assertEquals(listOf("review"), calls) }
        reveal("series-save")
        compose.onNodeWithTag("series-save").assertIsEnabled().assertTextEquals("Save repeating reminder").performClick()
        compose.runOnIdle { assertEquals(listOf("review", "save"), calls) }
    }

    @Test fun whenTheClockSkipsTheTimeTheReviewAsksWhatToDoThatDay() {
        val current = task().copy(repeat = RepeatMode.WEEKLY, seriesTime = "02:30", timezone = "America/New_York", seriesPreview = springForward, seriesRule = springRule)
        val policies = mutableListOf<String>()
        compose.setContent { CommunityTheme { ReminderScreen(current, actions().copy(seriesPolicy = { policies += it }), {}) } }
        reveal(inReview("The clock skips this time, so it reminds just after the jump."))
        compose.onNode(inReview("The clock skips this time, so it reminds just after the jump.")).assertIsDisplayed()
        reveal(inReview("Clock changes affect 1 of these days."))
        compose.onNode(inReview("Clock changes affect 1 of these days.")).assertIsDisplayed()
        reveal(inReview("When the clock skips 02:30"))
        compose.onNode(inReview("When the clock skips 02:30")).assertIsDisplayed()
        reveal("series-policy-shift_forward")
        compose.onNodeWithTag("series-policy-shift_forward").assertIsSelected()
        reveal("series-policy-skip")
        compose.onNodeWithTag("series-policy-skip").assertIsNotSelected().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf("skip"), policies) }
    }

    @Test fun aLostSeriesSaveKeepsTheReviewLockedAndOnlyRetrySendsIt() {
        val pending = ReminderCommand.SaveSeries(SeriesCreateIntent(accountId, "original-series-key", springForward.previewToken, springRule))
        var current by mutableStateOf(task().copy(
            repeat = RepeatMode.WEEKLY, seriesTime = "02:30", timezone = "America/New_York", seriesPreview = springForward, seriesRule = springRule,
            pending = pending, error = "No connection. Changes are not confirmed.",
        ))
        var retries = 0
        val sent = mutableListOf<String>()
        val callbacks = actions(retry = { retries += 1; current = current.copy(busy = true, error = null) })
            .copy(saveSeries = { sent += "save" }, seriesPolicy = { sent += "policy $it" })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        reveal(hasText("No connection. Changes are not confirmed."))
        compose.onNodeWithText("No connection. Changes are not confirmed.").assertIsDisplayed()
        compose.onNodeWithText("Retry loading").assertDoesNotExist()
        compose.onNodeWithText("Repeating reminder saved.").assertDoesNotExist()
        compose.onNodeWithTag("reminder-tab-INBOX").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Refresh reminders and inbox").assertIsNotEnabled()
        reveal("series-policy-skip")
        compose.onNodeWithTag("series-policy-skip").assertIsNotEnabled().performClick()
        reveal("series-save")
        compose.onNodeWithTag("series-save").assertIsNotEnabled().performClick()
        reveal(hasText("No repeating reminders."))
        compose.onNodeWithText("No repeating reminders.").assertIsDisplayed()
        reveal("reminder-retry")
        compose.onNodeWithText("This request may already have succeeded.").assertIsDisplayed()
        compose.onNodeWithTag("reminder-retry").assertTextEquals("Retry original request").performClick()
        compose.runOnIdle { assertEquals(1, retries); assertTrue(sent.toString(), sent.isEmpty()); assertEquals(pending, current.pending) }

        // The retry is in flight: it cannot be sent twice and the review stays locked.
        compose.onNode(loading).assertExists()
        compose.onNodeWithTag("reminder-retry").assertDoesNotExist()
        reveal("series-save")
        compose.onNodeWithTag("series-save").assertIsNotEnabled()
    }

    @Test fun seriesActionsAskFirstNameTheirEffectAndKeepSendsNothing() {
        var current by mutableStateOf(mine(active, paused))
        val confirmed = mutableListOf<Pair<String, SeriesOperation>>()
        val callbacks = actions(
            cancel = { current = current.copy(confirmation = null) },
            confirm = {
                val intent = (current.confirmation as ReminderCommand.Series).intent
                confirmed += intent.series.id to intent.operation
                current = current.copy(confirmation = null)
            },
        ).copy(proposeSeries = { series, operation ->
            current = current.copy(confirmation = ReminderCommand.Series(SeriesCommandIntent(accountId, series, operation, "reviewed-${operation.wireValue}")))
        })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        val cancelEffect = "Stops all future reminders of this series, including a waiting snooze. Reminders already in your inbox stay."
        val cases = listOf(
            SeriesCase("series-skip-$seriesId", "Skip the next reminder?", "Only the next reminder is skipped. The series continues after it.", "Skip next reminder", seriesId to SeriesOperation.SKIP),
            SeriesCase("series-pause-$seriesId", "Pause this repeating reminder?", "No reminders until you resume it. Reminders already in your inbox stay, and a waiting snooze still arrives.", "Pause", seriesId to SeriesOperation.PAUSE),
            SeriesCase("series-cancel-$seriesId", "Cancel this repeating reminder?", cancelEffect, "Cancel repeating reminder", seriesId to SeriesOperation.CANCEL),
            SeriesCase("series-resume-$pausedId", "Resume this repeating reminder?", "Reminders continue from the next time after now. Resuming confirms the task as it is now.", "Resume", pausedId to SeriesOperation.RESUME),
            SeriesCase("series-cancel-$pausedId", "Cancel this repeating reminder?", cancelEffect, "Cancel repeating reminder", pausedId to SeriesOperation.CANCEL),
        )
        for (case in cases) {
            val before = confirmed.size
            reveal(case.tag)
            compose.onNodeWithTag(case.tag).performClick()
            compose.onNodeWithText(case.title).assertIsDisplayed()
            compose.onNodeWithText(case.effect).assertIsDisplayed()
            // While the question is open no other series action can start.
            compose.onNodeWithTag(case.tag).assertIsNotEnabled()
            compose.onNodeWithTag("reminder-dismiss").assertTextEquals("Keep as is").performClick()
            compose.onNodeWithText(case.title).assertDoesNotExist()
            compose.runOnIdle { assertEquals(case.tag, before, confirmed.size) }
            compose.onNodeWithTag(case.tag).assertIsEnabled().performClick()
            compose.onNodeWithTag("reminder-confirm").assertTextEquals(case.action).performClick()
            compose.runOnIdle { assertEquals(before + 1, confirmed.size); assertEquals(case.expected, confirmed.last()) }
        }
    }

    @Test fun aLostSeriesAnswerKeepsTheOldStatusAndLocksTheRowUntilTheExactRetry() {
        val pending = ReminderCommand.Series(SeriesCommandIntent(accountId, active, SeriesOperation.PAUSE, "original-pause-key"))
        var current by mutableStateOf(mine(active).copy(pending = pending, error = "No connection. Changes are not confirmed."))
        var retries = 0
        compose.setContent { CommunityTheme { ReminderScreen(current, actions(retry = { retries += 1; current = current.copy(busy = true, error = null) }), {}) } }
        reveal(hasText("No connection. Changes are not confirmed."))
        compose.onNodeWithText("No connection. Changes are not confirmed.").assertIsDisplayed()
        compose.onNodeWithText("Repeating reminder paused.").assertDoesNotExist()
        reveal("series-row-$seriesId")
        compose.onNode(inRow(seriesId, "Active")).assertIsDisplayed()
        compose.onNode(inRow(seriesId, "Paused")).assertDoesNotExist()
        for (tag in listOf("series-skip-$seriesId", "series-pause-$seriesId", "series-cancel-$seriesId")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsNotEnabled()
        }
        compose.onNodeWithTag("reminder-tab-INBOX").assertIsNotEnabled()
        reveal("reminder-retry")
        compose.onNodeWithTag("reminder-retry").performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(pending, current.pending) }
        compose.onNode(loading).assertExists()
        compose.onNodeWithTag("reminder-retry").assertDoesNotExist()
        reveal("series-pause-$seriesId")
        compose.onNodeWithTag("series-pause-$seriesId").assertIsNotEnabled()
        compose.onNode(inRow(seriesId, "Active")).assertIsDisplayed()
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        val third = active.copy(id = "7f4e0b5c-3d6a-4e8f-9a01-2c3d4e5f6a71", taskTitle = "Feed the cat", etag = "\"series-7\"")
        var current by mutableStateOf(mine(active, paused, third))
        val callbacks = actions(confirm = {
            val intent = (current.confirmation as ReminderCommand.Series).intent
            current = current.copy(confirmation = null, notice = "Repeating reminder paused.",
                series = current.series.map { if (it.id == intent.series.id) it.copy(status = "paused", reason = "by_person", nextOccurrence = null) else it })
        }).copy(proposeSeries = { series, operation ->
            current = current.copy(confirmation = ReminderCommand.Series(SeriesCommandIntent(accountId, series, operation, "reviewed-${operation.wireValue}")))
        })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        reveal("series-pause-${third.id}")
        compose.onNodeWithTag("series-pause-${third.id}").performClick()
        compose.onNodeWithTag("reminder-confirm").performClick()
        // The message is the list's first item, far above the series that was paused.
        compose.onNodeWithText("Repeating reminder paused.").assertIsDisplayed()
    }

    @Test fun snoozeNeedsAChoiceAndCancelSendsNothing() {
        val limited = notification.copy(snoozeBefore = Instant.now().plus(Duration.ofHours(2)).toString())
        var current by mutableStateOf(inbox().copy(inbox = listOf(limited)))
        val calls = mutableListOf<String>()
        val callbacks = actions(retry = { calls += "retry" }).copy(
            openSnooze = { current = current.copy(snoozing = it, snoozeMinutes = null) },
            snoozeChoice = { current = current.copy(snoozeMinutes = it) },
            closeSnooze = { current = current.copy(snoozing = null, snoozeMinutes = null) },
            snooze = { calls += "snooze ${current.snoozeMinutes}"; current = current.copy(snoozing = null, snoozeMinutes = null) },
        )
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNodeWithTag("notification-snooze-$notificationId").performClick()
        compose.onNodeWithText("Snooze this reminder?").assertIsDisplayed()
        compose.onNodeWithTag("snooze-confirm").assertIsNotEnabled().performClick()
        // Times after the reminder repeats cannot be chosen.
        for (minutes in listOf(180, 1440)) {
            compose.onNodeWithTag("snooze-option-$minutes").performScrollTo().assertIsNotEnabled().assertTextContains("After this reminder repeats")
        }
        compose.onNodeWithTag("snooze-option-60").performScrollTo().assertIsEnabled().performClick().assertIsSelected()
        compose.onNodeWithTag("snooze-confirm").assertIsEnabled()
        compose.onNodeWithTag("snooze-dismiss").performClick()
        compose.onNodeWithTag("snooze-dialog").assertDoesNotExist()
        compose.runOnIdle { assertTrue(calls.isEmpty()) }

        compose.onNodeWithTag("notification-snooze-$notificationId").performClick()
        compose.onNodeWithTag("snooze-option-10").performScrollTo().performClick()
        compose.onNodeWithTag("snooze-confirm").assertTextEquals("Snooze").performClick()
        compose.runOnIdle { assertEquals(listOf("snooze 10"), calls) }
    }

    @Test fun aLostSnoozeKeepsTheChoiceLockedAndOnlyRetriesIt() {
        val pending = ReminderCommand.Snooze(SnoozeIntent(accountId, notification, 60, "original-snooze-key"))
        var current by mutableStateOf(inbox().copy(snoozing = notification, snoozeMinutes = 60, pending = pending, error = "No connection. Changes are not confirmed."))
        val calls = mutableListOf<String>()
        val callbacks = actions(retry = { calls += "retry"; current = current.copy(busy = true, error = null) })
            .copy(snooze = { calls += "snooze" }, closeSnooze = { calls += "close" }, snoozeChoice = { calls += "choice $it" })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNode(hasText("No connection. Changes are not confirmed.") and hasAnyAncestor(hasTestTag("snooze-dialog"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("snooze-option-60").performScrollTo().assertIsSelected().assertIsNotEnabled()
        compose.onNodeWithTag("snooze-option-10").performScrollTo().assertIsNotSelected().assertIsNotEnabled().performClick()
        compose.onNodeWithTag("snooze-dismiss").assertIsNotEnabled().performClick()
        compose.onNodeWithTag("snooze-confirm").assertIsEnabled().assertTextEquals("Retry original snooze").performClick()
        compose.runOnIdle { assertEquals(listOf("retry"), calls); assertEquals(pending, current.pending) }

        // The retry is in flight: nothing more can be sent, and the inbox does not show the reminder as snoozed.
        compose.onNodeWithTag("snooze-confirm").assertIsNotEnabled().performClick()
        compose.onNodeWithTag("snooze-option-60").assertIsSelected().assertIsNotEnabled()
        compose.onNodeWithText("Snoozed until", substring = true).assertDoesNotExist()
        compose.runOnIdle { assertEquals(listOf("retry"), calls) }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsTheReviewSeriesActionsAndBothQuestionsUsable() {
        assertNarrowScreen()
        val title = "Water the plants on the balcony and in the kitchen"
        var current by mutableStateOf(task().copy(
            taskTitle = title, repeat = RepeatMode.WEEKLY, seriesTime = "02:30", timezone = "America/New_York",
            seriesPreview = springForward.copy(taskTitle = title), seriesRule = springRule, series = listOf(active.copy(taskTitle = title)),
        ))
        val callbacks = actions(cancel = { current = current.copy(confirmation = null) }).copy(
            proposeSeries = { series, operation -> current = current.copy(confirmation = ReminderCommand.Series(SeriesCommandIntent(accountId, series, operation, "reviewed"))) },
            openSnooze = { current = current.copy(snoozing = it, snoozeMinutes = null) },
            snoozeChoice = { current = current.copy(snoozeMinutes = it) },
        )
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        for (tag in listOf("series-policy-shift_forward", "series-policy-skip", "series-save")) compose.assertReachable("reminder-workspace", tag)
        compose.assertTextNotClipped(hasText("Skip that day"))
        compose.assertTextNotClipped(hasText("Save repeating reminder"))
        compose.onRoot().saveEvidence("series-review-native-large-text.png")

        compose.runOnIdle { current = current.copy(seriesPreview = null, seriesRule = null, repeat = RepeatMode.ONCE) }
        for (tag in listOf("series-skip-$seriesId", "series-pause-$seriesId", "series-cancel-$seriesId")) compose.assertReachable("reminder-workspace", tag)
        compose.assertTextNotClipped(inRow(seriesId, title))
        compose.onNodeWithTag("series-pause-$seriesId").performClick()
        compose.onNode(isDialog()).saveEvidence("series-pause-native-large-text.png")
        compose.assertInside(isDialog(), hasTestTag("reminder-dismiss"))
        compose.assertInside(isDialog(), hasTestTag("reminder-confirm"))
        compose.assertTextNotClipped(hasText("Pause this repeating reminder?"))
        compose.assertTextNotClipped(hasText("No reminders until you resume it. Reminders already in your inbox stay, and a waiting snooze still arrives."))
        compose.onNode(hasText("No reminders until you resume it. Reminders already in your inbox stay, and a waiting snooze still arrives.")).performScrollTo().assertIsDisplayed()
        compose.assertTextEndReachable(hasText("No reminders until you resume it. Reminders already in your inbox stay, and a waiting snooze still arrives."))
        compose.onNode(isDialog()).saveEvidence("series-pause-native-large-text-end.png")
        compose.onNodeWithTag("reminder-dismiss").performClick()

        compose.runOnIdle { current = current.copy(tab = ReminderTab.INBOX, inbox = listOf(notification.copy(taskTitle = title)), unreadCount = 1) }
        compose.assertReachable("reminder-workspace", "notification-snooze-$notificationId")
        compose.onNodeWithTag("notification-snooze-$notificationId").performClick()
        for (minutes in snoozeChoices) {
            compose.onNodeWithTag("snooze-option-$minutes").performScrollTo()
            compose.assertInside(hasTestTag("snooze-dialog"), hasTestTag("snooze-option-$minutes"))
        }
        compose.assertInside(hasTestTag("snooze-dialog"), hasTestTag("snooze-dismiss"))
        compose.assertInside(hasTestTag("snooze-dialog"), hasTestTag("snooze-confirm"))
        compose.assertTextNotClipped(hasText("Snooze this reminder?"))
        compose.assertTextNotClipped(hasText("Snooze") and hasAnyAncestor(hasTestTag("snooze-confirm")))
        compose.onNodeWithTag("snooze-dialog").saveEvidence("snooze-native-large-text.png")
    }
}
