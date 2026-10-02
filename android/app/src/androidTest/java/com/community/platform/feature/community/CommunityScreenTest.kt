package com.community.platform.feature.community

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
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CommunityScreenTest {
    @get:Rule val compose = createComposeRule()
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val page = PageDto(pageId, "river-walkers", "River Walkers", "Weekend walks", "hobbies", 0, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", false, false, false, null)
    private val post = PostDto(postId, pageId, "river-walkers", "River Walkers", "Saturday walk", "Meet at the river at 7", "published", 0, 0, "2026-09-19T10:00:00Z", "2026-09-19T10:01:00Z", null, false, false, false, null)

    private fun discover(posts: Boolean) = CommunityState(
        accountId = accountId, destination = Destination.Discover, query = "river", searchPosts = posts,
        posts = if (posts) listOf(post) else emptyList(), pages = if (posts) emptyList() else listOf(page),
    )

    private fun reveal(tag: String) { compose.onNodeWithTag("community-content").performScrollToNode(hasTestTag(tag)) }

    @Test fun postSearchShowsPostsWithoutTopicsAndSwitchesBackToPages() {
        var state by mutableStateOf(discover(posts = true))
        val modes = mutableListOf<Boolean>()
        val searches = mutableListOf<Pair<String, String?>>()
        val actions = CommunityActions(
            search = { query, topic -> searches += query to topic },
            searchFor = { posts -> modes += posts; state = discover(posts) },
        )
        compose.setContent { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
        compose.onNodeWithText("Search posts").assertIsDisplayed()
        compose.onAllNodesWithText("All topics").assertCountEquals(0)
        reveal("post-$postId")
        compose.onNodeWithText("Meet at the river at 7").assertIsDisplayed()
        reveal("like-$postId")
        compose.onNodeWithTag("like-$postId").assertIsDisplayed()
        reveal("discover-query")
        compose.onNodeWithTag("discover-query").performTextReplacement("  river  walk ")
        compose.onNodeWithTag("discover-search").performClick()
        assertEquals(listOf<Pair<String, String?>>("  river  walk " to null), searches)

        compose.onNodeWithTag("discover-pages").performClick()
        assertEquals(listOf(false), modes)
        compose.onNodeWithText("Search pages").assertIsDisplayed()
        compose.onNodeWithText("All topics").assertIsDisplayed()
        reveal("page-river-walkers")
        compose.onAllNodesWithText("Meet at the river at 7").assertCountEquals(0)
    }

    @Test fun emptyPostSearchSaysWhetherTheWordsMatchedNothing() {
        var state by mutableStateOf(discover(posts = true).copy(posts = emptyList()))
        compose.setContent { CommunityTheme { CommunityScreen(state, CommunityActions(), "UTC", {}) } }
        compose.onNodeWithText("No posts match. Try another word.").assertIsDisplayed()
        state = state.copy(query = "")
        compose.onNodeWithText("No public posts yet.").assertIsDisplayed()
    }

    @Test fun largeTextNarrowPostSearchKeepsItsControlsInside() {
        val state = discover(posts = true)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { CommunityScreen(state, CommunityActions(), "UTC", {}) } }
            }
        }
        val parent = compose.onNodeWithTag("community-content").fetchSemanticsNode().boundsInRoot
        for (tag in listOf("discover-pages", "discover-posts", "discover-query", "discover-search", "post-$postId")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsDisplayed()
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue(tag, !bounds.isEmpty && bounds.left >= parent.left && bounds.right <= parent.right)
        }
        reveal("discover-posts")
        capture("community-post-search-large-text.png")
    }

    @Test fun ownerEditsAPublishedPostInPlaceAndCancelClosesTheEditor() {
        val owned = post.copy(canManage = true, etag = "\"v1\"")
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.Page("river-walkers"), page = page.copy(canManage = true), posts = listOf(owned)))
        val edits = mutableListOf<Triple<String, String, String>>()
        var cancels = 0
        val actions = CommunityActions(
            startEdit = { state = state.copy(editingPostId = it.id) },
            cancelEdit = { cancels += 1; state = state.copy(editingPostId = null) },
            editPost = { target, title, body -> edits += Triple(target.id, title, body); true },
        )
        compose.setContent { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
        reveal("edit-$postId")
        compose.onNodeWithTag("edit-$postId").performClick()
        reveal("edit-title-$postId")
        compose.onNodeWithTag("edit-title-$postId").assertTextContains("Saturday walk")
        reveal("edit-body-$postId")
        compose.onNodeWithTag("edit-body-$postId").performTextReplacement("Meet at the bridge at 8")
        compose.onNodeWithText("Saving changes the public post and marks it as edited.").assertIsDisplayed()
        reveal("edit-save-$postId")
        compose.onNodeWithTag("edit-save-$postId").performClick()
        assertEquals(listOf(Triple(postId, "Saturday walk", "Meet at the bridge at 8")), edits)
        compose.onNodeWithTag("edit-cancel-$postId").performClick()
        assertEquals(1, cancels)
        compose.onAllNodesWithTag("post-editor-$postId").assertCountEquals(0)
        reveal("edit-$postId")
        compose.onNodeWithTag("edit-$postId").assertIsDisplayed()
    }

    @Test fun followedPagesLoadingEmptyFailureAndUnfollowUseSeparateStates() {
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.MyPages, loading = true, ownedLoaded = true))
        val opened = mutableListOf<Destination>()
        val unfollowed = mutableListOf<PageDto>()
        var retries = 0
        val actions = CommunityActions(open = { opened += it }, unfollow = { unfollowed += it }, retryFollowing = { retries += 1 })
        compose.setContent { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
        reveal("followed-loading")
        compose.onNodeWithText("Loading pages you follow\u2026").assertIsDisplayed()
        compose.onAllNodesWithText("You do not follow any pages.").assertCountEquals(0)

        state = state.copy(loading = false, followedStatus = ListStatus.LOADED)
        reveal("followed-empty")
        compose.onNodeWithText("You do not follow any pages.").assertIsDisplayed()
        compose.onNodeWithTag("followed-discover").performScrollTo().performClick()
        assertEquals(listOf(Destination.Discover), opened)

        state = state.copy(followedStatus = ListStatus.FAILED, followedError = "Synthetic list failure", error = "Synthetic list failure")
        reveal("followed-retry")
        compose.onNodeWithTag("followed-error").performScrollTo().assertTextContains("Synthetic list failure")
        compose.onAllNodesWithText("You do not follow any pages.").assertCountEquals(0)
        compose.onNodeWithTag("followed-retry").performScrollTo().assertIsDisplayed().performClick()
        assertEquals(1, retries)

        val followed = page.copy(following = true, followerCount = 1)
        state = state.copy(followedStatus = ListStatus.LOADED, followedError = null, error = null, followed = listOf(followed))
        reveal("unfollow-river-walkers")
        compose.onNodeWithText("@river-walkers / hobbies / 1 follower").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("unfollow-river-walkers").performScrollTo().assertIsDisplayed().performClick()
        assertEquals(listOf(followed), unfollowed)
    }

    @Test fun largeTextNarrowPageEditorKeepsFieldsAndCommandsReachable() {
        val owned = page.copy(canManage = true, etag = "\"p1\"")
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.Page(page.handle), page = owned))
        val edits = mutableListOf<Triple<String, String, String>>()
        var closes = 0
        val actions = CommunityActions(
            startPageEdit = { state = state.copy(editingPage = it, pageEditSession = state.pageEditSession + 1) },
            editPage = { name, description, topic, _ -> edits += Triple(name, description, topic); true },
            cancelPageEdit = { closes += 1; state = state.copy(editingPage = null) },
        )
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
            }
        }
        reveal("page-edit")
        compose.onNodeWithTag("page-edit").performScrollTo().assertIsDisplayed().performClick()
        val parent = compose.onNodeWithTag("community-content").fetchSemanticsNode().boundsInRoot
        for (tag in listOf("page-edit-name", "page-edit-topic", "page-edit-description", "page-edit-save", "page-edit-cancel")) {
            reveal(tag)
            compose.onNodeWithTag(tag).performScrollTo().assertIsDisplayed()
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue(tag, !bounds.isEmpty && bounds.left >= parent.left && bounds.right <= parent.right)
        }
        reveal("page-edit-name")
        compose.onNodeWithTag("page-edit-name").performScrollTo().assertTextContains("River Walkers").performTextReplacement("New name")
        reveal("page-edit-topic-events")
        compose.onNodeWithTag("page-edit-topic-events").performScrollTo().performClick()
        reveal("page-edit-description")
        compose.onNodeWithTag("page-edit-description").performScrollTo().assertTextContains("Weekend walks").performTextReplacement("Line one\nLine two")
        reveal("page-edit-save")
        compose.onNodeWithText("Save page").performScrollTo().assertIsDisplayed().performClick()
        assertEquals(listOf(Triple("New name", "Line one\nLine two", "events")), edits)
        reveal("page-edit-cancel")
        compose.onNodeWithText("Close editor").performScrollTo().assertIsDisplayed().performClick()
        assertEquals(1, closes)
        compose.onAllNodesWithTag("page-editor").assertCountEquals(0)
    }

    @Test fun largeTextNarrowRulesAndPinnedPostShowOnceAboveTheDateList() {
        val pinned = post.copy(canManage = true, etag = "\"v1\"", pinned = true)
        val owned = page.copy(canManage = true, etag = "\"p1\"", rules = "Be kind.\nNo selling.")
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.Page(page.handle), page = owned, posts = listOf(pinned), pinned = listOf(pinned)))
        val pins = mutableListOf<PostDto>()
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { CommunityScreen(state, CommunityActions(pin = { pins += it }), "UTC", {}) } }
            }
        }
        reveal("page-rules")
        compose.onNodeWithText("Be kind.\nNo selling.").assertIsDisplayed()
        reveal("pinned-heading")
        compose.onNodeWithTag("pinned-heading").assertIsDisplayed()
        // The pinned post is also in the date list from the server, but it shows only once, in its own section.
        reveal("page-no-posts")
        compose.onNodeWithText("No other posts.").assertIsDisplayed()
        val parent = compose.onNodeWithTag("community-content").fetchSemanticsNode().boundsInRoot
        for (tag in listOf("page-rules", "pinned-heading", "pinned-$postId", "pin-$postId")) {
            reveal(tag)
            compose.onNodeWithTag(tag).assertIsDisplayed()
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue(tag, !bounds.isEmpty && bounds.left >= parent.left && bounds.right <= parent.right)
        }
        reveal("pinned-heading")
        capture("community-rules-pinned-large-text.png")
        reveal("pin-$postId")
        compose.onNodeWithTag("pin-$postId").assertTextContains("Unpin").performClick()
        assertEquals(listOf(pinned), pins)

        // Once unpinned, the post is back in the date list and offers Pin to top.
        val unpinned = pinned.copy(pinned = false)
        state = state.copy(posts = listOf(unpinned), pinned = emptyList())
        compose.onAllNodesWithTag("pinned-heading").assertCountEquals(0)
        reveal("pin-$postId")
        compose.onNodeWithTag("pin-$postId").assertTextContains("Pin to top").performClick()
        assertEquals(listOf(pinned, unpinned), pins)
    }

    private val inviteeId = "1b2c3d4e-5f60-4b7c-9d8e-0f1a2b3c4d5e"
    private val activeId = "2c3d4e5f-6071-4c8d-8e9f-1a2b3c4d5e6f"
    private val waitingId = "3d4e5f60-7182-4d9e-9fa0-2b3c4d5e6f70"
    private val offerId = "4f5e6d7c-8b9a-4c0d-9e1f-2a3b4c5d6e7f"
    private val stamp = "2026-09-19T10:00:00Z"
    private val later = "2099-01-01T00:00:00Z"

    private fun largeNarrow(content: @androidx.compose.runtime.Composable () -> Unit) = compose.setContent {
        val density = LocalDensity.current
        CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
            Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { content() } }
        }
    }

    private fun insideAndShown(vararg tags: String) {
        val parent = compose.onNodeWithTag("community-content").fetchSemanticsNode().boundsInRoot
        for (tag in tags) {
            reveal(tag)
            compose.onNodeWithTag(tag).performScrollTo().assertIsDisplayed()
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue(tag, !bounds.isEmpty && bounds.left >= parent.left && bounds.right <= parent.right)
        }
    }

    @Test fun largeTextNarrowOwnerManagesModeratorsHandoverAndPageState() {
        val owned = page.copy(canManage = true, etag = "\"p1\"")
        val active = ModeratorDto(activeId, pageId, inviteeId, "Sam", "active", stamp, null, stamp, "\"m1\"")
        val waiting = ModeratorDto(waitingId, pageId, accountId.replace('6', '7'), "Kim", "pending", stamp, later, null, "\"m2\"")
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.Page(page.handle), page = owned, moderators = listOf(active, waiting)))
        val offered = mutableListOf<ModeratorDto>()
        val resolved = mutableListOf<Pair<String, String>>()
        val invites = mutableListOf<String>()
        var archives = 0
        var restores = 0
        val actions = CommunityActions(
            inviteModerator = { invites += it; true }, resolveModerator = { row, action -> resolved += row.displayName to action },
            offerHandover = { offered += it; true }, archivePage = { archives += 1 }, restorePage = { restores += 1 },
        )
        largeNarrow { CommunityScreen(state, actions, "UTC", {}) }
        insideAndShown("page-moderators", "moderator-$activeId", "moderator-handover-$activeId", "moderator-remove-$activeId", "moderator-withdraw-$waitingId", "page-state", "page-archive", "page-delete")
        // While an invitation waits, no second one can be sent.
        compose.onAllNodesWithTag("moderator-invite-id").assertCountEquals(0)
        reveal("page-moderators")
        capture("community-page-moderators-large-text.png")
        // Handing over, removing and withdrawing each ask first, naming the person.
        reveal("moderator-handover-$activeId")
        compose.onNodeWithTag("moderator-handover-$activeId").performScrollTo().performClick()
        compose.onNodeWithText("Hand River Walkers over to Sam?").assertIsDisplayed()
        compose.onNodeWithTag("community-confirm").performClick()
        assertEquals(listOf(active), offered)
        reveal("moderator-remove-$activeId")
        compose.onNodeWithTag("moderator-remove-$activeId").performScrollTo().performClick()
        compose.onNodeWithText("Remove Sam?").assertIsDisplayed()
        compose.onNodeWithTag("community-confirm").performClick()
        reveal("moderator-withdraw-$waitingId")
        compose.onNodeWithTag("moderator-withdraw-$waitingId").performScrollTo().performClick()
        compose.onNodeWithText("Kim will no longer be able to accept.").assertIsDisplayed()
        compose.onNodeWithTag("community-confirm").performClick()
        assertEquals(listOf("Sam" to "remove", "Kim" to "withdraw"), resolved)

        // Without a waiting invitation the owner can invite; an offer that waits replaces Hand over with its own Cancel.
        state = state.copy(moderators = listOf(active), handover = HandoverDto(offerId, pageId, page.handle, page.name, accountId, "You", inviteeId, "Sam", "pending", stamp, later, null, "\"h1\""))
        insideAndShown("moderator-invite-id", "moderator-invite", "page-handover", "handover-cancel")
        compose.onAllNodesWithTag("moderator-handover-$activeId").assertCountEquals(0)
        compose.onNodeWithTag("moderator-invite-id").performScrollTo().performTextReplacement(" $inviteeId ")
        compose.onNodeWithTag("moderator-invite").performScrollTo().performClick()
        assertEquals(listOf(" $inviteeId "), invites)
        reveal("page-archive")
        compose.onNodeWithTag("page-archive").performScrollTo().performClick()
        compose.onNodeWithTag("community-confirm").performClick()
        assertEquals(1, archives)

        // A read-only page says so, keeps its moderators listed, and offers only Restore and Delete.
        state = state.copy(page = owned.copy(status = "read_only"), handover = null)
        insideAndShown("page-read-only", "moderator-remove-$activeId", "page-restore", "page-delete")
        for (tag in listOf("page-edit", "post-save-draft", "moderator-invite-id", "moderator-handover-$activeId", "page-archive")) compose.onAllNodesWithTag(tag).assertCountEquals(0)
        compose.onNodeWithTag("page-restore").performScrollTo().performClick()
        assertEquals(1, restores)

        // A deleted page shows its owner only when it will be erased and how to restore it.
        state = state.copy(page = owned.copy(status = "deleted", purgeAfter = "2026-09-26T10:04:00Z"))
        insideAndShown("page-deleted", "page-restore")
        for (tag in listOf("page-moderators", "page-state", "post-save-draft", "page-read-only")) compose.onAllNodesWithTag(tag).assertCountEquals(0)
        reveal("page-deleted")
        capture("community-page-deleted-large-text.png")
        compose.onNodeWithTag("page-restore").performScrollTo().performClick()
        assertEquals(2, restores)
    }

    @Test fun deletingAPageNeedsItsExactNameTyped() {
        val owned = page.copy(canManage = true, etag = "\"p1\"")
        val deletes = mutableListOf<String>()
        compose.setContent { CommunityTheme { CommunityScreen(CommunityState(accountId = accountId, destination = Destination.Page(page.handle), page = owned), CommunityActions(deletePage = { deletes += it; true }), "UTC", {}) } }
        reveal("page-delete")
        compose.onNodeWithTag("page-delete").performScrollTo().performClick()
        compose.onNodeWithText("Delete River Walkers?").assertIsDisplayed()
        compose.onNodeWithTag("page-delete-confirm").assertIsNotEnabled()
        compose.onNodeWithTag("page-delete-name").performTextReplacement("River Walker")
        compose.onNodeWithTag("page-delete-confirm").assertIsNotEnabled()
        compose.onNodeWithTag("page-delete-name").performTextReplacement(" River  Walkers ")
        compose.onNodeWithTag("page-delete-confirm").assertIsEnabled().performClick()
        assertEquals(listOf(" River  Walkers "), deletes)
        compose.onAllNodesWithTag("page-delete-dialog").assertCountEquals(0)
    }

    @Test fun largeTextNarrowOffersInvitationsAndRolesAreAnsweredFromYourPages() {
        val invitation = ModeratorRoleDto(waitingId, pageId, page.handle, page.name, "pending", stamp, later, null, "\"r1\"")
        val moderating = ModeratorRoleDto(activeId, inviteeId, "hill-runners", "Hill Runners", "active", stamp, null, stamp, "\"r2\"")
        val offer = HandoverDto(offerId, pageId, page.handle, page.name, inviteeId, "Ana", accountId, "You", "pending", stamp, later, null, "\"h1\"")
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.MyPages, ownedLoaded = true, followedStatus = ListStatus.LOADED,
            roles = listOf(invitation, moderating), offers = listOf(offer)))
        val answers = mutableListOf<String>()
        val opened = mutableListOf<Destination>()
        val actions = CommunityActions(
            open = { opened += it }, resolveRole = { role, action -> answers += "${role.pageName} $action" },
            respondHandover = { item, action -> answers += "${item.pageName} offer $action" },
        )
        largeNarrow { CommunityScreen(state, actions, "UTC", {}) }
        insideAndShown("offer-$offerId", "offer-accept-$offerId", "offer-decline-$offerId", "role-$waitingId", "role-accept-$waitingId", "role-decline-$waitingId",
            "role-$activeId", "role-open-$activeId", "role-step-down-$activeId")
        compose.onAllNodesWithTag("moderating-none").assertCountEquals(0)
        reveal("offer-$offerId")
        capture("community-page-roles-large-text.png")
        // Taking over a page and agreeing to moderate ask first; declining does not.
        compose.onNodeWithTag("offer-accept-$offerId").performScrollTo().performClick()
        compose.onNodeWithText("Take over River Walkers?").assertIsDisplayed()
        compose.onNodeWithTag("community-confirm").performClick()
        compose.onNodeWithTag("offer-decline-$offerId").performScrollTo().performClick()
        reveal("role-accept-$waitingId")
        compose.onNodeWithTag("role-accept-$waitingId").performScrollTo().performClick()
        compose.onNodeWithText("Moderate River Walkers?").assertIsDisplayed()
        compose.onNodeWithTag("community-confirm").performClick()
        compose.onNodeWithTag("role-decline-$waitingId").performScrollTo().performClick()
        reveal("role-step-down-$activeId")
        compose.onNodeWithTag("role-step-down-$activeId").performScrollTo().performClick()
        compose.onNodeWithText("Step down from Hill Runners?").assertIsDisplayed()
        compose.onNodeWithTag("community-confirm").performClick()
        compose.onNodeWithTag("role-open-$activeId").performScrollTo().performClick()
        assertEquals(listOf("River Walkers offer accept", "River Walkers offer decline", "River Walkers accept", "River Walkers decline", "Hill Runners step-down"), answers)
        assertEquals(listOf<Destination>(Destination.Page("hill-runners")), opened)
        state = state.copy(roles = emptyList(), offers = emptyList())
        insideAndShown("moderating-none")
    }

    @Test fun largeTextNarrowModeratorPinsButHasNoOwnerControlsAndReadOnlyHidesThem() {
        val role = ModeratorRoleDto(activeId, pageId, page.handle, page.name, "active", stamp, null, stamp, "\"r1\"")
        var state by mutableStateOf(CommunityState(accountId = accountId, destination = Destination.Page(page.handle), page = page, posts = listOf(post), roles = listOf(role)))
        val pins = mutableListOf<PostDto>()
        largeNarrow { CommunityScreen(state, CommunityActions(pin = { pins += it }), "UTC", {}) }
        insideAndShown("pin-$postId", "page-follow")
        for (tag in listOf("edit-$postId", "delete-$postId", "page-moderators", "page-state", "page-edit")) compose.onAllNodesWithTag(tag).assertCountEquals(0)
        compose.onNodeWithTag("pin-$postId").performScrollTo().assertTextContains("Pin to top").performClick()
        assertEquals(listOf(post), pins)
        // On a read-only page nothing can be pinned or followed, and the page says why.
        state = state.copy(page = page.copy(status = "read_only"))
        insideAndShown("page-read-only")
        for (tag in listOf("pin-$postId", "page-follow")) compose.onAllNodesWithTag(tag).assertCountEquals(0)
        // Someone who already follows it can still unfollow.
        state = state.copy(page = page.copy(status = "read_only", following = true, followerCount = 1))
        insideAndShown("page-follow")
        compose.onNodeWithTag("page-follow").assertTextContains("Unfollow")
    }

    private fun capture(name: String) {
        val image = compose.onRoot().captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("test-evidence"), name)
        file.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(file.length() > 1000)
    }
}
