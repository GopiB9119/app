package com.community.platform.feature.community

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.UUID
import javax.inject.Inject

enum class FeedTab { FOLLOWING, LATEST, SAVED }

sealed interface Destination {
    data class Feed(val tab: FeedTab) : Destination
    data object Discover : Destination
    data class Page(val reference: String) : Destination
    data class Post(val postId: String) : Destination
    data object MyPages : Destination
    data object Blocked : Destination
    /** Your private interests, opened from Profile. */
    data object Interests : Destination
    /** Your mutes and Not interested marks (DEC-037), each of which can be undone. */
    data object FeedControls : Destination
}

/** The control just added, offered for Undo until it is undone or the screen changes. [name] is the muted page's name. */
data class FeedUndo(val control: FeedControlDto, val name: String? = null)

data class CommunityState(
    val accountId: String? = null,
    val destination: Destination = Destination.Feed(FeedTab.FOLLOWING),
    val history: List<Destination> = emptyList(),
    val loading: Boolean = false,
    val working: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val missing: Boolean = false,
    val posts: List<PostDto> = emptyList(),
    val pages: List<PageDto> = emptyList(),
    val nextCursor: String? = null,
    val query: String = "",
    val topic: String? = null,
    val searchPosts: Boolean = false,
    val page: PageDto? = null,
    val drafts: List<PostDto> = emptyList(),
    /** The shown page's pinned posts, latest pin first. They also come in [posts], the date-ordered list; the screen shows each once. */
    val pinned: List<PostDto> = emptyList(),
    val post: PostDto? = null,
    val editingPostId: String? = null,
    /** The post as it was when Edit was chosen: Save sends its version tag and only the fields that differ from it, never a version refreshed since. */
    val editingPost: PostDto? = null,
    val comments: List<CommentDto> = emptyList(),
    val blocks: List<BlockDto> = emptyList(),
    val pending: CreateIntent? = null,
    val requiresSignIn: Boolean = false,
    val ownedLoaded: Boolean = false,
    val ownedError: String? = null,
    val followed: List<PageDto> = emptyList(),
    val followedStatus: ListStatus = ListStatus.LOADING,
    val followedNextCursor: String? = null,
    val followedError: String? = null,
    /** The page as the editor opened it: Save sends this version tag, never one refreshed later. */
    val editingPage: PageDto? = null,
    val pageEditFailed: Boolean = false,
    val pageEditSession: Long = 0,
    /** The shown page's moderators and its waiting invitation, for its owner (DEC-025). */
    val moderators: List<ModeratorDto> = emptyList(),
    /** The shown page's latest handover offer, for its owner. */
    val handover: HandoverDto? = null,
    /** Your waiting invitations to moderate and the pages you moderate. */
    val roles: List<ModeratorRoleDto> = emptyList(),
    /** Pages offered to you, which you can accept or decline. */
    val offers: List<HandoverDto> = emptyList(),
    /** The shared vocabulary; null until it loads, and then codes are shown as readable words. */
    val taxonomy: Taxonomy? = null,
    /** Discover's filters beyond the topic. */
    val filters: PageFilters = PageFilters(),
    /** Pages matching your interests, with what matched; [suggestionsLoaded] false means not asked for or not answered. */
    val suggestions: List<SuggestedPageDto> = emptyList(),
    val suggestionsLoaded: Boolean = false,
    val suggestionsFailed: Boolean = false,
    /** The page as the classification editor opened it: Save sends this version's tag. */
    val classifying: PageDto? = null,
    val classificationDraft: Map<ClassificationPart, List<String>> = emptyMap(),
    val classifyFailed: Boolean = false,
    /** Your interests as loaded, and the choices not yet saved. */
    val interests: InterestsDto? = null,
    val interestsDraft: Map<InterestPart, List<String>> = emptyMap(),
    /** Your interests changed elsewhere since they loaded; saving needs a reload first. */
    val interestsConflict: Boolean = false,
    /** Terms the server no longer accepts in the last save, to be removed before saving again. */
    val unavailableTerms: List<String> = emptyList(),
    /** Discover's "From your interests": posts matching your own choices; null status means not asked for. */
    val interestPosts: List<InterestPostDto> = emptyList(),
    val interestPostsCursor: String? = null,
    val interestPostsStatus: ListStatus? = null,
    val interestPostsLoading: Boolean = false,
    /** Grows when a new draft is confirmed, so the composer starts empty; a refused draft keeps its text and terms. */
    val composerSession: Long = 0,
    /** Your mutes and Not interested marks, newest first; [controlsLoaded] false until they have loaded. */
    val controls: List<FeedControlDto> = emptyList(),
    val controlsLoaded: Boolean = false,
    val undo: FeedUndo? = null,
    /** The owner opened Insights on the shown page (DEC-038); they load only then, and leaving the page clears them. */
    val insightsOpen: Boolean = false,
    val insights: PageInsightsDto? = null,
    val insightsLoading: Boolean = false,
    val insightsFailed: Boolean = false,
) {
    val interestsChanged: Boolean get() = interests != null && InterestPart.entries.any { interestsDraft[it].orEmpty() != interests.codes(it) }
    val busy: Boolean get() = loading || working
    /** You moderate the shown page, so you may pin its posts; the comments say for themselves which you may remove. */
    val moderating: Boolean get() = page != null && roles.any { it.pageId == page.id && it.status == "active" }
    /** "You do not own a page yet" needs a successful load of the pages you own. */
    val noOwnedPages: Boolean get() = ownedLoaded && pages.isEmpty()
    /** "You do not follow any pages" needs a successful load, so a load in progress or a failure never looks empty. */
    val noFollowedPages: Boolean get() = followedStatus == ListStatus.LOADED && followedError == null && followed.isEmpty()
}

/** A list that loads on its own: its empty message needs a successful load, and a failed load offers Retry instead. */
enum class ListStatus { LOADING, LOADED, FAILED }

