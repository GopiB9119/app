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
}

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
) {
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

private val ACCOUNT_ID = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

/** The server allows 1,000 characters of report details, counted as code points (Python `len`). */
const val REPORT_DETAILS_LIMIT = 1000

/** Keeps at most [limit] characters counted as code points, as the server counts them, so a cut never splits a surrogate pair. */
fun String.takeCodePoints(limit: Int): String =
    if (codePointCount(0, length) <= limit) this else substring(0, offsetByCodePoints(0, limit))

/** Counts characters as code points, as the server does, so an emoji counts once. */
fun String.codePointLength(): Int = codePointCount(0, length)

@HiltViewModel
class CommunityViewModel @Inject constructor(private val repository: CommunityRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CommunityState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var loadJob: Job? = null
    private var loadingMore = false
    private var loads = 0L

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        loadJob?.cancel()
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
    }

    fun open(destination: Destination, remember: Boolean = true) {
        val current = mutableState.value
        if (current.accountId == null || current.working) return
        mutableState.update {
            CommunityState(
                accountId = it.accountId, destination = destination, history = if (remember) it.history + it.destination else it.history,
                query = if (destination == Destination.Discover) it.query else "", topic = if (destination == Destination.Discover) it.topic else null,
                searchPosts = destination == Destination.Discover && it.searchPosts, pending = it.pending,
                pages = if (destination is Destination.Page) it.pages.filter(PageDto::canManage) else emptyList(),
            )
        }
        reload()
    }

    /** Returns false when there is nothing left to go back to inside the community area. */
    fun back(): Boolean {
        val current = mutableState.value
        if (current.working) return true
        val previous = current.history.lastOrNull() ?: return false
        mutableState.update { CommunityState(accountId = it.accountId, destination = previous, history = it.history.dropLast(1), query = it.query, topic = it.topic, searchPosts = it.searchPosts) }
        reload()
        return true
    }

    fun search(query: String, topic: String?) {
        mutableState.update { it.copy(query = query.take(80), topic = topic?.takeIf { value -> value in TOPICS }) }
        if (mutableState.value.destination == Destination.Discover) reload() else open(Destination.Discover)
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
                        val result = repository.discover(account, current.query, current.topic, cursor)
                        apply(expected, destination) { it.copy(pages = if (more) (it.pages + result.items).distinctBy(PageDto::id) else result.items, nextCursor = result.nextCursor) }
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
                            it.copy(page = page, drafts = drafts, pinned = pinned, blocks = blocks, nextCursor = posts.nextCursor,
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

    /** [subject] is the id the command acts on; without one, a 404 is taken to be about the shown page or post. */
    private fun command(onSuccess: String? = null, subject: String? = null, work: suspend (String) -> Unit) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.working) return
        val expected = generation
        // A load still unanswered could answer after this change with what the server had before it,
        // so it stops now and is sent again once the change is answered, unless the change loads again itself (T82).
        val interrupted = loadJob?.takeIf { it.isActive }
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
            post = if (state.post?.id == post.id) post else state.post)
    }

    private fun replacePage(page: PageDto) = mutableState.update { state ->
        state.copy(pages = state.pages.map { if (it.id == page.id) page else it }, page = if (state.page?.id == page.id) page else state.page)
    }

    fun follow(page: PageDto) = command { replacePage(repository.follow(it, page.id, !page.following)) }
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
        if (!clean.matches(HANDLE_PATTERN) || topic !in TOPICS || name.trim().isEmpty() || name.trim().codePointCount(0, name.trim().length) > 80 || description.trim().codePointCount(0, description.trim().length) > 500) {
            mutableState.update { it.copy(error = "Check the handle (3 to 30 lowercase letters, digits or single hyphens), name and description.") }
            return false
        }
        return submit(CreateIntent.Page(account, UUID.randomUUID().toString(), CreatePageDto(clean, name.trim().replace(Regex("\\s+"), " "), description.trim(), topic)))
    }

    fun createPost(title: String, body: String): Boolean {
        val current = mutableState.value
        val account = current.accountId ?: return false
        val page = current.page?.takeIf { it.canManage } ?: return false
        val text = body.trim()
        if (text.isEmpty() || text.codePointCount(0, text.length) > 5000 || title.trim().codePointCount(0, title.trim().length) > 120) {
            mutableState.update { it.copy(error = "Write 1 to 5000 characters, with a title of up to 120.") }
            return false
        }
        return submit(CreateIntent.Post(account, UUID.randomUUID().toString(), page.id, CreatePostDto(title.trim().ifEmpty { null }, text)))
    }

    fun comment(body: String, parent: CommentDto? = null): Boolean {
        val current = mutableState.value
        val account = current.accountId ?: return false
        val post = current.post?.takeIf { it.status == "published" } ?: return false
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
                    is CreateIntent.Post -> { mutableState.update { it.copy(notice = "Draft saved. Only you can see it until you publish.") }; reloadAfterCommand() }
                    is CreateIntent.Comment -> reloadAfterCommand()
                    is CreateIntent.Moderator -> { mutableState.update { it.copy(notice = MODERATOR_INVITED) }; reloadAfterCommand() }
                    is CreateIntent.Handover -> { mutableState.update { it.copy(notice = HANDOVER_OFFERED) }; reloadAfterCommand() }
                }
            } catch (error: IdentityFailure) {
                // A definite rejection releases the command; an unknown outcome keeps it for an exact retry.
                if (error.status in 400..499 && error.status != 408) mutableState.update { it.copy(pending = null) }
                throw error
            }
        }
    }

    fun discardPending() = mutableState.update { if (it.working) it else it.copy(pending = null) }

    private fun reloadAfterCommand() = load()

    fun publish(post: PostDto) = command("Published. Anyone can see this post now.", subject = post.id) { replacePost(repository.publish(it, post)); reloadAfterCommand() }
    fun startEdit(post: PostDto) = mutableState.update { if (it.working || !post.canManage) it else it.copy(editingPostId = post.id, editingPost = post, error = null, notice = null) }
    fun cancelEdit() = mutableState.update { if (it.working) it else it.copy(editingPostId = null, editingPost = null) }

    /** Saves against the post as it was when Edit was chosen, and keeps the person's text open until the server confirms the change. */
    fun editPost(post: PostDto, title: String, body: String): Boolean {
        val opened = mutableState.value.editingPost?.takeIf { it.id == post.id } ?: return false
        val text = body.trim()
        val heading = title.trim()
        if (text.isEmpty() || text.codePointCount(0, text.length) > 5000 || heading.codePointCount(0, heading.length) > 120) {
            mutableState.update { it.copy(error = "Write 1 to 5000 characters, with a title of up to 120.") }
            return false
        }
        val newTitle = heading.ifEmpty { null }
        if (newTitle == opened.title && text == opened.body) { cancelEdit(); return true }
        command("Changes saved.", subject = opened.id) { account ->
            val saved = try { repository.updatePost(account, opened, newTitle, text) } catch (error: IdentityFailure) {
                // As on the web: a newer version is refused instead of overwritten, and the person's text stays open.
                throw if (error.status == 412) IdentityFailure(error.code, "This post changed since you opened it. Reload to review the current version.", 412) else error
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
        if (title.isEmpty() || title.codePointLength() > 80 || text.codePointLength() > 500 || topic !in TOPICS) {
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
}
