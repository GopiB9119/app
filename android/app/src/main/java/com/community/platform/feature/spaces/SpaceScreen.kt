package com.community.platform.feature.spaces

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class SpaceActions(
    val refresh: () -> Unit,
    val selectTab: (SpaceTab) -> Unit,
    val open: (String) -> Unit,
    val startCreate: () -> Unit,
    val name: (String) -> Unit,
    val recipient: (String) -> Unit,
    val create: () -> Unit,
    val invite: () -> Unit,
    val propose: (SpaceCommand) -> Unit,
    val confirm: () -> Unit,
    val cancelConfirmation: () -> Unit,
    val retry: () -> Unit,
    val closePanel: () -> Unit,
    val discardDraft: () -> Unit,
    val moreSpaces: () -> Unit,
    val moreInvitations: () -> Unit,
    val moreSent: () -> Unit,
    val showMembers: () -> Unit = {},
    val proposeMembership: (SpaceMemberDto, MembershipAction) -> Unit = { _, _ -> },
    val offerOwnership: (SpaceMemberDto) -> Unit = {},
    val respondOwnership: (OwnershipTransferDto, OwnershipResponse) -> Unit = { _, _ -> },
    val moreOwnershipOffers: () -> Unit = {},
    val creationType: (String) -> Unit = {},
    val visibility: (String) -> Unit = {},
    val description: (String) -> Unit = {},
)

@Composable
fun SpaceRoute(viewModel: SpaceViewModel, accountId: String, timezone: String, onBack: () -> Unit, onOpenTasks: (SpaceDto) -> Unit, onSessionLost: () -> Unit, onOpenSettings: ((SpaceDto) -> Unit)? = null, onOpenChat: ((SpaceDto) -> Unit)? = null, onOpenEvents: ((SpaceDto) -> Unit)? = null, onFindGroups: (() -> Unit)? = null, onOpenGroupAccess: ((SpaceDto) -> Unit)? = null) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) SpaceScreen(state, SpaceActions(
        viewModel::refresh, viewModel::selectTab, viewModel::open, viewModel::startCreate,
        viewModel::name, viewModel::recipient, viewModel::create, viewModel::invite,
        viewModel::propose, viewModel::confirm, viewModel::cancelConfirmation, viewModel::retry,
        viewModel::closePanel, viewModel::discardDraft, viewModel::moreSpaces, viewModel::moreInvitations, viewModel::moreSent,
        viewModel::showMembers, viewModel::proposeMembership,
        viewModel::offerOwnership, viewModel::respondOwnership, viewModel::moreOwnershipOffers, viewModel::creationType,
        viewModel::visibility, viewModel::description,
    ), timezone, onBack, onOpenTasks, onOpenSettings, onOpenChat, onOpenEvents, onFindGroups, onOpenGroupAccess)
}

