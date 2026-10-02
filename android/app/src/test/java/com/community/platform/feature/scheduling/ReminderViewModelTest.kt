package com.community.platform.feature.scheduling

import androidx.lifecycle.viewModelScope
import com.community.platform.feature.planning.FamilyTaskDto
import com.community.platform.feature.planning.TaskPermissionsDto
import com.community.platform.feature.planning.TaskAssigneeDto
import com.community.platform.feature.planning.TaskRepository
import com.community.platform.feature.planning.TaskRepositoryTest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.joinAll
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
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class ReminderViewModelTest {
    private val fixture = ReminderRepositoryTest.Fixture()
    private val task = FamilyTaskDto(fixture.taskId, fixture.spaceId, "Groceries", "Fruit", null, "open", null, false, fixture.accountId, null, null, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", "1", TaskPermissionsDto(true, listOf("completed")), "\"task-1\"")
    private val taskApi = TaskRepositoryTest.FakeTasks(task)
    private val model = ReminderViewModel(fixture.repository, TaskRepository(taskApi, fixture.accounts), fixture.accounts)

    @Before fun dispatcher() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() = runBlocking {
        val jobs = requireNotNull(model.viewModelScope.coroutineContext[Job]).children.toList()
        model.bind(null)
        try { withTimeout(5000) { jobs.joinAll() } } finally { Dispatchers.resetMain() }
    }
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

    @Test fun repeatingReminderIsReviewedThenSavedOnceWithItsOriginalKeyOnRetry() = runBlocking {
        fixture.offerSeries(); fixture.api.seriesItems = emptyList(); start()
        model.repeat(RepeatMode.DAILY)
        model.seriesFields("08:00", "1", emptySet(), "2026-11-01", "2026-11-07", "Asia/Kolkata")
        model.previewSeries(); idle()
        assertNotNull(model.state.value.seriesPreview)
        assertTrue(fixture.api.seriesKeys.isEmpty())
        val before = model.state.value
        fixture.api.failure = 503
        model.saveSeries(); idle()
        assertReminderDataUnchanged(before)
        assertNotNull(model.state.value.error)
        val pending = model.state.value.pending
        assertTrue(pending is ReminderCommand.SaveSeries)
        model.changeSeries(); model.seriesFields("09:00", "2", emptySet(), "2026-11-01", "2026-11-07", "UTC"); model.repeat(RepeatMode.WEEKLY); model.refresh()
        assertEquals(pending, model.state.value.pending)
        assertEquals("08:00", model.state.value.seriesTime)
        assertNotNull(model.state.value.seriesPreview)
        fixture.api.failure = 0
        model.retry(); idle()
        assertEquals(2, fixture.api.seriesKeys.size)
        assertEquals(fixture.api.seriesKeys[0], fixture.api.seriesKeys[1])
        assertEquals("Repeating reminder saved.", model.state.value.notice)
        assertEquals(RepeatMode.ONCE, model.state.value.repeat)
        assertEquals(fixture.seriesId, model.state.value.series.single().id)
        assertNull(model.state.value.seriesPreview)
        assertNull(model.state.value.pending)
    }

    @Test fun invalidRepeatingRuleNeverReachesTheService() = runBlocking {
        fixture.offerSeries(); start()
        model.repeat(RepeatMode.WEEKLY)
        model.seriesFields("08:00", "1", emptySet(), "2026-11-01", "2026-11-07", "Asia/Kolkata")
        val calls = fixture.api.calls
        model.previewSeries()
        assertNotNull(model.state.value.error)
        model.seriesFields("08:00", "5", setOf("mon"), "2026-11-01", "2026-11-07", "Asia/Kolkata"); model.previewSeries()
        model.seriesFields("08:00", "1", setOf("mon"), "2026-11-08", "2026-11-07", "Asia/Kolkata"); model.previewSeries()
        assertEquals(calls, fixture.api.calls)
        assertNull(model.state.value.seriesPreview)
    }

    @Test fun seriesChangesNeedConfirmationAndRetryWithTheSameKey() = runBlocking {
        fixture.offerSeries(); start()
        val before = model.state.value
        val series = model.state.value.series.single()
        model.proposeSeries(series, SeriesOperation.RESUME)
        assertNull(model.state.value.confirmation)
        model.proposeSeries(series, SeriesOperation.PAUSE)
        assertNotNull(model.state.value.confirmation)
        model.cancelConfirmation()
        assertTrue(fixture.api.seriesCommands.isEmpty())
        model.proposeSeries(series, SeriesOperation.PAUSE)
        fixture.api.failure = 503
        model.confirm(); idle()
        assertReminderDataUnchanged(before)
        assertNotNull(model.state.value.error)
        assertTrue(model.state.value.pending is ReminderCommand.Series)
        fixture.api.failure = 0
        model.retry(); idle()
        assertEquals(2, fixture.api.seriesCommands.size)
        assertEquals(fixture.api.seriesCommands[0], fixture.api.seriesCommands[1])
        assertEquals("paused", model.state.value.series.single().status)
        assertEquals("Repeating reminder paused.", model.state.value.notice)
        assertNull(model.state.value.pending)
    }

    @Test fun snoozeNeedsAnAvailableChoiceAndRetriesTheOriginalRequest() = runBlocking {
        fixture.offerSnooze(Instant.now().plusSeconds(7200).toString()); start()
        val before = model.state.value
        val item = model.state.value.inbox.single()
        model.openSnooze(item)
        assertEquals(item, model.state.value.snoozing)
        model.snooze()
        model.snoozeChoice(180); model.snoozeChoice(1440)
        assertNull(model.state.value.snoozeMinutes)
        assertTrue(fixture.api.snoozes.isEmpty())
        model.snoozeChoice(10)
        fixture.api.failure = 503
        model.snooze(); idle()
        assertReminderDataUnchanged(before)
        assertNotNull(model.state.value.error)
        assertTrue(model.state.value.pending is ReminderCommand.Snooze)
        model.closeSnooze(); model.snoozeChoice(60)
        assertNotNull(model.state.value.snoozing)
        assertEquals(10, (model.state.value.pending as ReminderCommand.Snooze).intent.minutes)
        fixture.api.failure = 0
        model.retry(); idle()
        assertEquals(2, fixture.api.snoozes.size)
        assertEquals(fixture.api.snoozes[0], fixture.api.snoozes[1])
        assertNull(model.state.value.snoozing)
        assertTrue(model.state.value.notice!!.startsWith("Snoozed until"))
        assertEquals(0, model.state.value.unreadCount)
    }

    @Test fun seriesOccurrenceIsNotCancelledAsAPlainReminder() = runBlocking {
        fixture.api.reminderValue = fixture.reminder.copy(seriesId = fixture.seriesId, occurrenceDate = "2026-11-01")
        start()
        model.propose(ReminderCommand.Cancel(model.state.value.reminders.single()))
        assertNull(model.state.value.confirmation)
        assertTrue(fixture.api.actions.isEmpty())
    }

    @Test fun pausedSeriesResumesOnlyAfterConfirmation() = runBlocking {
        confirmSeriesControl(seriesCases.single { it.operation == SeriesOperation.RESUME })
    }

    @Test fun activeAndPausedSeriesCancelOnlyAfterConfirmation() = runBlocking {
        for (case in seriesCases.filter { it.operation == SeriesOperation.CANCEL }) confirmSeriesControl(case)
    }

    @Test fun skippingNextOccurrenceWaitsForConfirmation() = runBlocking {
        confirmSeriesControl(seriesCases.single { it.operation == SeriesOperation.SKIP })
    }

    @Test fun resumeAndSkipCanConfirmThatTheSeriesHasEnded() = runBlocking {
        for (case in seriesCases.filter { it.operation in setOf(SeriesOperation.RESUME, SeriesOperation.SKIP) }) {
            confirmSeriesControl(case.copy(after = fixture.series.copy(status = "ended", nextOccurrence = null),
                notice = "No reminder times remain, so the repeating reminder ended."))
        }
    }

    @Test fun lostSeriesAnswersKeepTheReviewedCommandUntilConfirmed() = runBlocking {
        for (case in seriesCases) {
            val confirmed = prepareSeries(case)
            start()
            val before = model.state.value
            val calls = fixture.api.seriesCalls.size
            model.proposeSeries(case.before, case.operation)
            val command = model.state.value.confirmation as ReminderCommand.Series
            val request = ReminderRepositoryTest.SeriesCommandCall(command.intent.requestKey, case.before.etag, case.before.id, case.operation.wireValue, emptyMap())
            val changed = before.series.map { if (it.id == confirmed.id) confirmed else it }
            fixture.api.loseCommandAnswer = true
            whileCommandAnswerIsHeld({ model.confirm() }) {
                assertEquals(changed, fixture.api.seriesItems)
                assertEquals(confirmed, fixture.api.seriesValue)
                assertReminderDataUnchanged(before)
                assertEquals(command, model.state.value.pending)
            }
            assertEquals(listOf(request), fixture.api.seriesCalls.drop(calls))
            assertReminderDataUnchanged(before)
            assertEquals("No connection. Changes are not confirmed.", model.state.value.error)
            assertEquals(command, model.state.value.pending)
            assertNull(model.state.value.confirmation)

            val allCalls = fixture.api.calls
            model.proposeSeries(case.before, SeriesOperation.CANCEL)
            model.cancelConfirmation(); model.confirm(); model.refresh()
            assertEquals(allCalls, fixture.api.calls)
            assertEquals(command, model.state.value.pending)
            assertReminderDataUnchanged(before)

            fixture.api.loseCommandAnswer = false
            whileCommandAnswerIsHeld({ model.retry() }) {
                assertReminderDataUnchanged(before)
                assertEquals(command, model.state.value.pending)
            }
            assertEquals(listOf(request, request), fixture.api.seriesCalls.drop(calls))
            assertEquals(changed, model.state.value.series)
            assertEquals(case.notice, model.state.value.notice)
            assertNull(model.state.value.error)
            assertNull(model.state.value.pending)
            model.retry(); idle()
            assertEquals(calls + 2, fixture.api.seriesCalls.size)
            assertTrue(fixture.api.actions.isEmpty())
        }
    }

    @Test fun seriesConflictsDoNotChangeShownStateOrAllowBlindRetry() = runBlocking {
        refuseSeriesControls(409)
    }

    @Test fun staleSeriesEtagsDoNotChangeShownStateOrAllowBlindRetry() = runBlocking {
        refuseSeriesControls(412)
    }

    @Test fun lostSnoozeAnswerKeepsTheOriginalChoiceUntilConfirmed() = runBlocking {
        fixture.offerSnooze(Instant.now().plusSeconds(7200).toString()); start()
        val before = model.state.value
        val item = before.inbox.single()
        val confirmed = item.copy(readAt = "2026-11-01T06:32:00Z", canSnooze = false, snoozedUntil = "2026-11-01T06:42:00Z")
        fixture.api.snoozeValue = confirmed
        model.openSnooze(item); model.snoozeChoice(10)
        fixture.api.loseCommandAnswer = true
        whileCommandAnswerIsHeld({ model.snooze() }) {
            assertEquals(confirmed, fixture.api.notificationValue)
            assertEquals(0, fixture.api.unread)
            assertReminderDataUnchanged(before)
            assertTrue(model.state.value.pending is ReminderCommand.Snooze)
        }
        val command = model.state.value.pending as ReminderCommand.Snooze
        val request = ReminderRepositoryTest.SnoozeCall(command.intent.requestKey, item.id, SnoozeDto(10))
        assertEquals(item, command.intent.notification)
        assertEquals(10, command.intent.minutes)
        assertEquals(listOf(request), fixture.api.snoozeCalls)
        assertEquals("No connection. Changes are not confirmed.", model.state.value.error)
        assertReminderDataUnchanged(before)
        assertEquals(item, model.state.value.snoozing)
        assertEquals(10, model.state.value.snoozeMinutes)

        val calls = fixture.api.calls
        model.closeSnooze(); model.snoozeChoice(60); model.snooze(); model.refresh()
        assertEquals(calls, fixture.api.calls)
        assertEquals(command, model.state.value.pending)
        assertEquals(item, model.state.value.snoozing)
        assertEquals(10, model.state.value.snoozeMinutes)
        assertReminderDataUnchanged(before)

        fixture.api.loseCommandAnswer = false
        whileCommandAnswerIsHeld({ model.retry() }) {
            assertReminderDataUnchanged(before)
            assertEquals(command, model.state.value.pending)
        }
        assertEquals(listOf(request, request), fixture.api.snoozeCalls)
        assertEquals(listOf(confirmed), model.state.value.inbox)
        assertEquals(0, model.state.value.unreadCount)
        assertNull(model.state.value.inbox.single().acknowledgedAt)
        assertNull(model.state.value.snoozing)
        assertNull(model.state.value.snoozeMinutes)
        assertNull(model.state.value.pending)
        assertNull(model.state.value.error)
        assertTrue(model.state.value.notice!!.startsWith("Snoozed until "))
        model.retry(); idle()
        assertEquals(2, fixture.api.snoozeCalls.size)
        assertEquals(0, model.state.value.unreadCount)
        assertTrue(fixture.api.actions.isEmpty())
    }

    @Test fun snoozeConflictsDoNotChangeShownStateOrAllowBlindRetry() = runBlocking {
        refuseSnooze(409)
    }

    @Test fun snoozePreconditionFailuresDoNotChangeShownStateOrAllowBlindRetry() = runBlocking {
        refuseSnooze(412)
    }

    private data class SeriesCase(
        val operation: SeriesOperation, val before: ReminderSeriesDto, val after: ReminderSeriesDto, val notice: String,
    )
    private val pausedSeries = fixture.series.copy(status = "paused", reason = "by_person", nextOccurrence = null)
    private val cancelledSeries = fixture.series.copy(status = "cancelled", nextOccurrence = null)
    private val seriesCases = listOf(
        SeriesCase(SeriesOperation.PAUSE, fixture.series, pausedSeries, "Repeating reminder paused."),
        SeriesCase(SeriesOperation.RESUME, pausedSeries, fixture.series, "Repeating reminder resumed."),
        SeriesCase(SeriesOperation.SKIP, fixture.series, fixture.series.copy(nextOccurrence = fixture.series.nextOccurrence!!.copy(
            reminderId = fixture.otherId, localDate = "2026-11-02", scheduledAt = "2026-11-02T02:30:00Z")), "Next reminder skipped."),
        SeriesCase(SeriesOperation.CANCEL, fixture.series, cancelledSeries, "Repeating reminder cancelled."),
        SeriesCase(SeriesOperation.CANCEL, pausedSeries, cancelledSeries, "Repeating reminder cancelled."),
    )

    private fun prepareSeries(case: SeriesCase): ReminderSeriesDto {
        model.bind(null)
        fixture.api.failure = 0
        fixture.offerSeries()
        fixture.api.seriesValue = case.before
        fixture.api.seriesItems = listOf(case.before, fixture.series.copy(id = fixture.otherId))
        val confirmed = case.after.copy(version = "2", etag = "\"series-2\"")
        fixture.api.seriesResult = confirmed
        return confirmed
    }

    private fun assertReminderDataUnchanged(before: ReminderWorkspaceState) {
        val current = model.state.value
        assertEquals(before.series, current.series)
        assertEquals(before.reminders, current.reminders)
        assertEquals(before.inbox, current.inbox)
        assertEquals(before.unreadCount, current.unreadCount)
        assertEquals(before.preferences, current.preferences)
        assertNull(current.notice)
    }

    private suspend fun whileCommandAnswerIsHeld(command: () -> Unit, check: () -> Unit) {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        fixture.api.commandEntered = entered
        fixture.api.commandGate = release
        try {
            command()
            withTimeout(5000) { entered.await() }
            assertTrue(model.state.value.busy)
            check()
        } finally {
            release.complete(Unit)
            idle()
            fixture.api.commandEntered = null
            fixture.api.commandGate = null
        }
    }

    private suspend fun confirmSeriesControl(case: SeriesCase) {
        val confirmed = prepareSeries(case)
        start()
        val before = model.state.value
        val calls = fixture.api.seriesCalls.size
        model.proposeSeries(case.before, case.operation)
        assertTrue(model.state.value.confirmation is ReminderCommand.Series)
        assertNull(model.state.value.pending)
        assertEquals(calls, fixture.api.seriesCalls.size)
        assertReminderDataUnchanged(before)
        model.cancelConfirmation(); model.confirm(); idle()
        assertNull(model.state.value.confirmation)
        assertEquals(calls, fixture.api.seriesCalls.size)
        assertReminderDataUnchanged(before)

        model.proposeSeries(case.before, case.operation)
        val command = model.state.value.confirmation as ReminderCommand.Series
        assertEquals(fixture.accountId, command.intent.accountId)
        assertEquals(case.before, command.intent.series)
        assertEquals(case.operation, command.intent.operation)
        model.confirm(); idle()
        assertEquals(listOf(ReminderRepositoryTest.SeriesCommandCall(command.intent.requestKey, case.before.etag, case.before.id, case.operation.wireValue, emptyMap())),
            fixture.api.seriesCalls.drop(calls))
        assertEquals(before.series.map { if (it.id == confirmed.id) confirmed else it }, model.state.value.series)
        assertEquals(case.notice, model.state.value.notice)
        assertNull(model.state.value.error)
        assertNull(model.state.value.pending)
        assertNull(model.state.value.confirmation)
        assertTrue(fixture.api.actions.isEmpty())
    }

    private suspend fun refuseSeriesControls(status: Int) {
        for (case in seriesCases) {
            prepareSeries(case); start()
            val before = model.state.value
            val calls = fixture.api.seriesCalls.size
            model.proposeSeries(case.before, case.operation)
            val command = model.state.value.confirmation as ReminderCommand.Series
            fixture.api.failure = status
            model.confirm(); idle()
            assertEquals(listOf(ReminderRepositoryTest.SeriesCommandCall(command.intent.requestKey, case.before.etag, case.before.id, case.operation.wireValue, emptyMap())),
                fixture.api.seriesCalls.drop(calls))
            assertReminderDataUnchanged(before)
            assertEquals(before.series, fixture.api.seriesItems)
            assertEquals(case.before, fixture.api.seriesValue)
            assertEquals("Synthetic failure", model.state.value.error)
            assertNull(model.state.value.pending)
            assertNull(model.state.value.confirmation)

            fixture.api.failure = 0
            val allCalls = fixture.api.calls
            model.retry(); model.confirm(); idle()
            assertEquals(allCalls, fixture.api.calls)
            assertReminderDataUnchanged(before)

            val refreshed = case.before.copy(version = "2", etag = "\"series-2\"")
            val confirmed = case.after.copy(version = "3", etag = "\"series-3\"")
            fixture.api.seriesValue = refreshed
            fixture.api.seriesItems = before.series.map { if (it.id == refreshed.id) refreshed else it }
            fixture.api.seriesResult = confirmed
            model.refresh(); idle()
            model.proposeSeries(refreshed, case.operation)
            val reviewed = model.state.value.confirmation as ReminderCommand.Series
            assertTrue(command.intent.requestKey != reviewed.intent.requestKey)
            assertEquals(calls + 1, fixture.api.seriesCalls.size)
            assertNull(model.state.value.notice)
            model.confirm(); idle()
            assertEquals(calls + 2, fixture.api.seriesCalls.size)
            assertEquals(ReminderRepositoryTest.SeriesCommandCall(reviewed.intent.requestKey, refreshed.etag, refreshed.id, case.operation.wireValue, emptyMap()),
                fixture.api.seriesCalls.last())
            assertEquals(before.series.map { if (it.id == confirmed.id) confirmed else it }, model.state.value.series)
            assertEquals(case.notice, model.state.value.notice)
            assertNull(model.state.value.error)
            assertNull(model.state.value.pending)
        }
    }

    private suspend fun refuseSnooze(status: Int) {
        fixture.offerSnooze(Instant.now().plusSeconds(7200).toString()); start()
        val before = model.state.value
        val item = before.inbox.single()
        model.openSnooze(item); model.snoozeChoice(10)
        fixture.api.failure = status
        model.snooze(); idle()
        val request = fixture.api.snoozeCalls.single()
        assertEquals(item.id, request.identifier)
        assertEquals(SnoozeDto(10), request.body)
        assertReminderDataUnchanged(before)
        assertEquals(item, fixture.api.notificationValue)
        assertEquals(1, fixture.api.unread)
        assertEquals("Synthetic failure", model.state.value.error)
        assertNull(model.state.value.pending)
        assertNull(model.state.value.snoozing)
        assertNull(model.state.value.snoozeMinutes)

        fixture.api.failure = 0
        val calls = fixture.api.calls
        model.retry(); model.snooze(); idle()
        assertEquals(calls, fixture.api.calls)
        assertReminderDataUnchanged(before)

        val confirmed = item.copy(readAt = "2026-11-01T06:32:00Z", canSnooze = false, snoozedUntil = "2026-11-01T07:32:00Z")
        fixture.api.snoozeValue = confirmed
        model.openSnooze(item); model.snoozeChoice(60)
        assertEquals(1, fixture.api.snoozeCalls.size)
        assertReminderDataUnchanged(before)
        model.snooze(); idle()
        assertEquals(2, fixture.api.snoozeCalls.size)
        val reviewed = fixture.api.snoozeCalls.last()
        assertTrue(request.key != reviewed.key)
        assertEquals(item.id, reviewed.identifier)
        assertEquals(SnoozeDto(60), reviewed.body)
        assertEquals(listOf(confirmed), model.state.value.inbox)
        assertEquals(0, model.state.value.unreadCount)
        assertNull(model.state.value.pending)
        assertNull(model.state.value.snoozing)
        assertNull(model.state.value.snoozeMinutes)
        assertNull(model.state.value.error)
        assertTrue(model.state.value.notice!!.startsWith("Snoozed until "))
        assertTrue(fixture.api.actions.isEmpty())
    }

    @Test fun theSameInvalidDateAndTimeIncrementsTheMessageIdEachTime() = runBlocking {
        start()
        model.fields("2026-02-30", "08:00", fixture.request.timezone)
        val initialMessageId = model.state.value.messageId
        repeat(2) { attempt ->
            model.preview()
            assertEquals("Select a valid date and time.", model.state.value.error)
            assertEquals(initialMessageId + attempt + 1L, model.state.value.messageId)
        }
    }
}