package com.community.platform.feature.identity

import com.community.platform.IdentityModule
import com.community.platform.R
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.io.File
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import javax.xml.parsers.DocumentBuilderFactory

class AccountDataTest {
    private val user = UserDto("62f3da14-12e9-4575-9541-caf8b98e2dfd", "alex@example.test", "Alex", "Asia/Kolkata", true, 1)
    private val token = "synthetic-session-token-with-more-than-32-characters"
    private val store = AccountRepositoryTest.MemoryStore()
    private val repository = AccountRepository(AccountRepositoryTest.FakeApi(user, token), store, Gson())

    @Test fun serverErrorPreservesBothOwnedSpaceNamesAndIds() {
        val response = Response.error<EnvelopeDto<DoneDto>>(409, """{"error":{"code":"OWNED_SPACES_WITH_MEMBERS","message":"Ownership must be handed over.","details":{"spaces":"Family\nStudy group","space_ids":"first,second"}}}""".toResponseBody("application/json".toMediaType()))
        val failure = assertThrows(IdentityFailure::class.java) { repository.result(response) }
        assertEquals("OWNED_SPACES_WITH_MEMBERS", failure.code)
        assertEquals(409, failure.status)
        assertEquals(listOf("Family", "Study group"), failure.details["spaces"]?.split("\n"))
        assertEquals("first,second", failure.details["space_ids"])
    }

    @Test fun errorWithoutDetailsKeepsExistingCallersCompatible() {
        val response = Response.error<EnvelopeDto<DoneDto>>(403, """{"error":{"code":"PASSWORD_INCORRECT","message":"The password is incorrect."}}""".toResponseBody("application/json".toMediaType()))
        val failure = assertThrows(IdentityFailure::class.java) { repository.result(response) }
        assertEquals(emptyMap<String, String>(), failure.details)
        assertEquals("The password is incorrect.", failure.message)
        assertEquals(emptyMap<String, String>(), IdentityFailure("LOCAL", "Local failure").details)
    }

    @Test fun deletionSendsOnlyThePasswordOnceAndClearsTheAcknowledgedSession() = runBlocking {
        val fixture = AccountDataFixture()
        fixture.respond = { 202 to fixture.envelope(DeletionDto("deletion_requested", fixture.purgeAfter)) }
        assertEquals(fixture.purgeAfter, fixture.repository.deleteAccount(fixture.user.id, "Synthetic-password").purgeAfter)
        val request = fixture.requests.single()
        assertEquals("POST", request.method)
        assertEquals("/v1/me/deletion", request.path)
        assertEquals("Bearer ${fixture.token}", request.authorization)
        assertEquals("""{"password":"Synthetic-password"}""", request.body)
        assertNull(request.key)
        assertNull(fixture.store.value)
    }

