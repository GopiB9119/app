package com.community.platform.feature.events

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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/** The Space events screen built from synthetic state; the callbacks stand in for the view model. */
@RunWith(AndroidJUnit4::class)
class EventsScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val eventId = "7a3e5c1d-2b4f-4a6e-8c0d-1e2f3a4b5c6d"
    private val event = EventDto(
        eventId, spaceId, "Morgan family", "Picnic in the park", "Bring a blanket and water.", "Riverside park", "Asia/Kolkata",
        "2026-10-10T10:00", "2026-10-10T12:00", "2026-10-10T04:30:00Z", "2026-10-10T06:30:00Z", "scheduled", false, "Alex Example",
        "2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z", null, null, 1, 1, 0, null, false, true, true, "\"event-1\"",
        listOf(AttendeeDto("Sam Example", "going", "2026-10-01T11:00:00Z", false, false), AttendeeDto("Riya Example", "maybe", "2026-10-01T11:05:00Z", false, false)),
    )
    private val loading = hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)

    private fun state() = EventsState(accountId = accountId, spaceId = spaceId, draft = EventDraft(timezone = "Asia/Kolkata"))
    // A list scroll only reaches the item; the detail and the form are single tall items, so the node is then scrolled into view.
    private fun reveal(matcher: SemanticsMatcher) {
        compose.onNodeWithTag("events-content").performScrollToNode(matcher)
        compose.onNode(matcher).performScrollTo()
    }
    private fun reveal(tag: String) = reveal(hasTestTag(tag))

    @Test fun listShowsLoadingEmptyErrorAndEventsAndOpensTheTappedOne() {
        var current by mutableStateOf(state().copy(loading = true))
        var reloads = 0
        var pages = 0
        val opened = mutableListOf<EventDto>()
        compose.setContent { CommunityTheme { EventsScreen(current, EventsActions(reload = { reloads += 1 }, more = { pages += 1 }, open = { opened += it }), "Morgan family") } }
        compose.onNode(loading).assertExists()
        compose.onNodeWithContentDescription("Refresh events").assertIsNotEnabled()
        reveal("events-new")
        compose.onNodeWithTag("events-empty").assertDoesNotExist()

        compose.runOnIdle { current = state() }
        compose.onNode(loading).assertDoesNotExist()
        reveal("events-empty")
        compose.onNodeWithTag("events-empty").assertTextEquals("No upcoming events. Events created before you joined this Space are not shown.")
        compose.onNodeWithTag("events-upcoming").assertIsSelected()
        compose.runOnIdle { current = state().copy(past = true) }
        compose.onNodeWithTag("events-past").assertIsSelected()
        compose.onNodeWithTag("events-empty").assertTextEquals("No past events.")

        compose.runOnIdle { current = state().copy(error = "No connection. Nothing new is confirmed.") }
        reveal("events-error")
        compose.onNodeWithTag("events-error").assertTextEquals("No connection. Nothing new is confirmed.")
        reveal("events-new")
        compose.onNodeWithTag("events-empty").assertDoesNotExist()
        compose.onNodeWithContentDescription("Refresh events").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, reloads) }

        compose.runOnIdle { current = state().copy(events = listOf(event), nextCursor = "synthetic-next") }
        reveal("event-row")
        compose.onNodeWithTag("event-row").assertTextContains("Picnic in the park").assertTextContains("Riverside park")
            .assertTextContains("Going 1 · Maybe 1 · Not going 0").assertTextContains("(Asia/Kolkata)", substring = true)
        reveal(hasText("Show more"))
        compose.onNodeWithText("Show more").performClick()
        compose.runOnIdle { assertEquals(1, pages) }
        reveal("event-row")
        compose.onNodeWithTag("event-row").performClick()
        compose.runOnIdle { assertEquals(listOf(event), opened) }
    }

    @Test fun cancellingAnEventAsksFirstAndKeepSendsNothing() {
        var current by mutableStateOf(state().copy(mode = EventMode.DETAIL, selected = event))
        val cancels = mutableListOf<String>()
        val actions = EventsActions(
            askCancel = { current = current.copy(confirmingCancel = true) },
            keep = { current = current.copy(confirmingCancel = false) },
            cancel = { cancels += if (current.confirmingCancel) current.selected!!.id else "without confirmation"; current = current.copy(confirmingCancel = false) },
        )
        compose.setContent { CommunityTheme { EventsScreen(current, actions, "Morgan family") } }
        reveal(hasText("In Morgan family. Organized by Alex Example."))
        compose.onNodeWithText("In Morgan family. Organized by Alex Example.").assertIsDisplayed()
        reveal("event-cancel")
        compose.onNodeWithTag("event-cancel").assertTextEquals("Cancel event").performClick()
        compose.onNodeWithText("Cancel this event?").assertIsDisplayed()
        compose.onNodeWithText("Cancel “Picnic in the park” for everyone in Morgan family? Responses will stop and this cannot be undone.").assertIsDisplayed()
        compose.runOnIdle { assertTrue(cancels.isEmpty()) }
        compose.onNodeWithText("Keep event").performClick()
        compose.onNodeWithText("Cancel this event?").assertDoesNotExist()
        compose.runOnIdle { assertTrue(cancels.isEmpty()); assertFalse(current.confirmingCancel) }
        compose.onNodeWithTag("event-cancel").performClick()
        compose.onNodeWithTag("event-cancel-confirm").assertTextEquals("Yes, cancel event").performClick()
        compose.runOnIdle { assertEquals(listOf(eventId), cancels) }

        // Only the server's answer marks the event cancelled.
        compose.onNodeWithTag("event-cancelled").assertDoesNotExist()
        compose.runOnIdle { current = current.copy(selected = event.copy(status = "cancelled", cancelledAt = "2026-10-02T10:00:00Z", canRespond = false)) }
        reveal("event-cancelled")
        compose.onNodeWithTag("event-cancelled").assertTextEquals("This event was cancelled. Responses can no longer change.")
        compose.onNodeWithTag("event-going").assertDoesNotExist()
    }

    @Test fun aCommandInFlightDisablesTheListDetailAndFormControls() {
        var current by mutableStateOf(state().copy(mode = EventMode.DETAIL, selected = event, working = true))
        val calls = mutableListOf<String>()
        val actions = EventsActions(
            back = { calls += "back" }, reload = { calls += "reload" }, open = { calls += "open" }, close = { calls += "close" },
            startCreate = { calls += "new" }, startEdit = { calls += "edit" }, save = { calls += "save" }, respond = { calls += "respond $it" },
            askCancel = { calls += "cancel" },
        )
        compose.setContent { CommunityTheme { EventsScreen(current, actions, "Morgan family") } }
        compose.onNodeWithTag("events-back").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Refresh events").assertIsNotEnabled().performClick()
        for (tag in listOf("event-going", "event-maybe", "event-not-going", "event-edit", "event-cancel")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsNotEnabled().performClick()
        }
        reveal(hasText("Back to events"))
        compose.onNodeWithText("Back to events").assertIsNotEnabled().performClick()

        compose.runOnIdle { current = state().copy(mode = EventMode.CREATE, draft = EventDraft("Picnic", "2026-10-10", "10:00", "", "Asia/Kolkata"), working = true) }
        for (tag in listOf("event-title", "event-date", "event-start", "event-end", "event-zone", "event-location", "event-details", "event-save")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsNotEnabled()
        }
        compose.onNodeWithTag("event-save").performClick()

        compose.runOnIdle { current = state().copy(events = listOf(event), working = true) }
        reveal("events-new")
        compose.onNodeWithTag("events-new").assertIsNotEnabled().performClick()
        reveal("event-row")
        compose.onNodeWithTag("event-row").assertIsNotEnabled().performClick()
        compose.runOnIdle { assertTrue(calls.toString(), calls.isEmpty()) }
    }

    @Test fun anUnconfirmedCreateLocksTheFormAndOnlyRetrySendsItAgain() {
        val draft = EventDraft("Picnic in the park", "2026-10-10", "10:00", "12:00", "Asia/Kolkata", "Riverside park", "Bring a blanket and water.")
        val body = eventBody(draft.title, draft.details, draft.location, draft.timezone, draft.date, draft.start, draft.end)
        val intent = EventCreateIntent(accountId, spaceId, "original-create-key", body)
        var current by mutableStateOf(state().copy(mode = EventMode.CREATE, draft = draft, pending = intent, error = "Not confirmed. Retry sends the same event; it cannot be created twice."))
        var retries = 0
        var discards = 0
        var saves = 0
        compose.setContent { CommunityTheme { EventsScreen(current, EventsActions(retry = { retries += 1 }, discard = { discards += 1 }, save = { saves += 1 }), "Morgan family") } }
        reveal("events-error")
        compose.onNodeWithTag("events-error").assertTextEquals("Not confirmed. Retry sends the same event; it cannot be created twice.")
        compose.onNodeWithTag("events-notice").assertDoesNotExist()
        compose.onNodeWithTag("event-detail").assertDoesNotExist()
        reveal("event-title")
        compose.onNodeWithTag("event-title").assertIsNotEnabled().assertTextContains("Picnic in the park")
        reveal("event-start")
        compose.onNodeWithTag("event-start").assertIsNotEnabled().assertTextContains("10:00")
        reveal("event-retry")
        compose.onNodeWithTag("event-save").assertDoesNotExist()
        compose.onNodeWithTag("event-retry").assertTextEquals("Retry").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(0, saves) }

        compose.runOnIdle { current = current.copy(working = true, error = null) }
        compose.onNodeWithTag("event-retry").assertIsNotEnabled()
        compose.onNodeWithTag("event-discard").assertIsNotEnabled()
        compose.onNodeWithTag("events-back").assertIsNotEnabled()
        compose.runOnIdle { current = current.copy(working = false) }
        compose.onNodeWithTag("event-discard").assertTextEquals("Close and check the list").performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(1, discards); assertEquals(intent, current.pending) }
    }

    @Test fun aResponseIsShownAsChosenOnlyWhenTheServerConfirmsItForTheCurrentTime() {
        val outdated = event.copy(myResponse = "going", myResponseOutdated = true)
        var current by mutableStateOf(state().copy(mode = EventMode.DETAIL, selected = outdated))
        val responses = mutableListOf<String>()
        compose.setContent { CommunityTheme { EventsScreen(current, EventsActions(respond = { responses += it; current = current.copy(working = true) }), "Morgan family") } }
        reveal("event-outdated")
        compose.onNodeWithTag("event-outdated").assertTextEquals("The time changed after you responded. Choose your response again to confirm it.")
        reveal("event-going")
        compose.onNodeWithTag("event-going").assertIsNotSelected().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(listOf("going"), responses) }
        // While the answer is pending nothing is shown as chosen and nothing else can be sent.
        compose.onNodeWithTag("event-going").assertIsNotSelected().assertIsNotEnabled()
        compose.onNodeWithTag("event-maybe").assertIsNotEnabled()
        compose.onNodeWithTag("event-not-going").assertIsNotEnabled()

        // A lost answer: the error says so and the choice is still not shown as made.
        compose.runOnIdle { current = current.copy(working = false, error = "Your response is not confirmed. Choose it again to retry.") }
        reveal("events-error")
        compose.onNodeWithTag("events-error").assertTextEquals("Your response is not confirmed. Choose it again to retry.")
        reveal("event-going")
        compose.onNodeWithTag("event-going").assertIsNotSelected().assertIsEnabled()

        compose.runOnIdle { current = current.copy(error = null, selected = outdated.copy(myResponseOutdated = false, going = 2)) }
        reveal("event-going")
        compose.onNodeWithTag("event-going").assertIsSelected()
        compose.onNodeWithTag("event-outdated").assertDoesNotExist()
    }

    @Test fun onlySameDayEventsCanBeEditedHere() {
        val multiDay = event.copy(localEnd = "2026-10-11T12:00", endsAt = "2026-10-11T06:30:00Z")
        var current by mutableStateOf(state().copy(mode = EventMode.DETAIL, selected = multiDay))
        var edits = 0
        compose.setContent { CommunityTheme { EventsScreen(current, EventsActions(startEdit = { edits += 1 }), "Morgan family") } }
        reveal("event-edit")
        compose.onNodeWithText("This event spans more than one day. Edit it on the web so its exact end is kept.").assertIsDisplayed()
        compose.onNodeWithTag("event-edit").assertIsNotEnabled().performClick()
        compose.onNodeWithTag("event-cancel").assertIsEnabled()
        compose.runOnIdle { assertEquals(0, edits); current = current.copy(selected = event) }
        reveal("event-edit")
        compose.onNodeWithText("This event spans more than one day. Edit it on the web so its exact end is kept.").assertDoesNotExist()
        compose.onNodeWithTag("event-edit").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, edits) }
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        val events = (1..5).map { event.copy(id = "7a3e5c1d-2b4f-4a6e-8c0d-1e2f3a4b5c7$it", title = "Picnic $it") }
        val offline = "No connection. Nothing new is confirmed."
        var current by mutableStateOf(state().copy(events = events, nextCursor = "synthetic-next"))
        compose.setContent { CommunityTheme { EventsScreen(current, EventsActions(more = { current = current.copy(error = offline) }), "Morgan family") } }
        reveal(hasText("Show more"))
        compose.onNodeWithText("Show more").performClick()
        // Loading more failed and the events stay: the message is the list's first item, far above the button that was pressed.
        compose.onNodeWithTag("events-error").assertIsDisplayed().assertTextEquals(offline)
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsTheListDetailFormAndCancelQuestionUsable() {
        assertNarrowScreen()
        // A title and Space name close to their limits (120 and 80 characters), so the cancel question is long.
        val long = event.copy(
            title = "Picnic and kite flying at the riverside park with the grandparents, cousins and the neighbours from number 12",
            spaceName = "Morgan, Patel and Okafor families and friends from the Sunday walking club",
        )
        assertTrue(long.title.length in 100..120 && long.spaceName.length in 60..80)
        var current by mutableStateOf(state().copy(events = listOf(long)))
        val actions = EventsActions(askCancel = { current = current.copy(confirmingCancel = true) }, keep = { current = current.copy(confirmingCancel = false) })
        compose.setContent { CommunityTheme { EventsScreen(current, actions, "Morgan family") } }
        for (tag in listOf("events-upcoming", "events-past", "events-new", "event-row")) compose.assertReachable("events-content", tag)
        compose.assertTextNotClipped(hasText(long.title) and hasAnyAncestor(hasTestTag("event-row")))
        compose.assertTextNotClipped(hasText("New event") and hasAnyAncestor(hasTestTag("events-new")))
        compose.onRoot().saveEvidence("events-list-native-large-text.png")

        compose.runOnIdle { current = current.copy(mode = EventMode.DETAIL, selected = long) }
        for (tag in listOf("event-going", "event-maybe", "event-not-going", "event-edit", "event-cancel")) compose.assertReachable("events-content", tag)
        compose.assertTextNotClipped(hasText("Not going") and hasAnyAncestor(hasTestTag("event-not-going")))
        compose.assertTextNotClipped(hasText("Cancel event") and hasAnyAncestor(hasTestTag("event-cancel")))
        compose.onNodeWithTag("event-cancel").performClick()
        compose.onNode(isDialog()).saveEvidence("events-cancel-native-large-text.png")
        compose.assertInside(isDialog(), hasTestTag("event-cancel-confirm"))
        compose.assertInside(isDialog(), hasText("Keep event"))
        compose.assertTextNotClipped(hasText("Cancel this event?"))
        val question = "Cancel “${long.title}” for everyone in ${long.spaceName}? Responses will stop and this cannot be undone."
        compose.assertTextNotClipped(hasText(question))
        compose.onNode(hasText(question)).performScrollTo().assertIsDisplayed()
        compose.assertTextEndReachable(hasText(question))
        compose.onNode(isDialog()).saveEvidence("events-cancel-native-large-text-end.png")
        compose.onNodeWithText("Keep event").performClick()

        compose.runOnIdle { current = current.copy(mode = EventMode.CREATE, selected = null, draft = EventDraft(long.title, "2026-10-10", "10:00", "12:00", "Asia/Kolkata")) }
        compose.assertReachable("events-content", "event-title")
        compose.assertReachable("events-content", "event-save")
    }
}
