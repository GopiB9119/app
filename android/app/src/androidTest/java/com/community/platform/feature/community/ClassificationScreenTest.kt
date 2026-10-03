package com.community.platform.feature.community

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import com.community.platform.feature.assertNarrowScreen
import com.community.platform.feature.assertNotInList
import com.community.platform.feature.assertReachable
import com.community.platform.feature.assertTextNotClipped
import com.community.platform.feature.saveEvidence
import com.community.platform.feature.spaces.DeviceFontScale
import com.community.platform.feature.spaces.EmulatorFontScaleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClassificationScreenTest {
    private val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val list = "community-content"
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val otherId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a02"
    private val stamp = "2026-10-03T10:00:00Z"
    private val page = PageDto(pageId, "river-walkers", "River Walkers", "Weekend walks", "hobbies", 0, stamp, stamp, false, false, false, null)

    private fun term(dimension: String, code: String, name: String) = TermDto(dimension, code, null, false, "active", TermNamesDto(name, null, null))

    // More than 12 interests, so the interest picker offers a search.
    private val interestNames = listOf("Hiking", "Gardening", "Cooking", "Reading", "Cycling", "Chess", "Music", "Painting", "Running", "Swimming", "Birdwatching", "Photography", "Yoga", "Pottery")
    private val taxonomy = Taxonomy(
        listOf(term("topic", "hobbies", "Hobbies"), term("topic", "events", "Events"), term("topic", "outdoors", "Outdoors")) +
            interestNames.map { term("interest", it.lowercase(), it) } +
            listOf(term("language", "en", "English"), term("language", "te", "Telugu"), term("place", "hyderabad", "Hyderabad"), term("place", "pune", "Pune"),
                term("community_type", "club", "Club"), term("audience", "families", "Families"), term("activity", "meetups", "Meetups"), term("content_kind", "photos", "Photos")),
    )
    private val saved = InterestsDto(listOf("hobbies"), emptyList(), listOf("te"), emptyList(), "\"i1\"")

    private fun interestsState() = CommunityState(accountId = accountId, destination = Destination.Interests, taxonomy = taxonomy, interests = saved, interestsDraft = saved.parts)

    private fun reveal(tag: String) {
        compose.onNodeWithTag(list).performScrollToNode(hasTestTag(tag))
        compose.onNodeWithTag(tag).performScrollTo().assertIsDisplayed()
    }

    /** Shown whole inside the list, and at least the minimum touch target tall. */
    private fun reachableTarget(vararg tags: String) {
        val minimum = 48 * InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        for (tag in tags) {
            compose.assertReachable(list, tag)
            val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
            assertTrue("$tag touch target ${bounds.height}", bounds.height >= minimum - 1)
        }
    }

    private fun notClipped(vararg matchers: SemanticsMatcher) = matchers.forEach { matcher ->
        compose.onNodeWithTag(list).performScrollToNode(matcher)
        compose.onNode(matcher, useUnmergedTree = true).performScrollTo()
        compose.assertTextNotClipped(matcher)
    }

    @Test fun interestsShowPrivacyNoteFourPickersAndSaveOnlyAfterAChange() {
        var state by mutableStateOf(interestsState())
        var saves = 0
        val actions = CommunityActions(
            setInterests = { part, codes -> state = state.copy(interestsDraft = state.interestsDraft + (part to codes)) },
            saveInterests = { saves += 1 },
        )
        compose.setContent { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
        compose.onNodeWithTag("interests-privacy").assertTextContains("Only you see these; used only to suggest pages and posts to you.")
        reveal("interests-topics-count")
        compose.onNodeWithTag("interests-topics-count").assertTextContains("Topics: 1 of 10")
        compose.onNodeWithTag("interests-topics-selected-hobbies").assertIsDisplayed()
        reveal("interests-interests-count")
        compose.onNodeWithTag("interests-interests-count").assertTextContains("Interests: 0 of 30")
        reveal("interests-languages-count")
        compose.onNodeWithTag("interests-languages-count").assertTextContains("Languages: 1 of 5")
        reveal("interests-places-count")
        compose.onNodeWithTag("interests-places-count").assertTextContains("Places: 0 of 5")
        reveal("interests-save")
        compose.onNodeWithTag("interests-save").assertIsNotEnabled()

        reveal("interests-places-choice-hyderabad")
        compose.onNodeWithTag("interests-places-choice-hyderabad").performClick()
        reveal("interests-places-count")
        compose.onNodeWithTag("interests-places-count").assertTextContains("Places: 1 of 5")
        reveal("interests-save")
        compose.onNodeWithTag("interests-save").assertIsEnabled().performClick()
        compose.runOnIdle {
            assertEquals(1, saves)
            assertEquals(listOf("hyderabad"), state.interestsDraft[InterestPart.PLACES])
        }
        // Removing a chosen term goes back to the saved choice, so there is nothing to save.
        reveal("interests-places-selected-hyderabad")
        compose.onNodeWithTag("interests-places-selected-hyderabad").performClick()
        reveal("interests-save")
        compose.onNodeWithTag("interests-save").assertIsNotEnabled()
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextInterestsKeepEveryPickerAndSaveReachable() {
        assertNarrowScreen()
        var state by mutableStateOf(interestsState())
        val actions = CommunityActions(setInterests = { part, codes -> state = state.copy(interestsDraft = state.interestsDraft + (part to codes)) })
        compose.setContent { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
        notClipped(hasText("Only you see these; used only to suggest pages and posts to you."), hasTestTag("interests-topics-count"), hasTestTag("interests-interests-count"),
            hasTestTag("interests-languages-count"), hasTestTag("interests-places-count"))
        reachableTarget("interests-topics-selected-hobbies", "interests-topics-choice-events", "interests-interests-search", "interests-languages-choice-en",
            "interests-places-choice-pune")
        compose.onNodeWithTag("interests-interests-search").performTextReplacement("photo")
        reachableTarget("interests-interests-choice-photography")
        compose.onNodeWithTag("interests-interests-choice-photography").performClick()
        reachableTarget("interests-interests-selected-photography", "interests-save")
        notClipped(hasText("Save interests"))
        compose.onNodeWithTag("interests-save").assertIsEnabled()
        compose.onRoot().saveEvidence("classification-interests-large-text.png")
    }

    private fun pageState() = CommunityState(accountId = accountId, destination = Destination.Page(page.handle), taxonomy = taxonomy,
        page = page.copy(canManage = true, etag = "\"p1\"", classification = ClassificationDto(interests = listOf("hiking"))))

    private fun pageActions(state: () -> CommunityState, set: (CommunityState) -> Unit, saves: MutableList<Map<ClassificationPart, List<String>>>) = CommunityActions(
        startClassify = { set(state().copy(classifying = it, classificationDraft = it.classification!!.parts)) },
        setClassification = { part, codes -> set(state().copy(classificationDraft = state().classificationDraft + (part to codes))) },
        saveClassification = { saves += state().classificationDraft },
        cancelClassify = { set(state().copy(classifying = null, classificationDraft = emptyMap())) },
    )

    @Test fun topicsAndTagsEditorCountsSearchesAndLeavesOutTheMainTopic() {
        var state by mutableStateOf(pageState())
        val saves = mutableListOf<Map<ClassificationPart, List<String>>>()
        compose.setContent { CommunityTheme { CommunityScreen(state, pageActions({ state }, { state = it }, saves), "UTC", {}) } }
        reveal("page-term-interests-hiking")
        reveal("page-classify")
        compose.onNodeWithTag("page-classify").assertTextContains("Topics and tags").performClick()
        reveal("classify-interests-count")
        compose.onNodeWithTag("classify-interests-count").assertTextContains("Interests: 1 of 10")
        reveal("classify-other_topics-count")
        compose.onNodeWithTag("classify-other_topics-count").assertTextContains("Other topics: 0 of 2")
        compose.assertNotInList(list, "classify-other_topics-choice-hobbies")
        reveal("classify-interests-search")
        compose.onNodeWithTag("classify-interests-search").performTextReplacement("gard")
        compose.assertNotInList(list, "classify-interests-choice-cooking")
        // assertNotInList leaves the list at its end, so bring the choice back before tapping it.
        reveal("classify-interests-choice-gardening")
        compose.onNodeWithTag("classify-interests-choice-gardening").performClick()
        reveal("classify-interests-count")
        compose.onNodeWithTag("classify-interests-count").assertTextContains("Interests: 2 of 10")
        reveal("classify-save")
        compose.onNodeWithTag("classify-save").performClick()
        compose.runOnIdle { assertEquals(listOf("hiking", "gardening"), saves.single()[ClassificationPart.INTERESTS]) }
        reveal("classify-cancel")
        compose.onNodeWithTag("classify-cancel").performClick()
        compose.assertNotInList(list, "classification-editor")
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextTopicsAndTagsEditorKeepsControlsReachable() {
        assertNarrowScreen()
        var state by mutableStateOf(pageState())
        val saves = mutableListOf<Map<ClassificationPart, List<String>>>()
        compose.setContent { CommunityTheme { CommunityScreen(state, pageActions({ state }, { state = it }, saves), "UTC", {}) } }
        reachableTarget("page-classify")
        compose.onNodeWithTag("page-classify").performClick()
        notClipped(hasText("Help people find this page. Each list has its own limit."), hasTestTag("classify-other_topics-count"), hasTestTag("classify-interests-count"),
            hasTestTag("classify-content_kinds-count"))
        reachableTarget("classify-other_topics-choice-events", "classify-interests-selected-hiking", "classify-interests-search", "classify-languages-choice-te",
            "classify-content_kinds-choice-photos", "classify-save", "classify-cancel")
        notClipped(hasText("Save page"), hasText("Close editor"))
        compose.onNodeWithTag("classify-interests-search").performTextReplacement("yog")
        reachableTarget("classify-interests-choice-yoga")
        reveal("classification-editor")
        compose.onRoot().saveEvidence("classification-editor-large-text.png")
    }

    private val suggested = SuggestedPageDto(page, listOf(ReasonDto("interest", "hiking"), ReasonDto("language", "te")))
    private val other = page.copy(id = otherId, handle = "city-chess", name = "City Chess")

    private fun discoverState(suggestions: List<SuggestedPageDto>) = CommunityState(accountId = accountId, destination = Destination.Discover, taxonomy = taxonomy,
        pages = listOf(other), suggestions = suggestions, suggestionsLoaded = true)

    @Test fun suggestionsSayWhatMatchedAndOfferInterests() {
        var state by mutableStateOf(discoverState(listOf(suggested)))
        val opened = mutableListOf<Destination>()
        compose.setContent { CommunityTheme { CommunityScreen(state, CommunityActions(open = { opened += it }), "UTC", {}) } }
        reveal("suggestions-heading")
        compose.onNodeWithTag("suggestions-heading").assertTextContains("Suggested for you")
        reveal("suggested-reasons-river-walkers")
        compose.onNodeWithTag("suggested-reasons-river-walkers").assertTextContains("Matches your choice of Hiking, Telugu")
        reveal("page-city-chess")
        reveal("suggestions-interests")
        compose.onNodeWithTag("suggestions-interests").assertTextContains("Change your interests").performClick()

        state = discoverState(emptyList())
        reveal("suggestions-empty")
        compose.onNodeWithTag("suggestions-empty").assertTextContains("Choose your interests to see pages suggested for you.")
        reveal("suggestions-interests")
        compose.onNodeWithTag("suggestions-interests").assertTextContains("Choose your interests").performClick()
        compose.runOnIdle { assertEquals(listOf<Destination>(Destination.Interests, Destination.Interests), opened) }
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextSuggestionsKeepReasonsAndEntryReachable() {
        assertNarrowScreen()
        var state by mutableStateOf(discoverState(listOf(suggested)))
        compose.setContent { CommunityTheme { CommunityScreen(state, CommunityActions(), "UTC", {}) } }
        notClipped(hasTestTag("suggestions-heading"), hasTestTag("suggested-reasons-river-walkers"))
        reachableTarget("suggestions-interests", "follow-river-walkers")
        notClipped(hasText("Change your interests"))
        reveal("suggestions-heading")
        compose.onRoot().saveEvidence("classification-suggestions-large-text.png")
        state = discoverState(emptyList())
        notClipped(hasTestTag("suggestions-empty"), hasText("Choose your interests"))
        reachableTarget("suggestions-interests")
    }

    private val postId = "4e1a4c1f-6d6c-4b5f-8b62-1d5a4a3c2b02"
    private val interestPost = PostDto(postId, pageId, page.handle, page.name, "Saturday walk", "Meet at 7", "published", 0, 0, stamp, stamp, null, false, false, false, null,
        topics = listOf("outdoors"), interests = listOf("hiking"))

    private fun interestPostsState(posts: List<InterestPostDto>, cursor: String? = null) = discoverState(emptyList()).copy(
        interestPosts = posts, interestPostsCursor = cursor, interestPostsStatus = ListStatus.LOADED)

    @Test fun interestPostsSayWhyShowTheirTermsAndOfferMoreOrInterests() {
        var state by mutableStateOf(interestPostsState(listOf(InterestPostDto(interestPost, listOf(ReasonDto("interest", "hiking")))), cursor = "c1"))
        val opened = mutableListOf<Destination>()
        var more = 0
        compose.setContent { CommunityTheme { CommunityScreen(state, CommunityActions(open = { opened += it }, moreInterestPosts = { more += 1 }), "UTC", {}) } }
        reveal("interest-posts-heading")
        compose.onNodeWithTag("interest-posts-heading").assertTextContains("From your interests")
        reveal("interest-post-reasons-$postId")
        compose.onNodeWithTag("interest-post-reasons-$postId").assertTextContains("Because you chose: Hiking")
        reveal("post-term-$postId-topic-outdoors")
        compose.onNodeWithTag("post-term-$postId-topic-outdoors").assertTextContains("Outdoors")
        reveal("post-term-$postId-interest-hiking")
        reveal("interest-posts-more")
        compose.onNodeWithTag("interest-posts-more").assertTextContains("Show more").performClick()
        compose.runOnIdle { assertEquals(1, more) }

        state = interestPostsState(emptyList())
        reveal("interest-posts-empty")
        compose.onNodeWithTag("interest-posts-empty").assertTextContains("No posts from your interests yet. Choose topics and interests to see posts here.")
        compose.assertNotInList(list, "interest-posts-more")
        reveal("interest-posts-choose")
        compose.onNodeWithTag("interest-posts-choose").performClick()
        compose.runOnIdle { assertEquals(listOf<Destination>(Destination.Interests), opened) }

        state = discoverState(emptyList()).copy(interestPostsStatus = ListStatus.FAILED)
        reveal("interest-posts-failed")
        reveal("interest-posts-retry")
        compose.onNodeWithTag("interest-posts-retry").performClick()
        compose.runOnIdle { assertEquals(2, more) }
    }

    @Test fun postWithoutTermsShowsNoChips() {
        val plain = interestPost.copy(topics = emptyList(), interests = emptyList())
        compose.setContent { CommunityTheme { CommunityScreen(interestPostsState(listOf(InterestPostDto(plain, listOf(ReasonDto("topic", "hobbies"))))), CommunityActions(), "UTC", {}) } }
        reveal("interest-post-$postId")
        compose.assertNotInList(list, "post-terms-$postId")
    }

    private fun composerState() = CommunityState(accountId = accountId, destination = Destination.Page(page.handle), taxonomy = taxonomy,
        page = page.copy(canManage = true, etag = "\"p1\""))

    @Test fun composerChoosesTopicsAndInterestsAndKeepsThemWhenRefused() {
        var state by mutableStateOf(composerState())
        val sent = mutableListOf<List<List<String>>>()
        val actions = CommunityActions(createPostTerms = { _, _, topics, interests ->
            sent += listOf(topics, interests)
            state = state.copy(error = TERMS_UNAVAILABLE, unavailableTerms = listOf("hiking")); true
        })
        compose.setContent { CommunityTheme { CommunityScreen(state, actions, "UTC", {}) } }
        reveal("post-body")
        compose.onNodeWithTag("post-body").performTextReplacement("Meet at 7")
        reveal("composer-terms-topics-count")
        compose.onNodeWithTag("composer-terms-topics-count").assertTextContains("Topics: 0 of 3")
        reveal("composer-terms-topics-choice-outdoors")
        compose.onNodeWithTag("composer-terms-topics-choice-outdoors").performClick()
        reveal("composer-terms-interests-count")
        compose.onNodeWithTag("composer-terms-interests-count").assertTextContains("Interests: 0 of 5")
        reveal("composer-terms-interests-search")
        compose.onNodeWithTag("composer-terms-interests-search").performTextReplacement("hik")
        reveal("composer-terms-interests-choice-hiking")
        compose.onNodeWithTag("composer-terms-interests-choice-hiking").performClick()
        reveal("post-save-draft")
        compose.onNodeWithTag("post-save-draft").performClick()
        compose.runOnIdle { assertEquals(listOf(listOf(listOf("outdoors"), listOf("hiking"))), sent) }
        // Refused: the draft stays, with the retired term marked.
        reveal("community-error")
        compose.onNodeWithTag("community-error").assertTextContains("Some choices can no longer be chosen", substring = true)
        reveal("composer-terms-interests-selected-hiking")
        compose.onNodeWithTag("composer-terms-interests-selected-hiking").assertTextContains("Hiking", substring = true)
        reveal("post-body")
        compose.onNodeWithTag("post-body").assertTextContains("Meet at 7")
    }

    @DeviceFontScale(2f)
    @Test fun narrowLargeTextComposerPickersAndInterestPostsStayReachable() {
        assertNarrowScreen()
        var state by mutableStateOf(composerState())
        compose.setContent { CommunityTheme { CommunityScreen(state, CommunityActions(), "UTC", {}) } }
        notClipped(hasText("Optional: up to 3 topics and 5 interests help people find this post."), hasTestTag("composer-terms-topics-count"), hasTestTag("composer-terms-interests-count"))
        reachableTarget("composer-terms-topics-choice-outdoors", "composer-terms-interests-search", "post-save-draft")
        compose.onRoot().saveEvidence("post-terms-composer-large-text.png")

        state = interestPostsState(listOf(InterestPostDto(interestPost, listOf(ReasonDto("interest", "hiking")))), cursor = "c1")
        notClipped(hasTestTag("interest-posts-heading"), hasTestTag("interest-post-reasons-$postId"))
        reachableTarget("interest-posts-more")
        notClipped(hasText("Show more"))
        compose.onRoot().saveEvidence("interest-posts-large-text.png")
    }
}
