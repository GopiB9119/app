package com.community.platform.feature.community

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
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
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

data class CommunityActions(
    val open: (Destination) -> Unit = {}, val back: () -> Boolean = { false }, val reload: () -> Unit = {}, val more: () -> Unit = {},
    val search: (String, String?) -> Unit = { _, _ -> }, val follow: (PageDto) -> Unit = {}, val like: (PostDto) -> Unit = {},
    val save: (PostDto) -> Unit = {}, val createPage: (String, String, String, String) -> Boolean = { _, _, _, _ -> false },
    val createPost: (String, String) -> Boolean = { _, _ -> false }, val comment: (String, CommentDto?) -> Boolean = { _, _ -> false },
    val retry: () -> Unit = {}, val discard: () -> Unit = {}, val publish: (PostDto) -> Unit = {}, val deletePost: (PostDto) -> Unit = {},
    val endComment: (CommentDto) -> Unit = {}, val report: (String, String, String, String) -> Unit = { _, _, _, _ -> },
    val blockPage: (PageDto) -> Unit = {}, val blockAuthor: (CommentDto) -> Unit = {}, val unblock: (BlockDto) -> Unit = {},
    val searchFor: (Boolean) -> Unit = {},
    val startEdit: (PostDto) -> Unit = {}, val cancelEdit: () -> Unit = {}, val editPost: (PostDto, String, String) -> Boolean = { _, _, _ -> false },
    val unfollow: (PageDto) -> Unit = {}, val startPageEdit: (PageDto) -> Unit = {}, val cancelPageEdit: () -> Unit = {},
    val editPage: (String, String, String, String?) -> Boolean = { _, _, _, _ -> false },
    val retryFollowing: () -> Unit = reload,
    val pin: (PostDto) -> Unit = {},
    val inviteModerator: (String) -> Boolean = { false },
    val resolveModerator: (ModeratorDto, String) -> Unit = { _, _ -> },
    val resolveRole: (ModeratorRoleDto, String) -> Unit = { _, _ -> },
    val offerHandover: (ModeratorDto) -> Boolean = { false },
    val respondHandover: (HandoverDto, String) -> Unit = { _, _ -> },
    val archivePage: () -> Unit = {},
    val restorePage: () -> Unit = {},
    val deletePage: (String) -> Boolean = { false },
    val filter: (String, String?) -> Unit = { _, _ -> },
    val startClassify: (PageDto) -> Unit = {},
    val setClassification: (ClassificationPart, List<String>) -> Unit = { _, _ -> },
    val cancelClassify: () -> Unit = {},
    val saveClassification: () -> Unit = {},
    val setInterests: (InterestPart, List<String>) -> Unit = { _, _ -> },
    val saveInterests: () -> Unit = {},
    /** Saves a draft with its chosen topics and interests. */
    val createPostTerms: (String, String, List<String>, List<String>) -> Boolean = { _, _, _, _ -> false },
    /** Saves an edit that also changes the post's topics or interests. */
    val editPostTerms: (PostDto, String, String, List<String>, List<String>) -> Boolean = { _, _, _, _, _ -> false },
    val moreInterestPosts: () -> Unit = {},
    val hidePost: (PostDto) -> Unit = {},
    /** Mutes the page with this id and name. */
    val mutePage: (String, String) -> Unit = { _, _ -> },
    /** Mutes a topic or an interest: its dimension and code. */
    val muteTerm: (String, String) -> Unit = { _, _ -> },
    val hideSuggestion: (PageDto) -> Unit = {},
    val undoControl: () -> Unit = {},
    val removeControl: (FeedControlDto) -> Unit = {},
    val showInsights: () -> Unit = {},
    val hideInsights: () -> Unit = {},
    /** Retry after a failure, or Refresh the open insights. */
    val loadInsights: () -> Unit = {},
)

/** Keeps a list of chosen codes across configuration changes. */
private val codesSaver = listSaver<List<String>, String>(save = { it }, restore = { it })

private data class Confirmation(val title: String, val text: String, val confirm: String, val action: () -> Unit)
private data class ReportTarget(val type: String, val id: String, val label: String)

