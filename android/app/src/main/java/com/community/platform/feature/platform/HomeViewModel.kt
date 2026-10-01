package com.community.platform.feature.platform

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.community.CommunityRepository
import com.community.platform.feature.community.PostDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.planning.CalendarEntryDto
import com.community.platform.feature.planning.CalendarRepository
import com.community.platform.feature.scheduling.InboxNotificationDto
import com.community.platform.feature.scheduling.ReminderPage
import com.community.platform.feature.scheduling.ReminderRepository
import com.community.platform.feature.scheduling.ReminderRequestDirection
import com.community.platform.feature.scheduling.ReminderRequestDto
import com.community.platform.feature.spaces.GroupRepository
import com.community.platform.feature.spaces.JoinReviewDto
import com.community.platform.feature.spaces.SpaceDto
import com.community.platform.feature.spaces.SpaceInvitationDto
import com.community.platform.feature.spaces.SpaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZoneOffset
import javax.inject.Inject
import javax.inject.Singleton

/** Everything Home reads, each from the same service the screen behind its "View all" uses. */
interface HomeSources {
    suspend fun spaces(accountId: String): List<SpaceDto>
    suspend fun invitations(accountId: String): List<SpaceInvitationDto>
    suspend fun joinRequests(accountId: String, spaceId: String): List<JoinReviewDto>
    suspend fun reminderRequests(accountId: String): List<ReminderRequestDto>
    suspend fun inbox(accountId: String): ReminderPage<InboxNotificationDto>
    suspend fun today(accountId: String, spaceId: String, date: LocalDate, timezone: String): List<CalendarEntryDto>
    suspend fun followedPosts(accountId: String): List<PostDto>
}

@Singleton
class HomeRepository @Inject constructor(
    private val spaces: SpaceRepository,
    private val groups: GroupRepository,
    private val reminders: ReminderRepository,
    private val calendar: CalendarRepository,
    private val community: CommunityRepository,
) : HomeSources {
    override suspend fun spaces(accountId: String): List<SpaceDto> {
        val found = mutableListOf<SpaceDto>()
        var cursor: String? = null
        // A person can be in at most 50 Spaces, which is three pages of 20.
        repeat(SPACE_PAGES) {
            val page = spaces.spaces(accountId, cursor)
            found += page.items
            cursor = page.nextCursor ?: return found
        }
        return found
    }

    override suspend fun invitations(accountId: String) = spaces.inbox(accountId).items
    override suspend fun joinRequests(accountId: String, spaceId: String) = groups.pending(accountId, spaceId)
    override suspend fun reminderRequests(accountId: String) = reminders.requests(accountId, ReminderRequestDirection.RECEIVED).items
    override suspend fun inbox(accountId: String) = reminders.inbox(accountId)
    override suspend fun followedPosts(accountId: String) = community.feed(accountId, null).items

    /** Today's entries of one Space's calendar, read page by page until the calendar passes today. */
    override suspend fun today(accountId: String, spaceId: String, date: LocalDate, timezone: String): List<CalendarEntryDto> {
        val found = mutableListOf<CalendarEntryDto>()
        var cursor: String? = null
        repeat(CALENDAR_PAGES) {
            val page = calendar.entries(accountId, spaceId, YearMonth.from(date), timezone, cursor)
            found += page.items.filter { it.date == date.toString() }
            if (page.items.any { LocalDate.parse(it.date) > date }) return found
            cursor = page.nextCursor ?: return found
        }
        throw IdentityFailure("CALENDAR_TOO_LONG", "Today's plans could not all be loaded.")
    }

    private companion object {
        const val SPACE_PAGES = 5
        const val CALENDAR_PAGES = 20
    }
}

/** One section's read: loading, failed, or loaded with a value. Each section loads and fails on its own (DEC-014). */
data class Loadable<T>(val loading: Boolean = true, val failed: Boolean = false, val value: T? = null)

private fun <T> loaded(value: T) = Loadable(loading = false, failed = false, value = value)
private fun <T> failed() = Loadable<T>(loading = false, failed = true)

/** Mirrors the Spaces screen, where a group's owner and its admins open its join requests. */
fun answersJoinRequests(space: SpaceDto): Boolean = space.role in setOf("owner", "admin") && space.spaceType == "group"

