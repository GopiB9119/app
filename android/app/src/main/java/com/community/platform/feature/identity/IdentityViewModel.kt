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
import java.util.UUID
import javax.inject.Inject

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
)

@HiltViewModel
class IdentityViewModel @Inject constructor(private val repository: AccountRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(IdentityState())
    val state = mutableState.asStateFlow()
    private var startIntent: StartIntent? = null
    private var pending: PendingProof? = null

    init { refresh() }

    private fun action(operation: suspend () -> Unit) {
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
                mutableState.update { it.copy(error = "No connection. Your changes are not confirmed.") }
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

    fun refresh() = action {
        loadAccount()
        val zones = repository.timezones()
        mutableState.update { it.copy(timezones = zones) }
    }

    fun mode(mode: EntryMode) {
        if (mutableState.value.busy) return
        pending = null
        startIntent = null
        mutableState.update { it.copy(mode = mode, challengeEmail = null, error = null, notice = null) }
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
        repository.login(email.trim(), password)
        pending = null
        startIntent = null
        mutableState.update { it.copy(challengeEmail = null) }
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
        mutableState.update { IdentityState(loading = false, busy = true, timezones = it.timezones) }
    }
}