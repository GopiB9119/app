package com.community.platform.feature.community

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
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
import java.io.File

@RunWith(AndroidJUnit4::class)
class ModerationScreenTest {
    private val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val targetId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val decisionId = "9d6f9b64-bc1b-4a04-b017-6caf9f8b7a08"
    private val appealId = "8c5e8a53-ab0a-4f93-af06-5b9e8e7a6f07"
    private val stamp = "2026-10-02T10:00:00Z"
    private val item = ModerationQueueDto("post", targetId, ModerationPreviewDto("published", title = "Saturday walk", body = "<b>Public text</b>"), "River Walkers", 4,
        listOf(ModerationReasonDto("spam", 1), ModerationReasonDto("privacy", 3)), stamp)
    private val notice = ModerationNoticeDto(decisionId, "post", targetId, "hide", "privacy", stamp, null, null)
    private val appeal = ModerationAppealReviewDto(
        ModerationAppealDto(appealId, decisionId, "Please review this public post.", "open", stamp, null),
        ModerationDecisionDto(decisionId, "post", targetId, "hide", "privacy", "", accountId, stamp, null), item.preview, item.pageName, null,
    )

    private fun reviewing() = ModerationState(accountId = accountId, reviewing = true, moderator = true, queue = ModerationList(listOf(item), loaded = true))

    private fun reveal(tag: String, root: String = "moderation-content") {
        compose.onNodeWithTag(root).performScrollToNode(hasTestTag(tag))
        compose.onNodeWithTag(tag).performScrollTo().assertIsDisplayed()
    }

    @Test fun nonModeratorHasNoTabsFormsOrQueueContent() {
        compose.setContent { CommunityTheme { ModerationScreen(reviewing().copy(moderator = false), ModerationActions(), "UTC") } }
        compose.onNodeWithText("Only platform moderators can open this page.").assertIsDisplayed()
        compose.onAllNodesWithTag("moderation-content").assertCountEquals(0)
        compose.onAllNodesWithTag("moderation-tab-reports").assertCountEquals(0)
        compose.onAllNodesWithText("Record decision").assertCountEquals(0)
        compose.onAllNodesWithText("Saturday walk").assertCountEquals(0)
    }

    @Test fun reportsRequireAnExplicitActionAndSendTheChosenForm() {
        var state by mutableStateOf(reviewing().copy(nextCursor = "next"))
        val decisions = mutableListOf<ModerationDecisionDraft>()
        var more = 0
        val actions = ModerationActions(
            editDecision = { target, action, reason, note -> state = state.copy(decisions = state.decisions + (target.key to ModerationDecisionDraft(action, reason, note))) },
            decide = { target -> decisions += state.draft(target); state = state.copy(queue = ModerationList(loaded = true), message = ModerationMessage.DECISION_RECORDED) },
            more = { more += 1 },
        )
        compose.setContent { CommunityTheme { ModerationScreen(state, actions, "UTC") } }
        compose.onNodeWithText("<b>Public text</b>").assertIsDisplayed()
        reveal("moderation-$targetId-hide")
        compose.onNodeWithTag("moderation-$targetId-hide").assertIsNotSelected()
        reveal("moderation-$targetId-no_action")
        compose.onNodeWithTag("moderation-$targetId-no_action").assertIsNotSelected()
        reveal("moderation-record-$targetId")
        compose.onNodeWithTag("moderation-record-$targetId").assertIsNotEnabled()
        reveal("moderation-reason")
        compose.onNodeWithText("Shares private information").assertIsDisplayed()
        compose.onNodeWithTag("moderation-reason").performClick()
        compose.onNodeWithText("Spam or scam").performClick()
        reveal("moderation-$targetId-hide")
        compose.onNodeWithTag("moderation-$targetId-hide").performClick()
        reveal("moderation-note-$targetId")
        compose.onNodeWithTag("moderation-note-$targetId").performTextReplacement("Checked the public content.")
        reveal("moderation-more")
        compose.onNodeWithTag("moderation-more").performClick()
        reveal("moderation-record-$targetId")
        compose.onNodeWithTag("moderation-record-$targetId").assertIsEnabled().performClick()
        compose.onNodeWithText("Decision recorded.").assertIsDisplayed()
        compose.onNodeWithText("No reports are waiting.").assertIsDisplayed()
        compose.runOnIdle {
            assertEquals(listOf(ModerationDecisionDraft("hide", "spam", "Checked the public content.")), decisions)
            assertEquals(1, more)
        }
    }

