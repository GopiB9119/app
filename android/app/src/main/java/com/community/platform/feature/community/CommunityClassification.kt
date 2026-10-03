package com.community.platform.feature.community

import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.QueryMap
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/** A code from the shared vocabulary (GET /v1/taxonomy), as the server accepts it. */
val CODE_PATTERN = Regex("[a-z0-9]+(-[a-z0-9]+)*")
val TAXONOMY_DIMENSIONS = setOf("topic", "interest", "language", "place", "community_type", "audience", "activity", "content_kind")
private val REASON_DIMENSIONS = setOf("topic", "interest", "place", "language")

fun isCode(value: String) = value.length <= 64 && value.matches(CODE_PATTERN)

/** How long the vocabulary is kept before it is fetched again. */
const val TAXONOMY_TTL_MS = 60 * 60 * 1000L

/** English, then Telugu and Hindi machine drafts (DEC-023); a missing name falls back to English. */
data class TermNamesDto(val en: String, val te: String?, val hi: String?)

data class TermDto(val dimension: String, val code: String, val parent: String?, val sensitive: Boolean, val status: String, val names: TermNamesDto) {
    val active: Boolean get() = status == "active"
    /** The name in the app's [language], or English when that language has none. */
    fun name(language: String): String = when (language) { "te" -> names.te; "hi" -> names.hi; else -> null }?.takeIf(String::isNotBlank) ?: names.en
}

/** The shared vocabulary. A retired term keeps its name where it is used but cannot be chosen again. */
class Taxonomy(val terms: List<TermDto>) {
    private val byKey = terms.associateBy { it.dimension to it.code }
    fun term(dimension: String, code: String): TermDto? = byKey[dimension to code]
    /** A code the vocabulary does not know shows as itself, so nothing disappears. */
    fun name(dimension: String, code: String, language: String): String = term(dimension, code)?.name(language) ?: code
    fun choices(dimension: String): List<TermDto> = terms.filter { it.dimension == dimension && it.active }
    fun isTopic(code: String): Boolean = code in KnownTopics || term("topic", code) != null
}

/** One part of a page's classification: its field, the vocabulary it draws from and how many terms it may hold. */
enum class ClassificationPart(val field: String, val dimension: String, val limit: Int) {
    OTHER_TOPICS("other_topics", "topic", 2), INTERESTS("interests", "interest", 10), LANGUAGES("languages", "language", 5),
    PLACES("places", "place", 3), COMMUNITY_TYPES("community_types", "community_type", 2), AUDIENCES("audiences", "audience", 3),
    ACTIVITIES("activities", "activity", 4), CONTENT_KINDS("content_kinds", "content_kind", 4),
}

/** A page's terms beyond its main topic, in the owner's order. Null only from a server without classification. */
data class ClassificationDto(
    @SerializedName("other_topics") val otherTopics: List<String>? = null, val interests: List<String>? = null,
    val languages: List<String>? = null, val places: List<String>? = null,
    @SerializedName("community_types") val communityTypes: List<String>? = null, val audiences: List<String>? = null,
    val activities: List<String>? = null, @SerializedName("content_kinds") val contentKinds: List<String>? = null,
) {
    fun codes(part: ClassificationPart): List<String> = when (part) {
        ClassificationPart.OTHER_TOPICS -> otherTopics; ClassificationPart.INTERESTS -> interests; ClassificationPart.LANGUAGES -> languages
        ClassificationPart.PLACES -> places; ClassificationPart.COMMUNITY_TYPES -> communityTypes; ClassificationPart.AUDIENCES -> audiences
        ClassificationPart.ACTIVITIES -> activities; ClassificationPart.CONTENT_KINDS -> contentKinds
    }.orEmpty()
    val parts: Map<ClassificationPart, List<String>> get() = ClassificationPart.entries.associateWith(::codes)

    companion object {
        fun of(parts: Map<ClassificationPart, List<String>>) = ClassificationDto(
            parts[ClassificationPart.OTHER_TOPICS].orEmpty(), parts[ClassificationPart.INTERESTS].orEmpty(), parts[ClassificationPart.LANGUAGES].orEmpty(),
            parts[ClassificationPart.PLACES].orEmpty(), parts[ClassificationPart.COMMUNITY_TYPES].orEmpty(), parts[ClassificationPart.AUDIENCES].orEmpty(),
            parts[ClassificationPart.ACTIVITIES].orEmpty(), parts[ClassificationPart.CONTENT_KINDS].orEmpty(),
        )
    }
}

data class ClassifyPageDto(val classification: ClassificationDto)

/** One kind of private interest a person chooses, and how many they may choose. */
enum class InterestPart(val field: String, val dimension: String, val limit: Int) {
    TOPICS("topics", "topic", 10), INTERESTS("interests", "interest", 30), LANGUAGES("languages", "language", 5), PLACES("places", "place", 5),
}

