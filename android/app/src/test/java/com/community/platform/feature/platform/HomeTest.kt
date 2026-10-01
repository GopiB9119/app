package com.community.platform.feature.platform

import com.community.platform.feature.community.CommunityState
import com.community.platform.feature.community.Destination
import com.community.platform.feature.community.PostDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.messaging.ChatState
import com.community.platform.feature.messaging.ConversationDto
import com.community.platform.feature.messaging.MessagingState
import com.community.platform.feature.planning.CalendarEntryDto
import com.community.platform.feature.scheduling.InboxNotificationDto
import com.community.platform.feature.scheduling.ReminderPage
import com.community.platform.feature.scheduling.ReminderRecipientDto
import com.community.platform.feature.scheduling.ReminderRequestDto
import com.community.platform.feature.spaces.JoinReviewDto
import com.community.platform.feature.spaces.SpaceDto
import com.community.platform.feature.spaces.SpaceInvitationDto
import com.community.platform.feature.spaces.SpaceWorkspaceState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
class HomeTest {
    private val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
    private val otherAccount = "0f97b948-9800-432f-9d15-407df739d08e"
    private val family = SpaceDto("c2937183-70fb-4d7a-b0b6-b1bc9c499444", "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z")
    private val ownedGroup = SpaceDto("5b1d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4", "Walking group", "group", "public", "active", "owner", "1", "2026-09-19T10:00:00Z")
    private val joinedGroup = SpaceDto("6c2e3d2f-4a5b-4c6d-9e7f-8091a2b3c4d5", "Book club", "group", "public", "active", "member", "1", "2026-09-19T10:00:00Z")
    private val clock = Clock.fixed(Instant.parse("2026-10-01T06:00:00Z"), ZoneOffset.UTC)
    private val today = "2026-10-01"

    private fun invitation(id: String, status: String, expires: String) =
        SpaceInvitationDto(id, family.id, "Lee family", "Sam Lee", accountId, "member", status, "2026-09-30T10:00:00Z", expires)
    private fun request(id: String, status: String) = ReminderRequestDto(
        id, "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03", family.id, "Water the plants", "1", ReminderRecipientDto(otherAccount, "Sam"),
        ReminderRecipientDto(accountId, "Alex"), "18:00", "UTC", "2026-10-01T18:00:00Z", "2026-10-02T18:00:00Z", "2026-10-04T06:00:00Z",
        "2026-10-01T05:00:00Z", null, status, false, null, "1", "in_app",
    )
    private fun notice(id: String, acknowledged: String?) = InboxNotificationDto(
        id, "8b2eac20-1b89-4e77-8c4b-3b3b9f8b3c04", "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03", family.id, "Take the bins out",
        "2026-10-01T05:30:00Z", "2026-10-01T05:30:00Z", null, acknowledged,
    )
    private fun entry(id: String, kind: String, status: String, space: SpaceDto = family, at: String? = "2026-10-01T09:00:00Z") = CalendarEntryDto(
        id, kind, if (kind == "event") null else id, space.id, "$kind $status", today, if (kind == "task") null else at, if (kind == "task") null else "UTC", status, false,
        if (kind == "planned") "9b2eac20-1b89-4e77-8c4b-3b3b9f8b3c05" else null,
    )
    private val post = PostDto("a1b2c3d4-0000-4000-8000-000000000001", "a1b2c3d4-0000-4000-8000-000000000002", "river-walkers", "River walkers",
        "Sunday walk", "Meet at the bridge.", "published", 0, 0, "2026-10-01T04:00:00Z", "2026-10-01T04:00:00Z", null, false, false, false, null)

    inner class FakeSources : HomeSources {
        var spaces = listOf(family, ownedGroup, joinedGroup)
        var invitations = listOf(invitation("11111111-1111-4111-8111-111111111111", "pending", "2026-10-03T00:00:00Z"))
        var joins = listOf(JoinReviewDto("22222222-2222-4222-8222-222222222222", otherAccount, "Robin", "", "2026-10-01T05:00:00Z", "2026-10-08T05:00:00Z"))
        var requests = listOf(request("33333333-3333-4333-8333-333333333333", "pending"))
        var inbox = ReminderPage(listOf(notice("44444444-4444-4444-8444-444444444444", null)), null, 2)
        var days = mapOf(family.id to listOf(entry("55555555-5555-4555-8555-555555555555", "task", "open")))
        var posts = listOf(post)
        val failures = mutableMapOf<String, Exception>()
        val calls = mutableListOf<String>()
        var postsGate: CompletableDeferred<Unit>? = null
        private fun call(name: String) { calls += name; failures[name]?.let { throw it } }
        override suspend fun spaces(accountId: String): List<SpaceDto> { call("spaces"); return spaces }
        override suspend fun invitations(accountId: String): List<SpaceInvitationDto> { call("invitations"); return invitations }
        override suspend fun joinRequests(accountId: String, spaceId: String): List<JoinReviewDto> { call("joins:$spaceId"); return joins }
        override suspend fun reminderRequests(accountId: String): List<ReminderRequestDto> { call("requests"); return requests }
        override suspend fun inbox(accountId: String): ReminderPage<InboxNotificationDto> { call("inbox"); return inbox }
        override suspend fun today(accountId: String, spaceId: String, date: LocalDate, timezone: String): List<CalendarEntryDto> {
            call("day:$spaceId:$date:$timezone"); failures["day:$spaceId"]?.let { throw it }; return days[spaceId].orEmpty()
        }
        override suspend fun followedPosts(accountId: String): List<PostDto> { call("posts"); postsGate?.await(); return posts }
    }

