package com.community.platform.feature.identity

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private val dataUnit = DesignTokens.SpaceUnit

data class AccountDataActions(
    val back: () -> Unit,
    val choose: (String, Boolean) -> Unit,
    val prepare: () -> Unit,
    val refresh: () -> Unit,
    val cancel: (String) -> Unit,
    val download: (String) -> Unit,
    val openDeletion: () -> Unit,
    val closeDeletion: () -> Unit,
    val delete: (String) -> Unit,
    val signInAgain: () -> Unit,
)

@Composable
internal fun AccountDataRoute(
    viewModel: AccountDataViewModel,
    state: AccountDataState,
    onBack: () -> Unit,
    onSignInAgain: () -> Unit,
    onDeleted: (AccountDeletionNotice) -> Unit,
) {
    val resolver = LocalContext.current.applicationContext.contentResolver
    var selectedDownload by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedAccount by rememberSaveable { mutableStateOf<String?>(null) }
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val identifier = selectedDownload
        val accountId = selectedAccount
        selectedDownload = null
        selectedAccount = null
        if (uri != null && identifier != null && accountId == state.accountId) {
            viewModel.download(identifier) { resolver.openOutputStream(uri) }
        }
    }
    LifecycleResumeEffect(viewModel, state.accountId) {
        viewModel.visible(true)
        onPauseOrDispose { viewModel.visible(false) }
    }
    BackHandler { if (!state.busy) onBack() }
    AccountDataScreen(state, AccountDataActions(
        back = onBack, choose = viewModel::choose, prepare = viewModel::prepare, refresh = viewModel::refresh,
        cancel = viewModel::cancel,
        download = { identifier ->
            selectedDownload = identifier
            selectedAccount = state.accountId
            save.launch("community-platform-data-${LocalDate.now(ZoneOffset.UTC)}.json")
        },
        openDeletion = viewModel::openDeletion, closeDeletion = viewModel::closeDeletion,
        delete = { password -> viewModel.delete(password, onDeleted) }, signInAgain = onSignInAgain,
    ))
}

@Composable
fun AccountDataScreen(state: AccountDataState, actions: AccountDataActions) {
    val resources = LocalContext.current.resources
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(dataUnit * 2), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = actions.back, enabled = !state.busy, modifier = Modifier.size(DesignTokens.MinimumTarget)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.spaces_back_account))
                }
                Text(stringResource(R.string.account_data_title), style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = actions.refresh, enabled = !state.busy && !state.loading, modifier = Modifier.size(DesignTokens.MinimumTarget)) {
                    Icon(Icons.Default.Refresh, stringResource(R.string.account_data_refresh))
                }
            }
            HorizontalDivider()
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(dataUnit * 5), horizontalAlignment = Alignment.CenterHorizontally) {
                Column(Modifier.widthIn(max = 560.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(dataUnit * 4)) {
                    DataHeading(stringResource(R.string.account_data_download_title))
                    Text(stringResource(R.string.account_data_intro))
                    accountExportCategories.forEach { category ->
                        Row(Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget)
                            .toggleable(category in state.categories, enabled = !state.busy, role = Role.Checkbox) { actions.choose(category, it) }
                            .testTag("data-category-$category"), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = category in state.categories, onCheckedChange = null, enabled = !state.busy)
                            Spacer(Modifier.width(dataUnit * 3))
                            Text(stringResource(accountDataCategoryResource(category)), Modifier.weight(1f))
                        }
                    }
                    Button(onClick = actions.prepare, enabled = !state.busy && state.categories.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("data-prepare"),
                        shape = RoundedCornerShape(DesignTokens.ControlRadius)) {
                        Text(stringResource(R.string.account_data_prepare))
                    }
                    if (state.busy) CircularProgressIndicator(Modifier.size(dataUnit * 6))
                    state.problem?.let { problem ->
                        DataProblem(problem)
                        if (problem.code == "REAUTHENTICATION_REQUIRED") OutlinedButton(onClick = actions.signInAgain, enabled = !state.busy,
                            modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("data-sign-in-again"),
                            shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.account_data_sign_in_again)) }
                    }
                    if (state.downloadSaved) Text(stringResource(R.string.account_data_saved), Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    DataHeading(stringResource(R.string.account_data_downloads))
                    if (state.loading && !state.loaded) Text(stringResource(R.string.account_data_loading), Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    state.listProblem?.let { problem ->
                        DataProblem(problem)
                        OutlinedButton(onClick = actions.refresh, enabled = !state.busy && !state.loading,
                            modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget), shape = RoundedCornerShape(DesignTokens.ControlRadius)) {
                            Text(stringResource(R.string.try_again))
                        }
                    }
                    if (state.loaded && state.downloads.isEmpty()) Text(stringResource(R.string.account_data_empty))
                    state.downloads.forEach { download ->
                        Column(Modifier.fillMaxWidth().testTag("data-export-${download.id}"), verticalArrangement = Arrangement.spacedBy(dataUnit * 3)) {
                            Text(exportStatus(download, state.timezone), style = MaterialTheme.typography.titleMedium)
                            Text(stringResource(R.string.account_data_requested, formatAccountDataTimestamp(download.createdAt, state.timezone)), style = MaterialTheme.typography.bodySmall)
                            Text(download.categories.joinToString(", ") { category -> resources.getString(accountDataCategoryResource(category)) })
                            if (download.status == "ready" && !download.requestedHere) Text(stringResource(R.string.account_data_other_device))
                            if (download.canDownload) Button(onClick = { actions.download(download.id) }, enabled = !state.busy,
                                modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("data-download-${download.id}"),
                                shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.account_data_download)) }
                            if (download.canCancel) OutlinedButton(onClick = { actions.cancel(download.id) }, enabled = !state.busy,
                                modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("data-cancel-${download.id}"),
                                shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.cancel)) }
                        }
                        HorizontalDivider()
                    }
                    HorizontalDivider()
                    DataHeading(stringResource(R.string.account_deletion_title))
                    Text(stringResource(R.string.account_deletion_explanation))
                    OutlinedButton(onClick = actions.openDeletion, enabled = !state.busy,
                        modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("data-delete-account"),
                        shape = RoundedCornerShape(DesignTokens.ControlRadius)) {
                        Icon(Icons.Default.Delete, null, Modifier.size(dataUnit * 5))
                        Spacer(Modifier.width(dataUnit * 2))
                        Text(stringResource(R.string.account_deletion_delete), Modifier.weight(1f))
                    }
                }
            }
        }
    }
    if (state.deletionOpen) AccountDeletionDialog(state, actions)
}

