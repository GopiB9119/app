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

@Singleton
class KeystoreSessionStore @Inject constructor(
    @ApplicationContext context: Context,
    private val gson: Gson,
) : SessionStore {
    private val preferences = context.getSharedPreferences("identity_session", Context.MODE_PRIVATE)
    private val alias = "community.identity.session.v1"

    private fun key(): SecretKey {
        val keystore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keystore.getKey(alias, null)
        if (existing is SecretKey) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    override fun load(): Credentials? {
        val encoded = preferences.getString("sealed", null) ?: return null
        return try {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            if (bytes.size < 29) throw GeneralSecurityException("Invalid session ciphertext")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            val json = cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8)
            gson.fromJson(json, Credentials::class.java).also {
                if (it.token.isBlank() || it.accountId.isBlank()) throw GeneralSecurityException("Invalid session")
            }
        } catch (_error: GeneralSecurityException) {
            clear()
            null
        } catch (_error: IllegalArgumentException) {
            clear()
            null
        }
    }

    override fun save(credentials: Credentials) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(gson.toJson(credentials).toByteArray(Charsets.UTF_8))
        val value = Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
        if (!preferences.edit().putString("sealed", value).commit()) throw IOException("Could not save this session securely.")
    }

    override fun clear() {
        if (!preferences.edit().clear().commit()) throw IOException("Could not clear this session.")
    }
}