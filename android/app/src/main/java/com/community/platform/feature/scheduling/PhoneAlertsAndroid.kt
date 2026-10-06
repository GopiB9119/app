package com.community.platform.feature.scheduling

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.community.platform.MainActivity
import com.community.platform.R
import com.community.platform.feature.identity.KeystoreSessionStore
import com.community.platform.feature.messaging.MessagingRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

private const val ALERT_WORK = "community.phone-alerts"
private const val REMINDER_CHANNEL = "reminders"
private const val MESSAGE_CHANNEL = "messages"
private const val MESSAGES_ID = 1

/** Runs one [AlertChecker] check; WorkManager repeats it about every 15 minutes while there is a network. */
class PhoneAlertWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        EntryPointAccessors.fromApplication(applicationContext, AlertsEntryPoint::class.java).checker().check()
        return Result.success()
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface AlertsEntryPoint {
    fun checker(): AlertChecker
    fun alerts(): AlertSwitch
}

class SharedAlertPrefs(context: Context) : AlertPrefs {
    private val file = context.getSharedPreferences("community_phone_alerts", Context.MODE_PRIVATE)
    override val accountId: String? get() = file.getString("account", null)
    override val primed: Boolean get() = file.getBoolean("primed", false)
    override val alerted: List<String> get() = file.getString("alerted", "").orEmpty().split(',').filter { it.isNotEmpty() }
    override val unread: Int get() = file.getInt("unread", 0)
    override val unreadMarker: String? get() = file.getString("unread_marker", null)
    override fun turnOn(accountId: String) { file.edit().clear().putString("account", accountId).commit() }
    override fun record(primed: Boolean, alerted: List<String>, unread: Int, unreadMarker: String?) {
        file.edit().putBoolean("primed", primed).putString("alerted", alerted.joinToString(",")).putInt("unread", unread)
            .putString("unread_marker", unreadMarker).commit()
    }
    override fun clear() { file.edit().clear().commit() }
}

class AndroidNotifier(private val context: Context) : Notifier {
    private val manager = NotificationManagerCompat.from(context)

    override fun allowed(): Boolean = manager.areNotificationsEnabled() && permitted()

    private fun permitted() = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    override fun reminder(id: String, taskTitle: String) {
        channels()
        // The lock screen shows only that there is a reminder, not which task.
        val hidden = NotificationCompat.Builder(context, REMINDER_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(context.getString(R.string.phone_alerts_locked))
            .build()
        val notification = NotificationCompat.Builder(context, REMINDER_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(context.getString(R.string.phone_alerts_reminder_title))
            .setContentText(taskTitle)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(hidden)
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .build()
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ||
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) manager.notify(id, 0, notification)
    }

    override fun messages(count: Int) {
        channels()
        val text = context.resources.getQuantityString(R.plurals.phone_alerts_unread_messages, count, count)
        val notification = NotificationCompat.Builder(context, MESSAGE_CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setContentTitle(text)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build()
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ||
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) manager.notify(MESSAGES_ID, notification)
    }

    override fun cancelMessages() = manager.cancel(MESSAGES_ID)

    override fun cancelAll() = manager.cancelAll()

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun channels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val system = context.getSystemService(NotificationManager::class.java) ?: return
        system.createNotificationChannel(NotificationChannel(REMINDER_CHANNEL, context.getString(R.string.phone_alerts_channel_reminders), NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = context.getString(R.string.phone_alerts_channel_reminders_description) })
        system.createNotificationChannel(NotificationChannel(MESSAGE_CHANNEL, context.getString(R.string.phone_alerts_channel_messages), NotificationManager.IMPORTANCE_LOW)
            .apply { description = context.getString(R.string.phone_alerts_channel_messages_description) })
    }
}

class WorkManagerAlertSchedule(private val context: Context) : AlertSchedule {
    override fun start() {
        val request = PeriodicWorkRequestBuilder<PhoneAlertWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(ALERT_WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    override fun stop() {
        WorkManager.getInstance(context).cancelUniqueWork(ALERT_WORK)
    }
}

class RepositoryAlertSource(private val reminders: ReminderRepository, private val messaging: MessagingRepository) : AlertSource {
    override suspend fun inbox(accountId: String): List<InboxNotificationDto> = reminders.inbox(accountId).items
    override suspend fun unreadMessages(accountId: String): UnreadMessages = messaging.conversations(accountId).let {
        UnreadMessages(it.unreadCount, it.unreadMarker)
    }
}

@Module
@InstallIn(SingletonComponent::class)
object AlertsModule {
    @Provides @Singleton fun prefs(@ApplicationContext context: Context): AlertPrefs = SharedAlertPrefs(context)
    @Provides @Singleton fun notifier(@ApplicationContext context: Context): Notifier = AndroidNotifier(context)
    @Provides @Singleton fun schedule(@ApplicationContext context: Context): AlertSchedule = WorkManagerAlertSchedule(context)
    @Provides @Singleton fun alerts(prefs: AlertPrefs, schedule: AlertSchedule, notifier: Notifier): AlertSwitch = AlertSwitch(prefs, schedule, notifier)

    // The account is read from the stored session itself, not through the store that turns alerts off.
    @Provides fun checker(alerts: AlertSwitch, prefs: AlertPrefs, notifier: Notifier, reminders: ReminderRepository, messaging: MessagingRepository,
                          sessions: KeystoreSessionStore): AlertChecker =
        AlertChecker(alerts, prefs, notifier, RepositoryAlertSource(reminders, messaging), { sessions.load()?.accountId })
}