@Composable
fun CommunityRoute(viewModel: CommunityViewModel, accountId: String, timezone: String, onBack: () -> Unit, onSessionLost: () -> Unit, moderation: ModerationViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val moderationState by moderation.state.collectAsStateWithLifecycle()
    val moderationUi = moderationState.copy(working = moderationState.working || state.working)
    val moderationActions = moderationActions(moderation)
    val moderationTime = rememberModerationTime(timezone)
    LaunchedEffect(state.requiresSignIn, moderationState.requiresSignIn) { if (state.requiresSignIn || moderationState.requiresSignIn) onSessionLost() }
    LaunchedEffect(accountId, state.destination, moderationState.accountId, moderationState.reviewing) {
        if (moderationState.accountId == accountId && state.destination == Destination.Blocked && !moderationState.reviewing) moderation.loadSafety()
    }
    if (state.accountId != accountId || moderationState.accountId != accountId) return
    if (moderationState.reviewing) {
        ModerationScreen(moderationUi, moderationActions, timezone)
        return
    }
    CommunityScreen(state.copy(working = moderationUi.working), CommunityActions(
        viewModel::open, viewModel::back, { viewModel.reload(); if (state.destination == Destination.Blocked) moderation.loadSafety() }, { viewModel.reload(more = true) }, viewModel::search,
        viewModel::follow, viewModel::like, viewModel::save, viewModel::createPage, viewModel::createPost, viewModel::comment,
        viewModel::retry, viewModel::discardPending, viewModel::publish, viewModel::deletePost, viewModel::endComment,
        viewModel::report, viewModel::blockPage, viewModel::blockAuthor, viewModel::unblock, viewModel::searchFor,
        viewModel::startEdit, viewModel::cancelEdit, viewModel::editPost,
        viewModel::unfollow, viewModel::startPageEdit, viewModel::cancelPageEdit, viewModel::editPage,
        viewModel::retryFollowing, viewModel::pin,
        inviteModerator = viewModel::inviteModerator, resolveModerator = viewModel::resolveModerator, resolveRole = viewModel::resolveRole,
        offerHandover = viewModel::offerHandover, respondHandover = viewModel::respondHandover,
        archivePage = viewModel::archivePage, restorePage = viewModel::restorePage, deletePage = viewModel::deletePage,
        filter = viewModel::filter, startClassify = viewModel::startClassify, setClassification = viewModel::setClassification,
        cancelClassify = viewModel::cancelClassify, saveClassification = viewModel::saveClassification,
        setInterests = viewModel::setInterests, saveInterests = viewModel::saveInterests,
        createPostTerms = { title, body, topics, interests -> viewModel.createPost(title, body, topics, interests) },
        editPostTerms = { post, title, body, topics, interests -> viewModel.editPost(post, title, body, topics, interests) },
        moreInterestPosts = viewModel::moreInterestPosts,
        hidePost = viewModel::hidePost, mutePage = viewModel::mutePage, muteTerm = viewModel::muteTerm,
        hideSuggestion = viewModel::hideSuggestion, undoControl = viewModel::undoControl, removeControl = viewModel::removeControl,
        showInsights = viewModel::showInsights, hideInsights = viewModel::hideInsights, loadInsights = viewModel::loadInsights,
    ), timezone, onBack, safetyMessage = moderationUi.message, safetyContent = { moderationHistory(moderationUi, moderationActions, moderationTime) })
    ModerationAppealDialog(moderationUi, moderationActions)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CommunityScreen(state: CommunityState, actions: CommunityActions, timezone: String, onExit: () -> Unit, safetyMessage: ModerationMessage? = null, safetyContent: androidx.compose.foundation.lazy.LazyListScope.() -> Unit = {}) {
    var confirmation by remember { mutableStateOf<Confirmation?>(null) }
    var reporting by remember { mutableStateOf<ReportTarget?>(null) }
    val time = remember(timezone) {
        val zone = try { ZoneId.of(timezone) } catch (_error: RuntimeException) { ZoneId.systemDefault() }
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withZone(zone)
    }
    val back: () -> Unit = { if (!actions.back()) onExit() }
    BackHandler(onBack = back)
    val ask: (Confirmation) -> Unit = { confirmation = it }
    val report: (ReportTarget) -> Unit = { reporting = it }
    // Under Your pages, an error about your own or followed pages is shown with that list instead of at the top.
    val topError = state.error?.takeUnless { state.destination == Destination.MyPages && (it == state.ownedError || it == state.followedError) }
    val safetyNotice = safetyMessage?.takeIf { state.destination == Destination.Blocked }
    val list = rememberLazyListState()
    // The message about the last action is the list's first item. A lazy list leaves out items scrolled off screen,
    // so after an action further down, such as saving a post, bring it into view to be seen.
    LaunchedEffect(topError, state.notice, safetyNotice) { if (topError != null || state.notice != null || safetyNotice != null) list.scrollToItem(0) }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.working) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.community_back)) }
                Text(title(state), style = MaterialTheme.typography.titleLarge, maxLines = 2, modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = actions.reload, enabled = !state.busy) { Icon(Icons.Default.Refresh, stringResource(R.string.community_refresh)) }
            }
            // Discover's own places. The blocked list and your interests belong to Profile (DEC-014), so they open from there without these chips.
            if (state.destination != Destination.Blocked && state.destination != Destination.Interests && state.destination != Destination.FeedControls) FlowRow(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(Destination.Feed(FeedTab.FOLLOWING) to R.string.community_home, Destination.Discover to R.string.community_discover,
                    Destination.MyPages to R.string.community_my_pages).forEach { (target, label) ->
                    val selected = if (target is Destination.Feed) state.destination is Destination.Feed else state.destination == target
                    FilterChip(selected = selected, onClick = { if (!selected) actions.open(target) }, enabled = !state.working, label = { Text(stringResource(label)) })
                }
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("community-content"), state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    safetyNotice?.let { message -> item("moderation-message") { ModerationSuccess(message) } }
                    topError?.let {
                        item("error") { Text(pageMessage(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("community-error")) }
                    }
                    state.notice?.let { item("notice") { Text(pageMessage(it), color = MaterialTheme.colorScheme.primary, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("community-notice")) } }
                    state.undo?.let { undo -> item("undo") { UndoNotice(undo, state, actions) } }
                    state.pending?.let { pending ->
                        if (!state.working) item("pending") {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(stringResource(R.string.community_unconfirmed), style = MaterialTheme.typography.titleSmall)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = actions.retry, modifier = Modifier.testTag("community-retry")) { Text(stringResource(R.string.community_retry)) }
                                    TextButton(onClick = actions.discard) { Text(stringResource(R.string.community_stop_tracking)) }
                                }
                                if (pending is CreateIntent.Page) Text("@${pending.body.handle}", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                    when (val destination = state.destination) {
                        is Destination.Feed -> feed(state, destination.tab, actions, time, report)
                        Destination.Discover -> discover(state, actions, time, report)
                        is Destination.Page -> page(state, actions, time, ask, report)
                        is Destination.Post -> post(state, actions, time, ask, report)
                        Destination.MyPages -> myPages(state, actions, time, ask)
                        Destination.Blocked -> { blocked(state, actions, ask); item("feed-controls-link") { FeedControlsLink(state, actions) }; safetyContent() }
                        Destination.Interests -> { interests(state, actions); item("feed-controls-link") { FeedControlsLink(state, actions) } }
                        Destination.FeedControls -> feedControls(state, actions)
                    }
                    if (state.nextCursor != null && state.destination !is Destination.MyPages && state.destination !is Destination.Blocked && state.destination !is Destination.Interests && state.destination !is Destination.FeedControls) item("more") {
                        TextButton(onClick = actions.more, enabled = !state.busy) { Text(stringResource(R.string.community_more)) }
                    }
                }
            }
        }
    }
    confirmation?.let { current ->
        AlertDialog(onDismissRequest = { confirmation = null }, title = { Text(current.title) }, text = { Text(current.text) },
            confirmButton = { TextButton(onClick = { confirmation = null; current.action() }, modifier = Modifier.testTag("community-confirm")) { Text(current.confirm) } },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text(stringResource(R.string.community_cancel)) } })
    }
    reporting?.let { target -> ReportDialog(target, onDismiss = { reporting = null }) { reason, details -> reporting = null; actions.report(target.type, target.id, reason, details) } }
}

@Composable
private fun title(state: CommunityState): String = when (val destination = state.destination) {
    is Destination.Feed -> stringResource(R.string.community_home)
    Destination.Discover -> stringResource(R.string.community_discover)
    is Destination.Page -> state.page?.name ?: stringResource(R.string.community_page)
    is Destination.Post -> state.post?.pageName ?: stringResource(R.string.community_post)
    Destination.MyPages -> stringResource(R.string.community_my_pages)
    Destination.Blocked -> stringResource(R.string.community_blocked)
    Destination.Interests -> stringResource(R.string.community_interests)
    Destination.FeedControls -> stringResource(R.string.community_feed_controls)
}

private fun DateTimeFormatter.show(value: String?) = value?.let { try { format(Instant.parse(it)) } catch (_error: RuntimeException) { null } }.orEmpty()

