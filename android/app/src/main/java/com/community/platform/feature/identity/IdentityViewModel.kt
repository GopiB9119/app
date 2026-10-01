package com.community.platform.feature.identity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject

private const val CHANGE_OFFLINE = "No connection. Your changes are not confirmed."
private const val CHECK_OFFLINE = "Can't reach the service. Check your connection, then try again."

data class IdentityState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val mode: EntryMode = EntryMode.LOGIN,
    val challengeEmail: String? = null,
    val profile: Profile? = null,
    val sessions: List<SessionDto> = emptyList(),
    val events: List<SecurityEventDto> = emptyList(),
    val timezones: List<String> = listOf("UTC", "Asia/Kolkata", "Europe/London", "America/New_York"),
    val error: String? = null,
    val notice: String? = null,
    val profileSaved: Int = 0,
    // A saved sign-in exists but could not be checked, so the screen offers a retry instead of the sign-in form.
    val signInUnchecked: Boolean = false,
    val pendingDeletionAt: String? = null,
    val deletionNotice: AccountDeletionNotice? = null,
)

// Devices can name a zone by an older name (Asia/Calcutta for Asia/Kolkata) that the service refuses, so pick the listed zone with the same rules.
internal fun signUpTimezone(available: List<String>, device: String = ZoneId.systemDefault().id): String {
    if (device in available) return device
    val rules = runCatching { ZoneId.of(device).rules }.getOrNull() ?: return "UTC"
    return available.firstOrNull { zone -> runCatching { ZoneId.of(zone).rules == rules }.getOrDefault(false) } ?: "UTC"
}

