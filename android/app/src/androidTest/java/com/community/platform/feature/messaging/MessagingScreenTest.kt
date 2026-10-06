package com.community.platform.feature.messaging

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.community.platform.CommunityTheme
import com.community.platform.feature.InLanguage
import com.community.platform.feature.agents.AgentApprovalDto
import com.community.platform.feature.agents.AgentFieldDto
import com.community.platform.feature.agents.AgentQuestionDto
import com.community.platform.feature.agents.AgentRunDto
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.saveEvidence
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.time.Instant

/** Replies, reactions and edits in a chat (T162, DEC-033) built from synthetic state; the callbacks stand in for the view model. */
@RunWith(AndroidJUnit4::class)
class MessagingScreenTest {
    private val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val samId = "0f97b948-9800-432f-9d15-407df739d08e"
    private val conversation = ConversationDto(
        "5b1d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4", "c2937183-70fb-4d7a-b0b6-b1bc9c499444", "Morgan, Patel and Okafor families", "space",
        "Morgan, Patel and Okafor families", emptyList(), true, "server", "2", "2", 0, "2026-10-03T08:05:00Z", "2026-10-01T05:00:00Z",
    )
    private val original = MessageDto(
        "11111111-1111-4111-8111-111111111111", conversation.id, "1", samId, "Sam Rivera-Okafor", false, null, "sent",
        "Who can bring the folding chairs and the big blue cooler to the picnic on Saturday morning? We need them by nine.",
        "2026-10-03T08:00:00Z", null,
    )
    // Sent a minute ago, so it can still be edited.
    private fun answer() = MessageDto(
        "22222222-2222-4222-8222-222222222222", conversation.id, "2", accountId, "Alex", true, null, "sent", "I will bring the chairs.",
        Instant.now().minusSeconds(60).toString(), null, editedAt = Instant.now().minusSeconds(30).toString(),
        replyTo = ReplyDto(original.id, "sent", "1", original.senderName, original.body),
        reactions = listOf(ReactionDto("like", 2, true), ReactionDto("thanks", 1, false)), revision = 3,
    )

