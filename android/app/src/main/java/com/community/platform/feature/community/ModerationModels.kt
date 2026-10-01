package com.community.platform.feature.community

import com.google.gson.annotations.SerializedName

data class ModerationMarkDto(val hidden: Boolean, val reason: String)
data class ModeratorStatusDto(val moderator: Boolean)

data class ModerationPreviewDto(
    val status: String,
    val name: String? = null,
    val handle: String? = null,
    val description: String? = null,
    val title: String? = null,
    val body: String? = null,
)

data class ModerationReasonDto(val reason: String, val count: Int)

data class ModerationQueueDto(
    @SerializedName("target_type") val targetType: String,
    @SerializedName("target_id") val targetId: String,
    val preview: ModerationPreviewDto,
    @SerializedName("page_name") val pageName: String?,
    @SerializedName("report_count") val reportCount: Int,
    val reasons: List<ModerationReasonDto>,
    @SerializedName("first_reported_at") val firstReportedAt: String,
) {
    val key: String get() = "$targetType:$targetId"
    val defaultReason: String get() = reasons.maxByOrNull { it.count }?.reason ?: REPORT_REASONS.first()
}

data class ModerationDecisionBodyDto(
    @SerializedName("target_type") val targetType: String,
    @SerializedName("target_id") val targetId: String,
    val action: String,
    val reason: String,
    val note: String,
)

data class ModerationDecisionDto(
    val id: String,
    @SerializedName("target_type") val targetType: String,
    @SerializedName("target_id") val targetId: String,
    val action: String,
    val reason: String,
    val note: String,
    @SerializedName("decided_by") val decidedBy: String,
    @SerializedName("decided_at") val decidedAt: String,
    @SerializedName("appeal_of") val appealOf: String?,
)

data class ModerationAppealDto(
    val id: String,
    @SerializedName("decision_id") val decisionId: String,
    val note: String,
    val status: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("resolved_at") val resolvedAt: String?,
)

data class ModerationAppealReviewDto(
    val appeal: ModerationAppealDto,
    val decision: ModerationDecisionDto,
    val preview: ModerationPreviewDto,
    @SerializedName("page_name") val pageName: String?,
    @SerializedName("resolution_note") val resolutionNote: String?,
)

data class ModerationNoticeDto(
    val id: String,
    @SerializedName("target_type") val targetType: String,
    @SerializedName("target_id") val targetId: String,
    val action: String,
    val reason: String,
    @SerializedName("decided_at") val decidedAt: String,
    @SerializedName("appeal_status") val appealStatus: String?,
    @SerializedName("appeal_of") val appealOf: String?,
) {
    val canAppeal: Boolean get() = action == "hide" && appealStatus == null && appealOf == null
}

enum class ReportReviewState { WAITING, ACTION_TAKEN, NO_ACTION }

data class MyReportDto(
    val id: String,
    @SerializedName("target_type") val targetType: String,
    @SerializedName("target_id") val targetId: String,
    val reason: String,
    val status: String,
    val outcome: String?,
    val action: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("reviewed_at") val reviewedAt: String?,
) {
    val reviewState: ReportReviewState get() = when {
        status == "open" -> ReportReviewState.WAITING
        outcome == "action_taken" -> ReportReviewState.ACTION_TAKEN
        else -> ReportReviewState.NO_ACTION
    }
}

data class ModerationAppealBodyDto(val note: String)
data class ModerationResolveBodyDto(val outcome: String, val note: String)
data class ModerationDecisionIntent(val accountId: String, val key: String, val body: ModerationDecisionBodyDto)
data class ModerationAppealIntent(val accountId: String, val key: String, val decisionId: String, val body: ModerationAppealBodyDto)