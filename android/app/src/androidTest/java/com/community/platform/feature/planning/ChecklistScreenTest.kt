package com.community.platform.feature.planning

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasProgressBarRangeInfo
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
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
import com.community.platform.feature.assertInside
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.saveEvidence
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/** The task checklist built from synthetic state; the callbacks stand in for the view model. */
@RunWith(AndroidJUnit4::class)
class ChecklistScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val taskId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val milk = ChecklistItemDto("3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b", "Buy milk", false, null, null)
    private val bread = ChecklistItemDto("7a3e5c1d-2b4f-4a6e-8c0d-1e2f3a4b5c6d", "Buy bread", true, "2026-10-01T10:00:00Z", accountId)
    private val basis = ChecklistDto(taskId, spaceId, "Buy groceries", "open", "3", true, true, listOf(milk, bread), "\"${"a".repeat(64)}\"")
    private val offline = "No connection. Changes are not confirmed."
    private val leaveWarning = "The change may already be saved. Leaving loses this retry identity. Review the current checklist before making another change."
    private val discardWarning = "Unsaved edits will be discarded. A reload uses the latest task and checklist review."
    private val loading = hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)

    private fun state(checklist: ChecklistDto? = basis) = ChecklistState(accountId = accountId, taskId = taskId, spaceId = spaceId, basis = checklist)
    private fun intent(body: ChecklistChangeDto, key: String) = ChecklistIntent(accountId, taskId, spaceId, basis.etag, key, body)
    private fun actions(
        title: (String) -> Unit = {}, save: () -> Unit = {}, retry: () -> Unit = {}, reload: () -> Unit = {},
        check: (ChecklistItemDto, Boolean) -> Unit = { _, _ -> }, edit: (ChecklistItemDto) -> Unit = {}, remove: (ChecklistItemDto) -> Unit = {},
        confirmRemove: () -> Unit = {}, cancelEdit: () -> Unit = {},
    ) = ChecklistActions(title, save, retry, reload, check, edit, remove, confirmRemove, cancelEdit)
    private fun box(item: ChecklistItemDto) = "checklist-check-${item.id}"
    private fun editButton(item: ChecklistItemDto) = hasContentDescription("Edit checklist item: ${item.title}")
    private fun removeButton(item: ChecklistItemDto) = hasContentDescription("Remove checklist item: ${item.title}")
    // A list scroll only reaches the item; the item can be taller than the screen, so the node itself is then scrolled into view.
    private fun reveal(matcher: SemanticsMatcher) {
        compose.onNodeWithTag("task-checklist").performScrollToNode(matcher)
        compose.onNode(matcher).performScrollTo()
    }
    private fun reveal(tag: String) = reveal(hasTestTag(tag))
    // The list composes only what is near the screen, so a check that something at the end is gone first scrolls there.
    private fun scrollToEnd() { compose.onNodeWithTag("task-checklist").performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, 100_000f) } }
    private fun draft() = compose.onNodeWithTag("checklist-item-title").fetchSemanticsNode().config[SemanticsProperties.EditableText].text

    @Test fun loadingFailedEmptyAndDeniedStatesShowOnlyWhatIsKnown() {
        var current by mutableStateOf(state(checklist = null).copy(busy = true))
        var reloads = 0
        compose.setContent { CommunityTheme { ChecklistScreen(current, actions(reload = { reloads += 1 }), {}) } }
        compose.onNode(loading).assertExists()
        compose.onNodeWithContentDescription("Back to tasks").assertIsNotEnabled()
        compose.onNodeWithText("Reload current checklist").assertDoesNotExist()
        compose.onNodeWithTag("checklist-item-title").assertDoesNotExist()

        // The first load failed: the reason and a reload, and no checklist.
        compose.runOnIdle { current = state(checklist = null).copy(error = offline) }
        compose.onNode(loading).assertDoesNotExist()
        compose.onNodeWithText(offline).assertIsDisplayed()
        compose.onNodeWithText("No checklist items.").assertDoesNotExist()
        compose.onNodeWithText("Reload current checklist").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, reloads) }

        compose.runOnIdle { current = state(basis.copy(items = emptyList())) }
        compose.onNodeWithText(offline).assertDoesNotExist()
        compose.onNodeWithText("Buy groceries").assertIsDisplayed()
        compose.onNodeWithText("0 of 0 items checked").assertIsDisplayed()
        compose.onNodeWithText("No checklist items.").assertIsDisplayed()
        reveal("checklist-save")
        compose.onNodeWithTag("checklist-save").assertTextEquals("Add item").assertIsNotEnabled()
        compose.onNodeWithText("Reload current checklist").assertDoesNotExist()

        // Access was lost: the reason stays; the checklist and every control go, even though an earlier checklist is still held.
        compose.runOnIdle { current = state().copy(denied = true, error = "You no longer have access to this task.") }
        compose.onNodeWithText("You no longer have access to this task.").assertIsDisplayed()
        for (gone in listOf(hasText("Buy groceries"), hasText("Buy milk"), hasTestTag(box(milk)), hasTestTag("checklist-item-title"), hasText("Reload current checklist"))) {
            compose.onNode(gone).assertDoesNotExist()
        }
        compose.runOnIdle { assertEquals(1, reloads) }
    }

    @Test fun itemsShowWhatIsCheckedAndOnlyTheActionsThePersonMayUse() {
        var current by mutableStateOf(state())
        val checks = mutableListOf<Pair<String, Boolean>>()
        val edits = mutableListOf<String>()
        val removals = mutableListOf<String>()
        val callbacks = actions(check = { item, value -> checks += item.id to value }, edit = { edits += it.id }, remove = { removals += it.id })
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        compose.onNodeWithText("Buy groceries").assertIsDisplayed()
        compose.onNodeWithText("1 of 2 items checked").assertIsDisplayed()
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).assertIsOff().assertIsEnabled().performClick()
        reveal(box(bread))
        compose.onNodeWithTag(box(bread)).assertIsOn().assertIsEnabled().performClick()
        reveal(editButton(milk))
        compose.onNode(editButton(milk)).assertIsEnabled().performClick()
        reveal(removeButton(bread))
        compose.onNode(removeButton(bread)).assertIsEnabled().performClick()
        reveal("checklist-item-title")
        compose.onNodeWithTag("checklist-item-title").assertIsEnabled()
        compose.runOnIdle {
            assertEquals(listOf(milk.id to true, bread.id to false), checks)
            assertEquals(listOf(milk.id), edits)
            assertEquals(listOf(bread.id), removals)
        }

        // Someone who may only tick items sees no edit, remove or add controls.
        compose.runOnIdle { current = state(basis.copy(canManage = false)) }
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).assertIsEnabled()
        scrollToEnd()
        for (gone in listOf(editButton(milk), removeButton(milk), editButton(bread), removeButton(bread), hasTestTag("checklist-item-title"), hasTestTag("checklist-save"))) {
            compose.onNode(gone).assertDoesNotExist()
        }

        // A completed task can only be read.
        compose.runOnIdle { current = state(basis.copy(taskStatus = "completed", canManage = false, canCheck = false)) }
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).assertIsOff().assertIsNotEnabled().performClick()
        reveal(box(bread))
        compose.onNodeWithTag(box(bread)).assertIsOn().assertIsNotEnabled().performClick()
        compose.runOnIdle { assertEquals(2, checks.size) }
    }

    @Test fun aTickIsSentOnceAndShownOnlyWhenTheServerConfirmsIt() {
        var current by mutableStateOf(state())
        val sent = mutableListOf<ChecklistChangeDto>()
        val callbacks = actions(check = { item, value ->
            val body = ChecklistChangeDto("check", itemId = item.id, checked = value)
            sent += body
            current = current.copy(pending = intent(body, "check-key"), busy = true)
        })
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).performClick()
        compose.runOnIdle { assertEquals(listOf(ChecklistChangeDto("check", itemId = milk.id, checked = true)), sent) }

        // While the answer is pending the item is not shown ticked and nothing else can be sent.
        compose.onNode(loading).assertExists()
        compose.onNodeWithContentDescription("Back to tasks").assertIsNotEnabled()
        compose.onNodeWithTag(box(milk)).assertIsOff().assertIsNotEnabled().performClick()
        reveal(box(bread))
        compose.onNodeWithTag(box(bread)).assertIsNotEnabled().performClick()
        compose.onNode(editButton(bread)).assertIsNotEnabled()
        compose.onNode(removeButton(bread)).assertIsNotEnabled()
        reveal(hasText("1 of 2 items checked"))
        reveal("checklist-save")
        compose.onNodeWithTag("checklist-item-title").assertIsNotEnabled()
        compose.onNodeWithTag("checklist-save").assertIsNotEnabled()
        scrollToEnd()
        compose.onNodeWithTag("checklist-retry").assertDoesNotExist()
        compose.runOnIdle { assertEquals(1, sent.size) }

        val ticked = milk.copy(checked = true, checkedAt = "2026-10-02T09:00:00Z", checkedByAccountId = accountId)
        compose.runOnIdle { current = state(basis.copy(items = listOf(ticked, bread), etag = "\"${"b".repeat(64)}\"")).copy(notice = "Checklist saved.") }
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).assertIsOn().assertIsEnabled()
        reveal(hasText("2 of 2 items checked"))
        compose.onNodeWithText("Checklist saved.").assertIsDisplayed()
        compose.onNode(loading).assertDoesNotExist()
    }

    @Test fun aLostTickIsNeverShownAsDoneAndRetrySendsTheSameChange() {
        val pending = intent(ChecklistChangeDto("check", itemId = milk.id, checked = true), "original-check-key")
        var current by mutableStateOf(state().copy(pending = pending, error = offline))
        var retries = 0
        val calls = mutableListOf<String>()
        val callbacks = actions(
            retry = { retries += 1; current = current.copy(busy = true, error = null) },
            check = { _, _ -> calls += "check" }, save = { calls += "save" }, edit = { calls += "edit" }, remove = { calls += "remove" }, reload = { calls += "reload" },
        )
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        compose.onNodeWithText(offline).assertIsDisplayed()
        compose.onNodeWithText("Checklist saved.").assertDoesNotExist()
        compose.onNodeWithText("1 of 2 items checked").assertIsDisplayed()
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).assertIsOff().assertIsNotEnabled().performClick()
        reveal(box(bread))
        compose.onNodeWithTag(box(bread)).assertIsNotEnabled().performClick()
        compose.onNode(editButton(bread)).assertIsNotEnabled().performClick()
        compose.onNode(removeButton(bread)).assertIsNotEnabled().performClick()
        reveal("checklist-retry")
        compose.onNodeWithText("The change is unconfirmed.").assertIsDisplayed()
        compose.onNodeWithTag("checklist-retry").assertTextEquals("Retry original change").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, retries); assertTrue(calls.toString(), calls.isEmpty()); assertEquals(pending, current.pending) }

        // The retry is in flight: it cannot be sent twice, and the item is still not shown ticked.
        compose.onNode(loading).assertExists()
        scrollToEnd()
        compose.onNodeWithTag("checklist-retry").assertDoesNotExist()
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).assertIsOff().assertIsNotEnabled()
        compose.runOnIdle { assertEquals(1, retries) }
    }

    @Test fun removingAnItemAsksFirstNamesItAndKeepSendsNothing() {
        var current by mutableStateOf(state())
        val removed = mutableListOf<String>()
        val callbacks = actions(
            remove = { current = current.copy(removing = it) },
            cancelEdit = { current = current.copy(title = "", editingId = null, removing = null) },
            confirmRemove = {
                val item = current.removing
                removed += item?.id ?: "without a question"
                current = current.copy(pending = intent(ChecklistChangeDto("remove", itemId = item?.id), "remove-key"), busy = true)
            },
        )
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        reveal(removeButton(milk))
        compose.onNode(removeButton(milk)).performClick()
        reveal(hasText("Remove Buy milk?"))
        compose.onNodeWithText("Remove Buy milk?").assertIsDisplayed()
        compose.onNodeWithTag("checklist-item-title").assertDoesNotExist()
        compose.runOnIdle { assertTrue(removed.isEmpty()) }
        // While the question is open nothing else can change.
        reveal(box(bread))
        compose.onNodeWithTag(box(bread)).assertIsNotEnabled()
        compose.onNode(editButton(bread)).assertIsNotEnabled()
        compose.onNode(removeButton(bread)).assertIsNotEnabled()
        reveal(hasText("Keep item"))
        compose.onNodeWithText("Keep item").assertIsEnabled().performClick()
        compose.onNodeWithText("Remove Buy milk?").assertDoesNotExist()
        compose.runOnIdle { assertTrue(removed.isEmpty()); assertNull(current.removing) }
        reveal("checklist-item-title")

        reveal(removeButton(milk))
        compose.onNode(removeButton(milk)).performClick()
        reveal(hasText("Remove item"))
        compose.onNodeWithText("Remove item").performClick()
        compose.runOnIdle { assertEquals(listOf(milk.id), removed) }
        // In flight neither answer can be given again, and only the server's answer removes the item.
        compose.onNodeWithText("Remove item").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Keep item").assertIsNotEnabled().performClick()
        reveal(box(milk))
        compose.onNodeWithText("Buy milk").assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf(milk.id), removed) }

        compose.runOnIdle { current = state(basis.copy(items = listOf(bread), etag = "\"${"c".repeat(64)}\"")) }
        compose.onNodeWithText("Buy milk").assertDoesNotExist()
        reveal(hasText("1 of 1 item checked"))
        compose.onNodeWithText("1 of 1 item checked").assertIsDisplayed()
    }

    @Test fun renamingStartsFromTheItemTitleAndCancelSendsNothing() {
        var current by mutableStateOf(state())
        val saved = mutableListOf<Pair<String?, String>>()
        val callbacks = actions(
            edit = { current = current.copy(editingId = it.id, title = it.title) },
            title = { current = current.copy(title = it) },
            cancelEdit = { current = current.copy(title = "", editingId = null, removing = null) },
            save = { saved += current.editingId to current.title },
        )
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        reveal(editButton(milk))
        compose.onNode(editButton(milk)).performClick()
        reveal("checklist-save")
        compose.onNodeWithText("Item title", useUnmergedTree = true).assertExists()
        compose.onNodeWithTag("checklist-save").assertTextEquals("Save item").assertIsEnabled()
        assertEquals("Buy milk", draft())
        compose.onNodeWithTag("checklist-item-title").performTextReplacement("Buy oat milk")
        assertEquals("Buy oat milk", draft())
        // While renaming, no item can be ticked, edited or removed.
        reveal(box(bread))
        compose.onNodeWithTag(box(bread)).assertIsNotEnabled()
        compose.onNode(editButton(bread)).assertIsNotEnabled()
        compose.onNode(removeButton(bread)).assertIsNotEnabled()
        reveal(hasText("Cancel"))
        compose.onNodeWithText("Cancel").performClick()
        compose.runOnIdle { assertTrue(saved.isEmpty()); assertNull(current.editingId) }
        assertEquals("", draft())
        compose.onNodeWithText("New item", useUnmergedTree = true).assertExists()
        compose.onNodeWithTag("checklist-save").assertTextEquals("Add item").assertIsNotEnabled()

        reveal(editButton(milk))
        compose.onNode(editButton(milk)).performClick()
        reveal("checklist-item-title")
        compose.onNodeWithTag("checklist-item-title").performTextReplacement("Buy oat milk")
        reveal("checklist-save")
        compose.onNodeWithTag("checklist-save").performClick()
        compose.runOnIdle { assertEquals(listOf(milk.id to "Buy oat milk"), saved) }
    }

    @Test fun anUnconfirmedAddKeepsTheDraftLockedAndOnlyRetrySendsIt() {
        val pending = intent(ChecklistChangeDto("add", title = "Buy batteries"), "original-add-key")
        var current by mutableStateOf(state().copy(title = "Buy batteries", pending = pending, error = offline))
        var retries = 0
        var saves = 0
        val typed = mutableListOf<String>()
        val callbacks = actions(retry = { retries += 1; current = current.copy(busy = true, error = null) }, save = { saves += 1 }, title = { typed += it })
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        reveal("checklist-item-title")
        compose.onNodeWithTag("checklist-item-title").assertIsNotEnabled()
        assertEquals("Buy batteries", draft())
        compose.onNodeWithTag("checklist-save").assertIsNotEnabled().performClick()
        reveal("checklist-retry")
        compose.onNodeWithTag("checklist-retry").performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(0, saves); assertTrue(typed.isEmpty()); assertEquals(pending, current.pending) }

        // In flight the draft stays, locked, and the screen cannot be left.
        reveal("checklist-item-title")
        compose.onNodeWithTag("checklist-item-title").assertIsNotEnabled()
        assertEquals("Buy batteries", draft())
        compose.onNodeWithContentDescription("Back to tasks").assertIsNotEnabled()

        // The answer is lost again: the same draft and the same retry are still there.
        compose.runOnIdle { current = current.copy(busy = false, error = offline) }
        reveal("checklist-retry")
        compose.onNodeWithTag("checklist-retry").assertIsEnabled()
        reveal("checklist-item-title")
        assertEquals("Buy batteries", draft())
        compose.runOnIdle { assertEquals(pending, current.pending); assertEquals(0, saves) }
    }

    @Test fun aRefusedChangeKeepsTheDraftAndReloadAsksBeforeDiscardingIt() {
        val refusal = "The checklist changed. Reload it before making another change."
        var current by mutableStateOf(state().copy(title = "Buy batteries", conflict = true, error = refusal))
        var reloads = 0
        var saves = 0
        val callbacks = actions(reload = { reloads += 1 }, save = { saves += 1 }, title = { current = current.copy(title = it) })
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        compose.onNodeWithText(refusal).assertIsDisplayed()
        reveal(box(milk))
        compose.onNodeWithTag(box(milk)).assertIsNotEnabled()
        reveal("checklist-item-title")
        compose.onNodeWithTag("checklist-item-title").assertIsEnabled()
        assertEquals("Buy batteries", draft())
        compose.onNodeWithTag("checklist-save").assertIsNotEnabled().performClick()
        scrollToEnd()
        compose.onNodeWithTag("checklist-retry").assertDoesNotExist()
        reveal(hasText("Reload current checklist"))
        compose.onNodeWithText("Reload current checklist").performClick()
        compose.onNodeWithText("Discard the current draft?").assertIsDisplayed()
        compose.onNodeWithText(discardWarning).assertIsDisplayed()
        compose.onNodeWithText("Keep editing").performClick()
        compose.onNode(isDialog()).assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, reloads) }
        assertEquals("Buy batteries", draft())

        reveal(hasText("Reload current checklist"))
        compose.onNodeWithText("Reload current checklist").performClick()
        compose.onNodeWithText("Continue").performClick()
        compose.runOnIdle { assertEquals(1, reloads); assertEquals(0, saves) }
    }

    @Test fun leavingAsksFirstWhenAChangeIsUnconfirmedOrADraftWouldBeLost() {
        val pending = intent(ChecklistChangeDto("check", itemId = milk.id, checked = true), "original-check-key")
        var current by mutableStateOf(state().copy(pending = pending, error = offline))
        var leaves = 0
        compose.setContent { CommunityTheme { ChecklistScreen(current, actions(), { leaves += 1 }) } }
        val back = compose.onNodeWithContentDescription("Back to tasks")
        back.assertIsEnabled().performClick()
        compose.onNodeWithText("Leave an unconfirmed change?").assertIsDisplayed()
        compose.onNodeWithText(leaveWarning).assertIsDisplayed()
        compose.onNodeWithText("Keep editing").performClick()
        compose.onNode(isDialog()).assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, leaves); assertEquals(pending, current.pending) }
        back.performClick()
        compose.onNodeWithText("Continue").performClick()
        compose.runOnIdle { assertEquals(1, leaves) }

        for (unsaved in listOf(state().copy(title = "Buy batteries"), state().copy(editingId = milk.id, title = "Buy oat milk"), state().copy(removing = milk))) {
            compose.runOnIdle { current = unsaved }
            back.performClick()
            compose.onNodeWithText("Discard the current draft?").assertIsDisplayed()
            compose.onNodeWithText(discardWarning).assertIsDisplayed()
            compose.onNodeWithText("Keep editing").performClick()
            compose.onNode(isDialog()).assertDoesNotExist()
            compose.runOnIdle { assertEquals(1, leaves); assertEquals(unsaved, current) }
        }

        compose.runOnIdle { current = state() }
        back.performClick()
        compose.onNode(isDialog()).assertDoesNotExist()
        compose.runOnIdle { assertEquals(2, leaves) }
        compose.runOnIdle { current = state().copy(busy = true) }
        back.assertIsNotEnabled().performClick()
        compose.onNode(isDialog()).assertDoesNotExist()
        compose.runOnIdle { assertEquals(2, leaves) }
    }

    @Test fun aCommandInFlightDisablesEveryChecklistControl() {
        var current by mutableStateOf(state().copy(busy = true))
        val calls = mutableListOf<String>()
        var leaves = 0
        val callbacks = actions(
            title = { calls += "title" }, save = { calls += "save" }, retry = { calls += "retry" }, reload = { calls += "reload" },
            check = { _, _ -> calls += "check" }, edit = { calls += "edit" }, remove = { calls += "remove" },
            confirmRemove = { calls += "confirm" }, cancelEdit = { calls += "cancel" },
        )
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, { leaves += 1 }) } }
        compose.onNode(loading).assertExists()
        compose.onNodeWithContentDescription("Back to tasks").assertIsNotEnabled().performClick()
        for (item in listOf(milk, bread)) {
            reveal(box(item))
            compose.onNodeWithTag(box(item)).assertIsNotEnabled().performClick()
            compose.onNode(editButton(item)).assertIsNotEnabled().performClick()
            compose.onNode(removeButton(item)).assertIsNotEnabled().performClick()
        }
        reveal("checklist-save")
        compose.onNodeWithTag("checklist-item-title").assertIsNotEnabled()
        compose.onNodeWithTag("checklist-save").assertIsNotEnabled().performClick()

        // A rename in flight: the draft, Save item and Cancel all wait.
        compose.runOnIdle {
            current = state().copy(busy = true, editingId = milk.id, title = "Buy oat milk",
                pending = intent(ChecklistChangeDto("rename", itemId = milk.id, title = "Buy oat milk"), "rename-key"))
        }
        reveal("checklist-save")
        compose.onNodeWithTag("checklist-item-title").assertIsNotEnabled()
        compose.onNodeWithTag("checklist-save").assertTextEquals("Save item").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Cancel").assertIsNotEnabled().performClick()

        // A removal in flight: neither answer can be given.
        compose.runOnIdle { current = state().copy(busy = true, removing = milk, pending = intent(ChecklistChangeDto("remove", itemId = milk.id), "remove-key")) }
        reveal(hasText("Remove item"))
        compose.onNodeWithText("Remove item").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Keep item").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Back to tasks").assertIsNotEnabled().performClick()
        compose.runOnIdle { assertTrue(calls.toString(), calls.isEmpty()); assertEquals(0, leaves) }
    }

    @Test fun theMessageAfterAnActionFurtherDownComesIntoView() {
        val items = (1..8).map { milk.copy(id = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a6$it", title = "Buy item $it") }
        var current by mutableStateOf(state(basis.copy(items = items)).copy(title = "Buy batteries"))
        val callbacks = actions(save = { current = current.copy(pending = intent(ChecklistChangeDto("add", title = "Buy batteries"), "original-add-key"), error = offline) })
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        reveal("checklist-save")
        compose.onNodeWithTag("checklist-save").performClick()
        // The answer was lost: the message is the list's first item, far above the button that was pressed.
        compose.onNodeWithText(offline).assertIsDisplayed()
    }

    @Test fun errorAndNoticeArePoliteLiveRegions() {
        val notice = "Checklist saved."
        val current = state(checklist = null).copy(error = offline, notice = notice)
        compose.setContent { CommunityTheme { ChecklistScreen(current, actions(), {}) } }
        for (message in listOf(offline, notice)) {
            compose.onNodeWithText(message).assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion))
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsItemsTheEditorAndBothQuestionsUsable() {
        assertNarrowScreen()
        val task = "Buy groceries for the whole family and the weekend picnic at the lake"
        val item = milk.copy(title = "Buy two litres of oat milk and a dozen free-range eggs from the corner shop")
        var current by mutableStateOf(state(basis.copy(taskTitle = task, items = listOf(item, bread))))
        val callbacks = actions(remove = { current = current.copy(removing = it) }, cancelEdit = { current = current.copy(title = "", editingId = null, removing = null) })
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        compose.assertReachable("task-checklist", hasText(task))
        compose.assertTextNotClipped(hasText(task))
        compose.assertTextNotClipped(hasText("1 of 2 items checked"))
        compose.assertReachable("task-checklist", hasText(item.title))
        compose.assertTextNotClipped(hasText(item.title))
        compose.onRoot().saveEvidence("checklist-native-large-text.png")
        for (matcher in listOf(hasTestTag(box(item)), editButton(item), removeButton(item), hasTestTag(box(bread)))) {
            compose.assertReachable("task-checklist", matcher)
        }
        compose.assertReachable("task-checklist", "checklist-item-title")
        compose.assertReachable("task-checklist", "checklist-save")
        compose.assertTextNotClipped(hasText("Add item") and hasAnyAncestor(hasTestTag("checklist-save")))
        compose.onRoot().saveEvidence("checklist-editor-native-large-text.png")

        compose.onNode(removeButton(item)).performClick()
        val question = "Remove ${item.title}?"
        compose.assertReachable("task-checklist", hasText(question))
        compose.assertTextNotClipped(hasText(question))
        compose.assertReachable("task-checklist", hasText("Keep item"))
        compose.assertReachable("task-checklist", hasText("Remove item"))
        compose.assertTextNotClipped(hasText("Remove item"))
        compose.onRoot().saveEvidence("checklist-remove-native-large-text.png")
        compose.onNodeWithText("Keep item").performClick()

        // An unconfirmed change: the retry, and the question before leaving.
        compose.runOnIdle { current = current.copy(pending = intent(ChecklistChangeDto("check", itemId = item.id, checked = true), "original-check-key"), error = offline) }
        compose.assertReachable("task-checklist", hasText(offline))
        compose.assertTextNotClipped(hasText(offline))
        compose.assertReachable("task-checklist", "checklist-retry")
        compose.assertTextNotClipped(hasText("The change is unconfirmed."))
        compose.assertTextNotClipped(hasText("Retry original change"))
        compose.onNodeWithContentDescription("Back to tasks").performClick()
        compose.onNode(isDialog()).saveEvidence("checklist-leave-native-large-text.png")
        compose.assertInside(isDialog(), hasText("Keep editing"))
        compose.assertInside(isDialog(), hasText("Continue"))
        compose.assertTextNotClipped(hasText("Leave an unconfirmed change?"))
        compose.assertTextNotClipped(hasText(leaveWarning))
        compose.assertInside(isDialog(), hasText(leaveWarning))
        assertEndsAboveTheButtons(leaveWarning)
        compose.onNodeWithText("Keep editing").performClick()
        compose.onNode(isDialog()).assertDoesNotExist()

        // The question before a draft is discarded.
        compose.runOnIdle { current = current.copy(pending = null, error = null, title = "Buy batteries") }
        compose.onNodeWithContentDescription("Back to tasks").performClick()
        compose.onNode(isDialog()).saveEvidence("checklist-discard-native-large-text.png")
        compose.assertInside(isDialog(), hasText("Keep editing"))
        compose.assertInside(isDialog(), hasText("Continue"))
        compose.assertTextNotClipped(hasText("Discard the current draft?"))
        compose.assertTextNotClipped(hasText(discardWarning))
        compose.assertInside(isDialog(), hasText(discardWarning))
        assertEndsAboveTheButtons(discardWarning)
        compose.onNodeWithText("Keep editing").performClick()
        compose.onNode(isDialog()).assertDoesNotExist()
    }

    /** The dialog's explanation ends before its buttons start, so none of it is hidden behind them. */
    private fun assertEndsAboveTheButtons(text: String) {
        val bottom = compose.onNode(hasText(text)).fetchSemanticsNode().boundsInRoot.bottom
        for (button in listOf("Continue", "Keep editing")) {
            val top = compose.onNodeWithText(button).fetchSemanticsNode().boundsInRoot.top
            assertTrue("\"$text\" ends at $bottom, below the top of $button at $top", bottom <= top)
        }
    }

    @DeviceFontScale(2f)
    @Test fun theSameErrorAfterAnotherActionFurtherDownComesIntoView() {
        assertNarrowScreen()
        val items = (1..20).map { milk.copy(id = "synthetic-item-$it", title = "Buy item $it") }
        var current by mutableStateOf(state(basis.copy(items = items)).copy(title = "Buy batteries"))
        val callbacks = actions(save = { current = current.copy(error = offline, messageId = current.messageId + 1) })
        compose.setContent { CommunityTheme { ChecklistScreen(current, callbacks, {}) } }
        repeat(2) {
            reveal("checklist-save")
            compose.onNodeWithText(offline).assertIsNotDisplayed()
            compose.onNodeWithTag("checklist-save").assertTextEquals("Add item").performClick()
            compose.onNodeWithText(offline).assertIsDisplayed().assertTextEquals(offline)
        }
        compose.runOnIdle { assertEquals(2L, current.messageId) }
    }
}
