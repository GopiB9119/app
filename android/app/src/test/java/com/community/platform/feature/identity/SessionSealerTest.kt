package com.community.platform.feature.identity

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.ProviderException
import java.security.UnrecoverableKeyException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class SessionSealerTest {
    private val credentials = Credentials("synthetic-session-token-with-more-than-32-characters", "62f3da14-12e9-4575-9541-caf8b98e2dfd")

    // A software key that fails, when told to, the way a broken Android Keystore entry does.
    private class FakeKey(var failures: Int = 0, val failure: () -> Exception = { UnrecoverableKeyException("Key cannot be used") }) : SessionKey {
        var replaced = 0
        private var key: SecretKey = generate()
        override fun current(): SecretKey {
            if (failures > 0) {
                failures -= 1
                throw failure()
            }
            return key
        }
        override fun replace() {
            replaced += 1
            key = generate()
        }
        private fun generate() = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    }

    @Test fun sealedSessionsOpenAndTamperingFailsClosed() {
        val sealer = SessionSealer(FakeKey(), Gson())
        val sealed = sealer.seal(credentials)
        assertEquals(credentials, sealer.open(sealed))
        sealed[sealed.size - 1] = (sealed[sealed.size - 1].toInt() xor 1).toByte()
        assertNull(sealer.open(sealed))
        assertNull(sealer.open(ByteArray(10)))
    }

    @Test fun anUnusableKeyIsReplacedOnceSoSigningInWorksAgain() {
        val key = FakeKey(failures = 1)
        val sealer = SessionSealer(key, Gson())
        val sealed = sealer.seal(credentials)
        assertEquals(1, key.replaced)
        assertEquals(credentials, sealer.open(sealed))
    }

    @Test fun aKeystoreProviderErrorCountsAsAnUnusableKey() {
        val key = FakeKey(failures = 1, failure = { ProviderException("Keystore operation failed") })
        val sealer = SessionSealer(key, Gson())
        assertEquals(credentials, sealer.open(sealer.seal(credentials)))
        assertEquals(1, key.replaced)
    }

    @Test fun aKeyThatStaysUnusableIsReportedAsAStorageProblemNotAConnectionProblem() {
        val failure = assertThrows(IdentityFailure::class.java) { SessionSealer(FakeKey(failures = 2), Gson()).seal(credentials) }
        assertEquals("SESSION_STORAGE", failure.code)
    }

    @Test fun openingWithAnUnusableKeyReplacesItAndSignsOut() {
        val key = FakeKey()
        val sealer = SessionSealer(key, Gson())
        val sealed = sealer.seal(credentials)
        key.failures = 1
        assertNull(sealer.open(sealed))
        assertEquals(1, key.replaced)
        assertEquals(credentials, sealer.open(sealer.seal(credentials)))
    }
}
