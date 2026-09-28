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

enum class SpaceTab { SPACES, INVITATIONS }

data class SpaceWorkspaceState(
    val accountId: String? = null,
    val tab: SpaceTab = SpaceTab.SPACES,
    val busy: Boolean = false,
    val spaces: List<SpaceDto> = emptyList(),
    val spaceCursor: String? = null,
    val invitations: List<SpaceInvitationDto> = emptyList(),
    val invitationCursor: String? = null,
    val selectedSpace: SpaceDto? = null,
    val members: List<SpaceMemberDto> = emptyList(),
    val showingMembers: Boolean = false,
    val ownershipOffers: List<OwnershipTransferDto> = emptyList(),
    val ownershipCursor: String? = null,
    val ownershipLoaded: Boolean = false,
    val sent: List<SpaceInvitationDto> = emptyList(),
    val sentCursor: String? = null,
    val creating: Boolean = false,
    val nameDraft: String = "",
    val recipientDraft: String = "",
    val confirmation: SpaceCommand? = null,
    val pending: SpaceCommand? = null,
    val requiresSignIn: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
) {
    val locked: Boolean get() = busy || pending != null
    val dirty: Boolean get() = nameDraft.isNotEmpty() || recipientDraft.isNotEmpty()
    val navigationLocked: Boolean get() = locked || dirty || confirmation != null
}

