package com.community.platform.feature.planning

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.spaces.SpaceRepositoryTest
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

@OptIn(ExperimentalCoroutinesApi::class)
class ChecklistTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val taskId = "d2860b8d-58da-447f-8275-cf6a0a9a4c32"
    private val item = ChecklistItemDto("9717353d-2939-45b8-8acd-c89c3dd8331c", "Read chapter", false, null, null)
    private val original = ChecklistDto(taskId, fixture.spaceId, "Reading", "open", "1", true, true, listOf(item), "\"${"a".repeat(64)}\"")
    private var response = original
    private var failure = 0
    private val commands = mutableListOf<Triple<String, String, ChecklistChangeDto>>()
    private val api = object : ChecklistApi {
        override suspend fun read(authorization: String, taskId: String) = result()
        override suspend fun change(authorization: String, taskId: String, etag: String, key: String, body: ChecklistChangeDto): Response<EnvelopeDto<ChecklistDto>> {
            commands.add(Triple(key, etag, body)); return result()
        }
        fun result(): Response<EnvelopeDto<ChecklistDto>> = if (failure == 0) Response.success(EnvelopeDto(response, null)) else Response.error(failure, """{"error":{"code":"CHECK_FAILED","message":"Synthetic failure","details":{}}}""".toResponseBody("application/json".toMediaType()))
    }
    private val repository = ChecklistRepository(api, fixture.accounts)
    private var model: ChecklistViewModel? = null
    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null, null, null); Dispatchers.resetMain() }
    private suspend fun idle(current: ChecklistViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(): ChecklistViewModel {
        val current = ChecklistViewModel(repository); model = current
        current.bind(fixture.accountId, taskId, fixture.spaceId); idle(current)
        return current
    }

    @Test fun rejectsScopeDuplicatesAndFalseCompletionFacts(): Unit = runBlocking {
        for (invalid in listOf(original.copy(taskId = fixture.spaceId), original.copy(spaceId = taskId), original.copy(items = listOf(item, item)), original.copy(items = listOf(item.copy(checked = true))), original.copy(taskStatus = "completed"))) {
            response = invalid
            assertThrows(IdentityFailure::class.java) { runBlocking { repository.read(fixture.accountId, taskId, fixture.spaceId) } }
        }
    }

    @Test fun unknownAddRetainsOriginalCommandAndBlocksChangedDrafts() = runBlocking {
        val current = ready()
        current.title("New item"); failure = 503
        current.saveTitle(); idle(current)
        val intent = current.state.value.pending
        assertNotNull(intent)
        current.title("Replacement"); current.reload(); current.refresh(); current.check(item, true)
        assertEquals("New item", current.state.value.title)
        assertEquals(1, commands.size)
        failure = 0
        current.retry(); idle(current)
        assertEquals(commands[0], commands[1])
        assertEquals(intent!!.key, commands[1].first)
        assertNull(current.state.value.pending)
        assertEquals("Checklist saved.", current.state.value.notice)
    }

    @Test fun conflictRequiresExplicitReloadAndNewReview() = runBlocking {
        val current = ready()
        current.title("Draft"); failure = 412; current.saveTitle(); idle(current)
        assertTrue(current.state.value.conflict)
        assertEquals("Draft", current.state.value.title)
        current.saveTitle(); current.refresh()
        assertEquals(1, commands.size)
        failure = 0; response = original.copy(taskVersion = "2", etag = "\"${"b".repeat(64)}\"")
        current.reload(); idle(current)
        assertFalse(current.state.value.conflict)
        assertEquals("", current.state.value.title)
        current.title("Reviewed"); current.saveTitle(); idle(current)
        assertNotEquals(commands[0].first, commands[1].first)
        assertEquals(response.etag, commands[1].second)
    }

    @Test fun assigneeCanCheckButCannotManageAndRemovalNeedsConfirmation() = runBlocking {
        response = original.copy(canManage = false)
        val current = ready()
        current.edit(item); current.remove(item); current.confirmRemove()
        assertTrue(commands.isEmpty())
        current.check(item, true); idle(current)
        assertEquals(ChecklistChangeDto("check", itemId = item.id, checked = true), commands.single().third)
        response = original; current.reload(); idle(current)
        current.remove(item)
        assertEquals(1, commands.size)
        current.cancelEdit(); current.confirmRemove()
        assertEquals(1, commands.size)
        current.remove(item); current.confirmRemove(); idle(current)
        assertEquals("remove", commands.last().third.action)
    }

    @Test fun accessLossClearsPrivateChecklistAndDraft() = runBlocking {
        val current = ready()
        current.title("Private"); failure = 404; current.saveTitle(); idle(current)
        assertTrue(current.state.value.denied)
        assertNull(current.state.value.basis)
        assertEquals("", current.state.value.title)
        assertNull(current.state.value.pending)
    }

    @Test fun accountChangeRejectsLateChecklistResponse() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val delayed = object : ChecklistApi by api {
            override suspend fun read(authorization: String, taskId: String): Response<EnvelopeDto<ChecklistDto>> {
                entered.complete(Unit); release.await(); return Response.success(EnvelopeDto(original, null))
            }
        }
        val current = ChecklistViewModel(ChecklistRepository(delayed, fixture.accounts)); model = current
        current.bind(fixture.accountId, taskId, fixture.spaceId)
        withTimeout(5000) { entered.await() }
        current.bind(null, null, null); release.complete(Unit)
        assertEquals(ChecklistState(), current.state.value)
    }

    // Without the app-wide request lock (T82), a read sent beside a change could answer after it and undo it on screen.
    @Test fun aRefreshWhileAChangeIsUnansweredIsNotSent() = runBlocking {
        val reached = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val reads = AtomicInteger()
        val held = object : ChecklistApi by api {
            override suspend fun read(authorization: String, taskId: String): Response<EnvelopeDto<ChecklistDto>> {
                reads.incrementAndGet(); return api.read(authorization, taskId)
            }
            override suspend fun change(authorization: String, taskId: String, etag: String, key: String, body: ChecklistChangeDto): Response<EnvelopeDto<ChecklistDto>> {
                reached.complete(Unit); release.await(); return api.change(authorization, taskId, etag, key, body)
            }
        }
        val current = ChecklistViewModel(ChecklistRepository(held, fixture.accounts)); model = current
        current.bind(fixture.accountId, taskId, fixture.spaceId); idle(current)
        val loaded = reads.get()
        current.check(item, true)
        withTimeout(5000) { reached.await() }
        current.refresh(); current.reload()
        release.complete(Unit); idle(current)
        // A read sent beside the change may still be queued when the screen settles, so give it time to show up.
        assertNull(withTimeoutOrNull(2000) { while (reads.get() == loaded) delay(10) })
        assertEquals(1, commands.size)
        assertEquals("Checklist saved.", current.state.value.notice)
    }

    @Test fun aChangeWhileTheChecklistLoadsIsNotSent() = runBlocking {
        val hold = AtomicBoolean(false)
        val reached = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val held = object : ChecklistApi by api {
            override suspend fun read(authorization: String, taskId: String): Response<EnvelopeDto<ChecklistDto>> {
                if (hold.get()) { reached.complete(Unit); release.await() }
                return api.read(authorization, taskId)
            }
        }
        val current = ChecklistViewModel(ChecklistRepository(held, fixture.accounts)); model = current
        current.bind(fixture.accountId, taskId, fixture.spaceId); idle(current)
        hold.set(true); current.refresh()
        withTimeout(5000) { reached.await() }
        current.check(item, true)
        release.complete(Unit); idle(current)
        assertNull(withTimeoutOrNull(2000) { while (commands.isEmpty()) delay(10) })
        assertFalse(current.state.value.basis!!.items.single().checked)
    }

    @Test fun wirePreservesFalseAndOmitsOtherActionFields() = runBlocking {
        var request: Request? = null
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            request = chain.request()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(Gson().toJson(EnvelopeDto(original, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = ChecklistRepository(IdentityModule.checklist(http, Gson()), fixture.accounts)
        val intent = ChecklistIntent(fixture.accountId, taskId, fixture.spaceId, original.etag, UUID.randomUUID().toString(), ChecklistChangeDto("check", itemId = item.id, checked = false))
        wire.change(intent)
        assertEquals("POST", request!!.method)
        assertEquals(intent.etag, request!!.header("If-Match"))
        assertEquals(intent.key, request!!.header("Idempotency-Key"))
        val buffer = Buffer(); request!!.body!!.writeTo(buffer)
        val body = JsonParser.parseString(buffer.readUtf8()).asJsonObject
        assertEquals(setOf("action", "item_id", "checked"), body.keySet())
        assertFalse(body["checked"].asBoolean)
    }

    @Test fun theSameInvalidItemTitleIncrementsTheMessageIdEachTime() = runBlocking {
        val current = ready()
        current.title("Invalid\u0001title")
        val initialMessageId = current.state.value.messageId
        repeat(2) { attempt ->
            current.saveTitle()
            assertEquals("Enter an item title of 1 to 200 plain characters.", current.state.value.error)
            assertEquals(initialMessageId + attempt + 1L, current.state.value.messageId)
        }
    }
}