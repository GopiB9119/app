package com.community.platform.feature.identity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.community.platform.DesignTokens
import com.community.platform.R
import com.community.platform.feature.community.takeCodePoints
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val unit = DesignTokens.SpaceUnit

data class IdentityActions(
    val mode: (EntryMode) -> Unit,
    val begin: (String) -> Unit,
    val login: (String, String) -> Unit,
    val verify: (String, String, String, String) -> Unit,
    val save: (String, String, String) -> Unit,
    val revoke: (SessionDto) -> Unit,
    val revokeOthers: () -> Unit,
    val logout: () -> Unit,
    val refresh: () -> Unit,
    val credentialsChanged: () -> Unit = {},
    val cancelDeletion: () -> Unit = {},
)

@Composable
fun IdentityRoute(viewModel: IdentityViewModel, onOpenTasks: (() -> Unit)? = null, onOpenInbox: (() -> Unit)? = null, onOpenAgent: (() -> Unit)? = null, onOpenBlocked: (() -> Unit)? = null, dataViewModel: AccountDataViewModel = androidx.lifecycle.viewmodel.compose.viewModel(), onOpenInterests: (() -> Unit)? = null, onOpenPrivacy: (() -> Unit)? = null) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val dataState by dataViewModel.state.collectAsStateWithLifecycle()
    var showingData by rememberSaveable(state.profile?.user?.id) { mutableStateOf(false) }
    LaunchedEffect(state.profile?.user?.id, state.profile?.user?.timezone) { dataViewModel.bind(state.profile) }
    LaunchedEffect(dataState.signInRequired, state.busy) {
        if (dataState.signInRequired && !state.busy) { showingData = false; viewModel.refresh() }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (!showingData && !dataState.busy) viewModel.refresh() }
    if (showingData && state.profile != null) {
        AccountDataRoute(dataViewModel, dataState.copy(busy = dataState.busy || state.busy),
            onBack = { showingData = false }, onSignInAgain = viewModel::signInAgain, onDeleted = viewModel::accountDeleted)
    } else {
        IdentityScreen(state, IdentityActions(viewModel::mode, viewModel::begin, viewModel::login, viewModel::verify, viewModel::saveProfile, viewModel::revoke, viewModel::revokeOthers, viewModel::logout, viewModel::refresh, viewModel::credentialsChanged, viewModel::cancelDeletion),
            onOpenTasks, onOpenInbox, onOpenAgent, onOpenBlocked, onOpenData = { dataViewModel.bind(state.profile); showingData = true }, onOpenInterests = onOpenInterests, onOpenPrivacy = onOpenPrivacy)
    }
}

/** Sign-in, and once signed in the Profile section: account, sessions, the agent and the blocked list (DEC-014). */
@Composable
fun IdentityScreen(state: IdentityState, actions: IdentityActions, onOpenTasks: (() -> Unit)? = null, onOpenInbox: (() -> Unit)? = null, onOpenAgent: (() -> Unit)? = null, onOpenBlocked: (() -> Unit)? = null, secrets: SignInSecrets = viewModel(), onOpenData: (() -> Unit)? = null, onOpenInterests: (() -> Unit)? = null, onOpenPrivacy: (() -> Unit)? = null) {
    SideEffect { if (state.profile != null) secrets.forget() }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = unit * 5, vertical = unit * 4), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AccountCircle, null, Modifier.size(30.dp), tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(unit * 3))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.local_environment), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                }
                if (state.profile != null) {
                    if (onOpenInbox != null) IconButton(onClick = onOpenInbox, enabled = !state.busy) { Icon(Icons.Default.Notifications, stringResource(R.string.reminders_inbox)) }
                    if (onOpenTasks != null) IconButton(onClick = onOpenTasks, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.List, stringResource(R.string.family_tasks)) }
                    IconButton(onClick = actions.refresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, stringResource(R.string.refresh)) }
                }
            }
            HorizontalDivider()
            if (state.loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(32.dp)) }
            } else {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(unit * 5), horizontalAlignment = Alignment.CenterHorizontally) {
                    Column(Modifier.widthIn(max = 560.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(unit * 5)) {
                        state.error?.let { StatusMessage(it, true) }
                        state.notice?.let { StatusMessage(it, false) }
                        if (state.profile == null) state.deletionNotice?.let { notice ->
                            StatusMessage(stringResource(R.string.account_deletion_notice, formatAccountDataTimestamp(notice.purgeAfter, notice.timezone)), false)
                        }
                        if (state.profile != null && onOpenAgent != null) OutlinedButton(onClick = onOpenAgent, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("account-agent")) { Icon(Icons.Default.Face, null, Modifier.size(DesignTokens.SpaceUnit * 5)); Spacer(Modifier.width(DesignTokens.SpaceUnit * 2)); Text(stringResource(R.string.agent_title)) }
                        if (state.profile != null && onOpenBlocked != null) OutlinedButton(onClick = onOpenBlocked, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("account-blocked")) { Icon(Icons.Default.Lock, null, Modifier.size(DesignTokens.SpaceUnit * 5)); Spacer(Modifier.width(DesignTokens.SpaceUnit * 2)); Text(stringResource(R.string.account_blocked)) }
                        // Private: only this person sees their interests, which only suggest pages to them.
                        if (state.profile != null && onOpenInterests != null) OutlinedButton(onClick = onOpenInterests, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("account-interests")) { Icon(Icons.Default.Star, null, Modifier.size(DesignTokens.SpaceUnit * 5)); Spacer(Modifier.width(DesignTokens.SpaceUnit * 2)); Text(stringResource(R.string.community_interests)) }
                        // DEC-034: one place listing what this person has allowed, each with its take-back.
                        if (state.profile != null && onOpenPrivacy != null) OutlinedButton(onClick = onOpenPrivacy, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("account-privacy")) { Icon(Icons.Default.CheckCircle, null, Modifier.size(DesignTokens.SpaceUnit * 5)); Spacer(Modifier.width(DesignTokens.SpaceUnit * 2)); Text(stringResource(R.string.privacy_title)) }
                        when {
                            state.profile != null -> AccountBody(state, actions, onOpenData)
                            state.signInUnchecked -> UncheckedSignIn(state, actions)
                            else -> AuthenticationBody(state, actions, secrets)
                        }
                        Spacer(Modifier.height(unit * 4))
                    }
                }
            }
        }
    }
}