@HiltViewModel
class SpaceViewModel @Inject constructor(private val repository: SpaceRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(SpaceWorkspaceState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var work: Job? = null

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        work?.cancel()
        mutableState.value = SpaceWorkspaceState(accountId = accountId)
        if (accountId != null) refresh()
    }

    private fun update(expected: Long, transform: (SpaceWorkspaceState) -> SpaceWorkspaceState) {
        if (generation == expected) mutableState.update(transform)
    }

    private fun action(operation: suspend (String, Long) -> Unit) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.busy || current.requiresSignIn) return
        val expected = generation
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        work = viewModelScope.launch {
            try { operation(accountId, expected) }
            catch (error: CancellationException) { throw error }
            catch (error: IdentityFailure) {
                update(expected) {
                    when {
                        error.status == 401 || error.code == "ACCOUNT_CHANGED" -> SpaceWorkspaceState(accountId = it.accountId, requiresSignIn = true, error = error.message)
                        error.code == "REAUTHENTICATION_REQUIRED" -> it.copy(pending = null, confirmation = null, error = error.message)
                        error.status in setOf(403, 404) -> SpaceWorkspaceState(accountId = it.accountId, tab = it.tab, error = error.message)
                        error.status in 400..499 && error.status != 408 && (it.pending is SpaceCommand.OfferOwnership || it.pending is SpaceCommand.RespondOwnership) -> it.copy(pending = null, confirmation = null, members = emptyList(), ownershipOffers = emptyList(), ownershipCursor = null, ownershipLoaded = false, error = error.message)
                        error.status == 412 && it.pending is SpaceCommand.EndMembership -> it.copy(pending = null, confirmation = null, members = emptyList(), error = error.message)
                        error.status in 400..499 && error.status != 408 -> it.copy(pending = null, confirmation = null, error = error.message)
                        else -> it.copy(error = error.message)
                    }
                }
            }
            catch (_error: IOException) { update(expected) { it.copy(error = "No connection. Changes are not confirmed.") } }
            catch (_error: Exception) { update(expected) { it.copy(error = "The Space service returned an unexpected response. Changes are not confirmed.") } }
            finally { update(expected) { it.copy(busy = false) } }
        }
    }

    fun refresh() {
        val current = mutableState.value
        if (current.navigationLocked || current.creating) return
        action { accountId, expected ->
            current.selectedSpace?.let { loadSpace(accountId, it.id, expected) }
            val spaces = repository.spaces(accountId)
            update(expected) { it.copy(spaces = spaces.items, spaceCursor = spaces.nextCursor) }
            val inbox = repository.inbox(accountId)
            update(expected) { it.copy(invitations = inbox.items, invitationCursor = inbox.nextCursor) }
        }
    }

    private suspend fun loadSpace(accountId: String, spaceId: String, expected: Long) {
        val selected = repository.read(accountId, spaceId)
        update(expected) { it.copy(selectedSpace = selected, sent = emptyList(), sentCursor = null, members = emptyList(), ownershipOffers = emptyList(), ownershipCursor = null, ownershipLoaded = false) }
        if (mutableState.value.showingMembers) loadMembers(accountId, spaceId, expected)
        if (mutableState.value.selectedSpace?.role == "owner") {
            val sent = repository.sent(accountId, spaceId)
            update(expected) { it.copy(sent = sent.items, sentCursor = sent.nextCursor) }
        }
    }

    private suspend fun loadMembers(accountId: String, spaceId: String, expected: Long) {
        val members = repository.members(accountId, spaceId)
        val own = members.first { it.accountId == accountId }
        val offers = repository.ownershipOffers(accountId, spaceId)
        update(expected) { it.copy(members = members, showingMembers = true, selectedSpace = it.selectedSpace?.copy(role = own.role), ownershipOffers = offers.items, ownershipCursor = offers.nextCursor, ownershipLoaded = true) }
    }

    fun showMembers() {
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        if (current.navigationLocked) return
        action { accountId, expected ->
            update(expected) { it.copy(members = emptyList(), showingMembers = true, ownershipOffers = emptyList(), ownershipCursor = null, ownershipLoaded = false) }
            loadMembers(accountId, selected.id, expected)
        }
    }

    fun proposeMembership(member: SpaceMemberDto, action: MembershipAction) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val space = current.selectedSpace ?: return
        if (current.navigationLocked || current.members.none { it == member }) return
        val own = current.members.firstOrNull { it.accountId == accountId } ?: return
        val allowed = when (action) {
            MembershipAction.LEAVE -> member.accountId == accountId && own.role == "member"
            MembershipAction.REMOVE -> own.role == "owner" && member.role == "member" && member.accountId != accountId
        }
        if (!allowed) return
        val intent = MembershipIntent(accountId, space.id, member.accountId, action, member.etag, UUID.randomUUID().toString())
        mutableState.update { it.copy(confirmation = SpaceCommand.EndMembership(intent, member, space.name), error = null, notice = null) }
    }

    fun offerOwnership(member: SpaceMemberDto) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val selected = current.selectedSpace ?: return
        val self = current.members.singleOrNull { it.accountId == accountId } ?: return
        if (current.navigationLocked || !current.ownershipLoaded || selected.role != "owner" || self.role != "owner"
            || member.role != "member" || member.accountId == accountId || current.members.none { it == member }
            || current.ownershipOffers.any { it.status == "pending" }) return
        mutableState.update { it.copy(confirmation = SpaceCommand.OfferOwnership(accountId, selected, member, UUID.randomUUID().toString()), error = null, notice = null) }
    }

    fun respondOwnership(transfer: OwnershipTransferDto, response: OwnershipResponse) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.navigationLocked || !current.ownershipLoaded || current.selectedSpace?.id != transfer.spaceId
            || transfer.status != "pending" || current.ownershipOffers.none { it == transfer }) return
        val expectedActor = if (response == OwnershipResponse.CANCEL) transfer.fromAccountId else transfer.toAccountId
        if (expectedActor != accountId) return
        mutableState.update { it.copy(confirmation = SpaceCommand.RespondOwnership(accountId, transfer, response), error = null, notice = null) }
    }

    fun selectTab(tab: SpaceTab) {
        val current = mutableState.value
        if (current.navigationLocked || current.creating || current.selectedSpace != null) return
        mutableState.update { it.copy(tab = tab, error = null, notice = null) }
    }

    fun open(spaceId: String) {
        val current = mutableState.value
        if (current.navigationLocked || current.spaces.none { it.id == spaceId }) return
        action { accountId, expected -> loadSpace(accountId, spaceId, expected) }
    }

    fun startCreate() {
        if (!mutableState.value.navigationLocked) mutableState.update { it.copy(creating = true, nameDraft = "", error = null, notice = null) }
    }

    fun name(value: String) {
        val current = mutableState.value
        if (!current.locked && current.creating) mutableState.update { it.copy(nameDraft = value, error = null, notice = null) }
    }

    fun recipient(value: String) {
        val current = mutableState.value
        if (!current.locked && current.confirmation == null && current.selectedSpace?.role == "owner") mutableState.update { it.copy(recipientDraft = value, error = null, notice = null) }
    }

    fun discardDraft() {
        if (!mutableState.value.locked) mutableState.update { it.copy(nameDraft = "", recipientDraft = "", error = null) }
    }

    fun closePanel() {
        if (!mutableState.value.locked && mutableState.value.confirmation == null) mutableState.update { it.copy(creating = false, nameDraft = "", recipientDraft = "", selectedSpace = null, members = emptyList(), showingMembers = false, ownershipOffers = emptyList(), ownershipCursor = null, ownershipLoaded = false, sent = emptyList(), sentCursor = null, error = null, notice = null) }
    }

    fun create() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.locked || !current.creating) return
        val name = current.nameDraft.trim()
        val invalidType = setOf(Character.CONTROL.toInt(), Character.FORMAT.toInt(), Character.SURROGATE.toInt(), Character.PRIVATE_USE.toInt(), Character.UNASSIGNED.toInt())
        if (name.codePointCount(0, name.length) !in 1..80 || name.codePoints().anyMatch { Character.getType(it) in invalidType }) {
            mutableState.update { it.copy(error = "Enter a family name of 1 to 80 characters without control characters.") }
            return
        }
        mutableState.update { it.copy(pending = SpaceCommand.Create(accountId, name, UUID.randomUUID().toString())) }
        executePending()
    }

    fun invite() {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        val selected = current.selectedSpace ?: return
        if (current.locked || current.confirmation != null || selected.role != "owner") return
        val input = current.recipientDraft.trim()
        val recipient = try { UUID.fromString(input).toString().also { require(it.equals(input, ignoreCase = true)) } }
        catch (_error: IllegalArgumentException) {
            mutableState.update { it.copy(error = "Enter the intended recipient's full account ID.") }; return
        }
        if (recipient == accountId) { mutableState.update { it.copy(error = "Choose another account to invite.") }; return }
        mutableState.update { it.copy(pending = SpaceCommand.Invite(accountId, selected.id, recipient, UUID.randomUUID().toString())) }
        executePending()
    }

    fun propose(command: SpaceCommand) {
        val current = mutableState.value
        if (current.navigationLocked || command.accountId != current.accountId) return
        when (command) {
            is SpaceCommand.Accept -> if (command.invitation.recipientAccountId != current.accountId || command.invitation.status != "pending" || current.invitations.none { it.id == command.invitation.id }) return
            is SpaceCommand.Decline -> if (command.invitation.recipientAccountId != current.accountId || command.invitation.status != "pending" || current.invitations.none { it.id == command.invitation.id }) return
            is SpaceCommand.Revoke -> if (current.selectedSpace?.role != "owner" || current.selectedSpace.id != command.invitation.spaceId || command.invitation.status != "pending" || current.sent.none { it.id == command.invitation.id }) return
            else -> return
        }
        mutableState.update { it.copy(confirmation = command, error = null, notice = null) }
    }

    fun cancelConfirmation() { if (!mutableState.value.locked) mutableState.update { it.copy(confirmation = null) } }
    fun confirm() {
        val current = mutableState.value
        if (current.locked || current.confirmation == null) return
        mutableState.update { it.copy(pending = current.confirmation, confirmation = null) }
        executePending()
    }
    fun retry() { if (mutableState.value.pending != null) executePending() }

    private fun executePending() {
        val command = mutableState.value.pending ?: return
        action { accountId, expected ->
            if (command.accountId != accountId) throw IdentityFailure("ACCOUNT_CHANGED", "Sign in again before continuing.", 401)
            val result = repository.execute(command)
            if (result is SpaceCommandResult.OwnershipSaved) {
                val notice = when (result.transfer.status) {
                    "pending" -> "Ownership offer awaiting acceptance."
                    "accepted" -> "Ownership offer accepted."
                    "declined" -> "Ownership offer declined."
                    "cancelled" -> "Ownership offer withdrawn."
                    "expired" -> "Ownership offer expired."
                    else -> "Ownership offer is no longer valid."
                }
                update(expected) { it.copy(pending = null, confirmation = null, selectedSpace = null, members = emptyList(), showingMembers = true,
                    spaces = it.spaces.filterNot { space -> space.id == result.transfer.spaceId },
                    sent = emptyList(), sentCursor = null, ownershipOffers = emptyList(), ownershipCursor = null, ownershipLoaded = false, notice = notice) }
                loadSpace(accountId, result.transfer.spaceId, expected)
                val page = repository.spaces(accountId)
                update(expected) { it.copy(spaces = page.items, spaceCursor = page.nextCursor, notice = notice) }
                return@action
            }
            update(expected) { current ->
                when (result) {
                    is SpaceCommandResult.OwnershipSaved -> current
                    is SpaceCommandResult.SpaceSaved -> current.copy(
                        spaces = listOf(result.space) + current.spaces.filterNot { it.id == result.space.id },
                        invitations = if (command is SpaceCommand.Accept) current.invitations.filterNot { it.id == command.invitation.id } else current.invitations,
                        selectedSpace = result.space, members = emptyList(), showingMembers = false, ownershipOffers = emptyList(), ownershipCursor = null, ownershipLoaded = false, sent = emptyList(), sentCursor = null, creating = false, nameDraft = "", recipientDraft = "", tab = SpaceTab.SPACES,
                        pending = null, notice = if (command is SpaceCommand.Accept) "Joined ${result.space.name}." else "Family Space saved.",
                    )
                    is SpaceCommandResult.InvitationSaved -> current.copy(
                        sent = listOf(result.invitation) + current.sent.filterNot { it.id == result.invitation.id },
                        recipientDraft = "", pending = null,
                        notice = when (result.invitation.status) {
                            "pending" -> "Invitation created."
                            "accepted" -> "Invitation already accepted."
                            "declined" -> "Invitation already declined."
                            "revoked" -> "Invitation was revoked."
                            else -> "Invitation expired."
                        },
                    )
                    is SpaceCommandResult.InvitationResolved -> current.copy(
                        invitations = current.invitations.filterNot { it.id == result.outcome.id },
                        sent = current.sent.map { if (it.id == result.outcome.id) it.copy(status = result.outcome.status) else it },
                        pending = null, notice = if (result.outcome.status == "declined") "Invitation declined." else "Invitation revoked.",
                    )
                    is SpaceCommandResult.MembershipEnded -> if (result.outcome.accountId == accountId) {
                        SpaceWorkspaceState(accountId = accountId, spaces = current.spaces.filterNot { it.id == result.outcome.spaceId }, notice = "You left the family Space.")
                    } else {
                        current.copy(members = current.members.filterNot { it.accountId == result.outcome.accountId }, pending = null, confirmation = null, notice = "Member removed.")
                    }
                }
            }
        }
    }

    fun moreSpaces() {
        val current = mutableState.value
        if (current.navigationLocked || current.spaceCursor == null) return
        action { accountId, expected ->
            val page = repository.spaces(accountId, current.spaceCursor)
            update(expected) { it.copy(spaces = (it.spaces + page.items).distinctBy(SpaceDto::id), spaceCursor = page.nextCursor) }
        }
    }
    fun moreInvitations() {
        val current = mutableState.value
        if (current.navigationLocked || current.invitationCursor == null) return
        action { accountId, expected ->
            val page = repository.inbox(accountId, current.invitationCursor)
            update(expected) { it.copy(invitations = (it.invitations + page.items).distinctBy(SpaceInvitationDto::id), invitationCursor = page.nextCursor) }
        }
    }
    fun moreSent() {
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        if (current.navigationLocked || selected.role != "owner" || current.sentCursor == null) return
        action { accountId, expected ->
            val page = repository.sent(accountId, selected.id, current.sentCursor)
            update(expected) { it.copy(sent = (it.sent + page.items).distinctBy(SpaceInvitationDto::id), sentCursor = page.nextCursor) }
        }
    }

    fun moreOwnershipOffers() {
        val current = mutableState.value
        val selected = current.selectedSpace ?: return
        val cursor = current.ownershipCursor ?: return
        if (current.navigationLocked) return
        action { accountId, expected ->
            val page = repository.ownershipOffers(accountId, selected.id, cursor)
            update(expected) { it.copy(ownershipOffers = (it.ownershipOffers + page.items).distinctBy(OwnershipTransferDto::id), ownershipCursor = page.nextCursor) }
        }
    }
}