package com.community.platform.feature.spaces

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import retrofit2.Response
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SpaceRepository @Inject constructor(private val api: SpaceApi, private val accounts: AccountRepository) {
    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected Space response.")

    private fun validate(block: () -> Unit) {
        try { block() }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }
    }

    private fun identifier(value: String) {
        require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    }

    private fun label(value: String, limit: Int) {
        require(value.isNotBlank() && value.codePointCount(0, value.length) <= limit)
    }

    private fun space(value: SpaceDto): SpaceDto {
        validate {
            identifier(value.id)
            label(value.name, 80)
            require(value.spaceType in setOf("family", "couple", "solo", "group") && value.visibility in setOf("private", "public") && value.status == "active")
            require(value.visibility == "private" || value.spaceType == "group")
            value.description?.let { require(it.codePointCount(0, it.length) <= 280) }
            require(value.spaceType != "solo" || value.role == "owner")
            require(value.role in setOf("owner", "admin", "member") && value.version.matches(Regex("[1-9][0-9]*")) && value.version.toLong() > 0)
            Instant.parse(value.createdAt)
        }
        return value
    }

    private fun invitation(value: SpaceInvitationDto, recipientId: String? = null, spaceId: String? = null): SpaceInvitationDto {
        validate {
            identifier(value.id); identifier(value.spaceId); identifier(value.recipientAccountId)
            label(value.spaceName, 80); label(value.inviterName, 80)
            require(value.role == "member")
            require(value.status in setOf("pending", "accepted", "declined", "revoked", "expired"))
            require(Instant.parse(value.expiresAt) > Instant.parse(value.createdAt))
            require(recipientId == null || recipientId == value.recipientAccountId)
            require(spaceId == null || spaceId == value.spaceId)
        }
        return value
    }

    private fun <Value : Any> page(response: Response<EnvelopeDto<List<Value>>>, cursor: String?, id: (Value) -> String): SpacePage<Value> {
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid()
        if (items.size > 20 || pagination.hasMore != (pagination.nextCursor != null)) invalid()
        if (pagination.nextCursor != null && (pagination.nextCursor.isBlank() || pagination.nextCursor.length > 2048 || pagination.nextCursor == cursor || items.isEmpty())) invalid()
        if (items.map(id).distinct().size != items.size) invalid()
        return SpacePage(items, pagination.nextCursor)
    }

    suspend fun spaces(accountId: String, cursor: String? = null): SpacePage<SpaceDto> = accounts.authorized(accountId) {
        val result = page(api.spaces(it, cursor), cursor, SpaceDto::id)
        result.items.forEach(::space)
        result
    }

    suspend fun read(accountId: String, spaceId: String): SpaceDto = accounts.authorized(accountId) {
        val result = space(accounts.result(api.space(it, spaceId)))
        if (result.id != spaceId) invalid()
        result
    }

    suspend fun inbox(accountId: String, cursor: String? = null): SpacePage<SpaceInvitationDto> = accounts.authorized(accountId) {
        val result = page(api.inbox(it, cursor), cursor, SpaceInvitationDto::id)
        result.items.forEach { item -> invitation(item, recipientId = accountId) }
        result
    }

    suspend fun sent(accountId: String, spaceId: String, cursor: String? = null): SpacePage<SpaceInvitationDto> = accounts.authorized(accountId) {
        val result = page(api.sent(it, spaceId, cursor), cursor, SpaceInvitationDto::id)
        result.items.forEach { item -> invitation(item, spaceId = spaceId) }
        result
    }

    private fun member(value: SpaceMemberDto): SpaceMemberDto {
        validate {
            identifier(value.accountId)
            label(value.displayName, 80)
            require(value.role in setOf("owner", "admin", "member"))
            Instant.parse(value.joinedAt)
            require(value.etag.length in 3..140 && value.etag.matches(Regex("\"[^\"\\r\\n]+\"")))
        }
        return value
    }

    suspend fun members(accountId: String, spaceId: String): List<SpaceMemberDto> = accounts.authorized(accountId) { authorization ->
        val result = accounts.result(api.members(authorization, spaceId))
        validate {
            require(result.size in 1..50)
            result.forEach(::member)
            require(result.map { it.accountId }.distinct().size == result.size)
            require(result.count { it.role == "owner" } == 1)
            require(result.any { it.accountId == accountId })
        }
        result
    }

    suspend fun endMembership(intent: MembershipIntent): MembershipOutcomeDto = accounts.authorized(intent.accountId) { authorization ->
        endMembership(authorization, intent)
    }

    private suspend fun endMembership(authorization: String, intent: MembershipIntent): MembershipOutcomeDto {
        if (intent.action == MembershipAction.LEAVE && intent.targetId != intent.accountId) {
            throw IdentityFailure("ACCESS_DENIED", "You can only leave your own membership.", 403)
        }
        val response = when (intent.action) {
            MembershipAction.REMOVE -> api.removeMember(authorization, intent.spaceId, intent.targetId, intent.requestKey, intent.etag, emptyMap())
            MembershipAction.LEAVE -> api.leave(authorization, intent.spaceId, intent.requestKey, intent.etag, emptyMap())
        }
        val result = accounts.result(response)
        if (result.spaceId != intent.spaceId || result.accountId != intent.targetId || result.status != "removed") invalid()
        return result
    }

    private fun ownership(value: OwnershipTransferDto, accountId: String, spaceId: String): OwnershipTransferDto {
        validate {
            identifier(value.id); identifier(value.fromAccountId); identifier(value.toAccountId); identifier(value.spaceId)
            label(value.spaceName, 80); label(value.fromName, 80); label(value.toName, 80)
            require(value.spaceId == spaceId && value.fromAccountId != value.toAccountId)
            require(accountId == value.fromAccountId || accountId == value.toAccountId)
            require(value.version.matches(Regex("[1-9][0-9]*")))
            require(value.etag.length in 3..140 && value.etag.matches(Regex("\"[^\"\r\n]+\"")))
            require(Instant.parse(value.expiresAt) > Instant.parse(value.createdAt))
            value.resolvedAt?.let(Instant::parse)
            require(value.status in setOf("pending", "accepted", "declined", "cancelled", "expired", "invalidated"))
            require(value.status != "pending" || value.resolvedAt == null)
            require(value.status !in setOf("accepted", "declined", "cancelled") || value.resolvedAt != null)
        }
        return value
    }

    suspend fun ownershipOffers(accountId: String, spaceId: String, cursor: String? = null): SpacePage<OwnershipTransferDto> = accounts.authorized(accountId) {
        val result = page(api.ownershipOffers(it, spaceId, cursor), cursor, OwnershipTransferDto::id)
        result.items.forEach { transfer -> ownership(transfer, accountId, spaceId) }
        result
    }

    suspend fun execute(command: SpaceCommand): SpaceCommandResult = accounts.authorized(command.accountId) { authorization ->
        when (command) {
            is SpaceCommand.ChangeRole -> {
                if (command.space.role != "owner" || command.space.spaceType !in setOf("family", "group")
                    || command.member.role !in setOf("admin", "member") || command.member.accountId == command.accountId
                    || command.role !in setOf("admin", "member") || command.etag != command.member.etag) {
                    throw IdentityFailure("ACCESS_DENIED", "Only the Space owner can change another member's role in a family or group Space.", 403)
                }
                val result = member(accounts.result(api.changeMemberRole(authorization, command.space.id, command.member.accountId,
                    command.requestKey, command.etag, ChangeSpaceMemberRoleDto(command.role))))
                if (result.accountId != command.member.accountId || result.role != command.role) invalid()
                SpaceCommandResult.MemberRoleSaved(result)
            }
            is SpaceCommand.OfferOwnership -> {
                if (command.space.role != "owner" || command.member.role !in setOf("admin", "member") || command.member.accountId == command.accountId) {
                    throw IdentityFailure("ACCESS_DENIED", "Choose another current member for this ownership offer.", 403)
                }
                val result = ownership(accounts.result(api.offerOwnership(authorization, command.space.id, command.requestKey, command.member.etag,
                    CreateOwnershipOfferDto(command.member.accountId))), command.accountId, command.space.id)
                if (result.fromAccountId != command.accountId || result.toAccountId != command.member.accountId) invalid()
                SpaceCommandResult.OwnershipSaved(result)
            }
            is SpaceCommand.RespondOwnership -> {
                val expectedActor = if (command.response == OwnershipResponse.CANCEL) command.transfer.fromAccountId else command.transfer.toAccountId
                if (expectedActor != command.accountId) throw IdentityFailure("ACCESS_DENIED", "This ownership offer belongs to another account.", 403)
                val transfer = command.transfer
                val response = when (command.response) {
                    OwnershipResponse.ACCEPT -> api.acceptOwnership(authorization, transfer.spaceId, transfer.id, transfer.etag, emptyMap())
                    OwnershipResponse.DECLINE -> api.declineOwnership(authorization, transfer.spaceId, transfer.id, transfer.etag, emptyMap())
                    OwnershipResponse.CANCEL -> api.cancelOwnership(authorization, transfer.spaceId, transfer.id, transfer.etag, emptyMap())
                }
                val result = ownership(accounts.result(response), command.accountId, transfer.spaceId)
                val expectedStatus = when (command.response) { OwnershipResponse.ACCEPT -> "accepted"; OwnershipResponse.DECLINE -> "declined"; OwnershipResponse.CANCEL -> "cancelled" }
                if (result.id != transfer.id || result.fromAccountId != transfer.fromAccountId || result.toAccountId != transfer.toAccountId
                    || result.createdAt != transfer.createdAt || result.expiresAt != transfer.expiresAt || result.status != expectedStatus) invalid()
                SpaceCommandResult.OwnershipSaved(result)
            }
            is SpaceCommand.Create -> {
                val group = command.spaceType == "group"
                val body = CreateFamilySpaceDto(command.name, command.spaceType, if (group) command.visibility else null, if (group) command.description else null)
                val result = space(accounts.result(api.create(authorization, command.requestKey, body)))
                if (result.spaceType != command.spaceType || result.visibility != (if (group) command.visibility else "private")) invalid()
                SpaceCommandResult.SpaceSaved(result)
            }
            is SpaceCommand.Invite -> {
                val result = invitation(accounts.result(api.invite(authorization, command.spaceId, command.requestKey, CreateSpaceInvitationDto(command.recipientAccountId))), command.recipientAccountId, command.spaceId)
                SpaceCommandResult.InvitationSaved(result)
            }
            is SpaceCommand.Accept -> {
                if (command.invitation.recipientAccountId != command.accountId) throw IdentityFailure("ACCESS_DENIED", "This invitation belongs to another account.", 403)
                val result = space(accounts.result(api.accept(authorization, command.invitation.id, emptyMap())))
                if (result.id != command.invitation.spaceId) invalid()
                SpaceCommandResult.SpaceSaved(result)
            }
            is SpaceCommand.Decline -> {
                if (command.invitation.recipientAccountId != command.accountId) throw IdentityFailure("ACCESS_DENIED", "This invitation belongs to another account.", 403)
                SpaceCommandResult.InvitationResolved(outcome(api.decline(authorization, command.invitation.id, emptyMap()), command.invitation.id, "declined"))
            }
            is SpaceCommand.Revoke -> SpaceCommandResult.InvitationResolved(outcome(api.revoke(authorization, command.invitation.spaceId, command.invitation.id, emptyMap()), command.invitation.id, "revoked"))
            is SpaceCommand.EndMembership -> {
                val intent = command.intent
                val allowed = when (intent.action) {
                    MembershipAction.REMOVE -> command.member.accountId != command.accountId &&
                        ((command.space.role == "owner" && command.member.role in setOf("admin", "member")) ||
                            (command.space.role == "admin" && command.member.role == "member"))
                    MembershipAction.LEAVE -> command.member.accountId == command.accountId && command.space.role in setOf("admin", "member")
                }
                if (!allowed || command.space.id != intent.spaceId || command.member.accountId != intent.targetId || command.member.etag != intent.etag) {
                    throw IdentityFailure("ACCESS_DENIED", "Choose a current membership you can leave or remove.", 403)
                }
                SpaceCommandResult.MembershipEnded(endMembership(authorization, intent))
            }
        }
    }

    private fun outcome(response: Response<EnvelopeDto<InvitationOutcomeDto>>, invitationId: String, status: String): InvitationOutcomeDto {
        val result = accounts.result(response)
        if (result.id != invitationId || result.status != status) invalid()
        return result
    }
}