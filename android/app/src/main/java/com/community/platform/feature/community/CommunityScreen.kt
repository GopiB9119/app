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
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
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
    val editPage: (String, String, String) -> Boolean = { _, _, _ -> false },
)

private data class Confirmation(val title: String, val text: String, val confirm: String, val action: () -> Unit)
private data class ReportTarget(val type: String, val id: String, val label: String)

@Composable
fun CommunityRoute(viewModel: CommunityViewModel, accountId: String, timezone: String, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    if (state.accountId == accountId) CommunityScreen(state, CommunityActions(
        viewModel::open, viewModel::back, { viewModel.reload() }, { viewModel.reload(more = true) }, viewModel::search,
        viewModel::follow, viewModel::like, viewModel::save, viewModel::createPage, viewModel::createPost, viewModel::comment,
        viewModel::retry, viewModel::discardPending, viewModel::publish, viewModel::deletePost, viewModel::endComment,
        viewModel::report, viewModel::blockPage, viewModel::blockAuthor, viewModel::unblock, viewModel::searchFor,
        viewModel::startEdit, viewModel::cancelEdit, viewModel::editPost,
        viewModel::unfollow, viewModel::startPageEdit, viewModel::cancelPageEdit, viewModel::editPage,
    ), timezone, onBack)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CommunityScreen(state: CommunityState, actions: CommunityActions, timezone: String, onExit: () -> Unit) {
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
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = back, enabled = !state.working) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.community_back)) }
                Text(title(state), style = MaterialTheme.typography.titleLarge, maxLines = 2, modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = actions.reload, enabled = !state.busy) { Icon(Icons.Default.Refresh, stringResource(R.string.community_refresh)) }
            }
            // Discover's own places. The blocked list belongs to Profile (DEC-014), so it opens from there without these chips.
            if (state.destination != Destination.Blocked) FlowRow(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(Destination.Feed(FeedTab.FOLLOWING) to R.string.community_home, Destination.Discover to R.string.community_discover,
                    Destination.MyPages to R.string.community_my_pages).forEach { (target, label) ->
                    val selected = if (target is Destination.Feed) state.destination is Destination.Feed else state.destination == target
                    FilterChip(selected = selected, onClick = { if (!selected) actions.open(target) }, enabled = !state.working, label = { Text(stringResource(label)) })
                }
            }
            HorizontalDivider()
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp)) else Spacer(Modifier.height(3.dp))
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.TopCenter) {
                LazyColumn(Modifier.widthIn(max = 720.dp).fillMaxSize().testTag("community-content"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    state.error?.let { item("error") { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("community-error")) } }
                    state.notice?.let { item("notice") { Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.testTag("community-notice")) } }
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
                        Destination.MyPages -> myPages(state, actions)
                        Destination.Blocked -> blocked(state, actions, ask)
                    }
                    if (state.nextCursor != null && state.destination !is Destination.MyPages && state.destination !is Destination.Blocked) item("more") {
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
}

private fun DateTimeFormatter.show(value: String?) = value?.let { try { format(Instant.parse(it)) } catch (_error: RuntimeException) { null } }.orEmpty()

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
    items(state.posts, key = { it.id }) { post -> PostItem(post, state, actions, time, report) }
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
                TOPICS.forEach { value -> FilterChip(selected = topic == value, onClick = { topic = value }, label = { Text(value.replaceFirstChar(Char::uppercase).replace("_", " ")) }) }
            }
            Button(onClick = { actions.search(query, topic) }, enabled = !state.busy, modifier = Modifier.testTag("discover-search")) { Text(stringResource(R.string.community_search_button)) }
        }
    }
    if (state.searchPosts) {
        if (!state.loading && state.posts.isEmpty() && state.error == null) item("empty") {
            Text(stringResource(if (state.query.isBlank()) R.string.community_latest_empty else R.string.community_no_matching_posts))
        }
        items(state.posts, key = { it.id }) { post -> PostItem(post, state, actions, time, report) }
    } else {
        if (!state.loading && state.pages.isEmpty() && state.error == null) item("empty") { Text(stringResource(R.string.community_no_pages)) }
        items(state.pages, key = { it.id }) { page -> PageItem(page, state, actions) }
    }
}

