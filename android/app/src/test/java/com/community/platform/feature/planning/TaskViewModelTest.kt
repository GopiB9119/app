package com.community.platform.feature.planning

import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.identity.UserDto
import com.google.gson.Gson
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.time.LocalDate
import java.time.YearMonth
import java.util.concurrent.atomic.AtomicInteger

@OptIn(ExperimentalCoroutinesApi::class)
class TaskViewModelTest {
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val taskId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
    private val token = "synthetic-session-token-with-more-than-32-characters"
    private val user = UserDto(accountId, "alex@example.test", "Alex", "UTC", true, 1)
    private val store = AccountRepositoryTest.MemoryStore().apply { save(Credentials(token, accountId)) }
    private val accounts = AccountRepository(AccountRepositoryTest.FakeApi(user, token), store, Gson())
    private val task = FamilyTaskDto(taskId, spaceId, "Groceries", "Fruit", "2026-09-21", "open", null, false, accountId, null, null, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", "1", TaskPermissionsDto(true, listOf("in_progress", "completed", "cancelled")), "\"original-etag\"")
    private val fake = TaskRepositoryTest.FakeTasks(task)
    private var viewModel: TaskViewModel? = null
    private var calendarModel: CalendarViewModel? = null

    @Before fun dispatcher() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() = runBlocking {
        try { finishTestWork() } finally { Dispatchers.resetMain() }
    }

    private suspend fun finishTestWork() {
        viewModel?.bind(null)
        calendarModel?.bind(null)
        withTimeout(5000) {
            listOfNotNull(viewModel, calendarModel).forEach { model ->
                model.viewModelScope.coroutineContext[Job]?.cancelAndJoin()
            }
        }
    }

    private suspend fun ready(api: TaskApi = fake): TaskViewModel {
        val model = TaskViewModel(TaskRepository(api, accounts))
        viewModel = model
        model.bind(accountId)
        withTimeout(5000) { model.state.first { !it.busy && it.selectedSpace != null } }
        return model
    }

    private suspend fun settled(model: TaskViewModel): TaskWorkspaceState = withTimeout(5000) { model.state.first { !it.busy } }

