package com.community.platform.feature.scheduling

import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.SessionStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.IOException
import java.time.Duration
import java.time.Instant

/** Inbox reminders older than this are never alerted: the alert would arrive long after the reminder (DEC-020). */
val ALERT_WINDOW: Duration = Duration.ofHours(24)
/** How many alerted inbox items are remembered, so none is alerted twice. */
const val MAX_ALERTED = 200

/** What the background checks remember between runs. A small private preferences file on the phone. */
interface AlertPrefs {
    /** The account phone alerts are on for, or null when they are off. */
    val accountId: String?
    /** False until the first check after turning alerts on has noted what already existed. */
    val primed: Boolean
    /** Inbox items already alerted or already there when alerts were turned on, oldest first. */
    val alerted: List<String>
    /** The unread message count last shown, or 0. */
    val unread: Int
    fun turnOn(accountId: String)
    fun record(primed: Boolean, alerted: List<String>, unread: Int)
    fun clear()
}

/** Phone notifications. Message alerts carry a count only, never message text. */
interface Notifier {
    fun allowed(): Boolean
    fun reminder(id: String, taskTitle: String)
    fun messages(count: Int)
    fun cancelMessages()
    fun cancelAll()
}

/** The periodic background check: WorkManager on the phone. */
interface AlertSchedule {
    fun start()
    fun stop()
}

/** What a check reads from the server: the first inbox page and the total of unread messages. */
interface AlertSource {
    suspend fun inbox(accountId: String): List<InboxNotificationDto>
    suspend fun unreadMessages(accountId: String): Int
}

/** Turns phone alerts on and off for one account (DEC-020). */
class AlertSwitch(private val prefs: AlertPrefs, private val schedule: AlertSchedule, private val notifier: Notifier) {
    private val state = MutableStateFlow(prefs.accountId)
    /** The account alerts are on for, or null. */
    val account: StateFlow<String?> = state.asStateFlow()

    fun turnOn(accountId: String) {
        prefs.turnOn(accountId)
        state.value = accountId
        schedule.start()
    }

    fun turnOff() {
        prefs.clear()
        state.value = null
        schedule.stop()
        notifier.cancelAll()
    }

    /** At app start the checks go on only while the same account is signed in. */
    fun resume(signedIn: String?) {
        val account = prefs.accountId ?: return
        if (account == signedIn) schedule.start() else turnOff()
    }
}

/** Signing out, an ended session and a different account turn phone alerts off. */
class AlertSessionStore(private val inner: SessionStore, private val alerts: AlertSwitch) : SessionStore {
    override fun load(): Credentials? = inner.load()

    override fun save(credentials: Credentials) {
        if (inner.load()?.accountId != credentials.accountId) alerts.turnOff()
        inner.save(credentials)
    }

    override fun clear() {
        alerts.turnOff()
        inner.clear()
    }
}

/** One background check: new unread reminders in the inbox, and how many messages are unread. */
class AlertChecker(
    private val alerts: AlertSwitch,
    private val prefs: AlertPrefs,
    private val notifier: Notifier,
    private val source: AlertSource,
    private val signedIn: () -> String?,
    private val clock: () -> Instant = Instant::now,
) {
    suspend fun check() {
        val account = prefs.accountId ?: return
        if (signedIn() != account) { alerts.turnOff(); return }
        if (!notifier.allowed()) return
        val items: List<InboxNotificationDto>
        val unread: Int
        try {
            items = source.inbox(account)
            unread = source.unreadMessages(account)
        } catch (error: CancellationException) {
            throw error
        } catch (error: IdentityFailure) {
            if (error.status == 401 || error.code == "ACCOUNT_CHANGED") alerts.turnOff()
            return
        } catch (_error: IOException) {
            return
        } catch (_error: Exception) {
            // An answer that could not be read changes nothing; the next check tries again.
            return
        }
        // Alerts may have been turned off, or the account changed, while the server answered.
        if (prefs.accountId != account || signedIn() != account) return
        val since = clock().minus(ALERT_WINDOW)
        val fresh = items.filter { it.readAt == null && created(it)?.isAfter(since) == true }
        val alerted = prefs.alerted.toMutableList()
        if (!prefs.primed) {
            // What was already there when alerts were turned on is not alerted.
            alerted += fresh.map { it.id }.filterNot { it in alerted }
            prefs.record(true, alerted.takeLast(MAX_ALERTED), unread)
            return
        }
        for (item in fresh) {
            if (item.id in alerted) continue
            notifier.reminder(item.id, item.taskTitle)
            alerted += item.id
        }
        if (unread > 0 && unread != prefs.unread) notifier.messages(unread)
        if (unread == 0 && prefs.unread != 0) notifier.cancelMessages()
        prefs.record(true, alerted.takeLast(MAX_ALERTED), unread)
    }

    private fun created(item: InboxNotificationDto): Instant? = try { Instant.parse(item.createdAt) } catch (_error: Exception) { null }
}
