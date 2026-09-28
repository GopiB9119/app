package com.community.platform.feature.scheduling

import android.graphics.Bitmap
import android.os.Build
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.community.platform.MainActivity
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import java.io.File
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ReminderRequestJourneyTest {
    val compose = createAndroidComposeRule<MainActivity>()
    private val localFixture = object : TestRule {
        override fun apply(base: Statement, description: Description) = object : Statement() {
            override fun evaluate() {
                check(Build.HARDWARE in setOf("ranchu", "goldfish")) { "Live synthetic tests require a disposable emulator." }
                check(InstrumentationRegistry.getArguments().getString("community_local_integration") == "true") { "Explicit local integration authorization is required." }
                base.evaluate()
            }
        }
    }
    @get:Rule val rules: TestRule = RuleChain.outerRule(localFixture).around(compose)
    private val http = OkHttpClient.Builder().callTimeout(10, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
    private val password = "Synthetic-Request-83!"
    private data class FixtureAccount(val id: String, val email: String, val token: String)

    private fun payload(vararg values: Pair<String, String?>) = JsonObject().apply { values.forEach { (name, value) -> addProperty(name, value) } }

    private fun api(path: String, token: String? = null, body: JsonObject? = null, expected: Int = 200, key: Boolean = false): JsonObject {
        require(path.startsWith("/v1/") && !path.contains(".."))
        val request = Request.Builder().url("http://10.0.2.2:8000$path")
        if (token != null) request.header("Authorization", "Bearer $token")
        if (key) request.header("Idempotency-Key", UUID.randomUUID().toString())
        if (body != null) request.post(body.toString().toRequestBody("application/json".toMediaType()))
        return http.newCall(request.build()).execute().use { response ->
            assertEquals("Synthetic local API status for $path", expected, response.code)
            JsonParser.parseString(requireNotNull(response.body).string()).asJsonObject
        }
    }

    private fun mail(path: String): JsonObject {
        require(path.startsWith("/api/v1/message"))
        return http.newCall(Request.Builder().url("http://10.0.2.2:8025$path").build()).execute().use { response ->
            assertEquals(200, response.code)
            JsonParser.parseString(requireNotNull(response.body).string()).asJsonObject
        }
    }

    private fun verificationCode(email: String): String = runBlocking {
        withTimeout(20000) {
            var result: String? = null
            while (result == null) {
                val message = mail("/api/v1/messages").getAsJsonArray("messages").firstOrNull { entry ->
                    entry.asJsonObject.get("Subject").asString.contains("registration") && entry.asJsonObject.getAsJsonArray("To").any { it.asJsonObject.get("Address").asString == email }
                }
                if (message != null) {
                    val text = mail("/api/v1/message/${message.asJsonObject.get("ID").asString}").get("Text").asString
                    result = Regex("code is ([0-9]{6})").find(text)?.groupValues?.get(1)
                }
                if (result == null) delay(200)
            }
            requireNotNull(result)
        }
    }

    private fun account(name: String): FixtureAccount {
        val email = "android-request-${UUID.randomUUID()}@example.test"
        val context = UUID.randomUUID().toString() + UUID.randomUUID().toString()
        val challenge = api("/v1/auth/register", body = payload("email" to email, "context_secret" to context), expected = 202, key = true).getAsJsonObject("data")
        val registered = api("/v1/auth/verify-email", body = payload(
            "challenge_id" to challenge.get("challenge_id").asString, "context_secret" to context,
            "code" to verificationCode(email), "password" to password, "display_name" to name,
            "timezone" to "UTC", "platform" to "android", "device_name" to "Synthetic request fixture",
        ), expected = 201).getAsJsonObject("data")
        return FixtureAccount(registered.getAsJsonObject("user").get("id").asString, email, registered.get("session_token").asString)
    }

    private fun waitFor(matcher: SemanticsMatcher) {
        compose.waitUntil(20000) { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun openRequests() {
        waitFor(hasContentDescription("Inbox") or hasTestTag("reminder-tab-REQUESTS"))
        if (compose.onAllNodes(hasContentDescription("Inbox")).fetchSemanticsNodes().isNotEmpty()) {
            waitFor(hasContentDescription("Inbox") and isEnabled())
            compose.onNodeWithContentDescription("Inbox").performClick()
        }
        waitFor(hasTestTag("reminder-tab-REQUESTS") and isEnabled())
        compose.onNodeWithTag("reminder-tab-REQUESTS").performClick()
    }

    @Test fun recipientAcceptsRealRequestAndCancelsPersistedPersonalReminder() {
        val organizer = account("Morgan Organizer")
        val recipient = account("Riley Native Recipient")
        val space = api("/v1/spaces", organizer.token, payload("name" to "Native consent family", "space_type" to "family"), 201, key = true).getAsJsonObject("data")
        val spaceId = space.get("id").asString
        val invitation = api("/v1/spaces/$spaceId/invitations", organizer.token, payload("recipient_account_id" to recipient.id), 201, key = true).getAsJsonObject("data")
        api("/v1/invitations/${invitation.get("id").asString}/accept", recipient.token, JsonObject())
        val task = api("/v1/tasks", organizer.token, payload("space_id" to spaceId, "title" to "Native consent task", "description" to "Synthetic local-only verification", "due_date" to null, "assignee_account_id" to recipient.id), 201, key = true).getAsJsonObject("data")
        val taskId = task.get("id").asString
        val local = LocalDateTime.now(ZoneOffset.UTC).plusDays(1).withSecond(0).withNano(0)
        val preview = api("/v1/reminder-requests/preview", organizer.token, payload("task_id" to taskId, "recipient_account_id" to recipient.id, "local_time" to local.toString(), "timezone" to "UTC")).getAsJsonObject("data")
        val proposal = api("/v1/reminder-requests", organizer.token, payload("preview_token" to preview.getAsJsonArray("options")[0].asJsonObject.get("preview_token").asString), 201, key = true).getAsJsonObject("data")
        val requestId = proposal.get("id").asString
        assertEquals(0, api("/v1/reminders", recipient.token).getAsJsonArray("data").size())
        waitFor(hasTestTag("email") and isEnabled())
        compose.onNodeWithTag("email").performTextInput(recipient.email)
        compose.onNodeWithTag("password").performScrollTo().performTextInput(password)
        compose.onNodeWithTag("primary-action").performScrollTo().performClick()
        openRequests()
        waitFor(hasTestTag("reminder-request-review-$requestId") and isEnabled())
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-request-review-$requestId"))
        compose.onNodeWithTag("reminder-request-review-$requestId").performClick()
        waitFor(hasTestTag("reminder-request-confirm") and isEnabled())
        assertEquals(0, api("/v1/reminders", recipient.token).getAsJsonArray("data").size())
        val image = compose.onNodeWithTag("reminder-request-dialog").captureToImage().asAndroidBitmap()
        val directory = InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("test-evidence")
        File(directory, "reminder-request-native-live.png").outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        compose.onNodeWithTag("reminder-request-confirm").performClick()
        waitFor(hasText("Request accepted."))
        val schedules = api("/v1/reminders", recipient.token).getAsJsonArray("data")
        assertEquals(1, schedules.size())
        val reminder = schedules[0].asJsonObject
        assertEquals(taskId, reminder.get("task_id").asString)
        assertEquals(local.toInstant(ZoneOffset.UTC), Instant.parse(reminder.get("scheduled_at").asString))
        assertEquals("scheduled", reminder.get("status").asString)
        compose.activityRule.scenario.recreate()
        openRequests()
        waitFor(hasText("Accepted"))
        waitFor(hasTestTag("reminder-tab-REMINDERS") and isEnabled())
        compose.onNodeWithTag("reminder-tab-REMINDERS").performClick()
        val reminderId = reminder.get("id").asString
        waitFor(hasTestTag("reminder-cancel-$reminderId") and isEnabled())
        compose.onNodeWithTag("reminder-workspace").performScrollToNode(hasTestTag("reminder-cancel-$reminderId"))
        compose.onNodeWithTag("reminder-cancel-$reminderId").performClick()
        compose.onNodeWithTag("reminder-confirm").performClick()
        waitFor(hasText("Reminder cancelled."))
        val final = api("/v1/reminders", recipient.token).getAsJsonArray("data")
        assertEquals(1, final.size())
        assertEquals("cancelled", final[0].asJsonObject.get("status").asString)
        assertEquals(0, api("/v1/reminders", organizer.token).getAsJsonArray("data").size())
        val sent = api("/v1/reminder-requests?direction=sent", organizer.token).getAsJsonArray("data")[0].asJsonObject
        assertEquals("accepted", sent.get("status").asString)
        assertTrue(sent.get("reminder_id").isJsonNull)
    }
}