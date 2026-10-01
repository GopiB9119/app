package com.community.platform.feature.files

import com.google.gson.annotations.SerializedName
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.Locale

const val DOCUMENT_MAX_BYTES = 524288

data class DocumentDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
    @SerializedName("space_name") val spaceName: String,
    val status: String,
    val name: String?,
    @SerializedName("media_type") val mediaType: String?,
    @SerializedName("size_bytes") val sizeBytes: Int?,
    @SerializedName("line_count") val lineCount: Int?,
    val sha256: String?,
    @SerializedName("added_by_name") val addedByName: String,
    @SerializedName("added_at") val addedAt: String,
    @SerializedName("deleted_at") val deletedAt: String?,
    @SerializedName("can_delete") val canDelete: Boolean?,
    val content: String? = null,
)

data class DocumentBodyDto(val name: String, val content: String)
data class DocumentDeleteDto(
    val id: String,
    @SerializedName("space_id") val spaceId: String,
    val status: String,
    @SerializedName("deleted_at") val deletedAt: String,
)
data class DocumentPage(val items: List<DocumentDto>, val nextCursor: String?)
data class ChosenDocument(val name: String, val sizeBytes: Int, val content: String) {
    val body: DocumentBodyDto get() = DocumentBodyDto(name, content)
}
data class DocumentCreateIntent(val accountId: String, val spaceId: String, val key: String, val body: DocumentBodyDto)
data class DocumentDeleteIntent(val accountId: String, val documentId: String, val spaceId: String)
data class DocumentLineRange(val first: Int, val last: Int)

enum class DocumentProblem { NAME, TYPE, TOO_LARGE, UTF8, CONTROL, EMPTY, READ }
class DocumentFileFailure(val problem: DocumentProblem) : Exception()

fun documentMediaType(name: String): String? = when (name.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
    "txt" -> "text/plain".takeIf { name.length > 4 }
    "md", "markdown" -> "text/markdown".takeIf { name.substringBeforeLast('.').isNotEmpty() }
    "csv" -> "text/csv".takeIf { name.length > 4 }
    else -> null
}

fun documentNameProblem(name: String): DocumentProblem? = when {
    name.isBlank() || name.codePointCount(0, name.length) > 120 || '/' in name || '\\' in name || name.any(Character::isISOControl) -> DocumentProblem.NAME
    documentMediaType(name) == null -> DocumentProblem.TYPE
    else -> null
}

fun normalizedDocumentText(content: String): String = content.removePrefix("\uFEFF").replace("\r\n", "\n").replace('\r', '\n')

fun documentTextProblem(content: String): DocumentProblem? = when {
    content.toByteArray(Charsets.UTF_8).size > DOCUMENT_MAX_BYTES -> DocumentProblem.TOO_LARGE
    content.isBlank() -> DocumentProblem.EMPTY
    content.any { Character.isISOControl(it) && it != '\t' && it != '\n' } -> DocumentProblem.CONTROL
    else -> null
}

fun documentLines(content: String): List<String> = content.split('\n').let { lines ->
    if (lines.size > 1 && lines.last().isEmpty()) lines.dropLast(1) else lines
}

fun documentSha256(content: String): String = MessageDigest.getInstance("SHA-256")
    .digest(content.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

fun readDocumentFile(name: String, declaredSize: Long?, open: () -> InputStream): ChosenDocument {
    documentNameProblem(name)?.let { throw DocumentFileFailure(it) }
    if (declaredSize != null && declaredSize > DOCUMENT_MAX_BYTES) throw DocumentFileFailure(DocumentProblem.TOO_LARGE)
    val bytes = ByteArray(DOCUMENT_MAX_BYTES + 1)
    var count = 0
    open().use { input ->
        while (count < bytes.size) {
            val read = input.read(bytes, count, bytes.size - count)
            if (read < 0) break
            if (read == 0) {
                val next = input.read()
                if (next < 0) break
                bytes[count++] = next.toByte()
            } else count += read
        }
    }
    if (count > DOCUMENT_MAX_BYTES) throw DocumentFileFailure(DocumentProblem.TOO_LARGE)
    val decoded = try {
        Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes, 0, count)).toString()
    } catch (_error: CharacterCodingException) {
        throw DocumentFileFailure(DocumentProblem.UTF8)
    }
    val content = normalizedDocumentText(decoded)
    documentTextProblem(content)?.let { throw DocumentFileFailure(it) }
    return ChosenDocument(name, count, content)
}