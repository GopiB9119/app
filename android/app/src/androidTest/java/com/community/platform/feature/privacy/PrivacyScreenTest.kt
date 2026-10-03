package com.community.platform.feature.privacy

import android.content.res.Configuration
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.R
import com.community.platform.feature.InLanguage
import com.community.platform.feature.agents.AgentMemoryDto
import com.community.platform.feature.assertInside
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.community.InterestsDto
import com.community.platform.feature.identity.IdentityActions
import com.community.platform.feature.identity.IdentityScreen
import com.community.platform.feature.identity.IdentityState
import com.community.platform.feature.identity.Profile
import com.community.platform.feature.identity.SecurityEventDto
import com.community.platform.feature.identity.UserDto
import com.community.platform.feature.saveEvidence
import com.community.platform.feature.scheduling.ReminderPreferenceDto
import com.community.platform.feature.scheduling.ReminderPreferences
import com.community.platform.feature.scheduling.ReminderRecipientDto
import com.community.platform.feature.scheduling.ReminderRequestDto
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.util.Locale

/** The Privacy page (T164, DEC-034) on a device: reached from Profile, every take-back asks first, and it fits 320 dp at 200% text. */
@RunWith(AndroidJUnit4::class)
class PrivacyScreenTest {
    private val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val user = UserDto(accountId, "privacy-ui@example.test", "Alex", "UTC", true, 1)
    private val request = ReminderRequestDto(
        "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03", "c2302436-0dd7-4d99-a7c3-ead390fd08eb", "c2937183-70fb-4d7a-b0b6-b1bc9c499444",
        "Check the smoke alarm in the hallway and the one above the stairs before the weekend", "1",
        ReminderRecipientDto("0f97b948-9800-432f-9d15-407df739d08e", "Morgan Organizer-Longname"), ReminderRecipientDto(accountId, "Alex"),
        "2026-11-01T18:00", "UTC", "2026-11-01T18:00:00Z", "2026-11-02T18:00:00Z", "2026-11-01T06:00:00Z", "2026-10-01T05:00:00Z",
        "2026-10-01T06:00:00Z", "accepted", false, "81a09cbf-901e-470c-a905-27d565be91ae", "1", "in_app",
    )
    private val memory = AgentMemoryDto("3c5354a9-9967-4314-bdee-9c2f23b227a1", "note", null, "Note",
        "The spare key is under the blue pot by the back door, behind the watering can and the old boots", "conversation", null, "2026-10-01T07:00:00Z")
    private val tags = listOf("privacy-take-back-request-${request.id}", "privacy-take-back-in-app", "privacy-take-back-memory-${memory.id}", "privacy-take-back-interests")
    private fun loaded() = PrivacyState(
        accountId = accountId, requests = listOf(request), inApp = ReminderPreferences(ReminderPreferenceDto(true, "1"), "\"1\""),
        memories = listOf(memory), interests = InterestsDto(listOf("technology"), listOf("ai"), listOf("te"), emptyList(), "\"i1\""),
        activity = listOf(SecurityEventDto("5b1d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4", "session.created", "2026-10-01T05:00:00Z")),
    )

    @Test fun profileOpensPrivacy() {
        var opened = 0
        val actions = IdentityActions({}, {}, { _, _ -> }, { _, _, _, _ -> }, { _, _, _ -> }, {}, {}, {}, {}, {}, {})
        compose.setContent { CommunityTheme { IdentityScreen(IdentityState(loading = false, profile = Profile(user, "\"profile\"")), actions, onOpenPrivacy = { opened += 1 }) } }
        compose.onNodeWithTag("account-privacy").performScrollTo().assertHeightIsAtLeast(48.dp).performClick()
        compose.runOnIdle { assertEquals(1, opened) }
    }