@Composable
private fun DataHeading(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
}

@Composable
private fun DataProblem(problem: AccountDataProblem) {
    Column(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(dataUnit * 2)) {
        Text(stringResource(accountDataErrorResource(problem.code)), color = MaterialTheme.colorScheme.error)
        if (problem.code == "OWNED_SPACES_WITH_MEMBERS") problem.ownedSpaces.forEach { name -> Text(name) }
    }
}

@Composable
private fun AccountDeletionDialog(state: AccountDataState, actions: AccountDataActions) {
    var password by remember { mutableStateOf("") }
    DisposableEffect(Unit) { onDispose { password = "" } }
    val close = { password = ""; actions.closeDeletion() }
    AlertDialog(
        onDismissRequest = { if (!state.busy) close() },
        modifier = Modifier.testTag("data-deletion-dialog"),
        title = { Text(stringResource(R.string.account_deletion_confirm_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(dataUnit * 4)) {
                OutlinedTextField(value = password, onValueChange = { password = it.take(128) }, label = { Text(stringResource(R.string.password)) },
                    singleLine = true, enabled = !state.busy, visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth().testTag("data-deletion-password"))
                state.deletionProblem?.let { DataProblem(it) }
            }
        },
        confirmButton = {
            Column(verticalArrangement = Arrangement.spacedBy(dataUnit * 2)) {
                OutlinedButton(onClick = close, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("data-keep-account"),
                    shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.account_deletion_keep)) }
                Button(onClick = { val submitted = password; password = ""; actions.delete(submitted) }, enabled = !state.busy && password.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("data-confirm-deletion"),
                    shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.account_deletion_delete)) }
            }
        },
        shape = RoundedCornerShape(DesignTokens.DialogRadius),
    )
}

@Composable
private fun exportStatus(download: AccountExportDto, timezone: String): String = when (download.status) {
    "queued", "building" -> stringResource(R.string.account_data_preparing)
    "ready" -> download.expiresAt?.let { stringResource(R.string.account_data_ready_until, formatAccountDataTimestamp(it, timezone)) }
        ?: stringResource(R.string.account_data_ready)
    "expired" -> stringResource(R.string.account_data_expired)
    "cancelled" -> stringResource(R.string.account_data_cancelled)
    "outdated" -> stringResource(R.string.account_data_outdated)
    else -> stringResource(R.string.account_data_failed)
}

internal fun accountDataCategoryResource(category: String): Int = when (category) {
    "profile" -> R.string.account_data_profile
    "security" -> R.string.account_data_security
    "spaces" -> R.string.account_data_spaces
    "tasks" -> R.string.account_data_tasks
    "reminders" -> R.string.account_data_reminders
    else -> R.string.account_data_title
}

internal fun accountDataErrorResource(code: String): Int = when (code) {
    "PASSWORD_INCORRECT" -> R.string.account_deletion_wrong_password
    "OWNED_SPACES_WITH_MEMBERS" -> R.string.account_deletion_owned_spaces
    "REAUTHENTICATION_REQUIRED" -> R.string.account_data_reauthentication
    "EXPORT_IN_PROGRESS" -> R.string.account_data_in_progress
    "RATE_LIMITED" -> R.string.account_data_rate_limited
    "EXPORT_OTHER_SESSION" -> R.string.account_data_other_device
    "EXPORT_EXPIRED" -> R.string.account_data_error_expired
    "EXPORT_NOT_READY" -> R.string.account_data_error_not_ready
    "EXPORT_OUTDATED" -> R.string.account_data_error_outdated
    "EXPORT_UNAVAILABLE" -> R.string.account_data_error_unavailable
    "EXPORT_SAVE_FAILED" -> R.string.account_data_save_failed
    "OFFLINE" -> R.string.account_data_offline
    else -> R.string.account_data_request_failed
}

internal fun formatAccountDataTimestamp(value: String, timezone: String, locale: Locale = Locale.getDefault()): String = try {
    DateTimeFormatter.ofLocalizedDateTime(FormatStyle.LONG, FormatStyle.SHORT).withLocale(locale)
        .withZone(ZoneId.of(timezone)).format(Instant.parse(value))
} catch (_error: RuntimeException) { value }