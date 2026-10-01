package com.community.platform.feature.platform

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.DesignTokens
import com.community.platform.R
import com.community.platform.feature.community.PostDto
import com.community.platform.feature.planning.CalendarEntryDto
import com.community.platform.feature.spaces.SpaceDto
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val SHOWN = 3
private val unit = DesignTokens.SpaceUnit

data class HomeActions(
    val refresh: () -> Unit = {},
    val retrySpaces: () -> Unit = {},
    val retryInvitations: () -> Unit = {},
    val retryJoins: () -> Unit = {},
    val retryRequests: () -> Unit = {},
    val retryInbox: () -> Unit = {},
    val retryDay: (String) -> Unit = {},
    val retryPosts: () -> Unit = {},
)

/** Where Home's links lead. Every link opens a screen the person can already reach elsewhere (DEC-014). */
data class HomeLinks(
    val inbox: () -> Unit = {},
    val search: () -> Unit = {},
    val calendar: () -> Unit = {},
    val medicines: () -> Unit = {},
    val spaces: () -> Unit = {},
    val reminders: () -> Unit = {},
    val entry: (CalendarEntryDto, SpaceDto?) -> Unit = { _, _ -> },
    val tasks: (SpaceDto) -> Unit = {},
    val feed: () -> Unit = {},
    val findPages: () -> Unit = {},
    val post: (PostDto) -> Unit = {},
)

@Composable
fun HomeRoute(viewModel: HomeViewModel, accountId: String, links: HomeLinks, onBack: () -> Unit, onSessionLost: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.resume() }
    LaunchedEffect(state.requiresSignIn) { if (state.requiresSignIn) onSessionLost() }
    BackHandler(onBack = onBack)
    if (state.accountId == accountId) HomeScreen(state, HomeActions(
        viewModel::refresh, viewModel::retrySpaces, viewModel::retryInvitations, viewModel::retryJoins,
        viewModel::retryRequests, viewModel::retryInbox, viewModel::retryDay, viewModel::retryPosts,
    ), links)
}

/** Home is a personal overview: what needs attention, today's plans, your Spaces and pages you follow, each with "View all". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeScreen(state: HomeState, actions: HomeActions, links: HomeLinks) {
    val zone = remember(state.timezone) { try { ZoneId.of(state.timezone) } catch (_error: RuntimeException) { ZoneOffset.UTC } }
    val time = remember(zone) { DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault()).withZone(zone) }
    val dayTime = remember(zone) { DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.getDefault()).withZone(zone) }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = unit * 5, end = unit * 2, top = unit * 2, bottom = unit * 2), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.home_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = links.search, modifier = Modifier.testTag("home-search")) { Icon(Icons.Default.Search, stringResource(R.string.search_title)) }
                val unread = state.unreadCount ?: 0
                // IconButton clips its content to a circle, which cut off the count badge at large text sizes, so the bell keeps
                // the same 48 dp target and ripple without that clip.
                Box(
                    Modifier.size(DesignTokens.MinimumTarget)
                        .clickable(remember { MutableInteractionSource() }, ripple(bounded = false, radius = unit * 5), role = Role.Button, onClick = links.inbox)
                        .testTag("home-inbox"),
                    contentAlignment = Alignment.Center,
                ) {
                    // The icon's label already says the count, so the badge is not read out a second time.
                    BadgedBox(badge = { if (unread > 0) Badge(Modifier.clearAndSetSemantics {}) { Text(unread.toString()) } }) {
                        Icon(Icons.Default.Notifications, if (unread > 0) pluralStringResource(R.plurals.home_inbox_unread, unread, unread) else stringResource(R.string.reminders_inbox))
                    }
                }
                IconButton(onClick = actions.refresh, modifier = Modifier.testTag("home-refresh")) { Icon(Icons.Default.Refresh, stringResource(R.string.home_refresh)) }
            }
            HorizontalDivider(color = DesignTokens.Border)
            LazyColumn(Modifier.fillMaxSize().testTag("home-content"), contentPadding = PaddingValues(unit * 5), verticalArrangement = Arrangement.spacedBy(unit * 7)) {
                item("shortcuts") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                        Shortcut(stringResource(R.string.calendar_title), "home-calendar", links.calendar) { Icon(Icons.Default.DateRange, null, Modifier.size(unit * 5)) }
                        Shortcut(stringResource(R.string.care_title), "home-medicines", links.medicines) { Icon(Icons.Default.Favorite, null, Modifier.size(unit * 5)) }
                    }
                }
                item("attention") { NeedsAttention(state, actions, links, dayTime) }
                item("today") { Today(state, actions, links, time) }
                item("spaces") { YourSpaces(state, actions, links) }
                item("pages") { FromPages(state, actions, links, dayTime) }
            }
        }
    }
}

@Composable
private fun Shortcut(label: String, tag: String, onClick: () -> Unit, icon: @Composable () -> Unit) {
    OutlinedButton(onClick = onClick, shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag(tag)) {
        icon(); Spacer(Modifier.width(unit * 2)); Text(label)
    }
}

@Composable
private fun Section(title: String, tag: String, allLabel: String, onAll: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().testTag(tag), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).semantics { heading() })
            TextButton(onClick = onAll, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("$tag-all").semantics { contentDescription = allLabel }) {
                Text(stringResource(R.string.home_view_all))
            }
        }
        content()
    }
}

/** One item with its action: side by side when there is room, and the action below the words on narrow screens or large text. */
@Composable
private fun Line(text: String, detail: String?, action: String, actionLabel: String, tag: String, onAction: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth().testTag(tag)) {
        val stacked = LocalDensity.current.fontScale > 1.3f || maxWidth < unit * 60
        val words: @Composable (Modifier) -> Unit = { modifier ->
            Column(modifier) {
                Text(text, style = MaterialTheme.typography.bodyLarge, maxLines = 3, overflow = TextOverflow.Ellipsis)
                detail?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        val button: @Composable (PaddingValues) -> Unit = { padding ->
            TextButton(onClick = onAction, contentPadding = padding, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("$tag-action").semantics { contentDescription = actionLabel }) { Text(action) }
        }
        if (stacked) Column { words(Modifier.fillMaxWidth()); button(PaddingValues(end = unit * 3)) }
        else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
            words(Modifier.weight(1f)); button(PaddingValues(horizontal = unit * 3))
        }
    }
}

