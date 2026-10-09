package com.community.platform.feature.agents

import com.google.gson.annotations.SerializedName

const val AGENT_MESSAGE_LIMIT = 500
const val AGENT_PAGE_SIZE = 10

data class AgentFieldDto(val label: String, val value: String)

data class AgentApprovalDto(
    val id: String,
    @SerializedName("run_id") val runId: String,
    @SerializedName("space_id") val spaceId: String?,
    @SerializedName("tool_name") val toolName: String,
    val risk: String,
    val summary: String,
    val fields: List<AgentFieldDto>,
    val status: String,
    val reason: String?,
    @SerializedName("result_ref") val resultRef: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String,
    @SerializedName("decided_at") val decidedAt: String?,
    val version: String,
    val etag: String,
)

data class AgentQuestionDto(val id: String, val text: String, @SerializedName("expires_at") val expiresAt: String)

enum class AgentPlanKind { @SerializedName("check") CHECK, @SerializedName("tool") TOOL, @SerializedName("approval") APPROVAL, @SerializedName("response") RESPONSE }
enum class AgentPlanStatus { @SerializedName("pending") PENDING, @SerializedName("done") DONE, @SerializedName("skipped") SKIPPED, @SerializedName("failed") FAILED }
enum class AgentEvidenceKind {
    @SerializedName("task") TASK, @SerializedName("reminder") REMINDER, @SerializedName("memory") MEMORY, @SerializedName("roster") ROSTER,
    @SerializedName("policy") POLICY, @SerializedName("event") EVENT, @SerializedName("document") DOCUMENT, @SerializedName("page") PAGE,
    @SerializedName("space") SPACE, @SerializedName("interests") INTERESTS,
    @SerializedName("post") POST, @SerializedName("comment") COMMENT, @SerializedName("report") REPORT, @SerializedName("message") MESSAGE,
}
enum class AgentToolEffect { @SerializedName("read") READ, @SerializedName("write") WRITE }
enum class AgentToolRisk { @SerializedName("low") LOW, @SerializedName("medium") MEDIUM }
enum class AgentToolStatus { @SerializedName("succeeded") SUCCEEDED, @SerializedName("failed") FAILED }

data class AgentPlanStepDto(val id: String, val label: String, val kind: AgentPlanKind, val tool: String?, val status: AgentPlanStatus)
data class AgentEvidenceDto(val kind: AgentEvidenceKind, val ref: String?, val label: String)
data class AgentToolCallDto(
    val id: String,
    val sequence: Int,
    @SerializedName("tool_name") val toolName: String,
    @SerializedName("tool_version") val toolVersion: String,
    val effect: AgentToolEffect,
    val risk: AgentToolRisk,
    val status: AgentToolStatus,
    val summary: String,
    @SerializedName("result_ref") val resultRef: String?,
    @SerializedName("error_code") val errorCode: String?,
    @SerializedName("approval_id") val approvalId: String?,
    @SerializedName("created_at") val createdAt: String,
)
data class AgentEventDto(val sequence: Int, @SerializedName("event_type") val eventType: String, val summary: String,
    @SerializedName("created_at") val createdAt: String)

/** A button the Main Agent shows to one of the person's own Space chats, where that Space's agent helps (DEC-060). */
data class AgentHandoffDto(
    @SerializedName("space_id") val spaceId: String,
    val name: String,
    @SerializedName("space_type") val spaceType: String,
)

data class AgentRunDto(
    val id: String,
    // Null for the person's Main Agent, which works outside every Space (DEC-060).
    @SerializedName("space_id") val spaceId: String?,
    val message: String,
    val status: String,
    val outcome: String?,
    @SerializedName("stop_reason") val stopReason: String?,
    val answer: String?,
    val question: AgentQuestionDto?,
    val approval: AgentApprovalDto?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String,
    @SerializedName("finished_at") val finishedAt: String?,
    val version: String,
    val plan: List<AgentPlanStepDto> = emptyList(),
    val evidence: List<AgentEvidenceDto> = emptyList(),
    @SerializedName("tool_calls") val toolCalls: List<AgentToolCallDto> = emptyList(),
    val events: List<AgentEventDto> = emptyList(),
    val intent: String? = null,
    @SerializedName("agent_kind") val agentKind: String? = null,
    val handoffs: List<AgentHandoffDto>? = null,
) {
    val awaitingApproval: Boolean get() = status == "waiting_for_approval" && approval?.status == "pending"
    val working: Boolean get() = status in WORKING_STATUSES
}

val WORKING_STATUSES = setOf("queued", "running", "verifying")

data class AgentMemoryDto(
    val id: String,
    val kind: String,
    val key: String?,
    val label: String,
    val content: String,
    val source: String,
    @SerializedName("source_run_id") val sourceRunId: String?,
    @SerializedName("created_at") val createdAt: String,
)

data class AgentDeletedDto(val id: String, val status: String)
data class AgentAskDto(@SerializedName("space_id") val spaceId: String?, val message: String)
data class AgentAnswerDto(@SerializedName("question_id") val questionId: String, val answer: String)
data class AgentRunPage(val items: List<AgentRunDto>, val nextCursor: String?)

/** A command keeps its exact content and key until its outcome is known, so a retry can never do something different. */
sealed interface AgentCommand {
    val accountId: String
    // spaceId null: the person's Main Agent.
    data class Ask(override val accountId: String, val spaceId: String?, val message: String, val key: String) : AgentCommand
    data class Answer(override val accountId: String, val spaceId: String?, val runId: String, val questionId: String, val answer: String) : AgentCommand
    data class Decide(override val accountId: String, val spaceId: String?, val runId: String, val approvalId: String, val etag: String,
        val approve: Boolean, val key: String) : AgentCommand
    data class Stop(override val accountId: String, val spaceId: String?, val runId: String) : AgentCommand
    data class Forget(override val accountId: String, val memoryId: String) : AgentCommand
}

val AgentCommand.runId: String? get() = when (this) {
    is AgentCommand.Answer -> runId
    is AgentCommand.Decide -> runId
    is AgentCommand.Stop -> runId
    else -> null
}

enum class AgentProblem { EMPTY, TOO_LONG, CONTROL }

fun normalizedAgentMessage(value: String): String = value.trim()

// The service refuses every Unicode "C" category (controls, format characters, private use and unassigned).
private val REFUSED_TYPES = setOf(Character.CONTROL, Character.FORMAT, Character.PRIVATE_USE, Character.UNASSIGNED, Character.SURROGATE)
    .map { it.toInt() }.toSet()

fun agentMessageProblem(value: String): AgentProblem? = when {
    value.isEmpty() -> AgentProblem.EMPTY
    value.codePointCount(0, value.length) > AGENT_MESSAGE_LIMIT -> AgentProblem.TOO_LONG
    value.codePoints().anyMatch { Character.getType(it) in REFUSED_TYPES } -> AgentProblem.CONTROL
    else -> null
}
