package com.community.platform.feature.spaces

import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.Settings
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.CommunityTheme
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runner.RunWith
import org.junit.runners.model.Statement

@RunWith(AndroidJUnit4::class)
class SpaceScreenTest {
    val compose = createComposeRule()
    @get:Rule val rules: TestRule = RuleChain.outerRule(EmulatorFontScaleRule()).around(compose)
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val otherId = "0f97b948-9800-432f-9d15-407df739d08e"
    private val space = SpaceDto("c2937183-70fb-4d7a-b0b6-b1bc9c499444", "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z")
    private val invitation = SpaceInvitationDto("81a09cbf-901e-470c-a905-27d565be91ae", space.id, space.name, "Alex Example", accountId, "member", "pending", "2026-09-19T10:00:00Z", "2026-09-22T10:00:00Z")
    private fun workspace() = SpaceWorkspaceState(accountId = accountId)
    private fun actions(
        startCreate: () -> Unit = {}, name: (String) -> Unit = {}, recipient: (String) -> Unit = {},
        create: () -> Unit = {}, invite: () -> Unit = {}, propose: (SpaceCommand) -> Unit = {},
        confirm: () -> Unit = {}, cancel: () -> Unit = {}, retry: () -> Unit = {},
        close: () -> Unit = {}, moreSpaces: () -> Unit = {},
        showMembers: () -> Unit = {}, membership: (SpaceMemberDto, MembershipAction) -> Unit = { _, _ -> },
    ) = SpaceActions({}, {}, {}, startCreate, name, recipient, create, invite, propose, confirm, cancel, retry, close, {}, moreSpaces, {}, {}, showMembers, membership)

    private fun reveal(tag: String) { compose.onNodeWithTag("space-workspace").performScrollToNode(hasTestTag(tag)) }

    @Test fun createSpaceKeepsTheEnteredNameAndShowsTheConfirmedOwnerView() {
        var state by mutableStateOf(workspace())
        var createdName: String? = null
        val callbacks = actions(
            startCreate = { state = state.copy(creating = true) },
            name = { state = state.copy(nameDraft = it) },
            create = { createdName = state.nameDraft; state = state.copy(creating = false, nameDraft = "", selectedSpace = space, spaces = listOf(space), notice = "Family Space saved.") },
        )
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("space-start-create")
        compose.onNodeWithTag("space-start-create").performClick()
        compose.onNodeWithTag("space-name").performTextReplacement("Morgan family")
        compose.runOnIdle { assertNull(createdName) }
        reveal("space-create")
        compose.onNodeWithTag("space-create").performClick()
        compose.onNodeWithTag("selected-space-name").assertTextContains("Morgan family")
        compose.onNodeWithText("Owner").assertIsDisplayed()
        compose.runOnIdle { assertEquals("Morgan family", createdName) }
        capture("family-space-owner-native.png")
    }

    @Test fun uncertainInvitationLocksRecipientAndRetriesOnlyTheOriginalIntent() {
        var state by mutableStateOf(workspace().copy(selectedSpace = space))
        val requests = mutableListOf<SpaceCommand.Invite>()
        val callbacks = actions(
            recipient = { state = state.copy(recipientDraft = it) },
            invite = {
                val request = SpaceCommand.Invite(accountId, space.id, state.recipientDraft, "original-request")
                requests.add(request)
                state = state.copy(pending = request, error = "Synthetic response lost")
            },
            retry = {
                requests.add(state.pending as SpaceCommand.Invite)
                state = state.copy(pending = null, recipientDraft = "", sent = listOf(invitation.copy(recipientAccountId = otherId, status = "accepted")), error = null, notice = "Invitation already accepted.")
            },
        )
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("space-recipient")
        compose.onNodeWithTag("space-recipient").performTextReplacement(otherId)
        reveal("space-invite")
        compose.onNodeWithTag("space-invite").performClick()
        reveal("space-recipient")
        compose.onNodeWithTag("space-recipient").assertIsNotEnabled().assertTextContains(otherId)
        compose.runOnIdle { assertEquals(1, requests.size) }
        reveal("space-retry")
        compose.onNodeWithTag("space-retry").performClick()
        compose.runOnIdle { assertEquals(2, requests.size); assertEquals(requests[0], requests[1]) }
        reveal("invitation-row-${invitation.id}")
        compose.onNodeWithText("Accepted").assertIsDisplayed()
        compose.onNodeWithTag("invitation-revoke-${invitation.id}").assertDoesNotExist()
    }