@Composable
private fun UncheckedSignIn(state: IdentityState, actions: IdentityActions) {
    Text(stringResource(R.string.sign_in_unchecked_title), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.semantics { heading() })
    Text(stringResource(R.string.sign_in_unchecked_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(onClick = actions.refresh, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("retry-sign-in"), shape = RoundedCornerShape(DesignTokens.ControlRadius)) {
        if (state.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
        else Text(stringResource(R.string.try_again))
    }
}

// Keeps the password and verification code across rotation in memory only, never in saved state.
class SignInSecrets : ViewModel() {
    private var current = SignInDraft(null)

    internal fun draft(scope: Any): SignInDraft {
        if (current.scope != scope) current = SignInDraft(scope)
        return current
    }

    internal fun forget() {
        if (current.scope != null) current = SignInDraft(null)
    }
}

internal class SignInDraft(val scope: Any?) {
    var password by mutableStateOf("")
    var code by mutableStateOf("")
}

@Composable
private fun AuthenticationBody(state: IdentityState, actions: IdentityActions, secrets: SignInSecrets) {
    var email by rememberSaveable(state.mode) { mutableStateOf("") }
    val draft = remember(secrets, state.mode, state.challengeEmail) { secrets.draft(state.mode to state.challengeEmail) }
    var name by rememberSaveable(state.mode) { mutableStateOf("") }
    var chosenTimezone by rememberSaveable(state.mode) { mutableStateOf<String?>(null) }
    val suggestedTimezone = remember(state.timezones) { signUpTimezone(state.timezones) }
    val timezone = chosenTimezone ?: suggestedTimezone
    var showPassword by rememberSaveable { mutableStateOf(false) }
    val verifying = state.challengeEmail != null
    val title = when {
        verifying && state.mode == EntryMode.REGISTER -> R.string.complete_account
        verifying -> R.string.choose_password
        state.mode == EntryMode.LOGIN -> R.string.welcome_back
        state.mode == EntryMode.REGISTER -> R.string.create_account_heading
        else -> R.string.recover_account
    }
    Text(stringResource(title), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.semantics { heading() })
    Text(state.challengeEmail ?: stringResource(R.string.synthetic_accounts), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (!verifying && state.mode != EntryMode.RECOVER) {
        TabRow(selectedTabIndex = if (state.mode == EntryMode.LOGIN) 0 else 1) {
            Tab(selected = state.mode == EntryMode.LOGIN, onClick = { actions.mode(EntryMode.LOGIN) }, enabled = !state.busy, text = { Text(stringResource(R.string.sign_in)) })
            Tab(selected = state.mode == EntryMode.REGISTER, onClick = { actions.mode(EntryMode.REGISTER) }, enabled = !state.busy, text = { Text(stringResource(R.string.create_account)) })
        }
    }
    if (!verifying) {
        OutlinedTextField(value = email, onValueChange = { value ->
            val next = value.take(254)
            if (email != next) { email = next; actions.credentialsChanged() }
        }, label = { Text(stringResource(R.string.email_address)) }, singleLine = true, enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), leadingIcon = { Icon(Icons.Default.Email, null) }, modifier = Modifier.fillMaxWidth().testTag("email"))
    } else {
        OutlinedTextField(value = draft.code, onValueChange = { draft.code = it.filter(Char::isDigit).take(6) }, label = { Text(stringResource(R.string.verification_code)) }, singleLine = true, enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth().testTag("code"))
        if (state.mode == EntryMode.REGISTER) {
            OutlinedTextField(value = name, onValueChange = { name = it.takeCodePoints(80) }, label = { Text(stringResource(R.string.display_name)) }, enabled = !state.busy, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("name"))
        }
    }
    if (state.mode == EntryMode.LOGIN || verifying) {
        OutlinedTextField(value = draft.password, onValueChange = { value ->
            val next = value.take(128)
            if (draft.password != next) { draft.password = next; actions.credentialsChanged() }
        }, label = { Text(stringResource(if (state.mode == EntryMode.LOGIN) R.string.password else R.string.new_password)) }, singleLine = true, enabled = !state.busy, visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), supportingText = { if (state.mode != EntryMode.LOGIN) Text(stringResource(R.string.password_length)) }, modifier = Modifier.fillMaxWidth().testTag("password"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(showPassword, onCheckedChange = { showPassword = it }, enabled = !state.busy)
            Text(stringResource(R.string.show_password), style = MaterialTheme.typography.bodyMedium)
        }
    }
    if (verifying && state.mode == EntryMode.REGISTER) TimezonePicker(timezone, state.timezones, !state.busy) { chosenTimezone = it }
    if (state.mode == EntryMode.LOGIN) state.pendingDeletionAt?.let { purgeAfter ->
        StatusMessage(stringResource(R.string.account_deletion_pending,
            formatAccountDataTimestamp(purgeAfter, state.deletionNotice?.timezone ?: ZoneId.systemDefault().id)), true)
        Button(onClick = actions.cancelDeletion, enabled = !state.busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("cancel-deletion-sign-in"),
            shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.account_deletion_cancel_sign_in)) }
    }
    Button(
        onClick = { when { state.mode == EntryMode.LOGIN -> actions.login(email, draft.password); verifying -> actions.verify(draft.code, draft.password, name, timezone); else -> actions.begin(email) } },
        enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("primary-action"), shape = RoundedCornerShape(DesignTokens.ControlRadius),
    ) {
        if (state.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
        else Text(stringResource(when { state.mode == EntryMode.LOGIN -> R.string.sign_in; verifying && state.mode == EntryMode.REGISTER -> R.string.verify_create; verifying -> R.string.change_password; else -> R.string.send_code }))
    }
    if (state.mode == EntryMode.LOGIN) TextButton(onClick = { actions.mode(EntryMode.RECOVER) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.forgot_password)) }
    if (verifying) TextButton(onClick = { actions.mode(state.mode) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.request_new_code)) }
    if (state.mode == EntryMode.RECOVER) TextButton(onClick = { actions.mode(EntryMode.LOGIN) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_sign_in)) }
}

