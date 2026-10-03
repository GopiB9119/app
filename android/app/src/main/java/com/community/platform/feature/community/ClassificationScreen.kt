package com.community.platform.feature.community

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.community.platform.DesignTokens
import com.community.platform.R

/** The app's language code, which picks a term's name. */
@Composable
private fun language(): String = LocalConfiguration.current.locales[0].language

/** A term's name in the app's language, or the code written as words while the vocabulary has not loaded. */
@Composable
internal fun termName(taxonomy: Taxonomy?, dimension: String, code: String): String =
    taxonomy?.term(dimension, code)?.name(language()) ?: code.replace('-', ' ').replace('_', ' ').replaceFirstChar(Char::uppercase)

/** The topics to choose from: the vocabulary's current topics, or the bundled list, keeping [current] even when it has been retired. */
internal fun topicChoices(taxonomy: Taxonomy?, current: String?): List<String> {
    val codes = taxonomy?.choices("topic")?.map(TermDto::code)?.ifEmpty { null } ?: TOPICS
    return if (current != null && current !in codes) codes + current else codes
}

@Composable
private fun dimensionLabel(dimension: String): String = stringResource(when (dimension) {
    "topic" -> R.string.community_dimension_topic
    "interest" -> R.string.community_dimension_interest
    "language" -> R.string.community_dimension_language
    "place" -> R.string.community_dimension_place
    "community_type" -> R.string.community_dimension_community_type
    "audience" -> R.string.community_dimension_audience
    "activity" -> R.string.community_dimension_activity
    else -> R.string.community_dimension_content_kind
})

@Composable
private fun partLabel(part: ClassificationPart): String =
    if (part == ClassificationPart.OTHER_TOPICS) stringResource(R.string.community_other_topics) else dimensionLabel(part.dimension)

/**
 * Chooses up to [limit] terms of one [dimension]: chosen terms first (tap to remove), then a searchable list of current terms.
 * [single] replaces the choice instead of adding to it. [flagged] terms are ones the server no longer accepts.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TermPicker(
    label: String, dimension: String, taxonomy: Taxonomy, selected: List<String>, limit: Int, enabled: Boolean, tag: String,
    onChange: (List<String>) -> Unit, flagged: List<String> = emptyList(), excluded: Set<String> = emptySet(), single: Boolean = false,
) {
    val language = language()
    var search by rememberSaveable(tag) { mutableStateOf("") }
    val full = !single && selected.size >= limit
    Column(Modifier.fillMaxWidth().testTag(tag), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(if (single) label else stringResource(R.string.community_terms_count, label, selected.size, limit), style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.semantics { heading() }.testTag("$tag-count"))
        if (selected.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            selected.forEach { code ->
                val name = termName(taxonomy, dimension, code)
                val shown = if (code in flagged) stringResource(R.string.community_term_unavailable, name) else name
                val remove = stringResource(R.string.community_term_remove, name)
                FilterChip(selected = true, onClick = { onChange(selected - code) }, enabled = enabled, label = { Text(shown) }, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).semantics { contentDescription = remove }.testTag("$tag-selected-$code"))
            }
        }
        val all = taxonomy.choices(dimension).filter { it.code !in selected && it.code !in excluded }
        if (termSearchShown(all.size, search)) OutlinedTextField(value = search, onValueChange = { search = it.take(60) }, enabled = enabled, singleLine = true,
            label = { Text(stringResource(R.string.community_term_search, label)) }, modifier = Modifier.fillMaxWidth().testTag("$tag-search"))
        val needle = search.trim().lowercase()
        val matches = all.filter { needle.isEmpty() || it.name(language).lowercase().contains(needle) || it.names.en.lowercase().contains(needle) || it.code.contains(needle) }
        val shown = matches.take(if (needle.isEmpty()) 12 else 30)
        if (shown.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            shown.forEach { term ->
                FilterChip(selected = false, onClick = { onChange(if (single) listOf(term.code) else selected + term.code) }, enabled = enabled && !full,
                    label = { Text(term.name(language)) }, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("$tag-choice-${term.code}"))
            }
        }
        if (needle.isNotEmpty() && matches.isEmpty()) Text(stringResource(R.string.community_term_none), style = MaterialTheme.typography.bodySmall)
        if (matches.size > shown.size) Text(stringResource(R.string.community_term_more, matches.size - shown.size), style = MaterialTheme.typography.bodySmall)
        if (full) Text(stringResource(R.string.community_term_full), style = MaterialTheme.typography.bodySmall)
    }
}

/** A search with text stays shown even when few options remain, so its filter can be cleared. */
internal fun termSearchShown(options: Int, search: String): Boolean = options > 12 || search.isNotEmpty()