    @Test fun calendarMonthZoneAndRefreshFailureNeverRetainVisibleRows() = runBlocking {
        var failure = false
        val queries = mutableListOf<Pair<String, String>>()
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<CalendarEntryDto>>> {
                if (failure) throw IOException("Synthetic offline")
                queries.add(startDate to timezone)
                val entry = CalendarEntryDto(taskId, "task", taskId, spaceId, "Due task", startDate, null, null, "open", false)
                return Response.success(EnvelopeDto(listOf(entry), null, PaginationDto(null, false)))
            }
        }
        val model = CalendarViewModel(CalendarRepository(api, accounts), TaskRepository(fake, accounts))
        calendarModel = model
        model.bind(accountId, "Asia/Kolkata")
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        model.selectMonth(YearMonth.of(2028, 2))
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        assertEquals("2028-02-01", model.state.value.entries.single().date)
        model.selectTimezone("UTC")
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        assertEquals("2028-02-01" to "UTC", queries.last())
        failure = true
        model.refresh()
        withTimeout(5000) { model.state.first { !it.busy && it.error != null } }
        assertTrue(model.state.value.entries.isEmpty())
        assertTrue(!model.state.value.loaded)
        assertNull(model.state.value.nextCursor)
        assertTrue(fake.keys.isEmpty())
    }

    // DEC-031 (T163): week and day views ask only for their dates; hiding a source changes the display, not the request.
    @Test fun calendarViewsAskForTheirOwnDatesAndHidingASourceOnlyChangesTheDisplay() = runBlocking {
        val queries = mutableListOf<Pair<String, String>>()
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<CalendarEntryDto>>> {
                queries.add(startDate to endDate)
                val due = CalendarEntryDto(taskId, "task", taskId, spaceId, "Due task", startDate, null, null, "open", false)
                val reminder = CalendarEntryDto("81a09cbf-901e-470c-a905-27d565be91ae", "reminder", taskId, spaceId, "Call", endDate, "${endDate}T06:00:00Z", "UTC", "scheduled", false)
                return Response.success(EnvelopeDto(listOf(due, reminder), null, PaginationDto(null, false)))
            }
        }
        val model = CalendarViewModel(CalendarRepository(api, accounts), TaskRepository(fake, accounts))
        calendarModel = model
        model.bind(accountId, "UTC")
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        model.selectMonth(YearMonth.of(2028, 2))
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        model.selectView(CalendarView.WEEK)
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        assertEquals(LocalDate.of(2028, 2, 1), model.state.value.day)
        model.selectDay(LocalDate.of(2028, 2, 29))
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        model.selectView(CalendarView.DAY)
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        val asked = queries.size
        model.toggleSource("reminder")
        assertEquals(listOf("task"), model.state.value.shown.map { it.kind })
        assertEquals(2, model.state.value.entries.size)
        model.toggleSource("planned")
        assertEquals(setOf("reminder"), model.state.value.hidden)
        model.toggleSource("reminder")
        assertEquals(listOf("task", "reminder"), model.state.value.shown.map { it.kind })
        assertEquals("Showing or hiding a source asks the server nothing.", asked, queries.size)
        model.selectView(CalendarView.MONTH)
        withTimeout(5000) { model.state.first { it.loaded && !it.busy } }
        assertEquals(YearMonth.of(2028, 2), model.state.value.month)
        assertEquals(listOf("2028-02-01" to "2028-02-29", "2028-01-30" to "2028-02-05", "2028-02-27" to "2028-03-04", "2028-02-29" to "2028-02-29", "2028-02-01" to "2028-02-29"), queries.drop(1))
    }

    @Test fun calendarAccountChangeDiscardsAnInFlightPage() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val released = CompletableDeferred<Unit>()
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<CalendarEntryDto>>> {
                entered.complete(Unit)
                released.await()
                return Response.success(EnvelopeDto(listOf(CalendarEntryDto(taskId, "task", taskId, spaceId, "Private", startDate, null, null, "open", false)), null, PaginationDto(null, false)))
            }
        }
        val model = CalendarViewModel(CalendarRepository(api, accounts), TaskRepository(fake, accounts))
        calendarModel = model
        model.bind(accountId)
        withTimeout(5000) { entered.await() }
        model.bind(null)
        released.complete(Unit)
        assertNull(model.state.value.accountId)
        assertTrue(model.state.value.entries.isEmpty())
        assertTrue(model.state.value.spaces.isEmpty())
        assertTrue(!model.state.value.busy)
    }

    @Test fun cleanupAwaitsCancelledCalendarWork() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val finished = CompletableDeferred<Unit>()
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<CalendarEntryDto>>> {
                entered.complete(Unit)
                try { awaitCancellation() } finally { finished.complete(Unit) }
            }
        }
        val model = CalendarViewModel(CalendarRepository(api, accounts), TaskRepository(fake, accounts))
        calendarModel = model
        model.bind(accountId)
        withTimeout(5000) { entered.await() }

        finishTestWork()

        assertTrue(finished.isCompleted)
        assertTrue(model.viewModelScope.coroutineContext[Job]!!.isCompleted)
    }

    @Test fun calendarRevokedSessionClearsSourcesAndRequiresSignIn() = runBlocking {
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<CalendarEntryDto>>> {
                throw com.community.platform.feature.identity.IdentityFailure("AUTHENTICATION_REQUIRED", "Sign in again.", 401)
            }
        }
        val model = CalendarViewModel(CalendarRepository(api, accounts), TaskRepository(fake, accounts))
        calendarModel = model
        model.bind(accountId)
        withTimeout(5000) { model.state.first { !it.busy && it.requiresSignIn } }
        assertTrue(model.state.value.entries.isEmpty())
        assertTrue(model.state.value.spaces.isEmpty())
        assertNull(model.state.value.selectedSpace)
    }

    @Test fun spaceEntryOpensTheRequestedFamilyInsteadOfTheFirstFamily() = runBlocking {
        val otherSpace = FamilySpaceDto("9cae5909-dbb6-4679-9e35-12dd4e47e73b", "Other family", "owner")
        val requestedSpace = FamilySpaceDto(spaceId, "Requested family", "member")
        val api = object : TaskApi by fake {
            override suspend fun spaces(authorization: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<FamilySpaceDto>>> =
                Response.success(EnvelopeDto(listOf(otherSpace, requestedSpace), null, PaginationDto(null, false)))
        }
        val model = TaskViewModel(TaskRepository(api, accounts))
        viewModel = model
        model.bind(accountId, spaceId)
        val state = settled(model)
        assertEquals(requestedSpace, state.selectedSpace)
        assertEquals(spaceId, state.tasks.single().task.spaceId)
        assertNull(state.error)
    }

    @Test fun unavailableSpaceEntryCannotFallBackToAnotherFamiliesTasks() = runBlocking {
        var taskReads = 0
        val api = object : TaskApi by fake {
            override suspend fun tasks(authorization: String, spaceId: String, limit: Int, cursor: String?, status: String?, assignee: String?, dueFrom: String?, dueTo: String?): Response<EnvelopeDto<List<FamilyTaskDto>>> {
                taskReads += 1
                return fake.tasks(authorization, spaceId, limit, cursor, status, assignee, dueFrom, dueTo)
            }
        }
        val model = TaskViewModel(TaskRepository(api, accounts))
        viewModel = model
        model.bind(accountId, "9cae5909-dbb6-4679-9e35-12dd4e47e73b")
        val state = settled(model)
        assertEquals(0, taskReads)
        assertNull(state.selectedSpace)
        assertTrue(state.tasks.isEmpty())
        assertNotNull(state.error)
    }

    // DEC-029: filter choices become exact service filters, counted from the phone's day.
    @Test fun assigneeAndDueChoicesSendExactFiltersAndAPriorityEditSendsOnlyThePriority() = runBlocking {
        val model = ready()
        model.today = { java.time.LocalDate.parse("2026-10-02") }
        model.filterAssignee("me"); settled(model)
        assertEquals(listOf(null, accountId, null, null), fake.filters)
        model.filterDue("week"); settled(model)
        assertEquals(listOf(null, accountId, "2026-10-02", "2026-10-08"), fake.filters)
        model.filterAssignee("none"); settled(model)
        model.filterDue("before"); settled(model)
        assertEquals(listOf(null, "none", null, "2026-10-01"), fake.filters)
        model.filterAssignee("someone"); model.filterDue("tomorrow"); settled(model)
        assertEquals("none", model.state.value.assigneeFilter)
        assertEquals("before", model.state.value.dueFilter)
        model.filterAssignee(null); settled(model)
        model.filterDue(null); settled(model)
        assertEquals(listOf<String?>(null, null, null, null), fake.filters)

        model.edit(model.state.value.tasks.single()); settled(model)
        val editor = model.state.value.editor!!
        assertEquals("normal", editor.fields.priority)
        model.updateFields(editor.fields.copy(priority = "high"))
        assertTrue(model.state.value.editor!!.dirty)
        model.save(); settled(model)
        assertEquals("high", fake.patch!!["priority"])
        assertTrue("assignee_account_id" !in fake.patch!!)
    }

    @Test fun aSavedTaskThatNoLongerMatchesTheFiltersLeavesTheList() = runBlocking {
        val model = ready()
        model.today = { java.time.LocalDate.parse("2026-09-21") }
        model.filterDue("today"); settled(model)
        assertEquals(1, model.state.value.tasks.size)
        model.edit(model.state.value.tasks.single()); settled(model)
        fake.task = task.copy(dueDate = "2026-09-30", version = "2")
        model.updateFields(model.state.value.editor!!.fields.copy(dueDate = "2026-09-30"))
        model.save(); settled(model)
        assertTrue(model.state.value.tasks.isEmpty())
        assertEquals("2026-09-30", model.state.value.detail!!.task.dueDate)
    }

    @Test fun uncertainCreateRetainsAnImmutableCommandForExplicitRetry() = runBlocking {
        val model = ready()
        model.create(); settled(model)
        val fields = TaskFields("Buy groceries", "Fruit", "2026-09-21", null)
        model.updateFields(fields)
        fake.failure = 503
        model.save()
        val failed = settled(model)
        assertNotNull(failed.pendingCommand)
        assertNull(failed.notice)
        val command = failed.pendingCommand
        model.updateFields(fields.copy(title = "Changed after timeout"))
        model.refresh()
        model.save()
        assertEquals(command, model.state.value.pendingCommand)
        assertEquals(fields, model.state.value.editor?.fields)
        assertEquals(1, fake.keys.size)
        fake.failure = 0
        model.retry()
        val saved = settled(model)
        assertNull(saved.pendingCommand)
        assertNull(saved.editor)
        assertEquals("Task saved.", saved.notice)
        assertEquals(listOf(command!!.requestKey, command.requestKey), fake.keys)
    }

    @Test fun staleEditRetainsDraftAndRequiresExplicitReloadBeforeAnotherSave() = runBlocking {
        val model = ready()
        model.edit(model.state.value.tasks.single()); settled(model)
        model.updateFields(model.state.value.editor!!.fields.copy(description = "Unsaved notes"))
        fake.failure = 412
        model.save()
        val failed = settled(model)
        assertTrue(failed.conflict)
        assertNull(failed.pendingCommand)
        assertEquals("Unsaved notes", failed.editor?.fields?.description)
        model.save()
        assertEquals(1, fake.keys.size)
        fake.failure = 0
        model.reloadLatest()
        val reloaded = settled(model)
        assertEquals("Fruit", reloaded.editor?.fields?.description)
        assertTrue(!reloaded.conflict)
    }

    @Test fun statusNeedsConfirmationAndUsesTheDisplayedEtag() = runBlocking {
        val model = ready()
        val record = model.state.value.tasks.single()
        model.proposeStatus(record, "completed")
        assertNotNull(model.state.value.confirmation)
        assertTrue(fake.keys.isEmpty())
        model.cancelStatus()
        assertTrue(fake.keys.isEmpty())
        model.proposeStatus(record, "completed")
        model.confirmStatus()
        settled(model)
        assertEquals(listOf(record.etag), fake.etags)
        assertEquals(1, fake.keys.size)
    }

    // Without the app-wide request lock (T82), a read sent beside a status change could answer after it and show the old status.
    @Test fun aRefreshDuringAnUnansweredStatusChangeIsNotSent() = runBlocking {
        val reached = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val reads = AtomicInteger()
        val api = object : TaskApi by fake {
            override suspend fun tasks(authorization: String, spaceId: String, limit: Int, cursor: String?, status: String?, assignee: String?, dueFrom: String?, dueTo: String?): Response<EnvelopeDto<List<FamilyTaskDto>>> {
                reads.incrementAndGet()
                return fake.tasks(authorization, spaceId, limit, cursor, status, assignee, dueFrom, dueTo)
            }
            override suspend fun read(authorization: String, taskId: String): Response<EnvelopeDto<FamilyTaskDto>> {
                reads.incrementAndGet()
                return fake.read(authorization, taskId)
            }
            override suspend fun status(authorization: String, taskId: String, key: String, etag: String, body: TaskStatusDto): Response<EnvelopeDto<FamilyTaskDto>> {
                reached.complete(Unit)
                release.await()
                return fake.status(authorization, taskId, key, etag, body)
            }
        }
        val model = ready(api)
        val loaded = reads.get()
        val record = model.state.value.tasks.single()
        model.proposeStatus(record, "completed"); model.confirmStatus()
        withTimeout(5000) { reached.await() }
        model.refresh(); model.loadMore(); model.open(record); model.filter("open")
        release.complete(Unit)
        val state = settled(model)
        // A read sent beside the change may still be queued when the screen settles, so give it time to show up.
        assertNull(withTimeoutOrNull(2000) { while (reads.get() == loaded) delay(10) })
        assertEquals(loaded, reads.get())
        assertEquals("Task status saved.", state.notice)
        assertNull(model.state.value.statusFilter)
    }

    @Test fun authenticationFailureClearsPrivateTaskState() = runBlocking {
        val model = ready()
        fake.failure = 401
        model.refresh()
        val state = settled(model)
        assertTrue(state.requiresSignIn)
        assertTrue(state.tasks.isEmpty())
        assertTrue(state.spaces.isEmpty())
        assertNull(store.load())
    }

    @Test fun accountSwitchDiscardsLateReadResultsWithoutAReplacementRequest() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api = object : TaskApi by fake {
            override suspend fun tasks(authorization: String, spaceId: String, limit: Int, cursor: String?, status: String?, assignee: String?, dueFrom: String?, dueTo: String?): Response<EnvelopeDto<List<FamilyTaskDto>>> {
                entered.complete(Unit)
                release.await()
                return fake.tasks(authorization, spaceId, limit, cursor, status, assignee, dueFrom, dueTo)
            }
        }
        val model = TaskViewModel(TaskRepository(api, accounts))
        viewModel = model
        model.bind(accountId)
        withTimeout(5000) { entered.await() }
        model.bind(null)
        release.complete(Unit)
        assertEquals(TaskWorkspaceState(), model.state.value)
        assertTrue(fake.keys.isEmpty())
    }

    @Test fun rejectedSaveUnlocksTheEditorButNeverClaimsSuccess() = runBlocking {
        val model = ready()
        model.create(); settled(model)
        model.updateFields(TaskFields("Groceries", "", null, null))
        fake.failure = 422
        model.save()
        val failed = settled(model)
        assertNull(failed.pendingCommand)
        assertNotNull(failed.editor)
        assertNotNull(failed.error)
        assertNull(failed.notice)
    }

    @Test fun networkFailureNeverQueuesAnAutomaticRetry() = runBlocking {
        var writes = 0
        val api = object : TaskApi by fake {
            override suspend fun create(authorization: String, key: String, body: CreateTaskDto): Response<EnvelopeDto<FamilyTaskDto>> {
                writes += 1
                throw IOException("Synthetic outage")
            }
        }
        val model = ready(api)
        model.create(); settled(model)
        model.updateFields(TaskFields("Groceries", "", null, null))
        model.save()
        val failed = settled(model)
        assertNotNull(failed.pendingCommand)
        model.refresh()
        assertEquals(1, writes)
        assertNull(failed.notice)
    }

    @Test fun theSameInvalidTaskTitleIncrementsTheMessageIdEachTime() = runBlocking {
        val model = ready()
        model.create(); settled(model)
        model.updateFields(TaskFields("x".repeat(201), "", null, null))
        val initialMessageId = model.state.value.messageId
        repeat(2) { attempt ->
            model.save()
            assertEquals("Use a title of 1 to 200 characters and notes of at most 5,000 characters.", model.state.value.error)
            assertEquals(initialMessageId + attempt + 1L, model.state.value.messageId)
        }
    }
}