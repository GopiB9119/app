package com.community.platform.feature.scheduling

import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.IdentityFailure
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Instant

/** Phone alerts without a push provider (DEC-020): what one background check posts, and when checks stop. */
class PhoneAlertsTest {
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val otherId = "0f97b948-9800-432f-9d15-407df739d08e"
    private val now = Instant.parse("2026-10-02T09:00:00Z")
    private val prefs = MemoryPrefs()
    private val notifier = RecordingNotifier()
    private val schedule = RecordingSchedule()
    private val source = FakeSource()
    private var signedIn: String? = accountId
    private val alerts = AlertSwitch(prefs, schedule, notifier)
    private val checker = AlertChecker(alerts, prefs, notifier, source, { signedIn }, { now })

    class MemoryPrefs : AlertPrefs {
        override var accountId: String? = null
        override var primed = false
        override var alerted: List<String> = emptyList()
        override var unread = 0
        override fun turnOn(accountId: String) { this.accountId = accountId; primed = false; alerted = emptyList(); unread = 0 }
        override fun record(primed: Boolean, alerted: List<String>, unread: Int) { this.primed = primed; this.alerted = alerted; this.unread = unread }
        override fun clear() { accountId = null; primed = false; alerted = emptyList(); unread = 0 }
    }

    class RecordingNotifier : Notifier {
        var allowed = true
        val reminders = mutableListOf<Pair<String, String>>()
        val messages = mutableListOf<Int>()
        var messagesCancelled = 0
        var allCancelled = 0
        override fun allowed() = allowed
        override fun reminder(id: String, taskTitle: String) { reminders += id to taskTitle }
        override fun messages(count: Int) { messages += count }
        override fun cancelMessages() { messagesCancelled += 1 }
        override fun cancelAll() { allCancelled += 1 }
    }

    class RecordingSchedule : AlertSchedule {
        var started = 0
        var stopped = 0
        override fun start() { started += 1 }
        override fun stop() { stopped += 1 }
    }

    class FakeSource : AlertSource {
        var items = listOf<InboxNotificationDto>()
        var unread = 0
        var failure: Exception? = null
        var reads = 0
        override suspend fun inbox(accountId: String): List<InboxNotificationDto> { reads += 1; failure?.let { throw it }; return items }
        override suspend fun unreadMessages(accountId: String): Int { failure?.let { throw it }; return unread }
    }

    private fun item(id: String, title: String = "Task $id", created: Instant = now.minusSeconds(600), read: Boolean = false) = InboxNotificationDto(
        id, "r-$id", "t-$id", "s-1", title, created.toString(), created.toString(), if (read) now.toString() else null, null,
    )

    private fun turnedOnAndPrimed() = runBlocking {
        alerts.turnOn(accountId)
        checker.check()
    }

    @Test fun theFirstCheckAfterTurningOnAlertsNothingThatAlreadyExisted() = runBlocking {
        source.items = listOf(item("a"), item("b"))
        source.unread = 3
        alerts.turnOn(accountId)
        assertEquals(1, schedule.started)
        checker.check()
        assertTrue(notifier.reminders.isEmpty())
        assertTrue(notifier.messages.isEmpty())
        checker.check()
        assertTrue("Items seen when alerts were turned on are never alerted.", notifier.reminders.isEmpty())
        assertTrue(notifier.messages.isEmpty())
    }

    @Test fun aNewUnreadReminderIsAlertedOnceWithItsTaskAndOlderOrReadOnesAreNot() = runBlocking {
        turnedOnAndPrimed()
        source.items = listOf(
            item("new", "Take out the bins"),
            item("read", read = true),
            item("old", created = now.minus(ALERT_WINDOW).minusSeconds(60)),
        )
        checker.check()
        assertEquals(listOf("new" to "Take out the bins"), notifier.reminders)
        checker.check()
        assertEquals("A reminder is alerted only once.", 1, notifier.reminders.size)
    }

    @Test fun unreadMessagesShowOnlyACountWhichChangesOrClears() = runBlocking {
        turnedOnAndPrimed()
        source.unread = 2
        checker.check()
        checker.check()
        assertEquals("The same count is not shown again.", listOf(2), notifier.messages)
        source.unread = 5
        checker.check()
        assertEquals(listOf(2, 5), notifier.messages)
        source.unread = 0
        checker.check()
        assertEquals(1, notifier.messagesCancelled)
        assertEquals(listOf(2, 5), notifier.messages)
    }

    @Test fun nothingIsPostedForAnotherAccountOrWhenAlertsAreOffOrNotAllowed() = runBlocking {
        source.items = listOf(item("a"))
        checker.check()
        assertEquals("Alerts off: the server is not even asked.", 0, source.reads)
        turnedOnAndPrimed()
        source.items = listOf(item("b"))
        notifier.allowed = false
        checker.check()
        assertTrue(notifier.reminders.isEmpty())
        notifier.allowed = true
        signedIn = otherId
        checker.check()
        assertTrue(notifier.reminders.isEmpty())
        assertNull("Another account signed in turns alerts off.", prefs.accountId)
        assertEquals(1, schedule.stopped)
    }

    @Test fun anEndedSessionTurnsAlertsOffAndANetworkErrorChangesNothing() = runBlocking {
        turnedOnAndPrimed()
        val before = Triple(prefs.primed, prefs.alerted, prefs.unread)
        source.items = listOf(item("b"))
        source.failure = IOException("synthetic network loss")
        checker.check()
        assertTrue(notifier.reminders.isEmpty())
        assertEquals(before, Triple(prefs.primed, prefs.alerted, prefs.unread))
        assertEquals(accountId, prefs.accountId)
        source.failure = IdentityFailure("AUTHENTICATION_REQUIRED", "Sign in again.", 401)
        checker.check()
        assertNull(prefs.accountId)
        assertEquals(1, schedule.stopped)
        assertEquals(1, notifier.allCancelled)
    }

    @Test fun signingOutOrChangingAccountTurnsAlertsOffButTheSameAccountKeepsThem() {
        val inner = AccountRepositoryTest.MemoryStore().apply { save(Credentials("token", accountId)) }
        val sessions = AlertSessionStore(inner, alerts)
        alerts.turnOn(accountId)
        sessions.save(Credentials("token-2", accountId))
        assertEquals(accountId, alerts.account.value)
        sessions.save(Credentials("token-3", otherId))
        assertNull(alerts.account.value)
        assertEquals(1, schedule.stopped)
        alerts.turnOn(otherId)
        sessions.clear()
        assertNull(alerts.account.value)
        assertNull(prefs.accountId)
        assertNull(inner.load())
    }

    @Test fun atAppStartChecksContinueOnlyForTheSameAccount() {
        alerts.turnOn(accountId)
        alerts.resume(accountId)
        assertEquals(2, schedule.started)
        alerts.resume(otherId)
        assertNull(prefs.accountId)
        assertEquals(1, schedule.stopped)
        alerts.resume(accountId)
        assertEquals("Off stays off.", 2, schedule.started)
    }

    @Test fun theRememberedListIsBounded() = runBlocking {
        turnedOnAndPrimed()
        source.items = (1..(MAX_ALERTED + 20)).map { item("n$it") }
        checker.check()
        assertEquals(MAX_ALERTED + 20, notifier.reminders.size)
        assertEquals(MAX_ALERTED, prefs.alerted.size)
        assertEquals("n${MAX_ALERTED + 20}", prefs.alerted.last())
    }
}
