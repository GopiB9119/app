package com.community.platform.feature.planning

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
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.captureToImage
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
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TaskScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val memberId = "0f97b948-9800-432f-9d15-407df739d08e"
    private val space = FamilySpaceDto("c2937183-70fb-4d7a-b0b6-b1bc9c499444", "Morgan family", "owner")
    private val task = FamilyTaskDto(
        "c2302436-0dd7-4d99-a7c3-ead390fd08eb", space.id,
        "Buy groceries for the weekend", "Fruit, bread and vegetables", "2026-09-21", "open",
        TaskAssigneeDto(memberId, "Sam Example"), false, accountId, null, null,
        "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", "1",
        TaskPermissionsDto(true, listOf("in_progress", "completed", "cancelled")),
    )
    private val record = TaskRecord(task, "\"original-view\"")
    private fun workspace() = TaskWorkspaceState(accountId = accountId, spaces = listOf(space), selectedSpace = space, tasks = listOf(record))

    private fun actions(
        open: (TaskRecord) -> Unit = {},
        update: (TaskFields, Boolean) -> Unit = { _, _ -> },
        save: () -> Unit = {},
        propose: (TaskRecord, String) -> Unit = { _, _ -> },
        confirm: () -> Unit = {},
        cancel: () -> Unit = {},
        retry: () -> Unit = {},
        reload: () -> Unit = {},
    ) = TaskActions({}, {}, {}, {}, {}, {}, open, {}, update, save, {}, {}, propose, confirm, cancel, retry, reload)

    private fun reveal(matcher: SemanticsMatcher) {
        compose.onNodeWithTag("task-workspace").performScrollToNode(matcher)
    }

    @Test fun listRendersScopedTaskAndOpensTheExactSelectedRecord() {
        val opened = mutableListOf<TaskRecord>()
        compose.setContent { CommunityTheme { TaskScreen(workspace(), actions(open = { opened.add(it) }), {}) } }
        compose.onNodeWithTag("task-space").assertTextContains("Morgan family")
        reveal(hasTestTag("task-row-${task.id}"))
        compose.onNodeWithTag("task-row-${task.id}").assertIsDisplayed()
        capture("tasks-list.png")
        compose.onNodeWithTag("task-row-${task.id}").performClick()
        compose.runOnIdle { assertEquals(listOf(record), opened) }
    }

    @Test fun editorPreservesCalendarDateAndSendsExplicitAssigneeSelection() {
        var state by mutableStateOf(workspace().copy(editor = TaskEditor(fields = TaskFields("Household task", "", "2026-09-21", null)), assignees = listOf(TaskAssigneeDto(memberId, "Sam Example"))))
        val selections = mutableListOf<Pair<TaskFields, Boolean>>()
        var saved: TaskFields? = null
        val callbacks = actions(update = { fields, changed ->
            selections.add(fields to changed)
            state = state.copy(editor = state.editor!!.copy(fields = fields, changeAssignee = state.editor!!.changeAssignee || changed))
        }, save = { saved = state.editor!!.fields })
        compose.setContent { CommunityTheme { TaskScreen(state, callbacks, {}) } }
        reveal(hasTestTag("task-title"))
        compose.onNodeWithTag("task-title").performTextReplacement("Buy groceries")
        reveal(hasTestTag("task-notes"))
        compose.onNodeWithTag("task-notes").performTextReplacement("Fruit and bread")
        reveal(hasTestTag("task-due-date"))
        compose.onNodeWithTag("task-due-date").performClick()
        compose.onNodeWithText("Tuesday, September 22, 2026").performClick()
        compose.onNodeWithTag("task-date-confirm").performClick()
        compose.runOnIdle { assertEquals("2026-09-22", state.editor!!.fields.dueDate) }
        reveal(hasTestTag("task-assignee"))
        compose.onNodeWithTag("task-assignee").performClick()
        compose.onNodeWithText("Sam Example").performClick()
        reveal(hasTestTag("task-save"))
        compose.onNodeWithTag("task-save").performClick()
        compose.runOnIdle {
            assertEquals(TaskFields("Buy groceries", "Fruit and bread", "2026-09-22", memberId), saved)
            assertTrue(selections.last().second)
        }
        reveal(hasTestTag("task-due-date"))
        compose.onNodeWithContentDescription("Clear due date").performClick()
        compose.runOnIdle { assertNull(state.editor!!.fields.dueDate) }
    }

    @Test fun unconfirmedSaveLocksTheDraftAndRetriesOnlyOnExplicitTap() {
        val fields = TaskFields("Groceries", "Fruit", "2026-09-21", memberId)
        val command = CreateTaskCommand(accountId, space.id, "preserved-request", fields)
        val state = workspace().copy(editor = TaskEditor(fields = fields), pendingCommand = command, error = "Synthetic timeout")
        var retries = 0
        var exits = 0
        compose.setContent { CommunityTheme { TaskScreen(state, actions(retry = { retries += 1 }), { exits += 1 }) } }
        reveal(hasTestTag("task-title"))
        compose.onNodeWithTag("task-title").assertIsNotEnabled()
        compose.onNodeWithTag("task-title").assertTextContains("Groceries")
        reveal(hasTestTag("task-save"))
        compose.onNodeWithTag("task-save").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, retries) }
        reveal(hasText("Retry original request"))
        compose.onNodeWithText("Retry original request").performClick()
        compose.runOnIdle { assertEquals(1, retries) }
        compose.onNodeWithContentDescription("Back to tasks").performClick()
        compose.onNodeWithText("Leave with an unconfirmed change?").assertIsDisplayed()
        compose.onNodeWithTag("task-local-cancel").performClick()
        compose.runOnIdle { assertEquals(0, exits); assertEquals(command, state.pendingCommand) }
    }

    @Test fun onlyPermittedStatusActionsAppearAndConfirmationKeepsTheirTarget() {
        val permitted = record.copy(task = task.copy(permissions = TaskPermissionsDto(false, listOf("completed"))))
        var state by mutableStateOf(workspace().copy(detail = permitted))
        val confirmed = mutableListOf<TaskStatusConfirmation>()
        val callbacks = actions(
            propose = { selected, status -> state = state.copy(confirmation = TaskStatusConfirmation(selected, status)) },
            confirm = { confirmed.add(state.confirmation!!); state = state.copy(confirmation = null) },
            cancel = { state = state.copy(confirmation = null) },
        )
        compose.setContent { CommunityTheme { TaskScreen(state, callbacks, {}) } }
        reveal(hasText("Complete task"))
        compose.onNodeWithText("Edit task").assertDoesNotExist()
        compose.onNodeWithText("Cancel task").assertDoesNotExist()
        compose.onNodeWithText("Complete task").performClick()
        compose.onNodeWithText("Change status to Completed?").assertIsDisplayed()
        compose.runOnIdle { assertTrue(confirmed.isEmpty()) }
        compose.onNodeWithTag("task-status-confirm").performClick()
        compose.runOnIdle { assertEquals(listOf(TaskStatusConfirmation(permitted, "completed")), confirmed) }
    }

    @Test fun conflictDoesNotDiscardDraftUntilReloadIsConfirmed() {
        val state = workspace().copy(editor = TaskEditor(original = record, fields = TaskFields("My unsaved title", "Notes", task.dueDate, memberId)), conflict = true, error = "This task changed. Reload and review.")
        var reloads = 0
        compose.setContent { CommunityTheme { TaskScreen(state, actions(reload = { reloads += 1 }), {}) } }
        reveal(hasTestTag("task-save"))
        compose.onNodeWithTag("task-save").assertIsNotEnabled()
        reveal(hasText("Reload latest task"))
        compose.onNodeWithText("Reload latest task").performClick()
        compose.onNodeWithText("Discard this draft and reload the latest task?").assertIsDisplayed()
        compose.onNodeWithTag("task-local-cancel").performClick()
        compose.runOnIdle { assertEquals(0, reloads) }
        reveal(hasTestTag("task-title"))
        compose.onNodeWithTag("task-title").assertTextContains("My unsaved title")
        reveal(hasText("Reload latest task"))
        compose.onNodeWithText("Reload latest task").performClick()
        compose.onNodeWithTag("task-local-confirm").performClick()
        compose.runOnIdle { assertEquals(1, reloads) }
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        val fields = TaskFields("Groceries", "Fruit", "2026-09-21", memberId)
        val offline = "No connection. Changes are not confirmed."
        var state by mutableStateOf(workspace().copy(editor = TaskEditor(fields = fields), assignees = listOf(TaskAssigneeDto(memberId, "Sam Example"))))
        val callbacks = actions(save = { state = state.copy(pendingCommand = CreateTaskCommand(accountId, space.id, "preserved-request", fields), error = offline) })
        compose.setContent { CommunityTheme { TaskScreen(state, callbacks, {}) } }
        reveal(hasTestTag("task-save"))
        compose.onNodeWithTag("task-save").performScrollTo().performClick()
        // The answer was lost: the message is the list's first item, far above the button that was pressed.
        compose.onNodeWithText(offline).assertIsDisplayed()
    }

    @Test fun largeTextNarrowEditorRemainsScrollableWithoutLosingTheDraft() {
        val fields = TaskFields("A detailed family task that needs several lines to read", "Notes stay available with larger text.", "2026-09-21", memberId)
        val state = workspace().copy(editor = TaskEditor(fields = fields), assignees = listOf(TaskAssigneeDto(memberId, "Sam Example")))
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { TaskScreen(state, actions(), {}) } }
            }
        }
        reveal(hasTestTag("task-title"))
        compose.onNodeWithTag("task-title").assertTextContains(fields.title)
        capture("tasks-editor-large-text.png")
        reveal(hasTestTag("task-save"))
        compose.onNodeWithTag("task-save").assertIsDisplayed()
        val parent = compose.onNodeWithTag("task-workspace").fetchSemanticsNode().boundsInRoot
        val save = compose.onNodeWithTag("task-save").fetchSemanticsNode().boundsInRoot
        assertTrue(save.left >= parent.left && save.right <= parent.right)
        assertFalse(save.isEmpty)
    }

    private fun capture(name: String) {
        val image = compose.onRoot().captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("test-evidence"), name)
        file.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(file.length() > 1000)
    }

    @DeviceFontScale(2f)
    @Test fun theSameErrorAfterAnotherActionFurtherDownComesIntoView() {
        assertNarrowScreen()
        val tasks = (1..20).map { record.copy(task = task.copy(id = "synthetic-task-$it", title = "Task $it")) }
        val offline = "No connection. Changes are not confirmed."
        var current by mutableStateOf(workspace().copy(tasks = tasks, nextCursor = "synthetic-next"))
        val callbacks = actions().copy(loadMore = { current = current.copy(error = offline, messageId = current.messageId + 1) })
        compose.setContent { CommunityTheme { TaskScreen(current, callbacks, {}) } }
        repeat(2) {
            reveal(hasText("Load more tasks"))
            compose.onNodeWithText("Load more tasks").performScrollTo()
            compose.onNodeWithText(offline).assertIsNotDisplayed()
            compose.onNodeWithText("Load more tasks").performClick()
            compose.onNodeWithText(offline).assertIsDisplayed().assertTextEquals(offline)
        }
        compose.runOnIdle { assertEquals(2L, current.messageId) }
    }
}