private enum class ExitReview { DISCARD, UNCONFIRMED }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SpaceScreen(state: SpaceWorkspaceState, actions: SpaceActions, timezone: String, onBack: () -> Unit, onOpenTasks: (SpaceDto) -> Unit, onOpenSettings: ((SpaceDto) -> Unit)? = null, onOpenChat: ((SpaceDto) -> Unit)? = null, onOpenEvents: ((SpaceDto) -> Unit)? = null, onFindGroups: (() -> Unit)? = null, onOpenGroupAccess: ((SpaceDto) -> Unit)? = null) {
    val clipboard = LocalClipboardManager.current
    var copied by remember(state.accountId) { mutableStateOf(false) }
    var exitReview by remember { mutableStateOf<ExitReview?>(null) }
    val list = rememberLazyListState()
    LaunchedEffect(state.tab, state.creating, state.selectedSpace?.id) { list.scrollToItem(0) }
    val back: () -> Unit = {
        if (!state.busy) {
            when {
                state.pending != null -> exitReview = ExitReview.UNCONFIRMED
                state.dirty -> exitReview = ExitReview.DISCARD
                state.selectedSpace != null || state.creating -> actions.closePanel()
                else -> onBack()
            }
        }
    }
    BackHandler(onBack = back)
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.busy) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(if (state.selectedSpace == null && !state.creating) R.string.spaces_back_account else R.string.spaces_back_list)) }
                Column(Modifier.weight(1f)) {
                    Text(stringResource(if (state.selectedSpace?.spaceType == "solo" || state.creationType == "solo" || state.spaces.any { it.spaceType == "solo" }) R.string.private_spaces else R.string.family_spaces), style = MaterialTheme.typography.titleLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Lock, null, Modifier.size(13.dp), tint = MaterialTheme.colorScheme.primary); Text(stringResource(R.string.spaces_private), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
                }
                IconButton(onClick = actions.refresh, enabled = !state.navigationLocked && !state.creating) { Icon(Icons.Default.Refresh, stringResource(R.string.spaces_refresh)) }
            }
            if (state.selectedSpace == null && !state.creating) {
                TabRow(selectedTabIndex = if (state.tab == SpaceTab.SPACES) 0 else 1) {
                    Tab(selected = state.tab == SpaceTab.SPACES, onClick = { actions.selectTab(SpaceTab.SPACES) }, enabled = !state.navigationLocked, text = { Text(stringResource(R.string.spaces_mine)) })
                    Tab(selected = state.tab == SpaceTab.INVITATIONS, onClick = { actions.selectTab(SpaceTab.INVITATIONS) }, enabled = !state.navigationLocked, text = { Text(stringResource(R.string.spaces_invitations)) })
                }
            } else HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(state = list, modifier = Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("space-workspace"), verticalArrangement = Arrangement.spacedBy(18.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp)) {
                    state.error?.let { item("error") { SpaceMessage(it, true) } }
                    state.notice?.let { item("notice") { SpaceMessage(it, false) } }
                    if (state.pending != null && !state.busy) item("retry") {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(stringResource(if (state.pending is SpaceCommand.EndMembership) R.string.spaces_change_unconfirmed else R.string.tasks_save_unconfirmed), style = MaterialTheme.typography.titleMedium)
                            Text(stringResource(R.string.tasks_may_be_saved))
                            (state.pending as? SpaceCommand.EndMembership)?.let { command ->
                                Text(stringResource(if (command.intent.action == MembershipAction.LEAVE) R.string.spaces_confirm_leave else R.string.spaces_confirm_remove_member), style = MaterialTheme.typography.titleSmall)
                                SpaceFact(stringResource(R.string.spaces_space_label), command.spaceName)
                                SpaceFact(stringResource(R.string.spaces_member), command.member.displayName)
                                SpaceFact(stringResource(R.string.spaces_member_account_id), command.member.accountId)
                            }
                            (state.pending as? SpaceCommand.OfferOwnership)?.let { command ->
                                SpaceFact(stringResource(R.string.spaces_space_label), command.space.name)
                                SpaceFact(stringResource(R.string.ownership_next_owner), command.member.displayName)
                                SpaceFact(stringResource(R.string.spaces_member_account_id), command.member.accountId)
                            }
                            (state.pending as? SpaceCommand.RespondOwnership)?.let { command ->
                                SpaceFact(stringResource(R.string.spaces_space_label), command.transfer.spaceName)
                                SpaceFact(stringResource(R.string.ownership_current_owner), command.transfer.fromAccountId)
                                SpaceFact(stringResource(R.string.ownership_next_owner), command.transfer.toAccountId)
                            }
                            OutlinedButton(onClick = actions.retry, modifier = Modifier.testTag("space-retry"), shape = RoundedCornerShape(6.dp)) { Icon(Icons.Default.Refresh, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_retry_original)) }
                        }
                    }
                    val selected = state.selectedSpace
                    when {
                        state.creating -> {
                            item("create-title") { Text(stringResource(when (state.creationType) { "solo" -> R.string.spaces_new_solo; "group" -> R.string.spaces_new_group; else -> R.string.spaces_new_family }), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() }) }
                            item("create-type") {
                                Text(stringResource(R.string.spaces_type), style = MaterialTheme.typography.labelLarge)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    FilterChip(selected = state.creationType == "family", onClick = { actions.creationType("family") }, enabled = !state.locked, label = { Text(stringResource(R.string.spaces_family_type)) })
                                    FilterChip(selected = state.creationType == "group", onClick = { actions.creationType("group") }, enabled = !state.locked, label = { Text(stringResource(R.string.spaces_group_type)) }, modifier = Modifier.testTag("space-type-group"))
                                    FilterChip(selected = state.creationType == "solo", onClick = { actions.creationType("solo") }, enabled = !state.locked, label = { Text(stringResource(R.string.spaces_solo_type)) })
                                }
                            }
                            item("create-name") { OutlinedTextField(value = state.nameDraft, onValueChange = { actions.name(it.take(160)) }, label = { Text(stringResource(when (state.creationType) { "solo" -> R.string.space_settings_name; "group" -> R.string.spaces_group_name; else -> R.string.spaces_name })) }, enabled = !state.locked, minLines = 1, maxLines = 3, modifier = Modifier.fillMaxWidth().testTag("space-name")) }
                            if (state.creationType == "solo") item("solo-audience") { Text(stringResource(R.string.spaces_only_you)) }
                            if (state.creationType == "group") {
                                item("create-description") {
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        OutlinedTextField(value = state.descriptionDraft, onValueChange = { actions.description(it.take(280)) }, label = { Text(stringResource(R.string.spaces_description_optional)) }, enabled = !state.locked, minLines = 2, maxLines = 6, modifier = Modifier.fillMaxWidth().testTag("space-description"))
                                        Text("${state.descriptionDraft.length}/280", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.End))
                                    }
                                }
                                item("create-visibility") {
                                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Text(stringResource(R.string.spaces_who_can_find), style = MaterialTheme.typography.labelLarge)
                                        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                            FilterChip(selected = state.visibilityDraft == "private", onClick = { actions.visibility("private") }, enabled = !state.locked, label = { Text(stringResource(R.string.spaces_private)) }, leadingIcon = { Icon(Icons.Default.Lock, null, Modifier.size(16.dp)) }, modifier = Modifier.testTag("space-visibility-private"))
                                            FilterChip(selected = state.visibilityDraft == "public", onClick = { actions.visibility("public") }, enabled = !state.locked, label = { Text(stringResource(R.string.spaces_public)) }, leadingIcon = { Icon(Icons.Default.Search, null, Modifier.size(16.dp)) }, modifier = Modifier.testTag("space-visibility-public"))
                                        }
                                        Text(stringResource(if (state.visibilityDraft == "public") R.string.spaces_public_explained else R.string.spaces_private_group_explained), style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                            }
                            item("create-policy") { SpaceFact(stringResource(R.string.spaces_visibility), stringResource(if (state.creationType == "group" && state.visibilityDraft == "public") R.string.spaces_public else R.string.spaces_private)); SpaceFact(stringResource(R.string.spaces_your_role), stringResource(R.string.spaces_owner)) }
                            item("create-actions") {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = actions.create, enabled = !state.locked && state.nameDraft.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp).testTag("space-create"), shape = RoundedCornerShape(6.dp)) { Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_create)) }
                                    TextButton(onClick = back, enabled = !state.locked) { Text(stringResource(R.string.cancel)) }
                                }
                            }
                        }
                        selected != null -> {
                            item("selected") {
                                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text(selected.name, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("selected-space-name").semantics { heading() })
                                    Text(stringResource(when (selected.spaceType) { "solo" -> R.string.spaces_only_you; "group" -> if (selected.visibility == "public") R.string.spaces_public_group else R.string.spaces_private_group; else -> R.string.spaces_family_type }), style = MaterialTheme.typography.labelLarge)
                                    selected.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                                    SpaceFact(stringResource(R.string.spaces_your_role), stringResource(if (selected.role == "owner") R.string.spaces_owner else R.string.spaces_member))
                                    if (selected.role == "owner" && onOpenSettings != null) OutlinedButton(onClick = { onOpenSettings(selected) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-open-settings")) { Icon(Icons.Default.Settings, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.space_settings_title)) }
                                    if (selected.role == "owner" && selected.spaceType == "group" && onOpenGroupAccess != null) OutlinedButton(onClick = { onOpenGroupAccess(selected) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-open-group-access")) { Icon(Icons.Default.Search, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.groups_access)) }
                                    Button(onClick = { onOpenTasks(selected) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-open-tasks")) { Icon(Icons.AutoMirrored.Filled.List, null, Modifier.size(19.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_open_tasks)) }
                                    if (onOpenChat != null) OutlinedButton(onClick = { onOpenChat(selected) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-open-chat")) { Icon(Icons.Default.Email, null, Modifier.size(19.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.messages_open_chat)) }
                                    if (onOpenEvents != null) OutlinedButton(onClick = { onOpenEvents(selected) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-open-events")) { Icon(Icons.Default.DateRange, null, Modifier.size(19.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.events_open)) }
                                    HorizontalDivider()
                                }
                            }
                            if (selected.spaceType != "solo") item("members-heading") {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(stringResource(R.string.spaces_members), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
                                    OutlinedButton(onClick = actions.showMembers, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-show-members")) {
                                        Icon(if (state.showingMembers) Icons.Default.Refresh else Icons.AutoMirrored.Filled.List, null, Modifier.size(18.dp))
                                        Spacer(Modifier.width(8.dp))
                                        Text(stringResource(if (state.showingMembers) R.string.spaces_refresh_members else R.string.spaces_view_members))
                                    }
                                }
                            }
                            if (state.showingMembers && selected.spaceType != "solo") {
                                val ownMembership = state.members.firstOrNull { it.accountId == state.accountId }
                                items(state.members, key = { "member-${it.accountId}" }) { member ->
                                    Column(Modifier.fillMaxWidth().testTag("space-member-${member.accountId}"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(if (member.accountId == state.accountId) stringResource(R.string.spaces_member_you, member.displayName) else member.displayName, style = MaterialTheme.typography.titleMedium)
                                        Text(stringResource(if (member.role == "owner") R.string.spaces_owner else R.string.spaces_member), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                                        Text(member.accountId, style = MaterialTheme.typography.bodyMedium)
                                        if (ownMembership?.role == "owner" && member.role == "member" && member.accountId != state.accountId) {
                                            OutlinedButton(onClick = { actions.proposeMembership(member, MembershipAction.REMOVE) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-remove-${member.accountId}")) {
                                                Icon(Icons.Default.Close, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_remove_member))
                                            }
                                            OutlinedButton(onClick = { actions.offerOwnership(member) }, enabled = !state.navigationLocked && state.ownershipLoaded && state.ownershipOffers.none { it.status == "pending" }, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("ownership-offer-${member.accountId}")) {
                                                Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.ownership_offer))
                                            }
                                        }
                                        if (member.accountId == state.accountId && member.role == "member") {
                                            OutlinedButton(onClick = { actions.proposeMembership(member, MembershipAction.LEAVE) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-leave")) {
                                                Icon(Icons.AutoMirrored.Filled.ArrowBack, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_leave))
                                            }
                                        }
                                        HorizontalDivider(Modifier.padding(top = 8.dp))
                                    }
                                }
                                item("ownership-heading") { Text(stringResource(R.string.ownership_offers), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() }) }
                                if (state.ownershipLoaded && state.ownershipOffers.isEmpty()) item("no-ownership-offers") { Text(stringResource(R.string.ownership_none)) }
                                items(state.ownershipOffers, key = { "ownership-${it.id}" }) { transfer ->
                                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(stringResource(R.string.ownership_parties, transfer.fromName, transfer.toName), style = MaterialTheme.typography.titleMedium)
                                        Text(stringResource(ownershipStatus(transfer.status)), color = MaterialTheme.colorScheme.primary)
                                        Text(stringResource(R.string.spaces_expiry_value, formatDate(transfer.expiresAt, timezone)), style = MaterialTheme.typography.bodySmall)
                                        if (transfer.status == "pending") FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            if (transfer.toAccountId == state.accountId) {
                                                Button(onClick = { actions.respondOwnership(transfer, OwnershipResponse.ACCEPT) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("ownership-review-${transfer.id}")) { Icon(Icons.Default.Check, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.ownership_review)) }
                                                OutlinedButton(onClick = { actions.respondOwnership(transfer, OwnershipResponse.DECLINE) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("ownership-decline-${transfer.id}")) { Text(stringResource(R.string.ownership_decline)) }
                                            } else if (transfer.fromAccountId == state.accountId) {
                                                OutlinedButton(onClick = { actions.respondOwnership(transfer, OwnershipResponse.CANCEL) }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("ownership-cancel-${transfer.id}")) { Icon(Icons.Default.Close, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.ownership_withdraw)) }
                                            }
                                        }
                                        HorizontalDivider()
                                    }
                                }
                                if (state.ownershipCursor != null) item("more-ownership") { TextButton(onClick = actions.moreOwnershipOffers, enabled = !state.navigationLocked) { Text(stringResource(R.string.ownership_more)) } }
                            }
                            if (selected.role == "owner" && selected.spaceType != "solo") {
                                item("invite-title") { Text(stringResource(R.string.spaces_invite_member), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() }) }
                                item("invite-form") {
                                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                        OutlinedTextField(value = state.recipientDraft, onValueChange = { actions.recipient(it.take(80)) }, label = { Text(stringResource(R.string.spaces_recipient_id)) }, enabled = !state.locked, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("space-recipient"))
                                        SpaceFact(stringResource(R.string.spaces_invited_role), stringResource(R.string.spaces_member))
                                        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Button(onClick = actions.invite, enabled = !state.locked && state.recipientDraft.isNotBlank(), shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-invite")) { Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_create_invitation)) }
                                            if (state.recipientDraft.isNotEmpty()) TextButton(onClick = actions.discardDraft, enabled = !state.locked) { Text(stringResource(R.string.discard)) }
                                        }
                                    }
                                }
                                item("sent-heading") { Text(stringResource(R.string.spaces_sent), style = MaterialTheme.typography.titleLarge) }
                                if (state.sent.isEmpty() && !state.busy && state.error == null) item("sent-empty") { Text(stringResource(R.string.spaces_no_sent)) }
                                items(state.sent, key = { "sent-${it.id}" }) { invitation ->
                                    InvitationRow(invitation, timezone, incoming = false) {
                                        if (invitation.status == "pending") OutlinedButton(onClick = { state.accountId?.let { actions.propose(SpaceCommand.Revoke(it, invitation)) } }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("invitation-revoke-${invitation.id}")) { Icon(Icons.Default.Close, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_revoke)) }
                                    }
                                }
                                if (state.sentCursor != null) item("more-sent") { TextButton(onClick = actions.moreSent, enabled = !state.navigationLocked) { Text(stringResource(R.string.spaces_more_sent)) } }
                            }
                        }
                        else -> {
                            state.accountId?.let { accountId -> item("account-id") {
                                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                    Text(stringResource(R.string.spaces_your_account_id), style = MaterialTheme.typography.labelLarge)
                                    SelectionContainer { Text(accountId, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("space-account-id")) }
                                    TextButton(onClick = { clipboard.setText(AnnotatedString(accountId)); copied = true }, modifier = Modifier.heightIn(min = 48.dp).testTag("space-copy-id")) { Text(stringResource(if (copied) R.string.spaces_copied else R.string.spaces_copy_id)) }
                                    HorizontalDivider()
                                }
                            } }
                            if (state.tab == SpaceTab.SPACES) {
                                item("space-heading") {
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(stringResource(R.string.spaces_mine), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
                                        Button(onClick = actions.startCreate, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-start-create")) { Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.spaces_new)) }
                                        if (onFindGroups != null) OutlinedButton(onClick = onFindGroups, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp).testTag("space-find-groups")) { Icon(Icons.Default.Search, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.groups_find)) }
                                    }
                                }
                                if (state.spaces.isEmpty() && !state.busy && state.error == null) item("empty-spaces") { Text(stringResource(R.string.spaces_none)) }
                                items(state.spaces, key = { "space-${it.id}" }) { space ->
                                    Column(Modifier.fillMaxWidth().clickable(enabled = !state.navigationLocked, role = Role.Button) { actions.open(space.id) }.padding(vertical = 10.dp).testTag("space-row-${space.id}"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { Icon(Icons.Default.Home, null, Modifier.size(23.dp), tint = MaterialTheme.colorScheme.primary); Text(space.name, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge); Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(19.dp)) }
                                        Text(stringResource(if (space.role == "owner") R.string.spaces_owner else R.string.spaces_member), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                                        Text(stringResource(when (space.spaceType) { "solo" -> R.string.spaces_solo_type; "group" -> if (space.visibility == "public") R.string.spaces_public_group else R.string.spaces_private_group; else -> R.string.spaces_family_type }), style = MaterialTheme.typography.bodySmall)
                                        HorizontalDivider(Modifier.padding(top = 8.dp))
                                    }
                                }
                                if (state.spaceCursor != null) item("more-spaces") { TextButton(onClick = actions.moreSpaces, enabled = !state.navigationLocked) { Text(stringResource(R.string.spaces_more)) } }
                            } else {
                                item("inbox-title") { Text(stringResource(R.string.spaces_invitations), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() }) }
                                if (state.invitations.isEmpty() && !state.busy && state.error == null) item("empty-invitations") { Text(stringResource(R.string.spaces_no_invitations)) }
                                items(state.invitations, key = { "invitation-${it.id}" }) { invitation ->
                                    InvitationRow(invitation, timezone, incoming = true) {
                                        if (invitation.status == "pending") FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Button(onClick = { state.accountId?.let { actions.propose(SpaceCommand.Accept(it, invitation)) } }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("invitation-review-${invitation.id}")) { Text(stringResource(R.string.spaces_review_invitation)) }
                                            OutlinedButton(onClick = { state.accountId?.let { actions.propose(SpaceCommand.Decline(it, invitation)) } }, enabled = !state.navigationLocked, shape = RoundedCornerShape(6.dp), modifier = Modifier.testTag("invitation-decline-${invitation.id}")) { Text(stringResource(R.string.spaces_decline)) }
                                        }
                                    }
                                }
                                if (state.invitationCursor != null) item("more-invitations") { TextButton(onClick = actions.moreInvitations, enabled = !state.navigationLocked) { Text(stringResource(R.string.spaces_more_invitations)) } }
                            }
                        }
                    }
                    if (state.error != null && !state.navigationLocked && !state.creating) item("reload") { OutlinedButton(onClick = actions.refresh, shape = RoundedCornerShape(6.dp)) { Icon(Icons.Default.Refresh, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.tasks_retry_loading)) } }
                    item("bottom") { Spacer(Modifier.height(18.dp)) }
                }
            }
        }
    }
    state.confirmation?.let { command ->
        val invitation = when (command) { is SpaceCommand.Accept -> command.invitation; is SpaceCommand.Decline -> command.invitation; is SpaceCommand.Revoke -> command.invitation; else -> null }
        val membership = command as? SpaceCommand.EndMembership
        val offer = command as? SpaceCommand.OfferOwnership
        val response = command as? SpaceCommand.RespondOwnership
        if (invitation != null || membership != null || offer != null || response != null) {
            val title = when (command) {
            is SpaceCommand.OfferOwnership -> R.string.ownership_confirm_offer
            is SpaceCommand.RespondOwnership -> when (command.response) { OwnershipResponse.ACCEPT -> R.string.ownership_confirm_accept; OwnershipResponse.DECLINE -> R.string.ownership_confirm_decline; OwnershipResponse.CANCEL -> R.string.ownership_confirm_withdraw }
                is SpaceCommand.Accept -> R.string.spaces_confirm_join
                is SpaceCommand.Decline -> R.string.spaces_confirm_decline
                is SpaceCommand.EndMembership -> if (command.intent.action == MembershipAction.LEAVE) R.string.spaces_confirm_leave else R.string.spaces_confirm_remove_member
                else -> R.string.spaces_confirm_revoke
            }
            val action = when (command) {
                is SpaceCommand.OfferOwnership -> R.string.ownership_send
                is SpaceCommand.RespondOwnership -> when (command.response) { OwnershipResponse.ACCEPT -> R.string.ownership_accept; OwnershipResponse.DECLINE -> R.string.ownership_decline; OwnershipResponse.CANCEL -> R.string.ownership_withdraw }
                is SpaceCommand.Accept -> R.string.spaces_join
                is SpaceCommand.Decline -> R.string.spaces_decline
                is SpaceCommand.EndMembership -> if (command.intent.action == MembershipAction.LEAVE) R.string.spaces_leave else R.string.spaces_remove_member
                else -> R.string.spaces_revoke
            }
            Dialog(onDismissRequest = actions.cancelConfirmation, properties = DialogProperties(usePlatformDefaultWidth = false)) {
                BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().padding(20.dp), contentAlignment = Alignment.Center) {
                    Surface(modifier = Modifier.widthIn(max = 560.dp).fillMaxWidth().heightIn(max = maxHeight).testTag("space-review-dialog"), shape = RoundedCornerShape(8.dp)) {
                        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text(stringResource(title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).testTag("space-review-body"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                if (offer != null || response != null) {
                                    val transfer = response?.transfer
                                    Text(offer?.space?.name ?: requireNotNull(transfer).spaceName, style = MaterialTheme.typography.titleLarge)
                                    SpaceFact(stringResource(R.string.ownership_current_owner), offer?.accountId ?: requireNotNull(transfer).fromAccountId)
                                    Text(stringResource(R.string.ownership_next_owner), style = MaterialTheme.typography.labelLarge)
                                    Text(offer?.member?.displayName ?: requireNotNull(transfer).toName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("ownership-review-name"))
                                    Text(offer?.member?.accountId ?: requireNotNull(transfer).toAccountId, modifier = Modifier.testTag("ownership-review-account"))
                                    if (offer != null || response?.response == OwnershipResponse.ACCEPT) {
                                        Text(stringResource(R.string.ownership_role_effect))
                                        Text(stringResource(R.string.ownership_history_effect))
                                    } else Text(stringResource(R.string.ownership_end_effect))
                                    if (offer != null) Text(stringResource(R.string.ownership_offer_expiry))
                                    else SpaceFact(stringResource(R.string.spaces_expires), formatDate(requireNotNull(transfer).expiresAt, timezone))
                                } else if (membership != null) {
                                    Text(membership.spaceName, style = MaterialTheme.typography.titleLarge, modifier = Modifier.testTag("membership-review-space"))
                                    Text(membership.member.displayName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("membership-review-member"))
                                    SpaceFact(stringResource(R.string.spaces_member_account_id), membership.member.accountId)
                                    Text(stringResource(if (membership.intent.action == MembershipAction.LEAVE) R.string.spaces_leave_effect else R.string.spaces_remove_effect))
                                    Text(stringResource(R.string.spaces_membership_limit))
                                } else if (invitation != null) {
                                    Text(invitation.spaceName, style = MaterialTheme.typography.titleLarge, modifier = Modifier.testTag("invitation-review-name"))
                                    SpaceFact(stringResource(R.string.spaces_inviter), invitation.inviterName)
                                    SpaceFact(stringResource(R.string.spaces_recipient_id), invitation.recipientAccountId)
                                    SpaceFact(stringResource(R.string.spaces_invited_role), stringResource(R.string.spaces_member))
                                    SpaceFact(stringResource(R.string.spaces_expires), formatDate(invitation.expiresAt, timezone))
                                    if (command is SpaceCommand.Accept) { Text(stringResource(R.string.spaces_no_access), color = MaterialTheme.colorScheme.secondary); Text(stringResource(R.string.spaces_history_notice)) }
                                }
                            }
                            HorizontalDivider()
                            FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                TextButton(onClick = actions.cancelConfirmation, enabled = !state.locked, modifier = Modifier.heightIn(min = 48.dp).testTag("space-action-dismiss")) { Text(stringResource(if (membership != null) R.string.spaces_keep_membership else R.string.spaces_not_now)) }
                                TextButton(onClick = actions.confirm, enabled = !state.locked, modifier = Modifier.heightIn(min = 48.dp).testTag("space-action-confirm")) { Text(stringResource(action)) }
                            }
                        }
                    }
                }
            }
        }
    }
    exitReview?.let { review ->
        AlertDialog(onDismissRequest = { exitReview = null }, title = { Text(stringResource(if (review == ExitReview.UNCONFIRMED) R.string.tasks_leave_unconfirmed else R.string.tasks_discard_draft)) }, text = { if (review == ExitReview.UNCONFIRMED) Text(stringResource(R.string.tasks_retry_identity_warning)) }, confirmButton = {
            TextButton(onClick = { exitReview = null; if (review == ExitReview.UNCONFIRMED) onBack() else actions.closePanel() }, modifier = Modifier.testTag("space-exit-confirm")) { Text(stringResource(R.string.confirm)) }
        }, dismissButton = { TextButton(onClick = { exitReview = null }, modifier = Modifier.testTag("space-exit-dismiss")) { Text(stringResource(R.string.cancel)) } }, shape = RoundedCornerShape(8.dp))
    }
}

