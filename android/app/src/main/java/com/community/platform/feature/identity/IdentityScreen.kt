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
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
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
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

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
)

@Composable
fun IdentityRoute(viewModel: IdentityViewModel, onOpenTasks: (() -> Unit)? = null, onOpenInbox: (() -> Unit)? = null, onOpenSpaces: (() -> Unit)? = null, onOpenCalendar: (() -> Unit)? = null, onOpenMessages: (() -> Unit)? = null, onOpenCommunity: (() -> Unit)? = null, onOpenCare: (() -> Unit)? = null, onOpenSearch: (() -> Unit)? = null) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    IdentityScreen(state, IdentityActions(viewModel::mode, viewModel::begin, viewModel::login, viewModel::verify, viewModel::saveProfile, viewModel::revoke, viewModel::revokeOthers, viewModel::logout, viewModel::refresh), onOpenTasks, onOpenInbox, onOpenSpaces, onOpenCalendar, onOpenMessages, onOpenCommunity, onOpenCare, onOpenSearch)
}

@Composable
fun IdentityScreen(state: IdentityState, actions: IdentityActions, onOpenTasks: (() -> Unit)? = null, onOpenInbox: (() -> Unit)? = null, onOpenSpaces: (() -> Unit)? = null, onOpenCalendar: (() -> Unit)? = null, onOpenMessages: (() -> Unit)? = null, onOpenCommunity: (() -> Unit)? = null, onOpenCare: (() -> Unit)? = null, onOpenSearch: (() -> Unit)? = null, secrets: SignInSecrets = viewModel()) {
    SideEffect { if (state.profile != null) secrets.forget() }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AccountCircle, null, Modifier.size(30.dp), tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
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
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Column(Modifier.widthIn(max = 560.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                        state.error?.let { StatusMessage(it, true) }
                        state.notice?.let { StatusMessage(it, false) }
                        if (state.profile != null && onOpenSpaces != null) OutlinedButton(onClick = onOpenSpaces, enabled = !state.busy, shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("account-spaces")) { Icon(Icons.Default.Home, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text(stringResource(R.string.family_spaces)) }
                        if (state.profile != null && onOpenCalendar != null) OutlinedButton(onClick = onOpenCalendar, enabled = !state.busy, shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("account-calendar")) { Icon(Icons.Default.DateRange, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text(stringResource(R.string.calendar_title)) }
                        if (state.profile != null && onOpenMessages != null) OutlinedButton(onClick = onOpenMessages, enabled = !state.busy, shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("account-messages")) { Icon(Icons.Default.Email, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text(stringResource(R.string.messages_title)) }
                        if (state.profile != null && onOpenCommunity != null) OutlinedButton(onClick = onOpenCommunity, enabled = !state.busy, shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("account-community")) { Icon(Icons.Default.AccountCircle, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text(stringResource(R.string.community_title)) }
                        if (state.profile != null && onOpenCare != null) OutlinedButton(onClick = onOpenCare, enabled = !state.busy, shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("account-care")) { Icon(Icons.Default.Favorite, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text(stringResource(R.string.care_title)) }
                        if (state.profile != null && onOpenSearch != null) OutlinedButton(onClick = onOpenSearch, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).testTag("account-search")) { Icon(Icons.Default.Search, null, Modifier.size(DesignTokens.SpaceUnit * 5)); Spacer(Modifier.width(DesignTokens.SpaceUnit * 2)); Text(stringResource(R.string.search_title)) }
                        when {
                            state.profile != null -> AccountBody(state, actions)
                            state.signInUnchecked -> UncheckedSignIn(state, actions)
                            else -> AuthenticationBody(state, actions, secrets)
                        }
                        Spacer(Modifier.height(16.dp))
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
        OutlinedTextField(value = email, onValueChange = { email = it.take(254) }, label = { Text(stringResource(R.string.email_address)) }, singleLine = true, enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), leadingIcon = { Icon(Icons.Default.Email, null) }, modifier = Modifier.fillMaxWidth().testTag("email"))
    } else {
        OutlinedTextField(value = draft.code, onValueChange = { draft.code = it.filter(Char::isDigit).take(6) }, label = { Text(stringResource(R.string.verification_code)) }, singleLine = true, enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth().testTag("code"))
        if (state.mode == EntryMode.REGISTER) {
            OutlinedTextField(value = name, onValueChange = { name = it.take(80) }, label = { Text(stringResource(R.string.display_name)) }, enabled = !state.busy, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("name"))
        }
    }
    if (state.mode == EntryMode.LOGIN || verifying) {
        OutlinedTextField(value = draft.password, onValueChange = { draft.password = it.take(128) }, label = { Text(stringResource(if (state.mode == EntryMode.LOGIN) R.string.password else R.string.new_password)) }, singleLine = true, enabled = !state.busy, visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), supportingText = { if (state.mode != EntryMode.LOGIN) Text(stringResource(R.string.password_length)) }, modifier = Modifier.fillMaxWidth().testTag("password"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(showPassword, onCheckedChange = { showPassword = it }, enabled = !state.busy)
            Text(stringResource(R.string.show_password), style = MaterialTheme.typography.bodyMedium)
        }
    }
    if (verifying && state.mode == EntryMode.REGISTER) TimezonePicker(timezone, state.timezones, !state.busy) { chosenTimezone = it }
    Button(
        onClick = { when { state.mode == EntryMode.LOGIN -> actions.login(email, draft.password); verifying -> actions.verify(draft.code, draft.password, name, timezone); else -> actions.begin(email) } },
        enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("primary-action"), shape = RoundedCornerShape(6.dp),
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
private fun AccountBody(state: IdentityState, actions: IdentityActions) {
    val profile = state.profile ?: return
    var name by remember(profile.user.id) { mutableStateOf(profile.user.displayName) }
    var timezone by remember(profile.user.id) { mutableStateOf(profile.user.timezone) }
    var baseEtag by remember(profile.user.id) { mutableStateOf(profile.etag) }
    var confirmation by remember { mutableStateOf<Confirmation?>(null) }
    LaunchedEffect(state.profileSaved) {
        name = profile.user.displayName
        timezone = profile.user.timezone
        baseEtag = profile.etag
    }
    val logoutTitle = stringResource(R.string.confirm_logout)
    val othersTitle = stringResource(R.string.confirm_others)
    val revokeTitle = stringResource(R.string.confirm_revoke)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(stringResource(R.string.your_account), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f).semantics { heading() })
        IconButton(onClick = { confirmation = Confirmation(logoutTitle, actions.logout) }, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.ExitToApp, stringResource(R.string.sign_out)) }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Default.CheckCircle, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
        Text(stringResource(R.string.email_verified), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
    }
    Text(profile.user.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    HorizontalDivider()
    Text(stringResource(R.string.profile), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
    OutlinedTextField(value = name, onValueChange = { name = it.take(80) }, label = { Text(stringResource(R.string.display_name)) }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth().testTag("profile-name"))
    TimezonePicker(timezone, state.timezones, !state.busy) { timezone = it }
    val changed = name != profile.user.displayName || timezone != profile.user.timezone
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = { actions.save(name, timezone, baseEtag) }, enabled = changed && !state.busy, shape = RoundedCornerShape(6.dp)) { Icon(Icons.Default.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.save_changes)) }
        if (changed) TextButton(onClick = { name = profile.user.displayName; timezone = profile.user.timezone; baseEtag = profile.etag }, enabled = !state.busy) { Text(stringResource(R.string.discard)) }
    }
    HorizontalDivider(Modifier.padding(top = 12.dp))
    Text(stringResource(R.string.active_sessions), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
    state.sessions.forEach { session ->
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Settings, null, Modifier.size(23.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(session.deviceName, style = MaterialTheme.typography.titleMedium)
                Text(stringResource(if (session.current) R.string.current_session else R.string.other_session), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(formatTimestamp(session.createdAt, profile.user.timezone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (!session.current) IconButton(onClick = { confirmation = Confirmation(revokeTitle) { actions.revoke(session) } }, enabled = !state.busy) { Icon(Icons.Default.Close, stringResource(R.string.revoke_session, session.deviceName)) }
        }
        HorizontalDivider()
    }
    if (state.sessions.size > 1) OutlinedButton(onClick = { confirmation = Confirmation(othersTitle, actions.revokeOthers) }, enabled = !state.busy, shape = RoundedCornerShape(6.dp)) { Text(stringResource(R.string.sign_out_others)) }
    Text(stringResource(R.string.security_activity), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp).semantics { heading() })
    state.events.take(5).forEach { event ->
        Column {
            Text(stringResource(when (event.action) { "account.created" -> R.string.account_created; "session.created" -> R.string.signed_in; "session.revoked", "session.capacity_revoked" -> R.string.session_revoked; "profile.updated" -> R.string.profile_updated; "account.password_reset" -> R.string.password_changed; else -> R.string.account_activity }), style = MaterialTheme.typography.bodyMedium)
            Text(formatTimestamp(event.createdAt, profile.user.timezone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    confirmation?.let { pending ->
        AlertDialog(onDismissRequest = { if (!state.busy) confirmation = null }, title = { Text(pending.title) }, confirmButton = { TextButton(onClick = { pending.action(); confirmation = null }, enabled = !state.busy) { Text(stringResource(R.string.confirm)) } }, dismissButton = { TextButton(onClick = { confirmation = null }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
    }
}

@Composable
private fun TimezonePicker(value: String, zones: List<String>, enabled: Boolean, onSelected: (String) -> Unit) {
    var opened by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.timezone), style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = { opened = true; query = "" }, enabled = enabled, shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("timezone")) { Text(value.replace('_', ' '), Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, stringResource(R.string.select_timezone)) }
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
    }, confirmButton = { TextButton(onClick = { opened = false }) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
}

@Composable
private fun StatusMessage(message: String, error: Boolean) {
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) {
        Text(message, Modifier.padding(12.dp), color = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun formatTimestamp(value: String, timezone: String): String = try {
    DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.getDefault()).withZone(ZoneId.of(timezone)).format(Instant.parse(value))
} catch (_error: RuntimeException) { "" }