private data class Confirmation(val title: String, val action: () -> Unit)

@Composable
private fun AccountBody(state: IdentityState, actions: IdentityActions, onOpenData: (() -> Unit)?) {
    val profile = state.profile ?: return
    var name by rememberSaveable(profile.user.id) { mutableStateOf(profile.user.displayName) }
    var timezone by rememberSaveable(profile.user.id) { mutableStateOf(profile.user.timezone) }
    var baseEtag by rememberSaveable(profile.user.id) { mutableStateOf(profile.etag) }
    // The save count this editor last applied. A recreated screen keeps its draft; a new process counts again from 0.
    var appliedSave by rememberSaveable(profile.user.id) { mutableStateOf(state.profileSaved) }
    var confirmation by remember { mutableStateOf<Confirmation?>(null) }
    LaunchedEffect(state.profileSaved) {
        if (state.profileSaved > appliedSave) {
            name = profile.user.displayName
            timezone = profile.user.timezone
            baseEtag = profile.etag
        }
        appliedSave = state.profileSaved
    }
    val logoutTitle = stringResource(R.string.confirm_logout)
    val othersTitle = stringResource(R.string.confirm_others)
    val revokeTitle = stringResource(R.string.confirm_revoke)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(stringResource(R.string.your_account), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f).semantics { heading() })
        IconButton(onClick = { confirmation = Confirmation(logoutTitle, actions.logout) }, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.ExitToApp, stringResource(R.string.sign_out)) }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
        Icon(Icons.Default.CheckCircle, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
        Text(stringResource(R.string.email_verified), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
    }
    Text(profile.user.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (onOpenData != null) OutlinedButton(onClick = onOpenData, enabled = !state.busy,
        modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("account-data"),
        shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.account_data_title)) }
    HorizontalDivider()
    Text(stringResource(R.string.profile), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
    OutlinedTextField(value = name, onValueChange = { name = it.takeCodePoints(80) }, label = { Text(stringResource(R.string.display_name)) }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth().testTag("profile-name"))
    TimezonePicker(timezone, state.timezones, !state.busy) { timezone = it }
    val changed = name != profile.user.displayName || timezone != profile.user.timezone
    Row(horizontalArrangement = Arrangement.spacedBy(unit * 3)) {
        Button(onClick = { actions.save(name, timezone, baseEtag) }, enabled = changed && !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Icon(Icons.Default.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(unit * 2)); Text(stringResource(R.string.save_changes)) }
        if (changed) TextButton(onClick = { name = profile.user.displayName; timezone = profile.user.timezone; baseEtag = profile.etag }, enabled = !state.busy) { Text(stringResource(R.string.discard)) }
    }
    HorizontalDivider(Modifier.padding(top = unit * 3))
    Text(stringResource(R.string.active_sessions), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
    state.sessions.forEach { session ->
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Settings, null, Modifier.size(23.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(unit * 3))
            Column(Modifier.weight(1f)) {
                Text(session.deviceName, style = MaterialTheme.typography.titleMedium)
                Text(stringResource(if (session.current) R.string.current_session else R.string.other_session), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(formatTimestamp(session.createdAt, profile.user.timezone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (!session.current) IconButton(onClick = { confirmation = Confirmation(revokeTitle) { actions.revoke(session) } }, enabled = !state.busy) { Icon(Icons.Default.Close, stringResource(R.string.revoke_session, session.deviceName)) }
        }
        HorizontalDivider()
    }
    if (state.sessions.size > 1) OutlinedButton(onClick = { confirmation = Confirmation(othersTitle, actions.revokeOthers) }, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius)) { Text(stringResource(R.string.sign_out_others)) }
    Text(stringResource(R.string.security_activity), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = unit * 3).semantics { heading() })
    state.events.take(5).forEach { event ->
        Column {
            Text(stringResource(securityEventLabel(event.action)), style = MaterialTheme.typography.bodyMedium)
            Text(formatTimestamp(event.createdAt, profile.user.timezone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    confirmation?.let { pending ->
        AlertDialog(onDismissRequest = { if (!state.busy) confirmation = null }, title = { Text(pending.title) }, confirmButton = { TextButton(onClick = { pending.action(); confirmation = null }, enabled = !state.busy) { Text(stringResource(R.string.confirm)) } }, dismissButton = { TextButton(onClick = { confirmation = null }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(DesignTokens.DialogRadius))
    }
}

@Composable
private fun TimezonePicker(value: String, zones: List<String>, enabled: Boolean, onSelected: (String) -> Unit) {
    var opened by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2)) {
        Text(stringResource(R.string.timezone), style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = { opened = true; query = "" }, enabled = enabled, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("timezone")) { Text(value.replace('_', ' '), Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, stringResource(R.string.select_timezone)) }
    }
    if (opened) AlertDialog(onDismissRequest = { opened = false }, title = { Text(stringResource(R.string.select_timezone)) }, text = {
        Column {
            OutlinedTextField(value = query, onValueChange = { query = it.take(64) }, label = { Text(stringResource(R.string.search_timezone)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            LazyColumn(Modifier.heightIn(max = 340.dp)) {
                items(zones.filter { it.contains(query, ignoreCase = true) }, key = { it }) { zone ->
                    TextButton(onClick = { onSelected(zone); opened = false }, modifier = Modifier.fillMaxWidth()) { Text(zone.replace('_', ' '), Modifier.fillMaxWidth()) }
                }
            }
        }
    }, confirmButton = { TextButton(onClick = { opened = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(DesignTokens.DialogRadius))
}

@Composable
private fun StatusMessage(message: String, error: Boolean) {
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) {
        Text(message, Modifier.padding(unit * 3), color = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun formatTimestamp(value: String, timezone: String): String = try {
    DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.getDefault()).withZone(ZoneId.of(timezone)).format(Instant.parse(value))
} catch (_error: RuntimeException) { "" }

internal fun securityEventLabel(action: String): Int = when (action) {
    "account.created" -> R.string.account_created
    "session.created" -> R.string.signed_in
    "session.revoked", "session.capacity_revoked" -> R.string.session_revoked
    "profile.updated" -> R.string.profile_updated
    "account.password_reset" -> R.string.password_changed
    else -> R.string.account_activity
}