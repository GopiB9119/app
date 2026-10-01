package com.community.platform.feature.spaces

import com.google.gson.annotations.SerializedName

data class SpaceDto(
    val id: String,
    val name: String,
    @SerializedName("space_type") val spaceType: String,
    val visibility: String,
    val status: String,
    val role: String,
    val version: String,
    @SerializedName("created_at") val createdAt: String,
    val description: String? = null,
)

data class SpaceInvitationDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    @SerializedName("inviter_name") val inviterName: String,
    @SerializedName("recipient_account_id") val recipientAccountId: String,
    val role: String,
    val status: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String,
)

data class InvitationOutcomeDto(val id: String, val status: String)
data class CreateFamilySpaceDto(
    val name: String, @SerializedName("space_type") val spaceType: String = "family",
    val visibility: String? = null, val description: String? = null,
)
data class CreateSpaceInvitationDto(@SerializedName("recipient_account_id") val recipientAccountId: String)
data class SpacePage<Value>(val items: List<Value>, val nextCursor: String?)

data class SpaceMemberDto(
    @SerializedName("account_id") val accountId: String,
    @SerializedName("display_name") val displayName: String,
    val role: String,
    @SerializedName("joined_at") val joinedAt: String,
    val etag: String,
)

data class MembershipOutcomeDto(
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("account_id") val accountId: String,
    val status: String,
)

enum class MembershipAction { REMOVE, LEAVE }
data class MembershipIntent(val accountId: String, val spaceId: String, val targetId: String, val action: MembershipAction, val etag: String, val requestKey: String)
data class ChangeSpaceMemberRoleDto(val role: String)

data class OwnershipTransferDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    @SerializedName("from_account_id") val fromAccountId: String,
    @SerializedName("from_name") val fromName: String,
    @SerializedName("to_account_id") val toAccountId: String,
    @SerializedName("to_name") val toName: String,
    val status: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String,
    @SerializedName("resolved_at") val resolvedAt: String?,
    val version: String,
    val etag: String,
)
data class CreateOwnershipOfferDto(@SerializedName("recipient_account_id") val recipientAccountId: String)
enum class OwnershipResponse { ACCEPT, DECLINE, CANCEL }

sealed interface SpaceCommand {
    val accountId: String

    data class Create(override val accountId: String, val name: String, val requestKey: String, val spaceType: String = "family", val visibility: String = "private", val description: String = "") : SpaceCommand
    data class Invite(override val accountId: String, val spaceId: String, val recipientAccountId: String, val requestKey: String) : SpaceCommand
    data class Accept(override val accountId: String, val invitation: SpaceInvitationDto) : SpaceCommand
    data class Decline(override val accountId: String, val invitation: SpaceInvitationDto) : SpaceCommand
    data class Revoke(override val accountId: String, val invitation: SpaceInvitationDto) : SpaceCommand
    data class EndMembership(val intent: MembershipIntent, val member: SpaceMemberDto, val spaceName: String, val space: SpaceDto) : SpaceCommand {
        override val accountId: String get() = intent.accountId
    }
    data class ChangeRole(override val accountId: String, val space: SpaceDto, val member: SpaceMemberDto, val role: String, val requestKey: String, val etag: String = member.etag) : SpaceCommand
    data class OfferOwnership(override val accountId: String, val space: SpaceDto, val member: SpaceMemberDto, val requestKey: String) : SpaceCommand
    data class RespondOwnership(override val accountId: String, val transfer: OwnershipTransferDto, val response: OwnershipResponse) : SpaceCommand
}

sealed interface SpaceCommandResult {
    data class SpaceSaved(val space: SpaceDto) : SpaceCommandResult
    data class InvitationSaved(val invitation: SpaceInvitationDto) : SpaceCommandResult
    data class InvitationResolved(val outcome: InvitationOutcomeDto) : SpaceCommandResult
    data class MembershipEnded(val outcome: MembershipOutcomeDto) : SpaceCommandResult
    data class MemberRoleSaved(val member: SpaceMemberDto) : SpaceCommandResult
    data class OwnershipSaved(val transfer: OwnershipTransferDto) : SpaceCommandResult
}