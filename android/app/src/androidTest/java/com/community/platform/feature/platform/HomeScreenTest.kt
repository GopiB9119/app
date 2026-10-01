package com.community.platform.feature.platform

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.feature.community.PostDto
import com.community.platform.feature.planning.CalendarEntryDto
import com.community.platform.feature.scheduling.InboxNotificationDto
import com.community.platform.feature.scheduling.ReminderRecipientDto
import com.community.platform.feature.scheduling.ReminderRequestDto
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import com.community.platform.feature.spaces.JoinReviewDto
import com.community.platform.feature.spaces.SpaceDto
import com.community.platform.feature.spaces.SpaceInvitationDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.io.File
import java.time.LocalDate
import kotlin.math.ceil

@RunWith(AndroidJUnit4::class)
class HomeScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val family = SpaceDto("c2937183-70fb-4d7a-b0b6-b1bc9c499444", "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z")
    private val group = SpaceDto("5b1d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4", "Walking group", "group", "public", "active", "owner", "1", "2026-09-19T10:00:00Z")
    private val invitation = SpaceInvitationDto("11111111-1111-4111-8111-111111111111", "6c2e3d2f-4a5b-4c6d-9e7f-8091a2b3c4d5", "Lee family", "Sam Lee", accountId, "member", "pending", "2026-09-30T10:00:00Z", "2026-10-03T00:00:00Z")
    private val join = JoinReviewDto("22222222-2222-4222-8222-222222222222", "0f97b948-9800-432f-9d15-407df739d08e", "Robin", "", "2026-10-01T05:00:00Z", "2026-10-08T05:00:00Z")
    private val request = ReminderRequestDto("33333333-3333-4333-8333-333333333333", "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03", family.id, "Water the plants", "1",
        ReminderRecipientDto("0f97b948-9800-432f-9d15-407df739d08e", "Sam"), ReminderRecipientDto(accountId, "Alex"), "18:00", "UTC", "2026-10-01T18:00:00Z",
        "2026-10-02T18:00:00Z", "2026-10-04T06:00:00Z", "2026-10-01T05:00:00Z", null, "pending", false, null, "1", "in_app")
    private val reminder = InboxNotificationDto("44444444-4444-4444-8444-444444444444", "8b2eac20-1b89-4e77-8c4b-3b3b9f8b3c04", "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03",
        family.id, "Take the bins out", "2026-10-01T05:30:00Z", "2026-10-01T05:30:00Z", null, null)
    private val task = CalendarEntryDto("55555555-5555-4555-8555-555555555501", "task", "55555555-5555-4555-8555-555555555501", family.id, "Buy groceries", "2026-10-01", null, null, "open", false)
    private val event = CalendarEntryDto("55555555-5555-4555-8555-555555555502", "event", null, group.id, "Evening walk", "2026-10-01", "2026-10-01T13:00:00Z", "UTC", "scheduled", false)
    private val post = PostDto("a1b2c3d4-0000-4000-8000-000000000001", "a1b2c3d4-0000-4000-8000-000000000002", "river-walkers", "River walkers",
        "Sunday walk", "Meet at the bridge.", "published", 0, 0, "2026-10-01T04:00:00Z", "2026-10-01T04:00:00Z", null, false, false, false, null)
    private fun <T> ready(value: T) = Loadable(loading = false, failed = false, value = value)
    private fun <T> broken() = Loadable<T>(loading = false, failed = true)
    private fun state() = HomeState(
        accountId = accountId, timezone = "UTC", today = LocalDate.parse("2026-10-01"),
        spaces = ready(listOf(family, group)), invitations = ready(listOf(invitation)), joins = mapOf(group.id to ready(listOf(join))),
        requests = ready(listOf(request)), inbox = ready(listOf(reminder)), unreadCount = 2,
        days = mapOf(family.id to ready(listOf(task)), group.id to ready(listOf(event))), posts = ready(listOf(post)),
    )

    private fun reveal(tag: String) {
        compose.onNodeWithTag("home-content").performScrollToNode(hasTestTag(tag))
        compose.onNodeWithTag(tag).performScrollTo()
    }

    @Test fun everySectionShowsItsItemsAndEachLinkOpensTheMatchingScreen() {
        val opened = mutableListOf<String>()
        val links = HomeLinks(
            inbox = { opened += "inbox" }, search = { opened += "search" }, calendar = { opened += "calendar" }, medicines = { opened += "medicines" },
            spaces = { opened += "spaces" }, reminders = { opened += "reminders" }, entry = { entry, space -> opened += "entry:${entry.kind}:${space?.name}" },
            tasks = { opened += "tasks:${it.name}" }, feed = { opened += "feed" }, findPages = { opened += "find" }, post = { opened += "post:${it.title}" },
        )
        compose.setContent { CommunityTheme { HomeScreen(state(), HomeActions(), links) } }
        compose.onNodeWithContentDescription("Inbox, 2 unread").assertIsDisplayed()
        val steps = listOf(
            "home-search" to "search", "home-inbox" to "inbox", "home-calendar" to "calendar", "home-medicines" to "medicines",
            "home-invitation-${invitation.id}-action" to "spaces", "home-join-${join.id}-action" to "spaces",
            "home-request-${request.id}-action" to "reminders", "home-reminder-${reminder.id}-action" to "inbox", "home-attention-all" to "inbox",
            "home-today-task-${task.id}-action" to "entry:task:Morgan family", "home-today-event-${event.id}-action" to "entry:event:Walking group",
            "home-today-all" to "calendar", "home-space-${family.id}-action" to "tasks:Morgan family", "home-spaces-all" to "spaces",
            "home-post-${post.id}-action" to "post:Sunday walk", "home-pages-all" to "feed",
        )
        for ((tag, expected) in steps) {
            if (tag.startsWith("home-") && tag != "home-search" && tag != "home-inbox") reveal(tag)
            compose.onNodeWithTag(tag).performClick()
            compose.runOnIdle { assertEquals(tag, expected, opened.last()) }
        }
        reveal("home-attention")
        compose.onNodeWithText("Sam Lee invited you to Lee family").assertIsDisplayed()
        compose.onNodeWithText("Robin asks to join Walking group").assertIsDisplayed()
        compose.onNodeWithText("Sam asks to remind you: Water the plants").assertIsDisplayed()
        compose.onNodeWithText("Reminder: Take the bins out").assertIsDisplayed()
        reveal("home-today-event-${event.id}")
        compose.onNodeWithText("13:00 · Event · Walking group").assertIsDisplayed()
        compose.onNodeWithText("Task due · Morgan family").assertExists()
        reveal("home-space-${group.id}")
        compose.onNodeWithText("Group · Owner").assertIsDisplayed()
        compose.onNodeWithContentDescription("Read Sunday walk").assertExists()
    }

    @Test fun aFailedSectionOffersItsOwnRetryWhileTheOthersStayUsable() {
        val retried = mutableListOf<String>()
        val actions = HomeActions(retryInvitations = { retried += "invitations" }, retryDay = { retried += "day:$it" }, retryPosts = { retried += "posts" }, retryJoins = { retried += "joins" })
        val current = state().copy(invitations = broken(), days = mapOf(family.id to ready(listOf(task)), group.id to broken()), posts = broken(),
            joins = mapOf(group.id to Loadable()))
        compose.setContent { CommunityTheme { HomeScreen(current, actions, HomeLinks()) } }
        reveal("home-attention-failed-0-retry")
        compose.onNodeWithText("Couldn't check invitations.").assertIsDisplayed()
        compose.onNodeWithText("Checking join requests").assertIsDisplayed()
        compose.onNodeWithText("Sam asks to remind you: Water the plants").assertIsDisplayed()
        compose.onNodeWithTag("home-attention-failed-0-retry").performClick()
        reveal("home-today-failed-${group.id}-retry")
        compose.onNodeWithText("Couldn't load today's plans in Walking group.").assertIsDisplayed()
        compose.onNodeWithTag("home-today-failed-${group.id}-retry").performClick()
        reveal("home-today-task-${task.id}")
        reveal("home-pages-failed-retry")
        compose.onNodeWithTag("home-pages-failed-retry").performClick()
        compose.runOnIdle { assertEquals(listOf("invitations", "day:${group.id}", "posts"), retried) }
    }

    @Test fun emptySectionsSayWhatIsNextAndLoadingSectionsSaySo() {
        val opened = mutableListOf<String>()
        val empty = HomeState(accountId = accountId, timezone = "UTC", today = LocalDate.parse("2026-10-01"), spaces = ready(emptyList()),
            invitations = ready(emptyList()), requests = ready(emptyList()), inbox = ready(emptyList()), unreadCount = 0, posts = ready(emptyList()))
        compose.setContent { CommunityTheme { HomeScreen(empty, HomeActions(), HomeLinks(spaces = { opened += "spaces" }, findPages = { opened += "find" })) } }
        compose.onNodeWithContentDescription("Inbox").assertIsDisplayed()
        compose.onNodeWithText("Nothing needs your attention.").assertIsDisplayed()
        reveal("home-spaces-create")
        compose.onNodeWithText("Nothing planned for today.").assertExists()
        compose.onNodeWithText("You are not in a Space yet.").assertIsDisplayed()
        compose.onNodeWithTag("home-spaces-create").performClick()
        reveal("home-pages-find")
        compose.onNodeWithText("Pages you follow have not posted yet.").assertIsDisplayed()
        compose.onNodeWithTag("home-pages-find").performClick()
        compose.runOnIdle { assertEquals(listOf("spaces", "find"), opened) }
    }

    @Test fun theBarNamesFiveSectionsAndMarksTheCurrentOne() {
        val chosen = mutableListOf<MainSection>()
        compose.setContent { CommunityTheme { MainNavigationBar(MainBar(MainSection.SPACES, true), onSelect = { chosen += it }) } }
        for (label in listOf("Home", "Spaces", "Messages", "Discover", "Profile")) compose.onNodeWithText(label).assertIsDisplayed()
        compose.onNodeWithTag("main-spaces").performClick()
        compose.onNodeWithTag("main-messages").performClick()
        compose.runOnIdle { assertEquals(listOf(MainSection.MESSAGES), chosen) }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsHomeActionsAndTheBarLabelsWhole() {
        assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
        compose.setContent {
            CommunityTheme {
                Column(Modifier.width(320.dp).fillMaxHeight()) {
                    Box(Modifier.fillMaxWidth().weight(1f)) { HomeScreen(state(), HomeActions(), HomeLinks()) }
                    MainNavigationBar(MainBar(MainSection.HOME, true), onSelect = {})
                }
            }
        }
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNode(hasText("Home") and hasAnyAncestor(hasTestTag("main-home")), useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { readLayout -> assertTrue(readLayout(layouts)) }
        assertEquals(2f, layouts.single().layoutInput.density.fontScale, 0.01f)
        capture("home-native-large-text.png")
        for (section in MainSection.entries) {
            val label = InstrumentationRegistry.getInstrumentation().targetContext.getString(section.label)
            val found = mutableListOf<TextLayoutResult>()
            compose.onNode(hasText(label) and hasAnyAncestor(hasTestTag(section.tag)), useUnmergedTree = true)
                .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { readLayout -> assertTrue(readLayout(found)) }
            assertFalse("$label is cut off", found.single().cutOff())
            val item = compose.onNodeWithTag(section.tag).fetchSemanticsNode().boundsInRoot
            val text = compose.onNode(hasText(label) and hasAnyAncestor(hasTestTag(section.tag)), useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
            assertTrue("$label leaves its item", text.left >= item.left && text.right <= item.right)
        }
        val parent = compose.onNodeWithTag("home-content").fetchSemanticsNode().boundsInRoot
        for (tag in listOf("home-request-${request.id}-action", "home-today-event-${event.id}-action", "home-space-${family.id}-action", "home-post-${post.id}-action", "home-pages-all")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsDisplayed()
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue("$tag leaves the screen", bounds.left >= parent.left && bounds.right <= parent.right)
        }
        capture("home-native-large-text-end.png")
    }

    // The control for the check above: a label squeezed into 20 dp has to count as cut off.
    @Test fun theCutOffCheckCatchesALabelThatDoesNotFit() {
        compose.setContent { CommunityTheme { Box(Modifier.width(20.dp)) { Text("Messages", Modifier.testTag("squeezed"), maxLines = 1, softWrap = false) } } }
        val found = mutableListOf<TextLayoutResult>()
        compose.onNodeWithTag("squeezed").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { readLayout -> assertTrue(readLayout(found)) }
        assertTrue(found.single().cutOff())
    }

    // The semantics action lays the text out again at the full width it was offered, so its didOverflowWidth is true whenever a
    // label is narrower than that width. A label is cut off when it is laid out narrower than its text needs.
    private fun TextLayoutResult.cutOff() = size.width < ceil(multiParagraph.intrinsics.maxIntrinsicWidth).toInt()

    private fun capture(name: String) {
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        val file = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("test-evidence"), name)
        file.outputStream().use { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(file.length() > 1000)
    }
}