/** Planned and still to happen today: open tasks, scheduled events and reminders that can still be sent. */
fun activeToday(entry: CalendarEntryDto): Boolean = when (entry.kind) {
    "task" -> entry.status in setOf("open", "in_progress")
    "event" -> entry.status == "scheduled"
    else -> entry.kind == "planned" || entry.status in setOf("scheduled", "available")
}

data class HomeState(
    val accountId: String? = null,
    val timezone: String = "UTC",
    val today: LocalDate? = null,
    val spaces: Loadable<List<SpaceDto>> = Loadable(),
    val invitations: Loadable<List<SpaceInvitationDto>> = Loadable(),
    /** Pending join requests, by the id of each group whose requests this person answers. */
    val joins: Map<String, Loadable<List<JoinReviewDto>>> = emptyMap(),
    val requests: Loadable<List<ReminderRequestDto>> = Loadable(),
    val inbox: Loadable<List<InboxNotificationDto>> = Loadable(),
    val unreadCount: Int? = null,
    /** Today's calendar entries, by Space id. */
    val days: Map<String, Loadable<List<CalendarEntryDto>>> = emptyMap(),
    val posts: Loadable<List<PostDto>> = Loadable(),
    val requiresSignIn: Boolean = false,
) {
    val reviewedGroups: List<SpaceDto> get() = spaces.value.orEmpty().filter(::answersJoinRequests)
    val joinsLoading: Boolean get() = spaces.loading || joins.values.any { it.loading }
    val joinsFailed: Boolean get() = spaces.failed || joins.values.any { it.failed }
    val todayEntries: List<CalendarEntryDto>
        get() = days.values.flatMap { it.value.orEmpty() }.filter(::activeToday).sortedWith(CalendarRepository.calendarOrder)
    val todayLoading: Boolean get() = spaces.loading || days.values.any { it.loading }
    val todayFailed: List<SpaceDto> get() = spaces.value.orEmpty().filter { days[it.id]?.failed == true }
}

@HiltViewModel
class HomeViewModel internal constructor(private val sources: HomeSources, private val clock: Clock) : ViewModel() {
    @Inject constructor(repository: HomeRepository) : this(repository, Clock.systemUTC())

    private val mutableState = MutableStateFlow(HomeState())
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var work: Job = SupervisorJob(viewModelScope.coroutineContext[Job])
    private val sections = mutableMapOf<String, Job>()
    private var loadedAt: Instant? = null

    fun bind(accountId: String?, timezone: String) {
        val current = mutableState.value
        if (current.accountId == accountId && current.timezone == timezone) return
        generation += 1
        work.cancel()
        work = SupervisorJob(viewModelScope.coroutineContext[Job])
        sections.clear()
        mutableState.value = HomeState(accountId = accountId, timezone = timezone)
        loadedAt = null
        if (accountId != null) refresh()
    }

    /** Reloads every section, for example after the person pulls Home up again. */
    fun refresh() {
        if (mutableState.value.accountId == null) return
        loadedAt = clock.instant()
        mutableState.update { it.copy(today = clock.instant().atZone(zone(it.timezone)).toLocalDate()) }
        loadSpaces(); loadInvitations(); loadRequests(); loadInbox(); loadPosts()
    }

    /** Coming back to the app reloads Home, but not again straight after it has just loaded. */
    fun resume() {
        val last = loadedAt
        if (last == null || Duration.between(last, clock.instant()) >= RESUME_AFTER) refresh()
    }

    fun retrySpaces() = loadSpaces()
    fun retryInvitations() = loadInvitations()
    fun retryRequests() = loadRequests()
    fun retryInbox() = loadInbox()
    fun retryPosts() = loadPosts()
    fun retryDay(spaceId: String) { if (mutableState.value.days[spaceId]?.failed == true) loadDay(spaceId) }
    fun retryJoins() {
        val current = mutableState.value
        if (current.spaces.failed) loadSpaces() else current.joins.filterValues { it.failed }.keys.forEach(::loadJoins)
    }

    private fun zone(timezone: String): ZoneId = try { ZoneId.of(timezone) } catch (_error: RuntimeException) { ZoneOffset.UTC }

