package com.community.platform.feature.identity

import com.google.gson.Gson
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import retrofit2.Response
import java.io.IOException

class AccountConcurrencyTest {
    private val user = UserDto("62f3da14-12e9-4575-9541-caf8b98e2dfd", "alex@example.test", "Alex", "UTC", true, 1)
    private val original = Credentials("synthetic-original-session-with-more-than-32-characters", user.id)
    private val replacementToken = "synthetic-replacement-session-with-more-than-32-characters"
    private val store = AccountRepositoryTest.MemoryStore().apply { save(original) }
    private val entered = CompletableDeferred<Unit>()
    private val release = CompletableDeferred<Unit>()

    private fun repository(api: IdentityApi = AccountRepositoryTest.FakeApi(user, replacementToken)) = AccountRepository(api, store, Gson())

    @Test fun aHeldRequestDoesNotBlockAnotherSignedInRequest() = runBlocking {
        val accounts = repository()
        val held = launch { accounts.authorized(user.id) { entered.complete(Unit); release.await() } }
        try {
            withTimeout(5000) { entered.await() }
            assertEquals("second answer", withTimeout(5000) { accounts.authorized(user.id) { "second answer" } })
            assertFalse(release.isCompleted)
            assertTrue(held.isActive)
        } finally { held.cancelAndJoin() }
        assertEquals(original, store.load())
    }

    private suspend fun oldUnauthorizedCannotClearReplacement(replacementUser: UserDto): Unit = coroutineScope {
        val accounts = repository(AccountRepositoryTest.FakeApi(replacementUser, replacementToken))
        val held = async {
            try {
                accounts.authorized(user.id) { authorization ->
                    assertEquals("Bearer ${original.token}", authorization)
                    entered.complete(Unit); release.await()
                    throw IdentityFailure("AUTHENTICATION_REQUIRED", "Synthetic expired session", 401)
                }
            } catch (error: IdentityFailure) { error }
        }
        try {
            withTimeout(5000) { entered.await() }
            withTimeout(5000) { accounts.login(replacementUser.email, "Synthetic-password") }
            release.complete(Unit)
            assertEquals(401, withTimeout(5000) { held.await() }.status)
            assertEquals(Credentials(replacementToken, replacementUser.id), store.load())
            withTimeout(5000) {
                accounts.authorized(replacementUser.id) { assertEquals("Bearer $replacementToken", it) }
            }
        } finally { held.cancelAndJoin() }
    }

    @Test fun anOld401KeepsANewSessionForTheSameAccount(): Unit = runBlocking {
        oldUnauthorizedCannotClearReplacement(user)
    }

    @Test fun anOld401KeepsANewSessionForAnotherAccount(): Unit = runBlocking {
        oldUnauthorizedCannotClearReplacement(user.copy(id = "72f3da14-12e9-4575-9541-caf8b98e2dfd", email = "sam@example.test"))
    }

    private fun lifecycleApi(logoutFailure: Boolean = false) = object : IdentityApi by AccountRepositoryTest.FakeApi(user, replacementToken) {
        override suspend fun logout(authorization: String): Response<EnvelopeDto<DoneDto>> {
            assertEquals("Bearer ${original.token}", authorization)
            entered.complete(Unit); release.await()
            if (logoutFailure) throw IOException("Synthetic lost sign-out answer")
            return Response.success(EnvelopeDto(DoneDto("ok"), null))
        }

        override suspend fun deleteAccount(authorization: String, body: DeleteAccountDto): Response<EnvelopeDto<DeletionDto>> {
            assertEquals("Bearer ${original.token}", authorization)
            entered.complete(Unit); release.await()
            return Response.success(EnvelopeDto(DeletionDto("deletion_requested", "2026-10-10T10:00:00Z"), null))
        }
    }

    private suspend fun lifecycleCannotClearReplacement(
        api: IdentityApi = lifecycleApi(),
        command: suspend (AccountRepository) -> Unit,
    ) = coroutineScope {
        val accounts = repository(api)
        val held = launch { command(accounts) }
        try {
            withTimeout(5000) { entered.await() }
            withTimeout(5000) { accounts.login(user.email, "Synthetic-password") }
            release.complete(Unit)
            withTimeout(5000) { held.join() }
            assertEquals(Credentials(replacementToken, user.id), store.load())
        } finally { held.cancelAndJoin() }
    }

    @Test fun aLateLogoutAcknowledgmentKeepsANewerSession() = runBlocking {
        lifecycleCannotClearReplacement { it.logout(user.id) }
    }

    @Test fun aLateDeletionAcknowledgmentKeepsANewerSession() = runBlocking {
        lifecycleCannotClearReplacement { it.deleteAccount(user.id, "Synthetic-password") }
    }

    @Test fun aLostSignInAgainAnswerKeepsANewerSession() = runBlocking {
        lifecycleCannotClearReplacement(lifecycleApi(logoutFailure = true)) {
            try { it.signInAgain(user.id); fail("Expected the original connection error") }
            catch (error: IOException) { assertEquals("Synthetic lost sign-out answer", error.message) }
        }
    }

    @Test fun aCancelledSignInAgainStillClearsItsOwnSession() = runBlocking {
        val accounts = repository(lifecycleApi())
        val held = launch { accounts.signInAgain(user.id) }
        try { withTimeout(5000) { entered.await() } }
        finally { held.cancelAndJoin() }
        assertNull(store.load())
    }

    @Test fun aCancelledSignInAgainKeepsANewerSession() = runBlocking {
        val accounts = repository(lifecycleApi())
        val held = launch { accounts.signInAgain(user.id) }
        try {
            withTimeout(5000) { entered.await() }
            withTimeout(5000) { accounts.login(user.email, "Synthetic-password") }
        } finally { held.cancelAndJoin() }
        assertEquals(Credentials(replacementToken, user.id), store.load())
    }

    @Test fun aLostSignInAgainAnswerStillClearsItsOwnSession() = runBlocking {
        val accounts = repository(lifecycleApi(logoutFailure = true))
        release.complete(Unit)
        try { accounts.signInAgain(user.id); fail("Expected the original connection error") }
        catch (error: IOException) { assertEquals("Synthetic lost sign-out answer", error.message) }
        assertNull(store.load())
    }
}
