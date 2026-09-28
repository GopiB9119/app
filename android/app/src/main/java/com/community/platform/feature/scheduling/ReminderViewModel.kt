package com.community.platform.feature.scheduling

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.planning.TaskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.time.LocalDateTime
import java.util.UUID
import javax.inject.Inject

enum class ReminderTab { INBOX, REMINDERS, REQUESTS }
sealed interface ReminderCommand {
    data class Save(val intent: ReminderCreateIntent) : ReminderCommand
    data class SaveRequest(val intent: ReminderRequestCreateIntent) : ReminderCommand
    data class RespondRequest(val intent: ReminderRequestResponseIntent) : ReminderCommand
    data class Cancel(val reminder: ReminderDto) : ReminderCommand
    data class Read(val notification: InboxNotificationDto) : ReminderCommand
    data class Acknowledge(val notification: InboxNotificationDto) : ReminderCommand
    data class Preference(val enabled: Boolean, val etag: String) : ReminderCommand
}

data class ReminderWorkspaceState(
    val accountId: String? = null, val taskId: String? = null, val spaceId: String? = null,
    val taskTitle: String = "", val taskOpen: Boolean = false,
    val assignee: ReminderRecipientDto? = null, val canRequest: Boolean = false, val requestForAssignee: Boolean = false,
    val tab: ReminderTab = ReminderTab.INBOX, val busy: Boolean = false,
    val date: String = "", val time: String = "", val timezone: String = "UTC",
    val timezones: List<String> = listOf("UTC"),
    val preview: ReminderPreviewDto? = null, val selectedOption: Int? = null,
    val reminders: List<ReminderDto> = emptyList(), val reminderCursor: String? = null,
    val inbox: List<InboxNotificationDto> = emptyList(), val inboxCursor: String? = null, val unreadCount: Int = 0,
    val preferences: ReminderPreferences? = null,
    val requests: List<ReminderRequestDto> = emptyList(), val requestCursor: String? = null,
    val requestDirection: ReminderRequestDirection = ReminderRequestDirection.RECEIVED,
    val requestReview: ReminderRequestReviewDto? = null,
    val confirmation: ReminderCommand? = null, val pending: ReminderCommand? = null,
    val error: String? = null, val notice: String? = null, val requiresSignIn: Boolean = false,
) {
    val locked: Boolean get() = busy || pending != null
    val reviewing: Boolean get() = preview != null || requestReview != null || confirmation != null
}

