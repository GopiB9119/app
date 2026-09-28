package com.community.platform.feature.identity

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import retrofit2.Response
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

@Singleton
class AccountRepository @Inject constructor(
    private val api: IdentityApi,
    private val store: SessionStore,
    private val gson: Gson,
) {
    private val mutex = Mutex()

    internal fun <Value : Any> result(response: Response<EnvelopeDto<Value>>): Value {
        if (!response.isSuccessful) {
            val error = response.errorBody()?.use { body ->
                try { gson.fromJson(body.string(), EnvelopeDto::class.java)?.error } catch (_error: RuntimeException) { null }
            }
            throw IdentityFailure(error?.code ?: "REQUEST_FAILED", error?.message ?: "The request could not be completed.", response.code())
        }
        return response.body()?.data ?: throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected response.")
    }

    private fun profile(response: Response<EnvelopeDto<UserDto>>): Profile {
        val user = result(response)
        UUID.fromString(user.id)
        if (!user.emailVerified || user.version < 1) throw IdentityFailure("INVALID_RESPONSE", "The account is not verified.")
        val etag = response.headers()["ETag"] ?: throw IdentityFailure("INVALID_RESPONSE", "The profile version is missing.")
        return Profile(user, etag)
    }

    private suspend fun accept(response: Response<EnvelopeDto<AuthDto>>) {
        val auth = result(response)
        UUID.fromString(auth.user.id)
        if (auth.token.length < 32 || !auth.user.emailVerified) throw IdentityFailure("INVALID_RESPONSE", "The session could not be verified.")
        coroutineContext.ensureActive()
        store.save(Credentials(auth.token, auth.user.id))
    }

    suspend fun begin(intent: StartIntent): PendingProof = withContext(Dispatchers.IO) {
        val body = BeginDto(intent.email, intent.contextSecret)
        val response = when (intent.purpose) {
            EntryMode.REGISTER -> api.register(intent.requestKey, body)
            EntryMode.RECOVER -> api.recover(intent.requestKey, body)
            EntryMode.LOGIN -> throw IllegalArgumentException("Login does not create a challenge")
        }
        PendingProof(intent, result(response))
    }

    suspend fun verify(pending: PendingProof, code: String, password: String, name: String, timezone: String) = withContext(Dispatchers.IO) {
        mutex.withLock {
            accept(api.verify(VerifyDto(pending.challenge.id, pending.intent.contextSecret, code, password, name, timezone)))
        }
    }

    suspend fun login(email: String, password: String) = withContext(Dispatchers.IO) {
        mutex.withLock { accept(api.login(LoginDto(email, password))) }
    }

    suspend fun reset(pending: PendingProof, code: String, password: String) = withContext(Dispatchers.IO) {
        mutex.withLock {
            result(api.reset(ResetDto(pending.challenge.id, pending.intent.contextSecret, code, password)))
            store.clear()
        }
    }

    suspend fun current(): Profile? = withContext(Dispatchers.IO) {
        mutex.withLock {
            val saved = store.load() ?: return@withLock null
            try {
                val profile = profile(api.me("Bearer ${saved.token}"))
                if (profile.user.id != saved.accountId) throw IdentityFailure("ACCOUNT_CHANGED", "Sign in again to continue.", 401)
                profile
            } catch (error: IdentityFailure) {
                if (error.status != 401) throw error
                store.clear()
                null
            }
        }
    }

    internal suspend fun <Value> authorized(expectedAccountId: String, operation: suspend (String) -> Value): Value = withContext(Dispatchers.IO) {
        mutex.withLock {
            val saved = store.load() ?: throw IdentityFailure("AUTHENTICATION_REQUIRED", "Sign in to continue.", 401)
            if (saved.accountId != expectedAccountId) throw IdentityFailure("ACCOUNT_CHANGED", "The signed-in account changed. Reload before continuing.", 409)
            coroutineContext.ensureActive()
            try { operation("Bearer ${saved.token}") } catch (error: IdentityFailure) {
                if (error.status == 401) store.clear()
                throw error
            }
        }
    }

    suspend fun update(accountId: String, etag: String, name: String, timezone: String): Profile = authorized(accountId) { authorization ->
        profile(api.profile(authorization, etag, ProfileDto(name, timezone)))
    }
    suspend fun sessions(accountId: String): List<SessionDto> = authorized(accountId) { result(api.sessions(it)) }
    suspend fun events(accountId: String): List<SecurityEventDto> = authorized(accountId) { result(api.events(it)) }
    suspend fun revoke(accountId: String, sessionId: String) = authorized(accountId) { result(api.revoke(it, sessionId)) }
    suspend fun revokeOthers(accountId: String) = authorized(accountId) { result(api.revokeOthers(it)) }
    suspend fun logout(accountId: String) = authorized(accountId) {
        result(api.logout(it))
        store.clear()
    }
    suspend fun timezones(): List<String> = withContext(Dispatchers.IO) { result(api.timezones()) }
}