    @Test fun wrongPasswordPreservesTheSessionAndServerMessage() = runBlocking {
        val fixture = AccountDataFixture()
        fixture.respond = { fixture.failure(403, "PASSWORD_INCORRECT", "The password is incorrect.") }
        val failure = assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.deleteAccount(fixture.user.id, "wrong-password") } }
        assertEquals("PASSWORD_INCORRECT", failure.code)
        assertEquals("The password is incorrect.", failure.message)
        assertEquals(fixture.token, fixture.store.value?.token)
        assertEquals(1, fixture.requests.size)
    }

    @Test fun lostDeletionAnswerIsNotReplayedOrTreatedAsConfirmed() = runBlocking {
        val fixture = AccountDataFixture()
        fixture.respond = { throw IOException("Synthetic lost answer") }
        assertThrows(IOException::class.java) { runBlocking { fixture.repository.deleteAccount(fixture.user.id, "Synthetic-password") } }
        assertEquals(1, fixture.requests.size)
        assertEquals(fixture.token, fixture.store.value?.token)
        assertFalse(fixture.client.retryOnConnectionFailure)
    }

    @Test fun cancellingDeletionUsesTheLoginBodyAndAcceptsTheNewSession() = runBlocking {
        val fixture = AccountDataFixture()
        fixture.store.clear()
        fixture.respond = { request ->
            if (request.url.encodedPath == "/v1/auth/login") fixture.failure(409, "ACCOUNT_DELETION_PENDING", "Waiting for deletion.", mapOf("purge_after" to fixture.purgeAfter))
            else 200 to fixture.envelope(AuthDto("new-${fixture.token}", "new-session", "2026-10-02T18:00:00Z", fixture.user))
        }
        val failure = assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.login(fixture.user.email, "Synthetic-password") } }
        assertEquals(fixture.purgeAfter, failure.details["purge_after"])
        assertNull(fixture.store.value)
        fixture.repository.cancelDeletion(fixture.user.email, "Synthetic-password")
        assertEquals("/v1/auth/cancel-deletion", fixture.requests.last().path)
        assertEquals(fixture.requests.first().body, fixture.requests.last().body)
        assertEquals("POST", fixture.requests.last().method)
        assertEquals(fixture.user.id, fixture.store.value?.accountId)
        assertEquals("new-${fixture.token}", fixture.store.value?.token)
    }

    @Test fun exportRequestEncodesTheSelectionAndIdempotencyKey() = runBlocking {
        val fixture = AccountDataFixture()
        val key = UUID.randomUUID().toString()
        fixture.respond = { 202 to fixture.envelope(fixture.export) }
        fixture.repository.prepareExport(fixture.user.id, listOf("profile", "tasks"), key)
        val request = fixture.requests.single()
        assertEquals("POST", request.method)
        assertEquals("/v1/me/exports", request.path)
        assertEquals(key, request.key)
        assertEquals(JsonParser.parseString("""{"categories":["profile","tasks"]}"""), JsonParser.parseString(request.body))
    }

    @Test fun exportsReadTheListAndCancelWithDelete() = runBlocking {
        val fixture = AccountDataFixture()
        fixture.respond = { request ->
            200 to fixture.envelope(if (request.method == "GET") listOf(fixture.export) else fixture.export.copy(status = "cancelled"))
        }
        assertEquals(listOf(fixture.export), fixture.repository.exports(fixture.user.id))
        assertEquals("cancelled", fixture.repository.cancelExport(fixture.user.id, fixture.export.id).status)
        assertEquals(listOf("GET", "DELETE"), fixture.requests.map { it.method })
        assertEquals("/v1/me/exports/${fixture.export.id}", fixture.requests.last().path)
    }

    @Test fun archiveAllowsFiveMiBWithoutWideningOtherResponseLimits() = runBlocking {
        val fixture = AccountDataFixture()
        val archive = JsonParser.parseString("""{"format":"community-platform-account-export","version":1}""").asJsonObject
        archive.addProperty("synthetic", "a".repeat(5 * 1024 * 1024))
        fixture.respond = { 200 to fixture.envelope(archive) }
        val downloaded = fixture.repository.exportArchive(fixture.user.id, fixture.export.id)
        assertEquals(5 * 1024 * 1024, downloaded.get("synthetic").asString.length)
        assertEquals("GET", fixture.requests.single().method)
        assertEquals("/v1/me/exports/${fixture.export.id}/archive", fixture.requests.single().path)
        assertThrows(IOException::class.java) { runBlocking { fixture.repository.exports(fixture.user.id) } }
        archive.addProperty("synthetic", "a".repeat(6 * 1024 * 1024))
        assertThrows(IOException::class.java) { runBlocking { fixture.repository.exportArchive(fixture.user.id, fixture.export.id) } }
        Unit
    }

    @Test fun errorCodesResolveToTheRequiredUserMessages() {
        assertEquals(R.string.account_deletion_wrong_password, accountDataErrorResource("PASSWORD_INCORRECT"))
        assertEquals(R.string.account_deletion_owned_spaces, accountDataErrorResource("OWNED_SPACES_WITH_MEMBERS"))
        assertEquals(R.string.account_data_reauthentication, accountDataErrorResource("REAUTHENTICATION_REQUIRED"))
        assertEquals(R.string.account_data_in_progress, accountDataErrorResource("EXPORT_IN_PROGRESS"))
        val strings = dataStrings("values")
        assertEquals("The password is incorrect.", strings["account_deletion_wrong_password"])
        assertEquals("For your safety, sign in again before downloading your data.", strings["account_data_reauthentication"])
        assertEquals("You own Spaces that other people are in. Hand ownership to someone else or remove the members first:", strings["account_deletion_owned_spaces"])
        assertEquals("Download it on the device that asked for it.", strings["account_data_other_device"])
    }

    @Test fun allAccountDataStringsHaveTranslationsWithTheSameFormatArguments() {
        val english = dataStrings("values")
        assertTrue(english.size >= 45)
        val arguments = Regex("%[0-9]+\\\$[a-zA-Z]")
        for (language in listOf("values-te", "values-hi")) {
            val translated = dataStrings(language)
            assertEquals(english.keys, translated.keys)
            for ((name, text) in english) {
                assertTrue("Empty translation: $language/$name", translated.getValue(name).isNotBlank())
                assertEquals("Format arguments: $language/$name", arguments.findAll(text).map { it.value }.toList(),
                    arguments.findAll(translated.getValue(name)).map { it.value }.toList())
            }
        }
    }

    @Test fun deletionDatesUseTheAccountTimezoneAndLocalizedCalendarDate() {
        val date = "2026-10-09T20:00:00Z"
        assertTrue(formatAccountDataTimestamp(date, "Asia/Kolkata", Locale.US).startsWith("October 10, 2026"))
        assertTrue(formatAccountDataTimestamp(date, "UTC", Locale.US).startsWith("October 9, 2026"))
    }

    private fun dataStrings(language: String): Map<String, String> {
        val resources = listOf(File("src/main/res"), File("app/src/main/res"), File("android/app/src/main/res")).first { it.isDirectory }
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File(resources, "$language/strings.xml"))
        val entries = document.getElementsByTagName("string")
        val result = linkedMapOf<String, String>()
        for (index in 0 until entries.length) {
            val entry = entries.item(index)
            val name = entry.attributes.getNamedItem("name").nodeValue
            if (!name.startsWith("account_data_") && !name.startsWith("account_deletion_")) continue
            assertNull("Duplicate string $name", result.put(name, entry.textContent))
        }
        return result
    }
}