@Composable
private fun pageMessage(value: String): String = when (value) {
    PAGE_EDIT_INVALID -> stringResource(R.string.community_page_edit_invalid)
    PAGE_RULES_INVALID -> stringResource(R.string.community_page_rules_invalid)
    PAGE_EDIT_CONFLICT -> stringResource(R.string.community_page_edit_conflict)
    PAGE_EDIT_SAVED -> stringResource(R.string.community_page_saved)
    MODERATOR_ID_INVALID -> stringResource(R.string.community_moderator_id_invalid)
    MODERATOR_INVITED -> stringResource(R.string.community_moderator_invited_notice)
    HANDOVER_OFFERED -> stringResource(R.string.community_handover_offered)
    HANDOVER_ACCEPTED -> stringResource(R.string.community_handover_accepted)
    PAGE_ARCHIVED -> stringResource(R.string.community_page_archived)
    PAGE_RESTORED -> stringResource(R.string.community_page_restored)
    PAGE_DELETED -> stringResource(R.string.community_page_deleted_notice)
    PAGE_DELETE_NAME -> stringResource(R.string.community_page_delete_name)
    CLASSIFICATION_SAVED -> stringResource(R.string.community_classification_saved)
    CLASSIFICATION_CONFLICT -> stringResource(R.string.community_classification_conflict)
    TERMS_UNAVAILABLE -> stringResource(R.string.community_terms_unavailable)
    TAXONOMY_UNAVAILABLE -> stringResource(R.string.community_taxonomy_unavailable)
    INTERESTS_SAVED -> stringResource(R.string.community_interests_saved)
    INTERESTS_CONFLICT -> stringResource(R.string.community_interests_conflict)
    INTERESTS_TOO_MANY -> stringResource(R.string.community_interests_too_many)
    FEED_CONTROL_UNDONE -> stringResource(R.string.community_control_undone)
    else -> value
}

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.feed(state: CommunityState, tab: FeedTab, actions: CommunityActions, time: DateTimeFormatter, report: (ReportTarget) -> Unit) {
    item("tabs") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(FeedTab.FOLLOWING to R.string.community_following, FeedTab.LATEST to R.string.community_latest, FeedTab.SAVED to R.string.community_saved).forEach { (value, label) ->
                FilterChip(selected = tab == value, onClick = { actions.open(Destination.Feed(value)) }, enabled = !state.working, label = { Text(stringResource(label)) }, modifier = Modifier.testTag("feed-${value.name.lowercase()}"))
            }
        }
        Text(stringResource(R.string.community_public_only), style = MaterialTheme.typography.bodySmall)
    }
    if (!state.loading && state.posts.isEmpty() && state.error == null) item("empty") {
        Text(stringResource(when (tab) { FeedTab.FOLLOWING -> R.string.community_feed_empty; FeedTab.SAVED -> R.string.community_saved_empty; FeedTab.LATEST -> R.string.community_latest_empty }))
    }
    // Saved is not changed by mutes, so its posts have no feed controls (DEC-037).
    val why = when (tab) { FeedTab.FOLLOWING -> WhyShown.Following; FeedTab.LATEST -> WhyShown.Latest; FeedTab.SAVED -> null }
    items(state.posts, key = { it.id }) { post -> PostItem(post, state, actions, time, report, why = why) }
}

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.discover(state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, report: (ReportTarget) -> Unit) {
    item("search") {
        var query by rememberSaveable { mutableStateOf(state.query) }
        var topic by rememberSaveable { mutableStateOf(state.topic) }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !state.searchPosts, onClick = { actions.searchFor(false) }, enabled = !state.working, label = { Text(stringResource(R.string.community_pages)) }, modifier = Modifier.testTag("discover-pages"))
                FilterChip(selected = state.searchPosts, onClick = { actions.searchFor(true) }, enabled = !state.working, label = { Text(stringResource(R.string.community_posts)) }, modifier = Modifier.testTag("discover-posts"))
            }
            if (state.searchPosts) Text(stringResource(R.string.community_search_posts_note), style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(value = query, onValueChange = { query = it.take(80) }, label = { Text(stringResource(if (state.searchPosts) R.string.community_search_posts else R.string.community_search)) }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("discover-query"))
            if (!state.searchPosts) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = topic == null, onClick = { topic = null }, label = { Text(stringResource(R.string.community_all_topics)) })
                topicChoices(state.taxonomy, topic).forEach { value -> FilterChip(selected = topic == value, onClick = { topic = value }, label = { Text(termName(state.taxonomy, "topic", value)) }) }
            }
            if (!state.searchPosts) state.taxonomy?.let { taxonomy -> DiscoverFilters(state, taxonomy, actions) }
            Button(onClick = { actions.search(query, topic) }, enabled = !state.busy, modifier = Modifier.testTag("discover-search")) { Text(stringResource(R.string.community_search_button)) }
        }
    }
    if (state.searchPosts) {
        if (!state.loading && state.posts.isEmpty() && state.error == null) item("empty") {
            Text(stringResource(if (state.query.isBlank()) R.string.community_latest_empty else R.string.community_no_matching_posts))
        }
        items(state.posts, key = { it.id }) { post -> PostItem(post, state, actions, time, report) }
    } else {
        suggestions(state, actions) { interestPosts(state, actions) { post ->
            val reasons = state.interestPosts.firstOrNull { it.post.id == post.id }?.reasons.orEmpty()
            PostItem(post, state, actions, time, report, why = WhyShown.Interests(reasons))
        } }
        if (!state.loading && state.pages.isEmpty() && state.error == null) item("empty") { Text(stringResource(R.string.community_no_pages)) }
        items(state.pages, key = { it.id }) { page -> PageItem(page, state, actions) }
    }
}