/** What the signed-in person chose. Private: shown to nobody else and used only to suggest pages to them. */
data class InterestsDto(val topics: List<String>, val interests: List<String>, val languages: List<String>, val places: List<String>, val etag: String) {
    fun codes(part: InterestPart): List<String> = when (part) {
        InterestPart.TOPICS -> topics; InterestPart.INTERESTS -> interests; InterestPart.LANGUAGES -> languages; InterestPart.PLACES -> places
    }
    val parts: Map<InterestPart, List<String>> get() = InterestPart.entries.associateWith(::codes)
}

data class SetInterestsDto(val topics: List<String>, val interests: List<String>, val languages: List<String>, val places: List<String>) {
    companion object {
        fun of(parts: Map<InterestPart, List<String>>) = SetInterestsDto(
            parts[InterestPart.TOPICS].orEmpty(), parts[InterestPart.INTERESTS].orEmpty(), parts[InterestPart.LANGUAGES].orEmpty(), parts[InterestPart.PLACES].orEmpty(),
        )
    }
}

/** One of the person's own choices that a suggested page matched. */
data class ReasonDto(val dimension: String, val code: String)
data class SuggestedPageDto(val page: PageDto, val reasons: List<ReasonDto>)
data class SuggestionsDto(val ranking: String, val items: List<SuggestedPageDto>)

/** A public post matching the person's own topics or interests, with what matched (never empty). */
data class InterestPostDto(val post: PostDto, val reasons: List<ReasonDto>)
private val POST_REASON_DIMENSIONS = setOf("topic", "interest")

/** Discover's filters beyond the search text and topic; each narrows the pages to those tagged with the term. */
data class PageFilters(
    val interest: String? = null, val language: String? = null, val place: String? = null, val communityType: String? = null,
    val audience: String? = null, val activity: String? = null, val contentKind: String? = null,
) {
    fun get(dimension: String): String? = when (dimension) {
        "interest" -> interest; "language" -> language; "place" -> place; "community_type" -> communityType
        "audience" -> audience; "activity" -> activity; "content_kind" -> contentKind; else -> null
    }
    fun with(dimension: String, code: String?): PageFilters = when (dimension) {
        "interest" -> copy(interest = code); "language" -> copy(language = code); "place" -> copy(place = code); "community_type" -> copy(communityType = code)
        "audience" -> copy(audience = code); "activity" -> copy(activity = code); "content_kind" -> copy(contentKind = code); else -> this
    }
    val query: Map<String, String> get() = FILTER_DIMENSIONS.mapNotNull { dimension -> get(dimension)?.let { dimension to it } }.toMap()
    val any: Boolean get() = query.isNotEmpty()

    companion object { val FILTER_DIMENSIONS = listOf("interest", "language", "place", "community_type", "audience", "activity", "content_kind") }
}

interface ClassificationApi {
    @GET("v1/taxonomy") suspend fun taxonomy(@Header("Authorization") authorization: String): Response<EnvelopeDto<List<TermDto>>>
    @GET("v1/discover/pages") suspend fun discover(@Header("Authorization") authorization: String, @Query("q") query: String?, @Query("topic") topic: String?,
        @QueryMap filters: Map<String, String>, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<PageDto>>>
    @PATCH("v1/pages/{id}") suspend fun classify(@Header("Authorization") authorization: String, @Path("id") pageId: String, @Header("If-Match") etag: String, @Body body: ClassifyPageDto): Response<EnvelopeDto<PageDto>>
    @GET("v1/me/interests") suspend fun interests(@Header("Authorization") authorization: String): Response<EnvelopeDto<InterestsDto>>
    @PUT("v1/me/interests") suspend fun setInterests(@Header("Authorization") authorization: String, @Header("If-Match") etag: String, @Body body: SetInterestsDto): Response<EnvelopeDto<InterestsDto>>
    @GET("v1/me/suggested-pages") suspend fun suggestions(@Header("Authorization") authorization: String, @Query("limit") limit: Int): Response<EnvelopeDto<SuggestionsDto>>
    @GET("v1/me/interest-posts") suspend fun interestPosts(@Header("Authorization") authorization: String, @Query("cursor") cursor: String?, @Query("limit") limit: Int = 20): Response<EnvelopeDto<List<InterestPostDto>>>
}

/** Stands in where no classification service is wired, such as a test of the older community screens: nothing is sent. */
object UnavailableClassificationApi : ClassificationApi {
    private fun none(): Nothing = throw IOException("Classification is not available.")
    override suspend fun taxonomy(authorization: String) = none()
    override suspend fun discover(authorization: String, query: String?, topic: String?, filters: Map<String, String>, cursor: String?, limit: Int) = none()
    override suspend fun classify(authorization: String, pageId: String, etag: String, body: ClassifyPageDto) = none()
    override suspend fun interests(authorization: String) = none()
    override suspend fun setInterests(authorization: String, etag: String, body: SetInterestsDto) = none()
    override suspend fun suggestions(authorization: String, limit: Int) = none()
    override suspend fun interestPosts(authorization: String, cursor: String?, limit: Int) = none()
}

@Singleton
class ClassificationRepository @Inject constructor(private val api: ClassificationApi, private val community: CommunityRepository) {
    private val accounts get() = community.accounts
    private val lock = Mutex()
    @Volatile private var cached: Taxonomy? = null

