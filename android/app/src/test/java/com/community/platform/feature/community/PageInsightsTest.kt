package com.community.platform.feature.community

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.util.Collections

/** The owner's page insights (T132, DEC-038), against a synthetic server behind the real HTTP client. */
@OptIn(ExperimentalCoroutinesApi::class)
class PageInsightsTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val gson = Gson()
    private val stamp = "2026-10-03T10:00:00Z"
    private val pageId = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a01"
    private val asOf = Instant.parse("2026-10-03T00:00:00Z")

    private fun page(owner: Boolean) = PageDto(pageId, "river-walkers", "River Walkers", "", "news", 3, stamp, stamp, false, false, owner,
        if (owner) "\"page-1\"" else null, status = "active")

    private fun periods(count: Int = INSIGHT_PERIODS) = (0 until count).map { index ->
        val end = asOf.minus(Duration.ofDays(7L * index))
        InsightPeriodDto(end.minus(Duration.ofDays(7)).toString(), end.toString(), index, 2, 3, 4)
    }

    private fun insights(periods: List<InsightPeriodDto> = periods(), id: String = pageId, followers: Int = 12) = PageInsightsDto(id, followers, asOf.toString(), periods)

    inner class Server(owner: Boolean = true) {
        val requests: MutableList<Request> = Collections.synchronizedList(mutableListOf())
        /** The page as the server shows it; a handover makes it someone else's. */
        var page = page(owner)
        var answer: PageInsightsDto = insights()
        var refusal: Pair<Int, String>? = null

        private fun json(code: Int, body: String, request: Request) = okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(code).message("Synthetic")
            .body(body.toResponseBody("application/json".toMediaType())).build()
        private fun <Value> ok(value: Value, request: Request, pagination: PaginationDto? = null) = json(200, gson.toJson(EnvelopeDto(value, null, pagination)), request)
        private fun error(code: Int, name: String, request: Request) =
            json(code, gson.toJson(mapOf("error" to mapOf("code" to name, "message" to "Synthetic $name", "details" to emptyMap<String, String>()))), request)

        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val path = request.url.encodedPath
            val none = PaginationDto(null, false)
            when (path) {
                "/v1/taxonomy" -> ok(emptyList<TermDto>(), request)
                "/v1/pages/river-walkers", "/v1/pages/$pageId" -> ok(page, request)
                "/v1/pages/$pageId/posts" -> ok(emptyList<PostDto>(), request, none)
                "/v1/pages/$pageId/pinned-posts", "/v1/pages/$pageId/drafts" -> ok(emptyList<PostDto>(), request)
                "/v1/pages/$pageId/moderators" -> ok(emptyList<ModeratorDto>(), request)
                "/v1/me/moderator-roles" -> ok(emptyList<ModeratorRoleDto>(), request)
                "/v1/pages/$pageId/insights" -> refusal?.let { (code, name) -> error(code, name, request) } ?: ok(answer, request)
                else -> error(404, "NOT_FOUND", request)
            }
        }.build()

        val community = CommunityRepository(IdentityModule.community(http, gson), fixture.accounts)
        val classification = ClassificationRepository(IdentityModule.classification(http, gson), community)
        val feedControls = FeedControlsRepository(UnavailableFeedControlsApi, community)
        val repository = PageInsightsRepository(IdentityModule.pageInsights(http, gson), community)
        fun asked() = requests.count { it.url.encodedPath.endsWith("/insights") }
    }

    private var model: CommunityViewModel? = null
    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private suspend fun idle(current: CommunityViewModel) = withTimeout(5000) { current.state.first { !it.busy && !it.insightsLoading } }
    private suspend fun onPage(server: Server): CommunityViewModel {
        val current = CommunityViewModel(server.community, server.classification, server.feedControls, server.repository); model = current
        current.bind(fixture.accountId); idle(current)
        current.open(Destination.Page("river-walkers"), remember = false); idle(current)
        assertEquals(pageId, current.state.value.page?.id)
        return current
    }

    @Test fun insightsAreReadAndMalformedOnesRefused(): Unit = runBlocking {
        val server = Server()
        val read = server.repository.insights(fixture.accountId, pageId)
        assertEquals(12, read.followerCount)
        assertEquals(INSIGHT_PERIODS, read.periods.size)
        assertEquals("Bearer ${fixture.token}", server.requests.last().header("Authorization"))

        val good = periods()
        val bad = listOf(
            insights(periods(7)),
            insights(periods(9)),
            insights(id = "3d0f3b0e-5c5b-4a4e-9a51-0c4f3f2b1a09"),
            insights(followers = -1),
            insights(good.mapIndexed { index, period -> if (index == 3) period.copy(likes = -1) else period }),
            insights(good.mapIndexed { index, period -> if (index == 5) period.copy(comments = -2) else period }),
            // A gap between two periods.
            insights(good.mapIndexed { index, period -> if (index == 4) period.copy(end = Instant.parse(period.end).minusSeconds(60).toString()) else period }),
            // The latest period does not end at as_of.
            insights(good.mapIndexed { index, period -> if (index == 0) period.copy(end = asOf.plusSeconds(1).toString()) else period }),
            insights(good.reversed()),
            insights(good.mapIndexed { index, period -> if (index == 2) period.copy(start = "yesterday") else period }),
        )
        bad.forEach { answer ->
            server.answer = answer
            val error = assertThrows(IdentityFailure::class.java) { runBlocking { server.repository.insights(fixture.accountId, pageId) } }
            assertEquals("INVALID_RESPONSE", error.code)
        }
    }

    @Test fun insightsLoadOnlyWhenTheOwnerOpensThem(): Unit = runBlocking {
        val server = Server()
        val current = onPage(server)
        assertEquals(0, server.asked())
        assertFalse(current.state.value.insightsOpen)

        current.showInsights(); idle(current)
        assertEquals(1, server.asked())
        val state = current.state.value
        assertTrue(state.insightsOpen)
        assertEquals(INSIGHT_PERIODS, state.insights?.periods?.size)
        assertFalse(state.insightsFailed)

        server.answer = insights(followers = 20)
        current.loadInsights(); idle(current)
        assertEquals(2, server.asked())
        assertEquals(20, current.state.value.insights?.followerCount)

        current.hideInsights()
        assertNull(current.state.value.insights)
        assertFalse(current.state.value.insightsOpen)
    }

    @Test fun visitorsNeverAskForInsights(): Unit = runBlocking {
        val server = Server(owner = false)
        val current = onPage(server)
        current.showInsights(); idle(current)
        current.loadInsights(); idle(current)
        assertEquals(0, server.asked())
        assertFalse(current.state.value.insightsOpen)
        assertNull(current.state.value.insights)
    }

    @Test fun refusalShowsAnErrorAndRetryLoads(): Unit = runBlocking {
        val server = Server()
        server.refusal = 403 to "PAGE_MANAGER_REQUIRED"
        val current = onPage(server)
        current.showInsights(); idle(current)
        var state = current.state.value
        assertTrue(state.insightsOpen && state.insightsFailed)
        assertNull(state.insights)
        // The page itself is still shown; only the insights failed.
        assertEquals(pageId, state.page?.id)
        assertFalse(state.requiresSignIn)

        server.refusal = null
        current.loadInsights(); idle(current)
        state = current.state.value
        assertFalse(state.insightsFailed)
        assertNotNull(state.insights)
        assertEquals(2, server.asked())

        // A malformed answer is an error too, and replaces the totals shown before.
        server.answer = insights(periods(7))
        current.loadInsights(); idle(current)
        assertTrue(current.state.value.insightsFailed)
        assertNull(current.state.value.insights)
    }

    @Test fun leavingThePageOrTheAccountClearsInsights(): Unit = runBlocking {
        val server = Server()
        val current = onPage(server)
        current.showInsights(); idle(current)
        assertNotNull(current.state.value.insights)

        current.open(Destination.Feed(FeedTab.FOLLOWING)); idle(current)
        assertFalse(current.state.value.insightsOpen)
        assertNull(current.state.value.insights)

        current.open(Destination.Page("river-walkers")); idle(current)
        assertNull(current.state.value.insights)
        current.showInsights(); idle(current)
        assertNotNull(current.state.value.insights)

        current.bind(null)
        assertFalse(current.state.value.insightsOpen)
        assertNull(current.state.value.insights)
        assertEquals(2, server.asked())
    }

    @Test fun aHandoverClearsTheFormerOwnersInsights(): Unit = runBlocking {
        val server = Server()
        val current = onPage(server)
        current.showInsights(); idle(current)
        assertNotNull(current.state.value.insights)

        server.page = page(owner = false)
        current.reload(); idle(current)
        assertFalse(current.state.value.page!!.canManage)
        assertFalse(current.state.value.insightsOpen)
        assertNull(current.state.value.insights)
        assertEquals(1, server.asked())
    }
}
