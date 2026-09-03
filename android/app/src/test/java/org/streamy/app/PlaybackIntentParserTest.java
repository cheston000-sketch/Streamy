package org.streamy.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class PlaybackIntentParserTest {
    @Test
    public void parsesEpisodeContextFromStringExtras() {
        assertEquals(3, PlaybackIntentParser.parseInt("3", 0));
    }

    @Test
    public void parsesEpisodeContextFromNumericExtrasDuringFailover() {
        assertEquals(3, PlaybackIntentParser.parseInt(3, 0));
    }

    @Test
    public void parsesResumePositionFromBothExtraTypes() {
        assertEquals(123456L, PlaybackIntentParser.parseLong("123456", 0L));
        assertEquals(123456L, PlaybackIntentParser.parseLong(123456L, 0L));
    }

    @Test
    public void usesFallbackForMissingOrInvalidExtras() {
        assertEquals(7, PlaybackIntentParser.parseInt(null, 7));
        assertEquals(9L, PlaybackIntentParser.parseLong("invalid", 9L));
    }
}
