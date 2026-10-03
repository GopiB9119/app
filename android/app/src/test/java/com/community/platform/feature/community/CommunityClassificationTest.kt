package com.community.platform.feature.community

import androidx.lifecycle.viewModelScope
import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList

/** Topics, tags, private interests and suggestions (T126/T127), against a synthetic server behind the real HTTP client. */
@OptIn(ExperimentalCoroutinesApi::class)
class CommunityClassificationTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val gson = Gson()
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val otherPageId = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c09"
    private val stamp = "2026-10-02T10:00:00Z"
    private val none = ClassificationDto(emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
    private val page = PageDto(pageId, "river-walkers", "River Walkers", "Weekend walks", "hobbies", 3, stamp, stamp, false, false, false, null, rules = "",
        status = "active", classification = none.copy(interests = listOf("ai")))
    private val owned = page.copy(canManage = true, etag = "\"p1\"")

    private fun term(dimension: String, code: String, en: String, te: String? = null, hi: String? = null, status: String = "active", parent: String? = null) =
        TermDto(dimension, code, parent, false, status, TermNamesDto(en, te, hi))

    private val terms = listOf(
        term("topic", "technology", "Technology", "సాంకేతికత", "प्रौद्योगिकी"),
        term("topic", "hobbies", "Hobbies", "అభిరుచులు", "शौक"),
        term("topic", "stargazing", "Stargazing"),
        term("interest", "ai", "Artificial intelligence", "కృత్రిమ మేధ", "कृत्रिम बुद्धिमत्ता", parent = "technology"),
        term("interest", "cooking", "Cooking"),
        term("interest", "fax", "Fax machines", status = "retired"),
        term("language", "te", "Telugu", "తెలుగు", "तेलुगु"),
        term("place", "hyderabad", "Hyderabad", "హైదరాబాద్", "हैदराबाद"),
        term("community_type", "club", "Club"),
    )

    /** A synthetic server: it keeps the page and the person's interests, refuses a stale version with 412 and a retired term with 422. */
    inner class Server {
        val requests: MutableList<Request> = CopyOnWriteArrayList()
        val bodies: MutableList<String> = CopyOnWriteArrayList()
        var taxonomy = terms
        var current = owned
        var interests = InterestsDto(listOf("technology"), emptyList(), emptyList(), emptyList(), "\"i1\"")
        var discovered = listOf(page)
        var suggestions = SuggestionsDto("interests-1", listOf(SuggestedPageDto(page.copy(id = otherPageId, handle = "ai-circle", name = "AI Circle"), listOf(ReasonDto("topic", "technology")))))
        var suggestionsStatus = 200
        var reply: ((PageDto) -> PageDto)? = null
        var nextCursor: String? = null
        var interestsGate: java.util.concurrent.CountDownLatch? = null

        private fun json(code: Int, body: String, request: Request) = okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(code).message("Synthetic")
            .body(body.toResponseBody("application/json".toMediaType())).build()
        private fun <Value> ok(value: Value, request: Request, pagination: PaginationDto? = null) = json(200, gson.toJson(EnvelopeDto(value, null, pagination)), request)
        private fun error(code: Int, name: String, request: Request, details: Map<String, String> = emptyMap()) =
            json(code, gson.toJson(mapOf("error" to mapOf("code" to name, "message" to "Synthetic $name", "details" to details))), request)

        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); val body = buffer.readUtf8(); bodies += body
            val path = request.url.encodedPath
            val list = PaginationDto(null, false)
            when {
                path == "/v1/taxonomy" -> ok(taxonomy, request)
                path == "/v1/feed" -> ok(emptyList<PostDto>(), request, list)
                path == "/v1/discover/pages" -> ok(discovered, request, PaginationDto(nextCursor, nextCursor != null))
                path == "/v1/me/suggested-pages" -> if (suggestionsStatus != 200) error(suggestionsStatus, "UNAVAILABLE", request) else ok(suggestions, request)
                path == "/v1/me/interests" && request.method == "GET" -> { interestsGate?.await(5, java.util.concurrent.TimeUnit.SECONDS); ok(interests, request) }
                path == "/v1/me/interests" && request.method == "PUT" -> {
                    val sent = gson.fromJson(body, SetInterestsDto::class.java)
                    when {
                        request.header("If-Match") != interests.etag -> error(412, "CONTENT_CHANGED", request)
                        "fax" in sent.interests -> error(422, "TERM_UNAVAILABLE", request, mapOf("field" to "interests", "codes" to "fax"))
                        else -> {
                            interests = InterestsDto(sent.topics, sent.interests, sent.languages, sent.places, "\"i${interests.etag.filter(Char::isDigit).toInt() + 1}\"")
                            ok(interests, request)
                        }
                    }
                }
                path == "/v1/pages/${page.handle}" || path == "/v1/pages/$pageId" && request.method == "GET" -> ok(current, request)
                path == "/v1/pages/$pageId" && request.method == "PATCH" -> {
                    val sent = gson.fromJson(body, ClassifyPageDto::class.java).classification
                    when {
                        request.header("If-Match") != current.etag -> error(412, "CONTENT_CHANGED", request)
                        "fax" in sent.interests.orEmpty() -> error(422, "TERM_UNAVAILABLE", request, mapOf("field" to "interests", "codes" to "fax"))
                        else -> {
                            current = current.copy(classification = sent, etag = "\"p${current.etag!!.filter(Char::isDigit).toInt() + 1}\"")
                            ok(reply?.invoke(current) ?: current, request)
                        }
                    }
                }
                path == "/v1/pages/$otherPageId/follow" && request.method == "POST" -> ok(suggestions.items.single().page.copy(following = true, followerCount = 4), request)
                path.endsWith("/posts") -> ok(emptyList<PostDto>(), request, list)
                path.endsWith("/pinned-posts") || path.endsWith("/drafts") || path.endsWith("/moderators") -> ok(emptyList<Any>(), request)
                path.endsWith("/handover") -> error(404, "NOT_FOUND", request)
                else -> error(404, "NOT_FOUND", request)
            }
        }.build()

        val community = CommunityRepository(IdentityModule.community(http, gson), fixture.accounts)
        val classification = ClassificationRepository(IdentityModule.classification(http, gson), community)
        fun paths(method: String) = requests.filter { it.method == method }.map { it.url.encodedPath }
    }

    private var model: CommunityViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup(): Unit = runBlocking {
        try {
            model?.let { current ->
                current.bind(null)
                withTimeout(5000) { requireNotNull(current.viewModelScope.coroutineContext[Job]).cancelAndJoin() }
            }
        } finally { Dispatchers.resetMain() }
    }

    private suspend fun idle(current: CommunityViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(server: Server): CommunityViewModel {
        val current = CommunityViewModel(server.community, server.classification); model = current
        current.bind(fixture.accountId); idle(current)
        return current
    }

    @Test fun termNamesFollowTheAppLanguageAndFallBackToEnglish() {
        val taxonomy = Server().classification.taxonomy(terms)
        assertEquals("సాంకేతికత", taxonomy.name("topic", "technology", "te"))
        assertEquals("प्रौद्योगिकी", taxonomy.name("topic", "technology", "hi"))
        assertEquals("Technology", taxonomy.name("topic", "technology", "en"))
        // No Telugu or Hindi draft: English.
        assertEquals("Cooking", taxonomy.name("interest", "cooking", "te"))
        assertEquals("Cooking", taxonomy.name("interest", "cooking", "hi"))
        // A code the vocabulary does not know shows as itself; the same code in another dimension is a different term.
        assertEquals("knitting", taxonomy.name("interest", "knitting", "en"))
        assertEquals("te", taxonomy.name("topic", "te", "en"))
        // A retired term keeps its name but cannot be chosen again.
        assertEquals("Fax machines", taxonomy.name("interest", "fax", "en"))
        assertEquals(listOf("ai", "cooking"), taxonomy.choices("interest").map(TermDto::code))
    }

    @Test fun requestRecordingKeepsAnIteratorStableWhileAnotherRequestArrives(): Unit = runBlocking {
        val server = Server()
        server.classification.taxonomy(fixture.accountId)
        val requests = server.requests.iterator()
        val bodies = server.bodies.iterator()
        server.classification.interests(fixture.accountId)
        assertEquals("/v1/taxonomy", requests.next().url.encodedPath)
        assertEquals("", bodies.next())
        assertFalse(requests.hasNext())
        assertFalse(bodies.hasNext())
        assertEquals(listOf("/v1/taxonomy", "/v1/me/interests"), server.paths("GET"))
        assertEquals(2, server.bodies.size)
    }

    @Test fun taxonomyLoadsOnceAndTeachesNewTopicCodes(): Unit = runBlocking {
        val server = Server()
        val stargazers = page.copy(topic = "stargazing")
        // Before the vocabulary lists it, an unknown topic is an unexpected answer, as before.
        if ("stargazing" !in KnownTopics) assertThrows(IdentityFailure::class.java) { server.community.page(stargazers) }
        val first = server.classification.taxonomy(fixture.accountId)
        val second = server.classification.taxonomy(fixture.accountId)
        assertTrue(first === second)
        assertEquals(listOf("/v1/taxonomy"), server.paths("GET"))
        assertEquals("Bearer ${fixture.token}", server.requests.single().header("Authorization"))
        assertEquals(stargazers, server.community.page(stargazers))
        assertTrue(first.isTopic("stargazing"))
        // A malformed or unknown topic stays an unexpected answer.
        for (bad in listOf("gossip-unlisted", "Gossip!")) assertThrows(IdentityFailure::class.java) { server.community.page(page.copy(topic = bad)) }
    }

    @Test fun malformedVocabularyIsRefused() {
        val repository = Server().classification
        for (bad in listOf(
            terms + term("mood", "happy", "Happy"),
            terms + term("interest", "Bad Code", "Bad"),
            terms + term("interest", "cooking", "Cooking again"),
            terms + term("interest", "blank", " "),
            terms + term("interest", "paused", "Paused", status = "paused"),
        )) assertThrows(IdentityFailure::class.java) { repository.taxonomy(bad) }
    }

    @Test fun pageClassificationIsReadAndCheckedAgainstEachLimit() {
        val server = Server()
        val full = none.copy(otherTopics = listOf("technology", "stargazing"), interests = listOf("ai"), languages = listOf("te"), places = listOf("hyderabad"), communityTypes = listOf("club"))
        assertEquals(page.copy(classification = full), server.community.page(page.copy(classification = full)))
        // An older server without classification is still read.
        assertNull(server.community.page(page.copy(classification = null)).classification)
        val decoded = gson.fromJson("""{"other_topics":["technology"],"interests":[],"languages":["te"],"places":[],"community_types":[],"audiences":[],"activities":[],"content_kinds":["guides"]}""", ClassificationDto::class.java)
        assertEquals(listOf("technology"), decoded.codes(ClassificationPart.OTHER_TOPICS))
        assertEquals(listOf("guides"), decoded.codes(ClassificationPart.CONTENT_KINDS))
        for (bad in listOf(
            none.copy(otherTopics = listOf("technology", "stargazing", "hobbies")),
            none.copy(interests = (1..11).map { "interest-$it" }),
            none.copy(languages = listOf("te", "te")),
            none.copy(places = listOf("Hyderabad")),
        )) assertThrows(IdentityFailure::class.java) { server.community.page(page.copy(classification = bad)) }
    }

    @Test fun discoverSendsEveryFilterAndAcceptsATopicFromOtherTopics(): Unit = runBlocking {
        val server = Server()
        val tagged = page.copy(id = otherPageId, handle = "tech-walkers", topic = "hobbies", classification = none.copy(otherTopics = listOf("technology")))
        server.discovered = listOf(tagged)
        val filters = PageFilters(interest = "ai", language = "te", place = "hyderabad", communityType = "club", audience = "families", activity = "meetups", contentKind = "guides")
        assertEquals(listOf(tagged), server.classification.discover(fixture.accountId, "  river   walk ", "technology", filters, null).items)
        val url = server.requests.single().url
        assertEquals("/v1/discover/pages", url.encodedPath)
        assertEquals("river walk", url.queryParameter("q"))
        assertEquals("technology", url.queryParameter("topic"))
        for ((name, value) in listOf("interest" to "ai", "language" to "te", "place" to "hyderabad", "community_type" to "club", "audience" to "families", "activity" to "meetups", "content_kind" to "guides")) {
            assertEquals(value, url.queryParameter(name))
        }
        assertEquals("20", url.queryParameter("limit"))
        // No filters: nothing extra is sent.
        server.classification.discover(fixture.accountId, "", null, PageFilters(), null)
        assertEquals(setOf("limit"), server.requests.last().url.queryParameterNames)
        // A page matching the topic neither as main nor as other topic is an unexpected answer.
        server.discovered = listOf(page)
        assertThrows(IdentityFailure::class.java) { runBlocking { server.classification.discover(fixture.accountId, "", "technology", PageFilters(), null) } }
    }

    @Test fun classificationIsSentInFullAgainstTheReviewedVersion(): Unit = runBlocking {
        val server = Server()
        val parts = ClassificationPart.entries.associateWith { emptyList<String>() } + (ClassificationPart.INTERESTS to listOf("cooking", "ai")) + (ClassificationPart.LANGUAGES to listOf("te"))
        val saved = server.classification.classify(fixture.accountId, owned, parts)
        assertEquals(listOf("cooking", "ai"), saved.classification!!.interests)
        assertEquals("\"p2\"", saved.etag)
        val request = server.requests.single()
        assertEquals("PATCH", request.method)
        assertEquals("/v1/pages/$pageId", request.url.encodedPath)
        assertEquals("\"p1\"", request.header("If-Match"))
        assertNull(request.header("Idempotency-Key"))
        assertEquals(JsonParser.parseString("""{"classification":{"other_topics":[],"interests":["cooking","ai"],"languages":["te"],"places":[],"community_types":[],"audiences":[],"activities":[],"content_kinds":[]}}"""),
            JsonParser.parseString(server.bodies.single()))
        // An answer that does not hold what was sent is not shown as saved.
        server.reply = { it.copy(classification = none) }
        assertEquals("INVALID_RESPONSE", assertThrows(IdentityFailure::class.java) { runBlocking { server.classification.classify(fixture.accountId, saved, parts) } }.code)
        // More terms than a part allows, or a page without a version tag, are never sent.
        val sent = server.requests.size
        assertThrows(IdentityFailure::class.java) { runBlocking { server.classification.classify(fixture.accountId, saved, parts + (ClassificationPart.OTHER_TOPICS to listOf("a", "b", "c"))) } }
        assertThrows(IdentityFailure::class.java) { runBlocking { server.classification.classify(fixture.accountId, page, parts) } }
        assertEquals(sent, server.requests.size)
    }

    @Test fun interestsAreReplacedTogetherWithIfMatch(): Unit = runBlocking {
        val server = Server()
        val loaded = server.classification.interests(fixture.accountId)
        assertEquals(listOf("technology"), loaded.topics)
        val choices = mapOf(InterestPart.TOPICS to listOf("technology", "hobbies"), InterestPart.INTERESTS to listOf("ai"), InterestPart.LANGUAGES to emptyList(), InterestPart.PLACES to listOf("hyderabad"))
        val saved = server.classification.setInterests(fixture.accountId, loaded, choices)
        assertEquals("\"i2\"", saved.etag)
        val put = server.requests.last()
        assertEquals("PUT", put.method)
        assertEquals("/v1/me/interests", put.url.encodedPath)
        assertEquals("\"i1\"", put.header("If-Match"))
        // All four lists are sent, an empty one as [].
        assertEquals(JsonParser.parseString("""{"topics":["technology","hobbies"],"interests":["ai"],"languages":[],"places":["hyderabad"]}"""), JsonParser.parseString(server.bodies.last()))
        // The version loaded first is now stale: the server refuses it instead of overwriting.
        val failure = assertThrows(IdentityFailure::class.java) { runBlocking { server.classification.setInterests(fixture.accountId, loaded, choices) } }
        assertEquals(412, failure.status)
        // Over the limit: never sent.
        val sent = server.requests.size
        assertThrows(IdentityFailure::class.java) { runBlocking { server.classification.setInterests(fixture.accountId, saved, choices + (InterestPart.LANGUAGES to (1..6).map { "l$it" })) } }
        assertEquals(sent, server.requests.size)
    }

    @Test fun suggestionsAskForTwentyAndCheckEachPage(): Unit = runBlocking {
        val server = Server()
        val result = server.classification.suggestions(fixture.accountId)
        assertEquals("20", server.requests.single().url.queryParameter("limit"))
        assertEquals("/v1/me/suggested-pages", server.requests.single().url.encodedPath)
        assertEquals(listOf(ReasonDto("topic", "technology")), result.items.single().reasons)
        for (bad in listOf(
            SuggestionsDto("interests-1", listOf(SuggestedPageDto(page.copy(blocked = true), emptyList()))),
            SuggestionsDto("interests-1", listOf(SuggestedPageDto(page, listOf(ReasonDto("audience", "families"))))),
            SuggestionsDto("interests-1", listOf(SuggestedPageDto(page, emptyList()), SuggestedPageDto(page, emptyList()))),
        )) assertThrows(IdentityFailure::class.java) { server.classification.suggestions(bad) }
    }

    @Test fun vocabularyExpiresAndAnUnknownTopicRefreshesItWithoutLosingTheList(): Unit = runBlocking {
        val server = Server()
        var now = 1_000L
        server.classification.clock = { now }
        server.classification.taxonomy(fixture.accountId)
        val fresh = "newtopic-${System.nanoTime()}"
        server.taxonomy = terms + term("topic", fresh, "Fresh")
        val added = page.copy(id = otherPageId, handle = "fresh-page", topic = fresh)
        server.discovered = listOf(page, added)
        // A topic added after the vocabulary loaded fetches it again instead of refusing the list.
        assertEquals(listOf(page, added), server.classification.discover(fixture.accountId, "", null, PageFilters(), null).items)
        assertEquals(2, server.paths("GET").count { it == "/v1/taxonomy" })
        // A topic still unknown afterwards leaves out only that page.
        server.discovered = listOf(page, added.copy(topic = "never-listed-${System.nanoTime()}"))
        assertEquals(listOf(page), server.classification.discover(fixture.accountId, "", null, PageFilters(), null).items)
        val before = server.paths("GET").count { it == "/v1/taxonomy" }
        server.classification.taxonomy(fixture.accountId)
        assertEquals(before, server.paths("GET").count { it == "/v1/taxonomy" })
        now += TAXONOMY_TTL_MS
        server.classification.taxonomy(fixture.accountId)
        assertEquals(before + 1, server.paths("GET").count { it == "/v1/taxonomy" })
    }

    @Test fun changingAFilterRestartsPagination(): Unit = runBlocking {
        val server = Server()
        server.nextCursor = "cursor-1"
        val current = ready(server)
        current.open(Destination.Discover); idle(current)
        assertEquals("cursor-1", current.state.value.nextCursor)
        current.filter("interest", "ai")
        assertNull(current.state.value.nextCursor)
        val sent = server.paths("GET").count { it == "/v1/discover/pages" }
        current.reload(more = true); idle(current)
        assertEquals(sent, server.paths("GET").count { it == "/v1/discover/pages" })
        current.search("", null); idle(current)
        val url = server.requests.last { it.url.encodedPath == "/v1/discover/pages" }.url
        assertEquals("ai", url.queryParameter("interest"))
        assertNull(url.queryParameter("cursor"))
    }

    @Test fun followingASuggestedPageRemovesItFromSuggestions(): Unit = runBlocking {
        val server = Server()
        val current = ready(server)
        current.open(Destination.Discover); idle(current)
        current.follow(current.state.value.suggestions.single().page); idle(current)
        assertNull(current.state.value.error)
        assertTrue(current.state.value.suggestions.isEmpty())
    }

    @Test fun interestsCannotBeEditedWhileAReloadIsUnanswered(): Unit = runBlocking {
        val server = Server()
        val current = ready(server)
        current.open(Destination.Interests, remember = false); idle(current)
        val gate = java.util.concurrent.CountDownLatch(1)
        server.interestsGate = gate
        current.reload()
        withTimeout(5000) { current.state.first { it.loading } }
        current.setInterests(InterestPart.INTERESTS, listOf("cooking"))
        assertEquals(emptyList<String>(), current.state.value.interestsDraft[InterestPart.INTERESTS])
        gate.countDown(); idle(current)
        current.setInterests(InterestPart.INTERESTS, listOf("cooking"))
        assertEquals(listOf("cooking"), current.state.value.interestsDraft[InterestPart.INTERESTS])
    }

    @Test fun termSearchStaysWhileItHasText() {
        assertTrue(termSearchShown(13, ""))
        assertFalse(termSearchShown(12, ""))
        assertTrue(termSearchShown(3, "co"))
    }

    @Test fun discoverShowsSuggestionsWithWhatMatchedAndKeepsFilters(): Unit = runBlocking {
        val server = Server()
        val current = ready(server)
        current.open(Destination.Discover); idle(current)
        val state = current.state.value
        assertEquals(listOf(page), state.pages)
        assertTrue(state.suggestionsLoaded)
        assertEquals("ai-circle", state.suggestions.single().page.handle)
        assertEquals(listOf(ReasonDto("topic", "technology")), state.suggestions.single().reasons)
        assertEquals("Technology", state.taxonomy!!.name("topic", "technology", "en"))
        current.filter("interest", "ai"); current.filter("language", "te")
        server.discovered = listOf(page.copy(classification = none.copy(otherTopics = listOf("technology"))))
        current.search("walk", "technology"); idle(current)
        assertNull(current.state.value.error)
        val url = server.requests.last { it.url.encodedPath == "/v1/discover/pages" }.url
        assertEquals("ai", url.queryParameter("interest"))
        assertEquals("te", url.queryParameter("language"))
        assertEquals("technology", url.queryParameter("topic"))
        // A filter that is not a code, or not a filter, changes nothing.
        current.filter("interest", "Not A Code"); current.filter("mood", "happy")
        assertEquals(PageFilters(interest = "ai", language = "te"), current.state.value.filters)
        // The vocabulary loaded once for every screen.
        assertEquals(1, server.paths("GET").count { it == "/v1/taxonomy" })
    }

    @Test fun noInterestsOffersTheChoiceAndAFailedSuggestionKeepsTheResults(): Unit = runBlocking {
        val server = Server()
        server.suggestions = SuggestionsDto("interests-1", emptyList())
        val current = ready(server)
        current.open(Destination.Discover); idle(current)
        assertTrue(current.state.value.suggestionsLoaded)
        assertTrue(current.state.value.suggestions.isEmpty())
        server.suggestionsStatus = 503
        current.reload(); idle(current)
        val state = current.state.value
        assertTrue(state.suggestionsFailed)
        assertFalse(state.suggestionsLoaded)
        assertNull(state.error)
        assertEquals(listOf(page), state.pages)
    }

    @Test fun interestsSaveAndA412KeepsTheChoicesUntilReload(): Unit = runBlocking {
        val server = Server()
        val current = ready(server)
        current.open(Destination.Interests, remember = false); idle(current)
        assertEquals(listOf("technology"), current.state.value.interestsDraft[InterestPart.TOPICS])
        assertFalse(current.state.value.interestsChanged)
        current.setInterests(InterestPart.INTERESTS, listOf("ai", "cooking"))
        // More than the limit is refused in the draft.
        current.setInterests(InterestPart.LANGUAGES, (1..6).map { "l$it" })
        assertEquals(emptyList<String>(), current.state.value.interestsDraft[InterestPart.LANGUAGES])
        assertTrue(current.state.value.interestsChanged)
        current.saveInterests(); idle(current)
        assertEquals(INTERESTS_SAVED, current.state.value.notice)
        assertEquals(listOf("ai", "cooking"), server.interests.interests)
        assertEquals("\"i2\"", current.state.value.interests!!.etag)
        assertEquals("\"i1\"", server.requests.last().header("If-Match"))

        // Another device saves meanwhile: this save is refused, the choices stay, and saving waits for a reload.
        server.interests = server.interests.copy(places = listOf("hyderabad"), etag = "\"i7\"")
        current.setInterests(InterestPart.TOPICS, listOf("hobbies"))
        current.saveInterests(); idle(current)
        var state = current.state.value
        assertEquals(INTERESTS_CONFLICT, state.error)
        assertTrue(state.interestsConflict)
        assertEquals(listOf("hobbies"), state.interestsDraft[InterestPart.TOPICS])
        val puts = server.paths("PUT").size
        current.saveInterests(); idle(current)
        assertEquals(puts, server.paths("PUT").size)
        current.reload(); idle(current)
        state = current.state.value
        assertFalse(state.interestsConflict)
        assertEquals(listOf("hyderabad"), state.interestsDraft[InterestPart.PLACES])
        assertEquals(listOf("technology"), state.interestsDraft[InterestPart.TOPICS])
    }

    @Test fun aRetiredInterestIsMarkedForRemoval(): Unit = runBlocking {
        val server = Server()
        val current = ready(server)
        current.open(Destination.Interests, remember = false); idle(current)
        current.setInterests(InterestPart.INTERESTS, listOf("fax"))
        current.saveInterests(); idle(current)
        assertEquals(TERMS_UNAVAILABLE, current.state.value.error)
        assertEquals(listOf("fax"), current.state.value.unavailableTerms)
        assertEquals(listOf("fax"), current.state.value.interestsDraft[InterestPart.INTERESTS])
    }

    @Test fun ownerEditsTopicsAndTagsAgainstTheOpenedVersion(): Unit = runBlocking {
        val server = Server()
        val current = ready(server)
        current.open(Destination.Page(page.handle)); idle(current)
        current.startClassify(current.state.value.page!!)
        assertEquals(owned, current.state.value.classifying)
        // The main topic cannot be repeated among the other topics.
        current.setClassification(ClassificationPart.OTHER_TOPICS, listOf("hobbies"))
        assertEquals(emptyList<String>(), current.state.value.classificationDraft[ClassificationPart.OTHER_TOPICS])
        current.setClassification(ClassificationPart.OTHER_TOPICS, listOf("technology"))
        current.setClassification(ClassificationPart.LANGUAGES, listOf("te"))
        current.saveClassification(); idle(current)
        var state = current.state.value
        assertEquals(CLASSIFICATION_SAVED, state.notice)
        assertNull(state.classifying)
        assertEquals(listOf("technology"), state.page!!.classification!!.otherTopics)
        assertEquals("\"p1\"", server.requests.last { it.method == "PATCH" }.header("If-Match"))

        // Changed elsewhere after the editor opened: refused, and the owner's choices stay in the open editor.
        current.startClassify(state.page!!)
        server.current = server.current.copy(etag = "\"p9\"")
        current.setClassification(ClassificationPart.PLACES, listOf("hyderabad"))
        current.saveClassification(); idle(current)
        state = current.state.value
        assertEquals(CLASSIFICATION_CONFLICT, state.error)
        assertTrue(state.classifyFailed)
        assertEquals(listOf("hyderabad"), state.classificationDraft[ClassificationPart.PLACES])
        assertEquals("\"p2\"", server.requests.last { it.method == "PATCH" }.header("If-Match"))
        // Closing the editor loads the current version.
        current.cancelClassify(); idle(current)
        assertNull(current.state.value.classifying)
        assertEquals("\"p9\"", current.state.value.page!!.etag)
    }
}
