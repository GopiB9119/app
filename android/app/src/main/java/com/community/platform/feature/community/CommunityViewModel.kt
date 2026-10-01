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
    val post: PostDto? = null,
    val editingPostId: String? = null,
    val comments: List<CommentDto> = emptyList(),
    val blocks: List<BlockDto> = emptyList(),
    val pending: CreateIntent? = null,
    val requiresSignIn: Boolean = false,
) {
    val busy: Boolean get() = loading || working
}

@HiltViewModel
class CommunityViewModel @Inject constructor(private val repository: CommunityRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CommunityState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var loadJob: Job? = null

    fun bind(accountId: String?) {
        if (mutableState.value.accountId == accountId) return
        generation += 1
        loadJob?.cancel()
        mutableState.value = CommunityState(accountId = accountId)
        if (accountId != null) reload()
    }

    private fun fail(error: Exception, expected: Long) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            loadJob?.cancel()
            mutableState.value = CommunityState(accountId = mutableState.value.accountId, requiresSignIn = true)
            return
        }
        val message = if (error is IOException) "No connection. Nothing new is confirmed." else error.message ?: "Something went wrong."
        mutableState.update { it.copy(error = message, missing = failure?.status == 404 && (it.destination is Destination.Page || it.destination is Destination.Post)) }
    }

    fun open(destination: Destination, remember: Boolean = true) {
        val current = mutableState.value
        if (current.accountId == null || current.working) return
        mutableState.update {
            CommunityState(
                accountId = it.accountId, destination = destination, history = if (remember) it.history + it.destination else it.history,
                query = if (destination == Destination.Discover) it.query else "", topic = if (destination == Destination.Discover) it.topic else null,
                searchPosts = destination == Destination.Discover && it.searchPosts, pending = it.pending,
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

    fun reload(more: Boolean = false) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val cursor = if (more) current.nextCursor ?: return else null
        val destination = current.destination
        val expected = generation
        loadJob?.cancel()
        mutableState.update { it.copy(loading = true, error = null, missing = false) }
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
                        val posts = if (page.blocked) CommunityPage(emptyList(), null) else repository.pagePosts(account, page.id, cursor)
                        val drafts = if (page.canManage && !more) repository.drafts(account, page.id) else current.drafts
                        val blocks = if (page.blocked) repository.blocks(account) else emptyList()
                        apply(expected, destination) {
                            it.copy(page = page, drafts = drafts, blocks = blocks, nextCursor = posts.nextCursor,
                                posts = if (more) (it.posts + posts.items).distinctBy(PostDto::id) else posts.items)
                        }
                    }
                    is Destination.Post -> {
                        val post = if (more) current.post ?: return@launch else repository.post(account, destination.postId)
                        val comments = if (post.status == "published") repository.comments(account, post.id, cursor) else CommunityPage(emptyList(), null)
                        apply(expected, destination) {
                            it.copy(post = post, nextCursor = comments.nextCursor, comments = if (more) (it.comments + comments.items).distinctBy(CommentDto::id) else comments.items)
                        }
                    }
                    Destination.MyPages -> { val pages = repository.myPages(account); apply(expected, destination) { it.copy(pages = pages) } }
                    Destination.Blocked -> { val blocks = repository.blocks(account); apply(expected, destination) { it.copy(blocks = blocks) } }
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { if (mutableState.value.destination == destination) fail(error, expected) }
            finally { if (generation == expected && mutableState.value.destination == destination) mutableState.update { it.copy(loading = false) } }
        }
    }

    private fun apply(expected: Long, destination: Destination, transform: (CommunityState) -> CommunityState) {
        if (generation == expected && mutableState.value.destination == destination) mutableState.update(transform)
    }

    private fun command(onSuccess: String? = null, work: suspend (String) -> Unit) {
        val current = mutableState.value
        val account = current.accountId ?: return
        if (current.working) return
        val expected = generation
        mutableState.update { it.copy(working = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                work(account)
                if (generation == expected && onSuccess != null) mutableState.update { it.copy(notice = onSuccess) }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected) }
            finally { if (generation == expected) mutableState.update { it.copy(working = false) } }
        }
    }

    private fun replacePost(post: PostDto) = mutableState.update { state ->
        state.copy(posts = state.posts.map { if (it.id == post.id) post else it }, post = if (state.post?.id == post.id) post else state.post)
    }

    private fun replacePage(page: PageDto) = mutableState.update { state ->
        state.copy(pages = state.pages.map { if (it.id == page.id) page else it }, page = if (state.page?.id == page.id) page else state.page)
    }

    fun follow(page: PageDto) = command { replacePage(repository.follow(it, page.id, !page.following)) }
    fun like(post: PostDto) = command { replacePost(repository.react(it, post.id, if (post.liked) "unlike" else "like")) }
    fun save(post: PostDto) = command { replacePost(repository.react(it, post.id, if (post.saved) "unsave" else "save")) }

    fun createPage(handle: String, name: String, topic: String, description: String): Boolean {
        val account = mutableState.value.accountId ?: return false
        val clean = handle.trim().lowercase()
        if (!clean.matches(HANDLE_PATTERN) || topic !in TOPICS || name.trim().isEmpty() || name.trim().codePointCount(0, name.trim().length) > 80 || description.trim().length > 500) {
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
        command {
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
                        reload()
                    }
                    is CreateIntent.Post -> { mutableState.update { it.copy(notice = "Draft saved. Only you can see it until you publish.") }; reloadAfterCommand() }
                    is CreateIntent.Comment -> reloadAfterCommand()
                }
            } catch (error: IdentityFailure) {
                // A definite rejection releases the command; an unknown outcome keeps it for an exact retry.
                if (error.status in 400..499 && error.status != 408) mutableState.update { it.copy(pending = null) }
                throw error
            }
        }
    }

    fun discardPending() = mutableState.update { if (it.working) it else it.copy(pending = null) }

    private fun reloadAfterCommand() = reload()

    fun publish(post: PostDto) = command("Published. Anyone can see this post now.") { replacePost(repository.publish(it, post)); reloadAfterCommand() }
    fun startEdit(post: PostDto) = mutableState.update { if (it.working || !post.canManage) it else it.copy(editingPostId = post.id, error = null, notice = null) }
    fun cancelEdit() = mutableState.update { if (it.working) it else it.copy(editingPostId = null) }

    /** The editor keeps the person's text open until the server confirms the change. */
    fun editPost(post: PostDto, title: String, body: String): Boolean {
        val text = body.trim()
        val heading = title.trim()
        if (text.isEmpty() || text.codePointCount(0, text.length) > 5000 || heading.codePointCount(0, heading.length) > 120) {
            mutableState.update { it.copy(error = "Write 1 to 5000 characters, with a title of up to 120.") }
            return false
        }
        val newTitle = heading.ifEmpty { null }
        if (newTitle == post.title && text == post.body) { cancelEdit(); return true }
        command("Changes saved.") { account ->
            val saved = repository.updatePost(account, post, newTitle, text)
            mutableState.update { state ->
                state.copy(
                    posts = state.posts.map { if (it.id == saved.id) saved else it }, drafts = state.drafts.map { if (it.id == saved.id) saved else it },
                    post = if (state.post?.id == saved.id) saved else state.post, editingPostId = null,
                )
            }
        }
        return true
    }
    fun deletePost(post: PostDto) = command("Post deleted.") { account ->
        repository.deletePost(account, post)
        if (mutableState.value.destination is Destination.Post) { mutableState.update { it.copy(working = false) }; back() } else reloadAfterCommand()
    }
    fun endComment(comment: CommentDto) = command { repository.endComment(it, comment); reloadAfterCommand() }
    fun report(targetType: String, targetId: String, reason: String, details: String) = command("Report received. It is stored for review; the person reported is not told who sent it.") {
        repository.report(it, targetType, targetId, reason, details.trim().take(1000))
    }
    fun blockPage(page: PageDto) = command("Page blocked. Its posts are hidden from you.") { repository.block(it, "page", page.id); reloadAfterCommand() }
    fun blockAuthor(comment: CommentDto) = command("Person blocked. Their comments are hidden from you.") { repository.block(it, "comment_author", comment.id); reloadAfterCommand() }
    fun unblock(block: BlockDto) = command("Unblocked.") { repository.unblock(it, block.id); reloadAfterCommand() }
}
