package com.community.platform.feature.agents

import com.google.gson.annotations.SerializedName

const val AGENT_MESSAGE_LIMIT = 500
const val AGENT_PAGE_SIZE = 10

data class AgentFieldDto(val label: String, val value: String)

data class AgentApprovalDto(
    val id: String,
    @SerializedName("run_id") val runId: String,
    @SerializedName("space_id") val spaceId: String,
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

data class AgentRunDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
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
) {
    val awaitingApproval: Boolean get() = status == "waiting_for_approval" && approval?.status == "pending"
}

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
data class AgentAskDto(@SerializedName("space_id") val spaceId: String, val message: String)
data class AgentAnswerDto(@SerializedName("question_id") val questionId: String, val answer: String)
data class AgentRunPage(val items: List<AgentRunDto>, val nextCursor: String?)

/** A command keeps its exact content and key until its outcome is known, so a retry can never do something different. */
sealed interface AgentCommand {
    val accountId: String
    data class Ask(override val accountId: String, val spaceId: String, val message: String, val key: String) : AgentCommand
    data class Answer(override val accountId: String, val spaceId: String, val runId: String, val questionId: String, val answer: String) : AgentCommand
    data class Decide(override val accountId: String, val spaceId: String, val runId: String, val approvalId: String, val etag: String,
        val approve: Boolean, val key: String) : AgentCommand
    data class Stop(override val accountId: String, val spaceId: String, val runId: String) : AgentCommand
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
