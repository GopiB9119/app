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

    private fun capture(name: String) {
        val image = compose.onRoot().captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("test-evidence"), name)
        file.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(file.length() > 1000)
    }
}