internal data class AccountDataRequest(val method: String, val path: String, val authorization: String?, val key: String?, val body: String)

internal class AccountDataFixture {
    val user = UserDto("62f3da14-12e9-4575-9541-caf8b98e2dfd", "alex@example.test", "Alex", "Asia/Kolkata", true, 1)
    val token = "synthetic-session-token-with-more-than-32-characters"
    val purgeAfter = "2026-10-09T20:00:00Z"
    val export = AccountExportDto("67ff2331-252d-494e-aaec-3127d57b37f8", "queued", null, accountExportCategories, "2026-10-02T10:00:00Z", null, null, null, true)
    val store = AccountRepositoryTest.MemoryStore().apply { save(Credentials(token, user.id)) }
    val requests = CopyOnWriteArrayList<AccountDataRequest>()
    private val gson = Gson()
    var respond: (Request) -> Pair<Int, String> = ::defaultResponse
    val client = IdentityModule.http().newBuilder().addInterceptor { chain ->
        val request = chain.request()
        val body = Buffer().also { request.body?.writeTo(it) }.readUtf8()
        requests.add(AccountDataRequest(request.method, request.url.encodedPath, request.header("Authorization"), request.header("Idempotency-Key"), body))
        val (status, json) = respond(request)
        okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("Synthetic response")
            .header("ETag", "\"profile-1\"").body(json.toResponseBody("application/json".toMediaType())).build()
    }.build()
    val repository = AccountRepository(IdentityModule.api(client, gson), store, gson)

    fun envelope(value: Any): String = gson.toJson(mapOf("data" to value, "request_id" to "synthetic"))
    fun failure(status: Int, code: String, message: String, details: Map<String, String> = emptyMap()): Pair<Int, String> =
        status to gson.toJson(mapOf("error" to ErrorDto(code, message, details)))

    fun defaultResponse(request: Request): Pair<Int, String> = 200 to envelope(when (request.url.encodedPath) {
        "/v1/me" -> user
        "/v1/me/sessions", "/v1/me/security-events", "/v1/me/exports" -> emptyList<Any>()
        "/v1/timezones" -> listOf("UTC", "Asia/Kolkata")
        "/v1/auth/logout" -> DoneDto("signed_out")
        else -> throw IOException("Unexpected synthetic endpoint")
    })
}