@HiltViewModel
class IdentityViewModel @Inject constructor(private val repository: AccountRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(IdentityState())
    val state = mutableState.asStateFlow()
    private var startIntent: StartIntent? = null
    private var pending: PendingProof? = null
    private var deletionCredentials: LoginDto? = null
    private var credentialsRevision = 0

    init { refresh() }

    private fun action(offline: String = CHANGE_OFFLINE, operation: suspend () -> Unit) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try { operation() } catch (error: CancellationException) {
                throw error
            } catch (error: IdentityFailure) {
                mutableState.update {
                    if (error.status == 401) it.copy(profile = null, sessions = emptyList(), events = emptyList(), error = error.message)
                    else it.copy(error = error.message)
                }
            } catch (_error: IOException) {
                mutableState.update { it.copy(error = offline) }
            } catch (_error: Exception) {
                mutableState.update { it.copy(error = "The account service returned an unexpected result.") }
            } finally {
                mutableState.update { it.copy(busy = false, loading = false) }
            }
        }
    }

    private suspend fun loadAccount() {
        val profile = repository.current()
        if (profile == null) {
            mutableState.update { it.copy(profile = null, sessions = emptyList(), events = emptyList()) }
            return
        }
        mutableState.update { it.copy(profile = profile) }
        val sessions = repository.sessions(profile.user.id)
        val events = repository.events(profile.user.id)
        mutableState.update { it.copy(sessions = sessions, events = events) }
    }

    // Showing the sign-in form for a session that could not be checked would make the person sign in again and start a second server session.
    fun refresh() = action(CHECK_OFFLINE) {
        try {
            loadAccount()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val rejected = error is IdentityFailure && error.status == 401
            mutableState.update { it.copy(signInUnchecked = !rejected && it.profile == null) }
            throw error
        }
        mutableState.update { it.copy(signInUnchecked = false) }
        val zones = repository.timezones()
        mutableState.update { it.copy(timezones = zones) }
    }

    fun mode(mode: EntryMode) {
        if (mutableState.value.busy) return
        pending = null
        startIntent = null
        credentialsChanged()
        mutableState.update { it.copy(mode = mode, challengeEmail = null, error = null, notice = null, deletionNotice = null) }
    }

    fun begin(email: String) = action {
        if (!email.trim().endsWith(".test") || !email.contains('@')) throw IdentityFailure("VALIDATION_ERROR", "Use a valid synthetic .test email address.")
        val mode = mutableState.value.mode
        val existing = startIntent
        val intent = if (existing?.email == email.trim() && existing.purpose == mode) existing else {
            StartIntent(email.trim(), mode, UUID.randomUUID().toString().replace("-", ""), UUID.randomUUID().toString())
        }
        startIntent = intent
        pending = repository.begin(intent)
        mutableState.update { it.copy(challengeEmail = intent.email) }
    }

    fun login(email: String, password: String) = action {
        if (email.isBlank() || password.isBlank()) throw IdentityFailure("VALIDATION_ERROR", "Enter your email and password.")
        credentialsChanged()
        val revision = credentialsRevision
        val credentials = LoginDto(email.trim(), password)
        try {
            repository.login(credentials.email, credentials.password)
        } catch (error: IdentityFailure) {
            val purgeAfter = error.details["purge_after"]
            if (error.code != "ACCOUNT_DELETION_PENDING" || purgeAfter == null) throw error
            Instant.parse(purgeAfter)
            if (revision == credentialsRevision) {
                deletionCredentials = credentials
                mutableState.update { it.copy(pendingDeletionAt = purgeAfter) }
            }
            return@action
        }
        finishLogin()
    }

    fun credentialsChanged() {
        credentialsRevision += 1
        deletionCredentials = null
        mutableState.update { it.copy(pendingDeletionAt = null) }
    }

    fun cancelDeletion() = action {
        val credentials = deletionCredentials ?: return@action
        repository.cancelDeletion(credentials.email, credentials.password)
        finishLogin()
    }

    private suspend fun finishLogin() {
        pending = null
        startIntent = null
        credentialsChanged()
        mutableState.update { it.copy(challengeEmail = null, deletionNotice = null, signInUnchecked = false) }
        loadAccount()
    }

    fun verify(code: String, password: String, name: String, timezone: String) = action {
        val proof = pending ?: throw IdentityFailure("CHALLENGE_INVALID", "Start a new verification request.")
        if (!code.matches(Regex("[0-9]{6}"))) throw IdentityFailure("VALIDATION_ERROR", "Enter the six-digit code.")
        if (password.length !in 12..128) throw IdentityFailure("VALIDATION_ERROR", "Use 12 to 128 password characters.")
        if (proof.intent.purpose == EntryMode.REGISTER) {
            if (name.isBlank()) throw IdentityFailure("VALIDATION_ERROR", "Enter a display name.")
            repository.verify(proof, code, password, name.trim(), timezone)
            loadAccount()
        } else {
            repository.reset(proof, code, password)
            mutableState.update { it.copy(mode = EntryMode.LOGIN, notice = "Password changed. Previous sessions are signed out.") }
        }
        pending = null
        startIntent = null
        mutableState.update { it.copy(challengeEmail = null) }
    }

    fun saveProfile(name: String, timezone: String, etag: String) = action {
        val current = mutableState.value.profile ?: return@action
        val updated = repository.update(current.user.id, etag, name.trim(), timezone)
        mutableState.update { it.copy(profile = updated, profileSaved = it.profileSaved + 1, notice = "Profile saved.") }
        val events = repository.events(updated.user.id)
        mutableState.update { it.copy(events = events) }
    }

    fun revoke(session: SessionDto) = action {
        val current = mutableState.value.profile ?: return@action
        repository.revoke(current.user.id, session.id)
        loadAccount()
        mutableState.update { it.copy(notice = "Session access revoked.") }
    }

    fun revokeOthers() = action {
        val current = mutableState.value.profile ?: return@action
        repository.revokeOthers(current.user.id)
        loadAccount()
        mutableState.update { it.copy(notice = "Other sessions signed out.") }
    }

    fun logout() = action {
        val current = mutableState.value.profile ?: return@action
        repository.logout(current.user.id)
        pending = null
        startIntent = null
        credentialsChanged()
        mutableState.update { IdentityState(loading = false, busy = true, timezones = it.timezones) }
    }

    fun accountDeleted(notice: AccountDeletionNotice) {
        pending = null
        startIntent = null
        credentialsChanged()
        mutableState.update { IdentityState(loading = false, timezones = it.timezones, deletionNotice = notice) }
    }

    fun signInAgain() = action {
        val current = mutableState.value.profile ?: return@action
        try {
            repository.signInAgain(current.user.id)
        } catch (error: CancellationException) {
            throw error
        } catch (_error: IOException) {
            Unit
        } catch (error: IdentityFailure) {
            if (error.code == "ACCOUNT_CHANGED") throw error
        }
        pending = null
        startIntent = null
        credentialsChanged()
        mutableState.update { IdentityState(loading = false, busy = true, timezones = it.timezones) }
    }
}