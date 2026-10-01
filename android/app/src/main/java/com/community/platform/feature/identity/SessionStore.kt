package com.community.platform.feature.identity

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.google.gson.Gson
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

interface SessionStore {
    fun load(): Credentials?
    fun save(credentials: Credentials)
    fun clear()
}

interface SessionKey {
    fun current(): SecretKey
    // Deletes the stored key, so the next current() creates a new one.
    fun replace()
}

class AndroidSessionKey(private val alias: String) : SessionKey {
    override fun current(): SecretKey = keystore { store ->
        val existing = store.getKey(alias, null)
        if (existing is SecretKey) return@keystore existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        generator.generateKey()
    }

    override fun replace() {
        keystore { it.deleteEntry(alias) }
    }

    // An unreadable Keystore is a key problem, never a lost connection.
    private fun <Value> keystore(action: (KeyStore) -> Value): Value = try {
        action(KeyStore.getInstance("AndroidKeyStore").apply { load(null) })
    } catch (error: IOException) {
        throw GeneralSecurityException("The Android Keystore could not be read.", error)
    }
}

class SessionSealer(private val key: SessionKey, private val gson: Gson) {
    fun seal(credentials: Credentials): ByteArray {
        val plain = gson.toJson(credentials).toByteArray(Charsets.UTF_8)
        return try {
            encrypt(plain)
        } catch (error: Exception) {
            if (!unusable(error)) throw error
            // A key that can no longer be used is replaced once, so signing in works again instead of failing until app data is cleared.
            try {
                key.replace()
                encrypt(plain)
            } catch (again: Exception) {
                if (unusable(again)) throw IdentityFailure("SESSION_STORAGE", "This device could not store your sign-in securely. Try again.")
                throw again
            }
        }
    }

    // Anything that cannot be opened returns null, which signs the person out; a key that cannot be used is replaced.
    fun open(sealed: ByteArray): Credentials? {
        if (sealed.size < 29) return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val json = try {
            cipher.init(Cipher.DECRYPT_MODE, key.current(), GCMParameterSpec(128, sealed.copyOfRange(0, 12)))
            cipher.doFinal(sealed.copyOfRange(12, sealed.size)).toString(Charsets.UTF_8)
        } catch (error: Exception) {
            if (!unusable(error)) throw error
            if (error !is AEADBadTagException) runCatching { key.replace() }
            return null
        }
        return try {
            gson.fromJson(json, Credentials::class.java)?.takeIf { it.token.isNotBlank() && it.accountId.isNotBlank() }
        } catch (_error: RuntimeException) {
            null
        }
    }

    private fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key.current())
        return cipher.iv + cipher.doFinal(plain)
    }

    private fun unusable(error: Exception) = error is GeneralSecurityException || error is ProviderException
}

@Singleton
class KeystoreSessionStore @Inject constructor(
    @ApplicationContext context: Context,
    gson: Gson,
) : SessionStore {
    private val preferences = context.getSharedPreferences("identity_session", Context.MODE_PRIVATE)
    private val sealer = SessionSealer(AndroidSessionKey("community.identity.session.v1"), gson)

    override fun load(): Credentials? {
        val encoded = preferences.getString("sealed", null) ?: return null
        val credentials = try { sealer.open(Base64.decode(encoded, Base64.NO_WRAP)) } catch (_error: IllegalArgumentException) { null }
        if (credentials == null) clear()
        return credentials
    }

    override fun save(credentials: Credentials) {
        val value = Base64.encodeToString(sealer.seal(credentials), Base64.NO_WRAP)
        if (!preferences.edit().putString("sealed", value).commit()) {
            throw IdentityFailure("SESSION_STORAGE", "This device could not store your sign-in. Try again.")
        }
    }

    override fun clear() {
        if (!preferences.edit().clear().commit()) throw IOException("Could not clear this session.")
    }
}