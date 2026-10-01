package com.community.platform.feature.identity

import com.google.gson.annotations.SerializedName

internal val accountExportCategories = listOf("profile", "security", "spaces", "tasks", "reminders")

data class DeleteAccountDto(val password: String)
data class DeletionDto(val status: String, @SerializedName("purge_after") val purgeAfter: String)
data class CreateExportDto(val categories: List<String>)
data class AccountExportDto(
    val id: String,
    val status: String,
    val reason: String?,
    val categories: List<String>,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("completed_at") val completedAt: String?,
    @SerializedName("expires_at") val expiresAt: String?,
    @SerializedName("size_bytes") val sizeBytes: Long?,
    @SerializedName("requested_here") val requestedHere: Boolean,
) {
    val preparing: Boolean get() = status == "queued" || status == "building"
    val canCancel: Boolean get() = preparing || status == "ready"
    val canDownload: Boolean get() = status == "ready" && requestedHere
}

data class AccountDeletionNotice(val purgeAfter: String, val timezone: String)
data class AccountDataProblem(val code: String, val details: Map<String, String> = emptyMap()) {
    val ownedSpaces: List<String> get() = details["spaces"].orEmpty().split("\n").filter(String::isNotBlank)
}

data class AccountDataState(
    val accountId: String? = null,
    val timezone: String = "UTC",
    val categories: Set<String> = accountExportCategories.toSet(),
    val downloads: List<AccountExportDto> = emptyList(),
    val loaded: Boolean = false,
    val loading: Boolean = false,
    val busy: Boolean = false,
    val problem: AccountDataProblem? = null,
    val listProblem: AccountDataProblem? = null,
    val deletionOpen: Boolean = false,
    val deletionProblem: AccountDataProblem? = null,
    val deleted: AccountDeletionNotice? = null,
    val signInRequired: Boolean = false,
    val downloadSaved: Boolean = false,
)