/** Discover's filters beyond the topic, shown when "More filters" is open; the next search uses them. */
@Composable
internal fun DiscoverFilters(state: CommunityState, taxonomy: Taxonomy, actions: CommunityActions) {
    var open by rememberSaveable { mutableStateOf(state.filters.any) }
    Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        TextButton(onClick = { open = !open }, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("discover-filters")) {
            Text(stringResource(if (open) R.string.community_fewer_filters else R.string.community_more_filters))
        }
        if (open) PageFilters.FILTER_DIMENSIONS.forEach { dimension ->
            TermPicker(dimensionLabel(dimension), dimension, taxonomy, listOfNotNull(state.filters.get(dimension)), 1, !state.working, "filter-$dimension",
                onChange = { codes -> actions.filter(dimension, codes.firstOrNull()) }, single = true)
        }
    }
}

/** "Suggested for you" on Discover: pages matching your interests with what matched, or a way to choose interests. [more] follows them, before "All pages". */
internal fun LazyListScope.suggestions(state: CommunityState, actions: CommunityActions, more: LazyListScope.() -> Unit = {}) {
    if (state.suggestionsFailed) item("suggestions-failed") {
        Text(stringResource(R.string.community_suggestions_failed), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("suggestions-failed"))
    }
    if (state.suggestionsLoaded) suggestedPages(state, actions)
    more()
    if (state.suggestionsLoaded || state.interestPostsStatus != null) item("suggestions-end") {
        Text(stringResource(R.string.community_all_pages), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
    }
}

private fun LazyListScope.suggestedPages(state: CommunityState, actions: CommunityActions) {
    item("suggestions-heading") {
        Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            Text(stringResource(R.string.community_suggested), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }.testTag("suggestions-heading"))
            if (state.suggestions.isEmpty()) Text(stringResource(R.string.community_suggestions_choose), modifier = Modifier.testTag("suggestions-empty"))
            TextButton(onClick = { actions.open(Destination.Interests) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("suggestions-interests")) {
                Text(stringResource(if (state.suggestions.isEmpty()) R.string.community_choose_interests else R.string.community_change_interests))
            }
        }
    }
    items(state.suggestions, key = { "suggested-${it.page.id}" }) { item ->
        Column(Modifier.testTag("suggested-${item.page.handle}")) {
            val because = item.reasons.map { termName(state.taxonomy, it.dimension, it.code) }
            androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(if (because.isNotEmpty()) stringResource(R.string.community_suggestion_reasons, because.joinToString(", ")) else "", style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f).then(if (because.isNotEmpty()) Modifier.testTag("suggested-reasons-${item.page.handle}") else Modifier))
                SuggestionMenu(item, state, actions)
            }
            PageItem(item.page, state, actions)
        }
    }
}

/** "From your interests" on Discover: public posts matching your own topics and interests, each with what matched. */
internal fun LazyListScope.interestPosts(state: CommunityState, actions: CommunityActions, postItem: @Composable (PostDto) -> Unit) {
    val status = state.interestPostsStatus ?: return
    item("interest-posts-heading") {
        Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            Text(stringResource(R.string.community_interest_posts), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() }.testTag("interest-posts-heading"))
            if (status == ListStatus.FAILED) {
                Text(stringResource(R.string.community_interest_posts_failed), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("interest-posts-failed"))
                OutlinedButton(onClick = actions.moreInterestPosts, enabled = !state.working && !state.interestPostsLoading, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("interest-posts-retry")) { Text(stringResource(R.string.community_retry)) }
            }
            if (status == ListStatus.LOADED && state.interestPosts.isEmpty()) {
                Text(stringResource(R.string.community_interest_posts_empty), modifier = Modifier.testTag("interest-posts-empty"))
                TextButton(onClick = { actions.open(Destination.Interests) }, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                    modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("interest-posts-choose")) { Text(stringResource(R.string.community_choose_interests)) }
            }
        }
    }
    items(state.interestPosts, key = { "interest-post-${it.post.id}" }) { item ->
        Column(Modifier.testTag("interest-post-${item.post.id}"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            val because = item.reasons.map { termName(state.taxonomy, it.dimension, it.code) }
            Text(stringResource(R.string.community_interest_posts_because, because.joinToString(", ")), style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.testTag("interest-post-reasons-${item.post.id}"))
            postItem(item.post)
        }
    }
    if (status == ListStatus.LOADED && state.interestPostsCursor != null) item("interest-posts-more") {
        OutlinedButton(onClick = actions.moreInterestPosts, enabled = !state.working && !state.interestPostsLoading, shape = RoundedCornerShape(DesignTokens.ControlRadius),
            modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("interest-posts-more")) { Text(stringResource(R.string.community_interest_posts_more)) }
    }
}

