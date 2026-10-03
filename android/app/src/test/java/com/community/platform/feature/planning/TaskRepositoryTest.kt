package com.community.platform.feature.planning

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.identity.SessionStore
import com.community.platform.feature.identity.UserDto
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.Headers.Companion.headersOf
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.time.LocalDate
import java.time.YearMonth
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TaskRepositoryTest {
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val taskId = "c2302436-0dd7-4d99-a7c3-ead390fd08eb"
    private val user = UserDto(accountId, "alex@example.test", "Alex", "UTC", true, 1)
    private val token = "synthetic-session-token-with-more-than-32-characters"
    private val store = AccountRepositoryTest.MemoryStore().apply { save(Credentials(token, accountId)) }
    private val identity = AccountRepository(AccountRepositoryTest.FakeApi(user, token), store, Gson())
    private val task = FamilyTaskDto(taskId, spaceId, "Groceries", "Fruit", "2026-09-21", "open", null, false, accountId, null, null, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", "1", TaskPermissionsDto(true, listOf("in_progress", "completed", "cancelled")), "\"original-etag\"")
    private val fake = FakeTasks(task)
    private val repository = TaskRepository(fake, identity)

    @Test fun calendarChecksDateOnlyScopeCursorAndReminderLocalDay(): Unit = runBlocking {
        var entries = listOf(CalendarEntryDto(taskId, "task", taskId, spaceId, "Due task", "2026-09-21", null, null, "open", false))
        var pagination = PaginationDto(null, false)
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<CalendarEntryDto>>> {
                assertEquals("Bearer $token", authorization)
                assertEquals("2026-09-01", startDate)
                assertEquals("2026-09-30", endDate)
                assertEquals(20, limit)
                return Response.success(EnvelopeDto(data = entries, error = null, pagination = pagination))
            }
        }
        val calendar = CalendarRepository(api, identity)
        val month = YearMonth.of(2026, 9)
        assertEquals("2026-09-21", calendar.entries(accountId, spaceId, month, "UTC").items.single().date)
        val original = entries.single()
        for (invalid in listOf(original.copy(spaceId = accountId), original.copy(taskId = spaceId), original.copy(date = "2026-10-01"), original.copy(scheduledAt = "2026-09-21T00:00:00Z"))) {
            entries = listOf(invalid)
            assertThrows(IdentityFailure::class.java) { runBlocking { calendar.entries(accountId, spaceId, month, "UTC") } }
        }
        entries = listOf(original, original)
        assertThrows(IdentityFailure::class.java) { runBlocking { calendar.entries(accountId, spaceId, month, "UTC") } }
        entries = listOf(original.copy(kind = "reminder", status = "scheduled", scheduledAt = "2026-09-20T18:45:00Z", timezone = "Asia/Kolkata"))
        assertEquals("2026-09-21", calendar.entries(accountId, spaceId, month, "Asia/Kolkata").items.single().date)
        assertThrows(IdentityFailure::class.java) { runBlocking { calendar.entries(accountId, spaceId, month, "UTC") } }
        pagination = PaginationDto("same", true)
        assertThrows(IdentityFailure::class.java) { runBlocking { calendar.entries(accountId, spaceId, month, "Asia/Kolkata", "same") } }
    }

    @Test fun calendarAcceptsPlannedRepeatingTimesInServerOrderOnly(): Unit = runBlocking {
        val seriesId = "5b0a7e0c-2f55-4b5e-9d0e-7b1d6f3c2a11"
        val due = CalendarEntryDto(taskId, "task", taskId, spaceId, "Due task", "2026-09-21", null, null, "open", false)
        val stored = CalendarEntryDto("81a09cbf-901e-470c-a905-27d565be91ae", "reminder", taskId, spaceId, "Water plants", "2026-09-21", "2026-09-21T02:30:00Z", "Asia/Kolkata", "scheduled", false, seriesId)
        val planned = CalendarEntryDto("0e0f5a5c-7a4e-5f59-9d8c-3f1f8f0b6a21", "planned", taskId, spaceId, "Water plants", "2026-09-21", "2026-09-21T03:00:00Z", "Asia/Kolkata", "planned", false, seriesId)
        var entries = listOf(due, stored, planned)
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?) =
                Response.success(EnvelopeDto(data = entries, error = null, pagination = PaginationDto(null, false)))
        }
        val calendar = CalendarRepository(api, identity)
        val month = YearMonth.of(2026, 9)
        assertEquals(listOf("task", "reminder", "planned"), calendar.entries(accountId, spaceId, month, "UTC").items.map { it.kind })
        entries = listOf(due, planned.copy(scheduledAt = "2026-09-21T02:00:00Z"), stored)
        assertEquals(listOf("task", "planned", "reminder"), calendar.entries(accountId, spaceId, month, "UTC").items.map { it.kind })
        for (invalid in listOf(listOf(planned, due), listOf(planned.copy(seriesId = null)), listOf(planned.copy(status = "scheduled")),
            listOf(planned.copy(seriesId = "not-a-series")), listOf(due.copy(seriesId = seriesId)), listOf(planned.copy(kind = "event")))) {
            entries = invalid
            assertThrows(IdentityFailure::class.java) { runBlocking { calendar.entries(accountId, spaceId, month, "UTC") } }
        }
    }

    // DEC-031 (T163): a week or a day asks for exactly its own dates and refuses entries outside them.
    @Test fun calendarWeekAndDayAskForTheirOwnDatesAndRefuseEntriesOutsideThem(): Unit = runBlocking {
        val asked = mutableListOf<Pair<String, String>>()
        var date = "2026-10-14"
        val api = object : CalendarApi {
            override suspend fun entries(authorization: String, spaceId: String, startDate: String, endDate: String, timezone: String, limit: Int, cursor: String?): Response<EnvelopeDto<List<CalendarEntryDto>>> {
                asked += startDate to endDate
                return Response.success(EnvelopeDto(data = listOf(CalendarEntryDto(taskId, "task", taskId, spaceId, "Due task", date, null, null, "open", false)), error = null, pagination = PaginationDto(null, false)))
            }
        }
        val calendar = CalendarRepository(api, identity)
        val (start, end) = calendarRange(CalendarView.WEEK, YearMonth.of(2026, 10), LocalDate.of(2026, 10, 14))
        assertEquals(LocalDate.of(2026, 10, 11) to LocalDate.of(2026, 10, 17), start to end)
        assertEquals("2026-10-14", calendar.entries(accountId, spaceId, start, end, "UTC").items.single().date)
        assertEquals(listOf("2026-10-11" to "2026-10-17"), asked)
        for (outside in listOf("2026-10-10", "2026-10-18")) {
            date = outside
            assertThrows(IdentityFailure::class.java) { runBlocking { calendar.entries(accountId, spaceId, start, end, "UTC") } }
        }
        asked.clear()
        for ((first, last) in listOf(LocalDate.of(2026, 10, 1) to LocalDate.of(2026, 11, 1), LocalDate.of(2026, 10, 17) to LocalDate.of(2026, 10, 11), LocalDate.of(1899, 12, 31) to LocalDate.of(1900, 1, 6))) {
            assertThrows(IllegalArgumentException::class.java) { runBlocking { calendar.entries(accountId, spaceId, first, last, "UTC") } }
        }
        assertTrue("Nothing is sent for a range the server would refuse.", asked.isEmpty())
        assertEquals(LocalDate.of(1900, 1, 1) to LocalDate.of(1900, 1, 6), calendarRange(CalendarView.WEEK, YearMonth.of(1900, 1), LocalDate.of(1900, 1, 3)))
        assertEquals(LocalDate.of(2100, 12, 26) to LocalDate.of(2100, 12, 31), calendarRange(CalendarView.WEEK, YearMonth.of(2100, 12), LocalDate.of(2100, 12, 31)))
        assertEquals(LocalDate.of(2027, 12, 26) to LocalDate.of(2028, 1, 1), calendarRange(CalendarView.WEEK, YearMonth.of(2027, 12), LocalDate.of(2027, 12, 30)))
        assertEquals(LocalDate.of(2028, 2, 29) to LocalDate.of(2028, 2, 29), calendarRange(CalendarView.DAY, YearMonth.of(2028, 2), LocalDate.of(2028, 2, 29)))
        assertEquals(LocalDate.of(2028, 2, 1) to LocalDate.of(2028, 2, 29), calendarRange(CalendarView.MONTH, YearMonth.of(2028, 2), LocalDate.of(2026, 10, 14)))
    }

    @Test fun calendarRetrofitEncodesScopeWithoutMutationOrForeignAccountAccess() = runBlocking {
        var captured: Request? = null
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            captured = chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body("""{"data":[],"request_id":"calendar","pagination":{"next_cursor":null,"has_more":false}}""".toResponseBody("application/json".toMediaType())).build()
        }.build()
        val calendar = CalendarRepository(IdentityModule.calendar(client, Gson()), identity)
        assertThrows(IdentityFailure::class.java) { runBlocking { calendar.entries(UUID.randomUUID().toString(), spaceId, YearMonth.of(2026, 9), "UTC") } }
        assertNull(captured)
        calendar.entries(accountId, spaceId, YearMonth.of(2026, 9), "Asia/Kolkata")
        assertEquals("GET", captured!!.method)
        assertEquals("/v1/calendar", captured!!.url.encodedPath)
        assertEquals(spaceId, captured!!.url.queryParameter("space_id"))
        assertEquals("Asia/Kolkata", captured!!.url.queryParameter("timezone"))
        assertNull(captured!!.body)
    }

    @Test fun taskPagePreservesCursorAndServerEtag() = runBlocking {
        fake.pagination = PaginationDto("next-page", true)
        val page = repository.tasks(accountId, spaceId)
        assertEquals("next-page", page.nextCursor)
        assertEquals("\"original-etag\"", page.items.single().etag)
        assertEquals(10, fake.limit)
        assertEquals("Bearer $token", fake.authorization)
    }

    // T153: an admin (DEC-018) saw no tasks or calendar at all, because the Space list refused the role.
    @Test fun anAdminsSpacesAreAccepted(): Unit = runBlocking {
        fake.spaceRole = "admin"
        assertEquals("admin", repository.spaces(accountId).items.single().role)
        fake.spaceRole = "guest"
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.spaces(accountId) } }
    }

    // DEC-029: priority is checked and sent; list filters reach the service unchanged.
    @Test fun priorityIsCheckedAndSentAndFiltersAreForwarded(): Unit = runBlocking {
        fake.task = task.copy(priority = "high")
        assertEquals("high", repository.tasks(accountId, spaceId, null, "open", TaskFilters("none", "2026-10-02", "2026-10-08")).items.single().task.priorityLevel)
        assertEquals(listOf("open", "none", "2026-10-02", "2026-10-08"), fake.filters)
        repository.tasks(accountId, spaceId)
        assertEquals(listOf<String?>(null, null, null, null), fake.filters)
        fake.task = task
        assertEquals("normal", repository.tasks(accountId, spaceId).items.single().task.priorityLevel)
        fake.task = task.copy(priority = "urgent")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.tasks(accountId, spaceId) } }
        fake.task = task
        repository.execute(CreateTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), TaskFields("Groceries", "", null, null, "low")))
        assertEquals("low", fake.creations.last().priority)
        val edit = EditTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), taskId, "\"version\"", TaskFields("Groceries", "", null, null, "high"), false)
        repository.execute(edit)
        assertFalse(fake.patch!!.containsKey("priority"))
        repository.execute(edit.copy(changePriority = true))
        assertEquals("high", fake.patch!!["priority"])
    }

    @Test fun aForeignAccountCannotIssueATaskRequest() = runBlocking {
        val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.tasks(UUID.randomUUID().toString(), spaceId) } }
        assertEquals("ACCOUNT_CHANGED", error.code)
        assertEquals(0, fake.calls)
    }

    @Test fun staleTaskEditDoesNotRetryOrInventANewEtag() = runBlocking {
        fake.failure = 412
        val command = EditTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), taskId, "\"old-version\"", TaskFields("Changed", "Notes", null, null), false)
        val error = assertThrows(IdentityFailure::class.java) { runBlocking { repository.execute(command) } }
        assertEquals(412, error.status)
        assertEquals(listOf(command.requestKey), fake.keys)
        assertEquals(listOf(command.etag), fake.etags)
        assertEquals(1, fake.calls)
    }

    @Test fun explicitRetryReusesTheImmutableCreationCommand() = runBlocking {
        val command = CreateTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), TaskFields("Groceries", "Fruit", "2026-09-21", null))
        fake.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.execute(command) } }
        assertEquals(1, fake.calls)
        fake.failure = 0
        assertEquals(taskId, repository.execute(command).task.id)
        assertEquals(listOf(command.requestKey, command.requestKey), fake.keys)
        assertEquals(fake.creations[0], fake.creations[1])
    }

    @Test fun changingNotesDoesNotSilentlyUnassignAnUnavailableMember() = runBlocking {
        val command = EditTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), taskId, "\"version\"", TaskFields("Title", "Changed notes", null, null), false)
        repository.execute(command)
        assertFalse(fake.patch!!.containsKey("assignee_account_id"))
        assertTrue(fake.patch!!.containsKey("due_date"))
    }

    @Test fun explicitClearingSendsNullForDateAndAssignment() = runBlocking {
        val command = EditTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), taskId, "\"version\"", TaskFields("Title", "Notes", null, null), true)
        repository.execute(command)
        assertTrue(fake.patch!!.containsKey("assignee_account_id"))
        assertNull(fake.patch!!["assignee_account_id"])
        val json = Gson().newBuilder().serializeNulls().create().toJson(fake.patch)
        assertTrue(json.contains("\"due_date\":null"))
        assertTrue(json.contains("\"assignee_account_id\":null"))
    }

    @Test fun unauthorizedTaskResponseClearsTheStoredSession() = runBlocking {
        fake.failure = 401
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.tasks(accountId, spaceId) } }
        assertNull(store.load())
    }

    @Test fun wrongSpaceAndMissingPageMetadataAreRejected(): Unit = runBlocking {
        fake.task = task.copy(spaceId = UUID.randomUUID().toString())
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.tasks(accountId, spaceId) } }
        fake.task = task
        fake.pagination = null
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.tasks(accountId, spaceId) } }
    }

    @Test fun partialCompletionMetadataIsRejected(): Unit = runBlocking {
        fake.task = task.copy(completedAt = "2026-09-19T11:00:00Z")
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.read(accountId, spaceId, taskId) } }
        fake.task = task.copy(status = "completed", completedByAccountId = accountId)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.read(accountId, spaceId, taskId) } }
    }

    // T100: the server counts a name in characters, an emoji counting once, so a name it accepted must not empty the list.
    @Test fun assigneeNamesAreCountedInCharactersAsTheServerCountsThem(): Unit = runBlocking {
        val emoji = "\uD83D\uDE00"
        val person = TaskAssigneeDto(UUID.randomUUID().toString(), emoji.repeat(80))
        fake.task = task.copy(assignee = person)
        assertEquals(emoji.repeat(80), repository.tasks(accountId, spaceId).items.single().task.assignee!!.displayName)
        fake.assigneeList = listOf(person)
        assertEquals(listOf(person), repository.assignees(accountId, spaceId))
        fake.task = task.copy(assignee = person.copy(displayName = emoji.repeat(81)))
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.tasks(accountId, spaceId) } }
        fake.assigneeList = listOf(person.copy(displayName = emoji.repeat(81)))
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.assignees(accountId, spaceId) } }
    }

    @Test fun retrofitWireRequestPreservesNullsPreconditionAndIdempotencyKey() = runBlocking {
        var captured: Request? = null
        var payload = ""
        val json = """{"data":{"id":"$taskId","space_id":"$spaceId","title":"Groceries","description":"Fruit","due_date":null,"status":"open","assignee":null,"assignee_unavailable":false,"created_by_account_id":"$accountId","completed_by_account_id":null,"completed_at":null,"created_at":"2026-09-19T10:00:00Z","updated_at":"2026-09-19T11:00:00Z","version":"2","permissions":{"can_edit":true,"allowed_statuses":["in_progress","completed","cancelled"]}},"request_id":"synthetic-request"}"""
        val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
            captured = chain.request()
            val bytes = Buffer()
            chain.request().body!!.writeTo(bytes)
            payload = bytes.readUtf8()
            okhttp3.Response.Builder().request(chain.request()).code(200).message("Synthetic")
                .protocol(Protocol.HTTP_1_1).header("ETag", "\"updated-view\"")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }.build()
        val transport = TaskRepository(IdentityModule.tasks(client, Gson()), identity)
        val command = EditTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), taskId, "\"old-view\"", TaskFields("Groceries", "Fruit", null, null), true)
        val result = transport.execute(command)
        assertEquals("PATCH", captured!!.method)
        assertEquals("/v1/tasks/$taskId", captured!!.url.encodedPath)
        assertEquals(command.requestKey, captured!!.header("Idempotency-Key"))
        assertEquals(command.etag, captured!!.header("If-Match"))
        assertEquals("Bearer $token", captured!!.header("Authorization"))
        val encoded = JsonParser.parseString(payload).asJsonObject
        assertEquals(setOf("title", "description", "due_date", "assignee_account_id"), encoded.keySet())
        assertTrue(encoded.get("due_date").isJsonNull)
        assertTrue(encoded.get("assignee_account_id").isJsonNull)
        assertEquals("2", result.task.version)
        assertEquals("\"updated-view\"", result.etag)
        assertNull(result.task.dueDate)
    }

    @Test fun cancellationDuringSecureStoreReadCannotStartAMutation() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val release = CountDownLatch(1)
        val blockingStore = object : SessionStore {
            override fun load(): Credentials {
                entered.complete(Unit)
                check(release.await(5, TimeUnit.SECONDS))
                return Credentials(token, accountId)
            }
            override fun save(credentials: Credentials) = Unit
            override fun clear() = Unit
        }
        val account = AccountRepository(AccountRepositoryTest.FakeApi(user, token), blockingStore, Gson())
        val tasks = TaskRepository(fake, account)
        val job = launch(Dispatchers.Default) {
            tasks.execute(CreateTaskCommand(accountId, spaceId, UUID.randomUUID().toString(), TaskFields("Title", "", null, null)))
        }
        try {
            withTimeout(5000) { entered.await() }
            job.cancel()
        } finally { release.countDown() }
        job.join()
        assertEquals(0, fake.calls)
    }

    @Test fun onlyBoundedTaskPagesCanExceedTheIdentityResponseLimit() {
        fun request(resource: String, bytes: Int): Int {
            val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
                okhttp3.Response.Builder().request(chain.request()).code(200).message("Synthetic")
                    .protocol(Protocol.HTTP_1_1).body("x".repeat(bytes).toResponseBody()).build()
            }.build()
            return client.newCall(Request.Builder().url("https://offline.invalid$resource").build()).execute().use { it.body!!.bytes().size }
        }
        assertEquals(100000, request("/v1/tasks", 100000))
        assertThrows(IOException::class.java) { request("/v1/me", 65537) }
        assertThrows(IOException::class.java) { request("/v1/tasks/$taskId", 65537) }
        assertThrows(IOException::class.java) { request("/v1/tasks", 262145) }
    }

    class FakeTasks(var task: FamilyTaskDto) : TaskApi {
        var failure = 0
        var calls = 0
        var limit = 0
        var authorization = ""
        var pagination: PaginationDto? = PaginationDto(null, false)
        var patch: Map<String, Any?>? = null
        var assigneeList = emptyList<TaskAssigneeDto>()
        var spaceRole = "owner"
        var filters: List<String?> = emptyList()
        val keys = mutableListOf<String>()
        val etags = mutableListOf<String>()
        val creations = mutableListOf<CreateTaskDto>()
        private fun <Value> response(value: Value, page: Boolean = false): Response<EnvelopeDto<Value>> {
            calls += 1
            if (failure != 0) return Response.error(failure, """{"error":{"code":"SYNTHETIC","message":"Synthetic failure"}}""".toResponseBody("application/json".toMediaType()))
            return Response.success(EnvelopeDto(value, null, if (page) pagination else null), headersOf("ETag", "\"original-etag\""))
        }
        override suspend fun spaces(authorization: String, limit: Int, cursor: String?) = response(listOf(FamilySpaceDto(task.spaceId, "Family", spaceRole)), true)
        override suspend fun tasks(authorization: String, spaceId: String, limit: Int, cursor: String?, status: String?, assignee: String?, dueFrom: String?, dueTo: String?): Response<EnvelopeDto<List<FamilyTaskDto>>> {
            this.authorization = authorization; this.limit = limit; filters = listOf(status, assignee, dueFrom, dueTo)
            return response(listOf(task), true)
        }
        override suspend fun assignees(authorization: String, spaceId: String, taskId: String?) = response(assigneeList)
        override suspend fun read(authorization: String, taskId: String) = response(task)
        override suspend fun create(authorization: String, key: String, body: CreateTaskDto): Response<EnvelopeDto<FamilyTaskDto>> { keys.add(key); creations.add(body); return response(task) }
        override suspend fun edit(authorization: String, taskId: String, key: String, etag: String, body: Map<String, Any?>): Response<EnvelopeDto<FamilyTaskDto>> { keys.add(key); etags.add(etag); patch = body; return response(task) }
        override suspend fun status(authorization: String, taskId: String, key: String, etag: String, body: TaskStatusDto): Response<EnvelopeDto<FamilyTaskDto>> { keys.add(key); etags.add(etag); return response(task) }
    }
}