package com.community.platform.feature.agents

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
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.feature.spaces.SpaceDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class AgentScreenTest {
    @get:Rule val compose = createComposeRule()
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val runId = "10000000-0000-4000-9000-000000000001"
    private val approvalId = "10000000-0000-4000-9000-000000000002"
    private val questionId = "10000000-0000-4000-9000-000000000003"
    private val memoryId = "7b0c2f4e-5d1a-4c3b-9e8f-1a2b3c4d5e6f"
    private val etag = "\"${"1".padStart(64, '0')}\""
    private val space = SpaceDto(spaceId, "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z")
    private val fields = listOf(AgentFieldDto("Space", "Morgan family"), AgentFieldDto("Title", "Water the plants"),
        AgentFieldDto("Due date", "2 October 2026"), AgentFieldDto("Assigned to", "Nobody"))
    private val approval = AgentApprovalDto(approvalId, runId, spaceId, "tasks.create", "low", "Create this task.", fields, "pending", null, null,
        "2026-10-01T09:00:00Z", "2026-10-01T09:15:00Z", null, "1", etag)
    private val proposed = AgentRunDto(runId, spaceId, "Add a task to water the plants tomorrow", "waiting_for_approval", null, null, null, null,
        approval, "2026-10-01T09:00:00Z", "2026-10-01T09:00:00Z", null, "2")
    private val asking = proposed.copy(message = "Remind me about water the plants", status = "waiting_for_user", approval = null,
        question = AgentQuestionDto(questionId, "What time should I remind you?", "2026-10-01T09:15:00Z"))
    private val memory = AgentMemoryDto(memoryId, "note", null, "Note", "The spare key is under the blue pot", "approved_request", runId, "2026-10-01T09:00:00Z")
    private fun ready(vararg runs: AgentRunDto) = AgentState(accountId = accountId, spaces = listOf(space), spacesLoaded = true, spaceId = spaceId,
        runs = runs.toList(), runsLoaded = true)

    @Test fun theExactChangeIsShownAndOnlyATapOnApproveDecides() {
        val decisions = mutableListOf<Pair<String, Boolean>>()
        compose.setContent { CommunityTheme { AgentScreen(ready(proposed), AgentActions(decide = { run, approve -> decisions += run to approve })) } }
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-check-$runId"))
        compose.onNodeWithTag("agent-check-$runId").assertTextContains("Check this before I do it")
        compose.onNodeWithTag("agent-status-$runId").assertTextContains("Needs your approval")
        for ((index, field) in fields.withIndex()) {
            compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-field-$runId-$index"))
            compose.onNodeWithTag("agent-field-$runId-$index").assertTextContains(field.label).assertTextContains(field.value)
        }
        compose.runOnIdle { assertTrue(decisions.isEmpty()) }
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-approve-$runId"))
        capture("agent-native-approval.png")
        compose.onNodeWithTag("agent-approve-$runId").assertTextContains("Approve").performClick()
        compose.onNodeWithTag("agent-reject-$runId").assertTextContains("Don't do it").performClick()
        compose.runOnIdle { assertEquals(listOf(runId to true, runId to false), decisions) }
    }

    @Test fun anUnconfirmedApprovalOffersOnlyApproveAgainWithTheSameCommand() {
        val command = AgentCommand.Decide(accountId, spaceId, runId, approvalId, etag, true, "5c8b2e1f-45d6-4e80-8b3c-2d4e6f8a0b1c")
        var retries = 0
        var discards = 0
        val decisions = mutableListOf<Pair<String, Boolean>>()
        val state = ready(proposed).copy(pending = command, issue = AgentIssue.UNCERTAIN, at = runId)
        compose.setContent { CommunityTheme { AgentScreen(state, AgentActions(retry = { retries += 1 }, discard = { discards += 1 },
            decide = { run, approve -> decisions += run to approve })) } }
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-run-$runId-issue"))
        compose.onNodeWithTag("agent-run-$runId-issue").assertTextContains("No connection. Your changes are not confirmed.")
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-ask"))
        compose.onNodeWithTag("agent-ask").assertIsNotEnabled()
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-approve-$runId"))
        compose.onNodeWithTag("agent-reject-$runId").assertIsNotEnabled()
        // Scrolling to the run's list item can leave its buttons below the screen's edge (as on a Pixel 5, whose camera
        // cutout takes more height), and a tap there reaches nothing; scroll to each button itself before tapping it.
        compose.onNodeWithTag("agent-approve-$runId").performScrollTo().assertTextContains("Approve again").performClick()
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-discard-$runId"))
        compose.onNodeWithTag("agent-discard-$runId").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(1, discards); assertTrue(decisions.isEmpty()) }
    }

    @Test fun aQuestionIsAnsweredInPlaceAndTheAnswerNeedsText() {
        var state by mutableStateOf(ready(asking))
        val answers = mutableListOf<String>()
        val stops = mutableListOf<String>()
        compose.setContent { CommunityTheme { AgentScreen(state, AgentActions(reply = { run, text -> state = state.copy(replies = state.replies + (run to text)) },
            answer = { answers += it }, stop = { stops += it })) } }
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-question-$runId"))
        compose.onNodeWithTag("agent-question-$runId").assertTextContains("What time should I remind you?")
        compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag("agent-answer-$runId"))
        compose.onNodeWithTag("agent-answer-$runId").assertIsNotEnabled()
        compose.onNodeWithTag("agent-reply-$runId").performTextInput("6 pm")
        compose.onNodeWithTag("agent-answer-$runId").assertIsEnabled().performClick()
        compose.onNodeWithTag("agent-stop-$runId").performClick()
        compose.runOnIdle { assertEquals(listOf(runId), answers); assertEquals(listOf(runId), stops); assertEquals("6 pm", state.replies[runId]) }
    }

    @Test fun aMemoryIsDeletedOnlyFromTheConfirmationThatNamesIt() {
        var state by mutableStateOf(AgentState(accountId = accountId, spaces = listOf(space), spacesLoaded = true, spaceId = spaceId,
            view = AgentView.MEMORIES, memories = listOf(memory), memoriesLoaded = true))
        val forgotten = mutableListOf<String>()
        compose.setContent { CommunityTheme { AgentScreen(state, AgentActions(askForget = { state = state.copy(confirmingForget = it) },
            keep = { state = state.copy(confirmingForget = null) }, forget = { forgotten += state.confirmingForget!!.id; state = state.copy(confirmingForget = null) })) } }
        compose.onNodeWithContentDescription("Delete memory: ${memory.content}").performClick()
        compose.onNodeWithText("Note: ${memory.content}").assertIsDisplayed()
        compose.onNodeWithText("The agent stops using it right away. This cannot be undone.").assertIsDisplayed()
        compose.onNodeWithTag("agent-forget-dialog-cancel").assertTextContains("Keep it").performClick()
        compose.runOnIdle { assertTrue(forgotten.isEmpty()) }
        compose.onNodeWithContentDescription("Delete memory: ${memory.content}").performClick()
        compose.onNodeWithTag("agent-forget-dialog-confirm").assertTextContains("Delete memory").performClick()
        compose.runOnIdle { assertEquals(listOf(memoryId), forgotten) }
    }

    @Test fun anUnconfirmedRequestKeepsItsTextAndOffersSendAgain() {
        val command = AgentCommand.Ask(accountId, spaceId, "Add a task to water the plants tomorrow", "4b7a1d0e-34c5-4d7f-9a2b-1c3d5e7f9a0b")
        var retries = 0
        var discards = 0
        val state = ready().copy(message = command.message, pending = command, issue = AgentIssue.UNCERTAIN, at = AGENT_AT_COMPOSER)
        compose.setContent { CommunityTheme { AgentScreen(state, AgentActions(retry = { retries += 1 }, discard = { discards += 1 })) } }
        compose.onNodeWithTag("agent-message").assertTextContains(command.message).assertIsNotEnabled()
        compose.onNodeWithTag("agent-composer-issue").assertTextContains("No connection. Your changes are not confirmed.")
        compose.onNodeWithTag("agent-show-memories").assertIsNotEnabled()
        compose.onNodeWithTag("agent-ask").assertTextContains("Send again").performClick()
        compose.onNodeWithTag("agent-edit").performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(1, discards) }
    }

    @Test fun atNarrowWidthAndDoubleTextTheRequestCardStaysInsideTheScreen() {
        val long = proposed.copy(message = "Add a task called Water-" + "A".repeat(70) + " tomorrow",
            approval = approval.copy(fields = fields.map { if (it.label == "Title") it.copy(value = "Water-" + "A".repeat(70)) else it }))
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { AgentScreen(ready(long), AgentActions()) } }
            }
        }
        for (tag in listOf("agent-ask", "agent-run-$runId", "agent-field-$runId-1", "agent-approve-$runId", "agent-reject-$runId")) {
            // At double text a card is taller than the screen, so scroll to the exact node, not only to its list item.
            compose.onNodeWithTag("agent-content").performScrollToNode(hasTestTag(tag))
            compose.onNodeWithTag(tag).performScrollTo().assertIsDisplayed()
            val parent = compose.onNodeWithTag("agent-content").fetchSemanticsNode().boundsInRoot
            val child = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue(tag, child.left >= parent.left && child.right <= parent.right)
        }
        capture("agent-native-large-text.png")
    }

    private fun capture(name: String) {
        val image = compose.onRoot().captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("test-evidence"), name)
        file.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(file.length() > 1000)
    }
}
