package com.community.platform.feature.community

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

interface ModerationApi {
    @GET("v1/me/moderator")
    suspend fun moderator(@Header("Authorization") authorization: String): Response<EnvelopeDto<ModeratorStatusDto>>

    @GET("v1/moderation/queue")
    suspend fun queue(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<ModerationQueueDto>>>

    @POST("v1/moderation/decisions")
    suspend fun decide(@Header("Authorization") authorization: String, @Header("Idempotency-Key") key: String, @Body body: ModerationDecisionBodyDto): Response<EnvelopeDto<ModerationDecisionDto>>

    @GET("v1/moderation/appeals")
    suspend fun appeals(@Header("Authorization") authorization: String, @Query("status") status: String = "open"): Response<EnvelopeDto<List<ModerationAppealReviewDto>>>

    @POST("v1/moderation/appeals/{id}/resolve")
    suspend fun resolve(@Header("Authorization") authorization: String, @Path("id") appealId: String, @Body body: ModerationResolveBodyDto): Response<EnvelopeDto<ModerationAppealDto>>

    @GET("v1/me/moderation-notices")
    suspend fun notices(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<ModerationNoticeDto>>>

    @POST("v1/moderation/decisions/{id}/appeal")
    suspend fun appeal(@Header("Authorization") authorization: String, @Path("id") decisionId: String, @Header("Idempotency-Key") key: String, @Body body: ModerationAppealBodyDto): Response<EnvelopeDto<ModerationAppealDto>>

    @GET("v1/me/reports")
    suspend fun reports(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<MyReportDto>>>
}

@Singleton
class ModerationRepository @Inject constructor(private val api: ModerationApi, private val accounts: AccountRepository) {
    private val targets = setOf("page", "post", "comment")
    private val actions = setOf("no_action", "hide", "restore")
    private val appealStatuses = setOf("open", "upheld", "overturned")

    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected community response.")

    private fun <Value> validate(check: () -> Value): Value = try { check() }
    catch (_error: IllegalArgumentException) { invalid() }
    catch (_error: NullPointerException) { invalid() }
    catch (_error: DateTimeException) { invalid() }

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun target(type: String, id: String) { require(type in targets); identifier(id) }
    private fun note(value: String, required: Boolean = false) = require(value.codePointLength() <= 1000 && (!required || value.isNotBlank()))
    private fun <Value> unique(items: List<Value>, id: (Value) -> String) = require(items.map(id).distinct().size == items.size)

    private fun decision(value: ModerationDecisionDto): ModerationDecisionDto = validate {
        identifier(value.id); target(value.targetType, value.targetId); identifier(value.decidedBy)
        require(value.action in actions && value.reason in REPORT_REASONS)
        note(value.note); Instant.parse(value.decidedAt); value.appealOf?.let(::identifier)
        value
    }

    private fun appeal(value: ModerationAppealDto): ModerationAppealDto = validate {
        identifier(value.id); identifier(value.decisionId); note(value.note, required = true)
        require(value.status in appealStatuses && (value.status == "open") == (value.resolvedAt == null))
        Instant.parse(value.createdAt); value.resolvedAt?.let(Instant::parse)
        value
    }

    private fun preview(value: ModerationPreviewDto) {
        require(value.status.isNotBlank())
        require((value.name?.codePointLength() ?: 0) <= 80 && (value.title?.codePointLength() ?: 0) <= 120)
        require((value.description?.codePointLength() ?: 0) <= 500 && (value.body?.codePointLength() ?: 0) <= 5000)
    }

    suspend fun isModerator(accountId: String): Boolean = accounts.authorized(accountId) {
        accounts.result(api.moderator(it)).moderator
    }

    suspend fun queue(accountId: String, cursor: String?): CommunityPage<ModerationQueueDto> = accounts.authorized(accountId) {
        val response = api.queue(it, cursor)
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid()
        validate {
            require(items.size <= 50); unique(items, ModerationQueueDto::key)
            require(pagination.hasMore == (pagination.nextCursor != null))
            pagination.nextCursor?.let { next -> require(next.isNotBlank() && next.length <= 2048 && next != cursor && items.isNotEmpty()) }
            items.forEach { item ->
                target(item.targetType, item.targetId); preview(item.preview); Instant.parse(item.firstReportedAt)
                require(item.reportCount > 0 && item.reasons.isNotEmpty())
                unique(item.reasons, ModerationReasonDto::reason)
                item.reasons.forEach { reason -> require(reason.reason in REPORT_REASONS && reason.count > 0) }
                require(item.reasons.sumOf { reason -> reason.count.toLong() } == item.reportCount.toLong())
            }
        }
        CommunityPage(items, pagination.nextCursor)
    }

    suspend fun decide(intent: ModerationDecisionIntent): ModerationDecisionDto = accounts.authorized(intent.accountId) {
        val body = intent.body
        target(body.targetType, body.targetId); identifier(intent.key); note(body.note)
        require(body.action in setOf("hide", "no_action") && body.reason in REPORT_REASONS)
        decision(accounts.result(api.decide(it, intent.key, body))).also { result ->
            if (result.targetType != body.targetType || result.targetId != body.targetId || result.action != body.action ||
                result.reason != body.reason || result.note != body.note || result.decidedBy != intent.accountId || result.appealOf != null) invalid()
        }
    }

    suspend fun appeals(accountId: String): List<ModerationAppealReviewDto> = accounts.authorized(accountId) {
        accounts.result(api.appeals(it)).also { items -> validate {
            unique(items) { item -> item.appeal.id }
            items.forEach { item ->
                appeal(item.appeal); decision(item.decision); preview(item.preview)
                require(item.appeal.decisionId == item.decision.id && item.appeal.status == "open")
                item.resolutionNote?.let { value -> note(value) }
            }
        } }
    }

    suspend fun resolve(accountId: String, appealId: String, body: ModerationResolveBodyDto): ModerationAppealDto = accounts.authorized(accountId) {
        identifier(appealId); note(body.note); require(body.outcome in setOf("upheld", "overturned"))
        appeal(accounts.result(api.resolve(it, appealId, body))).also { result ->
            if (result.id != appealId || result.status != body.outcome) invalid()
        }
    }

    suspend fun notices(accountId: String): List<ModerationNoticeDto> = accounts.authorized(accountId) {
        accounts.result(api.notices(it)).also { items -> validate {
            unique(items, ModerationNoticeDto::id)
            items.forEach { item ->
                identifier(item.id); target(item.targetType, item.targetId); Instant.parse(item.decidedAt)
                require(item.action in actions && item.reason in REPORT_REASONS)
                require(item.appealStatus == null || item.appealStatus in appealStatuses)
                item.appealOf?.let(::identifier)
            }
        } }
    }

    suspend fun appeal(intent: ModerationAppealIntent): ModerationAppealDto = accounts.authorized(intent.accountId) {
        identifier(intent.decisionId); identifier(intent.key); note(intent.body.note, required = true)
        appeal(accounts.result(api.appeal(it, intent.decisionId, intent.key, intent.body))).also { result ->
            if (result.decisionId != intent.decisionId || result.note != intent.body.note) invalid()
        }
    }

    suspend fun reports(accountId: String): List<MyReportDto> = accounts.authorized(accountId) {
        accounts.result(api.reports(it)).also { items -> validate {
            unique(items, MyReportDto::id)
            items.forEach { item ->
                identifier(item.id); target(item.targetType, item.targetId); Instant.parse(item.createdAt)
                require(item.reason in REPORT_REASONS && item.status in setOf("open", "reviewed"))
                if (item.status == "open") require(item.outcome == null && item.action == null && item.reviewedAt == null)
                else {
                    require(item.outcome in setOf("action_taken", "no_action") && item.action in actions && item.reviewedAt != null)
                    Instant.parse(item.reviewedAt)
                }
            }
        } }
    }
}