@Composable
private fun PageItem(page: PageDto, state: CommunityState, actions: CommunityActions) {
    Column(Modifier.fillMaxWidth().clickable(role = Role.Button, enabled = !state.working) { actions.open(Destination.Page(page.handle)) }.padding(vertical = 6.dp).testTag("page-${page.handle}"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(page.name, style = MaterialTheme.typography.titleMedium)
        Text("@${page.handle} / ${page.topic} / ${pluralStringResource(R.plurals.community_followers, page.followerCount, page.followerCount)}", style = MaterialTheme.typography.bodySmall)
        if (page.description.isNotEmpty()) Text(page.description, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
        if (!page.canManage) OutlinedButton(onClick = { actions.follow(page) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("follow-${page.handle}")) {
            Text(stringResource(if (page.following) R.string.community_unfollow else R.string.community_follow))
        }
        HorizontalDivider()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostItem(post: PostDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, report: (ReportTarget) -> Unit, open: Boolean = true) {
    Column(Modifier.fillMaxWidth().testTag("post-${post.id}"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("${post.pageName} / @${post.pageHandle}", style = MaterialTheme.typography.labelLarge, modifier = Modifier.clickable(role = Role.Button, enabled = !state.working) { actions.open(Destination.Page(post.pageHandle)) })
        Text(listOfNotNull(time.show(post.publishedAt ?: post.createdAt), post.editedAt?.let { stringResource(R.string.community_edited) }, if (post.status == "draft") stringResource(R.string.community_draft) else null).joinToString(" / "), style = MaterialTheme.typography.bodySmall)
        post.title?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
        Text(post.body, style = MaterialTheme.typography.bodyLarge)
        if (post.status == "published") FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            TextButton(onClick = { actions.like(post) }, enabled = !state.working, modifier = Modifier.testTag("like-${post.id}")) {
                Icon(if (post.liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null)
                Text(stringResource(if (post.liked) R.string.community_liked else R.string.community_like, post.likeCount), Modifier.padding(start = 4.dp))
            }
            if (open) TextButton(onClick = { actions.open(Destination.Post(post.id)) }, enabled = !state.working, modifier = Modifier.testTag("comments-${post.id}")) { Text(stringResource(R.string.community_comments, post.commentCount)) }
            TextButton(onClick = { actions.save(post) }, enabled = !state.working, modifier = Modifier.testTag("save-${post.id}")) {
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
            Text("@${page.handle} / ${page.topic} / ${pluralStringResource(R.plurals.community_followers, page.followerCount, page.followerCount)}", style = MaterialTheme.typography.bodySmall)
            if (page.description.isNotEmpty()) Text(page.description)
            if (page.canManage) {
                Text(stringResource(R.string.community_you_own), color = MaterialTheme.colorScheme.primary)
                val opened = state.editingPage?.takeIf { it.id == page.id }
                if (opened != null) PageEditor(opened, state, actions)
                else OutlinedButton(onClick = { actions.startPageEdit(page) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("page-edit")) { Text(stringResource(R.string.community_edit_page)) }
            }
            else FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val blockLabel = stringResource(R.string.community_block_page)
                val blockText = stringResource(R.string.community_block_page_text, page.name)
                if (!page.blocked) OutlinedButton(onClick = { actions.follow(page) }, enabled = !state.working, modifier = Modifier.testTag("page-follow")) { Text(stringResource(if (page.following) R.string.community_unfollow else R.string.community_follow)) }
                if (page.blocked) state.blocks.firstOrNull { it.pageId == page.id }?.let { block -> OutlinedButton(onClick = { actions.unblock(block) }, enabled = !state.working) { Text(stringResource(R.string.community_unblock)) } }
                else TextButton(onClick = { ask(Confirmation(blockLabel, blockText, blockLabel) { actions.blockPage(page) }) }, enabled = !state.working, modifier = Modifier.testTag("page-block")) { Text(blockLabel) }
                TextButton(onClick = { report(ReportTarget("page", page.id, page.name)) }, enabled = !state.working) { Text(stringResource(R.string.community_report)) }
            }
            if (page.blocked) Text(stringResource(R.string.community_page_blocked))
            HorizontalDivider()
        }
    }
    if (page.canManage) {
        item("composer") { Composer(state, actions) }
        item("drafts-heading") { Text(stringResource(R.string.community_drafts), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
        if (state.drafts.isEmpty()) item("no-drafts") { Text(stringResource(R.string.community_no_drafts)) }
        items(state.drafts, key = { "draft-${it.id}" }) { draft ->
            Column {
                PostItem(draft, state, actions, time, report)
                if (state.editingPostId == draft.id) PostEditor(draft, state, actions) else ManagerActions(draft, state, actions, ask)
            }
        }
    }
    item("posts-heading") { Text(stringResource(R.string.community_posts), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    if (!state.loading && !page.blocked && state.posts.isEmpty()) item("no-posts") { Text(stringResource(R.string.community_no_posts)) }
    items(state.posts, key = { it.id }) { post ->
        Column {
            PostItem(post, state, actions, time, report)
            if (post.canManage) { if (state.editingPostId == post.id) PostEditor(post, state, actions) else ManagerActions(post, state, actions, ask) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ManagerActions(post: PostDto, state: CommunityState, actions: CommunityActions, ask: (Confirmation) -> Unit) {
    val publishTitle = stringResource(R.string.community_publish)
    val publishText = stringResource(R.string.community_publish_text)
    val deleteTitle = stringResource(R.string.community_delete_post)
    val deleteText = stringResource(R.string.community_delete_post_text)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (post.status == "draft") Button(onClick = { ask(Confirmation(publishTitle, publishText, publishTitle) { actions.publish(post) }) }, enabled = !state.working, modifier = Modifier.testTag("publish-${post.id}")) { Text(publishTitle) }
        TextButton(onClick = { actions.startEdit(post) }, enabled = !state.working, modifier = Modifier.testTag("edit-${post.id}")) { Text(stringResource(R.string.community_edit_post)) }
        TextButton(onClick = { ask(Confirmation(deleteTitle, deleteText, deleteTitle) { actions.deletePost(post) }) }, enabled = !state.working, modifier = Modifier.testTag("delete-${post.id}")) { Text(deleteTitle) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostEditor(post: PostDto, state: CommunityState, actions: CommunityActions) {
    var title by rememberSaveable(post.id) { mutableStateOf(post.title.orEmpty()) }
    var body by rememberSaveable(post.id) { mutableStateOf(post.body) }
    Column(Modifier.testTag("post-editor-${post.id}"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(value = title, onValueChange = { title = it.take(240) }, label = { Text(stringResource(R.string.community_post_title)) }, enabled = !state.working, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("edit-title-${post.id}"))
        OutlinedTextField(value = body, onValueChange = { body = it.take(10000) }, label = { Text(stringResource(R.string.community_post_text)) }, enabled = !state.working, minLines = 3, maxLines = 8, modifier = Modifier.fillMaxWidth().testTag("edit-body-${post.id}"))
        if (post.status == "published") Text(stringResource(R.string.community_edit_published_note), style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { actions.editPost(post, title, body) }, enabled = !state.working && body.isNotBlank(), modifier = Modifier.testTag("edit-save-${post.id}")) { Text(stringResource(R.string.save_changes)) }
            TextButton(onClick = actions.cancelEdit, enabled = !state.working, modifier = Modifier.testTag("edit-cancel-${post.id}")) { Text(stringResource(R.string.community_cancel)) }
        }
    }
}

/** Starts from the version the editor opened with and keeps the person's text until the server confirms the change. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PageEditor(opened: PageDto, state: CommunityState, actions: CommunityActions) {
    var name by rememberSaveable(opened.id, opened.etag) { mutableStateOf(opened.name) }
    var description by rememberSaveable(opened.id, opened.etag) { mutableStateOf(opened.description) }
    var topic by rememberSaveable(opened.id, opened.etag) { mutableStateOf(opened.topic) }
    Column(Modifier.testTag("page-editor"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.community_edit_page), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        OutlinedTextField(value = name, onValueChange = { name = it.takeCodePoints(160) }, label = { Text(stringResource(R.string.community_page_name)) }, enabled = !state.working, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("page-edit-name"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TOPICS.forEach { value -> FilterChip(selected = topic == value, onClick = { topic = value }, enabled = !state.working, label = { Text(value.replaceFirstChar(Char::uppercase)) }) }
        }
        OutlinedTextField(value = description, onValueChange = { description = it.takeCodePoints(1000) }, label = { Text(stringResource(R.string.community_description)) }, enabled = !state.working, minLines = 2, maxLines = 5, modifier = Modifier.fillMaxWidth().testTag("page-edit-description"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { actions.editPage(name, description, topic) }, enabled = !state.working && name.isNotBlank(), modifier = Modifier.testTag("page-edit-save")) { Text(stringResource(R.string.community_save_page)) }
            TextButton(onClick = actions.cancelPageEdit, enabled = !state.working, modifier = Modifier.testTag("page-edit-cancel")) { Text(stringResource(R.string.community_cancel)) }
        }
    }
}

@Composable
private fun Composer(state: CommunityState, actions: CommunityActions) {
    var title by rememberSaveable(state.page?.id) { mutableStateOf("") }
    var body by rememberSaveable(state.page?.id) { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.community_new_post), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.community_draft_note), style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(value = title, onValueChange = { title = it.take(240) }, label = { Text(stringResource(R.string.community_post_title)) }, enabled = state.pending == null && !state.working, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("post-title"))
        OutlinedTextField(value = body, onValueChange = { body = it.take(10000) }, label = { Text(stringResource(R.string.community_post_text)) }, enabled = state.pending == null && !state.working, minLines = 3, maxLines = 8, modifier = Modifier.fillMaxWidth().testTag("post-body"))
        Button(onClick = { if (actions.createPost(title, body)) { title = ""; body = "" } }, enabled = state.pending == null && !state.working && body.isNotBlank(), modifier = Modifier.testTag("post-save-draft")) { Text(stringResource(R.string.community_save_draft)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.post(state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit, report: (ReportTarget) -> Unit) {
    if (state.missing) { item("missing") { Text(stringResource(R.string.community_post_missing)) }; return }
    val post = state.post ?: return
    item("post") { PostItem(post, state, actions, time, report, open = false) }
    if (post.status != "published") return
    item("comment-form") { CommentComposer(state, actions, null) }
    if (!state.loading && state.comments.isEmpty()) item("no-comments") { Text(stringResource(R.string.community_no_comments)) }
    val top = state.comments.filter { it.parentId == null }
    top.forEach { comment ->
        item(comment.id) { CommentItem(comment, state, actions, time, ask, report) }
        state.comments.filter { it.parentId == comment.id }.forEach { reply ->
            item(reply.id) { Box(Modifier.padding(start = 24.dp)) { CommentItem(reply, state, actions, time, ask, report) } }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommentItem(comment: CommentDto, state: CommunityState, actions: CommunityActions, time: DateTimeFormatter, ask: (Confirmation) -> Unit, report: (ReportTarget) -> Unit) {
    var replying by remember { mutableStateOf(false) }
    val removeTitle = stringResource(if (comment.mine) R.string.community_delete_comment else R.string.community_remove_comment)
    val removeText = stringResource(if (comment.mine) R.string.community_delete_comment_text else R.string.community_remove_comment_text)
    val blockTitle = stringResource(R.string.community_block_person)
    val blockText = stringResource(R.string.community_block_person_text, comment.authorName)
    Column(Modifier.fillMaxWidth().testTag("comment-${comment.id}"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("${if (comment.mine) stringResource(R.string.community_you) else comment.authorName} / ${time.show(comment.createdAt)}", style = MaterialTheme.typography.labelLarge)
        Text(comment.body ?: stringResource(if (comment.status == "removed") R.string.community_comment_removed else R.string.community_comment_deleted),
            style = if (comment.body == null) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge)
        if (comment.status == "visible") FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (comment.parentId == null) TextButton(onClick = { replying = !replying }, enabled = !state.working) { Text(stringResource(R.string.community_reply)) }
            if (comment.canRemove) TextButton(onClick = { ask(Confirmation(removeTitle, removeText, removeTitle) { actions.endComment(comment) }) }, enabled = !state.working) { Text(removeTitle) }
            if (!comment.mine) TextButton(onClick = { ask(Confirmation(blockTitle, blockText, blockTitle) { actions.blockAuthor(comment) }) }, enabled = !state.working) { Text(blockTitle) }
            if (!comment.mine) TextButton(onClick = { report(ReportTarget("comment", comment.id, comment.authorName)) }, enabled = !state.working) { Text(stringResource(R.string.community_report)) }
        }
        if (replying) CommentComposer(state, actions, comment) { replying = false }
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

@OptIn(ExperimentalLayoutApi::class)
private fun androidx.compose.foundation.lazy.LazyListScope.myPages(state: CommunityState, actions: CommunityActions) {
    item("owned-heading") { Text(stringResource(R.string.community_owned), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
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
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TOPICS.forEach { value -> FilterChip(selected = topic == value, onClick = { topic = value }, enabled = !locked, label = { Text(value.replaceFirstChar(Char::uppercase)) }) }
            }
            OutlinedTextField(value = description, onValueChange = { description = it.takeCodePoints(1000) }, label = { Text(stringResource(R.string.community_description)) }, enabled = !locked, minLines = 2, maxLines = 5, modifier = Modifier.fillMaxWidth().testTag("page-description"))
            Button(onClick = { if (actions.createPage(handle, name, topic, description)) { handle = ""; name = ""; description = "" } }, enabled = !locked && handle.isNotBlank() && name.isNotBlank(), modifier = Modifier.testTag("page-create")) {
                Text(stringResource(R.string.community_create_page))
            }
        }
    }
    item("followed-heading") { Text(stringResource(R.string.community_followed), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }) }
    when (state.followedStatus) {
        ListStatus.LOADING -> item("followed-loading") { Text(stringResource(R.string.community_loading_followed), modifier = Modifier.testTag("followed-loading")) }
        // The reason is shown at the top; a failed list never says it is empty.
        ListStatus.FAILED -> item("followed-failed") {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(stringResource(R.string.community_followed_failed), color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = actions.reload, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("followed-retry")) { Text(stringResource(R.string.community_retry)) }
            }
        }
        ListStatus.LOADED -> if (state.noFollowedPages) item("followed-empty") {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(stringResource(R.string.community_no_followed))
                TextButton(onClick = { actions.open(Destination.Discover) }, enabled = !state.working, modifier = Modifier.testTag("followed-discover")) { Text(stringResource(R.string.community_discover_pages)) }
            }
        }
    }
    // A page can be both yours and followed, so these keys differ from the owned list's.
    items(state.followed, key = { "followed-${it.id}" }) { page -> FollowedItem(page, state, actions) }
    if (state.followedStatus == ListStatus.LOADED && state.nextCursor != null) item("followed-more") {
        TextButton(onClick = actions.more, enabled = !state.busy, modifier = Modifier.testTag("followed-more")) { Text(stringResource(R.string.community_more)) }
    }
}

@Composable
private fun FollowedItem(page: PageDto, state: CommunityState, actions: CommunityActions) {
    val unfollowLabel = stringResource(R.string.community_unfollow_page, page.name)
    Column(Modifier.fillMaxWidth().clickable(role = Role.Button, enabled = !state.working) { actions.open(Destination.Page(page.handle)) }.padding(vertical = 6.dp).testTag("followed-page-${page.handle}"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(page.name, style = MaterialTheme.typography.titleMedium)
        Text("@${page.handle}", style = MaterialTheme.typography.bodySmall)
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
                    Text(value.replace("_", " ").replaceFirstChar(Char::uppercase))
                }
            }
            OutlinedTextField(value = details, onValueChange = { details = it.takeCodePoints(REPORT_DETAILS_LIMIT) }, label = { Text(stringResource(R.string.community_report_details)) }, minLines = 2, maxLines = 4, modifier = Modifier.fillMaxWidth())
        }
    }, confirmButton = {
        TextButton(onClick = { reason?.let { onSend(it, details) } }, enabled = reason != null, modifier = Modifier.testTag("report-send")) { Text(stringResource(R.string.community_send_report)) }
    }, dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.community_cancel)) } })
}
