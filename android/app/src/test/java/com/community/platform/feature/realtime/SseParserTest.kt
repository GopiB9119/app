package com.community.platform.feature.realtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SseParserTest {
    private val conversationId = "5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01"
    private val spaceId = "c2937183-70fb-4d7a-b0b6-b1bc9c499444"
    private val runId = "6d8e4f2a-1b3c-5d7e-9f0a-2b4c6d8e0f1a"

    private fun SseParser.events(vararg lines: String): List<LiveEvent> = lines.mapNotNull { feed(it) }

    @Test fun searchChangesDoNotRequireAConversationId() {
        for (reason in listOf("document", "task", "event", "space", "access")) {
            assertEquals(listOf(LiveEvent.Change("search", null, spaceId, reason)),
                SseParser().events("event: change", """data: {"kind":"search","space_id":"$spaceId","reason":"$reason"}""", ""))
        }
    }

    @Test fun agentChangeRetainsItsPrivateRunId() {
        assertEquals(listOf(LiveEvent.Change("agent", null, spaceId, "changed", runId)),
            SseParser().events("event: change", """data: {"kind":"agent","space_id":"$spaceId","run_id":"$runId","reason":"changed"}""", ""))
    }

    @Test fun framesSplitAcrossLinesDispatchOnlyOnTheBlankLine() {
        val parser = SseParser()
        assertNull(parser.feed("event: change"))
        assertNull(parser.feed("""data: {"kind":"conversation","conversation_id":"$conversationId","space_id":"$spaceId","reason":"message"}"""))
        assertEquals(LiveEvent.Change("conversation", conversationId, spaceId, "message"), parser.feed(""))
        // Without a space after the colon the value is the same.
        assertEquals(
            listOf(LiveEvent.Change("notifications", null, null, "delivered")),
            parser.events("event:change", """data:{"kind":"notifications","reason":"delivered"}""", ""),
        )
    }

    @Test fun backendFramesBecomeEvents() {
        val parser = SseParser()
        val events = parser.events(
            "retry: 5000", "",
            "event: ready", """data: {"heartbeat_seconds":15,"max_seconds":1800}""", "",
            ": keep-alive", "",
            "event: resync", "data: {}", "",
            "event: end", """data: {"reason":"time_limit"}""", "",
        )
        assertEquals(listOf(LiveEvent.Ready, LiveEvent.Resync, LiveEvent.End("time_limit")), events)
    }

    @Test fun commentsAndUnknownFieldsAreIgnored() {
        val parser = SseParser()
        val events = parser.events(
            ": keep-alive", ":", "",
            "id: 7", "event: end", ": comment inside a frame", "foo: bar", "nocolon", """data: {"reason":"signed_out"}""", "",
        )
        assertEquals(listOf(LiveEvent.End("signed_out")), events)
    }

    @Test fun multiLineDataIsJoinedWithLineBreaks() {
        val parser = SseParser()
        val events = parser.events("event: change", """data: {"kind":"notifications",""", """data:  "reason":"read"}""", "")
        assertEquals(listOf(LiveEvent.Change("notifications", null, null, "read")), events)
    }

    @Test fun unknownEventsAndUnnamedFramesAreIgnored() {
        val parser = SseParser()
        val events = parser.events(
            "event: presence", """data: {"kind":"conversation"}""", "",
            """data: {"kind":"notifications","reason":"read"}""", "",
            "event: ready", "", // a frame without data is never dispatched
            "event: end", """data: {"reason":"time_limit"}""", "",
        )
        assertEquals(listOf(LiveEvent.End("time_limit")), events)
    }

    @Test fun malformedFramesAreIgnoredAndTheParserRecovers() {
        val parser = SseParser()
        val bad = listOf(
            """{"kind":""", "not json", "[]", "\"text\"", """{"reason":"time_limit"} trailing""",
            """{kind:"notifications",reason:"read"}""", "",
        )
        for (payload in bad) assertEquals(payload, emptyList<LiveEvent>(), parser.events("event: change", "data: $payload", ""))
        val invalid = listOf(
            """{"kind":"conversation","reason":"message"}""",
            """{"kind":"conversation","conversation_id":"not-an-id","reason":"message"}""",
            """{"kind":"conversation","conversation_id":"$conversationId","space_id":7,"reason":"message"}""",
            """{"kind":"notifications"}""",
            """{"kind":"","reason":"read"}""",
            """{"kind":"notifications","reason":"${"r".repeat(65)}"}""",
            """{"kind":["notifications"],"reason":"read"}""",
        )
        for (payload in invalid) assertEquals(payload, emptyList<LiveEvent>(), parser.events("event: change", "data: $payload", ""))
        assertEquals(emptyList<LiveEvent>(), parser.events("event: end", "data: {}", ""))
        assertEquals(listOf(LiveEvent.Resync), parser.events("event: resync", "data: {}", ""))
    }

    @Test fun oversizedFramesAreDroppedWithoutBreakingTheNextOne() {
        val parser = SseParser()
        val huge = """{"kind":"notifications","reason":"read","padding":"${"x".repeat(20_000)}"}"""
        assertEquals(emptyList<LiveEvent>(), parser.events("event: change", "data: $huge", ""))
        assertEquals(listOf(LiveEvent.Resync), parser.events("event: resync", "data: {}", ""))
    }

    @Test fun eventTypeDoesNotLeakIntoTheNextFrameAndAByteOrderMarkIsSkipped() {
        val parser = SseParser()
        val events = parser.events(
            "\uFEFFevent: ready", "data: {}", "",
            """data: {"reason":"time_limit"}""", "",
        )
        assertEquals(listOf(LiveEvent.Ready), events)
        assertEquals(LiveEvent.Change("conversation", conversationId.uppercase(), null, "read"),
            parser.events("event: change", """data: {"kind":"conversation","conversation_id":"${conversationId.uppercase()}","space_id":null,"reason":"read"}""", "").single())
    }
}