    @Test fun recipientReviewsExactInvitationBeforeJoinAndThenOpensTheCorrectTasks() {
        var state by mutableStateOf(workspace().copy(tab = SpaceTab.INVITATIONS, invitations = listOf(invitation)))
        var accepted: SpaceCommand? = null
        var opened: SpaceDto? = null
        val callbacks = actions(
            propose = { state = state.copy(confirmation = it) },
            cancel = { state = state.copy(confirmation = null) },
            confirm = {
                accepted = state.confirmation
                val joined = space.copy(role = "member")
                state = state.copy(confirmation = null, invitations = emptyList(), spaces = listOf(joined), selectedSpace = joined, tab = SpaceTab.SPACES)
            },
        )
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, { opened = it }) } }
        reveal("invitation-review-${invitation.id}")
        compose.onNodeWithTag("invitation-review-${invitation.id}").performClick()
        compose.onNodeWithText("Join this family Space?").assertIsDisplayed()
        compose.onNodeWithTag("invitation-review-name").assertTextContains(space.name)
        compose.onNodeWithText("No access granted").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { assertNull(accepted); assertTrue(state.spaces.isEmpty()) }
        capture("family-invitation-review-native.png", dialog = true)
        compose.onNodeWithTag("space-action-dismiss").performClick()
        compose.runOnIdle { assertNull(accepted) }
        compose.onNodeWithTag("invitation-review-${invitation.id}").performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.onNodeWithTag("space-recipient").assertDoesNotExist()
        compose.onNodeWithText("Member").assertIsDisplayed()
        compose.onNodeWithTag("space-open-tasks").performClick()
        compose.runOnIdle { assertEquals(SpaceCommand.Accept(accountId, invitation), accepted); assertEquals(space.id, opened?.id); assertEquals("member", opened?.role) }
    }

    @Test fun declineRequiresConfirmationAndDoesNotCreateMembership() {
        var state by mutableStateOf(workspace().copy(tab = SpaceTab.INVITATIONS, invitations = listOf(invitation)))
        val commands = mutableListOf<SpaceCommand>()
        val callbacks = actions(propose = { state = state.copy(confirmation = it) }, cancel = { state = state.copy(confirmation = null) }, confirm = { commands.add(state.confirmation!!); state = state.copy(confirmation = null, invitations = emptyList(), notice = "Invitation declined.") })
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("invitation-decline-${invitation.id}")
        compose.onNodeWithTag("invitation-decline-${invitation.id}").performClick()
        compose.onNodeWithText("Decline this invitation?").assertIsDisplayed()
        compose.runOnIdle { assertTrue(commands.isEmpty()) }
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle { assertEquals(listOf(SpaceCommand.Decline(accountId, invitation)), commands); assertTrue(state.spaces.isEmpty()) }
        compose.onNodeWithTag("space-open-tasks").assertDoesNotExist()
    }

    @Test fun ownerRevokeBindsTheReviewedRecipientAndRemovesOnlyItsAction() {
        val outgoing = invitation.copy(recipientAccountId = otherId)
        var state by mutableStateOf(workspace().copy(selectedSpace = space, sent = listOf(outgoing)))
        val commands = mutableListOf<SpaceCommand>()
        val callbacks = actions(propose = { state = state.copy(confirmation = it) }, cancel = { state = state.copy(confirmation = null) }, confirm = { commands.add(state.confirmation!!); state = state.copy(confirmation = null, sent = listOf(outgoing.copy(status = "revoked"))) })
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("invitation-revoke-${invitation.id}")
        compose.onNodeWithTag("invitation-revoke-${invitation.id}").performClick()
        compose.onNodeWithText("Revoke this invitation?").assertIsDisplayed()
        compose.onNode(hasText(otherId) and hasAnyAncestor(hasTestTag("space-review-dialog"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("space-action-dismiss").performClick()
        compose.runOnIdle { assertTrue(commands.isEmpty()) }
        compose.onNodeWithTag("invitation-revoke-${invitation.id}").performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle { assertEquals(listOf(SpaceCommand.Revoke(accountId, outgoing)), commands) }
        reveal("invitation-row-${invitation.id}")
        compose.onNodeWithText("Revoked").assertIsDisplayed()
        compose.onNodeWithTag("invitation-revoke-${invitation.id}").assertDoesNotExist()
    }

    @Test fun copyActionUsesOnlyTheCurrentAccountId() {
        val state = workspace()
        val copiedValues = mutableListOf<AnnotatedString>()
        val clipboard = object : ClipboardManager {
            override fun getText(): AnnotatedString? = copiedValues.lastOrNull()
            override fun setText(annotatedString: AnnotatedString) { copiedValues.add(annotatedString) }
        }
        compose.setContent {
            CompositionLocalProvider(LocalClipboardManager provides clipboard) {
                CommunityTheme { SpaceScreen(state, actions(), "UTC", {}, {}) }
            }
        }
        compose.onNodeWithTag("space-copy-id").performClick()
        compose.onNodeWithText("Account ID copied").assertIsDisplayed()
        compose.runOnIdle {
            assertEquals(listOf(accountId), copiedValues.map { it.text })
        }
    }

    @Test fun dirtyOrUncertainExitNeverDiscardsSilently() {
        var state by mutableStateOf(workspace().copy(creating = true, nameDraft = "Unsaved family"))
        var closes = 0
        var exits = 0
        compose.setContent { CommunityTheme { SpaceScreen(state, actions(close = { closes += 1; state = workspace() }), "UTC", { exits += 1 }, {}) } }
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.onNodeWithText("Discard unsaved changes?").assertIsDisplayed()
        compose.onNodeWithTag("space-exit-dismiss").performClick()
        compose.onNodeWithTag("space-name").assertTextContains("Unsaved family")
        compose.runOnIdle { assertEquals(0, closes) }
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.onNodeWithTag("space-exit-confirm").performClick()
        compose.runOnIdle {
            assertEquals(1, closes)
            state = workspace().copy(creating = true, nameDraft = "Unconfirmed family", pending = SpaceCommand.Create(accountId, "Unconfirmed family", "stable-request"))
        }
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.onNodeWithText("Leave with an unconfirmed change?").assertIsDisplayed()
        compose.onNodeWithTag("space-exit-dismiss").performClick()
        compose.runOnIdle { assertEquals(0, exits); assertEquals("stable-request", (state.pending as SpaceCommand.Create).requestKey) }
    }

    @Test fun membershipRemovalKeepsExactReviewAndOriginalRetry() {
        val owner = SpaceMemberDto(accountId, "Alex", "owner", space.createdAt, "\"owner-admission\"")
        val member = SpaceMemberDto(otherId, "Sam", "member", space.createdAt, "\"member-admission\"")
        var state by mutableStateOf(workspace().copy(selectedSpace = space, members = listOf(owner, member), showingMembers = true))
        val commands = mutableListOf<SpaceCommand.EndMembership>()
        val callbacks = actions(
            membership = { selected, action -> state = state.copy(confirmation = SpaceCommand.EndMembership(MembershipIntent(accountId, space.id, selected.accountId, action, selected.etag, "original-membership-key"), selected, space.name, space)) },
            cancel = { state = state.copy(confirmation = null) },
            confirm = { val command = state.confirmation as SpaceCommand.EndMembership; commands.add(command); state = state.copy(confirmation = null, pending = command, error = "Synthetic response lost") },
            retry = { commands.add(state.pending as SpaceCommand.EndMembership); state = state.copy(pending = null, members = listOf(owner), error = null, notice = "Member removed.") },
        )
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("space-remove-$otherId")
        compose.onNodeWithTag("space-remove-$otherId").performScrollTo().performClick()
        compose.onNodeWithTag("membership-review-member").assertTextContains("Sam")
        compose.onNode(hasText(otherId) and hasAnyAncestor(hasTestTag("space-review-dialog"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("space-action-dismiss").performClick()
        compose.runOnIdle { assertTrue(commands.isEmpty()) }
        compose.onNodeWithTag("space-remove-$otherId").performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        reveal("space-remove-$otherId")
        compose.onNodeWithTag("space-remove-$otherId").assertIsNotEnabled()
        reveal("space-retry")
        compose.onNodeWithTag("space-retry").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(2, commands.size); assertEquals(commands[0], commands[1]); assertEquals(member.etag, commands[0].intent.etag) }
        compose.onNodeWithTag("space-remove-$otherId").assertDoesNotExist()
        compose.onNodeWithTag("space-leave").assertDoesNotExist()
    }

    @Test fun memberLeaveConfirmsSelfAndClearsTheSelectedSpace() {
        val member = SpaceMemberDto(accountId, "Alex", "member", space.createdAt, "\"self-admission\"")
        val owner = SpaceMemberDto(otherId, "Sam", "owner", space.createdAt, "\"owner-admission\"")
        var state by mutableStateOf(workspace().copy(selectedSpace = space.copy(role = "member"), members = listOf(member, owner), showingMembers = true))
        var left: SpaceCommand.EndMembership? = null
        val callbacks = actions(
            membership = { selected, action -> state = state.copy(confirmation = SpaceCommand.EndMembership(MembershipIntent(accountId, space.id, selected.accountId, action, selected.etag, "self-leave-key"), selected, space.name, space.copy(role = "member"))) },
            cancel = { state = state.copy(confirmation = null) },
            confirm = { left = state.confirmation as SpaceCommand.EndMembership; state = workspace().copy(notice = "You left the family Space.") },
        )
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("space-leave")
        compose.onNodeWithTag("space-remove-$accountId").assertDoesNotExist()
        compose.onNodeWithTag("space-remove-$otherId").assertDoesNotExist()
        compose.onNodeWithTag("space-leave").performScrollTo().performClick()
        compose.onNodeWithText("Leave this family Space?").assertIsDisplayed()
        compose.runOnIdle { assertNull(left) }
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle { assertEquals(accountId, left!!.intent.targetId); assertEquals(MembershipAction.LEAVE, left!!.intent.action) }
        compose.onNodeWithTag("selected-space-name").assertDoesNotExist()
        compose.onNodeWithTag("space-open-tasks").assertDoesNotExist()
    }

    @Test fun ownershipOfferShowsExactMemberAndWaitsForConfirmation() {
        val owner = SpaceMemberDto(accountId, "Alex", "owner", space.createdAt, "\"owner\"")
        val member = SpaceMemberDto(otherId, "Sam Next Owner", "member", space.createdAt, "\"member\"")
        var state by mutableStateOf(workspace().copy(selectedSpace = space, showingMembers = true, members = listOf(owner, member), ownershipLoaded = true))
        var sent: SpaceCommand.OfferOwnership? = null
        val callbacks = actions(cancel = { state = state.copy(confirmation = null) }, confirm = {
            sent = state.confirmation as SpaceCommand.OfferOwnership
            state = state.copy(confirmation = null)
        }).copy(offerOwnership = { state = state.copy(confirmation = SpaceCommand.OfferOwnership(accountId, space, it, "original-offer-key")) })
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("ownership-offer-$otherId")
        compose.onNodeWithTag("ownership-offer-$otherId").performScrollTo().performClick()
        compose.onNodeWithTag("ownership-review-name").assertTextContains(member.displayName)
        compose.onNodeWithTag("ownership-review-account").performScrollTo().assertTextContains(otherId)
        compose.runOnIdle { assertNull(sent) }
        compose.onNodeWithTag("space-action-dismiss").performClick()
        compose.runOnIdle { assertNull(sent) }
        compose.onNodeWithTag("ownership-offer-$otherId").performScrollTo().performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle { assertEquals(otherId, sent!!.member.accountId); assertEquals("\"member\"", sent!!.member.etag); assertEquals("owner", state.selectedSpace!!.role) }
    }

    @Test fun ownershipRecipientAndSenderSeeOnlyTheirOwnResponses() {
        val transfer = OwnershipTransferDto(invitation.id, space.id, space.name, otherId, "Sam Current Owner", accountId, "Alex Next Owner", "pending", "2026-09-23T10:00:00Z", "2026-09-23T10:15:00Z", null, "1", "\"reviewed-offer\"")
        var state by mutableStateOf(workspace().copy(selectedSpace = space.copy(role = "member"), showingMembers = true, ownershipLoaded = true, ownershipOffers = listOf(transfer)))
        val commands = mutableListOf<SpaceCommand.RespondOwnership>()
        val callbacks = actions(cancel = { state = state.copy(confirmation = null) }, confirm = {
            commands.add(state.confirmation as SpaceCommand.RespondOwnership); state = state.copy(confirmation = null)
        }).copy(respondOwnership = { offered, response -> state = state.copy(confirmation = SpaceCommand.RespondOwnership(accountId, offered, response)) })
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("ownership-review-${transfer.id}")
        compose.onNodeWithTag("ownership-cancel-${transfer.id}").assertDoesNotExist()
        compose.onNodeWithTag("ownership-review-${transfer.id}").performScrollTo().performClick()
        compose.onNodeWithTag("ownership-review-account").assertTextContains(accountId)
        compose.runOnIdle { assertTrue(commands.isEmpty()) }
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle { assertEquals(OwnershipResponse.ACCEPT, commands.single().response) }
        reveal("ownership-decline-${transfer.id}")
        compose.onNodeWithTag("ownership-decline-${transfer.id}").performScrollTo().performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle {
            assertEquals(OwnershipResponse.DECLINE, commands.last().response)
            state = state.copy(ownershipOffers = listOf(transfer.copy(fromAccountId = accountId, toAccountId = otherId)))
        }
        reveal("ownership-cancel-${transfer.id}")
        compose.onNodeWithTag("ownership-review-${transfer.id}").assertDoesNotExist()
        compose.onNodeWithTag("ownership-cancel-${transfer.id}").performScrollTo().performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle { assertEquals(OwnershipResponse.CANCEL, commands.last().response) }
    }

    @Test fun uncertainOwnershipKeepsOriginalTargetAndBlocksOtherActions() {
        val member = SpaceMemberDto(otherId, "Sam", "member", space.createdAt, "\"member\"")
        val command = SpaceCommand.OfferOwnership(accountId, space, member, "original-offer")
        val state = workspace().copy(selectedSpace = space, showingMembers = true, ownershipLoaded = true, members = listOf(SpaceMemberDto(accountId, "Alex", "owner", space.createdAt, "\"owner\""), member), pending = command)
        var retries = 0
        compose.setContent { CommunityTheme { SpaceScreen(state, actions(retry = { retries += 1 }), "UTC", {}, {}) } }
        reveal("ownership-offer-$otherId")
        compose.onNodeWithTag("ownership-offer-$otherId").assertIsNotEnabled()
        reveal("space-retry")
        compose.onNodeWithTag("space-retry").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(1, retries); assertEquals(command, state.pending) }
    }

    @Test fun roleActionsFollowTheViewersRoleAndConfirmOnlyTheReviewedMember() {
        val ownerId = "7b4f6c1e-2d3a-4e5b-8c9d-0a1b2c3d4e5f"
        val adminId = "5f0c2a7e-3b1d-4c55-9a52-0d6c1b7e9f10"
        val admin = SpaceMemberDto(adminId, "Riya", "admin", space.createdAt, "\"admin\"")
        val member = SpaceMemberDto(otherId, "Sam", "member", space.createdAt, "\"member\"")
        var state by mutableStateOf(workspace().copy(selectedSpace = space, showingMembers = true, ownershipLoaded = true, members = listOf(SpaceMemberDto(accountId, "Alex", "owner", space.createdAt, "\"owner\""), admin, member)))
        val proposals = mutableListOf<Pair<String, String>>()
        val confirmed = mutableListOf<SpaceCommand.ChangeRole>()
        val callbacks = actions(cancel = { state = state.copy(confirmation = null) }, confirm = { confirmed.add(state.confirmation as SpaceCommand.ChangeRole); state = state.copy(confirmation = null) })
            .copy(proposeRole = { selected, role -> proposals.add(selected.accountId to role); state = state.copy(confirmation = SpaceCommand.ChangeRole(accountId, space, selected, role, "reviewed-role-key")) })
        compose.setContent { CommunityTheme { SpaceScreen(state, callbacks, "UTC", {}, {}) } }
        reveal("space-member-$accountId")
        compose.onNodeWithTag("member-make-admin-$accountId").assertDoesNotExist()
        compose.onNodeWithTag("member-make-member-$accountId").assertDoesNotExist()
        reveal("space-member-$adminId")
        compose.onNodeWithTag("member-make-admin-$adminId").assertDoesNotExist()
        compose.onNodeWithTag("member-make-member-$adminId").performScrollTo().assertIsDisplayed()
        reveal("space-member-$otherId")
        compose.onNodeWithTag("member-make-member-$otherId").assertDoesNotExist()
        compose.onNodeWithTag("member-make-admin-$otherId").performScrollTo().performClick()
        compose.onNodeWithText("Make this person an admin?").assertIsDisplayed()
        compose.onNodeWithTag("role-review-member").assertTextContains("Sam")
        compose.onNode(hasText(otherId) and hasAnyAncestor(hasTestTag("space-review-dialog"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("space-action-dismiss").performClick()
        compose.runOnIdle { assertTrue(confirmed.isEmpty()) }
        compose.onNodeWithTag("member-make-admin-$otherId").performScrollTo().performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        compose.runOnIdle {
            assertEquals(listOf(otherId to "admin", otherId to "admin"), proposals)
            assertEquals(otherId, confirmed.single().member.accountId)
            assertEquals("admin", confirmed.single().role)
            assertEquals(member.etag, confirmed.single().etag)
            state = workspace().copy(selectedSpace = space.copy(role = "admin"), showingMembers = true, ownershipLoaded = true, members = listOf(
                SpaceMemberDto(ownerId, "Olivia", "owner", space.createdAt, "\"owner\""), SpaceMemberDto(accountId, "Alex", "admin", space.createdAt, "\"self\""), admin, member,
            ))
        }
        for (id in listOf(ownerId, adminId)) {
            reveal("space-member-$id")
            compose.onNodeWithTag("space-remove-$id").assertDoesNotExist()
            compose.onNodeWithTag("member-make-admin-$id").assertDoesNotExist()
            compose.onNodeWithTag("member-make-member-$id").assertDoesNotExist()
            compose.onNodeWithTag("ownership-offer-$id").assertDoesNotExist()
        }
        reveal("space-member-$otherId")
        compose.onNodeWithTag("member-make-admin-$otherId").assertDoesNotExist()
        compose.onNodeWithTag("ownership-offer-$otherId").assertDoesNotExist()
        compose.onNodeWithTag("space-remove-$otherId").performScrollTo().assertIsDisplayed()
        reveal("space-member-$accountId")
        compose.onNodeWithTag("space-leave").performScrollTo().assertIsDisplayed()
    }

    @DeviceFontScale(2f)
    @Test fun roleReviewKeepsExactDetailsAndActionsAtLargeText() {
        assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
        val member = SpaceMemberDto(otherId, "Sam ${"A".repeat(70)}", "member", space.createdAt, "\"reviewed-member\"")
        val command = SpaceCommand.ChangeRole(accountId, space.copy(name = "Family ${"B".repeat(70)}"), member, "admin", "reviewed-role")
        val state = workspace().copy(selectedSpace = space, confirmation = command)
        compose.setContent { CommunityTheme { SpaceScreen(state, actions(), "UTC", {}, {}) } }
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithTag("role-review-member").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { read -> assertTrue(read(layouts)) }
        assertEquals(2f, layouts.single().layoutInput.density.fontScale, 0.01f)
        compose.onNodeWithTag("role-review-space").assertTextContains(command.space.name)
        compose.onNode(hasText(otherId) and hasAnyAncestor(hasTestTag("space-review-dialog"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Admins can invite people, remove members and answer join requests. They cannot change roles, Space settings or ownership.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("space-action-dismiss").assertIsDisplayed()
        compose.onNodeWithTag("space-action-confirm").assertIsDisplayed()
        capture("role-review-native-large-text.png", dialog = true)
    }

    @DeviceFontScale(2f)
    @Test fun ownershipReviewUsesRealLargeTextWithReachableActions() {
        assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
        val member = SpaceMemberDto(otherId, "Next owner ${"A".repeat(60)}", "member", space.createdAt, "\"member\"")
        val command = SpaceCommand.OfferOwnership(accountId, space, member, "original-offer")
        val state = workspace().copy(selectedSpace = space, confirmation = command)
        compose.setContent { CommunityTheme { SpaceScreen(state, actions(), "UTC", {}, {}) } }
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithTag("ownership-review-name").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { read -> assertTrue(read(layouts)) }
        assertEquals(2f, layouts.single().layoutInput.density.fontScale, 0.01f)
        compose.onNodeWithTag("ownership-review-account").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Existing task history and private-data permissions stay unchanged. Pending invitations from the current owner will be revoked.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("space-action-dismiss").assertIsDisplayed()
        compose.onNodeWithTag("space-action-confirm").assertIsDisplayed()
        capture("ownership-native-large-text.png", dialog = true)
    }

    @DeviceFontScale(2f)
    @Test fun membershipReviewKeepsExactDetailsAndActionsAtLargeText() {
        assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
        val member = SpaceMemberDto(otherId, "Sam ${"A".repeat(70)}", "member", space.createdAt, "\"reviewed-member\"")
        val command = SpaceCommand.EndMembership(MembershipIntent(accountId, space.id, otherId, MembershipAction.REMOVE, member.etag, "reviewed-change"), member, space.name, space)
        val state = workspace().copy(selectedSpace = space, confirmation = command)
        compose.setContent { CommunityTheme { SpaceScreen(state, actions(), "UTC", {}, {}) } }
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithTag("membership-review-member").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { read -> assertTrue(read(layouts)) }
        assertEquals(2f, layouts.single().layoutInput.density.fontScale, 0.01f)
        compose.onNode(hasText(otherId) and hasAnyAncestor(hasTestTag("space-review-dialog"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("space-action-dismiss").assertIsDisplayed()
        compose.onNodeWithTag("space-action-confirm").assertIsDisplayed()
        capture("membership-review-native-large-text.png", dialog = true)
    }

    @DeviceFontScale(2f)
    @Test fun largeTextAndLongSpaceNamesKeepReviewAndConfirmControlsReachable() {
        assertEquals(320, InstrumentationRegistry.getInstrumentation().targetContext.resources.configuration.screenWidthDp)
        val longSpace = space.copy(name = "Family ${"A".repeat(70)}")
        var state by mutableStateOf(workspace().copy(tab = SpaceTab.INVITATIONS, invitations = listOf(invitation.copy(spaceName = longSpace.name))))
        compose.setContent {
            Box(Modifier.width(320.dp).fillMaxHeight()) { CommunityTheme { SpaceScreen(state, actions(propose = { state = state.copy(confirmation = it) }), "UTC", {}, {}) } }
        }
        reveal("invitation-review-${invitation.id}")
        compose.onNodeWithTag("invitation-review-${invitation.id}").performScrollTo().assertIsDisplayed().performClick()
        compose.onNodeWithTag("space-action-confirm").assertIsDisplayed()
        compose.onNodeWithTag("invitation-review-name").assertTextContains(longSpace.name)
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithTag("invitation-review-name").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { readLayout ->
            assertTrue(readLayout(layouts))
        }
        assertEquals(2f, layouts.single().layoutInput.density.fontScale, 0.01f)
        capture("family-invitation-large-text-native.png", dialog = true)
        compose.onNode(hasText(accountId) and hasAnyAncestor(hasTestTag("space-review-dialog"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("No access granted").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("space-action-dismiss").assertIsDisplayed()
        compose.onNodeWithTag("space-action-confirm").assertIsDisplayed()
        capture("family-invitation-large-text-details-native.png", dialog = true)
        val root = compose.onNodeWithTag("space-review-dialog").fetchSemanticsNode().boundsInRoot
        val button = compose.onNodeWithTag("space-action-confirm").fetchSemanticsNode().boundsInRoot
        assertTrue(button.width > 0 && button.width <= root.width)
    }
}

private fun SpaceScreenTest.capture(name: String, dialog: Boolean = false) {
    val target = if (dialog) compose.onNodeWithTag("space-review-dialog") else compose.onRoot()
    val image = target.captureToImage().asAndroidBitmap()
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val file = File(context.getExternalFilesDir("test-evidence"), name)
    file.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
    assertTrue(file.length() > 1000)
}

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
internal annotation class DeviceFontScale(val value: Float)

internal class EmulatorFontScaleRule : TestRule {
    override fun apply(base: Statement, description: Description): Statement = object : Statement() {
        override fun evaluate() {
            val requested = description.getAnnotation(DeviceFontScale::class.java)
            if (requested == null) {
                base.evaluate()
                return
            }
            check(Build.HARDWARE in setOf("ranchu", "goldfish")) { "Device configuration tests require a disposable emulator." }
            check(InstrumentationRegistry.getArguments().getString("community_disposable_ui_fixture") == "true") {
                "Explicit disposable UI fixture authorization is required."
            }
            val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
            val original = Settings.System.getString(context.contentResolver, Settings.System.FONT_SCALE)
            try {
                setScale(requested.value.toString())
                base.evaluate()
            } finally {
                setScale(original)
            }
        }
    }

    private fun setScale(value: String?) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext.applicationContext
        val expected = value?.toFloat() ?: 1f
        val changed = CountDownLatch(1)
        val callback = object : ComponentCallbacks {
            override fun onConfigurationChanged(configuration: Configuration) {
                if (abs(configuration.fontScale - expected) < 0.01f) changed.countDown()
            }
            override fun onLowMemory() = Unit
        }
        context.registerComponentCallbacks(callback)
        try {
            val command = if (value == null) "settings delete system font_scale" else "settings put system font_scale $expected"
            ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }
            check(abs(Settings.System.getFloat(context.contentResolver, Settings.System.FONT_SCALE, 1f) - expected) < 0.01f)
            if (abs(context.resources.configuration.fontScale - expected) >= 0.01f) {
                check(changed.await(15, TimeUnit.SECONDS)) { "Font configuration change was not delivered." }
            }
            check(abs(context.resources.configuration.fontScale - expected) < 0.01f)
        } finally {
            context.unregisterComponentCallbacks(callback)
        }
    }
}