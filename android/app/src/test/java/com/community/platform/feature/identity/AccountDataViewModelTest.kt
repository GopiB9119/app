package com.community.platform.feature.identity

import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class AccountDataViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()
    private val fixture = AccountDataFixture()
    private val models = mutableListOf<AccountDataViewModel>()

    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun cleanup() { models.forEach { it.bind(null) }; Dispatchers.resetMain() }

    private fun model(): AccountDataViewModel = AccountDataViewModel(fixture.repository, Gson()).also {
        it.bind(Profile(fixture.user, "\"profile-1\""))
        models.add(it)
    }
    private suspend fun idle(model: AccountDataViewModel): AccountDataState = withTimeout(5000) { model.state.first { !it.busy && !it.loading } }
    private suspend fun idle(model: IdentityViewModel): IdentityState = withTimeout(5000) { model.state.first { !it.busy && !it.loading } }

    @Test fun exportRetryAfterALostAnswerReusesTheSameKeyAndSelection() = runBlocking {
        val model = model()
        fixture.respond = { throw IOException("Synthetic lost answer") }
        model.prepare(); idle(model)
        assertEquals("OFFLINE", model.state.value.problem?.code)
        assertEquals(1, fixture.requests.size)
        val original = fixture.requests.single()
        UUID.fromString(original.key)

        fixture.respond = { 202 to fixture.envelope(fixture.export) }
        model.prepare(); idle(model)
        assertEquals(original.key, fixture.requests.last().key)
        assertEquals(original.body, fixture.requests.last().body)
        assertEquals(listOf(fixture.export), model.state.value.downloads)
        assertNull(model.state.value.problem)
        model.prepare(); idle(model)
        assertNotEquals(original.key, fixture.requests.last().key)
    }

    @Test fun aChangedSelectionGetsANewKeyEvenWhenChangedBackBeforeRetry() = runBlocking {
        val model = model()
        fixture.respond = { throw IOException("Synthetic lost answer") }
        model.prepare(); idle(model)
        val first = fixture.requests.single()
        model.choose("tasks", false)
        model.prepare(); idle(model)
        val second = fixture.requests.last()
        assertNotEquals(first.key, second.key)
        assertEquals(accountExportCategories.filter { it != "tasks" }, JsonParser.parseString(second.body).asJsonObject["categories"].asJsonArray.map { it.asString })
        model.choose("profile", false)
        model.choose("profile", true)
        model.prepare(); idle(model)
        assertNotEquals(second.key, fixture.requests.last().key)
        assertEquals(second.body, fixture.requests.last().body)
    }

    @Test fun noCategoriesMeansNoRequest() = runBlocking {
        val model = model()
        assertEquals(accountExportCategories.toSet(), model.state.value.categories)
        accountExportCategories.forEach { model.choose(it, false) }
        model.prepare(); idle(model)
        assertTrue(fixture.requests.isEmpty())
    }

    @Test fun deletionPasswordFailureStaysInTheDialogAndKeepsTheSession() = runBlocking {
        val model = model()
        fixture.respond = { fixture.failure(403, "PASSWORD_INCORRECT", "The password is incorrect.") }
        model.openDeletion(); model.delete("wrong-password"); idle(model)
        assertEquals("PASSWORD_INCORRECT", model.state.value.deletionProblem?.code)
        assertTrue(model.state.value.deletionOpen)
        assertNull(model.state.value.problem)
        assertEquals(fixture.token, fixture.store.value?.token)
        model.closeDeletion()
        assertFalse(model.state.value.deletionOpen)
        assertNull(model.state.value.deletionProblem)
    }

    @Test fun deletionExposesBothOwnedSpacesWithoutSigningOut() = runBlocking {
        val model = model()
        fixture.respond = { fixture.failure(409, "OWNED_SPACES_WITH_MEMBERS", "Hand ownership over.", mapOf("spaces" to "Family\nStudy group", "space_ids" to "first,second")) }
        model.openDeletion(); model.delete("Synthetic-password"); idle(model)
        assertEquals(listOf("Family", "Study group"), model.state.value.deletionProblem?.ownedSpaces)
        assertEquals(fixture.token, fixture.store.value?.token)
    }

    @Test fun deletionProducesASignedOutNoticeInTheAccountTimezone() = runBlocking {
        val identity = IdentityViewModel(fixture.repository)
        idle(identity)
        val model = model()
        fixture.respond = { 202 to fixture.envelope(DeletionDto("deletion_requested", fixture.purgeAfter)) }
        model.openDeletion(); model.delete("Synthetic-password"); idle(model)
        val notice = model.state.value.deleted!!
        assertEquals(AccountDeletionNotice(fixture.purgeAfter, "Asia/Kolkata"), notice)
        assertNull(fixture.store.value)
        assertFalse(model.state.value.deletionOpen)
        assertTrue(model.state.value.downloads.isEmpty())
        identity.accountDeleted(notice)
        assertNull(identity.state.value.profile)
        assertEquals(EntryMode.LOGIN, identity.state.value.mode)
        assertEquals(notice, identity.state.value.deletionNotice)
    }

    @Test fun pendingDeletionOffersTheDateAndCancellationSignsInWithExactlyThoseCredentials() = runBlocking {
        fixture.store.clear()
        val identity = IdentityViewModel(fixture.repository)
        idle(identity)
        fixture.respond = { request -> when (request.url.encodedPath) {
            "/v1/auth/login" -> fixture.failure(409, "ACCOUNT_DELETION_PENDING", "Waiting for deletion.", mapOf("purge_after" to fixture.purgeAfter))
            "/v1/auth/cancel-deletion" -> 200 to fixture.envelope(AuthDto("new-${fixture.token}", "session", "2026-10-02T18:00:00Z", fixture.user))
            else -> fixture.defaultResponse(request)
        } }
        identity.login(fixture.user.email, "Synthetic-password"); idle(identity)
        assertEquals(fixture.purgeAfter, identity.state.value.pendingDeletionAt)
        assertNull(identity.state.value.error)
        val login = fixture.requests.last()
        identity.cancelDeletion(); idle(identity)
        val cancel = fixture.requests.single { it.path == "/v1/auth/cancel-deletion" }
        assertEquals(login.body, cancel.body)
        assertEquals(fixture.user.id, identity.state.value.profile?.user?.id)
        assertEquals("new-${fixture.token}", fixture.store.value?.token)
        assertNull(identity.state.value.pendingDeletionAt)
    }

    @Test fun changedCredentialsClearTheOfferAndCannotCancelWithOldCredentials() = runBlocking {
        fixture.store.clear()
        val identity = IdentityViewModel(fixture.repository)
        idle(identity)
        fixture.respond = { fixture.failure(409, "ACCOUNT_DELETION_PENDING", "Waiting for deletion.", mapOf("purge_after" to fixture.purgeAfter)) }
        identity.login(fixture.user.email, "Synthetic-password"); idle(identity)
        assertEquals(fixture.purgeAfter, identity.state.value.pendingDeletionAt)
        val before = fixture.requests.size
        identity.credentialsChanged()
        identity.cancelDeletion(); idle(identity)
        assertNull(identity.state.value.pendingDeletionAt)
        assertEquals(before, fixture.requests.size)
    }

    @Test fun reauthenticationIsExposedAndSignInAgainClearsEvenAnOfflineSession() = runBlocking {
        val identity = IdentityViewModel(fixture.repository)
        idle(identity)
        val model = model()
        fixture.respond = { fixture.failure(403, "REAUTHENTICATION_REQUIRED", "Sign in again.") }
        model.prepare(); idle(model)
        assertEquals("REAUTHENTICATION_REQUIRED", model.state.value.problem?.code)
        assertEquals(fixture.token, fixture.store.value?.token)
        fixture.respond = { throw IOException("Synthetic offline logout") }
        identity.signInAgain(); idle(identity)
        assertNull(identity.state.value.profile)
        assertNull(fixture.store.value)
    }

    @Test fun pollingRunsEveryFiveSecondsOnlyWhilePreparingAndVisible() = runBlocking {
        val model = model()
        fixture.respond = { 200 to fixture.envelope(listOf(fixture.export)) }
        model.visible(true); idle(model)
        assertEquals(1, fixture.requests.size)
        dispatcher.scheduler.advanceTimeBy(4999)
        dispatcher.scheduler.runCurrent()
        assertEquals(1, fixture.requests.size)
        dispatcher.scheduler.advanceTimeBy(1)
        dispatcher.scheduler.runCurrent()
        idle(model)
        assertEquals(2, fixture.requests.size)
        model.visible(false)
        dispatcher.scheduler.advanceTimeBy(10000)
        dispatcher.scheduler.runCurrent()
        assertEquals(2, fixture.requests.size)
        fixture.respond = { 200 to fixture.envelope(listOf(fixture.export.copy(status = "ready"))) }
        model.visible(true); idle(model)
        assertEquals(3, fixture.requests.size)
        dispatcher.scheduler.advanceTimeBy(15000)
        dispatcher.scheduler.runCurrent()
        assertEquals(3, fixture.requests.size)
    }

    @Test fun downloadWritesPrettyJsonOnlyToTheSelectedStream() = runBlocking {
        val model = model()
        fixture.respond = { 200 to fixture.envelope(listOf(fixture.export.copy(status = "ready"))) }
        model.refresh(); idle(model)
        val output = ByteArrayOutputStream()
        var opens = 0
        val archive = JsonParser.parseString("""{"format":"community-platform-account-export","version":1,"profile":{"name":"Synthetic"}}""")
        fixture.respond = { 200 to fixture.envelope(archive) }
        model.download(fixture.export.id) { opens += 1; output }; idle(model)
        assertEquals(1, opens)
        assertEquals(archive, JsonParser.parseString(output.toString("UTF-8")))
        assertTrue(output.toString("UTF-8").contains("\n  \"profile\": {\n"))
        assertTrue(model.state.value.downloadSaved)
        assertNull(model.state.value.problem)
    }

    @Test fun anotherSessionsArchiveCannotBeRequestedOrWritten() = runBlocking {
        val model = model()
        fixture.respond = { 200 to fixture.envelope(listOf(fixture.export.copy(status = "ready", requestedHere = false))) }
        model.refresh(); idle(model)
        model.download(fixture.export.id) { throw AssertionError("Must not open a destination") }; idle(model)
        assertEquals(1, fixture.requests.size)
        assertFalse(model.state.value.downloadSaved)
    }
}