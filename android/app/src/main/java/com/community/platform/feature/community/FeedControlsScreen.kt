package com.community.platform.feature.community

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.community.platform.DesignTokens
import com.community.platform.R

/** Why a post is in the list it is shown in (DEC-037). */
sealed interface WhyShown {
    data object Following : WhyShown
    data object Latest : WhyShown
    data class Interests(val reasons: List<ReasonDto>) : WhyShown
}

@Composable
private fun whyText(why: WhyShown, post: PostDto, taxonomy: Taxonomy?): String = when (why) {
    WhyShown.Following -> stringResource(R.string.community_why_following, post.pageName)
    WhyShown.Latest -> stringResource(R.string.community_why_latest)
    is WhyShown.Interests -> stringResource(R.string.community_interest_posts_because, why.reasons.map { termName(taxonomy, it.dimension, it.code) }.joinToString(", "))
}

@Composable
private fun WhyDialog(text: String, onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(stringResource(R.string.community_why)) },
        text = { Column(Modifier.verticalScroll(rememberScrollState())) { Text(text, modifier = Modifier.testTag("why-text")) } },
        confirmButton = {
            TextButton(onClick = onDismiss, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("why-close")) { Text(stringResource(R.string.community_why_close)) }
        })
}

@Composable
private fun MoreButton(tag: String, enabled: Boolean, onClick: () -> Unit) {
    val label = stringResource(R.string.community_more_options)
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.testTag(tag)) { Icon(Icons.Default.MoreVert, label) }
}

/** "More options" on a post in Following, Latest or From your interests: Not interested, mute its page or one of its terms, and why it is shown. */
@Composable
internal fun PostMenu(post: PostDto, why: WhyShown, state: CommunityState, actions: CommunityActions) {
    var open by remember { mutableStateOf(false) }
    var explaining by rememberSaveable(post.id) { mutableStateOf(false) }
    val terms = post.topics.orEmpty().map { "topic" to it } + post.interests.orEmpty().map { "interest" to it }
    Box {
        MoreButton("post-menu-${post.id}", !state.working) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            // Your own posts and pages cannot be muted or hidden.
            if (!post.canManage) {
                DropdownMenuItem(text = { Text(stringResource(R.string.community_not_interested)) }, onClick = { open = false; actions.hidePost(post) },
                    modifier = Modifier.testTag("post-hide-${post.id}"))
                DropdownMenuItem(text = { Text(stringResource(R.string.community_mute_name, post.pageName)) }, onClick = { open = false; actions.mutePage(post.pageId, post.pageName) },
                    modifier = Modifier.testTag("post-mute-page-${post.id}"))
            }
            terms.forEach { (dimension, code) ->
                DropdownMenuItem(text = { Text(stringResource(R.string.community_mute_name, termName(state.taxonomy, dimension, code))) },
                    onClick = { open = false; actions.muteTerm(dimension, code) }, modifier = Modifier.testTag("post-mute-$dimension-$code-${post.id}"))
            }
            DropdownMenuItem(text = { Text(stringResource(R.string.community_why)) }, onClick = { open = false; explaining = true }, modifier = Modifier.testTag("post-why-${post.id}"))
        }
    }
    if (explaining) WhyDialog(whyText(why, post, state.taxonomy)) { explaining = false }
}

/** "More options" on a suggested page: Not interested, mute it, and the reasons it is suggested. */
@Composable
internal fun SuggestionMenu(item: SuggestedPageDto, state: CommunityState, actions: CommunityActions) {
    var open by remember { mutableStateOf(false) }
    var explaining by rememberSaveable(item.page.id) { mutableStateOf(false) }
    val handle = item.page.handle
    Box {
        MoreButton("suggested-menu-$handle", !state.working) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.community_not_interested)) }, onClick = { open = false; actions.hideSuggestion(item.page) },
                modifier = Modifier.testTag("suggested-hide-$handle"))
            DropdownMenuItem(text = { Text(stringResource(R.string.community_mute_name, item.page.name)) }, onClick = { open = false; actions.mutePage(item.page.id, item.page.name) },
                modifier = Modifier.testTag("suggested-mute-$handle"))
            DropdownMenuItem(text = { Text(stringResource(R.string.community_why)) }, onClick = { open = false; explaining = true }, modifier = Modifier.testTag("suggested-why-$handle"))
        }
    }
    if (explaining) WhyDialog(stringResource(R.string.community_suggestion_reasons, item.reasons.map { termName(state.taxonomy, it.dimension, it.code) }.joinToString(", "))) { explaining = false }
}

