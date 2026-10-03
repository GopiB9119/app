package com.community.platform.feature.messaging

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.community.platform.CommunityTheme
import com.community.platform.feature.InLanguage
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
