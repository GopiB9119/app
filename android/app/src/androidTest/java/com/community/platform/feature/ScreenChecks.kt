package com.community.platform.feature

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue

/** The emulator is set to 640 x 1280 px at density 320, so the app really is 320 dp wide. */
internal fun assertNarrowScreen() {
    assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
}

/** Scrolls [list] to the node, brings the whole node into view and checks no part of it is cut off by the list. */
internal fun ComposeContentTestRule.assertReachable(list: String, matcher: SemanticsMatcher) {
    onNodeWithTag(list).performScrollToNode(matcher)
    val node = onNode(matcher).performScrollTo().assertIsDisplayed()
    val viewport = onNodeWithTag(list).fetchSemanticsNode().boundsInRoot
    val bounds = node.fetchSemanticsNode().boundsInRoot
    assertTrue(
        "${matcher.description} at $bounds is cut off by $viewport",
        bounds.width > 0f && bounds.height > 0f && bounds.left >= viewport.left && bounds.right <= viewport.right &&
            bounds.top >= viewport.top && bounds.bottom <= viewport.bottom,
    )
}

internal fun ComposeContentTestRule.assertReachable(list: String, tag: String) = assertReachable(list, hasTestTag(tag))

/**
 * Checks that no item of the lazy list [list] matches [matcher]. A lazy list composes only the items near the screen, so a
 * count of nodes says nothing about the rest of the list. This looks through the whole list, from its top to its end, and
 * leaves the list at its end.
 */
internal fun ComposeContentTestRule.assertNotInList(list: String, matcher: SemanticsMatcher) {
    val error = assertThrows("${matcher.description} is in $list", AssertionError::class.java) { onNodeWithTag(list).performScrollToNode(matcher) }
    assertTrue(error.message.orEmpty(), error.message.orEmpty().contains("No node found that matches"))
}

internal fun ComposeContentTestRule.assertNotInList(list: String, tag: String) = assertNotInList(list, hasTestTag(tag))

/** Checks the node is shown whole inside [container], for example an open dialog. */
internal fun ComposeContentTestRule.assertInside(container: SemanticsMatcher, matcher: SemanticsMatcher) {
    val outer = onNode(container).fetchSemanticsNode().boundsInRoot
    val bounds = onNode(matcher).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
    assertTrue(
        "${matcher.description} at $bounds is cut off by $outer",
        bounds.width > 0f && bounds.height > 0f && bounds.left >= outer.left && bounds.right <= outer.right &&
            bounds.top >= outer.top && bounds.bottom <= outer.bottom,
    )
}

/**
 * Reads how the text was laid out and checks it uses the requested font scale and is not cut off. The semantics layout is
 * rebuilt at the widest width the text was offered, so its width says nothing; its height does: a box shorter than the
 * full text at that width means lines are cut off. Sideways, the text must stay inside its window.
 */
internal fun ComposeContentTestRule.assertTextNotClipped(matcher: SemanticsMatcher, fontScale: Float = 2f) {
    val text = onNode(matcher, useUnmergedTree = true)
    val layouts = mutableListOf<TextLayoutResult>()
    text.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { read -> assertTrue(read(layouts)) }
    val layout = layouts.single()
    assertEquals(fontScale, layout.layoutInput.density.fontScale, 0.01f)
    assertFalse(
        "\"${layout.layoutInput.text}\" is cut off: ${layout.size} shown of ${layout.multiParagraph.width} x ${layout.multiParagraph.height} px; " +
            "lines beyond the line limit: ${layout.multiParagraph.didExceedMaxLines}",
        layout.didOverflowHeight,
    )
    val node = text.fetchSemanticsNode()
    val window = node.layoutInfo.coordinates.findRootCoordinates().size
    assertTrue("\"${layout.layoutInput.text}\" at ${node.boundsInRoot} runs out of its window ($window)", node.boundsInRoot.left >= 0f && node.boundsInRoot.right <= window.width)
}

/** Scrolls the container around the text to its end and checks the text's last line comes into view there. */
internal fun ComposeContentTestRule.assertTextEndReachable(matcher: SemanticsMatcher) {
    val body = onNode(hasScrollAction() and hasAnyDescendant(matcher))
    body.performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, 100_000f) }
    val viewport = body.fetchSemanticsNode().boundsInRoot
    val text = onNode(matcher).fetchSemanticsNode()
    val bottom = text.positionInRoot.y + text.size.height
    assertTrue("${matcher.description} ends at $bottom, outside $viewport", bottom > viewport.top && bottom <= viewport.bottom + 1f)
}

/** Saves a screenshot of the node as evidence in the app's test-evidence folder. */
internal fun SemanticsNodeInteraction.saveEvidence(name: String) {
    val image = captureToImage().asAndroidBitmap()
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val file = File(context.getExternalFilesDir("test-evidence"), name)
    file.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
    assertTrue(file.length() > 1000)
}
