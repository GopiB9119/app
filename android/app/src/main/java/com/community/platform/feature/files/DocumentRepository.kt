package com.community.platform.feature.files

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.IdentityFailure
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DocumentRepository @Inject constructor(private val api: DocumentApi, private val accounts: AccountRepository) {
    private fun invalid(): Nothing = throw IdentityFailure("INVALID_RESPONSE", "The service returned an unexpected document response.")
    private fun <Value> validate(block: () -> Value): Value = try { block() }
        catch (_error: IllegalArgumentException) { invalid() }
        catch (_error: NullPointerException) { invalid() }
        catch (_error: DateTimeException) { invalid() }

    private fun identifier(value: String) = require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    private fun text(value: String, limit: Int) = require(value.isNotBlank() && value.codePointCount(0, value.length) <= limit)

    fun document(value: DocumentDto, spaceId: String? = null, detail: Boolean = false): DocumentDto = validate {
        identifier(value.id); identifier(value.spaceId)
        require(spaceId == null || value.spaceId == spaceId)
        text(value.spaceName, 80); text(value.addedByName, 80)
        Instant.parse(value.addedAt)
        require(value.canDelete != null)
        when (value.status) {
            "active" -> {
                val name = requireNotNull(value.name)
                require(documentNameProblem(name) == null && value.mediaType == documentMediaType(name))
                val size = requireNotNull(value.sizeBytes)
                val lines = requireNotNull(value.lineCount)
                require(size in 1..DOCUMENT_MAX_BYTES && lines in 1..(size + 1))
                require(value.sha256 != null && Regex("[a-f0-9]{64}").matches(value.sha256))
                require(value.deletedAt == null)
                if (detail) {
                    val content = requireNotNull(value.content)
                    require(content == normalizedDocumentText(content) && documentTextProblem(content) == null)
                    require(content.toByteArray(Charsets.UTF_8).size == size && documentSha256(content) == value.sha256)
                    require(documentLines(content).size == lines)
                } else require(value.content == null)
            }
            "deleted" -> {
                require(value.name == null && value.mediaType == null && value.sizeBytes == null && value.lineCount == null && value.sha256 == null)
                require(value.canDelete == false && value.content == null)
                require(Instant.parse(requireNotNull(value.deletedAt)) >= Instant.parse(value.addedAt))
            }
            else -> invalid()
        }
        value
    }

    suspend fun list(accountId: String, spaceId: String, cursor: String?, seenIds: Set<String> = emptySet(),
        seenCursors: Set<String> = emptySet()): DocumentPage = accounts.authorized(accountId) { authorization ->
        val response = api.list(authorization, spaceId, cursor)
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid()
        validate {
            require(items.size <= 50 && items.map { it.id }.distinct().size == items.size)
            require(items.none { it.id in seenIds })
            require(pagination.hasMore == (pagination.nextCursor != null))
            pagination.nextCursor?.let { require(it.isNotBlank() && it.length <= 2048 && it != cursor && it !in seenCursors && items.isNotEmpty()) }
        }
        DocumentPage(items.map { document(it, spaceId).also { item -> if (item.status != "active") invalid() } }, pagination.nextCursor)
    }

    suspend fun read(accountId: String, documentId: String, spaceId: String): DocumentDto = accounts.authorized(accountId) {
        document(accounts.result(api.read(it, documentId)), spaceId, detail = true).also { item -> if (item.id != documentId) invalid() }
    }

    suspend fun create(intent: DocumentCreateIntent): DocumentDto = accounts.authorized(intent.accountId) {
        require(documentNameProblem(intent.body.name) == null && documentTextProblem(intent.body.content) == null)
        require(intent.body.content == normalizedDocumentText(intent.body.content))
        val created = document(accounts.result(api.create(it, intent.spaceId, intent.key, intent.body)), intent.spaceId)
        if (created.status == "active" && (created.name != intent.body.name || created.sizeBytes != intent.body.content.toByteArray(Charsets.UTF_8).size ||
            created.lineCount != documentLines(intent.body.content).size || created.sha256 != documentSha256(intent.body.content))) invalid()
        created
    }

    suspend fun delete(intent: DocumentDeleteIntent): DocumentDeleteDto = accounts.authorized(intent.accountId) {
        val deleted = accounts.result(api.delete(it, intent.documentId, emptyMap()))
        validate {
            identifier(deleted.id); identifier(deleted.spaceId)
            require(deleted.id == intent.documentId && deleted.spaceId == intent.spaceId && deleted.status == "deleted")
            Instant.parse(deleted.deletedAt)
        }
        deleted
    }
}