@Composable
private fun Rows(content: List<@Composable () -> Unit>) {
    content.forEachIndexed { index, row ->
        if (index > 0) HorizontalDivider(color = DesignTokens.Border)
        row()
    }
}

@Composable
private fun Waiting(text: String) {
    Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
        CircularProgressIndicator(Modifier.size(unit * 4), strokeWidth = unit / 2)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Problem(text: String, tag: String, retry: () -> Unit) {
    Row(Modifier.fillMaxWidth().testTag(tag), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
        TextButton(onClick = retry, modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("$tag-retry")) {
            Icon(Icons.Default.Refresh, null, Modifier.size(unit * 4)); Spacer(Modifier.width(unit)); Text(stringResource(R.string.home_retry))
        }
    }
}

@Composable
private fun Quiet(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

private fun DateTimeFormatter.at(value: String?): String? = value?.let { try { format(Instant.parse(it)) } catch (_error: RuntimeException) { null } }

@Composable
private fun NeedsAttention(state: HomeState, actions: HomeActions, links: HomeLinks, dayTime: DateTimeFormatter) {
    val reviewInvitation = stringResource(R.string.home_review_invitation)
    val reviewRequest = stringResource(R.string.home_review_request)
    val openInbox = stringResource(R.string.home_open_inbox)
    val rows = buildList<@Composable () -> Unit> {
        state.invitations.value?.takeIf { !state.invitations.loading }?.forEach { item ->
            val text = stringResource(R.string.home_attention_invitation, item.inviterName, item.spaceName)
            add { Line(text, null, reviewInvitation, reviewInvitation, "home-invitation-${item.id}", links.spaces) }
        }
        if (!state.joinsLoading && !state.joinsFailed) state.reviewedGroups.forEach { space ->
            state.joins[space.id]?.value.orEmpty().forEach { item ->
                val text = stringResource(R.string.home_attention_join, item.displayName, space.name)
                add { Line(text, null, reviewRequest, reviewRequest, "home-join-${item.id}", links.spaces) }
            }
        }
        state.requests.value?.takeIf { !state.requests.loading }?.forEach { item ->
            val text = stringResource(R.string.home_attention_request, item.requestedBy.displayName, item.taskTitle)
            add { Line(text, dayTime.at(item.scheduledAt), reviewRequest, reviewRequest, "home-request-${item.id}", links.reminders) }
        }
        state.inbox.value?.takeIf { !state.inbox.loading }?.forEach { item ->
            val text = stringResource(R.string.home_attention_reminder, item.taskTitle)
            add { Line(text, dayTime.at(item.scheduledAt), openInbox, openInbox, "home-reminder-${item.id}", links.inbox) }
        }
    }
    val checks = listOf(
        Triple(state.invitations.loading, state.invitations.failed, Triple(R.string.home_checking_invitations, R.string.home_failed_invitations, actions.retryInvitations)),
        Triple(state.joinsLoading, state.joinsFailed, Triple(R.string.home_checking_joins, R.string.home_failed_joins, actions.retryJoins)),
        Triple(state.requests.loading, state.requests.failed, Triple(R.string.home_checking_requests, R.string.home_failed_requests, actions.retryRequests)),
        Triple(state.inbox.loading, state.inbox.failed, Triple(R.string.home_checking_reminders, R.string.home_failed_reminders, actions.retryInbox)),
    )
    Section(stringResource(R.string.home_attention), "home-attention", stringResource(R.string.home_attention_all), links.inbox) {
        Rows(rows.take(SHOWN * 2))
        if (rows.size > SHOWN * 2) Quiet(pluralStringResource(R.plurals.home_more, rows.size - SHOWN * 2, rows.size - SHOWN * 2))
        checks.forEachIndexed { index, (loading, failed, texts) ->
            if (loading) Waiting(stringResource(texts.first))
            else if (failed) Problem(stringResource(texts.second), "home-attention-failed-$index", texts.third)
        }
        if (checks.none { it.first || it.second } && rows.isEmpty()) Quiet(stringResource(R.string.home_attention_empty))
    }
}

@Composable
private fun Today(state: HomeState, actions: HomeActions, links: HomeLinks, time: DateTimeFormatter) {
    val spaces = state.spaces.value.orEmpty().associateBy { it.id }
    val entries = state.todayEntries
    val open = stringResource(R.string.home_open)
    val rows = entries.map { entry ->
        val kind = stringResource(when (entry.kind) {
            "task" -> R.string.home_kind_task
            "event" -> R.string.home_kind_event
            "planned" -> R.string.home_kind_planned
            else -> R.string.home_kind_reminder
        })
        val detail = listOfNotNull(if (entry.kind == "task") null else time.at(entry.scheduledAt), kind, spaces[entry.spaceId]?.name).joinToString(" · ")
        val label = stringResource(R.string.home_open_item, entry.title)
        val row: @Composable () -> Unit = { Line(entry.title, detail, open, label, "home-today-${entry.kind}-${entry.id}") { links.entry(entry, spaces[entry.spaceId]) } }
        row
    }
    Section(stringResource(R.string.home_today), "home-today", stringResource(R.string.home_today_all), links.calendar) {
        if (state.spaces.failed) Problem(stringResource(R.string.home_spaces_failed), "home-today-spaces-failed", actions.retrySpaces)
        Rows(rows)
        if (state.todayLoading) Waiting(stringResource(R.string.home_today_loading))
        state.todayFailed.forEach { space -> Problem(stringResource(R.string.home_today_failed, space.name), "home-today-failed-${space.id}") { actions.retryDay(space.id) } }
        if (!state.todayLoading && !state.spaces.failed && state.todayFailed.isEmpty() && entries.isEmpty()) Quiet(stringResource(R.string.home_today_empty))
    }
}

@Composable
private fun YourSpaces(state: HomeState, actions: HomeActions, links: HomeLinks) {
    val list = state.spaces.value.orEmpty()
    val tasks = stringResource(R.string.home_space_tasks)
    val rows = list.take(SHOWN + 1).map { space ->
        val type = stringResource(when (space.spaceType) {
            "couple" -> R.string.spaces_couple_type
            "solo" -> R.string.spaces_solo_type
            "group" -> R.string.spaces_group_type
            else -> R.string.spaces_family_type
        })
        val role = stringResource(when (space.role) { "owner" -> R.string.spaces_owner; "admin" -> R.string.spaces_admin; else -> R.string.spaces_member })
        val label = stringResource(R.string.home_space_tasks_in, space.name)
        val row: @Composable () -> Unit = { Line(space.name, "$type · $role", tasks, label, "home-space-${space.id}") { links.tasks(space) } }
        row
    }
    Section(stringResource(R.string.home_spaces), "home-spaces", stringResource(R.string.home_spaces_all), links.spaces) {
        if (state.spaces.loading) Waiting(stringResource(R.string.home_spaces_loading))
        if (state.spaces.failed) Problem(stringResource(R.string.home_spaces_failed), "home-spaces-failed", actions.retrySpaces)
        Rows(rows)
        if (list.size > SHOWN + 1) Quiet(pluralStringResource(R.plurals.home_more, list.size - SHOWN - 1, list.size - SHOWN - 1))
        if (!state.spaces.loading && state.spaces.value?.isEmpty() == true) {
            Quiet(stringResource(R.string.home_spaces_empty))
            TextButton(onClick = links.spaces, contentPadding = PaddingValues(end = unit * 3), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("home-spaces-create")) {
                Text(stringResource(R.string.home_spaces_create))
            }
        }
    }
}

@Composable
private fun FromPages(state: HomeState, actions: HomeActions, links: HomeLinks, dayTime: DateTimeFormatter) {
    val posts = state.posts.value.orEmpty()
    val read = stringResource(R.string.home_read)
    val rows = posts.take(SHOWN).map { post ->
        val label = post.title?.let { stringResource(R.string.home_read_item, it) } ?: stringResource(R.string.home_read_from, post.pageName)
        val detail = listOfNotNull(post.pageName, dayTime.at(post.publishedAt)).joinToString(" · ")
        val row: @Composable () -> Unit = { Line(post.title ?: post.body.take(120), detail, read, label, "home-post-${post.id}") { links.post(post) } }
        row
    }
    Section(stringResource(R.string.home_pages), "home-pages", stringResource(R.string.home_pages_all), links.feed) {
        if (state.posts.loading) Waiting(stringResource(R.string.home_pages_loading))
        if (state.posts.failed) Problem(stringResource(R.string.home_pages_failed), "home-pages-failed", actions.retryPosts)
        Rows(rows)
        if (!state.posts.loading && state.posts.value?.isEmpty() == true) {
            Quiet(stringResource(R.string.home_pages_empty))
            TextButton(onClick = links.findPages, contentPadding = PaddingValues(end = unit * 3), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("home-pages-find")) {
                Text(stringResource(R.string.home_pages_find))
            }
        }
    }
}
