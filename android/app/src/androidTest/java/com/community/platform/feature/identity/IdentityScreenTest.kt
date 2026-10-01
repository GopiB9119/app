package com.community.platform.feature.identity

import android.graphics.Bitmap
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.text.AnnotatedString
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
class IdentityScreenTest {
    @get:Rule val compose = createComposeRule()

    private val user = UserDto(
        "d36b1454-9d3d-4b9c-a4d9-24d2173257a7", "native-ui@example.test",
        "Alex Example", "UTC", true, 1,
    )

    private fun actions(
        begin: (String) -> Unit = {},
        verify: (String, String, String, String) -> Unit = { _, _, _, _ -> },
        save: (String, String, String) -> Unit = { _, _, _ -> },
        revoke: (SessionDto) -> Unit = {},
        refresh: () -> Unit = {},
    ) = IdentityActions(
        mode = {}, begin = begin, login = { _, _ -> }, verify = verify, save = save,
        revoke = revoke, revokeOthers = {}, logout = {}, refresh = refresh,
    )

    @Test fun recoveryScreenEmitsExactProofAndClearsSecretsOnReturningToLogin() {
        var state by mutableStateOf(IdentityState(loading = false, mode = EntryMode.RECOVER))
        val requests = mutableListOf<String>()
        val proofs = mutableListOf<List<String>>()
        val callbacks = actions(
            begin = { email -> requests.add(email); state = state.copy(challengeEmail = email) },
            verify = { code, password, name, zone ->
                proofs.add(listOf(code, password, name, zone))
                state = state.copy(mode = EntryMode.LOGIN, challengeEmail = null, notice = "Synthetic reset confirmed.")
            },
        )
        compose.setContent { CommunityTheme { IdentityScreen(state, callbacks) } }
        compose.onNodeWithTag("email").performTextInput("native-ui@example.test")
        compose.onNodeWithTag("primary-action").performScrollTo().performClick()
        compose.onNodeWithText("Choose a new password").assertIsDisplayed()
        compose.onNodeWithTag("code").performTextInput("123456")
        compose.onNodeWithTag("password").performScrollTo().performTextInput("Synthetic-native-45!")
        compose.onNodeWithTag("primary-action").performScrollTo().performClick()
        compose.onNodeWithText("Welcome back").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("code").assertDoesNotExist()
        compose.onNodeWithTag("password").assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString("")))
        compose.runOnIdle {
            assertEquals(listOf("native-ui@example.test"), requests)
            // T50: the form starts in the device's timezone, no longer always Asia/Kolkata.
            assertEquals(listOf(listOf("123456", "Synthetic-native-45!", "", signUpTimezone(state.timezones))), proofs)
        }
        capture("native-login-offline.png")
    }

    @Test fun largeTextProfileKeepsDraftAndOriginalVersionAfterARefresh() {
        var state by mutableStateOf(IdentityState(loading = false, profile = Profile(user, "\"profile-1\"")))
        val changes = mutableListOf<Triple<String, String, String>>()
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                CommunityTheme {
                    IdentityScreen(state, actions(save = { name, zone, version -> changes.add(Triple(name, zone, version)) }))
                }
            }
        }
        compose.onNodeWithTag("profile-name").performScrollTo().performTextReplacement("Unsaved draft")
        compose.runOnIdle {
            state = state.copy(profile = Profile(user.copy(displayName = "Server update", version = 2), "\"profile-2\""))
        }
        compose.onNodeWithTag("profile-name").assertTextContains("Unsaved draft")
        compose.onNodeWithText("Save changes").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(listOf(Triple("Unsaved draft", "UTC", "\"profile-1\"")), changes) }
        compose.onNodeWithText("Your account").performScrollTo().assertIsDisplayed()
        capture("native-account-large-text.png")
    }

    @Test fun revocationRequiresConfirmationAndKeepsTheSelectedSessionIdentity() {
        val session = SessionDto("synthetic-other-session", "Work browser", "web", "2026-09-19T10:00:00Z", "2026-09-19T18:00:00Z", false)
        val state = IdentityState(loading = false, profile = Profile(user, "\"profile-1\""), sessions = listOf(session))
        val revoked = mutableListOf<String>()
        compose.setContent { CommunityTheme { IdentityScreen(state, actions(revoke = { revoked.add(it.id) })) } }
        compose.onNodeWithContentDescription("Revoke Work browser session").performScrollTo().performClick()
        compose.onNodeWithText("Revoke access for this session?").assertIsDisplayed()
        compose.onNodeWithText("Cancel").performClick()
        compose.runOnIdle { assertTrue(revoked.isEmpty()) }
        compose.onNodeWithContentDescription("Revoke Work browser session").performScrollTo().performClick()
        compose.onNodeWithText("Confirm").performClick()
        compose.runOnIdle { assertEquals(listOf(session.id), revoked) }
    }

    @Test fun busyAndFailureStatesDoNotClaimSavedOrDiscardEnteredEmail() {
        var state by mutableStateOf(IdentityState(loading = false, mode = EntryMode.RECOVER))
        compose.setContent { CommunityTheme { IdentityScreen(state, actions()) } }
        compose.onNodeWithTag("email").performTextInput("native-ui@example.test")
        compose.runOnIdle { state = state.copy(busy = true) }
        compose.onNodeWithTag("email").assertIsNotEnabled()
        compose.onNodeWithTag("primary-action").assertIsNotEnabled()
        compose.runOnIdle { state = state.copy(busy = false, error = "No connection. Your changes are not confirmed.") }
        compose.onNodeWithText("No connection. Your changes are not confirmed.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("email").assertTextContains("native-ui@example.test")
        compose.onNodeWithText("Profile saved.").assertDoesNotExist()
    }

    @Test fun uncheckedSavedSignInOffersOnlyARetryAtLargeText() {
        var refreshes = 0
        val state = IdentityState(loading = false, signInUnchecked = true, error = "Can't reach the service. Check your connection, then try again.")
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                CommunityTheme { IdentityScreen(state, actions(refresh = { refreshes += 1 })) }
            }
        }
        compose.onNodeWithText("Couldn't check your sign-in").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("You stay signed in on this device.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("email").assertDoesNotExist()
        compose.onNodeWithTag("password").assertDoesNotExist()
        compose.onNodeWithTag("primary-action").assertDoesNotExist()
        compose.onNodeWithTag("retry-sign-in").performScrollTo().assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
        compose.runOnIdle { assertEquals(1, refreshes) }
        capture("native-sign-in-unchecked-large-text.png")
    }

    @Test fun signUpKeepsTypedFieldsAcrossRecreationWithoutSavingSecrets() {
        val restoration = StateRestorationTester(compose)
        val state = IdentityState(loading = false, mode = EntryMode.REGISTER, challengeEmail = "native-ui@example.test")
        var secrets by mutableStateOf(SignInSecrets())
        val proofs = mutableListOf<List<String>>()
        restoration.setContent {
            CommunityTheme { IdentityScreen(state, actions(verify = { code, password, name, zone -> proofs.add(listOf(code, password, name, zone)) }), secrets = secrets) }
        }
        compose.onNodeWithTag("code").performTextInput("123456")
        compose.onNodeWithTag("name").performTextInput("Alex Native")
        compose.onNodeWithTag("password").performScrollTo().performTextInput("Synthetic-native-45!")
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithTag("name").assertTextContains("Alex Native")
        compose.onNodeWithTag("code").assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString("123456")))
        compose.onNodeWithTag("primary-action").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(listOf(listOf("123456", "Synthetic-native-45!", "Alex Native", signUpTimezone(state.timezones))), proofs) }

        // A new process starts with empty memory: the name comes back from saved state, the code and password do not.
        compose.runOnIdle { secrets = SignInSecrets() }
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithTag("name").assertTextContains("Alex Native")
        compose.onNodeWithTag("code").assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString("")))
        compose.onNodeWithTag("password").performScrollTo().assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString("")))
    }

    private fun capture(name: String) {
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("test-evidence"), name)
        file.outputStream().use { output -> assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) }
        assertTrue(file.length() > 1000)
    }
}