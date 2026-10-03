package com.community.platform.feature.spaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.UUID
import javax.inject.Inject

data class SpaceSettingsState(
    val accountId: String? = null, val spaceId: String? = null,
    val basis: SpaceSettingsDto? = null, val name: String = "", val description: String = "",
    val pending: SpaceSettingsIntent? = null, val busy: Boolean = false,
    val conflict: Boolean = false, val denied: Boolean = false, val requiresSignIn: Boolean = false,
    val error: String? = null, val notice: String? = null,
    val confirmingInvitePolicy: Boolean = false, val pendingInvitePolicy: InvitePolicyIntent? = null,
    val confirmingAgentPolicy: Boolean = false, val pendingAgentPolicy: AgentPolicyIntent? = null,
) {
    val dirty: Boolean get() = basis != null && (name != basis.name || description != basis.description.orEmpty())
    val locked: Boolean get() = busy || pending != null || confirmingInvitePolicy || pendingInvitePolicy != null || confirmingAgentPolicy || pendingAgentPolicy != null
}

@HiltViewModel
class SpaceSettingsViewModel @Inject constructor(private val repository: SpaceSettingsRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(SpaceSettingsState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var work: Job? = null

    fun bind(accountId: String?, spaceId: String?) {
        val selected = if (accountId == null) null else spaceId
        if (mutableState.value.accountId == accountId && mutableState.value.spaceId == selected) return
        generation += 1
        work?.cancel()
        mutableState.value = SpaceSettingsState(accountId = accountId, spaceId = selected)
        if (accountId != null && selected != null) reload()
    }

    private fun action(operation: suspend (String, String) -> SpaceSettingsDto) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val space = current.spaceId ?: return
        if (current.busy || current.requiresSignIn || current.denied) return
        val expected = generation
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        work = viewModelScope.launch {
            try {
                val result = operation(account, space)
                if (generation == expected) mutableState.update {
                    it.copy(basis = result, name = result.name, description = result.description.orEmpty(), pending = null, conflict = false,
                        pendingInvitePolicy = null, confirmingInvitePolicy = false,
                        pendingAgentPolicy = null, confirmingAgentPolicy = false,
                        notice = when {
                            current.pendingInvitePolicy != null -> if (result.memberInvites) "Everyone in the Space can now invite people." else "Only you and admins can invite people now."
                            current.pendingAgentPolicy != null -> if (result.agentEnabled) "The agent is on in this Space." else "The agent is off in this Space."
                            current.pending != null -> "Settings saved. Current name: ${result.name}"
                            else -> null
                        })
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (generation == expected && error is IdentityFailure && error.status == 412 && (current.pendingInvitePolicy != null || current.pendingAgentPolicy != null)) {
                    mutableState.update { it.copy(pendingInvitePolicy = null, confirmingInvitePolicy = false,
                        pendingAgentPolicy = null, confirmingAgentPolicy = false, conflict = true,
                        notice = "This Space changed. Reload and review it again.") }
                    try {
                        val fresh = repository.read(account, space)
                        if (generation == expected) mutableState.update { it.copy(basis = fresh, name = fresh.name,
                            description = fresh.description.orEmpty(), conflict = false) }
                    } catch (reloadError: CancellationException) { throw reloadError }
                    catch (reloadError: Exception) { failed(expected, current, reloadError) }
                } else {
                    failed(expected, current, error)
                }
            } finally { if (generation == expected) mutableState.update { it.copy(busy = false) } }
        }
    }

    private fun failed(expected: Long, current: SpaceSettingsState, error: Exception) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        val denied = failure?.status in setOf(401, 403, 404) || failure?.code == "ACCOUNT_CHANGED"
        val definite = failure != null && failure.status in 400..499 && failure.status != 408
        mutableState.update {
            when {
                denied -> SpaceSettingsState(accountId = current.accountId, spaceId = current.spaceId, denied = true,
                    requiresSignIn = failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED", error = error.message)
                else -> it.copy(pending = if (definite) null else it.pending,
                    pendingInvitePolicy = if (definite) null else it.pendingInvitePolicy,
                    confirmingInvitePolicy = if (definite) false else it.confirmingInvitePolicy,
                    pendingAgentPolicy = if (definite) null else it.pendingAgentPolicy,
                    confirmingAgentPolicy = if (definite) false else it.confirmingAgentPolicy,
                    conflict = it.conflict || definite || current.pending == null && current.pendingInvitePolicy == null && current.pendingAgentPolicy == null && it.basis != null,
                    error = if (error is IOException) "No connection. Changes are not confirmed." else error.message ?: "The settings could not be confirmed.")
            }
        }
    }

    fun proposeInvitePolicy() {
        val current = mutableState.value
        val basis = current.basis ?: return
        if (!current.locked && !current.dirty && !current.conflict && !current.denied && !current.requiresSignIn &&
            basis.role == "owner" && basis.spaceType in setOf("family", "group")) {
            mutableState.update { it.copy(confirmingInvitePolicy = true, error = null, notice = null) }
        }
    }

    fun cancelInvitePolicy() {
        val current = mutableState.value
        if (!current.busy && current.pendingInvitePolicy == null) mutableState.update { it.copy(confirmingInvitePolicy = false) }
    }

    fun confirmInvitePolicy() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val basis = current.basis ?: return
        if (current.busy || !current.confirmingInvitePolicy || current.denied || current.requiresSignIn || current.pending != null ||
            basis.role != "owner" || basis.spaceType !in setOf("family", "group")) return
        val intent = current.pendingInvitePolicy ?: InvitePolicyIntent(account, basis.id, !basis.memberInvites, basis.etag, UUID.randomUUID().toString())
        mutableState.update { it.copy(pendingInvitePolicy = intent) }
        action { _, _ -> repository.changeInvitePolicy(intent) }
    }

    // DEC-028: the owner turns the agent on or off in this Space, after a confirmation.
    fun proposeAgentPolicy() {
        val current = mutableState.value
        val basis = current.basis ?: return
        if (!current.locked && !current.dirty && !current.conflict && !current.denied && !current.requiresSignIn && basis.role == "owner") {
            mutableState.update { it.copy(confirmingAgentPolicy = true, error = null, notice = null) }
        }
    }

    fun cancelAgentPolicy() {
        val current = mutableState.value
        if (!current.busy && current.pendingAgentPolicy == null) mutableState.update { it.copy(confirmingAgentPolicy = false) }
    }

    fun confirmAgentPolicy() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val basis = current.basis ?: return
        if (current.busy || !current.confirmingAgentPolicy || current.denied || current.requiresSignIn || current.pending != null ||
            current.pendingInvitePolicy != null || basis.role != "owner") return
        val intent = current.pendingAgentPolicy ?: AgentPolicyIntent(account, basis.id, !basis.agentEnabled, basis.etag, UUID.randomUUID().toString())
        mutableState.update { it.copy(pendingAgentPolicy = intent) }
        action { _, _ -> repository.changeAgentPolicy(intent) }
    }

    fun name(value: String) {
        if (!mutableState.value.locked && !mutableState.value.denied) mutableState.update { it.copy(name = value, notice = null) }
    }

    fun description(value: String) {
        if (!mutableState.value.locked && !mutableState.value.denied) mutableState.update { it.copy(description = value, error = null, notice = null) }
    }

    fun refresh() {
        val current = mutableState.value
        if (!current.locked && !current.dirty && !current.conflict) reload()
    }

    fun reload() {
        if (mutableState.value.locked) return
        action { account, space -> repository.read(account, space) }
    }

    fun save() {
        val current = mutableState.value
        val basis = current.basis ?: return
        val account = current.accountId ?: return
        if (current.locked || current.conflict || current.denied) return
        val name = current.name.trim()
        val invalidTypes = setOf(Character.CONTROL.toInt(), Character.FORMAT.toInt(), Character.SURROGATE.toInt(), Character.PRIVATE_USE.toInt(), Character.UNASSIGNED.toInt())
        if (name.codePointCount(0, name.length) !in 1..80 || name.codePoints().anyMatch { Character.getType(it) in invalidTypes }) {
            mutableState.update { it.copy(error = "Enter a name of 1 to 80 characters without control characters.") }; return
        }
        val description = current.description.trim()
        if (current.description.codePointCount(0, current.description.length) > 280 || current.description.codePoints().anyMatch { it != '\n'.code && Character.getType(it) in invalidTypes }) {
            mutableState.update { it.copy(error = "Keep the description to 280 characters without control characters.") }; return
        }
        val descriptionChanged = description != basis.description.orEmpty()
        if (name == basis.name && !descriptionChanged) return
        mutableState.update { it.copy(pending = SpaceSettingsIntent(account, basis.id, name, basis.etag, UUID.randomUUID().toString(), if (descriptionChanged) description else null)) }
        retry()
    }

    fun retry() {
        if (mutableState.value.pendingInvitePolicy != null) {
            confirmInvitePolicy()
            return
        }
        if (mutableState.value.pendingAgentPolicy != null) {
            confirmAgentPolicy()
            return
        }
        val command = mutableState.value.pending ?: return
        action { _, _ -> repository.save(command) }
    }
}