package org.streamy.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class PlaybackProgressPolicyTest {
    @Test
    public void failedSourceNearZeroKeepsExistingResumePoint() {
        assertEquals(
            PlaybackProgressPolicy.Action.KEEP_EXISTING,
            PlaybackProgressPolicy.evaluate(5_000L, 3_600_000L)
        );
    }

    @Test
    public void normalPlaybackPositionIsSaved() {
        assertEquals(
            PlaybackProgressPolicy.Action.SAVE,
            PlaybackProgressPolicy.evaluate(900_000L, 3_600_000L)
        );
    }

    @Test
    public void nearEndPlaybackIsCleared() {
        assertEquals(
            PlaybackProgressPolicy.Action.CLEAR,
            PlaybackProgressPolicy.evaluate(3_550_000L, 3_600_000L)
        );
    }

    @Test
    public void failoverUsesLatestKnownPosition() {
        assertEquals(930_000L, PlaybackProgressPolicy.resolveFailoverPosition(900_000L, 930_000L));
        assertEquals(900_000L, PlaybackProgressPolicy.resolveFailoverPosition(900_000L, 2_000L));
    }
}
