package com.community.platform.feature.spaces

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasProgressBarRangeInfo
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
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.community.platform.CommunityTheme
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityApi
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.identity.SessionStore
import com.community.platform.feature.saveEvidence
import com.google.gson.Gson
import java.io.IOException
import java.lang.reflect.Proxy
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import retrofit2.Response

/**
 * Find groups and Group access. GroupScreen takes the view model itself rather than callbacks, so the stand-in sits one level
 * lower: the real GroupViewModel and GroupRepository answered by a synthetic GroupApi on the device, with an in-memory
 * session. Every request is recorded, can be held in flight, refused or lost, and none leaves the device.
 */
@RunWith(AndroidJUnit4::class)
class GroupScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val hikersId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val walkersId = "0f97b948-9800-432f-9d15-407df739d08e"
    private val choirId = "4b7a1d0e-34c5-4d7f-9a2b-1c3d5e7f9a0b"
    private val clubId = "5d2c8f3a-1b4e-4c6d-9e7f-0a1b2c3d4e5f"
    private val chessId = "6e3d9a4b-2c5f-4d7e-8f90-1b2c3d4e5f60"
    private val gardenId = "7a3e5c1d-2b4f-4a6e-8c0d-1e2f3a4b5c6d"
    private val quiltersId = "8f4e2d1c-3b5a-4c7d-9e8f-0a1b2c3d4e5f"
    private val hikers = SpaceDirectoryEntryDto(hikersId, "Weekend hikers", "Lake walks every Saturday morning.", 3, null, null, true)
    private val walkers = SpaceDirectoryEntryDto(walkersId, "Evening walkers", "", 5, null, "81a09cbf-901e-470c-a905-27d565be91ae", false)
    private val choir = SpaceDirectoryEntryDto(choirId, "Community choir", "Tuesday rehearsals.", 12, "member", null, false)
    private val books = SpaceDirectoryEntryDto(clubId, "Book club", "Monthly novels and tea.", 4, "owner", null, false)
    private val chess = SpaceDirectoryEntryDto(chessId, "Chess club", "", 6, "admin", null, false)
    private val garden = SpaceDirectoryEntryDto(gardenId, "Garden swap", "Seeds and cuttings.", 8, null, null, false)
    private val quilters = SpaceDirectoryEntryDto(quiltersId, "Quilting circle", "", 7, null, null, true)
    private val waiting = JoinRequestDto("81a09cbf-901e-470c-a905-27d565be91ae", walkersId, "Evening walkers", "I walk most evenings.", "pending", "2026-10-01T10:00:00Z", "2026-10-15T10:00:00Z", null)
    private val answered = listOf(
        JoinRequestDto("2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f", choirId, "Community choir", "", "approved", "2026-09-20T10:00:00Z", "2026-10-04T10:00:00Z", "2026-09-21T10:00:00Z"),
        JoinRequestDto("3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a", gardenId, "Garden swap", "", "declined", "2026-09-28T10:00:00Z", "2026-10-12T10:00:00Z", "2026-09-29T10:00:00Z"),
        JoinRequestDto("4e5f6a7b-8c9d-4e0f-9a1b-3c4d5e6f7a8b", "9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f", "Board games", "", "cancelled", "2026-09-22T10:00:00Z", "2026-10-06T10:00:00Z", "2026-09-23T10:00:00Z"),
        JoinRequestDto("5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c", "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d", "Running club", "", "closed", "2026-09-24T10:00:00Z", "2026-10-08T10:00:00Z", "2026-09-25T10:00:00Z"),
        JoinRequestDto("6a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d", "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e", "Photography walks", "", "expired", "2026-09-01T10:00:00Z", "2026-09-15T10:00:00Z", null),
    )
    private val club = SpaceDto(clubId, "Book club", "group", "private", "active", "owner", "2", "2026-09-19T10:00:00Z", "Monthly novels and tea.")
    private val clubSettings = SpaceSettingsDto(clubId, "Book club", "group", "private", "active", "owner", "2", "2026-09-19T10:00:00Z", "\"${"a".repeat(64)}\"", "Monthly novels and tea.")
    private val sam = JoinReviewDto("e36cd6c7-8a5f-40c8-88f4-e8c3fa4a6cff", "4d7dff75-e4b8-4686-b779-744cdb8d09fb", "Sam Example", "I read a lot of mysteries.", "2026-10-01T10:00:00Z", "2026-10-15T10:00:00Z")
    private val riya = JoinReviewDto("9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d", "Riya Example", "", "2026-10-01T11:00:00Z", "2026-10-15T11:00:00Z")
    private val note = "Hello! I walk every Saturday."
    private val offline = "No connection. Changes are not confirmed."
    private val unconfirmed = "The request was not confirmed. Retrying sends exactly the same request."
    private val publicNow = "Public: anyone signed in can find it and ask to join."
    private val privateNow = "Private: only people you invite."
    private val confirmPublic = "Anyone signed in will be able to find this group's name and description, see how many members it has, and ask to join. You approve each person. Chats, tasks, events and the member list stay private to members."
    private val confirmPrivate = "The group will disappear from Find groups. Anyone still waiting for an answer will see their request closed. Members and their content are not affected."
    private val loading = hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)
    private val noIdentityCalls = Proxy.newProxyInstance(IdentityApi::class.java.classLoader, arrayOf(IdentityApi::class.java)) { _, method, _ ->
        throw AssertionError("The group screen called the identity endpoint ${method.name}")
    } as IdentityApi
    private val api = StandInGroupApi()
    private val model = GroupViewModel(GroupRepository(api, AccountRepository(noIdentityCalls, SyntheticSession(accountId), Gson())))
    private var leaves = 0

    @After fun unbind() { compose.runOnUiThread { model.bind(null) } }

    private fun open(managedSpaceId: String? = null) {
        compose.setContent {
            val state by model.state.collectAsState()
            CommunityTheme { GroupScreen(state, model) { leaves += 1 } }
        }
        compose.runOnUiThread { model.bind(accountId, managedSpaceId) }
    }
    private fun settle() = compose.waitUntil("the group request to finish", 10_000) { !model.state.value.busy }
    private fun reach(held: Held) = compose.waitUntil("the held request to arrive", 10_000) { held.reached.isCompleted }
    // A list scroll only reaches the item; a card can be taller than the screen, so the node itself is then scrolled into view.
    private fun reveal(matcher: SemanticsMatcher) {
        compose.onNodeWithTag("group-workspace").performScrollToNode(matcher)
        compose.onNode(matcher).performScrollTo()
    }
    private fun reveal(tag: String) = reveal(hasTestTag(tag))
    // The list composes only what is near the screen, so a check that something at the end is gone first scrolls there.
    private fun scrollToEnd() { compose.onNodeWithTag("group-workspace").performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, 100_000f) } }
    private fun inCard(id: String, text: String) = hasText(text) and hasAnyAncestor(hasTestTag("group-$id"))
    private fun inReview(id: String, text: String) = hasText(text) and hasAnyAncestor(hasTestTag("group-review-$id"))
    private fun field(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().config[SemanticsProperties.EditableText].text
    private fun counter(id: String) = compose.onNode(hasText("/280", substring = true) and hasAnyAncestor(hasTestTag("group-$id")))
        .fetchSemanticsNode().config[SemanticsProperties.Text].joinToString { it.text }

    @Test fun findGroupsShowsLoadingEmptyAndFailedSearchesAndSearchingAgainSendsTheSameWords() {
        val first = Held()
        api.next("directory", first)
        open()
        reach(first)
        compose.onNode(loading).assertExists()
        compose.onNodeWithText("Find groups").assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to Spaces").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Refresh Spaces and invitations").assertIsNotEnabled()
        reveal("group-search-action")
        compose.onNodeWithTag("group-search").assertIsNotEnabled()
        compose.onNodeWithTag("group-search-action").assertIsNotEnabled()
        scrollToEnd()
        compose.onNodeWithText("No public groups match.").assertDoesNotExist()
        compose.onNodeWithText("You have not asked to join any group.").assertDoesNotExist()
        first.release.complete(Unit)
        settle()
        compose.onNode(loading).assertDoesNotExist()
        reveal(hasText("No public groups match."))
        compose.onNodeWithText("No public groups match.").assertIsDisplayed()
        reveal(hasText("You have not asked to join any group."))
        compose.onNodeWithText("You have not asked to join any group.").assertIsDisplayed()

        // A failed search shows the reason instead of "no groups", and the typed words stay for the next try.
        api.next("directory", Lost)
        reveal("group-search")
        compose.onNodeWithTag("group-search").performTextReplacement("  hikers ")
        compose.onNodeWithTag("group-search-action").performClick()
        settle()
        reveal(hasText(offline))
        compose.onNodeWithText(offline).assertIsDisplayed()
        compose.onNodeWithText("No public groups match.").assertDoesNotExist()
        reveal("group-search")
        assertEquals("  hikers ", field("group-search"))
        api.groups = listOf(hikers)
        compose.onNodeWithTag("group-search-action").assertIsEnabled().performClick()
        settle()
        compose.onNodeWithText(offline).assertDoesNotExist()
        reveal("group-$hikersId")
        compose.onNode(inCard(hikersId, "Weekend hikers")).assertIsDisplayed()
        compose.runOnIdle {
            assertEquals(listOf("directory q=null cursor=null", "mine", "directory q=hikers cursor=null", "directory q=hikers cursor=null"), api.calls.toList())
        }
    }

    @Test fun foundGroupsShowWhatThePersonCanDoAndTheirRequests() {
        api.groups = listOf(hikers, walkers, choir, books, chess, garden)
        api.nextCursor = "synthetic-next-page"
        api.nextPage = listOf(quilters)
        api.mine = listOf(waiting) + answered
        open()
        settle()
        reveal("group-$hikersId")
        compose.onNode(inCard(hikersId, "Lake walks every Saturday morning.")).assertIsDisplayed()
        compose.onNode(inCard(hikersId, "Members: 3")).assertIsDisplayed()
        compose.onNodeWithTag("group-ask-$hikersId").assertTextEquals("Ask to join").assertIsEnabled()
        for ((group, label) in listOf(walkers to "Request sent", choir to "You are a member", books to "You own this group", chess to "You are an admin", garden to "Not accepting your request right now")) {
            reveal("group-${group.id}")
            compose.onNode(inCard(group.id, label)).assertIsDisplayed()
            compose.onNodeWithTag("group-ask-${group.id}").assertDoesNotExist()
        }
        reveal(inCard(walkersId, "Withdraw request"))
        compose.onNode(inCard(walkersId, "Withdraw request")).assertIsEnabled()

        reveal(hasText("Show more groups"))
        compose.onNodeWithText("Show more groups").performClick()
        settle()
        reveal("group-$quiltersId")
        compose.onNode(inCard(quiltersId, "Quilting circle")).assertIsDisplayed()
        compose.onNodeWithTag("group-ask-$quiltersId").assertIsEnabled()
        reveal(hasText("Your join requests"))
        compose.onNodeWithText("Show more groups").assertDoesNotExist()
        compose.onNodeWithText("You have not asked to join any group.").assertDoesNotExist()
        for (text in listOf("Waiting for review", "I walk most evenings.", "Approved", "Declined", "Withdrawn", "Closed: the group became private", "Expired")) {
            reveal(hasText(text))
            compose.onNodeWithText(text).assertIsDisplayed()
        }
        compose.runOnIdle { assertEquals("directory q=null cursor=synthetic-next-page", api.calls.last()) }
    }

    @Test fun askingToJoinOpensANoteForThatGroupAndCancelSendsNothing() {
        api.groups = listOf(hikers, quilters)
        open()
        settle()
        reveal("group-ask-$hikersId")
        compose.onNodeWithTag("group-ask-$hikersId").performClick()
        reveal("group-note")
        compose.onNodeWithText("Note to the owner or admins (optional)", useUnmergedTree = true).assertExists()
        assertEquals("0/280", counter(hikersId))
        compose.onNodeWithTag("group-note").performTextReplacement(note)
        assertEquals("${note.length}/280", counter(hikersId))
        // Only one group can be asked at a time.
        reveal("group-ask-$quiltersId")
        compose.onNodeWithTag("group-ask-$quiltersId").assertIsNotEnabled()
        reveal(inCard(hikersId, "Cancel"))
        compose.onNode(inCard(hikersId, "Cancel")).assertIsEnabled().performClick()
        compose.onNodeWithTag("group-note").assertDoesNotExist()
        compose.runOnIdle { assertTrue(api.calls.toString(), api.sent("ask").isEmpty()) }

        // Sending names exactly that group and the trimmed note; only the answer shows the request as sent.
        reveal("group-ask-$hikersId")
        compose.onNodeWithTag("group-ask-$hikersId").performClick()
        reveal("group-note")
        assertEquals("", field("group-note"))
        compose.onNodeWithTag("group-note").performTextReplacement("  $note  ")
        reveal("group-send")
        compose.onNodeWithTag("group-send").assertTextEquals("Send request").performClick()
        settle()
        val sent = api.sent("ask").single()
        assertTrue(sent, sent.startsWith("ask $hikersId key=") && sent.endsWith(" note=$note"))
        reveal(hasText("Request sent to Weekend hikers. The owner or an admin will review it."))
        reveal("group-$hikersId")
        compose.onNode(inCard(hikersId, "Request sent")).assertIsDisplayed()
        compose.onNodeWithTag("group-ask-$hikersId").assertDoesNotExist()
        compose.onNodeWithTag("group-note").assertDoesNotExist()
        reveal(hasText("Waiting for review"))
        compose.onNodeWithText(note).assertIsDisplayed()
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        api.groups = listOf(hikers, walkers, choir, books, chess, garden, quilters)
        api.mine = listOf(waiting) + answered
        open()
        settle()
        reveal("group-ask-$quiltersId")
        compose.onNodeWithTag("group-ask-$quiltersId").performClick()
        reveal("group-note")
        compose.onNodeWithTag("group-note").performTextReplacement(note)
        reveal("group-send")
        compose.onNodeWithTag("group-send").performClick()
        settle()
        // The message is the list's first item, far above the group that was asked.
        compose.onNodeWithText("Request sent to Quilting circle. The owner or an admin will review it.").assertIsDisplayed()
    }

    @Test fun aLostJoinRequestIsNotShownAsSentKeepsTheNoteAndRetrySendsTheSameRequest() {
        api.groups = listOf(hikers, quilters)
        open()
        settle()
        reveal("group-ask-$hikersId")
        compose.onNodeWithTag("group-ask-$hikersId").performClick()
        reveal("group-note")
        compose.onNodeWithTag("group-note").performTextReplacement(note)
        api.next("ask", Lost)
        reveal("group-send")
        compose.onNodeWithTag("group-send").performClick()
        settle()
        reveal(hasText(offline))
        compose.onNodeWithText(offline).assertIsDisplayed()
        compose.onNodeWithText("Request sent to Weekend hikers. The owner or an admin will review it.").assertDoesNotExist()
        reveal(inCard(hikersId, unconfirmed))
        compose.onNode(inCard(hikersId, "Request sent")).assertDoesNotExist()
        reveal("group-note")
        compose.onNodeWithTag("group-note").assertIsNotEnabled()
        assertEquals(note, field("group-note"))
        compose.onNode(inCard(hikersId, "Cancel")).assertIsNotEnabled().performClick()
        // Nothing else can start, and the screen is not left, while the request is unconfirmed.
        compose.onNodeWithContentDescription("Refresh Spaces and invitations").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        reveal("group-search-action")
        compose.onNodeWithTag("group-search").assertIsNotEnabled()
        compose.onNodeWithTag("group-search-action").assertIsNotEnabled()
        reveal("group-ask-$quiltersId")
        compose.onNodeWithTag("group-ask-$quiltersId").assertIsNotEnabled()
        reveal(hasText("You have not asked to join any group."))
        reveal("group-note")
        assertEquals(note, field("group-note"))
        compose.runOnIdle { assertEquals(0, leaves); assertEquals(1, api.sent("ask").size) }

        // The retry is in flight: it cannot be sent twice. Then exactly the same request goes again.
        val retry = Held()
        api.next("ask", retry)
        reveal("group-send")
        compose.onNodeWithTag("group-send").assertTextEquals("Retry request").assertIsEnabled().performClick()
        reach(retry)
        compose.onNode(loading).assertExists()
        compose.onNodeWithTag("group-send").assertIsNotEnabled().performClick()
        compose.onNodeWithTag("group-note").assertIsNotEnabled()
        retry.release.complete(Unit)
        settle()
        val asks = api.sent("ask")
        assertEquals(api.calls.toString(), 2, asks.size)
        assertEquals(asks[0], asks[1])
        assertTrue(asks[0], asks[0].endsWith(" note=$note"))
        reveal("group-$hikersId")
        compose.onNode(inCard(hikersId, "Request sent")).assertIsDisplayed()
    }

    @Test fun aRefusedJoinRequestShowsTheReasonAndKeepsTheNoteToEdit() {
        api.groups = listOf(hikers)
        open()
        settle()
        reveal("group-ask-$hikersId")
        compose.onNodeWithTag("group-ask-$hikersId").performClick()
        reveal("group-note")
        compose.onNodeWithTag("group-note").performTextReplacement(note)
        api.next("ask", Refused(409, "You can ask this group again after 9 October."))
        reveal("group-send")
        compose.onNodeWithTag("group-send").performClick()
        settle()
        reveal(hasText("You can ask this group again after 9 October."))
        compose.onNodeWithText("You can ask this group again after 9 October.").assertIsDisplayed()
        reveal("group-send")
        compose.onNodeWithTag("group-send").assertTextEquals("Send request").assertIsEnabled()
        compose.onNode(inCard(hikersId, unconfirmed)).assertDoesNotExist()
        compose.onNode(inCard(hikersId, "Request sent")).assertDoesNotExist()
        compose.onNode(inCard(hikersId, "Cancel")).assertIsEnabled()
        reveal("group-note")
        compose.onNodeWithTag("group-note").assertIsEnabled()
        assertEquals(note, field("group-note"))
    }

    @Test fun aRequestInFlightDisablesEveryFindGroupsControl() {
        api.groups = listOf(hikers, walkers)
        api.nextCursor = "synthetic-next-page"
        api.mine = listOf(waiting)
        open()
        settle()
        val held = Held()
        api.next("withdraw", held)
        reveal(inCard(walkersId, "Withdraw request"))
        compose.onNode(inCard(walkersId, "Withdraw request")).performClick()
        reach(held)
        val before = api.calls.size
        compose.onNode(loading).assertExists()
        compose.onNodeWithContentDescription("Back to Spaces").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Refresh Spaces and invitations").assertIsNotEnabled().performClick()
        reveal("group-search-action")
        compose.onNodeWithTag("group-search").assertIsNotEnabled()
        compose.onNodeWithTag("group-search-action").assertIsNotEnabled().performClick()
        reveal("group-ask-$hikersId")
        compose.onNodeWithTag("group-ask-$hikersId").assertIsNotEnabled().performClick()
        reveal(inCard(walkersId, "Withdraw request"))
        compose.onNode(inCard(walkersId, "Withdraw request")).assertIsNotEnabled().performClick()
        reveal(hasText("Show more groups"))
        compose.onNodeWithText("Show more groups").assertIsNotEnabled().performClick()
        val listed = hasText("Withdraw request") and !hasAnyAncestor(hasTestTag("group-$walkersId"))
        reveal(listed)
        compose.onNode(listed).assertIsNotEnabled().performClick()
        // Only the answer changes the request.
        reveal(hasText("Waiting for review"))
        compose.onNodeWithText("Waiting for review").assertIsDisplayed()
        compose.runOnIdle { assertEquals(api.calls.toString(), before, api.calls.size); assertEquals(0, leaves) }

        held.release.complete(Unit)
        settle()
        reveal(hasText("Request to Evening walkers withdrawn."))
        reveal(hasText("Withdrawn"))
        compose.onNodeWithText("Withdrawn").assertIsDisplayed()
        reveal("group-ask-$walkersId")
        compose.onNodeWithTag("group-ask-$walkersId").assertIsEnabled()
        compose.runOnIdle { assertEquals(listOf("withdraw ${waiting.id}"), api.sent("withdraw")) }
    }

    @Test fun aLostWithdrawalKeepsTheRequestWaitingAndWithdrawingAgainSendsTheSameRequest() {
        api.groups = listOf(walkers)
        api.mine = listOf(waiting)
        open()
        settle()
        api.next("withdraw", Lost)
        reveal(inCard(walkersId, "Withdraw request"))
        compose.onNode(inCard(walkersId, "Withdraw request")).performClick()
        settle()
        reveal(hasText(offline))
        compose.onNodeWithText(offline).assertIsDisplayed()
        compose.onNodeWithText("Request to Evening walkers withdrawn.").assertDoesNotExist()
        reveal(inCard(walkersId, "Request sent"))
        compose.onNode(inCard(walkersId, "Request sent")).assertIsDisplayed()
        reveal(hasText("Waiting for review"))
        compose.onNodeWithText("Withdrawn").assertDoesNotExist()
        reveal(inCard(walkersId, "Withdraw request"))
        compose.onNode(inCard(walkersId, "Withdraw request")).assertIsEnabled().performClick()
        settle()
        compose.runOnIdle { assertEquals(listOf("withdraw ${waiting.id}", "withdraw ${waiting.id}"), api.sent("withdraw")) }
        reveal(hasText("Withdrawn"))
        compose.onNodeWithText("Withdrawn").assertIsDisplayed()
    }

    @Test fun groupAccessListsWaitingPeopleAndApprovingSendsOnlyThatPerson() {
        api.space = club.copy(visibility = "public")
        api.settings = clubSettings.copy(visibility = "public")
        api.reviews = listOf(sam, riya)
        open(clubId)
        settle()
        compose.onNodeWithText("Group access").assertIsDisplayed()
        reveal(hasText("Book club"))
        reveal(hasText(publicNow))
        compose.onNodeWithText(publicNow).assertIsDisplayed()
        reveal("group-visibility")
        compose.onNodeWithTag("group-visibility").assertTextEquals("Make this group private").assertIsEnabled()
        reveal("group-review-${sam.id}")
        compose.onNode(inReview(sam.id, "Sam Example")).assertIsDisplayed()
        compose.onNode(inReview(sam.id, "I read a lot of mysteries.")).assertIsDisplayed()
        compose.onNode(inReview(sam.id, "Decline")).assertIsEnabled()
        reveal("group-approve-${riya.id}")
        compose.onNode(inReview(riya.id, "Riya Example")).assertIsDisplayed()
        compose.onNodeWithText("Nobody is waiting.").assertDoesNotExist()

        reveal("group-approve-${sam.id}")
        compose.onNodeWithTag("group-approve-${sam.id}").assertTextEquals("Approve").performClick()
        settle()
        compose.runOnIdle { assertEquals(listOf("approve ${sam.id}"), api.sent("approve")); assertTrue(api.sent("decline").isEmpty()) }
        reveal(hasText("Sam Example joined the group."))
        compose.onNodeWithText("Sam Example joined the group.").assertIsDisplayed()
        compose.onNodeWithTag("group-review-${sam.id}").assertDoesNotExist()
        reveal("group-review-${riya.id}")

        // An admin answers requests too, but sees no visibility controls and the owner-only settings are never read.
        val settingsReads = api.sent("settings").size
        compose.runOnUiThread { model.bind(null) }
        api.space = club.copy(visibility = "public", role = "admin")
        compose.runOnUiThread { model.bind(accountId, clubId) }
        settle()
        reveal("group-approve-${riya.id}")
        compose.onNodeWithTag("group-approve-${riya.id}").assertIsEnabled()
        compose.onNode(inReview(riya.id, "Decline")).assertIsEnabled()
        compose.onNodeWithTag("group-visibility").assertDoesNotExist()
        compose.onNodeWithText(publicNow).assertDoesNotExist()
        compose.runOnIdle { assertEquals(settingsReads, api.sent("settings").size) }
    }

    @Test fun aLostApprovalIsNotShownAsJoinedAndApprovingAgainSendsTheSameRequest() {
        api.space = club.copy(visibility = "public")
        api.settings = clubSettings.copy(visibility = "public")
        api.reviews = listOf(sam, riya)
        open(clubId)
        settle()
        val held = Held(then = Lost)
        api.next("approve", held)
        reveal("group-approve-${sam.id}")
        compose.onNodeWithTag("group-approve-${sam.id}").performClick()
        reach(held)
        // In flight no other answer, visibility change, refresh or exit can start.
        val before = api.calls.size
        compose.onNode(loading).assertExists()
        compose.onNodeWithTag("group-approve-${sam.id}").assertIsNotEnabled().performClick()
        compose.onNode(inReview(sam.id, "Decline")).assertIsNotEnabled().performClick()
        reveal("group-approve-${riya.id}")
        compose.onNodeWithTag("group-approve-${riya.id}").assertIsNotEnabled().performClick()
        compose.onNode(inReview(riya.id, "Decline")).assertIsNotEnabled().performClick()
        reveal("group-visibility")
        compose.onNodeWithTag("group-visibility").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Refresh Spaces and invitations").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Back to Spaces").assertIsNotEnabled().performClick()
        compose.runOnIdle { assertEquals(api.calls.toString(), before, api.calls.size); assertEquals(0, leaves) }

        // The answer is lost: Sam is still waiting and nothing says they joined.
        held.release.complete(Unit)
        settle()
        reveal(hasText(offline))
        compose.onNodeWithText(offline).assertIsDisplayed()
        compose.onNodeWithText("Sam Example joined the group.").assertDoesNotExist()
        reveal("group-approve-${sam.id}")
        compose.onNode(inReview(sam.id, "Sam Example")).assertIsDisplayed()
        compose.onNodeWithTag("group-approve-${sam.id}").assertIsEnabled().performClick()
        settle()
        compose.runOnIdle { assertEquals(listOf("approve ${sam.id}", "approve ${sam.id}"), api.sent("approve")); assertTrue(api.sent("decline").isEmpty()) }
        reveal(hasText("Sam Example joined the group."))
        compose.onNodeWithTag("group-review-${sam.id}").assertDoesNotExist()
    }

    /**
     * Declining makes the person wait 7 days before asking again, so it is hard to undo. The rules ask screens to confirm
     * anything hard to undo, with the same confirmations in both apps, and the web asks first ("Keep" or "Confirm decline").
     * Reported defect: GroupScreen sends the decline at once, so this test fails until the screen asks first.
     */
    @Test fun decliningARequestAsksFirstAndKeepSendsNothing() {
        api.space = club.copy(visibility = "public")
        api.settings = clubSettings.copy(visibility = "public")
        api.reviews = listOf(sam, riya)
        open(clubId)
        settle()
        reveal(inReview(sam.id, "Decline"))
        compose.onNode(inReview(sam.id, "Decline")).performClick()
        settle()
        compose.runOnIdle { assertEquals("A decline was sent without asking first: ${api.calls}", emptyList<String>(), api.sent("decline")) }
        compose.onNodeWithText("You declined Sam Example. They can ask again in 7 days.").assertDoesNotExist()
        reveal(inReview(sam.id, "Keep"))
        compose.onNode(inReview(sam.id, "Keep")).performClick()
        compose.runOnIdle { assertTrue(api.sent("decline").isEmpty()) }
        reveal(inReview(sam.id, "Decline"))
        compose.onNode(inReview(sam.id, "Decline")).performClick()
        reveal(inReview(sam.id, "Confirm decline"))
        compose.onNode(inReview(sam.id, "Confirm decline")).performClick()
        settle()
        compose.runOnIdle { assertEquals(listOf("decline ${sam.id}"), api.sent("decline")) }
        reveal(hasText("You declined Sam Example. They can ask again in 7 days."))
    }

    @Test fun changingVisibilityAsksFirstAndCancelSendsNothing() {
        api.space = club
        api.settings = clubSettings
        open(clubId)
        settle()
        reveal(hasText(privateNow))
        compose.onNodeWithText(privateNow).assertIsDisplayed()
        reveal(hasText("This group is private, so nobody can ask to join."))
        reveal("group-visibility")
        compose.onNodeWithTag("group-visibility").assertTextEquals("Make this group public").performClick()
        reveal(hasText(confirmPublic))
        compose.onNodeWithText(confirmPublic).assertIsDisplayed()
        compose.onNodeWithTag("group-visibility").assertDoesNotExist()
        compose.runOnIdle { assertTrue(api.sent("visibility").isEmpty()) }
        reveal(hasText("Cancel"))
        compose.onNodeWithText("Cancel").assertIsEnabled().performClick()
        compose.onNodeWithText(confirmPublic).assertDoesNotExist()
        compose.runOnIdle { assertTrue(api.sent("visibility").isEmpty()) }

        reveal("group-visibility")
        compose.onNodeWithTag("group-visibility").performClick()
        reveal("group-visibility-confirm")
        compose.onNodeWithTag("group-visibility-confirm").assertTextEquals("Confirm").performClick()
        settle()
        val sent = api.sent("visibility").single()
        assertTrue(sent, sent.startsWith("visibility $clubId public etag=${clubSettings.etag} key="))
        reveal(hasText("The group is public. People can find it and ask to join."))
        reveal(hasText(publicNow))
        compose.onNodeWithText(publicNow).assertIsDisplayed()
        reveal("group-visibility")
        compose.onNodeWithTag("group-visibility").assertTextEquals("Make this group private")
    }

    @Test fun aLostVisibilityChangeIsNotShownAsDoneAndRetrySendsTheSameChange() {
        api.space = club
        api.settings = clubSettings
        open(clubId)
        settle()
        reveal("group-visibility")
        compose.onNodeWithTag("group-visibility").performClick()
        api.next("visibility", Lost)
        reveal("group-visibility-confirm")
        compose.onNodeWithTag("group-visibility-confirm").performClick()
        settle()
        reveal(hasText(offline))
        compose.onNodeWithText(offline).assertIsDisplayed()
        compose.onNodeWithText("The group is public. People can find it and ask to join.").assertDoesNotExist()
        reveal(hasText(privateNow))
        compose.onNodeWithText(privateNow).assertIsDisplayed()
        compose.onNodeWithText(publicNow).assertDoesNotExist()
        reveal(hasText(unconfirmed))
        reveal(hasText("Cancel"))
        compose.onNodeWithText("Cancel").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Refresh Spaces and invitations").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.runOnIdle { assertEquals(0, leaves); assertEquals(1, api.sent("visibility").size) }

        val retry = Held()
        api.next("visibility", retry)
        reveal("group-visibility-confirm")
        compose.onNodeWithTag("group-visibility-confirm").assertIsEnabled().performClick()
        reach(retry)
        compose.onNodeWithTag("group-visibility-confirm").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Cancel").assertIsNotEnabled()
        retry.release.complete(Unit)
        settle()
        val sent = api.sent("visibility")
        assertEquals(api.calls.toString(), 2, sent.size)
        assertEquals(sent[0], sent[1])
        reveal(hasText(publicNow))
        compose.onNodeWithText(publicNow).assertIsDisplayed()
    }

    /**
     * The note limit is 280 characters counted as the server and the view model count them, so an emoji counts once (as in
     * Space settings and on the web). Reported defect: the counter counts UTF-16 units, so 200 emoji show as 400/280.
     */
    @Test fun theNoteCounterCountsAnEmojiOnceAsTheServerDoes() {
        api.groups = listOf(hikers)
        open()
        settle()
        reveal("group-ask-$hikersId")
        compose.onNodeWithTag("group-ask-$hikersId").performClick()
        reveal("group-note")
        val emoji = "\uD83D\uDE00"
        compose.onNodeWithTag("group-note").performTextReplacement(emoji.repeat(200))
        assertEquals(emoji.repeat(200), field("group-note"))
        assertEquals("200/280", counter(hikersId))
        compose.onNodeWithTag("group-note").performTextReplacement(emoji.repeat(281))
        assertEquals(emoji.repeat(280), field("group-note"))
        assertEquals("280/280", counter(hikersId))
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsFindGroupsTheNoteAndGroupAccessUsable() {
        assertNarrowScreen()
        val name = "Weekend hikers of the northern lakes, river valleys and old forest trails"
        val description = "Lake walks every Saturday morning, then tea at the boathouse. Bring water, a raincoat and sturdy shoes. Dogs on leads are welcome."
        val message = "Hello! I walk every Saturday and would love to join the lake walks with my neighbour."
        api.groups = listOf(hikers.copy(name = name, description = description), walkers, garden)
        api.nextCursor = "synthetic-next-page"
        api.mine = listOf(waiting)
        open()
        settle()
        compose.assertReachable("group-workspace", "group-search")
        compose.assertReachable("group-workspace", "group-search-action")
        compose.assertTextNotClipped(hasText("Search") and hasAnyAncestor(hasTestTag("group-search-action")))
        compose.assertReachable("group-workspace", hasText(name))
        compose.assertTextNotClipped(hasText(name))
        compose.assertReachable("group-workspace", hasText(description))
        compose.assertTextNotClipped(hasText(description))
        compose.assertTextNotClipped(hasText("Members: 3"))
        compose.assertReachable("group-workspace", "group-ask-$hikersId")
        compose.assertTextNotClipped(hasText("Ask to join"))
        compose.onRoot().saveEvidence("groups-find-native-large-text.png")
        compose.assertReachable("group-workspace", inCard(walkersId, "Request sent"))
        compose.assertTextNotClipped(hasText("Request sent"))
        compose.assertReachable("group-workspace", inCard(walkersId, "Withdraw request"))
        compose.assertReachable("group-workspace", inCard(gardenId, "Not accepting your request right now"))
        compose.assertTextNotClipped(hasText("Not accepting your request right now"))
        compose.assertReachable("group-workspace", hasText("Show more groups"))
        compose.assertTextNotClipped(hasText("Show more groups"))
        compose.assertReachable("group-workspace", hasText("Your join requests"))
        compose.assertReachable("group-workspace", hasText("Waiting for review"))
        compose.assertReachable("group-workspace", hasText("Withdraw request") and !hasAnyAncestor(hasTestTag("group-$walkersId")))

        // The note, then the same request unconfirmed.
        reveal("group-ask-$hikersId")
        compose.onNodeWithTag("group-ask-$hikersId").performClick()
        compose.assertReachable("group-workspace", "group-note")
        compose.onNodeWithTag("group-note").performTextReplacement(message)
        compose.assertReachable("group-workspace", inCard(hikersId, "${message.length}/280"))
        compose.assertTextNotClipped(inCard(hikersId, "${message.length}/280"))
        compose.assertReachable("group-workspace", inCard(hikersId, "Cancel"))
        compose.assertReachable("group-workspace", "group-send")
        compose.assertTextNotClipped(hasText("Send request"))
        compose.onRoot().saveEvidence("groups-note-native-large-text.png")
        api.next("ask", Lost)
        compose.onNodeWithTag("group-send").performClick()
        settle()
        compose.assertReachable("group-workspace", hasText(unconfirmed))
        compose.assertTextNotClipped(hasText(unconfirmed))
        compose.assertReachable("group-workspace", "group-send")
        compose.assertTextNotClipped(hasText("Retry request"))
        compose.onRoot().saveEvidence("groups-unconfirmed-native-large-text.png")

        // Group access with a long name and note, and the visibility question.
        val clubName = "Book club for long novels, short stories and the occasional poem"
        val person = sam.copy(displayName = "Samuel Alexander Example-Fitzgerald of the Riverside Walking Club", note = "I have walked the northern lakes for years and can help newer walkers find the quieter trails on wet days.")
        api.space = club.copy(name = clubName, visibility = "public")
        api.settings = clubSettings.copy(name = clubName, visibility = "public")
        api.reviews = listOf(person)
        compose.runOnUiThread { model.bind(accountId, clubId) }
        settle()
        compose.assertReachable("group-workspace", hasText(clubName))
        compose.assertTextNotClipped(hasText(clubName))
        compose.assertReachable("group-workspace", hasText(publicNow))
        compose.assertTextNotClipped(hasText(publicNow))
        compose.assertReachable("group-workspace", "group-visibility")
        compose.assertTextNotClipped(hasText("Make this group private"))
        compose.assertReachable("group-workspace", inReview(person.id, person.displayName))
        compose.assertTextNotClipped(hasText(person.displayName))
        compose.assertReachable("group-workspace", inReview(person.id, person.note))
        compose.assertTextNotClipped(hasText(person.note))
        compose.assertReachable("group-workspace", inReview(person.id, "Decline"))
        compose.assertTextNotClipped(hasText("Decline"))
        compose.assertReachable("group-workspace", "group-approve-${person.id}")
        compose.assertTextNotClipped(hasText("Approve"))
        compose.onRoot().saveEvidence("groups-access-native-large-text.png")
        reveal("group-visibility")
        compose.onNodeWithTag("group-visibility").performClick()
        compose.assertReachable("group-workspace", hasText(confirmPrivate))
        compose.assertTextNotClipped(hasText(confirmPrivate))
        compose.assertReachable("group-workspace", hasText("Cancel"))
        compose.assertReachable("group-workspace", "group-visibility-confirm")
        compose.assertTextNotClipped(hasText("Confirm"))
        compose.onRoot().saveEvidence("groups-visibility-native-large-text.png")
        compose.runOnIdle { assertTrue(api.sent("visibility").isEmpty()); assertTrue(api.sent("approve").isEmpty()) }
    }

    /** What the stand-in answers to the next request of one kind; without one it answers from its synthetic data. */
    private sealed interface Answer
    /** The request went out but no answer came back. */
    private object Lost : Answer
    private class Refused(val status: Int, val message: String) : Answer
    /** The request waits until the test releases it, then gets [then] (or the normal answer). */
    private class Held(val then: Answer? = null) : Answer {
        val reached = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
    }

    private class SyntheticSession(private val accountId: String) : SessionStore {
        override fun load() = Credentials("synthetic-session-token-with-more-than-32-characters", accountId)
        override fun save(credentials: Credentials) = Unit
        override fun clear() = Unit
    }

    private class StandInGroupApi : GroupApi {
        val calls = CopyOnWriteArrayList<String>()
        private val scripted = ConcurrentHashMap<String, ConcurrentLinkedQueue<Answer>>()
        @Volatile var groups: List<SpaceDirectoryEntryDto> = emptyList()
        @Volatile var nextCursor: String? = null
        @Volatile var nextPage: List<SpaceDirectoryEntryDto> = emptyList()
        @Volatile var mine: List<JoinRequestDto> = emptyList()
        @Volatile var space: SpaceDto? = null
        @Volatile var settings: SpaceSettingsDto? = null
        @Volatile var reviews: List<JoinReviewDto> = emptyList()

        fun next(kind: String, answer: Answer) { scripted.getOrPut(kind) { ConcurrentLinkedQueue() }.add(answer) }
        fun sent(kind: String) = calls.filter { it == kind || it.startsWith("$kind ") }

        private suspend fun <Value> reply(kind: String, call: String, pagination: () -> PaginationDto? = { null }, value: () -> Value): Response<EnvelopeDto<Value>> {
            calls += if (call.isEmpty()) kind else "$kind $call"
            var answer = scripted[kind]?.poll()
            if (answer is Held) {
                answer.reached.complete(Unit)
                answer.release.await()
                answer = answer.then
            }
            return when (answer) {
                is Lost -> throw IOException("Synthetic: the answer never arrived")
                is Refused -> Response.error(answer.status, """{"error":{"code":"SYNTHETIC_REFUSAL","message":"${answer.message}"}}""".toResponseBody("application/json".toMediaType()))
                else -> Response.success(EnvelopeDto(value(), null, pagination()))
            }
        }

        override suspend fun directory(authorization: String, query: String?, cursor: String?, limit: Int): Response<EnvelopeDto<List<SpaceDirectoryEntryDto>>> =
            reply("directory", "q=$query cursor=$cursor", { if (cursor == null) PaginationDto(nextCursor, nextCursor != null) else PaginationDto(null, false) }) {
                if (cursor == null) groups else nextPage
            }

        override suspend fun ask(authorization: String, spaceId: String, key: String, body: CreateJoinRequestDto): Response<EnvelopeDto<JoinRequestDto>> =
            reply("ask", "$spaceId key=$key note=${body.note}") {
                val group = groups.first { it.id == spaceId }
                val request = JoinRequestDto(UUID.nameUUIDFromBytes(key.toByteArray()).toString(), spaceId, group.name, body.note, "pending", "2026-10-02T09:00:00Z", "2026-10-16T09:00:00Z", null)
                mine = listOf(request) + mine
                groups = groups.map { if (it.id == spaceId) it.copy(pendingRequestId = request.id, canRequest = false) else it }
                request
            }

        override suspend fun cancel(authorization: String, requestId: String, body: Map<String, String>): Response<EnvelopeDto<JoinRequestDto>> =
            reply("withdraw", requestId) {
                val request = mine.first { it.id == requestId }.copy(status = "cancelled", resolvedAt = "2026-10-02T09:30:00Z")
                mine = mine.map { if (it.id == requestId) request else it }
                groups = groups.map { if (it.pendingRequestId == requestId) it.copy(pendingRequestId = null, canRequest = true) else it }
                request
            }

        override suspend fun mine(authorization: String): Response<EnvelopeDto<List<JoinRequestDto>>> = reply("mine", "") { mine }

        override suspend fun pending(authorization: String, spaceId: String): Response<EnvelopeDto<List<JoinReviewDto>>> = reply("pending", spaceId) { reviews }

        override suspend fun approve(authorization: String, spaceId: String, requestId: String, body: Map<String, String>) = decide("approve", spaceId, requestId, "approved")

        override suspend fun decline(authorization: String, spaceId: String, requestId: String, body: Map<String, String>) = decide("decline", spaceId, requestId, "declined")

        private suspend fun decide(kind: String, spaceId: String, requestId: String, status: String): Response<EnvelopeDto<JoinRequestDto>> =
            reply(kind, requestId) {
                val review = reviews.first { it.id == requestId }
                reviews = reviews.filterNot { it.id == requestId }
                JoinRequestDto(requestId, spaceId, space!!.name, review.note, status, review.createdAt, review.expiresAt, "2026-10-02T09:30:00Z")
            }

        override suspend fun space(authorization: String, spaceId: String): Response<EnvelopeDto<SpaceDto>> = reply("space", spaceId) { space!! }

        override suspend fun settings(authorization: String, spaceId: String): Response<EnvelopeDto<SpaceSettingsDto>> = reply("settings", spaceId) { settings!! }

        override suspend fun visibility(authorization: String, spaceId: String, etag: String, key: String, body: VisibilityChangeDto): Response<EnvelopeDto<SpaceSettingsDto>> =
            reply("visibility", "$spaceId ${body.visibility} etag=$etag key=$key") {
                val changed = settings!!.copy(visibility = body.visibility, version = "3", etag = "\"${"b".repeat(64)}\"")
                settings = changed
                space = space!!.copy(visibility = body.visibility, version = "3")
                if (body.visibility == "private") reviews = emptyList()
                changed
            }
    }
}