    @DeviceFontScale(2f)
    @Test fun repliesReactionsAndEditsStayUsableAt320DpAnd200PercentText() {
        assertNarrowScreen()
        var chat by mutableStateOf(ChatState(conversation, messages = listOf(original, answer()), loading = false))
        val reacted = mutableListOf<Triple<String, String, Boolean>>()
        val actions = MessagingActions(
            startReply = { chat = chat.copy(replyingTo = it) },
            cancelReply = { chat = chat.copy(replyingTo = null) },
            react = { message, reaction, on -> reacted += Triple(message.position, reaction, on) },
            startEdit = { chat = chat.copy(editing = it.id, editDraft = it.body.orEmpty()) },
            cancelEdit = { chat = chat.copy(editing = null, editDraft = "") },
        )
        compose.setContent { CommunityTheme { MessagingScreen(MessagingState(accountId = accountId, chat = chat), actions, "UTC") {} } }

        // At 200% each message nearly fills the list, so the newest is checked first and the test then only moves up:
        // scrolling back down to a message the list has already let go of did not finish on this toolchain.
        compose.assertReachable("chat-messages", "message-quote")
        compose.assertReachable("chat-messages", "message-edited-2")
        for (tag in listOf("reaction-2-like", "reaction-2-thanks", "message-reply-2", "message-react-2", "message-edit-2")) {
            compose.assertReachable("chat-messages", tag)
            compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
        }
        compose.assertReachable("chat-messages", "reaction-2-like")
        compose.onNodeWithTag("reaction-2-like").assertIsSelected().assert(hasContentDescription("Like: 2, including you")).performClick()
        compose.runOnIdle { assertEquals(listOf(Triple("2", "like", false)), reacted) }

        compose.assertReachable("chat-messages", "message-edit-2")
        compose.onNodeWithTag("message-edit-2").performClick()
        for (tag in listOf("message-edit-field", "message-edit-save", "message-edit-cancel")) compose.assertReachable("chat-messages", tag)
        compose.onNodeWithTag("message-edit-save").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithTag("message-edit-cancel").assertHeightIsAtLeast(48.dp)
        compose.onRoot().saveEvidence("chat-edit-large-text.png")
        compose.onNodeWithTag("message-edit-cancel").performClick()
        compose.onNodeWithTag("message-edit-field").assertDoesNotExist()

        for (tag in listOf("message-reply-1", "message-react-1")) {
            compose.assertReachable("chat-messages", tag)
            compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
        }
        compose.onNodeWithTag("message-edit-1").assertDoesNotExist()
        compose.onNodeWithTag("message-react-1").performClick()
        for (reaction in REACTIONS) {
            compose.assertReachable("chat-messages", "reaction-choice-$reaction")
            compose.onNodeWithTag("reaction-choice-$reaction").assertHeightIsAtLeast(48.dp)
        }
        compose.onRoot().saveEvidence("chat-reactions-large-text.png")
        compose.onNodeWithTag("reaction-choice-thanks").performClick()
        compose.runOnIdle { assertEquals(Triple("1", "thanks", true), reacted.last()) }

        // While answering, the message, the cancel and the composer are all still on screen.
        compose.assertReachable("chat-messages", "message-reply-1")
        compose.onNodeWithTag("message-reply-1").performClick()
        compose.onNodeWithTag("reply-bar").assertIsDisplayed()
        compose.onNodeWithTag("reply-cancel").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        compose.onNodeWithTag("message-composer").assertIsDisplayed()
        compose.onNodeWithTag("message-send").assertIsDisplayed()
        // The list keeps room for messages between the header and the reply bar.
        compose.onNodeWithTag("chat-messages").assertHeightIsAtLeast(96.dp)
        compose.onRoot().saveEvidence("chat-reply-large-text.png")
        compose.onNodeWithTag("reply-cancel").performClick()
        compose.onNodeWithTag("reply-bar").assertDoesNotExist()
    }

    // Telugu and Hindi labels are longer and taller; only the newest message is used, so the list never scrolls back.
    @DeviceFontScale(2f)
    @Test fun teluguAndHindiRepliesAndEditsStayUsableAt320DpAnd200PercentText() {
        assertNarrowScreen()
        var language by mutableStateOf("te")
        var chat by mutableStateOf(ChatState(conversation, messages = listOf(original, answer()), loading = false))
        val actions = MessagingActions(
            startReply = { chat = chat.copy(replyingTo = it) },
            cancelReply = { chat = chat.copy(replyingTo = null) },
            startEdit = { chat = chat.copy(editing = it.id, editDraft = it.body.orEmpty()) },
            cancelEdit = { chat = chat.copy(editing = null, editDraft = "") },
        )
        compose.setContent { CommunityTheme { InLanguage(language) { MessagingScreen(MessagingState(accountId = accountId, chat = chat), actions, "UTC") {} } } }
        for (current in listOf("te", "hi")) {
            compose.runOnIdle { language = current }
            for (tag in listOf("message-reply-2", "message-react-2", "message-edit-2")) {
                compose.assertReachable("chat-messages", tag)
                compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
            }
            compose.onNodeWithTag("message-reply-2").performClick()
            compose.onNodeWithTag("reply-cancel").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
            compose.onNodeWithTag("message-composer").assertIsDisplayed()
            compose.onNodeWithTag("chat-messages").assertHeightIsAtLeast(96.dp)
            compose.onRoot().saveEvidence("chat-reply-$current-large-text.png")
            compose.onNodeWithTag("reply-cancel").performClick()
            compose.assertReachable("chat-messages", "message-edit-2")
            compose.onNodeWithTag("message-edit-2").performClick()
            for (tag in listOf("message-edit-field", "message-edit-save", "message-edit-cancel")) compose.assertReachable("chat-messages", tag)
            compose.onNodeWithTag("message-edit-save").assertHeightIsAtLeast(48.dp)
            compose.onNodeWithTag("message-edit-cancel").assertHeightIsAtLeast(48.dp).performClick()
            compose.onNodeWithTag("message-edit-field").assertDoesNotExist()
        }
    }