    @Test fun appealsTabResolvesTheExactAppealWithTheChosenOutcome() {
        val second = appeal.copy(appeal = appeal.appeal.copy(id = targetId))
        var state by mutableStateOf(reviewing().copy(queue = ModerationList(loaded = true), appeals = ModerationList(listOf(appeal, second), loaded = true)))
        val outcomes = mutableListOf<Pair<String, String>>()
        val notes = mutableListOf<String>()
        val actions = ModerationActions(
            tab = { state = state.copy(tab = it) },
            editResolution = { id, note -> state = state.copy(resolutions = state.resolutions + (id to ModerationResolutionDraft(note))) },
            resolve = { target, outcome -> outcomes += target.appeal.id to outcome; notes += state.resolutions[target.appeal.id]?.note.orEmpty()
                state = state.copy(appeals = state.appeals.copy(items = state.appeals.items.filterNot { it.appeal.id == target.appeal.id }), message = ModerationMessage.APPEAL_RESOLVED) },
        )
        compose.setContent { CommunityTheme { ModerationScreen(state, actions, "UTC") } }
        compose.onNodeWithTag("moderation-tab-appeals").performClick()
        reveal("moderation-resolution-note-$appealId")
        compose.onNodeWithTag("moderation-resolution-note-$appealId").performTextReplacement("The appeal explains the context.")
        reveal("moderation-restore-$appealId")
        compose.onNodeWithTag("moderation-restore-$appealId").performClick()
        reveal("moderation-uphold-$targetId")
        compose.onNodeWithTag("moderation-uphold-$targetId").performClick()
        compose.onNodeWithText("Appeal resolved.").assertIsDisplayed()
        compose.onNodeWithText("No appeals are waiting.").assertIsDisplayed()
        compose.runOnIdle {
            assertEquals(listOf(appealId to "overturned", targetId to "upheld"), outcomes)
            assertEquals(listOf("The appeal explains the context.", ""), notes)
        }
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        val others = listOf("5f2b5d2a-7e7d-4c6f-9c73-2e6b5b4d3c03", "6a3c6e3b-8f8e-4d7a-8d84-3f7c6c5e4d04").map { item.copy(targetId = it) }
        val last = others.last()
        var state by mutableStateOf(reviewing().copy(queue = ModerationList(listOf(item) + others, loaded = true), decisions = mapOf(last.key to ModerationDecisionDraft("hide", "spam"))))
        val actions = ModerationActions(decide = { target ->
            state = state.copy(queue = state.queue.copy(items = state.queue.items.filterNot { it.key == target.key }), decisions = state.decisions - target.key, message = ModerationMessage.DECISION_RECORDED)
        })
        compose.setContent { CommunityTheme { ModerationScreen(state, actions, "UTC") } }
        reveal("moderation-record-${last.targetId}")
        compose.onNodeWithTag("moderation-record-${last.targetId}").performClick()
        // The other reports stay: the message is the list's first item, far above the button that was pressed.
        compose.onNodeWithText("Decision recorded.").assertIsDisplayed()
    }

