package com.community.platform.feature.scheduling

import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.planning.FamilyTaskDto
import com.community.platform.feature.planning.TaskPermissionsDto
import com.community.platform.feature.planning.TaskRepository
import com.community.platform.feature.planning.TaskRepositoryTest
import com.community.platform.feature.realtime.LiveEvent
import com.community.platform.feature.realtime.LiveSignals
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.concurrent.atomic.AtomicInteger

/** Live hints about notifications re-read the reminder inbox while the screen is bound. */
@OptIn(ExperimentalCoroutinesApi::class)
class ReminderLiveTest {
    private val fixture = ReminderRepositoryTest.Fixture()
    private val task = FamilyTaskDto(fixture.taskId, fixture.spaceId, "Groceries", "Fruit", null, "open", null, false, fixture.accountId, null, null, "2026-09-19T10:00:00Z", "2026-09-19T10:00:00Z", "1", TaskPermissionsDto(true, listOf("completed")), "\"task-1\"")
    private val api = CountingInbox(fixture.api)
    private val live = FakeLive()
    private val model = ReminderViewModel(ReminderRepository(api, fixture.accounts), TaskRepository(TaskRepositoryTest.FakeTasks(task), fixture.accounts), fixture.accounts, live)

    private class FakeLive : LiveSignals {
        override val events = MutableSharedFlow<LiveEvent>()
        override val connected = MutableStateFlow(false)
    }

    private class CountingInbox(private val inner: ReminderApi) : ReminderApi by inner {
        val loads = AtomicInteger()

        override suspend fun inbox(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<InboxNotificationDto>>> {
            loads.incrementAndGet()
            return inner.inbox(authorization, cursor, limit)
        }
    }

    @Before fun dispatcher() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model.bind(null); Dispatchers.resetMain() }

    private suspend fun idle() = withTimeout(5000) { model.state.first { !it.busy } }
    private suspend fun settle() { idle(); delay(150); idle() }
    private suspend fun loaded(count: Int) { withTimeout(5000) { while (api.loads.get() < count) delay(5) }; settle() }

    @Test fun notificationHintsReloadTheInboxAndKeepTheNotice() = runBlocking {
        model.bind(fixture.accountId); idle()
        val loads = api.loads.get()
        model.propose(ReminderCommand.Acknowledge(model.state.value.inbox.single())); model.confirm(); idle()
        assertEquals("Reminder acknowledged.", model.state.value.notice)

        live.events.emit(LiveEvent.Change("notifications", null, null, "acknowledge")); loaded(loads + 1)
        assertEquals(loads + 1, api.loads.get())
        assertEquals("Reminder acknowledged.", model.state.value.notice)

        live.events.emit(LiveEvent.Ready); loaded(loads + 2)
        live.events.emit(LiveEvent.Resync); loaded(loads + 3)
        assertEquals(loads + 3, api.loads.get())
    }

    @Test fun otherHintsAndAnUnboundScreenDoNotReload() = runBlocking {
        model.bind(fixture.accountId); idle()
        val loads = api.loads.get()
        live.events.emit(LiveEvent.Change("conversation", "5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01", fixture.spaceId, "message")); settle()
        live.events.emit(LiveEvent.End("time_limit")); settle()
        assertEquals(loads, api.loads.get())
        model.bind(null)
        live.events.emit(LiveEvent.Change("notifications", null, null, "delivered")); settle()
        assertEquals(loads, api.loads.get())
    }
}
