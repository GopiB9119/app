package com.community.platform.feature.scheduling

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.rules.RuleChain
import org.junit.rules.TestRule

@RunWith(AndroidJUnit4::class)
class ReminderScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val taskId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val reminderId = "81a09cbf-901e-470c-a905-27d565be91ae"
    private val notificationId = "426ca72f-3c77-409d-90a1-4da512c00421"
    private val preview = ReminderPreviewDto(taskId, "Buy groceries", "1", "2026-11-01T01:30:00", "America/New_York", ReminderRecipientDto(accountId, "Alex Example"), "in_app", listOf(
        ReminderOptionDto("2026-11-01T05:30:00Z", "2026-11-02T05:30:00Z", -240, "first-reviewed-token-".repeat(4)),
        ReminderOptionDto("2026-11-01T06:30:00Z", "2026-11-02T06:30:00Z", -300, "second-reviewed-token-".repeat(4)),
    ), "2026-09-19T10:05:00Z")
    private val notification = InboxNotificationDto(notificationId, reminderId, taskId, spaceId, "Buy groceries", "2026-11-01T06:30:00Z", "2026-11-01T06:31:00Z", null, null)
    private val sender = ReminderRecipientDto("3c5354a9-9967-4314-bdee-9c2f23b227a1", "Sam Example")
    private val incoming = ReminderRequestDto(notificationId, taskId, spaceId, "Buy groceries", "1", sender, preview.recipient,
        preview.localTime, preview.timezone, preview.options[1].scheduledAt, preview.options[1].dispatchExpiresAt,
        "2026-09-22T10:00:00Z", "2026-09-19T10:00:00Z", null, "pending", false, null, "1", "in_app")
    private val incomingReview = ReminderRequestReviewDto(incoming, "recipient-reviewed-token-".repeat(4), "2026-09-19T10:05:00Z")
    private fun state() = ReminderWorkspaceState(accountId = accountId, taskId = taskId, spaceId = spaceId, taskTitle = "Buy groceries", taskOpen = true, tab = ReminderTab.REMINDERS, date = "2026-11-01", time = "01:30", timezone = "America/New_York", timezones = listOf("America/New_York", "Asia/Kolkata", "UTC"), preferences = ReminderPreferences(ReminderPreferenceDto(true, "1"), "\"preferences-1\""))
    private fun actions(
        fields: (String, String, String) -> Unit = { _, _, _ -> },
        review: () -> Unit = {}, option: (Int) -> Unit = {}, save: () -> Unit = {},
        propose: (ReminderCommand) -> Unit = {}, confirm: () -> Unit = {}, cancel: () -> Unit = {},
        read: (InboxNotificationDto) -> Unit = {}, preference: (Boolean) -> Unit = {}, retry: () -> Unit = {},
    ) = ReminderActions({}, {}, fields, review, option, {}, save, propose, confirm, cancel, read, preference, retry, {}, {})

    @Test fun reviewRequiresAnExplicitOffsetAndPreservesExactChosenTime() {
        var current by mutableStateOf(state().copy(preview = preview))
        var selectedToken: String? = null
        compose.setContent { CommunityTheme { ReminderScreen(current, actions(option = { current = current.copy(selectedOption = it) }, save = { selectedToken = current.preview!!.options[current.selectedOption!!].previewToken }), {}) } }
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-save"))
        compose.onNodeWithTag("reminder-save").assertIsNotEnabled()
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-option-1"))
        compose.onNodeWithTag("reminder-option-1").performClick().assertIsSelected()
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-save"))
        compose.onNodeWithTag("reminder-save").performClick()
        compose.runOnIdle { assertEquals(preview.options[1].previewToken, selectedToken) }
    }

    @Test fun dateAndTimeControlsPassLocalFieldsWithoutClientTimezoneResolution() {
        var current by mutableStateOf(state())
        var reviewed: List<String>? = null
        val callbacks = actions(fields = { date, time, zone -> current = current.copy(date = date, time = time, timezone = zone) }, review = { reviewed = listOf(current.date, current.time, current.timezone) })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNodeWithTag("reminder-date").performClick()
        compose.onNodeWithText("Monday, November 2, 2026").performClick()
        compose.onNodeWithTag("reminder-date-confirm").performClick()
        compose.onNodeWithTag("reminder-time").performClick()
        compose.onNodeWithTag("reminder-time-confirm").performClick()
        compose.onNodeWithTag("reminder-zone").performClick()
        compose.onNodeWithText("Asia/Kolkata").performClick()
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-preview"))
        compose.onNodeWithTag("reminder-preview").performClick()
        compose.runOnIdle { assertEquals(listOf("2026-11-02", "01:30", "Asia/Kolkata"), reviewed) }
    }

    @Test fun uncertainSaveLocksReviewAndOnlyExplicitRetryCallsTheHandler() {
        val pending = ReminderCommand.Save(ReminderCreateIntent(accountId, taskId, "original-key", preview.options[1].previewToken))
        val current = state().copy(preview = preview, selectedOption = 1, pending = pending, error = "Synthetic timeout")
        var retries = 0
        compose.setContent { CommunityTheme { ReminderScreen(current, actions(retry = { retries += 1 }), {}) } }
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-option-0"))
        compose.onNodeWithTag("reminder-option-0").assertIsNotEnabled()
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-save"))
        compose.onNodeWithTag("reminder-save").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, retries) }
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-retry"))
        compose.onNodeWithTag("reminder-retry").performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(pending, current.pending) }
    }

    @Test fun readingDoesNotAcknowledgeAndAcknowledgmentRequiresConfirmation() {
        var current by mutableStateOf(state().copy(tab = ReminderTab.INBOX, inbox = listOf(notification), unreadCount = 1))
        val calls = mutableListOf<String>()
        val callbacks = actions(
            read = { item -> calls.add("read"); current = current.copy(inbox = listOf(item.copy(readAt = "2026-11-01T06:32:00Z")), unreadCount = 0) },
            propose = { current = current.copy(confirmation = it) },
            confirm = { calls.add("acknowledge"); current = current.copy(confirmation = null, inbox = current.inbox.map { it.copy(acknowledgedAt = "2026-11-01T06:33:00Z") }) },
            cancel = { current = current.copy(confirmation = null) },
        )
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNodeWithTag("notification-read-$notificationId").performClick()
        compose.runOnIdle { assertEquals(listOf("read"), calls); assertNull(current.inbox.single().acknowledgedAt) }
        compose.onNodeWithTag("notification-ack-$notificationId").performClick()
        compose.onNodeWithText("This records your acknowledgment. The task stays unchanged.").assertIsDisplayed()
        compose.onNodeWithTag("reminder-dismiss").performClick()
        compose.runOnIdle { assertEquals(listOf("read"), calls) }
        compose.onNodeWithTag("notification-ack-$notificationId").performClick()
        compose.onNodeWithTag("reminder-confirm").performClick()
        compose.onNodeWithText("Acknowledged").assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf("read", "acknowledge"), calls) }
        capture("reminder-inbox-native.png")
    }

    @Test fun preferenceControlShowsConfirmedValueUntilCallbackUpdatesIt() {
        var current by mutableStateOf(state().copy(tab = ReminderTab.INBOX))
        var requested: Boolean? = null
        compose.setContent { CommunityTheme { ReminderScreen(current, actions(preference = { requested = it }), {}) } }
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-preference"))
        compose.onNodeWithTag("reminder-preference").performClick()
        compose.runOnIdle { assertEquals(false, requested); assertTrue(current.preferences!!.value.enabled) }
        compose.runOnIdle { current = current.copy(preferences = ReminderPreferences(ReminderPreferenceDto(false, "2"), "\"preferences-2\"")) }
        compose.onNodeWithText("Turning reminders off withdraws pending schedules. Turning them back on does not restore those schedules.").assertIsDisplayed()
    }

    @Test fun narrowLargeTextPreviewIsScrollableAndSaveRemainsReachable() {
        val current = state().copy(preview = preview.copy(taskTitle = "A longer ordinary family task reminder with a reviewed local time"), selectedOption = 1)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { ReminderScreen(current, actions(), {}) } }
            }
        }
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasText("Review reminder"))
        capture("reminder-review-native-large-text.png")
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-save"))
        compose.onNodeWithTag("reminder-save").assertIsDisplayed()
        val parent = compose.onNodeWithTag("reminder-workspace").fetchSemanticsNode().boundsInRoot
        val button = compose.onNodeWithTag("reminder-save").fetchSemanticsNode().boundsInRoot
        assertTrue(button.left >= parent.left && button.right <= parent.right)
    }

    @Test fun assigneeProposalShowsRecipientAndCannotSendBeforeTimeReview() {
        var current by mutableStateOf(state().copy(assignee = sender, canRequest = true))
        var sentTo: String? = null
        val proposalPreview = preview.copy(recipient = sender, requestedBy = preview.recipient, requestExpiresAt = incoming.expiresAt)
        val callbacks = actions(
            review = { current = current.copy(preview = proposalPreview, selectedOption = null) },
            option = { current = current.copy(selectedOption = it) },
            save = { sentTo = current.preview!!.recipient.accountId },
        ).copy(requestMode = { current = current.copy(requestForAssignee = it) })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNodeWithTag("reminder-recipient-assignee").performClick().assertIsSelected()
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-preview"))
        compose.onNodeWithTag("reminder-preview").performClick()
        compose.runOnIdle { assertNull(sentTo); assertEquals(sender.accountId, current.preview!!.recipient.accountId) }
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-save"))
        compose.onNodeWithTag("reminder-save").assertIsNotEnabled()
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-option-1"))
        compose.onNodeWithTag("reminder-option-1").performClick()
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-save"))
        compose.onNodeWithTag("reminder-save").performClick()
        compose.runOnIdle { assertEquals(sender.accountId, sentTo) }
    }

    @Test fun recipientReviewCanBeDismissedAndAcceptsOnlyTheShownRequest() {
        var current by mutableStateOf(state().copy(tab = ReminderTab.REQUESTS, requests = listOf(incoming)))
        var accepted: String? = null
        val callbacks = actions().copy(
            reviewRequest = { current = current.copy(requestReview = incomingReview.copy(request = it)) },
            closeRequestReview = { current = current.copy(requestReview = null) },
            acceptRequest = { accepted = current.requestReview!!.request.id; current = current.copy(requestReview = null, requests = listOf(incoming.copy(status = "accepted", reminderId = reminderId))) },
        )
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNodeWithTag("reminder-request-review-${incoming.id}").performClick()
        compose.onNodeWithText(sender.displayName).assertIsDisplayed()
        compose.runOnIdle { assertNull(accepted) }
        capture("reminder-request-native-review.png", dialog = true)
        compose.onNodeWithTag("reminder-request-dismiss").performClick()
        compose.runOnIdle { assertNull(accepted) }
        compose.onNodeWithTag("reminder-request-review-${incoming.id}").performClick()
        compose.onNodeWithTag("reminder-request-confirm").performClick()
        compose.runOnIdle { assertEquals(incoming.id, accepted) }
        compose.onNodeWithText("Accepted").assertIsDisplayed()
    }

    @Test fun uncertainAcceptanceKeepsReviewLockedAndOnlyRetriesOriginalCommand() {
        val pending = ReminderCommand.RespondRequest(ReminderRequestResponseIntent(accountId, incoming, ReminderRequestResponse.ACCEPT, incomingReview.previewToken))
        val current = state().copy(tab = ReminderTab.REQUESTS, requests = listOf(incoming), requestReview = incomingReview, pending = pending, error = "Synthetic lost response")
        var retries = 0
        compose.setContent { CommunityTheme { ReminderScreen(current, actions(retry = { retries += 1 }), {}) } }
        compose.onNodeWithTag("reminder-request-dismiss").assertIsNotEnabled()
        compose.onNodeWithTag("reminder-request-confirm").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(pending, current.pending) }
    }

    @Test fun declineAndWithdrawalConfirmTheExactRequestWithoutAccepting() {
        var current by mutableStateOf(state().copy(tab = ReminderTab.REQUESTS, requests = listOf(incoming)))
        val responses = mutableListOf<ReminderRequestResponseIntent>()
        val callbacks = actions(propose = { current = current.copy(confirmation = it) }, cancel = { current = current.copy(confirmation = null) }, confirm = {
            responses.add((current.confirmation as ReminderCommand.RespondRequest).intent)
            current = current.copy(confirmation = null)
        })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNodeWithTag("reminder-request-decline-${incoming.id}").performClick()
        compose.runOnIdle { assertTrue(responses.isEmpty()) }
        compose.onNodeWithTag("reminder-request-dismiss").performClick()
        compose.runOnIdle { assertTrue(responses.isEmpty()) }
        compose.onNodeWithTag("reminder-request-decline-${incoming.id}").performClick()
        compose.onNodeWithTag("reminder-request-confirm").performClick()
        compose.runOnIdle {
            assertEquals(ReminderRequestResponse.DECLINE, responses.single().response)
            assertEquals(incoming.id, responses.single().request.id)
            current = current.copy(requestDirection = ReminderRequestDirection.SENT, requests = listOf(incoming.copy(requestedBy = incoming.recipient, recipient = incoming.requestedBy)))
        }
        compose.onNodeWithTag("reminder-request-withdraw-${incoming.id}").performClick()
        compose.onNodeWithTag("reminder-request-confirm").performClick()
        compose.runOnIdle { assertEquals(ReminderRequestResponse.CANCEL, responses.last().response); assertEquals(incoming.id, responses.last().request.id) }
    }

    @Test fun requestDirectionAndPaginationRemainExplicitUserActions() {
        var current by mutableStateOf(state().copy(tab = ReminderTab.REQUESTS, requestCursor = "synthetic-next"))
        var pages = 0
        val callbacks = actions().copy(requestDirection = { current = current.copy(requestDirection = it) }, moreRequests = { pages += 1 })
        compose.setContent { CommunityTheme { ReminderScreen(current, callbacks, {}) } }
        compose.onNodeWithTag("reminder-request-direction-SENT").performClick().assertIsSelected()
        compose.runOnIdle { assertEquals(ReminderRequestDirection.SENT, current.requestDirection); assertEquals(0, pages) }
        compose.onNodeWithText("Load more requests").performClick()
        compose.runOnIdle { assertEquals(1, pages) }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextRecipientReviewKeepsBothActionsVisible() {
        assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
        val proposal = incoming.copy(taskTitle = "A longer family task ${"A".repeat(130)}")
        val current = state().copy(tab = ReminderTab.REQUESTS, requests = listOf(proposal), requestReview = incomingReview.copy(request = proposal))
        var accepted = false
        compose.setContent {
            Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { ReminderScreen(current, actions().copy(acceptRequest = { accepted = true }), {}) } }
        }
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNode(hasText(proposal.taskTitle) and hasAnyAncestor(hasTestTag("reminder-request-dialog")))
            .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { readLayout -> assertTrue(readLayout(layouts)) }
        assertEquals(2f, layouts.single().layoutInput.density.fontScale, 0.01f)
        compose.onNodeWithTag("reminder-request-confirm").assertIsDisplayed()
        compose.onNodeWithTag("reminder-request-dismiss").assertIsDisplayed()
        val parent = compose.onNodeWithTag("reminder-request-dialog").fetchSemanticsNode().boundsInRoot
        for (tag in listOf("reminder-request-confirm", "reminder-request-dismiss")) {
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue(bounds.left >= parent.left && bounds.right <= parent.right && bounds.bottom <= parent.bottom)
        }
        compose.onNodeWithText("Accepting creates your personal reminder. No push alert or external message.").performScrollTo().assertIsDisplayed()
        capture("reminder-request-native-large-text.png", dialog = true)
        compose.onNodeWithTag("reminder-request-confirm").performClick()
        compose.runOnIdle { assertTrue(accepted) }
    }

    private fun capture(name: String, dialog: Boolean = false) {
        val bitmap = (if (dialog) compose.onNodeWithTag("reminder-request-dialog") else compose.onRoot()).captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("test-evidence"), name)
        file.outputStream().use { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(file.length() > 1000)
    }
}