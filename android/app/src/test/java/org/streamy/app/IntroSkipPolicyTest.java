package org.streamy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class IntroSkipPolicyTest {
    @Test
    public void showsInsideEpisodeMarkerWindow() {
        assertTrue(IntroSkipPolicy.shouldShow(
            "profile:tv:123:s1:e2",
            45_000L,
            105_000L,
            60_000L,
            2_400_000L,
            false
        ));
    }

    @Test
    public void showsRecapMarkerAtEpisodeStart() {
        assertTrue(IntroSkipPolicy.shouldShow(
            "profile:tv:123:s1:e2",
            0L,
            110_000L,
            0L,
            2_400_000L,
            false
        ));
    }

    @Test
    public void doesNotShowForMovies() {
        assertFalse(IntroSkipPolicy.shouldShow("profile:movie:123", 0L, 90_000L, 15_000L, 7_200_000L, false));
    }

    @Test
    public void doesNotShowOutsideMarkerOrAfterDismissal() {
        assertFalse(IntroSkipPolicy.shouldShow("profile:tv:123:s1:e2", 45_000L, 105_000L, 44_999L, 2_400_000L, false));
        assertFalse(IntroSkipPolicy.shouldShow("profile:tv:123:s1:e2", 45_000L, 105_000L, 105_000L, 2_400_000L, false));
        assertFalse(IntroSkipPolicy.shouldShow("profile:tv:123:s1:e2", 45_000L, 105_000L, 60_000L, 2_400_000L, true));
    }

    @Test
    public void skipsToMarkerEndWithoutSeekingBackward() {
        assertEquals(105_000L, IntroSkipPolicy.resolveSeekPosition(60_000L, 105_000L, 2_400_000L));
        assertEquals(110_000L, IntroSkipPolicy.resolveSeekPosition(110_000L, 105_000L, 2_400_000L));
    }

    @Test
    public void clampsSkipNearEndOfShortContent() {
        assertEquals(79_000L, IntroSkipPolicy.resolveSeekPosition(10_000L, 90_000L, 80_000L));
    }

    @Test
    public void rejectsMissingOrUnsafeMarkers() {
        assertFalse(IntroSkipPolicy.isValidMarker(-1L, -1L, 2_400_000L));
        assertFalse(IntroSkipPolicy.isValidMarker(90_000L, 45_000L, 2_400_000L));
        assertFalse(IntroSkipPolicy.isValidMarker(0L, 70_000L, 80_000L));
        assertFalse(IntroSkipPolicy.isValidMarker(0L, 1_200_001L, 2_400_000L));
    }

    @Test
    public void detectsWhenMarkerHasPassed() {
        assertFalse(IntroSkipPolicy.hasPassed(105_000L, 104_999L));
        assertTrue(IntroSkipPolicy.hasPassed(105_000L, 105_000L));
    }
}
