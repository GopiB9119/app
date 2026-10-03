package com.community.platform.feature.identity

import com.google.gson.Gson
import kotlinx.coroutines.CompletableDeferred
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.util.concurrent.atomic.AtomicInteger

@OptIn(ExperimentalCoroutinesApi::class)
class IdentityViewModelTest {
    private val user = UserDto("62f3da14-12e9-4575-9541-caf8b98e2dfd", "alex@example.test", "Alex", "UTC", true, 1)
    private val token = "synthetic-session-token-with-more-than-32-characters"
    private val store = AccountRepositoryTest.MemoryStore()
    private val api = AccountRepositoryTest.FakeApi(user, token)
    private val unreachable = "Can't reach the service. Check your connection, then try again."

    @Before fun dispatcher() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { Dispatchers.resetMain() }

    private suspend fun started(): IdentityViewModel = IdentityViewModel(AccountRepository(api, store, Gson())).also { idle(it) }

    private suspend fun idle(model: IdentityViewModel) = withTimeout(5000) { model.state.first { !it.loading && !it.busy } }

    @Test fun offlineStartKeepsTheSavedSignInAndOffersARetryInsteadOfTheSignInForm() = runBlocking {
        store.save(Credentials(token, user.id))
        api.meOffline = true
        val model = started()
        val offline = model.state.value
        assertTrue(offline.signInUnchecked)
        assertNull(offline.profile)
        assertEquals(unreachable, offline.error)
        assertEquals(token, store.value?.token)

        api.meOffline = false
        model.refresh(); idle(model)
        val online = model.state.value
        assertFalse(online.signInUnchecked)
        assertEquals(user.id, online.profile?.user?.id)
        assertNull(online.error)
        assertEquals(0, api.logins)
    }

    @Test fun serverFailureAtStartAlsoKeepsTheSavedSignIn() = runBlocking {
        store.save(Credentials(token, user.id))
        api.meFailure = 503
        val model = started()
        assertTrue(model.state.value.signInUnchecked)
        assertNull(model.state.value.profile)
        assertEquals("Synthetic failure", model.state.value.error)
        assertEquals(token, store.value?.token)
    }

    @Test fun rejectedSignInShowsTheSignInFormEvenAfterAnOfflineStart() = runBlocking {
        store.save(Credentials(token, user.id))
        api.meOffline = true
        val model = started()
        assertTrue(model.state.value.signInUnchecked)

        api.meOffline = false
        api.meFailure = 401
        model.refresh(); idle(model)
        assertFalse(model.state.value.signInUnchecked)
        assertNull(model.state.value.profile)
        assertNull(store.value)
    }

    @Test fun signedOutOfflineStartShowsTheSignInFormWithoutClaimingChangesWereLost() = runBlocking {
        api.timezonesOffline = true
        val model = started()
        assertFalse(model.state.value.signInUnchecked)
        assertNull(model.state.value.profile)
        assertEquals(unreachable, model.state.value.error)
    }

    // Without the app-wide request lock (T82), a read sent beside a change could answer after it and show what came before.
    @Test fun aRefreshDuringAnUnansweredChangeIsNotSent() = runBlocking {
        store.save(Credentials(token, user.id))
        val reached = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val reads = AtomicInteger()
        val held = object : IdentityApi by api {
            override suspend fun me(authorization: String): Response<EnvelopeDto<UserDto>> { reads.incrementAndGet(); return api.me(authorization) }
            override suspend fun revokeOthers(authorization: String): Response<EnvelopeDto<DoneDto>> {
                reached.complete(Unit); release.await(); return api.revokeOthers(authorization)
            }
        }
        val model = IdentityViewModel(AccountRepository(held, store, Gson())).also { idle(it) }
        val before = reads.get()
        model.revokeOthers()
        withTimeout(5000) { reached.await() }
        model.refresh()
        release.complete(Unit)
        idle(model)
        // The change reads the account again itself once it is answered; the Refresh during it sent nothing.
        assertEquals(before + 1, reads.get())
        assertEquals("Other sessions signed out.", model.state.value.notice)
    }

    @Test fun signUpStartsInTheDeviceTimezoneUnderTheNameTheServiceLists() {
        assertEquals("Europe/Berlin", signUpTimezone(listOf("UTC", "Europe/Berlin"), "Europe/Berlin"))
        // The service refuses the older name Asia/Calcutta, which emulators and some devices report.
        assertEquals("Asia/Kolkata", signUpTimezone(listOf("UTC", "Asia/Kolkata"), "Asia/Calcutta"))
        assertEquals("UTC", signUpTimezone(listOf("UTC", "Asia/Kolkata"), "America/Chicago"))
        assertEquals("UTC", signUpTimezone(listOf("UTC", "Asia/Kolkata"), "GMT+05:30"))
    }
}
