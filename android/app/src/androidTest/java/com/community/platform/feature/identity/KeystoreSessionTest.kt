package com.community.platform.feature.identity

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class KeystoreSessionTest {
    @Test fun sessionRoundTripIsEncryptedAndTamperFailsClosed() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = KeystoreSessionStore(context, Gson())
        store.clear()
        try {
            val credentials = Credentials("synthetic-session-for-keystore-verification", "synthetic-account")
            store.save(credentials)
            val preferences = context.getSharedPreferences("identity_session", Context.MODE_PRIVATE)
            val sealed = preferences.getString("sealed", "")!!
            assertFalse(sealed.contains(credentials.token))
            assertFalse(sealed.contains(credentials.accountId))
            assertEquals(credentials, KeystoreSessionStore(context, Gson()).load())
            preferences.edit().putString("sealed", "not-valid-ciphertext").commit()
            assertNull(KeystoreSessionStore(context, Gson()).load())
            assertNull(preferences.getString("sealed", null))
        } finally {
            store.clear()
        }
    }
}