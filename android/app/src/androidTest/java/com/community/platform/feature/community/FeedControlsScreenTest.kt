package com.community.platform.feature.community

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/** Feed controls (T136, DEC-037): the post and suggestion menus, Why am I seeing this?, Undo and "Muted and hidden". */
@RunWith(AndroidJUnit4::class)
class FeedControlsScreenTest {
    private val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val list = "community-content"
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val stamp = "2026-10-03T10:00:00Z"
    private val post = PostDto(postId, pageId, "river-walkers", "River Walkers", "Saturday walk", "Meet at 7", "published", 0, 0, stamp, stamp, null, false, false, false, null,
        topics = listOf("hobbies"), interests = listOf("hiking"))
    private val taxonomy = Taxonomy(listOf(TermDto("topic", "hobbies", null, false, "active", TermNamesDto("Hobbies", null, null)),
        TermDto("interest", "hiking", null, false, "active", TermNamesDto("Hiking", null, null))))
    private val controls = listOf(
        FeedControlDto("a0000000-0000-4000-8000-000000000001", "mute_page", pageId = pageId, pageHandle = "river-walkers", pageName = "River Walkers", createdAt = stamp),
        FeedControlDto("a0000000-0000-4000-8000-000000000002", "mute_term", dimension = "interest", code = "hiking", createdAt = stamp),
        FeedControlDto("a0000000-0000-4000-8000-000000000003", "hide_post", pageId = pageId, pageName = "River Walkers", postId = postId, postAvailable = true, createdAt = stamp),
        FeedControlDto("a0000000-0000-4000-8000-000000000004", "hide_post", pageId = pageId, postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b09", postAvailable = false, createdAt = stamp),
        FeedControlDto("a0000000-0000-4000-8000-000000000005", "hide_suggestion", pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a02", createdAt = stamp),
    )

    private fun feed(tab: FeedTab) = CommunityState(accountId = accountId, destination = Destination.Feed(tab), posts = listOf(post), taxonomy = taxonomy)
    private fun managed(rows: List<FeedControlDto> = controls) =
        CommunityState(accountId = accountId, destination = Destination.FeedControls, controls = rows, controlsLoaded = true, taxonomy = taxonomy)

    private fun reveal(tag: String) {
        compose.onNodeWithTag(list).performScrollToNode(hasTestTag(tag))
        compose.onNodeWithTag(tag).performScrollTo().assertIsDisplayed()
    }

    private fun why(state: CommunityState, expected: String) {
        compose.setContent { CommunityTheme { CommunityScreen(state, CommunityActions(), "UTC", {}) } }
        reveal("post-menu-$postId")
        compose.onNodeWithTag("post-menu-$postId").performClick()
        compose.onNodeWithTag("post-why-$postId").performClick()
        compose.onNodeWithTag("why-text").assertTextContains(expected)
    }

    @Test fun notInterestedHidesThePostAndUndoBringsItBack() {
        var state by mutableStateOf(feed(FeedTab.FOLLOWING))
        val hidden = mutableListOf<String>()
        var undone = 0
        val control = FeedControlDto("a0000000-0000-4000-8000-000000000003", "hide_post", pageId = pageId, postId = postId, postAvailable = true, createdAt = stamp)
        val actions = CommunityActions(
            hidePost = { hidden += it.id; state = state.copy(posts = emptyList(), undo = FeedUndo(control)) },
            undoControl = { undone += 1; state = state.copy(posts = listOf(post), undo = null) },
        )
        compose.setContent { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
        reveal("post-menu-$postId")
        compose.onNodeWithContentDescription("More options").assertIsDisplayed().performClick()
        compose.onNodeWithTag("post-mute-page-$postId").assertTextContains("Mute River Walkers")
        compose.onNodeWithTag("post-mute-topic-hobbies-$postId").assertTextContains("Mute Hobbies")
        compose.onNodeWithTag("post-mute-interest-hiking-$postId").assertTextContains("Mute Hiking")
        compose.onNodeWithTag("post-hide-$postId").assertTextContains("Not interested").performClick()
        compose.runOnIdle { assertEquals(listOf(postId), hidden) }
        compose.onNodeWithTag("post-$postId").assertDoesNotExist()
        compose.onNodeWithTag("feed-undo-notice").assertTextContains("Post hidden from your lists.", substring = true)
        compose.onNodeWithTag("feed-undo").performClick()
        compose.runOnIdle { assertEquals(1, undone) }
        reveal("post-$postId")
    }

    @Test fun whyExplainsFollowing() {
        why(feed(FeedTab.FOLLOWING), "You follow River Walkers.")
    }

    @Test fun whyExplainsLatest() {
        why(feed(FeedTab.LATEST), "Latest shows every public post, newest first.")
    }

    @Test fun whyExplainsFromYourInterests() {
        why(CommunityState(accountId = accountId, destination = Destination.Discover, taxonomy = taxonomy, interestPostsStatus = ListStatus.LOADED,
            interestPosts = listOf(InterestPostDto(post, listOf(ReasonDto("interest", "hiking"))))), "Because you chose: Hiking")
    }

    @Test fun savedPostsHaveNoMenu() {
        compose.setContent { CommunityTheme { CommunityScreen(feed(FeedTab.SAVED), CommunityActions(), "UTC", {}) } }
        reveal("post-$postId")
        compose.onNodeWithTag("post-menu-$postId").assertDoesNotExist()
    }

    @Test fun mutedAndHiddenListsEverySectionAndUndoesARow() {
        val removed = mutableListOf<String>()
        compose.setContent { CommunityTheme { CommunityScreen(managed(), CommunityActions(removeControl = { removed += it.id }), "UTC", {}) } }
        reveal("controls-heading-mute_page")
        compose.onNodeWithTag("control-${controls[0].id}").assertTextContains("River Walkers", substring = true)
        reveal("controls-heading-mute_term")
        compose.onNodeWithTag("control-${controls[1].id}").assertTextContains("Hiking", substring = true)
        reveal("controls-heading-hide_post")
        reveal("control-${controls[2].id}")
        compose.onNodeWithTag("control-${controls[2].id}").assertTextContains("Untitled post", substring = true)
        reveal("control-${controls[3].id}")
        compose.onNodeWithTag("control-${controls[3].id}").assertTextContains("No longer available", substring = true)
        reveal("controls-heading-hide_suggestion")
        reveal("control-undo-${controls[1].id}")
        compose.onNodeWithTag("control-undo-${controls[1].id}").performClick()
        compose.runOnIdle { assertEquals(listOf(controls[1].id), removed) }
    }

    @Test fun mutedAndHiddenSaysWhenThereIsNothing() {
        compose.setContent { CommunityTheme { CommunityScreen(managed(emptyList()), CommunityActions(), "UTC", {}) } }
        compose.onNodeWithTag("controls-empty").assertTextContains("You have not muted or hidden anything.")
    }

    @Test fun mutedAndHiddenOpensFromTheBlockedList() {
        val opened = mutableListOf<Destination>()
        compose.setContent { CommunityTheme { CommunityScreen(CommunityState(accountId = accountId, destination = Destination.Blocked), CommunityActions(open = { opened += it }), "UTC", {}) } }
        reveal("open-feed-controls")
        compose.onNodeWithTag("open-feed-controls").performClick()
        compose.runOnIdle { assertEquals(listOf<Destination>(Destination.FeedControls), opened) }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsMenuRowsAndUndoReachable() {
        assertNarrowScreen()
        val minimum = 48 * InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        compose.setContent { CommunityTheme { CommunityScreen(managed(), CommunityActions(), "UTC", {}) } }
        for (control in controls) {
            val tag = "control-undo-${control.id}"
            compose.assertReachable(list, tag)
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue("$tag touch target ${bounds.height}", bounds.height >= minimum - 1)
        }
        // controls[3] (gone post) and controls[4] (unnamed suggestion) both read "No longer available"; check the post row's.
        val goneRow = hasTestTag("control-${controls[3].id}")
        notClipped(hasText("Muted pages"), hasText("Posts marked Not interested"), hasText("No longer available") and (goneRow or hasAnyAncestor(goneRow)))
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextPostMenuStaysReachable() {
        assertNarrowScreen()
        compose.setContent { CommunityTheme { CommunityScreen(feed(FeedTab.FOLLOWING), CommunityActions(), "UTC", {}) } }
        compose.assertReachable(list, "post-menu-$postId")
        compose.onNodeWithTag("post-menu-$postId").performClick()
        compose.onNodeWithTag("post-why-$postId").assertIsDisplayed()
        compose.onNodeWithTag("post-hide-$postId").assertIsDisplayed()
    }

    private fun notClipped(vararg matchers: SemanticsMatcher) = matchers.forEach { matcher ->
        compose.onNodeWithTag(list).performScrollToNode(matcher)
        compose.onNode(matcher, useUnmergedTree = true).performScrollTo()
        compose.assertTextNotClipped(matcher)
    }
}