@Composable
private fun InvitationRow(invitation: SpaceInvitationDto, timezone: String, incoming: Boolean, actions: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("invitation-row-${invitation.id}"), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Text(if (incoming) invitation.spaceName else invitation.recipientAccountId, style = if (incoming) MaterialTheme.typography.titleLarge else MaterialTheme.typography.bodyLarge)
        if (incoming) Text(stringResource(R.string.spaces_invited_by, invitation.inviterName), style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(invitationStatus(invitation.status)), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
        Text(stringResource(R.string.spaces_expiry_value, formatDate(invitation.expiresAt, timezone)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        actions()
        HorizontalDivider(Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun SpaceFact(label: String, value: String) { Column(verticalArrangement = Arrangement.spacedBy(3.dp)) { Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, style = MaterialTheme.typography.bodyLarge) } }
@Composable
private fun SpaceMessage(message: String, error: Boolean) { Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) { Text(message, Modifier.padding(12.dp)) } }
private fun formatDate(value: String, timezone: String) = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withZone(ZoneId.of(timezone)).format(Instant.parse(value))
private fun invitationStatus(status: String) = when (status) { "pending" -> R.string.spaces_pending; "accepted" -> R.string.spaces_accepted; "declined" -> R.string.spaces_declined; "revoked" -> R.string.spaces_revoked; else -> R.string.spaces_expired }
private fun ownershipStatus(status: String) = when (status) { "pending" -> R.string.ownership_pending; "accepted" -> R.string.spaces_accepted; "declined" -> R.string.spaces_declined; "cancelled" -> R.string.ownership_withdrawn; "expired" -> R.string.spaces_expired; else -> R.string.ownership_invalidated }