    @Test fun everyPermissionAsksFirstAndKeepingChangesNothing() {
        var state by mutableStateOf(loaded())
        val confirmed = mutableListOf<TakeBack>()
        val actions = PrivacyActions(
            ask = { state = state.copy(confirm = it) },
            keep = { state = state.copy(confirm = null) },
            confirm = { confirmed += state.confirm!!; state = state.copy(confirm = null, done = true) },
        )
        compose.setContent { CommunityTheme { PrivacyScreen(state, actions, "UTC") {} } }
        compose.assertReachable("privacy-list", tags[2])
        compose.onNodeWithTag(tags[2]).assert(hasContentDescription("Take back: ${memory.content}")).performClick()
        compose.onNodeWithTag("privacy-dialog-name").assertTextEquals(memory.content)
        compose.onNodeWithTag("privacy-keep").performClick()
        compose.onNodeWithTag("privacy-dialog").assertDoesNotExist()
        compose.runOnIdle { assertTrue(confirmed.isEmpty()) }
        for (tag in tags) {
            compose.assertReachable("privacy-list", tag)
            compose.onNodeWithTag(tag).performClick()
            compose.onNodeWithTag("privacy-confirm").performClick()
        }
        compose.runOnIdle {
            assertEquals(listOf(TakeBack.Request::class, TakeBack.InApp::class, TakeBack.Memory::class, TakeBack.Interests::class), confirmed.map { it::class })
        }
        compose.assertReachable("privacy-list", "privacy-done")
    }

    @DeviceFontScale(2f)
    @Test fun permissionsAndTheConfirmationFitAt320DpAnd200PercentText() {
        assertNarrowScreen()
        var state by mutableStateOf(loaded())
        compose.setContent { CommunityTheme { PrivacyScreen(state, PrivacyActions(ask = { state = state.copy(confirm = it) }), "UTC") {} } }
        for (tag in tags) {
            compose.assertReachable("privacy-list", tag)
            compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
        }
        val purpose = hasText("may remind you about", substring = true)
        compose.assertReachable("privacy-list", purpose)
        compose.assertTextNotClipped(purpose)
        compose.assertReachable("privacy-list", hasText(memory.content))
        compose.assertTextNotClipped(hasText(memory.content))
        compose.onNodeWithTag("privacy-list").saveEvidence("privacy-large-text.png")
        compose.onNodeWithTag(tags[2]).performClick()
        compose.onNodeWithTag("privacy-confirm").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        compose.onNodeWithTag("privacy-keep").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        compose.assertInside(hasTestTag("privacy-dialog"), hasTestTag("privacy-confirm"))
        compose.assertTextNotClipped(hasTestTag("privacy-dialog-name"))
        compose.onNodeWithTag("privacy-dialog").saveEvidence("privacy-dialog-large-text.png")
    }

    // Telugu and Hindi texts are longer and taller than English, so each is checked at the same size.
    @DeviceFontScale(2f)
    @Test fun teluguAndHindiFitAt320DpAnd200PercentText() {
        assertNarrowScreen()
        val target = InstrumentationRegistry.getInstrumentation().targetContext
        fun text(language: String, id: Int) = target.createConfigurationContext(
            Configuration(target.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) },
        ).getString(id)
        var language by mutableStateOf("te")
        var state by mutableStateOf(loaded())
        compose.setContent { CommunityTheme { InLanguage(language) { PrivacyScreen(state, PrivacyActions(ask = { state = state.copy(confirm = it) }), "UTC") {} } } }
        for (current in listOf("te", "hi")) {
            compose.runOnIdle { language = current; state = loaded() }
            compose.onNodeWithText(text(current, R.string.privacy_title)).assertIsDisplayed()
            val takeBack = text(current, R.string.privacy_take_back)
            for (tag in tags) {
                compose.assertReachable("privacy-list", tag)
                compose.onNodeWithTag(tag).assertHeightIsAtLeast(48.dp)
                compose.assertTextNotClipped(hasText(takeBack) and hasAnyAncestor(hasTestTag(tag)))
            }
            val purpose = hasText(request.taskTitle, substring = true)
            compose.assertReachable("privacy-list", purpose)
            compose.assertTextNotClipped(purpose)
            compose.assertReachable("privacy-list", tags[2])
            compose.onNodeWithTag(tags[2]).performClick()
            for (tag in listOf("privacy-confirm", "privacy-keep")) {
                compose.onNodeWithTag(tag).assertIsDisplayed().assertHeightIsAtLeast(48.dp)
                compose.assertInside(hasTestTag("privacy-dialog"), hasTestTag(tag))
            }
            // The dialog has its own window, which this test cannot switch to Telugu or Hindi; only its place on screen is checked.
            compose.onNodeWithTag("privacy-dialog").saveEvidence("privacy-dialog-$current-large-text.png")
        }
    }
}