    private fun update(expected: Long, transform: (HomeState) -> HomeState) {
        if (generation == expected) mutableState.update(transform)
    }

    /** Starts one section's read, replacing an older read of the same section so a slow old answer cannot win. */
    private fun launch(key: String, block: suspend (accountId: String, expected: Long) -> Unit) {
        val current = mutableState.value
        val accountId = current.accountId ?: return
        if (current.requiresSignIn) return
        val expected = generation
        sections.remove(key)?.cancel()
        sections[key] = viewModelScope.launch(work) { block(accountId, expected) }
    }

    /** Runs one read; a lost sign-in ends the whole overview, any other failure only this section. */
    private suspend fun <T : Any> read(expected: Long, block: suspend () -> T): T? = try {
        block()
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") signedOut(expected)
        null
    }

    private fun signedOut(expected: Long) {
        if (generation != expected) return
        generation += 1
        work.cancel()
        sections.clear()
        mutableState.update { HomeState(accountId = it.accountId, timezone = it.timezone, requiresSignIn = true) }
    }

    private fun loadSpaces() = launch("spaces") { accountId, expected ->
        sections.keys.filter { it.startsWith("join:") || it.startsWith("day:") }.forEach { sections.remove(it)?.cancel() }
        update(expected) { it.copy(spaces = Loadable(), joins = emptyMap(), days = emptyMap()) }
        val spaces = read(expected) { sources.spaces(accountId) }
        if (spaces == null) { update(expected) { it.copy(spaces = failed()) }; return@launch }
        update(expected) { it.copy(spaces = loaded(spaces)) }
        spaces.filter(::answersJoinRequests).forEach { loadJoins(it.id) }
        spaces.forEach { loadDay(it.id) }
    }

    private fun loadJoins(spaceId: String) = launch("join:$spaceId") { accountId, expected ->
        update(expected) { it.copy(joins = it.joins + (spaceId to Loadable())) }
        val joins = read(expected) { sources.joinRequests(accountId, spaceId) }
        update(expected) { it.copy(joins = it.joins + (spaceId to (joins?.let(::loaded) ?: failed()))) }
    }

    private fun loadDay(spaceId: String) = launch("day:$spaceId") { accountId, expected ->
        val current = mutableState.value
        val today = current.today ?: return@launch
        update(expected) { it.copy(days = it.days + (spaceId to Loadable())) }
        val entries = read(expected) { sources.today(accountId, spaceId, today, current.timezone) }
        update(expected) { it.copy(days = it.days + (spaceId to (entries?.let(::loaded) ?: failed()))) }
    }

    private fun loadInvitations() = launch("invitations") { accountId, expected ->
        update(expected) { it.copy(invitations = Loadable()) }
        val now = clock.instant()
        val invitations = read(expected) { sources.invitations(accountId) }
        update(expected) {
            it.copy(invitations = invitations?.let { list -> loaded(list.filter { item -> item.status == "pending" && Instant.parse(item.expiresAt) > now }) } ?: failed())
        }
    }

    private fun loadRequests() = launch("requests") { accountId, expected ->
        update(expected) { it.copy(requests = Loadable()) }
        val requests = read(expected) { sources.reminderRequests(accountId) }
        update(expected) { it.copy(requests = requests?.let { list -> loaded(list.filter { item -> item.status == "pending" }) } ?: failed()) }
    }

    private fun loadInbox() = launch("inbox") { accountId, expected ->
        update(expected) { it.copy(inbox = Loadable()) }
        val page = read(expected) { sources.inbox(accountId) }
        update(expected) {
            if (page == null) it.copy(inbox = failed(), unreadCount = null)
            else it.copy(inbox = loaded(page.items.filter { item -> item.acknowledgedAt == null }), unreadCount = page.unreadCount)
        }
    }

    private fun loadPosts() = launch("posts") { accountId, expected ->
        update(expected) { it.copy(posts = Loadable()) }
        val posts = read(expected) { sources.followedPosts(accountId) }
        update(expected) { it.copy(posts = posts?.let(::loaded) ?: failed()) }
    }

    private companion object {
        val RESUME_AFTER: Duration = Duration.ofSeconds(5)
    }
}