const val PAGE_EDIT_INVALID = "Use a name of 1 to 80 characters and a description of up to 500."
const val PAGE_RULES_INVALID = "Use rules of up to 2,000 characters."
const val PAGE_EDIT_CONFLICT = "This page changed since you opened the editor. Close it and reload before editing again."
const val PAGE_EDIT_SAVED = "Page saved."
const val MODERATOR_ID_INVALID = "Enter the full account ID of another person. They find it on their Spaces screen."
const val MODERATOR_INVITED = "Invitation sent. They have 72 hours to accept."
const val HANDOVER_OFFERED = "Offer sent. It lasts 15 minutes."
const val HANDOVER_ACCEPTED = "You own the page now. Its previous owner is one of its moderators."
const val PAGE_ARCHIVED = "Page archived. It is read only until you restore it."
const val PAGE_RESTORED = "Page restored."
const val PAGE_DELETED = "Page deleted. You can restore it for 7 days."
const val PAGE_DELETE_NAME = "Type the page's name exactly to delete it."
/** Publishing and commenting refused because a platform moderator limited or hid the page (DEC-040). */
val PAGE_PAUSED_CODES = setOf("PAGE_LIMITED", "PAGE_SUSPENDED")
const val CLASSIFICATION_SAVED = "Topics and tags saved."
const val CLASSIFICATION_CONFLICT = "This page changed since you opened its topics and tags. Close them and reload before editing again."
const val TERMS_UNAVAILABLE = "Some choices can no longer be chosen. Remove the marked ones and save again."
const val TAXONOMY_UNAVAILABLE = "The list of topics could not load. Try again."
const val INTERESTS_SAVED = "Your interests are saved."
const val INTERESTS_CONFLICT = "Your interests changed on another device. Reload to see them before saving."
const val INTERESTS_TOO_MANY = "Choose fewer terms than the limit shown for each list."
const val FEED_CONTROL_UNDONE = "Undone. The list shows it again."

private val ACCOUNT_ID = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

/** The server allows 1,000 characters of report details, counted as code points (Python `len`). */
const val REPORT_DETAILS_LIMIT = 1000

/** Keeps at most [limit] characters counted as code points, as the server counts them, so a cut never splits a surrogate pair. */
fun String.takeCodePoints(limit: Int): String =
    if (codePointCount(0, length) <= limit) this else substring(0, offsetByCodePoints(0, limit))

/** Counts characters as code points, as the server does, so an emoji counts once. */
fun String.codePointLength(): Int = codePointCount(0, length)

