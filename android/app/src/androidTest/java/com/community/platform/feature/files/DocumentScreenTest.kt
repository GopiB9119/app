package com.community.platform.feature.files

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.community.platform.CommunityTheme
import com.community.platform.feature.discovery.SearchActions
import com.community.platform.feature.discovery.SearchDocumentDto
import com.community.platform.feature.discovery.SearchEventDto
import com.community.platform.feature.discovery.SearchResultsDto
import com.community.platform.feature.discovery.SearchScreen
import com.community.platform.feature.discovery.SearchState
import com.community.platform.feature.discovery.SearchTaskDto
import com.community.platform.feature.spaces.SpaceDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DocumentScreenTest {
    @get:Rule val compose = createComposeRule()
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val documentId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
    private val taskId = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
    private val eventId = "8b2eac20-1b89-4e77-8c4b-3b3b9f8b3c04"
    private val content = "# Budget\n<b>not HTML</b>\nSecond cited line\nLast line\n"
    private val file = ChosenDocument("notes.md", content.toByteArray().size, content)
    private val document = DocumentDto(documentId, spaceId, "Morgan family", "active", file.name, "text/markdown", file.sizeBytes, 4,
        documentSha256(content), "Sam Example", "2026-10-01T10:00:00Z", null, true)
    private val space = SpaceDto(spaceId, "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z")
    private fun workspace() = DocumentsState(accountId = accountId, spaceId = spaceId, spaceName = space.name, loaded = true)

    @Test fun addNeedsAnExplicitTapAndRetryKeepsTheChosenFileLocked() {
        var state by mutableStateOf(workspace())
        val attempts = mutableListOf<DocumentCreateIntent>()
        val key = "6b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
        val actions = DocumentActions(
            chooseFile = { state = state.copy(chosen = file, choiceKey = key) },
            add = {
                val intent = DocumentCreateIntent(accountId, spaceId, state.choiceKey!!, state.chosen!!.body)
                attempts += intent
                state = state.copy(pending = intent, issue = DocumentIssue.ADD_UNCERTAIN)
            }, retry = {
                attempts += state.pending!!
                state = state.copy(pending = null, chosen = null, choiceKey = null, documents = listOf(document), issue = null, notice = DocumentNotice.ADDED)
            },
        )
        compose.setContent { CommunityTheme { DocumentScreen(state, actions) } }
        compose.onNodeWithTag("document-choose").performClick()
        compose.onNodeWithTag("document-chosen-name").assertTextContains("notes.md")
        compose.onNodeWithTag("document-chosen-size").assertTextContains("KB", substring = true)
        compose.runOnIdle { assertTrue(attempts.isEmpty()) }
        compose.onNodeWithTag("document-add").performClick()
        compose.onNodeWithTag("document-choose").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(1, attempts.size) }
        compose.onNodeWithTag("document-retry").performClick()
        compose.runOnIdle {
            assertEquals(2, attempts.size)
            assertEquals(attempts[0], attempts[1])
            assertEquals(file.body, attempts[1].body)
        }
        compose.onNodeWithTag("document-notice").assertTextContains("Document added.")
    }

    @Test fun deleteDialogNamesTheExactDocumentAndSpaceAndCancelHasNoEffect() {
        var state by mutableStateOf(workspace().copy(viewingId = documentId, selected = document.copy(content = content)))
        val deleted = mutableListOf<String>()
        val actions = DocumentActions(askDelete = { state = state.copy(confirmingDelete = true) }, keep = { state = state.copy(confirmingDelete = false) },
            delete = { deleted += state.selected!!.id; state = state.copy(confirmingDelete = false) })
        compose.setContent { CommunityTheme { DocumentScreen(state, actions) } }
        compose.onNodeWithTag("document-viewer").performScrollToNode(hasTestTag("document-delete"))
        compose.onNodeWithTag("document-delete").performClick()
        compose.onNodeWithText("Delete \u201cnotes.md\u201d, added by Sam Example, from Morgan family? Its text is removed for everyone and cannot be recovered.").assertIsDisplayed()
        compose.onNodeWithTag("document-delete-dialog-cancel").performClick()
        compose.runOnIdle { assertTrue(deleted.isEmpty()) }
        compose.onNodeWithTag("document-delete").performClick()
        compose.onNodeWithTag("document-delete-confirm").performClick()
        compose.runOnIdle { assertEquals(listOf(documentId), deleted) }
    }

    @Test fun viewerMarksTheCitedLinesAndRendersMarkupAsPlainText() {
        val state = workspace().copy(viewingId = documentId, selected = document.copy(content = content), lineRange = DocumentLineRange(2, 3))
        compose.setContent { CommunityTheme { DocumentScreen(state, DocumentActions()) } }
        compose.onNodeWithTag("document-line-2").assertIsDisplayed().assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        compose.onNodeWithTag("document-line-3").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        compose.onNodeWithText("<b>not HTML</b>").assertIsDisplayed()
        compose.onNodeWithTag("document-viewer").performScrollToNode(hasTestTag("document-line-1"))
        compose.onNodeWithTag("document-line-1").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, false))
        compose.onNodeWithText("# Budget").assertIsDisplayed()
        compose.onNodeWithTag("document-line-5").assertDoesNotExist()
    }

    @Test fun deleteIsHiddenWithoutPermissionAndRetryDeleteIsExplicit() {
        var state by mutableStateOf(workspace().copy(viewingId = documentId, selected = document.copy(content = content, canDelete = false)))
        var retries = 0
        compose.setContent { CommunityTheme { DocumentScreen(state, DocumentActions(retryDelete = { retries += 1 })) } }
        compose.onNodeWithTag("document-delete").assertDoesNotExist()
        compose.runOnIdle { state = state.copy(selected = document.copy(content = content), pendingDelete = DocumentDeleteIntent(accountId, documentId, spaceId), issue = DocumentIssue.DELETE_UNCERTAIN) }
        compose.onNodeWithTag("document-viewer").performScrollToNode(hasTestTag("document-retry-delete"))
        compose.runOnIdle { assertEquals(0, retries) }
        compose.onNodeWithTag("document-retry-delete").performClick()
        compose.runOnIdle { assertEquals(1, retries) }
    }

    private val documentHit = SearchDocumentDto(documentId, spaceId, space.name, "notes.md", "text/markdown", 2, 3, "<b>not HTML</b>", document.addedAt)
    private val taskHit = SearchTaskDto(taskId, spaceId, space.name, "Review budget", "Plan this month", "open", "2026-10-02")
    private val eventHit = SearchEventDto(eventId, spaceId, space.name, "Budget meeting", "Home", "scheduled", "2026-10-02T13:00:00Z", "Asia/Kolkata", "2026-10-02T18:30")
    private fun searchState() = SearchState(accountId = accountId, spaces = listOf(space), spacesLoaded = true, query = "budget",
        results = SearchResultsDto("budget", null, listOf(documentHit), listOf(taskHit), listOf(eventHit), false, false, false))

    @Test fun searchShowsThreeSectionsAndEachResultOpensItsExactSpace() {
        val documents = mutableListOf<SearchDocumentDto>()
        val tasks = mutableListOf<SearchTaskDto>()
        val events = mutableListOf<SearchEventDto>()
        compose.setContent { CommunityTheme { SearchScreen(searchState(), SearchActions(openDocument = { documents += it }, openTasks = { tasks += it }, openEvents = { events += it })) } }
        for (tag in listOf("search-documents-heading", "search-tasks-heading", "search-events-heading")) {
            compose.onNodeWithTag("search-content").performScrollToNode(hasTestTag(tag))
            compose.onNodeWithTag(tag).assertIsDisplayed()
        }
        compose.onNodeWithTag("search-content").performScrollToNode(hasTestTag("search-document-0"))
        compose.onNodeWithTag("search-document-0").assertTextContains(space.name).performClick()
        compose.onNodeWithTag("search-content").performScrollToNode(hasTestTag("search-task-$taskId"))
        compose.onNodeWithTag("search-task-$taskId").assertTextContains(space.name).performClick()
        compose.onNodeWithTag("search-content").performScrollToNode(hasTestTag("search-event-$eventId"))
        compose.onNodeWithTag("search-event-$eventId").assertTextContains(space.name).performClick()
        compose.runOnIdle { assertEquals(listOf(documentHit), documents); assertEquals(listOf(taskHit), tasks); assertEquals(listOf(eventHit), events) }
    }

    @Test fun narrowLargeTextDocumentChoiceAndMainActionStayInsideTheScreen() {
        val longName = "a".repeat(100) + ".markdown"
        val state = workspace().copy(chosen = file.copy(name = longName), choiceKey = "original-choice")
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { DocumentScreen(state, DocumentActions()) } }
            }
        }
        compose.onNodeWithTag("documents-content").performScrollToNode(hasTestTag("document-chosen-name"))
        compose.onNodeWithTag("document-chosen-name").assertTextContains(longName)
        compose.onNodeWithTag("documents-content").performScrollToNode(hasTestTag("document-add"))
        compose.onNodeWithTag("document-add").assertIsDisplayed()
        val parent = compose.onNodeWithTag("documents-content").fetchSemanticsNode().boundsInRoot
        val button = compose.onNodeWithTag("document-add").fetchSemanticsNode().boundsInRoot
        assertTrue(button.left >= parent.left && button.right <= parent.right)
    }

    @Test fun narrowLargeTextSearchSectionsAndSubmitRemainScrollable() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { SearchScreen(searchState(), SearchActions()) } }
            }
        }
        for (tag in listOf("search-submit", "search-documents-heading", "search-tasks-heading", "search-events-heading")) {
            compose.onNodeWithTag("search-content").performScrollToNode(hasTestTag(tag))
            compose.onNodeWithTag(tag).assertIsDisplayed()
            val parent = compose.onNodeWithTag("search-content").fetchSemanticsNode().boundsInRoot
            val child = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue(child.left >= parent.left && child.right <= parent.right)
        }
    }
}