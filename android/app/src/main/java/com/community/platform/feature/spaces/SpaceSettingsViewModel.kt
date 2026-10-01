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
) {
    val dirty: Boolean get() = basis != null && (name != basis.name || description != basis.description.orEmpty())
    val locked: Boolean get() = busy || pending != null
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
                        notice = if (current.pending != null) "Settings saved. Current name: ${result.name}" else null)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (generation == expected) mutableState.update {
                    val failure = error as? IdentityFailure
                    val denied = failure?.status in setOf(401, 403, 404) || failure?.code == "ACCOUNT_CHANGED"
                    val definite = failure != null && failure.status in 400..499 && failure.status != 408
                    when {
                        denied -> SpaceSettingsState(accountId = account, spaceId = space, denied = true,
                            requiresSignIn = failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED", error = error.message)
                        else -> it.copy(pending = if (definite) null else it.pending,
                            conflict = it.conflict || definite || current.pending == null && it.basis != null,
                            error = if (error is IOException) "No connection. Changes are not confirmed." else error.message ?: "The settings could not be confirmed.")
                    }
                }
            } finally { if (generation == expected) mutableState.update { it.copy(busy = false) } }
        }
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
        val command = mutableState.value.pending ?: return
        action { _, _ -> repository.save(command) }
    }
}