    @Test fun safetyShowsReportStatesAndOnlyEligibleAppealsWithARequiredNote() {
        val waiting = MyReportDto(targetId, "post", targetId, "spam", "open", null, null, stamp, null)
        var state by mutableStateOf(ModerationState(accountId = accountId, moderator = true,
            notices = ModerationList(listOf(notice, notice.copy(id = appealId, appealStatus = "open")), loaded = true),
            reports = ModerationList(listOf(waiting, waiting.copy(id = appealId, status = "reviewed", outcome = "action_taken", action = "hide", reviewedAt = stamp),
                waiting.copy(id = decisionId, status = "reviewed", outcome = "no_action", action = "no_action", reviewedAt = stamp)), loaded = true)))
        val sent = mutableListOf<String>()
        val actions = ModerationActions(
            selectAppeal = { state = state.copy(selectedNoticeId = it?.id) },
            editAppeal = { id, note -> state = state.copy(appealDrafts = state.appealDrafts + (id to ModerationAppealDraft(note))) },
            sendAppeal = { sent += state.appealDrafts.getValue(it.id).note; state = state.copy(selectedNoticeId = null, message = ModerationMessage.APPEAL_SENT) },
        )
        compose.setContent { CommunityTheme {
            val time = rememberModerationTime("UTC")
            CommunityScreen(CommunityState(accountId = accountId, destination = Destination.Blocked), CommunityActions(), "UTC", {},
                safetyContent = { moderationHistory(state, actions, time) })
            ModerationAppealDialog(state, actions)
        } }
        reveal("moderation-open", "community-content")
        compose.onNodeWithText("Moderation queue").assertIsDisplayed()
        reveal("moderation-appeal-open-$decisionId", "community-content")
        compose.onNodeWithTag("moderation-appeal-open-$decisionId").performClick()
        compose.onNodeWithTag("moderation-appeal-send").assertIsNotEnabled()
        compose.onNodeWithTag("moderation-appeal-note").performTextReplacement("Please review again.")
        compose.onNodeWithTag("moderation-appeal-cancel").performClick()
        compose.runOnIdle { assertTrue(sent.isEmpty()) }
        // The keyboard closing with the dialog moves the list, so find the button again and press it through its semantics
        // action rather than at the place it was before.
        reveal("moderation-appeal-open-$decisionId", "community-content")
        compose.onNodeWithTag("moderation-appeal-open-$decisionId").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals("Please review again.", state.appealDrafts[decisionId]?.note) }
        val shown = compose.onNodeWithTag("moderation-appeal-note").fetchSemanticsNode().config.getOrNull(SemanticsProperties.EditableText)?.text
        assertEquals("Please review again.", shown)
        compose.onNodeWithTag("moderation-appeal-send").assertIsEnabled().performClick()
        compose.onNodeWithTag("community-content").performScrollToNode(hasTestTag("moderation-notice-$appealId"))
        compose.onAllNodesWithTag("moderation-appeal-open-$appealId").assertCountEquals(0)
        for (text in listOf("Waiting for review", "Reviewed: action taken", "Reviewed: no action")) {
            compose.onNodeWithTag("community-content").performScrollToNode(hasText(text))
            compose.onNodeWithText(text).performScrollTo().assertIsDisplayed()
        }
        compose.runOnIdle { assertEquals(listOf("Please review again."), sent) }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextFormsAndDialogKeepControlsInsideAndMeasureRealScale() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals(320, context.resources.configuration.screenWidthDp)
        var state by mutableStateOf(reviewing().copy(notices = ModerationList(listOf(notice), loaded = true)))
        val actions = ModerationActions(
            editDecision = { target, action, reason, note -> state = state.copy(decisions = state.decisions + (target.key to ModerationDecisionDraft(action, reason, note))) },
            editAppeal = { id, note -> state = state.copy(appealDrafts = state.appealDrafts + (id to ModerationAppealDraft(note))) },
            selectAppeal = { state = state.copy(selectedNoticeId = it?.id) },
        )
        compose.setContent { CommunityTheme { ModerationScreen(state, actions, "UTC"); ModerationAppealDialog(state, actions) } }
        for (tag in listOf("moderation-$targetId-hide", "moderation-$targetId-no_action", "moderation-reason", "moderation-note-$targetId", "moderation-record-$targetId")) {
            reveal(tag)
            within(tag, "moderation-content")
        }
        measureText("Record decision")
        capture("moderation-reports-large-text.png")
        compose.runOnIdle { state = state.copy(selectedNoticeId = decisionId) }
        compose.onNodeWithText("Appeal decision").assertIsDisplayed()
        measureText("Appeal decision")
        compose.onNodeWithTag("moderation-appeal-note").performScrollTo().performTextReplacement("A required note that remains readable at large text sizes.")
        for (tag in listOf("moderation-appeal-note", "moderation-appeal-send", "moderation-appeal-cancel")) {
            compose.onNodeWithTag(tag).assertIsDisplayed()
            within(tag, "moderation-appeal-dialog")
        }
        compose.onNodeWithTag("moderation-appeal-send").assertIsEnabled()
        capture("moderation-appeal-large-text.png", "moderation-appeal-dialog")
    }

    @Test fun authorMarksAppearOnPagesPostsAndComments() {
        val page = PageDto(pageId, "river-walkers", "River Walkers", "Weekend walks", "hobbies", 0, stamp, stamp, false, false, true, "\"page\"", moderation = ModerationMarkDto(true, "privacy"))
        val post = PostDto(targetId, pageId, page.handle, page.name, "Saturday walk", "Public text", "published", 0, 1, stamp, stamp, null, false, false, true, "\"post\"", moderation = ModerationMarkDto(true, "spam"))
        val comment = CommentDto(appealId, targetId, null, "Alex", "My public comment", "visible", stamp, true, true, ModerationMarkDto(true, "misinformation"))
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.Page(page.handle), page = page, posts = listOf(post)))
        compose.setContent { CommunityTheme { CommunityScreen(state, CommunityActions(), "UTC", {}) } }
        val pageMark = "Hidden by moderators: Shares private information. Only you can see it."
        compose.onNodeWithTag("community-content").performScrollToNode(hasText(pageMark))
        compose.onNodeWithText(pageMark).performScrollTo().assertIsDisplayed()
        val postMark = "Hidden by moderators: Spam or scam. Only you can see it."
        compose.onNodeWithTag("community-content").performScrollToNode(hasText(postMark))
        compose.onNodeWithText(postMark).performScrollTo().assertIsDisplayed()
        compose.runOnIdle { state = state.copy(destination = Destination.Post(targetId), post = post, comments = listOf(comment)) }
        val commentMark = "Hidden by moderators: False information. Only you can see it."
        compose.onNodeWithTag("community-content").performScrollToNode(hasText(commentMark))
        compose.onNodeWithText(commentMark).performScrollTo().assertIsDisplayed()
    }

    private fun within(tag: String, root: String) {
        val parent = compose.onNodeWithTag(root).fetchSemanticsNode().boundsInRoot
        val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
        assertTrue(tag, !bounds.isEmpty && bounds.left >= parent.left && bounds.right <= parent.right)
        val minimum = 48 * InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        assertTrue("$tag touch target", bounds.height >= minimum - 1)
    }

    private fun measureText(text: String) {
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(text, useUnmergedTree = true).performSemanticsAction(SemanticsActions.GetTextLayoutResult) { assertTrue(it(layouts)) }
        assertTrue(layouts.isNotEmpty())
        layouts.forEach {
            assertEquals(2f, it.layoutInput.density.fontScale, 0.01f)
            assertFalse("$text: size=${it.size}, lines=${it.lineCount}, heightOverflow=${it.didOverflowHeight}", it.cut())
        }
    }

    // The semantics action lays the text out again at the full width it was offered, so didOverflowWidth is true for any label
    // narrower than that width (see HomeScreenTest). Text is cut off when a line runs past the layout, is ellipsized, or the
    // lines do not fit the height.
    private fun TextLayoutResult.cut() =
        didOverflowHeight || (0 until lineCount).any { line -> isLineEllipsized(line) || getLineRight(line) > size.width + 0.5f }

    @Test fun theCutCheckCatchesALabelThatDoesNotFit() {
        compose.setContent { CommunityTheme { Box(Modifier.width(20.dp)) { Text("Record decision", Modifier.testTag("squeezed"), maxLines = 1, softWrap = false) } } }
        val found = mutableListOf<TextLayoutResult>()
        compose.onNodeWithTag("squeezed").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { assertTrue(it(found)) }
        assertTrue(found.single().cut())
    }

    private fun capture(name: String, tag: String? = null) {
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "test-evidence").apply { mkdirs() }
        val node = if (tag == null) compose.onRoot() else compose.onNodeWithTag(tag)
        File(directory, name).outputStream().use { assertTrue(node.captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it)) }
    }
}