/** A post's own topics and interests, as words; nothing when it has none. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PostTermChips(post: PostDto, taxonomy: Taxonomy?) {
    val terms = post.topics.orEmpty().map { "topic" to it } + post.interests.orEmpty().map { "interest" to it }
    if (terms.isEmpty()) return
    FlowRow(Modifier.testTag("post-terms-${post.id}"), horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        terms.forEach { (dimension, code) ->
            Surface(shape = RoundedCornerShape(DesignTokens.ControlRadius), color = MaterialTheme.colorScheme.secondaryContainer,
                modifier = Modifier.testTag("post-term-${post.id}-$dimension-$code").semantics(mergeDescendants = true) {}) {
                Text(termName(taxonomy, dimension, code), style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(horizontal = DesignTokens.SpaceUnit * 3, vertical = DesignTokens.SpaceUnit * 2))
            }
        }
    }
}

/** The owner chooses up to three topics and five interests for a post. [flagged] terms are ones the server no longer accepts. */
@Composable
internal fun PostTermPickers(
    taxonomy: Taxonomy, topics: List<String>, interests: List<String>, enabled: Boolean, tag: String, flagged: List<String>,
    onTopics: (List<String>) -> Unit, onInterests: (List<String>) -> Unit,
) {
    Column(Modifier.testTag(tag), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
        Text(stringResource(R.string.community_post_terms), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.community_post_terms_note), style = MaterialTheme.typography.bodySmall)
        TermPicker(dimensionLabel("topic"), "topic", taxonomy, topics, POST_TOPICS_LIMIT, enabled, "$tag-topics", onChange = onTopics, flagged = flagged)
        TermPicker(dimensionLabel("interest"), "interest", taxonomy, interests, POST_INTERESTS_LIMIT, enabled, "$tag-interests", onChange = onInterests, flagged = flagged)
    }
}

/** The page's topics and tags beyond its main topic, as words. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ClassificationChips(page: PageDto, taxonomy: Taxonomy?) {
    val parts = page.classification?.parts?.filterValues { it.isNotEmpty() }.orEmpty()
    if (parts.isEmpty()) return
    Column(Modifier.testTag("page-classification-chips"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
        parts.forEach { (part, codes) ->
            Text(partLabel(part), style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
                codes.forEach { code ->
                    Surface(shape = RoundedCornerShape(DesignTokens.ControlRadius), color = MaterialTheme.colorScheme.secondaryContainer,
                        modifier = Modifier.testTag("page-term-${part.field}-$code")) {
                        Text(termName(taxonomy, part.dimension, code), style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = DesignTokens.SpaceUnit * 3, vertical = DesignTokens.SpaceUnit * 2))
                    }
                }
            }
        }
    }
}

/** The owner's editor for the page's topics and tags. It keeps the choices until the server confirms them. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ClassificationEditor(opened: PageDto, taxonomy: Taxonomy, state: CommunityState, actions: CommunityActions) {
    Column(Modifier.testTag("classification-editor"), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 4)) {
        Text(stringResource(R.string.community_classify_page), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.community_classify_note), style = MaterialTheme.typography.bodySmall)
        ClassificationPart.entries.forEach { part ->
            TermPicker(partLabel(part), part.dimension, taxonomy, state.classificationDraft[part].orEmpty(), part.limit, !state.working, "classify-${part.field}",
                onChange = { codes -> actions.setClassification(part, codes) }, flagged = state.unavailableTerms,
                excluded = if (part == ClassificationPart.OTHER_TOPICS) setOf(opened.topic) else emptySet())
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit)) {
            Button(onClick = actions.saveClassification, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("classify-save")) { Text(stringResource(R.string.community_save_page)) }
            TextButton(onClick = actions.cancelClassify, enabled = !state.working, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("classify-cancel")) { Text(stringResource(R.string.community_close_editor)) }
        }
        HorizontalDivider()
    }
}

/** Your private interests: four lists, saved together against the version loaded. */
internal fun LazyListScope.interests(state: CommunityState, actions: CommunityActions) {
    item("interests-privacy") {
        Text(stringResource(R.string.community_interests_privacy), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("interests-privacy"))
    }
    val taxonomy = state.taxonomy
    if (state.interests == null || taxonomy == null) {
        if (state.error != null) item("interests-retry") {
            OutlinedButton(onClick = actions.reload, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("interests-retry")) { Text(stringResource(R.string.community_retry)) }
        }
        return
    }
    InterestPart.entries.forEach { part ->
        item("interests-${part.field}") {
            TermPicker(dimensionLabel(part.dimension), part.dimension, taxonomy, state.interestsDraft[part].orEmpty(), part.limit, !state.busy && !state.interestsConflict,
                "interests-${part.field}", onChange = { codes -> actions.setInterests(part, codes) }, flagged = state.unavailableTerms)
        }
    }
    item("interests-save") {
        Column(verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {
            if (state.interestsConflict) OutlinedButton(onClick = actions.reload, enabled = !state.busy, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("interests-reload")) { Text(stringResource(R.string.community_interests_reload)) }
            else Button(onClick = actions.saveInterests, enabled = !state.working && state.interestsChanged, shape = RoundedCornerShape(DesignTokens.ControlRadius),
                modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget).testTag("interests-save")) { Text(stringResource(R.string.community_interests_save)) }
        }
    }
}
