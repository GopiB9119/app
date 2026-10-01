package com.community.platform.feature.identity

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class AccountDataScreenTest {
    private val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val user = UserDto("62f3da14-12e9-4575-9541-caf8b98e2dfd", "data-ui@example.test", "Alex", "Asia/Kolkata", true, 1)
    private val download = AccountExportDto("67ff2331-252d-494e-aaec-3127d57b37f8", "ready", null, listOf("profile", "tasks"),
        "2026-10-02T10:00:00Z", "2026-10-02T10:01:00Z", "2026-10-03T10:01:00Z", 200, true)
    private fun state() = AccountDataState(accountId = user.id, timezone = user.timezone, loaded = true)
    private fun actions(
        choose: (String, Boolean) -> Unit = { _, _ -> },
        prepare: () -> Unit = {},
        cancel: (String) -> Unit = {},
        save: (String) -> Unit = {},
        open: () -> Unit = {},
        close: () -> Unit = {},
        delete: (String) -> Unit = {},
        signIn: () -> Unit = {},
    ) = AccountDataActions({}, choose, prepare, {}, cancel, save, open, close, delete, signIn)

    private fun identityActions(changed: () -> Unit = {}, cancel: () -> Unit = {}) = IdentityActions(
        {}, {}, { _, _ -> }, { _, _, _, _ -> }, { _, _, _ -> }, {}, {}, {}, {}, changed, cancel,
    )

    @Test fun accountEntryOpensDataAndNoSelectionDisablesPreparation() {
        var opened by mutableStateOf(false)
        var state by mutableStateOf(state())
        var requests = 0
        compose.setContent {
            CommunityTheme {
                if (!opened) IdentityScreen(IdentityState(loading = false, profile = Profile(user, "\"profile\"")), identityActions(), onOpenData = { opened = true })
                else AccountDataScreen(state, actions(choose = { category, checked ->
                    state = state.copy(categories = if (checked) state.categories + category else state.categories - category)
                }, prepare = { requests += 1 }))
            }
        }
        compose.onNodeWithTag("account-data").performScrollTo().assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithText("Your data").assertIsDisplayed()
        for (category in listOf("profile", "security", "spaces", "tasks", "reminders")) {
            compose.onNodeWithTag("data-category-$category").performScrollTo().assertIsOn().assertHeightIsAtLeast(48.dp).performClick()
        }
        compose.onNodeWithTag("data-prepare").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithTag("data-category-profile").performScrollTo().performClick()
        compose.onNodeWithTag("data-prepare").performScrollTo().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(1, requests) }
    }

    @Test fun downloadAndCancelRespectStatusAndRequestingDevice() {
        val items = listOf(download, download.copy(id = "other", requestedHere = false), download.copy(id = "queued", status = "queued"),
            download.copy(id = "building", status = "building"), download.copy(id = "expired", status = "expired"),
            download.copy(id = "cancelled", status = "cancelled"), download.copy(id = "failed", status = "failed"), download.copy(id = "outdated", status = "outdated"))
        val saved = mutableListOf<String>()
        val cancelled = mutableListOf<String>()
        compose.setContent { CommunityTheme { AccountDataScreen(state().copy(downloads = items), actions(save = saved::add, cancel = cancelled::add)) } }
        compose.onNodeWithTag("data-download-${download.id}").performScrollTo().assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithTag("data-download-other").assertDoesNotExist()
        compose.onNodeWithText("Download it on the device that asked for it.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("data-cancel-other").performScrollTo().performClick()
        for (status in listOf("queued", "building")) compose.onNodeWithTag("data-cancel-$status").performScrollTo().assertIsDisplayed()
        for (status in listOf("expired", "cancelled", "failed", "outdated")) {
            compose.onNodeWithTag("data-download-$status").assertDoesNotExist()
            compose.onNodeWithTag("data-cancel-$status").assertDoesNotExist()
        }
        compose.onNodeWithText("Out of date because your access changed").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Could not be prepared").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Cancelled").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Expired").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf(download.id), saved); assertEquals(listOf("other"), cancelled) }
    }

    @Test fun deletionShowsWrongPasswordAndForgetsItOnClose() {
        var state by mutableStateOf(state())
        val requests = mutableListOf<String>()
        val callbacks = actions(open = { state = state.copy(deletionOpen = true, deletionProblem = null) },
            close = { state = state.copy(deletionOpen = false) }, delete = { password ->
                requests.add(password)
                state = state.copy(deletionProblem = AccountDataProblem("PASSWORD_INCORRECT"))
            })
        compose.setContent { CommunityTheme { AccountDataScreen(state, callbacks) } }
        compose.onNodeWithTag("data-delete-account").performScrollTo().performClick()
        compose.onNodeWithTag("data-deletion-password").performTextInput("wrong-password")
        compose.onNodeWithTag("data-confirm-deletion").performClick()
        compose.onNodeWithText("The password is incorrect.").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf("wrong-password"), requests) }
        compose.onNodeWithTag("data-deletion-password").performScrollTo().performTextInput("another-password")
        compose.onNodeWithTag("data-keep-account").performClick()
        compose.onNodeWithTag("data-delete-account").performScrollTo().performClick()
        compose.onNodeWithTag("data-deletion-password").assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString("")))
        compose.onNodeWithTag("data-confirm-deletion").assertIsNotEnabled()
    }

    @Test fun pendingDeletionOfferClearsWhenEitherCredentialChanges() {
        val purgeAfter = "2026-10-09T20:00:00Z"
        var state by mutableStateOf(IdentityState(loading = false, pendingDeletionAt = purgeAfter))
        var cancellations = 0
        compose.setContent { CommunityTheme { IdentityScreen(state,
            identityActions(changed = { state = state.copy(pendingDeletionAt = null) }, cancel = { cancellations += 1 })) } }
        compose.onNodeWithTag("cancel-deletion-sign-in").performScrollTo().assertHeightIsAtLeast(48.dp).performClick()
        compose.runOnIdle { assertEquals(1, cancellations) }
        compose.onNodeWithTag("email").performScrollTo().performTextInput(user.email)
        compose.onNodeWithTag("cancel-deletion-sign-in").assertDoesNotExist()
        compose.runOnIdle { state = state.copy(pendingDeletionAt = purgeAfter) }
        compose.onNodeWithTag("password").performScrollTo().performTextInput("Synthetic-password")
        compose.onNodeWithTag("cancel-deletion-sign-in").assertDoesNotExist()
    }

    @Test fun reauthenticationExplainsTheActionAndOffersSignInAgain() {
        var signsOut = 0
        compose.setContent { CommunityTheme { AccountDataScreen(state().copy(problem = AccountDataProblem("REAUTHENTICATION_REQUIRED")), actions(signIn = { signsOut += 1 })) } }
        compose.onNodeWithText("For your safety, sign in again before downloading your data.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("data-sign-in-again").performScrollTo().assertHeightIsAtLeast(48.dp).performClick()
        compose.runOnIdle { assertEquals(1, signsOut) }
    }

    @DeviceFontScale(2f)
    @Test fun deletionDialogKeepsSpaceNamesAndBothActionsReachableAt320DpAnd200PercentText() {
        assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
        val family = "Family ${"A".repeat(65)}"
        val group = "Study group ${"B".repeat(65)}"
        val problem = AccountDataProblem("OWNED_SPACES_WITH_MEMBERS", mapOf("spaces" to "$family\n$group"))
        compose.setContent { CommunityTheme { AccountDataScreen(state().copy(deletionOpen = true, deletionProblem = problem), actions()) } }
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText("Delete your account?").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { read -> assertTrue(read(layouts)) }
        assertEquals(2f, layouts.single().layoutInput.density.fontScale, 0.01f)
        assertFalse(layouts.single().hasVisualOverflow)
        compose.onNodeWithText(family).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(group).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("data-keep-account").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        compose.onNodeWithTag("data-confirm-deletion").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        val bitmap = compose.onNodeWithTag("data-deletion-dialog").captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val output = File(context.getExternalFilesDir("test-evidence"), "account-deletion-large-text.png")
        output.outputStream().use { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(output.length() > 1000)
    }
}