@HiltViewModel
class CommunityViewModel @Inject constructor(
    private val repository: CommunityRepository, private val classification: ClassificationRepository, private val feedControls: FeedControlsRepository,
    private val pageInsights: PageInsightsRepository,
) : ViewModel() {
    /** Without an insights service: Show insights fails like a lost connection. */
    constructor(repository: CommunityRepository, classification: ClassificationRepository, feedControls: FeedControlsRepository) :
        this(repository, classification, feedControls, PageInsightsRepository(UnavailablePageInsightsApi, repository))
    /** Without a classification service: the community screens work as before, with topics shown from the bundled list. */
    constructor(repository: CommunityRepository) : this(repository, ClassificationRepository(UnavailableClassificationApi, repository))
    /** Without a feed-controls service: nothing can be muted or hidden. */
    constructor(repository: CommunityRepository, classification: ClassificationRepository) : this(repository, classification, FeedControlsRepository(UnavailableFeedControlsApi, repository))

    private val mutableState = MutableStateFlow(CommunityState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var loadJob: Job? = null
    private var loadingMore = false
    private var loads = 0L
    private var interestJob: Job? = null
    private var interestLoads = 0L
    private var insightsJob: Job? = null
    private var insightsLoads = 0L

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        loadJob?.cancel()
        interestJob?.cancel()
        insightsJob?.cancel()
        mutableState.value = CommunityState(accountId = accountId)
        if (accountId != null) reload()
    }

    private fun fail(error: Exception, expected: Long, subject: String? = null) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            loadJob?.cancel()
            mutableState.value = CommunityState(accountId = mutableState.value.accountId, requiresSignIn = true)
            return
        }
        val message = if (error is IOException) "No connection. Nothing new is confirmed." else error.message ?: "Something went wrong."
        mutableState.update {
            // A 404 about a comment, a listed post or a block does not mean the shown page or post is gone.
            val gone = failure?.status == 404 && when (val destination = it.destination) {
                is Destination.Page -> subject == null || subject == it.page?.id
                is Destination.Post -> subject == null || subject == destination.postId
                else -> false
            }
            it.copy(error = message, missing = gone)
        }
        // A page limited or hidden since it was shown (DEC-040): show why, and load what the server has now.
        if (failure?.status == 409 && failure.code in PAGE_PAUSED_CODES) load(keepError = true)
    }

    fun open(destination: Destination, remember: Boolean = true) {
        val current = mutableState.value
        if (current.accountId == null || current.working) return
        interestJob?.cancel()
        insightsJob?.cancel()
        mutableState.update {
            CommunityState(
                accountId = it.accountId, destination = destination, history = if (remember) it.history + it.destination else it.history,
                query = if (destination == Destination.Discover) it.query else "", topic = if (destination == Destination.Discover) it.topic else null,
                searchPosts = destination == Destination.Discover && it.searchPosts, pending = it.pending,
                pages = if (destination is Destination.Page) it.pages.filter(PageDto::canManage) else emptyList(),
                taxonomy = it.taxonomy, filters = if (destination == Destination.Discover) it.filters else PageFilters(),
            )
        }
        reload()
    }

    /** Returns false when there is nothing left to go back to inside the community area. */
    fun back(): Boolean {
        val current = mutableState.value
        if (current.working) return true
        val previous = current.history.lastOrNull() ?: return false
        interestJob?.cancel()
        insightsJob?.cancel()
        mutableState.update { CommunityState(accountId = it.accountId, destination = previous, history = it.history.dropLast(1), query = it.query, topic = it.topic, searchPosts = it.searchPosts, taxonomy = it.taxonomy, filters = it.filters) }
        reload()
        return true
    }

    fun search(query: String, topic: String?) {
        mutableState.update { it.copy(query = query.take(80), topic = topic?.takeIf { value -> value in KnownTopics || it.taxonomy?.isTopic(value) == true }) }
        if (mutableState.value.destination == Destination.Discover) reload() else open(Destination.Discover)
    }

    /** Sets or clears one of Discover's filters; the next search uses it. */
    fun filter(dimension: String, code: String?) {
        if (dimension !in PageFilters.FILTER_DIMENSIONS || (code != null && !isCode(code))) return
        // The cursor belongs to the old filters; Load more must not send it with new ones.
        mutableState.update { if (it.working || it.filters.with(dimension, code) == it.filters) it else it.copy(filters = it.filters.with(dimension, code), nextCursor = null) }
    }

    /** Switches Discover between searching public pages and searching published public posts. */
    fun searchFor(posts: Boolean) {
        val current = mutableState.value
        if (current.working || current.destination != Destination.Discover || current.searchPosts == posts) return
        mutableState.update { it.copy(searchPosts = posts, pages = emptyList(), posts = emptyList(), nextCursor = null) }
        reload()
    }

    /** Loads the shown list again. Nothing is sent while a change is unanswered; that change loads what it needs once it is answered (T82). */
    fun reload(more: Boolean = false) {
        if (mutableState.value.working) return
        load(more)
    }

    /** [keepError] keeps the message of the change that stopped this load, so sending the load again does not hide why the change failed. */
    private fun load(more: Boolean = false, keepError: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val cursor = if (more) (if (current.destination == Destination.MyPages) current.followedNextCursor else current.nextCursor) ?: return else null
        val destination = current.destination
        val expected = generation
        val sequence = ++loads
        loadJob?.cancel()
        loadingMore = more
        // A first page loads again from scratch; Load more keeps what is already shown.
        mutableState.update { it.copy(loading = true, error = if (keepError) it.error else null, missing = keepError && it.missing, ownedLoaded = it.ownedLoaded && more,
            followedStatus = if (more) it.followedStatus else ListStatus.LOADING,
            ownedError = if (destination == Destination.MyPages && !more) null else it.ownedError,
            followedError = if (destination == Destination.MyPages) null else it.followedError) }
        loadJob = viewModelScope.launch {
            try {
                // Names for topics and tags: a failure only leaves codes shown as words, except on screens that choose terms.
                // Feeds load them once too, for the topic chips and the Mute menu on their posts (T136).
                val names = destination !is Destination.Feed && destination != Destination.Blocked && (current.taxonomy == null || !more)
                if (classification.available && (names || destination is Destination.Feed && current.taxonomy == null)) {
                    val taxonomy = try { classification.taxonomy(account) } catch (error: CancellationException) { throw error }
                        catch (error: Exception) { if (destination == Destination.Interests) throw error else null }
                    taxonomy?.let { loaded -> apply(expected, destination) { it.copy(taxonomy = loaded) } }
                }
                when (destination) {
                    is Destination.Feed -> {
                        val result = when (destination.tab) {
                            FeedTab.FOLLOWING -> repository.feed(account, cursor)
                            FeedTab.LATEST -> repository.latest(account, cursor)
                            FeedTab.SAVED -> repository.saved(account, cursor)
                        }
                        apply(expected, destination) { it.copy(posts = if (more) (it.posts + result.items).distinctBy(PostDto::id) else result.items, nextCursor = result.nextCursor) }
                    }
                    Destination.Discover -> if (current.searchPosts) {
                        val result = repository.latest(account, cursor, current.query)
                        apply(expected, destination) { it.copy(posts = if (more) (it.posts + result.items).distinctBy(PostDto::id) else result.items, nextCursor = result.nextCursor) }
                    } else {
                        val result = if (classification.available) classification.discover(account, current.query, current.topic, current.filters, cursor) else repository.discover(account, current.query, current.topic, cursor)
                        apply(expected, destination) {
                            it.copy(pages = if (more) (it.pages + result.items).distinctBy(PageDto::id) else result.items, nextCursor = result.nextCursor.takeIf { _ -> it.filters == current.filters })
                        }
                        if (!more && classification.available) {
                            // Suggestions are extra: their failure shows beside them, and never hides the search results.
                            val suggestions = try { classification.suggestions(account) } catch (error: CancellationException) { throw error }
                                catch (error: IdentityFailure) { if (error.status == 401 || error.code == "ACCOUNT_CHANGED") throw error else null }
                                catch (error: Exception) { null }
                            apply(expected, destination) { it.copy(suggestions = suggestions?.items.orEmpty(), suggestionsLoaded = suggestions != null, suggestionsFailed = suggestions == null) }
                            loadInterestPosts(account, expected, more = false)
                        }
                    }
                    is Destination.Page -> {
                        val page = if (more) current.page ?: return@launch else repository.page(account, destination.reference)
                        // A deleted page shows its owner only how to restore it.
                        val hidden = page.blocked || page.deleted
                        val posts = if (hidden) CommunityPage(emptyList(), null) else repository.pagePosts(account, page.id, cursor)
                        val drafts = when { more -> current.drafts; page.canManage && !page.deleted -> repository.drafts(account, page.id); else -> emptyList() }
                        val pinned = when { hidden -> emptyList(); more -> current.pinned; else -> repository.pinnedPosts(account, page.id) }
                        val blocks = if (page.blocked) repository.blocks(account) else emptyList()
                        // The owner manages the page's moderators and handover; anyone else may be one of its moderators.
                        val moderators = when { more -> current.moderators; page.canManage && !page.deleted -> repository.moderators(account, page.id); else -> emptyList() }
                        val handover = when { more -> current.handover; page.canManage && !page.deleted -> repository.handover(account, page.id); else -> null }
                        val roles = when { more -> current.roles; page.canManage || hidden -> emptyList(); else -> repository.moderatorRoles(account) }
                        apply(expected, destination) {
                            // After a handover the former owner's totals must not stay behind, even out of sight.
                            val insights = if (page.canManage) it else it.copy(insightsOpen = false, insights = null, insightsLoading = false, insightsFailed = false)
                            insights.copy(page = page, drafts = drafts, pinned = pinned, blocks = blocks, nextCursor = posts.nextCursor,
                                posts = if (more) (it.posts + posts.items).distinctBy(PostDto::id) else posts.items,
                                moderators = moderators, handover = handover, roles = roles)
                        }
                    }
                    is Destination.Post -> {
                        val post = if (more) current.post ?: return@launch else repository.post(account, destination.postId)
                        val comments = if (post.status == "published") repository.comments(account, post.id, cursor) else CommunityPage(emptyList(), null)
                        apply(expected, destination) {
                            it.copy(post = post, nextCursor = comments.nextCursor, comments = if (more) (it.comments + comments.items).distinctBy(CommentDto::id) else comments.items)
                        }
                    }
                    Destination.MyPages -> {
                        if (!more) {
                            try {
                                val owned = repository.myPages(account)
                                val roles = repository.moderatorRoles(account)
                                val offers = repository.handoverOffers(account)
                                apply(expected, destination) { it.copy(pages = owned, ownedLoaded = true, roles = roles, offers = offers) }
                            } catch (error: CancellationException) { throw error }
                            catch (error: Exception) {
                                if (mutableState.value.destination == destination) {
                                    fail(error, expected)
                                    // One error and one Retry for the screen: Retry loads both lists again, so neither says it is empty meanwhile.
                                    apply(expected, destination) { it.copy(ownedError = it.error, followedStatus = ListStatus.FAILED, followedError = it.error) }
                                }
                                return@launch
                            }
                        }
                        if (generation != expected || mutableState.value.destination != destination) return@launch
                        val result = repository.following(account, cursor)
                        apply(expected, destination) {
                            it.copy(followed = if (more) (it.followed + result.items).distinctBy(PageDto::id) else result.items,
                                nextCursor = result.nextCursor, followedNextCursor = result.nextCursor, followedStatus = ListStatus.LOADED, followedError = null)
                        }
                    }
                    Destination.Blocked -> { val blocks = repository.blocks(account); apply(expected, destination) { it.copy(blocks = blocks) } }
                    Destination.Interests -> {
                        if (!classification.available) throw IdentityFailure("UNAVAILABLE", TAXONOMY_UNAVAILABLE)
                        val interests = classification.interests(account)
                        apply(expected, destination) { it.copy(interests = interests, interestsDraft = interests.parts, interestsConflict = false, unavailableTerms = emptyList()) }
                    }
                    Destination.FeedControls -> {
                        val controls = feedControls.controls(account)
                        apply(expected, destination) { it.copy(controls = controls, controlsLoaded = true) }
                    }
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (mutableState.value.destination == destination) {
                    fail(error, expected)
                    // A failed first page offers Retry; a failed Load more keeps the pages already shown.
                    if (destination == Destination.MyPages) apply(expected, destination) {
                        it.copy(followedStatus = if (more) it.followedStatus else ListStatus.FAILED, followedError = it.error)
                    }
                }
            }
            // A load stopped by a newer one must not say the newer one has finished; the check runs inside the update, so a newer load starting meanwhile is seen.
            finally { mutableState.update { if (generation == expected && loads == sequence && it.destination == destination) it.copy(loading = false) else it } }
        }
    }

    private fun apply(expected: Long, destination: Destination, transform: (CommunityState) -> CommunityState) {
        if (generation == expected && mutableState.value.destination == destination) mutableState.update(transform)
    }

    /** Loads "From your interests" on Discover. Its failure shows beside it and never hides the search results. */
    private fun loadInterestPosts(account: String, expected: Long, more: Boolean) {
        val cursor = if (more) mutableState.value.interestPostsCursor ?: return else null
        interestJob?.cancel()
        val sequence = ++interestLoads
        apply(expected, Destination.Discover) { it.copy(interestPostsLoading = true) }
        interestJob = viewModelScope.launch {
            try {
                val result = try { classification.interestPosts(account, cursor) } catch (error: IdentityFailure) {
                    // Your interests changed since the list was shown: its cursor no longer fits, so the list starts again.
                    if (!more || error.code != "CURSOR_INVALID") throw error
                    val fresh = classification.interestPosts(account, null)
                    apply(expected, Destination.Discover) { it.copy(interestPosts = fresh.items, interestPostsCursor = fresh.nextCursor, interestPostsStatus = ListStatus.LOADED) }
                    return@launch
                }
                apply(expected, Destination.Discover) {
                    it.copy(interestPosts = if (more) (it.interestPosts + result.items).distinctBy { item -> item.post.id } else result.items,
                        interestPostsCursor = result.nextCursor, interestPostsStatus = ListStatus.LOADED)
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = error as? IdentityFailure
                if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") fail(error, expected)
                // A failed Show more keeps the posts already shown.
                else apply(expected, Destination.Discover) { it.copy(interestPostsStatus = if (more) it.interestPostsStatus else ListStatus.FAILED) }
            }
            finally { mutableState.update { if (generation == expected && interestLoads == sequence && it.destination == Destination.Discover) it.copy(interestPostsLoading = false) else it } }
        }
    }

    /** Opens Insights on the owner's shown page and loads them; visitors have no insights to open. */
    fun showInsights() {
        val current = mutableState.value
        val page = current.page ?: return
        if (current.destination !is Destination.Page || !page.canManage || page.deleted) return
        mutableState.update { it.copy(insightsOpen = true) }
        loadInsights()
    }

    fun hideInsights() {
        insightsJob?.cancel()
        mutableState.update { it.copy(insightsOpen = false, insights = null, insightsLoading = false, insightsFailed = false) }
    }

    /** Loads the open insights again: Retry after a failure, or Refresh to see newer totals. */
    fun loadInsights() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val page = current.page ?: return
        val destination = current.destination
        if (!current.insightsOpen || !page.canManage) return
        val expected = generation
        val sequence = ++insightsLoads
        insightsJob?.cancel()
        mutableState.update { it.copy(insightsLoading = true, insightsFailed = false) }
        insightsJob = viewModelScope.launch {
            // Only answers for this account, this page and the still-open section are shown.
            fun applyHere(transform: (CommunityState) -> CommunityState) =
                apply(expected, destination) { if (it.page?.id == page.id && it.insightsOpen) transform(it) else it }
            try {
                val insights = pageInsights.insights(account, page.id)
                applyHere { it.copy(insights = insights) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                val failure = error as? IdentityFailure
                if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") fail(error, expected)
                // A failed refresh keeps no older totals, so nothing out of date is shown as current.
                else applyHere { it.copy(insights = null, insightsFailed = true) }
            }
            finally { mutableState.update { if (generation == expected && insightsLoads == sequence) it.copy(insightsLoading = false) else it } }
        }
    }

    /** Shows more posts from your interests, or loads them again after a failure. */
    fun moreInterestPosts() {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.working || current.interestPostsLoading || current.destination != Destination.Discover || !classification.available) return
        loadInterestPosts(account, generation, more = current.interestPostsStatus == ListStatus.LOADED && current.interestPostsCursor != null)
    }

    /** [subject] is the id the command acts on; without one, a 404 is taken to be about the shown page or post. */
    private fun command(onSuccess: String? = null, subject: String? = null, work: suspend (String) -> Unit) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.working) return
        val expected = generation
        // A load still unanswered could answer after this change with what the server had before it,
        // so it stops now and is sent again once the change is answered, unless the change loads again itself (T82).
        // A load whose answer is already shown is finished, even if its job has not yet ended.
        val interrupted = loadJob?.takeIf { it.isActive && current.loading }
        val more = loadingMore
        interrupted?.cancel()
        mutableState.update { it.copy(working = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                work(account)
                if (generation == expected && onSuccess != null) mutableState.update { it.copy(notice = onSuccess) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected, subject) }
            finally {
                if (generation == expected) {
                    if (interrupted != null && loadJob === interrupted) load(more, keepError = true)
                    mutableState.update { it.copy(working = false) }
                }
            }
        }
    }

    private fun replacePost(post: PostDto) = mutableState.update { state ->
        state.copy(posts = state.posts.map { if (it.id == post.id) post else it }, pinned = state.pinned.map { if (it.id == post.id) post else it },
            interestPosts = state.interestPosts.map { if (it.post.id == post.id) it.copy(post = post) else it },
            post = if (state.post?.id == post.id) post else state.post)
    }

    private fun replacePage(page: PageDto) = mutableState.update { state ->
        state.copy(pages = state.pages.map { if (it.id == page.id) page else it }, page = if (state.page?.id == page.id) page else state.page)
    }

    fun follow(page: PageDto) = command { account ->
        val saved = repository.follow(account, page.id, !page.following)
        replacePage(saved)
        if (saved.following) mutableState.update { state -> state.copy(suggestions = state.suggestions.filterNot { it.page.id == saved.id }) }
    }
    /** Unfollows a page listed under "Pages you follow", then reloads the list from the server. */
    fun unfollow(page: PageDto) {
        val expected = generation
        val destination = mutableState.value.destination
        command(subject = page.id) { account ->
            val saved = repository.follow(account, page.id, false)
            apply(expected, destination) { it.copy(followed = it.followed.filterNot { item -> item.id == saved.id }) }
            if (generation == expected && mutableState.value.destination == destination) reloadAfterCommand()
        }
    }

    fun retryFollowing() = reload(more = mutableState.value.followedStatus == ListStatus.LOADED && mutableState.value.followedNextCursor != null)
    fun like(post: PostDto) {
        if (!post.pageWritable && !post.liked) return
        command(subject = post.id) { replacePost(repository.react(it, post.id, if (post.liked) "unlike" else "like")) }
    }
    fun save(post: PostDto) {
        if (!post.pageWritable && !post.saved) return
        command(subject = post.id) { replacePost(repository.react(it, post.id, if (post.saved) "unsave" else "save")) }
    }
    /** Pins a published post to the top of the shown page, or unpins it, then reloads the page so the pinned list is the server's. The owner and the page's moderators may pin. */
    fun pin(post: PostDto) {
        if ((!post.canManage && !mutableState.value.moderating) || post.status != "published") return
        command(subject = post.id) { replacePost(repository.pin(it, post.id, !post.pinned)); reloadAfterCommand() }
    }

    fun createPage(handle: String, name: String, topic: String, description: String): Boolean {
        val account = mutableState.value.accountId ?: return false
        val clean = handle.trim().lowercase()
        if (!clean.matches(HANDLE_PATTERN) || topic !in KnownTopics || name.trim().isEmpty() || name.trim().codePointCount(0, name.trim().length) > 80 || description.trim().codePointCount(0, description.trim().length) > 500) {
            mutableState.update { it.copy(error = "Check the handle (3 to 30 lowercase letters, digits or single hyphens), name and description.") }
            return false
        }
        return submit(CreateIntent.Page(account, UUID.randomUUID().toString(), CreatePageDto(clean, name.trim().replace(Regex("\\s+"), " "), description.trim(), topic)))
    }

    fun createPost(title: String, body: String, topics: List<String> = emptyList(), interests: List<String> = emptyList()): Boolean {
        val current = mutableState.value
        val account = current.accountId ?: return false
        val page = current.page?.takeIf { it.canManage } ?: return false
        val text = body.trim()
        if (text.isEmpty() || text.codePointCount(0, text.length) > 5000 || title.trim().codePointCount(0, title.trim().length) > 120) {
            mutableState.update { it.copy(error = "Write 1 to 5000 characters, with a title of up to 120.") }
            return false
        }
        if (!postTerms(topics, POST_TOPICS_LIMIT) || !postTerms(interests, POST_INTERESTS_LIMIT)) {
            mutableState.update { it.copy(error = INTERESTS_TOO_MANY) }
            return false
        }
        mutableState.update { it.copy(unavailableTerms = emptyList()) }
        return submit(CreateIntent.Post(account, UUID.randomUUID().toString(), page.id, CreatePostDto(title.trim().ifEmpty { null }, text, topics, interests)))
    }

    private fun postTerms(codes: List<String>, limit: Int) = codes.size <= limit && codes.distinct().size == codes.size && codes.all(::isCode)

    fun comment(body: String, parent: CommentDto? = null): Boolean {
        val current = mutableState.value
        val account = current.accountId ?: return false
        val post = current.post?.takeIf { it.status == "published" && it.commentsOpen } ?: return false
        val text = body.trim()
        if (text.isEmpty() || text.codePointCount(0, text.length) > 2000 || (parent != null && parent.parentId != null)) {
            mutableState.update { it.copy(error = "Write a comment of 1 to 2000 characters.") }
            return false
        }
        return submit(CreateIntent.Comment(account, UUID.randomUUID().toString(), post.id, CreateCommentDto(text, parent?.id)))
    }

    private fun submit(intent: CreateIntent): Boolean {
        val current = mutableState.value
        if (current.working || current.pending != null) return false
        mutableState.update { it.copy(pending = intent) }
        retry()
        return true
    }

    /** Sends the exact pending command again with its original key. */
    fun retry() {
        val intent = mutableState.value.pending ?: return
        // An invitation's 404 is about the invited account, not the shown page.
        command(subject = (intent as? CreateIntent.Moderator)?.inviteeId) {
            try {
                val result = repository.create(intent)
                mutableState.update { it.copy(pending = null) }
                when (intent) {
                    is CreateIntent.Page -> {
                        val handle = (result as PageDto).handle
                        mutableState.update {
                            CommunityState(accountId = it.accountId, destination = Destination.Page(handle), history = it.history + it.destination,
                                working = true, notice = "Page created. Write your first post below.")
                        }
                        load()
                    }
                    is CreateIntent.Post -> { mutableState.update { it.copy(notice = "Draft saved. Only you can see it until you publish.", composerSession = it.composerSession + 1) }; reloadAfterCommand() }
                    is CreateIntent.Comment -> reloadAfterCommand()
                    is CreateIntent.Moderator -> { mutableState.update { it.copy(notice = MODERATOR_INVITED) }; reloadAfterCommand() }
                    is CreateIntent.Handover -> { mutableState.update { it.copy(notice = HANDOVER_OFFERED) }; reloadAfterCommand() }
                }
            } catch (error: IdentityFailure) {
                // A definite rejection releases the command; an unknown outcome keeps it for an exact retry.
                if (error.status in 400..499 && error.status != 408) mutableState.update { it.copy(pending = null) }
                // A retired topic or interest: the composer keeps the draft and marks the terms to remove.
                throw if (intent is CreateIntent.Post && error.status == 422 && error.code == "TERM_UNAVAILABLE") termFailure(error, "") else error
            }
        }
    }

    fun discardPending() = mutableState.update { if (it.working) it else it.copy(pending = null) }

    private fun reloadAfterCommand() = load()

    fun publish(post: PostDto) {
        if (mutableState.value.page?.takeIf { it.id == post.pageId }?.paused == true) return
        command("Published. Anyone can see this post now.", subject = post.id) { replacePost(repository.publish(it, post)); reloadAfterCommand() }
    }
    fun startEdit(post: PostDto) = mutableState.update { if (it.working || !post.canManage) it else it.copy(editingPostId = post.id, editingPost = post, error = null, notice = null) }
    fun cancelEdit() = mutableState.update { if (it.working) it else it.copy(editingPostId = null, editingPost = null) }

    /**
     * Saves against the post as it was when Edit was chosen, and keeps the person's text open until the server confirms the change.
     * [topics] and [interests] null leave them as they are; only a list that differs from the opened post's is sent.
     */
    fun editPost(post: PostDto, title: String, body: String, topics: List<String>? = null, interests: List<String>? = null): Boolean {
        val opened = mutableState.value.editingPost?.takeIf { it.id == post.id } ?: return false
        val text = body.trim()
        val heading = title.trim()
        if (text.isEmpty() || text.codePointCount(0, text.length) > 5000 || heading.codePointCount(0, heading.length) > 120) {
            mutableState.update { it.copy(error = "Write 1 to 5000 characters, with a title of up to 120.") }
            return false
        }
        if (topics != null && !postTerms(topics, POST_TOPICS_LIMIT) || interests != null && !postTerms(interests, POST_INTERESTS_LIMIT)) {
            mutableState.update { it.copy(error = INTERESTS_TOO_MANY) }
            return false
        }
        val newTitle = heading.ifEmpty { null }
        val newTopics = topics?.takeIf { it != opened.topics.orEmpty() }
        val newInterests = interests?.takeIf { it != opened.interests.orEmpty() }
        if (newTitle == opened.title && text == opened.body && newTopics == null && newInterests == null) { cancelEdit(); return true }
        mutableState.update { it.copy(unavailableTerms = emptyList()) }
        command("Changes saved.", subject = opened.id) { account ->
            val saved = try { repository.updatePost(account, opened, newTitle, text, newTopics, newInterests) } catch (error: IdentityFailure) {
                // As on the web: a newer version is refused instead of overwritten, and the person's text stays open.
                throw if (error.status == 412) IdentityFailure(error.code, "This post changed since you opened it. Reload to review the current version.", 412)
                else if (error.status == 422 && error.code == "TERM_UNAVAILABLE") termFailure(error, "") else error
            }
            mutableState.update { state ->
                state.copy(
                    posts = state.posts.map { if (it.id == saved.id) saved else it }, drafts = state.drafts.map { if (it.id == saved.id) saved else it },
                    pinned = state.pinned.map { if (it.id == saved.id) saved else it },
                    post = if (state.post?.id == saved.id) saved else state.post, editingPostId = null, editingPost = null,
                )
            }
        }
        return true
    }

    /** Opens the editor on the shown page as it is now. Save sends this version's tag, never one refreshed later (T39). */
    fun startPageEdit(page: PageDto) = mutableState.update {
        if (it.working || it.accountId == null || it.destination !is Destination.Page || it.editingPage != null || !page.canManage || page.etag == null || page.id != it.page?.id) it
        else it.copy(editingPage = page, pageEditFailed = false, pageEditSession = it.pageEditSession + 1, error = null, notice = null)
    }
    fun cancelPageEdit() {
        val current = mutableState.value
        if (current.working || current.editingPage == null) return
        mutableState.update { it.copy(editingPage = null, pageEditFailed = false, error = null) }
        if (current.pageEditFailed) reload()
    }

    /**
     * Sends only the fields that differ from the version the editor opened with, against that version, and keeps the editor open until the server confirms.
     * [rules] null leaves the rules as they are; an empty text removes them.
     */
    fun editPage(name: String, description: String, topic: String, rules: String? = null): Boolean {
        val current = mutableState.value
        val opened = current.editingPage ?: return false
        if (current.working || current.accountId == null || current.destination !is Destination.Page) return false
        val title = name.replace(Regex("[\\s\\p{Z}\\u0085\\u001C-\\u001F]+"), " ").trim()
        val text = description.replace("\r\n", "\n").trim()
        val ruleText = rules?.replace("\r\n", "\n")?.trim()
        if (title.isEmpty() || title.codePointLength() > 80 || text.codePointLength() > 500 || topic !in KnownTopics) {
            mutableState.update { it.copy(error = PAGE_EDIT_INVALID) }
            return false
        }
        if ((ruleText?.codePointLength() ?: 0) > PAGE_RULES_LIMIT) {
            mutableState.update { it.copy(error = PAGE_RULES_INVALID) }
            return false
        }
        val changes = buildMap {
            if (title != opened.name) put("name", title)
            if (text != opened.description) put("description", text)
            if (topic != opened.topic) put("topic", topic)
            if (ruleText != null && ruleText != opened.rules.orEmpty()) put("rules", ruleText)
        }
        if (changes.isEmpty()) { cancelPageEdit(); return true }
        val expected = generation
        val destination = current.destination
        command(PAGE_EDIT_SAVED, subject = opened.id) { account ->
            val saved = try { repository.updatePage(account, opened, changes) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                apply(expected, destination) { it.copy(pageEditFailed = true) }
                val failure = error as? IdentityFailure
                // As on the web: reloading alone cannot help, because this editor keeps the version it opened with.
                // A lost answer keeps the app's usual "Nothing new is confirmed" message; closing the editor then reloads the page.
                throw if (failure?.status == 412) IdentityFailure(failure.code, PAGE_EDIT_CONFLICT, failure.status) else error
            }
            apply(expected, destination) { state -> state.copy(page = if (state.page?.id == saved.id) saved else state.page,
                pages = if (state.pages.any { it.id == saved.id }) state.pages.map { if (it.id == saved.id) saved else it } else state.pages + saved,
                editingPage = null, pageEditFailed = false) }
            // The listed posts carry the page's name, so they reload too, as the web does after a save.
            if (generation == expected && mutableState.value.destination == destination) reloadAfterCommand()
        }
        return true
    }
    fun deletePost(post: PostDto) = command("Post deleted.", subject = post.id) { account ->
        repository.deletePost(account, post)
        if (mutableState.value.destination is Destination.Post) { mutableState.update { it.copy(working = false) }; back() } else reloadAfterCommand()
    }
    fun endComment(comment: CommentDto) = command(subject = comment.id) { repository.endComment(it, comment); reloadAfterCommand() }
    fun report(targetType: String, targetId: String, reason: String, details: String) = command("Report received. It is stored for review; the person reported is not told who sent it.", subject = targetId) {
        repository.report(it, targetType, targetId, reason, details.trim().takeCodePoints(REPORT_DETAILS_LIMIT))
    }
    fun blockPage(page: PageDto) = command("Page blocked. Its posts are hidden from you.", subject = page.id) { repository.block(it, "page", page.id); reloadAfterCommand() }
    fun blockAuthor(comment: CommentDto) = command("Person blocked. Their comments are hidden from you.", subject = comment.id) { repository.block(it, "comment_author", comment.id); reloadAfterCommand() }
    fun unblock(block: BlockDto) = command("Unblocked.", subject = block.id) { repository.unblock(it, block.id); reloadAfterCommand() }

    /** The owner invites another person, by account ID, to moderate the shown page. A lost answer keeps the invitation for an exact retry. */
    fun inviteModerator(accountId: String): Boolean {
        val current = mutableState.value
        val account = current.accountId ?: return false
        val page = current.page?.takeIf { it.canManage && it.writable } ?: return false
        val invitee = accountId.trim().lowercase()
        if (!invitee.matches(ACCOUNT_ID) || invitee == account.lowercase()) {
            mutableState.update { it.copy(error = MODERATOR_ID_INVALID, notice = null) }
            return false
        }
        return submit(CreateIntent.Moderator(account, UUID.randomUUID().toString(), page.id, invitee))
    }

    /** The owner withdraws a waiting invitation or removes a moderator of the shown page. */
    fun resolveModerator(moderator: ModeratorDto, action: String) {
        if (action !in setOf("withdraw", "remove") || mutableState.value.page?.let { it.canManage && it.id == moderator.pageId } != true) return
        command(subject = moderator.id) { repository.resolveModerator(it, moderator.pageId, moderator.id, moderator.etag, action); reloadAfterCommand() }
    }

    /** You accept or decline an invitation to moderate, or step down as a moderator. */
    fun resolveRole(role: ModeratorRoleDto, action: String) {
        if (action !in setOf("accept", "decline", "step-down")) return
        command(subject = role.id) { repository.resolveModerator(it, role.pageId, role.id, role.etag, action); reloadAfterCommand() }
    }

    /** The owner offers the shown page, as it is now, to one of its moderators. The offer needs a recent sign-in and lasts 15 minutes. */
    fun offerHandover(moderator: ModeratorDto): Boolean {
        val current = mutableState.value
        val account = current.accountId ?: return false
        val page = current.page?.takeIf { it.canManage && it.writable && it.id == moderator.pageId } ?: return false
        if (moderator.status != "active") return false
        return submit(CreateIntent.Handover(account, UUID.randomUUID().toString(), page.id, page.etag ?: return false, moderator.accountId, moderator.displayName))
    }

    /** The moderator accepts or declines an offered page; the owner cancels the offer. */
    fun respondHandover(offer: HandoverDto, action: String) {
        if (action !in setOf("accept", "decline", "cancel")) return
        command(if (action == "accept") HANDOVER_ACCEPTED else null, subject = offer.id) { repository.respondHandover(it, offer, action); reloadAfterCommand() }
    }

    /** Archives the shown page, so it stays readable but nothing new can be added. */
    fun archivePage() = changePage("archive", null, PAGE_ARCHIVED)
    /** Brings back an archived page, or a deleted one within its 7 days, as it was. */
    fun restorePage() = changePage("restore", null, PAGE_RESTORED)

    /** Deletes the shown page after its name is typed exactly. Returns false, keeping the dialog open, when the name differs. */
    fun deletePage(confirm: String): Boolean {
        val page = mutableState.value.page?.takeIf { it.canManage && !it.deleted } ?: return false
        val typed = confirm.replace(Regex("[\\s\\p{Z}\\u0085\\u001C-\\u001F]+"), " ").trim()
        if (typed != page.name) {
            mutableState.update { it.copy(error = PAGE_DELETE_NAME, notice = null) }
            return false
        }
        changePage("delete", typed, PAGE_DELETED)
        return true
    }

    private fun changePage(action: String, confirm: String?, notice: String) {
        val page = mutableState.value.page?.takeIf { it.canManage && it.etag != null } ?: return
        command(notice) { account -> replacePage(repository.changePageState(account, page, action, confirm)); reloadAfterCommand() }
    }

    /** Opens the topics-and-tags editor on the shown page as it is now. Save sends this version's tag, never one refreshed later. */
    fun startClassify(page: PageDto) = mutableState.update {
        if (it.working || it.destination !is Destination.Page || it.classifying != null || it.taxonomy == null || !page.canManage || !page.writable || page.etag == null || page.id != it.page?.id) it
        else it.copy(classifying = page, classificationDraft = page.classification?.parts ?: ClassificationPart.entries.associateWith { emptyList() },
            classifyFailed = false, unavailableTerms = emptyList(), error = null, notice = null)
    }

    /** Replaces one part of the draft; more terms than the part allows, or the main topic among other topics, are refused. */
    fun setClassification(part: ClassificationPart, codes: List<String>) = mutableState.update {
        val opened = it.classifying
        if (it.working || opened == null || codes.size > part.limit || codes.distinct().size != codes.size || !codes.all(::isCode) ||
            (part == ClassificationPart.OTHER_TOPICS && opened.topic in codes)) it
        else it.copy(classificationDraft = it.classificationDraft + (part to codes))
    }

    fun cancelClassify() {
        val current = mutableState.value
        if (current.working || current.classifying == null) return
        mutableState.update { it.copy(classifying = null, classificationDraft = emptyMap(), classifyFailed = false, unavailableTerms = emptyList(), error = null) }
        if (current.classifyFailed) reload()
    }

    /** Saves the draft against the page as the editor opened it, keeping the editor open until the server confirms. */
    fun saveClassification() {
        val current = mutableState.value
        val opened = current.classifying ?: return
        if (current.working || current.destination !is Destination.Page) return
        val draft = ClassificationPart.entries.associateWith { current.classificationDraft[it].orEmpty() }
        if (opened.classification?.parts == draft) { cancelClassify(); return }
        val expected = generation
        val destination = current.destination
        command(CLASSIFICATION_SAVED, subject = opened.id) { account ->
            val saved = try { classification.classify(account, opened, draft) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                apply(expected, destination) { it.copy(classifyFailed = true) }
                throw termFailure(error, CLASSIFICATION_CONFLICT)
            }
            apply(expected, destination) { state -> state.copy(page = if (state.page?.id == saved.id) saved else state.page,
                classifying = null, classificationDraft = emptyMap(), classifyFailed = false, unavailableTerms = emptyList()) }
        }
    }

    /** A 412 keeps the person's choices with [conflict]; a 422 about retired terms marks them to be removed. */
    private fun termFailure(error: Exception, conflict: String): Exception {
        val failure = error as? IdentityFailure ?: return error
        return when {
            failure.status == 412 -> IdentityFailure(failure.code, conflict, failure.status)
            failure.status == 422 && failure.code == "TERM_UNAVAILABLE" -> {
                val codes = failure.details["codes"].orEmpty().split(",").map(String::trim).filter(::isCode)
                mutableState.update { it.copy(unavailableTerms = codes) }
                IdentityFailure(failure.code, TERMS_UNAVAILABLE, failure.status, failure.details)
            }
            else -> failure
        }
    }

    /** Replaces one kind of your interests in the draft; more than its limit is refused. */
    fun setInterests(part: InterestPart, codes: List<String>) = mutableState.update {
        // A reload in progress would replace the draft, so nothing is edited until it answers.
        if (it.busy || it.interests == null || codes.size > part.limit || codes.distinct().size != codes.size || !codes.all(::isCode)) it
        else it.copy(interestsDraft = it.interestsDraft + (part to codes), notice = null)
    }

    /** Saves every choice at once against the version loaded. A newer version is refused, never overwritten; the choices stay until Reload. */
    fun saveInterests() {
        val current = mutableState.value
        val opened = current.interests ?: return
        if (current.working || current.destination != Destination.Interests || current.interestsConflict) return
        val draft = InterestPart.entries.associateWith { current.interestsDraft[it].orEmpty() }
        if (InterestPart.entries.any { draft.getValue(it).size > it.limit }) { mutableState.update { it.copy(error = INTERESTS_TOO_MANY) }; return }
        val expected = generation
        command(INTERESTS_SAVED) { account ->
            val saved = try { classification.setInterests(account, opened, draft) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if ((error as? IdentityFailure)?.status == 412 && generation == expected) mutableState.update { it.copy(interestsConflict = true) }
                throw termFailure(error, INTERESTS_CONFLICT)
            }
            apply(expected, Destination.Interests) { it.copy(interests = saved, interestsDraft = saved.parts, unavailableTerms = emptyList()) }
        }
    }

    /** Not interested on a post: it leaves Following, Latest and From your interests (DEC-037). */
    fun hidePost(post: PostDto) {
        if (post.canManage) return
        addControl(AddFeedControlDto.hidePost(post.id), null, postGone = { it.id == post.id })
    }

    /** Mutes a page: its posts leave those lists and it leaves the suggestions. You keep following it. */
    fun mutePage(pageId: String, name: String) =
        addControl(AddFeedControlDto.mutePage(pageId), name, postGone = { it.pageId == pageId }, pageGone = { it.id == pageId })

    /** Mutes a topic or an interest: the posts and suggested pages about it leave those lists. */
    fun muteTerm(dimension: String, code: String) {
        if (dimension != "topic" && dimension != "interest" || !isCode(code)) return
        val topic = dimension == "topic"
        addControl(AddFeedControlDto.muteTerm(dimension, code), null,
            postGone = { code in (if (topic) it.topics else it.interests).orEmpty() },
            pageGone = { page -> if (topic) page.topic == code || code in page.classification?.otherTopics.orEmpty() else code in page.classification?.interests.orEmpty() })
    }

    /** Not interested on a suggested page: it leaves the suggestions only. */
    fun hideSuggestion(page: PageDto) = addControl(AddFeedControlDto.hideSuggestion(page.id), page.name, pageGone = { it.id == page.id })

    /** Sends the control; only once the server confirms it do the items it covers leave the shown list, and Undo is offered. */
    private fun addControl(request: AddFeedControlDto, name: String?, postGone: (PostDto) -> Boolean = { false }, pageGone: (PageDto) -> Boolean = { false }) {
        val destination = mutableState.value.destination
        if (!feedControls.available || !(destination == Destination.Discover || destination is Destination.Feed && destination.tab != FeedTab.SAVED)) return
        val expected = generation
        command { account ->
            val control = feedControls.add(account, request)
            apply(expected, destination) { state ->
                state.copy(
                    // On Discover the post list holds search results, which mutes do not change.
                    posts = if (state.destination is Destination.Feed) state.posts.filterNot(postGone) else state.posts,
                    interestPosts = state.interestPosts.filterNot { postGone(it.post) },
                    suggestions = state.suggestions.filterNot { pageGone(it.page) },
                    undo = FeedUndo(control, name),
                )
            }
        }
    }

    /** Takes back the control just added and loads the list again, so what it hid comes back in its place. */
    fun undoControl() {
        val undo = mutableState.value.undo ?: return
        val expected = generation
        command(FEED_CONTROL_UNDONE, subject = undo.control.id) { account ->
            feedControls.remove(account, undo.control.id)
            if (generation != expected) return@command
            mutableState.update { it.copy(undo = null) }
            reloadAfterCommand()
        }
    }

    /** Undoes one row of "Muted and hidden", then loads the list again. */
    fun removeControl(control: FeedControlDto) {
        if (mutableState.value.destination != Destination.FeedControls) return
        val expected = generation
        command(FEED_CONTROL_UNDONE, subject = control.id) { account ->
            feedControls.remove(account, control.id)
            apply(expected, Destination.FeedControls) { state -> state.copy(controls = state.controls.filterNot { it.id == control.id }) }
            if (generation == expected && mutableState.value.destination == Destination.FeedControls) reloadAfterCommand()
        }
    }
}