    private val sources = FakeSources()
    private var model: HomeViewModel? = null
    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null, "UTC"); Dispatchers.resetMain() }
    private fun ready(timezone: String = "UTC", at: Clock = clock): HomeViewModel {
        val current = HomeViewModel(sources, at); model = current
        current.bind(accountId, timezone)
        return current
    }

    @Test fun eachSectionLoadsAndFailsOnItsOwnAndRetryReadsOnlyThatSection() {
        sources.failures["invitations"] = IOException("offline")
        val home = ready()
        val state = home.state.value
        assertTrue(state.invitations.failed)
        assertFalse(state.invitations.loading)
        assertEquals(1, state.requests.value!!.size)
        assertEquals(1, state.inbox.value!!.size)
        assertEquals(2, state.unreadCount)
        assertEquals(listOf(post), state.posts.value)
        assertEquals(3, state.spaces.value!!.size)
        assertEquals(1, state.todayEntries.size)
        sources.failures.clear()
        sources.calls.clear()
        home.retryInvitations()
        assertEquals(listOf("invitations"), sources.calls)
        assertEquals(1, home.state.value.invitations.value!!.size)
        assertFalse(home.state.value.invitations.failed)
    }

    @Test fun needsAttentionKeepsOnlyWhatStillWaitsForThePerson() {
        sources.invitations = listOf(
            invitation("11111111-1111-4111-8111-111111111111", "pending", "2026-10-03T00:00:00Z"),
            invitation("11111111-1111-4111-8111-111111111112", "pending", "2026-10-01T05:59:59Z"),
            invitation("11111111-1111-4111-8111-111111111113", "accepted", "2026-10-03T00:00:00Z"),
        )
        sources.requests = listOf(request("33333333-3333-4333-8333-333333333333", "pending"), request("33333333-3333-4333-8333-333333333334", "accepted"))
        sources.inbox = ReminderPage(listOf(notice("44444444-4444-4444-8444-444444444444", null), notice("44444444-4444-4444-8444-444444444445", "2026-10-01T05:40:00Z")), null, 0)
        val state = ready().state.value
        assertEquals(listOf("11111111-1111-4111-8111-111111111111"), state.invitations.value!!.map { it.id })
        assertEquals(listOf("33333333-3333-4333-8333-333333333333"), state.requests.value!!.map { it.id })
        assertEquals(listOf("44444444-4444-4444-8444-444444444444"), state.inbox.value!!.map { it.id })
        assertEquals(0, state.unreadCount)
    }

    @Test fun joinRequestsAreReadOnlyForGroupsWhoseOwnerOrAdminTheyAre() {
        val adminGroup = joinedGroup.copy(id = "7d3f4e3a-5b6c-4d7e-8f80-91a2b3c4d5e6", name = "Choir", role = "admin")
        sources.spaces = listOf(family, ownedGroup, joinedGroup, adminGroup)
        val state = ready().state.value
        assertEquals(listOf("joins:${ownedGroup.id}", "joins:${adminGroup.id}"), sources.calls.filter { it.startsWith("joins:") })
        assertEquals(listOf(ownedGroup, adminGroup), state.reviewedGroups)
        assertEquals(setOf(ownedGroup.id, adminGroup.id), state.joins.keys)
        assertFalse(state.joinsLoading)
        assertFalse(state.joinsFailed)
        sources.failures["joins:${ownedGroup.id}"] = IOException("offline")
        val failing = HomeViewModel(sources, clock).also { model = it; it.bind(accountId, "UTC") }
        assertTrue(failing.state.value.joinsFailed)
        sources.failures.clear()
        failing.retryJoins()
        assertFalse(failing.state.value.joinsFailed)
        assertEquals(1, failing.state.value.joins.getValue(ownedGroup.id).value!!.size)
    }

    @Test fun todayCombinesSpacesInCalendarOrderSkipsFinishedItemsAndRetriesOneSpace() {
        sources.days = mapOf(
            family.id to listOf(
                entry("55555555-5555-4555-8555-555555555501", "task", "completed"),
                entry("55555555-5555-4555-8555-555555555502", "event", "scheduled", at = "2026-10-01T12:00:00Z"),
                entry("55555555-5555-4555-8555-555555555503", "event", "cancelled", at = "2026-10-01T11:00:00Z"),
                entry("55555555-5555-4555-8555-555555555504", "reminder", "scheduled", at = "2026-10-01T08:00:00Z"),
            ),
            ownedGroup.id to listOf(
                entry("55555555-5555-4555-8555-555555555505", "task", "in_progress", ownedGroup),
                entry("55555555-5555-4555-8555-555555555506", "planned", "planned", ownedGroup, "2026-10-01T10:00:00Z"),
                entry("55555555-5555-4555-8555-555555555507", "reminder", "suppressed", ownedGroup, "2026-10-01T07:00:00Z"),
            ),
        )
        sources.failures["day:${joinedGroup.id}"] = IOException("offline")
        val home = ready()
        assertEquals(listOf("55555555-5555-4555-8555-555555555505", "55555555-5555-4555-8555-555555555504", "55555555-5555-4555-8555-555555555506", "55555555-5555-4555-8555-555555555502"),
            home.state.value.todayEntries.map { it.id })
        assertEquals(listOf(joinedGroup), home.state.value.todayFailed)
        assertFalse(home.state.value.todayLoading)
        sources.failures.clear()
        sources.calls.clear()
        home.retryDay(joinedGroup.id)
        assertEquals(listOf("day:${joinedGroup.id}:$today:UTC"), sources.calls)
        assertTrue(home.state.value.todayFailed.isEmpty())
        home.retryDay(family.id)
        assertEquals(1, sources.calls.size)
    }

    @Test fun todayIsTheDateWhereThePersonLives() {
        ready("Asia/Kolkata", Clock.fixed(Instant.parse("2026-10-01T20:00:00Z"), ZoneOffset.UTC))
        assertTrue(sources.calls.contains("day:${family.id}:2026-10-02:Asia/Kolkata"))
    }

    @Test fun aLostSignInEndsHomeInsteadOfShowingSectionFailures() {
        sources.failures["inbox"] = IdentityFailure("UNAUTHORIZED", "Sign in again.", 401)
        val state = ready().state.value
        assertTrue(state.requiresSignIn)
        assertNull(state.spaces.value)
        assertNull(state.posts.value)
    }

    @Test fun aLateAnswerForTheEarlierAccountIsDropped() {
        val gate = CompletableDeferred<Unit>()
        sources.postsGate = gate
        val home = ready()
        assertTrue(home.state.value.posts.loading)
        sources.postsGate = null
        sources.posts = emptyList()
        home.bind(otherAccount, "UTC")
        assertEquals(emptyList<PostDto>(), home.state.value.posts.value)
        gate.complete(Unit)
        assertEquals(otherAccount, home.state.value.accountId)
        assertEquals(emptyList<PostDto>(), home.state.value.posts.value)
    }

    @Test fun resumeReloadsOnlyAfterHomeHasBeenOpenAWhile() {
        val home = ready()
        sources.calls.clear()
        home.resume()
        assertTrue(sources.calls.isEmpty())
        home.refresh()
        assertTrue(sources.calls.containsAll(listOf("spaces", "invitations", "requests", "inbox", "posts")))
    }

    @Test fun theBarFollowsTheScreenAndNeverSkipsAScreensLeaveCheck() {
        val spaces = SpaceWorkspaceState(accountId = accountId)
        val messaging = MessagingState(accountId = accountId)
        val community = CommunityState(accountId = accountId)
        fun bar(screen: String, signedIn: Boolean = true, busy: Boolean = false, s: SpaceWorkspaceState = spaces, m: MessagingState = messaging, c: CommunityState = community) =
            mainBar(screen, signedIn, busy, s, m, c)
        assertNull(bar("account", signedIn = false))
        assertEquals(MainBar(MainSection.HOME, true), bar("home"))
        assertEquals(MainBar(MainSection.PROFILE, false), bar("account", busy = true))
        assertEquals(MainBar(MainSection.SPACES, true), bar("spaces"))
        assertNull(bar("spaces", s = spaces.copy(selectedSpace = family)))
        assertNull(bar("spaces", s = spaces.copy(creating = true)))
        assertEquals(MainBar(MainSection.SPACES, false), bar("spaces", s = spaces.copy(recipientDraft = "someone")))
        assertEquals(MainBar(MainSection.MESSAGES, true), bar("messages"))
        val conversation = ConversationDto("d1", family.id, family.name, "space", "Morgan family", emptyList(), true, "server", "0", "0", 0, null, "2026-10-01T00:00:00Z")
        assertNull(bar("messages", m = messaging.copy(chat = ChatState(conversation))))
        assertEquals(MainBar(MainSection.DISCOVER, true), bar("community"))
        assertEquals(MainBar(MainSection.DISCOVER, false), bar("community", c = community.copy(working = true)))
        assertEquals(MainBar(MainSection.PROFILE, true), bar("community", c = community.copy(destination = Destination.Blocked)))
        for (nested in listOf("calendar", "care", "search", "tasks", "reminders", "events", "agent", "documents")) assertNull(bar(nested))
    }
}