    private val agentId = "6d8e4f2a-1b3c-5d7e-9f0a-2b4c6d8e0f1a"
    // The author's own message that asked the agent (DEC-046), sent two minutes ago.
    private fun request(position: String, body: String, status: AgentRequestDto) = MessageDto(
        "3333333$position-3333-4333-8333-333333333333", conversation.id, position, accountId, "Alex", true, "7777777$position-7777-4777-8777-777777777777",
        "sent", body, Instant.now().minusSeconds(120).toString(), null, agentRequest = status,
    )

    @DeviceFontScale(2f)
    @Test fun agentRepliesAndRequestStatusesStayUsableAt320DpAnd200PercentText() {
        assertNarrowScreen()
        val waiting = request("1", "@agent add a task to buy milk tomorrow", AgentRequestDto("waiting", "44444444-4444-4444-8444-444444444444"))
        val reply = MessageDto(
            "55555555-5555-4555-8555-555555555555", conversation.id, "2", agentId, "Agent", false, null, "sent",
            "Alex, I prepared this for you to approve: Create the task \"Buy milk\" due tomorrow. Open your Agent screen to review it. Nothing changes until you approve it there.",
            Instant.now().minusSeconds(90).toString(), null, replyTo = ReplyDto(waiting.id, "sent", "1", "Alex", waiting.body), fromAgent = true,
        )
        val failed = request("3", "@agent what is on this week", AgentRequestDto("failed", null))
        var chat by mutableStateOf(ChatState(conversation, messages = listOf(waiting, reply, failed), loading = false))
        val reviewed = mutableListOf<String>()
        val askedAgain = mutableListOf<String>()
        val actions = MessagingActions(askAgentAgain = { askedAgain += it.position }, openAgentReview = { reviewed += it })
        compose.setContent { CommunityTheme { MessagingScreen(MessagingState(accountId = accountId, chat = chat), actions, "UTC") {} } }

        // Newest first, then only upwards, as in the reply test.
        compose.assertReachable("chat-messages", "agent-ask-again-3")
        compose.onNodeWithTag("agent-ask-again-3").assertHeightIsAtLeast(48.dp).performClick()
        compose.runOnIdle { assertEquals(listOf("3"), askedAgain) }
        compose.assertReachable("chat-messages", "message-agent-2")
        compose.onNodeWithTag("message-delete-2").assertDoesNotExist()
        compose.onNodeWithTag("message-edit-2").assertDoesNotExist()
        compose.assertReachable("chat-messages", "agent-open-1")
        compose.onNodeWithTag("agent-open-1").assertHeightIsAtLeast(48.dp).performClick()
        compose.runOnIdle { assertEquals(listOf(waiting.id), reviewed) }
        compose.onRoot().saveEvidence("chat-agent-large-text.png")

        // The hint shows only while the draft asks the agent, and the list keeps room for messages.
        compose.runOnIdle { chat = chat.copy(draft = "Write to sam@agent.example") }
        compose.onNodeWithTag("agent-hint", useUnmergedTree = true).assertDoesNotExist()
        compose.runOnIdle { chat = chat.copy(draft = "@agent what is due today") }
        compose.onNodeWithTag("agent-hint", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("chat-messages").assertHeightIsAtLeast(96.dp)
        compose.onRoot().saveEvidence("chat-agent-hint-large-text.png")
    }

    @DeviceFontScale(2f)
    @Test fun privateTaskUpdateReviewStaysUsableAt320DpAnd200PercentText() {
        assertNarrowScreen()
        val runId = "44444444-4444-4444-8444-444444444444"
        val source = request("1", "@agent change the task title", AgentRequestDto("private", runId))
        val run = AgentRunDto(
            runId, conversation.spaceId, "Change the task title and keep its due date", "waiting_for_approval", null, null, null, null,
            AgentApprovalDto("55555555-5555-4555-8555-555555555555", runId, conversation.spaceId, "tasks.update", "low",
                "Update only the task title.", listOf(
                    AgentFieldDto("Task", "Water the plants"), AgentFieldDto("Title", "Water the garden"),
                    AgentFieldDto("Due date", "6 October 2026"), AgentFieldDto("Assigned to", "Nobody"),
                ), "pending", null, null, "2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z", null, "1", "\"${"a".repeat(64)}\""),
            "2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z", null, "1",
        )
        val chat = ChatState(conversation, messages = listOf(source), loading = false,
            agentReview = AgentReviewState(source.id, runId, run = run))
        val decisions = mutableListOf<Boolean>()
        compose.setContent {
            CommunityTheme {
                MessagingScreen(MessagingState(accountId = accountId, chat = chat),
                    MessagingActions(decideAgentReview = { decisions += it }), "UTC") {}
            }
        }

        for (tag in listOf("agent-review-title", "agent-review-status-$runId", "agent-review-approval-$runId", "agent-review-field-$runId-0",
            "agent-review-field-$runId-1", "agent-review-field-$runId-2", "agent-review-field-$runId-3", "agent-review-approve", "agent-review-reject")) {
            compose.assertReachable("chat-messages", tag)
        }
        compose.onNodeWithTag("agent-review-approve").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithTag("agent-review-reject").assertHeightIsAtLeast(48.dp)
        compose.onRoot().saveEvidence("chat-agent-review-large-text.png")
        compose.onNodeWithTag("agent-review-approve").performClick()
        compose.runOnIdle { assertEquals(listOf(true), decisions) }
    }

    @DeviceFontScale(2f)
    @Test fun privateAgentReviewUsesRefusalAndNotUnderstoodLabelsInAllLanguages() {
        assertNarrowScreen()
        val runId = "44444444-4444-4444-8444-444444444444"
        val source = request("1", "@agent do something", AgentRequestDto("private", runId))
        val baseRun = AgentRunDto(runId, conversation.spaceId, "Do something", "completed", "refused", null, "I can't do that.", null, null,
            "2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z", "1")
        var language by mutableStateOf("en")
        var current by mutableStateOf(baseRun)
        val chat = ChatState(conversation, messages = listOf(source), loading = false,
            agentReview = AgentReviewState(source.id, runId, run = current))
        compose.setContent {
            CommunityTheme {
                InLanguage(language) {
                    MessagingScreen(MessagingState(accountId = accountId, chat = chat.copy(
                        agentReview = chat.agentReview?.copy(run = current))), MessagingActions(), "UTC") {}
                }
            }
        }
        val expected = mapOf(
            "en" to listOf("Can't do that", "Not understood"),
            "te" to listOf("చేయలేను", "అర్థం కాలేదు"),
            "hi" to listOf("नहीं कर सकता", "समझ नहीं आया"),
        )
        val statusTag = "agent-review-status-$runId"
        for ((locale, labels) in expected) {
            compose.runOnIdle { language = locale }
            compose.assertReachable("chat-messages", statusTag)
            compose.onNodeWithTag(statusTag).assertIsDisplayed().assertTextContains(labels[0])
            compose.runOnIdle { current = baseRun.copy(outcome = "answered", intent = "unknown") }
            compose.assertReachable("chat-messages", statusTag)
            compose.onNodeWithTag(statusTag).assertIsDisplayed().assertTextContains(labels[1])
            compose.runOnIdle { current = baseRun }
        }
    }

    @DeviceFontScale(2f)
    @Test fun taskTitleClarificationStaysUsableInTeluguAndHindiAt320DpAnd200PercentText() {
        assertNarrowScreen()
        val runId = "66666666-6666-4666-8666-666666666666"
        val source = request("1", "@agent change the task title", AgentRequestDto("waiting", runId))
        val run = AgentRunDto(runId, conversation.spaceId, "Change the task title and keep its due date", "waiting_for_user", null, null, null,
            AgentQuestionDto("77777777-7777-4777-8777-777777777777", "What should the task be called?", "2026-10-05T10:00:00Z"), null,
            "2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z", null, "1")
        var language by mutableStateOf("te")
        val submitted = mutableListOf<Unit>()
        val chat = ChatState(conversation, messages = listOf(source), loading = false,
            agentReview = AgentReviewState(source.id, runId, run = run, answer = "Picnic groceries"))
        compose.setContent {
            CommunityTheme {
                InLanguage(language) {
                    MessagingScreen(MessagingState(accountId = accountId, chat = chat),
                        MessagingActions(answerAgentReview = { submitted += Unit }), "UTC") {}
                }
            }
        }

        for (current in listOf("te", "hi")) {
            compose.runOnIdle { language = current; submitted.clear() }
            for (tag in listOf("agent-review-title", "agent-review-status-$runId", "agent-review-question-$runId",
                "agent-review-answer-field", "agent-review-answer-submit")) compose.assertReachable("chat-messages", tag)
            compose.onNodeWithTag("agent-review-answer-submit").assertHeightIsAtLeast(48.dp)
            compose.onRoot().saveEvidence("chat-agent-title-$current-large-text.png")
            compose.onNodeWithTag("agent-review-answer-submit").performClick()
            compose.runOnIdle { assertEquals(1, submitted.size) }
        }
    }

    @DeviceFontScale(2f)
    @Test fun teluguAndHindiAgentStatusesStayUsableAt320DpAnd200PercentText() {
        assertNarrowScreen()
        var language by mutableStateOf("te")
        val failed = request("1", "@agent what is on this week", AgentRequestDto("failed", null))
        val chat = ChatState(conversation, messages = listOf(failed), loading = false, draft = "@agent help")
        compose.setContent { CommunityTheme { InLanguage(language) { MessagingScreen(MessagingState(accountId = accountId, chat = chat), MessagingActions(), "UTC") {} } } }
        for (current in listOf("te", "hi")) {
            compose.runOnIdle { language = current }
            compose.assertReachable("chat-messages", "agent-ask-again-1")
            compose.onNodeWithTag("agent-ask-again-1").assertHeightIsAtLeast(48.dp)
            compose.onNodeWithTag("agent-hint", useUnmergedTree = true).assertIsDisplayed()
            compose.onNodeWithTag("chat-messages").assertHeightIsAtLeast(96.dp)
            compose.onRoot().saveEvidence("chat-agent-$current-large-text.png")
        }
    }

    @Test fun aReadOnlyChatShowsReactionsButOffersNoActions() {
        val chat = ChatState(conversation.copy(canSend = false), messages = listOf(original, answer()), loading = false)
        compose.setContent { CommunityTheme { MessagingScreen(MessagingState(accountId = accountId, chat = chat), MessagingActions(), "UTC") {} } }
        compose.onNodeWithTag("chat-read-only").assertIsDisplayed()
        compose.onNodeWithTag("message-composer").assertDoesNotExist()
        compose.assertReachable("chat-messages", "message-quote")
        compose.assertReachable("chat-messages", "reaction-2-like")
        compose.onNodeWithTag("reaction-2-like").assertIsNotEnabled()
        for (tag in listOf("message-reply-2", "message-react-2", "message-edit-2")) compose.onNodeWithTag(tag).assertDoesNotExist()
        // Each message is brought into view first, so a missing action is really missing and not just off screen.
        compose.assertReachable("chat-messages", "message-1")
        for (tag in listOf("message-reply-1", "message-react-1")) compose.onNodeWithTag(tag).assertDoesNotExist()
    }
}
