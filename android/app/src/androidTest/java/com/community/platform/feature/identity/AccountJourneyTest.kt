package com.community.platform.feature.identity

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
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
import org.junit.runner.RunWith
import java.io.File
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class AccountJourneyTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val http = OkHttpClient.Builder().callTimeout(10, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()

    private fun waitForText(text: String) {
        try {
            compose.waitUntil(20000) { compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }
        } catch (error: ComposeTimeoutException) {
            val notices = compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion)).fetchSemanticsNodes()
                .flatMap { listOf(it) + it.children }
                .flatMap { it.config.getOrNull(SemanticsProperties.Text).orEmpty() }
                .joinToString("; ") { it.text }
            throw AssertionError("Waiting for '$text'. Current status messages: $notices", error)
        }
    }

    private fun waitForEnabled(matcher: SemanticsMatcher) {
        compose.waitUntil(20000) { compose.onAllNodes(matcher and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun codeFor(email: String, purpose: String): String = runBlocking {
        withTimeout(20000) {
            while (true) {
                val list = getJson("http://10.0.2.2:8025/api/v1/messages")
                val message = list.getAsJsonArray("messages").firstOrNull { element ->
                    val value = element.asJsonObject
                    value.get("Subject").asString.contains(purpose) && value.getAsJsonArray("To").any { it.asJsonObject.get("Address").asString == email }
                }
                if (message != null) {
                    val detail = getJson("http://10.0.2.2:8025/api/v1/message/${message.asJsonObject.get("ID").asString}")
                    return@withTimeout Regex("code is ([0-9]{6})").find(detail.get("Text").asString)!!.groupValues[1]
                }
                delay(200)
            }
            error("Unreachable verification state")
        }
    }

    private fun getJson(url: String, token: String? = null): JsonObject = http.newCall(Request.Builder().url(url).apply {
        if (token != null) header("Authorization", "Bearer $token")
    }.build()).execute().use {
        check(it.isSuccessful) { "Synthetic test service unavailable" }
        JsonParser.parseString(it.body!!.string()).asJsonObject
    }

    private fun signedOut() {
        compose.waitUntil(20000) {
            compose.onAllNodesWithText("Welcome back").fetchSemanticsNodes().isNotEmpty() ||
                compose.onAllNodesWithText("Your account").fetchSemanticsNodes().isNotEmpty()
        }
        if (compose.onAllNodesWithText("Your account").fetchSemanticsNodes().isNotEmpty()) {
            waitForEnabled(hasContentDescription("Sign out"))
            compose.onNodeWithContentDescription("Sign out").performScrollTo().performClick()
            compose.onNodeWithText("Confirm").performClick()
        }
        waitForText("Welcome back")
        waitForEnabled(hasTestTag("email"))
    }

    @Test fun nativeAccountJourneyUsesTheRealBackendAndSurvivesRecreation() {
        val email = "android-${UUID.randomUUID()}@example.test"
        val password = "Synthetic-Android-63!"
        signedOut()
        compose.onNodeWithText("Create account").performClick()
        waitForText("Create your account")
        compose.onNodeWithTag("email").performTextInput(email)
        compose.onNodeWithText("Send verification code").performScrollTo().performClick()
        waitForText("Complete your account")
        waitForEnabled(hasTestTag("code"))
        compose.onNodeWithTag("code").performTextInput(codeFor(email, "registration"))
        compose.onNodeWithTag("name").performTextInput("Alex Android")
        compose.onNodeWithTag("password").performScrollTo().performTextInput(password)
        compose.onNodeWithText("Verify and create account").performScrollTo().performClick()
        waitForText("Your account")
        waitForEnabled(hasTestTag("profile-name"))
        compose.onNodeWithTag("profile-name").performScrollTo().performTextReplacement("Alex Native Updated")
        compose.onNodeWithText("Save changes").performScrollTo().performClick()
        waitForText("Profile saved.")
        waitForEnabled(hasTestTag("profile-name"))
        compose.activityRule.scenario.recreate()
        waitForText("Your account")
        waitForEnabled(hasTestTag("profile-name"))
        compose.onNodeWithTag("profile-name").assertTextContains("Alex Native Updated")

        val loginPayload = JsonObject().apply {
            addProperty("email", email); addProperty("password", password)
            addProperty("platform", "web"); addProperty("device_name", "Synthetic web session")
        }
        val login = http.newCall(Request.Builder().url("http://10.0.2.2:8000/v1/auth/login")
            .post(loginPayload.toString().toRequestBody("application/json".toMediaType())).build()).execute().use {
            check(it.isSuccessful)
            JsonParser.parseString(it.body!!.string()).asJsonObject.getAsJsonObject("data")
        }
        compose.onNodeWithContentDescription("Refresh account").performClick()
        waitForText("Synthetic web session")
        waitForEnabled(hasContentDescription("Revoke Synthetic web session session"))
        compose.onNodeWithContentDescription("Revoke Synthetic web session session").performScrollTo().performClick()
        compose.onNodeWithText("Confirm").performClick()
        waitForText("Session access revoked.")
        val denied = http.newCall(Request.Builder().url("http://10.0.2.2:8000/v1/me")
            .header("Authorization", "Bearer ${login.get("session_token").asString}").build()).execute().use { it.code }
        assertEquals(401, denied)

        waitForEnabled(hasContentDescription("Sign out"))
        compose.onNodeWithContentDescription("Sign out").performScrollTo().performClick()
        compose.onNodeWithText("Confirm").performClick()
        waitForText("Welcome back")
        waitForEnabled(hasTestTag("email"))
        compose.onNodeWithText("Forgot your password?").performScrollTo().performClick()
        waitForText("Recover your account")
        compose.onNodeWithTag("email").performTextInput(email)
        compose.onNodeWithText("Send verification code").performScrollTo().performClick()
        waitForText("Choose a new password")
        waitForEnabled(hasTestTag("code"))
        compose.onNodeWithTag("code").performTextInput(codeFor(email, "recovery"))
        val replacement = "Updated-Android-71!"
        compose.onNodeWithTag("password").performScrollTo().performTextInput(replacement)
        compose.onNodeWithText("Change password").performScrollTo().performClick()
        waitForText("Password changed.")
        waitForText("Welcome back")
        waitForEnabled(hasTestTag("email"))
        compose.onNodeWithTag("email").performTextInput(email)
        compose.onNodeWithTag("password").performScrollTo().performTextInput(replacement)
        compose.onNodeWithTag("primary-action").performScrollTo().performClick()
        waitForText("Your account")
        waitForEnabled(hasTestTag("profile-name"))
        compose.onNodeWithTag("profile-name").assertTextContains("Alex Native Updated")
    }

    @Test fun nativeSearchOpensACitedDocumentAndDeletesItWithTheRealBackend() {
        check(android.os.Build.HARDWARE in setOf("ranchu", "goldfish")) { "A disposable emulator is required." }
        check(InstrumentationRegistry.getArguments().getString("community_local_integration") == "true") { "Explicit local integration authorization is required." }
        val owner = account("Documents Owner")
        val member = account("Documents Member")
        val spaceId = postApi("/v1/spaces", payload("name" to "Documents family", "space_type" to "family"), owner.token, UUID.randomUUID().toString())["id"].asString
        val invitation = postApi("/v1/spaces/$spaceId/invitations", payload("recipient_account_id" to member.id), owner.token, UUID.randomUUID().toString())
        postApi("/v1/invitations/${invitation["id"].asString}/accept", JsonObject(), member.token)
        val word = "lantern${System.currentTimeMillis()}"
        val cited = "Bring $word blankets <b>&amp;</b> fruit."
        val documentId = postApi("/v1/spaces/$spaceId/documents", payload("name" to "picnic.md", "content" to "# Picnic\nMeeting notes\n$cited\nPack water.\n"),
            member.token, UUID.randomUUID().toString())["id"].asString

        signIn(member)
        compose.onNodeWithTag("account-search").performScrollTo().performClick()
        waitForEnabled(hasTestTag("search-query"))
        compose.onNodeWithTag("search-query").performTextInput(word)
        compose.onNodeWithTag("search-submit").performScrollTo().performClick()
        waitForText("picnic.md")
        compose.onNodeWithTag("search-document-0").performScrollTo().performClick()
        compose.waitUntil(20000) { compose.onAllNodes(hasTestTag("document-line-3")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("document-line-3").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        compose.onNodeWithText(cited).assertIsDisplayed()
        compose.onNodeWithTag("document-viewer").performScrollToNode(hasTestTag("document-delete"))
        compose.onNodeWithTag("document-delete").performClick()
        compose.onNodeWithTag("document-delete-confirm").performClick()
        waitForText("Document deleted.")
        val gone = http.newCall(Request.Builder().url("http://10.0.2.2:8000/v1/documents/$documentId").header("Authorization", "Bearer ${owner.token}").build())
            .execute().use { it.code }
        assertEquals(404, gone)
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/search?q=$word", owner.token).getAsJsonObject("data").getAsJsonArray("documents").size())
    }

    private data class TestAccount(val email: String, val password: String, val id: String, val token: String)

    private fun payload(vararg values: Pair<String, String>) = JsonObject().apply { values.forEach { addProperty(it.first, it.second) } }

    private fun postApi(route: String, body: JsonObject, token: String? = null, key: String? = null, etag: String? = null): JsonObject {
        val request = Request.Builder().url("http://10.0.2.2:8000$route")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
        if (token != null) request.header("Authorization", "Bearer $token")
        if (key != null) request.header("Idempotency-Key", key)
        if (etag != null) request.header("If-Match", etag)
        return http.newCall(request.build()).execute().use { response ->
            check(response.isSuccessful) { "Synthetic fixture request failed: $route / ${response.code}" }
            JsonParser.parseString(response.body!!.string()).asJsonObject.getAsJsonObject("data")
        }
    }

    private fun account(name: String): TestAccount {
        val email = "native-family-${UUID.randomUUID()}@example.test"
        val password = "Synthetic-Family-83!"
        val secret = UUID.randomUUID().toString().replace("-", "")
        val challenge = postApi("/v1/auth/register", payload("email" to email, "context_secret" to secret), key = UUID.randomUUID().toString())
        val result = postApi("/v1/auth/verify-email", payload(
            "challenge_id" to challenge["challenge_id"].asString, "context_secret" to secret,
            "code" to codeFor(email, "registration"), "password" to password, "display_name" to name,
            "timezone" to "UTC", "platform" to "android", "device_name" to "Synthetic fixture control",
        ))
        return TestAccount(email, password, result.getAsJsonObject("user")["id"].asString, result["session_token"].asString)
    }

    private fun signIn(account: TestAccount) {
        signedOut()
        compose.onNodeWithTag("email").performTextReplacement(account.email)
        compose.onNodeWithTag("password").performScrollTo().performTextReplacement(account.password)
        compose.onNodeWithTag("primary-action").performScrollTo().performClick()
        waitForText("Your account")
        waitForEnabled(hasTestTag("profile-name"))
    }

    private fun reveal(container: String, tag: String) {
        compose.onNodeWithTag(container).performScrollToNode(hasTestTag(tag))
        waitForEnabled(hasTestTag(tag))
        compose.onNodeWithTag(tag).performScrollTo()
    }

    @Test fun nativeMembershipRemovalAndSelfLeaveRevokeRealAccess() {
        check(android.os.Build.HARDWARE in setOf("ranchu", "goldfish")) { "A disposable emulator is required." }
        check(InstrumentationRegistry.getArguments().getString("community_local_integration") == "true") { "Explicit local integration authorization is required." }
        val owner = account("Membership Owner")
        val member = account("Membership Member")
        fun family(name: String): Pair<String, String> {
            val created = postApi("/v1/spaces", payload("name" to name, "space_type" to "family"), owner.token, UUID.randomUUID().toString())
            val spaceId = created["id"].asString
            val invitation = postApi("/v1/spaces/$spaceId/invitations", payload("recipient_account_id" to member.id), owner.token, UUID.randomUUID().toString())
            postApi("/v1/invitations/${invitation["id"].asString}/accept", JsonObject(), member.token)
            return spaceId to invitation["id"].asString
        }
        fun denied(route: String, token: String) {
            val status = http.newCall(Request.Builder().url("http://10.0.2.2:8000$route").header("Authorization", "Bearer $token").build()).execute().use { it.code }
            assertEquals(404, status)
        }
        val (removalSpace, oldInvitation) = family("Native removal family")
        val (leavingSpace, _invitation) = family("Native leaving family")
        val task = postApi("/v1/tasks", payload("space_id" to removalSpace, "title" to "Membership private task", "assignee_account_id" to member.id), owner.token, UUID.randomUUID().toString())
        signIn(owner)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        reveal("space-workspace", "space-row-$removalSpace")
        compose.onNodeWithTag("space-row-$removalSpace").performClick()
        reveal("space-workspace", "space-show-members")
        compose.onNodeWithTag("space-show-members").performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        reveal("space-workspace", "space-remove-${member.id}")
        compose.onNodeWithTag("space-leave").assertDoesNotExist()
        compose.onNodeWithTag("space-remove-${member.id}").performClick()
        compose.onNodeWithTag("membership-review-member").assertTextContains("Membership Member")
        compose.onNodeWithTag("space-action-dismiss").performClick()
        assertEquals(2, getJson("http://10.0.2.2:8000/v1/spaces/$removalSpace/members", member.token).getAsJsonArray("data").size())
        compose.onNodeWithTag("space-remove-${member.id}").performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        waitForText("Member removed.")
        denied("/v1/spaces/$removalSpace/members", member.token)
        denied("/v1/tasks/${task["id"].asString}", member.token)
        val oldReplay = http.newCall(Request.Builder().url("http://10.0.2.2:8000/v1/invitations/$oldInvitation/accept")
            .header("Authorization", "Bearer ${member.token}").post("{}".toRequestBody("application/json".toMediaType())).build()).execute().use { it.code }
        assertEquals(404, oldReplay)
        val retainedTask = getJson("http://10.0.2.2:8000/v1/tasks/${task["id"].asString}", owner.token).getAsJsonObject("data")
        assertTrue(retainedTask["assignee"].isJsonNull)
        assertTrue(retainedTask["assignee_unavailable"].asBoolean)
        waitForEnabled(hasContentDescription("Back to Spaces"))
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.onNodeWithContentDescription("Back to account").performClick()
        signIn(member)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        compose.onNodeWithTag("space-row-$removalSpace").assertDoesNotExist()
        reveal("space-workspace", "space-row-$leavingSpace")
        compose.onNodeWithTag("space-row-$leavingSpace").performClick()
        reveal("space-workspace", "space-show-members")
        compose.onNodeWithTag("space-show-members").performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        reveal("space-workspace", "space-leave")
        compose.onNodeWithTag("space-remove-${owner.id}").assertDoesNotExist()
        compose.onNodeWithTag("space-leave").performClick()
        compose.onNodeWithTag("membership-review-member").assertTextContains("Membership Member")
        compose.onNodeWithTag("space-action-dismiss").performClick()
        assertEquals("member", getJson("http://10.0.2.2:8000/v1/spaces/$leavingSpace", member.token).getAsJsonObject("data")["role"].asString)
        compose.onNodeWithTag("space-leave").performClick()
        val image = compose.onNodeWithTag("space-review-dialog").captureToImage().asAndroidBitmap()
        val evidence = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("test-evidence"), "native-live-membership-review.png")
        evidence.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        compose.onNodeWithTag("space-action-confirm").performClick()
        waitForText("You left the family Space.")
        compose.onNodeWithTag("selected-space-name").assertDoesNotExist()
        compose.onNodeWithTag("space-open-tasks").assertDoesNotExist()
        denied("/v1/spaces/$leavingSpace", member.token)
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/spaces", member.token).getAsJsonArray("data").size())
        val remaining = getJson("http://10.0.2.2:8000/v1/spaces/$leavingSpace/members", owner.token).getAsJsonArray("data")
        assertEquals(1, remaining.size())
        assertEquals(owner.id, remaining.single().asJsonObject["account_id"].asString)
        compose.activityRule.scenario.recreate()
        waitForText("No family Spaces yet.")
        assertTrue(evidence.length() > 1000)
    }

    @Test fun nativeFormerMemberRejoinsThroughNewInvitationWithoutEarlierTasks() {
        check(android.os.Build.HARDWARE in setOf("ranchu", "goldfish")) { "A disposable emulator is required." }
        check(InstrumentationRegistry.getArguments().getString("community_local_integration") == "true") { "Explicit local integration authorization is required." }
        val owner = account("Rejoin Owner")
        val member = account("Returning Member")
        val spaceId = postApi("/v1/spaces", payload("name" to "Native rejoin family", "space_type" to "family"), owner.token, UUID.randomUUID().toString())["id"].asString
        val first = postApi("/v1/spaces/$spaceId/invitations", payload("recipient_account_id" to member.id), owner.token, UUID.randomUUID().toString())["id"].asString
        postApi("/v1/invitations/$first/accept", JsonObject(), member.token)
        val earlier = postApi("/v1/tasks", payload("space_id" to spaceId, "title" to "Earlier native task", "assignee_account_id" to member.id), owner.token, UUID.randomUUID().toString())["id"].asString
        val reviewed = getJson("http://10.0.2.2:8000/v1/spaces/$spaceId/members", owner.token).getAsJsonArray("data")
            .single { it.asJsonObject["account_id"].asString == member.id }.asJsonObject
        postApi("/v1/spaces/$spaceId/members/${member.id}/remove", JsonObject(), owner.token, UUID.randomUUID().toString(), reviewed["etag"].asString)
        fun status(route: String, token: String, viaPost: Boolean = false) = http.newCall(Request.Builder().url("http://10.0.2.2:8000$route")
            .header("Authorization", "Bearer $token").apply { if (viaPost) post("{}".toRequestBody("application/json".toMediaType())) }.build()).execute().use { it.code }
        signIn(owner)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        reveal("space-workspace", "space-row-$spaceId")
        compose.onNodeWithTag("space-row-$spaceId").performClick()
        reveal("space-workspace", "space-recipient")
        compose.onNodeWithTag("space-recipient").performTextReplacement(member.id)
        reveal("space-workspace", "space-invite")
        compose.onNodeWithTag("space-invite").performClick()
        waitForText("Invitation created.")
        val invitationId = getJson("http://10.0.2.2:8000/v1/invitations", member.token).getAsJsonArray("data").single().asJsonObject["id"].asString
        assertEquals(404, status("/v1/spaces/$spaceId", member.token))
        waitForEnabled(hasContentDescription("Back to Spaces"))
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.onNodeWithContentDescription("Back to account").performClick()
        signIn(member)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        compose.onNodeWithTag("space-row-$spaceId").assertDoesNotExist()
        compose.onNodeWithText("Invitations").performClick()
        reveal("space-workspace", "invitation-review-$invitationId")
        compose.onNodeWithTag("invitation-review-$invitationId").performClick()
        compose.onNodeWithTag("invitation-review-name").assertTextContains("Native rejoin family")
        val image = compose.onNodeWithTag("space-review-dialog").captureToImage().asAndroidBitmap()
        val evidence = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("test-evidence"), "native-live-rejoin-review.png")
        evidence.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        compose.onNodeWithTag("space-action-confirm").performClick()
        waitForText("Joined Native rejoin family.")
        assertEquals("member", getJson("http://10.0.2.2:8000/v1/spaces/$spaceId", member.token).getAsJsonObject("data")["role"].asString)
        assertEquals(404, status("/v1/tasks/$earlier", member.token))
        assertEquals(404, status("/v1/invitations/$first/accept", member.token, viaPost = true))
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/tasks?space_id=$spaceId", member.token).getAsJsonArray("data").size())
        reveal("space-workspace", "space-open-tasks")
        compose.onNodeWithTag("space-open-tasks").performClick()
        waitForEnabled(hasTestTag("task-space"))
        compose.onNodeWithTag("task-space").assertTextContains("Native rejoin family")
        waitForText("No tasks found.")
        compose.onNodeWithText("Earlier native task").assertDoesNotExist()
        assertEquals(200, status("/v1/tasks/$earlier", owner.token))
        assertTrue(evidence.length() > 1000)
    }

    @Test fun nativeOwnershipAcceptanceAndFormerOwnerLeavePreserveHistory() {
        check(android.os.Build.HARDWARE in setOf("ranchu", "goldfish")) { "A disposable emulator is required." }
        check(InstrumentationRegistry.getArguments().getString("community_local_integration") == "true") { "Explicit local integration authorization is required." }
        val owner = account("Original Family Owner")
        val nextOwner = account("Incoming Family Owner")
        val family = postApi("/v1/spaces", payload("name" to "Native ownership family", "space_type" to "family"), owner.token, UUID.randomUUID().toString())
        val spaceId = family["id"].asString
        val oldTask = postApi("/v1/tasks", payload("space_id" to spaceId, "title" to "Earlier private task", "assignee_account_id" to owner.id), owner.token, UUID.randomUUID().toString())
        val invitation = postApi("/v1/spaces/$spaceId/invitations", payload("recipient_account_id" to nextOwner.id), owner.token, UUID.randomUUID().toString())
        postApi("/v1/invitations/${invitation["id"].asString}/accept", JsonObject(), nextOwner.token)
        val reviewedMember = getJson("http://10.0.2.2:8000/v1/spaces/$spaceId/members", owner.token).getAsJsonArray("data")
            .single { it.asJsonObject["account_id"].asString == nextOwner.id }.asJsonObject
        val transfer = postApi("/v1/spaces/$spaceId/ownership-transfers", payload("recipient_account_id" to nextOwner.id), owner.token,
            UUID.randomUUID().toString(), reviewedMember["etag"].asString)
        val identifier = transfer["id"].asString
        signIn(nextOwner)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        reveal("space-workspace", "space-row-$spaceId")
        compose.onNodeWithTag("space-row-$spaceId").performClick()
        reveal("space-workspace", "space-show-members")
        compose.onNodeWithTag("space-show-members").performClick()
        reveal("space-workspace", "ownership-review-$identifier")
        compose.onNodeWithTag("ownership-cancel-$identifier").assertDoesNotExist()
        compose.onNodeWithTag("ownership-review-$identifier").performClick()
        compose.onNodeWithTag("ownership-review-account").performScrollTo().assertTextContains(nextOwner.id)
        assertEquals("member", getJson("http://10.0.2.2:8000/v1/spaces/$spaceId", nextOwner.token).getAsJsonObject("data")["role"].asString)
        compose.onNodeWithTag("space-action-dismiss").performClick()
        compose.onNodeWithTag("ownership-review-$identifier").performScrollTo().performClick()
        val image = compose.onNodeWithTag("space-review-dialog").captureToImage().asAndroidBitmap()
        val evidence = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("test-evidence"), "ownership-native-live.png")
        evidence.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        compose.onNodeWithTag("space-action-confirm").performClick()
        waitForText("Ownership offer accepted.")
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        val roster = getJson("http://10.0.2.2:8000/v1/spaces/$spaceId/members", nextOwner.token).getAsJsonArray("data")
        assertEquals(listOf(nextOwner.id), roster.filter { it.asJsonObject["role"].asString == "owner" }.map { it.asJsonObject["account_id"].asString })
        val deniedHistory = http.newCall(Request.Builder().url("http://10.0.2.2:8000/v1/tasks/${oldTask["id"].asString}")
            .header("Authorization", "Bearer ${nextOwner.token}").build()).execute().use { it.code }
        assertEquals(404, deniedHistory)
        compose.activityRule.scenario.recreate()
        compose.waitUntil(20000) {
            compose.onAllNodes(hasTestTag("account-spaces") or hasTestTag("space-show-members")).fetchSemanticsNodes().isNotEmpty()
        }
        if (compose.onAllNodes(hasTestTag("account-spaces")).fetchSemanticsNodes().isNotEmpty()) {
            waitForEnabled(hasTestTag("account-spaces"))
            compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
            waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
            reveal("space-workspace", "space-row-$spaceId")
            compose.onNodeWithTag("space-row-$spaceId").performClick()
        }
        reveal("space-workspace", "space-show-members")
        compose.onNodeWithTag("space-show-members").performClick()
        reveal("space-workspace", "ownership-offer-${owner.id}")
        compose.onNodeWithTag("space-leave").assertDoesNotExist()
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.onNodeWithContentDescription("Back to account").performClick()
        signIn(owner)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        reveal("space-workspace", "space-row-$spaceId")
        compose.onNodeWithTag("space-row-$spaceId").performClick()
        reveal("space-workspace", "space-show-members")
        compose.onNodeWithTag("space-show-members").performClick()
        reveal("space-workspace", "space-leave")
        compose.onNodeWithTag("ownership-offer-${nextOwner.id}").assertDoesNotExist()
        compose.onNodeWithTag("space-leave").performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        waitForText("You left the family Space.")
        val remaining = getJson("http://10.0.2.2:8000/v1/spaces/$spaceId/members", nextOwner.token).getAsJsonArray("data")
        assertEquals(1, remaining.size())
        assertEquals(nextOwner.id, remaining.single().asJsonObject["account_id"].asString)
        assertEquals("owner", remaining.single().asJsonObject["role"].asString)
        assertTrue(evidence.length() > 1000)
    }

    @Test fun nativeFamilyTaskAndReminderUseRealServicesAcrossAccounts() {
        val owner = account("Native Owner")
        val member = account("Native Member")
        signIn(owner)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        reveal("space-workspace", "space-start-create")
        compose.onNodeWithTag("space-start-create").performClick()
        compose.onNodeWithTag("space-name").performTextReplacement("Native live family")
        reveal("space-workspace", "space-create")
        compose.onNodeWithTag("space-create").performClick()
        waitForText("Family Space saved.")
        val space = getJson("http://10.0.2.2:8000/v1/spaces", owner.token).getAsJsonArray("data").single().asJsonObject
        val spaceId = space["id"].asString
        assertEquals("owner", space["role"].asString)
        reveal("space-workspace", "space-recipient")
        compose.onNodeWithTag("space-recipient").performTextReplacement(member.id)
        reveal("space-workspace", "space-invite")
        compose.onNodeWithTag("space-invite").performClick()
        waitForText("Invitation created.")
        val invitation = getJson("http://10.0.2.2:8000/v1/invitations", member.token).getAsJsonArray("data").single().asJsonObject
        val invitationId = invitation["id"].asString
        assertEquals(member.id, invitation["recipient_account_id"].asString)
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/spaces", member.token).getAsJsonArray("data").size())
        waitForEnabled(hasContentDescription("Back to Spaces"))
        compose.onNodeWithContentDescription("Back to Spaces").performClick()
        compose.onNodeWithContentDescription("Back to account").performClick()
        signIn(member)
        compose.onNodeWithTag("account-spaces").performScrollTo().performClick()
        waitForEnabled(hasContentDescription("Refresh Spaces and invitations"))
        compose.onNodeWithText("Invitations").performClick()
        reveal("space-workspace", "invitation-review-$invitationId")
        compose.onNodeWithTag("invitation-review-$invitationId").performClick()
        compose.onNodeWithTag("invitation-review-name").assertTextContains("Native live family")
        compose.onNodeWithTag("space-action-dismiss").performClick()
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/spaces", member.token).getAsJsonArray("data").size())
        compose.onNodeWithTag("invitation-review-$invitationId").performClick()
        compose.onNodeWithTag("space-action-confirm").performClick()
        waitForText("Joined Native live family.")
        val joined = getJson("http://10.0.2.2:8000/v1/spaces/$spaceId", member.token).getAsJsonObject("data")
        assertEquals("member", joined["role"].asString)
        reveal("space-workspace", "space-open-tasks")
        compose.onNodeWithTag("space-open-tasks").performClick()
        waitForEnabled(hasTestTag("task-space"))
        compose.onNodeWithTag("task-space").assertTextContains("Native live family")
        compose.onNodeWithText("New task").performScrollTo().performClick()
        reveal("task-workspace", "task-title")
        compose.onNodeWithTag("task-title").performTextReplacement("Native groceries")
        reveal("task-workspace", "task-notes")
        compose.onNodeWithTag("task-notes").performTextReplacement("Synthetic native task and reminder journey")
        reveal("task-workspace", "task-assignee")
        compose.onNodeWithTag("task-assignee").performClick()
        compose.onNodeWithText(member.id).performScrollTo().performClick()
        reveal("task-workspace", "task-save")
        compose.onNodeWithTag("task-save").performClick()
        waitForText("Task saved.")
        val task = getJson("http://10.0.2.2:8000/v1/tasks?space_id=$spaceId", owner.token).getAsJsonArray("data").single().asJsonObject
        val taskId = task["id"].asString
        assertEquals("Native groceries", task["title"].asString)
        assertEquals(member.id, task.getAsJsonObject("assignee")["account_id"].asString)
        compose.onNodeWithTag("task-workspace").performScrollToNode(hasText("Remind me"))
        compose.onNodeWithText("Remind me").performScrollTo().performClick()
        waitForEnabled(hasTestTag("reminder-date"))
        val due = Instant.ofEpochSecond(((Instant.now().epochSecond + 90 + 59) / 60) * 60).atZone(ZoneOffset.UTC)
        compose.onNodeWithTag("reminder-date").performClick()
        compose.onNodeWithText(due.format(DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy", Locale.US)), substring = true).performClick()
        compose.onNodeWithTag("reminder-date-confirm").performClick()
        compose.onNodeWithTag("reminder-time").performClick()
        compose.onAllNodes(hasSetTextAction())[0].performTextReplacement(due.format(DateTimeFormatter.ofPattern("HH", Locale.ROOT)))
        compose.onAllNodes(hasSetTextAction())[1].performTextReplacement(due.format(DateTimeFormatter.ofPattern("mm", Locale.ROOT)))
        compose.onNodeWithTag("reminder-time-confirm").performClick()
        compose.onNodeWithTag("reminder-zone").assertTextContains("UTC")
        reveal("reminder-workspace", "reminder-preview")
        compose.onNodeWithTag("reminder-preview").performClick()
        waitForText("Review reminder")
        compose.onNodeWithText("Native Member (you)").assertIsDisplayed()
        reveal("reminder-workspace", "reminder-save")
        compose.onNodeWithTag("reminder-save").performClick()
        waitForText("Reminder saved.")
        val reminder = getJson("http://10.0.2.2:8000/v1/reminders?task_id=$taskId", member.token).getAsJsonArray("data").single().asJsonObject
        val reminderId = reminder["id"].asString
        assertEquals(due.toInstant(), Instant.parse(reminder["scheduled_at"].asString))
        assertEquals("scheduled", reminder["status"].asString)
        compose.activityRule.scenario.recreate()
        waitForEnabled(hasContentDescription("Refresh reminders and inbox"))
        compose.onNodeWithTag("reminder-tab-INBOX").performClick()
        val notification = runBlocking {
            withTimeout(180000) {
                var available: JsonObject? = null
                while (available == null) {
                    available = getJson("http://10.0.2.2:8000/v1/notifications", member.token).getAsJsonArray("data")
                        .map { it.asJsonObject }.firstOrNull { it["reminder_id"].asString == reminderId }
                    if (available == null) delay(1000)
                }
                available
            }
        }
        val notificationId = notification["id"].asString
        assertTrue(notification["read_at"].isJsonNull)
        assertTrue(notification["acknowledged_at"].isJsonNull)
        waitForEnabled(hasContentDescription("Refresh reminders and inbox"))
        compose.onNodeWithContentDescription("Refresh reminders and inbox").performClick()
        waitForText("Native groceries")
        reveal("reminder-workspace", "notification-ack-$notificationId")
        compose.onNodeWithTag("notification-ack-$notificationId").performClick()
        compose.onNodeWithTag("reminder-dismiss").performClick()
        assertTrue(getJson("http://10.0.2.2:8000/v1/notifications", member.token).getAsJsonArray("data").single().asJsonObject["acknowledged_at"].isJsonNull)
        compose.onNodeWithTag("notification-ack-$notificationId").performClick()
        compose.onNodeWithTag("reminder-confirm").performClick()
        waitForText("Reminder acknowledged.")
        val acknowledged = getJson("http://10.0.2.2:8000/v1/notifications", member.token).getAsJsonArray("data").single().asJsonObject
        assertTrue(!acknowledged["acknowledged_at"].isJsonNull)
        assertTrue(acknowledged["read_at"].isJsonNull)
        reveal("reminder-workspace", "notification-read-$notificationId")
        compose.onNodeWithTag("notification-read-$notificationId").performClick()
        waitForText("Read")
        val persisted = getJson("http://10.0.2.2:8000/v1/notifications", member.token).getAsJsonArray("data").single().asJsonObject
        assertTrue(!persisted["read_at"].isJsonNull)
        assertEquals(acknowledged["acknowledged_at"], persisted["acknowledged_at"])
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/notifications", owner.token).getAsJsonArray("data").size())
        assertEquals("open", getJson("http://10.0.2.2:8000/v1/tasks/$taskId", member.token).getAsJsonObject("data")["status"].asString)
        val image = compose.onRoot().captureToImage().asAndroidBitmap()
        val evidence = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("test-evidence"), "native-live-reminder-inbox.png")
        evidence.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(evidence.length() > 1000)
    }

    @Test fun nativeAgentActsOnlyAfterApprovalAndDeletesAMemoryWithTheRealBackend() {
        check(android.os.Build.HARDWARE in setOf("ranchu", "goldfish")) { "A disposable emulator is required." }
        check(InstrumentationRegistry.getArguments().getString("community_local_integration") == "true") { "Explicit local integration authorization is required." }
        val owner = account("Agent Owner")
        val spaceName = "Agent family ${System.currentTimeMillis()}"
        val spaceId = postApi("/v1/spaces", payload("name" to spaceName, "space_type" to "family"), owner.token, UUID.randomUUID().toString())["id"].asString
        fun newest() = getJson("http://10.0.2.2:8000/v1/agent-runs?space_id=$spaceId", owner.token).getAsJsonArray("data").first().asJsonObject
        fun tasks() = getJson("http://10.0.2.2:8000/v1/tasks?space_id=$spaceId", owner.token).getAsJsonArray("data")
        // The field keeps the typed request until the service confirms it, then empties; only then is the request listed.
        fun ask(message: String): JsonObject {
            reveal("agent-content", "agent-message")
            compose.onNodeWithTag("agent-message").performTextInput(message)
            compose.onNodeWithTag("agent-ask").performScrollTo().performClick()
            compose.waitUntil(20000) { compose.onAllNodes(hasTestTag("agent-message") and hasText(message)).fetchSemanticsNodes().isEmpty() }
            return newest().also { assertEquals(message, it["message"].asString) }
        }

        signIn(owner)
        compose.onNodeWithTag("account-agent").performScrollTo().performClick()
        waitForEnabled(hasTestTag("agent-message"))
        compose.onNodeWithTag("agent-space").assertTextContains(spaceName)

        val task = ask("Add a task to water the plants tomorrow")
        assertEquals("waiting_for_approval", task["status"].asString)
        assertEquals(0, tasks().size())
        reveal("agent-content", "agent-approve-${task["id"].asString}")
        compose.onNodeWithTag("agent-approve-${task["id"].asString}").performClick()
        waitForText("Done. Created \u201cWater the plants\u201d.")
        val created = tasks().single().asJsonObject
        assertEquals("Water the plants", created["title"].asString)

        val reminder = ask("Remind me about water the plants")["id"].asString
        waitForText("What time should I remind you?")
        reveal("agent-content", "agent-reply-$reminder")
        compose.onNodeWithTag("agent-reply-$reminder").performTextInput("6 pm")
        reveal("agent-content", "agent-answer-$reminder")
        compose.onNodeWithTag("agent-answer-$reminder").performClick()
        waitForText("Needs your approval")
        reveal("agent-content", "agent-reject-$reminder")
        compose.onNodeWithTag("agent-reject-$reminder").performClick()
        waitForText("Okay. Nothing was changed.")
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/reminders?task_id=${created["id"].asString}", owner.token).getAsJsonArray("data").size())

        val note = ask("Remember that the spare key is under the blue pot")["id"].asString
        reveal("agent-content", "agent-approve-$note")
        compose.onNodeWithTag("agent-approve-$note").performClick()
        waitForText("Done. I'll remember that.")
        val image = compose.onRoot().captureToImage().asAndroidBitmap()
        val evidence = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("test-evidence"), "agent-native-live.png")
        evidence.outputStream().use { assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        assertTrue(evidence.length() > 1000)

        // The view chips sit at the top of the list and are not composed while a lower request card is on screen.
        reveal("agent-content", "agent-show-memories")
        compose.onNodeWithTag("agent-show-memories").performClick()
        val remove = hasContentDescription("Delete memory: The spare key is under the blue pot")
        compose.waitUntil(20000) { compose.onAllNodes(remove and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(remove).performClick()
        compose.onNodeWithTag("agent-forget-dialog-confirm").performClick()
        waitForText("Nothing saved.")
        assertEquals(0, getJson("http://10.0.2.2:8000/v1/agent-memories", owner.token).getAsJsonArray("data").size())
        assertEquals(1, tasks().size())
    }
}