package com.community.platform

import android.app.Application
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.community.platform.feature.identity.KeystoreSessionStore
import com.community.platform.feature.messaging.OutboxSender
import com.community.platform.feature.scheduling.AlertSwitch
import dagger.Lazy
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class CommunityApplication : Application() {
    @Inject lateinit var unsentMessages: Lazy<OutboxSender>
    @Inject lateinit var phoneAlerts: Lazy<AlertSwitch>
    @Inject lateinit var sessions: Lazy<KeystoreSessionStore>

    override fun onCreate() {
        super.onCreate()
        // Chat messages kept on the phone for the signed-in account are sent again in the background (DEC-021).
        ProcessLifecycleOwner.get().lifecycleScope.launch(Dispatchers.IO) { unsentMessages.get().resume() }
        // Phone alerts keep checking only while the account they were turned on for is still signed in (DEC-020).
        ProcessLifecycleOwner.get().lifecycleScope.launch(Dispatchers.IO) {
            try { phoneAlerts.get().resume(sessions.get().load()?.accountId) } catch (_error: Exception) { }
        }
    }
}