    val available: Boolean get() = api !== UnavailableClassificationApi

    private fun invalid(message: String = "The service returned an unexpected community response."): Nothing = throw IdentityFailure("INVALID_RESPONSE", message)

    private fun <Value> validate(block: () -> Value): Value =
        try { block() } catch (_error: IllegalArgumentException) { invalid() } catch (_error: NullPointerException) { invalid() }

    private fun codes(values: List<String>?, limit: Int): List<String> {
        val list = requireNotNull(values)
        require(list.size <= limit && list.distinct().size == list.size && list.all(::isCode))
        return list
    }

    fun taxonomy(terms: List<TermDto>): Taxonomy = validate {
        require(terms.size <= 2000 && terms.map { it.dimension to it.code }.distinct().size == terms.size)
        terms.forEach { term ->
            require(term.dimension in TAXONOMY_DIMENSIONS && isCode(term.code) && (term.parent == null || isCode(term.parent)))
            require(term.status == "active" || term.status == "retired")
            require(term.names.en.isNotBlank() && term.names.en.length <= 200 && (term.names.te?.length ?: 0) <= 200 && (term.names.hi?.length ?: 0) <= 200)
        }
        Taxonomy(terms)
    }

    /** The page's classification, checked against the limits of each part. */
    fun classification(value: ClassificationDto): ClassificationDto = validate {
        ClassificationPart.entries.forEach { part -> codes(value.codes(part), part.limit) }
        value
    }

    private fun page(value: PageDto): PageDto = community.page(value).also { page -> page.classification?.let(::classification) }

    fun interests(value: InterestsDto): InterestsDto = validate {
        InterestPart.entries.forEach { part -> codes(value.codes(part), part.limit) }
        require(value.etag.isNotBlank() && value.etag.length <= 200)
        value
    }

    fun suggestions(value: SuggestionsDto): SuggestionsDto = validate {
        require(value.ranking.isNotBlank() && value.items.size <= 20 && value.items.map { it.page.id }.distinct().size == value.items.size)
        value.items.forEach { item ->
            require(item.reasons.size <= 50 && item.reasons.all { it.dimension in REASON_DIMENSIONS && isCode(it.code) })
        }
        SuggestionsDto(value.ranking, value.items.map { item -> SuggestedPageDto(page(item.page).also { if (it.blocked || !it.writable) invalid() }, item.reasons) })
    }

    internal var clock: () -> Long = System::currentTimeMillis
    @Volatile private var loadedAt = 0L
    @Volatile private var loads = 0L

    /** The vocabulary, kept in memory for [TAXONOMY_TTL_MS]; [force] fetches it again. A failed fetch is tried again next time. */
    suspend fun taxonomy(accountId: String, force: Boolean = false): Taxonomy {
        fun fresh() = cached?.takeIf { !force && clock() - loadedAt < TAXONOMY_TTL_MS }
        fresh()?.let { return it }
        val asked = loads
        return lock.withLock {
            // A forced fetch that waited for another fetch finished meanwhile uses that one.
            (fresh() ?: cached?.takeIf { force && loads > asked }) ?: accounts.authorized(accountId) { taxonomy(accounts.result(api.taxonomy(it))) }.also { loaded ->
                KnownTopics.add(loaded.terms.filter { it.dimension == "topic" }.map(TermDto::code))
                cached = loaded
                loadedAt = clock()
                loads++
            }
        }
    }

    /** Fetches the vocabulary again once if a page names a topic it does not know; a page whose topic stays unknown is left out, not the whole list. */
    private suspend fun pages(accountId: String, items: List<PageDto>, check: (PageDto) -> PageDto): List<PageDto> {
        fun unknown(item: PageDto) = isCode(item.topic) && item.topic !in KnownTopics
        if (items.any(::unknown)) {
            try { taxonomy(accountId, force = true) } catch (error: CancellationException) { throw error } catch (_error: Exception) { }
        }
        return items.mapNotNull { item -> if (unknown(item)) null else check(item) }
    }

