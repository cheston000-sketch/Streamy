package org.streamy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PlaybackOptimizationPolicyTest {
    @Test
    public void missingOrUnrecognizedSettingsUseAdaptiveAuto() {
        assertEquals(PlaybackOptimizationPolicy.Mode.AUTO, PlaybackOptimizationPolicy.parseMode(null));
        assertEquals(PlaybackOptimizationPolicy.Mode.AUTO, PlaybackOptimizationPolicy.parseMode(""));
        assertEquals(PlaybackOptimizationPolicy.Mode.AUTO, PlaybackOptimizationPolicy.parseMode("unknown"));
    }

    @Test
    public void recognizesSavedModesWithoutDependingOnCapitalizationOrWhitespace() {
        assertEquals(PlaybackOptimizationPolicy.Mode.DATA_SAVER,
            PlaybackOptimizationPolicy.parseMode(" DATA-SAVER "));
        assertEquals(PlaybackOptimizationPolicy.Mode.ORIGINAL,
            PlaybackOptimizationPolicy.parseMode("Original"));
    }

    @Test
    public void standardModeLeavesLoadControlUntouched() {
        assertNull(PlaybackOptimizationPolicy.bufferingProfile(PlaybackOptimizationPolicy.Mode.ORIGINAL));
    }

    @Test
    public void optimizedProfilesKeepLegalThresholdsAndBoundedMemory() {
        for (PlaybackOptimizationPolicy.Mode mode : new PlaybackOptimizationPolicy.Mode[] {
            PlaybackOptimizationPolicy.Mode.AUTO, PlaybackOptimizationPolicy.Mode.DATA_SAVER
        }) {
            PlaybackOptimizationPolicy.BufferingProfile profile =
                PlaybackOptimizationPolicy.bufferingProfile(mode);
            assertTrue(profile.startBufferMs > 0);
            assertTrue(profile.rebufferMs > profile.startBufferMs);
            assertTrue(profile.minBufferMs >= profile.rebufferMs);
            assertTrue(profile.maxBufferMs >= profile.minBufferMs);
            assertTrue(profile.targetBytes > 0 && profile.targetBytes <= 64 * 1024 * 1024);
        }
        assertTrue(PlaybackOptimizationPolicy.RETAIN_BUFFER_AFTER_DISCARD_MS
            >= PlaybackOptimizationPolicy.QUALITY_INCREASE_BUFFER_MS);
        assertTrue(PlaybackOptimizationPolicy.BANDWIDTH_FRACTION > 0f
            && PlaybackOptimizationPolicy.BANDWIDTH_FRACTION < 1f);
    }

    @Test
    public void dataSaverDoesNotRequireALargerBufferThanAuto() {
        assertSame(PlaybackOptimizationPolicy.bufferingProfile(PlaybackOptimizationPolicy.Mode.AUTO),
            PlaybackOptimizationPolicy.bufferingProfile(PlaybackOptimizationPolicy.Mode.DATA_SAVER));
    }
}
