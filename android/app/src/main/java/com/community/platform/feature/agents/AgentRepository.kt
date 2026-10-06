package com.community.platform.feature.agents

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.IdentityFailure
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val RUN_STATUSES = setOf("queued", "running", "waiting_for_approval", "waiting_for_user", "verifying",
    "completed", "failed", "cancelled", "timed_out", "expired")
private val APPROVAL_STATUSES = setOf("pending", "approved", "rejected", "expired", "cancelled", "superseded")
private val OUTCOMES = setOf("answered", "refused", "action_completed")
private val ETAG = Regex("\"[a-f0-9]{64}\"")
private val VERSION = Regex("[1-9][0-9]*")
private val SPACE_TYPES = setOf("family", "couple", "group", "solo")

@Singleton
class AgentRepository @Inject constructor(private val api: AgentApi, private val accounts: AccountRepository) {
    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected agent response.")
    private fun <Value> validate(block: () -> Value): Value = try { block() }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int) = require(value.isNotBlank() && value.codePointCount(0, value.length) <= limit)

    /** [spaceId] null means the person's Main Agent, whose runs name no Space. */
    fun run(value: AgentRunDto, spaceId: String?): AgentRunDto = validate {
        identifier(value.id); value.spaceId?.let(::identifier)
        require(value.spaceId == spaceId)
        require(value.agentKind == null || value.agentKind == if (spaceId == null) "main" else "space")
        value.handoffs?.let { handoffs ->
            require(handoffs.size <= 6 && handoffs.map { it.spaceId }.distinct().size == handoffs.size)
            handoffs.forEach { identifier(it.spaceId); text(it.name, 200); require(it.spaceType in SPACE_TYPES) }
        }
        text(value.message, AGENT_MESSAGE_LIMIT)
        require(value.status in RUN_STATUSES && (value.outcome == null || value.outcome in OUTCOMES))
        require(VERSION.matches(value.version))
        Instant.parse(value.createdAt); Instant.parse(value.updatedAt); value.finishedAt?.let(Instant::parse)
        value.plan.forEach { step ->
            require(step.id.isNotBlank() && step.label.isNotBlank() && (step.tool == null || step.tool.isNotBlank()))
            require(step.kind in AgentPlanKind.values() && step.status in AgentPlanStatus.values())
        }
        value.evidence.forEach { evidence ->
            require(evidence.label.isNotBlank() && evidence.kind in AgentEvidenceKind.values())
        }
        value.toolCalls.forEach { call ->
            require(call.id.isNotBlank() && call.toolName.isNotBlank() && call.toolVersion.isNotBlank() && call.summary.isNotBlank())
            require(call.effect in AgentToolEffect.values() && call.risk in AgentToolRisk.values() && call.status in AgentToolStatus.values())
            Instant.parse(call.createdAt)
        }
        value.events.forEach { event ->
            require(event.eventType.isNotBlank() && event.summary.isNotBlank())
            Instant.parse(event.createdAt)
        }
        val question = value.question
        require((value.status == "waiting_for_user") == (question != null))
        question?.let { identifier(it.id); text(it.text, 2000); Instant.parse(it.expiresAt) }
        val approval = value.approval
        require(value.status != "waiting_for_approval" || approval?.status == "pending")
        approval?.let {
            identifier(it.id); require(it.runId == value.id && it.spaceId == value.spaceId)
            text(it.toolName, 64); text(it.summary, 300)
            require(it.risk in setOf("low", "medium") && it.status in APPROVAL_STATUSES)
            require(it.fields.size <= 10 && it.fields.all { field -> field.label.isNotBlank() })
            require((it.status == "pending") == (it.decidedAt == null))
            it.resultRef?.let(::identifier)
            Instant.parse(it.createdAt); Instant.parse(it.expiresAt); it.decidedAt?.let(Instant::parse)
            require(VERSION.matches(it.version) && ETAG.matches(it.etag))
        }
        value
    }

    fun memory(value: AgentMemoryDto): AgentMemoryDto = validate {
        identifier(value.id)
        require(value.kind in setOf("preference", "note"))
        text(value.label, 80); text(value.content, 200); text(value.source, 40)
        value.sourceRunId?.let(::identifier)
        Instant.parse(value.createdAt)
        value
    }

    suspend fun runs(accountId: String, spaceId: String?, cursor: String?, seenIds: Set<String> = emptySet(),
        seenCursors: Set<String> = emptySet()): AgentRunPage = accounts.authorized(accountId) { authorization ->
        val response = api.runs(authorization, spaceId, cursor)
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid()
        val runs = items.map { run(it, spaceId) }
        validate {
            require(runs.size <= AGENT_PAGE_SIZE && runs.map { it.id }.distinct().size == runs.size && runs.none { it.id in seenIds })
            require(runs.zipWithNext().all { (newer, older) -> Instant.parse(newer.createdAt) >= Instant.parse(older.createdAt) })
            require(pagination.hasMore == (pagination.nextCursor != null))
            pagination.nextCursor?.let { require(it.isNotBlank() && it.length <= 2048 && it != cursor && it !in seenCursors && runs.isNotEmpty()) }
        }
        AgentRunPage(runs, pagination.nextCursor)
    }

    suspend fun getRun(accountId: String, runId: String, spaceId: String?): AgentRunDto = accounts.authorized(accountId) { authorization ->
        identifier(runId)
        spaceId?.let(::identifier)
        run(accounts.result(api.getRun(authorization, runId)), spaceId).also { value ->
            if (value.id != runId) invalid()
        }
    }

    suspend fun ask(command: AgentCommand.Ask): AgentRunDto = accounts.authorized(command.accountId) {
        require(agentMessageProblem(command.message) == null && command.message == normalizedAgentMessage(command.message))
        run(accounts.result(api.ask(it, command.key, AgentAskDto(command.spaceId, command.message))), command.spaceId)
            .also { created -> if (created.message != command.message) invalid() }
    }

    suspend fun answer(command: AgentCommand.Answer): AgentRunDto = accounts.authorized(command.accountId) {
        require(agentMessageProblem(command.answer) == null)
        run(accounts.result(api.answer(it, command.runId, AgentAnswerDto(command.questionId, command.answer))), command.spaceId)
            .also { changed -> if (changed.id != command.runId) invalid() }
    }

    suspend fun decide(command: AgentCommand.Decide): AgentRunDto = accounts.authorized(command.accountId) {
        val response = if (command.approve) api.approve(it, command.approvalId, command.key, command.etag, emptyMap())
            else api.reject(it, command.approvalId, command.etag, emptyMap())
        run(accounts.result(response), command.spaceId)
            .also { decided -> if (decided.id != command.runId || decided.approval?.id != command.approvalId) invalid() }
    }

    suspend fun stop(command: AgentCommand.Stop): AgentRunDto = accounts.authorized(command.accountId) {
        run(accounts.result(api.stop(it, command.runId, emptyMap())), command.spaceId)
            .also { stopped -> if (stopped.id != command.runId) invalid() }
    }

    suspend fun memories(accountId: String): List<AgentMemoryDto> = accounts.authorized(accountId) {
        val items = accounts.result(api.memories(it)).map(::memory)
        validate { require(items.size <= 100 && items.map { item -> item.id }.distinct().size == items.size) }
        items
    }

    /** Returns false when the memory was already gone, for example after a retry of a delete whose answer was lost. */
    suspend fun forget(command: AgentCommand.Forget): Boolean = accounts.authorized(command.accountId) {
        val deleted = try { accounts.result(api.forget(it, command.memoryId)) } catch (error: IdentityFailure) {
            if (error.status == 404) return@authorized false
            throw error
        }
        validate { require(deleted.id == command.memoryId && deleted.status == "deleted") }
        true
    }
}
