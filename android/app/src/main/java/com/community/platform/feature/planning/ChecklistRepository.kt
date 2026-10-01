package com.community.platform.feature.planning

import com.community.platform.feature.identity.AccountRepository
import com.community.platform.feature.identity.EnvelopeDto
import com.community.platform.feature.identity.IdentityFailure
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class ChecklistItemDto(val id: String, val title: String, val checked: Boolean,
    @SerializedName("checked_at") val checkedAt: String?, @SerializedName("checked_by_account_id") val checkedByAccountId: String?)
data class ChecklistDto(
    @SerializedName("task_id") val taskId: String, @SerializedName("space_id") val spaceId: String,
    @SerializedName("task_title") val taskTitle: String, @SerializedName("task_status") val taskStatus: String,
    @SerializedName("task_version") val taskVersion: String,
    @SerializedName("can_manage") val canManage: Boolean, @SerializedName("can_check") val canCheck: Boolean,
    val items: List<ChecklistItemDto>, val etag: String,
)
data class ChecklistChangeDto(val action: String, @SerializedName("item_id") val itemId: String? = null, val title: String? = null, val checked: Boolean? = null)
data class ChecklistIntent(val accountId: String, val taskId: String, val spaceId: String, val etag: String, val key: String, val body: ChecklistChangeDto)

interface ChecklistApi {
    @GET("v1/tasks/{id}/checklist")
    suspend fun read(@Header("Authorization") authorization: String, @Path("id") taskId: String): Response<EnvelopeDto<ChecklistDto>>
    @POST("v1/tasks/{id}/checklist")
    suspend fun change(@Header("Authorization") authorization: String, @Path("id") taskId: String,
        @Header("If-Match") etag: String, @Header("Idempotency-Key") key: String, @Body body: ChecklistChangeDto): Response<EnvelopeDto<ChecklistDto>>
}

@Singleton
class ChecklistRepository @Inject constructor(private val api: ChecklistApi, private val accounts: AccountRepository) {
    private fun checked(response: Response<EnvelopeDto<ChecklistDto>>, taskId: String, spaceId: String): ChecklistDto {
        val result = accounts.result(response)
        try {
            require(result.taskId == taskId && result.spaceId == spaceId)
            require(result.taskTitle.isNotBlank() && result.taskTitle.codePointCount(0, result.taskTitle.length) <= 200)
            require(result.taskVersion.matches(Regex("[1-9][0-9]*")))
            require(result.taskStatus in setOf("open", "in_progress", "completed", "cancelled"))
            require(!result.canManage || result.canCheck)
            require(result.taskStatus !in setOf("completed", "cancelled") || !result.canManage && !result.canCheck)
            require(result.etag.matches(Regex("\"[a-f0-9]{64}\"")))
            require(result.items.size <= 50 && result.items.map { it.id }.distinct().size == result.items.size)
            result.items.forEach { item ->
                require(UUID.fromString(item.id).toString() == item.id)
                require(item.title.isNotBlank() && item.title.codePointCount(0, item.title.length) <= 200)
                require(item.checked == (item.checkedAt != null) && item.checked == (item.checkedByAccountId != null))
                item.checkedAt?.let(Instant::parse)
                item.checkedByAccountId?.let(UUID::fromString)
            }
        } catch (error: RuntimeException) {
            if (error is CancellationException) throw error
            throw IdentityFailure("INVALID_RESPONSE", "The checklist result could not be confirmed.")
        }
        return result
    }
    suspend fun read(accountId: String, taskId: String, spaceId: String): ChecklistDto = accounts.authorized(accountId) {
        checked(api.read(it, taskId), taskId, spaceId)
    }
    suspend fun change(intent: ChecklistIntent): ChecklistDto = accounts.authorized(intent.accountId) {
        checked(api.change(it, intent.taskId, intent.etag, intent.key, intent.body), intent.taskId, intent.spaceId)
    }
}