    /** Public pages matching the search text, topic and every filter given. A topic matches a page's main or other topics. */
    suspend fun discover(accountId: String, query: String, topic: String?, filters: PageFilters, cursor: String?): CommunityPage<PageDto> {
        val raw = accounts.authorized(accountId) { authorization ->
            val text = query.trim().replace(Regex("\\s+"), " ").take(80)
            val response = api.discover(authorization, text.ifEmpty { null }, topic, filters.query, cursor)
            val items = accounts.result(response)
            val pagination = response.body()?.pagination ?: invalid("The list is incomplete.")
            validate {
                require(items.size <= 100 && items.map(PageDto::id).distinct().size == items.size)
                require(pagination.hasMore == (pagination.nextCursor != null))
                pagination.nextCursor?.let { require(it.isNotBlank() && it.length <= 2048 && it != cursor && items.isNotEmpty()) }
            }
            CommunityPage(items, pagination.nextCursor)
        }
        return CommunityPage(pages(accountId, raw.items) { item ->
            page(item).also { page ->
                val topics = listOf(page.topic) + page.classification?.otherTopics.orEmpty()
                if (page.blocked || (topic != null && page.classification != null && topic !in topics)) invalid()
            }
        }, raw.nextCursor)
    }

    /** Replaces the page's classification, against the version as the owner reviewed it. Shown as saved only when the server returns it. */
    suspend fun classify(accountId: String, opened: PageDto, parts: Map<ClassificationPart, List<String>>): PageDto = accounts.authorized(accountId) { authorization ->
        if (!opened.canManage) invalid()
        val body = classification(ClassificationDto.of(parts))
        val result = page(accounts.result(api.classify(authorization, opened.id, opened.etag ?: invalid(), ClassifyPageDto(body))))
        val saved = result.classification
        if (result.id != opened.id || !result.canManage || saved == null || ClassificationPart.entries.any { saved.codes(it).toSet() != body.codes(it).toSet() }) {
            invalid("The change could not be confirmed.")
        }
        result
    }

    suspend fun interests(accountId: String): InterestsDto = accounts.authorized(accountId) { interests(accounts.result(api.interests(it))) }

    /** Replaces every choice at once against the version as loaded; a newer version is refused with 412 instead of overwritten. */
    suspend fun setInterests(accountId: String, opened: InterestsDto, parts: Map<InterestPart, List<String>>): InterestsDto = accounts.authorized(accountId) { authorization ->
        val body = SetInterestsDto.of(parts)
        validate { InterestPart.entries.forEach { part -> codes(parts[part].orEmpty(), part.limit) } }
        val result = interests(accounts.result(api.setInterests(authorization, opened.etag, body)))
        if (InterestPart.entries.any { result.codes(it).toSet() != parts[it].orEmpty().toSet() }) invalid("The change could not be confirmed.")
        result
    }

    suspend fun suggestions(accountId: String, limit: Int = 20): SuggestionsDto {
        val raw = accounts.authorized(accountId) { accounts.result(api.suggestions(it, limit.coerceIn(1, 20))) }
        val kept = pages(accountId, raw.items.map(SuggestedPageDto::page)) { it }.map(PageDto::id).toSet()
        return suggestions(raw.copy(items = raw.items.filter { it.page.id in kept }))
    }

    fun interestPost(value: InterestPostDto): InterestPostDto = validate {
        val reasons = requireNotNull(value.reasons)
        require(reasons.isNotEmpty() && reasons.size <= POST_TOPICS_LIMIT + POST_INTERESTS_LIMIT && reasons.distinct().size == reasons.size)
        require(reasons.all { it.dimension in POST_REASON_DIMENSIONS && isCode(it.code) })
        InterestPostDto(community.post(requireNotNull(value.post)).also { if (it.status != "published") invalid() }, reasons)
    }

    /**
     * Public posts matching your own topics and interests, newest first; empty when you chose none.
     * A cursor from before your interests changed is refused with 400 CURSOR_INVALID, and the list loads again from the start.
     */
    suspend fun interestPosts(accountId: String, cursor: String?, limit: Int = 20): CommunityPage<InterestPostDto> = accounts.authorized(accountId) { authorization ->
        val response = api.interestPosts(authorization, cursor, limit.coerceIn(1, 50))
        val items = accounts.result(response)
        val pagination = response.body()?.pagination ?: invalid("The list is incomplete.")
        validate {
            require(items.size <= 50 && items.map { requireNotNull(it.post).id }.distinct().size == items.size)
            require(pagination.hasMore == (pagination.nextCursor != null))
            pagination.nextCursor?.let { require(it.isNotBlank() && it.length <= 2048 && it != cursor && items.isNotEmpty()) }
        }
        CommunityPage(items.map(::interestPost), pagination.nextCursor)
    }
}
