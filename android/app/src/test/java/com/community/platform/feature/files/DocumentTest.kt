package com.community.platform.feature.files

import com.community.platform.IdentityModule
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.community.platform.feature.identity.PaginationDto
import com.community.platform.feature.spaces.SpaceRepositoryTest
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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.ByteArrayInputStream
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class DocumentTest {
    private val fixture = SpaceRepositoryTest.Fixture()
    private val documentId = "6a3c6e31-8f8e-4d71-8d84-3f7c6c5e4d04"
    private val content = "<=>\nsecond line"
    private val document = DocumentDto(documentId, fixture.spaceId, "Morgan family", "active", "notes.md", "text/markdown",
        content.toByteArray().size, 2, documentSha256(content), "Sam", "2026-10-01T10:00:00Z", null, true)
    private val tombstone = document.copy(status = "deleted", name = null, mediaType = null, sizeBytes = null, lineCount = null,
        sha256 = null, deletedAt = "2026-10-01T11:00:00Z", canDelete = false)

    inner class FakeApi : DocumentApi {
        var items = listOf(document)
        var pagination = PaginationDto(null, false)
        var current = document.copy(content = content)
        var created = document
        var deleted = DocumentDeleteDto(documentId, fixture.spaceId, "deleted", "2026-10-01T11:00:00Z")
        var createFailure = 0
        var deleteFailure = 0
        var createCode = "SYNTHETIC"
        var listFailure = 0
        val creates = mutableListOf<Pair<String, DocumentBodyDto>>()
        val deletes = mutableListOf<String>()
        val cursors = mutableListOf<String?>()
        private fun <Value> failure(status: Int, code: String): Response<EnvelopeDto<Value>> = Response.error(status,
            """{"error":{"code":"$code","message":"Synthetic $code"}}""".toResponseBody("application/json".toMediaType()))
        override suspend fun list(authorization: String, spaceId: String, cursor: String?, limit: Int): Response<EnvelopeDto<List<DocumentDto>>> {
            cursors += cursor
            return if (listFailure != 0 && cursor != null) failure(listFailure, "CURSOR_EXPIRED") else Response.success(EnvelopeDto(items, null, pagination))
        }
        override suspend fun read(authorization: String, documentId: String) = Response.success(EnvelopeDto(current, null))
        override suspend fun create(authorization: String, spaceId: String, key: String, body: DocumentBodyDto): Response<EnvelopeDto<DocumentDto>> {
            creates += key to body
            return if (createFailure != 0) failure(createFailure, createCode) else Response.success(EnvelopeDto(created, null))
        }
        override suspend fun delete(authorization: String, documentId: String, body: Map<String, String>): Response<EnvelopeDto<DocumentDeleteDto>> {
            deletes += documentId
            return if (deleteFailure != 0) failure(deleteFailure, "DOCUMENT_DELETE_DENIED") else Response.success(EnvelopeDto(deleted, null))
        }
    }

    private val api = FakeApi()
    private val repository = DocumentRepository(api, fixture.accounts)
    private var model: DocumentViewModel? = null

    @Before fun setup() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun cleanup() { model?.bind(null, null); Dispatchers.resetMain() }
    private suspend fun idle(current: DocumentViewModel) = withTimeout(5000) { current.state.first { !it.busy } }
    private suspend fun ready(): DocumentViewModel {
        val current = DocumentViewModel(repository); model = current
        current.bind(fixture.accountId, fixture.spaceId, "Morgan family"); idle(current)
        return current
    }

    @Test fun rejectsInconsistentActiveAndDeletedFields() {
        val invalid = listOf(document.copy(name = null), document.copy(mediaType = "text/html"), document.copy(sizeBytes = 0),
            document.copy(lineCount = null), document.copy(sha256 = "A".repeat(64)), document.copy(canDelete = null),
            document.copy(deletedAt = "2026-10-01T11:00:00Z"), tombstone.copy(name = "notes.md"), tombstone.copy(canDelete = true),
            tombstone.copy(deletedAt = null), tombstone.copy(content = "removed"), document.copy(status = "ready"))
        for (item in invalid) assertThrows(IdentityFailure::class.java) { repository.document(item) }
        assertThrows(IdentityFailure::class.java) { repository.document(document, documentId) }
        assertEquals(document, repository.document(document, fixture.spaceId))
        assertEquals(tombstone, repository.document(tombstone))
    }

    @Test fun detailChecksTextSizeChecksumAndIdentity(): Unit = runBlocking {
        assertEquals(content, repository.read(fixture.accountId, documentId, fixture.spaceId).content)
        for (item in listOf(document, document.copy(content = "different"), document.copy(id = fixture.spaceId, content = content),
            document.copy(spaceId = documentId, content = content))) {
            api.current = item
            assertThrows(IdentityFailure::class.java) { runBlocking { repository.read(fixture.accountId, documentId, fixture.spaceId) } }
        }
    }

    @Test fun duplicateIdsWrongSpaceAndRepeatedCursorsAreRejected(): Unit = runBlocking {
        api.items = listOf(document, document)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.list(fixture.accountId, fixture.spaceId, null) } }
        api.items = listOf(document.copy(spaceId = documentId))
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.list(fixture.accountId, fixture.spaceId, null) } }
        api.items = listOf(document)
        api.pagination = PaginationDto("same", true)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.list(fixture.accountId, fixture.spaceId, "same") } }
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.list(fixture.accountId, fixture.spaceId, "next", seenCursors = setOf("same")) } }
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.list(fixture.accountId, fixture.spaceId, null, seenIds = setOf(documentId)) } }
        api.pagination = PaginationDto(null, true)
        assertThrows(IdentityFailure::class.java) { runBlocking { repository.list(fixture.accountId, fixture.spaceId, null) } }
    }

    @Test fun fileTypesNamesAndMetadataAreCheckedBeforeReading() {
        var opened = false
        for ((name, size, problem) in listOf(Triple("picture.png", 10L, DocumentProblem.TYPE), Triple("../notes.txt", 10L, DocumentProblem.NAME),
            Triple("folder\\notes.csv", 10L, DocumentProblem.NAME), Triple("x".repeat(121) + ".txt", 10L, DocumentProblem.NAME),
            Triple("notes.txt", 524289L, DocumentProblem.TOO_LARGE))) {
            val failure = assertThrows(DocumentFileFailure::class.java) { readDocumentFile(name, size) { opened = true; ByteArrayInputStream(byteArrayOf(65)) } }
            assertEquals(problem, failure.problem)
        }
        assertFalse(opened)
        for (name in listOf("NOTES.TXT", "notes.MD", "notes.markdown", "notes.CSV")) assertNull(documentNameProblem(name))
    }

    @Test fun strictUtf8RejectsMalformedUnmappableAndOverlongSequences() {
        for (bytes in listOf(byteArrayOf(0xC3.toByte(), 0x28), byteArrayOf(0xFF.toByte()), byteArrayOf(0xC0.toByte(), 0xAF.toByte()),
            byteArrayOf(0xED.toByte(), 0xA0.toByte(), 0x80.toByte()), byteArrayOf(0xF0.toByte(), 0x9F.toByte()))) {
            val failure = assertThrows(DocumentFileFailure::class.java) { readDocumentFile("notes.txt", null) { ByteArrayInputStream(bytes) } }
            assertEquals(DocumentProblem.UTF8, failure.problem)
        }
    }

    @Test fun boundedReadNormalizesBomAndLineEndingsWithoutChangingPlainText() {
        val source = "\uFEFF# <=>\r\nline\rtab\tend"
        val chosen = readDocumentFile("notes.md", null) { ByteArrayInputStream(source.toByteArray()) }
        assertEquals("# <=>\nline\ntab\tend", chosen.content)
        assertEquals(source.toByteArray().size, chosen.sizeBytes)
        val failure = assertThrows(DocumentFileFailure::class.java) { readDocumentFile("notes.txt", 1) { ByteArrayInputStream(ByteArray(524289) { 65 }) } }
        assertEquals(DocumentProblem.TOO_LARGE, failure.problem)
        assertEquals(524288, readDocumentFile("notes.txt", null) { ByteArrayInputStream(ByteArray(524288) { 65 }) }.sizeBytes)
        assertEquals(DocumentProblem.CONTROL, assertThrows(DocumentFileFailure::class.java) {
            readDocumentFile("notes.txt", null) { ByteArrayInputStream("a\u0000b".toByteArray()) }
        }.problem)
    }

    @Test fun lineCountExcludesOnlyTheFinalNewlineAndBlankFilesAreRejected() {
        assertEquals(listOf("first", "second"), documentLines("first\nsecond\n"))
        assertEquals(listOf("first", ""), documentLines("first\n\n"))
        val text = "first\nsecond\n"
        val detail = document.copy(content = text, sizeBytes = text.toByteArray().size, sha256 = documentSha256(text))
        assertEquals(detail, repository.document(detail, detail = true))
        assertThrows(IdentityFailure::class.java) { repository.document(detail.copy(lineCount = 3), detail = true) }
        assertEquals(DocumentProblem.EMPTY, documentTextProblem(" \n\t"))
        assertEquals(DocumentProblem.TYPE, documentNameProblem(".txt"))
    }

    @Test fun deletedCreateRetryAndDeleteOutcomeAreConfirmedPrecisely(): Unit = runBlocking {
        val intent = DocumentCreateIntent(fixture.accountId, fixture.spaceId, "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03", DocumentBodyDto("notes.md", content))
        api.created = tombstone
        assertEquals(tombstone, repository.create(intent))
        val deletion = DocumentDeleteIntent(fixture.accountId, documentId, fixture.spaceId)
        assertEquals("deleted", repository.delete(deletion).status)
        for (outcome in listOf(api.deleted.copy(id = fixture.spaceId), api.deleted.copy(spaceId = documentId), api.deleted.copy(status = "active"),
            api.deleted.copy(deletedAt = "yesterday"))) {
            api.deleted = outcome
            assertThrows(IdentityFailure::class.java) { runBlocking { repository.delete(deletion) } }
        }
    }

    @Test fun interceptedWireUsesBearerAndDoesNotHtmlEscapeAddBody() = runBlocking {
        val requests = mutableListOf<Request>()
        val bodies = mutableListOf<String>()
        val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
            val request = chain.request(); requests += request
            val buffer = Buffer(); request.body?.writeTo(buffer); bodies += buffer.readUtf8()
            val payload = when {
                request.url.encodedPath.endsWith("/delete") -> Gson().toJson(EnvelopeDto(api.deleted, null))
                request.method == "GET" && request.url.encodedPath.endsWith("/documents") -> Gson().toJson(EnvelopeDto(listOf(document), null, PaginationDto(null, false)))
                request.method == "GET" -> Gson().toJson(EnvelopeDto(document.copy(content = content), null))
                else -> Gson().toJson(EnvelopeDto(document, null))
            }
            okhttp3.Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("Synthetic")
                .body(payload.toResponseBody("application/json".toMediaType())).build()
        }.build()
        val wire = DocumentRepository(IdentityModule.documents(http, Gson()), fixture.accounts)
        val key = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03"
        wire.create(DocumentCreateIntent(fixture.accountId, fixture.spaceId, key, DocumentBodyDto("notes.md", content)))
        assertEquals(key, requests[0].header("Idempotency-Key"))
        assertEquals("Bearer ${fixture.token}", requests[0].header("Authorization"))
        assertTrue(bodies[0].contains("<=>"))
        assertFalse(bodies[0].contains("\\u003c"))
        wire.list(fixture.accountId, fixture.spaceId, "older")
        assertEquals("older", requests[1].url.queryParameter("cursor"))
        assertEquals("20", requests[1].url.queryParameter("limit"))
        wire.read(fixture.accountId, documentId, fixture.spaceId)
        wire.delete(DocumentDeleteIntent(fixture.accountId, documentId, fixture.spaceId))
        assertEquals("{}", bodies[3])
    }

    @Test fun documentResponseCapsDependOnEndpoint(): Unit = runBlocking {
        for ((path, cap) in listOf("/v1/documents/$documentId" to 1572864, "/v1/spaces/${fixture.spaceId}/documents" to 262144,
            "/v1/documents/$documentId/delete" to 65536)) {
            var size = cap
            val http = IdentityModule.http().newBuilder().addInterceptor { chain ->
                okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("Synthetic")
                    .body("x".repeat(size).toResponseBody("application/json".toMediaType())).build()
            }.build()
            val request = Request.Builder().url("https://offline.invalid$path").build()
            http.newCall(request).execute().use { assertEquals(cap.toLong(), it.body!!.contentLength()) }
            size = cap + 1
            assertThrows(IOException::class.java) { http.newCall(request).execute().close() }
        }
    }

    @Test fun uncertainAddLocksChoiceAndRetriesTheSameKeyAndBody() = runBlocking {
        val current = ready()
        current.choose(ChosenDocument("notes.md", content.toByteArray().size, content))
        api.createFailure = 503
        current.add(); idle(current)
        assertNotNull(current.state.value.pending)
        assertEquals(DocumentIssue.ADD_UNCERTAIN, current.state.value.issue)
        current.choose(ChosenDocument("other.txt", 5, "other"))
        current.chooseFile { throw AssertionError("A locked choice must not be read") }
        current.add()
        assertEquals("notes.md", current.state.value.chosen?.name)
        assertEquals(1, api.creates.size)
        api.createFailure = 0
        current.retry(); idle(current)
        assertEquals(api.creates[0], api.creates[1])
        assertEquals(DocumentBodyDto("notes.md", content), api.creates[1].second)
        assertNull(current.state.value.pending)
        assertNull(current.state.value.chosen)
        assertEquals(DocumentNotice.ADDED, current.state.value.notice)
    }

    @Test fun definiteAddErrorReleasesChoiceAndShowsServerMessage() = runBlocking {
        val current = ready()
        current.choose(ChosenDocument("notes.md", content.toByteArray().size, content))
        api.createFailure = 422; api.createCode = "DOCUMENT_TEXT_INVALID"
        current.add(); idle(current)
        assertNull(current.state.value.pending)
        assertEquals("Synthetic DOCUMENT_TEXT_INVALID", current.state.value.error)
        current.choose(ChosenDocument("different.md", content.toByteArray().size, content))
        api.created = document.copy(name = "different.md"); api.createFailure = 0
        current.add(); idle(current)
        assertNotEquals(api.creates[0].first, api.creates[1].first)
        assertEquals("different.md", api.creates[1].second.name)
    }

    @Test fun retryAfterDocumentWasDeletedShowsDeletedInsteadOfAddingAgain() = runBlocking {
        val current = ready()
        current.choose(ChosenDocument("notes.md", content.toByteArray().size, content))
        api.createFailure = 503
        current.add(); idle(current)
        api.createFailure = 0; api.created = tombstone
        current.retry(); idle(current)
        assertEquals(DocumentNotice.ALREADY_DELETED, current.state.value.notice)
        assertTrue(current.state.value.documents.isEmpty())
        assertNull(current.state.value.pending)
        assertEquals(api.creates[0], api.creates[1])
    }

    @Test fun deleteNeedsConfirmationAndRetainsExactDocumentForRetry() = runBlocking {
        val current = ready()
        current.open(documentId); idle(current)
        current.delete()
        assertTrue(api.deletes.isEmpty())
        current.askDelete(); current.keepDocument()
        assertFalse(current.state.value.confirmingDelete)
        api.deleteFailure = 503
        current.askDelete(); current.delete(); idle(current)
        assertNotNull(current.state.value.pendingDelete)
        assertEquals("notes.md", current.state.value.selected?.name)
        assertEquals(DocumentIssue.DELETE_UNCERTAIN, current.state.value.issue)
        current.closeViewer()
        assertEquals(documentId, current.state.value.viewingId)
        api.deleteFailure = 0
        current.retryDelete(); idle(current)
        assertEquals(listOf(documentId, documentId), api.deletes)
        assertEquals("deleted", current.state.value.selected?.status)
        assertNull(current.state.value.selected?.content)
        assertNull(current.state.value.pendingDelete)
        assertTrue(current.state.value.documents.isEmpty())
    }

    @Test fun definiteDeleteErrorReleasesAttemptWithoutHidingDocument() = runBlocking {
        val current = ready()
        current.open(documentId); idle(current)
        api.deleteFailure = 403
        current.askDelete(); current.delete(); idle(current)
        assertNull(current.state.value.pendingDelete)
        assertEquals(content, current.state.value.selected?.content)
        assertEquals("Synthetic DOCUMENT_DELETE_DENIED", current.state.value.error)
        current.closeViewer()
        assertNull(current.state.value.viewingId)
    }

    @Test fun accountChangeDiscardsLateCreateWithoutShowingPrivateData() = runBlocking {
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val delayed = object : DocumentApi by api {
            override suspend fun create(authorization: String, spaceId: String, key: String, body: DocumentBodyDto): Response<EnvelopeDto<DocumentDto>> {
                entered.complete(Unit); release.await(); return api.create(authorization, spaceId, key, body)
            }
        }
        val current = DocumentViewModel(DocumentRepository(delayed, fixture.accounts)); model = current
        current.bind(fixture.accountId, fixture.spaceId, "Morgan family"); idle(current)
        current.choose(ChosenDocument("notes.md", content.toByteArray().size, content)); current.add()
        withTimeout(5000) { entered.await() }
        current.bind(null, null); release.complete(Unit)
        assertEquals(DocumentsState(), current.state.value)
    }

    @Test fun expiredCursorReloadsTheListFromTheBeginning() = runBlocking {
        api.pagination = PaginationDto("older", true)
        val current = ready()
        val fresh = document.copy(id = "7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03")
        api.items = listOf(fresh); api.pagination = PaginationDto(null, false)
        api.listFailure = 410
        current.reload(more = true); idle(current)
        assertEquals(listOf(null, "older", null), api.cursors)
        assertEquals(listOf(fresh), current.state.value.documents)
        assertNull(current.state.value.error)
    }

    @Test fun viewerKeepsTheRequestedLineRange() = runBlocking {
        val current = ready()
        current.open(documentId, DocumentLineRange(2, 2)); idle(current)
        assertEquals(DocumentLineRange(2, 2), current.state.value.lineRange)
        assertEquals(content, current.state.value.selected?.content)
        current.closeViewer()
        current.open(documentId, DocumentLineRange(2, 3)); idle(current)
        assertNull(current.state.value.selected)
        assertEquals(DocumentIssue.RESPONSE, current.state.value.issue)
    }
}
