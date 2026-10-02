package com.community.platform.feature.messaging

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import com.community.platform.feature.identity.SessionKey
import java.security.GeneralSecurityException
import java.security.ProviderException
import java.util.Base64
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec

const val UNSENT_DATABASE = "community-unsent.db"
const val OUTBOX_KEY_ALIAS = "community.messaging.outbox.v1"

/** A chat message the server has not confirmed (DEC-021). [sealedBody] comes from a [MessageSealer], never plain text. */
@Entity(tableName = "unsent_messages", indices = [Index(value = ["account_id", "conversation_id"])])
data class UnsentMessage(
    @PrimaryKey @ColumnInfo(name = "request_key") val requestKey: String,
    @ColumnInfo(name = "account_id") val accountId: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "sealed_body") val sealedBody: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "attempts") val attempts: Int,
)

/** The messages kept on the phone. Every call blocks, so callers stay off the main thread. */
interface UnsentMessages {
    /** A request key that is already kept keeps its first body and attempt count. */
    fun put(message: UnsentMessage)
    fun inConversation(accountId: String, conversationId: String): List<UnsentMessage>
    fun ofAccount(accountId: String): List<UnsentMessage>
    fun remove(requestKey: String)
    /** Adds one background attempt; a message that is no longer kept stays removed. */
    fun countAttempt(requestKey: String)
    fun clear()
}

@Dao
interface RoomUnsentMessages : UnsentMessages {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    override fun put(message: UnsentMessage)

    @Query("SELECT * FROM unsent_messages WHERE account_id = :accountId AND conversation_id = :conversationId ORDER BY created_at, request_key")
    override fun inConversation(accountId: String, conversationId: String): List<UnsentMessage>

    @Query("SELECT * FROM unsent_messages WHERE account_id = :accountId ORDER BY created_at, request_key")
    override fun ofAccount(accountId: String): List<UnsentMessage>

    @Query("DELETE FROM unsent_messages WHERE request_key = :requestKey")
    override fun remove(requestKey: String)

    @Query("UPDATE unsent_messages SET attempts = attempts + 1 WHERE request_key = :requestKey")
    override fun countAttempt(requestKey: String)

    @Query("DELETE FROM unsent_messages")
    override fun clear()
}

@Database(entities = [UnsentMessage::class], version = 1, exportSchema = false)
abstract class UnsentDatabase : RoomDatabase() {
    abstract fun unsent(): RoomUnsentMessages
}

/** Seals a message body. [binding] names the kept message, so a sealed body cannot be opened as another message. */
interface MessageSealer {
    fun seal(plain: String, binding: String): String
    /** The body, or null when it can never be opened: the key was replaced or the sealed text was changed. */
    fun open(sealed: String, binding: String): String?
}

/** AES-GCM with a key held in the Android Keystore under its own alias ([OUTBOX_KEY_ALIAS]). */
class KeystoreMessageSealer(private val key: SessionKey) : MessageSealer {
    override fun seal(plain: String, binding: String): String {
        val sealed = try {
            encrypt(plain, binding)
        } catch (error: Exception) {
            if (error !is GeneralSecurityException && error !is ProviderException) throw error
            // A key that can no longer be used is replaced once; what it sealed could not be opened anyway.
            key.replace()
            encrypt(plain, binding)
        }
        return Base64.getEncoder().encodeToString(sealed)
    }

    override fun open(sealed: String, binding: String): String? {
        val bytes = try { Base64.getDecoder().decode(sealed) } catch (_error: IllegalArgumentException) { return null }
        if (bytes.size < IV_BYTES + TAG_BITS / 8) return null
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key.current(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
            cipher.updateAAD(binding.toByteArray(Charsets.UTF_8))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        } catch (_error: AEADBadTagException) {
            // Other key errors may pass, so they leave the message kept.
            null
        }
    }

    private fun encrypt(plain: String, binding: String): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key.current())
        cipher.updateAAD(binding.toByteArray(Charsets.UTF_8))
        return cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    }

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
