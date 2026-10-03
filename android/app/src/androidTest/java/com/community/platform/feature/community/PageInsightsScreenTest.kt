package com.community.platform.feature.community

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.community.platform.CommunityTheme
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertNotInList
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.time.Duration
import java.time.Instant

/** The owner's page insights (T132, DEC-038): opened on request, one item per period, readable at 320 dp and 200% text. */
@RunWith(AndroidJUnit4::class)
class PageInsightsScreenTest {
    private val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val list = "community-content"
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val stamp = "2026-10-03T10:00:00Z"
    private val asOf = Instant.parse("2026-10-03T00:00:00Z")

    private fun page(owner: Boolean) = PageDto(pageId, "river-walkers", "River Walkers", "", "news", 3, stamp, stamp, false, false, owner,
        if (owner) "\"page-1\"" else null, status = "active")

    private val insights = PageInsightsDto(pageId, 12, asOf.toString(), (0 until INSIGHT_PERIODS).map { index ->
        val end = asOf.minus(Duration.ofDays(7L * index))
        InsightPeriodDto(end.minus(Duration.ofDays(7)).toString(), end.toString(), index + 1, 2, 3, 40)
    })

    private fun state(owner: Boolean) = CommunityState(accountId = accountId, destination = Destination.Page("river-walkers"), page = page(owner), drafts = emptyList())

    private fun reveal(tag: String) {
        compose.onNodeWithTag(list).performScrollToNode(hasTestTag(tag))
        compose.onNodeWithTag(tag).performScrollTo()
    }

    @Test fun ownerSeesEightPeriodsAfterOpeningInsights() {
        var shown by mutableStateOf(state(owner = true))
        var asked = 0
        val actions = CommunityActions(showInsights = { asked += 1; shown = shown.copy(insightsOpen = true, insights = insights) })
        compose.setContent { CommunityTheme { CommunityScreen(shown, actions, "UTC", {}) } }
        compose.assertNotInList(list, "insights-period-0")
        reveal("insights-show")
        compose.onNodeWithTag("insights-show").performClick()
        compose.runOnIdle { assertEquals(1, asked) }
        reveal("insights-followers")
        compose.onNodeWithTag("insights-followers").assertTextContains("Current followers: 12")
        for (index in 0 until INSIGHT_PERIODS) {
            reveal("insights-period-$index")
            // The row's texts are merged, so TalkBack reads the period as one item.
            compose.onNodeWithTag("insights-period-$index").assertTextContains("New followers: ${index + 1}").assertTextContains("Likes: 40")
        }
        compose.assertReachable(list, hasText("Totals only.", substring = true))
    }

    @Test fun visitorHasNoInsightsButton() {
        compose.setContent { CommunityTheme { CommunityScreen(state(owner = false), CommunityActions(), "UTC", {}) } }
        compose.assertNotInList(list, "insights-show")
        compose.assertNotInList(list, "page-insights")
    }

    @Test fun failureOffersRetry() {
        var retried = 0
        val failed = state(owner = true).copy(insightsOpen = true, insightsFailed = true)
        compose.setContent { CommunityTheme { CommunityScreen(failed, CommunityActions(loadInsights = { retried += 1 }), "UTC", {}) } }
        reveal("insights-error")
        reveal("insights-reload")
        compose.onNodeWithTag("insights-reload").assertTextContains("Retry").performClick()
        compose.runOnIdle { assertEquals(1, retried) }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextKeepsEveryPeriodReachable() {
        assertNarrowScreen()
        compose.setContent { CommunityTheme { CommunityScreen(state(owner = true).copy(insightsOpen = true, insights = insights), CommunityActions(), "UTC", {}) } }
        for (index in 0 until INSIGHT_PERIODS) compose.assertReachable(list, "insights-period-$index")
        val last = hasText("Comments: 3")
        reveal("insights-period-${INSIGHT_PERIODS - 1}")
        compose.assertTextNotClipped(last and hasAnyAncestor(hasTestTag("insights-period-${INSIGHT_PERIODS - 1}")))
        compose.assertReachable(list, "insights-hide")
    }
}