@Composable
internal fun PageItem(page: PageDto, state: CommunityState, actions: CommunityActions) {
    Column(Modifier.fillMaxWidth().clickable(role = Role.Button, enabled = !state.working) { actions.open(Destination.Page(page.handle)) }.padding(vertical = 6.dp).testTag("page-${page.handle}"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(page.name, style = MaterialTheme.typography.titleMedium)
        Text("@${page.handle} / ${termName(state.taxonomy, "topic", page.topic)} / ${pluralStringResource(R.plurals.community_followers, page.followerCount, page.followerCount)}", style = MaterialTheme.typography.bodySmall)
        ModerationMark(page.moderation)
        if (!page.writable) Text(stringResource(if (page.deleted) R.string.community_state_deleted else R.string.community_state_read_only),
            style = MaterialTheme.typography.labelLarge, modifier = Modifier.testTag("page-state-${page.handle}"))
        if (page.description.isNotEmpty()) Text(page.description, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
        // A read-only page cannot be followed, but it can still be unfollowed.
        if (!page.canManage && (page.writable || page.following)) OutlinedButton(onClick = { actions.follow(page) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("follow-${page.handle}")) {
            Text(stringResource(if (page.following) R.string.community_unfollow else R.string.community_follow))
        }
        HorizontalDivider()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostItem(post: PostDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, report: (ReportTarget) -> Unit, open: Boolean = true, pinnedMark: Boolean = false, why: WhyShown? = null) {
    Column(Modifier.fillMaxWidth().testTag("post-${post.id}"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("${post.pageName} / @${post.pageHandle}", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f).clickable(role = Role.Button, enabled = !state.working) { actions.open(Destination.Page(post.pageHandle)) })
            // Only Following, Latest and From your interests offer feed controls; a page's own list, Saved and search results do not.
            if (why != null && post.status == "published") PostMenu(post, why, state, actions)
        }
        Text(listOfNotNull(time.show(post.publishedAt ?: post.createdAt), post.editedAt?.let { stringResource(R.string.community_edited) }, if (pinnedMark && post.pinned) stringResource(R.string.community_pinned) else null, if (post.status == "draft") stringResource(R.string.community_draft) else null, if (!post.pageWritable) stringResource(R.string.community_state_read_only) else null).joinToString(" / "), style = MaterialTheme.typography.bodySmall)
        post.title?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
        Text(post.body, style = MaterialTheme.typography.bodyLarge)
        PostTermChips(post, state.taxonomy)
        ModerationMark(post.moderation)
        if (open && post.status == "published" && post.pageWritable && post.pageLimited)
            Text(stringResource(R.string.community_comments_paused), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("comments-paused-${post.id}"))
        if (post.status == "published") FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (post.pageWritable || post.liked) TextButton(onClick = { actions.like(post) }, enabled = !state.working, modifier = Modifier.testTag("like-${post.id}")) {
                Icon(if (post.liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null)
                Text(stringResource(if (post.liked) R.string.community_liked else R.string.community_like, post.likeCount), Modifier.padding(start = 4.dp))
            }
            if (open) TextButton(onClick = { actions.open(Destination.Post(post.id)) }, enabled = !state.working, modifier = Modifier.testTag("comments-${post.id}")) { Text(stringResource(R.string.community_comments, post.commentCount)) }
            if (post.pageWritable || post.saved) TextButton(onClick = { actions.save(post) }, enabled = !state.working, modifier = Modifier.testTag("save-${post.id}")) {
                Icon(Icons.Default.Star, null); Text(stringResource(if (post.saved) R.string.community_saved_state else R.string.community_save), Modifier.padding(start = 4.dp))
            }
            if (!post.canManage) TextButton(onClick = { report(ReportTarget("post", post.id, post.title ?: post.pageName)) }, enabled = !state.working) { Text(stringResource(R.string.community_report)) }
        }
        HorizontalDivider()
    }
}

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.page(state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit, report: (ReportTarget) -> Unit) {
    if (state.missing) { item("missing") { Text(stringResource(R.string.community_page_missing)) }; return }
    val page = state.page ?: return
    item("header") {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(page.name, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
            Text("@${page.handle} / ${termName(state.taxonomy, "topic", page.topic)} / ${pluralStringResource(R.plurals.community_followers, page.followerCount, page.followerCount)}", style = MaterialTheme.typography.bodySmall)
            ClassificationChips(page, state.taxonomy)
            ModerationMark(page.moderation)
            PageLimitNotice(page)
            if (page.description.isNotEmpty()) Text(page.description)
            if (page.canManage) {
                Text(stringResource(R.string.community_you_own), color = MaterialTheme.colorScheme.primary)
                if (state.editingPage == null && page.writable) OutlinedButton(onClick = { actions.startPageEdit(page) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-edit")) { Text(stringResource(R.string.community_edit_page)) }
                if (state.classifying == null && page.writable && state.taxonomy != null) OutlinedButton(onClick = { actions.startClassify(page) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-classify")) { Text(stringResource(R.string.community_classify_page)) }
            }
            else FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val blockLabel = stringResource(R.string.community_block_page)
                val blockText = stringResource(R.string.community_block_page_text, page.name)
                if (!page.blocked && (page.writable || page.following)) OutlinedButton(onClick = { actions.follow(page) }, enabled = !state.working, modifier = Modifier.testTag("page-follow")) { Text(stringResource(if (page.following) R.string.community_unfollow else R.string.community_follow)) }
                if (page.blocked) state.blocks.firstOrNull { it.pageId == page.id }?.let { block -> OutlinedButton(onClick = { actions.unblock(block) }, enabled = !state.working) { Text(stringResource(R.string.community_unblock)) } }
                else TextButton(onClick = { ask(Confirmation(blockLabel, blockText, blockLabel) { actions.blockPage(page) }) }, enabled = !state.working, modifier = Modifier.testTag("page-block")) { Text(blockLabel) }
                TextButton(onClick = { report(ReportTarget("page", page.id, page.name)) }, enabled = !state.working) { Text(stringResource(R.string.community_report)) }
            }
            if (page.blocked) Text(stringResource(R.string.community_page_blocked))
            HorizontalDivider()
        }
    }
    if (page.readOnly) item("read-only") { Text(stringResource(R.string.community_page_read_only), modifier = Modifier.testTag("page-read-only")) }
    // Only the owner reaches a deleted page, to restore it.
    if (page.deleted) {
        item("deleted") { DeletedPage(page, state, actions, time) }
        return
    }
    page.rules?.takeIf { it.isNotEmpty() }?.let { rules ->
        item("rules") {
            Column(Modifier.testTag("page-rules"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                Text(stringResource(R.string.community_rules), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                Text(rules)
            }
        }
    }
    if (page.canManage) {
        state.editingPage?.takeIf { it.id == page.id }?.let { opened -> item("page-editor") { PageEditor(opened, state, actions) } }
        state.classifying?.takeIf { it.id == page.id }?.let { opened -> state.taxonomy?.let { taxonomy -> item("page-classification") { ClassificationEditor(opened, taxonomy, state, actions) } } }
        if (page.writable) item("composer") { Composer(state, actions) }
        if (page.writable && page.paused) item("publish-paused") {
            Text(stringResource(R.string.community_publish_paused), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("page-publish-paused"))
        }
        item("drafts-heading") { Text(stringResource(R.string.community_drafts), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
        if (state.drafts.isEmpty()) item("no-drafts") { Text(stringResource(R.string.community_no_drafts)) }
        items(state.drafts, key = { "draft-${it.id}" }) { draft ->
            Column {
                PostItem(draft, state, actions, time, report)
                if (state.editingPostId == draft.id) PostEditor(draft, state, actions) else if (page.writable) ManagerActions(draft, state, actions, ask, canPublish = !page.paused)
            }
        }
        item("moderators") { Moderators(page, state, actions, time, ask) }
        item("insights") { Insights(state, actions) }
        item("page-state") { PageState(page, state, actions, ask) }
    }
    // Pinned posts also come in the date-ordered list; they show only once, in their own section above it.
    val pinnedIds = state.pinned.map(PostDto::id).toSet()
    val shown = state.posts.filterNot { it.id in pinnedIds }
    if (!page.blocked && state.pinned.isNotEmpty()) {
        item("pinned-heading") { Text(stringResource(R.string.community_pinned), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }.testTag("pinned-heading")) }
        items(state.pinned, key = { "pinned-${it.id}" }) { post ->
            Column(Modifier.testTag("pinned-${post.id}")) {
                PostItem(post, state, actions, time, report, pinnedMark = true)
                PostControls(post, page, state, actions, ask)
            }
        }
    }
    item("posts-heading") { Text(stringResource(R.string.community_posts), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    if (!state.loading && !page.blocked && shown.isEmpty() && state.nextCursor == null) item("no-posts") {
        Text(stringResource(if (state.posts.isEmpty()) R.string.community_no_posts else R.string.community_no_other_posts), modifier = Modifier.testTag("page-no-posts"))
    }
    items(shown, key = { it.id }) { post ->
        Column {
            PostItem(post, state, actions, time, report)
            PostControls(post, page, state, actions, ask)
        }
    }
}

/** The owner's controls on a post, or a moderator's pin, while the page is active. */
@Composable
private fun PostControls(post: PostDto, page: PageDto, state: CommunityState, actions: CommunityActions, ask: (Confirmation) -> Unit) {
    when {
        post.canManage && state.editingPostId == post.id -> PostEditor(post, state, actions)
        !page.writable -> Unit
        post.canManage -> ManagerActions(post, state, actions, ask, canPublish = !page.paused)
        state.moderating && post.status == "published" -> TextButton(onClick = { actions.pin(post) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("pin-${post.id}")) {
            Text(stringResource(if (post.pinned) R.string.community_unpin else R.string.community_pin))
        }
    }
}

private fun expired(value: String?): Boolean = value?.let { try { !Instant.parse(it).isAfter(Instant.now()) } catch (_error: RuntimeException) { false } } ?: false

/** Everyone sees that a limited page is paused; its owner also sees why and where to appeal (DEC-040). */
@Composable
private fun PageLimitNotice(page: PageDto) {
    if (!page.limited) return
    val owner = page.limit
    Text(if (owner != null) stringResource(R.string.community_page_limited_owner, moderationReasonLabel(owner.reason)) else stringResource(R.string.community_page_limited),
        color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.semantics(mergeDescendants = true) {}.testTag(if (owner != null) "page-limited-owner" else "page-limited"))
}

/** A deleted page, as only its owner sees it: when it will be erased, and the way to restore it before then. */
@Composable
private fun DeletedPage(page: PageDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter) {
    Column(Modifier.testTag("page-deleted"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(stringResource(R.string.community_page_deleted, time.show(page.purgeAfter)))
        Button(onClick = actions.restorePage, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-restore")) { Text(stringResource(R.string.community_restore)) }
    }
}

/** The owner's totals for their page (DEC-038): loaded only when opened, each period read as one item. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Insights(state: CommunityState, actions: CommunityActions) {
    // Periods are shown in the device's own language and time zone.
    val range = remember { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withZone(ZoneId.systemDefault()) }
    Column(Modifier.testTag("page-insights"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(stringResource(R.string.community_insights), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        if (!state.insightsOpen) {
            OutlinedButton(onClick = actions.showInsights, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("insights-show")) { Text(stringResource(R.string.community_insights_show)) }
            return@Column
        }
        Text(stringResource(R.string.community_insights_note), style = MaterialTheme.typography.bodySmall)
        val insights = state.insights
        when {
            insights != null -> {
                Text(stringResource(R.string.community_insights_followers, insights.followerCount), style = MaterialTheme.typography.titleSmall, modifier = Modifier.testTag("insights-followers"))
                insights.periods.forEachIndexed { index, period ->
                    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag("insights-period-$index"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                        Text("${range.show(period.start)} \u2013 ${range.show(period.end)}", style = MaterialTheme.typography.labelLarge)
                        Text(stringResource(R.string.community_insights_new_followers, period.newFollowers))
                        Text(stringResource(R.string.community_insights_posts, period.posts))
                        Text(stringResource(R.string.community_insights_comments, period.comments))
                        Text(stringResource(R.string.community_insights_likes, period.likes))
                        HorizontalDivider()
                    }
                }
            }
            state.insightsLoading -> Text(stringResource(R.string.community_insights_loading))
            state.insightsFailed -> Text(stringResource(R.string.community_insights_failed), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("insights-error"))
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            OutlinedButton(onClick = actions.loadInsights, enabled = !state.insightsLoading, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("insights-reload")) {
                Text(stringResource(if (state.insightsFailed) R.string.community_retry else R.string.community_insights_refresh))
            }
            TextButton(onClick = actions.hideInsights, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("insights-hide")) { Text(stringResource(R.string.community_insights_hide)) }
        }
    }
}

/** The owner's moderators, the waiting invitation and the handover offer (DEC-025). Nobody else sees who moderates a page. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Moderators(page: PageDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit) {
    val offer = state.handover?.takeIf { it.status == "pending" }
    val waiting = state.moderators.any { it.status == "pending" && !expired(it.expiresAt) }
    val active = state.moderators.count { it.status == "active" }
    val locked = state.pending != null || state.working
    var invitee by rememberSaveable(page.id) { mutableStateOf("") }
    Column(Modifier.testTag("page-moderators"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(stringResource(R.string.community_moderators), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.community_moderators_note), style = MaterialTheme.typography.bodySmall)
        if (state.moderators.isEmpty()) Text(stringResource(R.string.community_no_moderators))
        state.moderators.forEach { moderator -> ModeratorRow(moderator, page, offer == null, state, actions, time, ask) }
        offer?.let { current ->
            Column(Modifier.testTag("page-handover"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                Text(stringResource(R.string.community_handover_waiting, current.toName, time.show(current.expiresAt)))
                TextButton(onClick = { actions.respondHandover(current, "cancel") }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("handover-cancel")) { Text(stringResource(R.string.community_handover_cancel)) }
            }
        }
        if (page.writable && !waiting && active < MAX_MODERATORS) {
            Text(stringResource(R.string.community_invite_moderator), style = MaterialTheme.typography.titleSmall)
            OutlinedTextField(value = invitee, onValueChange = { invitee = it.take(64) }, label = { Text(stringResource(R.string.community_invite_account)) },
                supportingText = { Text(stringResource(R.string.community_invite_help)) }, enabled = !locked, singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("moderator-invite-id"))
            Button(onClick = { if (actions.inviteModerator(invitee)) invitee = "" }, enabled = !locked && invitee.isNotBlank(), shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderator-invite")) { Text(stringResource(R.string.community_invite_send)) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ModeratorRow(moderator: ModeratorDto, page: PageDto, canOffer: Boolean, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit) {
    val withdraw = stringResource(R.string.community_withdraw_invitation)
    val withdrawText = stringResource(R.string.community_withdraw_invitation_text, moderator.displayName)
    val remove = stringResource(R.string.community_remove_moderator)
    val removeTitle = stringResource(R.string.community_remove_moderator_title, moderator.displayName)
    val removeText = stringResource(R.string.community_remove_moderator_text, moderator.displayName, page.name)
    val handOver = stringResource(R.string.community_hand_over)
    val handOverTitle = stringResource(R.string.community_hand_over_title, page.name, moderator.displayName)
    val handOverText = stringResource(R.string.community_hand_over_text, moderator.displayName)
    val handOverSend = stringResource(R.string.community_hand_over_send)
    Column(Modifier.fillMaxWidth().testTag("moderator-${moderator.id}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        Text(moderator.displayName, style = MaterialTheme.typography.titleSmall)
        Text(when {
            moderator.status == "active" -> stringResource(R.string.community_moderator_active)
            expired(moderator.expiresAt) -> stringResource(R.string.community_moderator_expired)
            else -> stringResource(R.string.community_moderator_invited, time.show(moderator.expiresAt))
        }, style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            if (moderator.status == "pending") TextButton(onClick = { ask(Confirmation(withdraw, withdrawText, withdraw) { actions.resolveModerator(moderator, "withdraw") }) }, enabled = !state.working,
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderator-withdraw-${moderator.id}")) { Text(withdraw) }
            else {
                if (page.writable && canOffer) TextButton(onClick = { ask(Confirmation(handOverTitle, handOverText, handOverSend) { actions.offerHandover(moderator) }) }, enabled = !state.working && state.pending == null,
                    shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderator-handover-${moderator.id}")) { Text(handOver) }
                TextButton(onClick = { ask(Confirmation(removeTitle, removeText, remove) { actions.resolveModerator(moderator, "remove") }) }, enabled = !state.working,
                    shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("moderator-remove-${moderator.id}")) { Text(remove) }
            }
        }
    }
}

/** Archive (read only) or restore the page, or delete it after typing its name. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PageState(page: PageDto, state: CommunityState, actions: CommunityActions, ask: (Confirmation) -> Unit) {
    var deleting by rememberSaveable(page.id) { mutableStateOf(false) }
    val archive = stringResource(R.string.community_archive)
    val archiveText = stringResource(R.string.community_archive_text, page.name)
    Column(Modifier.testTag("page-state"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(stringResource(R.string.community_page_state), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            if (page.readOnly) Button(onClick = actions.restorePage, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-restore")) { Text(stringResource(R.string.community_restore)) }
            else OutlinedButton(onClick = { ask(Confirmation(archive, archiveText, archive) { actions.archivePage() }) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-archive")) { Text(archive) }
            TextButton(onClick = { deleting = true }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-delete")) { Text(stringResource(R.string.community_delete_page)) }
        }
    }
    if (deleting) DeletePageDialog(page, state, onDismiss = { deleting = false }) { typed -> if (actions.deletePage(typed)) deleting = false }
}

/** Deleting needs the page's name typed exactly, as the server checks it too. */
@Composable
private fun DeletePageDialog(page: PageDto, state: CommunityState, onDismiss: () -> Unit, onDelete: (String) -> Unit) {
    var typed by rememberSaveable(page.id) { mutableStateOf("") }
    val matches = typed.replace(Regex("[\\s\\p{Z}\\u0085\\u001C-\\u001F]+"), " ").trim() == page.name
    AlertDialog(onDismissRequest = onDismiss, title = { Text(stringResource(R.string.community_delete_page_title, page.name)) }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()).testTag("page-delete-dialog"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Text(stringResource(R.string.community_delete_page_text))
            OutlinedTextField(value = typed, onValueChange = { typed = it.takeCodePoints(160) }, label = { Text(stringResource(R.string.community_delete_page_name)) },
                singleLine = true, modifier = Modifier.fillMaxWidth().testTag("page-delete-name"))
        }
    }, confirmButton = {
        TextButton(onClick = { onDelete(typed) }, enabled = matches && !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-delete-confirm")) { Text(stringResource(R.string.community_delete_page)) }
    }, dismissButton = {
        TextButton(onClick = onDismiss, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget)) { Text(stringResource(R.string.community_cancel)) }
    })
}

/** A page offered to you: accepting makes you its owner and the previous owner one of its moderators. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OfferItem(offer: HandoverDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit) {
    val accept = stringResource(R.string.community_accept)
    val acceptTitle = stringResource(R.string.community_accept_offer_title, offer.pageName)
    val acceptText = stringResource(R.string.community_accept_offer_text, offer.fromName)
    Column(Modifier.fillMaxWidth().testTag("offer-${offer.id}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        Text(stringResource(R.string.community_offer, offer.fromName, offer.pageName, time.show(offer.expiresAt)))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Button(onClick = { ask(Confirmation(acceptTitle, acceptText, accept) { actions.respondHandover(offer, "accept") }) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("offer-accept-${offer.id}")) { Text(accept) }
            TextButton(onClick = { actions.respondHandover(offer, "decline") }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("offer-decline-${offer.id}")) { Text(stringResource(R.string.community_decline)) }
        }
        HorizontalDivider()
    }
}

/** Your invitation to moderate a page, or a page you moderate. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RoleItem(role: ModeratorRoleDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit) {
    val accept = stringResource(R.string.community_accept)
    val acceptTitle = stringResource(R.string.community_accept_role_title, role.pageName)
    val acceptText = stringResource(R.string.community_accept_role_text)
    val stepDown = stringResource(R.string.community_step_down)
    val stepDownTitle = stringResource(R.string.community_step_down_title, role.pageName)
    val stepDownText = stringResource(R.string.community_step_down_text)
    Column(Modifier.fillMaxWidth().testTag("role-${role.id}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        if (role.status == "pending") {
            Text(stringResource(R.string.community_role_invitation, role.pageName, time.show(role.expiresAt)))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                Button(onClick = { ask(Confirmation(acceptTitle, acceptText, accept) { actions.resolveRole(role, "accept") }) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("role-accept-${role.id}")) { Text(accept) }
                TextButton(onClick = { actions.resolveRole(role, "decline") }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("role-decline-${role.id}")) { Text(stringResource(R.string.community_decline)) }
            }
        } else {
            Text(role.pageName, style = MaterialTheme.typography.titleSmall)
            Text("@${role.pageHandle}", style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                OutlinedButton(onClick = { actions.open(Destination.Page(role.pageHandle)) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("role-open-${role.id}")) { Text(stringResource(R.string.community_open_page)) }
                TextButton(onClick = { ask(Confirmation(stepDownTitle, stepDownText, stepDown) { actions.resolveRole(role, "step-down") }) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("role-step-down-${role.id}")) { Text(stepDown) }
            }
        }
        HorizontalDivider()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ManagerActions(post: PostDto, state: CommunityState, actions: CommunityActions, ask: (Confirmation) -> Unit, canPublish: Boolean = true) {
    val publishTitle = stringResource(R.string.community_publish)
    val publishText = stringResource(R.string.community_publish_text)
    val deleteTitle = stringResource(R.string.community_delete_post)
    val deleteText = stringResource(R.string.community_delete_post_text)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (post.status == "draft" && canPublish) Button(onClick = { ask(Confirmation(publishTitle, publishText, publishTitle) { actions.publish(post) }) }, enabled = !state.working, modifier = Modifier.testTag("publish-${post.id}")) { Text(publishTitle) }
        TextButton(onClick = { actions.startEdit(post) }, enabled = !state.working, modifier = Modifier.testTag("edit-${post.id}")) { Text(stringResource(R.string.community_edit_post)) }
        if (post.status == "published") TextButton(onClick = { actions.pin(post) }, enabled = !state.working, modifier = Modifier.testTag("pin-${post.id}")) {
            Text(stringResource(if (post.pinned) R.string.community_unpin else R.string.community_pin))
        }
        TextButton(onClick = { ask(Confirmation(deleteTitle, deleteText, deleteTitle) { actions.deletePost(post) }) }, enabled = !state.working, modifier = Modifier.testTag("delete-${post.id}")) { Text(deleteTitle) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostEditor(post: PostDto, state: CommunityState, actions: CommunityActions) {
    var title by rememberSaveable(post.id) { mutableStateOf(post.title.orEmpty()) }
    var body by rememberSaveable(post.id) { mutableStateOf(post.body) }
    var topics by rememberSaveable(post.id, stateSaver = codesSaver) { mutableStateOf(post.topics.orEmpty()) }
    var interests by rememberSaveable(post.id, stateSaver = codesSaver) { mutableStateOf(post.interests.orEmpty()) }
    Column(Modifier.testTag("post-editor-${post.id}"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(value = title, onValueChange = { title = it.take(240) }, label = { Text(stringResource(R.string.community_post_title)) }, enabled = !state.working, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("edit-title-${post.id}"))
        OutlinedTextField(value = body, onValueChange = { body = it.take(10000) }, label = { Text(stringResource(R.string.community_post_text)) }, enabled = !state.working, minLines = 3, maxLines = 8, modifier = Modifier.fillMaxWidth().testTag("edit-body-${post.id}"))
        state.taxonomy?.let { taxonomy ->
            PostTermPickers(taxonomy, topics, interests, !state.working, "edit-terms-${post.id}", state.unavailableTerms, onTopics = { topics = it }, onInterests = { interests = it })
        }
        if (post.status == "published") Text(stringResource(R.string.community_edit_published_note), style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val termsChanged = topics != post.topics.orEmpty() || interests != post.interests.orEmpty()
            Button(onClick = { if (termsChanged) actions.editPostTerms(post, title, body, topics, interests) else actions.editPost(post, title, body) }, enabled = !state.working && body.isNotBlank(), modifier = Modifier.testTag("edit-save-${post.id}")) { Text(stringResource(R.string.save_changes)) }
            TextButton(onClick = actions.cancelEdit, enabled = !state.working, modifier = Modifier.testTag("edit-cancel-${post.id}")) { Text(stringResource(R.string.community_cancel)) }
        }
    }
}

/** Starts from the version the editor opened with and keeps the person's text until the server confirms the change. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PageEditor(opened: PageDto, state: CommunityState, actions: CommunityActions) {
    var name by rememberSaveable(opened.id, opened.etag, state.pageEditSession) { mutableStateOf(opened.name) }
    var description by rememberSaveable(opened.id, opened.etag, state.pageEditSession) { mutableStateOf(opened.description) }
    var topic by rememberSaveable(opened.id, opened.etag, state.pageEditSession) { mutableStateOf(opened.topic) }
    var rules by rememberSaveable(opened.id, opened.etag, state.pageEditSession) { mutableStateOf(opened.rules.orEmpty()) }
    Column(Modifier.testTag("page-editor"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(stringResource(R.string.community_edit_page), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        OutlinedTextField(value = name, onValueChange = { name = it.takeCodePoints(160) }, label = { Text(stringResource(R.string.community_edit_name)) }, enabled = !state.working, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("page-edit-name"))
        Text(stringResource(R.string.community_edit_topic), style = MaterialTheme.typography.labelLarge, modifier = Modifier.testTag("page-edit-topic"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            topicChoices(state.taxonomy, opened.topic).forEach { value -> FilterChip(selected = topic == value, onClick = { topic = value }, enabled = !state.working,
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-edit-topic-$value"), label = { Text(termName(state.taxonomy, "topic", value)) }) }
        }
        OutlinedTextField(value = description, onValueChange = { description = it.takeCodePoints(1000) }, label = { Text(stringResource(R.string.community_edit_description)) }, enabled = !state.working, minLines = 2, maxLines = 5, modifier = Modifier.fillMaxWidth().testTag("page-edit-description"))
        OutlinedTextField(value = rules, onValueChange = { rules = it.takeCodePoints(4000) }, label = { Text(stringResource(R.string.community_edit_rules)) },
            supportingText = { Text(stringResource(R.string.community_edit_rules_note)) }, enabled = !state.working, minLines = 3, maxLines = 8, modifier = Modifier.fillMaxWidth().testTag("page-edit-rules"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Button(onClick = { actions.editPage(name, description, topic, rules) }, enabled = !state.working,
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-edit-save")) { Text(stringResource(R.string.community_save_page)) }
            TextButton(onClick = actions.cancelPageEdit, enabled = !state.working,
                shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-edit-cancel")) { Text(stringResource(R.string.community_close_editor)) }
        }
    }
}

@Composable
private fun Composer(state: CommunityState, actions: CommunityActions) {
    // A confirmed draft starts a new session and so an empty composer; a refused one keeps everything typed and chosen.
    var title by rememberSaveable(state.page?.id, state.composerSession) { mutableStateOf("") }
    var body by rememberSaveable(state.page?.id, state.composerSession) { mutableStateOf("") }
    var topics by rememberSaveable(state.page?.id, state.composerSession, stateSaver = codesSaver) { mutableStateOf(emptyList<String>()) }
    var interests by rememberSaveable(state.page?.id, state.composerSession, stateSaver = codesSaver) { mutableStateOf(emptyList<String>()) }
    val enabled = state.pending == null && !state.working
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.community_new_post), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.community_draft_note), style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(value = title, onValueChange = { title = it.take(240) }, label = { Text(stringResource(R.string.community_post_title)) }, enabled = enabled, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("post-title"))
        OutlinedTextField(value = body, onValueChange = { body = it.take(10000) }, label = { Text(stringResource(R.string.community_post_text)) }, enabled = enabled, minLines = 3, maxLines = 8, modifier = Modifier.fillMaxWidth().testTag("post-body"))
        state.taxonomy?.let { taxonomy ->
            PostTermPickers(taxonomy, topics, interests, enabled, "composer-terms", state.unavailableTerms, onTopics = { topics = it }, onInterests = { interests = it })
        }
        Button(onClick = { if (topics.isEmpty() && interests.isEmpty()) actions.createPost(title, body) else actions.createPostTerms(title, body, topics, interests) }, enabled = enabled && body.isNotBlank(), modifier = Modifier.testTag("post-save-draft")) { Text(stringResource(R.string.community_save_draft)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.post(state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit, report: (ReportTarget) -> Unit) {
    if (state.missing) { item("missing") { Text(stringResource(R.string.community_post_missing)) }; return }
    val post = state.post ?: return
    item("post") { PostItem(post, state, actions, time, report, open = false) }
    if (post.status != "published") return
    item("comment-form") {
        if (post.commentsOpen) CommentComposer(state, actions, null)
        else if (post.pageWritable) Text(stringResource(R.string.community_comments_paused), Modifier.testTag("post-comments-paused"))
        else Text(stringResource(R.string.community_page_read_only), Modifier.testTag("post-read-only"))
    }
    if (!state.loading && state.comments.isEmpty()) item("no-comments") { Text(stringResource(R.string.community_no_comments)) }
    val top = state.comments.filter { it.parentId == null }
    top.forEach { comment ->
        item(comment.id) { CommentItem(comment, state, actions, time, ask, report, pageWritable = post.commentsOpen) }
        state.comments.filter { it.parentId == comment.id }.forEach { reply ->
            item(reply.id) { Box(Modifier.padding(start = 24.dp)) { CommentItem(reply, state, actions, time, ask, report, pageWritable = post.commentsOpen) } }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommentItem(comment: CommentDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit, report: (ReportTarget) -> Unit, pageWritable: Boolean) {
    var replying by remember { mutableStateOf(false) }
    val removeTitle = stringResource(if (comment.mine) R.string.community_delete_comment else R.string.community_remove_comment)
    val removeText = stringResource(if (comment.mine) R.string.community_delete_comment_text else R.string.community_remove_comment_text)
    val blockTitle = stringResource(R.string.community_block_person)
    val blockText = stringResource(R.string.community_block_person_text, comment.authorName)
    Column(Modifier.fillMaxWidth().testTag("comment-${comment.id}"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("${if (comment.mine) stringResource(R.string.community_you) else comment.authorName} / ${time.show(comment.createdAt)}", style = MaterialTheme.typography.labelLarge)
        Text(comment.body ?: stringResource(if (comment.status == "removed") R.string.community_comment_removed else R.string.community_comment_deleted),
            style = if (comment.body == null) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge)
        ModerationMark(comment.moderation)
        if (comment.status == "visible") FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (pageWritable && comment.parentId == null) TextButton(onClick = { replying = !replying }, enabled = !state.working) { Text(stringResource(R.string.community_reply)) }
            if (comment.canRemove) TextButton(onClick = { ask(Confirmation(removeTitle, removeText, removeTitle) { actions.endComment(comment) }) }, enabled = !state.working) { Text(removeTitle) }
            if (!comment.mine) TextButton(onClick = { ask(Confirmation(blockTitle, blockText, blockTitle) { actions.blockAuthor(comment) }) }, enabled = !state.working, modifier = Modifier.testTag("comment-block-${comment.id}")) { Text(blockTitle) }
            if (!comment.mine) TextButton(onClick = { report(ReportTarget("comment", comment.id, comment.authorName)) }, enabled = !state.working) { Text(stringResource(R.string.community_report)) }
        }
        if (pageWritable && replying) CommentComposer(state, actions, comment) { replying = false }
        HorizontalDivider()
    }
}

@Composable
private fun CommentComposer(state: CommunityState, actions: CommunityActions, parent: CommentDto?, onDone: () -> Unit = {}) {
    var text by rememberSaveable(parent?.id) { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedTextField(value = text, onValueChange = { text = it.take(4000) }, enabled = state.pending == null && !state.working,
            label = { Text(if (parent == null) stringResource(R.string.community_write_comment) else stringResource(R.string.community_reply_to, parent.authorName)) },
            minLines = 2, maxLines = 6, modifier = Modifier.fillMaxWidth().testTag(if (parent == null) "comment-text" else "reply-text"))
        Button(onClick = { if (actions.comment(text, parent)) { text = ""; onDone() } }, enabled = state.pending == null && !state.working && text.isNotBlank(),
            modifier = Modifier.testTag(if (parent == null) "comment-send" else "reply-send")) {
            Text(stringResource(if (parent == null) R.string.community_post_comment else R.string.community_post_reply))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.myPages(state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit) {
    item("owned-heading") { Text(stringResource(R.string.community_owned), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    state.ownedError?.let { error -> item("owned-error") {
        Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("owned-error"))
            OutlinedButton(onClick = actions.reload, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("owned-retry")) { Text(stringResource(R.string.community_retry)) }
        }
    } }
    if (state.noOwnedPages) item("none") { Text(stringResource(R.string.community_no_owned)) }
    items(state.pages, key = { it.id }) { page -> PageItem(page, state, actions) }
    if (state.pages.size < 5) item("create") {
        var handle by rememberSaveable { mutableStateOf("") }
        var name by rememberSaveable { mutableStateOf("") }
        var topic by rememberSaveable { mutableStateOf("community") }
        var description by rememberSaveable { mutableStateOf("") }
        val locked = state.pending != null || state.working
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.community_create_page), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.community_public_warning), style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(value = handle, onValueChange = { handle = it.take(30) }, label = { Text(stringResource(R.string.community_handle)) }, enabled = !locked, singleLine = true,
                supportingText = { Text(stringResource(R.string.community_handle_help)) }, isError = handle.isNotBlank() && !handle.trim().lowercase().matches(HANDLE_PATTERN), modifier = Modifier.fillMaxWidth().testTag("page-handle"))
            OutlinedTextField(value = name, onValueChange = { name = it.takeCodePoints(160) }, label = { Text(stringResource(R.string.community_page_name)) }, enabled = !locked, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("page-name"))
            Text(stringResource(R.string.community_edit_topic), style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                topicChoices(state.taxonomy, null).forEach { value -> FilterChip(selected = topic == value, onClick = { topic = value }, enabled = !locked,
                    modifier = Modifier.testTag("page-create-topic-$value"), label = { Text(termName(state.taxonomy, "topic", value)) }) }
            }
            OutlinedTextField(value = description, onValueChange = { description = it.takeCodePoints(1000) }, label = { Text(stringResource(R.string.community_description)) }, enabled = !locked, minLines = 2, maxLines = 5, modifier = Modifier.fillMaxWidth().testTag("page-description"))
            Button(onClick = { if (actions.createPage(handle, name, topic, description)) { handle = ""; name = ""; description = "" } }, enabled = !locked && handle.isNotBlank() && name.isNotBlank(), modifier = Modifier.testTag("page-create")) {
                Text(stringResource(R.string.community_create_page))
            }
        }
    }
    // Pages offered to you, your invitations to moderate, and the pages you moderate; they load with the pages you own.
    item("moderating-heading") { Text(stringResource(R.string.community_moderating), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    if (state.ownedLoaded && state.roles.isEmpty() && state.offers.isEmpty()) item("moderating-none") { Text(stringResource(R.string.community_no_moderating), modifier = Modifier.testTag("moderating-none")) }
    items(state.offers, key = { "offer-${it.id}" }) { offer -> OfferItem(offer, state, actions, time, ask) }
    items(state.roles, key = { "role-${it.id}" }) { role -> RoleItem(role, state, actions, time, ask) }
    item("followed-heading") { Text(stringResource(R.string.community_followed), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    when (state.followedStatus) {
        ListStatus.LOADING -> item("followed-loading") { Text(stringResource(R.string.community_loading_followed), modifier = Modifier.testTag("followed-loading")) }
        ListStatus.FAILED -> Unit
        ListStatus.LOADED -> if (state.noFollowedPages) item("followed-empty") {
            Column(Modifier.testTag("followed-empty"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
                Text(stringResource(R.string.community_no_followed))
                TextButton(onClick = { actions.open(Destination.Discover) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("followed-discover")) { Text(stringResource(R.string.community_discover_pages)) }
            }
        }
    }
    // A page can be both yours and followed, so these keys differ from the owned list's.
    if (state.followedStatus == ListStatus.LOADED) items(state.followed, key = { "followed-${it.id}" }) { page -> FollowedItem(page, state, actions) }
    if (state.followedStatus == ListStatus.LOADED && state.followedNextCursor != null && state.followedError == null) item("followed-more") {
        TextButton(onClick = actions.more, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("followed-more")) { Text(stringResource(R.string.community_more)) }
    }
    if (state.followedStatus == ListStatus.FAILED || state.followedError != null) item("followed-failed") {
        val reveal = remember { BringIntoViewRequester() }
        LaunchedEffect(state.followedError, state.followedStatus) {
            // The error footer can be taller than the Load more button it replaces.
            withFrameNanos { }
            reveal.bringIntoView()
        }
        Column(Modifier.bringIntoViewRequester(reveal), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            // When your own pages failed first, the followed list was not asked for, so it does not repeat that error.
            val followedFailure = state.followedError?.takeUnless { it == state.ownedError }
            Text(followedFailure ?: stringResource(R.string.community_followed_failed), color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("followed-error"))
            OutlinedButton(onClick = actions.retryFollowing, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("followed-retry")) { Text(stringResource(R.string.community_retry)) }
        }
    }
}

@Composable
private fun FollowedItem(page: PageDto, state: CommunityState, actions: CommunityActions) {
    val unfollowLabel = stringResource(R.string.community_unfollow_page, page.name)
    Column(Modifier.fillMaxWidth().clickable(role = Role.Button, enabled = !state.working) { actions.open(Destination.Page(page.handle)) }.padding(vertical = DesignTokens.SpaceUnit * 2).testTag("followed-page-${page.handle}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        Text(page.name, style = MaterialTheme.typography.titleMedium)
        Text("@${page.handle} / ${termName(state.taxonomy, "topic", page.topic)} / ${pluralStringResource(R.plurals.community_followers, page.followerCount, page.followerCount)}", style = MaterialTheme.typography.bodySmall)
        ModerationMark(page.moderation)
        // Disabled until the list has reloaded, so a page just unfollowed cannot be sent again.
        OutlinedButton(onClick = { actions.unfollow(page) }, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).semantics { contentDescription = unfollowLabel }.testTag("unfollow-${page.handle}")) {
            Text(stringResource(R.string.community_unfollow))
        }
        HorizontalDivider()
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.blocked(state: CommunityState, actions: CommunityActions, ask: (Confirmation) -> Unit) {
    item("explain") { Text(stringResource(R.string.community_blocked_explain), style = MaterialTheme.typography.bodySmall) }
    if (!state.loading && state.blocks.isEmpty()) item("none") { Text(stringResource(R.string.community_no_blocks)) }
    items(state.blocks, key = { it.id }) { block ->
        val title = stringResource(R.string.community_unblock)
        val text = stringResource(R.string.community_unblock_text, block.label)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(block.label, style = MaterialTheme.typography.titleSmall)
                Text(stringResource(if (block.targetType == "page") R.string.community_page else R.string.community_person), style = MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick = { ask(Confirmation(title, text, title) { actions.unblock(block) }) }, enabled = !state.working, modifier = Modifier.testTag("unblock-${block.id}")) { Text(title) }
        }
    }
}

@Composable
private fun ReportDialog(target: ReportTarget, onDismiss: () -> Unit, onSend: (String, String) -> Unit) {
    var reason by rememberSaveable { mutableStateOf<String?>(null) }
    var details by rememberSaveable { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(stringResource(R.string.community_report_title, target.label)) }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            REPORT_REASONS.forEach { value ->
                Row(Modifier.fillMaxWidth().heightIn(min = DesignTokens.MinimumTarget).selectable(selected = reason == value, role = Role.RadioButton) { reason = value }, verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = reason == value, onClick = null)
                    Spacer(Modifier.width(8.dp))
                    Text(moderationReasonLabel(value))
                }
            }
            OutlinedTextField(value = details, onValueChange = { details = it.takeCodePoints(REPORT_DETAILS_LIMIT) }, label = { Text(stringResource(R.string.community_report_details)) }, minLines = 2, maxLines = 4, modifier = Modifier.fillMaxWidth())
        }
    }, confirmButton = {
        TextButton(onClick = { reason?.let { onSend(it, details) } }, enabled = reason != null, modifier = Modifier.testTag("report-send")) { Text(stringResource(R.string.community_send_report)) }
    }, dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.community_cancel)) } })
}
