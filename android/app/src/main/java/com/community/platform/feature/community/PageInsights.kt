package com.community.platform.feature.community

import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Path
import java.io.IOException
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** DEC-038: the owner's insights always cover exactly eight periods, most recent first. */
const val INSIGHT_PERIODS = 8

/** Totals for one period. Nothing says who; what was taken back no longer counts, and the owner's own activity never does. */
data class InsightPeriodDto(
    val start: String, val end: String, @SerializedName("new_followers") val newFollowers: Int,
    val posts: Int, val comments: Int, val likes: Int,
)

data class PageInsightsDto(
    @SerializedName("page_id") val pageId: String, @SerializedName("follower_count") val followerCount: Int,
    @SerializedName("as_of") val asOf: String, val periods: List<InsightPeriodDto>,
)

interface PageInsightsApi {
    @GET("v1/pages/{id}/insights") suspend fun insights(@Header("Authorization") authorization: String, @Path("id") pageId: String): Response<EnvelopeDto<PageInsightsDto>>
}

/** Stands in where no insights service is wired, such as a test of the older community screens: nothing is sent. */
object UnavailablePageInsightsApi : PageInsightsApi {
    override suspend fun insights(authorization: String, pageId: String): Response<EnvelopeDto<PageInsightsDto>> = throw IOException("Insights are not available.")
}

@Singleton
class PageInsightsRepository @Inject constructor(private val api: PageInsightsApi, private val community: CommunityRepository) {
    private val accounts get() = community.accounts

    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned unexpected insights.")

    /** Checks the eight periods join end to end back from [PageInsightsDto.asOf], and that no count is negative. */
    fun insights(value: PageInsightsDto, pageId: String): PageInsightsDto = try {
        require(UUID.fromString(value.pageId).toString().equals(value.pageId, ignoreCase = true) && value.pageId.equals(pageId, ignoreCase = true))
        require(value.followerCount >= 0 && value.periods.size == INSIGHT_PERIODS)
        val asOf = Instant.parse(value.asOf)
        value.periods.forEachIndexed { index, period ->
            val start = Instant.parse(period.start)
            val end = Instant.parse(period.end)
            require(start.isBefore(end))
            require(period.newFollowers >= 0 && period.posts >= 0 && period.comments >= 0 && period.likes >= 0)
            if (index == 0) require(end == asOf)
            else require(end == Instant.parse(value.periods[index - 1].start))
        }
        value
    } catch (_error: IllegalArgumentException) { invalid() } catch (_error: NullPointerException) { invalid() } catch (_error: DateTimeException) { invalid() }

    /** The owner's insights for their page; anyone else is refused by the server. */
    suspend fun insights(accountId: String, pageId: String): PageInsightsDto = accounts.authorized(accountId) {
        insights(accounts.result(api.insights(it, pageId)), pageId)
    }
}
