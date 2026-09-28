package com.community.platform.feature.spaces

import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.PaginationDto
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class SpaceViewModelTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private var model: SpaceViewModel? = null

    @Before fun dispatcher() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null); Dispatchers.resetMain() }

    private suspend fun ready(api: SpaceApi = fixture.api): SpaceViewModel {
        fixture.api.invitation = fixture.invitation.copy(recipientAccountId = fixture.accountId)
        val value = SpaceViewModel(SpaceRepository(api, fixture.accounts))
        model = value
        value.bind(fixture.accountId)
        withTimeout(5000) { value.state.first { !it.busy } }
        return value
    }

    private suspend fun idle(value: SpaceViewModel) = withTimeout(5000) { value.state.first { !it.busy } }

    @Test fun ownershipOfferRequiresExactMemberReviewAndNeverGrantsOwnerImmediately() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value); value.showMembers(); idle(value)
        value.offerOwnership(fixture.otherMember.copy(etag = "\"not-reviewed\""))
        assertNull(value.state.value.confirmation)
        value.offerOwnership(fixture.otherMember)
        assertTrue(value.state.value.confirmation is SpaceCommand.OfferOwnership)
        assertTrue(fixture.api.ownershipKeys.isEmpty())
        value.cancelConfirmation(); value.confirm(); idle(value)
        assertTrue(fixture.api.ownershipKeys.isEmpty())
        value.offerOwnership(fixture.otherMember); value.confirm(); idle(value)
        assertEquals(1, fixture.api.ownershipKeys.size)
        assertEquals("owner", value.state.value.selectedSpace!!.role)
        assertEquals("Ownership offer awaiting acceptance.", value.state.value.notice)
    }

    @Test fun uncertainOwnershipOfferRetainsTheSameMemberEtagAndKey() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value); value.showMembers(); idle(value)
        value.offerOwnership(fixture.otherMember)
        fixture.api.failure = 503
        value.confirm(); idle(value)
        val command = value.state.value.pending as SpaceCommand.OfferOwnership
        value.closePanel(); value.refresh(); value.showMembers(); value.recipient(fixture.recipientId); value.invite()
        value.offerOwnership(fixture.ownerMember)
        assertEquals(command, value.state.value.pending)
        assertEquals(1, fixture.api.ownershipKeys.size)
        fixture.api.failure = 0
        value.retry(); idle(value)
        assertEquals(listOf(command.requestKey, command.requestKey), fixture.api.ownershipKeys)
        assertEquals(listOf(command.member.etag, command.member.etag), fixture.api.ownershipEtags)
        assertNull(value.state.value.pending)
    }

    @Test fun ownershipAcceptanceUsesRecipientConfirmationAndReloadsCurrentRoles() = runBlocking {
        fixture.api.space = fixture.space.copy(role = "member")
        fixture.api.roster = listOf(fixture.ownerMember.copy(role = "member"), fixture.otherMember.copy(role = "owner"))
        val transfer = fixture.transfer.copy(fromAccountId = fixture.recipientId, toAccountId = fixture.accountId)
        fixture.api.transfer = transfer
        fixture.api.transfers = listOf(transfer)
        val value = ready()
        value.open(fixture.spaceId); idle(value); value.showMembers(); idle(value)
        value.respondOwnership(transfer, OwnershipResponse.CANCEL)
        assertNull(value.state.value.confirmation)
        value.respondOwnership(transfer, OwnershipResponse.ACCEPT)
        assertTrue(fixture.api.ownershipResponses.isEmpty())
        fixture.api.space = fixture.space
        fixture.api.roster = listOf(fixture.ownerMember, fixture.otherMember)
        value.confirm(); idle(value)
        assertEquals(listOf(OwnershipResponse.ACCEPT), fixture.api.ownershipResponses)
        assertEquals("owner", value.state.value.selectedSpace!!.role)
        assertEquals("Ownership offer accepted.", value.state.value.notice)
    }

    @Test fun ownershipAcceptanceReceiptDoesNotInventCurrentOwnerPrivileges() = runBlocking {
        fixture.api.space = fixture.space.copy(role = "member")
        fixture.api.roster = listOf(fixture.ownerMember.copy(role = "member"), fixture.otherMember.copy(role = "owner"))
        val transfer = fixture.transfer.copy(fromAccountId = fixture.recipientId, toAccountId = fixture.accountId)
        fixture.api.transfer = transfer; fixture.api.transfers = listOf(transfer)
        val value = ready()
        value.open(fixture.spaceId); idle(value); value.showMembers(); idle(value)
        value.respondOwnership(transfer, OwnershipResponse.ACCEPT); value.confirm(); idle(value)
        assertEquals("member", value.state.value.selectedSpace!!.role)
        assertTrue(value.state.value.sent.isEmpty())
        assertNull(value.state.value.pending)
    }

    @Test fun staleOwnershipReviewRequiresReloadAndCannotReplayWithANewKey() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value); value.showMembers(); idle(value)
        value.offerOwnership(fixture.otherMember)
        fixture.api.failure = 412
        value.confirm(); idle(value)
        assertNull(value.state.value.pending)
        assertTrue(value.state.value.members.isEmpty())
        assertTrue(!value.state.value.ownershipLoaded)
        value.retry(); value.offerOwnership(fixture.otherMember)
        assertNull(value.state.value.confirmation)
        assertEquals(1, fixture.api.ownershipKeys.size)
    }

    @Test fun accountChangeDropsUncertainOwnershipWithoutSendingItAgain() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value); value.showMembers(); idle(value)
        value.offerOwnership(fixture.otherMember); fixture.api.failure = 503
        value.confirm(); idle(value)
        assertNotNull(value.state.value.pending)
        value.bind(null); value.retry()
        assertEquals(SpaceWorkspaceState(), value.state.value)
        assertEquals(1, fixture.api.ownershipKeys.size)
    }

    @Test fun uncertainSpaceCreationLocksNameAndRetainsTheExactOriginalRequest() = runBlocking {
        val value = ready()
        value.startCreate(); value.name("  Morgan family  ")
        fixture.api.failure = 503
        value.create(); idle(value)
        val command = value.state.value.pending as SpaceCommand.Create
        value.name("Different family"); value.refresh(); value.create(); value.selectTab(SpaceTab.INVITATIONS)
        assertEquals(command, value.state.value.pending)
        assertEquals("  Morgan family  ", value.state.value.nameDraft)
        assertEquals(1, fixture.api.keys.size)
        assertNull(value.state.value.notice)
        fixture.api.failure = 0
        value.retry(); idle(value)
        assertEquals(listOf(command.requestKey, command.requestKey), fixture.api.keys)
        assertEquals(listOf(CreateFamilySpaceDto("Morgan family"), CreateFamilySpaceDto("Morgan family")), fixture.api.creations)
        assertNull(value.state.value.pending)
        assertEquals("Family Space saved.", value.state.value.notice)
    }

    @Test fun invitationRetryPreservesItsRecipientAndDoesNotClaimAnAcceptedReplayIsPending() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        value.recipient(fixture.recipientId)
        fixture.api.failure = 503
        value.invite(); idle(value)
        val command = value.state.value.pending as SpaceCommand.Invite
        value.recipient(fixture.accountId); value.closePanel(); value.refresh()
        assertEquals(fixture.recipientId, value.state.value.recipientDraft)
        assertEquals(command, value.state.value.pending)
        fixture.api.failure = 0
        fixture.api.invitation = fixture.invitation.copy(status = "accepted")
        value.retry(); idle(value)
        assertEquals(listOf(command.requestKey, command.requestKey), fixture.api.keys)
        assertEquals("Invitation already accepted.", value.state.value.notice)
        assertEquals("accepted", value.state.value.sent.first().status)
    }

    @Test fun incomingInvitationDoesNotGrantMembershipBeforeExplicitAcceptance() = runBlocking {
        fixture.api.listedSpaces = emptyList()
        val value = ready()
        val invitation = value.state.value.invitations.single()
        value.selectTab(SpaceTab.INVITATIONS)
        value.propose(SpaceCommand.Accept(fixture.accountId, invitation))
        assertTrue(fixture.api.actions.isEmpty())
        assertNull(value.state.value.selectedSpace)
        assertTrue(value.state.value.spaces.isEmpty())
        value.cancelConfirmation()
        assertTrue(fixture.api.actions.isEmpty())
        value.propose(SpaceCommand.Accept(fixture.accountId, invitation))
        value.confirm(); idle(value)
        assertEquals(listOf("accept" to invitation.id), fixture.api.actions)
        assertEquals("member", value.state.value.selectedSpace!!.role)
        assertEquals(listOf(fixture.spaceId), value.state.value.spaces.map { it.id })
        assertTrue(value.state.value.invitations.isEmpty())
        assertEquals("Joined Morgan family.", value.state.value.notice)
    }

    @Test fun declineAndRevokeNeedConfirmationAndKeepTheSameInvitationIdentity() = runBlocking {
        val value = ready()
        val incoming = value.state.value.invitations.single()
        value.propose(SpaceCommand.Decline(fixture.accountId, incoming))
        value.confirm(); idle(value)
        assertTrue(value.state.value.invitations.isEmpty())
        assertEquals("Invitation declined.", value.state.value.notice)
        value.open(fixture.spaceId); idle(value)
        val sent = value.state.value.sent.single()
        value.propose(SpaceCommand.Revoke(fixture.accountId, sent))
        value.cancelConfirmation()
        assertEquals(listOf("decline" to incoming.id), fixture.api.actions)
        value.propose(SpaceCommand.Revoke(fixture.accountId, sent))
        value.confirm(); idle(value)
        assertEquals("revoked", value.state.value.sent.single().status)
        assertEquals(listOf("decline" to incoming.id, "revoke" to sent.id), fixture.api.actions)
    }

    @Test fun memberCannotStartOwnerInvitationOperations() = runBlocking {
        fixture.api.space = fixture.space.copy(role = "member")
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        value.recipient(fixture.recipientId); value.invite()
        value.propose(SpaceCommand.Revoke(fixture.accountId, fixture.invitation))
        assertEquals("", value.state.value.recipientDraft)
        assertNull(value.state.value.confirmation)
        assertTrue(fixture.api.keys.isEmpty())
        assertTrue(value.state.value.sent.isEmpty())
    }

    @Test fun expiredInvitationCannotCreateFalseMembershipOrRetainAnUncertainCommand() = runBlocking {
        val value = ready()
        value.propose(SpaceCommand.Accept(fixture.accountId, value.state.value.invitations.single()))
        fixture.api.failure = 410
        value.confirm(); idle(value)
        assertNull(value.state.value.pending)
        assertNull(value.state.value.selectedSpace)
        assertNull(value.state.value.notice)
        assertNotNull(value.state.value.error)
    }

    @Test fun lostSessionClearsNamesAndInvitationDetails() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        fixture.api.failure = 401
        value.refresh(); idle(value)
        assertTrue(value.state.value.requiresSignIn)
        assertTrue(value.state.value.spaces.isEmpty())
        assertTrue(value.state.value.invitations.isEmpty())
        assertTrue(value.state.value.sent.isEmpty())
        assertNull(value.state.value.selectedSpace)
    }

    @Test fun switchingAccountDiscardsTheOldPageWhileAReadIsPending() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api = object : SpaceApi by fixture.api {
            override suspend fun spaces(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<SpaceDto>>> {
                entered.complete(Unit)
                release.await()
                return fixture.api.spaces(authorization, cursor, limit)
            }
        }
        val value = SpaceViewModel(SpaceRepository(api, fixture.accounts))
        model = value
        value.bind(fixture.accountId)
        withTimeout(5000) { entered.await() }
        value.bind(null)
        release.complete(Unit)
        assertEquals(SpaceWorkspaceState(), value.state.value)
        assertTrue(fixture.api.keys.isEmpty())
    }

    @Test fun revokedSelectionIsClearedBeforeAnUnrelatedInboxOutage() = runBlocking {
        var revoked = false
        val api = object : SpaceApi by fixture.api {
            override suspend fun spaces(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<SpaceDto>>> =
                if (revoked) Response.success(EnvelopeDto(emptyList(), null, PaginationDto(null, false))) else fixture.api.spaces(authorization, cursor, limit)

            override suspend fun space(authorization: String, spaceId: String): Response<EnvelopeDto<SpaceDto>> =
                if (revoked) Response.error(404, """{"error":{"code":"ACCESS_DENIED","message":"Space unavailable."}}""".toResponseBody()) else fixture.api.space(authorization, spaceId)

            override suspend fun inbox(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<SpaceInvitationDto>>> =
                if (revoked) Response.error(503, """{"error":{"code":"TEMPORARY_FAILURE","message":"Inbox unavailable."}}""".toResponseBody()) else fixture.api.inbox(authorization, cursor, limit)
        }
        val value = ready(api)
        value.open(fixture.spaceId); idle(value)
        assertNotNull(value.state.value.selectedSpace)
        assertTrue(value.state.value.sent.isNotEmpty())
        revoked = true
        value.refresh(); idle(value)
        assertNull(value.state.value.selectedSpace)
        assertTrue(value.state.value.sent.isEmpty())
        assertTrue(value.state.value.invitations.isEmpty())
        assertEquals("Space unavailable.", value.state.value.error)
    }

    @Test fun membershipRemovalRequiresExactRosterReviewAndRetainsItsUnknownCommand() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        value.showMembers(); idle(value)
        value.proposeMembership(fixture.otherMember.copy(etag = "\"other-admission\""), MembershipAction.REMOVE)
        assertNull(value.state.value.confirmation)
        value.proposeMembership(fixture.otherMember, MembershipAction.REMOVE)
        assertTrue(fixture.api.membershipCommands.isEmpty())
        value.cancelConfirmation()
        assertTrue(fixture.api.membershipCommands.isEmpty())
        value.proposeMembership(fixture.otherMember, MembershipAction.REMOVE)
        fixture.api.failure = 503
        value.confirm(); idle(value)
        val pending = value.state.value.pending as SpaceCommand.EndMembership
        value.refresh(); value.showMembers(); value.closePanel()
        value.proposeMembership(fixture.ownerMember, MembershipAction.REMOVE)
        assertEquals(pending, value.state.value.pending)
        assertEquals(1, fixture.api.membershipCommands.size)
        assertEquals(2, value.state.value.members.size)
        fixture.api.failure = 0
        value.retry(); idle(value)
        assertEquals(listOf(pending.intent, pending.intent), fixture.api.membershipCommands)
        assertEquals(listOf(fixture.ownerMember), value.state.value.members)
        assertNull(value.state.value.pending)
        assertEquals("Member removed.", value.state.value.notice)
    }

    @Test fun membershipLeaveClearsPrivateWorkspaceOnlyAfterAcknowledgment() = runBlocking {
        fixture.api.space = fixture.space.copy(role = "member")
        val own = fixture.ownerMember.copy(role = "member")
        fixture.api.roster = listOf(own, fixture.otherMember.copy(role = "owner"))
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        value.showMembers(); idle(value)
        value.proposeMembership(own, MembershipAction.LEAVE)
        fixture.api.failure = 503
        value.confirm(); idle(value)
        val pending = value.state.value.pending as SpaceCommand.EndMembership
        assertNotNull(value.state.value.selectedSpace)
        assertTrue(value.state.value.members.isNotEmpty())
        fixture.api.failure = 0
        value.retry(); idle(value)
        assertEquals(listOf(pending.intent, pending.intent), fixture.api.membershipCommands)
        assertNull(value.state.value.selectedSpace)
        assertNull(value.state.value.pending)
        assertTrue(value.state.value.members.isEmpty())
        assertTrue(value.state.value.invitations.isEmpty())
        assertTrue(value.state.value.spaces.isEmpty())
        assertEquals("You left the family Space.", value.state.value.notice)
    }

    @Test fun membershipOwnerCannotLeaveAndMemberCannotRemoveAnyone() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        value.showMembers(); idle(value)
        value.proposeMembership(fixture.ownerMember, MembershipAction.LEAVE)
        value.proposeMembership(fixture.ownerMember, MembershipAction.REMOVE)
        assertNull(value.state.value.confirmation)
        fixture.api.roster = listOf(fixture.ownerMember.copy(role = "member"), fixture.otherMember.copy(role = "owner"))
        value.showMembers(); idle(value)
        value.proposeMembership(value.state.value.members.first(), MembershipAction.REMOVE)
        value.proposeMembership(value.state.value.members.last(), MembershipAction.REMOVE)
        assertNull(value.state.value.confirmation)
        assertTrue(fixture.api.membershipCommands.isEmpty())
    }

    @Test fun staleMembershipChangeClearsRosterAndRequiresExplicitFreshReview() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        value.showMembers(); idle(value)
        value.proposeMembership(fixture.otherMember, MembershipAction.REMOVE)
        fixture.api.failure = 412
        value.confirm(); idle(value)
        assertNull(value.state.value.pending)
        assertNull(value.state.value.confirmation)
        assertTrue(value.state.value.members.isEmpty())
        value.retry(); value.proposeMembership(fixture.otherMember, MembershipAction.REMOVE)
        assertEquals(1, fixture.api.membershipCommands.size)
        assertNull(value.state.value.confirmation)
        fixture.api.failure = 0
        value.showMembers(); idle(value)
        value.proposeMembership(fixture.otherMember, MembershipAction.REMOVE)
        assertNotNull(value.state.value.confirmation)
    }

    @Test fun deniedMembershipRefreshDropsAllProtectedRosterData() = runBlocking {
        val value = ready()
        value.open(fixture.spaceId); idle(value)
        value.showMembers(); idle(value)
        fixture.api.failure = 404
        value.showMembers(); idle(value)
        assertTrue(value.state.value.members.isEmpty())
        assertTrue(value.state.value.spaces.isEmpty())
        assertTrue(value.state.value.sent.isEmpty())
        assertNull(value.state.value.selectedSpace)
        assertNotNull(value.state.value.error)
    }

    @Test fun invalidNamesAndSelfInvitesFailBeforeNetworkMutation() = runBlocking {
        val value = ready()
        value.startCreate(); value.name("  "); value.create()
        assertNotNull(value.state.value.error)
        value.name("unsafe\u0000name"); value.create()
        assertTrue(fixture.api.keys.isEmpty())
        value.closePanel(); value.open(fixture.spaceId); idle(value)
        value.recipient("1-1-1-1-1"); value.invite()
        assertTrue(fixture.api.keys.isEmpty())
        value.recipient(fixture.accountId); value.invite()
        assertTrue(fixture.api.keys.isEmpty())
        assertNotNull(value.state.value.error)
    }
}