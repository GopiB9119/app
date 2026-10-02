package com.community.platform.feature.scheduling

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.R
import dagger.hilt.android.EntryPointAccessors

/** The phone alerts switch (DEC-020), backed by the app's [AlertSwitch]; shows nothing where the app has none. */
@Composable
fun PhoneAlertsSetting(accountId: String?) {
    val context = LocalContext.current
    val alerts = remember(context) {
        try { EntryPointAccessors.fromApplication(context.applicationContext, AlertsEntryPoint::class.java).alerts() } catch (_error: Exception) { null }
    } ?: return
    val enabledFor by alerts.account.collectAsStateWithLifecycle()
    PhoneAlertsSetting(accountId, enabledFor, alerts::turnOn, alerts::turnOff)
}

/** Turning alerts on asks Android for permission from this tap only; the app never asks by itself. */
@Composable
internal fun PhoneAlertsSetting(accountId: String?, enabledFor: String?, turnOn: (String) -> Unit, turnOff: () -> Unit) {
    val context = LocalContext.current
    var refused by rememberSaveable { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        refused = !granted
        if (granted && accountId != null) turnOn(accountId)
    }
    val on = accountId != null && enabledFor == accountId
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("phone-alerts")
                .toggleable(value = on, enabled = accountId != null, role = Role.Switch) { wanted ->
                    if (!wanted) { turnOff(); return@toggleable }
                    val account = accountId ?: return@toggleable
                    val needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                    if (needsPermission) permission.launch(Manifest.permission.POST_NOTIFICATIONS) else { refused = false; turnOn(account) }
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.phone_alerts_label), Modifier.weight(1f))
            Switch(checked = on, onCheckedChange = null, enabled = accountId != null)
        }
        Text(stringResource(R.string.phone_alerts_explain), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (refused && !on) Text(stringResource(R.string.phone_alerts_refused), color = MaterialTheme.colorScheme.error)
    }
}
