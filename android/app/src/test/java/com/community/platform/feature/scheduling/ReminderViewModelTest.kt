package com.community.platform.feature.scheduling

import com.community.platform.feature.planning.FamilyTaskDto
import com.community.platform.feature.planning.TaskPermissionsDto
import com.community.platform.feature.planning.TaskAssigneeDto
import com.community.platform.feature.planning.TaskRepository
import com.community.platform.feature.planning.TaskRepositoryTest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReminderViewModelTest {
    private val fixture = ReminderRepositoryTest.Fixture()
    private val task = FamilyTaskDto(fixture.taskId, fixture.spaceId, "Groceries", "Fruit", null, "open", null, false, fixture.accountId, null, null, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", "1", TaskPermissionsDto(true, listOf("completed")), "\"task-1\"")
    private val taskApi = TaskRepositoryTest.FakeTasks(task)
    private val model = ReminderViewModel(fixture.repository, TaskRepository(taskApi, fixture.accounts), fixture.accounts)

    @Before fun dispatcher() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model.bind(null); Dispatchers.resetMain() }
    private suspend fun idle() = withTimeout(5000) { model.state.first { !it.busy } }
    private suspend fun start() { model.bind(fixture.accountId, fixture.taskId, fixture.spaceId, fixture.request.timezone); idle() }
    private suspend fun preview() { model.fields("2026-11-01", "01:30", fixture.request.timezone); model.preview(); idle() }

    @Test fun ambiguousTimeCannotSaveUntilOneOptionIsExplicitlySelected() = runBlocking {
        start(); preview()
        assertEquals(2, model.state.value.preview!!.options.size)
        assertNull(model.state.value.selectedOption)
        model.save()
        assertTrue(fixture.api.keys.isEmpty())
        model.selectOption(1); model.save(); idle()
        assertEquals(listOf(fixture.preview.options[1].previewToken), fixture.api.tokens)
        assertEquals("Reminder saved.", model.state.value.notice)
    }
    @Test fun unknownSaveLocksReviewedFieldsAndReusesItsOriginalRequest() = runBlocking {
        start(); preview(); model.selectOption(1)
        fixture.api.failure = 503
        model.save(); idle()
        val pending = model.state.value.pending
        assertNotNull(pending)
        model.fields("2026-12-01", "02:00", "UTC")
        model.selectOption(0); model.changeTime(); model.refresh()
        assertEquals(pending, model.state.value.pending)
        assertEquals("01:30", model.state.value.time)
        assertEquals(1, fixture.api.keys.size)
        fixture.api.failure = 0
        model.retry(); idle()
        assertEquals(fixture.api.keys[0], fixture.api.keys[1])
        assertEquals(fixture.api.tokens[0], fixture.api.tokens[1])
        assertNull(model.state.value.pending)
    }
    @Test fun readAndAcknowledgmentAreSeparateAndAcknowledgmentNeedsConfirmation() = runBlocking {
        start()
        model.read(model.state.value.inbox.single()); idle()
        assertEquals(0, model.state.value.unreadCount)
        assertNull(model.state.value.inbox.single().acknowledgedAt)
        model.propose(ReminderCommand.Acknowledge(model.state.value.inbox.single()))
        assertEquals(listOf("read"), fixture.api.actions)
        model.confirm(); idle()
        assertEquals(listOf("read", "acknowledge"), fixture.api.actions)
        assertNotNull(model.state.value.inbox.single().acknowledgedAt)
        assertTrue(taskApi.keys.isEmpty())
    }
    @Test fun preferenceConflictDoesNotPretendToChangeTheSavedSetting() = runBlocking {
        start()
        fixture.api.failure = 412
        model.preference(false); idle()
        assertTrue(model.state.value.preferences!!.value.enabled)
        assertNull(model.state.value.pending)
        assertNull(model.state.value.notice)
        assertNotNull(model.state.value.error)
        assertEquals(1, fixture.api.etags.size)
    }
    @Test fun accountRevocationClearsInboxAndReviewedTask() = runBlocking {
        start()
        fixture.api.failure = 401
        model.refresh(); idle()
        assertTrue(model.state.value.requiresSignIn)
        assertTrue(model.state.value.inbox.isEmpty())
        assertTrue(model.state.value.reminders.isEmpty())
        assertEquals("", model.state.value.taskTitle)
    }
    @Test fun cancelUsesSelectedReminderAndDoesNotRunBeforeConfirmation() = runBlocking {
        start()
        model.propose(ReminderCommand.Cancel(model.state.value.reminders.single()))
        assertTrue(fixture.api.actions.isEmpty())
        model.cancelConfirmation()
        assertTrue(fixture.api.actions.isEmpty())
        model.propose(ReminderCommand.Cancel(model.state.value.reminders.single()))
        model.confirm(); idle()
        assertEquals(listOf("cancel"), fixture.api.actions)
        assertEquals("cancelled", model.state.value.reminders.single().status)
    }

    @Test fun cancellationDoesNotMislabelAnAlreadyFailedReminder() = runBlocking {
        start()
        fixture.api.cancelValue = fixture.reminder.copy(status = "failed", reason = "dispatch_failed")
        model.propose(ReminderCommand.Cancel(model.state.value.reminders.single()))
        model.confirm(); idle()
        assertEquals("failed", model.state.value.reminders.single().status)
        assertEquals("Reminder delivery failed.", model.state.value.notice)
        assertNull(model.state.value.pending)
    }

    @Test fun assigneeProposalIsReviewedButDoesNotUsePersonalScheduleCreation() = runBlocking {
        taskApi.task = task.copy(assignee = TaskAssigneeDto(fixture.otherId, "Sam"))
        start(); model.requestMode(true); preview()
        assertEquals(fixture.otherId, model.state.value.preview!!.recipient.accountId)
        assertEquals(fixture.accountId, model.state.value.preview!!.requestedBy!!.accountId)
        model.save()
        assertTrue(fixture.api.requestKeys.isEmpty())
        model.selectOption(1); model.save(); idle()
        assertEquals(1, fixture.api.requestKeys.size)
        assertTrue(fixture.api.keys.isEmpty())
        assertEquals("Request awaiting acceptance.", model.state.value.notice)
    }

    @Test fun uncertainProposalCannotChangeRecipientTimeOrRetryIdentity() = runBlocking {
        taskApi.task = task.copy(assignee = TaskAssigneeDto(fixture.otherId, "Sam"))
        start(); model.requestMode(true); preview(); model.selectOption(1)
        fixture.api.failure = 503
        model.save(); idle()
        val pending = model.state.value.pending
        assertTrue(pending is ReminderCommand.SaveRequest)
        model.requestMode(false); model.fields("2026-12-01", "09:00", "UTC"); model.tab(ReminderTab.REQUESTS); model.refresh()
        assertEquals(pending, model.state.value.pending)
        assertTrue(model.state.value.requestForAssignee)
        assertEquals(ReminderTab.REMINDERS, model.state.value.tab)
        fixture.api.failure = 0
        model.retry(); idle()
        assertEquals(fixture.api.requestKeys[0], fixture.api.requestKeys[1])
        assertEquals(fixture.api.requestTokens[0], fixture.api.requestTokens[1])
    }

    @Test fun recipientReviewNeverSchedulesBeforeExplicitAcceptance() = runBlocking {
        fixture.receiveRequest(); start()
        model.tab(ReminderTab.REQUESTS); idle()
        model.reviewRequest(model.state.value.requests.single()); idle()
        assertNotNull(model.state.value.requestReview)
        assertTrue(fixture.api.requestActions.isEmpty())
        model.propose(ReminderCommand.RespondRequest(ReminderRequestResponseIntent(fixture.accountId, fixture.incoming, ReminderRequestResponse.ACCEPT, "x".repeat(64))))
        model.confirm(); idle()
        assertTrue(fixture.api.requestActions.isEmpty())
        model.closeRequestReview()
        assertTrue(fixture.api.requestActions.isEmpty())
        model.reviewRequest(model.state.value.requests.single()); idle(); model.acceptRequest(); idle()
        assertEquals(listOf("accept"), fixture.api.requestActions)
        assertEquals("accepted", model.state.value.requests.single().status)
        assertEquals("Request accepted.", model.state.value.notice)
    }

    @Test fun uncertainRecipientAcceptanceLocksReviewAndRetriesItsOriginalToken() = runBlocking {
        fixture.receiveRequest(); start(); model.tab(ReminderTab.REQUESTS); idle()
        model.reviewRequest(model.state.value.requests.single()); idle()
        fixture.api.failure = 503
        model.acceptRequest(); idle()
        val pending = model.state.value.pending
        assertNotNull(pending)
        model.closeRequestReview(); model.requestDirection(ReminderRequestDirection.SENT); model.tab(ReminderTab.REMINDERS); model.refresh()
        assertEquals(pending, model.state.value.pending)
        assertNotNull(model.state.value.requestReview)
        assertEquals(ReminderRequestDirection.RECEIVED, model.state.value.requestDirection)
        fixture.api.failure = 0
        model.retry(); idle()
        assertEquals(listOf("accept", "accept"), fixture.api.requestActions)
        assertEquals(fixture.api.requestTokens[0], fixture.api.requestTokens[1])
        assertNull(model.state.value.pending)
        assertNull(model.state.value.requestReview)
    }

    @Test fun declineAndWithdrawalWaitForTargetConfirmation() = runBlocking {
        fixture.receiveRequest(); start()
        val intent = ReminderRequestResponseIntent(fixture.accountId, fixture.incoming, ReminderRequestResponse.DECLINE)
        model.propose(ReminderCommand.RespondRequest(intent))
        assertTrue(fixture.api.requestActions.isEmpty())
        model.cancelConfirmation()
        assertTrue(fixture.api.requestActions.isEmpty())
        model.propose(ReminderCommand.RespondRequest(intent)); model.confirm(); idle()
        assertEquals(listOf("decline"), fixture.api.requestActions)
        assertEquals("declined", model.state.value.requests.single().status)
        assertTrue(fixture.api.keys.isEmpty())
    }

    @Test fun rejectedReviewRequiresNewRecipientConfirmation() = runBlocking {
        fixture.receiveRequest(); start()
        model.reviewRequest(model.state.value.requests.single()); idle()
        fixture.api.failure = 409
        model.acceptRequest(); idle()
        assertNull(model.state.value.requestReview)
        assertNull(model.state.value.pending)
        assertNull(model.state.value.notice)
        model.retry(); idle()
        assertEquals(1, fixture.api.requestActions.size)
    }

    @Test fun accountSwitchDiscardsRequestReviewAndAnyUncertainResponse() = runBlocking {
        fixture.receiveRequest(); start()
        model.reviewRequest(model.state.value.requests.single()); idle()
        fixture.api.failure = 503
        model.acceptRequest(); idle()
        assertNotNull(model.state.value.pending)
        model.bind(null)
        model.retry(); idle()
        assertNull(model.state.value.accountId)
        assertTrue(model.state.value.requests.isEmpty())
        assertNull(model.state.value.requestReview)
        assertNull(model.state.value.pending)
        assertEquals(1, fixture.api.requestActions.size)
    }
}