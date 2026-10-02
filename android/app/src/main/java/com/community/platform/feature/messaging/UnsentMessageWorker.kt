package com.community.platform.feature.messaging

import android.content.Context
import androidx.room.Room
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.community.platform.feature.identity.AndroidSessionKey
import dagger.Module
import dagger.Provides
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

private const val ACCOUNT_INPUT = "account_id"
private const val OUTBOX_WORK = "community.messaging.outbox"

/** Sends the kept messages of one account; WorkManager runs it again, with exponential backoff, while it asks to. */
class UnsentMessageWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val accountId = inputData.getString(ACCOUNT_INPUT) ?: return Result.success()
        val sender = EntryPointAccessors.fromApplication(applicationContext, OutboxEntryPoint::class.java).sender()
        return if (sender.send(accountId)) Result.retry() else Result.success()
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface OutboxEntryPoint {
    fun sender(): OutboxSender
}

/** One unique work per account that waits for a network; a request while one waits or runs is dropped (KEEP). */
class WorkManagerOutbox(private val context: Context) : OutboxWork {
    override fun schedule(accountId: String) {
        val request = OneTimeWorkRequestBuilder<UnsentMessageWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .setInputData(workDataOf(ACCOUNT_INPUT to accountId))
            .addTag(OUTBOX_WORK)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("$OUTBOX_WORK.$accountId", ExistingWorkPolicy.KEEP, request)
    }

    override fun cancelAll() {
        WorkManager.getInstance(context).cancelAllWorkByTag(OUTBOX_WORK)
    }
}

@Module
@InstallIn(SingletonComponent::class)
object OutboxModule {
    @Provides @Singleton fun unsentDatabase(@ApplicationContext context: Context): UnsentDatabase =
        Room.databaseBuilder(context, UnsentDatabase::class.java, UNSENT_DATABASE).build()

    @Provides @Singleton fun outbox(@ApplicationContext context: Context, database: UnsentDatabase): Outbox =
        Outbox(database.unsent(), KeystoreMessageSealer(AndroidSessionKey(OUTBOX_KEY_ALIAS)), WorkManagerOutbox(context))

    @Provides fun messageOutbox(implementation: Outbox): MessageOutbox = implementation
}