@HiltViewModel
class ReminderViewModel @Inject constructor(
    private val repository: ReminderRepository,
    private val tasks: TaskRepository,
    private val accounts: AccountRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ReminderWorkspaceState())
    val state = mutableState.asStateFlow()
    private var work: Job? = null
    private var generation = 0L

    fun bind(accountId: String?, taskId: String? = null, spaceId: String? = null, timezone: String = "UTC") {
        val current = mutableState.value
        if (current.accountId == accountId && current.taskId == taskId && current.spaceId == spaceId) return
        generation += 1
        work?.cancel()
        mutableState.value = ReminderWorkspaceState(accountId = accountId, taskId = taskId, spaceId = spaceId, timezone = timezone, timezones = listOf(timezone), tab = if (taskId == null) ReminderTab.INBOX else ReminderTab.REMINDERS)
        if (accountId != null) refresh()
    }

    private fun update(expected: Long, change: (ReminderWorkspaceState) -> ReminderWorkspaceState) {
        if (generation == expected) mutableState.update(change)
    }

    private fun action(operation: suspend (String, Long) -> Unit) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        work = viewModelScope.launch {
            try { operation(accountId, expected) }
            catch (error: CancellationException) { throw error }
            catch (error: IdentityFailure) {
                update(expected) {
                    when {
                        error.status == 401 || error.code == "ACCOUNT_CHANGED" -> ReminderWorkspaceState(accountId = it.accountId, error = error.message, requiresSignIn = true)
                        error.status in setOf(403, 404) -> it.copy(taskTitle = "", taskOpen = false, assignee = null, canRequest = false, requestForAssignee = false, requests = emptyList(), requestCursor = null, requestReview = null, reminders = emptyList(), reminderCursor = null, inbox = emptyList(), inboxCursor = null, unreadCount = 0, preferences = null, preview = null, confirmation = null, pending = null, error = error.message)
                        error.status in 400..499 && error.status != 408 -> it.copy(preview = null, requestReview = null, selectedOption = null, confirmation = null, pending = null, error = error.message)
                        else -> it.copy(error = error.message)
                    }
                }
            }
            catch (_error: IOException) { update(expected) { it.copy(error = "No connection. Changes are not confirmed.") } }
            catch (_error: Exception) { update(expected) { it.copy(error = "The reminder service returned an unexpected response. Changes are not confirmed.") } }
            finally { update(expected) { it.copy(busy = false) } }
        }
    }

    fun refresh() {
        val current = mutableState.value
        if (current.pending != null || current.reviewing) return
        action { accountId, expected ->
            if (current.taskId != null && current.spaceId != null) {
                val task = tasks.read(accountId, current.spaceId, current.taskId)
                val assignee = task.task.assignee?.let { ReminderRecipientDto(it.accountId, it.displayName) }
                val canRequest = task.task.permissions.canEdit && assignee != null && assignee.accountId != accountId
                update(expected) { it.copy(taskTitle = task.task.title, taskOpen = task.task.status in setOf("open", "in_progress"), assignee = assignee, canRequest = canRequest, requestForAssignee = it.requestForAssignee && canRequest) }
            }
            val preferences = repository.preferences(accountId)
            val reminders = repository.reminders(accountId, current.taskId)
            val inbox = repository.inbox(accountId)
            val requests = repository.requests(accountId, current.requestDirection)
            val zones = accounts.timezones()
            update(expected) { it.copy(preferences = preferences, reminders = reminders.items, reminderCursor = reminders.nextCursor, inbox = inbox.items, inboxCursor = inbox.nextCursor, unreadCount = inbox.unreadCount ?: 0, requests = requests.items, requestCursor = requests.nextCursor, timezones = (zones + it.timezone).distinct().sorted()) }
        }
    }

    fun tab(value: ReminderTab) {
        val current = mutableState.value
        if (current.locked || current.reviewing || current.tab == value) return
        mutableState.update { it.copy(tab = value, error = null) }
        if (value == ReminderTab.REQUESTS || current.tab == ReminderTab.REQUESTS) refresh()
    }

    fun fields(date: String, time: String, timezone: String) {
        if (!mutableState.value.locked && !mutableState.value.reviewing) mutableState.update { it.copy(date = date, time = time, timezone = timezone, error = null, notice = null) }
    }

    fun requestMode(forAssignee: Boolean) {
        val current = mutableState.value
        if (current.locked || current.reviewing || (forAssignee && !current.canRequest)) return
        mutableState.update { it.copy(requestForAssignee = forAssignee, error = null, notice = null) }
    }

    fun preview() {
        val current = mutableState.value
        val taskId = current.taskId ?: return
        if (current.locked || current.reviewing || !current.taskOpen) return
        if (current.requestForAssignee && (!current.canRequest || current.assignee == null)) return
        if (!current.requestForAssignee && current.preferences?.value?.enabled != true) return
        val local = try { LocalDateTime.parse("${current.date}T${current.time}:00") } catch (_error: java.time.DateTimeException) {
            mutableState.update { it.copy(error = "Select a valid date and time.") }; return
        }
        action { accountId, expected ->
            val result = if (current.requestForAssignee) repository.previewRequest(accountId, PreviewReminderRequestDto(taskId, requireNotNull(current.assignee).accountId, local.toString(), current.timezone))
                else repository.preview(accountId, PreviewReminderDto(taskId, local.toString(), current.timezone))
            update(expected) { it.copy(preview = result, selectedOption = if (result.options.size == 1) 0 else null) }
        }
    }

    fun selectOption(index: Int) {
        val current = mutableState.value
        if (!current.locked && index in (current.preview?.options?.indices ?: IntRange.EMPTY)) mutableState.update { it.copy(selectedOption = index) }
    }

    fun changeTime() {
        if (!mutableState.value.locked) mutableState.update { it.copy(preview = null, selectedOption = null, error = null) }
    }

    fun save() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val preview = current.preview ?: return
        val option = current.selectedOption?.let(preview.options::getOrNull) ?: return
        if (current.locked) return
        val command = if (preview.requestedBy != null) {
            val spaceId = current.spaceId ?: return
            ReminderCommand.SaveRequest(ReminderRequestCreateIntent(accountId, preview.taskId, spaceId, preview.recipient.accountId,
                UUID.randomUUID().toString(), option.previewToken, preview.taskVersion, preview.localTime, preview.timezone, option.scheduledAt))
        } else ReminderCommand.Save(ReminderCreateIntent(accountId, preview.taskId, UUID.randomUUID().toString(), option.previewToken))
        mutableState.update { it.copy(pending = command) }
        executePending()
    }

    fun propose(command: ReminderCommand) {
        val current = mutableState.value
        if (current.locked || current.reviewing) return
        if (command is ReminderCommand.Cancel && command.reminder.status != "scheduled") return
        if (command is ReminderCommand.Acknowledge && command.notification.acknowledgedAt != null) return
        if (command is ReminderCommand.RespondRequest) {
            val intent = command.intent
            val actor = if (intent.response == ReminderRequestResponse.CANCEL) intent.request.requestedBy.accountId else intent.request.recipient.accountId
            if (intent.response == ReminderRequestResponse.ACCEPT || intent.accountId != current.accountId || actor != current.accountId
                || intent.request.status != "pending" || current.requests.none { it == intent.request }) return
        }
        if (command is ReminderCommand.Cancel || command is ReminderCommand.Acknowledge || command is ReminderCommand.RespondRequest) mutableState.update { it.copy(confirmation = command, error = null) }
    }
    fun cancelConfirmation() { if (!mutableState.value.locked) mutableState.update { it.copy(confirmation = null) } }
    fun confirm() {
        val current = mutableState.value
        if (current.locked || current.confirmation == null) return
        mutableState.update { it.copy(pending = current.confirmation, confirmation = null) }
        executePending()
    }
    fun read(item: InboxNotificationDto) {
        if (mutableState.value.locked || mutableState.value.reviewing || item.readAt != null) return
        mutableState.update { it.copy(pending = ReminderCommand.Read(item)) }
        executePending()
    }
    fun preference(enabled: Boolean) {
        val current = mutableState.value
        val preference = current.preferences ?: return
        if (current.locked || current.reviewing || enabled == preference.value.enabled) return
        mutableState.update { it.copy(pending = ReminderCommand.Preference(enabled, preference.etag)) }
        executePending()
    }
    fun retry() { if (mutableState.value.pending != null) executePending() }

    private fun executePending() {
        val command = mutableState.value.pending ?: return
        action { accountId, expected ->
            when (command) {
                is ReminderCommand.SaveRequest -> {
                    if (command.intent.accountId != accountId) throw IdentityFailure("ACCOUNT_CHANGED", "Sign in again.", 401)
                    val saved = repository.saveRequest(command.intent)
                    update(expected) { it.copy(requests = if (it.requestDirection == ReminderRequestDirection.SENT) listOf(saved) + it.requests.filterNot { item -> item.id == saved.id } else it.requests,
                        preview = null, selectedOption = null, pending = null, date = "", time = "", notice = requestNotice(saved.status)) }
                }
                is ReminderCommand.RespondRequest -> {
                    if (command.intent.accountId != accountId) throw IdentityFailure("ACCOUNT_CHANGED", "Sign in again.", 401)
                    val result = repository.respondRequest(command.intent)
                    update(expected) { it.copy(requests = it.requests.map { item -> if (item.id == result.id) result else item }, pending = null, requestReview = null, notice = requestNotice(result.status)) }
                }
                is ReminderCommand.Save -> {
                    if (command.intent.accountId != accountId) throw IdentityFailure("ACCOUNT_CHANGED", "Sign in again.", 401)
                    val saved = repository.save(command.intent)
                    update(expected) { it.copy(reminders = listOf(saved) + it.reminders.filterNot { existing -> existing.id == saved.id }, preview = null, selectedOption = null, pending = null, date = "", time = "", notice = "Reminder saved.") }
                }
                is ReminderCommand.Cancel -> {
                    val result = repository.cancel(accountId, command.reminder.id)
                    val notice = when (result.status) {
                        "cancelled" -> "Reminder cancelled."
                        "failed" -> "Reminder delivery failed."
                        "suppressed" -> "Reminder was stopped."
                        "expired" -> "Reminder expired."
                        else -> "Reminder status updated."
                    }
                    update(expected) { it.copy(reminders = it.reminders.map { item -> if (item.id == result.id) result else item }, pending = null, notice = notice) }
                }
                is ReminderCommand.Read -> {
                    val result = repository.read(accountId, command.notification.id)
                    update(expected) { it.copy(inbox = it.inbox.map { item -> if (item.id == result.id) result else item }, unreadCount = (it.unreadCount - if (command.notification.readAt == null && result.readAt != null) 1 else 0).coerceAtLeast(0), pending = null) }
                }
                is ReminderCommand.Acknowledge -> {
                    val result = repository.acknowledge(accountId, command.notification.id)
                    update(expected) { it.copy(inbox = it.inbox.map { item -> if (item.id == result.id) result else item }, reminders = it.reminders.map { item -> if (item.id == result.reminderId) item.copy(acknowledgedAt = result.acknowledgedAt) else item }, pending = null, notice = "Reminder acknowledged.") }
                }
                is ReminderCommand.Preference -> {
                    val result = repository.setPreferences(accountId, command.enabled, command.etag)
                    update(expected) { it.copy(preferences = result, pending = null, preview = null, selectedOption = null, notice = "Notification preference saved.") }
                }
            }
        }
    }

    fun moreReminders() {
        val current = mutableState.value
        if (current.locked || current.reviewing || current.reminderCursor == null) return
        action { accountId, expected ->
            val page = repository.reminders(accountId, current.taskId, current.reminderCursor)
            update(expected) { it.copy(reminders = (it.reminders + page.items).distinctBy(ReminderDto::id), reminderCursor = page.nextCursor) }
        }
    }
    fun moreInbox() {
        val current = mutableState.value
        if (current.locked || current.reviewing || current.inboxCursor == null) return
        action { accountId, expected ->
            val page = repository.inbox(accountId, current.inboxCursor)
            update(expected) { it.copy(inbox = (it.inbox + page.items).distinctBy(InboxNotificationDto::id), inboxCursor = page.nextCursor, unreadCount = page.unreadCount ?: 0) }
        }
    }

    fun requestDirection(value: ReminderRequestDirection) {
        val current = mutableState.value
        if (current.locked || current.reviewing || current.requestDirection == value) return
        mutableState.update { it.copy(requestDirection = value, requests = emptyList(), requestCursor = null) }
        action { accountId, expected ->
            val page = repository.requests(accountId, value)
            update(expected) { it.copy(requests = page.items, requestCursor = page.nextCursor) }
        }
    }

    fun moreRequests() {
        val current = mutableState.value
        if (current.locked || current.reviewing || current.requestCursor == null) return
        action { accountId, expected ->
            val page = repository.requests(accountId, current.requestDirection, current.requestCursor)
            update(expected) { it.copy(requests = (it.requests + page.items).distinctBy(ReminderRequestDto::id), requestCursor = page.nextCursor) }
        }
    }

    fun reviewRequest(proposal: ReminderRequestDto) {
        val current = mutableState.value
        if (current.locked || current.reviewing || proposal.recipient.accountId != current.accountId || proposal.status != "pending"
            || current.requests.none { it == proposal }) return
        action { accountId, expected ->
            val result = repository.reviewRequest(accountId, proposal)
            update(expected) { it.copy(requestReview = result) }
        }
    }

    fun closeRequestReview() { if (!mutableState.value.locked) mutableState.update { it.copy(requestReview = null, error = null) } }

    fun acceptRequest() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val review = current.requestReview ?: return
        if (current.locked || review.request.recipient.accountId != accountId) return
        val intent = ReminderRequestResponseIntent(accountId, review.request, ReminderRequestResponse.ACCEPT, review.previewToken)
        mutableState.update { it.copy(pending = ReminderCommand.RespondRequest(intent)) }
        executePending()
    }

    private fun requestNotice(status: String) = when (status) {
        "pending" -> "Request awaiting acceptance."
        "accepted" -> "Request accepted."
        "declined" -> "Request declined."
        "cancelled" -> "Request withdrawn."
        "expired" -> "Request expired."
        else -> "Task changed. Request is no longer active."
    }
}