/** What the control just added did, with Undo. */
@Composable
internal fun UndoNotice(undo: FeedUndo, state: CommunityState, actions: CommunityActions) {
    val control = undo.control
    val text = when (control.kind) {
        "hide_post" -> stringResource(R.string.community_hidden_post)
        "hide_suggestion" -> stringResource(R.string.community_hidden_suggestion)
        "mute_term" -> stringResource(R.string.community_muted_notice, termName(state.taxonomy, control.dimension.orEmpty(), control.code.orEmpty()))
        else -> stringResource(R.string.community_muted_notice, undo.name ?: control.pageName.orEmpty())
    }
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag("feed-undo-notice"), verticalAlignment = Alignment.CenterVertically) {
        Text(text, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
        TextButton(onClick = actions.undoControl, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("feed-undo")) { Text(stringResource(R.string.community_undo)) }
    }
}

/** Opens "Muted and hidden" from Profile's community places. */
@Composable
internal fun FeedControlsLink(state: CommunityState, actions: CommunityActions) {
    OutlinedButton(onClick = { actions.open(Destination.FeedControls) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
        modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("open-feed-controls")) { Text(stringResource(R.string.community_feed_controls)) }
}

/** "Muted and hidden": every mute and Not interested, newest first, in four sections, each row with Undo. */
@OptIn(ExperimentalLayoutApi::class)
internal fun LazyListScope.feedControls(state: CommunityState, actions: CommunityActions) {
    item("controls-note") { Text(stringResource(R.string.community_feed_controls_note), style = MaterialTheme.typography.bodySmall) }
    if (!state.controlsLoaded) {
        if (state.error != null) item("controls-retry") {
            OutlinedButton(onClick = actions.reload, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("controls-retry")) { Text(stringResource(R.string.community_retry)) }
        }
        return
    }
    if (state.controls.isEmpty()) { item("controls-empty") { Text(stringResource(R.string.community_feed_controls_empty), modifier = Modifier.testTag("controls-empty")) }; return }
    listOf(
        "mute_page" to R.string.community_muted_pages, "mute_term" to R.string.community_muted_terms,
        "hide_post" to R.string.community_hidden_posts, "hide_suggestion" to R.string.community_hidden_suggestions,
    ).forEach { (kind, label) ->
        val rows = state.controls.filter { it.kind == kind }
        if (rows.isEmpty()) return@forEach
        item("controls-$kind") {
            Text(stringResource(label), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }.testTag("controls-heading-$kind"))
        }
        items(rows, key = { "control-${it.id}" }) { control -> ControlRow(control, state, actions) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ControlRow(control: FeedControlDto, state: CommunityState, actions: CommunityActions) {
    val gone = stringResource(R.string.community_no_longer_available)
    val title = when (control.kind) {
        "mute_term" -> termName(state.taxonomy, control.dimension.orEmpty(), control.code.orEmpty())
        "hide_post" -> if (control.postAvailable == false) gone else control.postTitle ?: stringResource(R.string.community_untitled_post)
        else -> control.pageName ?: gone
    }
    val detail = when (control.kind) {
        "mute_term" -> stringResource(if (control.dimension == "topic") R.string.community_dimension_topic else R.string.community_dimension_interest)
        "hide_post" -> control.pageName
        else -> control.pageHandle?.let { "@$it" }
    }
    val undoLabel = stringResource(R.string.community_undo_named, title)
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag("control-${control.id}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                detail?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
            OutlinedButton(onClick = { actions.removeControl(control) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).semantics { contentDescription = undoLabel }.testTag("control-undo-${control.id}")) {
                Text(stringResource(R.string.community_undo))
            }
        }
        HorizontalDivider()
    }
}
