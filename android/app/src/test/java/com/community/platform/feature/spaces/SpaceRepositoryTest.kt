package com.community.platform.feature.spaces

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.AccountRepositoryTest
import com.community.platform.feature.identity.Credentials
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.identity.UserDto
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.UUID

class SpaceRepositoryTest {
    private val fixture = Fixture()

    @Test fun boundedPagesRetainOpaqueCursorAndCurrentRole() = runBlocking {
        fixture.api.pagination = PaginationDto("opaque-next-page", true)
        val page = fixture.repository.spaces(fixture.accountId, "previous-page")
        assertEquals("opaque-next-page", page.nextCursor)
        assertEquals("owner", page.items.single().role)
        assertEquals("previous-page", fixture.api.cursor)
        assertEquals(20, fixture.api.limit)
        assertEquals("Bearer ${fixture.token}", fixture.api.authorization)
    }

    @Test fun accountMismatchAndMissingSessionCannotReachTheSpaceApi() = runBlocking {
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.inbox(UUID.randomUUID().toString()) } }
        fixture.store.clear()
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.spaces(fixture.accountId) } }
        assertEquals(0, fixture.api.calls)
    }

    @Test fun uncertainCreationRetriesTheSameKeyAndNameOnlyWhenAsked() = runBlocking {
        val command = SpaceCommand.Create(fixture.accountId, "Morgan family", UUID.randomUUID().toString())
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(command) } }
        assertEquals(1, fixture.api.calls)
        fixture.api.failure = 0
        fixture.repository.execute(command)
        assertEquals(listOf(command.requestKey, command.requestKey), fixture.api.keys)
        assertEquals(listOf(CreateFamilySpaceDto(command.name), CreateFamilySpaceDto(command.name)), fixture.api.creations)
    }

    @Test fun invitationRetryPreservesRecipientAndReturnsActualTerminalState() = runBlocking {
        val command = SpaceCommand.Invite(fixture.accountId, fixture.spaceId, fixture.recipientId, UUID.randomUUID().toString())
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(command) } }
        fixture.api.failure = 0
        fixture.api.invitation = fixture.invitation.copy(status = "accepted")
        val result = fixture.repository.execute(command) as SpaceCommandResult.InvitationSaved
        assertEquals("accepted", result.invitation.status)
        assertEquals(listOf(command.requestKey, command.requestKey), fixture.api.keys)
        assertEquals(listOf(fixture.recipientId, fixture.recipientId), fixture.api.recipients)
    }

    @Test fun inboxRejectsAnotherRecipientsInvitationAndSentPageRejectsWrongSpace(): Unit = runBlocking {
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.inbox(fixture.accountId) } }
        fixture.api.invitation = fixture.invitation.copy(spaceId = UUID.randomUUID().toString())
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.sent(fixture.accountId, fixture.spaceId) } }
    }

    @Test fun acceptAndDeclineRequireTheIntendedAccountBeforeAnyRequest(): Unit = runBlocking {
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(SpaceCommand.Accept(fixture.accountId, fixture.invitation)) } }
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(SpaceCommand.Decline(fixture.accountId, fixture.invitation)) } }
        assertEquals(0, fixture.api.calls)
    }

    @Test fun acceptanceCannotDisplayAnUnrelatedSpace(): Unit = runBlocking {
        val intended = fixture.invitation.copy(recipientAccountId = fixture.accountId)
        fixture.api.space = fixture.space.copy(id = UUID.randomUUID().toString())
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(SpaceCommand.Accept(fixture.accountId, intended)) } }
    }

    @Test fun invitationOutcomeMustMatchTheRequestedIdentityAndAction(): Unit = runBlocking {
        fixture.api.outcome = InvitationOutcomeDto(UUID.randomUUID().toString(), "revoked")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(SpaceCommand.Revoke(fixture.accountId, fixture.invitation)) } }
        fixture.api.outcome = InvitationOutcomeDto(fixture.invitationId, "declined")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(SpaceCommand.Revoke(fixture.accountId, fixture.invitation)) } }
    }

    @Test fun invalidScopeRoleExpiryAndPaginationAreRejected(): Unit = runBlocking {
        fixture.api.space = fixture.space.copy(visibility = "public")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.spaces(fixture.accountId) } }
        fixture.api.space = fixture.space
        fixture.api.pagination = PaginationDto(null, true)
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.spaces(fixture.accountId) } }
        fixture.api.pagination = PaginationDto(null, false)
        fixture.api.invitation = fixture.invitation.copy(role = "owner")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.sent(fixture.accountId, fixture.spaceId) } }
        fixture.api.invitation = fixture.invitation.copy(expiresAt = fixture.invitation.createdAt)
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.sent(fixture.accountId, fixture.spaceId) } }
    }

    @Test fun unauthorizedResponseRevokesLocalSessionButAnOutageDoesNot() = runBlocking {
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.spaces(fixture.accountId) } }
        assertEquals(fixture.accountId, fixture.store.load()?.accountId)
        fixture.api.failure = 401
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.spaces(fixture.accountId) } }
        assertNull(fixture.store.load())
    }

    @Test fun actualRetrofitInvitationWireHasOnlyRecipientAndUsesOriginalKey() = runBlocking {
        var route = ""
        var payload = ""
        var key: String? = null
        var authorization: String? = null
        val http = OkHttpClient.Builder().addInterceptor { chain ->
            route = chain.request().url.encodedPath
            key = chain.request().header("Idempotency-Key")
            authorization = chain.request().header("Authorization")
            val buffer = Buffer()
            chain.request().body!!.writeTo(buffer)
            payload = buffer.readUtf8()
            okhttp3.Response.Builder().request(chain.request()).code(201).message("Synthetic")
                .protocol(Protocol.HTTP_1_1)
                .body(Gson().toJson(EnvelopeDto(fixture.invitation, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val api = Retrofit.Builder().baseUrl("https://offline.invalid/").client(http).addConverterFactory(GsonConverterFactory.create(Gson())).build().create(SpaceApi::class.java)
        val repository = SpaceRepository(api, fixture.accounts)
        val command = SpaceCommand.Invite(fixture.accountId, fixture.spaceId, fixture.recipientId, UUID.randomUUID().toString())
        repository.execute(command)
        val body = JsonParser.parseString(payload).asJsonObject
        assertEquals(setOf("recipient_account_id"), body.keySet())
        assertEquals(fixture.recipientId, body["recipient_account_id"].asString)
        assertEquals("/v1/spaces/${fixture.spaceId}/invitations", route)
        assertEquals(command.requestKey, key)
        assertEquals("Bearer ${fixture.token}", authorization)
        assertTrue(!body.has("role"))
    }

    @Test fun pagesCannotReturnTheCursorTheyWereRequestedWith(): Unit = runBlocking {
        fixture.api.pagination = PaginationDto("same-page", true)
        val spaces = assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.spaces(fixture.accountId, "same-page") } }
        assertEquals("INVALID_RESPONSE", spaces.code)
        val sent = assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.sent(fixture.accountId, fixture.spaceId, "same-page") } }
        assertEquals("INVALID_RESPONSE", sent.code)
        fixture.api.invitation = fixture.invitation.copy(recipientAccountId = fixture.accountId)
        val inbox = assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.inbox(fixture.accountId, "same-page") } }
        assertEquals("INVALID_RESPONSE", inbox.code)
    }

    @Test fun membershipRosterRejectsMissingSelfDuplicateIdentityAndInventedAuthority(): Unit = runBlocking {
        val own = fixture.ownerMember
        val member = fixture.otherMember
        assertEquals(listOf(own, member), fixture.repository.members(fixture.accountId, fixture.spaceId))
        for (invalidRoster in listOf(emptyList(), listOf(member), listOf(own, own), listOf(own, member.copy(role = "owner")), listOf(own.copy(etag = "*")), listOf(own.copy(role = "administrator")))) {
            fixture.api.roster = invalidRoster
            val error = assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.members(fixture.accountId, fixture.spaceId) } }
            assertEquals("INVALID_RESPONSE", error.code)
        }
    }

    @Test fun membershipRetryKeepsTargetKeyAndPreconditionWithoutAutomaticReplay(): Unit = runBlocking {
        val intent = MembershipIntent(fixture.accountId, fixture.spaceId, fixture.recipientId, MembershipAction.REMOVE, fixture.otherMember.etag, UUID.randomUUID().toString())
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.endMembership(intent) } }
        assertEquals(1, fixture.api.membershipCommands.size)
        fixture.api.failure = 0
        assertEquals(fixture.recipientId, fixture.repository.endMembership(intent).accountId)
        assertEquals(listOf(intent, intent), fixture.api.membershipCommands)
        assertEquals(2, fixture.api.calls)
    }

    @Test fun membershipResultMustMatchScopeAndLeavingCannotTargetSomeoneElse(): Unit = runBlocking {
        val intent = MembershipIntent(fixture.accountId, fixture.spaceId, fixture.recipientId, MembershipAction.LEAVE, fixture.otherMember.etag, UUID.randomUUID().toString())
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.endMembership(intent) } }
        assertEquals(0, fixture.api.calls)
        fixture.api.membershipOutcome = MembershipOutcomeDto(fixture.spaceId, fixture.accountId, "removed")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.endMembership(intent.copy(action = MembershipAction.REMOVE)) } }
        fixture.api.membershipOutcome = MembershipOutcomeDto(UUID.randomUUID().toString(), fixture.recipientId, "removed")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.endMembership(intent.copy(action = MembershipAction.REMOVE)) } }
        fixture.api.membershipOutcome = MembershipOutcomeDto(fixture.spaceId, fixture.recipientId, "active")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.endMembership(intent.copy(action = MembershipAction.REMOVE)) } }
    }

    @Test fun actualMembershipTransportSendsReviewedHeadersAndNoAuthorityBody(): Unit = runBlocking {
        val captured = mutableListOf<Triple<String, Map<String, String?>, String>>()
        val http = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            val buffer = Buffer()
            request.body!!.writeTo(buffer)
            captured.add(Triple(request.url.encodedPath, mapOf("key" to request.header("Idempotency-Key"), "etag" to request.header("If-Match"), "authorization" to request.header("Authorization")), buffer.readUtf8()))
            val target = if (request.url.encodedPath.endsWith("/leave")) fixture.accountId else fixture.recipientId
            okhttp3.Response.Builder().request(request).code(200).message("Synthetic").protocol(Protocol.HTTP_1_1)
                .body(Gson().toJson(EnvelopeDto(MembershipOutcomeDto(fixture.spaceId, target, "removed"), null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val api = Retrofit.Builder().baseUrl("https://offline.invalid/").client(http).addConverterFactory(GsonConverterFactory.create(Gson())).build().create(SpaceApi::class.java)
        val repository = SpaceRepository(api, fixture.accounts)
        val intent = MembershipIntent(fixture.accountId, fixture.spaceId, fixture.recipientId, MembershipAction.REMOVE, fixture.otherMember.etag, UUID.randomUUID().toString())
        repository.endMembership(intent)
        repository.endMembership(intent.copy(action = MembershipAction.LEAVE, targetId = fixture.accountId))
        assertEquals(listOf("/v1/spaces/${fixture.spaceId}/members/${fixture.recipientId}/remove", "/v1/spaces/${fixture.spaceId}/leave"), captured.map { it.first })
        captured.forEach { (_, headers, body) ->
            assertEquals("{}", body)
            assertEquals(intent.requestKey, headers["key"])
            assertEquals(intent.etag, headers["etag"])
            assertEquals("Bearer ${fixture.token}", headers["authorization"])
        }
    }

    @Test fun ownershipOfferRetainsReviewedRecipientKeyAndEtag(): Unit = runBlocking {
        val command = SpaceCommand.OfferOwnership(fixture.accountId, fixture.space, fixture.otherMember, UUID.randomUUID().toString())
        fixture.api.failure = 503
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(command) } }
        fixture.api.failure = 0
        val result = fixture.repository.execute(command) as SpaceCommandResult.OwnershipSaved
        assertEquals(fixture.recipientId, result.transfer.toAccountId)
        assertEquals(listOf(command.requestKey, command.requestKey), fixture.api.ownershipKeys)
        assertEquals(listOf(command.member.etag, command.member.etag), fixture.api.ownershipEtags)
    }

    @Test fun ownershipCommandsRejectWrongPartiesAndResponses(): Unit = runBlocking {
        val response = SpaceCommand.RespondOwnership(fixture.accountId, fixture.transfer, OwnershipResponse.ACCEPT)
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(response) } }
        assertEquals(0, fixture.api.calls)
        val offer = SpaceCommand.OfferOwnership(fixture.accountId, fixture.space, fixture.otherMember, UUID.randomUUID().toString())
        fixture.api.transfer = fixture.transfer.copy(toAccountId = fixture.spaceId)
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(offer) } }
        fixture.api.transfer = fixture.transfer.copy(status = "accepted")
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.execute(offer) } }
    }

    @Test fun ownershipPagesCheckAudienceScopeAndRepeatedCursors(): Unit = runBlocking {
        fixture.api.transfers = listOf(fixture.transfer)
        assertEquals(fixture.transfer, fixture.repository.ownershipOffers(fixture.accountId, fixture.spaceId).items.single())
        fixture.api.transfers = listOf(fixture.transfer.copy(fromAccountId = fixture.invitationId))
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.ownershipOffers(fixture.accountId, fixture.spaceId) } }
        fixture.api.transfers = listOf(fixture.transfer)
        fixture.api.pagination = PaginationDto("same", true)
        assertThrows(IdentityFailure::class.java) { runBlocking { fixture.repository.ownershipOffers(fixture.accountId, fixture.spaceId, "same") } }
    }

    @Test fun actualOwnershipTransportKeepsExactHeadersAndNeverSendsRoleFlags(): Unit = runBlocking {
        val requests = mutableListOf<okhttp3.Request>()
        val bodies = mutableListOf<String>()
        val incoming = fixture.transfer.copy(fromAccountId = fixture.recipientId, toAccountId = fixture.accountId)
        val http = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            requests.add(request)
            val buffer = Buffer(); request.body!!.writeTo(buffer); bodies.add(buffer.readUtf8())
            val result = if (request.url.encodedPath.endsWith("/accept")) incoming.copy(status = "accepted", resolvedAt = "2026-09-23T10:01:00Z", version = "2") else fixture.transfer
            okhttp3.Response.Builder().request(request).code(200).message("Synthetic").protocol(Protocol.HTTP_1_1)
                .body(Gson().toJson(EnvelopeDto(result, null)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        val api = Retrofit.Builder().baseUrl("https://offline.invalid/").client(http).addConverterFactory(GsonConverterFactory.create(Gson())).build().create(SpaceApi::class.java)
        val repository = SpaceRepository(api, fixture.accounts)
        val offer = SpaceCommand.OfferOwnership(fixture.accountId, fixture.space, fixture.otherMember, UUID.randomUUID().toString())
        repository.execute(offer)
        repository.execute(SpaceCommand.RespondOwnership(fixture.accountId, incoming, OwnershipResponse.ACCEPT))
        assertEquals(offer.requestKey, requests[0].header("Idempotency-Key"))
        assertEquals(fixture.otherMember.etag, requests[0].header("If-Match"))
        assertEquals(setOf("recipient_account_id"), JsonParser.parseString(bodies[0]).asJsonObject.keySet())
        assertEquals(fixture.recipientId, JsonParser.parseString(bodies[0]).asJsonObject["recipient_account_id"].asString)
        assertEquals("{}", bodies[1])
        assertEquals(incoming.etag, requests[1].header("If-Match"))
        assertEquals("/v1/spaces/${fixture.spaceId}/ownership-transfers/${incoming.id}/accept", requests[1].url.encodedPath)
    }

    class Fixture {
        val accountId = "62f3da14-12e9-4575-9541-caf8b98e2dfd"
        val recipientId = "0f97b948-9800-432f-9d15-407df739d08e"
        val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
        val invitationId = "81a09cbf-901e-470c-a905-27d565be91ae"
        val token = "synthetic-session-token-with-more-than-32-characters"
        val user = UserDto(accountId, "alex@example.test", "Alex", "UTC", true, 1)
        val store = AccountRepositoryTest.MemoryStore().apply { save(Credentials(token, accountId)) }
        val accounts = AccountRepository(AccountRepositoryTest.FakeApi(user, token), store, Gson())
        val space = SpaceDto(spaceId, "Morgan family", "family", "private", "active", "owner", "1", "2026-09-19T10:00:00Z")
        val invitation = SpaceInvitationDto(invitationId, spaceId, space.name, "Alex Example", recipientId, "member", "pending", "2026-09-19T10:00:00Z", "2026-09-22T10:00:00Z")
        val ownerMember = SpaceMemberDto(accountId, "Alex", "owner", space.createdAt, "\"owner-admission\"")
        val otherMember = SpaceMemberDto(recipientId, "Sam", "member", space.createdAt, "\"member-admission\"")
        val transfer = OwnershipTransferDto(invitationId, spaceId, space.name, accountId, "Alex", recipientId, "Sam", "pending", "2026-09-23T10:00:00Z", "2026-09-23T10:15:00Z", null, "1", "\"ownership-1\"")
        val api = FakeApi(space, invitation).apply { roster = listOf(ownerMember, otherMember); actorId = accountId; transfer = this@Fixture.transfer }
        val repository = SpaceRepository(api, accounts)
    }

    class FakeApi(var space: SpaceDto, var invitation: SpaceInvitationDto) : SpaceApi {
        var failure = 0
        var calls = 0
        var limit = 0
        var cursor: String? = null
        var authorization = ""
        var pagination: PaginationDto? = PaginationDto(null, false)
        var listedSpaces: List<SpaceDto>? = null
        var outcome: InvitationOutcomeDto? = null
        var roster: List<SpaceMemberDto> = emptyList()
        var actorId: String = ""
        var membershipOutcome: MembershipOutcomeDto? = null
        val membershipCommands = mutableListOf<MembershipIntent>()
        var transfer: OwnershipTransferDto? = null
        var transfers: List<OwnershipTransferDto> = emptyList()
        val ownershipKeys = mutableListOf<String>()
        val ownershipEtags = mutableListOf<String>()
        val ownershipResponses = mutableListOf<OwnershipResponse>()
        val keys = mutableListOf<String>()
        val creations = mutableListOf<CreateFamilySpaceDto>()
        val recipients = mutableListOf<String>()
        val actions = mutableListOf<Pair<String, String>>()
        private fun <Value> result(value: Value, paged: Boolean = false): Response<EnvelopeDto<Value>> {
            calls += 1
            if (failure != 0) return Response.error(failure, """{"error":{"code":"SYNTHETIC","message":"Synthetic failure"}}""".toResponseBody("application/json".toMediaType()))
            return Response.success(EnvelopeDto(value, null, if (paged) pagination else null))
        }
        override suspend fun spaces(authorization: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<SpaceDto>>> { this.authorization = authorization; this.cursor = cursor; this.limit = limit; return result(listedSpaces ?: listOf(space), true) }
        override suspend fun space(authorization: String, spaceId: String) = result(space)
        override suspend fun ownershipOffers(authorization: String, spaceId: String, cursor: String?, limit: Int) = result(transfers, true)
        override suspend fun offerOwnership(authorization: String, spaceId: String, key: String, etag: String, body: CreateOwnershipOfferDto): Response<EnvelopeDto<OwnershipTransferDto>> {
            ownershipKeys.add(key); ownershipEtags.add(etag)
            return result(requireNotNull(transfer))
        }
        override suspend fun acceptOwnership(authorization: String, spaceId: String, identifier: String, etag: String, body: Map<String, String>) = ownershipResponse(OwnershipResponse.ACCEPT, etag)
        override suspend fun declineOwnership(authorization: String, spaceId: String, identifier: String, etag: String, body: Map<String, String>) = ownershipResponse(OwnershipResponse.DECLINE, etag)
        override suspend fun cancelOwnership(authorization: String, spaceId: String, identifier: String, etag: String, body: Map<String, String>) = ownershipResponse(OwnershipResponse.CANCEL, etag)
        private fun ownershipResponse(action: OwnershipResponse, etag: String): Response<EnvelopeDto<OwnershipTransferDto>> {
            ownershipResponses.add(action); ownershipEtags.add(etag)
            val status = when (action) { OwnershipResponse.ACCEPT -> "accepted"; OwnershipResponse.DECLINE -> "declined"; OwnershipResponse.CANCEL -> "cancelled" }
            return result(requireNotNull(transfer).copy(status = status, resolvedAt = "2026-09-23T10:01:00Z", version = "2"))
        }
        override suspend fun create(authorization: String, key: String, body: CreateFamilySpaceDto): Response<EnvelopeDto<SpaceDto>> { keys.add(key); creations.add(body); return result(space) }
        override suspend fun inbox(authorization: String, cursor: String?, limit: Int) = result(listOf(invitation), true)
        override suspend fun sent(authorization: String, spaceId: String, cursor: String?, limit: Int) = result(listOf(invitation), true)
        override suspend fun invite(authorization: String, spaceId: String, key: String, body: CreateSpaceInvitationDto): Response<EnvelopeDto<SpaceInvitationDto>> { keys.add(key); recipients.add(body.recipientAccountId); return result(invitation) }
        override suspend fun accept(authorization: String, invitationId: String, body: Map<String, String>): Response<EnvelopeDto<SpaceDto>> { actions.add("accept" to invitationId); return result(space.copy(role = "member")) }
        override suspend fun decline(authorization: String, invitationId: String, body: Map<String, String>): Response<EnvelopeDto<InvitationOutcomeDto>> { actions.add("decline" to invitationId); return result(outcome ?: InvitationOutcomeDto(invitationId, "declined")) }
        override suspend fun revoke(authorization: String, spaceId: String, invitationId: String, body: Map<String, String>): Response<EnvelopeDto<InvitationOutcomeDto>> { actions.add("revoke" to invitationId); return result(outcome ?: InvitationOutcomeDto(invitationId, "revoked")) }
        override suspend fun members(authorization: String, spaceId: String) = result(roster)
        override suspend fun removeMember(authorization: String, spaceId: String, accountId: String, key: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<MembershipOutcomeDto>> {
            membershipCommands.add(MembershipIntent(actorId, spaceId, accountId, MembershipAction.REMOVE, etag, key))
            return result(membershipOutcome ?: MembershipOutcomeDto(spaceId, accountId, "removed"))
        }
        override suspend fun leave(authorization: String, spaceId: String, key: String, etag: String, body: Map<String, String>): Response<EnvelopeDto<MembershipOutcomeDto>> {
            membershipCommands.add(MembershipIntent(actorId, spaceId, actorId, MembershipAction.LEAVE, etag, key))
            return result(membershipOutcome ?: MembershipOutcomeDto(spaceId, actorId, "removed"))
        }
    }
}